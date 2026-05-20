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
 *   --source <dir>     Read Handoff API JSON from disk (e.g. ./src/handoff/public/api)
 *   --watch            Watch --source for changes (requires --source)
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchComponent = exports.generateBlock = exports.compile = void 0;
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const chokidar_1 = __importDefault(require("chokidar"));
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
const block_lifecycle_1 = require("./block-lifecycle");
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
 * Download a file from a URL and save it to disk (HTTP only)
 */
const httpDownloadFile = async (url, destPath, auth) => {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = buildRequestOptions(url, auth);
        protocol.get(options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    httpDownloadFile(redirectUrl, destPath, auth).then(resolve);
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
 * Fetch component data from Handoff API (HTTP only)
 */
const httpFetchComponent = async (apiUrl, componentName, auth) => {
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
exports.fetchComponent = httpFetchComponent;
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
const writeBlockFiles = async (outputDir, componentId, block, ctx) => {
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
        screenshotDownloaded = await ctxDownloadFile(ctx, block.screenshotUrl, screenshotPath);
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
    const dataCtx = {
        apiUrl: options.apiUrl,
        auth: options.auth,
        localApiRoot: options.localApiRoot,
    };
    console.log(`\n🔧 Gutenberg Compiler`);
    console.log(`   API: ${options.apiUrl}`);
    if (dataCtx.localApiRoot) {
        console.log(`   Source: ${dataCtx.localApiRoot} (local)`);
    }
    console.log(`   Component: ${options.componentName}`);
    console.log(`   Output: ${options.outputDir}`);
    if (options.auth?.username) {
        console.log(`   Auth: ${options.auth.username}`);
    }
    console.log('');
    try {
        // Fetch component from API
        console.log(`📡 Fetching component data...`);
        const component = await ctxFetchComponent(dataCtx, options.componentName);
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
        await writeBlockFiles(options.outputDir, component.id, block, dataCtx);
        const contentRoot = path.resolve(options.outputDir, '..');
        await syncBundleAssets(dataCtx, contentRoot);
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
 * Fetch list of all components from API, filtered by import config (HTTP only)
 */
const httpFetchComponentList = async (apiUrl, importConfig, auth) => {
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
 * Fetch full list of all components from API (no import filter). Used to resolve group names (HTTP only).
 */
const httpFetchAllComponentsList = async (apiUrl, auth) => {
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
const readLocalComponentsJson = (localApiRoot) => {
    const p = path.join(localApiRoot, 'components.json');
    if (!fs.existsSync(p)) {
        throw new Error(`Local Handoff API missing components list: ${p}`);
    }
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
};
const resolveUrlToLocalPath = (localApiRoot, url) => {
    let pathname = '';
    try {
        pathname = new URL(url).pathname;
    }
    catch {
        const q = url.indexOf('?');
        pathname = q >= 0 ? url.slice(0, q) : url;
        if (!pathname.startsWith('/'))
            pathname = '/' + pathname;
    }
    let normalized = pathname.replace(/^\/+/, '');
    const apiPrefix = 'api/component/';
    if (normalized.startsWith(apiPrefix)) {
        const rel = normalized.slice(apiPrefix.length);
        const p = path.join(localApiRoot, 'component', rel);
        return fs.existsSync(p) ? p : null;
    }
    if (normalized.startsWith('images/')) {
        const p = path.join(localApiRoot, '..', normalized);
        return fs.existsSync(p) ? p : null;
    }
    const base = path.basename(pathname);
    const fallback = path.join(localApiRoot, 'component', base);
    return fs.existsSync(fallback) ? fallback : null;
};
const ctxFetchComponent = async (ctx, componentName) => {
    if (ctx.localApiRoot) {
        const file = path.join(ctx.localApiRoot, 'component', `${componentName}.json`);
        if (!fs.existsSync(file)) {
            throw new Error(`Local component JSON not found: ${file}`);
        }
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return httpFetchComponent(ctx.apiUrl, componentName, ctx.auth);
};
const ctxFetchComponentList = async (ctx, importConfig) => {
    if (ctx.localApiRoot) {
        const components = readLocalComponentsJson(ctx.localApiRoot);
        return components.filter((c) => shouldImportComponent(c.id, c.type, importConfig)).map((c) => c.id);
    }
    return httpFetchComponentList(ctx.apiUrl, importConfig, ctx.auth);
};
const ctxFetchAllComponentsList = async (ctx) => {
    if (ctx.localApiRoot) {
        return readLocalComponentsJson(ctx.localApiRoot);
    }
    return httpFetchAllComponentsList(ctx.apiUrl, ctx.auth);
};
const ctxDownloadFile = async (ctx, url, destPath) => {
    if (ctx.localApiRoot) {
        const srcPath = resolveUrlToLocalPath(ctx.localApiRoot, url);
        if (!srcPath) {
            console.warn(`   ⚠️  Local asset not found for URL: ${url}`);
            return false;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        return true;
    }
    return httpDownloadFile(url, destPath, ctx.auth);
};
/**
 * Copy Handoff bundle main.js / main.css from local public/api into wp-content/handoff/assets.
 */
const syncBundleAssets = async (ctx, contentRoot) => {
    if (!ctx.localApiRoot)
        return;
    const assetsCssDir = path.join(contentRoot, 'assets', 'css');
    const assetsJsDir = path.join(contentRoot, 'assets', 'js');
    fs.mkdirSync(assetsCssDir, { recursive: true });
    fs.mkdirSync(assetsJsDir, { recursive: true });
    const mainCss = path.join(ctx.localApiRoot, 'component', 'main.css');
    const mainJs = path.join(ctx.localApiRoot, 'component', 'main.js');
    if (fs.existsSync(mainCss)) {
        fs.copyFileSync(mainCss, path.join(assetsCssDir, 'main.css'));
        console.log(`   ✅ assets/css/main.css (from --source)`);
    }
    else {
        console.warn(`   ⚠️  Missing ${mainCss}`);
    }
    if (fs.existsSync(mainJs)) {
        fs.copyFileSync(mainJs, path.join(assetsJsDir, 'main.js'));
        console.log(`   ✅ assets/js/main.js (from --source)`);
    }
    else {
        console.warn(`   ⚠️  Missing ${mainJs}`);
    }
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
const compileGroup = async (ctx, outputDir, groupSlug, groupComponents) => {
    console.log(`\n🔀 Generating merged group block: ${groupSlug} (${groupComponents.length} variants)`);
    const variantInfos = groupComponents.map((c) => buildVariantInfo(c, config));
    // Build variant screenshot map (which variants have images to download)
    const variantScreenshots = {};
    for (const comp of groupComponents) {
        variantScreenshots[comp.id] = !!comp.image;
    }
    const mergedBlock = (0, generators_1.generateMergedBlock)(groupSlug, groupComponents, variantInfos, ctx.apiUrl, variantScreenshots);
    const groupBlockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const groupDir = path.join(outputDir, groupBlockName);
    if (!fs.existsSync(groupDir)) {
        fs.mkdirSync(groupDir, { recursive: true });
    }
    // Download variant screenshots
    if (mergedBlock.variantScreenshotUrls) {
        for (const [variantId, url] of Object.entries(mergedBlock.variantScreenshotUrls)) {
            const screenshotPath = path.join(groupDir, `screenshot-${variantId}.png`);
            console.log(`   📷 Downloading screenshot for variant ${variantId}...`);
            const ok = await ctxDownloadFile(ctx, url, screenshotPath);
            if (!ok) {
                variantScreenshots[variantId] = false;
            }
        }
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
const compileAll = async (ctx, outputDir) => {
    console.log(`\n🔧 Gutenberg Compiler - Batch Mode`);
    console.log(`   API: ${ctx.apiUrl}`);
    if (ctx.localApiRoot) {
        console.log(`   Source: ${ctx.localApiRoot} (local)`);
    }
    console.log(`   Output: ${outputDir}`);
    if (ctx.auth?.username) {
        console.log(`   Auth: ${ctx.auth.username}`);
    }
    console.log('');
    try {
        console.log(`📡 Fetching component list...`);
        const componentIds = await ctxFetchComponentList(ctx, config.import);
        console.log(`   Found ${componentIds.length} components\n`);
        let success = 0;
        let failed = 0;
        const compiledComponents = [];
        const schemaHistory = (0, validators_1.loadManifest)(outputDir);
        // Fetch all components first so we can partition by group
        const allComponents = [];
        for (const componentId of componentIds) {
            try {
                const component = await ctxFetchComponent(ctx, componentId);
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
                const block = generateBlock(component, ctx.apiUrl, config, schemaHistory);
                await writeBlockFiles(outputDir, component.id, block, ctx);
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
                await compileGroup(ctx, outputDir, groupSlug, groupComponents);
                compiledComponents.push(...groupComponents);
                success += groupComponents.length;
            }
            catch (error) {
                console.error(`❌ Failed to compile merged group ${groupSlug}: ${error instanceof Error ? error.message : error}`);
                failed += groupComponents.length;
            }
        }
        // Reconcile local blocks: mark dirs not in this compile output as deprecated
        console.log(`\n⚙️  Reconciling local blocks with compile output...`);
        const activeSlugs = (0, block_lifecycle_1.getActiveBlockSlugs)(individualComponents, groupBuckets);
        const reconcileResult = (0, block_lifecycle_1.reconcileLocalBlocks)(outputDir, activeSlugs);
        const newlyDeprecated = reconcileResult.marked;
        if (newlyDeprecated.length > 0) {
            console.log(`   ⚠️  Marked ${newlyDeprecated.length} block(s) as deprecated: ${newlyDeprecated.join(', ')}`);
        }
        else if (reconcileResult.alreadyDeprecated.length > 0) {
            console.log(`   ℹ️  ${reconcileResult.alreadyDeprecated.length} block(s) remain deprecated (unchanged)`);
        }
        else {
            console.log(`   ✅ All local blocks match current compile output`);
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
        // Download or copy main.css and main.js design system assets
        console.log(`\n📡 Syncing design system assets...`);
        const assetsDir = path.join(outputDir, '..', 'assets');
        const assetsCssDir = path.join(assetsDir, 'css');
        const assetsJsDir = path.join(assetsDir, 'js');
        if (!fs.existsSync(assetsCssDir)) {
            fs.mkdirSync(assetsCssDir, { recursive: true });
        }
        if (!fs.existsSync(assetsJsDir)) {
            fs.mkdirSync(assetsJsDir, { recursive: true });
        }
        if (ctx.localApiRoot) {
            await syncBundleAssets(ctx, path.resolve(outputDir, '..'));
        }
        else {
            const cssUrl = `${ctx.apiUrl}/api/component/main.css`;
            const cssPath = path.join(assetsCssDir, 'main.css');
            const cssDownloaded = await ctxDownloadFile(ctx, cssUrl, cssPath);
            if (cssDownloaded) {
                console.log(`   ✅ assets/css/main.css`);
            }
            else {
                console.warn(`   ⚠️  Could not download main.css from ${cssUrl}`);
            }
            const jsUrl = `${ctx.apiUrl}/api/component/main.js`;
            const jsPath = path.join(assetsJsDir, 'main.js');
            const jsDownloaded = await ctxDownloadFile(ctx, jsUrl, jsPath);
            if (jsDownloaded) {
                console.log(`   ✅ assets/js/main.js`);
            }
            else {
                console.warn(`   ⚠️  Could not download main.js from ${jsUrl}`);
            }
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
const compileTheme = async (ctx, outputDir) => {
    console.log(`\n🎨 Theme Template Compiler`);
    console.log(`   API: ${ctx.apiUrl}`);
    if (ctx.localApiRoot) {
        console.log(`   Source: ${ctx.localApiRoot} (local)`);
    }
    console.log(`   Output: ${outputDir}`);
    if (ctx.auth?.username) {
        console.log(`   Auth: ${ctx.auth.username}`);
    }
    console.log('');
    try {
        // Compile header
        console.log(`📡 Fetching header component...`);
        try {
            const header = await ctxFetchComponent(ctx, 'header');
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
            const footer = await ctxFetchComponent(ctx, 'footer');
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
                const component = await ctxFetchComponent(ctx, variant);
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

- **API URL:** ${ctx.apiUrl}
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
npx handoff-wp --theme --api-url ${ctx.apiUrl}
\`\`\`
`;
            const readmePath = path.join(handoffTemplatesDir, 'README.md');
            fs.writeFileSync(readmePath, readmeContent);
            console.log(`📝 Generated: ${readmePath}\n`);
        }
        // Download or copy main.css and main.js assets
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
        if (ctx.localApiRoot) {
            await syncBundleAssets(ctx, outputDir);
        }
        else {
            // Download main.css
            const cssUrl = `${ctx.apiUrl}/api/component/main.css`;
            const cssPath = path.join(cssDir, 'main.css');
            console.log(`   Downloading main.css...`);
            const cssDownloaded = await ctxDownloadFile(ctx, cssUrl, cssPath);
            if (cssDownloaded) {
                console.log(`✅ Downloaded: ${cssPath}`);
            }
            else {
                console.warn(`⚠️  Could not download main.css from ${cssUrl}`);
            }
            // Download main.js
            const jsUrl = `${ctx.apiUrl}/api/component/main.js`;
            const jsPath = path.join(jsDir, 'main.js');
            console.log(`   Downloading main.js...`);
            const jsDownloaded = await ctxDownloadFile(ctx, jsUrl, jsPath);
            if (jsDownloaded) {
                console.log(`✅ Downloaded: ${jsPath}`);
            }
            else {
                console.warn(`⚠️  Could not download main.js from ${jsUrl}`);
            }
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
const validate = async (ctx, outputDir, componentName) => {
    console.log(`\n🔍 Validating Component: ${componentName}`);
    console.log(`   API: ${ctx.apiUrl}`);
    if (ctx.localApiRoot) {
        console.log(`   Source: ${ctx.localApiRoot} (local)`);
    }
    console.log(`   Manifest: ${outputDir}\n`);
    // Fetch component
    const component = await ctxFetchComponent(ctx, componentName);
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
const validateAll = async (ctx, outputDir, importConfig) => {
    console.log(`\n🔍 Validating All Components`);
    console.log(`   API: ${ctx.apiUrl}`);
    if (ctx.localApiRoot) {
        console.log(`   Source: ${ctx.localApiRoot} (local)`);
    }
    console.log(`   Manifest: ${outputDir}\n`);
    try {
        // Fetch component list
        console.log(`📡 Fetching component list...`);
        const componentIds = await ctxFetchComponentList(ctx, importConfig);
        console.log(`   Found ${componentIds.length} components\n`);
        // Load manifest
        const manifest = (0, validators_1.loadManifest)(outputDir);
        let valid = 0;
        let invalid = 0;
        let newComponents = 0;
        const breakingChanges = [];
        for (const componentId of componentIds) {
            try {
                const component = await ctxFetchComponent(ctx, componentId);
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
/**
 * Watch local Handoff `public/api` output and recompile blocks / sync bundles.
 */
const runWatchMode = async (ctx, outputDir, onlyComponentId, runOpts) => {
    const root = ctx.localApiRoot;
    const contentRoot = path.resolve(outputDir, '..');
    console.log(`\n👀 Watch mode`);
    console.log(`   Source: ${root}`);
    console.log(`   Blocks: ${outputDir}\n`);
    let debTimer;
    const schedule = (fn) => {
        if (debTimer)
            clearTimeout(debTimer);
        debTimer = setTimeout(() => {
            void fn().catch((err) => console.error('[watch]', err));
        }, 150);
    };
    const compileOne = async (stem) => {
        if (stem === 'components')
            return;
        console.log(`\n[watch] Recompiling ${stem}...`);
        try {
            const component = await ctxFetchComponent(ctx, stem);
            const mergedGroupConfigKeyByLower = new Map();
            for (const [key, mode] of Object.entries(config.groups)) {
                if (mode === 'merged')
                    mergedGroupConfigKeyByLower.set(key.toLowerCase(), key);
            }
            if (component.group) {
                const groupKey = mergedGroupConfigKeyByLower.get(component.group.toLowerCase());
                if (groupKey) {
                    const allComponents = await ctxFetchAllComponentsList(ctx);
                    const groupMatches = allComponents.filter((c) => c.group && c.group.toLowerCase() === groupKey.toLowerCase());
                    const fullGroupComponents = [];
                    for (const c of groupMatches) {
                        try {
                            const full = await ctxFetchComponent(ctx, c.id);
                            const templateValidation = (0, validators_1.validateTemplateVariables)(full);
                            if (!templateValidation.isValid) {
                                console.warn(`   ⚠️  Skipping ${c.id} (template validation failed)`);
                                continue;
                            }
                            fullGroupComponents.push(full);
                        }
                        catch {
                            // skip
                        }
                    }
                    if (fullGroupComponents.length > 0) {
                        await compileGroup(ctx, outputDir, groupKey, fullGroupComponents);
                        await syncBundleAssets(ctx, contentRoot);
                    }
                    return;
                }
            }
            if (!runOpts.force) {
                const result = await validate(ctx, outputDir, stem);
                if (!result.isValid) {
                    console.warn(`[watch] Skipping ${stem}: breaking changes (re-run with --force to compile anyway)`);
                    return;
                }
            }
            await compile({
                apiUrl: ctx.apiUrl,
                outputDir,
                componentName: stem,
                auth: ctx.auth,
                localApiRoot: root,
            });
            const comp = await ctxFetchComponent(ctx, stem);
            updateManifestForComponent(outputDir, comp);
        }
        catch (e) {
            console.error(`[watch] Failed ${stem}:`, e instanceof Error ? e.message : e);
        }
    };
    const patterns = [];
    if (onlyComponentId) {
        patterns.push(path.join(root, 'component', `${onlyComponentId}.json`));
    }
    else {
        patterns.push(path.join(root, 'component', '*.json'));
    }
    patterns.push(path.join(root, 'component', 'main.js'), path.join(root, 'component', 'main.css'));
    const watcher = chokidar_1.default.watch(patterns, {
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        ignoreInitial: true,
    });
    watcher.on('all', (event, filePath) => {
        if (!filePath)
            return;
        if (!['add', 'change', 'unlink'].includes(event))
            return;
        const base = path.basename(filePath);
        if (base === 'main.js' || base === 'main.css') {
            schedule(async () => {
                await syncBundleAssets(ctx, contentRoot);
                console.log('[watch] Bundle assets synced');
            });
            return;
        }
        if (filePath.endsWith('.json')) {
            const stem = path.basename(filePath, '.json');
            if (onlyComponentId && stem !== onlyComponentId)
                return;
            schedule(() => compileOne(stem));
        }
    });
    watcher.on('ready', () => {
        console.log('Watching for changes. Press Ctrl+C to stop.\n');
    });
    await new Promise(() => {
        /* keep process alive */
    });
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
const configureDynamicArrays = async (ctx, componentName) => {
    console.log(`\n🧙 Dynamic Array Configuration Wizard`);
    console.log(`   Component: ${componentName}`);
    console.log(`   API: ${ctx.apiUrl}`);
    if (ctx.localApiRoot) {
        console.log(`   Source: ${ctx.localApiRoot} (local)`);
    }
    console.log('');
    // Fetch component
    console.log(`📡 Fetching component structure...`);
    let component;
    try {
        component = await ctxFetchComponent(ctx, componentName);
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
    .option('-s, --source <dir>', 'Read Handoff public/api from disk instead of HTTP')
    .action(async (componentName, opts) => {
    const apiUrl = opts.apiUrl ?? config.apiUrl;
    const auth = {
        username: opts.username ?? config.username,
        password: opts.password ?? config.password,
    };
    const localApiRoot = opts.source ? path.resolve(process.cwd(), opts.source) : undefined;
    const dataCtx = { apiUrl, auth, localApiRoot };
    // If listing components, show components with array fields
    if (opts.list || !componentName) {
        console.log(`\n🔍 Fetching component list from ${apiUrl}...\n`);
        try {
            const componentIds = await ctxFetchComponentList(dataCtx, config.import);
            // Fetch each component to find ones with array fields
            console.log(`📋 Found ${componentIds.length} components. Checking for array fields...\n`);
            const componentsWithArrays = [];
            for (const id of componentIds) {
                try {
                    const component = await ctxFetchComponent(dataCtx, id);
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
    await configureDynamicArrays(dataCtx, componentName);
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
    .option('-s, --source <dir>', 'Read Handoff public/api from disk instead of HTTP')
    .option('--watch', 'Watch --source for changes (requires --source)')
    .action(async (componentName, opts) => {
    // Merge CLI options with config (CLI takes precedence)
    const apiUrl = opts.apiUrl ?? config.apiUrl;
    const output = opts.output ?? config.output;
    const themeDir = opts.themeDir ?? config.themeDir;
    const auth = {
        username: opts.username ?? config.username,
        password: opts.password ?? config.password,
    };
    const localApiRoot = opts.source ? path.resolve(process.cwd(), opts.source) : undefined;
    const dataCtx = { apiUrl, auth, localApiRoot };
    if (opts.watch) {
        if (!localApiRoot) {
            console.error('Error: --watch requires --source <dir> (path to Handoff public/api)');
            process.exit(1);
        }
        if (opts.validateAll || opts.validate || opts.all || opts.theme) {
            console.error('Error: --watch cannot be combined with --all, --theme, --validate, or --validate-all');
            process.exit(1);
        }
        await runWatchMode(dataCtx, output, componentName, { force: opts.force });
        return;
    }
    // Validation commands
    if (opts.validateAll) {
        await validateAll(dataCtx, output, config.import);
        return;
    }
    if (opts.validate && componentName) {
        const result = await validate(dataCtx, output, componentName);
        if (!result.isValid && !opts.force) {
            console.log(`\n⚠️  Component has breaking changes. Use --force to compile anyway.\n`);
            process.exit(1);
        }
        return;
    }
    // Compilation commands
    if (opts.theme) {
        await compileTheme(dataCtx, themeDir);
    }
    else if (opts.all) {
        // Validate all first unless forced
        if (!opts.force) {
            console.log(`\n🔍 Pre-compilation validation...\n`);
            try {
                await validateAll(dataCtx, output, config.import);
            }
            catch {
                // validateAll exits with code 1 on breaking changes
                return;
            }
        }
        await compileAll(dataCtx, output);
        // Update manifest after successful compilation
        console.log(`\n📝 Updating property manifest...`);
        const componentIds = await ctxFetchComponentList(dataCtx, config.import);
        for (const componentId of componentIds) {
            try {
                const component = await ctxFetchComponent(dataCtx, componentId);
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
            const allComponents = await ctxFetchAllComponentsList(dataCtx);
            const groupMatches = allComponents.filter((c) => c.group && c.group.toLowerCase() === groupKey.toLowerCase());
            if (groupMatches.length === 0) {
                console.error(`Error: No components found for merged group "${groupKey}".`);
                process.exit(1);
            }
            const fullGroupComponents = [];
            for (const c of groupMatches) {
                try {
                    const full = await ctxFetchComponent(dataCtx, c.id);
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
            await compileGroup(dataCtx, output, groupKey, fullGroupComponents);
            if (dataCtx.localApiRoot) {
                await syncBundleAssets(dataCtx, path.resolve(output, '..'));
            }
            console.log(`   ✅ Group "${groupKey}" compiled (${fullGroupComponents.length} variants).\n`);
        };
        // Try component first, then fall back to group (e.g. "hero" -> Hero merged block)
        try {
            const component = await ctxFetchComponent(dataCtx, componentName);
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
                const result = await validate(dataCtx, output, componentName);
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
                localApiRoot,
            });
            updateManifestForComponent(output, component);
            console.log(`   📝 Manifest updated\n`);
        }
        catch (componentError) {
            // No component with this name – try as group
            console.log(`   No component "${componentName}" found, checking groups...\n`);
            const allComponents = await ctxFetchAllComponentsList(dataCtx);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgseUNBQW9DO0FBQ3BDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsNkNBQStCO0FBQy9CLDJDQUE2QjtBQUM3Qix3REFBZ0M7QUFDaEMsbURBQXFDO0FBQ3JDLGlEQUF5QztBQUV6QyxtQ0FBZ1M7QUEyQmhTOztHQUVHO0FBQ0gsTUFBTSxjQUFjLEdBQW1CO0lBQ3JDLE1BQU0sRUFBRSx1QkFBdUI7SUFDL0IsTUFBTSxFQUFFLFVBQVU7SUFDbEIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtJQUMxQixNQUFNLEVBQUUsRUFBRTtDQUNYLENBQUM7QUFFRjs7O0dBR0c7QUFDSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsYUFBaUQsRUFBZ0IsRUFBRTtJQUMvRixNQUFNLFlBQVksR0FBaUIsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDdEQsTUFBTSxXQUFXLEdBQTBDLEVBQUUsQ0FBQztJQUU5RCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztZQUFFLFNBQVM7UUFDOUIsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUM7WUFBRSxTQUFTO1FBQzlCLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxT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Q0FBQyxDQUFDLEdBQUcsQ0FBQztRQUMxQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUM7WUFBRSxRQUFRLEdBQUcsR0FBRyxHQUFHLFFBQVEsQ0FBQztJQUMzRCxDQUFDO0lBQ0QsSUFBSSxVQUFVLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDOUMsTUFBTSxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7SUFDbkMsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDckMsTUFBTSxHQUFHLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0MsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDckMsQ0FBQztJQUNELElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ3JDLENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM1RCxPQUFPLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMs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QUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnRkFBZ0YsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDO0FBRUwsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuLyoqXG4gKiBHdXRlbmJlcmcgQ29tcGlsZXJcbiAqIFxuICogVHJhbnNwaWxlcyBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MuXG4gKiBcbiAqIFVzYWdlOlxuICogICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiBbb3B0aW9uc11cbiAqICAgXG4gKiBPcHRpb25zOlxuICogICAtLWFwaS11cmwgPHVybD4gICAgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6IGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMClcbiAqICAgLS1vdXRwdXQgPGRpcj4gICAgIE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogLi9ibG9ja3MpXG4gKiAgIC0tYWxsICAgICAgICAgICAgICBDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50c1xuICogICAtLXRoZW1lICAgICAgICAgICAgQ29tcGlsZSBoZWFkZXIvZm9vdGVyIHRvIHRoZW1lIHRlbXBsYXRlc1xuICogICAtLXZhbGlkYXRlICAgICAgICAgVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqICAgLS12YWxpZGF0ZS1hbGwgICAgIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiAgIC0tc291cmNlIDxkaXI+ICAgICBSZWFkIEhhbmRvZmYgQVBJIEpTT04gZnJvbSBkaXNrIChlLmcuIC4vc3JjL2hhbmRvZmYvcHVibGljL2FwaSlcbiAqICAgLS13YXRjaCAgICAgICAgICAgIFdhdGNoIC0tc291cmNlIGZvciBjaGFuZ2VzIChyZXF1aXJlcyAtLXNvdXJjZSlcbiAqIFxuICogQ29uZmlndXJhdGlvbjpcbiAqICAgQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHlvdXIgcHJvamVjdCByb290IHRvIHNldCBkZWZhdWx0czpcbiAqICAge1xuICogICAgIFwiYXBpVXJsXCI6IFwiaHR0cHM6Ly9kZW1vLmhhbmRvZmYuY29tXCIsXG4gKiAgICAgXCJvdXRwdXRcIjogXCIuL3BhdGgvdG8vYmxvY2tzXCIsXG4gKiAgICAgXCJ0aGVtZURpclwiOiBcIi4vcGF0aC90by90aGVtZVwiXG4gKiAgIH1cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IGNob2tpZGFyIGZyb20gJ2Nob2tpZGFyJztcbmltcG9ydCAqIGFzIHByZXR0aWVyIGZyb20gJ3ByZXR0aWVyJztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgQ29tcGlsZXJPcHRpb25zLCBHZW5lcmF0ZWRCbG9jaywgSGFuZG9mZldwQ29uZmlnLCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRDb25maWcsIEltcG9ydENvbmZpZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnLCBGaWVsZFByZWZlcmVuY2VzLCBpc0R5bmFtaWNBcnJheUNvbmZpZyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIEF1dGggY3JlZGVudGlhbHMgZm9yIEhUVFAgcmVxdWVzdHNcbiAqL1xuaW50ZXJmYWNlIEF1dGhDcmVkZW50aWFscyB7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXF1aXJlZCBjb25maWcgd2l0aCBkZWZhdWx0cyBhcHBsaWVkXG4gKi9cbmludGVyZmFjZSBSZXNvbHZlZENvbmZpZyB7XG4gIGFwaVVybDogc3RyaW5nO1xuICBvdXRwdXQ6IHN0cmluZztcbiAgdGhlbWVEaXI6IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBpbXBvcnQ6IEltcG9ydENvbmZpZztcbiAgZ3JvdXBzOiBSZWNvcmQ8c3RyaW5nLCAnbWVyZ2VkJyB8ICdpbmRpdmlkdWFsJz47XG4gIHNjaGVtYU1pZ3JhdGlvbnM/OiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCB7XG4gICAgcmVuYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgdHJhbnNmb3Jtcz86IFJlY29yZDxzdHJpbmcsIHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nOyBydWxlOiBzdHJpbmcgfT47XG4gIH0+Pjtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gKi9cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBSZXNvbHZlZENvbmZpZyA9IHtcbiAgYXBpVXJsOiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgb3V0cHV0OiAnLi9ibG9ja3MnLFxuICB0aGVtZURpcjogJy4vdGhlbWUnLFxuICB1c2VybmFtZTogdW5kZWZpbmVkLFxuICBwYXNzd29yZDogdW5kZWZpbmVkLFxuICBpbXBvcnQ6IHsgZWxlbWVudDogZmFsc2UgfSxcbiAgZ3JvdXBzOiB7fSxcbn07XG5cbi8qKlxuICogTWlncmF0ZSBsZWdhY3kgYGR5bmFtaWNBcnJheXNgIGNvbmZpZyB0byB0aGUgbmV3IGBpbXBvcnRgIHN0cnVjdHVyZS5cbiAqIEdyb3VwcyBcImNvbXBvbmVudElkLmZpZWxkTmFtZVwiIGVudHJpZXMgdW5kZXIgaW1wb3J0LmJsb2NrW2NvbXBvbmVudElkXVtmaWVsZE5hbWVdLlxuICovXG5jb25zdCBtaWdyYXRlRHluYW1pY0FycmF5cyA9IChkeW5hbWljQXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KTogSW1wb3J0Q29uZmlnID0+IHtcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGNvbnN0IGJsb2NrQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+ID0ge307XG5cbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCFjb25maWcuZW5hYmxlZCkgY29udGludWU7XG4gICAgY29uc3QgZG90SW5kZXggPSBrZXkuaW5kZXhPZignLicpO1xuICAgIGlmIChkb3RJbmRleCA9PT0gLTEpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGNvbXBvbmVudElkID0ga2V5LnN1YnN0cmluZygwLCBkb3RJbmRleCk7XG4gICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZyhkb3RJbmRleCArIDEpO1xuXG4gICAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPSB7fTtcbiAgICB9XG4gICAgKGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KVtmaWVsZE5hbWVdID0gY29uZmlnO1xuICB9XG5cbiAgaWYgKE9iamVjdC5rZXlzKGJsb2NrQ29uZmlnKS5sZW5ndGggPiAwKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0gYmxvY2tDb25maWc7XG4gIH1cblxuICByZXR1cm4gaW1wb3J0Q29uZmlnO1xufTtcblxuLyoqXG4gKiBMb2FkIGNvbmZpZ3VyYXRpb24gZnJvbSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGlmIGl0IGV4aXN0c1xuICovXG5jb25zdCBsb2FkQ29uZmlnID0gKCk6IEhhbmRvZmZXcENvbmZpZyA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNvbmZpZ0NvbnRlbnQpIGFzIEhhbmRvZmZXcENvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OEIExvYWRlZCBjb25maWcgZnJvbSAke2NvbmZpZ1BhdGh9YCk7XG4gICAgICByZXR1cm4gY29uZmlnO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRmFpbGVkIHRvIHBhcnNlIGhhbmRvZmYtd3AuY29uZmlnLmpzb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiB7fTtcbn07XG5cbi8qKlxuICogTWVyZ2UgY29uZmlndXJhdGlvbiBzb3VyY2VzIHdpdGggcHJpb3JpdHk6IENMSSA+IGNvbmZpZyBmaWxlID4gZGVmYXVsdHNcbiAqL1xuY29uc3QgZ2V0Q29uZmlnID0gKCk6IFJlc29sdmVkQ29uZmlnID0+IHtcbiAgY29uc3QgZmlsZUNvbmZpZyA9IGxvYWRDb25maWcoKTtcblxuICBsZXQgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWc7XG4gIGlmIChmaWxlQ29uZmlnLmltcG9ydCkge1xuICAgIGltcG9ydENvbmZpZyA9IGZpbGVDb25maWcuaW1wb3J0O1xuICB9IGVsc2UgaWYgKGZpbGVDb25maWcuZHluYW1pY0FycmF5cykge1xuICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBcImR5bmFtaWNBcnJheXNcIiBjb25maWcgaXMgZGVwcmVjYXRlZC4gTWlncmF0ZSB0byBcImltcG9ydFwiIOKAlCBzZWUgU1BFQ0lGSUNBVElPTi5tZC5gKTtcbiAgICBpbXBvcnRDb25maWcgPSBtaWdyYXRlRHluYW1pY0FycmF5cyhmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpO1xuICB9IGVsc2Uge1xuICAgIGltcG9ydENvbmZpZyA9IERFRkFVTFRfQ09ORklHLmltcG9ydDtcbiAgfVxuICBcbiAgcmV0dXJuIHtcbiAgICBhcGlVcmw6IGZpbGVDb25maWcuYXBpVXJsID8/IERFRkFVTFRfQ09ORklHLmFwaVVybCxcbiAgICBvdXRwdXQ6IGZpbGVDb25maWcub3V0cHV0ID8/IERFRkFVTFRfQ09ORklHLm91dHB1dCxcbiAgICB0aGVtZURpcjogZmlsZUNvbmZpZy50aGVtZURpciA/PyBERUZBVUxUX0NPTkZJRy50aGVtZURpcixcbiAgICB1c2VybmFtZTogZmlsZUNvbmZpZy51c2VybmFtZSA/PyBERUZBVUxUX0NPTkZJRy51c2VybmFtZSxcbiAgICBwYXNzd29yZDogZmlsZUNvbmZpZy5wYXNzd29yZCA/PyBERUZBVUxUX0NPTkZJRy5wYXNzd29yZCxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgICBncm91cHM6IGZpbGVDb25maWcuZ3JvdXBzID8/IERFRkFVTFRfQ09ORklHLmdyb3VwcyxcbiAgICBzY2hlbWFNaWdyYXRpb25zOiBmaWxlQ29uZmlnLnNjaGVtYU1pZ3JhdGlvbnMsXG4gIH07XG59O1xuXG5cbi8qKlxuICogQnVpbGQgSFRUUCByZXF1ZXN0IG9wdGlvbnMgd2l0aCBvcHRpb25hbCBiYXNpYyBhdXRoXG4gKi9cbmNvbnN0IGJ1aWxkUmVxdWVzdE9wdGlvbnMgPSAodXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBodHRwLlJlcXVlc3RPcHRpb25zIHwgaHR0cHMuUmVxdWVzdE9wdGlvbnMgPT4ge1xuICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKHVybCk7XG4gIGNvbnN0IG9wdGlvbnM6IGh0dHAuUmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICBwb3J0OiBwYXJzZWRVcmwucG9ydCB8fCAocGFyc2VkVXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/IDQ0MyA6IDgwKSxcbiAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgaGVhZGVyczoge30sXG4gIH07XG4gIFxuICBpZiAoYXV0aD8udXNlcm5hbWUgJiYgYXV0aD8ucGFzc3dvcmQpIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IEJ1ZmZlci5mcm9tKGAke2F1dGgudXNlcm5hbWV9OiR7YXV0aC5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0ge1xuICAgICAgLi4ub3B0aW9ucy5oZWFkZXJzLFxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmFzaWMgJHtjcmVkZW50aWFsc31gLFxuICAgIH07XG4gIH1cbiAgXG4gIHJldHVybiBvcHRpb25zO1xufTtcblxuLy8gTG9hZCBjb25maWcgYXQgc3RhcnR1cFxuY29uc3QgY29uZmlnID0gZ2V0Q29uZmlnKCk7XG5pbXBvcnQge1xuICBnZW5lcmF0ZUJsb2NrSnNvbixcbiAgZ2VuZXJhdGVJbmRleEpzLFxuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgZ2VuZXJhdGVFZGl0b3JTY3NzLFxuICBnZW5lcmF0ZVN0eWxlU2NzcyxcbiAgZ2VuZXJhdGVSZWFkbWUsXG4gIHRvQmxvY2tOYW1lLFxuICBnZW5lcmF0ZUhlYWRlclBocCxcbiAgZ2VuZXJhdGVGb290ZXJQaHAsXG4gIGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwLFxuICBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAsXG4gIGdlbmVyYXRlU2hhcmVkQ29tcG9uZW50cyxcbiAgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsXG4gIGdlbmVyYXRlTWVyZ2VkQmxvY2ssXG4gIGdlbmVyYXRlRGVwcmVjYXRpb25zLFxuICBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyxcbn0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB0eXBlIHsgVmFyaWFudEluZm8gfSBmcm9tICcuL2dlbmVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgZ2V0QWN0aXZlQmxvY2tTbHVncyxcbiAgcmVjb25jaWxlTG9jYWxCbG9ja3MsXG59IGZyb20gJy4vYmxvY2stbGlmZWN5Y2xlJztcbmltcG9ydCB7XG4gIGxvYWRNYW5pZmVzdCxcbiAgc2F2ZU1hbmlmZXN0LFxuICB2YWxpZGF0ZUNvbXBvbmVudCxcbiAgdXBkYXRlTWFuaWZlc3QsXG4gIGdldENvbXBvbmVudEhpc3RvcnksXG4gIGV4dHJhY3RQcm9wZXJ0aWVzLFxuICBmb3JtYXRWYWxpZGF0aW9uUmVzdWx0LFxuICBWYWxpZGF0aW9uUmVzdWx0LFxuICB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzLFxuICBmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHRcbn0gZnJvbSAnLi92YWxpZGF0b3JzJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hSGlzdG9yeSB9IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5cbi8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUHJldHRpZXIgKHVzaW5nIHJlcXVpcmUgZm9yIGNvbXBhdGliaWxpdHkpXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuY29uc3QgcGhwUGx1Z2luID0gcmVxdWlyZSgnQHByZXR0aWVyL3BsdWdpbi1waHAnKTtcblxuLyoqXG4gKiBGb3JtYXQgY29kZSB3aXRoIFByZXR0aWVyXG4gKi9cbmNvbnN0IGZvcm1hdENvZGUgPSBhc3luYyAoY29kZTogc3RyaW5nLCBwYXJzZXI6ICdiYWJlbCcgfCAnanNvbicgfCAnc2NzcycgfCAncGhwJyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3B0aW9uczogcHJldHRpZXIuT3B0aW9ucyA9IHtcbiAgICAgIHBhcnNlcixcbiAgICAgIHNpbmdsZVF1b3RlOiB0cnVlLFxuICAgICAgdGFiV2lkdGg6IDIsXG4gICAgICBwcmludFdpZHRoOiAxMDAsXG4gICAgICB0cmFpbGluZ0NvbW1hOiAnZXM1JyxcbiAgICB9O1xuICAgIFxuICAgIC8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUEhQIGZpbGVzXG4gICAgaWYgKHBhcnNlciA9PT0gJ3BocCcpIHtcbiAgICAgIG9wdGlvbnMucGx1Z2lucyA9IFtwaHBQbHVnaW5dO1xuICAgICAgLy8gUEhQLXNwZWNpZmljIG9wdGlvbnMgLSBjYXN0IHRvIGFueSBmb3IgcGx1Z2luLXNwZWNpZmljIG9wdGlvbnNcbiAgICAgIChvcHRpb25zIGFzIGFueSkucGhwVmVyc2lvbiA9ICc4LjAnO1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5icmFjZVN0eWxlID0gJzF0YnMnO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYXdhaXQgcHJldHRpZXIuZm9ybWF0KGNvZGUsIG9wdGlvbnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIGZvcm1hdHRpbmcgZmFpbHMsIHJldHVybiBvcmlnaW5hbCBjb2RlXG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFByZXR0aWVyIGZvcm1hdHRpbmcgZmFpbGVkIGZvciAke3BhcnNlcn0sIHVzaW5nIHVuZm9ybWF0dGVkIGNvZGVgKTtcbiAgICByZXR1cm4gY29kZTtcbiAgfVxufTtcblxuY29uc3QgcHJvZ3JhbSA9IG5ldyBDb21tYW5kKCk7XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgY29weSBhIGRpcmVjdG9yeSB0cmVlLCBjcmVhdGluZyB0YXJnZXQgZGlycyBhcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGNvcHlEaXJSZWN1cnNpdmUgPSAoc3JjOiBzdHJpbmcsIGRlc3Q6IHN0cmluZyk6IHZvaWQgPT4ge1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZGVzdCkpIHtcbiAgICBmcy5ta2RpclN5bmMoZGVzdCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBmcy5yZWFkZGlyU3luYyhzcmMpKSB7XG4gICAgY29uc3Qgc3JjUGF0aCA9IHBhdGguam9pbihzcmMsIGVudHJ5KTtcbiAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihkZXN0LCBlbnRyeSk7XG4gICAgaWYgKGZzLnN0YXRTeW5jKHNyY1BhdGgpLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHBhY2thZ2UuanNvbiBpbiB0aGUgY29udGVudCBkaXJlY3RvcnkgYW5kIHJ1biBucG0gaW5zdGFsbFxuICogc28gdGhhdCBibG9ja3MgYW5kIHNoYXJlZCBjb21wb25lbnRzIGNhbiByZXNvbHZlIHRoZWlyIGltcG9ydHMuXG4gKi9cbmNvbnN0IGVuc3VyZUNvbnRlbnREZXBlbmRlbmNpZXMgPSAoY29udGVudFJvb3Q6IHN0cmluZyk6IHZvaWQgPT4ge1xuICBjb25zdCBwa2dQYXRoID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAncGFja2FnZS5qc29uJyk7XG5cbiAgY29uc3QgcGtnID0ge1xuICAgIG5hbWU6ICdoYW5kb2ZmLWJsb2Nrcy1jb250ZW50JyxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIHByaXZhdGU6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBdXRvLWdlbmVyYXRlZCBieSBIYW5kb2ZmIGNvbXBpbGVyIOKAlCBibG9jayBidWlsZCBkZXBlbmRlbmNpZXMuJyxcbiAgICBkZXBlbmRlbmNpZXM6IHtcbiAgICAgICdAMTB1cC9ibG9jay1jb21wb25lbnRzJzogJ14xLjIyLjEnLFxuICAgIH0sXG4gICAgZGV2RGVwZW5kZW5jaWVzOiB7XG4gICAgICAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9ibG9ja3MnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9jb21wb25lbnRzJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvY29yZS1kYXRhJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvZGF0YSc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2VsZW1lbnQnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9pMThuJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvaWNvbnMnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9zY3JpcHRzJzogJ14yNy4wLjAnLFxuICAgICAgJ2NvcHktd2VicGFjay1wbHVnaW4nOiAnXjExLjAuMCcsXG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBkZXNpcmVkID0gSlNPTi5zdHJpbmdpZnkocGtnLCBudWxsLCAyKSArICdcXG4nO1xuXG4gIGxldCBuZWVkc0luc3RhbGwgPSB0cnVlO1xuICBpZiAoZnMuZXhpc3RzU3luYyhwa2dQYXRoKSkge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gZnMucmVhZEZpbGVTeW5jKHBrZ1BhdGgsICd1dGY4Jyk7XG4gICAgaWYgKGV4aXN0aW5nID09PSBkZXNpcmVkKSB7XG4gICAgICBuZWVkc0luc3RhbGwgPSAhZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4oY29udGVudFJvb3QsICdub2RlX21vZHVsZXMnKSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG5lZWRzSW5zdGFsbCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OmIEluc3RhbGxpbmcgYmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzLi4uYCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhwa2dQYXRoLCBkZXNpcmVkKTtcbiAgICB0cnkge1xuICAgICAgZXhlY1N5bmMoJ25wbSBpbnN0YWxsIC0taWdub3JlLXNjcmlwdHMnLCB7XG4gICAgICAgIGN3ZDogY29udGVudFJvb3QsXG4gICAgICAgIHN0ZGlvOiAnaW5oZXJpdCcsXG4gICAgICB9KTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRGVwZW5kZW5jaWVzIGluc3RhbGxlZCBpbiAke2NvbnRlbnRSb290fWApO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIG5wbSBpbnN0YWxsIGZhaWxlZCDigJQgeW91IG1heSBuZWVkIHRvIHJ1biBpdCBtYW51YWxseSBpbiAke2NvbnRlbnRSb290fWApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+TpiBCbG9jayBidWlsZCBkZXBlbmRlbmNpZXMgYWxyZWFkeSB1cCB0byBkYXRlYCk7XG4gIH1cbn07XG5cbi8qKlxuICogRG93bmxvYWQgYSBmaWxlIGZyb20gYSBVUkwgYW5kIHNhdmUgaXQgdG8gZGlzayAoSFRUUCBvbmx5KVxuICovXG5jb25zdCBodHRwRG93bmxvYWRGaWxlID0gYXN5bmMgKHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgLy8gSGFuZGxlIHJlZGlyZWN0c1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzLnN0YXR1c0NvZGUgPT09IDMwMikge1xuICAgICAgICBjb25zdCByZWRpcmVjdFVybCA9IHJlcy5oZWFkZXJzLmxvY2F0aW9uO1xuICAgICAgICBpZiAocmVkaXJlY3RVcmwpIHtcbiAgICAgICAgICBodHRwRG93bmxvYWRGaWxlKHJlZGlyZWN0VXJsLCBkZXN0UGF0aCwgYXV0aCkudGhlbihyZXNvbHZlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBkb3dubG9hZCBzY3JlZW5zaG90OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCk7XG4gICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IGZpbGVTdHJlYW0gPSBmcy5jcmVhdGVXcml0ZVN0cmVhbShkZXN0UGF0aCk7XG4gICAgICByZXMucGlwZShmaWxlU3RyZWFtKTtcbiAgICAgIFxuICAgICAgZmlsZVN0cmVhbS5vbignZmluaXNoJywgKCkgPT4ge1xuICAgICAgICBmaWxlU3RyZWFtLmNsb3NlKCk7XG4gICAgICAgIHJlc29sdmUodHJ1ZSk7XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgZmlsZVN0cmVhbS5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICAgIGZzLnVubGluayhkZXN0UGF0aCwgKCkgPT4ge30pOyAvLyBDbGVhbiB1cCBwYXJ0aWFsIGZpbGVcbiAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBzYXZlIHNjcmVlbnNob3Q6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gZG93bmxvYWQgc2NyZWVuc2hvdDogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEZldGNoIGNvbXBvbmVudCBkYXRhIGZyb20gSGFuZG9mZiBBUEkgKEhUVFAgb25seSlcbiAqL1xuY29uc3QgaHR0cEZldGNoQ29tcG9uZW50ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnQ+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50LyR7Y29tcG9uZW50TmFtZX0uanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50IEpTT046ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbGwgYmxvY2sgZmlsZXMgZnJvbSBhIGNvbXBvbmVudFxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gYXBpVXJsIC0gVGhlIGJhc2UgQVBJIFVSTCBmb3IgZmV0Y2hpbmcgc2NyZWVuc2hvdHNcbiAqIEBwYXJhbSByZXNvbHZlZENvbmZpZyAtIFRoZSByZXNvbHZlZCBjb25maWd1cmF0aW9uIGluY2x1ZGluZyBkeW5hbWljIGFycmF5IHNldHRpbmdzXG4gKi9cbmNvbnN0IGdlbmVyYXRlQmxvY2sgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCBhcGlVcmw6IHN0cmluZywgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnLCBzY2hlbWFIaXN0b3J5PzogU2NoZW1hSGlzdG9yeSk6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgaGFzU2NyZWVuc2hvdCA9ICEhY29tcG9uZW50LmltYWdlO1xuICBcbiAgLy8gQ29uc3RydWN0IGZ1bGwgc2NyZWVuc2hvdCBVUkwgaWYgaW1hZ2UgcGF0aCBpcyBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3RVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgaWYgKGNvbXBvbmVudC5pbWFnZSkge1xuICAgIC8vIEhhbmRsZSBib3RoIGFic29sdXRlIFVSTHMgYW5kIHJlbGF0aXZlIHBhdGhzXG4gICAgaWYgKGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwOi8vJykgfHwgY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBjb21wb25lbnQuaW1hZ2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlbGF0aXZlIHBhdGggLSBwcmVwZW5kIEFQSSBVUkxcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBgJHthcGlVcmx9JHtjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wb25lbnQuaW1hZ2V9YDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciB0aGlzIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnXG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KVxuICB9O1xuICBcbiAgLy8gQXV0by1kZXRlY3QgcGFnaW5hdGlvbiBmb3IgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZW50cmllcyBvbmx5XG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggcmljaHRleHQgZmllbGQgKGlmIGFueSkgdXNlcyBJbm5lckJsb2Nrc1xuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIC8vIENoZWNrIGV4cGxpY2l0IGNvbmZpZyBvdmVycmlkZXMgZmlyc3RcbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cbiAgXG4gIGNvbnN0IGhpc3RvcnlFbnRyeSA9IHNjaGVtYUhpc3RvcnkgPyBnZXRDb21wb25lbnRIaXN0b3J5KHNjaGVtYUhpc3RvcnksIGNvbXBvbmVudC5pZCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGN1cnJlbnRQcm9wcyA9IGV4dHJhY3RQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgY29uc3QgbWlncmF0aW9uT3ZlcnJpZGVzID0gcmVzb2x2ZWRDb25maWcuc2NoZW1hTWlncmF0aW9ucz8uW2NvbXBvbmVudC5pZF07XG4gIGNvbnN0IGRlcHJlY2F0aW9uc0NvZGUgPSBnZW5lcmF0ZURlcHJlY2F0aW9ucyhcbiAgICBoaXN0b3J5RW50cnksXG4gICAgY3VycmVudFByb3BzLFxuICAgIG1pZ3JhdGlvbk92ZXJyaWRlcyxcbiAgICAhIWlubmVyQmxvY2tzRmllbGRcbiAgKTtcblxuICByZXR1cm4ge1xuICAgIGJsb2NrSnNvbjogZ2VuZXJhdGVCbG9ja0pzb24oY29tcG9uZW50LCBoYXNTY3JlZW5zaG90LCBhcGlVcmwsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQpLFxuICAgIGluZGV4SnM6IGdlbmVyYXRlSW5kZXhKcyhjb21wb25lbnQsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQsIGRlcHJlY2F0aW9uc0NvZGUsIGhhc1NjcmVlbnNob3QpLFxuICAgIHJlbmRlclBocDogZ2VuZXJhdGVSZW5kZXJQaHAoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBlZGl0b3JTY3NzOiBnZW5lcmF0ZUVkaXRvclNjc3MoY29tcG9uZW50KSxcbiAgICBzdHlsZVNjc3M6IGdlbmVyYXRlU3R5bGVTY3NzKGNvbXBvbmVudCksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZVJlYWRtZShjb21wb25lbnQpLFxuICAgIG1pZ3JhdGlvblNjaGVtYTogZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEoY29tcG9uZW50KSxcbiAgICBzY2hlbWFDaGFuZ2Vsb2c6IGdlbmVyYXRlU2NoZW1hQ2hhbmdlbG9nKGNvbXBvbmVudC5pZCwgaGlzdG9yeUVudHJ5KSxcbiAgICBzY3JlZW5zaG90VXJsXG4gIH07XG59O1xuXG4vKipcbiAqIFdyaXRlIGJsb2NrIGZpbGVzIHRvIG91dHB1dCBkaXJlY3RvcnlcbiAqL1xuY29uc3Qgd3JpdGVCbG9ja0ZpbGVzID0gYXN5bmMgKFxuICBvdXRwdXREaXI6IHN0cmluZyxcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgYmxvY2s6IEdlbmVyYXRlZEJsb2NrLFxuICBjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSB0b0Jsb2NrTmFtZShjb21wb25lbnRJZCk7XG4gIGNvbnN0IGJsb2NrRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgYmxvY2tOYW1lKTtcbiAgXG4gIC8vIENyZWF0ZSBibG9jayBkaXJlY3RvcnlcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGJsb2NrRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhibG9ja0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgXG4gIC8vIEZvcm1hdCBhbGwgY29kZSBmaWxlcyB3aXRoIFByZXR0aWVyXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suYmxvY2tKc29uLCAnanNvbicpO1xuICBjb25zdCBmb3JtYXR0ZWRJbmRleEpzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5pbmRleEpzLCAnYmFiZWwnKTtcbiAgY29uc3QgZm9ybWF0dGVkRWRpdG9yU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suZWRpdG9yU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkU3R5bGVTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5zdHlsZVNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFJlbmRlclBocCA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2sucmVuZGVyUGhwLCAncGhwJyk7XG4gIFxuICAvLyBXcml0ZSBmaWxlc1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2Jsb2NrLmpzb24nKSwgZm9ybWF0dGVkQmxvY2tKc29uKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdpbmRleC5qcycpLCBmb3JtYXR0ZWRJbmRleEpzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdyZW5kZXIucGhwJyksIGZvcm1hdHRlZFJlbmRlclBocCk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnZWRpdG9yLnNjc3MnKSwgZm9ybWF0dGVkRWRpdG9yU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnc3R5bGUuc2NzcycpLCBmb3JtYXR0ZWRTdHlsZVNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ1JFQURNRS5tZCcpLCBibG9jay5yZWFkbWUpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ21pZ3JhdGlvbi1zY2hlbWEuanNvbicpLCBibG9jay5taWdyYXRpb25TY2hlbWEpO1xuICBpZiAoYmxvY2suc2NoZW1hQ2hhbmdlbG9nKSB7XG4gICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdzY2hlbWEtY2hhbmdlbG9nLmpzb24nKSwgYmxvY2suc2NoZW1hQ2hhbmdlbG9nKTtcbiAgfVxuICBcbiAgLy8gRG93bmxvYWQgc2NyZWVuc2hvdCBpZiBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3REb3dubG9hZGVkID0gZmFsc2U7XG4gIGlmIChibG9jay5zY3JlZW5zaG90VXJsKSB7XG4gICAgY29uc3Qgc2NyZWVuc2hvdFBhdGggPSBwYXRoLmpvaW4oYmxvY2tEaXIsICdzY3JlZW5zaG90LnBuZycpO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5O3IERvd25sb2FkaW5nIHNjcmVlbnNob3QuLi5gKTtcbiAgICBzY3JlZW5zaG90RG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGJsb2NrLnNjcmVlbnNob3RVcmwsIHNjcmVlbnNob3RQYXRoKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgYmxvY2s6ICR7YmxvY2tOYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2Jsb2NrRGlyfWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBibG9jay5qc29uYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGluZGV4LmpzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHJlbmRlci5waHBgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgZWRpdG9yLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4Qgc3R5bGUuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBSRUFETUUubWRgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgbWlncmF0aW9uLXNjaGVtYS5qc29uYCk7XG4gIGlmIChzY3JlZW5zaG90RG93bmxvYWRlZCkge1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5a877iPICBzY3JlZW5zaG90LnBuZ2ApO1xuICB9XG59O1xuXG4vKipcbiAqIE1haW4gY29tcGlsYXRpb24gZnVuY3Rpb25cbiAqL1xuY29uc3QgY29tcGlsZSA9IGFzeW5jIChvcHRpb25zOiBDb21waWxlck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgZGF0YUN0eDogSGFuZG9mZkRhdGFDb250ZXh0ID0ge1xuICAgIGFwaVVybDogb3B0aW9ucy5hcGlVcmwsXG4gICAgYXV0aDogb3B0aW9ucy5hdXRoLFxuICAgIGxvY2FsQXBpUm9vdDogb3B0aW9ucy5sb2NhbEFwaVJvb3QsXG4gIH07XG5cbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7b3B0aW9ucy5hcGlVcmx9YCk7XG4gIGlmIChkYXRhQ3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7ZGF0YUN0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50OiAke29wdGlvbnMuY29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvcHRpb25zLm91dHB1dERpcn1gKTtcbiAgaWYgKG9wdGlvbnMuYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHtvcHRpb25zLmF1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBGZXRjaCBjb21wb25lbnQgZnJvbSBBUElcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgZGF0YS4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGRhdGFDdHgsIG9wdGlvbnMuY29tcG9uZW50TmFtZSk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX0gKCR7Y29tcG9uZW50LmlkfSlcXG5gKTtcbiAgICBcbiAgICAvLyBWYWxpZGF0ZSB0ZW1wbGF0ZSB2YXJpYWJsZXMgYmVmb3JlIGdlbmVyYXRpbmdcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBWYWxpZGF0aW5nIHRlbXBsYXRlIHZhcmlhYmxlcy4uLmApO1xuICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoY29tcG9uZW50KTtcbiAgICBjb25zb2xlLmxvZyhmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQodGVtcGxhdGVWYWxpZGF0aW9uKSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuICAgIFxuICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBUZW1wbGF0ZSB2YWxpZGF0aW9uIGZhaWxlZCEgRml4IHRoZSB1bmRlZmluZWQgdmFyaWFibGVzIGJlZm9yZSBjb21waWxpbmcuXFxuYCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGJsb2NrIGZpbGVzICh3aXRoIGRlcHJlY2F0aW9uIHN1cHBvcnQgZnJvbSBzY2hlbWEgaGlzdG9yeSlcbiAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIEd1dGVuYmVyZyBibG9jay4uLmApO1xuICAgIGNvbnN0IHNjaGVtYUhpc3RvcnkgPSBsb2FkTWFuaWZlc3Qob3B0aW9ucy5vdXRwdXREaXIpO1xuICAgIGNvbnN0IGJsb2NrID0gZ2VuZXJhdGVCbG9jayhjb21wb25lbnQsIG9wdGlvbnMuYXBpVXJsLCBjb25maWcsIHNjaGVtYUhpc3RvcnkpO1xuICAgIFxuICAgIC8vIFdyaXRlIGZpbGVzICh3aXRoIFByZXR0aWVyIGZvcm1hdHRpbmcpXG4gICAgYXdhaXQgd3JpdGVCbG9ja0ZpbGVzKG9wdGlvbnMub3V0cHV0RGlyLCBjb21wb25lbnQuaWQsIGJsb2NrLCBkYXRhQ3R4KTtcblxuICAgIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG9wdGlvbnMub3V0cHV0RGlyLCAnLi4nKTtcbiAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGRhdGFDdHgsIGNvbnRlbnRSb290KTtcblxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggRG9uZSEgRG9uJ3QgZm9yZ2V0IHRvIHJ1biAnbnBtIHJ1biBidWlsZCcgaW4geW91ciBibG9ja3MgcGx1Z2luLlxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDaGVjayB3aGV0aGVyIGEgY29tcG9uZW50IHNob3VsZCBiZSBpbXBvcnRlZCBiYXNlZCBvbiB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3Qgc2hvdWxkSW1wb3J0Q29tcG9uZW50ID0gKGNvbXBvbmVudElkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcpOiBib29sZWFuID0+IHtcbiAgY29uc3QgdHlwZUNvbmZpZyA9IGltcG9ydENvbmZpZ1tjb21wb25lbnRUeXBlXTtcblxuICAvLyBUeXBlIG5vdCBsaXN0ZWQgaW4gaW1wb3J0IGNvbmZpZyDigJQgZGVmYXVsdCB0byB0cnVlIChpbXBvcnQpXG4gIGlmICh0eXBlQ29uZmlnID09PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAvLyBFbnRpcmUgdHlwZSBkaXNhYmxlZFxuICBpZiAodHlwZUNvbmZpZyA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgLy8gRW50aXJlIHR5cGUgZW5hYmxlZCB3aXRoIG5vIHBlci1jb21wb25lbnQgb3ZlcnJpZGVzXG4gIGlmICh0eXBlQ29uZmlnID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcblxuICAvLyBQZXItY29tcG9uZW50IGxvb2t1cCB3aXRoaW4gdGhlIHR5cGUgb2JqZWN0XG4gIGNvbnN0IGNvbXBvbmVudENvbmZpZyA9IHR5cGVDb25maWdbY29tcG9uZW50SWRdO1xuICAvLyBOb3QgbGlzdGVkIOKAlCBpbXBvcnQgd2l0aCBkZWZhdWx0cyAodHlwZS1vYmplY3QgbWVhbnMgXCJpbXBvcnQgYWxsLCBvdmVycmlkZSBsaXN0ZWRcIilcbiAgaWYgKGNvbXBvbmVudENvbmZpZyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgLy8gRXhwbGljaXRseSBkaXNhYmxlZFxuICBpZiAoY29tcG9uZW50Q29uZmlnID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAvLyBFeHBsaWNpdGx5IGVuYWJsZWQgb3IgaGFzIGZpZWxkIG92ZXJyaWRlc1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSByYXcgcGVyLWZpZWxkIGNvbmZpZyBvYmplY3QgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgRmllbGRQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCB0eXBlQ29uZmlnID0gaW1wb3J0Q29uZmlnW2NvbXBvbmVudFR5cGVdO1xuICBpZiAoIXR5cGVDb25maWcgfHwgdHlwZW9mIHR5cGVDb25maWcgPT09ICdib29sZWFuJykgcmV0dXJuIHt9O1xuXG4gIGNvbnN0IGNvbXBvbmVudENvbmZpZyA9IHR5cGVDb25maWdbY29tcG9uZW50SWRdO1xuICBpZiAoIWNvbXBvbmVudENvbmZpZyB8fCB0eXBlb2YgY29tcG9uZW50Q29uZmlnID09PSAnYm9vbGVhbicpIHJldHVybiB7fTtcblxuICByZXR1cm4gY29tcG9uZW50Q29uZmlnIGFzIFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEZpZWxkUHJlZmVyZW5jZXM+O1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGR5bmFtaWMgYXJyYXkgY29uZmlncyBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPiA9PiB7XG4gIGNvbnN0IGFsbENvbmZpZ3MgPSBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MoY29tcG9uZW50SWQsIGNvbXBvbmVudFR5cGUsIGltcG9ydENvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+ID0ge307XG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhhbGxDb25maWdzKSkge1xuICAgIGlmIChpc0R5bmFtaWNBcnJheUNvbmZpZyhjb25maWcpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IGNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBmaWVsZCBwcmVmZXJlbmNlcyBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIEZpZWxkUHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3QgYWxsQ29uZmlncyA9IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyhjb21wb25lbnRJZCwgY29tcG9uZW50VHlwZSwgaW1wb3J0Q29uZmlnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBGaWVsZFByZWZlcmVuY2VzPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYWxsQ29uZmlncykpIHtcbiAgICBpZiAoIWlzRHluYW1pY0FycmF5Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gY29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBGZXRjaCBsaXN0IG9mIGFsbCBjb21wb25lbnRzIGZyb20gQVBJLCBmaWx0ZXJlZCBieSBpbXBvcnQgY29uZmlnIChIVFRQIG9ubHkpXG4gKi9cbmNvbnN0IGh0dHBGZXRjaENvbXBvbmVudExpc3QgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnRzLmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEFycmF5PEhhbmRvZmZDb21wb25lbnQ+O1xuICAgICAgICAgIGNvbnN0IGZpbHRlcmVkID0gY29tcG9uZW50cy5maWx0ZXIoYyA9PiBzaG91bGRJbXBvcnRDb21wb25lbnQoYy5pZCwgYy50eXBlLCBpbXBvcnRDb25maWcpKTtcbiAgICAgICAgICByZXNvbHZlKGZpbHRlcmVkLm1hcChjID0+IGMuaWQpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggZnVsbCBsaXN0IG9mIGFsbCBjb21wb25lbnRzIGZyb20gQVBJIChubyBpbXBvcnQgZmlsdGVyKS4gVXNlZCB0byByZXNvbHZlIGdyb3VwIG5hbWVzIChIVFRQIG9ubHkpLlxuICovXG5jb25zdCBodHRwRmV0Y2hBbGxDb21wb25lbnRzTGlzdCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudFtdPiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudHMuanNvbmA7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQgbGlzdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IEpTT04ucGFyc2UoZGF0YSkgYXMgQXJyYXk8SGFuZG9mZkNvbXBvbmVudD47XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnRzKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnRzIGxpc3Q6ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50czogJHtlLm1lc3NhZ2V9YCkpKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIERhdGEgYWNjZXNzIGNvbnRleHQ6IEhUVFAgSGFuZG9mZiBBUEkgb3IgbG9jYWwgYHB1YmxpYy9hcGlgIGZvbGRlciAoLS1zb3VyY2UpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEhhbmRvZmZEYXRhQ29udGV4dCB7XG4gIGFwaVVybDogc3RyaW5nO1xuICBhdXRoPzogQXV0aENyZWRlbnRpYWxzO1xuICAvKiogQWJzb2x1dGUgcGF0aCB0byBIYW5kb2ZmIGBwdWJsaWMvYXBpYCAoY29udGFpbnMgYGNvbXBvbmVudHMuanNvbmAgKyBgY29tcG9uZW50L2ApICovXG4gIGxvY2FsQXBpUm9vdD86IHN0cmluZztcbn1cblxuY29uc3QgcmVhZExvY2FsQ29tcG9uZW50c0pzb24gPSAobG9jYWxBcGlSb290OiBzdHJpbmcpOiBIYW5kb2ZmQ29tcG9uZW50W10gPT4ge1xuICBjb25zdCBwID0gcGF0aC5qb2luKGxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudHMuanNvbicpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMocCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYExvY2FsIEhhbmRvZmYgQVBJIG1pc3NpbmcgY29tcG9uZW50cyBsaXN0OiAke3B9YCk7XG4gIH1cbiAgcmV0dXJuIEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHAsICd1dGYtOCcpKSBhcyBIYW5kb2ZmQ29tcG9uZW50W107XG59O1xuXG5jb25zdCByZXNvbHZlVXJsVG9Mb2NhbFBhdGggPSAobG9jYWxBcGlSb290OiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGxldCBwYXRobmFtZSA9ICcnO1xuICB0cnkge1xuICAgIHBhdGhuYW1lID0gbmV3IFVSTCh1cmwpLnBhdGhuYW1lO1xuICB9IGNhdGNoIHtcbiAgICBjb25zdCBxID0gdXJsLmluZGV4T2YoJz8nKTtcbiAgICBwYXRobmFtZSA9IHEgPj0gMCA/IHVybC5zbGljZSgwLCBxKSA6IHVybDtcbiAgICBpZiAoIXBhdGhuYW1lLnN0YXJ0c1dpdGgoJy8nKSkgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfVxuICBsZXQgbm9ybWFsaXplZCA9IHBhdGhuYW1lLnJlcGxhY2UoL15cXC8rLywgJycpO1xuICBjb25zdCBhcGlQcmVmaXggPSAnYXBpL2NvbXBvbmVudC8nO1xuICBpZiAobm9ybWFsaXplZC5zdGFydHNXaXRoKGFwaVByZWZpeCkpIHtcbiAgICBjb25zdCByZWwgPSBub3JtYWxpemVkLnNsaWNlKGFwaVByZWZpeC5sZW5ndGgpO1xuICAgIGNvbnN0IHAgPSBwYXRoLmpvaW4obG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgcmVsKTtcbiAgICByZXR1cm4gZnMuZXhpc3RzU3luYyhwKSA/IHAgOiBudWxsO1xuICB9XG4gIGlmIChub3JtYWxpemVkLnN0YXJ0c1dpdGgoJ2ltYWdlcy8nKSkge1xuICAgIGNvbnN0IHAgPSBwYXRoLmpvaW4obG9jYWxBcGlSb290LCAnLi4nLCBub3JtYWxpemVkKTtcbiAgICByZXR1cm4gZnMuZXhpc3RzU3luYyhwKSA/IHAgOiBudWxsO1xuICB9XG4gIGNvbnN0IGJhc2UgPSBwYXRoLmJhc2VuYW1lKHBhdGhuYW1lKTtcbiAgY29uc3QgZmFsbGJhY2sgPSBwYXRoLmpvaW4obG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgYmFzZSk7XG4gIHJldHVybiBmcy5leGlzdHNTeW5jKGZhbGxiYWNrKSA/IGZhbGxiYWNrIDogbnVsbDtcbn07XG5cbmNvbnN0IGN0eEZldGNoQ29tcG9uZW50ID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBjb21wb25lbnROYW1lOiBzdHJpbmcpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnQ+ID0+IHtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zdCBmaWxlID0gcGF0aC5qb2luKGN0eC5sb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCBgJHtjb21wb25lbnROYW1lfS5qc29uYCk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYExvY2FsIGNvbXBvbmVudCBKU09OIG5vdCBmb3VuZDogJHtmaWxlfWApO1xuICAgIH1cbiAgICByZXR1cm4gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoZmlsZSwgJ3V0Zi04JykpIGFzIEhhbmRvZmZDb21wb25lbnQ7XG4gIH1cbiAgcmV0dXJuIGh0dHBGZXRjaENvbXBvbmVudChjdHguYXBpVXJsLCBjb21wb25lbnROYW1lLCBjdHguYXV0aCk7XG59O1xuXG5jb25zdCBjdHhGZXRjaENvbXBvbmVudExpc3QgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSByZWFkTG9jYWxDb21wb25lbnRzSnNvbihjdHgubG9jYWxBcGlSb290KTtcbiAgICByZXR1cm4gY29tcG9uZW50cy5maWx0ZXIoKGMpID0+IHNob3VsZEltcG9ydENvbXBvbmVudChjLmlkLCBjLnR5cGUsIGltcG9ydENvbmZpZykpLm1hcCgoYykgPT4gYy5pZCk7XG4gIH1cbiAgcmV0dXJuIGh0dHBGZXRjaENvbXBvbmVudExpc3QoY3R4LmFwaVVybCwgaW1wb3J0Q29uZmlnLCBjdHguYXV0aCk7XG59O1xuXG5jb25zdCBjdHhGZXRjaEFsbENvbXBvbmVudHNMaXN0ID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0KTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50W10+ID0+IHtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICByZXR1cm4gcmVhZExvY2FsQ29tcG9uZW50c0pzb24oY3R4LmxvY2FsQXBpUm9vdCk7XG4gIH1cbiAgcmV0dXJuIGh0dHBGZXRjaEFsbENvbXBvbmVudHNMaXN0KGN0eC5hcGlVcmwsIGN0eC5hdXRoKTtcbn07XG5cbmNvbnN0IGN0eERvd25sb2FkRmlsZSA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgdXJsOiBzdHJpbmcsIGRlc3RQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zdCBzcmNQYXRoID0gcmVzb2x2ZVVybFRvTG9jYWxQYXRoKGN0eC5sb2NhbEFwaVJvb3QsIHVybCk7XG4gICAgaWYgKCFzcmNQYXRoKSB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgTG9jYWwgYXNzZXQgbm90IGZvdW5kIGZvciBVUkw6ICR7dXJsfWApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKGRlc3RQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gaHR0cERvd25sb2FkRmlsZSh1cmwsIGRlc3RQYXRoLCBjdHguYXV0aCk7XG59O1xuXG4vKipcbiAqIENvcHkgSGFuZG9mZiBidW5kbGUgbWFpbi5qcyAvIG1haW4uY3NzIGZyb20gbG9jYWwgcHVibGljL2FwaSBpbnRvIHdwLWNvbnRlbnQvaGFuZG9mZi9hc3NldHMuXG4gKi9cbmNvbnN0IHN5bmNCdW5kbGVBc3NldHMgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIGNvbnRlbnRSb290OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgaWYgKCFjdHgubG9jYWxBcGlSb290KSByZXR1cm47XG4gIGNvbnN0IGFzc2V0c0Nzc0RpciA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ2Fzc2V0cycsICdjc3MnKTtcbiAgY29uc3QgYXNzZXRzSnNEaXIgPSBwYXRoLmpvaW4oY29udGVudFJvb3QsICdhc3NldHMnLCAnanMnKTtcbiAgZnMubWtkaXJTeW5jKGFzc2V0c0Nzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGZzLm1rZGlyU3luYyhhc3NldHNKc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGNvbnN0IG1haW5Dc3MgPSBwYXRoLmpvaW4oY3R4LmxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsICdtYWluLmNzcycpO1xuICBjb25zdCBtYWluSnMgPSBwYXRoLmpvaW4oY3R4LmxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsICdtYWluLmpzJyk7XG4gIGlmIChmcy5leGlzdHNTeW5jKG1haW5Dc3MpKSB7XG4gICAgZnMuY29weUZpbGVTeW5jKG1haW5Dc3MsIHBhdGguam9pbihhc3NldHNDc3NEaXIsICdtYWluLmNzcycpKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9jc3MvbWFpbi5jc3MgKGZyb20gLS1zb3VyY2UpYCk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIE1pc3NpbmcgJHttYWluQ3NzfWApO1xuICB9XG4gIGlmIChmcy5leGlzdHNTeW5jKG1haW5KcykpIHtcbiAgICBmcy5jb3B5RmlsZVN5bmMobWFpbkpzLCBwYXRoLmpvaW4oYXNzZXRzSnNEaXIsICdtYWluLmpzJykpO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2pzL21haW4uanMgKGZyb20gLS1zb3VyY2UpYCk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIE1pc3NpbmcgJHttYWluSnN9YCk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29tcGlsZSBhbGwgY29tcG9uZW50c1xuICovXG4vKipcbiAqIEJ1aWxkIFZhcmlhbnRJbmZvIGZvciBhIGNvbXBvbmVudCAocmVzb2x2ZXMgZHluYW1pYyBhcnJheXMsIElubmVyQmxvY2tzIGZpZWxkLCBldGMuKVxuICovXG5jb25zdCBidWlsZFZhcmlhbnRJbmZvID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnKTogVmFyaWFudEluZm8gPT4ge1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCksXG4gIH07XG5cbiAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudER5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCdhcnJheVR5cGUnIGluIGR5bkNvbmZpZykgY29udGludWU7IC8vIFNraXAgc3BlY2lhbGlzZWQgYXJyYXkgdHlwZXNcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICBpZiAocHJvcD8udHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24/LnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgY29uc3QgcGFnaW5hdGlvbkZpZWxkUmVnZXggPSBuZXcgUmVnRXhwKFxuICAgICAgICBgXFxcXHtcXFxce1xcXFxzKiNmaWVsZFxcXFxzK1tcIiddJHtmaWVsZE5hbWV9XFxcXC5wYWdpbmF0aW9uW1wiJ11gXG4gICAgICApO1xuICAgICAgaWYgKHBhZ2luYXRpb25GaWVsZFJlZ2V4LnRlc3QoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgICAgIChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uID0geyBwcm9wZXJ0eU5hbWU6ICdwYWdpbmF0aW9uJyB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZpZWxkUHJlZnMgPSBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpO1xuICBjb25zdCByaWNodGV4dEZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbXBvbmVudCxcbiAgICBmaWVsZE1hcDoge30sXG4gICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICBkeW5hbWljQXJyYXlDb25maWdzOiBjb21wb25lbnREeW5hbWljQXJyYXlzLFxuICB9O1xufTtcblxuLyoqXG4gKiBDb21waWxlIGEgc2luZ2xlIG1lcmdlZCBncm91cCAoZS5nLiBIZXJvIHdpdGggbXVsdGlwbGUgdmFyaWFudHMpLiBVc2VkIGJ5IHNpbmdsZS1uYW1lIENMSSB3aGVuIG5hbWUgbWF0Y2hlcyBhIGdyb3VwLlxuICovXG5jb25zdCBjb21waWxlR3JvdXAgPSBhc3luYyAoXG4gIGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LFxuICBvdXRwdXREaXI6IHN0cmluZyxcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdLFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SAIEdlbmVyYXRpbmcgbWVyZ2VkIGdyb3VwIGJsb2NrOiAke2dyb3VwU2x1Z30gKCR7Z3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpYCk7XG4gIGNvbnN0IHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSA9IGdyb3VwQ29tcG9uZW50cy5tYXAoKGMpID0+IGJ1aWxkVmFyaWFudEluZm8oYywgY29uZmlnKSk7XG5cbiAgLy8gQnVpbGQgdmFyaWFudCBzY3JlZW5zaG90IG1hcCAod2hpY2ggdmFyaWFudHMgaGF2ZSBpbWFnZXMgdG8gZG93bmxvYWQpXG4gIGNvbnN0IHZhcmlhbnRTY3JlZW5zaG90czogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcbiAgZm9yIChjb25zdCBjb21wIG9mIGdyb3VwQ29tcG9uZW50cykge1xuICAgIHZhcmlhbnRTY3JlZW5zaG90c1tjb21wLmlkXSA9ICEhY29tcC5pbWFnZTtcbiAgfVxuXG4gIGNvbnN0IG1lcmdlZEJsb2NrID0gZ2VuZXJhdGVNZXJnZWRCbG9jayhncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50cywgdmFyaWFudEluZm9zLCBjdHguYXBpVXJsLCB2YXJpYW50U2NyZWVuc2hvdHMpO1xuICBjb25zdCBncm91cEJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcbiAgY29uc3QgZ3JvdXBEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBncm91cEJsb2NrTmFtZSk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhncm91cERpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoZ3JvdXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgLy8gRG93bmxvYWQgdmFyaWFudCBzY3JlZW5zaG90c1xuICBpZiAobWVyZ2VkQmxvY2sudmFyaWFudFNjcmVlbnNob3RVcmxzKSB7XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCB1cmxdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhbnRTY3JlZW5zaG90VXJscykpIHtcbiAgICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoID0gcGF0aC5qb2luKGdyb3VwRGlyLCBgc2NyZWVuc2hvdC0ke3ZhcmlhbnRJZH0ucG5nYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAg8J+TtyBEb3dubG9hZGluZyBzY3JlZW5zaG90IGZvciB2YXJpYW50ICR7dmFyaWFudElkfS4uLmApO1xuICAgICAgY29uc3Qgb2sgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCB1cmwsIHNjcmVlbnNob3RQYXRoKTtcbiAgICAgIGlmICghb2spIHtcbiAgICAgICAgdmFyaWFudFNjcmVlbnNob3RzW3ZhcmlhbnRJZF0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBmb3JtYXR0ZWRCbG9ja0pzb24gPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmJsb2NrSnNvbiwgJ2pzb24nKTtcbiAgY29uc3QgZm9ybWF0dGVkSW5kZXhKcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suaW5kZXhKcywgJ2JhYmVsJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFJlbmRlclBocCA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2sucmVuZGVyUGhwLCAncGhwJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEVkaXRvclNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmVkaXRvclNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFN0eWxlU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suc3R5bGVTY3NzLCAnc2NzcycpO1xuXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnYmxvY2suanNvbicpLCBmb3JtYXR0ZWRCbG9ja0pzb24pO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2luZGV4LmpzJyksIGZvcm1hdHRlZEluZGV4SnMpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ3JlbmRlci5waHAnKSwgZm9ybWF0dGVkUmVuZGVyUGhwKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdlZGl0b3Iuc2NzcycpLCBmb3JtYXR0ZWRFZGl0b3JTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdzdHlsZS5zY3NzJyksIGZvcm1hdHRlZFN0eWxlU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnUkVBRE1FLm1kJyksIG1lcmdlZEJsb2NrLnJlYWRtZSk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnbWlncmF0aW9uLXNjaGVtYS5qc29uJyksIG1lcmdlZEJsb2NrLm1pZ3JhdGlvblNjaGVtYSk7XG5cbiAgaWYgKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzKSB7XG4gICAgY29uc3QgdmFyaWF0aW9uc0RpciA9IHBhdGguam9pbihncm91cERpciwgJ3ZhcmlhdGlvbnMnKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmModmFyaWF0aW9uc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyh2YXJpYXRpb25zRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcy5qcykpIHtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ2JhYmVsJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbih2YXJpYXRpb25zRGlyLCBgJHt2YXJpYW50SWR9LmpzYCksIGZvcm1hdHRlZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMucGhwKSkge1xuICAgICAgY29uc3QgZm9ybWF0dGVkID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAncGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbih2YXJpYXRpb25zRGlyLCBgJHt2YXJpYW50SWR9LnBocGApLCBmb3JtYXR0ZWQpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkIG1lcmdlZCBibG9jazogJHtncm91cEJsb2NrTmFtZX0gKCR7Z3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OBICR7Z3JvdXBEaXJ9YCk7XG5cbiAgY29uc3QgcGx1Z2luRGlyID0gcGF0aC5kaXJuYW1lKG91dHB1dERpcik7XG4gIGNvbnN0IGNhdGVnb3JpZXNQaHAgPSBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAoZ3JvdXBDb21wb25lbnRzKTtcbiAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICBjb25zdCBpbmNsdWRlc0RpciA9IHBhdGguam9pbihwbHVnaW5EaXIsICdpbmNsdWRlcycpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGluY2x1ZGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgZnMud3JpdGVGaWxlU3luYyhjYXRlZ29yaWVzUGF0aCwgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG59O1xuXG5jb25zdCBjb21waWxlQWxsID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBvdXRwdXREaXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UpyBHdXRlbmJlcmcgQ29tcGlsZXIgLSBCYXRjaCBNb2RlYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7Y3R4LmFwaVVybH1gKTtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2N0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke291dHB1dERpcn1gKTtcbiAgaWYgKGN0eC5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2N0eC5hdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudExpc3QoY3R4LCBjb25maWcuaW1wb3J0KTtcblxuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHNcXG5gKTtcbiAgICBcbiAgICBsZXQgc3VjY2VzcyA9IDA7XG4gICAgbGV0IGZhaWxlZCA9IDA7XG4gICAgY29uc3QgY29tcGlsZWRDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICBjb25zdCBzY2hlbWFIaXN0b3J5ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgLy8gRmV0Y2ggYWxsIGNvbXBvbmVudHMgZmlyc3Qgc28gd2UgY2FuIHBhcnRpdGlvbiBieSBncm91cFxuICAgIGNvbnN0IGFsbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIGNvbXBvbmVudElkKTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQodGVtcGxhdGVWYWxpZGF0aW9uKSk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4pqg77iPICBTa2lwcGluZyAke2NvbXBvbmVudElkfSBkdWUgdG8gdGVtcGxhdGUgdmFyaWFibGUgZXJyb3JzYCk7XG4gICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhbGxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUGFydGl0aW9uIGNvbXBvbmVudHM6IG1lcmdlZCBncm91cHMgdnMgaW5kaXZpZHVhbFxuICAgIC8vIEJ1aWxkIGNhc2UtaW5zZW5zaXRpdmUgbG9va3VwOiBjb25maWcgbWF5IHNheSBcIkhlcm9cIiBidXQgQVBJIG9mdGVuIHJldHVybnMgXCJoZXJvXCJcbiAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICB9XG4gICAgY29uc3QgZ3JvdXBCdWNrZXRzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmQ29tcG9uZW50W10+ID0ge307XG4gICAgY29uc3QgaW5kaXZpZHVhbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgYWxsQ29tcG9uZW50cykge1xuICAgICAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA7XG4gICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBjb25maWdLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgaWYgKGNvbmZpZ0tleSkge1xuICAgICAgICBpZiAoIWdyb3VwQnVja2V0c1tjb25maWdLZXldKSBncm91cEJ1Y2tldHNbY29uZmlnS2V5XSA9IFtdO1xuICAgICAgICBncm91cEJ1Y2tldHNbY29uZmlnS2V5XS5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBpbmRpdmlkdWFsIGNvbXBvbmVudHMgKGV4aXN0aW5nIGJlaGF2aW9yKVxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGluZGl2aWR1YWxDb21wb25lbnRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBjdHguYXBpVXJsLCBjb25maWcsIHNjaGVtYUhpc3RvcnkpO1xuICAgICAgICBhd2FpdCB3cml0ZUJsb2NrRmlsZXMob3V0cHV0RGlyLCBjb21wb25lbnQuaWQsIGJsb2NrLCBjdHgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBzdWNjZXNzKys7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgJHtjb21wb25lbnQuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgbWVyZ2VkIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzXSBvZiBPYmplY3QuZW50cmllcyhncm91cEJ1Y2tldHMpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoY3R4LCBvdXRwdXREaXIsIGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goLi4uZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgc3VjY2VzcyArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlIG1lcmdlZCBncm91cCAke2dyb3VwU2x1Z306ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVjb25jaWxlIGxvY2FsIGJsb2NrczogbWFyayBkaXJzIG5vdCBpbiB0aGlzIGNvbXBpbGUgb3V0cHV0IGFzIGRlcHJlY2F0ZWRcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBSZWNvbmNpbGluZyBsb2NhbCBibG9ja3Mgd2l0aCBjb21waWxlIG91dHB1dC4uLmApO1xuICAgIGNvbnN0IGFjdGl2ZVNsdWdzID0gZ2V0QWN0aXZlQmxvY2tTbHVncyhpbmRpdmlkdWFsQ29tcG9uZW50cywgZ3JvdXBCdWNrZXRzKTtcbiAgICBjb25zdCByZWNvbmNpbGVSZXN1bHQgPSByZWNvbmNpbGVMb2NhbEJsb2NrcyhvdXRwdXREaXIsIGFjdGl2ZVNsdWdzKTtcbiAgICBjb25zdCBuZXdseURlcHJlY2F0ZWQgPSByZWNvbmNpbGVSZXN1bHQubWFya2VkO1xuICAgIGlmIChuZXdseURlcHJlY2F0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKaoO+4jyAgTWFya2VkICR7bmV3bHlEZXByZWNhdGVkLmxlbmd0aH0gYmxvY2socykgYXMgZGVwcmVjYXRlZDogJHtuZXdseURlcHJlY2F0ZWQuam9pbignLCAnKX1gKTtcbiAgICB9IGVsc2UgaWYgKHJlY29uY2lsZVJlc3VsdC5hbHJlYWR5RGVwcmVjYXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4oS577iPICAke3JlY29uY2lsZVJlc3VsdC5hbHJlYWR5RGVwcmVjYXRlZC5sZW5ndGh9IGJsb2NrKHMpIHJlbWFpbiBkZXByZWNhdGVkICh1bmNoYW5nZWQpYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgQWxsIGxvY2FsIGJsb2NrcyBtYXRjaCBjdXJyZW50IGNvbXBpbGUgb3V0cHV0YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGNhdGVnb3JpZXMgUEhQIGZpbGUgYmFzZWQgb24gYWxsIGNvbXBpbGVkIGNvbXBvbmVudHNcbiAgICBpZiAoY29tcGlsZWRDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIEdlbmVyYXRpbmcgYmxvY2sgY2F0ZWdvcmllcy4uLmApO1xuICAgICAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChjb21waWxlZENvbXBvbmVudHMpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgICAgIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvcHkgc2hhcmVkIGNvbXBvbmVudHMgJiB1dGlscyB0byB0aGUgb3V0cHV0IGRpcmVjdG9yeSBzbyBibG9ja3MgY2FuXG4gICAgLy8gcmVzb2x2ZSB0aGVpciAuLi8uLi9zaGFyZWQvLi4uIGltcG9ydHMgcmVnYXJkbGVzcyBvZiB3aGVyZSB0aGV5IGxpdmUuXG4gICAgY29uc3QgcGx1Z2luUm9vdCA9IHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUocHJvY2Vzcy5hcmd2WzFdKSwgJy4uJywgJy4uJyk7XG4gICAgY29uc3QgcGx1Z2luU2hhcmVkRGlyID0gcGF0aC5qb2luKHBsdWdpblJvb3QsICdzaGFyZWQnKTtcbiAgICBjb25zdCBjb250ZW50Um9vdCA9IHBhdGgucmVzb2x2ZShvdXRwdXREaXIsICcuLicpO1xuICAgIGNvbnN0IHRhcmdldFNoYXJlZERpciA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ3NoYXJlZCcpO1xuXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMocGx1Z2luU2hhcmVkRGlyKSAmJlxuICAgICAgICBwYXRoLnJlc29sdmUocGx1Z2luU2hhcmVkRGlyKSAhPT0gcGF0aC5yZXNvbHZlKHRhcmdldFNoYXJlZERpcikpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvcHlpbmcgc2hhcmVkIGNvbXBvbmVudHMuLi5gKTtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUocGx1Z2luU2hhcmVkRGlyLCB0YXJnZXRTaGFyZWREaXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBTaGFyZWQgY29tcG9uZW50cyBjb3BpZWQgdG8gJHt0YXJnZXRTaGFyZWREaXJ9YCk7XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcGFja2FnZS5qc29uIGFuZCBpbnN0YWxsIGJ1aWxkIGRlcGVuZGVuY2llcyBzbyBibG9ja3MgYW5kXG4gICAgLy8gc2hhcmVkIGNvbXBvbmVudHMgY2FuIHJlc29sdmUgQHdvcmRwcmVzcy8qIGFuZCBAMTB1cC8qIGltcG9ydHMuXG4gICAgZW5zdXJlQ29udGVudERlcGVuZGVuY2llcyhjb250ZW50Um9vdCk7XG4gICAgXG4gICAgLy8gRG93bmxvYWQgb3IgY29weSBtYWluLmNzcyBhbmQgbWFpbi5qcyBkZXNpZ24gc3lzdGVtIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OhIFN5bmNpbmcgZGVzaWduIHN5c3RlbSBhc3NldHMuLi5gKTtcbiAgICBjb25zdCBhc3NldHNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnLi4nLCAnYXNzZXRzJyk7XG4gICAgY29uc3QgYXNzZXRzQ3NzRGlyID0gcGF0aC5qb2luKGFzc2V0c0RpciwgJ2NzcycpO1xuICAgIGNvbnN0IGFzc2V0c0pzRGlyID0gcGF0aC5qb2luKGFzc2V0c0RpciwgJ2pzJyk7XG5cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXNzZXRzQ3NzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGFzc2V0c0Nzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhhc3NldHNKc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhhc3NldHNKc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoY3R4LCBwYXRoLnJlc29sdmUob3V0cHV0RGlyLCAnLi4nKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGNzc1VybCA9IGAke2N0eC5hcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihhc3NldHNDc3NEaXIsICdtYWluLmNzcycpO1xuICAgICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGNzc1VybCwgY3NzUGF0aCk7XG4gICAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9jc3MvbWFpbi5jc3NgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QganNVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGFzc2V0c0pzRGlyLCAnbWFpbi5qcycpO1xuICAgICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwganNVcmwsIGpzUGF0aCk7XG4gICAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2pzL21haW4uanNgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBDb21waWxhdGlvbiBjb21wbGV0ZSFgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFN1Y2Nlc3M6ICR7c3VjY2Vzc31gKTtcbiAgICBpZiAoZmFpbGVkID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKdjCBGYWlsZWQ6ICR7ZmFpbGVkfWApO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg8J+UgCBNZXJnZWQgZ3JvdXBzOiAke09iamVjdC5rZXlzKGdyb3VwQnVja2V0cykubGVuZ3RofWApO1xuICAgIH1cbiAgICBjb25zb2xlLmxvZyhgXFxuRG9uJ3QgZm9yZ2V0IHRvIHJ1biAnbnBtIHJ1biBidWlsZCcgaW4geW91ciBibG9ja3MgcGx1Z2luLlxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21waWxlIHRoZW1lIHRlbXBsYXRlcyAoaGVhZGVyLCBmb290ZXIpXG4gKi9cbmNvbnN0IGNvbXBpbGVUaGVtZSA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgb3V0cHV0RGlyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCfjqggVGhlbWUgVGVtcGxhdGUgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3V0cHV0RGlyfWApO1xuICBpZiAoY3R4LmF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7Y3R4LmF1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBDb21waWxlIGhlYWRlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGhlYWRlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaGVhZGVyID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCAnaGVhZGVyJyk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7aGVhZGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGhlYWRlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGhlYWRlclBocCA9IGdlbmVyYXRlSGVhZGVyUGhwKGhlYWRlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRIZWFkZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGhlYWRlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBoZWFkZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2hlYWRlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoaGVhZGVyUGF0aCwgZm9ybWF0dGVkSGVhZGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2hlYWRlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBIZWFkZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsZSBmb290ZXJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBmb290ZXIgY29tcG9uZW50Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZvb3RlciA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgJ2Zvb3RlcicpO1xuICAgICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2Zvb3Rlci50aXRsZX1cXG5gKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBmb290ZXIucGhwLi4uYCk7XG4gICAgICBjb25zdCBmb290ZXJQaHAgPSBnZW5lcmF0ZUZvb3RlclBocChmb290ZXIpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkRm9vdGVyID0gYXdhaXQgZm9ybWF0Q29kZShmb290ZXJQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgZm9vdGVyUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICdmb290ZXIucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGZvb3RlclBhdGgsIGZvcm1hdHRlZEZvb3Rlcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtmb290ZXJQYXRofVxcbmApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRm9vdGVyIGNvbXBvbmVudCBub3QgZm91bmQgb3IgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEFsc28gdHJ5IGhlYWRlci1jb21wYWN0IGFuZCBmb290ZXItY29tcGFjdCBpZiB0aGV5IGV4aXN0XG4gICAgLy8gVGhlc2UgZ28gaW50byB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyBzdWJmb2xkZXJcbiAgICBjb25zdCBoYW5kb2ZmVGVtcGxhdGVzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ3RlbXBsYXRlLXBhcnRzJywgJ2hhbmRvZmYnKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaGFuZG9mZlRlbXBsYXRlc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZ2VuZXJhdGVkVGVtcGxhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgdmFyaWFudCBvZiBbJ2hlYWRlci1jb21wYWN0JywgJ2hlYWRlci1sYW5kZXInLCAnZm9vdGVyLWNvbXBhY3QnXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCB2YXJpYW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk6EgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfWApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgdGVtcGxhdGVUeXBlID0gdmFyaWFudC5yZXBsYWNlKC8tL2csICdfJyk7XG4gICAgICAgIGNvbnN0IGlzSGVhZGVyID0gdmFyaWFudC5zdGFydHNXaXRoKCdoZWFkZXInKTtcbiAgICAgICAgY29uc3QgcGhwID0gaXNIZWFkZXIgXG4gICAgICAgICAgPyBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocChjb21wb25lbnQsIHRlbXBsYXRlVHlwZSlcbiAgICAgICAgICA6IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKTtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVkUGhwID0gYXdhaXQgZm9ybWF0Q29kZShwaHAsICdwaHAnKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIGAke3ZhcmlhbnR9LnBocGApO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBmb3JtYXR0ZWRQaHApO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtmaWxlUGF0aH1cXG5gKTtcbiAgICAgICAgZ2VuZXJhdGVkVGVtcGxhdGVzLnB1c2goYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gVmFyaWFudCBkb2Vzbid0IGV4aXN0LCBza2lwIHNpbGVudGx5XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIFJFQURNRSBmb3IgdGhlIGhhbmRvZmYgdGVtcGxhdGVzIGZvbGRlclxuICAgIGlmIChnZW5lcmF0ZWRUZW1wbGF0ZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgcmVhZG1lQ29udGVudCA9IGAjIEhhbmRvZmYgVGVtcGxhdGUgUGFydHNcblxuPiDimqDvuI8gKipETyBOT1QgRURJVCBUSEVTRSBGSUxFUyBESVJFQ1RMWSoqXG4+XG4+IFRoZXNlIGZpbGVzIGFyZSBhdXRvbWF0aWNhbGx5IGdlbmVyYXRlZCBieSB0aGUgSGFuZG9mZiBXb3JkUHJlc3MgY29tcGlsZXIuXG4+IEFueSBjaGFuZ2VzIHdpbGwgYmUgb3ZlcndyaXR0ZW4gb24gdGhlIG5leHQgc3luYy5cblxuIyMgU291cmNlXG5cblRoZXNlIHRlbXBsYXRlcyB3ZXJlIHRyYW5zcGlsZWQgZnJvbSB0aGUgSGFuZG9mZiBkZXNpZ24gc3lzdGVtLlxuXG4tICoqQVBJIFVSTDoqKiAke2N0eC5hcGlVcmx9XG4tICoqR2VuZXJhdGVkOioqICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfVxuXG4jIyBGaWxlc1xuXG4ke2dlbmVyYXRlZFRlbXBsYXRlcy5tYXAoZiA9PiBgLSBcXGAke2Z9XFxgYCkuam9pbignXFxuJyl9XG5cbiMjIFVzYWdlXG5cbkluY2x1ZGUgdGhlc2UgdGVtcGxhdGUgcGFydHMgaW4geW91ciB0aGVtZSB1c2luZzpcblxuXFxgXFxgXFxgcGhwXG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9oZWFkZXItY29tcGFjdCcpOyA/PlxuPD9waHAgZ2V0X3RlbXBsYXRlX3BhcnQoJ3RlbXBsYXRlLXBhcnRzL2hhbmRvZmYvZm9vdGVyLWNvbXBhY3QnKTsgPz5cblxcYFxcYFxcYFxuXG4jIyBSZWdlbmVyYXRpbmdcblxuVG8gcmVnZW5lcmF0ZSB0aGVzZSBmaWxlcywgcnVuOlxuXG5cXGBcXGBcXGBiYXNoXG5ucHggaGFuZG9mZi13cCAtLXRoZW1lXG5cXGBcXGBcXGBcblxuT3Igd2l0aCBhIHNwZWNpZmljIEFQSSBVUkw6XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWUgLS1hcGktdXJsICR7Y3R4LmFwaVVybH1cblxcYFxcYFxcYFxuYDtcbiAgICAgIGNvbnN0IHJlYWRtZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgJ1JFQURNRS5tZCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhyZWFkbWVQYXRoLCByZWFkbWVDb250ZW50KTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OdIEdlbmVyYXRlZDogJHtyZWFkbWVQYXRofVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBEb3dubG9hZCBvciBjb3B5IG1haW4uY3NzIGFuZCBtYWluLmpzIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIHRoZW1lIGFzc2V0cy4uLmApO1xuICAgIFxuICAgIC8vIEVuc3VyZSBhc3NldHMgZGlyZWN0b3JpZXMgZXhpc3RcbiAgICBjb25zdCBjc3NEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2NzcycpO1xuICAgIGNvbnN0IGpzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Fzc2V0cycsICdqcycpO1xuICAgIFxuICAgIGlmICghZnMuZXhpc3RzU3luYyhjc3NEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoY3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGpzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGpzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoY3R4LCBvdXRwdXREaXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEb3dubG9hZCBtYWluLmNzc1xuICAgICAgY29uc3QgY3NzVXJsID0gYCR7Y3R4LmFwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmNzc2A7XG4gICAgICBjb25zdCBjc3NQYXRoID0gcGF0aC5qb2luKGNzc0RpciwgJ21haW4uY3NzJyk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRG93bmxvYWRpbmcgbWFpbi5jc3MuLi5gKTtcbiAgICAgIGNvbnN0IGNzc0Rvd25sb2FkZWQgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCBjc3NVcmwsIGNzc1BhdGgpO1xuICAgICAgaWYgKGNzc0Rvd25sb2FkZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkOiAke2Nzc1BhdGh9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uY3NzIGZyb20gJHtjc3NVcmx9YCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIERvd25sb2FkIG1haW4uanNcbiAgICAgIGNvbnN0IGpzVXJsID0gYCR7Y3R4LmFwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmpzYDtcbiAgICAgIGNvbnN0IGpzUGF0aCA9IHBhdGguam9pbihqc0RpciwgJ21haW4uanMnKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmpzLi4uYCk7XG4gICAgICBjb25zdCBqc0Rvd25sb2FkZWQgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCBqc1VybCwganNQYXRoKTtcbiAgICAgIGlmIChqc0Rvd25sb2FkZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkOiAke2pzUGF0aH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggVGhlbWUgdGVtcGxhdGVzIGdlbmVyYXRlZCFcXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYSBzaW5nbGUgY29tcG9uZW50IGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzXG4gKi9cbmNvbnN0IHZhbGlkYXRlID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nKTogUHJvbWlzZTxWYWxpZGF0aW9uUmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SNIFZhbGlkYXRpbmcgQ29tcG9uZW50OiAke2NvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7Y3R4LmFwaVVybH1gKTtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2N0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgLy8gRmV0Y2ggY29tcG9uZW50XG4gIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgY29tcG9uZW50TmFtZSk7XG4gIFxuICAvLyBMb2FkIG1hbmlmZXN0XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIFxuICAvLyBWYWxpZGF0ZVxuICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgXG4gIC8vIE91dHB1dCByZXN1bHRcbiAgY29uc29sZS5sb2coZm9ybWF0VmFsaWRhdGlvblJlc3VsdChyZXN1bHQpKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzXG4gKi9cbmNvbnN0IHZhbGlkYXRlQWxsID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBvdXRwdXREaXI6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBBbGwgQ29tcG9uZW50c2ApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIE1hbmlmZXN0OiAke291dHB1dERpcn1cXG5gKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gRmV0Y2ggY29tcG9uZW50IGxpc3RcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50TGlzdChjdHgsIGltcG9ydENvbmZpZyk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIC8vIExvYWQgbWFuaWZlc3RcbiAgICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICAgIFxuICAgIGxldCB2YWxpZCA9IDA7XG4gICAgbGV0IGludmFsaWQgPSAwO1xuICAgIGxldCBuZXdDb21wb25lbnRzID0gMDtcbiAgICBjb25zdCBicmVha2luZ0NoYW5nZXM6IFZhbGlkYXRpb25SZXN1bHRbXSA9IFtdO1xuICAgIFxuICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIGNvbXBvbmVudElkKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVDb21wb25lbnQoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAocmVzdWx0LmlzTmV3KSB7XG4gICAgICAgICAgbmV3Q29tcG9uZW50cysrO1xuICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgdmFsaWQrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbnZhbGlkKys7XG4gICAgICAgICAgYnJlYWtpbmdDaGFuZ2VzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byB2YWxpZGF0ZSAke2NvbXBvbmVudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBTdW1tYXJ5XG4gICAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBWYWxpZGF0aW9uIFN1bW1hcnlgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIFZhbGlkOiAke3ZhbGlkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinYwgQnJlYWtpbmcgQ2hhbmdlczogJHtpbnZhbGlkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinKggTmV3IENvbXBvbmVudHM6ICR7bmV3Q29tcG9uZW50c31gKTtcbiAgICBcbiAgICBpZiAoYnJlYWtpbmdDaGFuZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIFdBUk5JTkc6ICR7YnJlYWtpbmdDaGFuZ2VzLmxlbmd0aH0gY29tcG9uZW50KHMpIGhhdmUgYnJlYWtpbmcgY2hhbmdlcyFgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBUaGVzZSBjaGFuZ2VzIG1heSBicmVhayBleGlzdGluZyBXb3JkUHJlc3MgY29udGVudC5cXG5gKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnRzIHdpdGggYnJlYWtpbmcgY2hhbmdlczpgKTtcbiAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGJyZWFraW5nQ2hhbmdlcykge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgLSAke3Jlc3VsdC5jb21wb25lbnRUaXRsZX0gKCR7cmVzdWx0LmNvbXBvbmVudElkfSlgKTtcbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGBcXG4gICBUbyBwcm9jZWVkIGFueXdheSwgY29tcGlsZSB3aXRoIC0tZm9yY2UgZmxhZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKcqCBBbGwgY29tcG9uZW50cyB2YWxpZGF0ZWQgc3VjY2Vzc2Z1bGx5IVxcbmApO1xuICAgIH1cbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogVXBkYXRlIG1hbmlmZXN0IGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGlsYXRpb25cbiAqL1xuY29uc3QgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQgPSAob3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCk6IHZvaWQgPT4ge1xuICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICBjb25zdCB1cGRhdGVkTWFuaWZlc3QgPSB1cGRhdGVNYW5pZmVzdChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgc2F2ZU1hbmlmZXN0KG91dHB1dERpciwgdXBkYXRlZE1hbmlmZXN0KTtcbn07XG5cbi8qKlxuICogV2F0Y2ggbG9jYWwgSGFuZG9mZiBgcHVibGljL2FwaWAgb3V0cHV0IGFuZCByZWNvbXBpbGUgYmxvY2tzIC8gc3luYyBidW5kbGVzLlxuICovXG5jb25zdCBydW5XYXRjaE1vZGUgPSBhc3luYyAoXG4gIGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LFxuICBvdXRwdXREaXI6IHN0cmluZyxcbiAgb25seUNvbXBvbmVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gIHJ1bk9wdHM6IHsgZm9yY2U/OiBib29sZWFuIH0sXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3Qgcm9vdCA9IGN0eC5sb2NhbEFwaVJvb3QhO1xuICBjb25zdCBjb250ZW50Um9vdCA9IHBhdGgucmVzb2x2ZShvdXRwdXREaXIsICcuLicpO1xuICBjb25zb2xlLmxvZyhgXFxu8J+RgCBXYXRjaCBtb2RlYCk7XG4gIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7cm9vdH1gKTtcbiAgY29uc29sZS5sb2coYCAgIEJsb2NrczogJHtvdXRwdXREaXJ9XFxuYCk7XG5cbiAgbGV0IGRlYlRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcbiAgY29uc3Qgc2NoZWR1bGUgPSAoZm46ICgpID0+IFByb21pc2U8dm9pZD4pID0+IHtcbiAgICBpZiAoZGViVGltZXIpIGNsZWFyVGltZW91dChkZWJUaW1lcik7XG4gICAgZGViVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHZvaWQgZm4oKS5jYXRjaCgoZXJyKSA9PiBjb25zb2xlLmVycm9yKCdbd2F0Y2hdJywgZXJyKSk7XG4gICAgfSwgMTUwKTtcbiAgfTtcblxuICBjb25zdCBjb21waWxlT25lID0gYXN5bmMgKHN0ZW06IHN0cmluZykgPT4ge1xuICAgIGlmIChzdGVtID09PSAnY29tcG9uZW50cycpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZyhgXFxuW3dhdGNoXSBSZWNvbXBpbGluZyAke3N0ZW19Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgc3RlbSk7XG4gICAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgICBpZiAobW9kZSA9PT0gJ21lcmdlZCcpIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIGtleSk7XG4gICAgICB9XG4gICAgICBpZiAoY29tcG9uZW50Lmdyb3VwKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChjb21wb25lbnQuZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgIGlmIChncm91cEtleSkge1xuICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBjdHhGZXRjaEFsbENvbXBvbmVudHNMaXN0KGN0eCk7XG4gICAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IGdyb3VwS2V5LnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBmdWxsR3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgZ3JvdXBNYXRjaGVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBjb25zdCBmdWxsID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjLmlkKTtcbiAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhmdWxsKTtcbiAgICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBTa2lwcGluZyAke2MuaWR9ICh0ZW1wbGF0ZSB2YWxpZGF0aW9uIGZhaWxlZClgKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBmdWxsR3JvdXBDb21wb25lbnRzLnB1c2goZnVsbCk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgLy8gc2tpcFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoY3R4LCBvdXRwdXREaXIsIGdyb3VwS2V5LCBmdWxsR3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoY3R4LCBjb250ZW50Um9vdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoIXJ1bk9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoY3R4LCBvdXRwdXREaXIsIHN0ZW0pO1xuICAgICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBbd2F0Y2hdIFNraXBwaW5nICR7c3RlbX06IGJyZWFraW5nIGNoYW5nZXMgKHJlLXJ1biB3aXRoIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkpYCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBjb21waWxlKHtcbiAgICAgICAgYXBpVXJsOiBjdHguYXBpVXJsLFxuICAgICAgICBvdXRwdXREaXIsXG4gICAgICAgIGNvbXBvbmVudE5hbWU6IHN0ZW0sXG4gICAgICAgIGF1dGg6IGN0eC5hdXRoLFxuICAgICAgICBsb2NhbEFwaVJvb3Q6IHJvb3QsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGNvbXAgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIHN0ZW0pO1xuICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0RGlyLCBjb21wKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBbd2F0Y2hdIEZhaWxlZCAke3N0ZW19OmAsIGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IGUpO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBwYXR0ZXJuczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKG9ubHlDb21wb25lbnRJZCkge1xuICAgIHBhdHRlcm5zLnB1c2gocGF0aC5qb2luKHJvb3QsICdjb21wb25lbnQnLCBgJHtvbmx5Q29tcG9uZW50SWR9Lmpzb25gKSk7XG4gIH0gZWxzZSB7XG4gICAgcGF0dGVybnMucHVzaChwYXRoLmpvaW4ocm9vdCwgJ2NvbXBvbmVudCcsICcqLmpzb24nKSk7XG4gIH1cbiAgcGF0dGVybnMucHVzaChwYXRoLmpvaW4ocm9vdCwgJ2NvbXBvbmVudCcsICdtYWluLmpzJyksIHBhdGguam9pbihyb290LCAnY29tcG9uZW50JywgJ21haW4uY3NzJykpO1xuXG4gIGNvbnN0IHdhdGNoZXIgPSBjaG9raWRhci53YXRjaChwYXR0ZXJucywge1xuICAgIGF3YWl0V3JpdGVGaW5pc2g6IHsgc3RhYmlsaXR5VGhyZXNob2xkOiAxNTAsIHBvbGxJbnRlcnZhbDogNTAgfSxcbiAgICBpZ25vcmVJbml0aWFsOiB0cnVlLFxuICB9KTtcblxuICB3YXRjaGVyLm9uKCdhbGwnLCAoZXZlbnQsIGZpbGVQYXRoKSA9PiB7XG4gICAgaWYgKCFmaWxlUGF0aCkgcmV0dXJuO1xuICAgIGlmICghWydhZGQnLCAnY2hhbmdlJywgJ3VubGluayddLmluY2x1ZGVzKGV2ZW50KSkgcmV0dXJuO1xuICAgIGNvbnN0IGJhc2UgPSBwYXRoLmJhc2VuYW1lKGZpbGVQYXRoKTtcbiAgICBpZiAoYmFzZSA9PT0gJ21haW4uanMnIHx8IGJhc2UgPT09ICdtYWluLmNzcycpIHtcbiAgICAgIHNjaGVkdWxlKGFzeW5jICgpID0+IHtcbiAgICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIGNvbnRlbnRSb290KTtcbiAgICAgICAgY29uc29sZS5sb2coJ1t3YXRjaF0gQnVuZGxlIGFzc2V0cyBzeW5jZWQnKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZmlsZVBhdGguZW5kc1dpdGgoJy5qc29uJykpIHtcbiAgICAgIGNvbnN0IHN0ZW0gPSBwYXRoLmJhc2VuYW1lKGZpbGVQYXRoLCAnLmpzb24nKTtcbiAgICAgIGlmIChvbmx5Q29tcG9uZW50SWQgJiYgc3RlbSAhPT0gb25seUNvbXBvbmVudElkKSByZXR1cm47XG4gICAgICBzY2hlZHVsZSgoKSA9PiBjb21waWxlT25lKHN0ZW0pKTtcbiAgICB9XG4gIH0pO1xuXG4gIHdhdGNoZXIub24oJ3JlYWR5JywgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdXYXRjaGluZyBmb3IgY2hhbmdlcy4gUHJlc3MgQ3RybCtDIHRvIHN0b3AuXFxuJyk7XG4gIH0pO1xuXG4gIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KCgpID0+IHtcbiAgICAvKiBrZWVwIHByb2Nlc3MgYWxpdmUgKi9cbiAgfSk7XG59O1xuXG4vLyBDTEkgc2V0dXBcbnByb2dyYW1cbiAgLm5hbWUoJ2d1dGVuYmVyZy1jb21waWxlJylcbiAgLmRlc2NyaXB0aW9uKCdUcmFuc3BpbGUgSGFuZG9mZiBjb21wb25lbnRzIHRvIFdvcmRQcmVzcyBHdXRlbmJlcmcgYmxvY2tzIGFuZCB0aGVtZSB0ZW1wbGF0ZXMnKVxuICAudmVyc2lvbignMS4wLjAnKTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGNvbmZpZyBmaWxlXG4gKi9cbmNvbnN0IGluaXRDb25maWcgPSAob3B0czoge1xuICBhcGlVcmw/OiBzdHJpbmc7XG4gIG91dHB1dD86IHN0cmluZztcbiAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbiAgZm9yY2U/OiBib29sZWFuO1xufSk6IHZvaWQgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICAvLyBDaGVjayBpZiBjb25maWcgYWxyZWFkeSBleGlzdHNcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkgJiYgIW9wdHMuZm9yY2UpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWcgZmlsZSBhbHJlYWR5IGV4aXN0czogJHtjb25maWdQYXRofWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBVc2UgLS1mb3JjZSB0byBvdmVyd3JpdGUuXFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG4gIFxuICBjb25zdCBuZXdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHtcbiAgICBhcGlVcmw6IG9wdHMuYXBpVXJsID8/ICdodHRwczovL3lvdXItaGFuZG9mZi1zaXRlLmNvbScsXG4gICAgb3V0cHV0OiBvcHRzLm91dHB1dCA/PyAnLi9kZW1vL3BsdWdpbi9ibG9ja3MnLFxuICAgIHRoZW1lRGlyOiBvcHRzLnRoZW1lRGlyID8/ICcuL2RlbW8vdGhlbWUnLFxuICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/ICcnLFxuICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/ICcnLFxuICB9O1xuICBcbiAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShuZXdDb25maWcsIG51bGwsIDIpICsgJ1xcbicpO1xuICBcbiAgY29uc29sZS5sb2coYFxcbuKchSBDcmVhdGVkIGNvbmZpZyBmaWxlOiAke2NvbmZpZ1BhdGh9YCk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5OEIENvbmZpZ3VyYXRpb246YCk7XG4gIGNvbnNvbGUubG9nKGAgICBhcGlVcmw6ICAgJHtuZXdDb25maWcuYXBpVXJsfWApO1xuICBjb25zb2xlLmxvZyhgICAgb3V0cHV0OiAgICR7bmV3Q29uZmlnLm91dHB1dH1gKTtcbiAgY29uc29sZS5sb2coYCAgIHRoZW1lRGlyOiAke25ld0NvbmZpZy50aGVtZURpcn1gKTtcbiAgaWYgKG5ld0NvbmZpZy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICB1c2VybmFtZTogJHtuZXdDb25maWcudXNlcm5hbWV9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIHBhc3N3b3JkOiAqKioqYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYFxcbvCfkqEgRWRpdCB0aGlzIGZpbGUgdG8gY29uZmlndXJlIHlvdXIgSGFuZG9mZiBBUEkgc2V0dGluZ3MuXFxuYCk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBoZWxwZXJcbiAqL1xuY29uc3QgcHJvbXB0ID0gKHF1ZXN0aW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zdCByZWFkbGluZSA9IHJlcXVpcmUoJ3JlYWRsaW5lJyk7XG4gIGNvbnN0IHJsID0gcmVhZGxpbmUuY3JlYXRlSW50ZXJmYWNlKHtcbiAgICBpbnB1dDogcHJvY2Vzcy5zdGRpbixcbiAgICBvdXRwdXQ6IHByb2Nlc3Muc3Rkb3V0LFxuICB9KTtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIHJsLnF1ZXN0aW9uKHF1ZXN0aW9uLCAoYW5zd2VyOiBzdHJpbmcpID0+IHtcbiAgICAgIHJsLmNsb3NlKCk7XG4gICAgICByZXNvbHZlKGFuc3dlci50cmltKCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGZvciB5ZXMvbm9cbiAqL1xuY29uc3QgcHJvbXB0WWVzTm8gPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgZGVmYXVsdFZhbHVlOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICBjb25zdCBkZWZhdWx0U3RyID0gZGVmYXVsdFZhbHVlID8gJ1kvbicgOiAneS9OJztcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGAke3F1ZXN0aW9ufSBbJHtkZWZhdWx0U3RyfV06IGApO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgcmV0dXJuIGFuc3dlci50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ3knKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IHdpdGggY2hvaWNlc1xuICovXG5jb25zdCBwcm9tcHRDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10sIGRlZmF1bHRJbmRleDogbnVtYmVyID0gMCk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnN0IG1hcmtlciA9IGkgPT09IGRlZmF1bHRJbmRleCA/ICc+JyA6ICcgJztcbiAgICBjb25zb2xlLmxvZyhgICAke21hcmtlcn0gJHtpICsgMX0uICR7Y2hvaWNlfWApO1xuICB9KTtcbiAgXG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgRW50ZXIgbnVtYmVyIFske2RlZmF1bHRJbmRleCArIDF9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xuICBcbiAgY29uc3QgaW5kZXggPSBwYXJzZUludChhbnN3ZXIsIDEwKSAtIDE7XG4gIGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgY2hvaWNlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gY2hvaWNlc1tpbmRleF07XG4gIH1cbiAgcmV0dXJuIGNob2ljZXNbZGVmYXVsdEluZGV4XTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGZvciBtdWx0aXBsZSBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdE11bHRpQ2hvaWNlID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGNob2ljZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxuJHtxdWVzdGlvbn1gKTtcbiAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGkpID0+IHtcbiAgICBjb25zb2xlLmxvZyhgICAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXJzIHNlcGFyYXRlZCBieSBjb21tYXMgKGUuZy4sIDEsMiwzKSBvciAnYWxsJzogYCk7XG4gIGlmIChhbnN3ZXIudG9Mb3dlckNhc2UoKSA9PT0gJ2FsbCcpIHJldHVybiBjaG9pY2VzO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIFtjaG9pY2VzWzBdXTtcbiAgXG4gIGNvbnN0IGluZGljZXMgPSBhbnN3ZXIuc3BsaXQoJywnKS5tYXAocyA9PiBwYXJzZUludChzLnRyaW0oKSwgMTApIC0gMSk7XG4gIHJldHVybiBpbmRpY2VzXG4gICAgLmZpbHRlcihpID0+IGkgPj0gMCAmJiBpIDwgY2hvaWNlcy5sZW5ndGgpXG4gICAgLm1hcChpID0+IGNob2ljZXNbaV0pO1xufTtcblxuLyoqXG4gKiBGaW5kIGFsbCBhcnJheSBwcm9wZXJ0aWVzIGluIGEgY29tcG9uZW50XG4gKi9cbmNvbnN0IGZpbmRBcnJheVByb3BlcnRpZXMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJyk6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0+IHtcbiAgY29uc3QgYXJyYXlzOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9PiA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBjb25zdCBwYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgIFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICBhcnJheXMucHVzaCh7IHBhdGgsIHByb3BlcnR5IH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBSZWN1cnNlIGludG8gb2JqZWN0c1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICBhcnJheXMucHVzaCguLi5maW5kQXJyYXlQcm9wZXJ0aWVzKHByb3BlcnR5LnByb3BlcnRpZXMsIHBhdGgpKTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBhcnJheXM7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGZpZWxkIG1hcHBpbmcgc3VnZ2VzdGlvbnMgYmFzZWQgb24gYXJyYXkgaXRlbSBwcm9wZXJ0aWVzXG4gKi9cbmNvbnN0IHN1Z2dlc3RGaWVsZE1hcHBpbmdzID0gKGl0ZW1Qcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9PiB7XG4gIGNvbnN0IHN1Z2dlc3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICBjb25zdCBtYXBQcm9wZXJ0eSA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBwYXRoID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgXG4gICAgICAvLyBTdWdnZXN0IG1hcHBpbmdzIGJhc2VkIG9uIGNvbW1vbiBwYXR0ZXJuc1xuICAgICAgY29uc3QgbG93ZXJLZXkgPSBrZXkudG9Mb3dlckNhc2UoKTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJyB8fCBsb3dlcktleS5pbmNsdWRlcygnaW1hZ2UnKSB8fCBsb3dlcktleS5pbmNsdWRlcygncGhvdG8nKSB8fCBsb3dlcktleS5pbmNsdWRlcygndGh1bWJuYWlsJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAnZmVhdHVyZWRfaW1hZ2UnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3RpdGxlJyB8fCBsb3dlcktleS5pbmNsdWRlcygnaGVhZGluZycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCduYW1lJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF90aXRsZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdleGNlcnB0JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3N1bW1hcnknKSB8fCBsb3dlcktleS5pbmNsdWRlcygnZGVzY3JpcHRpb24nKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2V4Y2VycHQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnY29udGVudCcpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdib2R5JykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9jb250ZW50JztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkgPT09ICd1cmwnIHx8IGxvd2VyS2V5ID09PSAnaHJlZicgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2xpbmsnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwZXJtYWxpbmsnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnZGF0ZScpKSB7XG4gICAgICAgIGlmIChsb3dlcktleS5pbmNsdWRlcygnZGF5JykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6ZGF5X251bWVyaWMnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdtb250aCcpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOm1vbnRoX3Nob3J0JztcbiAgICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygneWVhcicpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOnllYXInO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpmdWxsJztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnYXV0aG9yJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAnYXV0aG9yLm5hbWUnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnY2F0ZWdvcnknKSB8fCBsb3dlcktleS5pbmNsdWRlcygndGFnJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAndGF4b25vbXk6Y2F0ZWdvcnknO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBSZWN1cnNlIGludG8gbmVzdGVkIG9iamVjdHNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICBtYXBQcm9wZXJ0eShwcm9wLnByb3BlcnRpZXMsIHBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIG1hcFByb3BlcnR5KGl0ZW1Qcm9wZXJ0aWVzKTtcbiAgcmV0dXJuIHN1Z2dlc3Rpb25zO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSB3aXphcmQgZm9yIGNvbmZpZ3VyaW5nIGR5bmFtaWMgYXJyYXlzXG4gKi9cbmNvbnN0IGNvbmZpZ3VyZUR5bmFtaWNBcnJheXMgPSBhc3luYyAoXG4gIGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LFxuICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCfp5kgRHluYW1pYyBBcnJheSBDb25maWd1cmF0aW9uIFdpemFyZGApO1xuICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50OiAke2NvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7Y3R4LmFwaVVybH1gKTtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2N0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IHN0cnVjdHVyZS4uLmApO1xuICBsZXQgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50O1xuICB0cnkge1xuICAgIGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgY29tcG9uZW50TmFtZSk7XG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX0gKCR7Y29tcG9uZW50LmlkfSlcXG5gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIC8vIEZpbmQgYXJyYXkgcHJvcGVydGllc1xuICBjb25zdCBhcnJheVByb3BzID0gZmluZEFycmF5UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIFxuICBpZiAoYXJyYXlQcm9wcy5sZW5ndGggPT09IDApIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBObyBhcnJheSBwcm9wZXJ0aWVzIGZvdW5kIGluIHRoaXMgY29tcG9uZW50LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBEeW5hbWljIGFycmF5cyBhcmUgb25seSBhdmFpbGFibGUgZm9yIGFycmF5LXR5cGUgcHJvcGVydGllcy5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGDwn5OLIEZvdW5kICR7YXJyYXlQcm9wcy5sZW5ndGh9IGFycmF5IGZpZWxkKHMpOmApO1xuICBhcnJheVByb3BzLmZvckVhY2goKGFyciwgaSkgPT4ge1xuICAgIGNvbnN0IGl0ZW1Db3VudCA9IGFyci5wcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyA/IE9iamVjdC5rZXlzKGFyci5wcm9wZXJ0eS5pdGVtcy5wcm9wZXJ0aWVzKS5sZW5ndGggOiAwO1xuICAgIGNvbnNvbGUubG9nKGAgICAke2kgKyAxfS4gJHthcnIucGF0aH0gKCR7aXRlbUNvdW50fSBpdGVtIHByb3BlcnRpZXMpYCk7XG4gIH0pO1xuICBcbiAgLy8gU2VsZWN0IHdoaWNoIGFycmF5cyB0byBjb25maWd1cmVcbiAgY29uc3Qgc2VsZWN0ZWRBcnJheXMgPSBhcnJheVByb3BzLmxlbmd0aCA9PT0gMSBcbiAgICA/IFthcnJheVByb3BzWzBdXVxuICAgIDogYXdhaXQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGFycmF5UHJvcHMubWFwKGEgPT4gYS5wYXRoKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwcm9tcHRNdWx0aUNob2ljZSgnV2hpY2ggYXJyYXkocykgZG8geW91IHdhbnQgdG8gY29uZmlndXJlPycsIGNob2ljZXMpO1xuICAgICAgICByZXR1cm4gYXJyYXlQcm9wcy5maWx0ZXIoYSA9PiBzZWxlY3RlZC5pbmNsdWRlcyhhLnBhdGgpKTtcbiAgICAgIH0pKCk7XG4gIFxuICAvLyBMb2FkIGV4aXN0aW5nIGNvbmZpZ1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIGxldCBleGlzdGluZ0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge307XG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGV4aXN0aW5nQ29uZmlnID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04JykpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gSWdub3JlIHBhcnNlIGVycm9yc1xuICAgIH1cbiAgfVxuICBcbiAgLy8gQnVpbGQgdGhlIGltcG9ydCBjb25maWcsIHByZXNlcnZpbmcgZXhpc3RpbmcgZW50cmllc1xuICBjb25zdCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyA9IGV4aXN0aW5nQ29uZmlnLmltcG9ydCB8fCB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGlmICghaW1wb3J0Q29uZmlnLmJsb2NrIHx8IHR5cGVvZiBpbXBvcnRDb25maWcuYmxvY2sgPT09ICdib29sZWFuJykge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IHt9O1xuICB9XG4gIGNvbnN0IGJsb2NrQ29uZmlnID0gaW1wb3J0Q29uZmlnLmJsb2NrIGFzIFJlY29yZDxzdHJpbmcsIENvbXBvbmVudEltcG9ydENvbmZpZz47XG4gIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSB8fCB0eXBlb2YgYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSA9IHt9O1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudEZpZWxkQ29uZmlnID0gYmxvY2tDb25maWdbY29tcG9uZW50LmlkXSBhcyBSZWNvcmQ8c3RyaW5nLCBGaWVsZENvbmZpZz47XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVBvc3RzQXJyYXkgPSBhc3luYyAoYXJyYXlQcm9wOiB7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9KTogUHJvbWlzZTxEeW5hbWljQXJyYXlDb25maWc+ID0+IHtcbiAgICAvLyBTZWxlY3Rpb24gbW9kZVxuICAgIGNvbnN0IHNlbGVjdGlvbk1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCB1c2VycyBzZWxlY3QgcG9zdHM/JyxcbiAgICAgIFsnUXVlcnkgQnVpbGRlciAoZmlsdGVyIGJ5IHRheG9ub215LCBvcmRlciwgZXRjLiknLCAnTWFudWFsIFNlbGVjdGlvbiAoaGFuZC1waWNrIHNwZWNpZmljIHBvc3RzKSddLFxuICAgICAgMFxuICAgICk7XG4gICAgY29uc3QgaXNRdWVyeU1vZGUgPSBzZWxlY3Rpb25Nb2RlLmluY2x1ZGVzKCdRdWVyeScpO1xuXG4gICAgLy8gUG9zdCB0eXBlc1xuICAgIGNvbnNvbGUubG9nKGBcXG5FbnRlciBhbGxvd2VkIHBvc3QgdHlwZXMgKGNvbW1hLXNlcGFyYXRlZCk6YCk7XG4gICAgY29uc3QgcG9zdFR5cGVzSW5wdXQgPSBhd2FpdCBwcm9tcHQoYFBvc3QgdHlwZXMgW3Bvc3RdOiBgKTtcbiAgICBjb25zdCBwb3N0VHlwZXMgPSBwb3N0VHlwZXNJbnB1dFxuICAgICAgPyBwb3N0VHlwZXNJbnB1dC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgIDogWydwb3N0J107XG5cbiAgICAvLyBNYXggaXRlbXNcbiAgICBjb25zdCBtYXhJdGVtc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBNYXhpbXVtIGl0ZW1zIFsxMl06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IDEyO1xuXG4gICAgLy8gUmVuZGVyIG1vZGVcbiAgICBjb25zdCByZW5kZXJNb2RlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ0hvdyBzaG91bGQgcG9zdHMgYmUgcmVuZGVyZWQ/JyxcbiAgICAgIFsnTWFwcGVkIChjb252ZXJ0IHBvc3QgZmllbGRzIHRvIHRlbXBsYXRlIHN0cnVjdHVyZSknLCAnVGVtcGxhdGUgKHVzZSBhIFBIUCB0ZW1wbGF0ZSBmaWxlKSddLFxuICAgICAgMFxuICAgICk7XG4gICAgY29uc3QgaXNNYXBwZWRNb2RlID0gcmVuZGVyTW9kZS5pbmNsdWRlcygnTWFwcGVkJyk7XG5cbiAgICBsZXQgZmllbGRNYXBwaW5nOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgbGV0IHRlbXBsYXRlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKGlzTWFwcGVkTW9kZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbvCfk4ogRmllbGQgTWFwcGluZyBDb25maWd1cmF0aW9uYCk7XG5cbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGFycmF5UHJvcC5wcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcztcbiAgICAgIGlmIChpdGVtUHJvcHMpIHtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBzdWdnZXN0RmllbGRNYXBwaW5ncyhpdGVtUHJvcHMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5JJ2xsIHN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gZmllbGQgbmFtZXMuIFByZXNzIEVudGVyIHRvIGFjY2VwdCBvciB0eXBlIGEgbmV3IHZhbHVlLmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxuQXZhaWxhYmxlIHNvdXJjZXM6YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gcG9zdF90aXRsZSwgcG9zdF9leGNlcnB0LCBwb3N0X2NvbnRlbnQsIHBlcm1hbGluaywgcG9zdF9pZGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGZlYXR1cmVkX2ltYWdlYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gcG9zdF9kYXRlOmRheSwgcG9zdF9kYXRlOm1vbnRoX3Nob3J0LCBwb3N0X2RhdGU6eWVhciwgcG9zdF9kYXRlOmZ1bGxgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBhdXRob3IubmFtZSwgYXV0aG9yLnVybCwgYXV0aG9yLmF2YXRhcmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHRheG9ub215OmNhdGVnb3J5LCB0YXhvbm9teTpwb3N0X3RhZ2ApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIG1ldGE6ZmllbGRfbmFtZWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIChsZWF2ZSBlbXB0eSB0byBza2lwKVxcbmApO1xuXG4gICAgICAgIGNvbnN0IGZsYXR0ZW5Qcm9wcyA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcHJlZml4OiBzdHJpbmcgPSAnJyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICBjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICAgICAgY29uc3QgcCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgICAgICBwYXRocy5wdXNoKC4uLmZsYXR0ZW5Qcm9wcyhwcm9wLnByb3BlcnRpZXMsIHApKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2gocCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBwYXRocztcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkUGF0aCBvZiBmbGF0dGVuUHJvcHMoaXRlbVByb3BzKSkge1xuICAgICAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSBzdWdnZXN0aW9uc1tmaWVsZFBhdGhdIHx8ICcnO1xuICAgICAgICAgIGNvbnN0IGRlZmF1bHRTdHIgPSBzdWdnZXN0aW9uID8gYCBbJHtzdWdnZXN0aW9ufV1gIDogJyc7XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9IGF3YWl0IHByb21wdChgICAke2ZpZWxkUGF0aH0ke2RlZmF1bHRTdHJ9OiBgKTtcbiAgICAgICAgICBjb25zdCBmaW5hbE1hcHBpbmcgPSBtYXBwaW5nIHx8IHN1Z2dlc3Rpb247XG4gICAgICAgICAgaWYgKGZpbmFsTWFwcGluZykge1xuICAgICAgICAgICAgaWYgKGZpbmFsTWFwcGluZy5zdGFydHNXaXRoKCd7JykpIHtcbiAgICAgICAgICAgICAgdHJ5IHsgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBKU09OLnBhcnNlKGZpbmFsTWFwcGluZyk7IH1cbiAgICAgICAgICAgICAgY2F0Y2ggeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZzsgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBmaW5hbE1hcHBpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGRlZmF1bHRUZW1wbGF0ZSA9IGB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyR7YXJyYXlQcm9wLnBhdGh9LWl0ZW0ucGhwYDtcbiAgICAgIHRlbXBsYXRlUGF0aCA9IGF3YWl0IHByb21wdChgVGVtcGxhdGUgcGF0aCBbJHtkZWZhdWx0VGVtcGxhdGV9XTogYCkgfHwgZGVmYXVsdFRlbXBsYXRlO1xuICAgIH1cblxuICAgIGNvbnN0IGFycmF5Q29uZmlnOiBEeW5hbWljQXJyYXlDb25maWcgPSB7XG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgcG9zdFR5cGVzLFxuICAgICAgc2VsZWN0aW9uTW9kZTogaXNRdWVyeU1vZGUgPyAncXVlcnknIDogJ21hbnVhbCcsXG4gICAgICBtYXhJdGVtcyxcbiAgICAgIHJlbmRlck1vZGU6IGlzTWFwcGVkTW9kZSA/ICdtYXBwZWQnIDogJ3RlbXBsYXRlJyxcbiAgICB9O1xuICAgIGlmIChpc01hcHBlZE1vZGUgJiYgT2JqZWN0LmtleXMoZmllbGRNYXBwaW5nKS5sZW5ndGggPiAwKSBhcnJheUNvbmZpZy5maWVsZE1hcHBpbmcgPSBmaWVsZE1hcHBpbmc7XG4gICAgaWYgKCFpc01hcHBlZE1vZGUgJiYgdGVtcGxhdGVQYXRoKSBhcnJheUNvbmZpZy50ZW1wbGF0ZVBhdGggPSB0ZW1wbGF0ZVBhdGg7XG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICBhcnJheUNvbmZpZy5kZWZhdWx0UXVlcnlBcmdzID0ge1xuICAgICAgICBwb3N0c19wZXJfcGFnZTogTWF0aC5taW4obWF4SXRlbXMsIDYpLFxuICAgICAgICBvcmRlcmJ5OiAnZGF0ZScsXG4gICAgICAgIG9yZGVyOiAnREVTQycsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gYXJyYXlDb25maWc7XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBCcmVhZGNydW1ic0FycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlQnJlYWRjcnVtYnNBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPEJyZWFkY3J1bWJzQXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgQnJlYWRjcnVtYnMgYXJlIGJ1aWx0IGF1dG9tYXRpY2FsbHkgZnJvbSB0aGUgY3VycmVudCBwYWdlIFVSTC5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciB3aWxsIHNob3cgYSBzaW5nbGUgZW5hYmxlL2Rpc2FibGUgdG9nZ2xlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBhY3RpdmUgfVxcbmApO1xuICAgIHJldHVybiB7IGFycmF5VHlwZTogJ2JyZWFkY3J1bWJzJyB9O1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgVGF4b25vbXlBcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkgPSBhc3luYyAoKTogUHJvbWlzZTxUYXhvbm9teUFycmF5Q29uZmlnPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIFRheG9ub215IHRlcm1zIGFyZSBmZXRjaGVkIGZyb20gdGhlIGN1cnJlbnQgcG9zdCBzZXJ2ZXItc2lkZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciBzaG93cyBhIHRvZ2dsZSBhbmQgYSBkcm9wZG93biB0byBjaG9vc2UgdGhlIHRheG9ub215LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBzbHVnIH1cXG5gKTtcblxuICAgIGNvbnNvbGUubG9nKGBFbnRlciB0aGUgdGF4b25vbXkgc2x1Z3MgZWRpdG9ycyBjYW4gY2hvb3NlIGZyb20gKGNvbW1hLXNlcGFyYXRlZCk6YCk7XG4gICAgY29uc3QgdGF4b25vbXlJbnB1dCA9IGF3YWl0IHByb21wdChgVGF4b25vbWllcyBbcG9zdF90YWcsY2F0ZWdvcnldOiBgKTtcbiAgICBjb25zdCB0YXhvbm9taWVzID0gdGF4b25vbXlJbnB1dFxuICAgICAgPyB0YXhvbm9teUlucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3RfdGFnJywgJ2NhdGVnb3J5J107XG5cbiAgICBjb25zdCBtYXhJdGVtc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBNYXhpbXVtIHRlcm1zIHRvIGRpc3BsYXkgKC0xID0gYWxsKSBbLTFdOiBgKTtcbiAgICBjb25zdCBtYXhJdGVtcyA9IG1heEl0ZW1zSW5wdXQgPyBwYXJzZUludChtYXhJdGVtc0lucHV0LCAxMCkgOiAtMTtcblxuICAgIGNvbnN0IGNvbmZpZzogVGF4b25vbXlBcnJheUNvbmZpZyA9IHsgYXJyYXlUeXBlOiAndGF4b25vbXknLCB0YXhvbm9taWVzIH07XG4gICAgaWYgKG1heEl0ZW1zID4gMCkgY29uZmlnLm1heEl0ZW1zID0gbWF4SXRlbXM7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIFBhZ2luYXRpb25BcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZVBhZ2luYXRpb25BcnJheSA9IGFzeW5jIChvdGhlckFycmF5UGF0aHM6IHN0cmluZ1tdKTogUHJvbWlzZTxQYWdpbmF0aW9uQXJyYXlDb25maWcgfCBudWxsPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIFBhZ2luYXRpb24gbGlua3MgYXJlIGRlcml2ZWQgYXV0b21hdGljYWxseSBmcm9tIGEgc2libGluZyBwb3N0cyBhcnJheSBxdWVyeS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVGhlIGVkaXRvciBzaG93cyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG5cbiAgICBpZiAob3RoZXJBcnJheVBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKaoO+4jyAgTm8gc2libGluZyBhcnJheXMgZm91bmQgdG8gY29ubmVjdCB0by4gQ29uZmlndXJlIGEgcG9zdHMgYXJyYXkgZmlyc3QuYCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgY29ubmVjdGVkRmllbGQ6IHN0cmluZztcbiAgICBpZiAob3RoZXJBcnJheVBhdGhzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBvdGhlckFycmF5UGF0aHNbMF07XG4gICAgICBjb25zb2xlLmxvZyhgICAgQ29ubmVjdGVkIHRvOiAke2Nvbm5lY3RlZEZpZWxkfSAob25seSBvcHRpb24pYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICAgJ1doaWNoIHBvc3RzIGFycmF5IHNob3VsZCB0aGlzIHBhZ2luYXRpb24gYmUgY29ubmVjdGVkIHRvPycsXG4gICAgICAgIG90aGVyQXJyYXlQYXRocyxcbiAgICAgICAgMFxuICAgICAgKTtcbiAgICAgIGNvbm5lY3RlZEZpZWxkID0gY2hvaWNlO1xuICAgIH1cblxuICAgIHJldHVybiB7IGFycmF5VHlwZTogJ3BhZ2luYXRpb24nLCBjb25uZWN0ZWRGaWVsZCB9O1xuICB9O1xuXG4gIC8vIENvbmZpZ3VyZSBlYWNoIHNlbGVjdGVkIGFycmF5XG4gIGZvciAoY29uc3QgYXJyYXlQcm9wIG9mIHNlbGVjdGVkQXJyYXlzKSB7XG4gICAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBDb25maWd1cmluZzogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9XFxuYCk7XG5cbiAgICAvLyBMZXQgdGhlIHVzZXIgY2hvb3NlIHRoZSBhcnJheSB0eXBlXG4gICAgY29uc3QgYXJyYXlUeXBlQ2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ1doYXQga2luZCBvZiBkYXRhIHNob3VsZCB0aGlzIGFycmF5IGNvbnRhaW4/JyxcbiAgICAgIFtcbiAgICAgICAgJ1Bvc3RzIOKAlCBxdWVyeSBvciBoYW5kLXBpY2sgV29yZFByZXNzIHBvc3RzIChkZWZhdWx0KScsXG4gICAgICAgICdCcmVhZGNydW1icyDigJQgYXV0by1nZW5lcmF0ZWQgdHJhaWwgZnJvbSBjdXJyZW50IFVSTCcsXG4gICAgICAgICdUYXhvbm9teSDigJQgdGVybXMgYXR0YWNoZWQgdG8gdGhlIGN1cnJlbnQgcG9zdCcsXG4gICAgICAgICdQYWdpbmF0aW9uIOKAlCBsaW5rcyBkZXJpdmVkIGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5JyxcbiAgICAgIF0sXG4gICAgICAwXG4gICAgKTtcblxuICAgIGxldCBhcnJheUNvbmZpZzogRmllbGRDb25maWcgfCBudWxsID0gbnVsbDtcblxuICAgIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnQnJlYWRjcnVtYnMnKSkge1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5KCk7XG4gICAgfSBlbHNlIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnVGF4b25vbXknKSkge1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVUYXhvbm9teUFycmF5KCk7XG4gICAgfSBlbHNlIGlmIChhcnJheVR5cGVDaG9pY2Uuc3RhcnRzV2l0aCgnUGFnaW5hdGlvbicpKSB7XG4gICAgICAvLyBPZmZlciB0aGUgb3RoZXIgYWxyZWFkeS1jb25maWd1cmVkIChvciB5ZXQtdG8tYmUtY29uZmlndXJlZCkgYXJyYXkgcGF0aHMgYXMgY2FuZGlkYXRlc1xuICAgICAgY29uc3Qgc2libGluZyA9IHNlbGVjdGVkQXJyYXlzXG4gICAgICAgIC5maWx0ZXIoYSA9PiBhLnBhdGggIT09IGFycmF5UHJvcC5wYXRoKVxuICAgICAgICAubWFwKGEgPT4gYS5wYXRoKTtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5KHNpYmxpbmcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBQb3N0c1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQb3N0c0FycmF5KGFycmF5UHJvcCk7XG4gICAgfVxuXG4gICAgaWYgKGFycmF5Q29uZmlnKSB7XG4gICAgICBjb21wb25lbnRGaWVsZENvbmZpZ1thcnJheVByb3AucGF0aF0gPSBhcnJheUNvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7inIUgQ29uZmlndXJlZDogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9ICgkeyhhcnJheUNvbmZpZyBhcyBhbnkpLmFycmF5VHlwZSA/PyAncG9zdHMnfSlgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgU2tpcHBlZDogJHtjb21wb25lbnQuaWR9LiR7YXJyYXlQcm9wLnBhdGh9YCk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBVcGRhdGUgY29uZmlnIGZpbGUg4oCUIHJlbW92ZSBsZWdhY3kgZHluYW1pY0FycmF5cyBpZiBwcmVzZW50XG4gIGNvbnN0IHsgZHluYW1pY0FycmF5czogX2xlZ2FjeUR5bmFtaWMsIC4uLnJlc3RDb25maWcgfSA9IGV4aXN0aW5nQ29uZmlnO1xuICBjb25zdCBuZXdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHtcbiAgICAuLi5yZXN0Q29uZmlnLFxuICAgIGltcG9ydDogaW1wb3J0Q29uZmlnLFxuICB9O1xuICBcbiAgY29uc29sZS5sb2coYFxcbiR7J+KUgCcucmVwZWF0KDYwKX1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbiBQcmV2aWV3OlxcbmApO1xuICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh7IGltcG9ydDogaW1wb3J0Q29uZmlnIH0sIG51bGwsIDIpKTtcbiAgXG4gIGNvbnN0IHNob3VsZFNhdmUgPSBhd2FpdCBwcm9tcHRZZXNObygnXFxuU2F2ZSB0byBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uPycsIHRydWUpO1xuICBcbiAgaWYgKHNob3VsZFNhdmUpIHtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gICAgY29uc29sZS5sb2coYFxcbuKchSBTYXZlZCB0byAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYFxcbvCfkqEgTmV4dCBzdGVwczpgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMS4gUnVuOiBucG0gcnVuIGRldiAtLSAke2NvbXBvbmVudE5hbWV9IC0tZm9yY2VgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMi4gQnVpbGQgeW91ciBibG9ja3M6IGNkIGRlbW8vcGx1Z2luICYmIG5wbSBydW4gYnVpbGRgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgMy4gVGVzdCB0aGUgYmxvY2sgaW4gV29yZFByZXNzXFxuYCk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29uZmlndXJhdGlvbiBub3Qgc2F2ZWQuIENvcHkgdGhlIEpTT04gYWJvdmUgbWFudWFsbHkgaWYgbmVlZGVkLlxcbmApO1xuICB9XG59O1xuXG4vLyBDb25maWd1cmUgZHluYW1pYyBhcnJheXMgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnY29uZmlndXJlLWR5bmFtaWMgW2NvbXBvbmVudF0nKVxuICAuYWxpYXMoJ3dpemFyZCcpXG4gIC5kZXNjcmlwdGlvbignSW50ZXJhY3RpdmUgd2l6YXJkIHRvIGNvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBmb3IgYSBjb21wb25lbnQnKVxuICAub3B0aW9uKCctYSwgLS1hcGktdXJsIDx1cmw+JywgJ0hhbmRvZmYgQVBJIGJhc2UgVVJMJylcbiAgLm9wdGlvbignLXUsIC0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lJylcbiAgLm9wdGlvbignLXAsIC0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLWwsIC0tbGlzdCcsICdMaXN0IGF2YWlsYWJsZSBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzJylcbiAgLm9wdGlvbignLXMsIC0tc291cmNlIDxkaXI+JywgJ1JlYWQgSGFuZG9mZiBwdWJsaWMvYXBpIGZyb20gZGlzayBpbnN0ZWFkIG9mIEhUVFAnKVxuICAuYWN0aW9uKGFzeW5jIChjb21wb25lbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdHM6IHtcbiAgICBhcGlVcmw/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgbGlzdD86IGJvb2xlYW47XG4gICAgc291cmNlPzogc3RyaW5nO1xuICB9KSA9PiB7XG4gICAgY29uc3QgYXBpVXJsID0gb3B0cy5hcGlVcmwgPz8gY29uZmlnLmFwaVVybDtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBjb25zdCBsb2NhbEFwaVJvb3QgPSBvcHRzLnNvdXJjZSA/IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRzLnNvdXJjZSkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZGF0YUN0eDogSGFuZG9mZkRhdGFDb250ZXh0ID0geyBhcGlVcmwsIGF1dGgsIGxvY2FsQXBpUm9vdCB9O1xuICAgIFxuICAgIC8vIElmIGxpc3RpbmcgY29tcG9uZW50cywgc2hvdyBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzXG4gICAgaWYgKG9wdHMubGlzdCB8fCAhY29tcG9uZW50TmFtZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbvCflI0gRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QgZnJvbSAke2FwaVVybH0uLi5cXG5gKTtcbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnRMaXN0KGRhdGFDdHgsIGNvbmZpZy5pbXBvcnQpO1xuICAgICAgICBcbiAgICAgICAgLy8gRmV0Y2ggZWFjaCBjb21wb25lbnQgdG8gZmluZCBvbmVzIHdpdGggYXJyYXkgZmllbGRzXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50cy4gQ2hlY2tpbmcgZm9yIGFycmF5IGZpZWxkcy4uLlxcbmApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY29tcG9uZW50c1dpdGhBcnJheXM6IEFycmF5PHsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgYXJyYXlzOiBzdHJpbmdbXSB9PiA9IFtdO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBpZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgaWQpO1xuICAgICAgICAgICAgY29uc3QgYXJyYXlzID0gZmluZEFycmF5UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gICAgICAgICAgICBpZiAoYXJyYXlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgY29tcG9uZW50c1dpdGhBcnJheXMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgICAgdGl0bGU6IGNvbXBvbmVudC50aXRsZSxcbiAgICAgICAgICAgICAgICBhcnJheXM6IGFycmF5cy5tYXAoYSA9PiBhLnBhdGgpLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIFNraXAgZmFpbGVkIGNvbXBvbmVudHNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjb21wb25lbnRzV2l0aEFycmF5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pqg77iPICBObyBjb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzIGZvdW5kLlxcbmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYPCfp6kgQ29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkczpcXG5gKTtcbiAgICAgICAgY29tcG9uZW50c1dpdGhBcnJheXMuZm9yRWFjaCgoYywgaSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAke2kgKyAxfS4gJHtjLnRpdGxlfSAoJHtjLmlkfSlgKTtcbiAgICAgICAgICBjLmFycmF5cy5mb3JFYWNoKGEgPT4gY29uc29sZS5sb2coYCAgICAgIOKUlOKUgCAke2F9YCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIGlmIChvcHRzLmxpc3QpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBSdW46IG5wbSBydW4gZGV2IC0tIHdpemFyZCA8Y29tcG9uZW50LWlkPlxcbmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gSW50ZXJhY3RpdmUgc2VsZWN0aW9uXG4gICAgICAgIGNvbnN0IGNob2ljZXMgPSBjb21wb25lbnRzV2l0aEFycmF5cy5tYXAoYyA9PiBgJHtjLnRpdGxlfSAoJHtjLmlkfSlgKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwcm9tcHRDaG9pY2UoJ1xcblNlbGVjdCBhIGNvbXBvbmVudCB0byBjb25maWd1cmU6JywgY2hvaWNlcywgMCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkSW5kZXggPSBjaG9pY2VzLmluZGV4T2Yoc2VsZWN0ZWQpO1xuICAgICAgICBjb21wb25lbnROYW1lID0gY29tcG9uZW50c1dpdGhBcnJheXNbc2VsZWN0ZWRJbmRleF0uaWQ7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgYXdhaXQgY29uZmlndXJlRHluYW1pY0FycmF5cyhkYXRhQ3R4LCBjb21wb25lbnROYW1lISk7XG4gIH0pO1xuXG4vLyBJbml0IGNvbW1hbmRcbnByb2dyYW1cbiAgLmNvbW1hbmQoJ2luaXQnKVxuICAuZGVzY3JpcHRpb24oJ0NyZWF0ZSBhIGhhbmRvZmYtd3AuY29uZmlnLmpzb24gZmlsZSBpbiB0aGUgY3VycmVudCBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctLW91dHB1dCA8ZGlyPicsICdPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MnKVxuICAub3B0aW9uKCctLXRoZW1lLWRpciA8ZGlyPicsICdUaGVtZSBkaXJlY3RvcnkgZm9yIGhlYWRlci9mb290ZXIgdGVtcGxhdGVzJylcbiAgLm9wdGlvbignLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCcpXG4gIC5vcHRpb24oJy0tZm9yY2UnLCAnT3ZlcndyaXRlIGV4aXN0aW5nIGNvbmZpZyBmaWxlJylcbiAgLmFjdGlvbigob3B0aW9ucywgY29tbWFuZCkgPT4ge1xuICAgIC8vIFVzZSBvcHRzV2l0aEdsb2JhbHMgdG8gZ2V0IG9wdGlvbnMgZnJvbSBib3RoIHN1YmNvbW1hbmQgYW5kIHBhcmVudFxuICAgIGNvbnN0IG9wdHMgPSBjb21tYW5kLm9wdHNXaXRoR2xvYmFscygpO1xuICAgIGluaXRDb25maWcob3B0cyk7XG4gIH0pO1xuXG4vLyBEZWZhdWx0IGNvbW1hbmQgZm9yIGJsb2Nrc1xucHJvZ3JhbVxuICAuYXJndW1lbnQoJ1tjb21wb25lbnRdJywgJ0NvbXBvbmVudCBuYW1lIHRvIGNvbXBpbGUgb3IgdmFsaWRhdGUnKVxuICAub3B0aW9uKCctYSwgLS1hcGktdXJsIDx1cmw+JywgYEhhbmRvZmYgQVBJIGJhc2UgVVJMIChkZWZhdWx0OiAke2NvbmZpZy5hcGlVcmx9KWApXG4gIC5vcHRpb24oJy1vLCAtLW91dHB1dCA8ZGlyPicsIGBPdXRwdXQgZGlyZWN0b3J5IGZvciBibG9ja3MgKGRlZmF1bHQ6ICR7Y29uZmlnLm91dHB1dH0pYClcbiAgLm9wdGlvbignLS1hbGwnLCAnQ29tcGlsZSBhbGwgYXZhaWxhYmxlIGNvbXBvbmVudHMnKVxuICAub3B0aW9uKCctLXRoZW1lJywgJ0NvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcikgdG8gdGhlbWUgZGlyZWN0b3J5JylcbiAgLm9wdGlvbignLXQsIC0tdGhlbWUtZGlyIDxkaXI+JywgYFRoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMgKGRlZmF1bHQ6ICR7Y29uZmlnLnRoZW1lRGlyfSlgKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLXAsIC0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkIGZvciBIYW5kb2ZmIEFQSScpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUnLCAnVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXMnKVxuICAub3B0aW9uKCctLXZhbGlkYXRlLWFsbCcsICdWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tZm9yY2UnLCAnRm9yY2UgY29tcGlsYXRpb24gZXZlbiB3aXRoIGJyZWFraW5nIGNoYW5nZXMnKVxuICAub3B0aW9uKCctcywgLS1zb3VyY2UgPGRpcj4nLCAnUmVhZCBIYW5kb2ZmIHB1YmxpYy9hcGkgZnJvbSBkaXNrIGluc3RlYWQgb2YgSFRUUCcpXG4gIC5vcHRpb24oJy0td2F0Y2gnLCAnV2F0Y2ggLS1zb3VyY2UgZm9yIGNoYW5nZXMgKHJlcXVpcmVzIC0tc291cmNlKScpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czogeyBcbiAgICBhcGlVcmw/OiBzdHJpbmc7IFxuICAgIG91dHB1dD86IHN0cmluZzsgXG4gICAgYWxsPzogYm9vbGVhbjsgXG4gICAgdGhlbWU/OiBib29sZWFuO1xuICAgIHRoZW1lRGlyPzogc3RyaW5nO1xuICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgIHBhc3N3b3JkPzogc3RyaW5nO1xuICAgIHZhbGlkYXRlPzogYm9vbGVhbjtcbiAgICB2YWxpZGF0ZUFsbD86IGJvb2xlYW47XG4gICAgZm9yY2U/OiBib29sZWFuO1xuICAgIHNvdXJjZT86IHN0cmluZztcbiAgICB3YXRjaD86IGJvb2xlYW47XG4gIH0pID0+IHtcbiAgICAvLyBNZXJnZSBDTEkgb3B0aW9ucyB3aXRoIGNvbmZpZyAoQ0xJIHRha2VzIHByZWNlZGVuY2UpXG4gICAgY29uc3QgYXBpVXJsID0gb3B0cy5hcGlVcmwgPz8gY29uZmlnLmFwaVVybDtcbiAgICBjb25zdCBvdXRwdXQgPSBvcHRzLm91dHB1dCA/PyBjb25maWcub3V0cHV0O1xuICAgIGNvbnN0IHRoZW1lRGlyID0gb3B0cy50aGVtZURpciA/PyBjb25maWcudGhlbWVEaXI7XG4gICAgY29uc3QgYXV0aDogQXV0aENyZWRlbnRpYWxzID0ge1xuICAgICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gY29uZmlnLnVzZXJuYW1lLFxuICAgICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gY29uZmlnLnBhc3N3b3JkLFxuICAgIH07XG4gICAgY29uc3QgbG9jYWxBcGlSb290ID0gb3B0cy5zb3VyY2UgPyBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0cy5zb3VyY2UpIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGRhdGFDdHg6IEhhbmRvZmZEYXRhQ29udGV4dCA9IHsgYXBpVXJsLCBhdXRoLCBsb2NhbEFwaVJvb3QgfTtcblxuICAgIGlmIChvcHRzLndhdGNoKSB7XG4gICAgICBpZiAoIWxvY2FsQXBpUm9vdCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogLS13YXRjaCByZXF1aXJlcyAtLXNvdXJjZSA8ZGlyPiAocGF0aCB0byBIYW5kb2ZmIHB1YmxpYy9hcGkpJyk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRzLnZhbGlkYXRlQWxsIHx8IG9wdHMudmFsaWRhdGUgfHwgb3B0cy5hbGwgfHwgb3B0cy50aGVtZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogLS13YXRjaCBjYW5ub3QgYmUgY29tYmluZWQgd2l0aCAtLWFsbCwgLS10aGVtZSwgLS12YWxpZGF0ZSwgb3IgLS12YWxpZGF0ZS1hbGwnKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgYXdhaXQgcnVuV2F0Y2hNb2RlKGRhdGFDdHgsIG91dHB1dCwgY29tcG9uZW50TmFtZSwgeyBmb3JjZTogb3B0cy5mb3JjZSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgLy8gVmFsaWRhdGlvbiBjb21tYW5kc1xuICAgIGlmIChvcHRzLnZhbGlkYXRlQWxsKSB7XG4gICAgICBhd2FpdCB2YWxpZGF0ZUFsbChkYXRhQ3R4LCBvdXRwdXQsIGNvbmZpZy5pbXBvcnQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICBpZiAob3B0cy52YWxpZGF0ZSAmJiBjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShkYXRhQ3R4LCBvdXRwdXQsIGNvbXBvbmVudE5hbWUpO1xuICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCAmJiAhb3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBpbGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudGhlbWUpIHtcbiAgICAgIGF3YWl0IGNvbXBpbGVUaGVtZShkYXRhQ3R4LCB0aGVtZURpcik7XG4gICAgfSBlbHNlIGlmIChvcHRzLmFsbCkge1xuICAgICAgLy8gVmFsaWRhdGUgYWxsIGZpcnN0IHVubGVzcyBmb3JjZWRcbiAgICAgIGlmICghb3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBQcmUtY29tcGlsYXRpb24gdmFsaWRhdGlvbi4uLlxcbmApO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGRhdGFDdHgsIG91dHB1dCwgY29uZmlnLmltcG9ydCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIHZhbGlkYXRlQWxsIGV4aXRzIHdpdGggY29kZSAxIG9uIGJyZWFraW5nIGNoYW5nZXNcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGNvbXBpbGVBbGwoZGF0YUN0eCwgb3V0cHV0KTtcbiAgICAgIFxuICAgICAgLy8gVXBkYXRlIG1hbmlmZXN0IGFmdGVyIHN1Y2Nlc3NmdWwgY29tcGlsYXRpb25cbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OdIFVwZGF0aW5nIHByb3BlcnR5IG1hbmlmZXN0Li4uYCk7XG4gICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudExpc3QoZGF0YUN0eCwgY29uZmlnLmltcG9ydCk7XG4gICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGRhdGFDdHgsIGNvbXBvbmVudElkKTtcbiAgICAgICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXQsIGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIFNraXAgZmFpbGVkIGNvbXBvbmVudHNcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYCAgIOKchSBNYW5pZmVzdCB1cGRhdGVkXFxuYCk7XG4gICAgfSBlbHNlIGlmIChjb21wb25lbnROYW1lKSB7XG4gICAgICAvLyBCdWlsZCBtZXJnZWQtZ3JvdXAgbG9va3VwIG9uY2UgZm9yIHRoaXMgYnJhbmNoXG4gICAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgICBpZiAobW9kZSA9PT0gJ21lcmdlZCcpIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIGtleSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhlbHBlcjogY29tcGlsZSBhbiBlbnRpcmUgbWVyZ2VkIGdyb3VwIGJ5IGl0cyBjb25maWcga2V5XG4gICAgICBjb25zdCBjb21waWxlR3JvdXBCeUtleSA9IGFzeW5jIChncm91cEtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBjdHhGZXRjaEFsbENvbXBvbmVudHNMaXN0KGRhdGFDdHgpO1xuICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IGdyb3VwS2V5LnRvTG93ZXJDYXNlKCksXG4gICAgICAgICk7XG4gICAgICAgIGlmIChncm91cE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IE5vIGNvbXBvbmVudHMgZm91bmQgZm9yIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bGxHcm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgZ3JvdXBNYXRjaGVzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChkYXRhQ3R4LCBjLmlkKTtcbiAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoZnVsbCk7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBTa2lwcGluZyAke2MuaWR9ICh0ZW1wbGF0ZSB2YWxpZGF0aW9uIGZhaWxlZClgKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdWxsR3JvdXBDb21wb25lbnRzLnB1c2goZnVsbCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICDinYwgRmFpbGVkIHRvIGZldGNoICR7Yy5pZH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycn1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZ1bGxHcm91cENvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IENvdWxkIG5vdCBmZXRjaCBhbnkgY29tcG9uZW50cyBmb3IgZ3JvdXAgXCIke2dyb3VwS2V5fVwiLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoZGF0YUN0eCwgb3V0cHV0LCBncm91cEtleSwgZnVsbEdyb3VwQ29tcG9uZW50cyk7XG4gICAgICAgIGlmIChkYXRhQ3R4LmxvY2FsQXBpUm9vdCkge1xuICAgICAgICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoZGF0YUN0eCwgcGF0aC5yZXNvbHZlKG91dHB1dCwgJy4uJykpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgR3JvdXAgXCIke2dyb3VwS2V5fVwiIGNvbXBpbGVkICgke2Z1bGxHcm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cykuXFxuYCk7XG4gICAgICB9O1xuXG4gICAgICAvLyBUcnkgY29tcG9uZW50IGZpcnN0LCB0aGVuIGZhbGwgYmFjayB0byBncm91cCAoZS5nLiBcImhlcm9cIiAtPiBIZXJvIG1lcmdlZCBibG9jaylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGRhdGFDdHgsIGNvbXBvbmVudE5hbWUpO1xuXG4gICAgICAgIC8vIElmIHRoaXMgY29tcG9uZW50IGJlbG9uZ3MgdG8gYSBtZXJnZWQgZ3JvdXAsIGNvbXBpbGUgdGhlIHdob2xlIGdyb3VwIGluc3RlYWRcbiAgICAgICAgaWYgKGNvbXBvbmVudC5ncm91cCkge1xuICAgICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChjb21wb25lbnQuZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgaWYgKGdyb3VwS2V5KSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgXCIke2NvbXBvbmVudE5hbWV9XCIgYmVsb25ncyB0byBtZXJnZWQgZ3JvdXAgXCIke2dyb3VwS2V5fVwiIOKAlCBjb21waWxpbmcgZW50aXJlIGdyb3VwLlxcbmApO1xuICAgICAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwQnlLZXkoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghb3B0cy5mb3JjZSkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGRhdGFDdHgsIG91dHB1dCwgY29tcG9uZW50TmFtZSk7XG4gICAgICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29tcG9uZW50IGhhcyBicmVha2luZyBjaGFuZ2VzLiBVc2UgLS1mb3JjZSB0byBjb21waWxlIGFueXdheS5cXG5gKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgY29tcGlsZSh7XG4gICAgICAgICAgYXBpVXJsLFxuICAgICAgICAgIG91dHB1dERpcjogb3V0cHV0LFxuICAgICAgICAgIGNvbXBvbmVudE5hbWUsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBsb2NhbEFwaVJvb3QsXG4gICAgICAgIH0pO1xuICAgICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXQsIGNvbXBvbmVudCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDwn5OdIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICAgIH0gY2F0Y2ggKGNvbXBvbmVudEVycm9yKSB7XG4gICAgICAgIC8vIE5vIGNvbXBvbmVudCB3aXRoIHRoaXMgbmFtZSDigJMgdHJ5IGFzIGdyb3VwXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICBObyBjb21wb25lbnQgXCIke2NvbXBvbmVudE5hbWV9XCIgZm91bmQsIGNoZWNraW5nIGdyb3Vwcy4uLlxcbmApO1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgY3R4RmV0Y2hBbGxDb21wb25lbnRzTGlzdChkYXRhQ3R4KTtcbiAgICAgICAgY29uc3QgbmFtZUxvd2VyID0gY29tcG9uZW50TmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAoYykgPT4gYy5ncm91cCAmJiBjLmdyb3VwLnRvTG93ZXJDYXNlKCkgPT09IG5hbWVMb3dlcixcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50IG9yIGdyb3VwIGZvdW5kIGZvciBcIiR7Y29tcG9uZW50TmFtZX1cIi5gKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICAgICAgQ29tcG9uZW50IGZldGNoOiAke2NvbXBvbmVudEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBjb21wb25lbnRFcnJvci5tZXNzYWdlIDogY29tcG9uZW50RXJyb3J9YCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID1cbiAgICAgICAgICBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KG5hbWVMb3dlcikgPz8gZ3JvdXBNYXRjaGVzWzBdLmdyb3VwO1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiBQbGVhc2Ugc3BlY2lmeSBhIGNvbXBvbmVudCBuYW1lLCBncm91cCBuYW1lLCB1c2UgLS1hbGwgZmxhZywgLS10aGVtZSBmbGFnLCBvciAtLXZhbGlkYXRlLWFsbCBmbGFnJyk7XG4gICAgICBjb25zb2xlLmxvZygnXFxuVXNhZ2U6Jyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiAgIENvbXBpbGUgb25lIGNvbXBvbmVudCAoZS5nLiBoZXJvLWFydGljbGUpJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGdyb3VwLW5hbWU+ICAgICAgT3IgY29tcGlsZSBhIG1lcmdlZCBncm91cCAoZS5nLiBoZXJvKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS10aGVtZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdmFsaWRhdGUgaGVyby1hcnRpY2xlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLWFsbCAtLWZvcmNlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgaGVybyAtLWFwaS11cmwgaHR0cDovL2xvY2FsaG9zdDo0MDAwIC0tb3V0cHV0IC4vYmxvY2tzJyk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9KTtcblxucHJvZ3JhbS5wYXJzZSgpO1xuXG5leHBvcnQgeyBjb21waWxlLCBnZW5lcmF0ZUJsb2NrLCBodHRwRmV0Y2hDb21wb25lbnQgYXMgZmV0Y2hDb21wb25lbnQgfTtcbiJdfQ==