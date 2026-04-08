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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHlDQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZDQUErQjtBQUMvQiwyQ0FBNkI7QUFDN0IsbURBQXFDO0FBQ3JDLGlEQUF5QztBQUV6QyxtQ0FBZ1M7QUEyQmhTOztHQUVHO0FBQ0gsTUFBTSxjQUFjLEdBQW1CO0lBQ3JDLE1BQU0sRUFBRSx1QkFBdUI7SUFDL0IsTUFBTSxFQUFFLFVBQVU7SUFDbEIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtJQUMxQixNQUFNLEVBQUUsRUFBRTtDQUNYLENBQUM7QUFFRjs7O0dBR0c7QUFDSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsYUFBaUQsRUFBZ0IsRUFBRTtJQUMvRixNQUFNLFlBQVksR0FBaUIsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDdEQsTUFBTSxXQUFXLEdBQTBDLEVBQUUsQ0FBQztJQUU5RCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztZQUFFLFNBQVM7UUFDOUIsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUM7WUFBRSxTQUFTO1FBQzlCLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFF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aUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNILENBQUM7U0FBTSxDQUFDO1FBQ04sT0FBTyxDQUFDLEtBQUssQ0FBQywwR0FBMEcsQ0FBQyxDQUFDO1FBQzFILE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzRkFBc0YsQ0FBQyxDQUFDO1FBQ3BHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUZBQWlGLENBQUMsQ0FBQztRQUMvRixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMsaURBQWlELENBQUMsQ0FBQztRQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztRQUM5RixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVMLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogR3V0ZW5iZXJnIENvbXBpbGVyXG4gKiBcbiAqIFRyYW5zcGlsZXMgSGFuZG9mZiBjb21wb25lbnRzIHRvIFdvcmRQcmVzcyBHdXRlbmJlcmcgYmxvY2tzLlxuICogXG4gKiBVc2FnZTpcbiAqICAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxjb21wb25lbnQtbmFtZT4gW29wdGlvbnNdXG4gKiAgIFxuICogT3B0aW9uczpcbiAqICAgLS1hcGktdXJsIDx1cmw+ICAgIEhhbmRvZmYgQVBJIGJhc2UgVVJMIChkZWZhdWx0OiBodHRwOi8vbG9jYWxob3N0OjQwMDApXG4gKiAgIC0tb3V0cHV0IDxkaXI+ICAgICBPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MgKGRlZmF1bHQ6IC4vYmxvY2tzKVxuICogICAtLWFsbCAgICAgICAgICAgICAgQ29tcGlsZSBhbGwgYXZhaWxhYmxlIGNvbXBvbmVudHNcbiAqICAgLS10aGVtZSAgICAgICAgICAgIENvbXBpbGUgaGVhZGVyL2Zvb3RlciB0byB0aGVtZSB0ZW1wbGF0ZXNcbiAqICAgLS12YWxpZGF0ZSAgICAgICAgIFZhbGlkYXRlIGEgY29tcG9uZW50IGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiAgIC0tdmFsaWRhdGUtYWxsICAgICBWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgY2hhbmdlc1xuICogXG4gKiBDb25maWd1cmF0aW9uOlxuICogICBDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4geW91ciBwcm9qZWN0IHJvb3QgdG8gc2V0IGRlZmF1bHRzOlxuICogICB7XG4gKiAgICAgXCJhcGlVcmxcIjogXCJodHRwczovL2RlbW8uaGFuZG9mZi5jb21cIixcbiAqICAgICBcIm91dHB1dFwiOiBcIi4vcGF0aC90by9ibG9ja3NcIixcbiAqICAgICBcInRoZW1lRGlyXCI6IFwiLi9wYXRoL3RvL3RoZW1lXCJcbiAqICAgfVxuICovXG5cbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBwcmV0dGllciBmcm9tICdwcmV0dGllcic7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHksIENvbXBpbGVyT3B0aW9ucywgR2VuZXJhdGVkQmxvY2ssIEhhbmRvZmZXcENvbmZpZywgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEZpZWxkQ29uZmlnLCBJbXBvcnRDb25maWcsIENvbXBvbmVudEltcG9ydENvbmZpZywgRmllbGRQcmVmZXJlbmNlcywgaXNEeW5hbWljQXJyYXlDb25maWcgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBBdXRoIGNyZWRlbnRpYWxzIGZvciBIVFRQIHJlcXVlc3RzXG4gKi9cbmludGVyZmFjZSBBdXRoQ3JlZGVudGlhbHMge1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVxdWlyZWQgY29uZmlnIHdpdGggZGVmYXVsdHMgYXBwbGllZFxuICovXG5pbnRlcmZhY2UgUmVzb2x2ZWRDb25maWcge1xuICBhcGlVcmw6IHN0cmluZztcbiAgb3V0cHV0OiBzdHJpbmc7XG4gIHRoZW1lRGlyOiBzdHJpbmc7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbiAgaW1wb3J0OiBJbXBvcnRDb25maWc7XG4gIGdyb3VwczogUmVjb3JkPHN0cmluZywgJ21lcmdlZCcgfCAnaW5kaXZpZHVhbCc+O1xuICBzY2hlbWFNaWdyYXRpb25zPzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywge1xuICAgIHJlbmFtZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIHRyYW5zZm9ybXM/OiBSZWNvcmQ8c3RyaW5nLCB7IGZyb206IHN0cmluZzsgdG86IHN0cmluZzsgcnVsZTogc3RyaW5nIH0+O1xuICB9Pj47XG59XG5cbi8qKlxuICogRGVmYXVsdCBjb25maWd1cmF0aW9uIHZhbHVlc1xuICovXG5jb25zdCBERUZBVUxUX0NPTkZJRzogUmVzb2x2ZWRDb25maWcgPSB7XG4gIGFwaVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gIG91dHB1dDogJy4vYmxvY2tzJyxcbiAgdGhlbWVEaXI6ICcuL3RoZW1lJyxcbiAgdXNlcm5hbWU6IHVuZGVmaW5lZCxcbiAgcGFzc3dvcmQ6IHVuZGVmaW5lZCxcbiAgaW1wb3J0OiB7IGVsZW1lbnQ6IGZhbHNlIH0sXG4gIGdyb3Vwczoge30sXG59O1xuXG4vKipcbiAqIE1pZ3JhdGUgbGVnYWN5IGBkeW5hbWljQXJyYXlzYCBjb25maWcgdG8gdGhlIG5ldyBgaW1wb3J0YCBzdHJ1Y3R1cmUuXG4gKiBHcm91cHMgXCJjb21wb25lbnRJZC5maWVsZE5hbWVcIiBlbnRyaWVzIHVuZGVyIGltcG9ydC5ibG9ja1tjb21wb25lbnRJZF1bZmllbGROYW1lXS5cbiAqL1xuY29uc3QgbWlncmF0ZUR5bmFtaWNBcnJheXMgPSAoZHluYW1pY0FycmF5czogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPik6IEltcG9ydENvbmZpZyA9PiB7XG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0geyBlbGVtZW50OiBmYWxzZSB9O1xuICBjb25zdCBibG9ja0NvbmZpZzogUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICghY29uZmlnLmVuYWJsZWQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGRvdEluZGV4ID0ga2V5LmluZGV4T2YoJy4nKTtcbiAgICBpZiAoZG90SW5kZXggPT09IC0xKSBjb250aW51ZTtcbiAgICBjb25zdCBjb21wb25lbnRJZCA9IGtleS5zdWJzdHJpbmcoMCwgZG90SW5kZXgpO1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoZG90SW5kZXggKyAxKTtcblxuICAgIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50SWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPT09ICdib29sZWFuJykge1xuICAgICAgYmxvY2tDb25maWdbY29tcG9uZW50SWRdID0ge307XG4gICAgfVxuICAgIChibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPilbZmllbGROYW1lXSA9IGNvbmZpZztcbiAgfVxuXG4gIGlmIChPYmplY3Qua2V5cyhibG9ja0NvbmZpZykubGVuZ3RoID4gMCkge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IGJsb2NrQ29uZmlnO1xuICB9XG5cbiAgcmV0dXJuIGltcG9ydENvbmZpZztcbn07XG5cbi8qKlxuICogTG9hZCBjb25maWd1cmF0aW9uIGZyb20gaGFuZG9mZi13cC5jb25maWcuanNvbiBpZiBpdCBleGlzdHNcbiAqL1xuY29uc3QgbG9hZENvbmZpZyA9ICgpOiBIYW5kb2ZmV3BDb25maWcgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpO1xuICAgICAgY29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjb25maWdDb250ZW50KSBhcyBIYW5kb2ZmV3BDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ThCBMb2FkZWQgY29uZmlnIGZyb20gJHtjb25maWdQYXRofWApO1xuICAgICAgcmV0dXJuIGNvbmZpZztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZhaWxlZCB0byBwYXJzZSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4ge307XG59O1xuXG4vKipcbiAqIE1lcmdlIGNvbmZpZ3VyYXRpb24gc291cmNlcyB3aXRoIHByaW9yaXR5OiBDTEkgPiBjb25maWcgZmlsZSA+IGRlZmF1bHRzXG4gKi9cbmNvbnN0IGdldENvbmZpZyA9ICgpOiBSZXNvbHZlZENvbmZpZyA9PiB7XG4gIGNvbnN0IGZpbGVDb25maWcgPSBsb2FkQ29uZmlnKCk7XG5cbiAgbGV0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnO1xuICBpZiAoZmlsZUNvbmZpZy5pbXBvcnQpIHtcbiAgICBpbXBvcnRDb25maWcgPSBmaWxlQ29uZmlnLmltcG9ydDtcbiAgfSBlbHNlIGlmIChmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpIHtcbiAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgXCJkeW5hbWljQXJyYXlzXCIgY29uZmlnIGlzIGRlcHJlY2F0ZWQuIE1pZ3JhdGUgdG8gXCJpbXBvcnRcIiDigJQgc2VlIFNQRUNJRklDQVRJT04ubWQuYCk7XG4gICAgaW1wb3J0Q29uZmlnID0gbWlncmF0ZUR5bmFtaWNBcnJheXMoZmlsZUNvbmZpZy5keW5hbWljQXJyYXlzKTtcbiAgfSBlbHNlIHtcbiAgICBpbXBvcnRDb25maWcgPSBERUZBVUxUX0NPTkZJRy5pbXBvcnQ7XG4gIH1cbiAgXG4gIHJldHVybiB7XG4gICAgYXBpVXJsOiBmaWxlQ29uZmlnLmFwaVVybCA/PyBERUZBVUxUX0NPTkZJRy5hcGlVcmwsXG4gICAgb3V0cHV0OiBmaWxlQ29uZmlnLm91dHB1dCA/PyBERUZBVUxUX0NPTkZJRy5vdXRwdXQsXG4gICAgdGhlbWVEaXI6IGZpbGVDb25maWcudGhlbWVEaXIgPz8gREVGQVVMVF9DT05GSUcudGhlbWVEaXIsXG4gICAgdXNlcm5hbWU6IGZpbGVDb25maWcudXNlcm5hbWUgPz8gREVGQVVMVF9DT05GSUcudXNlcm5hbWUsXG4gICAgcGFzc3dvcmQ6IGZpbGVDb25maWcucGFzc3dvcmQgPz8gREVGQVVMVF9DT05GSUcucGFzc3dvcmQsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gICAgZ3JvdXBzOiBmaWxlQ29uZmlnLmdyb3VwcyA/PyBERUZBVUxUX0NPTkZJRy5ncm91cHMsXG4gICAgc2NoZW1hTWlncmF0aW9uczogZmlsZUNvbmZpZy5zY2hlbWFNaWdyYXRpb25zLFxuICB9O1xufTtcblxuXG4vKipcbiAqIEJ1aWxkIEhUVFAgcmVxdWVzdCBvcHRpb25zIHdpdGggb3B0aW9uYWwgYmFzaWMgYXV0aFxuICovXG5jb25zdCBidWlsZFJlcXVlc3RPcHRpb25zID0gKHVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogaHR0cC5SZXF1ZXN0T3B0aW9ucyB8IGh0dHBzLlJlcXVlc3RPcHRpb25zID0+IHtcbiAgY29uc3QgcGFyc2VkVXJsID0gbmV3IFVSTCh1cmwpO1xuICBjb25zdCBvcHRpb25zOiBodHRwLlJlcXVlc3RPcHRpb25zID0ge1xuICAgIGhvc3RuYW1lOiBwYXJzZWRVcmwuaG9zdG5hbWUsXG4gICAgcG9ydDogcGFyc2VkVXJsLnBvcnQgfHwgKHBhcnNlZFVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyA0NDMgOiA4MCksXG4gICAgcGF0aDogcGFyc2VkVXJsLnBhdGhuYW1lICsgcGFyc2VkVXJsLnNlYXJjaCxcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIGhlYWRlcnM6IHt9LFxuICB9O1xuICBcbiAgaWYgKGF1dGg/LnVzZXJuYW1lICYmIGF1dGg/LnBhc3N3b3JkKSB7XG4gICAgY29uc3QgY3JlZGVudGlhbHMgPSBCdWZmZXIuZnJvbShgJHthdXRoLnVzZXJuYW1lfToke2F1dGgucGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIG9wdGlvbnMuaGVhZGVycyA9IHtcbiAgICAgIC4uLm9wdGlvbnMuaGVhZGVycyxcbiAgICAgICdBdXRob3JpemF0aW9uJzogYEJhc2ljICR7Y3JlZGVudGlhbHN9YCxcbiAgICB9O1xuICB9XG4gIFxuICByZXR1cm4gb3B0aW9ucztcbn07XG5cbi8vIExvYWQgY29uZmlnIGF0IHN0YXJ0dXBcbmNvbnN0IGNvbmZpZyA9IGdldENvbmZpZygpO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVCbG9ja0pzb24sXG4gIGdlbmVyYXRlSW5kZXhKcyxcbiAgZ2VuZXJhdGVSZW5kZXJQaHAsXG4gIGdlbmVyYXRlRWRpdG9yU2NzcyxcbiAgZ2VuZXJhdGVTdHlsZVNjc3MsXG4gIGdlbmVyYXRlUmVhZG1lLFxuICB0b0Jsb2NrTmFtZSxcbiAgZ2VuZXJhdGVIZWFkZXJQaHAsXG4gIGdlbmVyYXRlRm9vdGVyUGhwLFxuICBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocCxcbiAgZ2VuZXJhdGVDYXRlZ29yaWVzUGhwLFxuICBnZW5lcmF0ZVNoYXJlZENvbXBvbmVudHMsXG4gIGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hLFxuICBnZW5lcmF0ZU1lcmdlZEJsb2NrLFxuICBnZW5lcmF0ZURlcHJlY2F0aW9ucyxcbiAgZ2VuZXJhdGVTY2hlbWFDaGFuZ2Vsb2csXG59IGZyb20gJy4vZ2VuZXJhdG9ycyc7XG5pbXBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB7XG4gIGxvYWRNYW5pZmVzdCxcbiAgc2F2ZU1hbmlmZXN0LFxuICB2YWxpZGF0ZUNvbXBvbmVudCxcbiAgdXBkYXRlTWFuaWZlc3QsXG4gIGdldENvbXBvbmVudEhpc3RvcnksXG4gIGV4dHJhY3RQcm9wZXJ0aWVzLFxuICBmb3JtYXRWYWxpZGF0aW9uUmVzdWx0LFxuICBWYWxpZGF0aW9uUmVzdWx0LFxuICB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzLFxuICBmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHRcbn0gZnJvbSAnLi92YWxpZGF0b3JzJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hSGlzdG9yeSB9IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5cbi8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUHJldHRpZXIgKHVzaW5nIHJlcXVpcmUgZm9yIGNvbXBhdGliaWxpdHkpXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuY29uc3QgcGhwUGx1Z2luID0gcmVxdWlyZSgnQHByZXR0aWVyL3BsdWdpbi1waHAnKTtcblxuLyoqXG4gKiBGb3JtYXQgY29kZSB3aXRoIFByZXR0aWVyXG4gKi9cbmNvbnN0IGZvcm1hdENvZGUgPSBhc3luYyAoY29kZTogc3RyaW5nLCBwYXJzZXI6ICdiYWJlbCcgfCAnanNvbicgfCAnc2NzcycgfCAncGhwJyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3B0aW9uczogcHJldHRpZXIuT3B0aW9ucyA9IHtcbiAgICAgIHBhcnNlcixcbiAgICAgIHNpbmdsZVF1b3RlOiB0cnVlLFxuICAgICAgdGFiV2lkdGg6IDIsXG4gICAgICBwcmludFdpZHRoOiAxMDAsXG4gICAgICB0cmFpbGluZ0NvbW1hOiAnZXM1JyxcbiAgICB9O1xuICAgIFxuICAgIC8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUEhQIGZpbGVzXG4gICAgaWYgKHBhcnNlciA9PT0gJ3BocCcpIHtcbiAgICAgIG9wdGlvbnMucGx1Z2lucyA9IFtwaHBQbHVnaW5dO1xuICAgICAgLy8gUEhQLXNwZWNpZmljIG9wdGlvbnMgLSBjYXN0IHRvIGFueSBmb3IgcGx1Z2luLXNwZWNpZmljIG9wdGlvbnNcbiAgICAgIChvcHRpb25zIGFzIGFueSkucGhwVmVyc2lvbiA9ICc4LjAnO1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5icmFjZVN0eWxlID0gJzF0YnMnO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYXdhaXQgcHJldHRpZXIuZm9ybWF0KGNvZGUsIG9wdGlvbnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIGZvcm1hdHRpbmcgZmFpbHMsIHJldHVybiBvcmlnaW5hbCBjb2RlXG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFByZXR0aWVyIGZvcm1hdHRpbmcgZmFpbGVkIGZvciAke3BhcnNlcn0sIHVzaW5nIHVuZm9ybWF0dGVkIGNvZGVgKTtcbiAgICByZXR1cm4gY29kZTtcbiAgfVxufTtcblxuY29uc3QgcHJvZ3JhbSA9IG5ldyBDb21tYW5kKCk7XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgY29weSBhIGRpcmVjdG9yeSB0cmVlLCBjcmVhdGluZyB0YXJnZXQgZGlycyBhcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGNvcHlEaXJSZWN1cnNpdmUgPSAoc3JjOiBzdHJpbmcsIGRlc3Q6IHN0cmluZyk6IHZvaWQgPT4ge1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZGVzdCkpIHtcbiAgICBmcy5ta2RpclN5bmMoZGVzdCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBmcy5yZWFkZGlyU3luYyhzcmMpKSB7XG4gICAgY29uc3Qgc3JjUGF0aCA9IHBhdGguam9pbihzcmMsIGVudHJ5KTtcbiAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihkZXN0LCBlbnRyeSk7XG4gICAgaWYgKGZzLnN0YXRTeW5jKHNyY1BhdGgpLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHBhY2thZ2UuanNvbiBpbiB0aGUgY29udGVudCBkaXJlY3RvcnkgYW5kIHJ1biBucG0gaW5zdGFsbFxuICogc28gdGhhdCBibG9ja3MgYW5kIHNoYXJlZCBjb21wb25lbnRzIGNhbiByZXNvbHZlIHRoZWlyIGltcG9ydHMuXG4gKi9cbmNvbnN0IGVuc3VyZUNvbnRlbnREZXBlbmRlbmNpZXMgPSAoY29udGVudFJvb3Q6IHN0cmluZyk6IHZvaWQgPT4ge1xuICBjb25zdCBwa2dQYXRoID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAncGFja2FnZS5qc29uJyk7XG5cbiAgY29uc3QgcGtnID0ge1xuICAgIG5hbWU6ICdoYW5kb2ZmLWJsb2Nrcy1jb250ZW50JyxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIHByaXZhdGU6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBdXRvLWdlbmVyYXRlZCBieSBIYW5kb2ZmIGNvbXBpbGVyIOKAlCBibG9jayBidWlsZCBkZXBlbmRlbmNpZXMuJyxcbiAgICBkZXBlbmRlbmNpZXM6IHtcbiAgICAgICdAMTB1cC9ibG9jay1jb21wb25lbnRzJzogJ14xLjIyLjEnLFxuICAgIH0sXG4gICAgZGV2RGVwZW5kZW5jaWVzOiB7XG4gICAgICAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9ibG9ja3MnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9jb21wb25lbnRzJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvY29yZS1kYXRhJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvZGF0YSc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2VsZW1lbnQnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9pMThuJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvaWNvbnMnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9zY3JpcHRzJzogJ14yNy4wLjAnLFxuICAgICAgJ2NvcHktd2VicGFjay1wbHVnaW4nOiAnXjExLjAuMCcsXG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBkZXNpcmVkID0gSlNPTi5zdHJpbmdpZnkocGtnLCBudWxsLCAyKSArICdcXG4nO1xuXG4gIGxldCBuZWVkc0luc3RhbGwgPSB0cnVlO1xuICBpZiAoZnMuZXhpc3RzU3luYyhwa2dQYXRoKSkge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gZnMucmVhZEZpbGVTeW5jKHBrZ1BhdGgsICd1dGY4Jyk7XG4gICAgaWYgKGV4aXN0aW5nID09PSBkZXNpcmVkKSB7XG4gICAgICBuZWVkc0luc3RhbGwgPSAhZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4oY29udGVudFJvb3QsICdub2RlX21vZHVsZXMnKSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG5lZWRzSW5zdGFsbCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OmIEluc3RhbGxpbmcgYmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzLi4uYCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhwa2dQYXRoLCBkZXNpcmVkKTtcbiAgICB0cnkge1xuICAgICAgZXhlY1N5bmMoJ25wbSBpbnN0YWxsIC0taWdub3JlLXNjcmlwdHMnLCB7XG4gICAgICAgIGN3ZDogY29udGVudFJvb3QsXG4gICAgICAgIHN0ZGlvOiAnaW5oZXJpdCcsXG4gICAgICB9KTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRGVwZW5kZW5jaWVzIGluc3RhbGxlZCBpbiAke2NvbnRlbnRSb290fWApO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIG5wbSBpbnN0YWxsIGZhaWxlZCDigJQgeW91IG1heSBuZWVkIHRvIHJ1biBpdCBtYW51YWxseSBpbiAke2NvbnRlbnRSb290fWApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+TpiBCbG9jayBidWlsZCBkZXBlbmRlbmNpZXMgYWxyZWFkeSB1cCB0byBkYXRlYCk7XG4gIH1cbn07XG5cbi8qKlxuICogRG93bmxvYWQgYSBmaWxlIGZyb20gYSBVUkwgYW5kIHNhdmUgaXQgdG8gZGlza1xuICovXG5jb25zdCBkb3dubG9hZEZpbGUgPSBhc3luYyAodXJsOiBzdHJpbmcsIGRlc3RQYXRoOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICAvLyBIYW5kbGUgcmVkaXJlY3RzXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDMwMSB8fCByZXMuc3RhdHVzQ29kZSA9PT0gMzAyKSB7XG4gICAgICAgIGNvbnN0IHJlZGlyZWN0VXJsID0gcmVzLmhlYWRlcnMubG9jYXRpb247XG4gICAgICAgIGlmIChyZWRpcmVjdFVybCkge1xuICAgICAgICAgIGRvd25sb2FkRmlsZShyZWRpcmVjdFVybCwgZGVzdFBhdGgsIGF1dGgpLnRoZW4ocmVzb2x2ZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gZG93bmxvYWQgc2NyZWVuc2hvdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBmaWxlU3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oZGVzdFBhdGgpO1xuICAgICAgcmVzLnBpcGUoZmlsZVN0cmVhbSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsICgpID0+IHtcbiAgICAgICAgZmlsZVN0cmVhbS5jbG9zZSgpO1xuICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICBmcy51bmxpbmsoZGVzdFBhdGgsICgpID0+IHt9KTsgLy8gQ2xlYW4gdXAgcGFydGlhbCBmaWxlXG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gc2F2ZSBzY3JlZW5zaG90OiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBjb21wb25lbnQgZGF0YSBmcm9tIEhhbmRvZmYgQVBJXG4gKi9cbmNvbnN0IGZldGNoQ29tcG9uZW50ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnQ+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50LyR7Y29tcG9uZW50TmFtZX0uanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50IEpTT046ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbGwgYmxvY2sgZmlsZXMgZnJvbSBhIGNvbXBvbmVudFxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gYXBpVXJsIC0gVGhlIGJhc2UgQVBJIFVSTCBmb3IgZmV0Y2hpbmcgc2NyZWVuc2hvdHNcbiAqIEBwYXJhbSByZXNvbHZlZENvbmZpZyAtIFRoZSByZXNvbHZlZCBjb25maWd1cmF0aW9uIGluY2x1ZGluZyBkeW5hbWljIGFycmF5IHNldHRpbmdzXG4gKi9cbmNvbnN0IGdlbmVyYXRlQmxvY2sgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCBhcGlVcmw6IHN0cmluZywgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnLCBzY2hlbWFIaXN0b3J5PzogU2NoZW1hSGlzdG9yeSk6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgaGFzU2NyZWVuc2hvdCA9ICEhY29tcG9uZW50LmltYWdlO1xuICBcbiAgLy8gQ29uc3RydWN0IGZ1bGwgc2NyZWVuc2hvdCBVUkwgaWYgaW1hZ2UgcGF0aCBpcyBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3RVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgaWYgKGNvbXBvbmVudC5pbWFnZSkge1xuICAgIC8vIEhhbmRsZSBib3RoIGFic29sdXRlIFVSTHMgYW5kIHJlbGF0aXZlIHBhdGhzXG4gICAgaWYgKGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwOi8vJykgfHwgY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBjb21wb25lbnQuaW1hZ2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlbGF0aXZlIHBhdGggLSBwcmVwZW5kIEFQSSBVUkxcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBgJHthcGlVcmx9JHtjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wb25lbnQuaW1hZ2V9YDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciB0aGlzIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnXG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KVxuICB9O1xuICBcbiAgLy8gQXV0by1kZXRlY3QgcGFnaW5hdGlvbiBmb3IgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZW50cmllcyBvbmx5XG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggcmljaHRleHQgZmllbGQgKGlmIGFueSkgdXNlcyBJbm5lckJsb2Nrc1xuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIC8vIENoZWNrIGV4cGxpY2l0IGNvbmZpZyBvdmVycmlkZXMgZmlyc3RcbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cbiAgXG4gIGNvbnN0IGhpc3RvcnlFbnRyeSA9IHNjaGVtYUhpc3RvcnkgPyBnZXRDb21wb25lbnRIaXN0b3J5KHNjaGVtYUhpc3RvcnksIGNvbXBvbmVudC5pZCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGN1cnJlbnRQcm9wcyA9IGV4dHJhY3RQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgY29uc3QgbWlncmF0aW9uT3ZlcnJpZGVzID0gcmVzb2x2ZWRDb25maWcuc2NoZW1hTWlncmF0aW9ucz8uW2NvbXBvbmVudC5pZF07XG4gIGNvbnN0IGRlcHJlY2F0aW9uc0NvZGUgPSBnZW5lcmF0ZURlcHJlY2F0aW9ucyhcbiAgICBoaXN0b3J5RW50cnksXG4gICAgY3VycmVudFByb3BzLFxuICAgIG1pZ3JhdGlvbk92ZXJyaWRlcyxcbiAgICAhIWlubmVyQmxvY2tzRmllbGRcbiAgKTtcblxuICByZXR1cm4ge1xuICAgIGJsb2NrSnNvbjogZ2VuZXJhdGVCbG9ja0pzb24oY29tcG9uZW50LCBoYXNTY3JlZW5zaG90LCBhcGlVcmwsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQpLFxuICAgIGluZGV4SnM6IGdlbmVyYXRlSW5kZXhKcyhjb21wb25lbnQsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQsIGRlcHJlY2F0aW9uc0NvZGUpLFxuICAgIHJlbmRlclBocDogZ2VuZXJhdGVSZW5kZXJQaHAoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBlZGl0b3JTY3NzOiBnZW5lcmF0ZUVkaXRvclNjc3MoY29tcG9uZW50KSxcbiAgICBzdHlsZVNjc3M6IGdlbmVyYXRlU3R5bGVTY3NzKGNvbXBvbmVudCksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZVJlYWRtZShjb21wb25lbnQpLFxuICAgIG1pZ3JhdGlvblNjaGVtYTogZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEoY29tcG9uZW50KSxcbiAgICBzY2hlbWFDaGFuZ2Vsb2c6IGdlbmVyYXRlU2NoZW1hQ2hhbmdlbG9nKGNvbXBvbmVudC5pZCwgaGlzdG9yeUVudHJ5KSxcbiAgICBzY3JlZW5zaG90VXJsXG4gIH07XG59O1xuXG4vKipcbiAqIFdyaXRlIGJsb2NrIGZpbGVzIHRvIG91dHB1dCBkaXJlY3RvcnlcbiAqL1xuY29uc3Qgd3JpdGVCbG9ja0ZpbGVzID0gYXN5bmMgKG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnRJZDogc3RyaW5nLCBibG9jazogR2VuZXJhdGVkQmxvY2ssIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50SWQpO1xuICBjb25zdCBibG9ja0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGJsb2NrTmFtZSk7XG4gIFxuICAvLyBDcmVhdGUgYmxvY2sgZGlyZWN0b3J5XG4gIGlmICghZnMuZXhpc3RzU3luYyhibG9ja0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoYmxvY2tEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIFxuICAvLyBGb3JtYXQgYWxsIGNvZGUgZmlsZXMgd2l0aCBQcmV0dGllclxuICBjb25zdCBmb3JtYXR0ZWRCbG9ja0pzb24gPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmJsb2NrSnNvbiwgJ2pzb24nKTtcbiAgY29uc3QgZm9ybWF0dGVkSW5kZXhKcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suaW5kZXhKcywgJ2JhYmVsJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEVkaXRvclNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmVkaXRvclNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFN0eWxlU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suc3R5bGVTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBcbiAgLy8gV3JpdGUgZmlsZXNcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdSRUFETUUubWQnKSwgYmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgYmxvY2subWlncmF0aW9uU2NoZW1hKTtcbiAgaWYgKGJsb2NrLnNjaGVtYUNoYW5nZWxvZykge1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnc2NoZW1hLWNoYW5nZWxvZy5qc29uJyksIGJsb2NrLnNjaGVtYUNoYW5nZWxvZyk7XG4gIH1cbiAgXG4gIC8vIERvd25sb2FkIHNjcmVlbnNob3QgaWYgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90RG93bmxvYWRlZCA9IGZhbHNlO1xuICBpZiAoYmxvY2suc2NyZWVuc2hvdFVybCkge1xuICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoID0gcGF0aC5qb2luKGJsb2NrRGlyLCAnc2NyZWVuc2hvdC5wbmcnKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TtyBEb3dubG9hZGluZyBzY3JlZW5zaG90Li4uYCk7XG4gICAgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoYmxvY2suc2NyZWVuc2hvdFVybCwgc2NyZWVuc2hvdFBhdGgsIGF1dGgpO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBibG9jazogJHtibG9ja05hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OBICR7YmxvY2tEaXJ9YCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGJsb2NrLmpzb25gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgaW5kZXguanNgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgcmVuZGVyLnBocGApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBlZGl0b3Iuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBzdHlsZS5zY3NzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIFJFQURNRS5tZGApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBtaWdyYXRpb24tc2NoZW1hLmpzb25gKTtcbiAgaWYgKHNjcmVlbnNob3REb3dubG9hZGVkKSB7XG4gICAgY29uc29sZS5sb2coYCAgIPCflrzvuI8gIHNjcmVlbnNob3QucG5nYCk7XG4gIH1cbn07XG5cbi8qKlxuICogTWFpbiBjb21waWxhdGlvbiBmdW5jdGlvblxuICovXG5jb25zdCBjb21waWxlID0gYXN5bmMgKG9wdGlvbnM6IENvbXBpbGVyT3B0aW9ucyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UpyBHdXRlbmJlcmcgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtvcHRpb25zLmFwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudDogJHtvcHRpb25zLmNvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3B0aW9ucy5vdXRwdXREaXJ9YCk7XG4gIGlmIChvcHRpb25zLmF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7b3B0aW9ucy5hdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gRmV0Y2ggY29tcG9uZW50IGZyb20gQVBJXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGRhdGEuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChvcHRpb25zLmFwaVVybCwgb3B0aW9ucy5jb21wb25lbnROYW1lLCBvcHRpb25zLmF1dGgpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9ICgke2NvbXBvbmVudC5pZH0pXFxuYCk7XG4gICAgXG4gICAgLy8gVmFsaWRhdGUgdGVtcGxhdGUgdmFyaWFibGVzIGJlZm9yZSBnZW5lcmF0aW5nXG4gICAgY29uc29sZS5sb2coYPCflI0gVmFsaWRhdGluZyB0ZW1wbGF0ZSB2YXJpYWJsZXMuLi5gKTtcbiAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgY29uc29sZS5sb2coZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0KHRlbXBsYXRlVmFsaWRhdGlvbikpO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICBcbiAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgVGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQhIEZpeCB0aGUgdW5kZWZpbmVkIHZhcmlhYmxlcyBiZWZvcmUgY29tcGlsaW5nLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBibG9jayBmaWxlcyAod2l0aCBkZXByZWNhdGlvbiBzdXBwb3J0IGZyb20gc2NoZW1hIGhpc3RvcnkpXG4gICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBHdXRlbmJlcmcgYmxvY2suLi5gKTtcbiAgICBjb25zdCBzY2hlbWFIaXN0b3J5ID0gbG9hZE1hbmlmZXN0KG9wdGlvbnMub3V0cHV0RGlyKTtcbiAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBvcHRpb25zLmFwaVVybCwgY29uZmlnLCBzY2hlbWFIaXN0b3J5KTtcbiAgICBcbiAgICAvLyBXcml0ZSBmaWxlcyAod2l0aCBQcmV0dGllciBmb3JtYXR0aW5nKVxuICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvcHRpb25zLm91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgb3B0aW9ucy5hdXRoKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIERvbmUhIERvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2hlY2sgd2hldGhlciBhIGNvbXBvbmVudCBzaG91bGQgYmUgaW1wb3J0ZWQgYmFzZWQgb24gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IHNob3VsZEltcG9ydENvbXBvbmVudCA9IChjb21wb25lbnRJZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnKTogYm9vbGVhbiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG5cbiAgLy8gVHlwZSBub3QgbGlzdGVkIGluIGltcG9ydCBjb25maWcg4oCUIGRlZmF1bHQgdG8gdHJ1ZSAoaW1wb3J0KVxuICBpZiAodHlwZUNvbmZpZyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgLy8gRW50aXJlIHR5cGUgZGlzYWJsZWRcbiAgaWYgKHR5cGVDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEVudGlyZSB0eXBlIGVuYWJsZWQgd2l0aCBubyBwZXItY29tcG9uZW50IG92ZXJyaWRlc1xuICBpZiAodHlwZUNvbmZpZyA9PT0gdHJ1ZSkgcmV0dXJuIHRydWU7XG5cbiAgLy8gUGVyLWNvbXBvbmVudCBsb29rdXAgd2l0aGluIHRoZSB0eXBlIG9iamVjdFxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgLy8gTm90IGxpc3RlZCDigJQgaW1wb3J0IHdpdGggZGVmYXVsdHMgKHR5cGUtb2JqZWN0IG1lYW5zIFwiaW1wb3J0IGFsbCwgb3ZlcnJpZGUgbGlzdGVkXCIpXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEV4cGxpY2l0bHkgZGlzYWJsZWRcbiAgaWYgKGNvbXBvbmVudENvbmZpZyA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgLy8gRXhwbGljaXRseSBlbmFibGVkIG9yIGhhcyBmaWVsZCBvdmVycmlkZXNcbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgcmF3IHBlci1maWVsZCBjb25maWcgb2JqZWN0IGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEZpZWxkUHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3QgdHlwZUNvbmZpZyA9IGltcG9ydENvbmZpZ1tjb21wb25lbnRUeXBlXTtcbiAgaWYgKCF0eXBlQ29uZmlnIHx8IHR5cGVvZiB0eXBlQ29uZmlnID09PSAnYm9vbGVhbicpIHJldHVybiB7fTtcblxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgaWYgKCFjb21wb25lbnRDb25maWcgfHwgdHlwZW9mIGNvbXBvbmVudENvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgcmV0dXJuIGNvbXBvbmVudENvbmZpZyBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPjtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBkeW5hbWljIGFycmF5IGNvbmZpZ3MgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYWxsQ29uZmlncykpIHtcbiAgICBpZiAoaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZmllbGQgcHJlZmVyZW5jZXMgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IGFsbENvbmZpZ3MgPSBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MoY29tcG9uZW50SWQsIGNvbXBvbmVudFR5cGUsIGltcG9ydENvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKCFpc0R5bmFtaWNBcnJheUNvbmZpZyhjb25maWcpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IGNvbmZpZztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRmV0Y2ggbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSwgZmlsdGVyZWQgYnkgaW1wb3J0IGNvbmZpZ1xuICovXG5jb25zdCBmZXRjaENvbXBvbmVudExpc3QgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnRzLmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEFycmF5PEhhbmRvZmZDb21wb25lbnQ+O1xuICAgICAgICAgIGNvbnN0IGZpbHRlcmVkID0gY29tcG9uZW50cy5maWx0ZXIoYyA9PiBzaG91bGRJbXBvcnRDb21wb25lbnQoYy5pZCwgYy50eXBlLCBpbXBvcnRDb25maWcpKTtcbiAgICAgICAgICByZXNvbHZlKGZpbHRlcmVkLm1hcChjID0+IGMuaWQpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggZnVsbCBsaXN0IG9mIGFsbCBjb21wb25lbnRzIGZyb20gQVBJIChubyBpbXBvcnQgZmlsdGVyKS4gVXNlZCB0byByZXNvbHZlIGdyb3VwIG5hbWVzLlxuICovXG5jb25zdCBmZXRjaEFsbENvbXBvbmVudHNMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50W10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudHMpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSkpO1xuICB9KTtcbn07XG5cbi8qKlxuICogQ29tcGlsZSBhbGwgY29tcG9uZW50c1xuICovXG4vKipcbiAqIEJ1aWxkIFZhcmlhbnRJbmZvIGZvciBhIGNvbXBvbmVudCAocmVzb2x2ZXMgZHluYW1pYyBhcnJheXMsIElubmVyQmxvY2tzIGZpZWxkLCBldGMuKVxuICovXG5jb25zdCBidWlsZFZhcmlhbnRJbmZvID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnKTogVmFyaWFudEluZm8gPT4ge1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCksXG4gIH07XG5cbiAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudER5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCdhcnJheVR5cGUnIGluIGR5bkNvbmZpZykgY29udGludWU7IC8vIFNraXAgc3BlY2lhbGlzZWQgYXJyYXkgdHlwZXNcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICBpZiAocHJvcD8udHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24/LnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgY29uc3QgcGFnaW5hdGlvbkZpZWxkUmVnZXggPSBuZXcgUmVnRXhwKFxuICAgICAgICBgXFxcXHtcXFxce1xcXFxzKiNmaWVsZFxcXFxzK1tcIiddJHtmaWVsZE5hbWV9XFxcXC5wYWdpbmF0aW9uW1wiJ11gXG4gICAgICApO1xuICAgICAgaWYgKHBhZ2luYXRpb25GaWVsZFJlZ2V4LnRlc3QoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgICAgIChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uID0geyBwcm9wZXJ0eU5hbWU6ICdwYWdpbmF0aW9uJyB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZpZWxkUHJlZnMgPSBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpO1xuICBjb25zdCByaWNodGV4dEZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbXBvbmVudCxcbiAgICBmaWVsZE1hcDoge30sXG4gICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICBkeW5hbWljQXJyYXlDb25maWdzOiBjb21wb25lbnREeW5hbWljQXJyYXlzLFxuICB9O1xufTtcblxuLyoqXG4gKiBDb21waWxlIGEgc2luZ2xlIG1lcmdlZCBncm91cCAoZS5nLiBIZXJvIHdpdGggbXVsdGlwbGUgdmFyaWFudHMpLiBVc2VkIGJ5IHNpbmdsZS1uYW1lIENMSSB3aGVuIG5hbWUgbWF0Y2hlcyBhIGdyb3VwLlxuICovXG5jb25zdCBjb21waWxlR3JvdXAgPSBhc3luYyAoXG4gIGFwaVVybDogc3RyaW5nLFxuICBvdXRwdXREaXI6IHN0cmluZyxcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdLFxuICBhdXRoPzogQXV0aENyZWRlbnRpYWxzLFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SAIEdlbmVyYXRpbmcgbWVyZ2VkIGdyb3VwIGJsb2NrOiAke2dyb3VwU2x1Z30gKCR7Z3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpYCk7XG4gIGNvbnN0IHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSA9IGdyb3VwQ29tcG9uZW50cy5tYXAoKGMpID0+IGJ1aWxkVmFyaWFudEluZm8oYywgY29uZmlnKSk7XG4gIGNvbnN0IG1lcmdlZEJsb2NrID0gZ2VuZXJhdGVNZXJnZWRCbG9jayhncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50cywgdmFyaWFudEluZm9zLCBhcGlVcmwpO1xuICBjb25zdCBncm91cEJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcbiAgY29uc3QgZ3JvdXBEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBncm91cEJsb2NrTmFtZSk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhncm91cERpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoZ3JvdXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcblxuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2Jsb2NrLmpzb24nKSwgZm9ybWF0dGVkQmxvY2tKc29uKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdpbmRleC5qcycpLCBmb3JtYXR0ZWRJbmRleEpzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdyZW5kZXIucGhwJyksIGZvcm1hdHRlZFJlbmRlclBocCk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnZWRpdG9yLnNjc3MnKSwgZm9ybWF0dGVkRWRpdG9yU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnc3R5bGUuc2NzcycpLCBmb3JtYXR0ZWRTdHlsZVNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ1JFQURNRS5tZCcpLCBtZXJnZWRCbG9jay5yZWFkbWUpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ21pZ3JhdGlvbi1zY2hlbWEuanNvbicpLCBtZXJnZWRCbG9jay5taWdyYXRpb25TY2hlbWEpO1xuXG4gIGlmIChtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcykge1xuICAgIGNvbnN0IHZhcmlhdGlvbnNEaXIgPSBwYXRoLmpvaW4oZ3JvdXBEaXIsICd2YXJpYXRpb25zJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHZhcmlhdGlvbnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmModmFyaWF0aW9uc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMuanMpKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdiYWJlbCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5qc2ApLCBmb3JtYXR0ZWQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLnBocCkpIHtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ3BocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5waHBgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gIH1cblxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBtZXJnZWQgYmxvY2s6ICR7Z3JvdXBCbG9ja05hbWV9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2dyb3VwRGlyfWApO1xuXG4gIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGdyb3VwQ29tcG9uZW50cyk7XG4gIGNvbnN0IGZvcm1hdHRlZENhdGVnb3JpZXNQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGNhdGVnb3JpZXNQaHAsICdwaHAnKTtcbiAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGluY2x1ZGVzRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgY29uc3QgY2F0ZWdvcmllc1BhdGggPSBwYXRoLmpvaW4oaW5jbHVkZXNEaXIsICdoYW5kb2ZmLWNhdGVnb3JpZXMucGhwJyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCAke2NhdGVnb3JpZXNQYXRofWApO1xufTtcblxuY29uc3QgY29tcGlsZUFsbCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyIC0gQmF0Y2ggTW9kZWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChhdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2F1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuXG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIGxldCBzdWNjZXNzID0gMDtcbiAgICBsZXQgZmFpbGVkID0gMDtcbiAgICBjb25zdCBjb21waWxlZENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGNvbnN0IHNjaGVtYUhpc3RvcnkgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgICBcbiAgICAvLyBGZXRjaCBhbGwgY29tcG9uZW50cyBmaXJzdCBzbyB3ZSBjYW4gcGFydGl0aW9uIGJ5IGdyb3VwXG4gICAgY29uc3QgYWxsQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50SWQsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoY29tcG9uZW50KTtcbiAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICDimqDvuI8gIFNraXBwaW5nICR7Y29tcG9uZW50SWR9IGR1ZSB0byB0ZW1wbGF0ZSB2YXJpYWJsZSBlcnJvcnNgKTtcbiAgICAgICAgICBmYWlsZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFsbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBmZXRjaCAke2NvbXBvbmVudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQrKztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQYXJ0aXRpb24gY29tcG9uZW50czogbWVyZ2VkIGdyb3VwcyB2cyBpbmRpdmlkdWFsXG4gICAgLy8gQnVpbGQgY2FzZS1pbnNlbnNpdGl2ZSBsb29rdXA6IGNvbmZpZyBtYXkgc2F5IFwiSGVyb1wiIGJ1dCBBUEkgb2Z0ZW4gcmV0dXJucyBcImhlcm9cIlxuICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgIH1cbiAgICBjb25zdCBncm91cEJ1Y2tldHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZDb21wb25lbnRbXT4gPSB7fTtcbiAgICBjb25zdCBpbmRpdmlkdWFsQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBhbGxDb21wb25lbnRzKSB7XG4gICAgICBjb25zdCBncm91cCA9IGNvbXBvbmVudC5ncm91cDtcbiAgICAgIGlmICghZ3JvdXApIHtcbiAgICAgICAgaW5kaXZpZHVhbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNvbmZpZ0tleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICBpZiAoY29uZmlnS2V5KSB7XG4gICAgICAgIGlmICghZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0pIGdyb3VwQnVja2V0c1tjb25maWdLZXldID0gW107XG4gICAgICAgIGdyb3VwQnVja2V0c1tjb25maWdLZXldLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb21waWxlIGluZGl2aWR1YWwgY29tcG9uZW50cyAoZXhpc3RpbmcgYmVoYXZpb3IpXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgaW5kaXZpZHVhbENvbXBvbmVudHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGJsb2NrID0gZ2VuZXJhdGVCbG9jayhjb21wb25lbnQsIGFwaVVybCwgY29uZmlnLCBzY2hlbWFIaXN0b3J5KTtcbiAgICAgICAgYXdhaXQgd3JpdGVCbG9ja0ZpbGVzKG91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgYXV0aCk7XG4gICAgICAgIGNvbXBpbGVkQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgIHN1Y2Nlc3MrKztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gY29tcGlsZSAke2NvbXBvbmVudC5pZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBtZXJnZWQgZ3JvdXBzXG4gICAgZm9yIChjb25zdCBbZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHNdIG9mIE9iamVjdC5lbnRyaWVzKGdyb3VwQnVja2V0cykpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChhcGlVcmwsIG91dHB1dERpciwgZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHMsIGF1dGgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaCguLi5ncm91cENvbXBvbmVudHMpO1xuICAgICAgICBzdWNjZXNzICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgbWVyZ2VkIGdyb3VwICR7Z3JvdXBTbHVnfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQgKz0gZ3JvdXBDb21wb25lbnRzLmxlbmd0aDtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgY2F0ZWdvcmllcyBQSFAgZmlsZSBiYXNlZCBvbiBhbGwgY29tcGlsZWQgY29tcG9uZW50c1xuICAgIGlmIChjb21waWxlZENvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgR2VuZXJhdGluZyBibG9jayBjYXRlZ29yaWVzLi4uYCk7XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGNvbXBpbGVkQ29tcG9uZW50cyk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICAgICAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICAgICAgZnMubWtkaXJTeW5jKGluY2x1ZGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhjYXRlZ29yaWVzUGF0aCwgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtjYXRlZ29yaWVzUGF0aH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29weSBzaGFyZWQgY29tcG9uZW50cyAmIHV0aWxzIHRvIHRoZSBvdXRwdXQgZGlyZWN0b3J5IHNvIGJsb2NrcyBjYW5cbiAgICAvLyByZXNvbHZlIHRoZWlyIC4uLy4uL3NoYXJlZC8uLi4gaW1wb3J0cyByZWdhcmRsZXNzIG9mIHdoZXJlIHRoZXkgbGl2ZS5cbiAgICBjb25zdCBwbHVnaW5Sb290ID0gcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShwcm9jZXNzLmFyZ3ZbMV0pLCAnLi4nLCAnLi4nKTtcbiAgICBjb25zdCBwbHVnaW5TaGFyZWREaXIgPSBwYXRoLmpvaW4ocGx1Z2luUm9vdCwgJ3NoYXJlZCcpO1xuICAgIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJyk7XG4gICAgY29uc3QgdGFyZ2V0U2hhcmVkRGlyID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAnc2hhcmVkJyk7XG5cbiAgICBpZiAoZnMuZXhpc3RzU3luYyhwbHVnaW5TaGFyZWREaXIpICYmXG4gICAgICAgIHBhdGgucmVzb2x2ZShwbHVnaW5TaGFyZWREaXIpICE9PSBwYXRoLnJlc29sdmUodGFyZ2V0U2hhcmVkRGlyKSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgQ29weWluZyBzaGFyZWQgY29tcG9uZW50cy4uLmApO1xuICAgICAgY29weURpclJlY3Vyc2l2ZShwbHVnaW5TaGFyZWREaXIsIHRhcmdldFNoYXJlZERpcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFNoYXJlZCBjb21wb25lbnRzIGNvcGllZCB0byAke3RhcmdldFNoYXJlZERpcn1gKTtcbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSBwYWNrYWdlLmpzb24gYW5kIGluc3RhbGwgYnVpbGQgZGVwZW5kZW5jaWVzIHNvIGJsb2NrcyBhbmRcbiAgICAvLyBzaGFyZWQgY29tcG9uZW50cyBjYW4gcmVzb2x2ZSBAd29yZHByZXNzLyogYW5kIEAxMHVwLyogaW1wb3J0cy5cbiAgICBlbnN1cmVDb250ZW50RGVwZW5kZW5jaWVzKGNvbnRlbnRSb290KTtcbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmNzcyBhbmQgbWFpbi5qcyBkZXNpZ24gc3lzdGVtIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OhIERvd25sb2FkaW5nIGRlc2lnbiBzeXN0ZW0gYXNzZXRzLi4uYCk7XG4gICAgY29uc3QgYXNzZXRzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJy4uJywgJ2Fzc2V0cycpO1xuICAgIGNvbnN0IGFzc2V0c0Nzc0RpciA9IHBhdGguam9pbihhc3NldHNEaXIsICdjc3MnKTtcbiAgICBjb25zdCBhc3NldHNKc0RpciA9IHBhdGguam9pbihhc3NldHNEaXIsICdqcycpO1xuXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFzc2V0c0Nzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhhc3NldHNDc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXNzZXRzSnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoYXNzZXRzSnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNzc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmNzc2A7XG4gICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihhc3NldHNDc3NEaXIsICdtYWluLmNzcycpO1xuICAgIGNvbnN0IGNzc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoY3NzVXJsLCBjc3NQYXRoLCBhdXRoKTtcbiAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvY3NzL21haW4uY3NzYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBqc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmpzYDtcbiAgICBjb25zdCBqc1BhdGggPSBwYXRoLmpvaW4oYXNzZXRzSnNEaXIsICdtYWluLmpzJyk7XG4gICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgZG93bmxvYWRGaWxlKGpzVXJsLCBqc1BhdGgsIGF1dGgpO1xuICAgIGlmIChqc0Rvd25sb2FkZWQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2pzL21haW4uanNgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIENvbXBpbGF0aW9uIGNvbXBsZXRlIWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgU3VjY2VzczogJHtzdWNjZXNzfWApO1xuICAgIGlmIChmYWlsZWQgPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4p2MIEZhaWxlZDogJHtmYWlsZWR9YCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SAIE1lcmdlZCBncm91cHM6ICR7T2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGh9YCk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGBcXG5Eb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcilcbiAqL1xuY29uc3QgY29tcGlsZVRoZW1lID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBvdXRwdXREaXI6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+OqCBUaGVtZSBUZW1wbGF0ZSBDb21waWxlcmApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChhdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2F1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBDb21waWxlIGhlYWRlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGhlYWRlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCAnaGVhZGVyJywgYXV0aCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7aGVhZGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGhlYWRlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGhlYWRlclBocCA9IGdlbmVyYXRlSGVhZGVyUGhwKGhlYWRlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRIZWFkZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGhlYWRlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBoZWFkZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2hlYWRlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoaGVhZGVyUGF0aCwgZm9ybWF0dGVkSGVhZGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2hlYWRlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBIZWFkZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsZSBmb290ZXJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBmb290ZXIgY29tcG9uZW50Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZvb3RlciA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgJ2Zvb3RlcicsIGF1dGgpO1xuICAgICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2Zvb3Rlci50aXRsZX1cXG5gKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBmb290ZXIucGhwLi4uYCk7XG4gICAgICBjb25zdCBmb290ZXJQaHAgPSBnZW5lcmF0ZUZvb3RlclBocChmb290ZXIpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkRm9vdGVyID0gYXdhaXQgZm9ybWF0Q29kZShmb290ZXJQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgZm9vdGVyUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICdmb290ZXIucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGZvb3RlclBhdGgsIGZvcm1hdHRlZEZvb3Rlcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtmb290ZXJQYXRofVxcbmApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRm9vdGVyIGNvbXBvbmVudCBub3QgZm91bmQgb3IgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFsc28gdHJ5IGhlYWRlci1jb21wYWN0IGFuZCBmb290ZXItY29tcGFjdCBpZiB0aGV5IGV4aXN0XG4gICAgLy8gVGhlc2UgZ28gaW50byB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyBzdWJmb2xkZXJcbiAgICBjb25zdCBoYW5kb2ZmVGVtcGxhdGVzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ3RlbXBsYXRlLXBhcnRzJywgJ2hhbmRvZmYnKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaGFuZG9mZlRlbXBsYXRlc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZ2VuZXJhdGVkVGVtcGxhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgdmFyaWFudCBvZiBbJ2hlYWRlci1jb21wYWN0JywgJ2hlYWRlci1sYW5kZXInLCAnZm9vdGVyLWNvbXBhY3QnXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCB2YXJpYW50LCBhdXRoKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk6EgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfWApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgdGVtcGxhdGVUeXBlID0gdmFyaWFudC5yZXBsYWNlKC8tL2csICdfJyk7XG4gICAgICAgIGNvbnN0IGlzSGVhZGVyID0gdmFyaWFudC5zdGFydHNXaXRoKCdoZWFkZXInKTtcbiAgICAgICAgY29uc3QgcGhwID0gaXNIZWFkZXIgXG4gICAgICAgICAgPyBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocChjb21wb25lbnQsIHRlbXBsYXRlVHlwZSlcbiAgICAgICAgICA6IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKTtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVkUGhwID0gYXdhaXQgZm9ybWF0Q29kZShwaHAsICdwaHAnKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIGAke3ZhcmlhbnR9LnBocGApO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBmb3JtYXR0ZWRQaHApO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtmaWxlUGF0aH1cXG5gKTtcbiAgICAgICAgZ2VuZXJhdGVkVGVtcGxhdGVzLnB1c2goYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gVmFyaWFudCBkb2Vzbid0IGV4aXN0LCBza2lwIHNpbGVudGx5XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIFJFQURNRSBmb3IgdGhlIGhhbmRvZmYgdGVtcGxhdGVzIGZvbGRlclxuICAgIGlmIChnZW5lcmF0ZWRUZW1wbGF0ZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgcmVhZG1lQ29udGVudCA9IGAjIEhhbmRvZmYgVGVtcGxhdGUgUGFydHNcblxuPiDimqDvuI8gKipETyBOT1QgRURJVCBUSEVTRSBGSUxFUyBESVJFQ1RMWSoqXG4+XG4+IFRoZXNlIGZpbGVzIGFyZSBhdXRvbWF0aWNhbGx5IGdlbmVyYXRlZCBieSB0aGUgSGFuZG9mZiBXb3JkUHJlc3MgY29tcGlsZXIuXG4+IEFueSBjaGFuZ2VzIHdpbGwgYmUgb3ZlcndyaXR0ZW4gb24gdGhlIG5leHQgc3luYy5cblxuIyMgU291cmNlXG5cblRoZXNlIHRlbXBsYXRlcyB3ZXJlIHRyYW5zcGlsZWQgZnJvbSB0aGUgSGFuZG9mZiBkZXNpZ24gc3lzdGVtLlxuXG4tICoqQVBJIFVSTDoqKiAke2FwaVVybH1cbi0gKipHZW5lcmF0ZWQ6KiogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XG5cbiMjIEZpbGVzXG5cbiR7Z2VuZXJhdGVkVGVtcGxhdGVzLm1hcChmID0+IGAtIFxcYCR7Zn1cXGBgKS5qb2luKCdcXG4nKX1cblxuIyMgVXNhZ2VcblxuSW5jbHVkZSB0aGVzZSB0ZW1wbGF0ZSBwYXJ0cyBpbiB5b3VyIHRoZW1lIHVzaW5nOlxuXG5cXGBcXGBcXGBwaHBcbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2hlYWRlci1jb21wYWN0Jyk7ID8+XG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9mb290ZXItY29tcGFjdCcpOyA/PlxuXFxgXFxgXFxgXG5cbiMjIFJlZ2VuZXJhdGluZ1xuXG5UbyByZWdlbmVyYXRlIHRoZXNlIGZpbGVzLCBydW46XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWVcblxcYFxcYFxcYFxuXG5PciB3aXRoIGEgc3BlY2lmaWMgQVBJIFVSTDpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZSAtLWFwaS11cmwgJHthcGlVcmx9XG5cXGBcXGBcXGBcbmA7XG4gICAgICBjb25zdCByZWFkbWVQYXRoID0gcGF0aC5qb2luKGhhbmRvZmZUZW1wbGF0ZXNEaXIsICdSRUFETUUubWQnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVhZG1lUGF0aCwgcmVhZG1lQ29udGVudCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBHZW5lcmF0ZWQ6ICR7cmVhZG1lUGF0aH1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5jc3MgYW5kIG1haW4uanMgYXNzZXRzXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgdGhlbWUgYXNzZXRzLi4uYCk7XG4gICAgXG4gICAgLy8gRW5zdXJlIGFzc2V0cyBkaXJlY3RvcmllcyBleGlzdFxuICAgIGNvbnN0IGNzc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnY3NzJyk7XG4gICAgY29uc3QganNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2pzJyk7XG4gICAgXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGNzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhjc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoanNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoanNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBtYWluLmNzc1xuICAgIGNvbnN0IGNzc1VybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmNzc2A7XG4gICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihjc3NEaXIsICdtYWluLmNzcycpO1xuICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmNzcy4uLmApO1xuICAgIGNvbnN0IGNzc0Rvd25sb2FkZWQgPSBhd2FpdCBkb3dubG9hZEZpbGUoY3NzVXJsLCBjc3NQYXRoLCBhdXRoKTtcbiAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkOiAke2Nzc1BhdGh9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgbWFpbi5qc1xuICAgIGNvbnN0IGpzVXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgIGNvbnN0IGpzUGF0aCA9IHBhdGguam9pbihqc0RpciwgJ21haW4uanMnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRG93bmxvYWRpbmcgbWFpbi5qcy4uLmApO1xuICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGRvd25sb2FkRmlsZShqc1VybCwganNQYXRoLCBhdXRoKTtcbiAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7anNQYXRofWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uanMgZnJvbSAke2pzVXJsfWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIFRoZW1lIHRlbXBsYXRlcyBnZW5lcmF0ZWQhXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlIGEgc2luZ2xlIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlc1xuICovXG5jb25zdCB2YWxpZGF0ZSA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudE5hbWU6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8VmFsaWRhdGlvblJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIENvbXBvbmVudDogJHtjb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2FwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIE1hbmlmZXN0OiAke291dHB1dERpcn1cXG5gKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICBcbiAgLy8gTG9hZCBtYW5pZmVzdFxuICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICBcbiAgLy8gVmFsaWRhdGVcbiAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVDb21wb25lbnQoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gIFxuICAvLyBPdXRwdXQgcmVzdWx0XG4gIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlc1xuICovXG5jb25zdCB2YWxpZGF0ZUFsbCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgb3V0cHV0RGlyOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SNIFZhbGlkYXRpbmcgQWxsIENvbXBvbmVudHNgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBsaXN0XG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBpbXBvcnRDb25maWcsIGF1dGgpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHNcXG5gKTtcbiAgICBcbiAgICAvLyBMb2FkIG1hbmlmZXN0XG4gICAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgICBcbiAgICBsZXQgdmFsaWQgPSAwO1xuICAgIGxldCBpbnZhbGlkID0gMDtcbiAgICBsZXQgbmV3Q29tcG9uZW50cyA9IDA7XG4gICAgY29uc3QgYnJlYWtpbmdDaGFuZ2VzOiBWYWxpZGF0aW9uUmVzdWx0W10gPSBbXTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnRJZCwgYXV0aCk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coZm9ybWF0VmFsaWRhdGlvblJlc3VsdChyZXN1bHQpKTtcbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgICBcbiAgICAgICAgaWYgKHJlc3VsdC5pc05ldykge1xuICAgICAgICAgIG5ld0NvbXBvbmVudHMrKztcbiAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgIHZhbGlkKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW52YWxpZCsrO1xuICAgICAgICAgIGJyZWFraW5nQ2hhbmdlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gdmFsaWRhdGUgJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU3VtbWFyeVxuICAgIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gICAgY29uc29sZS5sb2coYPCfk4ogVmFsaWRhdGlvbiBTdW1tYXJ5YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBWYWxpZDogJHt2YWxpZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4p2MIEJyZWFraW5nIENoYW5nZXM6ICR7aW52YWxpZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyoIE5ldyBDb21wb25lbnRzOiAke25ld0NvbXBvbmVudHN9YCk7XG4gICAgXG4gICAgaWYgKGJyZWFraW5nQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBXQVJOSU5HOiAke2JyZWFraW5nQ2hhbmdlcy5sZW5ndGh9IGNvbXBvbmVudChzKSBoYXZlIGJyZWFraW5nIGNoYW5nZXMhYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgVGhlc2UgY2hhbmdlcyBtYXkgYnJlYWsgZXhpc3RpbmcgV29yZFByZXNzIGNvbnRlbnQuXFxuYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50cyB3aXRoIGJyZWFraW5nIGNoYW5nZXM6YCk7XG4gICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiBicmVha2luZ0NoYW5nZXMpIHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIC0gJHtyZXN1bHQuY29tcG9uZW50VGl0bGV9ICgke3Jlc3VsdC5jb21wb25lbnRJZH0pYCk7XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgXFxuICAgVG8gcHJvY2VlZCBhbnl3YXksIGNvbXBpbGUgd2l0aCAtLWZvcmNlIGZsYWcuXFxuYCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7inKggQWxsIGNvbXBvbmVudHMgdmFsaWRhdGVkIHN1Y2Nlc3NmdWxseSFcXG5gKTtcbiAgICB9XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIFVwZGF0ZSBtYW5pZmVzdCBhZnRlciBzdWNjZXNzZnVsIGNvbXBpbGF0aW9uXG4gKi9cbmNvbnN0IHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50ID0gKG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiB2b2lkID0+IHtcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgY29uc3QgdXBkYXRlZE1hbmlmZXN0ID0gdXBkYXRlTWFuaWZlc3QoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gIHNhdmVNYW5pZmVzdChvdXRwdXREaXIsIHVwZGF0ZWRNYW5pZmVzdCk7XG59O1xuXG4vLyBDTEkgc2V0dXBcbnByb2dyYW1cbiAgLm5hbWUoJ2d1dGVuYmVyZy1jb21waWxlJylcbiAgLmRlc2NyaXB0aW9uKCdUcmFuc3BpbGUgSGFuZG9mZiBjb21wb25lbnRzIHRvIFdvcmRQcmVzcyBHdXRlbmJlcmcgYmxvY2tzIGFuZCB0aGVtZSB0ZW1wbGF0ZXMnKVxuICAudmVyc2lvbignMS4wLjAnKTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGNvbmZpZyBmaWxlXG4gKi9cbmNvbnN0IGluaXRDb25maWcgPSAob3B0czoge1xuICBhcGlVcmw/OiBzdHJpbmc7XG4gIG91dHB1dD86IHN0cmluZztcbiAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbiAgZm9yY2U/OiBib29sZWFuO1xufSk6IHZvaWQgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICAvLyBDaGVjayBpZiBjb25maWcgYWxyZWFkeSBleGlzdHNcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkgJiYgIW9wdHMuZm9yY2UpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWcgZmlsZSBhbHJlYWR5IGV4aXN0czogJHtjb25maWdQYXRofWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBVc2UgLS1mb3JjZSB0byBvdmVyd3JpdGUuXFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG4gIFxuICBjb25zdCBuZXdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHtcbiAgICBhcGlVcmw6IG9wdHMuYXBpVXJsID8/ICdodHRwczovL3lvdXItaGFuZG9mZi1zaXRlLmNvbScsXG4gICAgb3V0cHV0OiBvcHRzLm91dHB1dCA/PyAnLi9kZW1vL3BsdWdpbi9ibG9ja3MnLFxuICAgIHRoZW1lRGlyOiBvcHRzLnRoZW1lRGlyID8/ICcuL2RlbW8vdGhlbWUnLFxuICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/ICcnLFxuICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/ICcnLFxuICB9O1xuICBcbiAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShuZXdDb25maWcsIG51bGwsIDIpICsgJ1xcbicpO1xuICBcbiAgY29uc29sZS5sb2coYFxcbuKchSBDcmVhdGVkIGNvbmZpZyBmaWxlOiAke2NvbmZpZ1BhdGh9YCk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5OEIENvbmZpZ3VyYXRpb246YCk7XG4gIGNvbnNvbGUubG9nKGAgICBhcGlVcmw6ICAgJHtuZXdDb25maWcuYXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgb3V0cHV0OiAgICR7bmV3Q29uZmlnLm91dHB1dH1gKTtcbiAgY29uc29sZS5sb2coYCAgIHRoZW1lRGlyOiAke25ld0NvbmZpZy50aGVtZURpcn1gKTtcbiAgaWYgKG5ld0NvbmZpZy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICB1c2VybmFtZTogJHtuZXdDb25maWcudXNlcm5hbWV9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIHBhc3N3b3JkOiAqKioqYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYFxcbvCfkqEgRWRpdCB0aGlzIGZpbGUgdG8gY29uZmlndXJlIHlvdXIgSGFuZG9mZiBBUEkgc2V0dGluZ3MuXFxuYCk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBoZWxwZXJcbiAqL1xuY29uc3QgcHJvbXB0ID0gKHF1ZXN0aW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zdCByZWFkbGluZSA9IHJlcXVpcmUoJ3JlYWRsaW5lJyk7XG4gIGNvbnN0IHJsID0gcmVhZGxpbmUuY3JlYXRlSW50ZXJmYWNlKHtcbiAgICBpbnB1dDogcHJvY2Vzcy5zdGRpbixcbiAgICBvdXRwdXQ6IHByb2Nlc3Muc3Rkb3V0LFxuICB9KTtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIHJsLnF1ZXN0aW9uKHF1ZXN0aW9uLCAoYW5zd2VyOiBzdHJpbmcpID0+IHtcbiAgICAgIHJsLmNsb3NlKCk7XG4gICAgICByZXNvbHZlKGFuc3dlci50cmltKCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGZvciB5ZXMvbm9cbiAqL1xuY29uc3QgcHJvbXB0WWVzTm8gPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgZGVmYXVsdFZhbHVlOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICBjb25zdCBkZWZhdWx0U3RyID0gZGVmYXVsdFZhbHVlID8gJ1kvbicgOiAneS9OJztcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGAke3F1ZXN0aW9ufSBbJHtkZWZhdWx0U3RyfV06IGApO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgcmV0dXJuIGFuc3dlci50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ3knKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IHdpdGggY2hvaWNlc1xuICovXG5jb25zdCBwcm9tcHRDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10sIGRlZmF1bHRJbmRleDogbnVtYmVyID0gMCk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnN0IG1hcmtlciA9IGkgPT09IGRlZmF1bHRJbmRleCA/ICc+JyA6ICcgJztcbiAgICBjb25zb2xlLmxvZyhgICAke21hcmtlcn0gJHtpICsgMX0uICR7Y2hvaWNlfWApO1xuICB9KTtcbiAgXG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgRW50ZXIgbnVtYmVyIFske2RlZmF1bHRJbmRleCArIDF9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xuICBcbiAgY29uc3QgaW5kZXggPSBwYXJzZUludChhbnN3ZXIsIDEwKSAtIDE7XG4gIGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgY2hvaWNlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gY2hvaWNlc1tpbmRleF07XG4gIH1cbiAgcmV0dXJuIGNob2ljZXNbZGVmYXVsdEluZGV4XTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGZvciBtdWx0aXBsZSBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdE11bHRpQ2hvaWNlID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGNob2ljZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxuJHtxdWVzdGlvbn1gKTtcbiAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGkpID0+IHtcbiAgICBjb25zb2xlLmxvZyhgICAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXJzIHNlcGFyYXRlZCBieSBjb21tYXMgKGUuZy4sIDEsMiwzKSBvciAnYWxsJzogYCk7XG4gIGlmIChhbnN3ZXIudG9Mb3dlckNhc2UoKSA9PT0gJ2FsbCcpIHJldHVybiBjaG9pY2VzO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIFtjaG9pY2VzWzBdXTtcbiAgXG4gIGNvbnN0IGluZGljZXMgPSBhbnN3ZXIuc3BsaXQoJywnKS5tYXAocyA9PiBwYXJzZUludChzLnRyaW0oKSwgMTApIC0gMSk7XG4gIHJldHVybiBpbmRpY2VzXG4gICAgLmZpbHRlcihpID0+IGkgPj0gMCAmJiBpIDwgY2hvaWNlcy5sZW5ndGgpXG4gICAgLm1hcChpID0+IGNob2ljZXNbaV0pO1xufTtcblxuLyoqXG4gKiBGaW5kIGFsbCBhcnJheSBwcm9wZXJ0aWVzIGluIGEgY29tcG9uZW50XG4gKi9cbmNvbnN0IGZpbmRBcnJheVByb3BlcnRpZXMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJyk6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0+IHtcbiAgY29uc3QgYXJyYXlzOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9PiA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBjb25zdCBwYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgIFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICBhcnJheXMucHVzaCh7IHBhdGgsIHByb3BlcnR5IH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBSZWN1cnNlIGludG8gb2JqZWN0c1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICBhcnJheXMucHVzaCguLi5maW5kQXJyYXlQcm9wZXJ0aWVzKHByb3BlcnR5LnByb3BlcnRpZXMsIHBhdGgpKTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBhcnJheXM7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGZpZWxkIG1hcHBpbmcgc3VnZ2VzdGlvbnMgYmFzZWQgb24gYXJyYXkgaXRlbSBwcm9wZXJ0aWVzXG4gKi9cbmNvbnN0IHN1Z2dlc3RGaWVsZE1hcHBpbmdzID0gKGl0ZW1Qcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9PiB7XG4gIGNvbnN0IHN1Z2dlc3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICBjb25zdCBtYXBQcm9wZXJ0eSA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBwYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgXG4gICAgICAvLyBTdWdnZXN0IG1hcHBpbmdzIGJhc2VkIG9uIGNvbW1vbiBwYXR0ZXJuc1xuICAgICAgY29uc3QgbG93ZXJLZXkgPSBrZXkudG9Mb3dlckNhc2UoKTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJyB8fCBsb3dlcktleS5pbmNsdWRlcygnaW1hZ2UnKSB8fCBsb3dlcktleS5pbmNsdWRlcygncGhvdG8nKSB8fCBsb3dlcktleS5pbmNsdWRlcygndGh1bWJuYWlsJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAnZmVhdHVyZWRfaW1hZ2UnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3RpdGxlJyB8fCBsb3dlcktleS5pbmNsdWRlcygnaGVhZGluZycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCduYW1lJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF90aXRsZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdleGNlcnB0JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3N1bW1hcnknKSB8fCBsb3dlcktleS5pbmNsdWRlcygnZGVzY3JpcHRpb24nKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2V4Y2VycHQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnY29udGVudCcpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdib2R5JykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9jb250ZW50JztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkgPT09ICd1cmwnIHx8IGxvd2VyS2V5ID09PSAnaHJlZicgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2xpbmsnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwZXJtYWxpbmsnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnZGF0ZScpKSB7XG4gICAgICAgIGlmIChsb3dlcktleS5pbmNsdWRlcygnZGF5JykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6ZGF5X251bWVyaWMnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdtb250aCcpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOm1vbnRoX3Nob3J0JztcbiAgICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygneWVhcicpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOnllYXInO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpmdWxsJztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnYXV0aG9yJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAnYXV0aG9yLm5hbWUnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnY2F0ZWdvcnknKSB8fCBsb3dlcktleS5pbmNsdWRlcygndGFnJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAndGF4b25vbXk6Y2F0ZWdvcnknO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBSZWN1cnNlIGludG8gbmVzdGVkIG9iamVjdHNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICBtYXBQcm9wZXJ0eShwcm9wLnByb3BlcnRpZXMsIHBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIG1hcFByb3BlcnR5KGl0ZW1Qcm9wZXJ0aWVzKTtcbiAgcmV0dXJuIHN1Z2dlc3Rpb25zO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSB3aXphcmQgZm9yIGNvbmZpZ3VyaW5nIGR5bmFtaWMgYXJyYXlzXG4gKi9cbmNvbnN0IGNvbmZpZ3VyZUR5bmFtaWNBcnJheXMgPSBhc3luYyAoXG4gIGFwaVVybDogc3RyaW5nLFxuICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4gIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHNcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+nmSBEeW5hbWljIEFycmF5IENvbmZpZ3VyYXRpb24gV2l6YXJkYCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHthcGlVcmx9XFxuYCk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IHN0cnVjdHVyZS4uLmApO1xuICBsZXQgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50O1xuICB0cnkge1xuICAgIGNvbXBvbmVudCA9IGF3YWl0IGZldGNoQ29tcG9uZW50KGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX0gKCR7Y29tcG9uZW50LmlkfSlcXG5gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIC8vIEZpbmQgYXJyYXkgcHJvcGVydGllc1xuICBjb25zdCBhcnJheVByb3BzID0gZmluZEFycmF5UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIFxuICBpZiAoYXJyYXlQcm9wcy5sZW5ndGggPT09IDApIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBObyBhcnJheSBwcm9wZXJ0aWVzIGZvdW5kIGluIHRoaXMgY29tcG9uZW50LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBEeW5hbWljIGFycmF5cyBhcmUgb25seSBhdmFpbGFibGUgZm9yIGFycmF5LXR5cGUgcHJvcGVydGllcy5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGDwn5OLIEZvdW5kICR7YXJyYXlQcm9wcy5sZW5ndGh9IGFycmF5IGZpZWxkKHMpOmApO1xuICBhcnJheVByb3BzLmZvckVhY2goKGFyciwgaSkgPT4ge1xuICAgIGNvbnN0IGl0ZW1Db3VudCA9IGFyci5wcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyA/IE9iamVjdC5rZXlzKGFyci5wcm9wZXJ0eS5pdGVtcy5wcm9wZXJ0aWVzKS5sZW5ndGggOiAwO1xuICAgIGNvbnNvbGUubG9nKGAgICAke2kgKyAxfS4gJHthcnIucGF0aH0gKCR7aXRlbUNvdW50fSBpdGVtIHByb3BlcnRpZXMpYCk7XG4gIH0pO1xuICBcbiAgLy8gU2VsZWN0IHdoaWNoIGFycmF5cyB0byBjb25maWd1cmVcbiAgY29uc3Qgc2VsZWN0ZWRBcnJheXMgPSBhcnJheVByb3BzLmxlbmd0aCA9PT0gMSBcbiAgICA/IFthcnJheVByb3BzWzBdXVxuICAgIDogYXdhaXQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGFycmF5UHJvcHMubWFwKGEgPT4gYS5wYXRoKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwcm9tcHRNdWx0aUNob2ljZSgnV2hpY2ggYXJyYXkocykgZG8geW91IHdhbnQgdG8gY29uZmlndXJlPycsIGNob2ljZXMpO1xuICAgICAgICByZXR1cm4gYXJyYXlQcm9wcy5maWx0ZXIoYSA9PiBzZWxlY3RlZC5pbmNsdWRlcyhhLnBhdGgpKTtcbiAgICAgIH0pKCk7XG4gIFxuICAvLyBMb2FkIGV4aXN0aW5nIGNvbmZpZ1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIGxldCBleGlzdGluZ0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge307XG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGV4aXN0aW5nQ29uZmlnID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04JykpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gSWdub3JlIHBhcnNlIGVycm9yc1xuICAgIH1cbiAgfVxuICBcbiAgLy8gQnVpbGQgdGhlIGltcG9ydCBjb25maWcsIHByZXNlcnZpbmcgZXhpc3RpbmcgZW50cmllc1xuICBjb25zdCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyA9IGV4aXN0aW5nQ29uZmlnLmltcG9ydCB8fCB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGlmICghaW1wb3J0Q29uZmlnLmJsb2NrIHx8IHR5cGVvZiBpbXBvcnRDb25maWcuYmxvY2sgPT09ICdib29sZWFuJykge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IHt9O1xuICB9XG4gIGNvbnN0IGJsb2NrQ29uZmlnID0gaW1wb3J0Q29uZmlnLmJsb2NrIGFzIFJlY29yZDxzdHJpbmcsIENvbXBvbmVudEltcG9ydENvbmZpZz47XG4gIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSB8fCB0eXBlb2YgYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSA9IHt9O1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudEZpZWxkQ29uZmlnID0gYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSBhcyBSZWNvcmQ8c3RyaW5nLCBGaWVsZENvbmZpZz47XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVBvc3RzQXJyYXkgPSBhc3luYyAoYXJyYXlQcm9wOiB7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9KTogUHJvbWlzZTxEeW5hbWljQXJyYXlDb25maWc+ID0+IHtcbiAgICAvLyBTZWxlY3Rpb24gbW9kZVxuICAgIGNvbnN0IHNlbGVjdGlvbk1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCB1c2VycyBzZWxlY3QgcG9zdHM/JyxcbiAgICAgIFsnUXVlcnkgQnVpbGRlciAoZmlsdGVyIGJ5IHRheG9ub215LCBvcmRlciwgZXRjLiknLCAnTWFudWFsIFNlbGVjdGlvbiAoaGFuZC1waWNrIHNwZWNpZmljIHBvc3RzKSddLFxuICAgICAgMFxuICAgICk7XG4gICAgY29uc3QgaXNRdWVyeU1vZGUgPSBzZWxlY3Rpb25Nb2RlLmluY2x1ZGVzKCdRdWVyeScpO1xuXG4gICAgLy8gUG9zdCB0eXBlc1xuICAgIGNvbnNvbGUubG9nKGBcXG5FbnRlciBhbGxvd2VkIHBvc3QgdHlwZXMgKGNvbW1hLXNlcGFyYXRlZCk6YCk7XG4gICAgY29uc3QgcG9zdFR5cGVzSW5wdXQgPSBhd2FpdCBwcm9tcHQoYFBvc3QgdHlwZXMgW3Bvc3RdOiBgKTtcbiAgICBjb25zdCBwb3N0VHlwZXMgPSBwb3N0VHlwZXNJbnB1dFxuICAgICAgPyBwb3N0VHlwZXNJbnB1dC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgIDogWydwb3N0J107XG5cbiAgICAvLyBNYXggaXRlbXNcbiAgICBjb25zdCBtYXhJdGVtc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBNYXhpbXVtIGl0ZW1zIFsxMl06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IDEyO1xuXG4gICAgLy8gUmVuZGVyIG1vZGVcbiAgICBjb25zdCByZW5kZXJNb2RlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ0hvdyBzaG91bGQgcG9zdHMgYmUgcmVuZGVyZWQ/JyxcbiAgICAgIFsnTWFwcGVkIChjb252ZXJ0IHBvc3QgZmllbGRzIHRvIHRlbXBsYXRlIHN0cnVjdHVyZSknLCAnVGVtcGxhdGUgKHVzZSBhIFBIUCB0ZW1wbGF0ZSBmaWxlKSddLFxuICAgICAgMFxuICAgICk7XG4gICAgY29uc3QgaXNNYXBwZWRNb2RlID0gcmVuZGVyTW9kZS5pbmNsdWRlcygnTWFwcGVkJyk7XG5cbiAgICBsZXQgZmllbGRNYXBwaW5nOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgbGV0IHRlbXBsYXRlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKGlzTWFwcGVkTW9kZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbvCfk4ogRmllbGQgTWFwcGluZyBDb25maWd1cmF0aW9uYCk7XG5cbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGFycmF5UHJvcC5wcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcztcbiAgICAgIGlmIChpdGVtUHJvcHMpIHtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBzdWdnZXN0RmllbGRNYXBwaW5ncyhpdGVtUHJvcHMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5JJ2xsIHN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gZmllbGQgbmFtZXMuIFByZXNzIEVudGVyIHRvIGFjY2VwdCBvciB0eXBlIGEgbmV3IHZhbHVlLmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxuQXZhaWxhYmxlIHNvdXJjZXM6YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gcG9zdF90aXRsZSwgcG9zdF9leGNlcnB0LCBwb3N0X2NvbnRlbnQsIHBlcm1hbGluaywgcG9zdF9pZGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGZlYXR1cmVkX2ltYWdlYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gcG9zdF9kYXRlOmRheSwgcG9zdF9kYXRlOm1vbnRoX3Nob3J0LCBwb3N0X2RhdGU6eWVhciwgcG9zdF9kYXRlOmZ1bGxgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBhdXRob3IubmFtZSwgYXV0aG9yLnVybCwgYXV0aG9yLmF2YXRhcmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHRheG9ub215OmNhdGVnb3J5LCB0YXhvbm9teTpwb3N0X3RhZ2ApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIG1ldGE6ZmllbGRfbmFtZWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIChsZWF2ZSBlbXB0eSB0byBza2lwKVxcbmApO1xuXG4gICAgICAgIGNvbnN0IGZsYXR0ZW5Qcm9wcyA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICBjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICAgICAgY29uc3QgcCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgICAgICBwYXRocy5wdXNoKC4uLmZsYXR0ZW5Qcm9wcyhwcm9wLnByb3BlcnRpZXMsIHApKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2gocCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBwYXRocztcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkUGF0aCBvZiBmbGF0dGVuUHJvcHMoaXRlbVByb3BzKSkge1xuICAgICAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSBzdWdnZXN0aW9uc1tmaWVsZFBhdGhdIHx8ICcnO1xuICAgICAgICAgIGNvbnN0IGRlZmF1bHRTdHIgPSBzdWdnZXN0aW9uID8gYCBbJHtzdWdnZXN0aW9ufV1gIDogJyc7XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9IGF3YWl0IHByb21wdChgICAke2ZpZWxkUGF0aH0ke2RlZmF1bHRTdHJ9OiBgKTtcbiAgICAgICAgICBjb25zdCBmaW5hbE1hcHBpbmcgPSBtYXBwaW5nIHx8IHN1Z2dlc3Rpb247XG4gICAgICAgICAgaWYgKGZpbmFsTWFwcGluZykge1xuICAgICAgICAgICAgaWYgKGZpbmFsTWFwcGluZy5zdGFydHNXaXRoKCd7JykpIHtcbiAgICAgICAgICAgICAgdHJ5IHsgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBKU09OLnBhcnNlKGZpbmFsTWFwcGluZyk7IH1cbiAgICAgICAgICAgICAgY2F0Y2ggeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZzsgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBmaW5hbE1hcHBpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGRlZmF1bHRUZW1wbGF0ZSA9IGB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyR7YXJyYXlQcm9wLnBhdGh9LWl0ZW0ucGhwYDtcbiAgICAgIHRlbXBsYXRlUGF0aCA9IGF3YWl0IHByb21wdChgVGVtcGxhdGUgcGF0aCBbJHtkZWZhdWx0VGVtcGxhdGV9XTogYCkgfHwgZGVmYXVsdFRlbXBsYXRlO1xuICAgIH1cblxuICAgIGNvbnN0IGFycmF5Q29uZmlnOiBEeW5hbWljQXJyYXlDb25maWcgPSB7XG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgcG9zdFR5cGVzLFxuICAgICAgc2VsZWN0aW9uTW9kZTogaXNRdWVyeU1vZGUgPyAncXVlcnknIDogJ21hbnVhbCcsXG4gICAgICBtYXhJdGVtcyxcbiAgICAgIHJlbmRlck1vZGU6IGlzTWFwcGVkTW9kZSA/ICdtYXBwZWQnIDogJ3RlbXBsYXRlJyxcbiAgICB9O1xuICAgIGlmIChpc01hcHBlZE1vZGUgJiYgT2JqZWN0LmtleXMoZmllbGRNYXBwaW5nKS5sZW5ndGggPiAwKSBhcnJheUNvbmZpZy5maWVsZE1hcHBpbmcgPSBmaWVsZE1hcHBpbmc7XG4gICAgaWYgKCFpc01hcHBlZE1vZGUgJiYgdGVtcGxhdGVQYXRoKSBhcnJheUNvbmZpZy50ZW1wbGF0ZVBhdGggPSB0ZW1wbGF0ZVBhdGg7XG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICBhcnJheUNvbmZpZy5kZWZhdWx0UXVlcnlBcmdzID0ge1xuICAgICAgICBwb3N0c19wZXJfcGFnZTogTWF0aC5taW4obWF4SXRlbXMsIDYpLFxuICAgICAgICBvcmRlcmJ5OiAnZGF0ZScsXG4gICAgICAgIG9yZGVyOiAnREVTQycsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gYXJyYXlDb25maWc7XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBCcmVhZGNydW1ic0FycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlQnJlYWRjcnVtYnNBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPEJyZWFkY3J1bWJzQXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgQnJlYWRjcnVtYnMgYXJlIGJ1aWx0IGF1dG9tYXRpY2FsbHkgZnJvbSB0aGUgY3VycmVudCBwYWdlIFVSTC5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciB3aWxsIHNob3cgYSBzaW5nbGUgZW5hYmxlL2Rpc2FibGUgdG9nZ2xlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBhY3RpdmUgfVxcbmApO1xuICAgIHJldHVybiB7IGFycmF5VHlwZTogJ2JyZWFkY3J1bWJzJyB9O1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgVGF4b25vbXlBcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkgPSBhc3luYyAoKTogUHJvbWlzZTxUYXhvbm9teUFycmF5Q29uZmlnPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIFRheG9ub215IHRlcm1zIGFyZSBmZXRjaGVkIGZyb20gdGhlIGN1cnJlbnQgcG9zdCBzZXJ2ZXItc2lkZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciBzaG93cyBhIHRvZ2dsZSBhbmQgYSBkcm9wZG93biB0byBjaG9vc2UgdGhlIHRheG9ub215LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBzbHVnIH1cXG5gKTtcblxuICAgIGNvbnNvbGUubG9nKGBFbnRlciB0aGUgdGF4b25vbXkgc2x1Z3MgZWRpdG9ycyBjYW4gY2hvb3NlIGZyb20gKGNvbW1hLXNlcGFyYXRlZCk6YCk7XG4gICAgY29uc3QgdGF4b25vbXlJbnB1dCA9IGF3YWl0IHByb21wdChgVGF4b25vbWllcyBbcG9zdF90YWcsY2F0ZWdvcnldOiBgKTtcbiAgICBjb25zdCB0YXhvbm9taWVzID0gdGF4b25vbXlJbnB1dFxuICAgICAgPyB0YXhvbm9teUlucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3RfdGFnJywgJ2NhdGVnb3J5J107XG5cbiAgICBjb25zdCBtYXhJdGVtc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBNYXhpbXVtIHRlcm1zIHRvIGRpc3BsYXkgKC0xID0gYWxsKSBbLTFdOiBgKTtcbiAgICBjb25zdCBtYXhJdGVtcyA9IG1heEl0ZW1zSW5wdXQgPyBwYXJzZUludChtYXhJdGVtc0lucHV0LCAxMCkgOiAtMTtcblxuICAgIGNvbnN0IGNvbmZpZzogVGF4b25vbXlBcnJheUNvbmZpZyA9IHsgYXJyYXlUeXBlOiAndGF4b25vbXknLCB0YXhvbm9taWVzIH07XG4gICAgaWYgKG1heEl0ZW1zID4gMCkgY29uZmlnLm1heEl0ZW1zID0gbWF4SXRlbXM7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIFBhZ2luYXRpb25BcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVBhZ2luYXRpb25BcnJheSA9IGFzeW5jIChvdGhlckFycmF5UGF0aHM6IHN0cmluZ1tdKTogUHJvbWlzZTxQYWdpbmF0aW9uQXJyYXlDb25maWcgfCBudWxsPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIFBhZ2luYXRpb24gbGlua3MgYXJlIGRlcml2ZWQgYXV0b21hdGljYWxseSBmcm9tIGEgc2libGluZyBwb3N0cyBhcnJheSBxdWVyeS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciBzaG93cyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG5cbiAgICBpZiAob3RoZXJBcnJheVBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKaoO+4jyAgTm8gc2libGluZyBhcnJheXMgZm91bmQgdG8gY29ubmVjdCB0by4gQ29uZmlndXJlIGEgcG9zdHMgYXJyYXkgZmlyc3QuYCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgY29ubmVjdGVkRmllbGQ6IHN0cmluZztcbiAgICBpZiAob3RoZXJBcnJheVBhdGhzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBvdGhlckFycmF5UGF0aHNbMF07XG4gICAgICBjb25zb2xlLmxvZyhgICAgQ29ubmVjdGVkIHRvOiAke2Nvbm5lY3RlZEZpZWxkfSAob25seSBvcHRpb24pYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICAgJ1doaWNoIHBvc3RzIGFycmF5IHNob3VsZCB0aGlzIHBhZ2luYXRpb24gYmUgY29ubmVjdGVkIHRvPycsXG4gICAgICAgIG90aGVyQXJyYXlQYXRocyxcbiAgICAgICAgMFxuICAgICAgKTtcbiAgICAgIGNvbm5lY3RlZEZpZWxkID0gY2hvaWNlO1xuICAgIH1cblxuICAgIHJldHVybiB7IGFycmF5VHlwZTogJ3BhZ2luYXRpb24nLCBjb25uZWN0ZWRGaWVsZCB9O1xuICB9O1xuXG4gIC8vIENvbmZpZ3VyZSBlYWNoIHNlbGVjdGVkIGFycmF5XG4gIGZvciAoY29uc3QgYXJyYXlQcm9wIG9mIHNlbGVjdGVkQXJyYXlzKSB7XG4gICAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBDb25maWd1cmluZzogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9XFxuYCk7XG5cbiAgICAvLyBMZXQgdGhlIHVzZXIgY2hvb3NlIHRoZSBhcnJheSB0eXBlXG4gICAgY29uc3QgYXJyYXlUeXBlQ2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ1doYXQga2luZCBvZiBkYXRhIHNob3VsZCB0aGlzIGFycmF5IGNvbnRhaW4/JyxcbiAgICAgIFtcbiAgICAgICAgJ1Bvc3RzIOKAlCBxdWVyeSBvciBoYW5kLXBpY2sgV29yZFByZXNzIHBvc3RzIChkZWZhdWx0KScsXG4gICAgICAgICdCcmVhZGNydW1icyDigJQgYXV0by1nZW5lcmF0ZWQgdHJhaWwgZnJvbSBjdXJyZW50IFVSTCcsXG4gICAgICAgICdUYXhvbm9teSDigJQgdGVybXMgYXR0YWNoZWQgdG8gdGhlIGN1cnJlbnQgcG9zdCcsXG4gICAgICAgICdQYWdpbmF0aW9uIOKAlCBsaW5rcyBkZXJpdmVkIGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5JyxcbiAgICAgIF0sXG4gICAgICAwXG4gICAgKTtcblxuICAgIGxldCBhcnJheUNvbmZpZzogRmllbGRDb25maWcgfCBudWxsID0gbnVsbDtcblxuICAgIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnQnJlYWRjcnVtYnMnKSkge1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5KCk7XG4gICAgfSBlbHNlIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnVGF4b25vbXknKSkge1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVUYXhvbm9teUFycmF5KCk7XG4gICAgfSBlbHNlIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnUGFnaW5hdGlvbicpKSB7XG4gICAgICAvLyBPZmZlciB0aGUgb3RoZXIgYWxyZWFkeS1jb25maWd1cmVkIChvciB5ZXQtdG8tYmUtY29uZmlndXJlZCkgYXJyYXkgcGF0aHMgYXMgY2FuZGlkYXRlc1xuICAgICAgY29uc3Qgc2libGluZyA9IHNlbGVjdGVkQXJyYXlzXG4gICAgICAgIC5maWx0ZXIoYSA9PiBhLnBhdGggIT09IGFycmF5UHJvcC5wYXRoKVxuICAgICAgICAubWFwKGEgPT4gYS5wYXRoKTtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5KHNpYmxpbmcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBQb3N0c1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQb3N0c0FycmF5KGFycmF5UHJvcCk7XG4gICAgfVxuXG4gICAgaWYgKGFycmF5Q29uZmlnKSB7XG4gICAgICBjb21wb25lbnRGaWVsZENvbmZpZ1thcnJheVByb3AucGF0aF0gPSBhcnJheUNvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7inIUgQ29uZmlndXJlZDogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9ICgkeyhhcnJheUNvbmZpZyBhcyBhbnkpLmFycmF5VHlwZSA/PyAncG9zdHMnfSlgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgU2tpcHBlZDogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9YCk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBVcGRhdGUgY29uZmlnIGZpbGUg4oCUIHJlbW92ZSBsZWdhY3kgZHluYW1pY0FycmF5cyBpZiBwcmVzZW50XG4gIGNvbnN0IHsgZHluYW1pY0FycmF5czogX2xlZ2FjeUR5bmFtaWMsIC4uLnJlc3RDb25maWcgfSA9IGV4aXN0aW5nQ29uZmlnO1xuICBjb25zdCBuZXdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHtcbiAgICAuLi5yZXN0Q29uZmlnLFxuICAgIGltcG9ydDogaW1wb3J0Q29uZmlnLFxuICB9O1xuICBcbiAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbiBQcmV2aWV3OlxcbmApO1xuICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh7IGltcG9ydDogaW1wb3J0Q29uZmlnIH0sIG51bGwsIDIpKTtcbiAgXG4gIGNvbnN0IHNob3VsZFNhdmUgPSBhd2FpdCBwcm9tcHRZZXNObygnXFxuU2F2ZSB0byBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uPycsIHRydWUpO1xuICBcbiAgaWYgKHNob3VsZFNhdmUpIHtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gICAgY29uc29sZS5sb2coYFxcbuKchSBTYXZlZCB0byAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYFxcbvCfkqEgTmV4dCBzdGVwczpgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMS4gUnVuOiBucG0gcnVuIGRldiAtLSAke2NvbXBvbmVudE5hbWV9IC0tZm9yY2VgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMi4gQnVpbGQgeW91ciBibG9ja3M6IGNkIGRlbW8vcGx1Z2luICYmIG5wbSBydW4gYnVpbGRgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMy4gVGVzdCB0aGUgYmxvY2sgaW4gV29yZFByZXNzXFxuYCk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29uZmlndXJhdGlvbiBub3Qgc2F2ZWQuIENvcHkgdGhlIEpTT04gYWJvdmUgbWFudWFsbHkgaWYgbmVlZGVkLlxcbmApO1xuICB9XG59O1xuXG4vLyBDb25maWd1cmUgZHluYW1pYyBhcnJheXMgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnY29uZmlndXJlLWR5bmFtaWMgW2NvbXBvbmVudF0nKVxuICAuYWxpYXMoJ3dpemFyZCcpXG4gIC5kZXNjcmlwdGlvbignSW50ZXJhY3RpdmUgd2l6YXJkIHRvIGNvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBmb3IgYSBjb21wb25lbnQnKVxuICAub3B0aW9uKCctYSwgLS1hcGktdXJsIDx1cmw+JywgJ0hhbmRvZmYgQVBJIGJhc2UgVVJMJylcbiAgLm9wdGlvbignLXUsIC0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lJylcbiAgLm9wdGlvbignLXAsIC0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLWwsIC0tbGlzdCcsICdMaXN0IGF2YWlsYWJsZSBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7XG4gICAgYXBpVXJsPzogc3RyaW5nO1xuICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgIHBhc3N3b3JkPzogc3RyaW5nO1xuICAgIGxpc3Q/OiBib29sZWFuO1xuICB9KSA9PiB7XG4gICAgY29uc3QgYXBpVXJsID0gb3B0cy5hcGlVcmwgPz8gY29uZmlnLmFwaVVybDtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBcbiAgICAvLyBJZiBsaXN0aW5nIGNvbXBvbmVudHMsIHNob3cgY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkc1xuICAgIGlmIChvcHRzLmxpc3QgfHwgIWNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0IGZyb20gJHthcGlVcmx9Li4uXFxuYCk7XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGZldGNoQ29tcG9uZW50TGlzdChhcGlVcmwsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgICBcbiAgICAgICAgLy8gRmV0Y2ggZWFjaCBjb21wb25lbnQgdG8gZmluZCBvbmVzIHdpdGggYXJyYXkgZmllbGRzXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50cy4gQ2hlY2tpbmcgZm9yIGFycmF5IGZpZWxkcy4uLlxcbmApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY29tcG9uZW50c1dpdGhBcnJheXM6IEFycmF5PHsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgYXJyYXlzOiBzdHJpbmdbXSB9PiA9IFtdO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBpZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBpZCwgYXV0aCk7XG4gICAgICAgICAgICBjb25zdCBhcnJheXMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIGlmIChhcnJheXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgICB0aXRsZTogY29tcG9uZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgIGFycmF5czogYXJyYXlzLm1hcChhID0+IGEucGF0aCksXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGNvbXBvbmVudHNXaXRoQXJyYXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIE5vIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMgZm91bmQuXFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+nqSBDb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzOlxcbmApO1xuICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5mb3JFYWNoKChjLCBpKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICAgIGMuYXJyYXlzLmZvckVhY2goYSA9PiBjb25zb2xlLmxvZyhgICAgICAg4pSU4pSAICR7YX1gKSk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgaWYgKG9wdHMubGlzdCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIFJ1bjogbnBtIHJ1biBkZXYgLS0gd2l6YXJkIDxjb21wb25lbnQtaWQ+XFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJbnRlcmFjdGl2ZSBzZWxlY3Rpb25cbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGNvbXBvbmVudHNXaXRoQXJyYXlzLm1hcChjID0+IGAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdENob2ljZSgnXFxuU2VsZWN0IGEgY29tcG9uZW50IHRvIGNvbmZpZ3VyZTonLCBjaG9pY2VzLCAwKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRJbmRleCA9IGNob2ljZXMuaW5kZXhPZihzZWxlY3RlZCk7XG4gICAgICAgIGNvbXBvbmVudE5hbWUgPSBjb21wb25lbnRzV2l0aEFycmF5c1tzZWxlY3RlZEluZGV4XS5pZDtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBhd2FpdCBjb25maWd1cmVEeW5hbWljQXJyYXlzKGFwaVVybCwgY29tcG9uZW50TmFtZSwgYXV0aCk7XG4gIH0pO1xuXG4vLyBJbml0IGNvbW1hbmRcbnByb2dyYW1cbiAgLmNvbW1hbmQoJ2luaXQnKVxuICAuZGVzY3JpcHRpb24oJ0NyZWF0ZSBhIGhhbmRvZmYtd3AuY29uZmlnLmpzb24gZmlsZSBpbiB0aGUgY3VycmVudCBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctLW91dHB1dCA8ZGlyPicsICdPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MnKVxuICAub3B0aW9uKCctLXRoZW1lLWRpciA8ZGlyPicsICdUaGVtZSBkaXJlY3RvcnkgZm9yIGhlYWRlci9mb290ZXIgdGVtcGxhdGVzJylcbiAgLm9wdGlvbignLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCcpXG4gIC5vcHRpb24oJy0tZm9yY2UnLCAnT3ZlcndyaXRlIGV4aXN0aW5nIGNvbmZpZyBmaWxlJylcbiAgLmFjdGlvbigob3B0aW9ucywgY29tbWFuZCkgPT4ge1xuICAgIC8vIFVzZSBvcHRzV2l0aEdsb2JhbHMgdG8gZ2V0IG9wdGlvbnMgZnJvbSBib3RoIHN1YmNvbW1hbmQgYW5kIHBhcmVudFxuICAgIGNvbnN0IG9wdHMgPSBjb21tYW5kLm9wdHNXaXRoR2xvYmFscygpO1xuICAgIGluaXRDb25maWcob3B0cyk7XG4gIH0pO1xuXG4vLyBEZWZhdWx0IGNvbW1hbmQgZm9yIGJsb2Nrc1xucHJvZ3JhbVxuICAuYXJndW1lbnQoJ1tjb21wb25lbnRdJywgJ0NvbXBvbmVudCBuYW1lIHRvIGNvbXBpbGUgb3IgdmFsaWRhdGUnKVxuICAub3B0aW9uKCctYSwgLS1hcGktdXJsIDx1cmw+JywgYEhhbmRvZmYgQVBJIGJhc2UgVVJMIChkZWZhdWx0OiAke2NvbmZpZy5hcGlVcmx9KWApXG4gIC5vcHRpb24oJy1vLCAtLW91dHB1dCA8ZGlyPicsIGBPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MgKGRlZmF1bHQ6ICR7Y29uZmlnLm91dHB1dH0pYClcbiAgLm9wdGlvbignLS1hbGwnLCAnQ29tcGlsZSBhbGwgYXZhaWxhYmxlIGNvbXBvbmVudHMnKVxuICAub3B0aW9uKCctLXRoZW1lJywgJ0NvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcikgdG8gdGhlbWUgZGlyZWN0b3J5JylcbiAgLm9wdGlvbignLXQsIC0tdGhlbWUtZGlyIDxkaXI+JywgYFRoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMgKGRlZmF1bHQ6ICR7Y29uZmlnLnRoZW1lRGlyfSlgKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLXAsIC0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkIGZvciBIYW5kb2ZmIEFQSScpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUnLCAnVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXMnKVxuICAub3B0aW9uKCctLXZhbGlkYXRlLWFsbCcsICdWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tZm9yY2UnLCAnRm9yY2UgY29tcGlsYXRpb24gZXZlbiB3aXRoIGJyZWFraW5nIGNoYW5nZXMnKVxuICAuYWN0aW9uKGFzeW5jIChjb21wb25lbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdHM6IHsgXG4gICAgYXBpVXJsPzogc3RyaW5nOyBcbiAgICBvdXRwdXQ/OiBzdHJpbmc7IFxuICAgIGFsbD86IGJvb2xlYW47IFxuICAgIHRoZW1lPzogYm9vbGVhbjtcbiAgICB0aGVtZURpcj86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICB2YWxpZGF0ZT86IGJvb2xlYW47XG4gICAgdmFsaWRhdGVBbGw/OiBib29sZWFuO1xuICAgIGZvcmNlPzogYm9vbGVhbjtcbiAgfSkgPT4ge1xuICAgIC8vIE1lcmdlIENMSSBvcHRpb25zIHdpdGggY29uZmlnIChDTEkgdGFrZXMgcHJlY2VkZW5jZSlcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IG91dHB1dCA9IG9wdHMub3V0cHV0ID8/IGNvbmZpZy5vdXRwdXQ7XG4gICAgY29uc3QgdGhlbWVEaXIgPSBvcHRzLnRoZW1lRGlyID8/IGNvbmZpZy50aGVtZURpcjtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBcbiAgICAvLyBWYWxpZGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudmFsaWRhdGVBbGwpIHtcbiAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGFwaVVybCwgb3V0cHV0LCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgaWYgKG9wdHMudmFsaWRhdGUgJiYgY29tcG9uZW50TmFtZSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoYXBpVXJsLCBvdXRwdXQsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCAmJiAhb3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBpbGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudGhlbWUpIHtcbiAgICAgIGF3YWl0IGNvbXBpbGVUaGVtZShhcGlVcmwsIHRoZW1lRGlyLCBhdXRoKTtcbiAgICB9IGVsc2UgaWYgKG9wdHMuYWxsKSB7XG4gICAgICAvLyBWYWxpZGF0ZSBhbGwgZmlyc3QgdW5sZXNzIGZvcmNlZFxuICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIFByZS1jb21waWxhdGlvbiB2YWxpZGF0aW9uLi4uXFxuYCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoYXBpVXJsLCBvdXRwdXQsIGNvbmZpZy5pbXBvcnQsIGF1dGgpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyB2YWxpZGF0ZUFsbCBleGl0cyB3aXRoIGNvZGUgMSBvbiBicmVha2luZyBjaGFuZ2VzXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBjb21waWxlQWxsKGFwaVVybCwgb3V0cHV0LCBhdXRoKTtcbiAgICAgIFxuICAgICAgLy8gVXBkYXRlIG1hbmlmZXN0IGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGlsYXRpb25cbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OdIFVwZGF0aW5nIHByb3BlcnR5IG1hbmlmZXN0Li4uYCk7XG4gICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBmZXRjaENvbXBvbmVudExpc3QoYXBpVXJsLCBjb25maWcuaW1wb3J0LCBhdXRoKTtcbiAgICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgZmV0Y2hDb21wb25lbnQoYXBpVXJsLCBjb21wb25lbnRJZCwgYXV0aCk7XG4gICAgICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0LCBjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBTa2lwIGZhaWxlZCBjb21wb25lbnRzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgIH0gZWxzZSBpZiAoY29tcG9uZW50TmFtZSkge1xuICAgICAgLy8gQnVpbGQgbWVyZ2VkLWdyb3VwIGxvb2t1cCBvbmNlIGZvciB0aGlzIGJyYW5jaFxuICAgICAgY29uc3QgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgICAgfVxuXG4gICAgICAvLyBIZWxwZXI6IGNvbXBpbGUgYW4gZW50aXJlIG1lcmdlZCBncm91cCBieSBpdHMgY29uZmlnIGtleVxuICAgICAgY29uc3QgY29tcGlsZUdyb3VwQnlLZXkgPSBhc3luYyAoZ3JvdXBLZXk6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgZmV0Y2hBbGxDb21wb25lbnRzTGlzdChhcGlVcmwsIGF1dGgpO1xuICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IGdyb3VwS2V5LnRvTG93ZXJDYXNlKCksXG4gICAgICAgICk7XG4gICAgICAgIGlmIChncm91cE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IE5vIGNvbXBvbmVudHMgZm91bmQgZm9yIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bGxHcm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgZ3JvdXBNYXRjaGVzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGMuaWQsIGF1dGgpO1xuICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhmdWxsKTtcbiAgICAgICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFNraXBwaW5nICR7Yy5pZH0gKHRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkKWApO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bGxHcm91cENvbXBvbmVudHMucHVzaChmdWxsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjLmlkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogQ291bGQgbm90IGZldGNoIGFueSBjb21wb25lbnRzIGZvciBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChhcGlVcmwsIG91dHB1dCwgZ3JvdXBLZXksIGZ1bGxHcm91cENvbXBvbmVudHMsIGF1dGgpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pyFIEdyb3VwIFwiJHtncm91cEtleX1cIiBjb21waWxlZCAoJHtmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpLlxcbmApO1xuICAgICAgfTtcblxuICAgICAgLy8gVHJ5IGNvbXBvbmVudCBmaXJzdCwgdGhlbiBmYWxsIGJhY2sgdG8gZ3JvdXAgKGUuZy4gXCJoZXJvXCIgLT4gSGVybyBtZXJnZWQgYmxvY2spXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBmZXRjaENvbXBvbmVudChhcGlVcmwsIGNvbXBvbmVudE5hbWUsIGF1dGgpO1xuXG4gICAgICAgIC8vIElmIHRoaXMgY29tcG9uZW50IGJlbG9uZ3MgdG8gYSBtZXJnZWQgZ3JvdXAsIGNvbXBpbGUgdGhlIHdob2xlIGdyb3VwIGluc3RlYWRcbiAgICAgICAgaWYgKGNvbXBvbmVudC5ncm91cCkge1xuICAgICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChjb21wb25lbnQuZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgaWYgKGdyb3VwS2V5KSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgXCIke2NvbXBvbmVudE5hbWV9XCIgYmVsb25ncyB0byBtZXJnZWQgZ3JvdXAgXCIke2dyb3VwS2V5fVwiIOKAlCBjb21waWxpbmcgZW50aXJlIGdyb3VwLlxcbmApO1xuICAgICAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwQnlLZXkoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghb3B0cy5mb3JjZSkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGFwaVVybCwgb3V0cHV0LCBjb21wb25lbnROYW1lLCBhdXRoKTtcbiAgICAgICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlKHtcbiAgICAgICAgICBhcGlVcmwsXG4gICAgICAgICAgb3V0cHV0RGlyOiBvdXRwdXQsXG4gICAgICAgICAgY29tcG9uZW50TmFtZSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0LCBjb21wb25lbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg8J+TnSBNYW5pZmVzdCB1cGRhdGVkXFxuYCk7XG4gICAgICB9IGNhdGNoIChjb21wb25lbnRFcnJvcikge1xuICAgICAgICAvLyBObyBjb21wb25lbnQgd2l0aCB0aGlzIG5hbWUg4oCTIHRyeSBhcyBncm91cFxuICAgICAgICBjb25zb2xlLmxvZyhgICAgTm8gY29tcG9uZW50IFwiJHtjb21wb25lbnROYW1lfVwiIGZvdW5kLCBjaGVja2luZyBncm91cHMuLi5cXG5gKTtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGZldGNoQWxsQ29tcG9uZW50c0xpc3QoYXBpVXJsLCBhdXRoKTtcbiAgICAgICAgY29uc3QgbmFtZUxvd2VyID0gY29tcG9uZW50TmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IG5hbWVMb3dlcixcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50IG9yIGdyb3VwIGZvdW5kIGZvciBcIiR7Y29tcG9uZW50TmFtZX1cIi5gKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICAgICAgQ29tcG9uZW50IGZldGNoOiAke2NvbXBvbmVudEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBjb21wb25lbnRFcnJvci5tZXNzYWdlIDogY29tcG9uZW50RXJyb3J9YCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgICAgICBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KG5hbWVMb3dlcikgPz8gZ3JvdXBNYXRjaGVzWzBdLmdyb3VwO1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiBQbGVhc2Ugc3BlY2lmeSBhIGNvbXBvbmVudCBuYW1lLCBncm91cCBuYW1lLCB1c2UgLS1hbGwgZmxhZywgLS10aGVtZSBmbGFnLCBvciAtLXZhbGlkYXRlLWFsbCBmbGFnJyk7XG4gICAgICBjb25zb2xlLmxvZygnXFxuVXNhZ2U6Jyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiAgIENvbXBpbGUgb25lIGNvbXBvbmVudCAoZS5nLiBoZXJvLWFydGljbGUpJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGdyb3VwLW5hbWU+ICAgICAgT3IgY29tcGlsZSBhIG1lcmdlZCBncm91cCAoZS5nLiBoZXJvKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS10aGVtZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdmFsaWRhdGUgaGVyby1hcnRpY2xlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLWFsbCAtLWZvcmNlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgaGVybyAtLWFwaS11cmwgaHR0cDovL2xvY2FsaG9zdDo0MDAwIC0tb3V0cHV0IC4vYmxvY2tzJyk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9KTtcblxucHJvZ3JhbS5wYXJzZSgpO1xuXG5leHBvcnQgeyBjb21waWxlLCBnZW5lcmF0ZUJsb2NrLCBmZXRjaENvbXBvbmVudCB9O1xuIl19