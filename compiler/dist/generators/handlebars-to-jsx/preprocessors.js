"use strict";
/**
 * Template preprocessing utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessBlocks = exports.cleanTemplate = exports.preprocessFields = void 0;
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
const field_lookup_1 = require("./field-lookup");
const attributes_1 = require("./attributes");
/** Supported inline-editable field types */
const INLINE_EDITABLE_TYPES = new Set(['text', 'richtext', 'image', 'link', 'button']);
/**
 * Preprocess {{#field "path"}}content{{/field}} into field markers
 * These will be converted to RichText/Image/LinkControl components in postprocessing
 * Only creates markers for supported field types that are NOT inside attribute values
 */
const preprocessFields = (template, properties) => {
    let result = template ?? '';
    const inlineEditableFields = new Set();
    // Match {{#field "path"}} or {{#field path}} opening tags, then use
    // nesting-aware matching to find the correct closing {{/field}}.
    const fieldOpenRegex = /\{\{\s*#field\s+["']?([^"'\}]+)["']?\s*\}\}/g;
    let match;
    while ((match = fieldOpenRegex.exec(result)) !== null) {
        const fieldPath = match[1].trim();
        const startPos = match.index;
        const openTagEnd = startPos + match[0].length;
        // Use nesting-aware matching to handle nested {{#field}} blocks
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#field', '{{/field}}', openTagEnd);
        if (closePos === -1)
            continue;
        const content = result.substring(openTagEnd, closePos);
        const fullMatchEnd = closePos + '{{/field}}'.length;
        // Skip fields that are inside attribute values (like href, src, etc.)
        if ((0, utils_1.isInsideAttribute)(result, startPos)) {
            result = result.substring(0, startPos) + content + result.substring(fullMatchEnd);
            fieldOpenRegex.lastIndex = startPos + content.length;
            continue;
        }
        // Pagination-related field paths are metadata annotations, not editable fields.
        if (fieldPath.includes('.pagination') || fieldPath.startsWith('pagination.')) {
            result = result.substring(0, startPos) + content + result.substring(fullMatchEnd);
            fieldOpenRegex.lastIndex = startPos + content.length;
            continue;
        }
        const fieldType = (0, field_lookup_1.lookupFieldType)(fieldPath, properties);
        if (fieldType && INLINE_EDITABLE_TYPES.has(fieldType)) {
            const fieldInfo = Buffer.from(JSON.stringify({
                path: fieldPath,
                type: fieldType,
                content: content.trim()
            })).toString('base64');
            const replacement = `<editable-field-marker data-field="${fieldInfo}"></editable-field-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(fullMatchEnd);
            fieldOpenRegex.lastIndex = startPos + replacement.length;
            const topLevelKey = fieldPath.split('.')[0];
            inlineEditableFields.add(topLevelKey);
        }
        else {
            result = result.substring(0, startPos) + content + result.substring(fullMatchEnd);
            fieldOpenRegex.lastIndex = startPos + content.length;
        }
    }
    return { template: result, inlineEditableFields };
};
exports.preprocessFields = preprocessFields;
/**
 * Clean and preprocess the Handlebars template
 * @param currentLoopArray - When processing loop inner content, pass the array name so attribute conditionals (e.g. {{#unless @last}}) get the correct array name
 */
const cleanTemplate = (template, currentLoopArray) => {
    let cleaned = template ?? '';
    // Remove HTML/body wrapper
    cleaned = cleaned.replace(/<html>[\s\S]*?<body[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/body>[\s\S]*?<\/html>/gi, '');
    cleaned = cleaned.replace(/<head>[\s\S]*?<\/head>/gi, '');
    // Remove {{{style}}} and {{{script}}} helpers
    cleaned = cleaned.replace(/\{\{\{?style\}\}\}?/g, '');
    cleaned = cleaned.replace(/\{\{\{?script\}\}\}?/g, '');
    // Note: {{#field}} blocks are now handled by preprocessFields, not stripped here
    // Just clean up any remaining field tags that weren't processed
    cleaned = cleaned.replace(/\{\{\s*#field\s+[^}]+\}\}/g, '');
    cleaned = cleaned.replace(/\{\{\s*\/field\s*\}\}/g, '');
    // Remove {{!-- comments --}}
    cleaned = cleaned.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
    cleaned = cleaned.replace(/\{\{![\s\S]*?\}\}/g, '');
    // Normalize @root. references inside Handlebars expressions to root-level access.
    // In standard Handlebars, @root refers to the top-level data context regardless of
    // nesting depth, so @root.properties.xxx is equivalent to properties.xxx at the root.
    // We only replace inside {{...}} to avoid touching unrelated text content.
    cleaned = cleaned.replace(/\{\{[\s\S]*?\}\}/g, (match) => match.replace(/@root\./g, ''));
    // Run attribute conditionals BEFORE preprocessBlocks so {{#if}} etc. inside attribute values (e.g. className="x {{#if prop}}y{{/if}}") get converted to template literals instead of becoming raw <if-marker> tags inside the attribute.
    cleaned = (0, attributes_1.preprocessAttributeConditionals)(cleaned, currentLoopArray);
    // When processing the full template (no currentLoopArray), run preprocessBlocks so {{#each}} become markers and block-level {{#if}} become if-markers. Attributes have already been converted so they won't contain markers.
    if (currentLoopArray === undefined) {
        cleaned = (0, exports.preprocessBlocks)(cleaned);
    }
    return cleaned.trim();
};
exports.cleanTemplate = cleanTemplate;
/**
 * Helper function to process if blocks with optional else/else-if
 */
const processIfBlock = (condition, inner, startPos, fullMatch) => {
    // Find top-level {{else if ...}} or {{else}} in the inner content
    // We need to track nesting depth to only find the ones that belong to this if block
    let depth = 0;
    let searchPos = 0;
    let foundElse = null;
    while (searchPos < inner.length) {
        const nextIf = inner.indexOf('{{#if', searchPos);
        const nextElseIf = inner.indexOf('{{else if', searchPos);
        const nextElse = inner.indexOf('{{else}}', searchPos);
        const nextEndIf = inner.indexOf('{{/if}}', searchPos);
        // Find the earliest occurrence
        const positions = [];
        if (nextIf !== -1)
            positions.push({ type: 'if', pos: nextIf });
        if (nextElseIf !== -1)
            positions.push({ type: 'elseif', pos: nextElseIf });
        if (nextElse !== -1)
            positions.push({ type: 'else', pos: nextElse });
        if (nextEndIf !== -1)
            positions.push({ type: 'endif', pos: nextEndIf });
        positions.sort((a, b) => a.pos - b.pos);
        if (positions.length === 0)
            break;
        const first = positions[0];
        if (first.type === 'if') {
            depth++;
            searchPos = first.pos + 5;
        }
        else if (first.type === 'endif') {
            depth--;
            searchPos = first.pos + 7;
        }
        else if (first.type === 'elseif' && depth === 0) {
            // Found {{else if ...}} at top level
            // Extract the condition from {{else if CONDITION}}
            const elseIfMatch = inner.substring(first.pos).match(/^\{\{else\s+if\s+([^}]+)\}\}/);
            if (elseIfMatch) {
                foundElse = {
                    type: 'elseif',
                    pos: first.pos,
                    condition: elseIfMatch[1].trim(),
                    length: elseIfMatch[0].length
                };
            }
            break;
        }
        else if (first.type === 'else' && depth === 0) {
            // Found {{else}} at top level
            foundElse = {
                type: 'else',
                pos: first.pos,
                length: '{{else}}'.length
            };
            break;
        }
        else {
            searchPos = first.pos + 8;
        }
    }
    const condEscaped = Buffer.from(condition.trim()).toString('base64');
    if (foundElse) {
        // Split into if content and remaining content
        const ifContent = inner.substring(0, foundElse.pos);
        const remainingContent = inner.substring(foundElse.pos + foundElse.length);
        const ifEscaped = Buffer.from(ifContent).toString('base64');
        if (foundElse.type === 'elseif' && foundElse.condition) {
            // Parse the else-if condition (might be a helper expression)
            let elseIfCondition = foundElse.condition;
            // Check if it's a helper expression like (eq ...)
            if (elseIfCondition.startsWith('(')) {
                const parsed = (0, expression_parser_1.parseHelperExpression)(elseIfCondition);
                if (parsed) {
                    elseIfCondition = parsed;
                }
            }
            else if (elseIfCondition.startsWith('properties.')) {
                // Simple property check
                elseIfCondition = (0, utils_1.toCamelCase)(elseIfCondition.replace('properties.', ''));
            }
            else if (elseIfCondition.startsWith('this.')) {
                elseIfCondition = `item.${elseIfCondition.replace('this.', '')}`;
            }
            else {
                // Bare identifier/path — normalize to properties.xxx so transpileExpression handles camelCase + optional chaining
                elseIfCondition = `properties.${elseIfCondition}`;
            }
            // Recursively process the remaining content as if it were an if block
            // This will handle nested else-if chains and the final else
            const nestedMarker = processIfBlock(elseIfCondition, remainingContent, 0, '');
            const nestedMarkerEscaped = Buffer.from(nestedMarker).toString('base64');
            return `<if-elseif-marker data-condition="${condEscaped}" data-if-content="${ifEscaped}" data-nested-marker="${nestedMarkerEscaped}"></if-elseif-marker>`;
        }
        else {
            // Plain else
            const elseEscaped = Buffer.from(remainingContent).toString('base64');
            return `<if-else-marker data-condition="${condEscaped}" data-if-content="${ifEscaped}" data-else-content="${elseEscaped}"></if-else-marker>`;
        }
    }
    else {
        // No else, just if content
        const escaped = Buffer.from(inner).toString('base64');
        return `<if-marker data-condition="${condEscaped}" data-content="${escaped}"></if-marker>`;
    }
};
/**
 * Pre-process template to handle block helpers before HTML parsing
 * Uses iterative approach to handle nested blocks properly
 * @param template - Template string
 * @param currentLoopArray - When processing inner content of {{#each properties.xxx}}, pass the array name (e.g. "ctas") so {{#unless @last}} markers get data-array for correct expansion at replace time
 */
const preprocessBlocks = (template, currentLoopArray) => {
    let result = template;
    // Process {{#each properties.xxx.yyy as |alias|}} or {{#each properties.xxx as |alias index|}} blocks with named alias FIRST
    // Now handles nested paths like properties.jumpNav.links
    let eachMatch;
    // Updated regex to capture nested paths (e.g., jumpNav.links) and handle both |alias| and |alias index| patterns
    const eachAliasRegex = /\{\{#each\s+properties\.([\w.]+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g;
    while ((eachMatch = eachAliasRegex.exec(result)) !== null) {
        const startPos = eachMatch.index;
        const openTagEnd = startPos + eachMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#each', '{{/each}}', openTagEnd);
        if (closePos !== -1) {
            const propPath = eachMatch[1]; // e.g., "jumpNav.links" or just "items"
            const aliasName = eachMatch[2];
            const inner = result.substring(openTagEnd, closePos);
            // Convert the path to camelCase for each segment
            const camelPath = propPath.split('.').map(segment => (0, utils_1.toCamelCase)(segment)).join('.');
            const escaped = Buffer.from(inner).toString('base64');
            // Include alias in the marker for later reference replacement
            // data-prop now contains the full path (e.g., "jumpNav.links")
            const replacement = `<loop-marker data-prop="${camelPath}" data-type="properties" data-alias="${aliasName}" data-content="${escaped}"></loop-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/each}}'.length);
            eachAliasRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#each properties.xxx}} or {{#each properties.xxx.yyy}} blocks without alias
    // Now handles nested paths like properties.jumpNav.links
    const eachPropsRegex = /\{\{#each\s+properties\.([\w.]+)\s*\}\}/g;
    while ((eachMatch = eachPropsRegex.exec(result)) !== null) {
        const startPos = eachMatch.index;
        const openTagEnd = startPos + eachMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#each', '{{/each}}', openTagEnd);
        if (closePos !== -1) {
            const propPath = eachMatch[1]; // e.g., "jumpNav.links" or just "items"
            const inner = result.substring(openTagEnd, closePos);
            // Convert the path to camelCase for each segment
            const camelPath = propPath.split('.').map(segment => (0, utils_1.toCamelCase)(segment)).join('.');
            const escaped = Buffer.from(inner).toString('base64');
            const replacement = `<loop-marker data-prop="${camelPath}" data-type="properties" data-content="${escaped}"></loop-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/each}}'.length);
            eachPropsRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#each this.xxx as |alias|}} blocks (nested loops with alias inside parent loops) FIRST
    const eachThisAliasRegex = /\{\{#each\s+this\.(\w+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g;
    while ((eachMatch = eachThisAliasRegex.exec(result)) !== null) {
        const startPos = eachMatch.index;
        const openTagEnd = startPos + eachMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#each', '{{/each}}', openTagEnd);
        if (closePos !== -1) {
            const propName = eachMatch[1];
            const aliasName = eachMatch[2];
            const inner = result.substring(openTagEnd, closePos);
            const escaped = Buffer.from(inner).toString('base64');
            // Include alias in the nested-loop-marker for reference replacement
            const replacement = `<nested-loop-marker data-prop="${propName}" data-alias="${aliasName}" data-content="${escaped}"></nested-loop-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/each}}'.length);
            eachThisAliasRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#each this.xxx}} blocks without alias (nested loops inside parent loops)
    const eachThisRegex = /\{\{#each\s+this\.(\w+)\s*\}\}/g;
    while ((eachMatch = eachThisRegex.exec(result)) !== null) {
        const startPos = eachMatch.index;
        const openTagEnd = startPos + eachMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#each', '{{/each}}', openTagEnd);
        if (closePos !== -1) {
            const propName = eachMatch[1];
            const inner = result.substring(openTagEnd, closePos);
            const escaped = Buffer.from(inner).toString('base64');
            const replacement = `<nested-loop-marker data-prop="${propName}" data-content="${escaped}"></nested-loop-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/each}}'.length);
            eachThisRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#unless @last}} blocks (optionally embed current loop array for correct expansion when marker is replaced without loop context)
    // Skip when inside an attribute value (e.g. class="...{{#unless @last}}...") so convertAttributeValue can convert it with the correct loopArray
    const unlessLastRegex = /\{\{#unless\s+@last\}\}/g;
    let unlessMatch;
    const dataArrayAttr = currentLoopArray ? ` data-array="${currentLoopArray}"` : '';
    while ((unlessMatch = unlessLastRegex.exec(result)) !== null) {
        const startPos = unlessMatch.index;
        if ((0, utils_1.isInsideAttribute)(result, startPos))
            continue;
        const openTagEnd = startPos + unlessMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#unless', '{{/unless}}', openTagEnd);
        if (closePos !== -1) {
            const inner = result.substring(openTagEnd, closePos);
            const escaped = Buffer.from(inner).toString('base64');
            const replacement = `<unless-last-marker data-content="${escaped}"${dataArrayAttr}></unless-last-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/unless}}'.length);
            unlessLastRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#unless @first}} blocks
    const unlessFirstRegex = /\{\{#unless\s+@first\}\}/g;
    while ((unlessMatch = unlessFirstRegex.exec(result)) !== null) {
        const startPos = unlessMatch.index;
        const openTagEnd = startPos + unlessMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#unless', '{{/unless}}', openTagEnd);
        if (closePos !== -1) {
            const inner = result.substring(openTagEnd, closePos);
            const escaped = Buffer.from(inner).toString('base64');
            const replacement = `<unless-first-marker data-content="${escaped}"></unless-first-marker>`;
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/unless}}'.length);
            unlessFirstRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#if (eq/ne/gt/lt/etc ...)}} blocks with helper expressions FIRST
    const ifHelperRegex = /\{\{#if\s+(\([^)]+\))\s*\}\}/g;
    let ifHelperMatch;
    while ((ifHelperMatch = ifHelperRegex.exec(result)) !== null) {
        const startPos = ifHelperMatch.index;
        const openTagEnd = startPos + ifHelperMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#if', '{{/if}}', openTagEnd);
        if (closePos !== -1) {
            const helperExpr = ifHelperMatch[1];
            const parsedCondition = (0, expression_parser_1.parseHelperExpression)(helperExpr);
            // Use the parsed condition or fall back to the original if parsing failed
            const condition = parsedCondition || helperExpr;
            const inner = result.substring(openTagEnd, closePos);
            const replacement = processIfBlock(condition, inner, startPos, ifHelperMatch[0]);
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
            ifHelperRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#unless (eq/ne/gt/lt/etc ...)}} blocks with helper expressions
    // Reuse processIfBlock with a negated condition: !(parsedCondition)
    const unlessHelperRegex = /\{\{#unless\s+(\([^)]+\))\s*\}\}/g;
    let unlessHelperMatch;
    while ((unlessHelperMatch = unlessHelperRegex.exec(result)) !== null) {
        const startPos = unlessHelperMatch.index;
        const openTagEnd = startPos + unlessHelperMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#unless', '{{/unless}}', openTagEnd);
        if (closePos !== -1) {
            const helperExpr = unlessHelperMatch[1];
            const parsedCondition = (0, expression_parser_1.parseHelperExpression)(helperExpr);
            const condition = parsedCondition || helperExpr;
            const negated = `!(${condition})`;
            const inner = result.substring(openTagEnd, closePos);
            const replacement = processIfBlock(negated, inner, startPos, unlessHelperMatch[0]);
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/unless}}'.length);
            unlessHelperRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#unless properties.xxx}} blocks (negation of if)
    const unlessPropsRegex = /\{\{#unless\s+(properties\.[^}]+)\}\}/g;
    let unlessPropsMatch;
    while ((unlessPropsMatch = unlessPropsRegex.exec(result)) !== null) {
        const startPos = unlessPropsMatch.index;
        const openTagEnd = startPos + unlessPropsMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#unless', '{{/unless}}', openTagEnd);
        if (closePos !== -1) {
            const condition = unlessPropsMatch[1];
            // Store a transpile-friendly negated condition (not raw properties.xxx inside parens)
            const negated = condition.startsWith('properties.')
                ? `!${(0, expression_parser_1.transpileExpression)(condition, { properties: {}, indent: '', inLoop: false })}`
                : `!(${condition})`;
            const inner = result.substring(openTagEnd, closePos);
            const replacement = processIfBlock(negated, inner, startPos, unlessPropsMatch[0]);
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/unless}}'.length);
            unlessPropsRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Process {{#if this.xxx}} blocks (conditionals on loop item properties)
    const ifThisRegex = /\{\{#if\s+(this\.[^}]+)\}\}/g;
    let ifThisMatch;
    while ((ifThisMatch = ifThisRegex.exec(result)) !== null) {
        const startPos = ifThisMatch.index;
        const openTagEnd = startPos + ifThisMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#if', '{{/if}}', openTagEnd);
        if (closePos !== -1) {
            const condition = ifThisMatch[1];
            const inner = result.substring(openTagEnd, closePos);
            const replacement = processIfBlock(condition, inner, startPos, ifThisMatch[0]);
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
            ifThisRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Normalize {{#if ../properties.xxx}} to {{#if properties.xxx}} (parent context in loops)
    result = result.replace(/\{\{#if\s+\.\.\/+(properties\.[^}]+)\}\}/g, '{{#if $1}}');
    // Process {{#if properties.xxx}} blocks (conditionals on top-level properties)
    const ifPropsRegex = /\{\{#if\s+(properties\.[^}]+)\}\}/g;
    let ifPropsMatch;
    while ((ifPropsMatch = ifPropsRegex.exec(result)) !== null) {
        const startPos = ifPropsMatch.index;
        const openTagEnd = startPos + ifPropsMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#if', '{{/if}}', openTagEnd);
        if (closePos !== -1) {
            const condition = ifPropsMatch[1];
            const inner = result.substring(openTagEnd, closePos);
            const replacement = processIfBlock(condition, inner, startPos, ifPropsMatch[0]);
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
            ifPropsRegex.lastIndex = startPos + replacement.length;
        }
    }
    // Catch-all: Process any remaining {{#if xxx}} blocks not matched by the specific patterns above
    const ifGenericRegex = /\{\{#if\s+([^}]+)\}\}/g;
    let ifGenericMatch;
    while ((ifGenericMatch = ifGenericRegex.exec(result)) !== null) {
        const startPos = ifGenericMatch.index;
        const openTagEnd = startPos + ifGenericMatch[0].length;
        const closePos = (0, utils_1.findMatchingClose)(result, '{{#if', '{{/if}}', openTagEnd);
        if (closePos !== -1) {
            let condition = ifGenericMatch[1].trim();
            // Bare identifiers/paths — normalize to properties.xxx so transpileExpression handles camelCase + optional chaining
            if (!condition.startsWith('(') && !condition.startsWith('properties.') && !condition.startsWith('this.')) {
                condition = `properties.${condition}`;
            }
            const inner = result.substring(openTagEnd, closePos);
            const replacement = processIfBlock(condition, inner, startPos, ifGenericMatch[0]);
            result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
            ifGenericRegex.lastIndex = startPos + replacement.length;
        }
    }
    return result;
};
exports.preprocessBlocks = preprocessBlocks;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcHJvY2Vzc29ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L3ByZXByb2Nlc3NvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFHSCxtQ0FBNEU7QUFDNUUsMkRBQWlGO0FBQ2pGLGlEQUFpRDtBQUNqRCw2Q0FBK0Q7QUFFL0QsNENBQTRDO0FBQzVDLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztBQVF2Rjs7OztHQUlHO0FBQ0ksTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsVUFBMkMsRUFBMEIsRUFBRTtJQUN4SCxJQUFJLE1BQU0sR0FBRyxRQUFRLElBQUksRUFBRSxDQUFDO0lBQzVCLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUUvQyxvRUFBb0U7SUFDcEUsaUVBQWlFO0lBQ2pFLE1BQU0sY0FBYyxHQUFHLDhDQUE4QyxDQUFDO0lBRXRFLElBQUksS0FBSyxDQUFDO0lBQ1YsT0FBTyxDQUFDLEtBQUssR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDN0IsTUFBTSxVQUFVLEdBQUcsUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFFOUMsZ0VBQWdFO1FBQ2hFLE1BQU0sUUFBUSxHQUFHLElBQUEseUJBQWlCLEVBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsVUFBVSxD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Q0FBQyxFQUFFLENBQUM7WUFDcEIsSUFBSSxTQUFTLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3pDLG9IQUFvSDtZQUNwSCxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ3pHLFNBQVMsR0FBRyxjQUFjLFNBQVMsRUFBRSxDQUFDO1lBQ3hDLENBQUM7WUFDRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNyRCxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFbEYsTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLFdBQVcsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDckcsY0FBYyxDQUFDLFNBQVMsR0FBRyxRQUFRLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztRQUMzRCxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQTdQVyxRQUFBLGdCQUFnQixvQkE2UDNCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUZW1wbGF0ZSBwcmVwcm9jZXNzaW5nIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmUHJvcGVydHkgfSBmcm9tICcuLi8uLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSwgZmluZE1hdGNoaW5nQ2xvc2UsIGlzSW5zaWRlQXR0cmlidXRlIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBwYXJzZUhlbHBlckV4cHJlc3Npb24sIHRyYW5zcGlsZUV4cHJlc3Npb24gfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcbmltcG9ydCB7IGxvb2t1cEZpZWxkVHlwZSB9IGZyb20gJy4vZmllbGQtbG9va3VwJztcbmltcG9ydCB7IHByZXByb2Nlc3NBdHRyaWJ1dGVDb25kaXRpb25hbHMgfSBmcm9tICcuL2F0dHJpYnV0ZXMnO1xuXG4vKiogU3VwcG9ydGVkIGlubGluZS1lZGl0YWJsZSBmaWVsZCB0eXBlcyAqL1xuY29uc3QgSU5MSU5FX0VESVRBQkxFX1RZUEVTID0gbmV3IFNldChbJ3RleHQnLCAncmljaHRleHQnLCAnaW1hZ2UnLCAnbGluaycsICdidXR0b24nXSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcHJvY2Vzc0ZpZWxkc1Jlc3VsdCB7XG4gIHRlbXBsYXRlOiBzdHJpbmc7XG4gIC8qKiBGaWVsZCBwYXRocyB0aGF0IHdlcmUgY29udmVydGVkIHRvIGlubGluZS1lZGl0YWJsZSBtYXJrZXJzICovXG4gIGlubGluZUVkaXRhYmxlRmllbGRzOiBTZXQ8c3RyaW5nPjtcbn1cblxuLyoqXG4gKiBQcmVwcm9jZXNzIHt7I2ZpZWxkIFwicGF0aFwifX1jb250ZW50e3svZmllbGR9fSBpbnRvIGZpZWxkIG1hcmtlcnNcbiAqIFRoZXNlIHdpbGwgYmUgY29udmVydGVkIHRvIFJpY2hUZXh0L0ltYWdlL0xpbmtDb250cm9sIGNvbXBvbmVudHMgaW4gcG9zdHByb2Nlc3NpbmdcbiAqIE9ubHkgY3JlYXRlcyBtYXJrZXJzIGZvciBzdXBwb3J0ZWQgZmllbGQgdHlwZXMgdGhhdCBhcmUgTk9UIGluc2lkZSBhdHRyaWJ1dGUgdmFsdWVzXG4gKi9cbmV4cG9ydCBjb25zdCBwcmVwcm9jZXNzRmllbGRzID0gKHRlbXBsYXRlOiBzdHJpbmcsIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBQcmVwcm9jZXNzRmllbGRzUmVzdWx0ID0+IHtcbiAgbGV0IHJlc3VsdCA9IHRlbXBsYXRlID8/ICcnO1xuICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBcbiAgLy8gTWF0Y2gge3sjZmllbGQgXCJwYXRoXCJ9fSBvciB7eyNmaWVsZCBwYXRofX0gb3BlbmluZyB0YWdzLCB0aGVuIHVzZVxuICAvLyBuZXN0aW5nLWF3YXJlIG1hdGNoaW5nIHRvIGZpbmQgdGhlIGNvcnJlY3QgY2xvc2luZyB7ey9maWVsZH19LlxuICBjb25zdCBmaWVsZE9wZW5SZWdleCA9IC9cXHtcXHtcXHMqI2ZpZWxkXFxzK1tcIiddPyhbXlwiJ1xcfV0rKVtcIiddP1xccypcXH1cXH0vZztcbiAgXG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IGZpZWxkT3BlblJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBmaWVsZFBhdGggPSBtYXRjaFsxXS50cmltKCk7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyBtYXRjaFswXS5sZW5ndGg7XG4gICAgXG4gICAgLy8gVXNlIG5lc3RpbmctYXdhcmUgbWF0Y2hpbmcgdG8gaGFuZGxlIG5lc3RlZCB7eyNmaWVsZH19IGJsb2Nrc1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjZmllbGQnLCAne3svZmllbGR9fScsIG9wZW5UYWdFbmQpO1xuICAgIGlmIChjbG9zZVBvcyA9PT0gLTEpIGNvbnRpbnVlO1xuICAgIFxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICBjb25zdCBmdWxsTWF0Y2hFbmQgPSBjbG9zZVBvcyArICd7ey9maWVsZH19Jy5sZW5ndGg7XG4gICAgXG4gICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgaW5zaWRlIGF0dHJpYnV0ZSB2YWx1ZXMgKGxpa2UgaHJlZiwgc3JjLCBldGMuKVxuICAgIGlmIChpc0luc2lkZUF0dHJpYnV0ZShyZXN1bHQsIHN0YXJ0UG9zKSkge1xuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyBjb250ZW50ICsgcmVzdWx0LnN1YnN0cmluZyhmdWxsTWF0Y2hFbmQpO1xuICAgICAgZmllbGRPcGVuUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyBjb250ZW50Lmxlbmd0aDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBcbiAgICAvLyBQYWdpbmF0aW9uLXJlbGF0ZWQgZmllbGQgcGF0aHMgYXJlIG1ldGFkYXRhIGFubm90YXRpb25zLCBub3QgZWRpdGFibGUgZmllbGRzLlxuICAgIGlmIChmaWVsZFBhdGguaW5jbHVkZXMoJy5wYWdpbmF0aW9uJykgfHwgZmllbGRQYXRoLnN0YXJ0c1dpdGgoJ3BhZ2luYXRpb24uJykpIHtcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgY29udGVudCArIHJlc3VsdC5zdWJzdHJpbmcoZnVsbE1hdGNoRW5kKTtcbiAgICAgIGZpZWxkT3BlblJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgY29udGVudC5sZW5ndGg7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZmllbGRUeXBlID0gbG9va3VwRmllbGRUeXBlKGZpZWxkUGF0aCwgcHJvcGVydGllcyk7XG4gICAgXG4gICAgaWYgKGZpZWxkVHlwZSAmJiBJTkxJTkVfRURJVEFCTEVfVFlQRVMuaGFzKGZpZWxkVHlwZSkpIHtcbiAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgcGF0aDogZmllbGRQYXRoLFxuICAgICAgICB0eXBlOiBmaWVsZFR5cGUsXG4gICAgICAgIGNvbnRlbnQ6IGNvbnRlbnQudHJpbSgpXG4gICAgICB9KSkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgXG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IGA8ZWRpdGFibGUtZmllbGQtbWFya2VyIGRhdGEtZmllbGQ9XCIke2ZpZWxkSW5mb31cIj48L2VkaXRhYmxlLWZpZWxkLW1hcmtlcj5gO1xuICAgICAgXG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhmdWxsTWF0Y2hFbmQpO1xuICAgICAgZmllbGRPcGVuUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgICBcbiAgICAgIGNvbnN0IHRvcExldmVsS2V5ID0gZmllbGRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICBpbmxpbmVFZGl0YWJsZUZpZWxkcy5hZGQodG9wTGV2ZWxLZXkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIGNvbnRlbnQgKyByZXN1bHQuc3Vic3RyaW5nKGZ1bGxNYXRjaEVuZCk7XG4gICAgICBmaWVsZE9wZW5SZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIGNvbnRlbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHsgdGVtcGxhdGU6IHJlc3VsdCwgaW5saW5lRWRpdGFibGVGaWVsZHMgfTtcbn07XG5cbi8qKlxuICogQ2xlYW4gYW5kIHByZXByb2Nlc3MgdGhlIEhhbmRsZWJhcnMgdGVtcGxhdGVcbiAqIEBwYXJhbSBjdXJyZW50TG9vcEFycmF5IC0gV2hlbiBwcm9jZXNzaW5nIGxvb3AgaW5uZXIgY29udGVudCwgcGFzcyB0aGUgYXJyYXkgbmFtZSBzbyBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIChlLmcuIHt7I3VubGVzcyBAbGFzdH19KSBnZXQgdGhlIGNvcnJlY3QgYXJyYXkgbmFtZVxuICovXG5leHBvcnQgY29uc3QgY2xlYW5UZW1wbGF0ZSA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjdXJyZW50TG9vcEFycmF5Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgbGV0IGNsZWFuZWQgPSB0ZW1wbGF0ZSA/PyAnJztcbiAgXG4gIC8vIFJlbW92ZSBIVE1ML2JvZHkgd3JhcHBlclxuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC88aHRtbD5bXFxzXFxTXSo/PGJvZHlbXj5dKj4vZ2ksICcnKTtcbiAgY2xlYW5lZCA9IGNsZWFuZWQucmVwbGFjZSgvPFxcL2JvZHk+W1xcc1xcU10qPzxcXC9odG1sPi9naSwgJycpO1xuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC88aGVhZD5bXFxzXFxTXSo/PFxcL2hlYWQ+L2dpLCAnJyk7XG4gIFxuICAvLyBSZW1vdmUge3t7c3R5bGV9fX0gYW5kIHt7e3NjcmlwdH19fSBoZWxwZXJzXG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoL1xce1xce1xcez9zdHlsZVxcfVxcfVxcfT8vZywgJycpO1xuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC9cXHtcXHtcXHs/c2NyaXB0XFx9XFx9XFx9Py9nLCAnJyk7XG4gIFxuICAvLyBOb3RlOiB7eyNmaWVsZH19IGJsb2NrcyBhcmUgbm93IGhhbmRsZWQgYnkgcHJlcHJvY2Vzc0ZpZWxkcywgbm90IHN0cmlwcGVkIGhlcmVcbiAgLy8gSnVzdCBjbGVhbiB1cCBhbnkgcmVtYWluaW5nIGZpZWxkIHRhZ3MgdGhhdCB3ZXJlbid0IHByb2Nlc3NlZFxuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC9cXHtcXHtcXHMqI2ZpZWxkXFxzK1tefV0rXFx9XFx9L2csICcnKTtcbiAgY2xlYW5lZCA9IGNsZWFuZWQucmVwbGFjZSgvXFx7XFx7XFxzKlxcL2ZpZWxkXFxzKlxcfVxcfS9nLCAnJyk7XG4gIFxuICAvLyBSZW1vdmUge3shLS0gY29tbWVudHMgLS19fVxuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC9cXHtcXHshLS1bXFxzXFxTXSo/LS1cXH1cXH0vZywgJycpO1xuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC9cXHtcXHshW1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gIFxuICAvLyBOb3JtYWxpemUgQHJvb3QuIHJlZmVyZW5jZXMgaW5zaWRlIEhhbmRsZWJhcnMgZXhwcmVzc2lvbnMgdG8gcm9vdC1sZXZlbCBhY2Nlc3MuXG4gIC8vIEluIHN0YW5kYXJkIEhhbmRsZWJhcnMsIEByb290IHJlZmVycyB0byB0aGUgdG9wLWxldmVsIGRhdGEgY29udGV4dCByZWdhcmRsZXNzIG9mXG4gIC8vIG5lc3RpbmcgZGVwdGgsIHNvIEByb290LnByb3BlcnRpZXMueHh4IGlzIGVxdWl2YWxlbnQgdG8gcHJvcGVydGllcy54eHggYXQgdGhlIHJvb3QuXG4gIC8vIFdlIG9ubHkgcmVwbGFjZSBpbnNpZGUge3suLi59fSB0byBhdm9pZCB0b3VjaGluZyB1bnJlbGF0ZWQgdGV4dCBjb250ZW50LlxuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC9cXHtcXHtbXFxzXFxTXSo/XFx9XFx9L2csIChtYXRjaCkgPT4gbWF0Y2gucmVwbGFjZSgvQHJvb3RcXC4vZywgJycpKTtcbiAgXG4gIC8vIFJ1biBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIEJFRk9SRSBwcmVwcm9jZXNzQmxvY2tzIHNvIHt7I2lmfX0gZXRjLiBpbnNpZGUgYXR0cmlidXRlIHZhbHVlcyAoZS5nLiBjbGFzc05hbWU9XCJ4IHt7I2lmIHByb3B9fXl7ey9pZn19XCIpIGdldCBjb252ZXJ0ZWQgdG8gdGVtcGxhdGUgbGl0ZXJhbHMgaW5zdGVhZCBvZiBiZWNvbWluZyByYXcgPGlmLW1hcmtlcj4gdGFncyBpbnNpZGUgdGhlIGF0dHJpYnV0ZS5cbiAgY2xlYW5lZCA9IHByZXByb2Nlc3NBdHRyaWJ1dGVDb25kaXRpb25hbHMoY2xlYW5lZCwgY3VycmVudExvb3BBcnJheSk7XG4gIC8vIFdoZW4gcHJvY2Vzc2luZyB0aGUgZnVsbCB0ZW1wbGF0ZSAobm8gY3VycmVudExvb3BBcnJheSksIHJ1biBwcmVwcm9jZXNzQmxvY2tzIHNvIHt7I2VhY2h9fSBiZWNvbWUgbWFya2VycyBhbmQgYmxvY2stbGV2ZWwge3sjaWZ9fSBiZWNvbWUgaWYtbWFya2Vycy4gQXR0cmlidXRlcyBoYXZlIGFscmVhZHkgYmVlbiBjb252ZXJ0ZWQgc28gdGhleSB3b24ndCBjb250YWluIG1hcmtlcnMuXG4gIGlmIChjdXJyZW50TG9vcEFycmF5ID09PSB1bmRlZmluZWQpIHtcbiAgICBjbGVhbmVkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkKTtcbiAgfVxuICBcbiAgcmV0dXJuIGNsZWFuZWQudHJpbSgpO1xufTtcblxuLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb24gdG8gcHJvY2VzcyBpZiBibG9ja3Mgd2l0aCBvcHRpb25hbCBlbHNlL2Vsc2UtaWZcbiAqL1xuY29uc3QgcHJvY2Vzc0lmQmxvY2sgPSAoY29uZGl0aW9uOiBzdHJpbmcsIGlubmVyOiBzdHJpbmcsIHN0YXJ0UG9zOiBudW1iZXIsIGZ1bGxNYXRjaDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gRmluZCB0b3AtbGV2ZWwge3tlbHNlIGlmIC4uLn19IG9yIHt7ZWxzZX19IGluIHRoZSBpbm5lciBjb250ZW50XG4gIC8vIFdlIG5lZWQgdG8gdHJhY2sgbmVzdGluZyBkZXB0aCB0byBvbmx5IGZpbmQgdGhlIG9uZXMgdGhhdCBiZWxvbmcgdG8gdGhpcyBpZiBibG9ja1xuICBsZXQgZGVwdGggPSAwO1xuICBsZXQgc2VhcmNoUG9zID0gMDtcbiAgbGV0IGZvdW5kRWxzZTogeyB0eXBlOiAnZWxzZScgfCAnZWxzZWlmJywgcG9zOiBudW1iZXIsIGNvbmRpdGlvbj86IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICBcbiAgd2hpbGUgKHNlYXJjaFBvcyA8IGlubmVyLmxlbmd0aCkge1xuICAgIGNvbnN0IG5leHRJZiA9IGlubmVyLmluZGV4T2YoJ3t7I2lmJywgc2VhcmNoUG9zKTtcbiAgICBjb25zdCBuZXh0RWxzZUlmID0gaW5uZXIuaW5kZXhPZigne3tlbHNlIGlmJywgc2VhcmNoUG9zKTtcbiAgICBjb25zdCBuZXh0RWxzZSA9IGlubmVyLmluZGV4T2YoJ3t7ZWxzZX19Jywgc2VhcmNoUG9zKTtcbiAgICBjb25zdCBuZXh0RW5kSWYgPSBpbm5lci5pbmRleE9mKCd7ey9pZn19Jywgc2VhcmNoUG9zKTtcbiAgICBcbiAgICAvLyBGaW5kIHRoZSBlYXJsaWVzdCBvY2N1cnJlbmNlXG4gICAgY29uc3QgcG9zaXRpb25zOiBBcnJheTx7IHR5cGU6ICdpZicgfCAnZWxzZWlmJyB8ICdlbHNlJyB8ICdlbmRpZicsIHBvczogbnVtYmVyIH0+ID0gW107XG4gICAgaWYgKG5leHRJZiAhPT0gLTEpIHBvc2l0aW9ucy5wdXNoKHsgdHlwZTogJ2lmJywgcG9zOiBuZXh0SWYgfSk7XG4gICAgaWYgKG5leHRFbHNlSWYgIT09IC0xKSBwb3NpdGlvbnMucHVzaCh7IHR5cGU6ICdlbHNlaWYnLCBwb3M6IG5leHRFbHNlSWYgfSk7XG4gICAgaWYgKG5leHRFbHNlICE9PSAtMSkgcG9zaXRpb25zLnB1c2goeyB0eXBlOiAnZWxzZScsIHBvczogbmV4dEVsc2UgfSk7XG4gICAgaWYgKG5leHRFbmRJZiAhPT0gLTEpIHBvc2l0aW9ucy5wdXNoKHsgdHlwZTogJ2VuZGlmJywgcG9zOiBuZXh0RW5kSWYgfSk7XG4gICAgXG4gICAgcG9zaXRpb25zLnNvcnQoKGEsIGIpID0+IGEucG9zIC0gYi5wb3MpO1xuICAgIFxuICAgIGlmIChwb3NpdGlvbnMubGVuZ3RoID09PSAwKSBicmVhaztcbiAgICBcbiAgICBjb25zdCBmaXJzdCA9IHBvc2l0aW9uc1swXTtcbiAgICBcbiAgICBpZiAoZmlyc3QudHlwZSA9PT0gJ2lmJykge1xuICAgICAgZGVwdGgrKztcbiAgICAgIHNlYXJjaFBvcyA9IGZpcnN0LnBvcyArIDU7XG4gICAgfSBlbHNlIGlmIChmaXJzdC50eXBlID09PSAnZW5kaWYnKSB7XG4gICAgICBkZXB0aC0tO1xuICAgICAgc2VhcmNoUG9zID0gZmlyc3QucG9zICsgNztcbiAgICB9IGVsc2UgaWYgKGZpcnN0LnR5cGUgPT09ICdlbHNlaWYnICYmIGRlcHRoID09PSAwKSB7XG4gICAgICAvLyBGb3VuZCB7e2Vsc2UgaWYgLi4ufX0gYXQgdG9wIGxldmVsXG4gICAgICAvLyBFeHRyYWN0IHRoZSBjb25kaXRpb24gZnJvbSB7e2Vsc2UgaWYgQ09ORElUSU9OfX1cbiAgICAgIGNvbnN0IGVsc2VJZk1hdGNoID0gaW5uZXIuc3Vic3RyaW5nKGZpcnN0LnBvcykubWF0Y2goL15cXHtcXHtlbHNlXFxzK2lmXFxzKyhbXn1dKylcXH1cXH0vKTtcbiAgICAgIGlmIChlbHNlSWZNYXRjaCkge1xuICAgICAgICBmb3VuZEVsc2UgPSB7XG4gICAgICAgICAgdHlwZTogJ2Vsc2VpZicsXG4gICAgICAgICAgcG9zOiBmaXJzdC5wb3MsXG4gICAgICAgICAgY29uZGl0aW9uOiBlbHNlSWZNYXRjaFsxXS50cmltKCksXG4gICAgICAgICAgbGVuZ3RoOiBlbHNlSWZNYXRjaFswXS5sZW5ndGhcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAoZmlyc3QudHlwZSA9PT0gJ2Vsc2UnICYmIGRlcHRoID09PSAwKSB7XG4gICAgICAvLyBGb3VuZCB7e2Vsc2V9fSBhdCB0b3AgbGV2ZWxcbiAgICAgIGZvdW5kRWxzZSA9IHtcbiAgICAgICAgdHlwZTogJ2Vsc2UnLFxuICAgICAgICBwb3M6IGZpcnN0LnBvcyxcbiAgICAgICAgbGVuZ3RoOiAne3tlbHNlfX0nLmxlbmd0aFxuICAgICAgfTtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWFyY2hQb3MgPSBmaXJzdC5wb3MgKyA4O1xuICAgIH1cbiAgfVxuICBcbiAgY29uc3QgY29uZEVzY2FwZWQgPSBCdWZmZXIuZnJvbShjb25kaXRpb24udHJpbSgpKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gIFxuICBpZiAoZm91bmRFbHNlKSB7XG4gICAgLy8gU3BsaXQgaW50byBpZiBjb250ZW50IGFuZCByZW1haW5pbmcgY29udGVudFxuICAgIGNvbnN0IGlmQ29udGVudCA9IGlubmVyLnN1YnN0cmluZygwLCBmb3VuZEVsc2UucG9zKTtcbiAgICBjb25zdCByZW1haW5pbmdDb250ZW50ID0gaW5uZXIuc3Vic3RyaW5nKGZvdW5kRWxzZS5wb3MgKyBmb3VuZEVsc2UubGVuZ3RoKTtcbiAgICBjb25zdCBpZkVzY2FwZWQgPSBCdWZmZXIuZnJvbShpZkNvbnRlbnQpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBcbiAgICBpZiAoZm91bmRFbHNlLnR5cGUgPT09ICdlbHNlaWYnICYmIGZvdW5kRWxzZS5jb25kaXRpb24pIHtcbiAgICAgIC8vIFBhcnNlIHRoZSBlbHNlLWlmIGNvbmRpdGlvbiAobWlnaHQgYmUgYSBoZWxwZXIgZXhwcmVzc2lvbilcbiAgICAgIGxldCBlbHNlSWZDb25kaXRpb24gPSBmb3VuZEVsc2UuY29uZGl0aW9uO1xuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgaGVscGVyIGV4cHJlc3Npb24gbGlrZSAoZXEgLi4uKVxuICAgICAgaWYgKGVsc2VJZkNvbmRpdGlvbi5zdGFydHNXaXRoKCcoJykpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGVsc2VJZkNvbmRpdGlvbik7XG4gICAgICAgIGlmIChwYXJzZWQpIHtcbiAgICAgICAgICBlbHNlSWZDb25kaXRpb24gPSBwYXJzZWQ7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZWxzZUlmQ29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgLy8gU2ltcGxlIHByb3BlcnR5IGNoZWNrXG4gICAgICAgIGVsc2VJZkNvbmRpdGlvbiA9IHRvQ2FtZWxDYXNlKGVsc2VJZkNvbmRpdGlvbi5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSk7XG4gICAgICB9IGVsc2UgaWYgKGVsc2VJZkNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgIGVsc2VJZkNvbmRpdGlvbiA9IGBpdGVtLiR7ZWxzZUlmQ29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBCYXJlIGlkZW50aWZpZXIvcGF0aCDigJQgbm9ybWFsaXplIHRvIHByb3BlcnRpZXMueHh4IHNvIHRyYW5zcGlsZUV4cHJlc3Npb24gaGFuZGxlcyBjYW1lbENhc2UgKyBvcHRpb25hbCBjaGFpbmluZ1xuICAgICAgICBlbHNlSWZDb25kaXRpb24gPSBgcHJvcGVydGllcy4ke2Vsc2VJZkNvbmRpdGlvbn1gO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBSZWN1cnNpdmVseSBwcm9jZXNzIHRoZSByZW1haW5pbmcgY29udGVudCBhcyBpZiBpdCB3ZXJlIGFuIGlmIGJsb2NrXG4gICAgICAvLyBUaGlzIHdpbGwgaGFuZGxlIG5lc3RlZCBlbHNlLWlmIGNoYWlucyBhbmQgdGhlIGZpbmFsIGVsc2VcbiAgICAgIGNvbnN0IG5lc3RlZE1hcmtlciA9IHByb2Nlc3NJZkJsb2NrKGVsc2VJZkNvbmRpdGlvbiwgcmVtYWluaW5nQ29udGVudCwgMCwgJycpO1xuICAgICAgY29uc3QgbmVzdGVkTWFya2VyRXNjYXBlZCA9IEJ1ZmZlci5mcm9tKG5lc3RlZE1hcmtlcikudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgXG4gICAgICByZXR1cm4gYDxpZi1lbHNlaWYtbWFya2VyIGRhdGEtY29uZGl0aW9uPVwiJHtjb25kRXNjYXBlZH1cIiBkYXRhLWlmLWNvbnRlbnQ9XCIke2lmRXNjYXBlZH1cIiBkYXRhLW5lc3RlZC1tYXJrZXI9XCIke25lc3RlZE1hcmtlckVzY2FwZWR9XCI+PC9pZi1lbHNlaWYtbWFya2VyPmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFBsYWluIGVsc2VcbiAgICAgIGNvbnN0IGVsc2VFc2NhcGVkID0gQnVmZmVyLmZyb20ocmVtYWluaW5nQ29udGVudCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgcmV0dXJuIGA8aWYtZWxzZS1tYXJrZXIgZGF0YS1jb25kaXRpb249XCIke2NvbmRFc2NhcGVkfVwiIGRhdGEtaWYtY29udGVudD1cIiR7aWZFc2NhcGVkfVwiIGRhdGEtZWxzZS1jb250ZW50PVwiJHtlbHNlRXNjYXBlZH1cIj48L2lmLWVsc2UtbWFya2VyPmA7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIE5vIGVsc2UsIGp1c3QgaWYgY29udGVudFxuICAgIGNvbnN0IGVzY2FwZWQgPSBCdWZmZXIuZnJvbShpbm5lcikudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIHJldHVybiBgPGlmLW1hcmtlciBkYXRhLWNvbmRpdGlvbj1cIiR7Y29uZEVzY2FwZWR9XCIgZGF0YS1jb250ZW50PVwiJHtlc2NhcGVkfVwiPjwvaWYtbWFya2VyPmA7XG4gIH1cbn07XG5cbi8qKlxuICogUHJlLXByb2Nlc3MgdGVtcGxhdGUgdG8gaGFuZGxlIGJsb2NrIGhlbHBlcnMgYmVmb3JlIEhUTUwgcGFyc2luZ1xuICogVXNlcyBpdGVyYXRpdmUgYXBwcm9hY2ggdG8gaGFuZGxlIG5lc3RlZCBibG9ja3MgcHJvcGVybHlcbiAqIEBwYXJhbSB0ZW1wbGF0ZSAtIFRlbXBsYXRlIHN0cmluZ1xuICogQHBhcmFtIGN1cnJlbnRMb29wQXJyYXkgLSBXaGVuIHByb2Nlc3NpbmcgaW5uZXIgY29udGVudCBvZiB7eyNlYWNoIHByb3BlcnRpZXMueHh4fX0sIHBhc3MgdGhlIGFycmF5IG5hbWUgKGUuZy4gXCJjdGFzXCIpIHNvIHt7I3VubGVzcyBAbGFzdH19IG1hcmtlcnMgZ2V0IGRhdGEtYXJyYXkgZm9yIGNvcnJlY3QgZXhwYW5zaW9uIGF0IHJlcGxhY2UgdGltZVxuICovXG5leHBvcnQgY29uc3QgcHJlcHJvY2Vzc0Jsb2NrcyA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjdXJyZW50TG9vcEFycmF5Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlc3VsdCA9IHRlbXBsYXRlO1xuICBcbiAgLy8gUHJvY2VzcyB7eyNlYWNoIHByb3BlcnRpZXMueHh4Lnl5eSBhcyB8YWxpYXN8fX0gb3Ige3sjZWFjaCBwcm9wZXJ0aWVzLnh4eCBhcyB8YWxpYXMgaW5kZXh8fX0gYmxvY2tzIHdpdGggbmFtZWQgYWxpYXMgRklSU1RcbiAgLy8gTm93IGhhbmRsZXMgbmVzdGVkIHBhdGhzIGxpa2UgcHJvcGVydGllcy5qdW1wTmF2LmxpbmtzXG4gIGxldCBlYWNoTWF0Y2g7XG4gIC8vIFVwZGF0ZWQgcmVnZXggdG8gY2FwdHVyZSBuZXN0ZWQgcGF0aHMgKGUuZy4sIGp1bXBOYXYubGlua3MpIGFuZCBoYW5kbGUgYm90aCB8YWxpYXN8IGFuZCB8YWxpYXMgaW5kZXh8IHBhdHRlcm5zXG4gIGNvbnN0IGVhY2hBbGlhc1JlZ2V4ID0gL1xce1xceyNlYWNoXFxzK3Byb3BlcnRpZXNcXC4oW1xcdy5dKylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZztcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoQWxpYXNSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBlYWNoTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgZWFjaE1hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2VhY2gnLCAne3svZWFjaH19Jywgb3BlblRhZ0VuZCk7XG4gICAgXG4gICAgaWYgKGNsb3NlUG9zICE9PSAtMSkge1xuICAgICAgY29uc3QgcHJvcFBhdGggPSBlYWNoTWF0Y2hbMV07IC8vIGUuZy4sIFwianVtcE5hdi5saW5rc1wiIG9yIGp1c3QgXCJpdGVtc1wiXG4gICAgICBjb25zdCBhbGlhc05hbWUgPSBlYWNoTWF0Y2hbMl07XG4gICAgICBjb25zdCBpbm5lciA9IHJlc3VsdC5zdWJzdHJpbmcob3BlblRhZ0VuZCwgY2xvc2VQb3MpO1xuICAgICAgLy8gQ29udmVydCB0aGUgcGF0aCB0byBjYW1lbENhc2UgZm9yIGVhY2ggc2VnbWVudFxuICAgICAgY29uc3QgY2FtZWxQYXRoID0gcHJvcFBhdGguc3BsaXQoJy4nKS5tYXAoc2VnbWVudCA9PiB0b0NhbWVsQ2FzZShzZWdtZW50KSkuam9pbignLicpO1xuICAgICAgY29uc3QgZXNjYXBlZCA9IEJ1ZmZlci5mcm9tKGlubmVyKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgICAvLyBJbmNsdWRlIGFsaWFzIGluIHRoZSBtYXJrZXIgZm9yIGxhdGVyIHJlZmVyZW5jZSByZXBsYWNlbWVudFxuICAgICAgLy8gZGF0YS1wcm9wIG5vdyBjb250YWlucyB0aGUgZnVsbCBwYXRoIChlLmcuLCBcImp1bXBOYXYubGlua3NcIilcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDxsb29wLW1hcmtlciBkYXRhLXByb3A9XCIke2NhbWVsUGF0aH1cIiBkYXRhLXR5cGU9XCJwcm9wZXJ0aWVzXCIgZGF0YS1hbGlhcz1cIiR7YWxpYXNOYW1lfVwiIGRhdGEtY29udGVudD1cIiR7ZXNjYXBlZH1cIj48L2xvb3AtbWFya2VyPmA7XG4gICAgICBcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L2VhY2h9fScubGVuZ3RoKTtcbiAgICAgIGVhY2hBbGlhc1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gUHJvY2VzcyB7eyNlYWNoIHByb3BlcnRpZXMueHh4fX0gb3Ige3sjZWFjaCBwcm9wZXJ0aWVzLnh4eC55eXl9fSBibG9ja3Mgd2l0aG91dCBhbGlhc1xuICAvLyBOb3cgaGFuZGxlcyBuZXN0ZWQgcGF0aHMgbGlrZSBwcm9wZXJ0aWVzLmp1bXBOYXYubGlua3NcbiAgY29uc3QgZWFjaFByb3BzUmVnZXggPSAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccypcXH1cXH0vZztcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoUHJvcHNSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBlYWNoTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgZWFjaE1hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2VhY2gnLCAne3svZWFjaH19Jywgb3BlblRhZ0VuZCk7XG4gICAgXG4gICAgaWYgKGNsb3NlUG9zICE9PSAtMSkge1xuICAgICAgY29uc3QgcHJvcFBhdGggPSBlYWNoTWF0Y2hbMV07IC8vIGUuZy4sIFwianVtcE5hdi5saW5rc1wiIG9yIGp1c3QgXCJpdGVtc1wiXG4gICAgICBjb25zdCBpbm5lciA9IHJlc3VsdC5zdWJzdHJpbmcob3BlblRhZ0VuZCwgY2xvc2VQb3MpO1xuICAgICAgLy8gQ29udmVydCB0aGUgcGF0aCB0byBjYW1lbENhc2UgZm9yIGVhY2ggc2VnbWVudFxuICAgICAgY29uc3QgY2FtZWxQYXRoID0gcHJvcFBhdGguc3BsaXQoJy4nKS5tYXAoc2VnbWVudCA9PiB0b0NhbWVsQ2FzZShzZWdtZW50KSkuam9pbignLicpO1xuICAgICAgY29uc3QgZXNjYXBlZCA9IEJ1ZmZlci5mcm9tKGlubmVyKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IGA8bG9vcC1tYXJrZXIgZGF0YS1wcm9wPVwiJHtjYW1lbFBhdGh9XCIgZGF0YS10eXBlPVwicHJvcGVydGllc1wiIGRhdGEtY29udGVudD1cIiR7ZXNjYXBlZH1cIj48L2xvb3AtbWFya2VyPmA7XG4gICAgICBcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L2VhY2h9fScubGVuZ3RoKTtcbiAgICAgIGVhY2hQcm9wc1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gUHJvY2VzcyB7eyNlYWNoIHRoaXMueHh4IGFzIHxhbGlhc3x9fSBibG9ja3MgKG5lc3RlZCBsb29wcyB3aXRoIGFsaWFzIGluc2lkZSBwYXJlbnQgbG9vcHMpIEZJUlNUXG4gIGNvbnN0IGVhY2hUaGlzQWxpYXNSZWdleCA9IC9cXHtcXHsjZWFjaFxccyt0aGlzXFwuKFxcdyspXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccytcXHcrKT9cXHxcXHMqXFx9XFx9L2c7XG4gIHdoaWxlICgoZWFjaE1hdGNoID0gZWFjaFRoaXNBbGlhc1JlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IGVhY2hNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyBlYWNoTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjZWFjaCcsICd7ey9lYWNofX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBwcm9wTmFtZSA9IGVhY2hNYXRjaFsxXTtcbiAgICAgIGNvbnN0IGFsaWFzTmFtZSA9IGVhY2hNYXRjaFsyXTtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCBlc2NhcGVkID0gQnVmZmVyLmZyb20oaW5uZXIpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgIC8vIEluY2x1ZGUgYWxpYXMgaW4gdGhlIG5lc3RlZC1sb29wLW1hcmtlciBmb3IgcmVmZXJlbmNlIHJlcGxhY2VtZW50XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IGA8bmVzdGVkLWxvb3AtbWFya2VyIGRhdGEtcHJvcD1cIiR7cHJvcE5hbWV9XCIgZGF0YS1hbGlhcz1cIiR7YWxpYXNOYW1lfVwiIGRhdGEtY29udGVudD1cIiR7ZXNjYXBlZH1cIj48L25lc3RlZC1sb29wLW1hcmtlcj5gO1xuICAgICAgXG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhjbG9zZVBvcyArICd7ey9lYWNofX0nLmxlbmd0aCk7XG4gICAgICBlYWNoVGhpc0FsaWFzUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgfVxuICB9XG4gIFxuICAvLyBQcm9jZXNzIHt7I2VhY2ggdGhpcy54eHh9fSBibG9ja3Mgd2l0aG91dCBhbGlhcyAobmVzdGVkIGxvb3BzIGluc2lkZSBwYXJlbnQgbG9vcHMpXG4gIGNvbnN0IGVhY2hUaGlzUmVnZXggPSAvXFx7XFx7I2VhY2hcXHMrdGhpc1xcLihcXHcrKVxccypcXH1cXH0vZztcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoVGhpc1JlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IGVhY2hNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyBlYWNoTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjZWFjaCcsICd7ey9lYWNofX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBwcm9wTmFtZSA9IGVhY2hNYXRjaFsxXTtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCBlc2NhcGVkID0gQnVmZmVyLmZyb20oaW5uZXIpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDxuZXN0ZWQtbG9vcC1tYXJrZXIgZGF0YS1wcm9wPVwiJHtwcm9wTmFtZX1cIiBkYXRhLWNvbnRlbnQ9XCIke2VzY2FwZWR9XCI+PC9uZXN0ZWQtbG9vcC1tYXJrZXI+YDtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svZWFjaH19Jy5sZW5ndGgpO1xuICAgICAgZWFjaFRoaXNSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFByb2Nlc3Mge3sjdW5sZXNzIEBsYXN0fX0gYmxvY2tzIChvcHRpb25hbGx5IGVtYmVkIGN1cnJlbnQgbG9vcCBhcnJheSBmb3IgY29ycmVjdCBleHBhbnNpb24gd2hlbiBtYXJrZXIgaXMgcmVwbGFjZWQgd2l0aG91dCBsb29wIGNvbnRleHQpXG4gIC8vIFNraXAgd2hlbiBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIChlLmcuIGNsYXNzPVwiLi4ue3sjdW5sZXNzIEBsYXN0fX0uLi5cIikgc28gY29udmVydEF0dHJpYnV0ZVZhbHVlIGNhbiBjb252ZXJ0IGl0IHdpdGggdGhlIGNvcnJlY3QgbG9vcEFycmF5XG4gIGNvbnN0IHVubGVzc0xhc3RSZWdleCA9IC9cXHtcXHsjdW5sZXNzXFxzK0BsYXN0XFx9XFx9L2c7XG4gIGxldCB1bmxlc3NNYXRjaDtcbiAgY29uc3QgZGF0YUFycmF5QXR0ciA9IGN1cnJlbnRMb29wQXJyYXkgPyBgIGRhdGEtYXJyYXk9XCIke2N1cnJlbnRMb29wQXJyYXl9XCJgIDogJyc7XG4gIHdoaWxlICgodW5sZXNzTWF0Y2ggPSB1bmxlc3NMYXN0UmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gdW5sZXNzTWF0Y2guaW5kZXg7XG4gICAgaWYgKGlzSW5zaWRlQXR0cmlidXRlKHJlc3VsdCwgc3RhcnRQb3MpKSBjb250aW51ZTtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyB1bmxlc3NNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgY2xvc2VQb3MgPSBmaW5kTWF0Y2hpbmdDbG9zZShyZXN1bHQsICd7eyN1bmxlc3MnLCAne3svdW5sZXNzfX0nLCBvcGVuVGFnRW5kKTtcblxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCBlc2NhcGVkID0gQnVmZmVyLmZyb20oaW5uZXIpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDx1bmxlc3MtbGFzdC1tYXJrZXIgZGF0YS1jb250ZW50PVwiJHtlc2NhcGVkfVwiJHtkYXRhQXJyYXlBdHRyfT48L3VubGVzcy1sYXN0LW1hcmtlcj5gO1xuXG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhjbG9zZVBvcyArICd7ey91bmxlc3N9fScubGVuZ3RoKTtcbiAgICAgIHVubGVzc0xhc3RSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFByb2Nlc3Mge3sjdW5sZXNzIEBmaXJzdH19IGJsb2Nrc1xuICBjb25zdCB1bmxlc3NGaXJzdFJlZ2V4ID0gL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFx9XFx9L2c7XG4gIHdoaWxlICgodW5sZXNzTWF0Y2ggPSB1bmxlc3NGaXJzdFJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IHVubGVzc01hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIHVubGVzc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I3VubGVzcycsICd7ey91bmxlc3N9fScsIG9wZW5UYWdFbmQpO1xuICAgIFxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCBlc2NhcGVkID0gQnVmZmVyLmZyb20oaW5uZXIpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDx1bmxlc3MtZmlyc3QtbWFya2VyIGRhdGEtY29udGVudD1cIiR7ZXNjYXBlZH1cIj48L3VubGVzcy1maXJzdC1tYXJrZXI+YDtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svdW5sZXNzfX0nLmxlbmd0aCk7XG4gICAgICB1bmxlc3NGaXJzdFJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gUHJvY2VzcyB7eyNpZiAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBibG9ja3Mgd2l0aCBoZWxwZXIgZXhwcmVzc2lvbnMgRklSU1RcbiAgY29uc3QgaWZIZWxwZXJSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFxcKFteKV0rXFwpKVxccypcXH1cXH0vZztcbiAgbGV0IGlmSGVscGVyTWF0Y2g7XG4gIHdoaWxlICgoaWZIZWxwZXJNYXRjaCA9IGlmSGVscGVyUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gaWZIZWxwZXJNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyBpZkhlbHBlck1hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2lmJywgJ3t7L2lmfX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBoZWxwZXJFeHByID0gaWZIZWxwZXJNYXRjaFsxXTtcbiAgICAgIGNvbnN0IHBhcnNlZENvbmRpdGlvbiA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihoZWxwZXJFeHByKTtcbiAgICAgIC8vIFVzZSB0aGUgcGFyc2VkIGNvbmRpdGlvbiBvciBmYWxsIGJhY2sgdG8gdGhlIG9yaWdpbmFsIGlmIHBhcnNpbmcgZmFpbGVkXG4gICAgICBjb25zdCBjb25kaXRpb24gPSBwYXJzZWRDb25kaXRpb24gfHwgaGVscGVyRXhwcjtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IHByb2Nlc3NJZkJsb2NrKGNvbmRpdGlvbiwgaW5uZXIsIHN0YXJ0UG9zLCBpZkhlbHBlck1hdGNoWzBdKTtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svaWZ9fScubGVuZ3RoKTtcbiAgICAgIGlmSGVscGVyUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgfVxuICB9XG4gIFxuICAvLyBQcm9jZXNzIHt7I3VubGVzcyAoZXEvbmUvZ3QvbHQvZXRjIC4uLil9fSBibG9ja3Mgd2l0aCBoZWxwZXIgZXhwcmVzc2lvbnNcbiAgLy8gUmV1c2UgcHJvY2Vzc0lmQmxvY2sgd2l0aCBhIG5lZ2F0ZWQgY29uZGl0aW9uOiAhKHBhcnNlZENvbmRpdGlvbilcbiAgY29uc3QgdW5sZXNzSGVscGVyUmVnZXggPSAvXFx7XFx7I3VubGVzc1xccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuICBsZXQgdW5sZXNzSGVscGVyTWF0Y2g7XG4gIHdoaWxlICgodW5sZXNzSGVscGVyTWF0Y2ggPSB1bmxlc3NIZWxwZXJSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSB1bmxlc3NIZWxwZXJNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyB1bmxlc3NIZWxwZXJNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgY2xvc2VQb3MgPSBmaW5kTWF0Y2hpbmdDbG9zZShyZXN1bHQsICd7eyN1bmxlc3MnLCAne3svdW5sZXNzfX0nLCBvcGVuVGFnRW5kKTtcblxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IGhlbHBlckV4cHIgPSB1bmxlc3NIZWxwZXJNYXRjaFsxXTtcbiAgICAgIGNvbnN0IHBhcnNlZENvbmRpdGlvbiA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihoZWxwZXJFeHByKTtcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IHBhcnNlZENvbmRpdGlvbiB8fCBoZWxwZXJFeHByO1xuICAgICAgY29uc3QgbmVnYXRlZCA9IGAhKCR7Y29uZGl0aW9ufSlgO1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcHJvY2Vzc0lmQmxvY2sobmVnYXRlZCwgaW5uZXIsIHN0YXJ0UG9zLCB1bmxlc3NIZWxwZXJNYXRjaFswXSk7XG5cbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L3VubGVzc319Jy5sZW5ndGgpO1xuICAgICAgdW5sZXNzSGVscGVyUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvY2VzcyB7eyN1bmxlc3MgcHJvcGVydGllcy54eHh9fSBibG9ja3MgKG5lZ2F0aW9uIG9mIGlmKVxuICBjb25zdCB1bmxlc3NQcm9wc1JlZ2V4ID0gL1xce1xceyN1bmxlc3NcXHMrKHByb3BlcnRpZXNcXC5bXn1dKylcXH1cXH0vZztcbiAgbGV0IHVubGVzc1Byb3BzTWF0Y2g7XG4gIHdoaWxlICgodW5sZXNzUHJvcHNNYXRjaCA9IHVubGVzc1Byb3BzUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gdW5sZXNzUHJvcHNNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyB1bmxlc3NQcm9wc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I3VubGVzcycsICd7ey91bmxlc3N9fScsIG9wZW5UYWdFbmQpO1xuXG4gICAgaWYgKGNsb3NlUG9zICE9PSAtMSkge1xuICAgICAgY29uc3QgY29uZGl0aW9uID0gdW5sZXNzUHJvcHNNYXRjaFsxXTtcbiAgICAgIC8vIFN0b3JlIGEgdHJhbnNwaWxlLWZyaWVuZGx5IG5lZ2F0ZWQgY29uZGl0aW9uIChub3QgcmF3IHByb3BlcnRpZXMueHh4IGluc2lkZSBwYXJlbnMpXG4gICAgICBjb25zdCBuZWdhdGVkID0gY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJylcbiAgICAgICAgPyBgISR7dHJhbnNwaWxlRXhwcmVzc2lvbihjb25kaXRpb24sIHsgcHJvcGVydGllczoge30sIGluZGVudDogJycsIGluTG9vcDogZmFsc2UgfSl9YFxuICAgICAgICA6IGAhKCR7Y29uZGl0aW9ufSlgO1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcHJvY2Vzc0lmQmxvY2sobmVnYXRlZCwgaW5uZXIsIHN0YXJ0UG9zLCB1bmxlc3NQcm9wc01hdGNoWzBdKTtcblxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svdW5sZXNzfX0nLmxlbmd0aCk7XG4gICAgICB1bmxlc3NQcm9wc1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb2Nlc3Mge3sjaWYgdGhpcy54eHh9fSBibG9ja3MgKGNvbmRpdGlvbmFscyBvbiBsb29wIGl0ZW0gcHJvcGVydGllcylcbiAgY29uc3QgaWZUaGlzUmVnZXggPSAvXFx7XFx7I2lmXFxzKyh0aGlzXFwuW159XSspXFx9XFx9L2c7XG4gIGxldCBpZlRoaXNNYXRjaDtcbiAgd2hpbGUgKChpZlRoaXNNYXRjaCA9IGlmVGhpc1JlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IGlmVGhpc01hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIGlmVGhpc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2lmJywgJ3t7L2lmfX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBpZlRoaXNNYXRjaFsxXTtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IHByb2Nlc3NJZkJsb2NrKGNvbmRpdGlvbiwgaW5uZXIsIHN0YXJ0UG9zLCBpZlRoaXNNYXRjaFswXSk7XG4gICAgICBcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L2lmfX0nLmxlbmd0aCk7XG4gICAgICBpZlRoaXNSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIE5vcm1hbGl6ZSB7eyNpZiAuLi9wcm9wZXJ0aWVzLnh4eH19IHRvIHt7I2lmIHByb3BlcnRpZXMueHh4fX0gKHBhcmVudCBjb250ZXh0IGluIGxvb3BzKVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7I2lmXFxzK1xcLlxcLlxcLysocHJvcGVydGllc1xcLltefV0rKVxcfVxcfS9nLCAne3sjaWYgJDF9fScpO1xuXG4gIC8vIFByb2Nlc3Mge3sjaWYgcHJvcGVydGllcy54eHh9fSBibG9ja3MgKGNvbmRpdGlvbmFscyBvbiB0b3AtbGV2ZWwgcHJvcGVydGllcylcbiAgY29uc3QgaWZQcm9wc1JlZ2V4ID0gL1xce1xceyNpZlxccysocHJvcGVydGllc1xcLltefV0rKVxcfVxcfS9nO1xuICBsZXQgaWZQcm9wc01hdGNoO1xuICB3aGlsZSAoKGlmUHJvcHNNYXRjaCA9IGlmUHJvcHNSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBpZlByb3BzTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgaWZQcm9wc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2lmJywgJ3t7L2lmfX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBpZlByb3BzTWF0Y2hbMV07XG4gICAgICBjb25zdCBpbm5lciA9IHJlc3VsdC5zdWJzdHJpbmcob3BlblRhZ0VuZCwgY2xvc2VQb3MpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBwcm9jZXNzSWZCbG9jayhjb25kaXRpb24sIGlubmVyLCBzdGFydFBvcywgaWZQcm9wc01hdGNoWzBdKTtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svaWZ9fScubGVuZ3RoKTtcbiAgICAgIGlmUHJvcHNSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIENhdGNoLWFsbDogUHJvY2VzcyBhbnkgcmVtYWluaW5nIHt7I2lmIHh4eH19IGJsb2NrcyBub3QgbWF0Y2hlZCBieSB0aGUgc3BlY2lmaWMgcGF0dGVybnMgYWJvdmVcbiAgY29uc3QgaWZHZW5lcmljUmVnZXggPSAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0vZztcbiAgbGV0IGlmR2VuZXJpY01hdGNoO1xuICB3aGlsZSAoKGlmR2VuZXJpY01hdGNoID0gaWZHZW5lcmljUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gaWZHZW5lcmljTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgaWZHZW5lcmljTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjaWYnLCAne3svaWZ9fScsIG9wZW5UYWdFbmQpO1xuICAgIFxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGxldCBjb25kaXRpb24gPSBpZkdlbmVyaWNNYXRjaFsxXS50cmltKCk7XG4gICAgICAvLyBCYXJlIGlkZW50aWZpZXJzL3BhdGhzIOKAlCBub3JtYWxpemUgdG8gcHJvcGVydGllcy54eHggc28gdHJhbnNwaWxlRXhwcmVzc2lvbiBoYW5kbGVzIGNhbWVsQ2FzZSArIG9wdGlvbmFsIGNoYWluaW5nXG4gICAgICBpZiAoIWNvbmRpdGlvbi5zdGFydHNXaXRoKCcoJykgJiYgIWNvbmRpdGlvbi5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpICYmICFjb25kaXRpb24uc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICBjb25kaXRpb24gPSBgcHJvcGVydGllcy4ke2NvbmRpdGlvbn1gO1xuICAgICAgfVxuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcHJvY2Vzc0lmQmxvY2soY29uZGl0aW9uLCBpbm5lciwgc3RhcnRQb3MsIGlmR2VuZXJpY01hdGNoWzBdKTtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svaWZ9fScubGVuZ3RoKTtcbiAgICAgIGlmR2VuZXJpY1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iXX0=