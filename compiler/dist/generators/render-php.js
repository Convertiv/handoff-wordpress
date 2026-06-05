"use strict";
/**
 * Generates render.php for server-side rendering
 * Converts Handlebars templates to PHP
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReshapeJs = exports.buildReshapePhp = exports.generatePaginationArrayExtraction = exports.generateTaxonomyArrayExtraction = exports.generateBreadcrumbsArrayExtraction = exports.generateDynamicArrayExtraction = exports.generateAttributeExtraction = exports.getPhpDefaultValue = exports.arrayToPhp = exports.handlebarsToPhp = exports.generateRenderPhp = void 0;
const types_1 = require("../types");
const button_schema_1 = require("./button-schema");
const handlebars_to_jsx_1 = require("./handlebars-to-jsx");
/**
 * Convert JS array/object to PHP array syntax
 */
const arrayToPhp = (value) => {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (Array.isArray(value)) {
        const items = value.map(v => arrayToPhp(v)).join(', ');
        return `[${items}]`;
    }
    if (typeof value === 'object') {
        const pairs = Object.entries(value)
            .map(([k, v]) => `'${k}' => ${arrayToPhp(v)}`)
            .join(', ');
        return `[${pairs}]`;
    }
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "\\'")}'`;
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    return String(value);
};
exports.arrayToPhp = arrayToPhp;
/**
 * Get PHP default value for a property
 */
