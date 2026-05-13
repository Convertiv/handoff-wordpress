"use strict";
/**
 * Generates render.php for server-side rendering
 * Converts Handlebars templates to PHP
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReshapeJs = exports.buildReshapePhp = exports.generatePaginationArrayExtraction = exports.generateTaxonomyArrayExtraction = exports.generateBreadcrumbsArrayExtraction = exports.generateDynamicArrayExtraction = exports.generateAttributeExtraction = exports.getPhpDefaultValue = exports.arrayToPhp = exports.handlebarsToPhp = exports.generateRenderPhp = void 0;
const types_1 = require("../types");
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
            return "['label' => '', 'href' => '#', 'target' => '', 'rel' => '', 'disabled' => false]";
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
    // Convert {{#each this.xxx as |alias|}} or {{#each this.xxx as |alias index|}} nested loops with alias
    // The second parameter (index) is optional and ignored since we use $subIndex in PHP
    php = php.replace(/\{\{#each\s+this\.(\w+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g, (_, prop, alias) => {
        nestedLoopAliases[alias] = prop;
        return `<?php if (!empty($item['${prop}']) && is_array($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    });
    // Convert {{#each this.xxx}} nested loops without alias
    // Use $_nested_loop_count for nested @last checking
    php = php.replace(/\{\{#each\s+this\.(\w+)\s*\}\}/g, (_, prop) => {
        return `<?php if (!empty($item['${prop}']) && is_array($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    });
    // Convert {{#each alias.xxx as |nestedAlias|}} or {{#each alias.xxx as |nestedAlias index|}} - nested loops referencing outer loop alias
    // e.g., {{#each article.tags as |tag|}} where 'article' is from outer {{#each articles as |article|}}
    // The second parameter (index) is optional and ignored since we use $subIndex in PHP
    php = php.replace(/\{\{#each\s+(\w+)\.(\w+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g, (match, parentAlias, prop, nestedAlias) => {
        // Skip if it's properties.xxx or this.xxx (already handled)
        if (parentAlias === 'properties' || parentAlias === 'this') {
            return match;
        }
        // This is a nested loop referencing an outer loop alias
        nestedLoopAliases[nestedAlias] = prop;
        return `<?php if (!empty($item['${prop}']) && is_array($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    });
    // Convert {{#each alias.xxx}} - nested loops referencing outer loop alias without nested alias
    php = php.replace(/\{\{#each\s+(\w+)\.(\w+)\s*\}\}/g, (match, parentAlias, prop) => {
        // Skip if it's properties.xxx or this.xxx (already handled)
        if (parentAlias === 'properties' || parentAlias === 'this') {
            return match;
        }
        // This is a nested loop referencing an outer loop alias
        return `<?php if (!empty($item['${prop}']) && is_array($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXBocC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3JlbmRlci1waHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0NBQW1PO0FBQ25PLDJEQUFrRDtBQUVsRDs7R0FFRztBQUNILE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBVSxFQUFVLEVBQUU7SUFDeEMsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMxQyxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDekIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7YUFDaEMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNkLE9BQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQztJQUN0QixDQUFDO0lBRUQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixPQUFPLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUMzQyxDQUFDO0lB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LHVCQUF1QixDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbkcsQ0FBQztpQkFBTSxJQUFJLElBQUEsd0JBQWdCLEVBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDcEMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLCtCQUErQixDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDeEcsQ0FBQztpQkFBTSxJQUFJLElBQUEsMEJBQWtCLEVBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDdEMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDMUcsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLHVCQUF1QixDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDNUYsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBQ0QsTUFBTSxnQkFBZ0IsR0FBRyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFNUQsNkRBQTZEO0lBQzdELE1BQU0sZUFBZSxHQUFHLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFeEUsT0FBTzs7K0JBRXNCLFNBQVMsQ0FBQyxLQUFLOzs7Ozs7Ozs7Ozs7Ozs7OztFQWlCNUMsbUJBQW1CO0VBQ25CLGdCQUFnQjtFQUNoQixpQkFBaUI7O0VBRWpCLGVBQWU7Q0FDaEIsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdBLDhDQUFpQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIHJlbmRlci5waHAgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xuICogQ29udmVydHMgSGFuZGxlYmFycyB0ZW1wbGF0ZXMgdG8gUEhQXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRNYXBwaW5nVmFsdWUsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5cbi8qKlxuICogQ29udmVydCBKUyBhcnJheS9vYmplY3QgdG8gUEhQIGFycmF5IHN5bnRheFxuICovXG5jb25zdCBhcnJheVRvUGhwID0gKHZhbHVlOiBhbnkpOiBzdHJpbmcgPT4ge1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiAnbnVsbCc7XG4gIH1cbiAgXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIGNvbnN0IGl0ZW1zID0gdmFsdWUubWFwKHYgPT4gYXJyYXlUb1BocCh2KSkuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske2l0ZW1zfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IHBhaXJzID0gT2JqZWN0LmVudHJpZXModmFsdWUpXG4gICAgICAubWFwKChbaywgdl0pID0+IGAnJHtrfScgPT4gJHthcnJheVRvUGhwKHYpfWApXG4gICAgICAuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske3BhaXJzfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBgJyR7dmFsdWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuICB9XG4gIFxuICByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbn07XG5cbi8qKlxuICogR2V0IFBIUCBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5XG4gKi9cbmNvbnN0IGdldFBocERlZmF1bHRWYWx1ZSA9IChwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+IHtcbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6XG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICByZXR1cm4gYCcke1N0cmluZyhwcm9wZXJ0eS5kZWZhdWx0ID8/ICcnKS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBTdHJpbmcocHJvcGVydHkuZGVmYXVsdCA/PyAwKTtcbiAgICBcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBwcm9wZXJ0eS5kZWZhdWx0ID8gJ3RydWUnIDogJ2ZhbHNlJztcbiAgICBcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4gXCJbJ3NyYycgPT4gJycsICdhbHQnID0+ICcnXVwiO1xuXG4gICAgY2FzZSAndmlkZW8nOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQgJiYgdHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHByb3BlcnR5LmRlZmF1bHQpKSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHtcbiAgICAgICAgICBzcmM6ICcnLFxuICAgICAgICAgIGlkOiAnJyxcbiAgICAgICAgICBwb3N0ZXI6ICcnLFxuICAgICAgICAgIHR5cGU6ICcnLFxuICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICBtaW1lOiAnJyxcbiAgICAgICAgICBtaW1lVHlwZTogJycsXG4gICAgICAgICAgLi4ucHJvcGVydHkuZGVmYXVsdCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdzdHJpbmcnICYmIHByb3BlcnR5LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAoe1xuICAgICAgICAgIHNyYzogcHJvcGVydHkuZGVmYXVsdCxcbiAgICAgICAgICBpZDogJycsXG4gICAgICAgICAgcG9zdGVyOiAnJyxcbiAgICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgbWltZTogJycsXG4gICAgICAgICAgbWltZVR5cGU6ICcnLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlsnc3JjJyA9PiAnJywgJ2lkJyA9PiAnJywgJ3Bvc3RlcicgPT4gJycsICd0eXBlJyA9PiAnJywgJ3dpZHRoJyA9PiAwLCAnaGVpZ2h0JyA9PiAwLCAnbWltZScgPT4gJycsICdtaW1lVHlwZScgPT4gJyddXCI7XG4gICAgXG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4gXCJbJ2xhYmVsJyA9PiAnJywgJ3VybCcgPT4gJycsICdvcGVuc0luTmV3VGFiJyA9PiBmYWxzZV1cIjtcbiAgICBcbiAgICBjYXNlICdidXR0b24nOlxuICAgICAgcmV0dXJuIFwiWydsYWJlbCcgPT4gJycsICdocmVmJyA9PiAnIycsICd0YXJnZXQnID0+ICcnLCAncmVsJyA9PiAnJywgJ2Rpc2FibGVkJyA9PiBmYWxzZV1cIjtcbiAgICBcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAocHJvcGVydHkuZGVmYXVsdCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ1tdJztcbiAgICBcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICBpZiAocHJvcGVydHkuZGVmYXVsdCB8fCBwcm9wZXJ0eS5pdGVtcz8uZGVmYXVsdCkge1xuICAgICAgICByZXR1cm4gYXJyYXlUb1BocChwcm9wZXJ0eS5kZWZhdWx0IHx8IHByb3BlcnR5Lml0ZW1zPy5kZWZhdWx0IHx8IFtdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnW10nO1xuICAgIFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCInJ1wiO1xuICB9XG59O1xuXG5jb25zdCB0b1BocFNpbmdsZVF1b3RlZFN0cmluZyA9ICh2YWx1ZTogc3RyaW5nKTogc3RyaW5nID0+XG4gIGAnJHt2YWx1ZS5yZXBsYWNlKC9cXFxcL2csIFwiXFxcXFxcXFxcIikucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuXG5jb25zdCBoYW5kbGViYXJzVmFsdWVUb1BocEV4cHJlc3Npb24gPSAodGVtcGxhdGVWYWx1ZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgdG9rZW5SZWdleCA9IC9cXHtcXHtcXHs/XFxzKihbXn1dKz8pXFxzKlxcfVxcfVxcfT8vZztcbiAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gIGxldCBjdXJzb3IgPSAwO1xuICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgY29uc3QgcHVzaExpdGVyYWwgPSAobGl0ZXJhbDogc3RyaW5nKSA9PiB7XG4gICAgaWYgKGxpdGVyYWwpIHtcbiAgICAgIHBhcnRzLnB1c2godG9QaHBTaW5nbGVRdW90ZWRTdHJpbmcobGl0ZXJhbCkpO1xuICAgIH1cbiAgfTtcblxuICB3aGlsZSAoKG1hdGNoID0gdG9rZW5SZWdleC5leGVjKHRlbXBsYXRlVmFsdWUpKSAhPT0gbnVsbCkge1xuICAgIHB1c2hMaXRlcmFsKHRlbXBsYXRlVmFsdWUuc2xpY2UoY3Vyc29yLCBtYXRjaC5pbmRleCkpO1xuXG4gICAgY29uc3QgZXhwcmVzc2lvbiA9IG1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgaWYgKGV4cHJlc3Npb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGF0aCA9IGV4cHJlc3Npb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhdGhbMF0pO1xuICAgICAgaWYgKHBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYCgkJHtjYW1lbFByb3B9ID8/ICcnKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGF0aFxuICAgICAgICAgIC5zbGljZSgxKVxuICAgICAgICAgIC5tYXAoKHNlZ21lbnQpID0+IGBbJyR7c2VnbWVudH0nXWApXG4gICAgICAgICAgLmpvaW4oJycpO1xuICAgICAgICBwYXJ0cy5wdXNoKGAoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSA/PyAnJylgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcGFydHMucHVzaChgJydgKTtcbiAgICB9XG5cbiAgICBjdXJzb3IgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgfVxuXG4gIHB1c2hMaXRlcmFsKHRlbXBsYXRlVmFsdWUuc2xpY2UoY3Vyc29yKSk7XG5cbiAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDAgPyBwYXJ0cy5qb2luKCcgLiAnKSA6IFwiJydcIjtcbn07XG5cbnR5cGUgV2lzdGlhQXNzZXQgPSB7XG4gIGVtcHR5Q2hlY2tFeHByZXNzaW9uOiBzdHJpbmc7XG4gIHVybEV4cHJlc3Npb246IHN0cmluZztcbn07XG5cbmNvbnN0IGJ1aWxkV2lzdGlhQXNzZXQgPSAobWVkaWFTb3VyY2U6IHN0cmluZyk6IFdpc3RpYUFzc2V0ID0+IHtcbiAgY29uc3Qgd2lzdGlhUHJlZml4ID0gJ2h0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy8nO1xuICBjb25zdCB3aXN0aWFTdWZmaXggPSAnLmpzb25wJztcblxuICBpZiAobWVkaWFTb3VyY2Uuc3RhcnRzV2l0aCh3aXN0aWFQcmVmaXgpICYmIG1lZGlhU291cmNlLmVuZHNXaXRoKHdpc3RpYVN1ZmZpeCkpIHtcbiAgICBjb25zdCBtZWRpYUlkVGVtcGxhdGUgPSBtZWRpYVNvdXJjZS5zbGljZSh3aXN0aWFQcmVmaXgubGVuZ3RoLCAtd2lzdGlhU3VmZml4Lmxlbmd0aCk7XG4gICAgY29uc3QgbWVkaWFJZEV4cHJlc3Npb24gPSBoYW5kbGViYXJzVmFsdWVUb1BocEV4cHJlc3Npb24obWVkaWFJZFRlbXBsYXRlKTtcblxuICAgIHJldHVybiB7XG4gICAgICBlbXB0eUNoZWNrRXhwcmVzc2lvbjogbWVkaWFJZEV4cHJlc3Npb24sXG4gICAgICB1cmxFeHByZXNzaW9uOiBgJyR7d2lzdGlhUHJlZml4fScgLiAke21lZGlhSWRFeHByZXNzaW9ufSAuICcke3dpc3RpYVN1ZmZpeH0nYCxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgdXJsRXhwcmVzc2lvbiA9IGhhbmRsZWJhcnNWYWx1ZVRvUGhwRXhwcmVzc2lvbihtZWRpYVNvdXJjZSk7XG4gIHJldHVybiB7XG4gICAgZW1wdHlDaGVja0V4cHJlc3Npb246IHVybEV4cHJlc3Npb24sXG4gICAgdXJsRXhwcmVzc2lvbixcbiAgfTtcbn07XG5cbmNvbnN0IGdlbmVyYXRlV2lzdGlhRW5xdWV1ZUNvZGUgPSAodGVtcGxhdGU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGFzc2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBXaXN0aWFBc3NldD4oKTtcbiAgbGV0IGhhc1dpc3RpYUVtYmVkID0gZmFsc2U7XG5cbiAgY29uc3QgYWRkQXNzZXQgPSAoYXNzZXQ6IFdpc3RpYUFzc2V0KSA9PiB7XG4gICAgY29uc3Qga2V5ID0gYCR7YXNzZXQuZW1wdHlDaGVja0V4cHJlc3Npb259Ojoke2Fzc2V0LnVybEV4cHJlc3Npb259YDtcbiAgICBpZiAoIWFzc2V0cy5oYXMoa2V5KSkge1xuICAgICAgYXNzZXRzLnNldChrZXksIGFzc2V0KTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFtePl0rc3JjPVtcIiddKFteXCInXSspW1wiJ11bXj5dKj5cXHMqPFxcL3NjcmlwdD4vZ2k7XG4gIGxldCBzY3JpcHRNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICB3aGlsZSAoKHNjcmlwdE1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyh0ZW1wbGF0ZSkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3JjID0gc2NyaXB0TWF0Y2hbMV0udHJpbSgpO1xuXG4gICAgaWYgKC9mYXN0XFwud2lzdGlhXFwuY29tXFwvYXNzZXRzXFwvZXh0ZXJuYWxcXC9FLXYxXFwuanMvaS50ZXN0KHNyYykpIHtcbiAgICAgIGhhc1dpc3RpYUVtYmVkID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICgvZmFzdFxcLndpc3RpYVxcLmNvbVxcL2VtYmVkXFwvbWVkaWFzXFwvL2kudGVzdChzcmMpKSB7XG4gICAgICBoYXNXaXN0aWFFbWJlZCA9IHRydWU7XG4gICAgICBhZGRBc3NldChidWlsZFdpc3RpYUFzc2V0KHNyYykpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFzeW5jQ2xhc3NSZWdleCA9IC93aXN0aWFfYXN5bmNfKFteXFxzXCInPD5dKykvZztcbiAgbGV0IGFzeW5jQ2xhc3NNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICB3aGlsZSAoKGFzeW5jQ2xhc3NNYXRjaCA9IGFzeW5jQ2xhc3NSZWdleC5leGVjKHRlbXBsYXRlKSkgIT09IG51bGwpIHtcbiAgICBoYXNXaXN0aWFFbWJlZCA9IHRydWU7XG5cbiAgICBjb25zdCBtZWRpYUlkRXhwcmVzc2lvbiA9IGhhbmRsZWJhcnNWYWx1ZVRvUGhwRXhwcmVzc2lvbihhc3luY0NsYXNzTWF0Y2hbMV0pO1xuICAgIGFkZEFzc2V0KHtcbiAgICAgIGVtcHR5Q2hlY2tFeHByZXNzaW9uOiBtZWRpYUlkRXhwcmVzc2lvbixcbiAgICAgIHVybEV4cHJlc3Npb246IGAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzLycgLiAke21lZGlhSWRFeHByZXNzaW9ufSAuICcuanNvbnAnYCxcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghaGFzV2lzdGlhRW1iZWQpIHtcbiAgICByZXR1cm4gJyc7XG4gIH1cblxuICBjb25zdCBsaW5lcyA9IFtcbiAgICBcIi8vIFdpc3RpYSBlbWJlZCBhc3NldHNcIixcbiAgICBcIndwX2VucXVldWVfc2NyaXB0KCd3aXN0aWEtZXYxJywgJ2h0dHBzOi8vZmFzdC53aXN0aWEuY29tL2Fzc2V0cy9leHRlcm5hbC9FLXYxLmpzJywgW10sIG51bGwsIFsnc3RyYXRlZ3knID0+ICdhc3luYyddKTtcIixcbiAgXTtcblxuICBBcnJheS5mcm9tKGFzc2V0cy52YWx1ZXMoKSkuZm9yRWFjaCgoYXNzZXQsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgbWVkaWFWYXIgPSBgJGhhbmRvZmZXaXN0aWFNZWRpYSR7aW5kZXh9YDtcbiAgICBsaW5lcy5wdXNoKGAke21lZGlhVmFyfSA9ICR7YXNzZXQudXJsRXhwcmVzc2lvbn07YCk7XG4gICAgbGluZXMucHVzaChgaWYgKCFlbXB0eSgke2Fzc2V0LmVtcHR5Q2hlY2tFeHByZXNzaW9ufSkpIHtgKTtcbiAgICBsaW5lcy5wdXNoKFxuICAgICAgYCAgd3BfZW5xdWV1ZV9zY3JpcHQoc2FuaXRpemVfa2V5KCdoYW5kb2ZmLXdpc3RpYS1tZWRpYS0nIC4gbWQ1KChzdHJpbmcpICR7bWVkaWFWYXJ9KSksICR7bWVkaWFWYXJ9LCBbXSwgbnVsbCwgWydzdHJhdGVneScgPT4gJ2FzeW5jJ10pO2BcbiAgICApO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGAke2xpbmVzLmpvaW4oJ1xcbicpfVxcbmA7XG59O1xuXG5jb25zdCBzdHJpcFdpc3RpYVNjcmlwdFRhZ3MgPSAodGVtcGxhdGU6IHN0cmluZyk6IHN0cmluZyA9PlxuICB0ZW1wbGF0ZVxuICAgIC5yZXBsYWNlKC9cXHMqPHNjcmlwdFtePl0rc3JjPVtcIiddW15cIiddKmZhc3RcXC53aXN0aWFcXC5jb21cXC9lbWJlZFxcL21lZGlhc1xcL1teXCInXStbXCInXVtePl0qPlxccyo8XFwvc2NyaXB0PlxccyovZ2ksICdcXG4nKVxuICAgIC5yZXBsYWNlKC9cXHMqPHNjcmlwdFtePl0rc3JjPVtcIiddaHR0cHM6XFwvXFwvZmFzdFxcLndpc3RpYVxcLmNvbVxcL2Fzc2V0c1xcL2V4dGVybmFsXFwvRS12MVxcLmpzW1wiJ11bXj5dKj5cXHMqPFxcL3NjcmlwdD5cXHMqL2dpLCAnXFxuJyk7XG5cbi8qKlxuICogQ29udmVydCBoYW5kbGViYXJzIHRlbXBsYXRlIHRvIFBIUFxuICovXG5jb25zdCBoYW5kbGViYXJzVG9QaHAgPSAodGVtcGxhdGU6IHN0cmluZywgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcmljaHRleHRQcm9wczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCkpOiBzdHJpbmcgPT4ge1xuICBsZXQgcGhwID0gdGVtcGxhdGU7XG4gIFxuICAvLyBSZW1vdmUgSFRNTCB3cmFwcGVyIGlmIHByZXNlbnRcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxodG1sW1xcc1xcU10qPzxib2R5W14+XSo+L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC88XFwvYm9keT5bXFxzXFxTXSo/PFxcL2h0bWw+L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC88aGVhZD5bXFxzXFxTXSo/PFxcL2hlYWQ+L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXHs/c3R5bGVcXH1cXH1cXH0/L2csICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcez9zY3JpcHRcXH1cXH1cXH0/L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSBIVE1MIGNvbW1lbnRzXG4gIHBocCA9IHBocC5yZXBsYWNlKC88IS0tW1xcc1xcU10qPy0tPi9nLCAnJyk7XG4gIFxuICAvLyBSZW1vdmUge3shLS0gY29tbWVudHMgLS19fVxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7IS0tW1xcc1xcU10qPy0tXFx9XFx9L2csICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xceyFbXFxzXFxTXSo/XFx9XFx9L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSBIYW5kb2ZmLXNwZWNpZmljIHt7I2ZpZWxkfX0gYmxvY2tzIGJ1dCBrZWVwIHRoZWlyIGNvbnRlbnRcbiAgLy8gVXNlIGEgZ2xvYmFsIHJlZ2V4IHRoYXQgaGFuZGxlcyB2YXJpb3VzIHF1b3RlIHN0eWxlcyBhbmQgd2hpdGVzcGFjZVxuICAvLyBSZW1vdmUgSGFuZG9mZi1zcGVjaWZpYyB7eyNmaWVsZH19IGJsb2NrcyBidXQga2VlcCB0aGVpciBjb250ZW50XG4gIC8vIEFsbG93IGZvciB3aGl0ZXNwYWNlIHZhcmlhdGlvbnMgbGlrZSB7eyNmaWVsZCAuLi59fSwge3sgI2ZpZWxkIC4uLn19LCB7ey9maWVsZH19LCB7ey9maWVsZCB9fSwge3sgL2ZpZWxkIH19XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXHMqI2ZpZWxkXFxzK1teXFx9XStcXH1cXH0vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xccypcXC9maWVsZFxccypcXH1cXH0vZ2ksICcnKTtcbiAgXG4gIC8vIE5vcm1hbGl6ZSBAcm9vdC4gcmVmZXJlbmNlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9ucyB0byByb290LWxldmVsIGFjY2Vzcy5cbiAgLy8gSW4gc3RhbmRhcmQgSGFuZGxlYmFycywgQHJvb3QgcmVmZXJzIHRvIHRoZSB0b3AtbGV2ZWwgZGF0YSBjb250ZXh0IHJlZ2FyZGxlc3Mgb2ZcbiAgLy8gbmVzdGluZyBkZXB0aCwgc28gQHJvb3QucHJvcGVydGllcy54eHggaXMgZXF1aXZhbGVudCB0byBwcm9wZXJ0aWVzLnh4eCBhdCB0aGUgcm9vdC5cbiAgLy8gV2Ugb25seSByZXBsYWNlIGluc2lkZSB7ey4uLn19IHRvIGF2b2lkIHRvdWNoaW5nIHVucmVsYXRlZCB0ZXh0IGNvbnRlbnQuXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtbXFxzXFxTXSo/XFx9XFx9L2csIChtYXRjaCkgPT4gbWF0Y2gucmVwbGFjZSgvQHJvb3RcXC4vZywgJycpKTtcbiAgXG4gIC8vIFZFUlkgRUFSTFk6IENvbnZlcnQge3sjaWYgKGVxL25lIHh4eCBcInZhbHVlXCIpfX0uLi57e2Vsc2V9fS4uLnt7L2lmfX0gaGVscGVyIGV4cHJlc3Npb25zXG4gIC8vIFRoaXMgTVVTVCBydW4gYmVmb3JlIGFueSBvdGhlciBwcm9jZXNzaW5nIHRvIGVuc3VyZSB0aGUgY29tcGxldGUgYmxvY2sgaXMgY2FwdHVyZWRcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgdmFyaWFibGUgcGF0aCB0byBQSFAgZm9yIGVhcmx5IGhlbHBlciBwcm9jZXNzaW5nXG4gIGNvbnN0IHZhclRvUGhwVmVyeUVhcmx5ID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1bJyR7cGFydHMuc2xpY2UoMSkuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICB9IGVsc2UgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGb3IgbG9vcCBhbGlhc2VzIGF0IHRoaXMgZWFybHkgc3RhZ2UsIHdlIGhhdmVuJ3QgdHJhY2tlZCB0aGVtIHlldFxuICAgICAgLy8gU28gd2UganVzdCB1c2UgJGl0ZW0gZm9yIGFueSBhbGlhcy5maWVsZCBwYXR0ZXJuXG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIFBhcnNlIGhlbHBlciBleHByZXNzaW9uIHRvIFBIUCBjb25kaXRpb24gKHZlcnkgZWFybHkpXG4gIGNvbnN0IHBhcnNlSGVscGVyVmVyeUVhcmx5ID0gKGV4cHI6IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIC8vIE1hdGNoIChlcSBsZWZ0IFwicmlnaHRcIikgLSBlcXVhbHMgd2l0aCBxdW90ZWQgc3RyaW5nXG4gICAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKGVxTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwVmVyeUVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBWZXJ5RWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lIC4uLil9fSAuLi4ge3tlbHNlIGlmIChlcSAuLi4pfX0gLi4uIHt7ZWxzZX19IC4uLiB7ey9pZn19IFZFUlkgRUFSTFlcbiAgLy8gU3VwcG9ydHMgZnVsbCBpZiAvIGVsc2UgaWYgLyBlbHNlIGlmIC8gZWxzZSAvIGVuZGlmIGNoYWlucyAoc3RyaW5nIHN3aXRjaCBwYXR0ZXJuKVxuICB0eXBlIEhlbHBlcklmQnJhbmNoID0geyBjb25kaXRpb246IHN0cmluZyB8IG51bGw7IGNvbnRlbnQ6IHN0cmluZyB9O1xuICBjb25zdCBmaW5kSGVscGVySWZCcmFuY2hlcyA9IChcbiAgICBzdHI6IHN0cmluZyxcbiAgICBzdGFydFBvczogbnVtYmVyLFxuICAgIGZpcnN0Q29uZGl0aW9uOiBzdHJpbmdcbiAgKTogeyBicmFuY2hlczogSGVscGVySWZCcmFuY2hbXTsgY2xvc2VQb3M6IG51bWJlciB9IHwgbnVsbCA9PiB7XG4gICAgY29uc3QgYnJhbmNoZXM6IEhlbHBlcklmQnJhbmNoW10gPSBbeyBjb25kaXRpb246IGZpcnN0Q29uZGl0aW9uLCBjb250ZW50OiAnJyB9XTtcbiAgICBsZXQgZGVwdGggPSAxO1xuICAgIGxldCBwb3MgPSBzdGFydFBvcztcbiAgICBsZXQgY29udGVudFN0YXJ0ID0gc3RhcnRQb3M7XG4gICAgY29uc3QgZWxzZUlmUmVnZXggPSAvXFx7XFx7ZWxzZSBpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuXG4gICAgd2hpbGUgKHBvcyA8IHN0ci5sZW5ndGggJiYgZGVwdGggPiAwKSB7XG4gICAgICBjb25zdCBuZXh0SWYgPSBzdHIuaW5kZXhPZigne3sjaWYnLCBwb3MpO1xuICAgICAgY29uc3QgbmV4dEVuZGlmID0gc3RyLmluZGV4T2YoJ3t7L2lmfX0nLCBwb3MpO1xuICAgICAgY29uc3QgbmV4dEVsc2UgPSBzdHIuaW5kZXhPZigne3tlbHNlfX0nLCBwb3MpO1xuICAgICAgZWxzZUlmUmVnZXgubGFzdEluZGV4ID0gcG9zO1xuICAgICAgY29uc3QgZWxzZUlmTWF0Y2ggPSBlbHNlSWZSZWdleC5leGVjKHN0cik7XG4gICAgICBjb25zdCBuZXh0RWxzZUlmID0gZWxzZUlmTWF0Y2ggPyBlbHNlSWZNYXRjaC5pbmRleCA6IC0xO1xuXG4gICAgICBjb25zdCBjYW5kaWRhdGVzOiB7IHR5cGU6IHN0cmluZzsgcG9zOiBudW1iZXI7IGV4cHI/OiBzdHJpbmc7IHRhZ0xlbj86IG51bWJlciB9W10gPSBbXG4gICAgICAgIHsgdHlwZTogJ2lmJywgcG9zOiBuZXh0SWYgfSxcbiAgICAgICAgeyB0eXBlOiAnZW5kaWYnLCBwb3M6IG5leHRFbmRpZiB9LFxuICAgICAgICB7IHR5cGU6ICdlbHNlJywgcG9zOiBuZXh0RWxzZSB9LFxuICAgICAgICAuLi4obmV4dEVsc2VJZiAhPT0gLTEgPyBbeyB0eXBlOiAnZWxzZWlmJywgcG9zOiBuZXh0RWxzZUlmLCBleHByOiBlbHNlSWZNYXRjaCFbMV0sIHRhZ0xlbjogZWxzZUlmTWF0Y2ghWzBdLmxlbmd0aCB9XSA6IFtdKVxuICAgICAgXS5maWx0ZXIoYyA9PiBjLnBvcyAhPT0gLTEpLnNvcnQoKGEsIGIpID0+IGEucG9zIC0gYi5wb3MpO1xuXG4gICAgICBpZiAoY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIGJyZWFrO1xuXG4gICAgICBjb25zdCBjbG9zZXN0ID0gY2FuZGlkYXRlc1swXTtcblxuICAgICAgaWYgKGNsb3Nlc3QudHlwZSA9PT0gJ2lmJykge1xuICAgICAgICBkZXB0aCsrO1xuICAgICAgICBwb3MgPSBjbG9zZXN0LnBvcyArIDU7XG4gICAgICB9IGVsc2UgaWYgKGNsb3Nlc3QudHlwZSA9PT0gJ2VuZGlmJykge1xuICAgICAgICBkZXB0aC0tO1xuICAgICAgICBpZiAoZGVwdGggPT09IDApIHtcbiAgICAgICAgICBicmFuY2hlc1ticmFuY2hlcy5sZW5ndGggLSAxXS5jb250ZW50ID0gc3RyLnN1YnN0cmluZyhjb250ZW50U3RhcnQsIGNsb3Nlc3QucG9zKTtcbiAgICAgICAgICByZXR1cm4geyBicmFuY2hlcywgY2xvc2VQb3M6IGNsb3Nlc3QucG9zIH07XG4gICAgICAgIH1cbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyA3OyAvLyAne3svaWZ9fScubGVuZ3RoID09PSA3XG4gICAgICB9IGVsc2UgaWYgKChjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnIHx8IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2UnKSAmJiBkZXB0aCA9PT0gMSkge1xuICAgICAgICBjb25zdCB0YWdMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgYnJhbmNoZXNbYnJhbmNoZXMubGVuZ3RoIC0gMV0uY29udGVudCA9IHN0ci5zdWJzdHJpbmcoY29udGVudFN0YXJ0LCBjbG9zZXN0LnBvcyk7XG4gICAgICAgIGJyYW5jaGVzLnB1c2goe1xuICAgICAgICAgIGNvbmRpdGlvbjogY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyA/IGNsb3Nlc3QuZXhwciEgOiBudWxsLFxuICAgICAgICAgIGNvbnRlbnQ6ICcnXG4gICAgICAgIH0pO1xuICAgICAgICBjb250ZW50U3RhcnQgPSBjbG9zZXN0LnBvcyArIHRhZ0xlbjtcbiAgICAgICAgcG9zID0gY29udGVudFN0YXJ0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU2tpcCBmdWxsIHRhZyB3aGVuIGluc2lkZSBuZXN0ZWQgI2lmIChlLmcuIHNraXAge3tlbHNlIGlmIChleHByKX19IHNvIHdlIGZpbmQgdGhlIG91dGVyIHt7L2lmfX0pXG4gICAgICAgIGNvbnN0IHNraXBMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyBza2lwTGVuO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICBjb25zdCBoZWxwZXJJZlJlZ2V4ID0gL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuICBsZXQgaGVscGVyTWF0Y2g7XG4gIHdoaWxlICgoaGVscGVyTWF0Y2ggPSBoZWxwZXJJZlJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBvcGVuUG9zID0gaGVscGVyTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IG9wZW5Qb3MgKyBoZWxwZXJNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgZmlyc3RDb25kaXRpb24gPSBoZWxwZXJNYXRjaFsxXTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGZpbmRIZWxwZXJJZkJyYW5jaGVzKHBocCwgb3BlblRhZ0VuZCwgZmlyc3RDb25kaXRpb24pO1xuICAgIGlmIChyZXN1bHQgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHsgYnJhbmNoZXMsIGNsb3NlUG9zIH0gPSByZXN1bHQ7XG5cbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJyYW5jaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBicmFuY2ggPSBicmFuY2hlc1tpXTtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IGJyYW5jaC5jb25kaXRpb24gPyBwYXJzZUhlbHBlclZlcnlFYXJseShicmFuY2guY29uZGl0aW9uKSA6IG51bGw7XG4gICAgICBjb25zdCBjb25kID0gcGhwQ29uZGl0aW9uID8/ICdmYWxzZSc7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICBwYXJ0cy5wdXNoKGA8P3BocCBpZiAoJHtjb25kfSkgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9IGVsc2UgaWYgKGJyYW5jaC5jb25kaXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgcGFydHMucHVzaChgPD9waHAgZWxzZWlmICgke2NvbmR9KSA6ID8+JHticmFuY2guY29udGVudH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhcnRzLnB1c2goYDw/cGhwIGVsc2UgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIHBhcnRzLnB1c2goJzw/cGhwIGVuZGlmOyA/PicpO1xuICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcGFydHMuam9pbignJyk7XG5cbiAgICBwaHAgPSBwaHAuc3Vic3RyaW5nKDAsIG9wZW5Qb3MpICsgcmVwbGFjZW1lbnQgKyBwaHAuc3Vic3RyaW5nKGNsb3NlUG9zICsgNyk7IC8vICd7ey9pZn19Jy5sZW5ndGggPT09IDdcbiAgICAvLyBOZXh0IGV4ZWMgZnJvbSBzdGFydCBvZiByZXBsYWNlbWVudCBzbyB3ZSBjYXRjaCBuZXN0ZWQge3sjaWZ9fS4uLnt7ZWxzZSBpZn19Li4ue3svaWZ9fSBpbnNpZGUgaXRcbiAgICBoZWxwZXJJZlJlZ2V4Lmxhc3RJbmRleCA9IG9wZW5Qb3M7XG4gIH1cblxuICAvLyBWRVJZIEVBUkxZOiBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IHdpdGggZWxzZSBhbmQgd2l0aG91dCBlbHNlXG4gIC8vICN1bmxlc3MgaXMgdGhlIG5lZ2F0aW9uIG9mICNpZiwgc28gd2UgaW52ZXJ0IHRoZSBjb25kaXRpb24uXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJWZXJ5RWFybHkoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCEoJHtwaHBDb25kaXRpb259KSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVmVyeUVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHN0eWxlIHdpdGggaGFuZGxlYmFycyBleHByZXNzaW9uc1xuICAvLyBLZWVwICdzcmMnIGFzLWlzIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL3N0eWxlPVwiYmFja2dyb3VuZC1pbWFnZTp1cmxcXCgnP1xce1xceytcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH0rXFx9Jz9cXClcIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gIWVtcHR5KCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10pID8gJ3N0eWxlPVwiYmFja2dyb3VuZC1pbWFnZTp1cmwoXFxcXCcnIC4gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddKSAuICdcXFxcJylcIicgOiAnJzsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIFRyYWNrIGxvb3AgYWxpYXNlcyBmb3IgbGF0ZXIgcmVmZXJlbmNlIGNvbnZlcnNpb25cbiAgLy8gRm9ybWF0OiB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhc05hbWV8fX1cbiAgY29uc3QgbG9vcEFsaWFzZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIC8vIFRyYWNrIG5lc3RlZCBsb29wIGFsaWFzZXMgc2VwYXJhdGVseSAodGhlc2UgdXNlICRzdWJJdGVtIGluc3RlYWQgb2YgJGl0ZW0pXG4gIGNvbnN0IG5lc3RlZExvb3BBbGlhc2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICAvLyBUcmFjayBuZXN0ZWQgbG9vcCBkZXB0aCBmb3IgcHJvcGVyIHZhcmlhYmxlIG5hbWluZ1xuICBsZXQgbmVzdGVkTG9vcERlcHRoID0gMDtcbiAgXG4gIC8vIEhlbHBlciB0byBnZXQgdGhlIGxvb3AgaXRlbSB2YXJpYWJsZSBuYW1lIGJhc2VkIG9uIGRlcHRoXG4gIGNvbnN0IGdldExvb3BJdGVtVmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckaXRlbSc7XG4gICAgaWYgKGRlcHRoID09PSAxKSByZXR1cm4gJyRzdWJJdGVtJztcbiAgICByZXR1cm4gYCRuZXN0ZWQke2RlcHRofUl0ZW1gO1xuICB9O1xuICBcbiAgY29uc3QgZ2V0TG9vcEluZGV4VmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckaW5kZXgnO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckc3ViSW5kZXgnO1xuICAgIHJldHVybiBgJG5lc3RlZCR7ZGVwdGh9SW5kZXhgO1xuICB9O1xuICBcbiAgY29uc3QgZ2V0TG9vcENvdW50VmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckX2xvb3BfY291bnQnO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckX25lc3RlZF9sb29wX2NvdW50JztcbiAgICByZXR1cm4gYCRfbmVzdGVkJHtkZXB0aH1fbG9vcF9jb3VudGA7XG4gIH07XG4gIFxuICAvLyBGaXJzdCBwYXNzOiBpZGVudGlmeSBhbGwgbmVzdGVkIGxvb3AgcGF0dGVybnMgYW5kIHRoZWlyIGFsaWFzZXNcbiAgLy8gV2UgbmVlZCB0byBwcm9jZXNzIGxvb3BzIGluIG9yZGVyIHRvIHByb3Blcmx5IHRyYWNrIG5lc3RpbmdcbiAgY29uc3QgZWFjaFBhdHRlcm5zOiBBcnJheTx7XG4gICAgbWF0Y2g6IHN0cmluZztcbiAgICB0eXBlOiAncHJvcGVydGllcycgfCAndGhpcycgfCAnYWxpYXMnO1xuICAgIGFycmF5UGF0aDogc3RyaW5nO1xuICAgIGFsaWFzPzogc3RyaW5nO1xuICAgIHBhcmVudEFsaWFzPzogc3RyaW5nO1xuICAgIGluZGV4OiBudW1iZXI7XG4gIH0+ID0gW107XG4gIFxuICAvLyBGaW5kIGFsbCB7eyNlYWNoIC4uLn19IHBhdHRlcm5zXG4gIGNvbnN0IGVhY2hSZWdleCA9IC9cXHtcXHsjZWFjaFxccysoW15cXH1dKylcXH1cXH0vZztcbiAgbGV0IGVhY2hNYXRjaDtcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBlYWNoTWF0Y2hbMV0udHJpbSgpO1xuICAgIGxldCB0eXBlOiAncHJvcGVydGllcycgfCAndGhpcycgfCAnYWxpYXMnO1xuICAgIGxldCBhcnJheVBhdGg6IHN0cmluZztcbiAgICBsZXQgYWxpYXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgcGFyZW50QWxpYXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgXCJhcyB8YWxpYXN8XCIgc3ludGF4XG4gICAgY29uc3QgYXNBbGlhc01hdGNoID0gY29udGVudC5tYXRjaCgvXiguKz8pXFxzK2FzXFxzK1xcfChcXHcrKVxcfCQvKTtcbiAgICBpZiAoYXNBbGlhc01hdGNoKSB7XG4gICAgICBjb25zdCBwYXRoUGFydCA9IGFzQWxpYXNNYXRjaFsxXS50cmltKCk7XG4gICAgICBhbGlhcyA9IGFzQWxpYXNNYXRjaFsyXTtcbiAgICAgIFxuICAgICAgaWYgKHBhdGhQYXJ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICdwcm9wZXJ0aWVzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJyk7XG4gICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICd0aGlzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQucmVwbGFjZSgndGhpcy4nLCAnJyk7XG4gICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgLy8gZS5nLiwgYXJ0aWNsZS50YWdzIC0gZmlyc3QgcGFydCBpcyBhbiBhbGlhcyBmcm9tIG91dGVyIGxvb3BcbiAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoUGFydC5zcGxpdCgnLicpO1xuICAgICAgICBwYXJlbnRBbGlhcyA9IHBhcnRzWzBdO1xuICAgICAgICBhcnJheVBhdGggPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJyk7XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSnVzdCBhIHZhcmlhYmxlIG5hbWUsIHRyZWF0IGFzIGFsaWFzIHJlZmVyZW5jZVxuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE5vIGFsaWFzIHN5bnRheFxuICAgICAgaWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICB0eXBlID0gJ3Byb3BlcnRpZXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIHR5cGUgPSAndGhpcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IGNvbnRlbnQucmVwbGFjZSgndGhpcy4nLCAnJykuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgfSBlbHNlIGlmIChjb250ZW50LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBjb250ZW50LnNwbGl0KCcuJyk7XG4gICAgICAgIHBhcmVudEFsaWFzID0gcGFydHNbMF07XG4gICAgICAgIGFycmF5UGF0aCA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKS5zcGxpdCgvXFxzLylbMF07XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwZSA9ICdhbGlhcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IGNvbnRlbnQuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBlYWNoUGF0dGVybnMucHVzaCh7XG4gICAgICBtYXRjaDogZWFjaE1hdGNoWzBdLFxuICAgICAgdHlwZSxcbiAgICAgIGFycmF5UGF0aCxcbiAgICAgIGFsaWFzLFxuICAgICAgcGFyZW50QWxpYXMsXG4gICAgICBpbmRleDogZWFjaE1hdGNoLmluZGV4XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRyYWNrIHdoaWNoIGFsaWFzZXMgbWFwIHRvIHdoaWNoIG5lc3RlZCBkZXB0aFxuICBjb25zdCBhbGlhc1RvRGVwdGg6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgXG4gIC8vIFByb2Nlc3MgbG9vcHMgZnJvbSBmaXJzdCB0byBsYXN0IChtYWludGFpbmluZyBvcmRlcilcbiAgLy8gU29ydCBieSBpbmRleCB0byBwcm9jZXNzIGluIG9yZGVyXG4gIGVhY2hQYXR0ZXJucy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG4gIFxuICAvLyBUcmFjayBjdXJyZW50IG5lc3RpbmcgbGV2ZWwgYXMgd2UgcHJvY2Vzc1xuICBsZXQgY3VycmVudERlcHRoID0gLTE7XG4gIGNvbnN0IG9wZW5Mb29wczogQXJyYXk8eyBkZXB0aDogbnVtYmVyOyBhbGlhcz86IHN0cmluZyB9PiA9IFtdO1xuICBcbiAgLy8gRmluZCB7ey9lYWNofX0gcG9zaXRpb25zXG4gIGNvbnN0IGNsb3NlRWFjaFBvc2l0aW9uczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgY2xvc2VFYWNoUmVnZXggPSAvXFx7XFx7XFwvZWFjaFxcfVxcfS9nO1xuICBsZXQgY2xvc2VNYXRjaDtcbiAgd2hpbGUgKChjbG9zZU1hdGNoID0gY2xvc2VFYWNoUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNsb3NlRWFjaFBvc2l0aW9ucy5wdXNoKGNsb3NlTWF0Y2guaW5kZXgpO1xuICB9XG4gIFxuICAvLyBBc3NpZ24gZGVwdGggdG8gZWFjaCBwYXR0ZXJuIGJhc2VkIG9uIHBvc2l0aW9uIHJlbGF0aXZlIHRvIG90aGVyIHBhdHRlcm5zIGFuZCBjbG9zZXNcbiAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIGVhY2hQYXR0ZXJucykge1xuICAgIC8vIENvdW50IGhvdyBtYW55IG9wZW5zIGJlZm9yZSB0aGlzIHBvc2l0aW9uXG4gICAgY29uc3Qgb3BlbnNCZWZvcmUgPSBlYWNoUGF0dGVybnMuZmlsdGVyKHAgPT4gcC5pbmRleCA8IHBhdHRlcm4uaW5kZXgpLmxlbmd0aDtcbiAgICAvLyBDb3VudCBob3cgbWFueSBjbG9zZXMgYmVmb3JlIHRoaXMgcG9zaXRpb25cbiAgICBjb25zdCBjbG9zZXNCZWZvcmUgPSBjbG9zZUVhY2hQb3NpdGlvbnMuZmlsdGVyKHBvcyA9PiBwb3MgPCBwYXR0ZXJuLmluZGV4KS5sZW5ndGg7XG4gICAgY29uc3QgZGVwdGggPSBvcGVuc0JlZm9yZSAtIGNsb3Nlc0JlZm9yZTtcbiAgICBcbiAgICBpZiAocGF0dGVybi5hbGlhcykge1xuICAgICAgYWxpYXNUb0RlcHRoW3BhdHRlcm4uYWxpYXNdID0gZGVwdGg7XG4gICAgICBsb29wQWxpYXNlc1twYXR0ZXJuLmFsaWFzXSA9IHBhdHRlcm4uYXJyYXlQYXRoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSBwcm9wZXJ0eSBwYXRoIGxpa2UgXCJqdW1wTmF2LmxpbmtzXCIgdG8gUEhQIHZhcmlhYmxlIGFjY2VzcyBsaWtlIFwiJGp1bXBOYXZbJ2xpbmtzJ11cIlxuICBjb25zdCBwcm9wUGF0aFRvUGhwID0gKHByb3BQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICBjb25zdCBjYW1lbEZpcnN0ID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHJldHVybiBgJCR7Y2FtZWxGaXJzdH1gO1xuICAgIH1cbiAgICAvLyBGb3IgbmVzdGVkIHBhdGhzIGxpa2UganVtcE5hdi5saW5rcyAtPiAkanVtcE5hdlsnbGlua3MnXVxuICAgIGNvbnN0IG5lc3RlZFBhdGggPSBwYXJ0cy5zbGljZSgxKS5tYXAocCA9PiBgJyR7cH0nYCkuam9pbignXVsnKTtcbiAgICByZXR1cm4gYCQke2NhbWVsRmlyc3R9WyR7bmVzdGVkUGF0aH1dYDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eC55eXkgYXMgfGFsaWFzfH19IG9yIHt7I2VhY2ggcHJvcGVydGllcy54eHggYXMgfGFsaWFzIGluZGV4fH19IGxvb3BzIHdpdGggbmFtZWQgYWxpYXNcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIC8vIFRoZSBzZWNvbmQgcGFyYW1ldGVyIChpbmRleCkgaXMgb3B0aW9uYWwgYW5kIGlnbm9yZWQgc2luY2Ugd2UgdXNlICRpbmRleCBpbiBQSFBcbiAgLy8gQWxzbyBzZXQgJF9sb29wX2NvdW50IGZvciBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccythc1xccytcXHwoXFx3KykoPzpcXHMrXFx3Kyk/XFx8XFxzKlxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCwgYWxpYXMpID0+IHtcbiAgICAgIGNvbnN0IHBocFZhciA9IHByb3BQYXRoVG9QaHAocHJvcFBhdGgpO1xuICAgICAgbG9vcEFsaWFzZXNbYWxpYXNdID0gcHJvcFBhdGg7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJHtwaHBWYXJ9KSAmJiBpc19hcnJheSgke3BocFZhcn0pKSA6ICRfbG9vcF9jb3VudCA9IGNvdW50KCR7cGhwVmFyfSk7IGZvcmVhY2ggKCR7cGhwVmFyfSBhcyAkaW5kZXggPT4gJGl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eH19IG9yIHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5fX0gbG9vcHMgd2l0aG91dCBhbGlhc1xuICAvLyBOb3cgaGFuZGxlcyBuZXN0ZWQgcGF0aHMgbGlrZSBwcm9wZXJ0aWVzLmp1bXBOYXYubGlua3NcbiAgLy8gQWxzbyBzZXQgJF9sb29wX2NvdW50IGZvciBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBocFZhciA9IHByb3BQYXRoVG9QaHAocHJvcFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7cGhwVmFyfSkgJiYgaXNfYXJyYXkoJHtwaHBWYXJ9KSkgOiAkX2xvb3BfY291bnQgPSBjb3VudCgke3BocFZhcn0pOyBmb3JlYWNoICgke3BocFZhcn0gYXMgJGluZGV4ID0+ICRpdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggdGhpcy54eHggYXMgfGFsaWFzfH19IG9yIHt7I2VhY2ggdGhpcy54eHggYXMgfGFsaWFzIGluZGV4fH19IG5lc3RlZCBsb29wcyB3aXRoIGFsaWFzXG4gIC8vIFRoZSBzZWNvbmQgcGFyYW1ldGVyIChpbmRleCkgaXMgb3B0aW9uYWwgYW5kIGlnbm9yZWQgc2luY2Ugd2UgdXNlICRzdWJJbmRleCBpbiBQSFBcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3RoaXNcXC4oXFx3KylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcCwgYWxpYXMpID0+IHtcbiAgICAgIG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA9IHByb3A7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7cHJvcH0nXSkgJiYgaXNfYXJyYXkoJGl0ZW1bJyR7cHJvcH0nXSkpIDogJF9uZXN0ZWRfbG9vcF9jb3VudCA9IGNvdW50KCRpdGVtWycke3Byb3B9J10pOyBmb3JlYWNoICgkaXRlbVsnJHtwcm9wfSddIGFzICRzdWJJbmRleCA9PiAkc3ViSXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIHRoaXMueHh4fX0gbmVzdGVkIGxvb3BzIHdpdGhvdXQgYWxpYXNcbiAgLy8gVXNlICRfbmVzdGVkX2xvb3BfY291bnQgZm9yIG5lc3RlZCBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrdGhpc1xcLihcXHcrKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcCkgPT4ge1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBhbGlhcy54eHggYXMgfG5lc3RlZEFsaWFzfH19IG9yIHt7I2VhY2ggYWxpYXMueHh4IGFzIHxuZXN0ZWRBbGlhcyBpbmRleHx9fSAtIG5lc3RlZCBsb29wcyByZWZlcmVuY2luZyBvdXRlciBsb29wIGFsaWFzXG4gIC8vIGUuZy4sIHt7I2VhY2ggYXJ0aWNsZS50YWdzIGFzIHx0YWd8fX0gd2hlcmUgJ2FydGljbGUnIGlzIGZyb20gb3V0ZXIge3sjZWFjaCBhcnRpY2xlcyBhcyB8YXJ0aWNsZXx9fVxuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkc3ViSW5kZXggaW4gUEhQXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccysoXFx3KylcXC4oXFx3KylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAobWF0Y2gsIHBhcmVudEFsaWFzLCBwcm9wLCBuZXN0ZWRBbGlhcykgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCdzIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAocGFyZW50QWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBwYXJlbnRBbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFRoaXMgaXMgYSBuZXN0ZWQgbG9vcCByZWZlcmVuY2luZyBhbiBvdXRlciBsb29wIGFsaWFzXG4gICAgICBuZXN0ZWRMb29wQWxpYXNlc1tuZXN0ZWRBbGlhc10gPSBwcm9wO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBhbGlhcy54eHh9fSAtIG5lc3RlZCBsb29wcyByZWZlcmVuY2luZyBvdXRlciBsb29wIGFsaWFzIHdpdGhvdXQgbmVzdGVkIGFsaWFzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccysoXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBwYXJlbnRBbGlhcywgcHJvcCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCdzIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAocGFyZW50QWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBwYXJlbnRBbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFRoaXMgaXMgYSBuZXN0ZWQgbG9vcCByZWZlcmVuY2luZyBhbiBvdXRlciBsb29wIGFsaWFzXG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7cHJvcH0nXSkgJiYgaXNfYXJyYXkoJGl0ZW1bJyR7cHJvcH0nXSkpIDogJF9uZXN0ZWRfbG9vcF9jb3VudCA9IGNvdW50KCRpdGVtWycke3Byb3B9J10pOyBmb3JlYWNoICgkaXRlbVsnJHtwcm9wfSddIGFzICRzdWJJbmRleCA9PiAkc3ViSXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL2VhY2hcXH1cXH0vZywgJzw/cGhwIGVuZGZvcmVhY2g7IGVuZGlmOyA/PicpO1xuICBcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgaGVscGVyIGV4cHJlc3Npb24gY29uZGl0aW9uYWxzIEVBUkxZIChiZWZvcmUgYWxpYXMgcGF0dGVybnMgY29udmVydCBwYXJ0cyBvZiB0aGVtKVxuICAvLyBUaGlzIGhhbmRsZXMge3sjaWYgKGVxIGFsaWFzLnh4eCBcInZhbHVlXCIpfX0uLi57e2Vsc2V9fS4uLnt7L2lmfX0gcGF0dGVybnMgaW5zaWRlIGxvb3BzXG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBhIHZhcmlhYmxlIHBhdGggdG8gUEhQIGV4cHJlc3Npb24gZm9yIGhlbHBlciBjb21wYXJpc29uc1xuICAvLyBIYW5kbGVzIHByb3BlcnRpZXMueHh4LCB0aGlzLnh4eCwgYW5kIGFsaWFzLnh4eCBwYXR0ZXJuc1xuICBjb25zdCB2YXJUb1BocEVhcmx5ID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1bJyR7cGFydHMuc2xpY2UoMSkuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICB9IGVsc2UgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBpcyBhIGtub3duIGxvb3AgYWxpYXNcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgaWYgKG5lc3RlZExvb3BBbGlhc2VzW3BhcnRzWzBdXSkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICBpZiAobG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZFBhdGguam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBGYWxsYmFja1xuICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGguc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIFBhcnNlIGhlbHBlciBleHByZXNzaW9uIHRvIFBIUCBjb25kaXRpb25cbiAgY29uc3QgcGFyc2VIZWxwZXJFYXJseSA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCBcInJpZ2h0XCIpIC0gZXF1YWxzIHdpdGggcXVvdGVkIHN0cmluZ1xuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocEVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGlmL2Vsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIChlcS9uZSAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZSBFQVJMWVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZSAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZSBFQVJMWVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgYXR0cmlidXRlLXNwZWNpZmljIHBhdHRlcm5zIEZJUlNUIGJlZm9yZSBnZW5lcmljIG9uZXNcbiAgLy8gSGFuZGxlIHByb3BlcnRpZXMueHh4Lnl5eSBwYXR0ZXJucyBGSVJTVCwgdGhlbiBhbGlhcyBwYXR0ZXJucyBmb3IgbG9vcHNcbiAgXG4gIC8vIENvbnZlcnQgc3JjPVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zICh0b3AtbGV2ZWwgbmVzdGVkIHByb3BlcnRpZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zcmM9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYHNyYz1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBhbHQ9XCJ7e3Byb3BlcnRpZXMueHh4Lnl5eX19XCIgcGF0dGVybnNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2FsdD1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgYWx0PVwiPD9waHAgZWNobyBlc2NfYXR0cigkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gTm93IGhhbmRsZSBhbGlhcyBwYXR0ZXJucyBmb3IgbG9vcHM6IHNyYz1cInt7YWxpYXMueHh4Lnl5eX19XCIsIGFsdD1cInt7YWxpYXMueHh4Lnl5eX19XCIsIGhyZWY9XCJ7e2FsaWFzLnh4eC55eXl9fVwiXG4gIFxuICAvLyBDb252ZXJ0IHNyYz1cInt7YWxpYXMueHh4Lnl5eX19XCIgcGF0dGVybnMgKGltYWdlcyBpbiBsb29wcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL3NyYz1cIlxce1xce1xccyooXFx3KylcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGNvbnZlcnRlZCBvciBpZiBpdCdzIGEgcHJvcGVydGllcyBwYXR0ZXJuXG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnIHx8IG1hdGNoLmluY2x1ZGVzKCc8P3BocCcpKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGBzcmM9XCI8P3BocCBlY2hvIGVzY191cmwoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBhbHQ9XCJ7e2FsaWFzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9hbHQ9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycgfHwgbWF0Y2guaW5jbHVkZXMoJzw/cGhwJykpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYGFsdD1cIjw/cGhwIGVjaG8gZXNjX2F0dHIoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3thbGlhcy54eHgueXl5fX1cIiBwYXR0ZXJucyAobGlua3MgaW4gbG9vcHMgd2l0aCBuZXN0ZWQgZmllbGRzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccyooXFx3KylcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJyB8fCBtYXRjaC5pbmNsdWRlcygnPD9waHAnKSkge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgke2l0ZW1WYXJ9Wycke2ZpZWxkMX0nXVsnJHtmaWVsZDJ9J10gPz8gJycpOyA/PlwiYDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7YWxpYXMuZmllbGQuc3ViZmllbGR9fSBhbmQge3thbGlhcy5maWVsZH19IHJlZmVyZW5jZXMgZnJvbSBuYW1lZCBsb29wIHZhcmlhYmxlc1xuICAvLyBNdXN0IGhhbmRsZSBkZWVwZXIgbmVzdGluZyBmaXJzdCAoYWxpYXMuZmllbGQuc3ViZmllbGQgYmVmb3JlIGFsaWFzLmZpZWxkKVxuICAvLyBJTVBPUlRBTlQ6IEhhbmRsZSB0cmlwbGUtYnJhY2UgKHJpY2ggdGV4dCkgQkVGT1JFIGRvdWJsZS1icmFjZSBwYXR0ZXJuc1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSBmaWVsZCBwYXRoIHRvIFBIUCBhcnJheSBhY2Nlc3NcbiAgLy8gZS5nLiwgXCJjdGEubGlua1wiIC0+IFwiWydjdGEnXVsnbGluayddXCJcbiAgY29uc3QgZmllbGRQYXRoVG9QaHBBY2Nlc3MgPSAoZmllbGRQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgcmV0dXJuIHBhcnRzLm1hcChwID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICB9O1xuICBcbiAgLy8gUHJvY2VzcyBuZXN0ZWQgbG9vcCBhbGlhc2VzIEZJUlNUICh0aGV5IHVzZSAkc3ViSXRlbSlcbiAgZm9yIChjb25zdCBbYWxpYXNdIG9mIE9iamVjdC5lbnRyaWVzKG5lc3RlZExvb3BBbGlhc2VzKSkge1xuICAgIC8vIEhhbmRsZSB7e3sgYWxpYXMuZmllbGQgfX19IHRyaXBsZS1icmFjZSBwYXR0ZXJucyAocmljaCB0ZXh0L0hUTUwgaW4gbmVzdGVkIGxvb3BzKVxuICAgIGNvbnN0IGFsaWFzVHJpcGxlUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHtcXFxccyoke2FsaWFzfVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzVHJpcGxlUmVnZXgsIChfLCBmaWVsZCkgPT4ge1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkc3ViSXRlbVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9KTtcbiAgICBcbiAgICAvLyBIYW5kbGUge3sjaWYgYWxpYXMuZmllbGQuc3ViZmllbGQuLi59fSBjb25kaXRpb25hbHMgd2l0aCBkZWVwbHkgbmVzdGVkIHBhdGhzIGluIG5lc3RlZCBsb29wc1xuICAgIC8vIGUuZy4sIHt7I2lmIHRhZy5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJHN1Ykl0ZW1bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gICAgY29uc3QgYWxpYXNJZkRlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0lmRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRzdWJJdGVtJHtwaHBBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4uIH19IHBhdHRlcm5zIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRocyBpbiBuZXN0ZWQgbG9vcHNcbiAgICBjb25zdCBhbGlhc0RlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0RlZXBSZWdleCwgKF8sIGZpZWxkUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBmaWVsZFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGxhc3RQYXJ0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBlc2NGdW5jID0gbGFzdFBhcnQgPT09ICd1cmwnIHx8IGxhc3RQYXJ0ID09PSAnc3JjJyB8fCBsYXN0UGFydCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIGNvbnN0IHBocEFjY2VzcyA9IGZpZWxkUGF0aFRvUGhwQWNjZXNzKGZpZWxkUGF0aCk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkc3ViSXRlbSR7cGhwQWNjZXNzfSA/PyAnJyk7ID8+YDtcbiAgICB9KTtcbiAgfVxuICBcbiAgLy8gVGhlbiBwcm9jZXNzIHRvcC1sZXZlbCBsb29wIGFsaWFzZXMgKHRoZXkgdXNlICRpdGVtKVxuICBmb3IgKGNvbnN0IFthbGlhc10gb2YgT2JqZWN0LmVudHJpZXMobG9vcEFsaWFzZXMpKSB7XG4gICAgLy8gSGFuZGxlIHt7eyBhbGlhcy5maWVsZCB9fX0gdHJpcGxlLWJyYWNlIHBhdHRlcm5zIChyaWNoIHRleHQvSFRNTCBpbiBsb29wcylcbiAgICBjb25zdCBhbGlhc1RyaXBsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc1RyaXBsZVJlZ2V4LCAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7I2lmIGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgIC8vIGUuZy4sIHt7I2lmIHNsaWRlLmN0YS5saW5rfX0gLT4gPD9waHAgaWYgKCFlbXB0eSgkaXRlbVsnY3RhJ11bJ2xpbmsnXSkpIDogPz5cbiAgICBjb25zdCBhbGlhc0lmRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyNpZlxcXFxzKyR7YWxpYXN9XFxcXC4oW1xcXFx3Ll0rKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzSWZEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBocEFjY2VzcyA9IGZpZWxkUGF0aFRvUGhwQWNjZXNzKGZpZWxkUGF0aCk7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW0ke3BocEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9KTtcbiAgICBcbiAgICAvLyBIYW5kbGUge3sgYWxpYXMuZmllbGQuc3ViZmllbGQuLi4gfX0gcGF0dGVybnMgd2l0aCBkZWVwbHkgbmVzdGVkIHBhdGhzXG4gICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJGl0ZW0ke3BocEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIEBmaXJzdH19IC0gc2hvdyBjb250ZW50IGZvciBhbGwgaXRlbXMgZXhjZXB0IHRoZSBmaXJzdFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAZmlyc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPiAwKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyN1bmxlc3MgQGxhc3R9fSAtIHNob3cgY29udGVudCBmb3IgYWxsIGl0ZW1zIGV4Y2VwdCB0aGUgbGFzdFxuICAvLyBVc2VzICRfbG9vcF9jb3VudCBzZXQgaW4gdGhlIGZvcmVhY2ggbG9vcFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAbGFzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA8ICRfbG9vcF9jb3VudCAtIDEpIDogPz5gXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIEBmaXJzdH19IC0gc2hvdyBjb250ZW50IG9ubHkgZm9yIHRoZSBmaXJzdCBpdGVtXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrQGZpcnN0XFxzKlxcfVxcfS9nLFxuICAgIGA8P3BocCBpZiAoJGluZGV4ID09PSAwKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBAbGFzdH19IC0gc2hvdyBjb250ZW50IG9ubHkgZm9yIHRoZSBsYXN0IGl0ZW1cbiAgLy8gVXNlcyAkX2xvb3BfY291bnQgc2V0IGluIHRoZSBmb3JlYWNoIGxvb3BcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccytAbGFzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA9PT0gJF9sb29wX2NvdW50IC0gMSkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIHByb3BlcnRpZXMueHh4fX0g4oCUIG5lZ2F0aW9uIG9mIHt7I2lmIHByb3BlcnRpZXMueHh4fX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZW1wdHkoJCR7Y2FtZWxQcm9wfSkpIDogPz5gO1xuICAgICAgfVxuICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGFydHMuc2xpY2UoMSkubWFwKChwOiBzdHJpbmcpID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZW1wdHkoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSkpIDogPz5gO1xuICAgIH1cbiAgKTtcblxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csICc8P3BocCBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgdGhpcy54eHh9fSBjb25kaXRpb25hbHMgaW5zaWRlIGxvb3BzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrdGhpc1xcLihcXHcrKVxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7ZmllbGR9J10pKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBhbGlhcy5maWVsZH19IGZvciBhbnkgcmVtYWluaW5nIGxvb3AgdmFyaWFibGUgY29uZGl0aW9uYWxzXG4gIC8vIFRoaXMgY2F0Y2hlcyBjYXNlcyB3aGVyZSB0aGUgYWxpYXMgd2Fzbid0IHRyYWNrZWQgKGUuZy4sIG5lc3RlZCBsb29wcyBvciB1bnRyYWNrZWQgYWxpYXNlcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBwcm9wZXJ0aWVzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddKSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGVscGVyIHRvIHBhcnNlIEhhbmRsZWJhcnMgaGVscGVyIGV4cHJlc3Npb25zIGxpa2UgKGVxIHByb3BlcnRpZXMubGF5b3V0IFwibGF5b3V0LTFcIilcbiAgLy8gYW5kIGNvbnZlcnQgdG8gUEhQIGNvbXBhcmlzb24gZXhwcmVzc2lvbnNcbiAgY29uc3QgcGFyc2VIZWxwZXJUb1BocCA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBIZWxwZXIgdG8gY29udmVydCBhIHZhcmlhYmxlIHBhdGggdG8gUEhQIGV4cHJlc3Npb25cbiAgICAvLyBIYW5kbGVzIHByb3BlcnRpZXMueHh4LCB0aGlzLnh4eCwgYW5kIGFsaWFzLnh4eCBwYXR0ZXJuc1xuICAgIGNvbnN0IHZhclRvUGhwID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1gO1xuICAgICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZH0nXWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBpcyBhIGtub3duIGxvb3AgYWxpYXMgKGUuZy4sIGNhcmQudHlwZSAtPiB0eXBlKVxuICAgICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAvLyBDaGVjayBuZXN0ZWQgYWxpYXNlcyBmaXJzdCAodXNlICRzdWJJdGVtKVxuICAgICAgICAgIGlmIChuZXN0ZWRMb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlbiBjaGVjayB0b3AtbGV2ZWwgYWxpYXNlcyAodXNlICRpdGVtKVxuICAgICAgICAgIGlmIChsb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2sgLSB1c2UgYXMtaXMgKG1pZ2h0IGJlIGEgcGxhaW4gZmllbGQgbmFtZSlcbiAgICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgICAgfVxuICAgIH07XG4gICAgXG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCB2YXJpYWJsZSkgd2l0aG91dCBxdW90ZXNcbiAgICBjb25zdCBlcVZhck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNdKylcXHMrKFteXFxzKVwiXSspXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFWYXJNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFWYXJNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICBjb25zdCByaWdodEV4cHIgPSB2YXJUb1BocChyaWdodCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICgke3JpZ2h0RXhwcn0gPz8gJycpYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZ3QgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW5cbiAgICBjb25zdCBndE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGd0TWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0TWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPiAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChsdCBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhblxuICAgIGNvbnN0IGx0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgICBpZiAobHRNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8ICR7cmlnaHR9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGd0ZSBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhbiBvciBlcXVhbFxuICAgIGNvbnN0IGd0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChndGVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RlTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPj0gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobHRlIGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuIG9yIGVxdWFsXG4gICAgY29uc3QgbHRlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGx0ZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdGVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8PSAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aG91dCBlbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCR7cGhwQ29uZGl0aW9ufSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGlmL2Vsc2VcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclRvUGhwKGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2VcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQge3sjaWYgcHJvcGVydGllcy54eHgueXl5Lnp6ei4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgLy8gZS5nLiwge3sjaWYgcHJvcGVydGllcy5sZWZ0X2NvbHVtbi5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGxlZnRDb2x1bW5bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJCR7Y2FtZWxQcm9wfSkpIDogPz5gO1xuICAgICAgfVxuICAgICAgLy8gQnVpbGQgbmVzdGVkIGFycmF5IGFjY2VzcyBmb3IgcmVtYWluaW5nIHBhcnRzXG4gICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoKHA6IHN0cmluZykgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSkpIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7e2Vsc2V9fSBzZXBhcmF0ZWx5IChmb3IgY2FzZXMgbm90IGNhdWdodCBieSB0aGUgY29tYmluZWQgcGF0dGVybnMgYWJvdmUpXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtlbHNlXFx9XFx9L2csICc8P3BocCBlbHNlIDogPz4nKTtcbiAgXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXC9pZlxcfVxcfS9nLCAnPD9waHAgZW5kaWY7ID8+Jyk7XG4gIFxuICAvLyBJTVBPUlRBTlQ6IENvbnZlcnQgdHJpcGxlLWJyYWNlIGV4cHJlc3Npb25zIEZJUlNUIChiZWZvcmUgZG91YmxlLWJyYWNlKVxuICAvLyBUcmlwbGUgYnJhY2VzIGFyZSBmb3IgdW5lc2NhcGVkIEhUTUwgb3V0cHV0IChyaWNoIHRleHQgZmllbGRzKVxuICBcbiAgLy8gQ29udmVydCB7e3twcm9wZXJ0aWVzLnh4eH19fSB0cmlwbGUgYnJhY2VzICh1bmVzY2FwZWQgSFRNTClcbiAgLy8gcmljaHRleHQgcHJvcHMgdXNlIElubmVyQmxvY2tzIOKAlCBvdXRwdXQgJGNvbnRlbnQgKGlubmVyIGJsb2NrcyByZW5kZXJlZCBIVE1MKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKF8sIHByb3ApID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgaWYgKHJpY2h0ZXh0UHJvcHMuaGFzKHByb3ApIHx8IHJpY2h0ZXh0UHJvcHMuaGFzKGNhbWVsUHJvcCkpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICRjb250ZW50OyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCQke2NhbWVsUHJvcH0gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3t0aGlzLnh4eH19fSB0cmlwbGUgYnJhY2VzIGZvciBsb29wIGl0ZW1zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3thbGlhcy54eHh9fX0gdHJpcGxlIGJyYWNlcyBmb3IgbmFtZWQgbG9vcCBhbGlhc2VzXG4gIC8vIFRoaXMgY2F0Y2hlcyBhbnkgcmVtYWluaW5nIGFsaWFzLmZpZWxkIHBhdHRlcm5zIHdpdGggdHJpcGxlIGJyYWNlc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAobWF0Y2gsIGFsaWFzLCBmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCBsb29rcyBsaWtlIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7dGhpc319fSBmb3Igc2NhbGFyIGFycmF5cyB3aXRoIEhUTUwgY29udGVudFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnRoaXNcXHMqXFx9XFx9XFx9L2csXG4gICAgJzw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRzdWJJdGVtID8/ICRpdGVtID8/IFxcJ1xcJyk7ID8+J1xuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXN9fSBzaW1wbGUgcmVmZXJlbmNlIChmb3Igc2NhbGFyIGFycmF5cylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFxzKlxcfVxcfS9nLFxuICAgICc8P3BocCBlY2hvIGVzY19odG1sKCRzdWJJdGVtID8/ICRpdGVtID8/IFxcJ1xcJyk7ID8+J1xuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXMueHh4Lnl5eX19IGRlZXAgbmVzdGVkIHJlZmVyZW5jZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBmaWVsZDEsIGZpZWxkMikgPT4ge1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkMiA9PT0gJ3VybCcgfHwgZmllbGQyID09PSAnc3JjJyB8fCBmaWVsZDIgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkaXRlbVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzLnh4eH19IHJlZmVyZW5jZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccyp0aGlzXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkaXRlbVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7cHJvcGVydGllcy54eHgueXl5Lnp6ei4uLn19IGRlZXBseSBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzIChhbnkgZGVwdGgpXG4gIC8vIGUuZy4sIHt7cHJvcGVydGllcy5sZWZ0X2NvbHVtbi5jdGEubGluay5sYWJlbH19IC0+ICRsZWZ0Q29sdW1uWydjdGEnXVsnbGluayddWydsYWJlbCddXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGNvbnN0IGxhc3RQYXJ0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBlc2NGdW5jID0gbGFzdFBhcnQgPT09ICd1cmwnIHx8IGxhc3RQYXJ0ID09PSAnc3JjJyB8fCBsYXN0UGFydCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIFxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkJHtjYW1lbFByb3B9ID8/ICcnKTsgPz5gO1xuICAgICAgfVxuICAgICAgLy8gQnVpbGQgbmVzdGVkIGFycmF5IGFjY2VzcyBmb3IgcmVtYWluaW5nIHBhcnRzXG4gICAgICBjb25zdCBuZXN0ZWRBY2Nlc3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoKHA6IHN0cmluZykgPT4gYFsnJHtwfSddYCkuam9pbignJyk7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgkJHtjYW1lbFByb3B9JHtuZXN0ZWRBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIHt7eHh4Lnl5eX19IHBhdHRlcm5zIChsaWtlbHkgbG9vcCBpdGVtIHJlZmVyZW5jZXMgd2l0aG91dCB0aGlzLilcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceytcXHMqKFxcdyspXFwuKFxcdyspXFxzKlxcfStcXH0vZyxcbiAgICAoXywgb2JqLCBmaWVsZCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCBsb29rcyBsaWtlIGEgUEhQIGV4cHJlc3Npb25cbiAgICAgIGlmIChvYmouaW5jbHVkZXMoJyQnKSB8fCBvYmouaW5jbHVkZXMoJ3BocCcpKSByZXR1cm4gYHt7JHtvYmp9LiR7ZmllbGR9fX1gO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyB8fCBmaWVsZCA9PT0gJ2xhYmVsJyA/IFxuICAgICAgICAoZmllbGQgPT09ICd1cmwnIHx8IGZpZWxkID09PSAnc3JjJyB8fCBmaWVsZCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJykgOiAnZXNjX2h0bWwnO1xuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbb2JqXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGhyZWY9XCJ7e3Byb3BlcnRpZXMueHh4Lnl5eX19XCIgcGF0dGVybnMgc3BlY2lmaWNhbGx5XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eH19XCIgcGF0dGVybnNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9ID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIGhyZWY9XCJ7ey4uLn19XCIgcGF0dGVybnMgKGZvciBsb29wIGl0ZW0gcmVmZXJlbmNlcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHsrKFtefV0rKVxcfStcXH1cIi9nLFxuICAgIChfLCBleHByKSA9PiB7XG4gICAgICBpZiAoZXhwci5pbmNsdWRlcygnPD9waHAnKSkgcmV0dXJuIGBocmVmPVwiJHtleHByfVwiYDtcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSB0aGlzLnh4eCBwYXR0ZXJuXG4gICAgICBjb25zdCB0aGlzTWF0Y2ggPSBleHByLm1hdGNoKC9eXFxzKnRoaXNcXC4oXFx3KykoPzpcXC4oXFx3KykpP1xccyokLyk7XG4gICAgICBpZiAodGhpc01hdGNoKSB7XG4gICAgICAgIGNvbnN0IFssIGZpZWxkMSwgZmllbGQyXSA9IHRoaXNNYXRjaDtcbiAgICAgICAgaWYgKGZpZWxkMikge1xuICAgICAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcjJyk7ID8+XCJgO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVsnJHtmaWVsZDF9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ2hyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bXFwndXJsXFwnXSA/PyAkaXRlbVtcXCdsaW5rXFwnXVtcXCd1cmxcXCddID8/IFxcJyNcXCcpOyA/PlwiJztcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDbGVhbiB1cCBhbnkgc3RyYXkgY3VybHkgYnJhY2VzIGFyb3VuZCBQSFAgZWNobyBzdGF0ZW1lbnRzXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHsoPFxcP3BocCBlY2hvKS9nLCAnJDEnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLyg7IFxcPz4pXFx9L2csICckMScpO1xuICBcbiAgcmV0dXJuIHBocC50cmltKCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGF0dHJpYnV0ZSBleHRyYWN0aW9uIGNvZGVcbiAqL1xuY29uc3QgZ2VuZXJhdGVBdHRyaWJ1dGVFeHRyYWN0aW9uID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsKTogc3RyaW5nID0+IHtcbiAgY29uc3QgZXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHZpZGVvTm9ybWFsaXphdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIE9ubHkgdGhlIGlubmVyQmxvY2tzRmllbGQgcmljaHRleHQgdXNlcyAkY29udGVudCDigJQgc2tpcCBhdHRyaWJ1dGUgZXh0cmFjdGlvbiBmb3IgaXRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgPT09IGlubmVyQmxvY2tzRmllbGQpIGNvbnRpbnVlO1xuICAgIC8vIHBhZ2luYXRpb24gaXRlbXMgYXJlIGF1dG8tZ2VuZXJhdGVkIGZyb20gV1BfUXVlcnkg4oCUIG5vIGF0dHJpYnV0ZSB0byBleHRyYWN0XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG5cbiAgICBjb25zdCBjYW1lbEtleSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gZ2V0UGhwRGVmYXVsdFZhbHVlKHByb3BlcnR5KTtcbiAgICBcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkJHtjYW1lbEtleX0gPSBpc3NldCgkYXR0cmlidXRlc1snJHtjYW1lbEtleX0nXSkgPyAkYXR0cmlidXRlc1snJHtjYW1lbEtleX0nXSA6ICR7ZGVmYXVsdFZhbHVlfTtgKTtcblxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAndmlkZW8nKSB7XG4gICAgICB2aWRlb05vcm1hbGl6YXRpb25zLnB1c2goYGlmIChpc19hcnJheSgkJHtjYW1lbEtleX0pKSB7XG4gIGlmIChlbXB0eSgkJHtjYW1lbEtleX1bJ2lkJ10pICYmICFlbXB0eSgkJHtjYW1lbEtleX1bJ3NyYyddKSAmJiBwcmVnX21hdGNoKCcjKD86bWVkaWFzL3xpZnJhbWUvKShbQS1aYS16MC05XSspIycsIChzdHJpbmcpICQke2NhbWVsS2V5fVsnc3JjJ10sICRtYXRjaGVzKSkge1xuICAgICQke2NhbWVsS2V5fVsnaWQnXSA9ICRtYXRjaGVzWzFdO1xuICB9XG4gIGlmIChlbXB0eSgkJHtjYW1lbEtleX1bJ3NyYyddKSAmJiAhZW1wdHkoJCR7Y2FtZWxLZXl9WydpZCddKSkge1xuICAgICQke2NhbWVsS2V5fVsnc3JjJ10gPSAnaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzLycgLiByYXd1cmxlbmNvZGUoKHN0cmluZykgJCR7Y2FtZWxLZXl9WydpZCddKSAuICcuanNvbnAnO1xuICB9XG59YCk7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gWy4uLmV4dHJhY3Rpb25zLCAuLi52aWRlb05vcm1hbGl6YXRpb25zXS5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogV3JhcCB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgdGhhdCBoYW5kbGVzIGFsaWdubWVudFxuICogQWRkcyB0aGUgYWxpZ25tZW50IGNsYXNzIChhbGlnbm5vbmUsIGFsaWdud2lkZSwgYWxpZ25mdWxsKSBiYXNlZCBvbiBibG9jayBzZXR0aW5nc1xuICovXG5jb25zdCB3cmFwV2l0aEJsb2NrV3JhcHBlciA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjb21wb25lbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gQ29udmVydCBjb21wb25lbnQgSUQgdG8gY2xhc3MgbmFtZSAoc25ha2VfY2FzZSB0byBrZWJhYi1jYXNlKVxuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSBpbiBhIGRpdiB0aGF0IHVzZXMgV29yZFByZXNzJ3MgYmxvY2sgd3JhcHBlciBhdHRyaWJ1dGVzXG4gIC8vIFRoaXMgaGFuZGxlcyBhbGlnbm1lbnQgY2xhc3NlcyBhdXRvbWF0aWNhbGx5XG4gIHJldHVybiBgPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7Y2xhc3NOYW1lfSddKTsgPz4+XG4ke3RlbXBsYXRlfVxuPC9kaXY+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgUEhQIGNvZGUgdG8gY29udmVydCBmaWVsZCBtYXBwaW5nIHZhbHVlIHRvIFBIUCBhcnJheSBzeW50YXhcbiAqL1xuY29uc3QgZmllbGRNYXBwaW5nVG9QaHAgPSAobWFwcGluZzogUmVjb3JkPHN0cmluZywgRmllbGRNYXBwaW5nVmFsdWU+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1hcHBpbmcpKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIFNpbXBsZSBzdHJpbmcgbWFwcGluZ1xuICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gJyR7dmFsdWV9J2ApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS50eXBlKSB7XG4gICAgICAvLyBDb21wbGV4IG1hcHBpbmdcbiAgICAgIHN3aXRjaCAodmFsdWUudHlwZSkge1xuICAgICAgICBjYXNlICdzdGF0aWMnOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ3N0YXRpYycsICd2YWx1ZScgPT4gJyR7KHZhbHVlIGFzIGFueSkudmFsdWUgfHwgJyd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbWFudWFsJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtYW51YWwnXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdtZXRhJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtZXRhJywgJ2tleScgPT4gJyR7KHZhbHVlIGFzIGFueSkua2V5IHx8ICcnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RheG9ub215JzpcbiAgICAgICAgICBjb25zdCB0YXhWYWx1ZSA9IHZhbHVlIGFzIHsgdHlwZTogJ3RheG9ub215JzsgdGF4b25vbXk6IHN0cmluZzsgZm9ybWF0Pzogc3RyaW5nIH07XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAndGF4b25vbXknLCAndGF4b25vbXknID0+ICcke3RheFZhbHVlLnRheG9ub215fScsICdmb3JtYXQnID0+ICcke3RheFZhbHVlLmZvcm1hdCB8fCAnZmlyc3QnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2N1c3RvbSc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnY3VzdG9tJywgJ2NhbGxiYWNrJyA9PiAnJHsodmFsdWUgYXMgYW55KS5jYWxsYmFjayB8fCAnJ30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGBbXFxuJHtlbnRyaWVzLmpvaW4oJyxcXG4nKX1cXG4gIF1gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBwYWdpbmF0aW9uIFBIUCBjb2RlIGZvciBhIGR5bmFtaWMgYXJyYXkgcXVlcnkuXG4gKiBSZXR1cm5zIHRoZSBwYWdpbmF0aW9uIGJsb2NrIHRvIGFwcGVuZCBhZnRlciB0aGUgV1BfUXVlcnkgZXhlY3V0aW9uLlxuICovXG5jb25zdCBnZW5lcmF0ZVBhZ2luYXRpb25QaHAgPSAoXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIHBhZ2luYXRpb25Qcm9wTmFtZTogc3RyaW5nXG4pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gYFxuICAvLyBQYWdpbmF0aW9uXG4gICQke3BhZ2luYXRpb25Qcm9wTmFtZX0gPSBbXTtcbiAgJCR7YXR0ck5hbWV9X3BhZ2luYXRpb25fZW5hYmxlZCA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkJ10gPz8gdHJ1ZTtcbiAgaWYgKCQke2F0dHJOYW1lfV9wYWdpbmF0aW9uX2VuYWJsZWQgJiYgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzID4gMSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbicpKSB7XG4gICAgJCR7cGFnaW5hdGlvblByb3BOYW1lfSA9IGhhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbigkaGZfcGFnZWQsICRxdWVyeS0+bWF4X251bV9wYWdlcywgJyR7YGhmX3BhZ2VfJHthdHRyTmFtZX1gfScpO1xuICB9YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIHBhZ2VkIHZhcmlhYmxlIGV4dHJhY3Rpb24gYW5kIFdQX1F1ZXJ5IHBhZ2VkIGFyZyBmb3IgcGFnaW5hdGlvbi5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdlZFBocCA9IChhdHRyTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcGFyYW1LZXkgPSBgaGZfcGFnZV8ke2F0dHJOYW1lfWA7XG4gIHJldHVybiBgXG4gIC8vIFJlYWQgY3VycmVudCBwYWdlIGZyb20gY3VzdG9tIHF1ZXJ5IHBhcmFtZXRlclxuICAkaGZfcGFnZWQgPSBpc3NldCgkX0dFVFsnJHtwYXJhbUtleX0nXSkgPyBtYXgoMSwgaW50dmFsKCRfR0VUWycke3BhcmFtS2V5fSddKSkgOiAxO2A7XG59O1xuXG4vKipcbiAqIEJ1aWxkIFBIUCBhcnJheV9tYXAgZXhwcmVzc2lvbiB0byByZXNoYXBlIHN0YW5kYXJkIGhlbHBlciBpdGVtcyBpbnRvIHRoZVxuICogdGVtcGxhdGUncyBleHBlY3RlZCBpdGVtIHNoYXBlLiAgUmV0dXJucyBudWxsIHdoZW4gbm8gcmVzaGFwaW5nIGlzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gaXRlbVByb3BlcnRpZXMgIFRoZSBjb21wb25lbnQncyBhcnJheSBpdGVtIHByb3BlcnR5IHNjaGVtYSAoaXRlbXMucHJvcGVydGllcylcbiAqIEBwYXJhbSBzdGFuZGFyZEZpZWxkcyAgVGhlIGZsYXQgZmllbGQgbmFtZXMgdGhlIGhlbHBlciByZXR1cm5zIChlLmcuIFsnbGFiZWwnLCd1cmwnXSlcbiAqL1xuY29uc3QgYnVpbGRSZXNoYXBlUGhwID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG5cbiAgLy8gSWYgZXZlcnkgdG9wLWxldmVsIGtleSBJUyBhIHN0YW5kYXJkIGZpZWxkIHRoZSBzaGFwZXMgYWxyZWFkeSBtYXRjaFxuICBpZiAodG9wS2V5cy5ldmVyeShrID0+IHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGspKSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgcGFpcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbVByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIHBhaXJzLnB1c2goYCcke2tleX0nID0+ICRfX2l0ZW1bJyR7a2V5fSddYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJyB8fCBwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ2xhYmVsJykpIHN1Yi5wdXNoKGAnbGFiZWwnID0+ICRfX2l0ZW1bJ2xhYmVsJ11gKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYCd1cmwnICAgPT4gJF9faXRlbVsndXJsJ11gKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAnJHtrZXl9JyA9PiBbJHtzdWIuam9pbignLCAnKX1dYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgZm9yIChjb25zdCBzdWJLZXkgb2YgT2JqZWN0LmtleXMocHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoc3ViS2V5KSkge1xuICAgICAgICAgIHN1Yi5wdXNoKGAnJHtzdWJLZXl9JyA9PiAkX19pdGVtWycke3N1YktleX0nXWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJyR7a2V5fScgPT4gWyR7c3ViLmpvaW4oJywgJyl9XWApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYWlycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gYFske3BhaXJzLmpvaW4oJywgJyl9XWA7XG59O1xuXG4vKipcbiAqIEJ1aWxkIGVxdWl2YWxlbnQgSlMgcmVzaGFwZSBleHByZXNzaW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAqIFJldHVybnMgbnVsbCB3aGVuIG5vIHJlc2hhcGluZyBpcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGJ1aWxkUmVzaGFwZUpzID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG4gIGlmICh0b3BLZXlzLmV2ZXJ5KGsgPT4gc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoaykpKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBwYWlyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhpdGVtUHJvcGVydGllcykpIHtcbiAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgcGFpcnMucHVzaChgJHtrZXl9OiBpdGVtLiR7a2V5fWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnbGluaycgfHwgcHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCdsYWJlbCcpKSBzdWIucHVzaChgbGFiZWw6IGl0ZW0ubGFiZWxgKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYHVybDogaXRlbS51cmxgKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAke2tleX06IHsgJHtzdWIuam9pbignLCAnKX0gfWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGZvciAoY29uc3Qgc3ViS2V5IG9mIE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKHN1YktleSkpIHtcbiAgICAgICAgICBzdWIucHVzaChgJHtzdWJLZXl9OiBpdGVtLiR7c3ViS2V5fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJHtrZXl9OiB7ICR7c3ViLmpvaW4oJywgJyl9IH1gKTtcbiAgICB9XG4gIH1cblxuICBpZiAocGFpcnMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGAoeyAke3BhaXJzLmpvaW4oJywgJyl9IH0pYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYnJlYWRjcnVtYnMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogQ2FsbHMgaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcygpIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHJldHVybnMgYW4gZW1wdHkgYXJyYXkuXG4gKi9cbmNvbnN0IGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnXSk7XG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7XG4gICAgJCR7YXR0ck5hbWV9ID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCRfX2l0ZW0pIHsgcmV0dXJuICR7cmVzaGFwZUV4cHJ9OyB9LCAkX19yYXcpO2BcbiAgICA6IGAkJHthdHRyTmFtZX0gPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7YDtcblxuICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChicmVhZGNydW1icylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCFmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMnKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zJykpIHtcbiAgICAke2Fzc2lnbkl0ZW1zfVxuICB9XG59XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0YXhvbm9teSB0ZXJtcyBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG1heEl0ZW1zID0gY29uZmlnLm1heEl0ZW1zID8/IC0xO1xuICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBjb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcblxuICAvLyBCdWlsZCB0aGUgcGVyLXRlcm0gYXNzaWdubWVudDogZWl0aGVyIGZsYXQgb3IgcmVzaGFwZWRcbiAgbGV0IHRlcm1Bc3NpZ25tZW50OiBzdHJpbmc7XG4gIGlmIChyZXNoYXBlRXhwcikge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJF9faXRlbSA9IFsnbGFiZWwnID0+ICR0ZXJtLT5uYW1lLCAndXJsJyA9PiBnZXRfdGVybV9saW5rKCR0ZXJtKSwgJ3NsdWcnID0+ICR0ZXJtLT5zbHVnXTtcbiAgICAgICAgJCR7YXR0ck5hbWV9W10gPSAke3Jlc2hhcGVFeHByfTtgO1xuICB9IGVsc2Uge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJCR7YXR0ck5hbWV9W10gPSBbXG4gICAgICAgICAgJ2xhYmVsJyA9PiAkdGVybS0+bmFtZSxcbiAgICAgICAgICAndXJsJyAgID0+IGdldF90ZXJtX2xpbmsoJHRlcm0pLFxuICAgICAgICAgICdzbHVnJyAgPT4gJHRlcm0tPnNsdWcsXG4gICAgICAgIF07YDtcbiAgfVxuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHRheG9ub215IHRlcm1zKVxuJCR7YXR0ck5hbWV9RW5hYmxlZCAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gID8/IGZhbHNlO1xuJCR7YXR0ck5hbWV9VGF4b25vbXkgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1UYXhvbm9teSddID8/ICcke2RlZmF1bHRUYXhvbm9teX0nO1xuJCR7YXR0ck5hbWV9U291cmNlICAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSAgID8/ICdhdXRvJztcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCQke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAkJHthdHRyTmFtZX0gPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX0nXSA/PyBbXTtcbiAgfSBlbHNlIHtcbiAgICAkdGVybXMgPSB3cF9nZXRfcG9zdF90ZXJtcyhnZXRfdGhlX0lEKCksICQke2F0dHJOYW1lfVRheG9ub215LCBbJ251bWJlcicgPT4gJHttYXhJdGVtc31dKTtcbiAgICBpZiAoIWlzX3dwX2Vycm9yKCR0ZXJtcykpIHtcbiAgICAgIGZvcmVhY2ggKCR0ZXJtcyBhcyAkdGVybSkge1xuJHt0ZXJtQXNzaWdubWVudH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHBhZ2luYXRpb24gYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogUmVmZXJlbmNlcyB0aGUgV1BfUXVlcnkgaW5zdGFuY2UgKCRxdWVyeSkgcHJvZHVjZWQgYnkgdGhlIGNvbm5lY3RlZCBwb3N0cyBmaWVsZC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgY29uZmlnOiBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbm5lY3RlZEF0dHIgPSB0b0NhbWVsQ2FzZShjb25maWcuY29ubmVjdGVkRmllbGQpO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnYWN0aXZlJ10pO1xuXG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24oJGhmX3BhZ2VkXyR7Y29ubmVjdGVkQXR0cn0sICRxdWVyeS0+bWF4X251bV9wYWdlcywgJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfScpO1xuICAgICQke2F0dHJOYW1lfSA9IGFycmF5X21hcChmdW5jdGlvbigkX19pdGVtKSB7IHJldHVybiAke3Jlc2hhcGVFeHByfTsgfSwgJF9fcmF3KTtgXG4gICAgOiBgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uKCRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9LCAkcXVlcnktPm1heF9udW1fcGFnZXMsICdoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nKTtgO1xuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHBhZ2luYXRpb24g4oCUIGNvbm5lY3RlZCB0byAnJHtjb25maWcuY29ubmVjdGVkRmllbGR9JylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQgJiYgaXNzZXQoJHF1ZXJ5KSAmJiAkcXVlcnktPm1heF9udW1fcGFnZXMgPiAxKSB7XG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9ID0gaXNzZXQoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSA/IG1heCgxLCBpbnR2YWwoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSkgOiAxO1xuICAgICR7YXNzaWduSXRlbXN9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGR5bmFtaWMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwXG4gKiBTdXBwb3J0cyBib3RoIG1hbnVhbCBwb3N0IHNlbGVjdGlvbiBhbmQgcXVlcnkgYnVpbGRlciBtb2Rlc1xuICovXG5jb25zdCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IER5bmFtaWNBcnJheUNvbmZpZ1xuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbWFwcGluZ1BocCA9IGNvbmZpZy5maWVsZE1hcHBpbmcgXG4gICAgPyBmaWVsZE1hcHBpbmdUb1BocChjb25maWcuZmllbGRNYXBwaW5nKSBcbiAgICA6ICdbXSc7XG4gIFxuICBjb25zdCBpc1F1ZXJ5TW9kZSA9IGNvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAncXVlcnknO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uID0gaXNRdWVyeU1vZGUgJiYgISFjb25maWcucGFnaW5hdGlvbjtcbiAgY29uc3QgcGFnaW5hdGlvblByb3BOYW1lID0gY29uZmlnLnBhZ2luYXRpb24/LnByb3BlcnR5TmFtZSB8fCAncGFnaW5hdGlvbic7XG4gIFxuICAvLyBDb21tb24gY29kZSBmb3IgbG9hZGluZyB0aGUgZmllbGQgcmVzb2x2ZXJcbiAgY29uc3QgbG9hZFJlc29sdmVyID0gYFxuICAvLyBFbnN1cmUgZmllbGQgcmVzb2x2ZXIgaXMgbG9hZGVkXG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpIFxuICAgICAgPyBIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSIC4gJ2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJ1xuICAgICAgOiBkaXJuYW1lKF9fRklMRV9fKSAuICcvLi4vaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnO1xuICAgIGlmIChmaWxlX2V4aXN0cygkcmVzb2x2ZXJfcGF0aCkpIHtcbiAgICAgIHJlcXVpcmVfb25jZSAkcmVzb2x2ZXJfcGF0aDtcbiAgICB9XG4gIH1gO1xuXG4gIC8vIFBhZ2luYXRpb24gUEhQIHNuaXBwZXRzIChlbXB0eSBzdHJpbmdzIHdoZW4gbm8gcGFnaW5hdGlvbilcbiAgY29uc3QgcGFnZWRFeHRyYWN0aW9uID0gaGFzUGFnaW5hdGlvbiA/IGdlbmVyYXRlUGFnZWRQaHAoYXR0ck5hbWUpIDogJyc7XG4gIGNvbnN0IHBhZ2VkQXJnID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4gICAgJ3BhZ2VkJyAgICAgICAgICA9PiAkaGZfcGFnZWQsYCA6ICcnO1xuICBjb25zdCBwYWdpbmF0aW9uQmxvY2sgPSBoYXNQYWdpbmF0aW9uID8gZ2VuZXJhdGVQYWdpbmF0aW9uUGhwKGF0dHJOYW1lLCBwYWdpbmF0aW9uUHJvcE5hbWUpIDogJyc7XG4gIC8vIEluaXRpYWxpemUgcGFnaW5hdGlvbiB2YXJpYWJsZSB0byBlbXB0eSBhcnJheSB3aGVuIG5vdCBpbiBxdWVyeSBtb2RlXG4gIGNvbnN0IHBhZ2luYXRpb25Jbml0ID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4kJHtwYWdpbmF0aW9uUHJvcE5hbWV9ID0gW107YCA6ICcnO1xuXG4gIGlmIChjb25maWcucmVuZGVyTW9kZSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIC8vIFRlbXBsYXRlIG1vZGUgLSBzdG9yZSBwb3N0cyBmb3IgdGVtcGxhdGUgcmVuZGVyaW5nXG4gICAgY29uc3QgdGVtcGxhdGVQYXRoID0gY29uZmlnLnRlbXBsYXRlUGF0aCB8fCBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2ZpZWxkTmFtZX0taXRlbS5waHBgO1xuICAgIFxuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIC0gdXNlIFdQX1F1ZXJ5IHdpdGggcXVlcnkgYXJnc1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAocXVlcnkgYnVpbGRlciArIHRlbXBsYXRlIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5JztcbiQke2F0dHJOYW1lfV9wb3N0cyA9IFtdOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAncXVlcnknKSB7XG4gIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSAtIGJ1aWxkIFdQX1F1ZXJ5IGZyb20gc2F2ZWQgYXJnc1xuICAkcXVlcnlfYXJncyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVF1ZXJ5QXJncyddID8/IFtdOyR7cGFnZWRFeHRyYWN0aW9ufVxuICBcbiAgLy8gQnVpbGQgV1BfUXVlcnkgYXJndW1lbnRzXG4gICR3cF9xdWVyeV9hcmdzID0gW1xuICAgICdwb3N0X3R5cGUnICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RfdHlwZSddID8/ICcke2NvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgY29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCd9JyxcbiAgICAncG9zdHNfcGVyX3BhZ2UnID0+ICRxdWVyeV9hcmdzWydwb3N0c19wZXJfcGFnZSddID8/ICR7Y29uZmlnLm1heEl0ZW1zIHx8IDZ9LFxuICAgICdvcmRlcmJ5JyAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyYnknXSA/PyAnZGF0ZScsXG4gICAgJ29yZGVyJyAgICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXInXSA/PyAnREVTQycsXG4gICAgJ3Bvc3Rfc3RhdHVzJyAgICA9PiAncHVibGlzaCcsJHtwYWdlZEFyZ31cbiAgXTtcbiAgXG4gIC8vIEV4Y2x1ZGUgdGhlIGN1cnJlbnQgcG9zdCB0byBwcmV2ZW50IHNlbGYtcmVmZXJlbmNlXG4gICRjdXJyZW50X3Bvc3RfaWQgPSBnZXRfdGhlX0lEKCk7XG4gIGlmICgkY3VycmVudF9wb3N0X2lkKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3Bvc3RfX25vdF9pbiddID0gWyRjdXJyZW50X3Bvc3RfaWRdO1xuICB9XG4gIFxuICAvLyBBZGQgdGF4b25vbXkgcXVlcmllcyBpZiBwcmVzZW50XG4gIGlmICghZW1wdHkoJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKSkge1xuICAgICR3cF9xdWVyeV9hcmdzWyd0YXhfcXVlcnknXSA9IGFycmF5X21hcChmdW5jdGlvbigkdHEpIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgICd0YXhvbm9teScgPT4gJHRxWyd0YXhvbm9teSddID8/ICcnLFxuICAgICAgICAnZmllbGQnICAgID0+ICR0cVsnZmllbGQnXSA/PyAndGVybV9pZCcsXG4gICAgICAgICd0ZXJtcycgICAgPT4gJHRxWyd0ZXJtcyddID8/IFtdLFxuICAgICAgICAnb3BlcmF0b3InID0+ICR0cVsnb3BlcmF0b3InXSA/PyAnSU4nLFxuICAgICAgXTtcbiAgICB9LCAkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pO1xuICB9XG4gIFxuICAkcXVlcnkgPSBuZXcgV1BfUXVlcnkoJHdwX3F1ZXJ5X2FyZ3MpO1xuICAkJHthdHRyTmFtZX1fcG9zdHMgPSAkcXVlcnktPnBvc3RzOyR7cGFnaW5hdGlvbkJsb2NrfVxuICB3cF9yZXNldF9wb3N0ZGF0YSgpO1xufVxuLy8gRm9yIHRlbXBsYXRlIG1vZGUsIHRoZSB0ZW1wbGF0ZSB3aWxsIGl0ZXJhdGUgb3ZlciAkJHthdHRyTmFtZX1fcG9zdHNcbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE1hbnVhbCBzZWxlY3Rpb24gbW9kZSAtIGZldGNoIHNwZWNpZmljIHBvc3RzXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChzZWxlY3QgcG9zdHMgKyB0ZW1wbGF0ZSBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7XG4kJHthdHRyTmFtZX1fcG9zdHMgPSBbXTske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICBcbiAgaWYgKCFlbXB0eSgkc2VsZWN0ZWRfcG9zdHMpKSB7XG4gICAgJHBvc3RfaWRzID0gYXJyYXlfZmlsdGVyKGFycmF5X21hcChmdW5jdGlvbigkcCkgeyBcbiAgICAgIHJldHVybiBpc3NldCgkcFsnaWQnXSkgPyBpbnR2YWwoJHBbJ2lkJ10pIDogMDsgXG4gICAgfSwgJHNlbGVjdGVkX3Bvc3RzKSk7XG4gICAgXG4gICAgaWYgKCFlbXB0eSgkcG9zdF9pZHMpKSB7XG4gICAgICAkJHthdHRyTmFtZX1fcG9zdHMgPSBnZXRfcG9zdHMoW1xuICAgICAgICAncG9zdF9faW4nICAgICAgID0+ICRwb3N0X2lkcyxcbiAgICAgICAgJ29yZGVyYnknICAgICAgICA9PiAncG9zdF9faW4nLFxuICAgICAgICAncG9zdHNfcGVyX3BhZ2UnID0+IGNvdW50KCRwb3N0X2lkcyksXG4gICAgICAgICdwb3N0X3N0YXR1cycgICAgPT4gJ3B1Ymxpc2gnLFxuICAgICAgICAncG9zdF90eXBlJyAgICAgID0+ICdhbnknLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG59XG4vLyBGb3IgdGVtcGxhdGUgbW9kZSwgdGhlIHRlbXBsYXRlIHdpbGwgaXRlcmF0ZSBvdmVyICQke2F0dHJOYW1lfV9wb3N0c1xuYDtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gTWFwcGVkIG1vZGUgLSBjb252ZXJ0IHBvc3RzIHRvIGl0ZW0gc3RydWN0dXJlXG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgd2l0aCBmaWVsZCBtYXBwaW5nXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChxdWVyeSBidWlsZGVyICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgLSBidWlsZCBXUF9RdWVyeSBmcm9tIHNhdmVkIGFyZ3NcbiAgJHF1ZXJ5X2FyZ3MgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1RdWVyeUFyZ3MnXSA/PyBbXTtcbiAgJGZpZWxkX21hcHBpbmcgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1GaWVsZE1hcHBpbmcnXSA/PyAke21hcHBpbmdQaHB9O1xuJHtsb2FkUmVzb2x2ZXJ9JHtwYWdlZEV4dHJhY3Rpb259XG4gIFxuICAvLyBCdWlsZCBXUF9RdWVyeSBhcmd1bWVudHNcbiAgJHdwX3F1ZXJ5X2FyZ3MgPSBbXG4gICAgJ3Bvc3RfdHlwZScgICAgICA9PiAkcXVlcnlfYXJnc1sncG9zdF90eXBlJ10gPz8gJyR7Y29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBjb25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0J30nLFxuICAgICdwb3N0c19wZXJfcGFnZScgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RzX3Blcl9wYWdlJ10gPz8gJHtjb25maWcubWF4SXRlbXMgfHwgNn0sXG4gICAgJ29yZGVyYnknICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXJieSddID8/ICdkYXRlJyxcbiAgICAnb3JkZXInICAgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlciddID8/ICdERVNDJyxcbiAgICAncG9zdF9zdGF0dXMnICAgID0+ICdwdWJsaXNoJywke3BhZ2VkQXJnfVxuICBdO1xuICBcbiAgLy8gRXhjbHVkZSB0aGUgY3VycmVudCBwb3N0IHRvIHByZXZlbnQgc2VsZi1yZWZlcmVuY2VcbiAgJGN1cnJlbnRfcG9zdF9pZCA9IGdldF90aGVfSUQoKTtcbiAgaWYgKCRjdXJyZW50X3Bvc3RfaWQpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sncG9zdF9fbm90X2luJ10gPSBbJGN1cnJlbnRfcG9zdF9pZF07XG4gIH1cbiAgXG4gIC8vIEFkZCB0YXhvbm9teSBxdWVyaWVzIGlmIHByZXNlbnRcbiAgaWYgKCFlbXB0eSgkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCR0cSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgJ3RheG9ub215JyA9PiAkdHFbJ3RheG9ub215J10gPz8gJycsXG4gICAgICAgICdmaWVsZCcgICAgPT4gJHRxWydmaWVsZCddID8/ICd0ZXJtX2lkJyxcbiAgICAgICAgJ3Rlcm1zJyAgICA9PiAkdHFbJ3Rlcm1zJ10gPz8gW10sXG4gICAgICAgICdvcGVyYXRvcicgPT4gJHRxWydvcGVyYXRvciddID8/ICdJTicsXG4gICAgICBdO1xuICAgIH0sICRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSk7XG4gIH1cbiAgXG4gICRxdWVyeSA9IG5ldyBXUF9RdWVyeSgkd3BfcXVlcnlfYXJncyk7XG4gIFxuICAvLyBNYXAgcG9zdHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlXG4gICQke2F0dHJOYW1lfSA9IFtdO1xuICBpZiAoJHF1ZXJ5LT5oYXZlX3Bvc3RzKCkgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgIGZvcmVhY2ggKCRxdWVyeS0+cG9zdHMgYXMgJHBvc3QpIHtcbiAgICAgICQke2F0dHJOYW1lfVtdID0gaGFuZG9mZl9tYXBfcG9zdF90b19pdGVtKCRwb3N0LT5JRCwgJGZpZWxkX21hcHBpbmcpO1xuICAgIH1cbiAgfVxuICAvLyBBcHBseSBpdGVtIG92ZXJyaWRlcyAoZS5nLiBjYXJkIHR5cGUgZm9yIGFsbCBpdGVtcykgZnJvbSBBZHZhbmNlZCBvcHRpb25zXG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH0ke3BhZ2luYXRpb25CbG9ja31cbiAgd3BfcmVzZXRfcG9zdGRhdGEoKTtcbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNlbGVjdCBwb3N0cyBtb2RlIHdpdGggZmllbGQgbWFwcGluZ1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAoc2VsZWN0IHBvc3RzICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICAkZmllbGRfbWFwcGluZyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUZpZWxkTWFwcGluZyddID8/ICR7bWFwcGluZ1BocH07XG4ke2xvYWRSZXNvbHZlcn1cbiAgXG4gIGlmICghZW1wdHkoJHNlbGVjdGVkX3Bvc3RzKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfcXVlcnlfYW5kX21hcF9wb3N0cycpKSB7XG4gICAgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9xdWVyeV9hbmRfbWFwX3Bvc3RzKCRzZWxlY3RlZF9wb3N0cywgJGZpZWxkX21hcHBpbmcpO1xuICB9IGVsc2Uge1xuICAgICQke2F0dHJOYW1lfSA9IFtdO1xuICB9XG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH1cbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIHJlbmRlci5waHAgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICovXG5jb25zdCBnZW5lcmF0ZVJlbmRlclBocCA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbFxuKTogc3RyaW5nID0+IHtcbiAgLy8gT25seSB0aGUgaW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCB1c2VzICRjb250ZW50IChJbm5lckJsb2Nrcyk7XG4gIC8vIG90aGVyIHJpY2h0ZXh0IGZpZWxkcyBhcmUgcmVuZGVyZWQgZnJvbSB0aGVpciBzdHJpbmcgYXR0cmlidXRlcy5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAoaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKGlubmVyQmxvY2tzRmllbGQpO1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGF0dHJpYnV0ZUV4dHJhY3Rpb24gPSBnZW5lcmF0ZUF0dHJpYnV0ZUV4dHJhY3Rpb24oY29tcG9uZW50LnByb3BlcnRpZXMsIGlubmVyQmxvY2tzRmllbGQpO1xuICBjb25zdCB3aXN0aWFFbnF1ZXVlQ29kZSA9IGdlbmVyYXRlV2lzdGlhRW5xdWV1ZUNvZGUoY29tcG9uZW50LmNvZGUpO1xuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChzdHJpcFdpc3RpYVNjcmlwdFRhZ3MoY29tcG9uZW50LmNvZGUpLCBjb21wb25lbnQucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBkeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gY29kZVxuICBjb25zdCBkeW5hbWljQXJyYXlFeHRyYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5hbWljQXJyYXlDb2RlID0gZHluYW1pY0FycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgZm9yIGFsaWdubWVudCBzdXBwb3J0XG4gIGNvbnN0IHdyYXBwZWRUZW1wbGF0ZSA9IHdyYXBXaXRoQmxvY2tXcmFwcGVyKHRlbXBsYXRlUGhwLCBjb21wb25lbnQuaWQpO1xuICBcbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7Y29tcG9uZW50LnRpdGxlfVxuICpcbiAqIEBwYXJhbSBhcnJheSAgICAkYXR0cmlidXRlcyBCbG9jayBhdHRyaWJ1dGVzLlxuICogQHBhcmFtIHN0cmluZyAgICRjb250ZW50ICAgIEJsb2NrIGRlZmF1bHQgY29udGVudC5cbiAqIEBwYXJhbSBXUF9CbG9jayAkYmxvY2sgICAgICBCbG9jayBpbnN0YW5jZS5cbiAqIEByZXR1cm4gc3RyaW5nIFJldHVybnMgdGhlIGJsb2NrIG1hcmt1cC5cbiAqL1xuXG5pZiAoIWRlZmluZWQoJ0FCU1BBVEgnKSkge1xuICBleGl0O1xufVxuXG5pZiAoIWlzc2V0KCRhdHRyaWJ1dGVzKSkge1xuICAkYXR0cmlidXRlcyA9IFtdO1xufVxuXG4vLyBFeHRyYWN0IGF0dHJpYnV0ZXMgd2l0aCBkZWZhdWx0c1xuJHthdHRyaWJ1dGVFeHRyYWN0aW9ufVxuJHtkeW5hbWljQXJyYXlDb2RlfVxuJHt3aXN0aWFFbnF1ZXVlQ29kZX1cbj8+XG4ke3dyYXBwZWRUZW1wbGF0ZX1cbmA7XG59O1xuXG5leHBvcnQge1xuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgaGFuZGxlYmFyc1RvUGhwLFxuICBhcnJheVRvUGhwLFxuICBnZXRQaHBEZWZhdWx0VmFsdWUsXG4gIGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24sXG4gIGJ1aWxkUmVzaGFwZVBocCxcbiAgYnVpbGRSZXNoYXBlSnMsXG59O1xuIl19