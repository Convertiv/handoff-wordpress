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
    const helperIfRegex = /\{\{#if\s+(\([^)]+\))\s*\}\}/g;
    let helperMatch;
    while ((helperMatch = helperIfRegex.exec(php)) !== null) {
        const openPos = helperMatch.index;
        const openTagEnd = openPos + helperMatch[0].length;
        const firstCondition = helperMatch[1];
        const result = findHelperIfBranches(php, openTagEnd, firstCondition);
        if (result === null)
            continue;
        const { branches, closePos } = result;
        const parts = [];
        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];
            const phpCondition = branch.condition ? parseHelperVeryEarly(branch.condition) : null;
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
        php = php.substring(0, openPos) + replacement + php.substring(closePos + 7); // '{{/if}}'.length === 7
        // Next exec from start of replacement so we catch nested {{#if}}...{{else if}}...{{/if}} inside it
        helperIfRegex.lastIndex = openPos;
    }
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
                if (nestedLoopAliases[parts[0]]) {
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
                    if (nestedLoopAliases[parts[0]]) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXBocC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3JlbmRlci1waHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0NBQW1PO0FBQ25PLG1EQUFtRDtBQUNuRCwyREFBa0Q7QUFFbEQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQVUsRUFBVSxFQUFFO0lBQ3hDLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDMUMsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkQsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO0lBQ3RCLENBQUM7SUFFRCxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzlCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO2FBQ2hDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzthQUM3QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDZCxPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7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QUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUNELE1BQU0sZ0JBQWdCLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRTVELDZEQUE2RDtJQUM3RCxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXhFLE9BQU87OytCQUVzQixTQUFTLENBQUMsS0FBSzs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFpQjVDLG1CQUFtQjtFQUNuQixnQkFBZ0I7RUFDaEIsaUJBQWlCOztFQUVqQixlQUFlO0NBQ2hCLENBQUM7QUFDRixDQUFDLENBQUM7QUFHQSw4Q0FBaUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyByZW5kZXIucGhwIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmdcbiAqIENvbnZlcnRzIEhhbmRsZWJhcnMgdGVtcGxhdGVzIHRvIFBIUFxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEZpZWxkTWFwcGluZ1ZhbHVlLCBpc0JyZWFkY3J1bWJzQ29uZmlnLCBpc1RheG9ub215Q29uZmlnLCBpc1BhZ2luYXRpb25Db25maWcgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBnZXRCdXR0b25EZWZhdWx0IH0gZnJvbSAnLi9idXR0b24tc2NoZW1hJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5cbi8qKlxuICogQ29udmVydCBKUyBhcnJheS9vYmplY3QgdG8gUEhQIGFycmF5IHN5bnRheFxuICovXG5jb25zdCBhcnJheVRvUGhwID0gKHZhbHVlOiBhbnkpOiBzdHJpbmcgPT4ge1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiAnbnVsbCc7XG4gIH1cbiAgXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIGNvbnN0IGl0ZW1zID0gdmFsdWUubWFwKHYgPT4gYXJyYXlUb1BocCh2KSkuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske2l0ZW1zfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IHBhaXJzID0gT2JqZWN0LmVudHJpZXModmFsdWUpXG4gICAgICAubWFwKChbaywgdl0pID0+IGAnJHtrfScgPT4gJHthcnJheVRvUGhwKHYpfWApXG4gICAgICAuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske3BhaXJzfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBgJyR7dmFsdWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuICB9XG4gIFxuICByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbn07XG5cbi8qKlxuICogR2V0IFBIUCBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5XG4gKi9cbmNvbnN0IGdldFBocERlZmF1bHRWYWx1ZSA9IChwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+IHtcbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6XG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICByZXR1cm4gYCcke1N0cmluZyhwcm9wZXJ0eS5kZWZhdWx0ID8/ICcnKS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBTdHJpbmcocHJvcGVydHkuZGVmYXVsdCA/PyAwKTtcbiAgICBcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBwcm9wZXJ0eS5kZWZhdWx0ID8gJ3RydWUnIDogJ2ZhbHNlJztcbiAgICBcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4gXCJbJ3NyYycgPT4gJycsICdhbHQnID0+ICcnXVwiO1xuXG4gICAgY2FzZSAndmlkZW8nOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQgJiYgdHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHByb3BlcnR5LmRlZmF1bHQpKSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHtcbiAgICAgICAgICBzcmM6ICcnLFxuICAgICAgICAgIGlkOiAnJyxcbiAgICAgICAgICBwb3N0ZXI6ICcnLFxuICAgICAgICAgIHR5cGU6ICcnLFxuICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICBtaW1lOiAnJyxcbiAgICAgICAgICBtaW1lVHlwZTogJycsXG4gICAgICAgICAgLi4ucHJvcGVydHkuZGVmYXVsdCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdzdHJpbmcnICYmIHByb3BlcnR5LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAoe1xuICAgICAgICAgIHNyYzogcHJvcGVydHkuZGVmYXVsdCxcbiAgICAgICAgICBpZDogJycsXG4gICAgICAgICAgcG9zdGVyOiAnJyxcbiAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgbWltZTogJycsXG4gICAgICAgICAgbWltZVR5cGU6ICcnLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlsnc3JjJyA9PiAnJywgJ2lkJyA9PiAnJywgJ3Bvc3RlcicgPT4gJycsICd0eXBlJyA9PiAnJywgJ3dpZHRoJyA9PiAwLCAnaGVpZ2h0JyA9PiAwLCAnbWltZScgPT4gJycsICdtaW1lVHlwZScgPT4gJyddXCI7XG4gICAgXG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4gXCJbJ2xhYmVsJyA9PiAnJywgJ3VybCcgPT4gJycsICdvcGVuc0luTmV3VGFiJyA9PiBmYWxzZV1cIjtcbiAgICBcbiAgICBjYXNlICdidXR0b24nOlxuICAgICAgcmV0dXJuIGFycmF5VG9QaHAoZ2V0QnV0dG9uRGVmYXVsdChwcm9wZXJ0eSkpO1xuICAgIFxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAocHJvcGVydHkuZGVmYXVsdCkge1xuICAgICAgICByZXR1cm4gYXJyYXlUb1BocChwcm9wZXJ0eS5kZWZhdWx0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnW10nO1xuICAgIFxuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5kZWZhdWx0IHx8IHByb3BlcnR5Lml0ZW1zPy5kZWZhdWx0KSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHByb3BlcnR5LmRlZmF1bHQgfHwgcHJvcGVydHkuaXRlbXM/LmRlZmF1bHQgfHwgW10pO1xuICAgICAgfVxuICAgICAgcmV0dXJuICdbXSc7XG4gICAgXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBcIicnXCI7XG4gIH1cbn07XG5cbmNvbnN0IHRvUGhwU2luZ2xlUXVvdGVkU3RyaW5nID0gKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgPT5cbiAgYCcke3ZhbHVlLnJlcGxhY2UoL1xcXFwvZywgXCJcXFxcXFxcXFwiKS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG5cbmNvbnN0IGhhbmRsZWJhcnNWYWx1ZVRvUGhwRXhwcmVzc2lvbiA9ICh0ZW1wbGF0ZVZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCB0b2tlblJlZ2V4ID0gL1xce1xce1xcez9cXHMqKFtefV0rPylcXHMqXFx9XFx9XFx9Py9nO1xuICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGN1cnNvciA9IDA7XG4gIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICBjb25zdCBwdXNoTGl0ZXJhbCA9IChsaXRlcmFsOiBzdHJpbmcpID0+IHtcbiAgICBpZiAobGl0ZXJhbCkge1xuICAgICAgcGFydHMucHVzaCh0b1BocFNpbmdsZVF1b3RlZFN0cmluZyhsaXRlcmFsKSk7XG4gICAgfVxuICB9O1xuXG4gIHdoaWxlICgobWF0Y2ggPSB0b2tlblJlZ2V4LmV4ZWModGVtcGxhdGVWYWx1ZSkpICE9PSBudWxsKSB7XG4gICAgcHVzaExpdGVyYWwodGVtcGxhdGVWYWx1ZS5zbGljZShjdXJzb3IsIG1hdGNoLmluZGV4KSk7XG5cbiAgICBjb25zdCBleHByZXNzaW9uID0gbWF0Y2hbMV0udHJpbSgpLnJlcGxhY2UoL15Acm9vdFxcLi8sICcnKTtcbiAgICBpZiAoZXhwcmVzc2lvbi5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXRoID0gZXhwcmVzc2lvbi5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGF0aFswXSk7XG4gICAgICBpZiAocGF0aC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcGFydHMucHVzaChgKCQke2NhbWVsUHJvcH0gPz8gJycpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXRoXG4gICAgICAgICAgLnNsaWNlKDEpXG4gICAgICAgICAgLm1hcCgoc2VnbWVudCkgPT4gYFsnJHtzZWdtZW50fSddYClcbiAgICAgICAgICAuam9pbignJyk7XG4gICAgICAgIHBhcnRzLnB1c2goYCgkJHtjYW1lbFByb3B9JHtuZXN0ZWRBY2Nlc3N9ID8/ICcnKWApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBwYXJ0cy5wdXNoKGAnJ2ApO1xuICAgIH1cblxuICAgIGN1cnNvciA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICB9XG5cbiAgcHVzaExpdGVyYWwodGVtcGxhdGVWYWx1ZS5zbGljZShjdXJzb3IpKTtcblxuICByZXR1cm4gcGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJyAuICcpIDogXCInJ1wiO1xufTtcblxudHlwZSBXaXN0aWFBc3NldCA9IHtcbiAgZW1wdHlDaGVja0V4cHJlc3Npb246IHN0cmluZztcbiAgdXJsRXhwcmVzc2lvbjogc3RyaW5nO1xufTtcblxuY29uc3QgYnVpbGRXaXN0aWFBc3NldCA9IChtZWRpYVNvdXJjZTogc3RyaW5nKTogV2lzdGlhQXNzZXQgPT4ge1xuICBjb25zdCB3aXN0aWFQcmVmaXggPSAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzLyc7XG4gIGNvbnN0IHdpc3RpYVN1ZmZpeCA9ICcuanNvbnAnO1xuXG4gIGlmIChtZWRpYVNvdXJjZS5zdGFydHNXaXRoKHdpc3RpYVByZWZpeCkgJiYgbWVkaWFTb3VyY2UuZW5kc1dpdGgod2lzdGlhU3VmZml4KSkge1xuICAgIGNvbnN0IG1lZGlhSWRUZW1wbGF0ZSA9IG1lZGlhU291cmNlLnNsaWNlKHdpc3RpYVByZWZpeC5sZW5ndGgsIC13aXN0aWFTdWZmaXgubGVuZ3RoKTtcbiAgICBjb25zdCBtZWRpYUlkRXhwcmVzc2lvbiA9IGhhbmRsZWJhcnNWYWx1ZVRvUGhwRXhwcmVzc2lvbihtZWRpYUlkVGVtcGxhdGUpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVtcHR5Q2hlY2tFeHByZXNzaW9uOiBtZWRpYUlkRXhwcmVzc2lvbixcbiAgICAgIHVybEV4cHJlc3Npb246IGAnJHt3aXN0aWFQcmVmaXh9JyAuICR7bWVkaWFJZEV4cHJlc3Npb259IC4gJyR7d2lzdGlhU3VmZml4fSdgLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB1cmxFeHByZXNzaW9uID0gaGFuZGxlYmFyc1ZhbHVlVG9QaHBFeHByZXNzaW9uKG1lZGlhU291cmNlKTtcbiAgcmV0dXJuIHtcbiAgICBlbXB0eUNoZWNrRXhwcmVzc2lvbjogdXJsRXhwcmVzc2lvbixcbiAgICB1cmxFeHByZXNzaW9uLFxuICB9O1xufTtcblxuY29uc3QgZ2VuZXJhdGVXaXN0aWFFbnF1ZXVlQ29kZSA9ICh0ZW1wbGF0ZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXNzZXRzID0gbmV3IE1hcDxzdHJpbmcsIFdpc3RpYUFzc2V0PigpO1xuICBsZXQgaGFzV2lzdGlhRW1iZWQgPSBmYWxzZTtcblxuICBjb25zdCBhZGRBc3NldCA9IChhc3NldDogV2lzdGlhQXNzZXQpID0+IHtcbiAgICBjb25zdCBrZXkgPSBgJHthc3NldC5lbXB0eUNoZWNrRXhwcmVzc2lvbn06OiR7YXNzZXQudXJsRXhwcmVzc2lvbn1gO1xuICAgIGlmICghYXNzZXRzLmhhcyhrZXkpKSB7XG4gICAgICBhc3NldHMuc2V0KGtleSwgYXNzZXQpO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBzY3JpcHRSZWdleCA9IC88c2NyaXB0W14+XStzcmM9W1wiJ10oW15cIiddKylbXCInXVtePl0qPlxccyo8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IHNjcmlwdE1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gIHdoaWxlICgoc2NyaXB0TWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKHRlbXBsYXRlKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzcmMgPSBzY3JpcHRNYXRjaFsxXS50cmltKCk7XG5cbiAgICBpZiAoL2Zhc3RcXC53aXN0aWFcXC5jb21cXC9hc3NldHNcXC9leHRlcm5hbFxcL0UtdjFcXC5qcy9pLnRlc3Qoc3JjKSkge1xuICAgICAgaGFzV2lzdGlhRW1iZWQgPSB0cnVlO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKC9mYXN0XFwud2lzdGlhXFwuY29tXFwvZW1iZWRcXC9tZWRpYXNcXC8vaS50ZXN0KHNyYykpIHtcbiAgICAgIGhhc1dpc3RpYUVtYmVkID0gdHJ1ZTtcbiAgICAgIGFkZEFzc2V0KGJ1aWxkV2lzdGlhQXNzZXQoc3JjKSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgYXN5bmNDbGFzc1JlZ2V4ID0gL3dpc3RpYV9hc3luY18oW15cXHNcIic8Pl0rKS9nO1xuICBsZXQgYXN5bmNDbGFzc01hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gIHdoaWxlICgoYXN5bmNDbGFzc01hdGNoID0gYXN5bmNDbGFzc1JlZ2V4LmV4ZWModGVtcGxhdGUpKSAhPT0gbnVsbCkge1xuICAgIGhhc1dpc3RpYUVtYmVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IG1lZGlhSWRFeHByZXNzaW9uID0gaGFuZGxlYmFyc1ZhbHVlVG9QaHBFeHByZXNzaW9uKGFzeW5jQ2xhc3NNYXRjaFsxXSk7XG4gICAgYWRkQXNzZXQoe1xuICAgICAgZW1wdHlDaGVja0V4cHJlc3Npb246IG1lZGlhSWRFeHByZXNzaW9uLFxuICAgICAgdXJsRXhwcmVzc2lvbjogYCdodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvJyAuICR7bWVkaWFJZEV4cHJlc3Npb259IC4gJy5qc29ucCdgLFxuICAgIH0pO1xuICB9XG5cbiAgaWYgKCFoYXNXaXN0aWFFbWJlZCkge1xuICAgIHJldHVybiAnJztcbiAgfVxuXG4gIGNvbnN0IGxpbmVzID0gW1xuICAgIFwiLy8gV2lzdGlhIGVtYmVkIGFzc2V0c1wiLFxuICAgIFwid3BfZW5xdWV1ZV9zY3JpcHQoJ3dpc3RpYS1ldjEnLCAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vYXNzZXRzL2V4dGVybmFsL0UtdjEuanMnLCBbXSwgbnVsbCwgWydzdHJhdGVneScgPT4gJ2FzeW5jJ10pO1wiLFxuICBdO1xuXG4gIEFycmF5LmZyb20oYXNzZXRzLnZhbHVlcygpKS5mb3JFYWNoKChhc3NldCwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBtZWRpYVZhciA9IGAkaGFuZG9mZldpc3RpYU1lZGlhJHtpbmRleH1gO1xuICAgIGxpbmVzLnB1c2goYCR7bWVkaWFWYXJ9ID0gJHthc3NldC51cmxFeHByZXNzaW9ufTtgKTtcbiAgICBsaW5lcy5wdXNoKGBpZiAoIWVtcHR5KCR7YXNzZXQuZW1wdHlDaGVja0V4cHJlc3Npb259KSkge2ApO1xuICAgIGxpbmVzLnB1c2goXG4gICAgICBgICB3cF9lbnF1ZXVlX3NjcmlwdChzYW5pdGl6ZV9rZXkoJ2hhbmRvZmYtd2lzdGlhLW1lZGlhLScgLiBtZDUoKHN0cmluZykgJHttZWRpYVZhcn0pKSwgJHttZWRpYVZhcn0sIFtdLCBudWxsLCBbJ3N0cmF0ZWd5JyA9PiAnYXN5bmMnXSk7YFxuICAgICk7XG4gICAgbGluZXMucHVzaCgnfScpO1xuICB9KTtcblxuICByZXR1cm4gYCR7bGluZXMuam9pbignXFxuJyl9XFxuYDtcbn07XG5cbmNvbnN0IHN0cmlwV2lzdGlhU2NyaXB0VGFncyA9ICh0ZW1wbGF0ZTogc3RyaW5nKTogc3RyaW5nID0+XG4gIHRlbXBsYXRlXG4gICAgLnJlcGxhY2UoL1xccyo8c2NyaXB0W14+XStzcmM9W1wiJ11bXlwiJ10qZmFzdFxcLndpc3RpYVxcLmNvbVxcL2VtYmVkXFwvbWVkaWFzXFwvW15cIiddK1tcIiddW14+XSo+XFxzKjxcXC9zY3JpcHQ+XFxzKi9naSwgJ1xcbicpXG4gICAgLnJlcGxhY2UoL1xccyo8c2NyaXB0W14+XStzcmM9W1wiJ11odHRwczpcXC9cXC9mYXN0XFwud2lzdGlhXFwuY29tXFwvYXNzZXRzXFwvZXh0ZXJuYWxcXC9FLXYxXFwuanNbXCInXVtePl0qPlxccyo8XFwvc2NyaXB0PlxccyovZ2ksICdcXG4nKTtcblxuLyoqXG4gKiBDb252ZXJ0IGhhbmRsZWJhcnMgdGVtcGxhdGUgdG8gUEhQXG4gKi9cbmNvbnN0IGhhbmRsZWJhcnNUb1BocCA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCByaWNodGV4dFByb3BzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKSk6IHN0cmluZyA9PiB7XG4gIGxldCBwaHAgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIFJlbW92ZSBIVE1MIHdyYXBwZXIgaWYgcHJlc2VudFxuICBwaHAgPSBwaHAucmVwbGFjZSgvPGh0bWxbXFxzXFxTXSo/PGJvZHlbXj5dKj4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxcXC9ib2R5PltcXHNcXFNdKj88XFwvaHRtbD4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxoZWFkPltcXHNcXFNdKj88XFwvaGVhZD4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcez9zdHlsZVxcfVxcfVxcfT8vZywgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFx7P3NjcmlwdFxcfVxcfVxcfT8vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIEhUTUwgY29tbWVudHNcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzwhLS1bXFxzXFxTXSo/LS0+L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSB7eyEtLSBjb21tZW50cyAtLX19XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHshLS1bXFxzXFxTXSo/LS1cXH1cXH0vZywgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7IVtcXHNcXFNdKj9cXH1cXH0vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIEhhbmRvZmYtc3BlY2lmaWMge3sjZmllbGR9fSBibG9ja3MgYnV0IGtlZXAgdGhlaXIgY29udGVudFxuICAvLyBVc2UgYSBnbG9iYWwgcmVnZXggdGhhdCBoYW5kbGVzIHZhcmlvdXMgcXVvdGUgc3R5bGVzIGFuZCB3aGl0ZXNwYWNlXG4gIC8vIFJlbW92ZSBIYW5kb2ZmLXNwZWNpZmljIHt7I2ZpZWxkfX0gYmxvY2tzIGJ1dCBrZWVwIHRoZWlyIGNvbnRlbnRcbiAgLy8gQWxsb3cgZm9yIHdoaXRlc3BhY2UgdmFyaWF0aW9ucyBsaWtlIHt7I2ZpZWxkIC4uLn19LCB7eyAjZmllbGQgLi4ufX0sIHt7L2ZpZWxkfX0sIHt7L2ZpZWxkIH19LCB7eyAvZmllbGQgfX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xccyojZmllbGRcXHMrW15cXH1dK1xcfVxcfS9naSwgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFxzKlxcL2ZpZWxkXFxzKlxcfVxcfS9naSwgJycpO1xuICBcbiAgLy8gTm9ybWFsaXplIEByb290LiByZWZlcmVuY2VzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zIHRvIHJvb3QtbGV2ZWwgYWNjZXNzLlxuICAvLyBJbiBzdGFuZGFyZCBIYW5kbGViYXJzLCBAcm9vdCByZWZlcnMgdG8gdGhlIHRvcC1sZXZlbCBkYXRhIGNvbnRleHQgcmVnYXJkbGVzcyBvZlxuICAvLyBuZXN0aW5nIGRlcHRoLCBzbyBAcm9vdC5wcm9wZXJ0aWVzLnh4eCBpcyBlcXVpdmFsZW50IHRvIHByb3BlcnRpZXMueHh4IGF0IHRoZSByb290LlxuICAvLyBXZSBvbmx5IHJlcGxhY2UgaW5zaWRlIHt7Li4ufX0gdG8gYXZvaWQgdG91Y2hpbmcgdW5yZWxhdGVkIHRleHQgY29udGVudC5cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1tcXHNcXFNdKj9cXH1cXH0vZywgKG1hdGNoKSA9PiBtYXRjaC5yZXBsYWNlKC9Acm9vdFxcLi9nLCAnJykpO1xuICBcbiAgLy8gVkVSWSBFQVJMWTogQ29udmVydCB7eyNpZiAoZXEvbmUgeHh4IFwidmFsdWVcIil9fS4uLnt7ZWxzZX19Li4ue3svaWZ9fSBoZWxwZXIgZXhwcmVzc2lvbnNcbiAgLy8gVGhpcyBNVVNUIHJ1biBiZWZvcmUgYW55IG90aGVyIHByb2Nlc3NpbmcgdG8gZW5zdXJlIHRoZSBjb21wbGV0ZSBibG9jayBpcyBjYXB0dXJlZFxuICAvLyBIZWxwZXIgdG8gY29udmVydCB2YXJpYWJsZSBwYXRoIHRvIFBIUCBmb3IgZWFybHkgaGVscGVyIHByb2Nlc3NpbmdcbiAgY29uc3QgdmFyVG9QaHBWZXJ5RWFybHkgPSAodmFyUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGgucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfVsnJHtwYXJ0cy5zbGljZSgxKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1gO1xuICAgIH0gZWxzZSBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHZhclBhdGgucmVwbGFjZSgndGhpcy4nLCAnJyk7XG4gICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZH0nXWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvciBsb29wIGFsaWFzZXMgYXQgdGhpcyBlYXJseSBzdGFnZSwgd2UgaGF2ZW4ndCB0cmFja2VkIHRoZW0geWV0XG4gICAgICAvLyBTbyB3ZSBqdXN0IHVzZSAkaXRlbSBmb3IgYW55IGFsaWFzLmZpZWxkIHBhdHRlcm5cbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aH0nXWA7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gUGFyc2UgaGVscGVyIGV4cHJlc3Npb24gdG8gUEhQIGNvbmRpdGlvbiAodmVyeSBlYXJseSlcbiAgY29uc3QgcGFyc2VIZWxwZXJWZXJ5RWFybHkgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBWZXJ5RWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICAvLyBNYXRjaCAobmUgbGVmdCBcInJpZ2h0XCIpIC0gbm90IGVxdWFsc1xuICAgIGNvbnN0IG5lTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm5lXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChuZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBuZU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocFZlcnlFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IC4uLiB7e2Vsc2UgaWYgKGVxIC4uLil9fSAuLi4ge3tlbHNlfX0gLi4uIHt7L2lmfX0gVkVSWSBFQVJMWVxuICAvLyBTdXBwb3J0cyBmdWxsIGlmIC8gZWxzZSBpZiAvIGVsc2UgaWYgLyBlbHNlIC8gZW5kaWYgY2hhaW5zIChzdHJpbmcgc3dpdGNoIHBhdHRlcm4pXG4gIHR5cGUgSGVscGVySWZCcmFuY2ggPSB7IGNvbmRpdGlvbjogc3RyaW5nIHwgbnVsbDsgY29udGVudDogc3RyaW5nIH07XG4gIGNvbnN0IGZpbmRIZWxwZXJJZkJyYW5jaGVzID0gKFxuICAgIHN0cjogc3RyaW5nLFxuICAgIHN0YXJ0UG9zOiBudW1iZXIsXG4gICAgZmlyc3RDb25kaXRpb246IHN0cmluZ1xuICApOiB7IGJyYW5jaGVzOiBIZWxwZXJJZkJyYW5jaFtdOyBjbG9zZVBvczogbnVtYmVyIH0gfCBudWxsID0+IHtcbiAgICBjb25zdCBicmFuY2hlczogSGVscGVySWZCcmFuY2hbXSA9IFt7IGNvbmRpdGlvbjogZmlyc3RDb25kaXRpb24sIGNvbnRlbnQ6ICcnIH1dO1xuICAgIGxldCBkZXB0aCA9IDE7XG4gICAgbGV0IHBvcyA9IHN0YXJ0UG9zO1xuICAgIGxldCBjb250ZW50U3RhcnQgPSBzdGFydFBvcztcbiAgICBjb25zdCBlbHNlSWZSZWdleCA9IC9cXHtcXHtlbHNlIGlmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9L2c7XG5cbiAgICB3aGlsZSAocG9zIDwgc3RyLmxlbmd0aCAmJiBkZXB0aCA+IDApIHtcbiAgICAgIGNvbnN0IG5leHRJZiA9IHN0ci5pbmRleE9mKCd7eyNpZicsIHBvcyk7XG4gICAgICBjb25zdCBuZXh0RW5kaWYgPSBzdHIuaW5kZXhPZigne3svaWZ9fScsIHBvcyk7XG4gICAgICBjb25zdCBuZXh0RWxzZSA9IHN0ci5pbmRleE9mKCd7e2Vsc2V9fScsIHBvcyk7XG4gICAgICBlbHNlSWZSZWdleC5sYXN0SW5kZXggPSBwb3M7XG4gICAgICBjb25zdCBlbHNlSWZNYXRjaCA9IGVsc2VJZlJlZ2V4LmV4ZWMoc3RyKTtcbiAgICAgIGNvbnN0IG5leHRFbHNlSWYgPSBlbHNlSWZNYXRjaCA/IGVsc2VJZk1hdGNoLmluZGV4IDogLTE7XG5cbiAgICAgIGNvbnN0IGNhbmRpZGF0ZXM6IHsgdHlwZTogc3RyaW5nOyBwb3M6IG51bWJlcjsgZXhwcj86IHN0cmluZzsgdGFnTGVuPzogbnVtYmVyIH1bXSA9IFtcbiAgICAgICAgeyB0eXBlOiAnaWYnLCBwb3M6IG5leHRJZiB9LFxuICAgICAgICB7IHR5cGU6ICdlbmRpZicsIHBvczogbmV4dEVuZGlmIH0sXG4gICAgICAgIHsgdHlwZTogJ2Vsc2UnLCBwb3M6IG5leHRFbHNlIH0sXG4gICAgICAgIC4uLihuZXh0RWxzZUlmICE9PSAtMSA/IFt7IHR5cGU6ICdlbHNlaWYnLCBwb3M6IG5leHRFbHNlSWYsIGV4cHI6IGVsc2VJZk1hdGNoIVsxXSwgdGFnTGVuOiBlbHNlSWZNYXRjaCFbMF0ubGVuZ3RoIH1dIDogW10pXG4gICAgICBdLmZpbHRlcihjID0+IGMucG9zICE9PSAtMSkuc29ydCgoYSwgYikgPT4gYS5wb3MgLSBiLnBvcyk7XG5cbiAgICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkgYnJlYWs7XG5cbiAgICAgIGNvbnN0IGNsb3Nlc3QgPSBjYW5kaWRhdGVzWzBdO1xuXG4gICAgICBpZiAoY2xvc2VzdC50eXBlID09PSAnaWYnKSB7XG4gICAgICAgIGRlcHRoKys7XG4gICAgICAgIHBvcyA9IGNsb3Nlc3QucG9zICsgNTtcbiAgICAgIH0gZWxzZSBpZiAoY2xvc2VzdC50eXBlID09PSAnZW5kaWYnKSB7XG4gICAgICAgIGRlcHRoLS07XG4gICAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICAgIGJyYW5jaGVzW2JyYW5jaGVzLmxlbmd0aCAtIDFdLmNvbnRlbnQgPSBzdHIuc3Vic3RyaW5nKGNvbnRlbnRTdGFydCwgY2xvc2VzdC5wb3MpO1xuICAgICAgICAgIHJldHVybiB7IGJyYW5jaGVzLCBjbG9zZVBvczogY2xvc2VzdC5wb3MgfTtcbiAgICAgICAgfVxuICAgICAgICBwb3MgPSBjbG9zZXN0LnBvcyArIDc7IC8vICd7ey9pZn19Jy5sZW5ndGggPT09IDdcbiAgICAgIH0gZWxzZSBpZiAoKGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2VpZicgfHwgY2xvc2VzdC50eXBlID09PSAnZWxzZScpICYmIGRlcHRoID09PSAxKSB7XG4gICAgICAgIGNvbnN0IHRhZ0xlbiA9IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2VpZicgPyAoY2xvc2VzdC50YWdMZW4gPz8gMCkgOiA4O1xuICAgICAgICBicmFuY2hlc1ticmFuY2hlcy5sZW5ndGggLSAxXS5jb250ZW50ID0gc3RyLnN1YnN0cmluZyhjb250ZW50U3RhcnQsIGNsb3Nlc3QucG9zKTtcbiAgICAgICAgYnJhbmNoZXMucHVzaCh7XG4gICAgICAgICAgY29uZGl0aW9uOiBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gY2xvc2VzdC5leHByISA6IG51bGwsXG4gICAgICAgICAgY29udGVudDogJydcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRlbnRTdGFydCA9IGNsb3Nlc3QucG9zICsgdGFnTGVuO1xuICAgICAgICBwb3MgPSBjb250ZW50U3RhcnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBTa2lwIGZ1bGwgdGFnIHdoZW4gaW5zaWRlIG5lc3RlZCAjaWYgKGUuZy4gc2tpcCB7e2Vsc2UgaWYgKGV4cHIpfX0gc28gd2UgZmluZCB0aGUgb3V0ZXIge3svaWZ9fSlcbiAgICAgICAgY29uc3Qgc2tpcExlbiA9IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2VpZicgPyAoY2xvc2VzdC50YWdMZW4gPz8gMCkgOiA4O1xuICAgICAgICBwb3MgPSBjbG9zZXN0LnBvcyArIHNraXBMZW47XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuXG4gIGNvbnN0IGhlbHBlcklmUmVnZXggPSAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9L2c7XG4gIGxldCBoZWxwZXJNYXRjaDtcbiAgd2hpbGUgKChoZWxwZXJNYXRjaCA9IGhlbHBlcklmUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IG9wZW5Qb3MgPSBoZWxwZXJNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gb3BlblBvcyArIGhlbHBlck1hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBmaXJzdENvbmRpdGlvbiA9IGhlbHBlck1hdGNoWzFdO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gZmluZEhlbHBlcklmQnJhbmNoZXMocGhwLCBvcGVuVGFnRW5kLCBmaXJzdENvbmRpdGlvbik7XG4gICAgaWYgKHJlc3VsdCA9PT0gbnVsbCkgY29udGludWU7XG4gICAgY29uc3QgeyBicmFuY2hlcywgY2xvc2VQb3MgfSA9IHJlc3VsdDtcblxuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnJhbmNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGJyYW5jaCA9IGJyYW5jaGVzW2ldO1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gYnJhbmNoLmNvbmRpdGlvbiA/IHBhcnNlSGVscGVyVmVyeUVhcmx5KGJyYW5jaC5jb25kaXRpb24pIDogbnVsbDtcbiAgICAgIGNvbnN0IGNvbmQgPSBwaHBDb25kaXRpb24gPz8gJ2ZhbHNlJztcbiAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYDw/cGhwIGlmICgke2NvbmR9KSA6ID8+JHticmFuY2guY29udGVudH1gKTtcbiAgICAgIH0gZWxzZSBpZiAoYnJhbmNoLmNvbmRpdGlvbiAhPT0gbnVsbCkge1xuICAgICAgICBwYXJ0cy5wdXNoKGA8P3BocCBlbHNlaWYgKCR7Y29uZH0pIDogPz4ke2JyYW5jaC5jb250ZW50fWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFydHMucHVzaChgPD9waHAgZWxzZSA6ID8+JHticmFuY2guY29udGVudH1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcGFydHMucHVzaCgnPD9waHAgZW5kaWY7ID8+Jyk7XG4gICAgY29uc3QgcmVwbGFjZW1lbnQgPSBwYXJ0cy5qb2luKCcnKTtcblxuICAgIHBocCA9IHBocC5zdWJzdHJpbmcoMCwgb3BlblBvcykgKyByZXBsYWNlbWVudCArIHBocC5zdWJzdHJpbmcoY2xvc2VQb3MgKyA3KTsgLy8gJ3t7L2lmfX0nLmxlbmd0aCA9PT0gN1xuICAgIC8vIE5leHQgZXhlYyBmcm9tIHN0YXJ0IG9mIHJlcGxhY2VtZW50IHNvIHdlIGNhdGNoIG5lc3RlZCB7eyNpZn19Li4ue3tlbHNlIGlmfX0uLi57ey9pZn19IGluc2lkZSBpdFxuICAgIGhlbHBlcklmUmVnZXgubGFzdEluZGV4ID0gb3BlblBvcztcbiAgfVxuXG4gIC8vIFZFUlkgRUFSTFk6IENvbnZlcnQge3sjdW5sZXNzIChlcS9uZSAuLi4pfX0gd2l0aCBlbHNlIGFuZCB3aXRob3V0IGVsc2VcbiAgLy8gI3VubGVzcyBpcyB0aGUgbmVnYXRpb24gb2YgI2lmLCBzbyB3ZSBpbnZlcnQgdGhlIGNvbmRpdGlvbi5cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclZlcnlFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJWZXJ5RWFybHkoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCEoJHtwaHBDb25kaXRpb259KSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgc3R5bGUgd2l0aCBoYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gIC8vIEtlZXAgJ3NyYycgYXMtaXMgdG8gbWF0Y2ggSGFuZG9mZidzIGltYWdlIHByb3BlcnR5IG5hbWluZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvc3R5bGU9XCJiYWNrZ3JvdW5kLWltYWdlOnVybFxcKCc/XFx7XFx7K1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfStcXH0nP1xcKVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAhZW1wdHkoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSkgPyAnc3R5bGU9XCJiYWNrZ3JvdW5kLWltYWdlOnVybChcXFxcJycgLiBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10pIC4gJ1xcXFwnKVwiJyA6ICcnOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gVHJhY2sgbG9vcCBhbGlhc2VzIGZvciBsYXRlciByZWZlcmVuY2UgY29udmVyc2lvblxuICAvLyBGb3JtYXQ6IHt7I2VhY2ggcHJvcGVydGllcy54eHggYXMgfGFsaWFzTmFtZXx9fVxuICBjb25zdCBsb29wQWxpYXNlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBcbiAgLy8gVHJhY2sgbmVzdGVkIGxvb3AgYWxpYXNlcyBzZXBhcmF0ZWx5ICh0aGVzZSB1c2UgJHN1Ykl0ZW0gaW5zdGVhZCBvZiAkaXRlbSlcbiAgY29uc3QgbmVzdGVkTG9vcEFsaWFzZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIC8vIFRyYWNrIG5lc3RlZCBsb29wIGRlcHRoIGZvciBwcm9wZXIgdmFyaWFibGUgbmFtaW5nXG4gIGxldCBuZXN0ZWRMb29wRGVwdGggPSAwO1xuICBcbiAgLy8gSGVscGVyIHRvIGdldCB0aGUgbG9vcCBpdGVtIHZhcmlhYmxlIG5hbWUgYmFzZWQgb24gZGVwdGhcbiAgY29uc3QgZ2V0TG9vcEl0ZW1WYXIgPSAoZGVwdGg6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gJyRpdGVtJztcbiAgICBpZiAoZGVwdGggPT09IDEpIHJldHVybiAnJHN1Ykl0ZW0nO1xuICAgIHJldHVybiBgJG5lc3RlZCR7ZGVwdGh9SXRlbWA7XG4gIH07XG4gIFxuICBjb25zdCBnZXRMb29wSW5kZXhWYXIgPSAoZGVwdGg6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gJyRpbmRleCc7XG4gICAgaWYgKGRlcHRoID09PSAxKSByZXR1cm4gJyRzdWJJbmRleCc7XG4gICAgcmV0dXJuIGAkbmVzdGVkJHtkZXB0aH1JbmRleGA7XG4gIH07XG4gIFxuICBjb25zdCBnZXRMb29wQ291bnRWYXIgPSAoZGVwdGg6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gJyRfbG9vcF9jb3VudCc7XG4gICAgaWYgKGRlcHRoID09PSAxKSByZXR1cm4gJyRfbmVzdGVkX2xvb3BfY291bnQnO1xuICAgIHJldHVybiBgJF9uZXN0ZWQke2RlcHRofV9sb29wX2NvdW50YDtcbiAgfTtcblxuICAvKiogZS5nLiBzcGVha2VyU3RhY2suYXZhdGFycyArICRpdGVtIC0+ICRpdGVtWydzcGVha2VyU3RhY2snXVsnYXZhdGFycyddICovXG4gIGNvbnN0IGRvdFBhdGhUb1BocEFjY2VzcyA9IChwYXRoOiBzdHJpbmcsIGJhc2VWYXI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgY29uc3Qgc2VnbWVudHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgYnJhY2tldEFjY2VzcyA9IHNlZ21lbnRzLm1hcCgocCkgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgcmV0dXJuIGAke2Jhc2VWYXJ9JHticmFja2V0QWNjZXNzfWA7XG4gIH07XG5cbiAgY29uc3QgbmVzdGVkRWFjaE9wZW5QaHAgPSAoYXJyYXlFeHByOiBzdHJpbmcsIG5lc3RlZEFsaWFzPzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAobmVzdGVkQWxpYXMpIHtcbiAgICAgIG5lc3RlZExvb3BBbGlhc2VzW25lc3RlZEFsaWFzXSA9IGFycmF5RXhwcjtcbiAgICB9XG4gICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7YXJyYXlFeHByfSkgJiYgaXNfYXJyYXkoJHthcnJheUV4cHJ9KSkgOiAkX25lc3RlZF9sb29wX2NvdW50ID0gY291bnQoJHthcnJheUV4cHJ9KTsgZm9yZWFjaCAoJHthcnJheUV4cHJ9IGFzICRzdWJJbmRleCA9PiAkc3ViSXRlbSkgOiA/PmA7XG4gIH07XG4gIFxuICAvLyBGaXJzdCBwYXNzOiBpZGVudGlmeSBhbGwgbmVzdGVkIGxvb3AgcGF0dGVybnMgYW5kIHRoZWlyIGFsaWFzZXNcbiAgLy8gV2UgbmVlZCB0byBwcm9jZXNzIGxvb3BzIGluIG9yZGVyIHRvIHByb3Blcmx5IHRyYWNrIG5lc3RpbmdcbiAgY29uc3QgZWFjaFBhdHRlcm5zOiBBcnJheTx7XG4gICAgbWF0Y2g6IHN0cmluZztcbiAgICB0eXBlOiAncHJvcGVydGllcycgfCAndGhpcycgfCAnYWxpYXMnO1xuICAgIGFycmF5UGF0aDogc3RyaW5nO1xuICAgIGFsaWFzPzogc3RyaW5nO1xuICAgIHBhcmVudEFsaWFzPzogc3RyaW5nO1xuICAgIGluZGV4OiBudW1iZXI7XG4gIH0+ID0gW107XG4gIFxuICAvLyBGaW5kIGFsbCB7eyNlYWNoIC4uLn19IHBhdHRlcm5zXG4gIGNvbnN0IGVhY2hSZWdleCA9IC9cXHtcXHsjZWFjaFxccysoW15cXH1dKylcXH1cXH0vZztcbiAgbGV0IGVhY2hNYXRjaDtcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBlYWNoTWF0Y2hbMV0udHJpbSgpO1xuICAgIGxldCB0eXBlOiAncHJvcGVydGllcycgfCAndGhpcycgfCAnYWxpYXMnO1xuICAgIGxldCBhcnJheVBhdGg6IHN0cmluZztcbiAgICBsZXQgYWxpYXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgcGFyZW50QWxpYXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgXCJhcyB8YWxpYXN8XCIgc3ludGF4XG4gICAgY29uc3QgYXNBbGlhc01hdGNoID0gY29udGVudC5tYXRjaCgvXiguKz8pXFxzK2FzXFxzK1xcfChcXHcrKVxcfCQvKTtcbiAgICBpZiAoYXNBbGlhc01hdGNoKSB7XG4gICAgICBjb25zdCBwYXRoUGFydCA9IGFzQWxpYXNNYXRjaFsxXS50cmltKCk7XG4gICAgICBhbGlhcyA9IGFzQWxpYXNNYXRjaFsyXTtcbiAgICAgIFxuICAgICAgaWYgKHBhdGhQYXJ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICdwcm9wZXJ0aWVzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJyk7XG4gICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICd0aGlzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQucmVwbGFjZSgndGhpcy4nLCAnJyk7XG4gICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgLy8gZS5nLiwgYXJ0aWNsZS50YWdzIC0gZmlyc3QgcGFydCBpcyBhbiBhbGlhcyBmcm9tIG91dGVyIGxvb3BcbiAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoUGFydC5zcGxpdCgnLicpO1xuICAgICAgICBwYXJlbnRBbGlhcyA9IHBhcnRzWzBdO1xuICAgICAgICBhcnJheVBhdGggPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJyk7XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSnVzdCBhIHZhcmlhYmxlIG5hbWUsIHRyZWF0IGFzIGFsaWFzIHJlZmVyZW5jZVxuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE5vIGFsaWFzIHN5bnRheFxuICAgICAgaWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICB0eXBlID0gJ3Byb3BlcnRpZXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIHR5cGUgPSAndGhpcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IGNvbnRlbnQucmVwbGFjZSgndGhpcy4nLCAnJykuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgfSBlbHNlIGlmIChjb250ZW50LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBjb250ZW50LnNwbGl0KCcuJyk7XG4gICAgICAgIHBhcmVudEFsaWFzID0gcGFydHNbMF07XG4gICAgICAgIGFycmF5UGF0aCA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKS5zcGxpdCgvXFxzLylbMF07XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwZSA9ICdhbGlhcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IGNvbnRlbnQuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBlYWNoUGF0dGVybnMucHVzaCh7XG4gICAgICBtYXRjaDogZWFjaE1hdGNoWzBdLFxuICAgICAgdHlwZSxcbiAgICAgIGFycmF5UGF0aCxcbiAgICAgIGFsaWFzLFxuICAgICAgcGFyZW50QWxpYXMsXG4gICAgICBpbmRleDogZWFjaE1hdGNoLmluZGV4XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRyYWNrIHdoaWNoIGFsaWFzZXMgbWFwIHRvIHdoaWNoIG5lc3RlZCBkZXB0aFxuICBjb25zdCBhbGlhc1RvRGVwdGg6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgXG4gIC8vIFByb2Nlc3MgbG9vcHMgZnJvbSBmaXJzdCB0byBsYXN0IChtYWludGFpbmluZyBvcmRlcilcbiAgLy8gU29ydCBieSBpbmRleCB0byBwcm9jZXNzIGluIG9yZGVyXG4gIGVhY2hQYXR0ZXJucy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG4gIFxuICAvLyBUcmFjayBjdXJyZW50IG5lc3RpbmcgbGV2ZWwgYXMgd2UgcHJvY2Vzc1xuICBsZXQgY3VycmVudERlcHRoID0gLTE7XG4gIGNvbnN0IG9wZW5Mb29wczogQXJyYXk8eyBkZXB0aDogbnVtYmVyOyBhbGlhcz86IHN0cmluZyB9PiA9IFtdO1xuICBcbiAgLy8gRmluZCB7ey9lYWNofX0gcG9zaXRpb25zXG4gIGNvbnN0IGNsb3NlRWFjaFBvc2l0aW9uczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgY2xvc2VFYWNoUmVnZXggPSAvXFx7XFx7XFwvZWFjaFxcfVxcfS9nO1xuICBsZXQgY2xvc2VNYXRjaDtcbiAgd2hpbGUgKChjbG9zZU1hdGNoID0gY2xvc2VFYWNoUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNsb3NlRWFjaFBvc2l0aW9ucy5wdXNoKGNsb3NlTWF0Y2guaW5kZXgpO1xuICB9XG4gIFxuICAvLyBBc3NpZ24gZGVwdGggdG8gZWFjaCBwYXR0ZXJuIGJhc2VkIG9uIHBvc2l0aW9uIHJlbGF0aXZlIHRvIG90aGVyIHBhdHRlcm5zIGFuZCBjbG9zZXNcbiAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIGVhY2hQYXR0ZXJucykge1xuICAgIC8vIENvdW50IGhvdyBtYW55IG9wZW5zIGJlZm9yZSB0aGlzIHBvc2l0aW9uXG4gICAgY29uc3Qgb3BlbnNCZWZvcmUgPSBlYWNoUGF0dGVybnMuZmlsdGVyKHAgPT4gcC5pbmRleCA8IHBhdHRlcm4uaW5kZXgpLmxlbmd0aDtcbiAgICAvLyBDb3VudCBob3cgbWFueSBjbG9zZXMgYmVmb3JlIHRoaXMgcG9zaXRpb25cbiAgICBjb25zdCBjbG9zZXNCZWZvcmUgPSBjbG9zZUVhY2hQb3NpdGlvbnMuZmlsdGVyKHBvcyA9PiBwb3MgPCBwYXR0ZXJuLmluZGV4KS5sZW5ndGg7XG4gICAgY29uc3QgZGVwdGggPSBvcGVuc0JlZm9yZSAtIGNsb3Nlc0JlZm9yZTtcbiAgICBcbiAgICBpZiAocGF0dGVybi5hbGlhcykge1xuICAgICAgYWxpYXNUb0RlcHRoW3BhdHRlcm4uYWxpYXNdID0gZGVwdGg7XG4gICAgICBsb29wQWxpYXNlc1twYXR0ZXJuLmFsaWFzXSA9IHBhdHRlcm4uYXJyYXlQYXRoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSBwcm9wZXJ0eSBwYXRoIGxpa2UgXCJqdW1wTmF2LmxpbmtzXCIgdG8gUEhQIHZhcmlhYmxlIGFjY2VzcyBsaWtlIFwiJGp1bXBOYXZbJ2xpbmtzJ11cIlxuICBjb25zdCBwcm9wUGF0aFRvUGhwID0gKHByb3BQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICBjb25zdCBjYW1lbEZpcnN0ID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHJldHVybiBgJCR7Y2FtZWxGaXJzdH1gO1xuICAgIH1cbiAgICAvLyBGb3IgbmVzdGVkIHBhdGhzIGxpa2UganVtcE5hdi5saW5rcyAtPiAkanVtcE5hdlsnbGlua3MnXVxuICAgIGNvbnN0IG5lc3RlZFBhdGggPSBwYXJ0cy5zbGljZSgxKS5tYXAocCA9PiBgJyR7cH0nYCkuam9pbignXVsnKTtcbiAgICByZXR1cm4gYCQke2NhbWVsRmlyc3R9WyR7bmVzdGVkUGF0aH1dYDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eC55eXkgYXMgfGFsaWFzfH19IG9yIHt7I2VhY2ggcHJvcGVydGllcy54eHggYXMgfGFsaWFzIGluZGV4fH19IGxvb3BzIHdpdGggbmFtZWQgYWxpYXNcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIC8vIFRoZSBzZWNvbmQgcGFyYW1ldGVyIChpbmRleCkgaXMgb3B0aW9uYWwgYW5kIGlnbm9yZWQgc2luY2Ugd2UgdXNlICRpbmRleCBpbiBQSFBcbiAgLy8gQWxzbyBzZXQgJF9sb29wX2NvdW50IGZvciBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccythc1xccytcXHwoXFx3KykoPzpcXHMrXFx3Kyk/XFx8XFxzKlxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCwgYWxpYXMpID0+IHtcbiAgICAgIGNvbnN0IHBocFZhciA9IHByb3BQYXRoVG9QaHAocHJvcFBhdGgpO1xuICAgICAgbG9vcEFsaWFzZXNbYWxpYXNdID0gcHJvcFBhdGg7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJHtwaHBWYXJ9KSAmJiBpc19hcnJheSgke3BocFZhcn0pKSA6ICRfbG9vcF9jb3VudCA9IGNvdW50KCR7cGhwVmFyfSk7IGZvcmVhY2ggKCR7cGhwVmFyfSBhcyAkaW5kZXggPT4gJGl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eH19IG9yIHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5fX0gbG9vcHMgd2l0aG91dCBhbGlhc1xuICAvLyBOb3cgaGFuZGxlcyBuZXN0ZWQgcGF0aHMgbGlrZSBwcm9wZXJ0aWVzLmp1bXBOYXYubGlua3NcbiAgLy8gQWxzbyBzZXQgJF9sb29wX2NvdW50IGZvciBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBocFZhciA9IHByb3BQYXRoVG9QaHAocHJvcFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7cGhwVmFyfSkgJiYgaXNfYXJyYXkoJHtwaHBWYXJ9KSkgOiAkX2xvb3BfY291bnQgPSBjb3VudCgke3BocFZhcn0pOyBmb3JlYWNoICgke3BocFZhcn0gYXMgJGluZGV4ID0+ICRpdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggdGhpcy54eHgueXl5IGFzIHxhbGlhc3x9fSBuZXN0ZWQgbG9vcHMgd2l0aCBhbGlhcyAoc3VwcG9ydHMgZG90dGVkIHBhdGhzKVxuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkc3ViSW5kZXggaW4gUEhQXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccyt0aGlzXFwuKFtcXHcuXSspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoLCBhbGlhcykgPT4ge1xuICAgICAgbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID0gcHJvcFBhdGg7XG4gICAgICByZXR1cm4gbmVzdGVkRWFjaE9wZW5QaHAoZG90UGF0aFRvUGhwQWNjZXNzKHByb3BQYXRoLCAnJGl0ZW0nKSwgYWxpYXMpO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCB0aGlzLnh4eC55eXl9fSBuZXN0ZWQgbG9vcHMgd2l0aG91dCBhbGlhc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrdGhpc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IG5lc3RlZEVhY2hPcGVuUGhwKGRvdFBhdGhUb1BocEFjY2Vzcyhwcm9wUGF0aCwgJyRpdGVtJykpXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggYWxpYXMueHh4Lnl5eSBhcyB8bmVzdGVkQWxpYXN8fX0g4oCUIG5lc3RlZCBsb29wcyByZWZlcmVuY2luZyBvdXRlciBsb29wIGFsaWFzXG4gIC8vIGUuZy4ge3sjZWFjaCBjYXJkLnNwZWFrZXJTdGFjay5hdmF0YXJzIGFzIHxhdmF0YXJ8fX0gaW5zaWRlIHt7I2VhY2ggcHJvcGVydGllcy5jYXJkcyBhcyB8Y2FyZHx9fVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrKFxcdyspXFwuKFtcXHcuXSspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBwYXJlbnRBbGlhcywgcHJvcFBhdGgsIG5lc3RlZEFsaWFzKSA9PiB7XG4gICAgICBpZiAocGFyZW50QWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBwYXJlbnRBbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBuZXN0ZWRFYWNoT3BlblBocChkb3RQYXRoVG9QaHBBY2Nlc3MocHJvcFBhdGgsICckaXRlbScpLCBuZXN0ZWRBbGlhcyk7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIGFsaWFzLnh4eC55eXl9fSDigJQgbmVzdGVkIGxvb3BzIHJlZmVyZW5jaW5nIG91dGVyIGxvb3AgYWxpYXMgd2l0aG91dCBuZXN0ZWQgYWxpYXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzKyhcXHcrKVxcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAobWF0Y2gsIHBhcmVudEFsaWFzLCBwcm9wUGF0aCkgPT4ge1xuICAgICAgaWYgKHBhcmVudEFsaWFzID09PSAncHJvcGVydGllcycgfHwgcGFyZW50QWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmVzdGVkRWFjaE9wZW5QaHAoZG90UGF0aFRvUGhwQWNjZXNzKHByb3BQYXRoLCAnJGl0ZW0nKSk7XG4gICAgfVxuICApO1xuICBcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL2VhY2hcXH1cXH0vZywgJzw/cGhwIGVuZGZvcmVhY2g7IGVuZGlmOyA/PicpO1xuICBcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgaGVscGVyIGV4cHJlc3Npb24gY29uZGl0aW9uYWxzIEVBUkxZIChiZWZvcmUgYWxpYXMgcGF0dGVybnMgY29udmVydCBwYXJ0cyBvZiB0aGVtKVxuICAvLyBUaGlzIGhhbmRsZXMge3sjaWYgKGVxIGFsaWFzLnh4eCBcInZhbHVlXCIpfX0uLi57e2Vsc2V9fS4uLnt7L2lmfX0gcGF0dGVybnMgaW5zaWRlIGxvb3BzXG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBhIHZhcmlhYmxlIHBhdGggdG8gUEhQIGV4cHJlc3Npb24gZm9yIGhlbHBlciBjb21wYXJpc29uc1xuICAvLyBIYW5kbGVzIHByb3BlcnRpZXMueHh4LCB0aGlzLnh4eCwgYW5kIGFsaWFzLnh4eCBwYXR0ZXJuc1xuICBjb25zdCB2YXJUb1BocEVhcmx5ID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1bJyR7cGFydHMuc2xpY2UoMSkuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICB9IGVsc2UgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBpcyBhIGtub3duIGxvb3AgYWxpYXNcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgaWYgKG5lc3RlZExvb3BBbGlhc2VzW3BhcnRzWzBdXSkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICBpZiAobG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZFBhdGguam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBGYWxsYmFja1xuICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGguc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIFBhcnNlIGhlbHBlciBleHByZXNzaW9uIHRvIFBIUCBjb25kaXRpb25cbiAgY29uc3QgcGFyc2VIZWxwZXJFYXJseSA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCBcInJpZ2h0XCIpIC0gZXF1YWxzIHdpdGggcXVvdGVkIHN0cmluZ1xuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocEVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGlmL2Vsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIChlcS9uZSAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZSBFQVJMWVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZSAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZSBFQVJMWVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgYXR0cmlidXRlLXNwZWNpZmljIHBhdHRlcm5zIEZJUlNUIGJlZm9yZSBnZW5lcmljIG9uZXNcbiAgLy8gSGFuZGxlIHByb3BlcnRpZXMueHh4Lnl5eSBwYXR0ZXJucyBGSVJTVCwgdGhlbiBhbGlhcyBwYXR0ZXJucyBmb3IgbG9vcHNcbiAgXG4gIC8vIENvbnZlcnQgc3JjPVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zICh0b3AtbGV2ZWwgbmVzdGVkIHByb3BlcnRpZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zcmM9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYHNyYz1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBhbHQ9XCJ7e3Byb3BlcnRpZXMueHh4Lnl5eX19XCIgcGF0dGVybnNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2FsdD1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgYWx0PVwiPD9waHAgZWNobyBlc2NfYXR0cigkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gTm93IGhhbmRsZSBhbGlhcyBwYXR0ZXJucyBmb3IgbG9vcHM6IHNyYz1cInt7YWxpYXMueHh4Lnl5eX19XCIsIGFsdD1cInt7YWxpYXMueHh4Lnl5eX19XCIsIGhyZWY9XCJ7e2FsaWFzLnh4eC55eXl9fVwiXG4gIFxuICAvLyBDb252ZXJ0IHNyYz1cInt7YWxpYXMueHh4Lnl5eX19XCIgcGF0dGVybnMgKGltYWdlcyBpbiBsb29wcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL3NyYz1cIlxce1xce1xccyooXFx3KylcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGNvbnZlcnRlZCBvciBpZiBpdCdzIGEgcHJvcGVydGllcyBwYXR0ZXJuXG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnIHx8IG1hdGNoLmluY2x1ZGVzKCc8P3BocCcpKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGBzcmM9XCI8P3BocCBlY2hvIGVzY191cmwoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBhbHQ9XCJ7e2FsaWFzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9hbHQ9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycgfHwgbWF0Y2guaW5jbHVkZXMoJzw/cGhwJykpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYGFsdD1cIjw/cGhwIGVjaG8gZXNjX2F0dHIoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3thbGlhcy54eHgueXl5fX1cIiBwYXR0ZXJucyAobGlua3MgaW4gbG9vcHMgd2l0aCBuZXN0ZWQgZmllbGRzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccyooXFx3KylcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJyB8fCBtYXRjaC5pbmNsdWRlcygnPD9waHAnKSkge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgke2l0ZW1WYXJ9Wycke2ZpZWxkMX0nXVsnJHtmaWVsZDJ9J10gPz8gJycpOyA/PlwiYDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7YWxpYXMuZmllbGQuc3ViZmllbGR9fSBhbmQge3thbGlhcy5maWVsZH19IHJlZmVyZW5jZXMgZnJvbSBuYW1lZCBsb29wIHZhcmlhYmxlc1xuICAvLyBNdXN0IGhhbmRsZSBkZWVwZXIgbmVzdGluZyBmaXJzdCAoYWxpYXMuZmllbGQuc3ViZmllbGQgYmVmb3JlIGFsaWFzLmZpZWxkKVxuICAvLyBJTVBPUlRBTlQ6IEhhbmRsZSB0cmlwbGUtYnJhY2UgKHJpY2ggdGV4dCkgQkVGT1JFIGRvdWJsZS1icmFjZSBwYXR0ZXJuc1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSBmaWVsZCBwYXRoIHRvIFBIUCBhcnJheSBhY2Nlc3NcbiAgLy8gZS5nLiwgXCJjdGEubGlua1wiIC0+IFwiWydjdGEnXVsnbGluayddXCJcbiAgY29uc3QgZmllbGRQYXRoVG9QaHBBY2Nlc3MgPSAoZmllbGRQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgcmV0dXJuIHBhcnRzLm1hcChwID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICB9O1xuICBcbiAgLy8gUHJvY2VzcyBuZXN0ZWQgbG9vcCBhbGlhc2VzIEZJUlNUICh0aGV5IHVzZSAkc3ViSXRlbSlcbiAgZm9yIChjb25zdCBbYWxpYXNdIG9mIE9iamVjdC5lbnRyaWVzKG5lc3RlZExvb3BBbGlhc2VzKSkge1xuICAgIC8vIEhhbmRsZSB7e3sgYWxpYXMuZmllbGQgfX19IHRyaXBsZS1icmFjZSBwYXR0ZXJucyAocmljaCB0ZXh0L0hUTUwgaW4gbmVzdGVkIGxvb3BzKVxuICAgIGNvbnN0IGFsaWFzVHJpcGxlUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHtcXFxccyoke2FsaWFzfVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzVHJpcGxlUmVnZXgsIChfLCBmaWVsZCkgPT4ge1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkc3ViSXRlbVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9KTtcbiAgICBcbiAgICAvLyBIYW5kbGUge3sjaWYgYWxpYXMuZmllbGQuc3ViZmllbGQuLi59fSBjb25kaXRpb25hbHMgd2l0aCBkZWVwbHkgbmVzdGVkIHBhdGhzIGluIG5lc3RlZCBsb29wc1xuICAgIC8vIGUuZy4sIHt7I2lmIHRhZy5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJHN1Ykl0ZW1bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gICAgY29uc3QgYWxpYXNJZkRlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0lmRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRzdWJJdGVtJHtwaHBBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4uIH19IHBhdHRlcm5zIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRocyBpbiBuZXN0ZWQgbG9vcHNcbiAgICBjb25zdCBhbGlhc0RlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0RlZXBSZWdleCwgKF8sIGZpZWxkUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBmaWVsZFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGxhc3RQYXJ0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBlc2NGdW5jID0gbGFzdFBhcnQgPT09ICd1cmwnIHx8IGxhc3RQYXJ0ID09PSAnc3JjJyB8fCBsYXN0UGFydCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIGNvbnN0IHBocEFjY2VzcyA9IGZpZWxkUGF0aFRvUGhwQWNjZXNzKGZpZWxkUGF0aCk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkc3ViSXRlbSR7cGhwQWNjZXNzfSA/PyAnJyk7ID8+YDtcbiAgICB9KTtcbiAgfVxuICBcbiAgLy8gVGhlbiBwcm9jZXNzIHRvcC1sZXZlbCBsb29wIGFsaWFzZXMgKHRoZXkgdXNlICRpdGVtKVxuICBmb3IgKGNvbnN0IFthbGlhc10gb2YgT2JqZWN0LmVudHJpZXMobG9vcEFsaWFzZXMpKSB7XG4gICAgLy8gSGFuZGxlIHt7eyBhbGlhcy5maWVsZCB9fX0gdHJpcGxlLWJyYWNlIHBhdHRlcm5zIChyaWNoIHRleHQvSFRNTCBpbiBsb29wcylcbiAgICBjb25zdCBhbGlhc1RyaXBsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc1RyaXBsZVJlZ2V4LCAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7I2lmIGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgIC8vIGUuZy4sIHt7I2lmIHNsaWRlLmN0YS5saW5rfX0gLT4gPD9waHAgaWYgKCFlbXB0eSgkaXRlbVsnY3RhJ11bJ2xpbmsnXSkpIDogPz5cbiAgICBjb25zdCBhbGlhc0lmRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyNpZlxcXFxzKyR7YWxpYXN9XFxcXC4oW1xcXFx3Ll0rKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzSWZEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBocEFjY2VzcyA9IGZpZWxkUGF0aFRvUGhwQWNjZXNzKGZpZWxkUGF0aCk7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW0ke3BocEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9KTtcbiAgICBcbiAgICAvLyBIYW5kbGUge3sgYWxpYXMuZmllbGQuc3ViZmllbGQuLi4gfX0gcGF0dGVybnMgd2l0aCBkZWVwbHkgbmVzdGVkIHBhdGhzXG4gICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJGl0ZW0ke3BocEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIEBmaXJzdH19IC0gc2hvdyBjb250ZW50IGZvciBhbGwgaXRlbXMgZXhjZXB0IHRoZSBmaXJzdFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAZmlyc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPiAwKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyN1bmxlc3MgQGxhc3R9fSAtIHNob3cgY29udGVudCBmb3IgYWxsIGl0ZW1zIGV4Y2VwdCB0aGUgbGFzdFxuICAvLyBVc2VzICRfbG9vcF9jb3VudCBzZXQgaW4gdGhlIGZvcmVhY2ggbG9vcFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAbGFzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA8ICRfbG9vcF9jb3VudCAtIDEpIDogPz5gXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIEBmaXJzdH19IC0gc2hvdyBjb250ZW50IG9ubHkgZm9yIHRoZSBmaXJzdCBpdGVtXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrQGZpcnN0XFxzKlxcfVxcfS9nLFxuICAgIGA8P3BocCBpZiAoJGluZGV4ID09PSAwKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBAbGFzdH19IC0gc2hvdyBjb250ZW50IG9ubHkgZm9yIHRoZSBsYXN0IGl0ZW1cbiAgLy8gVXNlcyAkX2xvb3BfY291bnQgc2V0IGluIHRoZSBmb3JlYWNoIGxvb3BcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccytAbGFzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA9PT0gJF9sb29wX2NvdW50IC0gMSkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIHByb3BlcnRpZXMueHh4fX0g4oCUIG5lZ2F0aW9uIG9mIHt7I2lmIHByb3BlcnRpZXMueHh4fX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZW1wdHkoJCR7Y2FtZWxQcm9wfSkpIDogPz5gO1xuICAgICAgfVxuICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGFydHMuc2xpY2UoMSkubWFwKChwOiBzdHJpbmcpID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZW1wdHkoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSkpIDogPz5gO1xuICAgIH1cbiAgKTtcblxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csICc8P3BocCBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgdGhpcy54eHh9fSBjb25kaXRpb25hbHMgaW5zaWRlIGxvb3BzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrdGhpc1xcLihcXHcrKVxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7ZmllbGR9J10pKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBhbGlhcy5maWVsZH19IGZvciBhbnkgcmVtYWluaW5nIGxvb3AgdmFyaWFibGUgY29uZGl0aW9uYWxzXG4gIC8vIFRoaXMgY2F0Y2hlcyBjYXNlcyB3aGVyZSB0aGUgYWxpYXMgd2Fzbid0IHRyYWNrZWQgKGUuZy4sIG5lc3RlZCBsb29wcyBvciB1bnRyYWNrZWQgYWxpYXNlcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBwcm9wZXJ0aWVzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddKSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGVscGVyIHRvIHBhcnNlIEhhbmRsZWJhcnMgaGVscGVyIGV4cHJlc3Npb25zIGxpa2UgKGVxIHByb3BlcnRpZXMubGF5b3V0IFwibGF5b3V0LTFcIilcbiAgLy8gYW5kIGNvbnZlcnQgdG8gUEhQIGNvbXBhcmlzb24gZXhwcmVzc2lvbnNcbiAgY29uc3QgcGFyc2VIZWxwZXJUb1BocCA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBIZWxwZXIgdG8gY29udmVydCBhIHZhcmlhYmxlIHBhdGggdG8gUEhQIGV4cHJlc3Npb25cbiAgICAvLyBIYW5kbGVzIHByb3BlcnRpZXMueHh4LCB0aGlzLnh4eCwgYW5kIGFsaWFzLnh4eCBwYXR0ZXJuc1xuICAgIGNvbnN0IHZhclRvUGhwID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1gO1xuICAgICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZH0nXWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBpcyBhIGtub3duIGxvb3AgYWxpYXMgKGUuZy4sIGNhcmQudHlwZSAtPiB0eXBlKVxuICAgICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAvLyBDaGVjayBuZXN0ZWQgYWxpYXNlcyBmaXJzdCAodXNlICRzdWJJdGVtKVxuICAgICAgICAgIGlmIChuZXN0ZWRMb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlbiBjaGVjayB0b3AtbGV2ZWwgYWxpYXNlcyAodXNlICRpdGVtKVxuICAgICAgICAgIGlmIChsb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2sgLSB1c2UgYXMtaXMgKG1pZ2h0IGJlIGEgcGxhaW4gZmllbGQgbmFtZSlcbiAgICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgICAgfVxuICAgIH07XG4gICAgXG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCB2YXJpYWJsZSkgd2l0aG91dCBxdW90ZXNcbiAgICBjb25zdCBlcVZhck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNdKylcXHMrKFteXFxzKVwiXSspXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFWYXJNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFWYXJNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICBjb25zdCByaWdodEV4cHIgPSB2YXJUb1BocChyaWdodCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICgke3JpZ2h0RXhwcn0gPz8gJycpYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZ3QgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW5cbiAgICBjb25zdCBndE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGd0TWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0TWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPiAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChsdCBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhblxuICAgIGNvbnN0IGx0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgICBpZiAobHRNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8ICR7cmlnaHR9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGd0ZSBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhbiBvciBlcXVhbFxuICAgIGNvbnN0IGd0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChndGVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RlTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPj0gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobHRlIGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuIG9yIGVxdWFsXG4gICAgY29uc3QgbHRlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGx0ZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdGVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8PSAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aG91dCBlbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCR7cGhwQ29uZGl0aW9ufSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGlmL2Vsc2VcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclRvUGhwKGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2VcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjaWYgcHJvcGVydGllcy54eHgueXl5Lnp6ei4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgLy8gZS5nLiwge3sjaWYgcHJvcGVydGllcy5sZWZ0X2NvbHVtbi5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGxlZnRDb2x1bW5bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJCR7Y2FtZWxQcm9wfSkpIDogPz5gO1xuICAgICAgfVxuICAgICAgLy8gQnVpbGQgbmVzdGVkIGFycmF5IGFjY2VzcyBmb3IgcmVtYWluaW5nIHBhcnRzXG4gICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoKHA6IHN0cmluZykgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSkpIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7e2Vsc2V9fSBzZXBhcmF0ZWx5IChmb3IgY2FzZXMgbm90IGNhdWdodCBieSB0aGUgY29tYmluZWQgcGF0dGVybnMgYWJvdmUpXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtlbHNlXFx9XFx9L2csICc8P3BocCBlbHNlIDogPz4nKTtcbiAgXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXC9pZlxcfVxcfS9nLCAnPD9waHAgZW5kaWY7ID8+Jyk7XG4gIFxuICAvLyBJTVBPUlRBTlQ6IENvbnZlcnQgdHJpcGxlLWJyYWNlIGV4cHJlc3Npb25zIEZJUlNUIChiZWZvcmUgZG91YmxlLWJyYWNlKVxuICAvLyBUcmlwbGUgYnJhY2VzIGFyZSBmb3IgdW5lc2NhcGVkIEhUTUwgb3V0cHV0IChyaWNoIHRleHQgZmllbGRzKVxuICBcbiAgLy8gQ29udmVydCB7e3twcm9wZXJ0aWVzLnh4eH19fSB0cmlwbGUgYnJhY2VzICh1bmVzY2FwZWQgSFRNTClcbiAgLy8gcmljaHRleHQgcHJvcHMgdXNlIElubmVyQmxvY2tzIOKAlCBvdXRwdXQgJGNvbnRlbnQgKGlubmVyIGJsb2NrcyByZW5kZXJlZCBIVE1MKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKF8sIHByb3ApID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgaWYgKHJpY2h0ZXh0UHJvcHMuaGFzKHByb3ApIHx8IHJpY2h0ZXh0UHJvcHMuaGFzKGNhbWVsUHJvcCkpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICRjb250ZW50OyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCQke2NhbWVsUHJvcH0gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3t0aGlzLnh4eH19fSB0cmlwbGUgYnJhY2VzIGZvciBsb29wIGl0ZW1zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3thbGlhcy54eHh9fX0gdHJpcGxlIGJyYWNlcyBmb3IgbmFtZWQgbG9vcCBhbGlhc2VzXG4gIC8vIFRoaXMgY2F0Y2hlcyBhbnkgcmVtYWluaW5nIGFsaWFzLmZpZWxkIHBhdHRlcm5zIHdpdGggdHJpcGxlIGJyYWNlc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCBsb29rcyBsaWtlIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7dGhpc319fSBmb3Igc2NhbGFyIGFycmF5cyB3aXRoIEhUTUwgY29udGVudFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnRoaXNcXHMqXFx9XFx9XFx9L2csXG4gICAgJzw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRzdWJJdGVtID8/ICRpdGVtID8/IFxcJ1xcJyk7ID8+J1xuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXN9fSBzaW1wbGUgcmVmZXJlbmNlIChmb3Igc2NhbGFyIGFycmF5cylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFxzKlxcfVxcfS9nLFxuICAgICc8P3BocCBlY2hvIGVzY19odG1sKCRzdWJJdGVtID8/ICRpdGVtID8/IFxcJ1xcJyk7ID8+J1xuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXMueHh4Lnl5eX19IGRlZXAgbmVzdGVkIHJlZmVyZW5jZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkMiA9PT0gJ3VybCcgfHwgZmllbGQyID09PSAnc3JjJyB8fCBmaWVsZDIgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkaXRlbVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzLnh4eH19IHJlZmVyZW5jZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkaXRlbVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7cHJvcGVydGllcy54eHgueXl5Lnp6ei4uLn19IGRlZXBseSBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzIChhbnkgZGVwdGgpXG4gIC8vIGUuZy4sIHt7cHJvcGVydGllcy5sZWZ0X2NvbHVtbi5jdGEubGluay5sYWJlbH19IC0+ICRsZWZ0Q29sdW1uWydjdGEnXVsnbGluayddWydsYWJlbCddXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGNvbnN0IGxhc3RQYXJ0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBlc2NGdW5jID0gbGFzdFBhcnQgPT09ICd1cmwnIHx8IGxhc3RQYXJ0ID09PSAnc3JjJyB8fCBsYXN0UGFydCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIFxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkJHtjYW1lbFByb3B9ID8/ICcnKTsgPz5gO1xuICAgICAgfVxuICAgICAgLy8gQnVpbGQgbmVzdGVkIGFycmF5IGFjY2VzcyBmb3IgcmVtYWluaW5nIHBhcnRzXG4gICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoKHA6IHN0cmluZykgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkJHtjYW1lbFByb3B9JHtuZXN0ZWRBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIHt7eHh4Lnl5eX19IHBhdHRlcm5zIChsaWtlbHkgbG9vcCBpdGVtIHJlZmVyZW5jZXMgd2l0aG91dCB0aGlzLilcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceytcXHMqKFxcdyspXFwuKFxcdyspXFxzKlxcfStcXH0vZyxcbiAgICAoXywgb2JqLCBmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCBsb29rcyBsaWtlIGEgUEhQIGV4cHJlc3Npb25cbiAgICAgIGlmIChvYmouaW5jbHVkZXMoJyQnKSB8fCBvYmouaW5jbHVkZXMoJ3BocCcpKSByZXR1cm4gYHt7JHtvYmp9LiR7ZmllbGR9fX1gO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyB8fCBmaWVsZCA9PT0gJ2xhYmVsJyA/IFxuICAgICAgICAoZmllbGQgPT09ICd1cmwnIHx8IGZpZWxkID09PSAnc3JjJyB8fCBmaWVsZCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJykgOiAnZXNjX2h0bWwnO1xuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbb2JqXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGhyZWY9XCJ7e3Byb3BlcnRpZXMueHh4Lnl5eX19XCIgcGF0dGVybnMgc3BlY2lmaWNhbGx5XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eH19XCIgcGF0dGVybnNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9ID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIGhyZWY9XCJ7ey4uLn19XCIgcGF0dGVybnMgKGZvciBsb29wIGl0ZW0gcmVmZXJlbmNlcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHsrKFtefV0rKVxcfStcXH1cIi9nLFxuICAgIChfLCBleHByKSA9PiB7XG4gICAgICBpZiAoZXhwci5pbmNsdWRlcygnPD9waHAnKSkgcmV0dXJuIGBocmVmPVwiJHtleHByfVwiYDtcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSB0aGlzLnh4eCBwYXR0ZXJuXG4gICAgICBjb25zdCB0aGlzTWF0Y2ggPSBleHByLm1hdGNoKC9eXFxzKnRoaXNcXC4oXFx3KykoPzpcXC4oXFx3KykpP1xccyokLyk7XG4gICAgICBpZiAodGhpc01hdGNoKSB7XG4gICAgICAgIGNvbnN0IFssIGZpZWxkMSwgZmllbGQyXSA9IHRoaXNNYXRjaDtcbiAgICAgICAgaWYgKGZpZWxkMikge1xuICAgICAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcjJyk7ID8+XCJgO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVsnJHtmaWVsZDF9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ2hyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bXFwndXJsXFwnXSA/PyAkaXRlbVtcXCdsaW5rXFwnXVtcXCd1cmxcXCddID8/IFxcJyNcXCcpOyA/PlwiJztcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDbGVhbiB1cCBhbnkgc3RyYXkgY3VybHkgYnJhY2VzIGFyb3VuZCBQSFAgZWNobyBzdGF0ZW1lbnRzXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHsoPFxcP3BocCBlY2hvKS9nLCAnJDEnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLyg7IFxcPz4pXFx9L2csICckMScpO1xuICBcbiAgcmV0dXJuIHBocC50cmltKCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGF0dHJpYnV0ZSBleHRyYWN0aW9uIGNvZGVcbiAqL1xuY29uc3QgZ2VuZXJhdGVBdHRyaWJ1dGVFeHRyYWN0aW9uID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsKTogc3RyaW5nID0+IHtcbiAgY29uc3QgZXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHZpZGVvTm9ybWFsaXphdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIE9ubHkgdGhlIGlubmVyQmxvY2tzRmllbGQgcmljaHRleHQgdXNlcyAkY29udGVudCDigJQgc2tpcCBhdHRyaWJ1dGUgZXh0cmFjdGlvbiBmb3IgaXRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgPT09IGlubmVyQmxvY2tzRmllbGQpIGNvbnRpbnVlO1xuICAgIC8vIHBhZ2luYXRpb24gaXRlbXMgYXJlIGF1dG8tZ2VuZXJhdGVkIGZyb20gV1BfUXVlcnkg4oCUIG5vIGF0dHJpYnV0ZSB0byBleHRyYWN0XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG5cbiAgICBjb25zdCBjYW1lbEtleSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gZ2V0UGhwRGVmYXVsdFZhbHVlKHByb3BlcnR5KTtcbiAgICBcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkJHtjYW1lbEtleX0gPSBpc3NldCgkYXR0cmlidXRlc1snJHtjYW1lbEtleX0nXSkgPyAkYXR0cmlidXRlc1snJHtjYW1lbEtleX0nXSA6ICR7ZGVmYXVsdFZhbHVlfTtgKTtcblxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAndmlkZW8nKSB7XG4gICAgICB2aWRlb05vcm1hbGl6YXRpb25zLnB1c2goYGlmIChpc19hcnJheSgkJHtjYW1lbEtleX0pKSB7XG4gIGlmIChlbXB0eSgkJHtjYW1lbEtleX1bJ2lkJ10pICYmICFlbXB0eSgkJHtjYW1lbEtleX1bJ3NyYyddKSAmJiBwcmVnX21hdGNoKCcjKD86bWVkaWFzL3xpZnJhbWUvKShbQS1aYS16MC05XSspIycsIChzdHJpbmcpICQke2NhbWVsS2V5fVsnc3JjJ10sICRtYXRjaGVzKSkge1xuICAgICQke2NhbWVsS2V5fVsnaWQnXSA9ICRtYXRjaGVzWzFdO1xuICB9XG4gIGlmIChlbXB0eSgkJHtjYW1lbEtleX1bJ3NyYyddKSAmJiAhZW1wdHkoJCR7Y2FtZWxLZXl9WydpZCddKSkge1xuICAgICQke2NhbWVsS2V5fVsnc3JjJ10gPSAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzLycgLiByYXd1cmxlbmNvZGUoKHN0cmluZykgJCR7Y2FtZWxLZXl9WydpZCddKSAuICcuanNvbnAnO1xuICB9XG59YCk7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gWy4uLmV4dHJhY3Rpb25zLCAuLi52aWRlb05vcm1hbGl6YXRpb25zXS5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogV3JhcCB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgdGhhdCBoYW5kbGVzIGFsaWdubWVudFxuICogQWRkcyB0aGUgYWxpZ25tZW50IGNsYXNzIChhbGlnbm5vbmUsIGFsaWdud2lkZSwgYWxpZ25mdWxsKSBiYXNlZCBvbiBibG9jayBzZXR0aW5nc1xuICovXG5jb25zdCB3cmFwV2l0aEJsb2NrV3JhcHBlciA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjb21wb25lbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gQ29udmVydCBjb21wb25lbnQgSUQgdG8gY2xhc3MgbmFtZSAoc25ha2VfY2FzZSB0byBrZWJhYi1jYXNlKVxuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSBpbiBhIGRpdiB0aGF0IHVzZXMgV29yZFByZXNzJ3MgYmxvY2sgd3JhcHBlciBhdHRyaWJ1dGVzXG4gIC8vIFRoaXMgaGFuZGxlcyBhbGlnbm1lbnQgY2xhc3NlcyBhdXRvbWF0aWNhbGx5XG4gIHJldHVybiBgPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7Y2xhc3NOYW1lfSddKTsgPz4+XG4ke3RlbXBsYXRlfVxuPC9kaXY+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgUEhQIGNvZGUgdG8gY29udmVydCBmaWVsZCBtYXBwaW5nIHZhbHVlIHRvIFBIUCBhcnJheSBzeW50YXhcbiAqL1xuY29uc3QgZmllbGRNYXBwaW5nVG9QaHAgPSAobWFwcGluZzogUmVjb3JkPHN0cmluZywgRmllbGRNYXBwaW5nVmFsdWU+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1hcHBpbmcpKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIFNpbXBsZSBzdHJpbmcgbWFwcGluZ1xuICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gJyR7dmFsdWV9J2ApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS50eXBlKSB7XG4gICAgICAvLyBDb21wbGV4IG1hcHBpbmdcbiAgICAgIHN3aXRjaCAodmFsdWUudHlwZSkge1xuICAgICAgICBjYXNlICdzdGF0aWMnOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ3N0YXRpYycsICd2YWx1ZScgPT4gJyR7KHZhbHVlIGFzIGFueSkudmFsdWUgfHwgJyd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbWFudWFsJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtYW51YWwnXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdtZXRhJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtZXRhJywgJ2tleScgPT4gJyR7KHZhbHVlIGFzIGFueSkua2V5IHx8ICcnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RheG9ub215JzpcbiAgICAgICAgICBjb25zdCB0YXhWYWx1ZSA9IHZhbHVlIGFzIHsgdHlwZTogJ3RheG9ub215JzsgdGF4b25vbXk6IHN0cmluZzsgZm9ybWF0Pzogc3RyaW5nIH07XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAndGF4b25vbXknLCAndGF4b25vbXknID0+ICcke3RheFZhbHVlLnRheG9ub215fScsICdmb3JtYXQnID0+ICcke3RheFZhbHVlLmZvcm1hdCB8fCAnZmlyc3QnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2N1c3RvbSc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnY3VzdG9tJywgJ2NhbGxiYWNrJyA9PiAnJHsodmFsdWUgYXMgYW55KS5jYWxsYmFjayB8fCAnJ30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGBbXFxuJHtlbnRyaWVzLmpvaW4oJyxcXG4nKX1cXG4gIF1gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBwYWdpbmF0aW9uIFBIUCBjb2RlIGZvciBhIGR5bmFtaWMgYXJyYXkgcXVlcnkuXG4gKiBSZXR1cm5zIHRoZSBwYWdpbmF0aW9uIGJsb2NrIHRvIGFwcGVuZCBhZnRlciB0aGUgV1BfUXVlcnkgZXhlY3V0aW9uLlxuICovXG5jb25zdCBnZW5lcmF0ZVBhZ2luYXRpb25QaHAgPSAoXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIHBhZ2luYXRpb25Qcm9wTmFtZTogc3RyaW5nXG4pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gYFxuICAvLyBQYWdpbmF0aW9uXG4gICQke3BhZ2luYXRpb25Qcm9wTmFtZX0gPSBbXTtcbiAgJCR7YXR0ck5hbWV9X3BhZ2luYXRpb25fZW5hYmxlZCA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkJ10gPz8gdHJ1ZTtcbiAgaWYgKCQke2F0dHJOYW1lfV9wYWdpbmF0aW9uX2VuYWJsZWQgJiYgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzID4gMSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbicpKSB7XG4gICAgJCR7cGFnaW5hdGlvblByb3BOYW1lfSA9IGhhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbigkaGZfcGFnZWQsICRxdWVyeS0+bWF4X251bV9wYWdlcywgJyR7YGhmX3BhZ2VfJHthdHRyTmFtZX1gfScpO1xuICB9YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIHBhZ2VkIHZhcmlhYmxlIGV4dHJhY3Rpb24gYW5kIFdQX1F1ZXJ5IHBhZ2VkIGFyZyBmb3IgcGFnaW5hdGlvbi5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdlZFBocCA9IChhdHRyTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcGFyYW1LZXkgPSBgaGZfcGFnZV8ke2F0dHJOYW1lfWA7XG4gIHJldHVybiBgXG4gIC8vIFJlYWQgY3VycmVudCBwYWdlIGZyb20gY3VzdG9tIHF1ZXJ5IHBhcmFtZXRlclxuICAkaGZfcGFnZWQgPSBpc3NldCgkX0dFVFsnJHtwYXJhbUtleX0nXSkgPyBtYXgoMSwgaW50dmFsKCRfR0VUWycke3BhcmFtS2V5fSddKSkgOiAxO2A7XG59O1xuXG4vKipcbiAqIEJ1aWxkIFBIUCBhcnJheV9tYXAgZXhwcmVzc2lvbiB0byByZXNoYXBlIHN0YW5kYXJkIGhlbHBlciBpdGVtcyBpbnRvIHRoZVxuICogdGVtcGxhdGUncyBleHBlY3RlZCBpdGVtIHNoYXBlLiAgUmV0dXJucyBudWxsIHdoZW4gbm8gcmVzaGFwaW5nIGlzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gaXRlbVByb3BlcnRpZXMgIFRoZSBjb21wb25lbnQncyBhcnJheSBpdGVtIHByb3BlcnR5IHNjaGVtYSAoaXRlbXMucHJvcGVydGllcylcbiAqIEBwYXJhbSBzdGFuZGFyZEZpZWxkcyAgVGhlIGZsYXQgZmllbGQgbmFtZXMgdGhlIGhlbHBlciByZXR1cm5zIChlLmcuIFsnbGFiZWwnLCd1cmwnXSlcbiAqL1xuY29uc3QgYnVpbGRSZXNoYXBlUGhwID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG5cbiAgLy8gSWYgZXZlcnkgdG9wLWxldmVsIGtleSBJUyBhIHN0YW5kYXJkIGZpZWxkIHRoZSBzaGFwZXMgYWxyZWFkeSBtYXRjaFxuICBpZiAodG9wS2V5cy5ldmVyeShrID0+IHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGspKSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgcGFpcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbVByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIHBhaXJzLnB1c2goYCcke2tleX0nID0+ICRfX2l0ZW1bJyR7a2V5fSddYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJyB8fCBwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ2xhYmVsJykpIHN1Yi5wdXNoKGAnbGFiZWwnID0+ICRfX2l0ZW1bJ2xhYmVsJ11gKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYCd1cmwnICAgPT4gJF9faXRlbVsndXJsJ11gKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAnJHtrZXl9JyA9PiBbJHtzdWIuam9pbignLCAnKX1dYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgZm9yIChjb25zdCBzdWJLZXkgb2YgT2JqZWN0LmtleXMocHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoc3ViS2V5KSkge1xuICAgICAgICAgIHN1Yi5wdXNoKGAnJHtzdWJLZXl9JyA9PiAkX19pdGVtWycke3N1YktleX0nXWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJyR7a2V5fScgPT4gWyR7c3ViLmpvaW4oJywgJyl9XWApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYWlycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gYFske3BhaXJzLmpvaW4oJywgJyl9XWA7XG59O1xuXG4vKipcbiAqIEJ1aWxkIGVxdWl2YWxlbnQgSlMgcmVzaGFwZSBleHByZXNzaW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAqIFJldHVybnMgbnVsbCB3aGVuIG5vIHJlc2hhcGluZyBpcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGJ1aWxkUmVzaGFwZUpzID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG4gIGlmICh0b3BLZXlzLmV2ZXJ5KGsgPT4gc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoaykpKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBwYWlyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhpdGVtUHJvcGVydGllcykpIHtcbiAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgcGFpcnMucHVzaChgJHtrZXl9OiBpdGVtLiR7a2V5fWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnbGluaycgfHwgcHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCdsYWJlbCcpKSBzdWIucHVzaChgbGFiZWw6IGl0ZW0ubGFiZWxgKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYHVybDogaXRlbS51cmxgKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAke2tleX06IHsgJHtzdWIuam9pbignLCAnKX0gfWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGZvciAoY29uc3Qgc3ViS2V5IG9mIE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKHN1YktleSkpIHtcbiAgICAgICAgICBzdWIucHVzaChgJHtzdWJLZXl9OiBpdGVtLiR7c3ViS2V5fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJHtrZXl9OiB7ICR7c3ViLmpvaW4oJywgJyl9IH1gKTtcbiAgICB9XG4gIH1cblxuICBpZiAocGFpcnMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGAoeyAke3BhaXJzLmpvaW4oJywgJyl9IH0pYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYnJlYWRjcnVtYnMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogQ2FsbHMgaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcygpIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHJldHVybnMgYW4gZW1wdHkgYXJyYXkuXG4gKi9cbmNvbnN0IGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnXSk7XG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7XG4gICAgJCR7YXR0ck5hbWV9ID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCRfX2l0ZW0pIHsgcmV0dXJuICR7cmVzaGFwZUV4cHJ9OyB9LCAkX19yYXcpO2BcbiAgICA6IGAkJHthdHRyTmFtZX0gPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7YDtcblxuICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChicmVhZGNydW1icylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCFmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMnKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zJykpIHtcbiAgICAke2Fzc2lnbkl0ZW1zfVxuICB9XG59XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0YXhvbm9teSB0ZXJtcyBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG1heEl0ZW1zID0gY29uZmlnLm1heEl0ZW1zID8/IC0xO1xuICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBjb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcblxuICAvLyBCdWlsZCB0aGUgcGVyLXRlcm0gYXNzaWdubWVudDogZWl0aGVyIGZsYXQgb3IgcmVzaGFwZWRcbiAgbGV0IHRlcm1Bc3NpZ25tZW50OiBzdHJpbmc7XG4gIGlmIChyZXNoYXBlRXhwcikge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJF9faXRlbSA9IFsnbGFiZWwnID0+ICR0ZXJtLT5uYW1lLCAndXJsJyA9PiBnZXRfdGVybV9saW5rKCR0ZXJtKSwgJ3NsdWcnID0+ICR0ZXJtLT5zbHVnXTtcbiAgICAgICAgJCR7YXR0ck5hbWV9W10gPSAke3Jlc2hhcGVFeHByfTtgO1xuICB9IGVsc2Uge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJCR7YXR0ck5hbWV9W10gPSBbXG4gICAgICAgICAgJ2xhYmVsJyA9PiAkdGVybS0+bmFtZSxcbiAgICAgICAgICAndXJsJyAgID0+IGdldF90ZXJtX2xpbmsoJHRlcm0pLFxuICAgICAgICAgICdzbHVnJyAgPT4gJHRlcm0tPnNsdWcsXG4gICAgICAgIF07YDtcbiAgfVxuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHRheG9ub215IHRlcm1zKVxuJCR7YXR0ck5hbWV9RW5hYmxlZCAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gID8/IGZhbHNlO1xuJCR7YXR0ck5hbWV9VGF4b25vbXkgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1UYXhvbm9teSddID8/ICcke2RlZmF1bHRUYXhvbm9teX0nO1xuJCR7YXR0ck5hbWV9U291cmNlICAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSAgID8/ICdhdXRvJztcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCQke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAkJHthdHRyTmFtZX0gPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX0nXSA/PyBbXTtcbiAgfSBlbHNlIHtcbiAgICAkdGVybXMgPSB3cF9nZXRfcG9zdF90ZXJtcyhnZXRfdGhlX0lEKCksICQke2F0dHJOYW1lfVRheG9ub215LCBbJ251bWJlcicgPT4gJHttYXhJdGVtc31dKTtcbiAgICBpZiAoIWlzX3dwX2Vycm9yKCR0ZXJtcykpIHtcbiAgICAgIGZvcmVhY2ggKCR0ZXJtcyBhcyAkdGVybSkge1xuJHt0ZXJtQXNzaWdubWVudH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHBhZ2luYXRpb24gYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogUmVmZXJlbmNlcyB0aGUgV1BfUXVlcnkgaW5zdGFuY2UgKCRxdWVyeSkgcHJvZHVjZWQgYnkgdGhlIGNvbm5lY3RlZCBwb3N0cyBmaWVsZC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgY29uZmlnOiBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbm5lY3RlZEF0dHIgPSB0b0NhbWVsQ2FzZShjb25maWcuY29ubmVjdGVkRmllbGQpO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnYWN0aXZlJ10pO1xuXG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24oJGhmX3BhZ2VkXyR7Y29ubmVjdGVkQXR0cn0sICRxdWVyeS0+bWF4X251bV9wYWdlcywgJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfScpO1xuICAgICQke2F0dHJOYW1lfSA9IGFycmF5X21hcChmdW5jdGlvbigkX19pdGVtKSB7IHJldHVybiAke3Jlc2hhcGVFeHByfTsgfSwgJF9fcmF3KTtgXG4gICAgOiBgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uKCRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9LCAkcXVlcnktPm1heF9udW1fcGFnZXMsICdoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nKTtgO1xuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHBhZ2luYXRpb24g4oCUIGNvbm5lY3RlZCB0byAnJHtjb25maWcuY29ubmVjdGVkRmllbGR9JylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQgJiYgaXNzZXQoJHF1ZXJ5KSAmJiAkcXVlcnktPm1heF9udW1fcGFnZXMgPiAxKSB7XG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9ID0gaXNzZXQoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSA/IG1heCgxLCBpbnR2YWwoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSkgOiAxO1xuICAgICR7YXNzaWduSXRlbXN9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGR5bmFtaWMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwXG4gKiBTdXBwb3J0cyBib3RoIG1hbnVhbCBwb3N0IHNlbGVjdGlvbiBhbmQgcXVlcnkgYnVpbGRlciBtb2Rlc1xuICovXG5jb25zdCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IER5bmFtaWNBcnJheUNvbmZpZ1xuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbWFwcGluZ1BocCA9IGNvbmZpZy5maWVsZE1hcHBpbmcgXG4gICAgPyBmaWVsZE1hcHBpbmdUb1BocChjb25maWcuZmllbGRNYXBwaW5nKSBcbiAgICA6ICdbXSc7XG4gIFxuICBjb25zdCBpc1F1ZXJ5TW9kZSA9IGNvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAncXVlcnknO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uID0gaXNRdWVyeU1vZGUgJiYgISFjb25maWcucGFnaW5hdGlvbjtcbiAgY29uc3QgcGFnaW5hdGlvblByb3BOYW1lID0gY29uZmlnLnBhZ2luYXRpb24/LnByb3BlcnR5TmFtZSB8fCAncGFnaW5hdGlvbic7XG4gIFxuICAvLyBDb21tb24gY29kZSBmb3IgbG9hZGluZyB0aGUgZmllbGQgcmVzb2x2ZXJcbiAgY29uc3QgbG9hZFJlc29sdmVyID0gYFxuICAvLyBFbnN1cmUgZmllbGQgcmVzb2x2ZXIgaXMgbG9hZGVkXG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpIFxuICAgICAgPyBIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSIC4gJ2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJ1xuICAgICAgOiBkaXJuYW1lKF9fRklMRV9fKSAuICcvLi4vaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnO1xuICAgIGlmIChmaWxlX2V4aXN0cygkcmVzb2x2ZXJfcGF0aCkpIHtcbiAgICAgIHJlcXVpcmVfb25jZSAkcmVzb2x2ZXJfcGF0aDtcbiAgICB9XG4gIH1gO1xuXG4gIC8vIFBhZ2luYXRpb24gUEhQIHNuaXBwZXRzIChlbXB0eSBzdHJpbmdzIHdoZW4gbm8gcGFnaW5hdGlvbilcbiAgY29uc3QgcGFnZWRFeHRyYWN0aW9uID0gaGFzUGFnaW5hdGlvbiA/IGdlbmVyYXRlUGFnZWRQaHAoYXR0ck5hbWUpIDogJyc7XG4gIGNvbnN0IHBhZ2VkQXJnID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4gICAgJ3BhZ2VkJyAgICAgICAgICA9PiAkaGZfcGFnZWQsYCA6ICcnO1xuICBjb25zdCBwYWdpbmF0aW9uQmxvY2sgPSBoYXNQYWdpbmF0aW9uID8gZ2VuZXJhdGVQYWdpbmF0aW9uUGhwKGF0dHJOYW1lLCBwYWdpbmF0aW9uUHJvcE5hbWUpIDogJyc7XG4gIC8vIEluaXRpYWxpemUgcGFnaW5hdGlvbiB2YXJpYWJsZSB0byBlbXB0eSBhcnJheSB3aGVuIG5vdCBpbiBxdWVyeSBtb2RlXG4gIGNvbnN0IHBhZ2luYXRpb25Jbml0ID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4kJHtwYWdpbmF0aW9uUHJvcE5hbWV9ID0gW107YCA6ICcnO1xuXG4gIGlmIChjb25maWcucmVuZGVyTW9kZSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIC8vIFRlbXBsYXRlIG1vZGUgLSBzdG9yZSBwb3N0cyBmb3IgdGVtcGxhdGUgcmVuZGVyaW5nXG4gICAgY29uc3QgdGVtcGxhdGVQYXRoID0gY29uZmlnLnRlbXBsYXRlUGF0aCB8fCBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2ZpZWxkTmFtZX0taXRlbS5waHBgO1xuICAgIFxuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIC0gdXNlIFdQX1F1ZXJ5IHdpdGggcXVlcnkgYXJnc1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAocXVlcnkgYnVpbGRlciArIHRlbXBsYXRlIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5JztcbiQke2F0dHJOYW1lfV9wb3N0cyA9IFtdOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAncXVlcnknKSB7XG4gIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSAtIGJ1aWxkIFdQX1F1ZXJ5IGZyb20gc2F2ZWQgYXJnc1xuICAkcXVlcnlfYXJncyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVF1ZXJ5QXJncyddID8/IFtdOyR7cGFnZWRFeHRyYWN0aW9ufVxuICBcbiAgLy8gQnVpbGQgV1BfUXVlcnkgYXJndW1lbnRzXG4gICR3cF9xdWVyeV9hcmdzID0gW1xuICAgICdwb3N0X3R5cGUnICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RfdHlwZSddID8/ICcke2NvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgY29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCd9JyxcbiAgICAncG9zdHNfcGVyX3BhZ2UnID0+ICRxdWVyeV9hcmdzWydwb3N0c19wZXJfcGFnZSddID8/ICR7Y29uZmlnLm1heEl0ZW1zIHx8IDZ9LFxuICAgICdvcmRlcmJ5JyAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyYnknXSA/PyAnZGF0ZScsXG4gICAgJ29yZGVyJyAgICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXInXSA/PyAnREVTQycsXG4gICAgJ3Bvc3Rfc3RhdHVzJyAgICA9PiAncHVibGlzaCcsJHtwYWdlZEFyZ31cbiAgXTtcbiAgXG4gIC8vIEV4Y2x1ZGUgdGhlIGN1cnJlbnQgcG9zdCB0byBwcmV2ZW50IHNlbGYtcmVmZXJlbmNlXG4gICRjdXJyZW50X3Bvc3RfaWQgPSBnZXRfdGhlX0lEKCk7XG4gIGlmICgkY3VycmVudF9wb3N0X2lkKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3Bvc3RfX25vdF9pbiddID0gWyRjdXJyZW50X3Bvc3RfaWRdO1xuICB9XG4gIFxuICAvLyBBZGQgdGF4b25vbXkgcXVlcmllcyBpZiBwcmVzZW50XG4gIGlmICghZW1wdHkoJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKSkge1xuICAgICR3cF9xdWVyeV9hcmdzWyd0YXhfcXVlcnknXSA9IGFycmF5X21hcChmdW5jdGlvbigkdHEpIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgICd0YXhvbm9teScgPT4gJHRxWyd0YXhvbm9teSddID8/ICcnLFxuICAgICAgICAnZmllbGQnICAgID0+ICR0cVsnZmllbGQnXSA/PyAndGVybV9pZCcsXG4gICAgICAgICd0ZXJtcycgICAgPT4gJHRxWyd0ZXJtcyddID8/IFtdLFxuICAgICAgICAnb3BlcmF0b3InID0+ICR0cVsnb3BlcmF0b3InXSA/PyAnSU4nLFxuICAgICAgXTtcbiAgICB9LCAkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pO1xuICB9XG4gIFxuICAkcXVlcnkgPSBuZXcgV1BfUXVlcnkoJHdwX3F1ZXJ5X2FyZ3MpO1xuICAkJHthdHRyTmFtZX1fcG9zdHMgPSAkcXVlcnktPnBvc3RzOyR7cGFnaW5hdGlvbkJsb2NrfVxuICB3cF9yZXNldF9wb3N0ZGF0YSgpO1xufVxuLy8gRm9yIHRlbXBsYXRlIG1vZGUsIHRoZSB0ZW1wbGF0ZSB3aWxsIGl0ZXJhdGUgb3ZlciAkJHthdHRyTmFtZX1fcG9zdHNcbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE1hbnVhbCBzZWxlY3Rpb24gbW9kZSAtIGZldGNoIHNwZWNpZmljIHBvc3RzXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChzZWxlY3QgcG9zdHMgKyB0ZW1wbGF0ZSBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7XG4kJHthdHRyTmFtZX1fcG9zdHMgPSBbXTske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICBcbiAgaWYgKCFlbXB0eSgkc2VsZWN0ZWRfcG9zdHMpKSB7XG4gICAgJHBvc3RfaWRzID0gYXJyYXlfZmlsdGVyKGFycmF5X21hcChmdW5jdGlvbigkcCkgeyBcbiAgICAgIHJldHVybiBpc3NldCgkcFsnaWQnXSkgPyBpbnR2YWwoJHBbJ2lkJ10pIDogMDsgXG4gICAgfSwgJHNlbGVjdGVkX3Bvc3RzKSk7XG4gICAgXG4gICAgaWYgKCFlbXB0eSgkcG9zdF9pZHMpKSB7XG4gICAgICAkJHthdHRyTmFtZX1fcG9zdHMgPSBnZXRfcG9zdHMoW1xuICAgICAgICAncG9zdF9faW4nICAgICAgID0+ICRwb3N0X2lkcyxcbiAgICAgICAgJ29yZGVyYnknICAgICAgICA9PiAncG9zdF9faW4nLFxuICAgICAgICAncG9zdHNfcGVyX3BhZ2UnID0+IGNvdW50KCRwb3N0X2lkcyksXG4gICAgICAgICdwb3N0X3N0YXR1cycgICAgPT4gJ3B1Ymxpc2gnLFxuICAgICAgICAncG9zdF90eXBlJyAgICAgID0+ICdhbnknLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG59XG4vLyBGb3IgdGVtcGxhdGUgbW9kZSwgdGhlIHRlbXBsYXRlIHdpbGwgaXRlcmF0ZSBvdmVyICQke2F0dHJOYW1lfV9wb3N0c1xuYDtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gTWFwcGVkIG1vZGUgLSBjb252ZXJ0IHBvc3RzIHRvIGl0ZW0gc3RydWN0dXJlXG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgd2l0aCBmaWVsZCBtYXBwaW5nXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChxdWVyeSBidWlsZGVyICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgLSBidWlsZCBXUF9RdWVyeSBmcm9tIHNhdmVkIGFyZ3NcbiAgJHF1ZXJ5X2FyZ3MgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1RdWVyeUFyZ3MnXSA/PyBbXTtcbiAgJGZpZWxkX21hcHBpbmcgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1GaWVsZE1hcHBpbmcnXSA/PyAke21hcHBpbmdQaHB9O1xuJHtsb2FkUmVzb2x2ZXJ9JHtwYWdlZEV4dHJhY3Rpb259XG4gIFxuICAvLyBCdWlsZCBXUF9RdWVyeSBhcmd1bWVudHNcbiAgJHdwX3F1ZXJ5X2FyZ3MgPSBbXG4gICAgJ3Bvc3RfdHlwZScgICAgICA9PiAkcXVlcnlfYXJnc1sncG9zdF90eXBlJ10gPz8gJyR7Y29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBjb25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0J30nLFxuICAgICdwb3N0c19wZXJfcGFnZScgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RzX3Blcl9wYWdlJ10gPz8gJHtjb25maWcubWF4SXRlbXMgfHwgNn0sXG4gICAgJ29yZGVyYnknICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXJieSddID8/ICdkYXRlJyxcbiAgICAnb3JkZXInICAgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlciddID8/ICdERVNDJyxcbiAgICAncG9zdF9zdGF0dXMnICAgID0+ICdwdWJsaXNoJywke3BhZ2VkQXJnfVxuICBdO1xuICBcbiAgLy8gRXhjbHVkZSB0aGUgY3VycmVudCBwb3N0IHRvIHByZXZlbnQgc2VsZi1yZWZlcmVuY2VcbiAgJGN1cnJlbnRfcG9zdF9pZCA9IGdldF90aGVfSUQoKTtcbiAgaWYgKCRjdXJyZW50X3Bvc3RfaWQpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sncG9zdF9fbm90X2luJ10gPSBbJGN1cnJlbnRfcG9zdF9pZF07XG4gIH1cbiAgXG4gIC8vIEFkZCB0YXhvbm9teSBxdWVyaWVzIGlmIHByZXNlbnRcbiAgaWYgKCFlbXB0eSgkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCR0cSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgJ3RheG9ub215JyA9PiAkdHFbJ3RheG9ub215J10gPz8gJycsXG4gICAgICAgICdmaWVsZCcgICAgPT4gJHRxWydmaWVsZCddID8/ICd0ZXJtX2lkJyxcbiAgICAgICAgJ3Rlcm1zJyAgICA9PiAkdHFbJ3Rlcm1zJ10gPz8gW10sXG4gICAgICAgICdvcGVyYXRvcicgPT4gJHRxWydvcGVyYXRvciddID8/ICdJTicsXG4gICAgICBdO1xuICAgIH0sICRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSk7XG4gIH1cbiAgXG4gICRxdWVyeSA9IG5ldyBXUF9RdWVyeSgkd3BfcXVlcnlfYXJncyk7XG4gIFxuICAvLyBNYXAgcG9zdHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlXG4gICQke2F0dHJOYW1lfSA9IFtdO1xuICBpZiAoJHF1ZXJ5LT5oYXZlX3Bvc3RzKCkgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgIGZvcmVhY2ggKCRxdWVyeS0+cG9zdHMgYXMgJHBvc3QpIHtcbiAgICAgICQke2F0dHJOYW1lfVtdID0gaGFuZG9mZl9tYXBfcG9zdF90b19pdGVtKCRwb3N0LT5JRCwgJGZpZWxkX21hcHBpbmcpO1xuICAgIH1cbiAgfVxuICAvLyBBcHBseSBpdGVtIG92ZXJyaWRlcyAoZS5nLiBjYXJkIHR5cGUgZm9yIGFsbCBpdGVtcykgZnJvbSBBZHZhbmNlZCBvcHRpb25zXG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH0ke3BhZ2luYXRpb25CbG9ja31cbiAgd3BfcmVzZXRfcG9zdGRhdGEoKTtcbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNlbGVjdCBwb3N0cyBtb2RlIHdpdGggZmllbGQgbWFwcGluZ1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAoc2VsZWN0IHBvc3RzICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICAkZmllbGRfbWFwcGluZyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUZpZWxkTWFwcGluZyddID8/ICR7bWFwcGluZ1BocH07XG4ke2xvYWRSZXNvbHZlcn1cbiAgXG4gIGlmICghZW1wdHkoJHNlbGVjdGVkX3Bvc3RzKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfcXVlcnlfYW5kX21hcF9wb3N0cycpKSB7XG4gICAgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9xdWVyeV9hbmRfbWFwX3Bvc3RzKCRzZWxlY3RlZF9wb3N0cywgJGZpZWxkX21hcHBpbmcpO1xuICB9IGVsc2Uge1xuICAgICQke2F0dHJOYW1lfSA9IFtdO1xuICB9XG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH1cbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIHJlbmRlci5waHAgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICovXG5jb25zdCBnZW5lcmF0ZVJlbmRlclBocCA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbFxuKTogc3RyaW5nID0+IHtcbiAgLy8gT25seSB0aGUgaW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCB1c2VzICRjb250ZW50IChJbm5lckJsb2Nrcyk7XG4gIC8vIG90aGVyIHJpY2h0ZXh0IGZpZWxkcyBhcmUgcmVuZGVyZWQgZnJvbSB0aGVpciBzdHJpbmcgYXR0cmlidXRlcy5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAoaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKGlubmVyQmxvY2tzRmllbGQpO1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGF0dHJpYnV0ZUV4dHJhY3Rpb24gPSBnZW5lcmF0ZUF0dHJpYnV0ZUV4dHJhY3Rpb24oY29tcG9uZW50LnByb3BlcnRpZXMsIGlubmVyQmxvY2tzRmllbGQpO1xuICBjb25zdCB3aXN0aWFFbnF1ZXVlQ29kZSA9IGdlbmVyYXRlV2lzdGlhRW5xdWV1ZUNvZGUoY29tcG9uZW50LmNvZGUpO1xuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChzdHJpcFdpc3RpYVNjcmlwdFRhZ3MoY29tcG9uZW50LmNvZGUpLCBjb21wb25lbnQucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBkeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gY29kZVxuICBjb25zdCBkeW5hbWljQXJyYXlFeHRyYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5hbWljQXJyYXlDb2RlID0gZHluYW1pY0FycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgZm9yIGFsaWdubWVudCBzdXBwb3J0XG4gIGNvbnN0IHdyYXBwZWRUZW1wbGF0ZSA9IHdyYXBXaXRoQmxvY2tXcmFwcGVyKHRlbXBsYXRlUGhwLCBjb21wb25lbnQuaWQpO1xuICBcbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7Y29tcG9uZW50LnRpdGxlfVxuICpcbiAqIEBwYXJhbSBhcnJheSAgICAkYXR0cmlidXRlcyBCbG9jayBhdHRyaWJ1dGVzLlxuICogQHBhcmFtIHN0cmluZyAgICRjb250ZW50ICAgIEJsb2NrIGRlZmF1bHQgY29udGVudC5cbiAqIEBwYXJhbSBXUF9CbG9jayAkYmxvY2sgICAgICBCbG9jayBpbnN0YW5jZS5cbiAqIEByZXR1cm4gc3RyaW5nIFJldHVybnMgdGhlIGJsb2NrIG1hcmt1cC5cbiAqL1xuXG5pZiAoIWRlZmluZWQoJ0FCU1BBVEgnKSkge1xuICBleGl0O1xufVxuXG5pZiAoIWlzc2V0KCRhdHRyaWJ1dGVzKSkge1xuICAkYXR0cmlidXRlcyA9IFtdO1xufVxuXG4vLyBFeHRyYWN0IGF0dHJpYnV0ZXMgd2l0aCBkZWZhdWx0c1xuJHthdHRyaWJ1dGVFeHRyYWN0aW9ufVxuJHtkeW5hbWljQXJyYXlDb2RlfVxuJHt3aXN0aWFFbnF1ZXVlQ29kZX1cbj8+XG4ke3dyYXBwZWRUZW1wbGF0ZX1cbmA7XG59O1xuXG5leHBvcnQge1xuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgaGFuZGxlYmFyc1RvUGhwLFxuICBhcnJheVRvUGhwLFxuICBnZXRQaHBEZWZhdWx0VmFsdWUsXG4gIGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24sXG4gIGJ1aWxkUmVzaGFwZVBocCxcbiAgYnVpbGRSZXNoYXBlSnMsXG59O1xuIl19