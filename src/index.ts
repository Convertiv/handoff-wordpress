#!/usr/bin/env node
/**
 * Gutenberg Compiler
 * 
 * Transpiles Handoff components to WordPress Gutenberg blocks.
 * 
 * Usage:
 *   npx gutenberg-compile <component-name> [options]
 *   
 * Options:
 *   --api-url <url>    Handoff API base URL (default: http://localhost:4000)
 *   --output <dir>     Output directory for blocks (default: ./blocks)
 *   --all              Compile all available components
 *   --theme            Compile header/footer to theme templates
 *   --validate         Validate a component for breaking changes
 *   --validate-all     Validate all components for breaking changes
 * 
 * Configuration:
 *   Create a handoff-wp.config.json file in your project root to set defaults:
 *   {
 *     "apiUrl": "https://demo.handoff.com",
 *     "output": "./path/to/blocks",
 *     "themeDir": "./path/to/theme"
 *   }
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as prettier from 'prettier';

import { HandoffComponent, CompilerOptions, GeneratedBlock } from './types';

/**
 * Configuration file structure
 */
interface HandoffWpConfig {
  apiUrl?: string;
  output?: string;
  themeDir?: string;
  username?: string;
  password?: string;
}

/**
 * Auth credentials for HTTP requests
 */
interface AuthCredentials {
  username?: string;
  password?: string;
}

/**
 * Required config with defaults applied
 */
interface ResolvedConfig {
  apiUrl: string;
  output: string;
  themeDir: string;
  username?: string;
  password?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ResolvedConfig = {
  apiUrl: 'http://localhost:4000',
  output: './blocks',
  themeDir: './theme',
  username: undefined,
  password: undefined,
};

/**
 * Load configuration from handoff-wp.config.json if it exists
 */
const loadConfig = (): HandoffWpConfig => {
  const configPath = path.join(process.cwd(), 'handoff-wp.config.json');
  
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent) as HandoffWpConfig;
      console.log(`📄 Loaded config from ${configPath}`);
      return config;
    } catch (error) {
      console.warn(`⚠️  Failed to parse handoff-wp.config.json: ${error instanceof Error ? error.message : error}`);
      return {};
    }
  }
  
  return {};
};

/**
 * Merge configuration sources with priority: CLI > config file > defaults
 */
const getConfig = (): ResolvedConfig => {
  const fileConfig = loadConfig();
  
  return {
    apiUrl: fileConfig.apiUrl ?? DEFAULT_CONFIG.apiUrl,
    output: fileConfig.output ?? DEFAULT_CONFIG.output,
    themeDir: fileConfig.themeDir ?? DEFAULT_CONFIG.themeDir,
    username: fileConfig.username ?? DEFAULT_CONFIG.username,
    password: fileConfig.password ?? DEFAULT_CONFIG.password,
  };
};

/**
 * Build HTTP request options with optional basic auth
 */
const buildRequestOptions = (url: string, auth?: AuthCredentials): http.RequestOptions | https.RequestOptions => {
  const parsedUrl = new URL(url);
  const options: http.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {},
  };
  
  if (auth?.username && auth?.password) {
    const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    options.headers = {
      ...options.headers,
      'Authorization': `Basic ${credentials}`,
    };
  }
  
  return options;
};

// Load config at startup
const config = getConfig();
import {
  generateBlockJson,
  generateIndexJs,
  generateRenderPhp,
  generateEditorScss,
  generateStyleScss,
  generateReadme,
  toBlockName,
  generateHeaderPhp,
  generateFooterPhp,
  generateTemplatePartPhp
} from './generators';
import {
  loadManifest,
  saveManifest,
  validateComponent,
  updateManifest,
  formatValidationResult,
  ValidationResult
} from './validators';

// Load PHP plugin for Prettier (using require for compatibility)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const phpPlugin = require('@prettier/plugin-php');

/**
 * Format code with Prettier
 */
