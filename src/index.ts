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

import { HandoffComponent, HandoffProperty, CompilerOptions, GeneratedBlock, HandoffWpConfig, DynamicArrayConfig, BreadcrumbsArrayConfig, TaxonomyArrayConfig, PaginationArrayConfig, FieldConfig, ImportConfig, ComponentImportConfig, FieldPreferences, isDynamicArrayConfig } from './types';

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
  import: ImportConfig;
  groups: Record<string, 'merged' | 'individual'>;
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
  import: { element: false },
  groups: {},
};

/**
 * Migrate legacy `dynamicArrays` config to the new `import` structure.
 * Groups "componentId.fieldName" entries under import.block[componentId][fieldName].
 */
const migrateDynamicArrays = (dynamicArrays: Record<string, DynamicArrayConfig>): ImportConfig => {
  const importConfig: ImportConfig = { element: false };
  const blockConfig: Record<string, ComponentImportConfig> = {};

  for (const [key, config] of Object.entries(dynamicArrays)) {
    if (!config.enabled) continue;
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) continue;
    const componentId = key.substring(0, dotIndex);
    const fieldName = key.substring(dotIndex + 1);

    if (!blockConfig[componentId] || typeof blockConfig[componentId] === 'boolean') {
      blockConfig[componentId] = {};
    }
    (blockConfig[componentId] as Record<string, DynamicArrayConfig>)[fieldName] = config;
  }

  if (Object.keys(blockConfig).length > 0) {
    importConfig.block = blockConfig;
  }

  return importConfig;
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

  let importConfig: ImportConfig;
  if (fileConfig.import) {
    importConfig = fileConfig.import;
  } else if (fileConfig.dynamicArrays) {
    console.warn(`⚠️  "dynamicArrays" config is deprecated. Migrate to "import" — see SPECIFICATION.md.`);
    importConfig = migrateDynamicArrays(fileConfig.dynamicArrays);
  } else {
    importConfig = DEFAULT_CONFIG.import;
  }
  
  return {
    apiUrl: fileConfig.apiUrl ?? DEFAULT_CONFIG.apiUrl,
    output: fileConfig.output ?? DEFAULT_CONFIG.output,
    themeDir: fileConfig.themeDir ?? DEFAULT_CONFIG.themeDir,
    username: fileConfig.username ?? DEFAULT_CONFIG.username,
    password: fileConfig.password ?? DEFAULT_CONFIG.password,
    import: importConfig,
    groups: fileConfig.groups ?? DEFAULT_CONFIG.groups,
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
  generateTemplatePartPhp,
  generateCategoriesPhp,
  generateSharedComponents,
  generateMigrationSchema,
  generateMergedBlock,
} from './generators';
import type { VariantInfo } from './generators';
import {
  loadManifest,
  saveManifest,
  validateComponent,
  updateManifest,
  formatValidationResult,
  ValidationResult,
  validateTemplateVariables,
  formatTemplateValidationResult
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
 * @param resolvedConfig - The resolved configuration including dynamic array settings
 */
const generateBlock = (component: HandoffComponent, apiUrl: string, resolvedConfig: ResolvedConfig): GeneratedBlock => {
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
  
  // Extract dynamic array configs for this component from the import config
  const componentDynamicArrays = {
    ...extractDynamicArrayConfigs(component.id, component.type, resolvedConfig.import)
  };
  
  // Auto-detect pagination for DynamicArrayConfig (posts) entries only
  for (const [fieldName, dynConfig] of Object.entries(componentDynamicArrays)) {
    if ('arrayType' in dynConfig) continue; // Skip specialised array types
    const prop = component.properties[fieldName];
    if (prop?.type === 'array' && prop.pagination?.type === 'pagination') {
      const paginationFieldRegex = new RegExp(
        `\\{\\{\\s*#field\\s+["']${fieldName}\\.pagination["']`
      );
      if (paginationFieldRegex.test(component.code)) {
        (dynConfig as DynamicArrayConfig).pagination = { propertyName: 'pagination' };
      }
    }
  }

  // Determine which richtext field (if any) uses InnerBlocks
  const fieldPrefs = extractFieldPreferences(component.id, component.type, resolvedConfig.import);
  const richtextFields = Object.entries(component.properties)
    .filter(([, prop]) => prop.type === 'richtext')
    .map(([key]) => key);

  // Check explicit config overrides first
  const explicitInnerBlocks = Object.entries(fieldPrefs)
    .filter(([, prefs]) => prefs.innerBlocks === true)
    .map(([key]) => key);

  let innerBlocksField: string | null;
  if (explicitInnerBlocks.length > 1) {
    throw new Error(
      `Component "${component.id}": only one richtext field per block can use InnerBlocks, ` +
      `but ${explicitInnerBlocks.length} are marked: ${explicitInnerBlocks.join(', ')}`
    );
  } else if (explicitInnerBlocks.length === 1) {
    const field = explicitInnerBlocks[0];
    const prop = component.properties[field];
    if (!prop || prop.type !== 'richtext') {
      throw new Error(
        `Component "${component.id}": field "${field}" is marked as innerBlocks but is not a richtext field`
      );
    }
    innerBlocksField = field;
  } else if (richtextFields.length === 1) {
    innerBlocksField = richtextFields[0];
  } else {
    innerBlocksField = null;
  }
  
  return {
    blockJson: generateBlockJson(component, hasScreenshot, apiUrl, componentDynamicArrays, innerBlocksField),
    indexJs: generateIndexJs(component, componentDynamicArrays, innerBlocksField),
    renderPhp: generateRenderPhp(component, componentDynamicArrays, innerBlocksField),
    editorScss: generateEditorScss(component),
    styleScss: generateStyleScss(component),
    readme: generateReadme(component),
    migrationSchema: generateMigrationSchema(component),
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
  fs.writeFileSync(path.join(blockDir, 'migration-schema.json'), block.migrationSchema);
  
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
  console.log(`   📄 migration-schema.json`);
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
    
    // Validate template variables before generating
    console.log(`🔍 Validating template variables...`);
    const templateValidation = validateTemplateVariables(component);
    console.log(formatTemplateValidationResult(templateValidation));
    console.log('');
    
    if (!templateValidation.isValid) {
      console.error(`\n❌ Template validation failed! Fix the undefined variables before compiling.\n`);
      process.exit(1);
    }
    
    // Generate block files
    console.log(`⚙️  Generating Gutenberg block...`);
    const block = generateBlock(component, options.apiUrl, config);
    
    // Write files (with Prettier formatting)
    await writeBlockFiles(options.outputDir, component.id, block, options.auth);
    
    console.log(`\n✨ Done! Don't forget to run 'npm run build' in your blocks plugin.\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
};

/**
 * Check whether a component should be imported based on the import config.
 */
const shouldImportComponent = (componentId: string, componentType: string, importConfig: ImportConfig): boolean => {
  const typeConfig = importConfig[componentType];

  // Type not listed in import config — default to true (import)
  if (typeConfig === undefined) return true;
  // Entire type disabled
  if (typeConfig === false) return false;
  // Entire type enabled with no per-component overrides
  if (typeConfig === true) return true;

  // Per-component lookup within the type object
  const componentConfig = typeConfig[componentId];
  // Not listed — import with defaults (type-object means "import all, override listed")
  if (componentConfig === undefined) return true;
  // Explicitly disabled
  if (componentConfig === false) return false;
  // Explicitly enabled or has field overrides
  return true;
};

/**
 * Get the raw per-field config object for a component from the import config.
 */
const getComponentFieldConfigs = (
  componentId: string,
  componentType: string,
  importConfig: ImportConfig
): Record<string, DynamicArrayConfig | FieldPreferences> => {
  const typeConfig = importConfig[componentType];
  if (!typeConfig || typeof typeConfig === 'boolean') return {};

  const componentConfig = typeConfig[componentId];
  if (!componentConfig || typeof componentConfig === 'boolean') return {};

  return componentConfig as Record<string, DynamicArrayConfig | FieldPreferences>;
};

/**
 * Extract dynamic array configs for a component from the import config.
 */
const extractDynamicArrayConfigs = (
  componentId: string,
  componentType: string,
  importConfig: ImportConfig
): Record<string, DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig> => {
  const allConfigs = getComponentFieldConfigs(componentId, componentType, importConfig);
  const result: Record<string, DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig> = {};
  for (const [key, config] of Object.entries(allConfigs)) {
    if (isDynamicArrayConfig(config)) {
      result[key] = config as DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig;
    }
  }
  return result;
};

/**
 * Extract field preferences for a component from the import config.
 */
const extractFieldPreferences = (
  componentId: string,
  componentType: string,
  importConfig: ImportConfig
): Record<string, FieldPreferences> => {
  const allConfigs = getComponentFieldConfigs(componentId, componentType, importConfig);
  const result: Record<string, FieldPreferences> = {};
  for (const [key, config] of Object.entries(allConfigs)) {
    if (!isDynamicArrayConfig(config)) {
      result[key] = config;
    }
  }
  return result;
};

/**
 * Fetch list of all components from API, filtered by import config
 */
const fetchComponentList = async (apiUrl: string, importConfig: ImportConfig, auth?: AuthCredentials): Promise<string[]> => {
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
          const components = JSON.parse(data) as Array<HandoffComponent>;
          const filtered = components.filter(c => shouldImportComponent(c.id, c.type, importConfig));
          resolve(filtered.map(c => c.id));
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
 * Fetch full list of all components from API (no import filter). Used to resolve group names.
 */
const fetchAllComponentsList = async (apiUrl: string, auth?: AuthCredentials): Promise<HandoffComponent[]> => {
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
          const components = JSON.parse(data) as Array<HandoffComponent>;
          resolve(components);
        } catch (e) {
          reject(new Error(`Failed to parse components list: ${e}`));
        }
      });
    }).on('error', (e) => reject(new Error(`Failed to fetch components: ${e.message}`)));
  });
};

/**
 * Compile all components
 */
/**
 * Build VariantInfo for a component (resolves dynamic arrays, InnerBlocks field, etc.)
 */
const buildVariantInfo = (component: HandoffComponent, resolvedConfig: ResolvedConfig): VariantInfo => {
  const componentDynamicArrays = {
    ...extractDynamicArrayConfigs(component.id, component.type, resolvedConfig.import),
  };

  for (const [fieldName, dynConfig] of Object.entries(componentDynamicArrays)) {
    if ('arrayType' in dynConfig) continue; // Skip specialised array types
    const prop = component.properties[fieldName];
    if (prop?.type === 'array' && prop.pagination?.type === 'pagination') {
      const paginationFieldRegex = new RegExp(
        `\\{\\{\\s*#field\\s+["']${fieldName}\\.pagination["']`
      );
      if (paginationFieldRegex.test(component.code)) {
        (dynConfig as DynamicArrayConfig).pagination = { propertyName: 'pagination' };
      }
    }
  }

  const fieldPrefs = extractFieldPreferences(component.id, component.type, resolvedConfig.import);
  const richtextFields = Object.entries(component.properties)
    .filter(([, prop]) => prop.type === 'richtext')
    .map(([key]) => key);

  const explicitInnerBlocks = Object.entries(fieldPrefs)
    .filter(([, prefs]) => prefs.innerBlocks === true)
    .map(([key]) => key);

  let innerBlocksField: string | null;
  if (explicitInnerBlocks.length > 1) {
    throw new Error(
      `Component "${component.id}": only one richtext field per block can use InnerBlocks, ` +
      `but ${explicitInnerBlocks.length} are marked: ${explicitInnerBlocks.join(', ')}`
    );
  } else if (explicitInnerBlocks.length === 1) {
    const field = explicitInnerBlocks[0];
    const prop = component.properties[field];
    if (!prop || prop.type !== 'richtext') {
      throw new Error(
        `Component "${component.id}": field "${field}" is marked as innerBlocks but is not a richtext field`
      );
    }
    innerBlocksField = field;
  } else if (richtextFields.length === 1) {
    innerBlocksField = richtextFields[0];
  } else {
    innerBlocksField = null;
  }

  return {
    component,
    fieldMap: {},
    innerBlocksField,
    dynamicArrayConfigs: componentDynamicArrays,
  };
};

/**
 * Compile a single merged group (e.g. Hero with multiple variants). Used by single-name CLI when name matches a group.
 */
const compileGroup = async (
  apiUrl: string,
  outputDir: string,
  groupSlug: string,
  groupComponents: HandoffComponent[],
  auth?: AuthCredentials,
): Promise<void> => {
  console.log(`\n🔀 Generating merged group block: ${groupSlug} (${groupComponents.length} variants)`);
  const variantInfos: VariantInfo[] = groupComponents.map((c) => buildVariantInfo(c, config));
  const mergedBlock = generateMergedBlock(groupSlug, groupComponents, variantInfos, apiUrl);
  const groupBlockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const groupDir = path.join(outputDir, groupBlockName);
  if (!fs.existsSync(groupDir)) {
    fs.mkdirSync(groupDir, { recursive: true });
  }

  const formattedBlockJson = await formatCode(mergedBlock.blockJson, 'json');
  const formattedIndexJs = await formatCode(mergedBlock.indexJs, 'babel');
  const formattedRenderPhp = await formatCode(mergedBlock.renderPhp, 'php');
  const formattedEditorScss = await formatCode(mergedBlock.editorScss, 'scss');
  const formattedStyleScss = await formatCode(mergedBlock.styleScss, 'scss');

  fs.writeFileSync(path.join(groupDir, 'block.json'), formattedBlockJson);
  fs.writeFileSync(path.join(groupDir, 'index.js'), formattedIndexJs);
  fs.writeFileSync(path.join(groupDir, 'render.php'), formattedRenderPhp);
  fs.writeFileSync(path.join(groupDir, 'editor.scss'), formattedEditorScss);
  fs.writeFileSync(path.join(groupDir, 'style.scss'), formattedStyleScss);
  fs.writeFileSync(path.join(groupDir, 'README.md'), mergedBlock.readme);
  fs.writeFileSync(path.join(groupDir, 'migration-schema.json'), mergedBlock.migrationSchema);

  if (mergedBlock.variationFiles) {
    const variationsDir = path.join(groupDir, 'variations');
    if (!fs.existsSync(variationsDir)) {
      fs.mkdirSync(variationsDir, { recursive: true });
    }
    for (const [variantId, content] of Object.entries(mergedBlock.variationFiles.js)) {
      const formatted = await formatCode(content, 'babel');
      fs.writeFileSync(path.join(variationsDir, `${variantId}.js`), formatted);
    }
    for (const [variantId, content] of Object.entries(mergedBlock.variationFiles.php)) {
      const formatted = await formatCode(content, 'php');
      fs.writeFileSync(path.join(variationsDir, `${variantId}.php`), formatted);
    }
  }

  console.log(`✅ Generated merged block: ${groupBlockName} (${groupComponents.length} variants)`);
  console.log(`   📁 ${groupDir}`);

  const pluginDir = path.dirname(outputDir);
  const categoriesPhp = generateCategoriesPhp(groupComponents);
  const formattedCategoriesPhp = await formatCode(categoriesPhp, 'php');
  const categoriesPath = path.join(pluginDir, 'handoff-categories.php');
  fs.writeFileSync(categoriesPath, formattedCategoriesPhp);
  console.log(`   📄 ${categoriesPath}`);
};

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
    const componentIds = await fetchComponentList(apiUrl, config.import, auth);

    console.log(`   Found ${componentIds.length} components\n`);
    
    let success = 0;
    let failed = 0;
    const compiledComponents: HandoffComponent[] = [];
    
    // Fetch all components first so we can partition by group
    const allComponents: HandoffComponent[] = [];
    for (const componentId of componentIds) {
      try {
        const component = await fetchComponent(apiUrl, componentId, auth);

        const templateValidation = validateTemplateVariables(component);
        if (!templateValidation.isValid) {
          console.log(formatTemplateValidationResult(templateValidation));
          console.error(`   ⚠️  Skipping ${componentId} due to template variable errors`);
          failed++;
          continue;
        }

        allComponents.push(component);
      } catch (error) {
        console.error(`❌ Failed to fetch ${componentId}: ${error instanceof Error ? error.message : error}`);
        failed++;
      }
    }

    // Partition components: merged groups vs individual
    // Build case-insensitive lookup: config may say "Hero" but API often returns "hero"
    const mergedGroupConfigKeyByLower = new Map<string, string>();
    for (const [key, mode] of Object.entries(config.groups)) {
      if (mode === 'merged') mergedGroupConfigKeyByLower.set(key.toLowerCase(), key);
    }
    const groupBuckets: Record<string, HandoffComponent[]> = {};
    const individualComponents: HandoffComponent[] = [];

    for (const component of allComponents) {
      const group = component.group;
      if (!group) {
        individualComponents.push(component);
        continue;
      }
      const configKey = mergedGroupConfigKeyByLower.get(group.toLowerCase());
      if (configKey) {
        if (!groupBuckets[configKey]) groupBuckets[configKey] = [];
        groupBuckets[configKey].push(component);
      } else {
        individualComponents.push(component);
      }
    }

    // Compile individual components (existing behavior)
    for (const component of individualComponents) {
      try {
        const block = generateBlock(component, apiUrl, config);
        await writeBlockFiles(outputDir, component.id, block, auth);
        compiledComponents.push(component);
        success++;
      } catch (error) {
        console.error(`❌ Failed to compile ${component.id}: ${error instanceof Error ? error.message : error}`);
        failed++;
      }
    }

    // Compile merged groups
    for (const [groupSlug, groupComponents] of Object.entries(groupBuckets)) {
      try {
        await compileGroup(apiUrl, outputDir, groupSlug, groupComponents, auth);
        compiledComponents.push(...groupComponents);
        success += groupComponents.length;
      } catch (error) {
        console.error(`❌ Failed to compile merged group ${groupSlug}: ${error instanceof Error ? error.message : error}`);
        failed += groupComponents.length;
      }
    }
    
    // Generate categories PHP file based on all compiled components
    if (compiledComponents.length > 0) {
      console.log(`\n⚙️  Generating block categories...`);
      const categoriesPhp = generateCategoriesPhp(compiledComponents);
      const formattedCategoriesPhp = await formatCode(categoriesPhp, 'php');
      
      // Write to the plugin directory (parent of blocks directory)
      const pluginDir = path.dirname(outputDir);
      const categoriesPath = path.join(pluginDir, 'handoff-categories.php');
      fs.writeFileSync(categoriesPath, formattedCategoriesPhp);
      console.log(`✅ Generated: ${categoriesPath}`);
    }
    
    // Generate shared components if any component has dynamic array configs
    const hasDynamicArraysInImport = Object.values(config.import).some(typeConfig => {
      if (typeof typeConfig !== 'object') return false;
      return Object.values(typeConfig).some(compConfig =>
        typeof compConfig === 'object' && Object.keys(compConfig).length > 0
      );
    });
    if (hasDynamicArraysInImport) {
      console.log(`\n⚙️  Generating shared components...`);
      const sharedComponents = generateSharedComponents();
      
      for (const [relativePath, content] of Object.entries(sharedComponents)) {
        const fullPath = path.join(outputDir, '..', relativePath);
        const dirPath = path.dirname(fullPath);
        
        // Ensure directory exists
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Format and write the file
        const formattedContent = await formatCode(content, 'babel');
        fs.writeFileSync(fullPath, formattedContent);
        console.log(`   📄 ${relativePath}`);
      }
      console.log(`✅ Shared components generated`);
    }
    
    console.log(`\n✨ Compilation complete!`);
    console.log(`   ✅ Success: ${success}`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed}`);
    }
    if (Object.keys(groupBuckets).length > 0) {
      console.log(`   🔀 Merged groups: ${Object.keys(groupBuckets).length}`);
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
const validateAll = async (apiUrl: string, outputDir: string, importConfig: ImportConfig, auth?: AuthCredentials): Promise<void> => {
  console.log(`\n🔍 Validating All Components`);
  console.log(`   API: ${apiUrl}`);
  console.log(`   Manifest: ${outputDir}\n`);
  
  try {
    // Fetch component list
    console.log(`📡 Fetching component list...`);
    const componentIds = await fetchComponentList(apiUrl, importConfig, auth);
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

/**
 * Interactive prompt helper
 */
const prompt = (question: string): Promise<string> => {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

/**
 * Interactive prompt for yes/no
 */
const promptYesNo = async (question: string, defaultValue: boolean = true): Promise<boolean> => {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  const answer = await prompt(`${question} [${defaultStr}]: `);
  if (answer === '') return defaultValue;
  return answer.toLowerCase().startsWith('y');
};

/**
 * Interactive prompt with choices
 */
const promptChoice = async (question: string, choices: string[], defaultIndex: number = 0): Promise<string> => {
  console.log(`\n${question}`);
  choices.forEach((choice, i) => {
    const marker = i === defaultIndex ? '>' : ' ';
    console.log(`  ${marker} ${i + 1}. ${choice}`);
  });
  
  const answer = await prompt(`Enter number [${defaultIndex + 1}]: `);
  if (answer === '') return choices[defaultIndex];
  
  const index = parseInt(answer, 10) - 1;
  if (index >= 0 && index < choices.length) {
    return choices[index];
  }
  return choices[defaultIndex];
};

/**
 * Interactive prompt for multiple choices
 */
const promptMultiChoice = async (question: string, choices: string[]): Promise<string[]> => {
  console.log(`\n${question}`);
  choices.forEach((choice, i) => {
    console.log(`  ${i + 1}. ${choice}`);
  });
  
  const answer = await prompt(`Enter numbers separated by commas (e.g., 1,2,3) or 'all': `);
  if (answer.toLowerCase() === 'all') return choices;
  if (answer === '') return [choices[0]];
  
  const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
  return indices
    .filter(i => i >= 0 && i < choices.length)
    .map(i => choices[i]);
};

/**
 * Find all array properties in a component
 */
const findArrayProperties = (properties: Record<string, HandoffProperty>, prefix: string = ''): Array<{ path: string; property: HandoffProperty }> => {
  const arrays: Array<{ path: string; property: HandoffProperty }> = [];
  
  for (const [key, property] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    
    if (property.type === 'array') {
      arrays.push({ path, property });
    }
    
    // Recurse into objects
    if (property.type === 'object' && property.properties) {
      arrays.push(...findArrayProperties(property.properties, path));
    }
  }
  
  return arrays;
};

/**
 * Generate field mapping suggestions based on array item properties
 */
const suggestFieldMappings = (itemProperties: Record<string, HandoffProperty>): Record<string, string> => {
  const suggestions: Record<string, string> = {};
  
  const mapProperty = (props: Record<string, HandoffProperty>, prefix: string = '') => {
    for (const [key, prop] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      
      // Suggest mappings based on common patterns
      const lowerKey = key.toLowerCase();
      
      if (prop.type === 'image' || lowerKey.includes('image') || lowerKey.includes('photo') || lowerKey.includes('thumbnail')) {
        suggestions[path] = 'featured_image';
      } else if (lowerKey === 'title' || lowerKey.includes('heading') || lowerKey.includes('name')) {
        suggestions[path] = 'post_title';
      } else if (lowerKey.includes('excerpt') || lowerKey.includes('summary') || lowerKey.includes('description')) {
        suggestions[path] = 'post_excerpt';
      } else if (lowerKey.includes('content') || lowerKey.includes('body')) {
        suggestions[path] = 'post_content';
      } else if (lowerKey === 'url' || lowerKey === 'href' || lowerKey.includes('link')) {
        suggestions[path] = 'permalink';
      } else if (lowerKey.includes('date')) {
        if (lowerKey.includes('day')) {
          suggestions[path] = 'post_date:day_numeric';
        } else if (lowerKey.includes('month')) {
          suggestions[path] = 'post_date:month_short';
        } else if (lowerKey.includes('year')) {
          suggestions[path] = 'post_date:year';
        } else {
          suggestions[path] = 'post_date:full';
        }
      } else if (lowerKey.includes('author')) {
        suggestions[path] = 'author.name';
      } else if (lowerKey.includes('category') || lowerKey.includes('tag')) {
        suggestions[path] = 'taxonomy:category';
      }
      
      // Recurse into nested objects
      if (prop.type === 'object' && prop.properties) {
        mapProperty(prop.properties, path);
      }
    }
  };
  
  mapProperty(itemProperties);
  return suggestions;
};

/**
 * Interactive wizard for configuring dynamic arrays
 */
const configureDynamicArrays = async (
  apiUrl: string,
  componentName: string,
  auth?: AuthCredentials
): Promise<void> => {
  console.log(`\n🧙 Dynamic Array Configuration Wizard`);
  console.log(`   Component: ${componentName}`);
  console.log(`   API: ${apiUrl}\n`);
  
  // Fetch component
  console.log(`📡 Fetching component structure...`);
  let component: HandoffComponent;
  try {
    component = await fetchComponent(apiUrl, componentName, auth);
    console.log(`   Found: ${component.title} (${component.id})\n`);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
  
  // Find array properties
  const arrayProps = findArrayProperties(component.properties);
  
  if (arrayProps.length === 0) {
    console.log(`\n⚠️  No array properties found in this component.`);
    console.log(`   Dynamic arrays are only available for array-type properties.\n`);
    process.exit(0);
  }
  
  console.log(`📋 Found ${arrayProps.length} array field(s):`);
  arrayProps.forEach((arr, i) => {
    const itemCount = arr.property.items?.properties ? Object.keys(arr.property.items.properties).length : 0;
    console.log(`   ${i + 1}. ${arr.path} (${itemCount} item properties)`);
  });
  
  // Select which arrays to configure
  const selectedArrays = arrayProps.length === 1 
    ? [arrayProps[0]]
    : await (async () => {
        const choices = arrayProps.map(a => a.path);
        const selected = await promptMultiChoice('Which array(s) do you want to configure?', choices);
        return arrayProps.filter(a => selected.includes(a.path));
      })();
  
  // Load existing config
  const configPath = path.join(process.cwd(), 'handoff-wp.config.json');
  let existingConfig: HandoffWpConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }
  
  // Build the import config, preserving existing entries
  const importConfig: ImportConfig = existingConfig.import || { element: false };
  if (!importConfig.block || typeof importConfig.block === 'boolean') {
    importConfig.block = {};
  }
  const blockConfig = importConfig.block as Record<string, ComponentImportConfig>;
  if (!blockConfig[component.id] || typeof blockConfig[component.id] === 'boolean') {
    blockConfig[component.id] = {};
  }
  const componentFieldConfig = blockConfig[component.id] as Record<string, FieldConfig>;

  // Helper: configure a DynamicArrayConfig (posts) interactively
  const configurePostsArray = async (arrayProp: { path: string; property: HandoffProperty }): Promise<DynamicArrayConfig> => {
    // Selection mode
    const selectionMode = await promptChoice(
      'How should users select posts?',
      ['Query Builder (filter by taxonomy, order, etc.)', 'Manual Selection (hand-pick specific posts)'],
      0
    );
    const isQueryMode = selectionMode.includes('Query');

    // Post types
    console.log(`\nEnter allowed post types (comma-separated):`);
    const postTypesInput = await prompt(`Post types [post]: `);
    const postTypes = postTypesInput
      ? postTypesInput.split(',').map(s => s.trim()).filter(Boolean)
      : ['post'];

    // Max items
    const maxItemsInput = await prompt(`Maximum items [12]: `);
    const maxItems = maxItemsInput ? parseInt(maxItemsInput, 10) : 12;

    // Render mode
    const renderMode = await promptChoice(
      'How should posts be rendered?',
      ['Mapped (convert post fields to template structure)', 'Template (use a PHP template file)'],
      0
    );
    const isMappedMode = renderMode.includes('Mapped');

    let fieldMapping: Record<string, any> = {};
    let templatePath: string | undefined;

    if (isMappedMode) {
      console.log(`\n📊 Field Mapping Configuration`);

      const itemProps = arrayProp.property.items?.properties;
      if (itemProps) {
        const suggestions = suggestFieldMappings(itemProps);

        console.log(`\nI'll suggest mappings based on field names. Press Enter to accept or type a new value.`);
        console.log(`\nAvailable sources:`);
        console.log(`  - post_title, post_excerpt, post_content, permalink, post_id`);
        console.log(`  - featured_image`);
        console.log(`  - post_date:day, post_date:month_short, post_date:year, post_date:full`);
        console.log(`  - author.name, author.url, author.avatar`);
        console.log(`  - taxonomy:category, taxonomy:post_tag`);
        console.log(`  - meta:field_name`);
        console.log(`  - (leave empty to skip)\n`);

        const flattenProps = (props: Record<string, HandoffProperty>, prefix: string = ''): string[] => {
          const paths: string[] = [];
          for (const [key, prop] of Object.entries(props)) {
            const p = prefix ? `${prefix}.${key}` : key;
            if (prop.type === 'object' && prop.properties) {
              paths.push(...flattenProps(prop.properties, p));
            } else {
              paths.push(p);
            }
          }
          return paths;
        };

        for (const fieldPath of flattenProps(itemProps)) {
          const suggestion = suggestions[fieldPath] || '';
          const defaultStr = suggestion ? ` [${suggestion}]` : '';
          const mapping = await prompt(`  ${fieldPath}${defaultStr}: `);
          const finalMapping = mapping || suggestion;
          if (finalMapping) {
            if (finalMapping.startsWith('{')) {
              try { fieldMapping[fieldPath] = JSON.parse(finalMapping); }
              catch { fieldMapping[fieldPath] = finalMapping; }
            } else {
              fieldMapping[fieldPath] = finalMapping;
            }
          }
        }
      }
    } else {
      const defaultTemplate = `template-parts/handoff/${arrayProp.path}-item.php`;
      templatePath = await prompt(`Template path [${defaultTemplate}]: `) || defaultTemplate;
    }

    const arrayConfig: DynamicArrayConfig = {
      enabled: true,
      postTypes,
      selectionMode: isQueryMode ? 'query' : 'manual',
      maxItems,
      renderMode: isMappedMode ? 'mapped' : 'template',
    };
    if (isMappedMode && Object.keys(fieldMapping).length > 0) arrayConfig.fieldMapping = fieldMapping;
    if (!isMappedMode && templatePath) arrayConfig.templatePath = templatePath;
    if (isQueryMode) {
      arrayConfig.defaultQueryArgs = {
        posts_per_page: Math.min(maxItems, 6),
        orderby: 'date',
        order: 'DESC',
      };
    }
    return arrayConfig;
  };

  // Helper: configure a BreadcrumbsArrayConfig interactively
  const configureBreadcrumbsArray = async (): Promise<BreadcrumbsArrayConfig> => {
    console.log(`\n   Breadcrumbs are built automatically from the current page URL.`);
    console.log(`   The editor will show a single enable/disable toggle.`);
    console.log(`   Items have the shape: { label, url, active }\n`);
    return { arrayType: 'breadcrumbs' };
  };

  // Helper: configure a TaxonomyArrayConfig interactively
  const configureTaxonomyArray = async (): Promise<TaxonomyArrayConfig> => {
    console.log(`\n   Taxonomy terms are fetched from the current post server-side.`);
    console.log(`   The editor shows a toggle and a dropdown to choose the taxonomy.`);
    console.log(`   Items have the shape: { label, url, slug }\n`);

    console.log(`Enter the taxonomy slugs editors can choose from (comma-separated):`);
    const taxonomyInput = await prompt(`Taxonomies [post_tag,category]: `);
    const taxonomies = taxonomyInput
      ? taxonomyInput.split(',').map(s => s.trim()).filter(Boolean)
      : ['post_tag', 'category'];

    const maxItemsInput = await prompt(`Maximum terms to display (-1 = all) [-1]: `);
    const maxItems = maxItemsInput ? parseInt(maxItemsInput, 10) : -1;

    const config: TaxonomyArrayConfig = { arrayType: 'taxonomy', taxonomies };
    if (maxItems > 0) config.maxItems = maxItems;
    return config;
  };

  // Helper: configure a PaginationArrayConfig interactively
  const configurePaginationArray = async (otherArrayPaths: string[]): Promise<PaginationArrayConfig | null> => {
    console.log(`\n   Pagination links are derived automatically from a sibling posts array query.`);
    console.log(`   The editor shows a single enable/disable toggle.`);
    console.log(`   Items have the shape: { label, url, active }\n`);

    if (otherArrayPaths.length === 0) {
      console.log(`   ⚠️  No sibling arrays found to connect to. Configure a posts array first.`);
      return null;
    }

    let connectedField: string;
    if (otherArrayPaths.length === 1) {
      connectedField = otherArrayPaths[0];
      console.log(`   Connected to: ${connectedField} (only option)`);
    } else {
      const choice = await promptChoice(
        'Which posts array should this pagination be connected to?',
        otherArrayPaths,
        0
      );
      connectedField = choice;
    }

    return { arrayType: 'pagination', connectedField };
  };

  // Configure each selected array
  for (const arrayProp of selectedArrays) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`\n⚙️  Configuring: ${component.id}.${arrayProp.path}\n`);

    // Let the user choose the array type
    const arrayTypeChoice = await promptChoice(
      'What kind of data should this array contain?',
      [
        'Posts — query or hand-pick WordPress posts (default)',
        'Breadcrumbs — auto-generated trail from current URL',
        'Taxonomy — terms attached to the current post',
        'Pagination — links derived from a sibling posts array',
      ],
      0
    );

    let arrayConfig: FieldConfig | null = null;

    if (arrayTypeChoice.startsWith('Breadcrumbs')) {
      arrayConfig = await configureBreadcrumbsArray();
    } else if (arrayTypeChoice.startsWith('Taxonomy')) {
      arrayConfig = await configureTaxonomyArray();
    } else if (arrayTypeChoice.startsWith('Pagination')) {
      // Offer the other already-configured (or yet-to-be-configured) array paths as candidates
      const sibling = selectedArrays
        .filter(a => a.path !== arrayProp.path)
        .map(a => a.path);
      arrayConfig = await configurePaginationArray(sibling);
    } else {
      // Posts
      arrayConfig = await configurePostsArray(arrayProp);
    }

    if (arrayConfig) {
      componentFieldConfig[arrayProp.path] = arrayConfig;
      console.log(`\n✅ Configured: ${component.id}.${arrayProp.path} (${(arrayConfig as any).arrayType ?? 'posts'})`);
    } else {
      console.log(`\n⚠️  Skipped: ${component.id}.${arrayProp.path}`);
    }
  }
  
  // Update config file — remove legacy dynamicArrays if present
  const { dynamicArrays: _legacyDynamic, ...restConfig } = existingConfig;
  const newConfig: HandoffWpConfig = {
    ...restConfig,
    import: importConfig,
  };
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\n📄 Configuration Preview:\n`);
  console.log(JSON.stringify({ import: importConfig }, null, 2));
  
  const shouldSave = await promptYesNo('\nSave to handoff-wp.config.json?', true);
  
  if (shouldSave) {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
    console.log(`\n✅ Saved to ${configPath}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Run: npm run dev -- ${componentName} --force`);
    console.log(`   2. Build your blocks: cd demo/plugin && npm run build`);
    console.log(`   3. Test the block in WordPress\n`);
  } else {
    console.log(`\n⚠️  Configuration not saved. Copy the JSON above manually if needed.\n`);
  }
};

// Configure dynamic arrays command
program
  .command('configure-dynamic [component]')
  .alias('wizard')
  .description('Interactive wizard to configure dynamic arrays for a component')
  .option('-a, --api-url <url>', 'Handoff API base URL')
  .option('-u, --username <username>', 'Basic auth username')
  .option('-p, --password <password>', 'Basic auth password')
  .option('-l, --list', 'List available components with array fields')
  .action(async (componentName: string | undefined, opts: {
    apiUrl?: string;
    username?: string;
    password?: string;
    list?: boolean;
  }) => {
    const apiUrl = opts.apiUrl ?? config.apiUrl;
    const auth: AuthCredentials = {
      username: opts.username ?? config.username,
      password: opts.password ?? config.password,
    };
    
    // If listing components, show components with array fields
    if (opts.list || !componentName) {
      console.log(`\n🔍 Fetching component list from ${apiUrl}...\n`);
      
      try {
        const componentIds = await fetchComponentList(apiUrl, config.import, auth);
        
        // Fetch each component to find ones with array fields
        console.log(`📋 Found ${componentIds.length} components. Checking for array fields...\n`);
        
        const componentsWithArrays: Array<{ id: string; title: string; arrays: string[] }> = [];
        
        for (const id of componentIds) {
          try {
            const component = await fetchComponent(apiUrl, id, auth);
            const arrays = findArrayProperties(component.properties);
            if (arrays.length > 0) {
              componentsWithArrays.push({
                id,
                title: component.title,
                arrays: arrays.map(a => a.path),
              });
            }
          } catch {
            // Skip failed components
          }
        }
        
        if (componentsWithArrays.length === 0) {
          console.log(`⚠️  No components with array fields found.\n`);
          process.exit(0);
        }
        
        console.log(`🧩 Components with array fields:\n`);
        componentsWithArrays.forEach((c, i) => {
          console.log(`   ${i + 1}. ${c.title} (${c.id})`);
          c.arrays.forEach(a => console.log(`      └─ ${a}`));
        });
        
        if (opts.list) {
          console.log(`\n💡 Run: npm run dev -- wizard <component-id>\n`);
          process.exit(0);
        }
        
        // Interactive selection
        const choices = componentsWithArrays.map(c => `${c.title} (${c.id})`);
        const selected = await promptChoice('\nSelect a component to configure:', choices, 0);
        const selectedIndex = choices.indexOf(selected);
        componentName = componentsWithArrays[selectedIndex].id;
        
      } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
      }
    }
    
    await configureDynamicArrays(apiUrl, componentName, auth);
  });

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
      await validateAll(apiUrl, output, config.import, auth);
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
          await validateAll(apiUrl, output, config.import, auth);
        } catch {
          // validateAll exits with code 1 on breaking changes
          return;
        }
      }
      await compileAll(apiUrl, output, auth);
      
      // Update manifest after successful compilation
      console.log(`\n📝 Updating property manifest...`);
      const componentIds = await fetchComponentList(apiUrl, config.import, auth);
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
      // Build merged-group lookup once for this branch
      const mergedGroupConfigKeyByLower = new Map<string, string>();
      for (const [key, mode] of Object.entries(config.groups)) {
        if (mode === 'merged') mergedGroupConfigKeyByLower.set(key.toLowerCase(), key);
      }

      // Helper: compile an entire merged group by its config key
      const compileGroupByKey = async (groupKey: string) => {
        const allComponents = await fetchAllComponentsList(apiUrl, auth);
        const groupMatches = allComponents.filter(
          (c) => c.group && c.group.toLowerCase() === groupKey.toLowerCase(),
        );
        if (groupMatches.length === 0) {
          console.error(`Error: No components found for merged group "${groupKey}".`);
          process.exit(1);
        }
        const fullGroupComponents: HandoffComponent[] = [];
        for (const c of groupMatches) {
          try {
            const full = await fetchComponent(apiUrl, c.id, auth);
            const templateValidation = validateTemplateVariables(full);
            if (!templateValidation.isValid) {
              console.warn(`   ⚠️  Skipping ${c.id} (template validation failed)`);
              continue;
            }
            fullGroupComponents.push(full);
          } catch (err) {
            console.error(`   ❌ Failed to fetch ${c.id}: ${err instanceof Error ? err.message : err}`);
          }
        }
        if (fullGroupComponents.length === 0) {
          console.error(`Error: Could not fetch any components for group "${groupKey}".`);
          process.exit(1);
        }
        await compileGroup(apiUrl, output, groupKey, fullGroupComponents, auth);
        console.log(`   ✅ Group "${groupKey}" compiled (${fullGroupComponents.length} variants).\n`);
      };

      // Try component first, then fall back to group (e.g. "hero" -> Hero merged block)
      try {
        const component = await fetchComponent(apiUrl, componentName, auth);

        // If this component belongs to a merged group, compile the whole group instead
        if (component.group) {
          const groupKey = mergedGroupConfigKeyByLower.get(component.group.toLowerCase());
          if (groupKey) {
            console.log(`   "${componentName}" belongs to merged group "${groupKey}" — compiling entire group.\n`);
            await compileGroupByKey(groupKey);
            return;
          }
        }

        if (!opts.force) {
          const result = await validate(apiUrl, output, componentName, auth);
          if (!result.isValid) {
            console.log(`\n⚠️  Component has breaking changes. Use --force to compile anyway.\n`);
            process.exit(1);
          }
        }
        await compile({
          apiUrl,
          outputDir: output,
          componentName,
          auth,
        });
        updateManifestForComponent(output, component);
        console.log(`   📝 Manifest updated\n`);
      } catch (componentError) {
        // No component with this name – try as group
        console.log(`   No component "${componentName}" found, checking groups...\n`);
        const allComponents = await fetchAllComponentsList(apiUrl, auth);
        const nameLower = componentName.toLowerCase();
        const groupMatches = allComponents.filter(
          (c) => c.group && c.group.toLowerCase() === nameLower,
        );
        if (groupMatches.length === 0) {
          console.error(`Error: No component or group found for "${componentName}".`);
          console.error(`       Component fetch: ${componentError instanceof Error ? componentError.message : componentError}`);
          process.exit(1);
        }
        const groupKey =
          mergedGroupConfigKeyByLower.get(nameLower) ?? groupMatches[0].group;
        await compileGroupByKey(groupKey);
      }
    } else {
      console.error('Error: Please specify a component name, group name, use --all flag, --theme flag, or --validate-all flag');
      console.log('\nUsage:');
      console.log('  npx gutenberg-compile <component-name>   Compile one component (e.g. hero-article)');
      console.log('  npx gutenberg-compile <group-name>      Or compile a merged group (e.g. hero)');
      console.log('  npx gutenberg-compile --all');
      console.log('  npx gutenberg-compile --theme');
      console.log('  npx gutenberg-compile --validate hero-article');
      console.log('  npx gutenberg-compile --validate-all');
      console.log('  npx gutenberg-compile --all --force');
      console.log('  npx gutenberg-compile hero --api-url http://localhost:4000 --output ./blocks');
      process.exit(1);
    }
  });

program.parse();

export { compile, generateBlock, fetchComponent };
