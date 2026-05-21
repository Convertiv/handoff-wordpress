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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXBocC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3JlbmRlci1waHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0NBQW1PO0FBQ25PLG1EQUFtRDtBQUNuRCwyREFBa0Q7QUFFbEQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQVUsRUFBVSxFQUFFO0lBQ3hDLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDMUMsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkQsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDO0lBQ3RCLENBQUM7SUFFRCxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzlCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO2FBQ2hDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzthQUM3QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDZCxPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7SUFDM0MsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDL0IsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN2QixDQUFDLENBQUM7QUErekRBLGdDQUFVO0FBN3pEWjs7R0FFRztBQUNILE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxRQUF5QixFQUFVLEVBQUU7SUFDL0QsUUFBUSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEIsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFVBQVUsQ0FBQztRQUNoQixLQUFLLFFBQVE7WUFDWCxPQUFPLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXBFLEtBQUssUUFBUTtZQUNYLE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFdkMsS0FBSyxTQUFTO1lBQ1osT0FBTyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUU3QyxLQUFLLE9BQU87WUFDVixPQUFPLDRCQUE0QixDQUFDO1FBRXRDLEtBQUssT0FBTztZQUNWLElBQUksUUFBUSxDQUFDLE9BQU8sSUFBSSxPQUFPLFFBQVEsQ0FBQyxPQUFPLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDakcsT0FBTyxVQUFVLENBQUM7b0JBQ2hCLEdBQUcsRUFBRSxFQUFFO29CQUNQLEVBQUUsRUFBRSxFQUFFO29CQUNOLE1BQU0sRUFBRSxFQUFFO29CQUNWLElBQUksRUFBRSxFQUFFO29CQUNSLEtBQUssRUFBRSxDQUFDO29CQUNSLE1BQU0sRUFBRSxDQUFDO29CQUNULElBQUksRUFBRSxFQUFFO29CQUNSLFFBQVEsRUFBRSxFQUFFO29CQUNaLEdBQUcsUUFBUSxDQUFDLE9BQU87aUJBQ3BCLENBQUMsQ0FBQztZQUNMLENBQUM7WUFDRCxJQUFJLE9BQU8sUUFBUSxDQUFDLE9BQU8sS0FBSyxRQUFRLElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM3RCxPQUFPLFVBQVUsQ0FBQztvQkFDaEIsR0FBRyxFQUFFLFFBQVEsQ0FBQyxPQUFPO29CQUNyQixFQUFFLEVBQUUsRUFBRTtvQkFDTixNQUFNLEVBQUUsRUFBRTtvQkFDVixJQUFJLEVBQUUsRUFBRTtvQkFDUixLQUFLLEVBQUUsQ0FBQztvQkFDUixNQUFNLEVBQUUsQ0FBQztvQkFDVCxJQUFJLEVBQUUsRUFBRTtvQkFDUixRQUFRLEVBQUUsRUFBRTtpQkFDYixDQUFDLENBQUM7WUFDTCxDQUFDO1lBQ0QsT0FBTyxzSEFBc0gsQ0FBQztRQUVoSSxLQUFLLE1BQU07WUFDVCxPQUFPLHdEQUF3RCxDQUFDO1FBRWxFLEtBQUssUUFBUTtZQUNYLE9BQU8sVUFBVSxDQUFDLElBQUEsZ0NBQWdCLEVBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUVoRCxLQUFLLFFBQVE7WUFDWCxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDckIsT0FBTyxVQUFVLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RDLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUVkLEtBQUssT0FBTztZQUNWLElBQUksUUFBUSxDQUFDLE9BQU8sSUFBSSxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDO2dCQUNoRCxPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZFLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUVkO1lBQ0UsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztBQUNILENBQUMsQ0FBQztBQTB2REEsZ0RBQWtCO0FBeHZEcEIsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLEtBQWEsRUFBVSxFQUFFLENBQ3hELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDO0FBRTNELE1BQU0sOEJBQThCLEdBQUcsQ0FBQyxhQUFxQixFQUFVLEVBQUU7SUFDdkUsTUFBTSxVQUFVLEdBQUcsK0JBQStCLENBQUM7SUFDbkQsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBQzNCLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNmLElBQUksS0FBNkIsQ0FBQztJQUVsQyxNQUFNLFdBQVcsR0FBRyxDQUFDLE9BQWUsRUFBRSxFQUFFO1FBQ3RDLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixLQUFLLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLE9BQU8sQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ3pELFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV0RCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRCxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUN6QyxNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUQsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLFNBQVMsU0FBUyxDQUFDLENBQUM7WUFDdEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE1BQU0sWUFBWSxHQUFHLElBQUk7cUJBQ3RCLEtBQUssQ0FBQyxDQUFDLENBQUM7cUJBQ1IsR0FBRyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxLQUFLLE9BQU8sSUFBSSxDQUFDO3FCQUNsQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ1osS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLFNBQVMsR0FBRyxZQUFZLFNBQVMsQ0FBQyxDQUFDO1lBQ3JELENBQUM7UUFDSCxDQUFDO2FBQU0sQ0FBQztZQUNOLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUVELE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDekMsQ0FBQztJQUVELFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFFekMsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3JELENBQUMsQ0FBQztBQU9GLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxXQUFtQixFQUFlLEVBQUU7SUFDNUQsTUFBTSxZQUFZLEdBQUcsdUNBQXVDLENBQUM7SUFDN0QsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDO0lBRTlCLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7UUFDL0UsTUFBTSxlQUFlLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JGLE1BQU0saUJBQWlCLEdBQUcsOEJBQThCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFMUUsT0FBTztZQUNMLG9CQUFvQixFQUFFLGlCQUFpQjtZQUN2QyxhQUFhLEVBQUUsSUFBSSxZQUFZLE9BQU8saUJBQWlCLE9BQU8sWUFBWSxHQUFHO1NBQzlFLENBQUM7SUFDSixDQUFDO0lBRUQsTUFBTSxhQUFhLEdBQUcsOEJBQThCLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDbEUsT0FBTztRQUNMLG9CQUFvQixFQUFFLGFBQWE7UUFDbkMsYUFBYTtLQUNkLENBQUM7QUFDSixDQUFDLENBQUM7QUFFRixNQUFNLHlCQUF5QixHQUFHLENBQUMsUUFBZ0IsRUFBVSxFQUFFO0lBQzdELE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO0lBQzlDLElBQUksY0FBYyxHQUFHLEtBQUssQ0FBQztJQUUzQixNQUFNLFFBQVEsR0FBRyxDQUFDLEtBQWtCLEVBQUUsRUFBRTtRQUN0QyxNQUFNLEdBQUcsR0FBRyxHQUFHLEtBQUssQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDcEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQixNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsdURBQXVELENBQUM7SUFDNUUsSUFBSSxXQUFtQyxDQUFDO0lBRXhDLE9BQU8sQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzNELE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVsQyxJQUFJLGdEQUFnRCxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQy9ELGNBQWMsR0FBRyxJQUFJLENBQUM7WUFDdEIsU0FBUztRQUNYLENBQUM7UUFFRCxJQUFJLHFDQUFxQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3BELGNBQWMsR0FBRyxJQUFJLENBQUM7WUFDdEIsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEMsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLGVBQWUsR0FBRyw0QkFBNEIsQ0FBQztJQUNyRCxJQUFJLGVBQXVDLENBQUM7SUFFNUMsT0FBTyxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDbkUsY0FBYyxHQUFHLElBQUksQ0FBQztRQUV0QixNQUFNLGlCQUFpQixHQUFHLDhCQUE4QixDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdFLFFBQVEsQ0FBQztZQUNQLG9CQUFvQixFQUFFLGlCQUFpQjtZQUN2QyxhQUFhLEVBQUUsNkNBQTZDLGlCQUFpQixhQUFhO1NBQzNGLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDcEIsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBRUQsTUFBTSxLQUFLLEdBQUc7UUFDWix3QkFBd0I7UUFDeEIsd0hBQXdIO0tBQ3pILENBQUM7SUFFRixLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNuRCxNQUFNLFFBQVEsR0FBRyxzQkFBc0IsS0FBSyxFQUFFLENBQUM7UUFDL0MsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsTUFBTSxLQUFLLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQztRQUNwRCxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsS0FBSyxDQUFDLG9CQUFvQixNQUFNLENBQUMsQ0FBQztRQUMzRCxLQUFLLENBQUMsSUFBSSxDQUNSLDJFQUEyRSxRQUFRLE9BQU8sUUFBUSx1Q0FBdUMsQ0FDMUksQ0FBQztRQUNGLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ2pDLENBQUMsQ0FBQztBQUVGLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxRQUFnQixFQUFVLEVBQUUsQ0FDekQsUUFBUTtLQUNMLE9BQU8sQ0FBQyxtR0FBbUcsRUFBRSxJQUFJLENBQUM7S0FDbEgsT0FBTyxDQUFDLDRHQUE0RyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBRWpJOztHQUVHO0FBQ0gsTUFBTSxlQUFlLEdBQUcsQ0FBQyxRQUFnQixFQUFFLFVBQTJDLEVBQUUsZ0JBQTZCLElBQUksR0FBRyxFQUFFLEVBQVUsRUFBRTtJQUN4SSxJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUM7SUFFbkIsaUNBQWlDO0lBQ2pDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLDRCQUE0QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLDRCQUE0QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLDBCQUEwQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2xELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLHVCQUF1QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRS9DLHVCQUF1QjtJQUN2QixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUUxQyw2QkFBNkI7SUFDN0IsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDaEQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFNUMsbUVBQW1FO0lBQ25FLHNFQUFzRTtJQUN0RSxtRUFBbUU7SUFDbkUsOEdBQThHO0lBQzlHLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLDhCQUE4QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3RELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLHlCQUF5QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRWpELGtGQUFrRjtJQUNsRixtRkFBbUY7SUFDbkYsc0ZBQXNGO0lBQ3RGLDJFQUEyRTtJQUMzRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUVqRiwwRkFBMEY7SUFDMUYscUZBQXFGO0lBQ3JGLHFFQUFxRTtJQUNyRSxNQUFNLGlCQUFpQixHQUFHLENBQUMsT0FBZSxFQUFVLEVBQUU7UUFDcEQsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDdEMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzVELE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE9BQU8sSUFBSSxTQUFTLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUMzRCxDQUFDO1lBQ0QsT0FBTyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ3pCLENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMzQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDeEIsT0FBTyxVQUFVLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDckQsQ0FBQztZQUNELE9BQU8sVUFBVSxLQUFLLElBQUksQ0FBQztRQUM3QixDQUFDO2FBQU0sQ0FBQztZQUNOLG9FQUFvRTtZQUNwRSxtREFBbUQ7WUFDbkQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pDLE9BQU8sVUFBVSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDOUMsQ0FBQztZQUNELE9BQU8sVUFBVSxPQUFPLElBQUksQ0FBQztRQUMvQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsd0RBQXdEO0lBQ3hELE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxJQUFZLEVBQWlCLEVBQUU7UUFDM0Qsc0RBQXNEO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QyxPQUFPLElBQUksUUFBUSxnQkFBZ0IsS0FBSyxHQUFHLENBQUM7UUFDOUMsQ0FBQztRQUNELHVDQUF1QztRQUN2QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLEtBQUssR0FBRyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUMsQ0FBQztJQUtGLE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsR0FBVyxFQUNYLFFBQWdCLEVBQ2hCLGNBQXNCLEVBQ21DLEVBQUU7UUFDM0QsTUFBTSxRQUFRLEdBQXFCLENBQUMsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksR0FBRyxHQUFHLFFBQVEsQ0FBQztRQUNuQixJQUFJLFlBQVksR0FBRyxRQUFRLENBQUM7UUFDNUIsTUFBTSxXQUFXLEdBQUcsbUNBQW1DLENBQUM7UUFFeEQsT0FBTyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDckMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDekMsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUMsV0FBVyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUM7WUFDNUIsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXhELE1BQU0sVUFBVSxHQUFvRTtnQkFDbEYsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUU7Z0JBQzNCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFO2dCQUNqQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRTtnQkFDL0IsR0FBRyxDQUFDLFVBQVUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsV0FBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxXQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2FBQzNILENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTFELElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDO2dCQUFFLE1BQU07WUFFbkMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTlCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDMUIsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUNwQyxLQUFLLEVBQUUsQ0FBQztnQkFDUixJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDaEIsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakYsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUM3QyxDQUFDO2dCQUNELEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHlCQUF5QjtZQUNsRCxDQUFDO2lCQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakYsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyRSxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNqRixRQUFRLENBQUMsSUFBSSxDQUFDO29CQUNaLFNBQVMsRUFBRSxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtvQkFDM0QsT0FBTyxFQUFFLEVBQUU7aUJBQ1osQ0FBQyxDQUFDO2dCQUNILFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQztnQkFDcEMsR0FBRyxHQUFHLFlBQVksQ0FBQztZQUNyQixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sbUdBQW1HO2dCQUNuRyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQztZQUM5QixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsTUFBTSxhQUFhLEdBQUcsK0JBQStCLENBQUM7SUFDdEQsSUFBSSxXQUFXLENBQUM7SUFDaEIsT0FBTyxDQUFDLFdBQVcsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDeEQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxPQUFPLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNuRCxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdEMsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNyRSxJQUFJLE1BQU0sS0FBSyxJQUFJO1lBQUUsU0FBUztRQUM5QixNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxHQUFHLE1BQU0sQ0FBQztRQUV0QyxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7UUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN6QyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0IsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDdEYsTUFBTSxJQUFJLEdBQUcsWUFBWSxJQUFJLE9BQU8sQ0FBQztZQUNyQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDWixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsSUFBSSxTQUFTLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELENBQUM7aUJBQU0sSUFBSSxNQUFNLENBQUMsU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUNyQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixJQUFJLFNBQVMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDN0QsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELENBQUM7UUFDSCxDQUFDO1FBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLFdBQVcsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLHlCQUF5QjtRQUN0RyxtR0FBbUc7UUFDbkcsYUFBYSxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUM7SUFDcEMsQ0FBQztJQUVELHlFQUF5RTtJQUN6RSw4REFBOEQ7SUFDOUQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsbUZBQW1GLEVBQ25GLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLEVBQUU7UUFDNUMsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGVBQWUsWUFBWSxVQUFVLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7UUFDMUcsQ0FBQztRQUNELE9BQU8sdUJBQXVCLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7SUFDNUYsQ0FBQyxDQUNGLENBQUM7SUFDRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiw2REFBNkQsRUFDN0QsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxFQUFFO1FBQy9CLE1BQU0sWUFBWSxHQUFHLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxlQUFlLFlBQVksVUFBVSxhQUFhLGlCQUFpQixDQUFDO1FBQzdFLENBQUM7UUFDRCxPQUFPLHVCQUF1QixhQUFhLGlCQUFpQixDQUFDO0lBQy9ELENBQUMsQ0FDRixDQUFDO0lBRUYsNENBQTRDO0lBQzVDLDREQUE0RDtJQUM1RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwrRUFBK0UsRUFDL0UsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLHNCQUFzQixTQUFTLEtBQUssS0FBSyxzREFBc0QsU0FBUyxLQUFLLEtBQUssd0JBQXdCLENBQUM7SUFDcEosQ0FBQyxDQUNGLENBQUM7SUFFRixvREFBb0Q7SUFDcEQsa0RBQWtEO0lBQ2xELE1BQU0sV0FBVyxHQUEyQixFQUFFLENBQUM7SUFFL0MsNkVBQTZFO0lBQzdFLE1BQU0saUJBQWlCLEdBQTJCLEVBQUUsQ0FBQztJQUVyRCxxREFBcUQ7SUFDckQsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO0lBRXhCLDJEQUEyRDtJQUMzRCxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQWEsRUFBVSxFQUFFO1FBQy9DLElBQUksS0FBSyxLQUFLLENBQUM7WUFBRSxPQUFPLE9BQU8sQ0FBQztRQUNoQyxJQUFJLEtBQUssS0FBSyxDQUFDO1lBQUUsT0FBTyxVQUFVLENBQUM7UUFDbkMsT0FBTyxVQUFVLEtBQUssTUFBTSxDQUFDO0lBQy9CLENBQUMsQ0FBQztJQUVGLE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBYSxFQUFVLEVBQUU7UUFDaEQsSUFBSSxLQUFLLEtBQUssQ0FBQztZQUFFLE9BQU8sUUFBUSxDQUFDO1FBQ2pDLElBQUksS0FBSyxLQUFLLENBQUM7WUFBRSxPQUFPLFdBQVcsQ0FBQztRQUNwQyxPQUFPLFVBQVUsS0FBSyxPQUFPLENBQUM7SUFDaEMsQ0FBQyxDQUFDO0lBRUYsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUFhLEVBQVUsRUFBRTtRQUNoRCxJQUFJLEtBQUssS0FBSyxDQUFDO1lBQUUsT0FBTyxjQUFjLENBQUM7UUFDdkMsSUFBSSxLQUFLLEtBQUssQ0FBQztZQUFFLE9BQU8scUJBQXFCLENBQUM7UUFDOUMsT0FBTyxXQUFXLEtBQUssYUFBYSxDQUFDO0lBQ3ZDLENBQUMsQ0FBQztJQUVGLGtFQUFrRTtJQUNsRSw4REFBOEQ7SUFDOUQsTUFBTSxZQUFZLEdBT2IsRUFBRSxDQUFDO0lBRVIsa0NBQWtDO0lBQ2xDLE1BQU0sU0FBUyxHQUFHLDJCQUEyQixDQUFDO0lBQzlDLElBQUksU0FBUyxDQUFDO0lBQ2QsT0FBTyxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDbEQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BDLElBQUksSUFBcUMsQ0FBQztRQUMxQyxJQUFJLFNBQWlCLENBQUM7UUFDdEIsSUFBSSxLQUF5QixDQUFDO1FBQzlCLElBQUksV0FBK0IsQ0FBQztRQUVwQyxnQ0FBZ0M7UUFDaEMsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQy9ELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3hDLEtBQUssR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFeEIsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLElBQUksR0FBRyxZQUFZLENBQUM7Z0JBQ3BCLFNBQVMsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNsRCxDQUFDO2lCQUFNLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxJQUFJLEdBQUcsTUFBTSxDQUFDO2dCQUNkLFNBQVMsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM1QyxDQUFDO2lCQUFNLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNsQyw4REFBOEQ7Z0JBQzlELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2xDLFdBQVcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDckMsSUFBSSxHQUFHLE9BQU8sQ0FBQztZQUNqQixDQUFDO2lCQUFNLENBQUM7Z0JBQ04saURBQWlEO2dCQUNqRCxJQUFJLEdBQUcsT0FBTyxDQUFDO2dCQUNmLFNBQVMsR0FBRyxRQUFRLENBQUM7WUFDdkIsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ04sa0JBQWtCO1lBQ2xCLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLEdBQUcsWUFBWSxDQUFDO2dCQUNwQixTQUFTLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLElBQUksR0FBRyxNQUFNLENBQUM7Z0JBQ2QsU0FBUyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNqQyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNqQyxXQUFXLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLEdBQUcsT0FBTyxDQUFDO1lBQ2pCLENBQUM7aUJBQU0sQ0FBQztnQkFDTixJQUFJLEdBQUcsT0FBTyxDQUFDO2dCQUNmLFNBQVMsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLENBQUM7UUFDSCxDQUFDO1FBRUQsWUFBWSxDQUFDLElBQUksQ0FBQztZQUNoQixLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNuQixJQUFJO1lBQ0osU0FBUztZQUNULEtBQUs7WUFDTCxXQUFXO1lBQ1gsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLO1NBQ3ZCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxnREFBZ0Q7SUFDaEQsTUFBTSxZQUFZLEdBQTJCLEVBQUUsQ0FBQztJQUVoRCx1REFBdUQ7SUFDdkQsb0NBQW9DO0lBQ3BDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUvQyw0Q0FBNEM7SUFDNUMsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdEIsTUFBTSxTQUFTLEdBQTZDLEVBQUUsQ0FBQztJQUUvRCwyQkFBMkI7SUFDM0IsTUFBTSxrQkFBa0IsR0FBYSxFQUFFLENBQUM7SUFDeEMsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUM7SUFDekMsSUFBSSxVQUFVLENBQUM7SUFDZixPQUFPLENBQUMsVUFBVSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUN4RCxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCx1RkFBdUY7SUFDdkYsS0FBSyxNQUFNLE9BQU8sSUFBSSxZQUFZLEVBQUUsQ0FBQztRQUNuQyw0Q0FBNEM7UUFDNUMsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUM3RSw2Q0FBNkM7UUFDN0MsTUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDbEYsTUFBTSxLQUFLLEdBQUcsV0FBVyxHQUFHLFlBQVksQ0FBQztRQUV6QyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNsQixZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUNwQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDakQsQ0FBQztJQUNILENBQUM7SUFFRCx5R0FBeUc7SUFDekcsTUFBTSxhQUFhLEdBQUcsQ0FBQyxRQUFnQixFQUFVLEVBQUU7UUFDakQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxJQUFBLCtCQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUMxQixDQUFDO1FBQ0QsMkRBQTJEO1FBQzNELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRSxPQUFPLElBQUksVUFBVSxJQUFJLFVBQVUsR0FBRyxDQUFDO0lBQ3pDLENBQUMsQ0FBQztJQUVGLHNIQUFzSDtJQUN0SCx5REFBeUQ7SUFDekQsa0ZBQWtGO0lBQ2xGLDJDQUEyQztJQUMzQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixzRUFBc0UsRUFDdEUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ3JCLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2QyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsUUFBUSxDQUFDO1FBQzlCLE9BQU8sb0JBQW9CLE1BQU0saUJBQWlCLE1BQU0sNkJBQTZCLE1BQU0sZUFBZSxNQUFNLDJCQUEyQixDQUFDO0lBQzlJLENBQUMsQ0FDRixDQUFDO0lBRUYsdUZBQXVGO0lBQ3ZGLHlEQUF5RDtJQUN6RCwyQ0FBMkM7SUFDM0MsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsMENBQTBDLEVBQzFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFO1FBQ2QsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sb0JBQW9CLE1BQU0saUJBQWlCLE1BQU0sNkJBQTZCLE1BQU0sZUFBZSxNQUFNLDJCQUEyQixDQUFDO0lBQzlJLENBQUMsQ0FDRixDQUFDO0lBRUYsdUdBQXVHO0lBQ3ZHLHFGQUFxRjtJQUNyRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiw2REFBNkQsRUFDN0QsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQztRQUNoQyxPQUFPLDJCQUEyQixJQUFJLDBCQUEwQixJQUFJLDZDQUE2QyxJQUFJLHdCQUF3QixJQUFJLG1DQUFtQyxDQUFDO0lBQ3ZMLENBQUMsQ0FDRixDQUFDO0lBRUYsd0RBQXdEO0lBQ3hELG9EQUFvRDtJQUNwRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixpQ0FBaUMsRUFDakMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDVixPQUFPLDJCQUEyQixJQUFJLDBCQUEwQixJQUFJLDZDQUE2QyxJQUFJLHdCQUF3QixJQUFJLG1DQUFtQyxDQUFDO0lBQ3ZMLENBQUMsQ0FDRixDQUFDO0lBRUYseUlBQXlJO0lBQ3pJLHNHQUFzRztJQUN0RyxxRkFBcUY7SUFDckYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsOERBQThELEVBQzlELENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLEVBQUU7UUFDeEMsNERBQTREO1FBQzVELElBQUksV0FBVyxLQUFLLFlBQVksSUFBSSxXQUFXLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDM0QsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBQ0Qsd0RBQXdEO1FBQ3hELGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUN0QyxPQUFPLDJCQUEyQixJQUFJLDBCQUEwQixJQUFJLDZDQUE2QyxJQUFJLHdCQUF3QixJQUFJLG1DQUFtQyxDQUFDO0lBQ3ZMLENBQUMsQ0FDRixDQUFDO0lBRUYsK0ZBQStGO0lBQy9GLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLGtDQUFrQyxFQUNsQyxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDM0IsNERBQTREO1FBQzVELElBQUksV0FBVyxLQUFLLFlBQVksSUFBSSxXQUFXLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDM0QsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBQ0Qsd0RBQXdEO1FBQ3hELE9BQU8sMkJBQTJCLElBQUksMEJBQTBCLElBQUksNkNBQTZDLElBQUksd0JBQXdCLElBQUksbUNBQW1DLENBQUM7SUFDdkwsQ0FBQyxDQUNGLENBQUM7SUFFRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0lBRXBFLHVHQUF1RztJQUN2Ryx5RkFBeUY7SUFFekYsNkVBQTZFO0lBQzdFLDJEQUEyRDtJQUMzRCxNQUFNLGFBQWEsR0FBRyxDQUFDLE9BQWUsRUFBVSxFQUFFO1FBQ2hELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM1RCxNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEMsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixPQUFPLElBQUksU0FBUyxLQUFLLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDM0QsQ0FBQztZQUNELE9BQU8sSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUN6QixDQUFDO2FBQU0sSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDdkMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDM0MsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hCLE9BQU8sVUFBVSxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ3JELENBQUM7WUFDRCxPQUFPLFVBQVUsS0FBSyxJQUFJLENBQUM7UUFDN0IsQ0FBQzthQUFNLENBQUM7WUFDTixnREFBZ0Q7WUFDaEQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakMsT0FBTyxhQUFhLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDakQsQ0FBQztnQkFDRCxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUMxQixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNqQyxPQUFPLFVBQVUsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUM5QyxDQUFDO1lBQ0gsQ0FBQztZQUNELFdBQVc7WUFDWCxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsT0FBTyxVQUFVLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDdkQsQ0FBQztZQUNELE9BQU8sVUFBVSxPQUFPLElBQUksQ0FBQztRQUMvQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsMkNBQTJDO0lBQzNDLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxJQUFZLEVBQWlCLEVBQUU7UUFDdkQsc0RBQXNEO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLEtBQUssR0FBRyxDQUFDO1FBQzlDLENBQUM7UUFDRCx1Q0FBdUM7UUFDdkMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1FBQzVFLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDO1lBQ2hDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxPQUFPLElBQUksUUFBUSxnQkFBZ0IsS0FBSyxHQUFHLENBQUM7UUFDOUMsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsb0VBQW9FO0lBQ3BFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDJFQUEyRSxFQUMzRSxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxFQUFFO1FBQ3hDLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxhQUFhLFlBQVksU0FBUyxTQUFTLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO1FBQ25HLENBQUM7UUFDRCxPQUFPLHdCQUF3QixTQUFTLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO0lBQ3pGLENBQUMsQ0FDRixDQUFDO0lBRUYsb0VBQW9FO0lBQ3BFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLHFEQUFxRCxFQUNyRCxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEVBQUU7UUFDM0IsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGFBQWEsWUFBWSxTQUFTLFNBQVMsaUJBQWlCLENBQUM7UUFDdEUsQ0FBQztRQUNELE9BQU8sd0JBQXdCLFNBQVMsaUJBQWlCLENBQUM7SUFDNUQsQ0FBQyxDQUNGLENBQUM7SUFFRixxRUFBcUU7SUFDckUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsbUZBQW1GLEVBQ25GLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLEVBQUU7UUFDNUMsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGVBQWUsWUFBWSxVQUFVLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7UUFDMUcsQ0FBQztRQUNELE9BQU8sdUJBQXVCLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7SUFDNUYsQ0FBQyxDQUNGLENBQUM7SUFFRix3RUFBd0U7SUFDeEUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsNkRBQTZELEVBQzdELENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsRUFBRTtRQUMvQixNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLE9BQU8sZUFBZSxZQUFZLFVBQVUsYUFBYSxpQkFBaUIsQ0FBQztRQUM3RSxDQUFDO1FBQ0QsT0FBTyx1QkFBdUIsYUFBYSxpQkFBaUIsQ0FBQztJQUMvRCxDQUFDLENBQ0YsQ0FBQztJQUVGLDBFQUEwRTtJQUMxRSwwRUFBMEU7SUFFMUUsOEVBQThFO0lBQzlFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLCtDQUErQyxFQUMvQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDakIsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sNEJBQTRCLFNBQVMsS0FBSyxLQUFLLGdCQUFnQixDQUFDO0lBQ3pFLENBQUMsQ0FDRixDQUFDO0lBRUYsZ0RBQWdEO0lBQ2hELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLCtDQUErQyxFQUMvQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDakIsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sNkJBQTZCLFNBQVMsS0FBSyxLQUFLLGdCQUFnQixDQUFDO0lBQzFFLENBQUMsQ0FDRixDQUFDO0lBRUYsaURBQWlEO0lBQ2pELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLGdEQUFnRCxFQUNoRCxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDakIsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sNkJBQTZCLFNBQVMsS0FBSyxLQUFLLGlCQUFpQixDQUFDO0lBQzNFLENBQUMsQ0FDRixDQUFDO0lBRUYsa0hBQWtIO0lBRWxILDZEQUE2RDtJQUM3RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwwQ0FBMEMsRUFDMUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUMvQiw0REFBNEQ7UUFDNUQsSUFBSSxLQUFLLEtBQUssWUFBWSxJQUFJLEtBQUssS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzFFLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELDREQUE0RDtRQUM1RCxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDaEUsT0FBTywyQkFBMkIsT0FBTyxLQUFLLE1BQU0sT0FBTyxNQUFNLGdCQUFnQixDQUFDO0lBQ3BGLENBQUMsQ0FDRixDQUFDO0lBRUYsMkNBQTJDO0lBQzNDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDBDQUEwQyxFQUMxQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQy9CLElBQUksS0FBSyxLQUFLLFlBQVksSUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxRSxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFDRCw0REFBNEQ7UUFDNUQsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ2hFLE9BQU8sNEJBQTRCLE9BQU8sS0FBSyxNQUFNLE9BQU8sTUFBTSxnQkFBZ0IsQ0FBQztJQUNyRixDQUFDLENBQ0YsQ0FBQztJQUVGLGdGQUFnRjtJQUNoRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwyQ0FBMkMsRUFDM0MsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUMvQixJQUFJLEtBQUssS0FBSyxZQUFZLElBQUksS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDMUUsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBQ0QsNERBQTREO1FBQzVELE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNoRSxPQUFPLDRCQUE0QixPQUFPLEtBQUssTUFBTSxPQUFPLE1BQU0sZ0JBQWdCLENBQUM7SUFDckYsQ0FBQyxDQUNGLENBQUM7SUFFRiw0RkFBNEY7SUFDNUYsNkVBQTZFO0lBQzdFLDBFQUEwRTtJQUUxRSxxREFBcUQ7SUFDckQsd0NBQXdDO0lBQ3hDLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUU7UUFDekQsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzdDLENBQUMsQ0FBQztJQUVGLHdEQUF3RDtJQUN4RCxLQUFLLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztRQUN4RCxvRkFBb0Y7UUFDcEYsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsS0FBSyx3QkFBd0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUMvQyxPQUFPLHFDQUFxQyxLQUFLLGVBQWUsQ0FBQztRQUNuRSxDQUFDLENBQUMsQ0FBQztRQUVILCtGQUErRjtRQUMvRixnRkFBZ0Y7UUFDaEYsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsS0FBSyx3QkFBd0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRTtZQUNuRCxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsRCxPQUFPLDRCQUE0QixTQUFTLFNBQVMsQ0FBQztRQUN4RCxDQUFDLENBQUMsQ0FBQztRQUVILHlGQUF5RjtRQUN6RixNQUFNLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxhQUFhLEtBQUssd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbkYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFO1lBQ2pELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDekMsTUFBTSxPQUFPLEdBQUcsUUFBUSxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUssS0FBSyxJQUFJLFFBQVEsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1lBQ3pHLE1BQU0sU0FBUyxHQUFHLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2xELE9BQU8sY0FBYyxPQUFPLFlBQVksU0FBUyxhQUFhLENBQUM7UUFDakUsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsdURBQXVEO0lBQ3ZELEtBQUssTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztRQUNsRCw2RUFBNkU7UUFDN0UsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsS0FBSyx3QkFBd0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUMvQyxPQUFPLGtDQUFrQyxLQUFLLGVBQWUsQ0FBQztRQUNoRSxDQUFDLENBQUMsQ0FBQztRQUVILCtFQUErRTtRQUMvRSwrRUFBK0U7UUFDL0UsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsS0FBSyx3QkFBd0IsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRTtZQUNuRCxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsRCxPQUFPLHlCQUF5QixTQUFTLFNBQVMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztRQUVILHlFQUF5RTtRQUN6RSxNQUFNLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxhQUFhLEtBQUssd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbkYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFO1lBQ2pELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDekMsTUFBTSxPQUFPLEdBQUcsUUFBUSxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUssS0FBSyxJQUFJLFFBQVEsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1lBQ3pHLE1BQU0sU0FBUyxHQUFHLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2xELE9BQU8sY0FBYyxPQUFPLFNBQVMsU0FBUyxhQUFhLENBQUM7UUFDOUQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsMkVBQTJFO0lBQzNFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDhCQUE4QixFQUM5Qiw0QkFBNEIsQ0FDN0IsQ0FBQztJQUVGLHlFQUF5RTtJQUN6RSw0Q0FBNEM7SUFDNUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsNkJBQTZCLEVBQzdCLDJDQUEyQyxDQUM1QyxDQUFDO0lBRUYsZ0VBQWdFO0lBQ2hFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDBCQUEwQixFQUMxQiw4QkFBOEIsQ0FDL0IsQ0FBQztJQUVGLDhEQUE4RDtJQUM5RCw0Q0FBNEM7SUFDNUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YseUJBQXlCLEVBQ3pCLDZDQUE2QyxDQUM5QyxDQUFDO0lBRUYsMEVBQTBFO0lBQzFFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDRDQUE0QyxFQUM1QyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRTtRQUNkLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLG9CQUFvQixTQUFTLFNBQVMsQ0FBQztRQUNoRCxDQUFDO1FBQ0QsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUUsT0FBTyxvQkFBb0IsU0FBUyxHQUFHLFlBQVksU0FBUyxDQUFDO0lBQy9ELENBQUMsQ0FDRixDQUFDO0lBRUYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUUxRCxxREFBcUQ7SUFDckQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsNEJBQTRCLEVBQzVCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsMkJBQTJCLEtBQUssV0FBVyxDQUMxRCxDQUFDO0lBRUYsMkVBQTJFO0lBQzNFLDhGQUE4RjtJQUM5RixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixnQ0FBZ0MsRUFDaEMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ3RCLHlEQUF5RDtRQUN6RCxJQUFJLEtBQUssS0FBSyxZQUFZLElBQUksS0FBSyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQy9DLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELDREQUE0RDtRQUM1RCxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDaEUsT0FBTyxvQkFBb0IsT0FBTyxLQUFLLEtBQUssV0FBVyxDQUFDO0lBQzFELENBQUMsQ0FDRixDQUFDO0lBRUYsdUZBQXVGO0lBQ3ZGLDRDQUE0QztJQUM1QyxNQUFNLGdCQUFnQixHQUFHLENBQUMsSUFBWSxFQUFpQixFQUFFO1FBQ3ZELHNEQUFzRDtRQUN0RCwyREFBMkQ7UUFDM0QsTUFBTSxRQUFRLEdBQUcsQ0FBQyxPQUFlLEVBQVUsRUFBRTtZQUMzQyxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUM1RCxNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hDLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDckIsT0FBTyxJQUFJLFNBQVMsS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUMzRCxDQUFDO2dCQUNELE9BQU8sSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUN6QixDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUN2QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDM0MsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3hCLE9BQU8sVUFBVSxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNyRCxDQUFDO2dCQUNELE9BQU8sVUFBVSxLQUFLLElBQUksQ0FBQztZQUM3QixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sMEVBQTBFO2dCQUMxRSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3JCLDRDQUE0QztvQkFDNUMsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO3dCQUNoQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNqQyxJQUFJLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7NEJBQ3pCLE9BQU8sYUFBYSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7d0JBQ2pELENBQUM7d0JBQ0QsT0FBTyxhQUFhLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO29CQUN2QyxDQUFDO29CQUNELDJDQUEyQztvQkFDM0MsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDMUIsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDakMsSUFBSSxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDOzRCQUN6QixPQUFPLFVBQVUsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO3dCQUM5QyxDQUFDO3dCQUNELE9BQU8sVUFBVSxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDcEMsQ0FBQztnQkFDSCxDQUFDO2dCQUNELHFEQUFxRDtnQkFDckQsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzFCLE9BQU8sVUFBVSxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUN2RCxDQUFDO2dCQUNELE9BQU8sVUFBVSxPQUFPLElBQUksQ0FBQztZQUMvQixDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBRUYsc0RBQXNEO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLEtBQUssR0FBRyxDQUFDO1FBQzlDLENBQUM7UUFFRCwwQ0FBMEM7UUFDMUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3hFLElBQUksVUFBVSxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsVUFBVSxDQUFDO1lBQ25DLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLFNBQVMsU0FBUyxDQUFDO1FBQ3hELENBQUM7UUFFRCx1Q0FBdUM7UUFDdkMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1FBQzVFLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDO1lBQ2hDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxPQUFPLElBQUksUUFBUSxnQkFBZ0IsS0FBSyxHQUFHLENBQUM7UUFDOUMsQ0FBQztRQUVELHVDQUF1QztRQUN2QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDcEUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxRQUFRLFlBQVksS0FBSyxFQUFFLENBQUM7UUFDekMsQ0FBQztRQUVELG9DQUFvQztRQUNwQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDcEUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxRQUFRLFlBQVksS0FBSyxFQUFFLENBQUM7UUFDekMsQ0FBQztRQUVELGlEQUFpRDtRQUNqRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEUsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxRQUFRLENBQUM7WUFDakMsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxRQUFRLGFBQWEsS0FBSyxFQUFFLENBQUM7UUFDMUMsQ0FBQztRQUVELDhDQUE4QztRQUM5QyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEUsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxRQUFRLENBQUM7WUFDakMsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxRQUFRLGFBQWEsS0FBSyxFQUFFLENBQUM7UUFDMUMsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsd0VBQXdFO0lBQ3hFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDJFQUEyRSxFQUMzRSxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxFQUFFO1FBQ3hDLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxhQUFhLFlBQVksU0FBUyxTQUFTLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO1FBQ25HLENBQUM7UUFDRCxPQUFPLHdCQUF3QixTQUFTLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO0lBQ3pGLENBQUMsQ0FDRixDQUFDO0lBRUYsd0VBQXdFO0lBQ3hFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLHFEQUFxRCxFQUNyRCxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEVBQUU7UUFDM0IsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGFBQWEsWUFBWSxTQUFTLFNBQVMsaUJBQWlCLENBQUM7UUFDdEUsQ0FBQztRQUNELE9BQU8sd0JBQXdCLFNBQVMsaUJBQWlCLENBQUM7SUFDNUQsQ0FBQyxDQUNGLENBQUM7SUFFRiw0RUFBNEU7SUFDNUUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsbUZBQW1GLEVBQ25GLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLEVBQUU7UUFDNUMsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGVBQWUsWUFBWSxVQUFVLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7UUFDMUcsQ0FBQztRQUNELE9BQU8sdUJBQXVCLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7SUFDNUYsQ0FBQyxDQUNGLENBQUM7SUFFRiw0RUFBNEU7SUFDNUUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsNkRBQTZELEVBQzdELENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsRUFBRTtRQUMvQixNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLE9BQU8sZUFBZSxZQUFZLFVBQVUsYUFBYSxpQkFBaUIsQ0FBQztRQUM3RSxDQUFDO1FBQ0QsT0FBTyx1QkFBdUIsYUFBYSxpQkFBaUIsQ0FBQztJQUMvRCxDQUFDLENBQ0YsQ0FBQztJQUVGLGtGQUFrRjtJQUNsRixzR0FBc0c7SUFDdEcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YscUNBQXFDLEVBQ3JDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFO1FBQ2QsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8scUJBQXFCLFNBQVMsU0FBUyxDQUFDO1FBQ2pELENBQUM7UUFDRCxnREFBZ0Q7UUFDaEQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUUsT0FBTyxxQkFBcUIsU0FBUyxHQUFHLFlBQVksU0FBUyxDQUFDO0lBQ2hFLENBQUMsQ0FDRixDQUFDO0lBRUYsbUZBQW1GO0lBQ25GLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBRXRELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBRXRELDBFQUEwRTtJQUMxRSxpRUFBaUU7SUFFakUsOERBQThEO0lBQzlELGdGQUFnRjtJQUNoRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixzQ0FBc0MsRUFDdEMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDVixNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUM1RCxPQUFPLHlCQUF5QixDQUFDO1FBQ25DLENBQUM7UUFDRCxPQUFPLDRCQUE0QixTQUFTLGFBQWEsQ0FBQztJQUM1RCxDQUFDLENBQ0YsQ0FBQztJQUVGLHNEQUFzRDtJQUN0RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixnQ0FBZ0MsRUFDaEMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDWCxPQUFPLGtDQUFrQyxLQUFLLGVBQWUsQ0FBQztJQUNoRSxDQUFDLENBQ0YsQ0FBQztJQUVGLCtEQUErRDtJQUMvRCxxRUFBcUU7SUFDckUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsaUNBQWlDLEVBQ2pDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUN0QixxRUFBcUU7UUFDckUsSUFBSSxLQUFLLEtBQUssWUFBWSxJQUFJLEtBQUssS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUMvQyxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFDRCw0REFBNEQ7UUFDNUQsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ2hFLE9BQU8sMkJBQTJCLE9BQU8sS0FBSyxLQUFLLGVBQWUsQ0FBQztJQUNyRSxDQUFDLENBQ0YsQ0FBQztJQUVGLHlEQUF5RDtJQUN6RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZix5QkFBeUIsRUFDekIsd0RBQXdELENBQ3pELENBQUM7SUFFRix3REFBd0Q7SUFDeEQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YscUJBQXFCLEVBQ3JCLG9EQUFvRCxDQUNyRCxDQUFDO0lBRUYsa0RBQWtEO0lBQ2xELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLG1DQUFtQyxFQUNuQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxPQUFPLEdBQUcsTUFBTSxLQUFLLEtBQUssSUFBSSxNQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1FBQ25HLE9BQU8sY0FBYyxPQUFPLFdBQVcsTUFBTSxPQUFPLE1BQU0sZUFBZSxDQUFDO0lBQzVFLENBQUMsQ0FDRixDQUFDO0lBRUYsa0NBQWtDO0lBQ2xDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDRCQUE0QixFQUM1QixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNYLE1BQU0sT0FBTyxHQUFHLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUNoRyxPQUFPLGNBQWMsT0FBTyxXQUFXLEtBQUssZUFBZSxDQUFDO0lBQzlELENBQUMsQ0FDRixDQUFDO0lBRUYsa0ZBQWtGO0lBQ2xGLHlGQUF5RjtJQUN6RixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixxQ0FBcUMsRUFDckMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUU7UUFDZCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLE9BQU8sR0FBRyxRQUFRLEtBQUssS0FBSyxJQUFJLFFBQVEsS0FBSyxLQUFLLElBQUksUUFBUSxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7UUFFekcsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sY0FBYyxPQUFPLEtBQUssU0FBUyxhQUFhLENBQUM7UUFDMUQsQ0FBQztRQUNELGdEQUFnRDtRQUNoRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQVMsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1RSxPQUFPLGNBQWMsT0FBTyxLQUFLLFNBQVMsR0FBRyxZQUFZLGFBQWEsQ0FBQztJQUN6RSxDQUFDLENBQ0YsQ0FBQztJQUVGLHFGQUFxRjtJQUNyRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwrQkFBK0IsRUFDL0IsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2hCLHlDQUF5QztRQUN6QyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7WUFBRSxPQUFPLEtBQUssR0FBRyxJQUFJLEtBQUssSUFBSSxDQUFDO1FBQzNFLE1BQU0sT0FBTyxHQUFHLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJLEtBQUssS0FBSyxPQUFPLENBQUMsQ0FBQztZQUMzRixDQUFDLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7UUFDakcsNERBQTREO1FBQzVELE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUM5RCxPQUFPLGNBQWMsT0FBTyxJQUFJLE9BQU8sS0FBSyxLQUFLLGVBQWUsQ0FBQztJQUNuRSxDQUFDLENBQ0YsQ0FBQztJQUVGLDhEQUE4RDtJQUM5RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixnREFBZ0QsRUFDaEQsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLDZCQUE2QixTQUFTLEtBQUssS0FBSyxpQkFBaUIsQ0FBQztJQUMzRSxDQUFDLENBQ0YsQ0FBQztJQUVGLDZDQUE2QztJQUM3QyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZix5Q0FBeUMsRUFDekMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDVixNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsT0FBTyw2QkFBNkIsU0FBUyxlQUFlLENBQUM7SUFDL0QsQ0FBQyxDQUNGLENBQUM7SUFFRix1RUFBdUU7SUFDdkUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsMkJBQTJCLEVBQzNCLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ1YsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztZQUFFLE9BQU8sU0FBUyxJQUFJLEdBQUcsQ0FBQztRQUNwRCxtQ0FBbUM7UUFDbkMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZCxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsU0FBUyxDQUFDO1lBQ3JDLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1gsT0FBTyxtQ0FBbUMsTUFBTSxPQUFPLE1BQU0saUJBQWlCLENBQUM7WUFDakYsQ0FBQztZQUNELE9BQU8sbUNBQW1DLE1BQU0saUJBQWlCLENBQUM7UUFDcEUsQ0FBQztRQUNELE9BQU8sb0ZBQW9GLENBQUM7SUFDOUYsQ0FBQyxDQUNGLENBQUM7SUFFRiw2REFBNkQ7SUFDN0QsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDNUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRXRDLE9BQU8sR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ3BCLENBQUMsQ0FBQztBQThrQkEsMENBQWU7QUE1a0JqQjs7R0FFRztBQUNILE1BQU0sMkJBQTJCLEdBQUcsQ0FBQyxVQUEyQyxFQUFFLGdCQUFnQyxFQUFVLEVBQUU7SUFDNUgsTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO0lBQ2pDLE1BQU0sbUJBQW1CLEdBQWEsRUFBRSxDQUFDO0lBRXpDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDekQsc0ZBQXNGO1FBQ3RGLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxVQUFVLElBQUksR0FBRyxLQUFLLGdCQUFnQjtZQUFFLFNBQVM7UUFDdkUsOEVBQThFO1FBQzlFLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxZQUFZO1lBQUUsU0FBUztRQUU3QyxNQUFNLFFBQVEsR0FBRyxJQUFBLCtCQUFXLEVBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbEQsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLFFBQVEseUJBQXlCLFFBQVEsc0JBQXNCLFFBQVEsUUFBUSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1FBRXJILElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUM5QixtQkFBbUIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLFFBQVE7ZUFDekMsUUFBUSxzQkFBc0IsUUFBUSwyRUFBMkUsUUFBUTtPQUNqSSxRQUFROztlQUVBLFFBQVEsdUJBQXVCLFFBQVE7T0FDL0MsUUFBUSw4RUFBOEUsUUFBUTs7RUFFbkcsQ0FBQyxDQUFDO1FBQ0EsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLENBQUMsR0FBRyxXQUFXLEVBQUUsR0FBRyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM3RCxDQUFDLENBQUM7QUFnakJBLGtFQUEyQjtBQTlpQjdCOzs7R0FHRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxRQUFnQixFQUFFLFdBQW1CLEVBQVUsRUFBRTtJQUM3RSxnRUFBZ0U7SUFDaEUsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFakQsNEVBQTRFO0lBQzVFLCtDQUErQztJQUMvQyxPQUFPLDZEQUE2RCxTQUFTO0VBQzdFLFFBQVE7T0FDSCxDQUFDO0FBQ1IsQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLGlCQUFpQixHQUFHLENBQUMsT0FBMEMsRUFBVSxFQUFFO0lBQy9FLE1BQU0sT0FBTyxHQUFhLEVBQUUsQ0FBQztJQUU3QixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ25ELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDOUIsd0JBQXdCO1lBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFHLFNBQVMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUM3QyxDQUFDO2FBQU0sSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ25ELGtCQUFrQjtZQUNsQixRQUFRLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbkIsS0FBSyxRQUFRO29CQUNYLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFHLHlDQUEwQyxLQUFhLENBQUMsS0FBSyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ2pHLE1BQU07Z0JBQ1IsS0FBSyxRQUFRO29CQUNYLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFHLDJCQUEyQixDQUFDLENBQUM7b0JBQ3JELE1BQU07Z0JBQ1IsS0FBSyxNQUFNO29CQUNULE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFHLHFDQUFzQyxLQUFhLENBQUMsR0FBRyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzNGLE1BQU07Z0JBQ1IsS0FBSyxVQUFVO29CQUNiLE1BQU0sUUFBUSxHQUFHLEtBQWdFLENBQUM7b0JBQ2xGLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFHLDhDQUE4QyxRQUFRLENBQUMsUUFBUSxtQkFBbUIsUUFBUSxDQUFDLE1BQU0sSUFBSSxPQUFPLElBQUksQ0FBQyxDQUFDO29CQUMxSSxNQUFNO2dCQUNSLEtBQUssUUFBUTtvQkFDWCxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsR0FBRyw0Q0FBNkMsS0FBYSxDQUFDLFFBQVEsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUN2RyxNQUFNO1lBQ1YsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztBQUMxQyxDQUFDLENBQUM7QUFFRjs7O0dBR0c7QUFDSCxNQUFNLHFCQUFxQixHQUFHLENBQzVCLFFBQWdCLEVBQ2hCLGtCQUEwQixFQUNsQixFQUFFO0lBQ1YsT0FBTzs7S0FFSixrQkFBa0I7S0FDbEIsUUFBUSxzQ0FBc0MsUUFBUTtTQUNsRCxRQUFRO09BQ1Ysa0JBQWtCLGtFQUFrRSxXQUFXLFFBQVEsRUFBRTtJQUM1RyxDQUFDO0FBQ0wsQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLGdCQUFnQixHQUFHLENBQUMsUUFBZ0IsRUFBVSxFQUFFO0lBQ3BELE1BQU0sUUFBUSxHQUFHLFdBQVcsUUFBUSxFQUFFLENBQUM7SUFDdkMsT0FBTzs7NkJBRW9CLFFBQVEsOEJBQThCLFFBQVEsV0FBVyxDQUFDO0FBQ3ZGLENBQUMsQ0FBQztBQUVGOzs7Ozs7R0FNRztBQUNILE1BQU0sZUFBZSxHQUFHLENBQ3RCLGNBQTJELEVBQzNELGNBQXdCLEVBQ1QsRUFBRTtJQUNqQixJQUFJLENBQUMsY0FBYztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBRWpDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFFNUMsc0VBQXNFO0lBQ3RFLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUVoRSxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFDM0IsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztRQUN6RCxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUM5QyxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFELE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztZQUN6QixJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO2dCQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUM5RSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO2dCQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUM1RSxJQUFJLEdBQUcsQ0FBQyxNQUFNO2dCQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLFNBQVMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEUsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3JELE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztZQUN6QixLQUFLLE1BQU0sTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xELElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO29CQUNwQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksTUFBTSxpQkFBaUIsTUFBTSxJQUFJLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztZQUNILENBQUM7WUFDRCxJQUFJLEdBQUcsQ0FBQyxNQUFNO2dCQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLFNBQVMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEUsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3BDLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDakMsQ0FBQyxDQUFDO0FBNmJBLDBDQUFlO0FBM2JqQjs7O0dBR0c7QUFDSCxNQUFNLGNBQWMsR0FBRyxDQUNyQixjQUEyRCxFQUMzRCxjQUF3QixFQUNULEVBQUU7SUFDakIsSUFBSSxDQUFDLGNBQWM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUVqQyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQzVDLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUVoRSxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFDM0IsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztRQUN6RCxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxVQUFVLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDcEMsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUMxRCxNQUFNLEdBQUcsR0FBYSxFQUFFLENBQUM7WUFDekIsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztnQkFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDcEUsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztnQkFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ2hFLElBQUksR0FBRyxDQUFDLE1BQU07Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5RCxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckQsTUFBTSxHQUFHLEdBQWEsRUFBRSxDQUFDO1lBQ3pCLEtBQUssTUFBTSxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDbEQsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQ3BDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLFVBQVUsTUFBTSxFQUFFLENBQUMsQ0FBQztnQkFDeEMsQ0FBQztZQUNILENBQUM7WUFDRCxJQUFJLEdBQUcsQ0FBQyxNQUFNO2dCQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUQsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3BDLE9BQU8sTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7QUFDckMsQ0FBQyxDQUFDO0FBeVpBLHdDQUFjO0FBdlpoQjs7O0dBR0c7QUFDSCxNQUFNLGtDQUFrQyxHQUFHLENBQ3pDLFNBQWlCLEVBQ2pCLFFBQWdCLEVBQ2hCLGNBQWdELEVBQ3hDLEVBQUU7SUFDVixNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsY0FBYyxFQUFFLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEUsTUFBTSxXQUFXLEdBQUcsV0FBVztRQUM3QixDQUFDLENBQUM7T0FDQyxRQUFRLDJDQUEyQyxXQUFXLGVBQWU7UUFDaEYsQ0FBQyxDQUFDLElBQUksUUFBUSxvQ0FBb0MsQ0FBQztJQUVyRCxPQUFPO29CQUNXLFNBQVM7R0FDMUIsUUFBUSwwQkFBMEIsUUFBUTtHQUMxQyxRQUFRO09BQ0osUUFBUTs7Ozs7Ozs7OztNQVVULFdBQVc7OztDQUdoQixDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBa1hBLGdGQUFrQztBQWhYcEM7O0dBRUc7QUFDSCxNQUFNLCtCQUErQixHQUFHLENBQ3RDLFNBQWlCLEVBQ2pCLFFBQWdCLEVBQ2hCLE1BQTJCLEVBQzNCLGNBQWdELEVBQ3hDLEVBQUU7SUFDVixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3ZDLE1BQU0sZUFBZSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxDQUFDO0lBQzNELE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFFOUUseURBQXlEO0lBQ3pELElBQUksY0FBc0IsQ0FBQztJQUMzQixJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2hCLGNBQWMsR0FBRztXQUNWLFFBQVEsUUFBUSxXQUFXLEdBQUcsQ0FBQztJQUN4QyxDQUFDO1NBQU0sQ0FBQztRQUNOLGNBQWMsR0FBRyxZQUFZLFFBQVE7Ozs7V0FJOUIsQ0FBQztJQUNWLENBQUM7SUFFRCxPQUFPO29CQUNXLFNBQVM7R0FDMUIsUUFBUSwyQkFBMkIsUUFBUTtHQUMzQyxRQUFRLDJCQUEyQixRQUFRLGtCQUFrQixlQUFlO0dBQzVFLFFBQVEsMkJBQTJCLFFBQVE7R0FDM0MsUUFBUTtPQUNKLFFBQVE7U0FDTixRQUFRO09BQ1YsUUFBUSxtQkFBbUIsUUFBUTs7Z0RBRU0sUUFBUSwwQkFBMEIsUUFBUTs7O0VBR3hGLGNBQWM7Ozs7O0NBS2YsQ0FBQztBQUNGLENBQUMsQ0FBQztBQW9VQSwwRUFBK0I7QUFsVWpDOzs7R0FHRztBQUNILE1BQU0saUNBQWlDLEdBQUcsQ0FDeEMsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsTUFBNkIsRUFDN0IsY0FBZ0QsRUFDeEMsRUFBRTtJQUNWLE1BQU0sYUFBYSxHQUFHLElBQUEsK0JBQVcsRUFBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDekQsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLGNBQWMsRUFBRSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUVoRixNQUFNLFdBQVcsR0FBRyxXQUFXO1FBQzdCLENBQUMsQ0FBQywrQ0FBK0MsYUFBYSxxQ0FBcUMsYUFBYTtPQUM3RyxRQUFRLDJDQUEyQyxXQUFXLGVBQWU7UUFDaEYsQ0FBQyxDQUFDLElBQUksUUFBUSx5Q0FBeUMsYUFBYSxxQ0FBcUMsYUFBYSxLQUFLLENBQUM7SUFFOUgsT0FBTztvQkFDVyxTQUFTLGdDQUFnQyxNQUFNLENBQUMsY0FBYztHQUMvRSxRQUFRLDBCQUEwQixRQUFRO0dBQzFDLFFBQVE7T0FDSixRQUFROzs7Ozs7Ozs7O2dCQVVDLGFBQWEsMkJBQTJCLGFBQWEsc0NBQXNDLGFBQWE7TUFDbEgsV0FBVzs7O0NBR2hCLENBQUM7QUFDRixDQUFDLENBQUM7QUE4UkEsOEVBQWlDO0FBNVJuQzs7O0dBR0c7QUFDSCxNQUFNLDhCQUE4QixHQUFHLENBQ3JDLFNBQWlCLEVBQ2pCLFFBQWdCLEVBQ2hCLE1BQTBCLEVBQ2xCLEVBQUU7SUFDVixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsWUFBWTtRQUNwQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQztRQUN4QyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBRVQsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLGFBQWEsS0FBSyxPQUFPLENBQUM7SUFDckQsTUFBTSxhQUFhLEdBQUcsV0FBVyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO0lBQ3pELE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFVBQVUsRUFBRSxZQUFZLElBQUksWUFBWSxDQUFDO0lBRTNFLDZDQUE2QztJQUM3QyxNQUFNLFlBQVksR0FBRzs7Ozs7Ozs7O0lBU25CLENBQUM7SUFFSCw2REFBNkQ7SUFDN0QsTUFBTSxlQUFlLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ3hFLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMsc0NBQXNDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUM3RSxNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDakcsdUVBQXVFO0lBQ3ZFLE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxrQkFBa0IsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFN0UsSUFBSSxNQUFNLENBQUMsVUFBVSxLQUFLLFVBQVUsRUFBRSxDQUFDO1FBQ3JDLHFEQUFxRDtRQUNyRCxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsWUFBWSxJQUFJLDBCQUEwQixTQUFTLFdBQVcsQ0FBQztRQUUzRixJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2hCLG9EQUFvRDtZQUNwRCxPQUFPO29CQUNPLFNBQVM7R0FDMUIsUUFBUSwwQkFBMEIsUUFBUTtHQUMxQyxRQUFRLGVBQWUsY0FBYzs7T0FFakMsUUFBUTs7K0JBRWdCLFFBQVEscUJBQXFCLGVBQWU7Ozs7dURBSXBCLE1BQU0sQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNOzJEQUNuRCxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUM7OztvQ0FHM0MsUUFBUTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQXNCdkMsUUFBUSwwQkFBMEIsZUFBZTs7O3dEQUdFLFFBQVE7Q0FDL0QsQ0FBQztRQUNFLENBQUM7YUFBTSxDQUFDO1lBQ04sK0NBQStDO1lBQy9DLE9BQU87b0JBQ08sU0FBUztHQUMxQixRQUFRLDBCQUEwQixRQUFRO0dBQzFDLFFBQVEsZUFBZSxjQUFjOztPQUVqQyxRQUFRO21DQUNvQixRQUFROzs7Ozs7OztTQVFsQyxRQUFROzs7Ozs7Ozs7O3dEQVV1QyxRQUFRO0NBQy9ELENBQUM7UUFDRSxDQUFDO0lBQ0gsQ0FBQztTQUFNLENBQUM7UUFDTixnREFBZ0Q7UUFDaEQsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQix3Q0FBd0M7WUFDeEMsT0FBTztvQkFDTyxTQUFTO0dBQzFCLFFBQVEsMEJBQTBCLFFBQVEsdUJBQXVCLGNBQWM7O09BRTNFLFFBQVE7OytCQUVnQixRQUFRO2tDQUNMLFFBQVEscUJBQXFCLFVBQVU7RUFDdkUsWUFBWSxHQUFHLGVBQWU7Ozs7dURBSXVCLE1BQU0sQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNOzJEQUNuRCxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUM7OztvQ0FHM0MsUUFBUTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0tBd0J2QyxRQUFROzs7U0FHSixRQUFROzs7O21DQUlrQixRQUFROztnQkFFM0IsUUFBUTtTQUNmLFFBQVE7O0tBRVosZUFBZTs7OzZCQUdTLFFBQVE7Q0FDcEMsQ0FBQztRQUNFLENBQUM7YUFBTSxDQUFDO1lBQ04sdUNBQXVDO1lBQ3ZDLE9BQU87b0JBQ08sU0FBUztHQUMxQixRQUFRLDBCQUEwQixRQUFRLHVCQUF1QixjQUFjOztPQUUzRSxRQUFRO21DQUNvQixRQUFRO2tDQUNULFFBQVEscUJBQXFCLFVBQVU7RUFDdkUsWUFBWTs7O09BR1AsUUFBUTs7T0FFUixRQUFROzttQ0FFb0IsUUFBUTs7Z0JBRTNCLFFBQVE7U0FDZixRQUFROzs7OzZCQUlZLFFBQVE7Q0FDcEMsQ0FBQztRQUNFLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBZ0ZBLHdFQUE4QjtBQTlFaEM7Ozs7R0FJRztBQUNILE1BQU0saUJBQWlCLEdBQUcsQ0FDeEIsU0FBMkIsRUFDM0IsbUJBQStILEVBQy9ILGdCQUFnQyxFQUN4QixFQUFFO0lBQ1Ysa0VBQWtFO0lBQ2xFLG1FQUFtRTtJQUNuRSxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3hDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUNyQixhQUFhLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDcEMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFBLCtCQUFXLEVBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxNQUFNLG1CQUFtQixHQUFHLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUNoRyxNQUFNLGlCQUFpQixHQUFHLHlCQUF5QixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwRSxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMscUJBQXFCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsQ0FBQyxVQUFVLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFFaEgseUNBQXlDO0lBQ3pDLE1BQU0sdUJBQXVCLEdBQWEsRUFBRSxDQUFDO0lBQzdDLElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUN4QixLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDdEUsTUFBTSxRQUFRLEdBQUcsSUFBQSwrQkFBVyxFQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEQsTUFBTSxTQUFTLEdBQUcsU0FBUyxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUM7WUFDL0MsSUFBSSxJQUFBLDJCQUFtQixFQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ2hDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbkcsQ0FBQztpQkFBTSxJQUFJLElBQUEsd0JBQWdCLEVBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDcEMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLCtCQUErQixDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDeEcsQ0FBQztpQkFBTSxJQUFJLElBQUEsMEJBQWtCLEVBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDdEMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDMUcsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLHVCQUF1QixDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDNUYsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBQ0QsTUFBTSxnQkFBZ0IsR0FBRyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFNUQsNkRBQTZEO0lBQzdELE1BQU0sZUFBZSxHQUFHLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFeEUsT0FBTzs7K0JBRXNCLFNBQVMsQ0FBQyxLQUFLOzs7Ozs7Ozs7Ozs7Ozs7OztFQWlCNUMsbUJBQW1CO0VBQ25CLGdCQUFnQjtFQUNoQixpQkFBaUI7O0VBRWpCLGVBQWU7Q0FDaEIsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdBLDhDQUFpQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIHJlbmRlci5waHAgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xuICogQ29udmVydHMgSGFuZGxlYmFycyB0ZW1wbGF0ZXMgdG8gUEhQXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRNYXBwaW5nVmFsdWUsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGdldEJ1dHRvbkRlZmF1bHQgfSBmcm9tICcuL2J1dHRvbi1zY2hlbWEnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4JztcblxuLyoqXG4gKiBDb252ZXJ0IEpTIGFycmF5L29iamVjdCB0byBQSFAgYXJyYXkgc3ludGF4XG4gKi9cbmNvbnN0IGFycmF5VG9QaHAgPSAodmFsdWU6IGFueSk6IHN0cmluZyA9PiB7XG4gIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuICdudWxsJztcbiAgfVxuICBcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgY29uc3QgaXRlbXMgPSB2YWx1ZS5tYXAodiA9PiBhcnJheVRvUGhwKHYpKS5qb2luKCcsICcpO1xuICAgIHJldHVybiBgWyR7aXRlbXN9XWA7XG4gIH1cbiAgXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3QgcGFpcnMgPSBPYmplY3QuZW50cmllcyh2YWx1ZSlcbiAgICAgIC5tYXAoKFtrLCB2XSkgPT4gYCcke2t9JyA9PiAke2FycmF5VG9QaHAodil9YClcbiAgICAgIC5qb2luKCcsICcpO1xuICAgIHJldHVybiBgWyR7cGFpcnN9XWA7XG4gIH1cbiAgXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGAnJHt2YWx1ZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gIH1cbiAgXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHJldHVybiB2YWx1ZSA/ICd0cnVlJyA6ICdmYWxzZSc7XG4gIH1cbiAgXG4gIHJldHVybiBTdHJpbmcodmFsdWUpO1xufTtcblxuLyoqXG4gKiBHZXQgUEhQIGRlZmF1bHQgdmFsdWUgZm9yIGEgcHJvcGVydHlcbiAqL1xuY29uc3QgZ2V0UGhwRGVmYXVsdFZhbHVlID0gKHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpOiBzdHJpbmcgPT4ge1xuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0JzpcbiAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgIHJldHVybiBgJyR7U3RyaW5nKHByb3BlcnR5LmRlZmF1bHQgPz8gJycpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nYDtcbiAgICBcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIFN0cmluZyhwcm9wZXJ0eS5kZWZhdWx0ID8/IDApO1xuICAgIFxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHByb3BlcnR5LmRlZmF1bHQgPyAndHJ1ZScgOiAnZmFsc2UnO1xuICAgIFxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIHJldHVybiBcIlsnc3JjJyA9PiAnJywgJ2FsdCcgPT4gJyddXCI7XG5cbiAgICBjYXNlICd2aWRlbyc6XG4gICAgICBpZiAocHJvcGVydHkuZGVmYXVsdCAmJiB0eXBlb2YgcHJvcGVydHkuZGVmYXVsdCA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocHJvcGVydHkuZGVmYXVsdCkpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAoe1xuICAgICAgICAgIHNyYzogJycsXG4gICAgICAgICAgaWQ6ICcnLFxuICAgICAgICAgIHBvc3RlcjogJycsXG4gICAgICAgICAgdHlwZTogJycsXG4gICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgIG1pbWU6ICcnLFxuICAgICAgICAgIG1pbWVUeXBlOiAnJyxcbiAgICAgICAgICAuLi5wcm9wZXJ0eS5kZWZhdWx0LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgcHJvcGVydHkuZGVmYXVsdCA9PT0gJ3N0cmluZycgJiYgcHJvcGVydHkuZGVmYXVsdCkge1xuICAgICAgICByZXR1cm4gYXJyYXlUb1BocCh7XG4gICAgICAgICAgc3JjOiBwcm9wZXJ0eS5kZWZhdWx0LFxuICAgICAgICAgIGlkOiAnJyxcbiAgICAgICAgICBwb3N0ZXI6ICcnLFxuICAgICAgICAgIHR5cGU6ICcnLFxuICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICBtaW1lOiAnJyxcbiAgICAgICAgICBtaW1lVHlwZTogJycsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiWydzcmMnID0+ICcnLCAnaWQnID0+ICcnLCAncG9zdGVyJyA9PiAnJywgJ3R5cGUnID0+ICcnLCAnd2lkdGgnID0+IDAsICdoZWlnaHQnID0+IDAsICdtaW1lJyA9PiAnJywgJ21pbWVUeXBlJyA9PiAnJ11cIjtcbiAgICBcbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIHJldHVybiBcIlsnbGFiZWwnID0+ICcnLCAndXJsJyA9PiAnJywgJ29wZW5zSW5OZXdUYWInID0+IGZhbHNlXVwiO1xuICAgIFxuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICByZXR1cm4gYXJyYXlUb1BocChnZXRCdXR0b25EZWZhdWx0KHByb3BlcnR5KSk7XG4gICAgXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5kZWZhdWx0KSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHByb3BlcnR5LmRlZmF1bHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuICdbXSc7XG4gICAgXG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQgfHwgcHJvcGVydHkuaXRlbXM/LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAocHJvcGVydHkuZGVmYXVsdCB8fCBwcm9wZXJ0eS5pdGVtcz8uZGVmYXVsdCB8fCBbXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ1tdJztcbiAgICBcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiJydcIjtcbiAgfVxufTtcblxuY29uc3QgdG9QaHBTaW5nbGVRdW90ZWRTdHJpbmcgPSAodmFsdWU6IHN0cmluZyk6IHN0cmluZyA9PlxuICBgJyR7dmFsdWUucmVwbGFjZSgvXFxcXC9nLCBcIlxcXFxcXFxcXCIpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nYDtcblxuY29uc3QgaGFuZGxlYmFyc1ZhbHVlVG9QaHBFeHByZXNzaW9uID0gKHRlbXBsYXRlVmFsdWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHRva2VuUmVnZXggPSAvXFx7XFx7XFx7P1xccyooW159XSs/KVxccypcXH1cXH1cXH0/L2c7XG4gIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBsZXQgY3Vyc29yID0gMDtcbiAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gIGNvbnN0IHB1c2hMaXRlcmFsID0gKGxpdGVyYWw6IHN0cmluZykgPT4ge1xuICAgIGlmIChsaXRlcmFsKSB7XG4gICAgICBwYXJ0cy5wdXNoKHRvUGhwU2luZ2xlUXVvdGVkU3RyaW5nKGxpdGVyYWwpKTtcbiAgICB9XG4gIH07XG5cbiAgd2hpbGUgKChtYXRjaCA9IHRva2VuUmVnZXguZXhlYyh0ZW1wbGF0ZVZhbHVlKSkgIT09IG51bGwpIHtcbiAgICBwdXNoTGl0ZXJhbCh0ZW1wbGF0ZVZhbHVlLnNsaWNlKGN1cnNvciwgbWF0Y2guaW5kZXgpKTtcblxuICAgIGNvbnN0IGV4cHJlc3Npb24gPSBtYXRjaFsxXS50cmltKCkucmVwbGFjZSgvXkByb290XFwuLywgJycpO1xuICAgIGlmIChleHByZXNzaW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhdGggPSBleHByZXNzaW9uLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXRoWzBdKTtcbiAgICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXJ0cy5wdXNoKGAoJCR7Y2FtZWxQcm9wfSA/PyAnJylgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZEFjY2VzcyA9IHBhdGhcbiAgICAgICAgICAuc2xpY2UoMSlcbiAgICAgICAgICAubWFwKChzZWdtZW50KSA9PiBgWycke3NlZ21lbnR9J11gKVxuICAgICAgICAgIC5qb2luKCcnKTtcbiAgICAgICAgcGFydHMucHVzaChgKCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30gPz8gJycpYCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcnRzLnB1c2goYCcnYCk7XG4gICAgfVxuXG4gICAgY3Vyc29yID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG4gIH1cblxuICBwdXNoTGl0ZXJhbCh0ZW1wbGF0ZVZhbHVlLnNsaWNlKGN1cnNvcikpO1xuXG4gIHJldHVybiBwYXJ0cy5sZW5ndGggPiAwID8gcGFydHMuam9pbignIC4gJykgOiBcIicnXCI7XG59O1xuXG50eXBlIFdpc3RpYUFzc2V0ID0ge1xuICBlbXB0eUNoZWNrRXhwcmVzc2lvbjogc3RyaW5nO1xuICB1cmxFeHByZXNzaW9uOiBzdHJpbmc7XG59O1xuXG5jb25zdCBidWlsZFdpc3RpYUFzc2V0ID0gKG1lZGlhU291cmNlOiBzdHJpbmcpOiBXaXN0aWFBc3NldCA9PiB7XG4gIGNvbnN0IHdpc3RpYVByZWZpeCA9ICdodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvJztcbiAgY29uc3Qgd2lzdGlhU3VmZml4ID0gJy5qc29ucCc7XG5cbiAgaWYgKG1lZGlhU291cmNlLnN0YXJ0c1dpdGgod2lzdGlhUHJlZml4KSAmJiBtZWRpYVNvdXJjZS5lbmRzV2l0aCh3aXN0aWFTdWZmaXgpKSB7XG4gICAgY29uc3QgbWVkaWFJZFRlbXBsYXRlID0gbWVkaWFTb3VyY2Uuc2xpY2Uod2lzdGlhUHJlZml4Lmxlbmd0aCwgLXdpc3RpYVN1ZmZpeC5sZW5ndGgpO1xuICAgIGNvbnN0IG1lZGlhSWRFeHByZXNzaW9uID0gaGFuZGxlYmFyc1ZhbHVlVG9QaHBFeHByZXNzaW9uKG1lZGlhSWRUZW1wbGF0ZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZW1wdHlDaGVja0V4cHJlc3Npb246IG1lZGlhSWRFeHByZXNzaW9uLFxuICAgICAgdXJsRXhwcmVzc2lvbjogYCcke3dpc3RpYVByZWZpeH0nIC4gJHttZWRpYUlkRXhwcmVzc2lvbn0gLiAnJHt3aXN0aWFTdWZmaXh9J2AsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHVybEV4cHJlc3Npb24gPSBoYW5kbGViYXJzVmFsdWVUb1BocEV4cHJlc3Npb24obWVkaWFTb3VyY2UpO1xuICByZXR1cm4ge1xuICAgIGVtcHR5Q2hlY2tFeHByZXNzaW9uOiB1cmxFeHByZXNzaW9uLFxuICAgIHVybEV4cHJlc3Npb24sXG4gIH07XG59O1xuXG5jb25zdCBnZW5lcmF0ZVdpc3RpYUVucXVldWVDb2RlID0gKHRlbXBsYXRlOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhc3NldHMgPSBuZXcgTWFwPHN0cmluZywgV2lzdGlhQXNzZXQ+KCk7XG4gIGxldCBoYXNXaXN0aWFFbWJlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IGFkZEFzc2V0ID0gKGFzc2V0OiBXaXN0aWFBc3NldCkgPT4ge1xuICAgIGNvbnN0IGtleSA9IGAke2Fzc2V0LmVtcHR5Q2hlY2tFeHByZXNzaW9ufTo6JHthc3NldC51cmxFeHByZXNzaW9ufWA7XG4gICAgaWYgKCFhc3NldHMuaGFzKGtleSkpIHtcbiAgICAgIGFzc2V0cy5zZXQoa2V5LCBhc3NldCk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRbXj5dK3NyYz1bXCInXShbXlwiJ10rKVtcIiddW14+XSo+XFxzKjxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgc2NyaXB0TWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgd2hpbGUgKChzY3JpcHRNYXRjaCA9IHNjcmlwdFJlZ2V4LmV4ZWModGVtcGxhdGUpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHNyYyA9IHNjcmlwdE1hdGNoWzFdLnRyaW0oKTtcblxuICAgIGlmICgvZmFzdFxcLndpc3RpYVxcLmNvbVxcL2Fzc2V0c1xcL2V4dGVybmFsXFwvRS12MVxcLmpzL2kudGVzdChzcmMpKSB7XG4gICAgICBoYXNXaXN0aWFFbWJlZCA9IHRydWU7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoL2Zhc3RcXC53aXN0aWFcXC5jb21cXC9lbWJlZFxcL21lZGlhc1xcLy9pLnRlc3Qoc3JjKSkge1xuICAgICAgaGFzV2lzdGlhRW1iZWQgPSB0cnVlO1xuICAgICAgYWRkQXNzZXQoYnVpbGRXaXN0aWFBc3NldChzcmMpKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBhc3luY0NsYXNzUmVnZXggPSAvd2lzdGlhX2FzeW5jXyhbXlxcc1wiJzw+XSspL2c7XG4gIGxldCBhc3luY0NsYXNzTWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cbiAgd2hpbGUgKChhc3luY0NsYXNzTWF0Y2ggPSBhc3luY0NsYXNzUmVnZXguZXhlYyh0ZW1wbGF0ZSkpICE9PSBudWxsKSB7XG4gICAgaGFzV2lzdGlhRW1iZWQgPSB0cnVlO1xuXG4gICAgY29uc3QgbWVkaWFJZEV4cHJlc3Npb24gPSBoYW5kbGViYXJzVmFsdWVUb1BocEV4cHJlc3Npb24oYXN5bmNDbGFzc01hdGNoWzFdKTtcbiAgICBhZGRBc3NldCh7XG4gICAgICBlbXB0eUNoZWNrRXhwcmVzc2lvbjogbWVkaWFJZEV4cHJlc3Npb24sXG4gICAgICB1cmxFeHByZXNzaW9uOiBgJ2h0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy8nIC4gJHttZWRpYUlkRXhwcmVzc2lvbn0gLiAnLmpzb25wJ2AsXG4gICAgfSk7XG4gIH1cblxuICBpZiAoIWhhc1dpc3RpYUVtYmVkKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG5cbiAgY29uc3QgbGluZXMgPSBbXG4gICAgXCIvLyBXaXN0aWEgZW1iZWQgYXNzZXRzXCIsXG4gICAgXCJ3cF9lbnF1ZXVlX3NjcmlwdCgnd2lzdGlhLWV2MScsICdodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9hc3NldHMvZXh0ZXJuYWwvRS12MS5qcycsIFtdLCBudWxsLCBbJ3N0cmF0ZWd5JyA9PiAnYXN5bmMnXSk7XCIsXG4gIF07XG5cbiAgQXJyYXkuZnJvbShhc3NldHMudmFsdWVzKCkpLmZvckVhY2goKGFzc2V0LCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IG1lZGlhVmFyID0gYCRoYW5kb2ZmV2lzdGlhTWVkaWEke2luZGV4fWA7XG4gICAgbGluZXMucHVzaChgJHttZWRpYVZhcn0gPSAke2Fzc2V0LnVybEV4cHJlc3Npb259O2ApO1xuICAgIGxpbmVzLnB1c2goYGlmICghZW1wdHkoJHthc3NldC5lbXB0eUNoZWNrRXhwcmVzc2lvbn0pKSB7YCk7XG4gICAgbGluZXMucHVzaChcbiAgICAgIGAgIHdwX2VucXVldWVfc2NyaXB0KHNhbml0aXplX2tleSgnaGFuZG9mZi13aXN0aWEtbWVkaWEtJyAuIG1kNSgoc3RyaW5nKSAke21lZGlhVmFyfSkpLCAke21lZGlhVmFyfSwgW10sIG51bGwsIFsnc3RyYXRlZ3knID0+ICdhc3luYyddKTtgXG4gICAgKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gIH0pO1xuXG4gIHJldHVybiBgJHtsaW5lcy5qb2luKCdcXG4nKX1cXG5gO1xufTtcblxuY29uc3Qgc3RyaXBXaXN0aWFTY3JpcHRUYWdzID0gKHRlbXBsYXRlOiBzdHJpbmcpOiBzdHJpbmcgPT5cbiAgdGVtcGxhdGVcbiAgICAucmVwbGFjZSgvXFxzKjxzY3JpcHRbXj5dK3NyYz1bXCInXVteXCInXSpmYXN0XFwud2lzdGlhXFwuY29tXFwvZW1iZWRcXC9tZWRpYXNcXC9bXlwiJ10rW1wiJ11bXj5dKj5cXHMqPFxcL3NjcmlwdD5cXHMqL2dpLCAnXFxuJylcbiAgICAucmVwbGFjZSgvXFxzKjxzY3JpcHRbXj5dK3NyYz1bXCInXWh0dHBzOlxcL1xcL2Zhc3RcXC53aXN0aWFcXC5jb21cXC9hc3NldHNcXC9leHRlcm5hbFxcL0UtdjFcXC5qc1tcIiddW14+XSo+XFxzKjxcXC9zY3JpcHQ+XFxzKi9naSwgJ1xcbicpO1xuXG4vKipcbiAqIENvbnZlcnQgaGFuZGxlYmFycyB0ZW1wbGF0ZSB0byBQSFBcbiAqL1xuY29uc3QgaGFuZGxlYmFyc1RvUGhwID0gKHRlbXBsYXRlOiBzdHJpbmcsIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHJpY2h0ZXh0UHJvcHM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpKTogc3RyaW5nID0+IHtcbiAgbGV0IHBocCA9IHRlbXBsYXRlO1xuICBcbiAgLy8gUmVtb3ZlIEhUTUwgd3JhcHBlciBpZiBwcmVzZW50XG4gIHBocCA9IHBocC5yZXBsYWNlKC88aHRtbFtcXHNcXFNdKj88Ym9keVtePl0qPi9naSwgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvPFxcL2JvZHk+W1xcc1xcU10qPzxcXC9odG1sPi9naSwgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvPGhlYWQ+W1xcc1xcU10qPzxcXC9oZWFkPi9naSwgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFx7P3N0eWxlXFx9XFx9XFx9Py9nLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXHs/c2NyaXB0XFx9XFx9XFx9Py9nLCAnJyk7XG4gIFxuICAvLyBSZW1vdmUgSFRNTCBjb21tZW50c1xuICBwaHAgPSBwaHAucmVwbGFjZSgvPCEtLVtcXHNcXFNdKj8tLT4vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIHt7IS0tIGNvbW1lbnRzIC0tfX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xceyEtLVtcXHNcXFNdKj8tLVxcfVxcfS9nLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHshW1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gIFxuICAvLyBSZW1vdmUgSGFuZG9mZi1zcGVjaWZpYyB7eyNmaWVsZH19IGJsb2NrcyBidXQga2VlcCB0aGVpciBjb250ZW50XG4gIC8vIFVzZSBhIGdsb2JhbCByZWdleCB0aGF0IGhhbmRsZXMgdmFyaW91cyBxdW90ZSBzdHlsZXMgYW5kIHdoaXRlc3BhY2VcbiAgLy8gUmVtb3ZlIEhhbmRvZmYtc3BlY2lmaWMge3sjZmllbGR9fSBibG9ja3MgYnV0IGtlZXAgdGhlaXIgY29udGVudFxuICAvLyBBbGxvdyBmb3Igd2hpdGVzcGFjZSB2YXJpYXRpb25zIGxpa2Uge3sjZmllbGQgLi4ufX0sIHt7ICNmaWVsZCAuLi59fSwge3svZmllbGR9fSwge3svZmllbGQgfX0sIHt7IC9maWVsZCB9fVxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFxzKiNmaWVsZFxccytbXlxcfV0rXFx9XFx9L2dpLCAnJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXHMqXFwvZmllbGRcXHMqXFx9XFx9L2dpLCAnJyk7XG4gIFxuICAvLyBOb3JtYWxpemUgQHJvb3QuIHJlZmVyZW5jZXMgaW5zaWRlIEhhbmRsZWJhcnMgZXhwcmVzc2lvbnMgdG8gcm9vdC1sZXZlbCBhY2Nlc3MuXG4gIC8vIEluIHN0YW5kYXJkIEhhbmRsZWJhcnMsIEByb290IHJlZmVycyB0byB0aGUgdG9wLWxldmVsIGRhdGEgY29udGV4dCByZWdhcmRsZXNzIG9mXG4gIC8vIG5lc3RpbmcgZGVwdGgsIHNvIEByb290LnByb3BlcnRpZXMueHh4IGlzIGVxdWl2YWxlbnQgdG8gcHJvcGVydGllcy54eHggYXQgdGhlIHJvb3QuXG4gIC8vIFdlIG9ubHkgcmVwbGFjZSBpbnNpZGUge3suLi59fSB0byBhdm9pZCB0b3VjaGluZyB1bnJlbGF0ZWQgdGV4dCBjb250ZW50LlxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7W1xcc1xcU10qP1xcfVxcfS9nLCAobWF0Y2gpID0+IG1hdGNoLnJlcGxhY2UoL0Byb290XFwuL2csICcnKSk7XG4gIFxuICAvLyBWRVJZIEVBUkxZOiBDb252ZXJ0IHt7I2lmIChlcS9uZSB4eHggXCJ2YWx1ZVwiKX19Li4ue3tlbHNlfX0uLi57ey9pZn19IGhlbHBlciBleHByZXNzaW9uc1xuICAvLyBUaGlzIE1VU1QgcnVuIGJlZm9yZSBhbnkgb3RoZXIgcHJvY2Vzc2luZyB0byBlbnN1cmUgdGhlIGNvbXBsZXRlIGJsb2NrIGlzIGNhcHR1cmVkXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IHZhcmlhYmxlIHBhdGggdG8gUEhQIGZvciBlYXJseSBoZWxwZXIgcHJvY2Vzc2luZ1xuICBjb25zdCB2YXJUb1BocFZlcnlFYXJseSA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfWA7XG4gICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgIGlmIChmaWVsZC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkfSddYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRm9yIGxvb3AgYWxpYXNlcyBhdCB0aGlzIGVhcmx5IHN0YWdlLCB3ZSBoYXZlbid0IHRyYWNrZWQgdGhlbSB5ZXRcbiAgICAgIC8vIFNvIHdlIGp1c3QgdXNlICRpdGVtIGZvciBhbnkgYWxpYXMuZmllbGQgcGF0dGVyblxuICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZFBhdGguam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRofSddYDtcbiAgICB9XG4gIH07XG4gIFxuICAvLyBQYXJzZSBoZWxwZXIgZXhwcmVzc2lvbiB0byBQSFAgY29uZGl0aW9uICh2ZXJ5IGVhcmx5KVxuICBjb25zdCBwYXJzZUhlbHBlclZlcnlFYXJseSA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCBcInJpZ2h0XCIpIC0gZXF1YWxzIHdpdGggcXVvdGVkIHN0cmluZ1xuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocFZlcnlFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSA9PT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwicmlnaHRcIikgLSBub3QgZXF1YWxzXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwVmVyeUVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpICE9PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH07XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIChlcS9uZSAuLi4pfX0gLi4uIHt7ZWxzZSBpZiAoZXEgLi4uKX19IC4uLiB7e2Vsc2V9fSAuLi4ge3svaWZ9fSBWRVJZIEVBUkxZXG4gIC8vIFN1cHBvcnRzIGZ1bGwgaWYgLyBlbHNlIGlmIC8gZWxzZSBpZiAvIGVsc2UgLyBlbmRpZiBjaGFpbnMgKHN0cmluZyBzd2l0Y2ggcGF0dGVybilcbiAgdHlwZSBIZWxwZXJJZkJyYW5jaCA9IHsgY29uZGl0aW9uOiBzdHJpbmcgfCBudWxsOyBjb250ZW50OiBzdHJpbmcgfTtcbiAgY29uc3QgZmluZEhlbHBlcklmQnJhbmNoZXMgPSAoXG4gICAgc3RyOiBzdHJpbmcsXG4gICAgc3RhcnRQb3M6IG51bWJlcixcbiAgICBmaXJzdENvbmRpdGlvbjogc3RyaW5nXG4gICk6IHsgYnJhbmNoZXM6IEhlbHBlcklmQnJhbmNoW107IGNsb3NlUG9zOiBudW1iZXIgfSB8IG51bGwgPT4ge1xuICAgIGNvbnN0IGJyYW5jaGVzOiBIZWxwZXJJZkJyYW5jaFtdID0gW3sgY29uZGl0aW9uOiBmaXJzdENvbmRpdGlvbiwgY29udGVudDogJycgfV07XG4gICAgbGV0IGRlcHRoID0gMTtcbiAgICBsZXQgcG9zID0gc3RhcnRQb3M7XG4gICAgbGV0IGNvbnRlbnRTdGFydCA9IHN0YXJ0UG9zO1xuICAgIGNvbnN0IGVsc2VJZlJlZ2V4ID0gL1xce1xce2Vsc2UgaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0vZztcblxuICAgIHdoaWxlIChwb3MgPCBzdHIubGVuZ3RoICYmIGRlcHRoID4gMCkge1xuICAgICAgY29uc3QgbmV4dElmID0gc3RyLmluZGV4T2YoJ3t7I2lmJywgcG9zKTtcbiAgICAgIGNvbnN0IG5leHRFbmRpZiA9IHN0ci5pbmRleE9mKCd7ey9pZn19JywgcG9zKTtcbiAgICAgIGNvbnN0IG5leHRFbHNlID0gc3RyLmluZGV4T2YoJ3t7ZWxzZX19JywgcG9zKTtcbiAgICAgIGVsc2VJZlJlZ2V4Lmxhc3RJbmRleCA9IHBvcztcbiAgICAgIGNvbnN0IGVsc2VJZk1hdGNoID0gZWxzZUlmUmVnZXguZXhlYyhzdHIpO1xuICAgICAgY29uc3QgbmV4dEVsc2VJZiA9IGVsc2VJZk1hdGNoID8gZWxzZUlmTWF0Y2guaW5kZXggOiAtMTtcblxuICAgICAgY29uc3QgY2FuZGlkYXRlczogeyB0eXBlOiBzdHJpbmc7IHBvczogbnVtYmVyOyBleHByPzogc3RyaW5nOyB0YWdMZW4/OiBudW1iZXIgfVtdID0gW1xuICAgICAgICB7IHR5cGU6ICdpZicsIHBvczogbmV4dElmIH0sXG4gICAgICAgIHsgdHlwZTogJ2VuZGlmJywgcG9zOiBuZXh0RW5kaWYgfSxcbiAgICAgICAgeyB0eXBlOiAnZWxzZScsIHBvczogbmV4dEVsc2UgfSxcbiAgICAgICAgLi4uKG5leHRFbHNlSWYgIT09IC0xID8gW3sgdHlwZTogJ2Vsc2VpZicsIHBvczogbmV4dEVsc2VJZiwgZXhwcjogZWxzZUlmTWF0Y2ghWzFdLCB0YWdMZW46IGVsc2VJZk1hdGNoIVswXS5sZW5ndGggfV0gOiBbXSlcbiAgICAgIF0uZmlsdGVyKGMgPT4gYy5wb3MgIT09IC0xKS5zb3J0KChhLCBiKSA9PiBhLnBvcyAtIGIucG9zKTtcblxuICAgICAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSBicmVhaztcblxuICAgICAgY29uc3QgY2xvc2VzdCA9IGNhbmRpZGF0ZXNbMF07XG5cbiAgICAgIGlmIChjbG9zZXN0LnR5cGUgPT09ICdpZicpIHtcbiAgICAgICAgZGVwdGgrKztcbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyA1O1xuICAgICAgfSBlbHNlIGlmIChjbG9zZXN0LnR5cGUgPT09ICdlbmRpZicpIHtcbiAgICAgICAgZGVwdGgtLTtcbiAgICAgICAgaWYgKGRlcHRoID09PSAwKSB7XG4gICAgICAgICAgYnJhbmNoZXNbYnJhbmNoZXMubGVuZ3RoIC0gMV0uY29udGVudCA9IHN0ci5zdWJzdHJpbmcoY29udGVudFN0YXJ0LCBjbG9zZXN0LnBvcyk7XG4gICAgICAgICAgcmV0dXJuIHsgYnJhbmNoZXMsIGNsb3NlUG9zOiBjbG9zZXN0LnBvcyB9O1xuICAgICAgICB9XG4gICAgICAgIHBvcyA9IGNsb3Nlc3QucG9zICsgNzsgLy8gJ3t7L2lmfX0nLmxlbmd0aCA9PT0gN1xuICAgICAgfSBlbHNlIGlmICgoY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyB8fCBjbG9zZXN0LnR5cGUgPT09ICdlbHNlJykgJiYgZGVwdGggPT09IDEpIHtcbiAgICAgICAgY29uc3QgdGFnTGVuID0gY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyA/IChjbG9zZXN0LnRhZ0xlbiA/PyAwKSA6IDg7XG4gICAgICAgIGJyYW5jaGVzW2JyYW5jaGVzLmxlbmd0aCAtIDFdLmNvbnRlbnQgPSBzdHIuc3Vic3RyaW5nKGNvbnRlbnRTdGFydCwgY2xvc2VzdC5wb3MpO1xuICAgICAgICBicmFuY2hlcy5wdXNoKHtcbiAgICAgICAgICBjb25kaXRpb246IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2VpZicgPyBjbG9zZXN0LmV4cHIhIDogbnVsbCxcbiAgICAgICAgICBjb250ZW50OiAnJ1xuICAgICAgICB9KTtcbiAgICAgICAgY29udGVudFN0YXJ0ID0gY2xvc2VzdC5wb3MgKyB0YWdMZW47XG4gICAgICAgIHBvcyA9IGNvbnRlbnRTdGFydDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFNraXAgZnVsbCB0YWcgd2hlbiBpbnNpZGUgbmVzdGVkICNpZiAoZS5nLiBza2lwIHt7ZWxzZSBpZiAoZXhwcil9fSBzbyB3ZSBmaW5kIHRoZSBvdXRlciB7ey9pZn19KVxuICAgICAgICBjb25zdCBza2lwTGVuID0gY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyA/IChjbG9zZXN0LnRhZ0xlbiA/PyAwKSA6IDg7XG4gICAgICAgIHBvcyA9IGNsb3Nlc3QucG9zICsgc2tpcExlbjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH07XG5cbiAgY29uc3QgaGVscGVySWZSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0vZztcbiAgbGV0IGhlbHBlck1hdGNoO1xuICB3aGlsZSAoKGhlbHBlck1hdGNoID0gaGVscGVySWZSZWdleC5leGVjKHBocCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgb3BlblBvcyA9IGhlbHBlck1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBvcGVuUG9zICsgaGVscGVyTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGZpcnN0Q29uZGl0aW9uID0gaGVscGVyTWF0Y2hbMV07XG5cbiAgICBjb25zdCByZXN1bHQgPSBmaW5kSGVscGVySWZCcmFuY2hlcyhwaHAsIG9wZW5UYWdFbmQsIGZpcnN0Q29uZGl0aW9uKTtcbiAgICBpZiAocmVzdWx0ID09PSBudWxsKSBjb250aW51ZTtcbiAgICBjb25zdCB7IGJyYW5jaGVzLCBjbG9zZVBvcyB9ID0gcmVzdWx0O1xuXG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicmFuY2hlcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgYnJhbmNoID0gYnJhbmNoZXNbaV07XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBicmFuY2guY29uZGl0aW9uID8gcGFyc2VIZWxwZXJWZXJ5RWFybHkoYnJhbmNoLmNvbmRpdGlvbikgOiBudWxsO1xuICAgICAgY29uc3QgY29uZCA9IHBocENvbmRpdGlvbiA/PyAnZmFsc2UnO1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgcGFydHMucHVzaChgPD9waHAgaWYgKCR7Y29uZH0pIDogPz4ke2JyYW5jaC5jb250ZW50fWApO1xuICAgICAgfSBlbHNlIGlmIChicmFuY2guY29uZGl0aW9uICE9PSBudWxsKSB7XG4gICAgICAgIHBhcnRzLnB1c2goYDw/cGhwIGVsc2VpZiAoJHtjb25kfSkgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXJ0cy5wdXNoKGA8P3BocCBlbHNlIDogPz4ke2JyYW5jaC5jb250ZW50fWApO1xuICAgICAgfVxuICAgIH1cbiAgICBwYXJ0cy5wdXNoKCc8P3BocCBlbmRpZjsgPz4nKTtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IHBhcnRzLmpvaW4oJycpO1xuXG4gICAgcGhwID0gcGhwLnN1YnN0cmluZygwLCBvcGVuUG9zKSArIHJlcGxhY2VtZW50ICsgcGhwLnN1YnN0cmluZyhjbG9zZVBvcyArIDcpOyAvLyAne3svaWZ9fScubGVuZ3RoID09PSA3XG4gICAgLy8gTmV4dCBleGVjIGZyb20gc3RhcnQgb2YgcmVwbGFjZW1lbnQgc28gd2UgY2F0Y2ggbmVzdGVkIHt7I2lmfX0uLi57e2Vsc2UgaWZ9fS4uLnt7L2lmfX0gaW5zaWRlIGl0XG4gICAgaGVscGVySWZSZWdleC5sYXN0SW5kZXggPSBvcGVuUG9zO1xuICB9XG5cbiAgLy8gVkVSWSBFQVJMWTogQ29udmVydCB7eyN1bmxlc3MgKGVxL25lIC4uLil9fSB3aXRoIGVsc2UgYW5kIHdpdGhvdXQgZWxzZVxuICAvLyAjdW5sZXNzIGlzIHRoZSBuZWdhdGlvbiBvZiAjaWYsIHNvIHdlIGludmVydCB0aGUgY29uZGl0aW9uLlxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCwgZWxzZUNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVmVyeUVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICghKCR7cGhwQ29uZGl0aW9ufSkpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclZlcnlFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBzdHlsZSB3aXRoIGhhbmRsZWJhcnMgZXhwcmVzc2lvbnNcbiAgLy8gS2VlcCAnc3JjJyBhcy1pcyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zdHlsZT1cImJhY2tncm91bmQtaW1hZ2U6dXJsXFwoJz9cXHtcXHsrXFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9K1xcfSc/XFwpXCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICFlbXB0eSgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddKSA/ICdzdHlsZT1cImJhY2tncm91bmQtaW1hZ2U6dXJsKFxcXFwnJyAuIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSkgLiAnXFxcXCcpXCInIDogJyc7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBUcmFjayBsb29wIGFsaWFzZXMgZm9yIGxhdGVyIHJlZmVyZW5jZSBjb252ZXJzaW9uXG4gIC8vIEZvcm1hdDoge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eCBhcyB8YWxpYXNOYW1lfH19XG4gIGNvbnN0IGxvb3BBbGlhc2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICAvLyBUcmFjayBuZXN0ZWQgbG9vcCBhbGlhc2VzIHNlcGFyYXRlbHkgKHRoZXNlIHVzZSAkc3ViSXRlbSBpbnN0ZWFkIG9mICRpdGVtKVxuICBjb25zdCBuZXN0ZWRMb29wQWxpYXNlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBcbiAgLy8gVHJhY2sgbmVzdGVkIGxvb3AgZGVwdGggZm9yIHByb3BlciB2YXJpYWJsZSBuYW1pbmdcbiAgbGV0IG5lc3RlZExvb3BEZXB0aCA9IDA7XG4gIFxuICAvLyBIZWxwZXIgdG8gZ2V0IHRoZSBsb29wIGl0ZW0gdmFyaWFibGUgbmFtZSBiYXNlZCBvbiBkZXB0aFxuICBjb25zdCBnZXRMb29wSXRlbVZhciA9IChkZXB0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiAnJGl0ZW0nO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckc3ViSXRlbSc7XG4gICAgcmV0dXJuIGAkbmVzdGVkJHtkZXB0aH1JdGVtYDtcbiAgfTtcbiAgXG4gIGNvbnN0IGdldExvb3BJbmRleFZhciA9IChkZXB0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiAnJGluZGV4JztcbiAgICBpZiAoZGVwdGggPT09IDEpIHJldHVybiAnJHN1YkluZGV4JztcbiAgICByZXR1cm4gYCRuZXN0ZWQke2RlcHRofUluZGV4YDtcbiAgfTtcbiAgXG4gIGNvbnN0IGdldExvb3BDb3VudFZhciA9IChkZXB0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiAnJF9sb29wX2NvdW50JztcbiAgICBpZiAoZGVwdGggPT09IDEpIHJldHVybiAnJF9uZXN0ZWRfbG9vcF9jb3VudCc7XG4gICAgcmV0dXJuIGAkX25lc3RlZCR7ZGVwdGh9X2xvb3BfY291bnRgO1xuICB9O1xuICBcbiAgLy8gRmlyc3QgcGFzczogaWRlbnRpZnkgYWxsIG5lc3RlZCBsb29wIHBhdHRlcm5zIGFuZCB0aGVpciBhbGlhc2VzXG4gIC8vIFdlIG5lZWQgdG8gcHJvY2VzcyBsb29wcyBpbiBvcmRlciB0byBwcm9wZXJseSB0cmFjayBuZXN0aW5nXG4gIGNvbnN0IGVhY2hQYXR0ZXJuczogQXJyYXk8e1xuICAgIG1hdGNoOiBzdHJpbmc7XG4gICAgdHlwZTogJ3Byb3BlcnRpZXMnIHwgJ3RoaXMnIHwgJ2FsaWFzJztcbiAgICBhcnJheVBhdGg6IHN0cmluZztcbiAgICBhbGlhcz86IHN0cmluZztcbiAgICBwYXJlbnRBbGlhcz86IHN0cmluZztcbiAgICBpbmRleDogbnVtYmVyO1xuICB9PiA9IFtdO1xuICBcbiAgLy8gRmluZCBhbGwge3sjZWFjaCAuLi59fSBwYXR0ZXJuc1xuICBjb25zdCBlYWNoUmVnZXggPSAvXFx7XFx7I2VhY2hcXHMrKFteXFx9XSspXFx9XFx9L2c7XG4gIGxldCBlYWNoTWF0Y2g7XG4gIHdoaWxlICgoZWFjaE1hdGNoID0gZWFjaFJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZWFjaE1hdGNoWzFdLnRyaW0oKTtcbiAgICBsZXQgdHlwZTogJ3Byb3BlcnRpZXMnIHwgJ3RoaXMnIHwgJ2FsaWFzJztcbiAgICBsZXQgYXJyYXlQYXRoOiBzdHJpbmc7XG4gICAgbGV0IGFsaWFzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgbGV0IHBhcmVudEFsaWFzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIFwiYXMgfGFsaWFzfFwiIHN5bnRheFxuICAgIGNvbnN0IGFzQWxpYXNNYXRjaCA9IGNvbnRlbnQubWF0Y2goL14oLis/KVxccythc1xccytcXHwoXFx3KylcXHwkLyk7XG4gICAgaWYgKGFzQWxpYXNNYXRjaCkge1xuICAgICAgY29uc3QgcGF0aFBhcnQgPSBhc0FsaWFzTWF0Y2hbMV0udHJpbSgpO1xuICAgICAgYWxpYXMgPSBhc0FsaWFzTWF0Y2hbMl07XG4gICAgICBcbiAgICAgIGlmIChwYXRoUGFydC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIHR5cGUgPSAncHJvcGVydGllcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpO1xuICAgICAgfSBlbHNlIGlmIChwYXRoUGFydC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIHR5cGUgPSAndGhpcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0LnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgfSBlbHNlIGlmIChwYXRoUGFydC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIC8vIGUuZy4sIGFydGljbGUudGFncyAtIGZpcnN0IHBhcnQgaXMgYW4gYWxpYXMgZnJvbSBvdXRlciBsb29wXG4gICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aFBhcnQuc3BsaXQoJy4nKTtcbiAgICAgICAgcGFyZW50QWxpYXMgPSBwYXJ0c1swXTtcbiAgICAgICAgYXJyYXlQYXRoID0gcGFydHMuc2xpY2UoMSkuam9pbignLicpO1xuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEp1c3QgYSB2YXJpYWJsZSBuYW1lLCB0cmVhdCBhcyBhbGlhcyByZWZlcmVuY2VcbiAgICAgICAgdHlwZSA9ICdhbGlhcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhbGlhcyBzeW50YXhcbiAgICAgIGlmIChjb250ZW50LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICdwcm9wZXJ0aWVzJztcbiAgICAgICAgYXJyYXlQYXRoID0gY29udGVudC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgvXFxzLylbMF07XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICB0eXBlID0gJ3RoaXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnJlcGxhY2UoJ3RoaXMuJywgJycpLnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gY29udGVudC5zcGxpdCgnLicpO1xuICAgICAgICBwYXJlbnRBbGlhcyA9IHBhcnRzWzBdO1xuICAgICAgICBhcnJheVBhdGggPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJykuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgZWFjaFBhdHRlcm5zLnB1c2goe1xuICAgICAgbWF0Y2g6IGVhY2hNYXRjaFswXSxcbiAgICAgIHR5cGUsXG4gICAgICBhcnJheVBhdGgsXG4gICAgICBhbGlhcyxcbiAgICAgIHBhcmVudEFsaWFzLFxuICAgICAgaW5kZXg6IGVhY2hNYXRjaC5pbmRleFxuICAgIH0pO1xuICB9XG4gIFxuICAvLyBUcmFjayB3aGljaCBhbGlhc2VzIG1hcCB0byB3aGljaCBuZXN0ZWQgZGVwdGhcbiAgY29uc3QgYWxpYXNUb0RlcHRoOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIFxuICAvLyBQcm9jZXNzIGxvb3BzIGZyb20gZmlyc3QgdG8gbGFzdCAobWFpbnRhaW5pbmcgb3JkZXIpXG4gIC8vIFNvcnQgYnkgaW5kZXggdG8gcHJvY2VzcyBpbiBvcmRlclxuICBlYWNoUGF0dGVybnMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuICBcbiAgLy8gVHJhY2sgY3VycmVudCBuZXN0aW5nIGxldmVsIGFzIHdlIHByb2Nlc3NcbiAgbGV0IGN1cnJlbnREZXB0aCA9IC0xO1xuICBjb25zdCBvcGVuTG9vcHM6IEFycmF5PHsgZGVwdGg6IG51bWJlcjsgYWxpYXM/OiBzdHJpbmcgfT4gPSBbXTtcbiAgXG4gIC8vIEZpbmQge3svZWFjaH19IHBvc2l0aW9uc1xuICBjb25zdCBjbG9zZUVhY2hQb3NpdGlvbnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGNsb3NlRWFjaFJlZ2V4ID0gL1xce1xce1xcL2VhY2hcXH1cXH0vZztcbiAgbGV0IGNsb3NlTWF0Y2g7XG4gIHdoaWxlICgoY2xvc2VNYXRjaCA9IGNsb3NlRWFjaFJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjbG9zZUVhY2hQb3NpdGlvbnMucHVzaChjbG9zZU1hdGNoLmluZGV4KTtcbiAgfVxuICBcbiAgLy8gQXNzaWduIGRlcHRoIHRvIGVhY2ggcGF0dGVybiBiYXNlZCBvbiBwb3NpdGlvbiByZWxhdGl2ZSB0byBvdGhlciBwYXR0ZXJucyBhbmQgY2xvc2VzXG4gIGZvciAoY29uc3QgcGF0dGVybiBvZiBlYWNoUGF0dGVybnMpIHtcbiAgICAvLyBDb3VudCBob3cgbWFueSBvcGVucyBiZWZvcmUgdGhpcyBwb3NpdGlvblxuICAgIGNvbnN0IG9wZW5zQmVmb3JlID0gZWFjaFBhdHRlcm5zLmZpbHRlcihwID0+IHAuaW5kZXggPCBwYXR0ZXJuLmluZGV4KS5sZW5ndGg7XG4gICAgLy8gQ291bnQgaG93IG1hbnkgY2xvc2VzIGJlZm9yZSB0aGlzIHBvc2l0aW9uXG4gICAgY29uc3QgY2xvc2VzQmVmb3JlID0gY2xvc2VFYWNoUG9zaXRpb25zLmZpbHRlcihwb3MgPT4gcG9zIDwgcGF0dGVybi5pbmRleCkubGVuZ3RoO1xuICAgIGNvbnN0IGRlcHRoID0gb3BlbnNCZWZvcmUgLSBjbG9zZXNCZWZvcmU7XG4gICAgXG4gICAgaWYgKHBhdHRlcm4uYWxpYXMpIHtcbiAgICAgIGFsaWFzVG9EZXB0aFtwYXR0ZXJuLmFsaWFzXSA9IGRlcHRoO1xuICAgICAgbG9vcEFsaWFzZXNbcGF0dGVybi5hbGlhc10gPSBwYXR0ZXJuLmFycmF5UGF0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgcHJvcGVydHkgcGF0aCBsaWtlIFwianVtcE5hdi5saW5rc1wiIHRvIFBIUCB2YXJpYWJsZSBhY2Nlc3MgbGlrZSBcIiRqdW1wTmF2WydsaW5rcyddXCJcbiAgY29uc3QgcHJvcFBhdGhUb1BocCA9IChwcm9wUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgY2FtZWxGaXJzdCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICByZXR1cm4gYCQke2NhbWVsRmlyc3R9YDtcbiAgICB9XG4gICAgLy8gRm9yIG5lc3RlZCBwYXRocyBsaWtlIGp1bXBOYXYubGlua3MgLT4gJGp1bXBOYXZbJ2xpbmtzJ11cbiAgICBjb25zdCBuZXN0ZWRQYXRoID0gcGFydHMuc2xpY2UoMSkubWFwKHAgPT4gYCcke3B9J2ApLmpvaW4oJ11bJyk7XG4gICAgcmV0dXJuIGAkJHtjYW1lbEZpcnN0fVske25lc3RlZFBhdGh9XWA7XG4gIH07XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5IGFzIHxhbGlhc3x9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhcyBpbmRleHx9fSBsb29wcyB3aXRoIG5hbWVkIGFsaWFzXG4gIC8vIE5vdyBoYW5kbGVzIG5lc3RlZCBwYXRocyBsaWtlIHByb3BlcnRpZXMuanVtcE5hdi5saW5rc1xuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkaW5kZXggaW4gUEhQXG4gIC8vIEFsc28gc2V0ICRfbG9vcF9jb3VudCBmb3IgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgsIGFsaWFzKSA9PiB7XG4gICAgICBjb25zdCBwaHBWYXIgPSBwcm9wUGF0aFRvUGhwKHByb3BQYXRoKTtcbiAgICAgIGxvb3BBbGlhc2VzW2FsaWFzXSA9IHByb3BQYXRoO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7cGhwVmFyfSkgJiYgaXNfYXJyYXkoJHtwaHBWYXJ9KSkgOiAkX2xvb3BfY291bnQgPSBjb3VudCgke3BocFZhcn0pOyBmb3JlYWNoICgke3BocFZhcn0gYXMgJGluZGV4ID0+ICRpdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggcHJvcGVydGllcy54eHh9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4Lnl5eX19IGxvb3BzIHdpdGhvdXQgYWxpYXNcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIC8vIEFsc28gc2V0ICRfbG9vcF9jb3VudCBmb3IgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBWYXIgPSBwcm9wUGF0aFRvUGhwKHByb3BQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke3BocFZhcn0pICYmIGlzX2FycmF5KCR7cGhwVmFyfSkpIDogJF9sb29wX2NvdW50ID0gY291bnQoJHtwaHBWYXJ9KTsgZm9yZWFjaCAoJHtwaHBWYXJ9IGFzICRpbmRleCA9PiAkaXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIHRoaXMueHh4IGFzIHxhbGlhc3x9fSBvciB7eyNlYWNoIHRoaXMueHh4IGFzIHxhbGlhcyBpbmRleHx9fSBuZXN0ZWQgbG9vcHMgd2l0aCBhbGlhc1xuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkc3ViSW5kZXggaW4gUEhQXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccyt0aGlzXFwuKFxcdyspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3AsIGFsaWFzKSA9PiB7XG4gICAgICBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPSBwcm9wO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCB0aGlzLnh4eH19IG5lc3RlZCBsb29wcyB3aXRob3V0IGFsaWFzXG4gIC8vIFVzZSAkX25lc3RlZF9sb29wX2NvdW50IGZvciBuZXN0ZWQgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3RoaXNcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3ApID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkaXRlbVsnJHtwcm9wfSddKSAmJiBpc19hcnJheSgkaXRlbVsnJHtwcm9wfSddKSkgOiAkX25lc3RlZF9sb29wX2NvdW50ID0gY291bnQoJGl0ZW1bJyR7cHJvcH0nXSk7IGZvcmVhY2ggKCRpdGVtWycke3Byb3B9J10gYXMgJHN1YkluZGV4ID0+ICRzdWJJdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggYWxpYXMueHh4IGFzIHxuZXN0ZWRBbGlhc3x9fSBvciB7eyNlYWNoIGFsaWFzLnh4eCBhcyB8bmVzdGVkQWxpYXMgaW5kZXh8fX0gLSBuZXN0ZWQgbG9vcHMgcmVmZXJlbmNpbmcgb3V0ZXIgbG9vcCBhbGlhc1xuICAvLyBlLmcuLCB7eyNlYWNoIGFydGljbGUudGFncyBhcyB8dGFnfH19IHdoZXJlICdhcnRpY2xlJyBpcyBmcm9tIG91dGVyIHt7I2VhY2ggYXJ0aWNsZXMgYXMgfGFydGljbGV8fX1cbiAgLy8gVGhlIHNlY29uZCBwYXJhbWV0ZXIgKGluZGV4KSBpcyBvcHRpb25hbCBhbmQgaWdub3JlZCBzaW5jZSB3ZSB1c2UgJHN1YkluZGV4IGluIFBIUFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrKFxcdyspXFwuKFxcdyspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBwYXJlbnRBbGlhcywgcHJvcCwgbmVzdGVkQWxpYXMpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQncyBwcm9wZXJ0aWVzLnh4eCBvciB0aGlzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKHBhcmVudEFsaWFzID09PSAncHJvcGVydGllcycgfHwgcGFyZW50QWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBUaGlzIGlzIGEgbmVzdGVkIGxvb3AgcmVmZXJlbmNpbmcgYW4gb3V0ZXIgbG9vcCBhbGlhc1xuICAgICAgbmVzdGVkTG9vcEFsaWFzZXNbbmVzdGVkQWxpYXNdID0gcHJvcDtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkaXRlbVsnJHtwcm9wfSddKSAmJiBpc19hcnJheSgkaXRlbVsnJHtwcm9wfSddKSkgOiAkX25lc3RlZF9sb29wX2NvdW50ID0gY291bnQoJGl0ZW1bJyR7cHJvcH0nXSk7IGZvcmVhY2ggKCRpdGVtWycke3Byb3B9J10gYXMgJHN1YkluZGV4ID0+ICRzdWJJdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggYWxpYXMueHh4fX0gLSBuZXN0ZWQgbG9vcHMgcmVmZXJlbmNpbmcgb3V0ZXIgbG9vcCBhbGlhcyB3aXRob3V0IG5lc3RlZCBhbGlhc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChtYXRjaCwgcGFyZW50QWxpYXMsIHByb3ApID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQncyBwcm9wZXJ0aWVzLnh4eCBvciB0aGlzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKHBhcmVudEFsaWFzID09PSAncHJvcGVydGllcycgfHwgcGFyZW50QWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBUaGlzIGlzIGEgbmVzdGVkIGxvb3AgcmVmZXJlbmNpbmcgYW4gb3V0ZXIgbG9vcCBhbGlhc1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXC9lYWNoXFx9XFx9L2csICc8P3BocCBlbmRmb3JlYWNoOyBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGhlbHBlciBleHByZXNzaW9uIGNvbmRpdGlvbmFscyBFQVJMWSAoYmVmb3JlIGFsaWFzIHBhdHRlcm5zIGNvbnZlcnQgcGFydHMgb2YgdGhlbSlcbiAgLy8gVGhpcyBoYW5kbGVzIHt7I2lmIChlcSBhbGlhcy54eHggXCJ2YWx1ZVwiKX19Li4ue3tlbHNlfX0uLi57ey9pZn19IHBhdHRlcm5zIGluc2lkZSBsb29wc1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSB2YXJpYWJsZSBwYXRoIHRvIFBIUCBleHByZXNzaW9uIGZvciBoZWxwZXIgY29tcGFyaXNvbnNcbiAgLy8gSGFuZGxlcyBwcm9wZXJ0aWVzLnh4eCwgdGhpcy54eHgsIGFuZCBhbGlhcy54eHggcGF0dGVybnNcbiAgY29uc3QgdmFyVG9QaHBFYXJseSA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfWA7XG4gICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgIGlmIChmaWVsZC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkfSddYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgaXMgYSBrbm93biBsb29wIGFsaWFzXG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGlmIChuZXN0ZWRMb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgICByZXR1cm4gYCRzdWJJdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvb3BBbGlhc2VzW3BhcnRzWzBdXSkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gRmFsbGJhY2tcbiAgICAgIGlmICh2YXJQYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRoLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRofSddYDtcbiAgICB9XG4gIH07XG4gIFxuICAvLyBQYXJzZSBoZWxwZXIgZXhwcmVzc2lvbiB0byBQSFAgY29uZGl0aW9uXG4gIGNvbnN0IHBhcnNlSGVscGVyRWFybHkgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSA9PT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwicmlnaHRcIikgLSBub3QgZXF1YWxzXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwRWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlIEVBUkxZXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIGlmQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGZhbHNlKSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgLy8gQ29udmVydCB7eyN1bmxlc3MgKGVxL25lIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBlbHNlIEVBUkxZXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGF0dHJpYnV0ZS1zcGVjaWZpYyBwYXR0ZXJucyBGSVJTVCBiZWZvcmUgZ2VuZXJpYyBvbmVzXG4gIC8vIEhhbmRsZSBwcm9wZXJ0aWVzLnh4eC55eXkgcGF0dGVybnMgRklSU1QsIHRoZW4gYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzXG4gIFxuICAvLyBDb252ZXJ0IHNyYz1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJucyAodG9wLWxldmVsIG5lc3RlZCBwcm9wZXJ0aWVzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvc3JjPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBzcmM9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9hbHQ9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGFsdD1cIjw/cGhwIGVjaG8gZXNjX2F0dHIoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIE5vdyBoYW5kbGUgYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzOiBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBhbHQ9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBocmVmPVwie3thbGlhcy54eHgueXl5fX1cIlxuICBcbiAgLy8gQ29udmVydCBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiIHBhdHRlcm5zIChpbWFnZXMgaW4gbG9vcHMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zcmM9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBjb252ZXJ0ZWQgb3IgaWYgaXQncyBhIHByb3BlcnRpZXMgcGF0dGVyblxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJyB8fCBtYXRjaC5pbmNsdWRlcygnPD9waHAnKSkge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgc3JjPVwiPD9waHAgZWNobyBlc2NfdXJsKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3thbGlhcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvYWx0PVwiXFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkMSwgZmllbGQyKSA9PiB7XG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnIHx8IG1hdGNoLmluY2x1ZGVzKCc8P3BocCcpKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGBhbHQ9XCI8P3BocCBlY2hvIGVzY19hdHRyKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7YWxpYXMueHh4Lnl5eX19XCIgcGF0dGVybnMgKGxpbmtzIGluIGxvb3BzIHdpdGggbmVzdGVkIGZpZWxkcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycgfHwgbWF0Y2guaW5jbHVkZXMoJzw/cGhwJykpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e2FsaWFzLmZpZWxkLnN1YmZpZWxkfX0gYW5kIHt7YWxpYXMuZmllbGR9fSByZWZlcmVuY2VzIGZyb20gbmFtZWQgbG9vcCB2YXJpYWJsZXNcbiAgLy8gTXVzdCBoYW5kbGUgZGVlcGVyIG5lc3RpbmcgZmlyc3QgKGFsaWFzLmZpZWxkLnN1YmZpZWxkIGJlZm9yZSBhbGlhcy5maWVsZClcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgdHJpcGxlLWJyYWNlIChyaWNoIHRleHQpIEJFRk9SRSBkb3VibGUtYnJhY2UgcGF0dGVybnNcbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgZmllbGQgcGF0aCB0byBQSFAgYXJyYXkgYWNjZXNzXG4gIC8vIGUuZy4sIFwiY3RhLmxpbmtcIiAtPiBcIlsnY3RhJ11bJ2xpbmsnXVwiXG4gIGNvbnN0IGZpZWxkUGF0aFRvUGhwQWNjZXNzID0gKGZpZWxkUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgIHJldHVybiBwYXJ0cy5tYXAocCA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgfTtcbiAgXG4gIC8vIFByb2Nlc3MgbmVzdGVkIGxvb3AgYWxpYXNlcyBGSVJTVCAodGhleSB1c2UgJHN1Ykl0ZW0pXG4gIGZvciAoY29uc3QgW2FsaWFzXSBvZiBPYmplY3QuZW50cmllcyhuZXN0ZWRMb29wQWxpYXNlcykpIHtcbiAgICAvLyBIYW5kbGUge3t7IGFsaWFzLmZpZWxkIH19fSB0cmlwbGUtYnJhY2UgcGF0dGVybnMgKHJpY2ggdGV4dC9IVE1MIGluIG5lc3RlZCBsb29wcylcbiAgICBjb25zdCBhbGlhc1RyaXBsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc1RyaXBsZVJlZ2V4LCAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHN1Ykl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7I2lmIGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRocyBpbiBuZXN0ZWQgbG9vcHNcbiAgICAvLyBlLmcuLCB7eyNpZiB0YWcuY3RhLmxpbmt9fSAtPiA8P3BocCBpZiAoIWVtcHR5KCRzdWJJdGVtWydjdGEnXVsnbGluayddKSkgOiA/PlxuICAgIGNvbnN0IGFsaWFzSWZEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2lmXFxcXHMrJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNJZkRlZXBSZWdleCwgKF8sIGZpZWxkUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkc3ViSXRlbSR7cGhwQWNjZXNzfSkpIDogPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLiB9fSBwYXR0ZXJucyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHMgaW4gbmVzdGVkIGxvb3BzXG4gICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHN1Ykl0ZW0ke3BocEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRoZW4gcHJvY2VzcyB0b3AtbGV2ZWwgbG9vcCBhbGlhc2VzICh0aGV5IHVzZSAkaXRlbSlcbiAgZm9yIChjb25zdCBbYWxpYXNdIG9mIE9iamVjdC5lbnRyaWVzKGxvb3BBbGlhc2VzKSkge1xuICAgIC8vIEhhbmRsZSB7e3sgYWxpYXMuZmllbGQgfX19IHRyaXBsZS1icmFjZSBwYXR0ZXJucyAocmljaCB0ZXh0L0hUTUwgaW4gbG9vcHMpXG4gICAgY29uc3QgYWxpYXNUcmlwbGVSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNUcmlwbGVSZWdleCwgKF8sIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyNpZiBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgICAvLyBlLmcuLCB7eyNpZiBzbGlkZS5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gICAgY29uc3QgYWxpYXNJZkRlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0lmRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtJHtwaHBBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4uIH19IHBhdHRlcm5zIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgIGNvbnN0IGFsaWFzRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oW1xcXFx3Ll0rKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBsYXN0UGFydCA9PT0gJ3VybCcgfHwgbGFzdFBhcnQgPT09ICdzcmMnIHx8IGxhc3RQYXJ0ID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCRpdGVtJHtwaHBBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICB9XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBAZmlyc3R9fSAtIHNob3cgY29udGVudCBmb3IgYWxsIGl0ZW1zIGV4Y2VwdCB0aGUgZmlyc3RcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFxzKlxcfVxcfS9nLFxuICAgIGA8P3BocCBpZiAoJGluZGV4ID4gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIEBsYXN0fX0gLSBzaG93IGNvbnRlbnQgZm9yIGFsbCBpdGVtcyBleGNlcHQgdGhlIGxhc3RcbiAgLy8gVXNlcyAkX2xvb3BfY291bnQgc2V0IGluIHRoZSBmb3JlYWNoIGxvb3BcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPCAkX2xvb3BfY291bnQgLSAxKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBAZmlyc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgZmlyc3QgaXRlbVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK0BmaXJzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA9PT0gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgQGxhc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgbGFzdCBpdGVtXG4gIC8vIFVzZXMgJF9sb29wX2NvdW50IHNldCBpbiB0aGUgZm9yZWFjaCBsb29wXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPT09ICRfbG9vcF9jb3VudCAtIDEpIDogPz5gXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBwcm9wZXJ0aWVzLnh4eH19IOKAlCBuZWdhdGlvbiBvZiB7eyNpZiBwcm9wZXJ0aWVzLnh4eH19XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKGVtcHR5KCQke2NhbWVsUHJvcH0pKSA6ID8+YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5lc3RlZEFjY2VzcyA9IHBhcnRzLnNsaWNlKDEpLm1hcCgocDogc3RyaW5nKSA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGVtcHR5KCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL3VubGVzc1xcfVxcfS9nLCAnPD9waHAgZW5kaWY7ID8+Jyk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIHRoaXMueHh4fX0gY29uZGl0aW9uYWxzIGluc2lkZSBsb29wc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK3RoaXNcXC4oXFx3KylcXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke2ZpZWxkfSddKSkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgYWxpYXMuZmllbGR9fSBmb3IgYW55IHJlbWFpbmluZyBsb29wIHZhcmlhYmxlIGNvbmRpdGlvbmFsc1xuICAvLyBUaGlzIGNhdGNoZXMgY2FzZXMgd2hlcmUgdGhlIGFsaWFzIHdhc24ndCB0cmFja2VkIChlLmcuLCBuZXN0ZWQgbG9vcHMgb3IgdW50cmFja2VkIGFsaWFzZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkKSA9PiB7XG4gICAgICAvLyBTa2lwIGlmIGl0IGxvb2tzIGxpa2UgcHJvcGVydGllcy54eHggKGFscmVhZHkgaGFuZGxlZClcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSkpIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhlbHBlciB0byBwYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gIC8vIGFuZCBjb252ZXJ0IHRvIFBIUCBjb21wYXJpc29uIGV4cHJlc3Npb25zXG4gIGNvbnN0IHBhcnNlSGVscGVyVG9QaHAgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSB2YXJpYWJsZSBwYXRoIHRvIFBIUCBleHByZXNzaW9uXG4gICAgLy8gSGFuZGxlcyBwcm9wZXJ0aWVzLnh4eCwgdGhpcy54eHgsIGFuZCBhbGlhcy54eHggcGF0dGVybnNcbiAgICBjb25zdCB2YXJUb1BocCA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGgucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfVsnJHtwYXJ0cy5zbGljZSgxKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICAgIH0gZWxzZSBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgaXMgYSBrbm93biBsb29wIGFsaWFzIChlLmcuLCBjYXJkLnR5cGUgLT4gdHlwZSlcbiAgICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgLy8gQ2hlY2sgbmVzdGVkIGFsaWFzZXMgZmlyc3QgKHVzZSAkc3ViSXRlbSlcbiAgICAgICAgICBpZiAobmVzdGVkTG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChmaWVsZFBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICByZXR1cm4gYCRzdWJJdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYCRzdWJJdGVtWycke2ZpZWxkUGF0aFswXX0nXWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFRoZW4gY2hlY2sgdG9wLWxldmVsIGFsaWFzZXMgKHVzZSAkaXRlbSlcbiAgICAgICAgICBpZiAobG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChmaWVsZFBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkUGF0aFswXX0nXWA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEZhbGxiYWNrIC0gdXNlIGFzLWlzIChtaWdodCBiZSBhIHBsYWluIGZpZWxkIG5hbWUpXG4gICAgICAgIGlmICh2YXJQYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGguc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRofSddYDtcbiAgICAgIH1cbiAgICB9O1xuICAgIFxuICAgIC8vIE1hdGNoIChlcSBsZWZ0IFwicmlnaHRcIikgLSBlcXVhbHMgd2l0aCBxdW90ZWQgc3RyaW5nXG4gICAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKGVxTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgdmFyaWFibGUpIHdpdGhvdXQgcXVvdGVzXG4gICAgY29uc3QgZXFWYXJNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXSspXFxzKyhbXlxccylcIl0rKVxccypcXCkkLyk7XG4gICAgaWYgKGVxVmFyTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxVmFyTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgY29uc3QgcmlnaHRFeHByID0gdmFyVG9QaHAocmlnaHQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAoJHtyaWdodEV4cHJ9ID8/ICcnKWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwicmlnaHRcIikgLSBub3QgZXF1YWxzXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpICE9PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGd0IGxlZnQgcmlnaHQpIC0gZ3JlYXRlciB0aGFuXG4gICAgY29uc3QgZ3RNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZ3RcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChndE1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBndE1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocChsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/IDApID4gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobHQgbGVmdCByaWdodCkgLSBsZXNzIHRoYW5cbiAgICBjb25zdCBsdE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypsdFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGx0TWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGx0TWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPCAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChndGUgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW4gb3IgZXF1YWxcbiAgICBjb25zdCBndGVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZ3RlXFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgICBpZiAoZ3RlTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0ZU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocChsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/IDApID49ICR7cmlnaHR9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGx0ZSBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhbiBvciBlcXVhbFxuICAgIGNvbnN0IGx0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypsdGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChsdGVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRlTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPD0gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lL2d0L2x0L2V0YyAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGggaWYvZWxzZVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIGlmQ29udGVudCwgZWxzZUNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCR7cGhwQ29uZGl0aW9ufSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGZhbHNlKSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lL2d0L2x0L2V0YyAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclRvUGhwKGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aG91dCBlbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCEoJHtwaHBDb25kaXRpb259KSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I2lmIHByb3BlcnRpZXMueHh4Lnl5eS56enouLi59fSBjb25kaXRpb25hbHMgd2l0aCBkZWVwbHkgbmVzdGVkIHBhdGhzXG4gIC8vIGUuZy4sIHt7I2lmIHByb3BlcnRpZXMubGVmdF9jb2x1bW4uY3RhLmxpbmt9fSAtPiA8P3BocCBpZiAoIWVtcHR5KCRsZWZ0Q29sdW1uWydjdGEnXVsnbGluayddKSkgOiA/PlxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCQke2NhbWVsUHJvcH0pKSA6ID8+YDtcbiAgICAgIH1cbiAgICAgIC8vIEJ1aWxkIG5lc3RlZCBhcnJheSBhY2Nlc3MgZm9yIHJlbWFpbmluZyBwYXJ0c1xuICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGFydHMuc2xpY2UoMSkubWFwKChwOiBzdHJpbmcpID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3tlbHNlfX0gc2VwYXJhdGVseSAoZm9yIGNhc2VzIG5vdCBjYXVnaHQgYnkgdGhlIGNvbWJpbmVkIHBhdHRlcm5zIGFib3ZlKVxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7ZWxzZVxcfVxcfS9nLCAnPD9waHAgZWxzZSA6ID8+Jyk7XG4gIFxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFwvaWZcXH1cXH0vZywgJzw/cGhwIGVuZGlmOyA/PicpO1xuICBcbiAgLy8gSU1QT1JUQU5UOiBDb252ZXJ0IHRyaXBsZS1icmFjZSBleHByZXNzaW9ucyBGSVJTVCAoYmVmb3JlIGRvdWJsZS1icmFjZSlcbiAgLy8gVHJpcGxlIGJyYWNlcyBhcmUgZm9yIHVuZXNjYXBlZCBIVE1MIG91dHB1dCAocmljaCB0ZXh0IGZpZWxkcylcbiAgXG4gIC8vIENvbnZlcnQge3t7cHJvcGVydGllcy54eHh9fX0gdHJpcGxlIGJyYWNlcyAodW5lc2NhcGVkIEhUTUwpXG4gIC8vIHJpY2h0ZXh0IHByb3BzIHVzZSBJbm5lckJsb2NrcyDigJQgb3V0cHV0ICRjb250ZW50IChpbm5lciBibG9ja3MgcmVuZGVyZWQgSFRNTClcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFxzKlxcfVxcfVxcfS9nLFxuICAgIChfLCBwcm9wKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIGlmIChyaWNodGV4dFByb3BzLmhhcyhwcm9wKSB8fCByaWNodGV4dFByb3BzLmhhcyhjYW1lbFByb3ApKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgZWNobyAkY29udGVudDsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkJHtjYW1lbFByb3B9ID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7dGhpcy54eHh9fX0gdHJpcGxlIGJyYWNlcyBmb3IgbG9vcCBpdGVtc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnRoaXNcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKF8sIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7YWxpYXMueHh4fX19IHRyaXBsZSBicmFjZXMgZm9yIG5hbWVkIGxvb3AgYWxpYXNlc1xuICAvLyBUaGlzIGNhdGNoZXMgYW55IHJlbWFpbmluZyBhbGlhcy5maWVsZCBwYXR0ZXJucyB3aXRoIHRyaXBsZSBicmFjZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccyooXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBwcm9wZXJ0aWVzLnh4eCBvciB0aGlzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7e3RoaXN9fX0gZm9yIHNjYWxhciBhcnJheXMgd2l0aCBIVE1MIGNvbnRlbnRcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccyp0aGlzXFxzKlxcfVxcfVxcfS9nLFxuICAgICc8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkc3ViSXRlbSA/PyAkaXRlbSA/PyBcXCdcXCcpOyA/PidcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzfX0gc2ltcGxlIHJlZmVyZW5jZSAoZm9yIHNjYWxhciBhcnJheXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqdGhpc1xccypcXH1cXH0vZyxcbiAgICAnPD9waHAgZWNobyBlc2NfaHRtbCgkc3ViSXRlbSA/PyAkaXRlbSA/PyBcXCdcXCcpOyA/PidcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzLnh4eC55eXl9fSBkZWVwIG5lc3RlZCByZWZlcmVuY2VzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH0vZyxcbiAgICAoXywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBmaWVsZDIgPT09ICd1cmwnIHx8IGZpZWxkMiA9PT0gJ3NyYycgfHwgZmllbGQyID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJGl0ZW1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7dGhpcy54eHh9fSByZWZlcmVuY2VzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxccypcXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBmaWVsZCA9PT0gJ3VybCcgfHwgZmllbGQgPT09ICdzcmMnIHx8IGZpZWxkID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3Byb3BlcnRpZXMueHh4Lnl5eS56enouLi59fSBkZWVwbHkgbmVzdGVkIHByb3BlcnR5IGFjY2VzcyAoYW55IGRlcHRoKVxuICAvLyBlLmcuLCB7e3Byb3BlcnRpZXMubGVmdF9jb2x1bW4uY3RhLmxpbmsubGFiZWx9fSAtPiAkbGVmdENvbHVtblsnY3RhJ11bJ2xpbmsnXVsnbGFiZWwnXVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJCR7Y2FtZWxQcm9wfSA/PyAnJyk7ID8+YDtcbiAgICAgIH1cbiAgICAgIC8vIEJ1aWxkIG5lc3RlZCBhcnJheSBhY2Nlc3MgZm9yIHJlbWFpbmluZyBwYXJ0c1xuICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGFydHMuc2xpY2UoMSkubWFwKChwOiBzdHJpbmcpID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyB7e3h4eC55eXl9fSBwYXR0ZXJucyAobGlrZWx5IGxvb3AgaXRlbSByZWZlcmVuY2VzIHdpdGhvdXQgdGhpcy4pXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsrXFxzKihcXHcrKVxcLihcXHcrKVxccypcXH0rXFx9L2csXG4gICAgKF8sIG9iaiwgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBhIFBIUCBleHByZXNzaW9uXG4gICAgICBpZiAob2JqLmluY2x1ZGVzKCckJykgfHwgb2JqLmluY2x1ZGVzKCdwaHAnKSkgcmV0dXJuIGB7eyR7b2JqfS4ke2ZpZWxkfX19YDtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBmaWVsZCA9PT0gJ3VybCcgfHwgZmllbGQgPT09ICdzcmMnIHx8IGZpZWxkID09PSAnaHJlZicgfHwgZmllbGQgPT09ICdsYWJlbCcgPyBcbiAgICAgICAgKGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCcpIDogJ2VzY19odG1sJztcbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW29ial0gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCR7aXRlbVZhcn1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zIHNwZWNpZmljYWxseVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHh9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfSA/PyAnIycpOyA/PlwiYDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyBocmVmPVwie3suLi59fVwiIHBhdHRlcm5zIChmb3IgbG9vcCBpdGVtIHJlZmVyZW5jZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7KyhbXn1dKylcXH0rXFx9XCIvZyxcbiAgICAoXywgZXhwcikgPT4ge1xuICAgICAgaWYgKGV4cHIuaW5jbHVkZXMoJzw/cGhwJykpIHJldHVybiBgaHJlZj1cIiR7ZXhwcn1cImA7XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgdGhpcy54eHggcGF0dGVyblxuICAgICAgY29uc3QgdGhpc01hdGNoID0gZXhwci5tYXRjaCgvXlxccyp0aGlzXFwuKFxcdyspKD86XFwuKFxcdyspKT9cXHMqJC8pO1xuICAgICAgaWYgKHRoaXNNYXRjaCkge1xuICAgICAgICBjb25zdCBbLCBmaWVsZDEsIGZpZWxkMl0gPSB0aGlzTWF0Y2g7XG4gICAgICAgIGlmIChmaWVsZDIpIHtcbiAgICAgICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnIycpOyA/PlwiYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bJyR7ZmllbGQxfSddID8/ICcjJyk7ID8+XCJgO1xuICAgICAgfVxuICAgICAgcmV0dXJuICdocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCRpdGVtW1xcJ3VybFxcJ10gPz8gJGl0ZW1bXFwnbGlua1xcJ11bXFwndXJsXFwnXSA/PyBcXCcjXFwnKTsgPz5cIic7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ2xlYW4gdXAgYW55IHN0cmF5IGN1cmx5IGJyYWNlcyBhcm91bmQgUEhQIGVjaG8gc3RhdGVtZW50c1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7KDxcXD9waHAgZWNobykvZywgJyQxJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC8oOyBcXD8+KVxcfS9nLCAnJDEnKTtcbiAgXG4gIHJldHVybiBwaHAudHJpbSgpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhdHRyaWJ1dGUgZXh0cmFjdGlvbiBjb2RlXG4gKi9cbmNvbnN0IGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbiA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCB2aWRlb05vcm1hbGl6YXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICAvLyBPbmx5IHRoZSBpbm5lckJsb2Nrc0ZpZWxkIHJpY2h0ZXh0IHVzZXMgJGNvbnRlbnQg4oCUIHNraXAgYXR0cmlidXRlIGV4dHJhY3Rpb24gZm9yIGl0XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ID09PSBpbm5lckJsb2Nrc0ZpZWxkKSBjb250aW51ZTtcbiAgICAvLyBwYWdpbmF0aW9uIGl0ZW1zIGFyZSBhdXRvLWdlbmVyYXRlZCBmcm9tIFdQX1F1ZXJ5IOKAlCBubyBhdHRyaWJ1dGUgdG8gZXh0cmFjdFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgY2FtZWxLZXkgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGdldFBocERlZmF1bHRWYWx1ZShwcm9wZXJ0eSk7XG4gICAgXG4gICAgZXh0cmFjdGlvbnMucHVzaChgJCR7Y2FtZWxLZXl9ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJyR7Y2FtZWxLZXl9J10pID8gJGF0dHJpYnV0ZXNbJyR7Y2FtZWxLZXl9J10gOiAke2RlZmF1bHRWYWx1ZX07YCk7XG5cbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3ZpZGVvJykge1xuICAgICAgdmlkZW9Ob3JtYWxpemF0aW9ucy5wdXNoKGBpZiAoaXNfYXJyYXkoJCR7Y2FtZWxLZXl9KSkge1xuICBpZiAoZW1wdHkoJCR7Y2FtZWxLZXl9WydpZCddKSAmJiAhZW1wdHkoJCR7Y2FtZWxLZXl9WydzcmMnXSkgJiYgcHJlZ19tYXRjaCgnIyg/Om1lZGlhcy98aWZyYW1lLykoW0EtWmEtejAtOV0rKSMnLCAoc3RyaW5nKSAkJHtjYW1lbEtleX1bJ3NyYyddLCAkbWF0Y2hlcykpIHtcbiAgICAkJHtjYW1lbEtleX1bJ2lkJ10gPSAkbWF0Y2hlc1sxXTtcbiAgfVxuICBpZiAoZW1wdHkoJCR7Y2FtZWxLZXl9WydzcmMnXSkgJiYgIWVtcHR5KCQke2NhbWVsS2V5fVsnaWQnXSkpIHtcbiAgICAkJHtjYW1lbEtleX1bJ3NyYyddID0gJ2h0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy8nIC4gcmF3dXJsZW5jb2RlKChzdHJpbmcpICQke2NhbWVsS2V5fVsnaWQnXSkgLiAnLmpzb25wJztcbiAgfVxufWApO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIFsuLi5leHRyYWN0aW9ucywgLi4udmlkZW9Ob3JtYWxpemF0aW9uc10uam9pbignXFxuJyk7XG59O1xuXG4vKipcbiAqIFdyYXAgdGVtcGxhdGUgd2l0aCBibG9jayB3cmFwcGVyIHRoYXQgaGFuZGxlcyBhbGlnbm1lbnRcbiAqIEFkZHMgdGhlIGFsaWdubWVudCBjbGFzcyAoYWxpZ25ub25lLCBhbGlnbndpZGUsIGFsaWduZnVsbCkgYmFzZWQgb24gYmxvY2sgc2V0dGluZ3NcbiAqL1xuY29uc3Qgd3JhcFdpdGhCbG9ja1dyYXBwZXIgPSAodGVtcGxhdGU6IHN0cmluZywgY29tcG9uZW50SWQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIC8vIENvbnZlcnQgY29tcG9uZW50IElEIHRvIGNsYXNzIG5hbWUgKHNuYWtlX2Nhc2UgdG8ga2ViYWItY2FzZSlcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50SWQucmVwbGFjZSgvXy9nLCAnLScpO1xuICBcbiAgLy8gV3JhcCB0aGUgdGVtcGxhdGUgaW4gYSBkaXYgdGhhdCB1c2VzIFdvcmRQcmVzcydzIGJsb2NrIHdyYXBwZXIgYXR0cmlidXRlc1xuICAvLyBUaGlzIGhhbmRsZXMgYWxpZ25tZW50IGNsYXNzZXMgYXV0b21hdGljYWxseVxuICByZXR1cm4gYDxkaXYgPD9waHAgZWNobyBnZXRfYmxvY2tfd3JhcHBlcl9hdHRyaWJ1dGVzKFsnY2xhc3MnID0+ICcke2NsYXNzTmFtZX0nXSk7ID8+PlxuJHt0ZW1wbGF0ZX1cbjwvZGl2PmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIFBIUCBjb2RlIHRvIGNvbnZlcnQgZmllbGQgbWFwcGluZyB2YWx1ZSB0byBQSFAgYXJyYXkgc3ludGF4XG4gKi9cbmNvbnN0IGZpZWxkTWFwcGluZ1RvUGhwID0gKG1hcHBpbmc6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwcGluZ1ZhbHVlPik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGVudHJpZXM6IHN0cmluZ1tdID0gW107XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhtYXBwaW5nKSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAvLyBTaW1wbGUgc3RyaW5nIG1hcHBpbmdcbiAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+ICcke3ZhbHVlfSdgKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUudHlwZSkge1xuICAgICAgLy8gQ29tcGxleCBtYXBwaW5nXG4gICAgICBzd2l0Y2ggKHZhbHVlLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnc3RhdGljJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdzdGF0aWMnLCAndmFsdWUnID0+ICckeyh2YWx1ZSBhcyBhbnkpLnZhbHVlIHx8ICcnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hbnVhbCc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnbWFudWFsJ11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbWV0YSc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnbWV0YScsICdrZXknID0+ICckeyh2YWx1ZSBhcyBhbnkpLmtleSB8fCAnJ30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd0YXhvbm9teSc6XG4gICAgICAgICAgY29uc3QgdGF4VmFsdWUgPSB2YWx1ZSBhcyB7IHR5cGU6ICd0YXhvbm9teSc7IHRheG9ub215OiBzdHJpbmc7IGZvcm1hdD86IHN0cmluZyB9O1xuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ3RheG9ub215JywgJ3RheG9ub215JyA9PiAnJHt0YXhWYWx1ZS50YXhvbm9teX0nLCAnZm9ybWF0JyA9PiAnJHt0YXhWYWx1ZS5mb3JtYXQgfHwgJ2ZpcnN0J30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdjdXN0b20nOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ2N1c3RvbScsICdjYWxsYmFjaycgPT4gJyR7KHZhbHVlIGFzIGFueSkuY2FsbGJhY2sgfHwgJyd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBgW1xcbiR7ZW50cmllcy5qb2luKCcsXFxuJyl9XFxuICBdYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgcGFnaW5hdGlvbiBQSFAgY29kZSBmb3IgYSBkeW5hbWljIGFycmF5IHF1ZXJ5LlxuICogUmV0dXJucyB0aGUgcGFnaW5hdGlvbiBibG9jayB0byBhcHBlbmQgYWZ0ZXIgdGhlIFdQX1F1ZXJ5IGV4ZWN1dGlvbi5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdpbmF0aW9uUGhwID0gKFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBwYWdpbmF0aW9uUHJvcE5hbWU6IHN0cmluZ1xuKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGBcbiAgLy8gUGFnaW5hdGlvblxuICAkJHtwYWdpbmF0aW9uUHJvcE5hbWV9ID0gW107XG4gICQke2F0dHJOYW1lfV9wYWdpbmF0aW9uX2VuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZCddID8/IHRydWU7XG4gIGlmICgkJHthdHRyTmFtZX1fcGFnaW5hdGlvbl9lbmFibGVkICYmICRxdWVyeS0+bWF4X251bV9wYWdlcyA+IDEgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICQke3BhZ2luYXRpb25Qcm9wTmFtZX0gPSBoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24oJGhmX3BhZ2VkLCAkcXVlcnktPm1heF9udW1fcGFnZXMsICcke2BoZl9wYWdlXyR7YXR0ck5hbWV9YH0nKTtcbiAgfWA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHRoZSBwYWdlZCB2YXJpYWJsZSBleHRyYWN0aW9uIGFuZCBXUF9RdWVyeSBwYWdlZCBhcmcgZm9yIHBhZ2luYXRpb24uXG4gKi9cbmNvbnN0IGdlbmVyYXRlUGFnZWRQaHAgPSAoYXR0ck5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHBhcmFtS2V5ID0gYGhmX3BhZ2VfJHthdHRyTmFtZX1gO1xuICByZXR1cm4gYFxuICAvLyBSZWFkIGN1cnJlbnQgcGFnZSBmcm9tIGN1c3RvbSBxdWVyeSBwYXJhbWV0ZXJcbiAgJGhmX3BhZ2VkID0gaXNzZXQoJF9HRVRbJyR7cGFyYW1LZXl9J10pID8gbWF4KDEsIGludHZhbCgkX0dFVFsnJHtwYXJhbUtleX0nXSkpIDogMTtgO1xufTtcblxuLyoqXG4gKiBCdWlsZCBQSFAgYXJyYXlfbWFwIGV4cHJlc3Npb24gdG8gcmVzaGFwZSBzdGFuZGFyZCBoZWxwZXIgaXRlbXMgaW50byB0aGVcbiAqIHRlbXBsYXRlJ3MgZXhwZWN0ZWQgaXRlbSBzaGFwZS4gIFJldHVybnMgbnVsbCB3aGVuIG5vIHJlc2hhcGluZyBpcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtIGl0ZW1Qcm9wZXJ0aWVzICBUaGUgY29tcG9uZW50J3MgYXJyYXkgaXRlbSBwcm9wZXJ0eSBzY2hlbWEgKGl0ZW1zLnByb3BlcnRpZXMpXG4gKiBAcGFyYW0gc3RhbmRhcmRGaWVsZHMgIFRoZSBmbGF0IGZpZWxkIG5hbWVzIHRoZSBoZWxwZXIgcmV0dXJucyAoZS5nLiBbJ2xhYmVsJywndXJsJ10pXG4gKi9cbmNvbnN0IGJ1aWxkUmVzaGFwZVBocCA9IChcbiAgaXRlbVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4gfCB1bmRlZmluZWQsXG4gIHN0YW5kYXJkRmllbGRzOiBzdHJpbmdbXSxcbik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBpZiAoIWl0ZW1Qcm9wZXJ0aWVzKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCB0b3BLZXlzID0gT2JqZWN0LmtleXMoaXRlbVByb3BlcnRpZXMpO1xuXG4gIC8vIElmIGV2ZXJ5IHRvcC1sZXZlbCBrZXkgSVMgYSBzdGFuZGFyZCBmaWVsZCB0aGUgc2hhcGVzIGFscmVhZHkgbWF0Y2hcbiAgaWYgKHRvcEtleXMuZXZlcnkoayA9PiBzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcyhrKSkpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHBhaXJzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wZXJ0aWVzKSkge1xuICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICBwYWlycy5wdXNoKGAnJHtrZXl9JyA9PiAkX19pdGVtWycke2tleX0nXWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnbGluaycgfHwgcHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCdsYWJlbCcpKSBzdWIucHVzaChgJ2xhYmVsJyA9PiAkX19pdGVtWydsYWJlbCddYCk7XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ3VybCcpKSAgIHN1Yi5wdXNoKGAndXJsJyAgID0+ICRfX2l0ZW1bJ3VybCddYCk7XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJyR7a2V5fScgPT4gWyR7c3ViLmpvaW4oJywgJyl9XWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGZvciAoY29uc3Qgc3ViS2V5IG9mIE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKHN1YktleSkpIHtcbiAgICAgICAgICBzdWIucHVzaChgJyR7c3ViS2V5fScgPT4gJF9faXRlbVsnJHtzdWJLZXl9J11gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN1Yi5sZW5ndGgpIHBhaXJzLnB1c2goYCcke2tleX0nID0+IFske3N1Yi5qb2luKCcsICcpfV1gKTtcbiAgICB9XG4gIH1cblxuICBpZiAocGFpcnMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGBbJHtwYWlycy5qb2luKCcsICcpfV1gO1xufTtcblxuLyoqXG4gKiBCdWlsZCBlcXVpdmFsZW50IEpTIHJlc2hhcGUgZXhwcmVzc2lvbiBmb3IgZWRpdG9yIHByZXZpZXcuXG4gKiBSZXR1cm5zIG51bGwgd2hlbiBubyByZXNoYXBpbmcgaXMgbmVlZGVkLlxuICovXG5jb25zdCBidWlsZFJlc2hhcGVKcyA9IChcbiAgaXRlbVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4gfCB1bmRlZmluZWQsXG4gIHN0YW5kYXJkRmllbGRzOiBzdHJpbmdbXSxcbik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBpZiAoIWl0ZW1Qcm9wZXJ0aWVzKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCB0b3BLZXlzID0gT2JqZWN0LmtleXMoaXRlbVByb3BlcnRpZXMpO1xuICBpZiAodG9wS2V5cy5ldmVyeShrID0+IHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGspKSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgcGFpcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbVByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIHBhaXJzLnB1c2goYCR7a2V5fTogaXRlbS4ke2tleX1gKTtcbiAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ2xpbmsnIHx8IHByb3AudHlwZSA9PT0gJ2J1dHRvbicpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygnbGFiZWwnKSkgc3ViLnB1c2goYGxhYmVsOiBpdGVtLmxhYmVsYCk7XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ3VybCcpKSAgIHN1Yi5wdXNoKGB1cmw6IGl0ZW0udXJsYCk7XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJHtrZXl9OiB7ICR7c3ViLmpvaW4oJywgJyl9IH1gKTtcbiAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBmb3IgKGNvbnN0IHN1YktleSBvZiBPYmplY3Qua2V5cyhwcm9wLnByb3BlcnRpZXMpKSB7XG4gICAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcyhzdWJLZXkpKSB7XG4gICAgICAgICAgc3ViLnB1c2goYCR7c3ViS2V5fTogaXRlbS4ke3N1YktleX1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN1Yi5sZW5ndGgpIHBhaXJzLnB1c2goYCR7a2V5fTogeyAke3N1Yi5qb2luKCcsICcpfSB9YCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHBhaXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBgKHsgJHtwYWlycy5qb2luKCcsICcpfSB9KWA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGJyZWFkY3J1bWJzIGFycmF5IGV4dHJhY3Rpb24gY29kZSBmb3IgcmVuZGVyLnBocC5cbiAqIENhbGxzIGhhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMoKSBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSByZXR1cm5zIGFuIGVtcHR5IGFycmF5LlxuICovXG5jb25zdCBnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgaXRlbVByb3BlcnRpZXM/OiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcmVzaGFwZUV4cHIgPSBidWlsZFJlc2hhcGVQaHAoaXRlbVByb3BlcnRpZXMsIFsnbGFiZWwnLCAndXJsJ10pO1xuICBjb25zdCBhc3NpZ25JdGVtcyA9IHJlc2hhcGVFeHByXG4gICAgPyBgJF9fcmF3ID0gaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcygpO1xuICAgICQke2F0dHJOYW1lfSA9IGFycmF5X21hcChmdW5jdGlvbigkX19pdGVtKSB7IHJldHVybiAke3Jlc2hhcGVFeHByfTsgfSwgJF9fcmF3KTtgXG4gICAgOiBgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcygpO2A7XG5cbiAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAoYnJlYWRjcnVtYnMpXG4kJHthdHRyTmFtZX1FbmFibGVkID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9RW5hYmxlZCddID8/IHRydWU7XG4kJHthdHRyTmFtZX0gPSBbXTtcbmlmICgkJHthdHRyTmFtZX1FbmFibGVkKSB7XG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zJykpIHtcbiAgICAkcmVzb2x2ZXJfcGF0aCA9IGRlZmluZWQoJ0hBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVInKVxuICAgICAgPyBIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSIC4gJ2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJ1xuICAgICAgOiBkaXJuYW1lKF9fRklMRV9fKSAuICcvLi4vaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnO1xuICAgIGlmIChmaWxlX2V4aXN0cygkcmVzb2x2ZXJfcGF0aCkpIHtcbiAgICAgIHJlcXVpcmVfb25jZSAkcmVzb2x2ZXJfcGF0aDtcbiAgICB9XG4gIH1cbiAgaWYgKGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcycpKSB7XG4gICAgJHthc3NpZ25JdGVtc31cbiAgfVxufVxuYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGF4b25vbXkgdGVybXMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICovXG5jb25zdCBnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgY29uZmlnOiBUYXhvbm9teUFycmF5Q29uZmlnLFxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBtYXhJdGVtcyA9IGNvbmZpZy5tYXhJdGVtcyA/PyAtMTtcbiAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gY29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgY29uc3QgcmVzaGFwZUV4cHIgPSBidWlsZFJlc2hhcGVQaHAoaXRlbVByb3BlcnRpZXMsIFsnbGFiZWwnLCAndXJsJywgJ3NsdWcnXSk7XG5cbiAgLy8gQnVpbGQgdGhlIHBlci10ZXJtIGFzc2lnbm1lbnQ6IGVpdGhlciBmbGF0IG9yIHJlc2hhcGVkXG4gIGxldCB0ZXJtQXNzaWdubWVudDogc3RyaW5nO1xuICBpZiAocmVzaGFwZUV4cHIpIHtcbiAgICB0ZXJtQXNzaWdubWVudCA9IGAgICAgICAgICRfX2l0ZW0gPSBbJ2xhYmVsJyA9PiAkdGVybS0+bmFtZSwgJ3VybCcgPT4gZ2V0X3Rlcm1fbGluaygkdGVybSksICdzbHVnJyA9PiAkdGVybS0+c2x1Z107XG4gICAgICAgICQke2F0dHJOYW1lfVtdID0gJHtyZXNoYXBlRXhwcn07YDtcbiAgfSBlbHNlIHtcbiAgICB0ZXJtQXNzaWdubWVudCA9IGAgICAgICAgICQke2F0dHJOYW1lfVtdID0gW1xuICAgICAgICAgICdsYWJlbCcgPT4gJHRlcm0tPm5hbWUsXG4gICAgICAgICAgJ3VybCcgICA9PiBnZXRfdGVybV9saW5rKCR0ZXJtKSxcbiAgICAgICAgICAnc2x1ZycgID0+ICR0ZXJtLT5zbHVnLFxuICAgICAgICBdO2A7XG4gIH1cblxuICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9ICh0YXhvbm9teSB0ZXJtcylcbiQke2F0dHJOYW1lfUVuYWJsZWQgID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9RW5hYmxlZCddICA/PyBmYWxzZTtcbiQke2F0dHJOYW1lfVRheG9ub215ID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9VGF4b25vbXknXSA/PyAnJHtkZWZhdWx0VGF4b25vbXl9JztcbiQke2F0dHJOYW1lfVNvdXJjZSAgID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gICA/PyAnYXV0byc7XG4kJHthdHRyTmFtZX0gPSBbXTtcbmlmICgkJHthdHRyTmFtZX1FbmFibGVkKSB7XG4gIGlmICgkJHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSB7XG4gICAgJCR7YXR0ck5hbWV9ID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9J10gPz8gW107XG4gIH0gZWxzZSB7XG4gICAgJHRlcm1zID0gd3BfZ2V0X3Bvc3RfdGVybXMoZ2V0X3RoZV9JRCgpLCAkJHthdHRyTmFtZX1UYXhvbm9teSwgWydudW1iZXInID0+ICR7bWF4SXRlbXN9XSk7XG4gICAgaWYgKCFpc193cF9lcnJvcigkdGVybXMpKSB7XG4gICAgICBmb3JlYWNoICgkdGVybXMgYXMgJHRlcm0pIHtcbiR7dGVybUFzc2lnbm1lbnR9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBwYWdpbmF0aW9uIGFycmF5IGV4dHJhY3Rpb24gY29kZSBmb3IgcmVuZGVyLnBocC5cbiAqIFJlZmVyZW5jZXMgdGhlIFdQX1F1ZXJ5IGluc3RhbmNlICgkcXVlcnkpIHByb2R1Y2VkIGJ5IHRoZSBjb25uZWN0ZWQgcG9zdHMgZmllbGQuXG4gKi9cbmNvbnN0IGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbiA9IChcbiAgZmllbGROYW1lOiBzdHJpbmcsXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIGNvbmZpZzogUGFnaW5hdGlvbkFycmF5Q29uZmlnLFxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjb25uZWN0ZWRBdHRyID0gdG9DYW1lbENhc2UoY29uZmlnLmNvbm5lY3RlZEZpZWxkKTtcbiAgY29uc3QgcmVzaGFwZUV4cHIgPSBidWlsZFJlc2hhcGVQaHAoaXRlbVByb3BlcnRpZXMsIFsnbGFiZWwnLCAndXJsJywgJ2FjdGl2ZSddKTtcblxuICBjb25zdCBhc3NpZ25JdGVtcyA9IHJlc2hhcGVFeHByXG4gICAgPyBgJF9fcmF3ID0gaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uKCRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9LCAkcXVlcnktPm1heF9udW1fcGFnZXMsICdoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nKTtcbiAgICAkJHthdHRyTmFtZX0gPSBhcnJheV9tYXAoZnVuY3Rpb24oJF9faXRlbSkgeyByZXR1cm4gJHtyZXNoYXBlRXhwcn07IH0sICRfX3Jhdyk7YFxuICAgIDogYCQke2F0dHJOYW1lfSA9IGhhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbigkaGZfcGFnZWRfJHtjb25uZWN0ZWRBdHRyfSwgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzLCAnaGZfcGFnZV8ke2Nvbm5lY3RlZEF0dHJ9Jyk7YDtcblxuICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChwYWdpbmF0aW9uIOKAlCBjb25uZWN0ZWQgdG8gJyR7Y29uZmlnLmNvbm5lY3RlZEZpZWxkfScpXG4kJHthdHRyTmFtZX1FbmFibGVkID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9RW5hYmxlZCddID8/IHRydWU7XG4kJHthdHRyTmFtZX0gPSBbXTtcbmlmICgkJHthdHRyTmFtZX1FbmFibGVkICYmIGlzc2V0KCRxdWVyeSkgJiYgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzID4gMSkge1xuICBpZiAoIWZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uJykpIHtcbiAgICAkcmVzb2x2ZXJfcGF0aCA9IGRlZmluZWQoJ0hBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVInKVxuICAgICAgPyBIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSIC4gJ2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJ1xuICAgICAgOiBkaXJuYW1lKF9fRklMRV9fKSAuICcvLi4vaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnO1xuICAgIGlmIChmaWxlX2V4aXN0cygkcmVzb2x2ZXJfcGF0aCkpIHtcbiAgICAgIHJlcXVpcmVfb25jZSAkcmVzb2x2ZXJfcGF0aDtcbiAgICB9XG4gIH1cbiAgaWYgKGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uJykpIHtcbiAgICAkaGZfcGFnZWRfJHtjb25uZWN0ZWRBdHRyfSA9IGlzc2V0KCRfR0VUWydoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nXSkgPyBtYXgoMSwgaW50dmFsKCRfR0VUWydoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nXSkpIDogMTtcbiAgICAke2Fzc2lnbkl0ZW1zfVxuICB9XG59XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBkeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gY29kZSBmb3IgcmVuZGVyLnBocFxuICogU3VwcG9ydHMgYm90aCBtYW51YWwgcG9zdCBzZWxlY3Rpb24gYW5kIHF1ZXJ5IGJ1aWxkZXIgbW9kZXNcbiAqL1xuY29uc3QgZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgY29uZmlnOiBEeW5hbWljQXJyYXlDb25maWdcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG1hcHBpbmdQaHAgPSBjb25maWcuZmllbGRNYXBwaW5nIFxuICAgID8gZmllbGRNYXBwaW5nVG9QaHAoY29uZmlnLmZpZWxkTWFwcGluZykgXG4gICAgOiAnW10nO1xuICBcbiAgY29uc3QgaXNRdWVyeU1vZGUgPSBjb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ3F1ZXJ5JztcbiAgY29uc3QgaGFzUGFnaW5hdGlvbiA9IGlzUXVlcnlNb2RlICYmICEhY29uZmlnLnBhZ2luYXRpb247XG4gIGNvbnN0IHBhZ2luYXRpb25Qcm9wTmFtZSA9IGNvbmZpZy5wYWdpbmF0aW9uPy5wcm9wZXJ0eU5hbWUgfHwgJ3BhZ2luYXRpb24nO1xuICBcbiAgLy8gQ29tbW9uIGNvZGUgZm9yIGxvYWRpbmcgdGhlIGZpZWxkIHJlc29sdmVyXG4gIGNvbnN0IGxvYWRSZXNvbHZlciA9IGBcbiAgLy8gRW5zdXJlIGZpZWxkIHJlc29sdmVyIGlzIGxvYWRlZFxuICBpZiAoIWZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9tYXBfcG9zdF90b19pdGVtJykpIHtcbiAgICAkcmVzb2x2ZXJfcGF0aCA9IGRlZmluZWQoJ0hBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVInKSBcbiAgICAgID8gSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUiAuICdpbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCdcbiAgICAgIDogZGlybmFtZShfX0ZJTEVfXykgLiAnLy4uL2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJztcbiAgICBpZiAoZmlsZV9leGlzdHMoJHJlc29sdmVyX3BhdGgpKSB7XG4gICAgICByZXF1aXJlX29uY2UgJHJlc29sdmVyX3BhdGg7XG4gICAgfVxuICB9YDtcblxuICAvLyBQYWdpbmF0aW9uIFBIUCBzbmlwcGV0cyAoZW1wdHkgc3RyaW5ncyB3aGVuIG5vIHBhZ2luYXRpb24pXG4gIGNvbnN0IHBhZ2VkRXh0cmFjdGlvbiA9IGhhc1BhZ2luYXRpb24gPyBnZW5lcmF0ZVBhZ2VkUGhwKGF0dHJOYW1lKSA6ICcnO1xuICBjb25zdCBwYWdlZEFyZyA9IGhhc1BhZ2luYXRpb24gPyBgXFxuICAgICdwYWdlZCcgICAgICAgICAgPT4gJGhmX3BhZ2VkLGAgOiAnJztcbiAgY29uc3QgcGFnaW5hdGlvbkJsb2NrID0gaGFzUGFnaW5hdGlvbiA/IGdlbmVyYXRlUGFnaW5hdGlvblBocChhdHRyTmFtZSwgcGFnaW5hdGlvblByb3BOYW1lKSA6ICcnO1xuICAvLyBJbml0aWFsaXplIHBhZ2luYXRpb24gdmFyaWFibGUgdG8gZW1wdHkgYXJyYXkgd2hlbiBub3QgaW4gcXVlcnkgbW9kZVxuICBjb25zdCBwYWdpbmF0aW9uSW5pdCA9IGhhc1BhZ2luYXRpb24gPyBgXFxuJCR7cGFnaW5hdGlvblByb3BOYW1lfSA9IFtdO2AgOiAnJztcblxuICBpZiAoY29uZmlnLnJlbmRlck1vZGUgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICAvLyBUZW1wbGF0ZSBtb2RlIC0gc3RvcmUgcG9zdHMgZm9yIHRlbXBsYXRlIHJlbmRlcmluZ1xuICAgIGNvbnN0IHRlbXBsYXRlUGF0aCA9IGNvbmZpZy50ZW1wbGF0ZVBhdGggfHwgYHRlbXBsYXRlLXBhcnRzL2hhbmRvZmYvJHtmaWVsZE5hbWV9LWl0ZW0ucGhwYDtcbiAgICBcbiAgICBpZiAoaXNRdWVyeU1vZGUpIHtcbiAgICAgIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSAtIHVzZSBXUF9RdWVyeSB3aXRoIHF1ZXJ5IGFyZ3NcbiAgICAgIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHF1ZXJ5IGJ1aWxkZXIgKyB0ZW1wbGF0ZSBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7XG4kJHthdHRyTmFtZX1fcG9zdHMgPSBbXTske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgLSBidWlsZCBXUF9RdWVyeSBmcm9tIHNhdmVkIGFyZ3NcbiAgJHF1ZXJ5X2FyZ3MgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1RdWVyeUFyZ3MnXSA/PyBbXTske3BhZ2VkRXh0cmFjdGlvbn1cbiAgXG4gIC8vIEJ1aWxkIFdQX1F1ZXJ5IGFyZ3VtZW50c1xuICAkd3BfcXVlcnlfYXJncyA9IFtcbiAgICAncG9zdF90eXBlJyAgICAgID0+ICRxdWVyeV9hcmdzWydwb3N0X3R5cGUnXSA/PyAnJHtjb25maWcuZGVmYXVsdFBvc3RUeXBlIHx8IGNvbmZpZy5wb3N0VHlwZXNbMF0gfHwgJ3Bvc3QnfScsXG4gICAgJ3Bvc3RzX3Blcl9wYWdlJyA9PiAkcXVlcnlfYXJnc1sncG9zdHNfcGVyX3BhZ2UnXSA/PyAke2NvbmZpZy5tYXhJdGVtcyB8fCA2fSxcbiAgICAnb3JkZXJieScgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlcmJ5J10gPz8gJ2RhdGUnLFxuICAgICdvcmRlcicgICAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyJ10gPz8gJ0RFU0MnLFxuICAgICdwb3N0X3N0YXR1cycgICAgPT4gJ3B1Ymxpc2gnLCR7cGFnZWRBcmd9XG4gIF07XG4gIFxuICAvLyBFeGNsdWRlIHRoZSBjdXJyZW50IHBvc3QgdG8gcHJldmVudCBzZWxmLXJlZmVyZW5jZVxuICAkY3VycmVudF9wb3N0X2lkID0gZ2V0X3RoZV9JRCgpO1xuICBpZiAoJGN1cnJlbnRfcG9zdF9pZCkge1xuICAgICR3cF9xdWVyeV9hcmdzWydwb3N0X19ub3RfaW4nXSA9IFskY3VycmVudF9wb3N0X2lkXTtcbiAgfVxuICBcbiAgLy8gQWRkIHRheG9ub215IHF1ZXJpZXMgaWYgcHJlc2VudFxuICBpZiAoIWVtcHR5KCRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSkpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10gPSBhcnJheV9tYXAoZnVuY3Rpb24oJHRxKSB7XG4gICAgICByZXR1cm4gW1xuICAgICAgICAndGF4b25vbXknID0+ICR0cVsndGF4b25vbXknXSA/PyAnJyxcbiAgICAgICAgJ2ZpZWxkJyAgICA9PiAkdHFbJ2ZpZWxkJ10gPz8gJ3Rlcm1faWQnLFxuICAgICAgICAndGVybXMnICAgID0+ICR0cVsndGVybXMnXSA/PyBbXSxcbiAgICAgICAgJ29wZXJhdG9yJyA9PiAkdHFbJ29wZXJhdG9yJ10gPz8gJ0lOJyxcbiAgICAgIF07XG4gICAgfSwgJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKTtcbiAgfVxuICBcbiAgJHF1ZXJ5ID0gbmV3IFdQX1F1ZXJ5KCR3cF9xdWVyeV9hcmdzKTtcbiAgJCR7YXR0ck5hbWV9X3Bvc3RzID0gJHF1ZXJ5LT5wb3N0czske3BhZ2luYXRpb25CbG9ja31cbiAgd3BfcmVzZXRfcG9zdGRhdGEoKTtcbn1cbi8vIEZvciB0ZW1wbGF0ZSBtb2RlLCB0aGUgdGVtcGxhdGUgd2lsbCBpdGVyYXRlIG92ZXIgJCR7YXR0ck5hbWV9X3Bvc3RzXG5gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBNYW51YWwgc2VsZWN0aW9uIG1vZGUgLSBmZXRjaCBzcGVjaWZpYyBwb3N0c1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAoc2VsZWN0IHBvc3RzICsgdGVtcGxhdGUgbW9kZSlcbiQke2F0dHJOYW1lfV9zb3VyY2UgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSA/PyAncXVlcnknO1xuJCR7YXR0ck5hbWV9X3Bvc3RzID0gW107JHtwYWdpbmF0aW9uSW5pdH1cblxuaWYgKCQke2F0dHJOYW1lfV9zb3VyY2UgPT09ICdzZWxlY3QnKSB7XG4gICRzZWxlY3RlZF9wb3N0cyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHMnXSA/PyBbXTtcbiAgXG4gIGlmICghZW1wdHkoJHNlbGVjdGVkX3Bvc3RzKSkge1xuICAgICRwb3N0X2lkcyA9IGFycmF5X2ZpbHRlcihhcnJheV9tYXAoZnVuY3Rpb24oJHApIHsgXG4gICAgICByZXR1cm4gaXNzZXQoJHBbJ2lkJ10pID8gaW50dmFsKCRwWydpZCddKSA6IDA7IFxuICAgIH0sICRzZWxlY3RlZF9wb3N0cykpO1xuICAgIFxuICAgIGlmICghZW1wdHkoJHBvc3RfaWRzKSkge1xuICAgICAgJCR7YXR0ck5hbWV9X3Bvc3RzID0gZ2V0X3Bvc3RzKFtcbiAgICAgICAgJ3Bvc3RfX2luJyAgICAgICA9PiAkcG9zdF9pZHMsXG4gICAgICAgICdvcmRlcmJ5JyAgICAgICAgPT4gJ3Bvc3RfX2luJyxcbiAgICAgICAgJ3Bvc3RzX3Blcl9wYWdlJyA9PiBjb3VudCgkcG9zdF9pZHMpLFxuICAgICAgICAncG9zdF9zdGF0dXMnICAgID0+ICdwdWJsaXNoJyxcbiAgICAgICAgJ3Bvc3RfdHlwZScgICAgICA9PiAnYW55JyxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxufVxuLy8gRm9yIHRlbXBsYXRlIG1vZGUsIHRoZSB0ZW1wbGF0ZSB3aWxsIGl0ZXJhdGUgb3ZlciAkJHthdHRyTmFtZX1fcG9zdHNcbmA7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIE1hcHBlZCBtb2RlIC0gY29udmVydCBwb3N0cyB0byBpdGVtIHN0cnVjdHVyZVxuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIHdpdGggZmllbGQgbWFwcGluZ1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAocXVlcnkgYnVpbGRlciArIG1hcHBlZCBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7JHtwYWdpbmF0aW9uSW5pdH1cblxuaWYgKCQke2F0dHJOYW1lfV9zb3VyY2UgPT09ICdxdWVyeScpIHtcbiAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIC0gYnVpbGQgV1BfUXVlcnkgZnJvbSBzYXZlZCBhcmdzXG4gICRxdWVyeV9hcmdzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9UXVlcnlBcmdzJ10gPz8gW107XG4gICRmaWVsZF9tYXBwaW5nID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9RmllbGRNYXBwaW5nJ10gPz8gJHttYXBwaW5nUGhwfTtcbiR7bG9hZFJlc29sdmVyfSR7cGFnZWRFeHRyYWN0aW9ufVxuICBcbiAgLy8gQnVpbGQgV1BfUXVlcnkgYXJndW1lbnRzXG4gICR3cF9xdWVyeV9hcmdzID0gW1xuICAgICdwb3N0X3R5cGUnICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RfdHlwZSddID8/ICcke2NvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgY29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCd9JyxcbiAgICAncG9zdHNfcGVyX3BhZ2UnID0+ICRxdWVyeV9hcmdzWydwb3N0c19wZXJfcGFnZSddID8/ICR7Y29uZmlnLm1heEl0ZW1zIHx8IDZ9LFxuICAgICdvcmRlcmJ5JyAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyYnknXSA/PyAnZGF0ZScsXG4gICAgJ29yZGVyJyAgICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXInXSA/PyAnREVTQycsXG4gICAgJ3Bvc3Rfc3RhdHVzJyAgICA9PiAncHVibGlzaCcsJHtwYWdlZEFyZ31cbiAgXTtcbiAgXG4gIC8vIEV4Y2x1ZGUgdGhlIGN1cnJlbnQgcG9zdCB0byBwcmV2ZW50IHNlbGYtcmVmZXJlbmNlXG4gICRjdXJyZW50X3Bvc3RfaWQgPSBnZXRfdGhlX0lEKCk7XG4gIGlmICgkY3VycmVudF9wb3N0X2lkKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3Bvc3RfX25vdF9pbiddID0gWyRjdXJyZW50X3Bvc3RfaWRdO1xuICB9XG4gIFxuICAvLyBBZGQgdGF4b25vbXkgcXVlcmllcyBpZiBwcmVzZW50XG4gIGlmICghZW1wdHkoJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKSkge1xuICAgICR3cF9xdWVyeV9hcmdzWyd0YXhfcXVlcnknXSA9IGFycmF5X21hcChmdW5jdGlvbigkdHEpIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgICd0YXhvbm9teScgPT4gJHRxWyd0YXhvbm9teSddID8/ICcnLFxuICAgICAgICAnZmllbGQnICAgID0+ICR0cVsnZmllbGQnXSA/PyAndGVybV9pZCcsXG4gICAgICAgICd0ZXJtcycgICAgPT4gJHRxWyd0ZXJtcyddID8/IFtdLFxuICAgICAgICAnb3BlcmF0b3InID0+ICR0cVsnb3BlcmF0b3InXSA/PyAnSU4nLFxuICAgICAgXTtcbiAgICB9LCAkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pO1xuICB9XG4gIFxuICAkcXVlcnkgPSBuZXcgV1BfUXVlcnkoJHdwX3F1ZXJ5X2FyZ3MpO1xuICBcbiAgLy8gTWFwIHBvc3RzIHRvIHRlbXBsYXRlIHN0cnVjdHVyZVxuICAkJHthdHRyTmFtZX0gPSBbXTtcbiAgaWYgKCRxdWVyeS0+aGF2ZV9wb3N0cygpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9tYXBfcG9zdF90b19pdGVtJykpIHtcbiAgICBmb3JlYWNoICgkcXVlcnktPnBvc3RzIGFzICRwb3N0KSB7XG4gICAgICAkJHthdHRyTmFtZX1bXSA9IGhhbmRvZmZfbWFwX3Bvc3RfdG9faXRlbSgkcG9zdC0+SUQsICRmaWVsZF9tYXBwaW5nKTtcbiAgICB9XG4gIH1cbiAgLy8gQXBwbHkgaXRlbSBvdmVycmlkZXMgKGUuZy4gY2FyZCB0eXBlIGZvciBhbGwgaXRlbXMpIGZyb20gQWR2YW5jZWQgb3B0aW9uc1xuICAkaXRlbV9vdmVycmlkZXMgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzJ10gPz8gW107XG4gIGlmICghZW1wdHkoJGl0ZW1fb3ZlcnJpZGVzKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYXBwbHlfaXRlbV9vdmVycmlkZXMnKSkge1xuICAgIGZvcmVhY2ggKCQke2F0dHJOYW1lfSBhcyAkaSA9PiAkaXRlbSkge1xuICAgICAgJCR7YXR0ck5hbWV9WyRpXSA9IGhhbmRvZmZfYXBwbHlfaXRlbV9vdmVycmlkZXMoJGl0ZW0sICRpdGVtX292ZXJyaWRlcyk7XG4gICAgfVxuICB9JHtwYWdpbmF0aW9uQmxvY2t9XG4gIHdwX3Jlc2V0X3Bvc3RkYXRhKCk7XG59XG4vLyBlbHNlOiBNYW51YWwgbW9kZSB1c2VzICQke2F0dHJOYW1lfSBkaXJlY3RseSBmcm9tIGF0dHJpYnV0ZSBleHRyYWN0aW9uXG5gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTZWxlY3QgcG9zdHMgbW9kZSB3aXRoIGZpZWxkIG1hcHBpbmdcbiAgICAgIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHNlbGVjdCBwb3N0cyArIG1hcHBlZCBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7JHtwYWdpbmF0aW9uSW5pdH1cblxuaWYgKCQke2F0dHJOYW1lfV9zb3VyY2UgPT09ICdzZWxlY3QnKSB7XG4gICRzZWxlY3RlZF9wb3N0cyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHMnXSA/PyBbXTtcbiAgJGZpZWxkX21hcHBpbmcgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1GaWVsZE1hcHBpbmcnXSA/PyAke21hcHBpbmdQaHB9O1xuJHtsb2FkUmVzb2x2ZXJ9XG4gIFxuICBpZiAoIWVtcHR5KCRzZWxlY3RlZF9wb3N0cykgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX3F1ZXJ5X2FuZF9tYXBfcG9zdHMnKSkge1xuICAgICQke2F0dHJOYW1lfSA9IGhhbmRvZmZfcXVlcnlfYW5kX21hcF9wb3N0cygkc2VsZWN0ZWRfcG9zdHMsICRmaWVsZF9tYXBwaW5nKTtcbiAgfSBlbHNlIHtcbiAgICAkJHthdHRyTmFtZX0gPSBbXTtcbiAgfVxuICAkaXRlbV9vdmVycmlkZXMgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzJ10gPz8gW107XG4gIGlmICghZW1wdHkoJGl0ZW1fb3ZlcnJpZGVzKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYXBwbHlfaXRlbV9vdmVycmlkZXMnKSkge1xuICAgIGZvcmVhY2ggKCQke2F0dHJOYW1lfSBhcyAkaSA9PiAkaXRlbSkge1xuICAgICAgJCR7YXR0ck5hbWV9WyRpXSA9IGhhbmRvZmZfYXBwbHlfaXRlbV9vdmVycmlkZXMoJGl0ZW0sICRpdGVtX292ZXJyaWRlcyk7XG4gICAgfVxuICB9XG59XG4vLyBlbHNlOiBNYW51YWwgbW9kZSB1c2VzICQke2F0dHJOYW1lfSBkaXJlY3RseSBmcm9tIGF0dHJpYnV0ZSBleHRyYWN0aW9uXG5gO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBjb21wbGV0ZSByZW5kZXIucGhwIGZpbGVcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGR5bmFtaWNBcnJheUNvbmZpZ3MgLSBPcHRpb25hbCBkeW5hbWljIGFycmF5IGNvbmZpZ3VyYXRpb25zIGtleWVkIGJ5IGZpZWxkIG5hbWVcbiAqL1xuY29uc3QgZ2VuZXJhdGVSZW5kZXJQaHAgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgZHluYW1pY0FycmF5Q29uZmlncz86IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPixcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGxcbik6IHN0cmluZyA9PiB7XG4gIC8vIE9ubHkgdGhlIGlubmVyQmxvY2tzRmllbGQgcmljaHRleHQgdXNlcyAkY29udGVudCAoSW5uZXJCbG9ja3MpO1xuICAvLyBvdGhlciByaWNodGV4dCBmaWVsZHMgYXJlIHJlbmRlcmVkIGZyb20gdGhlaXIgc3RyaW5nIGF0dHJpYnV0ZXMuXG4gIGNvbnN0IHJpY2h0ZXh0UHJvcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgaWYgKGlubmVyQmxvY2tzRmllbGQpIHtcbiAgICByaWNodGV4dFByb3BzLmFkZChpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICByaWNodGV4dFByb3BzLmFkZCh0b0NhbWVsQ2FzZShpbm5lckJsb2Nrc0ZpZWxkKSk7XG4gIH1cblxuICBjb25zdCBhdHRyaWJ1dGVFeHRyYWN0aW9uID0gZ2VuZXJhdGVBdHRyaWJ1dGVFeHRyYWN0aW9uKGNvbXBvbmVudC5wcm9wZXJ0aWVzLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgY29uc3Qgd2lzdGlhRW5xdWV1ZUNvZGUgPSBnZW5lcmF0ZVdpc3RpYUVucXVldWVDb2RlKGNvbXBvbmVudC5jb2RlKTtcbiAgY29uc3QgdGVtcGxhdGVQaHAgPSBoYW5kbGViYXJzVG9QaHAoc3RyaXBXaXN0aWFTY3JpcHRUYWdzKGNvbXBvbmVudC5jb2RlKSwgY29tcG9uZW50LnByb3BlcnRpZXMsIHJpY2h0ZXh0UHJvcHMpO1xuICBcbiAgLy8gR2VuZXJhdGUgZHluYW1pYyBhcnJheSBleHRyYWN0aW9uIGNvZGVcbiAgY29uc3QgZHluYW1pY0FycmF5RXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gZmllbGRQcm9wPy5pdGVtcz8ucHJvcGVydGllcztcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIGF0dHJOYW1lLCBjb25maWcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgZHluYW1pY0FycmF5Q29kZSA9IGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLmpvaW4oJ1xcbicpO1xuICBcbiAgLy8gV3JhcCB0aGUgdGVtcGxhdGUgd2l0aCBibG9jayB3cmFwcGVyIGZvciBhbGlnbm1lbnQgc3VwcG9ydFxuICBjb25zdCB3cmFwcGVkVGVtcGxhdGUgPSB3cmFwV2l0aEJsb2NrV3JhcHBlcih0ZW1wbGF0ZVBocCwgY29tcG9uZW50LmlkKTtcbiAgXG4gIHJldHVybiBgPD9waHBcbi8qKlxuICogU2VydmVyLXNpZGUgcmVuZGVyaW5nIGZvciAke2NvbXBvbmVudC50aXRsZX1cbiAqXG4gKiBAcGFyYW0gYXJyYXkgICAgJGF0dHJpYnV0ZXMgQmxvY2sgYXR0cmlidXRlcy5cbiAqIEBwYXJhbSBzdHJpbmcgICAkY29udGVudCAgICBCbG9jayBkZWZhdWx0IGNvbnRlbnQuXG4gKiBAcGFyYW0gV1BfQmxvY2sgJGJsb2NrICAgICAgQmxvY2sgaW5zdGFuY2UuXG4gKiBAcmV0dXJuIHN0cmluZyBSZXR1cm5zIHRoZSBibG9jayBtYXJrdXAuXG4gKi9cblxuaWYgKCFkZWZpbmVkKCdBQlNQQVRIJykpIHtcbiAgZXhpdDtcbn1cblxuaWYgKCFpc3NldCgkYXR0cmlidXRlcykpIHtcbiAgJGF0dHJpYnV0ZXMgPSBbXTtcbn1cblxuLy8gRXh0cmFjdCBhdHRyaWJ1dGVzIHdpdGggZGVmYXVsdHNcbiR7YXR0cmlidXRlRXh0cmFjdGlvbn1cbiR7ZHluYW1pY0FycmF5Q29kZX1cbiR7d2lzdGlhRW5xdWV1ZUNvZGV9XG4/PlxuJHt3cmFwcGVkVGVtcGxhdGV9XG5gO1xufTtcblxuZXhwb3J0IHtcbiAgZ2VuZXJhdGVSZW5kZXJQaHAsXG4gIGhhbmRsZWJhcnNUb1BocCxcbiAgYXJyYXlUb1BocCxcbiAgZ2V0UGhwRGVmYXVsdFZhbHVlLFxuICBnZW5lcmF0ZUF0dHJpYnV0ZUV4dHJhY3Rpb24sXG4gIGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVCcmVhZGNydW1ic0FycmF5RXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uLFxuICBidWlsZFJlc2hhcGVQaHAsXG4gIGJ1aWxkUmVzaGFwZUpzLFxufTtcbiJdfQ==