const formatCode = async (code: string, parser: 'babel' | 'json' | 'scss' | 'php'): Promise<string> => {
  try {
    const options: prettier.Options = {
      parser,
      singleQuote: true,
      tabWidth: 2,
      printWidth: 100,
      trailingComma: 'es5',
    };
    
    // Load PHP plugin for PHP files
    if (parser === 'php') {
      options.plugins = [phpPlugin];
      // PHP-specific options - cast to any for plugin-specific options
      (options as any).phpVersion = '8.0';
      (options as any).braceStyle = '1tbs';
    }
    
    return await prettier.format(code, options);
  } catch (error) {
    // If formatting fails, return original code
    console.warn(`   ⚠️  Prettier formatting failed for ${parser}, using unformatted code`);
    return code;
  }
};

const program = new Command();

/**
 * Download a file from a URL and save it to disk
 */
const downloadFile = async (url: string, destPath: string, auth?: AuthCredentials): Promise<boolean> => {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = buildRequestOptions(url, auth);
    
    protocol.get(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, auth).then(resolve);
          return;
        }
      }
      
      if (res.statusCode !== 200) {
        console.warn(`   ⚠️  Failed to download screenshot: HTTP ${res.statusCode}`);
        resolve(false);
        return;
      }
      
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(true);
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        console.warn(`   ⚠️  Failed to save screenshot: ${err.message}`);
        resolve(false);
      });
    }).on('error', (e) => {
      console.warn(`   ⚠️  Failed to download screenshot: ${e.message}`);
      resolve(false);
    });
  });
};

/**
 * Fetch component data from Handoff API
 */
const fetchComponent = async (apiUrl: string, componentName: string, auth?: AuthCredentials): Promise<HandoffComponent> => {
  const url = `${apiUrl}/api/component/${componentName}.json`;
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = buildRequestOptions(url, auth);
    
    protocol.get(options, (res) => {
      if (res.statusCode === 401) {
        reject(new Error(`Authentication failed: HTTP 401. Check your username and password.`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch component: HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const component = JSON.parse(data) as HandoffComponent;
          resolve(component);
        } catch (e) {
          reject(new Error(`Failed to parse component JSON: ${e}`));
        }
      });
    }).on('error', (e) => {
      reject(new Error(`Failed to fetch component: ${e.message}`));
    });
  });
};

/**
 * Generate all block files from a component
 * @param component - The Handoff component data
 * @param apiUrl - The base API URL for fetching screenshots
 */
const generateBlock = (component: HandoffComponent, apiUrl: string): GeneratedBlock => {
  const hasScreenshot = !!component.image;
  
  // Construct full screenshot URL if image path is available
  let screenshotUrl: string | undefined;
  if (component.image) {
    // Handle both absolute URLs and relative paths
    if (component.image.startsWith('http://') || component.image.startsWith('https://')) {
      screenshotUrl = component.image;
    } else {
      // Relative path - prepend API URL
      screenshotUrl = `${apiUrl}${component.image.startsWith('/') ? '' : '/'}${component.image}`;
    }
  }
  
  return {
    blockJson: generateBlockJson(component, hasScreenshot),
    indexJs: generateIndexJs(component),
    renderPhp: generateRenderPhp(component),
    editorScss: generateEditorScss(component),
    styleScss: generateStyleScss(component),
    readme: generateReadme(component),
    screenshotUrl
  };
};

/**
 * Write block files to output directory
 */
