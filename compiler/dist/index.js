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
 * Recursively copy a directory tree, creating target dirs as needed.
 */
const copyDirRecursive = (src, dest) => {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirSync(src)) {
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        if (fs.statSync(srcPath).isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};
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
        // Copy shared components & utils to the output directory so blocks can
        // resolve their ../../shared/... imports regardless of where they live.
        const pluginRoot = path.resolve(__dirname, '..', '..');
        const pluginSharedDir = path.join(pluginRoot, 'shared');
        const targetSharedDir = path.join(outputDir, '..', 'shared');
        if (fs.existsSync(pluginSharedDir) &&
            path.resolve(pluginSharedDir) !== path.resolve(targetSharedDir)) {
            console.log(`\n⚙️  Copying shared components...`);
            copyDirRecursive(pluginSharedDir, targetSharedDir);
            console.log(`✅ Shared components copied to ${targetSharedDir}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHlDQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsbURBQXFDO0FBRXJDLG1DQUFnUztBQTJCaFM7O0dBRUc7QUFDSCxNQUFNLGNBQWMsR0FBbUI7SUFDckMsTUFBTSxFQUFFLHVCQUF1QjtJQUMvQixNQUFNLEVBQUUsVUFBVTtJQUNsQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixRQUFRLEVBQUUsU0FBUztJQUNuQixNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFO0lBQzFCLE1BQU0sRUFBRSxFQUFFO0NBQ1gsQ0FBQztBQUVGOzs7R0FHRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxhQUFpRCxFQUFnQixFQUFFO0lBQy9GLE1BQU0sWUFBWSxHQUFpQixFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUN0RCxNQUFNLFdBQVcsR0FBMEMsRUFBRSxDQUFDO0lBRTlELEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7UUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQUUsU0FBUztRQUM5QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQztZQUFFLFNBQVM7UUFDOUIsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENB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QUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RILE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEIsQ0FBQztZQUNELE1BQU0sUUFBUSxHQUNaLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ3RFLE1BQU0saUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNILENBQUM7U0FBTSxDQUFDO1FBQ04sT0FBTyxDQUFDLEtBQUssQ0FBQywwR0FBMEcsQ0FBQyxDQUFDO1FBQzFILE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzRkFBc0YsQ0FBQyxDQUFDO1FBQ3BHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUZBQWlGLENBQUMsQ0FBQztRQUMvRixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMsaURBQWlELENBQUMsQ0FBQztRQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztRQUM5RixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVMLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogR3V0ZW5iZXJnIENvbXBpbGVyXG4gKiBcbiAqIFRyYW5zcGlsZXMgSGFuZG9mZiBjb21wb25lbnRzIHRvIFdvcmRQcmVzcyBHdXRlbmJlcmcgYmxvY2tzLlxuICogXG4gKiBVc2FnZTpcbiAqICAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxjb21wb25lbnQtbmFtZT4gW29wdGlvbnNdXG4gKiAgIFxuICogT3B0aW9uczpcbiAqICAgLS1hcGktdXJsIDx1cmw+ICAgIEhhbmRvZmYgQVBJIGJhc2UgVVJMIChkZWZhdWx0OiBodHRwOi8vbG9jYWxob3N0OjQwMDApXG4gKiAgIC0tb3V0cHV0IDxkaXI+ICAgICBPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MgKGRlZmF1bHQ6IC4vYmxvY2tzKVxuICogICAtLWFsbCAgICAgICAgICAgICAgQ29tcGlsZSBhbGwgYXZhaWxhYmxlIGNvbXBvbmVudHNcbiAqICAgLS10aGVtZSAgICAgICAgICAgIENvbXBpbGUgaGVhZGVyL2Zvb3RlciB0byB0aGVtZSB0ZW1wbGF0ZXNcbiAqICAgLS12YWxpZGF0ZSAgICAgICAgIFZhbGlkYXRlIGEgY29tcG9uZW50IGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiAgIC0tdmFsaWRhdGUtYWxsICAgICBWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgY2hhbmdlc1xuICogXG4gKiBDb25maWd1cmF0aW9uOlxuICogICBDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4geW91ciBwcm9qZWN0IHJvb3QgdG8gc2V0IGRlZmF1bHRzOlxuICogICB7XG4gKiAgICAgXCJhcGlVcmxcIjogXCJodHRwczovL2RlbW8uaGFuZG9mZi5jb21cIixcbiAqICAgICBcIm91dHB1dFwiOiBcIi4vcGF0aC90by9ibG9ja3NcIixcbiAqICAgICBcInRoZW1lRGlyXCI6IFwiLi9wYXRoL3RvL3RoZW1lXCJcbiAqICAgfVxuICovXG5cbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBwcmV0dGllciBmcm9tICdwcmV0dGllcic7XG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgQ29tcGlsZXJPcHRpb25zLCBHZW5lcmF0ZWRCbG9jaywgSGFuZG9mZldwQ29uZmlnLCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRDb25maWcsIEltcG9ydENvbmZpZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnLCBGaWVsZFByZWZlcmVuY2VzLCBpc0R5bmFtaWNBcnJheUNvbmZpZyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIEF1dGggY3JlZGVudGlhbHMgZm9yIEhUVFAgcmVxdWVzdHNcbiAqL1xuaW50ZXJmYWNlIEF1dGhDcmVkZW50aWFscyB7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXF1aXJlZCBjb25maWcgd2l0aCBkZWZhdWx0cyBhcHBsaWVkXG4gKi9cbmludGVyZmFjZSBSZXNvbHZlZENvbmZpZyB7XG4gIGFwaVVybDogc3RyaW5nO1xuICBvdXRwdXQ6IHN0cmluZztcbiAgdGhlbWVEaXI6IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBpbXBvcnQ6IEltcG9ydENvbmZpZztcbiAgZ3JvdXBzOiBSZWNvcmQ8c3RyaW5nLCAnbWVyZ2VkJyB8ICdpbmRpdmlkdWFsJz47XG4gIHNjaGVtYU1pZ3JhdGlvbnM/OiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCB7XG4gICAgcmVuYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgdHJhbnNmb3Jtcz86IFJlY29yZDxzdHJpbmcsIHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nOyBydWxlOiBzdHJpbmcgfT47XG4gIH0+Pjtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gKi9cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBSZXNvbHZlZENvbmZpZyA9IHtcbiAgYXBpVXJsOiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgb3V0cHV0OiAnLi9ibG9ja3MnLFxuICB0aGVtZURpcjogJy4vdGhlbWUnLFxuICB1c2VybmFtZTogdW5kZWZpbmVkLFxuICBwYXNzd29yZDogdW5kZWZpbmVkLFxuICBpbXBvcnQ6IHsgZWxlbWVudDogZmFsc2UgfSxcbiAgZ3JvdXBzOiB7fSxcbn07XG5cbi8qKlxuICogTWlncmF0ZSBsZWdhY3kgYGR5bmFtaWNBcnJheXNgIGNvbmZpZyB0byB0aGUgbmV3IGBpbXBvcnRgIHN0cnVjdHVyZS5cbiAqIEdyb3VwcyBcImNvbXBvbmVudElkLmZpZWxkTmFtZVwiIGVudHJpZXMgdW5kZXIgaW1wb3J0LmJsb2NrW2NvbXBvbmVudElkXVtmaWVsZE5hbWVdLlxuICovXG5jb25zdCBtaWdyYXRlRHluYW1pY0FycmF5cyA9IChkeW5hbWljQXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KTogSW1wb3J0Q29uZmlnID0+IHtcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGNvbnN0IGJsb2NrQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+ID0ge307XG5cbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCFjb25maWcuZW5hYmxlZCkgY29udGludWU7XG4gICAgY29uc3QgZG90SW5kZXggPSBrZXkuaW5kZXhPZignLicpO1xuICAgIGlmIChkb3RJbmRleCA9PT0gLTEpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGNvbXBvbmVudElkID0ga2V5LnN1YnN0cmluZygwLCBkb3RJbmRleCk7XG4gICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZyhkb3RJbmRleCArIDEpO1xuXG4gICAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPSB7fTtcbiAgICB9XG4gICAgKGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KVtmaWVsZE5hbWVdID0gY29uZmlnO1xuICB9XG5cbiAgaWYgKE9iamVjdC5rZXlzKGJsb2NrQ29uZmlnKS5sZW5ndGggPiAwKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0gYmxvY2tDb25maWc7XG4gIH1cblxuICByZXR1cm4gaW1wb3J0Q29uZmlnO1xufTtcblxuLyoqXG4gKiBMb2FkIGNvbmZpZ3VyYXRpb24gZnJvbSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGlmIGl0IGV4aXN0c1xuICovXG5jb25zdCBsb2FkQ29uZmlnID0gKCk6IEhhbmRvZmZXcENvbmZpZyA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNvbmZpZ0NvbnRlbnQpIGFzIEhhbmRvZmZXcENvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OEIExvYWRlZCBjb25maWcgZnJvbSAke2NvbmZpZ1BhdGh9YCk7XG4gICAgICByZXR1cm4gY29uZmlnO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRmFpbGVkIHRvIHBhcnNlIGhhbmRvZmYtd3AuY29uZmlnLmpzb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiB7fTtcbn07XG5cbi8qKlxuICogTWVyZ2UgY29uZmlndXJhdGlvbiBzb3VyY2VzIHdpdGggcHJpb3JpdHk6IENMSSA+IGNvbmZpZyBmaWxlID4gZGVmYXVsdHNcbiAqL1xuY29uc3QgZ2V0Q29uZmlnID0gKCk6IFJlc29sdmVkQ29uZmlnID0+IHtcbiAgY29uc3QgZmlsZUNvbmZpZyA9IGxvYWRDb25maWcoKTtcblxuICBsZXQgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWc7XG4gIGlmIChmaWxlQ29uZmlnLmltcG9ydCkge1xuICAgIGltcG9ydENvbmZpZyA9IGZpbGVDb25maWcuaW1wb3J0O1xuICB9IGVsc2UgaWYgKGZpbGVDb25maWcuZHluYW1pY0FycmF5cykge1xuICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBcImR5bmFtaWNBcnJheXNcIiBjb25maWcgaXMgZGVwcmVjYXRlZC4gTWlncmF0ZSB0byBcImltcG9ydFwiIOKAlCBzZWUgU1BFQ0lGSUNBVElPTi5tZC5gKTtcbiAgICBpbXBvcnRDb25maWcgPSBtaWdyYXRlRHluYW1pY0FycmF5cyhmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpO1xuICB9IGVsc2Uge1xuICAgIGltcG9ydENvbmZpZyA9IERFRkFVTFRfQ09ORklHLmltcG9ydDtcbiAgfVxuICBcbiAgcmV0dXJuIHtcbiAgICBhcGlVcmw6IGZpbGVDb25maWcuYXBpVXJsID8/IERFRkFVTFRfQ09ORklHLmFwaVVybCxcbiAgICBvdXRwdXQ6IGZpbGVDb25maWcub3V0cHV0ID8/IERFRkFVTFRfQ09ORklHLm91dHB1dCxcbiAgICB0aGVtZURpcjogZmlsZUNvbmZpZy50aGVtZURpciA/PyBERUZBVUxUX0NPTkZJRy50aGVtZURpcixcbiAgICB1c2VybmFtZTogZmlsZUNvbmZpZy51c2VybmFtZSA/PyBERUZBVUxUX0NPTkZJRy51c2VybmFtZSxcbiAgICBwYXNzd29yZDogZmlsZUNvbmZpZy5wYXNzd29yZCA/PyBERUZBVUxUX0NPTkZJRy5wYXNzd29yZCxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgICBncm91cHM6IGZpbGVDb25maWcuZ3JvdXBzID8/IERFRkFVTFRfQ09ORklHLmdyb3VwcyxcbiAgICBzY2hlbWFNaWdyYXRpb25zOiBmaWxlQ29uZmlnLnNjaGVtYU1pZ3JhdGlvbnMsXG4gIH07XG59O1xuXG5cbi8qKlxuICogQnVpbGQgSFRUUCByZXF1ZXN0IG9wdGlvbnMgd2l0aCBvcHRpb25hbCBiYXNpYyBhdXRoXG4gKi9cbmNvbnN0IGJ1aWxkUmVxdWVzdE9wdGlvbnMgPSAodXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBodHRwLlJlcXVlc3RPcHRpb25zIHwgaHR0cHMuUmVxdWVzdE9wdGlvbnMgPT4ge1xuICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKHVybCk7XG4gIGNvbnN0IG9wdGlvbnM6IGh0dHAuUmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICBwb3J0OiBwYXJzZWRVcmwucG9ydCB8fCAocGFyc2VkVXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/IDQ0MyA6IDgwKSxcbiAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgaGVhZGVyczoge30sXG4gIH07XG4gIFxuICBpZiAoYXV0aD8udXNlcm5hbWUgJiYgYXV0aD8ucGFzc3dvcmQpIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IEJ1ZmZlci5mcm9tKGAke2F1dGgudXNlcm5hbWV9OiR7YXV0aC5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0ge1xuICAgICAgLi4ub3B0aW9ucy5oZWFkZXJzLFxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmFzaWMgJHtjcmVkZW50aWFsc31gLFxuICAgIH07XG4gIH1cbiAgXG4gIHJldHVybiBvcHRpb25zO1xufTtcblxuLy8gTG9hZCBjb25maWcgYXQgc3RhcnR1cFxuY29uc3QgY29uZmlnID0gZ2V0Q29uZmlnKCk7XG5pbXBvcnQge1xuICBnZW5lcmF0ZUJsb2NrSnNvbixcbiAgZ2VuZXJhdGVJbmRleEpzLFxuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgZ2VuZXJhdGVFZGl0b3JTY3NzLFxuICBnZW5lcmF0ZVN0eWxlU2NzcyxcbiAgZ2VuZXJhdGVSZWFkbWUsXG4gIHRvQmxvY2tOYW1lLFxuICBnZW5lcmF0ZUhlYWRlclBocCxcbiAgZ2VuZXJhdGVGb290ZXJQaHAsXG4gIGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwLFxuICBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAsXG4gIGdlbmVyYXRlU2hhcmVkQ29tcG9uZW50cyxcbiAgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsXG4gIGdlbmVyYXRlTWVyZ2VkQmxvY2ssXG4gIGdlbmVyYXRlRGVwcmVjYXRpb25zLFxuICBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyxcbn0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB0eXBlIHsgVmFyaWFudEluZm8gfSBmcm9tICcuL2dlbmVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgbG9hZE1hbmlmZXN0LFxuICBzYXZlTWFuaWZlc3QsXG4gIHZhbGlkYXRlQ29tcG9uZW50LFxuICB1cGRhdGVNYW5pZmVzdCxcbiAgZ2V0Q29tcG9uZW50SGlzdG9yeSxcbiAgZXh0cmFjdFByb3BlcnRpZXMsXG4gIGZvcm1hdFZhbGlkYXRpb25SZXN1bHQsXG4gIFZhbGlkYXRpb25SZXN1bHQsXG4gIHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMsXG4gIGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdFxufSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFIaXN0b3J5IH0gZnJvbSAnLi92YWxpZGF0b3JzJztcblxuLy8gTG9hZCBQSFAgcGx1Z2luIGZvciBQcmV0dGllciAodXNpbmcgcmVxdWlyZSBmb3IgY29tcGF0aWJpbGl0eSlcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG5jb25zdCBwaHBQbHVnaW4gPSByZXF1aXJlKCdAcHJldHRpZXIvcGx1Z2luLXBocCcpO1xuXG4vKipcbiAqIEZvcm1hdCBjb2RlIHdpdGggUHJldHRpZXJcbiAqL1xuY29uc3QgZm9ybWF0Q29kZSA9IGFzeW5jIChjb2RlOiBzdHJpbmcsIHBhcnNlcjogJ2JhYmVsJyB8ICdqc29uJyB8ICdzY3NzJyB8ICdwaHAnKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBvcHRpb25zOiBwcmV0dGllci5PcHRpb25zID0ge1xuICAgICAgcGFyc2VyLFxuICAgICAgc2luZ2xlUXVvdGU6IHRydWUsXG4gICAgICB0YWJXaWR0aDogMixcbiAgICAgIHByaW50V2lkdGg6IDEwMCxcbiAgICAgIHRyYWlsaW5nQ29tbWE6ICdlczUnLFxuICAgIH07XG4gICAgXG4gICAgLy8gTG9hZCBQSFAgcGx1Z2luIGZvciBQSFAgZmlsZXNcbiAgICBpZiAocGFyc2VyID09PSAncGhwJykge1xuICAgICAgb3B0aW9ucy5wbHVnaW5zID0gW3BocFBsdWdpbl07XG4gICAgICAvLyBQSFAtc3BlY2lmaWMgb3B0aW9ucyAtIGNhc3QgdG8gYW55IGZvciBwbHVnaW4tc3BlY2lmaWMgb3B0aW9uc1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5waHBWZXJzaW9uID0gJzguMCc7XG4gICAgICAob3B0aW9ucyBhcyBhbnkpLmJyYWNlU3R5bGUgPSAnMXRicyc7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBhd2FpdCBwcmV0dGllci5mb3JtYXQoY29kZSwgb3B0aW9ucyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSWYgZm9ybWF0dGluZyBmYWlscywgcmV0dXJuIG9yaWdpbmFsIGNvZGVcbiAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgUHJldHRpZXIgZm9ybWF0dGluZyBmYWlsZWQgZm9yICR7cGFyc2VyfSwgdXNpbmcgdW5mb3JtYXR0ZWQgY29kZWApO1xuICAgIHJldHVybiBjb2RlO1xuICB9XG59O1xuXG5jb25zdCBwcm9ncmFtID0gbmV3IENvbW1hbmQoKTtcblxuLyoqXG4gKiBSZWN1cnNpdmVseSBjb3B5IGEgZGlyZWN0b3J5IHRyZWUsIGNyZWF0aW5nIHRhcmdldCBkaXJzIGFzIG5lZWRlZC5cbiAqL1xuY29uc3QgY29weURpclJlY3Vyc2l2ZSA9IChzcmM6IHN0cmluZywgZGVzdDogc3RyaW5nKTogdm9pZCA9PiB7XG4gIGlmICghZnMuZXhpc3RzU3luYyhkZXN0KSkge1xuICAgIGZzLm1rZGlyU3luYyhkZXN0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBmb3IgKGNvbnN0IGVudHJ5IG9mIGZzLnJlYWRkaXJTeW5jKHNyYykpIHtcbiAgICBjb25zdCBzcmNQYXRoID0gcGF0aC5qb2luKHNyYywgZW50cnkpO1xuICAgIGNvbnN0IGRlc3RQYXRoID0gcGF0aC5qb2luKGRlc3QsIGVudHJ5KTtcbiAgICBpZiAoZnMuc3RhdFN5bmMoc3JjUGF0aCkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgY29weURpclJlY3Vyc2l2ZShzcmNQYXRoLCBkZXN0UGF0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZzLmNvcHlGaWxlU3luYyhzcmNQYXRoLCBkZXN0UGF0aCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIERvd25sb2FkIGEgZmlsZSBmcm9tIGEgVVJMIGFuZCBzYXZlIGl0IHRvIGRpc2tcbiAqL1xuY29uc3QgZG93bmxvYWRGaWxlID0gYXN5bmMgKHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgLy8gSGFuZGxlIHJlZGlyZWN0c1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzLnN0YXR1c0NvZGUgPT09IDMwMikge1xuICAgICAgICBjb25zdCByZWRpcmVjdFVybCA9IHJlcy5oZWFkZXJzLmxvY2F0aW9uO1xuICAgICAgICBpZiAocmVkaXJlY3RVcmwpIHtcbiAgICAgICAgICBkb3dubG9hZEZpbGUocmVkaXJlY3RVcmwsIGRlc3RQYXRoLCBhdXRoKS50aGVuKHJlc29sdmUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgZmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKGRlc3RQYXRoKTtcbiAgICAgIHJlcy5waXBlKGZpbGVTdHJlYW0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdmaW5pc2gnLCAoKSA9PiB7XG4gICAgICAgIGZpbGVTdHJlYW0uY2xvc2UoKTtcbiAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdlcnJvcicsIChlcnIpID0+IHtcbiAgICAgICAgZnMudW5saW5rKGRlc3RQYXRoLCAoKSA9PiB7fSk7IC8vIENsZWFuIHVwIHBhcnRpYWwgZmlsZVxuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIHNhdmUgc2NyZWVuc2hvdDogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBkb3dubG9hZCBzY3JlZW5zaG90OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggY29tcG9uZW50IGRhdGEgZnJvbSBIYW5kb2ZmIEFQSVxuICovXG5jb25zdCBmZXRjaENvbXBvbmVudCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50PiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC8ke2NvbXBvbmVudE5hbWV9Lmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEhhbmRvZmZDb21wb25lbnQ7XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudCBKU09OOiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYWxsIGJsb2NrIGZpbGVzIGZyb20gYSBjb21wb25lbnRcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGFwaVVybCAtIFRoZSBiYXNlIEFQSSBVUkwgZm9yIGZldGNoaW5nIHNjcmVlbnNob3RzXG4gKiBAcGFyYW0gcmVzb2x2ZWRDb25maWcgLSBUaGUgcmVzb2x2ZWQgY29uZmlndXJhdGlvbiBpbmNsdWRpbmcgZHluYW1pYyBhcnJheSBzZXR0aW5nc1xuICovXG5jb25zdCBnZW5lcmF0ZUJsb2NrID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgYXBpVXJsOiBzdHJpbmcsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZywgc2NoZW1hSGlzdG9yeT86IFNjaGVtYUhpc3RvcnkpOiBHZW5lcmF0ZWRCbG9jayA9PiB7XG4gIGNvbnN0IGhhc1NjcmVlbnNob3QgPSAhIWNvbXBvbmVudC5pbWFnZTtcbiAgXG4gIC8vIENvbnN0cnVjdCBmdWxsIHNjcmVlbnNob3QgVVJMIGlmIGltYWdlIHBhdGggaXMgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGlmIChjb21wb25lbnQuaW1hZ2UpIHtcbiAgICAvLyBIYW5kbGUgYm90aCBhYnNvbHV0ZSBVUkxzIGFuZCByZWxhdGl2ZSBwYXRoc1xuICAgIGlmIChjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cDovLycpIHx8IGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICBzY3JlZW5zaG90VXJsID0gY29tcG9uZW50LmltYWdlO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSZWxhdGl2ZSBwYXRoIC0gcHJlcGVuZCBBUEkgVVJMXG4gICAgICBzY3JlZW5zaG90VXJsID0gYCR7YXBpVXJsfSR7Y29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJy8nKSA/ICcnIDogJy8nfSR7Y29tcG9uZW50LmltYWdlfWA7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFeHRyYWN0IGR5bmFtaWMgYXJyYXkgY29uZmlncyBmb3IgdGhpcyBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZ1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydClcbiAgfTtcbiAgXG4gIC8vIEF1dG8tZGV0ZWN0IHBhZ2luYXRpb24gZm9yIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGVudHJpZXMgb25seVxuICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50RHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoJ2FycmF5VHlwZScgaW4gZHluQ29uZmlnKSBjb250aW51ZTsgLy8gU2tpcCBzcGVjaWFsaXNlZCBhcnJheSB0eXBlc1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgIGlmIChwcm9wPy50eXBlID09PSAnYXJyYXknICYmIHByb3AucGFnaW5hdGlvbj8udHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBjb25zdCBwYWdpbmF0aW9uRmllbGRSZWdleCA9IG5ldyBSZWdFeHAoXG4gICAgICAgIGBcXFxce1xcXFx7XFxcXHMqI2ZpZWxkXFxcXHMrW1wiJ10ke2ZpZWxkTmFtZX1cXFxcLnBhZ2luYXRpb25bXCInXWBcbiAgICAgICk7XG4gICAgICBpZiAocGFnaW5hdGlvbkZpZWxkUmVnZXgudGVzdChjb21wb25lbnQuY29kZSkpIHtcbiAgICAgICAgKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24gPSB7IHByb3BlcnR5TmFtZTogJ3BhZ2luYXRpb24nIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIHJpY2h0ZXh0IGZpZWxkIChpZiBhbnkpIHVzZXMgSW5uZXJCbG9ja3NcbiAgY29uc3QgZmllbGRQcmVmcyA9IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCk7XG4gIGNvbnN0IHJpY2h0ZXh0RmllbGRzID0gT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpXG4gICAgLmZpbHRlcigoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICAvLyBDaGVjayBleHBsaWNpdCBjb25maWcgb3ZlcnJpZGVzIGZpcnN0XG4gIGNvbnN0IGV4cGxpY2l0SW5uZXJCbG9ja3MgPSBPYmplY3QuZW50cmllcyhmaWVsZFByZWZzKVxuICAgIC5maWx0ZXIoKFssIHByZWZzXSkgPT4gcHJlZnMuaW5uZXJCbG9ja3MgPT09IHRydWUpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgbGV0IGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IG9ubHkgb25lIHJpY2h0ZXh0IGZpZWxkIHBlciBibG9jayBjYW4gdXNlIElubmVyQmxvY2tzLCBgICtcbiAgICAgIGBidXQgJHtleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aH0gYXJlIG1hcmtlZDogJHtleHBsaWNpdElubmVyQmxvY2tzLmpvaW4oJywgJyl9YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBmaWVsZCA9IGV4cGxpY2l0SW5uZXJCbG9ja3NbMF07XG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkXTtcbiAgICBpZiAoIXByb3AgfHwgcHJvcC50eXBlICE9PSAncmljaHRleHQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogZmllbGQgXCIke2ZpZWxkfVwiIGlzIG1hcmtlZCBhcyBpbm5lckJsb2NrcyBidXQgaXMgbm90IGEgcmljaHRleHQgZmllbGRgXG4gICAgICApO1xuICAgIH1cbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gZmllbGQ7XG4gIH0gZWxzZSBpZiAocmljaHRleHRGaWVsZHMubGVuZ3RoID09PSAxKSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IHJpY2h0ZXh0RmllbGRzWzBdO1xuICB9IGVsc2Uge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSBudWxsO1xuICB9XG4gIFxuICBjb25zdCBoaXN0b3J5RW50cnkgPSBzY2hlbWFIaXN0b3J5ID8gZ2V0Q29tcG9uZW50SGlzdG9yeShzY2hlbWFIaXN0b3J5LCBjb21wb25lbnQuaWQpIDogdW5kZWZpbmVkO1xuICBjb25zdCBjdXJyZW50UHJvcHMgPSBleHRyYWN0UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIGNvbnN0IG1pZ3JhdGlvbk92ZXJyaWRlcyA9IHJlc29sdmVkQ29uZmlnLnNjaGVtYU1pZ3JhdGlvbnM/Lltjb21wb25lbnQuaWRdO1xuICBjb25zdCBkZXByZWNhdGlvbnNDb2RlID0gZ2VuZXJhdGVEZXByZWNhdGlvbnMoXG4gICAgaGlzdG9yeUVudHJ5LFxuICAgIGN1cnJlbnRQcm9wcyxcbiAgICBtaWdyYXRpb25PdmVycmlkZXMsXG4gICAgISFpbm5lckJsb2Nrc0ZpZWxkXG4gICk7XG5cbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlQmxvY2tKc29uKGNvbXBvbmVudCwgaGFzU2NyZWVuc2hvdCwgYXBpVXJsLCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBpbmRleEpzOiBnZW5lcmF0ZUluZGV4SnMoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkLCBkZXByZWNhdGlvbnNDb2RlKSxcbiAgICByZW5kZXJQaHA6IGdlbmVyYXRlUmVuZGVyUGhwKGNvbXBvbmVudCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgZWRpdG9yU2NzczogZ2VuZXJhdGVFZGl0b3JTY3NzKGNvbXBvbmVudCksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZVN0eWxlU2Nzcyhjb21wb25lbnQpLFxuICAgIHJlYWRtZTogZ2VuZXJhdGVSZWFkbWUoY29tcG9uZW50KSxcbiAgICBtaWdyYXRpb25TY2hlbWE6IGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hKGNvbXBvbmVudCksXG4gICAgc2NoZW1hQ2hhbmdlbG9nOiBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyhjb21wb25lbnQuaWQsIGhpc3RvcnlFbnRyeSksXG4gICAgc2NyZWVuc2hvdFVybFxuICB9O1xufTtcblxuLyoqXG4gKiBXcml0ZSBibG9jayBmaWxlcyB0byBvdXRwdXQgZGlyZWN0b3J5XG4gKi9cbmNvbnN0IHdyaXRlQmxvY2tGaWxlcyA9IGFzeW5jIChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50SWQ6IHN0cmluZywgYmxvY2s6IEdlbmVyYXRlZEJsb2NrLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IHRvQmxvY2tOYW1lKGNvbXBvbmVudElkKTtcbiAgY29uc3QgYmxvY2tEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBibG9ja05hbWUpO1xuICBcbiAgLy8gQ3JlYXRlIGJsb2NrIGRpcmVjdG9yeVxuICBpZiAoIWZzLmV4aXN0c1N5bmMoYmxvY2tEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGJsb2NrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBcbiAgLy8gRm9ybWF0IGFsbCBjb2RlIGZpbGVzIHdpdGggUHJldHRpZXJcbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgXG4gIC8vIFdyaXRlIGZpbGVzXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnYmxvY2suanNvbicpLCBmb3JtYXR0ZWRCbG9ja0pzb24pO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2luZGV4LmpzJyksIGZvcm1hdHRlZEluZGV4SnMpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3JlbmRlci5waHAnKSwgZm9ybWF0dGVkUmVuZGVyUGhwKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdlZGl0b3Iuc2NzcycpLCBmb3JtYXR0ZWRFZGl0b3JTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdzdHlsZS5zY3NzJyksIGZvcm1hdHRlZFN0eWxlU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnUkVBRE1FLm1kJyksIGJsb2NrLnJlYWRtZSk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnbWlncmF0aW9uLXNjaGVtYS5qc29uJyksIGJsb2NrLm1pZ3JhdGlvblNjaGVtYSk7XG4gIGlmIChibG9jay5zY2hlbWFDaGFuZ2Vsb2cpIHtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3NjaGVtYS1jaGFuZ2Vsb2cuanNvbicpLCBibG9jay5zY2hlbWFDaGFuZ2Vsb2cpO1xuICB9XG4gIFxuICAvLyBEb3dubG9hZCBzY3JlZW5zaG90IGlmIGF2YWlsYWJsZVxuICBsZXQgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBmYWxzZTtcbiAgaWYgKGJsb2NrLnNjcmVlbnNob3RVcmwpIHtcbiAgICBjb25zdCBzY3JlZW5zaG90UGF0aCA9IHBhdGguam9pbihibG9ja0RpciwgJ3NjcmVlbnNob3QucG5nJyk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfk7cgRG93bmxvYWRpbmcgc2NyZWVuc2hvdC4uLmApO1xuICAgIHNjcmVlbnNob3REb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGJsb2NrLnNjcmVlbnNob3RVcmwsIHNjcmVlbnNob3RQYXRoLCBhdXRoKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgYmxvY2s6ICR7YmxvY2tOYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2Jsb2NrRGlyfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBibG9jay5qc29uYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGluZGV4LmpzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHJlbmRlci5waHBgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgZWRpdG9yLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4Qgc3R5bGUuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBSRUFETUUubWRgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgbWlncmF0aW9uLXNjaGVtYS5qc29uYCk7XG4gIGlmIChzY3JlZW5zaG90RG93bmxvYWRlZCkge1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5a877iPICBzY3JlZW5zaG90LnBuZ2ApO1xuICB9XG59O1xuXG4vKipcbiAqIE1haW4gY29tcGlsYXRpb24gZnVuY3Rpb25cbiAqL1xuY29uc3QgY29tcGlsZSA9IGFzeW5jIChvcHRpb25zOiBDb21waWxlck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7b3B0aW9ucy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7b3B0aW9ucy5jb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke29wdGlvbnMub3V0cHV0RGlyfWApO1xuICBpZiAob3B0aW9ucy5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke29wdGlvbnMuYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBmcm9tIEFQSVxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBkYXRhLi4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQob3B0aW9ucy5hcGlVcmwsIG9wdGlvbnMuY29tcG9uZW50TmFtZSwgb3B0aW9ucy5hdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRlbXBsYXRlIHZhcmlhYmxlcyBiZWZvcmUgZ2VuZXJhdGluZ1xuICAgIGNvbnNvbGUubG9nKGDwn5SNIFZhbGlkYXRpbmcgdGVtcGxhdGUgdmFyaWFibGVzLi4uYCk7XG4gICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgXG4gICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIFRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkISBGaXggdGhlIHVuZGVmaW5lZCB2YXJpYWJsZXMgYmVmb3JlIGNvbXBpbGluZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgYmxvY2sgZmlsZXMgKHdpdGggZGVwcmVjYXRpb24gc3VwcG9ydCBmcm9tIHNjaGVtYSBoaXN0b3J5KVxuICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgR3V0ZW5iZXJnIGJsb2NrLi4uYCk7XG4gICAgY29uc3Qgc2NoZW1hSGlzdG9yeSA9IGxvYWRNYW5pZmVzdChvcHRpb25zLm91dHB1dERpcik7XG4gICAgY29uc3QgYmxvY2sgPSBnZW5lcmF0ZUJsb2NrKGNvbXBvbmVudCwgb3B0aW9ucy5hcGlVcmwsIGNvbmZpZywgc2NoZW1hSGlzdG9yeSk7XG4gICAgXG4gICAgLy8gV3JpdGUgZmlsZXMgKHdpdGggUHJldHRpZXIgZm9ybWF0dGluZylcbiAgICBhd2FpdCB3cml0ZUJsb2NrRmlsZXMob3B0aW9ucy5vdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIG9wdGlvbnMuYXV0aCk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBEb25lISBEb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgYSBjb21wb25lbnQgc2hvdWxkIGJlIGltcG9ydGVkIGJhc2VkIG9uIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBzaG91bGRJbXBvcnRDb21wb25lbnQgPSAoY29tcG9uZW50SWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCB0eXBlQ29uZmlnID0gaW1wb3J0Q29uZmlnW2NvbXBvbmVudFR5cGVdO1xuXG4gIC8vIFR5cGUgbm90IGxpc3RlZCBpbiBpbXBvcnQgY29uZmlnIOKAlCBkZWZhdWx0IHRvIHRydWUgKGltcG9ydClcbiAgaWYgKHR5cGVDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEVudGlyZSB0eXBlIGRpc2FibGVkXG4gIGlmICh0eXBlQ29uZmlnID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAvLyBFbnRpcmUgdHlwZSBlbmFibGVkIHdpdGggbm8gcGVyLWNvbXBvbmVudCBvdmVycmlkZXNcbiAgaWYgKHR5cGVDb25maWcgPT09IHRydWUpIHJldHVybiB0cnVlO1xuXG4gIC8vIFBlci1jb21wb25lbnQgbG9va3VwIHdpdGhpbiB0aGUgdHlwZSBvYmplY3RcbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIC8vIE5vdCBsaXN0ZWQg4oCUIGltcG9ydCB3aXRoIGRlZmF1bHRzICh0eXBlLW9iamVjdCBtZWFucyBcImltcG9ydCBhbGwsIG92ZXJyaWRlIGxpc3RlZFwiKVxuICBpZiAoY29tcG9uZW50Q29uZmlnID09PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAvLyBFeHBsaWNpdGx5IGRpc2FibGVkXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEV4cGxpY2l0bHkgZW5hYmxlZCBvciBoYXMgZmllbGQgb3ZlcnJpZGVzXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHJhdyBwZXItZmllbGQgY29uZmlnIG9iamVjdCBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZ2V0Q29tcG9uZW50RmllbGRDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG4gIGlmICghdHlwZUNvbmZpZyB8fCB0eXBlb2YgdHlwZUNvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIGlmICghY29tcG9uZW50Q29uZmlnIHx8IHR5cGVvZiBjb21wb25lbnRDb25maWcgPT09ICdib29sZWFuJykgcmV0dXJuIHt9O1xuXG4gIHJldHVybiBjb21wb25lbnRDb25maWcgYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgRmllbGRQcmVmZXJlbmNlcz47XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+ID0+IHtcbiAgY29uc3QgYWxsQ29uZmlncyA9IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyhjb21wb25lbnRJZCwgY29tcG9uZW50VHlwZSwgaW1wb3J0Q29uZmlnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKGlzRHluYW1pY0FycmF5Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gY29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGZpZWxkIHByZWZlcmVuY2VzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIEZpZWxkUHJlZmVyZW5jZXM+ID0ge307XG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhhbGxDb25maWdzKSkge1xuICAgIGlmICghaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEZldGNoIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEksIGZpbHRlcmVkIGJ5IGltcG9ydCBjb25maWdcbiAqL1xuY29uc3QgZmV0Y2hDb21wb25lbnRMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQgbGlzdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICBjb25zdCBmaWx0ZXJlZCA9IGNvbXBvbmVudHMuZmlsdGVyKGMgPT4gc2hvdWxkSW1wb3J0Q29tcG9uZW50KGMuaWQsIGMudHlwZSwgaW1wb3J0Q29uZmlnKSk7XG4gICAgICAgICAgcmVzb2x2ZShmaWx0ZXJlZC5tYXAoYyA9PiBjLmlkKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50cyBsaXN0OiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudHM6ICR7ZS5tZXNzYWdlfWApKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEZldGNoIGZ1bGwgbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSAobm8gaW1wb3J0IGZpbHRlcikuIFVzZWQgdG8gcmVzb2x2ZSBncm91cCBuYW1lcy5cbiAqL1xuY29uc3QgZmV0Y2hBbGxDb21wb25lbnRzTGlzdCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudFtdPiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudHMuanNvbmA7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQgbGlzdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IEpTT04ucGFyc2UoZGF0YSkgYXMgQXJyYXk8SGFuZG9mZkNvbXBvbmVudD47XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnRzKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIENvbXBpbGUgYWxsIGNvbXBvbmVudHNcbiAqL1xuLyoqXG4gKiBCdWlsZCBWYXJpYW50SW5mbyBmb3IgYSBjb21wb25lbnQgKHJlc29sdmVzIGR5bmFtaWMgYXJyYXlzLCBJbm5lckJsb2NrcyBmaWVsZCwgZXRjLilcbiAqL1xuY29uc3QgYnVpbGRWYXJpYW50SW5mbyA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZyk6IFZhcmlhbnRJbmZvID0+IHtcbiAgY29uc3QgY29tcG9uZW50RHluYW1pY0FycmF5cyA9IHtcbiAgICAuLi5leHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpLFxuICB9O1xuXG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGNvbnN0IGV4cGxpY2l0SW5uZXJCbG9ja3MgPSBPYmplY3QuZW50cmllcyhmaWVsZFByZWZzKVxuICAgIC5maWx0ZXIoKFssIHByZWZzXSkgPT4gcHJlZnMuaW5uZXJCbG9ja3MgPT09IHRydWUpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgbGV0IGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IG9ubHkgb25lIHJpY2h0ZXh0IGZpZWxkIHBlciBibG9jayBjYW4gdXNlIElubmVyQmxvY2tzLCBgICtcbiAgICAgIGBidXQgJHtleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aH0gYXJlIG1hcmtlZDogJHtleHBsaWNpdElubmVyQmxvY2tzLmpvaW4oJywgJyl9YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBmaWVsZCA9IGV4cGxpY2l0SW5uZXJCbG9ja3NbMF07XG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkXTtcbiAgICBpZiAoIXByb3AgfHwgcHJvcC50eXBlICE9PSAncmljaHRleHQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogZmllbGQgXCIke2ZpZWxkfVwiIGlzIG1hcmtlZCBhcyBpbm5lckJsb2NrcyBidXQgaXMgbm90IGEgcmljaHRleHQgZmllbGRgXG4gICAgICApO1xuICAgIH1cbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gZmllbGQ7XG4gIH0gZWxzZSBpZiAocmljaHRleHRGaWVsZHMubGVuZ3RoID09PSAxKSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IHJpY2h0ZXh0RmllbGRzWzBdO1xuICB9IGVsc2Uge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjb21wb25lbnQsXG4gICAgZmllbGRNYXA6IHt9LFxuICAgIGlubmVyQmxvY2tzRmllbGQsXG4gICAgZHluYW1pY0FycmF5Q29uZmlnczogY29tcG9uZW50RHluYW1pY0FycmF5cyxcbiAgfTtcbn07XG5cbi8qKlxuICogQ29tcGlsZSBhIHNpbmdsZSBtZXJnZWQgZ3JvdXAgKGUuZy4gSGVybyB3aXRoIG11bHRpcGxlIHZhcmlhbnRzKS4gVXNlZCBieSBzaW5nbGUtbmFtZSBDTEkgd2hlbiBuYW1lIG1hdGNoZXMgYSBncm91cC5cbiAqL1xuY29uc3QgY29tcGlsZUdyb3VwID0gYXN5bmMgKFxuICBhcGlVcmw6IHN0cmluZyxcbiAgb3V0cHV0RGlyOiBzdHJpbmcsXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSxcbiAgYXV0aD86IEF1dGhDcmVkZW50aWFscyxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UgCBHZW5lcmF0aW5nIG1lcmdlZCBncm91cCBibG9jazogJHtncm91cFNsdWd9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zdCB2YXJpYW50SW5mb3M6IFZhcmlhbnRJbmZvW10gPSBncm91cENvbXBvbmVudHMubWFwKChjKSA9PiBidWlsZFZhcmlhbnRJbmZvKGMsIGNvbmZpZykpO1xuICBjb25zdCBtZXJnZWRCbG9jayA9IGdlbmVyYXRlTWVyZ2VkQmxvY2soZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHMsIHZhcmlhbnRJbmZvcywgYXBpVXJsKTtcbiAgY29uc3QgZ3JvdXBCbG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIGNvbnN0IGdyb3VwRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgZ3JvdXBCbG9ja05hbWUpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZ3JvdXBEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGdyb3VwRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suYmxvY2tKc29uLCAnanNvbicpO1xuICBjb25zdCBmb3JtYXR0ZWRJbmRleEpzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5pbmRleEpzLCAnYmFiZWwnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgY29uc3QgZm9ybWF0dGVkRWRpdG9yU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suZWRpdG9yU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkU3R5bGVTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5zdHlsZVNjc3MsICdzY3NzJyk7XG5cbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdSRUFETUUubWQnKSwgbWVyZ2VkQmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgbWVyZ2VkQmxvY2subWlncmF0aW9uU2NoZW1hKTtcblxuICBpZiAobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMpIHtcbiAgICBjb25zdCB2YXJpYXRpb25zRGlyID0gcGF0aC5qb2luKGdyb3VwRGlyLCAndmFyaWF0aW9ucycpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyh2YXJpYXRpb25zRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKHZhcmlhdGlvbnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLmpzKSkge1xuICAgICAgY29uc3QgZm9ybWF0dGVkID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAnYmFiZWwnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0uanNgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcy5waHApKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdwaHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0ucGhwYCksIGZvcm1hdHRlZCk7XG4gICAgfVxuICB9XG5cbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgbWVyZ2VkIGJsb2NrOiAke2dyb3VwQmxvY2tOYW1lfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtncm91cERpcn1gKTtcblxuICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChncm91cENvbXBvbmVudHMpO1xuICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoaW5jbHVkZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICBmcy53cml0ZUZpbGVTeW5jKGNhdGVnb3JpZXNQYXRoLCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgJHtjYXRlZ29yaWVzUGF0aH1gKTtcbn07XG5cbmNvbnN0IGNvbXBpbGVBbGwgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SnIEd1dGVuYmVyZyBDb21waWxlciAtIEJhdGNoIE1vZGVgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3V0cHV0RGlyfWApO1xuICBpZiAoYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHthdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBjb25maWcuaW1wb3J0LCBhdXRoKTtcblxuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHNcXG5gKTtcbiAgICBcbiAgICBsZXQgc3VjY2VzcyA9IDA7XG4gICAgbGV0IGZhaWxlZCA9IDA7XG4gICAgY29uc3QgY29tcGlsZWRDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICBjb25zdCBzY2hlbWFIaXN0b3J5ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgLy8gRmV0Y2ggYWxsIGNvbXBvbmVudHMgZmlyc3Qgc28gd2UgY2FuIHBhcnRpdGlvbiBieSBncm91cFxuICAgIGNvbnN0IGFsbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQodGVtcGxhdGVWYWxpZGF0aW9uKSk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4pqg77iPICBTa2lwcGluZyAke2NvbXBvbmVudElkfSBkdWUgdG8gdGVtcGxhdGUgdmFyaWFibGUgZXJyb3JzYCk7XG4gICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhbGxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUGFydGl0aW9uIGNvbXBvbmVudHM6IG1lcmdlZCBncm91cHMgdnMgaW5kaXZpZHVhbFxuICAgIC8vIEJ1aWxkIGNhc2UtaW5zZW5zaXRpdmUgbG9va3VwOiBjb25maWcgbWF5IHNheSBcIkhlcm9cIiBidXQgQVBJIG9mdGVuIHJldHVybnMgXCJoZXJvXCJcbiAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICB9XG4gICAgY29uc3QgZ3JvdXBCdWNrZXRzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmQ29tcG9uZW50W10+ID0ge307XG4gICAgY29uc3QgaW5kaXZpZHVhbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgYWxsQ29tcG9uZW50cykge1xuICAgICAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA7XG4gICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBjb25maWdLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgaWYgKGNvbmZpZ0tleSkge1xuICAgICAgICBpZiAoIWdyb3VwQnVja2V0c1tjb25maWdLZXldKSBncm91cEJ1Y2tldHNbY29uZmlnS2V5XSA9IFtdO1xuICAgICAgICBncm91cEJ1Y2tldHNbY29uZmlnS2V5XS5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBpbmRpdmlkdWFsIGNvbXBvbmVudHMgKGV4aXN0aW5nIGJlaGF2aW9yKVxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGluZGl2aWR1YWxDb21wb25lbnRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBhcGlVcmwsIGNvbmZpZywgc2NoZW1hSGlzdG9yeSk7XG4gICAgICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIGF1dGgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBzdWNjZXNzKys7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgJHtjb21wb25lbnQuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgbWVyZ2VkIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzXSBvZiBPYmplY3QuZW50cmllcyhncm91cEJ1Y2tldHMpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoYXBpVXJsLCBvdXRwdXREaXIsIGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzLCBhdXRoKTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goLi4uZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgc3VjY2VzcyArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlIG1lcmdlZCBncm91cCAke2dyb3VwU2x1Z306ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGNhdGVnb3JpZXMgUEhQIGZpbGUgYmFzZWQgb24gYWxsIGNvbXBpbGVkIGNvbXBvbmVudHNcbiAgICBpZiAoY29tcGlsZWRDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIEdlbmVyYXRpbmcgYmxvY2sgY2F0ZWdvcmllcy4uLmApO1xuICAgICAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChjb21waWxlZENvbXBvbmVudHMpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgICAgIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvcHkgc2hhcmVkIGNvbXBvbmVudHMgJiB1dGlscyB0byB0aGUgb3V0cHV0IGRpcmVjdG9yeSBzbyBibG9ja3MgY2FuXG4gICAgLy8gcmVzb2x2ZSB0aGVpciAuLi8uLi9zaGFyZWQvLi4uIGltcG9ydHMgcmVnYXJkbGVzcyBvZiB3aGVyZSB0aGV5IGxpdmUuXG4gICAgY29uc3QgcGx1Z2luUm9vdCA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicsICcuLicpO1xuICAgIGNvbnN0IHBsdWdpblNoYXJlZERpciA9IHBhdGguam9pbihwbHVnaW5Sb290LCAnc2hhcmVkJyk7XG4gICAgY29uc3QgdGFyZ2V0U2hhcmVkRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJy4uJywgJ3NoYXJlZCcpO1xuXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMocGx1Z2luU2hhcmVkRGlyKSAmJlxuICAgICAgICBwYXRoLnJlc29sdmUocGx1Z2luU2hhcmVkRGlyKSAhPT0gcGF0aC5yZXNvbHZlKHRhcmdldFNoYXJlZERpcikpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvcHlpbmcgc2hhcmVkIGNvbXBvbmVudHMuLi5gKTtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUocGx1Z2luU2hhcmVkRGlyLCB0YXJnZXRTaGFyZWREaXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBTaGFyZWQgY29tcG9uZW50cyBjb3BpZWQgdG8gJHt0YXJnZXRTaGFyZWREaXJ9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uY3NzIGFuZCBtYWluLmpzIGRlc2lnbiBzeXN0ZW0gYXNzZXRzXG4gICAgY29uc29sZS5sb2coYFxcbvCfk6EgRG93bmxvYWRpbmcgZGVzaWduIHN5c3RlbSBhc3NldHMuLi5gKTtcbiAgICBjb25zdCBhc3NldHNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnLi4nLCAnYXNzZXRzJyk7XG4gICAgY29uc3QgYXNzZXRzQ3NzRGlyID0gcGF0aC5qb2luKGFzc2V0c0RpciwgJ2NzcycpO1xuICAgIGNvbnN0IGFzc2V0c0pzRGlyID0gcGF0aC5qb2luKGFzc2V0c0RpciwgJ2pzJyk7XG5cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXNzZXRzQ3NzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGFzc2V0c0Nzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhhc3NldHNKc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhhc3NldHNKc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgY3NzVXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uY3NzYDtcbiAgICBjb25zdCBjc3NQYXRoID0gcGF0aC5qb2luKGFzc2V0c0Nzc0RpciwgJ21haW4uY3NzJyk7XG4gICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShjc3NVcmwsIGNzc1BhdGgsIGF1dGgpO1xuICAgIGlmIChjc3NEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9jc3MvbWFpbi5jc3NgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmNzcyBmcm9tICR7Y3NzVXJsfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGpzVXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgIGNvbnN0IGpzUGF0aCA9IHBhdGguam9pbihhc3NldHNKc0RpciwgJ21haW4uanMnKTtcbiAgICBjb25zdCBqc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoanNVcmwsIGpzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGpzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvanMvbWFpbi5qc2ApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uanMgZnJvbSAke2pzVXJsfWApO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggQ29tcGlsYXRpb24gY29tcGxldGUhYCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBTdWNjZXNzOiAke3N1Y2Nlc3N9YCk7XG4gICAgaWYgKGZhaWxlZCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinYwgRmFpbGVkOiAke2ZhaWxlZH1gKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGdyb3VwQnVja2V0cykubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIPCflIAgTWVyZ2VkIGdyb3VwczogJHtPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aH1gKTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coYFxcbkRvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKVxuICovXG5jb25zdCBjb21waWxlVGhlbWUgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn46oIFRoZW1lIFRlbXBsYXRlIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke291dHB1dERpcn1gKTtcbiAgaWYgKGF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7YXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIENvbXBpbGUgaGVhZGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgaGVhZGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXIgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsICdoZWFkZXInLCBhdXRoKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtoZWFkZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgaGVhZGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgaGVhZGVyUGhwID0gZ2VuZXJhdGVIZWFkZXJQaHAoaGVhZGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEhlYWRlciA9IGF3YWl0IGZvcm1hdENvZGUoaGVhZGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGhlYWRlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnaGVhZGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhoZWFkZXJQYXRoLCBmb3JtYXR0ZWRIZWFkZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7aGVhZGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEhlYWRlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxlIGZvb3RlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGZvb3RlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZm9vdGVyID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCAnZm9vdGVyJywgYXV0aCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Zm9vdGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGZvb3Rlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGZvb3RlclBocCA9IGdlbmVyYXRlRm9vdGVyUGhwKGZvb3Rlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRGb290ZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGZvb3RlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBmb290ZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Zvb3Rlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoZm9vdGVyUGF0aCwgZm9ybWF0dGVkRm9vdGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2Zvb3RlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBGb290ZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWxzbyB0cnkgaGVhZGVyLWNvbXBhY3QgYW5kIGZvb3Rlci1jb21wYWN0IGlmIHRoZXkgZXhpc3RcbiAgICAvLyBUaGVzZSBnbyBpbnRvIHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvIHN1YmZvbGRlclxuICAgIGNvbnN0IGhhbmRvZmZUZW1wbGF0ZXNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAndGVtcGxhdGUtcGFydHMnLCAnaGFuZG9mZicpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBnZW5lcmF0ZWRUZW1wbGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCB2YXJpYW50IG9mIFsnaGVhZGVyLWNvbXBhY3QnLCAnaGVhZGVyLWxhbmRlcicsICdmb290ZXItY29tcGFjdCddKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIHZhcmlhbnQsIGF1dGgpO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+ToSBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9YCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVR5cGUgPSB2YXJpYW50LnJlcGxhY2UoLy0vZywgJ18nKTtcbiAgICAgICAgY29uc3QgaXNIZWFkZXIgPSB2YXJpYW50LnN0YXJ0c1dpdGgoJ2hlYWRlcicpO1xuICAgICAgICBjb25zdCBwaHAgPSBpc0hlYWRlciBcbiAgICAgICAgICA/IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKVxuICAgICAgICAgIDogZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpO1xuICAgICAgICBjb25zdCBmb3JtYXR0ZWRQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKHBocCwgJ3BocCcpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIGZvcm1hdHRlZFBocCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2ZpbGVQYXRofVxcbmApO1xuICAgICAgICBnZW5lcmF0ZWRUZW1wbGF0ZXMucHVzaChgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBWYXJpYW50IGRvZXNuJ3QgZXhpc3QsIHNraXAgc2lsZW50bHlcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgUkVBRE1FIGZvciB0aGUgaGFuZG9mZiB0ZW1wbGF0ZXMgZm9sZGVyXG4gICAgaWYgKGdlbmVyYXRlZFRlbXBsYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCByZWFkbWVDb250ZW50ID0gYCMgSGFuZG9mZiBUZW1wbGF0ZSBQYXJ0c1xuXG4+IOKaoO+4jyAqKkRPIE5PVCBFRElUIFRIRVNFIEZJTEVTIERJUkVDVExZKipcbj5cbj4gVGhlc2UgZmlsZXMgYXJlIGF1dG9tYXRpY2FsbHkgZ2VuZXJhdGVkIGJ5IHRoZSBIYW5kb2ZmIFdvcmRQcmVzcyBjb21waWxlci5cbj4gQW55IGNoYW5nZXMgd2lsbCBiZSBvdmVyd3JpdHRlbiBvbiB0aGUgbmV4dCBzeW5jLlxuXG4jIyBTb3VyY2VcblxuVGhlc2UgdGVtcGxhdGVzIHdlcmUgdHJhbnNwaWxlZCBmcm9tIHRoZSBIYW5kb2ZmIGRlc2lnbiBzeXN0ZW0uXG5cbi0gKipBUEkgVVJMOioqICR7YXBpVXJsfVxuLSAqKkdlbmVyYXRlZDoqKiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1cblxuIyMgRmlsZXNcblxuJHtnZW5lcmF0ZWRUZW1wbGF0ZXMubWFwKGYgPT4gYC0gXFxgJHtmfVxcYGApLmpvaW4oJ1xcbicpfVxuXG4jIyBVc2FnZVxuXG5JbmNsdWRlIHRoZXNlIHRlbXBsYXRlIHBhcnRzIGluIHlvdXIgdGhlbWUgdXNpbmc6XG5cblxcYFxcYFxcYHBocFxuPD9waHAgZ2V0X3RlbXBsYXRlX3BhcnQoJ3RlbXBsYXRlLXBhcnRzL2hhbmRvZmYvaGVhZGVyLWNvbXBhY3QnKTsgPz5cbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2Zvb3Rlci1jb21wYWN0Jyk7ID8+XG5cXGBcXGBcXGBcblxuIyMgUmVnZW5lcmF0aW5nXG5cblRvIHJlZ2VuZXJhdGUgdGhlc2UgZmlsZXMsIHJ1bjpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZVxuXFxgXFxgXFxgXG5cbk9yIHdpdGggYSBzcGVjaWZpYyBBUEkgVVJMOlxuXG5cXGBcXGBcXGBiYXNoXG5ucHggaGFuZG9mZi13cCAtLXRoZW1lIC0tYXBpLXVybCAke2FwaVVybH1cblxcYFxcYFxcYFxuYDtcbiAgICAgIGNvbnN0IHJlYWRtZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgJ1JFQURNRS5tZCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhyZWFkbWVQYXRoLCByZWFkbWVDb250ZW50KTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OdIEdlbmVyYXRlZDogJHtyZWFkbWVQYXRofVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmNzcyBhbmQgbWFpbi5qcyBhc3NldHNcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyB0aGVtZSBhc3NldHMuLi5gKTtcbiAgICBcbiAgICAvLyBFbnN1cmUgYXNzZXRzIGRpcmVjdG9yaWVzIGV4aXN0XG4gICAgY29uc3QgY3NzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Fzc2V0cycsICdjc3MnKTtcbiAgICBjb25zdCBqc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnanMnKTtcbiAgICBcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoY3NzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGNzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhqc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhqc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uY3NzXG4gICAgY29uc3QgY3NzVXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uY3NzYDtcbiAgICBjb25zdCBjc3NQYXRoID0gcGF0aC5qb2luKGNzc0RpciwgJ21haW4uY3NzJyk7XG4gICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uY3NzLi4uYCk7XG4gICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShjc3NVcmwsIGNzc1BhdGgsIGF1dGgpO1xuICAgIGlmIChjc3NEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7Y3NzUGF0aH1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmNzcyBmcm9tICR7Y3NzVXJsfWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmpzXG4gICAgY29uc3QganNVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5qc2A7XG4gICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGpzRGlyLCAnbWFpbi5qcycpO1xuICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmpzLi4uYCk7XG4gICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGpzVXJsLCBqc1BhdGgsIGF1dGgpO1xuICAgIGlmIChqc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZDogJHtqc1BhdGh9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggVGhlbWUgdGVtcGxhdGVzIGdlbmVyYXRlZCFcXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYSBzaW5nbGUgY29tcG9uZW50IGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzXG4gKi9cbmNvbnN0IHZhbGlkYXRlID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxWYWxpZGF0aW9uUmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SNIFZhbGlkYXRpbmcgQ29tcG9uZW50OiAke2NvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgLy8gRmV0Y2ggY29tcG9uZW50XG4gIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gIFxuICAvLyBMb2FkIG1hbmlmZXN0XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIFxuICAvLyBWYWxpZGF0ZVxuICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgXG4gIC8vIE91dHB1dCByZXN1bHRcbiAgY29uc29sZS5sb2coZm9ybWF0VmFsaWRhdGlvblJlc3VsdChyZXN1bHQpKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzXG4gKi9cbmNvbnN0IHZhbGlkYXRlQWxsID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBBbGwgQ29tcG9uZW50c2ApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE1hbmlmZXN0OiAke291dHB1dERpcn1cXG5gKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gRmV0Y2ggY29tcG9uZW50IGxpc3RcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGltcG9ydENvbmZpZywgYXV0aCk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIC8vIExvYWQgbWFuaWZlc3RcbiAgICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICAgIFxuICAgIGxldCB2YWxpZCA9IDA7XG4gICAgbGV0IGludmFsaWQgPSAwO1xuICAgIGxldCBuZXdDb21wb25lbnRzID0gMDtcbiAgICBjb25zdCBicmVha2luZ0NoYW5nZXM6IFZhbGlkYXRpb25SZXN1bHRbXSA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVDb21wb25lbnQoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAocmVzdWx0LmlzTmV3KSB7XG4gICAgICAgICAgbmV3Q29tcG9uZW50cysrO1xuICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgdmFsaWQrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnZhbGlkKys7XG4gICAgICAgICAgYnJlYWtpbmdDaGFuZ2VzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byB2YWxpZGF0ZSAke2NvbXBvbmVudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBTdW1tYXJ5XG4gICAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBWYWxpZGF0aW9uIFN1bW1hcnlgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFZhbGlkOiAke3ZhbGlkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinYwgQnJlYWtpbmcgQ2hhbmdlczogJHtpbnZhbGlkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinKggTmV3IENvbXBvbmVudHM6ICR7bmV3Q29tcG9uZW50c31gKTtcbiAgICBcbiAgICBpZiAoYnJlYWtpbmdDaGFuZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIFdBUk5JTkc6ICR7YnJlYWtpbmdDaGFuZ2VzLmxlbmd0aH0gY29tcG9uZW50KHMpIGhhdmUgYnJlYWtpbmcgY2hhbmdlcyFgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBUaGVzZSBjaGFuZ2VzIG1heSBicmVhayBleGlzdGluZyBXb3JkUHJlc3MgY29udGVudC5cXG5gKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnRzIHdpdGggYnJlYWtpbmcgY2hhbmdlczpgKTtcbiAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGJyZWFraW5nQ2hhbmdlcykge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgLSAke3Jlc3VsdC5jb21wb25lbnRUaXRsZX0gKCR7cmVzdWx0LmNvbXBvbmVudElkfSlgKTtcbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGBcXG4gICBUbyBwcm9jZWVkIGFueXdheSwgY29tcGlsZSB3aXRoIC0tZm9yY2UgZmxhZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKcqCBBbGwgY29tcG9uZW50cyB2YWxpZGF0ZWQgc3VjY2Vzc2Z1bGx5IVxcbmApO1xuICAgIH1cbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogVXBkYXRlIG1hbmlmZXN0IGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGlsYXRpb25cbiAqL1xuY29uc3QgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQgPSAob3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCk6IHZvaWQgPT4ge1xuICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICBjb25zdCB1cGRhdGVkTWFuaWZlc3QgPSB1cGRhdGVNYW5pZmVzdChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgc2F2ZU1hbmlmZXN0KG91dHB1dERpciwgdXBkYXRlZE1hbmlmZXN0KTtcbn07XG5cbi8vIENMSSBzZXR1cFxucHJvZ3JhbVxuICAubmFtZSgnZ3V0ZW5iZXJnLWNvbXBpbGUnKVxuICAuZGVzY3JpcHRpb24oJ1RyYW5zcGlsZSBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MgYW5kIHRoZW1lIHRlbXBsYXRlcycpXG4gIC52ZXJzaW9uKCcxLjAuMCcpO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgY29uZmlnIGZpbGVcbiAqL1xuY29uc3QgaW5pdENvbmZpZyA9IChvcHRzOiB7XG4gIGFwaVVybD86IHN0cmluZztcbiAgb3V0cHV0Pzogc3RyaW5nO1xuICB0aGVtZURpcj86IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBmb3JjZT86IGJvb2xlYW47XG59KTogdm9pZCA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIC8vIENoZWNrIGlmIGNvbmZpZyBhbHJlYWR5IGV4aXN0c1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSAmJiAhb3B0cy5mb3JjZSkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZyBmaWxlIGFscmVhZHkgZXhpc3RzOiAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFVzZSAtLWZvcmNlIHRvIG92ZXJ3cml0ZS5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIGFwaVVybDogb3B0cy5hcGlVcmwgPz8gJ2h0dHBzOi8veW91ci1oYW5kb2ZmLXNpdGUuY29tJyxcbiAgICBvdXRwdXQ6IG9wdHMub3V0cHV0ID8/ICcuL2RlbW8vcGx1Z2luL2Jsb2NrcycsXG4gICAgdGhlbWVEaXI6IG9wdHMudGhlbWVEaXIgPz8gJy4vZGVtby90aGVtZScsXG4gICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gJycsXG4gICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gJycsXG4gIH07XG4gIFxuICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gIFxuICBjb25zb2xlLmxvZyhgXFxu4pyFIENyZWF0ZWQgY29uZmlnIGZpbGU6ICR7Y29uZmlnUGF0aH1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbjpgKTtcbiAgY29uc29sZS5sb2coYCAgIGFwaVVybDogICAke25ld0NvbmZpZy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBvdXRwdXQ6ICAgJHtuZXdDb25maWcub3V0cHV0fWApO1xuICBjb25zb2xlLmxvZyhgICAgdGhlbWVEaXI6ICR7bmV3Q29uZmlnLnRoZW1lRGlyfWApO1xuICBpZiAobmV3Q29uZmlnLnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIHVzZXJuYW1lOiAke25ld0NvbmZpZy51c2VybmFtZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgcGFzc3dvcmQ6ICoqKipgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgXFxu8J+SoSBFZGl0IHRoaXMgZmlsZSB0byBjb25maWd1cmUgeW91ciBIYW5kb2ZmIEFQSSBzZXR0aW5ncy5cXG5gKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGhlbHBlclxuICovXG5jb25zdCBwcm9tcHQgPSAocXVlc3Rpb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IHJlYWRsaW5lID0gcmVxdWlyZSgncmVhZGxpbmUnKTtcbiAgY29uc3QgcmwgPSByZWFkbGluZS5jcmVhdGVJbnRlcmZhY2Uoe1xuICAgIGlucHV0OiBwcm9jZXNzLnN0ZGluLFxuICAgIG91dHB1dDogcHJvY2Vzcy5zdGRvdXQsXG4gIH0pO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgcmwucXVlc3Rpb24ocXVlc3Rpb24sIChhbnN3ZXI6IHN0cmluZykgPT4ge1xuICAgICAgcmwuY2xvc2UoKTtcbiAgICAgIHJlc29sdmUoYW5zd2VyLnRyaW0oKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIHllcy9ub1xuICovXG5jb25zdCBwcm9tcHRZZXNObyA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTdHIgPSBkZWZhdWx0VmFsdWUgPyAnWS9uJyA6ICd5L04nO1xuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYCR7cXVlc3Rpb259IFske2RlZmF1bHRTdHJ9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICByZXR1cm4gYW5zd2VyLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgneScpO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgd2l0aCBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdENob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSwgZGVmYXVsdEluZGV4OiBudW1iZXIgPSAwKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc3QgbWFya2VyID0gaSA9PT0gZGVmYXVsdEluZGV4ID8gJz4nIDogJyAnO1xuICAgIGNvbnNvbGUubG9nKGAgICR7bWFya2VyfSAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXIgWyR7ZGVmYXVsdEluZGV4ICsgMX1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG4gIFxuICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGFuc3dlciwgMTApIC0gMTtcbiAgaWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCBjaG9pY2VzLmxlbmd0aCkge1xuICAgIHJldHVybiBjaG9pY2VzW2luZGV4XTtcbiAgfVxuICByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIG11bHRpcGxlIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0TXVsdGlDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGAgICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlcnMgc2VwYXJhdGVkIGJ5IGNvbW1hcyAoZS5nLiwgMSwyLDMpIG9yICdhbGwnOiBgKTtcbiAgaWYgKGFuc3dlci50b0xvd2VyQ2FzZSgpID09PSAnYWxsJykgcmV0dXJuIGNob2ljZXM7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gW2Nob2ljZXNbMF1dO1xuICBcbiAgY29uc3QgaW5kaWNlcyA9IGFuc3dlci5zcGxpdCgnLCcpLm1hcChzID0+IHBhcnNlSW50KHMudHJpbSgpLCAxMCkgLSAxKTtcbiAgcmV0dXJuIGluZGljZXNcbiAgICAuZmlsdGVyKGkgPT4gaSA+PSAwICYmIGkgPCBjaG9pY2VzLmxlbmd0aClcbiAgICAubWFwKGkgPT4gY2hvaWNlc1tpXSk7XG59O1xuXG4vKipcbiAqIEZpbmQgYWxsIGFycmF5IHByb3BlcnRpZXMgaW4gYSBjb21wb25lbnRcbiAqL1xuY29uc3QgZmluZEFycmF5UHJvcGVydGllcyA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPT4ge1xuICBjb25zdCBhcnJheXM6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIGFycmF5cy5wdXNoKHsgcGF0aCwgcHJvcGVydHkgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3RzXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdvYmplY3QnICYmIHByb3BlcnR5LnByb3BlcnRpZXMpIHtcbiAgICAgIGFycmF5cy5wdXNoKC4uLmZpbmRBcnJheVByb3BlcnRpZXMocHJvcGVydHkucHJvcGVydGllcywgcGF0aCkpO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGFycmF5cztcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZmllbGQgbWFwcGluZyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBhcnJheSBpdGVtIHByb3BlcnRpZXNcbiAqL1xuY29uc3Qgc3VnZ2VzdEZpZWxkTWFwcGluZ3MgPSAoaXRlbVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0+IHtcbiAgY29uc3Qgc3VnZ2VzdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIGNvbnN0IG1hcFByb3BlcnR5ID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICBcbiAgICAgIC8vIFN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gY29tbW9uIHBhdHRlcm5zXG4gICAgICBjb25zdCBsb3dlcktleSA9IGtleS50b0xvd2VyQ2FzZSgpO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdpbWFnZScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdwaG90bycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0aHVtYm5haWwnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdmZWF0dXJlZF9pbWFnZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndGl0bGUnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdoZWFkaW5nJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ25hbWUnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X3RpdGxlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2V4Y2VycHQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnc3VtbWFyeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdkZXNjcmlwdGlvbicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZXhjZXJwdCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjb250ZW50JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2JvZHknKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2NvbnRlbnQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3VybCcgfHwgbG93ZXJLZXkgPT09ICdocmVmJyB8fCBsb3dlcktleS5pbmNsdWRlcygnbGluaycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Blcm1hbGluayc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXRlJykpIHtcbiAgICAgICAgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXknKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpkYXlfbnVtZXJpYyc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ21vbnRoJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6bW9udGhfc2hvcnQnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCd5ZWFyJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6eWVhcic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmZ1bGwnO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdhdXRob3InKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdhdXRob3IubmFtZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjYXRlZ29yeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0YWcnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICd0YXhvbm9teTpjYXRlZ29yeSc7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBuZXN0ZWQgb2JqZWN0c1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIG1hcFByb3BlcnR5KHByb3AucHJvcGVydGllcywgcGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBcbiAgbWFwUHJvcGVydHkoaXRlbVByb3BlcnRpZXMpO1xuICByZXR1cm4gc3VnZ2VzdGlvbnM7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHdpemFyZCBmb3IgY29uZmlndXJpbmcgZHluYW1pYyBhcnJheXNcbiAqL1xuY29uc3QgY29uZmlndXJlRHluYW1pY0FycmF5cyA9IGFzeW5jIChcbiAgYXBpVXJsOiBzdHJpbmcsXG4gIGNvbXBvbmVudE5hbWU6IHN0cmluZyxcbiAgYXV0aD86IEF1dGhDcmVkZW50aWFsc1xuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn6eZIER5bmFtaWMgQXJyYXkgQ29uZmlndXJhdGlvbiBXaXphcmRgKTtcbiAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudDogJHtjb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1cXG5gKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgc3RydWN0dXJlLi4uYCk7XG4gIGxldCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQ7XG4gIHRyeSB7XG4gICAgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgLy8gRmluZCBhcnJheSBwcm9wZXJ0aWVzXG4gIGNvbnN0IGFycmF5UHJvcHMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgXG4gIGlmIChhcnJheVByb3BzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIE5vIGFycmF5IHByb3BlcnRpZXMgZm91bmQgaW4gdGhpcyBjb21wb25lbnQuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIER5bmFtaWMgYXJyYXlzIGFyZSBvbmx5IGF2YWlsYWJsZSBmb3IgYXJyYXktdHlwZSBwcm9wZXJ0aWVzLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHthcnJheVByb3BzLmxlbmd0aH0gYXJyYXkgZmllbGQocyk6YCk7XG4gIGFycmF5UHJvcHMuZm9yRWFjaCgoYXJyLCBpKSA9PiB7XG4gICAgY29uc3QgaXRlbUNvdW50ID0gYXJyLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzID8gT2JqZWN0LmtleXMoYXJyLnByb3BlcnR5Lml0ZW1zLnByb3BlcnRpZXMpLmxlbmd0aCA6IDA7XG4gICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2Fyci5wYXRofSAoJHtpdGVtQ291bnR9IGl0ZW0gcHJvcGVydGllcylgKTtcbiAgfSk7XG4gIFxuICAvLyBTZWxlY3Qgd2hpY2ggYXJyYXlzIHRvIGNvbmZpZ3VyZVxuICBjb25zdCBzZWxlY3RlZEFycmF5cyA9IGFycmF5UHJvcHMubGVuZ3RoID09PSAxIFxuICAgID8gW2FycmF5UHJvcHNbMF1dXG4gICAgOiBhd2FpdCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBjaG9pY2VzID0gYXJyYXlQcm9wcy5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdE11bHRpQ2hvaWNlKCdXaGljaCBhcnJheShzKSBkbyB5b3Ugd2FudCB0byBjb25maWd1cmU/JywgY2hvaWNlcyk7XG4gICAgICAgIHJldHVybiBhcnJheVByb3BzLmZpbHRlcihhID0+IHNlbGVjdGVkLmluY2x1ZGVzKGEucGF0aCkpO1xuICAgICAgfSkoKTtcbiAgXG4gIC8vIExvYWQgZXhpc3RpbmcgY29uZmlnXG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgbGV0IGV4aXN0aW5nQ29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7fTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgZXhpc3RpbmdDb25maWcgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhjb25maWdQYXRoLCAndXRmLTgnKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBJZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgfVxuICB9XG4gIFxuICAvLyBCdWlsZCB0aGUgaW1wb3J0IGNvbmZpZywgcHJlc2VydmluZyBleGlzdGluZyBlbnRyaWVzXG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0gZXhpc3RpbmdDb25maWcuaW1wb3J0IHx8IHsgZWxlbWVudDogZmFsc2UgfTtcbiAgaWYgKCFpbXBvcnRDb25maWcuYmxvY2sgfHwgdHlwZW9mIGltcG9ydENvbmZpZy5ibG9jayA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0ge307XG4gIH1cbiAgY29uc3QgYmxvY2tDb25maWcgPSBpbXBvcnRDb25maWcuYmxvY2sgYXMgUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPjtcbiAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID09PSAnYm9vbGVhbicpIHtcbiAgICBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID0ge307XG4gIH1cbiAgY29uc3QgY29tcG9uZW50RmllbGRDb25maWcgPSBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIGFzIFJlY29yZDxzdHJpbmcsIEZpZWxkQ29uZmlnPjtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUG9zdHNBcnJheSA9IGFzeW5jIChhcnJheVByb3A6IHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0pOiBQcm9taXNlPER5bmFtaWNBcnJheUNvbmZpZz4gPT4ge1xuICAgIC8vIFNlbGVjdGlvbiBtb2RlXG4gICAgY29uc3Qgc2VsZWN0aW9uTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHVzZXJzIHNlbGVjdCBwb3N0cz8nLFxuICAgICAgWydRdWVyeSBCdWlsZGVyIChmaWx0ZXIgYnkgdGF4b25vbXksIG9yZGVyLCBldGMuKScsICdNYW51YWwgU2VsZWN0aW9uIChoYW5kLXBpY2sgc3BlY2lmaWMgcG9zdHMpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc1F1ZXJ5TW9kZSA9IHNlbGVjdGlvbk1vZGUuaW5jbHVkZXMoJ1F1ZXJ5Jyk7XG5cbiAgICAvLyBQb3N0IHR5cGVzXG4gICAgY29uc29sZS5sb2coYFxcbkVudGVyIGFsbG93ZWQgcG9zdCB0eXBlcyAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCBwb3N0VHlwZXNJbnB1dCA9IGF3YWl0IHByb21wdChgUG9zdCB0eXBlcyBbcG9zdF06IGApO1xuICAgIGNvbnN0IHBvc3RUeXBlcyA9IHBvc3RUeXBlc0lucHV0XG4gICAgICA/IHBvc3RUeXBlc0lucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3QnXTtcblxuICAgIC8vIE1heCBpdGVtc1xuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gaXRlbXMgWzEyXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogMTI7XG5cbiAgICAvLyBSZW5kZXIgbW9kZVxuICAgIGNvbnN0IHJlbmRlck1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCBwb3N0cyBiZSByZW5kZXJlZD8nLFxuICAgICAgWydNYXBwZWQgKGNvbnZlcnQgcG9zdCBmaWVsZHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlKScsICdUZW1wbGF0ZSAodXNlIGEgUEhQIHRlbXBsYXRlIGZpbGUpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc01hcHBlZE1vZGUgPSByZW5kZXJNb2RlLmluY2x1ZGVzKCdNYXBwZWQnKTtcblxuICAgIGxldCBmaWVsZE1hcHBpbmc6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICBsZXQgdGVtcGxhdGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoaXNNYXBwZWRNb2RlKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TiiBGaWVsZCBNYXBwaW5nIENvbmZpZ3VyYXRpb25gKTtcblxuICAgICAgY29uc3QgaXRlbVByb3BzID0gYXJyYXlQcm9wLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGl0ZW1Qcm9wcykge1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IHN1Z2dlc3RGaWVsZE1hcHBpbmdzKGl0ZW1Qcm9wcyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYFxcbkknbGwgc3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBmaWVsZCBuYW1lcy4gUHJlc3MgRW50ZXIgdG8gYWNjZXB0IG9yIHR5cGUgYSBuZXcgdmFsdWUuYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5BdmFpbGFibGUgc291cmNlczpgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X3RpdGxlLCBwb3N0X2V4Y2VycHQsIHBvc3RfY29udGVudCwgcGVybWFsaW5rLCBwb3N0X2lkYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gZmVhdHVyZWRfaW1hZ2VgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X2RhdGU6ZGF5LCBwb3N0X2RhdGU6bW9udGhfc2hvcnQsIHBvc3RfZGF0ZTp5ZWFyLCBwb3N0X2RhdGU6ZnVsbGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGF1dGhvci5uYW1lLCBhdXRob3IudXJsLCBhdXRob3IuYXZhdGFyYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gdGF4b25vbXk6Y2F0ZWdvcnksIHRheG9ub215OnBvc3RfdGFnYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gbWV0YTpmaWVsZF9uYW1lYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gKGxlYXZlIGVtcHR5IHRvIHNraXApXFxuYCk7XG5cbiAgICAgICAgY29uc3QgZmxhdHRlblByb3BzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgIGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICAgICAgICBjb25zdCBwID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2goLi4uZmxhdHRlblByb3BzKHByb3AucHJvcGVydGllcywgcCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaChwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHBhdGhzO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoY29uc3QgZmllbGRQYXRoIG9mIGZsYXR0ZW5Qcm9wcyhpdGVtUHJvcHMpKSB7XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9IHN1Z2dlc3Rpb25zW2ZpZWxkUGF0aF0gfHwgJyc7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFN0ciA9IHN1Z2dlc3Rpb24gPyBgIFske3N1Z2dlc3Rpb259XWAgOiAnJztcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gYXdhaXQgcHJvbXB0KGAgICR7ZmllbGRQYXRofSR7ZGVmYXVsdFN0cn06IGApO1xuICAgICAgICAgIGNvbnN0IGZpbmFsTWFwcGluZyA9IG1hcHBpbmcgfHwgc3VnZ2VzdGlvbjtcbiAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nKSB7XG4gICAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nLnN0YXJ0c1dpdGgoJ3snKSkge1xuICAgICAgICAgICAgICB0cnkgeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IEpTT04ucGFyc2UoZmluYWxNYXBwaW5nKTsgfVxuICAgICAgICAgICAgICBjYXRjaCB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nOyB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZGVmYXVsdFRlbXBsYXRlID0gYHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvJHthcnJheVByb3AucGF0aH0taXRlbS5waHBgO1xuICAgICAgdGVtcGxhdGVQYXRoID0gYXdhaXQgcHJvbXB0KGBUZW1wbGF0ZSBwYXRoIFske2RlZmF1bHRUZW1wbGF0ZX1dOiBgKSB8fCBkZWZhdWx0VGVtcGxhdGU7XG4gICAgfVxuXG4gICAgY29uc3QgYXJyYXlDb25maWc6IER5bmFtaWNBcnJheUNvbmZpZyA9IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBwb3N0VHlwZXMsXG4gICAgICBzZWxlY3Rpb25Nb2RlOiBpc1F1ZXJ5TW9kZSA/ICdxdWVyeScgOiAnbWFudWFsJyxcbiAgICAgIG1heEl0ZW1zLFxuICAgICAgcmVuZGVyTW9kZTogaXNNYXBwZWRNb2RlID8gJ21hcHBlZCcgOiAndGVtcGxhdGUnLFxuICAgIH07XG4gICAgaWYgKGlzTWFwcGVkTW9kZSAmJiBPYmplY3Qua2V5cyhmaWVsZE1hcHBpbmcpLmxlbmd0aCA+IDApIGFycmF5Q29uZmlnLmZpZWxkTWFwcGluZyA9IGZpZWxkTWFwcGluZztcbiAgICBpZiAoIWlzTWFwcGVkTW9kZSAmJiB0ZW1wbGF0ZVBhdGgpIGFycmF5Q29uZmlnLnRlbXBsYXRlUGF0aCA9IHRlbXBsYXRlUGF0aDtcbiAgICBpZiAoaXNRdWVyeU1vZGUpIHtcbiAgICAgIGFycmF5Q29uZmlnLmRlZmF1bHRRdWVyeUFyZ3MgPSB7XG4gICAgICAgIHBvc3RzX3Blcl9wYWdlOiBNYXRoLm1pbihtYXhJdGVtcywgNiksXG4gICAgICAgIG9yZGVyYnk6ICdkYXRlJyxcbiAgICAgICAgb3JkZXI6ICdERVNDJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBhcnJheUNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIEJyZWFkY3J1bWJzQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8QnJlYWRjcnVtYnNBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBCcmVhZGNydW1icyBhcmUgYnVpbHQgYXV0b21hdGljYWxseSBmcm9tIHRoZSBjdXJyZW50IHBhZ2UgVVJMLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHdpbGwgc2hvdyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAnYnJlYWRjcnVtYnMnIH07XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBUYXhvbm9teUFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlVGF4b25vbXlBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPFRheG9ub215QXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgVGF4b25vbXkgdGVybXMgYXJlIGZldGNoZWQgZnJvbSB0aGUgY3VycmVudCBwb3N0IHNlcnZlci1zaWRlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgdG9nZ2xlIGFuZCBhIGRyb3Bkb3duIHRvIGNob29zZSB0aGUgdGF4b25vbXkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIHNsdWcgfVxcbmApO1xuXG4gICAgY29uc29sZS5sb2coYEVudGVyIHRoZSB0YXhvbm9teSBzbHVncyBlZGl0b3JzIGNhbiBjaG9vc2UgZnJvbSAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCB0YXhvbm9teUlucHV0ID0gYXdhaXQgcHJvbXB0KGBUYXhvbm9taWVzIFtwb3N0X3RhZyxjYXRlZ29yeV06IGApO1xuICAgIGNvbnN0IHRheG9ub21pZXMgPSB0YXhvbm9teUlucHV0XG4gICAgICA/IHRheG9ub215SW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdF90YWcnLCAnY2F0ZWdvcnknXTtcblxuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gdGVybXMgdG8gZGlzcGxheSAoLTEgPSBhbGwpIFstMV06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IC0xO1xuXG4gICAgY29uc3QgY29uZmlnOiBUYXhvbm9teUFycmF5Q29uZmlnID0geyBhcnJheVR5cGU6ICd0YXhvbm9teScsIHRheG9ub21pZXMgfTtcbiAgICBpZiAobWF4SXRlbXMgPiAwKSBjb25maWcubWF4SXRlbXMgPSBtYXhJdGVtcztcbiAgICByZXR1cm4gY29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgUGFnaW5hdGlvbkFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5ID0gYXN5bmMgKG90aGVyQXJyYXlQYXRoczogc3RyaW5nW10pOiBQcm9taXNlPFBhZ2luYXRpb25BcnJheUNvbmZpZyB8IG51bGw+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgUGFnaW5hdGlvbiBsaW5rcyBhcmUgZGVyaXZlZCBhdXRvbWF0aWNhbGx5IGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5IHF1ZXJ5LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcblxuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pqg77iPICBObyBzaWJsaW5nIGFycmF5cyBmb3VuZCB0byBjb25uZWN0IHRvLiBDb25maWd1cmUgYSBwb3N0cyBhcnJheSBmaXJzdC5gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBjb25uZWN0ZWRGaWVsZDogc3RyaW5nO1xuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IG90aGVyQXJyYXlQYXRoc1swXTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb25uZWN0ZWQgdG86ICR7Y29ubmVjdGVkRmllbGR9IChvbmx5IG9wdGlvbilgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgICAnV2hpY2ggcG9zdHMgYXJyYXkgc2hvdWxkIHRoaXMgcGFnaW5hdGlvbiBiZSBjb25uZWN0ZWQgdG8/JyxcbiAgICAgICAgb3RoZXJBcnJheVBhdGhzLFxuICAgICAgICAwXG4gICAgICApO1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBjaG9pY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAncGFnaW5hdGlvbicsIGNvbm5lY3RlZEZpZWxkIH07XG4gIH07XG5cbiAgLy8gQ29uZmlndXJlIGVhY2ggc2VsZWN0ZWQgYXJyYXlcbiAgZm9yIChjb25zdCBhcnJheVByb3Agb2Ygc2VsZWN0ZWRBcnJheXMpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvbmZpZ3VyaW5nOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1cXG5gKTtcblxuICAgIC8vIExldCB0aGUgdXNlciBjaG9vc2UgdGhlIGFycmF5IHR5cGVcbiAgICBjb25zdCBhcnJheVR5cGVDaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnV2hhdCBraW5kIG9mIGRhdGEgc2hvdWxkIHRoaXMgYXJyYXkgY29udGFpbj8nLFxuICAgICAgW1xuICAgICAgICAnUG9zdHMg4oCUIHF1ZXJ5IG9yIGhhbmQtcGljayBXb3JkUHJlc3MgcG9zdHMgKGRlZmF1bHQpJyxcbiAgICAgICAgJ0JyZWFkY3J1bWJzIOKAlCBhdXRvLWdlbmVyYXRlZCB0cmFpbCBmcm9tIGN1cnJlbnQgVVJMJyxcbiAgICAgICAgJ1RheG9ub215IOKAlCB0ZXJtcyBhdHRhY2hlZCB0byB0aGUgY3VycmVudCBwb3N0JyxcbiAgICAgICAgJ1BhZ2luYXRpb24g4oCUIGxpbmtzIGRlcml2ZWQgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXknLFxuICAgICAgXSxcbiAgICAgIDBcbiAgICApO1xuXG4gICAgbGV0IGFycmF5Q29uZmlnOiBGaWVsZENvbmZpZyB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdCcmVhZGNydW1icycpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdUYXhvbm9teScpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdQYWdpbmF0aW9uJykpIHtcbiAgICAgIC8vIE9mZmVyIHRoZSBvdGhlciBhbHJlYWR5LWNvbmZpZ3VyZWQgKG9yIHlldC10by1iZS1jb25maWd1cmVkKSBhcnJheSBwYXRocyBhcyBjYW5kaWRhdGVzXG4gICAgICBjb25zdCBzaWJsaW5nID0gc2VsZWN0ZWRBcnJheXNcbiAgICAgICAgLmZpbHRlcihhID0+IGEucGF0aCAhPT0gYXJyYXlQcm9wLnBhdGgpXG4gICAgICAgIC5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkoc2libGluZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFBvc3RzXG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBvc3RzQXJyYXkoYXJyYXlQcm9wKTtcbiAgICB9XG5cbiAgICBpZiAoYXJyYXlDb25maWcpIHtcbiAgICAgIGNvbXBvbmVudEZpZWxkQ29uZmlnW2FycmF5UHJvcC5wYXRoXSA9IGFycmF5Q29uZmlnO1xuICAgICAgY29uc29sZS5sb2coYFxcbuKchSBDb25maWd1cmVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH0gKCR7KGFycmF5Q29uZmlnIGFzIGFueSkuYXJyYXlUeXBlID8/ICdwb3N0cyd9KWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBTa2lwcGVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1gKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFVwZGF0ZSBjb25maWcgZmlsZSDigJQgcmVtb3ZlIGxlZ2FjeSBkeW5hbWljQXJyYXlzIGlmIHByZXNlbnRcbiAgY29uc3QgeyBkeW5hbWljQXJyYXlzOiBfbGVnYWN5RHluYW1pYywgLi4ucmVzdENvbmZpZyB9ID0gZXhpc3RpbmdDb25maWc7XG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIC4uLnJlc3RDb25maWcsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gIH07XG4gIFxuICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uIFByZXZpZXc6XFxuYCk7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHsgaW1wb3J0OiBpbXBvcnRDb25maWcgfSwgbnVsbCwgMikpO1xuICBcbiAgY29uc3Qgc2hvdWxkU2F2ZSA9IGF3YWl0IHByb21wdFllc05vKCdcXG5TYXZlIHRvIGhhbmRvZmYtd3AuY29uZmlnLmpzb24/JywgdHJ1ZSk7XG4gIFxuICBpZiAoc2hvdWxkU2F2ZSkge1xuICAgIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyFIFNhdmVkIHRvICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBOZXh0IHN0ZXBzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICAxLiBSdW46IG5wbSBydW4gZGV2IC0tICR7Y29tcG9uZW50TmFtZX0gLS1mb3JjZWApO1xuICAgIGNvbnNvbGUubG9nKGAgICAyLiBCdWlsZCB5b3VyIGJsb2NrczogY2QgZGVtby9wbHVnaW4gJiYgbnBtIHJ1biBidWlsZGApO1xuICAgIGNvbnNvbGUubG9nKGAgICAzLiBUZXN0IHRoZSBibG9jayBpbiBXb3JkUHJlc3NcXG5gKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWd1cmF0aW9uIG5vdCBzYXZlZC4gQ29weSB0aGUgSlNPTiBhYm92ZSBtYW51YWxseSBpZiBuZWVkZWQuXFxuYCk7XG4gIH1cbn07XG5cbi8vIENvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdjb25maWd1cmUtZHluYW1pYyBbY29tcG9uZW50XScpXG4gIC5hbGlhcygnd2l6YXJkJylcbiAgLmRlc2NyaXB0aW9uKCdJbnRlcmFjdGl2ZSB3aXphcmQgdG8gY29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGZvciBhIGNvbXBvbmVudCcpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctbCwgLS1saXN0JywgJ0xpc3QgYXZhaWxhYmxlIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMnKVxuICAuYWN0aW9uKGFzeW5jIChjb21wb25lbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdHM6IHtcbiAgICBhcGlVcmw/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgbGlzdD86IGJvb2xlYW47XG4gIH0pID0+IHtcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIFxuICAgIC8vIElmIGxpc3RpbmcgY29tcG9uZW50cywgc2hvdyBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzXG4gICAgaWYgKG9wdHMubGlzdCB8fCAhY29tcG9uZW50TmFtZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbvCflI0gRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QgZnJvbSAke2FwaVVybH0uLi5cXG5gKTtcbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICAgIFxuICAgICAgICAvLyBGZXRjaCBlYWNoIGNvbXBvbmVudCB0byBmaW5kIG9uZXMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzLiBDaGVja2luZyBmb3IgYXJyYXkgZmllbGRzLi4uXFxuYCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjb21wb25lbnRzV2l0aEFycmF5czogQXJyYXk8eyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBhcnJheXM6IHN0cmluZ1tdIH0+ID0gW107XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGlkLCBhdXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGFycmF5cyA9IGZpbmRBcnJheVByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgaWYgKGFycmF5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGNvbXBvbmVudHNXaXRoQXJyYXlzLnB1c2goe1xuICAgICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICAgIHRpdGxlOiBjb21wb25lbnQudGl0bGUsXG4gICAgICAgICAgICAgICAgYXJyYXlzOiBhcnJheXMubWFwKGEgPT4gYS5wYXRoKSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBTa2lwIGZhaWxlZCBjb21wb25lbnRzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoY29tcG9uZW50c1dpdGhBcnJheXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgTm8gY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkcyBmb3VuZC5cXG5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn6epIENvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHM6XFxuYCk7XG4gICAgICAgIGNvbXBvbmVudHNXaXRoQXJyYXlzLmZvckVhY2goKGMsIGkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpICsgMX0uICR7Yy50aXRsZX0gKCR7Yy5pZH0pYCk7XG4gICAgICAgICAgYy5hcnJheXMuZm9yRWFjaChhID0+IGNvbnNvbGUubG9nKGAgICAgICDilJTilIAgJHthfWApKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBpZiAob3B0cy5saXN0KSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYFxcbvCfkqEgUnVuOiBucG0gcnVuIGRldiAtLSB3aXphcmQgPGNvbXBvbmVudC1pZD5cXG5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEludGVyYWN0aXZlIHNlbGVjdGlvblxuICAgICAgICBjb25zdCBjaG9pY2VzID0gY29tcG9uZW50c1dpdGhBcnJheXMubWFwKGMgPT4gYCR7Yy50aXRsZX0gKCR7Yy5pZH0pYCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcHJvbXB0Q2hvaWNlKCdcXG5TZWxlY3QgYSBjb21wb25lbnQgdG8gY29uZmlndXJlOicsIGNob2ljZXMsIDApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZEluZGV4ID0gY2hvaWNlcy5pbmRleE9mKHNlbGVjdGVkKTtcbiAgICAgICAgY29tcG9uZW50TmFtZSA9IGNvbXBvbmVudHNXaXRoQXJyYXlzW3NlbGVjdGVkSW5kZXhdLmlkO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGF3YWl0IGNvbmZpZ3VyZUR5bmFtaWNBcnJheXMoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgfSk7XG5cbi8vIEluaXQgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnaW5pdCcpXG4gIC5kZXNjcmlwdGlvbignQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy0tb3V0cHV0IDxkaXI+JywgJ091dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcycpXG4gIC5vcHRpb24oJy0tdGhlbWUtZGlyIDxkaXI+JywgJ1RoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMnKVxuICAub3B0aW9uKCctLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdPdmVyd3JpdGUgZXhpc3RpbmcgY29uZmlnIGZpbGUnKVxuICAuYWN0aW9uKChvcHRpb25zLCBjb21tYW5kKSA9PiB7XG4gICAgLy8gVXNlIG9wdHNXaXRoR2xvYmFscyB0byBnZXQgb3B0aW9ucyBmcm9tIGJvdGggc3ViY29tbWFuZCBhbmQgcGFyZW50XG4gICAgY29uc3Qgb3B0cyA9IGNvbW1hbmQub3B0c1dpdGhHbG9iYWxzKCk7XG4gICAgaW5pdENvbmZpZyhvcHRzKTtcbiAgfSk7XG5cbi8vIERlZmF1bHQgY29tbWFuZCBmb3IgYmxvY2tzXG5wcm9ncmFtXG4gIC5hcmd1bWVudCgnW2NvbXBvbmVudF0nLCAnQ29tcG9uZW50IG5hbWUgdG8gY29tcGlsZSBvciB2YWxpZGF0ZScpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCBgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6ICR7Y29uZmlnLmFwaVVybH0pYClcbiAgLm9wdGlvbignLW8sIC0tb3V0cHV0IDxkaXI+JywgYE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogJHtjb25maWcub3V0cHV0fSlgKVxuICAub3B0aW9uKCctLWFsbCcsICdDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50cycpXG4gIC5vcHRpb24oJy0tdGhlbWUnLCAnQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKSB0byB0aGVtZSBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctdCwgLS10aGVtZS1kaXIgPGRpcj4nLCBgVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcyAoZGVmYXVsdDogJHtjb25maWcudGhlbWVEaXJ9KWApXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZSBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZScsICdWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUtYWxsJywgJ1ZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdGb3JjZSBjb21waWxhdGlvbiBldmVuIHdpdGggYnJlYWtpbmcgY2hhbmdlcycpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czogeyBcbiAgICBhcGlVcmw/OiBzdHJpbmc7IFxuICAgIG91dHB1dD86IHN0cmluZzsgXG4gICAgYWxsPzogYm9vbGVhbjsgXG4gICAgdGhlbWU/OiBib29sZWFuO1xuICAgIHRoZW1lRGlyPzogc3RyaW5nO1xuICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgIHBhc3N3b3JkPzogc3RyaW5nO1xuICAgIHZhbGlkYXRlPzogYm9vbGVhbjtcbiAgICB2YWxpZGF0ZUFsbD86IGJvb2xlYW47XG4gICAgZm9yY2U/OiBib29sZWFuO1xuICB9KSA9PiB7XG4gICAgLy8gTWVyZ2UgQ0xJIG9wdGlvbnMgd2l0aCBjb25maWcgKENMSSB0YWtlcyBwcmVjZWRlbmNlKVxuICAgIGNvbnN0IGFwaVVybCA9IG9wdHMuYXBpVXJsID8/IGNvbmZpZy5hcGlVcmw7XG4gICAgY29uc3Qgb3V0cHV0ID0gb3B0cy5vdXRwdXQgPz8gY29uZmlnLm91dHB1dDtcbiAgICBjb25zdCB0aGVtZURpciA9IG9wdHMudGhlbWVEaXIgPz8gY29uZmlnLnRoZW1lRGlyO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIFxuICAgIC8vIFZhbGlkYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy52YWxpZGF0ZUFsbCkge1xuICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoYXBpVXJsLCBvdXRwdXQsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICBpZiAob3B0cy52YWxpZGF0ZSAmJiBjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShhcGlVcmwsIG91dHB1dCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkICYmICFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy50aGVtZSkge1xuICAgICAgYXdhaXQgY29tcGlsZVRoZW1lKGFwaVVybCwgdGhlbWVEaXIsIGF1dGgpO1xuICAgIH0gZWxzZSBpZiAob3B0cy5hbGwpIHtcbiAgICAgIC8vIFZhbGlkYXRlIGFsbCBmaXJzdCB1bmxlc3MgZm9yY2VkXG4gICAgICBpZiAoIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbvCflI0gUHJlLWNvbXBpbGF0aW9uIHZhbGlkYXRpb24uLi5cXG5gKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB2YWxpZGF0ZUFsbChhcGlVcmwsIG91dHB1dCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIHZhbGlkYXRlQWxsIGV4aXRzIHdpdGggY29kZSAxIG9uIGJyZWFraW5nIGNoYW5nZXNcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGNvbXBpbGVBbGwoYXBpVXJsLCBvdXRwdXQsIGF1dGgpO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICAgICAgY29uc29sZS5sb2coYFxcbvCfk50gVXBkYXRpbmcgcHJvcGVydHkgbWFuaWZlc3QuLi5gKTtcbiAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcbiAgICAgICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXQsIGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIFNraXAgZmFpbGVkIGNvbXBvbmVudHNcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYCAgIOKchSBNYW5pZmVzdCB1cGRhdGVkXFxuYCk7XG4gICAgfSBlbHNlIGlmIChjb21wb25lbnROYW1lKSB7XG4gICAgICAvLyBCdWlsZCBtZXJnZWQtZ3JvdXAgbG9va3VwIG9uY2UgZm9yIHRoaXMgYnJhbmNoXG4gICAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgICBpZiAobW9kZSA9PT0gJ21lcmdlZCcpIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIGtleSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhlbHBlcjogY29tcGlsZSBhbiBlbnRpcmUgbWVyZ2VkIGdyb3VwIGJ5IGl0cyBjb25maWcga2V5XG4gICAgICBjb25zdCBjb21waWxlR3JvdXBCeUtleSA9IGFzeW5jIChncm91cEtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0KGFwaVVybCwgYXV0aCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gZ3JvdXBLZXkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50cyBmb3VuZCBmb3IgbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbEdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiBncm91cE1hdGNoZXMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZnVsbCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgYy5pZCwgYXV0aCk7XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGZ1bGwpO1xuICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjLmlkfSAodGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQpYCk7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVsbEdyb3VwQ29tcG9uZW50cy5wdXNoKGZ1bGwpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4p2MIEZhaWxlZCB0byBmZXRjaCAke2MuaWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBlcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBDb3VsZCBub3QgZmV0Y2ggYW55IGNvbXBvbmVudHMgZm9yIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwKGFwaVVybCwgb3V0cHV0LCBncm91cEtleSwgZnVsbEdyb3VwQ29tcG9uZW50cywgYXV0aCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgR3JvdXAgXCIke2dyb3VwS2V5fVwiIGNvbXBpbGVkICgke2Z1bGxHcm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cykuXFxuYCk7XG4gICAgICB9O1xuXG4gICAgICAvLyBUcnkgY29tcG9uZW50IGZpcnN0LCB0aGVuIGZhbGwgYmFjayB0byBncm91cCAoZS5nLiBcImhlcm9cIiAtPiBIZXJvIG1lcmdlZCBibG9jaylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBjb21wb25lbnQgYmVsb25ncyB0byBhIG1lcmdlZCBncm91cCwgY29tcGlsZSB0aGUgd2hvbGUgZ3JvdXAgaW5zdGVhZFxuICAgICAgICBpZiAoY29tcG9uZW50Lmdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGNvbXBvbmVudC5ncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICBpZiAoZ3JvdXBLZXkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICBcIiR7Y29tcG9uZW50TmFtZX1cIiBiZWxvbmdzIHRvIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIg4oCUIGNvbXBpbGluZyBlbnRpcmUgZ3JvdXAuXFxuYCk7XG4gICAgICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoYXBpVXJsLCBvdXRwdXQsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICAgICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGUoe1xuICAgICAgICAgIGFwaVVybCxcbiAgICAgICAgICBvdXRwdXREaXI6IG91dHB1dCxcbiAgICAgICAgICBjb21wb25lbnROYW1lLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgIH0pO1xuICAgICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXQsIGNvbXBvbmVudCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDwn5OdIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICAgIH0gY2F0Y2ggKGNvbXBvbmVudEVycm9yKSB7XG4gICAgICAgIC8vIE5vIGNvbXBvbmVudCB3aXRoIHRoaXMgbmFtZSDigJMgdHJ5IGFzIGdyb3VwXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICBObyBjb21wb25lbnQgXCIke2NvbXBvbmVudE5hbWV9XCIgZm91bmQsIGNoZWNraW5nIGdyb3Vwcy4uLlxcbmApO1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgZmV0Y2hBbGxDb21wb25lbnRzTGlzdChhcGlVcmwsIGF1dGgpO1xuICAgICAgICBjb25zdCBuYW1lTG93ZXIgPSBjb21wb25lbnROYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gbmFtZUxvd2VyLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnQgb3IgZ3JvdXAgZm91bmQgZm9yIFwiJHtjb21wb25lbnROYW1lfVwiLmApO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgICAgICBDb21wb25lbnQgZmV0Y2g6ICR7Y29tcG9uZW50RXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGNvbXBvbmVudEVycm9yLm1lc3NhZ2UgOiBjb21wb25lbnRFcnJvcn1gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgICAgIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQobmFtZUxvd2VyKSA/PyBncm91cE1hdGNoZXNbMF0uZ3JvdXA7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IFBsZWFzZSBzcGVjaWZ5IGEgY29tcG9uZW50IG5hbWUsIGdyb3VwIG5hbWUsIHVzZSAtLWFsbCBmbGFnLCAtLXRoZW1lIGZsYWcsIG9yIC0tdmFsaWRhdGUtYWxsIGZsYWcnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG5Vc2FnZTonKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+ICAgQ29tcGlsZSBvbmUgY29tcG9uZW50IChlLmcuIGhlcm8tYXJ0aWNsZSknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Z3JvdXAtbmFtZT4gICAgICBPciBjb21waWxlIGEgbWVyZ2VkIGdyb3VwIChlLmcuIGhlcm8pJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXRoZW1lJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZSBoZXJvLWFydGljbGUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsIC0tZm9yY2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSBoZXJvIC0tYXBpLXVybCBodHRwOi8vbG9jYWxob3N0OjQwMDAgLS1vdXRwdXQgLi9ibG9ja3MnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH0pO1xuXG5wcm9ncmFtLnBhcnNlKCk7XG5cbmV4cG9ydCB7IGNvbXBpbGUsIGdlbmVyYXRlQmxvY2ssIGZldGNoQ29tcG9uZW50IH07XG4iXX0=