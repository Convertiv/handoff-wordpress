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
const scope_editor_css_1 = require("./scope-editor-css");
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
        editor: fileConfig.editor,
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
        indexJs: (0, generators_1.generateIndexJs)(component, componentDynamicArrays, innerBlocksField, deprecationsCode, hasScreenshot, resolvedConfig.editor),
        renderPhp: (0, generators_1.generateRenderPhp)(component, componentDynamicArrays, innerBlocksField),
        editorScss: (0, generators_1.generateEditorScss)(component, { editorConfig: resolvedConfig.editor }),
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
        if (config.editor?.scopeDesignSystem !== false) {
            try {
                await (0, scope_editor_css_1.scopeDesignSystemForEditor)(contentRoot, config.editor);
            }
            catch (err) {
                console.warn(`   ⚠️  Editor CSS scoping failed: ${err instanceof Error ? err.message : err}`);
            }
        }
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
    const mergedBlock = (0, generators_1.generateMergedBlock)(groupSlug, groupComponents, variantInfos, ctx.apiUrl, variantScreenshots, config.editor);
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
    const contentRoot = path.resolve(outputDir, '..');
    if (ctx.localApiRoot) {
        await syncBundleAssets(ctx, contentRoot);
    }
    if (config.editor?.scopeDesignSystem !== false) {
        try {
            await (0, scope_editor_css_1.scopeDesignSystemForEditor)(contentRoot, config.editor);
        }
        catch (err) {
            console.warn(`   ⚠️  Editor CSS scoping failed: ${err instanceof Error ? err.message : err}`);
        }
    }
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
        if (config.editor?.scopeDesignSystem !== false) {
            console.log(`\n⚙️  Scoping design system CSS for block editor...`);
            try {
                await (0, scope_editor_css_1.scopeDesignSystemForEditor)(path.resolve(outputDir, '..'), config.editor);
            }
            catch (err) {
                console.warn(`   ⚠️  Editor CSS scoping failed: ${err instanceof Error ? err.message : err}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgseUNBQW9DO0FBQ3BDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsNkNBQStCO0FBQy9CLDJDQUE2QjtBQUM3Qix3REFBZ0M7QUFDaEMsbURBQXFDO0FBQ3JDLGlEQUF5QztBQUV6QyxtQ0FBcVQ7QUFDclQseURBQWdFO0FBNEJoRTs7R0FFRztBQUNILE1BQU0sY0FBYyxHQUFtQjtJQUNyQyxNQUFNLEVBQUUsdUJBQXVCO0lBQy9CLE1BQU0sRUFBRSxVQUFVO0lBQ2xCLFFBQVEsRUFBRSxTQUFTO0lBQ25CLFFBQVEsRUFBRSxTQUFTO0lBQ25CLFFBQVEsRUFBRSxTQUFTO0lBQ25CLE1BQU0sRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUU7SUFDMUIsTUFBTSxFQUFFLEVBQUU7Q0FDWCxDQUFDO0FBRUY7OztHQUdHO0FBQ0gsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLGFBQWlELEVBQWdCLEVBQUU7SUFDL0YsTUFBTSxZQUFZLEdBQWlCLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ3RELE1BQU0sV0FBVyxHQUEwQyxFQUFFLENBQUM7SUFFOUQsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUMxRCxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU87WUFBRSxTQUFTO1FBQzlCLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO1lBQUUsU0FBUztRQUM5QixNQUFNLFdBQVcsR0FB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SUFDSCxDQUFDO1NBQU0sQ0FBQztRQUNOLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEdBQTBHLENBQUMsQ0FBQztRQUMxSCxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0ZBQXNGLENBQUMsQ0FBQztRQUNwRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlGQUFpRixDQUFDLENBQUM7UUFDL0YsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7UUFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUNyRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdGQUFnRixDQUFDLENBQUM7UUFDOUYsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFTCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG4vKipcbiAqIEd1dGVuYmVyZyBDb21waWxlclxuICogXG4gKiBUcmFuc3BpbGVzIEhhbmRvZmYgY29tcG9uZW50cyB0byBXb3JkUHJlc3MgR3V0ZW5iZXJnIGJsb2Nrcy5cbiAqIFxuICogVXNhZ2U6XG4gKiAgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+IFtvcHRpb25zXVxuICogICBcbiAqIE9wdGlvbnM6XG4gKiAgIC0tYXBpLXVybCA8dXJsPiAgICBIYW5kb2ZmIEFQSSBiYXNlIFVSTCAoZGVmYXVsdDogaHR0cDovL2xvY2FsaG9zdDo0MDAwKVxuICogICAtLW91dHB1dCA8ZGlyPiAgICAgT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzIChkZWZhdWx0OiAuL2Jsb2NrcylcbiAqICAgLS1hbGwgICAgICAgICAgICAgIENvbXBpbGUgYWxsIGF2YWlsYWJsZSBjb21wb25lbnRzXG4gKiAgIC0tdGhlbWUgICAgICAgICAgICBDb21waWxlIGhlYWRlci9mb290ZXIgdG8gdGhlbWUgdGVtcGxhdGVzXG4gKiAgIC0tdmFsaWRhdGUgICAgICAgICBWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgY2hhbmdlc1xuICogICAtLXZhbGlkYXRlLWFsbCAgICAgVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqICAgLS1zb3VyY2UgPGRpcj4gICAgIFJlYWQgSGFuZG9mZiBBUEkgSlNPTiBmcm9tIGRpc2sgKGUuZy4gLi9zcmMvaGFuZG9mZi9wdWJsaWMvYXBpKVxuICogICAtLXdhdGNoICAgICAgICAgICAgV2F0Y2ggLS1zb3VyY2UgZm9yIGNoYW5nZXMgKHJlcXVpcmVzIC0tc291cmNlKVxuICogXG4gKiBDb25maWd1cmF0aW9uOlxuICogICBDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4geW91ciBwcm9qZWN0IHJvb3QgdG8gc2V0IGRlZmF1bHRzOlxuICogICB7XG4gKiAgICAgXCJhcGlVcmxcIjogXCJodHRwczovL2RlbW8uaGFuZG9mZi5jb21cIixcbiAqICAgICBcIm91dHB1dFwiOiBcIi4vcGF0aC90by9ibG9ja3NcIixcbiAqICAgICBcInRoZW1lRGlyXCI6IFwiLi9wYXRoL3RvL3RoZW1lXCJcbiAqICAgfVxuICovXG5cbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgY2hva2lkYXIgZnJvbSAnY2hva2lkYXInO1xuaW1wb3J0ICogYXMgcHJldHRpZXIgZnJvbSAncHJldHRpZXInO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBDb21waWxlck9wdGlvbnMsIEdlbmVyYXRlZEJsb2NrLCBIYW5kb2ZmV3BDb25maWcsIEhhbmRvZmZFZGl0b3JDb25maWcsIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBGaWVsZENvbmZpZywgSW1wb3J0Q29uZmlnLCBDb21wb25lbnRJbXBvcnRDb25maWcsIEZpZWxkUHJlZmVyZW5jZXMsIGlzRHluYW1pY0FycmF5Q29uZmlnIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBzY29wZURlc2lnblN5c3RlbUZvckVkaXRvciB9IGZyb20gJy4vc2NvcGUtZWRpdG9yLWNzcyc7XG5cbi8qKlxuICogQXV0aCBjcmVkZW50aWFscyBmb3IgSFRUUCByZXF1ZXN0c1xuICovXG5pbnRlcmZhY2UgQXV0aENyZWRlbnRpYWxzIHtcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlcXVpcmVkIGNvbmZpZyB3aXRoIGRlZmF1bHRzIGFwcGxpZWRcbiAqL1xuaW50ZXJmYWNlIFJlc29sdmVkQ29uZmlnIHtcbiAgYXBpVXJsOiBzdHJpbmc7XG4gIG91dHB1dDogc3RyaW5nO1xuICB0aGVtZURpcjogc3RyaW5nO1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIGltcG9ydDogSW1wb3J0Q29uZmlnO1xuICBncm91cHM6IFJlY29yZDxzdHJpbmcsICdtZXJnZWQnIHwgJ2luZGl2aWR1YWwnPjtcbiAgc2NoZW1hTWlncmF0aW9ucz86IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHtcbiAgICByZW5hbWVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICB0cmFuc2Zvcm1zPzogUmVjb3JkPHN0cmluZywgeyBmcm9tOiBzdHJpbmc7IHRvOiBzdHJpbmc7IHJ1bGU6IHN0cmluZyB9PjtcbiAgfT4+O1xuICBlZGl0b3I/OiBIYW5kb2ZmRWRpdG9yQ29uZmlnO1xufVxuXG4vKipcbiAqIERlZmF1bHQgY29uZmlndXJhdGlvbiB2YWx1ZXNcbiAqL1xuY29uc3QgREVGQVVMVF9DT05GSUc6IFJlc29sdmVkQ29uZmlnID0ge1xuICBhcGlVcmw6ICdodHRwOi8vbG9jYWxob3N0OjQwMDAnLFxuICBvdXRwdXQ6ICcuL2Jsb2NrcycsXG4gIHRoZW1lRGlyOiAnLi90aGVtZScsXG4gIHVzZXJuYW1lOiB1bmRlZmluZWQsXG4gIHBhc3N3b3JkOiB1bmRlZmluZWQsXG4gIGltcG9ydDogeyBlbGVtZW50OiBmYWxzZSB9LFxuICBncm91cHM6IHt9LFxufTtcblxuLyoqXG4gKiBNaWdyYXRlIGxlZ2FjeSBgZHluYW1pY0FycmF5c2AgY29uZmlnIHRvIHRoZSBuZXcgYGltcG9ydGAgc3RydWN0dXJlLlxuICogR3JvdXBzIFwiY29tcG9uZW50SWQuZmllbGROYW1lXCIgZW50cmllcyB1bmRlciBpbXBvcnQuYmxvY2tbY29tcG9uZW50SWRdW2ZpZWxkTmFtZV0uXG4gKi9cbmNvbnN0IG1pZ3JhdGVEeW5hbWljQXJyYXlzID0gKGR5bmFtaWNBcnJheXM6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZz4pOiBJbXBvcnRDb25maWcgPT4ge1xuICBjb25zdCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyA9IHsgZWxlbWVudDogZmFsc2UgfTtcbiAgY29uc3QgYmxvY2tDb25maWc6IFJlY29yZDxzdHJpbmcsIENvbXBvbmVudEltcG9ydENvbmZpZz4gPSB7fTtcblxuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoIWNvbmZpZy5lbmFibGVkKSBjb250aW51ZTtcbiAgICBjb25zdCBkb3RJbmRleCA9IGtleS5pbmRleE9mKCcuJyk7XG4gICAgaWYgKGRvdEluZGV4ID09PSAtMSkgY29udGludWU7XG4gICAgY29uc3QgY29tcG9uZW50SWQgPSBrZXkuc3Vic3RyaW5nKDAsIGRvdEluZGV4KTtcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKGRvdEluZGV4ICsgMSk7XG5cbiAgICBpZiAoIWJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSB8fCB0eXBlb2YgYmxvY2tDb25maWdbY29tcG9uZW50SWRdID09PSAnYm9vbGVhbicpIHtcbiAgICAgIGJsb2NrQ29uZmlnW2NvbXBvbmVudElkXSA9IHt9O1xuICAgIH1cbiAgICAoYmxvY2tDb25maWdbY29tcG9uZW50SWRdIGFzIFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZz4pW2ZpZWxkTmFtZV0gPSBjb25maWc7XG4gIH1cblxuICBpZiAoT2JqZWN0LmtleXMoYmxvY2tDb25maWcpLmxlbmd0aCA+IDApIHtcbiAgICBpbXBvcnRDb25maWcuYmxvY2sgPSBibG9ja0NvbmZpZztcbiAgfVxuXG4gIHJldHVybiBpbXBvcnRDb25maWc7XG59O1xuXG4vKipcbiAqIExvYWQgY29uZmlndXJhdGlvbiBmcm9tIGhhbmRvZmYtd3AuY29uZmlnLmpzb24gaWYgaXQgZXhpc3RzXG4gKi9cbmNvbnN0IGxvYWRDb25maWcgPSAoKTogSGFuZG9mZldwQ29uZmlnID0+IHtcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhjb25maWdQYXRoLCAndXRmLTgnKTtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY29uZmlnQ29udGVudCkgYXMgSGFuZG9mZldwQ29uZmlnO1xuICAgICAgY29uc29sZS5sb2coYPCfk4QgTG9hZGVkIGNvbmZpZyBmcm9tICR7Y29uZmlnUGF0aH1gKTtcbiAgICAgIHJldHVybiBjb25maWc7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBGYWlsZWQgdG8gcGFyc2UgaGFuZG9mZi13cC5jb25maWcuanNvbjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHt9O1xufTtcblxuLyoqXG4gKiBNZXJnZSBjb25maWd1cmF0aW9uIHNvdXJjZXMgd2l0aCBwcmlvcml0eTogQ0xJID4gY29uZmlnIGZpbGUgPiBkZWZhdWx0c1xuICovXG5jb25zdCBnZXRDb25maWcgPSAoKTogUmVzb2x2ZWRDb25maWcgPT4ge1xuICBjb25zdCBmaWxlQ29uZmlnID0gbG9hZENvbmZpZygpO1xuXG4gIGxldCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZztcbiAgaWYgKGZpbGVDb25maWcuaW1wb3J0KSB7XG4gICAgaW1wb3J0Q29uZmlnID0gZmlsZUNvbmZpZy5pbXBvcnQ7XG4gIH0gZWxzZSBpZiAoZmlsZUNvbmZpZy5keW5hbWljQXJyYXlzKSB7XG4gICAgY29uc29sZS53YXJuKGDimqDvuI8gIFwiZHluYW1pY0FycmF5c1wiIGNvbmZpZyBpcyBkZXByZWNhdGVkLiBNaWdyYXRlIHRvIFwiaW1wb3J0XCIg4oCUIHNlZSBTUEVDSUZJQ0FUSU9OLm1kLmApO1xuICAgIGltcG9ydENvbmZpZyA9IG1pZ3JhdGVEeW5hbWljQXJyYXlzKGZpbGVDb25maWcuZHluYW1pY0FycmF5cyk7XG4gIH0gZWxzZSB7XG4gICAgaW1wb3J0Q29uZmlnID0gREVGQVVMVF9DT05GSUcuaW1wb3J0O1xuICB9XG4gIFxuICByZXR1cm4ge1xuICAgIGFwaVVybDogZmlsZUNvbmZpZy5hcGlVcmwgPz8gREVGQVVMVF9DT05GSUcuYXBpVXJsLFxuICAgIG91dHB1dDogZmlsZUNvbmZpZy5vdXRwdXQgPz8gREVGQVVMVF9DT05GSUcub3V0cHV0LFxuICAgIHRoZW1lRGlyOiBmaWxlQ29uZmlnLnRoZW1lRGlyID8/IERFRkFVTFRfQ09ORklHLnRoZW1lRGlyLFxuICAgIHVzZXJuYW1lOiBmaWxlQ29uZmlnLnVzZXJuYW1lID8/IERFRkFVTFRfQ09ORklHLnVzZXJuYW1lLFxuICAgIHBhc3N3b3JkOiBmaWxlQ29uZmlnLnBhc3N3b3JkID8/IERFRkFVTFRfQ09ORklHLnBhc3N3b3JkLFxuICAgIGltcG9ydDogaW1wb3J0Q29uZmlnLFxuICAgIGdyb3VwczogZmlsZUNvbmZpZy5ncm91cHMgPz8gREVGQVVMVF9DT05GSUcuZ3JvdXBzLFxuICAgIHNjaGVtYU1pZ3JhdGlvbnM6IGZpbGVDb25maWcuc2NoZW1hTWlncmF0aW9ucyxcbiAgICBlZGl0b3I6IGZpbGVDb25maWcuZWRpdG9yLFxuICB9O1xufTtcblxuXG4vKipcbiAqIEJ1aWxkIEhUVFAgcmVxdWVzdCBvcHRpb25zIHdpdGggb3B0aW9uYWwgYmFzaWMgYXV0aFxuICovXG5jb25zdCBidWlsZFJlcXVlc3RPcHRpb25zID0gKHVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogaHR0cC5SZXF1ZXN0T3B0aW9ucyB8IGh0dHBzLlJlcXVlc3RPcHRpb25zID0+IHtcbiAgY29uc3QgcGFyc2VkVXJsID0gbmV3IFVSTCh1cmwpO1xuICBjb25zdCBvcHRpb25zOiBodHRwLlJlcXVlc3RPcHRpb25zID0ge1xuICAgIGhvc3RuYW1lOiBwYXJzZWRVcmwuaG9zdG5hbWUsXG4gICAgcG9ydDogcGFyc2VkVXJsLnBvcnQgfHwgKHBhcnNlZFVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyA0NDMgOiA4MCksXG4gICAgcGF0aDogcGFyc2VkVXJsLnBhdGhuYW1lICsgcGFyc2VkVXJsLnNlYXJjaCxcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIGhlYWRlcnM6IHt9LFxuICB9O1xuICBcbiAgaWYgKGF1dGg/LnVzZXJuYW1lICYmIGF1dGg/LnBhc3N3b3JkKSB7XG4gICAgY29uc3QgY3JlZGVudGlhbHMgPSBCdWZmZXIuZnJvbShgJHthdXRoLnVzZXJuYW1lfToke2F1dGgucGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIG9wdGlvbnMuaGVhZGVycyA9IHtcbiAgICAgIC4uLm9wdGlvbnMuaGVhZGVycyxcbiAgICAgICdBdXRob3JpemF0aW9uJzogYEJhc2ljICR7Y3JlZGVudGlhbHN9YCxcbiAgICB9O1xuICB9XG4gIFxuICByZXR1cm4gb3B0aW9ucztcbn07XG5cbi8vIExvYWQgY29uZmlnIGF0IHN0YXJ0dXBcbmNvbnN0IGNvbmZpZyA9IGdldENvbmZpZygpO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVCbG9ja0pzb24sXG4gIGdlbmVyYXRlSW5kZXhKcyxcbiAgZ2VuZXJhdGVSZW5kZXJQaHAsXG4gIGdlbmVyYXRlRWRpdG9yU2NzcyxcbiAgZ2VuZXJhdGVTdHlsZVNjc3MsXG4gIGdlbmVyYXRlUmVhZG1lLFxuICB0b0Jsb2NrTmFtZSxcbiAgZ2VuZXJhdGVIZWFkZXJQaHAsXG4gIGdlbmVyYXRlRm9vdGVyUGhwLFxuICBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocCxcbiAgZ2VuZXJhdGVDYXRlZ29yaWVzUGhwLFxuICBnZW5lcmF0ZVNoYXJlZENvbXBvbmVudHMsXG4gIGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hLFxuICBnZW5lcmF0ZU1lcmdlZEJsb2NrLFxuICBnZW5lcmF0ZURlcHJlY2F0aW9ucyxcbiAgZ2VuZXJhdGVTY2hlbWFDaGFuZ2Vsb2csXG59IGZyb20gJy4vZ2VuZXJhdG9ycyc7XG5pbXBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB7XG4gIGdldEFjdGl2ZUJsb2NrU2x1Z3MsXG4gIHJlY29uY2lsZUxvY2FsQmxvY2tzLFxufSBmcm9tICcuL2Jsb2NrLWxpZmVjeWNsZSc7XG5pbXBvcnQge1xuICBsb2FkTWFuaWZlc3QsXG4gIHNhdmVNYW5pZmVzdCxcbiAgdmFsaWRhdGVDb21wb25lbnQsXG4gIHVwZGF0ZU1hbmlmZXN0LFxuICBnZXRDb21wb25lbnRIaXN0b3J5LFxuICBleHRyYWN0UHJvcGVydGllcyxcbiAgZm9ybWF0VmFsaWRhdGlvblJlc3VsdCxcbiAgVmFsaWRhdGlvblJlc3VsdCxcbiAgdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyxcbiAgZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0XG59IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYUhpc3RvcnkgfSBmcm9tICcuL3ZhbGlkYXRvcnMnO1xuXG4vLyBMb2FkIFBIUCBwbHVnaW4gZm9yIFByZXR0aWVyICh1c2luZyByZXF1aXJlIGZvciBjb21wYXRpYmlsaXR5KVxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbmNvbnN0IHBocFBsdWdpbiA9IHJlcXVpcmUoJ0BwcmV0dGllci9wbHVnaW4tcGhwJyk7XG5cbi8qKlxuICogRm9ybWF0IGNvZGUgd2l0aCBQcmV0dGllclxuICovXG5jb25zdCBmb3JtYXRDb2RlID0gYXN5bmMgKGNvZGU6IHN0cmluZywgcGFyc2VyOiAnYmFiZWwnIHwgJ2pzb24nIHwgJ3Njc3MnIHwgJ3BocCcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IG9wdGlvbnM6IHByZXR0aWVyLk9wdGlvbnMgPSB7XG4gICAgICBwYXJzZXIsXG4gICAgICBzaW5nbGVRdW90ZTogdHJ1ZSxcbiAgICAgIHRhYldpZHRoOiAyLFxuICAgICAgcHJpbnRXaWR0aDogMTAwLFxuICAgICAgdHJhaWxpbmdDb21tYTogJ2VzNScsXG4gICAgfTtcbiAgICBcbiAgICAvLyBMb2FkIFBIUCBwbHVnaW4gZm9yIFBIUCBmaWxlc1xuICAgIGlmIChwYXJzZXIgPT09ICdwaHAnKSB7XG4gICAgICBvcHRpb25zLnBsdWdpbnMgPSBbcGhwUGx1Z2luXTtcbiAgICAgIC8vIFBIUC1zcGVjaWZpYyBvcHRpb25zIC0gY2FzdCB0byBhbnkgZm9yIHBsdWdpbi1zcGVjaWZpYyBvcHRpb25zXG4gICAgICAob3B0aW9ucyBhcyBhbnkpLnBocFZlcnNpb24gPSAnOC4wJztcbiAgICAgIChvcHRpb25zIGFzIGFueSkuYnJhY2VTdHlsZSA9ICcxdGJzJztcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGF3YWl0IHByZXR0aWVyLmZvcm1hdChjb2RlLCBvcHRpb25zKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBJZiBmb3JtYXR0aW5nIGZhaWxzLCByZXR1cm4gb3JpZ2luYWwgY29kZVxuICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBQcmV0dGllciBmb3JtYXR0aW5nIGZhaWxlZCBmb3IgJHtwYXJzZXJ9LCB1c2luZyB1bmZvcm1hdHRlZCBjb2RlYCk7XG4gICAgcmV0dXJuIGNvZGU7XG4gIH1cbn07XG5cbmNvbnN0IHByb2dyYW0gPSBuZXcgQ29tbWFuZCgpO1xuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IGNvcHkgYSBkaXJlY3RvcnkgdHJlZSwgY3JlYXRpbmcgdGFyZ2V0IGRpcnMgYXMgbmVlZGVkLlxuICovXG5jb25zdCBjb3B5RGlyUmVjdXJzaXZlID0gKHNyYzogc3RyaW5nLCBkZXN0OiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGRlc3QpKSB7XG4gICAgZnMubWtkaXJTeW5jKGRlc3QsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGZvciAoY29uc3QgZW50cnkgb2YgZnMucmVhZGRpclN5bmMoc3JjKSkge1xuICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4oc3JjLCBlbnRyeSk7XG4gICAgY29uc3QgZGVzdFBhdGggPSBwYXRoLmpvaW4oZGVzdCwgZW50cnkpO1xuICAgIGlmIChmcy5zdGF0U3luYyhzcmNQYXRoKS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICBjb3B5RGlyUmVjdXJzaXZlKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYSBwYWNrYWdlLmpzb24gaW4gdGhlIGNvbnRlbnQgZGlyZWN0b3J5IGFuZCBydW4gbnBtIGluc3RhbGxcbiAqIHNvIHRoYXQgYmxvY2tzIGFuZCBzaGFyZWQgY29tcG9uZW50cyBjYW4gcmVzb2x2ZSB0aGVpciBpbXBvcnRzLlxuICovXG5jb25zdCBlbnN1cmVDb250ZW50RGVwZW5kZW5jaWVzID0gKGNvbnRlbnRSb290OiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgY29uc3QgcGtnUGF0aCA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ3BhY2thZ2UuanNvbicpO1xuXG4gIGNvbnN0IHBrZyA9IHtcbiAgICBuYW1lOiAnaGFuZG9mZi1ibG9ja3MtY29udGVudCcsXG4gICAgdmVyc2lvbjogJzEuMC4wJyxcbiAgICBwcml2YXRlOiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQXV0by1nZW5lcmF0ZWQgYnkgSGFuZG9mZiBjb21waWxlciDigJQgYmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzLicsXG4gICAgZGVwZW5kZW5jaWVzOiB7XG4gICAgICAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc6ICdeMS4yMi4xJyxcbiAgICB9LFxuICAgIGRldkRlcGVuZGVuY2llczoge1xuICAgICAgJ0B3b3JkcHJlc3MvYXBpLWZldGNoJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvYmxvY2tzJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2NvcmUtZGF0YSc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2RhdGEnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9lbGVtZW50JzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvaTE4bic6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2ljb25zJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3Mvc2NyaXB0cyc6ICdeMjcuMC4wJyxcbiAgICAgICdjb3B5LXdlYnBhY2stcGx1Z2luJzogJ14xMS4wLjAnLFxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgZGVzaXJlZCA9IEpTT04uc3RyaW5naWZ5KHBrZywgbnVsbCwgMikgKyAnXFxuJztcblxuICBsZXQgbmVlZHNJbnN0YWxsID0gdHJ1ZTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMocGtnUGF0aCkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGZzLnJlYWRGaWxlU3luYyhwa2dQYXRoLCAndXRmOCcpO1xuICAgIGlmIChleGlzdGluZyA9PT0gZGVzaXJlZCkge1xuICAgICAgbmVlZHNJbnN0YWxsID0gIWZzLmV4aXN0c1N5bmMocGF0aC5qb2luKGNvbnRlbnRSb290LCAnbm9kZV9tb2R1bGVzJykpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChuZWVkc0luc3RhbGwpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+TpiBJbnN0YWxsaW5nIGJsb2NrIGJ1aWxkIGRlcGVuZGVuY2llcy4uLmApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGtnUGF0aCwgZGVzaXJlZCk7XG4gICAgdHJ5IHtcbiAgICAgIGV4ZWNTeW5jKCducG0gaW5zdGFsbCAtLWlnbm9yZS1zY3JpcHRzJywge1xuICAgICAgICBjd2Q6IGNvbnRlbnRSb290LFxuICAgICAgICBzdGRpbzogJ2luaGVyaXQnLFxuICAgICAgfSk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERlcGVuZGVuY2llcyBpbnN0YWxsZWQgaW4gJHtjb250ZW50Um9vdH1gKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBucG0gaW5zdGFsbCBmYWlsZWQg4oCUIHlvdSBtYXkgbmVlZCB0byBydW4gaXQgbWFudWFsbHkgaW4gJHtjb250ZW50Um9vdH1gKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coYFxcbvCfk6YgQmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzIGFscmVhZHkgdXAgdG8gZGF0ZWApO1xuICB9XG59O1xuXG4vKipcbiAqIERvd25sb2FkIGEgZmlsZSBmcm9tIGEgVVJMIGFuZCBzYXZlIGl0IHRvIGRpc2sgKEhUVFAgb25seSlcbiAqL1xuY29uc3QgaHR0cERvd25sb2FkRmlsZSA9IGFzeW5jICh1cmw6IHN0cmluZywgZGVzdFBhdGg6IHN0cmluZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIC8vIEhhbmRsZSByZWRpcmVjdHNcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gMzAxIHx8IHJlcy5zdGF0dXNDb2RlID09PSAzMDIpIHtcbiAgICAgICAgY29uc3QgcmVkaXJlY3RVcmwgPSByZXMuaGVhZGVycy5sb2NhdGlvbjtcbiAgICAgICAgaWYgKHJlZGlyZWN0VXJsKSB7XG4gICAgICAgICAgaHR0cERvd25sb2FkRmlsZShyZWRpcmVjdFVybCwgZGVzdFBhdGgsIGF1dGgpLnRoZW4ocmVzb2x2ZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gZG93bmxvYWQgc2NyZWVuc2hvdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBmaWxlU3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oZGVzdFBhdGgpO1xuICAgICAgcmVzLnBpcGUoZmlsZVN0cmVhbSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsICgpID0+IHtcbiAgICAgICAgZmlsZVN0cmVhbS5jbG9zZSgpO1xuICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICBmcy51bmxpbmsoZGVzdFBhdGgsICgpID0+IHt9KTsgLy8gQ2xlYW4gdXAgcGFydGlhbCBmaWxlXG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gc2F2ZSBzY3JlZW5zaG90OiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgRmFpbGVkIHRvIGRvd25sb2FkIHNjcmVlbnNob3Q6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBjb21wb25lbnQgZGF0YSBmcm9tIEhhbmRvZmYgQVBJIChIVFRQIG9ubHkpXG4gKi9cbmNvbnN0IGh0dHBGZXRjaENvbXBvbmVudCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgY29tcG9uZW50TmFtZTogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50PiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudC8ke2NvbXBvbmVudE5hbWV9Lmpzb25gO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgXG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEhhbmRvZmZDb21wb25lbnQ7XG4gICAgICAgICAgcmVzb2x2ZShjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudCBKU09OOiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudDogJHtlLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYWxsIGJsb2NrIGZpbGVzIGZyb20gYSBjb21wb25lbnRcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGFwaVVybCAtIFRoZSBiYXNlIEFQSSBVUkwgZm9yIGZldGNoaW5nIHNjcmVlbnNob3RzXG4gKiBAcGFyYW0gcmVzb2x2ZWRDb25maWcgLSBUaGUgcmVzb2x2ZWQgY29uZmlndXJhdGlvbiBpbmNsdWRpbmcgZHluYW1pYyBhcnJheSBzZXR0aW5nc1xuICovXG5jb25zdCBnZW5lcmF0ZUJsb2NrID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCwgYXBpVXJsOiBzdHJpbmcsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZywgc2NoZW1hSGlzdG9yeT86IFNjaGVtYUhpc3RvcnkpOiBHZW5lcmF0ZWRCbG9jayA9PiB7XG4gIGNvbnN0IGhhc1NjcmVlbnNob3QgPSAhIWNvbXBvbmVudC5pbWFnZTtcbiAgXG4gIC8vIENvbnN0cnVjdCBmdWxsIHNjcmVlbnNob3QgVVJMIGlmIGltYWdlIHBhdGggaXMgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGlmIChjb21wb25lbnQuaW1hZ2UpIHtcbiAgICAvLyBIYW5kbGUgYm90aCBhYnNvbHV0ZSBVUkxzIGFuZCByZWxhdGl2ZSBwYXRoc1xuICAgIGlmIChjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cDovLycpIHx8IGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICBzY3JlZW5zaG90VXJsID0gY29tcG9uZW50LmltYWdlO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSZWxhdGl2ZSBwYXRoIC0gcHJlcGVuZCBBUEkgVVJMXG4gICAgICBzY3JlZW5zaG90VXJsID0gYCR7YXBpVXJsfSR7Y29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJy8nKSA/ICcnIDogJy8nfSR7Y29tcG9uZW50LmltYWdlfWA7XG4gICAgfVxuICB9XG4gIFxuICAvLyBFeHRyYWN0IGR5bmFtaWMgYXJyYXkgY29uZmlncyBmb3IgdGhpcyBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZ1xuICBjb25zdCBjb21wb25lbnREeW5hbWljQXJyYXlzID0ge1xuICAgIC4uLmV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydClcbiAgfTtcbiAgXG4gIC8vIEF1dG8tZGV0ZWN0IHBhZ2luYXRpb24gZm9yIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGVudHJpZXMgb25seVxuICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50RHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoJ2FycmF5VHlwZScgaW4gZHluQ29uZmlnKSBjb250aW51ZTsgLy8gU2tpcCBzcGVjaWFsaXNlZCBhcnJheSB0eXBlc1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgIGlmIChwcm9wPy50eXBlID09PSAnYXJyYXknICYmIHByb3AucGFnaW5hdGlvbj8udHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBjb25zdCBwYWdpbmF0aW9uRmllbGRSZWdleCA9IG5ldyBSZWdFeHAoXG4gICAgICAgIGBcXFxce1xcXFx7XFxcXHMqI2ZpZWxkXFxcXHMrW1wiJ10ke2ZpZWxkTmFtZX1cXFxcLnBhZ2luYXRpb25bXCInXWBcbiAgICAgICk7XG4gICAgICBpZiAocGFnaW5hdGlvbkZpZWxkUmVnZXgudGVzdChjb21wb25lbnQuY29kZSkpIHtcbiAgICAgICAgKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24gPSB7IHByb3BlcnR5TmFtZTogJ3BhZ2luYXRpb24nIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIHJpY2h0ZXh0IGZpZWxkIChpZiBhbnkpIHVzZXMgSW5uZXJCbG9ja3NcbiAgY29uc3QgZmllbGRQcmVmcyA9IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCk7XG4gIGNvbnN0IHJpY2h0ZXh0RmllbGRzID0gT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpXG4gICAgLmZpbHRlcigoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICAvLyBDaGVjayBleHBsaWNpdCBjb25maWcgb3ZlcnJpZGVzIGZpcnN0XG4gIGNvbnN0IGV4cGxpY2l0SW5uZXJCbG9ja3MgPSBPYmplY3QuZW50cmllcyhmaWVsZFByZWZzKVxuICAgIC5maWx0ZXIoKFssIHByZWZzXSkgPT4gcHJlZnMuaW5uZXJCbG9ja3MgPT09IHRydWUpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgbGV0IGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IG9ubHkgb25lIHJpY2h0ZXh0IGZpZWxkIHBlciBibG9jayBjYW4gdXNlIElubmVyQmxvY2tzLCBgICtcbiAgICAgIGBidXQgJHtleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aH0gYXJlIG1hcmtlZDogJHtleHBsaWNpdElubmVyQmxvY2tzLmpvaW4oJywgJyl9YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBmaWVsZCA9IGV4cGxpY2l0SW5uZXJCbG9ja3NbMF07XG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkXTtcbiAgICBpZiAoIXByb3AgfHwgcHJvcC50eXBlICE9PSAncmljaHRleHQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogZmllbGQgXCIke2ZpZWxkfVwiIGlzIG1hcmtlZCBhcyBpbm5lckJsb2NrcyBidXQgaXMgbm90IGEgcmljaHRleHQgZmllbGRgXG4gICAgICApO1xuICAgIH1cbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gZmllbGQ7XG4gIH0gZWxzZSBpZiAocmljaHRleHRGaWVsZHMubGVuZ3RoID09PSAxKSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IHJpY2h0ZXh0RmllbGRzWzBdO1xuICB9IGVsc2Uge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSBudWxsO1xuICB9XG4gIFxuICBjb25zdCBoaXN0b3J5RW50cnkgPSBzY2hlbWFIaXN0b3J5ID8gZ2V0Q29tcG9uZW50SGlzdG9yeShzY2hlbWFIaXN0b3J5LCBjb21wb25lbnQuaWQpIDogdW5kZWZpbmVkO1xuICBjb25zdCBjdXJyZW50UHJvcHMgPSBleHRyYWN0UHJvcGVydGllcyhjb21wb25lbnQucHJvcGVydGllcyk7XG4gIGNvbnN0IG1pZ3JhdGlvbk92ZXJyaWRlcyA9IHJlc29sdmVkQ29uZmlnLnNjaGVtYU1pZ3JhdGlvbnM/Lltjb21wb25lbnQuaWRdO1xuICBjb25zdCBkZXByZWNhdGlvbnNDb2RlID0gZ2VuZXJhdGVEZXByZWNhdGlvbnMoXG4gICAgaGlzdG9yeUVudHJ5LFxuICAgIGN1cnJlbnRQcm9wcyxcbiAgICBtaWdyYXRpb25PdmVycmlkZXMsXG4gICAgISFpbm5lckJsb2Nrc0ZpZWxkXG4gICk7XG5cbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlQmxvY2tKc29uKGNvbXBvbmVudCwgaGFzU2NyZWVuc2hvdCwgYXBpVXJsLCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBpbmRleEpzOiBnZW5lcmF0ZUluZGV4SnMoXG4gICAgICBjb21wb25lbnQsXG4gICAgICBjb21wb25lbnREeW5hbWljQXJyYXlzLFxuICAgICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICAgIGRlcHJlY2F0aW9uc0NvZGUsXG4gICAgICBoYXNTY3JlZW5zaG90LFxuICAgICAgcmVzb2x2ZWRDb25maWcuZWRpdG9yLFxuICAgICksXG4gICAgcmVuZGVyUGhwOiBnZW5lcmF0ZVJlbmRlclBocChjb21wb25lbnQsIGNvbXBvbmVudER5bmFtaWNBcnJheXMsIGlubmVyQmxvY2tzRmllbGQpLFxuICAgIGVkaXRvclNjc3M6IGdlbmVyYXRlRWRpdG9yU2Nzcyhjb21wb25lbnQsIHsgZWRpdG9yQ29uZmlnOiByZXNvbHZlZENvbmZpZy5lZGl0b3IgfSksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZVN0eWxlU2Nzcyhjb21wb25lbnQpLFxuICAgIHJlYWRtZTogZ2VuZXJhdGVSZWFkbWUoY29tcG9uZW50KSxcbiAgICBtaWdyYXRpb25TY2hlbWE6IGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hKGNvbXBvbmVudCksXG4gICAgc2NoZW1hQ2hhbmdlbG9nOiBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyhjb21wb25lbnQuaWQsIGhpc3RvcnlFbnRyeSksXG4gICAgc2NyZWVuc2hvdFVybFxuICB9O1xufTtcblxuLyoqXG4gKiBXcml0ZSBibG9jayBmaWxlcyB0byBvdXRwdXQgZGlyZWN0b3J5XG4gKi9cbmNvbnN0IHdyaXRlQmxvY2tGaWxlcyA9IGFzeW5jIChcbiAgb3V0cHV0RGlyOiBzdHJpbmcsXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGJsb2NrOiBHZW5lcmF0ZWRCbG9jayxcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50SWQpO1xuICBjb25zdCBibG9ja0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGJsb2NrTmFtZSk7XG4gIFxuICAvLyBDcmVhdGUgYmxvY2sgZGlyZWN0b3J5XG4gIGlmICghZnMuZXhpc3RzU3luYyhibG9ja0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoYmxvY2tEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIFxuICAvLyBGb3JtYXQgYWxsIGNvZGUgZmlsZXMgd2l0aCBQcmV0dGllclxuICBjb25zdCBmb3JtYXR0ZWRCbG9ja0pzb24gPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmJsb2NrSnNvbiwgJ2pzb24nKTtcbiAgY29uc3QgZm9ybWF0dGVkSW5kZXhKcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suaW5kZXhKcywgJ2JhYmVsJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEVkaXRvclNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmVkaXRvclNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFN0eWxlU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suc3R5bGVTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBcbiAgLy8gV3JpdGUgZmlsZXNcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdSRUFETUUubWQnKSwgYmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgYmxvY2subWlncmF0aW9uU2NoZW1hKTtcbiAgaWYgKGJsb2NrLnNjaGVtYUNoYW5nZWxvZykge1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnc2NoZW1hLWNoYW5nZWxvZy5qc29uJyksIGJsb2NrLnNjaGVtYUNoYW5nZWxvZyk7XG4gIH1cbiAgXG4gIC8vIERvd25sb2FkIHNjcmVlbnNob3QgaWYgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90RG93bmxvYWRlZCA9IGZhbHNlO1xuICBpZiAoYmxvY2suc2NyZWVuc2hvdFVybCkge1xuICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoID0gcGF0aC5qb2luKGJsb2NrRGlyLCAnc2NyZWVuc2hvdC5wbmcnKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TtyBEb3dubG9hZGluZyBzY3JlZW5zaG90Li4uYCk7XG4gICAgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCBibG9jay5zY3JlZW5zaG90VXJsLCBzY3JlZW5zaG90UGF0aCk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkIGJsb2NrOiAke2Jsb2NrTmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtibG9ja0Rpcn1gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgYmxvY2suanNvbmApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBpbmRleC5qc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCByZW5kZXIucGhwYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGVkaXRvci5zY3NzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHN0eWxlLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgUkVBRE1FLm1kYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIG1pZ3JhdGlvbi1zY2hlbWEuanNvbmApO1xuICBpZiAoc2NyZWVuc2hvdERvd25sb2FkZWQpIHtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+WvO+4jyAgc2NyZWVuc2hvdC5wbmdgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBNYWluIGNvbXBpbGF0aW9uIGZ1bmN0aW9uXG4gKi9cbmNvbnN0IGNvbXBpbGUgPSBhc3luYyAob3B0aW9uczogQ29tcGlsZXJPcHRpb25zKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IGRhdGFDdHg6IEhhbmRvZmZEYXRhQ29udGV4dCA9IHtcbiAgICBhcGlVcmw6IG9wdGlvbnMuYXBpVXJsLFxuICAgIGF1dGg6IG9wdGlvbnMuYXV0aCxcbiAgICBsb2NhbEFwaVJvb3Q6IG9wdGlvbnMubG9jYWxBcGlSb290LFxuICB9O1xuXG4gIGNvbnNvbGUubG9nKGBcXG7wn5SnIEd1dGVuYmVyZyBDb21waWxlcmApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke29wdGlvbnMuYXBpVXJsfWApO1xuICBpZiAoZGF0YUN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2RhdGFDdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudDogJHtvcHRpb25zLmNvbXBvbmVudE5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBPdXRwdXQ6ICR7b3B0aW9ucy5vdXRwdXREaXJ9YCk7XG4gIGlmIChvcHRpb25zLmF1dGg/LnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIEF1dGg6ICR7b3B0aW9ucy5hdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gRmV0Y2ggY29tcG9uZW50IGZyb20gQVBJXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGRhdGEuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChkYXRhQ3R4LCBvcHRpb25zLmNvbXBvbmVudE5hbWUpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9ICgke2NvbXBvbmVudC5pZH0pXFxuYCk7XG4gICAgXG4gICAgLy8gVmFsaWRhdGUgdGVtcGxhdGUgdmFyaWFibGVzIGJlZm9yZSBnZW5lcmF0aW5nXG4gICAgY29uc29sZS5sb2coYPCflI0gVmFsaWRhdGluZyB0ZW1wbGF0ZSB2YXJpYWJsZXMuLi5gKTtcbiAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGNvbXBvbmVudCk7XG4gICAgY29uc29sZS5sb2coZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0KHRlbXBsYXRlVmFsaWRhdGlvbikpO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICBcbiAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgVGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQhIEZpeCB0aGUgdW5kZWZpbmVkIHZhcmlhYmxlcyBiZWZvcmUgY29tcGlsaW5nLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBibG9jayBmaWxlcyAod2l0aCBkZXByZWNhdGlvbiBzdXBwb3J0IGZyb20gc2NoZW1hIGhpc3RvcnkpXG4gICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBHdXRlbmJlcmcgYmxvY2suLi5gKTtcbiAgICBjb25zdCBzY2hlbWFIaXN0b3J5ID0gbG9hZE1hbmlmZXN0KG9wdGlvbnMub3V0cHV0RGlyKTtcbiAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBvcHRpb25zLmFwaVVybCwgY29uZmlnLCBzY2hlbWFIaXN0b3J5KTtcbiAgICBcbiAgICAvLyBXcml0ZSBmaWxlcyAod2l0aCBQcmV0dGllciBmb3JtYXR0aW5nKVxuICAgIGF3YWl0IHdyaXRlQmxvY2tGaWxlcyhvcHRpb25zLm91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgZGF0YUN0eCk7XG5cbiAgICBjb25zdCBjb250ZW50Um9vdCA9IHBhdGgucmVzb2x2ZShvcHRpb25zLm91dHB1dERpciwgJy4uJyk7XG4gICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhkYXRhQ3R4LCBjb250ZW50Um9vdCk7XG4gICAgaWYgKGNvbmZpZy5lZGl0b3I/LnNjb3BlRGVzaWduU3lzdGVtICE9PSBmYWxzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2NvcGVEZXNpZ25TeXN0ZW1Gb3JFZGl0b3IoY29udGVudFJvb3QsIGNvbmZpZy5lZGl0b3IpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgICAg4pqg77iPICBFZGl0b3IgQ1NTIHNjb3BpbmcgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBlcnJ9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIERvbmUhIERvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2hlY2sgd2hldGhlciBhIGNvbXBvbmVudCBzaG91bGQgYmUgaW1wb3J0ZWQgYmFzZWQgb24gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IHNob3VsZEltcG9ydENvbXBvbmVudCA9IChjb21wb25lbnRJZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnKTogYm9vbGVhbiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG5cbiAgLy8gVHlwZSBub3QgbGlzdGVkIGluIGltcG9ydCBjb25maWcg4oCUIGRlZmF1bHQgdG8gdHJ1ZSAoaW1wb3J0KVxuICBpZiAodHlwZUNvbmZpZyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgLy8gRW50aXJlIHR5cGUgZGlzYWJsZWRcbiAgaWYgKHR5cGVDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEVudGlyZSB0eXBlIGVuYWJsZWQgd2l0aCBubyBwZXItY29tcG9uZW50IG92ZXJyaWRlc1xuICBpZiAodHlwZUNvbmZpZyA9PT0gdHJ1ZSkgcmV0dXJuIHRydWU7XG5cbiAgLy8gUGVyLWNvbXBvbmVudCBsb29rdXAgd2l0aGluIHRoZSB0eXBlIG9iamVjdFxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgLy8gTm90IGxpc3RlZCDigJQgaW1wb3J0IHdpdGggZGVmYXVsdHMgKHR5cGUtb2JqZWN0IG1lYW5zIFwiaW1wb3J0IGFsbCwgb3ZlcnJpZGUgbGlzdGVkXCIpXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEV4cGxpY2l0bHkgZGlzYWJsZWRcbiAgaWYgKGNvbXBvbmVudENvbmZpZyA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgLy8gRXhwbGljaXRseSBlbmFibGVkIG9yIGhhcyBmaWVsZCBvdmVycmlkZXNcbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgcmF3IHBlci1maWVsZCBjb25maWcgb2JqZWN0IGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MgPSAoXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWdcbik6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEZpZWxkUHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3QgdHlwZUNvbmZpZyA9IGltcG9ydENvbmZpZ1tjb21wb25lbnRUeXBlXTtcbiAgaWYgKCF0eXBlQ29uZmlnIHx8IHR5cGVvZiB0eXBlQ29uZmlnID09PSAnYm9vbGVhbicpIHJldHVybiB7fTtcblxuICBjb25zdCBjb21wb25lbnRDb25maWcgPSB0eXBlQ29uZmlnW2NvbXBvbmVudElkXTtcbiAgaWYgKCFjb21wb25lbnRDb25maWcgfHwgdHlwZW9mIGNvbXBvbmVudENvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgcmV0dXJuIGNvbXBvbmVudENvbmZpZyBhcyBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPjtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBkeW5hbWljIGFycmF5IGNvbmZpZ3MgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3REeW5hbWljQXJyYXlDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoYWxsQ29uZmlncykpIHtcbiAgICBpZiAoaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZmllbGQgcHJlZmVyZW5jZXMgZm9yIGEgY29tcG9uZW50IGZyb20gdGhlIGltcG9ydCBjb25maWcuXG4gKi9cbmNvbnN0IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IGFsbENvbmZpZ3MgPSBnZXRDb21wb25lbnRGaWVsZENvbmZpZ3MoY29tcG9uZW50SWQsIGNvbXBvbmVudFR5cGUsIGltcG9ydENvbmZpZyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKCFpc0R5bmFtaWNBcnJheUNvbmZpZyhjb25maWcpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IGNvbmZpZztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRmV0Y2ggbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSwgZmlsdGVyZWQgYnkgaW1wb3J0IGNvbmZpZyAoSFRUUCBvbmx5KVxuICovXG5jb25zdCBodHRwRmV0Y2hDb21wb25lbnRMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZywgYXV0aD86IEF1dGhDcmVkZW50aWFscyk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcHJvdG9jb2wgPSB1cmwuc3RhcnRzV2l0aCgnaHR0cHMnKSA/IGh0dHBzIDogaHR0cDtcbiAgICBjb25zdCBvcHRpb25zID0gYnVpbGRSZXF1ZXN0T3B0aW9ucyh1cmwsIGF1dGgpO1xuICAgIFxuICAgIHByb3RvY29sLmdldChvcHRpb25zLCAocmVzKSA9PiB7XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBmYWlsZWQ6IEhUVFAgNDAxLiBDaGVjayB5b3VyIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnQgbGlzdDogSFRUUCAke3Jlcy5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICBjb25zdCBmaWx0ZXJlZCA9IGNvbXBvbmVudHMuZmlsdGVyKGMgPT4gc2hvdWxkSW1wb3J0Q29tcG9uZW50KGMuaWQsIGMudHlwZSwgaW1wb3J0Q29uZmlnKSk7XG4gICAgICAgICAgcmVzb2x2ZShmaWx0ZXJlZC5tYXAoYyA9PiBjLmlkKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50cyBsaXN0OiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudHM6ICR7ZS5tZXNzYWdlfWApKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEZldGNoIGZ1bGwgbGlzdCBvZiBhbGwgY29tcG9uZW50cyBmcm9tIEFQSSAobm8gaW1wb3J0IGZpbHRlcikuIFVzZWQgdG8gcmVzb2x2ZSBncm91cCBuYW1lcyAoSFRUUCBvbmx5KS5cbiAqL1xuY29uc3QgaHR0cEZldGNoQWxsQ29tcG9uZW50c0xpc3QgPSBhc3luYyAoYXBpVXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnRbXT4gPT4ge1xuICBjb25zdCB1cmwgPSBgJHthcGlVcmx9L2FwaS9jb21wb25lbnRzLmpzb25gO1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50IGxpc3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEFycmF5PEhhbmRvZmZDb21wb25lbnQ+O1xuICAgICAgICAgIHJlc29sdmUoY29tcG9uZW50cyk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50cyBsaXN0OiAke2V9YCkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KS5vbignZXJyb3InLCAoZSkgPT4gcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudHM6ICR7ZS5tZXNzYWdlfWApKSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBEYXRhIGFjY2VzcyBjb250ZXh0OiBIVFRQIEhhbmRvZmYgQVBJIG9yIGxvY2FsIGBwdWJsaWMvYXBpYCBmb2xkZXIgKC0tc291cmNlKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBIYW5kb2ZmRGF0YUNvbnRleHQge1xuICBhcGlVcmw6IHN0cmluZztcbiAgYXV0aD86IEF1dGhDcmVkZW50aWFscztcbiAgLyoqIEFic29sdXRlIHBhdGggdG8gSGFuZG9mZiBgcHVibGljL2FwaWAgKGNvbnRhaW5zIGBjb21wb25lbnRzLmpzb25gICsgYGNvbXBvbmVudC9gKSAqL1xuICBsb2NhbEFwaVJvb3Q/OiBzdHJpbmc7XG59XG5cbmNvbnN0IHJlYWRMb2NhbENvbXBvbmVudHNKc29uID0gKGxvY2FsQXBpUm9vdDogc3RyaW5nKTogSGFuZG9mZkNvbXBvbmVudFtdID0+IHtcbiAgY29uc3QgcCA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICdjb21wb25lbnRzLmpzb24nKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKHApKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBMb2NhbCBIYW5kb2ZmIEFQSSBtaXNzaW5nIGNvbXBvbmVudHMgbGlzdDogJHtwfWApO1xuICB9XG4gIHJldHVybiBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhwLCAndXRmLTgnKSkgYXMgSGFuZG9mZkNvbXBvbmVudFtdO1xufTtcblxuY29uc3QgcmVzb2x2ZVVybFRvTG9jYWxQYXRoID0gKGxvY2FsQXBpUm9vdDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICBsZXQgcGF0aG5hbWUgPSAnJztcbiAgdHJ5IHtcbiAgICBwYXRobmFtZSA9IG5ldyBVUkwodXJsKS5wYXRobmFtZTtcbiAgfSBjYXRjaCB7XG4gICAgY29uc3QgcSA9IHVybC5pbmRleE9mKCc/Jyk7XG4gICAgcGF0aG5hbWUgPSBxID49IDAgPyB1cmwuc2xpY2UoMCwgcSkgOiB1cmw7XG4gICAgaWYgKCFwYXRobmFtZS5zdGFydHNXaXRoKCcvJykpIHBhdGhuYW1lID0gJy8nICsgcGF0aG5hbWU7XG4gIH1cbiAgbGV0IG5vcm1hbGl6ZWQgPSBwYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sICcnKTtcbiAgY29uc3QgYXBpUHJlZml4ID0gJ2FwaS9jb21wb25lbnQvJztcbiAgaWYgKG5vcm1hbGl6ZWQuc3RhcnRzV2l0aChhcGlQcmVmaXgpKSB7XG4gICAgY29uc3QgcmVsID0gbm9ybWFsaXplZC5zbGljZShhcGlQcmVmaXgubGVuZ3RoKTtcbiAgICBjb25zdCBwID0gcGF0aC5qb2luKGxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsIHJlbCk7XG4gICAgcmV0dXJuIGZzLmV4aXN0c1N5bmMocCkgPyBwIDogbnVsbDtcbiAgfVxuICBpZiAobm9ybWFsaXplZC5zdGFydHNXaXRoKCdpbWFnZXMvJykpIHtcbiAgICBjb25zdCBwID0gcGF0aC5qb2luKGxvY2FsQXBpUm9vdCwgJy4uJywgbm9ybWFsaXplZCk7XG4gICAgcmV0dXJuIGZzLmV4aXN0c1N5bmMocCkgPyBwIDogbnVsbDtcbiAgfVxuICBjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShwYXRobmFtZSk7XG4gIGNvbnN0IGZhbGxiYWNrID0gcGF0aC5qb2luKGxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsIGJhc2UpO1xuICByZXR1cm4gZnMuZXhpc3RzU3luYyhmYWxsYmFjaykgPyBmYWxsYmFjayA6IG51bGw7XG59O1xuXG5jb25zdCBjdHhGZXRjaENvbXBvbmVudCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgY29tcG9uZW50TmFtZTogc3RyaW5nKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50PiA9PiB7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc3QgZmlsZSA9IHBhdGguam9pbihjdHgubG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgYCR7Y29tcG9uZW50TmFtZX0uanNvbmApO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhmaWxlKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBMb2NhbCBjb21wb25lbnQgSlNPTiBub3QgZm91bmQ6ICR7ZmlsZX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGZpbGUsICd1dGYtOCcpKSBhcyBIYW5kb2ZmQ29tcG9uZW50O1xuICB9XG4gIHJldHVybiBodHRwRmV0Y2hDb21wb25lbnQoY3R4LmFwaVVybCwgY29tcG9uZW50TmFtZSwgY3R4LmF1dGgpO1xufTtcblxuY29uc3QgY3R4RmV0Y2hDb21wb25lbnRMaXN0ID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zdCBjb21wb25lbnRzID0gcmVhZExvY2FsQ29tcG9uZW50c0pzb24oY3R4LmxvY2FsQXBpUm9vdCk7XG4gICAgcmV0dXJuIGNvbXBvbmVudHMuZmlsdGVyKChjKSA9PiBzaG91bGRJbXBvcnRDb21wb25lbnQoYy5pZCwgYy50eXBlLCBpbXBvcnRDb25maWcpKS5tYXAoKGMpID0+IGMuaWQpO1xuICB9XG4gIHJldHVybiBodHRwRmV0Y2hDb21wb25lbnRMaXN0KGN0eC5hcGlVcmwsIGltcG9ydENvbmZpZywgY3R4LmF1dGgpO1xufTtcblxuY29uc3QgY3R4RmV0Y2hBbGxDb21wb25lbnRzTGlzdCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudFtdPiA9PiB7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgcmV0dXJuIHJlYWRMb2NhbENvbXBvbmVudHNKc29uKGN0eC5sb2NhbEFwaVJvb3QpO1xuICB9XG4gIHJldHVybiBodHRwRmV0Y2hBbGxDb21wb25lbnRzTGlzdChjdHguYXBpVXJsLCBjdHguYXV0aCk7XG59O1xuXG5jb25zdCBjdHhEb3dubG9hZEZpbGUgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc3Qgc3JjUGF0aCA9IHJlc29sdmVVcmxUb0xvY2FsUGF0aChjdHgubG9jYWxBcGlSb290LCB1cmwpO1xuICAgIGlmICghc3JjUGF0aCkge1xuICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIExvY2FsIGFzc2V0IG5vdCBmb3VuZCBmb3IgVVJMOiAke3VybH1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZShkZXN0UGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIGZzLmNvcHlGaWxlU3luYyhzcmNQYXRoLCBkZXN0UGF0aCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGh0dHBEb3dubG9hZEZpbGUodXJsLCBkZXN0UGF0aCwgY3R4LmF1dGgpO1xufTtcblxuLyoqXG4gKiBDb3B5IEhhbmRvZmYgYnVuZGxlIG1haW4uanMgLyBtYWluLmNzcyBmcm9tIGxvY2FsIHB1YmxpYy9hcGkgaW50byB3cC1jb250ZW50L2hhbmRvZmYvYXNzZXRzLlxuICovXG5jb25zdCBzeW5jQnVuZGxlQXNzZXRzID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBjb250ZW50Um9vdDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGlmICghY3R4LmxvY2FsQXBpUm9vdCkgcmV0dXJuO1xuICBjb25zdCBhc3NldHNDc3NEaXIgPSBwYXRoLmpvaW4oY29udGVudFJvb3QsICdhc3NldHMnLCAnY3NzJyk7XG4gIGNvbnN0IGFzc2V0c0pzRGlyID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAnYXNzZXRzJywgJ2pzJyk7XG4gIGZzLm1rZGlyU3luYyhhc3NldHNDc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBmcy5ta2RpclN5bmMoYXNzZXRzSnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBjb25zdCBtYWluQ3NzID0gcGF0aC5qb2luKGN0eC5sb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCAnbWFpbi5jc3MnKTtcbiAgY29uc3QgbWFpbkpzID0gcGF0aC5qb2luKGN0eC5sb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCAnbWFpbi5qcycpO1xuICBpZiAoZnMuZXhpc3RzU3luYyhtYWluQ3NzKSkge1xuICAgIGZzLmNvcHlGaWxlU3luYyhtYWluQ3NzLCBwYXRoLmpvaW4oYXNzZXRzQ3NzRGlyLCAnbWFpbi5jc3MnKSk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvY3NzL21haW4uY3NzIChmcm9tIC0tc291cmNlKWApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBNaXNzaW5nICR7bWFpbkNzc31gKTtcbiAgfVxuICBpZiAoZnMuZXhpc3RzU3luYyhtYWluSnMpKSB7XG4gICAgZnMuY29weUZpbGVTeW5jKG1haW5KcywgcGF0aC5qb2luKGFzc2V0c0pzRGlyLCAnbWFpbi5qcycpKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9qcy9tYWluLmpzIChmcm9tIC0tc291cmNlKWApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBNaXNzaW5nICR7bWFpbkpzfWApO1xuICB9XG59O1xuXG4vKipcbiAqIENvbXBpbGUgYWxsIGNvbXBvbmVudHNcbiAqL1xuLyoqXG4gKiBCdWlsZCBWYXJpYW50SW5mbyBmb3IgYSBjb21wb25lbnQgKHJlc29sdmVzIGR5bmFtaWMgYXJyYXlzLCBJbm5lckJsb2NrcyBmaWVsZCwgZXRjLilcbiAqL1xuY29uc3QgYnVpbGRWYXJpYW50SW5mbyA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsIHJlc29sdmVkQ29uZmlnOiBSZXNvbHZlZENvbmZpZyk6IFZhcmlhbnRJbmZvID0+IHtcbiAgY29uc3QgY29tcG9uZW50RHluYW1pY0FycmF5cyA9IHtcbiAgICAuLi5leHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyhjb21wb25lbnQuaWQsIGNvbXBvbmVudC50eXBlLCByZXNvbHZlZENvbmZpZy5pbXBvcnQpLFxuICB9O1xuXG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGNvbnN0IGV4cGxpY2l0SW5uZXJCbG9ja3MgPSBPYmplY3QuZW50cmllcyhmaWVsZFByZWZzKVxuICAgIC5maWx0ZXIoKFssIHByZWZzXSkgPT4gcHJlZnMuaW5uZXJCbG9ja3MgPT09IHRydWUpXG4gICAgLm1hcCgoW2tleV0pID0+IGtleSk7XG5cbiAgbGV0IGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IG9ubHkgb25lIHJpY2h0ZXh0IGZpZWxkIHBlciBibG9jayBjYW4gdXNlIElubmVyQmxvY2tzLCBgICtcbiAgICAgIGBidXQgJHtleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aH0gYXJlIG1hcmtlZDogJHtleHBsaWNpdElubmVyQmxvY2tzLmpvaW4oJywgJyl9YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBmaWVsZCA9IGV4cGxpY2l0SW5uZXJCbG9ja3NbMF07XG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkXTtcbiAgICBpZiAoIXByb3AgfHwgcHJvcC50eXBlICE9PSAncmljaHRleHQnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogZmllbGQgXCIke2ZpZWxkfVwiIGlzIG1hcmtlZCBhcyBpbm5lckJsb2NrcyBidXQgaXMgbm90IGEgcmljaHRleHQgZmllbGRgXG4gICAgICApO1xuICAgIH1cbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gZmllbGQ7XG4gIH0gZWxzZSBpZiAocmljaHRleHRGaWVsZHMubGVuZ3RoID09PSAxKSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IHJpY2h0ZXh0RmllbGRzWzBdO1xuICB9IGVsc2Uge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjb21wb25lbnQsXG4gICAgZmllbGRNYXA6IHt9LFxuICAgIGlubmVyQmxvY2tzRmllbGQsXG4gICAgZHluYW1pY0FycmF5Q29uZmlnczogY29tcG9uZW50RHluYW1pY0FycmF5cyxcbiAgfTtcbn07XG5cbi8qKlxuICogQ29tcGlsZSBhIHNpbmdsZSBtZXJnZWQgZ3JvdXAgKGUuZy4gSGVybyB3aXRoIG11bHRpcGxlIHZhcmlhbnRzKS4gVXNlZCBieSBzaW5nbGUtbmFtZSBDTEkgd2hlbiBuYW1lIG1hdGNoZXMgYSBncm91cC5cbiAqL1xuY29uc3QgY29tcGlsZUdyb3VwID0gYXN5bmMgKFxuICBjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCxcbiAgb3V0cHV0RGlyOiBzdHJpbmcsXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UgCBHZW5lcmF0aW5nIG1lcmdlZCBncm91cCBibG9jazogJHtncm91cFNsdWd9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zdCB2YXJpYW50SW5mb3M6IFZhcmlhbnRJbmZvW10gPSBncm91cENvbXBvbmVudHMubWFwKChjKSA9PiBidWlsZFZhcmlhbnRJbmZvKGMsIGNvbmZpZykpO1xuXG4gIC8vIEJ1aWxkIHZhcmlhbnQgc2NyZWVuc2hvdCBtYXAgKHdoaWNoIHZhcmlhbnRzIGhhdmUgaW1hZ2VzIHRvIGRvd25sb2FkKVxuICBjb25zdCB2YXJpYW50U2NyZWVuc2hvdHM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG4gIGZvciAoY29uc3QgY29tcCBvZiBncm91cENvbXBvbmVudHMpIHtcbiAgICB2YXJpYW50U2NyZWVuc2hvdHNbY29tcC5pZF0gPSAhIWNvbXAuaW1hZ2U7XG4gIH1cblxuICBjb25zdCBtZXJnZWRCbG9jayA9IGdlbmVyYXRlTWVyZ2VkQmxvY2soXG4gICAgZ3JvdXBTbHVnLFxuICAgIGdyb3VwQ29tcG9uZW50cyxcbiAgICB2YXJpYW50SW5mb3MsXG4gICAgY3R4LmFwaVVybCxcbiAgICB2YXJpYW50U2NyZWVuc2hvdHMsXG4gICAgY29uZmlnLmVkaXRvcixcbiAgKTtcbiAgY29uc3QgZ3JvdXBCbG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIGNvbnN0IGdyb3VwRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgZ3JvdXBCbG9ja05hbWUpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZ3JvdXBEaXIpKSB7XG4gICAgZnMubWtkaXJTeW5jKGdyb3VwRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIC8vIERvd25sb2FkIHZhcmlhbnQgc2NyZWVuc2hvdHNcbiAgaWYgKG1lcmdlZEJsb2NrLnZhcmlhbnRTY3JlZW5zaG90VXJscykge1xuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgdXJsXSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYW50U2NyZWVuc2hvdFVybHMpKSB7XG4gICAgICBjb25zdCBzY3JlZW5zaG90UGF0aCA9IHBhdGguam9pbihncm91cERpciwgYHNjcmVlbnNob3QtJHt2YXJpYW50SWR9LnBuZ2ApO1xuICAgICAgY29uc29sZS5sb2coYCAgIPCfk7cgRG93bmxvYWRpbmcgc2NyZWVuc2hvdCBmb3IgdmFyaWFudCAke3ZhcmlhbnRJZH0uLi5gKTtcbiAgICAgIGNvbnN0IG9rID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwgdXJsLCBzY3JlZW5zaG90UGF0aCk7XG4gICAgICBpZiAoIW9rKSB7XG4gICAgICAgIHZhcmlhbnRTY3JlZW5zaG90c1t2YXJpYW50SWRdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZm9ybWF0dGVkQmxvY2tKc29uID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5ibG9ja0pzb24sICdqc29uJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEluZGV4SnMgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLmluZGV4SnMsICdiYWJlbCcpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBjb25zdCBmb3JtYXR0ZWRFZGl0b3JTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5lZGl0b3JTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRTdHlsZVNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKG1lcmdlZEJsb2NrLnN0eWxlU2NzcywgJ3Njc3MnKTtcblxuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2Jsb2NrLmpzb24nKSwgZm9ybWF0dGVkQmxvY2tKc29uKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdpbmRleC5qcycpLCBmb3JtYXR0ZWRJbmRleEpzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdyZW5kZXIucGhwJyksIGZvcm1hdHRlZFJlbmRlclBocCk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnZWRpdG9yLnNjc3MnKSwgZm9ybWF0dGVkRWRpdG9yU2Nzcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnc3R5bGUuc2NzcycpLCBmb3JtYXR0ZWRTdHlsZVNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ1JFQURNRS5tZCcpLCBtZXJnZWRCbG9jay5yZWFkbWUpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ21pZ3JhdGlvbi1zY2hlbWEuanNvbicpLCBtZXJnZWRCbG9jay5taWdyYXRpb25TY2hlbWEpO1xuXG4gIGlmIChtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcykge1xuICAgIGNvbnN0IHZhcmlhdGlvbnNEaXIgPSBwYXRoLmpvaW4oZ3JvdXBEaXIsICd2YXJpYXRpb25zJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHZhcmlhdGlvbnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmModmFyaWF0aW9uc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3ZhcmlhbnRJZCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMuanMpKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdiYWJlbCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5qc2ApLCBmb3JtYXR0ZWQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLnBocCkpIHtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGF3YWl0IGZvcm1hdENvZGUoY29udGVudCwgJ3BocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odmFyaWF0aW9uc0RpciwgYCR7dmFyaWFudElkfS5waHBgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gIH1cblxuICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBtZXJnZWQgYmxvY2s6ICR7Z3JvdXBCbG9ja05hbWV9ICgke2dyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKWApO1xuICBjb25zb2xlLmxvZyhgICAg8J+TgSAke2dyb3VwRGlyfWApO1xuXG4gIGNvbnN0IHBsdWdpbkRpciA9IHBhdGguZGlybmFtZShvdXRwdXREaXIpO1xuICBjb25zdCBjYXRlZ29yaWVzUGhwID0gZ2VuZXJhdGVDYXRlZ29yaWVzUGhwKGdyb3VwQ29tcG9uZW50cyk7XG4gIGNvbnN0IGZvcm1hdHRlZENhdGVnb3JpZXNQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGNhdGVnb3JpZXNQaHAsICdwaHAnKTtcbiAgY29uc3QgaW5jbHVkZXNEaXIgPSBwYXRoLmpvaW4ocGx1Z2luRGlyLCAnaW5jbHVkZXMnKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGluY2x1ZGVzRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgY29uc3QgY2F0ZWdvcmllc1BhdGggPSBwYXRoLmpvaW4oaW5jbHVkZXNEaXIsICdoYW5kb2ZmLWNhdGVnb3JpZXMucGhwJyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCAke2NhdGVnb3JpZXNQYXRofWApO1xuXG4gIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJyk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIGNvbnRlbnRSb290KTtcbiAgfVxuICBpZiAoY29uZmlnLmVkaXRvcj8uc2NvcGVEZXNpZ25TeXN0ZW0gIT09IGZhbHNlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHNjb3BlRGVzaWduU3lzdGVtRm9yRWRpdG9yKGNvbnRlbnRSb290LCBjb25maWcuZWRpdG9yKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYCAgIOKaoO+4jyAgRWRpdG9yIENTUyBzY29waW5nIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWAsXG4gICAgICApO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgY29tcGlsZUFsbCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgb3V0cHV0RGlyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyIC0gQmF0Y2ggTW9kZWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChjdHguYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHtjdHguYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnRMaXN0KGN0eCwgY29uZmlnLmltcG9ydCk7XG5cbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgbGV0IHN1Y2Nlc3MgPSAwO1xuICAgIGxldCBmYWlsZWQgPSAwO1xuICAgIGNvbnN0IGNvbXBpbGVkQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgY29uc3Qgc2NoZW1hSGlzdG9yeSA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICAgIFxuICAgIC8vIEZldGNoIGFsbCBjb21wb25lbnRzIGZpcnN0IHNvIHdlIGNhbiBwYXJ0aXRpb24gYnkgZ3JvdXBcbiAgICBjb25zdCBhbGxDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnRJZCk7XG5cbiAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0KHRlbXBsYXRlVmFsaWRhdGlvbikpO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjb21wb25lbnRJZH0gZHVlIHRvIHRlbXBsYXRlIHZhcmlhYmxlIGVycm9yc2ApO1xuICAgICAgICAgIGZhaWxlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYWxsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGZldGNoICR7Y29tcG9uZW50SWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFBhcnRpdGlvbiBjb21wb25lbnRzOiBtZXJnZWQgZ3JvdXBzIHZzIGluZGl2aWR1YWxcbiAgICAvLyBCdWlsZCBjYXNlLWluc2Vuc2l0aXZlIGxvb2t1cDogY29uZmlnIG1heSBzYXkgXCJIZXJvXCIgYnV0IEFQSSBvZnRlbiByZXR1cm5zIFwiaGVyb1wiXG4gICAgY29uc3QgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICBpZiAobW9kZSA9PT0gJ21lcmdlZCcpIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5zZXQoa2V5LnRvTG93ZXJDYXNlKCksIGtleSk7XG4gICAgfVxuICAgIGNvbnN0IGdyb3VwQnVja2V0czogUmVjb3JkPHN0cmluZywgSGFuZG9mZkNvbXBvbmVudFtdPiA9IHt9O1xuICAgIGNvbnN0IGluZGl2aWR1YWxDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGFsbENvbXBvbmVudHMpIHtcbiAgICAgIGNvbnN0IGdyb3VwID0gY29tcG9uZW50Lmdyb3VwO1xuICAgICAgaWYgKCFncm91cCkge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgY29uZmlnS2V5ID0gbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgIGlmIChjb25maWdLZXkpIHtcbiAgICAgICAgaWYgKCFncm91cEJ1Y2tldHNbY29uZmlnS2V5XSkgZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0gPSBbXTtcbiAgICAgICAgZ3JvdXBCdWNrZXRzW2NvbmZpZ0tleV0ucHVzaChjb21wb25lbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5kaXZpZHVhbENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgaW5kaXZpZHVhbCBjb21wb25lbnRzIChleGlzdGluZyBiZWhhdmlvcilcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBpbmRpdmlkdWFsQ29tcG9uZW50cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYmxvY2sgPSBnZW5lcmF0ZUJsb2NrKGNvbXBvbmVudCwgY3R4LmFwaVVybCwgY29uZmlnLCBzY2hlbWFIaXN0b3J5KTtcbiAgICAgICAgYXdhaXQgd3JpdGVCbG9ja0ZpbGVzKG91dHB1dERpciwgY29tcG9uZW50LmlkLCBibG9jaywgY3R4KTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgc3VjY2VzcysrO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlICR7Y29tcG9uZW50LmlkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfWApO1xuICAgICAgICBmYWlsZWQrKztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb21waWxlIG1lcmdlZCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50c10gb2YgT2JqZWN0LmVudHJpZXMoZ3JvdXBCdWNrZXRzKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwKGN0eCwgb3V0cHV0RGlyLCBncm91cFNsdWcsIGdyb3VwQ29tcG9uZW50cyk7XG4gICAgICAgIGNvbXBpbGVkQ29tcG9uZW50cy5wdXNoKC4uLmdyb3VwQ29tcG9uZW50cyk7XG4gICAgICAgIHN1Y2Nlc3MgKz0gZ3JvdXBDb21wb25lbnRzLmxlbmd0aDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gY29tcGlsZSBtZXJnZWQgZ3JvdXAgJHtncm91cFNsdWd9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlY29uY2lsZSBsb2NhbCBibG9ja3M6IG1hcmsgZGlycyBub3QgaW4gdGhpcyBjb21waWxlIG91dHB1dCBhcyBkZXByZWNhdGVkXG4gICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgUmVjb25jaWxpbmcgbG9jYWwgYmxvY2tzIHdpdGggY29tcGlsZSBvdXRwdXQuLi5gKTtcbiAgICBjb25zdCBhY3RpdmVTbHVncyA9IGdldEFjdGl2ZUJsb2NrU2x1Z3MoaW5kaXZpZHVhbENvbXBvbmVudHMsIGdyb3VwQnVja2V0cyk7XG4gICAgY29uc3QgcmVjb25jaWxlUmVzdWx0ID0gcmVjb25jaWxlTG9jYWxCbG9ja3Mob3V0cHV0RGlyLCBhY3RpdmVTbHVncyk7XG4gICAgY29uc3QgbmV3bHlEZXByZWNhdGVkID0gcmVjb25jaWxlUmVzdWx0Lm1hcmtlZDtcbiAgICBpZiAobmV3bHlEZXByZWNhdGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDimqDvuI8gIE1hcmtlZCAke25ld2x5RGVwcmVjYXRlZC5sZW5ndGh9IGJsb2NrKHMpIGFzIGRlcHJlY2F0ZWQ6ICR7bmV3bHlEZXByZWNhdGVkLmpvaW4oJywgJyl9YCk7XG4gICAgfSBlbHNlIGlmIChyZWNvbmNpbGVSZXN1bHQuYWxyZWFkeURlcHJlY2F0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKEue+4jyAgJHtyZWNvbmNpbGVSZXN1bHQuYWxyZWFkeURlcHJlY2F0ZWQubGVuZ3RofSBibG9jayhzKSByZW1haW4gZGVwcmVjYXRlZCAodW5jaGFuZ2VkKWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIEFsbCBsb2NhbCBibG9ja3MgbWF0Y2ggY3VycmVudCBjb21waWxlIG91dHB1dGApO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBjYXRlZ29yaWVzIFBIUCBmaWxlIGJhc2VkIG9uIGFsbCBjb21waWxlZCBjb21wb25lbnRzXG4gICAgaWYgKGNvbXBpbGVkQ29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBHZW5lcmF0aW5nIGJsb2NrIGNhdGVnb3JpZXMuLi5gKTtcbiAgICAgIGNvbnN0IGNhdGVnb3JpZXNQaHAgPSBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAoY29tcGlsZWRDb21wb25lbnRzKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZENhdGVnb3JpZXNQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGNhdGVnb3JpZXNQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgcGx1Z2luRGlyID0gcGF0aC5kaXJuYW1lKG91dHB1dERpcik7XG4gICAgICBjb25zdCBpbmNsdWRlc0RpciA9IHBhdGguam9pbihwbHVnaW5EaXIsICdpbmNsdWRlcycpO1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGluY2x1ZGVzRGlyKSkge1xuICAgICAgICBmcy5ta2RpclN5bmMoaW5jbHVkZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgfVxuICAgICAgY29uc3QgY2F0ZWdvcmllc1BhdGggPSBwYXRoLmpvaW4oaW5jbHVkZXNEaXIsICdoYW5kb2ZmLWNhdGVnb3JpZXMucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGNhdGVnb3JpZXNQYXRoLCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2NhdGVnb3JpZXNQYXRofWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb3B5IHNoYXJlZCBjb21wb25lbnRzICYgdXRpbHMgdG8gdGhlIG91dHB1dCBkaXJlY3Rvcnkgc28gYmxvY2tzIGNhblxuICAgIC8vIHJlc29sdmUgdGhlaXIgLi4vLi4vc2hhcmVkLy4uLiBpbXBvcnRzIHJlZ2FyZGxlc3Mgb2Ygd2hlcmUgdGhleSBsaXZlLlxuICAgIGNvbnN0IHBsdWdpblJvb3QgPSBwYXRoLnJlc29sdmUocGF0aC5kaXJuYW1lKHByb2Nlc3MuYXJndlsxXSksICcuLicsICcuLicpO1xuICAgIGNvbnN0IHBsdWdpblNoYXJlZERpciA9IHBhdGguam9pbihwbHVnaW5Sb290LCAnc2hhcmVkJyk7XG4gICAgY29uc3QgY29udGVudFJvb3QgPSBwYXRoLnJlc29sdmUob3V0cHV0RGlyLCAnLi4nKTtcbiAgICBjb25zdCB0YXJnZXRTaGFyZWREaXIgPSBwYXRoLmpvaW4oY29udGVudFJvb3QsICdzaGFyZWQnKTtcblxuICAgIGlmIChmcy5leGlzdHNTeW5jKHBsdWdpblNoYXJlZERpcikgJiZcbiAgICAgICAgcGF0aC5yZXNvbHZlKHBsdWdpblNoYXJlZERpcikgIT09IHBhdGgucmVzb2x2ZSh0YXJnZXRTaGFyZWREaXIpKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBDb3B5aW5nIHNoYXJlZCBjb21wb25lbnRzLi4uYCk7XG4gICAgICBjb3B5RGlyUmVjdXJzaXZlKHBsdWdpblNoYXJlZERpciwgdGFyZ2V0U2hhcmVkRGlyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgU2hhcmVkIGNvbXBvbmVudHMgY29waWVkIHRvICR7dGFyZ2V0U2hhcmVkRGlyfWApO1xuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIHBhY2thZ2UuanNvbiBhbmQgaW5zdGFsbCBidWlsZCBkZXBlbmRlbmNpZXMgc28gYmxvY2tzIGFuZFxuICAgIC8vIHNoYXJlZCBjb21wb25lbnRzIGNhbiByZXNvbHZlIEB3b3JkcHJlc3MvKiBhbmQgQDEwdXAvKiBpbXBvcnRzLlxuICAgIGVuc3VyZUNvbnRlbnREZXBlbmRlbmNpZXMoY29udGVudFJvb3QpO1xuICAgIFxuICAgIC8vIERvd25sb2FkIG9yIGNvcHkgbWFpbi5jc3MgYW5kIG1haW4uanMgZGVzaWduIHN5c3RlbSBhc3NldHNcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+ToSBTeW5jaW5nIGRlc2lnbiBzeXN0ZW0gYXNzZXRzLi4uYCk7XG4gICAgY29uc3QgYXNzZXRzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJy4uJywgJ2Fzc2V0cycpO1xuICAgIGNvbnN0IGFzc2V0c0Nzc0RpciA9IHBhdGguam9pbihhc3NldHNEaXIsICdjc3MnKTtcbiAgICBjb25zdCBhc3NldHNKc0RpciA9IHBhdGguam9pbihhc3NldHNEaXIsICdqcycpO1xuXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFzc2V0c0Nzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhhc3NldHNDc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXNzZXRzSnNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoYXNzZXRzSnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGN0eCwgcGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjc3NVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uY3NzYDtcbiAgICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oYXNzZXRzQ3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICAgIGNvbnN0IGNzc0Rvd25sb2FkZWQgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCBjc3NVcmwsIGNzc1BhdGgpO1xuICAgICAgaWYgKGNzc0Rvd25sb2FkZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvY3NzL21haW4uY3NzYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uY3NzIGZyb20gJHtjc3NVcmx9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGpzVXJsID0gYCR7Y3R4LmFwaVVybH0vYXBpL2NvbXBvbmVudC9tYWluLmpzYDtcbiAgICAgIGNvbnN0IGpzUGF0aCA9IHBhdGguam9pbihhc3NldHNKc0RpciwgJ21haW4uanMnKTtcbiAgICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGpzVXJsLCBqc1BhdGgpO1xuICAgICAgaWYgKGpzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9qcy9tYWluLmpzYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uanMgZnJvbSAke2pzVXJsfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjb25maWcuZWRpdG9yPy5zY29wZURlc2lnblN5c3RlbSAhPT0gZmFsc2UpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIFNjb3BpbmcgZGVzaWduIHN5c3RlbSBDU1MgZm9yIGJsb2NrIGVkaXRvci4uLmApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2NvcGVEZXNpZ25TeXN0ZW1Gb3JFZGl0b3IocGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJyksIGNvbmZpZy5lZGl0b3IpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgICAg4pqg77iPICBFZGl0b3IgQ1NTIHNjb3BpbmcgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBlcnJ9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIENvbXBpbGF0aW9uIGNvbXBsZXRlIWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgU3VjY2VzczogJHtzdWNjZXNzfWApO1xuICAgIGlmIChmYWlsZWQgPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4p2MIEZhaWxlZDogJHtmYWlsZWR9YCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SAIE1lcmdlZCBncm91cHM6ICR7T2JqZWN0LmtleXMoZ3JvdXBCdWNrZXRzKS5sZW5ndGh9YCk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGBcXG5Eb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENvbXBpbGUgdGhlbWUgdGVtcGxhdGVzIChoZWFkZXIsIGZvb3RlcilcbiAqL1xuY29uc3QgY29tcGlsZVRoZW1lID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCBvdXRwdXREaXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+OqCBUaGVtZSBUZW1wbGF0ZSBDb21waWxlcmApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChjdHguYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHtjdHguYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIENvbXBpbGUgaGVhZGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgaGVhZGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBoZWFkZXIgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsICdoZWFkZXInKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtoZWFkZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgaGVhZGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgaGVhZGVyUGhwID0gZ2VuZXJhdGVIZWFkZXJQaHAoaGVhZGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEhlYWRlciA9IGF3YWl0IGZvcm1hdENvZGUoaGVhZGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGhlYWRlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnaGVhZGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhoZWFkZXJQYXRoLCBmb3JtYXR0ZWRIZWFkZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7aGVhZGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEhlYWRlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxlIGZvb3RlclxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGZvb3RlciBjb21wb25lbnQuLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZm9vdGVyID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCAnZm9vdGVyJyk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Zm9vdGVyLnRpdGxlfVxcbmApO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIGZvb3Rlci5waHAuLi5gKTtcbiAgICAgIGNvbnN0IGZvb3RlclBocCA9IGdlbmVyYXRlRm9vdGVyUGhwKGZvb3Rlcik7XG4gICAgICBjb25zdCBmb3JtYXR0ZWRGb290ZXIgPSBhd2FpdCBmb3JtYXRDb2RlKGZvb3RlclBocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBmb290ZXJQYXRoID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Zvb3Rlci5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoZm9vdGVyUGF0aCwgZm9ybWF0dGVkRm9vdGVyKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2Zvb3RlclBhdGh9XFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBGb290ZXIgY29tcG9uZW50IG5vdCBmb3VuZCBvciBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWxzbyB0cnkgaGVhZGVyLWNvbXBhY3QgYW5kIGZvb3Rlci1jb21wYWN0IGlmIHRoZXkgZXhpc3RcbiAgICAvLyBUaGVzZSBnbyBpbnRvIHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvIHN1YmZvbGRlclxuICAgIGNvbnN0IGhhbmRvZmZUZW1wbGF0ZXNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAndGVtcGxhdGUtcGFydHMnLCAnaGFuZG9mZicpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhoYW5kb2ZmVGVtcGxhdGVzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBnZW5lcmF0ZWRUZW1wbGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCB2YXJpYW50IG9mIFsnaGVhZGVyLWNvbXBhY3QnLCAnaGVhZGVyLWxhbmRlcicsICdmb290ZXItY29tcGFjdCddKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIHZhcmlhbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+ToSBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9YCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB0ZW1wbGF0ZVR5cGUgPSB2YXJpYW50LnJlcGxhY2UoLy0vZywgJ18nKTtcbiAgICAgICAgY29uc3QgaXNIZWFkZXIgPSB2YXJpYW50LnN0YXJ0c1dpdGgoJ2hlYWRlcicpO1xuICAgICAgICBjb25zdCBwaHAgPSBpc0hlYWRlciBcbiAgICAgICAgICA/IGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwKGNvbXBvbmVudCwgdGVtcGxhdGVUeXBlKVxuICAgICAgICAgIDogZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpO1xuICAgICAgICBjb25zdCBmb3JtYXR0ZWRQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKHBocCwgJ3BocCcpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oaGFuZG9mZlRlbXBsYXRlc0RpciwgYCR7dmFyaWFudH0ucGhwYCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIGZvcm1hdHRlZFBocCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkOiAke2ZpbGVQYXRofVxcbmApO1xuICAgICAgICBnZW5lcmF0ZWRUZW1wbGF0ZXMucHVzaChgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBWYXJpYW50IGRvZXNuJ3QgZXhpc3QsIHNraXAgc2lsZW50bHlcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgUkVBRE1FIGZvciB0aGUgaGFuZG9mZiB0ZW1wbGF0ZXMgZm9sZGVyXG4gICAgaWYgKGdlbmVyYXRlZFRlbXBsYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCByZWFkbWVDb250ZW50ID0gYCMgSGFuZG9mZiBUZW1wbGF0ZSBQYXJ0c1xuXG4+IOKaoO+4jyAqKkRPIE5PVCBFRElUIFRIRVNFIEZJTEVTIERJUkVDVExZKipcbj5cbj4gVGhlc2UgZmlsZXMgYXJlIGF1dG9tYXRpY2FsbHkgZ2VuZXJhdGVkIGJ5IHRoZSBIYW5kb2ZmIFdvcmRQcmVzcyBjb21waWxlci5cbj4gQW55IGNoYW5nZXMgd2lsbCBiZSBvdmVyd3JpdHRlbiBvbiB0aGUgbmV4dCBzeW5jLlxuXG4jIyBTb3VyY2VcblxuVGhlc2UgdGVtcGxhdGVzIHdlcmUgdHJhbnNwaWxlZCBmcm9tIHRoZSBIYW5kb2ZmIGRlc2lnbiBzeXN0ZW0uXG5cbi0gKipBUEkgVVJMOioqICR7Y3R4LmFwaVVybH1cbi0gKipHZW5lcmF0ZWQ6KiogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XG5cbiMjIEZpbGVzXG5cbiR7Z2VuZXJhdGVkVGVtcGxhdGVzLm1hcChmID0+IGAtIFxcYCR7Zn1cXGBgKS5qb2luKCdcXG4nKX1cblxuIyMgVXNhZ2VcblxuSW5jbHVkZSB0aGVzZSB0ZW1wbGF0ZSBwYXJ0cyBpbiB5b3VyIHRoZW1lIHVzaW5nOlxuXG5cXGBcXGBcXGBwaHBcbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2hlYWRlci1jb21wYWN0Jyk7ID8+XG48P3BocCBnZXRfdGVtcGxhdGVfcGFydCgndGVtcGxhdGUtcGFydHMvaGFuZG9mZi9mb290ZXItY29tcGFjdCcpOyA/PlxuXFxgXFxgXFxgXG5cbiMjIFJlZ2VuZXJhdGluZ1xuXG5UbyByZWdlbmVyYXRlIHRoZXNlIGZpbGVzLCBydW46XG5cblxcYFxcYFxcYGJhc2hcbm5weCBoYW5kb2ZmLXdwIC0tdGhlbWVcblxcYFxcYFxcYFxuXG5PciB3aXRoIGEgc3BlY2lmaWMgQVBJIFVSTDpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZSAtLWFwaS11cmwgJHtjdHguYXBpVXJsfVxuXFxgXFxgXFxgXG5gO1xuICAgICAgY29uc3QgcmVhZG1lUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCAnUkVBRE1FLm1kJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHJlYWRtZVBhdGgsIHJlYWRtZUNvbnRlbnQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk50gR2VuZXJhdGVkOiAke3JlYWRtZVBhdGh9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIERvd25sb2FkIG9yIGNvcHkgbWFpbi5jc3MgYW5kIG1haW4uanMgYXNzZXRzXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgdGhlbWUgYXNzZXRzLi4uYCk7XG4gICAgXG4gICAgLy8gRW5zdXJlIGFzc2V0cyBkaXJlY3RvcmllcyBleGlzdFxuICAgIGNvbnN0IGNzc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnY3NzJyk7XG4gICAgY29uc3QganNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnYXNzZXRzJywgJ2pzJyk7XG4gICAgXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGNzc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhjc3NEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoanNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoanNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBcbiAgICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIG91dHB1dERpcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERvd25sb2FkIG1haW4uY3NzXG4gICAgICBjb25zdCBjc3NVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uY3NzYDtcbiAgICAgIGNvbnN0IGNzc1BhdGggPSBwYXRoLmpvaW4oY3NzRGlyLCAnbWFpbi5jc3MnKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBEb3dubG9hZGluZyBtYWluLmNzcy4uLmApO1xuICAgICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGNzc1VybCwgY3NzUGF0aCk7XG4gICAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7Y3NzUGF0aH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRG93bmxvYWQgbWFpbi5qc1xuICAgICAgY29uc3QganNVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGpzRGlyLCAnbWFpbi5qcycpO1xuICAgICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uanMuLi5gKTtcbiAgICAgIGNvbnN0IGpzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGpzVXJsLCBqc1BhdGgpO1xuICAgICAgaWYgKGpzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQ6ICR7anNQYXRofWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmpzIGZyb20gJHtqc1VybH1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBUaGVtZSB0ZW1wbGF0ZXMgZ2VuZXJhdGVkIVxcbmApO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHNpbmdsZSBjb21wb25lbnQgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGUgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcpOiBQcm9taXNlPFZhbGlkYXRpb25SZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflI0gVmFsaWRhdGluZyBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICAvLyBGZXRjaCBjb21wb25lbnRcbiAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnROYW1lKTtcbiAgXG4gIC8vIExvYWQgbWFuaWZlc3RcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgXG4gIC8vIFZhbGlkYXRlXG4gIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBcbiAgLy8gT3V0cHV0IHJlc3VsdFxuICBjb25zb2xlLmxvZyhmb3JtYXRWYWxpZGF0aW9uUmVzdWx0KHJlc3VsdCkpO1xuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXNcbiAqL1xuY29uc3QgdmFsaWRhdGVBbGwgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIG91dHB1dERpcjogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIEFsbCBDb21wb25lbnRzYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7Y3R4LmFwaVVybH1gKTtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2N0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgICAgTWFuaWZlc3Q6ICR7b3V0cHV0RGlyfVxcbmApO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBGZXRjaCBjb21wb25lbnQgbGlzdFxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnRMaXN0KGN0eCwgaW1wb3J0Q29uZmlnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgLy8gTG9hZCBtYW5pZmVzdFxuICAgIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gICAgXG4gICAgbGV0IHZhbGlkID0gMDtcbiAgICBsZXQgaW52YWxpZCA9IDA7XG4gICAgbGV0IG5ld0NvbXBvbmVudHMgPSAwO1xuICAgIGNvbnN0IGJyZWFraW5nQ2hhbmdlczogVmFsaWRhdGlvblJlc3VsdFtdID0gW107XG4gICAgXG4gICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgY29tcG9uZW50SWQpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUNvbXBvbmVudChjb21wb25lbnQsIG1hbmlmZXN0KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChyZXN1bHQuaXNOZXcpIHtcbiAgICAgICAgICBuZXdDb21wb25lbnRzKys7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICB2YWxpZCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGludmFsaWQrKztcbiAgICAgICAgICBicmVha2luZ0NoYW5nZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIHZhbGlkYXRlICR7Y29tcG9uZW50SWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFN1bW1hcnlcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGDwn5OKIFZhbGlkYXRpb24gU3VtbWFyeWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgVmFsaWQ6ICR7dmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKdjCBCcmVha2luZyBDaGFuZ2VzOiAke2ludmFsaWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKcqCBOZXcgQ29tcG9uZW50czogJHtuZXdDb21wb25lbnRzfWApO1xuICAgIFxuICAgIGlmIChicmVha2luZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgV0FSTklORzogJHticmVha2luZ0NoYW5nZXMubGVuZ3RofSBjb21wb25lbnQocykgaGF2ZSBicmVha2luZyBjaGFuZ2VzIWApO1xuICAgICAgY29uc29sZS5sb2coYCAgIFRoZXNlIGNoYW5nZXMgbWF5IGJyZWFrIGV4aXN0aW5nIFdvcmRQcmVzcyBjb250ZW50LlxcbmApO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudHMgd2l0aCBicmVha2luZyBjaGFuZ2VzOmApO1xuICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgYnJlYWtpbmdDaGFuZ2VzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAtICR7cmVzdWx0LmNvbXBvbmVudFRpdGxlfSAoJHtyZXN1bHQuY29tcG9uZW50SWR9KWApO1xuICAgICAgfVxuICAgICAgY29uc29sZS5sb2coYFxcbiAgIFRvIHByb2NlZWQgYW55d2F5LCBjb21waWxlIHdpdGggLS1mb3JjZSBmbGFnLlxcbmApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyoIEFsbCBjb21wb25lbnRzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHkhXFxuYCk7XG4gICAgfVxuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxuLyoqXG4gKiBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICovXG5jb25zdCB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudCA9IChvdXRwdXREaXI6IHN0cmluZywgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogdm9pZCA9PiB7XG4gIGNvbnN0IG1hbmlmZXN0ID0gbG9hZE1hbmlmZXN0KG91dHB1dERpcik7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdCA9IHVwZGF0ZU1hbmlmZXN0KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICBzYXZlTWFuaWZlc3Qob3V0cHV0RGlyLCB1cGRhdGVkTWFuaWZlc3QpO1xufTtcblxuLyoqXG4gKiBXYXRjaCBsb2NhbCBIYW5kb2ZmIGBwdWJsaWMvYXBpYCBvdXRwdXQgYW5kIHJlY29tcGlsZSBibG9ja3MgLyBzeW5jIGJ1bmRsZXMuXG4gKi9cbmNvbnN0IHJ1bldhdGNoTW9kZSA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBvbmx5Q29tcG9uZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgcnVuT3B0czogeyBmb3JjZT86IGJvb2xlYW4gfSxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCByb290ID0gY3R4LmxvY2FsQXBpUm9vdCE7XG4gIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG91dHB1dERpciwgJy4uJyk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5GAIFdhdGNoIG1vZGVgKTtcbiAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtyb290fWApO1xuICBjb25zb2xlLmxvZyhgICAgQmxvY2tzOiAke291dHB1dERpcn1cXG5gKTtcblxuICBsZXQgZGViVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuICBjb25zdCBzY2hlZHVsZSA9IChmbjogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4ge1xuICAgIGlmIChkZWJUaW1lcikgY2xlYXJUaW1lb3V0KGRlYlRpbWVyKTtcbiAgICBkZWJUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdm9pZCBmbigpLmNhdGNoKChlcnIpID0+IGNvbnNvbGUuZXJyb3IoJ1t3YXRjaF0nLCBlcnIpKTtcbiAgICB9LCAxNTApO1xuICB9O1xuXG4gIGNvbnN0IGNvbXBpbGVPbmUgPSBhc3luYyAoc3RlbTogc3RyaW5nKSA9PiB7XG4gICAgaWYgKHN0ZW0gPT09ICdjb21wb25lbnRzJykgcmV0dXJuO1xuICAgIGNvbnNvbGUubG9nKGBcXG5bd2F0Y2hdIFJlY29tcGlsaW5nICR7c3RlbX0uLi5gKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBzdGVtKTtcbiAgICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICAgIH1cbiAgICAgIGlmIChjb21wb25lbnQuZ3JvdXApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGNvbXBvbmVudC5ncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgaWYgKGdyb3VwS2V5KSB7XG4gICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QoY3R4KTtcbiAgICAgICAgICBjb25zdCBncm91cE1hdGNoZXMgPSBhbGxDb21wb25lbnRzLmZpbHRlcihcbiAgICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gZ3JvdXBLZXkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IGZ1bGxHcm91cENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgYyBvZiBncm91cE1hdGNoZXMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIGMuaWQpO1xuICAgICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGZ1bGwpO1xuICAgICAgICAgICAgICBpZiAoIXRlbXBsYXRlVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFNraXBwaW5nICR7Yy5pZH0gKHRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkKWApO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGZ1bGxHcm91cENvbXBvbmVudHMucHVzaChmdWxsKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAvLyBza2lwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChjdHgsIG91dHB1dERpciwgZ3JvdXBLZXksIGZ1bGxHcm91cENvbXBvbmVudHMpO1xuICAgICAgICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhjdHgsIGNvbnRlbnRSb290KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghcnVuT3B0cy5mb3JjZSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShjdHgsIG91dHB1dERpciwgc3RlbSk7XG4gICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYFt3YXRjaF0gU2tpcHBpbmcgJHtzdGVtfTogYnJlYWtpbmcgY2hhbmdlcyAocmUtcnVuIHdpdGggLS1mb3JjZSB0byBjb21waWxlIGFueXdheSlgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGNvbXBpbGUoe1xuICAgICAgICBhcGlVcmw6IGN0eC5hcGlVcmwsXG4gICAgICAgIG91dHB1dERpcixcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RlbSxcbiAgICAgICAgYXV0aDogY3R4LmF1dGgsXG4gICAgICAgIGxvY2FsQXBpUm9vdDogcm9vdCxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgY29tcCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgc3RlbSk7XG4gICAgICB1cGRhdGVNYW5pZmVzdEZvckNvbXBvbmVudChvdXRwdXREaXIsIGNvbXApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYFt3YXRjaF0gRmFpbGVkICR7c3RlbX06YCwgZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogZSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHBhdHRlcm5zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAob25seUNvbXBvbmVudElkKSB7XG4gICAgcGF0dGVybnMucHVzaChwYXRoLmpvaW4ocm9vdCwgJ2NvbXBvbmVudCcsIGAke29ubHlDb21wb25lbnRJZH0uanNvbmApKTtcbiAgfSBlbHNlIHtcbiAgICBwYXR0ZXJucy5wdXNoKHBhdGguam9pbihyb290LCAnY29tcG9uZW50JywgJyouanNvbicpKTtcbiAgfVxuICBwYXR0ZXJucy5wdXNoKHBhdGguam9pbihyb290LCAnY29tcG9uZW50JywgJ21haW4uanMnKSwgcGF0aC5qb2luKHJvb3QsICdjb21wb25lbnQnLCAnbWFpbi5jc3MnKSk7XG5cbiAgY29uc3Qgd2F0Y2hlciA9IGNob2tpZGFyLndhdGNoKHBhdHRlcm5zLCB7XG4gICAgYXdhaXRXcml0ZUZpbmlzaDogeyBzdGFiaWxpdHlUaHJlc2hvbGQ6IDE1MCwgcG9sbEludGVydmFsOiA1MCB9LFxuICAgIGlnbm9yZUluaXRpYWw6IHRydWUsXG4gIH0pO1xuXG4gIHdhdGNoZXIub24oJ2FsbCcsIChldmVudCwgZmlsZVBhdGgpID0+IHtcbiAgICBpZiAoIWZpbGVQYXRoKSByZXR1cm47XG4gICAgaWYgKCFbJ2FkZCcsICdjaGFuZ2UnLCAndW5saW5rJ10uaW5jbHVkZXMoZXZlbnQpKSByZXR1cm47XG4gICAgY29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuICAgIGlmIChiYXNlID09PSAnbWFpbi5qcycgfHwgYmFzZSA9PT0gJ21haW4uY3NzJykge1xuICAgICAgc2NoZWR1bGUoYXN5bmMgKCkgPT4ge1xuICAgICAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGN0eCwgY29udGVudFJvb3QpO1xuICAgICAgICBjb25zb2xlLmxvZygnW3dhdGNoXSBCdW5kbGUgYXNzZXRzIHN5bmNlZCcpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChmaWxlUGF0aC5lbmRzV2l0aCgnLmpzb24nKSkge1xuICAgICAgY29uc3Qgc3RlbSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgsICcuanNvbicpO1xuICAgICAgaWYgKG9ubHlDb21wb25lbnRJZCAmJiBzdGVtICE9PSBvbmx5Q29tcG9uZW50SWQpIHJldHVybjtcbiAgICAgIHNjaGVkdWxlKCgpID0+IGNvbXBpbGVPbmUoc3RlbSkpO1xuICAgIH1cbiAgfSk7XG5cbiAgd2F0Y2hlci5vbigncmVhZHknLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coJ1dhdGNoaW5nIGZvciBjaGFuZ2VzLiBQcmVzcyBDdHJsK0MgdG8gc3RvcC5cXG4nKTtcbiAgfSk7XG5cbiAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKCkgPT4ge1xuICAgIC8qIGtlZXAgcHJvY2VzcyBhbGl2ZSAqL1xuICB9KTtcbn07XG5cbi8vIENMSSBzZXR1cFxucHJvZ3JhbVxuICAubmFtZSgnZ3V0ZW5iZXJnLWNvbXBpbGUnKVxuICAuZGVzY3JpcHRpb24oJ1RyYW5zcGlsZSBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MgYW5kIHRoZW1lIHRlbXBsYXRlcycpXG4gIC52ZXJzaW9uKCcxLjAuMCcpO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgY29uZmlnIGZpbGVcbiAqL1xuY29uc3QgaW5pdENvbmZpZyA9IChvcHRzOiB7XG4gIGFwaVVybD86IHN0cmluZztcbiAgb3V0cHV0Pzogc3RyaW5nO1xuICB0aGVtZURpcj86IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBmb3JjZT86IGJvb2xlYW47XG59KTogdm9pZCA9PiB7XG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgXG4gIC8vIENoZWNrIGlmIGNvbmZpZyBhbHJlYWR5IGV4aXN0c1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSAmJiAhb3B0cy5mb3JjZSkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZyBmaWxlIGFscmVhZHkgZXhpc3RzOiAke2NvbmZpZ1BhdGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFVzZSAtLWZvcmNlIHRvIG92ZXJ3cml0ZS5cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbiAgXG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIGFwaVVybDogb3B0cy5hcGlVcmwgPz8gJ2h0dHBzOi8veW91ci1oYW5kb2ZmLXNpdGUuY29tJyxcbiAgICBvdXRwdXQ6IG9wdHMub3V0cHV0ID8/ICcuL2RlbW8vcGx1Z2luL2Jsb2NrcycsXG4gICAgdGhlbWVEaXI6IG9wdHMudGhlbWVEaXIgPz8gJy4vZGVtby90aGVtZScsXG4gICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gJycsXG4gICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gJycsXG4gIH07XG4gIFxuICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KG5ld0NvbmZpZywgbnVsbCwgMikgKyAnXFxuJyk7XG4gIFxuICBjb25zb2xlLmxvZyhgXFxu4pyFIENyZWF0ZWQgY29uZmlnIGZpbGU6ICR7Y29uZmlnUGF0aH1gKTtcbiAgY29uc29sZS5sb2coYFxcbvCfk4QgQ29uZmlndXJhdGlvbjpgKTtcbiAgY29uc29sZS5sb2coYCAgIGFwaVVybDogICAke25ld0NvbmZpZy5hcGlVcmx9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBvdXRwdXQ6ICAgJHtuZXdDb25maWcub3V0cHV0fWApO1xuICBjb25zb2xlLmxvZyhgICAgdGhlbWVEaXI6ICR7bmV3Q29uZmlnLnRoZW1lRGlyfWApO1xuICBpZiAobmV3Q29uZmlnLnVzZXJuYW1lKSB7XG4gICAgY29uc29sZS5sb2coYCAgIHVzZXJuYW1lOiAke25ld0NvbmZpZy51c2VybmFtZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgcGFzc3dvcmQ6ICoqKipgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgXFxu8J+SoSBFZGl0IHRoaXMgZmlsZSB0byBjb25maWd1cmUgeW91ciBIYW5kb2ZmIEFQSSBzZXR0aW5ncy5cXG5gKTtcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgcHJvbXB0IGhlbHBlclxuICovXG5jb25zdCBwcm9tcHQgPSAocXVlc3Rpb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IHJlYWRsaW5lID0gcmVxdWlyZSgncmVhZGxpbmUnKTtcbiAgY29uc3QgcmwgPSByZWFkbGluZS5jcmVhdGVJbnRlcmZhY2Uoe1xuICAgIGlucHV0OiBwcm9jZXNzLnN0ZGluLFxuICAgIG91dHB1dDogcHJvY2Vzcy5zdGRvdXQsXG4gIH0pO1xuICBcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgcmwucXVlc3Rpb24ocXVlc3Rpb24sIChhbnN3ZXI6IHN0cmluZykgPT4ge1xuICAgICAgcmwuY2xvc2UoKTtcbiAgICAgIHJlc29sdmUoYW5zd2VyLnRyaW0oKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIHllcy9ub1xuICovXG5jb25zdCBwcm9tcHRZZXNObyA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTdHIgPSBkZWZhdWx0VmFsdWUgPyAnWS9uJyA6ICd5L04nO1xuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYCR7cXVlc3Rpb259IFske2RlZmF1bHRTdHJ9XTogYCk7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICByZXR1cm4gYW5zd2VyLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgneScpO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgd2l0aCBjaG9pY2VzXG4gKi9cbmNvbnN0IHByb21wdENob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSwgZGVmYXVsdEluZGV4OiBudW1iZXIgPSAwKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc3QgbWFya2VyID0gaSA9PT0gZGVmYXVsdEluZGV4ID8gJz4nIDogJyAnO1xuICAgIGNvbnNvbGUubG9nKGAgICR7bWFya2VyfSAke2kgKyAxfS4gJHtjaG9pY2V9YCk7XG4gIH0pO1xuICBcbiAgY29uc3QgYW5zd2VyID0gYXdhaXQgcHJvbXB0KGBFbnRlciBudW1iZXIgWyR7ZGVmYXVsdEluZGV4ICsgMX1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG4gIFxuICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGFuc3dlciwgMTApIC0gMTtcbiAgaWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCBjaG9pY2VzLmxlbmd0aCkge1xuICAgIHJldHVybiBjaG9pY2VzW2luZGV4XTtcbiAgfVxuICByZXR1cm4gY2hvaWNlc1tkZWZhdWx0SW5kZXhdO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgZm9yIG11bHRpcGxlIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0TXVsdGlDaG9pY2UgPSBhc3luYyAocXVlc3Rpb246IHN0cmluZywgY2hvaWNlczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG4ke3F1ZXN0aW9ufWApO1xuICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaSkgPT4ge1xuICAgIGNvbnNvbGUubG9nKGAgICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlcnMgc2VwYXJhdGVkIGJ5IGNvbW1hcyAoZS5nLiwgMSwyLDMpIG9yICdhbGwnOiBgKTtcbiAgaWYgKGFuc3dlci50b0xvd2VyQ2FzZSgpID09PSAnYWxsJykgcmV0dXJuIGNob2ljZXM7XG4gIGlmIChhbnN3ZXIgPT09ICcnKSByZXR1cm4gW2Nob2ljZXNbMF1dO1xuICBcbiAgY29uc3QgaW5kaWNlcyA9IGFuc3dlci5zcGxpdCgnLCcpLm1hcChzID0+IHBhcnNlSW50KHMudHJpbSgpLCAxMCkgLSAxKTtcbiAgcmV0dXJuIGluZGljZXNcbiAgICAuZmlsdGVyKGkgPT4gaSA+PSAwICYmIGkgPCBjaG9pY2VzLmxlbmd0aClcbiAgICAubWFwKGkgPT4gY2hvaWNlc1tpXSk7XG59O1xuXG4vKipcbiAqIEZpbmQgYWxsIGFycmF5IHByb3BlcnRpZXMgaW4gYSBjb21wb25lbnRcbiAqL1xuY29uc3QgZmluZEFycmF5UHJvcGVydGllcyA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPT4ge1xuICBjb25zdCBhcnJheXM6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0+ID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIGFycmF5cy5wdXNoKHsgcGF0aCwgcHJvcGVydHkgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3RzXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdvYmplY3QnICYmIHByb3BlcnR5LnByb3BlcnRpZXMpIHtcbiAgICAgIGFycmF5cy5wdXNoKC4uLmZpbmRBcnJheVByb3BlcnRpZXMocHJvcGVydHkucHJvcGVydGllcywgcGF0aCkpO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGFycmF5cztcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZmllbGQgbWFwcGluZyBzdWdnZXN0aW9ucyBiYXNlZCBvbiBhcnJheSBpdGVtIHByb3BlcnRpZXNcbiAqL1xuY29uc3Qgc3VnZ2VzdEZpZWxkTWFwcGluZ3MgPSAoaXRlbVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0+IHtcbiAgY29uc3Qgc3VnZ2VzdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIGNvbnN0IG1hcFByb3BlcnR5ID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IHBhdGggPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICBcbiAgICAgIC8vIFN1Z2dlc3QgbWFwcGluZ3MgYmFzZWQgb24gY29tbW9uIHBhdHRlcm5zXG4gICAgICBjb25zdCBsb3dlcktleSA9IGtleS50b0xvd2VyQ2FzZSgpO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdpbWFnZScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdwaG90bycpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0aHVtYm5haWwnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdmZWF0dXJlZF9pbWFnZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndGl0bGUnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdoZWFkaW5nJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ25hbWUnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X3RpdGxlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2V4Y2VycHQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnc3VtbWFyeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdkZXNjcmlwdGlvbicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZXhjZXJwdCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjb250ZW50JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2JvZHknKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2NvbnRlbnQnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleSA9PT0gJ3VybCcgfHwgbG93ZXJLZXkgPT09ICdocmVmJyB8fCBsb3dlcktleS5pbmNsdWRlcygnbGluaycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Blcm1hbGluayc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXRlJykpIHtcbiAgICAgICAgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdkYXknKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTpkYXlfbnVtZXJpYyc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ21vbnRoJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6bW9udGhfc2hvcnQnO1xuICAgICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCd5ZWFyJykpIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6eWVhcic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmZ1bGwnO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdhdXRob3InKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdhdXRob3IubmFtZSc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5LmluY2x1ZGVzKCdjYXRlZ29yeScpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCd0YWcnKSkge1xuICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICd0YXhvbm9teTpjYXRlZ29yeSc7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBuZXN0ZWQgb2JqZWN0c1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIG1hcFByb3BlcnR5KHByb3AucHJvcGVydGllcywgcGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBcbiAgbWFwUHJvcGVydHkoaXRlbVByb3BlcnRpZXMpO1xuICByZXR1cm4gc3VnZ2VzdGlvbnM7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHdpemFyZCBmb3IgY29uZmlndXJpbmcgZHluYW1pYyBhcnJheXNcbiAqL1xuY29uc3QgY29uZmlndXJlRHluYW1pY0FycmF5cyA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIGNvbXBvbmVudE5hbWU6IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+nmSBEeW5hbWljIEFycmF5IENvbmZpZ3VyYXRpb24gV2l6YXJkYCk7XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7Y29tcG9uZW50TmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBjb21wb25lbnQgc3RydWN0dXJlLi4uYCk7XG4gIGxldCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQ7XG4gIHRyeSB7XG4gICAgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnROYW1lKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgLy8gRmluZCBhcnJheSBwcm9wZXJ0aWVzXG4gIGNvbnN0IGFycmF5UHJvcHMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgXG4gIGlmIChhcnJheVByb3BzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIE5vIGFycmF5IHByb3BlcnRpZXMgZm91bmQgaW4gdGhpcyBjb21wb25lbnQuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIER5bmFtaWMgYXJyYXlzIGFyZSBvbmx5IGF2YWlsYWJsZSBmb3IgYXJyYXktdHlwZSBwcm9wZXJ0aWVzLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfVxuICBcbiAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHthcnJheVByb3BzLmxlbmd0aH0gYXJyYXkgZmllbGQocyk6YCk7XG4gIGFycmF5UHJvcHMuZm9yRWFjaCgoYXJyLCBpKSA9PiB7XG4gICAgY29uc3QgaXRlbUNvdW50ID0gYXJyLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzID8gT2JqZWN0LmtleXMoYXJyLnByb3BlcnR5Lml0ZW1zLnByb3BlcnRpZXMpLmxlbmd0aCA6IDA7XG4gICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2Fyci5wYXRofSAoJHtpdGVtQ291bnR9IGl0ZW0gcHJvcGVydGllcylgKTtcbiAgfSk7XG4gIFxuICAvLyBTZWxlY3Qgd2hpY2ggYXJyYXlzIHRvIGNvbmZpZ3VyZVxuICBjb25zdCBzZWxlY3RlZEFycmF5cyA9IGFycmF5UHJvcHMubGVuZ3RoID09PSAxIFxuICAgID8gW2FycmF5UHJvcHNbMF1dXG4gICAgOiBhd2FpdCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBjaG9pY2VzID0gYXJyYXlQcm9wcy5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdE11bHRpQ2hvaWNlKCdXaGljaCBhcnJheShzKSBkbyB5b3Ugd2FudCB0byBjb25maWd1cmU/JywgY2hvaWNlcyk7XG4gICAgICAgIHJldHVybiBhcnJheVByb3BzLmZpbHRlcihhID0+IHNlbGVjdGVkLmluY2x1ZGVzKGEucGF0aCkpO1xuICAgICAgfSkoKTtcbiAgXG4gIC8vIExvYWQgZXhpc3RpbmcgY29uZmlnXG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2hhbmRvZmYtd3AuY29uZmlnLmpzb24nKTtcbiAgbGV0IGV4aXN0aW5nQ29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7fTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMoY29uZmlnUGF0aCkpIHtcbiAgICB0cnkge1xuICAgICAgZXhpc3RpbmdDb25maWcgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhjb25maWdQYXRoLCAndXRmLTgnKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBJZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgfVxuICB9XG4gIFxuICAvLyBCdWlsZCB0aGUgaW1wb3J0IGNvbmZpZywgcHJlc2VydmluZyBleGlzdGluZyBlbnRyaWVzXG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0gZXhpc3RpbmdDb25maWcuaW1wb3J0IHx8IHsgZWxlbWVudDogZmFsc2UgfTtcbiAgaWYgKCFpbXBvcnRDb25maWcuYmxvY2sgfHwgdHlwZW9mIGltcG9ydENvbmZpZy5ibG9jayA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgaW1wb3J0Q29uZmlnLmJsb2NrID0ge307XG4gIH1cbiAgY29uc3QgYmxvY2tDb25maWcgPSBpbXBvcnRDb25maWcuYmxvY2sgYXMgUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPjtcbiAgaWYgKCFibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID09PSAnYm9vbGVhbicpIHtcbiAgICBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdID0ge307XG4gIH1cbiAgY29uc3QgY29tcG9uZW50RmllbGRDb25maWcgPSBibG9ja0NvbmZpZ1tjb21wb25lbnQuaWRdIGFzIFJlY29yZDxzdHJpbmcsIEZpZWxkQ29uZmlnPjtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUG9zdHNBcnJheSA9IGFzeW5jIChhcnJheVByb3A6IHsgcGF0aDogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0pOiBQcm9taXNlPER5bmFtaWNBcnJheUNvbmZpZz4gPT4ge1xuICAgIC8vIFNlbGVjdGlvbiBtb2RlXG4gICAgY29uc3Qgc2VsZWN0aW9uTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHVzZXJzIHNlbGVjdCBwb3N0cz8nLFxuICAgICAgWydRdWVyeSBCdWlsZGVyIChmaWx0ZXIgYnkgdGF4b25vbXksIG9yZGVyLCBldGMuKScsICdNYW51YWwgU2VsZWN0aW9uIChoYW5kLXBpY2sgc3BlY2lmaWMgcG9zdHMpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc1F1ZXJ5TW9kZSA9IHNlbGVjdGlvbk1vZGUuaW5jbHVkZXMoJ1F1ZXJ5Jyk7XG5cbiAgICAvLyBQb3N0IHR5cGVzXG4gICAgY29uc29sZS5sb2coYFxcbkVudGVyIGFsbG93ZWQgcG9zdCB0eXBlcyAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCBwb3N0VHlwZXNJbnB1dCA9IGF3YWl0IHByb21wdChgUG9zdCB0eXBlcyBbcG9zdF06IGApO1xuICAgIGNvbnN0IHBvc3RUeXBlcyA9IHBvc3RUeXBlc0lucHV0XG4gICAgICA/IHBvc3RUeXBlc0lucHV0LnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKVxuICAgICAgOiBbJ3Bvc3QnXTtcblxuICAgIC8vIE1heCBpdGVtc1xuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gaXRlbXMgWzEyXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogMTI7XG5cbiAgICAvLyBSZW5kZXIgbW9kZVxuICAgIGNvbnN0IHJlbmRlck1vZGUgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnSG93IHNob3VsZCBwb3N0cyBiZSByZW5kZXJlZD8nLFxuICAgICAgWydNYXBwZWQgKGNvbnZlcnQgcG9zdCBmaWVsZHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlKScsICdUZW1wbGF0ZSAodXNlIGEgUEhQIHRlbXBsYXRlIGZpbGUpJ10sXG4gICAgICAwXG4gICAgKTtcbiAgICBjb25zdCBpc01hcHBlZE1vZGUgPSByZW5kZXJNb2RlLmluY2x1ZGVzKCdNYXBwZWQnKTtcblxuICAgIGxldCBmaWVsZE1hcHBpbmc6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICBsZXQgdGVtcGxhdGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoaXNNYXBwZWRNb2RlKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TiiBGaWVsZCBNYXBwaW5nIENvbmZpZ3VyYXRpb25gKTtcblxuICAgICAgY29uc3QgaXRlbVByb3BzID0gYXJyYXlQcm9wLnByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGl0ZW1Qcm9wcykge1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IHN1Z2dlc3RGaWVsZE1hcHBpbmdzKGl0ZW1Qcm9wcyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYFxcbkknbGwgc3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBmaWVsZCBuYW1lcy4gUHJlc3MgRW50ZXIgdG8gYWNjZXB0IG9yIHR5cGUgYSBuZXcgdmFsdWUuYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG5BdmFpbGFibGUgc291cmNlczpgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X3RpdGxlLCBwb3N0X2V4Y2VycHQsIHBvc3RfY29udGVudCwgcGVybWFsaW5rLCBwb3N0X2lkYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gZmVhdHVyZWRfaW1hZ2VgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBwb3N0X2RhdGU6ZGF5LCBwb3N0X2RhdGU6bW9udGhfc2hvcnQsIHBvc3RfZGF0ZTp5ZWFyLCBwb3N0X2RhdGU6ZnVsbGApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIGF1dGhvci5uYW1lLCBhdXRob3IudXJsLCBhdXRob3IuYXZhdGFyYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gdGF4b25vbXk6Y2F0ZWdvcnksIHRheG9ub215OnBvc3RfdGFnYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gbWV0YTpmaWVsZF9uYW1lYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gKGxlYXZlIGVtcHR5IHRvIHNraXApXFxuYCk7XG5cbiAgICAgICAgY29uc3QgZmxhdHRlblByb3BzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwcmVmaXg6IHN0cmluZyA9ICcnKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgIGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICAgICAgICBjb25zdCBwID0gcHJlZml4ID8gYCR7cHJlZml4fS4ke2tleX1gIDoga2V5O1xuICAgICAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIHBhdGhzLnB1c2goLi4uZmxhdHRlblByb3BzKHByb3AucHJvcGVydGllcywgcCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaChwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHBhdGhzO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoY29uc3QgZmllbGRQYXRoIG9mIGZsYXR0ZW5Qcm9wcyhpdGVtUHJvcHMpKSB7XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9IHN1Z2dlc3Rpb25zW2ZpZWxkUGF0aF0gfHwgJyc7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFN0ciA9IHN1Z2dlc3Rpb24gPyBgIFske3N1Z2dlc3Rpb259XWAgOiAnJztcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gYXdhaXQgcHJvbXB0KGAgICR7ZmllbGRQYXRofSR7ZGVmYXVsdFN0cn06IGApO1xuICAgICAgICAgIGNvbnN0IGZpbmFsTWFwcGluZyA9IG1hcHBpbmcgfHwgc3VnZ2VzdGlvbjtcbiAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nKSB7XG4gICAgICAgICAgICBpZiAoZmluYWxNYXBwaW5nLnN0YXJ0c1dpdGgoJ3snKSkge1xuICAgICAgICAgICAgICB0cnkgeyBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IEpTT04ucGFyc2UoZmluYWxNYXBwaW5nKTsgfVxuICAgICAgICAgICAgICBjYXRjaCB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nOyB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaWVsZE1hcHBpbmdbZmllbGRQYXRoXSA9IGZpbmFsTWFwcGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZGVmYXVsdFRlbXBsYXRlID0gYHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvJHthcnJheVByb3AucGF0aH0taXRlbS5waHBgO1xuICAgICAgdGVtcGxhdGVQYXRoID0gYXdhaXQgcHJvbXB0KGBUZW1wbGF0ZSBwYXRoIFske2RlZmF1bHRUZW1wbGF0ZX1dOiBgKSB8fCBkZWZhdWx0VGVtcGxhdGU7XG4gICAgfVxuXG4gICAgY29uc3QgYXJyYXlDb25maWc6IER5bmFtaWNBcnJheUNvbmZpZyA9IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBwb3N0VHlwZXMsXG4gICAgICBzZWxlY3Rpb25Nb2RlOiBpc1F1ZXJ5TW9kZSA/ICdxdWVyeScgOiAnbWFudWFsJyxcbiAgICAgIG1heEl0ZW1zLFxuICAgICAgcmVuZGVyTW9kZTogaXNNYXBwZWRNb2RlID8gJ21hcHBlZCcgOiAndGVtcGxhdGUnLFxuICAgIH07XG4gICAgaWYgKGlzTWFwcGVkTW9kZSAmJiBPYmplY3Qua2V5cyhmaWVsZE1hcHBpbmcpLmxlbmd0aCA+IDApIGFycmF5Q29uZmlnLmZpZWxkTWFwcGluZyA9IGZpZWxkTWFwcGluZztcbiAgICBpZiAoIWlzTWFwcGVkTW9kZSAmJiB0ZW1wbGF0ZVBhdGgpIGFycmF5Q29uZmlnLnRlbXBsYXRlUGF0aCA9IHRlbXBsYXRlUGF0aDtcbiAgICBpZiAoaXNRdWVyeU1vZGUpIHtcbiAgICAgIGFycmF5Q29uZmlnLmRlZmF1bHRRdWVyeUFyZ3MgPSB7XG4gICAgICAgIHBvc3RzX3Blcl9wYWdlOiBNYXRoLm1pbihtYXhJdGVtcywgNiksXG4gICAgICAgIG9yZGVyYnk6ICdkYXRlJyxcbiAgICAgICAgb3JkZXI6ICdERVNDJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBhcnJheUNvbmZpZztcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIEJyZWFkY3J1bWJzQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVCcmVhZGNydW1ic0FycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8QnJlYWRjcnVtYnNBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBCcmVhZGNydW1icyBhcmUgYnVpbHQgYXV0b21hdGljYWxseSBmcm9tIHRoZSBjdXJyZW50IHBhZ2UgVVJMLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHdpbGwgc2hvdyBhIHNpbmdsZSBlbmFibGUvZGlzYWJsZSB0b2dnbGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIGFjdGl2ZSB9XFxuYCk7XG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAnYnJlYWRjcnVtYnMnIH07XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBUYXhvbm9teUFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlVGF4b25vbXlBcnJheSA9IGFzeW5jICgpOiBQcm9taXNlPFRheG9ub215QXJyYXlDb25maWc+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgVGF4b25vbXkgdGVybXMgYXJlIGZldGNoZWQgZnJvbSB0aGUgY3VycmVudCBwb3N0IHNlcnZlci1zaWRlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgdG9nZ2xlIGFuZCBhIGRyb3Bkb3duIHRvIGNob29zZSB0aGUgdGF4b25vbXkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEl0ZW1zIGhhdmUgdGhlIHNoYXBlOiB7IGxhYmVsLCB1cmwsIHNsdWcgfVxcbmApO1xuXG4gICAgY29uc29sZS5sb2coYEVudGVyIHRoZSB0YXhvbm9teSBzbHVncyBlZGl0b3JzIGNhbiBjaG9vc2UgZnJvbSAoY29tbWEtc2VwYXJhdGVkKTpgKTtcbiAgICBjb25zdCB0YXhvbm9teUlucHV0ID0gYXdhaXQgcHJvbXB0KGBUYXhvbm9taWVzIFtwb3N0X3RhZyxjYXRlZ29yeV06IGApO1xuICAgIGNvbnN0IHRheG9ub21pZXMgPSB0YXhvbm9teUlucHV0XG4gICAgICA/IHRheG9ub215SW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdF90YWcnLCAnY2F0ZWdvcnknXTtcblxuICAgIGNvbnN0IG1heEl0ZW1zSW5wdXQgPSBhd2FpdCBwcm9tcHQoYE1heGltdW0gdGVybXMgdG8gZGlzcGxheSAoLTEgPSBhbGwpIFstMV06IGApO1xuICAgIGNvbnN0IG1heEl0ZW1zID0gbWF4SXRlbXNJbnB1dCA/IHBhcnNlSW50KG1heEl0ZW1zSW5wdXQsIDEwKSA6IC0xO1xuXG4gICAgY29uc3QgY29uZmlnOiBUYXhvbm9teUFycmF5Q29uZmlnID0geyBhcnJheVR5cGU6ICd0YXhvbm9teScsIHRheG9ub21pZXMgfTtcbiAgICBpZiAobWF4SXRlbXMgPiAwKSBjb25maWcubWF4SXRlbXMgPSBtYXhJdGVtcztcbiAgICByZXR1cm4gY29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgUGFnaW5hdGlvbkFycmF5Q29uZmlnIGludGVyYWN0aXZlbHlcbiAgY29uc3QgY29uZmlndXJlUGFnaW5hdGlvbkFycmF5ID0gYXN5bmMgKG90aGVyQXJyYXlQYXRoczogc3RyaW5nW10pOiBQcm9taXNlPFBhZ2luYXRpb25BcnJheUNvbmZpZyB8IG51bGw+ID0+IHtcbiAgICBjb25zb2xlLmxvZyhgXFxuICAgUGFnaW5hdGlvbiBsaW5rcyBhcmUgZGVyaXZlZCBhdXRvbWF0aWNhbGx5IGZyb20gYSBzaWJsaW5nIHBvc3RzIGFycmF5IHF1ZXJ5LmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBUaGUgZWRpdG9yIHNob3dzIGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcblxuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pqg77iPICBObyBzaWJsaW5nIGFycmF5cyBmb3VuZCB0byBjb25uZWN0IHRvLiBDb25maWd1cmUgYSBwb3N0cyBhcnJheSBmaXJzdC5gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBjb25uZWN0ZWRGaWVsZDogc3RyaW5nO1xuICAgIGlmIChvdGhlckFycmF5UGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IG90aGVyQXJyYXlQYXRoc1swXTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb25uZWN0ZWQgdG86ICR7Y29ubmVjdGVkRmllbGR9IChvbmx5IG9wdGlvbilgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgY2hvaWNlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgICAnV2hpY2ggcG9zdHMgYXJyYXkgc2hvdWxkIHRoaXMgcGFnaW5hdGlvbiBiZSBjb25uZWN0ZWQgdG8/JyxcbiAgICAgICAgb3RoZXJBcnJheVBhdGhzLFxuICAgICAgICAwXG4gICAgICApO1xuICAgICAgY29ubmVjdGVkRmllbGQgPSBjaG9pY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXJyYXlUeXBlOiAncGFnaW5hdGlvbicsIGNvbm5lY3RlZEZpZWxkIH07XG4gIH07XG5cbiAgLy8gQ29uZmlndXJlIGVhY2ggc2VsZWN0ZWQgYXJyYXlcbiAgZm9yIChjb25zdCBhcnJheVByb3Agb2Ygc2VsZWN0ZWRBcnJheXMpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvbmZpZ3VyaW5nOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1cXG5gKTtcblxuICAgIC8vIExldCB0aGUgdXNlciBjaG9vc2UgdGhlIGFycmF5IHR5cGVcbiAgICBjb25zdCBhcnJheVR5cGVDaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAnV2hhdCBraW5kIG9mIGRhdGEgc2hvdWxkIHRoaXMgYXJyYXkgY29udGFpbj8nLFxuICAgICAgW1xuICAgICAgICAnUG9zdHMg4oCUIHF1ZXJ5IG9yIGhhbmQtcGljayBXb3JkUHJlc3MgcG9zdHMgKGRlZmF1bHQpJyxcbiAgICAgICAgJ0JyZWFkY3J1bWJzIOKAlCBhdXRvLWdlbmVyYXRlZCB0cmFpbCBmcm9tIGN1cnJlbnQgVVJMJyxcbiAgICAgICAgJ1RheG9ub215IOKAlCB0ZXJtcyBhdHRhY2hlZCB0byB0aGUgY3VycmVudCBwb3N0JyxcbiAgICAgICAgJ1BhZ2luYXRpb24g4oCUIGxpbmtzIGRlcml2ZWQgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXknLFxuICAgICAgXSxcbiAgICAgIDBcbiAgICApO1xuXG4gICAgbGV0IGFycmF5Q29uZmlnOiBGaWVsZENvbmZpZyB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdCcmVhZGNydW1icycpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdUYXhvbm9teScpKSB7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVRheG9ub215QXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGFycmF5VHlwZUNob2ljZS5zdGFydHNXaXRoKCdQYWdpbmF0aW9uJykpIHtcbiAgICAgIC8vIE9mZmVyIHRoZSBvdGhlciBhbHJlYWR5LWNvbmZpZ3VyZWQgKG9yIHlldC10by1iZS1jb25maWd1cmVkKSBhcnJheSBwYXRocyBhcyBjYW5kaWRhdGVzXG4gICAgICBjb25zdCBzaWJsaW5nID0gc2VsZWN0ZWRBcnJheXNcbiAgICAgICAgLmZpbHRlcihhID0+IGEucGF0aCAhPT0gYXJyYXlQcm9wLnBhdGgpXG4gICAgICAgIC5tYXAoYSA9PiBhLnBhdGgpO1xuICAgICAgYXJyYXlDb25maWcgPSBhd2FpdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkoc2libGluZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFBvc3RzXG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBvc3RzQXJyYXkoYXJyYXlQcm9wKTtcbiAgICB9XG5cbiAgICBpZiAoYXJyYXlDb25maWcpIHtcbiAgICAgIGNvbXBvbmVudEZpZWxkQ29uZmlnW2FycmF5UHJvcC5wYXRoXSA9IGFycmF5Q29uZmlnO1xuICAgICAgY29uc29sZS5sb2coYFxcbuKchSBDb25maWd1cmVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH0gKCR7KGFycmF5Q29uZmlnIGFzIGFueSkuYXJyYXlUeXBlID8/ICdwb3N0cyd9KWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBTa2lwcGVkOiAke2NvbXBvbmVudC5pZH0uJHthcnJheVByb3AucGF0aH1gKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFVwZGF0ZSBjb25maWcgZmlsZSDigJQgcmVtb3ZlIGxlZ2FjeSBkeW5hbWljQXJyYXlzIGlmIHByZXNlbnRcbiAgY29uc3QgeyBkeW5hbWljQXJyYXlzOiBfbGVnYWN5RHluYW1pYywgLi4ucmVzdENvbmZpZyB9ID0gZXhpc3RpbmdDb25maWc7XG4gIGNvbnN0IG5ld0NvbmZpZzogSGFuZG9mZldwQ29uZmlnID0ge1xuICAgIC4uLnJlc3RDb25maWcsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gIH07XG4gIFxuICBjb25zb2xlLmxvZyhgXFxuJHsn4pSAJy5yZXBlYXQoNjApfWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uIFByZXZpZXc6XFxuYCk7XG4gIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHsgaW1wb3J0OiBpbXBvcnRDb25maWcgfSwgbnVsbCwgMikpO1xuICBcbiAgY29uc3Qgc2hvdWxkU2F2ZSA9IGF3YWl0IHByb21wdFllc05vKCdcXG5TYXZlIHRvIGhhbmRvZmYtd3AuY29uZmlnLmpzb24/JywgdHJ1ZSk7XG4gIFxuICBpZiAoc2hvdWxkU2F2ZSkge1xuICAgIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyFIFNhdmVkIHRvICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+SoSBOZXh0IHN0ZXBzOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICAxLiBSdW46IG5wbSBydW4gZGV2IC0tICR7Y29tcG9uZW50TmFtZX0gLS1mb3JjZWApO1xuICAgIGNvbnNvbGUubG9nKGAgICAyLiBCdWlsZCB5b3VyIGJsb2NrczogY2QgZGVtby9wbHVnaW4gJiYgbnBtIHJ1biBidWlsZGApO1xuICAgIGNvbnNvbGUubG9nKGAgICAzLiBUZXN0IHRoZSBibG9jayBpbiBXb3JkUHJlc3NcXG5gKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb25maWd1cmF0aW9uIG5vdCBzYXZlZC4gQ29weSB0aGUgSlNPTiBhYm92ZSBtYW51YWxseSBpZiBuZWVkZWQuXFxuYCk7XG4gIH1cbn07XG5cbi8vIENvbmZpZ3VyZSBkeW5hbWljIGFycmF5cyBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdjb25maWd1cmUtZHluYW1pYyBbY29tcG9uZW50XScpXG4gIC5hbGlhcygnd2l6YXJkJylcbiAgLmRlc2NyaXB0aW9uKCdJbnRlcmFjdGl2ZSB3aXphcmQgdG8gY29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGZvciBhIGNvbXBvbmVudCcpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCAnSGFuZG9mZiBBUEkgYmFzZSBVUkwnKVxuICAub3B0aW9uKCctdSwgLS11c2VybmFtZSA8dXNlcm5hbWU+JywgJ0Jhc2ljIGF1dGggdXNlcm5hbWUnKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctbCwgLS1saXN0JywgJ0xpc3QgYXZhaWxhYmxlIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMnKVxuICAub3B0aW9uKCctcywgLS1zb3VyY2UgPGRpcj4nLCAnUmVhZCBIYW5kb2ZmIHB1YmxpYy9hcGkgZnJvbSBkaXNrIGluc3RlYWQgb2YgSFRUUCcpXG4gIC5hY3Rpb24oYXN5bmMgKGNvbXBvbmVudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0czoge1xuICAgIGFwaVVybD86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICBsaXN0PzogYm9vbGVhbjtcbiAgICBzb3VyY2U/OiBzdHJpbmc7XG4gIH0pID0+IHtcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIGNvbnN0IGxvY2FsQXBpUm9vdCA9IG9wdHMuc291cmNlID8gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdHMuc291cmNlKSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBkYXRhQ3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQgPSB7IGFwaVVybCwgYXV0aCwgbG9jYWxBcGlSb290IH07XG4gICAgXG4gICAgLy8gSWYgbGlzdGluZyBjb21wb25lbnRzLCBzaG93IGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICBpZiAob3B0cy5saXN0IHx8ICFjb21wb25lbnROYW1lKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBGZXRjaGluZyBjb21wb25lbnQgbGlzdCBmcm9tICR7YXBpVXJsfS4uLlxcbmApO1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudExpc3QoZGF0YUN0eCwgY29uZmlnLmltcG9ydCk7XG4gICAgICAgIFxuICAgICAgICAvLyBGZXRjaCBlYWNoIGNvbXBvbmVudCB0byBmaW5kIG9uZXMgd2l0aCBhcnJheSBmaWVsZHNcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4sgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzLiBDaGVja2luZyBmb3IgYXJyYXkgZmllbGRzLi4uXFxuYCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjb21wb25lbnRzV2l0aEFycmF5czogQXJyYXk8eyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBhcnJheXM6IHN0cmluZ1tdIH0+ID0gW107XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGlkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChkYXRhQ3R4LCBpZCk7XG4gICAgICAgICAgICBjb25zdCBhcnJheXMgPSBmaW5kQXJyYXlQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIGlmIChhcnJheXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgICB0aXRsZTogY29tcG9uZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgIGFycmF5czogYXJyYXlzLm1hcChhID0+IGEucGF0aCksXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGNvbXBvbmVudHNXaXRoQXJyYXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIE5vIGNvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHMgZm91bmQuXFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+nqSBDb21wb25lbnRzIHdpdGggYXJyYXkgZmllbGRzOlxcbmApO1xuICAgICAgICBjb21wb25lbnRzV2l0aEFycmF5cy5mb3JFYWNoKChjLCBpKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgICR7aSArIDF9LiAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICAgIGMuYXJyYXlzLmZvckVhY2goYSA9PiBjb25zb2xlLmxvZyhgICAgICAg4pSU4pSAICR7YX1gKSk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgaWYgKG9wdHMubGlzdCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIFJ1bjogbnBtIHJ1biBkZXYgLS0gd2l6YXJkIDxjb21wb25lbnQtaWQ+XFxuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJbnRlcmFjdGl2ZSBzZWxlY3Rpb25cbiAgICAgICAgY29uc3QgY2hvaWNlcyA9IGNvbXBvbmVudHNXaXRoQXJyYXlzLm1hcChjID0+IGAke2MudGl0bGV9ICgke2MuaWR9KWApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHByb21wdENob2ljZSgnXFxuU2VsZWN0IGEgY29tcG9uZW50IHRvIGNvbmZpZ3VyZTonLCBjaG9pY2VzLCAwKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRJbmRleCA9IGNob2ljZXMuaW5kZXhPZihzZWxlY3RlZCk7XG4gICAgICAgIGNvbXBvbmVudE5hbWUgPSBjb21wb25lbnRzV2l0aEFycmF5c1tzZWxlY3RlZEluZGV4XS5pZDtcbiAgICAgICAgXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBhd2FpdCBjb25maWd1cmVEeW5hbWljQXJyYXlzKGRhdGFDdHgsIGNvbXBvbmVudE5hbWUhKTtcbiAgfSk7XG5cbi8vIEluaXQgY29tbWFuZFxucHJvZ3JhbVxuICAuY29tbWFuZCgnaW5pdCcpXG4gIC5kZXNjcmlwdGlvbignQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy0tb3V0cHV0IDxkaXI+JywgJ091dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcycpXG4gIC5vcHRpb24oJy0tdGhlbWUtZGlyIDxkaXI+JywgJ1RoZW1lIGRpcmVjdG9yeSBmb3IgaGVhZGVyL2Zvb3RlciB0ZW1wbGF0ZXMnKVxuICAub3B0aW9uKCctLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy0tcGFzc3dvcmQgPHBhc3N3b3JkPicsICdCYXNpYyBhdXRoIHBhc3N3b3JkJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdPdmVyd3JpdGUgZXhpc3RpbmcgY29uZmlnIGZpbGUnKVxuICAuYWN0aW9uKChvcHRpb25zLCBjb21tYW5kKSA9PiB7XG4gICAgLy8gVXNlIG9wdHNXaXRoR2xvYmFscyB0byBnZXQgb3B0aW9ucyBmcm9tIGJvdGggc3ViY29tbWFuZCBhbmQgcGFyZW50XG4gICAgY29uc3Qgb3B0cyA9IGNvbW1hbmQub3B0c1dpdGhHbG9iYWxzKCk7XG4gICAgaW5pdENvbmZpZyhvcHRzKTtcbiAgfSk7XG5cbi8vIERlZmF1bHQgY29tbWFuZCBmb3IgYmxvY2tzXG5wcm9ncmFtXG4gIC5hcmd1bWVudCgnW2NvbXBvbmVudF0nLCAnQ29tcG9uZW50IG5hbWUgdG8gY29tcGlsZSBvciB2YWxpZGF0ZScpXG4gIC5vcHRpb24oJy1hLCAtLWFwaS11cmwgPHVybD4nLCBgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6ICR7Y29uZmlnLmFwaVVybH0pYClcbiAgLm9wdGlvbignLW8sIC0tb3V0cHV0IDxkaXI+JywgYE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogJHtjb25maWcub3V0cHV0fSlgKVxuICAub3B0aW9uKCctLWFsbCcsICdDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50cycpXG4gIC5vcHRpb24oJy0tdGhlbWUnLCAnQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKSB0byB0aGVtZSBkaXJlY3RvcnknKVxuICAub3B0aW9uKCctdCwgLS10aGVtZS1kaXIgPGRpcj4nLCBgVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcyAoZGVmYXVsdDogJHtjb25maWcudGhlbWVEaXJ9KWApXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZSBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctcCwgLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQgZm9yIEhhbmRvZmYgQVBJJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZScsICdWYWxpZGF0ZSBhIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlcycpXG4gIC5vcHRpb24oJy0tdmFsaWRhdGUtYWxsJywgJ1ZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS1mb3JjZScsICdGb3JjZSBjb21waWxhdGlvbiBldmVuIHdpdGggYnJlYWtpbmcgY2hhbmdlcycpXG4gIC5vcHRpb24oJy1zLCAtLXNvdXJjZSA8ZGlyPicsICdSZWFkIEhhbmRvZmYgcHVibGljL2FwaSBmcm9tIGRpc2sgaW5zdGVhZCBvZiBIVFRQJylcbiAgLm9wdGlvbignLS13YXRjaCcsICdXYXRjaCAtLXNvdXJjZSBmb3IgY2hhbmdlcyAocmVxdWlyZXMgLS1zb3VyY2UpJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7IFxuICAgIGFwaVVybD86IHN0cmluZzsgXG4gICAgb3V0cHV0Pzogc3RyaW5nOyBcbiAgICBhbGw/OiBib29sZWFuOyBcbiAgICB0aGVtZT86IGJvb2xlYW47XG4gICAgdGhlbWVEaXI/OiBzdHJpbmc7XG4gICAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gICAgdmFsaWRhdGU/OiBib29sZWFuO1xuICAgIHZhbGlkYXRlQWxsPzogYm9vbGVhbjtcbiAgICBmb3JjZT86IGJvb2xlYW47XG4gICAgc291cmNlPzogc3RyaW5nO1xuICAgIHdhdGNoPzogYm9vbGVhbjtcbiAgfSkgPT4ge1xuICAgIC8vIE1lcmdlIENMSSBvcHRpb25zIHdpdGggY29uZmlnIChDTEkgdGFrZXMgcHJlY2VkZW5jZSlcbiAgICBjb25zdCBhcGlVcmwgPSBvcHRzLmFwaVVybCA/PyBjb25maWcuYXBpVXJsO1xuICAgIGNvbnN0IG91dHB1dCA9IG9wdHMub3V0cHV0ID8/IGNvbmZpZy5vdXRwdXQ7XG4gICAgY29uc3QgdGhlbWVEaXIgPSBvcHRzLnRoZW1lRGlyID8/IGNvbmZpZy50aGVtZURpcjtcbiAgICBjb25zdCBhdXRoOiBBdXRoQ3JlZGVudGlhbHMgPSB7XG4gICAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyBjb25maWcudXNlcm5hbWUsXG4gICAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyBjb25maWcucGFzc3dvcmQsXG4gICAgfTtcbiAgICBjb25zdCBsb2NhbEFwaVJvb3QgPSBvcHRzLnNvdXJjZSA/IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRzLnNvdXJjZSkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZGF0YUN0eDogSGFuZG9mZkRhdGFDb250ZXh0ID0geyBhcGlVcmwsIGF1dGgsIGxvY2FsQXBpUm9vdCB9O1xuXG4gICAgaWYgKG9wdHMud2F0Y2gpIHtcbiAgICAgIGlmICghbG9jYWxBcGlSb290KSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiAtLXdhdGNoIHJlcXVpcmVzIC0tc291cmNlIDxkaXI+IChwYXRoIHRvIEhhbmRvZmYgcHVibGljL2FwaSknKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgaWYgKG9wdHMudmFsaWRhdGVBbGwgfHwgb3B0cy52YWxpZGF0ZSB8fCBvcHRzLmFsbCB8fCBvcHRzLnRoZW1lKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiAtLXdhdGNoIGNhbm5vdCBiZSBjb21iaW5lZCB3aXRoIC0tYWxsLCAtLXRoZW1lLCAtLXZhbGlkYXRlLCBvciAtLXZhbGlkYXRlLWFsbCcpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICBhd2FpdCBydW5XYXRjaE1vZGUoZGF0YUN0eCwgb3V0cHV0LCBjb21wb25lbnROYW1lLCB7IGZvcmNlOiBvcHRzLmZvcmNlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICAvLyBWYWxpZGF0aW9uIGNvbW1hbmRzXG4gICAgaWYgKG9wdHMudmFsaWRhdGVBbGwpIHtcbiAgICAgIGF3YWl0IHZhbGlkYXRlQWxsKGRhdGFDdHgsIG91dHB1dCwgY29uZmlnLmltcG9ydCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIGlmIChvcHRzLnZhbGlkYXRlICYmIGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGRhdGFDdHgsIG91dHB1dCwgY29tcG9uZW50TmFtZSk7XG4gICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkICYmICFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tcGlsYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy50aGVtZSkge1xuICAgICAgYXdhaXQgY29tcGlsZVRoZW1lKGRhdGFDdHgsIHRoZW1lRGlyKTtcbiAgICB9IGVsc2UgaWYgKG9wdHMuYWxsKSB7XG4gICAgICAvLyBWYWxpZGF0ZSBhbGwgZmlyc3QgdW5sZXNzIGZvcmNlZFxuICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIFByZS1jb21waWxhdGlvbiB2YWxpZGF0aW9uLi4uXFxuYCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoZGF0YUN0eCwgb3V0cHV0LCBjb25maWcuaW1wb3J0KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gdmFsaWRhdGVBbGwgZXhpdHMgd2l0aCBjb2RlIDEgb24gYnJlYWtpbmcgY2hhbmdlc1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgY29tcGlsZUFsbChkYXRhQ3R4LCBvdXRwdXQpO1xuICAgICAgXG4gICAgICAvLyBVcGRhdGUgbWFuaWZlc3QgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb21waWxhdGlvblxuICAgICAgY29uc29sZS5sb2coYFxcbvCfk50gVXBkYXRpbmcgcHJvcGVydHkgbWFuaWZlc3QuLi5gKTtcbiAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50TGlzdChkYXRhQ3R4LCBjb25maWcuaW1wb3J0KTtcbiAgICAgIGZvciAoY29uc3QgY29tcG9uZW50SWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgY29tcG9uZW50SWQpO1xuICAgICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gU2tpcCBmYWlsZWQgY29tcG9uZW50c1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFIE1hbmlmZXN0IHVwZGF0ZWRcXG5gKTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgIC8vIEJ1aWxkIG1lcmdlZC1ncm91cCBsb29rdXAgb25jZSBmb3IgdGhpcyBicmFuY2hcbiAgICAgIGNvbnN0IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlciA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIG1vZGVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5ncm91cHMpKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICAgIH1cblxuICAgICAgLy8gSGVscGVyOiBjb21waWxlIGFuIGVudGlyZSBtZXJnZWQgZ3JvdXAgYnkgaXRzIGNvbmZpZyBrZXlcbiAgICAgIGNvbnN0IGNvbXBpbGVHcm91cEJ5S2V5ID0gYXN5bmMgKGdyb3VwS2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QoZGF0YUN0eCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gZ3JvdXBLZXkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGdyb3VwTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogTm8gY29tcG9uZW50cyBmb3VuZCBmb3IgbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbEdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiBncm91cE1hdGNoZXMpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZnVsbCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGRhdGFDdHgsIGMuaWQpO1xuICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhmdWxsKTtcbiAgICAgICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFNraXBwaW5nICR7Yy5pZH0gKHRlbXBsYXRlIHZhbGlkYXRpb24gZmFpbGVkKWApO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bGxHcm91cENvbXBvbmVudHMucHVzaChmdWxsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjLmlkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcjogQ291bGQgbm90IGZldGNoIGFueSBjb21wb25lbnRzIGZvciBncm91cCBcIiR7Z3JvdXBLZXl9XCIuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cChkYXRhQ3R4LCBvdXRwdXQsIGdyb3VwS2V5LCBmdWxsR3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgaWYgKGRhdGFDdHgubG9jYWxBcGlSb290KSB7XG4gICAgICAgICAgYXdhaXQgc3luY0J1bmRsZUFzc2V0cyhkYXRhQ3R4LCBwYXRoLnJlc29sdmUob3V0cHV0LCAnLi4nKSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKchSBHcm91cCBcIiR7Z3JvdXBLZXl9XCIgY29tcGlsZWQgKCR7ZnVsbEdyb3VwQ29tcG9uZW50cy5sZW5ndGh9IHZhcmlhbnRzKS5cXG5gKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFRyeSBjb21wb25lbnQgZmlyc3QsIHRoZW4gZmFsbCBiYWNrIHRvIGdyb3VwIChlLmcuIFwiaGVyb1wiIC0+IEhlcm8gbWVyZ2VkIGJsb2NrKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgY29tcG9uZW50TmFtZSk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBjb21wb25lbnQgYmVsb25ncyB0byBhIG1lcmdlZCBncm91cCwgY29tcGlsZSB0aGUgd2hvbGUgZ3JvdXAgaW5zdGVhZFxuICAgICAgICBpZiAoY29tcG9uZW50Lmdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGNvbXBvbmVudC5ncm91cC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICBpZiAoZ3JvdXBLZXkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICBcIiR7Y29tcG9uZW50TmFtZX1cIiBiZWxvbmdzIHRvIG1lcmdlZCBncm91cCBcIiR7Z3JvdXBLZXl9XCIg4oCUIGNvbXBpbGluZyBlbnRpcmUgZ3JvdXAuXFxuYCk7XG4gICAgICAgICAgICBhd2FpdCBjb21waWxlR3JvdXBCeUtleShncm91cEtleSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFvcHRzLmZvcmNlKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoZGF0YUN0eCwgb3V0cHV0LCBjb21wb25lbnROYW1lKTtcbiAgICAgICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBDb21wb25lbnQgaGFzIGJyZWFraW5nIGNoYW5nZXMuIFVzZSAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5LlxcbmApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjb21waWxlKHtcbiAgICAgICAgICBhcGlVcmwsXG4gICAgICAgICAgb3V0cHV0RGlyOiBvdXRwdXQsXG4gICAgICAgICAgY29tcG9uZW50TmFtZSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGxvY2FsQXBpUm9vdCxcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dCwgY29tcG9uZW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIPCfk50gTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgICAgfSBjYXRjaCAoY29tcG9uZW50RXJyb3IpIHtcbiAgICAgICAgLy8gTm8gY29tcG9uZW50IHdpdGggdGhpcyBuYW1lIOKAkyB0cnkgYXMgZ3JvdXBcbiAgICAgICAgY29uc29sZS5sb2coYCAgIE5vIGNvbXBvbmVudCBcIiR7Y29tcG9uZW50TmFtZX1cIiBmb3VuZCwgY2hlY2tpbmcgZ3JvdXBzLi4uXFxuYCk7XG4gICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCBjdHhGZXRjaEFsbENvbXBvbmVudHNMaXN0KGRhdGFDdHgpO1xuICAgICAgICBjb25zdCBuYW1lTG93ZXIgPSBjb21wb25lbnROYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChjKSA9PiBjLmdyb3VwICYmIGMuZ3JvdXAudG9Mb3dlckNhc2UoKSA9PT0gbmFtZUxvd2VyLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnQgb3IgZ3JvdXAgZm91bmQgZm9yIFwiJHtjb21wb25lbnROYW1lfVwiLmApO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgICAgICBDb21wb25lbnQgZmV0Y2g6ICR7Y29tcG9uZW50RXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGNvbXBvbmVudEVycm9yLm1lc3NhZ2UgOiBjb21wb25lbnRFcnJvcn1gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgICAgIG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQobmFtZUxvd2VyKSA/PyBncm91cE1hdGNoZXNbMF0uZ3JvdXA7XG4gICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IFBsZWFzZSBzcGVjaWZ5IGEgY29tcG9uZW50IG5hbWUsIGdyb3VwIG5hbWUsIHVzZSAtLWFsbCBmbGFnLCAtLXRoZW1lIGZsYWcsIG9yIC0tdmFsaWRhdGUtYWxsIGZsYWcnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdcXG5Vc2FnZTonKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Y29tcG9uZW50LW5hbWU+ICAgQ29tcGlsZSBvbmUgY29tcG9uZW50IChlLmcuIGhlcm8tYXJ0aWNsZSknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSA8Z3JvdXAtbmFtZT4gICAgICBPciBjb21waWxlIGEgbWVyZ2VkIGdyb3VwIChlLmcuIGhlcm8pJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXRoZW1lJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS12YWxpZGF0ZSBoZXJvLWFydGljbGUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tYWxsIC0tZm9yY2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSBoZXJvIC0tYXBpLXVybCBodHRwOi8vbG9jYWxob3N0OjQwMDAgLS1vdXRwdXQgLi9ibG9ja3MnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH0pO1xuXG5wcm9ncmFtLnBhcnNlKCk7XG5cbmV4cG9ydCB7IGNvbXBpbGUsIGdlbmVyYXRlQmxvY2ssIGh0dHBGZXRjaENvbXBvbmVudCBhcyBmZXRjaENvbXBvbmVudCB9O1xuIl19