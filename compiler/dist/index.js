#!/usr/bin/env node
"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchComponent = exports.generateBlock = exports.compile = void 0;
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const prettier = __importStar(require("prettier"));
const types_1 = require("./types");
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
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
const migrateDynamicArrays = (dynamicArrays) => {
    const importConfig = { element: false };
    const blockConfig = {};
    for (const [key, config] of Object.entries(dynamicArrays)) {
        if (!config.enabled)
            continue;
        const dotIndex = key.indexOf('.');
        if (dotIndex === -1)
            continue;
        const componentId = key.substring(0, dotIndex);
        const fieldName = key.substring(dotIndex + 1);
        if (!blockConfig[componentId] || typeof blockConfig[componentId] === 'boolean') {
            blockConfig[componentId] = {};
        }
        blockConfig[componentId][fieldName] = config;
    }
    if (Object.keys(blockConfig).length > 0) {
        importConfig.block = blockConfig;
    }
    return importConfig;
};
/**
 * Load configuration from handoff-wp.config.json if it exists
 */
const loadConfig = () => {
    const configPath = path.join(process.cwd(), 'handoff-wp.config.json');
    if (fs.existsSync(configPath)) {
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            console.log(`📄 Loaded config from ${configPath}`);
            return config;
        }
        catch (error) {
            console.warn(`⚠️  Failed to parse handoff-wp.config.json: ${error instanceof Error ? error.message : error}`);
            return {};
        }
    }
    return {};
};
/**
 * Merge configuration sources with priority: CLI > config file > defaults
 */
const getConfig = () => {
    const fileConfig = loadConfig();
    let importConfig;
    if (fileConfig.import) {
        importConfig = fileConfig.import;
    }
    else if (fileConfig.dynamicArrays) {
        console.warn(`⚠️  "dynamicArrays" config is deprecated. Migrate to "import" — see SPECIFICATION.md.`);
        importConfig = migrateDynamicArrays(fileConfig.dynamicArrays);
    }
    else {
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
const buildRequestOptions = (url, auth) => {
    const parsedUrl = new URL(url);
    const options = {
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
const generators_1 = require("./generators");
const validators_1 = require("./validators");
// Load PHP plugin for Prettier (using require for compatibility)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const phpPlugin = require('@prettier/plugin-php');
/**
 * Format code with Prettier
 */
const formatCode = async (code, parser) => {
    try {
        const options = {
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
            options.phpVersion = '8.0';
            options.braceStyle = '1tbs';
        }
        return await prettier.format(code, options);
    }
    catch (error) {
        // If formatting fails, return original code
        console.warn(`   ⚠️  Prettier formatting failed for ${parser}, using unformatted code`);
        return code;
    }
};
const program = new commander_1.Command();
/**
 * Download a file from a URL and save it to disk
 */
const downloadFile = async (url, destPath, auth) => {
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
                fs.unlink(destPath, () => { }); // Clean up partial file
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
const fetchComponent = async (apiUrl, componentName, auth) => {
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
                    const component = JSON.parse(data);
                    resolve(component);
                }
                catch (e) {
                    reject(new Error(`Failed to parse component JSON: ${e}`));
                }
            });
        }).on('error', (e) => {
            reject(new Error(`Failed to fetch component: ${e.message}`));
        });
    });
};
exports.fetchComponent = fetchComponent;
/**
 * Generate all block files from a component
 * @param component - The Handoff component data
 * @param apiUrl - The base API URL for fetching screenshots
 * @param resolvedConfig - The resolved configuration including dynamic array settings
 */