const writeBlockFiles = async (outputDir: string, componentId: string, block: GeneratedBlock, auth?: AuthCredentials): Promise<void> => {
  const blockName = toBlockName(componentId);
  const blockDir = path.join(outputDir, blockName);
  
  // Create block directory
  if (!fs.existsSync(blockDir)) {
    fs.mkdirSync(blockDir, { recursive: true });
  }
  
  // Format all code files with Prettier
  const formattedBlockJson = await formatCode(block.blockJson, 'json');
  const formattedIndexJs = await formatCode(block.indexJs, 'babel');
  const formattedEditorScss = await formatCode(block.editorScss, 'scss');
  const formattedStyleScss = await formatCode(block.styleScss, 'scss');
  const formattedRenderPhp = await formatCode(block.renderPhp, 'php');
  
  // Write files
  fs.writeFileSync(path.join(blockDir, 'block.json'), formattedBlockJson);
  fs.writeFileSync(path.join(blockDir, 'index.js'), formattedIndexJs);
  fs.writeFileSync(path.join(blockDir, 'render.php'), formattedRenderPhp);
  fs.writeFileSync(path.join(blockDir, 'editor.scss'), formattedEditorScss);
  fs.writeFileSync(path.join(blockDir, 'style.scss'), formattedStyleScss);
  fs.writeFileSync(path.join(blockDir, 'README.md'), block.readme);
  
  // Download screenshot if available
  let screenshotDownloaded = false;
  if (block.screenshotUrl) {
    const screenshotPath = path.join(blockDir, 'screenshot.png');
    console.log(`   📷 Downloading screenshot...`);
    screenshotDownloaded = await downloadFile(block.screenshotUrl, screenshotPath, auth);
  }
  
  console.log(`✅ Generated block: ${blockName}`);
  console.log(`   📁 ${blockDir}`);
  console.log(`   📄 block.json`);
  console.log(`   📄 index.js`);
  console.log(`   📄 render.php`);
  console.log(`   📄 editor.scss`);
  console.log(`   📄 style.scss`);
  console.log(`   📄 README.md`);
  if (screenshotDownloaded) {
    console.log(`   🖼️  screenshot.png`);
  }
};

/**
 * Main compilation function
 */
