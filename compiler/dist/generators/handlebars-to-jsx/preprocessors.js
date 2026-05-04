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
            const negated = `!(${condition})`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlcHJvY2Vzc29ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L3ByZXByb2Nlc3NvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFHSCxtQ0FBNEU7QUFDNUUsMkRBQTREO0FBQzVELGlEQUFpRDtBQUNqRCw2Q0FBK0Q7QUFFL0QsNENBQTRDO0FBQzVDLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztBQVF2Rjs7OztHQUlHO0FBQ0ksTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsVUFBMkMsRUFBMEIsRUFBRTtJQUN4SCxJQUFJLE1BQU0sR0FBRyxRQUFRLElBQUksRUFBRSxDQUFDO0lBQzVCLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUUvQyxvRUFBb0U7SUFDcEUsaUVBQWlFO0lBQ2pFLE1BQU0sY0FBYyxHQUFHLDhDQUE4QyxDQUFDO0lBRXRFLElBQUksS0FBSyxDQUFDO0lBQ1YsT0FBTyxDQUFDLEtBQUssR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDdEQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDN0IsTUFBTSxVQUFVLEdBQUcsUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFFOUMsZ0VBQWdFO1FBQ2hFLE1BQU0sUUFBUSxHQUFHLElBQUEseUJBQWlCLEVBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsVUFBVSxD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LFNBQVMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDekcsU0FBUyxHQUFHLGNBQWMsU0FBUyxFQUFFLENBQUM7WUFDeEMsQ0FBQztZQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVsRixNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsV0FBVyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNyRyxjQUFjLENBQUMsU0FBUyxHQUFHLFFBQVEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO1FBQzNELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBMVBXLFFBQUEsZ0JBQWdCLG9CQTBQM0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFRlbXBsYXRlIHByZXByb2Nlc3NpbmcgdXRpbGl0aWVzIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZQcm9wZXJ0eSB9IGZyb20gJy4uLy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlLCBmaW5kTWF0Y2hpbmdDbG9zZSwgaXNJbnNpZGVBdHRyaWJ1dGUgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IHBhcnNlSGVscGVyRXhwcmVzc2lvbiB9IGZyb20gJy4vZXhwcmVzc2lvbi1wYXJzZXInO1xuaW1wb3J0IHsgbG9va3VwRmllbGRUeXBlIH0gZnJvbSAnLi9maWVsZC1sb29rdXAnO1xuaW1wb3J0IHsgcHJlcHJvY2Vzc0F0dHJpYnV0ZUNvbmRpdGlvbmFscyB9IGZyb20gJy4vYXR0cmlidXRlcyc7XG5cbi8qKiBTdXBwb3J0ZWQgaW5saW5lLWVkaXRhYmxlIGZpZWxkIHR5cGVzICovXG5jb25zdCBJTkxJTkVfRURJVEFCTEVfVFlQRVMgPSBuZXcgU2V0KFsndGV4dCcsICdyaWNodGV4dCcsICdpbWFnZScsICdsaW5rJywgJ2J1dHRvbiddKTtcblxuZXhwb3J0IGludGVyZmFjZSBQcmVwcm9jZXNzRmllbGRzUmVzdWx0IHtcbiAgdGVtcGxhdGU6IHN0cmluZztcbiAgLyoqIEZpZWxkIHBhdGhzIHRoYXQgd2VyZSBjb252ZXJ0ZWQgdG8gaW5saW5lLWVkaXRhYmxlIG1hcmtlcnMgKi9cbiAgaW5saW5lRWRpdGFibGVGaWVsZHM6IFNldDxzdHJpbmc+O1xufVxuXG4vKipcbiAqIFByZXByb2Nlc3Mge3sjZmllbGQgXCJwYXRoXCJ9fWNvbnRlbnR7ey9maWVsZH19IGludG8gZmllbGQgbWFya2Vyc1xuICogVGhlc2Ugd2lsbCBiZSBjb252ZXJ0ZWQgdG8gUmljaFRleHQvSW1hZ2UvTGlua0NvbnRyb2wgY29tcG9uZW50cyBpbiBwb3N0cHJvY2Vzc2luZ1xuICogT25seSBjcmVhdGVzIG1hcmtlcnMgZm9yIHN1cHBvcnRlZCBmaWVsZCB0eXBlcyB0aGF0IGFyZSBOT1QgaW5zaWRlIGF0dHJpYnV0ZSB2YWx1ZXNcbiAqL1xuZXhwb3J0IGNvbnN0IHByZXByb2Nlc3NGaWVsZHMgPSAodGVtcGxhdGU6IHN0cmluZywgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IFByZXByb2Nlc3NGaWVsZHNSZXN1bHQgPT4ge1xuICBsZXQgcmVzdWx0ID0gdGVtcGxhdGUgPz8gJyc7XG4gIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIFxuICAvLyBNYXRjaCB7eyNmaWVsZCBcInBhdGhcIn19IG9yIHt7I2ZpZWxkIHBhdGh9fSBvcGVuaW5nIHRhZ3MsIHRoZW4gdXNlXG4gIC8vIG5lc3RpbmctYXdhcmUgbWF0Y2hpbmcgdG8gZmluZCB0aGUgY29ycmVjdCBjbG9zaW5nIHt7L2ZpZWxkfX0uXG4gIGNvbnN0IGZpZWxkT3BlblJlZ2V4ID0gL1xce1xce1xccyojZmllbGRcXHMrW1wiJ10/KFteXCInXFx9XSspW1wiJ10/XFxzKlxcfVxcfS9nO1xuICBcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gZmllbGRPcGVuUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGZpZWxkUGF0aCA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICBjb25zdCBzdGFydFBvcyA9IG1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICBcbiAgICAvLyBVc2UgbmVzdGluZy1hd2FyZSBtYXRjaGluZyB0byBoYW5kbGUgbmVzdGVkIHt7I2ZpZWxkfX0gYmxvY2tzXG4gICAgY29uc3QgY2xvc2VQb3MgPSBmaW5kTWF0Y2hpbmdDbG9zZShyZXN1bHQsICd7eyNmaWVsZCcsICd7ey9maWVsZH19Jywgb3BlblRhZ0VuZCk7XG4gICAgaWYgKGNsb3NlUG9zID09PSAtMSkgY29udGludWU7XG4gICAgXG4gICAgY29uc3QgY29udGVudCA9IHJlc3VsdC5zdWJzdHJpbmcob3BlblRhZ0VuZCwgY2xvc2VQb3MpO1xuICAgIGNvbnN0IGZ1bGxNYXRjaEVuZCA9IGNsb3NlUG9zICsgJ3t7L2ZpZWxkfX0nLmxlbmd0aDtcbiAgICBcbiAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSBpbnNpZGUgYXR0cmlidXRlIHZhbHVlcyAobGlrZSBocmVmLCBzcmMsIGV0Yy4pXG4gICAgaWYgKGlzSW5zaWRlQXR0cmlidXRlKHJlc3VsdCwgc3RhcnRQb3MpKSB7XG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIGNvbnRlbnQgKyByZXN1bHQuc3Vic3RyaW5nKGZ1bGxNYXRjaEVuZCk7XG4gICAgICBmaWVsZE9wZW5SZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIGNvbnRlbnQubGVuZ3RoO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFBhZ2luYXRpb24tcmVsYXRlZCBmaWVsZCBwYXRocyBhcmUgbWV0YWRhdGEgYW5ub3RhdGlvbnMsIG5vdCBlZGl0YWJsZSBmaWVsZHMuXG4gICAgaWYgKGZpZWxkUGF0aC5pbmNsdWRlcygnLnBhZ2luYXRpb24nKSB8fCBmaWVsZFBhdGguc3RhcnRzV2l0aCgncGFnaW5hdGlvbi4nKSkge1xuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyBjb250ZW50ICsgcmVzdWx0LnN1YnN0cmluZyhmdWxsTWF0Y2hFbmQpO1xuICAgICAgZmllbGRPcGVuUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyBjb250ZW50Lmxlbmd0aDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBmaWVsZFR5cGUgPSBsb29rdXBGaWVsZFR5cGUoZmllbGRQYXRoLCBwcm9wZXJ0aWVzKTtcbiAgICBcbiAgICBpZiAoZmllbGRUeXBlICYmIElOTElORV9FRElUQUJMRV9UWVBFUy5oYXMoZmllbGRUeXBlKSkge1xuICAgICAgY29uc3QgZmllbGRJbmZvID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBwYXRoOiBmaWVsZFBhdGgsXG4gICAgICAgIHR5cGU6IGZpZWxkVHlwZSxcbiAgICAgICAgY29udGVudDogY29udGVudC50cmltKClcbiAgICAgIH0pKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDxlZGl0YWJsZS1maWVsZC1tYXJrZXIgZGF0YS1maWVsZD1cIiR7ZmllbGRJbmZvfVwiPjwvZWRpdGFibGUtZmllbGQtbWFya2VyPmA7XG4gICAgICBcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGZ1bGxNYXRjaEVuZCk7XG4gICAgICBmaWVsZE9wZW5SZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICAgIFxuICAgICAgY29uc3QgdG9wTGV2ZWxLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgIGlubGluZUVkaXRhYmxlRmllbGRzLmFkZCh0b3BMZXZlbEtleSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgY29udGVudCArIHJlc3VsdC5zdWJzdHJpbmcoZnVsbE1hdGNoRW5kKTtcbiAgICAgIGZpZWxkT3BlblJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgY29udGVudC5sZW5ndGg7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4geyB0ZW1wbGF0ZTogcmVzdWx0LCBpbmxpbmVFZGl0YWJsZUZpZWxkcyB9O1xufTtcblxuLyoqXG4gKiBDbGVhbiBhbmQgcHJlcHJvY2VzcyB0aGUgSGFuZGxlYmFycyB0ZW1wbGF0ZVxuICogQHBhcmFtIGN1cnJlbnRMb29wQXJyYXkgLSBXaGVuIHByb2Nlc3NpbmcgbG9vcCBpbm5lciBjb250ZW50LCBwYXNzIHRoZSBhcnJheSBuYW1lIHNvIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgKGUuZy4ge3sjdW5sZXNzIEBsYXN0fX0pIGdldCB0aGUgY29ycmVjdCBhcnJheSBuYW1lXG4gKi9cbmV4cG9ydCBjb25zdCBjbGVhblRlbXBsYXRlID0gKHRlbXBsYXRlOiBzdHJpbmcsIGN1cnJlbnRMb29wQXJyYXk/OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBsZXQgY2xlYW5lZCA9IHRlbXBsYXRlID8/ICcnO1xuICBcbiAgLy8gUmVtb3ZlIEhUTUwvYm9keSB3cmFwcGVyXG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoLzxodG1sPltcXHNcXFNdKj88Ym9keVtePl0qPi9naSwgJycpO1xuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC88XFwvYm9keT5bXFxzXFxTXSo/PFxcL2h0bWw+L2dpLCAnJyk7XG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoLzxoZWFkPltcXHNcXFNdKj88XFwvaGVhZD4vZ2ksICcnKTtcbiAgXG4gIC8vIFJlbW92ZSB7e3tzdHlsZX19fSBhbmQge3t7c2NyaXB0fX19IGhlbHBlcnNcbiAgY2xlYW5lZCA9IGNsZWFuZWQucmVwbGFjZSgvXFx7XFx7XFx7P3N0eWxlXFx9XFx9XFx9Py9nLCAnJyk7XG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoL1xce1xce1xcez9zY3JpcHRcXH1cXH1cXH0/L2csICcnKTtcbiAgXG4gIC8vIE5vdGU6IHt7I2ZpZWxkfX0gYmxvY2tzIGFyZSBub3cgaGFuZGxlZCBieSBwcmVwcm9jZXNzRmllbGRzLCBub3Qgc3RyaXBwZWQgaGVyZVxuICAvLyBKdXN0IGNsZWFuIHVwIGFueSByZW1haW5pbmcgZmllbGQgdGFncyB0aGF0IHdlcmVuJ3QgcHJvY2Vzc2VkXG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoL1xce1xce1xccyojZmllbGRcXHMrW159XStcXH1cXH0vZywgJycpO1xuICBjbGVhbmVkID0gY2xlYW5lZC5yZXBsYWNlKC9cXHtcXHtcXHMqXFwvZmllbGRcXHMqXFx9XFx9L2csICcnKTtcbiAgXG4gIC8vIFJlbW92ZSB7eyEtLSBjb21tZW50cyAtLX19XG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoL1xce1xceyEtLVtcXHNcXFNdKj8tLVxcfVxcfS9nLCAnJyk7XG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoL1xce1xceyFbXFxzXFxTXSo/XFx9XFx9L2csICcnKTtcbiAgXG4gIC8vIE5vcm1hbGl6ZSBAcm9vdC4gcmVmZXJlbmNlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9ucyB0byByb290LWxldmVsIGFjY2Vzcy5cbiAgLy8gSW4gc3RhbmRhcmQgSGFuZGxlYmFycywgQHJvb3QgcmVmZXJzIHRvIHRoZSB0b3AtbGV2ZWwgZGF0YSBjb250ZXh0IHJlZ2FyZGxlc3Mgb2ZcbiAgLy8gbmVzdGluZyBkZXB0aCwgc28gQHJvb3QucHJvcGVydGllcy54eHggaXMgZXF1aXZhbGVudCB0byBwcm9wZXJ0aWVzLnh4eCBhdCB0aGUgcm9vdC5cbiAgLy8gV2Ugb25seSByZXBsYWNlIGluc2lkZSB7ey4uLn19IHRvIGF2b2lkIHRvdWNoaW5nIHVucmVsYXRlZCB0ZXh0IGNvbnRlbnQuXG4gIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoL1xce1xce1tcXHNcXFNdKj9cXH1cXH0vZywgKG1hdGNoKSA9PiBtYXRjaC5yZXBsYWNlKC9Acm9vdFxcLi9nLCAnJykpO1xuICBcbiAgLy8gUnVuIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgQkVGT1JFIHByZXByb2Nlc3NCbG9ja3Mgc28ge3sjaWZ9fSBldGMuIGluc2lkZSBhdHRyaWJ1dGUgdmFsdWVzIChlLmcuIGNsYXNzTmFtZT1cIngge3sjaWYgcHJvcH19eXt7L2lmfX1cIikgZ2V0IGNvbnZlcnRlZCB0byB0ZW1wbGF0ZSBsaXRlcmFscyBpbnN0ZWFkIG9mIGJlY29taW5nIHJhdyA8aWYtbWFya2VyPiB0YWdzIGluc2lkZSB0aGUgYXR0cmlidXRlLlxuICBjbGVhbmVkID0gcHJlcHJvY2Vzc0F0dHJpYnV0ZUNvbmRpdGlvbmFscyhjbGVhbmVkLCBjdXJyZW50TG9vcEFycmF5KTtcbiAgLy8gV2hlbiBwcm9jZXNzaW5nIHRoZSBmdWxsIHRlbXBsYXRlIChubyBjdXJyZW50TG9vcEFycmF5KSwgcnVuIHByZXByb2Nlc3NCbG9ja3Mgc28ge3sjZWFjaH19IGJlY29tZSBtYXJrZXJzIGFuZCBibG9jay1sZXZlbCB7eyNpZn19IGJlY29tZSBpZi1tYXJrZXJzLiBBdHRyaWJ1dGVzIGhhdmUgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCBzbyB0aGV5IHdvbid0IGNvbnRhaW4gbWFya2Vycy5cbiAgaWYgKGN1cnJlbnRMb29wQXJyYXkgPT09IHVuZGVmaW5lZCkge1xuICAgIGNsZWFuZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWQpO1xuICB9XG4gIFxuICByZXR1cm4gY2xlYW5lZC50cmltKCk7XG59O1xuXG4vKipcbiAqIEhlbHBlciBmdW5jdGlvbiB0byBwcm9jZXNzIGlmIGJsb2NrcyB3aXRoIG9wdGlvbmFsIGVsc2UvZWxzZS1pZlxuICovXG5jb25zdCBwcm9jZXNzSWZCbG9jayA9IChjb25kaXRpb246IHN0cmluZywgaW5uZXI6IHN0cmluZywgc3RhcnRQb3M6IG51bWJlciwgZnVsbE1hdGNoOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAvLyBGaW5kIHRvcC1sZXZlbCB7e2Vsc2UgaWYgLi4ufX0gb3Ige3tlbHNlfX0gaW4gdGhlIGlubmVyIGNvbnRlbnRcbiAgLy8gV2UgbmVlZCB0byB0cmFjayBuZXN0aW5nIGRlcHRoIHRvIG9ubHkgZmluZCB0aGUgb25lcyB0aGF0IGJlbG9uZyB0byB0aGlzIGlmIGJsb2NrXG4gIGxldCBkZXB0aCA9IDA7XG4gIGxldCBzZWFyY2hQb3MgPSAwO1xuICBsZXQgZm91bmRFbHNlOiB7IHR5cGU6ICdlbHNlJyB8ICdlbHNlaWYnLCBwb3M6IG51bWJlciwgY29uZGl0aW9uPzogc3RyaW5nLCBsZW5ndGg6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG4gIFxuICB3aGlsZSAoc2VhcmNoUG9zIDwgaW5uZXIubGVuZ3RoKSB7XG4gICAgY29uc3QgbmV4dElmID0gaW5uZXIuaW5kZXhPZigne3sjaWYnLCBzZWFyY2hQb3MpO1xuICAgIGNvbnN0IG5leHRFbHNlSWYgPSBpbm5lci5pbmRleE9mKCd7e2Vsc2UgaWYnLCBzZWFyY2hQb3MpO1xuICAgIGNvbnN0IG5leHRFbHNlID0gaW5uZXIuaW5kZXhPZigne3tlbHNlfX0nLCBzZWFyY2hQb3MpO1xuICAgIGNvbnN0IG5leHRFbmRJZiA9IGlubmVyLmluZGV4T2YoJ3t7L2lmfX0nLCBzZWFyY2hQb3MpO1xuICAgIFxuICAgIC8vIEZpbmQgdGhlIGVhcmxpZXN0IG9jY3VycmVuY2VcbiAgICBjb25zdCBwb3NpdGlvbnM6IEFycmF5PHsgdHlwZTogJ2lmJyB8ICdlbHNlaWYnIHwgJ2Vsc2UnIHwgJ2VuZGlmJywgcG9zOiBudW1iZXIgfT4gPSBbXTtcbiAgICBpZiAobmV4dElmICE9PSAtMSkgcG9zaXRpb25zLnB1c2goeyB0eXBlOiAnaWYnLCBwb3M6IG5leHRJZiB9KTtcbiAgICBpZiAobmV4dEVsc2VJZiAhPT0gLTEpIHBvc2l0aW9ucy5wdXNoKHsgdHlwZTogJ2Vsc2VpZicsIHBvczogbmV4dEVsc2VJZiB9KTtcbiAgICBpZiAobmV4dEVsc2UgIT09IC0xKSBwb3NpdGlvbnMucHVzaCh7IHR5cGU6ICdlbHNlJywgcG9zOiBuZXh0RWxzZSB9KTtcbiAgICBpZiAobmV4dEVuZElmICE9PSAtMSkgcG9zaXRpb25zLnB1c2goeyB0eXBlOiAnZW5kaWYnLCBwb3M6IG5leHRFbmRJZiB9KTtcbiAgICBcbiAgICBwb3NpdGlvbnMuc29ydCgoYSwgYikgPT4gYS5wb3MgLSBiLnBvcyk7XG4gICAgXG4gICAgaWYgKHBvc2l0aW9ucy5sZW5ndGggPT09IDApIGJyZWFrO1xuICAgIFxuICAgIGNvbnN0IGZpcnN0ID0gcG9zaXRpb25zWzBdO1xuICAgIFxuICAgIGlmIChmaXJzdC50eXBlID09PSAnaWYnKSB7XG4gICAgICBkZXB0aCsrO1xuICAgICAgc2VhcmNoUG9zID0gZmlyc3QucG9zICsgNTtcbiAgICB9IGVsc2UgaWYgKGZpcnN0LnR5cGUgPT09ICdlbmRpZicpIHtcbiAgICAgIGRlcHRoLS07XG4gICAgICBzZWFyY2hQb3MgPSBmaXJzdC5wb3MgKyA3O1xuICAgIH0gZWxzZSBpZiAoZmlyc3QudHlwZSA9PT0gJ2Vsc2VpZicgJiYgZGVwdGggPT09IDApIHtcbiAgICAgIC8vIEZvdW5kIHt7ZWxzZSBpZiAuLi59fSBhdCB0b3AgbGV2ZWxcbiAgICAgIC8vIEV4dHJhY3QgdGhlIGNvbmRpdGlvbiBmcm9tIHt7ZWxzZSBpZiBDT05ESVRJT059fVxuICAgICAgY29uc3QgZWxzZUlmTWF0Y2ggPSBpbm5lci5zdWJzdHJpbmcoZmlyc3QucG9zKS5tYXRjaCgvXlxce1xce2Vsc2VcXHMraWZcXHMrKFtefV0rKVxcfVxcfS8pO1xuICAgICAgaWYgKGVsc2VJZk1hdGNoKSB7XG4gICAgICAgIGZvdW5kRWxzZSA9IHtcbiAgICAgICAgICB0eXBlOiAnZWxzZWlmJyxcbiAgICAgICAgICBwb3M6IGZpcnN0LnBvcyxcbiAgICAgICAgICBjb25kaXRpb246IGVsc2VJZk1hdGNoWzFdLnRyaW0oKSxcbiAgICAgICAgICBsZW5ndGg6IGVsc2VJZk1hdGNoWzBdLmxlbmd0aFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChmaXJzdC50eXBlID09PSAnZWxzZScgJiYgZGVwdGggPT09IDApIHtcbiAgICAgIC8vIEZvdW5kIHt7ZWxzZX19IGF0IHRvcCBsZXZlbFxuICAgICAgZm91bmRFbHNlID0ge1xuICAgICAgICB0eXBlOiAnZWxzZScsXG4gICAgICAgIHBvczogZmlyc3QucG9zLFxuICAgICAgICBsZW5ndGg6ICd7e2Vsc2V9fScubGVuZ3RoXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlYXJjaFBvcyA9IGZpcnN0LnBvcyArIDg7XG4gICAgfVxuICB9XG4gIFxuICBjb25zdCBjb25kRXNjYXBlZCA9IEJ1ZmZlci5mcm9tKGNvbmRpdGlvbi50cmltKCkpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgXG4gIGlmIChmb3VuZEVsc2UpIHtcbiAgICAvLyBTcGxpdCBpbnRvIGlmIGNvbnRlbnQgYW5kIHJlbWFpbmluZyBjb250ZW50XG4gICAgY29uc3QgaWZDb250ZW50ID0gaW5uZXIuc3Vic3RyaW5nKDAsIGZvdW5kRWxzZS5wb3MpO1xuICAgIGNvbnN0IHJlbWFpbmluZ0NvbnRlbnQgPSBpbm5lci5zdWJzdHJpbmcoZm91bmRFbHNlLnBvcyArIGZvdW5kRWxzZS5sZW5ndGgpO1xuICAgIGNvbnN0IGlmRXNjYXBlZCA9IEJ1ZmZlci5mcm9tKGlmQ29udGVudCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIFxuICAgIGlmIChmb3VuZEVsc2UudHlwZSA9PT0gJ2Vsc2VpZicgJiYgZm91bmRFbHNlLmNvbmRpdGlvbikge1xuICAgICAgLy8gUGFyc2UgdGhlIGVsc2UtaWYgY29uZGl0aW9uIChtaWdodCBiZSBhIGhlbHBlciBleHByZXNzaW9uKVxuICAgICAgbGV0IGVsc2VJZkNvbmRpdGlvbiA9IGZvdW5kRWxzZS5jb25kaXRpb247XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBoZWxwZXIgZXhwcmVzc2lvbiBsaWtlIChlcSAuLi4pXG4gICAgICBpZiAoZWxzZUlmQ29uZGl0aW9uLnN0YXJ0c1dpdGgoJygnKSkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24oZWxzZUlmQ29uZGl0aW9uKTtcbiAgICAgICAgaWYgKHBhcnNlZCkge1xuICAgICAgICAgIGVsc2VJZkNvbmRpdGlvbiA9IHBhcnNlZDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChlbHNlSWZDb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICAvLyBTaW1wbGUgcHJvcGVydHkgY2hlY2tcbiAgICAgICAgZWxzZUlmQ29uZGl0aW9uID0gdG9DYW1lbENhc2UoZWxzZUlmQ29uZGl0aW9uLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICAgIH0gZWxzZSBpZiAoZWxzZUlmQ29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgZWxzZUlmQ29uZGl0aW9uID0gYGl0ZW0uJHtlbHNlSWZDb25kaXRpb24ucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEJhcmUgaWRlbnRpZmllci9wYXRoIOKAlCBub3JtYWxpemUgdG8gcHJvcGVydGllcy54eHggc28gdHJhbnNwaWxlRXhwcmVzc2lvbiBoYW5kbGVzIGNhbWVsQ2FzZSArIG9wdGlvbmFsIGNoYWluaW5nXG4gICAgICAgIGVsc2VJZkNvbmRpdGlvbiA9IGBwcm9wZXJ0aWVzLiR7ZWxzZUlmQ29uZGl0aW9ufWA7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2l2ZWx5IHByb2Nlc3MgdGhlIHJlbWFpbmluZyBjb250ZW50IGFzIGlmIGl0IHdlcmUgYW4gaWYgYmxvY2tcbiAgICAgIC8vIFRoaXMgd2lsbCBoYW5kbGUgbmVzdGVkIGVsc2UtaWYgY2hhaW5zIGFuZCB0aGUgZmluYWwgZWxzZVxuICAgICAgY29uc3QgbmVzdGVkTWFya2VyID0gcHJvY2Vzc0lmQmxvY2soZWxzZUlmQ29uZGl0aW9uLCByZW1haW5pbmdDb250ZW50LCAwLCAnJyk7XG4gICAgICBjb25zdCBuZXN0ZWRNYXJrZXJFc2NhcGVkID0gQnVmZmVyLmZyb20obmVzdGVkTWFya2VyKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgICBcbiAgICAgIHJldHVybiBgPGlmLWVsc2VpZi1tYXJrZXIgZGF0YS1jb25kaXRpb249XCIke2NvbmRFc2NhcGVkfVwiIGRhdGEtaWYtY29udGVudD1cIiR7aWZFc2NhcGVkfVwiIGRhdGEtbmVzdGVkLW1hcmtlcj1cIiR7bmVzdGVkTWFya2VyRXNjYXBlZH1cIj48L2lmLWVsc2VpZi1tYXJrZXI+YDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUGxhaW4gZWxzZVxuICAgICAgY29uc3QgZWxzZUVzY2FwZWQgPSBCdWZmZXIuZnJvbShyZW1haW5pbmdDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgICByZXR1cm4gYDxpZi1lbHNlLW1hcmtlciBkYXRhLWNvbmRpdGlvbj1cIiR7Y29uZEVzY2FwZWR9XCIgZGF0YS1pZi1jb250ZW50PVwiJHtpZkVzY2FwZWR9XCIgZGF0YS1lbHNlLWNvbnRlbnQ9XCIke2Vsc2VFc2NhcGVkfVwiPjwvaWYtZWxzZS1tYXJrZXI+YDtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gTm8gZWxzZSwganVzdCBpZiBjb250ZW50XG4gICAgY29uc3QgZXNjYXBlZCA9IEJ1ZmZlci5mcm9tKGlubmVyKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgcmV0dXJuIGA8aWYtbWFya2VyIGRhdGEtY29uZGl0aW9uPVwiJHtjb25kRXNjYXBlZH1cIiBkYXRhLWNvbnRlbnQ9XCIke2VzY2FwZWR9XCI+PC9pZi1tYXJrZXI+YDtcbiAgfVxufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyB0ZW1wbGF0ZSB0byBoYW5kbGUgYmxvY2sgaGVscGVycyBiZWZvcmUgSFRNTCBwYXJzaW5nXG4gKiBVc2VzIGl0ZXJhdGl2ZSBhcHByb2FjaCB0byBoYW5kbGUgbmVzdGVkIGJsb2NrcyBwcm9wZXJseVxuICogQHBhcmFtIHRlbXBsYXRlIC0gVGVtcGxhdGUgc3RyaW5nXG4gKiBAcGFyYW0gY3VycmVudExvb3BBcnJheSAtIFdoZW4gcHJvY2Vzc2luZyBpbm5lciBjb250ZW50IG9mIHt7I2VhY2ggcHJvcGVydGllcy54eHh9fSwgcGFzcyB0aGUgYXJyYXkgbmFtZSAoZS5nLiBcImN0YXNcIikgc28ge3sjdW5sZXNzIEBsYXN0fX0gbWFya2VycyBnZXQgZGF0YS1hcnJheSBmb3IgY29ycmVjdCBleHBhbnNpb24gYXQgcmVwbGFjZSB0aW1lXG4gKi9cbmV4cG9ydCBjb25zdCBwcmVwcm9jZXNzQmxvY2tzID0gKHRlbXBsYXRlOiBzdHJpbmcsIGN1cnJlbnRMb29wQXJyYXk/OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBsZXQgcmVzdWx0ID0gdGVtcGxhdGU7XG4gIFxuICAvLyBQcm9jZXNzIHt7I2VhY2ggcHJvcGVydGllcy54eHgueXl5IGFzIHxhbGlhc3x9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4IGFzIHxhbGlhcyBpbmRleHx9fSBibG9ja3Mgd2l0aCBuYW1lZCBhbGlhcyBGSVJTVFxuICAvLyBOb3cgaGFuZGxlcyBuZXN0ZWQgcGF0aHMgbGlrZSBwcm9wZXJ0aWVzLmp1bXBOYXYubGlua3NcbiAgbGV0IGVhY2hNYXRjaDtcbiAgLy8gVXBkYXRlZCByZWdleCB0byBjYXB0dXJlIG5lc3RlZCBwYXRocyAoZS5nLiwganVtcE5hdi5saW5rcykgYW5kIGhhbmRsZSBib3RoIHxhbGlhc3wgYW5kIHxhbGlhcyBpbmRleHwgcGF0dGVybnNcbiAgY29uc3QgZWFjaEFsaWFzUmVnZXggPSAvXFx7XFx7I2VhY2hcXHMrcHJvcGVydGllc1xcLihbXFx3Ll0rKVxccythc1xccytcXHwoXFx3KykoPzpcXHMrXFx3Kyk/XFx8XFxzKlxcfVxcfS9nO1xuICB3aGlsZSAoKGVhY2hNYXRjaCA9IGVhY2hBbGlhc1JlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IGVhY2hNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyBlYWNoTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjZWFjaCcsICd7ey9lYWNofX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBwcm9wUGF0aCA9IGVhY2hNYXRjaFsxXTsgLy8gZS5nLiwgXCJqdW1wTmF2LmxpbmtzXCIgb3IganVzdCBcIml0ZW1zXCJcbiAgICAgIGNvbnN0IGFsaWFzTmFtZSA9IGVhY2hNYXRjaFsyXTtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICAvLyBDb252ZXJ0IHRoZSBwYXRoIHRvIGNhbWVsQ2FzZSBmb3IgZWFjaCBzZWdtZW50XG4gICAgICBjb25zdCBjYW1lbFBhdGggPSBwcm9wUGF0aC5zcGxpdCgnLicpLm1hcChzZWdtZW50ID0+IHRvQ2FtZWxDYXNlKHNlZ21lbnQpKS5qb2luKCcuJyk7XG4gICAgICBjb25zdCBlc2NhcGVkID0gQnVmZmVyLmZyb20oaW5uZXIpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgIC8vIEluY2x1ZGUgYWxpYXMgaW4gdGhlIG1hcmtlciBmb3IgbGF0ZXIgcmVmZXJlbmNlIHJlcGxhY2VtZW50XG4gICAgICAvLyBkYXRhLXByb3Agbm93IGNvbnRhaW5zIHRoZSBmdWxsIHBhdGggKGUuZy4sIFwianVtcE5hdi5saW5rc1wiKVxuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgPGxvb3AtbWFya2VyIGRhdGEtcHJvcD1cIiR7Y2FtZWxQYXRofVwiIGRhdGEtdHlwZT1cInByb3BlcnRpZXNcIiBkYXRhLWFsaWFzPVwiJHthbGlhc05hbWV9XCIgZGF0YS1jb250ZW50PVwiJHtlc2NhcGVkfVwiPjwvbG9vcC1tYXJrZXI+YDtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svZWFjaH19Jy5sZW5ndGgpO1xuICAgICAgZWFjaEFsaWFzUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgfVxuICB9XG4gIFxuICAvLyBQcm9jZXNzIHt7I2VhY2ggcHJvcGVydGllcy54eHh9fSBvciB7eyNlYWNoIHByb3BlcnRpZXMueHh4Lnl5eX19IGJsb2NrcyB3aXRob3V0IGFsaWFzXG4gIC8vIE5vdyBoYW5kbGVzIG5lc3RlZCBwYXRocyBsaWtlIHByb3BlcnRpZXMuanVtcE5hdi5saW5rc1xuICBjb25zdCBlYWNoUHJvcHNSZWdleCA9IC9cXHtcXHsjZWFjaFxccytwcm9wZXJ0aWVzXFwuKFtcXHcuXSspXFxzKlxcfVxcfS9nO1xuICB3aGlsZSAoKGVhY2hNYXRjaCA9IGVhY2hQcm9wc1JlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IGVhY2hNYXRjaC5pbmRleDtcbiAgICBjb25zdCBvcGVuVGFnRW5kID0gc3RhcnRQb3MgKyBlYWNoTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjZWFjaCcsICd7ey9lYWNofX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBwcm9wUGF0aCA9IGVhY2hNYXRjaFsxXTsgLy8gZS5nLiwgXCJqdW1wTmF2LmxpbmtzXCIgb3IganVzdCBcIml0ZW1zXCJcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICAvLyBDb252ZXJ0IHRoZSBwYXRoIHRvIGNhbWVsQ2FzZSBmb3IgZWFjaCBzZWdtZW50XG4gICAgICBjb25zdCBjYW1lbFBhdGggPSBwcm9wUGF0aC5zcGxpdCgnLicpLm1hcChzZWdtZW50ID0+IHRvQ2FtZWxDYXNlKHNlZ21lbnQpKS5qb2luKCcuJyk7XG4gICAgICBjb25zdCBlc2NhcGVkID0gQnVmZmVyLmZyb20oaW5uZXIpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDxsb29wLW1hcmtlciBkYXRhLXByb3A9XCIke2NhbWVsUGF0aH1cIiBkYXRhLXR5cGU9XCJwcm9wZXJ0aWVzXCIgZGF0YS1jb250ZW50PVwiJHtlc2NhcGVkfVwiPjwvbG9vcC1tYXJrZXI+YDtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svZWFjaH19Jy5sZW5ndGgpO1xuICAgICAgZWFjaFByb3BzUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgfVxuICB9XG4gIFxuICAvLyBQcm9jZXNzIHt7I2VhY2ggdGhpcy54eHggYXMgfGFsaWFzfH19IGJsb2NrcyAobmVzdGVkIGxvb3BzIHdpdGggYWxpYXMgaW5zaWRlIHBhcmVudCBsb29wcykgRklSU1RcbiAgY29uc3QgZWFjaFRoaXNBbGlhc1JlZ2V4ID0gL1xce1xceyNlYWNoXFxzK3RoaXNcXC4oXFx3KylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzK1xcdyspP1xcfFxccypcXH1cXH0vZztcbiAgd2hpbGUgKChlYWNoTWF0Y2ggPSBlYWNoVGhpc0FsaWFzUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gZWFjaE1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIGVhY2hNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgY2xvc2VQb3MgPSBmaW5kTWF0Y2hpbmdDbG9zZShyZXN1bHQsICd7eyNlYWNoJywgJ3t7L2VhY2h9fScsIG9wZW5UYWdFbmQpO1xuICAgIFxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IHByb3BOYW1lID0gZWFjaE1hdGNoWzFdO1xuICAgICAgY29uc3QgYWxpYXNOYW1lID0gZWFjaE1hdGNoWzJdO1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IGVzY2FwZWQgPSBCdWZmZXIuZnJvbShpbm5lcikudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgLy8gSW5jbHVkZSBhbGlhcyBpbiB0aGUgbmVzdGVkLWxvb3AtbWFya2VyIGZvciByZWZlcmVuY2UgcmVwbGFjZW1lbnRcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYDxuZXN0ZWQtbG9vcC1tYXJrZXIgZGF0YS1wcm9wPVwiJHtwcm9wTmFtZX1cIiBkYXRhLWFsaWFzPVwiJHthbGlhc05hbWV9XCIgZGF0YS1jb250ZW50PVwiJHtlc2NhcGVkfVwiPjwvbmVzdGVkLWxvb3AtbWFya2VyPmA7XG4gICAgICBcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L2VhY2h9fScubGVuZ3RoKTtcbiAgICAgIGVhY2hUaGlzQWxpYXNSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFByb2Nlc3Mge3sjZWFjaCB0aGlzLnh4eH19IGJsb2NrcyB3aXRob3V0IGFsaWFzIChuZXN0ZWQgbG9vcHMgaW5zaWRlIHBhcmVudCBsb29wcylcbiAgY29uc3QgZWFjaFRoaXNSZWdleCA9IC9cXHtcXHsjZWFjaFxccyt0aGlzXFwuKFxcdyspXFxzKlxcfVxcfS9nO1xuICB3aGlsZSAoKGVhY2hNYXRjaCA9IGVhY2hUaGlzUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gZWFjaE1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIGVhY2hNYXRjaFswXS5sZW5ndGg7XG4gICAgY29uc3QgY2xvc2VQb3MgPSBmaW5kTWF0Y2hpbmdDbG9zZShyZXN1bHQsICd7eyNlYWNoJywgJ3t7L2VhY2h9fScsIG9wZW5UYWdFbmQpO1xuICAgIFxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IHByb3BOYW1lID0gZWFjaE1hdGNoWzFdO1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IGVzY2FwZWQgPSBCdWZmZXIuZnJvbShpbm5lcikudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgPG5lc3RlZC1sb29wLW1hcmtlciBkYXRhLXByb3A9XCIke3Byb3BOYW1lfVwiIGRhdGEtY29udGVudD1cIiR7ZXNjYXBlZH1cIj48L25lc3RlZC1sb29wLW1hcmtlcj5gO1xuICAgICAgXG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhjbG9zZVBvcyArICd7ey9lYWNofX0nLmxlbmd0aCk7XG4gICAgICBlYWNoVGhpc1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gUHJvY2VzcyB7eyN1bmxlc3MgQGxhc3R9fSBibG9ja3MgKG9wdGlvbmFsbHkgZW1iZWQgY3VycmVudCBsb29wIGFycmF5IGZvciBjb3JyZWN0IGV4cGFuc2lvbiB3aGVuIG1hcmtlciBpcyByZXBsYWNlZCB3aXRob3V0IGxvb3AgY29udGV4dClcbiAgLy8gU2tpcCB3aGVuIGluc2lkZSBhbiBhdHRyaWJ1dGUgdmFsdWUgKGUuZy4gY2xhc3M9XCIuLi57eyN1bmxlc3MgQGxhc3R9fS4uLlwiKSBzbyBjb252ZXJ0QXR0cmlidXRlVmFsdWUgY2FuIGNvbnZlcnQgaXQgd2l0aCB0aGUgY29ycmVjdCBsb29wQXJyYXlcbiAgY29uc3QgdW5sZXNzTGFzdFJlZ2V4ID0gL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXH1cXH0vZztcbiAgbGV0IHVubGVzc01hdGNoO1xuICBjb25zdCBkYXRhQXJyYXlBdHRyID0gY3VycmVudExvb3BBcnJheSA/IGAgZGF0YS1hcnJheT1cIiR7Y3VycmVudExvb3BBcnJheX1cImAgOiAnJztcbiAgd2hpbGUgKCh1bmxlc3NNYXRjaCA9IHVubGVzc0xhc3RSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSB1bmxlc3NNYXRjaC5pbmRleDtcbiAgICBpZiAoaXNJbnNpZGVBdHRyaWJ1dGUocmVzdWx0LCBzdGFydFBvcykpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIHVubGVzc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I3VubGVzcycsICd7ey91bmxlc3N9fScsIG9wZW5UYWdFbmQpO1xuXG4gICAgaWYgKGNsb3NlUG9zICE9PSAtMSkge1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IGVzY2FwZWQgPSBCdWZmZXIuZnJvbShpbm5lcikudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgPHVubGVzcy1sYXN0LW1hcmtlciBkYXRhLWNvbnRlbnQ9XCIke2VzY2FwZWR9XCIke2RhdGFBcnJheUF0dHJ9PjwvdW5sZXNzLWxhc3QtbWFya2VyPmA7XG5cbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L3VubGVzc319Jy5sZW5ndGgpO1xuICAgICAgdW5sZXNzTGFzdFJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gUHJvY2VzcyB7eyN1bmxlc3MgQGZpcnN0fX0gYmxvY2tzXG4gIGNvbnN0IHVubGVzc0ZpcnN0UmVnZXggPSAvXFx7XFx7I3VubGVzc1xccytAZmlyc3RcXH1cXH0vZztcbiAgd2hpbGUgKCh1bmxlc3NNYXRjaCA9IHVubGVzc0ZpcnN0UmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gdW5sZXNzTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgdW5sZXNzTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjdW5sZXNzJywgJ3t7L3VubGVzc319Jywgb3BlblRhZ0VuZCk7XG4gICAgXG4gICAgaWYgKGNsb3NlUG9zICE9PSAtMSkge1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IGVzY2FwZWQgPSBCdWZmZXIuZnJvbShpbm5lcikudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgPHVubGVzcy1maXJzdC1tYXJrZXIgZGF0YS1jb250ZW50PVwiJHtlc2NhcGVkfVwiPjwvdW5sZXNzLWZpcnN0LW1hcmtlcj5gO1xuICAgICAgXG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhjbG9zZVBvcyArICd7ey91bmxlc3N9fScubGVuZ3RoKTtcbiAgICAgIHVubGVzc0ZpcnN0UmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgfVxuICB9XG4gIFxuICAvLyBQcm9jZXNzIHt7I2lmIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGJsb2NrcyB3aXRoIGhlbHBlciBleHByZXNzaW9ucyBGSVJTVFxuICBjb25zdCBpZkhlbHBlclJlZ2V4ID0gL1xce1xceyNpZlxccysoXFwoW14pXStcXCkpXFxzKlxcfVxcfS9nO1xuICBsZXQgaWZIZWxwZXJNYXRjaDtcbiAgd2hpbGUgKChpZkhlbHBlck1hdGNoID0gaWZIZWxwZXJSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBpZkhlbHBlck1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIGlmSGVscGVyTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjaWYnLCAne3svaWZ9fScsIG9wZW5UYWdFbmQpO1xuICAgIFxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IGhlbHBlckV4cHIgPSBpZkhlbHBlck1hdGNoWzFdO1xuICAgICAgY29uc3QgcGFyc2VkQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGhlbHBlckV4cHIpO1xuICAgICAgLy8gVXNlIHRoZSBwYXJzZWQgY29uZGl0aW9uIG9yIGZhbGwgYmFjayB0byB0aGUgb3JpZ2luYWwgaWYgcGFyc2luZyBmYWlsZWRcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IHBhcnNlZENvbmRpdGlvbiB8fCBoZWxwZXJFeHByO1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcHJvY2Vzc0lmQmxvY2soY29uZGl0aW9uLCBpbm5lciwgc3RhcnRQb3MsIGlmSGVscGVyTWF0Y2hbMF0pO1xuICAgICAgXG4gICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhjbG9zZVBvcyArICd7ey9pZn19Jy5sZW5ndGgpO1xuICAgICAgaWZIZWxwZXJSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFByb2Nlc3Mge3sjdW5sZXNzIChlcS9uZS9ndC9sdC9ldGMgLi4uKX19IGJsb2NrcyB3aXRoIGhlbHBlciBleHByZXNzaW9uc1xuICAvLyBSZXVzZSBwcm9jZXNzSWZCbG9jayB3aXRoIGEgbmVnYXRlZCBjb25kaXRpb246ICEocGFyc2VkQ29uZGl0aW9uKVxuICBjb25zdCB1bmxlc3NIZWxwZXJSZWdleCA9IC9cXHtcXHsjdW5sZXNzXFxzKyhcXChbXildK1xcKSlcXHMqXFx9XFx9L2c7XG4gIGxldCB1bmxlc3NIZWxwZXJNYXRjaDtcbiAgd2hpbGUgKCh1bmxlc3NIZWxwZXJNYXRjaCA9IHVubGVzc0hlbHBlclJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IHVubGVzc0hlbHBlck1hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIHVubGVzc0hlbHBlck1hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I3VubGVzcycsICd7ey91bmxlc3N9fScsIG9wZW5UYWdFbmQpO1xuXG4gICAgaWYgKGNsb3NlUG9zICE9PSAtMSkge1xuICAgICAgY29uc3QgaGVscGVyRXhwciA9IHVubGVzc0hlbHBlck1hdGNoWzFdO1xuICAgICAgY29uc3QgcGFyc2VkQ29uZGl0aW9uID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGhlbHBlckV4cHIpO1xuICAgICAgY29uc3QgY29uZGl0aW9uID0gcGFyc2VkQ29uZGl0aW9uIHx8IGhlbHBlckV4cHI7XG4gICAgICBjb25zdCBuZWdhdGVkID0gYCEoJHtjb25kaXRpb259KWA7XG4gICAgICBjb25zdCBpbm5lciA9IHJlc3VsdC5zdWJzdHJpbmcob3BlblRhZ0VuZCwgY2xvc2VQb3MpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBwcm9jZXNzSWZCbG9jayhuZWdhdGVkLCBpbm5lciwgc3RhcnRQb3MsIHVubGVzc0hlbHBlck1hdGNoWzBdKTtcblxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svdW5sZXNzfX0nLmxlbmd0aCk7XG4gICAgICB1bmxlc3NIZWxwZXJSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm9jZXNzIHt7I3VubGVzcyBwcm9wZXJ0aWVzLnh4eH19IGJsb2NrcyAobmVnYXRpb24gb2YgaWYpXG4gIGNvbnN0IHVubGVzc1Byb3BzUmVnZXggPSAvXFx7XFx7I3VubGVzc1xccysocHJvcGVydGllc1xcLltefV0rKVxcfVxcfS9nO1xuICBsZXQgdW5sZXNzUHJvcHNNYXRjaDtcbiAgd2hpbGUgKCh1bmxlc3NQcm9wc01hdGNoID0gdW5sZXNzUHJvcHNSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSB1bmxlc3NQcm9wc01hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIHVubGVzc1Byb3BzTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjdW5sZXNzJywgJ3t7L3VubGVzc319Jywgb3BlblRhZ0VuZCk7XG5cbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSB1bmxlc3NQcm9wc01hdGNoWzFdO1xuICAgICAgY29uc3QgbmVnYXRlZCA9IGAhKCR7Y29uZGl0aW9ufSlgO1xuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcHJvY2Vzc0lmQmxvY2sobmVnYXRlZCwgaW5uZXIsIHN0YXJ0UG9zLCB1bmxlc3NQcm9wc01hdGNoWzBdKTtcblxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svdW5sZXNzfX0nLmxlbmd0aCk7XG4gICAgICB1bmxlc3NQcm9wc1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb2Nlc3Mge3sjaWYgdGhpcy54eHh9fSBibG9ja3MgKGNvbmRpdGlvbmFscyBvbiBsb29wIGl0ZW0gcHJvcGVydGllcylcbiAgY29uc3QgaWZUaGlzUmVnZXggPSAvXFx7XFx7I2lmXFxzKyh0aGlzXFwuW159XSspXFx9XFx9L2c7XG4gIGxldCBpZlRoaXNNYXRjaDtcbiAgd2hpbGUgKChpZlRoaXNNYXRjaCA9IGlmVGhpc1JlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBzdGFydFBvcyA9IGlmVGhpc01hdGNoLmluZGV4O1xuICAgIGNvbnN0IG9wZW5UYWdFbmQgPSBzdGFydFBvcyArIGlmVGhpc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2lmJywgJ3t7L2lmfX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBpZlRoaXNNYXRjaFsxXTtcbiAgICAgIGNvbnN0IGlubmVyID0gcmVzdWx0LnN1YnN0cmluZyhvcGVuVGFnRW5kLCBjbG9zZVBvcyk7XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IHByb2Nlc3NJZkJsb2NrKGNvbmRpdGlvbiwgaW5uZXIsIHN0YXJ0UG9zLCBpZlRoaXNNYXRjaFswXSk7XG4gICAgICBcbiAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgcmVwbGFjZW1lbnQgKyByZXN1bHQuc3Vic3RyaW5nKGNsb3NlUG9zICsgJ3t7L2lmfX0nLmxlbmd0aCk7XG4gICAgICBpZlRoaXNSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIE5vcm1hbGl6ZSB7eyNpZiAuLi9wcm9wZXJ0aWVzLnh4eH19IHRvIHt7I2lmIHByb3BlcnRpZXMueHh4fX0gKHBhcmVudCBjb250ZXh0IGluIGxvb3BzKVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7I2lmXFxzK1xcLlxcLlxcLysocHJvcGVydGllc1xcLltefV0rKVxcfVxcfS9nLCAne3sjaWYgJDF9fScpO1xuXG4gIC8vIFByb2Nlc3Mge3sjaWYgcHJvcGVydGllcy54eHh9fSBibG9ja3MgKGNvbmRpdGlvbmFscyBvbiB0b3AtbGV2ZWwgcHJvcGVydGllcylcbiAgY29uc3QgaWZQcm9wc1JlZ2V4ID0gL1xce1xceyNpZlxccysocHJvcGVydGllc1xcLltefV0rKVxcfVxcfS9nO1xuICBsZXQgaWZQcm9wc01hdGNoO1xuICB3aGlsZSAoKGlmUHJvcHNNYXRjaCA9IGlmUHJvcHNSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBpZlByb3BzTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgaWZQcm9wc01hdGNoWzBdLmxlbmd0aDtcbiAgICBjb25zdCBjbG9zZVBvcyA9IGZpbmRNYXRjaGluZ0Nsb3NlKHJlc3VsdCwgJ3t7I2lmJywgJ3t7L2lmfX0nLCBvcGVuVGFnRW5kKTtcbiAgICBcbiAgICBpZiAoY2xvc2VQb3MgIT09IC0xKSB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBpZlByb3BzTWF0Y2hbMV07XG4gICAgICBjb25zdCBpbm5lciA9IHJlc3VsdC5zdWJzdHJpbmcob3BlblRhZ0VuZCwgY2xvc2VQb3MpO1xuICAgICAgY29uc3QgcmVwbGFjZW1lbnQgPSBwcm9jZXNzSWZCbG9jayhjb25kaXRpb24sIGlubmVyLCBzdGFydFBvcywgaWZQcm9wc01hdGNoWzBdKTtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svaWZ9fScubGVuZ3RoKTtcbiAgICAgIGlmUHJvcHNSZWdleC5sYXN0SW5kZXggPSBzdGFydFBvcyArIHJlcGxhY2VtZW50Lmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIENhdGNoLWFsbDogUHJvY2VzcyBhbnkgcmVtYWluaW5nIHt7I2lmIHh4eH19IGJsb2NrcyBub3QgbWF0Y2hlZCBieSB0aGUgc3BlY2lmaWMgcGF0dGVybnMgYWJvdmVcbiAgY29uc3QgaWZHZW5lcmljUmVnZXggPSAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0vZztcbiAgbGV0IGlmR2VuZXJpY01hdGNoO1xuICB3aGlsZSAoKGlmR2VuZXJpY01hdGNoID0gaWZHZW5lcmljUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHN0YXJ0UG9zID0gaWZHZW5lcmljTWF0Y2guaW5kZXg7XG4gICAgY29uc3Qgb3BlblRhZ0VuZCA9IHN0YXJ0UG9zICsgaWZHZW5lcmljTWF0Y2hbMF0ubGVuZ3RoO1xuICAgIGNvbnN0IGNsb3NlUG9zID0gZmluZE1hdGNoaW5nQ2xvc2UocmVzdWx0LCAne3sjaWYnLCAne3svaWZ9fScsIG9wZW5UYWdFbmQpO1xuICAgIFxuICAgIGlmIChjbG9zZVBvcyAhPT0gLTEpIHtcbiAgICAgIGxldCBjb25kaXRpb24gPSBpZkdlbmVyaWNNYXRjaFsxXS50cmltKCk7XG4gICAgICAvLyBCYXJlIGlkZW50aWZpZXJzL3BhdGhzIOKAlCBub3JtYWxpemUgdG8gcHJvcGVydGllcy54eHggc28gdHJhbnNwaWxlRXhwcmVzc2lvbiBoYW5kbGVzIGNhbWVsQ2FzZSArIG9wdGlvbmFsIGNoYWluaW5nXG4gICAgICBpZiAoIWNvbmRpdGlvbi5zdGFydHNXaXRoKCcoJykgJiYgIWNvbmRpdGlvbi5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpICYmICFjb25kaXRpb24uc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICBjb25kaXRpb24gPSBgcHJvcGVydGllcy4ke2NvbmRpdGlvbn1gO1xuICAgICAgfVxuICAgICAgY29uc3QgaW5uZXIgPSByZXN1bHQuc3Vic3RyaW5nKG9wZW5UYWdFbmQsIGNsb3NlUG9zKTtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gcHJvY2Vzc0lmQmxvY2soY29uZGl0aW9uLCBpbm5lciwgc3RhcnRQb3MsIGlmR2VuZXJpY01hdGNoWzBdKTtcbiAgICAgIFxuICAgICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoY2xvc2VQb3MgKyAne3svaWZ9fScubGVuZ3RoKTtcbiAgICAgIGlmR2VuZXJpY1JlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iXX0=