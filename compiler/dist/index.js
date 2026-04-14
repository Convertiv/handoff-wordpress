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
const child_process_1 = require("child_process");
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
 * Generate a package.json in the content directory and run npm install
 * so that blocks and shared components can resolve their imports.
 */
const ensureContentDependencies = (contentRoot) => {
    const pkgPath = path.join(contentRoot, 'package.json');
    const pkg = {
        name: 'handoff-blocks-content',
        version: '1.0.0',
        private: true,
        description: 'Auto-generated by Handoff compiler — block build dependencies.',
        dependencies: {
            '@10up/block-components': '^1.22.1',
        },
        devDependencies: {
            '@wordpress/api-fetch': '*',
            '@wordpress/block-editor': '*',
            '@wordpress/blocks': '*',
            '@wordpress/components': '*',
            '@wordpress/core-data': '*',
            '@wordpress/data': '*',
            '@wordpress/element': '*',
            '@wordpress/i18n': '*',
            '@wordpress/icons': '*',
            '@wordpress/scripts': '^27.0.0',
            'copy-webpack-plugin': '^11.0.0',
        },
    };
    const desired = JSON.stringify(pkg, null, 2) + '\n';
    let needsInstall = true;
    if (fs.existsSync(pkgPath)) {
        const existing = fs.readFileSync(pkgPath, 'utf8');
        if (existing === desired) {
            needsInstall = !fs.existsSync(path.join(contentRoot, 'node_modules'));
        }
    }
    if (needsInstall) {
        console.log(`\n📦 Installing block build dependencies...`);
        fs.writeFileSync(pkgPath, desired);
        try {
            (0, child_process_1.execSync)('npm install --ignore-scripts', {
                cwd: contentRoot,
                stdio: 'inherit',
            });
            console.log(`✅ Dependencies installed in ${contentRoot}`);
        }
        catch (err) {
            console.warn(`⚠️  npm install failed — you may need to run it manually in ${contentRoot}`);
        }
    }
    else {
        console.log(`\n📦 Block build dependencies already up to date`);
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
        indexJs: (0, generators_1.generateIndexJs)(component, componentDynamicArrays, innerBlocksField, deprecationsCode, hasScreenshot),
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
        const pluginRoot = path.resolve(path.dirname(process.argv[1]), '..', '..');
        const pluginSharedDir = path.join(pluginRoot, 'shared');
        const contentRoot = path.resolve(outputDir, '..');
        const targetSharedDir = path.join(contentRoot, 'shared');
        if (fs.existsSync(pluginSharedDir) &&
            path.resolve(pluginSharedDir) !== path.resolve(targetSharedDir)) {
            console.log(`\n⚙️  Copying shared components...`);
            copyDirRecursive(pluginSharedDir, targetSharedDir);
            console.log(`✅ Shared components copied to ${targetSharedDir}`);
        }
        // Generate package.json and install build dependencies so blocks and
        // shared components can resolve @wordpress/* and @10up/* imports.
        ensureContentDependencies(contentRoot);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHlDQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsbURBQXFDO0FBQ3JDLGlEQUF5QztBQUV6QyxtQ0FBZ1M7QUEyQmhTOztHQUVHO0FBQ0gsTUFBTSxjQUFjLEdBQW1CO0lBQ3JDLE1BQU0sRUFBRSx1QkFBdUI7SUFDL0IsTUFBTSxFQUFFLFVBQVU7SUFDbEIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtJQUMxQixNQUFNLEVBQUUsRUFBRTtDQUNYLENBQUM7QUFFRjs7O0dBR0c7QUFDSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsYUFBaUQsRUFBZ0IsRUFBRTtJQUMvRixNQUFNLFlBQVksR0FBaUIsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDdEQsTUFBTSxXQUFXLEdBQTBDLEVBQUUsQ0FBQztJQUU5RCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztZQUFFLFNBQVM7UUFDOUIsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUM7WUFBRSxTQUFTO1FBQzlCLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFF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QUN0RSxNQUFNLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7SUFDSCxDQUFDO1NBQU0sQ0FBQztRQUNOLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEdBQTBHLENBQUMsQ0FBQztRQUMxSCxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0ZBQXNGLENBQUMsQ0FBQztRQUNwRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlGQUFpRixDQUFDLENBQUM7UUFDL0YsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7UUFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUNyRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdGQUFnRixDQUFDLENBQUM7UUFDOUYsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFTCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG4vKipcbiAqIEd1dGVuYmVyZyBDb21waWxlclxuICogXG4gKiBUcmFuc3BpbGVzIEhhbmRvZmYgY29tcG9uZW50cyB0byBXb3JkUHJlc3MgR3V0ZW5iZXJnIGJsb2Nrcy5cbiAqIFxuICogVXNhZ2U6XG4gKiAgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+IFtvcHRpb25zXVxuICogICBcbiAqIE9wdGlvbnM6XG4gKiAgIC0tYXBpLXVybCA8dXJsPiAgICBIYW5kb2ZmIEFQSSBiYXNlIFVSTCAoZGVmYXVsdDogaHR0cDovL2xvY2FsaG9zdDo0MDAwKVxuICogICAtLW91dHB1dCA8ZGlyPiAgICAgT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzIChkZWZhdWx0OiAuL2Jsb2NrcylcbiAqICAgLS1hbGwgICAgICAgICAgICAgIENvbXBpbGUgYWxsIGF2YWlsYWJsZSBjb21wb25lbnRzXG4gKiAgIC0tdGhlbWUgICAgICAgICAgICBDb21waWxlIGhlYWRlci9mb290ZXIgdG8gdGhlbWUgdGVtcGxhdGVzXG4gKiAgIC0tdmFsaWRhdGUgICAgICAgICBWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgY2hhbmdlc1xuICogICAtLXZhbGlkYXRlLWFsbCAgICAgVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqIFxuICogQ29uZmlndXJhdGlvbjpcbiAqICAgQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHlvdXIgcHJvamVjdCByb290IHRvIHNldCBkZWZhdWx0czpcbiAqICAge1xuICogICAgIFwiYXBpVXJsXCI6IFwiaHR0cHM6Ly9kZW1vLmhhbmRvZmYuY29tXCIsXG4gKiAgICAgXCJvdXRwdXRcIjogXCIuL3BhdGgvdG8vYmxvY2tzXCIsXG4gKiAgICAgXCJ0aGVtZURpclwiOiBcIi4vcGF0aC90by90aGVtZVwiXG4gKiAgIH1cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgcHJldHRpZXIgZnJvbSAncHJldHRpZXInO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBDb21waWxlck9wdGlvbnMsIEdlbmVyYXRlZEJsb2NrLCBIYW5kb2ZmV3BDb25maWcsIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBGaWVsZENvbmZpZywgSW1wb3J0Q29uZmlnLCBDb21wb25lbnRJbXBvcnRDb25maWcsIEZpZWxkUHJlZmVyZW5jZXMsIGlzRHluYW1pY0FycmF5Q29uZmlnIH0gZnJvbSAnLi90eXBlcyc7XG5cbi8qKlxuICogQXV0aCBjcmVkZW50aWFscyBmb3IgSFRUUCByZXF1ZXN0c1xuICovXG5pbnRlcmZhY2UgQXV0aENyZWRlbnRpYWxzIHtcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlcXVpcmVkIGNvbmZpZyB3aXRoIGRlZmF1bHRzIGFwcGxpZWRcbiAqL1xuaW50ZXJmYWNlIFJlc29sdmVkQ29uZmlnIHtcbiAgYXBpVXJsOiBzdHJpbmc7XG4gIG91dHB1dDogc3RyaW5nO1xuICB0aGVtZURpcjogc3RyaW5nO1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIGltcG9ydDogSW1wb3J0Q29uZmlnO1xuICBncm91cHM6IFJlY29yZDxzdHJpbmcsICdtZXJnZWQnIHwgJ2luZGl2aWR1YWwnPjtcbiAgc2NoZW1hTWlncmF0aW9ucz86IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHtcbiAgICByZW5hbWVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICB0cmFuc2Zvcm1zPzogUmVjb3JkPHN0cmluZywgeyBmcm9tOiBzdHJpbmc7IHRvOiBzdHJpbmc7IHJ1bGU6IHN0cmluZyB9PjtcbiAgfT4+O1xufVxuXG4vKipcbiAqIERlZmF1bHQgY29uZmlndXJhdGlvbiB2YWx1ZXNcbiAqL1xuY29uc3QgREVGQVVMVF9DT05GSUc6IFJlc29sdmVkQ29uZmlnID0ge1xuICBhcGlVcmw6ICdodHRwOi8vbG9jYWxob3N0OjQwMDAnLFxuICBvdXRwdXQ6ICcuL2Jsb2NrcycsXG4gIHRoZW1lRGlyOiAnLi90aGVtZScsXG4gIHVzZXJuYW1lOiB1bmRlZmluZWQsXG4gIHBhc3N3b3JkOiB1bmRlZmluZWQsXG4gIGltcG9ydDogeyBlbGVtZW50OiBmYWxzZSB9LFxuICBncm91cHM6IHt9LFxufTtcblxuLyoqXG4gKiBNaWdyYXRlIGxlZ2FjeSBgZHluYW1pY0FycmF5c2AgY29uZmlnIHRvIHRoZSBuZXcgYGltcG9ydGAgc3RydWN0dXJlLlxuICogR3JvdXBzIFwiY29tcG9uZW50SWQuZmllbGROYW1lXCIgZW50cmllcyB1bmRlciBpbXBvcnQuYmxvY2tbY29tcG9uZW50SWRdW2ZpZWxkTmFtZV0uXG4gKi9cbmNvbnN0IG1pZ3JhdGVEeW5hbWljQXJyYXlzID0gKGR5bmFtaWNBcnJheXM6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZz4pOiBJbXBvcnRDb25maWcgPT4ge1xuICBjb25zdCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyA9IHsgZWxlbWVudDogZmFsc2UgfTtcbiAgY29uc3QgYmxvY2tDb25maWc6IFJlY29yZDxzdHJpbmcsIENvbXBvbmVudEltcG9ydENvbmZpZz4gPSB7fTtcblxuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoIWNvbmZpZy5lbmFibGVkKSBjb250aW51ZTtcbiAgICBjb25zdCBkb3RJbmRleCA9IGtleS5pbmRleE9mKCcuJyk7XG4gICAgaWYgKGRvdEluZGV4ID09PSAtMSkgY29udGludWU7XG4gICAgY29uc3QgY29tcG9uZW50SWQgPSBrZXkuc3Vic3RyaW5nKDAsIGRvdEluZGV4KTtcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKGRvdEluZGV4ICsgMSk7XG5cbiAgICBpZiAoIWJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSB8fCB0eXBlb2YgYmxvY2tDb25maWdbY29tcG9uZW50SWRdID09PSAnYm9vbGVhbicpIHtcbiAgICAgIGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSA9IHt9O1xuICAgIH1cbiAgICAoYmxvY2tDb25maWdbY29tcG9uZW50SWRdIGFzIFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZz4pW2ZpZWxkTmFtZV0gPSBjb25maWc7XG4gIH1cblxuICBpZiAoT2JqZWN0LmtleXMoYmxvY2tDb25maWcpLmxlbmd0aCA+IDApIHtcbiAgICBpbXBvcnRDb25maWcuYmxvY2sgPSBibG9ja0NvbmZpZztcbiAgfVxuXG4gIHJldHVybiBpbXBvcnRDb25maWc7XG59O1xuXG4vKipcbiAqIExvYWQgY29uZmlndXJhdGlvbiBmcm9tIGhhbmRvZmYtd3AuY29uZmlnLmpzb24gaWYgaXQgZXhpc3RzXG4gKi9cbmNvbnN0IGxvYWRDb25maWcgPSAoKTogSGFuZG9mZldwQ29uZmlnID0+IHtcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhjb25maWdQYXRoLCAndXRmLTgnKTtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY29uZmlnQ29udGVudCkgYXMgSGFuZG9mZldwQ29uZmlnO1xuICAgICAgY29uc29sZS5sb2coYPCfk4QgTG9hZGVkIGNvbmZpZyBmcm9tICR7Y29uZmlnUGF0aH1gKTtcbiAgICAgIHJldHVybiBjb25maWc7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBGYWlsZWQgdG8gcGFyc2UgaGFuZG9mZi13cC5jb25maWcuanNvbjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHt9O1xufTtcblxuLyoqXG4gKiBNZXJnZSBjb25maWd1cmF0aW9uIHNvdXJjZXMgd2l0aCBwcmlvcml0eTogQ0xJID4gY29uZmlnIGZpbGUgPiBkZWZhdWx0c1xuICovXG5jb25zdCBnZXRDb25maWcgPSAoKTogUmVzb2x2ZWRDb25maWcgPT4ge1xuICBjb25zdCBmaWxlQ29uZmlnID0gbG9hZENvbmZpZygpO1xuXG4gIGxldCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZztcbiAgaWYgKGZpbGVDb25maWcuaW1wb3J0KSB7XG4gICAgaW1wb3J0Q29uZmlnID0gZmlsZUNvbmZpZy5pbXBvcnQ7XG4gIH0gZWxzZSBpZiAoZmlsZUNvbmZpZy5keW5hbWljQXJyYXlzKSB7XG4gICAgY29uc29sZS53YXJuKGDimqDvuI8gIFwiZHluYW1pY0FycmF5c1wiIGNvbmZpZyBpcyBkZXByZWNhdGVkLiBNaWdyYXRlIHRvIFwiaW1wb3J0XCIg4oCUIHNlZSBTUEVDSUZJQ0FUSU9OLm1kLmApO1xuICAgIGltcG9ydENvbmZpZyA9IG1pZ3JhdGVEeW5hbWljQXJyYXlzKGZpbGVDb25maWcuZHluYW1pY0FycmF5cyk7XG4gIH0gZWxzZSB7XG4gICAgaW1wb3J0Q29uZmlnID0gREVGQVVMVF9DT05GSUcuaW1wb3J0O1xuICB9XG4gIFxuICByZXR1cm4ge1xuICAgIGFwaVVybDogZmlsZUNvbmZpZy5hcGlVcmwgPz8gREVGQVVMVF9DT05GSUcuYXBpVXJsLFxuICAgIG91dHB1dDogZmlsZUNvbmZpZy5vdXRwdXQgPz8gREVGQVVMVF9DT05GSUcub3V0cHV0LFxuICAgIHRoZW1lRGlyOiBmaWxlQ29uZmlnLnRoZW1lRGlyID8/IERFRkFVTFRfQ09ORklHLnRoZW1lRGlyLFxuICAgIHVzZXJuYW1lOiBmaWxlQ29uZmlnLnVzZXJuYW1lID8/IERFRkFVTFRfQ09ORklHLnVzZXJuYW1lLFxuICAgIHBhc3N3b3JkOiBmaWxlQ29uZmlnLnBhc3N3b3JkID8/IERFRkFVTFRfQ09ORklHLnBhc3N3b3JkLFxuICAgIGltcG9ydDogaW1wb3J0Q29uZmlnLFxuICAgIGdyb3VwczogZmlsZUNvbmZpZy5ncm91cHMgPz8gREVGQVVMVF9DT05GSUcuZ3JvdXBzLFxuICAgIHNjaGVtYU1pZ3JhdGlvbnM6IGZpbGVDb25maWcuc2NoZW1hTWlncmF0aW9ucyxcbiAgfTtcbn07XG5cblxuLyoqXG4gKiBCdWlsZCBIVFRQIHJlcXVlc3Qgb3B0aW9ucyB3aXRoIG9wdGlvbmFsIGJhc2ljIGF1dGhcbiAqL1xuY29uc3QgYnVpbGRSZXF1ZXN0T3B0aW9ucyA9ICh1cmw6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IGh0dHAuUmVxdWVzdE9wdGlvbnMgfCBodHRwcy5SZXF1ZXN0T3B0aW9ucyA9PiB7XG4gIGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodXJsKTtcbiAgY29uc3Qgb3B0aW9uczogaHR0cC5SZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICBob3N0bmFtZTogcGFyc2VkVXJsLmhvc3RuYW1lLFxuICAgIHBvcnQ6IHBhcnNlZFVybC5wb3J0IHx8IChwYXJzZWRVcmwucHJvdG9jb2wgPT09ICdodHRwczonID8gNDQzIDogODApLFxuICAgIHBhdGg6IHBhcnNlZFVybC5wYXRobmFtZSArIHBhcnNlZFVybC5zZWFyY2gsXG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBoZWFkZXJzOiB7fSxcbiAgfTtcbiAgXG4gIGlmIChhdXRoPy51c2VybmFtZSAmJiBhdXRoPy5wYXNzd29yZCkge1xuICAgIGNvbnN0IGNyZWRlbnRpYWxzID0gQnVmZmVyLmZyb20oYCR7YXV0aC51c2VybmFtZX06JHthdXRoLnBhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSB7XG4gICAgICAuLi5vcHRpb25zLmhlYWRlcnMsXG4gICAgICAnQXV0aG9yaXphdGlvbic6IGBCYXNpYyAke2NyZWRlbnRpYWxzfWAsXG4gICAgfTtcbiAgfVxuICBcbiAgcmV0dXJuIG9wdGlvbnM7XG59O1xuXG4vLyBMb2FkIGNvbmZpZyBhdCBzdGFydHVwXG5jb25zdCBjb25maWcgPSBnZXRDb25maWcoKTtcbmltcG9ydCB7XG4gIGdlbmVyYXRlQmxvY2tKc29uLFxuICBnZW5lcmF0ZUluZGV4SnMsXG4gIGdlbmVyYXRlUmVuZGVyUGhwLFxuICBnZW5lcmF0ZUVkaXRvclNjc3MsXG4gIGdlbmVyYXRlU3R5bGVTY3NzLFxuICBnZW5lcmF0ZVJlYWRtZSxcbiAgdG9CbG9ja05hbWUsXG4gIGdlbmVyYXRlSGVhZGVyUGhwLFxuICBnZW5lcmF0ZUZvb3RlclBocCxcbiAgZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAsXG4gIGdlbmVyYXRlQ2F0ZWdvcmllc1BocCxcbiAgZ2VuZXJhdGVTaGFyZWRDb21wb25lbnRzLFxuICBnZW5lcmF0ZU1pZ3JhdGlvblNjaGVtYSxcbiAgZ2VuZXJhdGVNZXJnZWRCbG9jayxcbiAgZ2VuZXJhdGVEZXByZWNhdGlvbnMsXG4gIGdlbmVyYXRlU2NoZW1hQ2hhbmdlbG9nLFxufSBmcm9tICcuL2dlbmVyYXRvcnMnO1xuaW1wb3J0IHR5cGUgeyBWYXJpYW50SW5mbyB9IGZyb20gJy4vZ2VuZXJhdG9ycyc7XG5pbXBvcnQge1xuICBsb2FkTWFuaWZlc3QsXG4gIHNhdmVNYW5pZmVzdCxcbiAgdmFsaWRhdGVDb21wb25lbnQsXG4gIHVwZGF0ZU1hbmlmZXN0LFxuICBnZXRDb21wb25lbnRIaXN0b3J5LFxuICBleHRyYWN0UHJvcGVydGllcyxcbiAgZm9ybWF0VmFsaWRhdGlvblJlc3VsdCxcbiAgVmFsaWRhdGlvblJlc3VsdCxcbiAgdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyxcbiAgZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0XG59IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYUhpc3RvcnkgfSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuXG4vLyBMb2FkIFBIUCBwbHVnaW4gZm9yIFByZXR0aWVyICh1c2luZyByZXF1aXJlIGZvciBjb21wYXRpYmlsaXR5KVxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbmNvbnN0IHBocFBsdWdpbiA9IHJlcXVpcmUoJ0BwcmV0dGllci9wbHVnaW4tcGhwJyk7XG5cbi8qKlxuICogRm9ybWF0IGNvZGUgd2l0aCBQcmV0dGllclxuICovXG5jb25zdCBmb3JtYXRDb2RlID0gYXN5bmMgKGNvZGU6IHN0cmluZywgcGFyc2VyOiAnYmFiZWwnIHwgJ2pzb24nIHwgJ3Njc3MnIHwgJ3BocCcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IG9wdGlvbnM6IHByZXR0aWVyLk9wdGlvbnMgPSB7XG4gICAgICBwYXJzZXIsXG4gICAgICBzaW5nbGVRdW90ZTogdHJ1ZSxcbiAgICAgIHRhYldpZHRoOiAyLFxuICAgICAgcHJpbnRXaWR0aDogMTAwLFxuICAgICAgdHJhaWxpbmdDb21tYTogJ2VzNScsXG4gICAgfTtcbiAgICBcbiAgICAvLyBMb2FkIFBIUCBwbHVnaW4gZm9yIFBIUCBmaWxlc1xuICAgIGlmIChwYXJzZXIgPT09ICdwaHAnKSB7XG4gICAgICBvcHRpb25zLnBsdWdpbnMgPSBbcGhwUGx1Z2luXTtcbiAgICAgIC8vIFBIUC1zcGVjaWZpYyBvcHRpb25zIC0gY2FzdCB0byBhbnkgZm9yIHBsdWdpbi1zcGVjaWZpYyBvcHRpb25zXG4gICAgICAob3B0aW9ucyBhcyBhbnkpLnBocFZlcnNpb24gPSAnOC4wJztcbiAgICAgIChvcHRpb25zIGFzIGFueSkuYnJhY2VTdHlsZSA9ICcxdGJzJztcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGF3YWl0IHByZXR0aWVyLmZvcm1hdChjb2RlLCBvcHRpb25zKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBJZiBmb3JtYXR0aW5nIGZhaWxzLCByZXR1cm4gb3JpZ2luYWwgY29kZVxuICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBQcmV0dGllciBmb3JtYXR0aW5nIGZhaWxlZCBmb3IgJHtwYXJzZXJ9LCB1c2luZyB1bmZvcm1hdHRlZCBjb2RlYCk7XG4gICAgcmV0dXJuIGNvZGU7XG4gIH1cbn07XG5cbmNvbnN0IHByb2dyYW0gPSBuZXcgQ29tbWFuZCgpO1xuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IGNvcHkgYSBkaXJlY3RvcnkgdHJlZSwgY3JlYXRpbmcgdGFyZ2V0IGRpcnMgYXMgbmVlZGVkLlxuICovXG5jb25zdCBjb3B5RGlyUmVjdXJzaXZlID0gKHNyYzogc3RyaW5nLCBkZXN0OiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGRlc3QpKSB7XG4gICAgZnMubWtkaXJTeW5jKGRlc3QsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGZvciAoY29uc3QgZW50cnkgb2YgZnMucmVhZGRpclN5bmMoc3JjKSkge1xuICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4oc3JjLCBlbnRyeSk7XG4gICAgY29uc3QgZGVzdFBhdGggPSBwYXRoLmpvaW4oZGVzdCwgZW50cnkpO1xuICAgIGlmIChmcy5zdGF0U3luYyhzcmNQYXRoKS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICBjb3B5RGlyUmVjdXJzaXZlKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYSBwYWNrYWdlLmpzb24gaW4gdGhlIGNvbnRlbnQgZGlyZWN0b3J5IGFuZCBydW4gbnBtIGluc3RhbGxcbiAqIHNvIHRoYXQgYmxvY2tzIGFuZCBzaGFyZWQgY29tcG9uZW50cyBjYW4gcmVzb2x2ZSB0aGVpciBpbXBvcnRzLlxuICovXG5jb25zdCBlbnN1cmVDb250ZW50RGVwZW5kZW5jaWVzID0gKGNvbnRlbnRSb290OiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgY29uc3QgcGtnUGF0aCA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ3BhY2thZ2UuanNvbicpO1xuXG4gIGNvbnN0IHBrZyA9IHtcbiAgICBuYW1lOiAnaGFuZG9mZi1ibG9ja3MtY29udGVudCcsXG4gICAgdmVyc2lvbjogJzEuMC4wJyxcbiAgICBwcml2YXRlOiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQXV0by1nZW5lcmF0ZWQgYnkgSGFuZG9mZiBjb21waWxlciDigJQgYmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzLicsXG4gICAgZGVwZW5kZW5jaWVzOiB7XG4gICAgICAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc6ICdeMS4yMi4xJyxcbiAgICB9LFxuICAgIGRldkRlcGVuZGVuY2llczoge1xuICAgICAgJ0B3b3JkcHJlc3MvYXBpLWZldGNoJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvYmxvY2tzJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2NvcmUtZGF0YSc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2RhdGEnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9lbGVtZW50JzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvaTE4bic6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2ljb25zJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3Mvc2NyaXB0cyc6ICdeMjcuMC4wJyxcbiAgICAgICdjb3B5LXdlYnBhY2stcGx1Z2luJzogJ14xMS4wLjAnLFxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgZGVzaXJlZCA9IEpTT04uc3RyaW5naWZ5KHBrZywgbnVsbCwgMikgKyAnXFxuJztcblxuICBsZXQgbmVlZHNJbnN0YWxsID0gdHJ1ZTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMocGtnUGF0aCkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGZzLnJlYWRGaWxlU3luYyhwa2dQYXRoLCAndXRmOCcpO1xuICAgIGlmIChleGlzdGluZyA9PT0gZGVzaXJlZCkge1xuICAgICAgbmVlZHNJbnN0YWxsID0gIWZzLmV4aXN0c1N5bmMocGF0aC5qb2luKGNvbnRlbnRSb290LCAnbm9kZV9tb2R1bGVzJykpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChuZWVkc0luc3RhbGwpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+TpiBJbnN0YWxsaW5nIGJsb2NrIGJ1aWxkIGRlcGVuZGVuY2llcy4uLmApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGtnUGF0aCwgZGVzaXJlZCk7XG4gICAgdHJ5IHtcbiAgICAgIGV4ZWNTeW5jKCducG0gaW5zdGFsbCAtLWlnbm9yZS1zY3JpcHRzJywge1xuICAgICAgICBjd2Q6IGNvbnRlbnRSb290LFxuICAgICAgICBzdGRpbzogJ2luaGVyaXQnLFxuICAgICAgfSk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERlcGVuZGVuY2llcyBpbnN0YWxsZWQgaW4gJHtjb250ZW50Um9vdH1gKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBucG0gaW5zdGFsbCBmYWlsZWQg4oCUIHlvdSBtYXkgbmVlZCB0byBydW4gaXQgbWFudWFsbHkgaW4gJHtjb250ZW50Um9vdH1gKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYFxcbvCfk6YgQmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzIGFscmVhZHkgdXAgdG8gZGF0ZWApO1xuICB9XG59O1xuXG4vKipcbiAqIERvd25sb2FkIGEgZmlsZSBmcm9tIGEgVVJMIGFuZCBzYXZlIGl0IHRvIGRpc2tcbiAqL1xuY29uc3QgZG93bmxvYWRGaWxlID0gYXN5bmMgKHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgLy8gSGFuZGxlIHJlZGlyZWN0c1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzLnN0YXR1c0NvZGUgPT09IDMwMikge1xuICAgICAgICBjb25zdCByZWRpcmVjdFVybCA9IHJlcy5oZWFkZXJzLmxvY2F0aW9uO1xuICAgICAgICBpZiAocmVkaXJlY3RVcmwpIHtcbiAgICAgICAgICBkb3dubG9hZEZpbGUocmVkaXJlY3RVcmwsIGRlc3RQYXRoLCBhdXRoKS50aGVuKHJlc29sdmUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgZmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKGRlc3RQYXRoKTtcbiAgICAgIHJlcy5waXBlKGZpbGVTdHJlYW0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdmaW5pc2gnLCAoKSA9PiB7XG4gICAgICAgIGZpbGVTdHJlYW0uY2xvc2UoKTtcbiAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdlcnJvcicsIChlcnIpID0+IHtcbiAgICAgICAgZnMudW5saW5rKGRlc3RQYXRoLCAoKSA9PiB7fSk7IC8vIENsZWFuIHVwIHBhcnRpYWwgZmlsZVxuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIHNhdmUgc2NyZWVuc2hvdDogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBkb3dubG9hZCBzY3JlZW5zaG90OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggY29tcG9uZW50IGRhdGEgZnJvbSBIYW5kb2ZmIEFQSVxuICovXG5jb25zdCBmZXRjaENvbXBvbmVudCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50PiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC8ke2NvbXBvbmVudE5hbWV9Lmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEhhbmRvZmZDb21wb25lbnQ7XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudCBKU09OOiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYWxsIGJsb2NrIGZpbGVzIGZyb20gYSBjb21wb25lbnRcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGFwaVVybCAtIFRoZSBiYXNlIEFQSSBVUkwgZm9yIGZldGNoaW5nIHNjcmVlbnNob3RzXG4gKiBAcGFyYW0gcmVzb2x2ZWRDb25maWcgLSBUaGUgcmVzb2x2ZWQgY29uZmlndXJhdGlvbiBpbmNsdWRpbmcgZHluYW1pYyBhcnJheSBzZXR0aW5nc1xuICovXG5jb25zdCBnZW5lcmF0ZUJsb2NrID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgYXBpVXJsOiBzdHJpbmcsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZywgc2NoZW1hSGlzdG9yeT86IFNjaGVtYUhpc3RvcnkpOiBHZW5lcmF0ZWRCbG9jayA9PiB7XG4gIGNvbnN0IGhhc1NjcmVlbnNob3QgPSAhIWNvbXBvbmVudC5pbWFnZTtcbiAgXG4gIC8vIENvbnN0cnVjdCBmdWxsIHNjcmVlbnNob3QgVVJMIGlmIGltYWdlIHBhdGggaXMgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGlmIChjb21wb25lbnQuaW1hZ2UpIHtcbiAgICAvLyBIYW5kbGUgYm90aCBhYnNvbHV0ZSBVUkxzIGFuZCByZWxhdGl2ZSBwYXRoc1xuICAgIGlmIChjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cDovLycpIHx8IGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICBzY3JlZW5zaG90VXJsID0gY29tcG9uZW50LmltYWdlO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSZWxhdGl2ZSBwYXRoIC0gcHJlcGVuZCBBUEkgVVJMXG4gICAgICBzY3JlZW5zaG90VXJsID0gYCR7YXBpVXJsfSR7Y29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJy8nKSA/ICcnIDogJy8nfSR7Y29tcG9uZW50LmltYWdlfWA7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFeHRyYWN0IGR5bmFtaWMgYXJyYXkgY29uZmlncyBmb3IgdGhpcyBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZ1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydClcbiAgfTtcbiAgXG4gIC8vIEF1dG8tZGV0ZWN0IHBhZ2luYXRpb24gZm9yIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGVudHJpZXMgb25seVxuICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50RHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoJ2FycmF5VHlwZScgaW4gZHluQ29uZmlnKSBjb250aW51ZTsgLy8gU2tpcCBzcGVjaWFsaXNlZCBhcnJheSB0eXBlc1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgIGlmIChwcm9wPy50eXBlID09PSAnYXJyYXknICYmIHByb3AucGFnaW5hdGlvbj8udHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBjb25zdCBwYWdpbmF0aW9uRmllbGRSZWdleCA9IG5ldyBSZWdFeHAoXG4gICAgICAgIGBcXFxce1xcXFx7XFxcXHMqI2ZpZWxkXFxcXHMrW1wiJ10ke2ZpZWxkTmFtZX1cXFxcLnBhZ2luYXRpb25bXCInXWBcbiAgICAgICk7XG4gICAgICBpZiAocGFnaW5hdGlvbkZpZWxkUmVnZXgudGVzdChjb21wb25lbnQuY29kZSkpIHtcbiAgICAgICAgKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24gPSB7IHByb3BlcnR5TmFtZTogJ3BhZ2luYXRpb24nIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIHJpY2h0ZXh0IGZpZWxkIChpZiBhbnkpIHVzZXMgSW5uZXJCbG9ja3NcbiAgY29uc3QgZmllbGRQcmVmcyA9IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCk7XG4gIGNvbnN0IHJpY2h0ZXh0RmllbGRzID0gT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpXG4gICAgLmZpbHRlcigoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICAvLyBDaGVjayBleHBsaWNpdCBjb25maWcgb3ZlcnJpZGVzIGZpcnN0XG4gIGNvbnN0IGV4cGxpY2l0SW5uZXJCbG9ja3MgPSBPYmplY3QuZW50cmllcyhmaWVsZFByZWZzKVxuICAgIC5maWx0ZXIoKFssIHByZWZzXSkgPT4gcHJlZnMuaW5uZXJCbG9ja3MgPT09IHRydWUpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgbGV0IGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IG9ubHkgb25lIHJpY2h0ZXh0IGZpZWxkIHBlciBibG9jayBjYW4gdXNlIElubmVyQmxvY2tzLCBgICtcbiAgICAgIGBidXQgJHtleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aH0gYXJlIG1hcmtlZDogJHtleHBsaWNpdElubmVyQmxvY2tzLmpvaW4oJywgJyl9YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBmaWVsZCA9IGV4cGxpY2l0SW5uZXJCbG9ja3NbMF07XG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkXTtcbiAgICBpZiAoIXByb3AgfHwgcHJvcC50eXBlICE9PSAncmljaHRleHQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogZmllbGQgXCIke2ZpZWxkfVwiIGlzIG1hcmtlZCBhcyBpbm5lckJsb2NrcyBidXQgaXMgbm90IGEgcmljaHRleHQgZmllbGRgXG4gICAgICApO1xuICAgIH1cbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gZmllbGQ7XG4gIH0gZWxzZSBpZiAocmljaHRleHRGaWVsZHMubGVuZ3RoID09PSAxKSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IHJpY2h0ZXh0RmllbGRzWzBdO1xuICB9IGVsc2Uge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSBudWxsO1xuICB9XG4gIFxuICBjb25zdCBoaXN0b3J5RW50cnkgPSBzY2hlbWFIaXN0b3J5ID8gZ2V0Q29tcG9uZW50SGlzdG9yeShzY2hlbWFIaXN0b3J5LCBjb21wb25lbnQuaWQpIDogdW5kZWZpbmVkO1xuICBjb25zdCBjdXJyZW50UHJvcHMgPSBleHRyYWN0UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIGNvbnN0IG1pZ3JhdGlvbk92ZXJyaWRlcyA9IHJlc29sdmVkQ29uZmlnLnNjaGVtYU1pZ3JhdGlvbnM/Lltjb21wb25lbnQuaWRdO1xuICBjb25zdCBkZXByZWNhdGlvbnNDb2RlID0gZ2VuZXJhdGVEZXByZWNhdGlvbnMoXG4gICAgaGlzdG9yeUVudHJ5LFxuICAgIGN1cnJlbnRQcm9wcyxcbiAgICBtaWdyYXRpb25PdmVycmlkZXMsXG4gICAgISFpbm5lckJsb2Nrc0ZpZWxkXG4gICk7XG5cbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlQmxvY2tKc29uKGNvbXBvbmVudCwgaGFzU2NyZWVuc2hvdCwgYXBpVXJsLCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBpbmRleEpzOiBnZW5lcmF0ZUluZGV4SnMoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkLCBkZXByZWNhdGlvbnNDb2RlLCBoYXNTY3JlZW5zaG90KSxcbiAgICByZW5kZXJQaHA6IGdlbmVyYXRlUmVuZGVyUGhwKGNvbXBvbmVudCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgZWRpdG9yU2NzczogZ2VuZXJhdGVFZGl0b3JTY3NzKGNvbXBvbmVudCksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZVN0eWxlU2Nzcyhjb21wb25lbnQpLFxuICAgIHJlYWRtZTogZ2VuZXJhdGVSZWFkbWUoY29tcG9uZW50KSxcbiAgICBtaWdyYXRpb25TY2hlbWE6IGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hKGNvbXBvbmVudCksXG4gICAgc2NoZW1hQ2hhbmdlbG9nOiBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyhjb21wb25lbnQuaWQsIGhpc3RvcnlFbnRyeSksXG4gICAgc2NyZWVuc2hvdFVybFxuICB9O1xufTtcblxuLyoqXG4gKiBXcml0ZSBibG9jayBmaWxlcyB0byBvdXRwdXQgZGlyZWN0b3J5XG4gKi9cbmNvbnN0IHdyaXRlQmxvY2tGaWxlcyA9IGFzeW5jIChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50SWQ6IHN0cmluZywgYmxvY2s6IEdlbmVyYXRlZEJsb2NrLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IHRvQmxvY2tOYW1lKGNvbXBvbmVudElkKTtcbiAgY29uc3QgYmxvY2tEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBibG9ja05hbWUpO1xuICBcbiAgLy8gQ3JlYXRlIGJsb2NrIGRpcmVjdG9yeVxuICBpZiAoIWZzLmV4aXN0c1N5bmMoYmxvY2tEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGJsb2NrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBcbiAgLy8gRm9ybWF0IGFsbCBjb2RlIGZpbGVzIHdpdGggUHJldHRpZXJcbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgXG4gIC8vIFdyaXRlIGZpbGVzXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnYmxvY2suanNvbicpLCBmb3JtYXR0ZWRCbG9ja0pzb24pO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2luZGV4LmpzJyksIGZvcm1hdHRlZEluZGV4SnMpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3JlbmRlci5waHAnKSwgZm9ybWF0dGVkUmVuZGVyUGhwKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdlZGl0b3Iuc2NzcycpLCBmb3JtYXR0ZWRFZGl0b3JTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdzdHlsZS5zY3NzJyksIGZvcm1hdHRlZFN0eWxlU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnUkVBRE1FLm1kJyksIGJsb2NrLnJlYWRtZSk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnbWlncmF0aW9uLXNjaGVtYS5qc29uJyksIGJsb2NrLm1pZ3JhdGlvblNjaGVtYSk7XG4gIGlmIChibG9jay5zY2hlbWFDaGFuZ2Vsb2cpIHtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3NjaGVtYS1jaGFuZ2Vsb2cuanNvbicpLCBibG9jay5zY2hlbWFDaGFuZ2Vsb2cpO1xuICB9XG4gIFxuICAvLyBEb3dubG9hZCBzY3JlZW5zaG90IGlmIGF2YWlsYWJsZVxuICBsZXQgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBmYWxzZTtcbiAgaWYgKGJsb2NrLnNjcmVlbnNob3RVcmwpIHtcbiAgICBjb25zdCBzY3JlZW5zaG90UGF0aCA9IHBhdGguam9pbihibG9ja0RpciwgJ3NjcmVlbnNob3QucG5nJyk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfk7cgRG93bmxvYWRpbmcgc2NyZWVuc2hvdC4uLmApO1xuICAgIHNjcmVlbnNob3REb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGJsb2NrLnNjcmVlbnNob3RVcmwsIHNjcmVlbnNob3RQYXRoLCBhdXRoKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgYmxvY2s6ICR7YmxvY2tOYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2Jsb2NrRGlyfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBibG9jay5qc29uYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGluZGV4LmpzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHJlbmRlci5waHBgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgZWRpdG9yLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4Qgc3R5bGUuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBSRUFETUUubWRgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgbWlncmF0aW9uLXNjaGVtYS5qc29uYCk7XG4gIGlmIChzY3JlZW5zaG90RG93bmxvYWRlZCkge1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5a877iPICBzY3JlZW5zaG90LnBuZ2ApO1xuICB9XG59O1xuXG4vKipcbiAqIE1haW4gY29tcGlsYXRpb24gZnVuY3Rpb25cbiAqL1xuY29uc3QgY29tcGlsZSA9IGFzeW5jIChvcHRpb25zOiBDb21waWxlck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7b3B0aW9ucy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7b3B0aW9ucy5jb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke29wdGlvbnMub3V0cHV0RGlyfWApO1xuICBpZiAob3B0aW9ucy5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke29wdGlvbnMuYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBmcm9tIEFQSVxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBkYXRhLi4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQob3B0aW9ucy5hcGlVcmwsIG9wdGlvbnMuY29tcG9uZW50TmFtZSwgb3B0aW9ucy5hdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRlbXBsYXRlIHZhcmlhYmxlcyBiZWZvcmUgZ2VuZXJhdGluZ1xuICAgIGNvbnNvbGUubG9nKGDwn5SNIFZhbGlkYXRpbmcgdGVtcGxhdGUgdmFyaWFibGVzLi4uYCk7XG4gICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgXG4gICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIFRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkISBGaXggdGhlIHVuZGVmaW5lZCB2YXJpYWJsZXMgYmVmb3JlIGNvbXBpbGluZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgYmxvY2sgZmlsZXMgKHdpdGggZGVwcmVjYXRpb24gc3VwcG9ydCBmcm9tIHNjaGVtYSBoaXN0b3J5KVxuICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgR3V0ZW5iZXJnIGJsb2NrLi4uYCk7XG4gICAgY29uc3Qgc2NoZW1hSGlzdG9yeSA9IGxvYWRNYW5pZmVzdChvcHRpb25zLm91dHB1dERpcik7XG4gICAgY29uc3QgYmxvY2sgPSBnZW5lcmF0ZUJsb2NrKGNvbXBvbmVudCwgb3B0aW9ucy5hcGlVcmwsIGNvbmZpZywgc2NoZW1hSGlzdG9yeSk7XG4gICAgXG4gICAgLy8gV3JpdGUgZmlsZXMgKHdpdGggUHJldHRpZXIgZm9ybWF0dGluZylcbiAgICBhd2FpdCB3cml0ZUJsb2NrRmlsZXMob3B0aW9ucy5vdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIG9wdGlvbnMuYXV0aCk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBEb25lISBEb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgYSBjb21wb25lbnQgc2hvdWxkIGJlIGltcG9ydGVkIGJhc2VkIG9uIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBzaG91bGRJbXBvcnRDb21wb25lbnQgPSAoY29tcG9uZW50SWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCB0eXBlQ29uZmlnID0gaW1wb3J0Q29uZmlnW2NvbXBvbmVudFR5cGVdO1xuXG4gIC8vIFR5cGUgbm90IGxpc3RlZCBpbiBpbXBvcnQgY29uZmlnIOKAlCBkZWZhdWx0IHRvIHRydWUgKGltcG9ydClcbiAgaWYgKHR5cGVDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEVudGlyZSB0eXBlIGRpc2FibGVkXG4gIGlmICh0eXBlQ29uZmlnID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAvLyBFbnRpcmUgdHlwZSBlbmFibGVkIHdpdGggbm8gcGVyLWNvbXBvbmVudCBvdmVycmlkZXNcbiAgaWYgKHR5cGVDb25maWcgPT09IHRydWUpIHJldHVybiB0cnVlO1xuXG4gIC8vIFBlci1jb21wb25lbnQgbG9va3VwIHdpdGhpbiB0aGUgdHlwZSBvYmplY3RcbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIC8vIE5vdCBsaXN0ZWQg4oCUIGltcG9ydCB3aXRoIGRlZmF1bHRzICh0eXBlLW9iamVjdCBtZWFucyBcImltcG9ydCBhbGwsIG92ZXJyaWRlIGxpc3RlZFwiKVxuICBpZiAoY29tcG9uZW50Q29uZmlnID09PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAvLyBFeHBsaWNpdGx5IGRpc2FibGVkXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEV4cGxpY2l0bHkgZW5hYmxlZCBvciBoYXMgZmllbGQgb3ZlcnJpZGVzXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHJhdyBwZXItZmllbGQgY29uZmlnIG9iamVjdCBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZ2V0Q29tcG9uZW50RmllbGRDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG4gIGlmICghdHlwZUNvbmZpZyB8fCB0eXBlb2YgdHlwZUNvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIGlmICghY29tcG9uZW50Q29uZmlnIHx8IHR5cGVvZiBjb21wb25lbnRDb25maWcgPT09ICdib29sZWFuJykgcmV0dXJuIHt9O1xuXG4gIHJldHVybiBjb21wb25lbnRDb25maWcgYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgRmllbGRQcmVmZXJlbmNlcz47XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+ID0+IHtcbiAgY29uc3QgYWxsQ29uZmlncyA9IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyhjb21wb25lbnRJZCwgY29tcG9uZW50VHlwZSwgaW1wb3J0Q29uZmlnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKGlzRHluYW1pY0FycmF5Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gY29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGZpZWxkIHByZWZlcmVuY2VzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIEZpZWxkUHJlZmVyZW5jZXM+ID0ge307XG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhhbGxDb25maWdzKSkge1xuICAgIGlmICghaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEZldGNoIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEksIGZpbHRlcmVkIGJ5IGltcG9ydCBjb25maWdcbiAqL1xuY29uc3QgZmV0Y2hDb21wb25lbnRMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQgbGlzdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICBjb25zdCBmaWx0ZXJlZCA9IGNvbXBvbmVudHMuZmlsdGVyKGMgPT4gc2hvdWxkSW1wb3J0Q29tcG9uZW50KGMuaWQsIGMudHlwZSwgaW1wb3J0Q29uZmlnKSk7XG4gICAgICAgICAgcmVzb2x2ZShmaWx0ZXJlZC5tYXAoYyA9PiBjLmlkKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50cyBsaXN0OiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudHM6ICR7ZS5tZXNzYWdlfWApKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEZldGNoIGZ1bGwgbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSAobm8gaW1wb3J0IGZpbHRlcikuIFVzZWQgdG8gcmVzb2x2ZSBncm91cCBuYW1lcy5cbiAqL1xuY29uc3QgZmV0Y2hBbGxDb21wb25lbnRzTGlzdCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudFtdPiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudHMuanNvbmA7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQgbGlzdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IEpTT04ucGFyc2UoZGF0YSkgYXMgQXJyYXk8SGFuZG9mZkNvbXBvbmVudD47XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnRzKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIENvbXBpbGUgYWxsIGNvbXBvbmVudHNcbiAqL1xuLyoqXG4gKiBCdWlsZCBWYXJpYW50SW5mbyBmb3IgYSBjb21wb25lbnQgKHJlc29sdmVzIGR5bmFtaWMgYXJyYXlzLCBJbm5lckJsb2NrcyBmaWVsZCwgZXRjLilcbiAqL1xuY29uc3QgYnVpbGRWYXJpYW50SW5mbyA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZyk6IFZhcmlhbnRJbmZvID0+IHtcbiAgY29uc3QgY29tcG9uZW50RHluYW1pY0FycmF5cyA9IHtcbiAgICAuLi5leHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpLFxuICB9O1xuXG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGNvbnN0IGV4cGxpY2l0SW5uZXJCbG9ja3MgPSBPYmplY3QuZW50cmllcyhmaWVsZFByZWZzKVxuICAgIC5maWx0ZXIoKFssIHByZWZzXSkgPT4gcHJlZnMuaW5uZXJCbG9ja3MgPT09IHRydWUpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgbGV0IGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IG9ubHkgb25lIHJpY2h0ZXh0IGZpZWxkIHBlciBibG9jayBjYW4gdXNlIElubmVyQmxvY2tzLCBgICtcbiAgICAgIGBidXQgJHtleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aH0gYXJlIG1hcmtlZDogJHtleHBsaWNpdElubmVyQmxvY2tzLmpvaW4oJywgJyl9YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBmaWVsZCA9IGV4cGxpY2l0SW5uZXJCbG9ja3NbMF07XG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkXTtcbiAgICBpZiAoIXByb3AgfHwgcHJvcC50eXBlICE9PSAncmljaHRleHQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogZmllbGQgXCIke2ZpZWxkfVwiIGlzIG1hcmtlZCBhcyBpbm5lckJsb2NrcyBidXQgaXMgbm90IGEgcmljaHRleHQgZmllbGRgXG4gICAgICApO1xuICAgIH1cbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gZmllbGQ7XG4gIH0gZWxzZSBpZiAocmljaHRleHRGaWVsZHMubGVuZ3RoID09PSAxKSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IHJpY2h0ZXh0RmllbGRzWzBdO1xuICB9IGVsc2Uge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjb21wb25lbnQsXG4gICAgZmllbGRNYXA6IHt9LFxuICAgIGlubmVyQmxvY2tzRmllbGQsXG4gICAgZHluYW1pY0FycmF5Q29uZmlnczogY29tcG9uZW50RHluYW1pY0FycmF5cyxcbiAgfTtcbn07XG5cbi8qKlxuICogQ29tcGlsZSBhIHNpbmdsZSBtZXJnZWQgZ3JvdXAgKGUuZy4gSGVybyB3aXRoIG11bHRpcGxlIHZhcmlhbnRzKS4gVXNlZCBieSBzaW5nbGUtbmFtZSBDTEkgd2hlbiBuYW1lIG1hdGNoZXMgYSBncm91cC5cbiAqL1xuY29uc3QgY29tcGlsZUdyb3VwID0gYXN5bmMgKFxuICBhcGlVcmw6IHN0cmluZyxcbiAgb3V0cHV0RGlyOiBzdHJpbmcsXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSxcbiAgYXV0aD86IEF1dGhDcmVkZW50aWFscyxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UgCBHZW5lcmF0aW5nIG1lcmdlZCBncm91cCBibG9jazogJHtncm91cFNsdWd9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zdCB2YXJpYW50SW5mb3M6IFZhcmlhbnRJbmZvW10gPSBncm91cENvbXBvbmVudHMubWFwKChjKSA9PiBidWlsZFZhcmlhbnRJbmZvKGMsIGNvbmZpZykpO1xuICBjb25zdCBtZXJnZWRCbG9jayA9IGdlbmVyYXRlTWVyZ2VkQmxvY2soZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHMsIHZhcmlhbnRJbmZvcywgYXBpVXJsKTtcbiAgY29uc3QgZ3JvdXBCbG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIGNvbnN0IGdyb3VwRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgZ3JvdXBCbG9ja05hbWUpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZ3JvdXBEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGdyb3VwRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suYmxvY2tKc29uLCAnanNvbicpO1xuICBjb25zdCBmb3JtYXR0ZWRJbmRleEpzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5pbmRleEpzLCAnYmFiZWwnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgY29uc3QgZm9ybWF0dGVkRWRpdG9yU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suZWRpdG9yU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkU3R5bGVTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5zdHlsZVNjc3MsICdzY3NzJyk7XG5cbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdSRUFETUUubWQnKSwgbWVyZ2VkQmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgbWVyZ2VkQmxvY2subWlncmF0aW9uU2NoZW1hKTtcblxuICBpZiAobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMpIHtcbiAgICBjb25zdCB2YXJpYXRpb25zRGlyID0gcGF0aC5qb2luKGdyb3VwRGlyLCAndmFyaWF0aW9ucycpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyh2YXJpYXRpb25zRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKHZhcmlhdGlvbnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLmpzKSkge1xuICAgICAgY29uc3QgZm9ybWF0dGVkID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAnYmFiZWwnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0uanNgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcy5waHApKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdwaHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0ucGhwYCksIGZvcm1hdHRlZCk7XG4gICAgfVxuICB9XG5cbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgbWVyZ2VkIGJsb2NrOiAke2dyb3VwQmxvY2tOYW1lfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtncm91cERpcn1gKTtcblxuICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChncm91cENvbXBvbmVudHMpO1xuICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoaW5jbHVkZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICBmcy53cml0ZUZpbGVTeW5jKGNhdGVnb3JpZXNQYXRoLCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgJHtjYXRlZ29yaWVzUGF0aH1gKTtcbn07XG5cbmNvbnN0IGNvbXBpbGVBbGwgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SnIEd1dGVuYmVyZyBDb21waWxlciAtIEJhdGNoIE1vZGVgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3V0cHV0RGlyfWApO1xuICBpZiAoYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHthdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBjb25maWcuaW1wb3J0LCBhdXRoKTtcblxuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHNcXG5gKTtcbiAgICBcbiAgICBsZXQgc3VjY2VzcyA9IDA7XG4gICAgbGV0IGZhaWxlZCA9IDA7XG4gICAgY29uc3QgY29tcGlsZWRDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICBjb25zdCBzY2hlbWFIaXN0b3J5ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgLy8gRmV0Y2ggYWxsIGNvbXBvbmVudHMgZmlyc3Qgc28gd2UgY2FuIHBhcnRpdGlvbiBieSBncm91cFxuICAgIGNvbnN0IGFsbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudElkLCBhdXRoKTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQodGVtcGxhdGVWYWxpZGF0aW9uKSk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4pqg77iPICBTa2lwcGluZyAke2NvbXBvbmVudElkfSBkdWUgdG8gdGVtcGxhdGUgdmFyaWFibGUgZXJyb3JzYCk7XG4gICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhbGxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUGFydGl0aW9uIGNvbXBvbmVudHM6IG1lcmdlZCBncm91cHMgdnMgaW5kaXZpZHVhbFxuICAgIC8vIEJ1aWxkIGNhc2UtaW5zZW5zaXRpdmUgbG9va3VwOiBjb25maWcgbWF5IHNheSBcIkhlcm9cIiBidXQgQVBJIG9mdGVuIHJldHVybnMgXCJoZXJvXCJcbiAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICB9XG4gICAgY29uc3QgZ3JvdXBCdWNrZXRzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmQ29tcG9uZW50W10+ID0ge307XG4gICAgY29uc3QgaW5kaXZpZHVhbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgYWxsQ29tcG9uZW50cykge1xuICAgICAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA7XG4gICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBjb25maWdLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgaWYgKGNvbmZpZ0tleSkge1xuICAgICAgICBpZiAoIWdyb3VwQnVja2V0c1tjb25maWdLZXldKSBncm91cEJ1Y2tldHNbY29uZmlnS2V5XSA9IFtdO1xuICAgICAgICBncm91cEJ1Y2tldHNbY29uZmlnS2V5XS5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBpbmRpdmlkdWFsIGNvbXBvbmVudHMgKGV4aXN0aW5nIGJlaGF2aW9yKVxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGluZGl2aWR1YWxDb21wb25lbnRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBhcGlVcmwsIGNvbmZpZywgc2NoZW1hSGlzdG9yeSk7XG4gICAgICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIGF1dGgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBzdWNjZXNzKys7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgJHtjb21wb25lbnQuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgbWVyZ2VkIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzXSBvZiBPYmplY3QuZW50cmllcyhncm91cEJ1Y2tldHMpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoYXBpVXJsLCBvdXRwdXREaXIsIGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzLCBhdXRoKTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goLi4uZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgc3VjY2VzcyArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlIG1lcmdlZCBncm91cCAke2dyb3VwU2x1Z306ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGNhdGVnb3JpZXMgUEhQIGZpbGUgYmFzZWQgb24gYWxsIGNvbXBpbGVkIGNvbXBvbmVudHNcbiAgICBpZiAoY29tcGlsZWRDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIEdlbmVyYXRpbmcgYmxvY2sgY2F0ZWdvcmllcy4uLmApO1xuICAgICAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChjb21waWxlZENvbXBvbmVudHMpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgICAgIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvcHkgc2hhcmVkIGNvbXBvbmVudHMgJiB1dGlscyB0byB0aGUgb3V0cHV0IGRpcmVjdG9yeSBzbyBibG9ja3MgY2FuXG4gICAgLy8gcmVzb2x2ZSB0aGVpciAuLi8uLi9zaGFyZWQvLi4uIGltcG9ydHMgcmVnYXJkbGVzcyBvZiB3aGVyZSB0aGV5IGxpdmUuXG4gICAgY29uc3QgcGx1Z2luUm9vdCA9IHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUocHJvY2Vzcy5hcmd2WzFdKSwgJy4uJywgJy4uJyk7XG4gICAgY29uc3QgcGx1Z2luU2hhcmVkRGlyID0gcGF0aC5qb2luKHBsdWdpblJvb3QsICdzaGFyZWQnKTtcbiAgICBjb25zdCBjb250ZW50Um9vdCA9IHBhdGgucmVzb2x2ZShvdXRwdXREaXIsICcuLicpO1xuICAgIGNvbnN0IHRhcmdldFNoYXJlZERpciA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ3NoYXJlZCcpO1xuXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMocGx1Z2luU2hhcmVkRGlyKSAmJlxuICAgICAgICBwYXRoLnJlc29sdmUocGx1Z2luU2hhcmVkRGlyKSAhPT0gcGF0aC5yZXNvbHZlKHRhcmdldFNoYXJlZERpcikpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvcHlpbmcgc2hhcmVkIGNvbXBvbmVudHMuLi5gKTtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUocGx1Z2luU2hhcmVkRGlyLCB0YXJnZXRTaGFyZWREaXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBTaGFyZWQgY29tcG9uZW50cyBjb3BpZWQgdG8gJHt0YXJnZXRTaGFyZWREaXJ9YCk7XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcGFja2FnZS5qc29uIGFuZCBpbnN0YWxsIGJ1aWxkIGRlcGVuZGVuY2llcyBzbyBibG9ja3MgYW5kXG4gICAgLy8gc2hhcmVkIGNvbXBvbmVudHMgY2FuIHJlc29sdmUgQHdvcmRwcmVzcy8qIGFuZCBAMTB1cC8qIGltcG9ydHMuXG4gICAgZW5zdXJlQ29udGVudERlcGVuZGVuY2llcyhjb250ZW50Um9vdCk7XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5jc3MgYW5kIG1haW4uanMgZGVzaWduIHN5c3RlbSBhc3NldHNcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+ToSBEb3dubG9hZGluZyBkZXNpZ24gc3lzdGVtIGFzc2V0cy4uLmApO1xuICAgIGNvbnN0IGFzc2V0c0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICcuLicsICdhc3NldHMnKTtcbiAgICBjb25zdCBhc3NldHNDc3NEaXIgPSBwYXRoLmpvaW4oYXNzZXRzRGlyLCAnY3NzJyk7XG4gICAgY29uc3QgYXNzZXRzSnNEaXIgPSBwYXRoLmpvaW4oYXNzZXRzRGlyLCAnanMnKTtcblxuICAgIGlmICghZnMuZXhpc3RzU3luYyhhc3NldHNDc3NEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoYXNzZXRzQ3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFzc2V0c0pzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGFzc2V0c0pzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBjc3NVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oYXNzZXRzQ3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICBjb25zdCBjc3NEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGNzc1VybCwgY3NzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGNzc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2Nzcy9tYWluLmNzc2ApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uY3NzIGZyb20gJHtjc3NVcmx9YCk7XG4gICAgfVxuXG4gICAgY29uc3QganNVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5qc2A7XG4gICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGFzc2V0c0pzRGlyLCAnbWFpbi5qcycpO1xuICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShqc1VybCwganNQYXRoLCBhdXRoKTtcbiAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9qcy9tYWluLmpzYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBDb21waWxhdGlvbiBjb21wbGV0ZSFgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFN1Y2Nlc3M6ICR7c3VjY2Vzc31gKTtcbiAgICBpZiAoZmFpbGVkID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKdjCBGYWlsZWQ6ICR7ZmFpbGVkfWApO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg8J+UgCBNZXJnZWQgZ3JvdXBzOiAke09iamVjdC5rZXlzKGdyb3VwQnVja2V0cykubGVuZ3RofWApO1xuICAgIH1cbiAgICBjb25zb2xlLmxvZyhgXFxuRG9uJ3QgZm9yZ2V0IHRvIHJ1biAnbnBtIHJ1biBidWlsZCcgaW4geW91ciBibG9ja3MgcGx1Z2luLlxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21waWxlIHRoZW1lIHRlbXBsYXRlcyAoaGVhZGVyLCBmb290ZXIpXG4gKi9cbmNvbnN0IGNvbXBpbGVUaGVtZSA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCfjqggVGhlbWUgVGVtcGxhdGUgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3V0cHV0RGlyfWApO1xuICBpZiAoYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHthdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gQ29tcGlsZSBoZWFkZXJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBoZWFkZXIgY29tcG9uZW50Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlciA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgJ2hlYWRlcicsIGF1dGgpO1xuICAgICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2hlYWRlci50aXRsZX1cXG5gKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBoZWFkZXIucGhwLi4uYCk7XG4gICAgICBjb25zdCBoZWFkZXJQaHAgPSBnZW5lcmF0ZUhlYWRlclBocChoZWFkZXIpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkSGVhZGVyID0gYXdhaXQgZm9ybWF0Q29kZShoZWFkZXJQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgaGVhZGVyUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICdoZWFkZXIucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGhlYWRlclBhdGgsIGZvcm1hdHRlZEhlYWRlcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtoZWFkZXJQYXRofVxcbmApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgSGVhZGVyIGNvbXBvbmVudCBub3QgZm91bmQgb3IgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBpbGUgZm9vdGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgZm9vdGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmb290ZXIgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsICdmb290ZXInLCBhdXRoKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtmb290ZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgZm9vdGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgZm9vdGVyUGhwID0gZ2VuZXJhdGVGb290ZXJQaHAoZm9vdGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEZvb3RlciA9IGF3YWl0IGZvcm1hdENvZGUoZm9vdGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGZvb3RlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnZm9vdGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhmb290ZXJQYXRoLCBmb3JtYXR0ZWRGb290ZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Zm9vdGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZvb3RlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBBbHNvIHRyeSBoZWFkZXItY29tcGFjdCBhbmQgZm9vdGVyLWNvbXBhY3QgaWYgdGhleSBleGlzdFxuICAgIC8vIFRoZXNlIGdvIGludG8gdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8gc3ViZm9sZGVyXG4gICAgY29uc3QgaGFuZG9mZlRlbXBsYXRlc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICd0ZW1wbGF0ZS1wYXJ0cycsICdoYW5kb2ZmJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoaGFuZG9mZlRlbXBsYXRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGdlbmVyYXRlZFRlbXBsYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgWydoZWFkZXItY29tcGFjdCcsICdoZWFkZXItbGFuZGVyJywgJ2Zvb3Rlci1jb21wYWN0J10pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgdmFyaWFudCwgYXV0aCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OhIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX1gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlVHlwZSA9IHZhcmlhbnQucmVwbGFjZSgvLS9nLCAnXycpO1xuICAgICAgICBjb25zdCBpc0hlYWRlciA9IHZhcmlhbnQuc3RhcnRzV2l0aCgnaGVhZGVyJyk7XG4gICAgICAgIGNvbnN0IHBocCA9IGlzSGVhZGVyIFxuICAgICAgICAgID8gZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpXG4gICAgICAgICAgOiBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocChjb21wb25lbnQsIHRlbXBsYXRlVHlwZSk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZFBocCA9IGF3YWl0IGZvcm1hdENvZGUocGhwLCAncGhwJyk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCBgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgZm9ybWF0dGVkUGhwKTtcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7ZmlsZVBhdGh9XFxuYCk7XG4gICAgICAgIGdlbmVyYXRlZFRlbXBsYXRlcy5wdXNoKGAke3ZhcmlhbnR9LnBocGApO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIFZhcmlhbnQgZG9lc24ndCBleGlzdCwgc2tpcCBzaWxlbnRseVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBSRUFETUUgZm9yIHRoZSBoYW5kb2ZmIHRlbXBsYXRlcyBmb2xkZXJcbiAgICBpZiAoZ2VuZXJhdGVkVGVtcGxhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHJlYWRtZUNvbnRlbnQgPSBgIyBIYW5kb2ZmIFRlbXBsYXRlIFBhcnRzXG5cbj4g4pqg77iPICoqRE8gTk9UIEVESVQgVEhFU0UgRklMRVMgRElSRUNUTFkqKlxuPlxuPiBUaGVzZSBmaWxlcyBhcmUgYXV0b21hdGljYWxseSBnZW5lcmF0ZWQgYnkgdGhlIEhhbmRvZmYgV29yZFByZXNzIGNvbXBpbGVyLlxuPiBBbnkgY2hhbmdlcyB3aWxsIGJlIG92ZXJ3cml0dGVuIG9uIHRoZSBuZXh0IHN5bmMuXG5cbiMjIFNvdXJjZVxuXG5UaGVzZSB0ZW1wbGF0ZXMgd2VyZSB0cmFuc3BpbGVkIGZyb20gdGhlIEhhbmRvZmYgZGVzaWduIHN5c3RlbS5cblxuLSAqKkFQSSBVUkw6KiogJHthcGlVcmx9XG4tICoqR2VuZXJhdGVkOioqICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfVxuXG4jIyBGaWxlc1xuXG4ke2dlbmVyYXRlZFRlbXBsYXRlcy5tYXAoZiA9PiBgLSBcXGAke2Z9XFxgYCkuam9pbignXFxuJyl9XG5cbiMjIFVzYWdlXG5cbkluY2x1ZGUgdGhlc2UgdGVtcGxhdGUgcGFydHMgaW4geW91ciB0aGVtZSB1c2luZzpcblxuXFxgXFxgXFxgcGhwXG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9oZWFkZXItY29tcGFjdCcpOyA/PlxuPD9waHAgZ2V0X3RlbXBsYXRlX3BhcnQoJ3RlbXBsYXRlLXBhcnRzL2hhbmRvZmYvZm9vdGVyLWNvbXBhY3QnKTsgPz5cblxcYFxcYFxcYFxuXG4jIyBSZWdlbmVyYXRpbmdcblxuVG8gcmVnZW5lcmF0ZSB0aGVzZSBmaWxlcywgcnVuOlxuXG5cXGBcXGBcXGBiYXNoXG5ucHggaGFuZG9mZi13cCAtLXRoZW1lXG5cXGBcXGBcXGBcblxuT3Igd2l0aCBhIHNwZWNpZmljIEFQSSBVUkw6XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWUgLS1hcGktdXJsICR7YXBpVXJsfVxuXFxgXFxgXFxgXG5gO1xuICAgICAgY29uc3QgcmVhZG1lUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCAnUkVBRE1FLm1kJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHJlYWRtZVBhdGgsIHJlYWRtZUNvbnRlbnQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk50gR2VuZXJhdGVkOiAke3JlYWRtZVBhdGh9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uY3NzIGFuZCBtYWluLmpzIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIHRoZW1lIGFzc2V0cy4uLmApO1xuICAgIFxuICAgIC8vIEVuc3VyZSBhc3NldHMgZGlyZWN0b3JpZXMgZXhpc3RcbiAgICBjb25zdCBjc3NEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2NzcycpO1xuICAgIGNvbnN0IGpzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Fzc2V0cycsICdqcycpO1xuICAgIFxuICAgIGlmICghZnMuZXhpc3RzU3luYyhjc3NEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoY3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGpzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGpzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5jc3NcbiAgICBjb25zdCBjc3NVcmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oY3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRG93bmxvYWRpbmcgbWFpbi5jc3MuLi5gKTtcbiAgICBjb25zdCBjc3NEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGNzc1VybCwgY3NzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGNzc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZDogJHtjc3NQYXRofWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uY3NzIGZyb20gJHtjc3NVcmx9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG1haW4uanNcbiAgICBjb25zdCBqc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmpzYDtcbiAgICBjb25zdCBqc1BhdGggPSBwYXRoLmpvaW4oanNEaXIsICdtYWluLmpzJyk7XG4gICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uanMuLi5gKTtcbiAgICBjb25zdCBqc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoanNVcmwsIGpzUGF0aCwgYXV0aCk7XG4gICAgaWYgKGpzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkOiAke2pzUGF0aH1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBUaGVtZSB0ZW1wbGF0ZXMgZ2VuZXJhdGVkIVxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHNpbmdsZSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGUgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPFZhbGlkYXRpb25SZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgXG4gIC8vIExvYWQgbWFuaWZlc3RcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgXG4gIC8vIFZhbGlkYXRlXG4gIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBcbiAgLy8gT3V0cHV0IHJlc3VsdFxuICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGVBbGwgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIG91dHB1dERpcjogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIEFsbCBDb21wb25lbnRzYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBGZXRjaCBjb21wb25lbnQgbGlzdFxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgaW1wb3J0Q29uZmlnLCBhdXRoKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgLy8gTG9hZCBtYW5pZmVzdFxuICAgIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgbGV0IHZhbGlkID0gMDtcbiAgICBsZXQgaW52YWxpZCA9IDA7XG4gICAgbGV0IG5ld0NvbXBvbmVudHMgPSAwO1xuICAgIGNvbnN0IGJyZWFraW5nQ2hhbmdlczogVmFsaWRhdGlvblJlc3VsdFtdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50SWQsIGF1dGgpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChyZXN1bHQuaXNOZXcpIHtcbiAgICAgICAgICBuZXdDb21wb25lbnRzKys7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICB2YWxpZCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGludmFsaWQrKztcbiAgICAgICAgICBicmVha2luZ0NoYW5nZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIHZhbGlkYXRlICR7Y29tcG9uZW50SWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFN1bW1hcnlcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGDwn5OKIFZhbGlkYXRpb24gU3VtbWFyeWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgVmFsaWQ6ICR7dmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKdjCBCcmVha2luZyBDaGFuZ2VzOiAke2ludmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKcqCBOZXcgQ29tcG9uZW50czogJHtuZXdDb21wb25lbnRzfWApO1xuICAgIFxuICAgIGlmIChicmVha2luZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgV0FSTklORzogJHticmVha2luZ0NoYW5nZXMubGVuZ3RofSBjb21wb25lbnQocykgaGF2ZSBicmVha2luZyBjaGFuZ2VzIWApO1xuICAgICAgY29uc29sZS5sb2coYCAgIFRoZXNlIGNoYW5nZXMgbWF5IGJyZWFrIGV4aXN0aW5nIFdvcmRQcmVzcyBjb250ZW50LlxcbmApO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudHMgd2l0aCBicmVha2luZyBjaGFuZ2VzOmApO1xuICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgYnJlYWtpbmdDaGFuZ2VzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAtICR7cmVzdWx0LmNvbXBvbmVudFRpdGxlfSAoJHtyZXN1bHQuY29tcG9uZW50SWR9KWApO1xuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYFxcbiAgIFRvIHByb2NlZWQgYW55d2F5LCBjb21waWxlIHdpdGggLS1mb3JjZSBmbGFnLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyoIEFsbCBjb21wb25lbnRzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHkhXFxuYCk7XG4gICAgfVxuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICovXG5jb25zdCB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudCA9IChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogdm9pZCA9PiB7XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdCA9IHVwZGF0ZU1hbmlmZXN0KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBzYXZlTWFuaWZlc3Qob3V0cHV0RGlyLCB1cGRhdGVkTWFuaWZlc3QpO1xufTtcblxuLy8gQ0xJIHNldHVwXG5wcm9ncmFtXG4gIC5uYW1lKCdndXRlbmJlcmctY29tcGlsZScpXG4gIC5kZXNjcmlwdGlvbignVHJhbnNwaWxlIEhhbmRvZmYgY29tcG9uZW50cyB0byBXb3JkUHJlc3MgR3V0ZW5iZXJnIGJsb2NrcyBhbmQgdGhlbWUgdGVtcGxhdGVzJylcbiAgLnZlcnNpb24oJzEuMC4wJyk7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBjb25maWcgZmlsZVxuICovXG5jb25zdCBpbml0Q29uZmlnID0gKG9wdHM6IHtcbiAgYXBpVXJsPzogc3RyaW5nO1xuICBvdXRwdXQ/OiBzdHJpbmc7XG4gIHRoZW1lRGlyPzogc3RyaW5nO1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIGZvcmNlPzogYm9vbGVhbjtcbn0pOiB2b2lkID0+IHtcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBcbiAgLy8gQ2hlY2sgaWYgY29uZmlnIGFscmVhZHkgZXhpc3RzXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpICYmICFvcHRzLmZvcmNlKSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29uZmlnIGZpbGUgYWxyZWFkeSBleGlzdHM6ICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVXNlIC0tZm9yY2UgdG8gb3ZlcndyaXRlLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgY29uc3QgbmV3Q29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7XG4gICAgYXBpVXJsOiBvcHRzLmFwaVVybCA/PyAnaHR0cHM6Ly95b3VyLWhhbmRvZmYtc2l0ZS5jb20nLFxuICAgIG91dHB1dDogb3B0cy5vdXRwdXQgPz8gJy4vZGVtby9wbHVnaW4vYmxvY2tzJyxcbiAgICB0aGVtZURpcjogb3B0cy50aGVtZURpciA/PyAnLi9kZW1vL3RoZW1lJyxcbiAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyAnJyxcbiAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyAnJyxcbiAgfTtcbiAgXG4gIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgXG4gIGNvbnNvbGUubG9nKGBcXG7inIUgQ3JlYXRlZCBjb25maWcgZmlsZTogJHtjb25maWdQYXRofWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uOmApO1xuICBjb25zb2xlLmxvZyhgICAgYXBpVXJsOiAgICR7bmV3Q29uZmlnLmFwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIG91dHB1dDogICAke25ld0NvbmZpZy5vdXRwdXR9YCk7XG4gIGNvbnNvbGUubG9nKGAgICB0aGVtZURpcjogJHtuZXdDb25maWcudGhlbWVEaXJ9YCk7XG4gIGlmIChuZXdDb25maWcudXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgdXNlcm5hbWU6ICR7bmV3Q29uZmlnLnVzZXJuYW1lfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBwYXNzd29yZDogKioqKmApO1xuICB9XG4gIGNvbnNvbGUubG9nKGBcXG7wn5KhIEVkaXQgdGhpcyBmaWxlIHRvIGNvbmZpZ3VyZSB5b3VyIEhhbmRvZmYgQVBJIHNldHRpbmdzLlxcbmApO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgaGVscGVyXG4gKi9cbmNvbnN0IHByb21wdCA9IChxdWVzdGlvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc3QgcmVhZGxpbmUgPSByZXF1aXJlKCdyZWFkbGluZScpO1xuICBjb25zdCBybCA9IHJlYWRsaW5lLmNyZWF0ZUludGVyZmFjZSh7XG4gICAgaW5wdXQ6IHByb2Nlc3Muc3RkaW4sXG4gICAgb3V0cHV0OiBwcm9jZXNzLnN0ZG91dCxcbiAgfSk7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBybC5xdWVzdGlvbihxdWVzdGlvbiwgKGFuc3dlcjogc3RyaW5nKSA9PiB7XG4gICAgICBybC5jbG9zZSgpO1xuICAgICAgcmVzb2x2ZShhbnN3ZXIudHJpbSgpKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBmb3IgeWVzL25vXG4gKi9cbmNvbnN0IHByb21wdFllc05vID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgY29uc3QgZGVmYXVsdFN0ciA9IGRlZmF1bHRWYWx1ZSA/ICdZL24nIDogJ3kvTic7XG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgJHtxdWVzdGlvbn0gWyR7ZGVmYXVsdFN0cn1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gIHJldHVybiBhbnN3ZXIudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCd5Jyk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCB3aXRoIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0Q2hvaWNlID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGNob2ljZXM6IHN0cmluZ1tdLCBkZWZhdWx0SW5kZXg6IG51bWJlciA9IDApOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxuJHtxdWVzdGlvbn1gKTtcbiAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGkpID0+IHtcbiAgICBjb25zdCBtYXJrZXIgPSBpID09PSBkZWZhdWx0SW5kZXggPyAnPicgOiAnICc7XG4gICAgY29uc29sZS5sb2coYCAgJHttYXJrZXJ9ICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlciBbJHtkZWZhdWx0SW5kZXggKyAxfV06IGApO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIGNob2ljZXNbZGVmYXVsdEluZGV4XTtcbiAgXG4gIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoYW5zd2VyLCAxMCkgLSAxO1xuICBpZiAoaW5kZXggPj0gMCAmJiBpbmRleCA8IGNob2ljZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGNob2ljZXNbaW5kZXhdO1xuICB9XG4gIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBmb3IgbXVsdGlwbGUgY2hvaWNlc1xuICovXG5jb25zdCBwcm9tcHRNdWx0aUNob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc29sZS5sb2coYCAgJHtpICsgMX0uICR7Y2hvaWNlfWApO1xuICB9KTtcbiAgXG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgRW50ZXIgbnVtYmVycyBzZXBhcmF0ZWQgYnkgY29tbWFzIChlLmcuLCAxLDIsMykgb3IgJ2FsbCc6IGApO1xuICBpZiAoYW5zd2VyLnRvTG93ZXJDYXNlKCkgPT09ICdhbGwnKSByZXR1cm4gY2hvaWNlcztcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBbY2hvaWNlc1swXV07XG4gIFxuICBjb25zdCBpbmRpY2VzID0gYW5zd2VyLnNwbGl0KCcsJykubWFwKHMgPT4gcGFyc2VJbnQocy50cmltKCksIDEwKSAtIDEpO1xuICByZXR1cm4gaW5kaWNlc1xuICAgIC5maWx0ZXIoaSA9PiBpID49IDAgJiYgaSA8IGNob2ljZXMubGVuZ3RoKVxuICAgIC5tYXAoaSA9PiBjaG9pY2VzW2ldKTtcbn07XG5cbi8qKlxuICogRmluZCBhbGwgYXJyYXkgcHJvcGVydGllcyBpbiBhIGNvbXBvbmVudFxuICovXG5jb25zdCBmaW5kQXJyYXlQcm9wZXJ0aWVzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9PiA9PiB7XG4gIGNvbnN0IGFycmF5czogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICBcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgYXJyYXlzLnB1c2goeyBwYXRoLCBwcm9wZXJ0eSB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdHNcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgYXJyYXlzLnB1c2goLi4uZmluZEFycmF5UHJvcGVydGllcyhwcm9wZXJ0eS5wcm9wZXJ0aWVzLCBwYXRoKSk7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gYXJyYXlzO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBmaWVsZCBtYXBwaW5nIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGFycmF5IGl0ZW0gcHJvcGVydGllc1xuICovXG5jb25zdCBzdWdnZXN0RmllbGRNYXBwaW5ncyA9IChpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPT4ge1xuICBjb25zdCBzdWdnZXN0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBcbiAgY29uc3QgbWFwUHJvcGVydHkgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpID0+IHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICAgIFxuICAgICAgLy8gU3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBjb21tb24gcGF0dGVybnNcbiAgICAgIGNvbnN0IGxvd2VyS2V5ID0ga2V5LnRvTG93ZXJDYXNlKCk7XG4gICAgICBcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2ltYWdlJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3Bob3RvJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3RodW1ibmFpbCcpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ2ZlYXR1cmVkX2ltYWdlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkgPT09ICd0aXRsZScgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2hlYWRpbmcnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnbmFtZScpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfdGl0bGUnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnZXhjZXJwdCcpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdzdW1tYXJ5JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2Rlc2NyaXB0aW9uJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9leGNlcnB0JztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2NvbnRlbnQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnYm9keScpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfY29udGVudCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndXJsJyB8fCBsb3dlcktleSA9PT0gJ2hyZWYnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdsaW5rJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncGVybWFsaW5rJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2RhdGUnKSkge1xuICAgICAgICBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2RheScpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmRheV9udW1lcmljJztcbiAgICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnbW9udGgnKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTptb250aF9zaG9ydCc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ3llYXInKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTp5ZWFyJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6ZnVsbCc7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2F1dGhvcicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ2F1dGhvci5uYW1lJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2NhdGVnb3J5JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3RhZycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3RheG9ub215OmNhdGVnb3J5JztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG5lc3RlZCBvYmplY3RzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgbWFwUHJvcGVydHkocHJvcC5wcm9wZXJ0aWVzLCBwYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBtYXBQcm9wZXJ0eShpdGVtUHJvcGVydGllcyk7XG4gIHJldHVybiBzdWdnZXN0aW9ucztcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgd2l6YXJkIGZvciBjb25maWd1cmluZyBkeW5hbWljIGFycmF5c1xuICovXG5jb25zdCBjb25maWd1cmVEeW5hbWljQXJyYXlzID0gYXN5bmMgKFxuICBhcGlVcmw6IHN0cmluZyxcbiAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuICBhdXRoPzogQXV0aENyZWRlbnRpYWxzXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCfp5kgRHluYW1pYyBBcnJheSBDb25maWd1cmF0aW9uIFdpemFyZGApO1xuICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50OiAke2NvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7YXBpVXJsfVxcbmApO1xuICBcbiAgLy8gRmV0Y2ggY29tcG9uZW50XG4gIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBzdHJ1Y3R1cmUuLi5gKTtcbiAgbGV0IGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudDtcbiAgdHJ5IHtcbiAgICBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9ICgke2NvbXBvbmVudC5pZH0pXFxuYCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG4gIFxuICAvLyBGaW5kIGFycmF5IHByb3BlcnRpZXNcbiAgY29uc3QgYXJyYXlQcm9wcyA9IGZpbmRBcnJheVByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICBcbiAgaWYgKGFycmF5UHJvcHMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgTm8gYXJyYXkgcHJvcGVydGllcyBmb3VuZCBpbiB0aGlzIGNvbXBvbmVudC5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRHluYW1pYyBhcnJheXMgYXJlIG9ubHkgYXZhaWxhYmxlIGZvciBhcnJheS10eXBlIHByb3BlcnRpZXMuXFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhg8J+TiyBGb3VuZCAke2FycmF5UHJvcHMubGVuZ3RofSBhcnJheSBmaWVsZChzKTpgKTtcbiAgYXJyYXlQcm9wcy5mb3JFYWNoKChhcnIsIGkpID0+IHtcbiAgICBjb25zdCBpdGVtQ291bnQgPSBhcnIucHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgPyBPYmplY3Qua2V5cyhhcnIucHJvcGVydHkuaXRlbXMucHJvcGVydGllcykubGVuZ3RoIDogMDtcbiAgICBjb25zb2xlLmxvZyhgICAgJHtpICsgMX0uICR7YXJyLnBhdGh9ICgke2l0ZW1Db3VudH0gaXRlbSBwcm9wZXJ0aWVzKWApO1xuICB9KTtcbiAgXG4gIC8vIFNlbGVjdCB3aGljaCBhcnJheXMgdG8gY29uZmlndXJlXG4gIGNvbnN0IHNlbGVjdGVkQXJyYXlzID0gYXJyYXlQcm9wcy5sZW5ndGggPT09IDEgXG4gICAgPyBbYXJyYXlQcm9wc1swXV1cbiAgICA6IGF3YWl0IChhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNob2ljZXMgPSBhcnJheVByb3BzLm1hcChhID0+IGEucGF0aCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcHJvbXB0TXVsdGlDaG9pY2UoJ1doaWNoIGFycmF5KHMpIGRvIHlvdSB3YW50IHRvIGNvbmZpZ3VyZT8nLCBjaG9pY2VzKTtcbiAgICAgICAgcmV0dXJuIGFycmF5UHJvcHMuZmlsdGVyKGEgPT4gc2VsZWN0ZWQuaW5jbHVkZXMoYS5wYXRoKSk7XG4gICAgICB9KSgpO1xuICBcbiAgLy8gTG9hZCBleGlzdGluZyBjb25maWdcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBsZXQgZXhpc3RpbmdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHt9O1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBleGlzdGluZ0NvbmZpZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIElnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEJ1aWxkIHRoZSBpbXBvcnQgY29uZmlnLCBwcmVzZXJ2aW5nIGV4aXN0aW5nIGVudHJpZXNcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSBleGlzdGluZ0NvbmZpZy5pbXBvcnQgfHwgeyBlbGVtZW50OiBmYWxzZSB9O1xuICBpZiAoIWltcG9ydENvbmZpZy5ibG9jayB8fCB0eXBlb2YgaW1wb3J0Q29uZmlnLmJsb2NrID09PSAnYm9vbGVhbicpIHtcbiAgICBpbXBvcnRDb25maWcuYmxvY2sgPSB7fTtcbiAgfVxuICBjb25zdCBibG9ja0NvbmZpZyA9IGltcG9ydENvbmZpZy5ibG9jayBhcyBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+O1xuICBpZiAoIWJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gPT09ICdib29sZWFuJykge1xuICAgIGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gPSB7fTtcbiAgfVxuICBjb25zdCBjb21wb25lbnRGaWVsZENvbmZpZyA9IGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gYXMgUmVjb3JkPHN0cmluZywgRmllbGRDb25maWc+O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVQb3N0c0FycmF5ID0gYXN5bmMgKGFycmF5UHJvcDogeyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfSk6IFByb21pc2U8RHluYW1pY0FycmF5Q29uZmlnPiA9PiB7XG4gICAgLy8gU2VsZWN0aW9uIG1vZGVcbiAgICBjb25zdCBzZWxlY3Rpb25Nb2RlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ0hvdyBzaG91bGQgdXNlcnMgc2VsZWN0IHBvc3RzPycsXG4gICAgICBbJ1F1ZXJ5IEJ1aWxkZXIgKGZpbHRlciBieSB0YXhvbm9teSwgb3JkZXIsIGV0Yy4pJywgJ01hbnVhbCBTZWxlY3Rpb24gKGhhbmQtcGljayBzcGVjaWZpYyBwb3N0cyknXSxcbiAgICAgIDBcbiAgICApO1xuICAgIGNvbnN0IGlzUXVlcnlNb2RlID0gc2VsZWN0aW9uTW9kZS5pbmNsdWRlcygnUXVlcnknKTtcblxuICAgIC8vIFBvc3QgdHlwZXNcbiAgICBjb25zb2xlLmxvZyhgXFxuRW50ZXIgYWxsb3dlZCBwb3N0IHR5cGVzIChjb21tYS1zZXBhcmF0ZWQpOmApO1xuICAgIGNvbnN0IHBvc3RUeXBlc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBQb3N0IHR5cGVzIFtwb3N0XTogYCk7XG4gICAgY29uc3QgcG9zdFR5cGVzID0gcG9zdFR5cGVzSW5wdXRcbiAgICAgID8gcG9zdFR5cGVzSW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdCddO1xuXG4gICAgLy8gTWF4IGl0ZW1zXG4gICAgY29uc3QgbWF4SXRlbXNJbnB1dCA9IGF3YWl0IHByb21wdChgTWF4aW11bSBpdGVtcyBbMTJdOiBgKTtcbiAgICBjb25zdCBtYXhJdGVtcyA9IG1heEl0ZW1zSW5wdXQgPyBwYXJzZUludChtYXhJdGVtc0lucHV0LCAxMCkgOiAxMjtcblxuICAgIC8vIFJlbmRlciBtb2RlXG4gICAgY29uc3QgcmVuZGVyTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHBvc3RzIGJlIHJlbmRlcmVkPycsXG4gICAgICBbJ01hcHBlZCAoY29udmVydCBwb3N0IGZpZWxkcyB0byB0ZW1wbGF0ZSBzdHJ1Y3R1cmUpJywgJ1RlbXBsYXRlICh1c2UgYSBQSFAgdGVtcGxhdGUgZmlsZSknXSxcbiAgICAgIDBcbiAgICApO1xuICAgIGNvbnN0IGlzTWFwcGVkTW9kZSA9IHJlbmRlck1vZGUuaW5jbHVkZXMoJ01hcHBlZCcpO1xuXG4gICAgbGV0IGZpZWxkTWFwcGluZzogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGxldCB0ZW1wbGF0ZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIGlmIChpc01hcHBlZE1vZGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OKIEZpZWxkIE1hcHBpbmcgQ29uZmlndXJhdGlvbmApO1xuXG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBhcnJheVByb3AucHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXM7XG4gICAgICBpZiAoaXRlbVByb3BzKSB7XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gc3VnZ2VzdEZpZWxkTWFwcGluZ3MoaXRlbVByb3BzKTtcblxuICAgICAgICBjb25zb2xlLmxvZyhgXFxuSSdsbCBzdWdnZXN0IG1hcHBpbmdzIGJhc2VkIG9uIGZpZWxkIG5hbWVzLiBQcmVzcyBFbnRlciB0byBhY2NlcHQgb3IgdHlwZSBhIG5ldyB2YWx1ZS5gKTtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbkF2YWlsYWJsZSBzb3VyY2VzOmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHBvc3RfdGl0bGUsIHBvc3RfZXhjZXJwdCwgcG9zdF9jb250ZW50LCBwZXJtYWxpbmssIHBvc3RfaWRgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBmZWF0dXJlZF9pbWFnZWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHBvc3RfZGF0ZTpkYXksIHBvc3RfZGF0ZTptb250aF9zaG9ydCwgcG9zdF9kYXRlOnllYXIsIHBvc3RfZGF0ZTpmdWxsYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gYXV0aG9yLm5hbWUsIGF1dGhvci51cmwsIGF1dGhvci5hdmF0YXJgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSB0YXhvbm9teTpjYXRlZ29yeSwgdGF4b25vbXk6cG9zdF90YWdgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBtZXRhOmZpZWxkX25hbWVgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSAobGVhdmUgZW1wdHkgdG8gc2tpcClcXG5gKTtcblxuICAgICAgICBjb25zdCBmbGF0dGVuUHJvcHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgY29uc3QgcGF0aHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICAgICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaCguLi5mbGF0dGVuUHJvcHMocHJvcC5wcm9wZXJ0aWVzLCBwKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXRocy5wdXNoKHApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcGF0aHM7XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZFBhdGggb2YgZmxhdHRlblByb3BzKGl0ZW1Qcm9wcykpIHtcbiAgICAgICAgICBjb25zdCBzdWdnZXN0aW9uID0gc3VnZ2VzdGlvbnNbZmllbGRQYXRoXSB8fCAnJztcbiAgICAgICAgICBjb25zdCBkZWZhdWx0U3RyID0gc3VnZ2VzdGlvbiA/IGAgWyR7c3VnZ2VzdGlvbn1dYCA6ICcnO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSBhd2FpdCBwcm9tcHQoYCAgJHtmaWVsZFBhdGh9JHtkZWZhdWx0U3RyfTogYCk7XG4gICAgICAgICAgY29uc3QgZmluYWxNYXBwaW5nID0gbWFwcGluZyB8fCBzdWdnZXN0aW9uO1xuICAgICAgICAgIGlmIChmaW5hbE1hcHBpbmcpIHtcbiAgICAgICAgICAgIGlmIChmaW5hbE1hcHBpbmcuc3RhcnRzV2l0aCgneycpKSB7XG4gICAgICAgICAgICAgIHRyeSB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gSlNPTi5wYXJzZShmaW5hbE1hcHBpbmcpOyB9XG4gICAgICAgICAgICAgIGNhdGNoIHsgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBmaW5hbE1hcHBpbmc7IH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBkZWZhdWx0VGVtcGxhdGUgPSBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2FycmF5UHJvcC5wYXRofS1pdGVtLnBocGA7XG4gICAgICB0ZW1wbGF0ZVBhdGggPSBhd2FpdCBwcm9tcHQoYFRlbXBsYXRlIHBhdGggWyR7ZGVmYXVsdFRlbXBsYXRlfV06IGApIHx8IGRlZmF1bHRUZW1wbGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBhcnJheUNvbmZpZzogRHluYW1pY0FycmF5Q29uZmlnID0ge1xuICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgIHBvc3RUeXBlcyxcbiAgICAgIHNlbGVjdGlvbk1vZGU6IGlzUXVlcnlNb2RlID8gJ3F1ZXJ5JyA6ICdtYW51YWwnLFxuICAgICAgbWF4SXRlbXMsXG4gICAgICByZW5kZXJNb2RlOiBpc01hcHBlZE1vZGUgPyAnbWFwcGVkJyA6ICd0ZW1wbGF0ZScsXG4gICAgfTtcbiAgICBpZiAoaXNNYXBwZWRNb2RlICYmIE9iamVjdC5rZXlzKGZpZWxkTWFwcGluZykubGVuZ3RoID4gMCkgYXJyYXlDb25maWcuZmllbGRNYXBwaW5nID0gZmllbGRNYXBwaW5nO1xuICAgIGlmICghaXNNYXBwZWRNb2RlICYmIHRlbXBsYXRlUGF0aCkgYXJyYXlDb25maWcudGVtcGxhdGVQYXRoID0gdGVtcGxhdGVQYXRoO1xuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgYXJyYXlDb25maWcuZGVmYXVsdFF1ZXJ5QXJncyA9IHtcbiAgICAgICAgcG9zdHNfcGVyX3BhZ2U6IE1hdGgubWluKG1heEl0ZW1zLCA2KSxcbiAgICAgICAgb3JkZXJieTogJ2RhdGUnLFxuICAgICAgICBvcmRlcjogJ0RFU0MnLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGFycmF5Q29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkgPSBhc3luYyAoKTogUHJvbWlzZTxCcmVhZGNydW1ic0FycmF5Q29uZmlnPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIEJyZWFkY3J1bWJzIGFyZSBidWlsdCBhdXRvbWF0aWNhbGx5IGZyb20gdGhlIGN1cnJlbnQgcGFnZSBVUkwuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igd2lsbCBzaG93IGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcbiAgICByZXR1cm4geyBhcnJheVR5cGU6ICdicmVhZGNydW1icycgfTtcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIFRheG9ub215QXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVUYXhvbm9teUFycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8VGF4b25vbXlBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBUYXhvbm9teSB0ZXJtcyBhcmUgZmV0Y2hlZCBmcm9tIHRoZSBjdXJyZW50IHBvc3Qgc2VydmVyLXNpZGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igc2hvd3MgYSB0b2dnbGUgYW5kIGEgZHJvcGRvd24gdG8gY2hvb3NlIHRoZSB0YXhvbm9teS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgc2x1ZyB9XFxuYCk7XG5cbiAgICBjb25zb2xlLmxvZyhgRW50ZXIgdGhlIHRheG9ub215IHNsdWdzIGVkaXRvcnMgY2FuIGNob29zZSBmcm9tIChjb21tYS1zZXBhcmF0ZWQpOmApO1xuICAgIGNvbnN0IHRheG9ub215SW5wdXQgPSBhd2FpdCBwcm9tcHQoYFRheG9ub21pZXMgW3Bvc3RfdGFnLGNhdGVnb3J5XTogYCk7XG4gICAgY29uc3QgdGF4b25vbWllcyA9IHRheG9ub215SW5wdXRcbiAgICAgID8gdGF4b25vbXlJbnB1dC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgIDogWydwb3N0X3RhZycsICdjYXRlZ29yeSddO1xuXG4gICAgY29uc3QgbWF4SXRlbXNJbnB1dCA9IGF3YWl0IHByb21wdChgTWF4aW11bSB0ZXJtcyB0byBkaXNwbGF5ICgtMSA9IGFsbCkgWy0xXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogLTE7XG5cbiAgICBjb25zdCBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcgPSB7IGFycmF5VHlwZTogJ3RheG9ub215JywgdGF4b25vbWllcyB9O1xuICAgIGlmIChtYXhJdGVtcyA+IDApIGNvbmZpZy5tYXhJdGVtcyA9IG1heEl0ZW1zO1xuICAgIHJldHVybiBjb25maWc7XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBQYWdpbmF0aW9uQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkgPSBhc3luYyAob3RoZXJBcnJheVBhdGhzOiBzdHJpbmdbXSk6IFByb21pc2U8UGFnaW5hdGlvbkFycmF5Q29uZmlnIHwgbnVsbD4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBQYWdpbmF0aW9uIGxpbmtzIGFyZSBkZXJpdmVkIGF1dG9tYXRpY2FsbHkgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXkgcXVlcnkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igc2hvd3MgYSBzaW5nbGUgZW5hYmxlL2Rpc2FibGUgdG9nZ2xlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBhY3RpdmUgfVxcbmApO1xuXG4gICAgaWYgKG90aGVyQXJyYXlQYXRocy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDimqDvuI8gIE5vIHNpYmxpbmcgYXJyYXlzIGZvdW5kIHRvIGNvbm5lY3QgdG8uIENvbmZpZ3VyZSBhIHBvc3RzIGFycmF5IGZpcnN0LmApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbGV0IGNvbm5lY3RlZEZpZWxkOiBzdHJpbmc7XG4gICAgaWYgKG90aGVyQXJyYXlQYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgIGNvbm5lY3RlZEZpZWxkID0gb3RoZXJBcnJheVBhdGhzWzBdO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbm5lY3RlZCB0bzogJHtjb25uZWN0ZWRGaWVsZH0gKG9ubHkgb3B0aW9uKWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAgICdXaGljaCBwb3N0cyBhcnJheSBzaG91bGQgdGhpcyBwYWdpbmF0aW9uIGJlIGNvbm5lY3RlZCB0bz8nLFxuICAgICAgICBvdGhlckFycmF5UGF0aHMsXG4gICAgICAgIDBcbiAgICAgICk7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IGNob2ljZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBhcnJheVR5cGU6ICdwYWdpbmF0aW9uJywgY29ubmVjdGVkRmllbGQgfTtcbiAgfTtcblxuICAvLyBDb25maWd1cmUgZWFjaCBzZWxlY3RlZCBhcnJheVxuICBmb3IgKGNvbnN0IGFycmF5UHJvcCBvZiBzZWxlY3RlZEFycmF5cykge1xuICAgIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgQ29uZmlndXJpbmc6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofVxcbmApO1xuXG4gICAgLy8gTGV0IHRoZSB1c2VyIGNob29zZSB0aGUgYXJyYXkgdHlwZVxuICAgIGNvbnN0IGFycmF5VHlwZUNob2ljZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdXaGF0IGtpbmQgb2YgZGF0YSBzaG91bGQgdGhpcyBhcnJheSBjb250YWluPycsXG4gICAgICBbXG4gICAgICAgICdQb3N0cyDigJQgcXVlcnkgb3IgaGFuZC1waWNrIFdvcmRQcmVzcyBwb3N0cyAoZGVmYXVsdCknLFxuICAgICAgICAnQnJlYWRjcnVtYnMg4oCUIGF1dG8tZ2VuZXJhdGVkIHRyYWlsIGZyb20gY3VycmVudCBVUkwnLFxuICAgICAgICAnVGF4b25vbXkg4oCUIHRlcm1zIGF0dGFjaGVkIHRvIHRoZSBjdXJyZW50IHBvc3QnLFxuICAgICAgICAnUGFnaW5hdGlvbiDigJQgbGlua3MgZGVyaXZlZCBmcm9tIGEgc2libGluZyBwb3N0cyBhcnJheScsXG4gICAgICBdLFxuICAgICAgMFxuICAgICk7XG5cbiAgICBsZXQgYXJyYXlDb25maWc6IEZpZWxkQ29uZmlnIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ0JyZWFkY3J1bWJzJykpIHtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlQnJlYWRjcnVtYnNBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ1RheG9ub215JykpIHtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlVGF4b25vbXlBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ1BhZ2luYXRpb24nKSkge1xuICAgICAgLy8gT2ZmZXIgdGhlIG90aGVyIGFscmVhZHktY29uZmlndXJlZCAob3IgeWV0LXRvLWJlLWNvbmZpZ3VyZWQpIGFycmF5IHBhdGhzIGFzIGNhbmRpZGF0ZXNcbiAgICAgIGNvbnN0IHNpYmxpbmcgPSBzZWxlY3RlZEFycmF5c1xuICAgICAgICAuZmlsdGVyKGEgPT4gYS5wYXRoICE9PSBhcnJheVByb3AucGF0aClcbiAgICAgICAgLm1hcChhID0+IGEucGF0aCk7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBhZ2luYXRpb25BcnJheShzaWJsaW5nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUG9zdHNcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlUG9zdHNBcnJheShhcnJheVByb3ApO1xuICAgIH1cblxuICAgIGlmIChhcnJheUNvbmZpZykge1xuICAgICAgY29tcG9uZW50RmllbGRDb25maWdbYXJyYXlQcm9wLnBhdGhdID0gYXJyYXlDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyFIENvbmZpZ3VyZWQ6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofSAoJHsoYXJyYXlDb25maWcgYXMgYW55KS5hcnJheVR5cGUgPz8gJ3Bvc3RzJ30pYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIFNraXBwZWQ6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofWApO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gVXBkYXRlIGNvbmZpZyBmaWxlIOKAlCByZW1vdmUgbGVnYWN5IGR5bmFtaWNBcnJheXMgaWYgcHJlc2VudFxuICBjb25zdCB7IGR5bmFtaWNBcnJheXM6IF9sZWdhY3lEeW5hbWljLCAuLi5yZXN0Q29uZmlnIH0gPSBleGlzdGluZ0NvbmZpZztcbiAgY29uc3QgbmV3Q29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7XG4gICAgLi4ucmVzdENvbmZpZyxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgfTtcbiAgXG4gIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5OEIENvbmZpZ3VyYXRpb24gUHJldmlldzpcXG5gKTtcbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoeyBpbXBvcnQ6IGltcG9ydENvbmZpZyB9LCBudWxsLCAyKSk7XG4gIFxuICBjb25zdCBzaG91bGRTYXZlID0gYXdhaXQgcHJvbXB0WWVzTm8oJ1xcblNhdmUgdG8gaGFuZG9mZi13cC5jb25maWcuanNvbj8nLCB0cnVlKTtcbiAgXG4gIGlmIChzaG91bGRTYXZlKSB7XG4gICAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShuZXdDb25maWcsIG51bGwsIDIpICsgJ1xcbicpO1xuICAgIGNvbnNvbGUubG9nKGBcXG7inIUgU2F2ZWQgdG8gJHtjb25maWdQYXRofWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIE5leHQgc3RlcHM6YCk7XG4gICAgY29uc29sZS5sb2coYCAgIDEuIFJ1bjogbnBtIHJ1biBkZXYgLS0gJHtjb21wb25lbnROYW1lfSAtLWZvcmNlYCk7XG4gICAgY29uc29sZS5sb2coYCAgIDIuIEJ1aWxkIHlvdXIgYmxvY2tzOiBjZCBkZW1vL3BsdWdpbiAmJiBucG0gcnVuIGJ1aWxkYCk7XG4gICAgY29uc29sZS5sb2coYCAgIDMuIFRlc3QgdGhlIGJsb2NrIGluIFdvcmRQcmVzc1xcbmApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZ3VyYXRpb24gbm90IHNhdmVkLiBDb3B5IHRoZSBKU09OIGFib3ZlIG1hbnVhbGx5IGlmIG5lZWRlZC5cXG5gKTtcbiAgfVxufTtcblxuLy8gQ29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGNvbW1hbmRcbnByb2dyYW1cbiAgLmNvbW1hbmQoJ2NvbmZpZ3VyZS1keW5hbWljIFtjb21wb25lbnRdJylcbiAgLmFsaWFzKCd3aXphcmQnKVxuICAuZGVzY3JpcHRpb24oJ0ludGVyYWN0aXZlIHdpemFyZCB0byBjb25maWd1cmUgZHluYW1pYyBhcnJheXMgZm9yIGEgY29tcG9uZW50JylcbiAgLm9wdGlvbignLWEsIC0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy1wLCAtLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCcpXG4gIC5vcHRpb24oJy1sLCAtLWxpc3QnLCAnTGlzdCBhdmFpbGFibGUgY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkcycpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czoge1xuICAgIGFwaVVybD86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICBsaXN0PzogYm9vbGVhbjtcbiAgfSkgPT4ge1xuICAgIGNvbnN0IGFwaVVybCA9IG9wdHMuYXBpVXJsID8/IGNvbmZpZy5hcGlVcmw7XG4gICAgY29uc3QgYXV0aDogQXV0aENyZWRlbnRpYWxzID0ge1xuICAgICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gY29uZmlnLnVzZXJuYW1lLFxuICAgICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gY29uZmlnLnBhc3N3b3JkLFxuICAgIH07XG4gICAgXG4gICAgLy8gSWYgbGlzdGluZyBjb21wb25lbnRzLCBzaG93IGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICBpZiAob3B0cy5saXN0IHx8ICFjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBGZXRjaGluZyBjb21wb25lbnQgbGlzdCBmcm9tICR7YXBpVXJsfS4uLlxcbmApO1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZldGNoIGVhY2ggY29tcG9uZW50IHRvIGZpbmQgb25lcyB3aXRoIGFycmF5IGZpZWxkc1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+TiyBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHMuIENoZWNraW5nIGZvciBhcnJheSBmaWVsZHMuLi5cXG5gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHNXaXRoQXJyYXlzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGFycmF5czogc3RyaW5nW10gfT4gPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgaWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgaWQsIGF1dGgpO1xuICAgICAgICAgICAgY29uc3QgYXJyYXlzID0gZmluZEFycmF5UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gICAgICAgICAgICBpZiAoYXJyYXlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgY29tcG9uZW50c1dpdGhBcnJheXMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgICAgdGl0bGU6IGNvbXBvbmVudC50aXRsZSxcbiAgICAgICAgICAgICAgICBhcnJheXM6IGFycmF5cy5tYXAoYSA9PiBhLnBhdGgpLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIFNraXAgZmFpbGVkIGNvbXBvbmVudHNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjb21wb25lbnRzV2l0aEFycmF5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pqg77iPICBObyBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzIGZvdW5kLlxcbmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYPCfp6kgQ29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkczpcXG5gKTtcbiAgICAgICAgY29tcG9uZW50c1dpdGhBcnJheXMuZm9yRWFjaCgoYywgaSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2kgKyAxfS4gJHtjLnRpdGxlfSAoJHtjLmlkfSlgKTtcbiAgICAgICAgICBjLmFycmF5cy5mb3JFYWNoKGEgPT4gY29uc29sZS5sb2coYCAgICAgIOKUlOKUgCAke2F9YCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIGlmIChvcHRzLmxpc3QpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBSdW46IG5wbSBydW4gZGV2IC0tIHdpemFyZCA8Y29tcG9uZW50LWlkPlxcbmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gSW50ZXJhY3RpdmUgc2VsZWN0aW9uXG4gICAgICAgIGNvbnN0IGNob2ljZXMgPSBjb21wb25lbnRzV2l0aEFycmF5cy5tYXAoYyA9PiBgJHtjLnRpdGxlfSAoJHtjLmlkfSlgKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwcm9tcHRDaG9pY2UoJ1xcblNlbGVjdCBhIGNvbXBvbmVudCB0byBjb25maWd1cmU6JywgY2hvaWNlcywgMCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkSW5kZXggPSBjaG9pY2VzLmluZGV4T2Yoc2VsZWN0ZWQpO1xuICAgICAgICBjb21wb25lbnROYW1lID0gY29tcG9uZW50c1dpdGhBcnJheXNbc2VsZWN0ZWRJbmRleF0uaWQ7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgYXdhaXQgY29uZmlndXJlRHluYW1pY0FycmF5cyhhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICB9KTtcblxuLy8gSW5pdCBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdpbml0JylcbiAgLmRlc2NyaXB0aW9uKCdDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4gdGhlIGN1cnJlbnQgZGlyZWN0b3J5JylcbiAgLm9wdGlvbignLS1hcGktdXJsIDx1cmw+JywgJ0hhbmRvZmYgQVBJIGJhc2UgVVJMJylcbiAgLm9wdGlvbignLS1vdXRwdXQgPGRpcj4nLCAnT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzJylcbiAgLm9wdGlvbignLS10aGVtZS1kaXIgPGRpcj4nLCAnVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcycpXG4gIC5vcHRpb24oJy0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lJylcbiAgLm9wdGlvbignLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctLWZvcmNlJywgJ092ZXJ3cml0ZSBleGlzdGluZyBjb25maWcgZmlsZScpXG4gIC5hY3Rpb24oKG9wdGlvbnMsIGNvbW1hbmQpID0+IHtcbiAgICAvLyBVc2Ugb3B0c1dpdGhHbG9iYWxzIHRvIGdldCBvcHRpb25zIGZyb20gYm90aCBzdWJjb21tYW5kIGFuZCBwYXJlbnRcbiAgICBjb25zdCBvcHRzID0gY29tbWFuZC5vcHRzV2l0aEdsb2JhbHMoKTtcbiAgICBpbml0Q29uZmlnKG9wdHMpO1xuICB9KTtcblxuLy8gRGVmYXVsdCBjb21tYW5kIGZvciBibG9ja3NcbnByb2dyYW1cbiAgLmFyZ3VtZW50KCdbY29tcG9uZW50XScsICdDb21wb25lbnQgbmFtZSB0byBjb21waWxlIG9yIHZhbGlkYXRlJylcbiAgLm9wdGlvbignLWEsIC0tYXBpLXVybCA8dXJsPicsIGBIYW5kb2ZmIEFQSSBiYXNlIFVSTCAoZGVmYXVsdDogJHtjb25maWcuYXBpVXJsfSlgKVxuICAub3B0aW9uKCctbywgLS1vdXRwdXQgPGRpcj4nLCBgT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzIChkZWZhdWx0OiAke2NvbmZpZy5vdXRwdXR9KWApXG4gIC5vcHRpb24oJy0tYWxsJywgJ0NvbXBpbGUgYWxsIGF2YWlsYWJsZSBjb21wb25lbnRzJylcbiAgLm9wdGlvbignLS10aGVtZScsICdDb21waWxlIHRoZW1lIHRlbXBsYXRlcyAoaGVhZGVyLCBmb290ZXIpIHRvIHRoZW1lIGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy10LCAtLXRoZW1lLWRpciA8ZGlyPicsIGBUaGVtZSBkaXJlY3RvcnkgZm9yIGhlYWRlci9mb290ZXIgdGVtcGxhdGVzIChkZWZhdWx0OiAke2NvbmZpZy50aGVtZURpcn0pYClcbiAgLm9wdGlvbignLXUsIC0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lIGZvciBIYW5kb2ZmIEFQSScpXG4gIC5vcHRpb24oJy1wLCAtLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctLXZhbGlkYXRlJywgJ1ZhbGlkYXRlIGEgY29tcG9uZW50IGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZS1hbGwnLCAnVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXMnKVxuICAub3B0aW9uKCctLWZvcmNlJywgJ0ZvcmNlIGNvbXBpbGF0aW9uIGV2ZW4gd2l0aCBicmVha2luZyBjaGFuZ2VzJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7IFxuICAgIGFwaVVybD86IHN0cmluZzsgXG4gICAgb3V0cHV0Pzogc3RyaW5nOyBcbiAgICBhbGw/OiBib29sZWFuOyBcbiAgICB0aGVtZT86IGJvb2xlYW47XG4gICAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgdmFsaWRhdGU/OiBib29sZWFuO1xuICAgIHZhbGlkYXRlQWxsPzogYm9vbGVhbjtcbiAgICBmb3JjZT86IGJvb2xlYW47XG4gIH0pID0+IHtcbiAgICAvLyBNZXJnZSBDTEkgb3B0aW9ucyB3aXRoIGNvbmZpZyAoQ0xJIHRha2VzIHByZWNlZGVuY2UpXG4gICAgY29uc3QgYXBpVXJsID0gb3B0cy5hcGlVcmwgPz8gY29uZmlnLmFwaVVybDtcbiAgICBjb25zdCBvdXRwdXQgPSBvcHRzLm91dHB1dCA/PyBjb25maWcub3V0cHV0O1xuICAgIGNvbnN0IHRoZW1lRGlyID0gb3B0cy50aGVtZURpciA/PyBjb25maWcudGhlbWVEaXI7XG4gICAgY29uc3QgYXV0aDogQXV0aENyZWRlbnRpYWxzID0ge1xuICAgICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gY29uZmlnLnVzZXJuYW1lLFxuICAgICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gY29uZmlnLnBhc3N3b3JkLFxuICAgIH07XG4gICAgXG4gICAgLy8gVmFsaWRhdGlvbiBjb21tYW5kc1xuICAgIGlmIChvcHRzLnZhbGlkYXRlQWxsKSB7XG4gICAgICBhd2FpdCB2YWxpZGF0ZUFsbChhcGlVcmwsIG91dHB1dCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIGlmIChvcHRzLnZhbGlkYXRlICYmIGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGFwaVVybCwgb3V0cHV0LCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQgJiYgIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29tcG9uZW50IGhhcyBicmVha2luZyBjaGFuZ2VzLiBVc2UgLS1mb3JjZSB0byBjb21waWxlIGFueXdheS5cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxhdGlvbiBjb21tYW5kc1xuICAgIGlmIChvcHRzLnRoZW1lKSB7XG4gICAgICBhd2FpdCBjb21waWxlVGhlbWUoYXBpVXJsLCB0aGVtZURpciwgYXV0aCk7XG4gICAgfSBlbHNlIGlmIChvcHRzLmFsbCkge1xuICAgICAgLy8gVmFsaWRhdGUgYWxsIGZpcnN0IHVubGVzcyBmb3JjZWRcbiAgICAgIGlmICghb3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBQcmUtY29tcGlsYXRpb24gdmFsaWRhdGlvbi4uLlxcbmApO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGFwaVVybCwgb3V0cHV0LCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gdmFsaWRhdGVBbGwgZXhpdHMgd2l0aCBjb2RlIDEgb24gYnJlYWtpbmcgY2hhbmdlc1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgY29tcGlsZUFsbChhcGlVcmwsIG91dHB1dCwgYXV0aCk7XG4gICAgICBcbiAgICAgIC8vIFVwZGF0ZSBtYW5pZmVzdCBhZnRlciBzdWNjZXNzZnVsIGNvbXBpbGF0aW9uXG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TnSBVcGRhdGluZyBwcm9wZXJ0eSBtYW5pZmVzdC4uLmApO1xuICAgICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgZmV0Y2hDb21wb25lbnRMaXN0KGFwaVVybCwgY29uZmlnLmltcG9ydCwgYXV0aCk7XG4gICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50SWQsIGF1dGgpO1xuICAgICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIC8vIEJ1aWxkIG1lcmdlZC1ncm91cCBsb29rdXAgb25jZSBmb3IgdGhpcyBicmFuY2hcbiAgICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICAgIH1cblxuICAgICAgLy8gSGVscGVyOiBjb21waWxlIGFuIGVudGlyZSBtZXJnZWQgZ3JvdXAgYnkgaXRzIGNvbmZpZyBrZXlcbiAgICAgIGNvbnN0IGNvbXBpbGVHcm91cEJ5S2V5ID0gYXN5bmMgKGdyb3VwS2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGZldGNoQWxsQ29tcG9uZW50c0xpc3QoYXBpVXJsLCBhdXRoKTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBncm91cEtleS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnRzIGZvdW5kIGZvciBtZXJnZWQgZ3JvdXAgXCIke2dyb3VwS2V5fVwiLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmdWxsR3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIGdyb3VwTWF0Y2hlcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjLmlkLCBhdXRoKTtcbiAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoZnVsbCk7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBTa2lwcGluZyAke2MuaWR9ICh0ZW1wbGF0ZSB2YWxpZGF0aW9uIGZhaWxlZClgKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdWxsR3JvdXBDb21wb25lbnRzLnB1c2goZnVsbCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICDinYwgRmFpbGVkIHRvIGZldGNoICR7Yy5pZH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZ1bGxHcm91cENvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IENvdWxkIG5vdCBmZXRjaCBhbnkgY29tcG9uZW50cyBmb3IgZ3JvdXAgXCIke2dyb3VwS2V5fVwiLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoYXBpVXJsLCBvdXRwdXQsIGdyb3VwS2V5LCBmdWxsR3JvdXBDb21wb25lbnRzLCBhdXRoKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKchSBHcm91cCBcIiR7Z3JvdXBLZXl9XCIgY29tcGlsZWQgKCR7ZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKS5cXG5gKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFRyeSBjb21wb25lbnQgZmlyc3QsIHRoZW4gZmFsbCBiYWNrIHRvIGdyb3VwIChlLmcuIFwiaGVyb1wiIC0+IEhlcm8gbWVyZ2VkIGJsb2NrKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnROYW1lLCBhdXRoKTtcblxuICAgICAgICAvLyBJZiB0aGlzIGNvbXBvbmVudCBiZWxvbmdzIHRvIGEgbWVyZ2VkIGdyb3VwLCBjb21waWxlIHRoZSB3aG9sZSBncm91cCBpbnN0ZWFkXG4gICAgICAgIGlmIChjb21wb25lbnQuZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCBncm91cEtleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoY29tcG9uZW50Lmdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgIGlmIChncm91cEtleSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgIFwiJHtjb21wb25lbnROYW1lfVwiIGJlbG9uZ3MgdG8gbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIiDigJQgY29tcGlsaW5nIGVudGlyZSBncm91cC5cXG5gKTtcbiAgICAgICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShhcGlVcmwsIG91dHB1dCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gICAgICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29tcG9uZW50IGhhcyBicmVha2luZyBjaGFuZ2VzLiBVc2UgLS1mb3JjZSB0byBjb21waWxlIGFueXdheS5cXG5gKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgY29tcGlsZSh7XG4gICAgICAgICAgYXBpVXJsLFxuICAgICAgICAgIG91dHB1dERpcjogb3V0cHV0LFxuICAgICAgICAgIGNvbXBvbmVudE5hbWUsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIPCfk50gTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgICAgfSBjYXRjaCAoY29tcG9uZW50RXJyb3IpIHtcbiAgICAgICAgLy8gTm8gY29tcG9uZW50IHdpdGggdGhpcyBuYW1lIOKAkyB0cnkgYXMgZ3JvdXBcbiAgICAgICAgY29uc29sZS5sb2coYCAgIE5vIGNvbXBvbmVudCBcIiR7Y29tcG9uZW50TmFtZX1cIiBmb3VuZCwgY2hlY2tpbmcgZ3JvdXBzLi4uXFxuYCk7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0KGFwaVVybCwgYXV0aCk7XG4gICAgICAgIGNvbnN0IG5hbWVMb3dlciA9IGNvbXBvbmVudE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBuYW1lTG93ZXIsXG4gICAgICAgICk7XG4gICAgICAgIGlmIChncm91cE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IE5vIGNvbXBvbmVudCBvciBncm91cCBmb3VuZCBmb3IgXCIke2NvbXBvbmVudE5hbWV9XCIuYCk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAgICAgIENvbXBvbmVudCBmZXRjaDogJHtjb21wb25lbnRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gY29tcG9uZW50RXJyb3IubWVzc2FnZSA6IGNvbXBvbmVudEVycm9yfWApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBncm91cEtleSA9XG4gICAgICAgICAgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChuYW1lTG93ZXIpID8/IGdyb3VwTWF0Y2hlc1swXS5ncm91cDtcbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwQnlLZXkoZ3JvdXBLZXkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogUGxlYXNlIHNwZWNpZnkgYSBjb21wb25lbnQgbmFtZSwgZ3JvdXAgbmFtZSwgdXNlIC0tYWxsIGZsYWcsIC0tdGhlbWUgZmxhZywgb3IgLS12YWxpZGF0ZS1hbGwgZmxhZycpO1xuICAgICAgY29uc29sZS5sb2coJ1xcblVzYWdlOicpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxjb21wb25lbnQtbmFtZT4gICBDb21waWxlIG9uZSBjb21wb25lbnQgKGUuZy4gaGVyby1hcnRpY2xlKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxncm91cC1uYW1lPiAgICAgIE9yIGNvbXBpbGUgYSBtZXJnZWQgZ3JvdXAgKGUuZy4gaGVybyknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdGhlbWUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlIGhlcm8tYXJ0aWNsZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdmFsaWRhdGUtYWxsJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwgLS1mb3JjZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIGhlcm8gLS1hcGktdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMCAtLW91dHB1dCAuL2Jsb2NrcycpO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfSk7XG5cbnByb2dyYW0ucGFyc2UoKTtcblxuZXhwb3J0IHsgY29tcGlsZSwgZ2VuZXJhdGVCbG9jaywgZmV0Y2hDb21wb25lbnQgfTtcbiJdfQ==