const compile = async (options: CompilerOptions): Promise<void> => {
  console.log(`\n🔧 Gutenberg Compiler`);
  console.log(`   API: ${options.apiUrl}`);
  console.log(`   Component: ${options.componentName}`);
  console.log(`   Output: ${options.outputDir}`);
  if (options.auth?.username) {
    console.log(`   Auth: ${options.auth.username}`);
  }
  console.log('');
  
  try {
    // Fetch component from API
    console.log(`📡 Fetching component data...`);
    const component = await fetchComponent(options.apiUrl, options.componentName, options.auth);
    console.log(`   Found: ${component.title} (${component.id})\n`);
    
    // Generate block files
    console.log(`⚙️  Generating Gutenberg block...`);
    const block = generateBlock(component, options.apiUrl);
    
    // Write files (with Prettier formatting)
    await writeBlockFiles(options.outputDir, component.id, block, options.auth);
    
    console.log(`\n✨ Done! Don't forget to run 'npm run build' in your blocks plugin.\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
};

/**
 * Fetch list of all components from API
 */
const fetchComponentList = async (apiUrl: string, auth?: AuthCredentials): Promise<string[]> => {
  const url = `${apiUrl}/api/components.json`;
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = buildRequestOptions(url, auth);
    
    protocol.get(options, (res) => {
      if (res.statusCode === 401) {
        reject(new Error(`Authentication failed: HTTP 401. Check your username and password.`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch component list: HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // TODO: improve the typing of the component list
          // TODO: Can we pull the type from the api?
          const components = JSON.parse(data) as Array<HandoffComponent>;
          // filter out elements from the component list
          const filteredComponents = components.filter(c => c.type !== 'element');
          resolve(filteredComponents.map(c => c.id));
        } catch (e) {
          reject(new Error(`Failed to parse components list: ${e}`));
        }
      });
    }).on('error', (e) => {
      reject(new Error(`Failed to fetch components: ${e.message}`));
    });
  });
};

/**
 * Compile all components
 */
const compileAll = async (apiUrl: string, outputDir: string, auth?: AuthCredentials): Promise<void> => {
  console.log(`\n🔧 Gutenberg Compiler - Batch Mode`);
  console.log(`   API: ${apiUrl}`);
  console.log(`   Output: ${outputDir}`);
  if (auth?.username) {
    console.log(`   Auth: ${auth.username}`);
  }
  console.log('');
  
  try {
    console.log(`📡 Fetching component list...`);
    const componentIds = await fetchComponentList(apiUrl, auth);

    console.log(`   Found ${componentIds.length} components\n`);
    
    let success = 0;
    let failed = 0;
    
    for (const componentId of componentIds) {
      try {
        const component = await fetchComponent(apiUrl, componentId, auth);
        const block = generateBlock(component, apiUrl);
        await writeBlockFiles(outputDir, component.id, block, auth);
        success++;
      } catch (error) {
        console.error(`❌ Failed to compile ${componentId}: ${error instanceof Error ? error.message : error}`);
        failed++;
      }
    }
    
    console.log(`\n✨ Compilation complete!`);
    console.log(`   ✅ Success: ${success}`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed}`);
    }
    console.log(`\nDon't forget to run 'npm run build' in your blocks plugin.\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
};

/**
 * Compile theme templates (header, footer)
 */
const compileTheme = async (apiUrl: string, outputDir: string, auth?: AuthCredentials): Promise<void> => {
  console.log(`\n🎨 Theme Template Compiler`);
  console.log(`   API: ${apiUrl}`);
  console.log(`   Output: ${outputDir}`);
  if (auth?.username) {
    console.log(`   Auth: ${auth.username}`);
  }
  console.log('');
  
  try {
    // Compile header
    console.log(`📡 Fetching header component...`);
    try {
      const header = await fetchComponent(apiUrl, 'header', auth);
      console.log(`   Found: ${header.title}\n`);
      
      console.log(`⚙️  Generating header.php...`);
      const headerPhp = generateHeaderPhp(header);
      const formattedHeader = await formatCode(headerPhp, 'php');
      
      const headerPath = path.join(outputDir, 'header.php');
      fs.writeFileSync(headerPath, formattedHeader);
      console.log(`✅ Generated: ${headerPath}\n`);
    } catch (error) {
      console.warn(`⚠️  Header component not found or failed: ${error instanceof Error ? error.message : error}\n`);
    }
    
    // Compile footer
    console.log(`📡 Fetching footer component...`);
    try {
      const footer = await fetchComponent(apiUrl, 'footer', auth);
      console.log(`   Found: ${footer.title}\n`);
      
      console.log(`⚙️  Generating footer.php...`);
      const footerPhp = generateFooterPhp(footer);
      const formattedFooter = await formatCode(footerPhp, 'php');
      
      const footerPath = path.join(outputDir, 'footer.php');
      fs.writeFileSync(footerPath, formattedFooter);
      console.log(`✅ Generated: ${footerPath}\n`);
    } catch (error) {
      console.warn(`⚠️  Footer component not found or failed: ${error instanceof Error ? error.message : error}\n`);
    }
    
    // Also try header-compact and footer-compact if they exist
    // These go into template-parts/handoff/ subfolder
    const handoffTemplatesDir = path.join(outputDir, 'template-parts', 'handoff');
    if (!fs.existsSync(handoffTemplatesDir)) {
      fs.mkdirSync(handoffTemplatesDir, { recursive: true });
    }
    
    const generatedTemplates: string[] = [];
    
    for (const variant of ['header-compact', 'header-lander', 'footer-compact']) {
      try {
        const component = await fetchComponent(apiUrl, variant, auth);
        console.log(`📡 Found: ${component.title}`);
        
        const templateType = variant.replace(/-/g, '_');
        const isHeader = variant.startsWith('header');
        const php = isHeader 
          ? generateTemplatePartPhp(component, templateType)
          : generateTemplatePartPhp(component, templateType);
        const formattedPhp = await formatCode(php, 'php');
        
        const filePath = path.join(handoffTemplatesDir, `${variant}.php`);
        fs.writeFileSync(filePath, formattedPhp);
        console.log(`✅ Generated: ${filePath}\n`);
        generatedTemplates.push(`${variant}.php`);
      } catch {
        // Variant doesn't exist, skip silently
      }
    }
    
    // Generate README for the handoff templates folder
    if (generatedTemplates.length > 0) {
      const readmeContent = `# Handoff Template Parts

> ⚠️ **DO NOT EDIT THESE FILES DIRECTLY**
>
> These files are automatically generated by the Handoff WordPress compiler.
> Any changes will be overwritten on the next sync.

## Source

These templates were transpiled from the Handoff design system.

- **API URL:** ${apiUrl}
- **Generated:** ${new Date().toISOString()}

## Files

${generatedTemplates.map(f => `- \`${f}\``).join('\n')}

## Usage

Include these template parts in your theme using:

\`\`\`php
<?php get_template_part('template-parts/handoff/header-compact'); ?>
<?php get_template_part('template-parts/handoff/footer-compact'); ?>
\`\`\`

## Regenerating

To regenerate these files, run:

\`\`\`bash
npx handoff-wp --theme
\`\`\`

Or with a specific API URL:

\`\`\`bash
npx handoff-wp --theme --api-url ${apiUrl}
\`\`\`
`;
      const readmePath = path.join(handoffTemplatesDir, 'README.md');
      fs.writeFileSync(readmePath, readmeContent);
      console.log(`📝 Generated: ${readmePath}\n`);
    }
    
    // Download main.css and main.js assets
    console.log(`📡 Fetching theme assets...`);
    
    // Ensure assets directories exist
    const cssDir = path.join(outputDir, 'assets', 'css');
    const jsDir = path.join(outputDir, 'assets', 'js');
    
    if (!fs.existsSync(cssDir)) {
      fs.mkdirSync(cssDir, { recursive: true });
    }
    if (!fs.existsSync(jsDir)) {
      fs.mkdirSync(jsDir, { recursive: true });
    }
    
    // Download main.css
    const cssUrl = `${apiUrl}/api/component/main.css`;
    const cssPath = path.join(cssDir, 'main.css');
    console.log(`   Downloading main.css...`);
    const cssDownloaded = await downloadFile(cssUrl, cssPath, auth);
    if (cssDownloaded) {
      console.log(`✅ Downloaded: ${cssPath}`);
    } else {
      console.warn(`⚠️  Could not download main.css from ${cssUrl}`);
    }
    
    // Download main.js
    const jsUrl = `${apiUrl}/api/component/main.js`;
    const jsPath = path.join(jsDir, 'main.js');
    console.log(`   Downloading main.js...`);
    const jsDownloaded = await downloadFile(jsUrl, jsPath, auth);
    if (jsDownloaded) {
      console.log(`✅ Downloaded: ${jsPath}`);
    } else {
      console.warn(`⚠️  Could not download main.js from ${jsUrl}`);
    }
    
    console.log(`\n✨ Theme templates generated!\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
};

/**
 * Validate a single component for breaking property changes
 */
const validate = async (apiUrl: string, outputDir: string, componentName: string, auth?: AuthCredentials): Promise<ValidationResult> => {
  console.log(`\n🔍 Validating Component: ${componentName}`);
  console.log(`   API: ${apiUrl}`);
  console.log(`   Manifest: ${outputDir}\n`);
  
  // Fetch component
  const component = await fetchComponent(apiUrl, componentName, auth);
  
  // Load manifest
  const manifest = loadManifest(outputDir);
  
  // Validate
  const result = validateComponent(component, manifest);
  
  // Output result
  console.log(formatValidationResult(result));
  
  return result;
};

/**
 * Validate all components for breaking property changes
 */
const validateAll = async (apiUrl: string, outputDir: string, auth?: AuthCredentials): Promise<void> => {
  console.log(`\n🔍 Validating All Components`);
  console.log(`   API: ${apiUrl}`);
  console.log(`   Manifest: ${outputDir}\n`);
  
  try {
    // Fetch component list
    console.log(`📡 Fetching component list...`);
    const componentIds = await fetchComponentList(apiUrl, auth);
    console.log(`   Found ${componentIds.length} components\n`);
    
    // Load manifest
    const manifest = loadManifest(outputDir);
    
    let valid = 0;
    let invalid = 0;
    let newComponents = 0;
    const breakingChanges: ValidationResult[] = [];
    
    for (const componentId of componentIds) {
      try {
        const component = await fetchComponent(apiUrl, componentId, auth);
        const result = validateComponent(component, manifest);
        
        console.log(formatValidationResult(result));
        console.log('');
        
        if (result.isNew) {
          newComponents++;
        } else if (result.isValid) {
          valid++;
        } else {
          invalid++;
          breakingChanges.push(result);
        }
      } catch (error) {
        console.error(`❌ Failed to validate ${componentId}: ${error instanceof Error ? error.message : error}`);
      }
    }
    
    // Summary
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 Validation Summary`);
    console.log(`   ✅ Valid: ${valid}`);
    console.log(`   ❌ Breaking Changes: ${invalid}`);
    console.log(`   ✨ New Components: ${newComponents}`);
    
    if (breakingChanges.length > 0) {
      console.log(`\n⚠️  WARNING: ${breakingChanges.length} component(s) have breaking changes!`);
      console.log(`   These changes may break existing WordPress content.\n`);
      console.log(`   Components with breaking changes:`);
      for (const result of breakingChanges) {
        console.log(`   - ${result.componentTitle} (${result.componentId})`);
      }
      console.log(`\n   To proceed anyway, compile with --force flag.\n`);
      process.exit(1);
    } else {
      console.log(`\n✨ All components validated successfully!\n`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
};

/**
 * Update manifest after successful compilation
 */
const updateManifestForComponent = (outputDir: string, component: HandoffComponent): void => {
  const manifest = loadManifest(outputDir);
  const updatedManifest = updateManifest(component, manifest);
  saveManifest(outputDir, updatedManifest);
};

// CLI setup
program
  .name('gutenberg-compile')
  .description('Transpile Handoff components to WordPress Gutenberg blocks and theme templates')
  .version('1.0.0');

/**
 * Initialize a new config file
 */
const initConfig = (opts: {
  apiUrl?: string;
  output?: string;
  themeDir?: string;
  username?: string;
  password?: string;
  force?: boolean;
}): void => {
  const configPath = path.join(process.cwd(), 'handoff-wp.config.json');
  
  // Check if config already exists
  if (fs.existsSync(configPath) && !opts.force) {
    console.log(`\n⚠️  Config file already exists: ${configPath}`);
    console.log(`   Use --force to overwrite.\n`);
    process.exit(1);
  }
  
  const newConfig: HandoffWpConfig = {
    apiUrl: opts.apiUrl ?? 'https://your-handoff-site.com',
    output: opts.output ?? './demo/plugin/blocks',
    themeDir: opts.themeDir ?? './demo/theme',
    username: opts.username ?? '',
    password: opts.password ?? '',
  };
  
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
  
  console.log(`\n✅ Created config file: ${configPath}`);
  console.log(`\n📄 Configuration:`);
  console.log(`   apiUrl:   ${newConfig.apiUrl}`);
  console.log(`   output:   ${newConfig.output}`);
  console.log(`   themeDir: ${newConfig.themeDir}`);
  if (newConfig.username) {
    console.log(`   username: ${newConfig.username}`);
    console.log(`   password: ****`);
  }
  console.log(`\n💡 Edit this file to configure your Handoff API settings.\n`);
};

// Init command
program
  .command('init')
  .description('Create a handoff-wp.config.json file in the current directory')
  .option('--api-url <url>', 'Handoff API base URL')
  .option('--output <dir>', 'Output directory for blocks')
  .option('--theme-dir <dir>', 'Theme directory for header/footer templates')
  .option('--username <username>', 'Basic auth username')
  .option('--password <password>', 'Basic auth password')
  .option('--force', 'Overwrite existing config file')
  .action((options, command) => {
    // Use optsWithGlobals to get options from both subcommand and parent
    const opts = command.optsWithGlobals();
    initConfig(opts);
  });

// Default command for blocks
program
  .argument('[component]', 'Component name to compile or validate')
  .option('-a, --api-url <url>', `Handoff API base URL (default: ${config.apiUrl})`)
  .option('-o, --output <dir>', `Output directory for blocks (default: ${config.output})`)
  .option('--all', 'Compile all available components')
  .option('--theme', 'Compile theme templates (header, footer) to theme directory')
  .option('-t, --theme-dir <dir>', `Theme directory for header/footer templates (default: ${config.themeDir})`)
  .option('-u, --username <username>', 'Basic auth username for Handoff API')
  .option('-p, --password <password>', 'Basic auth password for Handoff API')
  .option('--validate', 'Validate a component for breaking property changes')
  .option('--validate-all', 'Validate all components for breaking property changes')
  .option('--force', 'Force compilation even with breaking changes')
  .action(async (componentName: string | undefined, opts: { 
    apiUrl?: string; 
    output?: string; 
    all?: boolean; 
    theme?: boolean;
    themeDir?: string;
    username?: string;
    password?: string;
    validate?: boolean;
    validateAll?: boolean;
    force?: boolean;
  }) => {
    // Merge CLI options with config (CLI takes precedence)
    const apiUrl = opts.apiUrl ?? config.apiUrl;
    const output = opts.output ?? config.output;
    const themeDir = opts.themeDir ?? config.themeDir;
    const auth: AuthCredentials = {
      username: opts.username ?? config.username,
      password: opts.password ?? config.password,
    };
    
    // Validation commands
    if (opts.validateAll) {
      await validateAll(apiUrl, output, auth);
      return;
    }
    
    if (opts.validate && componentName) {
      const result = await validate(apiUrl, output, componentName, auth);
      if (!result.isValid && !opts.force) {
        console.log(`\n⚠️  Component has breaking changes. Use --force to compile anyway.\n`);
        process.exit(1);
      }
      return;
    }
    
    // Compilation commands
    if (opts.theme) {
      await compileTheme(apiUrl, themeDir, auth);
    } else if (opts.all) {
      // Validate all first unless forced
      if (!opts.force) {
        console.log(`\n🔍 Pre-compilation validation...\n`);
        try {
          await validateAll(apiUrl, output, auth);
        } catch {
          // validateAll exits with code 1 on breaking changes
          return;
        }
      }
      await compileAll(apiUrl, output, auth);
      
      // Update manifest after successful compilation
      console.log(`\n📝 Updating property manifest...`);
      const componentIds = await fetchComponentList(apiUrl, auth);
      for (const componentId of componentIds) {
        try {
          const component = await fetchComponent(apiUrl, componentId, auth);
          updateManifestForComponent(output, component);
        } catch {
          // Skip failed components
        }
      }
      console.log(`   ✅ Manifest updated\n`);
    } else if (componentName) {
      // Validate single component first unless forced
      if (!opts.force) {
        const result = await validate(apiUrl, output, componentName, auth);
        if (!result.isValid) {
          console.log(`\n⚠️  Component has breaking changes. Use --force to compile anyway.\n`);
          process.exit(1);
        }
      }
      
      await compile({
        apiUrl: apiUrl,
        outputDir: output,
        componentName,
        auth
      });
      
      // Update manifest after successful compilation
      const component = await fetchComponent(apiUrl, componentName, auth);
      updateManifestForComponent(output, component);
      console.log(`   📝 Manifest updated\n`);
    } else {
      console.error('Error: Please specify a component name, use --all flag, --theme flag, or --validate-all flag');
      console.log('\nUsage:');
      console.log('  npx gutenberg-compile hero-article');
      console.log('  npx gutenberg-compile --all');
      console.log('  npx gutenberg-compile --theme');
      console.log('  npx gutenberg-compile --validate hero-article');
      console.log('  npx gutenberg-compile --validate-all');
      console.log('  npx gutenberg-compile --all --force');
      console.log('  npx gutenberg-compile hero-article --api-url http://localhost:4000 --output ./blocks');
      process.exit(1);
    }
  });

program.parse();

export { compile, generateBlock, fetchComponent };
