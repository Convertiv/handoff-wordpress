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
        compiler: fileConfig.compiler,
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
    const styleMode = resolvedConfig.compiler?.styleMode ?? 'legacy';
    const styleOptions = { styleMode };
    return {
        blockJson: (0, generators_1.generateBlockJson)(component, hasScreenshot, apiUrl, componentDynamicArrays, innerBlocksField),
        indexJs: (0, generators_1.generateIndexJs)(component, componentDynamicArrays, innerBlocksField, deprecationsCode, hasScreenshot, resolvedConfig.editor),
        renderPhp: (0, generators_1.generateRenderPhp)(component, componentDynamicArrays, innerBlocksField),
        editorScss: (0, generators_1.generateEditorScss)(component, { editorConfig: resolvedConfig.editor, ...styleOptions }),
        styleScss: (0, generators_1.generateStyleScss)(component, styleOptions),
        readme: (0, generators_1.generateReadme)(component),
        migrationSchema: (0, generators_1.generateMigrationSchema)(component),
        schemaChangelog: (0, generators_1.generateSchemaChangelog)(component.id, historyEntry),
        screenshotUrl
    };
};
exports.generateBlock = generateBlock;
/**
 * Copy per-component view.js / view.css from Handoff API output.
 */
const copyComponentViewAssets = (blockDir, componentId, ctx) => {
    if (!ctx.localApiRoot) {
        return { hasViewScript: false, hasViewStyle: false };
    }
    let hasViewScript = false;
    let hasViewStyle = false;
    const jsSrc = path.join(ctx.localApiRoot, 'component', `${componentId}.js`);
    if (fs.existsSync(jsSrc)) {
        fs.copyFileSync(jsSrc, path.join(blockDir, 'view.js'));
        hasViewScript = true;
    }
    const cssSrc = path.join(ctx.localApiRoot, 'component', `${componentId}.css`);
    if (fs.existsSync(cssSrc)) {
        fs.copyFileSync(cssSrc, path.join(blockDir, 'view.css'));
        hasViewStyle = true;
    }
    return { hasViewScript, hasViewStyle };
};
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
    const viewAssets = copyComponentViewAssets(blockDir, componentId, ctx);
    let blockJsonContent = block.blockJson;
    if (viewAssets.hasViewScript || viewAssets.hasViewStyle) {
        const blockJsonObj = JSON.parse(block.blockJson);
        if (viewAssets.hasViewScript) {
            blockJsonObj.viewScript = 'file:./view.js';
        }
        if (viewAssets.hasViewStyle) {
            blockJsonObj.viewStyle = 'file:./view.css';
        }
        blockJsonContent = JSON.stringify(blockJsonObj, null, 2);
    }
    // Format all code files with Prettier
    const formattedBlockJson = await formatCode(blockJsonContent, 'json');
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
    if (viewAssets.hasViewScript) {
        console.log(`   📄 view.js`);
    }
    if (viewAssets.hasViewStyle) {
        console.log(`   📄 view.css`);
    }
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
        if (config.compiler?.styleMode !== 'tailwind') {
            console.log(`🔍 Validating template variables...`);
            const templateValidation = (0, validators_1.validateTemplateVariables)(component);
            console.log((0, validators_1.formatTemplateValidationResult)(templateValidation));
            console.log('');
            if (!templateValidation.isValid) {
                console.error(`\n❌ Template validation failed! Fix the undefined variables before compiling.\n`);
                process.exit(1);
            }
        }
        // Generate block files (with deprecation support from schema history)
        console.log(`⚙️  Generating Gutenberg block...`);
        const schemaHistory = (0, validators_1.loadManifest)(options.outputDir);
        const block = generateBlock(component, options.apiUrl, config, schemaHistory);
        // Write files (with Prettier formatting)
        await writeBlockFiles(options.outputDir, component.id, block, dataCtx);
        const contentRoot = path.resolve(options.outputDir, '..');
        await syncBundleAssets(dataCtx, contentRoot, config);
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
const syncBundleAssets = async (ctx, contentRoot, resolvedConfig) => {
    const compiler = resolvedConfig?.compiler;
    if (compiler?.styleMode === 'tailwind' || compiler?.syncDesignSystemAssets === false) {
        console.log('   ⏭️  Skipping main.css/main.js sync (tailwind / syncDesignSystemAssets=false)');
        return;
    }
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
        await syncBundleAssets(ctx, contentRoot, config);
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
                if (config.compiler?.styleMode !== 'tailwind') {
                    const templateValidation = (0, validators_1.validateTemplateVariables)(component);
                    if (!templateValidation.isValid) {
                        console.log((0, validators_1.formatTemplateValidationResult)(templateValidation));
                        console.error(`   ⚠️  Skipping ${componentId} due to template variable errors`);
                        failed++;
                        continue;
                    }
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
            await syncBundleAssets(ctx, path.resolve(outputDir, '..'), config);
        }
        else if (config.compiler?.styleMode !== 'tailwind' && config.compiler?.syncDesignSystemAssets !== false) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgseUNBQW9DO0FBQ3BDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsNkNBQStCO0FBQy9CLDJDQUE2QjtBQUM3Qix3REFBZ0M7QUFDaEMsbURBQXFDO0FBQ3JDLGlEQUF5QztBQUV6QyxtQ0FBcVQ7QUFDclQseURBQWdFO0FBNkJoRTs7R0FFRztBQUNILE1BQU0sY0FBYyxHQUFtQjtJQUNyQyxNQUFNLEVBQUUsdUJBQXVCO0lBQy9CLE1BQU0sRUFBRSxVQUFVO0lBQ2xCLFFBQVEsRUFBRSxTQUFTO0lBQ25CLFFBQVEsRUFBRSxTQUFTO0lBQ25CLFFBQVEsRUFBRSxTQUFTO0lBQ25CLE1BQU0sRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUU7SUFDMUIsTUFBTSxFQUFFLEVBQUU7Q0FDWCxDQUFDO0FBRUY7OztHQUdHO0FBQ0gsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLGFBQWlELEVBQWdCLEVBQUU7SUFDL0YsTUFBTSxZQUFZLEdBQWlCLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ3RELE1BQU0sV0FBVyxHQUEwQyxFQUFFLENBQUM7SUFFOUQsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUMxRCxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU87WUFBRSxTQUFTO1FBQzlCLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO1lBQUUsU0FBUztRQUM5QixNQUFNLFdBQVcsR0FB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LyoqXG4gKiBHdXRlbmJlcmcgQ29tcGlsZXJcbiAqIFxuICogVHJhbnNwaWxlcyBIYW5kb2ZmIGNvbXBvbmVudHMgdG8gV29yZFByZXNzIEd1dGVuYmVyZyBibG9ja3MuXG4gKiBcbiAqIFVzYWdlOlxuICogICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgPGNvbXBvbmVudC1uYW1lPiBbb3B0aW9uc11cbiAqICAgXG4gKiBPcHRpb25zOlxuICogICAtLWFwaS11cmwgPHVybD4gICAgSGFuZG9mZiBBUEkgYmFzZSBVUkwgKGRlZmF1bHQ6IGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMClcbiAqICAgLS1vdXRwdXQgPGRpcj4gICAgIE91dHB1dCBkaXJlY3RvcnkgZm9yIGJsb2NrcyAoZGVmYXVsdDogLi9ibG9ja3MpXG4gKiAgIC0tYWxsICAgICAgICAgICAgICBDb21waWxlIGFsbCBhdmFpbGFibGUgY29tcG9uZW50c1xuICogICAtLXRoZW1lICAgICAgICAgICAgQ29tcGlsZSBoZWFkZXIvZm9vdGVyIHRvIHRoZW1lIHRlbXBsYXRlc1xuICogICAtLXZhbGlkYXRlICAgICAgICAgVmFsaWRhdGUgYSBjb21wb25lbnQgZm9yIGJyZWFraW5nIGNoYW5nZXNcbiAqICAgLS12YWxpZGF0ZS1hbGwgICAgIFZhbGlkYXRlIGFsbCBjb21wb25lbnRzIGZvciBicmVha2luZyBjaGFuZ2VzXG4gKiAgIC0tc291cmNlIDxkaXI+ICAgICBSZWFkIEhhbmRvZmYgQVBJIEpTT04gZnJvbSBkaXNrIChlLmcuIC4vc3JjL2hhbmRvZmYvcHVibGljL2FwaSlcbiAqICAgLS13YXRjaCAgICAgICAgICAgIFdhdGNoIC0tc291cmNlIGZvciBjaGFuZ2VzIChyZXF1aXJlcyAtLXNvdXJjZSlcbiAqIFxuICogQ29uZmlndXJhdGlvbjpcbiAqICAgQ3JlYXRlIGEgaGFuZG9mZi13cC5jb25maWcuanNvbiBmaWxlIGluIHlvdXIgcHJvamVjdCByb290IHRvIHNldCBkZWZhdWx0czpcbiAqICAge1xuICogICAgIFwiYXBpVXJsXCI6IFwiaHR0cHM6Ly9kZW1vLmhhbmRvZmYuY29tXCIsXG4gKiAgICAgXCJvdXRwdXRcIjogXCIuL3BhdGgvdG8vYmxvY2tzXCIsXG4gKiAgICAgXCJ0aGVtZURpclwiOiBcIi4vcGF0aC90by90aGVtZVwiXG4gKiAgIH1cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IGNob2tpZGFyIGZyb20gJ2Nob2tpZGFyJztcbmltcG9ydCAqIGFzIHByZXR0aWVyIGZyb20gJ3ByZXR0aWVyJztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgQ29tcGlsZXJPcHRpb25zLCBHZW5lcmF0ZWRCbG9jaywgSGFuZG9mZldwQ29uZmlnLCBIYW5kb2ZmRWRpdG9yQ29uZmlnLCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRDb25maWcsIEltcG9ydENvbmZpZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnLCBGaWVsZFByZWZlcmVuY2VzLCBpc0R5bmFtaWNBcnJheUNvbmZpZyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgc2NvcGVEZXNpZ25TeXN0ZW1Gb3JFZGl0b3IgfSBmcm9tICcuL3Njb3BlLWVkaXRvci1jc3MnO1xuXG4vKipcbiAqIEF1dGggY3JlZGVudGlhbHMgZm9yIEhUVFAgcmVxdWVzdHNcbiAqL1xuaW50ZXJmYWNlIEF1dGhDcmVkZW50aWFscyB7XG4gIHVzZXJuYW1lPzogc3RyaW5nO1xuICBwYXNzd29yZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXF1aXJlZCBjb25maWcgd2l0aCBkZWZhdWx0cyBhcHBsaWVkXG4gKi9cbmludGVyZmFjZSBSZXNvbHZlZENvbmZpZyB7XG4gIGFwaVVybDogc3RyaW5nO1xuICBvdXRwdXQ6IHN0cmluZztcbiAgdGhlbWVEaXI6IHN0cmluZztcbiAgdXNlcm5hbWU/OiBzdHJpbmc7XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBpbXBvcnQ6IEltcG9ydENvbmZpZztcbiAgZ3JvdXBzOiBSZWNvcmQ8c3RyaW5nLCAnbWVyZ2VkJyB8ICdpbmRpdmlkdWFsJz47XG4gIHNjaGVtYU1pZ3JhdGlvbnM/OiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCB7XG4gICAgcmVuYW1lcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgdHJhbnNmb3Jtcz86IFJlY29yZDxzdHJpbmcsIHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nOyBydWxlOiBzdHJpbmcgfT47XG4gIH0+PjtcbiAgZWRpdG9yPzogSGFuZG9mZkVkaXRvckNvbmZpZztcbiAgY29tcGlsZXI/OiBIYW5kb2ZmV3BDb25maWdbJ2NvbXBpbGVyJ107XG59XG5cbi8qKlxuICogRGVmYXVsdCBjb25maWd1cmF0aW9uIHZhbHVlc1xuICovXG5jb25zdCBERUZBVUxUX0NPTkZJRzogUmVzb2x2ZWRDb25maWcgPSB7XG4gIGFwaVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NDAwMCcsXG4gIG91dHB1dDogJy4vYmxvY2tzJyxcbiAgdGhlbWVEaXI6ICcuL3RoZW1lJyxcbiAgdXNlcm5hbWU6IHVuZGVmaW5lZCxcbiAgcGFzc3dvcmQ6IHVuZGVmaW5lZCxcbiAgaW1wb3J0OiB7IGVsZW1lbnQ6IGZhbHNlIH0sXG4gIGdyb3Vwczoge30sXG59O1xuXG4vKipcbiAqIE1pZ3JhdGUgbGVnYWN5IGBkeW5hbWljQXJyYXlzYCBjb25maWcgdG8gdGhlIG5ldyBgaW1wb3J0YCBzdHJ1Y3R1cmUuXG4gKiBHcm91cHMgXCJjb21wb25lbnRJZC5maWVsZE5hbWVcIiBlbnRyaWVzIHVuZGVyIGltcG9ydC5ibG9ja1tjb21wb25lbnRJZF1bZmllbGROYW1lXS5cbiAqL1xuY29uc3QgbWlncmF0ZUR5bmFtaWNBcnJheXMgPSAoZHluYW1pY0FycmF5czogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPik6IEltcG9ydENvbmZpZyA9PiB7XG4gIGNvbnN0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnID0geyBlbGVtZW50OiBmYWxzZSB9O1xuICBjb25zdCBibG9ja0NvbmZpZzogUmVjb3JkPHN0cmluZywgQ29tcG9uZW50SW1wb3J0Q29uZmlnPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICghY29uZmlnLmVuYWJsZWQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGRvdEluZGV4ID0ga2V5LmluZGV4T2YoJy4nKTtcbiAgICBpZiAoZG90SW5kZXggPT09IC0xKSBjb250aW51ZTtcbiAgICBjb25zdCBjb21wb25lbnRJZCA9IGtleS5zdWJzdHJpbmcoMCwgZG90SW5kZXgpO1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGtleS5zdWJzdHJpbmcoZG90SW5kZXggKyAxKTtcblxuICAgIGlmICghYmxvY2tDb25maWdbY29tcG9uZW50SWRdIHx8IHR5cGVvZiBibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gPT09ICdib29sZWFuJykge1xuICAgICAgYmxvY2tDb25maWdbY29tcG9uZW50SWRdID0ge307XG4gICAgfVxuICAgIChibG9ja0NvbmZpZ1tjb21wb25lbnRJZF0gYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnPilbZmllbGROYW1lXSA9IGNvbmZpZztcbiAgfVxuXG4gIGlmIChPYmplY3Qua2V5cyhibG9ja0NvbmZpZykubGVuZ3RoID4gMCkge1xuICAgIGltcG9ydENvbmZpZy5ibG9jayA9IGJsb2NrQ29uZmlnO1xuICB9XG5cbiAgcmV0dXJuIGltcG9ydENvbmZpZztcbn07XG5cbi8qKlxuICogTG9hZCBjb25maWd1cmF0aW9uIGZyb20gaGFuZG9mZi13cC5jb25maWcuanNvbiBpZiBpdCBleGlzdHNcbiAqL1xuY29uc3QgbG9hZENvbmZpZyA9ICgpOiBIYW5kb2ZmV3BDb25maWcgPT4ge1xuICBjb25zdCBjb25maWdQYXRoID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdoYW5kb2ZmLXdwLmNvbmZpZy5qc29uJyk7XG4gIFxuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpO1xuICAgICAgY29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjb25maWdDb250ZW50KSBhcyBIYW5kb2ZmV3BDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ThCBMb2FkZWQgY29uZmlnIGZyb20gJHtjb25maWdQYXRofWApO1xuICAgICAgcmV0dXJuIGNvbmZpZztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZhaWxlZCB0byBwYXJzZSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4ge307XG59O1xuXG4vKipcbiAqIE1lcmdlIGNvbmZpZ3VyYXRpb24gc291cmNlcyB3aXRoIHByaW9yaXR5OiBDTEkgPiBjb25maWcgZmlsZSA+IGRlZmF1bHRzXG4gKi9cbmNvbnN0IGdldENvbmZpZyA9ICgpOiBSZXNvbHZlZENvbmZpZyA9PiB7XG4gIGNvbnN0IGZpbGVDb25maWcgPSBsb2FkQ29uZmlnKCk7XG5cbiAgbGV0IGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnO1xuICBpZiAoZmlsZUNvbmZpZy5pbXBvcnQpIHtcbiAgICBpbXBvcnRDb25maWcgPSBmaWxlQ29uZmlnLmltcG9ydDtcbiAgfSBlbHNlIGlmIChmaWxlQ29uZmlnLmR5bmFtaWNBcnJheXMpIHtcbiAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgXCJkeW5hbWljQXJyYXlzXCIgY29uZmlnIGlzIGRlcHJlY2F0ZWQuIE1pZ3JhdGUgdG8gXCJpbXBvcnRcIiDigJQgc2VlIFNQRUNJRklDQVRJT04ubWQuYCk7XG4gICAgaW1wb3J0Q29uZmlnID0gbWlncmF0ZUR5bmFtaWNBcnJheXMoZmlsZUNvbmZpZy5keW5hbWljQXJyYXlzKTtcbiAgfSBlbHNlIHtcbiAgICBpbXBvcnRDb25maWcgPSBERUZBVUxUX0NPTkZJRy5pbXBvcnQ7XG4gIH1cbiAgXG4gIHJldHVybiB7XG4gICAgYXBpVXJsOiBmaWxlQ29uZmlnLmFwaVVybCA/PyBERUZBVUxUX0NPTkZJRy5hcGlVcmwsXG4gICAgb3V0cHV0OiBmaWxlQ29uZmlnLm91dHB1dCA/PyBERUZBVUxUX0NPTkZJRy5vdXRwdXQsXG4gICAgdGhlbWVEaXI6IGZpbGVDb25maWcudGhlbWVEaXIgPz8gREVGQVVMVF9DT05GSUcudGhlbWVEaXIsXG4gICAgdXNlcm5hbWU6IGZpbGVDb25maWcudXNlcm5hbWUgPz8gREVGQVVMVF9DT05GSUcudXNlcm5hbWUsXG4gICAgcGFzc3dvcmQ6IGZpbGVDb25maWcucGFzc3dvcmQgPz8gREVGQVVMVF9DT05GSUcucGFzc3dvcmQsXG4gICAgaW1wb3J0OiBpbXBvcnRDb25maWcsXG4gICAgZ3JvdXBzOiBmaWxlQ29uZmlnLmdyb3VwcyA/PyBERUZBVUxUX0NPTkZJRy5ncm91cHMsXG4gICAgc2NoZW1hTWlncmF0aW9uczogZmlsZUNvbmZpZy5zY2hlbWFNaWdyYXRpb25zLFxuICAgIGVkaXRvcjogZmlsZUNvbmZpZy5lZGl0b3IsXG4gICAgY29tcGlsZXI6IGZpbGVDb25maWcuY29tcGlsZXIsXG4gIH07XG59O1xuXG5cbi8qKlxuICogQnVpbGQgSFRUUCByZXF1ZXN0IG9wdGlvbnMgd2l0aCBvcHRpb25hbCBiYXNpYyBhdXRoXG4gKi9cbmNvbnN0IGJ1aWxkUmVxdWVzdE9wdGlvbnMgPSAodXJsOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBodHRwLlJlcXVlc3RPcHRpb25zIHwgaHR0cHMuUmVxdWVzdE9wdGlvbnMgPT4ge1xuICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKHVybCk7XG4gIGNvbnN0IG9wdGlvbnM6IGh0dHAuUmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICBwb3J0OiBwYXJzZWRVcmwucG9ydCB8fCAocGFyc2VkVXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/IDQ0MyA6IDgwKSxcbiAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgaGVhZGVyczoge30sXG4gIH07XG4gIFxuICBpZiAoYXV0aD8udXNlcm5hbWUgJiYgYXV0aD8ucGFzc3dvcmQpIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IEJ1ZmZlci5mcm9tKGAke2F1dGgudXNlcm5hbWV9OiR7YXV0aC5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0ge1xuICAgICAgLi4ub3B0aW9ucy5oZWFkZXJzLFxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmFzaWMgJHtjcmVkZW50aWFsc31gLFxuICAgIH07XG4gIH1cbiAgXG4gIHJldHVybiBvcHRpb25zO1xufTtcblxuLy8gTG9hZCBjb25maWcgYXQgc3RhcnR1cFxuY29uc3QgY29uZmlnID0gZ2V0Q29uZmlnKCk7XG5pbXBvcnQge1xuICBnZW5lcmF0ZUJsb2NrSnNvbixcbiAgZ2VuZXJhdGVJbmRleEpzLFxuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgZ2VuZXJhdGVFZGl0b3JTY3NzLFxuICBnZW5lcmF0ZVN0eWxlU2NzcyxcbiAgZ2VuZXJhdGVSZWFkbWUsXG4gIHRvQmxvY2tOYW1lLFxuICBnZW5lcmF0ZUhlYWRlclBocCxcbiAgZ2VuZXJhdGVGb290ZXJQaHAsXG4gIGdlbmVyYXRlVGVtcGxhdGVQYXJ0UGhwLFxuICBnZW5lcmF0ZUNhdGVnb3JpZXNQaHAsXG4gIGdlbmVyYXRlU2hhcmVkQ29tcG9uZW50cyxcbiAgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsXG4gIGdlbmVyYXRlTWVyZ2VkQmxvY2ssXG4gIGdlbmVyYXRlRGVwcmVjYXRpb25zLFxuICBnZW5lcmF0ZVNjaGVtYUNoYW5nZWxvZyxcbn0gZnJvbSAnLi9nZW5lcmF0b3JzJztcbmltcG9ydCB0eXBlIHsgVmFyaWFudEluZm8gfSBmcm9tICcuL2dlbmVyYXRvcnMnO1xuaW1wb3J0IHtcbiAgZ2V0QWN0aXZlQmxvY2tTbHVncyxcbiAgcmVjb25jaWxlTG9jYWxCbG9ja3MsXG59IGZyb20gJy4vYmxvY2stbGlmZWN5Y2xlJztcbmltcG9ydCB7XG4gIGxvYWRNYW5pZmVzdCxcbiAgc2F2ZU1hbmlmZXN0LFxuICB2YWxpZGF0ZUNvbXBvbmVudCxcbiAgdXBkYXRlTWFuaWZlc3QsXG4gIGdldENvbXBvbmVudEhpc3RvcnksXG4gIGV4dHJhY3RQcm9wZXJ0aWVzLFxuICBmb3JtYXRWYWxpZGF0aW9uUmVzdWx0LFxuICBWYWxpZGF0aW9uUmVzdWx0LFxuICB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzLFxuICBmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHRcbn0gZnJvbSAnLi92YWxpZGF0b3JzJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hSGlzdG9yeSB9IGZyb20gJy4vdmFsaWRhdG9ycyc7XG5cbi8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUHJldHRpZXIgKHVzaW5nIHJlcXVpcmUgZm9yIGNvbXBhdGliaWxpdHkpXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuY29uc3QgcGhwUGx1Z2luID0gcmVxdWlyZSgnQHByZXR0aWVyL3BsdWdpbi1waHAnKTtcblxuLyoqXG4gKiBGb3JtYXQgY29kZSB3aXRoIFByZXR0aWVyXG4gKi9cbmNvbnN0IGZvcm1hdENvZGUgPSBhc3luYyAoY29kZTogc3RyaW5nLCBwYXJzZXI6ICdiYWJlbCcgfCAnanNvbicgfCAnc2NzcycgfCAncGhwJyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3B0aW9uczogcHJldHRpZXIuT3B0aW9ucyA9IHtcbiAgICAgIHBhcnNlcixcbiAgICAgIHNpbmdsZVF1b3RlOiB0cnVlLFxuICAgICAgdGFiV2lkdGg6IDIsXG4gICAgICBwcmludFdpZHRoOiAxMDAsXG4gICAgICB0cmFpbGluZ0NvbW1hOiAnZXM1JyxcbiAgICB9O1xuICAgIFxuICAgIC8vIExvYWQgUEhQIHBsdWdpbiBmb3IgUEhQIGZpbGVzXG4gICAgaWYgKHBhcnNlciA9PT0gJ3BocCcpIHtcbiAgICAgIG9wdGlvbnMucGx1Z2lucyA9IFtwaHBQbHVnaW5dO1xuICAgICAgLy8gUEhQLXNwZWNpZmljIG9wdGlvbnMgLSBjYXN0IHRvIGFueSBmb3IgcGx1Z2luLXNwZWNpZmljIG9wdGlvbnNcbiAgICAgIChvcHRpb25zIGFzIGFueSkucGhwVmVyc2lvbiA9ICc4LjAnO1xuICAgICAgKG9wdGlvbnMgYXMgYW55KS5icmFjZVN0eWxlID0gJzF0YnMnO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYXdhaXQgcHJldHRpZXIuZm9ybWF0KGNvZGUsIG9wdGlvbnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIGZvcm1hdHRpbmcgZmFpbHMsIHJldHVybiBvcmlnaW5hbCBjb2RlXG4gICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIFByZXR0aWVyIGZvcm1hdHRpbmcgZmFpbGVkIGZvciAke3BhcnNlcn0sIHVzaW5nIHVuZm9ybWF0dGVkIGNvZGVgKTtcbiAgICByZXR1cm4gY29kZTtcbiAgfVxufTtcblxuY29uc3QgcHJvZ3JhbSA9IG5ldyBDb21tYW5kKCk7XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgY29weSBhIGRpcmVjdG9yeSB0cmVlLCBjcmVhdGluZyB0YXJnZXQgZGlycyBhcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGNvcHlEaXJSZWN1cnNpdmUgPSAoc3JjOiBzdHJpbmcsIGRlc3Q6IHN0cmluZyk6IHZvaWQgPT4ge1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZGVzdCkpIHtcbiAgICBmcy5ta2RpclN5bmMoZGVzdCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBmcy5yZWFkZGlyU3luYyhzcmMpKSB7XG4gICAgY29uc3Qgc3JjUGF0aCA9IHBhdGguam9pbihzcmMsIGVudHJ5KTtcbiAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihkZXN0LCBlbnRyeSk7XG4gICAgaWYgKGZzLnN0YXRTeW5jKHNyY1BhdGgpLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHBhY2thZ2UuanNvbiBpbiB0aGUgY29udGVudCBkaXJlY3RvcnkgYW5kIHJ1biBucG0gaW5zdGFsbFxuICogc28gdGhhdCBibG9ja3MgYW5kIHNoYXJlZCBjb21wb25lbnRzIGNhbiByZXNvbHZlIHRoZWlyIGltcG9ydHMuXG4gKi9cbmNvbnN0IGVuc3VyZUNvbnRlbnREZXBlbmRlbmNpZXMgPSAoY29udGVudFJvb3Q6IHN0cmluZyk6IHZvaWQgPT4ge1xuICBjb25zdCBwa2dQYXRoID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAncGFja2FnZS5qc29uJyk7XG5cbiAgY29uc3QgcGtnID0ge1xuICAgIG5hbWU6ICdoYW5kb2ZmLWJsb2Nrcy1jb250ZW50JyxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIHByaXZhdGU6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBdXRvLWdlbmVyYXRlZCBieSBIYW5kb2ZmIGNvbXBpbGVyIOKAlCBibG9jayBidWlsZCBkZXBlbmRlbmNpZXMuJyxcbiAgICBkZXBlbmRlbmNpZXM6IHtcbiAgICAgICdAMTB1cC9ibG9jay1jb21wb25lbnRzJzogJ14xLjIyLjEnLFxuICAgIH0sXG4gICAgZGV2RGVwZW5kZW5jaWVzOiB7XG4gICAgICAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9ibG9ja3MnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9jb21wb25lbnRzJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvY29yZS1kYXRhJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvZGF0YSc6ICcqJyxcbiAgICAgICdAd29yZHByZXNzL2VsZW1lbnQnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9pMThuJzogJyonLFxuICAgICAgJ0B3b3JkcHJlc3MvaWNvbnMnOiAnKicsXG4gICAgICAnQHdvcmRwcmVzcy9zY3JpcHRzJzogJ14yNy4wLjAnLFxuICAgICAgJ2NvcHktd2VicGFjay1wbHVnaW4nOiAnXjExLjAuMCcsXG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBkZXNpcmVkID0gSlNPTi5zdHJpbmdpZnkocGtnLCBudWxsLCAyKSArICdcXG4nO1xuXG4gIGxldCBuZWVkc0luc3RhbGwgPSB0cnVlO1xuICBpZiAoZnMuZXhpc3RzU3luYyhwa2dQYXRoKSkge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gZnMucmVhZEZpbGVTeW5jKHBrZ1BhdGgsICd1dGY4Jyk7XG4gICAgaWYgKGV4aXN0aW5nID09PSBkZXNpcmVkKSB7XG4gICAgICBuZWVkc0luc3RhbGwgPSAhZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4oY29udGVudFJvb3QsICdub2RlX21vZHVsZXMnKSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG5lZWRzSW5zdGFsbCkge1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OmIEluc3RhbGxpbmcgYmxvY2sgYnVpbGQgZGVwZW5kZW5jaWVzLi4uYCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhwa2dQYXRoLCBkZXNpcmVkKTtcbiAgICB0cnkge1xuICAgICAgZXhlY1N5bmMoJ25wbSBpbnN0YWxsIC0taWdub3JlLXNjcmlwdHMnLCB7XG4gICAgICAgIGN3ZDogY29udGVudFJvb3QsXG4gICAgICAgIHN0ZGlvOiAnaW5oZXJpdCcsXG4gICAgICB9KTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRGVwZW5kZW5jaWVzIGluc3RhbGxlZCBpbiAke2NvbnRlbnRSb290fWApO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIG5wbSBpbnN0YWxsIGZhaWxlZCDigJQgeW91IG1heSBuZWVkIHRvIHJ1biBpdCBtYW51YWxseSBpbiAke2NvbnRlbnRSb290fWApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+TpiBCbG9jayBidWlsZCBkZXBlbmRlbmNpZXMgYWxyZWFkeSB1cCB0byBkYXRlYCk7XG4gIH1cbn07XG5cbi8qKlxuICogRG93bmxvYWQgYSBmaWxlIGZyb20gYSBVUkwgYW5kIHNhdmUgaXQgdG8gZGlzayAoSFRUUCBvbmx5KVxuICovXG5jb25zdCBodHRwRG93bmxvYWRGaWxlID0gYXN5bmMgKHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgLy8gSGFuZGxlIHJlZGlyZWN0c1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzLnN0YXR1c0NvZGUgPT09IDMwMikge1xuICAgICAgICBjb25zdCByZWRpcmVjdFVybCA9IHJlcy5oZWFkZXJzLmxvY2F0aW9uO1xuICAgICAgICBpZiAocmVkaXJlY3RVcmwpIHtcbiAgICAgICAgICBodHRwRG93bmxvYWRGaWxlKHJlZGlyZWN0VXJsLCBkZXN0UGF0aCwgYXV0aCkudGhlbihyZXNvbHZlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBkb3dubG9hZCBzY3JlZW5zaG90OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCk7XG4gICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IGZpbGVTdHJlYW0gPSBmcy5jcmVhdGVXcml0ZVN0cmVhbShkZXN0UGF0aCk7XG4gICAgICByZXMucGlwZShmaWxlU3RyZWFtKTtcbiAgICAgIFxuICAgICAgZmlsZVN0cmVhbS5vbignZmluaXNoJywgKCkgPT4ge1xuICAgICAgICBmaWxlU3RyZWFtLmNsb3NlKCk7XG4gICAgICAgIHJlc29sdmUodHJ1ZSk7XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgZmlsZVN0cmVhbS5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICAgIGZzLnVubGluayhkZXN0UGF0aCwgKCkgPT4ge30pOyAvLyBDbGVhbiB1cCBwYXJ0aWFsIGZpbGVcbiAgICAgICAgY29uc29sZS53YXJuKGAgICDimqDvuI8gIEZhaWxlZCB0byBzYXZlIHNjcmVlbnNob3Q6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBGYWlsZWQgdG8gZG93bmxvYWQgc2NyZWVuc2hvdDogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEZldGNoIGNvbXBvbmVudCBkYXRhIGZyb20gSGFuZG9mZiBBUEkgKEhUVFAgb25seSlcbiAqL1xuY29uc3QgaHR0cEZldGNoQ29tcG9uZW50ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBjb21wb25lbnROYW1lOiBzdHJpbmcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnQ+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50LyR7Y29tcG9uZW50TmFtZX0uanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgY29tcG9uZW50IEpTT046ICR7ZX1gKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pLm9uKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50OiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbGwgYmxvY2sgZmlsZXMgZnJvbSBhIGNvbXBvbmVudFxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gYXBpVXJsIC0gVGhlIGJhc2UgQVBJIFVSTCBmb3IgZmV0Y2hpbmcgc2NyZWVuc2hvdHNcbiAqIEBwYXJhbSByZXNvbHZlZENvbmZpZyAtIFRoZSByZXNvbHZlZCBjb25maWd1cmF0aW9uIGluY2x1ZGluZyBkeW5hbWljIGFycmF5IHNldHRpbmdzXG4gKi9cbmNvbnN0IGdlbmVyYXRlQmxvY2sgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCBhcGlVcmw6IHN0cmluZywgcmVzb2x2ZWRDb25maWc6IFJlc29sdmVkQ29uZmlnLCBzY2hlbWFIaXN0b3J5PzogU2NoZW1hSGlzdG9yeSk6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgaGFzU2NyZWVuc2hvdCA9ICEhY29tcG9uZW50LmltYWdlO1xuICBcbiAgLy8gQ29uc3RydWN0IGZ1bGwgc2NyZWVuc2hvdCBVUkwgaWYgaW1hZ2UgcGF0aCBpcyBhdmFpbGFibGVcbiAgbGV0IHNjcmVlbnNob3RVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgaWYgKGNvbXBvbmVudC5pbWFnZSkge1xuICAgIC8vIEhhbmRsZSBib3RoIGFic29sdXRlIFVSTHMgYW5kIHJlbGF0aXZlIHBhdGhzXG4gICAgaWYgKGNvbXBvbmVudC5pbWFnZS5zdGFydHNXaXRoKCdodHRwOi8vJykgfHwgY29tcG9uZW50LmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBjb21wb25lbnQuaW1hZ2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlbGF0aXZlIHBhdGggLSBwcmVwZW5kIEFQSSBVUkxcbiAgICAgIHNjcmVlbnNob3RVcmwgPSBgJHthcGlVcmx9JHtjb21wb25lbnQuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wb25lbnQuaW1hZ2V9YDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciB0aGlzIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnXG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KVxuICB9O1xuICBcbiAgLy8gQXV0by1kZXRlY3QgcGFnaW5hdGlvbiBmb3IgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZW50cmllcyBvbmx5XG4gIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREeW5hbWljQXJyYXlzKSkge1xuICAgIGlmICgnYXJyYXlUeXBlJyBpbiBkeW5Db25maWcpIGNvbnRpbnVlOyAvLyBTa2lwIHNwZWNpYWxpc2VkIGFycmF5IHR5cGVzXG4gICAgY29uc3QgcHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHByb3A/LnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uPy50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGNvbnN0IHBhZ2luYXRpb25GaWVsZFJlZ2V4ID0gbmV3IFJlZ0V4cChcbiAgICAgICAgYFxcXFx7XFxcXHtcXFxccyojZmllbGRcXFxccytbXCInXSR7ZmllbGROYW1lfVxcXFwucGFnaW5hdGlvbltcIiddYFxuICAgICAgKTtcbiAgICAgIGlmIChwYWdpbmF0aW9uRmllbGRSZWdleC50ZXN0KGNvbXBvbmVudC5jb2RlKSkge1xuICAgICAgICAoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbiA9IHsgcHJvcGVydHlOYW1lOiAncGFnaW5hdGlvbicgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggcmljaHRleHQgZmllbGQgKGlmIGFueSkgdXNlcyBJbm5lckJsb2Nrc1xuICBjb25zdCBmaWVsZFByZWZzID0gZXh0cmFjdEZpZWxkUHJlZmVyZW5jZXMoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KTtcbiAgY29uc3QgcmljaHRleHRGaWVsZHMgPSBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcylcbiAgICAuZmlsdGVyKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIC8vIENoZWNrIGV4cGxpY2l0IGNvbmZpZyBvdmVycmlkZXMgZmlyc3RcbiAgY29uc3QgZXhwbGljaXRJbm5lckJsb2NrcyA9IE9iamVjdC5lbnRyaWVzKGZpZWxkUHJlZnMpXG4gICAgLmZpbHRlcigoWywgcHJlZnNdKSA9PiBwcmVmcy5pbm5lckJsb2NrcyA9PT0gdHJ1ZSlcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBsZXQgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgXCIke2NvbXBvbmVudC5pZH1cIjogb25seSBvbmUgcmljaHRleHQgZmllbGQgcGVyIGJsb2NrIGNhbiB1c2UgSW5uZXJCbG9ja3MsIGAgK1xuICAgICAgYGJ1dCAke2V4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RofSBhcmUgbWFya2VkOiAke2V4cGxpY2l0SW5uZXJCbG9ja3Muam9pbignLCAnKX1gXG4gICAgKTtcbiAgfSBlbHNlIGlmIChleHBsaWNpdElubmVyQmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IGZpZWxkID0gZXhwbGljaXRJbm5lckJsb2Nrc1swXTtcbiAgICBjb25zdCBwcm9wID0gY29tcG9uZW50LnByb3BlcnRpZXNbZmllbGRdO1xuICAgIGlmICghcHJvcCB8fCBwcm9wLnR5cGUgIT09ICdyaWNodGV4dCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBmaWVsZCBcIiR7ZmllbGR9XCIgaXMgbWFya2VkIGFzIGlubmVyQmxvY2tzIGJ1dCBpcyBub3QgYSByaWNodGV4dCBmaWVsZGBcbiAgICAgICk7XG4gICAgfVxuICAgIGlubmVyQmxvY2tzRmllbGQgPSBmaWVsZDtcbiAgfSBlbHNlIGlmIChyaWNodGV4dEZpZWxkcy5sZW5ndGggPT09IDEpIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gcmljaHRleHRGaWVsZHNbMF07XG4gIH0gZWxzZSB7XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IG51bGw7XG4gIH1cbiAgXG4gIGNvbnN0IGhpc3RvcnlFbnRyeSA9IHNjaGVtYUhpc3RvcnkgPyBnZXRDb21wb25lbnRIaXN0b3J5KHNjaGVtYUhpc3RvcnksIGNvbXBvbmVudC5pZCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGN1cnJlbnRQcm9wcyA9IGV4dHJhY3RQcm9wZXJ0aWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKTtcbiAgY29uc3QgbWlncmF0aW9uT3ZlcnJpZGVzID0gcmVzb2x2ZWRDb25maWcuc2NoZW1hTWlncmF0aW9ucz8uW2NvbXBvbmVudC5pZF07XG4gIGNvbnN0IGRlcHJlY2F0aW9uc0NvZGUgPSBnZW5lcmF0ZURlcHJlY2F0aW9ucyhcbiAgICBoaXN0b3J5RW50cnksXG4gICAgY3VycmVudFByb3BzLFxuICAgIG1pZ3JhdGlvbk92ZXJyaWRlcyxcbiAgICAhIWlubmVyQmxvY2tzRmllbGRcbiAgKTtcblxuICBjb25zdCBzdHlsZU1vZGUgPSByZXNvbHZlZENvbmZpZy5jb21waWxlcj8uc3R5bGVNb2RlID8/ICdsZWdhY3knO1xuICBjb25zdCBzdHlsZU9wdGlvbnMgPSB7IHN0eWxlTW9kZSB9O1xuXG4gIHJldHVybiB7XG4gICAgYmxvY2tKc29uOiBnZW5lcmF0ZUJsb2NrSnNvbihjb21wb25lbnQsIGhhc1NjcmVlbnNob3QsIGFwaVVybCwgY29tcG9uZW50RHluYW1pY0FycmF5cywgaW5uZXJCbG9ja3NGaWVsZCksXG4gICAgaW5kZXhKczogZ2VuZXJhdGVJbmRleEpzKFxuICAgICAgY29tcG9uZW50LFxuICAgICAgY29tcG9uZW50RHluYW1pY0FycmF5cyxcbiAgICAgIGlubmVyQmxvY2tzRmllbGQsXG4gICAgICBkZXByZWNhdGlvbnNDb2RlLFxuICAgICAgaGFzU2NyZWVuc2hvdCxcbiAgICAgIHJlc29sdmVkQ29uZmlnLmVkaXRvcixcbiAgICApLFxuICAgIHJlbmRlclBocDogZ2VuZXJhdGVSZW5kZXJQaHAoY29tcG9uZW50LCBjb21wb25lbnREeW5hbWljQXJyYXlzLCBpbm5lckJsb2Nrc0ZpZWxkKSxcbiAgICBlZGl0b3JTY3NzOiBnZW5lcmF0ZUVkaXRvclNjc3MoY29tcG9uZW50LCB7IGVkaXRvckNvbmZpZzogcmVzb2x2ZWRDb25maWcuZWRpdG9yLCAuLi5zdHlsZU9wdGlvbnMgfSksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZVN0eWxlU2Nzcyhjb21wb25lbnQsIHN0eWxlT3B0aW9ucyksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZVJlYWRtZShjb21wb25lbnQpLFxuICAgIG1pZ3JhdGlvblNjaGVtYTogZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEoY29tcG9uZW50KSxcbiAgICBzY2hlbWFDaGFuZ2Vsb2c6IGdlbmVyYXRlU2NoZW1hQ2hhbmdlbG9nKGNvbXBvbmVudC5pZCwgaGlzdG9yeUVudHJ5KSxcbiAgICBzY3JlZW5zaG90VXJsXG4gIH07XG59O1xuXG4vKipcbiAqIENvcHkgcGVyLWNvbXBvbmVudCB2aWV3LmpzIC8gdmlldy5jc3MgZnJvbSBIYW5kb2ZmIEFQSSBvdXRwdXQuXG4gKi9cbmNvbnN0IGNvcHlDb21wb25lbnRWaWV3QXNzZXRzID0gKFxuICBibG9ja0Rpcjogc3RyaW5nLFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCxcbik6IHsgaGFzVmlld1NjcmlwdDogYm9vbGVhbjsgaGFzVmlld1N0eWxlOiBib29sZWFuIH0gPT4ge1xuICBpZiAoIWN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICByZXR1cm4geyBoYXNWaWV3U2NyaXB0OiBmYWxzZSwgaGFzVmlld1N0eWxlOiBmYWxzZSB9O1xuICB9XG4gIGxldCBoYXNWaWV3U2NyaXB0ID0gZmFsc2U7XG4gIGxldCBoYXNWaWV3U3R5bGUgPSBmYWxzZTtcbiAgY29uc3QganNTcmMgPSBwYXRoLmpvaW4oY3R4LmxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsIGAke2NvbXBvbmVudElkfS5qc2ApO1xuICBpZiAoZnMuZXhpc3RzU3luYyhqc1NyYykpIHtcbiAgICBmcy5jb3B5RmlsZVN5bmMoanNTcmMsIHBhdGguam9pbihibG9ja0RpciwgJ3ZpZXcuanMnKSk7XG4gICAgaGFzVmlld1NjcmlwdCA9IHRydWU7XG4gIH1cbiAgY29uc3QgY3NzU3JjID0gcGF0aC5qb2luKGN0eC5sb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCBgJHtjb21wb25lbnRJZH0uY3NzYCk7XG4gIGlmIChmcy5leGlzdHNTeW5jKGNzc1NyYykpIHtcbiAgICBmcy5jb3B5RmlsZVN5bmMoY3NzU3JjLCBwYXRoLmpvaW4oYmxvY2tEaXIsICd2aWV3LmNzcycpKTtcbiAgICBoYXNWaWV3U3R5bGUgPSB0cnVlO1xuICB9XG4gIHJldHVybiB7IGhhc1ZpZXdTY3JpcHQsIGhhc1ZpZXdTdHlsZSB9O1xufTtcblxuLyoqXG4gKiBXcml0ZSBibG9jayBmaWxlcyB0byBvdXRwdXQgZGlyZWN0b3J5XG4gKi9cbmNvbnN0IHdyaXRlQmxvY2tGaWxlcyA9IGFzeW5jIChcbiAgb3V0cHV0RGlyOiBzdHJpbmcsXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGJsb2NrOiBHZW5lcmF0ZWRCbG9jayxcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50SWQpO1xuICBjb25zdCBibG9ja0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGJsb2NrTmFtZSk7XG4gIFxuICAvLyBDcmVhdGUgYmxvY2sgZGlyZWN0b3J5XG4gIGlmICghZnMuZXhpc3RzU3luYyhibG9ja0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoYmxvY2tEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgY29uc3Qgdmlld0Fzc2V0cyA9IGNvcHlDb21wb25lbnRWaWV3QXNzZXRzKGJsb2NrRGlyLCBjb21wb25lbnRJZCwgY3R4KTtcbiAgbGV0IGJsb2NrSnNvbkNvbnRlbnQgPSBibG9jay5ibG9ja0pzb247XG4gIGlmICh2aWV3QXNzZXRzLmhhc1ZpZXdTY3JpcHQgfHwgdmlld0Fzc2V0cy5oYXNWaWV3U3R5bGUpIHtcbiAgICBjb25zdCBibG9ja0pzb25PYmogPSBKU09OLnBhcnNlKGJsb2NrLmJsb2NrSnNvbikgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgaWYgKHZpZXdBc3NldHMuaGFzVmlld1NjcmlwdCkge1xuICAgICAgYmxvY2tKc29uT2JqLnZpZXdTY3JpcHQgPSAnZmlsZTouL3ZpZXcuanMnO1xuICAgIH1cbiAgICBpZiAodmlld0Fzc2V0cy5oYXNWaWV3U3R5bGUpIHtcbiAgICAgIGJsb2NrSnNvbk9iai52aWV3U3R5bGUgPSAnZmlsZTouL3ZpZXcuY3NzJztcbiAgICB9XG4gICAgYmxvY2tKc29uQ29udGVudCA9IEpTT04uc3RyaW5naWZ5KGJsb2NrSnNvbk9iaiwgbnVsbCwgMik7XG4gIH1cbiAgXG4gIC8vIEZvcm1hdCBhbGwgY29kZSBmaWxlcyB3aXRoIFByZXR0aWVyXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2tKc29uQ29udGVudCwgJ2pzb24nKTtcbiAgY29uc3QgZm9ybWF0dGVkSW5kZXhKcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suaW5kZXhKcywgJ2JhYmVsJyk7XG4gIGNvbnN0IGZvcm1hdHRlZEVkaXRvclNjc3MgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLmVkaXRvclNjc3MsICdzY3NzJyk7XG4gIGNvbnN0IGZvcm1hdHRlZFN0eWxlU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUoYmxvY2suc3R5bGVTY3NzLCAnc2NzcycpO1xuICBjb25zdCBmb3JtYXR0ZWRSZW5kZXJQaHAgPSBhd2FpdCBmb3JtYXRDb2RlKGJsb2NrLnJlbmRlclBocCwgJ3BocCcpO1xuICBcbiAgLy8gV3JpdGUgZmlsZXNcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihibG9ja0RpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdSRUFETUUubWQnKSwgYmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmxvY2tEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgYmxvY2subWlncmF0aW9uU2NoZW1hKTtcbiAgaWYgKGJsb2NrLnNjaGVtYUNoYW5nZWxvZykge1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJsb2NrRGlyLCAnc2NoZW1hLWNoYW5nZWxvZy5qc29uJyksIGJsb2NrLnNjaGVtYUNoYW5nZWxvZyk7XG4gIH1cbiAgXG4gIC8vIERvd25sb2FkIHNjcmVlbnNob3QgaWYgYXZhaWxhYmxlXG4gIGxldCBzY3JlZW5zaG90RG93bmxvYWRlZCA9IGZhbHNlO1xuICBpZiAoYmxvY2suc2NyZWVuc2hvdFVybCkge1xuICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoID0gcGF0aC5qb2luKGJsb2NrRGlyLCAnc2NyZWVuc2hvdC5wbmcnKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+TtyBEb3dubG9hZGluZyBzY3JlZW5zaG90Li4uYCk7XG4gICAgc2NyZWVuc2hvdERvd25sb2FkZWQgPSBhd2FpdCBjdHhEb3dubG9hZEZpbGUoY3R4LCBibG9jay5zY3JlZW5zaG90VXJsLCBzY3JlZW5zaG90UGF0aCk7XG4gIH1cbiAgXG4gIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkIGJsb2NrOiAke2Jsb2NrTmFtZX1gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtibG9ja0Rpcn1gKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgYmxvY2suanNvbmApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCBpbmRleC5qc2ApO1xuICBjb25zb2xlLmxvZyhgICAg8J+ThCByZW5kZXIucGhwYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIGVkaXRvci5zY3NzYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIHN0eWxlLnNjc3NgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgUkVBRE1FLm1kYCk7XG4gIGNvbnNvbGUubG9nKGAgICDwn5OEIG1pZ3JhdGlvbi1zY2hlbWEuanNvbmApO1xuICBpZiAodmlld0Fzc2V0cy5oYXNWaWV3U2NyaXB0KSB7XG4gICAgY29uc29sZS5sb2coYCAgIPCfk4Qgdmlldy5qc2ApO1xuICB9XG4gIGlmICh2aWV3QXNzZXRzLmhhc1ZpZXdTdHlsZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5OEIHZpZXcuY3NzYCk7XG4gIH1cbiAgaWYgKHNjcmVlbnNob3REb3dubG9hZGVkKSB7XG4gICAgY29uc29sZS5sb2coYCAgIPCflrzvuI8gIHNjcmVlbnNob3QucG5nYCk7XG4gIH1cbn07XG5cbi8qKlxuICogTWFpbiBjb21waWxhdGlvbiBmdW5jdGlvblxuICovXG5jb25zdCBjb21waWxlID0gYXN5bmMgKG9wdGlvbnM6IENvbXBpbGVyT3B0aW9ucyk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBkYXRhQ3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQgPSB7XG4gICAgYXBpVXJsOiBvcHRpb25zLmFwaVVybCxcbiAgICBhdXRoOiBvcHRpb25zLmF1dGgsXG4gICAgbG9jYWxBcGlSb290OiBvcHRpb25zLmxvY2FsQXBpUm9vdCxcbiAgfTtcblxuICBjb25zb2xlLmxvZyhgXFxu8J+UpyBHdXRlbmJlcmcgQ29tcGlsZXJgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtvcHRpb25zLmFwaVVybH1gKTtcbiAgaWYgKGRhdGFDdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtkYXRhQ3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBDb21wb25lbnQ6ICR7b3B0aW9ucy5jb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke29wdGlvbnMub3V0cHV0RGlyfWApO1xuICBpZiAob3B0aW9ucy5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke29wdGlvbnMuYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBmcm9tIEFQSVxuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBkYXRhLi4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgb3B0aW9ucy5jb21wb25lbnROYW1lKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQ6ICR7Y29tcG9uZW50LnRpdGxlfSAoJHtjb21wb25lbnQuaWR9KVxcbmApO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRlbXBsYXRlIHZhcmlhYmxlcyBiZWZvcmUgZ2VuZXJhdGluZ1xuICAgIGlmIChjb25maWcuY29tcGlsZXI/LnN0eWxlTW9kZSAhPT0gJ3RhaWx3aW5kJykge1xuICAgICAgY29uc29sZS5sb2coYPCflI0gVmFsaWRhdGluZyB0ZW1wbGF0ZSB2YXJpYWJsZXMuLi5gKTtcbiAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoY29tcG9uZW50KTtcbiAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICAgIGNvbnNvbGUubG9nKCcnKTtcblxuICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgVGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQhIEZpeCB0aGUgdW5kZWZpbmVkIHZhcmlhYmxlcyBiZWZvcmUgY29tcGlsaW5nLlxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGJsb2NrIGZpbGVzICh3aXRoIGRlcHJlY2F0aW9uIHN1cHBvcnQgZnJvbSBzY2hlbWEgaGlzdG9yeSlcbiAgICBjb25zb2xlLmxvZyhg4pqZ77iPICBHZW5lcmF0aW5nIEd1dGVuYmVyZyBibG9jay4uLmApO1xuICAgIGNvbnN0IHNjaGVtYUhpc3RvcnkgPSBsb2FkTWFuaWZlc3Qob3B0aW9ucy5vdXRwdXREaXIpO1xuICAgIGNvbnN0IGJsb2NrID0gZ2VuZXJhdGVCbG9jayhjb21wb25lbnQsIG9wdGlvbnMuYXBpVXJsLCBjb25maWcsIHNjaGVtYUhpc3RvcnkpO1xuICAgIFxuICAgIC8vIFdyaXRlIGZpbGVzICh3aXRoIFByZXR0aWVyIGZvcm1hdHRpbmcpXG4gICAgYXdhaXQgd3JpdGVCbG9ja0ZpbGVzKG9wdGlvbnMub3V0cHV0RGlyLCBjb21wb25lbnQuaWQsIGJsb2NrLCBkYXRhQ3R4KTtcblxuICAgIGNvbnN0IGNvbnRlbnRSb290ID0gcGF0aC5yZXNvbHZlKG9wdGlvbnMub3V0cHV0RGlyLCAnLi4nKTtcbiAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGRhdGFDdHgsIGNvbnRlbnRSb290LCBjb25maWcpO1xuICAgIGlmIChjb25maWcuZWRpdG9yPy5zY29wZURlc2lnblN5c3RlbSAhPT0gZmFsc2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHNjb3BlRGVzaWduU3lzdGVtRm9yRWRpdG9yKGNvbnRlbnRSb290LCBjb25maWcuZWRpdG9yKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYCAgIOKaoO+4jyAgRWRpdG9yIENTUyBzY29waW5nIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYFxcbuKcqCBEb25lISBEb24ndCBmb3JnZXQgdG8gcnVuICducG0gcnVuIGJ1aWxkJyBpbiB5b3VyIGJsb2NrcyBwbHVnaW4uXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgYSBjb21wb25lbnQgc2hvdWxkIGJlIGltcG9ydGVkIGJhc2VkIG9uIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBzaG91bGRJbXBvcnRDb21wb25lbnQgPSAoY29tcG9uZW50SWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZyk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCB0eXBlQ29uZmlnID0gaW1wb3J0Q29uZmlnW2NvbXBvbmVudFR5cGVdO1xuXG4gIC8vIFR5cGUgbm90IGxpc3RlZCBpbiBpbXBvcnQgY29uZmlnIOKAlCBkZWZhdWx0IHRvIHRydWUgKGltcG9ydClcbiAgaWYgKHR5cGVDb25maWcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gIC8vIEVudGlyZSB0eXBlIGRpc2FibGVkXG4gIGlmICh0eXBlQ29uZmlnID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAvLyBFbnRpcmUgdHlwZSBlbmFibGVkIHdpdGggbm8gcGVyLWNvbXBvbmVudCBvdmVycmlkZXNcbiAgaWYgKHR5cGVDb25maWcgPT09IHRydWUpIHJldHVybiB0cnVlO1xuXG4gIC8vIFBlci1jb21wb25lbnQgbG9va3VwIHdpdGhpbiB0aGUgdHlwZSBvYmplY3RcbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIC8vIE5vdCBsaXN0ZWQg4oCUIGltcG9ydCB3aXRoIGRlZmF1bHRzICh0eXBlLW9iamVjdCBtZWFucyBcImltcG9ydCBhbGwsIG92ZXJyaWRlIGxpc3RlZFwiKVxuICBpZiAoY29tcG9uZW50Q29uZmlnID09PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAvLyBFeHBsaWNpdGx5IGRpc2FibGVkXG4gIGlmIChjb21wb25lbnRDb25maWcgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIC8vIEV4cGxpY2l0bHkgZW5hYmxlZCBvciBoYXMgZmllbGQgb3ZlcnJpZGVzXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIHJhdyBwZXItZmllbGQgY29uZmlnIG9iamVjdCBmb3IgYSBjb21wb25lbnQgZnJvbSB0aGUgaW1wb3J0IGNvbmZpZy5cbiAqL1xuY29uc3QgZ2V0Q29tcG9uZW50RmllbGRDb25maWdzID0gKFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnXG4pOiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBGaWVsZFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHR5cGVDb25maWcgPSBpbXBvcnRDb25maWdbY29tcG9uZW50VHlwZV07XG4gIGlmICghdHlwZUNvbmZpZyB8fCB0eXBlb2YgdHlwZUNvbmZpZyA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4ge307XG5cbiAgY29uc3QgY29tcG9uZW50Q29uZmlnID0gdHlwZUNvbmZpZ1tjb21wb25lbnRJZF07XG4gIGlmICghY29tcG9uZW50Q29uZmlnIHx8IHR5cGVvZiBjb21wb25lbnRDb25maWcgPT09ICdib29sZWFuJykgcmV0dXJuIHt9O1xuXG4gIHJldHVybiBjb21wb25lbnRDb25maWcgYXMgUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgRmllbGRQcmVmZXJlbmNlcz47XG59O1xuXG4vKipcbiAqIEV4dHJhY3QgZHluYW1pYyBhcnJheSBjb25maWdzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RHluYW1pY0FycmF5Q29uZmlncyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+ID0+IHtcbiAgY29uc3QgYWxsQ29uZmlncyA9IGdldENvbXBvbmVudEZpZWxkQ29uZmlncyhjb21wb25lbnRJZCwgY29tcG9uZW50VHlwZSwgaW1wb3J0Q29uZmlnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4gPSB7fTtcbiAgZm9yIChjb25zdCBba2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGFsbENvbmZpZ3MpKSB7XG4gICAgaWYgKGlzRHluYW1pY0FycmF5Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gY29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IGZpZWxkIHByZWZlcmVuY2VzIGZvciBhIGNvbXBvbmVudCBmcm9tIHRoZSBpbXBvcnQgY29uZmlnLlxuICovXG5jb25zdCBleHRyYWN0RmllbGRQcmVmZXJlbmNlcyA9IChcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICBpbXBvcnRDb25maWc6IEltcG9ydENvbmZpZ1xuKTogUmVjb3JkPHN0cmluZywgRmllbGRQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBhbGxDb25maWdzID0gZ2V0Q29tcG9uZW50RmllbGRDb25maWdzKGNvbXBvbmVudElkLCBjb21wb25lbnRUeXBlLCBpbXBvcnRDb25maWcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIEZpZWxkUHJlZmVyZW5jZXM+ID0ge307XG4gIGZvciAoY29uc3QgW2tleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhhbGxDb25maWdzKSkge1xuICAgIGlmICghaXNEeW5hbWljQXJyYXlDb25maWcoY29uZmlnKSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBjb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEZldGNoIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEksIGZpbHRlcmVkIGJ5IGltcG9ydCBjb25maWcgKEhUVFAgb25seSlcbiAqL1xuY29uc3QgaHR0cEZldGNoQ29tcG9uZW50TGlzdCA9IGFzeW5jIChhcGlVcmw6IHN0cmluZywgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcsIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHMpOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGNvbnN0IHVybCA9IGAke2FwaVVybH0vYXBpL2NvbXBvbmVudHMuanNvbmA7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHByb3RvY29sID0gdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBodHRwcyA6IGh0dHA7XG4gICAgY29uc3Qgb3B0aW9ucyA9IGJ1aWxkUmVxdWVzdE9wdGlvbnModXJsLCBhdXRoKTtcbiAgICBcbiAgICBwcm90b2NvbC5nZXQob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gZmFpbGVkOiBIVFRQIDQwMS4gQ2hlY2sgeW91ciB1c2VybmFtZSBhbmQgcGFzc3dvcmQuYCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggY29tcG9uZW50IGxpc3Q6IEhUVFAgJHtyZXMuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IEpTT04ucGFyc2UoZGF0YSkgYXMgQXJyYXk8SGFuZG9mZkNvbXBvbmVudD47XG4gICAgICAgICAgY29uc3QgZmlsdGVyZWQgPSBjb21wb25lbnRzLmZpbHRlcihjID0+IHNob3VsZEltcG9ydENvbXBvbmVudChjLmlkLCBjLnR5cGUsIGltcG9ydENvbmZpZykpO1xuICAgICAgICAgIHJlc29sdmUoZmlsdGVyZWQubWFwKGMgPT4gYy5pZCkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGZXRjaCBmdWxsIGxpc3Qgb2YgYWxsIGNvbXBvbmVudHMgZnJvbSBBUEkgKG5vIGltcG9ydCBmaWx0ZXIpLiBVc2VkIHRvIHJlc29sdmUgZ3JvdXAgbmFtZXMgKEhUVFAgb25seSkuXG4gKi9cbmNvbnN0IGh0dHBGZXRjaEFsbENvbXBvbmVudHNMaXN0ID0gYXN5bmMgKGFwaVVybDogc3RyaW5nLCBhdXRoPzogQXV0aENyZWRlbnRpYWxzKTogUHJvbWlzZTxIYW5kb2ZmQ29tcG9uZW50W10+ID0+IHtcbiAgY29uc3QgdXJsID0gYCR7YXBpVXJsfS9hcGkvY29tcG9uZW50cy5qc29uYDtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBwcm90b2NvbCA9IHVybC5zdGFydHNXaXRoKCdodHRwcycpID8gaHR0cHMgOiBodHRwO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBidWlsZFJlcXVlc3RPcHRpb25zKHVybCwgYXV0aCk7XG4gICAgcHJvdG9jb2wuZ2V0KG9wdGlvbnMsIChyZXMpID0+IHtcbiAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEF1dGhlbnRpY2F0aW9uIGZhaWxlZDogSFRUUCA0MDEuIENoZWNrIHlvdXIgdXNlcm5hbWUgYW5kIHBhc3N3b3JkLmApKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGNvbXBvbmVudCBsaXN0OiBIVFRQICR7cmVzLnN0YXR1c0NvZGV9YCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gSlNPTi5wYXJzZShkYXRhKSBhcyBBcnJheTxIYW5kb2ZmQ29tcG9uZW50PjtcbiAgICAgICAgICByZXNvbHZlKGNvbXBvbmVudHMpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIGNvbXBvbmVudHMgbGlzdDogJHtlfWApKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSkub24oJ2Vycm9yJywgKGUpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBjb21wb25lbnRzOiAke2UubWVzc2FnZX1gKSkpO1xuICB9KTtcbn07XG5cbi8qKlxuICogRGF0YSBhY2Nlc3MgY29udGV4dDogSFRUUCBIYW5kb2ZmIEFQSSBvciBsb2NhbCBgcHVibGljL2FwaWAgZm9sZGVyICgtLXNvdXJjZSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSGFuZG9mZkRhdGFDb250ZXh0IHtcbiAgYXBpVXJsOiBzdHJpbmc7XG4gIGF1dGg/OiBBdXRoQ3JlZGVudGlhbHM7XG4gIC8qKiBBYnNvbHV0ZSBwYXRoIHRvIEhhbmRvZmYgYHB1YmxpYy9hcGlgIChjb250YWlucyBgY29tcG9uZW50cy5qc29uYCArIGBjb21wb25lbnQvYCkgKi9cbiAgbG9jYWxBcGlSb290Pzogc3RyaW5nO1xufVxuXG5jb25zdCByZWFkTG9jYWxDb21wb25lbnRzSnNvbiA9IChsb2NhbEFwaVJvb3Q6IHN0cmluZyk6IEhhbmRvZmZDb21wb25lbnRbXSA9PiB7XG4gIGNvbnN0IHAgPSBwYXRoLmpvaW4obG9jYWxBcGlSb290LCAnY29tcG9uZW50cy5qc29uJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhwKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTG9jYWwgSGFuZG9mZiBBUEkgbWlzc2luZyBjb21wb25lbnRzIGxpc3Q6ICR7cH1gKTtcbiAgfVxuICByZXR1cm4gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMocCwgJ3V0Zi04JykpIGFzIEhhbmRvZmZDb21wb25lbnRbXTtcbn07XG5cbmNvbnN0IHJlc29sdmVVcmxUb0xvY2FsUGF0aCA9IChsb2NhbEFwaVJvb3Q6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgbGV0IHBhdGhuYW1lID0gJyc7XG4gIHRyeSB7XG4gICAgcGF0aG5hbWUgPSBuZXcgVVJMKHVybCkucGF0aG5hbWU7XG4gIH0gY2F0Y2gge1xuICAgIGNvbnN0IHEgPSB1cmwuaW5kZXhPZignPycpO1xuICAgIHBhdGhuYW1lID0gcSA+PSAwID8gdXJsLnNsaWNlKDAsIHEpIDogdXJsO1xuICAgIGlmICghcGF0aG5hbWUuc3RhcnRzV2l0aCgnLycpKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9XG4gIGxldCBub3JtYWxpemVkID0gcGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCAnJyk7XG4gIGNvbnN0IGFwaVByZWZpeCA9ICdhcGkvY29tcG9uZW50Lyc7XG4gIGlmIChub3JtYWxpemVkLnN0YXJ0c1dpdGgoYXBpUHJlZml4KSkge1xuICAgIGNvbnN0IHJlbCA9IG5vcm1hbGl6ZWQuc2xpY2UoYXBpUHJlZml4Lmxlbmd0aCk7XG4gICAgY29uc3QgcCA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCByZWwpO1xuICAgIHJldHVybiBmcy5leGlzdHNTeW5jKHApID8gcCA6IG51bGw7XG4gIH1cbiAgaWYgKG5vcm1hbGl6ZWQuc3RhcnRzV2l0aCgnaW1hZ2VzLycpKSB7XG4gICAgY29uc3QgcCA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICcuLicsIG5vcm1hbGl6ZWQpO1xuICAgIHJldHVybiBmcy5leGlzdHNTeW5jKHApID8gcCA6IG51bGw7XG4gIH1cbiAgY29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUocGF0aG5hbWUpO1xuICBjb25zdCBmYWxsYmFjayA9IHBhdGguam9pbihsb2NhbEFwaVJvb3QsICdjb21wb25lbnQnLCBiYXNlKTtcbiAgcmV0dXJuIGZzLmV4aXN0c1N5bmMoZmFsbGJhY2spID8gZmFsbGJhY2sgOiBudWxsO1xufTtcblxuY29uc3QgY3R4RmV0Y2hDb21wb25lbnQgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IFByb21pc2U8SGFuZG9mZkNvbXBvbmVudD4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmpvaW4oY3R4LmxvY2FsQXBpUm9vdCwgJ2NvbXBvbmVudCcsIGAke2NvbXBvbmVudE5hbWV9Lmpzb25gKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTG9jYWwgY29tcG9uZW50IEpTT04gbm90IGZvdW5kOiAke2ZpbGV9YCk7XG4gICAgfVxuICAgIHJldHVybiBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhmaWxlLCAndXRmLTgnKSkgYXMgSGFuZG9mZkNvbXBvbmVudDtcbiAgfVxuICByZXR1cm4gaHR0cEZldGNoQ29tcG9uZW50KGN0eC5hcGlVcmwsIGNvbXBvbmVudE5hbWUsIGN0eC5hdXRoKTtcbn07XG5cbmNvbnN0IGN0eEZldGNoQ29tcG9uZW50TGlzdCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcpOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc3QgY29tcG9uZW50cyA9IHJlYWRMb2NhbENvbXBvbmVudHNKc29uKGN0eC5sb2NhbEFwaVJvb3QpO1xuICAgIHJldHVybiBjb21wb25lbnRzLmZpbHRlcigoYykgPT4gc2hvdWxkSW1wb3J0Q29tcG9uZW50KGMuaWQsIGMudHlwZSwgaW1wb3J0Q29uZmlnKSkubWFwKChjKSA9PiBjLmlkKTtcbiAgfVxuICByZXR1cm4gaHR0cEZldGNoQ29tcG9uZW50TGlzdChjdHguYXBpVXJsLCBpbXBvcnRDb25maWcsIGN0eC5hdXRoKTtcbn07XG5cbmNvbnN0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQpOiBQcm9taXNlPEhhbmRvZmZDb21wb25lbnRbXT4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIHJldHVybiByZWFkTG9jYWxDb21wb25lbnRzSnNvbihjdHgubG9jYWxBcGlSb290KTtcbiAgfVxuICByZXR1cm4gaHR0cEZldGNoQWxsQ29tcG9uZW50c0xpc3QoY3R4LmFwaVVybCwgY3R4LmF1dGgpO1xufTtcblxuY29uc3QgY3R4RG93bmxvYWRGaWxlID0gYXN5bmMgKGN0eDogSGFuZG9mZkRhdGFDb250ZXh0LCB1cmw6IHN0cmluZywgZGVzdFBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnN0IHNyY1BhdGggPSByZXNvbHZlVXJsVG9Mb2NhbFBhdGgoY3R4LmxvY2FsQXBpUm9vdCwgdXJsKTtcbiAgICBpZiAoIXNyY1BhdGgpIHtcbiAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBMb2NhbCBhc3NldCBub3QgZm91bmQgZm9yIFVSTDogJHt1cmx9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUoZGVzdFBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICBmcy5jb3B5RmlsZVN5bmMoc3JjUGF0aCwgZGVzdFBhdGgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBodHRwRG93bmxvYWRGaWxlKHVybCwgZGVzdFBhdGgsIGN0eC5hdXRoKTtcbn07XG5cbi8qKlxuICogQ29weSBIYW5kb2ZmIGJ1bmRsZSBtYWluLmpzIC8gbWFpbi5jc3MgZnJvbSBsb2NhbCBwdWJsaWMvYXBpIGludG8gd3AtY29udGVudC9oYW5kb2ZmL2Fzc2V0cy5cbiAqL1xuY29uc3Qgc3luY0J1bmRsZUFzc2V0cyA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIGNvbnRlbnRSb290OiBzdHJpbmcsXG4gIHJlc29sdmVkQ29uZmlnPzogUmVzb2x2ZWRDb25maWcsXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgY29tcGlsZXIgPSByZXNvbHZlZENvbmZpZz8uY29tcGlsZXI7XG4gIGlmIChjb21waWxlcj8uc3R5bGVNb2RlID09PSAndGFpbHdpbmQnIHx8IGNvbXBpbGVyPy5zeW5jRGVzaWduU3lzdGVtQXNzZXRzID09PSBmYWxzZSkge1xuICAgIGNvbnNvbGUubG9nKCcgICDij63vuI8gIFNraXBwaW5nIG1haW4uY3NzL21haW4uanMgc3luYyAodGFpbHdpbmQgLyBzeW5jRGVzaWduU3lzdGVtQXNzZXRzPWZhbHNlKScpO1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIWN0eC5sb2NhbEFwaVJvb3QpIHJldHVybjtcbiAgY29uc3QgYXNzZXRzQ3NzRGlyID0gcGF0aC5qb2luKGNvbnRlbnRSb290LCAnYXNzZXRzJywgJ2NzcycpO1xuICBjb25zdCBhc3NldHNKc0RpciA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ2Fzc2V0cycsICdqcycpO1xuICBmcy5ta2RpclN5bmMoYXNzZXRzQ3NzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgZnMubWtkaXJTeW5jKGFzc2V0c0pzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgY29uc3QgbWFpbkNzcyA9IHBhdGguam9pbihjdHgubG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgJ21haW4uY3NzJyk7XG4gIGNvbnN0IG1haW5KcyA9IHBhdGguam9pbihjdHgubG9jYWxBcGlSb290LCAnY29tcG9uZW50JywgJ21haW4uanMnKTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMobWFpbkNzcykpIHtcbiAgICBmcy5jb3B5RmlsZVN5bmMobWFpbkNzcywgcGF0aC5qb2luKGFzc2V0c0Nzc0RpciwgJ21haW4uY3NzJykpO1xuICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2Nzcy9tYWluLmNzcyAoZnJvbSAtLXNvdXJjZSlgKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgTWlzc2luZyAke21haW5Dc3N9YCk7XG4gIH1cbiAgaWYgKGZzLmV4aXN0c1N5bmMobWFpbkpzKSkge1xuICAgIGZzLmNvcHlGaWxlU3luYyhtYWluSnMsIHBhdGguam9pbihhc3NldHNKc0RpciwgJ21haW4uanMnKSk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBhc3NldHMvanMvbWFpbi5qcyAoZnJvbSAtLXNvdXJjZSlgKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgTWlzc2luZyAke21haW5Kc31gKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb21waWxlIGFsbCBjb21wb25lbnRzXG4gKi9cbi8qKlxuICogQnVpbGQgVmFyaWFudEluZm8gZm9yIGEgY29tcG9uZW50IChyZXNvbHZlcyBkeW5hbWljIGFycmF5cywgSW5uZXJCbG9ja3MgZmllbGQsIGV0Yy4pXG4gKi9cbmNvbnN0IGJ1aWxkVmFyaWFudEluZm8gPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCByZXNvbHZlZENvbmZpZzogUmVzb2x2ZWRDb25maWcpOiBWYXJpYW50SW5mbyA9PiB7XG4gIGNvbnN0IGNvbXBvbmVudER5bmFtaWNBcnJheXMgPSB7XG4gICAgLi4uZXh0cmFjdER5bmFtaWNBcnJheUNvbmZpZ3MoY29tcG9uZW50LmlkLCBjb21wb25lbnQudHlwZSwgcmVzb2x2ZWRDb25maWcuaW1wb3J0KSxcbiAgfTtcblxuICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50RHluYW1pY0FycmF5cykpIHtcbiAgICBpZiAoJ2FycmF5VHlwZScgaW4gZHluQ29uZmlnKSBjb250aW51ZTsgLy8gU2tpcCBzcGVjaWFsaXNlZCBhcnJheSB0eXBlc1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgIGlmIChwcm9wPy50eXBlID09PSAnYXJyYXknICYmIHByb3AucGFnaW5hdGlvbj8udHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBjb25zdCBwYWdpbmF0aW9uRmllbGRSZWdleCA9IG5ldyBSZWdFeHAoXG4gICAgICAgIGBcXFxce1xcXFx7XFxcXHMqI2ZpZWxkXFxcXHMrW1wiJ10ke2ZpZWxkTmFtZX1cXFxcLnBhZ2luYXRpb25bXCInXWBcbiAgICAgICk7XG4gICAgICBpZiAocGFnaW5hdGlvbkZpZWxkUmVnZXgudGVzdChjb21wb25lbnQuY29kZSkpIHtcbiAgICAgICAgKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24gPSB7IHByb3BlcnR5TmFtZTogJ3BhZ2luYXRpb24nIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmllbGRQcmVmcyA9IGV4dHJhY3RGaWVsZFByZWZlcmVuY2VzKGNvbXBvbmVudC5pZCwgY29tcG9uZW50LnR5cGUsIHJlc29sdmVkQ29uZmlnLmltcG9ydCk7XG4gIGNvbnN0IHJpY2h0ZXh0RmllbGRzID0gT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpXG4gICAgLmZpbHRlcigoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICAubWFwKChba2V5XSkgPT4ga2V5KTtcblxuICBjb25zdCBleHBsaWNpdElubmVyQmxvY2tzID0gT2JqZWN0LmVudHJpZXMoZmllbGRQcmVmcylcbiAgICAuZmlsdGVyKChbLCBwcmVmc10pID0+IHByZWZzLmlubmVyQmxvY2tzID09PSB0cnVlKVxuICAgIC5tYXAoKFtrZXldKSA9PiBrZXkpO1xuXG4gIGxldCBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBpZiAoZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYENvbXBvbmVudCBcIiR7Y29tcG9uZW50LmlkfVwiOiBvbmx5IG9uZSByaWNodGV4dCBmaWVsZCBwZXIgYmxvY2sgY2FuIHVzZSBJbm5lckJsb2NrcywgYCArXG4gICAgICBgYnV0ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5sZW5ndGh9IGFyZSBtYXJrZWQ6ICR7ZXhwbGljaXRJbm5lckJsb2Nrcy5qb2luKCcsICcpfWBcbiAgICApO1xuICB9IGVsc2UgaWYgKGV4cGxpY2l0SW5uZXJCbG9ja3MubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgZmllbGQgPSBleHBsaWNpdElubmVyQmxvY2tzWzBdO1xuICAgIGNvbnN0IHByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZF07XG4gICAgaWYgKCFwcm9wIHx8IHByb3AudHlwZSAhPT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ29tcG9uZW50IFwiJHtjb21wb25lbnQuaWR9XCI6IGZpZWxkIFwiJHtmaWVsZH1cIiBpcyBtYXJrZWQgYXMgaW5uZXJCbG9ja3MgYnV0IGlzIG5vdCBhIHJpY2h0ZXh0IGZpZWxkYFxuICAgICAgKTtcbiAgICB9XG4gICAgaW5uZXJCbG9ja3NGaWVsZCA9IGZpZWxkO1xuICB9IGVsc2UgaWYgKHJpY2h0ZXh0RmllbGRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGlubmVyQmxvY2tzRmllbGQgPSByaWNodGV4dEZpZWxkc1swXTtcbiAgfSBlbHNlIHtcbiAgICBpbm5lckJsb2Nrc0ZpZWxkID0gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY29tcG9uZW50LFxuICAgIGZpZWxkTWFwOiB7fSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkLFxuICAgIGR5bmFtaWNBcnJheUNvbmZpZ3M6IGNvbXBvbmVudER5bmFtaWNBcnJheXMsXG4gIH07XG59O1xuXG4vKipcbiAqIENvbXBpbGUgYSBzaW5nbGUgbWVyZ2VkIGdyb3VwIChlLmcuIEhlcm8gd2l0aCBtdWx0aXBsZSB2YXJpYW50cykuIFVzZWQgYnkgc2luZ2xlLW5hbWUgQ0xJIHdoZW4gbmFtZSBtYXRjaGVzIGEgZ3JvdXAuXG4gKi9cbmNvbnN0IGNvbXBpbGVHcm91cCA9IGFzeW5jIChcbiAgY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsXG4gIG91dHB1dERpcjogc3RyaW5nLFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10sXG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflIAgR2VuZXJhdGluZyBtZXJnZWQgZ3JvdXAgYmxvY2s6ICR7Z3JvdXBTbHVnfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc3QgdmFyaWFudEluZm9zOiBWYXJpYW50SW5mb1tdID0gZ3JvdXBDb21wb25lbnRzLm1hcCgoYykgPT4gYnVpbGRWYXJpYW50SW5mbyhjLCBjb25maWcpKTtcblxuICAvLyBCdWlsZCB2YXJpYW50IHNjcmVlbnNob3QgbWFwICh3aGljaCB2YXJpYW50cyBoYXZlIGltYWdlcyB0byBkb3dubG9hZClcbiAgY29uc3QgdmFyaWFudFNjcmVlbnNob3RzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBmb3IgKGNvbnN0IGNvbXAgb2YgZ3JvdXBDb21wb25lbnRzKSB7XG4gICAgdmFyaWFudFNjcmVlbnNob3RzW2NvbXAuaWRdID0gISFjb21wLmltYWdlO1xuICB9XG5cbiAgY29uc3QgbWVyZ2VkQmxvY2sgPSBnZW5lcmF0ZU1lcmdlZEJsb2NrKFxuICAgIGdyb3VwU2x1ZyxcbiAgICBncm91cENvbXBvbmVudHMsXG4gICAgdmFyaWFudEluZm9zLFxuICAgIGN0eC5hcGlVcmwsXG4gICAgdmFyaWFudFNjcmVlbnNob3RzLFxuICAgIGNvbmZpZy5lZGl0b3IsXG4gICk7XG4gIGNvbnN0IGdyb3VwQmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuICBjb25zdCBncm91cERpciA9IHBhdGguam9pbihvdXRwdXREaXIsIGdyb3VwQmxvY2tOYW1lKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGdyb3VwRGlyKSkge1xuICAgIGZzLm1rZGlyU3luYyhncm91cERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH1cblxuICAvLyBEb3dubG9hZCB2YXJpYW50IHNjcmVlbnNob3RzXG4gIGlmIChtZXJnZWRCbG9jay52YXJpYW50U2NyZWVuc2hvdFVybHMpIHtcbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIHVybF0gb2YgT2JqZWN0LmVudHJpZXMobWVyZ2VkQmxvY2sudmFyaWFudFNjcmVlbnNob3RVcmxzKSkge1xuICAgICAgY29uc3Qgc2NyZWVuc2hvdFBhdGggPSBwYXRoLmpvaW4oZ3JvdXBEaXIsIGBzY3JlZW5zaG90LSR7dmFyaWFudElkfS5wbmdgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5O3IERvd25sb2FkaW5nIHNjcmVlbnNob3QgZm9yIHZhcmlhbnQgJHt2YXJpYW50SWR9Li4uYCk7XG4gICAgICBjb25zdCBvayA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIHVybCwgc2NyZWVuc2hvdFBhdGgpO1xuICAgICAgaWYgKCFvaykge1xuICAgICAgICB2YXJpYW50U2NyZWVuc2hvdHNbdmFyaWFudElkXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZvcm1hdHRlZEJsb2NrSnNvbiA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suYmxvY2tKc29uLCAnanNvbicpO1xuICBjb25zdCBmb3JtYXR0ZWRJbmRleEpzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5pbmRleEpzLCAnYmFiZWwnKTtcbiAgY29uc3QgZm9ybWF0dGVkUmVuZGVyUGhwID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5yZW5kZXJQaHAsICdwaHAnKTtcbiAgY29uc3QgZm9ybWF0dGVkRWRpdG9yU2NzcyA9IGF3YWl0IGZvcm1hdENvZGUobWVyZ2VkQmxvY2suZWRpdG9yU2NzcywgJ3Njc3MnKTtcbiAgY29uc3QgZm9ybWF0dGVkU3R5bGVTY3NzID0gYXdhaXQgZm9ybWF0Q29kZShtZXJnZWRCbG9jay5zdHlsZVNjc3MsICdzY3NzJyk7XG5cbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdibG9jay5qc29uJyksIGZvcm1hdHRlZEJsb2NrSnNvbik7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAnaW5kZXguanMnKSwgZm9ybWF0dGVkSW5kZXhKcyk7XG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGdyb3VwRGlyLCAncmVuZGVyLnBocCcpLCBmb3JtYXR0ZWRSZW5kZXJQaHApO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ2VkaXRvci5zY3NzJyksIGZvcm1hdHRlZEVkaXRvclNjc3MpO1xuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihncm91cERpciwgJ3N0eWxlLnNjc3MnKSwgZm9ybWF0dGVkU3R5bGVTY3NzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdSRUFETUUubWQnKSwgbWVyZ2VkQmxvY2sucmVhZG1lKTtcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZ3JvdXBEaXIsICdtaWdyYXRpb24tc2NoZW1hLmpzb24nKSwgbWVyZ2VkQmxvY2subWlncmF0aW9uU2NoZW1hKTtcblxuICBpZiAobWVyZ2VkQmxvY2sudmFyaWF0aW9uRmlsZXMpIHtcbiAgICBjb25zdCB2YXJpYXRpb25zRGlyID0gcGF0aC5qb2luKGdyb3VwRGlyLCAndmFyaWF0aW9ucycpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyh2YXJpYXRpb25zRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKHZhcmlhdGlvbnNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFt2YXJpYW50SWQsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKG1lcmdlZEJsb2NrLnZhcmlhdGlvbkZpbGVzLmpzKSkge1xuICAgICAgY29uc3QgZm9ybWF0dGVkID0gYXdhaXQgZm9ybWF0Q29kZShjb250ZW50LCAnYmFiZWwnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0uanNgKSwgZm9ybWF0dGVkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbdmFyaWFudElkLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhtZXJnZWRCbG9jay52YXJpYXRpb25GaWxlcy5waHApKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZWQgPSBhd2FpdCBmb3JtYXRDb2RlKGNvbnRlbnQsICdwaHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHZhcmlhdGlvbnNEaXIsIGAke3ZhcmlhbnRJZH0ucGhwYCksIGZvcm1hdHRlZCk7XG4gICAgfVxuICB9XG5cbiAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgbWVyZ2VkIGJsb2NrOiAke2dyb3VwQmxvY2tOYW1lfSAoJHtncm91cENvbXBvbmVudHMubGVuZ3RofSB2YXJpYW50cylgKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4EgJHtncm91cERpcn1gKTtcblxuICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChncm91cENvbXBvbmVudHMpO1xuICBjb25zdCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwID0gYXdhaXQgZm9ybWF0Q29kZShjYXRlZ29yaWVzUGhwLCAncGhwJyk7XG4gIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gIGlmICghZnMuZXhpc3RzU3luYyhpbmNsdWRlc0RpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoaW5jbHVkZXNEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGNvbnN0IGNhdGVnb3JpZXNQYXRoID0gcGF0aC5qb2luKGluY2x1ZGVzRGlyLCAnaGFuZG9mZi1jYXRlZ29yaWVzLnBocCcpO1xuICBmcy53cml0ZUZpbGVTeW5jKGNhdGVnb3JpZXNQYXRoLCBmb3JtYXR0ZWRDYXRlZ29yaWVzUGhwKTtcbiAgY29uc29sZS5sb2coYCAgIPCfk4QgJHtjYXRlZ29yaWVzUGF0aH1gKTtcblxuICBjb25zdCBjb250ZW50Um9vdCA9IHBhdGgucmVzb2x2ZShvdXRwdXREaXIsICcuLicpO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoY3R4LCBjb250ZW50Um9vdCwgY29uZmlnKTtcbiAgfVxuICBpZiAoY29uZmlnLmVkaXRvcj8uc2NvcGVEZXNpZ25TeXN0ZW0gIT09IGZhbHNlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHNjb3BlRGVzaWduU3lzdGVtRm9yRWRpdG9yKGNvbnRlbnRSb290LCBjb25maWcuZWRpdG9yKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYCAgIOKaoO+4jyAgRWRpdG9yIENTUyBzY29waW5nIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyfWAsXG4gICAgICApO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgY29tcGlsZUFsbCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgb3V0cHV0RGlyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbvCflKcgR3V0ZW5iZXJnIENvbXBpbGVyIC0gQmF0Y2ggTW9kZWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIE91dHB1dDogJHtvdXRwdXREaXJ9YCk7XG4gIGlmIChjdHguYXV0aD8udXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgQXV0aDogJHtjdHguYXV0aC51c2VybmFtZX1gKTtcbiAgfVxuICBjb25zb2xlLmxvZygnJyk7XG4gIFxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0Li4uYCk7XG4gICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnRMaXN0KGN0eCwgY29uZmlnLmltcG9ydCk7XG5cbiAgICBjb25zb2xlLmxvZyhgICAgRm91bmQgJHtjb21wb25lbnRJZHMubGVuZ3RofSBjb21wb25lbnRzXFxuYCk7XG4gICAgXG4gICAgbGV0IHN1Y2Nlc3MgPSAwO1xuICAgIGxldCBmYWlsZWQgPSAwO1xuICAgIGNvbnN0IGNvbXBpbGVkQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgY29uc3Qgc2NoZW1hSGlzdG9yeSA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICAgIFxuICAgIC8vIEZldGNoIGFsbCBjb21wb25lbnRzIGZpcnN0IHNvIHdlIGNhbiBwYXJ0aXRpb24gYnkgZ3JvdXBcbiAgICBjb25zdCBhbGxDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnRJZCk7XG5cbiAgICAgICAgaWYgKGNvbmZpZy5jb21waWxlcj8uc3R5bGVNb2RlICE9PSAndGFpbHdpbmQnKSB7XG4gICAgICAgICAgY29uc3QgdGVtcGxhdGVWYWxpZGF0aW9uID0gdmFsaWRhdGVUZW1wbGF0ZVZhcmlhYmxlcyhjb21wb25lbnQpO1xuICAgICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCh0ZW1wbGF0ZVZhbGlkYXRpb24pKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjb21wb25lbnRJZH0gZHVlIHRvIHRlbXBsYXRlIHZhcmlhYmxlIGVycm9yc2ApO1xuICAgICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhbGxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZmV0Y2ggJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUGFydGl0aW9uIGNvbXBvbmVudHM6IG1lcmdlZCBncm91cHMgdnMgaW5kaXZpZHVhbFxuICAgIC8vIEJ1aWxkIGNhc2UtaW5zZW5zaXRpdmUgbG9va3VwOiBjb25maWcgbWF5IHNheSBcIkhlcm9cIiBidXQgQVBJIG9mdGVuIHJldHVybnMgXCJoZXJvXCJcbiAgICBjb25zdCBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgIGlmIChtb2RlID09PSAnbWVyZ2VkJykgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLnNldChrZXkudG9Mb3dlckNhc2UoKSwga2V5KTtcbiAgICB9XG4gICAgY29uc3QgZ3JvdXBCdWNrZXRzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmQ29tcG9uZW50W10+ID0ge307XG4gICAgY29uc3QgaW5kaXZpZHVhbENvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgYWxsQ29tcG9uZW50cykge1xuICAgICAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA7XG4gICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgIGluZGl2aWR1YWxDb21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBjb25maWdLZXkgPSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuZ2V0KGdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgaWYgKGNvbmZpZ0tleSkge1xuICAgICAgICBpZiAoIWdyb3VwQnVja2V0c1tjb25maWdLZXldKSBncm91cEJ1Y2tldHNbY29uZmlnS2V5XSA9IFtdO1xuICAgICAgICBncm91cEJ1Y2tldHNbY29uZmlnS2V5XS5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbmRpdmlkdWFsQ29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29tcGlsZSBpbmRpdmlkdWFsIGNvbXBvbmVudHMgKGV4aXN0aW5nIGJlaGF2aW9yKVxuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGluZGl2aWR1YWxDb21wb25lbnRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBibG9jayA9IGdlbmVyYXRlQmxvY2soY29tcG9uZW50LCBjdHguYXBpVXJsLCBjb25maWcsIHNjaGVtYUhpc3RvcnkpO1xuICAgICAgICBhd2FpdCB3cml0ZUJsb2NrRmlsZXMob3V0cHV0RGlyLCBjb21wb25lbnQuaWQsIGJsb2NrLCBjdHgpO1xuICAgICAgICBjb21waWxlZENvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICBzdWNjZXNzKys7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNvbXBpbGUgJHtjb21wb25lbnQuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9YCk7XG4gICAgICAgIGZhaWxlZCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbXBpbGUgbWVyZ2VkIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzXSBvZiBPYmplY3QuZW50cmllcyhncm91cEJ1Y2tldHMpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjb21waWxlR3JvdXAoY3R4LCBvdXRwdXREaXIsIGdyb3VwU2x1ZywgZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgY29tcGlsZWRDb21wb25lbnRzLnB1c2goLi4uZ3JvdXBDb21wb25lbnRzKTtcbiAgICAgICAgc3VjY2VzcyArPSBncm91cENvbXBvbmVudHMubGVuZ3RoO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBjb21waWxlIG1lcmdlZCBncm91cCAke2dyb3VwU2x1Z306ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgICAgZmFpbGVkICs9IGdyb3VwQ29tcG9uZW50cy5sZW5ndGg7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVjb25jaWxlIGxvY2FsIGJsb2NrczogbWFyayBkaXJzIG5vdCBpbiB0aGlzIGNvbXBpbGUgb3V0cHV0IGFzIGRlcHJlY2F0ZWRcbiAgICBjb25zb2xlLmxvZyhgXFxu4pqZ77iPICBSZWNvbmNpbGluZyBsb2NhbCBibG9ja3Mgd2l0aCBjb21waWxlIG91dHB1dC4uLmApO1xuICAgIGNvbnN0IGFjdGl2ZVNsdWdzID0gZ2V0QWN0aXZlQmxvY2tTbHVncyhpbmRpdmlkdWFsQ29tcG9uZW50cywgZ3JvdXBCdWNrZXRzKTtcbiAgICBjb25zdCByZWNvbmNpbGVSZXN1bHQgPSByZWNvbmNpbGVMb2NhbEJsb2NrcyhvdXRwdXREaXIsIGFjdGl2ZVNsdWdzKTtcbiAgICBjb25zdCBuZXdseURlcHJlY2F0ZWQgPSByZWNvbmNpbGVSZXN1bHQubWFya2VkO1xuICAgIGlmIChuZXdseURlcHJlY2F0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIOKaoO+4jyAgTWFya2VkICR7bmV3bHlEZXByZWNhdGVkLmxlbmd0aH0gYmxvY2socykgYXMgZGVwcmVjYXRlZDogJHtuZXdseURlcHJlY2F0ZWQuam9pbignLCAnKX1gKTtcbiAgICB9IGVsc2UgaWYgKHJlY29uY2lsZVJlc3VsdC5hbHJlYWR5RGVwcmVjYXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAg4oS577iPICAke3JlY29uY2lsZVJlc3VsdC5hbHJlYWR5RGVwcmVjYXRlZC5sZW5ndGh9IGJsb2NrKHMpIHJlbWFpbiBkZXByZWNhdGVkICh1bmNoYW5nZWQpYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgQWxsIGxvY2FsIGJsb2NrcyBtYXRjaCBjdXJyZW50IGNvbXBpbGUgb3V0cHV0YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEdlbmVyYXRlIGNhdGVnb3JpZXMgUEhQIGZpbGUgYmFzZWQgb24gYWxsIGNvbXBpbGVkIGNvbXBvbmVudHNcbiAgICBpZiAoY29tcGlsZWRDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIEdlbmVyYXRpbmcgYmxvY2sgY2F0ZWdvcmllcy4uLmApO1xuICAgICAgY29uc3QgY2F0ZWdvcmllc1BocCA9IGdlbmVyYXRlQ2F0ZWdvcmllc1BocChjb21waWxlZENvbXBvbmVudHMpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkQ2F0ZWdvcmllc1BocCA9IGF3YWl0IGZvcm1hdENvZGUoY2F0ZWdvcmllc1BocCwgJ3BocCcpO1xuICAgICAgXG4gICAgICBjb25zdCBwbHVnaW5EaXIgPSBwYXRoLmRpcm5hbWUob3V0cHV0RGlyKTtcbiAgICAgIGNvbnN0IGluY2x1ZGVzRGlyID0gcGF0aC5qb2luKHBsdWdpbkRpciwgJ2luY2x1ZGVzJyk7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoaW5jbHVkZXNEaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhpbmNsdWRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjYXRlZ29yaWVzUGF0aCA9IHBhdGguam9pbihpbmNsdWRlc0RpciwgJ2hhbmRvZmYtY2F0ZWdvcmllcy5waHAnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoY2F0ZWdvcmllc1BhdGgsIGZvcm1hdHRlZENhdGVnb3JpZXNQaHApO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Y2F0ZWdvcmllc1BhdGh9YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvcHkgc2hhcmVkIGNvbXBvbmVudHMgJiB1dGlscyB0byB0aGUgb3V0cHV0IGRpcmVjdG9yeSBzbyBibG9ja3MgY2FuXG4gICAgLy8gcmVzb2x2ZSB0aGVpciAuLi8uLi9zaGFyZWQvLi4uIGltcG9ydHMgcmVnYXJkbGVzcyBvZiB3aGVyZSB0aGV5IGxpdmUuXG4gICAgY29uc3QgcGx1Z2luUm9vdCA9IHBhdGgucmVzb2x2ZShwYXRoLmRpcm5hbWUocHJvY2Vzcy5hcmd2WzFdKSwgJy4uJywgJy4uJyk7XG4gICAgY29uc3QgcGx1Z2luU2hhcmVkRGlyID0gcGF0aC5qb2luKHBsdWdpblJvb3QsICdzaGFyZWQnKTtcbiAgICBjb25zdCBjb250ZW50Um9vdCA9IHBhdGgucmVzb2x2ZShvdXRwdXREaXIsICcuLicpO1xuICAgIGNvbnN0IHRhcmdldFNoYXJlZERpciA9IHBhdGguam9pbihjb250ZW50Um9vdCwgJ3NoYXJlZCcpO1xuXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMocGx1Z2luU2hhcmVkRGlyKSAmJlxuICAgICAgICBwYXRoLnJlc29sdmUocGx1Z2luU2hhcmVkRGlyKSAhPT0gcGF0aC5yZXNvbHZlKHRhcmdldFNoYXJlZERpcikpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7impnvuI8gIENvcHlpbmcgc2hhcmVkIGNvbXBvbmVudHMuLi5gKTtcbiAgICAgIGNvcHlEaXJSZWN1cnNpdmUocGx1Z2luU2hhcmVkRGlyLCB0YXJnZXRTaGFyZWREaXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBTaGFyZWQgY29tcG9uZW50cyBjb3BpZWQgdG8gJHt0YXJnZXRTaGFyZWREaXJ9YCk7XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcGFja2FnZS5qc29uIGFuZCBpbnN0YWxsIGJ1aWxkIGRlcGVuZGVuY2llcyBzbyBibG9ja3MgYW5kXG4gICAgLy8gc2hhcmVkIGNvbXBvbmVudHMgY2FuIHJlc29sdmUgQHdvcmRwcmVzcy8qIGFuZCBAMTB1cC8qIGltcG9ydHMuXG4gICAgZW5zdXJlQ29udGVudERlcGVuZGVuY2llcyhjb250ZW50Um9vdCk7XG4gICAgXG4gICAgLy8gRG93bmxvYWQgb3IgY29weSBtYWluLmNzcyBhbmQgbWFpbi5qcyBkZXNpZ24gc3lzdGVtIGFzc2V0c1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5OhIFN5bmNpbmcgZGVzaWduIHN5c3RlbSBhc3NldHMuLi5gKTtcbiAgICBjb25zdCBhc3NldHNEaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnLi4nLCAnYXNzZXRzJyk7XG4gICAgY29uc3QgYXNzZXRzQ3NzRGlyID0gcGF0aC5qb2luKGFzc2V0c0RpciwgJ2NzcycpO1xuICAgIGNvbnN0IGFzc2V0c0pzRGlyID0gcGF0aC5qb2luKGFzc2V0c0RpciwgJ2pzJyk7XG5cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXNzZXRzQ3NzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGFzc2V0c0Nzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhhc3NldHNKc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhhc3NldHNKc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoY3R4LCBwYXRoLnJlc29sdmUob3V0cHV0RGlyLCAnLi4nKSwgY29uZmlnKTtcbiAgICB9IGVsc2UgaWYgKGNvbmZpZy5jb21waWxlcj8uc3R5bGVNb2RlICE9PSAndGFpbHdpbmQnICYmIGNvbmZpZy5jb21waWxlcj8uc3luY0Rlc2lnblN5c3RlbUFzc2V0cyAhPT0gZmFsc2UpIHtcbiAgICAgIGNvbnN0IGNzc1VybCA9IGAke2N0eC5hcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihhc3NldHNDc3NEaXIsICdtYWluLmNzcycpO1xuICAgICAgY29uc3QgY3NzRG93bmxvYWRlZCA9IGF3YWl0IGN0eERvd25sb2FkRmlsZShjdHgsIGNzc1VybCwgY3NzUGF0aCk7XG4gICAgICBpZiAoY3NzRG93bmxvYWRlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pyFIGFzc2V0cy9jc3MvbWFpbi5jc3NgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5jc3MgZnJvbSAke2Nzc1VybH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QganNVcmwgPSBgJHtjdHguYXBpVXJsfS9hcGkvY29tcG9uZW50L21haW4uanNgO1xuICAgICAgY29uc3QganNQYXRoID0gcGF0aC5qb2luKGFzc2V0c0pzRGlyLCAnbWFpbi5qcycpO1xuICAgICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwganNVcmwsIGpzUGF0aCk7XG4gICAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgYXNzZXRzL2pzL21haW4uanNgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgICAg4pqg77iPICBDb3VsZCBub3QgZG93bmxvYWQgbWFpbi5qcyBmcm9tICR7anNVcmx9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNvbmZpZy5lZGl0b3I/LnNjb3BlRGVzaWduU3lzdGVtICE9PSBmYWxzZSkge1xuICAgICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgU2NvcGluZyBkZXNpZ24gc3lzdGVtIENTUyBmb3IgYmxvY2sgZWRpdG9yLi4uYCk7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBzY29wZURlc2lnblN5c3RlbUZvckVkaXRvcihwYXRoLnJlc29sdmUob3V0cHV0RGlyLCAnLi4nKSwgY29uZmlnLmVkaXRvcik7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGAgICDimqDvuI8gIEVkaXRvciBDU1Mgc2NvcGluZyBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycn1gLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGBcXG7inKggQ29tcGlsYXRpb24gY29tcGxldGUhYCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBTdWNjZXNzOiAke3N1Y2Nlc3N9YCk7XG4gICAgaWYgKGZhaWxlZCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinYwgRmFpbGVkOiAke2ZhaWxlZH1gKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGdyb3VwQnVja2V0cykubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIPCflIAgTWVyZ2VkIGdyb3VwczogJHtPYmplY3Qua2V5cyhncm91cEJ1Y2tldHMpLmxlbmd0aH1gKTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coYFxcbkRvbid0IGZvcmdldCB0byBydW4gJ25wbSBydW4gYnVpbGQnIGluIHlvdXIgYmxvY2tzIHBsdWdpbi5cXG5gKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG7inYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1cXG5gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29tcGlsZSB0aGVtZSB0ZW1wbGF0ZXMgKGhlYWRlciwgZm9vdGVyKVxuICovXG5jb25zdCBjb21waWxlVGhlbWUgPSBhc3luYyAoY3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQsIG91dHB1dERpcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn46oIFRoZW1lIFRlbXBsYXRlIENvbXBpbGVyYCk7XG4gIGNvbnNvbGUubG9nKGAgICBBUEk6ICR7Y3R4LmFwaVVybH1gKTtcbiAgaWYgKGN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke2N0eC5sb2NhbEFwaVJvb3R9IChsb2NhbClgKTtcbiAgfVxuICBjb25zb2xlLmxvZyhgICAgT3V0cHV0OiAke291dHB1dERpcn1gKTtcbiAgaWYgKGN0eC5hdXRoPy51c2VybmFtZSkge1xuICAgIGNvbnNvbGUubG9nKGAgICBBdXRoOiAke2N0eC5hdXRoLnVzZXJuYW1lfWApO1xuICB9XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gQ29tcGlsZSBoZWFkZXJcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyBoZWFkZXIgY29tcG9uZW50Li4uYCk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhlYWRlciA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgJ2hlYWRlcicpO1xuICAgICAgY29uc29sZS5sb2coYCAgIEZvdW5kOiAke2hlYWRlci50aXRsZX1cXG5gKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKame+4jyAgR2VuZXJhdGluZyBoZWFkZXIucGhwLi4uYCk7XG4gICAgICBjb25zdCBoZWFkZXJQaHAgPSBnZW5lcmF0ZUhlYWRlclBocChoZWFkZXIpO1xuICAgICAgY29uc3QgZm9ybWF0dGVkSGVhZGVyID0gYXdhaXQgZm9ybWF0Q29kZShoZWFkZXJQaHAsICdwaHAnKTtcbiAgICAgIFxuICAgICAgY29uc3QgaGVhZGVyUGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsICdoZWFkZXIucGhwJyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGhlYWRlclBhdGgsIGZvcm1hdHRlZEhlYWRlcik7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZDogJHtoZWFkZXJQYXRofVxcbmApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgSGVhZGVyIGNvbXBvbmVudCBub3QgZm91bmQgb3IgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbXBpbGUgZm9vdGVyXG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgZm9vdGVyIGNvbXBvbmVudC4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmb290ZXIgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsICdmb290ZXInKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtmb290ZXIudGl0bGV9XFxuYCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDimpnvuI8gIEdlbmVyYXRpbmcgZm9vdGVyLnBocC4uLmApO1xuICAgICAgY29uc3QgZm9vdGVyUGhwID0gZ2VuZXJhdGVGb290ZXJQaHAoZm9vdGVyKTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZEZvb3RlciA9IGF3YWl0IGZvcm1hdENvZGUoZm9vdGVyUGhwLCAncGhwJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGZvb3RlclBhdGggPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCAnZm9vdGVyLnBocCcpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhmb290ZXJQYXRoLCBmb3JtYXR0ZWRGb290ZXIpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7Zm9vdGVyUGF0aH1cXG5gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIEZvb3RlciBjb21wb25lbnQgbm90IGZvdW5kIG9yIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgIH1cbiAgICBcbiAgICAvLyBBbHNvIHRyeSBoZWFkZXItY29tcGFjdCBhbmQgZm9vdGVyLWNvbXBhY3QgaWYgdGhleSBleGlzdFxuICAgIC8vIFRoZXNlIGdvIGludG8gdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8gc3ViZm9sZGVyXG4gICAgY29uc3QgaGFuZG9mZlRlbXBsYXRlc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICd0ZW1wbGF0ZS1wYXJ0cycsICdoYW5kb2ZmJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGhhbmRvZmZUZW1wbGF0ZXNEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoaGFuZG9mZlRlbXBsYXRlc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGdlbmVyYXRlZFRlbXBsYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgWydoZWFkZXItY29tcGFjdCcsICdoZWFkZXItbGFuZGVyJywgJ2Zvb3Rlci1jb21wYWN0J10pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgdmFyaWFudCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OhIEZvdW5kOiAke2NvbXBvbmVudC50aXRsZX1gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlVHlwZSA9IHZhcmlhbnQucmVwbGFjZSgvLS9nLCAnXycpO1xuICAgICAgICBjb25zdCBpc0hlYWRlciA9IHZhcmlhbnQuc3RhcnRzV2l0aCgnaGVhZGVyJyk7XG4gICAgICAgIGNvbnN0IHBocCA9IGlzSGVhZGVyIFxuICAgICAgICAgID8gZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAoY29tcG9uZW50LCB0ZW1wbGF0ZVR5cGUpXG4gICAgICAgICAgOiBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocChjb21wb25lbnQsIHRlbXBsYXRlVHlwZSk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZFBocCA9IGF3YWl0IGZvcm1hdENvZGUocGhwLCAncGhwJyk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihoYW5kb2ZmVGVtcGxhdGVzRGlyLCBgJHt2YXJpYW50fS5waHBgKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgZm9ybWF0dGVkUGhwKTtcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQ6ICR7ZmlsZVBhdGh9XFxuYCk7XG4gICAgICAgIGdlbmVyYXRlZFRlbXBsYXRlcy5wdXNoKGAke3ZhcmlhbnR9LnBocGApO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIFZhcmlhbnQgZG9lc24ndCBleGlzdCwgc2tpcCBzaWxlbnRseVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBHZW5lcmF0ZSBSRUFETUUgZm9yIHRoZSBoYW5kb2ZmIHRlbXBsYXRlcyBmb2xkZXJcbiAgICBpZiAoZ2VuZXJhdGVkVGVtcGxhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHJlYWRtZUNvbnRlbnQgPSBgIyBIYW5kb2ZmIFRlbXBsYXRlIFBhcnRzXG5cbj4g4pqg77iPICoqRE8gTk9UIEVESVQgVEhFU0UgRklMRVMgRElSRUNUTFkqKlxuPlxuPiBUaGVzZSBmaWxlcyBhcmUgYXV0b21hdGljYWxseSBnZW5lcmF0ZWQgYnkgdGhlIEhhbmRvZmYgV29yZFByZXNzIGNvbXBpbGVyLlxuPiBBbnkgY2hhbmdlcyB3aWxsIGJlIG92ZXJ3cml0dGVuIG9uIHRoZSBuZXh0IHN5bmMuXG5cbiMjIFNvdXJjZVxuXG5UaGVzZSB0ZW1wbGF0ZXMgd2VyZSB0cmFuc3BpbGVkIGZyb20gdGhlIEhhbmRvZmYgZGVzaWduIHN5c3RlbS5cblxuLSAqKkFQSSBVUkw6KiogJHtjdHguYXBpVXJsfVxuLSAqKkdlbmVyYXRlZDoqKiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1cblxuIyMgRmlsZXNcblxuJHtnZW5lcmF0ZWRUZW1wbGF0ZXMubWFwKGYgPT4gYC0gXFxgJHtmfVxcYGApLmpvaW4oJ1xcbicpfVxuXG4jIyBVc2FnZVxuXG5JbmNsdWRlIHRoZXNlIHRlbXBsYXRlIHBhcnRzIGluIHlvdXIgdGhlbWUgdXNpbmc6XG5cblxcYFxcYFxcYHBocFxuPD9waHAgZ2V0X3RlbXBsYXRlX3BhcnQoJ3RlbXBsYXRlLXBhcnRzL2hhbmRvZmYvaGVhZGVyLWNvbXBhY3QnKTsgPz5cbjw/cGhwIGdldF90ZW1wbGF0ZV9wYXJ0KCd0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmL2Zvb3Rlci1jb21wYWN0Jyk7ID8+XG5cXGBcXGBcXGBcblxuIyMgUmVnZW5lcmF0aW5nXG5cblRvIHJlZ2VuZXJhdGUgdGhlc2UgZmlsZXMsIHJ1bjpcblxuXFxgXFxgXFxgYmFzaFxubnB4IGhhbmRvZmYtd3AgLS10aGVtZVxuXFxgXFxgXFxgXG5cbk9yIHdpdGggYSBzcGVjaWZpYyBBUEkgVVJMOlxuXG5cXGBcXGBcXGBiYXNoXG5ucHggaGFuZG9mZi13cCAtLXRoZW1lIC0tYXBpLXVybCAke2N0eC5hcGlVcmx9XG5cXGBcXGBcXGBcbmA7XG4gICAgICBjb25zdCByZWFkbWVQYXRoID0gcGF0aC5qb2luKGhhbmRvZmZUZW1wbGF0ZXNEaXIsICdSRUFETUUubWQnKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVhZG1lUGF0aCwgcmVhZG1lQ29udGVudCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBHZW5lcmF0ZWQ6ICR7cmVhZG1lUGF0aH1cXG5gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRG93bmxvYWQgb3IgY29weSBtYWluLmNzcyBhbmQgbWFpbi5qcyBhc3NldHNcbiAgICBjb25zb2xlLmxvZyhg8J+ToSBGZXRjaGluZyB0aGVtZSBhc3NldHMuLi5gKTtcbiAgICBcbiAgICAvLyBFbnN1cmUgYXNzZXRzIGRpcmVjdG9yaWVzIGV4aXN0XG4gICAgY29uc3QgY3NzRGlyID0gcGF0aC5qb2luKG91dHB1dERpciwgJ2Fzc2V0cycsICdjc3MnKTtcbiAgICBjb25zdCBqc0RpciA9IHBhdGguam9pbihvdXRwdXREaXIsICdhc3NldHMnLCAnanMnKTtcbiAgICBcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoY3NzRGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGNzc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhqc0RpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhqc0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIFxuICAgIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGN0eCwgb3V0cHV0RGlyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRG93bmxvYWQgbWFpbi5jc3NcbiAgICAgIGNvbnN0IGNzc1VybCA9IGAke2N0eC5hcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5jc3NgO1xuICAgICAgY29uc3QgY3NzUGF0aCA9IHBhdGguam9pbihjc3NEaXIsICdtYWluLmNzcycpO1xuICAgICAgY29uc29sZS5sb2coYCAgIERvd25sb2FkaW5nIG1haW4uY3NzLi4uYCk7XG4gICAgICBjb25zdCBjc3NEb3dubG9hZGVkID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwgY3NzVXJsLCBjc3NQYXRoKTtcbiAgICAgIGlmIChjc3NEb3dubG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZDogJHtjc3NQYXRofWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIENvdWxkIG5vdCBkb3dubG9hZCBtYWluLmNzcyBmcm9tICR7Y3NzVXJsfWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBEb3dubG9hZCBtYWluLmpzXG4gICAgICBjb25zdCBqc1VybCA9IGAke2N0eC5hcGlVcmx9L2FwaS9jb21wb25lbnQvbWFpbi5qc2A7XG4gICAgICBjb25zdCBqc1BhdGggPSBwYXRoLmpvaW4oanNEaXIsICdtYWluLmpzJyk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRG93bmxvYWRpbmcgbWFpbi5qcy4uLmApO1xuICAgICAgY29uc3QganNEb3dubG9hZGVkID0gYXdhaXQgY3R4RG93bmxvYWRGaWxlKGN0eCwganNVcmwsIGpzUGF0aCk7XG4gICAgICBpZiAoanNEb3dubG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZDogJHtqc1BhdGh9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyAgQ291bGQgbm90IGRvd25sb2FkIG1haW4uanMgZnJvbSAke2pzVXJsfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgXFxu4pyoIFRoZW1lIHRlbXBsYXRlcyBnZW5lcmF0ZWQhXFxuYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlIGEgc2luZ2xlIGNvbXBvbmVudCBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlc1xuICovXG5jb25zdCB2YWxpZGF0ZSA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgb3V0cHV0RGlyOiBzdHJpbmcsIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IFByb21pc2U8VmFsaWRhdGlvblJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nIENvbXBvbmVudDogJHtjb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coYCAgIE1hbmlmZXN0OiAke291dHB1dERpcn1cXG5gKTtcbiAgXG4gIC8vIEZldGNoIGNvbXBvbmVudFxuICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIGNvbXBvbmVudE5hbWUpO1xuICBcbiAgLy8gTG9hZCBtYW5pZmVzdFxuICBjb25zdCBtYW5pZmVzdCA9IGxvYWRNYW5pZmVzdChvdXRwdXREaXIpO1xuICBcbiAgLy8gVmFsaWRhdGVcbiAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVDb21wb25lbnQoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gIFxuICAvLyBPdXRwdXQgcmVzdWx0XG4gIGNvbnNvbGUubG9nKGZvcm1hdFZhbGlkYXRpb25SZXN1bHQocmVzdWx0KSk7XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhbGwgY29tcG9uZW50cyBmb3IgYnJlYWtpbmcgcHJvcGVydHkgY2hhbmdlc1xuICovXG5jb25zdCB2YWxpZGF0ZUFsbCA9IGFzeW5jIChjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCwgb3V0cHV0RGlyOiBzdHJpbmcsIGltcG9ydENvbmZpZzogSW1wb3J0Q29uZmlnKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5SNIFZhbGlkYXRpbmcgQWxsIENvbXBvbmVudHNgKTtcbiAgY29uc29sZS5sb2coYCAgIEFQSTogJHtjdHguYXBpVXJsfWApO1xuICBpZiAoY3R4LmxvY2FsQXBpUm9vdCkge1xuICAgIGNvbnNvbGUubG9nKGAgICBTb3VyY2U6ICR7Y3R4LmxvY2FsQXBpUm9vdH0gKGxvY2FsKWApO1xuICB9XG4gIGNvbnNvbGUubG9nKGAgICBNYW5pZmVzdDogJHtvdXRwdXREaXJ9XFxuYCk7XG4gIFxuICB0cnkge1xuICAgIC8vIEZldGNoIGNvbXBvbmVudCBsaXN0XG4gICAgY29uc29sZS5sb2coYPCfk6EgRmV0Y2hpbmcgY29tcG9uZW50IGxpc3QuLi5gKTtcbiAgICBjb25zdCBjb21wb25lbnRJZHMgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudExpc3QoY3R4LCBpbXBvcnRDb25maWcpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHNcXG5gKTtcbiAgICBcbiAgICAvLyBMb2FkIG1hbmlmZXN0XG4gICAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgICBcbiAgICBsZXQgdmFsaWQgPSAwO1xuICAgIGxldCBpbnZhbGlkID0gMDtcbiAgICBsZXQgbmV3Q29tcG9uZW50cyA9IDA7XG4gICAgY29uc3QgYnJlYWtpbmdDaGFuZ2VzOiBWYWxpZGF0aW9uUmVzdWx0W10gPSBbXTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudElkIG9mIGNvbXBvbmVudElkcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBjb21wb25lbnRJZCk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlQ29tcG9uZW50KGNvbXBvbmVudCwgbWFuaWZlc3QpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coZm9ybWF0VmFsaWRhdGlvblJlc3VsdChyZXN1bHQpKTtcbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgICBcbiAgICAgICAgaWYgKHJlc3VsdC5pc05ldykge1xuICAgICAgICAgIG5ld0NvbXBvbmVudHMrKztcbiAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgIHZhbGlkKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaW52YWxpZCsrO1xuICAgICAgICAgIGJyZWFraW5nQ2hhbmdlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gdmFsaWRhdGUgJHtjb21wb25lbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcn1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU3VtbWFyeVxuICAgIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gICAgY29uc29sZS5sb2coYPCfk4ogVmFsaWRhdGlvbiBTdW1tYXJ5YCk7XG4gICAgY29uc29sZS5sb2coYCAgIOKchSBWYWxpZDogJHt2YWxpZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4p2MIEJyZWFraW5nIENoYW5nZXM6ICR7aW52YWxpZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyoIE5ldyBDb21wb25lbnRzOiAke25ld0NvbXBvbmVudHN9YCk7XG4gICAgXG4gICAgaWYgKGJyZWFraW5nQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pqg77iPICBXQVJOSU5HOiAke2JyZWFraW5nQ2hhbmdlcy5sZW5ndGh9IGNvbXBvbmVudChzKSBoYXZlIGJyZWFraW5nIGNoYW5nZXMhYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgVGhlc2UgY2hhbmdlcyBtYXkgYnJlYWsgZXhpc3RpbmcgV29yZFByZXNzIGNvbnRlbnQuXFxuYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgQ29tcG9uZW50cyB3aXRoIGJyZWFraW5nIGNoYW5nZXM6YCk7XG4gICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiBicmVha2luZ0NoYW5nZXMpIHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIC0gJHtyZXN1bHQuY29tcG9uZW50VGl0bGV9ICgke3Jlc3VsdC5jb21wb25lbnRJZH0pYCk7XG4gICAgICB9XG4gICAgICBjb25zb2xlLmxvZyhgXFxuICAgVG8gcHJvY2VlZCBhbnl3YXksIGNvbXBpbGUgd2l0aCAtLWZvcmNlIGZsYWcuXFxuYCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7inKggQWxsIGNvbXBvbmVudHMgdmFsaWRhdGVkIHN1Y2Nlc3NmdWxseSFcXG5gKTtcbiAgICB9XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59O1xuXG4vKipcbiAqIFVwZGF0ZSBtYW5pZmVzdCBhZnRlciBzdWNjZXNzZnVsIGNvbXBpbGF0aW9uXG4gKi9cbmNvbnN0IHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50ID0gKG91dHB1dERpcjogc3RyaW5nLCBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiB2b2lkID0+IHtcbiAgY29uc3QgbWFuaWZlc3QgPSBsb2FkTWFuaWZlc3Qob3V0cHV0RGlyKTtcbiAgY29uc3QgdXBkYXRlZE1hbmlmZXN0ID0gdXBkYXRlTWFuaWZlc3QoY29tcG9uZW50LCBtYW5pZmVzdCk7XG4gIHNhdmVNYW5pZmVzdChvdXRwdXREaXIsIHVwZGF0ZWRNYW5pZmVzdCk7XG59O1xuXG4vKipcbiAqIFdhdGNoIGxvY2FsIEhhbmRvZmYgYHB1YmxpYy9hcGlgIG91dHB1dCBhbmQgcmVjb21waWxlIGJsb2NrcyAvIHN5bmMgYnVuZGxlcy5cbiAqL1xuY29uc3QgcnVuV2F0Y2hNb2RlID0gYXN5bmMgKFxuICBjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCxcbiAgb3V0cHV0RGlyOiBzdHJpbmcsXG4gIG9ubHlDb21wb25lbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICBydW5PcHRzOiB7IGZvcmNlPzogYm9vbGVhbiB9LFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IHJvb3QgPSBjdHgubG9jYWxBcGlSb290ITtcbiAgY29uc3QgY29udGVudFJvb3QgPSBwYXRoLnJlc29sdmUob3V0cHV0RGlyLCAnLi4nKTtcbiAgY29uc29sZS5sb2coYFxcbvCfkYAgV2F0Y2ggbW9kZWApO1xuICBjb25zb2xlLmxvZyhgICAgU291cmNlOiAke3Jvb3R9YCk7XG4gIGNvbnNvbGUubG9nKGAgICBCbG9ja3M6ICR7b3V0cHV0RGlyfVxcbmApO1xuXG4gIGxldCBkZWJUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG4gIGNvbnN0IHNjaGVkdWxlID0gKGZuOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSA9PiB7XG4gICAgaWYgKGRlYlRpbWVyKSBjbGVhclRpbWVvdXQoZGViVGltZXIpO1xuICAgIGRlYlRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB2b2lkIGZuKCkuY2F0Y2goKGVycikgPT4gY29uc29sZS5lcnJvcignW3dhdGNoXScsIGVycikpO1xuICAgIH0sIDE1MCk7XG4gIH07XG5cbiAgY29uc3QgY29tcGlsZU9uZSA9IGFzeW5jIChzdGVtOiBzdHJpbmcpID0+IHtcbiAgICBpZiAoc3RlbSA9PT0gJ2NvbXBvbmVudHMnKSByZXR1cm47XG4gICAgY29uc29sZS5sb2coYFxcblt3YXRjaF0gUmVjb21waWxpbmcgJHtzdGVtfS4uLmApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIHN0ZW0pO1xuICAgICAgY29uc3QgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgICAgfVxuICAgICAgaWYgKGNvbXBvbmVudC5ncm91cCkge1xuICAgICAgICBjb25zdCBncm91cEtleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoY29tcG9uZW50Lmdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICBpZiAoZ3JvdXBLZXkpIHtcbiAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgY3R4RmV0Y2hBbGxDb21wb25lbnRzTGlzdChjdHgpO1xuICAgICAgICAgIGNvbnN0IGdyb3VwTWF0Y2hlcyA9IGFsbENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBncm91cEtleS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgZnVsbEdyb3VwQ29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdID0gW107XG4gICAgICAgICAgZm9yIChjb25zdCBjIG9mIGdyb3VwTWF0Y2hlcykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgZnVsbCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGN0eCwgYy5pZCk7XG4gICAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVmFsaWRhdGlvbiA9IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMoZnVsbCk7XG4gICAgICAgICAgICAgIGlmICghdGVtcGxhdGVWYWxpZGF0aW9uLmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjLmlkfSAodGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQpYCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgZnVsbEdyb3VwQ29tcG9uZW50cy5wdXNoKGZ1bGwpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIC8vIHNraXBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZ1bGxHcm91cENvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwKGN0eCwgb3V0cHV0RGlyLCBncm91cEtleSwgZnVsbEdyb3VwQ29tcG9uZW50cyk7XG4gICAgICAgICAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGN0eCwgY29udGVudFJvb3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFydW5PcHRzLmZvcmNlKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlKGN0eCwgb3V0cHV0RGlyLCBzdGVtKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgIGNvbnNvbGUud2FybihgW3dhdGNoXSBTa2lwcGluZyAke3N0ZW19OiBicmVha2luZyBjaGFuZ2VzIChyZS1ydW4gd2l0aCAtLWZvcmNlIHRvIGNvbXBpbGUgYW55d2F5KWApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgY29tcGlsZSh7XG4gICAgICAgIGFwaVVybDogY3R4LmFwaVVybCxcbiAgICAgICAgb3V0cHV0RGlyLFxuICAgICAgICBjb21wb25lbnROYW1lOiBzdGVtLFxuICAgICAgICBhdXRoOiBjdHguYXV0aCxcbiAgICAgICAgbG9jYWxBcGlSb290OiByb290LFxuICAgICAgfSk7XG4gICAgICBjb25zdCBjb21wID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoY3R4LCBzdGVtKTtcbiAgICAgIHVwZGF0ZU1hbmlmZXN0Rm9yQ29tcG9uZW50KG91dHB1dERpciwgY29tcCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihgW3dhdGNoXSBGYWlsZWQgJHtzdGVtfTpgLCBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBlKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgcGF0dGVybnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChvbmx5Q29tcG9uZW50SWQpIHtcbiAgICBwYXR0ZXJucy5wdXNoKHBhdGguam9pbihyb290LCAnY29tcG9uZW50JywgYCR7b25seUNvbXBvbmVudElkfS5qc29uYCkpO1xuICB9IGVsc2Uge1xuICAgIHBhdHRlcm5zLnB1c2gocGF0aC5qb2luKHJvb3QsICdjb21wb25lbnQnLCAnKi5qc29uJykpO1xuICB9XG4gIHBhdHRlcm5zLnB1c2gocGF0aC5qb2luKHJvb3QsICdjb21wb25lbnQnLCAnbWFpbi5qcycpLCBwYXRoLmpvaW4ocm9vdCwgJ2NvbXBvbmVudCcsICdtYWluLmNzcycpKTtcblxuICBjb25zdCB3YXRjaGVyID0gY2hva2lkYXIud2F0Y2gocGF0dGVybnMsIHtcbiAgICBhd2FpdFdyaXRlRmluaXNoOiB7IHN0YWJpbGl0eVRocmVzaG9sZDogMTUwLCBwb2xsSW50ZXJ2YWw6IDUwIH0sXG4gICAgaWdub3JlSW5pdGlhbDogdHJ1ZSxcbiAgfSk7XG5cbiAgd2F0Y2hlci5vbignYWxsJywgKGV2ZW50LCBmaWxlUGF0aCkgPT4ge1xuICAgIGlmICghZmlsZVBhdGgpIHJldHVybjtcbiAgICBpZiAoIVsnYWRkJywgJ2NoYW5nZScsICd1bmxpbmsnXS5pbmNsdWRlcyhldmVudCkpIHJldHVybjtcbiAgICBjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShmaWxlUGF0aCk7XG4gICAgaWYgKGJhc2UgPT09ICdtYWluLmpzJyB8fCBiYXNlID09PSAnbWFpbi5jc3MnKSB7XG4gICAgICBzY2hlZHVsZShhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHN5bmNCdW5kbGVBc3NldHMoY3R4LCBjb250ZW50Um9vdCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbd2F0Y2hdIEJ1bmRsZSBhc3NldHMgc3luY2VkJyk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZpbGVQYXRoLmVuZHNXaXRoKCcuanNvbicpKSB7XG4gICAgICBjb25zdCBzdGVtID0gcGF0aC5iYXNlbmFtZShmaWxlUGF0aCwgJy5qc29uJyk7XG4gICAgICBpZiAob25seUNvbXBvbmVudElkICYmIHN0ZW0gIT09IG9ubHlDb21wb25lbnRJZCkgcmV0dXJuO1xuICAgICAgc2NoZWR1bGUoKCkgPT4gY29tcGlsZU9uZShzdGVtKSk7XG4gICAgfVxuICB9KTtcblxuICB3YXRjaGVyLm9uKCdyZWFkeScsICgpID0+IHtcbiAgICBjb25zb2xlLmxvZygnV2F0Y2hpbmcgZm9yIGNoYW5nZXMuIFByZXNzIEN0cmwrQyB0byBzdG9wLlxcbicpO1xuICB9KTtcblxuICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigoKSA9PiB7XG4gICAgLyoga2VlcCBwcm9jZXNzIGFsaXZlICovXG4gIH0pO1xufTtcblxuLy8gQ0xJIHNldHVwXG5wcm9ncmFtXG4gIC5uYW1lKCdndXRlbmJlcmctY29tcGlsZScpXG4gIC5kZXNjcmlwdGlvbignVHJhbnNwaWxlIEhhbmRvZmYgY29tcG9uZW50cyB0byBXb3JkUHJlc3MgR3V0ZW5iZXJnIGJsb2NrcyBhbmQgdGhlbWUgdGVtcGxhdGVzJylcbiAgLnZlcnNpb24oJzEuMC4wJyk7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBjb25maWcgZmlsZVxuICovXG5jb25zdCBpbml0Q29uZmlnID0gKG9wdHM6IHtcbiAgYXBpVXJsPzogc3RyaW5nO1xuICBvdXRwdXQ/OiBzdHJpbmc7XG4gIHRoZW1lRGlyPzogc3RyaW5nO1xuICB1c2VybmFtZT86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIGZvcmNlPzogYm9vbGVhbjtcbn0pOiB2b2lkID0+IHtcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBcbiAgLy8gQ2hlY2sgaWYgY29uZmlnIGFscmVhZHkgZXhpc3RzXG4gIGlmIChmcy5leGlzdHNTeW5jKGNvbmZpZ1BhdGgpICYmICFvcHRzLmZvcmNlKSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29uZmlnIGZpbGUgYWxyZWFkeSBleGlzdHM6ICR7Y29uZmlnUGF0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVXNlIC0tZm9yY2UgdG8gb3ZlcndyaXRlLlxcbmApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBcbiAgY29uc3QgbmV3Q29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7XG4gICAgYXBpVXJsOiBvcHRzLmFwaVVybCA/PyAnaHR0cHM6Ly95b3VyLWhhbmRvZmYtc2l0ZS5jb20nLFxuICAgIG91dHB1dDogb3B0cy5vdXRwdXQgPz8gJy4vZGVtby9wbHVnaW4vYmxvY2tzJyxcbiAgICB0aGVtZURpcjogb3B0cy50aGVtZURpciA/PyAnLi9kZW1vL3RoZW1lJyxcbiAgICB1c2VybmFtZTogb3B0cy51c2VybmFtZSA/PyAnJyxcbiAgICBwYXNzd29yZDogb3B0cy5wYXNzd29yZCA/PyAnJyxcbiAgfTtcbiAgXG4gIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkobmV3Q29uZmlnLCBudWxsLCAyKSArICdcXG4nKTtcbiAgXG4gIGNvbnNvbGUubG9nKGBcXG7inIUgQ3JlYXRlZCBjb25maWcgZmlsZTogJHtjb25maWdQYXRofWApO1xuICBjb25zb2xlLmxvZyhgXFxu8J+ThCBDb25maWd1cmF0aW9uOmApO1xuICBjb25zb2xlLmxvZyhgICAgYXBpVXJsOiAgICR7bmV3Q29uZmlnLmFwaVVybH1gKTtcbiAgY29uc29sZS5sb2coYCAgIG91dHB1dDogICAke25ld0NvbmZpZy5vdXRwdXR9YCk7XG4gIGNvbnNvbGUubG9nKGAgICB0aGVtZURpcjogJHtuZXdDb25maWcudGhlbWVEaXJ9YCk7XG4gIGlmIChuZXdDb25maWcudXNlcm5hbWUpIHtcbiAgICBjb25zb2xlLmxvZyhgICAgdXNlcm5hbWU6ICR7bmV3Q29uZmlnLnVzZXJuYW1lfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBwYXNzd29yZDogKioqKmApO1xuICB9XG4gIGNvbnNvbGUubG9nKGBcXG7wn5KhIEVkaXQgdGhpcyBmaWxlIHRvIGNvbmZpZ3VyZSB5b3VyIEhhbmRvZmYgQVBJIHNldHRpbmdzLlxcbmApO1xufTtcblxuLyoqXG4gKiBJbnRlcmFjdGl2ZSBwcm9tcHQgaGVscGVyXG4gKi9cbmNvbnN0IHByb21wdCA9IChxdWVzdGlvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc3QgcmVhZGxpbmUgPSByZXF1aXJlKCdyZWFkbGluZScpO1xuICBjb25zdCBybCA9IHJlYWRsaW5lLmNyZWF0ZUludGVyZmFjZSh7XG4gICAgaW5wdXQ6IHByb2Nlc3Muc3RkaW4sXG4gICAgb3V0cHV0OiBwcm9jZXNzLnN0ZG91dCxcbiAgfSk7XG4gIFxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBybC5xdWVzdGlvbihxdWVzdGlvbiwgKGFuc3dlcjogc3RyaW5nKSA9PiB7XG4gICAgICBybC5jbG9zZSgpO1xuICAgICAgcmVzb2x2ZShhbnN3ZXIudHJpbSgpKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBmb3IgeWVzL25vXG4gKi9cbmNvbnN0IHByb21wdFllc05vID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcbiAgY29uc3QgZGVmYXVsdFN0ciA9IGRlZmF1bHRWYWx1ZSA/ICdZL24nIDogJ3kvTic7XG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgJHtxdWVzdGlvbn0gWyR7ZGVmYXVsdFN0cn1dOiBgKTtcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gIHJldHVybiBhbnN3ZXIudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCd5Jyk7XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCB3aXRoIGNob2ljZXNcbiAqL1xuY29uc3QgcHJvbXB0Q2hvaWNlID0gYXN5bmMgKHF1ZXN0aW9uOiBzdHJpbmcsIGNob2ljZXM6IHN0cmluZ1tdLCBkZWZhdWx0SW5kZXg6IG51bWJlciA9IDApOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zb2xlLmxvZyhgXFxuJHtxdWVzdGlvbn1gKTtcbiAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGkpID0+IHtcbiAgICBjb25zdCBtYXJrZXIgPSBpID09PSBkZWZhdWx0SW5kZXggPyAnPicgOiAnICc7XG4gICAgY29uc29sZS5sb2coYCAgJHttYXJrZXJ9ICR7aSArIDF9LiAke2Nob2ljZX1gKTtcbiAgfSk7XG4gIFxuICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBwcm9tcHQoYEVudGVyIG51bWJlciBbJHtkZWZhdWx0SW5kZXggKyAxfV06IGApO1xuICBpZiAoYW5zd2VyID09PSAnJykgcmV0dXJuIGNob2ljZXNbZGVmYXVsdEluZGV4XTtcbiAgXG4gIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoYW5zd2VyLCAxMCkgLSAxO1xuICBpZiAoaW5kZXggPj0gMCAmJiBpbmRleCA8IGNob2ljZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGNob2ljZXNbaW5kZXhdO1xuICB9XG4gIHJldHVybiBjaG9pY2VzW2RlZmF1bHRJbmRleF07XG59O1xuXG4vKipcbiAqIEludGVyYWN0aXZlIHByb21wdCBmb3IgbXVsdGlwbGUgY2hvaWNlc1xuICovXG5jb25zdCBwcm9tcHRNdWx0aUNob2ljZSA9IGFzeW5jIChxdWVzdGlvbjogc3RyaW5nLCBjaG9pY2VzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcbiAgY29uc29sZS5sb2coYFxcbiR7cXVlc3Rpb259YCk7XG4gIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpKSA9PiB7XG4gICAgY29uc29sZS5sb2coYCAgJHtpICsgMX0uICR7Y2hvaWNlfWApO1xuICB9KTtcbiAgXG4gIGNvbnN0IGFuc3dlciA9IGF3YWl0IHByb21wdChgRW50ZXIgbnVtYmVycyBzZXBhcmF0ZWQgYnkgY29tbWFzIChlLmcuLCAxLDIsMykgb3IgJ2FsbCc6IGApO1xuICBpZiAoYW5zd2VyLnRvTG93ZXJDYXNlKCkgPT09ICdhbGwnKSByZXR1cm4gY2hvaWNlcztcbiAgaWYgKGFuc3dlciA9PT0gJycpIHJldHVybiBbY2hvaWNlc1swXV07XG4gIFxuICBjb25zdCBpbmRpY2VzID0gYW5zd2VyLnNwbGl0KCcsJykubWFwKHMgPT4gcGFyc2VJbnQocy50cmltKCksIDEwKSAtIDEpO1xuICByZXR1cm4gaW5kaWNlc1xuICAgIC5maWx0ZXIoaSA9PiBpID49IDAgJiYgaSA8IGNob2ljZXMubGVuZ3RoKVxuICAgIC5tYXAoaSA9PiBjaG9pY2VzW2ldKTtcbn07XG5cbi8qKlxuICogRmluZCBhbGwgYXJyYXkgcHJvcGVydGllcyBpbiBhIGNvbXBvbmVudFxuICovXG5jb25zdCBmaW5kQXJyYXlQcm9wZXJ0aWVzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSB9PiA9PiB7XG4gIGNvbnN0IGFycmF5czogQXJyYXk8eyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfT4gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICBcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgYXJyYXlzLnB1c2goeyBwYXRoLCBwcm9wZXJ0eSB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdHNcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgYXJyYXlzLnB1c2goLi4uZmluZEFycmF5UHJvcGVydGllcyhwcm9wZXJ0eS5wcm9wZXJ0aWVzLCBwYXRoKSk7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gYXJyYXlzO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBmaWVsZCBtYXBwaW5nIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIGFycmF5IGl0ZW0gcHJvcGVydGllc1xuICovXG5jb25zdCBzdWdnZXN0RmllbGRNYXBwaW5ncyA9IChpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPT4ge1xuICBjb25zdCBzdWdnZXN0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBcbiAgY29uc3QgbWFwUHJvcGVydHkgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpID0+IHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgY29uc3QgcGF0aCA9IHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbiAgICAgIFxuICAgICAgLy8gU3VnZ2VzdCBtYXBwaW5ncyBiYXNlZCBvbiBjb21tb24gcGF0dGVybnNcbiAgICAgIGNvbnN0IGxvd2VyS2V5ID0ga2V5LnRvTG93ZXJDYXNlKCk7XG4gICAgICBcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2ltYWdlJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3Bob3RvJykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3RodW1ibmFpbCcpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ2ZlYXR1cmVkX2ltYWdlJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkgPT09ICd0aXRsZScgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2hlYWRpbmcnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnbmFtZScpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfdGl0bGUnO1xuICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnZXhjZXJwdCcpIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdzdW1tYXJ5JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ2Rlc2NyaXB0aW9uJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9leGNlcnB0JztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2NvbnRlbnQnKSB8fCBsb3dlcktleS5pbmNsdWRlcygnYm9keScpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfY29udGVudCc7XG4gICAgICB9IGVsc2UgaWYgKGxvd2VyS2V5ID09PSAndXJsJyB8fCBsb3dlcktleSA9PT0gJ2hyZWYnIHx8IGxvd2VyS2V5LmluY2x1ZGVzKCdsaW5rJykpIHtcbiAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncGVybWFsaW5rJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2RhdGUnKSkge1xuICAgICAgICBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2RheScpKSB7XG4gICAgICAgICAgc3VnZ2VzdGlvbnNbcGF0aF0gPSAncG9zdF9kYXRlOmRheV9udW1lcmljJztcbiAgICAgICAgfSBlbHNlIGlmIChsb3dlcktleS5pbmNsdWRlcygnbW9udGgnKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTptb250aF9zaG9ydCc7XG4gICAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ3llYXInKSkge1xuICAgICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3Bvc3RfZGF0ZTp5ZWFyJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWdnZXN0aW9uc1twYXRoXSA9ICdwb3N0X2RhdGU6ZnVsbCc7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2F1dGhvcicpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ2F1dGhvci5uYW1lJztcbiAgICAgIH0gZWxzZSBpZiAobG93ZXJLZXkuaW5jbHVkZXMoJ2NhdGVnb3J5JykgfHwgbG93ZXJLZXkuaW5jbHVkZXMoJ3RhZycpKSB7XG4gICAgICAgIHN1Z2dlc3Rpb25zW3BhdGhdID0gJ3RheG9ub215OmNhdGVnb3J5JztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG5lc3RlZCBvYmplY3RzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgbWFwUHJvcGVydHkocHJvcC5wcm9wZXJ0aWVzLCBwYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBtYXBQcm9wZXJ0eShpdGVtUHJvcGVydGllcyk7XG4gIHJldHVybiBzdWdnZXN0aW9ucztcbn07XG5cbi8qKlxuICogSW50ZXJhY3RpdmUgd2l6YXJkIGZvciBjb25maWd1cmluZyBkeW5hbWljIGFycmF5c1xuICovXG5jb25zdCBjb25maWd1cmVEeW5hbWljQXJyYXlzID0gYXN5bmMgKFxuICBjdHg6IEhhbmRvZmZEYXRhQ29udGV4dCxcbiAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnNvbGUubG9nKGBcXG7wn6eZIER5bmFtaWMgQXJyYXkgQ29uZmlndXJhdGlvbiBXaXphcmRgKTtcbiAgY29uc29sZS5sb2coYCAgIENvbXBvbmVudDogJHtjb21wb25lbnROYW1lfWApO1xuICBjb25zb2xlLmxvZyhgICAgQVBJOiAke2N0eC5hcGlVcmx9YCk7XG4gIGlmIChjdHgubG9jYWxBcGlSb290KSB7XG4gICAgY29uc29sZS5sb2coYCAgIFNvdXJjZTogJHtjdHgubG9jYWxBcGlSb290fSAobG9jYWwpYCk7XG4gIH1cbiAgY29uc29sZS5sb2coJycpO1xuICBcbiAgLy8gRmV0Y2ggY29tcG9uZW50XG4gIGNvbnNvbGUubG9nKGDwn5OhIEZldGNoaW5nIGNvbXBvbmVudCBzdHJ1Y3R1cmUuLi5gKTtcbiAgbGV0IGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudDtcbiAgdHJ5IHtcbiAgICBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChjdHgsIGNvbXBvbmVudE5hbWUpO1xuICAgIGNvbnNvbGUubG9nKGAgICBGb3VuZDogJHtjb21wb25lbnQudGl0bGV9ICgke2NvbXBvbmVudC5pZH0pXFxuYCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgXFxu4p2MIEVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3J9XFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG4gIFxuICAvLyBGaW5kIGFycmF5IHByb3BlcnRpZXNcbiAgY29uc3QgYXJyYXlQcm9wcyA9IGZpbmRBcnJheVByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICBcbiAgaWYgKGFycmF5UHJvcHMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgTm8gYXJyYXkgcHJvcGVydGllcyBmb3VuZCBpbiB0aGlzIGNvbXBvbmVudC5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRHluYW1pYyBhcnJheXMgYXJlIG9ubHkgYXZhaWxhYmxlIGZvciBhcnJheS10eXBlIHByb3BlcnRpZXMuXFxuYCk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xuICB9XG4gIFxuICBjb25zb2xlLmxvZyhg8J+TiyBGb3VuZCAke2FycmF5UHJvcHMubGVuZ3RofSBhcnJheSBmaWVsZChzKTpgKTtcbiAgYXJyYXlQcm9wcy5mb3JFYWNoKChhcnIsIGkpID0+IHtcbiAgICBjb25zdCBpdGVtQ291bnQgPSBhcnIucHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgPyBPYmplY3Qua2V5cyhhcnIucHJvcGVydHkuaXRlbXMucHJvcGVydGllcykubGVuZ3RoIDogMDtcbiAgICBjb25zb2xlLmxvZyhgICAgJHtpICsgMX0uICR7YXJyLnBhdGh9ICgke2l0ZW1Db3VudH0gaXRlbSBwcm9wZXJ0aWVzKWApO1xuICB9KTtcbiAgXG4gIC8vIFNlbGVjdCB3aGljaCBhcnJheXMgdG8gY29uZmlndXJlXG4gIGNvbnN0IHNlbGVjdGVkQXJyYXlzID0gYXJyYXlQcm9wcy5sZW5ndGggPT09IDEgXG4gICAgPyBbYXJyYXlQcm9wc1swXV1cbiAgICA6IGF3YWl0IChhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNob2ljZXMgPSBhcnJheVByb3BzLm1hcChhID0+IGEucGF0aCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcHJvbXB0TXVsdGlDaG9pY2UoJ1doaWNoIGFycmF5KHMpIGRvIHlvdSB3YW50IHRvIGNvbmZpZ3VyZT8nLCBjaG9pY2VzKTtcbiAgICAgICAgcmV0dXJuIGFycmF5UHJvcHMuZmlsdGVyKGEgPT4gc2VsZWN0ZWQuaW5jbHVkZXMoYS5wYXRoKSk7XG4gICAgICB9KSgpO1xuICBcbiAgLy8gTG9hZCBleGlzdGluZyBjb25maWdcbiAgY29uc3QgY29uZmlnUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnaGFuZG9mZi13cC5jb25maWcuanNvbicpO1xuICBsZXQgZXhpc3RpbmdDb25maWc6IEhhbmRvZmZXcENvbmZpZyA9IHt9O1xuICBpZiAoZnMuZXhpc3RzU3luYyhjb25maWdQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICBleGlzdGluZ0NvbmZpZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsICd1dGYtOCcpKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIElnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEJ1aWxkIHRoZSBpbXBvcnQgY29uZmlnLCBwcmVzZXJ2aW5nIGV4aXN0aW5nIGVudHJpZXNcbiAgY29uc3QgaW1wb3J0Q29uZmlnOiBJbXBvcnRDb25maWcgPSBleGlzdGluZ0NvbmZpZy5pbXBvcnQgfHwgeyBlbGVtZW50OiBmYWxzZSB9O1xuICBpZiAoIWltcG9ydENvbmZpZy5ibG9jayB8fCB0eXBlb2YgaW1wb3J0Q29uZmlnLmJsb2NrID09PSAnYm9vbGVhbicpIHtcbiAgICBpbXBvcnRDb25maWcuYmxvY2sgPSB7fTtcbiAgfVxuICBjb25zdCBibG9ja0NvbmZpZyA9IGltcG9ydENvbmZpZy5ibG9jayBhcyBSZWNvcmQ8c3RyaW5nLCBDb21wb25lbnRJbXBvcnRDb25maWc+O1xuICBpZiAoIWJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gfHwgdHlwZW9mIGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gPT09ICdib29sZWFuJykge1xuICAgIGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gPSB7fTtcbiAgfVxuICBjb25zdCBjb21wb25lbnRGaWVsZENvbmZpZyA9IGJsb2NrQ29uZmlnW2NvbXBvbmVudC5pZF0gYXMgUmVjb3JkPHN0cmluZywgRmllbGRDb25maWc+O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVQb3N0c0FycmF5ID0gYXN5bmMgKGFycmF5UHJvcDogeyBwYXRoOiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfSk6IFByb21pc2U8RHluYW1pY0FycmF5Q29uZmlnPiA9PiB7XG4gICAgLy8gU2VsZWN0aW9uIG1vZGVcbiAgICBjb25zdCBzZWxlY3Rpb25Nb2RlID0gYXdhaXQgcHJvbXB0Q2hvaWNlKFxuICAgICAgJ0hvdyBzaG91bGQgdXNlcnMgc2VsZWN0IHBvc3RzPycsXG4gICAgICBbJ1F1ZXJ5IEJ1aWxkZXIgKGZpbHRlciBieSB0YXhvbm9teSwgb3JkZXIsIGV0Yy4pJywgJ01hbnVhbCBTZWxlY3Rpb24gKGhhbmQtcGljayBzcGVjaWZpYyBwb3N0cyknXSxcbiAgICAgIDBcbiAgICApO1xuICAgIGNvbnN0IGlzUXVlcnlNb2RlID0gc2VsZWN0aW9uTW9kZS5pbmNsdWRlcygnUXVlcnknKTtcblxuICAgIC8vIFBvc3QgdHlwZXNcbiAgICBjb25zb2xlLmxvZyhgXFxuRW50ZXIgYWxsb3dlZCBwb3N0IHR5cGVzIChjb21tYS1zZXBhcmF0ZWQpOmApO1xuICAgIGNvbnN0IHBvc3RUeXBlc0lucHV0ID0gYXdhaXQgcHJvbXB0KGBQb3N0IHR5cGVzIFtwb3N0XTogYCk7XG4gICAgY29uc3QgcG9zdFR5cGVzID0gcG9zdFR5cGVzSW5wdXRcbiAgICAgID8gcG9zdFR5cGVzSW5wdXQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICA6IFsncG9zdCddO1xuXG4gICAgLy8gTWF4IGl0ZW1zXG4gICAgY29uc3QgbWF4SXRlbXNJbnB1dCA9IGF3YWl0IHByb21wdChgTWF4aW11bSBpdGVtcyBbMTJdOiBgKTtcbiAgICBjb25zdCBtYXhJdGVtcyA9IG1heEl0ZW1zSW5wdXQgPyBwYXJzZUludChtYXhJdGVtc0lucHV0LCAxMCkgOiAxMjtcblxuICAgIC8vIFJlbmRlciBtb2RlXG4gICAgY29uc3QgcmVuZGVyTW9kZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdIb3cgc2hvdWxkIHBvc3RzIGJlIHJlbmRlcmVkPycsXG4gICAgICBbJ01hcHBlZCAoY29udmVydCBwb3N0IGZpZWxkcyB0byB0ZW1wbGF0ZSBzdHJ1Y3R1cmUpJywgJ1RlbXBsYXRlICh1c2UgYSBQSFAgdGVtcGxhdGUgZmlsZSknXSxcbiAgICAgIDBcbiAgICApO1xuICAgIGNvbnN0IGlzTWFwcGVkTW9kZSA9IHJlbmRlck1vZGUuaW5jbHVkZXMoJ01hcHBlZCcpO1xuXG4gICAgbGV0IGZpZWxkTWFwcGluZzogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGxldCB0ZW1wbGF0ZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIGlmIChpc01hcHBlZE1vZGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OKIEZpZWxkIE1hcHBpbmcgQ29uZmlndXJhdGlvbmApO1xuXG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBhcnJheVByb3AucHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXM7XG4gICAgICBpZiAoaXRlbVByb3BzKSB7XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gc3VnZ2VzdEZpZWxkTWFwcGluZ3MoaXRlbVByb3BzKTtcblxuICAgICAgICBjb25zb2xlLmxvZyhgXFxuSSdsbCBzdWdnZXN0IG1hcHBpbmdzIGJhc2VkIG9uIGZpZWxkIG5hbWVzLiBQcmVzcyBFbnRlciB0byBhY2NlcHQgb3IgdHlwZSBhIG5ldyB2YWx1ZS5gKTtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbkF2YWlsYWJsZSBzb3VyY2VzOmApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHBvc3RfdGl0bGUsIHBvc3RfZXhjZXJwdCwgcG9zdF9jb250ZW50LCBwZXJtYWxpbmssIHBvc3RfaWRgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBmZWF0dXJlZF9pbWFnZWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIHBvc3RfZGF0ZTpkYXksIHBvc3RfZGF0ZTptb250aF9zaG9ydCwgcG9zdF9kYXRlOnllYXIsIHBvc3RfZGF0ZTpmdWxsYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIC0gYXV0aG9yLm5hbWUsIGF1dGhvci51cmwsIGF1dGhvci5hdmF0YXJgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSB0YXhvbm9teTpjYXRlZ29yeSwgdGF4b25vbXk6cG9zdF90YWdgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSBtZXRhOmZpZWxkX25hbWVgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgLSAobGVhdmUgZW1wdHkgdG8gc2tpcClcXG5gKTtcblxuICAgICAgICBjb25zdCBmbGF0dGVuUHJvcHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHByZWZpeDogc3RyaW5nID0gJycpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgY29uc3QgcGF0aHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBwcmVmaXggPyBgJHtwcmVmaXh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICAgICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgcGF0aHMucHVzaCguLi5mbGF0dGVuUHJvcHMocHJvcC5wcm9wZXJ0aWVzLCBwKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXRocy5wdXNoKHApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcGF0aHM7XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZFBhdGggb2YgZmxhdHRlblByb3BzKGl0ZW1Qcm9wcykpIHtcbiAgICAgICAgICBjb25zdCBzdWdnZXN0aW9uID0gc3VnZ2VzdGlvbnNbZmllbGRQYXRoXSB8fCAnJztcbiAgICAgICAgICBjb25zdCBkZWZhdWx0U3RyID0gc3VnZ2VzdGlvbiA/IGAgWyR7c3VnZ2VzdGlvbn1dYCA6ICcnO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSBhd2FpdCBwcm9tcHQoYCAgJHtmaWVsZFBhdGh9JHtkZWZhdWx0U3RyfTogYCk7XG4gICAgICAgICAgY29uc3QgZmluYWxNYXBwaW5nID0gbWFwcGluZyB8fCBzdWdnZXN0aW9uO1xuICAgICAgICAgIGlmIChmaW5hbE1hcHBpbmcpIHtcbiAgICAgICAgICAgIGlmIChmaW5hbE1hcHBpbmcuc3RhcnRzV2l0aCgneycpKSB7XG4gICAgICAgICAgICAgIHRyeSB7IGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gSlNPTi5wYXJzZShmaW5hbE1hcHBpbmcpOyB9XG4gICAgICAgICAgICAgIGNhdGNoIHsgZmllbGRNYXBwaW5nW2ZpZWxkUGF0aF0gPSBmaW5hbE1hcHBpbmc7IH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpZWxkTWFwcGluZ1tmaWVsZFBhdGhdID0gZmluYWxNYXBwaW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBkZWZhdWx0VGVtcGxhdGUgPSBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2FycmF5UHJvcC5wYXRofS1pdGVtLnBocGA7XG4gICAgICB0ZW1wbGF0ZVBhdGggPSBhd2FpdCBwcm9tcHQoYFRlbXBsYXRlIHBhdGggWyR7ZGVmYXVsdFRlbXBsYXRlfV06IGApIHx8IGRlZmF1bHRUZW1wbGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBhcnJheUNvbmZpZzogRHluYW1pY0FycmF5Q29uZmlnID0ge1xuICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgIHBvc3RUeXBlcyxcbiAgICAgIHNlbGVjdGlvbk1vZGU6IGlzUXVlcnlNb2RlID8gJ3F1ZXJ5JyA6ICdtYW51YWwnLFxuICAgICAgbWF4SXRlbXMsXG4gICAgICByZW5kZXJNb2RlOiBpc01hcHBlZE1vZGUgPyAnbWFwcGVkJyA6ICd0ZW1wbGF0ZScsXG4gICAgfTtcbiAgICBpZiAoaXNNYXBwZWRNb2RlICYmIE9iamVjdC5rZXlzKGZpZWxkTWFwcGluZykubGVuZ3RoID4gMCkgYXJyYXlDb25maWcuZmllbGRNYXBwaW5nID0gZmllbGRNYXBwaW5nO1xuICAgIGlmICghaXNNYXBwZWRNb2RlICYmIHRlbXBsYXRlUGF0aCkgYXJyYXlDb25maWcudGVtcGxhdGVQYXRoID0gdGVtcGxhdGVQYXRoO1xuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgYXJyYXlDb25maWcuZGVmYXVsdFF1ZXJ5QXJncyA9IHtcbiAgICAgICAgcG9zdHNfcGVyX3BhZ2U6IE1hdGgubWluKG1heEl0ZW1zLCA2KSxcbiAgICAgICAgb3JkZXJieTogJ2RhdGUnLFxuICAgICAgICBvcmRlcjogJ0RFU0MnLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGFycmF5Q29uZmlnO1xuICB9O1xuXG4gIC8vIEhlbHBlcjogY29uZmlndXJlIGEgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyBpbnRlcmFjdGl2ZWx5XG4gIGNvbnN0IGNvbmZpZ3VyZUJyZWFkY3J1bWJzQXJyYXkgPSBhc3luYyAoKTogUHJvbWlzZTxCcmVhZGNydW1ic0FycmF5Q29uZmlnPiA9PiB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgIEJyZWFkY3J1bWJzIGFyZSBidWlsdCBhdXRvbWF0aWNhbGx5IGZyb20gdGhlIGN1cnJlbnQgcGFnZSBVUkwuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igd2lsbCBzaG93IGEgc2luZ2xlIGVuYWJsZS9kaXNhYmxlIHRvZ2dsZS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgYWN0aXZlIH1cXG5gKTtcbiAgICByZXR1cm4geyBhcnJheVR5cGU6ICdicmVhZGNydW1icycgfTtcbiAgfTtcblxuICAvLyBIZWxwZXI6IGNvbmZpZ3VyZSBhIFRheG9ub215QXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVUYXhvbm9teUFycmF5ID0gYXN5bmMgKCk6IFByb21pc2U8VGF4b25vbXlBcnJheUNvbmZpZz4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBUYXhvbm9teSB0ZXJtcyBhcmUgZmV0Y2hlZCBmcm9tIHRoZSBjdXJyZW50IHBvc3Qgc2VydmVyLXNpZGUuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igc2hvd3MgYSB0b2dnbGUgYW5kIGEgZHJvcGRvd24gdG8gY2hvb3NlIHRoZSB0YXhvbm9teS5gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgSXRlbXMgaGF2ZSB0aGUgc2hhcGU6IHsgbGFiZWwsIHVybCwgc2x1ZyB9XFxuYCk7XG5cbiAgICBjb25zb2xlLmxvZyhgRW50ZXIgdGhlIHRheG9ub215IHNsdWdzIGVkaXRvcnMgY2FuIGNob29zZSBmcm9tIChjb21tYS1zZXBhcmF0ZWQpOmApO1xuICAgIGNvbnN0IHRheG9ub215SW5wdXQgPSBhd2FpdCBwcm9tcHQoYFRheG9ub21pZXMgW3Bvc3RfdGFnLGNhdGVnb3J5XTogYCk7XG4gICAgY29uc3QgdGF4b25vbWllcyA9IHRheG9ub215SW5wdXRcbiAgICAgID8gdGF4b25vbXlJbnB1dC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgIDogWydwb3N0X3RhZycsICdjYXRlZ29yeSddO1xuXG4gICAgY29uc3QgbWF4SXRlbXNJbnB1dCA9IGF3YWl0IHByb21wdChgTWF4aW11bSB0ZXJtcyB0byBkaXNwbGF5ICgtMSA9IGFsbCkgWy0xXTogYCk7XG4gICAgY29uc3QgbWF4SXRlbXMgPSBtYXhJdGVtc0lucHV0ID8gcGFyc2VJbnQobWF4SXRlbXNJbnB1dCwgMTApIDogLTE7XG5cbiAgICBjb25zdCBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcgPSB7IGFycmF5VHlwZTogJ3RheG9ub215JywgdGF4b25vbWllcyB9O1xuICAgIGlmIChtYXhJdGVtcyA+IDApIGNvbmZpZy5tYXhJdGVtcyA9IG1heEl0ZW1zO1xuICAgIHJldHVybiBjb25maWc7XG4gIH07XG5cbiAgLy8gSGVscGVyOiBjb25maWd1cmUgYSBQYWdpbmF0aW9uQXJyYXlDb25maWcgaW50ZXJhY3RpdmVseVxuICBjb25zdCBjb25maWd1cmVQYWdpbmF0aW9uQXJyYXkgPSBhc3luYyAob3RoZXJBcnJheVBhdGhzOiBzdHJpbmdbXSk6IFByb21pc2U8UGFnaW5hdGlvbkFycmF5Q29uZmlnIHwgbnVsbD4gPT4ge1xuICAgIGNvbnNvbGUubG9nKGBcXG4gICBQYWdpbmF0aW9uIGxpbmtzIGFyZSBkZXJpdmVkIGF1dG9tYXRpY2FsbHkgZnJvbSBhIHNpYmxpbmcgcG9zdHMgYXJyYXkgcXVlcnkuYCk7XG4gICAgY29uc29sZS5sb2coYCAgIFRoZSBlZGl0b3Igc2hvd3MgYSBzaW5nbGUgZW5hYmxlL2Rpc2FibGUgdG9nZ2xlLmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBJdGVtcyBoYXZlIHRoZSBzaGFwZTogeyBsYWJlbCwgdXJsLCBhY3RpdmUgfVxcbmApO1xuXG4gICAgaWYgKG90aGVyQXJyYXlQYXRocy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICDimqDvuI8gIE5vIHNpYmxpbmcgYXJyYXlzIGZvdW5kIHRvIGNvbm5lY3QgdG8uIENvbmZpZ3VyZSBhIHBvc3RzIGFycmF5IGZpcnN0LmApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgbGV0IGNvbm5lY3RlZEZpZWxkOiBzdHJpbmc7XG4gICAgaWYgKG90aGVyQXJyYXlQYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICAgIGNvbm5lY3RlZEZpZWxkID0gb3RoZXJBcnJheVBhdGhzWzBdO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvbm5lY3RlZCB0bzogJHtjb25uZWN0ZWRGaWVsZH0gKG9ubHkgb3B0aW9uKWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjaG9pY2UgPSBhd2FpdCBwcm9tcHRDaG9pY2UoXG4gICAgICAgICdXaGljaCBwb3N0cyBhcnJheSBzaG91bGQgdGhpcyBwYWdpbmF0aW9uIGJlIGNvbm5lY3RlZCB0bz8nLFxuICAgICAgICBvdGhlckFycmF5UGF0aHMsXG4gICAgICAgIDBcbiAgICAgICk7XG4gICAgICBjb25uZWN0ZWRGaWVsZCA9IGNob2ljZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBhcnJheVR5cGU6ICdwYWdpbmF0aW9uJywgY29ubmVjdGVkRmllbGQgfTtcbiAgfTtcblxuICAvLyBDb25maWd1cmUgZWFjaCBzZWxlY3RlZCBhcnJheVxuICBmb3IgKGNvbnN0IGFycmF5UHJvcCBvZiBzZWxlY3RlZEFycmF5cykge1xuICAgIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gICAgY29uc29sZS5sb2coYFxcbuKame+4jyAgQ29uZmlndXJpbmc6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofVxcbmApO1xuXG4gICAgLy8gTGV0IHRoZSB1c2VyIGNob29zZSB0aGUgYXJyYXkgdHlwZVxuICAgIGNvbnN0IGFycmF5VHlwZUNob2ljZSA9IGF3YWl0IHByb21wdENob2ljZShcbiAgICAgICdXaGF0IGtpbmQgb2YgZGF0YSBzaG91bGQgdGhpcyBhcnJheSBjb250YWluPycsXG4gICAgICBbXG4gICAgICAgICdQb3N0cyDigJQgcXVlcnkgb3IgaGFuZC1waWNrIFdvcmRQcmVzcyBwb3N0cyAoZGVmYXVsdCknLFxuICAgICAgICAnQnJlYWRjcnVtYnMg4oCUIGF1dG8tZ2VuZXJhdGVkIHRyYWlsIGZyb20gY3VycmVudCBVUkwnLFxuICAgICAgICAnVGF4b25vbXkg4oCUIHRlcm1zIGF0dGFjaGVkIHRvIHRoZSBjdXJyZW50IHBvc3QnLFxuICAgICAgICAnUGFnaW5hdGlvbiDigJQgbGlua3MgZGVyaXZlZCBmcm9tIGEgc2libGluZyBwb3N0cyBhcnJheScsXG4gICAgICBdLFxuICAgICAgMFxuICAgICk7XG5cbiAgICBsZXQgYXJyYXlDb25maWc6IEZpZWxkQ29uZmlnIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ0JyZWFkY3J1bWJzJykpIHtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlQnJlYWRjcnVtYnNBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ1RheG9ub215JykpIHtcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlVGF4b25vbXlBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoYXJyYXlUeXBlQ2hvaWNlLnN0YXJ0c1dpdGgoJ1BhZ2luYXRpb24nKSkge1xuICAgICAgLy8gT2ZmZXIgdGhlIG90aGVyIGFscmVhZHktY29uZmlndXJlZCAob3IgeWV0LXRvLWJlLWNvbmZpZ3VyZWQpIGFycmF5IHBhdGhzIGFzIGNhbmRpZGF0ZXNcbiAgICAgIGNvbnN0IHNpYmxpbmcgPSBzZWxlY3RlZEFycmF5c1xuICAgICAgICAuZmlsdGVyKGEgPT4gYS5wYXRoICE9PSBhcnJheVByb3AucGF0aClcbiAgICAgICAgLm1hcChhID0+IGEucGF0aCk7XG4gICAgICBhcnJheUNvbmZpZyA9IGF3YWl0IGNvbmZpZ3VyZVBhZ2luYXRpb25BcnJheShzaWJsaW5nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUG9zdHNcbiAgICAgIGFycmF5Q29uZmlnID0gYXdhaXQgY29uZmlndXJlUG9zdHNBcnJheShhcnJheVByb3ApO1xuICAgIH1cblxuICAgIGlmIChhcnJheUNvbmZpZykge1xuICAgICAgY29tcG9uZW50RmllbGRDb25maWdbYXJyYXlQcm9wLnBhdGhdID0gYXJyYXlDb25maWc7XG4gICAgICBjb25zb2xlLmxvZyhgXFxu4pyFIENvbmZpZ3VyZWQ6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofSAoJHsoYXJyYXlDb25maWcgYXMgYW55KS5hcnJheVR5cGUgPz8gJ3Bvc3RzJ30pYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIFNraXBwZWQ6ICR7Y29tcG9uZW50LmlkfS4ke2FycmF5UHJvcC5wYXRofWApO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gVXBkYXRlIGNvbmZpZyBmaWxlIOKAlCByZW1vdmUgbGVnYWN5IGR5bmFtaWNBcnJheXMgaWYgcHJlc2VudFxuICBjb25zdCB7IGR5bmFtaWNBcnJheXM6IF9sZWdhY3lEeW5hbWljLCAuLi5yZXN0Q29uZmlnIH0gPSBleGlzdGluZ0NvbmZpZztcbiAgY29uc3QgbmV3Q29uZmlnOiBIYW5kb2ZmV3BDb25maWcgPSB7XG4gICAgLi4ucmVzdENvbmZpZyxcbiAgICBpbXBvcnQ6IGltcG9ydENvbmZpZyxcbiAgfTtcbiAgXG4gIGNvbnNvbGUubG9nKGBcXG4keyfilIAnLnJlcGVhdCg2MCl9YCk7XG4gIGNvbnNvbGUubG9nKGBcXG7wn5OEIENvbmZpZ3VyYXRpb24gUHJldmlldzpcXG5gKTtcbiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoeyBpbXBvcnQ6IGltcG9ydENvbmZpZyB9LCBudWxsLCAyKSk7XG4gIFxuICBjb25zdCBzaG91bGRTYXZlID0gYXdhaXQgcHJvbXB0WWVzTm8oJ1xcblNhdmUgdG8gaGFuZG9mZi13cC5jb25maWcuanNvbj8nLCB0cnVlKTtcbiAgXG4gIGlmIChzaG91bGRTYXZlKSB7XG4gICAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShuZXdDb25maWcsIG51bGwsIDIpICsgJ1xcbicpO1xuICAgIGNvbnNvbGUubG9nKGBcXG7inIUgU2F2ZWQgdG8gJHtjb25maWdQYXRofWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG7wn5KhIE5leHQgc3RlcHM6YCk7XG4gICAgY29uc29sZS5sb2coYCAgIDEuIFJ1bjogbnBtIHJ1biBkZXYgLS0gJHtjb21wb25lbnROYW1lfSAtLWZvcmNlYCk7XG4gICAgY29uc29sZS5sb2coYCAgIDIuIEJ1aWxkIHlvdXIgYmxvY2tzOiBjZCBkZW1vL3BsdWdpbiAmJiBucG0gcnVuIGJ1aWxkYCk7XG4gICAgY29uc29sZS5sb2coYCAgIDMuIFRlc3QgdGhlIGJsb2NrIGluIFdvcmRQcmVzc1xcbmApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbmZpZ3VyYXRpb24gbm90IHNhdmVkLiBDb3B5IHRoZSBKU09OIGFib3ZlIG1hbnVhbGx5IGlmIG5lZWRlZC5cXG5gKTtcbiAgfVxufTtcblxuLy8gQ29uZmlndXJlIGR5bmFtaWMgYXJyYXlzIGNvbW1hbmRcbnByb2dyYW1cbiAgLmNvbW1hbmQoJ2NvbmZpZ3VyZS1keW5hbWljIFtjb21wb25lbnRdJylcbiAgLmFsaWFzKCd3aXphcmQnKVxuICAuZGVzY3JpcHRpb24oJ0ludGVyYWN0aXZlIHdpemFyZCB0byBjb25maWd1cmUgZHluYW1pYyBhcnJheXMgZm9yIGEgY29tcG9uZW50JylcbiAgLm9wdGlvbignLWEsIC0tYXBpLXVybCA8dXJsPicsICdIYW5kb2ZmIEFQSSBiYXNlIFVSTCcpXG4gIC5vcHRpb24oJy11LCAtLXVzZXJuYW1lIDx1c2VybmFtZT4nLCAnQmFzaWMgYXV0aCB1c2VybmFtZScpXG4gIC5vcHRpb24oJy1wLCAtLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCcpXG4gIC5vcHRpb24oJy1sLCAtLWxpc3QnLCAnTGlzdCBhdmFpbGFibGUgY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkcycpXG4gIC5vcHRpb24oJy1zLCAtLXNvdXJjZSA8ZGlyPicsICdSZWFkIEhhbmRvZmYgcHVibGljL2FwaSBmcm9tIGRpc2sgaW5zdGVhZCBvZiBIVFRQJylcbiAgLmFjdGlvbihhc3luYyAoY29tcG9uZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRzOiB7XG4gICAgYXBpVXJsPzogc3RyaW5nO1xuICAgIHVzZXJuYW1lPzogc3RyaW5nO1xuICAgIHBhc3N3b3JkPzogc3RyaW5nO1xuICAgIGxpc3Q/OiBib29sZWFuO1xuICAgIHNvdXJjZT86IHN0cmluZztcbiAgfSkgPT4ge1xuICAgIGNvbnN0IGFwaVVybCA9IG9wdHMuYXBpVXJsID8/IGNvbmZpZy5hcGlVcmw7XG4gICAgY29uc3QgYXV0aDogQXV0aENyZWRlbnRpYWxzID0ge1xuICAgICAgdXNlcm5hbWU6IG9wdHMudXNlcm5hbWUgPz8gY29uZmlnLnVzZXJuYW1lLFxuICAgICAgcGFzc3dvcmQ6IG9wdHMucGFzc3dvcmQgPz8gY29uZmlnLnBhc3N3b3JkLFxuICAgIH07XG4gICAgY29uc3QgbG9jYWxBcGlSb290ID0gb3B0cy5zb3VyY2UgPyBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0cy5zb3VyY2UpIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGRhdGFDdHg6IEhhbmRvZmZEYXRhQ29udGV4dCA9IHsgYXBpVXJsLCBhdXRoLCBsb2NhbEFwaVJvb3QgfTtcbiAgICBcbiAgICAvLyBJZiBsaXN0aW5nIGNvbXBvbmVudHMsIHNob3cgY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkc1xuICAgIGlmIChvcHRzLmxpc3QgfHwgIWNvbXBvbmVudE5hbWUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5SNIEZldGNoaW5nIGNvbXBvbmVudCBsaXN0IGZyb20gJHthcGlVcmx9Li4uXFxuYCk7XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudElkcyA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50TGlzdChkYXRhQ3R4LCBjb25maWcuaW1wb3J0KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZldGNoIGVhY2ggY29tcG9uZW50IHRvIGZpbmQgb25lcyB3aXRoIGFycmF5IGZpZWxkc1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+TiyBGb3VuZCAke2NvbXBvbmVudElkcy5sZW5ndGh9IGNvbXBvbmVudHMuIENoZWNraW5nIGZvciBhcnJheSBmaWVsZHMuLi5cXG5gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHNXaXRoQXJyYXlzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGFycmF5czogc3RyaW5nW10gfT4gPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgaWQgb2YgY29tcG9uZW50SWRzKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGF3YWl0IGN0eEZldGNoQ29tcG9uZW50KGRhdGFDdHgsIGlkKTtcbiAgICAgICAgICAgIGNvbnN0IGFycmF5cyA9IGZpbmRBcnJheVByb3BlcnRpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgaWYgKGFycmF5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGNvbXBvbmVudHNXaXRoQXJyYXlzLnB1c2goe1xuICAgICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICAgIHRpdGxlOiBjb21wb25lbnQudGl0bGUsXG4gICAgICAgICAgICAgICAgYXJyYXlzOiBhcnJheXMubWFwKGEgPT4gYS5wYXRoKSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBTa2lwIGZhaWxlZCBjb21wb25lbnRzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoY29tcG9uZW50c1dpdGhBcnJheXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgTm8gY29tcG9uZW50cyB3aXRoIGFycmF5IGZpZWxkcyBmb3VuZC5cXG5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn6epIENvbXBvbmVudHMgd2l0aCBhcnJheSBmaWVsZHM6XFxuYCk7XG4gICAgICAgIGNvbXBvbmVudHNXaXRoQXJyYXlzLmZvckVhY2goKGMsIGkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtpICsgMX0uICR7Yy50aXRsZX0gKCR7Yy5pZH0pYCk7XG4gICAgICAgICAgYy5hcnJheXMuZm9yRWFjaChhID0+IGNvbnNvbGUubG9nKGAgICAgICDilJTilIAgJHthfWApKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBpZiAob3B0cy5saXN0KSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYFxcbvCfkqEgUnVuOiBucG0gcnVuIGRldiAtLSB3aXphcmQgPGNvbXBvbmVudC1pZD5cXG5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEludGVyYWN0aXZlIHNlbGVjdGlvblxuICAgICAgICBjb25zdCBjaG9pY2VzID0gY29tcG9uZW50c1dpdGhBcnJheXMubWFwKGMgPT4gYCR7Yy50aXRsZX0gKCR7Yy5pZH0pYCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcHJvbXB0Q2hvaWNlKCdcXG5TZWxlY3QgYSBjb21wb25lbnQgdG8gY29uZmlndXJlOicsIGNob2ljZXMsIDApO1xuICAgICAgICBjb25zdCBzZWxlY3RlZEluZGV4ID0gY2hvaWNlcy5pbmRleE9mKHNlbGVjdGVkKTtcbiAgICAgICAgY29tcG9uZW50TmFtZSA9IGNvbXBvbmVudHNXaXRoQXJyYXlzW3NlbGVjdGVkSW5kZXhdLmlkO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFxcbuKdjCBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yfVxcbmApO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGF3YWl0IGNvbmZpZ3VyZUR5bmFtaWNBcnJheXMoZGF0YUN0eCwgY29tcG9uZW50TmFtZSEpO1xuICB9KTtcblxuLy8gSW5pdCBjb21tYW5kXG5wcm9ncmFtXG4gIC5jb21tYW5kKCdpbml0JylcbiAgLmRlc2NyaXB0aW9uKCdDcmVhdGUgYSBoYW5kb2ZmLXdwLmNvbmZpZy5qc29uIGZpbGUgaW4gdGhlIGN1cnJlbnQgZGlyZWN0b3J5JylcbiAgLm9wdGlvbignLS1hcGktdXJsIDx1cmw+JywgJ0hhbmRvZmYgQVBJIGJhc2UgVVJMJylcbiAgLm9wdGlvbignLS1vdXRwdXQgPGRpcj4nLCAnT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzJylcbiAgLm9wdGlvbignLS10aGVtZS1kaXIgPGRpcj4nLCAnVGhlbWUgZGlyZWN0b3J5IGZvciBoZWFkZXIvZm9vdGVyIHRlbXBsYXRlcycpXG4gIC5vcHRpb24oJy0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lJylcbiAgLm9wdGlvbignLS1wYXNzd29yZCA8cGFzc3dvcmQ+JywgJ0Jhc2ljIGF1dGggcGFzc3dvcmQnKVxuICAub3B0aW9uKCctLWZvcmNlJywgJ092ZXJ3cml0ZSBleGlzdGluZyBjb25maWcgZmlsZScpXG4gIC5hY3Rpb24oKG9wdGlvbnMsIGNvbW1hbmQpID0+IHtcbiAgICAvLyBVc2Ugb3B0c1dpdGhHbG9iYWxzIHRvIGdldCBvcHRpb25zIGZyb20gYm90aCBzdWJjb21tYW5kIGFuZCBwYXJlbnRcbiAgICBjb25zdCBvcHRzID0gY29tbWFuZC5vcHRzV2l0aEdsb2JhbHMoKTtcbiAgICBpbml0Q29uZmlnKG9wdHMpO1xuICB9KTtcblxuLy8gRGVmYXVsdCBjb21tYW5kIGZvciBibG9ja3NcbnByb2dyYW1cbiAgLmFyZ3VtZW50KCdbY29tcG9uZW50XScsICdDb21wb25lbnQgbmFtZSB0byBjb21waWxlIG9yIHZhbGlkYXRlJylcbiAgLm9wdGlvbignLWEsIC0tYXBpLXVybCA8dXJsPicsIGBIYW5kb2ZmIEFQSSBiYXNlIFVSTCAoZGVmYXVsdDogJHtjb25maWcuYXBpVXJsfSlgKVxuICAub3B0aW9uKCctbywgLS1vdXRwdXQgPGRpcj4nLCBgT3V0cHV0IGRpcmVjdG9yeSBmb3IgYmxvY2tzIChkZWZhdWx0OiAke2NvbmZpZy5vdXRwdXR9KWApXG4gIC5vcHRpb24oJy0tYWxsJywgJ0NvbXBpbGUgYWxsIGF2YWlsYWJsZSBjb21wb25lbnRzJylcbiAgLm9wdGlvbignLS10aGVtZScsICdDb21waWxlIHRoZW1lIHRlbXBsYXRlcyAoaGVhZGVyLCBmb290ZXIpIHRvIHRoZW1lIGRpcmVjdG9yeScpXG4gIC5vcHRpb24oJy10LCAtLXRoZW1lLWRpciA8ZGlyPicsIGBUaGVtZSBkaXJlY3RvcnkgZm9yIGhlYWRlci9mb290ZXIgdGVtcGxhdGVzIChkZWZhdWx0OiAke2NvbmZpZy50aGVtZURpcn0pYClcbiAgLm9wdGlvbignLXUsIC0tdXNlcm5hbWUgPHVzZXJuYW1lPicsICdCYXNpYyBhdXRoIHVzZXJuYW1lIGZvciBIYW5kb2ZmIEFQSScpXG4gIC5vcHRpb24oJy1wLCAtLXBhc3N3b3JkIDxwYXNzd29yZD4nLCAnQmFzaWMgYXV0aCBwYXNzd29yZCBmb3IgSGFuZG9mZiBBUEknKVxuICAub3B0aW9uKCctLXZhbGlkYXRlJywgJ1ZhbGlkYXRlIGEgY29tcG9uZW50IGZvciBicmVha2luZyBwcm9wZXJ0eSBjaGFuZ2VzJylcbiAgLm9wdGlvbignLS12YWxpZGF0ZS1hbGwnLCAnVmFsaWRhdGUgYWxsIGNvbXBvbmVudHMgZm9yIGJyZWFraW5nIHByb3BlcnR5IGNoYW5nZXMnKVxuICAub3B0aW9uKCctLWZvcmNlJywgJ0ZvcmNlIGNvbXBpbGF0aW9uIGV2ZW4gd2l0aCBicmVha2luZyBjaGFuZ2VzJylcbiAgLm9wdGlvbignLXMsIC0tc291cmNlIDxkaXI+JywgJ1JlYWQgSGFuZG9mZiBwdWJsaWMvYXBpIGZyb20gZGlzayBpbnN0ZWFkIG9mIEhUVFAnKVxuICAub3B0aW9uKCctLXdhdGNoJywgJ1dhdGNoIC0tc291cmNlIGZvciBjaGFuZ2VzIChyZXF1aXJlcyAtLXNvdXJjZSknKVxuICAuYWN0aW9uKGFzeW5jIChjb21wb25lbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdHM6IHsgXG4gICAgYXBpVXJsPzogc3RyaW5nOyBcbiAgICBvdXRwdXQ/OiBzdHJpbmc7IFxuICAgIGFsbD86IGJvb2xlYW47IFxuICAgIHRoZW1lPzogYm9vbGVhbjtcbiAgICB0aGVtZURpcj86IHN0cmluZztcbiAgICB1c2VybmFtZT86IHN0cmluZztcbiAgICBwYXNzd29yZD86IHN0cmluZztcbiAgICB2YWxpZGF0ZT86IGJvb2xlYW47XG4gICAgdmFsaWRhdGVBbGw/OiBib29sZWFuO1xuICAgIGZvcmNlPzogYm9vbGVhbjtcbiAgICBzb3VyY2U/OiBzdHJpbmc7XG4gICAgd2F0Y2g/OiBib29sZWFuO1xuICB9KSA9PiB7XG4gICAgLy8gTWVyZ2UgQ0xJIG9wdGlvbnMgd2l0aCBjb25maWcgKENMSSB0YWtlcyBwcmVjZWRlbmNlKVxuICAgIGNvbnN0IGFwaVVybCA9IG9wdHMuYXBpVXJsID8/IGNvbmZpZy5hcGlVcmw7XG4gICAgY29uc3Qgb3V0cHV0ID0gb3B0cy5vdXRwdXQgPz8gY29uZmlnLm91dHB1dDtcbiAgICBjb25zdCB0aGVtZURpciA9IG9wdHMudGhlbWVEaXIgPz8gY29uZmlnLnRoZW1lRGlyO1xuICAgIGNvbnN0IGF1dGg6IEF1dGhDcmVkZW50aWFscyA9IHtcbiAgICAgIHVzZXJuYW1lOiBvcHRzLnVzZXJuYW1lID8/IGNvbmZpZy51c2VybmFtZSxcbiAgICAgIHBhc3N3b3JkOiBvcHRzLnBhc3N3b3JkID8/IGNvbmZpZy5wYXNzd29yZCxcbiAgICB9O1xuICAgIGNvbnN0IGxvY2FsQXBpUm9vdCA9IG9wdHMuc291cmNlID8gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdHMuc291cmNlKSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBkYXRhQ3R4OiBIYW5kb2ZmRGF0YUNvbnRleHQgPSB7IGFwaVVybCwgYXV0aCwgbG9jYWxBcGlSb290IH07XG5cbiAgICBpZiAob3B0cy53YXRjaCkge1xuICAgICAgaWYgKCFsb2NhbEFwaVJvb3QpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IC0td2F0Y2ggcmVxdWlyZXMgLS1zb3VyY2UgPGRpcj4gKHBhdGggdG8gSGFuZG9mZiBwdWJsaWMvYXBpKScpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICBpZiAob3B0cy52YWxpZGF0ZUFsbCB8fCBvcHRzLnZhbGlkYXRlIHx8IG9wdHMuYWxsIHx8IG9wdHMudGhlbWUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IC0td2F0Y2ggY2Fubm90IGJlIGNvbWJpbmVkIHdpdGggLS1hbGwsIC0tdGhlbWUsIC0tdmFsaWRhdGUsIG9yIC0tdmFsaWRhdGUtYWxsJyk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHJ1bldhdGNoTW9kZShkYXRhQ3R4LCBvdXRwdXQsIGNvbXBvbmVudE5hbWUsIHsgZm9yY2U6IG9wdHMuZm9yY2UgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIC8vIFZhbGlkYXRpb24gY29tbWFuZHNcbiAgICBpZiAob3B0cy52YWxpZGF0ZUFsbCkge1xuICAgICAgYXdhaXQgdmFsaWRhdGVBbGwoZGF0YUN0eCwgb3V0cHV0LCBjb25maWcuaW1wb3J0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgaWYgKG9wdHMudmFsaWRhdGUgJiYgY29tcG9uZW50TmFtZSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmFsaWRhdGUoZGF0YUN0eCwgb3V0cHV0LCBjb21wb25lbnROYW1lKTtcbiAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQgJiYgIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbuKaoO+4jyAgQ29tcG9uZW50IGhhcyBicmVha2luZyBjaGFuZ2VzLiBVc2UgLS1mb3JjZSB0byBjb21waWxlIGFueXdheS5cXG5gKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb21waWxhdGlvbiBjb21tYW5kc1xuICAgIGlmIChvcHRzLnRoZW1lKSB7XG4gICAgICBhd2FpdCBjb21waWxlVGhlbWUoZGF0YUN0eCwgdGhlbWVEaXIpO1xuICAgIH0gZWxzZSBpZiAob3B0cy5hbGwpIHtcbiAgICAgIC8vIFZhbGlkYXRlIGFsbCBmaXJzdCB1bmxlc3MgZm9yY2VkXG4gICAgICBpZiAoIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxcbvCflI0gUHJlLWNvbXBpbGF0aW9uIHZhbGlkYXRpb24uLi5cXG5gKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB2YWxpZGF0ZUFsbChkYXRhQ3R4LCBvdXRwdXQsIGNvbmZpZy5pbXBvcnQpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyB2YWxpZGF0ZUFsbCBleGl0cyB3aXRoIGNvZGUgMSBvbiBicmVha2luZyBjaGFuZ2VzXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBjb21waWxlQWxsKGRhdGFDdHgsIG91dHB1dCk7XG4gICAgICBcbiAgICAgIC8vIFVwZGF0ZSBtYW5pZmVzdCBhZnRlciBzdWNjZXNzZnVsIGNvbXBpbGF0aW9uXG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+TnSBVcGRhdGluZyBwcm9wZXJ0eSBtYW5pZmVzdC4uLmApO1xuICAgICAgY29uc3QgY29tcG9uZW50SWRzID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnRMaXN0KGRhdGFDdHgsIGNvbmZpZy5pbXBvcnQpO1xuICAgICAgZm9yIChjb25zdCBjb21wb25lbnRJZCBvZiBjb21wb25lbnRJZHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChkYXRhQ3R4LCBjb21wb25lbnRJZCk7XG4gICAgICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0LCBjb21wb25lbnQpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBTa2lwIGZhaWxlZCBjb21wb25lbnRzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgTWFuaWZlc3QgdXBkYXRlZFxcbmApO1xuICAgIH0gZWxzZSBpZiAoY29tcG9uZW50TmFtZSkge1xuICAgICAgLy8gQnVpbGQgbWVyZ2VkLWdyb3VwIGxvb2t1cCBvbmNlIGZvciB0aGlzIGJyYW5jaFxuICAgICAgY29uc3QgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgbW9kZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnLmdyb3VwcykpIHtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdtZXJnZWQnKSBtZXJnZWRHcm91cENvbmZpZ0tleUJ5TG93ZXIuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCBrZXkpO1xuICAgICAgfVxuXG4gICAgICAvLyBIZWxwZXI6IGNvbXBpbGUgYW4gZW50aXJlIG1lcmdlZCBncm91cCBieSBpdHMgY29uZmlnIGtleVxuICAgICAgY29uc3QgY29tcGlsZUdyb3VwQnlLZXkgPSBhc3luYyAoZ3JvdXBLZXk6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgY3R4RmV0Y2hBbGxDb21wb25lbnRzTGlzdChkYXRhQ3R4KTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBncm91cEtleS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICApO1xuICAgICAgICBpZiAoZ3JvdXBNYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBObyBjb21wb25lbnRzIGZvdW5kIGZvciBtZXJnZWQgZ3JvdXAgXCIke2dyb3VwS2V5fVwiLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmdWxsR3JvdXBDb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIGdyb3VwTWF0Y2hlcykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsID0gYXdhaXQgY3R4RmV0Y2hDb21wb25lbnQoZGF0YUN0eCwgYy5pZCk7XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVZhbGlkYXRpb24gPSB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzKGZ1bGwpO1xuICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCAgIOKaoO+4jyAgU2tpcHBpbmcgJHtjLmlkfSAodGVtcGxhdGUgdmFsaWRhdGlvbiBmYWlsZWQpYCk7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVsbEdyb3VwQ29tcG9uZW50cy5wdXNoKGZ1bGwpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgICAg4p2MIEZhaWxlZCB0byBmZXRjaCAke2MuaWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBlcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yOiBDb3VsZCBub3QgZmV0Y2ggYW55IGNvbXBvbmVudHMgZm9yIGdyb3VwIFwiJHtncm91cEtleX1cIi5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwKGRhdGFDdHgsIG91dHB1dCwgZ3JvdXBLZXksIGZ1bGxHcm91cENvbXBvbmVudHMpO1xuICAgICAgICBpZiAoZGF0YUN0eC5sb2NhbEFwaVJvb3QpIHtcbiAgICAgICAgICBhd2FpdCBzeW5jQnVuZGxlQXNzZXRzKGRhdGFDdHgsIHBhdGgucmVzb2x2ZShvdXRwdXQsICcuLicpKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pyFIEdyb3VwIFwiJHtncm91cEtleX1cIiBjb21waWxlZCAoJHtmdWxsR3JvdXBDb21wb25lbnRzLmxlbmd0aH0gdmFyaWFudHMpLlxcbmApO1xuICAgICAgfTtcblxuICAgICAgLy8gVHJ5IGNvbXBvbmVudCBmaXJzdCwgdGhlbiBmYWxsIGJhY2sgdG8gZ3JvdXAgKGUuZy4gXCJoZXJvXCIgLT4gSGVybyBtZXJnZWQgYmxvY2spXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnQgPSBhd2FpdCBjdHhGZXRjaENvbXBvbmVudChkYXRhQ3R4LCBjb21wb25lbnROYW1lKTtcblxuICAgICAgICAvLyBJZiB0aGlzIGNvbXBvbmVudCBiZWxvbmdzIHRvIGEgbWVyZ2VkIGdyb3VwLCBjb21waWxlIHRoZSB3aG9sZSBncm91cCBpbnN0ZWFkXG4gICAgICAgIGlmIChjb21wb25lbnQuZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCBncm91cEtleSA9IG1lcmdlZEdyb3VwQ29uZmlnS2V5QnlMb3dlci5nZXQoY29tcG9uZW50Lmdyb3VwLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgIGlmIChncm91cEtleSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgIFwiJHtjb21wb25lbnROYW1lfVwiIGJlbG9uZ3MgdG8gbWVyZ2VkIGdyb3VwIFwiJHtncm91cEtleX1cIiDigJQgY29tcGlsaW5nIGVudGlyZSBncm91cC5cXG5gKTtcbiAgICAgICAgICAgIGF3YWl0IGNvbXBpbGVHcm91cEJ5S2V5KGdyb3VwS2V5KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIW9wdHMuZm9yY2UpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB2YWxpZGF0ZShkYXRhQ3R4LCBvdXRwdXQsIGNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7imqDvuI8gIENvbXBvbmVudCBoYXMgYnJlYWtpbmcgY2hhbmdlcy4gVXNlIC0tZm9yY2UgdG8gY29tcGlsZSBhbnl3YXkuXFxuYCk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNvbXBpbGUoe1xuICAgICAgICAgIGFwaVVybCxcbiAgICAgICAgICBvdXRwdXREaXI6IG91dHB1dCxcbiAgICAgICAgICBjb21wb25lbnROYW1lLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgbG9jYWxBcGlSb290LFxuICAgICAgICB9KTtcbiAgICAgICAgdXBkYXRlTWFuaWZlc3RGb3JDb21wb25lbnQob3V0cHV0LCBjb21wb25lbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg8J+TnSBNYW5pZmVzdCB1cGRhdGVkXFxuYCk7XG4gICAgICB9IGNhdGNoIChjb21wb25lbnRFcnJvcikge1xuICAgICAgICAvLyBObyBjb21wb25lbnQgd2l0aCB0aGlzIG5hbWUg4oCTIHRyeSBhcyBncm91cFxuICAgICAgICBjb25zb2xlLmxvZyhgICAgTm8gY29tcG9uZW50IFwiJHtjb21wb25lbnROYW1lfVwiIGZvdW5kLCBjaGVja2luZyBncm91cHMuLi5cXG5gKTtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IGN0eEZldGNoQWxsQ29tcG9uZW50c0xpc3QoZGF0YUN0eCk7XG4gICAgICAgIGNvbnN0IG5hbWVMb3dlciA9IGNvbXBvbmVudE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXRjaGVzID0gYWxsQ29tcG9uZW50cy5maWx0ZXIoXG4gICAgICAgICAgKGMpID0+IGMuZ3JvdXAgJiYgYy5ncm91cC50b0xvd2VyQ2FzZSgpID09PSBuYW1lTG93ZXIsXG4gICAgICAgICk7XG4gICAgICAgIGlmIChncm91cE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3I6IE5vIGNvbXBvbmVudCBvciBncm91cCBmb3VuZCBmb3IgXCIke2NvbXBvbmVudE5hbWV9XCIuYCk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICAgICAgIENvbXBvbmVudCBmZXRjaDogJHtjb21wb25lbnRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gY29tcG9uZW50RXJyb3IubWVzc2FnZSA6IGNvbXBvbmVudEVycm9yfWApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBncm91cEtleSA9XG4gICAgICAgICAgbWVyZ2VkR3JvdXBDb25maWdLZXlCeUxvd2VyLmdldChuYW1lTG93ZXIpID8/IGdyb3VwTWF0Y2hlc1swXS5ncm91cDtcbiAgICAgICAgYXdhaXQgY29tcGlsZUdyb3VwQnlLZXkoZ3JvdXBLZXkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjogUGxlYXNlIHNwZWNpZnkgYSBjb21wb25lbnQgbmFtZSwgZ3JvdXAgbmFtZSwgdXNlIC0tYWxsIGZsYWcsIC0tdGhlbWUgZmxhZywgb3IgLS12YWxpZGF0ZS1hbGwgZmxhZycpO1xuICAgICAgY29uc29sZS5sb2coJ1xcblVzYWdlOicpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxjb21wb25lbnQtbmFtZT4gICBDb21waWxlIG9uZSBjb21wb25lbnQgKGUuZy4gaGVyby1hcnRpY2xlKScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIDxncm91cC1uYW1lPiAgICAgIE9yIGNvbXBpbGUgYSBtZXJnZWQgZ3JvdXAgKGUuZy4gaGVybyknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLWFsbCcpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdGhlbWUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBndXRlbmJlcmctY29tcGlsZSAtLXZhbGlkYXRlIGhlcm8tYXJ0aWNsZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIC0tdmFsaWRhdGUtYWxsJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBucHggZ3V0ZW5iZXJnLWNvbXBpbGUgLS1hbGwgLS1mb3JjZScpO1xuICAgICAgY29uc29sZS5sb2coJyAgbnB4IGd1dGVuYmVyZy1jb21waWxlIGhlcm8gLS1hcGktdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6NDAwMCAtLW91dHB1dCAuL2Jsb2NrcycpO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfSk7XG5cbnByb2dyYW0ucGFyc2UoKTtcblxuZXhwb3J0IHsgY29tcGlsZSwgZ2VuZXJhdGVCbG9jaywgaHR0cEZldGNoQ29tcG9uZW50IGFzIGZldGNoQ29tcG9uZW50IH07XG4iXX0=