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
                pos = closest.pos + 8;
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
        php = php.substring(0, openPos) + replacement + php.substring(closePos + 8); // 8 = "{{/if}}"
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
    // Convert inline style with opacity
    php = php.replace(/style="opacity:\s*\.?\d+"/g, 'style="opacity: <?php echo esc_attr($overlayOpacity); ?>"');
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
const generateAttributeExtraction = (properties, hasOverlay, innerBlocksField) => {
    const extractions = [];
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
    }
    // Add overlay opacity if detected
    if (hasOverlay) {
        extractions.push(`$overlayOpacity = isset($attributes['overlayOpacity']) ? $attributes['overlayOpacity'] : 0.6;`);
    }
    return extractions.join('\n');
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
    const hasOverlay = component.code.includes('overlay');
    // Only the innerBlocksField richtext uses $content (InnerBlocks);
    // other richtext fields are rendered from their string attributes.
    const richtextProps = new Set();
    if (innerBlocksField) {
        richtextProps.add(innerBlocksField);
        richtextProps.add((0, handlebars_to_jsx_1.toCamelCase)(innerBlocksField));
    }
    const attributeExtraction = generateAttributeExtraction(component.properties, hasOverlay, innerBlocksField);
    const templatePhp = handlebarsToPhp(component.code, component.properties, richtextProps);
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
?>
${wrappedTemplate}
`;
};
exports.generateRenderPhp = generateRenderPhp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXBocC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3JlbmRlci1waHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0NBQW1PO0FBQ25PLDJEQUFrRDtBQUVsRDs7R0FFRztBQUNILE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBVSxFQUFVLEVBQUU7SUFDeEMsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMxQyxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDekIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7YUFDaEMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNkLE9BQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQztJQUN0QixDQUFDO0lBRUQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixPQUFPLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUMzQyxDQUFDO0lBRUQsSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMvQixPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDbEMsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3ZCLENBQUMsQ0FBQztBQW1wREEsZ0NBQVU7QUFqcERaOztHQUVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFFBQXlCLEVBQVUsRUFBRTtJQUMvRCxRQUFRLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN0QixLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssVUFBVSxDQUFDO1FBQ2hCLEtBQUssUUFBUTtZQUNYLE9BQU8sSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFFcEUsS0FBSyxRQUFRO1lBQ1gsT0FBTyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV2QyxLQUFLLFNBQVM7WUFDWixPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBRTdDLEtBQUssT0FBTztZQUNWLE9BQU8sNEJBQTRCLENBQUM7UUFFdEMsS0FBSyxNQUFNO1lBQ1QsT0FBTyx3REFBd0QsQ0FBQztRQUVsRSxLQUFLLFFBQVE7WUFDWCxPQUFPLGtGQUFrRixDQUFDO1FBRTVGLEtBQUssUUFBUTtZQUNYLElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNyQixPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEMsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDO1FBRWQsS0FBSyxPQUFPO1lBQ1YsSUFBSSxRQUFRLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUM7Z0JBQ2hELE9BQU8sVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLElBQUksUUFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLElBQUksRUFBRSxDQUFDLENBQUM7WUFDdkUsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDO1FBRWQ7WUFDRSxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBMG1EQSxnREFBa0I7QUF4bURwQjs7R0FFRztBQUNILE1BQU0sZUFBZSxHQUFHLENBQUMsUUFBZ0IsRUFBRSxVQUEyQyxFQUFFLGdCQUE2QixJQUFJLEdBQUcsRUFBRSxFQUFVLEVBQUU7SUFDeEksSUFBSSxHQUFHLEdBQUcsUUFBUSxDQUFDO0lBRW5CLGlDQUFpQztJQUNqQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQywwQkFBMEIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM5QyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUUvQyx1QkFBdUI7SUFDdkIsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFMUMsNkJBQTZCO0lBQzdCLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2hELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRTVDLG1FQUFtRTtJQUNuRSxzRUFBc0U7SUFDdEUsbUVBQW1FO0lBQ25FLDhHQUE4RztJQUM5RyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyw4QkFBOEIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUVqRCwwRkFBMEY7SUFDMUYscUZBQXFGO0lBQ3JGLHFFQUFxRTtJQUNyRSxNQUFNLGlCQUFpQixHQUFHLENBQUMsT0FBZSxFQUFVLEVBQUU7UUFDcEQsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDdEMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzVELE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE9BQU8sSUFBSSxTQUFTLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUMzRCxDQUFDO1lBQ0QsT0FBTyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ3pCLENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMzQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDeEIsT0FBTyxVQUFVLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDckQsQ0FBQztZQUNELE9BQU8sVUFBVSxLQUFLLElBQUksQ0FBQztRQUM3QixDQUFDO2FBQU0sQ0FBQztZQUNOLG9FQUFvRTtZQUNwRSxtREFBbUQ7WUFDbkQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pDLE9BQU8sVUFBVSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDOUMsQ0FBQztZQUNELE9BQU8sVUFBVSxPQUFPLElBQUksQ0FBQztRQUMvQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsd0RBQXdEO0lBQ3hELE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxJQUFZLEVBQWlCLEVBQUU7UUFDM0Qsc0RBQXNEO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QyxPQUFPLElBQUksUUFBUSxnQkFBZ0IsS0FBSyxHQUFHLENBQUM7UUFDOUMsQ0FBQztRQUNELHVDQUF1QztRQUN2QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLEtBQUssR0FBRyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUMsQ0FBQztJQUtGLE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsR0FBVyxFQUNYLFFBQWdCLEVBQ2hCLGNBQXNCLEVBQ21DLEVBQUU7UUFDM0QsTUFBTSxRQUFRLEdBQXFCLENBQUMsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksR0FBRyxHQUFHLFFBQVEsQ0FBQztRQUNuQixJQUFJLFlBQVksR0FBRyxRQUFRLENBQUM7UUFDNUIsTUFBTSxXQUFXLEdBQUcsbUNBQW1DLENBQUM7UUFFeEQsT0FBTyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDckMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDekMsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUMsV0FBVyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUM7WUFDNUIsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXhELE1BQU0sVUFBVSxHQUFvRTtnQkFDbEYsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUU7Z0JBQzNCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFO2dCQUNqQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRTtnQkFDL0IsR0FBRyxDQUFDLFVBQVUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsV0FBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxXQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2FBQzNILENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTFELElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDO2dCQUFFLE1BQU07WUFFbkMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTlCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDMUIsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUNwQyxLQUFLLEVBQUUsQ0FBQztnQkFDUixJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDaEIsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakYsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUM3QyxDQUFDO2dCQUNELEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztZQUN4QixDQUFDO2lCQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakYsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyRSxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNqRixRQUFRLENBQUMsSUFBSSxDQUFDO29CQUNaLFNBQVMsRUFBRSxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtvQkFDM0QsT0FBTyxFQUFFLEVBQUU7aUJBQ1osQ0FBQyxDQUFDO2dCQUNILFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQztnQkFDcEMsR0FBRyxHQUFHLFlBQVksQ0FBQztZQUNyQixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sbUdBQW1HO2dCQUNuRyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQztZQUM5QixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsTUFBTSxhQUFhLEdBQUcsK0JBQStCLENBQUM7SUFDdEQsSUFBSSxXQUFXLENBQUM7SUFDaEIsT0FBTyxDQUFDLFdBQVcsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDeEQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxPQUFPLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNuRCxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdEMsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNyRSxJQUFJLE1BQU0sS0FBSyxJQUFJO1lBQUUsU0FBUztRQUM5QixNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxHQUFHLE1BQU0sQ0FBQztRQUV0QyxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7UUFDM0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN6QyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0IsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDdEYsTUFBTSxJQUFJLEdBQUcsWUFBWSxJQUFJLE9BQU8sQ0FBQztZQUNyQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDWixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsSUFBSSxTQUFTLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELENBQUM7aUJBQU0sSUFBSSxNQUFNLENBQUMsU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUNyQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixJQUFJLFNBQVMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDN0QsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELENBQUM7UUFDSCxDQUFDO1FBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLFdBQVcsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQjtRQUM3RixtR0FBbUc7UUFDbkcsYUFBYSxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUM7SUFDcEMsQ0FBQztJQUVELHlFQUF5RTtJQUN6RSw4REFBOEQ7SUFDOUQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsbUZBQW1GLEVBQ25GLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLEVBQUU7UUFDNUMsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGVBQWUsWUFBWSxVQUFVLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7UUFDMUcsQ0FBQztRQUNELE9BQU8sdUJBQXVCLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUM7SUFDNUYsQ0FBQyxDQUNGLENBQUM7SUFDRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiw2REFBNkQsRUFDN0QsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxFQUFFO1FBQy9CLE1BQU0sWUFBWSxHQUFHLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxlQUFlLFlBQVksVUFBVSxhQUFhLGlCQUFpQixDQUFDO1FBQzdFLENBQUM7UUFDRCxPQUFPLHVCQUF1QixhQUFhLGlCQUFpQixDQUFDO0lBQy9ELENBQUMsQ0FDRixDQUFDO0lBRUYsNENBQTRDO0lBQzVDLDREQUE0RDtJQUM1RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwrRUFBK0UsRUFDL0UsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLHNCQUFzQixTQUFTLEtBQUssS0FBSyxzREFBc0QsU0FBUyxLQUFLLEtBQUssd0JBQXdCLENBQUM7SUFDcEosQ0FBQyxDQUNGLENBQUM7SUFFRixvQ0FBb0M7SUFDcEMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsNEJBQTRCLEVBQzVCLDJEQUEyRCxDQUM1RCxDQUFDO0lBRUYsb0RBQW9EO0lBQ3BELGtEQUFrRDtJQUNsRCxNQUFNLFdBQVcsR0FBMkIsRUFBRSxDQUFDO0lBRS9DLDZFQUE2RTtJQUM3RSxNQUFNLGlCQUFpQixHQUEyQixFQUFFLENBQUM7SUFFckQscURBQXFEO0lBQ3JELElBQUksZUFBZSxHQUFHLENBQUMsQ0FBQztJQUV4QiwyREFBMkQ7SUFDM0QsTUFBTSxjQUFjLEdBQUcsQ0FBQyxLQUFhLEVBQVUsRUFBRTtRQUMvQyxJQUFJLEtBQUssS0FBSyxDQUFDO1lBQUUsT0FBTyxPQUFPLENBQUM7UUFDaEMsSUFBSSxLQUFLLEtBQUssQ0FBQztZQUFFLE9BQU8sVUFBVSxDQUFDO1FBQ25DLE9BQU8sVUFBVSxLQUFLLE1BQU0sQ0FBQztJQUMvQixDQUFDLENBQUM7SUFFRixNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQWEsRUFBVSxFQUFFO1FBQ2hELElBQUksS0FBSyxLQUFLLENBQUM7WUFBRSxPQUFPLFFBQVEsQ0FBQztRQUNqQyxJQUFJLEtBQUssS0FBSyxDQUFDO1lBQUUsT0FBTyxXQUFXLENBQUM7UUFDcEMsT0FBTyxVQUFVLEtBQUssT0FBTyxDQUFDO0lBQ2hDLENBQUMsQ0FBQztJQUVGLE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBYSxFQUFVLEVBQUU7UUFDaEQsSUFBSSxLQUFLLEtBQUssQ0FBQztZQUFFLE9BQU8sY0FBYyxDQUFDO1FBQ3ZDLElBQUksS0FBSyxLQUFLLENBQUM7WUFBRSxPQUFPLHFCQUFxQixDQUFDO1FBQzlDLE9BQU8sV0FBVyxLQUFLLGFBQWEsQ0FBQztJQUN2QyxDQUFDLENBQUM7SUFFRixrRUFBa0U7SUFDbEUsOERBQThEO0lBQzlELE1BQU0sWUFBWSxHQU9iLEVBQUUsQ0FBQztJQUVSLGtDQUFrQztJQUNsQyxNQUFNLFNBQVMsR0FBRywyQkFBMkIsQ0FBQztJQUM5QyxJQUFJLFNBQVMsQ0FBQztJQUNkLE9BQU8sQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ2xELE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwQyxJQUFJLElBQXFDLENBQUM7UUFDMUMsSUFBSSxTQUFpQixDQUFDO1FBQ3RCLElBQUksS0FBeUIsQ0FBQztRQUM5QixJQUFJLFdBQStCLENBQUM7UUFFcEMsZ0NBQWdDO1FBQ2hDLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUMvRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4QyxLQUFLLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXhCLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUN2QyxJQUFJLEdBQUcsWUFBWSxDQUFDO2dCQUNwQixTQUFTLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbEQsQ0FBQztpQkFBTSxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxHQUFHLE1BQU0sQ0FBQztnQkFDZCxTQUFTLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDNUMsQ0FBQztpQkFBTSxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsOERBQThEO2dCQUM5RCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNsQyxXQUFXLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3JDLElBQUksR0FBRyxPQUFPLENBQUM7WUFDakIsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLGlEQUFpRDtnQkFDakQsSUFBSSxHQUFHLE9BQU8sQ0FBQztnQkFDZixTQUFTLEdBQUcsUUFBUSxDQUFDO1lBQ3ZCLENBQUM7UUFDSCxDQUFDO2FBQU0sQ0FBQztZQUNOLGtCQUFrQjtZQUNsQixJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxHQUFHLFlBQVksQ0FBQztnQkFDcEIsU0FBUyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRSxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUN2QyxJQUFJLEdBQUcsTUFBTSxDQUFDO2dCQUNkLFNBQVMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakMsV0FBVyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxHQUFHLE9BQU8sQ0FBQztZQUNqQixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sSUFBSSxHQUFHLE9BQU8sQ0FBQztnQkFDZixTQUFTLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQyxDQUFDO1FBQ0gsQ0FBQztRQUVELFlBQVksQ0FBQyxJQUFJLENBQUM7WUFDaEIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbkIsSUFBSTtZQUNKLFNBQVM7WUFDVCxLQUFLO1lBQ0wsV0FBVztZQUNYLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSztTQUN2QixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsZ0RBQWdEO0lBQ2hELE1BQU0sWUFBWSxHQUEyQixFQUFFLENBQUM7SUFFaEQsdURBQXVEO0lBQ3ZELG9DQUFvQztJQUNwQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFL0MsNENBQTRDO0lBQzVDLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sU0FBUyxHQUE2QyxFQUFFLENBQUM7SUFFL0QsMkJBQTJCO0lBQzNCLE1BQU0sa0JBQWtCLEdBQWEsRUFBRSxDQUFDO0lBQ3hDLE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDO0lBQ3pDLElBQUksVUFBVSxDQUFDO0lBQ2YsT0FBTyxDQUFDLFVBQVUsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDeEQsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsdUZBQXVGO0lBQ3ZGLEtBQUssTUFBTSxPQUFPLElBQUksWUFBWSxFQUFFLENBQUM7UUFDbkMsNENBQTRDO1FBQzVDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDN0UsNkNBQTZDO1FBQzdDLE1BQU0sWUFBWSxHQUFHLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xGLE1BQU0sS0FBSyxHQUFHLFdBQVcsR0FBRyxZQUFZLENBQUM7UUFFekMsSUFBSSxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbEIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDcEMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQ2pELENBQUM7SUFDSCxDQUFDO0lBRUQseUdBQXlHO0lBQ3pHLE1BQU0sYUFBYSxHQUFHLENBQUMsUUFBZ0IsRUFBVSxFQUFFO1FBQ2pELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxVQUFVLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLElBQUksVUFBVSxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUNELDJEQUEyRDtRQUMzRCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEUsT0FBTyxJQUFJLFVBQVUsSUFBSSxVQUFVLEdBQUcsQ0FBQztJQUN6QyxDQUFDLENBQUM7SUFFRixzSEFBc0g7SUFDdEgseURBQXlEO0lBQ3pELGtGQUFrRjtJQUNsRiwyQ0FBMkM7SUFDM0MsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2Ysc0VBQXNFLEVBQ3RFLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNyQixNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLFFBQVEsQ0FBQztRQUM5QixPQUFPLG9CQUFvQixNQUFNLGlCQUFpQixNQUFNLDZCQUE2QixNQUFNLGVBQWUsTUFBTSwyQkFBMkIsQ0FBQztJQUM5SSxDQUFDLENBQ0YsQ0FBQztJQUVGLHVGQUF1RjtJQUN2Rix5REFBeUQ7SUFDekQsMkNBQTJDO0lBQzNDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDBDQUEwQyxFQUMxQyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRTtRQUNkLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2QyxPQUFPLG9CQUFvQixNQUFNLGlCQUFpQixNQUFNLDZCQUE2QixNQUFNLGVBQWUsTUFBTSwyQkFBMkIsQ0FBQztJQUM5SSxDQUFDLENBQ0YsQ0FBQztJQUVGLHVHQUF1RztJQUN2RyxxRkFBcUY7SUFDckYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsNkRBQTZELEVBQzdELENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNqQixpQkFBaUIsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDaEMsT0FBTywyQkFBMkIsSUFBSSwwQkFBMEIsSUFBSSw2Q0FBNkMsSUFBSSx3QkFBd0IsSUFBSSxtQ0FBbUMsQ0FBQztJQUN2TCxDQUFDLENBQ0YsQ0FBQztJQUVGLHdEQUF3RDtJQUN4RCxvREFBb0Q7SUFDcEQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsaUNBQWlDLEVBQ2pDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ1YsT0FBTywyQkFBMkIsSUFBSSwwQkFBMEIsSUFBSSw2Q0FBNkMsSUFBSSx3QkFBd0IsSUFBSSxtQ0FBbUMsQ0FBQztJQUN2TCxDQUFDLENBQ0YsQ0FBQztJQUVGLHlJQUF5STtJQUN6SSxzR0FBc0c7SUFDdEcscUZBQXFGO0lBQ3JGLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDhEQUE4RCxFQUM5RCxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxFQUFFO1FBQ3hDLDREQUE0RDtRQUM1RCxJQUFJLFdBQVcsS0FBSyxZQUFZLElBQUksV0FBVyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzNELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELHdEQUF3RDtRQUN4RCxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDdEMsT0FBTywyQkFBMkIsSUFBSSwwQkFBMEIsSUFBSSw2Q0FBNkMsSUFBSSx3QkFBd0IsSUFBSSxtQ0FBbUMsQ0FBQztJQUN2TCxDQUFDLENBQ0YsQ0FBQztJQUVGLCtGQUErRjtJQUMvRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixrQ0FBa0MsRUFDbEMsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQzNCLDREQUE0RDtRQUM1RCxJQUFJLFdBQVcsS0FBSyxZQUFZLElBQUksV0FBVyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzNELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELHdEQUF3RDtRQUN4RCxPQUFPLDJCQUEyQixJQUFJLDBCQUEwQixJQUFJLDZDQUE2QyxJQUFJLHdCQUF3QixJQUFJLG1DQUFtQyxDQUFDO0lBQ3ZMLENBQUMsQ0FDRixDQUFDO0lBRUYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztJQUVwRSx1R0FBdUc7SUFDdkcseUZBQXlGO0lBRXpGLDZFQUE2RTtJQUM3RSwyREFBMkQ7SUFDM0QsTUFBTSxhQUFhLEdBQUcsQ0FBQyxPQUFlLEVBQVUsRUFBRTtRQUNoRCxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDckIsT0FBTyxJQUFJLFNBQVMsS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQzNELENBQUM7WUFDRCxPQUFPLElBQUksU0FBUyxFQUFFLENBQUM7UUFDekIsQ0FBQzthQUFNLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN4QixPQUFPLFVBQVUsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNyRCxDQUFDO1lBQ0QsT0FBTyxVQUFVLEtBQUssSUFBSSxDQUFDO1FBQzdCLENBQUM7YUFBTSxDQUFDO1lBQ04sZ0RBQWdEO1lBQ2hELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakMsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2hDLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2pDLE9BQU8sYUFBYSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2pELENBQUM7Z0JBQ0QsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDMUIsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakMsT0FBTyxVQUFVLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDOUMsQ0FBQztZQUNILENBQUM7WUFDRCxXQUFXO1lBQ1gsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sVUFBVSxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ3ZELENBQUM7WUFDRCxPQUFPLFVBQVUsT0FBTyxJQUFJLENBQUM7UUFDL0IsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLDJDQUEyQztJQUMzQyxNQUFNLGdCQUFnQixHQUFHLENBQUMsSUFBWSxFQUFpQixFQUFFO1FBQ3ZELHNEQUFzRDtRQUN0RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE9BQU8sSUFBSSxRQUFRLGdCQUFnQixLQUFLLEdBQUcsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsdUNBQXVDO1FBQ3ZDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLEtBQUssR0FBRyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUMsQ0FBQztJQUVGLG9FQUFvRTtJQUNwRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwyRUFBMkUsRUFDM0UsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsRUFBRTtRQUN4QyxNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLE9BQU8sYUFBYSxZQUFZLFNBQVMsU0FBUyxrQkFBa0IsV0FBVyxpQkFBaUIsQ0FBQztRQUNuRyxDQUFDO1FBQ0QsT0FBTyx3QkFBd0IsU0FBUyxrQkFBa0IsV0FBVyxpQkFBaUIsQ0FBQztJQUN6RixDQUFDLENBQ0YsQ0FBQztJQUVGLG9FQUFvRTtJQUNwRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixxREFBcUQsRUFDckQsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxFQUFFO1FBQzNCLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxhQUFhLFlBQVksU0FBUyxTQUFTLGlCQUFpQixDQUFDO1FBQ3RFLENBQUM7UUFDRCxPQUFPLHdCQUF3QixTQUFTLGlCQUFpQixDQUFDO0lBQzVELENBQUMsQ0FDRixDQUFDO0lBRUYscUVBQXFFO0lBQ3JFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLG1GQUFtRixFQUNuRixDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxFQUFFO1FBQzVDLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxlQUFlLFlBQVksVUFBVSxhQUFhLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO1FBQzFHLENBQUM7UUFDRCxPQUFPLHVCQUF1QixhQUFhLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO0lBQzVGLENBQUMsQ0FDRixDQUFDO0lBRUYsd0VBQXdFO0lBQ3hFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDZEQUE2RCxFQUM3RCxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLEVBQUU7UUFDL0IsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGVBQWUsWUFBWSxVQUFVLGFBQWEsaUJBQWlCLENBQUM7UUFDN0UsQ0FBQztRQUNELE9BQU8sdUJBQXVCLGFBQWEsaUJBQWlCLENBQUM7SUFDL0QsQ0FBQyxDQUNGLENBQUM7SUFFRiwwRUFBMEU7SUFDMUUsMEVBQTBFO0lBRTFFLDhFQUE4RTtJQUM5RSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwrQ0FBK0MsRUFDL0MsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLDRCQUE0QixTQUFTLEtBQUssS0FBSyxnQkFBZ0IsQ0FBQztJQUN6RSxDQUFDLENBQ0YsQ0FBQztJQUVGLGdEQUFnRDtJQUNoRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwrQ0FBK0MsRUFDL0MsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLDZCQUE2QixTQUFTLEtBQUssS0FBSyxnQkFBZ0IsQ0FBQztJQUMxRSxDQUFDLENBQ0YsQ0FBQztJQUVGLGlEQUFpRDtJQUNqRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixnREFBZ0QsRUFDaEQsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLDZCQUE2QixTQUFTLEtBQUssS0FBSyxpQkFBaUIsQ0FBQztJQUMzRSxDQUFDLENBQ0YsQ0FBQztJQUVGLGtIQUFrSDtJQUVsSCw2REFBNkQ7SUFDN0QsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsMENBQTBDLEVBQzFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDL0IsNERBQTREO1FBQzVELElBQUksS0FBSyxLQUFLLFlBQVksSUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxRSxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFDRCw0REFBNEQ7UUFDNUQsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ2hFLE9BQU8sMkJBQTJCLE9BQU8sS0FBSyxNQUFNLE9BQU8sTUFBTSxnQkFBZ0IsQ0FBQztJQUNwRixDQUFDLENBQ0YsQ0FBQztJQUVGLDJDQUEyQztJQUMzQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwwQ0FBMEMsRUFDMUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUMvQixJQUFJLEtBQUssS0FBSyxZQUFZLElBQUksS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDMUUsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBQ0QsNERBQTREO1FBQzVELE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNoRSxPQUFPLDRCQUE0QixPQUFPLEtBQUssTUFBTSxPQUFPLE1BQU0sZ0JBQWdCLENBQUM7SUFDckYsQ0FBQyxDQUNGLENBQUM7SUFFRixnRkFBZ0Y7SUFDaEYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsMkNBQTJDLEVBQzNDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDL0IsSUFBSSxLQUFLLEtBQUssWUFBWSxJQUFJLEtBQUssS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzFFLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELDREQUE0RDtRQUM1RCxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDaEUsT0FBTyw0QkFBNEIsT0FBTyxLQUFLLE1BQU0sT0FBTyxNQUFNLGdCQUFnQixDQUFDO0lBQ3JGLENBQUMsQ0FDRixDQUFDO0lBRUYsNEZBQTRGO0lBQzVGLDZFQUE2RTtJQUM3RSwwRUFBMEU7SUFFMUUscURBQXFEO0lBQ3JELHdDQUF3QztJQUN4QyxNQUFNLG9CQUFvQixHQUFHLENBQUMsU0FBaUIsRUFBVSxFQUFFO1FBQ3pELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkMsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUM3QyxDQUFDLENBQUM7SUFFRix3REFBd0Q7SUFDeEQsS0FBSyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7UUFDeEQsb0ZBQW9GO1FBQ3BGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEtBQUssd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDL0MsT0FBTyxxQ0FBcUMsS0FBSyxlQUFlLENBQUM7UUFDbkUsQ0FBQyxDQUFDLENBQUM7UUFFSCwrRkFBK0Y7UUFDL0YsZ0ZBQWdGO1FBQ2hGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEtBQUssd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUU7WUFDbkQsTUFBTSxTQUFTLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEQsT0FBTyw0QkFBNEIsU0FBUyxTQUFTLENBQUM7UUFDeEQsQ0FBQyxDQUFDLENBQUM7UUFFSCx5RkFBeUY7UUFDekYsTUFBTSxjQUFjLEdBQUcsSUFBSSxNQUFNLENBQUMsYUFBYSxLQUFLLHdCQUF3QixFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ25GLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRTtZQUNqRCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ25DLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sT0FBTyxHQUFHLFFBQVEsS0FBSyxLQUFLLElBQUksUUFBUSxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUN6RyxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsRCxPQUFPLGNBQWMsT0FBTyxZQUFZLFNBQVMsYUFBYSxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELHVEQUF1RDtJQUN2RCxLQUFLLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsNkVBQTZFO1FBQzdFLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEtBQUssd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDL0MsT0FBTyxrQ0FBa0MsS0FBSyxlQUFlLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7UUFFSCwrRUFBK0U7UUFDL0UsK0VBQStFO1FBQy9FLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLEtBQUssd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUU7WUFDbkQsTUFBTSxTQUFTLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEQsT0FBTyx5QkFBeUIsU0FBUyxTQUFTLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7UUFFSCx5RUFBeUU7UUFDekUsTUFBTSxjQUFjLEdBQUcsSUFBSSxNQUFNLENBQUMsYUFBYSxLQUFLLHdCQUF3QixFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ25GLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRTtZQUNqRCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ25DLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sT0FBTyxHQUFHLFFBQVEsS0FBSyxLQUFLLElBQUksUUFBUSxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUN6RyxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNsRCxPQUFPLGNBQWMsT0FBTyxTQUFTLFNBQVMsYUFBYSxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELDJFQUEyRTtJQUMzRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiw4QkFBOEIsRUFDOUIsNEJBQTRCLENBQzdCLENBQUM7SUFFRix5RUFBeUU7SUFDekUsNENBQTRDO0lBQzVDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDZCQUE2QixFQUM3QiwyQ0FBMkMsQ0FDNUMsQ0FBQztJQUVGLGdFQUFnRTtJQUNoRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwwQkFBMEIsRUFDMUIsOEJBQThCLENBQy9CLENBQUM7SUFFRiw4REFBOEQ7SUFDOUQsNENBQTRDO0lBQzVDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLHlCQUF5QixFQUN6Qiw2Q0FBNkMsQ0FDOUMsQ0FBQztJQUVGLDBFQUEwRTtJQUMxRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiw0Q0FBNEMsRUFDNUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUU7UUFDZCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sU0FBUyxHQUFHLElBQUEsK0JBQVcsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdkIsT0FBTyxvQkFBb0IsU0FBUyxTQUFTLENBQUM7UUFDaEQsQ0FBQztRQUNELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLE9BQU8sb0JBQW9CLFNBQVMsR0FBRyxZQUFZLFNBQVMsQ0FBQztJQUMvRCxDQUFDLENBQ0YsQ0FBQztJQUVGLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLG1CQUFtQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFFMUQscURBQXFEO0lBQ3JELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDRCQUE0QixFQUM1QixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLDJCQUEyQixLQUFLLFdBQVcsQ0FDMUQsQ0FBQztJQUVGLDJFQUEyRTtJQUMzRSw4RkFBOEY7SUFDOUYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsZ0NBQWdDLEVBQ2hDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUN0Qix5REFBeUQ7UUFDekQsSUFBSSxLQUFLLEtBQUssWUFBWSxJQUFJLEtBQUssS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUMvQyxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFDRCw0REFBNEQ7UUFDNUQsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ2hFLE9BQU8sb0JBQW9CLE9BQU8sS0FBSyxLQUFLLFdBQVcsQ0FBQztJQUMxRCxDQUFDLENBQ0YsQ0FBQztJQUVGLHVGQUF1RjtJQUN2Riw0Q0FBNEM7SUFDNUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLElBQVksRUFBaUIsRUFBRTtRQUN2RCxzREFBc0Q7UUFDdEQsMkRBQTJEO1FBQzNELE1BQU0sUUFBUSxHQUFHLENBQUMsT0FBZSxFQUFVLEVBQUU7WUFDM0MsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3JCLE9BQU8sSUFBSSxTQUFTLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDM0QsQ0FBQztnQkFDRCxPQUFPLElBQUksU0FBUyxFQUFFLENBQUM7WUFDekIsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDdkMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzNDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUN4QixPQUFPLFVBQVUsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDckQsQ0FBQztnQkFDRCxPQUFPLFVBQVUsS0FBSyxJQUFJLENBQUM7WUFDN0IsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLDBFQUEwRTtnQkFDMUUsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakMsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNyQiw0Q0FBNEM7b0JBQzVDLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDaEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDakMsSUFBSSxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDOzRCQUN6QixPQUFPLGFBQWEsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO3dCQUNqRCxDQUFDO3dCQUNELE9BQU8sYUFBYSxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDdkMsQ0FBQztvQkFDRCwyQ0FBMkM7b0JBQzNDLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQzFCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2pDLElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzs0QkFDekIsT0FBTyxVQUFVLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQzt3QkFDOUMsQ0FBQzt3QkFDRCxPQUFPLFVBQVUsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ3BDLENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxxREFBcUQ7Z0JBQ3JELElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUMxQixPQUFPLFVBQVUsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDdkQsQ0FBQztnQkFDRCxPQUFPLFVBQVUsT0FBTyxJQUFJLENBQUM7WUFDL0IsQ0FBQztRQUNILENBQUMsQ0FBQztRQUVGLHNEQUFzRDtRQUN0RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxRQUFRLGdCQUFnQixLQUFLLEdBQUcsQ0FBQztRQUM5QyxDQUFDO1FBRUQsMENBQTBDO1FBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUN4RSxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLFVBQVUsQ0FBQztZQUNuQyxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEMsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xDLE9BQU8sSUFBSSxRQUFRLGdCQUFnQixTQUFTLFNBQVMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsdUNBQXVDO1FBQ3ZDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEMsT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLEtBQUssR0FBRyxDQUFDO1FBQzlDLENBQUM7UUFFRCx1Q0FBdUM7UUFDdkMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3BFLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDO1lBQ2hDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxPQUFPLElBQUksUUFBUSxZQUFZLEtBQUssRUFBRSxDQUFDO1FBQ3pDLENBQUM7UUFFRCxvQ0FBb0M7UUFDcEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3BFLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDO1lBQ2hDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxPQUFPLElBQUksUUFBUSxZQUFZLEtBQUssRUFBRSxDQUFDO1FBQ3pDLENBQUM7UUFFRCxpREFBaUQ7UUFDakQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RFLElBQUksUUFBUSxFQUFFLENBQUM7WUFDYixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsUUFBUSxDQUFDO1lBQ2pDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxPQUFPLElBQUksUUFBUSxhQUFhLEtBQUssRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RFLElBQUksUUFBUSxFQUFFLENBQUM7WUFDYixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsUUFBUSxDQUFDO1lBQ2pDLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxPQUFPLElBQUksUUFBUSxhQUFhLEtBQUssRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUMsQ0FBQztJQUVGLHdFQUF3RTtJQUN4RSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiwyRUFBMkUsRUFDM0UsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsRUFBRTtRQUN4QyxNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRCxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2pCLE9BQU8sYUFBYSxZQUFZLFNBQVMsU0FBUyxrQkFBa0IsV0FBVyxpQkFBaUIsQ0FBQztRQUNuRyxDQUFDO1FBQ0QsT0FBTyx3QkFBd0IsU0FBUyxrQkFBa0IsV0FBVyxpQkFBaUIsQ0FBQztJQUN6RixDQUFDLENBQ0YsQ0FBQztJQUVGLHdFQUF3RTtJQUN4RSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixxREFBcUQsRUFDckQsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxFQUFFO1FBQzNCLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxhQUFhLFlBQVksU0FBUyxTQUFTLGlCQUFpQixDQUFDO1FBQ3RFLENBQUM7UUFDRCxPQUFPLHdCQUF3QixTQUFTLGlCQUFpQixDQUFDO0lBQzVELENBQUMsQ0FDRixDQUFDO0lBRUYsNEVBQTRFO0lBQzVFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLG1GQUFtRixFQUNuRixDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxFQUFFO1FBQzVDLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxlQUFlLFlBQVksVUFBVSxhQUFhLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO1FBQzFHLENBQUM7UUFDRCxPQUFPLHVCQUF1QixhQUFhLGtCQUFrQixXQUFXLGlCQUFpQixDQUFDO0lBQzVGLENBQUMsQ0FDRixDQUFDO0lBRUYsNEVBQTRFO0lBQzVFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDZEQUE2RCxFQUM3RCxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLEVBQUU7UUFDL0IsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLGVBQWUsWUFBWSxVQUFVLGFBQWEsaUJBQWlCLENBQUM7UUFDN0UsQ0FBQztRQUNELE9BQU8sdUJBQXVCLGFBQWEsaUJBQWlCLENBQUM7SUFDL0QsQ0FBQyxDQUNGLENBQUM7SUFFRixrRkFBa0Y7SUFDbEYsc0dBQXNHO0lBQ3RHLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLHFDQUFxQyxFQUNyQyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRTtRQUNkLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLHFCQUFxQixTQUFTLFNBQVMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsZ0RBQWdEO1FBQ2hELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLE9BQU8scUJBQXFCLFNBQVMsR0FBRyxZQUFZLFNBQVMsQ0FBQztJQUNoRSxDQUFDLENBQ0YsQ0FBQztJQUVGLG1GQUFtRjtJQUNuRixHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUV0RCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUV0RCwwRUFBMEU7SUFDMUUsaUVBQWlFO0lBRWpFLDhEQUE4RDtJQUM5RCxnRkFBZ0Y7SUFDaEYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2Ysc0NBQXNDLEVBQ3RDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ1YsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLElBQUksYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDNUQsT0FBTyx5QkFBeUIsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyw0QkFBNEIsU0FBUyxhQUFhLENBQUM7SUFDNUQsQ0FBQyxDQUNGLENBQUM7SUFFRixzREFBc0Q7SUFDdEQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsZ0NBQWdDLEVBQ2hDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ1gsT0FBTyxrQ0FBa0MsS0FBSyxlQUFlLENBQUM7SUFDaEUsQ0FBQyxDQUNGLENBQUM7SUFFRiwrREFBK0Q7SUFDL0QscUVBQXFFO0lBQ3JFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLGlDQUFpQyxFQUNqQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDdEIscUVBQXFFO1FBQ3JFLElBQUksS0FBSyxLQUFLLFlBQVksSUFBSSxLQUFLLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDL0MsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO1FBQ0QsNERBQTREO1FBQzVELE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNoRSxPQUFPLDJCQUEyQixPQUFPLEtBQUssS0FBSyxlQUFlLENBQUM7SUFDckUsQ0FBQyxDQUNGLENBQUM7SUFFRix5REFBeUQ7SUFDekQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YseUJBQXlCLEVBQ3pCLHdEQUF3RCxDQUN6RCxDQUFDO0lBRUYsd0RBQXdEO0lBQ3hELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLHFCQUFxQixFQUNyQixvREFBb0QsQ0FDckQsQ0FBQztJQUVGLGtEQUFrRDtJQUNsRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZixtQ0FBbUMsRUFDbkMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3BCLE1BQU0sT0FBTyxHQUFHLE1BQU0sS0FBSyxLQUFLLElBQUksTUFBTSxLQUFLLEtBQUssSUFBSSxNQUFNLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUNuRyxPQUFPLGNBQWMsT0FBTyxXQUFXLE1BQU0sT0FBTyxNQUFNLGVBQWUsQ0FBQztJQUM1RSxDQUFDLENBQ0YsQ0FBQztJQUVGLGtDQUFrQztJQUNsQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FDZiw0QkFBNEIsRUFDNUIsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDWCxNQUFNLE9BQU8sR0FBRyxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7UUFDaEcsT0FBTyxjQUFjLE9BQU8sV0FBVyxLQUFLLGVBQWUsQ0FBQztJQUM5RCxDQUFDLENBQ0YsQ0FBQztJQUVGLGtGQUFrRjtJQUNsRix5RkFBeUY7SUFDekYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YscUNBQXFDLEVBQ3JDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFO1FBQ2QsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxPQUFPLEdBQUcsUUFBUSxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUssS0FBSyxJQUFJLFFBQVEsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1FBRXpHLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLGNBQWMsT0FBTyxLQUFLLFNBQVMsYUFBYSxDQUFDO1FBQzFELENBQUM7UUFDRCxnREFBZ0Q7UUFDaEQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUUsT0FBTyxjQUFjLE9BQU8sS0FBSyxTQUFTLEdBQUcsWUFBWSxhQUFhLENBQUM7SUFDekUsQ0FBQyxDQUNGLENBQUM7SUFFRixxRkFBcUY7SUFDckYsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsK0JBQStCLEVBQy9CLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNoQix5Q0FBeUM7UUFDekMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQUUsT0FBTyxLQUFLLEdBQUcsSUFBSSxLQUFLLElBQUksQ0FBQztRQUMzRSxNQUFNLE9BQU8sR0FBRyxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLEtBQUssT0FBTyxDQUFDLENBQUM7WUFDM0YsQ0FBQyxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1FBQ2pHLDREQUE0RDtRQUM1RCxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDOUQsT0FBTyxjQUFjLE9BQU8sSUFBSSxPQUFPLEtBQUssS0FBSyxlQUFlLENBQUM7SUFDbkUsQ0FBQyxDQUNGLENBQUM7SUFFRiw4REFBOEQ7SUFDOUQsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YsZ0RBQWdELEVBQ2hELENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNqQixNQUFNLFNBQVMsR0FBRyxJQUFBLCtCQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsT0FBTyw2QkFBNkIsU0FBUyxLQUFLLEtBQUssaUJBQWlCLENBQUM7SUFDM0UsQ0FBQyxDQUNGLENBQUM7SUFFRiw2Q0FBNkM7SUFDN0MsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQ2YseUNBQXlDLEVBQ3pDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ1YsTUFBTSxTQUFTLEdBQUcsSUFBQSwrQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sNkJBQTZCLFNBQVMsZUFBZSxDQUFDO0lBQy9ELENBQUMsQ0FDRixDQUFDO0lBRUYsdUVBQXVFO0lBQ3ZFLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUNmLDJCQUEyQixFQUMzQixDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNWLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7WUFBRSxPQUFPLFNBQVMsSUFBSSxHQUFHLENBQUM7UUFDcEQsbUNBQW1DO1FBQ25DLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUNoRSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2QsTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxHQUFHLFNBQVMsQ0FBQztZQUNyQyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNYLE9BQU8sbUNBQW1DLE1BQU0sT0FBTyxNQUFNLGlCQUFpQixDQUFDO1lBQ2pGLENBQUM7WUFDRCxPQUFPLG1DQUFtQyxNQUFNLGlCQUFpQixDQUFDO1FBQ3BFLENBQUM7UUFDRCxPQUFPLG9GQUFvRixDQUFDO0lBQzlGLENBQUMsQ0FDRixDQUFDO0lBRUYsNkRBQTZEO0lBQzdELEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVDLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUV0QyxPQUFPLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNwQixDQUFDLENBQUM7QUF1a0JBLDBDQUFlO0FBcmtCakI7O0dBRUc7QUFDSCxNQUFNLDJCQUEyQixHQUFHLENBQUMsVUFBMkMsRUFBRSxVQUFtQixFQUFFLGdCQUFnQyxFQUFVLEVBQUU7SUFDakosTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO0lBRWpDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDekQsc0ZBQXNGO1FBQ3RGLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxVQUFVLElBQUksR0FBRyxLQUFLLGdCQUFnQjtZQUFFLFNBQVM7UUFDdkUsOEVBQThFO1FBQzlFLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxZQUFZO1lBQUUsU0FBUztRQUU3QyxNQUFNLFFBQVEsR0FBRyxJQUFBLCtCQUFXLEVBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbEQsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLFFBQVEseUJBQXlCLFFBQVEsc0JBQXNCLFFBQVEsUUFBUSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZILENBQUM7SUFFRCxrQ0FBa0M7SUFDbEMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNmLFdBQVcsQ0FBQyxJQUFJLENBQUMsK0ZBQStGLENBQUMsQ0FBQztJQUNwSCxDQUFDO0lBRUQsT0FBTyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2hDLENBQUMsQ0FBQztBQWdqQkEsa0VBQTJCO0FBOWlCN0I7OztHQUdHO0FBQ0gsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsV0FBbUIsRUFBVSxFQUFFO0lBQzdFLGdFQUFnRTtJQUNoRSxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUVqRCw0RUFBNEU7SUFDNUUsK0NBQStDO0lBQy9DLE9BQU8sNkRBQTZELFNBQVM7RUFDN0UsUUFBUTtPQUNILENBQUM7QUFDUixDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxPQUEwQyxFQUFVLEVBQUU7SUFDL0UsTUFBTSxPQUFPLEdBQWEsRUFBRSxDQUFDO0lBRTdCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDbkQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM5Qix3QkFBd0I7WUFDeEIsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQzdDLENBQUM7YUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbkQsa0JBQWtCO1lBQ2xCLFFBQVEsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuQixLQUFLLFFBQVE7b0JBQ1gsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcseUNBQTBDLEtBQWEsQ0FBQyxLQUFLLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDakcsTUFBTTtnQkFDUixLQUFLLFFBQVE7b0JBQ1gsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsMkJBQTJCLENBQUMsQ0FBQztvQkFDckQsTUFBTTtnQkFDUixLQUFLLE1BQU07b0JBQ1QsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcscUNBQXNDLEtBQWEsQ0FBQyxHQUFHLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDM0YsTUFBTTtnQkFDUixLQUFLLFVBQVU7b0JBQ2IsTUFBTSxRQUFRLEdBQUcsS0FBZ0UsQ0FBQztvQkFDbEYsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsOENBQThDLFFBQVEsQ0FBQyxRQUFRLG1CQUFtQixRQUFRLENBQUMsTUFBTSxJQUFJLE9BQU8sSUFBSSxDQUFDLENBQUM7b0JBQzFJLE1BQU07Z0JBQ1IsS0FBSyxRQUFRO29CQUNYLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxHQUFHLDRDQUE2QyxLQUFhLENBQUMsUUFBUSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ3ZHLE1BQU07WUFDVixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO0FBQzFDLENBQUMsQ0FBQztBQUVGOzs7R0FHRztBQUNILE1BQU0scUJBQXFCLEdBQUcsQ0FDNUIsUUFBZ0IsRUFDaEIsa0JBQTBCLEVBQ2xCLEVBQUU7SUFDVixPQUFPOztLQUVKLGtCQUFrQjtLQUNsQixRQUFRLHNDQUFzQyxRQUFRO1NBQ2xELFFBQVE7T0FDVixrQkFBa0Isa0VBQWtFLFdBQVcsUUFBUSxFQUFFO0lBQzVHLENBQUM7QUFDTCxDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxRQUFnQixFQUFVLEVBQUU7SUFDcEQsTUFBTSxRQUFRLEdBQUcsV0FBVyxRQUFRLEVBQUUsQ0FBQztJQUN2QyxPQUFPOzs2QkFFb0IsUUFBUSw4QkFBOEIsUUFBUSxXQUFXLENBQUM7QUFDdkYsQ0FBQyxDQUFDO0FBRUY7Ozs7OztHQU1HO0FBQ0gsTUFBTSxlQUFlLEdBQUcsQ0FDdEIsY0FBMkQsRUFDM0QsY0FBd0IsRUFDVCxFQUFFO0lBQ2pCLElBQUksQ0FBQyxjQUFjO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFFakMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUU1QyxzRUFBc0U7SUFDdEUsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBRWhFLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUMzQixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1FBQ3pELElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLGlCQUFpQixHQUFHLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDMUQsTUFBTSxHQUFHLEdBQWEsRUFBRSxDQUFDO1lBQ3pCLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBQzlFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7Z0JBQUksR0FBRyxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQzVFLElBQUksR0FBRyxDQUFDLE1BQU07Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoRSxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckQsTUFBTSxHQUFHLEdBQWEsRUFBRSxDQUFDO1lBQ3pCLEtBQUssTUFBTSxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDbEQsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQ3BDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxNQUFNLGlCQUFpQixNQUFNLElBQUksQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO1lBQ0gsQ0FBQztZQUNELElBQUksR0FBRyxDQUFDLE1BQU07Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0gsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDcEMsT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUNqQyxDQUFDLENBQUM7QUE2YkEsMENBQWU7QUEzYmpCOzs7R0FHRztBQUNILE1BQU0sY0FBYyxHQUFHLENBQ3JCLGNBQTJELEVBQzNELGNBQXdCLEVBQ1QsRUFBRTtJQUNqQixJQUFJLENBQUMsY0FBYztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBRWpDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDNUMsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBRWhFLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUMzQixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1FBQ3pELElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLFVBQVUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUNwQyxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFELE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztZQUN6QixJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO2dCQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUNwRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO2dCQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDaEUsSUFBSSxHQUFHLENBQUMsTUFBTTtnQkFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlELENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyRCxNQUFNLEdBQUcsR0FBYSxFQUFFLENBQUM7WUFDekIsS0FBSyxNQUFNLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUNsRCxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztvQkFDcEMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sVUFBVSxNQUFNLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxDQUFDO1lBQ0gsQ0FBQztZQUNELElBQUksR0FBRyxDQUFDLE1BQU07Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0gsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDcEMsT0FBTyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztBQUNyQyxDQUFDLENBQUM7QUF5WkEsd0NBQWM7QUF2WmhCOzs7R0FHRztBQUNILE1BQU0sa0NBQWtDLEdBQUcsQ0FDekMsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsY0FBZ0QsRUFDeEMsRUFBRTtJQUNWLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN0RSxNQUFNLFdBQVcsR0FBRyxXQUFXO1FBQzdCLENBQUMsQ0FBQztPQUNDLFFBQVEsMkNBQTJDLFdBQVcsZUFBZTtRQUNoRixDQUFDLENBQUMsSUFBSSxRQUFRLG9DQUFvQyxDQUFDO0lBRXJELE9BQU87b0JBQ1csU0FBUztHQUMxQixRQUFRLDBCQUEwQixRQUFRO0dBQzFDLFFBQVE7T0FDSixRQUFROzs7Ozs7Ozs7O01BVVQsV0FBVzs7O0NBR2hCLENBQUM7QUFDRixDQUFDLENBQUM7QUFrWEEsZ0ZBQWtDO0FBaFhwQzs7R0FFRztBQUNILE1BQU0sK0JBQStCLEdBQUcsQ0FDdEMsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsTUFBMkIsRUFDM0IsY0FBZ0QsRUFDeEMsRUFBRTtJQUNWLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDdkMsTUFBTSxlQUFlLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxVQUFVLENBQUM7SUFDM0QsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLGNBQWMsRUFBRSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUU5RSx5REFBeUQ7SUFDekQsSUFBSSxjQUFzQixDQUFDO0lBQzNCLElBQUksV0FBVyxFQUFFLENBQUM7UUFDaEIsY0FBYyxHQUFHO1dBQ1YsUUFBUSxRQUFRLFdBQVcsR0FBRyxDQUFDO0lBQ3hDLENBQUM7U0FBTSxDQUFDO1FBQ04sY0FBYyxHQUFHLFlBQVksUUFBUTs7OztXQUk5QixDQUFDO0lBQ1YsQ0FBQztJQUVELE9BQU87b0JBQ1csU0FBUztHQUMxQixRQUFRLDJCQUEyQixRQUFRO0dBQzNDLFFBQVEsMkJBQTJCLFFBQVEsa0JBQWtCLGVBQWU7R0FDNUUsUUFBUSwyQkFBMkIsUUFBUTtHQUMzQyxRQUFRO09BQ0osUUFBUTtTQUNOLFFBQVE7T0FDVixRQUFRLG1CQUFtQixRQUFROztnREFFTSxRQUFRLDBCQUEwQixRQUFROzs7RUFHeEYsY0FBYzs7Ozs7Q0FLZixDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBb1VBLDBFQUErQjtBQWxVakM7OztHQUdHO0FBQ0gsTUFBTSxpQ0FBaUMsR0FBRyxDQUN4QyxTQUFpQixFQUNqQixRQUFnQixFQUNoQixNQUE2QixFQUM3QixjQUFnRCxFQUN4QyxFQUFFO0lBQ1YsTUFBTSxhQUFhLEdBQUcsSUFBQSwrQkFBVyxFQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUN6RCxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsY0FBYyxFQUFFLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBRWhGLE1BQU0sV0FBVyxHQUFHLFdBQVc7UUFDN0IsQ0FBQyxDQUFDLCtDQUErQyxhQUFhLHFDQUFxQyxhQUFhO09BQzdHLFFBQVEsMkNBQTJDLFdBQVcsZUFBZTtRQUNoRixDQUFDLENBQUMsSUFBSSxRQUFRLHlDQUF5QyxhQUFhLHFDQUFxQyxhQUFhLEtBQUssQ0FBQztJQUU5SCxPQUFPO29CQUNXLFNBQVMsZ0NBQWdDLE1BQU0sQ0FBQyxjQUFjO0dBQy9FLFFBQVEsMEJBQTBCLFFBQVE7R0FDMUMsUUFBUTtPQUNKLFFBQVE7Ozs7Ozs7Ozs7Z0JBVUMsYUFBYSwyQkFBMkIsYUFBYSxzQ0FBc0MsYUFBYTtNQUNsSCxXQUFXOzs7Q0FHaEIsQ0FBQztBQUNGLENBQUMsQ0FBQztBQThSQSw4RUFBaUM7QUE1Um5DOzs7R0FHRztBQUNILE1BQU0sOEJBQThCLEdBQUcsQ0FDckMsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsTUFBMEIsRUFDbEIsRUFBRTtJQUNWLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxZQUFZO1FBQ3BDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFFVCxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsYUFBYSxLQUFLLE9BQU8sQ0FBQztJQUNyRCxNQUFNLGFBQWEsR0FBRyxXQUFXLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7SUFDekQsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLENBQUMsVUFBVSxFQUFFLFlBQVksSUFBSSxZQUFZLENBQUM7SUFFM0UsNkNBQTZDO0lBQzdDLE1BQU0sWUFBWSxHQUFHOzs7Ozs7Ozs7SUFTbkIsQ0FBQztJQUVILDZEQUE2RDtJQUM3RCxNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDeEUsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzdFLE1BQU0sZUFBZSxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUMsUUFBUSxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUNqRyx1RUFBdUU7SUFDdkUsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxNQUFNLGtCQUFrQixRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUU3RSxJQUFJLE1BQU0sQ0FBQyxVQUFVLEtBQUssVUFBVSxFQUFFLENBQUM7UUFDckMscURBQXFEO1FBQ3JELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxZQUFZLElBQUksMEJBQTBCLFNBQVMsV0FBVyxDQUFDO1FBRTNGLElBQUksV0FBVyxFQUFFLENBQUM7WUFDaEIsb0RBQW9EO1lBQ3BELE9BQU87b0JBQ08sU0FBUztHQUMxQixRQUFRLDBCQUEwQixRQUFRO0dBQzFDLFFBQVEsZUFBZSxjQUFjOztPQUVqQyxRQUFROzsrQkFFZ0IsUUFBUSxxQkFBcUIsZUFBZTs7Ozt1REFJcEIsTUFBTSxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU07MkRBQ25ELE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQzs7O29DQUczQyxRQUFROzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0tBc0J2QyxRQUFRLDBCQUEwQixlQUFlOzs7d0RBR0UsUUFBUTtDQUMvRCxDQUFDO1FBQ0UsQ0FBQzthQUFNLENBQUM7WUFDTiwrQ0FBK0M7WUFDL0MsT0FBTztvQkFDTyxTQUFTO0dBQzFCLFFBQVEsMEJBQTBCLFFBQVE7R0FDMUMsUUFBUSxlQUFlLGNBQWM7O09BRWpDLFFBQVE7bUNBQ29CLFFBQVE7Ozs7Ozs7O1NBUWxDLFFBQVE7Ozs7Ozs7Ozs7d0RBVXVDLFFBQVE7Q0FDL0QsQ0FBQztRQUNFLENBQUM7SUFDSCxDQUFDO1NBQU0sQ0FBQztRQUNOLGdEQUFnRDtRQUNoRCxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2hCLHdDQUF3QztZQUN4QyxPQUFPO29CQUNPLFNBQVM7R0FDMUIsUUFBUSwwQkFBMEIsUUFBUSx1QkFBdUIsY0FBYzs7T0FFM0UsUUFBUTs7K0JBRWdCLFFBQVE7a0NBQ0wsUUFBUSxxQkFBcUIsVUFBVTtFQUN2RSxZQUFZLEdBQUcsZUFBZTs7Ozt1REFJdUIsTUFBTSxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU07MkRBQ25ELE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQzs7O29DQUczQyxRQUFROzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7S0F3QnZDLFFBQVE7OztTQUdKLFFBQVE7Ozs7bUNBSWtCLFFBQVE7O2dCQUUzQixRQUFRO1NBQ2YsUUFBUTs7S0FFWixlQUFlOzs7NkJBR1MsUUFBUTtDQUNwQyxDQUFDO1FBQ0UsQ0FBQzthQUFNLENBQUM7WUFDTix1Q0FBdUM7WUFDdkMsT0FBTztvQkFDTyxTQUFTO0dBQzFCLFFBQVEsMEJBQTBCLFFBQVEsdUJBQXVCLGNBQWM7O09BRTNFLFFBQVE7bUNBQ29CLFFBQVE7a0NBQ1QsUUFBUSxxQkFBcUIsVUFBVTtFQUN2RSxZQUFZOzs7T0FHUCxRQUFROztPQUVSLFFBQVE7O21DQUVvQixRQUFROztnQkFFM0IsUUFBUTtTQUNmLFFBQVE7Ozs7NkJBSVksUUFBUTtDQUNwQyxDQUFDO1FBQ0UsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDLENBQUM7QUFnRkEsd0VBQThCO0FBOUVoQzs7OztHQUlHO0FBQ0gsTUFBTSxpQkFBaUIsR0FBRyxDQUN4QixTQUEyQixFQUMzQixtQkFBK0gsRUFDL0gsZ0JBQWdDLEVBQ3hCLEVBQUU7SUFDVixNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUV0RCxrRUFBa0U7SUFDbEUsbUVBQW1FO0lBQ25FLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDeEMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3JCLGFBQWEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNwQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUEsK0JBQVcsRUFBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELE1BQU0sbUJBQW1CLEdBQUcsMkJBQTJCLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUM1RyxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsVUFBVSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBRXpGLHlDQUF5QztJQUN6QyxNQUFNLHVCQUF1QixHQUFhLEVBQUUsQ0FBQztJQUM3QyxJQUFJLG1CQUFtQixFQUFFLENBQUM7UUFDeEIsS0FBSyxNQUFNLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDO1lBQ3RFLE1BQU0sUUFBUSxHQUFHLElBQUEsK0JBQVcsRUFBQyxTQUFTLENBQUMsQ0FBQztZQUN4QyxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sU0FBUyxHQUFHLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDO1lBQy9DLElBQUksSUFBQSwyQkFBbUIsRUFBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNoQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ25HLENBQUM7aUJBQU0sSUFBSSxJQUFBLHdCQUFnQixFQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLHVCQUF1QixDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3hHLENBQUM7aUJBQU0sSUFBSSxJQUFBLDBCQUFrQixFQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzFHLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzVGLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUNELE1BQU0sZ0JBQWdCLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRTVELDZEQUE2RDtJQUM3RCxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXhFLE9BQU87OytCQUVzQixTQUFTLENBQUMsS0FBSzs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFpQjVDLG1CQUFtQjtFQUNuQixnQkFBZ0I7O0VBRWhCLGVBQWU7Q0FDaEIsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdBLDhDQUFpQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIHJlbmRlci5waHAgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xuICogQ29udmVydHMgSGFuZGxlYmFycyB0ZW1wbGF0ZXMgdG8gUEhQXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRNYXBwaW5nVmFsdWUsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5cbi8qKlxuICogQ29udmVydCBKUyBhcnJheS9vYmplY3QgdG8gUEhQIGFycmF5IHN5bnRheFxuICovXG5jb25zdCBhcnJheVRvUGhwID0gKHZhbHVlOiBhbnkpOiBzdHJpbmcgPT4ge1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiAnbnVsbCc7XG4gIH1cbiAgXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIGNvbnN0IGl0ZW1zID0gdmFsdWUubWFwKHYgPT4gYXJyYXlUb1BocCh2KSkuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske2l0ZW1zfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IHBhaXJzID0gT2JqZWN0LmVudHJpZXModmFsdWUpXG4gICAgICAubWFwKChbaywgdl0pID0+IGAnJHtrfScgPT4gJHthcnJheVRvUGhwKHYpfWApXG4gICAgICAuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske3BhaXJzfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBgJyR7dmFsdWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuICB9XG4gIFxuICByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbn07XG5cbi8qKlxuICogR2V0IFBIUCBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5XG4gKi9cbmNvbnN0IGdldFBocERlZmF1bHRWYWx1ZSA9IChwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+IHtcbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6XG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICByZXR1cm4gYCcke1N0cmluZyhwcm9wZXJ0eS5kZWZhdWx0ID8/ICcnKS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBTdHJpbmcocHJvcGVydHkuZGVmYXVsdCA/PyAwKTtcbiAgICBcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBwcm9wZXJ0eS5kZWZhdWx0ID8gJ3RydWUnIDogJ2ZhbHNlJztcbiAgICBcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4gXCJbJ3NyYycgPT4gJycsICdhbHQnID0+ICcnXVwiO1xuICAgIFxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgcmV0dXJuIFwiWydsYWJlbCcgPT4gJycsICd1cmwnID0+ICcnLCAnb3BlbnNJbk5ld1RhYicgPT4gZmFsc2VdXCI7XG4gICAgXG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiBcIlsnbGFiZWwnID0+ICcnLCAnaHJlZicgPT4gJyMnLCAndGFyZ2V0JyA9PiAnJywgJ3JlbCcgPT4gJycsICdkaXNhYmxlZCcgPT4gZmFsc2VdXCI7XG4gICAgXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5kZWZhdWx0KSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHByb3BlcnR5LmRlZmF1bHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuICdbXSc7XG4gICAgXG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQgfHwgcHJvcGVydHkuaXRlbXM/LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAocHJvcGVydHkuZGVmYXVsdCB8fCBwcm9wZXJ0eS5pdGVtcz8uZGVmYXVsdCB8fCBbXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ1tdJztcbiAgICBcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiJydcIjtcbiAgfVxufTtcblxuLyoqXG4gKiBDb252ZXJ0IGhhbmRsZWJhcnMgdGVtcGxhdGUgdG8gUEhQXG4gKi9cbmNvbnN0IGhhbmRsZWJhcnNUb1BocCA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCByaWNodGV4dFByb3BzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKSk6IHN0cmluZyA9PiB7XG4gIGxldCBwaHAgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIFJlbW92ZSBIVE1MIHdyYXBwZXIgaWYgcHJlc2VudFxuICBwaHAgPSBwaHAucmVwbGFjZSgvPGh0bWxbXFxzXFxTXSo/PGJvZHlbXj5dKj4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxcXC9ib2R5PltcXHNcXFNdKj88XFwvaHRtbD4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxoZWFkPltcXHNcXFNdKj88XFwvaGVhZD4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcez9zdHlsZVxcfVxcfVxcfT8vZywgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFx7P3NjcmlwdFxcfVxcfVxcfT8vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIEhUTUwgY29tbWVudHNcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzwhLS1bXFxzXFxTXSo/LS0+L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSB7eyEtLSBjb21tZW50cyAtLX19XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHshLS1bXFxzXFxTXSo/LS1cXH1cXH0vZywgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7IVtcXHNcXFNdKj9cXH1cXH0vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIEhhbmRvZmYtc3BlY2lmaWMge3sjZmllbGR9fSBibG9ja3MgYnV0IGtlZXAgdGhlaXIgY29udGVudFxuICAvLyBVc2UgYSBnbG9iYWwgcmVnZXggdGhhdCBoYW5kbGVzIHZhcmlvdXMgcXVvdGUgc3R5bGVzIGFuZCB3aGl0ZXNwYWNlXG4gIC8vIFJlbW92ZSBIYW5kb2ZmLXNwZWNpZmljIHt7I2ZpZWxkfX0gYmxvY2tzIGJ1dCBrZWVwIHRoZWlyIGNvbnRlbnRcbiAgLy8gQWxsb3cgZm9yIHdoaXRlc3BhY2UgdmFyaWF0aW9ucyBsaWtlIHt7I2ZpZWxkIC4uLn19LCB7eyAjZmllbGQgLi4ufX0sIHt7L2ZpZWxkfX0sIHt7L2ZpZWxkIH19LCB7eyAvZmllbGQgfX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xccyojZmllbGRcXHMrW15cXH1dK1xcfVxcfS9naSwgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFxzKlxcL2ZpZWxkXFxzKlxcfVxcfS9naSwgJycpO1xuICBcbiAgLy8gVkVSWSBFQVJMWTogQ29udmVydCB7eyNpZiAoZXEvbmUgeHh4IFwidmFsdWVcIil9fS4uLnt7ZWxzZX19Li4ue3svaWZ9fSBoZWxwZXIgZXhwcmVzc2lvbnNcbiAgLy8gVGhpcyBNVVNUIHJ1biBiZWZvcmUgYW55IG90aGVyIHByb2Nlc3NpbmcgdG8gZW5zdXJlIHRoZSBjb21wbGV0ZSBibG9jayBpcyBjYXB0dXJlZFxuICAvLyBIZWxwZXIgdG8gY29udmVydCB2YXJpYWJsZSBwYXRoIHRvIFBIUCBmb3IgZWFybHkgaGVscGVyIHByb2Nlc3NpbmdcbiAgY29uc3QgdmFyVG9QaHBWZXJ5RWFybHkgPSAodmFyUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGgucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfVsnJHtwYXJ0cy5zbGljZSgxKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1gO1xuICAgIH0gZWxzZSBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHZhclBhdGgucmVwbGFjZSgndGhpcy4nLCAnJyk7XG4gICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZH0nXWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvciBsb29wIGFsaWFzZXMgYXQgdGhpcyBlYXJseSBzdGFnZSwgd2UgaGF2ZW4ndCB0cmFja2VkIHRoZW0geWV0XG4gICAgICAvLyBTbyB3ZSBqdXN0IHVzZSAkaXRlbSBmb3IgYW55IGFsaWFzLmZpZWxkIHBhdHRlcm5cbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aH0nXWA7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gUGFyc2UgaGVscGVyIGV4cHJlc3Npb24gdG8gUEhQIGNvbmRpdGlvbiAodmVyeSBlYXJseSlcbiAgY29uc3QgcGFyc2VIZWxwZXJWZXJ5RWFybHkgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBWZXJ5RWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICAvLyBNYXRjaCAobmUgbGVmdCBcInJpZ2h0XCIpIC0gbm90IGVxdWFsc1xuICAgIGNvbnN0IG5lTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm5lXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChuZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBuZU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocFZlcnlFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IC4uLiB7e2Vsc2UgaWYgKGVxIC4uLil9fSAuLi4ge3tlbHNlfX0gLi4uIHt7L2lmfX0gVkVSWSBFQVJMWVxuICAvLyBTdXBwb3J0cyBmdWxsIGlmIC8gZWxzZSBpZiAvIGVsc2UgaWYgLyBlbHNlIC8gZW5kaWYgY2hhaW5zIChzdHJpbmcgc3dpdGNoIHBhdHRlcm4pXG4gIHR5cGUgSGVscGVySWZCcmFuY2ggPSB7IGNvbmRpdGlvbjogc3RyaW5nIHwgbnVsbDsgY29udGVudDogc3RyaW5nIH07XG4gIGNvbnN0IGZpbmRIZWxwZXJJZkJyYW5jaGVzID0gKFxuICAgIHN0cjogc3RyaW5nLFxuICAgIHN0YXJ0UG9zOiBudW1iZXIsXG4gICAgZmlyc3RDb25kaXRpb246IHN0cmluZ1xuICApOiB7IGJyYW5jaGVzOiBIZWxwZXJJZkJyYW5jaFtdOyBjbG9zZVBvczogbnVtYmVyIH0gfCBudWxsID0+IHtcbiAgICBjb25zdCBicmFuY2hlczogSGVscGVySWZCcmFuY2hbXSA9IFt7IGNvbmRpdGlvbjogZmlyc3RDb25kaXRpb24sIGNvbnRlbnQ6ICcnIH1dO1xuICAgIGxldCBkZXB0aCA9IDE7XG4gICAgbGV0IHBvcyA9IHN0YXJ0UG9zO1xuICAgIGxldCBjb250ZW50U3RhcnQgPSBzdGFydFBvcztcbiAgICBjb25zdCBlbHNlSWZSZWdleCA9IC9cXHtcXHtlbHNlIGlmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9L2c7XG5cbiAgICB3aGlsZSAocG9zIDwgc3RyLmxlbmd0aCAmJiBkZXB0aCA+IDApIHtcbiAgICAgIGNvbnN0IG5leHRJZiA9IHN0ci5pbmRleE9mKCd7eyNpZicsIHBvcyk7XG4gICAgICBjb25zdCBuZXh0RW5kaWYgPSBzdHIuaW5kZXhPZigne3svaWZ9fScsIHBvcyk7XG4gICAgICBjb25zdCBuZXh0RWxzZSA9IHN0ci5pbmRleE9mKCd7e2Vsc2V9fScsIHBvcyk7XG4gICAgICBlbHNlSWZSZWdleC5sYXN0SW5kZXggPSBwb3M7XG4gICAgICBjb25zdCBlbHNlSWZNYXRjaCA9IGVsc2VJZlJlZ2V4LmV4ZWMoc3RyKTtcbiAgICAgIGNvbnN0IG5leHRFbHNlSWYgPSBlbHNlSWZNYXRjaCA/IGVsc2VJZk1hdGNoLmluZGV4IDogLTE7XG5cbiAgICAgIGNvbnN0IGNhbmRpZGF0ZXM6IHsgdHlwZTogc3RyaW5nOyBwb3M6IG51bWJlcjsgZXhwcj86IHN0cmluZzsgdGFnTGVuPzogbnVtYmVyIH1bXSA9IFtcbiAgICAgICAgeyB0eXBlOiAnaWYnLCBwb3M6IG5leHRJZiB9LFxuICAgICAgICB7IHR5cGU6ICdlbmRpZicsIHBvczogbmV4dEVuZGlmIH0sXG4gICAgICAgIHsgdHlwZTogJ2Vsc2UnLCBwb3M6IG5leHRFbHNlIH0sXG4gICAgICAgIC4uLihuZXh0RWxzZUlmICE9PSAtMSA/IFt7IHR5cGU6ICdlbHNlaWYnLCBwb3M6IG5leHRFbHNlSWYsIGV4cHI6IGVsc2VJZk1hdGNoIVsxXSwgdGFnTGVuOiBlbHNlSWZNYXRjaCFbMF0ubGVuZ3RoIH1dIDogW10pXG4gICAgICBdLmZpbHRlcihjID0+IGMucG9zICE9PSAtMSkuc29ydCgoYSwgYikgPT4gYS5wb3MgLSBiLnBvcyk7XG5cbiAgICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkgYnJlYWs7XG5cbiAgICAgIGNvbnN0IGNsb3Nlc3QgPSBjYW5kaWRhdGVzWzBdO1xuXG4gICAgICBpZiAoY2xvc2VzdC50eXBlID09PSAnaWYnKSB7XG4gICAgICAgIGRlcHRoKys7XG4gICAgICAgIHBvcyA9IGNsb3Nlc3QucG9zICsgNTtcbiAgICAgIH0gZWxzZSBpZiAoY2xvc2VzdC50eXBlID09PSAnZW5kaWYnKSB7XG4gICAgICAgIGRlcHRoLS07XG4gICAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICAgIGJyYW5jaGVzW2JyYW5jaGVzLmxlbmd0aCAtIDFdLmNvbnRlbnQgPSBzdHIuc3Vic3RyaW5nKGNvbnRlbnRTdGFydCwgY2xvc2VzdC5wb3MpO1xuICAgICAgICAgIHJldHVybiB7IGJyYW5jaGVzLCBjbG9zZVBvczogY2xvc2VzdC5wb3MgfTtcbiAgICAgICAgfVxuICAgICAgICBwb3MgPSBjbG9zZXN0LnBvcyArIDg7XG4gICAgICB9IGVsc2UgaWYgKChjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnIHx8IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2UnKSAmJiBkZXB0aCA9PT0gMSkge1xuICAgICAgICBjb25zdCB0YWdMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgYnJhbmNoZXNbYnJhbmNoZXMubGVuZ3RoIC0gMV0uY29udGVudCA9IHN0ci5zdWJzdHJpbmcoY29udGVudFN0YXJ0LCBjbG9zZXN0LnBvcyk7XG4gICAgICAgIGJyYW5jaGVzLnB1c2goe1xuICAgICAgICAgIGNvbmRpdGlvbjogY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyA/IGNsb3Nlc3QuZXhwciEgOiBudWxsLFxuICAgICAgICAgIGNvbnRlbnQ6ICcnXG4gICAgICAgIH0pO1xuICAgICAgICBjb250ZW50U3RhcnQgPSBjbG9zZXN0LnBvcyArIHRhZ0xlbjtcbiAgICAgICAgcG9zID0gY29udGVudFN0YXJ0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU2tpcCBmdWxsIHRhZyB3aGVuIGluc2lkZSBuZXN0ZWQgI2lmIChlLmcuIHNraXAge3tlbHNlIGlmIChleHByKX19IHNvIHdlIGZpbmQgdGhlIG91dGVyIHt7L2lmfX0pXG4gICAgICAgIGNvbnN0IHNraXBMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyBza2lwTGVuO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICBjb25zdCBoZWxwZXJJZlJlZ2V4ID0gL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuICBsZXQgaGVscGVyTWF0Y2g7XG4gIHdoaWxlICgoaGVscGVyTWF0Y2ggPSBoZWxwZXJJZlJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBvcGVuUG9zID0gaGVscGVyTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IG9wZW5Qb3MgKyBoZWxwZXJNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgZmlyc3RDb25kaXRpb24gPSBoZWxwZXJNYXRjaFsxXTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGZpbmRIZWxwZXJJZkJyYW5jaGVzKHBocCwgb3BlblRhZ0VuZCwgZmlyc3RDb25kaXRpb24pO1xuICAgIGlmIChyZXN1bHQgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHsgYnJhbmNoZXMsIGNsb3NlUG9zIH0gPSByZXN1bHQ7XG5cbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJyYW5jaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBicmFuY2ggPSBicmFuY2hlc1tpXTtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IGJyYW5jaC5jb25kaXRpb24gPyBwYXJzZUhlbHBlclZlcnlFYXJseShicmFuY2guY29uZGl0aW9uKSA6IG51bGw7XG4gICAgICBjb25zdCBjb25kID0gcGhwQ29uZGl0aW9uID8/ICdmYWxzZSc7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICBwYXJ0cy5wdXNoKGA8P3BocCBpZiAoJHtjb25kfSkgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9IGVsc2UgaWYgKGJyYW5jaC5jb25kaXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgcGFydHMucHVzaChgPD9waHAgZWxzZWlmICgke2NvbmR9KSA6ID8+JHticmFuY2guY29udGVudH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhcnRzLnB1c2goYDw/cGhwIGVsc2UgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIHBhcnRzLnB1c2goJzw/cGhwIGVuZGlmOyA/PicpO1xuICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcGFydHMuam9pbignJyk7XG5cbiAgICBwaHAgPSBwaHAuc3Vic3RyaW5nKDAsIG9wZW5Qb3MpICsgcmVwbGFjZW1lbnQgKyBwaHAuc3Vic3RyaW5nKGNsb3NlUG9zICsgOCk7IC8vIDggPSBcInt7L2lmfX1cIlxuICAgIC8vIE5leHQgZXhlYyBmcm9tIHN0YXJ0IG9mIHJlcGxhY2VtZW50IHNvIHdlIGNhdGNoIG5lc3RlZCB7eyNpZn19Li4ue3tlbHNlIGlmfX0uLi57ey9pZn19IGluc2lkZSBpdFxuICAgIGhlbHBlcklmUmVnZXgubGFzdEluZGV4ID0gb3BlblBvcztcbiAgfVxuXG4gIC8vIFZFUlkgRUFSTFk6IENvbnZlcnQge3sjdW5sZXNzIChlcS9uZSAuLi4pfX0gd2l0aCBlbHNlIGFuZCB3aXRob3V0IGVsc2VcbiAgLy8gI3VubGVzcyBpcyB0aGUgbmVnYXRpb24gb2YgI2lmLCBzbyB3ZSBpbnZlcnQgdGhlIGNvbmRpdGlvbi5cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclZlcnlFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJWZXJ5RWFybHkoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCEoJHtwaHBDb25kaXRpb259KSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgc3R5bGUgd2l0aCBoYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gIC8vIEtlZXAgJ3NyYycgYXMtaXMgdG8gbWF0Y2ggSGFuZG9mZidzIGltYWdlIHByb3BlcnR5IG5hbWluZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvc3R5bGU9XCJiYWNrZ3JvdW5kLWltYWdlOnVybFxcKCc/XFx7XFx7K1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfStcXH0nP1xcKVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAhZW1wdHkoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSkgPyAnc3R5bGU9XCJiYWNrZ3JvdW5kLWltYWdlOnVybChcXFxcJycgLiBlc2NfdXJsKCQke2NhbWVsUHJvcH1bJyR7ZmllbGR9J10pIC4gJ1xcXFwnKVwiJyA6ICcnOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBpbmxpbmUgc3R5bGUgd2l0aCBvcGFjaXR5XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zdHlsZT1cIm9wYWNpdHk6XFxzKlxcLj9cXGQrXCIvZyxcbiAgICAnc3R5bGU9XCJvcGFjaXR5OiA8P3BocCBlY2hvIGVzY19hdHRyKCRvdmVybGF5T3BhY2l0eSk7ID8+XCInXG4gICk7XG4gIFxuICAvLyBUcmFjayBsb29wIGFsaWFzZXMgZm9yIGxhdGVyIHJlZmVyZW5jZSBjb252ZXJzaW9uXG4gIC8vIEZvcm1hdDoge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eCBhcyB8YWxpYXNOYW1lfH19XG4gIGNvbnN0IGxvb3BBbGlhc2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICAvLyBUcmFjayBuZXN0ZWQgbG9vcCBhbGlhc2VzIHNlcGFyYXRlbHkgKHRoZXNlIHVzZSAkc3ViSXRlbSBpbnN0ZWFkIG9mICRpdGVtKVxuICBjb25zdCBuZXN0ZWRMb29wQWxpYXNlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBcbiAgLy8gVHJhY2sgbmVzdGVkIGxvb3AgZGVwdGggZm9yIHByb3BlciB2YXJpYWJsZSBuYW1pbmdcbiAgbGV0IG5lc3RlZExvb3BEZXB0aCA9IDA7XG4gIFxuICAvLyBIZWxwZXIgdG8gZ2V0IHRoZSBsb29wIGl0ZW0gdmFyaWFibGUgbmFtZSBiYXNlZCBvbiBkZXB0aFxuICBjb25zdCBnZXRMb29wSXRlbVZhciA9IChkZXB0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiAnJGl0ZW0nO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckc3ViSXRlbSc7XG4gICAgcmV0dXJuIGAkbmVzdGVkJHtkZXB0aH1JdGVtYDtcbiAgfTtcbiAgXG4gIGNvbnN0IGdldExvb3BJbmRleFZhciA9IChkZXB0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiAnJGluZGV4JztcbiAgICBpZiAoZGVwdGggPT09IDEpIHJldHVybiAnJHN1YkluZGV4JztcbiAgICByZXR1cm4gYCRuZXN0ZWQke2RlcHRofUluZGV4YDtcbiAgfTtcbiAgXG4gIGNvbnN0IGdldExvb3BDb3VudFZhciA9IChkZXB0aDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiAnJF9sb29wX2NvdW50JztcbiAgICBpZiAoZGVwdGggPT09IDEpIHJldHVybiAnJF9uZXN0ZWRfbG9vcF9jb3VudCc7XG4gICAgcmV0dXJuIGAkX25lc3RlZCR7ZGVwdGh9X2xvb3BfY291bnRgO1xuICB9O1xuICBcbiAgLy8gRmlyc3QgcGFzczogaWRlbnRpZnkgYWxsIG5lc3RlZCBsb29wIHBhdHRlcm5zIGFuZCB0aGVpciBhbGlhc2VzXG4gIC8vIFdlIG5lZWQgdG8gcHJvY2VzcyBsb29wcyBpbiBvcmRlciB0byBwcm9wZXJseSB0cmFjayBuZXN0aW5nXG4gIGNvbnN0IGVhY2hQYXR0ZXJuczogQXJyYXk8e1xuICAgIG1hdGNoOiBzdHJpbmc7XG4gICAgdHlwZTogJ3Byb3BlcnRpZXMnIHwgJ3RoaXMnIHwgJ2FsaWFzJztcbiAgICBhcnJheVBhdGg6IHN0cmluZztcbiAgICBhbGlhcz86IHN0cmluZztcbiAgICBwYXJlbnRBbGlhcz86IHN0cmluZztcbiAgICBpbmRleDogbnVtYmVyO1xuICB9PiA9IFtdO1xuICBcbiAgLy8gRmluZCBhbGwge3sjZWFjaCAuLi59fSBwYXR0ZXJuc1xuICBjb25zdCBlYWNoUmVnZXggPSAvXFx7XFx7I2VhY2hcXHMrKFteXFx9XSspXFx9XFx9L2c7XG4gIGxldCBlYWNoTWF0Y2g7XG4gIHdoaWxlICgoZWFjaE1hdGNoID0gZWFjaFJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZWFjaE1hdGNoWzFdLnRyaW0oKTtcbiAgICBsZXQgdHlwZTogJ3Byb3BlcnRpZXMnIHwgJ3RoaXMnIHwgJ2FsaWFzJztcbiAgICBsZXQgYXJyYXlQYXRoOiBzdHJpbmc7XG4gICAgbGV0IGFsaWFzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgbGV0IHBhcmVudEFsaWFzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIFwiYXMgfGFsaWFzfFwiIHN5bnRheFxuICAgIGNvbnN0IGFzQWxpYXNNYXRjaCA9IGNvbnRlbnQubWF0Y2goL14oLis/KVxccythc1xccytcXHwoXFx3KylcXHwkLyk7XG4gICAgaWYgKGFzQWxpYXNNYXRjaCkge1xuICAgICAgY29uc3QgcGF0aFBhcnQgPSBhc0FsaWFzTWF0Y2hbMV0udHJpbSgpO1xuICAgICAgYWxpYXMgPSBhc0FsaWFzTWF0Y2hbMl07XG4gICAgICBcbiAgICAgIGlmIChwYXRoUGFydC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIHR5cGUgPSAncHJvcGVydGllcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpO1xuICAgICAgfSBlbHNlIGlmIChwYXRoUGFydC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIHR5cGUgPSAndGhpcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0LnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgfSBlbHNlIGlmIChwYXRoUGFydC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIC8vIGUuZy4sIGFydGljbGUudGFncyAtIGZpcnN0IHBhcnQgaXMgYW4gYWxpYXMgZnJvbSBvdXRlciBsb29wXG4gICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aFBhcnQuc3BsaXQoJy4nKTtcbiAgICAgICAgcGFyZW50QWxpYXMgPSBwYXJ0c1swXTtcbiAgICAgICAgYXJyYXlQYXRoID0gcGFydHMuc2xpY2UoMSkuam9pbignLicpO1xuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEp1c3QgYSB2YXJpYWJsZSBuYW1lLCB0cmVhdCBhcyBhbGlhcyByZWZlcmVuY2VcbiAgICAgICAgdHlwZSA9ICdhbGlhcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IHBhdGhQYXJ0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBhbGlhcyBzeW50YXhcbiAgICAgIGlmIChjb250ZW50LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICdwcm9wZXJ0aWVzJztcbiAgICAgICAgYXJyYXlQYXRoID0gY29udGVudC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgvXFxzLylbMF07XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICB0eXBlID0gJ3RoaXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnJlcGxhY2UoJ3RoaXMuJywgJycpLnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gY29udGVudC5zcGxpdCgnLicpO1xuICAgICAgICBwYXJlbnRBbGlhcyA9IHBhcnRzWzBdO1xuICAgICAgICBhcnJheVBhdGggPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJykuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgZWFjaFBhdHRlcm5zLnB1c2goe1xuICAgICAgbWF0Y2g6IGVhY2hNYXRjaFswXSxcbiAgICAgIHR5cGUsXG4gICAgICBhcnJheVBhdGgsXG4gICAgICBhbGlhcyxcbiAgICAgIHBhcmVudEFsaWFzLFxuICAgICAgaW5kZXg6IGVhY2hNYXRjaC5pbmRleFxuICAgIH0pO1xuICB9XG4gIFxuICAvLyBUcmFjayB3aGljaCBhbGlhc2VzIG1hcCB0byB3aGljaCBuZXN0ZWQgZGVwdGhcbiAgY29uc3QgYWxpYXNUb0RlcHRoOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIFxuICAvLyBQcm9jZXNzIGxvb3BzIGZyb20gZmlyc3QgdG8gbGFzdCAobWFpbnRhaW5pbmcgb3JkZXIpXG4gIC8vIFNvcnQgYnkgaW5kZXggdG8gcHJvY2VzcyBpbiBvcmRlclxuICBlYWNoUGF0dGVybnMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuICBcbiAgLy8gVHJhY2sgY3VycmVudCBuZXN0aW5nIGxldmVsIGFzIHdlIHByb2Nlc3NcbiAgbGV0IGN1cnJlbnREZXB0aCA9IC0xO1xuICBjb25zdCBvcGVuTG9vcHM6IEFycmF5PHsgZGVwdGg6IG51bWJlcjsgYWxpYXM/OiBzdHJpbmcgfT4gPSBbXTtcbiAgXG4gIC8vIEZpbmQge3svZWFjaH19IHBvc2l0aW9uc1xuICBjb25zdCBjbG9zZUVhY2hQb3NpdGlvbnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGNsb3NlRWFjaFJlZ2V4ID0gL1xce1xce1xcL2VhY2hcXH1cXH0vZztcbiAgbGV0IGNsb3NlTWF0Y2g7XG4gIHdoaWxlICgoY2xvc2VNYXRjaCA9IGNsb3NlRWFjaFJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjbG9zZUVhY2hQb3NpdGlvbnMucHVzaChjbG9zZU1hdGNoLmluZGV4KTtcbiAgfVxuICBcbiAgLy8gQXNzaWduIGRlcHRoIHRvIGVhY2ggcGF0dGVybiBiYXNlZCBvbiBwb3NpdGlvbiByZWxhdGl2ZSB0byBvdGhlciBwYXR0ZXJucyBhbmQgY2xvc2VzXG4gIGZvciAoY29uc3QgcGF0dGVybiBvZiBlYWNoUGF0dGVybnMpIHtcbiAgICAvLyBDb3VudCBob3cgbWFueSBvcGVucyBiZWZvcmUgdGhpcyBwb3NpdGlvblxuICAgIGNvbnN0IG9wZW5zQmVmb3JlID0gZWFjaFBhdHRlcm5zLmZpbHRlcihwID0+IHAuaW5kZXggPCBwYXR0ZXJuLmluZGV4KS5sZW5ndGg7XG4gICAgLy8gQ291bnQgaG93IG1hbnkgY2xvc2VzIGJlZm9yZSB0aGlzIHBvc2l0aW9uXG4gICAgY29uc3QgY2xvc2VzQmVmb3JlID0gY2xvc2VFYWNoUG9zaXRpb25zLmZpbHRlcihwb3MgPT4gcG9zIDwgcGF0dGVybi5pbmRleCkubGVuZ3RoO1xuICAgIGNvbnN0IGRlcHRoID0gb3BlbnNCZWZvcmUgLSBjbG9zZXNCZWZvcmU7XG4gICAgXG4gICAgaWYgKHBhdHRlcm4uYWxpYXMpIHtcbiAgICAgIGFsaWFzVG9EZXB0aFtwYXR0ZXJuLmFsaWFzXSA9IGRlcHRoO1xuICAgICAgbG9vcEFsaWFzZXNbcGF0dGVybi5hbGlhc10gPSBwYXR0ZXJuLmFycmF5UGF0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgcHJvcGVydHkgcGF0aCBsaWtlIFwianVtcE5hdi5saW5rc1wiIHRvIFBIUCB2YXJpYWJsZSBhY2Nlc3MgbGlrZSBcIiRqdW1wTmF2WydsaW5rcyddXCJcbiAgY29uc3QgcHJvcFBhdGhUb1BocCA9IChwcm9wUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgY2FtZWxGaXJzdCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICByZXR1cm4gYCQke2NhbWVsRmlyc3R9YDtcbiAgICB9XG4gICAgLy8gRm9yIG5lc3RlZCBwYXRocyBsaWtlIGp1bXBOYXYubGlua3MgLT4gJGp1bXBOYXZbJ2xpbmtzJ11cbiAgICBjb25zdCBuZXN0ZWRQYXRoID0gcGFydHMuc2xpY2UoMSkubWFwKHAgPT4gYCcke3B9J2ApLmpvaW4oJ11bJyk7XG4gICAgcmV0dXJuIGAkJHtjYW1lbEZpcnN0fVske25lc3RlZFBhdGh9XWA7XG4gIH07XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5IGFzIHxhbGlhc3x9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhcyBpbmRleHx9fSBsb29wcyB3aXRoIG5hbWVkIGFsaWFzXG4gIC8vIE5vdyBoYW5kbGVzIG5lc3RlZCBwYXRocyBsaWtlIHByb3BlcnRpZXMuanVtcE5hdi5saW5rc1xuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkaW5kZXggaW4gUEhQXG4gIC8vIEFsc28gc2V0ICRfbG9vcF9jb3VudCBmb3IgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgsIGFsaWFzKSA9PiB7XG4gICAgICBjb25zdCBwaHBWYXIgPSBwcm9wUGF0aFRvUGhwKHByb3BQYXRoKTtcbiAgICAgIGxvb3BBbGlhc2VzW2FsaWFzXSA9IHByb3BQYXRoO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7cGhwVmFyfSkgJiYgaXNfYXJyYXkoJHtwaHBWYXJ9KSkgOiAkX2xvb3BfY291bnQgPSBjb3VudCgke3BocFZhcn0pOyBmb3JlYWNoICgke3BocFZhcn0gYXMgJGluZGV4ID0+ICRpdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggcHJvcGVydGllcy54eHh9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4Lnl5eX19IGxvb3BzIHdpdGhvdXQgYWxpYXNcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIC8vIEFsc28gc2V0ICRfbG9vcF9jb3VudCBmb3IgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBWYXIgPSBwcm9wUGF0aFRvUGhwKHByb3BQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke3BocFZhcn0pICYmIGlzX2FycmF5KCR7cGhwVmFyfSkpIDogJF9sb29wX2NvdW50ID0gY291bnQoJHtwaHBWYXJ9KTsgZm9yZWFjaCAoJHtwaHBWYXJ9IGFzICRpbmRleCA9PiAkaXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIHRoaXMueHh4IGFzIHxhbGlhc3x9fSBvciB7eyNlYWNoIHRoaXMueHh4IGFzIHxhbGlhcyBpbmRleHx9fSBuZXN0ZWQgbG9vcHMgd2l0aCBhbGlhc1xuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkc3ViSW5kZXggaW4gUEhQXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccyt0aGlzXFwuKFxcdyspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3AsIGFsaWFzKSA9PiB7XG4gICAgICBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPSBwcm9wO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCB0aGlzLnh4eH19IG5lc3RlZCBsb29wcyB3aXRob3V0IGFsaWFzXG4gIC8vIFVzZSAkX25lc3RlZF9sb29wX2NvdW50IGZvciBuZXN0ZWQgQGxhc3QgY2hlY2tpbmdcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3RoaXNcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3ApID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkaXRlbVsnJHtwcm9wfSddKSAmJiBpc19hcnJheSgkaXRlbVsnJHtwcm9wfSddKSkgOiAkX25lc3RlZF9sb29wX2NvdW50ID0gY291bnQoJGl0ZW1bJyR7cHJvcH0nXSk7IGZvcmVhY2ggKCRpdGVtWycke3Byb3B9J10gYXMgJHN1YkluZGV4ID0+ICRzdWJJdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggYWxpYXMueHh4IGFzIHxuZXN0ZWRBbGlhc3x9fSBvciB7eyNlYWNoIGFsaWFzLnh4eCBhcyB8bmVzdGVkQWxpYXMgaW5kZXh8fX0gLSBuZXN0ZWQgbG9vcHMgcmVmZXJlbmNpbmcgb3V0ZXIgbG9vcCBhbGlhc1xuICAvLyBlLmcuLCB7eyNlYWNoIGFydGljbGUudGFncyBhcyB8dGFnfH19IHdoZXJlICdhcnRpY2xlJyBpcyBmcm9tIG91dGVyIHt7I2VhY2ggYXJ0aWNsZXMgYXMgfGFydGljbGV8fX1cbiAgLy8gVGhlIHNlY29uZCBwYXJhbWV0ZXIgKGluZGV4KSBpcyBvcHRpb25hbCBhbmQgaWdub3JlZCBzaW5jZSB3ZSB1c2UgJHN1YkluZGV4IGluIFBIUFxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrKFxcdyspXFwuKFxcdyspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBwYXJlbnRBbGlhcywgcHJvcCwgbmVzdGVkQWxpYXMpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQncyBwcm9wZXJ0aWVzLnh4eCBvciB0aGlzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKHBhcmVudEFsaWFzID09PSAncHJvcGVydGllcycgfHwgcGFyZW50QWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBUaGlzIGlzIGEgbmVzdGVkIGxvb3AgcmVmZXJlbmNpbmcgYW4gb3V0ZXIgbG9vcCBhbGlhc1xuICAgICAgbmVzdGVkTG9vcEFsaWFzZXNbbmVzdGVkQWxpYXNdID0gcHJvcDtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkaXRlbVsnJHtwcm9wfSddKSAmJiBpc19hcnJheSgkaXRlbVsnJHtwcm9wfSddKSkgOiAkX25lc3RlZF9sb29wX2NvdW50ID0gY291bnQoJGl0ZW1bJyR7cHJvcH0nXSk7IGZvcmVhY2ggKCRpdGVtWycke3Byb3B9J10gYXMgJHN1YkluZGV4ID0+ICRzdWJJdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggYWxpYXMueHh4fX0gLSBuZXN0ZWQgbG9vcHMgcmVmZXJlbmNpbmcgb3V0ZXIgbG9vcCBhbGlhcyB3aXRob3V0IG5lc3RlZCBhbGlhc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChtYXRjaCwgcGFyZW50QWxpYXMsIHByb3ApID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQncyBwcm9wZXJ0aWVzLnh4eCBvciB0aGlzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKHBhcmVudEFsaWFzID09PSAncHJvcGVydGllcycgfHwgcGFyZW50QWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBUaGlzIGlzIGEgbmVzdGVkIGxvb3AgcmVmZXJlbmNpbmcgYW4gb3V0ZXIgbG9vcCBhbGlhc1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHtcXC9lYWNoXFx9XFx9L2csICc8P3BocCBlbmRmb3JlYWNoOyBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGhlbHBlciBleHByZXNzaW9uIGNvbmRpdGlvbmFscyBFQVJMWSAoYmVmb3JlIGFsaWFzIHBhdHRlcm5zIGNvbnZlcnQgcGFydHMgb2YgdGhlbSlcbiAgLy8gVGhpcyBoYW5kbGVzIHt7I2lmIChlcSBhbGlhcy54eHggXCJ2YWx1ZVwiKX19Li4ue3tlbHNlfX0uLi57ey9pZn19IHBhdHRlcm5zIGluc2lkZSBsb29wc1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSB2YXJpYWJsZSBwYXRoIHRvIFBIUCBleHByZXNzaW9uIGZvciBoZWxwZXIgY29tcGFyaXNvbnNcbiAgLy8gSGFuZGxlcyBwcm9wZXJ0aWVzLnh4eCwgdGhpcy54eHgsIGFuZCBhbGlhcy54eHggcGF0dGVybnNcbiAgY29uc3QgdmFyVG9QaHBFYXJseSA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfWA7XG4gICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgIGlmIChmaWVsZC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkfSddYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgaXMgYSBrbm93biBsb29wIGFsaWFzXG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGlmIChuZXN0ZWRMb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgICByZXR1cm4gYCRzdWJJdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvb3BBbGlhc2VzW3BhcnRzWzBdXSkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gRmFsbGJhY2tcbiAgICAgIGlmICh2YXJQYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRoLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRofSddYDtcbiAgICB9XG4gIH07XG4gIFxuICAvLyBQYXJzZSBoZWxwZXIgZXhwcmVzc2lvbiB0byBQSFAgY29uZGl0aW9uXG4gIGNvbnN0IHBhcnNlSGVscGVyRWFybHkgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSA9PT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwicmlnaHRcIikgLSBub3QgZXF1YWxzXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwRWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlIEVBUkxZXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIGlmQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGZhbHNlKSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgLy8gQ29udmVydCB7eyN1bmxlc3MgKGVxL25lIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBlbHNlIEVBUkxZXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRob3V0IGVsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgdW5sZXNzQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFYXJseShoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICh0cnVlKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGF0dHJpYnV0ZS1zcGVjaWZpYyBwYXR0ZXJucyBGSVJTVCBiZWZvcmUgZ2VuZXJpYyBvbmVzXG4gIC8vIEhhbmRsZSBwcm9wZXJ0aWVzLnh4eC55eXkgcGF0dGVybnMgRklSU1QsIHRoZW4gYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzXG4gIFxuICAvLyBDb252ZXJ0IHNyYz1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJucyAodG9wLWxldmVsIG5lc3RlZCBwcm9wZXJ0aWVzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvc3JjPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBzcmM9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9hbHQ9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGFsdD1cIjw/cGhwIGVjaG8gZXNjX2F0dHIoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIE5vdyBoYW5kbGUgYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzOiBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBhbHQ9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBocmVmPVwie3thbGlhcy54eHgueXl5fX1cIlxuICBcbiAgLy8gQ29udmVydCBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiIHBhdHRlcm5zIChpbWFnZXMgaW4gbG9vcHMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zcmM9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBjb252ZXJ0ZWQgb3IgaWYgaXQncyBhIHByb3BlcnRpZXMgcGF0dGVyblxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJyB8fCBtYXRjaC5pbmNsdWRlcygnPD9waHAnKSkge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgc3JjPVwiPD9waHAgZWNobyBlc2NfdXJsKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3thbGlhcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvYWx0PVwiXFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkMSwgZmllbGQyKSA9PiB7XG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnIHx8IG1hdGNoLmluY2x1ZGVzKCc8P3BocCcpKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGBhbHQ9XCI8P3BocCBlY2hvIGVzY19hdHRyKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7YWxpYXMueHh4Lnl5eX19XCIgcGF0dGVybnMgKGxpbmtzIGluIGxvb3BzIHdpdGggbmVzdGVkIGZpZWxkcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycgfHwgbWF0Y2guaW5jbHVkZXMoJzw/cGhwJykpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e2FsaWFzLmZpZWxkLnN1YmZpZWxkfX0gYW5kIHt7YWxpYXMuZmllbGR9fSByZWZlcmVuY2VzIGZyb20gbmFtZWQgbG9vcCB2YXJpYWJsZXNcbiAgLy8gTXVzdCBoYW5kbGUgZGVlcGVyIG5lc3RpbmcgZmlyc3QgKGFsaWFzLmZpZWxkLnN1YmZpZWxkIGJlZm9yZSBhbGlhcy5maWVsZClcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgdHJpcGxlLWJyYWNlIChyaWNoIHRleHQpIEJFRk9SRSBkb3VibGUtYnJhY2UgcGF0dGVybnNcbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgZmllbGQgcGF0aCB0byBQSFAgYXJyYXkgYWNjZXNzXG4gIC8vIGUuZy4sIFwiY3RhLmxpbmtcIiAtPiBcIlsnY3RhJ11bJ2xpbmsnXVwiXG4gIGNvbnN0IGZpZWxkUGF0aFRvUGhwQWNjZXNzID0gKGZpZWxkUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgIHJldHVybiBwYXJ0cy5tYXAocCA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgfTtcbiAgXG4gIC8vIFByb2Nlc3MgbmVzdGVkIGxvb3AgYWxpYXNlcyBGSVJTVCAodGhleSB1c2UgJHN1Ykl0ZW0pXG4gIGZvciAoY29uc3QgW2FsaWFzXSBvZiBPYmplY3QuZW50cmllcyhuZXN0ZWRMb29wQWxpYXNlcykpIHtcbiAgICAvLyBIYW5kbGUge3t7IGFsaWFzLmZpZWxkIH19fSB0cmlwbGUtYnJhY2UgcGF0dGVybnMgKHJpY2ggdGV4dC9IVE1MIGluIG5lc3RlZCBsb29wcylcbiAgICBjb25zdCBhbGlhc1RyaXBsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc1RyaXBsZVJlZ2V4LCAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHN1Ykl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7I2lmIGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRocyBpbiBuZXN0ZWQgbG9vcHNcbiAgICAvLyBlLmcuLCB7eyNpZiB0YWcuY3RhLmxpbmt9fSAtPiA8P3BocCBpZiAoIWVtcHR5KCRzdWJJdGVtWydjdGEnXVsnbGluayddKSkgOiA/PlxuICAgIGNvbnN0IGFsaWFzSWZEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2lmXFxcXHMrJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNJZkRlZXBSZWdleCwgKF8sIGZpZWxkUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkc3ViSXRlbSR7cGhwQWNjZXNzfSkpIDogPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLiB9fSBwYXR0ZXJucyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHMgaW4gbmVzdGVkIGxvb3BzXG4gICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHN1Ykl0ZW0ke3BocEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRoZW4gcHJvY2VzcyB0b3AtbGV2ZWwgbG9vcCBhbGlhc2VzICh0aGV5IHVzZSAkaXRlbSlcbiAgZm9yIChjb25zdCBbYWxpYXNdIG9mIE9iamVjdC5lbnRyaWVzKGxvb3BBbGlhc2VzKSkge1xuICAgIC8vIEhhbmRsZSB7e3sgYWxpYXMuZmllbGQgfX19IHRyaXBsZS1icmFjZSBwYXR0ZXJucyAocmljaCB0ZXh0L0hUTUwgaW4gbG9vcHMpXG4gICAgY29uc3QgYWxpYXNUcmlwbGVSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNUcmlwbGVSZWdleCwgKF8sIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyNpZiBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgICAvLyBlLmcuLCB7eyNpZiBzbGlkZS5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gICAgY29uc3QgYWxpYXNJZkRlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0lmRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtJHtwaHBBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4uIH19IHBhdHRlcm5zIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgIGNvbnN0IGFsaWFzRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oW1xcXFx3Ll0rKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBsYXN0UGFydCA9PT0gJ3VybCcgfHwgbGFzdFBhcnQgPT09ICdzcmMnIHx8IGxhc3RQYXJ0ID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCRpdGVtJHtwaHBBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICB9XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBAZmlyc3R9fSAtIHNob3cgY29udGVudCBmb3IgYWxsIGl0ZW1zIGV4Y2VwdCB0aGUgZmlyc3RcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFxzKlxcfVxcfS9nLFxuICAgIGA8P3BocCBpZiAoJGluZGV4ID4gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIEBsYXN0fX0gLSBzaG93IGNvbnRlbnQgZm9yIGFsbCBpdGVtcyBleGNlcHQgdGhlIGxhc3RcbiAgLy8gVXNlcyAkX2xvb3BfY291bnQgc2V0IGluIHRoZSBmb3JlYWNoIGxvb3BcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPCAkX2xvb3BfY291bnQgLSAxKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBAZmlyc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgZmlyc3QgaXRlbVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK0BmaXJzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA9PT0gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgQGxhc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgbGFzdCBpdGVtXG4gIC8vIFVzZXMgJF9sb29wX2NvdW50IHNldCBpbiB0aGUgZm9yZWFjaCBsb29wXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPT09ICRfbG9vcF9jb3VudCAtIDEpIDogPz5gXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBwcm9wZXJ0aWVzLnh4eH19IOKAlCBuZWdhdGlvbiBvZiB7eyNpZiBwcm9wZXJ0aWVzLnh4eH19XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKGVtcHR5KCQke2NhbWVsUHJvcH0pKSA6ID8+YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5lc3RlZEFjY2VzcyA9IHBhcnRzLnNsaWNlKDEpLm1hcCgocDogc3RyaW5nKSA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGVtcHR5KCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9XG4gICk7XG5cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL3VubGVzc1xcfVxcfS9nLCAnPD9waHAgZW5kaWY7ID8+Jyk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIHRoaXMueHh4fX0gY29uZGl0aW9uYWxzIGluc2lkZSBsb29wc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK3RoaXNcXC4oXFx3KylcXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke2ZpZWxkfSddKSkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgYWxpYXMuZmllbGR9fSBmb3IgYW55IHJlbWFpbmluZyBsb29wIHZhcmlhYmxlIGNvbmRpdGlvbmFsc1xuICAvLyBUaGlzIGNhdGNoZXMgY2FzZXMgd2hlcmUgdGhlIGFsaWFzIHdhc24ndCB0cmFja2VkIChlLmcuLCBuZXN0ZWQgbG9vcHMgb3IgdW50cmFja2VkIGFsaWFzZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfS9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkKSA9PiB7XG4gICAgICAvLyBTa2lwIGlmIGl0IGxvb2tzIGxpa2UgcHJvcGVydGllcy54eHggKGFscmVhZHkgaGFuZGxlZClcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSkpIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhlbHBlciB0byBwYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gIC8vIGFuZCBjb252ZXJ0IHRvIFBIUCBjb21wYXJpc29uIGV4cHJlc3Npb25zXG4gIGNvbnN0IHBhcnNlSGVscGVyVG9QaHAgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSB2YXJpYWJsZSBwYXRoIHRvIFBIUCBleHByZXNzaW9uXG4gICAgLy8gSGFuZGxlcyBwcm9wZXJ0aWVzLnh4eCwgdGhpcy54eHgsIGFuZCBhbGlhcy54eHggcGF0dGVybnNcbiAgICBjb25zdCB2YXJUb1BocCA9ICh2YXJQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGgucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfVsnJHtwYXJ0cy5zbGljZSgxKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICAgIH0gZWxzZSBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gdmFyUGF0aC5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgaXMgYSBrbm93biBsb29wIGFsaWFzIChlLmcuLCBjYXJkLnR5cGUgLT4gdHlwZSlcbiAgICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgLy8gQ2hlY2sgbmVzdGVkIGFsaWFzZXMgZmlyc3QgKHVzZSAkc3ViSXRlbSlcbiAgICAgICAgICBpZiAobmVzdGVkTG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChmaWVsZFBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICByZXR1cm4gYCRzdWJJdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYCRzdWJJdGVtWycke2ZpZWxkUGF0aFswXX0nXWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFRoZW4gY2hlY2sgdG9wLWxldmVsIGFsaWFzZXMgKHVzZSAkaXRlbSlcbiAgICAgICAgICBpZiAobG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFBhdGggPSBwYXJ0cy5zbGljZSgxKTtcbiAgICAgICAgICAgIGlmIChmaWVsZFBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkUGF0aC5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkUGF0aFswXX0nXWA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEZhbGxiYWNrIC0gdXNlIGFzLWlzIChtaWdodCBiZSBhIHBsYWluIGZpZWxkIG5hbWUpXG4gICAgICAgIGlmICh2YXJQYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGguc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHt2YXJQYXRofSddYDtcbiAgICAgIH1cbiAgICB9O1xuICAgIFxuICAgIC8vIE1hdGNoIChlcSBsZWZ0IFwicmlnaHRcIikgLSBlcXVhbHMgd2l0aCBxdW90ZWQgc3RyaW5nXG4gICAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKGVxTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgdmFyaWFibGUpIHdpdGhvdXQgcXVvdGVzXG4gICAgY29uc3QgZXFWYXJNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXSspXFxzKyhbXlxccylcIl0rKVxccypcXCkkLyk7XG4gICAgaWYgKGVxVmFyTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxVmFyTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgY29uc3QgcmlnaHRFeHByID0gdmFyVG9QaHAocmlnaHQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAoJHtyaWdodEV4cHJ9ID8/ICcnKWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwicmlnaHRcIikgLSBub3QgZXF1YWxzXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpICE9PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGd0IGxlZnQgcmlnaHQpIC0gZ3JlYXRlciB0aGFuXG4gICAgY29uc3QgZ3RNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZ3RcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChndE1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBndE1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocChsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/IDApID4gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobHQgbGVmdCByaWdodCkgLSBsZXNzIHRoYW5cbiAgICBjb25zdCBsdE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypsdFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGx0TWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGx0TWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPCAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChndGUgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW4gb3IgZXF1YWxcbiAgICBjb25zdCBndGVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZ3RlXFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgICBpZiAoZ3RlTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0ZU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocChsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/IDApID49ICR7cmlnaHR9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGx0ZSBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhbiBvciBlcXVhbFxuICAgIGNvbnN0IGx0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypsdGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChsdGVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRlTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPD0gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lL2d0L2x0L2V0YyAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGggaWYvZWxzZVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIGlmQ29udGVudCwgZWxzZUNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCR7cGhwQ29uZGl0aW9ufSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKGZhbHNlKSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgKGVxL25lL2d0L2x0L2V0YyAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlclRvUGhwKGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCB1bmxlc3NDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoISgke3BocENvbmRpdGlvbn0pKSA6ID8+JHt1bmxlc3NDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgaWYgKHRydWUpIDogPz4ke3VubGVzc0NvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aG91dCBlbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF8sIGhlbHBlckV4cHIsIHVubGVzc0NvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCEoJHtwaHBDb25kaXRpb259KSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAodHJ1ZSkgOiA/PiR7dW5sZXNzQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHt7I2lmIHByb3BlcnRpZXMueHh4Lnl5eS56enouLi59fSBjb25kaXRpb25hbHMgd2l0aCBkZWVwbHkgbmVzdGVkIHBhdGhzXG4gIC8vIGUuZy4sIHt7I2lmIHByb3BlcnRpZXMubGVmdF9jb2x1bW4uY3RhLmxpbmt9fSAtPiA8P3BocCBpZiAoIWVtcHR5KCRsZWZ0Q29sdW1uWydjdGEnXVsnbGluayddKSkgOiA/PlxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCQke2NhbWVsUHJvcH0pKSA6ID8+YDtcbiAgICAgIH1cbiAgICAgIC8vIEJ1aWxkIG5lc3RlZCBhcnJheSBhY2Nlc3MgZm9yIHJlbWFpbmluZyBwYXJ0c1xuICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGFydHMuc2xpY2UoMSkubWFwKChwOiBzdHJpbmcpID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30pKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3tlbHNlfX0gc2VwYXJhdGVseSAoZm9yIGNhc2VzIG5vdCBjYXVnaHQgYnkgdGhlIGNvbWJpbmVkIHBhdHRlcm5zIGFib3ZlKVxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7ZWxzZVxcfVxcfS9nLCAnPD9waHAgZWxzZSA6ID8+Jyk7XG4gIFxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFwvaWZcXH1cXH0vZywgJzw/cGhwIGVuZGlmOyA/PicpO1xuICBcbiAgLy8gSU1QT1JUQU5UOiBDb252ZXJ0IHRyaXBsZS1icmFjZSBleHByZXNzaW9ucyBGSVJTVCAoYmVmb3JlIGRvdWJsZS1icmFjZSlcbiAgLy8gVHJpcGxlIGJyYWNlcyBhcmUgZm9yIHVuZXNjYXBlZCBIVE1MIG91dHB1dCAocmljaCB0ZXh0IGZpZWxkcylcbiAgXG4gIC8vIENvbnZlcnQge3t7cHJvcGVydGllcy54eHh9fX0gdHJpcGxlIGJyYWNlcyAodW5lc2NhcGVkIEhUTUwpXG4gIC8vIHJpY2h0ZXh0IHByb3BzIHVzZSBJbm5lckJsb2NrcyDigJQgb3V0cHV0ICRjb250ZW50IChpbm5lciBibG9ja3MgcmVuZGVyZWQgSFRNTClcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFxzKlxcfVxcfVxcfS9nLFxuICAgIChfLCBwcm9wKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIGlmIChyaWNodGV4dFByb3BzLmhhcyhwcm9wKSB8fCByaWNodGV4dFByb3BzLmhhcyhjYW1lbFByb3ApKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgZWNobyAkY29udGVudDsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkJHtjYW1lbFByb3B9ID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7dGhpcy54eHh9fX0gdHJpcGxlIGJyYWNlcyBmb3IgbG9vcCBpdGVtc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFx7XFxzKnRoaXNcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKF8sIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t7YWxpYXMueHh4fX19IHRyaXBsZSBicmFjZXMgZm9yIG5hbWVkIGxvb3AgYWxpYXNlc1xuICAvLyBUaGlzIGNhdGNoZXMgYW55IHJlbWFpbmluZyBhbGlhcy5maWVsZCBwYXR0ZXJucyB3aXRoIHRyaXBsZSBicmFjZXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccyooXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XFx9L2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBwcm9wZXJ0aWVzLnh4eCBvciB0aGlzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHtpdGVtVmFyfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7e3RoaXN9fX0gZm9yIHNjYWxhciBhcnJheXMgd2l0aCBIVE1MIGNvbnRlbnRcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccyp0aGlzXFxzKlxcfVxcfVxcfS9nLFxuICAgICc8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkc3ViSXRlbSA/PyAkaXRlbSA/PyBcXCdcXCcpOyA/PidcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzfX0gc2ltcGxlIHJlZmVyZW5jZSAoZm9yIHNjYWxhciBhcnJheXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqdGhpc1xccypcXH1cXH0vZyxcbiAgICAnPD9waHAgZWNobyBlc2NfaHRtbCgkc3ViSXRlbSA/PyAkaXRlbSA/PyBcXCdcXCcpOyA/PidcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3t0aGlzLnh4eC55eXl9fSBkZWVwIG5lc3RlZCByZWZlcmVuY2VzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH0vZyxcbiAgICAoXywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBmaWVsZDIgPT09ICd1cmwnIHx8IGZpZWxkMiA9PT0gJ3NyYycgfHwgZmllbGQyID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJGl0ZW1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7dGhpcy54eHh9fSByZWZlcmVuY2VzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHMqdGhpc1xcLihcXHcrKVxccypcXH1cXH0vZyxcbiAgICAoXywgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBmaWVsZCA9PT0gJ3VybCcgfHwgZmllbGQgPT09ICdzcmMnIHx8IGZpZWxkID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJGl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3Byb3BlcnRpZXMueHh4Lnl5eS56enouLi59fSBkZWVwbHkgbmVzdGVkIHByb3BlcnR5IGFjY2VzcyAoYW55IGRlcHRoKVxuICAvLyBlLmcuLCB7e3Byb3BlcnRpZXMubGVmdF9jb2x1bW4uY3RhLmxpbmsubGFiZWx9fSAtPiAkbGVmdENvbHVtblsnY3RhJ11bJ2xpbmsnXVsnbGFiZWwnXVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMqXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJCR7Y2FtZWxQcm9wfSA/PyAnJyk7ID8+YDtcbiAgICAgIH1cbiAgICAgIC8vIEJ1aWxkIG5lc3RlZCBhcnJheSBhY2Nlc3MgZm9yIHJlbWFpbmluZyBwYXJ0c1xuICAgICAgY29uc3QgbmVzdGVkQWNjZXNzID0gcGFydHMuc2xpY2UoMSkubWFwKChwOiBzdHJpbmcpID0+IGBbJyR7cH0nXWApLmpvaW4oJycpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJCR7Y2FtZWxQcm9wfSR7bmVzdGVkQWNjZXNzfSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyB7e3h4eC55eXl9fSBwYXR0ZXJucyAobGlrZWx5IGxvb3AgaXRlbSByZWZlcmVuY2VzIHdpdGhvdXQgdGhpcy4pXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsrXFxzKihcXHcrKVxcLihcXHcrKVxccypcXH0rXFx9L2csXG4gICAgKF8sIG9iaiwgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBhIFBIUCBleHByZXNzaW9uXG4gICAgICBpZiAob2JqLmluY2x1ZGVzKCckJykgfHwgb2JqLmluY2x1ZGVzKCdwaHAnKSkgcmV0dXJuIGB7eyR7b2JqfS4ke2ZpZWxkfX19YDtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBmaWVsZCA9PT0gJ3VybCcgfHwgZmllbGQgPT09ICdzcmMnIHx8IGZpZWxkID09PSAnaHJlZicgfHwgZmllbGQgPT09ICdsYWJlbCcgPyBcbiAgICAgICAgKGZpZWxkID09PSAndXJsJyB8fCBmaWVsZCA9PT0gJ3NyYycgfHwgZmllbGQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCcpIDogJ2VzY19odG1sJztcbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW29ial0gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCR7aXRlbVZhcn1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBocmVmPVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zIHNwZWNpZmljYWxseVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHh9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfSA/PyAnIycpOyA/PlwiYDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyBocmVmPVwie3suLi59fVwiIHBhdHRlcm5zIChmb3IgbG9vcCBpdGVtIHJlZmVyZW5jZXMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9ocmVmPVwiXFx7XFx7KyhbXn1dKylcXH0rXFx9XCIvZyxcbiAgICAoXywgZXhwcikgPT4ge1xuICAgICAgaWYgKGV4cHIuaW5jbHVkZXMoJzw/cGhwJykpIHJldHVybiBgaHJlZj1cIiR7ZXhwcn1cImA7XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgdGhpcy54eHggcGF0dGVyblxuICAgICAgY29uc3QgdGhpc01hdGNoID0gZXhwci5tYXRjaCgvXlxccyp0aGlzXFwuKFxcdyspKD86XFwuKFxcdyspKT9cXHMqJC8pO1xuICAgICAgaWYgKHRoaXNNYXRjaCkge1xuICAgICAgICBjb25zdCBbLCBmaWVsZDEsIGZpZWxkMl0gPSB0aGlzTWF0Y2g7XG4gICAgICAgIGlmIChmaWVsZDIpIHtcbiAgICAgICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnIycpOyA/PlwiYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJGl0ZW1bJyR7ZmllbGQxfSddID8/ICcjJyk7ID8+XCJgO1xuICAgICAgfVxuICAgICAgcmV0dXJuICdocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCRpdGVtW1xcJ3VybFxcJ10gPz8gJGl0ZW1bXFwnbGlua1xcJ11bXFwndXJsXFwnXSA/PyBcXCcjXFwnKTsgPz5cIic7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ2xlYW4gdXAgYW55IHN0cmF5IGN1cmx5IGJyYWNlcyBhcm91bmQgUEhQIGVjaG8gc3RhdGVtZW50c1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7KDxcXD9waHAgZWNobykvZywgJyQxJyk7XG4gIHBocCA9IHBocC5yZXBsYWNlKC8oOyBcXD8+KVxcfS9nLCAnJDEnKTtcbiAgXG4gIHJldHVybiBwaHAudHJpbSgpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhdHRyaWJ1dGUgZXh0cmFjdGlvbiBjb2RlXG4gKi9cbmNvbnN0IGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbiA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBoYXNPdmVybGF5OiBib29sZWFuLCBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICAvLyBPbmx5IHRoZSBpbm5lckJsb2Nrc0ZpZWxkIHJpY2h0ZXh0IHVzZXMgJGNvbnRlbnQg4oCUIHNraXAgYXR0cmlidXRlIGV4dHJhY3Rpb24gZm9yIGl0XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ID09PSBpbm5lckJsb2Nrc0ZpZWxkKSBjb250aW51ZTtcbiAgICAvLyBwYWdpbmF0aW9uIGl0ZW1zIGFyZSBhdXRvLWdlbmVyYXRlZCBmcm9tIFdQX1F1ZXJ5IOKAlCBubyBhdHRyaWJ1dGUgdG8gZXh0cmFjdFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgY2FtZWxLZXkgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGdldFBocERlZmF1bHRWYWx1ZShwcm9wZXJ0eSk7XG4gICAgXG4gICAgZXh0cmFjdGlvbnMucHVzaChgJCR7Y2FtZWxLZXl9ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJyR7Y2FtZWxLZXl9J10pID8gJGF0dHJpYnV0ZXNbJyR7Y2FtZWxLZXl9J10gOiAke2RlZmF1bHRWYWx1ZX07YCk7XG4gIH1cbiAgXG4gIC8vIEFkZCBvdmVybGF5IG9wYWNpdHkgaWYgZGV0ZWN0ZWRcbiAgaWYgKGhhc092ZXJsYXkpIHtcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkb3ZlcmxheU9wYWNpdHkgPSBpc3NldCgkYXR0cmlidXRlc1snb3ZlcmxheU9wYWNpdHknXSkgPyAkYXR0cmlidXRlc1snb3ZlcmxheU9wYWNpdHknXSA6IDAuNjtgKTtcbiAgfVxuICBcbiAgcmV0dXJuIGV4dHJhY3Rpb25zLmpvaW4oJ1xcbicpO1xufTtcblxuLyoqXG4gKiBXcmFwIHRlbXBsYXRlIHdpdGggYmxvY2sgd3JhcHBlciB0aGF0IGhhbmRsZXMgYWxpZ25tZW50XG4gKiBBZGRzIHRoZSBhbGlnbm1lbnQgY2xhc3MgKGFsaWdubm9uZSwgYWxpZ253aWRlLCBhbGlnbmZ1bGwpIGJhc2VkIG9uIGJsb2NrIHNldHRpbmdzXG4gKi9cbmNvbnN0IHdyYXBXaXRoQmxvY2tXcmFwcGVyID0gKHRlbXBsYXRlOiBzdHJpbmcsIGNvbXBvbmVudElkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAvLyBDb252ZXJ0IGNvbXBvbmVudCBJRCB0byBjbGFzcyBuYW1lIChzbmFrZV9jYXNlIHRvIGtlYmFiLWNhc2UpXG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudElkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgXG4gIC8vIFdyYXAgdGhlIHRlbXBsYXRlIGluIGEgZGl2IHRoYXQgdXNlcyBXb3JkUHJlc3MncyBibG9jayB3cmFwcGVyIGF0dHJpYnV0ZXNcbiAgLy8gVGhpcyBoYW5kbGVzIGFsaWdubWVudCBjbGFzc2VzIGF1dG9tYXRpY2FsbHlcbiAgcmV0dXJuIGA8ZGl2IDw/cGhwIGVjaG8gZ2V0X2Jsb2NrX3dyYXBwZXJfYXR0cmlidXRlcyhbJ2NsYXNzJyA9PiAnJHtjbGFzc05hbWV9J10pOyA/Pj5cbiR7dGVtcGxhdGV9XG48L2Rpdj5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBQSFAgY29kZSB0byBjb252ZXJ0IGZpZWxkIG1hcHBpbmcgdmFsdWUgdG8gUEhQIGFycmF5IHN5bnRheFxuICovXG5jb25zdCBmaWVsZE1hcHBpbmdUb1BocCA9IChtYXBwaW5nOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcHBpbmdWYWx1ZT4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBlbnRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobWFwcGluZykpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgLy8gU2ltcGxlIHN0cmluZyBtYXBwaW5nXG4gICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiAnJHt2YWx1ZX0nYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLnR5cGUpIHtcbiAgICAgIC8vIENvbXBsZXggbWFwcGluZ1xuICAgICAgc3dpdGNoICh2YWx1ZS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ3N0YXRpYyc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnc3RhdGljJywgJ3ZhbHVlJyA9PiAnJHsodmFsdWUgYXMgYW55KS52YWx1ZSB8fCAnJ30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdtYW51YWwnOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ21hbnVhbCddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21ldGEnOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ21ldGEnLCAna2V5JyA9PiAnJHsodmFsdWUgYXMgYW55KS5rZXkgfHwgJyd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndGF4b25vbXknOlxuICAgICAgICAgIGNvbnN0IHRheFZhbHVlID0gdmFsdWUgYXMgeyB0eXBlOiAndGF4b25vbXknOyB0YXhvbm9teTogc3RyaW5nOyBmb3JtYXQ/OiBzdHJpbmcgfTtcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICd0YXhvbm9teScsICd0YXhvbm9teScgPT4gJyR7dGF4VmFsdWUudGF4b25vbXl9JywgJ2Zvcm1hdCcgPT4gJyR7dGF4VmFsdWUuZm9ybWF0IHx8ICdmaXJzdCd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY3VzdG9tJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdjdXN0b20nLCAnY2FsbGJhY2snID0+ICckeyh2YWx1ZSBhcyBhbnkpLmNhbGxiYWNrIHx8ICcnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gYFtcXG4ke2VudHJpZXMuam9pbignLFxcbicpfVxcbiAgXWA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHBhZ2luYXRpb24gUEhQIGNvZGUgZm9yIGEgZHluYW1pYyBhcnJheSBxdWVyeS5cbiAqIFJldHVybnMgdGhlIHBhZ2luYXRpb24gYmxvY2sgdG8gYXBwZW5kIGFmdGVyIHRoZSBXUF9RdWVyeSBleGVjdXRpb24uXG4gKi9cbmNvbnN0IGdlbmVyYXRlUGFnaW5hdGlvblBocCA9IChcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgcGFnaW5hdGlvblByb3BOYW1lOiBzdHJpbmdcbik6IHN0cmluZyA9PiB7XG4gIHJldHVybiBgXG4gIC8vIFBhZ2luYXRpb25cbiAgJCR7cGFnaW5hdGlvblByb3BOYW1lfSA9IFtdO1xuICAkJHthdHRyTmFtZX1fcGFnaW5hdGlvbl9lbmFibGVkID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQnXSA/PyB0cnVlO1xuICBpZiAoJCR7YXR0ck5hbWV9X3BhZ2luYXRpb25fZW5hYmxlZCAmJiAkcXVlcnktPm1heF9udW1fcGFnZXMgPiAxICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uJykpIHtcbiAgICAkJHtwYWdpbmF0aW9uUHJvcE5hbWV9ID0gaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uKCRoZl9wYWdlZCwgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzLCAnJHtgaGZfcGFnZV8ke2F0dHJOYW1lfWB9Jyk7XG4gIH1gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0aGUgcGFnZWQgdmFyaWFibGUgZXh0cmFjdGlvbiBhbmQgV1BfUXVlcnkgcGFnZWQgYXJnIGZvciBwYWdpbmF0aW9uLlxuICovXG5jb25zdCBnZW5lcmF0ZVBhZ2VkUGhwID0gKGF0dHJOYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBwYXJhbUtleSA9IGBoZl9wYWdlXyR7YXR0ck5hbWV9YDtcbiAgcmV0dXJuIGBcbiAgLy8gUmVhZCBjdXJyZW50IHBhZ2UgZnJvbSBjdXN0b20gcXVlcnkgcGFyYW1ldGVyXG4gICRoZl9wYWdlZCA9IGlzc2V0KCRfR0VUWycke3BhcmFtS2V5fSddKSA/IG1heCgxLCBpbnR2YWwoJF9HRVRbJyR7cGFyYW1LZXl9J10pKSA6IDE7YDtcbn07XG5cbi8qKlxuICogQnVpbGQgUEhQIGFycmF5X21hcCBleHByZXNzaW9uIHRvIHJlc2hhcGUgc3RhbmRhcmQgaGVscGVyIGl0ZW1zIGludG8gdGhlXG4gKiB0ZW1wbGF0ZSdzIGV4cGVjdGVkIGl0ZW0gc2hhcGUuICBSZXR1cm5zIG51bGwgd2hlbiBubyByZXNoYXBpbmcgaXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSBpdGVtUHJvcGVydGllcyAgVGhlIGNvbXBvbmVudCdzIGFycmF5IGl0ZW0gcHJvcGVydHkgc2NoZW1hIChpdGVtcy5wcm9wZXJ0aWVzKVxuICogQHBhcmFtIHN0YW5kYXJkRmllbGRzICBUaGUgZmxhdCBmaWVsZCBuYW1lcyB0aGUgaGVscGVyIHJldHVybnMgKGUuZy4gWydsYWJlbCcsJ3VybCddKVxuICovXG5jb25zdCBidWlsZFJlc2hhcGVQaHAgPSAoXG4gIGl0ZW1Qcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+IHwgdW5kZWZpbmVkLFxuICBzdGFuZGFyZEZpZWxkczogc3RyaW5nW10sXG4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgaWYgKCFpdGVtUHJvcGVydGllcykgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgdG9wS2V5cyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wZXJ0aWVzKTtcblxuICAvLyBJZiBldmVyeSB0b3AtbGV2ZWwga2V5IElTIGEgc3RhbmRhcmQgZmllbGQgdGhlIHNoYXBlcyBhbHJlYWR5IG1hdGNoXG4gIGlmICh0b3BLZXlzLmV2ZXJ5KGsgPT4gc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoaykpKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBwYWlyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhpdGVtUHJvcGVydGllcykpIHtcbiAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgcGFpcnMucHVzaChgJyR7a2V5fScgPT4gJF9faXRlbVsnJHtrZXl9J11gKTtcbiAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ2xpbmsnIHx8IHByb3AudHlwZSA9PT0gJ2J1dHRvbicpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygnbGFiZWwnKSkgc3ViLnB1c2goYCdsYWJlbCcgPT4gJF9faXRlbVsnbGFiZWwnXWApO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCd1cmwnKSkgICBzdWIucHVzaChgJ3VybCcgICA9PiAkX19pdGVtWyd1cmwnXWApO1xuICAgICAgaWYgKHN1Yi5sZW5ndGgpIHBhaXJzLnB1c2goYCcke2tleX0nID0+IFske3N1Yi5qb2luKCcsICcpfV1gKTtcbiAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBmb3IgKGNvbnN0IHN1YktleSBvZiBPYmplY3Qua2V5cyhwcm9wLnByb3BlcnRpZXMpKSB7XG4gICAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcyhzdWJLZXkpKSB7XG4gICAgICAgICAgc3ViLnB1c2goYCcke3N1YktleX0nID0+ICRfX2l0ZW1bJyR7c3ViS2V5fSddYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAnJHtrZXl9JyA9PiBbJHtzdWIuam9pbignLCAnKX1dYCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHBhaXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBgWyR7cGFpcnMuam9pbignLCAnKX1dYDtcbn07XG5cbi8qKlxuICogQnVpbGQgZXF1aXZhbGVudCBKUyByZXNoYXBlIGV4cHJlc3Npb24gZm9yIGVkaXRvciBwcmV2aWV3LlxuICogUmV0dXJucyBudWxsIHdoZW4gbm8gcmVzaGFwaW5nIGlzIG5lZWRlZC5cbiAqL1xuY29uc3QgYnVpbGRSZXNoYXBlSnMgPSAoXG4gIGl0ZW1Qcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+IHwgdW5kZWZpbmVkLFxuICBzdGFuZGFyZEZpZWxkczogc3RyaW5nW10sXG4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgaWYgKCFpdGVtUHJvcGVydGllcykgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgdG9wS2V5cyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wZXJ0aWVzKTtcbiAgaWYgKHRvcEtleXMuZXZlcnkoayA9PiBzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcyhrKSkpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHBhaXJzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wZXJ0aWVzKSkge1xuICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICBwYWlycy5wdXNoKGAke2tleX06IGl0ZW0uJHtrZXl9YCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJyB8fCBwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ2xhYmVsJykpIHN1Yi5wdXNoKGBsYWJlbDogaXRlbS5sYWJlbGApO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCd1cmwnKSkgICBzdWIucHVzaChgdXJsOiBpdGVtLnVybGApO1xuICAgICAgaWYgKHN1Yi5sZW5ndGgpIHBhaXJzLnB1c2goYCR7a2V5fTogeyAke3N1Yi5qb2luKCcsICcpfSB9YCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgZm9yIChjb25zdCBzdWJLZXkgb2YgT2JqZWN0LmtleXMocHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoc3ViS2V5KSkge1xuICAgICAgICAgIHN1Yi5wdXNoKGAke3N1YktleX06IGl0ZW0uJHtzdWJLZXl9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAke2tleX06IHsgJHtzdWIuam9pbignLCAnKX0gfWApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYWlycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gYCh7ICR7cGFpcnMuam9pbignLCAnKX0gfSlgO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBicmVhZGNydW1icyBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHAuXG4gKiBDYWxscyBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCkgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgcmV0dXJucyBhbiBlbXB0eSBhcnJheS5cbiAqL1xuY29uc3QgZ2VuZXJhdGVCcmVhZGNydW1ic0FycmF5RXh0cmFjdGlvbiA9IChcbiAgZmllbGROYW1lOiBzdHJpbmcsXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHJlc2hhcGVFeHByID0gYnVpbGRSZXNoYXBlUGhwKGl0ZW1Qcm9wZXJ0aWVzLCBbJ2xhYmVsJywgJ3VybCddKTtcbiAgY29uc3QgYXNzaWduSXRlbXMgPSByZXNoYXBlRXhwclxuICAgID8gYCRfX3JhdyA9IGhhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMoKTtcbiAgICAkJHthdHRyTmFtZX0gPSBhcnJheV9tYXAoZnVuY3Rpb24oJF9faXRlbSkgeyByZXR1cm4gJHtyZXNoYXBlRXhwcn07IH0sICRfX3Jhdyk7YFxuICAgIDogYCQke2F0dHJOYW1lfSA9IGhhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMoKTtgO1xuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKGJyZWFkY3J1bWJzKVxuJCR7YXR0ck5hbWV9RW5hYmxlZCA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUVuYWJsZWQnXSA/PyB0cnVlO1xuJCR7YXR0ck5hbWV9ID0gW107XG5pZiAoJCR7YXR0ck5hbWV9RW5hYmxlZCkge1xuICBpZiAoIWZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcycpKSB7XG4gICAgJHJlc29sdmVyX3BhdGggPSBkZWZpbmVkKCdIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSJylcbiAgICAgID8gSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUiAuICdpbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCdcbiAgICAgIDogZGlybmFtZShfX0ZJTEVfXykgLiAnLy4uL2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJztcbiAgICBpZiAoZmlsZV9leGlzdHMoJHJlc29sdmVyX3BhdGgpKSB7XG4gICAgICByZXF1aXJlX29uY2UgJHJlc29sdmVyX3BhdGg7XG4gICAgfVxuICB9XG4gIGlmIChmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMnKSkge1xuICAgICR7YXNzaWduSXRlbXN9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHRheG9ub215IHRlcm1zIGFycmF5IGV4dHJhY3Rpb24gY29kZSBmb3IgcmVuZGVyLnBocC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbiA9IChcbiAgZmllbGROYW1lOiBzdHJpbmcsXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIGNvbmZpZzogVGF4b25vbXlBcnJheUNvbmZpZyxcbiAgaXRlbVByb3BlcnRpZXM/OiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbWF4SXRlbXMgPSBjb25maWcubWF4SXRlbXMgPz8gLTE7XG4gIGNvbnN0IGRlZmF1bHRUYXhvbm9teSA9IGNvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gIGNvbnN0IHJlc2hhcGVFeHByID0gYnVpbGRSZXNoYXBlUGhwKGl0ZW1Qcm9wZXJ0aWVzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuXG4gIC8vIEJ1aWxkIHRoZSBwZXItdGVybSBhc3NpZ25tZW50OiBlaXRoZXIgZmxhdCBvciByZXNoYXBlZFxuICBsZXQgdGVybUFzc2lnbm1lbnQ6IHN0cmluZztcbiAgaWYgKHJlc2hhcGVFeHByKSB7XG4gICAgdGVybUFzc2lnbm1lbnQgPSBgICAgICAgICAkX19pdGVtID0gWydsYWJlbCcgPT4gJHRlcm0tPm5hbWUsICd1cmwnID0+IGdldF90ZXJtX2xpbmsoJHRlcm0pLCAnc2x1ZycgPT4gJHRlcm0tPnNsdWddO1xuICAgICAgICAkJHthdHRyTmFtZX1bXSA9ICR7cmVzaGFwZUV4cHJ9O2A7XG4gIH0gZWxzZSB7XG4gICAgdGVybUFzc2lnbm1lbnQgPSBgICAgICAgICAkJHthdHRyTmFtZX1bXSA9IFtcbiAgICAgICAgICAnbGFiZWwnID0+ICR0ZXJtLT5uYW1lLFxuICAgICAgICAgICd1cmwnICAgPT4gZ2V0X3Rlcm1fbGluaygkdGVybSksXG4gICAgICAgICAgJ3NsdWcnICA9PiAkdGVybS0+c2x1ZyxcbiAgICAgICAgXTtgO1xuICB9XG5cbiAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAodGF4b25vbXkgdGVybXMpXG4kJHthdHRyTmFtZX1FbmFibGVkICA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUVuYWJsZWQnXSAgPz8gZmFsc2U7XG4kJHthdHRyTmFtZX1UYXhvbm9teSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVRheG9ub215J10gPz8gJyR7ZGVmYXVsdFRheG9ub215fSc7XG4kJHthdHRyTmFtZX1Tb3VyY2UgICA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddICAgPz8gJ2F1dG8nO1xuJCR7YXR0ck5hbWV9ID0gW107XG5pZiAoJCR7YXR0ck5hbWV9RW5hYmxlZCkge1xuICBpZiAoJCR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJykge1xuICAgICQke2F0dHJOYW1lfSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfSddID8/IFtdO1xuICB9IGVsc2Uge1xuICAgICR0ZXJtcyA9IHdwX2dldF9wb3N0X3Rlcm1zKGdldF90aGVfSUQoKSwgJCR7YXR0ck5hbWV9VGF4b25vbXksIFsnbnVtYmVyJyA9PiAke21heEl0ZW1zfV0pO1xuICAgIGlmICghaXNfd3BfZXJyb3IoJHRlcm1zKSkge1xuICAgICAgZm9yZWFjaCAoJHRlcm1zIGFzICR0ZXJtKSB7XG4ke3Rlcm1Bc3NpZ25tZW50fVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgcGFnaW5hdGlvbiBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHAuXG4gKiBSZWZlcmVuY2VzIHRoZSBXUF9RdWVyeSBpbnN0YW5jZSAoJHF1ZXJ5KSBwcm9kdWNlZCBieSB0aGUgY29ubmVjdGVkIHBvc3RzIGZpZWxkLlxuICovXG5jb25zdCBnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IFBhZ2luYXRpb25BcnJheUNvbmZpZyxcbiAgaXRlbVByb3BlcnRpZXM/OiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY29ubmVjdGVkQXR0ciA9IHRvQ2FtZWxDYXNlKGNvbmZpZy5jb25uZWN0ZWRGaWVsZCk7XG4gIGNvbnN0IHJlc2hhcGVFeHByID0gYnVpbGRSZXNoYXBlUGhwKGl0ZW1Qcm9wZXJ0aWVzLCBbJ2xhYmVsJywgJ3VybCcsICdhY3RpdmUnXSk7XG5cbiAgY29uc3QgYXNzaWduSXRlbXMgPSByZXNoYXBlRXhwclxuICAgID8gYCRfX3JhdyA9IGhhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbigkaGZfcGFnZWRfJHtjb25uZWN0ZWRBdHRyfSwgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzLCAnaGZfcGFnZV8ke2Nvbm5lY3RlZEF0dHJ9Jyk7XG4gICAgJCR7YXR0ck5hbWV9ID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCRfX2l0ZW0pIHsgcmV0dXJuICR7cmVzaGFwZUV4cHJ9OyB9LCAkX19yYXcpO2BcbiAgICA6IGAkJHthdHRyTmFtZX0gPSBoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24oJGhmX3BhZ2VkXyR7Y29ubmVjdGVkQXR0cn0sICRxdWVyeS0+bWF4X251bV9wYWdlcywgJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfScpO2A7XG5cbiAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAocGFnaW5hdGlvbiDigJQgY29ubmVjdGVkIHRvICcke2NvbmZpZy5jb25uZWN0ZWRGaWVsZH0nKVxuJCR7YXR0ck5hbWV9RW5hYmxlZCA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUVuYWJsZWQnXSA/PyB0cnVlO1xuJCR7YXR0ck5hbWV9ID0gW107XG5pZiAoJCR7YXR0ck5hbWV9RW5hYmxlZCAmJiBpc3NldCgkcXVlcnkpICYmICRxdWVyeS0+bWF4X251bV9wYWdlcyA+IDEpIHtcbiAgaWYgKCFmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbicpKSB7XG4gICAgJHJlc29sdmVyX3BhdGggPSBkZWZpbmVkKCdIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSJylcbiAgICAgID8gSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUiAuICdpbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCdcbiAgICAgIDogZGlybmFtZShfX0ZJTEVfXykgLiAnLy4uL2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJztcbiAgICBpZiAoZmlsZV9leGlzdHMoJHJlc29sdmVyX3BhdGgpKSB7XG4gICAgICByZXF1aXJlX29uY2UgJHJlc29sdmVyX3BhdGg7XG4gICAgfVxuICB9XG4gIGlmIChmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbicpKSB7XG4gICAgJGhmX3BhZ2VkXyR7Y29ubmVjdGVkQXR0cn0gPSBpc3NldCgkX0dFVFsnaGZfcGFnZV8ke2Nvbm5lY3RlZEF0dHJ9J10pID8gbWF4KDEsIGludHZhbCgkX0dFVFsnaGZfcGFnZV8ke2Nvbm5lY3RlZEF0dHJ9J10pKSA6IDE7XG4gICAgJHthc3NpZ25JdGVtc31cbiAgfVxufVxuYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZHluYW1pYyBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHBcbiAqIFN1cHBvcnRzIGJvdGggbWFudWFsIHBvc3Qgc2VsZWN0aW9uIGFuZCBxdWVyeSBidWlsZGVyIG1vZGVzXG4gKi9cbmNvbnN0IGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbiA9IChcbiAgZmllbGROYW1lOiBzdHJpbmcsXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIGNvbmZpZzogRHluYW1pY0FycmF5Q29uZmlnXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBtYXBwaW5nUGhwID0gY29uZmlnLmZpZWxkTWFwcGluZyBcbiAgICA/IGZpZWxkTWFwcGluZ1RvUGhwKGNvbmZpZy5maWVsZE1hcHBpbmcpIFxuICAgIDogJ1tdJztcbiAgXG4gIGNvbnN0IGlzUXVlcnlNb2RlID0gY29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdxdWVyeSc7XG4gIGNvbnN0IGhhc1BhZ2luYXRpb24gPSBpc1F1ZXJ5TW9kZSAmJiAhIWNvbmZpZy5wYWdpbmF0aW9uO1xuICBjb25zdCBwYWdpbmF0aW9uUHJvcE5hbWUgPSBjb25maWcucGFnaW5hdGlvbj8ucHJvcGVydHlOYW1lIHx8ICdwYWdpbmF0aW9uJztcbiAgXG4gIC8vIENvbW1vbiBjb2RlIGZvciBsb2FkaW5nIHRoZSBmaWVsZCByZXNvbHZlclxuICBjb25zdCBsb2FkUmVzb2x2ZXIgPSBgXG4gIC8vIEVuc3VyZSBmaWVsZCByZXNvbHZlciBpcyBsb2FkZWRcbiAgaWYgKCFmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfbWFwX3Bvc3RfdG9faXRlbScpKSB7XG4gICAgJHJlc29sdmVyX3BhdGggPSBkZWZpbmVkKCdIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSJykgXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfWA7XG5cbiAgLy8gUGFnaW5hdGlvbiBQSFAgc25pcHBldHMgKGVtcHR5IHN0cmluZ3Mgd2hlbiBubyBwYWdpbmF0aW9uKVxuICBjb25zdCBwYWdlZEV4dHJhY3Rpb24gPSBoYXNQYWdpbmF0aW9uID8gZ2VuZXJhdGVQYWdlZFBocChhdHRyTmFtZSkgOiAnJztcbiAgY29uc3QgcGFnZWRBcmcgPSBoYXNQYWdpbmF0aW9uID8gYFxcbiAgICAncGFnZWQnICAgICAgICAgID0+ICRoZl9wYWdlZCxgIDogJyc7XG4gIGNvbnN0IHBhZ2luYXRpb25CbG9jayA9IGhhc1BhZ2luYXRpb24gPyBnZW5lcmF0ZVBhZ2luYXRpb25QaHAoYXR0ck5hbWUsIHBhZ2luYXRpb25Qcm9wTmFtZSkgOiAnJztcbiAgLy8gSW5pdGlhbGl6ZSBwYWdpbmF0aW9uIHZhcmlhYmxlIHRvIGVtcHR5IGFycmF5IHdoZW4gbm90IGluIHF1ZXJ5IG1vZGVcbiAgY29uc3QgcGFnaW5hdGlvbkluaXQgPSBoYXNQYWdpbmF0aW9uID8gYFxcbiQke3BhZ2luYXRpb25Qcm9wTmFtZX0gPSBbXTtgIDogJyc7XG5cbiAgaWYgKGNvbmZpZy5yZW5kZXJNb2RlID09PSAndGVtcGxhdGUnKSB7XG4gICAgLy8gVGVtcGxhdGUgbW9kZSAtIHN0b3JlIHBvc3RzIGZvciB0ZW1wbGF0ZSByZW5kZXJpbmdcbiAgICBjb25zdCB0ZW1wbGF0ZVBhdGggPSBjb25maWcudGVtcGxhdGVQYXRoIHx8IGB0ZW1wbGF0ZS1wYXJ0cy9oYW5kb2ZmLyR7ZmllbGROYW1lfS1pdGVtLnBocGA7XG4gICAgXG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgLSB1c2UgV1BfUXVlcnkgd2l0aCBxdWVyeSBhcmdzXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChxdWVyeSBidWlsZGVyICsgdGVtcGxhdGUgbW9kZSlcbiQke2F0dHJOYW1lfV9zb3VyY2UgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSA/PyAncXVlcnknO1xuJCR7YXR0ck5hbWV9X3Bvc3RzID0gW107JHtwYWdpbmF0aW9uSW5pdH1cblxuaWYgKCQke2F0dHJOYW1lfV9zb3VyY2UgPT09ICdxdWVyeScpIHtcbiAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIC0gYnVpbGQgV1BfUXVlcnkgZnJvbSBzYXZlZCBhcmdzXG4gICRxdWVyeV9hcmdzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9UXVlcnlBcmdzJ10gPz8gW107JHtwYWdlZEV4dHJhY3Rpb259XG4gIFxuICAvLyBCdWlsZCBXUF9RdWVyeSBhcmd1bWVudHNcbiAgJHdwX3F1ZXJ5X2FyZ3MgPSBbXG4gICAgJ3Bvc3RfdHlwZScgICAgICA9PiAkcXVlcnlfYXJnc1sncG9zdF90eXBlJ10gPz8gJyR7Y29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBjb25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0J30nLFxuICAgICdwb3N0c19wZXJfcGFnZScgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RzX3Blcl9wYWdlJ10gPz8gJHtjb25maWcubWF4SXRlbXMgfHwgNn0sXG4gICAgJ29yZGVyYnknICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXJieSddID8/ICdkYXRlJyxcbiAgICAnb3JkZXInICAgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlciddID8/ICdERVNDJyxcbiAgICAncG9zdF9zdGF0dXMnICAgID0+ICdwdWJsaXNoJywke3BhZ2VkQXJnfVxuICBdO1xuICBcbiAgLy8gRXhjbHVkZSB0aGUgY3VycmVudCBwb3N0IHRvIHByZXZlbnQgc2VsZi1yZWZlcmVuY2VcbiAgJGN1cnJlbnRfcG9zdF9pZCA9IGdldF90aGVfSUQoKTtcbiAgaWYgKCRjdXJyZW50X3Bvc3RfaWQpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sncG9zdF9fbm90X2luJ10gPSBbJGN1cnJlbnRfcG9zdF9pZF07XG4gIH1cbiAgXG4gIC8vIEFkZCB0YXhvbm9teSBxdWVyaWVzIGlmIHByZXNlbnRcbiAgaWYgKCFlbXB0eSgkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCR0cSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgJ3RheG9ub215JyA9PiAkdHFbJ3RheG9ub215J10gPz8gJycsXG4gICAgICAgICdmaWVsZCcgICAgPT4gJHRxWydmaWVsZCddID8/ICd0ZXJtX2lkJyxcbiAgICAgICAgJ3Rlcm1zJyAgICA9PiAkdHFbJ3Rlcm1zJ10gPz8gW10sXG4gICAgICAgICdvcGVyYXRvcicgPT4gJHRxWydvcGVyYXRvciddID8/ICdJTicsXG4gICAgICBdO1xuICAgIH0sICRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSk7XG4gIH1cbiAgXG4gICRxdWVyeSA9IG5ldyBXUF9RdWVyeSgkd3BfcXVlcnlfYXJncyk7XG4gICQke2F0dHJOYW1lfV9wb3N0cyA9ICRxdWVyeS0+cG9zdHM7JHtwYWdpbmF0aW9uQmxvY2t9XG4gIHdwX3Jlc2V0X3Bvc3RkYXRhKCk7XG59XG4vLyBGb3IgdGVtcGxhdGUgbW9kZSwgdGhlIHRlbXBsYXRlIHdpbGwgaXRlcmF0ZSBvdmVyICQke2F0dHJOYW1lfV9wb3N0c1xuYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTWFudWFsIHNlbGVjdGlvbiBtb2RlIC0gZmV0Y2ggc3BlY2lmaWMgcG9zdHNcbiAgICAgIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHNlbGVjdCBwb3N0cyArIHRlbXBsYXRlIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5JztcbiQke2F0dHJOYW1lfV9wb3N0cyA9IFtdOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAnc2VsZWN0Jykge1xuICAkc2VsZWN0ZWRfcG9zdHMgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzJ10gPz8gW107XG4gIFxuICBpZiAoIWVtcHR5KCRzZWxlY3RlZF9wb3N0cykpIHtcbiAgICAkcG9zdF9pZHMgPSBhcnJheV9maWx0ZXIoYXJyYXlfbWFwKGZ1bmN0aW9uKCRwKSB7IFxuICAgICAgcmV0dXJuIGlzc2V0KCRwWydpZCddKSA/IGludHZhbCgkcFsnaWQnXSkgOiAwOyBcbiAgICB9LCAkc2VsZWN0ZWRfcG9zdHMpKTtcbiAgICBcbiAgICBpZiAoIWVtcHR5KCRwb3N0X2lkcykpIHtcbiAgICAgICQke2F0dHJOYW1lfV9wb3N0cyA9IGdldF9wb3N0cyhbXG4gICAgICAgICdwb3N0X19pbicgICAgICAgPT4gJHBvc3RfaWRzLFxuICAgICAgICAnb3JkZXJieScgICAgICAgID0+ICdwb3N0X19pbicsXG4gICAgICAgICdwb3N0c19wZXJfcGFnZScgPT4gY291bnQoJHBvc3RfaWRzKSxcbiAgICAgICAgJ3Bvc3Rfc3RhdHVzJyAgICA9PiAncHVibGlzaCcsXG4gICAgICAgICdwb3N0X3R5cGUnICAgICAgPT4gJ2FueScsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cbn1cbi8vIEZvciB0ZW1wbGF0ZSBtb2RlLCB0aGUgdGVtcGxhdGUgd2lsbCBpdGVyYXRlIG92ZXIgJCR7YXR0ck5hbWV9X3Bvc3RzXG5gO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyBNYXBwZWQgbW9kZSAtIGNvbnZlcnQgcG9zdHMgdG8gaXRlbSBzdHJ1Y3R1cmVcbiAgICBpZiAoaXNRdWVyeU1vZGUpIHtcbiAgICAgIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSB3aXRoIGZpZWxkIG1hcHBpbmdcbiAgICAgIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHF1ZXJ5IGJ1aWxkZXIgKyBtYXBwZWQgbW9kZSlcbiQke2F0dHJOYW1lfV9zb3VyY2UgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSA/PyAncXVlcnknOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAncXVlcnknKSB7XG4gIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSAtIGJ1aWxkIFdQX1F1ZXJ5IGZyb20gc2F2ZWQgYXJnc1xuICAkcXVlcnlfYXJncyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVF1ZXJ5QXJncyddID8/IFtdO1xuICAkZmllbGRfbWFwcGluZyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUZpZWxkTWFwcGluZyddID8/ICR7bWFwcGluZ1BocH07XG4ke2xvYWRSZXNvbHZlcn0ke3BhZ2VkRXh0cmFjdGlvbn1cbiAgXG4gIC8vIEJ1aWxkIFdQX1F1ZXJ5IGFyZ3VtZW50c1xuICAkd3BfcXVlcnlfYXJncyA9IFtcbiAgICAncG9zdF90eXBlJyAgICAgID0+ICRxdWVyeV9hcmdzWydwb3N0X3R5cGUnXSA/PyAnJHtjb25maWcuZGVmYXVsdFBvc3RUeXBlIHx8IGNvbmZpZy5wb3N0VHlwZXNbMF0gfHwgJ3Bvc3QnfScsXG4gICAgJ3Bvc3RzX3Blcl9wYWdlJyA9PiAkcXVlcnlfYXJnc1sncG9zdHNfcGVyX3BhZ2UnXSA/PyAke2NvbmZpZy5tYXhJdGVtcyB8fCA2fSxcbiAgICAnb3JkZXJieScgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlcmJ5J10gPz8gJ2RhdGUnLFxuICAgICdvcmRlcicgICAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyJ10gPz8gJ0RFU0MnLFxuICAgICdwb3N0X3N0YXR1cycgICAgPT4gJ3B1Ymxpc2gnLCR7cGFnZWRBcmd9XG4gIF07XG4gIFxuICAvLyBFeGNsdWRlIHRoZSBjdXJyZW50IHBvc3QgdG8gcHJldmVudCBzZWxmLXJlZmVyZW5jZVxuICAkY3VycmVudF9wb3N0X2lkID0gZ2V0X3RoZV9JRCgpO1xuICBpZiAoJGN1cnJlbnRfcG9zdF9pZCkge1xuICAgICR3cF9xdWVyeV9hcmdzWydwb3N0X19ub3RfaW4nXSA9IFskY3VycmVudF9wb3N0X2lkXTtcbiAgfVxuICBcbiAgLy8gQWRkIHRheG9ub215IHF1ZXJpZXMgaWYgcHJlc2VudFxuICBpZiAoIWVtcHR5KCRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSkpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10gPSBhcnJheV9tYXAoZnVuY3Rpb24oJHRxKSB7XG4gICAgICByZXR1cm4gW1xuICAgICAgICAndGF4b25vbXknID0+ICR0cVsndGF4b25vbXknXSA/PyAnJyxcbiAgICAgICAgJ2ZpZWxkJyAgICA9PiAkdHFbJ2ZpZWxkJ10gPz8gJ3Rlcm1faWQnLFxuICAgICAgICAndGVybXMnICAgID0+ICR0cVsndGVybXMnXSA/PyBbXSxcbiAgICAgICAgJ29wZXJhdG9yJyA9PiAkdHFbJ29wZXJhdG9yJ10gPz8gJ0lOJyxcbiAgICAgIF07XG4gICAgfSwgJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKTtcbiAgfVxuICBcbiAgJHF1ZXJ5ID0gbmV3IFdQX1F1ZXJ5KCR3cF9xdWVyeV9hcmdzKTtcbiAgXG4gIC8vIE1hcCBwb3N0cyB0byB0ZW1wbGF0ZSBzdHJ1Y3R1cmVcbiAgJCR7YXR0ck5hbWV9ID0gW107XG4gIGlmICgkcXVlcnktPmhhdmVfcG9zdHMoKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfbWFwX3Bvc3RfdG9faXRlbScpKSB7XG4gICAgZm9yZWFjaCAoJHF1ZXJ5LT5wb3N0cyBhcyAkcG9zdCkge1xuICAgICAgJCR7YXR0ck5hbWV9W10gPSBoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0oJHBvc3QtPklELCAkZmllbGRfbWFwcGluZyk7XG4gICAgfVxuICB9XG4gIC8vIEFwcGx5IGl0ZW0gb3ZlcnJpZGVzIChlLmcuIGNhcmQgdHlwZSBmb3IgYWxsIGl0ZW1zKSBmcm9tIEFkdmFuY2VkIG9wdGlvbnNcbiAgJGl0ZW1fb3ZlcnJpZGVzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlcyddID8/IFtdO1xuICBpZiAoIWVtcHR5KCRpdGVtX292ZXJyaWRlcykgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2FwcGx5X2l0ZW1fb3ZlcnJpZGVzJykpIHtcbiAgICBmb3JlYWNoICgkJHthdHRyTmFtZX0gYXMgJGkgPT4gJGl0ZW0pIHtcbiAgICAgICQke2F0dHJOYW1lfVskaV0gPSBoYW5kb2ZmX2FwcGx5X2l0ZW1fb3ZlcnJpZGVzKCRpdGVtLCAkaXRlbV9vdmVycmlkZXMpO1xuICAgIH1cbiAgfSR7cGFnaW5hdGlvbkJsb2NrfVxuICB3cF9yZXNldF9wb3N0ZGF0YSgpO1xufVxuLy8gZWxzZTogTWFudWFsIG1vZGUgdXNlcyAkJHthdHRyTmFtZX0gZGlyZWN0bHkgZnJvbSBhdHRyaWJ1dGUgZXh0cmFjdGlvblxuYDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU2VsZWN0IHBvc3RzIG1vZGUgd2l0aCBmaWVsZCBtYXBwaW5nXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChzZWxlY3QgcG9zdHMgKyBtYXBwZWQgbW9kZSlcbiQke2F0dHJOYW1lfV9zb3VyY2UgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSA/PyAncXVlcnknOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAnc2VsZWN0Jykge1xuICAkc2VsZWN0ZWRfcG9zdHMgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzJ10gPz8gW107XG4gICRmaWVsZF9tYXBwaW5nID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9RmllbGRNYXBwaW5nJ10gPz8gJHttYXBwaW5nUGhwfTtcbiR7bG9hZFJlc29sdmVyfVxuICBcbiAgaWYgKCFlbXB0eSgkc2VsZWN0ZWRfcG9zdHMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9xdWVyeV9hbmRfbWFwX3Bvc3RzJykpIHtcbiAgICAkJHthdHRyTmFtZX0gPSBoYW5kb2ZmX3F1ZXJ5X2FuZF9tYXBfcG9zdHMoJHNlbGVjdGVkX3Bvc3RzLCAkZmllbGRfbWFwcGluZyk7XG4gIH0gZWxzZSB7XG4gICAgJCR7YXR0ck5hbWV9ID0gW107XG4gIH1cbiAgJGl0ZW1fb3ZlcnJpZGVzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlcyddID8/IFtdO1xuICBpZiAoIWVtcHR5KCRpdGVtX292ZXJyaWRlcykgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2FwcGx5X2l0ZW1fb3ZlcnJpZGVzJykpIHtcbiAgICBmb3JlYWNoICgkJHthdHRyTmFtZX0gYXMgJGkgPT4gJGl0ZW0pIHtcbiAgICAgICQke2F0dHJOYW1lfVskaV0gPSBoYW5kb2ZmX2FwcGx5X2l0ZW1fb3ZlcnJpZGVzKCRpdGVtLCAkaXRlbV9vdmVycmlkZXMpO1xuICAgIH1cbiAgfVxufVxuLy8gZWxzZTogTWFudWFsIG1vZGUgdXNlcyAkJHthdHRyTmFtZX0gZGlyZWN0bHkgZnJvbSBhdHRyaWJ1dGUgZXh0cmFjdGlvblxuYDtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgY29tcGxldGUgcmVuZGVyLnBocCBmaWxlXG4gKiBAcGFyYW0gY29tcG9uZW50IC0gVGhlIEhhbmRvZmYgY29tcG9uZW50IGRhdGFcbiAqIEBwYXJhbSBkeW5hbWljQXJyYXlDb25maWdzIC0gT3B0aW9uYWwgZHluYW1pYyBhcnJheSBjb25maWd1cmF0aW9ucyBrZXllZCBieSBmaWVsZCBuYW1lXG4gKi9cbmNvbnN0IGdlbmVyYXRlUmVuZGVyUGhwID0gKFxuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsXG4gIGR5bmFtaWNBcnJheUNvbmZpZ3M/OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4sXG4gIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBoYXNPdmVybGF5ID0gY29tcG9uZW50LmNvZGUuaW5jbHVkZXMoJ292ZXJsYXknKTtcblxuICAvLyBPbmx5IHRoZSBpbm5lckJsb2Nrc0ZpZWxkIHJpY2h0ZXh0IHVzZXMgJGNvbnRlbnQgKElubmVyQmxvY2tzKTtcbiAgLy8gb3RoZXIgcmljaHRleHQgZmllbGRzIGFyZSByZW5kZXJlZCBmcm9tIHRoZWlyIHN0cmluZyBhdHRyaWJ1dGVzLlxuICBjb25zdCByaWNodGV4dFByb3BzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGlmIChpbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgcmljaHRleHRQcm9wcy5hZGQoaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgcmljaHRleHRQcm9wcy5hZGQodG9DYW1lbENhc2UoaW5uZXJCbG9ja3NGaWVsZCkpO1xuICB9XG5cbiAgY29uc3QgYXR0cmlidXRlRXh0cmFjdGlvbiA9IGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbihjb21wb25lbnQucHJvcGVydGllcywgaGFzT3ZlcmxheSwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gIGNvbnN0IHRlbXBsYXRlUGhwID0gaGFuZGxlYmFyc1RvUGhwKGNvbXBvbmVudC5jb2RlLCBjb21wb25lbnQucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBkeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gY29kZVxuICBjb25zdCBkeW5hbWljQXJyYXlFeHRyYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBhdHRyTmFtZSwgY29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5hbWljQXJyYXlDb2RlID0gZHluYW1pY0FycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgZm9yIGFsaWdubWVudCBzdXBwb3J0XG4gIGNvbnN0IHdyYXBwZWRUZW1wbGF0ZSA9IHdyYXBXaXRoQmxvY2tXcmFwcGVyKHRlbXBsYXRlUGhwLCBjb21wb25lbnQuaWQpO1xuICBcbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7Y29tcG9uZW50LnRpdGxlfVxuICpcbiAqIEBwYXJhbSBhcnJheSAgICAkYXR0cmlidXRlcyBCbG9jayBhdHRyaWJ1dGVzLlxuICogQHBhcmFtIHN0cmluZyAgICRjb250ZW50ICAgIEJsb2NrIGRlZmF1bHQgY29udGVudC5cbiAqIEBwYXJhbSBXUF9CbG9jayAkYmxvY2sgICAgICBCbG9jayBpbnN0YW5jZS5cbiAqIEByZXR1cm4gc3RyaW5nIFJldHVybnMgdGhlIGJsb2NrIG1hcmt1cC5cbiAqL1xuXG5pZiAoIWRlZmluZWQoJ0FCU1BBVEgnKSkge1xuICBleGl0O1xufVxuXG5pZiAoIWlzc2V0KCRhdHRyaWJ1dGVzKSkge1xuICAkYXR0cmlidXRlcyA9IFtdO1xufVxuXG4vLyBFeHRyYWN0IGF0dHJpYnV0ZXMgd2l0aCBkZWZhdWx0c1xuJHthdHRyaWJ1dGVFeHRyYWN0aW9ufVxuJHtkeW5hbWljQXJyYXlDb2RlfVxuPz5cbiR7d3JhcHBlZFRlbXBsYXRlfVxuYDtcbn07XG5cbmV4cG9ydCB7XG4gIGdlbmVyYXRlUmVuZGVyUGhwLFxuICBoYW5kbGViYXJzVG9QaHAsXG4gIGFycmF5VG9QaHAsXG4gIGdldFBocERlZmF1bHRWYWx1ZSxcbiAgZ2VuZXJhdGVBdHRyaWJ1dGVFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24sXG4gIGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24sXG4gIGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24sXG4gIGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbixcbiAgYnVpbGRSZXNoYXBlUGhwLFxuICBidWlsZFJlc2hhcGVKcyxcbn07XG4iXX0=