const getPhpDefaultValue = (property) => {
    switch (property.type) {
        case 'text':
        case 'richtext':
        case 'select':
            return `'${String(property.default ?? '').replace(/'/g, "\\'")}'`;
        case 'number':
            return String(property.default ?? 0);
        case 'boolean':
            return property.default ? 'true' : 'false';
        case 'image':
            return "['src' => '', 'alt' => '']";
        case 'video':
            if (property.default && typeof property.default === 'object' && !Array.isArray(property.default)) {
                return arrayToPhp({
                    src: '',
                    id: '',
                    poster: '',
                    type: '',
                    width: 0,
                    height: 0,
                    mime: '',
                    mimeType: '',
                    ...property.default,
                });
            }
            if (typeof property.default === 'string' && property.default) {
                return arrayToPhp({
                    src: property.default,
                    id: '',
                    poster: '',
                    type: '',
                    width: 0,
                    height: 0,
                    mime: '',
                    mimeType: '',
                });
            }
            return "['src' => '', 'id' => '', 'poster' => '', 'type' => '', 'width' => 0, 'height' => 0, 'mime' => '', 'mimeType' => '']";
        case 'link':
            return "['label' => '', 'url' => '', 'opensInNewTab' => false]";
        case 'button':
            return arrayToPhp((0, button_schema_1.getButtonDefault)(property));
        case 'object':
            if (property.default) {
                return arrayToPhp(property.default);
            }
            return '[]';
        case 'array':
            if (property.default || property.items?.default) {
                return arrayToPhp(property.default || property.items?.default || []);
            }
            return '[]';
        default:
            return "''";
    }
};
exports.getPhpDefaultValue = getPhpDefaultValue;
const toPhpSingleQuotedString = (value) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const handlebarsValueToPhpExpression = (templateValue) => {
    const tokenRegex = /\{\{\{?\s*([^}]+?)\s*\}\}\}?/g;
    const parts = [];
    let cursor = 0;
    let match;
    const pushLiteral = (literal) => {
        if (literal) {
            parts.push(toPhpSingleQuotedString(literal));
        }
    };
    while ((match = tokenRegex.exec(templateValue)) !== null) {
        pushLiteral(templateValue.slice(cursor, match.index));
        const expression = match[1].trim().replace(/^@root\./, '');
        if (expression.startsWith('properties.')) {
            const path = expression.replace('properties.', '').split('.');
            const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(path[0]);
            if (path.length === 1) {
                parts.push(`($${camelProp} ?? '')`);
            }
            else {
                const nestedAccess = path
                    .slice(1)
                    .map((segment) => `['${segment}']`)
                    .join('');
                parts.push(`($${camelProp}${nestedAccess} ?? '')`);
            }
        }
        else {
            parts.push(`''`);
        }
        cursor = match.index + match[0].length;
    }
    pushLiteral(templateValue.slice(cursor));
    return parts.length > 0 ? parts.join(' . ') : "''";
};
const buildWistiaAsset = (mediaSource) => {
    const wistiaPrefix = 'https://fast.wistia.com/embed/medias/';
    const wistiaSuffix = '.jsonp';
    if (mediaSource.startsWith(wistiaPrefix) && mediaSource.endsWith(wistiaSuffix)) {
        const mediaIdTemplate = mediaSource.slice(wistiaPrefix.length, -wistiaSuffix.length);
        const mediaIdExpression = handlebarsValueToPhpExpression(mediaIdTemplate);
        return {
            emptyCheckExpression: mediaIdExpression,
            urlExpression: `'${wistiaPrefix}' . ${mediaIdExpression} . '${wistiaSuffix}'`,
        };
    }
    const urlExpression = handlebarsValueToPhpExpression(mediaSource);
    return {
        emptyCheckExpression: urlExpression,
        urlExpression,
    };
};
const generateWistiaEnqueueCode = (template) => {
    const assets = new Map();
    let hasWistiaEmbed = false;
    const addAsset = (asset) => {
        const key = `${asset.emptyCheckExpression}::${asset.urlExpression}`;
        if (!assets.has(key)) {
            assets.set(key, asset);
        }
    };
    const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(template)) !== null) {
        const src = scriptMatch[1].trim();
        if (/fast\.wistia\.com\/assets\/external\/E-v1\.js/i.test(src)) {
            hasWistiaEmbed = true;
            continue;
        }
        if (/fast\.wistia\.com\/embed\/medias\//i.test(src)) {
            hasWistiaEmbed = true;
            addAsset(buildWistiaAsset(src));
        }
    }
    const asyncClassRegex = /wistia_async_([^\s"'<>]+)/g;
    let asyncClassMatch;
    while ((asyncClassMatch = asyncClassRegex.exec(template)) !== null) {
        hasWistiaEmbed = true;
        const mediaIdExpression = handlebarsValueToPhpExpression(asyncClassMatch[1]);
        addAsset({
            emptyCheckExpression: mediaIdExpression,
            urlExpression: `'https://fast.wistia.com/embed/medias/' . ${mediaIdExpression} . '.jsonp'`,
        });
    }
    if (!hasWistiaEmbed) {
        return '';
    }
    const lines = [
        "// Wistia embed assets",
        "wp_enqueue_script('wistia-ev1', 'https://fast.wistia.com/assets/external/E-v1.js', [], null, ['strategy' => 'async']);",
    ];
    Array.from(assets.values()).forEach((asset, index) => {
        const mediaVar = `$handoffWistiaMedia${index}`;
        lines.push(`${mediaVar} = ${asset.urlExpression};`);
        lines.push(`if (!empty(${asset.emptyCheckExpression})) {`);
        lines.push(`  wp_enqueue_script(sanitize_key('handoff-wistia-media-' . md5((string) ${mediaVar})), ${mediaVar}, [], null, ['strategy' => 'async']);`);
        lines.push('}');
    });
    return `${lines.join('\n')}\n`;
};
const stripWistiaScriptTags = (template) => template
    .replace(/\s*<script[^>]+src=["'][^"']*fast\.wistia\.com\/embed\/medias\/[^"']+["'][^>]*>\s*<\/script>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["']https:\/\/fast\.wistia\.com\/assets\/external\/E-v1\.js["'][^>]*>\s*<\/script>\s*/gi, '\n');
/**
 * Convert handlebars template to PHP
 */
const handlebarsToPhp = (template, properties, richtextProps = new Set()) => {
    let php = template;
    // Remove HTML wrapper if present
    php = php.replace(/<html[\s\S]*?<body[^>]*>/gi, '');
    php = php.replace(/<\/body>[\s\S]*?<\/html>/gi, '');
    php = php.replace(/<head>[\s\S]*?<\/head>/gi, '');
    php = php.replace(/\{\{\{?style\}\}\}?/g, '');
    php = php.replace(/\{\{\{?script\}\}\}?/g, '');
    // Remove HTML comments
    php = php.replace(/<!--[\s\S]*?-->/g, '');
    // Remove {{!-- comments --}}
    php = php.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
    php = php.replace(/\{\{![\s\S]*?\}\}/g, '');
    // Remove Handoff-specific {{#field}} blocks but keep their content
    // Use a global regex that handles various quote styles and whitespace
    // Remove Handoff-specific {{#field}} blocks but keep their content
    // Allow for whitespace variations like {{#field ...}}, {{ #field ...}}, {{/field}}, {{/field }}, {{ /field }}
    php = php.replace(/\{\{\s*#field\s+[^\}]+\}\}/gi, '');
    php = php.replace(/\{\{\s*\/field\s*\}\}/gi, '');
    // Normalize @root. references inside Handlebars expressions to root-level access.
    // In standard Handlebars, @root refers to the top-level data context regardless of
    // nesting depth, so @root.properties.xxx is equivalent to properties.xxx at the root.
    // We only replace inside {{...}} to avoid touching unrelated text content.
    php = php.replace(/\{\{[\s\S]*?\}\}/g, (match) => match.replace(/@root\./g, ''));
    // VERY EARLY: Convert {{#if (eq/ne xxx "value")}}...{{else}}...{{/if}} helper expressions
    // This MUST run before any other processing to ensure the complete block is captured
    // Helper to convert variable path to PHP for early helper processing
    const varToPhpVeryEarly = (varPath) => {
        if (varPath.startsWith('properties.')) {
            const parts = varPath.replace('properties.', '').split('.');
            const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
            if (parts.length > 1) {
                return `$${camelProp}['${parts.slice(1).join("']['")}']`;
            }
            return `$${camelProp}`;
        }
        else if (varPath.startsWith('this.')) {
            const field = varPath.replace('this.', '');
            if (field.includes('.')) {
                return `$item['${field.split('.').join("']['")}']`;
            }
            return `$item['${field}']`;
        }
        else {
            // For loop aliases at this early stage, we haven't tracked them yet
            // So we just use $item for any alias.field pattern
            const parts = varPath.split('.');
            if (parts.length > 1) {
                const fieldPath = parts.slice(1);
                return `$item['${fieldPath.join("']['")}']`;
            }
            return `$item['${varPath}']`;
        }
    };
    // Parse helper expression to PHP condition (very early)
    const parseHelperVeryEarly = (expr) => {
        // Match (eq left "right") - equals with quoted string
        const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (eqMatch) {
            const [, left, right] = eqMatch;
            const leftExpr = varToPhpVeryEarly(left);
            return `(${leftExpr} ?? '') === '${right}'`;
        }
        // Match (ne left "right") - not equals
        const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (neMatch) {
            const [, left, right] = neMatch;
            const leftExpr = varToPhpVeryEarly(left);
            return `(${leftExpr} ?? '') !== '${right}'`;
        }
        return null;
    };
    const findHelperIfBranches = (str, startPos, firstCondition) => {
        const branches = [{ condition: firstCondition, content: '' }];
        let depth = 1;
        let pos = startPos;
        let contentStart = startPos;
        const elseIfRegex = /\{\{else if\s+(\([^)]+\))\s*\}\}/g;
        while (pos < str.length && depth > 0) {
            const nextIf = str.indexOf('{{#if', pos);
            const nextEndif = str.indexOf('{{/if}}', pos);
            const nextElse = str.indexOf('{{else}}', pos);
            elseIfRegex.lastIndex = pos;
            const elseIfMatch = elseIfRegex.exec(str);
            const nextElseIf = elseIfMatch ? elseIfMatch.index : -1;
            const candidates = [
                { type: 'if', pos: nextIf },
                { type: 'endif', pos: nextEndif },
                { type: 'else', pos: nextElse },
                ...(nextElseIf !== -1 ? [{ type: 'elseif', pos: nextElseIf, expr: elseIfMatch[1], tagLen: elseIfMatch[0].length }] : [])
            ].filter(c => c.pos !== -1).sort((a, b) => a.pos - b.pos);
            if (candidates.length === 0)
                break;
            const closest = candidates[0];
            if (closest.type === 'if') {
                depth++;
                pos = closest.pos + 5;
            }
            else if (closest.type === 'endif') {
                depth--;
                if (depth === 0) {
                    branches[branches.length - 1].content = str.substring(contentStart, closest.pos);
                    return { branches, closePos: closest.pos };
                }
                pos = closest.pos + 7; // '{{/if}}'.length === 7
            }
            else if ((closest.type === 'elseif' || closest.type === 'else') && depth === 1) {
                const tagLen = closest.type === 'elseif' ? (closest.tagLen ?? 0) : 8;
                branches[branches.length - 1].content = str.substring(contentStart, closest.pos);
                branches.push({
                    condition: closest.type === 'elseif' ? closest.expr : null,
                    content: ''
                });
                contentStart = closest.pos + tagLen;
                pos = contentStart;
            }
            else {
                // Skip full tag when inside nested #if (e.g. skip {{else if (expr)}} so we find the outer {{/if}})
                const skipLen = closest.type === 'elseif' ? (closest.tagLen ?? 0) : 8;
                pos = closest.pos + skipLen;
            }
        }
        return null;
    };
    // VERY EARLY: Convert {{#unless (eq/ne ...)}} with else and without else
    // #unless is the negation of #if, so we invert the condition.
    php = php.replace(/\{\{#unless\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, helperExpr, unlessContent, elseContent) => {
        const phpCondition = parseHelperVeryEarly(helperExpr);
        if (phpCondition) {
            return `<?php if (!(${phpCondition})) : ?>${unlessContent}<?php else : ?>${elseContent}<?php endif; ?>`;
        }
        return `<?php if (true) : ?>${unlessContent}<?php else : ?>${elseContent}<?php endif; ?>`;
    });
    php = php.replace(/\{\{#unless\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, helperExpr, unlessContent) => {
        const phpCondition = parseHelperVeryEarly(helperExpr);
        if (phpCondition) {
            return `<?php if (!(${phpCondition})) : ?>${unlessContent}<?php endif; ?>`;
        }
        return `<?php if (true) : ?>${unlessContent}<?php endif; ?>`;
    });
    // Convert style with handlebars expressions
    // Keep 'src' as-is to match Handoff's image property naming
    php = php.replace(/style="background-image:url\('?\{\{+\s*properties\.(\w+)\.(\w+)\s*\}+\}'?\)"/g, (_, prop, field) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        return `<?php echo !empty($${camelProp}['${field}']) ? 'style="background-image:url(\\'' . esc_url($${camelProp}['${field}']) . '\\')"' : ''; ?>`;
    });
    // Track loop aliases for later reference conversion
    // Format: {{#each properties.xxx as |aliasName|}}
    const loopAliases = {};
    // Track nested loop aliases separately (these use $subItem instead of $item)
    const nestedLoopAliases = {};
    // Track nested loop depth for proper variable naming
    let nestedLoopDepth = 0;
    // Helper to get the loop item variable name based on depth
    const getLoopItemVar = (depth) => {
        if (depth === 0)
            return '$item';
        if (depth === 1)
            return '$subItem';
        return `$nested${depth}Item`;
    };
    const getLoopIndexVar = (depth) => {
        if (depth === 0)
            return '$index';
        if (depth === 1)
            return '$subIndex';
        return `$nested${depth}Index`;
    };
    const getLoopCountVar = (depth) => {
        if (depth === 0)
            return '$_loop_count';
        if (depth === 1)
            return '$_nested_loop_count';
        return `$_nested${depth}_loop_count`;
    };
    /** e.g. speakerStack.avatars + $item -> $item['speakerStack']['avatars'] */
    const dotPathToPhpAccess = (path, baseVar) => {
        const segments = path.split('.');
        const bracketAccess = segments.map((p) => `['${p}']`).join('');
        return `${baseVar}${bracketAccess}`;
    };
    const nestedEachOpenPhp = (arrayExpr, nestedAlias) => {
        if (nestedAlias) {
            nestedLoopAliases[nestedAlias] = arrayExpr;
        }
        return `<?php if (!empty(${arrayExpr}) && is_array(${arrayExpr})) : $_nested_loop_count = count(${arrayExpr}); foreach (${arrayExpr} as $subIndex => $subItem) : ?>`;
    };
    // First pass: identify all nested loop patterns and their aliases
    // We need to process loops in order to properly track nesting
    const eachPatterns = [];
    // Find all {{#each ...}} patterns
    const eachRegex = /\{\{#each\s+([^\}]+)\}\}/g;
    let eachMatch;
    while ((eachMatch = eachRegex.exec(php)) !== null) {
        const content = eachMatch[1].trim();
        let type;
        let arrayPath;
        let alias;
        let parentAlias;
        // Check for "as |alias|" syntax
        const asAliasMatch = content.match(/^(.+?)\s+as\s+\|(\w+)\|$/);
        if (asAliasMatch) {
            const pathPart = asAliasMatch[1].trim();
            alias = asAliasMatch[2];
            if (pathPart.startsWith('properties.')) {
                type = 'properties';
                arrayPath = pathPart.replace('properties.', '');
            }
            else if (pathPart.startsWith('this.')) {
                type = 'this';
                arrayPath = pathPart.replace('this.', '');
            }
            else if (pathPart.includes('.')) {
                // e.g., article.tags - first part is an alias from outer loop
                const parts = pathPart.split('.');
                parentAlias = parts[0];
                arrayPath = parts.slice(1).join('.');
                type = 'alias';
            }
            else {
                // Just a variable name, treat as alias reference
                type = 'alias';
                arrayPath = pathPart;
            }
        }
        else {
            // No alias syntax
            if (content.startsWith('properties.')) {
                type = 'properties';
                arrayPath = content.replace('properties.', '').split(/\s/)[0];
            }
            else if (content.startsWith('this.')) {
                type = 'this';
                arrayPath = content.replace('this.', '').split(/\s/)[0];
            }
            else if (content.includes('.')) {
                const parts = content.split('.');
                parentAlias = parts[0];
                arrayPath = parts.slice(1).join('.').split(/\s/)[0];
                type = 'alias';
            }
            else {
                type = 'alias';
                arrayPath = content.split(/\s/)[0];
            }
        }
        eachPatterns.push({
            match: eachMatch[0],
            type,
            arrayPath,
            alias,
            parentAlias,
            index: eachMatch.index
        });
    }
    // Track which aliases map to which nested depth
    const aliasToDepth = {};
    // Process loops from first to last (maintaining order)
    // Sort by index to process in order
    eachPatterns.sort((a, b) => a.index - b.index);
    // Track current nesting level as we process
    let currentDepth = -1;
    const openLoops = [];
    // Find {{/each}} positions
    const closeEachPositions = [];
    const closeEachRegex = /\{\{\/each\}\}/g;
    let closeMatch;
    while ((closeMatch = closeEachRegex.exec(php)) !== null) {
        closeEachPositions.push(closeMatch.index);
    }
    // Assign depth to each pattern based on position relative to other patterns and closes
    for (const pattern of eachPatterns) {
        // Count how many opens before this position
        const opensBefore = eachPatterns.filter(p => p.index < pattern.index).length;
        // Count how many closes before this position
        const closesBefore = closeEachPositions.filter(pos => pos < pattern.index).length;
        const depth = opensBefore - closesBefore;
        if (pattern.alias) {
            aliasToDepth[pattern.alias] = depth;
            loopAliases[pattern.alias] = pattern.arrayPath;
        }
    }
    // Helper to convert a property path like "jumpNav.links" to PHP variable access like "$jumpNav['links']"
    const propPathToPhp = (propPath) => {
        const parts = propPath.split('.');
        const camelFirst = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
        if (parts.length === 1) {
            return `$${camelFirst}`;
        }
        // For nested paths like jumpNav.links -> $jumpNav['links']
        const nestedPath = parts.slice(1).map(p => `'${p}'`).join('][');
        return `$${camelFirst}[${nestedPath}]`;
    };
    // Convert {{#each properties.xxx.yyy as |alias|}} or {{#each properties.xxx as |alias index|}} loops with named alias
    // Now handles nested paths like properties.jumpNav.links
    // The second parameter (index) is optional and ignored since we use $index in PHP
    // Also set $_loop_count for @last checking
    php = php.replace(/\{\{#each\s+properties\.([\w.]+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g, (_, propPath, alias) => {
        const phpVar = propPathToPhp(propPath);
        loopAliases[alias] = propPath;
        return `<?php if (!empty(${phpVar}) && is_array(${phpVar})) : $_loop_count = count(${phpVar}); foreach (${phpVar} as $index => $item) : ?>`;
    });
    // Convert {{#each properties.xxx}} or {{#each properties.xxx.yyy}} loops without alias
    // Now handles nested paths like properties.jumpNav.links
    // Also set $_loop_count for @last checking
    php = php.replace(/\{\{#each\s+properties\.([\w.]+)\s*\}\}/g, (_, propPath) => {
        const phpVar = propPathToPhp(propPath);
        return `<?php if (!empty(${phpVar}) && is_array(${phpVar})) : $_loop_count = count(${phpVar}); foreach (${phpVar} as $index => $item) : ?>`;
    });
    // Convert {{#each this.xxx.yyy as |alias|}} nested loops with alias (supports dotted paths)
    // The second parameter (index) is optional and ignored since we use $subIndex in PHP
    php = php.replace(/\{\{#each\s+this\.([\w.]+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g, (_, propPath, alias) => {
        nestedLoopAliases[alias] = propPath;
        return nestedEachOpenPhp(dotPathToPhpAccess(propPath, '$item'), alias);
    });
    // Convert {{#each this.xxx.yyy}} nested loops without alias
    php = php.replace(/\{\{#each\s+this\.([\w.]+)\s*\}\}/g, (_, propPath) => nestedEachOpenPhp(dotPathToPhpAccess(propPath, '$item')));
    // Convert {{#each alias.xxx.yyy as |nestedAlias|}} — nested loops referencing outer loop alias
    // e.g. {{#each card.speakerStack.avatars as |avatar|}} inside {{#each properties.cards as |card|}}
    php = php.replace(/\{\{#each\s+(\w+)\.([\w.]+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g, (match, parentAlias, propPath, nestedAlias) => {
        if (parentAlias === 'properties' || parentAlias === 'this') {
            return match;
        }
        return nestedEachOpenPhp(dotPathToPhpAccess(propPath, '$item'), nestedAlias);
    });
    // Convert {{#each alias.xxx.yyy}} — nested loops referencing outer loop alias without nested alias
    php = php.replace(/\{\{#each\s+(\w+)\.([\w.]+)\s*\}\}/g, (match, parentAlias, propPath) => {
        if (parentAlias === 'properties' || parentAlias === 'this') {
            return match;
        }
        return nestedEachOpenPhp(dotPathToPhpAccess(propPath, '$item'));
    });
    php = php.replace(/\{\{\/each\}\}/g, '<?php endforeach; endif; ?>');
    // IMPORTANT: Handle helper expression conditionals EARLY (before alias patterns convert parts of them)
    // This handles {{#if (eq alias.xxx "value")}}...{{else}}...{{/if}} patterns inside loops
    // Helper to convert a variable path to PHP expression for helper comparisons
    // Handles properties.xxx, this.xxx, and alias.xxx patterns
    const varToPhpEarly = (varPath) => {
        if (varPath.startsWith('properties.')) {
            const parts = varPath.replace('properties.', '').split('.');
            const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
            if (parts.length > 1) {
                return `$${camelProp}['${parts.slice(1).join("']['")}']`;
            }
            return `$${camelProp}`;
        }
        else if (varPath.startsWith('this.')) {
            const field = varPath.replace('this.', '');
            if (field.includes('.')) {
                return `$item['${field.split('.').join("']['")}']`;
            }
            return `$item['${field}']`;
        }
        else {
            // Check if the first part is a known loop alias
            const parts = varPath.split('.');
            if (parts.length > 1) {
                if (nestedLoopAliases[parts[0]] || (aliasToDepth[parts[0]] ?? -1) > 0) {
                    const fieldPath = parts.slice(1);
                    return `$subItem['${fieldPath.join("']['")}']`;
                }
                if (loopAliases[parts[0]]) {
                    const fieldPath = parts.slice(1);
                    return `$item['${fieldPath.join("']['")}']`;
                }
            }
            // Fallback
            if (varPath.includes('.')) {
                return `$item['${varPath.split('.').join("']['")}']`;
            }
            return `$item['${varPath}']`;
        }
    };
    // Parse helper expression to PHP condition
    const parseHelperEarly = (expr) => {
        // Match (eq left "right") - equals with quoted string
        const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (eqMatch) {
            const [, left, right] = eqMatch;
            const leftExpr = varToPhpEarly(left);
            return `(${leftExpr} ?? '') === '${right}'`;
        }
        // Match (ne left "right") - not equals
        const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (neMatch) {
            const [, left, right] = neMatch;
            const leftExpr = varToPhpEarly(left);
            return `(${leftExpr} ?? '') !== '${right}'`;
        }
        return null;
    };
    // Convert {{#if (eq ...)}} ... {{else if (eq ...)}} ... {{/if}} chains after loop aliases are known
    const helperIfElseIfRegex = /\{\{#if\s+(\([^)]+\))\s*\}\}/g;
    let helperIfElseIfMatch;
    while ((helperIfElseIfMatch = helperIfElseIfRegex.exec(php)) !== null) {
        const openPos = helperIfElseIfMatch.index;
        const openTagEnd = openPos + helperIfElseIfMatch[0].length;
        const firstCondition = helperIfElseIfMatch[1];
        const result = findHelperIfBranches(php, openTagEnd, firstCondition);
        if (result === null)
            continue;
        const { branches, closePos } = result;
        const parts = [];
        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];
            const phpCondition = branch.condition ? parseHelperEarly(branch.condition) : null;
            const cond = phpCondition ?? 'false';
            if (i === 0) {
                parts.push(`<?php if (${cond}) : ?>${branch.content}`);
            }
            else if (branch.condition !== null) {
                parts.push(`<?php elseif (${cond}) : ?>${branch.content}`);
            }
            else {
                parts.push(`<?php else : ?>${branch.content}`);
            }
        }
        parts.push('<?php endif; ?>');
        const replacement = parts.join('');
        php = php.substring(0, openPos) + replacement + php.substring(closePos + 7);
        helperIfElseIfRegex.lastIndex = openPos;
    }
    // Convert {{#if (eq/ne ...)}} helper expressions with if/else EARLY
    php = php.replace(/\{\{#if\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, helperExpr, ifContent, elseContent) => {
        const phpCondition = parseHelperEarly(helperExpr);
        if (phpCondition) {
            return `<?php if (${phpCondition}) : ?>${ifContent}<?php else : ?>${elseContent}<?php endif; ?>`;
        }
        return `<?php if (false) : ?>${ifContent}<?php else : ?>${elseContent}<?php endif; ?>`;
    });
    // Convert {{#if (eq/ne ...)}} helper expressions without else EARLY
    php = php.replace(/\{\{#if\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, helperExpr, ifContent) => {
        const phpCondition = parseHelperEarly(helperExpr);
        if (phpCondition) {
            return `<?php if (${phpCondition}) : ?>${ifContent}<?php endif; ?>`;
        }
        return `<?php if (false) : ?>${ifContent}<?php endif; ?>`;
    });
    // Convert {{#unless (eq/ne ...)}} helper expressions with else EARLY
    php = php.replace(/\{\{#unless\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, helperExpr, unlessContent, elseContent) => {
        const phpCondition = parseHelperEarly(helperExpr);
        if (phpCondition) {
            return `<?php if (!(${phpCondition})) : ?>${unlessContent}<?php else : ?>${elseContent}<?php endif; ?>`;
        }
        return `<?php if (true) : ?>${unlessContent}<?php else : ?>${elseContent}<?php endif; ?>`;
    });
    // Convert {{#unless (eq/ne ...)}} helper expressions without else EARLY
    php = php.replace(/\{\{#unless\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, helperExpr, unlessContent) => {
        const phpCondition = parseHelperEarly(helperExpr);
        if (phpCondition) {
            return `<?php if (!(${phpCondition})) : ?>${unlessContent}<?php endif; ?>`;
        }
        return `<?php if (true) : ?>${unlessContent}<?php endif; ?>`;
    });
    // IMPORTANT: Handle attribute-specific patterns FIRST before generic ones
    // Handle properties.xxx.yyy patterns FIRST, then alias patterns for loops
    // Convert src="{{properties.xxx.yyy}}" patterns (top-level nested properties)
    php = php.replace(/src="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g, (_, prop, field) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        return `src="<?php echo esc_url($${camelProp}['${field}'] ?? ''); ?>"`;
    });
    // Convert alt="{{properties.xxx.yyy}}" patterns
    php = php.replace(/alt="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g, (_, prop, field) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        return `alt="<?php echo esc_attr($${camelProp}['${field}'] ?? ''); ?>"`;
    });
    // Convert href="{{properties.xxx.yyy}}" patterns
    php = php.replace(/href="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g, (_, prop, field) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        return `href="<?php echo esc_url($${camelProp}['${field}'] ?? '#'); ?>"`;
    });
    // Now handle alias patterns for loops: src="{{alias.xxx.yyy}}", alt="{{alias.xxx.yyy}}", href="{{alias.xxx.yyy}}"
    // Convert src="{{alias.xxx.yyy}}" patterns (images in loops)
    php = php.replace(/src="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g, (match, alias, field1, field2) => {
        // Skip if already converted or if it's a properties pattern
        if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
            return match;
        }
        // Use $subItem for nested loop aliases, $item for top-level
        const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
        return `src="<?php echo esc_url(${itemVar}['${field1}']['${field2}'] ?? ''); ?>"`;
    });
    // Convert alt="{{alias.xxx.yyy}}" patterns
    php = php.replace(/alt="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g, (match, alias, field1, field2) => {
        if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
            return match;
        }
        // Use $subItem for nested loop aliases, $item for top-level
        const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
        return `alt="<?php echo esc_attr(${itemVar}['${field1}']['${field2}'] ?? ''); ?>"`;
    });
    // Convert href="{{alias.xxx.yyy}}" patterns (links in loops with nested fields)
    php = php.replace(/href="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g, (match, alias, field1, field2) => {
        if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
            return match;
        }
        // Use $subItem for nested loop aliases, $item for top-level
        const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
        return `href="<?php echo esc_url(${itemVar}['${field1}']['${field2}'] ?? ''); ?>"`;
    });
    // Convert {{alias.field.subfield}} and {{alias.field}} references from named loop variables
    // Must handle deeper nesting first (alias.field.subfield before alias.field)
    // IMPORTANT: Handle triple-brace (rich text) BEFORE double-brace patterns
    // Helper to convert a field path to PHP array access
    // e.g., "cta.link" -> "['cta']['link']"
    const fieldPathToPhpAccess = (fieldPath) => {
        const parts = fieldPath.split('.');
        return parts.map(p => `['${p}']`).join('');
    };
    // Process nested loop aliases FIRST (they use $subItem)
    for (const [alias] of Object.entries(nestedLoopAliases)) {
        // Handle {{{ alias.field }}} triple-brace patterns (rich text/HTML in nested loops)
        const aliasTripleRegex = new RegExp(`\\{\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}\\}`, 'g');
        php = php.replace(aliasTripleRegex, (_, field) => {
            return `<?php echo wp_kses_post($subItem['${field}'] ?? ''); ?>`;
        });
        // Handle {{#if alias.field.subfield...}} conditionals with deeply nested paths in nested loops
        // e.g., {{#if tag.cta.link}} -> <?php if (!empty($subItem['cta']['link'])) : ?>
        const aliasIfDeepRegex = new RegExp(`\\{\\{#if\\s+${alias}\\.([\\w.]+)\\s*\\}\\}`, 'g');
        php = php.replace(aliasIfDeepRegex, (_, fieldPath) => {
            const phpAccess = fieldPathToPhpAccess(fieldPath);
            return `<?php if (!empty($subItem${phpAccess})) : ?>`;
        });
        // Handle {{ alias.field.subfield... }} patterns with deeply nested paths in nested loops
        const aliasDeepRegex = new RegExp(`\\{\\{\\s*${alias}\\.([\\w.]+)\\s*\\}\\}`, 'g');
        php = php.replace(aliasDeepRegex, (_, fieldPath) => {
            const parts = fieldPath.split('.');
            const lastPart = parts[parts.length - 1];
            const escFunc = lastPart === 'url' || lastPart === 'src' || lastPart === 'href' ? 'esc_url' : 'esc_html';
            const phpAccess = fieldPathToPhpAccess(fieldPath);
            return `<?php echo ${escFunc}($subItem${phpAccess} ?? ''); ?>`;
        });
    }
    // Then process top-level loop aliases (they use $item)
    for (const [alias] of Object.entries(loopAliases)) {
        // Handle {{{ alias.field }}} triple-brace patterns (rich text/HTML in loops)
        const aliasTripleRegex = new RegExp(`\\{\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}\\}`, 'g');
        php = php.replace(aliasTripleRegex, (_, field) => {
            return `<?php echo wp_kses_post($item['${field}'] ?? ''); ?>`;
        });
        // Handle {{#if alias.field.subfield...}} conditionals with deeply nested paths
        // e.g., {{#if slide.cta.link}} -> <?php if (!empty($item['cta']['link'])) : ?>
        const aliasIfDeepRegex = new RegExp(`\\{\\{#if\\s+${alias}\\.([\\w.]+)\\s*\\}\\}`, 'g');
        php = php.replace(aliasIfDeepRegex, (_, fieldPath) => {
            const phpAccess = fieldPathToPhpAccess(fieldPath);
            return `<?php if (!empty($item${phpAccess})) : ?>`;
        });
        // Handle {{ alias.field.subfield... }} patterns with deeply nested paths
        const aliasDeepRegex = new RegExp(`\\{\\{\\s*${alias}\\.([\\w.]+)\\s*\\}\\}`, 'g');
        php = php.replace(aliasDeepRegex, (_, fieldPath) => {
            const parts = fieldPath.split('.');
            const lastPart = parts[parts.length - 1];
            const escFunc = lastPart === 'url' || lastPart === 'src' || lastPart === 'href' ? 'esc_url' : 'esc_html';
            const phpAccess = fieldPathToPhpAccess(fieldPath);
            return `<?php echo ${escFunc}($item${phpAccess} ?? ''); ?>`;
        });
    }
    // Convert {{#unless @first}} - show content for all items except the first
    php = php.replace(/\{\{#unless\s+@first\s*\}\}/g, `<?php if ($index > 0) : ?>`);
    // Convert {{#unless @last}} - show content for all items except the last
    // Uses $_loop_count set in the foreach loop
    php = php.replace(/\{\{#unless\s+@last\s*\}\}/g, `<?php if ($index < $_loop_count - 1) : ?>`);
    // Convert {{#if @first}} - show content only for the first item
    php = php.replace(/\{\{#if\s+@first\s*\}\}/g, `<?php if ($index === 0) : ?>`);
    // Convert {{#if @last}} - show content only for the last item
    // Uses $_loop_count set in the foreach loop
    php = php.replace(/\{\{#if\s+@last\s*\}\}/g, `<?php if ($index === $_loop_count - 1) : ?>`);
    // Convert {{#unless properties.xxx}} — negation of {{#if properties.xxx}}
    php = php.replace(/\{\{#unless\s+properties\.([\w.]+)\s*\}\}/g, (_, propPath) => {
        const parts = propPath.split('.');
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
        if (parts.length === 1) {
            return `<?php if (empty($${camelProp})) : ?>`;
        }
        const nestedAccess = parts.slice(1).map((p) => `['${p}']`).join('');
        return `<?php if (empty($${camelProp}${nestedAccess})) : ?>`;
    });
    php = php.replace(/\{\{\/unless\}\}/g, '<?php endif; ?>');
    // Convert {{#if this.xxx}} conditionals inside loops
    php = php.replace(/\{\{#if\s+this\.(\w+)\}\}/g, (_, field) => `<?php if (!empty($item['${field}'])) : ?>`);
    // Convert {{#if alias.field}} for any remaining loop variable conditionals
    // This catches cases where the alias wasn't tracked (e.g., nested loops or untracked aliases)
    php = php.replace(/\{\{#if\s+(\w+)\.(\w+)\s*\}\}/g, (match, alias, field) => {
        // Skip if it looks like properties.xxx (already handled)
        if (alias === 'properties' || alias === 'this') {
            return match;
        }
        // Use $subItem for nested loop aliases, $item for top-level
        const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
        return `<?php if (!empty(${itemVar}['${field}'])) : ?>`;
    });
    // Helper to parse Handlebars helper expressions like (eq properties.layout "layout-1")
    // and convert to PHP comparison expressions
    const parseHelperToPhp = (expr) => {
        // Helper to convert a variable path to PHP expression
        // Handles properties.xxx, this.xxx, and alias.xxx patterns
        const varToPhp = (varPath) => {
            if (varPath.startsWith('properties.')) {
                const parts = varPath.replace('properties.', '').split('.');
                const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
                if (parts.length > 1) {
                    return `$${camelProp}['${parts.slice(1).join("']['")}']`;
                }
                return `$${camelProp}`;
            }
            else if (varPath.startsWith('this.')) {
                const field = varPath.replace('this.', '');
                if (field.includes('.')) {
                    return `$item['${field.split('.').join("']['")}']`;
                }
                return `$item['${field}']`;
            }
            else {
                // Check if the first part is a known loop alias (e.g., card.type -> type)
                const parts = varPath.split('.');
                if (parts.length > 1) {
                    // Check nested aliases first (use $subItem)
                    if (nestedLoopAliases[parts[0]] || (aliasToDepth[parts[0]] ?? -1) > 0) {
                        const fieldPath = parts.slice(1);
                        if (fieldPath.length > 1) {
                            return `$subItem['${fieldPath.join("']['")}']`;
                        }
                        return `$subItem['${fieldPath[0]}']`;
                    }
                    // Then check top-level aliases (use $item)
                    if (loopAliases[parts[0]]) {
                        const fieldPath = parts.slice(1);
                        if (fieldPath.length > 1) {
                            return `$item['${fieldPath.join("']['")}']`;
                        }
                        return `$item['${fieldPath[0]}']`;
                    }
                }
                // Fallback - use as-is (might be a plain field name)
                if (varPath.includes('.')) {
                    return `$item['${varPath.split('.').join("']['")}']`;
                }
                return `$item['${varPath}']`;
            }
        };
        // Match (eq left "right") - equals with quoted string
        const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (eqMatch) {
            const [, left, right] = eqMatch;
            const leftExpr = varToPhp(left);
            return `(${leftExpr} ?? '') === '${right}'`;
        }
        // Match (eq left variable) without quotes
        const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)"]+)\s*\)$/);
        if (eqVarMatch) {
            const [, left, right] = eqVarMatch;
            const leftExpr = varToPhp(left);
            const rightExpr = varToPhp(right);
            return `(${leftExpr} ?? '') === (${rightExpr} ?? '')`;
        }
        // Match (ne left "right") - not equals
        const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (neMatch) {
            const [, left, right] = neMatch;
            const leftExpr = varToPhp(left);
            return `(${leftExpr} ?? '') !== '${right}'`;
        }
        // Match (gt left right) - greater than
        const gtMatch = expr.match(/^\(\s*gt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
        if (gtMatch) {
            const [, left, right] = gtMatch;
            const leftExpr = varToPhp(left);
            return `(${leftExpr} ?? 0) > ${right}`;
        }
        // Match (lt left right) - less than
        const ltMatch = expr.match(/^\(\s*lt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
        if (ltMatch) {
            const [, left, right] = ltMatch;
            const leftExpr = varToPhp(left);
            return `(${leftExpr} ?? 0) < ${right}`;
        }
        // Match (gte left right) - greater than or equal
        const gteMatch = expr.match(/^\(\s*gte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
        if (gteMatch) {
            const [, left, right] = gteMatch;
            const leftExpr = varToPhp(left);
            return `(${leftExpr} ?? 0) >= ${right}`;
        }
        // Match (lte left right) - less than or equal
        const lteMatch = expr.match(/^\(\s*lte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
        if (lteMatch) {
            const [, left, right] = lteMatch;
            const leftExpr = varToPhp(left);
            return `(${leftExpr} ?? 0) <= ${right}`;
        }
        return null;
    };
    // Convert {{#if (eq/ne/gt/lt/etc ...)}} helper expressions with if/else
    php = php.replace(/\{\{#if\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, helperExpr, ifContent, elseContent) => {
        const phpCondition = parseHelperToPhp(helperExpr);
        if (phpCondition) {
            return `<?php if (${phpCondition}) : ?>${ifContent}<?php else : ?>${elseContent}<?php endif; ?>`;
        }
        return `<?php if (false) : ?>${ifContent}<?php else : ?>${elseContent}<?php endif; ?>`;
    });
    // Convert {{#if (eq/ne/gt/lt/etc ...)}} helper expressions without else
    php = php.replace(/\{\{#if\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, helperExpr, ifContent) => {
        const phpCondition = parseHelperToPhp(helperExpr);
        if (phpCondition) {
            return `<?php if (${phpCondition}) : ?>${ifContent}<?php endif; ?>`;
        }
        return `<?php if (false) : ?>${ifContent}<?php endif; ?>`;
    });
    // Convert {{#unless (eq/ne/gt/lt/etc ...)}} helper expressions with if/else
    php = php.replace(/\{\{#unless\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, helperExpr, unlessContent, elseContent) => {
        const phpCondition = parseHelperToPhp(helperExpr);
        if (phpCondition) {
            return `<?php if (!(${phpCondition})) : ?>${unlessContent}<?php else : ?>${elseContent}<?php endif; ?>`;
        }
        return `<?php if (true) : ?>${unlessContent}<?php else : ?>${elseContent}<?php endif; ?>`;
    });
    // Convert {{#unless (eq/ne/gt/lt/etc ...)}} helper expressions without else
    php = php.replace(/\{\{#unless\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, helperExpr, unlessContent) => {
        const phpCondition = parseHelperToPhp(helperExpr);
        if (phpCondition) {
            return `<?php if (!(${phpCondition})) : ?>${unlessContent}<?php endif; ?>`;
        }
        return `<?php if (true) : ?>${unlessContent}<?php endif; ?>`;
    });
    // Convert {{#if properties.xxx.yyy.zzz...}} conditionals with deeply nested paths
    // e.g., {{#if properties.left_column.cta.link}} -> <?php if (!empty($leftColumn['cta']['link'])) : ?>
    php = php.replace(/\{\{#if\s+properties\.([\w.]+)\}\}/g, (_, propPath) => {
        const parts = propPath.split('.');
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
        if (parts.length === 1) {
            return `<?php if (!empty($${camelProp})) : ?>`;
        }
        // Build nested array access for remaining parts
        const nestedAccess = parts.slice(1).map((p) => `['${p}']`).join('');
        return `<?php if (!empty($${camelProp}${nestedAccess})) : ?>`;
    });
    // Handle {{else}} separately (for cases not caught by the combined patterns above)
    php = php.replace(/\{\{else\}\}/g, '<?php else : ?>');
    php = php.replace(/\{\{\/if\}\}/g, '<?php endif; ?>');
    // IMPORTANT: Convert triple-brace expressions FIRST (before double-brace)
    // Triple braces are for unescaped HTML output (rich text fields)
    // Convert {{{properties.xxx}}} triple braces (unescaped HTML)
    // richtext props use InnerBlocks — output $content (inner blocks rendered HTML)
    php = php.replace(/\{\{\{\s*properties\.(\w+)\s*\}\}\}/g, (_, prop) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        if (richtextProps.has(prop) || richtextProps.has(camelProp)) {
            return `<?php echo $content; ?>`;
        }
        return `<?php echo wp_kses_post($${camelProp} ?? ''); ?>`;
    });
    // Convert {{{this.xxx}}} triple braces for loop items
    php = php.replace(/\{\{\{\s*this\.(\w+)\s*\}\}\}/g, (_, field) => {
        return `<?php echo wp_kses_post($item['${field}'] ?? ''); ?>`;
    });
    // Convert {{{alias.xxx}}} triple braces for named loop aliases
    // This catches any remaining alias.field patterns with triple braces
    php = php.replace(/\{\{\{\s*(\w+)\.(\w+)\s*\}\}\}/g, (match, alias, field) => {
        // Skip if it looks like properties.xxx or this.xxx (already handled)
        if (alias === 'properties' || alias === 'this') {
            return match;
        }
        // Use $subItem for nested loop aliases, $item for top-level
        const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
        return `<?php echo wp_kses_post(${itemVar}['${field}'] ?? ''); ?>`;
    });
    // Convert {{{this}}} for scalar arrays with HTML content
    php = php.replace(/\{\{\{\s*this\s*\}\}\}/g, '<?php echo wp_kses_post($subItem ?? $item ?? \'\'); ?>');
    // Convert {{this}} simple reference (for scalar arrays)
    php = php.replace(/\{\{\s*this\s*\}\}/g, '<?php echo esc_html($subItem ?? $item ?? \'\'); ?>');
    // Convert {{this.xxx.yyy}} deep nested references
    php = php.replace(/\{\{\s*this\.(\w+)\.(\w+)\s*\}\}/g, (_, field1, field2) => {
        const escFunc = field2 === 'url' || field2 === 'src' || field2 === 'href' ? 'esc_url' : 'esc_html';
        return `<?php echo ${escFunc}($item['${field1}']['${field2}'] ?? ''); ?>`;
    });
    // Convert {{this.xxx}} references
    php = php.replace(/\{\{\s*this\.(\w+)\s*\}\}/g, (_, field) => {
        const escFunc = field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html';
        return `<?php echo ${escFunc}($item['${field}'] ?? ''); ?>`;
    });
    // Convert {{properties.xxx.yyy.zzz...}} deeply nested property access (any depth)
    // e.g., {{properties.left_column.cta.link.label}} -> $leftColumn['cta']['link']['label']
    php = php.replace(/\{\{\s*properties\.([\w.]+)\s*\}\}/g, (_, propPath) => {
        const parts = propPath.split('.');
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(parts[0]);
        const lastPart = parts[parts.length - 1];
        const escFunc = lastPart === 'url' || lastPart === 'src' || lastPart === 'href' ? 'esc_url' : 'esc_html';
        if (parts.length === 1) {
            return `<?php echo ${escFunc}($${camelProp} ?? ''); ?>`;
        }
        // Build nested array access for remaining parts
        const nestedAccess = parts.slice(1).map((p) => `['${p}']`).join('');
        return `<?php echo ${escFunc}($${camelProp}${nestedAccess} ?? ''); ?>`;
    });
    // Convert remaining {{xxx.yyy}} patterns (likely loop item references without this.)
    php = php.replace(/\{\{+\s*(\w+)\.(\w+)\s*\}+\}/g, (_, obj, field) => {
        // Skip if it looks like a PHP expression
        if (obj.includes('$') || obj.includes('php'))
            return `{{${obj}.${field}}}`;
        const escFunc = field === 'url' || field === 'src' || field === 'href' || field === 'label' ?
            (field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html') : 'esc_html';
        // Use $subItem for nested loop aliases, $item for top-level
        const itemVar = nestedLoopAliases[obj] ? '$subItem' : '$item';
        return `<?php echo ${escFunc}(${itemVar}['${field}'] ?? ''); ?>`;
    });
    // Convert href="{{properties.xxx.yyy}}" patterns specifically
    php = php.replace(/href="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g, (_, prop, field) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        return `href="<?php echo esc_url($${camelProp}['${field}'] ?? '#'); ?>"`;
    });
    // Convert href="{{properties.xxx}}" patterns
    php = php.replace(/href="\{\{\s*properties\.(\w+)\s*\}\}"/g, (_, prop) => {
        const camelProp = (0, handlebars_to_jsx_1.toCamelCase)(prop);
        return `href="<?php echo esc_url($${camelProp} ?? '#'); ?>"`;
    });
    // Convert remaining href="{{...}}" patterns (for loop item references)
    php = php.replace(/href="\{\{+([^}]+)\}+\}"/g, (_, expr) => {
        if (expr.includes('<?php'))
            return `href="${expr}"`;
        // Check if it's a this.xxx pattern
        const thisMatch = expr.match(/^\s*this\.(\w+)(?:\.(\w+))?\s*$/);
        if (thisMatch) {
            const [, field1, field2] = thisMatch;
            if (field2) {
                return `href="<?php echo esc_url($item['${field1}']['${field2}'] ?? '#'); ?>"`;
            }
            return `href="<?php echo esc_url($item['${field1}'] ?? '#'); ?>"`;
        }
        return 'href="<?php echo esc_url($item[\'url\'] ?? $item[\'link\'][\'url\'] ?? \'#\'); ?>"';
    });
    // Clean up any stray curly braces around PHP echo statements
    php = php.replace(/\{(<\?php echo)/g, '$1');
    php = php.replace(/(; \?>)\}/g, '$1');
    return php.trim();
};
exports.handlebarsToPhp = handlebarsToPhp;
/**
 * Generate attribute extraction code
 */
const generateAttributeExtraction = (properties, innerBlocksField) => {
    const extractions = [];
    const videoNormalizations = [];
    for (const [key, property] of Object.entries(properties)) {
        // Only the innerBlocksField richtext uses $content — skip attribute extraction for it
        if (property.type === 'richtext' && key === innerBlocksField)
            continue;
        // pagination items are auto-generated from WP_Query — no attribute to extract
        if (property.type === 'pagination')
            continue;
        const camelKey = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const defaultValue = getPhpDefaultValue(property);
        extractions.push(`$${camelKey} = isset($attributes['${camelKey}']) ? $attributes['${camelKey}'] : ${defaultValue};`);
        if (property.type === 'video') {
            videoNormalizations.push(`if (is_array($${camelKey})) {
  if (empty($${camelKey}['id']) && !empty($${camelKey}['src']) && preg_match('#(?:medias/|iframe/)([A-Za-z0-9]+)#', (string) $${camelKey}['src'], $matches)) {
    $${camelKey}['id'] = $matches[1];
  }
  if (empty($${camelKey}['src']) && !empty($${camelKey}['id'])) {
    $${camelKey}['src'] = 'https://fast.wistia.com/embed/medias/' . rawurlencode((string) $${camelKey}['id']) . '.jsonp';
  }
}`);
        }
    }
    return [...extractions, ...videoNormalizations].join('\n');
};
exports.generateAttributeExtraction = generateAttributeExtraction;
/**
 * Wrap template with block wrapper that handles alignment
 * Adds the alignment class (alignnone, alignwide, alignfull) based on block settings
 */
const wrapWithBlockWrapper = (template, componentId) => {
    // Convert component ID to class name (snake_case to kebab-case)
    const className = componentId.replace(/_/g, '-');
    // Wrap the template in a div that uses WordPress's block wrapper attributes
    // This handles alignment classes automatically
    return `<div <?php echo get_block_wrapper_attributes(['class' => '${className}']); ?>>
${template}
</div>`;
};
/**
 * Generate PHP code to convert field mapping value to PHP array syntax
 */
const fieldMappingToPhp = (mapping) => {
    const entries = [];
    for (const [key, value] of Object.entries(mapping)) {
        if (typeof value === 'string') {
            // Simple string mapping
            entries.push(`    '${key}' => '${value}'`);
        }
        else if (typeof value === 'object' && value.type) {
            // Complex mapping
            switch (value.type) {
                case 'static':
                    entries.push(`    '${key}' => ['type' => 'static', 'value' => '${value.value || ''}']`);
                    break;
                case 'manual':
                    entries.push(`    '${key}' => ['type' => 'manual']`);
                    break;
                case 'meta':
                    entries.push(`    '${key}' => ['type' => 'meta', 'key' => '${value.key || ''}']`);
                    break;
                case 'taxonomy':
                    const taxValue = value;
                    entries.push(`    '${key}' => ['type' => 'taxonomy', 'taxonomy' => '${taxValue.taxonomy}', 'format' => '${taxValue.format || 'first'}']`);
                    break;
                case 'custom':
                    entries.push(`    '${key}' => ['type' => 'custom', 'callback' => '${value.callback || ''}']`);
                    break;
            }
        }
    }
    return `[\n${entries.join(',\n')}\n  ]`;
};
/**
 * Generate pagination PHP code for a dynamic array query.
 * Returns the pagination block to append after the WP_Query execution.
 */
const generatePaginationPhp = (attrName, paginationPropName) => {
    return `
  // Pagination
  $${paginationPropName} = [];
  $${attrName}_pagination_enabled = $attributes['${attrName}PaginationEnabled'] ?? true;
  if ($${attrName}_pagination_enabled && $query->max_num_pages > 1 && function_exists('handoff_build_pagination')) {
    $${paginationPropName} = handoff_build_pagination($hf_paged, $query->max_num_pages, '${`hf_page_${attrName}`}');
  }`;
};
/**
 * Generate the paged variable extraction and WP_Query paged arg for pagination.
 */
const generatePagedPhp = (attrName) => {
    const paramKey = `hf_page_${attrName}`;
    return `
  // Read current page from custom query parameter
  $hf_paged = isset($_GET['${paramKey}']) ? max(1, intval($_GET['${paramKey}'])) : 1;`;
};
/**
 * Build PHP array_map expression to reshape standard helper items into the
 * template's expected item shape.  Returns null when no reshaping is needed.
 *
 * @param itemProperties  The component's array item property schema (items.properties)
 * @param standardFields  The flat field names the helper returns (e.g. ['label','url'])
 */
const buildReshapePhp = (itemProperties, standardFields) => {
    if (!itemProperties)
        return null;
    const topKeys = Object.keys(itemProperties);
    // If every top-level key IS a standard field the shapes already match
    if (topKeys.every(k => standardFields.includes(k)))
        return null;
    const pairs = [];
    for (const [key, prop] of Object.entries(itemProperties)) {
        if (standardFields.includes(key)) {
            pairs.push(`'${key}' => $__item['${key}']`);
        }
        else if (prop.type === 'link' || prop.type === 'button') {
            const sub = [];
            if (standardFields.includes('label'))
                sub.push(`'label' => $__item['label']`);
            if (standardFields.includes('url'))
                sub.push(`'url'   => $__item['url']`);
            if (sub.length)
                pairs.push(`'${key}' => [${sub.join(', ')}]`);
        }
        else if (prop.type === 'object' && prop.properties) {
            const sub = [];
            for (const subKey of Object.keys(prop.properties)) {
                if (standardFields.includes(subKey)) {
                    sub.push(`'${subKey}' => $__item['${subKey}']`);
                }
            }
            if (sub.length)
                pairs.push(`'${key}' => [${sub.join(', ')}]`);
        }
    }
    if (pairs.length === 0)
        return null;
    return `[${pairs.join(', ')}]`;
};
exports.buildReshapePhp = buildReshapePhp;
/**
 * Build equivalent JS reshape expression for editor preview.
 * Returns null when no reshaping is needed.
 */
const buildReshapeJs = (itemProperties, standardFields) => {
    if (!itemProperties)
        return null;
    const topKeys = Object.keys(itemProperties);
    if (topKeys.every(k => standardFields.includes(k)))
        return null;
    const pairs = [];
    for (const [key, prop] of Object.entries(itemProperties)) {
        if (standardFields.includes(key)) {
            pairs.push(`${key}: item.${key}`);
        }
        else if (prop.type === 'link' || prop.type === 'button') {
            const sub = [];
            if (standardFields.includes('label'))
                sub.push(`label: item.label`);
            if (standardFields.includes('url'))
                sub.push(`url: item.url`);
            if (sub.length)
                pairs.push(`${key}: { ${sub.join(', ')} }`);
        }
        else if (prop.type === 'object' && prop.properties) {
            const sub = [];
            for (const subKey of Object.keys(prop.properties)) {
                if (standardFields.includes(subKey)) {
                    sub.push(`${subKey}: item.${subKey}`);
                }
            }
            if (sub.length)
                pairs.push(`${key}: { ${sub.join(', ')} }`);
        }
    }
    if (pairs.length === 0)
        return null;
    return `({ ${pairs.join(', ')} })`;
};
exports.buildReshapeJs = buildReshapeJs;
/**
 * Generate breadcrumbs array extraction code for render.php.
 * Calls handoff_get_breadcrumb_items() if available, otherwise returns an empty array.
 */
const generateBreadcrumbsArrayExtraction = (fieldName, attrName, itemProperties) => {
    const reshapeExpr = buildReshapePhp(itemProperties, ['label', 'url']);
    const assignItems = reshapeExpr
        ? `$__raw = handoff_get_breadcrumb_items();
    $${attrName} = array_map(function($__item) { return ${reshapeExpr}; }, $__raw);`
        : `$${attrName} = handoff_get_breadcrumb_items();`;
    return `
// Dynamic array: ${fieldName} (breadcrumbs)
$${attrName}Enabled = $attributes['${attrName}Enabled'] ?? true;
$${attrName} = [];
if ($${attrName}Enabled) {
  if (!function_exists('handoff_get_breadcrumb_items')) {
    $resolver_path = defined('HANDOFF_BLOCKS_PLUGIN_DIR')
      ? HANDOFF_BLOCKS_PLUGIN_DIR . 'includes/handoff-field-resolver.php'
      : dirname(__FILE__) . '/../includes/handoff-field-resolver.php';
    if (file_exists($resolver_path)) {
      require_once $resolver_path;
    }
  }
  if (function_exists('handoff_get_breadcrumb_items')) {
    ${assignItems}
  }
}
`;
};
exports.generateBreadcrumbsArrayExtraction = generateBreadcrumbsArrayExtraction;
/**
 * Generate taxonomy terms array extraction code for render.php.
 */
const generateTaxonomyArrayExtraction = (fieldName, attrName, config, itemProperties) => {
    const maxItems = config.maxItems ?? -1;
    const defaultTaxonomy = config.taxonomies[0] || 'post_tag';
    const reshapeExpr = buildReshapePhp(itemProperties, ['label', 'url', 'slug']);
    // Build the per-term assignment: either flat or reshaped
    let termAssignment;
    if (reshapeExpr) {
        termAssignment = `        $__item = ['label' => $term->name, 'url' => get_term_link($term), 'slug' => $term->slug];
        $${attrName}[] = ${reshapeExpr};`;
    }
    else {
        termAssignment = `        $${attrName}[] = [
          'label' => $term->name,
          'url'   => get_term_link($term),
          'slug'  => $term->slug,
        ];`;
    }
    return `
// Dynamic array: ${fieldName} (taxonomy terms)
$${attrName}Enabled  = $attributes['${attrName}Enabled']  ?? false;
$${attrName}Taxonomy = $attributes['${attrName}Taxonomy'] ?? '${defaultTaxonomy}';
$${attrName}Source   = $attributes['${attrName}Source']   ?? 'auto';
$${attrName} = [];
if ($${attrName}Enabled) {
  if ($${attrName}Source === 'manual') {
    $${attrName} = $attributes['${attrName}'] ?? [];
  } else {
    $terms = wp_get_post_terms(get_the_ID(), $${attrName}Taxonomy, ['number' => ${maxItems}]);
    if (!is_wp_error($terms)) {
      foreach ($terms as $term) {
${termAssignment}
      }
    }
  }
}
`;
};
exports.generateTaxonomyArrayExtraction = generateTaxonomyArrayExtraction;
/**
 * Generate pagination array extraction code for render.php.
 * References the WP_Query instance ($query) produced by the connected posts field.
 */
const generatePaginationArrayExtraction = (fieldName, attrName, config, itemProperties) => {
    const connectedAttr = (0, handlebars_to_jsx_1.toCamelCase)(config.connectedField);
    const reshapeExpr = buildReshapePhp(itemProperties, ['label', 'url', 'active']);
    const assignItems = reshapeExpr
        ? `$__raw = handoff_build_pagination($hf_paged_${connectedAttr}, $query->max_num_pages, 'hf_page_${connectedAttr}');
    $${attrName} = array_map(function($__item) { return ${reshapeExpr}; }, $__raw);`
        : `$${attrName} = handoff_build_pagination($hf_paged_${connectedAttr}, $query->max_num_pages, 'hf_page_${connectedAttr}');`;
    return `
// Dynamic array: ${fieldName} (pagination — connected to '${config.connectedField}')
$${attrName}Enabled = $attributes['${attrName}Enabled'] ?? true;
$${attrName} = [];
if ($${attrName}Enabled && isset($query) && $query->max_num_pages > 1) {
  if (!function_exists('handoff_build_pagination')) {
    $resolver_path = defined('HANDOFF_BLOCKS_PLUGIN_DIR')
      ? HANDOFF_BLOCKS_PLUGIN_DIR . 'includes/handoff-field-resolver.php'
      : dirname(__FILE__) . '/../includes/handoff-field-resolver.php';
    if (file_exists($resolver_path)) {
      require_once $resolver_path;
    }
  }
  if (function_exists('handoff_build_pagination')) {
    $hf_paged_${connectedAttr} = isset($_GET['hf_page_${connectedAttr}']) ? max(1, intval($_GET['hf_page_${connectedAttr}'])) : 1;
    ${assignItems}
  }
}
`;
};
exports.generatePaginationArrayExtraction = generatePaginationArrayExtraction;
/**
 * Generate dynamic array extraction code for render.php
 * Supports both manual post selection and query builder modes
 */
const generateDynamicArrayExtraction = (fieldName, attrName, config) => {
    const mappingPhp = config.fieldMapping
        ? fieldMappingToPhp(config.fieldMapping)
        : '[]';
    const isQueryMode = config.selectionMode === 'query';
    const hasPagination = isQueryMode && !!config.pagination;
    const paginationPropName = config.pagination?.propertyName || 'pagination';
    // Common code for loading the field resolver
    const loadResolver = `
  // Ensure field resolver is loaded
  if (!function_exists('handoff_map_post_to_item')) {
    $resolver_path = defined('HANDOFF_BLOCKS_PLUGIN_DIR') 
      ? HANDOFF_BLOCKS_PLUGIN_DIR . 'includes/handoff-field-resolver.php'
      : dirname(__FILE__) . '/../includes/handoff-field-resolver.php';
    if (file_exists($resolver_path)) {
      require_once $resolver_path;
    }
  }`;
    // Pagination PHP snippets (empty strings when no pagination)
    const pagedExtraction = hasPagination ? generatePagedPhp(attrName) : '';
    const pagedArg = hasPagination ? `\n    'paged'          => $hf_paged,` : '';
    const paginationBlock = hasPagination ? generatePaginationPhp(attrName, paginationPropName) : '';
    // Initialize pagination variable to empty array when not in query mode
    const paginationInit = hasPagination ? `\n$${paginationPropName} = [];` : '';
    if (config.renderMode === 'template') {
        // Template mode - store posts for template rendering
        const templatePath = config.templatePath || `template-parts/handoff/${fieldName}-item.php`;
        if (isQueryMode) {
            // Query builder mode - use WP_Query with query args
            return `
// Dynamic array: ${fieldName} (query builder + template mode)
$${attrName}_source = $attributes['${attrName}Source'] ?? 'query';
$${attrName}_posts = [];${paginationInit}

if ($${attrName}_source === 'query') {
  // Query builder mode - build WP_Query from saved args
  $query_args = $attributes['${attrName}QueryArgs'] ?? [];${pagedExtraction}
  
  // Build WP_Query arguments
  $wp_query_args = [
    'post_type'      => $query_args['post_type'] ?? '${config.defaultPostType || config.postTypes[0] || 'post'}',
    'posts_per_page' => $query_args['posts_per_page'] ?? ${config.maxItems || 6},
    'orderby'        => $query_args['orderby'] ?? 'date',
    'order'          => $query_args['order'] ?? 'DESC',
    'post_status'    => 'publish',${pagedArg}
  ];
  
  // Exclude the current post to prevent self-reference
  $current_post_id = get_the_ID();
  if ($current_post_id) {
    $wp_query_args['post__not_in'] = [$current_post_id];
  }
  
  // Add taxonomy queries if present
  if (!empty($query_args['tax_query'])) {
    $wp_query_args['tax_query'] = array_map(function($tq) {
      return [
        'taxonomy' => $tq['taxonomy'] ?? '',
        'field'    => $tq['field'] ?? 'term_id',
        'terms'    => $tq['terms'] ?? [],
        'operator' => $tq['operator'] ?? 'IN',
      ];
    }, $query_args['tax_query']);
  }
  
  $query = new WP_Query($wp_query_args);
  $${attrName}_posts = $query->posts;${paginationBlock}
  wp_reset_postdata();
}
// For template mode, the template will iterate over $${attrName}_posts
`;
        }
        else {
            // Manual selection mode - fetch specific posts
            return `
// Dynamic array: ${fieldName} (select posts + template mode)
$${attrName}_source = $attributes['${attrName}Source'] ?? 'query';
$${attrName}_posts = [];${paginationInit}

if ($${attrName}_source === 'select') {
  $selected_posts = $attributes['${attrName}SelectedPosts'] ?? [];
  
  if (!empty($selected_posts)) {
    $post_ids = array_filter(array_map(function($p) { 
      return isset($p['id']) ? intval($p['id']) : 0; 
    }, $selected_posts));
    
    if (!empty($post_ids)) {
      $${attrName}_posts = get_posts([
        'post__in'       => $post_ids,
        'orderby'        => 'post__in',
        'posts_per_page' => count($post_ids),
        'post_status'    => 'publish',
        'post_type'      => 'any',
      ]);
    }
  }
}
// For template mode, the template will iterate over $${attrName}_posts
`;
        }
    }
    else {
        // Mapped mode - convert posts to item structure
        if (isQueryMode) {
            // Query builder mode with field mapping
            return `
// Dynamic array: ${fieldName} (query builder + mapped mode)
$${attrName}_source = $attributes['${attrName}Source'] ?? 'query';${paginationInit}

if ($${attrName}_source === 'query') {
  // Query builder mode - build WP_Query from saved args
  $query_args = $attributes['${attrName}QueryArgs'] ?? [];
  $field_mapping = $attributes['${attrName}FieldMapping'] ?? ${mappingPhp};
${loadResolver}${pagedExtraction}
  
  // Build WP_Query arguments
  $wp_query_args = [
    'post_type'      => $query_args['post_type'] ?? '${config.defaultPostType || config.postTypes[0] || 'post'}',
    'posts_per_page' => $query_args['posts_per_page'] ?? ${config.maxItems || 6},
    'orderby'        => $query_args['orderby'] ?? 'date',
    'order'          => $query_args['order'] ?? 'DESC',
    'post_status'    => 'publish',${pagedArg}
  ];
  
  // Exclude the current post to prevent self-reference
  $current_post_id = get_the_ID();
  if ($current_post_id) {
    $wp_query_args['post__not_in'] = [$current_post_id];
  }
  
  // Add taxonomy queries if present
  if (!empty($query_args['tax_query'])) {
    $wp_query_args['tax_query'] = array_map(function($tq) {
      return [
        'taxonomy' => $tq['taxonomy'] ?? '',
        'field'    => $tq['field'] ?? 'term_id',
        'terms'    => $tq['terms'] ?? [],
        'operator' => $tq['operator'] ?? 'IN',
      ];
    }, $query_args['tax_query']);
  }
  
  $query = new WP_Query($wp_query_args);
  
  // Map posts to template structure
  $${attrName} = [];
  if ($query->have_posts() && function_exists('handoff_map_post_to_item')) {
    foreach ($query->posts as $post) {
      $${attrName}[] = handoff_map_post_to_item($post->ID, $field_mapping);
    }
  }
  // Apply item overrides (e.g. card type for all items) from Advanced options
  $item_overrides = $attributes['${attrName}ItemOverrides'] ?? [];
  if (!empty($item_overrides) && function_exists('handoff_apply_item_overrides')) {
    foreach ($${attrName} as $i => $item) {
      $${attrName}[$i] = handoff_apply_item_overrides($item, $item_overrides);
    }
  }${paginationBlock}
  wp_reset_postdata();
}
// else: Manual mode uses $${attrName} directly from attribute extraction
`;
        }
        else {
            // Select posts mode with field mapping
            return `
// Dynamic array: ${fieldName} (select posts + mapped mode)
$${attrName}_source = $attributes['${attrName}Source'] ?? 'query';${paginationInit}

if ($${attrName}_source === 'select') {
  $selected_posts = $attributes['${attrName}SelectedPosts'] ?? [];
  $field_mapping = $attributes['${attrName}FieldMapping'] ?? ${mappingPhp};
${loadResolver}
  
  if (!empty($selected_posts) && function_exists('handoff_query_and_map_posts')) {
    $${attrName} = handoff_query_and_map_posts($selected_posts, $field_mapping);
  } else {
    $${attrName} = [];
  }
  $item_overrides = $attributes['${attrName}ItemOverrides'] ?? [];
  if (!empty($item_overrides) && function_exists('handoff_apply_item_overrides')) {
    foreach ($${attrName} as $i => $item) {
      $${attrName}[$i] = handoff_apply_item_overrides($item, $item_overrides);
    }
  }
}
// else: Manual mode uses $${attrName} directly from attribute extraction
`;
        }
    }
};
exports.generateDynamicArrayExtraction = generateDynamicArrayExtraction;
/**
 * Generate complete render.php file
 * @param component - The Handoff component data
 * @param dynamicArrayConfigs - Optional dynamic array configurations keyed by field name
 */
const generateRenderPhp = (component, dynamicArrayConfigs, innerBlocksField) => {
    // Only the innerBlocksField richtext uses $content (InnerBlocks);
    // other richtext fields are rendered from their string attributes.
    const richtextProps = new Set();
    if (innerBlocksField) {
        richtextProps.add(innerBlocksField);
        richtextProps.add((0, handlebars_to_jsx_1.toCamelCase)(innerBlocksField));
    }
    const attributeExtraction = generateAttributeExtraction(component.properties, innerBlocksField);
    const wistiaEnqueueCode = generateWistiaEnqueueCode(component.code);
    const templatePhp = handlebarsToPhp(stripWistiaScriptTags(component.code), component.properties, richtextProps);
    // Generate dynamic array extraction code
    const dynamicArrayExtractions = [];
    if (dynamicArrayConfigs) {
        for (const [fieldName, config] of Object.entries(dynamicArrayConfigs)) {
            const attrName = (0, handlebars_to_jsx_1.toCamelCase)(fieldName);
            const fieldProp = component.properties[fieldName];
            const itemProps = fieldProp?.items?.properties;
            if ((0, types_1.isBreadcrumbsConfig)(config)) {
                dynamicArrayExtractions.push(generateBreadcrumbsArrayExtraction(fieldName, attrName, itemProps));
            }
            else if ((0, types_1.isTaxonomyConfig)(config)) {
                dynamicArrayExtractions.push(generateTaxonomyArrayExtraction(fieldName, attrName, config, itemProps));
            }
            else if ((0, types_1.isPaginationConfig)(config)) {
                dynamicArrayExtractions.push(generatePaginationArrayExtraction(fieldName, attrName, config, itemProps));
            }
            else {
                dynamicArrayExtractions.push(generateDynamicArrayExtraction(fieldName, attrName, config));
            }
        }
    }
    const dynamicArrayCode = dynamicArrayExtractions.join('\n');
    // Wrap the template with block wrapper for alignment support
    const wrappedTemplate = wrapWithBlockWrapper(templatePhp, component.id);
    return `<?php
/**
 * Server-side rendering for ${component.title}
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Block default content.
 * @param WP_Block $block      Block instance.
 * @return string Returns the block markup.
 */

if (!defined('ABSPATH')) {
  exit;
}

if (!isset($attributes)) {
  $attributes = [];
}

// Extract attributes with defaults
${attributeExtraction}
${dynamicArrayCode}
${wistiaEnqueueCode}
?>
${wrappedTemplate}
`;
};
exports.generateRenderPhp = generateRenderPhp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXBocC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3JlbmRlci1waHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0NBQW1PO0FBQ25PLG1EQUFtRDtBQUNuRCwyREFBa0Q7QUFFbEQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQVUsRUFBVSxFQUFFO0lBQ3hDLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDMUMsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkQsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO0lBQ3RCLENBQUM7SUFFRCxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzlCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO2FBQ2hDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzthQUM3QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDZCxPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7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QUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUMxRyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sdUJBQXVCLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUM1RixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFDRCxNQUFNLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUU1RCw2REFBNkQ7SUFDN0QsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUV4RSxPQUFPOzsrQkFFc0IsU0FBUyxDQUFDLEtBQUs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBaUI1QyxtQkFBbUI7RUFDbkIsZ0JBQWdCO0VBQ2hCLGlCQUFpQjs7RUFFakIsZUFBZTtDQUNoQixDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBR0EsOENBQWlCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBHZW5lcmF0ZXMgcmVuZGVyLnBocCBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nXG4gKiBDb252ZXJ0cyBIYW5kbGViYXJzIHRlbXBsYXRlcyB0byBQSFBcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHksIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBGaWVsZE1hcHBpbmdWYWx1ZSwgaXNCcmVhZGNydW1ic0NvbmZpZywgaXNUYXhvbm9teUNvbmZpZywgaXNQYWdpbmF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZ2V0QnV0dG9uRGVmYXVsdCB9IGZyb20gJy4vYnV0dG9uLXNjaGVtYSc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuXG4vKipcbiAqIENvbnZlcnQgSlMgYXJyYXkvb2JqZWN0IHRvIFBIUCBhcnJheSBzeW50YXhcbiAqL1xuY29uc3QgYXJyYXlUb1BocCA9ICh2YWx1ZTogYW55KTogc3RyaW5nID0+IHtcbiAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gJ251bGwnO1xuICB9XG4gIFxuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBjb25zdCBpdGVtcyA9IHZhbHVlLm1hcCh2ID0+IGFycmF5VG9QaHAodikpLmpvaW4oJywgJyk7XG4gICAgcmV0dXJuIGBbJHtpdGVtc31dYDtcbiAgfVxuICBcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBwYWlycyA9IE9iamVjdC5lbnRyaWVzKHZhbHVlKVxuICAgICAgLm1hcCgoW2ssIHZdKSA9PiBgJyR7a30nID0+ICR7YXJyYXlUb1BocCh2KX1gKVxuICAgICAgLmpvaW4oJywgJyk7XG4gICAgcmV0dXJuIGBbJHtwYWlyc31dYDtcbiAgfVxuICBcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gYCcke3ZhbHVlLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nYDtcbiAgfVxuICBcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIHZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJztcbiAgfVxuICBcbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG59O1xuXG4vKipcbiAqIEdldCBQSFAgZGVmYXVsdCB2YWx1ZSBmb3IgYSBwcm9wZXJ0eVxuICovXG5jb25zdCBnZXRQaHBEZWZhdWx0VmFsdWUgPSAocHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IHN0cmluZyA9PiB7XG4gIHN3aXRjaCAocHJvcGVydHkudHlwZSkge1xuICAgIGNhc2UgJ3RleHQnOlxuICAgIGNhc2UgJ3JpY2h0ZXh0JzpcbiAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgcmV0dXJuIGAnJHtTdHJpbmcocHJvcGVydHkuZGVmYXVsdCA/PyAnJykucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuICAgIFxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gU3RyaW5nKHByb3BlcnR5LmRlZmF1bHQgPz8gMCk7XG4gICAgXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gcHJvcGVydHkuZGVmYXVsdCA/ICd0cnVlJyA6ICdmYWxzZSc7XG4gICAgXG4gICAgY2FzZSAnaW1hZ2UnOlxuICAgICAgcmV0dXJuIFwiWydzcmMnID0+ICcnLCAnYWx0JyA9PiAnJ11cIjtcblxuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIGlmIChwcm9wZXJ0eS5kZWZhdWx0ICYmIHR5cGVvZiBwcm9wZXJ0eS5kZWZhdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShwcm9wZXJ0eS5kZWZhdWx0KSkge1xuICAgICAgICByZXR1cm4gYXJyYXlUb1BocCh7XG4gICAgICAgICAgc3JjOiAnJyxcbiAgICAgICAgICBpZDogJycsXG4gICAgICAgICAgcG9zdGVyOiAnJyxcbiAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgbWltZTogJycsXG4gICAgICAgICAgbWltZVR5cGU6ICcnLFxuICAgICAgICAgIC4uLnByb3BlcnR5LmRlZmF1bHQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBwcm9wZXJ0eS5kZWZhdWx0ID09PSAnc3RyaW5nJyAmJiBwcm9wZXJ0eS5kZWZhdWx0KSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHtcbiAgICAgICAgICBzcmM6IHByb3BlcnR5LmRlZmF1bHQsXG4gICAgICAgICAgaWQ6ICcnLFxuICAgICAgICAgIHBvc3RlcjogJycsXG4gICAgICAgICAgdHlwZTogJycsXG4gICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgIG1pbWU6ICcnLFxuICAgICAgICAgIG1pbWVUeXBlOiAnJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gXCJbJ3NyYycgPT4gJycsICdpZCcgPT4gJycsICdwb3N0ZXInID0+ICcnLCAndHlwZScgPT4gJycsICd3aWR0aCcgPT4gMCwgJ2hlaWdodCcgPT4gMCwgJ21pbWUnID0+ICcnLCAnbWltZVR5cGUnID0+ICcnXVwiO1xuICAgIFxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgcmV0dXJuIFwiWydsYWJlbCcgPT4gJycsICd1cmwnID0+ICcnLCAnb3BlbnNJbk5ld1RhYicgPT4gZmFsc2VdXCI7XG4gICAgXG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiBhcnJheVRvUGhwKGdldEJ1dHRvbkRlZmF1bHQocHJvcGVydHkpKTtcbiAgICBcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAocHJvcGVydHkuZGVmYXVsdCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ1tdJztcbiAgICBcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICBpZiAocHJvcGVydHkuZGVmYXVsdCB8fCBwcm9wZXJ0eS5pdGVtcz8uZGVmYXVsdCkge1xuICAgICAgICByZXR1cm4gYXJyYXlUb1BocChwcm9wZXJ0eS5kZWZhdWx0IHx8IHByb3BlcnR5Lml0ZW1zPy5kZWZhdWx0IHx8IFtdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnW10nO1xuICAgIFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCInJ1wiO1xuICB9XG59O1xuXG5jb25zdCB0b1BocFNpbmdsZVF1b3RlZFN0cmluZyA9ICh2YWx1ZTogc3RyaW5nKTogc3RyaW5nID0+XG4gIGAnJHt2YWx1ZS5yZXBsYWNlKC9cXFxcL2csIFwiXFxcXFxcXFxcIikucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuXG5jb25zdCBoYW5kbGViYXJzVmFsdWVUb1BocEV4cHJlc3Npb24gPSAodGVtcGxhdGVWYWx1ZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgdG9rZW5SZWdleCA9IC9cXHtcXHtcXHs/XFxzKihbXn1dKz8pXFxzKlxcfVxcfVxcfT8vZztcbiAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gIGxldCBjdXJzb3IgPSAwO1xuICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgY29uc3QgcHVzaExpdGVyYWwgPSAobGl0ZXJhbDogc3RyaW5nKSA9PiB7XG4gICAgaWYgKGxpdGVyYWwpIHtcbiAgICAgIHBhcnRzLnB1c2godG9QaHBTaW5nbGVRdW90ZWRTdHJpbmcobGl0ZXJhbCkpO1xuICAgIH1cbiAgfTtcblxuICB3aGlsZSAoKG1hdGNoID0gdG9rZW5SZWdleC5leGVjKHRlbXBsYXRlVmFsdWUpKSAhPT0gbnVsbCkge1xuICAgIHB1c2hMaXRlcmFsKHRlbXBsYXRlVmFsdWUuc2xpY2UoY3Vyc29yLCBtYXRjaC5pbmRleCkpO1xuXG4gICAgY29uc3QgZXhwcmVzc2lvbiA9IG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgaWYgKGV4cHJlc3Npb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGF0aCA9IGV4cHJlc3Npb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhdGhbMF0pO1xuICAgICAgaWYgKHBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYCgkJHtjYW1lbFByb3B9ID8/ICcnKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGF0aFxuICAgICAgICAgIC5zbGljZSgxKVxuICAgICAgICAgIC5tYXAoKHNlZ21lbnQpID0+IGBbJyR7c2VnbWVudH0nXWApXG4gICAgICAgICAgLmpvaW4oJycpO1xuICAgICAgICBwYXJ0cy5wdXNoKGAoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSA/PyAnJylgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcGFydHMucHVzaChgJydgKTtcbiAgICB9XG5cbiAgICBjdXJzb3IgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgfVxuXG4gIHB1c2hMaXRlcmFsKHRlbXBsYXRlVmFsdWUuc2xpY2UoY3Vyc29yKSk7XG5cbiAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDAgPyBwYXJ0cy5qb2luKCcgLiAnKSA6IFwiJydcIjtcbn07XG5cbnR5cGUgV2lzdGlhQXNzZXQgPSB7XG4gIGVtcHR5Q2hlY2tFeHByZXNzaW9uOiBzdHJpbmc7XG4gIHVybEV4cHJlc3Npb246IHN0cmluZztcbn07XG5cbmNvbnN0IGJ1aWxkV2lzdGlhQXNzZXQgPSAobWVkaWFTb3VyY2U6IHN0cmluZyk6IFdpc3RpYUFzc2V0ID0+IHtcbiAgY29uc3Qgd2lzdGlhUHJlZml4ID0gJ2h0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy8nO1xuICBjb25zdCB3aXN0aWFTdWZmaXggPSAnLmpzb25wJztcblxuICBpZiAobWVkaWFTb3VyY2Uuc3RhcnRzV2l0aCh3aXN0aWFQcmVmaXgpICYmIG1lZGlhU291cmNlLmVuZHNXaXRoKHdpc3RpYVN1ZmZpeCkpIHtcbiAgICBjb25zdCBtZWRpYUlkVGVtcGxhdGUgPSBtZWRpYVNvdXJjZS5zbGljZSh3aXN0aWFQcmVmaXgubGVuZ3RoLCAtd2lzdGlhU3VmZml4Lmxlbmd0aCk7XG4gICAgY29uc3QgbWVkaWFJZEV4cHJlc3Npb24gPSBoYW5kbGViYXJzVmFsdWVUb1BocEV4cHJlc3Npb24obWVkaWFJZFRlbXBsYXRlKTtcblxuICAgIHJldHVybiB7XG4gICAgICBlbXB0eUNoZWNrRXhwcmVzc2lvbjogbWVkaWFJZEV4cHJlc3Npb24sXG4gICAgICB1cmxFeHByZXNzaW9uOiBgJyR7d2lzdGlhUHJlZml4fScgLiAke21lZGlhSWRFeHByZXNzaW9ufSAuICcke3dpc3RpYVN1ZmZpeH0nYCxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgdXJsRXhwcmVzc2lvbiA9IGhhbmRsZWJhcnNWYWx1ZVRvUGhwRXhwcmVzc2lvbihtZWRpYVNvdXJjZSk7XG4gIHJldHVybiB7XG4gICAgZW1wdHlDaGVja0V4cHJlc3Npb246IHVybEV4cHJlc3Npb24sXG4gICAgdXJsRXhwcmVzc2lvbixcbiAgfTtcbn07XG5cbmNvbnN0IGdlbmVyYXRlV2lzdGlhRW5xdWV1ZUNvZGUgPSAodGVtcGxhdGU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGFzc2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBXaXN0aWFBc3NldD4oKTtcbiAgbGV0IGhhc1dpc3RpYUVtYmVkID0gZmFsc2U7XG5cbiAgY29uc3QgYWRkQXNzZXQgPSAoYXNzZXQ6IFdpc3RpYUFzc2V0KSA9PiB7XG4gICAgY29uc3Qga2V5ID0gYCR7YXNzZXQuZW1wdHlDaGVja0V4cHJlc3Npb259Ojoke2Fzc2V0LnVybEV4cHJlc3Npb259YDtcbiAgICBpZiAoIWFzc2V0cy5oYXMoa2V5KSkge1xuICAgICAgYXNzZXRzLnNldChrZXksIGFzc2V0KTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFtePl0rc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj5cXHMqPFxcL3NjcmlwdD4vZ2k7XG4gIGxldCBzY3JpcHRNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICB3aGlsZSAoKHNjcmlwdE1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyh0ZW1wbGF0ZSkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3JjID0gc2NyaXB0TWF0Y2hbMV0udHJpbSgpO1xuXG4gICAgaWYgKC9mYXN0XFwud2lzdGlhXFwuY29tXFwvYXNzZXRzXFwvZXh0ZXJuYWxcXC9FLXYxXFwuanMvaS50ZXN0KHNyYykpIHtcbiAgICAgIGhhc1dpc3RpYUVtYmVkID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICgvZmFzdFxcLndpc3RpYVxcLmNvbVxcL2VtYmVkXFwvbWVkaWFzXFwvL2kudGVzdChzcmMpKSB7XG4gICAgICBoYXNXaXN0aWFFbWJlZCA9IHRydWU7XG4gICAgICBhZGRBc3NldChidWlsZFdpc3RpYUFzc2V0KHNyYykpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFzeW5jQ2xhc3NSZWdleCA9IC93aXN0aWFfYXN5bmNfKFteXFxzXCInPD5dKykvZztcbiAgbGV0IGFzeW5jQ2xhc3NNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICB3aGlsZSAoKGFzeW5jQ2xhc3NNYXRjaCA9IGFzeW5jQ2xhc3NSZWdleC5leGVjKHRlbXBsYXRlKSkgIT09IG51bGwpIHtcbiAgICBoYXNXaXN0aWFFbWJlZCA9IHRydWU7XG5cbiAgICBjb25zdCBtZWRpYUlkRXhwcmVzc2lvbiA9IGhhbmRsZWJhcnNWYWx1ZVRvUGhwRXhwcmVzc2lvbihhc3luY0NsYXNzTWF0Y2hbMV0pO1xuICAgIGFkZEFzc2V0KHtcbiAgICAgIGVtcHR5Q2hlY2tFeHByZXNzaW9uOiBtZWRpYUlkRXhwcmVzc2lvbixcbiAgICAgIHVybEV4cHJlc3Npb246IGAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzLycgLiAke21lZGlhSWRFeHByZXNzaW9ufSAuICcuanNvbnAnYCxcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghaGFzV2lzdGlhRW1iZWQpIHtcbiAgICByZXR1cm4gJyc7XG4gIH1cblxuICBjb25zdCBsaW5lcyA9IFtcbiAgICBcIi8vIFdpc3RpYSBlbWJlZCBhc3NldHNcIixcbiAgICBcIndwX2VucXVldWVfc2NyaXB0KCd3aXN0aWEtZXYxJywgJ2h0dHBzOi8vZmFzdC53aXN0aWEuY29tL2Fzc2V0cy9leHRlcm5hbC9FLXYxLmpzJywgW10sIG51bGwsIFsnc3RyYXRlZ3knID0+ICdhc3luYyddKTtcIixcbiAgXTtcblxuICBBcnJheS5mcm9tKGFzc2V0cy52YWx1ZXMoKSkuZm9yRWFjaCgoYXNzZXQsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgbWVkaWFWYXIgPSBgJGhhbmRvZmZXaXN0aWFNZWRpYSR7aW5kZXh9YDtcbiAgICBsaW5lcy5wdXNoKGAke21lZGlhVmFyfSA9ICR7YXNzZXQudXJsRXhwcmVzc2lvbn07YCk7XG4gICAgbGluZXMucHVzaChgaWYgKCFlbXB0eSgke2Fzc2V0LmVtcHR5Q2hlY2tFeHByZXNzaW9ufSkpIHtgKTtcbiAgICBsaW5lcy5wdXNoKFxuICAgICAgYCAgd3BfZW5xdWV1ZV9zY3JpcHQoc2FuaXRpemVfa2V5KCdoYW5kb2ZmLXdpc3RpYS1tZWRpYS0nIC4gbWQ1KChzdHJpbmcpICR7bWVkaWFWYXJ9KSksICR7bWVkaWFWYXJ9LCBbXSwgbnVsbCwgWydzdHJhdGVneScgPT4gJ2FzeW5jJ10pO2BcbiAgICApO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGAke2xpbmVzLmpvaW4oJ1xcbicpfVxcbmA7XG59O1xuXG5jb25zdCBzdHJpcFdpc3RpYVNjcmlwdFRhZ3MgPSAodGVtcGxhdGU6IHN0cmluZyk6IHN0cmluZyA9PlxuICB0ZW1wbGF0ZVxuICAgIC5yZXBsYWNlKC9cXHMqPHNjcmlwdFtePl0rc3JjPVtcIiddW15cIiddKmZhc3RcXC53aXN0aWFcXC5jb21cXC9lbWJlZFxcL21lZGlhc1xcL1teXCInXStbXCInXVtePl0qPlxccyo8XFwvc2NyaXB0PlxccyovZ2ksICdcXG4nKVxuICAgIC5yZXBsYWNlKC9cXHMqPHNjcmlwdFtePl0rc3JjPVtcIiddaHR0cHM6XFwvXFwvZmFzdFxcLndpc3RpYVxcLmNvbVxcL2Fzc2V0c1xcL2V4dGVybmFsXFwvRS12MVxcLmpzW1wiJ11bXj5dKj5cXHMqPFxcL3NjcmlwdD5cXHMqL2dpLCAnXFxuJyk7XG5cbi8qKlxuICogQ29udmVydCBoYW5kbGViYXJzIHRlbXBsYXRlIHRvIFBIUFxuICovXG5jb25zdCBoYW5kbGViYXJzVG9QaHAgPSAodGVtcGxhdGU6IHN0cmluZywgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcmljaHRleHRQcm9wczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCkpOiBzdHJpbmcgPT4ge1xuICBsZXQgcGhwID0gdGVtcGxhdGU7XG4gIFxuICAvLyBSZW1vdmUgSFRNTCB3cmFwcGVyIGlmIHByZXNlbnRcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxodG1sW1xcc1xcU10qPzxib2R5W14+XSo+L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC88XFwvYm9keT5bXFxzXFxTXSo/PFxcL2h0bWw+L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC88aGVhZD5bXFxzXFxTXSo/PFxcL2hlYWQ+L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXHs/c3R5bGVcXH1cXH1cXH0/L2csICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcez9zY3JpcHRcXH1cXH1cXH0/L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSBIVE1MIGNvbW1lbnRzXG4gIHBocCA9IHBocC5yZXBsYWNlKC88IS0tW1xcc1xcU10qPy0tPi9nLCAnJyk7XG4gIFxuICAvLyBSZW1vdmUge3shLS0gY29tbWVudHMgLS19fVxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7IS0tW1xcc1xcU10qPy0tXFx9XFx9L2csICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xceyFbXFxzXFxTXSo/XFx9XFx9L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSBIYW5kb2ZmLXNwZWNpZmljIHt7I2ZpZWxkfX0gYmxvY2tzIGJ1dCBrZWVwIHRoZWlyIGNvbnRlbnRcbiAgLy8gVXNlIGEgZ2xvYmFsIHJlZ2V4IHRoYXQgaGFuZGxlcyB2YXJpb3VzIHF1b3RlIHN0eWxlcyBhbmQgd2hpdGVzcGFjZVxuICAvLyBSZW1vdmUgSGFuZG9mZi1zcGVjaWZpYyB7eyNmaWVsZH19IGJsb2NrcyBidXQga2VlcCB0aGVpciBjb250ZW50XG4gIC8vIEFsbG93IGZvciB3aGl0ZXNwYWNlIHZhcmlhdGlvbnMgbGlrZSB7eyNmaWVsZCAuLi59fSwge3sgI2ZpZWxkIC4uLn19LCB7ey9maWVsZH19LCB7ey9maWVsZCB9fSwge3sgL2ZpZWxkIH19XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXHMqI2ZpZWxkXFxzK1teXFx9XStcXH1cXH0vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xccypcXC9maWVsZFxccypcXH1cXH0vZ2ksICcnKTtcbiAgXG4gIC8vIE5vcm1hbGl6ZSBAcm9vdC4gcmVmZXJlbmNlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9ucyB0byByb290LWxldmVsIGFjY2Vzcy5cbiAgLy8gSW4gc3RhbmRhcmQgSGFuZGxlYmFycywgQHJvb3QgcmVmZXJzIHRvIHRoZSB0b3AtbGV2ZWwgZGF0YSBjb250ZXh0IHJlZ2FyZGxlc3Mgb2ZcbiAgLy8gbmVzdGluZyBkZXB0aCwgc28gQHJvb3QucHJvcGVydGllcy54eHggaXMgZXF1aXZhbGVudCB0byBwcm9wZXJ0aWVzLnh4eCBhdCB0aGUgcm9vdC5cbiAgLy8gV2Ugb25seSByZXBsYWNlIGluc2lkZSB7ey4uLn19IHRvIGF2b2lkIHRvdWNoaW5nIHVucmVsYXRlZCB0ZXh0IGNvbnRlbnQuXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtbXFxzXFxTXSo/XFx9XFx9L2csIChtYXRjaCkgPT4gbWF0Y2gucmVwbGFjZSgvQHJvb3RcXC4vZywgJycpKTtcbiAgXG4gIC8vIFZFUlkgRUFSTFk6IENvbnZlcnQge3sjaWYgKGVxL25lIHh4eCBcInZhbHVlXCIpfX0uLi57e2Vsc2V9fS4uLnt7L2lmfX0gaGVscGVyIGV4cHJlc3Npb25zXG4gIC8vIFRoaXMgTVVTVCBydW4gYmVmb3JlIGFueSBvdGhlciBwcm9jZXNzaW5nIHRvIGVuc3VyZSB0aGUgY29tcGxldGUgYmxvY2sgaXMgY2FwdHVyZWRcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgdmFyaWFibGUgcGF0aCB0byBQSFAgZm9yIGVhcmx5IGhlbHBlciBwcm9jZXNzaW5nXG4gIGNvbnN0IHZhclRvUGhwVmVyeUVhcmx5ID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1bJyR7cGFydHMuc2xpY2UoMSkuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICB9IGVsc2UgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGb3IgbG9vcCBhbGlhc2VzIGF0IHRoaXMgZWFybHkgc3RhZ2UsIHdlIGhhdmVuJ3QgdHJhY2tlZCB0aGVtIHlldFxuICAgICAgLy8gU28gd2UganVzdCB1c2UgJGl0ZW0gZm9yIGFueSBhbGlhcy5maWVsZCBwYXR0ZXJuXG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIFBhcnNlIGhlbHBlciBleHByZXNzaW9uIHRvIFBIUCBjb25kaXRpb24gKHZlcnkgZWFybHkpXG4gIGNvbnN0IHBhcnNlSGVscGVyVmVyeUVhcmx5ID0gKGV4cHI6IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIC8vIE1hdGNoIChlcSBsZWZ0IFwicmlnaHRcIikgLSBlcXVhbHMgd2l0aCBxdW90ZWQgc3RyaW5nXG4gICAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKGVxTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwVmVyeUVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBWZXJ5RWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lIC4uLil9fSAuLi4ge3tlbHNlIGlmIChlcSAuLi4pfX0gLi4uIHt7ZWxzZX19IC4uLiB7ey9pZn19IFZFUlkgRUFSTFlcbiAgLy8gU3VwcG9ydHMgZnVsbCBpZiAvIGVsc2UgaWYgLyBlbHNlIGlmIC8gZWxzZSAvIGVuZGlmIGNoYWlucyAoc3RyaW5nIHN3aXRjaCBwYXR0ZXJuKVxuICB0eXBlIEhlbHBlcklmQnJhbmNoID0geyBjb25kaXRpb246IHN0cmluZyB8IG51bGw7IGNvbnRlbnQ6IHN0cmluZyB9O1xuICBjb25zdCBmaW5kSGVscGVySWZCcmFuY2hlcyA9IChcbiAgICBzdHI6IHN0cmluZyxcbiAgICBzdGFydFBvczogbnVtYmVyLFxuICAgIGZpcnN0Q29uZGl0aW9uOiBzdHJpbmdcbiAgKTogeyBicmFuY2hlczogSGVscGVySWZCcmFuY2hbXTsgY2xvc2VQb3M6IG51bWJlciB9IHwgbnVsbCA9PiB7XG4gICAgY29uc3QgYnJhbmNoZXM6IEhlbHBlcklmQnJhbmNoW10gPSBbeyBjb25kaXRpb246IGZpcnN0Q29uZGl0aW9uLCBjb250ZW50OiAnJyB9XTtcbiAgICBsZXQgZGVwdGggPSAxO1xuICAgIGxldCBwb3MgPSBzdGFydFBvcztcbiAgICBsZXQgY29udGVudFN0YXJ0ID0gc3RhcnRQb3M7XG4gICAgY29uc3QgZWxzZUlmUmVnZXggPSAvXFx7XFx7ZWxzZSBpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuXG4gICAgd2hpbGUgKHBvcyA8IHN0ci5sZW5ndGggJiYgZGVwdGggPiAwKSB7XG4gICAgICBjb25zdCBuZXh0SWYgPSBzdHIuaW5kZXhPZigne3sjaWYnLCBwb3MpO1xuICAgICAgY29uc3QgbmV4dEVuZGlmID0gc3RyLmluZGV4T2YoJ3t7L2lmfX0nLCBwb3MpO1xuICAgICAgY29uc3QgbmV4dEVsc2UgPSBzdHIuaW5kZXhPZigne3tlbHNlfX0nLCBwb3MpO1xuICAgICAgZWxzZUlmUmVnZXgubGFzdEluZGV4ID0gcG9zO1xuICAgICAgY29uc3QgZWxzZUlmTWF0Y2ggPSBlbHNlSWZSZWdleC5leGVjKHN0cik7XG4gICAgICBjb25zdCBuZXh0RWxzZUlmID0gZWxzZUlmTWF0Y2ggPyBlbHNlSWZNYXRjaC5pbmRleCA6IC0xO1xuXG4gICAgICBjb25zdCBjYW5kaWRhdGVzOiB7IHR5cGU6IHN0cmluZzsgcG9zOiBudW1iZXI7IGV4cHI/OiBzdHJpbmc7IHRhZ0xlbj86IG51bWJlciB9W10gPSBbXG4gICAgICAgIHsgdHlwZTogJ2lmJywgcG9zOiBuZXh0SWYgfSxcbiAgICAgICAgeyB0eXBlOiAnZW5kaWYnLCBwb3M6IG5leHRFbmRpZiB9LFxuICAgICAgICB7IHR5cGU6ICdlbHNlJywgcG9zOiBuZXh0RWxzZSB9LFxuICAgICAgICAuLi4obmV4dEVsc2VJZiAhPT0gLTEgPyBbeyB0eXBlOiAnZWxzZWlmJywgcG9zOiBuZXh0RWxzZUlmLCBleHByOiBlbHNlSWZNYXRjaCFbMV0sIHRhZ0xlbjogZWxzZUlmTWF0Y2ghWzBdLmxlbmd0aCB9XSA6IFtdKVxuICAgICAgXS5maWx0ZXIoYyA9PiBjLnBvcyAhPT0gLTEpLnNvcnQoKGEsIGIpID0+IGEucG9zIC0gYi5wb3MpO1xuXG4gICAgICBpZiAoY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIGJyZWFrO1xuXG4gICAgICBjb25zdCBjbG9zZXN0ID0gY2FuZGlkYXRlc1swXTtcblxuICAgICAgaWYgKGNsb3Nlc3QudHlwZSA9PT0gJ2lmJykge1xuICAgICAgICBkZXB0aCsrO1xuICAgICAgICBwb3MgPSBjbG9zZXN0LnBvcyArIDU7XG4gICAgICB9IGVsc2UgaWYgKGNsb3Nlc3QudHlwZSA9PT0gJ2VuZGlmJykge1xuICAgICAgICBkZXB0aC0tO1xuICAgICAgICBpZiAoZGVwdGggPT09IDApIHtcbiAgICAgICAgICBicmFuY2hlc1ticmFuY2hlcy5sZW5ndGggLSAxXS5jb250ZW50ID0gc3RyLnN1YnN0cmluZyhjb250ZW50U3RhcnQsIGNsb3Nlc3QucG9zKTtcbiAgICAgICAgICByZXR1cm4geyBicmFuY2hlcywgY2xvc2VQb3M6IGNsb3Nlc3QucG9zIH07XG4gICAgICAgIH1cbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyA3OyAvLyAne3svaWZ9fScubGVuZ3RoID09PSA3XG4gICAgICB9IGVsc2UgaWYgKChjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnIHx8IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2UnKSAmJiBkZXB0aCA9PT0gMSkge1xuICAgICAgICBjb25zdCB0YWdMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgYnJhbmNoZXNbYnJhbmNoZXMubGVuZ3RoIC0gMV0uY29udGVudCA9IHN0ci5zdWJzdHJpbmcoY29udGVudFN0YXJ0LCBjbG9zZXN0LnBvcyk7XG4gICAgICAgIGJyYW5jaGVzLnB1c2goe1xuICAgICAgICAgIGNvbmRpdGlvbjogY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyA/IGNsb3Nlc3QuZXhwciEgOiBudWxsLFxuICAgICAgICAgIGNvbnRlbnQ6ICcnXG4gICAgICAgIH0pO1xuICAgICAgICBjb250ZW50U3RhcnQgPSBjbG9zZXN0LnBvcyArIHRhZ0xlbjtcbiAgICAgICAgcG9zID0gY29udGVudFN0YXJ0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU2tpcCBmdWxsIHRhZyB3aGVuIGluc2lkZSBuZXN0ZWQgI2lmIChlLmcuIHNraXAge3tlbHNlIGlmIChleHByKX19IHNvIHdlIGZpbmQgdGhlIG91dGVyIHt7L2lmfX0pXG4gICAgICAgIGNvbnN0IHNraXBMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyBza2lwTGVuO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICAvLyBWRVJZIEVBUkxZOiBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IHdpdGggZWxzZSBhbmQgd2l0aG91dCBlbHNlXG4gIC8vICN1bmxlc3MgaXMgdGhlIG5lZ2F0aW9uIG9mICNpZiwgc28gd2UgaW52ZXJ0IHRoZSBjb25kaXRpb24uXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJWZXJ5RWFybHkoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCEoJHtwaHBDb25kaXRpb259KSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVmVyeUVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHN0eWxlIHdpdGggaGFuZGxlYmFycyBleHByZXNzaW9uc1xuICAvLyBLZWVwICdzcmMnIGFzLWlzIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL3N0eWxlPVwiYmFja2dyb3VuZC1pbWFnZTp1cmxcXCgnP1xce1xceytcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH0rXFx9Jz9cXClcIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gIWVtcHR5KCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10pID8gJ3N0eWxlPVwiYmFja2dyb3VuZC1pbWFnZTp1cmwoXFxcXCcnIC4gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddKSAuICdcXFxcJylcIicgOiAnJzsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIFRyYWNrIGxvb3AgYWxpYXNlcyBmb3IgbGF0ZXIgcmVmZXJlbmNlIGNvbnZlcnNpb25cbiAgLy8gRm9ybWF0OiB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhc05hbWV8fX1cbiAgY29uc3QgbG9vcEFsaWFzZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIC8vIFRyYWNrIG5lc3RlZCBsb29wIGFsaWFzZXMgc2VwYXJhdGVseSAodGhlc2UgdXNlICRzdWJJdGVtIGluc3RlYWQgb2YgJGl0ZW0pXG4gIGNvbnN0IG5lc3RlZExvb3BBbGlhc2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICAvLyBUcmFjayBuZXN0ZWQgbG9vcCBkZXB0aCBmb3IgcHJvcGVyIHZhcmlhYmxlIG5hbWluZ1xuICBsZXQgbmVzdGVkTG9vcERlcHRoID0gMDtcbiAgXG4gIC8vIEhlbHBlciB0byBnZXQgdGhlIGxvb3AgaXRlbSB2YXJpYWJsZSBuYW1lIGJhc2VkIG9uIGRlcHRoXG4gIGNvbnN0IGdldExvb3BJdGVtVmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckaXRlbSc7XG4gICAgaWYgKGRlcHRoID09PSAxKSByZXR1cm4gJyRzdWJJdGVtJztcbiAgICByZXR1cm4gYCRuZXN0ZWQke2RlcHRofUl0ZW1gO1xuICB9O1xuICBcbiAgY29uc3QgZ2V0TG9vcEluZGV4VmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckaW5kZXgnO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckc3ViSW5kZXgnO1xuICAgIHJldHVybiBgJG5lc3RlZCR7ZGVwdGh9SW5kZXhgO1xuICB9O1xuICBcbiAgY29uc3QgZ2V0TG9vcENvdW50VmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckX2xvb3BfY291bnQnO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckX25lc3RlZF9sb29wX2NvdW50JztcbiAgICByZXR1cm4gYCRfbmVzdGVkJHtkZXB0aH1fbG9vcF9jb3VudGA7XG4gIH07XG5cbiAgLyoqIGUuZy4gc3BlYWtlclN0YWNrLmF2YXRhcnMgKyAkaXRlbSAtPiAkaXRlbVsnc3BlYWtlclN0YWNrJ11bJ2F2YXRhcnMnXSAqL1xuICBjb25zdCBkb3RQYXRoVG9QaHBBY2Nlc3MgPSAocGF0aDogc3RyaW5nLCBiYXNlVmFyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHNlZ21lbnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGJyYWNrZXRBY2Nlc3MgPSBzZWdtZW50cy5tYXAoKHApID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgIHJldHVybiBgJHtiYXNlVmFyfSR7YnJhY2tldEFjY2Vzc31gO1xuICB9O1xuXG4gIGNvbnN0IG5lc3RlZEVhY2hPcGVuUGhwID0gKGFycmF5RXhwcjogc3RyaW5nLCBuZXN0ZWRBbGlhcz86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKG5lc3RlZEFsaWFzKSB7XG4gICAgICBuZXN0ZWRMb29wQWxpYXNlc1tuZXN0ZWRBbGlhc10gPSBhcnJheUV4cHI7XG4gICAgfVxuICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke2FycmF5RXhwcn0pICYmIGlzX2FycmF5KCR7YXJyYXlFeHByfSkpIDogJF9uZXN0ZWRfbG9vcF9jb3VudCA9IGNvdW50KCR7YXJyYXlFeHByfSk7IGZvcmVhY2ggKCR7YXJyYXlFeHByfSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICB9O1xuICBcbiAgLy8gRmlyc3QgcGFzczogaWRlbnRpZnkgYWxsIG5lc3RlZCBsb29wIHBhdHRlcm5zIGFuZCB0aGVpciBhbGlhc2VzXG4gIC8vIFdlIG5lZWQgdG8gcHJvY2VzcyBsb29wcyBpbiBvcmRlciB0byBwcm9wZXJseSB0cmFjayBuZXN0aW5nXG4gIGNvbnN0IGVhY2hQYXR0ZXJuczogQXJyYXk8e1xuICAgIG1hdGNoOiBzdHJpbmc7XG4gICAgdHlwZTogJ3Byb3BlcnRpZXMnIHwgJ3RoaXMnIHwgJ2FsaWFzJztcbiAgICBhcnJheVBhdGg6IHN0cmluZztcbiAgICBhbGlhcz86IHN0cmluZztcbiAgICBwYXJlbnRBbGlhcz86IHN0cmluZztcbiAgICBpbmRleDogbnVtYmVyO1xuICB9PiA9IFtdO1xuICBcbiAgLy8gRmluZCBhbGwge3sjZWFjaCAuLi59fSBwYXR0ZXJuc1xuICBjb25zdCBlYWNoUmVnZXggPSAvXFx7XFx7I2VhY2hcXHMrKFteXFx9XSspXFx9XFx9L2c7XG4gIGxldCBlYWNoTWF0Y2g7XG4gIHdoaWxlICgoZWFjaE1hdGNoID0gZWFjaFJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZWFjaE1hdGNoWzFdLnRyaW0oKTtcbiAgICBsZXQgdHlwZTogJ3Byb3BlcnRpZXMnIHwgJ3RoaXMnIHwgJ2FsaWFzJztcbiAgICBsZXQgYXJyYXlQYXRoOiBzdHJpbmc7XG4gICAgbGV0IGFsaWFzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgbGV0IHBhcmVudEFsaWFzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIFwiYXMgfGFsaWFzfFwiIHN5bnRheFxuICAgIGNvbnN0IGFzQWxpYXNNYXRjaCA9IGNvbnRlbnQubWF0Y2goL14oLis/KVxccythc1xccytcXHwoXFx3KylcXHwkLyk7XG4gICAgaWYgKGFzQWxpYXNNYXRjaCkge1xuICAgICAgY29uc3QgcGF0aFBhcnQgPSBhc0FsaWFzTWF0Y2hbMV0udHJpbSgpO1xuICAgICAgYWxpYXMgPSBhc0FsaWFzTWF0Y2hbMl07XG4gICAgICBcbiAgICAgIGlmIChwYXRoUGFydC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIHR5cGUgPSAncHJvcGVydGllcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpO1xuICAgICAgfSBlbHNlIGlmIChwYXRoUGFydC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIHR5cGUgPSAndGhpcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0LnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgfSBlbHNlIGlmIChwYXRoUGFydC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIC8vIGUuZy4sIGFydGljbGUudGFncyAtIGZpcnN0IHBhcnQgaXMgYW4gYWxpYXMgZnJvbSBvdXRlciBsb29wXG4gICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aFBhcnQuc3BsaXQoJy4nKTtcbiAgICAgICAgcGFyZW50QWxpYXMgPSBwYXJ0c1swXTtcbiAgICAgICAgYXJyYXlQYXRoID0gcGFydHMuc2xpY2UoMSkuam9pbignLicpO1xuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEp1c3QgYSB2YXJpYWJsZSBuYW1lLCB0cmVhdCBhcyBhbGlhcyByZWZlcmVuY2VcbiAgICAgICAgdHlwZSA9ICdhbGlhcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhbGlhcyBzeW50YXhcbiAgICAgIGlmIChjb250ZW50LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICdwcm9wZXJ0aWVzJztcbiAgICAgICAgYXJyYXlQYXRoID0gY29udGVudC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgvXFxzLylbMF07XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICB0eXBlID0gJ3RoaXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnJlcGxhY2UoJ3RoaXMuJywgJycpLnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gY29udGVudC5zcGxpdCgnLicpO1xuICAgICAgICBwYXJlbnRBbGlhcyA9IHBhcnRzWzBdO1xuICAgICAgICBhcnJheVBhdGggPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJykuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgZWFjaFBhdHRlcm5zLnB1c2goe1xuICAgICAgbWF0Y2g6IGVhY2hNYXRjaFswXSxcbiAgICAgIHR5cGUsXG4gICAgICBhcnJheVBhdGgsXG4gICAgICBhbGlhcyxcbiAgICAgIHBhcmVudEFsaWFzLFxuICAgICAgaW5kZXg6IGVhY2hNYXRjaC5pbmRleFxuICAgIH0pO1xuICB9XG4gIFxuICAvLyBUcmFjayB3aGljaCBhbGlhc2VzIG1hcCB0byB3aGljaCBuZXN0ZWQgZGVwdGhcbiAgY29uc3QgYWxpYXNUb0RlcHRoOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIFxuICAvLyBQcm9jZXNzIGxvb3BzIGZyb20gZmlyc3QgdG8gbGFzdCAobWFpbnRhaW5pbmcgb3JkZXIpXG4gIC8vIFNvcnQgYnkgaW5kZXggdG8gcHJvY2VzcyBpbiBvcmRlclxuICBlYWNoUGF0dGVybnMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuICBcbiAgLy8gVHJhY2sgY3VycmVudCBuZXN0aW5nIGxldmVsIGFzIHdlIHByb2Nlc3NcbiAgbGV0IGN1cnJlbnREZXB0aCA9IC0xO1xuICBjb25zdCBvcGVuTG9vcHM6IEFycmF5PHsgZGVwdGg6IG51bWJlcjsgYWxpYXM/OiBzdHJpbmcgfT4gPSBbXTtcbiAgXG4gIC8vIEZpbmQge3svZWFjaH19IHBvc2l0aW9uc1xuICBjb25zdCBjbG9zZUVhY2hQb3NpdGlvbnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGNsb3NlRWFjaFJlZ2V4ID0gL1xce1xce1xcL2VhY2hcXH1cXH0vZztcbiAgbGV0IGNsb3NlTWF0Y2g7XG4gIHdoaWxlICgoY2xvc2VNYXRjaCA9IGNsb3NlRWFjaFJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjbG9zZUVhY2hQb3NpdGlvbnMucHVzaChjbG9zZU1hdGNoLmluZGV4KTtcbiAgfVxuICBcbiAgLy8gQXNzaWduIGRlcHRoIHRvIGVhY2ggcGF0dGVybiBiYXNlZCBvbiBwb3NpdGlvbiByZWxhdGl2ZSB0byBvdGhlciBwYXR0ZXJucyBhbmQgY2xvc2VzXG4gIGZvciAoY29uc3QgcGF0dGVybiBvZiBlYWNoUGF0dGVybnMpIHtcbiAgICAvLyBDb3VudCBob3cgbWFueSBvcGVucyBiZWZvcmUgdGhpcyBwb3NpdGlvblxuICAgIGNvbnN0IG9wZW5zQmVmb3JlID0gZWFjaFBhdHRlcm5zLmZpbHRlcihwID0+IHAuaW5kZXggPCBwYXR0ZXJuLmluZGV4KS5sZW5ndGg7XG4gICAgLy8gQ291bnQgaG93IG1hbnkgY2xvc2VzIGJlZm9yZSB0aGlzIHBvc2l0aW9uXG4gICAgY29uc3QgY2xvc2VzQmVmb3JlID0gY2xvc2VFYWNoUG9zaXRpb25zLmZpbHRlcihwb3MgPT4gcG9zIDwgcGF0dGVybi5pbmRleCkubGVuZ3RoO1xuICAgIGNvbnN0IGRlcHRoID0gb3BlbnNCZWZvcmUgLSBjbG9zZXNCZWZvcmU7XG4gICAgXG4gICAgaWYgKHBhdHRlcm4uYWxpYXMpIHtcbiAgICAgIGFsaWFzVG9EZXB0aFtwYXR0ZXJuLmFsaWFzXSA9IGRlcHRoO1xuICAgICAgbG9vcEFsaWFzZXNbcGF0dGVybi5hbGlhc10gPSBwYXR0ZXJuLmFycmF5UGF0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgcHJvcGVydHkgcGF0aCBsaWtlIFwianVtcE5hdi5saW5rc1wiIHRvIFBIUCB2YXJpYWJsZSBhY2Nlc3MgbGlrZSBcIiRqdW1wTmF2WydsaW5rcyddXCJcbiAgY29uc3QgcHJvcFBhdGhUb1BocCA9IChwcm9wUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgY2FtZWxGaXJzdCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICByZXR1cm4gYCQke2NhbWVsRmlyc3R9YDtcbiAgICB9XG4gICAgLy8gRm9yIG5lc3RlZCBwYXRocyBsaWtlIGp1bXBOYXYubGlua3MgLT4gJGp1bXBOYXZbJ2xpbmtzJ11cbiAgICBjb25zdCBuZXN0ZWRQYXRoID0gcGFydHMuc2xpY2UoMSkubWFwKHAgPT4gYCcke3B9J2ApLmpvaW4oJ11bJyk7XG4gICAgcmV0dXJuIGAkJHtjYW1lbEZpcnN0fVske25lc3RlZFBhdGh9XWA7XG4gIH07XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5IGFzIHxhbGlhc3x9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhcyBpbmRleHx9fSBsb29wcyB3aXRoIG5hbWVkIGFsaWFzXG4gIC8vIE5vdyBoYW5kbGVzIG5lc3RlZCBwYXRocyBsaWtlIHByb3BlcnRpZXMuanVtcE5hdi5saW5rc1xuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkaW5kZXggaW4gUEhQXG4gIC8vIEFsc28gc2V0ICRfbG9vcF9jb3VudCBmb3IgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgsIGFsaWFzKSA9PiB7XG4gICAgICBjb25zdCBwaHBWYXIgPSBwcm9wUGF0aFRvUGhwKHByb3BQYXRoKTtcbiAgICAgIGxvb3BBbGlhc2VzW2FsaWFzXSA9IHByb3BQYXRoO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7cGhwVmFyfSkgJiYgaXNfYXJyYXkoJHtwaHBWYXJ9KSkgOiAkX2xvb3BfY291bnQgPSBjb3VudCgke3BocFZhcn0pOyBmb3JlYWNoICgke3BocFZhcn0gYXMgJGluZGV4ID0+ICRpdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggcHJvcGVydGllcy54eHh9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4Lnl5eX19IGxvb3BzIHdpdGhvdXQgYWxpYXNcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIC8vIEFsc28gc2V0ICRfbG9vcF9jb3VudCBmb3IgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBWYXIgPSBwcm9wUGF0aFRvUGhwKHByb3BQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke3BocFZhcn0pICYmIGlzX2FycmF5KCR7cGhwVmFyfSkpIDogJF9sb29wX2NvdW50ID0gY291bnQoJHtwaHBWYXJ9KTsgZm9yZWFjaCAoJHtwaHBWYXJ9IGFzICRpbmRleCA9PiAkaXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIHRoaXMueHh4Lnl5eSBhcyB8YWxpYXN8fX0gbmVzdGVkIGxvb3BzIHdpdGggYWxpYXMgKHN1cHBvcnRzIGRvdHRlZCBwYXRocylcbiAgLy8gVGhlIHNlY29uZCBwYXJhbWV0ZXIgKGluZGV4KSBpcyBvcHRpb25hbCBhbmQgaWdub3JlZCBzaW5jZSB3ZSB1c2UgJHN1YkluZGV4IGluIFBIUFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrdGhpc1xcLihbXFx3Ll0rKVxccythc1xccytcXHwoXFx3KykoPzpcXHMrXFx3Kyk/XFx8XFxzKlxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCwgYWxpYXMpID0+IHtcbiAgICAgIG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA9IHByb3BQYXRoO1xuICAgICAgcmV0dXJuIG5lc3RlZEVhY2hPcGVuUGhwKGRvdFBhdGhUb1BocEFjY2Vzcyhwcm9wUGF0aCwgJyRpdGVtJyksIGFsaWFzKTtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggdGhpcy54eHgueXl5fX0gbmVzdGVkIGxvb3BzIHdpdGhvdXQgYWxpYXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3RoaXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiBuZXN0ZWRFYWNoT3BlblBocChkb3RQYXRoVG9QaHBBY2Nlc3MocHJvcFBhdGgsICckaXRlbScpKVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIGFsaWFzLnh4eC55eXkgYXMgfG5lc3RlZEFsaWFzfH19IOKAlCBuZXN0ZWQgbG9vcHMgcmVmZXJlbmNpbmcgb3V0ZXIgbG9vcCBhbGlhc1xuICAvLyBlLmcuIHt7I2VhY2ggY2FyZC5zcGVha2VyU3RhY2suYXZhdGFycyBhcyB8YXZhdGFyfH19IGluc2lkZSB7eyNlYWNoIHByb3BlcnRpZXMuY2FyZHMgYXMgfGNhcmR8fX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzKyhcXHcrKVxcLihbXFx3Ll0rKVxccythc1xccytcXHwoXFx3KykoPzpcXHMrXFx3Kyk/XFx8XFxzKlxcfVxcfS9nLFxuICAgIChtYXRjaCwgcGFyZW50QWxpYXMsIHByb3BQYXRoLCBuZXN0ZWRBbGlhcykgPT4ge1xuICAgICAgaWYgKHBhcmVudEFsaWFzID09PSAncHJvcGVydGllcycgfHwgcGFyZW50QWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmVzdGVkRWFjaE9wZW5QaHAoZG90UGF0aFRvUGhwQWNjZXNzKHByb3BQYXRoLCAnJGl0ZW0nKSwgbmVzdGVkQWxpYXMpO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBhbGlhcy54eHgueXl5fX0g4oCUIG5lc3RlZCBsb29wcyByZWZlcmVuY2luZyBvdXRlciBsb29wIGFsaWFzIHdpdGhvdXQgbmVzdGVkIGFsaWFzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccysoXFx3KylcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBwYXJlbnRBbGlhcywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGlmIChwYXJlbnRBbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IHBhcmVudEFsaWFzID09PSAndGhpcycpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5lc3RlZEVhY2hPcGVuUGhwKGRvdFBhdGhUb1BocEFjY2Vzcyhwcm9wUGF0aCwgJyRpdGVtJykpO1xuICAgIH1cbiAgKTtcbiAgXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXC9lYWNoXFx9XFx9L2csICc8P3BocCBlbmRmb3JlYWNoOyBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGhlbHBlciBleHByZXNzaW9uIGNvbmRpdGlvbmFscyBFQVJMWSAoYmVmb3JlIGFsaWFzIHBhdHRlcm5zIGNvbnZlcnQgcGFydHMgb2YgdGhlbSlcbiAgLy8gVGhpcyBoYW5kbGVzIHt7I2lmIChlcSBhbGlhcy54eHggXCJ2YWx1ZVwiKX19Li4ue3tlbHNlfX0uLi57ey9pZn19IHBhdHRlcm5zIGluc2lkZSBsb29wc1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSB2YXJpYWJsZSBwYXRoIHRvIFBIUCBleHByZXNzaW9uIGZvciBoZWxwZXIgY29tcGFyaXNvbnNcbiAgLy8gSGFuZGxlcyBwcm9wZXJ0aWVzLnh4eCwgdGhpcy54eHgsIGFuZCBhbGlhcy54eHggcGF0dGVybnNcbiAgY29uc3QgdmFyVG9QaHBFYXJseSA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfWA7XG4gICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgIGlmIChmaWVsZC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkfSddYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgaXMgYSBrbm93biBsb29wIGFsaWFzXG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGlmIChuZXN0ZWRMb29wQWxpYXNlc1twYXJ0c1swXV0gfHwgKGFsaWFzVG9EZXB0aFtwYXJ0c1swXV0gPz8gLTEpID4gMCkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICBpZiAobG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZFBhdGguam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBGYWxsYmFja1xuICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGguc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIFBhcnNlIGhlbHBlciBleHByZXNzaW9uIHRvIFBIUCBjb25kaXRpb25cbiAgY29uc3QgcGFyc2VIZWxwZXJFYXJseSA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCBcInJpZ2h0XCIpIC0gZXF1YWxzIHdpdGggcXVvdGVkIHN0cmluZ1xuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocEVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxIC4uLil9fSAuLi4ge3tlbHNlIGlmIChlcSAuLi4pfX0gLi4uIHt7L2lmfX0gY2hhaW5zIGFmdGVyIGxvb3AgYWxpYXNlcyBhcmUga25vd25cbiAgY29uc3QgaGVscGVySWZFbHNlSWZSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0vZztcbiAgbGV0IGhlbHBlcklmRWxzZUlmTWF0Y2g7XG4gIHdoaWxlICgoaGVscGVySWZFbHNlSWZNYXRjaCA9IGhlbHBlcklmRWxzZUlmUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IG9wZW5Qb3MgPSBoZWxwZXJJZkVsc2VJZk1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBvcGVuUG9zICsgaGVscGVySWZFbHNlSWZNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgZmlyc3RDb25kaXRpb24gPSBoZWxwZXJJZkVsc2VJZk1hdGNoWzFdO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gZmluZEhlbHBlcklmQnJhbmNoZXMocGhwLCBvcGVuVGFnRW5kLCBmaXJzdENvbmRpdGlvbik7XG4gICAgaWYgKHJlc3VsdCA9PT0gbnVsbCkgY29udGludWU7XG4gICAgY29uc3QgeyBicmFuY2hlcywgY2xvc2VQb3MgfSA9IHJlc3VsdDtcblxuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnJhbmNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGJyYW5jaCA9IGJyYW5jaGVzW2ldO1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gYnJhbmNoLmNvbmRpdGlvbiA/IHBhcnNlSGVscGVyRWFybHkoYnJhbmNoLmNvbmRpdGlvbikgOiBudWxsO1xuICAgICAgY29uc3QgY29uZCA9IHBocENvbmRpdGlvbiA/PyAnZmFsc2UnO1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgcGFydHMucHVzaChgPD9waHAgaWYgKCR7Y29uZH0pIDogPz4ke2JyYW5jaC5jb250ZW50fWApO1xuICAgICAgfSBlbHNlIGlmIChicmFuY2guY29uZGl0aW9uICE9PSBudWxsKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYDw/cGhwIGVsc2VpZiAoJHtjb25kfSkgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXJ0cy5wdXNoKGA8P3BocCBlbHNlIDogPz4ke2JyYW5jaC5jb250ZW50fWApO1xuICAgICAgfVxuICAgIH1cbiAgICBwYXJ0cy5wdXNoKCc8P3BocCBlbmRpZjsgPz4nKTtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IHBhcnRzLmpvaW4oJycpO1xuXG4gICAgcGhwID0gcGhwLnN1YnN0cmluZygwLCBvcGVuUG9zKSArIHJlcGxhY2VtZW50ICsgcGhwLnN1YnN0cmluZyhjbG9zZVBvcyArIDcpO1xuICAgIGhlbHBlcklmRWxzZUlmUmVnZXgubGFzdEluZGV4ID0gb3BlblBvcztcbiAgfVxuXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlIEVBUkxZXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIGlmQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGZhbHNlKSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgLy8gQ29udmVydCB7eyN1bmxlc3MgKGVxL25lIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBlbHNlIEVBUkxZXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGF0dHJpYnV0ZS1zcGVjaWZpYyBwYXR0ZXJucyBGSVJTVCBiZWZvcmUgZ2VuZXJpYyBvbmVzXG4gIC8vIEhhbmRsZSBwcm9wZXJ0aWVzLnh4eC55eXkgcGF0dGVybnMgRklSU1QsIHRoZW4gYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzXG4gIFxuICAvLyBDb252ZXJ0IHNyYz1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJucyAodG9wLWxldmVsIG5lc3RlZCBwcm9wZXJ0aWVzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvc3JjPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBzcmM9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9hbHQ9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGFsdD1cIjw/cGhwIGVjaG8gZXNjX2F0dHIoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIE5vdyBoYW5kbGUgYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzOiBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBhbHQ9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBocmVmPVwie3thbGlhcy54eHgueXl5fX1cIlxuICBcbiAgLy8gQ29udmVydCBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiIHBhdHRlcm5zIChpbWFnZXMgaW4gbG9vcHMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zcmM9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBjb252ZXJ0ZWQgb3IgaWYgaXQncyBhIHByb3BlcnRpZXMgcGF0dGVyblxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJyB8fCBtYXRjaC5pbmNsdWRlcygnPD9waHAnKSkge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgc3JjPVwiPD9waHAgZWNobyBlc2NfdXJsKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3thbGlhcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvYWx0PVwiXFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkMSwgZmllbGQyKSA9PiB7XG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnIHx8IG1hdGNoLmluY2x1ZGVzKCc8P3BocCcpKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGBhbHQ9XCI8P3BocCBlY2hvIGVzY19hdHRyKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7YWxpYXMueHh4Lnl5eX19XCIgcGF0dGVybnMgKGxpbmtzIGluIGxvb3BzIHdpdGggbmVzdGVkIGZpZWxkcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycgfHwgbWF0Y2guaW5jbHVkZXMoJzw/cGhwJykpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e2FsaWFzLmZpZWxkLnN1YmZpZWxkfX0gYW5kIHt7YWxpYXMuZmllbGR9fSByZWZlcmVuY2VzIGZyb20gbmFtZWQgbG9vcCB2YXJpYWJsZXNcbiAgLy8gTXVzdCBoYW5kbGUgZGVlcGVyIG5lc3RpbmcgZmlyc3QgKGFsaWFzLmZpZWxkLnN1YmZpZWxkIGJlZm9yZSBhbGlhcy5maWVsZClcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgdHJpcGxlLWJyYWNlIChyaWNoIHRleHQpIEJFRk9SRSBkb3VibGUtYnJhY2UgcGF0dGVybnNcbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgZmllbGQgcGF0aCB0byBQSFAgYXJyYXkgYWNjZXNzXG4gIC8vIGUuZy4sIFwiY3RhLmxpbmtcIiAtPiBcIlsnY3RhJ11bJ2xpbmsnXVwiXG4gIGNvbnN0IGZpZWxkUGF0aFRvUGhwQWNjZXNzID0gKGZpZWxkUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgIHJldHVybiBwYXJ0cy5tYXAocCA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgfTtcbiAgXG4gIC8vIFByb2Nlc3MgbmVzdGVkIGxvb3AgYWxpYXNlcyBGSVJTVCAodGhleSB1c2UgJHN1Ykl0ZW0pXG4gIGZvciAoY29uc3QgW2FsaWFzXSBvZiBPYmplY3QuZW50cmllcyhuZXN0ZWRMb29wQWxpYXNlcykpIHtcbiAgICAvLyBIYW5kbGUge3t7IGFsaWFzLmZpZWxkIH19fSB0cmlwbGUtYnJhY2UgcGF0dGVybnMgKHJpY2ggdGV4dC9IVE1MIGluIG5lc3RlZCBsb29wcylcbiAgICBjb25zdCBhbGlhc1RyaXBsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc1RyaXBsZVJlZ2V4LCAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHN1Ykl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7I2lmIGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRocyBpbiBuZXN0ZWQgbG9vcHNcbiAgICAvLyBlLmcuLCB7eyNpZiB0YWcuY3RhLmxpbmt9fSAtPiA8P3BocCBpZiAoIWVtcHR5KCRzdWJJdGVtWydjdGEnXVsnbGluayddKSkgOiA/PlxuICAgIGNvbnN0IGFsaWFzSWZEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2lmXFxcXHMrJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNJZkRlZXBSZWdleCwgKF8sIGZpZWxkUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkc3ViSXRlbSR7cGhwQWNjZXNzfSkpIDogPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLiB9fSBwYXR0ZXJucyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHMgaW4gbmVzdGVkIGxvb3BzXG4gICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHN1Ykl0ZW0ke3BocEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRoZW4gcHJvY2VzcyB0b3AtbGV2ZWwgbG9vcCBhbGlhc2VzICh0aGV5IHVzZSAkaXRlbSlcbiAgZm9yIChjb25zdCBbYWxpYXNdIG9mIE9iamVjdC5lbnRyaWVzKGxvb3BBbGlhc2VzKSkge1xuICAgIC8vIEhhbmRsZSB7e3sgYWxpYXMuZmllbGQgfX19IHRyaXBsZS1icmFjZSBwYXR0ZXJucyAocmljaCB0ZXh0L0hUTUwgaW4gbG9vcHMpXG4gICAgY29uc3QgYWxpYXNUcmlwbGVSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNUcmlwbGVSZWdleCwgKF8sIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyNpZiBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgICAvLyBlLmcuLCB7eyNpZiBzbGlkZS5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gICAgY29uc3QgYWxpYXNJZkRlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0lmRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtJHtwaHBBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4uIH19IHBhdHRlcm5zIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgIGNvbnN0IGFsaWFzRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oW1xcXFx3Ll0rKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBsYXN0UGFydCA9PT0gJ3VybCcgfHwgbGFzdFBhcnQgPT09ICdzcmMnIHx8IGxhc3RQYXJ0ID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCRpdGVtJHtwaHBBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICB9XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBAZmlyc3R9fSAtIHNob3cgY29udGVudCBmb3IgYWxsIGl0ZW1zIGV4Y2VwdCB0aGUgZmlyc3RcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFxzKlxcfVxcfS9nLFxuICAgIGA8P3BocCBpZiAoJGluZGV4ID4gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIEBsYXN0fX0gLSBzaG93IGNvbnRlbnQgZm9yIGFsbCBpdGVtcyBleGNlcHQgdGhlIGxhc3RcbiAgLy8gVXNlcyAkX2xvb3BfY291bnQgc2V0IGluIHRoZSBmb3JlYWNoIGxvb3BcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPCAkX2xvb3BfY291bnQgLSAxKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBAZmlyc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgZmlyc3QgaXRlbVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK0BmaXJzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA9PT0gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgQGxhc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgbGFzdCBpdGVtXG4gIC8vIFVzZXMgJF9sb29wX2NvdW50IHNldCBpbiB0aGUgZm9yZWFjaCBsb29wXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPT09ICRfbG9vcF9jb3VudCAtIDEpIDogPz5gXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBwcm9wZXJ0aWVzLnh4eH19IOKAlCBuZWdhdGlvbiBvZiB7eyNpZiBwcm9wZXJ0aWVzLnh4eH19XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKGVtcHR5KCQke2NhbWVsUHJvcH0pKSA6ID8+YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5lc3RlZEFjY2VzcyA9IHBhcnRzLnNsaWNlKDEpLm1hcCgocDogc3RyaW5nKSA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGVtcHR5KCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL3VubGVzc1xcfVxcfS9nLCAnPD9waHAgZW5kaWY7ID8+Jyk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIHRoaXMueHh4fX0gY29uZGl0aW9uYWxzIGluc2lkZSBsb29wc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK3RoaXNcXC4oXFx3KylcXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke2ZpZWxkfSddKSkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgYWxpYXMuZmllbGR9fSBmb3IgYW55IHJlbWFpbmluZyBsb29wIHZhcmlhYmxlIGNvbmRpdGlvbmFsc1xuICAvLyBUaGlzIGNhdGNoZXMgY2FzZXMgd2hlcmUgdGhlIGFsaWFzIHdhc24ndCB0cmFja2VkIChlLmcuLCBuZXN0ZWQgbG9vcHMgb3IgdW50cmFja2VkIGFsaWFzZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkKSA9PiB7XG4gICAgICAvLyBTa2lwIGlmIGl0IGxvb2tzIGxpa2UgcHJvcGVydGllcy54eHggKGFscmVhZHkgaGFuZGxlZClcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSkpIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhlbHBlciB0byBwYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gIC8vIGFuZCBjb252ZXJ0IHRvIFBIUCBjb21wYXJpc29uIGV4cHJlc3Npb25zXG4gIGNvbnN0IHBhcnNlSGVscGVyVG9QaHAgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSB2YXJpYWJsZSBwYXRoIHRvIFBIUCBleHByZXNzaW9uXG4gICAgLy8gSGFuZGxlcyBwcm9wZXJ0aWVzLnh4eCwgdGhpcy54eHgsIGFuZCBhbGlhcy54eHggcGF0dGVybnNcbiAgICBjb25zdCB2YXJUb1BocCA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGgucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfVsnJHtwYXJ0cy5zbGljZSgxKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICAgIH0gZWxzZSBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgaXMgYSBrbm93biBsb29wIGFsaWFzIChlLmcuLCBjYXJkLnR5cGUgLT4gdHlwZSlcbiAgICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgLy8gQ2hlY2sgbmVzdGVkIGFsaWFzZXMgZmlyc3QgKHVzZSAkc3ViSXRlbSlcbiAgICAgICAgICBpZiAobmVzdGVkTG9vcEFsaWFzZXNbcGFydHNbMF1dIHx8IChhbGlhc1RvRGVwdGhbcGFydHNbMF1dID8/IC0xKSA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlbiBjaGVjayB0b3AtbGV2ZWwgYWxpYXNlcyAodXNlICRpdGVtKVxuICAgICAgICAgIGlmIChsb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2sgLSB1c2UgYXMtaXMgKG1pZ2h0IGJlIGEgcGxhaW4gZmllbGQgbmFtZSlcbiAgICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgICAgfVxuICAgIH07XG4gICAgXG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCB2YXJpYWJsZSkgd2l0aG91dCBxdW90ZXNcbiAgICBjb25zdCBlcVZhck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNdKylcXHMrKFteXFxzKVwiXSspXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFWYXJNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFWYXJNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICBjb25zdCByaWdodEV4cHIgPSB2YXJUb1BocChyaWdodCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICgke3JpZ2h0RXhwcn0gPz8gJycpYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZ3QgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW5cbiAgICBjb25zdCBndE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGd0TWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0TWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPiAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChsdCBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhblxuICAgIGNvbnN0IGx0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgICBpZiAobHRNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8ICR7cmlnaHR9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGd0ZSBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhbiBvciBlcXVhbFxuICAgIGNvbnN0IGd0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChndGVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RlTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPj0gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobHRlIGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuIG9yIGVxdWFsXG4gICAgY29uc3QgbHRlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGx0ZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdGVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8PSAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aG91dCBlbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCR7cGhwQ29uZGl0aW9ufSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGlmL2Vsc2VcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclRvUGhwKGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2VcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjaWYgcHJvcGVydGllcy54eHgueXl5Lnp6ei4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgLy8gZS5nLiwge3sjaWYgcHJvcGVydGllcy5sZWZ0X2NvbHVtbi5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGxlZnRDb2x1bW5bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJCR7Y2FtZWxQcm9wfSkpIDogPz5gO1xuICAgICAgfVxuICAgICAgLy8gQnVpbGQgbmVzdGVkIGFycmF5IGFjY2VzcyBmb3IgcmVtYWluaW5nIHBhcnRzXG4gICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoKHA6IHN0cmluZykgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSkpIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7e2Vsc2V9fSBzZXBhcmF0ZWx5IChmb3IgY2FzZXMgbm90IGNhdWdodCBieSB0aGUgY29tYmluZWQgcGF0dGVybnMgYWJvdmUpXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtlbHNlXFx9XFx9L2csICc8P3BocCBlbHNlIDogPz4nKTtcbiAgXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXC9pZlxcfVxcfS9nLCAnPD9waHAgZW5kaWY7ID8+Jyk7XG4gIFxuICAvLyBJTVBPUlRBTlQ6IENvbnZlcnQgdHJpcGxlLWJyYWNlIGV4cHJlc3Npb25zIEZJUlNUIChiZWZvcmUgZG91YmxlLWJyYWNlKVxuICAvLyBUcmlwbGUgYnJhY2VzIGFyZSBmb3IgdW5lc2NhcGVkIEhUTUwgb3V0cHV0IChyaWNoIHRleHQgZmllbGRzKVxuICBcbiAgLy8gQ29udmVydCB7e3twcm9wZXJ0aWVzLnh4eH19fSB0cmlwbGUgYnJhY2VzICh1bmVzY2FwZWQgSFRNTClcbiAgLy8gcmljaHRleHQgcHJvcHMgdXNlIElubmVyQmxvY2tzIOKAlCBvdXRwdXQgJGNvbnRlbnQgKGlubmVyIGJsb2NrcyByZW5kZXJlZCBIVE1MKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKF8sIHByb3ApID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgaWYgKHJpY2h0ZXh0UHJvcHMuaGFzKHByb3ApIHx8IHJpY2h0ZXh0UHJvcHMuaGFzKGNhbWVsUHJvcCkpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICRjb250ZW50OyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCQke2NhbWVsUHJvcH0gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3t0aGlzLnh4eH19fSB0cmlwbGUgYnJhY2VzIGZvciBsb29wIGl0ZW1zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3thbGlhcy54eHh9fX0gdHJpcGxlIGJyYWNlcyBmb3IgbmFtZWQgbG9vcCBhbGlhc2VzXG4gIC8vIFRoaXMgY2F0Y2hlcyBhbnkgcmVtYWluaW5nIGFsaWFzLmZpZWxkIHBhdHRlcm5zIHdpdGggdHJpcGxlIGJyYWNlc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCBsb29rcyBsaWtlIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7dGhpc319fSBmb3Igc2NhbGFyIGFycmF5cyB3aXRoIEhUTUwgY29udGVudFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnRoaXNcXHMqXFx9XFx9XFx9L2csXG4gICAgJzw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRzdWJJdGVtID8/ICRpdGVtID8/IFxcJ1xcJyk7ID8+J1xuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXN9fSBzaW1wbGUgcmVmZXJlbmNlIChmb3Igc2NhbGFyIGFycmF5cylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFxzKlxcfVxcfS9nLFxuICAgICc8P3BocCBlY2hvIGVzY19odG1sKCRzdWJJdGVtID8/ICRpdGVtID8/IFxcJ1xcJyk7ID8+J1xuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXMueHh4Lnl5eX19IGRlZXAgbmVzdGVkIHJlZmVyZW5jZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkMiA9PT0gJ3VybCcgfHwgZmllbGQyID09PSAnc3JjJyB8fCBmaWVsZDIgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkaXRlbVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzLnh4eH19IHJlZmVyZW5jZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkaXRlbVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7cHJvcGVydGllcy54eHgueXl5Lnp6ei4uLn19IGRlZXBseSBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzIChhbnkgZGVwdGgpXG4gIC8vIGUuZy4sIHt7cHJvcGVydGllcy5sZWZ0X2NvbHVtbi5jdGEubGluay5sYWJlbH19IC0+ICRsZWZ0Q29sdW1uWydjdGEnXVsnbGluayddWydsYWJlbCddXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGNvbnN0IGxhc3RQYXJ0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBlc2NGdW5jID0gbGFzdFBhcnQgPT09ICd1cmwnIHx8IGxhc3RQYXJ0ID09PSAnc3JjJyB8fCBsYXN0UGFydCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIFxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkJHtjYW1lbFByb3B9ID8/ICcnKTsgPz5gO1xuICAgICAgfVxuICAgICAgLy8gQnVpbGQgbmVzdGVkIGFycmF5IGFjY2VzcyBmb3IgcmVtYWluaW5nIHBhcnRzXG4gICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoKHA6IHN0cmluZykgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkJHtjYW1lbFByb3B9JHtuZXN0ZWRBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIHt7eHh4Lnl5eX19IHBhdHRlcm5zIChsaWtlbHkgbG9vcCBpdGVtIHJlZmVyZW5jZXMgd2l0aG91dCB0aGlzLilcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceytcXHMqKFxcdyspXFwuKFxcdyspXFxzKlxcfStcXH0vZyxcbiAgICAoXywgb2JqLCBmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCBsb29rcyBsaWtlIGEgUEhQIGV4cHJlc3Npb25cbiAgICAgIGlmIChvYmouaW5jbHVkZXMoJyQnKSB8fCBvYmouaW5jbHVkZXMoJ3BocCcpKSByZXR1cm4gYHt7JHtvYmp9LiR7ZmllbGR9fX1gO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyB8fCBmaWVsZCA9PT0gJ2xhYmVsJyA/IFxuICAgICAgICAoZmllbGQgPT09ICd1cmwnIHx8IGZpZWxkID09PSAnc3JjJyB8fCBmaWVsZCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJykgOiAnZXNjX2h0bWwnO1xuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbb2JqXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGhyZWY9XCJ7e3Byb3BlcnRpZXMueHh4Lnl5eX19XCIgcGF0dGVybnMgc3BlY2lmaWNhbGx5XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eH19XCIgcGF0dGVybnNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9ID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIGhyZWY9XCJ7ey4uLn19XCIgcGF0dGVybnMgKGZvciBsb29wIGl0ZW0gcmVmZXJlbmNlcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHsrKFtefV0rKVxcfStcXH1cIi9nLFxuICAgIChfLCBleHByKSA9PiB7XG4gICAgICBpZiAoZXhwci5pbmNsdWRlcygnPD9waHAnKSkgcmV0dXJuIGBocmVmPVwiJHtleHByfVwiYDtcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSB0aGlzLnh4eCBwYXR0ZXJuXG4gICAgICBjb25zdCB0aGlzTWF0Y2ggPSBleHByLm1hdGNoKC9eXFxzKnRoaXNcXC4oXFx3KykoPzpcXC4oXFx3KykpP1xccyokLyk7XG4gICAgICBpZiAodGhpc01hdGNoKSB7XG4gICAgICAgIGNvbnN0IFssIGZpZWxkMSwgZmllbGQyXSA9IHRoaXNNYXRjaDtcbiAgICAgICAgaWYgKGZpZWxkMikge1xuICAgICAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcjJyk7ID8+XCJgO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVsnJHtmaWVsZDF9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ2hyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bXFwndXJsXFwnXSA/PyAkaXRlbVtcXCdsaW5rXFwnXVtcXCd1cmxcXCddID8/IFxcJyNcXCcpOyA/PlwiJztcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDbGVhbiB1cCBhbnkgc3RyYXkgY3VybHkgYnJhY2VzIGFyb3VuZCBQSFAgZWNobyBzdGF0ZW1lbnRzXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHsoPFxcP3BocCBlY2hvKS9nLCAnJDEnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLyg7IFxcPz4pXFx9L2csICckMScpO1xuICBcbiAgcmV0dXJuIHBocC50cmltKCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGF0dHJpYnV0ZSBleHRyYWN0aW9uIGNvZGVcbiAqL1xuY29uc3QgZ2VuZXJhdGVBdHRyaWJ1dGVFeHRyYWN0aW9uID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsKTogc3RyaW5nID0+IHtcbiAgY29uc3QgZXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHZpZGVvTm9ybWFsaXphdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIE9ubHkgdGhlIGlubmVyQmxvY2tzRmllbGQgcmljaHRleHQgdXNlcyAkY29udGVudCDigJQgc2tpcCBhdHRyaWJ1dGUgZXh0cmFjdGlvbiBmb3IgaXRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgPT09IGlubmVyQmxvY2tzRmllbGQpIGNvbnRpbnVlO1xuICAgIC8vIHBhZ2luYXRpb24gaXRlbXMgYXJlIGF1dG8tZ2VuZXJhdGVkIGZyb20gV1BfUXVlcnkg4oCUIG5vIGF0dHJpYnV0ZSB0byBleHRyYWN0XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG5cbiAgICBjb25zdCBjYW1lbEtleSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gZ2V0UGhwRGVmYXVsdFZhbHVlKHByb3BlcnR5KTtcbiAgICBcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkJHtjYW1lbEtleX0gPSBpc3NldCgkYXR0cmlidXRlc1snJHtjYW1lbEtleX0nXSkgPyAkYXR0cmlidXRlc1snJHtjYW1lbEtleX0nXSA6ICR7ZGVmYXVsdFZhbHVlfTtgKTtcblxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAndmlkZW8nKSB7XG4gICAgICB2aWRlb05vcm1hbGl6YXRpb25zLnB1c2goYGlmIChpc19hcnJheSgkJHtjYW1lbEtleX0pKSB7XG4gIGlmIChlbXB0eSgkJHtjYW1lbEtleX1bJ2lkJ10pICYmICFlbXB0eSgkJHtjYW1lbEtleX1bJ3NyYyddKSAmJiBwcmVnX21hdGNoKCcjKD86bWVkaWFzL3xpZnJhbWUvKShbQS1aYS16MC05XSspIycsIChzdHJpbmcpICQke2NhbWVsS2V5fVsnc3JjJ10sICRtYXRjaGVzKSkge1xuICAgICQke2NhbWVsS2V5fVsnaWQnXSA9ICRtYXRjaGVzWzFdO1xuICB9XG4gIGlmIChlbXB0eSgkJHtjYW1lbEtleX1bJ3NyYyddKSAmJiAhZW1wdHkoJCR7Y2FtZWxLZXl9WydpZCddKSkge1xuICAgICQke2NhbWVsS2V5fVsnc3JjJ10gPSAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzLycgLiByYXd1cmxlbmNvZGUoKHN0cmluZykgJCR7Y2FtZWxLZXl9WydpZCddKSAuICcuanNvbnAnO1xuICB9XG59YCk7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gWy4uLmV4dHJhY3Rpb25zLCAuLi52aWRlb05vcm1hbGl6YXRpb25zXS5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogV3JhcCB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgdGhhdCBoYW5kbGVzIGFsaWdubWVudFxuICogQWRkcyB0aGUgYWxpZ25tZW50IGNsYXNzIChhbGlnbm5vbmUsIGFsaWdud2lkZSwgYWxpZ25mdWxsKSBiYXNlZCBvbiBibG9jayBzZXR0aW5nc1xuICovXG5jb25zdCB3cmFwV2l0aEJsb2NrV3JhcHBlciA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjb21wb25lbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gQ29udmVydCBjb21wb25lbnQgSUQgdG8gY2xhc3MgbmFtZSAoc25ha2VfY2FzZSB0byBrZWJhYi1jYXNlKVxuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSBpbiBhIGRpdiB0aGF0IHVzZXMgV29yZFByZXNzJ3MgYmxvY2sgd3JhcHBlciBhdHRyaWJ1dGVzXG4gIC8vIFRoaXMgaGFuZGxlcyBhbGlnbm1lbnQgY2xhc3NlcyBhdXRvbWF0aWNhbGx5XG4gIHJldHVybiBgPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7Y2xhc3NOYW1lfSddKTsgPz4+XG4ke3RlbXBsYXRlfVxuPC9kaXY+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgUEhQIGNvZGUgdG8gY29udmVydCBmaWVsZCBtYXBwaW5nIHZhbHVlIHRvIFBIUCBhcnJheSBzeW50YXhcbiAqL1xuY29uc3QgZmllbGRNYXBwaW5nVG9QaHAgPSAobWFwcGluZzogUmVjb3JkPHN0cmluZywgRmllbGRNYXBwaW5nVmFsdWU+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1hcHBpbmcpKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIFNpbXBsZSBzdHJpbmcgbWFwcGluZ1xuICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gJyR7dmFsdWV9J2ApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS50eXBlKSB7XG4gICAgICAvLyBDb21wbGV4IG1hcHBpbmdcbiAgICAgIHN3aXRjaCAodmFsdWUudHlwZSkge1xuICAgICAgICBjYXNlICdzdGF0aWMnOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ3N0YXRpYycsICd2YWx1ZScgPT4gJyR7KHZhbHVlIGFzIGFueSkudmFsdWUgfHwgJyd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbWFudWFsJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtYW51YWwnXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdtZXRhJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtZXRhJywgJ2tleScgPT4gJyR7KHZhbHVlIGFzIGFueSkua2V5IHx8ICcnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RheG9ub215JzpcbiAgICAgICAgICBjb25zdCB0YXhWYWx1ZSA9IHZhbHVlIGFzIHsgdHlwZTogJ3RheG9ub215JzsgdGF4b25vbXk6IHN0cmluZzsgZm9ybWF0Pzogc3RyaW5nIH07XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAndGF4b25vbXknLCAndGF4b25vbXknID0+ICcke3RheFZhbHVlLnRheG9ub215fScsICdmb3JtYXQnID0+ICcke3RheFZhbHVlLmZvcm1hdCB8fCAnZmlyc3QnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2N1c3RvbSc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnY3VzdG9tJywgJ2NhbGxiYWNrJyA9PiAnJHsodmFsdWUgYXMgYW55KS5jYWxsYmFjayB8fCAnJ30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGBbXFxuJHtlbnRyaWVzLmpvaW4oJyxcXG4nKX1cXG4gIF1gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBwYWdpbmF0aW9uIFBIUCBjb2RlIGZvciBhIGR5bmFtaWMgYXJyYXkgcXVlcnkuXG4gKiBSZXR1cm5zIHRoZSBwYWdpbmF0aW9uIGJsb2NrIHRvIGFwcGVuZCBhZnRlciB0aGUgV1BfUXVlcnkgZXhlY3V0aW9uLlxuICovXG5jb25zdCBnZW5lcmF0ZVBhZ2luYXRpb25QaHAgPSAoXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIHBhZ2luYXRpb25Qcm9wTmFtZTogc3RyaW5nXG4pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gYFxuICAvLyBQYWdpbmF0aW9uXG4gICQke3BhZ2luYXRpb25Qcm9wTmFtZX0gPSBbXTtcbiAgJCR7YXR0ck5hbWV9X3BhZ2luYXRpb25fZW5hYmxlZCA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkJ10gPz8gdHJ1ZTtcbiAgaWYgKCQke2F0dHJOYW1lfV9wYWdpbmF0aW9uX2VuYWJsZWQgJiYgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzID4gMSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbicpKSB7XG4gICAgJCR7cGFnaW5hdGlvblByb3BOYW1lfSA9IGhhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbigkaGZfcGFnZWQsICRxdWVyeS0+bWF4X251bV9wYWdlcywgJyR7YGhmX3BhZ2VfJHthdHRyTmFtZX1gfScpO1xuICB9YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIHBhZ2VkIHZhcmlhYmxlIGV4dHJhY3Rpb24gYW5kIFdQX1F1ZXJ5IHBhZ2VkIGFyZyBmb3IgcGFnaW5hdGlvbi5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdlZFBocCA9IChhdHRyTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcGFyYW1LZXkgPSBgaGZfcGFnZV8ke2F0dHJOYW1lfWA7XG4gIHJldHVybiBgXG4gIC8vIFJlYWQgY3VycmVudCBwYWdlIGZyb20gY3VzdG9tIHF1ZXJ5IHBhcmFtZXRlclxuICAkaGZfcGFnZWQgPSBpc3NldCgkX0dFVFsnJHtwYXJhbUtleX0nXSkgPyBtYXgoMSwgaW50dmFsKCRfR0VUWycke3BhcmFtS2V5fSddKSkgOiAxO2A7XG59O1xuXG4vKipcbiAqIEJ1aWxkIFBIUCBhcnJheV9tYXAgZXhwcmVzc2lvbiB0byByZXNoYXBlIHN0YW5kYXJkIGhlbHBlciBpdGVtcyBpbnRvIHRoZVxuICogdGVtcGxhdGUncyBleHBlY3RlZCBpdGVtIHNoYXBlLiAgUmV0dXJucyBudWxsIHdoZW4gbm8gcmVzaGFwaW5nIGlzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gaXRlbVByb3BlcnRpZXMgIFRoZSBjb21wb25lbnQncyBhcnJheSBpdGVtIHByb3BlcnR5IHNjaGVtYSAoaXRlbXMucHJvcGVydGllcylcbiAqIEBwYXJhbSBzdGFuZGFyZEZpZWxkcyAgVGhlIGZsYXQgZmllbGQgbmFtZXMgdGhlIGhlbHBlciByZXR1cm5zIChlLmcuIFsnbGFiZWwnLCd1cmwnXSlcbiAqL1xuY29uc3QgYnVpbGRSZXNoYXBlUGhwID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG5cbiAgLy8gSWYgZXZlcnkgdG9wLWxldmVsIGtleSBJUyBhIHN0YW5kYXJkIGZpZWxkIHRoZSBzaGFwZXMgYWxyZWFkeSBtYXRjaFxuICBpZiAodG9wS2V5cy5ldmVyeShrID0+IHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGspKSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgcGFpcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbVByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIHBhaXJzLnB1c2goYCcke2tleX0nID0+ICRfX2l0ZW1bJyR7a2V5fSddYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJyB8fCBwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ2xhYmVsJykpIHN1Yi5wdXNoKGAnbGFiZWwnID0+ICRfX2l0ZW1bJ2xhYmVsJ11gKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYCd1cmwnICAgPT4gJF9faXRlbVsndXJsJ11gKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAnJHtrZXl9JyA9PiBbJHtzdWIuam9pbignLCAnKX1dYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgZm9yIChjb25zdCBzdWJLZXkgb2YgT2JqZWN0LmtleXMocHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoc3ViS2V5KSkge1xuICAgICAgICAgIHN1Yi5wdXNoKGAnJHtzdWJLZXl9JyA9PiAkX19pdGVtWycke3N1YktleX0nXWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJyR7a2V5fScgPT4gWyR7c3ViLmpvaW4oJywgJyl9XWApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYWlycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gYFske3BhaXJzLmpvaW4oJywgJyl9XWA7XG59O1xuXG4vKipcbiAqIEJ1aWxkIGVxdWl2YWxlbnQgSlMgcmVzaGFwZSBleHByZXNzaW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAqIFJldHVybnMgbnVsbCB3aGVuIG5vIHJlc2hhcGluZyBpcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGJ1aWxkUmVzaGFwZUpzID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG4gIGlmICh0b3BLZXlzLmV2ZXJ5KGsgPT4gc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoaykpKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBwYWlyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhpdGVtUHJvcGVydGllcykpIHtcbiAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgcGFpcnMucHVzaChgJHtrZXl9OiBpdGVtLiR7a2V5fWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnbGluaycgfHwgcHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCdsYWJlbCcpKSBzdWIucHVzaChgbGFiZWw6IGl0ZW0ubGFiZWxgKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYHVybDogaXRlbS51cmxgKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAke2tleX06IHsgJHtzdWIuam9pbignLCAnKX0gfWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGZvciAoY29uc3Qgc3ViS2V5IG9mIE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKHN1YktleSkpIHtcbiAgICAgICAgICBzdWIucHVzaChgJHtzdWJLZXl9OiBpdGVtLiR7c3ViS2V5fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJHtrZXl9OiB7ICR7c3ViLmpvaW4oJywgJyl9IH1gKTtcbiAgICB9XG4gIH1cblxuICBpZiAocGFpcnMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGAoeyAke3BhaXJzLmpvaW4oJywgJyl9IH0pYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYnJlYWRjcnVtYnMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogQ2FsbHMgaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcygpIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHJldHVybnMgYW4gZW1wdHkgYXJyYXkuXG4gKi9cbmNvbnN0IGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnXSk7XG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7XG4gICAgJCR7YXR0ck5hbWV9ID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCRfX2l0ZW0pIHsgcmV0dXJuICR7cmVzaGFwZUV4cHJ9OyB9LCAkX19yYXcpO2BcbiAgICA6IGAkJHthdHRyTmFtZX0gPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7YDtcblxuICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChicmVhZGNydW1icylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCFmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMnKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zJykpIHtcbiAgICAke2Fzc2lnbkl0ZW1zfVxuICB9XG59XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0YXhvbm9teSB0ZXJtcyBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG1heEl0ZW1zID0gY29uZmlnLm1heEl0ZW1zID8/IC0xO1xuICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBjb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcblxuICAvLyBCdWlsZCB0aGUgcGVyLXRlcm0gYXNzaWdubWVudDogZWl0aGVyIGZsYXQgb3IgcmVzaGFwZWRcbiAgbGV0IHRlcm1Bc3NpZ25tZW50OiBzdHJpbmc7XG4gIGlmIChyZXNoYXBlRXhwcikge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJF9faXRlbSA9IFsnbGFiZWwnID0+ICR0ZXJtLT5uYW1lLCAndXJsJyA9PiBnZXRfdGVybV9saW5rKCR0ZXJtKSwgJ3NsdWcnID0+ICR0ZXJtLT5zbHVnXTtcbiAgICAgICAgJCR7YXR0ck5hbWV9W10gPSAke3Jlc2hhcGVFeHByfTtgO1xuICB9IGVsc2Uge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJCR7YXR0ck5hbWV9W10gPSBbXG4gICAgICAgICAgJ2xhYmVsJyA9PiAkdGVybS0+bmFtZSxcbiAgICAgICAgICAndXJsJyAgID0+IGdldF90ZXJtX2xpbmsoJHRlcm0pLFxuICAgICAgICAgICdzbHVnJyAgPT4gJHRlcm0tPnNsdWcsXG4gICAgICAgIF07YDtcbiAgfVxuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHRheG9ub215IHRlcm1zKVxuJCR7YXR0ck5hbWV9RW5hYmxlZCAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gID8/IGZhbHNlO1xuJCR7YXR0ck5hbWV9VGF4b25vbXkgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1UYXhvbm9teSddID8/ICcke2RlZmF1bHRUYXhvbm9teX0nO1xuJCR7YXR0ck5hbWV9U291cmNlICAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSAgID8/ICdhdXRvJztcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCQke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAkJHthdHRyTmFtZX0gPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX0nXSA/PyBbXTtcbiAgfSBlbHNlIHtcbiAgICAkdGVybXMgPSB3cF9nZXRfcG9zdF90ZXJtcyhnZXRfdGhlX0lEKCksICQke2F0dHJOYW1lfVRheG9ub215LCBbJ251bWJlcicgPT4gJHttYXhJdGVtc31dKTtcbiAgICBpZiAoIWlzX3dwX2Vycm9yKCR0ZXJtcykpIHtcbiAgICAgIGZvcmVhY2ggKCR0ZXJtcyBhcyAkdGVybSkge1xuJHt0ZXJtQXNzaWdubWVudH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHBhZ2luYXRpb24gYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogUmVmZXJlbmNlcyB0aGUgV1BfUXVlcnkgaW5zdGFuY2UgKCRxdWVyeSkgcHJvZHVjZWQgYnkgdGhlIGNvbm5lY3RlZCBwb3N0cyBmaWVsZC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgY29uZmlnOiBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbm5lY3RlZEF0dHIgPSB0b0NhbWVsQ2FzZShjb25maWcuY29ubmVjdGVkRmllbGQpO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnYWN0aXZlJ10pO1xuXG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24oJGhmX3BhZ2VkXyR7Y29ubmVjdGVkQXR0cn0sICRxdWVyeS0+bWF4X251bV9wYWdlcywgJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfScpO1xuICAgICQke2F0dHJOYW1lfSA9IGFycmF5X21hcChmdW5jdGlvbigkX19pdGVtKSB7IHJldHVybiAke3Jlc2hhcGVFeHByfTsgfSwgJF9fcmF3KTtgXG4gICAgOiBgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uKCRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9LCAkcXVlcnktPm1heF9udW1fcGFnZXMsICdoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nKTtgO1xuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHBhZ2luYXRpb24g4oCUIGNvbm5lY3RlZCB0byAnJHtjb25maWcuY29ubmVjdGVkRmllbGR9JylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQgJiYgaXNzZXQoJHF1ZXJ5KSAmJiAkcXVlcnktPm1heF9udW1fcGFnZXMgPiAxKSB7XG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9ID0gaXNzZXQoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSA/IG1heCgxLCBpbnR2YWwoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSkgOiAxO1xuICAgICR7YXNzaWduSXRlbXN9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGR5bmFtaWMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwXG4gKiBTdXBwb3J0cyBib3RoIG1hbnVhbCBwb3N0IHNlbGVjdGlvbiBhbmQgcXVlcnkgYnVpbGRlciBtb2Rlc1xuICovXG5jb25zdCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IER5bmFtaWNBcnJheUNvbmZpZ1xuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbWFwcGluZ1BocCA9IGNvbmZpZy5maWVsZE1hcHBpbmcgXG4gICAgPyBmaWVsZE1hcHBpbmdUb1BocChjb25maWcuZmllbGRNYXBwaW5nKSBcbiAgICA6ICdbXSc7XG4gIFxuICBjb25zdCBpc1F1ZXJ5TW9kZSA9IGNvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAncXVlcnknO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uID0gaXNRdWVyeU1vZGUgJiYgISFjb25maWcucGFnaW5hdGlvbjtcbiAgY29uc3QgcGFnaW5hdGlvblByb3BOYW1lID0gY29uZmlnLnBhZ2luYXRpb24/LnByb3BlcnR5TmFtZSB8fCAncGFnaW5hdGlvbic7XG4gIFxuICAvLyBDb21tb24gY29kZSBmb3IgbG9hZGluZyB0aGUgZmllbGQgcmVzb2x2ZXJcbiAgY29uc3QgbG9hZFJlc29sdmVyID0gYFxuICAvLyBFbnN1cmUgZmllbGQgcmVzb2x2ZXIgaXMgbG9hZGVkXG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpIFxuICAgICAgPyBIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSIC4gJ2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJ1xuICAgICAgOiBkaXJuYW1lKF9fRklMRV9fKSAuICcvLi4vaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnO1xuICAgIGlmIChmaWxlX2V4aXN0cygkcmVzb2x2ZXJfcGF0aCkpIHtcbiAgICAgIHJlcXVpcmVfb25jZSAkcmVzb2x2ZXJfcGF0aDtcbiAgICB9XG4gIH1gO1xuXG4gIC8vIFBhZ2luYXRpb24gUEhQIHNuaXBwZXRzIChlbXB0eSBzdHJpbmdzIHdoZW4gbm8gcGFnaW5hdGlvbilcbiAgY29uc3QgcGFnZWRFeHRyYWN0aW9uID0gaGFzUGFnaW5hdGlvbiA/IGdlbmVyYXRlUGFnZWRQaHAoYXR0ck5hbWUpIDogJyc7XG4gIGNvbnN0IHBhZ2VkQXJnID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4gICAgJ3BhZ2VkJyAgICAgICAgICA9PiAkaGZfcGFnZWQsYCA6ICcnO1xuICBjb25zdCBwYWdpbmF0aW9uQmxvY2sgPSBoYXNQYWdpbmF0aW9uID8gZ2VuZXJhdGVQYWdpbmF0aW9uUGhwKGF0dHJOYW1lLCBwYWdpbmF0aW9uUHJvcE5hbWUpIDogJyc7XG4gIC8vIEluaXRpYWxpemUgcGFnaW5hdGlvbiB2YXJpYWJsZSB0byBlbXB0eSBhcnJheSB3aGVuIG5vdCBpbiBxdWVyeSBtb2RlXG4gIGNvbnN0IHBhZ2luYXRpb25Jbml0ID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4kJHtwYWdpbmF0aW9uUHJvcE5hbWV9ID0gW107YCA6ICcnO1xuXG4gIGlmIChjb25maWcucmVuZGVyTW9kZSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIC8vIFRlbXBsYXRlIG1vZGUgLSBzdG9yZSBwb3N0cyBmb3IgdGVtcGxhdGUgcmVuZGVyaW5nXG4gICAgY29uc3QgdGVtcGxhdGVQYXRoID0gY29uZmlnLnRlbXBsYXRlUGF0aCB8fCBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2ZpZWxkTmFtZX0taXRlbS5waHBgO1xuICAgIFxuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIC0gdXNlIFdQX1F1ZXJ5IHdpdGggcXVlcnkgYXJnc1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAocXVlcnkgYnVpbGRlciArIHRlbXBsYXRlIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5JztcbiQke2F0dHJOYW1lfV9wb3N0cyA9IFtdOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAncXVlcnknKSB7XG4gIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSAtIGJ1aWxkIFdQX1F1ZXJ5IGZyb20gc2F2ZWQgYXJnc1xuICAkcXVlcnlfYXJncyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVF1ZXJ5QXJncyddID8/IFtdOyR7cGFnZWRFeHRyYWN0aW9ufVxuICBcbiAgLy8gQnVpbGQgV1BfUXVlcnkgYXJndW1lbnRzXG4gICR3cF9xdWVyeV9hcmdzID0gW1xuICAgICdwb3N0X3R5cGUnICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RfdHlwZSddID8/ICcke2NvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgY29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCd9JyxcbiAgICAncG9zdHNfcGVyX3BhZ2UnID0+ICRxdWVyeV9hcmdzWydwb3N0c19wZXJfcGFnZSddID8/ICR7Y29uZmlnLm1heEl0ZW1zIHx8IDZ9LFxuICAgICdvcmRlcmJ5JyAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyYnknXSA/PyAnZGF0ZScsXG4gICAgJ29yZGVyJyAgICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXInXSA/PyAnREVTQycsXG4gICAgJ3Bvc3Rfc3RhdHVzJyAgICA9PiAncHVibGlzaCcsJHtwYWdlZEFyZ31cbiAgXTtcbiAgXG4gIC8vIEV4Y2x1ZGUgdGhlIGN1cnJlbnQgcG9zdCB0byBwcmV2ZW50IHNlbGYtcmVmZXJlbmNlXG4gICRjdXJyZW50X3Bvc3RfaWQgPSBnZXRfdGhlX0lEKCk7XG4gIGlmICgkY3VycmVudF9wb3N0X2lkKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3Bvc3RfX25vdF9pbiddID0gWyRjdXJyZW50X3Bvc3RfaWRdO1xuICB9XG4gIFxuICAvLyBBZGQgdGF4b25vbXkgcXVlcmllcyBpZiBwcmVzZW50XG4gIGlmICghZW1wdHkoJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKSkge1xuICAgICR3cF9xdWVyeV9hcmdzWyd0YXhfcXVlcnknXSA9IGFycmF5X21hcChmdW5jdGlvbigkdHEpIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgICd0YXhvbm9teScgPT4gJHRxWyd0YXhvbm9teSddID8/ICcnLFxuICAgICAgICAnZmllbGQnICAgID0+ICR0cVsnZmllbGQnXSA/PyAndGVybV9pZCcsXG4gICAgICAgICd0ZXJtcycgICAgPT4gJHRxWyd0ZXJtcyddID8/IFtdLFxuICAgICAgICAnb3BlcmF0b3InID0+ICR0cVsnb3BlcmF0b3InXSA/PyAnSU4nLFxuICAgICAgXTtcbiAgICB9LCAkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pO1xuICB9XG4gIFxuICAkcXVlcnkgPSBuZXcgV1BfUXVlcnkoJHdwX3F1ZXJ5X2FyZ3MpO1xuICAkJHthdHRyTmFtZX1fcG9zdHMgPSAkcXVlcnktPnBvc3RzOyR7cGFnaW5hdGlvbkJsb2NrfVxuICB3cF9yZXNldF9wb3N0ZGF0YSgpO1xufVxuLy8gRm9yIHRlbXBsYXRlIG1vZGUsIHRoZSB0ZW1wbGF0ZSB3aWxsIGl0ZXJhdGUgb3ZlciAkJHthdHRyTmFtZX1fcG9zdHNcbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE1hbnVhbCBzZWxlY3Rpb24gbW9kZSAtIGZldGNoIHNwZWNpZmljIHBvc3RzXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChzZWxlY3QgcG9zdHMgKyB0ZW1wbGF0ZSBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7XG4kJHthdHRyTmFtZX1fcG9zdHMgPSBbXTske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICBcbiAgaWYgKCFlbXB0eSgkc2VsZWN0ZWRfcG9zdHMpKSB7XG4gICAgJHBvc3RfaWRzID0gYXJyYXlfZmlsdGVyKGFycmF5X21hcChmdW5jdGlvbigkcCkgeyBcbiAgICAgIHJldHVybiBpc3NldCgkcFsnaWQnXSkgPyBpbnR2YWwoJHBbJ2lkJ10pIDogMDsgXG4gICAgfSwgJHNlbGVjdGVkX3Bvc3RzKSk7XG4gICAgXG4gICAgaWYgKCFlbXB0eSgkcG9zdF9pZHMpKSB7XG4gICAgICAkJHthdHRyTmFtZX1fcG9zdHMgPSBnZXRfcG9zdHMoW1xuICAgICAgICAncG9zdF9faW4nICAgICAgID0+ICRwb3N0X2lkcyxcbiAgICAgICAgJ29yZGVyYnknICAgICAgICA9PiAncG9zdF9faW4nLFxuICAgICAgICAncG9zdHNfcGVyX3BhZ2UnID0+IGNvdW50KCRwb3N0X2lkcyksXG4gICAgICAgICdwb3N0X3N0YXR1cycgICAgPT4gJ3B1Ymxpc2gnLFxuICAgICAgICAncG9zdF90eXBlJyAgICAgID0+ICdhbnknLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG59XG4vLyBGb3IgdGVtcGxhdGUgbW9kZSwgdGhlIHRlbXBsYXRlIHdpbGwgaXRlcmF0ZSBvdmVyICQke2F0dHJOYW1lfV9wb3N0c1xuYDtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gTWFwcGVkIG1vZGUgLSBjb252ZXJ0IHBvc3RzIHRvIGl0ZW0gc3RydWN0dXJlXG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgd2l0aCBmaWVsZCBtYXBwaW5nXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChxdWVyeSBidWlsZGVyICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgLSBidWlsZCBXUF9RdWVyeSBmcm9tIHNhdmVkIGFyZ3NcbiAgJHF1ZXJ5X2FyZ3MgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1RdWVyeUFyZ3MnXSA/PyBbXTtcbiAgJGZpZWxkX21hcHBpbmcgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1GaWVsZE1hcHBpbmcnXSA/PyAke21hcHBpbmdQaHB9O1xuJHtsb2FkUmVzb2x2ZXJ9JHtwYWdlZEV4dHJhY3Rpb259XG4gIFxuICAvLyBCdWlsZCBXUF9RdWVyeSBhcmd1bWVudHNcbiAgJHdwX3F1ZXJ5X2FyZ3MgPSBbXG4gICAgJ3Bvc3RfdHlwZScgICAgICA9PiAkcXVlcnlfYXJnc1sncG9zdF90eXBlJ10gPz8gJyR7Y29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBjb25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0J30nLFxuICAgICdwb3N0c19wZXJfcGFnZScgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RzX3Blcl9wYWdlJ10gPz8gJHtjb25maWcubWF4SXRlbXMgfHwgNn0sXG4gICAgJ29yZGVyYnknICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXJieSddID8/ICdkYXRlJyxcbiAgICAnb3JkZXInICAgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlciddID8/ICdERVNDJyxcbiAgICAncG9zdF9zdGF0dXMnICAgID0+ICdwdWJsaXNoJywke3BhZ2VkQXJnfVxuICBdO1xuICBcbiAgLy8gRXhjbHVkZSB0aGUgY3VycmVudCBwb3N0IHRvIHByZXZlbnQgc2VsZi1yZWZlcmVuY2VcbiAgJGN1cnJlbnRfcG9zdF9pZCA9IGdldF90aGVfSUQoKTtcbiAgaWYgKCRjdXJyZW50X3Bvc3RfaWQpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sncG9zdF9fbm90X2luJ10gPSBbJGN1cnJlbnRfcG9zdF9pZF07XG4gIH1cbiAgXG4gIC8vIEFkZCB0YXhvbm9teSBxdWVyaWVzIGlmIHByZXNlbnRcbiAgaWYgKCFlbXB0eSgkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCR0cSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgJ3RheG9ub215JyA9PiAkdHFbJ3RheG9ub215J10gPz8gJycsXG4gICAgICAgICdmaWVsZCcgICAgPT4gJHRxWydmaWVsZCddID8/ICd0ZXJtX2lkJyxcbiAgICAgICAgJ3Rlcm1zJyAgICA9PiAkdHFbJ3Rlcm1zJ10gPz8gW10sXG4gICAgICAgICdvcGVyYXRvcicgPT4gJHRxWydvcGVyYXRvciddID8/ICdJTicsXG4gICAgICBdO1xuICAgIH0sICRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSk7XG4gIH1cbiAgXG4gICRxdWVyeSA9IG5ldyBXUF9RdWVyeSgkd3BfcXVlcnlfYXJncyk7XG4gIFxuICAvLyBNYXAgcG9zdHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlXG4gICQke2F0dHJOYW1lfSA9IFtdO1xuICBpZiAoJHF1ZXJ5LT5oYXZlX3Bvc3RzKCkgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgIGZvcmVhY2ggKCRxdWVyeS0+cG9zdHMgYXMgJHBvc3QpIHtcbiAgICAgICQke2F0dHJOYW1lfVtdID0gaGFuZG9mZl9tYXBfcG9zdF90b19pdGVtKCRwb3N0LT5JRCwgJGZpZWxkX21hcHBpbmcpO1xuICAgIH1cbiAgfVxuICAvLyBBcHBseSBpdGVtIG92ZXJyaWRlcyAoZS5nLiBjYXJkIHR5cGUgZm9yIGFsbCBpdGVtcykgZnJvbSBBZHZhbmNlZCBvcHRpb25zXG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH0ke3BhZ2luYXRpb25CbG9ja31cbiAgd3BfcmVzZXRfcG9zdGRhdGEoKTtcbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNlbGVjdCBwb3N0cyBtb2RlIHdpdGggZmllbGQgbWFwcGluZ1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAoc2VsZWN0IHBvc3RzICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICAkZmllbGRfbWFwcGluZyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUZpZWxkTWFwcGluZyddID8/ICR7bWFwcGluZ1BocH07XG4ke2xvYWRSZXNvbHZlcn1cbiAgXG4gIGlmICghZW1wdHkoJHNlbGVjdGVkX3Bvc3RzKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfcXVlcnlfYW5kX21hcF9wb3N0cycpKSB7XG4gICAgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9xdWVyeV9hbmRfbWFwX3Bvc3RzKCRzZWxlY3RlZF9wb3N0cywgJGZpZWxkX21hcHBpbmcpO1xuICB9IGVsc2Uge1xuICAgICQke2F0dHJOYW1lfSA9IFtdO1xuICB9XG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH1cbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIHJlbmRlci5waHAgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICovXG5jb25zdCBnZW5lcmF0ZVJlbmRlclBocCA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbFxuKTogc3RyaW5nID0+IHtcbiAgLy8gT25seSB0aGUgaW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCB1c2VzICRjb250ZW50IChJbm5lckJsb2Nrcyk7XG4gIC8vIG90aGVyIHJpY2h0ZXh0IGZpZWxkcyBhcmUgcmVuZGVyZWQgZnJvbSB0aGVpciBzdHJpbmcgYXR0cmlidXRlcy5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAoaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKGlubmVyQmxvY2tzRmllbGQpO1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGF0dHJpYnV0ZUV4dHJhY3Rpb24gPSBnZW5lcmF0ZUF0dHJpYnV0ZUV4dHJhY3Rpb24oY29tcG9uZW50LnByb3BlcnRpZXMsIGlubmVyQmxvY2tzRmllbGQpO1xuICBjb25zdCB3aXN0aWFFbnF1ZXVlQ29kZSA9IGdlbmVyYXRlV2lzdGlhRW5xdWV1ZUNvZGUoY29tcG9uZW50LmNvZGUpO1xuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChzdHJpcFdpc3RpYVNjcmlwdFRhZ3MoY29tcG9uZW50LmNvZGUpLCBjb21wb25lbnQucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBkeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gY29kZVxuICBjb25zdCBkeW5hbWljQXJyYXlFeHRyYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5hbWljQXJyYXlDb2RlID0gZHluYW1pY0FycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgZm9yIGFsaWdubWVudCBzdXBwb3J0XG4gIGNvbnN0IHdyYXBwZWRUZW1wbGF0ZSA9IHdyYXBXaXRoQmxvY2tXcmFwcGVyKHRlbXBsYXRlUGhwLCBjb21wb25lbnQuaWQpO1xuICBcbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7Y29tcG9uZW50LnRpdGxlfVxuICpcbiAqIEBwYXJhbSBhcnJheSAgICAkYXR0cmlidXRlcyBCbG9jayBhdHRyaWJ1dGVzLlxuICogQHBhcmFtIHN0cmluZyAgICRjb250ZW50ICAgIEJsb2NrIGRlZmF1bHQgY29udGVudC5cbiAqIEBwYXJhbSBXUF9CbG9jayAkYmxvY2sgICAgICBCbG9jayBpbnN0YW5jZS5cbiAqIEByZXR1cm4gc3RyaW5nIFJldHVybnMgdGhlIGJsb2NrIG1hcmt1cC5cbiAqL1xuXG5pZiAoIWRlZmluZWQoJ0FCU1BBVEgnKSkge1xuICBleGl0O1xufVxuXG5pZiAoIWlzc2V0KCRhdHRyaWJ1dGVzKSkge1xuICAkYXR0cmlidXRlcyA9IFtdO1xufVxuXG4vLyBFeHRyYWN0IGF0dHJpYnV0ZXMgd2l0aCBkZWZhdWx0c1xuJHthdHRyaWJ1dGVFeHRyYWN0aW9ufVxuJHtkeW5hbWljQXJyYXlDb2RlfVxuJHt3aXN0aWFFbnF1ZXVlQ29kZX1cbj8+XG4ke3dyYXBwZWRUZW1wbGF0ZX1cbmA7XG59O1xuXG5leHBvcnQge1xuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgaGFuZGxlYmFyc1RvUGhwLFxuICBhcnJheVRvUGhwLFxuICBnZXRQaHBEZWZhdWx0VmFsdWUsXG4gIGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24sXG4gIGJ1aWxkUmVzaGFwZVBocCxcbiAgYnVpbGRSZXNoYXBlSnMsXG59O1xuIl19