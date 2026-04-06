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
        schemaMigrations: fileConfig.schemaMigrations,
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
const generateBlock = (component, apiUrl, resolvedConfig, schemaHistory) => {
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
    const historyEntry = schemaHistory ? (0, validators_1.getComponentHistory)(schemaHistory, component.id) : undefined;
    const currentProps = (0, validators_1.extractProperties)(component.properties);
    const migrationOverrides = resolvedConfig.schemaMigrations?.[component.id];
    const deprecationsCode = (0, generators_1.generateDeprecations)(historyEntry, currentProps, migrationOverrides, !!innerBlocksField);
    return {
        blockJson: (0, generators_1.generateBlockJson)(component, hasScreenshot, apiUrl, componentDynamicArrays, innerBlocksField),
        indexJs: (0, generators_1.generateIndexJs)(component, componentDynamicArrays, innerBlocksField, deprecationsCode),
        renderPhp: (0, generators_1.generateRenderPhp)(component, componentDynamicArrays, innerBlocksField),
        editorScss: (0, generators_1.generateEditorScss)(component),
        styleScss: (0, generators_1.generateStyleScss)(component),
        readme: (0, generators_1.generateReadme)(component),
        migrationSchema: (0, generators_1.generateMigrationSchema)(component),
        schemaChangelog: (0, generators_1.generateSchemaChangelog)(component.id, historyEntry),
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
    if (block.schemaChangelog) {
        fs.writeFileSync(path.join(blockDir, 'schema-changelog.json'), block.schemaChangelog);
    }
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
        // Generate block files (with deprecation support from schema history)
        console.log(`⚙️  Generating Gutenberg block...`);
        const schemaHistory = (0, validators_1.loadManifest)(options.outputDir);
        const block = generateBlock(component, options.apiUrl, config, schemaHistory);
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
        const schemaHistory = (0, validators_1.loadManifest)(outputDir);
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
                const block = generateBlock(component, apiUrl, config, schemaHistory);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHlDQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsbURBQXFDO0FBRXJDLG1DQUFnUztBQTJCaFM7O0dBRUc7QUFDSCxNQUFNLGNBQWMsR0FBbUI7SUFDckMsTUFBTSxFQUFFLHVCQUF1QjtJQUMvQixNQUFNLEVBQUUsVUFBVTtJQUNsQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFO0lBQzFCLE1BQU0sRUFBRSxFQUFFO0NBQ1gsQ0FBQztBQUVGOzs7R0FHRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxhQUFpRCxFQUFnQixFQUFFO0lBQy9GLE1BQU0sWUFBWSxHQUFpQixFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUN0RCxNQUFNLFdBQVcsR0FBMEMsRUFBRSxDQUFDO0lBRTlELEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7UUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQUUsU0FBUztRQUM5QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQztZQUFFLFNBQVM7UUFDOUIsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENB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QUUsQ0FBQyxDQUFDO2dCQUN0SCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLENBQUM7WUFDRCxNQUFNLFFBQVEsR0FDWiwyQkFBMkIsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztZQUN0RSxNQUFNLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7SUFDSCxDQUFDO1NBQU0sQ0FBQztRQUNOLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEdBQTBHLENBQUMsQ0FBQztRQUMxSCxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0ZBQXNGLENBQUMsQ0FBQztRQUNwRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlGQUFpRixDQUFDLENBQUM7UUFDL0YsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7UUFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUNyRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdGQUFnRixDQUFDLENBQUM7UUFDOUYsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFTCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG4vKipcbiAqIEd1dGVuYmVyZyBDb21waWxlclxuICogXG4gKiBUcmFuc3BpbGVzIEhhbmRvZmYgY29tcG9uZW50cyB0byBXb3JkUHJlc3MgR3V0ZW5iZXJnIGJsb2Nrcy5cbiAqIFxuICogVXNhZ2U6XG4gKiAgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+IFtvcHRpb25zXVxuICogICBcbiAqIE9wdGlvbnM6XG4gKiAgIC0tYXBpLXVybCA8dXJsPiAgICBIYW5kb2ZmIEFQSSBiYXNlIFVSTCAoZGVmYXVsdDogaHR0cDovL2xvY2FsaG9zdDo0MDAwKVxuICogICAtLW91dHB1dCA8ZGlyPiAgICAgT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzIChkZWZhdWx0OiAuL2Jsb2NrcylcbiAqICAgLS1hbGwgICAgICAgICAgICAgIENvbXBpbGUgYWxsIGF2YWlsYWJsZSBjb21wb25lbnRzXG4gKiAgIC0tdGhlbWUgICAgICAgICAgICBDb21waWxlIGhlYWRlci9mb290ZXIgdG8gdGhlbWUgdGVtcGxhdGVzXG4gKiAgIC0tdmFsaWRhdGUgICAgICAgICBWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgY2hhbmdlc1xuICogICAtLXZhbGlkYXRlLWFsbCAgICAgVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqIFxuICogQ29uZmlndXJhdGlvbjpcbiAqICAgQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHlvdXIgcHJvamVjdCByb290IHRvIHNldCBkZWZhdWx0czpcbiAqICAge1xuICogICAgIFwiYXBpVXJsXCI6IFwiaHR0cHM6Ly9kZW1vLmhhbmRvZmYuY29tXCIsXG4gKiAgICAgXCJvdXRwdXRcIjogXCIuL3BhdGgvdG8vYmxvY2tzXCIsXG4gKiAgICAgXCJ0aGVtZURpclwiOiBcIi4vcGF0aC90by90aGVtZVwiXG4gKiAgIH1cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgcHJldHRpZXIgZnJvbSAncHJldHRpZXInO1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHksIENvbXBpbGVyT3B0aW9ucywgR2VuZXJhdGVkQmxvY2ssIEhhbmRvZmZXcENvbmZpZywgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEZpZWxkQ29uZmlnLCBJbXBvcnRDb25maWcsIENvbXBvbmVudEltcG9ydENvbmZpZywgRmllbGRQcmVmZXJlbmNlcywgaXNEeW5hbWljQXJyYXlDb25maWcgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBBdXRoIGNyZWRlbnRpYWxzIGZvciBIVFRQIHJlcXVlc3RzXG4gKi9cbmludGVyZmFjZSBBdXRoQ3JlZGVudGlhbHMge1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVxdWlyZWQgY29uZmlnIHdpdGggZGVmYXVsdHMgYXBwbGllZFxuICovXG5pbnRlcmZhY2UgUmVzb2x2ZWRDb25maWcge1xuICBhcGlVcmw6IHN0cmluZztcbiAgb3V0cHV0OiBzdHJpbmc7XG4gIHRoZW1lRGlyOiBzdHJpbmc7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbiAgaW1wb3J0OiBJbXBvcnRDb25maWc7XG4gIGdyb3VwczogUmVjb3JkPHN0cmluZywgJ21lcmdlZCcgfCAnaW5kaXZpZHVhbCc+O1xuICBzY2hlbWFNaWdyYXRpb25zPzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywge1xuICAgIHJlbmFtZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIHRyYW5zZm9ybXM/OiBSZWNvcmQ8c3RyaW5nLCB7IGZyb206IHN0cmluZzsgdG86IHN0cmluZzsgcnVsZTogc3RyaW5nIH0+O1xuICB9Pj47XG59XG5cbi8qKlxuICogRGVmYXVsdCBjb25maWd1cmF0aW9uIHZhbHVlc1xuICovXG5jb25zdCBERUZBVUxUX0NPTkZJRzogUmVzb2x2ZWRDb25maWcgPSB7XG4gIGFwaVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gIG91dHB1dDogJy4vYmxvY2tzJyxcbiAgdGhlbWVEaXI6ICcuL3RoZW1lJyxcbiAgdXNlcm5hbWU6IHVuZGVmaW5lZCxcbiAgcGFzc3dvcmQ6IHVuZGVmaW5lZCxcbiAgaW1wb3J0OiB7IGVsZW1lbnQ6IGZhbHNlIH0sXG4gIGdyb3Vwczoge30sXG59O1xuXG4vKipcbiAqIE1pZ3JhdGUgbGVnYWN5IGBkeW5hbWljQXJyYXlzYCBjb25maWcgdG8gdGhlIG5ldyBgaW1wb3J0YCBzdHJ1Y3R1cmUuXG4gKiBHcm91cHMgXCJjb21wb25lbnRJZC5maWVsZE5hbWVcIiBlbnRyaWVzIHVuZGVyIGltcG9ydC5ibG9ja1tjb21wb25lbnRJZF1bZmllbGROYW1lXS5cbiAqL1xuY29uc3QgbWlncmF0ZUR5bmFtaWNBcnJheXMgPSAoZHluYW1pY0FycmF5czogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPik6IEltcG9ydENvbmZpZyA9PiB7XG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0geyBlbGVtZW50OiBmYWxzZSB9O1xuICBjb25zdCBibG9ja0NvbmZpZzogUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICghY29uZmlnLmVuYWJsZWQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGRvdEluZGV4ID0ga2V5LmluZGV4T2YoJy4nKTtcbiAgICBpZiAoZG90SW5kZXggPT09IC0xKSBjb250aW51ZTtcbiAgICBjb25zdCBjb21wb25lbnRJZCA9IGtleS5zdWJzdHJpbmcoMCwgZG90SW5kZXgpO1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoZG90SW5kZXggKyAxKTtcblxuICAgIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50SWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPT09ICdib29sZWFuJykge1xuICAgICAgYmxvY2tDb25maWdbY29tcG9uZW50SWRdID0ge307XG4gICAgfVxuICAgIChibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPilbZmllbGROYW1lXSA9IGNvbmZpZztcbiAgfVxuXG4gIGlmIChPYmplY3Qua2V5cyhibG9ja0NvbmZpZykubGVuZ3RoID4gMCkge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IGJsb2NrQ29uZmlnO1xuICB9XG5cbiAgcmV0dXJuIGltcG9ydENvbmZpZztcbn07XG5cbi8qKlxuICogTG9hZCBjb25maWd1cmF0aW9uIGZyb20gaGFuZG9mZi13cC5jb25maWcuanNvbiBpZiBpdCBleGlzdHNcbiAqL1xuY29uc3QgbG9hZENvbmZpZyA9ICgpOiBIYW5kb2ZmV3BDb25maWcgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpO1xuICAgICAgY29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjb25maWdDb250ZW50KSBhcyBIYW5kb2ZmV3BDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ThCBMb2FkZWQgY29uZmlnIGZyb20gJHtjb25maWdQYXRofWApO1xuICAgICAgcmV0dXJuIGNvbmZpZztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZhaWxlZCB0byBwYXJzZSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4ge307XG59O1xuXG4vKipcbiAqIE1lcmdlIGNvbmZpZ3VyYXRpb24gc291cmNlcyB3aXRoIHByaW9yaXR5OiBDTEkgPiBjb25maWcgZmlsZSA+IGRlZmF1bHRzXG4gKi9cbmNvbnN0IGdldENvbmZpZyA9ICgpOiBSZXNvbHZlZENvbmZpZyA9PiB7XG4gIGNvbnN0IGZpbGVDb25maWcgPSBsb2FkQ29uZmlnKCk7XG5cbiAgbGV0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnO1xuICBpZiAoZmlsZUNvbmZpZy5pbXBvcnQpIHtcbiAgICBpbXBvcnRDb25maWcgPSBmaWxlQ29uZmlnLmltcG9ydDtcbiAgfSBlbHNlIGlmIChmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpIHtcbiAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgXCJkeW5hbWljQXJyYXlzXCIgY29uZmlnIGlzIGRlcHJlY2F0ZWQuIE1pZ3JhdGUgdG8gXCJpbXBvcnRcIiDigJQgc2VlIFNQRUNJRklDQVRJT04ubWQuYCk7XG4gICAgaW1wb3J0Q29uZmlnID0gbWlncmF0ZUR5bmFtaWNBcnJheXMoZmlsZUNvbmZpZy5keW5hbWljQXJyYXlzKTtcbiAgfSBlbHNlIHtcbiAgICBpbXBvcnRDb25maWcgPSBERUZBVUxUX0NPTkZJRy5pbXBvcnQ7XG4gIH1cbiAgXG4gIHJldHVybiB7XG4gICAgYXBpVXJsOiBmaWxlQ29uZmlnLmFwaVVybCA/PyBERUZBVUxUX0NPTkZJRy5hcGlVcmwsXG4gICAgb3V0cHV0OiBmaWxlQ29uZmlnLm91dHB1dCA/PyBERUZBVUxUX0NPTkZJRy5vdXRwdXQsXG4gICAgdGhlbWVEaXI6IGZpbGVDb25maWcudGhlbWVEaXIgPz8gREVGQVVMVF9DT05GSUcudGhlbWVEaXIsXG4gICAgdXNlcm5hbWU6IGZpbGVDb25maWcudXNlcm5hbWUgPz8gREVGQVVMVF9DT05GSUcudXNlcm5hbWUsXG4gICAgcGFzc3dvcmQ6IGZpbGVDb25maWcucGFzc3dvcmQgPz8gREVGQVVMVF9DT05GSUcucGFzc3dvcmQsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gICAgZ3JvdXBzOiBmaWxlQ29uZmlnLmdyb3VwcyA/PyBERUZBVUxUX0NPTkZJRy5ncm91cHMsXG4gICAgc2NoZW1hTWlncmF0aW9uczogZmlsZUNvbmZpZy5zY2hlbWFNaWdyYXRpb25zLFxuICB9O1xufTtcblxuXG4vKipcbiAqIEJ1aWxkIEhUVFAgcmVxdWVzdCBvcHRpb25zIHdpdGggb3B0aW9uYWwgYmFzaWMgYXV0aFxuICovXG5jb25zdCBidWlsZFJlcXVlc3RPcHRpb25zID0gKHVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogaHR0cC5SZXF1ZXN0T3B0aW9ucyB8IGh0dHBzLlJlcXVlc3RPcHRpb25zID0+IHtcbiAgY29uc3QgcGFyc2VkVXJsID0gbmV3IFVSTCh1cmwpO1xuICBjb25zdCBvcHRpb25zOiBodHRwLlJlcXVlc3RPcHRpb25zID0ge1xuICAgIGhvc3RuYW1lOiBwYXJzZWRVcmwuaG9zdG5hbWUsXG4gICAgcG9ydDogcGFyc2VkVXJsLnBvcnQgfHwgKHBhcnNlZFVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyA0NDMgOiA4MCksXG4gICAgcGF0aDogcGFyc2VkVXJsLnBhdGhuYW1lICsgcGFyc2VkVXJsLnNlYXJjaCxcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIGhlYWRlcnM6IHt9LFxuICB9O1xuICBcbiAgaWYgKGF1dGg/LnVzZXJuYW1lICYmIGF1dGg/LnBhc3N3b3JkKSB7XG4gICAgY29uc3QgY3JlZGVudGlhbHMgPSBCdWZmZXIuZnJvbShgJHthdXRoLnVzZXJuYW1lfToke2F1dGgucGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIG9wdGlvbnMuaGVhZGVycyA9IHtcbiAgICAgIC4uLm9wdGlvbnMuaGVhZGVycyxcbiAgICAgICdBdXRob3JpemF0aW9uJzogYEJhc2ljICR7Y3JlZGVudGlhbHN9YCxcbiAgICB9O1xuICB9XG4gIFxuICByZXR1cm4gb3B0aW9ucztcbn07XG5cbi8vIExvYWQgY29uZmlnIGF0IHN0YXJ0dXBcbmNvbnN0IGNvbmZpZyA9IGdldENvbmZpZygpO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVCbG9ja0pzb24sXG4gIGdlbmVyYXRlSW5kZXhKcyxcbiAgZ2VuZXJhdGVSZW5kZXJQaHAsXG4gIGdlbmVyYXRlRWRpdG9yU2NzcyxcbiAgZ2VuZXJhdGVTdHlsZVNjc3MsXG4gIGdlbmVyYXRlUmVhZG1lLFxuICB0b0Jsb2NrTmFtZSxcbiAgZ2VuZXJhdGVIZWFkZXJQaHAsXG4gIGdlbmVyYXRlRm9vdGVyUGhwLFxuICBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocCxcbiAgZ2VuZXJhdGVDYXRlZ29yaWVzUGhwLFxuICBnZW5lcmF0ZVNoYXJlZENvbXBvbmVudHMsXG4gIGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hLFxuICBnZW5lcmF0ZU1lcmdlZEJsb2NrLFxuICBnZW5lcmF0ZURlcHJlY2F0aW9ucyxcbiAgZ2VuZXJhdGVTY2hlbWFDaGFuZ2Vsb2csXG59IGZyb20gJy4vZ2VuZXJhdG9ycyc7XG5pbXBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB7XG4gIGxvYWRNYW5pZmVzdCxcbiAgc2F2ZU1hbmlmZXN0LFxuICB2YWxpZGF0ZUNvbXBvbmVudCxcbiAgdXBkYXRlTWFuaWZlc3QsXG4gIGdldENvbXBvbmVudEhpc3RvcnksXG4gIGV4dHJhY3RQcm9wZXJ0aWVzLFxuICBmb3JtYXRWYWxpZGF0aW9uUmVzdWx0LFxuICBWYWxpZGF0aW9uUmVzdWx0LFxuICB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzLFxuICBmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHRcbn0gZnJvbSAnLi92YWxpZGF0b3JzJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hSGlzdG9yeSB9IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5cbi8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUHJldHRpZXIgKHVzaW5nIHJlcXVpcmUgZm9yIGNvbXBhdGliaWxpdHkpXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuY29uc3QgcGhwUGx1Z2luID0gcmVxdWlyZSgnQHByZXR0aWVyL3BsdWdpbi1waHAnKTtcblxuLyoqXG4gKiBGb3JtYXQgY29kZSB3aXRoIFByZXR0aWVyXG4gKi9cbmNvbnN0IGZvcm1hdENvZGUgPSBhc3luYyAoY29kZTogc3RyaW5nLCBwYXJzZXI6ICdiYWJlbCcgfCAnanNvbicgfCAnc2NzcycgfCAncGhwJyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3B0aW9uczogcHJldHRpZXIuT3B0aW9ucyA9IHtcbiAgICAgIHBhcnNlcixcbiAgICAgIHNpbmdsZVF1b3RlOiB0cnVlLFxuICAgICAgdGFiV2lkdGg6IDIsXG4gICAgICBwcmludFdpZHRoOiAxMDAsXG4gICAgICB0cmFpbGluZ0NvbW1hOiAnZXM1JyxcbiAgICB9O1xuICAgIFxuICAgIC8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUEhQIGZpbGVzXG4gICAgaWYgKHBhcnNlciA9PT0gJ3BocCcpIHtcbiAgICAgIG9wdGlvbnMucGx1Z2lucyA9IFtwaHBQbHVnaW5dO1xuICAgICAgLy8gUEhQLXNwZWNpZmljIG9wdGlvbnMgLSBjYXN0IHRvIGFueSBmb3IgcGx1Z2luLXNwZWNpZmljIG9wdGlvbnNcbiAgICAgIChvcHRpb25zIGFzIGFueSkucGhwVmVyc2lvbiA9ICc4LjAnO1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5icmFjZVN0eWxlID0gJzF0YnMnO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYXdhaXQgcHJldHRpZXIuZm9ybWF0KGNvZGUsIG9wdGlvbnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIGZvcm1hdHRpbmcgZmFpbHMsIHJldHVybiBvcmlnaW5hbCBjb2RlXG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFByZXR0aWVyIGZvcm1hdHRpbmcgZmFpbGVkIGZvciAke3BhcnNlcn0sIHVzaW5nIHVuZm9ybWF0dGVkIGNvZGVgKTtcbiAgICByZXR1cm4gY29kZTtcbiAgfVxufTtcblxuY29uc3QgcHJvZ3JhbSA9IG5ldyBDb21tYW5kKCk7XG5cbi8qKlxuICogRG93bmxvYWQgYSBmaWxlIGZyb20gYSBVUkwgYW5kIHNhdmUgaXQgdG8gZGlza1xuICovXG5jb25zdCBkb3dubG9hZEZpbGUgPSBhc3luYyAodXJsOiBzdHJpbmcsIGRlc3RQYXRoOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICAvLyBIYW5kbGUgcmVkaXJlY3RzXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDMwMSB8fCByZXMuc3RhdHVzQ29kZSA9PT0gMzAyKSB7XG4gICAgICAgIGNvbnN0IHJlZGlyZWN0VXJsID0gcmVzLmhlYWRlcnMubG9jYXRpb247XG4gICAgICAgIGlmIChyZWRpcmVjdFVybCkge1xuICAgICAgICAgIGRvd25sb2FkRmlsZShyZWRpcmVjdFVybCwgZGVzdFBhdGgsIGF1dGgpLnRoZW4ocmVzb2x2ZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gZG93bmxvYWQgc2NyZWVuc2hvdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBmaWxlU3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oZGVzdFBhdGgpO1xuICAgICAgcmVzLnBpcGUoZmlsZVN0cmVhbSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsICgpID0+IHtcbiAgICAgICAgZmlsZVN0cmVhbS5jbG9zZSgpO1xuICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICBmcy51bmxpbmsoZGVzdFBhdGgsICgpID0+IHt9KTsgLy8gQ2xlYW4gdXAgcGFydGlhbCBmaWxlXG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gc2F2ZSBzY3JlZW5zaG90OiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBjb21wb25lbnQgZGF0YSBmcm9tIEhhbmRvZmYgQVBJXG4gKi9cbmNvbnN0IGZldGNoQ29tcG9uZW50ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnQ+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50LyR7Y29tcG9uZW50TmFtZX0uanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50IEpTT046ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbGwgYmxvY2sgZmlsZXMgZnJvbSBhIGNvbXBvbmVudFxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gYXBpVXJsIC0gVGhlIGJhc2UgQVBJIFVSTCBmb3IgZmV0Y2hpbmcgc2NyZWVuc2hvdHNcbiAqIEBwYXJhbSByZXNvbHZlZENvbmZpZyAtIFRoZSByZXNvbHZlZCBjb25maWd1cmF0aW9uIGluY2x1ZGluZyBkeW5hbWljIGFycmF5IHNldHRpbmdzXG4gKi9cbmNvbnN0IGdlbmVyYXRlQmxvY2sgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCBhcGlVcmw6IHN0cmluZywgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnLCBzY2hlbWFIaXN0b3J5PzogU2NoZW1hSGlzdG9yeSk6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgaGFzU2NyZWVuc2hvdCA9ICEhY29tcG9uZW50LmltYWdlO1xuICBcbiAgLy8gQ29uc3RydWN0IGZ1bGwgc2NyZWVuc2hvdCBVUkwgaWYgaW1hZ2UgcGF0aCBpcyBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3RVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgaWYgKGNvbXBvbmVudC5pbWFnZSkge1xuICAgIC8vIEhhbmRsZSBib3RoIGFic29sdXRlIFVSTHMgYW5kIHJlbGF0aXZlIHBhdGhzXG4gICAgaWYgKGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwOi8vJykgfHwgY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBjb21wb25lbnQuaW1hZ2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlbGF0aXZlIHBhdGggLSBwcmVwZW5kIEFQSSBVUkxcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBgJHthcGlVcmx9JHtjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wb25lbnQuaW1hZ2V9YDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciB0aGlzIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnXG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KVxuICB9O1xuICBcbiAgLy8gQXV0by1kZXRlY3QgcGFnaW5hdGlvbiBmb3IgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZW50cmllcyBvbmx5XG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggcmljaHRleHQgZmllbGQgKGlmIGFueSkgdXNlcyBJbm5lckJsb2Nrc1xuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIC8vIENoZWNrIGV4cGxpY2l0IGNvbmZpZyBvdmVycmlkZXMgZmlyc3RcbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cbiAgXG4gIGNvbnN0IGhpc3RvcnlFbnRyeSA9IHNjaGVtYUhpc3RvcnkgPyBnZXRDb21wb25lbnRIaXN0b3J5KHNjaGVtYUhpc3RvcnksIGNvbXBvbmVudC5pZCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGN1cnJlbnRQcm9wcyA9IGV4dHJhY3RQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgY29uc3QgbWlncmF0aW9uT3ZlcnJpZGVzID0gcmVzb2x2ZWRDb25maWcuc2NoZW1hTWlncmF0aW9ucz8uW2NvbXBvbmVudC5pZF07XG4gIGNvbnN0IGRlcHJlY2F0aW9uc0NvZGUgPSBnZW5lcmF0ZURlcHJlY2F0aW9ucyhcbiAgICBoaXN0b3J5RW50cnksXG4gICAgY3VycmVudFByb3BzLFxuICAgIG1pZ3JhdGlvbk92ZXJyaWRlcyxcbiAgICAhIWlubmVyQmxvY2tzRmllbGRcbiAgKTtcblxuICByZXR1cm4ge1xuICAgIGJsb2NrSnNvbjogZ2VuZXJhdGVCbG9ja0pzb24oY29tcG9uZW50LCBoYXNTY3JlZW5zaG90LCBhcGlVcmwsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQpLFxuICAgIGluZGV4SnM6IGdlbmVyYXRlSW5kZXhKcyhjb21wb25lbnQsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQsIGRlcHJlY2F0aW9uc0NvZGUpLFxuICAgIHJlbmRlclBocDogZ2VuZXJhdGVSZW5kZXJQaHAoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBlZGl0b3JTY3NzOiBnZW5lcmF0ZUVkaXRvclNjc3MoY29tcG9uZW50KSxcbiAgICBzdHlsZVNjc3M6IGdlbmVyYXRlU3R5bGVTY3NzKGNvbXBvbmVudCksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZVJlYWRtZShjb21wb25lbnQpLFxuICAgIG1pZ3JhdGlvblNjaGVtYTogZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEoY29tcG9uZW50KSxcbiAgICBzY2hlbWFDaGFuZ2Vsb2c6IGdlbmVyYXRlU2NoZW1hQ2hhbmdlbG9nKGNvbXBvbmVudC5pZCwgaGlzdG9yeUVudHJ5KSxcbiAgICBzY3JlZW5zaG90VXJsXG4gIH07XG59O1xuXG4vKipcbiAqIFdyaXRlIGJsb2NrIGZpbGVzIHRvIG91dHB1dCBkaXJlY3RvcnlcbiAqL1xuY29uc3Qgd3JpdGVCbG9ja0ZpbGVzID0gYXN5bmMgKG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnRJZDogc3RyaW5nLCBibG9jazogR2VuZXJhdGVkQmxvY2ssIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50SWQpO1xuICBjb25zdCBibG9ja0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGJsb2NrTmFtZSk7XG4gIFxuICAvLyBDcmVhdGUgYmxvY2sgZGlyZWN0b3J5XG4gIGlmICghZnMuZXhpc3RzU3luYyhibG9ja0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoYmxvY2tEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIFxuICAvLyBGb3JtYXQgYWxsIGNvZGUgZmlsZXMgd2l0aCBQcmV0dGllclxuICBjb25zdCBmb3JtYXR0ZWRCbG9ja0pzb24gPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmJsb2NrSnNvbiwgJ2pzb24nKTtcbiAgY29uc3QgZm9ybWF0dGVkSW5kZXhKcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suaW5kZXhKcywgJ2JhYmVsJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEVkaXRvclNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmVkaXRvclNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFN0eWxlU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suc3R5bGVTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBcbiAgLy8gV3JpdGUgZmlsZXNcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdSRUFETUUubWQnKSwgYmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgYmxvY2subWlncmF0aW9uU2NoZW1hKTtcbiAgaWYgKGJsb2NrLnNjaGVtYUNoYW5nZWxvZykge1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnc2NoZW1hLWNoYW5nZWxvZy5qc29uJyksIGJsb2NrLnNjaGVtYUNoYW5nZWxvZyk7XG4gIH1cbiAgXG4gIC8vIERvd25sb2FkIHNjcmVlbnNob3QgaWYgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90RG93bmxvYWRlZCA9IGZhbHNlO1xuICBpZiAoYmxvY2suc2NyZWVuc2hvdFVybCkge1xuICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoID0gcGF0aC5qb2luKGJsb2NrRGlyLCAnc2NyZWVuc2hvdC5wbmcnKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TtyBEb3dubG9hZGluZyBzY3JlZW5zaG90Li4uYCk7XG4gICAgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoYmxvY2suc2NyZWVuc2hvdFVybCwgc2NyZWVuc2hvdFBhdGgsIGF1dGgpO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBibG9jazogJHtibG9ja05hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OBICR7YmxvY2tEaXJ9YCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGJsb2NrLmpzb25gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgaW5kZXguanNgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgcmVuZGVyLnBocGApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBlZGl0b3Iuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBzdHlsZS5zY3NzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIFJFQURNRS5tZGApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBtaWdyYXRpb24tc2NoZW1hLmpzb25gKTtcbiAgaWYgKHNjcmVlbnNob3REb3dubG9hZGVkKSB7XG4gICAgY29uc29sZS5sb2coYCAgIPCflrzvuI8gIHNjcmVlbnNob3QucG5nYCk7XG4gIH1cbn07XG5cbi8qKlxuICogTWFpbiBjb21waWxhdGlvbiBmdW5jdGlvblxuICovXG5jb25zdCBjb21waWxlID0gYXN5bmMgKG9wdGlvbnM6IENvbXBpbGVyT3B0aW9ucyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UpyBHdXRlbmJlcmcgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtvcHRpb25zLmFwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudDogJHtvcHRpb25zLmNvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3B0aW9ucy5vdXRwdXREaXJ9YCk7XG4gIGlmIChvcHRpb25zLmF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7b3B0aW9ucy5hdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gRmV0Y2ggY29tcG9uZW50IGZyb20gQVBJXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGRhdGEuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChvcHRpb25zLmFwaVVybCwgb3B0aW9ucy5jb21wb25lbnROYW1lLCBvcHRpb25zLmF1dGgpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9ICgke2NvbXBvbmVudC5pZH0pXFxuYCk7XG4gICAgXG4gICAgLy8gVmFsaWRhdGUgdGVtcGxhdGUgdmFyaWFibGVzIGJlZm9yZSBnZW5lcmF0aW5nXG4gICAgY29uc29sZS5sb2coYPCflI0gVmFsaWRhdGluZyB0ZW1wbGF0ZSB2YXJpYWJsZXMuLi5gKTtcbiAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgY29uc29sZS5sb2coZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0KHRlbXBsYXRlVmFsaWRhdGlvbikpO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICBcbiAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgVGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQhIEZpeCB0aGUgdW5kZWZpbmVkIHZhcmlhYmxlcyBiZWZvcmUgY29tcGlsaW5nLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBibG9jayBmaWxlcyAod2l0aCBkZXByZWNhdGlvbiBzdXBwb3J0IGZyb20gc2NoZW1hIGhpc3RvcnkpXG4gICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBHdXRlbmJlcmcgYmxvY2suLi5gKTtcbiAgICBjb25zdCBzY2hlbWFIaXN0b3J5ID0gbG9hZE1hbmlmZXN0KG9wdGlvbnMub3V0cHV0RGlyKTtcbiAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBvcHRpb25zLmFwaVVybCwgY29uZmlnLCBzY2hlbWFIaXN0b3J5KTtcbiAgICBcbiAgICAvLyBXcml0ZSBmaWxlcyAod2l0aCBQcmV0dGllciBmb3JtYXR0aW5nKVxuICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvcHRpb25zLm91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgb3B0aW9ucy5hdXRoKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIERvbmUhIERvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2hlY2sgd2hldGhlciBhIGNvbXBvbmVudCBzaG91bGQgYmUgaW1wb3J0ZWQgYmFzZWQgb24gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IHNob3VsZEltcG9ydENvbXBvbmVudCA9IChjb21wb25lbnRJZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnKTogYm9vbGVhbiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG5cbiAgLy8gVHlwZSBub3QgbGlzdGVkIGluIGltcG9ydCBjb25maWcg4oCUIGRlZmF1bHQgdG8gdHJ1ZSAoaW1wb3J0KVxuICBpZiAodHlwZUNvbmZpZyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgLy8gRW50aXJlIHR5cGUgZGlzYWJsZWRcbiAgaWYgKHR5cGVDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEVudGlyZSB0eXBlIGVuYWJsZWQgd2l0aCBubyBwZXItY29tcG9uZW50IG92ZXJyaWRlc1xuICBpZiAodHlwZUNvbmZpZyA9PT0gdHJ1ZSkgcmV0dXJuIHRydWU7XG5cbiAgLy8gUGVyLWNvbXBvbmVudCBsb29rdXAgd2l0aGluIHRoZSB0eXBlIG9iamVjdFxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgLy8gTm90IGxpc3RlZCDigJQgaW1wb3J0IHdpdGggZGVmYXVsdHMgKHR5cGUtb2JqZWN0IG1lYW5zIFwiaW1wb3J0IGFsbCwgb3ZlcnJpZGUgbGlzdGVkXCIpXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEV4cGxpY2l0bHkgZGlzYWJsZWRcbiAgaWYgKGNvbXBvbmVudENvbmZpZyA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgLy8gRXhwbGljaXRseSBlbmFibGVkIG9yIGhhcyBmaWVsZCBvdmVycmlkZXNcbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgcmF3IHBlci1maWVsZCBjb25maWcgb2JqZWN0IGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEZpZWxkUHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3QgdHlwZUNvbmZpZyA9IGltcG9ydENvbmZpZ1tjb21wb25lbnRUeXBlXTtcbiAgaWYgKCF0eXBlQ29uZmlnIHx8IHR5cGVvZiB0eXBlQ29uZmlnID09PSAnYm9vbGVhbicpIHJldHVybiB7fTtcblxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgaWYgKCFjb21wb25lbnRDb25maWcgfHwgdHlwZW9mIGNvbXBvbmVudENvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgcmV0dXJuIGNvbXBvbmVudENvbmZpZyBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPjtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBkeW5hbWljIGFycmF5IGNvbmZpZ3MgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYWxsQ29uZmlncykpIHtcbiAgICBpZiAoaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZmllbGQgcHJlZmVyZW5jZXMgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IGFsbENvbmZpZ3MgPSBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MoY29tcG9uZW50SWQsIGNvbXBvbmVudFR5cGUsIGltcG9ydENvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKCFpc0R5bmFtaWNBcnJheUNvbmZpZyhjb25maWcpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IGNvbmZpZztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRmV0Y2ggbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSwgZmlsdGVyZWQgYnkgaW1wb3J0IGNvbmZpZ1xuICovXG5jb25zdCBmZXRjaENvbXBvbmVudExpc3QgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnRzLmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEFycmF5PEhhbmRvZmZDb21wb25lbnQ+O1xuICAgICAgICAgIGNvbnN0IGZpbHRlcmVkID0gY29tcG9uZW50cy5maWx0ZXIoYyA9PiBzaG91bGRJbXBvcnRDb21wb25lbnQoYy5pZCwgYy50eXBlLCBpbXBvcnRDb25maWcpKTtcbiAgICAgICAgICByZXNvbHZlKGZpbHRlcmVkLm1hcChjID0+IGMuaWQpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggZnVsbCBsaXN0IG9mIGFsbCBjb21wb25lbnRzIGZyb20gQVBJIChubyBpbXBvcnQgZmlsdGVyKS4gVXNlZCB0byByZXNvbHZlIGdyb3VwIG5hbWVzLlxuICovXG5jb25zdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50W10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudHMpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSkpO1xuICB9KTtcbn07XG5cbi8qKlxuICogQ29tcGlsZSBhbGwgY29tcG9uZW50c1xuICovXG4vKipcbiAqIEJ1aWxkIFZhcmlhbnRJbmZvIGZvciBhIGNvbXBvbmVudCAocmVzb2x2ZXMgZHluYW1pYyBhcnJheXMsIElubmVyQmxvY2tzIGZpZWxkLCBldGMuKVxuICovXG5jb25zdCBidWlsZFZhcmlhbnRJbmZvID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnKTogVmFyaWFudEluZm8gPT4ge1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCksXG4gIH07XG5cbiAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudER5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCdhcnJheVR5cGUnIGluIGR5bkNvbmZpZykgY29udGludWU7IC8vIFNraXAgc3BlY2lhbGlzZWQgYXJyYXkgdHlwZXNcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICBpZiAocHJvcD8udHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24/LnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgY29uc3QgcGFnaW5hdGlvbkZpZWxkUmVnZXggPSBuZXcgUmVnRXhwKFxuICAgICAgICBgXFxcXHtcXFxce1xcXFxzKiNmaWVsZFxcXFxzK1tcIiddJHtmaWVsZE5hbWV9XFxcXC5wYWdpbmF0aW9uW1wiJ11gXG4gICAgICApO1xuICAgICAgaWYgKHBhZ2luYXRpb25GaWVsZFJlZ2V4LnRlc3QoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgICAgIChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uID0geyBwcm9wZXJ0eU5hbWU6ICdwYWdpbmF0aW9uJyB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZpZWxkUHJlZnMgPSBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpO1xuICBjb25zdCByaWNodGV4dEZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbXBvbmVudCxcbiAgICBmaWVsZE1hcDoge30sXG4gICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICBkeW5hbWljQXJyYXlDb25maWdzOiBjb21wb25lbnREeW5hbWljQXJyYXlzLFxuICB9O1xufTtcblxuLyoqXG4gKiBDb21waWxlIGEgc2luZ2xlIG1lcmdlZCBncm91cCAoZS5nLiBIZXJvIHdpdGggbXVsdGlwbGUgdmFyaWFudHMpLiBVc2VkIGJ5IHNpbmdsZS1uYW1lIENMSSB3aGVuIG5hbWUgbWF0Y2hlcyBhIGdyb3VwLlxuICovXG5jb25zdCBjb21waWxlR3JvdXAgPSBhc3luYyAoXG4gIGFwaVVybDogc3RyaW5nLFxuICBvdXRwdXREaXI6IHN0cmluZyxcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdLFxuICBhdXRoPzogQXV0aENyZWRlbnRpYWxzLFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SAIEdlbmVyYXRpbmcgbWVyZ2VkIGdyb3VwIGJsb2NrOiAke2dyb3VwU2x1Z30gKCR7Z3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpYCk7XG4gIGNvbnN0IHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSA9IGdyb3VwQ29tcG9uZW50cy5tYXAoKGMpID0+IGJ1aWxkVmFyaWFudEluZm8oYywgY29uZmlnKSk7XG4gIGNvbnN0IG1lcmdlZEJsb2NrID0gZ2VuZXJhdGVNZXJnZWRCbG9jayhncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50cywgdmFyaWFudEluZm9zLCBhcGlVcmwpO1xuICBjb25zdCBncm91cEJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcbiAgY29uc3QgZ3JvdXBEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBncm91cEJsb2NrTmFtZSk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhncm91cERpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoZ3JvdXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcblxuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2Jsb2NrLmpzb24nKSwgZm9ybWF0dGVkQmxvY2tKc29uKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdpbmRleC5qcycpLCBmb3JtYXR0ZWRJbmRleEpzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdyZW5kZXIucGhwJyksIGZvcm1hdHRlZFJlbmRlclBocCk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnZWRpdG9yLnNjc3MnKSwgZm9ybWF0dGVkRWRpdG9yU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnc3R5bGUuc2NzcycpLCBmb3JtYXR0ZWRTdHlsZVNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ1JFQURNRS5tZCcpLCBtZXJnZWRCbG9jay5yZWFkbWUpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ21pZ3JhdGlvbi1zY2hlbWEuanNvbicpLCBtZXJnZWRCbG9jay5taWdyYXRpb25TY2hlbWEpO1xuXG4gIGlmIChtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcykge1xuICAgIGNvbnN0IHZhcmlhdGlvbnNEaXIgPSBwYXRoLmpvaW4oZ3JvdXBEaXIsICd2YXJpYXRpb25zJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHZhcmlhdGlvbnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmModmFyaWF0aW9uc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMuanMpKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdiYWJlbCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5qc2ApLCBmb3JtYXR0ZWQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLnBocCkpIHtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ3BocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5waHBgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gIH1cblxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBtZXJnZWQgYmxvY2s6ICR7Z3JvdXBCbG9ja05hbWV9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2dyb3VwRGlyfWApO1xuXG4gIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGdyb3VwQ29tcG9uZW50cyk7XG4gIGNvbnN0IGZvcm1hdHRlZENhdGVnb3JpZXNQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGNhdGVnb3JpZXNQaHAsICdwaHAnKTtcbiAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGluY2x1ZGVzRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgY29uc3QgY2F0ZWdvcmllc1BhdGggPSBwYXRoLmpvaW4oaW5jbHVkZXNEaXIsICdoYW5kb2ZmLWNhdGVnb3JpZXMucGhwJyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCAke2NhdGVnb3JpZXNQYXRofWApO1xufTtcblxuY29uc3QgY29tcGlsZUFsbCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyIC0gQmF0Y2ggTW9kZWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChhdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2F1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuXG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIGxldCBzdWNjZXNzID0gMDtcbiAgICBsZXQgZmFpbGVkID0gMDtcbiAgICBjb25zdCBjb21waWxlZENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGNvbnN0IHNjaGVtYUhpc3RvcnkgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgICBcbiAgICAvLyBGZXRjaCBhbGwgY29tcG9uZW50cyBmaXJzdCBzbyB3ZSBjYW4gcGFydGl0aW9uIGJ5IGdyb3VwXG4gICAgY29uc3QgYWxsQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50SWQsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoY29tcG9uZW50KTtcbiAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICDimqDvuI8gIFNraXBwaW5nICR7Y29tcG9uZW50SWR9IGR1ZSB0byB0ZW1wbGF0ZSB2YXJpYWJsZSBlcnJvcnNgKTtcbiAgICAgICAgICBmYWlsZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFsbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBmZXRjaCAke2NvbXBvbmVudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQrKztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQYXJ0aXRpb24gY29tcG9uZW50czogbWVyZ2VkIGdyb3VwcyB2cyBpbmRpdmlkdWFsXG4gICAgLy8gQnVpbGQgY2FzZS1pbnNlbnNpdGl2ZSBsb29rdXA6IGNvbmZpZyBtYXkgc2F5IFwiSGVyb1wiIGJ1dCBBUEkgb2Z0ZW4gcmV0dXJucyBcImhlcm9cIlxuICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgIH1cbiAgICBjb25zdCBncm91cEJ1Y2tldHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZDb21wb25lbnRbXT4gPSB7fTtcbiAgICBjb25zdCBpbmRpdmlkdWFsQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBhbGxDb21wb25lbnRzKSB7XG4gICAgICBjb25zdCBncm91cCA9IGNvbXBvbmVudC5ncm91cDtcbiAgICAgIGlmICghZ3JvdXApIHtcbiAgICAgICAgaW5kaXZpZHVhbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNvbmZpZ0tleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICBpZiAoY29uZmlnS2V5KSB7XG4gICAgICAgIGlmICghZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0pIGdyb3VwQnVja2V0c1tjb25maWdLZXldID0gW107XG4gICAgICAgIGdyb3VwQnVja2V0c1tjb25maWdLZXldLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb21waWxlIGluZGl2aWR1YWwgY29tcG9uZW50cyAoZXhpc3RpbmcgYmVoYXZpb3IpXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgaW5kaXZpZHVhbENvbXBvbmVudHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGJsb2NrID0gZ2VuZXJhdGVCbG9jayhjb21wb25lbnQsIGFwaVVybCwgY29uZmlnLCBzY2hlbWFIaXN0b3J5KTtcbiAgICAgICAgYXdhaXQgd3JpdGVCbG9ja0ZpbGVzKG91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgYXV0aCk7XG4gICAgICAgIGNvbXBpbGVkQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgIHN1Y2Nlc3MrKztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gY29tcGlsZSAke2NvbXBvbmVudC5pZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBtZXJnZWQgZ3JvdXBzXG4gICAgZm9yIChjb25zdCBbZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHNdIG9mIE9iamVjdC5lbnRyaWVzKGdyb3VwQnVja2V0cykpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChhcGlVcmwsIG91dHB1dERpciwgZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHMsIGF1dGgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaCguLi5ncm91cENvbXBvbmVudHMpO1xuICAgICAgICBzdWNjZXNzICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgbWVyZ2VkIGdyb3VwICR7Z3JvdXBTbHVnfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQgKz0gZ3JvdXBDb21wb25lbnRzLmxlbmd0aDtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgY2F0ZWdvcmllcyBQSFAgZmlsZSBiYXNlZCBvbiBhbGwgY29tcGlsZWQgY29tcG9uZW50c1xuICAgIGlmIChjb21waWxlZENvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgR2VuZXJhdGluZyBibG9jayBjYXRlZ29yaWVzLi4uYCk7XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGNvbXBpbGVkQ29tcG9uZW50cyk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICAgICAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICAgICAgZnMubWtkaXJTeW5jKGluY2x1ZGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhjYXRlZ29yaWVzUGF0aCwgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtjYXRlZ29yaWVzUGF0aH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgc2hhcmVkIGNvbXBvbmVudHMgaWYgYW55IGNvbXBvbmVudCBoYXMgZHluYW1pYyBhcnJheSBjb25maWdzXG4gICAgY29uc3QgaGFzRHluYW1pY0FycmF5c0luSW1wb3J0ID0gT2JqZWN0LnZhbHVlcyhjb25maWcuaW1wb3J0KS5zb21lKHR5cGVDb25maWcgPT4ge1xuICAgICAgaWYgKHR5cGVvZiB0eXBlQ29uZmlnICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXModHlwZUNvbmZpZykuc29tZShjb21wQ29uZmlnID0+XG4gICAgICAgIHR5cGVvZiBjb21wQ29uZmlnID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhjb21wQ29uZmlnKS5sZW5ndGggPiAwXG4gICAgICApO1xuICAgIH0pO1xuICAgIGlmIChoYXNEeW5hbWljQXJyYXlzSW5JbXBvcnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIEdlbmVyYXRpbmcgc2hhcmVkIGNvbXBvbmVudHMuLi5gKTtcbiAgICAgIGNvbnN0IHNoYXJlZENvbXBvbmVudHMgPSBnZW5lcmF0ZVNoYXJlZENvbXBvbmVudHMoKTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBbcmVsYXRpdmVQYXRoLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhzaGFyZWRDb21wb25lbnRzKSkge1xuICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICcuLicsIHJlbGF0aXZlUGF0aCk7XG4gICAgICAgIGNvbnN0IGRpclBhdGggPSBwYXRoLmRpcm5hbWUoZnVsbFBhdGgpO1xuICAgICAgICBcbiAgICAgICAgLy8gRW5zdXJlIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGRpclBhdGgpKSB7XG4gICAgICAgICAgZnMubWtkaXJTeW5jKGRpclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBGb3JtYXQgYW5kIHdyaXRlIHRoZSBmaWxlXG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZENvbnRlbnQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdiYWJlbCcpO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZ1bGxQYXRoLCBmb3JtYXR0ZWRDb250ZW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIPCfk4QgJHtyZWxhdGl2ZVBhdGh9YCk7XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFNoYXJlZCBjb21wb25lbnRzIGdlbmVyYXRlZGApO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmNzcyBhbmQgbWFpbi5qcyBkZXNpZ24gc3lzdGVtIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OhIERvd25sb2FkaW5nIGRlc2lnbiBzeXN0ZW0gYXNzZXRzLi4uYCk7XG4gICAgY29uc3QgYXNzZXRzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJy4uJywgJ2Fzc2V0cycpO1xuICAgIGNvbnN0IGFzc2V0c0Nzc0RpciA9IHBhdGguam9pbihhc3NldHNEaXIsICdjc3MnKTtcbiAgICBjb25zdCBhc3NldHNKc0RpciA9IHBhdGguam9pbihhc3NldHNEaXIsICdqcycpO1xuXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFzc2V0c0Nzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhhc3NldHNDc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXNzZXRzSnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoYXNzZXRzSnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNzc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmNzc2A7XG4gICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihhc3NldHNDc3NEaXIsICdtYWluLmNzcycpO1xuICAgIGNvbnN0IGNzc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoY3NzVXJsLCBjc3NQYXRoLCBhdXRoKTtcbiAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvY3NzL21haW4uY3NzYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBqc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmpzYDtcbiAgICBjb25zdCBqc1BhdGggPSBwYXRoLmpvaW4oYXNzZXRzSnNEaXIsICdtYWluLmpzJyk7XG4gICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGpzVXJsLCBqc1BhdGgsIGF1dGgpO1xuICAgIGlmIChqc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2pzL21haW4uanNgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIENvbXBpbGF0aW9uIGNvbXBsZXRlIWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgU3VjY2VzczogJHtzdWNjZXNzfWApO1xuICAgIGlmIChmYWlsZWQgPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4p2MIEZhaWxlZDogJHtmYWlsZWR9YCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SAIE1lcmdlZCBncm91cHM6ICR7T2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGh9YCk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGBcXG5Eb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcilcbiAqL1xuY29uc3QgY29tcGlsZVRoZW1lID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+OqCBUaGVtZSBUZW1wbGF0ZSBDb21waWxlcmApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChhdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2F1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBDb21waWxlIGhlYWRlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGhlYWRlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCAnaGVhZGVyJywgYXV0aCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7aGVhZGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGhlYWRlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGhlYWRlclBocCA9IGdlbmVyYXRlSGVhZGVyUGhwKGhlYWRlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRIZWFkZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGhlYWRlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBoZWFkZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2hlYWRlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoaGVhZGVyUGF0aCwgZm9ybWF0dGVkSGVhZGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2hlYWRlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBIZWFkZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsZSBmb290ZXJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBmb290ZXIgY29tcG9uZW50Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZvb3RlciA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgJ2Zvb3RlcicsIGF1dGgpO1xuICAgICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2Zvb3Rlci50aXRsZX1cXG5gKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBmb290ZXIucGhwLi4uYCk7XG4gICAgICBjb25zdCBmb290ZXJQaHAgPSBnZW5lcmF0ZUZvb3RlclBocChmb290ZXIpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkRm9vdGVyID0gYXdhaXQgZm9ybWF0Q29kZShmb290ZXJQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgZm9vdGVyUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICdmb290ZXIucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGZvb3RlclBhdGgsIGZvcm1hdHRlZEZvb3Rlcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtmb290ZXJQYXRofVxcbmApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRm9vdGVyIGNvbXBvbmVudCBub3QgZm91bmQgb3IgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFsc28gdHJ5IGhlYWRlci1jb21wYWN0IGFuZCBmb290ZXItY29tcGFjdCBpZiB0aGV5IGV4aXN0XG4gICAgLy8gVGhlc2UgZ28gaW50byB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyBzdWJmb2xkZXJcbiAgICBjb25zdCBoYW5kb2ZmVGVtcGxhdGVzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ3RlbXBsYXRlLXBhcnRzJywgJ2hhbmRvZmYnKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaGFuZG9mZlRlbXBsYXRlc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZ2VuZXJhdGVkVGVtcGxhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgdmFyaWFudCBvZiBbJ2hlYWRlci1jb21wYWN0JywgJ2hlYWRlci1sYW5kZXInLCAnZm9vdGVyLWNvbXBhY3QnXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCB2YXJpYW50LCBhdXRoKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk6EgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfWApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgdGVtcGxhdGVUeXBlID0gdmFyaWFudC5yZXBsYWNlKC8tL2csICdfJyk7XG4gICAgICAgIGNvbnN0IGlzSGVhZGVyID0gdmFyaWFudC5zdGFydHNXaXRoKCdoZWFkZXInKTtcbiAgICAgICAgY29uc3QgcGhwID0gaXNIZWFkZXIgXG4gICAgICAgICAgPyBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocChjb21wb25lbnQsIHRlbXBsYXRlVHlwZSlcbiAgICAgICAgICA6IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKTtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVkUGhwID0gYXdhaXQgZm9ybWF0Q29kZShwaHAsICdwaHAnKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIGAke3ZhcmlhbnR9LnBocGApO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBmb3JtYXR0ZWRQaHApO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtmaWxlUGF0aH1cXG5gKTtcbiAgICAgICAgZ2VuZXJhdGVkVGVtcGxhdGVzLnB1c2goYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gVmFyaWFudCBkb2Vzbid0IGV4aXN0LCBza2lwIHNpbGVudGx5XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIFJFQURNRSBmb3IgdGhlIGhhbmRvZmYgdGVtcGxhdGVzIGZvbGRlclxuICAgIGlmIChnZW5lcmF0ZWRUZW1wbGF0ZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgcmVhZG1lQ29udGVudCA9IGAjIEhhbmRvZmYgVGVtcGxhdGUgUGFydHNcblxuPiDimqDvuI8gKipETyBOT1QgRURJVCBUSEVTRSBGSUxFUyBESVJFQ1RMWSoqXG4+XG4+IFRoZXNlIGZpbGVzIGFyZSBhdXRvbWF0aWNhbGx5IGdlbmVyYXRlZCBieSB0aGUgSGFuZG9mZiBXb3JkUHJlc3MgY29tcGlsZXIuXG4+IEFueSBjaGFuZ2VzIHdpbGwgYmUgb3ZlcndyaXR0ZW4gb24gdGhlIG5leHQgc3luYy5cblxuIyMgU291cmNlXG5cblRoZXNlIHRlbXBsYXRlcyB3ZXJlIHRyYW5zcGlsZWQgZnJvbSB0aGUgSGFuZG9mZiBkZXNpZ24gc3lzdGVtLlxuXG4tICoqQVBJIFVSTDoqKiAke2FwaVVybH1cbi0gKipHZW5lcmF0ZWQ6KiogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XG5cbiMjIEZpbGVzXG5cbiR7Z2VuZXJhdGVkVGVtcGxhdGVzLm1hcChmID0+IGAtIFxcYCR7Zn1cXGBgKS5qb2luKCdcXG4nKX1cblxuIyMgVXNhZ2VcblxuSW5jbHVkZSB0aGVzZSB0ZW1wbGF0ZSBwYXJ0cyBpbiB5b3VyIHRoZW1lIHVzaW5nOlxuXG5cXGBcXGBcXGBwaHBcbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2hlYWRlci1jb21wYWN0Jyk7ID8+XG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9mb290ZXItY29tcGFjdCcpOyA/PlxuXFxgXFxgXFxgXG5cbiMjIFJlZ2VuZXJhdGluZ1xuXG5UbyByZWdlbmVyYXRlIHRoZXNlIGZpbGVzLCBydW46XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWVcblxcYFxcYFxcYFxuXG5PciB3aXRoIGEgc3BlY2lmaWMgQVBJIFVSTDpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZSAtLWFwaS11cmwgJHthcGlVcmx9XG5cXGBcXGBcXGBcbmA7XG4gICAgICBjb25zdCByZWFkbWVQYXRoID0gcGF0aC5qb2luKGhhbmRvZmZUZW1wbGF0ZXNEaXIsICdSRUFETUUubWQnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVhZG1lUGF0aCwgcmVhZG1lQ29udGVudCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBHZW5lcmF0ZWQ6ICR7cmVhZG1lUGF0aH1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5jc3MgYW5kIG1haW4uanMgYXNzZXRzXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgdGhlbWUgYXNzZXRzLi4uYCk7XG4gICAgXG4gICAgLy8gRW5zdXJlIGFzc2V0cyBkaXJlY3RvcmllcyBleGlzdFxuICAgIGNvbnN0IGNzc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnY3NzJyk7XG4gICAgY29uc3QganNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2pzJyk7XG4gICAgXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGNzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhjc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoanNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoanNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmNzc1xuICAgIGNvbnN0IGNzc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmNzc2A7XG4gICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihjc3NEaXIsICdtYWluLmNzcycpO1xuICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmNzcy4uLmApO1xuICAgIGNvbnN0IGNzc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoY3NzVXJsLCBjc3NQYXRoLCBhdXRoKTtcbiAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkOiAke2Nzc1BhdGh9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5qc1xuICAgIGNvbnN0IGpzVXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgIGNvbnN0IGpzUGF0aCA9IHBhdGguam9pbihqc0RpciwgJ21haW4uanMnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRG93bmxvYWRpbmcgbWFpbi5qcy4uLmApO1xuICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShqc1VybCwganNQYXRoLCBhdXRoKTtcbiAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7anNQYXRofWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uanMgZnJvbSAke2pzVXJsfWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIFRoZW1lIHRlbXBsYXRlcyBnZW5lcmF0ZWQhXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlIGEgc2luZ2xlIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlc1xuICovXG5jb25zdCB2YWxpZGF0ZSA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudE5hbWU6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8VmFsaWRhdGlvblJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIENvbXBvbmVudDogJHtjb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE1hbmlmZXN0OiAke291dHB1dERpcn1cXG5gKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICBcbiAgLy8gTG9hZCBtYW5pZmVzdFxuICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICBcbiAgLy8gVmFsaWRhdGVcbiAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVDb21wb25lbnQoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gIFxuICAvLyBPdXRwdXQgcmVzdWx0XG4gIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlc1xuICovXG5jb25zdCB2YWxpZGF0ZUFsbCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SNIFZhbGlkYXRpbmcgQWxsIENvbXBvbmVudHNgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBsaXN0XG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBpbXBvcnRDb25maWcsIGF1dGgpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHNcXG5gKTtcbiAgICBcbiAgICAvLyBMb2FkIG1hbmlmZXN0XG4gICAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgICBcbiAgICBsZXQgdmFsaWQgPSAwO1xuICAgIGxldCBpbnZhbGlkID0gMDtcbiAgICBsZXQgbmV3Q29tcG9uZW50cyA9IDA7XG4gICAgY29uc3QgYnJlYWtpbmdDaGFuZ2VzOiBWYWxpZGF0aW9uUmVzdWx0W10gPSBbXTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnRJZCwgYXV0aCk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coZm9ybWF0VmFsaWRhdGlvblJlc3VsdChyZXN1bHQpKTtcbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgICBcbiAgICAgICAgaWYgKHJlc3VsdC5pc05ldykge1xuICAgICAgICAgIG5ld0NvbXBvbmVudHMrKztcbiAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgIHZhbGlkKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW52YWxpZCsrO1xuICAgICAgICAgIGJyZWFraW5nQ2hhbmdlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gdmFsaWRhdGUgJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU3VtbWFyeVxuICAgIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gICAgY29uc29sZS5sb2coYPCfk4ogVmFsaWRhdGlvbiBTdW1tYXJ5YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBWYWxpZDogJHt2YWxpZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4p2MIEJyZWFraW5nIENoYW5nZXM6ICR7aW52YWxpZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyoIE5ldyBDb21wb25lbnRzOiAke25ld0NvbXBvbmVudHN9YCk7XG4gICAgXG4gICAgaWYgKGJyZWFraW5nQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBXQVJOSU5HOiAke2JyZWFraW5nQ2hhbmdlcy5sZW5ndGh9IGNvbXBvbmVudChzKSBoYXZlIGJyZWFraW5nIGNoYW5nZXMhYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgVGhlc2UgY2hhbmdlcyBtYXkgYnJlYWsgZXhpc3RpbmcgV29yZFByZXNzIGNvbnRlbnQuXFxuYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50cyB3aXRoIGJyZWFraW5nIGNoYW5nZXM6YCk7XG4gICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiBicmVha2luZ0NoYW5nZXMpIHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIC0gJHtyZXN1bHQuY29tcG9uZW50VGl0bGV9ICgke3Jlc3VsdC5jb21wb25lbnRJZH0pYCk7XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgXFxuICAgVG8gcHJvY2VlZCBhbnl3YXksIGNvbXBpbGUgd2l0aCAtLWZvcmNlIGZsYWcuXFxuYCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7inKggQWxsIGNvbXBvbmVudHMgdmFsaWRhdGVkIHN1Y2Nlc3NmdWxseSFcXG5gKTtcbiAgICB9XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIFVwZGF0ZSBtYW5pZmVzdCBhZnRlciBzdWNjZXNzZnVsIGNvbXBpbGF0aW9uXG4gKi9cbmNvbnN0IHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50ID0gKG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiB2b2lkID0+IHtcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgY29uc3QgdXBkYXRlZE1hbmlmZXN0ID0gdXBkYXRlTWFuaWZlc3QoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gIHNhdmVNYW5pZmVzdChvdXRwdXREaXIsIHVwZGF0ZWRNYW5pZmVzdCk7XG59O1xuXG4vLyBDTEkgc2V0dXBcbnByb2dyYW1cbiAgLm5hbWUoJ2d1dGVuYmVyZy1jb21waWxlJylcbiAgLmRlc2NyaXB0aW9uKCdUcmFuc3BpbGUgSGFuZG9mZiBjb21wb25lbnRzIHRvIFdvcmRQcmVzcyBHdXRlbmJlcmcgYmxvY2tzIGFuZCB0aGVtZSB0ZW1wbGF0ZXMnKVxuICAudmVyc2lvbignMS4wLjAnKTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGNvbmZpZyBmaWxlXG4gKi9cbmNvbnN0IGluaXRDb25maWcgPSAob3B0czoge1xuICBhcGlVcmw/OiBzdHJpbmc7XG4gIG91dHB1dD86IHN0cmluZztcbiAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbiAgZm9yY2U/OiBib29sZWFuO1xufSk6IHZvaWQgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICAvLyBDaGVjayBpZiBjb25maWcgYWxyZWFkeSBleGlzdHNcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkgJiYgIW9wdHMuZm9yY2UpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWcgZmlsZSBhbHJlYWR5IGV4aXN0czogJHtjb25maWdQYXRofWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBVc2UgLS1mb3JjZSB0byBvdmVyd3JpdGUuXFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG4gIFxuICBjb25zdCBuZXdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHtcbiAgICBhcGlVcmw6IG9wdHMuYXBpVXJsID8/ICdodHRwczovL3lvdXItaGFuZG9mZi1zaXRlLmNvbScsXG4gICAgb3V0cHV0OiBvcHRzLm91dHB1dCA/PyAnLi9kZW1vL3BsdWdpbi9ibG9ja3MnLFxuICAgIHRoZW1lRGlyOiBvcHRzLnRoZW1lRGlyID8/ICcuL2RlbW8vdGhlbWUnLFxuICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/ICcnLFxuICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/ICcnLFxuICB9O1xuICBcbiAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShuZXdDb25maWcsIG51bGwsIDIpICsgJ1xcbicpO1xuICBcbiAgY29uc29sZS5sb2coYFxcbuKchSBDcmVhdGVkIGNvbmZpZyBmaWxlOiAke2NvbmZpZ1BhdGh9YCk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5OEIENvbmZpZ3VyYXRpb246YCk7XG4gIGNvbnNvbGUubG9nKGAgICBhcGlVcmw6ICAgJHtuZXdDb25maWcuYXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgb3V0cHV0OiAgICR7bmV3Q29uZmlnLm91dHB1dH1gKTtcbiAgY29uc29sZS5sb2coYCAgIHRoZW1lRGlyOiAke25ld0NvbmZpZy50aGVtZURpcn1gKTtcbiAgaWYgKG5ld0NvbmZpZy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICB1c2VybmFtZTogJHtuZXdDb25maWcudXNlcm5hbWV9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIHBhc3N3b3JkOiAqKioqYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYFxcbvCfkqEgRWRpdCB0aGlzIGZpbGUgdG8gY29uZmlndXJlIHlvdXIgSGFuZG9mZiBBUEkgc2V0dGluZ3MuXFxuYCk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBoZWxwZXJcbiAqL1xuY29uc3QgcHJvbXB0ID0gKHF1ZXN0aW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zdCByZWFkbGluZSA9IHJlcXVpcmUoJ3JlYWRsaW5lJyk7XG4gIGNvbnN0IHJsID0gcmVhZGxpbmUuY3JlYXRlSW50ZXJmYWNlKHtcbiAgICBpbnB1dDogcHJvY2Vzcy5zdGRpbixcbiAgICBvdXRwdXQ6IHByb2Nlc3Muc3Rkb3V0LFxuICB9KTtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIHJsLnF1ZXN0aW9uKHF1ZXN0aW9uLCAoYW5zd2VyOiBzdHJpbmcpID0+IHtcbiAgICAgIHJsLmNsb3NlKCk7XG4gICAgICByZXNvbHZlKGFuc3dlci50cmltKCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGZvciB5ZXMvbm9cbiAqL1xuY29uc3QgcHJvbXB0WWVzTm8gPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgZGVmYXVsdFZhbHVlOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICBjb25zdCBkZWZhdWx0U3RyID0gZGVmYXVsdFZhbHVlID8gJ1kvbicgOiAneS9OJztcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGAke3F1ZXN0aW9ufSBbJHtkZWZhdWx0U3RyfV06IGApO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgcmV0dXJuIGFuc3dlci50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ3knKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IHdpdGggY2hvaWNlc1xuICovXG5jb25zdCBwcm9tcHRDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10sIGRlZmF1bHRJbmRleDogbnVtYmVyID0gMCk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnN0IG1hcmtlciA9IGkgPT09IGRlZmF1bHRJbmRleCA/ICc+JyA6ICcgJztcbiAgICBjb25zb2xlLmxvZyhgICAke21hcmtlcn0gJHtpICsgMX0uICR7Y2hvaWNlfWApO1xuICB9KTtcbiAgXG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgRW50ZXIgbnVtYmVyIFske2RlZmF1bHRJbmRleCArIDF9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xuICBcbiAgY29uc3QgaW5kZXggPSBwYXJzZUludChhbnN3ZXIsIDEwKSAtIDE7XG4gIGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgY2hvaWNlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gY2hvaWNlc1tpbmRleF07XG4gIH1cbiAgcmV0dXJuIGNob2ljZXNbZGVmYXVsdEluZGV4XTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGZvciBtdWx0aXBsZSBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdE11bHRpQ2hvaWNlID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGNob2ljZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxuJHtxdWVzdGlvbn1gKTtcbiAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGkpID0+IHtcbiAgICBjb25zb2xlLmxvZyhgICAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXJzIHNlcGFyYXRlZCBieSBjb21tYXMgKGUuZy4sIDEsMiwzKSBvciAnYWxsJzogYCk7XG4gIGlmIChhbnN3ZXIudG9Mb3dlckNhc2UoKSA9PT0gJ2FsbCcpIHJldHVybiBjaG9pY2VzO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIFtjaG9pY2VzWzBdXTtcbiAgXG4gIGNvbnN0IGluZGljZXMgPSBhbnN3ZXIuc3BsaXQoJywnKS5tYXAocyA9PiBwYXJzZUludChzLnRyaW0oKSwgMTApIC0gMSk7XG4gIHJldHVybiBpbmRpY2VzXG4gICAgLmZpbHRlcihpID0+IGkgPj0gMCAmJiBpIDwgY2hvaWNlcy5sZW5ndGgpXG4gICAgLm1hcChpID0+IGNob2ljZXNbaV0pO1xufTtcblxuLyoqXG4gKiBGaW5kIGFsbCBhcnJheSBwcm9wZXJ0aWVzIGluIGEgY29tcG9uZW50XG4gKi9cbmNvbnN0IGZpbmRBcnJheVByb3BlcnRpZXMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJyk6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0+IHtcbiAgY29uc3QgYXJyYXlzOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9PiA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBjb25zdCBwYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgIFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICBhcnJheXMucHVzaCh7IHBhdGgsIHByb3BlcnR5IH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBSZWN1cnNlIGludG8gb2JqZWN0c1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICBhcnJheXMucHVzaCguLi5maW5kQXJyYXlQcm9wZXJ0aWVzKHByb3BlcnR5LnByb3BlcnRpZXMsIHBhdGgpKTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBhcnJheXM7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGZpZWxkIG1hcHBpbmcgc3VnZ2VzdGlvbnMgYmFzZWQgb24gYXJyYXkgaXRlbSBwcm9wZXJ0aWVzXG4gKi9cbmNvbnN0IHN1Z2dlc3RGaWVsZE1hcHBpbmdzID0gKGl0ZW1Qcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9PiB7XG4gIGNvbnN0IHN1Z2dlc3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICBjb25zdCBtYXBQcm9wZXJ0eSA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBwYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgXG4gICAgICAvLyBTdWdnZXN0IG1hcHBpbmdzIGJhc2VkIG9uIGNvbW1vbiBwYXR0ZXJuc1xuICAgICAgY29uc3QgbG93ZXJLZXkgPSBrZXkudG9Mb3dlckNhc2UoKTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJyB8fCBsb3dlcktleS5pbmNsdWRlcygnaW1hZ2UnKSB8fCBsb3dlcktleS5pbmNsdWRlcygncGhvdG8nKSB8fCBsb3dlcktleS5pbmNsdWRlcygndGh1bWJuYWlsJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAnZmVhdHVyZWRfaW1hZ2UnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3RpdGxlJyB8fCBsb3dlcktleS5pbmNsdWRlcygnaGVhZGluZycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCduYW1lJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF90aXRsZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdleGNlcnB0JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3N1bW1hcnknKSB8fCBsb3dlcktleS5pbmNsdWRlcygnZGVzY3JpcHRpb24nKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2V4Y2VycHQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnY29udGVudCcpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdib2R5JykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9jb250ZW50JztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkgPT09ICd1cmwnIHx8IGxvd2VyS2V5ID09PSAnaHJlZicgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2xpbmsnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwZXJtYWxpbmsnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnZGF0ZScpKSB7XG4gICAgICAgIGlmIChsb3dlcktleS5pbmNsdWRlcygnZGF5JykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6ZGF5X251bWVyaWMnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdtb250aCcpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOm1vbnRoX3Nob3J0JztcbiAgICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygneWVhcicpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOnllYXInO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpmdWxsJztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnYXV0aG9yJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAnYXV0aG9yLm5hbWUnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnY2F0ZWdvcnknKSB8fCBsb3dlcktleS5pbmNsdWRlcygndGFnJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAndGF4b25vbXk6Y2F0ZWdvcnknO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBSZWN1cnNlIGludG8gbmVzdGVkIG9iamVjdHNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICBtYXBQcm9wZXJ0eShwcm9wLnByb3BlcnRpZXMsIHBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIG1hcFByb3BlcnR5KGl0ZW1Qcm9wZXJ0aWVzKTtcbiAgcmV0dXJuIHN1Z2dlc3Rpb25zO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSB3aXphcmQgZm9yIGNvbmZpZ3VyaW5nIGR5bmFtaWMgYXJyYXlzXG4gKi9cbmNvbnN0IGNvbmZpZ3VyZUR5bmFtaWNBcnJheXMgPSBhc3luYyAoXG4gIGFwaVVybDogc3RyaW5nLFxuICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4gIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHNcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+nmSBEeW5hbWljIEFycmF5IENvbmZpZ3VyYXRpb24gV2l6YXJkYCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9XFxuYCk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IHN0cnVjdHVyZS4uLmApO1xuICBsZXQgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50O1xuICB0cnkge1xuICAgIGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX0gKCR7Y29tcG9uZW50LmlkfSlcXG5gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIC8vIEZpbmQgYXJyYXkgcHJvcGVydGllc1xuICBjb25zdCBhcnJheVByb3BzID0gZmluZEFycmF5UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIFxuICBpZiAoYXJyYXlQcm9wcy5sZW5ndGggPT09IDApIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBObyBhcnJheSBwcm9wZXJ0aWVzIGZvdW5kIGluIHRoaXMgY29tcG9uZW50LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBEeW5hbWljIGFycmF5cyBhcmUgb25seSBhdmFpbGFibGUgZm9yIGFycmF5LXR5cGUgcHJvcGVydGllcy5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGDwn5OLIEZvdW5kICR7YXJyYXlQcm9wcy5sZW5ndGh9IGFycmF5IGZpZWxkKHMpOmApO1xuICBhcnJheVByb3BzLmZvckVhY2goKGFyciwgaSkgPT4ge1xuICAgIGNvbnN0IGl0ZW1Db3VudCA9IGFyci5wcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyA/IE9iamVjdC5rZXlzKGFyci5wcm9wZXJ0eS5pdGVtcy5wcm9wZXJ0aWVzKS5sZW5ndGggOiAwO1xuICAgIGNvbnNvbGUubG9nKGAgICAke2kgKyAxfS4gJHthcnIucGF0aH0gKCR7aXRlbUNvdW50fSBpdGVtIHByb3BlcnRpZXMpYCk7XG4gIH0pO1xuICBcbiAgLy8gU2VsZWN0IHdoaWNoIGFycmF5cyB0byBjb25maWd1cmVcbiAgY29uc3Qgc2VsZWN0ZWRBcnJheXMgPSBhcnJheVByb3BzLmxlbmd0aCA9PT0gMSBcbiAgICA/IFthcnJheVByb3BzWzBdXVxuICAgIDogYXdhaXQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGFycmF5UHJvcHMubWFwKGEgPT4gYS5wYXRoKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwcm9tcHRNdWx0aUNob2ljZSgnV2hpY2ggYXJyYXkocykgZG8geW91IHdhbnQgdG8gY29uZmlndXJlPycsIGNob2ljZXMpO1xuICAgICAgICByZXR1cm4gYXJyYXlQcm9wcy5maWx0ZXIoYSA9PiBzZWxlY3RlZC5pbmNsdWRlcyhhLnBhdGgpKTtcbiAgICAgIH0pKCk7XG4gIFxuICAvLyBMb2FkIGV4aXN0aW5nIGNvbmZpZ1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIGxldCBleGlzdGluZ0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge307XG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGV4aXN0aW5nQ29uZmlnID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04JykpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gSWdub3JlIHBhcnNlIGVycm9yc1xuICAgIH1cbiAgfVxuICBcbiAgLy8gQnVpbGQgdGhlIGltcG9ydCBjb25maWcsIHByZXNlcnZpbmcgZXhpc3RpbmcgZW50cmllc1xuICBjb25zdCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyA9IGV4aXN0aW5nQ29uZmlnLmltcG9ydCB8fCB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGlmICghaW1wb3J0Q29uZmlnLmJsb2NrIHx8IHR5cGVvZiBpbXBvcnRDb25maWcuYmxvY2sgPT09ICdib29sZWFuJykge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IHt9O1xuICB9XG4gIGNvbnN0IGJsb2NrQ29uZmlnID0gaW1wb3J0Q29uZmlnLmJsb2NrIGFzIFJlY29yZDxzdHJpbmcsIENvbXBvbmVudEltcG9ydENvbmZpZz47XG4gIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSB8fCB0eXBlb2YgYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSA9IHt9O1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudEZpZWxkQ29uZmlnID0gYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSBhcyBSZWNvcmQ8c3RyaW5nLCBGaWVsZENvbmZpZz47XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVBvc3RzQXJyYXkgPSBhc3luYyAoYXJyYXlQcm9wOiB7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9KTogUHJvbWlzZTxEeW5hbWljQXJyYXlDb25maWc+ID0+IHtcbiAgICAvLyBTZWxlY3Rpb24gbW9kZVxuICAgIGNvbnN0IHNlbGVjdGlvbk1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCB1c2VycyBzZWxlY3QgcG9zdHM/JyxcbiAgICAgIFsnUXVlcnkgQnVpbGRlciAoZmlsdGVyIGJ5IHRheG9ub215LCBvcmRlciwgZXRjLiknLCAnTWFudWFsIFNlbGVjdGlvbiAoaGFuZC1waWNrIHNwZWNpZmljIHBvc3RzKSddLFxuICAgICAgMFxuICAgICk7XG4gICAgY29uc3QgaXNRdWVyeU1vZGUgPSBzZWxlY3Rpb25Nb2RlLmluY2x1ZGVzKCdRdWVyeScpO1xuXG4gICAgLy8gUG9zdCB0eXBlc1xuICAgIGNvbnNvbGUubG9nKGBcXG5FbnRlciBhbGxvd2VkIHBvc3QgdHlwZXMgKGNvbW1hLXNlcGFyYXRlZCk6YCk7XG4gICAgY29uc3QgcG9zdFR5cGVzSW5wdXQgPSBhd2FpdCBwcm9tcHQoYFBvc3QgdHlwZXMgW3Bvc3RdOiBgKTtcbiAgICBjb25zdCBwb3N0VHlwZXMgPSBwb3N0VHlwZXNJbnB1dFxuICAgICAgPyBwb3N0VHlwZXNJbnB1dC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgIDogWydwb3N0J107XG5cbiAgICAvLyBNYXggaXRlbXNcbiAgICBjb25zdCBtYXhJdGVtc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBNYXhpbXVtIGl0ZW1zIFsxMl06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IDEyO1xuXG4gICAgLy8gUmVuZGVyIG1vZGVcbiAgICBjb25zdCByZW5kZXJNb2RlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ0hvdyBzaG91bGQgcG9zdHMgYmUgcmVuZGVyZWQ/JyxcbiAgICAgIFsnTWFwcGVkIChjb252ZXJ0IHBvc3QgZmllbGRzIHRvIHRlbXBsYXRlIHN0cnVjdHVyZSknLCAnVGVtcGxhdGUgKHVzZSBhIFBIUCB0ZW1wbGF0ZSBmaWxlKSddLFxuICAgICAgMFxuICAgICk7XG4gICAgY29uc3QgaXNNYXBwZWRNb2RlID0gcmVuZGVyTW9kZS5pbmNsdWRlcygnTWFwcGVkJyk7XG5cbiAgICBsZXQgZmllbGRNYXBwaW5nOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgbGV0IHRlbXBsYXRlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKGlzTWFwcGVkTW9kZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbvCfk4ogRmllbGQgTWFwcGluZyBDb25maWd1cmF0aW9uYCk7XG5cbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGFycmF5UHJvcC5wcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcztcbiAgICAgIGlmIChpdGVtUHJvcHMpIHtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBzdWdnZXN0RmllbGRNYXBwaW5ncyhpdGVtUHJvcHMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5JJ2xsIHN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gZmllbGQgbmFtZXMuIFByZXNzIEVudGVyIHRvIGFjY2VwdCBvciB0eXBlIGEgbmV3IHZhbHVlLmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxuQXZhaWxhYmxlIHNvdXJjZXM6YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gcG9zdF90aXRsZSwgcG9zdF9leGNlcnB0LCBwb3N0X2NvbnRlbnQsIHBlcm1hbGluaywgcG9zdF9pZGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGZlYXR1cmVkX2ltYWdlYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gcG9zdF9kYXRlOmRheSwgcG9zdF9kYXRlOm1vbnRoX3Nob3J0LCBwb3N0X2RhdGU6eWVhciwgcG9zdF9kYXRlOmZ1bGxgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBhdXRob3IubmFtZSwgYXV0aG9yLnVybCwgYXV0aG9yLmF2YXRhcmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHRheG9ub215OmNhdGVnb3J5LCB0YXhvbm9teTpwb3N0X3RhZ2ApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIG1ldGE6ZmllbGRfbmFtZWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIChsZWF2ZSBlbXB0eSB0byBza2lwKVxcbmApO1xuXG4gICAgICAgIGNvbnN0IGZsYXR0ZW5Qcm9wcyA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICBjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICAgICAgY29uc3QgcCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgICAgICBwYXRocy5wdXNoKC4uLmZsYXR0ZW5Qcm9wcyhwcm9wLnByb3BlcnRpZXMsIHApKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2gocCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBwYXRocztcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkUGF0aCBvZiBmbGF0dGVuUHJvcHMoaXRlbVByb3BzKSkge1xuICAgICAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSBzdWdnZXN0aW9uc1tmaWVsZFBhdGhdIHx8ICcnO1xuICAgICAgICAgIGNvbnN0IGRlZmF1bHRTdHIgPSBzdWdnZXN0aW9uID8gYCBbJHtzdWdnZXN0aW9ufV1gIDogJyc7XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9IGF3YWl0IHByb21wdChgICAke2ZpZWxkUGF0aH0ke2RlZmF1bHRTdHJ9OiBgKTtcbiAgICAgICAgICBjb25zdCBmaW5hbE1hcHBpbmcgPSBtYXBwaW5nIHx8IHN1Z2dlc3Rpb247XG4gICAgICAgICAgaWYgKGZpbmFsTWFwcGluZykge1xuICAgICAgICAgICAgaWYgKGZpbmFsTWFwcGluZy5zdGFydHNXaXRoKCd7JykpIHtcbiAgICAgICAgICAgICAgdHJ5IHsgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBKU09OLnBhcnNlKGZpbmFsTWFwcGluZyk7IH1cbiAgICAgICAgICAgICAgY2F0Y2ggeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZzsgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBmaW5hbE1hcHBpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGRlZmF1bHRUZW1wbGF0ZSA9IGB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyR7YXJyYXlQcm9wLnBhdGh9LWl0ZW0ucGhwYDtcbiAgICAgIHRlbXBsYXRlUGF0aCA9IGF3YWl0IHByb21wdChgVGVtcGxhdGUgcGF0aCBbJHtkZWZhdWx0VGVtcGxhdGV9XTogYCkgfHwgZGVmYXVsdFRlbXBsYXRlO1xuICAgIH1cblxuICAgIGNvbnN0IGFycmF5Q29uZmlnOiBEeW5hbWljQXJyYXlDb25maWcgPSB7XG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgcG9zdFR5cGVzLFxuICAgICAgc2VsZWN0aW9uTW9kZTogaXNRdWVyeU1vZGUgPyAncXVlcnknIDogJ21hbnVhbCcsXG4gICAgICBtYXhJdGVtcyxcbiAgICAgIHJlbmRlck1vZGU6IGlzTWFwcGVkTW9kZSA/ICdtYXBwZWQnIDogJ3RlbXBsYXRlJyxcbiAgICB9O1xuICAgIGlmIChpc01hcHBlZE1vZGUgJiYgT2JqZWN0LmtleXMoZmllbGRNYXBwaW5nKS5sZW5ndGggPiAwKSBhcnJheUNvbmZpZy5maWVsZE1hcHBpbmcgPSBmaWVsZE1hcHBpbmc7XG4gICAgaWYgKCFpc01hcHBlZE1vZGUgJiYgdGVtcGxhdGVQYXRoKSBhcnJheUNvbmZpZy50ZW1wbGF0ZVBhdGggPSB0ZW1wbGF0ZVBhdGg7XG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICBhcnJheUNvbmZpZy5kZWZhdWx0UXVlcnlBcmdzID0ge1xuICAgICAgICBwb3N0c19wZXJfcGFnZTogTWF0aC5taW4obWF4SXRlbXMsIDYpLFxuICAgICAgICBvcmRlcmJ5OiAnZGF0ZScsXG4gICAgICAgIG9yZGVyOiAnREVTQycsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gYXJyYXlDb25maWc7XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBCcmVhZGNydW1ic0FycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlQnJlYWRjcnVtYnNBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPEJyZWFkY3J1bWJzQXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgQnJlYWRjcnVtYnMgYXJlIGJ1aWx0IGF1dG9tYXRpY2FsbHkgZnJvbSB0aGUgY3VycmVudCBwYWdlIFVSTC5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciB3aWxsIHNob3cgYSBzaW5nbGUgZW5hYmxlL2Rpc2FibGUgdG9nZ2xlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBhY3RpdmUgfVxcbmApO1xuICAgIHJldHVybiB7IGFycmF5VHlwZTogJ2JyZWFkY3J1bWJzJyB9O1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgVGF4b25vbXlBcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkgPSBhc3luYyAoKTogUHJvbWlzZTxUYXhvbm9teUFycmF5Q29uZmlnPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIFRheG9ub215IHRlcm1zIGFyZSBmZXRjaGVkIGZyb20gdGhlIGN1cnJlbnQgcG9zdCBzZXJ2ZXItc2lkZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciBzaG93cyBhIHRvZ2dsZSBhbmQgYSBkcm9wZG93biB0byBjaG9vc2UgdGhlIHRheG9ub215LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBzbHVnIH1cXG5gKTtcblxuICAgIGNvbnNvbGUubG9nKGBFbnRlciB0aGUgdGF4b25vbXkgc2x1Z3MgZWRpdG9ycyBjYW4gY2hvb3NlIGZyb20gKGNvbW1hLXNlcGFyYXRlZCk6YCk7XG4gICAgY29uc3QgdGF4b25vbXlJbnB1dCA9IGF3YWl0IHByb21wdChgVGF4b25vbWllcyBbcG9zdF90YWcsY2F0ZWdvcnldOiBgKTtcbiAgICBjb25zdCB0YXhvbm9taWVzID0gdGF4b25vbXlJbnB1dFxuICAgICAgPyB0YXhvbm9teUlucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3RfdGFnJywgJ2NhdGVnb3J5J107XG5cbiAgICBjb25zdCBtYXhJdGVtc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBNYXhpbXVtIHRlcm1zIHRvIGRpc3BsYXkgKC0xID0gYWxsKSBbLTFdOiBgKTtcbiAgICBjb25zdCBtYXhJdGVtcyA9IG1heEl0ZW1zSW5wdXQgPyBwYXJzZUludChtYXhJdGVtc0lucHV0LCAxMCkgOiAtMTtcblxuICAgIGNvbnN0IGNvbmZpZzogVGF4b25vbXlBcnJheUNvbmZpZyA9IHsgYXJyYXlUeXBlOiAndGF4b25vbXknLCB0YXhvbm9taWVzIH07XG4gICAgaWYgKG1heEl0ZW1zID4gMCkgY29uZmlnLm1heEl0ZW1zID0gbWF4SXRlbXM7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIFBhZ2luYXRpb25BcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVBhZ2luYXRpb25BcnJheSA9IGFzeW5jIChvdGhlckFycmF5UGF0aHM6IHN0cmluZ1tdKTogUHJvbWlzZTxQYWdpbmF0aW9uQXJyYXlDb25maWcgfCBudWxsPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIFBhZ2luYXRpb24gbGlua3MgYXJlIGRlcml2ZWQgYXV0b21hdGljYWxseSBmcm9tIGEgc2libGluZyBwb3N0cyBhcnJheSBxdWVyeS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciBzaG93cyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG5cbiAgICBpZiAob3RoZXJBcnJheVBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKaoO+4jyAgTm8gc2libGluZyBhcnJheXMgZm91bmQgdG8gY29ubmVjdCB0by4gQ29uZmlndXJlIGEgcG9zdHMgYXJyYXkgZmlyc3QuYCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgY29ubmVjdGVkRmllbGQ6IHN0cmluZztcbiAgICBpZiAob3RoZXJBcnJheVBhdGhzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBvdGhlckFycmF5UGF0aHNbMF07XG4gICAgICBjb25zb2xlLmxvZyhgICAgQ29ubmVjdGVkIHRvOiAke2Nvbm5lY3RlZEZpZWxkfSAob25seSBvcHRpb24pYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICAgJ1doaWNoIHBvc3RzIGFycmF5IHNob3VsZCB0aGlzIHBhZ2luYXRpb24gYmUgY29ubmVjdGVkIHRvPycsXG4gICAgICAgIG90aGVyQXJyYXlQYXRocyxcbiAgICAgICAgMFxuICAgICAgKTtcbiAgICAgIGNvbm5lY3RlZEZpZWxkID0gY2hvaWNlO1xuICAgIH1cblxuICAgIHJldHVybiB7IGFycmF5VHlwZTogJ3BhZ2luYXRpb24nLCBjb25uZWN0ZWRGaWVsZCB9O1xuICB9O1xuXG4gIC8vIENvbmZpZ3VyZSBlYWNoIHNlbGVjdGVkIGFycmF5XG4gIGZvciAoY29uc3QgYXJyYXlQcm9wIG9mIHNlbGVjdGVkQXJyYXlzKSB7XG4gICAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBDb25maWd1cmluZzogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9XFxuYCk7XG5cbiAgICAvLyBMZXQgdGhlIHVzZXIgY2hvb3NlIHRoZSBhcnJheSB0eXBlXG4gICAgY29uc3QgYXJyYXlUeXBlQ2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ1doYXQga2luZCBvZiBkYXRhIHNob3VsZCB0aGlzIGFycmF5IGNvbnRhaW4/JyxcbiAgICAgIFtcbiAgICAgICAgJ1Bvc3RzIOKAlCBxdWVyeSBvciBoYW5kLXBpY2sgV29yZFByZXNzIHBvc3RzIChkZWZhdWx0KScsXG4gICAgICAgICdCcmVhZGNydW1icyDigJQgYXV0by1nZW5lcmF0ZWQgdHJhaWwgZnJvbSBjdXJyZW50IFVSTCcsXG4gICAgICAgICdUYXhvbm9teSDigJQgdGVybXMgYXR0YWNoZWQgdG8gdGhlIGN1cnJlbnQgcG9zdCcsXG4gICAgICAgICdQYWdpbmF0aW9uIOKAlCBsaW5rcyBkZXJpdmVkIGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5JyxcbiAgICAgIF0sXG4gICAgICAwXG4gICAgKTtcblxuICAgIGxldCBhcnJheUNvbmZpZzogRmllbGRDb25maWcgfCBudWxsID0gbnVsbDtcblxuICAgIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnQnJlYWRjcnVtYnMnKSkge1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5KCk7XG4gICAgfSBlbHNlIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnVGF4b25vbXknKSkge1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVUYXhvbm9teUFycmF5KCk7XG4gICAgfSBlbHNlIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnUGFnaW5hdGlvbicpKSB7XG4gICAgICAvLyBPZmZlciB0aGUgb3RoZXIgYWxyZWFkeS1jb25maWd1cmVkIChvciB5ZXQtdG8tYmUtY29uZmlndXJlZCkgYXJyYXkgcGF0aHMgYXMgY2FuZGlkYXRlc1xuICAgICAgY29uc3Qgc2libGluZyA9IHNlbGVjdGVkQXJyYXlzXG4gICAgICAgIC5maWx0ZXIoYSA9PiBhLnBhdGggIT09IGFycmF5UHJvcC5wYXRoKVxuICAgICAgICAubWFwKGEgPT4gYS5wYXRoKTtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5KHNpYmxpbmcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBQb3N0c1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQb3N0c0FycmF5KGFycmF5UHJvcCk7XG4gICAgfVxuXG4gICAgaWYgKGFycmF5Q29uZmlnKSB7XG4gICAgICBjb21wb25lbnRGaWVsZENvbmZpZ1thcnJheVByb3AucGF0aF0gPSBhcnJheUNvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7inIUgQ29uZmlndXJlZDogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9ICgkeyhhcnJheUNvbmZpZyBhcyBhbnkpLmFycmF5VHlwZSA/PyAncG9zdHMnfSlgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgU2tpcHBlZDogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9YCk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBVcGRhdGUgY29uZmlnIGZpbGUg4oCUIHJlbW92ZSBsZWdhY3kgZHluYW1pY0FycmF5cyBpZiBwcmVzZW50XG4gIGNvbnN0IHsgZHluYW1pY0FycmF5czogX2xlZ2FjeUR5bmFtaWMsIC4uLnJlc3RDb25maWcgfSA9IGV4aXN0aW5nQ29uZmlnO1xuICBjb25zdCBuZXdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHtcbiAgICAuLi5yZXN0Q29uZmlnLFxuICAgIGltcG9ydDogaW1wb3J0Q29uZmlnLFxuICB9O1xuICBcbiAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbiBQcmV2aWV3OlxcbmApO1xuICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh7IGltcG9ydDogaW1wb3J0Q29uZmlnIH0sIG51bGwsIDIpKTtcbiAgXG4gIGNvbnN0IHNob3VsZFNhdmUgPSBhd2FpdCBwcm9tcHRZZXNObygnXFxuU2F2ZSB0byBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uPycsIHRydWUpO1xuICBcbiAgaWYgKHNob3VsZFNhdmUpIHtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gICAgY29uc29sZS5sb2coYFxcbuKchSBTYXZlZCB0byAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYFxcbvCfkqEgTmV4dCBzdGVwczpgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMS4gUnVuOiBucG0gcnVuIGRldiAtLSAke2NvbXBvbmVudE5hbWV9IC0tZm9yY2VgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMi4gQnVpbGQgeW91ciBibG9ja3M6IGNkIGRlbW8vcGx1Z2luICYmIG5wbSBydW4gYnVpbGRgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMy4gVGVzdCB0aGUgYmxvY2sgaW4gV29yZFByZXNzXFxuYCk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29uZmlndXJhdGlvbiBub3Qgc2F2ZWQuIENvcHkgdGhlIEpTT04gYWJvdmUgbWFudWFsbHkgaWYgbmVlZGVkLlxcbmApO1xuICB9XG59O1xuXG4vLyBDb25maWd1cmUgZHluYW1pYyBhcnJheXMgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnY29uZmlndXJlLWR5bmFtaWMgW2NvbXBvbmVudF0nKVxuICAuYWxpYXMoJ3dpemFyZCcpXG4gIC5kZXNjcmlwdGlvbignSW50ZXJhY3RpdmUgd2l6YXJkIHRvIGNvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBmb3IgYSBjb21wb25lbnQnKVxuICAub3B0aW9uKCctYSwgLS1hcGktdXJsIDx1cmw+JywgJ0hhbmRvZmYgQVBJIGJhc2UgVVJMJylcbiAgLm9wdGlvbignLXUsIC0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lJylcbiAgLm9wdGlvbignLXAsIC0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLWwsIC0tbGlzdCcsICdMaXN0IGF2YWlsYWJsZSBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7XG4gICAgYXBpVXJsPzogc3RyaW5nO1xuICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgIHBhc3N3b3JkPzogc3RyaW5nO1xuICAgIGxpc3Q/OiBib29sZWFuO1xuICB9KSA9PiB7XG4gICAgY29uc3QgYXBpVXJsID0gb3B0cy5hcGlVcmwgPz8gY29uZmlnLmFwaVVybDtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBcbiAgICAvLyBJZiBsaXN0aW5nIGNvbXBvbmVudHMsIHNob3cgY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkc1xuICAgIGlmIChvcHRzLmxpc3QgfHwgIWNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0IGZyb20gJHthcGlVcmx9Li4uXFxuYCk7XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgICBcbiAgICAgICAgLy8gRmV0Y2ggZWFjaCBjb21wb25lbnQgdG8gZmluZCBvbmVzIHdpdGggYXJyYXkgZmllbGRzXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50cy4gQ2hlY2tpbmcgZm9yIGFycmF5IGZpZWxkcy4uLlxcbmApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY29tcG9uZW50c1dpdGhBcnJheXM6IEFycmF5PHsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgYXJyYXlzOiBzdHJpbmdbXSB9PiA9IFtdO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBpZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBpZCwgYXV0aCk7XG4gICAgICAgICAgICBjb25zdCBhcnJheXMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIGlmIChhcnJheXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgICB0aXRsZTogY29tcG9uZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgIGFycmF5czogYXJyYXlzLm1hcChhID0+IGEucGF0aCksXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGNvbXBvbmVudHNXaXRoQXJyYXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIE5vIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMgZm91bmQuXFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+nqSBDb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzOlxcbmApO1xuICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5mb3JFYWNoKChjLCBpKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICAgIGMuYXJyYXlzLmZvckVhY2goYSA9PiBjb25zb2xlLmxvZyhgICAgICAg4pSU4pSAICR7YX1gKSk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgaWYgKG9wdHMubGlzdCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIFJ1bjogbnBtIHJ1biBkZXYgLS0gd2l6YXJkIDxjb21wb25lbnQtaWQ+XFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJbnRlcmFjdGl2ZSBzZWxlY3Rpb25cbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGNvbXBvbmVudHNXaXRoQXJyYXlzLm1hcChjID0+IGAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdENob2ljZSgnXFxuU2VsZWN0IGEgY29tcG9uZW50IHRvIGNvbmZpZ3VyZTonLCBjaG9pY2VzLCAwKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRJbmRleCA9IGNob2ljZXMuaW5kZXhPZihzZWxlY3RlZCk7XG4gICAgICAgIGNvbXBvbmVudE5hbWUgPSBjb21wb25lbnRzV2l0aEFycmF5c1tzZWxlY3RlZEluZGV4XS5pZDtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBhd2FpdCBjb25maWd1cmVEeW5hbWljQXJyYXlzKGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gIH0pO1xuXG4vLyBJbml0IGNvbW1hbmRcbnByb2dyYW1cbiAgLmNvbW1hbmQoJ2luaXQnKVxuICAuZGVzY3JpcHRpb24oJ0NyZWF0ZSBhIGhhbmRvZmYtd3AuY29uZmlnLmpzb24gZmlsZSBpbiB0aGUgY3VycmVudCBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctLW91dHB1dCA8ZGlyPicsICdPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MnKVxuICAub3B0aW9uKCctLXRoZW1lLWRpciA8ZGlyPicsICdUaGVtZSBkaXJlY3RvcnkgZm9yIGhlYWRlci9mb290ZXIgdGVtcGxhdGVzJylcbiAgLm9wdGlvbignLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCcpXG4gIC5vcHRpb24oJy0tZm9yY2UnLCAnT3ZlcndyaXRlIGV4aXN0aW5nIGNvbmZpZyBmaWxlJylcbiAgLmFjdGlvbigob3B0aW9ucywgY29tbWFuZCkgPT4ge1xuICAgIC8vIFVzZSBvcHRzV2l0aEdsb2JhbHMgdG8gZ2V0IG9wdGlvbnMgZnJvbSBib3RoIHN1YmNvbW1hbmQgYW5kIHBhcmVudFxuICAgIGNvbnN0IG9wdHMgPSBjb21tYW5kLm9wdHNXaXRoR2xvYmFscygpO1xuICAgIGluaXRDb25maWcob3B0cyk7XG4gIH0pO1xuXG4vLyBEZWZhdWx0IGNvbW1hbmQgZm9yIGJsb2Nrc1xucHJvZ3JhbVxuICAuYXJndW1lbnQoJ1tjb21wb25lbnRdJywgJ0NvbXBvbmVudCBuYW1lIHRvIGNvbXBpbGUgb3IgdmFsaWRhdGUnKVxuICAub3B0aW9uKCctYSwgLS1hcGktdXJsIDx1cmw+JywgYEhhbmRvZmYgQVBJIGJhc2UgVVJMIChkZWZhdWx0OiAke2NvbmZpZy5hcGlVcmx9KWApXG4gIC5vcHRpb24oJy1vLCAtLW91dHB1dCA8ZGlyPicsIGBPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MgKGRlZmF1bHQ6ICR7Y29uZmlnLm91dHB1dH0pYClcbiAgLm9wdGlvbignLS1hbGwnLCAnQ29tcGlsZSBhbGwgYXZhaWxhYmxlIGNvbXBvbmVudHMnKVxuICAub3B0aW9uKCctLXRoZW1lJywgJ0NvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcikgdG8gdGhlbWUgZGlyZWN0b3J5JylcbiAgLm9wdGlvbignLXQsIC0tdGhlbWUtZGlyIDxkaXI+JywgYFRoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMgKGRlZmF1bHQ6ICR7Y29uZmlnLnRoZW1lRGlyfSlgKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLXAsIC0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkIGZvciBIYW5kb2ZmIEFQSScpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUnLCAnVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXMnKVxuICAub3B0aW9uKCctLXZhbGlkYXRlLWFsbCcsICdWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tZm9yY2UnLCAnRm9yY2UgY29tcGlsYXRpb24gZXZlbiB3aXRoIGJyZWFraW5nIGNoYW5nZXMnKVxuICAuYWN0aW9uKGFzeW5jIChjb21wb25lbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdHM6IHsgXG4gICAgYXBpVXJsPzogc3RyaW5nOyBcbiAgICBvdXRwdXQ/OiBzdHJpbmc7IFxuICAgIGFsbD86IGJvb2xlYW47IFxuICAgIHRoZW1lPzogYm9vbGVhbjtcbiAgICB0aGVtZURpcj86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICB2YWxpZGF0ZT86IGJvb2xlYW47XG4gICAgdmFsaWRhdGVBbGw/OiBib29sZWFuO1xuICAgIGZvcmNlPzogYm9vbGVhbjtcbiAgfSkgPT4ge1xuICAgIC8vIE1lcmdlIENMSSBvcHRpb25zIHdpdGggY29uZmlnIChDTEkgdGFrZXMgcHJlY2VkZW5jZSlcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IG91dHB1dCA9IG9wdHMub3V0cHV0ID8/IGNvbmZpZy5vdXRwdXQ7XG4gICAgY29uc3QgdGhlbWVEaXIgPSBvcHRzLnRoZW1lRGlyID8/IGNvbmZpZy50aGVtZURpcjtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBcbiAgICAvLyBWYWxpZGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudmFsaWRhdGVBbGwpIHtcbiAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGFwaVVybCwgb3V0cHV0LCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgaWYgKG9wdHMudmFsaWRhdGUgJiYgY29tcG9uZW50TmFtZSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoYXBpVXJsLCBvdXRwdXQsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCAmJiAhb3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBpbGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudGhlbWUpIHtcbiAgICAgIGF3YWl0IGNvbXBpbGVUaGVtZShhcGlVcmwsIHRoZW1lRGlyLCBhdXRoKTtcbiAgICB9IGVsc2UgaWYgKG9wdHMuYWxsKSB7XG4gICAgICAvLyBWYWxpZGF0ZSBhbGwgZmlyc3QgdW5sZXNzIGZvcmNlZFxuICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIFByZS1jb21waWxhdGlvbiB2YWxpZGF0aW9uLi4uXFxuYCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoYXBpVXJsLCBvdXRwdXQsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyB2YWxpZGF0ZUFsbCBleGl0cyB3aXRoIGNvZGUgMSBvbiBicmVha2luZyBjaGFuZ2VzXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBjb21waWxlQWxsKGFwaVVybCwgb3V0cHV0LCBhdXRoKTtcbiAgICAgIFxuICAgICAgLy8gVXBkYXRlIG1hbmlmZXN0IGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGlsYXRpb25cbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OdIFVwZGF0aW5nIHByb3BlcnR5IG1hbmlmZXN0Li4uYCk7XG4gICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnRJZCwgYXV0aCk7XG4gICAgICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0LCBjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBTa2lwIGZhaWxlZCBjb21wb25lbnRzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgIH0gZWxzZSBpZiAoY29tcG9uZW50TmFtZSkge1xuICAgICAgLy8gQnVpbGQgbWVyZ2VkLWdyb3VwIGxvb2t1cCBvbmNlIGZvciB0aGlzIGJyYW5jaFxuICAgICAgY29uc3QgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgICAgfVxuXG4gICAgICAvLyBIZWxwZXI6IGNvbXBpbGUgYW4gZW50aXJlIG1lcmdlZCBncm91cCBieSBpdHMgY29uZmlnIGtleVxuICAgICAgY29uc3QgY29tcGlsZUdyb3VwQnlLZXkgPSBhc3luYyAoZ3JvdXBLZXk6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgZmV0Y2hBbGxDb21wb25lbnRzTGlzdChhcGlVcmwsIGF1dGgpO1xuICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IGdyb3VwS2V5LnRvTG93ZXJDYXNlKCksXG4gICAgICAgICk7XG4gICAgICAgIGlmIChncm91cE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IE5vIGNvbXBvbmVudHMgZm91bmQgZm9yIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bGxHcm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgZ3JvdXBNYXRjaGVzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGMuaWQsIGF1dGgpO1xuICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhmdWxsKTtcbiAgICAgICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFNraXBwaW5nICR7Yy5pZH0gKHRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkKWApO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bGxHcm91cENvbXBvbmVudHMucHVzaChmdWxsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjLmlkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogQ291bGQgbm90IGZldGNoIGFueSBjb21wb25lbnRzIGZvciBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChhcGlVcmwsIG91dHB1dCwgZ3JvdXBLZXksIGZ1bGxHcm91cENvbXBvbmVudHMsIGF1dGgpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pyFIEdyb3VwIFwiJHtncm91cEtleX1cIiBjb21waWxlZCAoJHtmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpLlxcbmApO1xuICAgICAgfTtcblxuICAgICAgLy8gVHJ5IGNvbXBvbmVudCBmaXJzdCwgdGhlbiBmYWxsIGJhY2sgdG8gZ3JvdXAgKGUuZy4gXCJoZXJvXCIgLT4gSGVybyBtZXJnZWQgYmxvY2spXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuXG4gICAgICAgIC8vIElmIHRoaXMgY29tcG9uZW50IGJlbG9uZ3MgdG8gYSBtZXJnZWQgZ3JvdXAsIGNvbXBpbGUgdGhlIHdob2xlIGdyb3VwIGluc3RlYWRcbiAgICAgICAgaWYgKGNvbXBvbmVudC5ncm91cCkge1xuICAgICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChjb21wb25lbnQuZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgaWYgKGdyb3VwS2V5KSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgXCIke2NvbXBvbmVudE5hbWV9XCIgYmVsb25ncyB0byBtZXJnZWQgZ3JvdXAgXCIke2dyb3VwS2V5fVwiIOKAlCBjb21waWxpbmcgZW50aXJlIGdyb3VwLlxcbmApO1xuICAgICAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwQnlLZXkoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghb3B0cy5mb3JjZSkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGFwaVVybCwgb3V0cHV0LCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgICAgICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlKHtcbiAgICAgICAgICBhcGlVcmwsXG4gICAgICAgICAgb3V0cHV0RGlyOiBvdXRwdXQsXG4gICAgICAgICAgY29tcG9uZW50TmFtZSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0LCBjb21wb25lbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg8J+TnSBNYW5pZmVzdCB1cGRhdGVkXFxuYCk7XG4gICAgICB9IGNhdGNoIChjb21wb25lbnRFcnJvcikge1xuICAgICAgICAvLyBObyBjb21wb25lbnQgd2l0aCB0aGlzIG5hbWUg4oCTIHRyeSBhcyBncm91cFxuICAgICAgICBjb25zb2xlLmxvZyhgICAgTm8gY29tcG9uZW50IFwiJHtjb21wb25lbnROYW1lfVwiIGZvdW5kLCBjaGVja2luZyBncm91cHMuLi5cXG5gKTtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGZldGNoQWxsQ29tcG9uZW50c0xpc3QoYXBpVXJsLCBhdXRoKTtcbiAgICAgICAgY29uc3QgbmFtZUxvd2VyID0gY29tcG9uZW50TmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IG5hbWVMb3dlcixcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50IG9yIGdyb3VwIGZvdW5kIGZvciBcIiR7Y29tcG9uZW50TmFtZX1cIi5gKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICAgICAgQ29tcG9uZW50IGZldGNoOiAke2NvbXBvbmVudEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBjb21wb25lbnRFcnJvci5tZXNzYWdlIDogY29tcG9uZW50RXJyb3J9YCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgICAgICBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KG5hbWVMb3dlcikgPz8gZ3JvdXBNYXRjaGVzWzBdLmdyb3VwO1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiBQbGVhc2Ugc3BlY2lmeSBhIGNvbXBvbmVudCBuYW1lLCBncm91cCBuYW1lLCB1c2UgLS1hbGwgZmxhZywgLS10aGVtZSBmbGFnLCBvciAtLXZhbGlkYXRlLWFsbCBmbGFnJyk7XG4gICAgICBjb25zb2xlLmxvZygnXFxuVXNhZ2U6Jyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiAgIENvbXBpbGUgb25lIGNvbXBvbmVudCAoZS5nLiBoZXJvLWFydGljbGUpJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGdyb3VwLW5hbWU+ICAgICAgT3IgY29tcGlsZSBhIG1lcmdlZCBncm91cCAoZS5nLiBoZXJvKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS10aGVtZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdmFsaWRhdGUgaGVyby1hcnRpY2xlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLWFsbCAtLWZvcmNlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgaGVybyAtLWFwaS11cmwgaHR0cDovL2xvY2FsaG9zdDo0MDAwIC0tb3V0cHV0IC4vYmxvY2tzJyk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9KTtcblxucHJvZ3JhbS5wYXJzZSgpO1xuXG5leHBvcnQgeyBjb21waWxlLCBnZW5lcmF0ZUJsb2NrLCBmZXRjaENvbXBvbmVudCB9O1xuIl19