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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHlDQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsbURBQXFDO0FBRXJDLG1DQUFnUztBQXVCaFM7O0dBRUc7QUFDSCxNQUFNLGNBQWMsR0FBbUI7SUFDckMsTUFBTSxFQUFFLHVCQUF1QjtJQUMvQixNQUFNLEVBQUUsVUFBVTtJQUNsQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFO0lBQzFCLE1BQU0sRUFBRSxFQUFFO0NBQ1gsQ0FBQztBQUVGOzs7R0FHRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxhQUFpRCxFQUFnQixFQUFFO0lBQy9GLE1BQU0sWUFBWSxHQUFpQixFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUN0RCxNQUFNLFdBQVcsR0FBMEMsRUFBRSxDQUFDO0lBRTlELEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7UUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQUUsU0FBUztRQUM5QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQztZQUFFLFNBQVM7UUFDOUIsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENB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QUFDO1lBQ3RFLE1BQU0saUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNILENBQUM7U0FBTSxDQUFDO1FBQ04sT0FBTyxDQUFDLEtBQUssQ0FBQywwR0FBMEcsQ0FBQyxDQUFDO1FBQzFILE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzRkFBc0YsQ0FBQyxDQUFDO1FBQ3BHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUZBQWlGLENBQUMsQ0FBQztRQUMvRixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMsaURBQWlELENBQUMsQ0FBQztRQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztRQUM5RixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVMLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogR3V0ZW5iZXJnIENvbXBpbGVyXG4gKiBcbiAqIFRyYW5zcGlsZXMgSGFuZG9mZiBjb21wb25lbnRzIHRvIFdvcmRQcmVzcyBHdXRlbmJlcmcgYmxvY2tzLlxuICogXG4gKiBVc2FnZTpcbiAqICAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxjb21wb25lbnQtbmFtZT4gW29wdGlvbnNdXG4gKiAgIFxuICogT3B0aW9uczpcbiAqICAgLS1hcGktdXJsIDx1cmw+ICAgIEhhbmRvZmYgQVBJIGJhc2UgVVJMIChkZWZhdWx0OiBodHRwOi8vbG9jYWxob3N0OjQwMDApXG4gKiAgIC0tb3V0cHV0IDxkaXI+ICAgICBPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MgKGRlZmF1bHQ6IC4vYmxvY2tzKVxuICogICAtLWFsbCAgICAgICAgICAgICAgQ29tcGlsZSBhbGwgYXZhaWxhYmxlIGNvbXBvbmVudHNcbiAqICAgLS10aGVtZSAgICAgICAgICAgIENvbXBpbGUgaGVhZGVyL2Zvb3RlciB0byB0aGVtZSB0ZW1wbGF0ZXNcbiAqICAgLS12YWxpZGF0ZSAgICAgICAgIFZhbGlkYXRlIGEgY29tcG9uZW50IGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiAgIC0tdmFsaWRhdGUtYWxsICAgICBWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgY2hhbmdlc1xuICogXG4gKiBDb25maWd1cmF0aW9uOlxuICogICBDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4geW91ciBwcm9qZWN0IHJvb3QgdG8gc2V0IGRlZmF1bHRzOlxuICogICB7XG4gKiAgICAgXCJhcGlVcmxcIjogXCJodHRwczovL2RlbW8uaGFuZG9mZi5jb21cIixcbiAqICAgICBcIm91dHB1dFwiOiBcIi4vcGF0aC90by9ibG9ja3NcIixcbiAqICAgICBcInRoZW1lRGlyXCI6IFwiLi9wYXRoL3RvL3RoZW1lXCJcbiAqICAgfVxuICovXG5cbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBwcmV0dGllciBmcm9tICdwcmV0dGllcic7XG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgQ29tcGlsZXJPcHRpb25zLCBHZW5lcmF0ZWRCbG9jaywgSGFuZG9mZldwQ29uZmlnLCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRDb25maWcsIEltcG9ydENvbmZpZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnLCBGaWVsZFByZWZlcmVuY2VzLCBpc0R5bmFtaWNBcnJheUNvbmZpZyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIEF1dGggY3JlZGVudGlhbHMgZm9yIEhUVFAgcmVxdWVzdHNcbiAqL1xuaW50ZXJmYWNlIEF1dGhDcmVkZW50aWFscyB7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXF1aXJlZCBjb25maWcgd2l0aCBkZWZhdWx0cyBhcHBsaWVkXG4gKi9cbmludGVyZmFjZSBSZXNvbHZlZENvbmZpZyB7XG4gIGFwaVVybDogc3RyaW5nO1xuICBvdXRwdXQ6IHN0cmluZztcbiAgdGhlbWVEaXI6IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBpbXBvcnQ6IEltcG9ydENvbmZpZztcbiAgZ3JvdXBzOiBSZWNvcmQ8c3RyaW5nLCAnbWVyZ2VkJyB8ICdpbmRpdmlkdWFsJz47XG59XG5cbi8qKlxuICogRGVmYXVsdCBjb25maWd1cmF0aW9uIHZhbHVlc1xuICovXG5jb25zdCBERUZBVUxUX0NPTkZJRzogUmVzb2x2ZWRDb25maWcgPSB7XG4gIGFwaVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gIG91dHB1dDogJy4vYmxvY2tzJyxcbiAgdGhlbWVEaXI6ICcuL3RoZW1lJyxcbiAgdXNlcm5hbWU6IHVuZGVmaW5lZCxcbiAgcGFzc3dvcmQ6IHVuZGVmaW5lZCxcbiAgaW1wb3J0OiB7IGVsZW1lbnQ6IGZhbHNlIH0sXG4gIGdyb3Vwczoge30sXG59O1xuXG4vKipcbiAqIE1pZ3JhdGUgbGVnYWN5IGBkeW5hbWljQXJyYXlzYCBjb25maWcgdG8gdGhlIG5ldyBgaW1wb3J0YCBzdHJ1Y3R1cmUuXG4gKiBHcm91cHMgXCJjb21wb25lbnRJZC5maWVsZE5hbWVcIiBlbnRyaWVzIHVuZGVyIGltcG9ydC5ibG9ja1tjb21wb25lbnRJZF1bZmllbGROYW1lXS5cbiAqL1xuY29uc3QgbWlncmF0ZUR5bmFtaWNBcnJheXMgPSAoZHluYW1pY0FycmF5czogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPik6IEltcG9ydENvbmZpZyA9PiB7XG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0geyBlbGVtZW50OiBmYWxzZSB9O1xuICBjb25zdCBibG9ja0NvbmZpZzogUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICghY29uZmlnLmVuYWJsZWQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGRvdEluZGV4ID0ga2V5LmluZGV4T2YoJy4nKTtcbiAgICBpZiAoZG90SW5kZXggPT09IC0xKSBjb250aW51ZTtcbiAgICBjb25zdCBjb21wb25lbnRJZCA9IGtleS5zdWJzdHJpbmcoMCwgZG90SW5kZXgpO1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoZG90SW5kZXggKyAxKTtcblxuICAgIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50SWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPT09ICdib29sZWFuJykge1xuICAgICAgYmxvY2tDb25maWdbY29tcG9uZW50SWRdID0ge307XG4gICAgfVxuICAgIChibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPilbZmllbGROYW1lXSA9IGNvbmZpZztcbiAgfVxuXG4gIGlmIChPYmplY3Qua2V5cyhibG9ja0NvbmZpZykubGVuZ3RoID4gMCkge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IGJsb2NrQ29uZmlnO1xuICB9XG5cbiAgcmV0dXJuIGltcG9ydENvbmZpZztcbn07XG5cbi8qKlxuICogTG9hZCBjb25maWd1cmF0aW9uIGZyb20gaGFuZG9mZi13cC5jb25maWcuanNvbiBpZiBpdCBleGlzdHNcbiAqL1xuY29uc3QgbG9hZENvbmZpZyA9ICgpOiBIYW5kb2ZmV3BDb25maWcgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpO1xuICAgICAgY29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjb25maWdDb250ZW50KSBhcyBIYW5kb2ZmV3BDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ThCBMb2FkZWQgY29uZmlnIGZyb20gJHtjb25maWdQYXRofWApO1xuICAgICAgcmV0dXJuIGNvbmZpZztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZhaWxlZCB0byBwYXJzZSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4ge307XG59O1xuXG4vKipcbiAqIE1lcmdlIGNvbmZpZ3VyYXRpb24gc291cmNlcyB3aXRoIHByaW9yaXR5OiBDTEkgPiBjb25maWcgZmlsZSA+IGRlZmF1bHRzXG4gKi9cbmNvbnN0IGdldENvbmZpZyA9ICgpOiBSZXNvbHZlZENvbmZpZyA9PiB7XG4gIGNvbnN0IGZpbGVDb25maWcgPSBsb2FkQ29uZmlnKCk7XG5cbiAgbGV0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnO1xuICBpZiAoZmlsZUNvbmZpZy5pbXBvcnQpIHtcbiAgICBpbXBvcnRDb25maWcgPSBmaWxlQ29uZmlnLmltcG9ydDtcbiAgfSBlbHNlIGlmIChmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpIHtcbiAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgXCJkeW5hbWljQXJyYXlzXCIgY29uZmlnIGlzIGRlcHJlY2F0ZWQuIE1pZ3JhdGUgdG8gXCJpbXBvcnRcIiDigJQgc2VlIFNQRUNJRklDQVRJT04ubWQuYCk7XG4gICAgaW1wb3J0Q29uZmlnID0gbWlncmF0ZUR5bmFtaWNBcnJheXMoZmlsZUNvbmZpZy5keW5hbWljQXJyYXlzKTtcbiAgfSBlbHNlIHtcbiAgICBpbXBvcnRDb25maWcgPSBERUZBVUxUX0NPTkZJRy5pbXBvcnQ7XG4gIH1cbiAgXG4gIHJldHVybiB7XG4gICAgYXBpVXJsOiBmaWxlQ29uZmlnLmFwaVVybCA/PyBERUZBVUxUX0NPTkZJRy5hcGlVcmwsXG4gICAgb3V0cHV0OiBmaWxlQ29uZmlnLm91dHB1dCA/PyBERUZBVUxUX0NPTkZJRy5vdXRwdXQsXG4gICAgdGhlbWVEaXI6IGZpbGVDb25maWcudGhlbWVEaXIgPz8gREVGQVVMVF9DT05GSUcudGhlbWVEaXIsXG4gICAgdXNlcm5hbWU6IGZpbGVDb25maWcudXNlcm5hbWUgPz8gREVGQVVMVF9DT05GSUcudXNlcm5hbWUsXG4gICAgcGFzc3dvcmQ6IGZpbGVDb25maWcucGFzc3dvcmQgPz8gREVGQVVMVF9DT05GSUcucGFzc3dvcmQsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gICAgZ3JvdXBzOiBmaWxlQ29uZmlnLmdyb3VwcyA/PyBERUZBVUxUX0NPTkZJRy5ncm91cHMsXG4gIH07XG59O1xuXG5cbi8qKlxuICogQnVpbGQgSFRUUCByZXF1ZXN0IG9wdGlvbnMgd2l0aCBvcHRpb25hbCBiYXNpYyBhdXRoXG4gKi9cbmNvbnN0IGJ1aWxkUmVxdWVzdE9wdGlvbnMgPSAodXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBodHRwLlJlcXVlc3RPcHRpb25zIHwgaHR0cHMuUmVxdWVzdE9wdGlvbnMgPT4ge1xuICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKHVybCk7XG4gIGNvbnN0IG9wdGlvbnM6IGh0dHAuUmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICBwb3J0OiBwYXJzZWRVcmwucG9ydCB8fCAocGFyc2VkVXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/IDQ0MyA6IDgwKSxcbiAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgaGVhZGVyczoge30sXG4gIH07XG4gIFxuICBpZiAoYXV0aD8udXNlcm5hbWUgJiYgYXV0aD8ucGFzc3dvcmQpIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IEJ1ZmZlci5mcm9tKGAke2F1dGgudXNlcm5hbWV9OiR7YXV0aC5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0ge1xuICAgICAgLi4ub3B0aW9ucy5oZWFkZXJzLFxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmFzaWMgJHtjcmVkZW50aWFsc31gLFxuICAgIH07XG4gIH1cbiAgXG4gIHJldHVybiBvcHRpb25zO1xufTtcblxuLy8gTG9hZCBjb25maWcgYXQgc3RhcnR1cFxuY29uc3QgY29uZmlnID0gZ2V0Q29uZmlnKCk7XG5pbXBvcnQge1xuICBnZW5lcmF0ZUJsb2NrSnNvbixcbiAgZ2VuZXJhdGVJbmRleEpzLFxuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgZ2VuZXJhdGVFZGl0b3JTY3NzLFxuICBnZW5lcmF0ZVN0eWxlU2NzcyxcbiAgZ2VuZXJhdGVSZWFkbWUsXG4gIHRvQmxvY2tOYW1lLFxuICBnZW5lcmF0ZUhlYWRlclBocCxcbiAgZ2VuZXJhdGVGb290ZXJQaHAsXG4gIGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwLFxuICBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAsXG4gIGdlbmVyYXRlU2hhcmVkQ29tcG9uZW50cyxcbiAgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsXG4gIGdlbmVyYXRlTWVyZ2VkQmxvY2ssXG59IGZyb20gJy4vZ2VuZXJhdG9ycyc7XG5pbXBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB7XG4gIGxvYWRNYW5pZmVzdCxcbiAgc2F2ZU1hbmlmZXN0LFxuICB2YWxpZGF0ZUNvbXBvbmVudCxcbiAgdXBkYXRlTWFuaWZlc3QsXG4gIGZvcm1hdFZhbGlkYXRpb25SZXN1bHQsXG4gIFZhbGlkYXRpb25SZXN1bHQsXG4gIHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMsXG4gIGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdFxufSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuXG4vLyBMb2FkIFBIUCBwbHVnaW4gZm9yIFByZXR0aWVyICh1c2luZyByZXF1aXJlIGZvciBjb21wYXRpYmlsaXR5KVxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbmNvbnN0IHBocFBsdWdpbiA9IHJlcXVpcmUoJ0BwcmV0dGllci9wbHVnaW4tcGhwJyk7XG5cbi8qKlxuICogRm9ybWF0IGNvZGUgd2l0aCBQcmV0dGllclxuICovXG5jb25zdCBmb3JtYXRDb2RlID0gYXN5bmMgKGNvZGU6IHN0cmluZywgcGFyc2VyOiAnYmFiZWwnIHwgJ2pzb24nIHwgJ3Njc3MnIHwgJ3BocCcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IG9wdGlvbnM6IHByZXR0aWVyLk9wdGlvbnMgPSB7XG4gICAgICBwYXJzZXIsXG4gICAgICBzaW5nbGVRdW90ZTogdHJ1ZSxcbiAgICAgIHRhYldpZHRoOiAyLFxuICAgICAgcHJpbnRXaWR0aDogMTAwLFxuICAgICAgdHJhaWxpbmdDb21tYTogJ2VzNScsXG4gICAgfTtcbiAgICBcbiAgICAvLyBMb2FkIFBIUCBwbHVnaW4gZm9yIFBIUCBmaWxlc1xuICAgIGlmIChwYXJzZXIgPT09ICdwaHAnKSB7XG4gICAgICBvcHRpb25zLnBsdWdpbnMgPSBbcGhwUGx1Z2luXTtcbiAgICAgIC8vIFBIUC1zcGVjaWZpYyBvcHRpb25zIC0gY2FzdCB0byBhbnkgZm9yIHBsdWdpbi1zcGVjaWZpYyBvcHRpb25zXG4gICAgICAob3B0aW9ucyBhcyBhbnkpLnBocFZlcnNpb24gPSAnOC4wJztcbiAgICAgIChvcHRpb25zIGFzIGFueSkuYnJhY2VTdHlsZSA9ICcxdGJzJztcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGF3YWl0IHByZXR0aWVyLmZvcm1hdChjb2RlLCBvcHRpb25zKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBJZiBmb3JtYXR0aW5nIGZhaWxzLCByZXR1cm4gb3JpZ2luYWwgY29kZVxuICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBQcmV0dGllciBmb3JtYXR0aW5nIGZhaWxlZCBmb3IgJHtwYXJzZXJ9LCB1c2luZyB1bmZvcm1hdHRlZCBjb2RlYCk7XG4gICAgcmV0dXJuIGNvZGU7XG4gIH1cbn07XG5cbmNvbnN0IHByb2dyYW0gPSBuZXcgQ29tbWFuZCgpO1xuXG4vKipcbiAqIERvd25sb2FkIGEgZmlsZSBmcm9tIGEgVVJMIGFuZCBzYXZlIGl0IHRvIGRpc2tcbiAqL1xuY29uc3QgZG93bmxvYWRGaWxlID0gYXN5bmMgKHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgLy8gSGFuZGxlIHJlZGlyZWN0c1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzLnN0YXR1c0NvZGUgPT09IDMwMikge1xuICAgICAgICBjb25zdCByZWRpcmVjdFVybCA9IHJlcy5oZWFkZXJzLmxvY2F0aW9uO1xuICAgICAgICBpZiAocmVkaXJlY3RVcmwpIHtcbiAgICAgICAgICBkb3dubG9hZEZpbGUocmVkaXJlY3RVcmwsIGRlc3RQYXRoLCBhdXRoKS50aGVuKHJlc29sdmUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgZmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKGRlc3RQYXRoKTtcbiAgICAgIHJlcy5waXBlKGZpbGVTdHJlYW0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdmaW5pc2gnLCAoKSA9PiB7XG4gICAgICAgIGZpbGVTdHJlYW0uY2xvc2UoKTtcbiAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdlcnJvcicsIChlcnIpID0+IHtcbiAgICAgICAgZnMudW5saW5rKGRlc3RQYXRoLCAoKSA9PiB7fSk7IC8vIENsZWFuIHVwIHBhcnRpYWwgZmlsZVxuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIHNhdmUgc2NyZWVuc2hvdDogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBkb3dubG9hZCBzY3JlZW5zaG90OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggY29tcG9uZW50IGRhdGEgZnJvbSBIYW5kb2ZmIEFQSVxuICovXG5jb25zdCBmZXRjaENvbXBvbmVudCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50PiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC8ke2NvbXBvbmVudE5hbWV9Lmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEhhbmRvZmZDb21wb25lbnQ7XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudCBKU09OOiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYWxsIGJsb2NrIGZpbGVzIGZyb20gYSBjb21wb25lbnRcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGFwaVVybCAtIFRoZSBiYXNlIEFQSSBVUkwgZm9yIGZldGNoaW5nIHNjcmVlbnNob3RzXG4gKiBAcGFyYW0gcmVzb2x2ZWRDb25maWcgLSBUaGUgcmVzb2x2ZWQgY29uZmlndXJhdGlvbiBpbmNsdWRpbmcgZHluYW1pYyBhcnJheSBzZXR0aW5nc1xuICovXG5jb25zdCBnZW5lcmF0ZUJsb2NrID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgYXBpVXJsOiBzdHJpbmcsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZyk6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgaGFzU2NyZWVuc2hvdCA9ICEhY29tcG9uZW50LmltYWdlO1xuICBcbiAgLy8gQ29uc3RydWN0IGZ1bGwgc2NyZWVuc2hvdCBVUkwgaWYgaW1hZ2UgcGF0aCBpcyBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3RVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgaWYgKGNvbXBvbmVudC5pbWFnZSkge1xuICAgIC8vIEhhbmRsZSBib3RoIGFic29sdXRlIFVSTHMgYW5kIHJlbGF0aXZlIHBhdGhzXG4gICAgaWYgKGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwOi8vJykgfHwgY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBjb21wb25lbnQuaW1hZ2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlbGF0aXZlIHBhdGggLSBwcmVwZW5kIEFQSSBVUkxcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBgJHthcGlVcmx9JHtjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wb25lbnQuaW1hZ2V9YDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciB0aGlzIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnXG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KVxuICB9O1xuICBcbiAgLy8gQXV0by1kZXRlY3QgcGFnaW5hdGlvbiBmb3IgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZW50cmllcyBvbmx5XG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggcmljaHRleHQgZmllbGQgKGlmIGFueSkgdXNlcyBJbm5lckJsb2Nrc1xuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIC8vIENoZWNrIGV4cGxpY2l0IGNvbmZpZyBvdmVycmlkZXMgZmlyc3RcbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cbiAgXG4gIHJldHVybiB7XG4gICAgYmxvY2tKc29uOiBnZW5lcmF0ZUJsb2NrSnNvbihjb21wb25lbnQsIGhhc1NjcmVlbnNob3QsIGFwaVVybCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgaW5kZXhKczogZ2VuZXJhdGVJbmRleEpzKGNvbXBvbmVudCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgcmVuZGVyUGhwOiBnZW5lcmF0ZVJlbmRlclBocChjb21wb25lbnQsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQpLFxuICAgIGVkaXRvclNjc3M6IGdlbmVyYXRlRWRpdG9yU2Nzcyhjb21wb25lbnQpLFxuICAgIHN0eWxlU2NzczogZ2VuZXJhdGVTdHlsZVNjc3MoY29tcG9uZW50KSxcbiAgICByZWFkbWU6IGdlbmVyYXRlUmVhZG1lKGNvbXBvbmVudCksXG4gICAgbWlncmF0aW9uU2NoZW1hOiBnZW5lcmF0ZU1pZ3JhdGlvblNjaGVtYShjb21wb25lbnQpLFxuICAgIHNjcmVlbnNob3RVcmxcbiAgfTtcbn07XG5cbi8qKlxuICogV3JpdGUgYmxvY2sgZmlsZXMgdG8gb3V0cHV0IGRpcmVjdG9yeVxuICovXG5jb25zdCB3cml0ZUJsb2NrRmlsZXMgPSBhc3luYyAob3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudElkOiBzdHJpbmcsIGJsb2NrOiBHZW5lcmF0ZWRCbG9jaywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSB0b0Jsb2NrTmFtZShjb21wb25lbnRJZCk7XG4gIGNvbnN0IGJsb2NrRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgYmxvY2tOYW1lKTtcbiAgXG4gIC8vIENyZWF0ZSBibG9jayBkaXJlY3RvcnlcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGJsb2NrRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhibG9ja0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgXG4gIC8vIEZvcm1hdCBhbGwgY29kZSBmaWxlcyB3aXRoIFByZXR0aWVyXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suYmxvY2tKc29uLCAnanNvbicpO1xuICBjb25zdCBmb3JtYXR0ZWRJbmRleEpzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5pbmRleEpzLCAnYmFiZWwnKTtcbiAgY29uc3QgZm9ybWF0dGVkRWRpdG9yU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suZWRpdG9yU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkU3R5bGVTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5zdHlsZVNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFJlbmRlclBocCA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2sucmVuZGVyUGhwLCAncGhwJyk7XG4gIFxuICAvLyBXcml0ZSBmaWxlc1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2Jsb2NrLmpzb24nKSwgZm9ybWF0dGVkQmxvY2tKc29uKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdpbmRleC5qcycpLCBmb3JtYXR0ZWRJbmRleEpzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdyZW5kZXIucGhwJyksIGZvcm1hdHRlZFJlbmRlclBocCk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnZWRpdG9yLnNjc3MnKSwgZm9ybWF0dGVkRWRpdG9yU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnc3R5bGUuc2NzcycpLCBmb3JtYXR0ZWRTdHlsZVNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ1JFQURNRS5tZCcpLCBibG9jay5yZWFkbWUpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ21pZ3JhdGlvbi1zY2hlbWEuanNvbicpLCBibG9jay5taWdyYXRpb25TY2hlbWEpO1xuICBcbiAgLy8gRG93bmxvYWQgc2NyZWVuc2hvdCBpZiBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3REb3dubG9hZGVkID0gZmFsc2U7XG4gIGlmIChibG9jay5zY3JlZW5zaG90VXJsKSB7XG4gICAgY29uc3Qgc2NyZWVuc2hvdFBhdGggPSBwYXRoLmpvaW4oYmxvY2tEaXIsICdzY3JlZW5zaG90LnBuZycpO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5O3IERvd25sb2FkaW5nIHNjcmVlbnNob3QuLi5gKTtcbiAgICBzY3JlZW5zaG90RG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShibG9jay5zY3JlZW5zaG90VXJsLCBzY3JlZW5zaG90UGF0aCwgYXV0aCk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkIGJsb2NrOiAke2Jsb2NrTmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtibG9ja0Rpcn1gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgYmxvY2suanNvbmApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBpbmRleC5qc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCByZW5kZXIucGhwYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGVkaXRvci5zY3NzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHN0eWxlLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgUkVBRE1FLm1kYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIG1pZ3JhdGlvbi1zY2hlbWEuanNvbmApO1xuICBpZiAoc2NyZWVuc2hvdERvd25sb2FkZWQpIHtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+WvO+4jyAgc2NyZWVuc2hvdC5wbmdgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBNYWluIGNvbXBpbGF0aW9uIGZ1bmN0aW9uXG4gKi9cbmNvbnN0IGNvbXBpbGUgPSBhc3luYyAob3B0aW9uczogQ29tcGlsZXJPcHRpb25zKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SnIEd1dGVuYmVyZyBDb21waWxlcmApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke29wdGlvbnMuYXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50OiAke29wdGlvbnMuY29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvcHRpb25zLm91dHB1dERpcn1gKTtcbiAgaWYgKG9wdGlvbnMuYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHtvcHRpb25zLmF1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBGZXRjaCBjb21wb25lbnQgZnJvbSBBUElcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgZGF0YS4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KG9wdGlvbnMuYXBpVXJsLCBvcHRpb25zLmNvbXBvbmVudE5hbWUsIG9wdGlvbnMuYXV0aCk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX0gKCR7Y29tcG9uZW50LmlkfSlcXG5gKTtcbiAgICBcbiAgICAvLyBWYWxpZGF0ZSB0ZW1wbGF0ZSB2YXJpYWJsZXMgYmVmb3JlIGdlbmVyYXRpbmdcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBWYWxpZGF0aW5nIHRlbXBsYXRlIHZhcmlhYmxlcy4uLmApO1xuICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoY29tcG9uZW50KTtcbiAgICBjb25zb2xlLmxvZyhmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQodGVtcGxhdGVWYWxpZGF0aW9uKSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuICAgIFxuICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBUZW1wbGF0ZSB2YWxpZGF0aW9uIGZhaWxlZCEgRml4IHRoZSB1bmRlZmluZWQgdmFyaWFibGVzIGJlZm9yZSBjb21waWxpbmcuXFxuYCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGJsb2NrIGZpbGVzXG4gICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBHdXRlbmJlcmcgYmxvY2suLi5gKTtcbiAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBvcHRpb25zLmFwaVVybCwgY29uZmlnKTtcbiAgICBcbiAgICAvLyBXcml0ZSBmaWxlcyAod2l0aCBQcmV0dGllciBmb3JtYXR0aW5nKVxuICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvcHRpb25zLm91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgb3B0aW9ucy5hdXRoKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIERvbmUhIERvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2hlY2sgd2hldGhlciBhIGNvbXBvbmVudCBzaG91bGQgYmUgaW1wb3J0ZWQgYmFzZWQgb24gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IHNob3VsZEltcG9ydENvbXBvbmVudCA9IChjb21wb25lbnRJZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnKTogYm9vbGVhbiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG5cbiAgLy8gVHlwZSBub3QgbGlzdGVkIGluIGltcG9ydCBjb25maWcg4oCUIGRlZmF1bHQgdG8gdHJ1ZSAoaW1wb3J0KVxuICBpZiAodHlwZUNvbmZpZyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgLy8gRW50aXJlIHR5cGUgZGlzYWJsZWRcbiAgaWYgKHR5cGVDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEVudGlyZSB0eXBlIGVuYWJsZWQgd2l0aCBubyBwZXItY29tcG9uZW50IG92ZXJyaWRlc1xuICBpZiAodHlwZUNvbmZpZyA9PT0gdHJ1ZSkgcmV0dXJuIHRydWU7XG5cbiAgLy8gUGVyLWNvbXBvbmVudCBsb29rdXAgd2l0aGluIHRoZSB0eXBlIG9iamVjdFxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgLy8gTm90IGxpc3RlZCDigJQgaW1wb3J0IHdpdGggZGVmYXVsdHMgKHR5cGUtb2JqZWN0IG1lYW5zIFwiaW1wb3J0IGFsbCwgb3ZlcnJpZGUgbGlzdGVkXCIpXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEV4cGxpY2l0bHkgZGlzYWJsZWRcbiAgaWYgKGNvbXBvbmVudENvbmZpZyA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgLy8gRXhwbGljaXRseSBlbmFibGVkIG9yIGhhcyBmaWVsZCBvdmVycmlkZXNcbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgcmF3IHBlci1maWVsZCBjb25maWcgb2JqZWN0IGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEZpZWxkUHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3QgdHlwZUNvbmZpZyA9IGltcG9ydENvbmZpZ1tjb21wb25lbnRUeXBlXTtcbiAgaWYgKCF0eXBlQ29uZmlnIHx8IHR5cGVvZiB0eXBlQ29uZmlnID09PSAnYm9vbGVhbicpIHJldHVybiB7fTtcblxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgaWYgKCFjb21wb25lbnRDb25maWcgfHwgdHlwZW9mIGNvbXBvbmVudENvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgcmV0dXJuIGNvbXBvbmVudENvbmZpZyBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPjtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBkeW5hbWljIGFycmF5IGNvbmZpZ3MgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYWxsQ29uZmlncykpIHtcbiAgICBpZiAoaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZmllbGQgcHJlZmVyZW5jZXMgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IGFsbENvbmZpZ3MgPSBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MoY29tcG9uZW50SWQsIGNvbXBvbmVudFR5cGUsIGltcG9ydENvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKCFpc0R5bmFtaWNBcnJheUNvbmZpZyhjb25maWcpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IGNvbmZpZztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRmV0Y2ggbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSwgZmlsdGVyZWQgYnkgaW1wb3J0IGNvbmZpZ1xuICovXG5jb25zdCBmZXRjaENvbXBvbmVudExpc3QgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnRzLmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEFycmF5PEhhbmRvZmZDb21wb25lbnQ+O1xuICAgICAgICAgIGNvbnN0IGZpbHRlcmVkID0gY29tcG9uZW50cy5maWx0ZXIoYyA9PiBzaG91bGRJbXBvcnRDb21wb25lbnQoYy5pZCwgYy50eXBlLCBpbXBvcnRDb25maWcpKTtcbiAgICAgICAgICByZXNvbHZlKGZpbHRlcmVkLm1hcChjID0+IGMuaWQpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggZnVsbCBsaXN0IG9mIGFsbCBjb21wb25lbnRzIGZyb20gQVBJIChubyBpbXBvcnQgZmlsdGVyKS4gVXNlZCB0byByZXNvbHZlIGdyb3VwIG5hbWVzLlxuICovXG5jb25zdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50W10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudHMpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSkpO1xuICB9KTtcbn07XG5cbi8qKlxuICogQ29tcGlsZSBhbGwgY29tcG9uZW50c1xuICovXG4vKipcbiAqIEJ1aWxkIFZhcmlhbnRJbmZvIGZvciBhIGNvbXBvbmVudCAocmVzb2x2ZXMgZHluYW1pYyBhcnJheXMsIElubmVyQmxvY2tzIGZpZWxkLCBldGMuKVxuICovXG5jb25zdCBidWlsZFZhcmlhbnRJbmZvID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnKTogVmFyaWFudEluZm8gPT4ge1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCksXG4gIH07XG5cbiAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudER5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCdhcnJheVR5cGUnIGluIGR5bkNvbmZpZykgY29udGludWU7IC8vIFNraXAgc3BlY2lhbGlzZWQgYXJyYXkgdHlwZXNcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICBpZiAocHJvcD8udHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24/LnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgY29uc3QgcGFnaW5hdGlvbkZpZWxkUmVnZXggPSBuZXcgUmVnRXhwKFxuICAgICAgICBgXFxcXHtcXFxce1xcXFxzKiNmaWVsZFxcXFxzK1tcIiddJHtmaWVsZE5hbWV9XFxcXC5wYWdpbmF0aW9uW1wiJ11gXG4gICAgICApO1xuICAgICAgaWYgKHBhZ2luYXRpb25GaWVsZFJlZ2V4LnRlc3QoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgICAgIChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uID0geyBwcm9wZXJ0eU5hbWU6ICdwYWdpbmF0aW9uJyB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZpZWxkUHJlZnMgPSBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpO1xuICBjb25zdCByaWNodGV4dEZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbXBvbmVudCxcbiAgICBmaWVsZE1hcDoge30sXG4gICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICBkeW5hbWljQXJyYXlDb25maWdzOiBjb21wb25lbnREeW5hbWljQXJyYXlzLFxuICB9O1xufTtcblxuLyoqXG4gKiBDb21waWxlIGEgc2luZ2xlIG1lcmdlZCBncm91cCAoZS5nLiBIZXJvIHdpdGggbXVsdGlwbGUgdmFyaWFudHMpLiBVc2VkIGJ5IHNpbmdsZS1uYW1lIENMSSB3aGVuIG5hbWUgbWF0Y2hlcyBhIGdyb3VwLlxuICovXG5jb25zdCBjb21waWxlR3JvdXAgPSBhc3luYyAoXG4gIGFwaVVybDogc3RyaW5nLFxuICBvdXRwdXREaXI6IHN0cmluZyxcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdLFxuICBhdXRoPzogQXV0aENyZWRlbnRpYWxzLFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SAIEdlbmVyYXRpbmcgbWVyZ2VkIGdyb3VwIGJsb2NrOiAke2dyb3VwU2x1Z30gKCR7Z3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpYCk7XG4gIGNvbnN0IHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSA9IGdyb3VwQ29tcG9uZW50cy5tYXAoKGMpID0+IGJ1aWxkVmFyaWFudEluZm8oYywgY29uZmlnKSk7XG4gIGNvbnN0IG1lcmdlZEJsb2NrID0gZ2VuZXJhdGVNZXJnZWRCbG9jayhncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50cywgdmFyaWFudEluZm9zLCBhcGlVcmwpO1xuICBjb25zdCBncm91cEJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcbiAgY29uc3QgZ3JvdXBEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBncm91cEJsb2NrTmFtZSk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhncm91cERpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoZ3JvdXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcblxuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2Jsb2NrLmpzb24nKSwgZm9ybWF0dGVkQmxvY2tKc29uKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdpbmRleC5qcycpLCBmb3JtYXR0ZWRJbmRleEpzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdyZW5kZXIucGhwJyksIGZvcm1hdHRlZFJlbmRlclBocCk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnZWRpdG9yLnNjc3MnKSwgZm9ybWF0dGVkRWRpdG9yU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnc3R5bGUuc2NzcycpLCBmb3JtYXR0ZWRTdHlsZVNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ1JFQURNRS5tZCcpLCBtZXJnZWRCbG9jay5yZWFkbWUpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ21pZ3JhdGlvbi1zY2hlbWEuanNvbicpLCBtZXJnZWRCbG9jay5taWdyYXRpb25TY2hlbWEpO1xuXG4gIGlmIChtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcykge1xuICAgIGNvbnN0IHZhcmlhdGlvbnNEaXIgPSBwYXRoLmpvaW4oZ3JvdXBEaXIsICd2YXJpYXRpb25zJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHZhcmlhdGlvbnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmModmFyaWF0aW9uc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMuanMpKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdiYWJlbCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5qc2ApLCBmb3JtYXR0ZWQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLnBocCkpIHtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ3BocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5waHBgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gIH1cblxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBtZXJnZWQgYmxvY2s6ICR7Z3JvdXBCbG9ja05hbWV9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2dyb3VwRGlyfWApO1xuXG4gIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGdyb3VwQ29tcG9uZW50cyk7XG4gIGNvbnN0IGZvcm1hdHRlZENhdGVnb3JpZXNQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGNhdGVnb3JpZXNQaHAsICdwaHAnKTtcbiAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGluY2x1ZGVzRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgY29uc3QgY2F0ZWdvcmllc1BhdGggPSBwYXRoLmpvaW4oaW5jbHVkZXNEaXIsICdoYW5kb2ZmLWNhdGVnb3JpZXMucGhwJyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCAke2NhdGVnb3JpZXNQYXRofWApO1xufTtcblxuY29uc3QgY29tcGlsZUFsbCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyIC0gQmF0Y2ggTW9kZWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChhdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2F1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuXG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIGxldCBzdWNjZXNzID0gMDtcbiAgICBsZXQgZmFpbGVkID0gMDtcbiAgICBjb25zdCBjb21waWxlZENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIFxuICAgIC8vIEZldGNoIGFsbCBjb21wb25lbnRzIGZpcnN0IHNvIHdlIGNhbiBwYXJ0aXRpb24gYnkgZ3JvdXBcbiAgICBjb25zdCBhbGxDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnRJZCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0KHRlbXBsYXRlVmFsaWRhdGlvbikpO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjb21wb25lbnRJZH0gZHVlIHRvIHRlbXBsYXRlIHZhcmlhYmxlIGVycm9yc2ApO1xuICAgICAgICAgIGZhaWxlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYWxsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGZldGNoICR7Y29tcG9uZW50SWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFBhcnRpdGlvbiBjb21wb25lbnRzOiBtZXJnZWQgZ3JvdXBzIHZzIGluZGl2aWR1YWxcbiAgICAvLyBCdWlsZCBjYXNlLWluc2Vuc2l0aXZlIGxvb2t1cDogY29uZmlnIG1heSBzYXkgXCJIZXJvXCIgYnV0IEFQSSBvZnRlbiByZXR1cm5zIFwiaGVyb1wiXG4gICAgY29uc3QgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICBpZiAobW9kZSA9PT0gJ21lcmdlZCcpIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIGtleSk7XG4gICAgfVxuICAgIGNvbnN0IGdyb3VwQnVja2V0czogUmVjb3JkPHN0cmluZywgSGFuZG9mZkNvbXBvbmVudFtdPiA9IHt9O1xuICAgIGNvbnN0IGluZGl2aWR1YWxDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGFsbENvbXBvbmVudHMpIHtcbiAgICAgIGNvbnN0IGdyb3VwID0gY29tcG9uZW50Lmdyb3VwO1xuICAgICAgaWYgKCFncm91cCkge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgY29uZmlnS2V5ID0gbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgIGlmIChjb25maWdLZXkpIHtcbiAgICAgICAgaWYgKCFncm91cEJ1Y2tldHNbY29uZmlnS2V5XSkgZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0gPSBbXTtcbiAgICAgICAgZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0ucHVzaChjb21wb25lbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5kaXZpZHVhbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgaW5kaXZpZHVhbCBjb21wb25lbnRzIChleGlzdGluZyBiZWhhdmlvcilcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBpbmRpdmlkdWFsQ29tcG9uZW50cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYmxvY2sgPSBnZW5lcmF0ZUJsb2NrKGNvbXBvbmVudCwgYXBpVXJsLCBjb25maWcpO1xuICAgICAgICBhd2FpdCB3cml0ZUJsb2NrRmlsZXMob3V0cHV0RGlyLCBjb21wb25lbnQuaWQsIGJsb2NrLCBhdXRoKTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgc3VjY2VzcysrO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlICR7Y29tcG9uZW50LmlkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQrKztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb21waWxlIG1lcmdlZCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50c10gb2YgT2JqZWN0LmVudHJpZXMoZ3JvdXBCdWNrZXRzKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwKGFwaVVybCwgb3V0cHV0RGlyLCBncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50cywgYXV0aCk7XG4gICAgICAgIGNvbXBpbGVkQ29tcG9uZW50cy5wdXNoKC4uLmdyb3VwQ29tcG9uZW50cyk7XG4gICAgICAgIHN1Y2Nlc3MgKz0gZ3JvdXBDb21wb25lbnRzLmxlbmd0aDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gY29tcGlsZSBtZXJnZWQgZ3JvdXAgJHtncm91cFNsdWd9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBjYXRlZ29yaWVzIFBIUCBmaWxlIGJhc2VkIG9uIGFsbCBjb21waWxlZCBjb21wb25lbnRzXG4gICAgaWYgKGNvbXBpbGVkQ29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBHZW5lcmF0aW5nIGJsb2NrIGNhdGVnb3JpZXMuLi5gKTtcbiAgICAgIGNvbnN0IGNhdGVnb3JpZXNQaHAgPSBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAoY29tcGlsZWRDb21wb25lbnRzKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZENhdGVnb3JpZXNQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGNhdGVnb3JpZXNQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgcGx1Z2luRGlyID0gcGF0aC5kaXJuYW1lKG91dHB1dERpcik7XG4gICAgICBjb25zdCBpbmNsdWRlc0RpciA9IHBhdGguam9pbihwbHVnaW5EaXIsICdpbmNsdWRlcycpO1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGluY2x1ZGVzRGlyKSkge1xuICAgICAgICBmcy5ta2RpclN5bmMoaW5jbHVkZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgfVxuICAgICAgY29uc3QgY2F0ZWdvcmllc1BhdGggPSBwYXRoLmpvaW4oaW5jbHVkZXNEaXIsICdoYW5kb2ZmLWNhdGVnb3JpZXMucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGNhdGVnb3JpZXNQYXRoLCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2NhdGVnb3JpZXNQYXRofWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBzaGFyZWQgY29tcG9uZW50cyBpZiBhbnkgY29tcG9uZW50IGhhcyBkeW5hbWljIGFycmF5IGNvbmZpZ3NcbiAgICBjb25zdCBoYXNEeW5hbWljQXJyYXlzSW5JbXBvcnQgPSBPYmplY3QudmFsdWVzKGNvbmZpZy5pbXBvcnQpLnNvbWUodHlwZUNvbmZpZyA9PiB7XG4gICAgICBpZiAodHlwZW9mIHR5cGVDb25maWcgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyh0eXBlQ29uZmlnKS5zb21lKGNvbXBDb25maWcgPT5cbiAgICAgICAgdHlwZW9mIGNvbXBDb25maWcgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGNvbXBDb25maWcpLmxlbmd0aCA+IDBcbiAgICAgICk7XG4gICAgfSk7XG4gICAgaWYgKGhhc0R5bmFtaWNBcnJheXNJbkltcG9ydCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgR2VuZXJhdGluZyBzaGFyZWQgY29tcG9uZW50cy4uLmApO1xuICAgICAgY29uc3Qgc2hhcmVkQ29tcG9uZW50cyA9IGdlbmVyYXRlU2hhcmVkQ29tcG9uZW50cygpO1xuICAgICAgXG4gICAgICBmb3IgKGNvbnN0IFtyZWxhdGl2ZVBhdGgsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKHNoYXJlZENvbXBvbmVudHMpKSB7XG4gICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJy4uJywgcmVsYXRpdmVQYXRoKTtcbiAgICAgICAgY29uc3QgZGlyUGF0aCA9IHBhdGguZGlybmFtZShmdWxsUGF0aCk7XG4gICAgICAgIFxuICAgICAgICAvLyBFbnN1cmUgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyUGF0aCkpIHtcbiAgICAgICAgICBmcy5ta2RpclN5bmMoZGlyUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEZvcm1hdCBhbmQgd3JpdGUgdGhlIGZpbGVcbiAgICAgICAgY29uc3QgZm9ybWF0dGVkQ29udGVudCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ2JhYmVsJyk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZnVsbFBhdGgsIGZvcm1hdHRlZENvbnRlbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg8J+ThCAke3JlbGF0aXZlUGF0aH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGDinIUgU2hhcmVkIGNvbXBvbmVudHMgZ2VuZXJhdGVkYCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggQ29tcGlsYXRpb24gY29tcGxldGUhYCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBTdWNjZXNzOiAke3N1Y2Nlc3N9YCk7XG4gICAgaWYgKGZhaWxlZCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinYwgRmFpbGVkOiAke2ZhaWxlZH1gKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGdyb3VwQnVja2V0cykubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIPCflIAgTWVyZ2VkIGdyb3VwczogJHtPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aH1gKTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coYFxcbkRvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKVxuICovXG5jb25zdCBjb21waWxlVGhlbWUgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn46oIFRoZW1lIFRlbXBsYXRlIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke291dHB1dERpcn1gKTtcbiAgaWYgKGF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7YXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIENvbXBpbGUgaGVhZGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgaGVhZGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXIgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsICdoZWFkZXInLCBhdXRoKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtoZWFkZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgaGVhZGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgaGVhZGVyUGhwID0gZ2VuZXJhdGVIZWFkZXJQaHAoaGVhZGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEhlYWRlciA9IGF3YWl0IGZvcm1hdENvZGUoaGVhZGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGhlYWRlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnaGVhZGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhoZWFkZXJQYXRoLCBmb3JtYXR0ZWRIZWFkZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7aGVhZGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEhlYWRlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxlIGZvb3RlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGZvb3RlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZm9vdGVyID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCAnZm9vdGVyJywgYXV0aCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Zm9vdGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGZvb3Rlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGZvb3RlclBocCA9IGdlbmVyYXRlRm9vdGVyUGhwKGZvb3Rlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRGb290ZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGZvb3RlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBmb290ZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Zvb3Rlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoZm9vdGVyUGF0aCwgZm9ybWF0dGVkRm9vdGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2Zvb3RlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBGb290ZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWxzbyB0cnkgaGVhZGVyLWNvbXBhY3QgYW5kIGZvb3Rlci1jb21wYWN0IGlmIHRoZXkgZXhpc3RcbiAgICAvLyBUaGVzZSBnbyBpbnRvIHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvIHN1YmZvbGRlclxuICAgIGNvbnN0IGhhbmRvZmZUZW1wbGF0ZXNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAndGVtcGxhdGUtcGFydHMnLCAnaGFuZG9mZicpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBnZW5lcmF0ZWRUZW1wbGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCB2YXJpYW50IG9mIFsnaGVhZGVyLWNvbXBhY3QnLCAnaGVhZGVyLWxhbmRlcicsICdmb290ZXItY29tcGFjdCddKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIHZhcmlhbnQsIGF1dGgpO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+ToSBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9YCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVR5cGUgPSB2YXJpYW50LnJlcGxhY2UoLy0vZywgJ18nKTtcbiAgICAgICAgY29uc3QgaXNIZWFkZXIgPSB2YXJpYW50LnN0YXJ0c1dpdGgoJ2hlYWRlcicpO1xuICAgICAgICBjb25zdCBwaHAgPSBpc0hlYWRlciBcbiAgICAgICAgICA/IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKVxuICAgICAgICAgIDogZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpO1xuICAgICAgICBjb25zdCBmb3JtYXR0ZWRQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKHBocCwgJ3BocCcpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIGZvcm1hdHRlZFBocCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2ZpbGVQYXRofVxcbmApO1xuICAgICAgICBnZW5lcmF0ZWRUZW1wbGF0ZXMucHVzaChgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBWYXJpYW50IGRvZXNuJ3QgZXhpc3QsIHNraXAgc2lsZW50bHlcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgUkVBRE1FIGZvciB0aGUgaGFuZG9mZiB0ZW1wbGF0ZXMgZm9sZGVyXG4gICAgaWYgKGdlbmVyYXRlZFRlbXBsYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCByZWFkbWVDb250ZW50ID0gYCMgSGFuZG9mZiBUZW1wbGF0ZSBQYXJ0c1xuXG4+IOKaoO+4jyAqKkRPIE5PVCBFRElUIFRIRVNFIEZJTEVTIERJUkVDVExZKipcbj5cbj4gVGhlc2UgZmlsZXMgYXJlIGF1dG9tYXRpY2FsbHkgZ2VuZXJhdGVkIGJ5IHRoZSBIYW5kb2ZmIFdvcmRQcmVzcyBjb21waWxlci5cbj4gQW55IGNoYW5nZXMgd2lsbCBiZSBvdmVyd3JpdHRlbiBvbiB0aGUgbmV4dCBzeW5jLlxuXG4jIyBTb3VyY2VcblxuVGhlc2UgdGVtcGxhdGVzIHdlcmUgdHJhbnNwaWxlZCBmcm9tIHRoZSBIYW5kb2ZmIGRlc2lnbiBzeXN0ZW0uXG5cbi0gKipBUEkgVVJMOioqICR7YXBpVXJsfVxuLSAqKkdlbmVyYXRlZDoqKiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1cblxuIyMgRmlsZXNcblxuJHtnZW5lcmF0ZWRUZW1wbGF0ZXMubWFwKGYgPT4gYC0gXFxgJHtmfVxcYGApLmpvaW4oJ1xcbicpfVxuXG4jIyBVc2FnZVxuXG5JbmNsdWRlIHRoZXNlIHRlbXBsYXRlIHBhcnRzIGluIHlvdXIgdGhlbWUgdXNpbmc6XG5cblxcYFxcYFxcYHBocFxuPD9waHAgZ2V0X3RlbXBsYXRlX3BhcnQoJ3RlbXBsYXRlLXBhcnRzL2hhbmRvZmYvaGVhZGVyLWNvbXBhY3QnKTsgPz5cbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2Zvb3Rlci1jb21wYWN0Jyk7ID8+XG5cXGBcXGBcXGBcblxuIyMgUmVnZW5lcmF0aW5nXG5cblRvIHJlZ2VuZXJhdGUgdGhlc2UgZmlsZXMsIHJ1bjpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZVxuXFxgXFxgXFxgXG5cbk9yIHdpdGggYSBzcGVjaWZpYyBBUEkgVVJMOlxuXG5cXGBcXGBcXGBiYXNoXG5ucHggaGFuZG9mZi13cCAtLXRoZW1lIC0tYXBpLXVybCAke2FwaVVybH1cblxcYFxcYFxcYFxuYDtcbiAgICAgIGNvbnN0IHJlYWRtZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgJ1JFQURNRS5tZCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhyZWFkbWVQYXRoLCByZWFkbWVDb250ZW50KTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OdIEdlbmVyYXRlZDogJHtyZWFkbWVQYXRofVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmNzcyBhbmQgbWFpbi5qcyBhc3NldHNcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyB0aGVtZSBhc3NldHMuLi5gKTtcbiAgICBcbiAgICAvLyBFbnN1cmUgYXNzZXRzIGRpcmVjdG9yaWVzIGV4aXN0XG4gICAgY29uc3QgY3NzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Fzc2V0cycsICdjc3MnKTtcbiAgICBjb25zdCBqc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnanMnKTtcbiAgICBcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoY3NzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGNzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhqc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhqc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uY3NzXG4gICAgY29uc3QgY3NzVXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uY3NzYDtcbiAgICBjb25zdCBjc3NQYXRoID0gcGF0aC5qb2luKGNzc0RpciwgJ21haW4uY3NzJyk7XG4gICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uY3NzLi4uYCk7XG4gICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShjc3NVcmwsIGNzc1BhdGgsIGF1dGgpO1xuICAgIGlmIChjc3NEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7Y3NzUGF0aH1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmNzcyBmcm9tICR7Y3NzVXJsfWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmpzXG4gICAgY29uc3QganNVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5qc2A7XG4gICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGpzRGlyLCAnbWFpbi5qcycpO1xuICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmpzLi4uYCk7XG4gICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGpzVXJsLCBqc1BhdGgsIGF1dGgpO1xuICAgIGlmIChqc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZDogJHtqc1BhdGh9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggVGhlbWUgdGVtcGxhdGVzIGdlbmVyYXRlZCFcXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYSBzaW5nbGUgY29tcG9uZW50IGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzXG4gKi9cbmNvbnN0IHZhbGlkYXRlID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxWYWxpZGF0aW9uUmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SNIFZhbGlkYXRpbmcgQ29tcG9uZW50OiAke2NvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgLy8gRmV0Y2ggY29tcG9uZW50XG4gIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gIFxuICAvLyBMb2FkIG1hbmlmZXN0XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIFxuICAvLyBWYWxpZGF0ZVxuICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgXG4gIC8vIE91dHB1dCByZXN1bHRcbiAgY29uc29sZS5sb2coZm9ybWF0VmFsaWRhdGlvblJlc3VsdChyZXN1bHQpKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzXG4gKi9cbmNvbnN0IHZhbGlkYXRlQWxsID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBBbGwgQ29tcG9uZW50c2ApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE1hbmlmZXN0OiAke291dHB1dERpcn1cXG5gKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gRmV0Y2ggY29tcG9uZW50IGxpc3RcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGltcG9ydENvbmZpZywgYXV0aCk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIC8vIExvYWQgbWFuaWZlc3RcbiAgICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICAgIFxuICAgIGxldCB2YWxpZCA9IDA7XG4gICAgbGV0IGludmFsaWQgPSAwO1xuICAgIGxldCBuZXdDb21wb25lbnRzID0gMDtcbiAgICBjb25zdCBicmVha2luZ0NoYW5nZXM6IFZhbGlkYXRpb25SZXN1bHRbXSA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVDb21wb25lbnQoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAocmVzdWx0LmlzTmV3KSB7XG4gICAgICAgICAgbmV3Q29tcG9uZW50cysrO1xuICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgdmFsaWQrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnZhbGlkKys7XG4gICAgICAgICAgYnJlYWtpbmdDaGFuZ2VzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byB2YWxpZGF0ZSAke2NvbXBvbmVudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBTdW1tYXJ5XG4gICAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBWYWxpZGF0aW9uIFN1bW1hcnlgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFZhbGlkOiAke3ZhbGlkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinYwgQnJlYWtpbmcgQ2hhbmdlczogJHtpbnZhbGlkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinKggTmV3IENvbXBvbmVudHM6ICR7bmV3Q29tcG9uZW50c31gKTtcbiAgICBcbiAgICBpZiAoYnJlYWtpbmdDaGFuZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIFdBUk5JTkc6ICR7YnJlYWtpbmdDaGFuZ2VzLmxlbmd0aH0gY29tcG9uZW50KHMpIGhhdmUgYnJlYWtpbmcgY2hhbmdlcyFgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBUaGVzZSBjaGFuZ2VzIG1heSBicmVhayBleGlzdGluZyBXb3JkUHJlc3MgY29udGVudC5cXG5gKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnRzIHdpdGggYnJlYWtpbmcgY2hhbmdlczpgKTtcbiAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGJyZWFraW5nQ2hhbmdlcykge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgLSAke3Jlc3VsdC5jb21wb25lbnRUaXRsZX0gKCR7cmVzdWx0LmNvbXBvbmVudElkfSlgKTtcbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGBcXG4gICBUbyBwcm9jZWVkIGFueXdheSwgY29tcGlsZSB3aXRoIC0tZm9yY2UgZmxhZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKcqCBBbGwgY29tcG9uZW50cyB2YWxpZGF0ZWQgc3VjY2Vzc2Z1bGx5IVxcbmApO1xuICAgIH1cbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogVXBkYXRlIG1hbmlmZXN0IGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGlsYXRpb25cbiAqL1xuY29uc3QgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQgPSAob3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCk6IHZvaWQgPT4ge1xuICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICBjb25zdCB1cGRhdGVkTWFuaWZlc3QgPSB1cGRhdGVNYW5pZmVzdChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgc2F2ZU1hbmlmZXN0KG91dHB1dERpciwgdXBkYXRlZE1hbmlmZXN0KTtcbn07XG5cbi8vIENMSSBzZXR1cFxucHJvZ3JhbVxuICAubmFtZSgnZ3V0ZW5iZXJnLWNvbXBpbGUnKVxuICAuZGVzY3JpcHRpb24oJ1RyYW5zcGlsZSBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MgYW5kIHRoZW1lIHRlbXBsYXRlcycpXG4gIC52ZXJzaW9uKCcxLjAuMCcpO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgY29uZmlnIGZpbGVcbiAqL1xuY29uc3QgaW5pdENvbmZpZyA9IChvcHRzOiB7XG4gIGFwaVVybD86IHN0cmluZztcbiAgb3V0cHV0Pzogc3RyaW5nO1xuICB0aGVtZURpcj86IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBmb3JjZT86IGJvb2xlYW47XG59KTogdm9pZCA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIC8vIENoZWNrIGlmIGNvbmZpZyBhbHJlYWR5IGV4aXN0c1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSAmJiAhb3B0cy5mb3JjZSkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZyBmaWxlIGFscmVhZHkgZXhpc3RzOiAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFVzZSAtLWZvcmNlIHRvIG92ZXJ3cml0ZS5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIGFwaVVybDogb3B0cy5hcGlVcmwgPz8gJ2h0dHBzOi8veW91ci1oYW5kb2ZmLXNpdGUuY29tJyxcbiAgICBvdXRwdXQ6IG9wdHMub3V0cHV0ID8/ICcuL2RlbW8vcGx1Z2luL2Jsb2NrcycsXG4gICAgdGhlbWVEaXI6IG9wdHMudGhlbWVEaXIgPz8gJy4vZGVtby90aGVtZScsXG4gICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gJycsXG4gICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gJycsXG4gIH07XG4gIFxuICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gIFxuICBjb25zb2xlLmxvZyhgXFxu4pyFIENyZWF0ZWQgY29uZmlnIGZpbGU6ICR7Y29uZmlnUGF0aH1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbjpgKTtcbiAgY29uc29sZS5sb2coYCAgIGFwaVVybDogICAke25ld0NvbmZpZy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBvdXRwdXQ6ICAgJHtuZXdDb25maWcub3V0cHV0fWApO1xuICBjb25zb2xlLmxvZyhgICAgdGhlbWVEaXI6ICR7bmV3Q29uZmlnLnRoZW1lRGlyfWApO1xuICBpZiAobmV3Q29uZmlnLnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIHVzZXJuYW1lOiAke25ld0NvbmZpZy51c2VybmFtZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgcGFzc3dvcmQ6ICoqKipgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgXFxu8J+SoSBFZGl0IHRoaXMgZmlsZSB0byBjb25maWd1cmUgeW91ciBIYW5kb2ZmIEFQSSBzZXR0aW5ncy5cXG5gKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGhlbHBlclxuICovXG5jb25zdCBwcm9tcHQgPSAocXVlc3Rpb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IHJlYWRsaW5lID0gcmVxdWlyZSgncmVhZGxpbmUnKTtcbiAgY29uc3QgcmwgPSByZWFkbGluZS5jcmVhdGVJbnRlcmZhY2Uoe1xuICAgIGlucHV0OiBwcm9jZXNzLnN0ZGluLFxuICAgIG91dHB1dDogcHJvY2Vzcy5zdGRvdXQsXG4gIH0pO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgcmwucXVlc3Rpb24ocXVlc3Rpb24sIChhbnN3ZXI6IHN0cmluZykgPT4ge1xuICAgICAgcmwuY2xvc2UoKTtcbiAgICAgIHJlc29sdmUoYW5zd2VyLnRyaW0oKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIHllcy9ub1xuICovXG5jb25zdCBwcm9tcHRZZXNObyA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTdHIgPSBkZWZhdWx0VmFsdWUgPyAnWS9uJyA6ICd5L04nO1xuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYCR7cXVlc3Rpb259IFske2RlZmF1bHRTdHJ9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICByZXR1cm4gYW5zd2VyLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgneScpO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgd2l0aCBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdENob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSwgZGVmYXVsdEluZGV4OiBudW1iZXIgPSAwKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc3QgbWFya2VyID0gaSA9PT0gZGVmYXVsdEluZGV4ID8gJz4nIDogJyAnO1xuICAgIGNvbnNvbGUubG9nKGAgICR7bWFya2VyfSAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXIgWyR7ZGVmYXVsdEluZGV4ICsgMX1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG4gIFxuICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGFuc3dlciwgMTApIC0gMTtcbiAgaWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCBjaG9pY2VzLmxlbmd0aCkge1xuICAgIHJldHVybiBjaG9pY2VzW2luZGV4XTtcbiAgfVxuICByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIG11bHRpcGxlIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0TXVsdGlDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGAgICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlcnMgc2VwYXJhdGVkIGJ5IGNvbW1hcyAoZS5nLiwgMSwyLDMpIG9yICdhbGwnOiBgKTtcbiAgaWYgKGFuc3dlci50b0xvd2VyQ2FzZSgpID09PSAnYWxsJykgcmV0dXJuIGNob2ljZXM7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gW2Nob2ljZXNbMF1dO1xuICBcbiAgY29uc3QgaW5kaWNlcyA9IGFuc3dlci5zcGxpdCgnLCcpLm1hcChzID0+IHBhcnNlSW50KHMudHJpbSgpLCAxMCkgLSAxKTtcbiAgcmV0dXJuIGluZGljZXNcbiAgICAuZmlsdGVyKGkgPT4gaSA+PSAwICYmIGkgPCBjaG9pY2VzLmxlbmd0aClcbiAgICAubWFwKGkgPT4gY2hvaWNlc1tpXSk7XG59O1xuXG4vKipcbiAqIEZpbmQgYWxsIGFycmF5IHByb3BlcnRpZXMgaW4gYSBjb21wb25lbnRcbiAqL1xuY29uc3QgZmluZEFycmF5UHJvcGVydGllcyA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPT4ge1xuICBjb25zdCBhcnJheXM6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIGFycmF5cy5wdXNoKHsgcGF0aCwgcHJvcGVydHkgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3RzXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdvYmplY3QnICYmIHByb3BlcnR5LnByb3BlcnRpZXMpIHtcbiAgICAgIGFycmF5cy5wdXNoKC4uLmZpbmRBcnJheVByb3BlcnRpZXMocHJvcGVydHkucHJvcGVydGllcywgcGF0aCkpO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGFycmF5cztcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZmllbGQgbWFwcGluZyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBhcnJheSBpdGVtIHByb3BlcnRpZXNcbiAqL1xuY29uc3Qgc3VnZ2VzdEZpZWxkTWFwcGluZ3MgPSAoaXRlbVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0+IHtcbiAgY29uc3Qgc3VnZ2VzdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIGNvbnN0IG1hcFByb3BlcnR5ID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICBcbiAgICAgIC8vIFN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gY29tbW9uIHBhdHRlcm5zXG4gICAgICBjb25zdCBsb3dlcktleSA9IGtleS50b0xvd2VyQ2FzZSgpO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdpbWFnZScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdwaG90bycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0aHVtYm5haWwnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdmZWF0dXJlZF9pbWFnZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndGl0bGUnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdoZWFkaW5nJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ25hbWUnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X3RpdGxlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2V4Y2VycHQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnc3VtbWFyeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdkZXNjcmlwdGlvbicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZXhjZXJwdCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjb250ZW50JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2JvZHknKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2NvbnRlbnQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3VybCcgfHwgbG93ZXJLZXkgPT09ICdocmVmJyB8fCBsb3dlcktleS5pbmNsdWRlcygnbGluaycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Blcm1hbGluayc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXRlJykpIHtcbiAgICAgICAgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXknKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpkYXlfbnVtZXJpYyc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ21vbnRoJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6bW9udGhfc2hvcnQnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCd5ZWFyJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6eWVhcic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmZ1bGwnO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdhdXRob3InKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdhdXRob3IubmFtZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjYXRlZ29yeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0YWcnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICd0YXhvbm9teTpjYXRlZ29yeSc7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBuZXN0ZWQgb2JqZWN0c1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIG1hcFByb3BlcnR5KHByb3AucHJvcGVydGllcywgcGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBcbiAgbWFwUHJvcGVydHkoaXRlbVByb3BlcnRpZXMpO1xuICByZXR1cm4gc3VnZ2VzdGlvbnM7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHdpemFyZCBmb3IgY29uZmlndXJpbmcgZHluYW1pYyBhcnJheXNcbiAqL1xuY29uc3QgY29uZmlndXJlRHluYW1pY0FycmF5cyA9IGFzeW5jIChcbiAgYXBpVXJsOiBzdHJpbmcsXG4gIGNvbXBvbmVudE5hbWU6IHN0cmluZyxcbiAgYXV0aD86IEF1dGhDcmVkZW50aWFsc1xuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn6eZIER5bmFtaWMgQXJyYXkgQ29uZmlndXJhdGlvbiBXaXphcmRgKTtcbiAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudDogJHtjb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1cXG5gKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgc3RydWN0dXJlLi4uYCk7XG4gIGxldCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQ7XG4gIHRyeSB7XG4gICAgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgLy8gRmluZCBhcnJheSBwcm9wZXJ0aWVzXG4gIGNvbnN0IGFycmF5UHJvcHMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgXG4gIGlmIChhcnJheVByb3BzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIE5vIGFycmF5IHByb3BlcnRpZXMgZm91bmQgaW4gdGhpcyBjb21wb25lbnQuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIER5bmFtaWMgYXJyYXlzIGFyZSBvbmx5IGF2YWlsYWJsZSBmb3IgYXJyYXktdHlwZSBwcm9wZXJ0aWVzLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHthcnJheVByb3BzLmxlbmd0aH0gYXJyYXkgZmllbGQocyk6YCk7XG4gIGFycmF5UHJvcHMuZm9yRWFjaCgoYXJyLCBpKSA9PiB7XG4gICAgY29uc3QgaXRlbUNvdW50ID0gYXJyLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzID8gT2JqZWN0LmtleXMoYXJyLnByb3BlcnR5Lml0ZW1zLnByb3BlcnRpZXMpLmxlbmd0aCA6IDA7XG4gICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2Fyci5wYXRofSAoJHtpdGVtQ291bnR9IGl0ZW0gcHJvcGVydGllcylgKTtcbiAgfSk7XG4gIFxuICAvLyBTZWxlY3Qgd2hpY2ggYXJyYXlzIHRvIGNvbmZpZ3VyZVxuICBjb25zdCBzZWxlY3RlZEFycmF5cyA9IGFycmF5UHJvcHMubGVuZ3RoID09PSAxIFxuICAgID8gW2FycmF5UHJvcHNbMF1dXG4gICAgOiBhd2FpdCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBjaG9pY2VzID0gYXJyYXlQcm9wcy5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdE11bHRpQ2hvaWNlKCdXaGljaCBhcnJheShzKSBkbyB5b3Ugd2FudCB0byBjb25maWd1cmU/JywgY2hvaWNlcyk7XG4gICAgICAgIHJldHVybiBhcnJheVByb3BzLmZpbHRlcihhID0+IHNlbGVjdGVkLmluY2x1ZGVzKGEucGF0aCkpO1xuICAgICAgfSkoKTtcbiAgXG4gIC8vIExvYWQgZXhpc3RpbmcgY29uZmlnXG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgbGV0IGV4aXN0aW5nQ29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7fTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgZXhpc3RpbmdDb25maWcgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhjb25maWdQYXRoLCAndXRmLTgnKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBJZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgfVxuICB9XG4gIFxuICAvLyBCdWlsZCB0aGUgaW1wb3J0IGNvbmZpZywgcHJlc2VydmluZyBleGlzdGluZyBlbnRyaWVzXG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0gZXhpc3RpbmdDb25maWcuaW1wb3J0IHx8IHsgZWxlbWVudDogZmFsc2UgfTtcbiAgaWYgKCFpbXBvcnRDb25maWcuYmxvY2sgfHwgdHlwZW9mIGltcG9ydENvbmZpZy5ibG9jayA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0ge307XG4gIH1cbiAgY29uc3QgYmxvY2tDb25maWcgPSBpbXBvcnRDb25maWcuYmxvY2sgYXMgUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPjtcbiAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID09PSAnYm9vbGVhbicpIHtcbiAgICBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID0ge307XG4gIH1cbiAgY29uc3QgY29tcG9uZW50RmllbGRDb25maWcgPSBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIGFzIFJlY29yZDxzdHJpbmcsIEZpZWxkQ29uZmlnPjtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUG9zdHNBcnJheSA9IGFzeW5jIChhcnJheVByb3A6IHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0pOiBQcm9taXNlPER5bmFtaWNBcnJheUNvbmZpZz4gPT4ge1xuICAgIC8vIFNlbGVjdGlvbiBtb2RlXG4gICAgY29uc3Qgc2VsZWN0aW9uTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHVzZXJzIHNlbGVjdCBwb3N0cz8nLFxuICAgICAgWydRdWVyeSBCdWlsZGVyIChmaWx0ZXIgYnkgdGF4b25vbXksIG9yZGVyLCBldGMuKScsICdNYW51YWwgU2VsZWN0aW9uIChoYW5kLXBpY2sgc3BlY2lmaWMgcG9zdHMpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc1F1ZXJ5TW9kZSA9IHNlbGVjdGlvbk1vZGUuaW5jbHVkZXMoJ1F1ZXJ5Jyk7XG5cbiAgICAvLyBQb3N0IHR5cGVzXG4gICAgY29uc29sZS5sb2coYFxcbkVudGVyIGFsbG93ZWQgcG9zdCB0eXBlcyAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCBwb3N0VHlwZXNJbnB1dCA9IGF3YWl0IHByb21wdChgUG9zdCB0eXBlcyBbcG9zdF06IGApO1xuICAgIGNvbnN0IHBvc3RUeXBlcyA9IHBvc3RUeXBlc0lucHV0XG4gICAgICA/IHBvc3RUeXBlc0lucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3QnXTtcblxuICAgIC8vIE1heCBpdGVtc1xuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gaXRlbXMgWzEyXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogMTI7XG5cbiAgICAvLyBSZW5kZXIgbW9kZVxuICAgIGNvbnN0IHJlbmRlck1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCBwb3N0cyBiZSByZW5kZXJlZD8nLFxuICAgICAgWydNYXBwZWQgKGNvbnZlcnQgcG9zdCBmaWVsZHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlKScsICdUZW1wbGF0ZSAodXNlIGEgUEhQIHRlbXBsYXRlIGZpbGUpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc01hcHBlZE1vZGUgPSByZW5kZXJNb2RlLmluY2x1ZGVzKCdNYXBwZWQnKTtcblxuICAgIGxldCBmaWVsZE1hcHBpbmc6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICBsZXQgdGVtcGxhdGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoaXNNYXBwZWRNb2RlKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TiiBGaWVsZCBNYXBwaW5nIENvbmZpZ3VyYXRpb25gKTtcblxuICAgICAgY29uc3QgaXRlbVByb3BzID0gYXJyYXlQcm9wLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGl0ZW1Qcm9wcykge1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IHN1Z2dlc3RGaWVsZE1hcHBpbmdzKGl0ZW1Qcm9wcyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYFxcbkknbGwgc3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBmaWVsZCBuYW1lcy4gUHJlc3MgRW50ZXIgdG8gYWNjZXB0IG9yIHR5cGUgYSBuZXcgdmFsdWUuYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5BdmFpbGFibGUgc291cmNlczpgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X3RpdGxlLCBwb3N0X2V4Y2VycHQsIHBvc3RfY29udGVudCwgcGVybWFsaW5rLCBwb3N0X2lkYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gZmVhdHVyZWRfaW1hZ2VgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X2RhdGU6ZGF5LCBwb3N0X2RhdGU6bW9udGhfc2hvcnQsIHBvc3RfZGF0ZTp5ZWFyLCBwb3N0X2RhdGU6ZnVsbGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGF1dGhvci5uYW1lLCBhdXRob3IudXJsLCBhdXRob3IuYXZhdGFyYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gdGF4b25vbXk6Y2F0ZWdvcnksIHRheG9ub215OnBvc3RfdGFnYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gbWV0YTpmaWVsZF9uYW1lYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gKGxlYXZlIGVtcHR5IHRvIHNraXApXFxuYCk7XG5cbiAgICAgICAgY29uc3QgZmxhdHRlblByb3BzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgIGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICAgICAgICBjb25zdCBwID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2goLi4uZmxhdHRlblByb3BzKHByb3AucHJvcGVydGllcywgcCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaChwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHBhdGhzO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoY29uc3QgZmllbGRQYXRoIG9mIGZsYXR0ZW5Qcm9wcyhpdGVtUHJvcHMpKSB7XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9IHN1Z2dlc3Rpb25zW2ZpZWxkUGF0aF0gfHwgJyc7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFN0ciA9IHN1Z2dlc3Rpb24gPyBgIFske3N1Z2dlc3Rpb259XWAgOiAnJztcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gYXdhaXQgcHJvbXB0KGAgICR7ZmllbGRQYXRofSR7ZGVmYXVsdFN0cn06IGApO1xuICAgICAgICAgIGNvbnN0IGZpbmFsTWFwcGluZyA9IG1hcHBpbmcgfHwgc3VnZ2VzdGlvbjtcbiAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nKSB7XG4gICAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nLnN0YXJ0c1dpdGgoJ3snKSkge1xuICAgICAgICAgICAgICB0cnkgeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IEpTT04ucGFyc2UoZmluYWxNYXBwaW5nKTsgfVxuICAgICAgICAgICAgICBjYXRjaCB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nOyB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZGVmYXVsdFRlbXBsYXRlID0gYHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvJHthcnJheVByb3AucGF0aH0taXRlbS5waHBgO1xuICAgICAgdGVtcGxhdGVQYXRoID0gYXdhaXQgcHJvbXB0KGBUZW1wbGF0ZSBwYXRoIFske2RlZmF1bHRUZW1wbGF0ZX1dOiBgKSB8fCBkZWZhdWx0VGVtcGxhdGU7XG4gICAgfVxuXG4gICAgY29uc3QgYXJyYXlDb25maWc6IER5bmFtaWNBcnJheUNvbmZpZyA9IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBwb3N0VHlwZXMsXG4gICAgICBzZWxlY3Rpb25Nb2RlOiBpc1F1ZXJ5TW9kZSA/ICdxdWVyeScgOiAnbWFudWFsJyxcbiAgICAgIG1heEl0ZW1zLFxuICAgICAgcmVuZGVyTW9kZTogaXNNYXBwZWRNb2RlID8gJ21hcHBlZCcgOiAndGVtcGxhdGUnLFxuICAgIH07XG4gICAgaWYgKGlzTWFwcGVkTW9kZSAmJiBPYmplY3Qua2V5cyhmaWVsZE1hcHBpbmcpLmxlbmd0aCA+IDApIGFycmF5Q29uZmlnLmZpZWxkTWFwcGluZyA9IGZpZWxkTWFwcGluZztcbiAgICBpZiAoIWlzTWFwcGVkTW9kZSAmJiB0ZW1wbGF0ZVBhdGgpIGFycmF5Q29uZmlnLnRlbXBsYXRlUGF0aCA9IHRlbXBsYXRlUGF0aDtcbiAgICBpZiAoaXNRdWVyeU1vZGUpIHtcbiAgICAgIGFycmF5Q29uZmlnLmRlZmF1bHRRdWVyeUFyZ3MgPSB7XG4gICAgICAgIHBvc3RzX3Blcl9wYWdlOiBNYXRoLm1pbihtYXhJdGVtcywgNiksXG4gICAgICAgIG9yZGVyYnk6ICdkYXRlJyxcbiAgICAgICAgb3JkZXI6ICdERVNDJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBhcnJheUNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIEJyZWFkY3J1bWJzQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8QnJlYWRjcnVtYnNBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBCcmVhZGNydW1icyBhcmUgYnVpbHQgYXV0b21hdGljYWxseSBmcm9tIHRoZSBjdXJyZW50IHBhZ2UgVVJMLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHdpbGwgc2hvdyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAnYnJlYWRjcnVtYnMnIH07XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBUYXhvbm9teUFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlVGF4b25vbXlBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPFRheG9ub215QXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgVGF4b25vbXkgdGVybXMgYXJlIGZldGNoZWQgZnJvbSB0aGUgY3VycmVudCBwb3N0IHNlcnZlci1zaWRlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgdG9nZ2xlIGFuZCBhIGRyb3Bkb3duIHRvIGNob29zZSB0aGUgdGF4b25vbXkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIHNsdWcgfVxcbmApO1xuXG4gICAgY29uc29sZS5sb2coYEVudGVyIHRoZSB0YXhvbm9teSBzbHVncyBlZGl0b3JzIGNhbiBjaG9vc2UgZnJvbSAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCB0YXhvbm9teUlucHV0ID0gYXdhaXQgcHJvbXB0KGBUYXhvbm9taWVzIFtwb3N0X3RhZyxjYXRlZ29yeV06IGApO1xuICAgIGNvbnN0IHRheG9ub21pZXMgPSB0YXhvbm9teUlucHV0XG4gICAgICA/IHRheG9ub215SW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdF90YWcnLCAnY2F0ZWdvcnknXTtcblxuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gdGVybXMgdG8gZGlzcGxheSAoLTEgPSBhbGwpIFstMV06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IC0xO1xuXG4gICAgY29uc3QgY29uZmlnOiBUYXhvbm9teUFycmF5Q29uZmlnID0geyBhcnJheVR5cGU6ICd0YXhvbm9teScsIHRheG9ub21pZXMgfTtcbiAgICBpZiAobWF4SXRlbXMgPiAwKSBjb25maWcubWF4SXRlbXMgPSBtYXhJdGVtcztcbiAgICByZXR1cm4gY29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgUGFnaW5hdGlvbkFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5ID0gYXN5bmMgKG90aGVyQXJyYXlQYXRoczogc3RyaW5nW10pOiBQcm9taXNlPFBhZ2luYXRpb25BcnJheUNvbmZpZyB8IG51bGw+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgUGFnaW5hdGlvbiBsaW5rcyBhcmUgZGVyaXZlZCBhdXRvbWF0aWNhbGx5IGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5IHF1ZXJ5LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcblxuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pqg77iPICBObyBzaWJsaW5nIGFycmF5cyBmb3VuZCB0byBjb25uZWN0IHRvLiBDb25maWd1cmUgYSBwb3N0cyBhcnJheSBmaXJzdC5gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBjb25uZWN0ZWRGaWVsZDogc3RyaW5nO1xuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IG90aGVyQXJyYXlQYXRoc1swXTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb25uZWN0ZWQgdG86ICR7Y29ubmVjdGVkRmllbGR9IChvbmx5IG9wdGlvbilgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgICAnV2hpY2ggcG9zdHMgYXJyYXkgc2hvdWxkIHRoaXMgcGFnaW5hdGlvbiBiZSBjb25uZWN0ZWQgdG8/JyxcbiAgICAgICAgb3RoZXJBcnJheVBhdGhzLFxuICAgICAgICAwXG4gICAgICApO1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBjaG9pY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAncGFnaW5hdGlvbicsIGNvbm5lY3RlZEZpZWxkIH07XG4gIH07XG5cbiAgLy8gQ29uZmlndXJlIGVhY2ggc2VsZWN0ZWQgYXJyYXlcbiAgZm9yIChjb25zdCBhcnJheVByb3Agb2Ygc2VsZWN0ZWRBcnJheXMpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvbmZpZ3VyaW5nOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1cXG5gKTtcblxuICAgIC8vIExldCB0aGUgdXNlciBjaG9vc2UgdGhlIGFycmF5IHR5cGVcbiAgICBjb25zdCBhcnJheVR5cGVDaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnV2hhdCBraW5kIG9mIGRhdGEgc2hvdWxkIHRoaXMgYXJyYXkgY29udGFpbj8nLFxuICAgICAgW1xuICAgICAgICAnUG9zdHMg4oCUIHF1ZXJ5IG9yIGhhbmQtcGljayBXb3JkUHJlc3MgcG9zdHMgKGRlZmF1bHQpJyxcbiAgICAgICAgJ0JyZWFkY3J1bWJzIOKAlCBhdXRvLWdlbmVyYXRlZCB0cmFpbCBmcm9tIGN1cnJlbnQgVVJMJyxcbiAgICAgICAgJ1RheG9ub215IOKAlCB0ZXJtcyBhdHRhY2hlZCB0byB0aGUgY3VycmVudCBwb3N0JyxcbiAgICAgICAgJ1BhZ2luYXRpb24g4oCUIGxpbmtzIGRlcml2ZWQgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXknLFxuICAgICAgXSxcbiAgICAgIDBcbiAgICApO1xuXG4gICAgbGV0IGFycmF5Q29uZmlnOiBGaWVsZENvbmZpZyB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdCcmVhZGNydW1icycpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdUYXhvbm9teScpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdQYWdpbmF0aW9uJykpIHtcbiAgICAgIC8vIE9mZmVyIHRoZSBvdGhlciBhbHJlYWR5LWNvbmZpZ3VyZWQgKG9yIHlldC10by1iZS1jb25maWd1cmVkKSBhcnJheSBwYXRocyBhcyBjYW5kaWRhdGVzXG4gICAgICBjb25zdCBzaWJsaW5nID0gc2VsZWN0ZWRBcnJheXNcbiAgICAgICAgLmZpbHRlcihhID0+IGEucGF0aCAhPT0gYXJyYXlQcm9wLnBhdGgpXG4gICAgICAgIC5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkoc2libGluZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFBvc3RzXG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBvc3RzQXJyYXkoYXJyYXlQcm9wKTtcbiAgICB9XG5cbiAgICBpZiAoYXJyYXlDb25maWcpIHtcbiAgICAgIGNvbXBvbmVudEZpZWxkQ29uZmlnW2FycmF5UHJvcC5wYXRoXSA9IGFycmF5Q29uZmlnO1xuICAgICAgY29uc29sZS5sb2coYFxcbuKchSBDb25maWd1cmVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH0gKCR7KGFycmF5Q29uZmlnIGFzIGFueSkuYXJyYXlUeXBlID8/ICdwb3N0cyd9KWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBTa2lwcGVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1gKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFVwZGF0ZSBjb25maWcgZmlsZSDigJQgcmVtb3ZlIGxlZ2FjeSBkeW5hbWljQXJyYXlzIGlmIHByZXNlbnRcbiAgY29uc3QgeyBkeW5hbWljQXJyYXlzOiBfbGVnYWN5RHluYW1pYywgLi4ucmVzdENvbmZpZyB9ID0gZXhpc3RpbmdDb25maWc7XG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIC4uLnJlc3RDb25maWcsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gIH07XG4gIFxuICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uIFByZXZpZXc6XFxuYCk7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHsgaW1wb3J0OiBpbXBvcnRDb25maWcgfSwgbnVsbCwgMikpO1xuICBcbiAgY29uc3Qgc2hvdWxkU2F2ZSA9IGF3YWl0IHByb21wdFllc05vKCdcXG5TYXZlIHRvIGhhbmRvZmYtd3AuY29uZmlnLmpzb24/JywgdHJ1ZSk7XG4gIFxuICBpZiAoc2hvdWxkU2F2ZSkge1xuICAgIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyFIFNhdmVkIHRvICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBOZXh0IHN0ZXBzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICAxLiBSdW46IG5wbSBydW4gZGV2IC0tICR7Y29tcG9uZW50TmFtZX0gLS1mb3JjZWApO1xuICAgIGNvbnNvbGUubG9nKGAgICAyLiBCdWlsZCB5b3VyIGJsb2NrczogY2QgZGVtby9wbHVnaW4gJiYgbnBtIHJ1biBidWlsZGApO1xuICAgIGNvbnNvbGUubG9nKGAgICAzLiBUZXN0IHRoZSBibG9jayBpbiBXb3JkUHJlc3NcXG5gKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWd1cmF0aW9uIG5vdCBzYXZlZC4gQ29weSB0aGUgSlNPTiBhYm92ZSBtYW51YWxseSBpZiBuZWVkZWQuXFxuYCk7XG4gIH1cbn07XG5cbi8vIENvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdjb25maWd1cmUtZHluYW1pYyBbY29tcG9uZW50XScpXG4gIC5hbGlhcygnd2l6YXJkJylcbiAgLmRlc2NyaXB0aW9uKCdJbnRlcmFjdGl2ZSB3aXphcmQgdG8gY29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGZvciBhIGNvbXBvbmVudCcpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctbCwgLS1saXN0JywgJ0xpc3QgYXZhaWxhYmxlIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMnKVxuICAuYWN0aW9uKGFzeW5jIChjb21wb25lbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdHM6IHtcbiAgICBhcGlVcmw/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgbGlzdD86IGJvb2xlYW47XG4gIH0pID0+IHtcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIFxuICAgIC8vIElmIGxpc3RpbmcgY29tcG9uZW50cywgc2hvdyBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzXG4gICAgaWYgKG9wdHMubGlzdCB8fCAhY29tcG9uZW50TmFtZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbvCflI0gRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QgZnJvbSAke2FwaVVybH0uLi5cXG5gKTtcbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICAgIFxuICAgICAgICAvLyBGZXRjaCBlYWNoIGNvbXBvbmVudCB0byBmaW5kIG9uZXMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzLiBDaGVja2luZyBmb3IgYXJyYXkgZmllbGRzLi4uXFxuYCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjb21wb25lbnRzV2l0aEFycmF5czogQXJyYXk8eyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBhcnJheXM6IHN0cmluZ1tdIH0+ID0gW107XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGlkLCBhdXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGFycmF5cyA9IGZpbmRBcnJheVByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgaWYgKGFycmF5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGNvbXBvbmVudHNXaXRoQXJyYXlzLnB1c2goe1xuICAgICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICAgIHRpdGxlOiBjb21wb25lbnQudGl0bGUsXG4gICAgICAgICAgICAgICAgYXJyYXlzOiBhcnJheXMubWFwKGEgPT4gYS5wYXRoKSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBTa2lwIGZhaWxlZCBjb21wb25lbnRzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoY29tcG9uZW50c1dpdGhBcnJheXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgTm8gY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkcyBmb3VuZC5cXG5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn6epIENvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHM6XFxuYCk7XG4gICAgICAgIGNvbXBvbmVudHNXaXRoQXJyYXlzLmZvckVhY2goKGMsIGkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpICsgMX0uICR7Yy50aXRsZX0gKCR7Yy5pZH0pYCk7XG4gICAgICAgICAgYy5hcnJheXMuZm9yRWFjaChhID0+IGNvbnNvbGUubG9nKGAgICAgICDilJTilIAgJHthfWApKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBpZiAob3B0cy5saXN0KSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYFxcbvCfkqEgUnVuOiBucG0gcnVuIGRldiAtLSB3aXphcmQgPGNvbXBvbmVudC1pZD5cXG5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEludGVyYWN0aXZlIHNlbGVjdGlvblxuICAgICAgICBjb25zdCBjaG9pY2VzID0gY29tcG9uZW50c1dpdGhBcnJheXMubWFwKGMgPT4gYCR7Yy50aXRsZX0gKCR7Yy5pZH0pYCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcHJvbXB0Q2hvaWNlKCdcXG5TZWxlY3QgYSBjb21wb25lbnQgdG8gY29uZmlndXJlOicsIGNob2ljZXMsIDApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZEluZGV4ID0gY2hvaWNlcy5pbmRleE9mKHNlbGVjdGVkKTtcbiAgICAgICAgY29tcG9uZW50TmFtZSA9IGNvbXBvbmVudHNXaXRoQXJyYXlzW3NlbGVjdGVkSW5kZXhdLmlkO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGF3YWl0IGNvbmZpZ3VyZUR5bmFtaWNBcnJheXMoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgfSk7XG5cbi8vIEluaXQgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnaW5pdCcpXG4gIC5kZXNjcmlwdGlvbignQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy0tb3V0cHV0IDxkaXI+JywgJ091dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcycpXG4gIC5vcHRpb24oJy0tdGhlbWUtZGlyIDxkaXI+JywgJ1RoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMnKVxuICAub3B0aW9uKCctLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdPdmVyd3JpdGUgZXhpc3RpbmcgY29uZmlnIGZpbGUnKVxuICAuYWN0aW9uKChvcHRpb25zLCBjb21tYW5kKSA9PiB7XG4gICAgLy8gVXNlIG9wdHNXaXRoR2xvYmFscyB0byBnZXQgb3B0aW9ucyBmcm9tIGJvdGggc3ViY29tbWFuZCBhbmQgcGFyZW50XG4gICAgY29uc3Qgb3B0cyA9IGNvbW1hbmQub3B0c1dpdGhHbG9iYWxzKCk7XG4gICAgaW5pdENvbmZpZyhvcHRzKTtcbiAgfSk7XG5cbi8vIERlZmF1bHQgY29tbWFuZCBmb3IgYmxvY2tzXG5wcm9ncmFtXG4gIC5hcmd1bWVudCgnW2NvbXBvbmVudF0nLCAnQ29tcG9uZW50IG5hbWUgdG8gY29tcGlsZSBvciB2YWxpZGF0ZScpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCBgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6ICR7Y29uZmlnLmFwaVVybH0pYClcbiAgLm9wdGlvbignLW8sIC0tb3V0cHV0IDxkaXI+JywgYE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogJHtjb25maWcub3V0cHV0fSlgKVxuICAub3B0aW9uKCctLWFsbCcsICdDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50cycpXG4gIC5vcHRpb24oJy0tdGhlbWUnLCAnQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKSB0byB0aGVtZSBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctdCwgLS10aGVtZS1kaXIgPGRpcj4nLCBgVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcyAoZGVmYXVsdDogJHtjb25maWcudGhlbWVEaXJ9KWApXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZSBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZScsICdWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUtYWxsJywgJ1ZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdGb3JjZSBjb21waWxhdGlvbiBldmVuIHdpdGggYnJlYWtpbmcgY2hhbmdlcycpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czogeyBcbiAgICBhcGlVcmw/OiBzdHJpbmc7IFxuICAgIG91dHB1dD86IHN0cmluZzsgXG4gICAgYWxsPzogYm9vbGVhbjsgXG4gICAgdGhlbWU/OiBib29sZWFuO1xuICAgIHRoZW1lRGlyPzogc3RyaW5nO1xuICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgIHBhc3N3b3JkPzogc3RyaW5nO1xuICAgIHZhbGlkYXRlPzogYm9vbGVhbjtcbiAgICB2YWxpZGF0ZUFsbD86IGJvb2xlYW47XG4gICAgZm9yY2U/OiBib29sZWFuO1xuICB9KSA9PiB7XG4gICAgLy8gTWVyZ2UgQ0xJIG9wdGlvbnMgd2l0aCBjb25maWcgKENMSSB0YWtlcyBwcmVjZWRlbmNlKVxuICAgIGNvbnN0IGFwaVVybCA9IG9wdHMuYXBpVXJsID8/IGNvbmZpZy5hcGlVcmw7XG4gICAgY29uc3Qgb3V0cHV0ID0gb3B0cy5vdXRwdXQgPz8gY29uZmlnLm91dHB1dDtcbiAgICBjb25zdCB0aGVtZURpciA9IG9wdHMudGhlbWVEaXIgPz8gY29uZmlnLnRoZW1lRGlyO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIFxuICAgIC8vIFZhbGlkYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy52YWxpZGF0ZUFsbCkge1xuICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoYXBpVXJsLCBvdXRwdXQsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICBpZiAob3B0cy52YWxpZGF0ZSAmJiBjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShhcGlVcmwsIG91dHB1dCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkICYmICFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy50aGVtZSkge1xuICAgICAgYXdhaXQgY29tcGlsZVRoZW1lKGFwaVVybCwgdGhlbWVEaXIsIGF1dGgpO1xuICAgIH0gZWxzZSBpZiAob3B0cy5hbGwpIHtcbiAgICAgIC8vIFZhbGlkYXRlIGFsbCBmaXJzdCB1bmxlc3MgZm9yY2VkXG4gICAgICBpZiAoIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbvCflI0gUHJlLWNvbXBpbGF0aW9uIHZhbGlkYXRpb24uLi5cXG5gKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB2YWxpZGF0ZUFsbChhcGlVcmwsIG91dHB1dCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIHZhbGlkYXRlQWxsIGV4aXRzIHdpdGggY29kZSAxIG9uIGJyZWFraW5nIGNoYW5nZXNcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGNvbXBpbGVBbGwoYXBpVXJsLCBvdXRwdXQsIGF1dGgpO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICAgICAgY29uc29sZS5sb2coYFxcbvCfk50gVXBkYXRpbmcgcHJvcGVydHkgbWFuaWZlc3QuLi5gKTtcbiAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcbiAgICAgICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXQsIGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIFNraXAgZmFpbGVkIGNvbXBvbmVudHNcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYCAgIOKchSBNYW5pZmVzdCB1cGRhdGVkXFxuYCk7XG4gICAgfSBlbHNlIGlmIChjb21wb25lbnROYW1lKSB7XG4gICAgICAvLyBCdWlsZCBtZXJnZWQtZ3JvdXAgbG9va3VwIG9uY2UgZm9yIHRoaXMgYnJhbmNoXG4gICAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgICBpZiAobW9kZSA9PT0gJ21lcmdlZCcpIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIGtleSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhlbHBlcjogY29tcGlsZSBhbiBlbnRpcmUgbWVyZ2VkIGdyb3VwIGJ5IGl0cyBjb25maWcga2V5XG4gICAgICBjb25zdCBjb21waWxlR3JvdXBCeUtleSA9IGFzeW5jIChncm91cEtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0KGFwaVVybCwgYXV0aCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gZ3JvdXBLZXkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50cyBmb3VuZCBmb3IgbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbEdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiBncm91cE1hdGNoZXMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZnVsbCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgYy5pZCwgYXV0aCk7XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGZ1bGwpO1xuICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjLmlkfSAodGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQpYCk7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVsbEdyb3VwQ29tcG9uZW50cy5wdXNoKGZ1bGwpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4p2MIEZhaWxlZCB0byBmZXRjaCAke2MuaWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBlcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBDb3VsZCBub3QgZmV0Y2ggYW55IGNvbXBvbmVudHMgZm9yIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwKGFwaVVybCwgb3V0cHV0LCBncm91cEtleSwgZnVsbEdyb3VwQ29tcG9uZW50cywgYXV0aCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgR3JvdXAgXCIke2dyb3VwS2V5fVwiIGNvbXBpbGVkICgke2Z1bGxHcm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cykuXFxuYCk7XG4gICAgICB9O1xuXG4gICAgICAvLyBUcnkgY29tcG9uZW50IGZpcnN0LCB0aGVuIGZhbGwgYmFjayB0byBncm91cCAoZS5nLiBcImhlcm9cIiAtPiBIZXJvIG1lcmdlZCBibG9jaylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBjb21wb25lbnQgYmVsb25ncyB0byBhIG1lcmdlZCBncm91cCwgY29tcGlsZSB0aGUgd2hvbGUgZ3JvdXAgaW5zdGVhZFxuICAgICAgICBpZiAoY29tcG9uZW50Lmdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGNvbXBvbmVudC5ncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICBpZiAoZ3JvdXBLZXkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICBcIiR7Y29tcG9uZW50TmFtZX1cIiBiZWxvbmdzIHRvIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIg4oCUIGNvbXBpbGluZyBlbnRpcmUgZ3JvdXAuXFxuYCk7XG4gICAgICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoYXBpVXJsLCBvdXRwdXQsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICAgICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGUoe1xuICAgICAgICAgIGFwaVVybCxcbiAgICAgICAgICBvdXRwdXREaXI6IG91dHB1dCxcbiAgICAgICAgICBjb21wb25lbnROYW1lLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgIH0pO1xuICAgICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXQsIGNvbXBvbmVudCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDwn5OdIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICAgIH0gY2F0Y2ggKGNvbXBvbmVudEVycm9yKSB7XG4gICAgICAgIC8vIE5vIGNvbXBvbmVudCB3aXRoIHRoaXMgbmFtZSDigJMgdHJ5IGFzIGdyb3VwXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICBObyBjb21wb25lbnQgXCIke2NvbXBvbmVudE5hbWV9XCIgZm91bmQsIGNoZWNraW5nIGdyb3Vwcy4uLlxcbmApO1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgZmV0Y2hBbGxDb21wb25lbnRzTGlzdChhcGlVcmwsIGF1dGgpO1xuICAgICAgICBjb25zdCBuYW1lTG93ZXIgPSBjb21wb25lbnROYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gbmFtZUxvd2VyLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnQgb3IgZ3JvdXAgZm91bmQgZm9yIFwiJHtjb21wb25lbnROYW1lfVwiLmApO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgICAgICBDb21wb25lbnQgZmV0Y2g6ICR7Y29tcG9uZW50RXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGNvbXBvbmVudEVycm9yLm1lc3NhZ2UgOiBjb21wb25lbnRFcnJvcn1gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgICAgIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQobmFtZUxvd2VyKSA/PyBncm91cE1hdGNoZXNbMF0uZ3JvdXA7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IFBsZWFzZSBzcGVjaWZ5IGEgY29tcG9uZW50IG5hbWUsIGdyb3VwIG5hbWUsIHVzZSAtLWFsbCBmbGFnLCAtLXRoZW1lIGZsYWcsIG9yIC0tdmFsaWRhdGUtYWxsIGZsYWcnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG5Vc2FnZTonKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+ICAgQ29tcGlsZSBvbmUgY29tcG9uZW50IChlLmcuIGhlcm8tYXJ0aWNsZSknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Z3JvdXAtbmFtZT4gICAgICBPciBjb21waWxlIGEgbWVyZ2VkIGdyb3VwIChlLmcuIGhlcm8pJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXRoZW1lJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZSBoZXJvLWFydGljbGUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsIC0tZm9yY2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSBoZXJvIC0tYXBpLXVybCBodHRwOi8vbG9jYWxob3N0OjQwMDAgLS1vdXRwdXQgLi9ibG9ja3MnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH0pO1xuXG5wcm9ncmFtLnBhcnNlKCk7XG5cbmV4cG9ydCB7IGNvbXBpbGUsIGdlbmVyYXRlQmxvY2ssIGZldGNoQ29tcG9uZW50IH07XG4iXX0=