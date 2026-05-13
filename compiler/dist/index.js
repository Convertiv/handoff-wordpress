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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgseUNBQW9DO0FBQ3BDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsNkNBQStCO0FBQy9CLDJDQUE2QjtBQUM3Qix3REFBZ0M7QUFDaEMsbURBQXFDO0FBQ3JDLGlEQUF5QztBQUV6QyxtQ0FBZ1M7QUEyQmhTOztHQUVHO0FBQ0gsTUFBTSxjQUFjLEdBQW1CO0lBQ3JDLE1BQU0sRUFBRSx1QkFBdUI7SUFDL0IsTUFBTSxFQUFFLFVBQVU7SUFDbEIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtJQUMxQixNQUFNLEVBQUUsRUFBRTtDQUNYLENBQUM7QUFFRjs7O0dBR0c7QUFDSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsYUFBaUQsRUFBZ0IsRUFBRTtJQUMvRixNQUFNLFlBQVksR0FBaUIsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDdEQsTUFBTSxXQUFXLEdBQTBDLEVBQUUsQ0FBQztJQUU5RCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztZQUFFLFNBQVM7UUFDOUIsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUM7WUFBRSxTQUFTO1FBQzlCLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxT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RyxDQUFDO1FBQzFDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQztZQUFFLFFBQVEsR0FBRyxHQUFHLEdBQUcsUUFBUSxDQUFDO0lBQzNELENBQUM7SUFDRCxJQUFJLFVBQVUsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM5QyxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQztJQUNuQyxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUNyQyxNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNyQyxDQUFDO0lBQ0QsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDckMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3BELE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDckMsQ0FBQztJQUNELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDckMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVELE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFB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Q0FBQyxVQUFVLENBQUMsQ0FBQztRQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLHNGQUFzRixDQUFDLENBQUM7UUFDcEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpRkFBaUYsQ0FBQyxDQUFDO1FBQy9GLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO1FBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUN0RCxPQUFPLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnRkFBZ0YsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDO0FBRUwsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuLyoqXG4gKiBHdXRlbmJlcmcgQ29tcGlsZXJcbiAqIFxuICogVHJhbnNwaWxlcyBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MuXG4gKiBcbiAqIFVzYWdlOlxuICogICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiBbb3B0aW9uc11cbiAqICAgXG4gKiBPcHRpb25zOlxuICogICAtLWFwaS11cmwgPHVybD4gICAgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6IGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMClcbiAqICAgLS1vdXRwdXQgPGRpcj4gICAgIE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogLi9ibG9ja3MpXG4gKiAgIC0tYWxsICAgICAgICAgICAgICBDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50c1xuICogICAtLXRoZW1lICAgICAgICAgICAgQ29tcGlsZSBoZWFkZXIvZm9vdGVyIHRvIHRoZW1lIHRlbXBsYXRlc1xuICogICAtLXZhbGlkYXRlICAgICAgICAgVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqICAgLS12YWxpZGF0ZS1hbGwgICAgIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiAgIC0tc291cmNlIDxkaXI+ICAgICBSZWFkIEhhbmRvZmYgQVBJIEpTT04gZnJvbSBkaXNrIChlLmcuIC4vc3JjL2hhbmRvZmYvcHVibGljL2FwaSlcbiAqICAgLS13YXRjaCAgICAgICAgICAgIFdhdGNoIC0tc291cmNlIGZvciBjaGFuZ2VzIChyZXF1aXJlcyAtLXNvdXJjZSlcbiAqIFxuICogQ29uZmlndXJhdGlvbjpcbiAqICAgQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHlvdXIgcHJvamVjdCByb290IHRvIHNldCBkZWZhdWx0czpcbiAqICAge1xuICogICAgIFwiYXBpVXJsXCI6IFwiaHR0cHM6Ly9kZW1vLmhhbmRvZmYuY29tXCIsXG4gKiAgICAgXCJvdXRwdXRcIjogXCIuL3BhdGgvdG8vYmxvY2tzXCIsXG4gKiAgICAgXCJ0aGVtZURpclwiOiBcIi4vcGF0aC90by90aGVtZVwiXG4gKiAgIH1cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IGNob2tpZGFyIGZyb20gJ2Nob2tpZGFyJztcbmltcG9ydCAqIGFzIHByZXR0aWVyIGZyb20gJ3ByZXR0aWVyJztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgQ29tcGlsZXJPcHRpb25zLCBHZW5lcmF0ZWRCbG9jaywgSGFuZG9mZldwQ29uZmlnLCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRDb25maWcsIEltcG9ydENvbmZpZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnLCBGaWVsZFByZWZlcmVuY2VzLCBpc0R5bmFtaWNBcnJheUNvbmZpZyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIEF1dGggY3JlZGVudGlhbHMgZm9yIEhUVFAgcmVxdWVzdHNcbiAqL1xuaW50ZXJmYWNlIEF1dGhDcmVkZW50aWFscyB7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXF1aXJlZCBjb25maWcgd2l0aCBkZWZhdWx0cyBhcHBsaWVkXG4gKi9cbmludGVyZmFjZSBSZXNvbHZlZENvbmZpZyB7XG4gIGFwaVVybDogc3RyaW5nO1xuICBvdXRwdXQ6IHN0cmluZztcbiAgdGhlbWVEaXI6IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBpbXBvcnQ6IEltcG9ydENvbmZpZztcbiAgZ3JvdXBzOiBSZWNvcmQ8c3RyaW5nLCAnbWVyZ2VkJyB8ICdpbmRpdmlkdWFsJz47XG4gIHNjaGVtYU1pZ3JhdGlvbnM/OiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCB7XG4gICAgcmVuYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgdHJhbnNmb3Jtcz86IFJlY29yZDxzdHJpbmcsIHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nOyBydWxlOiBzdHJpbmcgfT47XG4gIH0+Pjtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gKi9cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBSZXNvbHZlZENvbmZpZyA9IHtcbiAgYXBpVXJsOiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJyxcbiAgb3V0cHV0OiAnLi9ibG9ja3MnLFxuICB0aGVtZURpcjogJy4vdGhlbWUnLFxuICB1c2VybmFtZTogdW5kZWZpbmVkLFxuICBwYXNzd29yZDogdW5kZWZpbmVkLFxuICBpbXBvcnQ6IHsgZWxlbWVudDogZmFsc2UgfSxcbiAgZ3JvdXBzOiB7fSxcbn07XG5cbi8qKlxuICogTWlncmF0ZSBsZWdhY3kgYGR5bmFtaWNBcnJheXNgIGNvbmZpZyB0byB0aGUgbmV3IGBpbXBvcnRgIHN0cnVjdHVyZS5cbiAqIEdyb3VwcyBcImNvbXBvbmVudElkLmZpZWxkTmFtZVwiIGVudHJpZXMgdW5kZXIgaW1wb3J0LmJsb2NrW2NvbXBvbmVudElkXVtmaWVsZE5hbWVdLlxuICovXG5jb25zdCBtaWdyYXRlRHluYW1pY0FycmF5cyA9IChkeW5hbWljQXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KTogSW1wb3J0Q29uZmlnID0+IHtcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSB7IGVsZW1lbnQ6IGZhbHNlIH07XG4gIGNvbnN0IGJsb2NrQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+ID0ge307XG5cbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCFjb25maWcuZW5hYmxlZCkgY29udGludWU7XG4gICAgY29uc3QgZG90SW5kZXggPSBrZXkuaW5kZXhPZignLicpO1xuICAgIGlmIChkb3RJbmRleCA9PT0gLTEpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGNvbXBvbmVudElkID0ga2V5LnN1YnN0cmluZygwLCBkb3RJbmRleCk7XG4gICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZyhkb3RJbmRleCArIDEpO1xuXG4gICAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPSB7fTtcbiAgICB9XG4gICAgKGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWc+KVtmaWVsZE5hbWVdID0gY29uZmlnO1xuICB9XG5cbiAgaWYgKE9iamVjdC5rZXlzKGJsb2NrQ29uZmlnKS5sZW5ndGggPiAwKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0gYmxvY2tDb25maWc7XG4gIH1cblxuICByZXR1cm4gaW1wb3J0Q29uZmlnO1xufTtcblxuLyoqXG4gKiBMb2FkIGNvbmZpZ3VyYXRpb24gZnJvbSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGlmIGl0IGV4aXN0c1xuICovXG5jb25zdCBsb2FkQ29uZmlnID0gKCk6IEhhbmRvZmZXcENvbmZpZyA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoY29uZmlnUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNvbmZpZ0NvbnRlbnQpIGFzIEhhbmRvZmZXcENvbmZpZztcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OEIExvYWRlZCBjb25maWcgZnJvbSAke2NvbmZpZ1BhdGh9YCk7XG4gICAgICByZXR1cm4gY29uZmlnO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgRmFpbGVkIHRvIHBhcnNlIGhhbmRvZmYtd3AuY29uZmlnLmpzb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiB7fTtcbn07XG5cbi8qKlxuICogTWVyZ2UgY29uZmlndXJhdGlvbiBzb3VyY2VzIHdpdGggcHJpb3JpdHk6IENMSSA+IGNvbmZpZyBmaWxlID4gZGVmYXVsdHNcbiAqL1xuY29uc3QgZ2V0Q29uZmlnID0gKCk6IFJlc29sdmVkQ29uZmlnID0+IHtcbiAgY29uc3QgZmlsZUNvbmZpZyA9IGxvYWRDb25maWcoKTtcblxuICBsZXQgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWc7XG4gIGlmIChmaWxlQ29uZmlnLmltcG9ydCkge1xuICAgIGltcG9ydENvbmZpZyA9IGZpbGVDb25maWcuaW1wb3J0O1xuICB9IGVsc2UgaWYgKGZpbGVDb25maWcuZHluYW1pY0FycmF5cykge1xuICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBcImR5bmFtaWNBcnJheXNcIiBjb25maWcgaXMgZGVwcmVjYXRlZC4gTWlncmF0ZSB0byBcImltcG9ydFwiIOKAlCBzZWUgU1BFQ0lGSUNBVElPTi5tZC5gKTtcbiAgICBpbXBvcnRDb25maWcgPSBtaWdyYXRlRHluYW1pY0FycmF5cyhmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpO1xuICB9IGVsc2Uge1xuICAgIGltcG9ydENvbmZpZyA9IERFRkFVTFRfQ09ORklHLmltcG9ydDtcbiAgfVxuICBcbiAgcmV0dXJuIHtcbiAgICBhcGlVcmw6IGZpbGVDb25maWcuYXBpVXJsID8/IERFRkFVTFRfQ09ORklHLmFwaVVybCxcbiAgICBvdXRwdXQ6IGZpbGVDb25maWcub3V0cHV0ID8/IERFRkFVTFRfQ09ORklHLm91dHB1dCxcbiAgICB0aGVtZURpcjogZmlsZUNvbmZpZy50aGVtZURpciA/PyBERUZBVUxUX0NPTkZJRy50aGVtZURpcixcbiAgICB1c2VybmFtZTogZmlsZUNvbmZpZy51c2VybmFtZSA/PyBERUZBVUxUX0NPTkZJRy51c2VybmFtZSxcbiAgICBwYXNzd29yZDogZmlsZUNvbmZpZy5wYXNzd29yZCA/PyBERUZBVUxUX0NPTkZJRy5wYXNzd29yZCxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgICBncm91cHM6IGZpbGVDb25maWcuZ3JvdXBzID8/IERFRkFVTFRfQ09ORklHLmdyb3VwcyxcbiAgICBzY2hlbWFNaWdyYXRpb25zOiBmaWxlQ29uZmlnLnNjaGVtYU1pZ3JhdGlvbnMsXG4gIH07XG59O1xuXG5cbi8qKlxuICogQnVpbGQgSFRUUCByZXF1ZXN0IG9wdGlvbnMgd2l0aCBvcHRpb25hbCBiYXNpYyBhdXRoXG4gKi9cbmNvbnN0IGJ1aWxkUmVxdWVzdE9wdGlvbnMgPSAodXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBodHRwLlJlcXVlc3RPcHRpb25zIHwgaHR0cHMuUmVxdWVzdE9wdGlvbnMgPT4ge1xuICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKHVybCk7XG4gIGNvbnN0IG9wdGlvbnM6IGh0dHAuUmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICBwb3J0OiBwYXJzZWRVcmwucG9ydCB8fCAocGFyc2VkVXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/IDQ0MyA6IDgwKSxcbiAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgaGVhZGVyczoge30sXG4gIH07XG4gIFxuICBpZiAoYXV0aD8udXNlcm5hbWUgJiYgYXV0aD8ucGFzc3dvcmQpIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IEJ1ZmZlci5mcm9tKGAke2F1dGgudXNlcm5hbWV9OiR7YXV0aC5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0ge1xuICAgICAgLi4ub3B0aW9ucy5oZWFkZXJzLFxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmFzaWMgJHtjcmVkZW50aWFsc31gLFxuICAgIH07XG4gIH1cbiAgXG4gIHJldHVybiBvcHRpb25zO1xufTtcblxuLy8gTG9hZCBjb25maWcgYXQgc3RhcnR1cFxuY29uc3QgY29uZmlnID0gZ2V0Q29uZmlnKCk7XG5pbXBvcnQge1xuICBnZW5lcmF0ZUJsb2NrSnNvbixcbiAgZ2VuZXJhdGVJbmRleEpzLFxuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgZ2VuZXJhdGVFZGl0b3JTY3NzLFxuICBnZW5lcmF0ZVN0eWxlU2NzcyxcbiAgZ2VuZXJhdGVSZWFkbWUsXG4gIHRvQmxvY2tOYW1lLFxuICBnZW5lcmF0ZUhlYWRlclBocCxcbiAgZ2VuZXJhdGVGb290ZXJQaHAsXG4gIGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwLFxuICBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAsXG4gIGdlbmVyYXRlU2hhcmVkQ29tcG9uZW50cyxcbiAgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsXG4gIGdlbmVyYXRlTWVyZ2VkQmxvY2ssXG4gIGdlbmVyYXRlRGVwcmVjYXRpb25zLFxuICBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyxcbn0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB0eXBlIHsgVmFyaWFudEluZm8gfSBmcm9tICcuL2dlbmVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgbG9hZE1hbmlmZXN0LFxuICBzYXZlTWFuaWZlc3QsXG4gIHZhbGlkYXRlQ29tcG9uZW50LFxuICB1cGRhdGVNYW5pZmVzdCxcbiAgZ2V0Q29tcG9uZW50SGlzdG9yeSxcbiAgZXh0cmFjdFByb3BlcnRpZXMsXG4gIGZvcm1hdFZhbGlkYXRpb25SZXN1bHQsXG4gIFZhbGlkYXRpb25SZXN1bHQsXG4gIHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMsXG4gIGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdFxufSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFIaXN0b3J5IH0gZnJvbSAnLi92YWxpZGF0b3JzJztcblxuLy8gTG9hZCBQSFAgcGx1Z2luIGZvciBQcmV0dGllciAodXNpbmcgcmVxdWlyZSBmb3IgY29tcGF0aWJpbGl0eSlcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG5jb25zdCBwaHBQbHVnaW4gPSByZXF1aXJlKCdAcHJldHRpZXIvcGx1Z2luLXBocCcpO1xuXG4vKipcbiAqIEZvcm1hdCBjb2RlIHdpdGggUHJldHRpZXJcbiAqL1xuY29uc3QgZm9ybWF0Q29kZSA9IGFzeW5jIChjb2RlOiBzdHJpbmcsIHBhcnNlcjogJ2JhYmVsJyB8ICdqc29uJyB8ICdzY3NzJyB8ICdwaHAnKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBvcHRpb25zOiBwcmV0dGllci5PcHRpb25zID0ge1xuICAgICAgcGFyc2VyLFxuICAgICAgc2luZ2xlUXVvdGU6IHRydWUsXG4gICAgICB0YWJXaWR0aDogMixcbiAgICAgIHByaW50V2lkdGg6IDEwMCxcbiAgICAgIHRyYWlsaW5nQ29tbWE6ICdlczUnLFxuICAgIH07XG4gICAgXG4gICAgLy8gTG9hZCBQSFAgcGx1Z2luIGZvciBQSFAgZmlsZXNcbiAgICBpZiAocGFyc2VyID09PSAncGhwJykge1xuICAgICAgb3B0aW9ucy5wbHVnaW5zID0gW3BocFBsdWdpbl07XG4gICAgICAvLyBQSFAtc3BlY2lmaWMgb3B0aW9ucyAtIGNhc3QgdG8gYW55IGZvciBwbHVnaW4tc3BlY2lmaWMgb3B0aW9uc1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5waHBWZXJzaW9uID0gJzguMCc7XG4gICAgICAob3B0aW9ucyBhcyBhbnkpLmJyYWNlU3R5bGUgPSAnMXRicyc7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBhd2FpdCBwcmV0dGllci5mb3JtYXQoY29kZSwgb3B0aW9ucyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSWYgZm9ybWF0dGluZyBmYWlscywgcmV0dXJuIG9yaWdpbmFsIGNvZGVcbiAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgUHJldHRpZXIgZm9ybWF0dGluZyBmYWlsZWQgZm9yICR7cGFyc2VyfSwgdXNpbmcgdW5mb3JtYXR0ZWQgY29kZWApO1xuICAgIHJldHVybiBjb2RlO1xuICB9XG59O1xuXG5jb25zdCBwcm9ncmFtID0gbmV3IENvbW1hbmQoKTtcblxuLyoqXG4gKiBSZWN1cnNpdmVseSBjb3B5IGEgZGlyZWN0b3J5IHRyZWUsIGNyZWF0aW5nIHRhcmdldCBkaXJzIGFzIG5lZWRlZC5cbiAqL1xuY29uc3QgY29weURpclJlY3Vyc2l2ZSA9IChzcmM6IHN0cmluZywgZGVzdDogc3RyaW5nKTogdm9pZCA9PiB7XG4gIGlmICghZnMuZXhpc3RzU3luYyhkZXN0KSkge1xuICAgIGZzLm1rZGlyU3luYyhkZXN0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBmb3IgKGNvbnN0IGVudHJ5IG9mIGZzLnJlYWRkaXJTeW5jKHNyYykpIHtcbiAgICBjb25zdCBzcmNQYXRoID0gcGF0aC5qb2luKHNyYywgZW50cnkpO1xuICAgIGNvbnN0IGRlc3RQYXRoID0gcGF0aC5qb2luKGRlc3QsIGVudHJ5KTtcbiAgICBpZiAoZnMuc3RhdFN5bmMoc3JjUGF0aCkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgY29weURpclJlY3Vyc2l2ZShzcmNQYXRoLCBkZXN0UGF0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZzLmNvcHlGaWxlU3luYyhzcmNQYXRoLCBkZXN0UGF0aCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGEgcGFja2FnZS5qc29uIGluIHRoZSBjb250ZW50IGRpcmVjdG9yeSBhbmQgcnVuIG5wbSBpbnN0YWxsXG4gKiBzbyB0aGF0IGJsb2NrcyBhbmQgc2hhcmVkIGNvbXBvbmVudHMgY2FuIHJlc29sdmUgdGhlaXIgaW1wb3J0cy5cbiAqL1xuY29uc3QgZW5zdXJlQ29udGVudERlcGVuZGVuY2llcyA9IChjb250ZW50Um9vdDogc3RyaW5nKTogdm9pZCA9PiB7XG4gIGNvbnN0IHBrZ1BhdGggPSBwYXRoLmpvaW4oY29udGVudFJvb3QsICdwYWNrYWdlLmpzb24nKTtcblxuICBjb25zdCBwa2cgPSB7XG4gICAgbmFtZTogJ2hhbmRvZmYtYmxvY2tzLWNvbnRlbnQnLFxuICAgIHZlcnNpb246ICcxLjAuMCcsXG4gICAgcHJpdmF0ZTogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0F1dG8tZ2VuZXJhdGVkIGJ5IEhhbmRvZmYgY29tcGlsZXIg4oCUIGJsb2NrIGJ1aWxkIGRlcGVuZGVuY2llcy4nLFxuICAgIGRlcGVuZGVuY2llczoge1xuICAgICAgJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnOiAnXjEuMjIuMScsXG4gICAgfSxcbiAgICBkZXZEZXBlbmRlbmNpZXM6IHtcbiAgICAgICdAd29yZHByZXNzL2FwaS1mZXRjaCc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2Jsb2Nrcyc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2NvbXBvbmVudHMnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9kYXRhJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvZWxlbWVudCc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2kxOG4nOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9pY29ucyc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL3NjcmlwdHMnOiAnXjI3LjAuMCcsXG4gICAgICAnY29weS13ZWJwYWNrLXBsdWdpbic6ICdeMTEuMC4wJyxcbiAgICB9LFxuICB9O1xuXG4gIGNvbnN0IGRlc2lyZWQgPSBKU09OLnN0cmluZ2lmeShwa2csIG51bGwsIDIpICsgJ1xcbic7XG5cbiAgbGV0IG5lZWRzSW5zdGFsbCA9IHRydWU7XG4gIGlmIChmcy5leGlzdHNTeW5jKHBrZ1BhdGgpKSB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSBmcy5yZWFkRmlsZVN5bmMocGtnUGF0aCwgJ3V0ZjgnKTtcbiAgICBpZiAoZXhpc3RpbmcgPT09IGRlc2lyZWQpIHtcbiAgICAgIG5lZWRzSW5zdGFsbCA9ICFmcy5leGlzdHNTeW5jKHBhdGguam9pbihjb250ZW50Um9vdCwgJ25vZGVfbW9kdWxlcycpKTtcbiAgICB9XG4gIH1cblxuICBpZiAobmVlZHNJbnN0YWxsKSB7XG4gICAgY29uc29sZS5sb2coYFxcbvCfk6YgSW5zdGFsbGluZyBibG9jayBidWlsZCBkZXBlbmRlbmNpZXMuLi5gKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHBrZ1BhdGgsIGRlc2lyZWQpO1xuICAgIHRyeSB7XG4gICAgICBleGVjU3luYygnbnBtIGluc3RhbGwgLS1pZ25vcmUtc2NyaXB0cycsIHtcbiAgICAgICAgY3dkOiBjb250ZW50Um9vdCxcbiAgICAgICAgc3RkaW86ICdpbmhlcml0JyxcbiAgICAgIH0pO1xuICAgICAgY29uc29sZS5sb2coYOKchSBEZXBlbmRlbmNpZXMgaW5zdGFsbGVkIGluICR7Y29udGVudFJvb3R9YCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgbnBtIGluc3RhbGwgZmFpbGVkIOKAlCB5b3UgbWF5IG5lZWQgdG8gcnVuIGl0IG1hbnVhbGx5IGluICR7Y29udGVudFJvb3R9YCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OmIEJsb2NrIGJ1aWxkIGRlcGVuZGVuY2llcyBhbHJlYWR5IHVwIHRvIGRhdGVgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBEb3dubG9hZCBhIGZpbGUgZnJvbSBhIFVSTCBhbmQgc2F2ZSBpdCB0byBkaXNrIChIVFRQIG9ubHkpXG4gKi9cbmNvbnN0IGh0dHBEb3dubG9hZEZpbGUgPSBhc3luYyAodXJsOiBzdHJpbmcsIGRlc3RQYXRoOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICAvLyBIYW5kbGUgcmVkaXJlY3RzXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDMwMSB8fCByZXMuc3RhdHVzQ29kZSA9PT0gMzAyKSB7XG4gICAgICAgIGNvbnN0IHJlZGlyZWN0VXJsID0gcmVzLmhlYWRlcnMubG9jYXRpb247XG4gICAgICAgIGlmIChyZWRpcmVjdFVybCkge1xuICAgICAgICAgIGh0dHBEb3dubG9hZEZpbGUocmVkaXJlY3RVcmwsIGRlc3RQYXRoLCBhdXRoKS50aGVuKHJlc29sdmUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgZmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKGRlc3RQYXRoKTtcbiAgICAgIHJlcy5waXBlKGZpbGVTdHJlYW0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdmaW5pc2gnLCAoKSA9PiB7XG4gICAgICAgIGZpbGVTdHJlYW0uY2xvc2UoKTtcbiAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBmaWxlU3RyZWFtLm9uKCdlcnJvcicsIChlcnIpID0+IHtcbiAgICAgICAgZnMudW5saW5rKGRlc3RQYXRoLCAoKSA9PiB7fSk7IC8vIENsZWFuIHVwIHBhcnRpYWwgZmlsZVxuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIHNhdmUgc2NyZWVuc2hvdDogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBkb3dubG9hZCBzY3JlZW5zaG90OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogRmV0Y2ggY29tcG9uZW50IGRhdGEgZnJvbSBIYW5kb2ZmIEFQSSAoSFRUUCBvbmx5KVxuICovXG5jb25zdCBodHRwRmV0Y2hDb21wb25lbnQgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGNvbXBvbmVudE5hbWU6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudD4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnQvJHtjb21wb25lbnROYW1lfS5qc29uYDtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQ6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gSlNPTi5wYXJzZShkYXRhKSBhcyBIYW5kb2ZmQ29tcG9uZW50O1xuICAgICAgICAgIHJlc29sdmUoY29tcG9uZW50KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBjb21wb25lbnQgSlNPTjogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQ6ICR7ZS5tZXNzYWdlfWApKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFsbCBibG9jayBmaWxlcyBmcm9tIGEgY29tcG9uZW50XG4gKiBAcGFyYW0gY29tcG9uZW50IC0gVGhlIEhhbmRvZmYgY29tcG9uZW50IGRhdGFcbiAqIEBwYXJhbSBhcGlVcmwgLSBUaGUgYmFzZSBBUEkgVVJMIGZvciBmZXRjaGluZyBzY3JlZW5zaG90c1xuICogQHBhcmFtIHJlc29sdmVkQ29uZmlnIC0gVGhlIHJlc29sdmVkIGNvbmZpZ3VyYXRpb24gaW5jbHVkaW5nIGR5bmFtaWMgYXJyYXkgc2V0dGluZ3NcbiAqL1xuY29uc3QgZ2VuZXJhdGVCbG9jayA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsIGFwaVVybDogc3RyaW5nLCByZXNvbHZlZENvbmZpZzogUmVzb2x2ZWRDb25maWcsIHNjaGVtYUhpc3Rvcnk/OiBTY2hlbWFIaXN0b3J5KTogR2VuZXJhdGVkQmxvY2sgPT4ge1xuICBjb25zdCBoYXNTY3JlZW5zaG90ID0gISFjb21wb25lbnQuaW1hZ2U7XG4gIFxuICAvLyBDb25zdHJ1Y3QgZnVsbCBzY3JlZW5zaG90IFVSTCBpZiBpbWFnZSBwYXRoIGlzIGF2YWlsYWJsZVxuICBsZXQgc2NyZWVuc2hvdFVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBpZiAoY29tcG9uZW50LmltYWdlKSB7XG4gICAgLy8gSGFuZGxlIGJvdGggYWJzb2x1dGUgVVJMcyBhbmQgcmVsYXRpdmUgcGF0aHNcbiAgICBpZiAoY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCBjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgc2NyZWVuc2hvdFVybCA9IGNvbXBvbmVudC5pbWFnZTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUmVsYXRpdmUgcGF0aCAtIHByZXBlbmQgQVBJIFVSTFxuICAgICAgc2NyZWVuc2hvdFVybCA9IGAke2FwaVVybH0ke2NvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCcvJykgPyAnJyA6ICcvJ30ke2NvbXBvbmVudC5pbWFnZX1gO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gRXh0cmFjdCBkeW5hbWljIGFycmF5IGNvbmZpZ3MgZm9yIHRoaXMgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWdcbiAgY29uc3QgY29tcG9uZW50RHluYW1pY0FycmF5cyA9IHtcbiAgICAuLi5leHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpXG4gIH07XG4gIFxuICAvLyBBdXRvLWRldGVjdCBwYWdpbmF0aW9uIGZvciBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBlbnRyaWVzIG9ubHlcbiAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudER5bmFtaWNBcnJheXMpKSB7XG4gICAgaWYgKCdhcnJheVR5cGUnIGluIGR5bkNvbmZpZykgY29udGludWU7IC8vIFNraXAgc3BlY2lhbGlzZWQgYXJyYXkgdHlwZXNcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICBpZiAocHJvcD8udHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24/LnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgY29uc3QgcGFnaW5hdGlvbkZpZWxkUmVnZXggPSBuZXcgUmVnRXhwKFxuICAgICAgICBgXFxcXHtcXFxce1xcXFxzKiNmaWVsZFxcXFxzK1tcIiddJHtmaWVsZE5hbWV9XFxcXC5wYWdpbmF0aW9uW1wiJ11gXG4gICAgICApO1xuICAgICAgaWYgKHBhZ2luYXRpb25GaWVsZFJlZ2V4LnRlc3QoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgICAgIChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uID0geyBwcm9wZXJ0eU5hbWU6ICdwYWdpbmF0aW9uJyB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIERldGVybWluZSB3aGljaCByaWNodGV4dCBmaWVsZCAoaWYgYW55KSB1c2VzIElubmVyQmxvY2tzXG4gIGNvbnN0IGZpZWxkUHJlZnMgPSBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpO1xuICBjb25zdCByaWNodGV4dEZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgLy8gQ2hlY2sgZXhwbGljaXQgY29uZmlnIG92ZXJyaWRlcyBmaXJzdFxuICBjb25zdCBleHBsaWNpdElubmVyQmxvY2tzID0gT2JqZWN0LmVudHJpZXMoZmllbGRQcmVmcylcbiAgICAuZmlsdGVyKChbLCBwcmVmc10pID0+IHByZWZzLmlubmVyQmxvY2tzID09PSB0cnVlKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGxldCBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBvbmx5IG9uZSByaWNodGV4dCBmaWVsZCBwZXIgYmxvY2sgY2FuIHVzZSBJbm5lckJsb2NrcywgYCArXG4gICAgICBgYnV0ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGh9IGFyZSBtYXJrZWQ6ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5qb2luKCcsICcpfWBcbiAgICApO1xuICB9IGVsc2UgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgZmllbGQgPSBleHBsaWNpdElubmVyQmxvY2tzWzBdO1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZF07XG4gICAgaWYgKCFwcm9wIHx8IHByb3AudHlwZSAhPT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IGZpZWxkIFwiJHtmaWVsZH1cIiBpcyBtYXJrZWQgYXMgaW5uZXJCbG9ja3MgYnV0IGlzIG5vdCBhIHJpY2h0ZXh0IGZpZWxkYFxuICAgICAgKTtcbiAgICB9XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IGZpZWxkO1xuICB9IGVsc2UgaWYgKHJpY2h0ZXh0RmllbGRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSByaWNodGV4dEZpZWxkc1swXTtcbiAgfSBlbHNlIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gbnVsbDtcbiAgfVxuICBcbiAgY29uc3QgaGlzdG9yeUVudHJ5ID0gc2NoZW1hSGlzdG9yeSA/IGdldENvbXBvbmVudEhpc3Rvcnkoc2NoZW1hSGlzdG9yeSwgY29tcG9uZW50LmlkKSA6IHVuZGVmaW5lZDtcbiAgY29uc3QgY3VycmVudFByb3BzID0gZXh0cmFjdFByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICBjb25zdCBtaWdyYXRpb25PdmVycmlkZXMgPSByZXNvbHZlZENvbmZpZy5zY2hlbWFNaWdyYXRpb25zPy5bY29tcG9uZW50LmlkXTtcbiAgY29uc3QgZGVwcmVjYXRpb25zQ29kZSA9IGdlbmVyYXRlRGVwcmVjYXRpb25zKFxuICAgIGhpc3RvcnlFbnRyeSxcbiAgICBjdXJyZW50UHJvcHMsXG4gICAgbWlncmF0aW9uT3ZlcnJpZGVzLFxuICAgICEhaW5uZXJCbG9ja3NGaWVsZFxuICApO1xuXG4gIHJldHVybiB7XG4gICAgYmxvY2tKc29uOiBnZW5lcmF0ZUJsb2NrSnNvbihjb21wb25lbnQsIGhhc1NjcmVlbnNob3QsIGFwaVVybCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgaW5kZXhKczogZ2VuZXJhdGVJbmRleEpzKGNvbXBvbmVudCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCwgZGVwcmVjYXRpb25zQ29kZSwgaGFzU2NyZWVuc2hvdCksXG4gICAgcmVuZGVyUGhwOiBnZW5lcmF0ZVJlbmRlclBocChjb21wb25lbnQsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQpLFxuICAgIGVkaXRvclNjc3M6IGdlbmVyYXRlRWRpdG9yU2Nzcyhjb21wb25lbnQpLFxuICAgIHN0eWxlU2NzczogZ2VuZXJhdGVTdHlsZVNjc3MoY29tcG9uZW50KSxcbiAgICByZWFkbWU6IGdlbmVyYXRlUmVhZG1lKGNvbXBvbmVudCksXG4gICAgbWlncmF0aW9uU2NoZW1hOiBnZW5lcmF0ZU1pZ3JhdGlvblNjaGVtYShjb21wb25lbnQpLFxuICAgIHNjaGVtYUNoYW5nZWxvZzogZ2VuZXJhdGVTY2hlbWFDaGFuZ2Vsb2coY29tcG9uZW50LmlkLCBoaXN0b3J5RW50cnkpLFxuICAgIHNjcmVlbnNob3RVcmxcbiAgfTtcbn07XG5cbi8qKlxuICogV3JpdGUgYmxvY2sgZmlsZXMgdG8gb3V0cHV0IGRpcmVjdG9yeVxuICovXG5jb25zdCB3cml0ZUJsb2NrRmlsZXMgPSBhc3luYyAoXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBibG9jazogR2VuZXJhdGVkQmxvY2ssXG4gIGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IHRvQmxvY2tOYW1lKGNvbXBvbmVudElkKTtcbiAgY29uc3QgYmxvY2tEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBibG9ja05hbWUpO1xuICBcbiAgLy8gQ3JlYXRlIGJsb2NrIGRpcmVjdG9yeVxuICBpZiAoIWZzLmV4aXN0c1N5bmMoYmxvY2tEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGJsb2NrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuICBcbiAgLy8gRm9ybWF0IGFsbCBjb2RlIGZpbGVzIHdpdGggUHJldHRpZXJcbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShibG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgXG4gIC8vIFdyaXRlIGZpbGVzXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnYmxvY2suanNvbicpLCBmb3JtYXR0ZWRCbG9ja0pzb24pO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2luZGV4LmpzJyksIGZvcm1hdHRlZEluZGV4SnMpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3JlbmRlci5waHAnKSwgZm9ybWF0dGVkUmVuZGVyUGhwKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdlZGl0b3Iuc2NzcycpLCBmb3JtYXR0ZWRFZGl0b3JTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdzdHlsZS5zY3NzJyksIGZvcm1hdHRlZFN0eWxlU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnUkVBRE1FLm1kJyksIGJsb2NrLnJlYWRtZSk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnbWlncmF0aW9uLXNjaGVtYS5qc29uJyksIGJsb2NrLm1pZ3JhdGlvblNjaGVtYSk7XG4gIGlmIChibG9jay5zY2hlbWFDaGFuZ2Vsb2cpIHtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3NjaGVtYS1jaGFuZ2Vsb2cuanNvbicpLCBibG9jay5zY2hlbWFDaGFuZ2Vsb2cpO1xuICB9XG4gIFxuICAvLyBEb3dubG9hZCBzY3JlZW5zaG90IGlmIGF2YWlsYWJsZVxuICBsZXQgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBmYWxzZTtcbiAgaWYgKGJsb2NrLnNjcmVlbnNob3RVcmwpIHtcbiAgICBjb25zdCBzY3JlZW5zaG90UGF0aCA9IHBhdGguam9pbihibG9ja0RpciwgJ3NjcmVlbnNob3QucG5nJyk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfk7cgRG93bmxvYWRpbmcgc2NyZWVuc2hvdC4uLmApO1xuICAgIHNjcmVlbnNob3REb3dubG9hZGVkID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwgYmxvY2suc2NyZWVuc2hvdFVybCwgc2NyZWVuc2hvdFBhdGgpO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBibG9jazogJHtibG9ja05hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OBICR7YmxvY2tEaXJ9YCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGJsb2NrLmpzb25gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgaW5kZXguanNgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgcmVuZGVyLnBocGApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBlZGl0b3Iuc2Nzc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBzdHlsZS5zY3NzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIFJFQURNRS5tZGApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBtaWdyYXRpb24tc2NoZW1hLmpzb25gKTtcbiAgaWYgKHNjcmVlbnNob3REb3dubG9hZGVkKSB7XG4gICAgY29uc29sZS5sb2coYCAgIPCflrzvuI8gIHNjcmVlbnNob3QucG5nYCk7XG4gIH1cbn07XG5cbi8qKlxuICogTWFpbiBjb21waWxhdGlvbiBmdW5jdGlvblxuICovXG5jb25zdCBjb21waWxlID0gYXN5bmMgKG9wdGlvbnM6IENvbXBpbGVyT3B0aW9ucyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBkYXRhQ3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQgPSB7XG4gICAgYXBpVXJsOiBvcHRpb25zLmFwaVVybCxcbiAgICBhdXRoOiBvcHRpb25zLmF1dGgsXG4gICAgbG9jYWxBcGlSb290OiBvcHRpb25zLmxvY2FsQXBpUm9vdCxcbiAgfTtcblxuICBjb25zb2xlLmxvZyhgXFxu8J+UpyBHdXRlbmJlcmcgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtvcHRpb25zLmFwaVVybH1gKTtcbiAgaWYgKGRhdGFDdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtkYXRhQ3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7b3B0aW9ucy5jb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke29wdGlvbnMub3V0cHV0RGlyfWApO1xuICBpZiAob3B0aW9ucy5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke29wdGlvbnMuYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBmcm9tIEFQSVxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBkYXRhLi4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgb3B0aW9ucy5jb21wb25lbnROYW1lKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRlbXBsYXRlIHZhcmlhYmxlcyBiZWZvcmUgZ2VuZXJhdGluZ1xuICAgIGNvbnNvbGUubG9nKGDwn5SNIFZhbGlkYXRpbmcgdGVtcGxhdGUgdmFyaWFibGVzLi4uYCk7XG4gICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgXG4gICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgY29uc29sZS5lcnJvcihgXFxu4p2MIFRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkISBGaXggdGhlIHVuZGVmaW5lZCB2YXJpYWJsZXMgYmVmb3JlIGNvbXBpbGluZy5cXG5gKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgYmxvY2sgZmlsZXMgKHdpdGggZGVwcmVjYXRpb24gc3VwcG9ydCBmcm9tIHNjaGVtYSBoaXN0b3J5KVxuICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgR3V0ZW5iZXJnIGJsb2NrLi4uYCk7XG4gICAgY29uc3Qgc2NoZW1hSGlzdG9yeSA9IGxvYWRNYW5pZmVzdChvcHRpb25zLm91dHB1dERpcik7XG4gICAgY29uc3QgYmxvY2sgPSBnZW5lcmF0ZUJsb2NrKGNvbXBvbmVudCwgb3B0aW9ucy5hcGlVcmwsIGNvbmZpZywgc2NoZW1hSGlzdG9yeSk7XG4gICAgXG4gICAgLy8gV3JpdGUgZmlsZXMgKHdpdGggUHJldHRpZXIgZm9ybWF0dGluZylcbiAgICBhd2FpdCB3cml0ZUJsb2NrRmlsZXMob3B0aW9ucy5vdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIGRhdGFDdHgpO1xuXG4gICAgY29uc3QgY29udGVudFJvb3QgPSBwYXRoLnJlc29sdmUob3B0aW9ucy5vdXRwdXREaXIsICcuLicpO1xuICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoZGF0YUN0eCwgY29udGVudFJvb3QpO1xuXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBEb25lISBEb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgYSBjb21wb25lbnQgc2hvdWxkIGJlIGltcG9ydGVkIGJhc2VkIG9uIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBzaG91bGRJbXBvcnRDb21wb25lbnQgPSAoY29tcG9uZW50SWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCB0eXBlQ29uZmlnID0gaW1wb3J0Q29uZmlnW2NvbXBvbmVudFR5cGVdO1xuXG4gIC8vIFR5cGUgbm90IGxpc3RlZCBpbiBpbXBvcnQgY29uZmlnIOKAlCBkZWZhdWx0IHRvIHRydWUgKGltcG9ydClcbiAgaWYgKHR5cGVDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEVudGlyZSB0eXBlIGRpc2FibGVkXG4gIGlmICh0eXBlQ29uZmlnID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAvLyBFbnRpcmUgdHlwZSBlbmFibGVkIHdpdGggbm8gcGVyLWNvbXBvbmVudCBvdmVycmlkZXNcbiAgaWYgKHR5cGVDb25maWcgPT09IHRydWUpIHJldHVybiB0cnVlO1xuXG4gIC8vIFBlci1jb21wb25lbnQgbG9va3VwIHdpdGhpbiB0aGUgdHlwZSBvYmplY3RcbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIC8vIE5vdCBsaXN0ZWQg4oCUIGltcG9ydCB3aXRoIGRlZmF1bHRzICh0eXBlLW9iamVjdCBtZWFucyBcImltcG9ydCBhbGwsIG92ZXJyaWRlIGxpc3RlZFwiKVxuICBpZiAoY29tcG9uZW50Q29uZmlnID09PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAvLyBFeHBsaWNpdGx5IGRpc2FibGVkXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEV4cGxpY2l0bHkgZW5hYmxlZCBvciBoYXMgZmllbGQgb3ZlcnJpZGVzXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHJhdyBwZXItZmllbGQgY29uZmlnIG9iamVjdCBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZ2V0Q29tcG9uZW50RmllbGRDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG4gIGlmICghdHlwZUNvbmZpZyB8fCB0eXBlb2YgdHlwZUNvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIGlmICghY29tcG9uZW50Q29uZmlnIHx8IHR5cGVvZiBjb21wb25lbnRDb25maWcgPT09ICdib29sZWFuJykgcmV0dXJuIHt9O1xuXG4gIHJldHVybiBjb21wb25lbnRDb25maWcgYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgRmllbGRQcmVmZXJlbmNlcz47XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+ID0+IHtcbiAgY29uc3QgYWxsQ29uZmlncyA9IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyhjb21wb25lbnRJZCwgY29tcG9uZW50VHlwZSwgaW1wb3J0Q29uZmlnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKGlzRHluYW1pY0FycmF5Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gY29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGZpZWxkIHByZWZlcmVuY2VzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIEZpZWxkUHJlZmVyZW5jZXM+ID0ge307XG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhhbGxDb25maWdzKSkge1xuICAgIGlmICghaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEZldGNoIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEksIGZpbHRlcmVkIGJ5IGltcG9ydCBjb25maWcgKEhUVFAgb25seSlcbiAqL1xuY29uc3QgaHR0cEZldGNoQ29tcG9uZW50TGlzdCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudHMuanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50IGxpc3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IEpTT04ucGFyc2UoZGF0YSkgYXMgQXJyYXk8SGFuZG9mZkNvbXBvbmVudD47XG4gICAgICAgICAgY29uc3QgZmlsdGVyZWQgPSBjb21wb25lbnRzLmZpbHRlcihjID0+IHNob3VsZEltcG9ydENvbXBvbmVudChjLmlkLCBjLnR5cGUsIGltcG9ydENvbmZpZykpO1xuICAgICAgICAgIHJlc29sdmUoZmlsdGVyZWQubWFwKGMgPT4gYy5pZCkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBmdWxsIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEkgKG5vIGltcG9ydCBmaWx0ZXIpLiBVc2VkIHRvIHJlc29sdmUgZ3JvdXAgbmFtZXMgKEhUVFAgb25seSkuXG4gKi9cbmNvbnN0IGh0dHBGZXRjaEFsbENvbXBvbmVudHNMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50W10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudHMpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSkpO1xuICB9KTtcbn07XG5cbi8qKlxuICogRGF0YSBhY2Nlc3MgY29udGV4dDogSFRUUCBIYW5kb2ZmIEFQSSBvciBsb2NhbCBgcHVibGljL2FwaWAgZm9sZGVyICgtLXNvdXJjZSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSGFuZG9mZkRhdGFDb250ZXh0IHtcbiAgYXBpVXJsOiBzdHJpbmc7XG4gIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHM7XG4gIC8qKiBBYnNvbHV0ZSBwYXRoIHRvIEhhbmRvZmYgYHB1YmxpYy9hcGlgIChjb250YWlucyBgY29tcG9uZW50cy5qc29uYCArIGBjb21wb25lbnQvYCkgKi9cbiAgbG9jYWxBcGlSb290Pzogc3RyaW5nO1xufVxuXG5jb25zdCByZWFkTG9jYWxDb21wb25lbnRzSnNvbiA9IChsb2NhbEFwaVJvb3Q6IHN0cmluZyk6IEhhbmRvZmZDb21wb25lbnRbXSA9PiB7XG4gIGNvbnN0IHAgPSBwYXRoLmpvaW4obG9jYWxBcGlSb290LCAnY29tcG9uZW50cy5qc29uJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhwKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTG9jYWwgSGFuZG9mZiBBUEkgbWlzc2luZyBjb21wb25lbnRzIGxpc3Q6ICR7cH1gKTtcbiAgfVxuICByZXR1cm4gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMocCwgJ3V0Zi04JykpIGFzIEhhbmRvZmZDb21wb25lbnRbXTtcbn07XG5cbmNvbnN0IHJlc29sdmVVcmxUb0xvY2FsUGF0aCA9IChsb2NhbEFwaVJvb3Q6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgbGV0IHBhdGhuYW1lID0gJyc7XG4gIHRyeSB7XG4gICAgcGF0aG5hbWUgPSBuZXcgVVJMKHVybCkucGF0aG5hbWU7XG4gIH0gY2F0Y2gge1xuICAgIGNvbnN0IHEgPSB1cmwuaW5kZXhPZignPycpO1xuICAgIHBhdGhuYW1lID0gcSA+PSAwID8gdXJsLnNsaWNlKDAsIHEpIDogdXJsO1xuICAgIGlmICghcGF0aG5hbWUuc3RhcnRzV2l0aCgnLycpKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9XG4gIGxldCBub3JtYWxpemVkID0gcGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCAnJyk7XG4gIGNvbnN0IGFwaVByZWZpeCA9ICdhcGkvY29tcG9uZW50Lyc7XG4gIGlmIChub3JtYWxpemVkLnN0YXJ0c1dpdGgoYXBpUHJlZml4KSkge1xuICAgIGNvbnN0IHJlbCA9IG5vcm1hbGl6ZWQuc2xpY2UoYXBpUHJlZml4Lmxlbmd0aCk7XG4gICAgY29uc3QgcCA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCByZWwpO1xuICAgIHJldHVybiBmcy5leGlzdHNTeW5jKHApID8gcCA6IG51bGw7XG4gIH1cbiAgaWYgKG5vcm1hbGl6ZWQuc3RhcnRzV2l0aCgnaW1hZ2VzLycpKSB7XG4gICAgY29uc3QgcCA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICcuLicsIG5vcm1hbGl6ZWQpO1xuICAgIHJldHVybiBmcy5leGlzdHNTeW5jKHApID8gcCA6IG51bGw7XG4gIH1cbiAgY29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUocGF0aG5hbWUpO1xuICBjb25zdCBmYWxsYmFjayA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCBiYXNlKTtcbiAgcmV0dXJuIGZzLmV4aXN0c1N5bmMoZmFsbGJhY2spID8gZmFsbGJhY2sgOiBudWxsO1xufTtcblxuY29uc3QgY3R4RmV0Y2hDb21wb25lbnQgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudD4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmpvaW4oY3R4LmxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsIGAke2NvbXBvbmVudE5hbWV9Lmpzb25gKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTG9jYWwgY29tcG9uZW50IEpTT04gbm90IGZvdW5kOiAke2ZpbGV9YCk7XG4gICAgfVxuICAgIHJldHVybiBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhmaWxlLCAndXRmLTgnKSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgfVxuICByZXR1cm4gaHR0cEZldGNoQ29tcG9uZW50KGN0eC5hcGlVcmwsIGNvbXBvbmVudE5hbWUsIGN0eC5hdXRoKTtcbn07XG5cbmNvbnN0IGN0eEZldGNoQ29tcG9uZW50TGlzdCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcpOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc3QgY29tcG9uZW50cyA9IHJlYWRMb2NhbENvbXBvbmVudHNKc29uKGN0eC5sb2NhbEFwaVJvb3QpO1xuICAgIHJldHVybiBjb21wb25lbnRzLmZpbHRlcigoYykgPT4gc2hvdWxkSW1wb3J0Q29tcG9uZW50KGMuaWQsIGMudHlwZSwgaW1wb3J0Q29uZmlnKSkubWFwKChjKSA9PiBjLmlkKTtcbiAgfVxuICByZXR1cm4gaHR0cEZldGNoQ29tcG9uZW50TGlzdChjdHguYXBpVXJsLCBpbXBvcnRDb25maWcsIGN0eC5hdXRoKTtcbn07XG5cbmNvbnN0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnRbXT4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIHJldHVybiByZWFkTG9jYWxDb21wb25lbnRzSnNvbihjdHgubG9jYWxBcGlSb290KTtcbiAgfVxuICByZXR1cm4gaHR0cEZldGNoQWxsQ29tcG9uZW50c0xpc3QoY3R4LmFwaVVybCwgY3R4LmF1dGgpO1xufTtcblxuY29uc3QgY3R4RG93bmxvYWRGaWxlID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCB1cmw6IHN0cmluZywgZGVzdFBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnN0IHNyY1BhdGggPSByZXNvbHZlVXJsVG9Mb2NhbFBhdGgoY3R4LmxvY2FsQXBpUm9vdCwgdXJsKTtcbiAgICBpZiAoIXNyY1BhdGgpIHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBMb2NhbCBhc3NldCBub3QgZm91bmQgZm9yIFVSTDogJHt1cmx9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUoZGVzdFBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBodHRwRG93bmxvYWRGaWxlKHVybCwgZGVzdFBhdGgsIGN0eC5hdXRoKTtcbn07XG5cbi8qKlxuICogQ29weSBIYW5kb2ZmIGJ1bmRsZSBtYWluLmpzIC8gbWFpbi5jc3MgZnJvbSBsb2NhbCBwdWJsaWMvYXBpIGludG8gd3AtY29udGVudC9oYW5kb2ZmL2Fzc2V0cy5cbiAqL1xuY29uc3Qgc3luY0J1bmRsZUFzc2V0cyA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgY29udGVudFJvb3Q6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBpZiAoIWN0eC5sb2NhbEFwaVJvb3QpIHJldHVybjtcbiAgY29uc3QgYXNzZXRzQ3NzRGlyID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAnYXNzZXRzJywgJ2NzcycpO1xuICBjb25zdCBhc3NldHNKc0RpciA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ2Fzc2V0cycsICdqcycpO1xuICBmcy5ta2RpclN5bmMoYXNzZXRzQ3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgZnMubWtkaXJTeW5jKGFzc2V0c0pzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgY29uc3QgbWFpbkNzcyA9IHBhdGguam9pbihjdHgubG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgJ21haW4uY3NzJyk7XG4gIGNvbnN0IG1haW5KcyA9IHBhdGguam9pbihjdHgubG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgJ21haW4uanMnKTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMobWFpbkNzcykpIHtcbiAgICBmcy5jb3B5RmlsZVN5bmMobWFpbkNzcywgcGF0aC5qb2luKGFzc2V0c0Nzc0RpciwgJ21haW4uY3NzJykpO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2Nzcy9tYWluLmNzcyAoZnJvbSAtLXNvdXJjZSlgKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgTWlzc2luZyAke21haW5Dc3N9YCk7XG4gIH1cbiAgaWYgKGZzLmV4aXN0c1N5bmMobWFpbkpzKSkge1xuICAgIGZzLmNvcHlGaWxlU3luYyhtYWluSnMsIHBhdGguam9pbihhc3NldHNKc0RpciwgJ21haW4uanMnKSk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvanMvbWFpbi5qcyAoZnJvbSAtLXNvdXJjZSlgKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgTWlzc2luZyAke21haW5Kc31gKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21waWxlIGFsbCBjb21wb25lbnRzXG4gKi9cbi8qKlxuICogQnVpbGQgVmFyaWFudEluZm8gZm9yIGEgY29tcG9uZW50IChyZXNvbHZlcyBkeW5hbWljIGFycmF5cywgSW5uZXJCbG9ja3MgZmllbGQsIGV0Yy4pXG4gKi9cbmNvbnN0IGJ1aWxkVmFyaWFudEluZm8gPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCByZXNvbHZlZENvbmZpZzogUmVzb2x2ZWRDb25maWcpOiBWYXJpYW50SW5mbyA9PiB7XG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KSxcbiAgfTtcblxuICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50RHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoJ2FycmF5VHlwZScgaW4gZHluQ29uZmlnKSBjb250aW51ZTsgLy8gU2tpcCBzcGVjaWFsaXNlZCBhcnJheSB0eXBlc1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgIGlmIChwcm9wPy50eXBlID09PSAnYXJyYXknICYmIHByb3AucGFnaW5hdGlvbj8udHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBjb25zdCBwYWdpbmF0aW9uRmllbGRSZWdleCA9IG5ldyBSZWdFeHAoXG4gICAgICAgIGBcXFxce1xcXFx7XFxcXHMqI2ZpZWxkXFxcXHMrW1wiJ10ke2ZpZWxkTmFtZX1cXFxcLnBhZ2luYXRpb25bXCInXWBcbiAgICAgICk7XG4gICAgICBpZiAocGFnaW5hdGlvbkZpZWxkUmVnZXgudGVzdChjb21wb25lbnQuY29kZSkpIHtcbiAgICAgICAgKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24gPSB7IHByb3BlcnR5TmFtZTogJ3BhZ2luYXRpb24nIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmllbGRQcmVmcyA9IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCk7XG4gIGNvbnN0IHJpY2h0ZXh0RmllbGRzID0gT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpXG4gICAgLmZpbHRlcigoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBjb25zdCBleHBsaWNpdElubmVyQmxvY2tzID0gT2JqZWN0LmVudHJpZXMoZmllbGRQcmVmcylcbiAgICAuZmlsdGVyKChbLCBwcmVmc10pID0+IHByZWZzLmlubmVyQmxvY2tzID09PSB0cnVlKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGxldCBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBvbmx5IG9uZSByaWNodGV4dCBmaWVsZCBwZXIgYmxvY2sgY2FuIHVzZSBJbm5lckJsb2NrcywgYCArXG4gICAgICBgYnV0ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGh9IGFyZSBtYXJrZWQ6ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5qb2luKCcsICcpfWBcbiAgICApO1xuICB9IGVsc2UgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgZmllbGQgPSBleHBsaWNpdElubmVyQmxvY2tzWzBdO1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZF07XG4gICAgaWYgKCFwcm9wIHx8IHByb3AudHlwZSAhPT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IGZpZWxkIFwiJHtmaWVsZH1cIiBpcyBtYXJrZWQgYXMgaW5uZXJCbG9ja3MgYnV0IGlzIG5vdCBhIHJpY2h0ZXh0IGZpZWxkYFxuICAgICAgKTtcbiAgICB9XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IGZpZWxkO1xuICB9IGVsc2UgaWYgKHJpY2h0ZXh0RmllbGRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSByaWNodGV4dEZpZWxkc1swXTtcbiAgfSBlbHNlIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY29tcG9uZW50LFxuICAgIGZpZWxkTWFwOiB7fSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkLFxuICAgIGR5bmFtaWNBcnJheUNvbmZpZ3M6IGNvbXBvbmVudER5bmFtaWNBcnJheXMsXG4gIH07XG59O1xuXG4vKipcbiAqIENvbXBpbGUgYSBzaW5nbGUgbWVyZ2VkIGdyb3VwIChlLmcuIEhlcm8gd2l0aCBtdWx0aXBsZSB2YXJpYW50cykuIFVzZWQgYnkgc2luZ2xlLW5hbWUgQ0xJIHdoZW4gbmFtZSBtYXRjaGVzIGEgZ3JvdXAuXG4gKi9cbmNvbnN0IGNvbXBpbGVHcm91cCA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10sXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflIAgR2VuZXJhdGluZyBtZXJnZWQgZ3JvdXAgYmxvY2s6ICR7Z3JvdXBTbHVnfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc3QgdmFyaWFudEluZm9zOiBWYXJpYW50SW5mb1tdID0gZ3JvdXBDb21wb25lbnRzLm1hcCgoYykgPT4gYnVpbGRWYXJpYW50SW5mbyhjLCBjb25maWcpKTtcblxuICAvLyBCdWlsZCB2YXJpYW50IHNjcmVlbnNob3QgbWFwICh3aGljaCB2YXJpYW50cyBoYXZlIGltYWdlcyB0byBkb3dubG9hZClcbiAgY29uc3QgdmFyaWFudFNjcmVlbnNob3RzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBmb3IgKGNvbnN0IGNvbXAgb2YgZ3JvdXBDb21wb25lbnRzKSB7XG4gICAgdmFyaWFudFNjcmVlbnNob3RzW2NvbXAuaWRdID0gISFjb21wLmltYWdlO1xuICB9XG5cbiAgY29uc3QgbWVyZ2VkQmxvY2sgPSBnZW5lcmF0ZU1lcmdlZEJsb2NrKGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzLCB2YXJpYW50SW5mb3MsIGN0eC5hcGlVcmwsIHZhcmlhbnRTY3JlZW5zaG90cyk7XG4gIGNvbnN0IGdyb3VwQmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuICBjb25zdCBncm91cERpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGdyb3VwQmxvY2tOYW1lKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGdyb3VwRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhncm91cERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cblxuICAvLyBEb3dubG9hZCB2YXJpYW50IHNjcmVlbnNob3RzXG4gIGlmIChtZXJnZWRCbG9jay52YXJpYW50U2NyZWVuc2hvdFVybHMpIHtcbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIHVybF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWFudFNjcmVlbnNob3RVcmxzKSkge1xuICAgICAgY29uc3Qgc2NyZWVuc2hvdFBhdGggPSBwYXRoLmpvaW4oZ3JvdXBEaXIsIGBzY3JlZW5zaG90LSR7dmFyaWFudElkfS5wbmdgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5O3IERvd25sb2FkaW5nIHNjcmVlbnNob3QgZm9yIHZhcmlhbnQgJHt2YXJpYW50SWR9Li4uYCk7XG4gICAgICBjb25zdCBvayA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIHVybCwgc2NyZWVuc2hvdFBhdGgpO1xuICAgICAgaWYgKCFvaykge1xuICAgICAgICB2YXJpYW50U2NyZWVuc2hvdHNbdmFyaWFudElkXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suYmxvY2tKc29uLCAnanNvbicpO1xuICBjb25zdCBmb3JtYXR0ZWRJbmRleEpzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5pbmRleEpzLCAnYmFiZWwnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgY29uc3QgZm9ybWF0dGVkRWRpdG9yU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suZWRpdG9yU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkU3R5bGVTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5zdHlsZVNjc3MsICdzY3NzJyk7XG5cbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdSRUFETUUubWQnKSwgbWVyZ2VkQmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgbWVyZ2VkQmxvY2subWlncmF0aW9uU2NoZW1hKTtcblxuICBpZiAobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMpIHtcbiAgICBjb25zdCB2YXJpYXRpb25zRGlyID0gcGF0aC5qb2luKGdyb3VwRGlyLCAndmFyaWF0aW9ucycpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyh2YXJpYXRpb25zRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKHZhcmlhdGlvbnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLmpzKSkge1xuICAgICAgY29uc3QgZm9ybWF0dGVkID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAnYmFiZWwnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0uanNgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcy5waHApKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdwaHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0ucGhwYCksIGZvcm1hdHRlZCk7XG4gICAgfVxuICB9XG5cbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgbWVyZ2VkIGJsb2NrOiAke2dyb3VwQmxvY2tOYW1lfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtncm91cERpcn1gKTtcblxuICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChncm91cENvbXBvbmVudHMpO1xuICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoaW5jbHVkZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICBmcy53cml0ZUZpbGVTeW5jKGNhdGVnb3JpZXNQYXRoLCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgJHtjYXRlZ29yaWVzUGF0aH1gKTtcbn07XG5cbmNvbnN0IGNvbXBpbGVBbGwgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIG91dHB1dERpcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SnIEd1dGVuYmVyZyBDb21waWxlciAtIEJhdGNoIE1vZGVgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3V0cHV0RGlyfWApO1xuICBpZiAoY3R4LmF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7Y3R4LmF1dGgudXNlcm5hbWV9YCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgbGlzdC4uLmApO1xuICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50TGlzdChjdHgsIGNvbmZpZy5pbXBvcnQpO1xuXG4gICAgY29uc29sZS5sb2coYCAgIEZvdW5kICR7Y29tcG9uZW50SWRzLmxlbmd0aH0gY29tcG9uZW50c1xcbmApO1xuICAgIFxuICAgIGxldCBzdWNjZXNzID0gMDtcbiAgICBsZXQgZmFpbGVkID0gMDtcbiAgICBjb25zdCBjb21waWxlZENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgIGNvbnN0IHNjaGVtYUhpc3RvcnkgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgICBcbiAgICAvLyBGZXRjaCBhbGwgY29tcG9uZW50cyBmaXJzdCBzbyB3ZSBjYW4gcGFydGl0aW9uIGJ5IGdyb3VwXG4gICAgY29uc3QgYWxsQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgY29tcG9uZW50SWQpO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoY29tcG9uZW50KTtcbiAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGAgICDimqDvuI8gIFNraXBwaW5nICR7Y29tcG9uZW50SWR9IGR1ZSB0byB0ZW1wbGF0ZSB2YXJpYWJsZSBlcnJvcnNgKTtcbiAgICAgICAgICBmYWlsZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFsbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBmZXRjaCAke2NvbXBvbmVudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQrKztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQYXJ0aXRpb24gY29tcG9uZW50czogbWVyZ2VkIGdyb3VwcyB2cyBpbmRpdmlkdWFsXG4gICAgLy8gQnVpbGQgY2FzZS1pbnNlbnNpdGl2ZSBsb29rdXA6IGNvbmZpZyBtYXkgc2F5IFwiSGVyb1wiIGJ1dCBBUEkgb2Z0ZW4gcmV0dXJucyBcImhlcm9cIlxuICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBba2V5LCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZ3JvdXBzKSkge1xuICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgIH1cbiAgICBjb25zdCBncm91cEJ1Y2tldHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZDb21wb25lbnRbXT4gPSB7fTtcbiAgICBjb25zdCBpbmRpdmlkdWFsQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBhbGxDb21wb25lbnRzKSB7XG4gICAgICBjb25zdCBncm91cCA9IGNvbXBvbmVudC5ncm91cDtcbiAgICAgIGlmICghZ3JvdXApIHtcbiAgICAgICAgaW5kaXZpZHVhbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNvbmZpZ0tleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoZ3JvdXAudG9Mb3dlckNhc2UoKSk7XG4gICAgICBpZiAoY29uZmlnS2V5KSB7XG4gICAgICAgIGlmICghZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0pIGdyb3VwQnVja2V0c1tjb25maWdLZXldID0gW107XG4gICAgICAgIGdyb3VwQnVja2V0c1tjb25maWdLZXldLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb21waWxlIGluZGl2aWR1YWwgY29tcG9uZW50cyAoZXhpc3RpbmcgYmVoYXZpb3IpXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgaW5kaXZpZHVhbENvbXBvbmVudHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGJsb2NrID0gZ2VuZXJhdGVCbG9jayhjb21wb25lbnQsIGN0eC5hcGlVcmwsIGNvbmZpZywgc2NoZW1hSGlzdG9yeSk7XG4gICAgICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvdXRwdXREaXIsIGNvbXBvbmVudC5pZCwgYmxvY2ssIGN0eCk7XG4gICAgICAgIGNvbXBpbGVkQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgIHN1Y2Nlc3MrKztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gY29tcGlsZSAke2NvbXBvbmVudC5pZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBtZXJnZWQgZ3JvdXBzXG4gICAgZm9yIChjb25zdCBbZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHNdIG9mIE9iamVjdC5lbnRyaWVzKGdyb3VwQnVja2V0cykpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChjdHgsIG91dHB1dERpciwgZ3JvdXBTbHVnLCBncm91cENvbXBvbmVudHMpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaCguLi5ncm91cENvbXBvbmVudHMpO1xuICAgICAgICBzdWNjZXNzICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgbWVyZ2VkIGdyb3VwICR7Z3JvdXBTbHVnfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQgKz0gZ3JvdXBDb21wb25lbnRzLmxlbmd0aDtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgY2F0ZWdvcmllcyBQSFAgZmlsZSBiYXNlZCBvbiBhbGwgY29tcGlsZWQgY29tcG9uZW50c1xuICAgIGlmIChjb21waWxlZENvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgR2VuZXJhdGluZyBibG9jayBjYXRlZ29yaWVzLi4uYCk7XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGNvbXBpbGVkQ29tcG9uZW50cyk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICAgICAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICAgICAgZnMubWtkaXJTeW5jKGluY2x1ZGVzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhjYXRlZ29yaWVzUGF0aCwgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtjYXRlZ29yaWVzUGF0aH1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29weSBzaGFyZWQgY29tcG9uZW50cyAmIHV0aWxzIHRvIHRoZSBvdXRwdXQgZGlyZWN0b3J5IHNvIGJsb2NrcyBjYW5cbiAgICAvLyByZXNvbHZlIHRoZWlyIC4uLy4uL3NoYXJlZC8uLi4gaW1wb3J0cyByZWdhcmRsZXNzIG9mIHdoZXJlIHRoZXkgbGl2ZS5cbiAgICBjb25zdCBwbHVnaW5Sb290ID0gcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShwcm9jZXNzLmFyZ3ZbMV0pLCAnLi4nLCAnLi4nKTtcbiAgICBjb25zdCBwbHVnaW5TaGFyZWREaXIgPSBwYXRoLmpvaW4ocGx1Z2luUm9vdCwgJ3NoYXJlZCcpO1xuICAgIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJyk7XG4gICAgY29uc3QgdGFyZ2V0U2hhcmVkRGlyID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAnc2hhcmVkJyk7XG5cbiAgICBpZiAoZnMuZXhpc3RzU3luYyhwbHVnaW5TaGFyZWREaXIpICYmXG4gICAgICAgIHBhdGgucmVzb2x2ZShwbHVnaW5TaGFyZWREaXIpICE9PSBwYXRoLnJlc29sdmUodGFyZ2V0U2hhcmVkRGlyKSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgQ29weWluZyBzaGFyZWQgY29tcG9uZW50cy4uLmApO1xuICAgICAgY29weURpclJlY3Vyc2l2ZShwbHVnaW5TaGFyZWREaXIsIHRhcmdldFNoYXJlZERpcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFNoYXJlZCBjb21wb25lbnRzIGNvcGllZCB0byAke3RhcmdldFNoYXJlZERpcn1gKTtcbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSBwYWNrYWdlLmpzb24gYW5kIGluc3RhbGwgYnVpbGQgZGVwZW5kZW5jaWVzIHNvIGJsb2NrcyBhbmRcbiAgICAvLyBzaGFyZWQgY29tcG9uZW50cyBjYW4gcmVzb2x2ZSBAd29yZHByZXNzLyogYW5kIEAxMHVwLyogaW1wb3J0cy5cbiAgICBlbnN1cmVDb250ZW50RGVwZW5kZW5jaWVzKGNvbnRlbnRSb290KTtcbiAgICBcbiAgICAvLyBEb3dubG9hZCBvciBjb3B5IG1haW4uY3NzIGFuZCBtYWluLmpzIGRlc2lnbiBzeXN0ZW0gYXNzZXRzXG4gICAgY29uc29sZS5sb2coYFxcbvCfk6EgU3luY2luZyBkZXNpZ24gc3lzdGVtIGFzc2V0cy4uLmApO1xuICAgIGNvbnN0IGFzc2V0c0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICcuLicsICdhc3NldHMnKTtcbiAgICBjb25zdCBhc3NldHNDc3NEaXIgPSBwYXRoLmpvaW4oYXNzZXRzRGlyLCAnY3NzJyk7XG4gICAgY29uc3QgYXNzZXRzSnNEaXIgPSBwYXRoLmpvaW4oYXNzZXRzRGlyLCAnanMnKTtcblxuICAgIGlmICghZnMuZXhpc3RzU3luYyhhc3NldHNDc3NEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoYXNzZXRzQ3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFzc2V0c0pzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGFzc2V0c0pzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIHBhdGgucmVzb2x2ZShvdXRwdXREaXIsICcuLicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY3NzVXJsID0gYCR7Y3R4LmFwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmNzc2A7XG4gICAgICBjb25zdCBjc3NQYXRoID0gcGF0aC5qb2luKGFzc2V0c0Nzc0RpciwgJ21haW4uY3NzJyk7XG4gICAgICBjb25zdCBjc3NEb3dubG9hZGVkID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwgY3NzVXJsLCBjc3NQYXRoKTtcbiAgICAgIGlmIChjc3NEb3dubG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2Nzcy9tYWluLmNzc2ApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmNzcyBmcm9tICR7Y3NzVXJsfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBqc1VybCA9IGAke2N0eC5hcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5qc2A7XG4gICAgICBjb25zdCBqc1BhdGggPSBwYXRoLmpvaW4oYXNzZXRzSnNEaXIsICdtYWluLmpzJyk7XG4gICAgICBjb25zdCBqc0Rvd25sb2FkZWQgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCBqc1VybCwganNQYXRoKTtcbiAgICAgIGlmIChqc0Rvd25sb2FkZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvanMvbWFpbi5qc2ApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIENvbXBpbGF0aW9uIGNvbXBsZXRlIWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgU3VjY2VzczogJHtzdWNjZXNzfWApO1xuICAgIGlmIChmYWlsZWQgPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4p2MIEZhaWxlZDogJHtmYWlsZWR9YCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SAIE1lcmdlZCBncm91cHM6ICR7T2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGh9YCk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGBcXG5Eb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcilcbiAqL1xuY29uc3QgY29tcGlsZVRoZW1lID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBvdXRwdXREaXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+OqCBUaGVtZSBUZW1wbGF0ZSBDb21waWxlcmApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChjdHguYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHtjdHguYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIENvbXBpbGUgaGVhZGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgaGVhZGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXIgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsICdoZWFkZXInKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtoZWFkZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgaGVhZGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgaGVhZGVyUGhwID0gZ2VuZXJhdGVIZWFkZXJQaHAoaGVhZGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEhlYWRlciA9IGF3YWl0IGZvcm1hdENvZGUoaGVhZGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGhlYWRlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnaGVhZGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhoZWFkZXJQYXRoLCBmb3JtYXR0ZWRIZWFkZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7aGVhZGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEhlYWRlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxlIGZvb3RlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGZvb3RlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZm9vdGVyID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCAnZm9vdGVyJyk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Zm9vdGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGZvb3Rlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGZvb3RlclBocCA9IGdlbmVyYXRlRm9vdGVyUGhwKGZvb3Rlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRGb290ZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGZvb3RlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBmb290ZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Zvb3Rlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoZm9vdGVyUGF0aCwgZm9ybWF0dGVkRm9vdGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2Zvb3RlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBGb290ZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWxzbyB0cnkgaGVhZGVyLWNvbXBhY3QgYW5kIGZvb3Rlci1jb21wYWN0IGlmIHRoZXkgZXhpc3RcbiAgICAvLyBUaGVzZSBnbyBpbnRvIHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvIHN1YmZvbGRlclxuICAgIGNvbnN0IGhhbmRvZmZUZW1wbGF0ZXNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAndGVtcGxhdGUtcGFydHMnLCAnaGFuZG9mZicpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBnZW5lcmF0ZWRUZW1wbGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCB2YXJpYW50IG9mIFsnaGVhZGVyLWNvbXBhY3QnLCAnaGVhZGVyLWxhbmRlcicsICdmb290ZXItY29tcGFjdCddKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIHZhcmlhbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+ToSBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9YCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVR5cGUgPSB2YXJpYW50LnJlcGxhY2UoLy0vZywgJ18nKTtcbiAgICAgICAgY29uc3QgaXNIZWFkZXIgPSB2YXJpYW50LnN0YXJ0c1dpdGgoJ2hlYWRlcicpO1xuICAgICAgICBjb25zdCBwaHAgPSBpc0hlYWRlciBcbiAgICAgICAgICA/IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKVxuICAgICAgICAgIDogZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpO1xuICAgICAgICBjb25zdCBmb3JtYXR0ZWRQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKHBocCwgJ3BocCcpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIGZvcm1hdHRlZFBocCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2ZpbGVQYXRofVxcbmApO1xuICAgICAgICBnZW5lcmF0ZWRUZW1wbGF0ZXMucHVzaChgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBWYXJpYW50IGRvZXNuJ3QgZXhpc3QsIHNraXAgc2lsZW50bHlcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgUkVBRE1FIGZvciB0aGUgaGFuZG9mZiB0ZW1wbGF0ZXMgZm9sZGVyXG4gICAgaWYgKGdlbmVyYXRlZFRlbXBsYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCByZWFkbWVDb250ZW50ID0gYCMgSGFuZG9mZiBUZW1wbGF0ZSBQYXJ0c1xuXG4+IOKaoO+4jyAqKkRPIE5PVCBFRElUIFRIRVNFIEZJTEVTIERJUkVDVExZKipcbj5cbj4gVGhlc2UgZmlsZXMgYXJlIGF1dG9tYXRpY2FsbHkgZ2VuZXJhdGVkIGJ5IHRoZSBIYW5kb2ZmIFdvcmRQcmVzcyBjb21waWxlci5cbj4gQW55IGNoYW5nZXMgd2lsbCBiZSBvdmVyd3JpdHRlbiBvbiB0aGUgbmV4dCBzeW5jLlxuXG4jIyBTb3VyY2VcblxuVGhlc2UgdGVtcGxhdGVzIHdlcmUgdHJhbnNwaWxlZCBmcm9tIHRoZSBIYW5kb2ZmIGRlc2lnbiBzeXN0ZW0uXG5cbi0gKipBUEkgVVJMOioqICR7Y3R4LmFwaVVybH1cbi0gKipHZW5lcmF0ZWQ6KiogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XG5cbiMjIEZpbGVzXG5cbiR7Z2VuZXJhdGVkVGVtcGxhdGVzLm1hcChmID0+IGAtIFxcYCR7Zn1cXGBgKS5qb2luKCdcXG4nKX1cblxuIyMgVXNhZ2VcblxuSW5jbHVkZSB0aGVzZSB0ZW1wbGF0ZSBwYXJ0cyBpbiB5b3VyIHRoZW1lIHVzaW5nOlxuXG5cXGBcXGBcXGBwaHBcbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2hlYWRlci1jb21wYWN0Jyk7ID8+XG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9mb290ZXItY29tcGFjdCcpOyA/PlxuXFxgXFxgXFxgXG5cbiMjIFJlZ2VuZXJhdGluZ1xuXG5UbyByZWdlbmVyYXRlIHRoZXNlIGZpbGVzLCBydW46XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWVcblxcYFxcYFxcYFxuXG5PciB3aXRoIGEgc3BlY2lmaWMgQVBJIFVSTDpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZSAtLWFwaS11cmwgJHtjdHguYXBpVXJsfVxuXFxgXFxgXFxgXG5gO1xuICAgICAgY29uc3QgcmVhZG1lUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCAnUkVBRE1FLm1kJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHJlYWRtZVBhdGgsIHJlYWRtZUNvbnRlbnQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk50gR2VuZXJhdGVkOiAke3JlYWRtZVBhdGh9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG9yIGNvcHkgbWFpbi5jc3MgYW5kIG1haW4uanMgYXNzZXRzXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgdGhlbWUgYXNzZXRzLi4uYCk7XG4gICAgXG4gICAgLy8gRW5zdXJlIGFzc2V0cyBkaXJlY3RvcmllcyBleGlzdFxuICAgIGNvbnN0IGNzc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnY3NzJyk7XG4gICAgY29uc3QganNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2pzJyk7XG4gICAgXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGNzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhjc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoanNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoanNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIG91dHB1dERpcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERvd25sb2FkIG1haW4uY3NzXG4gICAgICBjb25zdCBjc3NVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uY3NzYDtcbiAgICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oY3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmNzcy4uLmApO1xuICAgICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGNzc1VybCwgY3NzUGF0aCk7XG4gICAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7Y3NzUGF0aH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRG93bmxvYWQgbWFpbi5qc1xuICAgICAgY29uc3QganNVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGpzRGlyLCAnbWFpbi5qcycpO1xuICAgICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uanMuLi5gKTtcbiAgICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGpzVXJsLCBqc1BhdGgpO1xuICAgICAgaWYgKGpzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7anNQYXRofWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBUaGVtZSB0ZW1wbGF0ZXMgZ2VuZXJhdGVkIVxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHNpbmdsZSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGUgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcpOiBQcm9taXNlPFZhbGlkYXRpb25SZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnROYW1lKTtcbiAgXG4gIC8vIExvYWQgbWFuaWZlc3RcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgXG4gIC8vIFZhbGlkYXRlXG4gIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBcbiAgLy8gT3V0cHV0IHJlc3VsdFxuICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGVBbGwgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIG91dHB1dERpcjogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIEFsbCBDb21wb25lbnRzYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7Y3R4LmFwaVVybH1gKTtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2N0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBGZXRjaCBjb21wb25lbnQgbGlzdFxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnRMaXN0KGN0eCwgaW1wb3J0Q29uZmlnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgLy8gTG9hZCBtYW5pZmVzdFxuICAgIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgbGV0IHZhbGlkID0gMDtcbiAgICBsZXQgaW52YWxpZCA9IDA7XG4gICAgbGV0IG5ld0NvbXBvbmVudHMgPSAwO1xuICAgIGNvbnN0IGJyZWFraW5nQ2hhbmdlczogVmFsaWRhdGlvblJlc3VsdFtdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgY29tcG9uZW50SWQpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChyZXN1bHQuaXNOZXcpIHtcbiAgICAgICAgICBuZXdDb21wb25lbnRzKys7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICB2YWxpZCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGludmFsaWQrKztcbiAgICAgICAgICBicmVha2luZ0NoYW5nZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIHZhbGlkYXRlICR7Y29tcG9uZW50SWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFN1bW1hcnlcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGDwn5OKIFZhbGlkYXRpb24gU3VtbWFyeWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgVmFsaWQ6ICR7dmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKdjCBCcmVha2luZyBDaGFuZ2VzOiAke2ludmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKcqCBOZXcgQ29tcG9uZW50czogJHtuZXdDb21wb25lbnRzfWApO1xuICAgIFxuICAgIGlmIChicmVha2luZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgV0FSTklORzogJHticmVha2luZ0NoYW5nZXMubGVuZ3RofSBjb21wb25lbnQocykgaGF2ZSBicmVha2luZyBjaGFuZ2VzIWApO1xuICAgICAgY29uc29sZS5sb2coYCAgIFRoZXNlIGNoYW5nZXMgbWF5IGJyZWFrIGV4aXN0aW5nIFdvcmRQcmVzcyBjb250ZW50LlxcbmApO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudHMgd2l0aCBicmVha2luZyBjaGFuZ2VzOmApO1xuICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgYnJlYWtpbmdDaGFuZ2VzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAtICR7cmVzdWx0LmNvbXBvbmVudFRpdGxlfSAoJHtyZXN1bHQuY29tcG9uZW50SWR9KWApO1xuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYFxcbiAgIFRvIHByb2NlZWQgYW55d2F5LCBjb21waWxlIHdpdGggLS1mb3JjZSBmbGFnLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyoIEFsbCBjb21wb25lbnRzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHkhXFxuYCk7XG4gICAgfVxuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICovXG5jb25zdCB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudCA9IChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogdm9pZCA9PiB7XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdCA9IHVwZGF0ZU1hbmlmZXN0KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBzYXZlTWFuaWZlc3Qob3V0cHV0RGlyLCB1cGRhdGVkTWFuaWZlc3QpO1xufTtcblxuLyoqXG4gKiBXYXRjaCBsb2NhbCBIYW5kb2ZmIGBwdWJsaWMvYXBpYCBvdXRwdXQgYW5kIHJlY29tcGlsZSBibG9ja3MgLyBzeW5jIGJ1bmRsZXMuXG4gKi9cbmNvbnN0IHJ1bldhdGNoTW9kZSA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBvbmx5Q29tcG9uZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgcnVuT3B0czogeyBmb3JjZT86IGJvb2xlYW4gfSxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCByb290ID0gY3R4LmxvY2FsQXBpUm9vdCE7XG4gIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJyk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5GAIFdhdGNoIG1vZGVgKTtcbiAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtyb290fWApO1xuICBjb25zb2xlLmxvZyhgICAgQmxvY2tzOiAke291dHB1dERpcn1cXG5gKTtcblxuICBsZXQgZGViVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuICBjb25zdCBzY2hlZHVsZSA9IChmbjogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4ge1xuICAgIGlmIChkZWJUaW1lcikgY2xlYXJUaW1lb3V0KGRlYlRpbWVyKTtcbiAgICBkZWJUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdm9pZCBmbigpLmNhdGNoKChlcnIpID0+IGNvbnNvbGUuZXJyb3IoJ1t3YXRjaF0nLCBlcnIpKTtcbiAgICB9LCAxNTApO1xuICB9O1xuXG4gIGNvbnN0IGNvbXBpbGVPbmUgPSBhc3luYyAoc3RlbTogc3RyaW5nKSA9PiB7XG4gICAgaWYgKHN0ZW0gPT09ICdjb21wb25lbnRzJykgcmV0dXJuO1xuICAgIGNvbnNvbGUubG9nKGBcXG5bd2F0Y2hdIFJlY29tcGlsaW5nICR7c3RlbX0uLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBzdGVtKTtcbiAgICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICAgIH1cbiAgICAgIGlmIChjb21wb25lbnQuZ3JvdXApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGNvbXBvbmVudC5ncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgaWYgKGdyb3VwS2V5KSB7XG4gICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QoY3R4KTtcbiAgICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gZ3JvdXBLZXkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IGZ1bGxHcm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgYyBvZiBncm91cE1hdGNoZXMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIGMuaWQpO1xuICAgICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGZ1bGwpO1xuICAgICAgICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFNraXBwaW5nICR7Yy5pZH0gKHRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkKWApO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGZ1bGxHcm91cENvbXBvbmVudHMucHVzaChmdWxsKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAvLyBza2lwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChjdHgsIG91dHB1dERpciwgZ3JvdXBLZXksIGZ1bGxHcm91cENvbXBvbmVudHMpO1xuICAgICAgICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIGNvbnRlbnRSb290KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghcnVuT3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShjdHgsIG91dHB1dERpciwgc3RlbSk7XG4gICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYFt3YXRjaF0gU2tpcHBpbmcgJHtzdGVtfTogYnJlYWtpbmcgY2hhbmdlcyAocmUtcnVuIHdpdGggLS1mb3JjZSB0byBjb21waWxlIGFueXdheSlgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGNvbXBpbGUoe1xuICAgICAgICBhcGlVcmw6IGN0eC5hcGlVcmwsXG4gICAgICAgIG91dHB1dERpcixcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RlbSxcbiAgICAgICAgYXV0aDogY3R4LmF1dGgsXG4gICAgICAgIGxvY2FsQXBpUm9vdDogcm9vdCxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgY29tcCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgc3RlbSk7XG4gICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXREaXIsIGNvbXApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYFt3YXRjaF0gRmFpbGVkICR7c3RlbX06YCwgZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogZSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHBhdHRlcm5zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAob25seUNvbXBvbmVudElkKSB7XG4gICAgcGF0dGVybnMucHVzaChwYXRoLmpvaW4ocm9vdCwgJ2NvbXBvbmVudCcsIGAke29ubHlDb21wb25lbnRJZH0uanNvbmApKTtcbiAgfSBlbHNlIHtcbiAgICBwYXR0ZXJucy5wdXNoKHBhdGguam9pbihyb290LCAnY29tcG9uZW50JywgJyouanNvbicpKTtcbiAgfVxuICBwYXR0ZXJucy5wdXNoKHBhdGguam9pbihyb290LCAnY29tcG9uZW50JywgJ21haW4uanMnKSwgcGF0aC5qb2luKHJvb3QsICdjb21wb25lbnQnLCAnbWFpbi5jc3MnKSk7XG5cbiAgY29uc3Qgd2F0Y2hlciA9IGNob2tpZGFyLndhdGNoKHBhdHRlcm5zLCB7XG4gICAgYXdhaXRXcml0ZUZpbmlzaDogeyBzdGFiaWxpdHlUaHJlc2hvbGQ6IDE1MCwgcG9sbEludGVydmFsOiA1MCB9LFxuICAgIGlnbm9yZUluaXRpYWw6IHRydWUsXG4gIH0pO1xuXG4gIHdhdGNoZXIub24oJ2FsbCcsIChldmVudCwgZmlsZVBhdGgpID0+IHtcbiAgICBpZiAoIWZpbGVQYXRoKSByZXR1cm47XG4gICAgaWYgKCFbJ2FkZCcsICdjaGFuZ2UnLCAndW5saW5rJ10uaW5jbHVkZXMoZXZlbnQpKSByZXR1cm47XG4gICAgY29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuICAgIGlmIChiYXNlID09PSAnbWFpbi5qcycgfHwgYmFzZSA9PT0gJ21haW4uY3NzJykge1xuICAgICAgc2NoZWR1bGUoYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGN0eCwgY29udGVudFJvb3QpO1xuICAgICAgICBjb25zb2xlLmxvZygnW3dhdGNoXSBCdW5kbGUgYXNzZXRzIHN5bmNlZCcpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChmaWxlUGF0aC5lbmRzV2l0aCgnLmpzb24nKSkge1xuICAgICAgY29uc3Qgc3RlbSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgsICcuanNvbicpO1xuICAgICAgaWYgKG9ubHlDb21wb25lbnRJZCAmJiBzdGVtICE9PSBvbmx5Q29tcG9uZW50SWQpIHJldHVybjtcbiAgICAgIHNjaGVkdWxlKCgpID0+IGNvbXBpbGVPbmUoc3RlbSkpO1xuICAgIH1cbiAgfSk7XG5cbiAgd2F0Y2hlci5vbigncmVhZHknLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coJ1dhdGNoaW5nIGZvciBjaGFuZ2VzLiBQcmVzcyBDdHJsK0MgdG8gc3RvcC5cXG4nKTtcbiAgfSk7XG5cbiAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKCkgPT4ge1xuICAgIC8qIGtlZXAgcHJvY2VzcyBhbGl2ZSAqL1xuICB9KTtcbn07XG5cbi8vIENMSSBzZXR1cFxucHJvZ3JhbVxuICAubmFtZSgnZ3V0ZW5iZXJnLWNvbXBpbGUnKVxuICAuZGVzY3JpcHRpb24oJ1RyYW5zcGlsZSBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MgYW5kIHRoZW1lIHRlbXBsYXRlcycpXG4gIC52ZXJzaW9uKCcxLjAuMCcpO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgY29uZmlnIGZpbGVcbiAqL1xuY29uc3QgaW5pdENvbmZpZyA9IChvcHRzOiB7XG4gIGFwaVVybD86IHN0cmluZztcbiAgb3V0cHV0Pzogc3RyaW5nO1xuICB0aGVtZURpcj86IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBmb3JjZT86IGJvb2xlYW47XG59KTogdm9pZCA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIC8vIENoZWNrIGlmIGNvbmZpZyBhbHJlYWR5IGV4aXN0c1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSAmJiAhb3B0cy5mb3JjZSkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZyBmaWxlIGFscmVhZHkgZXhpc3RzOiAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFVzZSAtLWZvcmNlIHRvIG92ZXJ3cml0ZS5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIGFwaVVybDogb3B0cy5hcGlVcmwgPz8gJ2h0dHBzOi8veW91ci1oYW5kb2ZmLXNpdGUuY29tJyxcbiAgICBvdXRwdXQ6IG9wdHMub3V0cHV0ID8/ICcuL2RlbW8vcGx1Z2luL2Jsb2NrcycsXG4gICAgdGhlbWVEaXI6IG9wdHMudGhlbWVEaXIgPz8gJy4vZGVtby90aGVtZScsXG4gICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gJycsXG4gICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gJycsXG4gIH07XG4gIFxuICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gIFxuICBjb25zb2xlLmxvZyhgXFxu4pyFIENyZWF0ZWQgY29uZmlnIGZpbGU6ICR7Y29uZmlnUGF0aH1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbjpgKTtcbiAgY29uc29sZS5sb2coYCAgIGFwaVVybDogICAke25ld0NvbmZpZy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBvdXRwdXQ6ICAgJHtuZXdDb25maWcub3V0cHV0fWApO1xuICBjb25zb2xlLmxvZyhgICAgdGhlbWVEaXI6ICR7bmV3Q29uZmlnLnRoZW1lRGlyfWApO1xuICBpZiAobmV3Q29uZmlnLnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIHVzZXJuYW1lOiAke25ld0NvbmZpZy51c2VybmFtZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgcGFzc3dvcmQ6ICoqKipgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgXFxu8J+SoSBFZGl0IHRoaXMgZmlsZSB0byBjb25maWd1cmUgeW91ciBIYW5kb2ZmIEFQSSBzZXR0aW5ncy5cXG5gKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGhlbHBlclxuICovXG5jb25zdCBwcm9tcHQgPSAocXVlc3Rpb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IHJlYWRsaW5lID0gcmVxdWlyZSgncmVhZGxpbmUnKTtcbiAgY29uc3QgcmwgPSByZWFkbGluZS5jcmVhdGVJbnRlcmZhY2Uoe1xuICAgIGlucHV0OiBwcm9jZXNzLnN0ZGluLFxuICAgIG91dHB1dDogcHJvY2Vzcy5zdGRvdXQsXG4gIH0pO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgcmwucXVlc3Rpb24ocXVlc3Rpb24sIChhbnN3ZXI6IHN0cmluZykgPT4ge1xuICAgICAgcmwuY2xvc2UoKTtcbiAgICAgIHJlc29sdmUoYW5zd2VyLnRyaW0oKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIHllcy9ub1xuICovXG5jb25zdCBwcm9tcHRZZXNObyA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTdHIgPSBkZWZhdWx0VmFsdWUgPyAnWS9uJyA6ICd5L04nO1xuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYCR7cXVlc3Rpb259IFske2RlZmF1bHRTdHJ9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICByZXR1cm4gYW5zd2VyLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgneScpO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgd2l0aCBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdENob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSwgZGVmYXVsdEluZGV4OiBudW1iZXIgPSAwKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc3QgbWFya2VyID0gaSA9PT0gZGVmYXVsdEluZGV4ID8gJz4nIDogJyAnO1xuICAgIGNvbnNvbGUubG9nKGAgICR7bWFya2VyfSAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXIgWyR7ZGVmYXVsdEluZGV4ICsgMX1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG4gIFxuICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGFuc3dlciwgMTApIC0gMTtcbiAgaWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCBjaG9pY2VzLmxlbmd0aCkge1xuICAgIHJldHVybiBjaG9pY2VzW2luZGV4XTtcbiAgfVxuICByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIG11bHRpcGxlIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0TXVsdGlDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGAgICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlcnMgc2VwYXJhdGVkIGJ5IGNvbW1hcyAoZS5nLiwgMSwyLDMpIG9yICdhbGwnOiBgKTtcbiAgaWYgKGFuc3dlci50b0xvd2VyQ2FzZSgpID09PSAnYWxsJykgcmV0dXJuIGNob2ljZXM7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gW2Nob2ljZXNbMF1dO1xuICBcbiAgY29uc3QgaW5kaWNlcyA9IGFuc3dlci5zcGxpdCgnLCcpLm1hcChzID0+IHBhcnNlSW50KHMudHJpbSgpLCAxMCkgLSAxKTtcbiAgcmV0dXJuIGluZGljZXNcbiAgICAuZmlsdGVyKGkgPT4gaSA+PSAwICYmIGkgPCBjaG9pY2VzLmxlbmd0aClcbiAgICAubWFwKGkgPT4gY2hvaWNlc1tpXSk7XG59O1xuXG4vKipcbiAqIEZpbmQgYWxsIGFycmF5IHByb3BlcnRpZXMgaW4gYSBjb21wb25lbnRcbiAqL1xuY29uc3QgZmluZEFycmF5UHJvcGVydGllcyA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPT4ge1xuICBjb25zdCBhcnJheXM6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIGFycmF5cy5wdXNoKHsgcGF0aCwgcHJvcGVydHkgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3RzXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdvYmplY3QnICYmIHByb3BlcnR5LnByb3BlcnRpZXMpIHtcbiAgICAgIGFycmF5cy5wdXNoKC4uLmZpbmRBcnJheVByb3BlcnRpZXMocHJvcGVydHkucHJvcGVydGllcywgcGF0aCkpO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGFycmF5cztcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZmllbGQgbWFwcGluZyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBhcnJheSBpdGVtIHByb3BlcnRpZXNcbiAqL1xuY29uc3Qgc3VnZ2VzdEZpZWxkTWFwcGluZ3MgPSAoaXRlbVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0+IHtcbiAgY29uc3Qgc3VnZ2VzdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIGNvbnN0IG1hcFByb3BlcnR5ID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICBcbiAgICAgIC8vIFN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gY29tbW9uIHBhdHRlcm5zXG4gICAgICBjb25zdCBsb3dlcktleSA9IGtleS50b0xvd2VyQ2FzZSgpO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdpbWFnZScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdwaG90bycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0aHVtYm5haWwnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdmZWF0dXJlZF9pbWFnZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndGl0bGUnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdoZWFkaW5nJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ25hbWUnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X3RpdGxlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2V4Y2VycHQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnc3VtbWFyeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdkZXNjcmlwdGlvbicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZXhjZXJwdCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjb250ZW50JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2JvZHknKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2NvbnRlbnQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3VybCcgfHwgbG93ZXJLZXkgPT09ICdocmVmJyB8fCBsb3dlcktleS5pbmNsdWRlcygnbGluaycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Blcm1hbGluayc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXRlJykpIHtcbiAgICAgICAgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXknKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpkYXlfbnVtZXJpYyc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ21vbnRoJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6bW9udGhfc2hvcnQnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCd5ZWFyJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6eWVhcic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmZ1bGwnO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdhdXRob3InKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdhdXRob3IubmFtZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjYXRlZ29yeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0YWcnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICd0YXhvbm9teTpjYXRlZ29yeSc7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBuZXN0ZWQgb2JqZWN0c1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIG1hcFByb3BlcnR5KHByb3AucHJvcGVydGllcywgcGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBcbiAgbWFwUHJvcGVydHkoaXRlbVByb3BlcnRpZXMpO1xuICByZXR1cm4gc3VnZ2VzdGlvbnM7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHdpemFyZCBmb3IgY29uZmlndXJpbmcgZHluYW1pYyBhcnJheXNcbiAqL1xuY29uc3QgY29uZmlndXJlRHluYW1pY0FycmF5cyA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIGNvbXBvbmVudE5hbWU6IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+nmSBEeW5hbWljIEFycmF5IENvbmZpZ3VyYXRpb24gV2l6YXJkYCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgc3RydWN0dXJlLi4uYCk7XG4gIGxldCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQ7XG4gIHRyeSB7XG4gICAgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnROYW1lKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgLy8gRmluZCBhcnJheSBwcm9wZXJ0aWVzXG4gIGNvbnN0IGFycmF5UHJvcHMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgXG4gIGlmIChhcnJheVByb3BzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIE5vIGFycmF5IHByb3BlcnRpZXMgZm91bmQgaW4gdGhpcyBjb21wb25lbnQuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIER5bmFtaWMgYXJyYXlzIGFyZSBvbmx5IGF2YWlsYWJsZSBmb3IgYXJyYXktdHlwZSBwcm9wZXJ0aWVzLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHthcnJheVByb3BzLmxlbmd0aH0gYXJyYXkgZmllbGQocyk6YCk7XG4gIGFycmF5UHJvcHMuZm9yRWFjaCgoYXJyLCBpKSA9PiB7XG4gICAgY29uc3QgaXRlbUNvdW50ID0gYXJyLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzID8gT2JqZWN0LmtleXMoYXJyLnByb3BlcnR5Lml0ZW1zLnByb3BlcnRpZXMpLmxlbmd0aCA6IDA7XG4gICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2Fyci5wYXRofSAoJHtpdGVtQ291bnR9IGl0ZW0gcHJvcGVydGllcylgKTtcbiAgfSk7XG4gIFxuICAvLyBTZWxlY3Qgd2hpY2ggYXJyYXlzIHRvIGNvbmZpZ3VyZVxuICBjb25zdCBzZWxlY3RlZEFycmF5cyA9IGFycmF5UHJvcHMubGVuZ3RoID09PSAxIFxuICAgID8gW2FycmF5UHJvcHNbMF1dXG4gICAgOiBhd2FpdCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBjaG9pY2VzID0gYXJyYXlQcm9wcy5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdE11bHRpQ2hvaWNlKCdXaGljaCBhcnJheShzKSBkbyB5b3Ugd2FudCB0byBjb25maWd1cmU/JywgY2hvaWNlcyk7XG4gICAgICAgIHJldHVybiBhcnJheVByb3BzLmZpbHRlcihhID0+IHNlbGVjdGVkLmluY2x1ZGVzKGEucGF0aCkpO1xuICAgICAgfSkoKTtcbiAgXG4gIC8vIExvYWQgZXhpc3RpbmcgY29uZmlnXG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgbGV0IGV4aXN0aW5nQ29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7fTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgZXhpc3RpbmdDb25maWcgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhjb25maWdQYXRoLCAndXRmLTgnKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBJZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgfVxuICB9XG4gIFxuICAvLyBCdWlsZCB0aGUgaW1wb3J0IGNvbmZpZywgcHJlc2VydmluZyBleGlzdGluZyBlbnRyaWVzXG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0gZXhpc3RpbmdDb25maWcuaW1wb3J0IHx8IHsgZWxlbWVudDogZmFsc2UgfTtcbiAgaWYgKCFpbXBvcnRDb25maWcuYmxvY2sgfHwgdHlwZW9mIGltcG9ydENvbmZpZy5ibG9jayA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0ge307XG4gIH1cbiAgY29uc3QgYmxvY2tDb25maWcgPSBpbXBvcnRDb25maWcuYmxvY2sgYXMgUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPjtcbiAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID09PSAnYm9vbGVhbicpIHtcbiAgICBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID0ge307XG4gIH1cbiAgY29uc3QgY29tcG9uZW50RmllbGRDb25maWcgPSBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIGFzIFJlY29yZDxzdHJpbmcsIEZpZWxkQ29uZmlnPjtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUG9zdHNBcnJheSA9IGFzeW5jIChhcnJheVByb3A6IHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0pOiBQcm9taXNlPER5bmFtaWNBcnJheUNvbmZpZz4gPT4ge1xuICAgIC8vIFNlbGVjdGlvbiBtb2RlXG4gICAgY29uc3Qgc2VsZWN0aW9uTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHVzZXJzIHNlbGVjdCBwb3N0cz8nLFxuICAgICAgWydRdWVyeSBCdWlsZGVyIChmaWx0ZXIgYnkgdGF4b25vbXksIG9yZGVyLCBldGMuKScsICdNYW51YWwgU2VsZWN0aW9uIChoYW5kLXBpY2sgc3BlY2lmaWMgcG9zdHMpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc1F1ZXJ5TW9kZSA9IHNlbGVjdGlvbk1vZGUuaW5jbHVkZXMoJ1F1ZXJ5Jyk7XG5cbiAgICAvLyBQb3N0IHR5cGVzXG4gICAgY29uc29sZS5sb2coYFxcbkVudGVyIGFsbG93ZWQgcG9zdCB0eXBlcyAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCBwb3N0VHlwZXNJbnB1dCA9IGF3YWl0IHByb21wdChgUG9zdCB0eXBlcyBbcG9zdF06IGApO1xuICAgIGNvbnN0IHBvc3RUeXBlcyA9IHBvc3RUeXBlc0lucHV0XG4gICAgICA/IHBvc3RUeXBlc0lucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3QnXTtcblxuICAgIC8vIE1heCBpdGVtc1xuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gaXRlbXMgWzEyXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogMTI7XG5cbiAgICAvLyBSZW5kZXIgbW9kZVxuICAgIGNvbnN0IHJlbmRlck1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCBwb3N0cyBiZSByZW5kZXJlZD8nLFxuICAgICAgWydNYXBwZWQgKGNvbnZlcnQgcG9zdCBmaWVsZHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlKScsICdUZW1wbGF0ZSAodXNlIGEgUEhQIHRlbXBsYXRlIGZpbGUpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc01hcHBlZE1vZGUgPSByZW5kZXJNb2RlLmluY2x1ZGVzKCdNYXBwZWQnKTtcblxuICAgIGxldCBmaWVsZE1hcHBpbmc6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICBsZXQgdGVtcGxhdGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoaXNNYXBwZWRNb2RlKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TiiBGaWVsZCBNYXBwaW5nIENvbmZpZ3VyYXRpb25gKTtcblxuICAgICAgY29uc3QgaXRlbVByb3BzID0gYXJyYXlQcm9wLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGl0ZW1Qcm9wcykge1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IHN1Z2dlc3RGaWVsZE1hcHBpbmdzKGl0ZW1Qcm9wcyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYFxcbkknbGwgc3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBmaWVsZCBuYW1lcy4gUHJlc3MgRW50ZXIgdG8gYWNjZXB0IG9yIHR5cGUgYSBuZXcgdmFsdWUuYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5BdmFpbGFibGUgc291cmNlczpgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X3RpdGxlLCBwb3N0X2V4Y2VycHQsIHBvc3RfY29udGVudCwgcGVybWFsaW5rLCBwb3N0X2lkYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gZmVhdHVyZWRfaW1hZ2VgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X2RhdGU6ZGF5LCBwb3N0X2RhdGU6bW9udGhfc2hvcnQsIHBvc3RfZGF0ZTp5ZWFyLCBwb3N0X2RhdGU6ZnVsbGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGF1dGhvci5uYW1lLCBhdXRob3IudXJsLCBhdXRob3IuYXZhdGFyYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gdGF4b25vbXk6Y2F0ZWdvcnksIHRheG9ub215OnBvc3RfdGFnYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gbWV0YTpmaWVsZF9uYW1lYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gKGxlYXZlIGVtcHR5IHRvIHNraXApXFxuYCk7XG5cbiAgICAgICAgY29uc3QgZmxhdHRlblByb3BzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgIGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICAgICAgICBjb25zdCBwID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2goLi4uZmxhdHRlblByb3BzKHByb3AucHJvcGVydGllcywgcCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaChwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHBhdGhzO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoY29uc3QgZmllbGRQYXRoIG9mIGZsYXR0ZW5Qcm9wcyhpdGVtUHJvcHMpKSB7XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9IHN1Z2dlc3Rpb25zW2ZpZWxkUGF0aF0gfHwgJyc7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFN0ciA9IHN1Z2dlc3Rpb24gPyBgIFske3N1Z2dlc3Rpb259XWAgOiAnJztcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gYXdhaXQgcHJvbXB0KGAgICR7ZmllbGRQYXRofSR7ZGVmYXVsdFN0cn06IGApO1xuICAgICAgICAgIGNvbnN0IGZpbmFsTWFwcGluZyA9IG1hcHBpbmcgfHwgc3VnZ2VzdGlvbjtcbiAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nKSB7XG4gICAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nLnN0YXJ0c1dpdGgoJ3snKSkge1xuICAgICAgICAgICAgICB0cnkgeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IEpTT04ucGFyc2UoZmluYWxNYXBwaW5nKTsgfVxuICAgICAgICAgICAgICBjYXRjaCB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nOyB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZGVmYXVsdFRlbXBsYXRlID0gYHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvJHthcnJheVByb3AucGF0aH0taXRlbS5waHBgO1xuICAgICAgdGVtcGxhdGVQYXRoID0gYXdhaXQgcHJvbXB0KGBUZW1wbGF0ZSBwYXRoIFske2RlZmF1bHRUZW1wbGF0ZX1dOiBgKSB8fCBkZWZhdWx0VGVtcGxhdGU7XG4gICAgfVxuXG4gICAgY29uc3QgYXJyYXlDb25maWc6IER5bmFtaWNBcnJheUNvbmZpZyA9IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBwb3N0VHlwZXMsXG4gICAgICBzZWxlY3Rpb25Nb2RlOiBpc1F1ZXJ5TW9kZSA/ICdxdWVyeScgOiAnbWFudWFsJyxcbiAgICAgIG1heEl0ZW1zLFxuICAgICAgcmVuZGVyTW9kZTogaXNNYXBwZWRNb2RlID8gJ21hcHBlZCcgOiAndGVtcGxhdGUnLFxuICAgIH07XG4gICAgaWYgKGlzTWFwcGVkTW9kZSAmJiBPYmplY3Qua2V5cyhmaWVsZE1hcHBpbmcpLmxlbmd0aCA+IDApIGFycmF5Q29uZmlnLmZpZWxkTWFwcGluZyA9IGZpZWxkTWFwcGluZztcbiAgICBpZiAoIWlzTWFwcGVkTW9kZSAmJiB0ZW1wbGF0ZVBhdGgpIGFycmF5Q29uZmlnLnRlbXBsYXRlUGF0aCA9IHRlbXBsYXRlUGF0aDtcbiAgICBpZiAoaXNRdWVyeU1vZGUpIHtcbiAgICAgIGFycmF5Q29uZmlnLmRlZmF1bHRRdWVyeUFyZ3MgPSB7XG4gICAgICAgIHBvc3RzX3Blcl9wYWdlOiBNYXRoLm1pbihtYXhJdGVtcywgNiksXG4gICAgICAgIG9yZGVyYnk6ICdkYXRlJyxcbiAgICAgICAgb3JkZXI6ICdERVNDJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBhcnJheUNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIEJyZWFkY3J1bWJzQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8QnJlYWRjcnVtYnNBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBCcmVhZGNydW1icyBhcmUgYnVpbHQgYXV0b21hdGljYWxseSBmcm9tIHRoZSBjdXJyZW50IHBhZ2UgVVJMLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHdpbGwgc2hvdyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAnYnJlYWRjcnVtYnMnIH07XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBUYXhvbm9teUFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlVGF4b25vbXlBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPFRheG9ub215QXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgVGF4b25vbXkgdGVybXMgYXJlIGZldGNoZWQgZnJvbSB0aGUgY3VycmVudCBwb3N0IHNlcnZlci1zaWRlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgdG9nZ2xlIGFuZCBhIGRyb3Bkb3duIHRvIGNob29zZSB0aGUgdGF4b25vbXkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIHNsdWcgfVxcbmApO1xuXG4gICAgY29uc29sZS5sb2coYEVudGVyIHRoZSB0YXhvbm9teSBzbHVncyBlZGl0b3JzIGNhbiBjaG9vc2UgZnJvbSAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCB0YXhvbm9teUlucHV0ID0gYXdhaXQgcHJvbXB0KGBUYXhvbm9taWVzIFtwb3N0X3RhZyxjYXRlZ29yeV06IGApO1xuICAgIGNvbnN0IHRheG9ub21pZXMgPSB0YXhvbm9teUlucHV0XG4gICAgICA/IHRheG9ub215SW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdF90YWcnLCAnY2F0ZWdvcnknXTtcblxuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gdGVybXMgdG8gZGlzcGxheSAoLTEgPSBhbGwpIFstMV06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IC0xO1xuXG4gICAgY29uc3QgY29uZmlnOiBUYXhvbm9teUFycmF5Q29uZmlnID0geyBhcnJheVR5cGU6ICd0YXhvbm9teScsIHRheG9ub21pZXMgfTtcbiAgICBpZiAobWF4SXRlbXMgPiAwKSBjb25maWcubWF4SXRlbXMgPSBtYXhJdGVtcztcbiAgICByZXR1cm4gY29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgUGFnaW5hdGlvbkFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5ID0gYXN5bmMgKG90aGVyQXJyYXlQYXRoczogc3RyaW5nW10pOiBQcm9taXNlPFBhZ2luYXRpb25BcnJheUNvbmZpZyB8IG51bGw+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgUGFnaW5hdGlvbiBsaW5rcyBhcmUgZGVyaXZlZCBhdXRvbWF0aWNhbGx5IGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5IHF1ZXJ5LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcblxuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pqg77iPICBObyBzaWJsaW5nIGFycmF5cyBmb3VuZCB0byBjb25uZWN0IHRvLiBDb25maWd1cmUgYSBwb3N0cyBhcnJheSBmaXJzdC5gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBjb25uZWN0ZWRGaWVsZDogc3RyaW5nO1xuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IG90aGVyQXJyYXlQYXRoc1swXTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb25uZWN0ZWQgdG86ICR7Y29ubmVjdGVkRmllbGR9IChvbmx5IG9wdGlvbilgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgICAnV2hpY2ggcG9zdHMgYXJyYXkgc2hvdWxkIHRoaXMgcGFnaW5hdGlvbiBiZSBjb25uZWN0ZWQgdG8/JyxcbiAgICAgICAgb3RoZXJBcnJheVBhdGhzLFxuICAgICAgICAwXG4gICAgICApO1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBjaG9pY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAncGFnaW5hdGlvbicsIGNvbm5lY3RlZEZpZWxkIH07XG4gIH07XG5cbiAgLy8gQ29uZmlndXJlIGVhY2ggc2VsZWN0ZWQgYXJyYXlcbiAgZm9yIChjb25zdCBhcnJheVByb3Agb2Ygc2VsZWN0ZWRBcnJheXMpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvbmZpZ3VyaW5nOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1cXG5gKTtcblxuICAgIC8vIExldCB0aGUgdXNlciBjaG9vc2UgdGhlIGFycmF5IHR5cGVcbiAgICBjb25zdCBhcnJheVR5cGVDaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnV2hhdCBraW5kIG9mIGRhdGEgc2hvdWxkIHRoaXMgYXJyYXkgY29udGFpbj8nLFxuICAgICAgW1xuICAgICAgICAnUG9zdHMg4oCUIHF1ZXJ5IG9yIGhhbmQtcGljayBXb3JkUHJlc3MgcG9zdHMgKGRlZmF1bHQpJyxcbiAgICAgICAgJ0JyZWFkY3J1bWJzIOKAlCBhdXRvLWdlbmVyYXRlZCB0cmFpbCBmcm9tIGN1cnJlbnQgVVJMJyxcbiAgICAgICAgJ1RheG9ub215IOKAlCB0ZXJtcyBhdHRhY2hlZCB0byB0aGUgY3VycmVudCBwb3N0JyxcbiAgICAgICAgJ1BhZ2luYXRpb24g4oCUIGxpbmtzIGRlcml2ZWQgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXknLFxuICAgICAgXSxcbiAgICAgIDBcbiAgICApO1xuXG4gICAgbGV0IGFycmF5Q29uZmlnOiBGaWVsZENvbmZpZyB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdCcmVhZGNydW1icycpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdUYXhvbm9teScpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdQYWdpbmF0aW9uJykpIHtcbiAgICAgIC8vIE9mZmVyIHRoZSBvdGhlciBhbHJlYWR5LWNvbmZpZ3VyZWQgKG9yIHlldC10by1iZS1jb25maWd1cmVkKSBhcnJheSBwYXRocyBhcyBjYW5kaWRhdGVzXG4gICAgICBjb25zdCBzaWJsaW5nID0gc2VsZWN0ZWRBcnJheXNcbiAgICAgICAgLmZpbHRlcihhID0+IGEucGF0aCAhPT0gYXJyYXlQcm9wLnBhdGgpXG4gICAgICAgIC5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkoc2libGluZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFBvc3RzXG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBvc3RzQXJyYXkoYXJyYXlQcm9wKTtcbiAgICB9XG5cbiAgICBpZiAoYXJyYXlDb25maWcpIHtcbiAgICAgIGNvbXBvbmVudEZpZWxkQ29uZmlnW2FycmF5UHJvcC5wYXRoXSA9IGFycmF5Q29uZmlnO1xuICAgICAgY29uc29sZS5sb2coYFxcbuKchSBDb25maWd1cmVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH0gKCR7KGFycmF5Q29uZmlnIGFzIGFueSkuYXJyYXlUeXBlID8/ICdwb3N0cyd9KWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBTa2lwcGVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1gKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFVwZGF0ZSBjb25maWcgZmlsZSDigJQgcmVtb3ZlIGxlZ2FjeSBkeW5hbWljQXJyYXlzIGlmIHByZXNlbnRcbiAgY29uc3QgeyBkeW5hbWljQXJyYXlzOiBfbGVnYWN5RHluYW1pYywgLi4ucmVzdENvbmZpZyB9ID0gZXhpc3RpbmdDb25maWc7XG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIC4uLnJlc3RDb25maWcsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gIH07XG4gIFxuICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uIFByZXZpZXc6XFxuYCk7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHsgaW1wb3J0OiBpbXBvcnRDb25maWcgfSwgbnVsbCwgMikpO1xuICBcbiAgY29uc3Qgc2hvdWxkU2F2ZSA9IGF3YWl0IHByb21wdFllc05vKCdcXG5TYXZlIHRvIGhhbmRvZmYtd3AuY29uZmlnLmpzb24/JywgdHJ1ZSk7XG4gIFxuICBpZiAoc2hvdWxkU2F2ZSkge1xuICAgIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyFIFNhdmVkIHRvICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBOZXh0IHN0ZXBzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICAxLiBSdW46IG5wbSBydW4gZGV2IC0tICR7Y29tcG9uZW50TmFtZX0gLS1mb3JjZWApO1xuICAgIGNvbnNvbGUubG9nKGAgICAyLiBCdWlsZCB5b3VyIGJsb2NrczogY2QgZGVtby9wbHVnaW4gJiYgbnBtIHJ1biBidWlsZGApO1xuICAgIGNvbnNvbGUubG9nKGAgICAzLiBUZXN0IHRoZSBibG9jayBpbiBXb3JkUHJlc3NcXG5gKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWd1cmF0aW9uIG5vdCBzYXZlZC4gQ29weSB0aGUgSlNPTiBhYm92ZSBtYW51YWxseSBpZiBuZWVkZWQuXFxuYCk7XG4gIH1cbn07XG5cbi8vIENvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdjb25maWd1cmUtZHluYW1pYyBbY29tcG9uZW50XScpXG4gIC5hbGlhcygnd2l6YXJkJylcbiAgLmRlc2NyaXB0aW9uKCdJbnRlcmFjdGl2ZSB3aXphcmQgdG8gY29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGZvciBhIGNvbXBvbmVudCcpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctbCwgLS1saXN0JywgJ0xpc3QgYXZhaWxhYmxlIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMnKVxuICAub3B0aW9uKCctcywgLS1zb3VyY2UgPGRpcj4nLCAnUmVhZCBIYW5kb2ZmIHB1YmxpYy9hcGkgZnJvbSBkaXNrIGluc3RlYWQgb2YgSFRUUCcpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czoge1xuICAgIGFwaVVybD86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICBsaXN0PzogYm9vbGVhbjtcbiAgICBzb3VyY2U/OiBzdHJpbmc7XG4gIH0pID0+IHtcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIGNvbnN0IGxvY2FsQXBpUm9vdCA9IG9wdHMuc291cmNlID8gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdHMuc291cmNlKSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBkYXRhQ3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQgPSB7IGFwaVVybCwgYXV0aCwgbG9jYWxBcGlSb290IH07XG4gICAgXG4gICAgLy8gSWYgbGlzdGluZyBjb21wb25lbnRzLCBzaG93IGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICBpZiAob3B0cy5saXN0IHx8ICFjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBGZXRjaGluZyBjb21wb25lbnQgbGlzdCBmcm9tICR7YXBpVXJsfS4uLlxcbmApO1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudExpc3QoZGF0YUN0eCwgY29uZmlnLmltcG9ydCk7XG4gICAgICAgIFxuICAgICAgICAvLyBGZXRjaCBlYWNoIGNvbXBvbmVudCB0byBmaW5kIG9uZXMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzLiBDaGVja2luZyBmb3IgYXJyYXkgZmllbGRzLi4uXFxuYCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjb21wb25lbnRzV2l0aEFycmF5czogQXJyYXk8eyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBhcnJheXM6IHN0cmluZ1tdIH0+ID0gW107XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChkYXRhQ3R4LCBpZCk7XG4gICAgICAgICAgICBjb25zdCBhcnJheXMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIGlmIChhcnJheXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgICB0aXRsZTogY29tcG9uZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgIGFycmF5czogYXJyYXlzLm1hcChhID0+IGEucGF0aCksXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGNvbXBvbmVudHNXaXRoQXJyYXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIE5vIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMgZm91bmQuXFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+nqSBDb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzOlxcbmApO1xuICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5mb3JFYWNoKChjLCBpKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICAgIGMuYXJyYXlzLmZvckVhY2goYSA9PiBjb25zb2xlLmxvZyhgICAgICAg4pSU4pSAICR7YX1gKSk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgaWYgKG9wdHMubGlzdCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIFJ1bjogbnBtIHJ1biBkZXYgLS0gd2l6YXJkIDxjb21wb25lbnQtaWQ+XFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJbnRlcmFjdGl2ZSBzZWxlY3Rpb25cbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGNvbXBvbmVudHNXaXRoQXJyYXlzLm1hcChjID0+IGAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdENob2ljZSgnXFxuU2VsZWN0IGEgY29tcG9uZW50IHRvIGNvbmZpZ3VyZTonLCBjaG9pY2VzLCAwKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRJbmRleCA9IGNob2ljZXMuaW5kZXhPZihzZWxlY3RlZCk7XG4gICAgICAgIGNvbXBvbmVudE5hbWUgPSBjb21wb25lbnRzV2l0aEFycmF5c1tzZWxlY3RlZEluZGV4XS5pZDtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBhd2FpdCBjb25maWd1cmVEeW5hbWljQXJyYXlzKGRhdGFDdHgsIGNvbXBvbmVudE5hbWUhKTtcbiAgfSk7XG5cbi8vIEluaXQgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnaW5pdCcpXG4gIC5kZXNjcmlwdGlvbignQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy0tb3V0cHV0IDxkaXI+JywgJ091dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcycpXG4gIC5vcHRpb24oJy0tdGhlbWUtZGlyIDxkaXI+JywgJ1RoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMnKVxuICAub3B0aW9uKCctLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdPdmVyd3JpdGUgZXhpc3RpbmcgY29uZmlnIGZpbGUnKVxuICAuYWN0aW9uKChvcHRpb25zLCBjb21tYW5kKSA9PiB7XG4gICAgLy8gVXNlIG9wdHNXaXRoR2xvYmFscyB0byBnZXQgb3B0aW9ucyBmcm9tIGJvdGggc3ViY29tbWFuZCBhbmQgcGFyZW50XG4gICAgY29uc3Qgb3B0cyA9IGNvbW1hbmQub3B0c1dpdGhHbG9iYWxzKCk7XG4gICAgaW5pdENvbmZpZyhvcHRzKTtcbiAgfSk7XG5cbi8vIERlZmF1bHQgY29tbWFuZCBmb3IgYmxvY2tzXG5wcm9ncmFtXG4gIC5hcmd1bWVudCgnW2NvbXBvbmVudF0nLCAnQ29tcG9uZW50IG5hbWUgdG8gY29tcGlsZSBvciB2YWxpZGF0ZScpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCBgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6ICR7Y29uZmlnLmFwaVVybH0pYClcbiAgLm9wdGlvbignLW8sIC0tb3V0cHV0IDxkaXI+JywgYE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogJHtjb25maWcub3V0cHV0fSlgKVxuICAub3B0aW9uKCctLWFsbCcsICdDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50cycpXG4gIC5vcHRpb24oJy0tdGhlbWUnLCAnQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKSB0byB0aGVtZSBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctdCwgLS10aGVtZS1kaXIgPGRpcj4nLCBgVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcyAoZGVmYXVsdDogJHtjb25maWcudGhlbWVEaXJ9KWApXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZSBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZScsICdWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUtYWxsJywgJ1ZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdGb3JjZSBjb21waWxhdGlvbiBldmVuIHdpdGggYnJlYWtpbmcgY2hhbmdlcycpXG4gIC5vcHRpb24oJy1zLCAtLXNvdXJjZSA8ZGlyPicsICdSZWFkIEhhbmRvZmYgcHVibGljL2FwaSBmcm9tIGRpc2sgaW5zdGVhZCBvZiBIVFRQJylcbiAgLm9wdGlvbignLS13YXRjaCcsICdXYXRjaCAtLXNvdXJjZSBmb3IgY2hhbmdlcyAocmVxdWlyZXMgLS1zb3VyY2UpJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7IFxuICAgIGFwaVVybD86IHN0cmluZzsgXG4gICAgb3V0cHV0Pzogc3RyaW5nOyBcbiAgICBhbGw/OiBib29sZWFuOyBcbiAgICB0aGVtZT86IGJvb2xlYW47XG4gICAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgdmFsaWRhdGU/OiBib29sZWFuO1xuICAgIHZhbGlkYXRlQWxsPzogYm9vbGVhbjtcbiAgICBmb3JjZT86IGJvb2xlYW47XG4gICAgc291cmNlPzogc3RyaW5nO1xuICAgIHdhdGNoPzogYm9vbGVhbjtcbiAgfSkgPT4ge1xuICAgIC8vIE1lcmdlIENMSSBvcHRpb25zIHdpdGggY29uZmlnIChDTEkgdGFrZXMgcHJlY2VkZW5jZSlcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IG91dHB1dCA9IG9wdHMub3V0cHV0ID8/IGNvbmZpZy5vdXRwdXQ7XG4gICAgY29uc3QgdGhlbWVEaXIgPSBvcHRzLnRoZW1lRGlyID8/IGNvbmZpZy50aGVtZURpcjtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBjb25zdCBsb2NhbEFwaVJvb3QgPSBvcHRzLnNvdXJjZSA/IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRzLnNvdXJjZSkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZGF0YUN0eDogSGFuZG9mZkRhdGFDb250ZXh0ID0geyBhcGlVcmwsIGF1dGgsIGxvY2FsQXBpUm9vdCB9O1xuXG4gICAgaWYgKG9wdHMud2F0Y2gpIHtcbiAgICAgIGlmICghbG9jYWxBcGlSb290KSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiAtLXdhdGNoIHJlcXVpcmVzIC0tc291cmNlIDxkaXI+IChwYXRoIHRvIEhhbmRvZmYgcHVibGljL2FwaSknKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgaWYgKG9wdHMudmFsaWRhdGVBbGwgfHwgb3B0cy52YWxpZGF0ZSB8fCBvcHRzLmFsbCB8fCBvcHRzLnRoZW1lKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiAtLXdhdGNoIGNhbm5vdCBiZSBjb21iaW5lZCB3aXRoIC0tYWxsLCAtLXRoZW1lLCAtLXZhbGlkYXRlLCBvciAtLXZhbGlkYXRlLWFsbCcpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICBhd2FpdCBydW5XYXRjaE1vZGUoZGF0YUN0eCwgb3V0cHV0LCBjb21wb25lbnROYW1lLCB7IGZvcmNlOiBvcHRzLmZvcmNlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICAvLyBWYWxpZGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudmFsaWRhdGVBbGwpIHtcbiAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGRhdGFDdHgsIG91dHB1dCwgY29uZmlnLmltcG9ydCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIGlmIChvcHRzLnZhbGlkYXRlICYmIGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGRhdGFDdHgsIG91dHB1dCwgY29tcG9uZW50TmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkICYmICFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy50aGVtZSkge1xuICAgICAgYXdhaXQgY29tcGlsZVRoZW1lKGRhdGFDdHgsIHRoZW1lRGlyKTtcbiAgICB9IGVsc2UgaWYgKG9wdHMuYWxsKSB7XG4gICAgICAvLyBWYWxpZGF0ZSBhbGwgZmlyc3QgdW5sZXNzIGZvcmNlZFxuICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIFByZS1jb21waWxhdGlvbiB2YWxpZGF0aW9uLi4uXFxuYCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoZGF0YUN0eCwgb3V0cHV0LCBjb25maWcuaW1wb3J0KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gdmFsaWRhdGVBbGwgZXhpdHMgd2l0aCBjb2RlIDEgb24gYnJlYWtpbmcgY2hhbmdlc1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgY29tcGlsZUFsbChkYXRhQ3R4LCBvdXRwdXQpO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICAgICAgY29uc29sZS5sb2coYFxcbvCfk50gVXBkYXRpbmcgcHJvcGVydHkgbWFuaWZlc3QuLi5gKTtcbiAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50TGlzdChkYXRhQ3R4LCBjb25maWcuaW1wb3J0KTtcbiAgICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgY29tcG9uZW50SWQpO1xuICAgICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIC8vIEJ1aWxkIG1lcmdlZC1ncm91cCBsb29rdXAgb25jZSBmb3IgdGhpcyBicmFuY2hcbiAgICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICAgIH1cblxuICAgICAgLy8gSGVscGVyOiBjb21waWxlIGFuIGVudGlyZSBtZXJnZWQgZ3JvdXAgYnkgaXRzIGNvbmZpZyBrZXlcbiAgICAgIGNvbnN0IGNvbXBpbGVHcm91cEJ5S2V5ID0gYXN5bmMgKGdyb3VwS2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QoZGF0YUN0eCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gZ3JvdXBLZXkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50cyBmb3VuZCBmb3IgbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbEdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiBncm91cE1hdGNoZXMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZnVsbCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGRhdGFDdHgsIGMuaWQpO1xuICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhmdWxsKTtcbiAgICAgICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFNraXBwaW5nICR7Yy5pZH0gKHRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkKWApO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bGxHcm91cENvbXBvbmVudHMucHVzaChmdWxsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjLmlkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogQ291bGQgbm90IGZldGNoIGFueSBjb21wb25lbnRzIGZvciBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChkYXRhQ3R4LCBvdXRwdXQsIGdyb3VwS2V5LCBmdWxsR3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgaWYgKGRhdGFDdHgubG9jYWxBcGlSb290KSB7XG4gICAgICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhkYXRhQ3R4LCBwYXRoLnJlc29sdmUob3V0cHV0LCAnLi4nKSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKchSBHcm91cCBcIiR7Z3JvdXBLZXl9XCIgY29tcGlsZWQgKCR7ZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKS5cXG5gKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFRyeSBjb21wb25lbnQgZmlyc3QsIHRoZW4gZmFsbCBiYWNrIHRvIGdyb3VwIChlLmcuIFwiaGVyb1wiIC0+IEhlcm8gbWVyZ2VkIGJsb2NrKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgY29tcG9uZW50TmFtZSk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBjb21wb25lbnQgYmVsb25ncyB0byBhIG1lcmdlZCBncm91cCwgY29tcGlsZSB0aGUgd2hvbGUgZ3JvdXAgaW5zdGVhZFxuICAgICAgICBpZiAoY29tcG9uZW50Lmdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGNvbXBvbmVudC5ncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICBpZiAoZ3JvdXBLZXkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICBcIiR7Y29tcG9uZW50TmFtZX1cIiBiZWxvbmdzIHRvIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIg4oCUIGNvbXBpbGluZyBlbnRpcmUgZ3JvdXAuXFxuYCk7XG4gICAgICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoZGF0YUN0eCwgb3V0cHV0LCBjb21wb25lbnROYW1lKTtcbiAgICAgICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlKHtcbiAgICAgICAgICBhcGlVcmwsXG4gICAgICAgICAgb3V0cHV0RGlyOiBvdXRwdXQsXG4gICAgICAgICAgY29tcG9uZW50TmFtZSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGxvY2FsQXBpUm9vdCxcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIPCfk50gTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgICAgfSBjYXRjaCAoY29tcG9uZW50RXJyb3IpIHtcbiAgICAgICAgLy8gTm8gY29tcG9uZW50IHdpdGggdGhpcyBuYW1lIOKAkyB0cnkgYXMgZ3JvdXBcbiAgICAgICAgY29uc29sZS5sb2coYCAgIE5vIGNvbXBvbmVudCBcIiR7Y29tcG9uZW50TmFtZX1cIiBmb3VuZCwgY2hlY2tpbmcgZ3JvdXBzLi4uXFxuYCk7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBjdHhGZXRjaEFsbENvbXBvbmVudHNMaXN0KGRhdGFDdHgpO1xuICAgICAgICBjb25zdCBuYW1lTG93ZXIgPSBjb21wb25lbnROYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gbmFtZUxvd2VyLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnQgb3IgZ3JvdXAgZm91bmQgZm9yIFwiJHtjb21wb25lbnROYW1lfVwiLmApO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgICAgICBDb21wb25lbnQgZmV0Y2g6ICR7Y29tcG9uZW50RXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGNvbXBvbmVudEVycm9yLm1lc3NhZ2UgOiBjb21wb25lbnRFcnJvcn1gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgICAgIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQobmFtZUxvd2VyKSA/PyBncm91cE1hdGNoZXNbMF0uZ3JvdXA7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IFBsZWFzZSBzcGVjaWZ5IGEgY29tcG9uZW50IG5hbWUsIGdyb3VwIG5hbWUsIHVzZSAtLWFsbCBmbGFnLCAtLXRoZW1lIGZsYWcsIG9yIC0tdmFsaWRhdGUtYWxsIGZsYWcnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG5Vc2FnZTonKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+ICAgQ29tcGlsZSBvbmUgY29tcG9uZW50IChlLmcuIGhlcm8tYXJ0aWNsZSknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Z3JvdXAtbmFtZT4gICAgICBPciBjb21waWxlIGEgbWVyZ2VkIGdyb3VwIChlLmcuIGhlcm8pJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXRoZW1lJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZSBoZXJvLWFydGljbGUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsIC0tZm9yY2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSBoZXJvIC0tYXBpLXVybCBodHRwOi8vbG9jYWxob3N0OjQwMDAgLS1vdXRwdXQgLi9ibG9ja3MnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH0pO1xuXG5wcm9ncmFtLnBhcnNlKCk7XG5cbmV4cG9ydCB7IGNvbXBpbGUsIGdlbmVyYXRlQmxvY2ssIGh0dHBGZXRjaENvbXBvbmVudCBhcyBmZXRjaENvbXBvbmVudCB9O1xuIl19