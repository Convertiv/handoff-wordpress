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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyLXBocC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3JlbmRlci1waHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0NBQW1PO0FBQ25PLDJEQUFrRDtBQUVsRDs7R0FFRztBQUNILE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBVSxFQUFVLEVBQUU7SUFDeEMsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMxQyxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDekIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxPQUFPLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7YUFDaEMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNkLE9BQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQztJQUN0QixDQUFDO0lBRUQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixPQUFPLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUMzQyxDQUFDO0lB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LENBQUM7aUJBQU0sSUFBSSxJQUFBLHdCQUFnQixFQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLHVCQUF1QixDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3hHLENBQUM7aUJBQU0sSUFBSSxJQUFBLDBCQUFrQixFQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzFHLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzVGLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUNELE1BQU0sZ0JBQWdCLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRTVELDZEQUE2RDtJQUM3RCxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXhFLE9BQU87OytCQUVzQixTQUFTLENBQUMsS0FBSzs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFpQjVDLG1CQUFtQjtFQUNuQixnQkFBZ0I7O0VBRWhCLGVBQWU7Q0FDaEIsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdBLDhDQUFpQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIHJlbmRlci5waHAgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xuICogQ29udmVydHMgSGFuZGxlYmFycyB0ZW1wbGF0ZXMgdG8gUEhQXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgRmllbGRNYXBwaW5nVmFsdWUsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5cbi8qKlxuICogQ29udmVydCBKUyBhcnJheS9vYmplY3QgdG8gUEhQIGFycmF5IHN5bnRheFxuICovXG5jb25zdCBhcnJheVRvUGhwID0gKHZhbHVlOiBhbnkpOiBzdHJpbmcgPT4ge1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiAnbnVsbCc7XG4gIH1cbiAgXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIGNvbnN0IGl0ZW1zID0gdmFsdWUubWFwKHYgPT4gYXJyYXlUb1BocCh2KSkuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske2l0ZW1zfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IHBhaXJzID0gT2JqZWN0LmVudHJpZXModmFsdWUpXG4gICAgICAubWFwKChbaywgdl0pID0+IGAnJHtrfScgPT4gJHthcnJheVRvUGhwKHYpfWApXG4gICAgICAuam9pbignLCAnKTtcbiAgICByZXR1cm4gYFske3BhaXJzfV1gO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBgJyR7dmFsdWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuICB9XG4gIFxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuICB9XG4gIFxuICByZXR1cm4gU3RyaW5nKHZhbHVlKTtcbn07XG5cbi8qKlxuICogR2V0IFBIUCBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5XG4gKi9cbmNvbnN0IGdldFBocERlZmF1bHRWYWx1ZSA9IChwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+IHtcbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6XG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICByZXR1cm4gYCcke1N0cmluZyhwcm9wZXJ0eS5kZWZhdWx0ID8/ICcnKS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBTdHJpbmcocHJvcGVydHkuZGVmYXVsdCA/PyAwKTtcbiAgICBcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBwcm9wZXJ0eS5kZWZhdWx0ID8gJ3RydWUnIDogJ2ZhbHNlJztcbiAgICBcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4gXCJbJ3NyYycgPT4gJycsICdhbHQnID0+ICcnXVwiO1xuICAgIFxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgcmV0dXJuIFwiWydsYWJlbCcgPT4gJycsICd1cmwnID0+ICcnLCAnb3BlbnNJbk5ld1RhYicgPT4gZmFsc2VdXCI7XG4gICAgXG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiBcIlsnbGFiZWwnID0+ICcnLCAnaHJlZicgPT4gJyMnLCAndGFyZ2V0JyA9PiAnJywgJ3JlbCcgPT4gJycsICdkaXNhYmxlZCcgPT4gZmFsc2VdXCI7XG4gICAgXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5kZWZhdWx0KSB7XG4gICAgICAgIHJldHVybiBhcnJheVRvUGhwKHByb3BlcnR5LmRlZmF1bHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuICdbXSc7XG4gICAgXG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgaWYgKHByb3BlcnR5LmRlZmF1bHQgfHwgcHJvcGVydHkuaXRlbXM/LmRlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5VG9QaHAocHJvcGVydHkuZGVmYXVsdCB8fCBwcm9wZXJ0eS5pdGVtcz8uZGVmYXVsdCB8fCBbXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gJ1tdJztcbiAgICBcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiJydcIjtcbiAgfVxufTtcblxuLyoqXG4gKiBDb252ZXJ0IGhhbmRsZWJhcnMgdGVtcGxhdGUgdG8gUEhQXG4gKi9cbmNvbnN0IGhhbmRsZWJhcnNUb1BocCA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCByaWNodGV4dFByb3BzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKSk6IHN0cmluZyA9PiB7XG4gIGxldCBwaHAgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIFJlbW92ZSBIVE1MIHdyYXBwZXIgaWYgcHJlc2VudFxuICBwaHAgPSBwaHAucmVwbGFjZSgvPGh0bWxbXFxzXFxTXSo/PGJvZHlbXj5dKj4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxcXC9ib2R5PltcXHNcXFNdKj88XFwvaHRtbD4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzxoZWFkPltcXHNcXFNdKj88XFwvaGVhZD4vZ2ksICcnKTtcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcez9zdHlsZVxcfVxcfVxcfT8vZywgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFx7P3NjcmlwdFxcfVxcfVxcfT8vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIEhUTUwgY29tbWVudHNcbiAgcGhwID0gcGhwLnJlcGxhY2UoLzwhLS1bXFxzXFxTXSo/LS0+L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSB7eyEtLSBjb21tZW50cyAtLX19XG4gIHBocCA9IHBocC5yZXBsYWNlKC9cXHtcXHshLS1bXFxzXFxTXSo/LS1cXH1cXH0vZywgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7IVtcXHNcXFNdKj9cXH1cXH0vZywgJycpO1xuICBcbiAgLy8gUmVtb3ZlIEhhbmRvZmYtc3BlY2lmaWMge3sjZmllbGR9fSBibG9ja3MgYnV0IGtlZXAgdGhlaXIgY29udGVudFxuICAvLyBVc2UgYSBnbG9iYWwgcmVnZXggdGhhdCBoYW5kbGVzIHZhcmlvdXMgcXVvdGUgc3R5bGVzIGFuZCB3aGl0ZXNwYWNlXG4gIC8vIFJlbW92ZSBIYW5kb2ZmLXNwZWNpZmljIHt7I2ZpZWxkfX0gYmxvY2tzIGJ1dCBrZWVwIHRoZWlyIGNvbnRlbnRcbiAgLy8gQWxsb3cgZm9yIHdoaXRlc3BhY2UgdmFyaWF0aW9ucyBsaWtlIHt7I2ZpZWxkIC4uLn19LCB7eyAjZmllbGQgLi4ufX0sIHt7L2ZpZWxkfX0sIHt7L2ZpZWxkIH19LCB7eyAvZmllbGQgfX1cbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xccyojZmllbGRcXHMrW15cXH1dK1xcfVxcfS9naSwgJycpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFxzKlxcL2ZpZWxkXFxzKlxcfVxcfS9naSwgJycpO1xuICBcbiAgLy8gVkVSWSBFQVJMWTogQ29udmVydCB7eyNpZiAoZXEvbmUgeHh4IFwidmFsdWVcIil9fS4uLnt7ZWxzZX19Li4ue3svaWZ9fSBoZWxwZXIgZXhwcmVzc2lvbnNcbiAgLy8gVGhpcyBNVVNUIHJ1biBiZWZvcmUgYW55IG90aGVyIHByb2Nlc3NpbmcgdG8gZW5zdXJlIHRoZSBjb21wbGV0ZSBibG9jayBpcyBjYXB0dXJlZFxuICAvLyBIZWxwZXIgdG8gY29udmVydCB2YXJpYWJsZSBwYXRoIHRvIFBIUCBmb3IgZWFybHkgaGVscGVyIHByb2Nlc3NpbmdcbiAgY29uc3QgdmFyVG9QaHBWZXJ5RWFybHkgPSAodmFyUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGgucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIHJldHVybiBgJCR7Y2FtZWxQcm9wfVsnJHtwYXJ0cy5zbGljZSgxKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1gO1xuICAgIH0gZWxzZSBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHZhclBhdGgucmVwbGFjZSgndGhpcy4nLCAnJyk7XG4gICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke2ZpZWxkLnNwbGl0KCcuJykuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZH0nXWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvciBsb29wIGFsaWFzZXMgYXQgdGhpcyBlYXJseSBzdGFnZSwgd2UgaGF2ZW4ndCB0cmFja2VkIHRoZW0geWV0XG4gICAgICAvLyBTbyB3ZSBqdXN0IHVzZSAkaXRlbSBmb3IgYW55IGFsaWFzLmZpZWxkIHBhdHRlcm5cbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aH0nXWA7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gUGFyc2UgaGVscGVyIGV4cHJlc3Npb24gdG8gUEhQIGNvbmRpdGlvbiAodmVyeSBlYXJseSlcbiAgY29uc3QgcGFyc2VIZWxwZXJWZXJ5RWFybHkgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBWZXJ5RWFybHkobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICAvLyBNYXRjaCAobmUgbGVmdCBcInJpZ2h0XCIpIC0gbm90IGVxdWFsc1xuICAgIGNvbnN0IG5lTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm5lXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChuZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBuZU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocFZlcnlFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IC4uLiB7e2Vsc2UgaWYgKGVxIC4uLil9fSAuLi4ge3tlbHNlfX0gLi4uIHt7L2lmfX0gVkVSWSBFQVJMWVxuICAvLyBTdXBwb3J0cyBmdWxsIGlmIC8gZWxzZSBpZiAvIGVsc2UgaWYgLyBlbHNlIC8gZW5kaWYgY2hhaW5zIChzdHJpbmcgc3dpdGNoIHBhdHRlcm4pXG4gIHR5cGUgSGVscGVySWZCcmFuY2ggPSB7IGNvbmRpdGlvbjogc3RyaW5nIHwgbnVsbDsgY29udGVudDogc3RyaW5nIH07XG4gIGNvbnN0IGZpbmRIZWxwZXJJZkJyYW5jaGVzID0gKFxuICAgIHN0cjogc3RyaW5nLFxuICAgIHN0YXJ0UG9zOiBudW1iZXIsXG4gICAgZmlyc3RDb25kaXRpb246IHN0cmluZ1xuICApOiB7IGJyYW5jaGVzOiBIZWxwZXJJZkJyYW5jaFtdOyBjbG9zZVBvczogbnVtYmVyIH0gfCBudWxsID0+IHtcbiAgICBjb25zdCBicmFuY2hlczogSGVscGVySWZCcmFuY2hbXSA9IFt7IGNvbmRpdGlvbjogZmlyc3RDb25kaXRpb24sIGNvbnRlbnQ6ICcnIH1dO1xuICAgIGxldCBkZXB0aCA9IDE7XG4gICAgbGV0IHBvcyA9IHN0YXJ0UG9zO1xuICAgIGxldCBjb250ZW50U3RhcnQgPSBzdGFydFBvcztcbiAgICBjb25zdCBlbHNlSWZSZWdleCA9IC9cXHtcXHtlbHNlIGlmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9L2c7XG5cbiAgICB3aGlsZSAocG9zIDwgc3RyLmxlbmd0aCAmJiBkZXB0aCA+IDApIHtcbiAgICAgIGNvbnN0IG5leHRJZiA9IHN0ci5pbmRleE9mKCd7eyNpZicsIHBvcyk7XG4gICAgICBjb25zdCBuZXh0RW5kaWYgPSBzdHIuaW5kZXhPZigne3svaWZ9fScsIHBvcyk7XG4gICAgICBjb25zdCBuZXh0RWxzZSA9IHN0ci5pbmRleE9mKCd7e2Vsc2V9fScsIHBvcyk7XG4gICAgICBlbHNlSWZSZWdleC5sYXN0SW5kZXggPSBwb3M7XG4gICAgICBjb25zdCBlbHNlSWZNYXRjaCA9IGVsc2VJZlJlZ2V4LmV4ZWMoc3RyKTtcbiAgICAgIGNvbnN0IG5leHRFbHNlSWYgPSBlbHNlSWZNYXRjaCA/IGVsc2VJZk1hdGNoLmluZGV4IDogLTE7XG5cbiAgICAgIGNvbnN0IGNhbmRpZGF0ZXM6IHsgdHlwZTogc3RyaW5nOyBwb3M6IG51bWJlcjsgZXhwcj86IHN0cmluZzsgdGFnTGVuPzogbnVtYmVyIH1bXSA9IFtcbiAgICAgICAgeyB0eXBlOiAnaWYnLCBwb3M6IG5leHRJZiB9LFxuICAgICAgICB7IHR5cGU6ICdlbmRpZicsIHBvczogbmV4dEVuZGlmIH0sXG4gICAgICAgIHsgdHlwZTogJ2Vsc2UnLCBwb3M6IG5leHRFbHNlIH0sXG4gICAgICAgIC4uLihuZXh0RWxzZUlmICE9PSAtMSA/IFt7IHR5cGU6ICdlbHNlaWYnLCBwb3M6IG5leHRFbHNlSWYsIGV4cHI6IGVsc2VJZk1hdGNoIVsxXSwgdGFnTGVuOiBlbHNlSWZNYXRjaCFbMF0ubGVuZ3RoIH1dIDogW10pXG4gICAgICBdLmZpbHRlcihjID0+IGMucG9zICE9PSAtMSkuc29ydCgoYSwgYikgPT4gYS5wb3MgLSBiLnBvcyk7XG5cbiAgICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkgYnJlYWs7XG5cbiAgICAgIGNvbnN0IGNsb3Nlc3QgPSBjYW5kaWRhdGVzWzBdO1xuXG4gICAgICBpZiAoY2xvc2VzdC50eXBlID09PSAnaWYnKSB7XG4gICAgICAgIGRlcHRoKys7XG4gICAgICAgIHBvcyA9IGNsb3Nlc3QucG9zICsgNTtcbiAgICAgIH0gZWxzZSBpZiAoY2xvc2VzdC50eXBlID09PSAnZW5kaWYnKSB7XG4gICAgICAgIGRlcHRoLS07XG4gICAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICAgIGJyYW5jaGVzW2JyYW5jaGVzLmxlbmd0aCAtIDFdLmNvbnRlbnQgPSBzdHIuc3Vic3RyaW5nKGNvbnRlbnRTdGFydCwgY2xvc2VzdC5wb3MpO1xuICAgICAgICAgIHJldHVybiB7IGJyYW5jaGVzLCBjbG9zZVBvczogY2xvc2VzdC5wb3MgfTtcbiAgICAgICAgfVxuICAgICAgICBwb3MgPSBjbG9zZXN0LnBvcyArIDg7XG4gICAgICB9IGVsc2UgaWYgKChjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnIHx8IGNsb3Nlc3QudHlwZSA9PT0gJ2Vsc2UnKSAmJiBkZXB0aCA9PT0gMSkge1xuICAgICAgICBjb25zdCB0YWdMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgYnJhbmNoZXNbYnJhbmNoZXMubGVuZ3RoIC0gMV0uY29udGVudCA9IHN0ci5zdWJzdHJpbmcoY29udGVudFN0YXJ0LCBjbG9zZXN0LnBvcyk7XG4gICAgICAgIGJyYW5jaGVzLnB1c2goe1xuICAgICAgICAgIGNvbmRpdGlvbjogY2xvc2VzdC50eXBlID09PSAnZWxzZWlmJyA/IGNsb3Nlc3QuZXhwciEgOiBudWxsLFxuICAgICAgICAgIGNvbnRlbnQ6ICcnXG4gICAgICAgIH0pO1xuICAgICAgICBjb250ZW50U3RhcnQgPSBjbG9zZXN0LnBvcyArIHRhZ0xlbjtcbiAgICAgICAgcG9zID0gY29udGVudFN0YXJ0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU2tpcCBmdWxsIHRhZyB3aGVuIGluc2lkZSBuZXN0ZWQgI2lmIChlLmcuIHNraXAge3tlbHNlIGlmIChleHByKX19IHNvIHdlIGZpbmQgdGhlIG91dGVyIHt7L2lmfX0pXG4gICAgICAgIGNvbnN0IHNraXBMZW4gPSBjbG9zZXN0LnR5cGUgPT09ICdlbHNlaWYnID8gKGNsb3Nlc3QudGFnTGVuID8/IDApIDogODtcbiAgICAgICAgcG9zID0gY2xvc2VzdC5wb3MgKyBza2lwTGVuO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICBjb25zdCBoZWxwZXJJZlJlZ2V4ID0gL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuICBsZXQgaGVscGVyTWF0Y2g7XG4gIHdoaWxlICgoaGVscGVyTWF0Y2ggPSBoZWxwZXJJZlJlZ2V4LmV4ZWMocGhwKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBvcGVuUG9zID0gaGVscGVyTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IG9wZW5Qb3MgKyBoZWxwZXJNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgZmlyc3RDb25kaXRpb24gPSBoZWxwZXJNYXRjaFsxXTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGZpbmRIZWxwZXJJZkJyYW5jaGVzKHBocCwgb3BlblRhZ0VuZCwgZmlyc3RDb25kaXRpb24pO1xuICAgIGlmIChyZXN1bHQgPT09IG51bGwpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHsgYnJhbmNoZXMsIGNsb3NlUG9zIH0gPSByZXN1bHQ7XG5cbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJyYW5jaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBicmFuY2ggPSBicmFuY2hlc1tpXTtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IGJyYW5jaC5jb25kaXRpb24gPyBwYXJzZUhlbHBlclZlcnlFYXJseShicmFuY2guY29uZGl0aW9uKSA6IG51bGw7XG4gICAgICBjb25zdCBjb25kID0gcGhwQ29uZGl0aW9uID8/ICdmYWxzZSc7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICBwYXJ0cy5wdXNoKGA8P3BocCBpZiAoJHtjb25kfSkgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9IGVsc2UgaWYgKGJyYW5jaC5jb25kaXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgcGFydHMucHVzaChgPD9waHAgZWxzZWlmICgke2NvbmR9KSA6ID8+JHticmFuY2guY29udGVudH1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhcnRzLnB1c2goYDw/cGhwIGVsc2UgOiA/PiR7YnJhbmNoLmNvbnRlbnR9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIHBhcnRzLnB1c2goJzw/cGhwIGVuZGlmOyA/PicpO1xuICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcGFydHMuam9pbignJyk7XG5cbiAgICBwaHAgPSBwaHAuc3Vic3RyaW5nKDAsIG9wZW5Qb3MpICsgcmVwbGFjZW1lbnQgKyBwaHAuc3Vic3RyaW5nKGNsb3NlUG9zICsgOCk7IC8vIDggPSBcInt7L2lmfX1cIlxuICAgIC8vIE5leHQgZXhlYyBmcm9tIHN0YXJ0IG9mIHJlcGxhY2VtZW50IHNvIHdlIGNhdGNoIG5lc3RlZCB7eyNpZn19Li4ue3tlbHNlIGlmfX0uLi57ey9pZn19IGluc2lkZSBpdFxuICAgIGhlbHBlcklmUmVnZXgubGFzdEluZGV4ID0gb3BlblBvcztcbiAgfVxuICBcbiAgLy8gQ29udmVydCBzdHlsZSB3aXRoIGhhbmRsZWJhcnMgZXhwcmVzc2lvbnNcbiAgLy8gS2VlcCAnc3JjJyBhcy1pcyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zdHlsZT1cImJhY2tncm91bmQtaW1hZ2U6dXJsXFwoJz9cXHtcXHsrXFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9K1xcfSc/XFwpXCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICFlbXB0eSgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddKSA/ICdzdHlsZT1cImJhY2tncm91bmQtaW1hZ2U6dXJsKFxcXFwnJyAuIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSkgLiAnXFxcXCcpXCInIDogJyc7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGlubGluZSBzdHlsZSB3aXRoIG9wYWNpdHlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL3N0eWxlPVwib3BhY2l0eTpcXHMqXFwuP1xcZCtcIi9nLFxuICAgICdzdHlsZT1cIm9wYWNpdHk6IDw/cGhwIGVjaG8gZXNjX2F0dHIoJG92ZXJsYXlPcGFjaXR5KTsgPz5cIidcbiAgKTtcbiAgXG4gIC8vIFRyYWNrIGxvb3AgYWxpYXNlcyBmb3IgbGF0ZXIgcmVmZXJlbmNlIGNvbnZlcnNpb25cbiAgLy8gRm9ybWF0OiB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhc05hbWV8fX1cbiAgY29uc3QgbG9vcEFsaWFzZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgXG4gIC8vIFRyYWNrIG5lc3RlZCBsb29wIGFsaWFzZXMgc2VwYXJhdGVseSAodGhlc2UgdXNlICRzdWJJdGVtIGluc3RlYWQgb2YgJGl0ZW0pXG4gIGNvbnN0IG5lc3RlZExvb3BBbGlhc2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIFxuICAvLyBUcmFjayBuZXN0ZWQgbG9vcCBkZXB0aCBmb3IgcHJvcGVyIHZhcmlhYmxlIG5hbWluZ1xuICBsZXQgbmVzdGVkTG9vcERlcHRoID0gMDtcbiAgXG4gIC8vIEhlbHBlciB0byBnZXQgdGhlIGxvb3AgaXRlbSB2YXJpYWJsZSBuYW1lIGJhc2VkIG9uIGRlcHRoXG4gIGNvbnN0IGdldExvb3BJdGVtVmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckaXRlbSc7XG4gICAgaWYgKGRlcHRoID09PSAxKSByZXR1cm4gJyRzdWJJdGVtJztcbiAgICByZXR1cm4gYCRuZXN0ZWQke2RlcHRofUl0ZW1gO1xuICB9O1xuICBcbiAgY29uc3QgZ2V0TG9vcEluZGV4VmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckaW5kZXgnO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckc3ViSW5kZXgnO1xuICAgIHJldHVybiBgJG5lc3RlZCR7ZGVwdGh9SW5kZXhgO1xuICB9O1xuICBcbiAgY29uc3QgZ2V0TG9vcENvdW50VmFyID0gKGRlcHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChkZXB0aCA9PT0gMCkgcmV0dXJuICckX2xvb3BfY291bnQnO1xuICAgIGlmIChkZXB0aCA9PT0gMSkgcmV0dXJuICckX25lc3RlZF9sb29wX2NvdW50JztcbiAgICByZXR1cm4gYCRfbmVzdGVkJHtkZXB0aH1fbG9vcF9jb3VudGA7XG4gIH07XG4gIFxuICAvLyBGaXJzdCBwYXNzOiBpZGVudGlmeSBhbGwgbmVzdGVkIGxvb3AgcGF0dGVybnMgYW5kIHRoZWlyIGFsaWFzZXNcbiAgLy8gV2UgbmVlZCB0byBwcm9jZXNzIGxvb3BzIGluIG9yZGVyIHRvIHByb3Blcmx5IHRyYWNrIG5lc3RpbmdcbiAgY29uc3QgZWFjaFBhdHRlcm5zOiBBcnJheTx7XG4gICAgbWF0Y2g6IHN0cmluZztcbiAgICB0eXBlOiAncHJvcGVydGllcycgfCAndGhpcycgfCAnYWxpYXMnO1xuICAgIGFycmF5UGF0aDogc3RyaW5nO1xuICAgIGFsaWFzPzogc3RyaW5nO1xuICAgIHBhcmVudEFsaWFzPzogc3RyaW5nO1xuICAgIGluZGV4OiBudW1iZXI7XG4gIH0+ID0gW107XG4gIFxuICAvLyBGaW5kIGFsbCB7eyNlYWNoIC4uLn19IHBhdHRlcm5zXG4gIGNvbnN0IGVhY2hSZWdleCA9IC9cXHtcXHsjZWFjaFxccysoW15cXH1dKylcXH1cXH0vZztcbiAgbGV0IGVhY2hNYXRjaDtcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBlYWNoTWF0Y2hbMV0udHJpbSgpO1xuICAgIGxldCB0eXBlOiAncHJvcGVydGllcycgfCAndGhpcycgfCAnYWxpYXMnO1xuICAgIGxldCBhcnJheVBhdGg6IHN0cmluZztcbiAgICBsZXQgYWxpYXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgcGFyZW50QWxpYXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgXCJhcyB8YWxpYXN8XCIgc3ludGF4XG4gICAgY29uc3QgYXNBbGlhc01hdGNoID0gY29udGVudC5tYXRjaCgvXiguKz8pXFxzK2FzXFxzK1xcfChcXHcrKVxcfCQvKTtcbiAgICBpZiAoYXNBbGlhc01hdGNoKSB7XG4gICAgICBjb25zdCBwYXRoUGFydCA9IGFzQWxpYXNNYXRjaFsxXS50cmltKCk7XG4gICAgICBhbGlhcyA9IGFzQWxpYXNNYXRjaFsyXTtcbiAgICAgIFxuICAgICAgaWYgKHBhdGhQYXJ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICdwcm9wZXJ0aWVzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJyk7XG4gICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgdHlwZSA9ICd0aGlzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQucmVwbGFjZSgndGhpcy4nLCAnJyk7XG4gICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgLy8gZS5nLiwgYXJ0aWNsZS50YWdzIC0gZmlyc3QgcGFydCBpcyBhbiBhbGlhcyBmcm9tIG91dGVyIGxvb3BcbiAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoUGFydC5zcGxpdCgnLicpO1xuICAgICAgICBwYXJlbnRBbGlhcyA9IHBhcnRzWzBdO1xuICAgICAgICBhcnJheVBhdGggPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJyk7XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSnVzdCBhIHZhcmlhYmxlIG5hbWUsIHRyZWF0IGFzIGFsaWFzIHJlZmVyZW5jZVxuICAgICAgICB0eXBlID0gJ2FsaWFzJztcbiAgICAgICAgYXJyYXlQYXRoID0gcGF0aFBhcnQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE5vIGFsaWFzIHN5bnRheFxuICAgICAgaWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICB0eXBlID0gJ3Byb3BlcnRpZXMnO1xuICAgICAgICBhcnJheVBhdGggPSBjb250ZW50LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KC9cXHMvKVswXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIHR5cGUgPSAndGhpcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IGNvbnRlbnQucmVwbGFjZSgndGhpcy4nLCAnJykuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgfSBlbHNlIGlmIChjb250ZW50LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBjb250ZW50LnNwbGl0KCcuJyk7XG4gICAgICAgIHBhcmVudEFsaWFzID0gcGFydHNbMF07XG4gICAgICAgIGFycmF5UGF0aCA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKS5zcGxpdCgvXFxzLylbMF07XG4gICAgICAgIHR5cGUgPSAnYWxpYXMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwZSA9ICdhbGlhcyc7XG4gICAgICAgIGFycmF5UGF0aCA9IGNvbnRlbnQuc3BsaXQoL1xccy8pWzBdO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBlYWNoUGF0dGVybnMucHVzaCh7XG4gICAgICBtYXRjaDogZWFjaE1hdGNoWzBdLFxuICAgICAgdHlwZSxcbiAgICAgIGFycmF5UGF0aCxcbiAgICAgIGFsaWFzLFxuICAgICAgcGFyZW50QWxpYXMsXG4gICAgICBpbmRleDogZWFjaE1hdGNoLmluZGV4XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRyYWNrIHdoaWNoIGFsaWFzZXMgbWFwIHRvIHdoaWNoIG5lc3RlZCBkZXB0aFxuICBjb25zdCBhbGlhc1RvRGVwdGg6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgXG4gIC8vIFByb2Nlc3MgbG9vcHMgZnJvbSBmaXJzdCB0byBsYXN0IChtYWludGFpbmluZyBvcmRlcilcbiAgLy8gU29ydCBieSBpbmRleCB0byBwcm9jZXNzIGluIG9yZGVyXG4gIGVhY2hQYXR0ZXJucy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG4gIFxuICAvLyBUcmFjayBjdXJyZW50IG5lc3RpbmcgbGV2ZWwgYXMgd2UgcHJvY2Vzc1xuICBsZXQgY3VycmVudERlcHRoID0gLTE7XG4gIGNvbnN0IG9wZW5Mb29wczogQXJyYXk8eyBkZXB0aDogbnVtYmVyOyBhbGlhcz86IHN0cmluZyB9PiA9IFtdO1xuICBcbiAgLy8gRmluZCB7ey9lYWNofX0gcG9zaXRpb25zXG4gIGNvbnN0IGNsb3NlRWFjaFBvc2l0aW9uczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgY2xvc2VFYWNoUmVnZXggPSAvXFx7XFx7XFwvZWFjaFxcfVxcfS9nO1xuICBsZXQgY2xvc2VNYXRjaDtcbiAgd2hpbGUgKChjbG9zZU1hdGNoID0gY2xvc2VFYWNoUmVnZXguZXhlYyhwaHApKSAhPT0gbnVsbCkge1xuICAgIGNsb3NlRWFjaFBvc2l0aW9ucy5wdXNoKGNsb3NlTWF0Y2guaW5kZXgpO1xuICB9XG4gIFxuICAvLyBBc3NpZ24gZGVwdGggdG8gZWFjaCBwYXR0ZXJuIGJhc2VkIG9uIHBvc2l0aW9uIHJlbGF0aXZlIHRvIG90aGVyIHBhdHRlcm5zIGFuZCBjbG9zZXNcbiAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIGVhY2hQYXR0ZXJucykge1xuICAgIC8vIENvdW50IGhvdyBtYW55IG9wZW5zIGJlZm9yZSB0aGlzIHBvc2l0aW9uXG4gICAgY29uc3Qgb3BlbnNCZWZvcmUgPSBlYWNoUGF0dGVybnMuZmlsdGVyKHAgPT4gcC5pbmRleCA8IHBhdHRlcm4uaW5kZXgpLmxlbmd0aDtcbiAgICAvLyBDb3VudCBob3cgbWFueSBjbG9zZXMgYmVmb3JlIHRoaXMgcG9zaXRpb25cbiAgICBjb25zdCBjbG9zZXNCZWZvcmUgPSBjbG9zZUVhY2hQb3NpdGlvbnMuZmlsdGVyKHBvcyA9PiBwb3MgPCBwYXR0ZXJuLmluZGV4KS5sZW5ndGg7XG4gICAgY29uc3QgZGVwdGggPSBvcGVuc0JlZm9yZSAtIGNsb3Nlc0JlZm9yZTtcbiAgICBcbiAgICBpZiAocGF0dGVybi5hbGlhcykge1xuICAgICAgYWxpYXNUb0RlcHRoW3BhdHRlcm4uYWxpYXNdID0gZGVwdGg7XG4gICAgICBsb29wQWxpYXNlc1twYXR0ZXJuLmFsaWFzXSA9IHBhdHRlcm4uYXJyYXlQYXRoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgYSBwcm9wZXJ0eSBwYXRoIGxpa2UgXCJqdW1wTmF2LmxpbmtzXCIgdG8gUEhQIHZhcmlhYmxlIGFjY2VzcyBsaWtlIFwiJGp1bXBOYXZbJ2xpbmtzJ11cIlxuICBjb25zdCBwcm9wUGF0aFRvUGhwID0gKHByb3BQYXRoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgICBjb25zdCBjYW1lbEZpcnN0ID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHJldHVybiBgJCR7Y2FtZWxGaXJzdH1gO1xuICAgIH1cbiAgICAvLyBGb3IgbmVzdGVkIHBhdGhzIGxpa2UganVtcE5hdi5saW5rcyAtPiAkanVtcE5hdlsnbGlua3MnXVxuICAgIGNvbnN0IG5lc3RlZFBhdGggPSBwYXJ0cy5zbGljZSgxKS5tYXAocCA9PiBgJyR7cH0nYCkuam9pbignXVsnKTtcbiAgICByZXR1cm4gYCQke2NhbWVsRmlyc3R9WyR7bmVzdGVkUGF0aH1dYDtcbiAgfTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eC55eXkgYXMgfGFsaWFzfH19IG9yIHt7I2VhY2ggcHJvcGVydGllcy54eHggYXMgfGFsaWFzIGluZGV4fH19IGxvb3BzIHdpdGggbmFtZWQgYWxpYXNcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIC8vIFRoZSBzZWNvbmQgcGFyYW1ldGVyIChpbmRleCkgaXMgb3B0aW9uYWwgYW5kIGlnbm9yZWQgc2luY2Ugd2UgdXNlICRpbmRleCBpbiBQSFBcbiAgLy8gQWxzbyBzZXQgJF9sb29wX2NvdW50IGZvciBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccythc1xccytcXHwoXFx3KykoPzpcXHMrXFx3Kyk/XFx8XFxzKlxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCwgYWxpYXMpID0+IHtcbiAgICAgIGNvbnN0IHBocFZhciA9IHByb3BQYXRoVG9QaHAocHJvcFBhdGgpO1xuICAgICAgbG9vcEFsaWFzZXNbYWxpYXNdID0gcHJvcFBhdGg7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJHtwaHBWYXJ9KSAmJiBpc19hcnJheSgke3BocFZhcn0pKSA6ICRfbG9vcF9jb3VudCA9IGNvdW50KCR7cGhwVmFyfSk7IGZvcmVhY2ggKCR7cGhwVmFyfSBhcyAkaW5kZXggPT4gJGl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBwcm9wZXJ0aWVzLnh4eH19IG9yIHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5fX0gbG9vcHMgd2l0aG91dCBhbGlhc1xuICAvLyBOb3cgaGFuZGxlcyBuZXN0ZWQgcGF0aHMgbGlrZSBwcm9wZXJ0aWVzLmp1bXBOYXYubGlua3NcbiAgLy8gQWxzbyBzZXQgJF9sb29wX2NvdW50IGZvciBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBocFZhciA9IHByb3BQYXRoVG9QaHAocHJvcFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCR7cGhwVmFyfSkgJiYgaXNfYXJyYXkoJHtwaHBWYXJ9KSkgOiAkX2xvb3BfY291bnQgPSBjb3VudCgke3BocFZhcn0pOyBmb3JlYWNoICgke3BocFZhcn0gYXMgJGluZGV4ID0+ICRpdGVtKSA6ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2VhY2ggdGhpcy54eHggYXMgfGFsaWFzfH19IG9yIHt7I2VhY2ggdGhpcy54eHggYXMgfGFsaWFzIGluZGV4fH19IG5lc3RlZCBsb29wcyB3aXRoIGFsaWFzXG4gIC8vIFRoZSBzZWNvbmQgcGFyYW1ldGVyIChpbmRleCkgaXMgb3B0aW9uYWwgYW5kIGlnbm9yZWQgc2luY2Ugd2UgdXNlICRzdWJJbmRleCBpbiBQSFBcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNlYWNoXFxzK3RoaXNcXC4oXFx3KylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcCwgYWxpYXMpID0+IHtcbiAgICAgIG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA9IHByb3A7XG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7cHJvcH0nXSkgJiYgaXNfYXJyYXkoJGl0ZW1bJyR7cHJvcH0nXSkpIDogJF9uZXN0ZWRfbG9vcF9jb3VudCA9IGNvdW50KCRpdGVtWycke3Byb3B9J10pOyBmb3JlYWNoICgkaXRlbVsnJHtwcm9wfSddIGFzICRzdWJJbmRleCA9PiAkc3ViSXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNlYWNoIHRoaXMueHh4fX0gbmVzdGVkIGxvb3BzIHdpdGhvdXQgYWxpYXNcbiAgLy8gVXNlICRfbmVzdGVkX2xvb3BfY291bnQgZm9yIG5lc3RlZCBAbGFzdCBjaGVja2luZ1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2VhY2hcXHMrdGhpc1xcLihcXHcrKVxccypcXH1cXH0vZyxcbiAgICAoXywgcHJvcCkgPT4ge1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBhbGlhcy54eHggYXMgfG5lc3RlZEFsaWFzfH19IG9yIHt7I2VhY2ggYWxpYXMueHh4IGFzIHxuZXN0ZWRBbGlhcyBpbmRleHx9fSAtIG5lc3RlZCBsb29wcyByZWZlcmVuY2luZyBvdXRlciBsb29wIGFsaWFzXG4gIC8vIGUuZy4sIHt7I2VhY2ggYXJ0aWNsZS50YWdzIGFzIHx0YWd8fX0gd2hlcmUgJ2FydGljbGUnIGlzIGZyb20gb3V0ZXIge3sjZWFjaCBhcnRpY2xlcyBhcyB8YXJ0aWNsZXx9fVxuICAvLyBUaGUgc2Vjb25kIHBhcmFtZXRlciAoaW5kZXgpIGlzIG9wdGlvbmFsIGFuZCBpZ25vcmVkIHNpbmNlIHdlIHVzZSAkc3ViSW5kZXggaW4gUEhQXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccysoXFx3KylcXC4oXFx3KylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZyxcbiAgICAobWF0Y2gsIHBhcmVudEFsaWFzLCBwcm9wLCBuZXN0ZWRBbGlhcykgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCdzIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAocGFyZW50QWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBwYXJlbnRBbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFRoaXMgaXMgYSBuZXN0ZWQgbG9vcCByZWZlcmVuY2luZyBhbiBvdXRlciBsb29wIGFsaWFzXG4gICAgICBuZXN0ZWRMb29wQWxpYXNlc1tuZXN0ZWRBbGlhc10gPSBwcm9wO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtWycke3Byb3B9J10pICYmIGlzX2FycmF5KCRpdGVtWycke3Byb3B9J10pKSA6ICRfbmVzdGVkX2xvb3BfY291bnQgPSBjb3VudCgkaXRlbVsnJHtwcm9wfSddKTsgZm9yZWFjaCAoJGl0ZW1bJyR7cHJvcH0nXSBhcyAkc3ViSW5kZXggPT4gJHN1Ykl0ZW0pIDogPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjZWFjaCBhbGlhcy54eHh9fSAtIG5lc3RlZCBsb29wcyByZWZlcmVuY2luZyBvdXRlciBsb29wIGFsaWFzIHdpdGhvdXQgbmVzdGVkIGFsaWFzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjZWFjaFxccysoXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBwYXJlbnRBbGlhcywgcHJvcCkgPT4ge1xuICAgICAgLy8gU2tpcCBpZiBpdCdzIHByb3BlcnRpZXMueHh4IG9yIHRoaXMueHh4IChhbHJlYWR5IGhhbmRsZWQpXG4gICAgICBpZiAocGFyZW50QWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBwYXJlbnRBbGlhcyA9PT0gJ3RoaXMnKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFRoaXMgaXMgYSBuZXN0ZWQgbG9vcCByZWZlcmVuY2luZyBhbiBvdXRlciBsb29wIGFsaWFzXG4gICAgICByZXR1cm4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7cHJvcH0nXSkgJiYgaXNfYXJyYXkoJGl0ZW1bJyR7cHJvcH0nXSkpIDogJF9uZXN0ZWRfbG9vcF9jb3VudCA9IGNvdW50KCRpdGVtWycke3Byb3B9J10pOyBmb3JlYWNoICgkaXRlbVsnJHtwcm9wfSddIGFzICRzdWJJbmRleCA9PiAkc3ViSXRlbSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL2VhY2hcXH1cXH0vZywgJzw/cGhwIGVuZGZvcmVhY2g7IGVuZGlmOyA/PicpO1xuICBcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgaGVscGVyIGV4cHJlc3Npb24gY29uZGl0aW9uYWxzIEVBUkxZIChiZWZvcmUgYWxpYXMgcGF0dGVybnMgY29udmVydCBwYXJ0cyBvZiB0aGVtKVxuICAvLyBUaGlzIGhhbmRsZXMge3sjaWYgKGVxIGFsaWFzLnh4eCBcInZhbHVlXCIpfX0uLi57e2Vsc2V9fS4uLnt7L2lmfX0gcGF0dGVybnMgaW5zaWRlIGxvb3BzXG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBhIHZhcmlhYmxlIHBhdGggdG8gUEhQIGV4cHJlc3Npb24gZm9yIGhlbHBlciBjb21wYXJpc29uc1xuICAvLyBIYW5kbGVzIHByb3BlcnRpZXMueHh4LCB0aGlzLnh4eCwgYW5kIGFsaWFzLnh4eCBwYXR0ZXJuc1xuICBjb25zdCB2YXJUb1BocEVhcmx5ID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSB2YXJQYXRoLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1bJyR7cGFydHMuc2xpY2UoMSkuam9pbihcIiddWydcIil9J11gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9YDtcbiAgICB9IGVsc2UgaWYgKHZhclBhdGguc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGR9J11gO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBpcyBhIGtub3duIGxvb3AgYWxpYXNcbiAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgaWYgKG5lc3RlZExvb3BBbGlhc2VzW3BhcnRzWzBdXSkge1xuICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICBpZiAobG9vcEFsaWFzZXNbcGFydHNbMF1dKSB7XG4gICAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZFBhdGguam9pbihcIiddWydcIil9J11gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBGYWxsYmFja1xuICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGguc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIFBhcnNlIGhlbHBlciBleHByZXNzaW9uIHRvIFBIUCBjb25kaXRpb25cbiAgY29uc3QgcGFyc2VIZWxwZXJFYXJseSA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCBcInJpZ2h0XCIpIC0gZXF1YWxzIHdpdGggcXVvdGVkIHN0cmluZ1xuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgY29uc3QgbGVmdEV4cHIgPSB2YXJUb1BocEVhcmx5KGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gJycpID09PSAnJHtyaWdodH0nYDtcbiAgICB9XG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHBFYXJseShsZWZ0KTtcbiAgICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9ID8/ICcnKSAhPT0gJyR7cmlnaHR9J2A7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUgLi4uKX19IGhlbHBlciBleHByZXNzaW9ucyB3aXRoIGlmL2Vsc2UgRUFSTFlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQsIGVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVsc2UgOiA/PiR7ZWxzZUNvbnRlbnR9PD9waHAgZW5kaWY7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7I2lmIChlcS9uZSAuLi4pfX0gaGVscGVyIGV4cHJlc3Npb25zIHdpdGhvdXQgZWxzZSBFQVJMWVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBwaHBDb25kaXRpb24gPSBwYXJzZUhlbHBlckVhcmx5KGhlbHBlckV4cHIpO1xuICAgICAgaWYgKHBocENvbmRpdGlvbikge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGlmICgke3BocENvbmRpdGlvbn0pIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIElNUE9SVEFOVDogSGFuZGxlIGF0dHJpYnV0ZS1zcGVjaWZpYyBwYXR0ZXJucyBGSVJTVCBiZWZvcmUgZ2VuZXJpYyBvbmVzXG4gIC8vIEhhbmRsZSBwcm9wZXJ0aWVzLnh4eC55eXkgcGF0dGVybnMgRklSU1QsIHRoZW4gYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzXG4gIFxuICAvLyBDb252ZXJ0IHNyYz1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJucyAodG9wLWxldmVsIG5lc3RlZCBwcm9wZXJ0aWVzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvc3JjPVwiXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9XCIvZyxcbiAgICAoXywgcHJvcCwgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBzcmM9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3twcm9wZXJ0aWVzLnh4eC55eXl9fVwiIHBhdHRlcm5zXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9hbHQ9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGFsdD1cIjw/cGhwIGVjaG8gZXNjX2F0dHIoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3AsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgIHJldHVybiBgaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkJHtjYW1lbFByb3B9Wycke2ZpZWxkfSddID8/ICcjJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIE5vdyBoYW5kbGUgYWxpYXMgcGF0dGVybnMgZm9yIGxvb3BzOiBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBhbHQ9XCJ7e2FsaWFzLnh4eC55eXl9fVwiLCBocmVmPVwie3thbGlhcy54eHgueXl5fX1cIlxuICBcbiAgLy8gQ29udmVydCBzcmM9XCJ7e2FsaWFzLnh4eC55eXl9fVwiIHBhdHRlcm5zIChpbWFnZXMgaW4gbG9vcHMpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9zcmM9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBjb252ZXJ0ZWQgb3IgaWYgaXQncyBhIHByb3BlcnRpZXMgcGF0dGVyblxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJyB8fCBtYXRjaC5pbmNsdWRlcygnPD9waHAnKSkge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgc3JjPVwiPD9waHAgZWNobyBlc2NfdXJsKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgYWx0PVwie3thbGlhcy54eHgueXl5fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvYWx0PVwiXFx7XFx7XFxzKihcXHcrKVxcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkMSwgZmllbGQyKSA9PiB7XG4gICAgICBpZiAoYWxpYXMgPT09ICdwcm9wZXJ0aWVzJyB8fCBhbGlhcyA9PT0gJ3RoaXMnIHx8IG1hdGNoLmluY2x1ZGVzKCc8P3BocCcpKSB7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSAkc3ViSXRlbSBmb3IgbmVzdGVkIGxvb3AgYWxpYXNlcywgJGl0ZW0gZm9yIHRvcC1sZXZlbFxuICAgICAgY29uc3QgaXRlbVZhciA9IG5lc3RlZExvb3BBbGlhc2VzW2FsaWFzXSA/ICckc3ViSXRlbScgOiAnJGl0ZW0nO1xuICAgICAgcmV0dXJuIGBhbHQ9XCI8P3BocCBlY2hvIGVzY19hdHRyKCR7aXRlbVZhcn1bJyR7ZmllbGQxfSddWycke2ZpZWxkMn0nXSA/PyAnJyk7ID8+XCJgO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7YWxpYXMueHh4Lnl5eX19XCIgcGF0dGVybnMgKGxpbmtzIGluIGxvb3BzIHdpdGggbmVzdGVkIGZpZWxkcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQxLCBmaWVsZDIpID0+IHtcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycgfHwgbWF0Y2guaW5jbHVkZXMoJzw/cGhwJykpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJHtpdGVtVmFyfVsnJHtmaWVsZDF9J11bJyR7ZmllbGQyfSddID8/ICcnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e2FsaWFzLmZpZWxkLnN1YmZpZWxkfX0gYW5kIHt7YWxpYXMuZmllbGR9fSByZWZlcmVuY2VzIGZyb20gbmFtZWQgbG9vcCB2YXJpYWJsZXNcbiAgLy8gTXVzdCBoYW5kbGUgZGVlcGVyIG5lc3RpbmcgZmlyc3QgKGFsaWFzLmZpZWxkLnN1YmZpZWxkIGJlZm9yZSBhbGlhcy5maWVsZClcbiAgLy8gSU1QT1JUQU5UOiBIYW5kbGUgdHJpcGxlLWJyYWNlIChyaWNoIHRleHQpIEJFRk9SRSBkb3VibGUtYnJhY2UgcGF0dGVybnNcbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGEgZmllbGQgcGF0aCB0byBQSFAgYXJyYXkgYWNjZXNzXG4gIC8vIGUuZy4sIFwiY3RhLmxpbmtcIiAtPiBcIlsnY3RhJ11bJ2xpbmsnXVwiXG4gIGNvbnN0IGZpZWxkUGF0aFRvUGhwQWNjZXNzID0gKGZpZWxkUGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgIHJldHVybiBwYXJ0cy5tYXAocCA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgfTtcbiAgXG4gIC8vIFByb2Nlc3MgbmVzdGVkIGxvb3AgYWxpYXNlcyBGSVJTVCAodGhleSB1c2UgJHN1Ykl0ZW0pXG4gIGZvciAoY29uc3QgW2FsaWFzXSBvZiBPYmplY3QuZW50cmllcyhuZXN0ZWRMb29wQWxpYXNlcykpIHtcbiAgICAvLyBIYW5kbGUge3t7IGFsaWFzLmZpZWxkIH19fSB0cmlwbGUtYnJhY2UgcGF0dGVybnMgKHJpY2ggdGV4dC9IVE1MIGluIG5lc3RlZCBsb29wcylcbiAgICBjb25zdCBhbGlhc1RyaXBsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc1RyaXBsZVJlZ2V4LCAoXywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHN1Ykl0ZW1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7I2lmIGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRocyBpbiBuZXN0ZWQgbG9vcHNcbiAgICAvLyBlLmcuLCB7eyNpZiB0YWcuY3RhLmxpbmt9fSAtPiA8P3BocCBpZiAoIWVtcHR5KCRzdWJJdGVtWydjdGEnXVsnbGluayddKSkgOiA/PlxuICAgIGNvbnN0IGFsaWFzSWZEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2lmXFxcXHMrJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNJZkRlZXBSZWdleCwgKF8sIGZpZWxkUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkc3ViSXRlbSR7cGhwQWNjZXNzfSkpIDogPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLiB9fSBwYXR0ZXJucyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHMgaW4gbmVzdGVkIGxvb3BzXG4gICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc31cXFxcLihbXFxcXHcuXSspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsIChfLCBmaWVsZFBhdGgpID0+IHtcbiAgICAgIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZXNjRnVuYyA9IGxhc3RQYXJ0ID09PSAndXJsJyB8fCBsYXN0UGFydCA9PT0gJ3NyYycgfHwgbGFzdFBhcnQgPT09ICdocmVmJyA/ICdlc2NfdXJsJyA6ICdlc2NfaHRtbCc7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvICR7ZXNjRnVuY30oJHN1Ykl0ZW0ke3BocEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFRoZW4gcHJvY2VzcyB0b3AtbGV2ZWwgbG9vcCBhbGlhc2VzICh0aGV5IHVzZSAkaXRlbSlcbiAgZm9yIChjb25zdCBbYWxpYXNdIG9mIE9iamVjdC5lbnRyaWVzKGxvb3BBbGlhc2VzKSkge1xuICAgIC8vIEhhbmRsZSB7e3sgYWxpYXMuZmllbGQgfX19IHRyaXBsZS1icmFjZSBwYXR0ZXJucyAocmljaCB0ZXh0L0hUTUwgaW4gbG9vcHMpXG4gICAgY29uc3QgYWxpYXNUcmlwbGVSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1cXFxcfWAsICdnJyk7XG4gICAgcGhwID0gcGhwLnJlcGxhY2UoYWxpYXNUcmlwbGVSZWdleCwgKF8sIGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEhhbmRsZSB7eyNpZiBhbGlhcy5maWVsZC5zdWJmaWVsZC4uLn19IGNvbmRpdGlvbmFscyB3aXRoIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgICAvLyBlLmcuLCB7eyNpZiBzbGlkZS5jdGEubGlua319IC0+IDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJ2N0YSddWydsaW5rJ10pKSA6ID8+XG4gICAgY29uc3QgYWxpYXNJZkRlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzfVxcXFwuKFtcXFxcdy5dKylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICBwaHAgPSBwaHAucmVwbGFjZShhbGlhc0lmRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwaHBBY2Nlc3MgPSBmaWVsZFBhdGhUb1BocEFjY2VzcyhmaWVsZFBhdGgpO1xuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoIWVtcHR5KCRpdGVtJHtwaHBBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gSGFuZGxlIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkLi4uIH19IHBhdHRlcm5zIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgIGNvbnN0IGFsaWFzRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXN9XFxcXC4oW1xcXFx3Ll0rKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgIHBocCA9IHBocC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAoXywgZmllbGRQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGZpZWxkUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBsYXN0UGFydCA9PT0gJ3VybCcgfHwgbGFzdFBhcnQgPT09ICdzcmMnIHx8IGxhc3RQYXJ0ID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgY29uc3QgcGhwQWNjZXNzID0gZmllbGRQYXRoVG9QaHBBY2Nlc3MoZmllbGRQYXRoKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCRpdGVtJHtwaHBBY2Nlc3N9ID8/ICcnKTsgPz5gO1xuICAgIH0pO1xuICB9XG4gIFxuICAvLyBDb252ZXJ0IHt7I3VubGVzcyBAZmlyc3R9fSAtIHNob3cgY29udGVudCBmb3IgYWxsIGl0ZW1zIGV4Y2VwdCB0aGUgZmlyc3RcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFxzKlxcfVxcfS9nLFxuICAgIGA8P3BocCBpZiAoJGluZGV4ID4gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjdW5sZXNzIEBsYXN0fX0gLSBzaG93IGNvbnRlbnQgZm9yIGFsbCBpdGVtcyBleGNlcHQgdGhlIGxhc3RcbiAgLy8gVXNlcyAkX2xvb3BfY291bnQgc2V0IGluIHRoZSBmb3JlYWNoIGxvb3BcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPCAkX2xvb3BfY291bnQgLSAxKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBAZmlyc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgZmlyc3QgaXRlbVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzK0BmaXJzdFxccypcXH1cXH0vZyxcbiAgICBgPD9waHAgaWYgKCRpbmRleCA9PT0gMCkgOiA/PmBcbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgQGxhc3R9fSAtIHNob3cgY29udGVudCBvbmx5IGZvciB0aGUgbGFzdCBpdGVtXG4gIC8vIFVzZXMgJF9sb29wX2NvdW50IHNldCBpbiB0aGUgZm9yZWFjaCBsb29wXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrQGxhc3RcXHMqXFx9XFx9L2csXG4gICAgYDw/cGhwIGlmICgkaW5kZXggPT09ICRfbG9vcF9jb3VudCAtIDEpIDogPz5gXG4gICk7XG4gIFxuICBwaHAgPSBwaHAucmVwbGFjZSgvXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csICc8P3BocCBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIENvbnZlcnQge3sjaWYgdGhpcy54eHh9fSBjb25kaXRpb25hbHMgaW5zaWRlIGxvb3BzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrdGhpc1xcLihcXHcrKVxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4gYDw/cGhwIGlmICghZW1wdHkoJGl0ZW1bJyR7ZmllbGR9J10pKSA6ID8+YFxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBhbGlhcy5maWVsZH19IGZvciBhbnkgcmVtYWluaW5nIGxvb3AgdmFyaWFibGUgY29uZGl0aW9uYWxzXG4gIC8vIFRoaXMgY2F0Y2hlcyBjYXNlcyB3aGVyZSB0aGUgYWxpYXMgd2Fzbid0IHRyYWNrZWQgKGUuZy4sIG5lc3RlZCBsb29wcyBvciB1bnRyYWNrZWQgYWxpYXNlcylcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKG1hdGNoLCBhbGlhcywgZmllbGQpID0+IHtcbiAgICAgIC8vIFNraXAgaWYgaXQgbG9va3MgbGlrZSBwcm9wZXJ0aWVzLnh4eCAoYWxyZWFkeSBoYW5kbGVkKVxuICAgICAgaWYgKGFsaWFzID09PSAncHJvcGVydGllcycgfHwgYWxpYXMgPT09ICd0aGlzJykge1xuICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1thbGlhc10gPyAnJHN1Ykl0ZW0nIDogJyRpdGVtJztcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddKSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGVscGVyIHRvIHBhcnNlIEhhbmRsZWJhcnMgaGVscGVyIGV4cHJlc3Npb25zIGxpa2UgKGVxIHByb3BlcnRpZXMubGF5b3V0IFwibGF5b3V0LTFcIilcbiAgLy8gYW5kIGNvbnZlcnQgdG8gUEhQIGNvbXBhcmlzb24gZXhwcmVzc2lvbnNcbiAgY29uc3QgcGFyc2VIZWxwZXJUb1BocCA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICAvLyBIZWxwZXIgdG8gY29udmVydCBhIHZhcmlhYmxlIHBhdGggdG8gUEhQIGV4cHJlc3Npb25cbiAgICAvLyBIYW5kbGVzIHByb3BlcnRpZXMueHh4LCB0aGlzLnh4eCwgYW5kIGFsaWFzLnh4eCBwYXR0ZXJuc1xuICAgIGNvbnN0IHZhclRvUGhwID0gKHZhclBhdGg6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICBpZiAodmFyUGF0aC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gdmFyUGF0aC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgcmV0dXJuIGAkJHtjYW1lbFByb3B9Wycke3BhcnRzLnNsaWNlKDEpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCQke2NhbWVsUHJvcH1gO1xuICAgICAgfSBlbHNlIGlmICh2YXJQYXRoLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSB2YXJQYXRoLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGQuc3BsaXQoJy4nKS5qb2luKFwiJ11bJ1wiKX0nXWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGAkaXRlbVsnJHtmaWVsZH0nXWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBpcyBhIGtub3duIGxvb3AgYWxpYXMgKGUuZy4sIGNhcmQudHlwZSAtPiB0eXBlKVxuICAgICAgICBjb25zdCBwYXJ0cyA9IHZhclBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAvLyBDaGVjayBuZXN0ZWQgYWxpYXNlcyBmaXJzdCAodXNlICRzdWJJdGVtKVxuICAgICAgICAgIGlmIChuZXN0ZWRMb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJHN1Ykl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlbiBjaGVjayB0b3AtbGV2ZWwgYWxpYXNlcyAodXNlICRpdGVtKVxuICAgICAgICAgIGlmIChsb29wQWxpYXNlc1twYXJ0c1swXV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnRzLnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7ZmllbGRQYXRoWzBdfSddYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2sgLSB1c2UgYXMtaXMgKG1pZ2h0IGJlIGEgcGxhaW4gZmllbGQgbmFtZSlcbiAgICAgICAgaWYgKHZhclBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIHJldHVybiBgJGl0ZW1bJyR7dmFyUGF0aC5zcGxpdCgnLicpLmpvaW4oXCInXVsnXCIpfSddYDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYCRpdGVtWycke3ZhclBhdGh9J11gO1xuICAgICAgfVxuICAgIH07XG4gICAgXG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgXCJyaWdodFwiKSAtIGVxdWFscyB3aXRoIHF1b3RlZCBzdHJpbmdcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCB2YXJpYWJsZSkgd2l0aG91dCBxdW90ZXNcbiAgICBjb25zdCBlcVZhck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNdKylcXHMrKFteXFxzKVwiXSspXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFWYXJNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFWYXJNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICBjb25zdCByaWdodEV4cHIgPSB2YXJUb1BocChyaWdodCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgPT09ICgke3JpZ2h0RXhwcn0gPz8gJycpYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJyaWdodFwiKSAtIG5vdCBlcXVhbHNcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAnJykgIT09ICcke3JpZ2h0fSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAoZ3QgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW5cbiAgICBjb25zdCBndE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGd0TWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0TWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPiAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChsdCBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhblxuICAgIGNvbnN0IGx0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgICBpZiAobHRNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8ICR7cmlnaHR9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKGd0ZSBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhbiBvciBlcXVhbFxuICAgIGNvbnN0IGd0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChndGVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RlTWF0Y2g7XG4gICAgICBjb25zdCBsZWZ0RXhwciA9IHZhclRvUGhwKGxlZnQpO1xuICAgICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0gPz8gMCkgPj0gJHtyaWdodH1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobHRlIGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuIG9yIGVxdWFsXG4gICAgY29uc3QgbHRlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGx0ZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdGVNYXRjaDtcbiAgICAgIGNvbnN0IGxlZnRFeHByID0gdmFyVG9QaHAobGVmdCk7XG4gICAgICByZXR1cm4gYCgke2xlZnRFeHByfSA/PyAwKSA8PSAke3JpZ2h0fWA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9O1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aCBpZi9lbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXywgaGVscGVyRXhwciwgaWZDb250ZW50LCBlbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgcGhwQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJUb1BocChoZWxwZXJFeHByKTtcbiAgICAgIGlmIChwaHBDb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGA8P3BocCBpZiAoJHtwaHBDb25kaXRpb259KSA6ID8+JHtpZkNvbnRlbnR9PD9waHAgZWxzZSA6ID8+JHtlbHNlQ29udGVudH08P3BocCBlbmRpZjsgPz5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGA8P3BocCBpZiAoZmFsc2UpIDogPz4ke2lmQ29udGVudH08P3BocCBlbHNlIDogPz4ke2Vsc2VDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBoZWxwZXIgZXhwcmVzc2lvbnMgd2l0aG91dCBlbHNlXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfLCBoZWxwZXJFeHByLCBpZkNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IHBocENvbmRpdGlvbiA9IHBhcnNlSGVscGVyVG9QaHAoaGVscGVyRXhwcik7XG4gICAgICBpZiAocGhwQ29uZGl0aW9uKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCR7cGhwQ29uZGl0aW9ufSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYDw/cGhwIGlmIChmYWxzZSkgOiA/PiR7aWZDb250ZW50fTw/cGhwIGVuZGlmOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7eyNpZiBwcm9wZXJ0aWVzLnh4eC55eXkuenp6Li4ufX0gY29uZGl0aW9uYWxzIHdpdGggZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAvLyBlLmcuLCB7eyNpZiBwcm9wZXJ0aWVzLmxlZnRfY29sdW1uLmN0YS5saW5rfX0gLT4gPD9waHAgaWYgKCFlbXB0eSgkbGVmdENvbHVtblsnY3RhJ11bJ2xpbmsnXSkpIDogPz5cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccytwcm9wZXJ0aWVzXFwuKFtcXHcuXSspXFx9XFx9L2csXG4gICAgKF8sIHByb3BQYXRoKSA9PiB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkJHtjYW1lbFByb3B9KSkgOiA/PmA7XG4gICAgICB9XG4gICAgICAvLyBCdWlsZCBuZXN0ZWQgYXJyYXkgYWNjZXNzIGZvciByZW1haW5pbmcgcGFydHNcbiAgICAgIGNvbnN0IG5lc3RlZEFjY2VzcyA9IHBhcnRzLnNsaWNlKDEpLm1hcCgocDogc3RyaW5nKSA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPD9waHAgaWYgKCFlbXB0eSgkJHtjYW1lbFByb3B9JHtuZXN0ZWRBY2Nlc3N9KSkgOiA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7ZWxzZX19IHNlcGFyYXRlbHkgKGZvciBjYXNlcyBub3QgY2F1Z2h0IGJ5IHRoZSBjb21iaW5lZCBwYXR0ZXJucyBhYm92ZSlcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce2Vsc2VcXH1cXH0vZywgJzw/cGhwIGVsc2UgOiA/PicpO1xuICBcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xce1xce1xcL2lmXFx9XFx9L2csICc8P3BocCBlbmRpZjsgPz4nKTtcbiAgXG4gIC8vIElNUE9SVEFOVDogQ29udmVydCB0cmlwbGUtYnJhY2UgZXhwcmVzc2lvbnMgRklSU1QgKGJlZm9yZSBkb3VibGUtYnJhY2UpXG4gIC8vIFRyaXBsZSBicmFjZXMgYXJlIGZvciB1bmVzY2FwZWQgSFRNTCBvdXRwdXQgKHJpY2ggdGV4dCBmaWVsZHMpXG4gIFxuICAvLyBDb252ZXJ0IHt7e3Byb3BlcnRpZXMueHh4fX19IHRyaXBsZSBicmFjZXMgKHVuZXNjYXBlZCBIVE1MKVxuICAvLyByaWNodGV4dCBwcm9wcyB1c2UgSW5uZXJCbG9ja3Mg4oCUIG91dHB1dCAkY29udGVudCAoaW5uZXIgYmxvY2tzIHJlbmRlcmVkIEhUTUwpXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxccypcXH1cXH1cXH0vZyxcbiAgICAoXywgcHJvcCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICBpZiAocmljaHRleHRQcm9wcy5oYXMocHJvcCkgfHwgcmljaHRleHRQcm9wcy5oYXMoY2FtZWxQcm9wKSkge1xuICAgICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJGNvbnRlbnQ7ID8+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJCR7Y2FtZWxQcm9wfSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7e3RoaXMueHh4fX19IHRyaXBsZSBicmFjZXMgZm9yIGxvb3AgaXRlbXNcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccyp0aGlzXFwuKFxcdyspXFxzKlxcfVxcfVxcfS9nLFxuICAgIChfLCBmaWVsZCkgPT4ge1xuICAgICAgcmV0dXJuIGA8P3BocCBlY2hvIHdwX2tzZXNfcG9zdCgkaXRlbVsnJHtmaWVsZH0nXSA/PyAnJyk7ID8+YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7e2FsaWFzLnh4eH19fSB0cmlwbGUgYnJhY2VzIGZvciBuYW1lZCBsb29wIGFsaWFzZXNcbiAgLy8gVGhpcyBjYXRjaGVzIGFueSByZW1haW5pbmcgYWxpYXMuZmllbGQgcGF0dGVybnMgd2l0aCB0cmlwbGUgYnJhY2VzXG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVxcfS9nLFxuICAgIChtYXRjaCwgYWxpYXMsIGZpZWxkKSA9PiB7XG4gICAgICAvLyBTa2lwIGlmIGl0IGxvb2tzIGxpa2UgcHJvcGVydGllcy54eHggb3IgdGhpcy54eHggKGFscmVhZHkgaGFuZGxlZClcbiAgICAgIGlmIChhbGlhcyA9PT0gJ3Byb3BlcnRpZXMnIHx8IGFsaWFzID09PSAndGhpcycpIHtcbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gVXNlICRzdWJJdGVtIGZvciBuZXN0ZWQgbG9vcCBhbGlhc2VzLCAkaXRlbSBmb3IgdG9wLWxldmVsXG4gICAgICBjb25zdCBpdGVtVmFyID0gbmVzdGVkTG9vcEFsaWFzZXNbYWxpYXNdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gd3Bfa3Nlc19wb3N0KCR7aXRlbVZhcn1bJyR7ZmllbGR9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3t0aGlzfX19IGZvciBzY2FsYXIgYXJyYXlzIHdpdGggSFRNTCBjb250ZW50XG4gIHBocCA9IHBocC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqdGhpc1xccypcXH1cXH1cXH0vZyxcbiAgICAnPD9waHAgZWNobyB3cF9rc2VzX3Bvc3QoJHN1Ykl0ZW0gPz8gJGl0ZW0gPz8gXFwnXFwnKTsgPz4nXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7dGhpc319IHNpbXBsZSByZWZlcmVuY2UgKGZvciBzY2FsYXIgYXJyYXlzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFxzKnRoaXNcXHMqXFx9XFx9L2csXG4gICAgJzw/cGhwIGVjaG8gZXNjX2h0bWwoJHN1Ykl0ZW0gPz8gJGl0ZW0gPz8gXFwnXFwnKTsgPz4nXG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHt7dGhpcy54eHgueXl5fX0gZGVlcCBuZXN0ZWQgcmVmZXJlbmNlc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFxzKnRoaXNcXC4oXFx3KylcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKF8sIGZpZWxkMSwgZmllbGQyKSA9PiB7XG4gICAgICBjb25zdCBlc2NGdW5jID0gZmllbGQyID09PSAndXJsJyB8fCBmaWVsZDIgPT09ICdzcmMnIHx8IGZpZWxkMiA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCRpdGVtWycke2ZpZWxkMX0nXVsnJHtmaWVsZDJ9J10gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB7e3RoaXMueHh4fX0gcmVmZXJlbmNlc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7XFxzKnRoaXNcXC4oXFx3KylcXHMqXFx9XFx9L2csXG4gICAgKF8sIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCBlc2NGdW5jID0gZmllbGQgPT09ICd1cmwnIHx8IGZpZWxkID09PSAnc3JjJyB8fCBmaWVsZCA9PT0gJ2hyZWYnID8gJ2VzY191cmwnIDogJ2VzY19odG1sJztcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCRpdGVtWycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQge3twcm9wZXJ0aWVzLnh4eC55eXkuenp6Li4ufX0gZGVlcGx5IG5lc3RlZCBwcm9wZXJ0eSBhY2Nlc3MgKGFueSBkZXB0aClcbiAgLy8gZS5nLiwge3twcm9wZXJ0aWVzLmxlZnRfY29sdW1uLmN0YS5saW5rLmxhYmVsfX0gLT4gJGxlZnRDb2x1bW5bJ2N0YSddWydsaW5rJ11bJ2xhYmVsJ11cbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFtcXHcuXSspXFxzKlxcfVxcfS9nLFxuICAgIChfLCBwcm9wUGF0aCkgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wUGF0aC5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgICAgY29uc3QgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGVzY0Z1bmMgPSBsYXN0UGFydCA9PT0gJ3VybCcgfHwgbGFzdFBhcnQgPT09ICdzcmMnIHx8IGxhc3RQYXJ0ID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnO1xuICAgICAgXG4gICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCQke2NhbWVsUHJvcH0gPz8gJycpOyA/PmA7XG4gICAgICB9XG4gICAgICAvLyBCdWlsZCBuZXN0ZWQgYXJyYXkgYWNjZXNzIGZvciByZW1haW5pbmcgcGFydHNcbiAgICAgIGNvbnN0IG5lc3RlZEFjY2VzcyA9IHBhcnRzLnNsaWNlKDEpLm1hcCgocDogc3RyaW5nKSA9PiBgWycke3B9J11gKS5qb2luKCcnKTtcbiAgICAgIHJldHVybiBgPD9waHAgZWNobyAke2VzY0Z1bmN9KCQke2NhbWVsUHJvcH0ke25lc3RlZEFjY2Vzc30gPz8gJycpOyA/PmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCByZW1haW5pbmcge3t4eHgueXl5fX0gcGF0dGVybnMgKGxpa2VseSBsb29wIGl0ZW0gcmVmZXJlbmNlcyB3aXRob3V0IHRoaXMuKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvXFx7XFx7K1xccyooXFx3KylcXC4oXFx3KylcXHMqXFx9K1xcfS9nLFxuICAgIChfLCBvYmosIGZpZWxkKSA9PiB7XG4gICAgICAvLyBTa2lwIGlmIGl0IGxvb2tzIGxpa2UgYSBQSFAgZXhwcmVzc2lvblxuICAgICAgaWYgKG9iai5pbmNsdWRlcygnJCcpIHx8IG9iai5pbmNsdWRlcygncGhwJykpIHJldHVybiBge3ske29ian0uJHtmaWVsZH19fWA7XG4gICAgICBjb25zdCBlc2NGdW5jID0gZmllbGQgPT09ICd1cmwnIHx8IGZpZWxkID09PSAnc3JjJyB8fCBmaWVsZCA9PT0gJ2hyZWYnIHx8IGZpZWxkID09PSAnbGFiZWwnID8gXG4gICAgICAgIChmaWVsZCA9PT0gJ3VybCcgfHwgZmllbGQgPT09ICdzcmMnIHx8IGZpZWxkID09PSAnaHJlZicgPyAnZXNjX3VybCcgOiAnZXNjX2h0bWwnKSA6ICdlc2NfaHRtbCc7XG4gICAgICAvLyBVc2UgJHN1Ykl0ZW0gZm9yIG5lc3RlZCBsb29wIGFsaWFzZXMsICRpdGVtIGZvciB0b3AtbGV2ZWxcbiAgICAgIGNvbnN0IGl0ZW1WYXIgPSBuZXN0ZWRMb29wQWxpYXNlc1tvYmpdID8gJyRzdWJJdGVtJyA6ICckaXRlbSc7XG4gICAgICByZXR1cm4gYDw/cGhwIGVjaG8gJHtlc2NGdW5jfSgke2l0ZW1WYXJ9Wycke2ZpZWxkfSddID8/ICcnKTsgPz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaHJlZj1cInt7cHJvcGVydGllcy54eHgueXl5fX1cIiBwYXR0ZXJucyBzcGVjaWZpY2FsbHlcbiAgcGhwID0gcGhwLnJlcGxhY2UoXG4gICAgL2hyZWY9XCJcXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1cIi9nLFxuICAgIChfLCBwcm9wLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICByZXR1cm4gYGhyZWY9XCI8P3BocCBlY2hvIGVzY191cmwoJCR7Y2FtZWxQcm9wfVsnJHtmaWVsZH0nXSA/PyAnIycpOyA/PlwiYDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGhyZWY9XCJ7e3Byb3BlcnRpZXMueHh4fX1cIiBwYXR0ZXJuc1xuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFxzKlxcfVxcfVwiL2csXG4gICAgKF8sIHByb3ApID0+IHtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IHRvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCQke2NhbWVsUHJvcH0gPz8gJyMnKTsgPz5cImA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCByZW1haW5pbmcgaHJlZj1cInt7Li4ufX1cIiBwYXR0ZXJucyAoZm9yIGxvb3AgaXRlbSByZWZlcmVuY2VzKVxuICBwaHAgPSBwaHAucmVwbGFjZShcbiAgICAvaHJlZj1cIlxce1xceysoW159XSspXFx9K1xcfVwiL2csXG4gICAgKF8sIGV4cHIpID0+IHtcbiAgICAgIGlmIChleHByLmluY2x1ZGVzKCc8P3BocCcpKSByZXR1cm4gYGhyZWY9XCIke2V4cHJ9XCJgO1xuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIHRoaXMueHh4IHBhdHRlcm5cbiAgICAgIGNvbnN0IHRoaXNNYXRjaCA9IGV4cHIubWF0Y2goL15cXHMqdGhpc1xcLihcXHcrKSg/OlxcLihcXHcrKSk/XFxzKiQvKTtcbiAgICAgIGlmICh0aGlzTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgWywgZmllbGQxLCBmaWVsZDJdID0gdGhpc01hdGNoO1xuICAgICAgICBpZiAoZmllbGQyKSB7XG4gICAgICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCRpdGVtWycke2ZpZWxkMX0nXVsnJHtmaWVsZDJ9J10gPz8gJyMnKTsgPz5cImA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBocmVmPVwiPD9waHAgZWNobyBlc2NfdXJsKCRpdGVtWycke2ZpZWxkMX0nXSA/PyAnIycpOyA/PlwiYDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnaHJlZj1cIjw/cGhwIGVjaG8gZXNjX3VybCgkaXRlbVtcXCd1cmxcXCddID8/ICRpdGVtW1xcJ2xpbmtcXCddW1xcJ3VybFxcJ10gPz8gXFwnI1xcJyk7ID8+XCInO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENsZWFuIHVwIGFueSBzdHJheSBjdXJseSBicmFjZXMgYXJvdW5kIFBIUCBlY2hvIHN0YXRlbWVudHNcbiAgcGhwID0gcGhwLnJlcGxhY2UoL1xceyg8XFw/cGhwIGVjaG8pL2csICckMScpO1xuICBwaHAgPSBwaHAucmVwbGFjZSgvKDsgXFw/PilcXH0vZywgJyQxJyk7XG4gIFxuICByZXR1cm4gcGhwLnRyaW0oKTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYXR0cmlidXRlIGV4dHJhY3Rpb24gY29kZVxuICovXG5jb25zdCBnZW5lcmF0ZUF0dHJpYnV0ZUV4dHJhY3Rpb24gPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgaGFzT3ZlcmxheTogYm9vbGVhbiwgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGwpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBleHRyYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgLy8gT25seSB0aGUgaW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCB1c2VzICRjb250ZW50IOKAlCBza2lwIGF0dHJpYnV0ZSBleHRyYWN0aW9uIGZvciBpdFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncmljaHRleHQnICYmIGtleSA9PT0gaW5uZXJCbG9ja3NGaWVsZCkgY29udGludWU7XG4gICAgLy8gcGFnaW5hdGlvbiBpdGVtcyBhcmUgYXV0by1nZW5lcmF0ZWQgZnJvbSBXUF9RdWVyeSDigJQgbm8gYXR0cmlidXRlIHRvIGV4dHJhY3RcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcblxuICAgIGNvbnN0IGNhbWVsS2V5ID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBkZWZhdWx0VmFsdWUgPSBnZXRQaHBEZWZhdWx0VmFsdWUocHJvcGVydHkpO1xuICAgIFxuICAgIGV4dHJhY3Rpb25zLnB1c2goYCQke2NhbWVsS2V5fSA9IGlzc2V0KCRhdHRyaWJ1dGVzWycke2NhbWVsS2V5fSddKSA/ICRhdHRyaWJ1dGVzWycke2NhbWVsS2V5fSddIDogJHtkZWZhdWx0VmFsdWV9O2ApO1xuICB9XG4gIFxuICAvLyBBZGQgb3ZlcmxheSBvcGFjaXR5IGlmIGRldGVjdGVkXG4gIGlmIChoYXNPdmVybGF5KSB7XG4gICAgZXh0cmFjdGlvbnMucHVzaChgJG92ZXJsYXlPcGFjaXR5ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJ292ZXJsYXlPcGFjaXR5J10pID8gJGF0dHJpYnV0ZXNbJ292ZXJsYXlPcGFjaXR5J10gOiAwLjY7YCk7XG4gIH1cbiAgXG4gIHJldHVybiBleHRyYWN0aW9ucy5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogV3JhcCB0ZW1wbGF0ZSB3aXRoIGJsb2NrIHdyYXBwZXIgdGhhdCBoYW5kbGVzIGFsaWdubWVudFxuICogQWRkcyB0aGUgYWxpZ25tZW50IGNsYXNzIChhbGlnbm5vbmUsIGFsaWdud2lkZSwgYWxpZ25mdWxsKSBiYXNlZCBvbiBibG9jayBzZXR0aW5nc1xuICovXG5jb25zdCB3cmFwV2l0aEJsb2NrV3JhcHBlciA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjb21wb25lbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gQ29udmVydCBjb21wb25lbnQgSUQgdG8gY2xhc3MgbmFtZSAoc25ha2VfY2FzZSB0byBrZWJhYi1jYXNlKVxuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIFxuICAvLyBXcmFwIHRoZSB0ZW1wbGF0ZSBpbiBhIGRpdiB0aGF0IHVzZXMgV29yZFByZXNzJ3MgYmxvY2sgd3JhcHBlciBhdHRyaWJ1dGVzXG4gIC8vIFRoaXMgaGFuZGxlcyBhbGlnbm1lbnQgY2xhc3NlcyBhdXRvbWF0aWNhbGx5XG4gIHJldHVybiBgPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7Y2xhc3NOYW1lfSddKTsgPz4+XG4ke3RlbXBsYXRlfVxuPC9kaXY+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgUEhQIGNvZGUgdG8gY29udmVydCBmaWVsZCBtYXBwaW5nIHZhbHVlIHRvIFBIUCBhcnJheSBzeW50YXhcbiAqL1xuY29uc3QgZmllbGRNYXBwaW5nVG9QaHAgPSAobWFwcGluZzogUmVjb3JkPHN0cmluZywgRmllbGRNYXBwaW5nVmFsdWU+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1hcHBpbmcpKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIFNpbXBsZSBzdHJpbmcgbWFwcGluZ1xuICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gJyR7dmFsdWV9J2ApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS50eXBlKSB7XG4gICAgICAvLyBDb21wbGV4IG1hcHBpbmdcbiAgICAgIHN3aXRjaCAodmFsdWUudHlwZSkge1xuICAgICAgICBjYXNlICdzdGF0aWMnOlxuICAgICAgICAgIGVudHJpZXMucHVzaChgICAgICcke2tleX0nID0+IFsndHlwZScgPT4gJ3N0YXRpYycsICd2YWx1ZScgPT4gJyR7KHZhbHVlIGFzIGFueSkudmFsdWUgfHwgJyd9J11gKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbWFudWFsJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtYW51YWwnXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdtZXRhJzpcbiAgICAgICAgICBlbnRyaWVzLnB1c2goYCAgICAnJHtrZXl9JyA9PiBbJ3R5cGUnID0+ICdtZXRhJywgJ2tleScgPT4gJyR7KHZhbHVlIGFzIGFueSkua2V5IHx8ICcnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RheG9ub215JzpcbiAgICAgICAgICBjb25zdCB0YXhWYWx1ZSA9IHZhbHVlIGFzIHsgdHlwZTogJ3RheG9ub215JzsgdGF4b25vbXk6IHN0cmluZzsgZm9ybWF0Pzogc3RyaW5nIH07XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAndGF4b25vbXknLCAndGF4b25vbXknID0+ICcke3RheFZhbHVlLnRheG9ub215fScsICdmb3JtYXQnID0+ICcke3RheFZhbHVlLmZvcm1hdCB8fCAnZmlyc3QnfSddYCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2N1c3RvbSc6XG4gICAgICAgICAgZW50cmllcy5wdXNoKGAgICAgJyR7a2V5fScgPT4gWyd0eXBlJyA9PiAnY3VzdG9tJywgJ2NhbGxiYWNrJyA9PiAnJHsodmFsdWUgYXMgYW55KS5jYWxsYmFjayB8fCAnJ30nXWApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIGBbXFxuJHtlbnRyaWVzLmpvaW4oJyxcXG4nKX1cXG4gIF1gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBwYWdpbmF0aW9uIFBIUCBjb2RlIGZvciBhIGR5bmFtaWMgYXJyYXkgcXVlcnkuXG4gKiBSZXR1cm5zIHRoZSBwYWdpbmF0aW9uIGJsb2NrIHRvIGFwcGVuZCBhZnRlciB0aGUgV1BfUXVlcnkgZXhlY3V0aW9uLlxuICovXG5jb25zdCBnZW5lcmF0ZVBhZ2luYXRpb25QaHAgPSAoXG4gIGF0dHJOYW1lOiBzdHJpbmcsXG4gIHBhZ2luYXRpb25Qcm9wTmFtZTogc3RyaW5nXG4pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gYFxuICAvLyBQYWdpbmF0aW9uXG4gICQke3BhZ2luYXRpb25Qcm9wTmFtZX0gPSBbXTtcbiAgJCR7YXR0ck5hbWV9X3BhZ2luYXRpb25fZW5hYmxlZCA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkJ10gPz8gdHJ1ZTtcbiAgaWYgKCQke2F0dHJOYW1lfV9wYWdpbmF0aW9uX2VuYWJsZWQgJiYgJHF1ZXJ5LT5tYXhfbnVtX3BhZ2VzID4gMSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbicpKSB7XG4gICAgJCR7cGFnaW5hdGlvblByb3BOYW1lfSA9IGhhbmRvZmZfYnVpbGRfcGFnaW5hdGlvbigkaGZfcGFnZWQsICRxdWVyeS0+bWF4X251bV9wYWdlcywgJyR7YGhmX3BhZ2VfJHthdHRyTmFtZX1gfScpO1xuICB9YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIHBhZ2VkIHZhcmlhYmxlIGV4dHJhY3Rpb24gYW5kIFdQX1F1ZXJ5IHBhZ2VkIGFyZyBmb3IgcGFnaW5hdGlvbi5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdlZFBocCA9IChhdHRyTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcGFyYW1LZXkgPSBgaGZfcGFnZV8ke2F0dHJOYW1lfWA7XG4gIHJldHVybiBgXG4gIC8vIFJlYWQgY3VycmVudCBwYWdlIGZyb20gY3VzdG9tIHF1ZXJ5IHBhcmFtZXRlclxuICAkaGZfcGFnZWQgPSBpc3NldCgkX0dFVFsnJHtwYXJhbUtleX0nXSkgPyBtYXgoMSwgaW50dmFsKCRfR0VUWycke3BhcmFtS2V5fSddKSkgOiAxO2A7XG59O1xuXG4vKipcbiAqIEJ1aWxkIFBIUCBhcnJheV9tYXAgZXhwcmVzc2lvbiB0byByZXNoYXBlIHN0YW5kYXJkIGhlbHBlciBpdGVtcyBpbnRvIHRoZVxuICogdGVtcGxhdGUncyBleHBlY3RlZCBpdGVtIHNoYXBlLiAgUmV0dXJucyBudWxsIHdoZW4gbm8gcmVzaGFwaW5nIGlzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gaXRlbVByb3BlcnRpZXMgIFRoZSBjb21wb25lbnQncyBhcnJheSBpdGVtIHByb3BlcnR5IHNjaGVtYSAoaXRlbXMucHJvcGVydGllcylcbiAqIEBwYXJhbSBzdGFuZGFyZEZpZWxkcyAgVGhlIGZsYXQgZmllbGQgbmFtZXMgdGhlIGhlbHBlciByZXR1cm5zIChlLmcuIFsnbGFiZWwnLCd1cmwnXSlcbiAqL1xuY29uc3QgYnVpbGRSZXNoYXBlUGhwID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG5cbiAgLy8gSWYgZXZlcnkgdG9wLWxldmVsIGtleSBJUyBhIHN0YW5kYXJkIGZpZWxkIHRoZSBzaGFwZXMgYWxyZWFkeSBtYXRjaFxuICBpZiAodG9wS2V5cy5ldmVyeShrID0+IHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGspKSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgcGFpcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbVByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIHBhaXJzLnB1c2goYCcke2tleX0nID0+ICRfX2l0ZW1bJyR7a2V5fSddYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJyB8fCBwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICBjb25zdCBzdWI6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoJ2xhYmVsJykpIHN1Yi5wdXNoKGAnbGFiZWwnID0+ICRfX2l0ZW1bJ2xhYmVsJ11gKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYCd1cmwnICAgPT4gJF9faXRlbVsndXJsJ11gKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAnJHtrZXl9JyA9PiBbJHtzdWIuam9pbignLCAnKX1dYCk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgZm9yIChjb25zdCBzdWJLZXkgb2YgT2JqZWN0LmtleXMocHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoc3ViS2V5KSkge1xuICAgICAgICAgIHN1Yi5wdXNoKGAnJHtzdWJLZXl9JyA9PiAkX19pdGVtWycke3N1YktleX0nXWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJyR7a2V5fScgPT4gWyR7c3ViLmpvaW4oJywgJyl9XWApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYWlycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gYFske3BhaXJzLmpvaW4oJywgJyl9XWA7XG59O1xuXG4vKipcbiAqIEJ1aWxkIGVxdWl2YWxlbnQgSlMgcmVzaGFwZSBleHByZXNzaW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAqIFJldHVybnMgbnVsbCB3aGVuIG5vIHJlc2hhcGluZyBpcyBuZWVkZWQuXG4gKi9cbmNvbnN0IGJ1aWxkUmVzaGFwZUpzID0gKFxuICBpdGVtUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IHVuZGVmaW5lZCxcbiAgc3RhbmRhcmRGaWVsZHM6IHN0cmluZ1tdLFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghaXRlbVByb3BlcnRpZXMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHRvcEtleXMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcGVydGllcyk7XG4gIGlmICh0b3BLZXlzLmV2ZXJ5KGsgPT4gc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoaykpKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBwYWlyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhpdGVtUHJvcGVydGllcykpIHtcbiAgICBpZiAoc3RhbmRhcmRGaWVsZHMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgcGFpcnMucHVzaChgJHtrZXl9OiBpdGVtLiR7a2V5fWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnbGluaycgfHwgcHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgY29uc3Qgc3ViOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKCdsYWJlbCcpKSBzdWIucHVzaChgbGFiZWw6IGl0ZW0ubGFiZWxgKTtcbiAgICAgIGlmIChzdGFuZGFyZEZpZWxkcy5pbmNsdWRlcygndXJsJykpICAgc3ViLnB1c2goYHVybDogaXRlbS51cmxgKTtcbiAgICAgIGlmIChzdWIubGVuZ3RoKSBwYWlycy5wdXNoKGAke2tleX06IHsgJHtzdWIuam9pbignLCAnKX0gfWApO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IHN1Yjogc3RyaW5nW10gPSBbXTtcbiAgICAgIGZvciAoY29uc3Qgc3ViS2V5IG9mIE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgaWYgKHN0YW5kYXJkRmllbGRzLmluY2x1ZGVzKHN1YktleSkpIHtcbiAgICAgICAgICBzdWIucHVzaChgJHtzdWJLZXl9OiBpdGVtLiR7c3ViS2V5fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3ViLmxlbmd0aCkgcGFpcnMucHVzaChgJHtrZXl9OiB7ICR7c3ViLmpvaW4oJywgJyl9IH1gKTtcbiAgICB9XG4gIH1cblxuICBpZiAocGFpcnMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGAoeyAke3BhaXJzLmpvaW4oJywgJyl9IH0pYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYnJlYWRjcnVtYnMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogQ2FsbHMgaGFuZG9mZl9nZXRfYnJlYWRjcnVtYl9pdGVtcygpIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHJldHVybnMgYW4gZW1wdHkgYXJyYXkuXG4gKi9cbmNvbnN0IGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnXSk7XG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7XG4gICAgJCR7YXR0ck5hbWV9ID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCRfX2l0ZW0pIHsgcmV0dXJuICR7cmVzaGFwZUV4cHJ9OyB9LCAkX19yYXcpO2BcbiAgICA6IGAkJHthdHRyTmFtZX0gPSBoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zKCk7YDtcblxuICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChicmVhZGNydW1icylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCFmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfZ2V0X2JyZWFkY3J1bWJfaXRlbXMnKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2dldF9icmVhZGNydW1iX2l0ZW1zJykpIHtcbiAgICAke2Fzc2lnbkl0ZW1zfVxuICB9XG59XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0YXhvbm9teSB0ZXJtcyBhcnJheSBleHRyYWN0aW9uIGNvZGUgZm9yIHJlbmRlci5waHAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IFRheG9ub215QXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG1heEl0ZW1zID0gY29uZmlnLm1heEl0ZW1zID8/IC0xO1xuICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBjb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcblxuICAvLyBCdWlsZCB0aGUgcGVyLXRlcm0gYXNzaWdubWVudDogZWl0aGVyIGZsYXQgb3IgcmVzaGFwZWRcbiAgbGV0IHRlcm1Bc3NpZ25tZW50OiBzdHJpbmc7XG4gIGlmIChyZXNoYXBlRXhwcikge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJF9faXRlbSA9IFsnbGFiZWwnID0+ICR0ZXJtLT5uYW1lLCAndXJsJyA9PiBnZXRfdGVybV9saW5rKCR0ZXJtKSwgJ3NsdWcnID0+ICR0ZXJtLT5zbHVnXTtcbiAgICAgICAgJCR7YXR0ck5hbWV9W10gPSAke3Jlc2hhcGVFeHByfTtgO1xuICB9IGVsc2Uge1xuICAgIHRlcm1Bc3NpZ25tZW50ID0gYCAgICAgICAgJCR7YXR0ck5hbWV9W10gPSBbXG4gICAgICAgICAgJ2xhYmVsJyA9PiAkdGVybS0+bmFtZSxcbiAgICAgICAgICAndXJsJyAgID0+IGdldF90ZXJtX2xpbmsoJHRlcm0pLFxuICAgICAgICAgICdzbHVnJyAgPT4gJHRlcm0tPnNsdWcsXG4gICAgICAgIF07YDtcbiAgfVxuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHRheG9ub215IHRlcm1zKVxuJCR7YXR0ck5hbWV9RW5hYmxlZCAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gID8/IGZhbHNlO1xuJCR7YXR0ck5hbWV9VGF4b25vbXkgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1UYXhvbm9teSddID8/ICcke2RlZmF1bHRUYXhvbm9teX0nO1xuJCR7YXR0ck5hbWV9U291cmNlICAgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1Tb3VyY2UnXSAgID8/ICdhdXRvJztcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQpIHtcbiAgaWYgKCQke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAkJHthdHRyTmFtZX0gPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX0nXSA/PyBbXTtcbiAgfSBlbHNlIHtcbiAgICAkdGVybXMgPSB3cF9nZXRfcG9zdF90ZXJtcyhnZXRfdGhlX0lEKCksICQke2F0dHJOYW1lfVRheG9ub215LCBbJ251bWJlcicgPT4gJHttYXhJdGVtc31dKTtcbiAgICBpZiAoIWlzX3dwX2Vycm9yKCR0ZXJtcykpIHtcbiAgICAgIGZvcmVhY2ggKCR0ZXJtcyBhcyAkdGVybSkge1xuJHt0ZXJtQXNzaWdubWVudH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHBhZ2luYXRpb24gYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwLlxuICogUmVmZXJlbmNlcyB0aGUgV1BfUXVlcnkgaW5zdGFuY2UgKCRxdWVyeSkgcHJvZHVjZWQgYnkgdGhlIGNvbm5lY3RlZCBwb3N0cyBmaWVsZC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uID0gKFxuICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgYXR0ck5hbWU6IHN0cmluZyxcbiAgY29uZmlnOiBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbm5lY3RlZEF0dHIgPSB0b0NhbWVsQ2FzZShjb25maWcuY29ubmVjdGVkRmllbGQpO1xuICBjb25zdCByZXNoYXBlRXhwciA9IGJ1aWxkUmVzaGFwZVBocChpdGVtUHJvcGVydGllcywgWydsYWJlbCcsICd1cmwnLCAnYWN0aXZlJ10pO1xuXG4gIGNvbnN0IGFzc2lnbkl0ZW1zID0gcmVzaGFwZUV4cHJcbiAgICA/IGAkX19yYXcgPSBoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24oJGhmX3BhZ2VkXyR7Y29ubmVjdGVkQXR0cn0sICRxdWVyeS0+bWF4X251bV9wYWdlcywgJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfScpO1xuICAgICQke2F0dHJOYW1lfSA9IGFycmF5X21hcChmdW5jdGlvbigkX19pdGVtKSB7IHJldHVybiAke3Jlc2hhcGVFeHByfTsgfSwgJF9fcmF3KTtgXG4gICAgOiBgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9idWlsZF9wYWdpbmF0aW9uKCRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9LCAkcXVlcnktPm1heF9udW1fcGFnZXMsICdoZl9wYWdlXyR7Y29ubmVjdGVkQXR0cn0nKTtgO1xuXG4gIHJldHVybiBgXG4vLyBEeW5hbWljIGFycmF5OiAke2ZpZWxkTmFtZX0gKHBhZ2luYXRpb24g4oCUIGNvbm5lY3RlZCB0byAnJHtjb25maWcuY29ubmVjdGVkRmllbGR9JylcbiQke2F0dHJOYW1lfUVuYWJsZWQgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1FbmFibGVkJ10gPz8gdHJ1ZTtcbiQke2F0dHJOYW1lfSA9IFtdO1xuaWYgKCQke2F0dHJOYW1lfUVuYWJsZWQgJiYgaXNzZXQoJHF1ZXJ5KSAmJiAkcXVlcnktPm1heF9udW1fcGFnZXMgPiAxKSB7XG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpXG4gICAgICA/IEhBTkRPRkZfQkxPQ0tTX1BMVUdJTl9ESVIgLiAnaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnXG4gICAgICA6IGRpcm5hbWUoX19GSUxFX18pIC4gJy8uLi9pbmNsdWRlcy9oYW5kb2ZmLWZpZWxkLXJlc29sdmVyLnBocCc7XG4gICAgaWYgKGZpbGVfZXhpc3RzKCRyZXNvbHZlcl9wYXRoKSkge1xuICAgICAgcmVxdWlyZV9vbmNlICRyZXNvbHZlcl9wYXRoO1xuICAgIH1cbiAgfVxuICBpZiAoZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX2J1aWxkX3BhZ2luYXRpb24nKSkge1xuICAgICRoZl9wYWdlZF8ke2Nvbm5lY3RlZEF0dHJ9ID0gaXNzZXQoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSA/IG1heCgxLCBpbnR2YWwoJF9HRVRbJ2hmX3BhZ2VfJHtjb25uZWN0ZWRBdHRyfSddKSkgOiAxO1xuICAgICR7YXNzaWduSXRlbXN9XG4gIH1cbn1cbmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGR5bmFtaWMgYXJyYXkgZXh0cmFjdGlvbiBjb2RlIGZvciByZW5kZXIucGhwXG4gKiBTdXBwb3J0cyBib3RoIG1hbnVhbCBwb3N0IHNlbGVjdGlvbiBhbmQgcXVlcnkgYnVpbGRlciBtb2Rlc1xuICovXG5jb25zdCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24gPSAoXG4gIGZpZWxkTmFtZTogc3RyaW5nLFxuICBhdHRyTmFtZTogc3RyaW5nLFxuICBjb25maWc6IER5bmFtaWNBcnJheUNvbmZpZ1xuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbWFwcGluZ1BocCA9IGNvbmZpZy5maWVsZE1hcHBpbmcgXG4gICAgPyBmaWVsZE1hcHBpbmdUb1BocChjb25maWcuZmllbGRNYXBwaW5nKSBcbiAgICA6ICdbXSc7XG4gIFxuICBjb25zdCBpc1F1ZXJ5TW9kZSA9IGNvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAncXVlcnknO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uID0gaXNRdWVyeU1vZGUgJiYgISFjb25maWcucGFnaW5hdGlvbjtcbiAgY29uc3QgcGFnaW5hdGlvblByb3BOYW1lID0gY29uZmlnLnBhZ2luYXRpb24/LnByb3BlcnR5TmFtZSB8fCAncGFnaW5hdGlvbic7XG4gIFxuICAvLyBDb21tb24gY29kZSBmb3IgbG9hZGluZyB0aGUgZmllbGQgcmVzb2x2ZXJcbiAgY29uc3QgbG9hZFJlc29sdmVyID0gYFxuICAvLyBFbnN1cmUgZmllbGQgcmVzb2x2ZXIgaXMgbG9hZGVkXG4gIGlmICghZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgICRyZXNvbHZlcl9wYXRoID0gZGVmaW5lZCgnSEFORE9GRl9CTE9DS1NfUExVR0lOX0RJUicpIFxuICAgICAgPyBIQU5ET0ZGX0JMT0NLU19QTFVHSU5fRElSIC4gJ2luY2x1ZGVzL2hhbmRvZmYtZmllbGQtcmVzb2x2ZXIucGhwJ1xuICAgICAgOiBkaXJuYW1lKF9fRklMRV9fKSAuICcvLi4vaW5jbHVkZXMvaGFuZG9mZi1maWVsZC1yZXNvbHZlci5waHAnO1xuICAgIGlmIChmaWxlX2V4aXN0cygkcmVzb2x2ZXJfcGF0aCkpIHtcbiAgICAgIHJlcXVpcmVfb25jZSAkcmVzb2x2ZXJfcGF0aDtcbiAgICB9XG4gIH1gO1xuXG4gIC8vIFBhZ2luYXRpb24gUEhQIHNuaXBwZXRzIChlbXB0eSBzdHJpbmdzIHdoZW4gbm8gcGFnaW5hdGlvbilcbiAgY29uc3QgcGFnZWRFeHRyYWN0aW9uID0gaGFzUGFnaW5hdGlvbiA/IGdlbmVyYXRlUGFnZWRQaHAoYXR0ck5hbWUpIDogJyc7XG4gIGNvbnN0IHBhZ2VkQXJnID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4gICAgJ3BhZ2VkJyAgICAgICAgICA9PiAkaGZfcGFnZWQsYCA6ICcnO1xuICBjb25zdCBwYWdpbmF0aW9uQmxvY2sgPSBoYXNQYWdpbmF0aW9uID8gZ2VuZXJhdGVQYWdpbmF0aW9uUGhwKGF0dHJOYW1lLCBwYWdpbmF0aW9uUHJvcE5hbWUpIDogJyc7XG4gIC8vIEluaXRpYWxpemUgcGFnaW5hdGlvbiB2YXJpYWJsZSB0byBlbXB0eSBhcnJheSB3aGVuIG5vdCBpbiBxdWVyeSBtb2RlXG4gIGNvbnN0IHBhZ2luYXRpb25Jbml0ID0gaGFzUGFnaW5hdGlvbiA/IGBcXG4kJHtwYWdpbmF0aW9uUHJvcE5hbWV9ID0gW107YCA6ICcnO1xuXG4gIGlmIChjb25maWcucmVuZGVyTW9kZSA9PT0gJ3RlbXBsYXRlJykge1xuICAgIC8vIFRlbXBsYXRlIG1vZGUgLSBzdG9yZSBwb3N0cyBmb3IgdGVtcGxhdGUgcmVuZGVyaW5nXG4gICAgY29uc3QgdGVtcGxhdGVQYXRoID0gY29uZmlnLnRlbXBsYXRlUGF0aCB8fCBgdGVtcGxhdGUtcGFydHMvaGFuZG9mZi8ke2ZpZWxkTmFtZX0taXRlbS5waHBgO1xuICAgIFxuICAgIGlmIChpc1F1ZXJ5TW9kZSkge1xuICAgICAgLy8gUXVlcnkgYnVpbGRlciBtb2RlIC0gdXNlIFdQX1F1ZXJ5IHdpdGggcXVlcnkgYXJnc1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAocXVlcnkgYnVpbGRlciArIHRlbXBsYXRlIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5JztcbiQke2F0dHJOYW1lfV9wb3N0cyA9IFtdOyR7cGFnaW5hdGlvbkluaXR9XG5cbmlmICgkJHthdHRyTmFtZX1fc291cmNlID09PSAncXVlcnknKSB7XG4gIC8vIFF1ZXJ5IGJ1aWxkZXIgbW9kZSAtIGJ1aWxkIFdQX1F1ZXJ5IGZyb20gc2F2ZWQgYXJnc1xuICAkcXVlcnlfYXJncyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVF1ZXJ5QXJncyddID8/IFtdOyR7cGFnZWRFeHRyYWN0aW9ufVxuICBcbiAgLy8gQnVpbGQgV1BfUXVlcnkgYXJndW1lbnRzXG4gICR3cF9xdWVyeV9hcmdzID0gW1xuICAgICdwb3N0X3R5cGUnICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RfdHlwZSddID8/ICcke2NvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgY29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCd9JyxcbiAgICAncG9zdHNfcGVyX3BhZ2UnID0+ICRxdWVyeV9hcmdzWydwb3N0c19wZXJfcGFnZSddID8/ICR7Y29uZmlnLm1heEl0ZW1zIHx8IDZ9LFxuICAgICdvcmRlcmJ5JyAgICAgICAgPT4gJHF1ZXJ5X2FyZ3NbJ29yZGVyYnknXSA/PyAnZGF0ZScsXG4gICAgJ29yZGVyJyAgICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXInXSA/PyAnREVTQycsXG4gICAgJ3Bvc3Rfc3RhdHVzJyAgICA9PiAncHVibGlzaCcsJHtwYWdlZEFyZ31cbiAgXTtcbiAgXG4gIC8vIEV4Y2x1ZGUgdGhlIGN1cnJlbnQgcG9zdCB0byBwcmV2ZW50IHNlbGYtcmVmZXJlbmNlXG4gICRjdXJyZW50X3Bvc3RfaWQgPSBnZXRfdGhlX0lEKCk7XG4gIGlmICgkY3VycmVudF9wb3N0X2lkKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3Bvc3RfX25vdF9pbiddID0gWyRjdXJyZW50X3Bvc3RfaWRdO1xuICB9XG4gIFxuICAvLyBBZGQgdGF4b25vbXkgcXVlcmllcyBpZiBwcmVzZW50XG4gIGlmICghZW1wdHkoJHF1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddKSkge1xuICAgICR3cF9xdWVyeV9hcmdzWyd0YXhfcXVlcnknXSA9IGFycmF5X21hcChmdW5jdGlvbigkdHEpIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgICd0YXhvbm9teScgPT4gJHRxWyd0YXhvbm9teSddID8/ICcnLFxuICAgICAgICAnZmllbGQnICAgID0+ICR0cVsnZmllbGQnXSA/PyAndGVybV9pZCcsXG4gICAgICAgICd0ZXJtcycgICAgPT4gJHRxWyd0ZXJtcyddID8/IFtdLFxuICAgICAgICAnb3BlcmF0b3InID0+ICR0cVsnb3BlcmF0b3InXSA/PyAnSU4nLFxuICAgICAgXTtcbiAgICB9LCAkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pO1xuICB9XG4gIFxuICAkcXVlcnkgPSBuZXcgV1BfUXVlcnkoJHdwX3F1ZXJ5X2FyZ3MpO1xuICAkJHthdHRyTmFtZX1fcG9zdHMgPSAkcXVlcnktPnBvc3RzOyR7cGFnaW5hdGlvbkJsb2NrfVxuICB3cF9yZXNldF9wb3N0ZGF0YSgpO1xufVxuLy8gRm9yIHRlbXBsYXRlIG1vZGUsIHRoZSB0ZW1wbGF0ZSB3aWxsIGl0ZXJhdGUgb3ZlciAkJHthdHRyTmFtZX1fcG9zdHNcbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE1hbnVhbCBzZWxlY3Rpb24gbW9kZSAtIGZldGNoIHNwZWNpZmljIHBvc3RzXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChzZWxlY3QgcG9zdHMgKyB0ZW1wbGF0ZSBtb2RlKVxuJCR7YXR0ck5hbWV9X3NvdXJjZSA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfVNvdXJjZSddID8/ICdxdWVyeSc7XG4kJHthdHRyTmFtZX1fcG9zdHMgPSBbXTske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICBcbiAgaWYgKCFlbXB0eSgkc2VsZWN0ZWRfcG9zdHMpKSB7XG4gICAgJHBvc3RfaWRzID0gYXJyYXlfZmlsdGVyKGFycmF5X21hcChmdW5jdGlvbigkcCkgeyBcbiAgICAgIHJldHVybiBpc3NldCgkcFsnaWQnXSkgPyBpbnR2YWwoJHBbJ2lkJ10pIDogMDsgXG4gICAgfSwgJHNlbGVjdGVkX3Bvc3RzKSk7XG4gICAgXG4gICAgaWYgKCFlbXB0eSgkcG9zdF9pZHMpKSB7XG4gICAgICAkJHthdHRyTmFtZX1fcG9zdHMgPSBnZXRfcG9zdHMoW1xuICAgICAgICAncG9zdF9faW4nICAgICAgID0+ICRwb3N0X2lkcyxcbiAgICAgICAgJ29yZGVyYnknICAgICAgICA9PiAncG9zdF9faW4nLFxuICAgICAgICAncG9zdHNfcGVyX3BhZ2UnID0+IGNvdW50KCRwb3N0X2lkcyksXG4gICAgICAgICdwb3N0X3N0YXR1cycgICAgPT4gJ3B1Ymxpc2gnLFxuICAgICAgICAncG9zdF90eXBlJyAgICAgID0+ICdhbnknLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG59XG4vLyBGb3IgdGVtcGxhdGUgbW9kZSwgdGhlIHRlbXBsYXRlIHdpbGwgaXRlcmF0ZSBvdmVyICQke2F0dHJOYW1lfV9wb3N0c1xuYDtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gTWFwcGVkIG1vZGUgLSBjb252ZXJ0IHBvc3RzIHRvIGl0ZW0gc3RydWN0dXJlXG4gICAgaWYgKGlzUXVlcnlNb2RlKSB7XG4gICAgICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgd2l0aCBmaWVsZCBtYXBwaW5nXG4gICAgICByZXR1cm4gYFxuLy8gRHluYW1pYyBhcnJheTogJHtmaWVsZE5hbWV9IChxdWVyeSBidWlsZGVyICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAvLyBRdWVyeSBidWlsZGVyIG1vZGUgLSBidWlsZCBXUF9RdWVyeSBmcm9tIHNhdmVkIGFyZ3NcbiAgJHF1ZXJ5X2FyZ3MgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1RdWVyeUFyZ3MnXSA/PyBbXTtcbiAgJGZpZWxkX21hcHBpbmcgPSAkYXR0cmlidXRlc1snJHthdHRyTmFtZX1GaWVsZE1hcHBpbmcnXSA/PyAke21hcHBpbmdQaHB9O1xuJHtsb2FkUmVzb2x2ZXJ9JHtwYWdlZEV4dHJhY3Rpb259XG4gIFxuICAvLyBCdWlsZCBXUF9RdWVyeSBhcmd1bWVudHNcbiAgJHdwX3F1ZXJ5X2FyZ3MgPSBbXG4gICAgJ3Bvc3RfdHlwZScgICAgICA9PiAkcXVlcnlfYXJnc1sncG9zdF90eXBlJ10gPz8gJyR7Y29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBjb25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0J30nLFxuICAgICdwb3N0c19wZXJfcGFnZScgPT4gJHF1ZXJ5X2FyZ3NbJ3Bvc3RzX3Blcl9wYWdlJ10gPz8gJHtjb25maWcubWF4SXRlbXMgfHwgNn0sXG4gICAgJ29yZGVyYnknICAgICAgICA9PiAkcXVlcnlfYXJnc1snb3JkZXJieSddID8/ICdkYXRlJyxcbiAgICAnb3JkZXInICAgICAgICAgID0+ICRxdWVyeV9hcmdzWydvcmRlciddID8/ICdERVNDJyxcbiAgICAncG9zdF9zdGF0dXMnICAgID0+ICdwdWJsaXNoJywke3BhZ2VkQXJnfVxuICBdO1xuICBcbiAgLy8gRXhjbHVkZSB0aGUgY3VycmVudCBwb3N0IHRvIHByZXZlbnQgc2VsZi1yZWZlcmVuY2VcbiAgJGN1cnJlbnRfcG9zdF9pZCA9IGdldF90aGVfSUQoKTtcbiAgaWYgKCRjdXJyZW50X3Bvc3RfaWQpIHtcbiAgICAkd3BfcXVlcnlfYXJnc1sncG9zdF9fbm90X2luJ10gPSBbJGN1cnJlbnRfcG9zdF9pZF07XG4gIH1cbiAgXG4gIC8vIEFkZCB0YXhvbm9teSBxdWVyaWVzIGlmIHByZXNlbnRcbiAgaWYgKCFlbXB0eSgkcXVlcnlfYXJnc1sndGF4X3F1ZXJ5J10pKSB7XG4gICAgJHdwX3F1ZXJ5X2FyZ3NbJ3RheF9xdWVyeSddID0gYXJyYXlfbWFwKGZ1bmN0aW9uKCR0cSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgJ3RheG9ub215JyA9PiAkdHFbJ3RheG9ub215J10gPz8gJycsXG4gICAgICAgICdmaWVsZCcgICAgPT4gJHRxWydmaWVsZCddID8/ICd0ZXJtX2lkJyxcbiAgICAgICAgJ3Rlcm1zJyAgICA9PiAkdHFbJ3Rlcm1zJ10gPz8gW10sXG4gICAgICAgICdvcGVyYXRvcicgPT4gJHRxWydvcGVyYXRvciddID8/ICdJTicsXG4gICAgICBdO1xuICAgIH0sICRxdWVyeV9hcmdzWyd0YXhfcXVlcnknXSk7XG4gIH1cbiAgXG4gICRxdWVyeSA9IG5ldyBXUF9RdWVyeSgkd3BfcXVlcnlfYXJncyk7XG4gIFxuICAvLyBNYXAgcG9zdHMgdG8gdGVtcGxhdGUgc3RydWN0dXJlXG4gICQke2F0dHJOYW1lfSA9IFtdO1xuICBpZiAoJHF1ZXJ5LT5oYXZlX3Bvc3RzKCkgJiYgZnVuY3Rpb25fZXhpc3RzKCdoYW5kb2ZmX21hcF9wb3N0X3RvX2l0ZW0nKSkge1xuICAgIGZvcmVhY2ggKCRxdWVyeS0+cG9zdHMgYXMgJHBvc3QpIHtcbiAgICAgICQke2F0dHJOYW1lfVtdID0gaGFuZG9mZl9tYXBfcG9zdF90b19pdGVtKCRwb3N0LT5JRCwgJGZpZWxkX21hcHBpbmcpO1xuICAgIH1cbiAgfVxuICAvLyBBcHBseSBpdGVtIG92ZXJyaWRlcyAoZS5nLiBjYXJkIHR5cGUgZm9yIGFsbCBpdGVtcykgZnJvbSBBZHZhbmNlZCBvcHRpb25zXG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH0ke3BhZ2luYXRpb25CbG9ja31cbiAgd3BfcmVzZXRfcG9zdGRhdGEoKTtcbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNlbGVjdCBwb3N0cyBtb2RlIHdpdGggZmllbGQgbWFwcGluZ1xuICAgICAgcmV0dXJuIGBcbi8vIER5bmFtaWMgYXJyYXk6ICR7ZmllbGROYW1lfSAoc2VsZWN0IHBvc3RzICsgbWFwcGVkIG1vZGUpXG4kJHthdHRyTmFtZX1fc291cmNlID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U291cmNlJ10gPz8gJ3F1ZXJ5Jzske3BhZ2luYXRpb25Jbml0fVxuXG5pZiAoJCR7YXR0ck5hbWV9X3NvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgJHNlbGVjdGVkX3Bvc3RzID0gJGF0dHJpYnV0ZXNbJyR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyddID8/IFtdO1xuICAkZmllbGRfbWFwcGluZyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUZpZWxkTWFwcGluZyddID8/ICR7bWFwcGluZ1BocH07XG4ke2xvYWRSZXNvbHZlcn1cbiAgXG4gIGlmICghZW1wdHkoJHNlbGVjdGVkX3Bvc3RzKSAmJiBmdW5jdGlvbl9leGlzdHMoJ2hhbmRvZmZfcXVlcnlfYW5kX21hcF9wb3N0cycpKSB7XG4gICAgJCR7YXR0ck5hbWV9ID0gaGFuZG9mZl9xdWVyeV9hbmRfbWFwX3Bvc3RzKCRzZWxlY3RlZF9wb3N0cywgJGZpZWxkX21hcHBpbmcpO1xuICB9IGVsc2Uge1xuICAgICQke2F0dHJOYW1lfSA9IFtdO1xuICB9XG4gICRpdGVtX292ZXJyaWRlcyA9ICRhdHRyaWJ1dGVzWycke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMnXSA/PyBbXTtcbiAgaWYgKCFlbXB0eSgkaXRlbV9vdmVycmlkZXMpICYmIGZ1bmN0aW9uX2V4aXN0cygnaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcycpKSB7XG4gICAgZm9yZWFjaCAoJCR7YXR0ck5hbWV9IGFzICRpID0+ICRpdGVtKSB7XG4gICAgICAkJHthdHRyTmFtZX1bJGldID0gaGFuZG9mZl9hcHBseV9pdGVtX292ZXJyaWRlcygkaXRlbSwgJGl0ZW1fb3ZlcnJpZGVzKTtcbiAgICB9XG4gIH1cbn1cbi8vIGVsc2U6IE1hbnVhbCBtb2RlIHVzZXMgJCR7YXR0ck5hbWV9IGRpcmVjdGx5IGZyb20gYXR0cmlidXRlIGV4dHJhY3Rpb25cbmA7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIHJlbmRlci5waHAgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICovXG5jb25zdCBnZW5lcmF0ZVJlbmRlclBocCA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgaGFzT3ZlcmxheSA9IGNvbXBvbmVudC5jb2RlLmluY2x1ZGVzKCdvdmVybGF5Jyk7XG5cbiAgLy8gT25seSB0aGUgaW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCB1c2VzICRjb250ZW50IChJbm5lckJsb2Nrcyk7XG4gIC8vIG90aGVyIHJpY2h0ZXh0IGZpZWxkcyBhcmUgcmVuZGVyZWQgZnJvbSB0aGVpciBzdHJpbmcgYXR0cmlidXRlcy5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAoaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKGlubmVyQmxvY2tzRmllbGQpO1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGF0dHJpYnV0ZUV4dHJhY3Rpb24gPSBnZW5lcmF0ZUF0dHJpYnV0ZUV4dHJhY3Rpb24oY29tcG9uZW50LnByb3BlcnRpZXMsIGhhc092ZXJsYXksIGlubmVyQmxvY2tzRmllbGQpO1xuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChjb21wb25lbnQuY29kZSwgY29tcG9uZW50LnByb3BlcnRpZXMsIHJpY2h0ZXh0UHJvcHMpO1xuICBcbiAgLy8gR2VuZXJhdGUgZHluYW1pYyBhcnJheSBleHRyYWN0aW9uIGNvZGVcbiAgY29uc3QgZHluYW1pY0FycmF5RXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBjb21wb25lbnQucHJvcGVydGllc1tmaWVsZE5hbWVdO1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gZmllbGRQcm9wPy5pdGVtcz8ucHJvcGVydGllcztcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgYXR0ck5hbWUsIGNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkeW5hbWljQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIGF0dHJOYW1lLCBjb25maWcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgZHluYW1pY0FycmF5Q29kZSA9IGR5bmFtaWNBcnJheUV4dHJhY3Rpb25zLmpvaW4oJ1xcbicpO1xuICBcbiAgLy8gV3JhcCB0aGUgdGVtcGxhdGUgd2l0aCBibG9jayB3cmFwcGVyIGZvciBhbGlnbm1lbnQgc3VwcG9ydFxuICBjb25zdCB3cmFwcGVkVGVtcGxhdGUgPSB3cmFwV2l0aEJsb2NrV3JhcHBlcih0ZW1wbGF0ZVBocCwgY29tcG9uZW50LmlkKTtcbiAgXG4gIHJldHVybiBgPD9waHBcbi8qKlxuICogU2VydmVyLXNpZGUgcmVuZGVyaW5nIGZvciAke2NvbXBvbmVudC50aXRsZX1cbiAqXG4gKiBAcGFyYW0gYXJyYXkgICAgJGF0dHJpYnV0ZXMgQmxvY2sgYXR0cmlidXRlcy5cbiAqIEBwYXJhbSBzdHJpbmcgICAkY29udGVudCAgICBCbG9jayBkZWZhdWx0IGNvbnRlbnQuXG4gKiBAcGFyYW0gV1BfQmxvY2sgJGJsb2NrICAgICAgQmxvY2sgaW5zdGFuY2UuXG4gKiBAcmV0dXJuIHN0cmluZyBSZXR1cm5zIHRoZSBibG9jayBtYXJrdXAuXG4gKi9cblxuaWYgKCFkZWZpbmVkKCdBQlNQQVRIJykpIHtcbiAgZXhpdDtcbn1cblxuaWYgKCFpc3NldCgkYXR0cmlidXRlcykpIHtcbiAgJGF0dHJpYnV0ZXMgPSBbXTtcbn1cblxuLy8gRXh0cmFjdCBhdHRyaWJ1dGVzIHdpdGggZGVmYXVsdHNcbiR7YXR0cmlidXRlRXh0cmFjdGlvbn1cbiR7ZHluYW1pY0FycmF5Q29kZX1cbj8+XG4ke3dyYXBwZWRUZW1wbGF0ZX1cbmA7XG59O1xuXG5leHBvcnQge1xuICBnZW5lcmF0ZVJlbmRlclBocCxcbiAgaGFuZGxlYmFyc1RvUGhwLFxuICBhcnJheVRvUGhwLFxuICBnZXRQaHBEZWZhdWx0VmFsdWUsXG4gIGdlbmVyYXRlQXR0cmlidXRlRXh0cmFjdGlvbixcbiAgZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uLFxuICBnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24sXG4gIGJ1aWxkUmVzaGFwZVBocCxcbiAgYnVpbGRSZXNoYXBlSnMsXG59O1xuIl19