const generateBlock = (component, apiUrl, resolvedConfig) => {
    const hasScreenshot = !!component.image;
    // Construct full screenshot URL if image path is available
    let screenshotUrl;
    if (component.image) {
        // Handle both absolute URLs and relative paths
        if (component.image.startsWith('http://') || component.image.startsWith('https://')) {
            screenshotUrl = component.image;
        }
        else {
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
        if ('arrayType' in dynConfig)
            continue; // Skip specialised array types
        const prop = component.properties[fieldName];
        if (prop?.type === 'array' && prop.pagination?.type === 'pagination') {
            const paginationFieldRegex = new RegExp(`\\{\\{\\s*#field\\s+["']${fieldName}\\.pagination["']`);
            if (paginationFieldRegex.test(component.code)) {
                dynConfig.pagination = { propertyName: 'pagination' };
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
    let innerBlocksField;
    if (explicitInnerBlocks.length > 1) {
        throw new Error(`Component "${component.id}": only one richtext field per block can use InnerBlocks, ` +
            `but ${explicitInnerBlocks.length} are marked: ${explicitInnerBlocks.join(', ')}`);
    }
    else if (explicitInnerBlocks.length === 1) {
        const field = explicitInnerBlocks[0];
        const prop = component.properties[field];
        if (!prop || prop.type !== 'richtext') {
            throw new Error(`Component "${component.id}": field "${field}" is marked as innerBlocks but is not a richtext field`);
        }
        innerBlocksField = field;
    }
    else if (richtextFields.length === 1) {
        innerBlocksField = richtextFields[0];
    }
    else {
        innerBlocksField = null;
    }
    return {
        blockJson: (0, generators_1.generateBlockJson)(component, hasScreenshot, apiUrl, componentDynamicArrays, innerBlocksField),
        indexJs: (0, generators_1.generateIndexJs)(component, componentDynamicArrays, innerBlocksField),
        renderPhp: (0, generators_1.generateRenderPhp)(component, componentDynamicArrays, innerBlocksField),
        editorScss: (0, generators_1.generateEditorScss)(component),
        styleScss: (0, generators_1.generateStyleScss)(component),
        readme: (0, generators_1.generateReadme)(component),
        migrationSchema: (0, generators_1.generateMigrationSchema)(component),
        screenshotUrl
    };
};
exports.generateBlock = generateBlock;
/**
 * Write block files to output directory
 */
const writeBlockFiles = async (outputDir, componentId, block, auth) => {
    const blockName = (0, generators_1.toBlockName)(componentId);
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
const compile = async (options) => {
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
        const templateValidation = (0, validators_1.validateTemplateVariables)(component);
        console.log((0, validators_1.formatTemplateValidationResult)(templateValidation));
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
    }
    catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
    }
};
exports.compile = compile;
/**
 * Check whether a component should be imported based on the import config.
 */
const shouldImportComponent = (componentId, componentType, importConfig) => {
    const typeConfig = importConfig[componentType];
    // Type not listed in import config — default to true (import)
    if (typeConfig === undefined)
        return true;
    // Entire type disabled
    if (typeConfig === false)
        return false;
    // Entire type enabled with no per-component overrides
    if (typeConfig === true)
        return true;
    // Per-component lookup within the type object
    const componentConfig = typeConfig[componentId];
    // Not listed — import with defaults (type-object means "import all, override listed")
    if (componentConfig === undefined)
        return true;
    // Explicitly disabled
    if (componentConfig === false)
        return false;
    // Explicitly enabled or has field overrides
    return true;
};
/**
 * Get the raw per-field config object for a component from the import config.
 */
const getComponentFieldConfigs = (componentId, componentType, importConfig) => {
    const typeConfig = importConfig[componentType];
    if (!typeConfig || typeof typeConfig === 'boolean')
        return {};
    const componentConfig = typeConfig[componentId];
    if (!componentConfig || typeof componentConfig === 'boolean')
        return {};
    return componentConfig;
};
/**
 * Extract dynamic array configs for a component from the import config.
 */
const extractDynamicArrayConfigs = (componentId, componentType, importConfig) => {
    const allConfigs = getComponentFieldConfigs(componentId, componentType, importConfig);
    const result = {};
    for (const [key, config] of Object.entries(allConfigs)) {
        if ((0, types_1.isDynamicArrayConfig)(config)) {
            result[key] = config;
        }
    }
    return result;
};
/**
 * Extract field preferences for a component from the import config.
 */
const extractFieldPreferences = (componentId, componentType, importConfig) => {
    const allConfigs = getComponentFieldConfigs(componentId, componentType, importConfig);
    const result = {};
    for (const [key, config] of Object.entries(allConfigs)) {
        if (!(0, types_1.isDynamicArrayConfig)(config)) {
            result[key] = config;
        }
    }
    return result;
};
/**
 * Fetch list of all components from API, filtered by import config
 */
const fetchComponentList = async (apiUrl, importConfig, auth) => {
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
                    const components = JSON.parse(data);
                    const filtered = components.filter(c => shouldImportComponent(c.id, c.type, importConfig));
                    resolve(filtered.map(c => c.id));
                }
                catch (e) {
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
const fetchAllComponentsList = async (apiUrl, auth) => {
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
                    const components = JSON.parse(data);
                    resolve(components);
                }
                catch (e) {
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
const buildVariantInfo = (component, resolvedConfig) => {
    const componentDynamicArrays = {
        ...extractDynamicArrayConfigs(component.id, component.type, resolvedConfig.import),
    };
    for (const [fieldName, dynConfig] of Object.entries(componentDynamicArrays)) {
        if ('arrayType' in dynConfig)
            continue; // Skip specialised array types
        const prop = component.properties[fieldName];
        if (prop?.type === 'array' && prop.pagination?.type === 'pagination') {
            const paginationFieldRegex = new RegExp(`\\{\\{\\s*#field\\s+["']${fieldName}\\.pagination["']`);
            if (paginationFieldRegex.test(component.code)) {
                dynConfig.pagination = { propertyName: 'pagination' };
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
    let innerBlocksField;
    if (explicitInnerBlocks.length > 1) {
        throw new Error(`Component "${component.id}": only one richtext field per block can use InnerBlocks, ` +
            `but ${explicitInnerBlocks.length} are marked: ${explicitInnerBlocks.join(', ')}`);
    }
    else if (explicitInnerBlocks.length === 1) {
        const field = explicitInnerBlocks[0];
        const prop = component.properties[field];
        if (!prop || prop.type !== 'richtext') {
            throw new Error(`Component "${component.id}": field "${field}" is marked as innerBlocks but is not a richtext field`);
        }
        innerBlocksField = field;
    }
    else if (richtextFields.length === 1) {
        innerBlocksField = richtextFields[0];
    }
    else {
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
const compileGroup = async (apiUrl, outputDir, groupSlug, groupComponents, auth) => {
    console.log(`\n🔀 Generating merged group block: ${groupSlug} (${groupComponents.length} variants)`);
    const variantInfos = groupComponents.map((c) => buildVariantInfo(c, config));
    const mergedBlock = (0, generators_1.generateMergedBlock)(groupSlug, groupComponents, variantInfos, apiUrl);
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
    const categoriesPhp = (0, generators_1.generateCategoriesPhp)(groupComponents);
    const formattedCategoriesPhp = await formatCode(categoriesPhp, 'php');
    const includesDir = path.join(pluginDir, 'includes');
    if (!fs.existsSync(includesDir)) {
        fs.mkdirSync(includesDir, { recursive: true });
    }
    const categoriesPath = path.join(includesDir, 'handoff-categories.php');
    fs.writeFileSync(categoriesPath, formattedCategoriesPhp);
    console.log(`   📄 ${categoriesPath}`);
};
const compileAll = async (apiUrl, outputDir, auth) => {
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
        const compiledComponents = [];
        // Fetch all components first so we can partition by group
        const allComponents = [];
        for (const componentId of componentIds) {
            try {
                const component = await fetchComponent(apiUrl, componentId, auth);
                const templateValidation = (0, validators_1.validateTemplateVariables)(component);
                if (!templateValidation.isValid) {
                    console.log((0, validators_1.formatTemplateValidationResult)(templateValidation));
                    console.error(`   ⚠️  Skipping ${componentId} due to template variable errors`);
                    failed++;
                    continue;
                }
                allComponents.push(component);
            }
            catch (error) {
                console.error(`❌ Failed to fetch ${componentId}: ${error instanceof Error ? error.message : error}`);
                failed++;
            }
        }
        // Partition components: merged groups vs individual
        // Build case-insensitive lookup: config may say "Hero" but API often returns "hero"
        const mergedGroupConfigKeyByLower = new Map();
        for (const [key, mode] of Object.entries(config.groups)) {
            if (mode === 'merged')
                mergedGroupConfigKeyByLower.set(key.toLowerCase(), key);
        }
        const groupBuckets = {};
        const individualComponents = [];
        for (const component of allComponents) {
            const group = component.group;
            if (!group) {
                individualComponents.push(component);
                continue;
            }
            const configKey = mergedGroupConfigKeyByLower.get(group.toLowerCase());
            if (configKey) {
                if (!groupBuckets[configKey])
                    groupBuckets[configKey] = [];
                groupBuckets[configKey].push(component);
            }
            else {
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
            }
            catch (error) {
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
            }
            catch (error) {
                console.error(`❌ Failed to compile merged group ${groupSlug}: ${error instanceof Error ? error.message : error}`);
                failed += groupComponents.length;
            }
        }
        // Generate categories PHP file based on all compiled components
        if (compiledComponents.length > 0) {
            console.log(`\n⚙️  Generating block categories...`);
            const categoriesPhp = (0, generators_1.generateCategoriesPhp)(compiledComponents);
            const formattedCategoriesPhp = await formatCode(categoriesPhp, 'php');
            const pluginDir = path.dirname(outputDir);
            const includesDir = path.join(pluginDir, 'includes');
            if (!fs.existsSync(includesDir)) {
                fs.mkdirSync(includesDir, { recursive: true });
            }
            const categoriesPath = path.join(includesDir, 'handoff-categories.php');
            fs.writeFileSync(categoriesPath, formattedCategoriesPhp);
            console.log(`✅ Generated: ${categoriesPath}`);
        }
        // Generate shared components if any component has dynamic array configs
        const hasDynamicArraysInImport = Object.values(config.import).some(typeConfig => {
            if (typeof typeConfig !== 'object')
                return false;
            return Object.values(typeConfig).some(compConfig => typeof compConfig === 'object' && Object.keys(compConfig).length > 0);
        });
        if (hasDynamicArraysInImport) {
            console.log(`\n⚙️  Generating shared components...`);
            const sharedComponents = (0, generators_1.generateSharedComponents)();
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
        // Download main.css and main.js design system assets
        console.log(`\n📡 Downloading design system assets...`);
        const assetsDir = path.join(outputDir, '..', 'assets');
        const assetsCssDir = path.join(assetsDir, 'css');
        const assetsJsDir = path.join(assetsDir, 'js');
        if (!fs.existsSync(assetsCssDir)) {
            fs.mkdirSync(assetsCssDir, { recursive: true });
        }
        if (!fs.existsSync(assetsJsDir)) {
            fs.mkdirSync(assetsJsDir, { recursive: true });
        }
        const cssUrl = `${apiUrl}/api/component/main.css`;
        const cssPath = path.join(assetsCssDir, 'main.css');
        const cssDownloaded = await downloadFile(cssUrl, cssPath, auth);
        if (cssDownloaded) {
            console.log(`   ✅ assets/css/main.css`);
        }
        else {
            console.warn(`   ⚠️  Could not download main.css from ${cssUrl}`);
        }
        const jsUrl = `${apiUrl}/api/component/main.js`;
        const jsPath = path.join(assetsJsDir, 'main.js');
        const jsDownloaded = await downloadFile(jsUrl, jsPath, auth);
        if (jsDownloaded) {
            console.log(`   ✅ assets/js/main.js`);
        }
        else {
            console.warn(`   ⚠️  Could not download main.js from ${jsUrl}`);
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
    }
    catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
    }
};
/**
 * Compile theme templates (header, footer)
 */
const compileTheme = async (apiUrl, outputDir, auth) => {
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
            const headerPhp = (0, generators_1.generateHeaderPhp)(header);
            const formattedHeader = await formatCode(headerPhp, 'php');
            const headerPath = path.join(outputDir, 'header.php');
            fs.writeFileSync(headerPath, formattedHeader);
            console.log(`✅ Generated: ${headerPath}\n`);
        }
        catch (error) {
            console.warn(`⚠️  Header component not found or failed: ${error instanceof Error ? error.message : error}\n`);
        }
        // Compile footer
        console.log(`📡 Fetching footer component...`);
        try {
            const footer = await fetchComponent(apiUrl, 'footer', auth);
            console.log(`   Found: ${footer.title}\n`);
            console.log(`⚙️  Generating footer.php...`);
            const footerPhp = (0, generators_1.generateFooterPhp)(footer);
            const formattedFooter = await formatCode(footerPhp, 'php');
            const footerPath = path.join(outputDir, 'footer.php');
            fs.writeFileSync(footerPath, formattedFooter);
            console.log(`✅ Generated: ${footerPath}\n`);
        }
        catch (error) {
            console.warn(`⚠️  Footer component not found or failed: ${error instanceof Error ? error.message : error}\n`);
        }
        // Also try header-compact and footer-compact if they exist
        // These go into template-parts/handoff/ subfolder
        const handoffTemplatesDir = path.join(outputDir, 'template-parts', 'handoff');
        if (!fs.existsSync(handoffTemplatesDir)) {
            fs.mkdirSync(handoffTemplatesDir, { recursive: true });
        }
        const generatedTemplates = [];
        for (const variant of ['header-compact', 'header-lander', 'footer-compact']) {
            try {
                const component = await fetchComponent(apiUrl, variant, auth);
                console.log(`📡 Found: ${component.title}`);
                const templateType = variant.replace(/-/g, '_');
                const isHeader = variant.startsWith('header');
                const php = isHeader
                    ? (0, generators_1.generateTemplatePartPhp)(component, templateType)
                    : (0, generators_1.generateTemplatePartPhp)(component, templateType);
                const formattedPhp = await formatCode(php, 'php');
                const filePath = path.join(handoffTemplatesDir, `${variant}.php`);
                fs.writeFileSync(filePath, formattedPhp);
                console.log(`✅ Generated: ${filePath}\n`);
                generatedTemplates.push(`${variant}.php`);
            }
            catch {
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
        }
        else {
            console.warn(`⚠️  Could not download main.css from ${cssUrl}`);
        }
        // Download main.js
        const jsUrl = `${apiUrl}/api/component/main.js`;
        const jsPath = path.join(jsDir, 'main.js');
        console.log(`   Downloading main.js...`);
        const jsDownloaded = await downloadFile(jsUrl, jsPath, auth);
        if (jsDownloaded) {
            console.log(`✅ Downloaded: ${jsPath}`);
        }
        else {
            console.warn(`⚠️  Could not download main.js from ${jsUrl}`);
        }
        console.log(`\n✨ Theme templates generated!\n`);
    }
    catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
    }
};
/**
 * Validate a single component for breaking property changes
 */
const validate = async (apiUrl, outputDir, componentName, auth) => {
    console.log(`\n🔍 Validating Component: ${componentName}`);
    console.log(`   API: ${apiUrl}`);
    console.log(`   Manifest: ${outputDir}\n`);
    // Fetch component
    const component = await fetchComponent(apiUrl, componentName, auth);
    // Load manifest
    const manifest = (0, validators_1.loadManifest)(outputDir);
    // Validate
    const result = (0, validators_1.validateComponent)(component, manifest);
    // Output result
    console.log((0, validators_1.formatValidationResult)(result));
    return result;
};
/**
 * Validate all components for breaking property changes
 */
const validateAll = async (apiUrl, outputDir, importConfig, auth) => {
    console.log(`\n🔍 Validating All Components`);
    console.log(`   API: ${apiUrl}`);
    console.log(`   Manifest: ${outputDir}\n`);
    try {
        // Fetch component list
        console.log(`📡 Fetching component list...`);
        const componentIds = await fetchComponentList(apiUrl, importConfig, auth);
        console.log(`   Found ${componentIds.length} components\n`);
        // Load manifest
        const manifest = (0, validators_1.loadManifest)(outputDir);
        let valid = 0;
        let invalid = 0;
        let newComponents = 0;
        const breakingChanges = [];
        for (const componentId of componentIds) {
            try {
                const component = await fetchComponent(apiUrl, componentId, auth);
                const result = (0, validators_1.validateComponent)(component, manifest);
                console.log((0, validators_1.formatValidationResult)(result));
                console.log('');
                if (result.isNew) {
                    newComponents++;
                }
                else if (result.isValid) {
                    valid++;
                }
                else {
                    invalid++;
                    breakingChanges.push(result);
                }
            }
            catch (error) {
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
        }
        else {
            console.log(`\n✨ All components validated successfully!\n`);
        }
    }
    catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
    }
};
/**
 * Update manifest after successful compilation
 */
const updateManifestForComponent = (outputDir, component) => {
    const manifest = (0, validators_1.loadManifest)(outputDir);
    const updatedManifest = (0, validators_1.updateManifest)(component, manifest);
    (0, validators_1.saveManifest)(outputDir, updatedManifest);
};
// CLI setup
program
    .name('gutenberg-compile')
    .description('Transpile Handoff components to WordPress Gutenberg blocks and theme templates')
    .version('1.0.0');
/**
 * Initialize a new config file
 */
const initConfig = (opts) => {
    const configPath = path.join(process.cwd(), 'handoff-wp.config.json');
    // Check if config already exists
    if (fs.existsSync(configPath) && !opts.force) {
        console.log(`\n⚠️  Config file already exists: ${configPath}`);
        console.log(`   Use --force to overwrite.\n`);
        process.exit(1);
    }
    const newConfig = {
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
const prompt = (question) => {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
};
/**
 * Interactive prompt for yes/no
 */
const promptYesNo = async (question, defaultValue = true) => {
    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const answer = await prompt(`${question} [${defaultStr}]: `);
    if (answer === '')
        return defaultValue;
    return answer.toLowerCase().startsWith('y');
};
/**
 * Interactive prompt with choices
 */
const promptChoice = async (question, choices, defaultIndex = 0) => {
    console.log(`\n${question}`);
    choices.forEach((choice, i) => {
        const marker = i === defaultIndex ? '>' : ' ';
        console.log(`  ${marker} ${i + 1}. ${choice}`);
    });
    const answer = await prompt(`Enter number [${defaultIndex + 1}]: `);
    if (answer === '')
        return choices[defaultIndex];
    const index = parseInt(answer, 10) - 1;
    if (index >= 0 && index < choices.length) {
        return choices[index];
    }
    return choices[defaultIndex];
};
/**
 * Interactive prompt for multiple choices
 */
const promptMultiChoice = async (question, choices) => {
    console.log(`\n${question}`);
    choices.forEach((choice, i) => {
        console.log(`  ${i + 1}. ${choice}`);
    });
    const answer = await prompt(`Enter numbers separated by commas (e.g., 1,2,3) or 'all': `);
    if (answer.toLowerCase() === 'all')
        return choices;
    if (answer === '')
        return [choices[0]];
    const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
    return indices
        .filter(i => i >= 0 && i < choices.length)
        .map(i => choices[i]);
};
/**
 * Find all array properties in a component
 */
const findArrayProperties = (properties, prefix = '') => {
    const arrays = [];
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
const suggestFieldMappings = (itemProperties) => {
    const suggestions = {};
    const mapProperty = (props, prefix = '') => {
        for (const [key, prop] of Object.entries(props)) {
            const path = prefix ? `${prefix}.${key}` : key;
            // Suggest mappings based on common patterns
            const lowerKey = key.toLowerCase();
            if (prop.type === 'image' || lowerKey.includes('image') || lowerKey.includes('photo') || lowerKey.includes('thumbnail')) {
                suggestions[path] = 'featured_image';
            }
            else if (lowerKey === 'title' || lowerKey.includes('heading') || lowerKey.includes('name')) {
                suggestions[path] = 'post_title';
            }
            else if (lowerKey.includes('excerpt') || lowerKey.includes('summary') || lowerKey.includes('description')) {
                suggestions[path] = 'post_excerpt';
            }
            else if (lowerKey.includes('content') || lowerKey.includes('body')) {
                suggestions[path] = 'post_content';
            }
            else if (lowerKey === 'url' || lowerKey === 'href' || lowerKey.includes('link')) {
                suggestions[path] = 'permalink';
            }
            else if (lowerKey.includes('date')) {
                if (lowerKey.includes('day')) {
                    suggestions[path] = 'post_date:day_numeric';
                }
                else if (lowerKey.includes('month')) {
                    suggestions[path] = 'post_date:month_short';
                }
                else if (lowerKey.includes('year')) {
                    suggestions[path] = 'post_date:year';
                }
                else {
                    suggestions[path] = 'post_date:full';
                }
            }
            else if (lowerKey.includes('author')) {
                suggestions[path] = 'author.name';
            }
            else if (lowerKey.includes('category') || lowerKey.includes('tag')) {
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
const configureDynamicArrays = async (apiUrl, componentName, auth) => {
    console.log(`\n🧙 Dynamic Array Configuration Wizard`);
    console.log(`   Component: ${componentName}`);
    console.log(`   API: ${apiUrl}\n`);
    // Fetch component
    console.log(`📡 Fetching component structure...`);
    let component;
    try {
        component = await fetchComponent(apiUrl, componentName, auth);
        console.log(`   Found: ${component.title} (${component.id})\n`);
    }
    catch (error) {
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
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
        try {
            existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        catch {
            // Ignore parse errors
        }
    }
    // Build the import config, preserving existing entries
    const importConfig = existingConfig.import || { element: false };
    if (!importConfig.block || typeof importConfig.block === 'boolean') {
        importConfig.block = {};
    }
    const blockConfig = importConfig.block;
    if (!blockConfig[component.id] || typeof blockConfig[component.id] === 'boolean') {
        blockConfig[component.id] = {};
    }
    const componentFieldConfig = blockConfig[component.id];
    // Helper: configure a DynamicArrayConfig (posts) interactively
    const configurePostsArray = async (arrayProp) => {
        // Selection mode
        const selectionMode = await promptChoice('How should users select posts?', ['Query Builder (filter by taxonomy, order, etc.)', 'Manual Selection (hand-pick specific posts)'], 0);
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
        const renderMode = await promptChoice('How should posts be rendered?', ['Mapped (convert post fields to template structure)', 'Template (use a PHP template file)'], 0);
        const isMappedMode = renderMode.includes('Mapped');
        let fieldMapping = {};
        let templatePath;
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
                const flattenProps = (props, prefix = '') => {
                    const paths = [];
                    for (const [key, prop] of Object.entries(props)) {
                        const p = prefix ? `${prefix}.${key}` : key;
                        if (prop.type === 'object' && prop.properties) {
                            paths.push(...flattenProps(prop.properties, p));
                        }
                        else {
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
                            try {
                                fieldMapping[fieldPath] = JSON.parse(finalMapping);
                            }
                            catch {
                                fieldMapping[fieldPath] = finalMapping;
                            }
                        }
                        else {
                            fieldMapping[fieldPath] = finalMapping;
                        }
                    }
                }
            }
        }
        else {
            const defaultTemplate = `template-parts/handoff/${arrayProp.path}-item.php`;
            templatePath = await prompt(`Template path [${defaultTemplate}]: `) || defaultTemplate;
        }
        const arrayConfig = {
            enabled: true,
            postTypes,
            selectionMode: isQueryMode ? 'query' : 'manual',
            maxItems,
            renderMode: isMappedMode ? 'mapped' : 'template',
        };
        if (isMappedMode && Object.keys(fieldMapping).length > 0)
            arrayConfig.fieldMapping = fieldMapping;
        if (!isMappedMode && templatePath)
            arrayConfig.templatePath = templatePath;
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
    const configureBreadcrumbsArray = async () => {
        console.log(`\n   Breadcrumbs are built automatically from the current page URL.`);
        console.log(`   The editor will show a single enable/disable toggle.`);
        console.log(`   Items have the shape: { label, url, active }\n`);
        return { arrayType: 'breadcrumbs' };
    };
    // Helper: configure a TaxonomyArrayConfig interactively
    const configureTaxonomyArray = async () => {
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
        const config = { arrayType: 'taxonomy', taxonomies };
        if (maxItems > 0)
            config.maxItems = maxItems;
        return config;
    };
    // Helper: configure a PaginationArrayConfig interactively
    const configurePaginationArray = async (otherArrayPaths) => {
        console.log(`\n   Pagination links are derived automatically from a sibling posts array query.`);
        console.log(`   The editor shows a single enable/disable toggle.`);
        console.log(`   Items have the shape: { label, url, active }\n`);
        if (otherArrayPaths.length === 0) {
            console.log(`   ⚠️  No sibling arrays found to connect to. Configure a posts array first.`);
            return null;
        }
        let connectedField;
        if (otherArrayPaths.length === 1) {
            connectedField = otherArrayPaths[0];
            console.log(`   Connected to: ${connectedField} (only option)`);
        }
        else {
            const choice = await promptChoice('Which posts array should this pagination be connected to?', otherArrayPaths, 0);
            connectedField = choice;
        }
        return { arrayType: 'pagination', connectedField };
    };
    // Configure each selected array
    for (const arrayProp of selectedArrays) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`\n⚙️  Configuring: ${component.id}.${arrayProp.path}\n`);
        // Let the user choose the array type
        const arrayTypeChoice = await promptChoice('What kind of data should this array contain?', [
            'Posts — query or hand-pick WordPress posts (default)',
            'Breadcrumbs — auto-generated trail from current URL',
            'Taxonomy — terms attached to the current post',
            'Pagination — links derived from a sibling posts array',
        ], 0);
        let arrayConfig = null;
        if (arrayTypeChoice.startsWith('Breadcrumbs')) {
            arrayConfig = await configureBreadcrumbsArray();
        }
        else if (arrayTypeChoice.startsWith('Taxonomy')) {
            arrayConfig = await configureTaxonomyArray();
        }
        else if (arrayTypeChoice.startsWith('Pagination')) {
            // Offer the other already-configured (or yet-to-be-configured) array paths as candidates
            const sibling = selectedArrays
                .filter(a => a.path !== arrayProp.path)
                .map(a => a.path);
            arrayConfig = await configurePaginationArray(sibling);
        }
        else {
            // Posts
            arrayConfig = await configurePostsArray(arrayProp);
        }
        if (arrayConfig) {
            componentFieldConfig[arrayProp.path] = arrayConfig;
            console.log(`\n✅ Configured: ${component.id}.${arrayProp.path} (${arrayConfig.arrayType ?? 'posts'})`);
        }
        else {
            console.log(`\n⚠️  Skipped: ${component.id}.${arrayProp.path}`);
        }
    }
    // Update config file — remove legacy dynamicArrays if present
    const { dynamicArrays: _legacyDynamic, ...restConfig } = existingConfig;
    const newConfig = {
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
    }
    else {
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
    .action(async (componentName, opts) => {
    const apiUrl = opts.apiUrl ?? config.apiUrl;
    const auth = {
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
            const componentsWithArrays = [];
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
                }
                catch {
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
        }
        catch (error) {
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
    .action(async (componentName, opts) => {
    // Merge CLI options with config (CLI takes precedence)
    const apiUrl = opts.apiUrl ?? config.apiUrl;
    const output = opts.output ?? config.output;
    const themeDir = opts.themeDir ?? config.themeDir;
    const auth = {
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
    }
    else if (opts.all) {
        // Validate all first unless forced
        if (!opts.force) {
            console.log(`\n🔍 Pre-compilation validation...\n`);
            try {
                await validateAll(apiUrl, output, config.import, auth);
            }
            catch {
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
            }
            catch {
                // Skip failed components
            }
        }
        console.log(`   ✅ Manifest updated\n`);
    }
    else if (componentName) {
        // Build merged-group lookup once for this branch
        const mergedGroupConfigKeyByLower = new Map();
        for (const [key, mode] of Object.entries(config.groups)) {
            if (mode === 'merged')
                mergedGroupConfigKeyByLower.set(key.toLowerCase(), key);
        }
        // Helper: compile an entire merged group by its config key
        const compileGroupByKey = async (groupKey) => {
            const allComponents = await fetchAllComponentsList(apiUrl, auth);
            const groupMatches = allComponents.filter((c) => c.group && c.group.toLowerCase() === groupKey.toLowerCase());
            if (groupMatches.length === 0) {
                console.error(`Error: No components found for merged group "${groupKey}".`);
                process.exit(1);
            }
            const fullGroupComponents = [];
            for (const c of groupMatches) {
                try {
                    const full = await fetchComponent(apiUrl, c.id, auth);
                    const templateValidation = (0, validators_1.validateTemplateVariables)(full);
                    if (!templateValidation.isValid) {
                        console.warn(`   ⚠️  Skipping ${c.id} (template validation failed)`);
                        continue;
                    }
                    fullGroupComponents.push(full);
                }
                catch (err) {
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
        }
        catch (componentError) {
            // No component with this name – try as group
            console.log(`   No component "${componentName}" found, checking groups...\n`);
            const allComponents = await fetchAllComponentsList(apiUrl, auth);
            const nameLower = componentName.toLowerCase();
            const groupMatches = allComponents.filter((c) => c.group && c.group.toLowerCase() === nameLower);
            if (groupMatches.length === 0) {
                console.error(`Error: No component or group found for "${componentName}".`);
                console.error(`       Component fetch: ${componentError instanceof Error ? componentError.message : componentError}`);
                process.exit(1);
            }
            const groupKey = mergedGroupConfigKeyByLower.get(nameLower) ?? groupMatches[0].group;
            await compileGroupByKey(groupKey);
        }
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHlDQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsbURBQXFDO0FBRXJDLG1DQUFnUztBQXVCaFM7O0dBRUc7QUFDSCxNQUFNLGNBQWMsR0FBbUI7SUFDckMsTUFBTSxFQUFFLHVCQUF1QjtJQUMvQixNQUFNLEVBQUUsVUFBVTtJQUNsQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFO0lBQzFCLE1BQU0sRUFBRSxFQUFFO0NBQ1gsQ0FBQztBQUVGOzs7R0FHRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxhQUFpRCxFQUFnQixFQUFFO0lBQy9GLE1BQU0sWUFBWSxHQUFpQixFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUN0RCxNQUFNLFdBQVcsR0FBMEMsRUFBRSxDQUFDO0lBRTlELEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7UUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQUUsU0FBUztRQUM5QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQztZQUFFLFNBQVM7UUFDOUIsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENB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QUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuLyoqXG4gKiBHdXRlbmJlcmcgQ29tcGlsZXJcbiAqIFxuICogVHJhbnNwaWxlcyBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MuXG4gKiBcbiAqIFVzYWdlOlxuICogICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiBbb3B0aW9uc11cbiAqICAgXG4gKiBPcHRpb25zOlxuICogICAtLWFwaS11cmwgPHVybD4gICAgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6IGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMClcbiAqICAgLS1vdXRwdXQgPGRpcj4gICAgIE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogLi9ibG9ja3MpXG4gKiAgIC0tYWxsICAgICAgICAgICAgICBDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50c1xuICogICAtLXRoZW1lICAgICAgICAgICAgQ29tcGlsZSBoZWFkZXIvZm9vdGVyIHRvIHRoZW1lIHRlbXBsYXRlc1xuICogICAtLXZhbGlkYXRlICAgICAgICAgVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqICAgLS12YWxpZGF0ZS1hbGwgICAgIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiBcbiAqIENvbmZpZ3VyYXRpb246XG4gKiAgIENyZWF0ZSBhIGhhbmRvZmYtd3AuY29uZmlnLmpzb24gZmlsZSBpbiB5b3VyIHByb2plY3Qgcm9vdCB0byBzZXQgZGVmYXVsdHM6XG4gKiAgIHtcbiAqICAgICBcImFwaVVybFwiOiBcImh0dHBzOi8vZGVtby5oYW5kb2ZmLmNvbVwiLFxuICogICAgIFwib3V0cHV0XCI6IFwiLi9wYXRoL3RvL2Jsb2Nrc1wiLFxuICogICAgIFwidGhlbWVEaXJcIjogXCIuL3BhdGgvdG8vdGhlbWVcIlxuICogICB9XG4gKi9cblxuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJ2NvbW1hbmRlcic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgaHR0cHMgZnJvbSAnaHR0cHMnO1xuaW1wb3J0ICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCAqIGFzIHByZXR0aWVyIGZyb20gJ3ByZXR0aWVyJztcblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBDb21waWxlck9wdGlvbnMsIEdlbmVyYXRlZEJsb2NrLCBIYW5kb2ZmV3BDb25maWcsIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBGaWVsZENvbmZpZywgSW1wb3J0Q29uZmlnLCBDb21wb25lbnRJbXBvcnRDb25maWcsIEZpZWxkUHJlZmVyZW5jZXMsIGlzRHluYW1pY0FycmF5Q29uZmlnIH0gZnJvbSAnLi90eXBlcyc7XG5cbi8qKlxuICogQXV0aCBjcmVkZW50aWFscyBmb3IgSFRUUCByZXF1ZXN0c1xuICovXG5pbnRlcmZhY2UgQXV0aENyZWRlbnRpYWxzIHtcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlcXVpcmVkIGNvbmZpZyB3aXRoIGRlZmF1bHRzIGFwcGxpZWRcbiAqL1xuaW50ZXJmYWNlIFJlc29sdmVkQ29uZmlnIHtcbiAgYXBpVXJsOiBzdHJpbmc7XG4gIG91dHB1dDogc3RyaW5nO1xuICB0aGVtZURpcjogc3RyaW5nO1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIGltcG9ydDogSW1wb3J0Q29uZmlnO1xuICBncm91cHM6IFJlY29yZDxzdHJpbmcsICdtZXJnZWQnIHwgJ2luZGl2aWR1YWwnPjtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gKi9cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBSZXNvbHZlZENvbmZpZyA9IHtcbiAgYXBpVXJsOiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgb3V0cHV0OiAnLi9ibG9ja3MnLFxuICB0aGVtZURpcjogJy4vdGhlbWUnLFxuICB1c2VybmFtZTogdW5kZWZpbmVkLFxuICBwYXNzd29yZDogdW5kZWZpbmVkLFxuICBpbXBvcnQ6IHsgZWxlbWVudDogZmFsc2UgfSxcbiAgZ3JvdXBzOiB7fSxcbn07XG5cbi8qKlxuICogTWlncmF0ZSBsZWdhY3kgYGR5bmFtaWNBcnJheXNgIGNvbmZpZyB0byB0aGUgbmV3IGBpbXBvcnRgIHN0cnVjdHVyZS5cbiAqIEdyb3VwcyBcImNvbXBvbmVudElkLmZpZWxkTmFtZVwiIGVudHJpZXMgdW5kZXIgaW1wb3J0LmJsb2NrW2NvbXBvbmVudElkXVtmaWVsZE5hbWVdLlxuICovXG5jb25zdCBtaWdyYXRlRHluYW1pY0FycmF5cyA9IChkeW5hbWljQXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KTogSW1wb3J0Q29uZmlnID0+IHtcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGNvbnN0IGJsb2NrQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+ID0ge307XG5cbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCFjb25maWcuZW5hYmxlZCkgY29udGludWU7XG4gICAgY29uc3QgZG90SW5kZXggPSBrZXkuaW5kZXhPZignLicpO1xuICAgIGlmIChkb3RJbmRleCA9PT0gLTEpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGNvbXBvbmVudElkID0ga2V5LnN1YnN0cmluZygwLCBkb3RJbmRleCk7XG4gICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZyhkb3RJbmRleCArIDEpO1xuXG4gICAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPSB7fTtcbiAgICB9XG4gICAgKGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KVtmaWVsZE5hbWVdID0gY29uZmlnO1xuICB9XG5cbiAgaWYgKE9iamVjdC5rZXlzKGJsb2NrQ29uZmlnKS5sZW5ndGggPiAwKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0gYmxvY2tDb25maWc7XG4gIH1cblxuICByZXR1cm4gaW1wb3J0Q29uZmlnO1xufTtcblxuLyoqXG4gKiBMb2FkIGNvbmZpZ3VyYXRpb24gZnJvbSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGlmIGl0IGV4aXN0c1xuICovXG5jb25zdCBsb2FkQ29uZmlnID0gKCk6IEhhbmRvZmZXcENvbmZpZyA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNvbmZpZ0NvbnRlbnQpIGFzIEhhbmRvZmZXcENvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OEIExvYWRlZCBjb25maWcgZnJvbSAke2NvbmZpZ1BhdGh9YCk7XG4gICAgICByZXR1cm4gY29uZmlnO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRmFpbGVkIHRvIHBhcnNlIGhhbmRvZmYtd3AuY29uZmlnLmpzb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiB7fTtcbn07XG5cbi8qKlxuICogTWVyZ2UgY29uZmlndXJhdGlvbiBzb3VyY2VzIHdpdGggcHJpb3JpdHk6IENMSSA+IGNvbmZpZyBmaWxlID4gZGVmYXVsdHNcbiAqL1xuY29uc3QgZ2V0Q29uZmlnID0gKCk6IFJlc29sdmVkQ29uZmlnID0+IHtcbiAgY29uc3QgZmlsZUNvbmZpZyA9IGxvYWRDb25maWcoKTtcblxuICBsZXQgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWc7XG4gIGlmIChmaWxlQ29uZmlnLmltcG9ydCkge1xuICAgIGltcG9ydENvbmZpZyA9IGZpbGVDb25maWcuaW1wb3J0O1xuICB9IGVsc2UgaWYgKGZpbGVDb25maWcuZHluYW1pY0FycmF5cykge1xuICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBcImR5bmFtaWNBcnJheXNcIiBjb25maWcgaXMgZGVwcmVjYXRlZC4gTWlncmF0ZSB0byBcImltcG9ydFwiIOKAlCBzZWUgU1BFQ0lGSUNBVElPTi5tZC5gKTtcbiAgICBpbXBvcnRDb25maWcgPSBtaWdyYXRlRHluYW1pY0FycmF5cyhmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpO1xuICB9IGVsc2Uge1xuICAgIGltcG9ydENvbmZpZyA9IERFRkFVTFRfQ09ORklHLmltcG9ydDtcbiAgfVxuICBcbiAgcmV0dXJuIHtcbiAgICBhcGlVcmw6IGZpbGVDb25maWcuYXBpVXJsID8/IERFRkFVTFRfQ09ORklHLmFwaVVybCxcbiAgICBvdXRwdXQ6IGZpbGVDb25maWcub3V0cHV0ID8/IERFRkFVTFRfQ09ORklHLm91dHB1dCxcbiAgICB0aGVtZURpcjogZmlsZUNvbmZpZy50aGVtZURpciA/PyBERUZBVUxUX0NPTkZJRy50aGVtZURpcixcbiAgICB1c2VybmFtZTogZmlsZUNvbmZpZy51c2VybmFtZSA/PyBERUZBVUxUX0NPTkZJRy51c2VybmFtZSxcbiAgICBwYXNzd29yZDogZmlsZUNvbmZpZy5wYXNzd29yZCA/PyBERUZBVUxUX0NPTkZJRy5wYXNzd29yZCxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgICBncm91cHM6IGZpbGVDb25maWcuZ3JvdXBzID8/IERFRkFVTFRfQ09ORklHLmdyb3VwcyxcbiAgfTtcbn07XG5cblxuLyoqXG4gKiBCdWlsZCBIVFRQIHJlcXVlc3Qgb3B0aW9ucyB3aXRoIG9wdGlvbmFsIGJhc2ljIGF1dGhcbiAqL1xuY29uc3QgYnVpbGRSZXF1ZXN0T3B0aW9ucyA9ICh1cmw6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IGh0dHAuUmVxdWVzdE9wdGlvbnMgfCBodHRwcy5SZXF1ZXN0T3B0aW9ucyA9PiB7XG4gIGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodXJsKTtcbiAgY29uc3Qgb3B0aW9uczogaHR0cC5SZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICBob3N0bmFtZTogcGFyc2VkVXJsLmhvc3RuYW1lLFxuICAgIHBvcnQ6IHBhcnNlZFVybC5wb3J0IHx8IChwYXJzZWRVcmwucHJvdG9jb2wgPT09ICdodHRwczonID8gNDQzIDogODApLFxuICAgIHBhdGg6IHBhcnNlZFVybC5wYXRobmFtZSArIHBhcnNlZFVybC5zZWFyY2gsXG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBoZWFkZXJzOiB7fSxcbiAgfTtcbiAgXG4gIGlmIChhdXRoPy51c2VybmFtZSAmJiBhdXRoPy5wYXNzd29yZCkge1xuICAgIGNvbnN0IGNyZWRlbnRpYWxzID0gQnVmZmVyLmZyb20oYCR7YXV0aC51c2VybmFtZX06JHthdXRoLnBhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSB7XG4gICAgICAuLi5vcHRpb25zLmhlYWRlcnMsXG4gICAgICAnQXV0aG9yaXphdGlvbic6IGBCYXNpYyAke2NyZWRlbnRpYWxzfWAsXG4gICAgfTtcbiAgfVxuICBcbiAgcmV0dXJuIG9wdGlvbnM7XG59O1xuXG4vLyBMb2FkIGNvbmZpZyBhdCBzdGFydHVwXG5jb25zdCBjb25maWcgPSBnZXRDb25maWcoKTtcbmltcG9ydCB7XG4gIGdlbmVyYXRlQmxvY2tKc29uLFxuICBnZW5lcmF0ZUluZGV4SnMsXG4gIGdlbmVyYXRlUmVuZGVyUGhwLFxuICBnZW5lcmF0ZUVkaXRvclNjc3MsXG4gIGdlbmVyYXRlU3R5bGVTY3NzLFxuICBnZW5lcmF0ZVJlYWRtZSxcbiAgdG9CbG9ja05hbWUsXG4gIGdlbmVyYXRlSGVhZGVyUGhwLFxuICBnZW5lcmF0ZUZvb3RlclBocCxcbiAgZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAsXG4gIGdlbmVyYXRlQ2F0ZWdvcmllc1BocCxcbiAgZ2VuZXJhdGVTaGFyZWRDb21wb25lbnRzLFxuICBnZW5lcmF0ZU1pZ3JhdGlvblNjaGVtYSxcbiAgZ2VuZXJhdGVNZXJnZWRCbG9jayxcbn0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB0eXBlIHsgVmFyaWFudEluZm8gfSBmcm9tICcuL2dlbmVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgbG9hZE1hbmlmZXN0LFxuICBzYXZlTWFuaWZlc3QsXG4gIHZhbGlkYXRlQ29tcG9uZW50LFxuICB1cGRhdGVNYW5pZmVzdCxcbiAgZm9ybWF0VmFsaWRhdGlvblJlc3VsdCxcbiAgVmFsaWRhdGlvblJlc3VsdCxcbiAgdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyxcbiAgZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0XG59IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5cbi8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUHJldHRpZXIgKHVzaW5nIHJlcXVpcmUgZm9yIGNvbXBhdGliaWxpdHkpXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuY29uc3QgcGhwUGx1Z2luID0gcmVxdWlyZSgnQHByZXR0aWVyL3BsdWdpbi1waHAnKTtcblxuLyoqXG4gKiBGb3JtYXQgY29kZSB3aXRoIFByZXR0aWVyXG4gKi9cbmNvbnN0IGZvcm1hdENvZGUgPSBhc3luYyAoY29kZTogc3RyaW5nLCBwYXJzZXI6ICdiYWJlbCcgfCAnanNvbicgfCAnc2NzcycgfCAncGhwJyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3B0aW9uczogcHJldHRpZXIuT3B0aW9ucyA9IHtcbiAgICAgIHBhcnNlcixcbiAgICAgIHNpbmdsZVF1b3RlOiB0cnVlLFxuICAgICAgdGFiV2lkdGg6IDIsXG4gICAgICBwcmludFdpZHRoOiAxMDAsXG4gICAgICB0cmFpbGluZ0NvbW1hOiAnZXM1JyxcbiAgICB9O1xuICAgIFxuICAgIC8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUEhQIGZpbGVzXG4gICAgaWYgKHBhcnNlciA9PT0gJ3BocCcpIHtcbiAgICAgIG9wdGlvbnMucGx1Z2lucyA9IFtwaHBQbHVnaW5dO1xuICAgICAgLy8gUEhQLXNwZWNpZmljIG9wdGlvbnMgLSBjYXN0IHRvIGFueSBmb3IgcGx1Z2luLXNwZWNpZmljIG9wdGlvbnNcbiAgICAgIChvcHRpb25zIGFzIGFueSkucGhwVmVyc2lvbiA9ICc4LjAnO1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5icmFjZVN0eWxlID0gJzF0YnMnO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYXdhaXQgcHJldHRpZXIuZm9ybWF0KGNvZGUsIG9wdGlvbnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIGZvcm1hdHRpbmcgZmFpbHMsIHJldHVybiBvcmlnaW5hbCBjb2RlXG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFByZXR0aWVyIGZvcm1hdHRpbmcgZmFpbGVkIGZvciAke3BhcnNlcn0sIHVzaW5nIHVuZm9ybWF0dGVkIGNvZGVgKTtcbiAgICByZXR1cm4gY29kZTtcbiAgfVxufTtcblxuY29uc3QgcHJvZ3JhbSA9IG5ldyBDb21tYW5kKCk7XG5cbi8qKlxuICogRG93bmxvYWQgYSBmaWxlIGZyb20gYSBVUkwgYW5kIHNhdmUgaXQgdG8gZGlza1xuICovXG5jb25zdCBkb3dubG9hZEZpbGUgPSBhc3luYyAodXJsOiBzdHJpbmcsIGRlc3RQYXRoOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICAvLyBIYW5kbGUgcmVkaXJlY3RzXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDMwMSB8fCByZXMuc3RhdHVzQ29kZSA9PT0gMzAyKSB7XG4gICAgICAgIGNvbnN0IHJlZGlyZWN0VXJsID0gcmVzLmhlYWRlcnMubG9jYXRpb247XG4gICAgICAgIGlmIChyZWRpcmVjdFVybCkge1xuICAgICAgICAgIGRvd25sb2FkRmlsZShyZWRpcmVjdFVybCwgZGVzdFBhdGgsIGF1dGgpLnRoZW4ocmVzb2x2ZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gZG93bmxvYWQgc2NyZWVuc2hvdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBmaWxlU3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oZGVzdFBhdGgpO1xuICAgICAgcmVzLnBpcGUoZmlsZVN0cmVhbSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsICgpID0+IHtcbiAgICAgICAgZmlsZVN0cmVhbS5jbG9zZSgpO1xuICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICBmcy51bmxpbmsoZGVzdFBhdGgsICgpID0+IHt9KTsgLy8gQ2xlYW4gdXAgcGFydGlhbCBmaWxlXG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gc2F2ZSBzY3JlZW5zaG90OiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBjb21wb25lbnQgZGF0YSBmcm9tIEhhbmRvZmYgQVBJXG4gKi9cbmNvbnN0IGZldGNoQ29tcG9uZW50ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnQ+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50LyR7Y29tcG9uZW50TmFtZX0uanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50IEpTT046ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbGwgYmxvY2sgZmlsZXMgZnJvbSBhIGNvbXBvbmVudFxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gYXBpVXJsIC0gVGhlIGJhc2UgQVBJIFVSTCBmb3IgZmV0Y2hpbmcgc2NyZWVuc2hvdHNcbiAqIEBwYXJhbSByZXNvbHZlZENvbmZpZyAtIFRoZSByZXNvbHZlZCBjb25maWd1cmF0aW9uIGluY2x1ZGluZyBkeW5hbWljIGFycmF5IHNldHRpbmdzXG4gKi9cbmNvbnN0IGdlbmVyYXRlQmxvY2sgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCBhcGlVcmw6IHN0cmluZywgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnKTogR2VuZXJhdGVkQmxvY2sgPT4ge1xuICBjb25zdCBoYXNTY3JlZW5zaG90ID0gISFjb21wb25lbnQuaW1hZ2U7XG4gIFxuICAvLyBDb25zdHJ1Y3QgZnVsbCBzY3JlZW5zaG90IFVSTCBpZiBpbWFnZSBwYXRoIGlzIGF2YWlsYWJsZVxuICBsZXQgc2NyZWVuc2hvdFVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBpZiAoY29tcG9uZW50LmltYWdlKSB7XG4gICAgLy8gSGFuZGxlIGJvdGggYWJzb2x1dGUgVVJMcyBhbmQgcmVsYXRpdmUgcGF0aHNcbiAgICBpZiAoY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCBjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgc2NyZWVuc2hvdFVybCA9IGNvbXBvbmVudC5pbWFnZTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUmVsYXRpdmUgcGF0aCAtIHByZXBlbmQgQVBJIFVSTFxuICAgICAgc2NyZWVuc2hvdFVybCA9IGAke2FwaVVybH0ke2NvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCcvJykgPyAnJyA6ICcvJ30ke2NvbXBvbmVudC5pbWFnZX1gO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gRXh0cmFjdCBkeW5hbWljIGFycmF5IGNvbmZpZ3MgZm9yIHRoaXMgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWdcbiAgY29uc3QgY29tcG9uZW50RHluYW1pY0FycmF5cyA9IHtcbiAgICAuLi5leHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpXG4gIH07XG4gIFxuICAvLyBBdXRvLWRldGVjdCBwYWdpbmF0aW9uIGZvciBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBlbnRyaWVzIG9ubHlcbiAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudER5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCdhcnJheVR5cGUnIGluIGR5bkNvbmZpZykgY29udGludWU7IC8vIFNraXAgc3BlY2lhbGlzZWQgYXJyYXkgdHlwZXNcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICBpZiAocHJvcD8udHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24/LnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgY29uc3QgcGFnaW5hdGlvbkZpZWxkUmVnZXggPSBuZXcgUmVnRXhwKFxuICAgICAgICBgXFxcXHtcXFxce1xcXFxzKiNmaWVsZFxcXFxzK1tcIiddJHtmaWVsZE5hbWV9XFxcXC5wYWdpbmF0aW9uW1wiJ11gXG4gICAgICApO1xuICAgICAgaWYgKHBhZ2luYXRpb25GaWVsZFJlZ2V4LnRlc3QoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgICAgIChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uID0geyBwcm9wZXJ0eU5hbWU6ICdwYWdpbmF0aW9uJyB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIERldGVybWluZSB3aGljaCByaWNodGV4dCBmaWVsZCAoaWYgYW55KSB1c2VzIElubmVyQmxvY2tzXG4gIGNvbnN0IGZpZWxkUHJlZnMgPSBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpO1xuICBjb25zdCByaWNodGV4dEZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgLy8gQ2hlY2sgZXhwbGljaXQgY29uZmlnIG92ZXJyaWRlcyBmaXJzdFxuICBjb25zdCBleHBsaWNpdElubmVyQmxvY2tzID0gT2JqZWN0LmVudHJpZXMoZmllbGRQcmVmcylcbiAgICAuZmlsdGVyKChbLCBwcmVmc10pID0+IHByZWZzLmlubmVyQmxvY2tzID09PSB0cnVlKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGxldCBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBvbmx5IG9uZSByaWNodGV4dCBmaWVsZCBwZXIgYmxvY2sgY2FuIHVzZSBJbm5lckJsb2NrcywgYCArXG4gICAgICBgYnV0ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGh9IGFyZSBtYXJrZWQ6ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5qb2luKCcsICcpfWBcbiAgICApO1xuICB9IGVsc2UgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgZmllbGQgPSBleHBsaWNpdElubmVyQmxvY2tzWzBdO1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZF07XG4gICAgaWYgKCFwcm9wIHx8IHByb3AudHlwZSAhPT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IGZpZWxkIFwiJHtmaWVsZH1cIiBpcyBtYXJrZWQgYXMgaW5uZXJCbG9ja3MgYnV0IGlzIG5vdCBhIHJpY2h0ZXh0IGZpZWxkYFxuICAgICAgKTtcbiAgICB9XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IGZpZWxkO1xuICB9IGVsc2UgaWYgKHJpY2h0ZXh0RmllbGRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSByaWNodGV4dEZpZWxkc1swXTtcbiAgfSBlbHNlIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gbnVsbDtcbiAgfVxuICBcbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlQmxvY2tKc29uKGNvbXBvbmVudCwgaGFzU2NyZWVuc2hvdCwgYXBpVXJsLCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBpbmRleEpzOiBnZW5lcmF0ZUluZGV4SnMoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICByZW5kZXJQaHA6IGdlbmVyYXRlUmVuZGVyUGhwKGNvbXBvbmVudCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgZWRpdG9yU2NzczogZ2VuZXJhdGVFZGl0b3JTY3NzKGNvbXBvbmVudCksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZVN0eWxlU2Nzcyhjb21wb25lbnQpLFxuICAgIHJlYWRtZTogZ2VuZXJhdGVSZWFkbWUoY29tcG9uZW50KSxcbiAgICBtaWdyYXRpb25TY2hlbWE6IGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hKGNvbXBvbmVudCksXG4gICAgc2NyZWVuc2hvdFVybFxuICB9O1xufTtcblxuLyoqXG4gKiBXcml0ZSBibG9jayBmaWxlcyB0byBvdXRwdXQgZGlyZWN0b3J5XG4gKi9cbmNvbnN0IHdyaXRlQmxvY2tGaWxlcyA9IGFzeW5jIChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50SWQ6IHN0cmluZywgYmxvY2s6IEdlbmVyYXRlZEJsb2NrLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IHRvQmxvY2tOYW1lKGNvbXBvbmVudElkKTtcbiAgY29uc3QgYmxvY2tEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBibG9ja05hbWUpO1xuICBcbiAgLy8gQ3JlYXRlIGJsb2NrIGRpcmVjdG9yeVxuICBpZiAoIWZzLmV4aXN0c1N5bmMoYmxvY2tEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGJsb2NrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBcbiAgLy8gRm9ybWF0IGFsbCBjb2RlIGZpbGVzIHdpdGggUHJldHRpZXJcbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgXG4gIC8vIFdyaXRlIGZpbGVzXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnYmxvY2suanNvbicpLCBmb3JtYXR0ZWRCbG9ja0pzb24pO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2luZGV4LmpzJyksIGZvcm1hdHRlZEluZGV4SnMpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3JlbmRlci5waHAnKSwgZm9ybWF0dGVkUmVuZGVyUGhwKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdlZGl0b3Iuc2NzcycpLCBmb3JtYXR0ZWRFZGl0b3JTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdzdHlsZS5zY3NzJyksIGZvcm1hdHRlZFN0eWxlU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnUkVBRE1FLm1kJyksIGJsb2NrLnJlYWRtZSk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnbWlncmF0aW9uLXNjaGVtYS5qc29uJyksIGJsb2NrLm1pZ3JhdGlvblNjaGVtYSk7XG4gIFxuICAvLyBEb3dubG9hZCBzY3JlZW5zaG90IGlmIGF2YWlsYWJsZVxuICBsZXQgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBmYWxzZTtcbiAgaWYgKGJsb2NrLnNjcmVlbnNob3RVcmwpIHtcbiAgICBjb25zdCBzY3JlZW5zaG90UGF0aCA9IHBhdGguam9pbihibG9ja0RpciwgJ3NjcmVlbnNob3QucG5nJyk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfk7cgRG93bmxvYWRpbmcgc2NyZWVuc2hvdC4uLmApO1xuICAgIHNjcmVlbnNob3REb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGJsb2NrLnNjcmVlbnNob3RVcmwsIHNjcmVlbnNob3RQYXRoLCBhdXRoKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgYmxvY2s6ICR7YmxvY2tOYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2Jsb2NrRGlyfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBibG9jay5qc29uYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGluZGV4LmpzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHJlbmRlci5waHBgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgZWRpdG9yLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4Qgc3R5bGUuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBSRUFETUUubWRgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgbWlncmF0aW9uLXNjaGVtYS5qc29uYCk7XG4gIGlmIChzY3JlZW5zaG90RG93bmxvYWRlZCkge1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5a877iPICBzY3JlZW5zaG90LnBuZ2ApO1xuICB9XG59O1xuXG4vKipcbiAqIE1haW4gY29tcGlsYXRpb24gZnVuY3Rpb25cbiAqL1xuY29uc3QgY29tcGlsZSA9IGFzeW5jIChvcHRpb25zOiBDb21waWxlck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7b3B0aW9ucy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7b3B0aW9ucy5jb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke29wdGlvbnMub3V0cHV0RGlyfWApO1xuICBpZiAob3B0aW9ucy5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke29wdGlvbnMuYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBmcm9tIEFQSVxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBkYXRhLi4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQob3B0aW9ucy5hcGlVcmwsIG9wdGlvbnMuY29tcG9uZW50TmFtZSwgb3B0aW9ucy5hdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRlbXBsYXRlIHZhcmlhYmxlcyBiZWZvcmUgZ2VuZXJhdGluZ1xuICAgIGNvbnNvbGUubG9nKGDwn5SNIFZhbGlkYXRpbmcgdGVtcGxhdGUgdmFyaWFibGVzLi4uYCk7XG4gICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgXG4gICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIFRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkISBGaXggdGhlIHVuZGVmaW5lZCB2YXJpYWJsZXMgYmVmb3JlIGNvbXBpbGluZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgYmxvY2sgZmlsZXNcbiAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIEd1dGVuYmVyZyBibG9jay4uLmApO1xuICAgIGNvbnN0IGJsb2NrID0gZ2VuZXJhdGVCbG9jayhjb21wb25lbnQsIG9wdGlvbnMuYXBpVXJsLCBjb25maWcpO1xuICAgIFxuICAgIC8vIFdyaXRlIGZpbGVzICh3aXRoIFByZXR0aWVyIGZvcm1hdHRpbmcpXG4gICAgYXdhaXQgd3JpdGVCbG9ja0ZpbGVzKG9wdGlvbnMub3V0cHV0RGlyLCBjb21wb25lbnQuaWQsIGJsb2NrLCBvcHRpb25zLmF1dGgpO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggRG9uZSEgRG9uJ3QgZm9yZ2V0IHRvIHJ1biAnbnBtIHJ1biBidWlsZCcgaW4geW91ciBibG9ja3MgcGx1Z2luLlxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDaGVjayB3aGV0aGVyIGEgY29tcG9uZW50IHNob3VsZCBiZSBpbXBvcnRlZCBiYXNlZCBvbiB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3Qgc2hvdWxkSW1wb3J0Q29tcG9uZW50ID0gKGNvbXBvbmVudElkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcpOiBib29sZWFuID0+IHtcbiAgY29uc3QgdHlwZUNvbmZpZyA9IGltcG9ydENvbmZpZ1tjb21wb25lbnRUeXBlXTtcblxuICAvLyBUeXBlIG5vdCBsaXN0ZWQgaW4gaW1wb3J0IGNvbmZpZyDigJQgZGVmYXVsdCB0byB0cnVlIChpbXBvcnQpXG4gIGlmICh0eXBlQ29uZmlnID09PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAvLyBFbnRpcmUgdHlwZSBkaXNhYmxlZFxuICBpZiAodHlwZUNvbmZpZyA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgLy8gRW50aXJlIHR5cGUgZW5hYmxlZCB3aXRoIG5vIHBlci1jb21wb25lbnQgb3ZlcnJpZGVzXG4gIGlmICh0eXBlQ29uZmlnID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcblxuICAvLyBQZXItY29tcG9uZW50IGxvb2t1cCB3aXRoaW4gdGhlIHR5cGUgb2JqZWN0XG4gIGNvbnN0IGNvbXBvbmVudENvbmZpZyA9IHR5cGVDb25maWdbY29tcG9uZW50SWRdO1xuICAvLyBOb3QgbGlzdGVkIOKAlCBpbXBvcnQgd2l0aCBkZWZhdWx0cyAodHlwZS1vYmplY3QgbWVhbnMgXCJpbXBvcnQgYWxsLCBvdmVycmlkZSBsaXN0ZWRcIilcbiAgaWYgKGNvbXBvbmVudENvbmZpZyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgLy8gRXhwbGljaXRseSBkaXNhYmxlZFxuICBpZiAoY29tcG9uZW50Q29uZmlnID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAvLyBFeHBsaWNpdGx5IGVuYWJsZWQgb3IgaGFzIGZpZWxkIG92ZXJyaWRlc1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSByYXcgcGVyLWZpZWxkIGNvbmZpZyBvYmplY3QgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgRmllbGRQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCB0eXBlQ29uZmlnID0gaW1wb3J0Q29uZmlnW2NvbXBvbmVudFR5cGVdO1xuICBpZiAoIXR5cGVDb25maWcgfHwgdHlwZW9mIHR5cGVDb25maWcgPT09ICdib29sZWFuJykgcmV0dXJuIHt9O1xuXG4gIGNvbnN0IGNvbXBvbmVudENvbmZpZyA9IHR5cGVDb25maWdbY29tcG9uZW50SWRdO1xuICBpZiAoIWNvbXBvbmVudENvbmZpZyB8fCB0eXBlb2YgY29tcG9uZW50Q29uZmlnID09PSAnYm9vbGVhbicpIHJldHVybiB7fTtcblxuICByZXR1cm4gY29tcG9uZW50Q29uZmlnIGFzIFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEZpZWxkUHJlZmVyZW5jZXM+O1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGR5bmFtaWMgYXJyYXkgY29uZmlncyBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPiA9PiB7XG4gIGNvbnN0IGFsbENvbmZpZ3MgPSBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MoY29tcG9uZW50SWQsIGNvbXBvbmVudFR5cGUsIGltcG9ydENvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+ID0ge307XG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhhbGxDb25maWdzKSkge1xuICAgIGlmIChpc0R5bmFtaWNBcnJheUNvbmZpZyhjb25maWcpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IGNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBmaWVsZCBwcmVmZXJlbmNlcyBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIEZpZWxkUHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3QgYWxsQ29uZmlncyA9IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyhjb21wb25lbnRJZCwgY29tcG9uZW50VHlwZSwgaW1wb3J0Q29uZmlnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBGaWVsZFByZWZlcmVuY2VzPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYWxsQ29uZmlncykpIHtcbiAgICBpZiAoIWlzRHluYW1pY0FycmF5Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gY29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBGZXRjaCBsaXN0IG9mIGFsbCBjb21wb25lbnRzIGZyb20gQVBJLCBmaWx0ZXJlZCBieSBpbXBvcnQgY29uZmlnXG4gKi9cbmNvbnN0IGZldGNoQ29tcG9uZW50TGlzdCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudHMuanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50IGxpc3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IEpTT04ucGFyc2UoZGF0YSkgYXMgQXJyYXk8SGFuZG9mZkNvbXBvbmVudD47XG4gICAgICAgICAgY29uc3QgZmlsdGVyZWQgPSBjb21wb25lbnRzLmZpbHRlcihjID0+IHNob3VsZEltcG9ydENvbXBvbmVudChjLmlkLCBjLnR5cGUsIGltcG9ydENvbmZpZykpO1xuICAgICAgICAgIHJlc29sdmUoZmlsdGVyZWQubWFwKGMgPT4gYy5pZCkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBmdWxsIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEkgKG5vIGltcG9ydCBmaWx0ZXIpLiBVc2VkIHRvIHJlc29sdmUgZ3JvdXAgbmFtZXMuXG4gKi9cbmNvbnN0IGZldGNoQWxsQ29tcG9uZW50c0xpc3QgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnRbXT4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnRzLmpzb25gO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50IGxpc3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEFycmF5PEhhbmRvZmZDb21wb25lbnQ+O1xuICAgICAgICAgIHJlc29sdmUoY29tcG9uZW50cyk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50cyBsaXN0OiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4gcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudHM6ICR7ZS5tZXNzYWdlfWApKSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBDb21waWxlIGFsbCBjb21wb25lbnRzXG4gKi9cbi8qKlxuICogQnVpbGQgVmFyaWFudEluZm8gZm9yIGEgY29tcG9uZW50IChyZXNvbHZlcyBkeW5hbWljIGFycmF5cywgSW5uZXJCbG9ja3MgZmllbGQsIGV0Yy4pXG4gKi9cbmNvbnN0IGJ1aWxkVmFyaWFudEluZm8gPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCByZXNvbHZlZENvbmZpZzogUmVzb2x2ZWRDb25maWcpOiBWYXJpYW50SW5mbyA9PiB7XG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KSxcbiAgfTtcblxuICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50RHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoJ2FycmF5VHlwZScgaW4gZHluQ29uZmlnKSBjb250aW51ZTsgLy8gU2tpcCBzcGVjaWFsaXNlZCBhcnJheSB0eXBlc1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgIGlmIChwcm9wPy50eXBlID09PSAnYXJyYXknICYmIHByb3AucGFnaW5hdGlvbj8udHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBjb25zdCBwYWdpbmF0aW9uRmllbGRSZWdleCA9IG5ldyBSZWdFeHAoXG4gICAgICAgIGBcXFxce1xcXFx7XFxcXHMqI2ZpZWxkXFxcXHMrW1wiJ10ke2ZpZWxkTmFtZX1cXFxcLnBhZ2luYXRpb25bXCInXWBcbiAgICAgICk7XG4gICAgICBpZiAocGFnaW5hdGlvbkZpZWxkUmVnZXgudGVzdChjb21wb25lbnQuY29kZSkpIHtcbiAgICAgICAgKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24gPSB7IHByb3BlcnR5TmFtZTogJ3BhZ2luYXRpb24nIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmllbGRQcmVmcyA9IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCk7XG4gIGNvbnN0IHJpY2h0ZXh0RmllbGRzID0gT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpXG4gICAgLmZpbHRlcigoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBjb25zdCBleHBsaWNpdElubmVyQmxvY2tzID0gT2JqZWN0LmVudHJpZXMoZmllbGRQcmVmcylcbiAgICAuZmlsdGVyKChbLCBwcmVmc10pID0+IHByZWZzLmlubmVyQmxvY2tzID09PSB0cnVlKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGxldCBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBvbmx5IG9uZSByaWNodGV4dCBmaWVsZCBwZXIgYmxvY2sgY2FuIHVzZSBJbm5lckJsb2NrcywgYCArXG4gICAgICBgYnV0ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGh9IGFyZSBtYXJrZWQ6ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5qb2luKCcsICcpfWBcbiAgICApO1xuICB9IGVsc2UgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgZmllbGQgPSBleHBsaWNpdElubmVyQmxvY2tzWzBdO1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZF07XG4gICAgaWYgKCFwcm9wIHx8IHByb3AudHlwZSAhPT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IGZpZWxkIFwiJHtmaWVsZH1cIiBpcyBtYXJrZWQgYXMgaW5uZXJCbG9ja3MgYnV0IGlzIG5vdCBhIHJpY2h0ZXh0IGZpZWxkYFxuICAgICAgKTtcbiAgICB9XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IGZpZWxkO1xuICB9IGVsc2UgaWYgKHJpY2h0ZXh0RmllbGRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSByaWNodGV4dEZpZWxkc1swXTtcbiAgfSBlbHNlIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY29tcG9uZW50LFxuICAgIGZpZWxkTWFwOiB7fSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkLFxuICAgIGR5bmFtaWNBcnJheUNvbmZpZ3M6IGNvbXBvbmVudER5bmFtaWNBcnJheXMsXG4gIH07XG59O1xuXG4vKipcbiAqIENvbXBpbGUgYSBzaW5nbGUgbWVyZ2VkIGdyb3VwIChlLmcuIEhlcm8gd2l0aCBtdWx0aXBsZSB2YXJpYW50cykuIFVzZWQgYnkgc2luZ2xlLW5hbWUgQ0xJIHdoZW4gbmFtZSBtYXRjaGVzIGEgZ3JvdXAuXG4gKi9cbmNvbnN0IGNvbXBpbGVHcm91cCA9IGFzeW5jIChcbiAgYXBpVXJsOiBzdHJpbmcsXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10sXG4gIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMsXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflIAgR2VuZXJhdGluZyBtZXJnZWQgZ3JvdXAgYmxvY2s6ICR7Z3JvdXBTbHVnfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc3QgdmFyaWFudEluZm9zOiBWYXJpYW50SW5mb1tdID0gZ3JvdXBDb21wb25lbnRzLm1hcCgoYykgPT4gYnVpbGRWYXJpYW50SW5mbyhjLCBjb25maWcpKTtcbiAgY29uc3QgbWVyZ2VkQmxvY2sgPSBnZW5lcmF0ZU1lcmdlZEJsb2NrKGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzLCB2YXJpYW50SW5mb3MsIGFwaVVybCk7XG4gIGNvbnN0IGdyb3VwQmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuICBjb25zdCBncm91cERpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGdyb3VwQmxvY2tOYW1lKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGdyb3VwRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhncm91cERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCBmb3JtYXR0ZWRCbG9ja0pzb24gPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmJsb2NrSnNvbiwgJ2pzb24nKTtcbiAgY29uc3QgZm9ybWF0dGVkSW5kZXhKcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suaW5kZXhKcywgJ2JhYmVsJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFJlbmRlclBocCA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2sucmVuZGVyUGhwLCAncGhwJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEVkaXRvclNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmVkaXRvclNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFN0eWxlU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suc3R5bGVTY3NzLCAnc2NzcycpO1xuXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnYmxvY2suanNvbicpLCBmb3JtYXR0ZWRCbG9ja0pzb24pO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2luZGV4LmpzJyksIGZvcm1hdHRlZEluZGV4SnMpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ3JlbmRlci5waHAnKSwgZm9ybWF0dGVkUmVuZGVyUGhwKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdlZGl0b3Iuc2NzcycpLCBmb3JtYXR0ZWRFZGl0b3JTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdzdHlsZS5zY3NzJyksIGZvcm1hdHRlZFN0eWxlU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnUkVBRE1FLm1kJyksIG1lcmdlZEJsb2NrLnJlYWRtZSk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnbWlncmF0aW9uLXNjaGVtYS5qc29uJyksIG1lcmdlZEJsb2NrLm1pZ3JhdGlvblNjaGVtYSk7XG5cbiAgaWYgKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzKSB7XG4gICAgY29uc3QgdmFyaWF0aW9uc0RpciA9IHBhdGguam9pbihncm91cERpciwgJ3ZhcmlhdGlvbnMnKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmModmFyaWF0aW9uc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyh2YXJpYXRpb25zRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcy5qcykpIHtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ2JhYmVsJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbih2YXJpYXRpb25zRGlyLCBgJHt2YXJpYW50SWR9LmpzYCksIGZvcm1hdHRlZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMucGhwKSkge1xuICAgICAgY29uc3QgZm9ybWF0dGVkID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAncGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbih2YXJpYXRpb25zRGlyLCBgJHt2YXJpYW50SWR9LnBocGApLCBmb3JtYXR0ZWQpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkIG1lcmdlZCBibG9jazogJHtncm91cEJsb2NrTmFtZX0gKCR7Z3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OBICR7Z3JvdXBEaXJ9YCk7XG5cbiAgY29uc3QgcGx1Z2luRGlyID0gcGF0aC5kaXJuYW1lKG91dHB1dERpcik7XG4gIGNvbnN0IGNhdGVnb3JpZXNQaHAgPSBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAoZ3JvdXBDb21wb25lbnRzKTtcbiAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICBjb25zdCBpbmNsdWRlc0RpciA9IHBhdGguam9pbihwbHVnaW5EaXIsICdpbmNsdWRlcycpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGluY2x1ZGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgZnMud3JpdGVGaWxlU3luYyhjYXRlZ29yaWVzUGF0aCwgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG59O1xuXG5jb25zdCBjb21waWxlQWxsID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UpyBHdXRlbmJlcmcgQ29tcGlsZXIgLSBCYXRjaCBNb2RlYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke291dHB1dERpcn1gKTtcbiAgaWYgKGF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7YXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG5cbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgbGV0IHN1Y2Nlc3MgPSAwO1xuICAgIGxldCBmYWlsZWQgPSAwO1xuICAgIGNvbnN0IGNvbXBpbGVkQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgXG4gICAgLy8gRmV0Y2ggYWxsIGNvbXBvbmVudHMgZmlyc3Qgc28gd2UgY2FuIHBhcnRpdGlvbiBieSBncm91cFxuICAgIGNvbnN0IGFsbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQodGVtcGxhdGVWYWxpZGF0aW9uKSk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4pqg77iPICBTa2lwcGluZyAke2NvbXBvbmVudElkfSBkdWUgdG8gdGVtcGxhdGUgdmFyaWFibGUgZXJyb3JzYCk7XG4gICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhbGxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUGFydGl0aW9uIGNvbXBvbmVudHM6IG1lcmdlZCBncm91cHMgdnMgaW5kaXZpZHVhbFxuICAgIC8vIEJ1aWxkIGNhc2UtaW5zZW5zaXRpdmUgbG9va3VwOiBjb25maWcgbWF5IHNheSBcIkhlcm9cIiBidXQgQVBJIG9mdGVuIHJldHVybnMgXCJoZXJvXCJcbiAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICB9XG4gICAgY29uc3QgZ3JvdXBCdWNrZXRzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmQ29tcG9uZW50W10+ID0ge307XG4gICAgY29uc3QgaW5kaXZpZHVhbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgYWxsQ29tcG9uZW50cykge1xuICAgICAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA7XG4gICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBjb25maWdLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgaWYgKGNvbmZpZ0tleSkge1xuICAgICAgICBpZiAoIWdyb3VwQnVja2V0c1tjb25maWdLZXldKSBncm91cEJ1Y2tldHNbY29uZmlnS2V5XSA9IFtdO1xuICAgICAgICBncm91cEJ1Y2tldHNbY29uZmlnS2V5XS5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBpbmRpdmlkdWFsIGNvbXBvbmVudHMgKGV4aXN0aW5nIGJlaGF2aW9yKVxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGluZGl2aWR1YWxDb21wb25lbnRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBhcGlVcmwsIGNvbmZpZyk7XG4gICAgICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIGF1dGgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBzdWNjZXNzKys7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgJHtjb21wb25lbnQuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgbWVyZ2VkIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzXSBvZiBPYmplY3QuZW50cmllcyhncm91cEJ1Y2tldHMpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoYXBpVXJsLCBvdXRwdXREaXIsIGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzLCBhdXRoKTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goLi4uZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgc3VjY2VzcyArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlIG1lcmdlZCBncm91cCAke2dyb3VwU2x1Z306ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGNhdGVnb3JpZXMgUEhQIGZpbGUgYmFzZWQgb24gYWxsIGNvbXBpbGVkIGNvbXBvbmVudHNcbiAgICBpZiAoY29tcGlsZWRDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIEdlbmVyYXRpbmcgYmxvY2sgY2F0ZWdvcmllcy4uLmApO1xuICAgICAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChjb21waWxlZENvbXBvbmVudHMpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgICAgIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIHNoYXJlZCBjb21wb25lbnRzIGlmIGFueSBjb21wb25lbnQgaGFzIGR5bmFtaWMgYXJyYXkgY29uZmlnc1xuICAgIGNvbnN0IGhhc0R5bmFtaWNBcnJheXNJbkltcG9ydCA9IE9iamVjdC52YWx1ZXMoY29uZmlnLmltcG9ydCkuc29tZSh0eXBlQ29uZmlnID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdHlwZUNvbmZpZyAhPT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHR5cGVDb25maWcpLnNvbWUoY29tcENvbmZpZyA9PlxuICAgICAgICB0eXBlb2YgY29tcENvbmZpZyA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXMoY29tcENvbmZpZykubGVuZ3RoID4gMFxuICAgICAgKTtcbiAgICB9KTtcbiAgICBpZiAoaGFzRHluYW1pY0FycmF5c0luSW1wb3J0KSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBHZW5lcmF0aW5nIHNoYXJlZCBjb21wb25lbnRzLi4uYCk7XG4gICAgICBjb25zdCBzaGFyZWRDb21wb25lbnRzID0gZ2VuZXJhdGVTaGFyZWRDb21wb25lbnRzKCk7XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgW3JlbGF0aXZlUGF0aCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMoc2hhcmVkQ29tcG9uZW50cykpIHtcbiAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnLi4nLCByZWxhdGl2ZVBhdGgpO1xuICAgICAgICBjb25zdCBkaXJQYXRoID0gcGF0aC5kaXJuYW1lKGZ1bGxQYXRoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEVuc3VyZSBkaXJlY3RvcnkgZXhpc3RzXG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXJQYXRoKSkge1xuICAgICAgICAgIGZzLm1rZGlyU3luYyhkaXJQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gRm9ybWF0IGFuZCB3cml0ZSB0aGUgZmlsZVxuICAgICAgICBjb25zdCBmb3JtYXR0ZWRDb250ZW50ID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAnYmFiZWwnKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmdWxsUGF0aCwgZm9ybWF0dGVkQ29udGVudCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDwn5OEICR7cmVsYXRpdmVQYXRofWApO1xuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYOKchSBTaGFyZWQgY29tcG9uZW50cyBnZW5lcmF0ZWRgKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5jc3MgYW5kIG1haW4uanMgZGVzaWduIHN5c3RlbSBhc3NldHNcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+ToSBEb3dubG9hZGluZyBkZXNpZ24gc3lzdGVtIGFzc2V0cy4uLmApO1xuICAgIGNvbnN0IGFzc2V0c0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICcuLicsICdhc3NldHMnKTtcbiAgICBjb25zdCBhc3NldHNDc3NEaXIgPSBwYXRoLmpvaW4oYXNzZXRzRGlyLCAnY3NzJyk7XG4gICAgY29uc3QgYXNzZXRzSnNEaXIgPSBwYXRoLmpvaW4oYXNzZXRzRGlyLCAnanMnKTtcblxuICAgIGlmICghZnMuZXhpc3RzU3luYyhhc3NldHNDc3NEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoYXNzZXRzQ3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFzc2V0c0pzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGFzc2V0c0pzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBjc3NVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oYXNzZXRzQ3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICBjb25zdCBjc3NEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGNzc1VybCwgY3NzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGNzc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2Nzcy9tYWluLmNzc2ApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uY3NzIGZyb20gJHtjc3NVcmx9YCk7XG4gICAgfVxuXG4gICAgY29uc3QganNVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5qc2A7XG4gICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGFzc2V0c0pzRGlyLCAnbWFpbi5qcycpO1xuICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShqc1VybCwganNQYXRoLCBhdXRoKTtcbiAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9qcy9tYWluLmpzYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBDb21waWxhdGlvbiBjb21wbGV0ZSFgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFN1Y2Nlc3M6ICR7c3VjY2Vzc31gKTtcbiAgICBpZiAoZmFpbGVkID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKdjCBGYWlsZWQ6ICR7ZmFpbGVkfWApO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg8J+UgCBNZXJnZWQgZ3JvdXBzOiAke09iamVjdC5rZXlzKGdyb3VwQnVja2V0cykubGVuZ3RofWApO1xuICAgIH1cbiAgICBjb25zb2xlLmxvZyhgXFxuRG9uJ3QgZm9yZ2V0IHRvIHJ1biAnbnBtIHJ1biBidWlsZCcgaW4geW91ciBibG9ja3MgcGx1Z2luLlxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21waWxlIHRoZW1lIHRlbXBsYXRlcyAoaGVhZGVyLCBmb290ZXIpXG4gKi9cbmNvbnN0IGNvbXBpbGVUaGVtZSA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCfjqggVGhlbWUgVGVtcGxhdGUgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3V0cHV0RGlyfWApO1xuICBpZiAoYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHthdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gQ29tcGlsZSBoZWFkZXJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBoZWFkZXIgY29tcG9uZW50Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlciA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgJ2hlYWRlcicsIGF1dGgpO1xuICAgICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2hlYWRlci50aXRsZX1cXG5gKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBoZWFkZXIucGhwLi4uYCk7XG4gICAgICBjb25zdCBoZWFkZXJQaHAgPSBnZW5lcmF0ZUhlYWRlclBocChoZWFkZXIpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkSGVhZGVyID0gYXdhaXQgZm9ybWF0Q29kZShoZWFkZXJQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgaGVhZGVyUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICdoZWFkZXIucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGhlYWRlclBhdGgsIGZvcm1hdHRlZEhlYWRlcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtoZWFkZXJQYXRofVxcbmApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgSGVhZGVyIGNvbXBvbmVudCBub3QgZm91bmQgb3IgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBpbGUgZm9vdGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgZm9vdGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmb290ZXIgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsICdmb290ZXInLCBhdXRoKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtmb290ZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgZm9vdGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgZm9vdGVyUGhwID0gZ2VuZXJhdGVGb290ZXJQaHAoZm9vdGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEZvb3RlciA9IGF3YWl0IGZvcm1hdENvZGUoZm9vdGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGZvb3RlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnZm9vdGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhmb290ZXJQYXRoLCBmb3JtYXR0ZWRGb290ZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Zm9vdGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZvb3RlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBBbHNvIHRyeSBoZWFkZXItY29tcGFjdCBhbmQgZm9vdGVyLWNvbXBhY3QgaWYgdGhleSBleGlzdFxuICAgIC8vIFRoZXNlIGdvIGludG8gdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8gc3ViZm9sZGVyXG4gICAgY29uc3QgaGFuZG9mZlRlbXBsYXRlc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICd0ZW1wbGF0ZS1wYXJ0cycsICdoYW5kb2ZmJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoaGFuZG9mZlRlbXBsYXRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGdlbmVyYXRlZFRlbXBsYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgWydoZWFkZXItY29tcGFjdCcsICdoZWFkZXItbGFuZGVyJywgJ2Zvb3Rlci1jb21wYWN0J10pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgdmFyaWFudCwgYXV0aCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OhIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX1gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlVHlwZSA9IHZhcmlhbnQucmVwbGFjZSgvLS9nLCAnXycpO1xuICAgICAgICBjb25zdCBpc0hlYWRlciA9IHZhcmlhbnQuc3RhcnRzV2l0aCgnaGVhZGVyJyk7XG4gICAgICAgIGNvbnN0IHBocCA9IGlzSGVhZGVyIFxuICAgICAgICAgID8gZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpXG4gICAgICAgICAgOiBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocChjb21wb25lbnQsIHRlbXBsYXRlVHlwZSk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZFBocCA9IGF3YWl0IGZvcm1hdENvZGUocGhwLCAncGhwJyk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCBgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgZm9ybWF0dGVkUGhwKTtcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7ZmlsZVBhdGh9XFxuYCk7XG4gICAgICAgIGdlbmVyYXRlZFRlbXBsYXRlcy5wdXNoKGAke3ZhcmlhbnR9LnBocGApO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIFZhcmlhbnQgZG9lc24ndCBleGlzdCwgc2tpcCBzaWxlbnRseVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBSRUFETUUgZm9yIHRoZSBoYW5kb2ZmIHRlbXBsYXRlcyBmb2xkZXJcbiAgICBpZiAoZ2VuZXJhdGVkVGVtcGxhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHJlYWRtZUNvbnRlbnQgPSBgIyBIYW5kb2ZmIFRlbXBsYXRlIFBhcnRzXG5cbj4g4pqg77iPICoqRE8gTk9UIEVESVQgVEhFU0UgRklMRVMgRElSRUNUTFkqKlxuPlxuPiBUaGVzZSBmaWxlcyBhcmUgYXV0b21hdGljYWxseSBnZW5lcmF0ZWQgYnkgdGhlIEhhbmRvZmYgV29yZFByZXNzIGNvbXBpbGVyLlxuPiBBbnkgY2hhbmdlcyB3aWxsIGJlIG92ZXJ3cml0dGVuIG9uIHRoZSBuZXh0IHN5bmMuXG5cbiMjIFNvdXJjZVxuXG5UaGVzZSB0ZW1wbGF0ZXMgd2VyZSB0cmFuc3BpbGVkIGZyb20gdGhlIEhhbmRvZmYgZGVzaWduIHN5c3RlbS5cblxuLSAqKkFQSSBVUkw6KiogJHthcGlVcmx9XG4tICoqR2VuZXJhdGVkOioqICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfVxuXG4jIyBGaWxlc1xuXG4ke2dlbmVyYXRlZFRlbXBsYXRlcy5tYXAoZiA9PiBgLSBcXGAke2Z9XFxgYCkuam9pbignXFxuJyl9XG5cbiMjIFVzYWdlXG5cbkluY2x1ZGUgdGhlc2UgdGVtcGxhdGUgcGFydHMgaW4geW91ciB0aGVtZSB1c2luZzpcblxuXFxgXFxgXFxgcGhwXG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9oZWFkZXItY29tcGFjdCcpOyA/PlxuPD9waHAgZ2V0X3RlbXBsYXRlX3BhcnQoJ3RlbXBsYXRlLXBhcnRzL2hhbmRvZmYvZm9vdGVyLWNvbXBhY3QnKTsgPz5cblxcYFxcYFxcYFxuXG4jIyBSZWdlbmVyYXRpbmdcblxuVG8gcmVnZW5lcmF0ZSB0aGVzZSBmaWxlcywgcnVuOlxuXG5cXGBcXGBcXGBiYXNoXG5ucHggaGFuZG9mZi13cCAtLXRoZW1lXG5cXGBcXGBcXGBcblxuT3Igd2l0aCBhIHNwZWNpZmljIEFQSSBVUkw6XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWUgLS1hcGktdXJsICR7YXBpVXJsfVxuXFxgXFxgXFxgXG5gO1xuICAgICAgY29uc3QgcmVhZG1lUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCAnUkVBRE1FLm1kJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHJlYWRtZVBhdGgsIHJlYWRtZUNvbnRlbnQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk50gR2VuZXJhdGVkOiAke3JlYWRtZVBhdGh9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uY3NzIGFuZCBtYWluLmpzIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIHRoZW1lIGFzc2V0cy4uLmApO1xuICAgIFxuICAgIC8vIEVuc3VyZSBhc3NldHMgZGlyZWN0b3JpZXMgZXhpc3RcbiAgICBjb25zdCBjc3NEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2NzcycpO1xuICAgIGNvbnN0IGpzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Fzc2V0cycsICdqcycpO1xuICAgIFxuICAgIGlmICghZnMuZXhpc3RzU3luYyhjc3NEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoY3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGpzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGpzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5jc3NcbiAgICBjb25zdCBjc3NVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oY3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRG93bmxvYWRpbmcgbWFpbi5jc3MuLi5gKTtcbiAgICBjb25zdCBjc3NEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGNzc1VybCwgY3NzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGNzc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZDogJHtjc3NQYXRofWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uY3NzIGZyb20gJHtjc3NVcmx9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uanNcbiAgICBjb25zdCBqc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmpzYDtcbiAgICBjb25zdCBqc1BhdGggPSBwYXRoLmpvaW4oanNEaXIsICdtYWluLmpzJyk7XG4gICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uanMuLi5gKTtcbiAgICBjb25zdCBqc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoanNVcmwsIGpzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGpzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkOiAke2pzUGF0aH1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBUaGVtZSB0ZW1wbGF0ZXMgZ2VuZXJhdGVkIVxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHNpbmdsZSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGUgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPFZhbGlkYXRpb25SZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgXG4gIC8vIExvYWQgbWFuaWZlc3RcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgXG4gIC8vIFZhbGlkYXRlXG4gIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBcbiAgLy8gT3V0cHV0IHJlc3VsdFxuICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGVBbGwgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIEFsbCBDb21wb25lbnRzYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBGZXRjaCBjb21wb25lbnQgbGlzdFxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgaW1wb3J0Q29uZmlnLCBhdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgLy8gTG9hZCBtYW5pZmVzdFxuICAgIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgbGV0IHZhbGlkID0gMDtcbiAgICBsZXQgaW52YWxpZCA9IDA7XG4gICAgbGV0IG5ld0NvbXBvbmVudHMgPSAwO1xuICAgIGNvbnN0IGJyZWFraW5nQ2hhbmdlczogVmFsaWRhdGlvblJlc3VsdFtdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50SWQsIGF1dGgpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChyZXN1bHQuaXNOZXcpIHtcbiAgICAgICAgICBuZXdDb21wb25lbnRzKys7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICB2YWxpZCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGludmFsaWQrKztcbiAgICAgICAgICBicmVha2luZ0NoYW5nZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIHZhbGlkYXRlICR7Y29tcG9uZW50SWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFN1bW1hcnlcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGDwn5OKIFZhbGlkYXRpb24gU3VtbWFyeWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgVmFsaWQ6ICR7dmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKdjCBCcmVha2luZyBDaGFuZ2VzOiAke2ludmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKcqCBOZXcgQ29tcG9uZW50czogJHtuZXdDb21wb25lbnRzfWApO1xuICAgIFxuICAgIGlmIChicmVha2luZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgV0FSTklORzogJHticmVha2luZ0NoYW5nZXMubGVuZ3RofSBjb21wb25lbnQocykgaGF2ZSBicmVha2luZyBjaGFuZ2VzIWApO1xuICAgICAgY29uc29sZS5sb2coYCAgIFRoZXNlIGNoYW5nZXMgbWF5IGJyZWFrIGV4aXN0aW5nIFdvcmRQcmVzcyBjb250ZW50LlxcbmApO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudHMgd2l0aCBicmVha2luZyBjaGFuZ2VzOmApO1xuICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgYnJlYWtpbmdDaGFuZ2VzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAtICR7cmVzdWx0LmNvbXBvbmVudFRpdGxlfSAoJHtyZXN1bHQuY29tcG9uZW50SWR9KWApO1xuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYFxcbiAgIFRvIHByb2NlZWQgYW55d2F5LCBjb21waWxlIHdpdGggLS1mb3JjZSBmbGFnLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyoIEFsbCBjb21wb25lbnRzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHkhXFxuYCk7XG4gICAgfVxuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICovXG5jb25zdCB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudCA9IChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogdm9pZCA9PiB7XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdCA9IHVwZGF0ZU1hbmlmZXN0KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBzYXZlTWFuaWZlc3Qob3V0cHV0RGlyLCB1cGRhdGVkTWFuaWZlc3QpO1xufTtcblxuLy8gQ0xJIHNldHVwXG5wcm9ncmFtXG4gIC5uYW1lKCdndXRlbmJlcmctY29tcGlsZScpXG4gIC5kZXNjcmlwdGlvbignVHJhbnNwaWxlIEhhbmRvZmYgY29tcG9uZW50cyB0byBXb3JkUHJlc3MgR3V0ZW5iZXJnIGJsb2NrcyBhbmQgdGhlbWUgdGVtcGxhdGVzJylcbiAgLnZlcnNpb24oJzEuMC4wJyk7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBjb25maWcgZmlsZVxuICovXG5jb25zdCBpbml0Q29uZmlnID0gKG9wdHM6IHtcbiAgYXBpVXJsPzogc3RyaW5nO1xuICBvdXRwdXQ/OiBzdHJpbmc7XG4gIHRoZW1lRGlyPzogc3RyaW5nO1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIGZvcmNlPzogYm9vbGVhbjtcbn0pOiB2b2lkID0+IHtcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBcbiAgLy8gQ2hlY2sgaWYgY29uZmlnIGFscmVhZHkgZXhpc3RzXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpICYmICFvcHRzLmZvcmNlKSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29uZmlnIGZpbGUgYWxyZWFkeSBleGlzdHM6ICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVXNlIC0tZm9yY2UgdG8gb3ZlcndyaXRlLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgY29uc3QgbmV3Q29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7XG4gICAgYXBpVXJsOiBvcHRzLmFwaVVybCA/PyAnaHR0cHM6Ly95b3VyLWhhbmRvZmYtc2l0ZS5jb20nLFxuICAgIG91dHB1dDogb3B0cy5vdXRwdXQgPz8gJy4vZGVtby9wbHVnaW4vYmxvY2tzJyxcbiAgICB0aGVtZURpcjogb3B0cy50aGVtZURpciA/PyAnLi9kZW1vL3RoZW1lJyxcbiAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyAnJyxcbiAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyAnJyxcbiAgfTtcbiAgXG4gIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgXG4gIGNvbnNvbGUubG9nKGBcXG7inIUgQ3JlYXRlZCBjb25maWcgZmlsZTogJHtjb25maWdQYXRofWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uOmApO1xuICBjb25zb2xlLmxvZyhgICAgYXBpVXJsOiAgICR7bmV3Q29uZmlnLmFwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIG91dHB1dDogICAke25ld0NvbmZpZy5vdXRwdXR9YCk7XG4gIGNvbnNvbGUubG9nKGAgICB0aGVtZURpcjogJHtuZXdDb25maWcudGhlbWVEaXJ9YCk7XG4gIGlmIChuZXdDb25maWcudXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgdXNlcm5hbWU6ICR7bmV3Q29uZmlnLnVzZXJuYW1lfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBwYXNzd29yZDogKioqKmApO1xuICB9XG4gIGNvbnNvbGUubG9nKGBcXG7wn5KhIEVkaXQgdGhpcyBmaWxlIHRvIGNvbmZpZ3VyZSB5b3VyIEhhbmRvZmYgQVBJIHNldHRpbmdzLlxcbmApO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgaGVscGVyXG4gKi9cbmNvbnN0IHByb21wdCA9IChxdWVzdGlvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc3QgcmVhZGxpbmUgPSByZXF1aXJlKCdyZWFkbGluZScpO1xuICBjb25zdCBybCA9IHJlYWRsaW5lLmNyZWF0ZUludGVyZmFjZSh7XG4gICAgaW5wdXQ6IHByb2Nlc3Muc3RkaW4sXG4gICAgb3V0cHV0OiBwcm9jZXNzLnN0ZG91dCxcbiAgfSk7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBybC5xdWVzdGlvbihxdWVzdGlvbiwgKGFuc3dlcjogc3RyaW5nKSA9PiB7XG4gICAgICBybC5jbG9zZSgpO1xuICAgICAgcmVzb2x2ZShhbnN3ZXIudHJpbSgpKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBmb3IgeWVzL25vXG4gKi9cbmNvbnN0IHByb21wdFllc05vID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgY29uc3QgZGVmYXVsdFN0ciA9IGRlZmF1bHRWYWx1ZSA/ICdZL24nIDogJ3kvTic7XG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgJHtxdWVzdGlvbn0gWyR7ZGVmYXVsdFN0cn1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gIHJldHVybiBhbnN3ZXIudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCd5Jyk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCB3aXRoIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0Q2hvaWNlID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGNob2ljZXM6IHN0cmluZ1tdLCBkZWZhdWx0SW5kZXg6IG51bWJlciA9IDApOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxuJHtxdWVzdGlvbn1gKTtcbiAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGkpID0+IHtcbiAgICBjb25zdCBtYXJrZXIgPSBpID09PSBkZWZhdWx0SW5kZXggPyAnPicgOiAnICc7XG4gICAgY29uc29sZS5sb2coYCAgJHttYXJrZXJ9ICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlciBbJHtkZWZhdWx0SW5kZXggKyAxfV06IGApO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIGNob2ljZXNbZGVmYXVsdEluZGV4XTtcbiAgXG4gIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoYW5zd2VyLCAxMCkgLSAxO1xuICBpZiAoaW5kZXggPj0gMCAmJiBpbmRleCA8IGNob2ljZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGNob2ljZXNbaW5kZXhdO1xuICB9XG4gIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBmb3IgbXVsdGlwbGUgY2hvaWNlc1xuICovXG5jb25zdCBwcm9tcHRNdWx0aUNob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc29sZS5sb2coYCAgJHtpICsgMX0uICR7Y2hvaWNlfWApO1xuICB9KTtcbiAgXG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgRW50ZXIgbnVtYmVycyBzZXBhcmF0ZWQgYnkgY29tbWFzIChlLmcuLCAxLDIsMykgb3IgJ2FsbCc6IGApO1xuICBpZiAoYW5zd2VyLnRvTG93ZXJDYXNlKCkgPT09ICdhbGwnKSByZXR1cm4gY2hvaWNlcztcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBbY2hvaWNlc1swXV07XG4gIFxuICBjb25zdCBpbmRpY2VzID0gYW5zd2VyLnNwbGl0KCcsJykubWFwKHMgPT4gcGFyc2VJbnQocy50cmltKCksIDEwKSAtIDEpO1xuICByZXR1cm4gaW5kaWNlc1xuICAgIC5maWx0ZXIoaSA9PiBpID49IDAgJiYgaSA8IGNob2ljZXMubGVuZ3RoKVxuICAgIC5tYXAoaSA9PiBjaG9pY2VzW2ldKTtcbn07XG5cbi8qKlxuICogRmluZCBhbGwgYXJyYXkgcHJvcGVydGllcyBpbiBhIGNvbXBvbmVudFxuICovXG5jb25zdCBmaW5kQXJyYXlQcm9wZXJ0aWVzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9PiA9PiB7XG4gIGNvbnN0IGFycmF5czogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICBcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgYXJyYXlzLnB1c2goeyBwYXRoLCBwcm9wZXJ0eSB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdHNcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgYXJyYXlzLnB1c2goLi4uZmluZEFycmF5UHJvcGVydGllcyhwcm9wZXJ0eS5wcm9wZXJ0aWVzLCBwYXRoKSk7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gYXJyYXlzO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBmaWVsZCBtYXBwaW5nIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGFycmF5IGl0ZW0gcHJvcGVydGllc1xuICovXG5jb25zdCBzdWdnZXN0RmllbGRNYXBwaW5ncyA9IChpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPT4ge1xuICBjb25zdCBzdWdnZXN0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBcbiAgY29uc3QgbWFwUHJvcGVydHkgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpID0+IHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICAgIFxuICAgICAgLy8gU3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBjb21tb24gcGF0dGVybnNcbiAgICAgIGNvbnN0IGxvd2VyS2V5ID0ga2V5LnRvTG93ZXJDYXNlKCk7XG4gICAgICBcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2ltYWdlJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3Bob3RvJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3RodW1ibmFpbCcpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ2ZlYXR1cmVkX2ltYWdlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkgPT09ICd0aXRsZScgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2hlYWRpbmcnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnbmFtZScpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfdGl0bGUnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnZXhjZXJwdCcpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdzdW1tYXJ5JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2Rlc2NyaXB0aW9uJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9leGNlcnB0JztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2NvbnRlbnQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnYm9keScpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfY29udGVudCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndXJsJyB8fCBsb3dlcktleSA9PT0gJ2hyZWYnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdsaW5rJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncGVybWFsaW5rJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2RhdGUnKSkge1xuICAgICAgICBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2RheScpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmRheV9udW1lcmljJztcbiAgICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnbW9udGgnKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTptb250aF9zaG9ydCc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ3llYXInKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTp5ZWFyJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6ZnVsbCc7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2F1dGhvcicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ2F1dGhvci5uYW1lJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2NhdGVnb3J5JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3RhZycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3RheG9ub215OmNhdGVnb3J5JztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG5lc3RlZCBvYmplY3RzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgbWFwUHJvcGVydHkocHJvcC5wcm9wZXJ0aWVzLCBwYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBtYXBQcm9wZXJ0eShpdGVtUHJvcGVydGllcyk7XG4gIHJldHVybiBzdWdnZXN0aW9ucztcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgd2l6YXJkIGZvciBjb25maWd1cmluZyBkeW5hbWljIGFycmF5c1xuICovXG5jb25zdCBjb25maWd1cmVEeW5hbWljQXJyYXlzID0gYXN5bmMgKFxuICBhcGlVcmw6IHN0cmluZyxcbiAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuICBhdXRoPzogQXV0aENyZWRlbnRpYWxzXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCfp5kgRHluYW1pYyBBcnJheSBDb25maWd1cmF0aW9uIFdpemFyZGApO1xuICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50OiAke2NvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfVxcbmApO1xuICBcbiAgLy8gRmV0Y2ggY29tcG9uZW50XG4gIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBzdHJ1Y3R1cmUuLi5gKTtcbiAgbGV0IGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudDtcbiAgdHJ5IHtcbiAgICBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9ICgke2NvbXBvbmVudC5pZH0pXFxuYCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG4gIFxuICAvLyBGaW5kIGFycmF5IHByb3BlcnRpZXNcbiAgY29uc3QgYXJyYXlQcm9wcyA9IGZpbmRBcnJheVByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICBcbiAgaWYgKGFycmF5UHJvcHMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgTm8gYXJyYXkgcHJvcGVydGllcyBmb3VuZCBpbiB0aGlzIGNvbXBvbmVudC5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRHluYW1pYyBhcnJheXMgYXJlIG9ubHkgYXZhaWxhYmxlIGZvciBhcnJheS10eXBlIHByb3BlcnRpZXMuXFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhg8J+TiyBGb3VuZCAke2FycmF5UHJvcHMubGVuZ3RofSBhcnJheSBmaWVsZChzKTpgKTtcbiAgYXJyYXlQcm9wcy5mb3JFYWNoKChhcnIsIGkpID0+IHtcbiAgICBjb25zdCBpdGVtQ291bnQgPSBhcnIucHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgPyBPYmplY3Qua2V5cyhhcnIucHJvcGVydHkuaXRlbXMucHJvcGVydGllcykubGVuZ3RoIDogMDtcbiAgICBjb25zb2xlLmxvZyhgICAgJHtpICsgMX0uICR7YXJyLnBhdGh9ICgke2l0ZW1Db3VudH0gaXRlbSBwcm9wZXJ0aWVzKWApO1xuICB9KTtcbiAgXG4gIC8vIFNlbGVjdCB3aGljaCBhcnJheXMgdG8gY29uZmlndXJlXG4gIGNvbnN0IHNlbGVjdGVkQXJyYXlzID0gYXJyYXlQcm9wcy5sZW5ndGggPT09IDEgXG4gICAgPyBbYXJyYXlQcm9wc1swXV1cbiAgICA6IGF3YWl0IChhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNob2ljZXMgPSBhcnJheVByb3BzLm1hcChhID0+IGEucGF0aCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcHJvbXB0TXVsdGlDaG9pY2UoJ1doaWNoIGFycmF5KHMpIGRvIHlvdSB3YW50IHRvIGNvbmZpZ3VyZT8nLCBjaG9pY2VzKTtcbiAgICAgICAgcmV0dXJuIGFycmF5UHJvcHMuZmlsdGVyKGEgPT4gc2VsZWN0ZWQuaW5jbHVkZXMoYS5wYXRoKSk7XG4gICAgICB9KSgpO1xuICBcbiAgLy8gTG9hZCBleGlzdGluZyBjb25maWdcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBsZXQgZXhpc3RpbmdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHt9O1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBleGlzdGluZ0NvbmZpZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIElnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEJ1aWxkIHRoZSBpbXBvcnQgY29uZmlnLCBwcmVzZXJ2aW5nIGV4aXN0aW5nIGVudHJpZXNcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSBleGlzdGluZ0NvbmZpZy5pbXBvcnQgfHwgeyBlbGVtZW50OiBmYWxzZSB9O1xuICBpZiAoIWltcG9ydENvbmZpZy5ibG9jayB8fCB0eXBlb2YgaW1wb3J0Q29uZmlnLmJsb2NrID09PSAnYm9vbGVhbicpIHtcbiAgICBpbXBvcnRDb25maWcuYmxvY2sgPSB7fTtcbiAgfVxuICBjb25zdCBibG9ja0NvbmZpZyA9IGltcG9ydENvbmZpZy5ibG9jayBhcyBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+O1xuICBpZiAoIWJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gPT09ICdib29sZWFuJykge1xuICAgIGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gPSB7fTtcbiAgfVxuICBjb25zdCBjb21wb25lbnRGaWVsZENvbmZpZyA9IGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gYXMgUmVjb3JkPHN0cmluZywgRmllbGRDb25maWc+O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVQb3N0c0FycmF5ID0gYXN5bmMgKGFycmF5UHJvcDogeyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfSk6IFByb21pc2U8RHluYW1pY0FycmF5Q29uZmlnPiA9PiB7XG4gICAgLy8gU2VsZWN0aW9uIG1vZGVcbiAgICBjb25zdCBzZWxlY3Rpb25Nb2RlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ0hvdyBzaG91bGQgdXNlcnMgc2VsZWN0IHBvc3RzPycsXG4gICAgICBbJ1F1ZXJ5IEJ1aWxkZXIgKGZpbHRlciBieSB0YXhvbm9teSwgb3JkZXIsIGV0Yy4pJywgJ01hbnVhbCBTZWxlY3Rpb24gKGhhbmQtcGljayBzcGVjaWZpYyBwb3N0cyknXSxcbiAgICAgIDBcbiAgICApO1xuICAgIGNvbnN0IGlzUXVlcnlNb2RlID0gc2VsZWN0aW9uTW9kZS5pbmNsdWRlcygnUXVlcnknKTtcblxuICAgIC8vIFBvc3QgdHlwZXNcbiAgICBjb25zb2xlLmxvZyhgXFxuRW50ZXIgYWxsb3dlZCBwb3N0IHR5cGVzIChjb21tYS1zZXBhcmF0ZWQpOmApO1xuICAgIGNvbnN0IHBvc3RUeXBlc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBQb3N0IHR5cGVzIFtwb3N0XTogYCk7XG4gICAgY29uc3QgcG9zdFR5cGVzID0gcG9zdFR5cGVzSW5wdXRcbiAgICAgID8gcG9zdFR5cGVzSW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdCddO1xuXG4gICAgLy8gTWF4IGl0ZW1zXG4gICAgY29uc3QgbWF4SXRlbXNJbnB1dCA9IGF3YWl0IHByb21wdChgTWF4aW11bSBpdGVtcyBbMTJdOiBgKTtcbiAgICBjb25zdCBtYXhJdGVtcyA9IG1heEl0ZW1zSW5wdXQgPyBwYXJzZUludChtYXhJdGVtc0lucHV0LCAxMCkgOiAxMjtcblxuICAgIC8vIFJlbmRlciBtb2RlXG4gICAgY29uc3QgcmVuZGVyTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHBvc3RzIGJlIHJlbmRlcmVkPycsXG4gICAgICBbJ01hcHBlZCAoY29udmVydCBwb3N0IGZpZWxkcyB0byB0ZW1wbGF0ZSBzdHJ1Y3R1cmUpJywgJ1RlbXBsYXRlICh1c2UgYSBQSFAgdGVtcGxhdGUgZmlsZSknXSxcbiAgICAgIDBcbiAgICApO1xuICAgIGNvbnN0IGlzTWFwcGVkTW9kZSA9IHJlbmRlck1vZGUuaW5jbHVkZXMoJ01hcHBlZCcpO1xuXG4gICAgbGV0IGZpZWxkTWFwcGluZzogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGxldCB0ZW1wbGF0ZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIGlmIChpc01hcHBlZE1vZGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OKIEZpZWxkIE1hcHBpbmcgQ29uZmlndXJhdGlvbmApO1xuXG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBhcnJheVByb3AucHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXM7XG4gICAgICBpZiAoaXRlbVByb3BzKSB7XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gc3VnZ2VzdEZpZWxkTWFwcGluZ3MoaXRlbVByb3BzKTtcblxuICAgICAgICBjb25zb2xlLmxvZyhgXFxuSSdsbCBzdWdnZXN0IG1hcHBpbmdzIGJhc2VkIG9uIGZpZWxkIG5hbWVzLiBQcmVzcyBFbnRlciB0byBhY2NlcHQgb3IgdHlwZSBhIG5ldyB2YWx1ZS5gKTtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbkF2YWlsYWJsZSBzb3VyY2VzOmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHBvc3RfdGl0bGUsIHBvc3RfZXhjZXJwdCwgcG9zdF9jb250ZW50LCBwZXJtYWxpbmssIHBvc3RfaWRgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBmZWF0dXJlZF9pbWFnZWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHBvc3RfZGF0ZTpkYXksIHBvc3RfZGF0ZTptb250aF9zaG9ydCwgcG9zdF9kYXRlOnllYXIsIHBvc3RfZGF0ZTpmdWxsYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gYXV0aG9yLm5hbWUsIGF1dGhvci51cmwsIGF1dGhvci5hdmF0YXJgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSB0YXhvbm9teTpjYXRlZ29yeSwgdGF4b25vbXk6cG9zdF90YWdgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBtZXRhOmZpZWxkX25hbWVgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSAobGVhdmUgZW1wdHkgdG8gc2tpcClcXG5gKTtcblxuICAgICAgICBjb25zdCBmbGF0dGVuUHJvcHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgY29uc3QgcGF0aHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICAgICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaCguLi5mbGF0dGVuUHJvcHMocHJvcC5wcm9wZXJ0aWVzLCBwKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXRocy5wdXNoKHApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcGF0aHM7XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZFBhdGggb2YgZmxhdHRlblByb3BzKGl0ZW1Qcm9wcykpIHtcbiAgICAgICAgICBjb25zdCBzdWdnZXN0aW9uID0gc3VnZ2VzdGlvbnNbZmllbGRQYXRoXSB8fCAnJztcbiAgICAgICAgICBjb25zdCBkZWZhdWx0U3RyID0gc3VnZ2VzdGlvbiA/IGAgWyR7c3VnZ2VzdGlvbn1dYCA6ICcnO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSBhd2FpdCBwcm9tcHQoYCAgJHtmaWVsZFBhdGh9JHtkZWZhdWx0U3RyfTogYCk7XG4gICAgICAgICAgY29uc3QgZmluYWxNYXBwaW5nID0gbWFwcGluZyB8fCBzdWdnZXN0aW9uO1xuICAgICAgICAgIGlmIChmaW5hbE1hcHBpbmcpIHtcbiAgICAgICAgICAgIGlmIChmaW5hbE1hcHBpbmcuc3RhcnRzV2l0aCgneycpKSB7XG4gICAgICAgICAgICAgIHRyeSB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gSlNPTi5wYXJzZShmaW5hbE1hcHBpbmcpOyB9XG4gICAgICAgICAgICAgIGNhdGNoIHsgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBmaW5hbE1hcHBpbmc7IH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBkZWZhdWx0VGVtcGxhdGUgPSBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2FycmF5UHJvcC5wYXRofS1pdGVtLnBocGA7XG4gICAgICB0ZW1wbGF0ZVBhdGggPSBhd2FpdCBwcm9tcHQoYFRlbXBsYXRlIHBhdGggWyR7ZGVmYXVsdFRlbXBsYXRlfV06IGApIHx8IGRlZmF1bHRUZW1wbGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBhcnJheUNvbmZpZzogRHluYW1pY0FycmF5Q29uZmlnID0ge1xuICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgIHBvc3RUeXBlcyxcbiAgICAgIHNlbGVjdGlvbk1vZGU6IGlzUXVlcnlNb2RlID8gJ3F1ZXJ5JyA6ICdtYW51YWwnLFxuICAgICAgbWF4SXRlbXMsXG4gICAgICByZW5kZXJNb2RlOiBpc01hcHBlZE1vZGUgPyAnbWFwcGVkJyA6ICd0ZW1wbGF0ZScsXG4gICAgfTtcbiAgICBpZiAoaXNNYXBwZWRNb2RlICYmIE9iamVjdC5rZXlzKGZpZWxkTWFwcGluZykubGVuZ3RoID4gMCkgYXJyYXlDb25maWcuZmllbGRNYXBwaW5nID0gZmllbGRNYXBwaW5nO1xuICAgIGlmICghaXNNYXBwZWRNb2RlICYmIHRlbXBsYXRlUGF0aCkgYXJyYXlDb25maWcudGVtcGxhdGVQYXRoID0gdGVtcGxhdGVQYXRoO1xuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgYXJyYXlDb25maWcuZGVmYXVsdFF1ZXJ5QXJncyA9IHtcbiAgICAgICAgcG9zdHNfcGVyX3BhZ2U6IE1hdGgubWluKG1heEl0ZW1zLCA2KSxcbiAgICAgICAgb3JkZXJieTogJ2RhdGUnLFxuICAgICAgICBvcmRlcjogJ0RFU0MnLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGFycmF5Q29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkgPSBhc3luYyAoKTogUHJvbWlzZTxCcmVhZGNydW1ic0FycmF5Q29uZmlnPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIEJyZWFkY3J1bWJzIGFyZSBidWlsdCBhdXRvbWF0aWNhbGx5IGZyb20gdGhlIGN1cnJlbnQgcGFnZSBVUkwuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igd2lsbCBzaG93IGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcbiAgICByZXR1cm4geyBhcnJheVR5cGU6ICdicmVhZGNydW1icycgfTtcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIFRheG9ub215QXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVUYXhvbm9teUFycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8VGF4b25vbXlBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBUYXhvbm9teSB0ZXJtcyBhcmUgZmV0Y2hlZCBmcm9tIHRoZSBjdXJyZW50IHBvc3Qgc2VydmVyLXNpZGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igc2hvd3MgYSB0b2dnbGUgYW5kIGEgZHJvcGRvd24gdG8gY2hvb3NlIHRoZSB0YXhvbm9teS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgc2x1ZyB9XFxuYCk7XG5cbiAgICBjb25zb2xlLmxvZyhgRW50ZXIgdGhlIHRheG9ub215IHNsdWdzIGVkaXRvcnMgY2FuIGNob29zZSBmcm9tIChjb21tYS1zZXBhcmF0ZWQpOmApO1xuICAgIGNvbnN0IHRheG9ub215SW5wdXQgPSBhd2FpdCBwcm9tcHQoYFRheG9ub21pZXMgW3Bvc3RfdGFnLGNhdGVnb3J5XTogYCk7XG4gICAgY29uc3QgdGF4b25vbWllcyA9IHRheG9ub215SW5wdXRcbiAgICAgID8gdGF4b25vbXlJbnB1dC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgIDogWydwb3N0X3RhZycsICdjYXRlZ29yeSddO1xuXG4gICAgY29uc3QgbWF4SXRlbXNJbnB1dCA9IGF3YWl0IHByb21wdChgTWF4aW11bSB0ZXJtcyB0byBkaXNwbGF5ICgtMSA9IGFsbCkgWy0xXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogLTE7XG5cbiAgICBjb25zdCBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcgPSB7IGFycmF5VHlwZTogJ3RheG9ub215JywgdGF4b25vbWllcyB9O1xuICAgIGlmIChtYXhJdGVtcyA+IDApIGNvbmZpZy5tYXhJdGVtcyA9IG1heEl0ZW1zO1xuICAgIHJldHVybiBjb25maWc7XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBQYWdpbmF0aW9uQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkgPSBhc3luYyAob3RoZXJBcnJheVBhdGhzOiBzdHJpbmdbXSk6IFByb21pc2U8UGFnaW5hdGlvbkFycmF5Q29uZmlnIHwgbnVsbD4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBQYWdpbmF0aW9uIGxpbmtzIGFyZSBkZXJpdmVkIGF1dG9tYXRpY2FsbHkgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXkgcXVlcnkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igc2hvd3MgYSBzaW5nbGUgZW5hYmxlL2Rpc2FibGUgdG9nZ2xlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBhY3RpdmUgfVxcbmApO1xuXG4gICAgaWYgKG90aGVyQXJyYXlQYXRocy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDimqDvuI8gIE5vIHNpYmxpbmcgYXJyYXlzIGZvdW5kIHRvIGNvbm5lY3QgdG8uIENvbmZpZ3VyZSBhIHBvc3RzIGFycmF5IGZpcnN0LmApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbGV0IGNvbm5lY3RlZEZpZWxkOiBzdHJpbmc7XG4gICAgaWYgKG90aGVyQXJyYXlQYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgIGNvbm5lY3RlZEZpZWxkID0gb3RoZXJBcnJheVBhdGhzWzBdO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbm5lY3RlZCB0bzogJHtjb25uZWN0ZWRGaWVsZH0gKG9ubHkgb3B0aW9uKWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAgICdXaGljaCBwb3N0cyBhcnJheSBzaG91bGQgdGhpcyBwYWdpbmF0aW9uIGJlIGNvbm5lY3RlZCB0bz8nLFxuICAgICAgICBvdGhlckFycmF5UGF0aHMsXG4gICAgICAgIDBcbiAgICAgICk7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IGNob2ljZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBhcnJheVR5cGU6ICdwYWdpbmF0aW9uJywgY29ubmVjdGVkRmllbGQgfTtcbiAgfTtcblxuICAvLyBDb25maWd1cmUgZWFjaCBzZWxlY3RlZCBhcnJheVxuICBmb3IgKGNvbnN0IGFycmF5UHJvcCBvZiBzZWxlY3RlZEFycmF5cykge1xuICAgIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgQ29uZmlndXJpbmc6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofVxcbmApO1xuXG4gICAgLy8gTGV0IHRoZSB1c2VyIGNob29zZSB0aGUgYXJyYXkgdHlwZVxuICAgIGNvbnN0IGFycmF5VHlwZUNob2ljZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdXaGF0IGtpbmQgb2YgZGF0YSBzaG91bGQgdGhpcyBhcnJheSBjb250YWluPycsXG4gICAgICBbXG4gICAgICAgICdQb3N0cyDigJQgcXVlcnkgb3IgaGFuZC1waWNrIFdvcmRQcmVzcyBwb3N0cyAoZGVmYXVsdCknLFxuICAgICAgICAnQnJlYWRjcnVtYnMg4oCUIGF1dG8tZ2VuZXJhdGVkIHRyYWlsIGZyb20gY3VycmVudCBVUkwnLFxuICAgICAgICAnVGF4b25vbXkg4oCUIHRlcm1zIGF0dGFjaGVkIHRvIHRoZSBjdXJyZW50IHBvc3QnLFxuICAgICAgICAnUGFnaW5hdGlvbiDigJQgbGlua3MgZGVyaXZlZCBmcm9tIGEgc2libGluZyBwb3N0cyBhcnJheScsXG4gICAgICBdLFxuICAgICAgMFxuICAgICk7XG5cbiAgICBsZXQgYXJyYXlDb25maWc6IEZpZWxkQ29uZmlnIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ0JyZWFkY3J1bWJzJykpIHtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlQnJlYWRjcnVtYnNBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ1RheG9ub215JykpIHtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlVGF4b25vbXlBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ1BhZ2luYXRpb24nKSkge1xuICAgICAgLy8gT2ZmZXIgdGhlIG90aGVyIGFscmVhZHktY29uZmlndXJlZCAob3IgeWV0LXRvLWJlLWNvbmZpZ3VyZWQpIGFycmF5IHBhdGhzIGFzIGNhbmRpZGF0ZXNcbiAgICAgIGNvbnN0IHNpYmxpbmcgPSBzZWxlY3RlZEFycmF5c1xuICAgICAgICAuZmlsdGVyKGEgPT4gYS5wYXRoICE9PSBhcnJheVByb3AucGF0aClcbiAgICAgICAgLm1hcChhID0+IGEucGF0aCk7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBhZ2luYXRpb25BcnJheShzaWJsaW5nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUG9zdHNcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlUG9zdHNBcnJheShhcnJheVByb3ApO1xuICAgIH1cblxuICAgIGlmIChhcnJheUNvbmZpZykge1xuICAgICAgY29tcG9uZW50RmllbGRDb25maWdbYXJyYXlQcm9wLnBhdGhdID0gYXJyYXlDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyFIENvbmZpZ3VyZWQ6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofSAoJHsoYXJyYXlDb25maWcgYXMgYW55KS5hcnJheVR5cGUgPz8gJ3Bvc3RzJ30pYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIFNraXBwZWQ6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofWApO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gVXBkYXRlIGNvbmZpZyBmaWxlIOKAlCByZW1vdmUgbGVnYWN5IGR5bmFtaWNBcnJheXMgaWYgcHJlc2VudFxuICBjb25zdCB7IGR5bmFtaWNBcnJheXM6IF9sZWdhY3lEeW5hbWljLCAuLi5yZXN0Q29uZmlnIH0gPSBleGlzdGluZ0NvbmZpZztcbiAgY29uc3QgbmV3Q29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7XG4gICAgLi4ucmVzdENvbmZpZyxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgfTtcbiAgXG4gIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5OEIENvbmZpZ3VyYXRpb24gUHJldmlldzpcXG5gKTtcbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoeyBpbXBvcnQ6IGltcG9ydENvbmZpZyB9LCBudWxsLCAyKSk7XG4gIFxuICBjb25zdCBzaG91bGRTYXZlID0gYXdhaXQgcHJvbXB0WWVzTm8oJ1xcblNhdmUgdG8gaGFuZG9mZi13cC5jb25maWcuanNvbj8nLCB0cnVlKTtcbiAgXG4gIGlmIChzaG91bGRTYXZlKSB7XG4gICAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShuZXdDb25maWcsIG51bGwsIDIpICsgJ1xcbicpO1xuICAgIGNvbnNvbGUubG9nKGBcXG7inIUgU2F2ZWQgdG8gJHtjb25maWdQYXRofWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIE5leHQgc3RlcHM6YCk7XG4gICAgY29uc29sZS5sb2coYCAgIDEuIFJ1bjogbnBtIHJ1biBkZXYgLS0gJHtjb21wb25lbnROYW1lfSAtLWZvcmNlYCk7XG4gICAgY29uc29sZS5sb2coYCAgIDIuIEJ1aWxkIHlvdXIgYmxvY2tzOiBjZCBkZW1vL3BsdWdpbiAmJiBucG0gcnVuIGJ1aWxkYCk7XG4gICAgY29uc29sZS5sb2coYCAgIDMuIFRlc3QgdGhlIGJsb2NrIGluIFdvcmRQcmVzc1xcbmApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZ3VyYXRpb24gbm90IHNhdmVkLiBDb3B5IHRoZSBKU09OIGFib3ZlIG1hbnVhbGx5IGlmIG5lZWRlZC5cXG5gKTtcbiAgfVxufTtcblxuLy8gQ29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGNvbW1hbmRcbnByb2dyYW1cbiAgLmNvbW1hbmQoJ2NvbmZpZ3VyZS1keW5hbWljIFtjb21wb25lbnRdJylcbiAgLmFsaWFzKCd3aXphcmQnKVxuICAuZGVzY3JpcHRpb24oJ0ludGVyYWN0aXZlIHdpemFyZCB0byBjb25maWd1cmUgZHluYW1pYyBhcnJheXMgZm9yIGEgY29tcG9uZW50JylcbiAgLm9wdGlvbignLWEsIC0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy1wLCAtLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCcpXG4gIC5vcHRpb24oJy1sLCAtLWxpc3QnLCAnTGlzdCBhdmFpbGFibGUgY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkcycpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czoge1xuICAgIGFwaVVybD86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICBsaXN0PzogYm9vbGVhbjtcbiAgfSkgPT4ge1xuICAgIGNvbnN0IGFwaVVybCA9IG9wdHMuYXBpVXJsID8/IGNvbmZpZy5hcGlVcmw7XG4gICAgY29uc3QgYXV0aDogQXV0aENyZWRlbnRpYWxzID0ge1xuICAgICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gY29uZmlnLnVzZXJuYW1lLFxuICAgICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gY29uZmlnLnBhc3N3b3JkLFxuICAgIH07XG4gICAgXG4gICAgLy8gSWYgbGlzdGluZyBjb21wb25lbnRzLCBzaG93IGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICBpZiAob3B0cy5saXN0IHx8ICFjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBGZXRjaGluZyBjb21wb25lbnQgbGlzdCBmcm9tICR7YXBpVXJsfS4uLlxcbmApO1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZldGNoIGVhY2ggY29tcG9uZW50IHRvIGZpbmQgb25lcyB3aXRoIGFycmF5IGZpZWxkc1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+TiyBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHMuIENoZWNraW5nIGZvciBhcnJheSBmaWVsZHMuLi5cXG5gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHNXaXRoQXJyYXlzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGFycmF5czogc3RyaW5nW10gfT4gPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgaWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgaWQsIGF1dGgpO1xuICAgICAgICAgICAgY29uc3QgYXJyYXlzID0gZmluZEFycmF5UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gICAgICAgICAgICBpZiAoYXJyYXlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgY29tcG9uZW50c1dpdGhBcnJheXMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgICAgdGl0bGU6IGNvbXBvbmVudC50aXRsZSxcbiAgICAgICAgICAgICAgICBhcnJheXM6IGFycmF5cy5tYXAoYSA9PiBhLnBhdGgpLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIFNraXAgZmFpbGVkIGNvbXBvbmVudHNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjb21wb25lbnRzV2l0aEFycmF5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pqg77iPICBObyBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzIGZvdW5kLlxcbmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYPCfp6kgQ29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkczpcXG5gKTtcbiAgICAgICAgY29tcG9uZW50c1dpdGhBcnJheXMuZm9yRWFjaCgoYywgaSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2kgKyAxfS4gJHtjLnRpdGxlfSAoJHtjLmlkfSlgKTtcbiAgICAgICAgICBjLmFycmF5cy5mb3JFYWNoKGEgPT4gY29uc29sZS5sb2coYCAgICAgIOKUlOKUgCAke2F9YCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIGlmIChvcHRzLmxpc3QpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBSdW46IG5wbSBydW4gZGV2IC0tIHdpemFyZCA8Y29tcG9uZW50LWlkPlxcbmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gSW50ZXJhY3RpdmUgc2VsZWN0aW9uXG4gICAgICAgIGNvbnN0IGNob2ljZXMgPSBjb21wb25lbnRzV2l0aEFycmF5cy5tYXAoYyA9PiBgJHtjLnRpdGxlfSAoJHtjLmlkfSlgKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwcm9tcHRDaG9pY2UoJ1xcblNlbGVjdCBhIGNvbXBvbmVudCB0byBjb25maWd1cmU6JywgY2hvaWNlcywgMCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkSW5kZXggPSBjaG9pY2VzLmluZGV4T2Yoc2VsZWN0ZWQpO1xuICAgICAgICBjb21wb25lbnROYW1lID0gY29tcG9uZW50c1dpdGhBcnJheXNbc2VsZWN0ZWRJbmRleF0uaWQ7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgYXdhaXQgY29uZmlndXJlRHluYW1pY0FycmF5cyhhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICB9KTtcblxuLy8gSW5pdCBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdpbml0JylcbiAgLmRlc2NyaXB0aW9uKCdDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4gdGhlIGN1cnJlbnQgZGlyZWN0b3J5JylcbiAgLm9wdGlvbignLS1hcGktdXJsIDx1cmw+JywgJ0hhbmRvZmYgQVBJIGJhc2UgVVJMJylcbiAgLm9wdGlvbignLS1vdXRwdXQgPGRpcj4nLCAnT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzJylcbiAgLm9wdGlvbignLS10aGVtZS1kaXIgPGRpcj4nLCAnVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcycpXG4gIC5vcHRpb24oJy0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lJylcbiAgLm9wdGlvbignLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctLWZvcmNlJywgJ092ZXJ3cml0ZSBleGlzdGluZyBjb25maWcgZmlsZScpXG4gIC5hY3Rpb24oKG9wdGlvbnMsIGNvbW1hbmQpID0+IHtcbiAgICAvLyBVc2Ugb3B0c1dpdGhHbG9iYWxzIHRvIGdldCBvcHRpb25zIGZyb20gYm90aCBzdWJjb21tYW5kIGFuZCBwYXJlbnRcbiAgICBjb25zdCBvcHRzID0gY29tbWFuZC5vcHRzV2l0aEdsb2JhbHMoKTtcbiAgICBpbml0Q29uZmlnKG9wdHMpO1xuICB9KTtcblxuLy8gRGVmYXVsdCBjb21tYW5kIGZvciBibG9ja3NcbnByb2dyYW1cbiAgLmFyZ3VtZW50KCdbY29tcG9uZW50XScsICdDb21wb25lbnQgbmFtZSB0byBjb21waWxlIG9yIHZhbGlkYXRlJylcbiAgLm9wdGlvbignLWEsIC0tYXBpLXVybCA8dXJsPicsIGBIYW5kb2ZmIEFQSSBiYXNlIFVSTCAoZGVmYXVsdDogJHtjb25maWcuYXBpVXJsfSlgKVxuICAub3B0aW9uKCctbywgLS1vdXRwdXQgPGRpcj4nLCBgT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzIChkZWZhdWx0OiAke2NvbmZpZy5vdXRwdXR9KWApXG4gIC5vcHRpb24oJy0tYWxsJywgJ0NvbXBpbGUgYWxsIGF2YWlsYWJsZSBjb21wb25lbnRzJylcbiAgLm9wdGlvbignLS10aGVtZScsICdDb21waWxlIHRoZW1lIHRlbXBsYXRlcyAoaGVhZGVyLCBmb290ZXIpIHRvIHRoZW1lIGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy10LCAtLXRoZW1lLWRpciA8ZGlyPicsIGBUaGVtZSBkaXJlY3RvcnkgZm9yIGhlYWRlci9mb290ZXIgdGVtcGxhdGVzIChkZWZhdWx0OiAke2NvbmZpZy50aGVtZURpcn0pYClcbiAgLm9wdGlvbignLXUsIC0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lIGZvciBIYW5kb2ZmIEFQSScpXG4gIC5vcHRpb24oJy1wLCAtLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctLXZhbGlkYXRlJywgJ1ZhbGlkYXRlIGEgY29tcG9uZW50IGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZS1hbGwnLCAnVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXMnKVxuICAub3B0aW9uKCctLWZvcmNlJywgJ0ZvcmNlIGNvbXBpbGF0aW9uIGV2ZW4gd2l0aCBicmVha2luZyBjaGFuZ2VzJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7IFxuICAgIGFwaVVybD86IHN0cmluZzsgXG4gICAgb3V0cHV0Pzogc3RyaW5nOyBcbiAgICBhbGw/OiBib29sZWFuOyBcbiAgICB0aGVtZT86IGJvb2xlYW47XG4gICAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgdmFsaWRhdGU/OiBib29sZWFuO1xuICAgIHZhbGlkYXRlQWxsPzogYm9vbGVhbjtcbiAgICBmb3JjZT86IGJvb2xlYW47XG4gIH0pID0+IHtcbiAgICAvLyBNZXJnZSBDTEkgb3B0aW9ucyB3aXRoIGNvbmZpZyAoQ0xJIHRha2VzIHByZWNlZGVuY2UpXG4gICAgY29uc3QgYXBpVXJsID0gb3B0cy5hcGlVcmwgPz8gY29uZmlnLmFwaVVybDtcbiAgICBjb25zdCBvdXRwdXQgPSBvcHRzLm91dHB1dCA/PyBjb25maWcub3V0cHV0O1xuICAgIGNvbnN0IHRoZW1lRGlyID0gb3B0cy50aGVtZURpciA/PyBjb25maWcudGhlbWVEaXI7XG4gICAgY29uc3QgYXV0aDogQXV0aENyZWRlbnRpYWxzID0ge1xuICAgICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gY29uZmlnLnVzZXJuYW1lLFxuICAgICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gY29uZmlnLnBhc3N3b3JkLFxuICAgIH07XG4gICAgXG4gICAgLy8gVmFsaWRhdGlvbiBjb21tYW5kc1xuICAgIGlmIChvcHRzLnZhbGlkYXRlQWxsKSB7XG4gICAgICBhd2FpdCB2YWxpZGF0ZUFsbChhcGlVcmwsIG91dHB1dCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIGlmIChvcHRzLnZhbGlkYXRlICYmIGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGFwaVVybCwgb3V0cHV0LCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQgJiYgIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29tcG9uZW50IGhhcyBicmVha2luZyBjaGFuZ2VzLiBVc2UgLS1mb3JjZSB0byBjb21waWxlIGFueXdheS5cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxhdGlvbiBjb21tYW5kc1xuICAgIGlmIChvcHRzLnRoZW1lKSB7XG4gICAgICBhd2FpdCBjb21waWxlVGhlbWUoYXBpVXJsLCB0aGVtZURpciwgYXV0aCk7XG4gICAgfSBlbHNlIGlmIChvcHRzLmFsbCkge1xuICAgICAgLy8gVmFsaWRhdGUgYWxsIGZpcnN0IHVubGVzcyBmb3JjZWRcbiAgICAgIGlmICghb3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBQcmUtY29tcGlsYXRpb24gdmFsaWRhdGlvbi4uLlxcbmApO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGFwaVVybCwgb3V0cHV0LCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gdmFsaWRhdGVBbGwgZXhpdHMgd2l0aCBjb2RlIDEgb24gYnJlYWtpbmcgY2hhbmdlc1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgY29tcGlsZUFsbChhcGlVcmwsIG91dHB1dCwgYXV0aCk7XG4gICAgICBcbiAgICAgIC8vIFVwZGF0ZSBtYW5pZmVzdCBhZnRlciBzdWNjZXNzZnVsIGNvbXBpbGF0aW9uXG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TnSBVcGRhdGluZyBwcm9wZXJ0eSBtYW5pZmVzdC4uLmApO1xuICAgICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50SWQsIGF1dGgpO1xuICAgICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIC8vIEJ1aWxkIG1lcmdlZC1ncm91cCBsb29rdXAgb25jZSBmb3IgdGhpcyBicmFuY2hcbiAgICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICAgIH1cblxuICAgICAgLy8gSGVscGVyOiBjb21waWxlIGFuIGVudGlyZSBtZXJnZWQgZ3JvdXAgYnkgaXRzIGNvbmZpZyBrZXlcbiAgICAgIGNvbnN0IGNvbXBpbGVHcm91cEJ5S2V5ID0gYXN5bmMgKGdyb3VwS2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGZldGNoQWxsQ29tcG9uZW50c0xpc3QoYXBpVXJsLCBhdXRoKTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBncm91cEtleS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnRzIGZvdW5kIGZvciBtZXJnZWQgZ3JvdXAgXCIke2dyb3VwS2V5fVwiLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmdWxsR3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIGdyb3VwTWF0Y2hlcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjLmlkLCBhdXRoKTtcbiAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoZnVsbCk7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBTa2lwcGluZyAke2MuaWR9ICh0ZW1wbGF0ZSB2YWxpZGF0aW9uIGZhaWxlZClgKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdWxsR3JvdXBDb21wb25lbnRzLnB1c2goZnVsbCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICDinYwgRmFpbGVkIHRvIGZldGNoICR7Yy5pZH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZ1bGxHcm91cENvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IENvdWxkIG5vdCBmZXRjaCBhbnkgY29tcG9uZW50cyBmb3IgZ3JvdXAgXCIke2dyb3VwS2V5fVwiLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoYXBpVXJsLCBvdXRwdXQsIGdyb3VwS2V5LCBmdWxsR3JvdXBDb21wb25lbnRzLCBhdXRoKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKchSBHcm91cCBcIiR7Z3JvdXBLZXl9XCIgY29tcGlsZWQgKCR7ZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKS5cXG5gKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFRyeSBjb21wb25lbnQgZmlyc3QsIHRoZW4gZmFsbCBiYWNrIHRvIGdyb3VwIChlLmcuIFwiaGVyb1wiIC0+IEhlcm8gbWVyZ2VkIGJsb2NrKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcblxuICAgICAgICAvLyBJZiB0aGlzIGNvbXBvbmVudCBiZWxvbmdzIHRvIGEgbWVyZ2VkIGdyb3VwLCBjb21waWxlIHRoZSB3aG9sZSBncm91cCBpbnN0ZWFkXG4gICAgICAgIGlmIChjb21wb25lbnQuZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCBncm91cEtleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoY29tcG9uZW50Lmdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgIGlmIChncm91cEtleSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgIFwiJHtjb21wb25lbnROYW1lfVwiIGJlbG9uZ3MgdG8gbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIiDigJQgY29tcGlsaW5nIGVudGlyZSBncm91cC5cXG5gKTtcbiAgICAgICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShhcGlVcmwsIG91dHB1dCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gICAgICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29tcG9uZW50IGhhcyBicmVha2luZyBjaGFuZ2VzLiBVc2UgLS1mb3JjZSB0byBjb21waWxlIGFueXdheS5cXG5gKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgY29tcGlsZSh7XG4gICAgICAgICAgYXBpVXJsLFxuICAgICAgICAgIG91dHB1dERpcjogb3V0cHV0LFxuICAgICAgICAgIGNvbXBvbmVudE5hbWUsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIPCfk50gTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgICAgfSBjYXRjaCAoY29tcG9uZW50RXJyb3IpIHtcbiAgICAgICAgLy8gTm8gY29tcG9uZW50IHdpdGggdGhpcyBuYW1lIOKAkyB0cnkgYXMgZ3JvdXBcbiAgICAgICAgY29uc29sZS5sb2coYCAgIE5vIGNvbXBvbmVudCBcIiR7Y29tcG9uZW50TmFtZX1cIiBmb3VuZCwgY2hlY2tpbmcgZ3JvdXBzLi4uXFxuYCk7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0KGFwaVVybCwgYXV0aCk7XG4gICAgICAgIGNvbnN0IG5hbWVMb3dlciA9IGNvbXBvbmVudE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBuYW1lTG93ZXIsXG4gICAgICAgICk7XG4gICAgICAgIGlmIChncm91cE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IE5vIGNvbXBvbmVudCBvciBncm91cCBmb3VuZCBmb3IgXCIke2NvbXBvbmVudE5hbWV9XCIuYCk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAgICAgIENvbXBvbmVudCBmZXRjaDogJHtjb21wb25lbnRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gY29tcG9uZW50RXJyb3IubWVzc2FnZSA6IGNvbXBvbmVudEVycm9yfWApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBncm91cEtleSA9XG4gICAgICAgICAgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChuYW1lTG93ZXIpID8/IGdyb3VwTWF0Y2hlc1swXS5ncm91cDtcbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwQnlLZXkoZ3JvdXBLZXkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogUGxlYXNlIHNwZWNpZnkgYSBjb21wb25lbnQgbmFtZSwgZ3JvdXAgbmFtZSwgdXNlIC0tYWxsIGZsYWcsIC0tdGhlbWUgZmxhZywgb3IgLS12YWxpZGF0ZS1hbGwgZmxhZycpO1xuICAgICAgY29uc29sZS5sb2coJ1xcblVzYWdlOicpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxjb21wb25lbnQtbmFtZT4gICBDb21waWxlIG9uZSBjb21wb25lbnQgKGUuZy4gaGVyby1hcnRpY2xlKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxncm91cC1uYW1lPiAgICAgIE9yIGNvbXBpbGUgYSBtZXJnZWQgZ3JvdXAgKGUuZy4gaGVybyknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdGhlbWUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlIGhlcm8tYXJ0aWNsZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdmFsaWRhdGUtYWxsJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwgLS1mb3JjZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIGhlcm8gLS1hcGktdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMCAtLW91dHB1dCAuL2Jsb2NrcycpO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfSk7XG5cbnByb2dyYW0ucGFyc2UoKTtcblxuZXhwb3J0IHsgY29tcGlsZSwgZ2VuZXJhdGVCbG9jaywgZmV0Y2hDb21wb25lbnQgfTtcbiJdfQ==