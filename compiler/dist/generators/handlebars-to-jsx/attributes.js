"use strict";
/**
 * Attribute conversion utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertAttributes = exports.preprocessAttributeConditionals = exports.preprocessConditionalAttributes = exports.convertAttributeValue = void 0;
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
const styles_1 = require("./styles");
/**
 * Resolve a Handlebars array expression inside an attribute to a JSX accessor.
 * Examples: this.tags -> provider?.tags, properties.providers -> providers
 */
const resolveArrayRefInAttribute = (source, loopVar) => {
    const trimmed = source.trim();
    if (trimmed.startsWith('this.')) {
        return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, trimmed.replace('this.', ''));
    }
    if (trimmed.startsWith('properties.')) {
        const parts = trimmed.replace('properties.', '').split('.');
        return parts.map((part, index) => (index === 0 ? (0, utils_1.toCamelCase)(part) : part)).join('?.');
    }
    if (trimmed.startsWith(`${loopVar}.`)) {
        return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, trimmed.replace(`${loopVar}.`, ''));
    }
    const dotIndex = trimmed.indexOf('.');
    if (dotIndex > 0) {
        const root = trimmed.slice(0, dotIndex);
        const rest = trimmed.slice(dotIndex + 1);
        if (root === loopVar) {
            return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, rest);
        }
    }
    return (0, utils_1.toCamelCase)(trimmed);
};
/**
 * Convert {{#each array}}body{{/each}} inside an attribute value to .map().join().
 */
const compileNestedEachAttributeExpression = (arraySpec, body, loopVar, loopIndex) => {
    let arraySource = arraySpec.trim();
    let nestedVar = 'subItem';
    let nestedIndex = 'subIndex';
    const aliasMatch = arraySource.match(/^(.+?)\s+as\s+\|(\w+)(?:\s+(\w+))?\|$/);
    if (aliasMatch) {
        arraySource = aliasMatch[1].trim();
        nestedVar = aliasMatch[2];
        if (aliasMatch[3]) {
            nestedIndex = aliasMatch[3];
        }
    }
    const arrayRef = resolveArrayRefInAttribute(arraySource, loopVar);
    const { jsxValue: bodyJsx } = (0, exports.convertAttributeValue)(body, nestedVar, arrayRef, nestedIndex);
    if (bodyJsx.startsWith('${') && bodyJsx.endsWith('}') && !bodyJsx.includes('${', 2)) {
        const innerExpr = bodyJsx.slice(2, -1);
        return `(${arrayRef} || []).map((${nestedVar}, ${nestedIndex}) => ${innerExpr}).join('')`;
    }
    const innerTemplate = bodyJsx.startsWith('`') && bodyJsx.endsWith('`')
        ? bodyJsx.slice(1, -1)
        : bodyJsx;
    return `(${arrayRef} || []).map((${nestedVar}, ${nestedIndex}) => \`${innerTemplate}\`).join('')`;
};
/**
 * Convert conditionals inside an attribute value to JSX template literal syntax
 * Called from convertAttributes after HTML parsing
 * Example: "prefix{{#if cond}}value{{/if}}suffix" -> `prefix${cond ? 'value' : ''}suffix`
 * @param loopArray - Name of the array being iterated (for @last / @first); when inside {{#each arr}}, use 'arr'.
 * @param loopIndex - Index variable for @first / @last / @index inside the current loop scope.
 */
const convertAttributeValue = (value, loopVar = 'item', loopArray, loopIndex = 'index') => {
    const arrayName = loopArray || 'items';
    let result = value;
    let isExpression = false;
    // {{#each this.tags}}{{label}}{{#unless @last}}|{{/unless}}{{/each}} in attribute values
    const nestedEachMatch = value.match(/^\{\{#each\s+([^}]+)\}\}([\s\S]*)\{\{\/each\}\}$/);
    if (nestedEachMatch) {
        isExpression = true;
        const expr = compileNestedEachAttributeExpression(nestedEachMatch[1], nestedEachMatch[2], loopVar, loopIndex);
        return { jsxValue: '${' + expr + '}', isExpression: true };
    }
    // Helper to parse Handlebars helper expressions like (eq properties.layout "layout-1")
    const parseHelper = (expr) => {
        // Normalize @root.properties.xxx to properties.xxx so the existing regex matches
        expr = expr.replace(/@root\.properties\./g, 'properties.');
        // Match (eq left right) or (eq left "string")
        const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (eqMatch) {
            const [, left, right] = eqMatch;
            let leftExpr = left;
            if (left.startsWith('properties.')) {
                const parts = left.replace('properties.', '').split('.');
                leftExpr = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
            }
            return `${leftExpr} === "${right}"`;
        }
        // Match (ne left "string")
        const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
        if (neMatch) {
            const [, left, right] = neMatch;
            let leftExpr = left;
            if (left.startsWith('properties.')) {
                const parts = left.replace('properties.', '').split('.');
                leftExpr = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
            }
            return `${leftExpr} !== "${right}"`;
        }
        // Match (eq left right) with variable/expression operands (no quotes)
        const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
        if (eqVarMatch) {
            const [, left, right] = eqVarMatch;
            const resolveOperand = (operand) => {
                if (operand.startsWith('properties.')) {
                    const parts = operand.replace('properties.', '').split('.');
                    return parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
                }
                if (operand.startsWith('this.')) {
                    return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, operand.replace('this.', ''));
                }
                const parts = operand.split('.');
                if (parts.length > 1) {
                    const [root, ...rest] = parts;
                    if (root === loopVar) {
                        return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, rest.join('.'));
                    }
                    return [root, ...rest].join('?.');
                }
                return (0, utils_1.toCamelCase)(operand);
            };
            return `${resolveOperand(left)} === ${resolveOperand(right)}`;
        }
        return '';
    };
    // Helper to convert property reference or helper expression to JSX expression
    const propToExpr = (prop) => {
        // Resolve ../properties.xxx (parent context in loops) and @root.properties.xxx (root context) to top-level camelCase
        prop = (0, expression_parser_1.resolveParentPropertiesInExpression)(prop);
        // Strip bare @root. prefix (e.g. @root.xxx, which resolves like xxx at root context)
        if (prop.startsWith('@root.')) {
            prop = prop.substring(6);
        }
        // Check if it's a helper expression like (eq ...)
        if (prop.startsWith('(')) {
            const parsed = parseHelper(prop);
            if (parsed)
                return parsed;
        }
        // Handle @first and @last special variables
        if (prop === '@first') {
            return `${loopIndex} === 0`;
        }
        if (prop === '@last') {
            return `${loopIndex} === ${arrayName}?.length - 1`;
        }
        if (prop === '@index') {
            return loopIndex;
        }
        if (prop.startsWith('properties.')) {
            const parts = prop.replace('properties.', '').split('.');
            return parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
        }
        else if (prop.startsWith('this.')) {
            return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, prop.replace('this.', ''));
        }
        else {
            const parts = prop.split('.');
            if (parts.length > 1) {
                const [root, ...rest] = parts;
                if (root === loopVar) {
                    return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, rest.join('.'));
                }
                return [root, ...rest].join('?.');
            }
            return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, prop);
        }
    };
    // Helper to convert inner content that may contain property references
    // Returns an expression that can be concatenated (not a template literal string)
    const convertInnerToExpr = (val) => {
        // Check if val is JUST a property reference
        const justPropMatch = val.match(/^\{\{\s*([^}]+)\s*\}\}$/);
        if (justPropMatch) {
            return propToExpr(justPropMatch[1].trim());
        }
        // Check if val contains property references mixed with static text
        if (val.includes('{{')) {
            // Convert to template literal
            let expr = val;
            // Handle @root.properties.xxx the same way as properties.xxx (root context access)
            expr = expr.replace(/\{\{\s*@root\.properties\.([^}]+)\s*\}\}/g, (_, prop) => {
                const parts = prop.trim().split('.');
                const jsxProp = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
                return '${' + jsxProp + '}';
            });
            expr = expr.replace(/\{\{\s*properties\.([^}]+)\s*\}\}/g, (_, prop) => {
                const parts = prop.trim().split('.');
                const jsxProp = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
                return '${' + jsxProp + '}';
            });
            expr = expr.replace(/\{\{\s*this\.([^}]+)\s*\}\}/g, (_, prop) => {
                return '${' + (0, expression_parser_1.toOptionalChainedAccess)(loopVar, prop.trim()) + '}';
            });
            expr = expr.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g, (_, prop) => {
                if (!prop.startsWith('properties.') && !prop.startsWith('this.')) {
                    return '${' + propToExpr(prop) + '}';
                }
                return '${' + prop + '}';
            });
            return '`' + expr + '`';
        }
        // Plain static text
        return "'" + val.replace(/'/g, "\\'") + "'";
    };
    // Handle {{#if c1}}v1{{else if c2}}v2{{else}}v3{{/if}} (nested else-if chain)
    result = result.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\s+if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, cond1, val1, cond2, val2, val3) => {
        isExpression = true;
        const c1 = propToExpr((0, utils_1.normalizeWhitespace)(cond1));
        const c2 = propToExpr((0, utils_1.normalizeWhitespace)(cond2));
        const v1 = convertInnerToExpr((0, utils_1.collapseWhitespace)(val1));
        const v2 = convertInnerToExpr((0, utils_1.collapseWhitespace)(val2));
        const v3 = convertInnerToExpr((0, utils_1.collapseWhitespace)(val3));
        return '${' + c1 + ' ? ' + v1 + ' : ' + c2 + ' ? ' + v2 + ' : ' + v3 + '}';
    });
    // Handle {{#if c1}}v1{{else if c2}}v2{{/if}} (else-if without final else)
    result = result.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\s+if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, cond1, val1, cond2, val2) => {
        isExpression = true;
        const c1 = propToExpr((0, utils_1.normalizeWhitespace)(cond1));
        const c2 = propToExpr((0, utils_1.normalizeWhitespace)(cond2));
        const v1 = convertInnerToExpr((0, utils_1.collapseWhitespace)(val1));
        const v2 = convertInnerToExpr((0, utils_1.collapseWhitespace)(val2));
        return '${' + c1 + ' ? ' + v1 + ' : ' + c2 + ' ? ' + v2 + " : ''}";
    });
    // Handle {{#if condition}}value{{else}}other{{/if}} pattern
    // Use [\s\S]*? to match across newlines
    result = result.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, condition, ifVal, elseVal) => {
        isExpression = true;
        const condExpr = propToExpr((0, utils_1.normalizeWhitespace)(condition));
        const ifExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(ifVal));
        const elseExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(elseVal));
        return '${' + condExpr + ' ? ' + ifExpr + ' : ' + elseExpr + '}';
    });
    // Handle {{#if condition}}value{{/if}} pattern (no else)
    // Use [\s\S]*? to match across newlines
    result = result.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, condition, ifVal) => {
        isExpression = true;
        const condExpr = propToExpr((0, utils_1.normalizeWhitespace)(condition));
        const ifExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(ifVal));
        return '${' + condExpr + ' ? ' + ifExpr + " : ''}";
    });
    // Handle {{#unless @last}}value{{/unless}} pattern
    // Use [\s\S]*? to match across newlines
    result = result.replace(/\{\{#unless\s+@last\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, unlessVal) => {
        isExpression = true;
        const unlessExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(unlessVal));
        // @last means it's NOT the last item, so we check index < array.length - 1
        return '${' + loopIndex + ' < ' + arrayName + '?.length - 1 ? ' + unlessExpr + " : ''}";
    });
    // Handle {{#unless @first}}value{{/unless}} pattern
    // Use [\s\S]*? to match across newlines
    result = result.replace(/\{\{#unless\s+@first\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, unlessVal) => {
        isExpression = true;
        const unlessExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(unlessVal));
        // @first is true when index === 0, so unless @first means index !== 0
        return '${' + loopIndex + ' !== 0 ? ' + unlessExpr + " : ''}";
    });
    // Handle {{#unless condition}}value{{else}}other{{/unless}} pattern (must run before unless without else)
    result = result.replace(/\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, condition, unlessVal, elseVal) => {
        isExpression = true;
        const condExpr = propToExpr((0, utils_1.normalizeWhitespace)(condition));
        const unlessExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(unlessVal));
        const elseExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(elseVal));
        return '${!' + condExpr + ' ? ' + unlessExpr + ' : ' + elseExpr + '}';
    });
    // Handle {{#unless condition}}value{{/unless}} pattern (general)
    // Use [\s\S]*? to match across newlines
    result = result.replace(/\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, condition, unlessVal) => {
        isExpression = true;
        const condExpr = propToExpr((0, utils_1.normalizeWhitespace)(condition));
        const unlessExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(unlessVal));
        // unless is the opposite of if
        return '${!' + condExpr + ' ? ' + unlessExpr + " : ''}";
    });
    // Also convert remaining {{@root.properties.xxx}} (root context access)
    if (result.includes('{{')) {
        result = result.replace(/\{\{\s*@root\.properties\.([^}]+)\s*\}\}/g, (_, prop) => {
            isExpression = true;
            const parts = prop.trim().split('.');
            const jsxProp = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
            return '${' + jsxProp + '}';
        });
    }
    // Also convert remaining {{properties.xxx}}
    if (result.includes('{{')) {
        result = result.replace(/\{\{\s*properties\.([^}]+)\s*\}\}/g, (_, prop) => {
            isExpression = true;
            const parts = prop.trim().split('.');
            const jsxProp = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
            return '${' + jsxProp + '}';
        });
    }
    // Convert remaining {{this.xxx}} (loop item references via this)
    if (result.includes('{{')) {
        result = result.replace(/\{\{\s*this\.([^}]+)\s*\}\}/g, (_, prop) => {
            isExpression = true;
            return '${' + (0, expression_parser_1.toOptionalChainedAccess)(loopVar, prop.trim()) + '}';
        });
    }
    // Convert remaining general expressions (e.g. {{button.variant}}, {{item.label}})
    if (result.includes('{{')) {
        result = result.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)*)\s*\}\}/g, (_, prop) => {
            isExpression = true;
            return '${' + propToExpr(prop) + '}';
        });
    }
    return { jsxValue: result, isExpression };
};
exports.convertAttributeValue = convertAttributeValue;
/**
 * Pre-process conditional attributes (entire attribute wrapped in {{#if}})
 * Handles two patterns:
 *   1. {{#if condition}}attrName="value"{{/if}}  — attr with value
 *   2. {{#if condition}} attrName{{/if}}          — boolean attr (e.g. selected, disabled)
 * Both are converted to: attrName={condition ? value : undefined}
 */
const preprocessConditionalAttributes = (template) => {
    let result = template;
    // Pattern 1: {{#if condition}} attrName="value" {{/if}} (allow optional whitespace so e.g. srcset is matched)
    const condAttrRegex = /\{\{#if\s+([^}]+)\}\}\s*(\w+(?:-\w+)*)\s*="([^"]*)"\s*\{\{\/if\}\}/g;
    let match;
    while ((match = condAttrRegex.exec(result)) !== null) {
        let condition = match[1].trim();
        const attrName = match[2];
        const attrValue = match[3];
        const fullMatch = match[0];
        const startPos = match.index;
        // Normalize @root.properties.xxx to properties.xxx (root context access)
        if (condition.startsWith('@root.properties.')) {
            condition = condition.replace(/^@root\./, '');
        }
        // Convert condition to JSX expression
        let condExpr = condition;
        if (condition.startsWith('properties.')) {
            const parts = condition.replace('properties.', '').split('.');
            condExpr = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
        }
        else if (condition.startsWith('this.')) {
            condExpr = `item.${condition.replace('this.', '')}`;
        }
        // Convert attribute value to JSX expression
        let valueExpr;
        if (attrValue.includes('{{')) {
            // Value contains handlebars expression (also handles @root.properties.xxx)
            const propMatch = attrValue.match(/\{\{\s*(?:@root\.)?properties\.([^}]+)\s*\}\}/);
            if (propMatch) {
                const parts = propMatch[1].trim().split('.');
                valueExpr = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
            }
            else {
                valueExpr = `'${attrValue}'`;
            }
        }
        else if (attrName === 'style') {
            // For conditional style attributes, convert CSS string to a React style object
            valueExpr = (0, styles_1.cssStringToReactObject)(attrValue);
        }
        else {
            valueExpr = `'${attrValue}'`;
        }
        // Get JSX attribute name
        let jsxAttrName = attrName;
        if (attrName === 'class') {
            jsxAttrName = 'className';
        }
        else if (attrName === 'for') {
            jsxAttrName = 'htmlFor';
        }
        else {
            jsxAttrName = (0, utils_1.toJsxAttrName)(attrName);
        }
        const markerContent = `${condExpr} ? ${valueExpr} : undefined`;
        const replacement = `${jsxAttrName}="__COND_ATTR__${Buffer.from(markerContent).toString('base64')}__END_COND_ATTR__"`;
        result = result.substring(0, startPos) + replacement + result.substring(startPos + fullMatch.length);
        condAttrRegex.lastIndex = startPos + replacement.length;
    }
    // Pattern 2: {{#if condition}} booleanAttr{{/if}} (boolean attribute, no ="value")
    // e.g. {{#if this.selected}} selected{{/if}} or {{#if this.disabled}} disabled{{/if}}
    // Only matches outside attribute values — conditionals inside class="..." etc. are
    // handled later by convertAttributeValue.
    const condBoolRegex = /\{\{#if\s+([^}]+)\}\}\s*(\w+(?:-\w+)*)\s*\{\{\/if\}\}/g;
    while ((match = condBoolRegex.exec(result)) !== null) {
        const fullMatch = match[0];
        const startPos = match.index;
        // Skip if this match is inside an HTML attribute value (between quotes).
        // Find the last `<` before this position and count unescaped quotes in the
        // segment between that `<` and the match, ignoring quotes inside {{...}} blocks.
        const lastTagStart = result.lastIndexOf('<', startPos);
        if (lastTagStart !== -1) {
            const segment = result.substring(lastTagStart, startPos);
            const segmentNoHbs = segment.replace(/\{\{[\s\S]*?\}\}/g, '');
            const quoteCount = (segmentNoHbs.match(/"/g) || []).length;
            if (quoteCount % 2 === 1) {
                // Odd quote count means we're inside an attribute value — skip
                continue;
            }
        }
        let condition = match[1].trim();
        const attrName = match[2];
        // Normalize @root.properties.xxx to properties.xxx (root context access)
        if (condition.startsWith('@root.properties.')) {
            condition = condition.replace(/^@root\./, '');
        }
        let condExpr = condition;
        if (condition.startsWith('properties.')) {
            const parts = condition.replace('properties.', '').split('.');
            condExpr = parts.map((p, i) => i === 0 ? (0, utils_1.toCamelCase)(p) : p).join('?.');
        }
        else if (condition.startsWith('this.')) {
            condExpr = `item.${condition.replace('this.', '')}`;
        }
        const jsxAttrName = (0, utils_1.toJsxAttrName)(attrName);
        const markerContent = `${condExpr} || undefined`;
        const replacement = ` ${jsxAttrName}="__COND_ATTR__${Buffer.from(markerContent).toString('base64')}__END_COND_ATTR__"`;
        result = result.substring(0, startPos) + replacement + result.substring(startPos + fullMatch.length);
        condBoolRegex.lastIndex = startPos + replacement.length;
    }
    return result;
};
exports.preprocessConditionalAttributes = preprocessConditionalAttributes;
/**
 * Pre-process attribute values that contain conditionals
 * This must run before preprocessBlocks to prevent if-markers from appearing inside attributes
 * @param currentLoopArray - When processing loop inner content, pass the array name so {{#unless @last}} etc. get the correct array (e.g. "ctas") instead of default "items"
 * @param currentLoopVar - Loop item variable for this scope (e.g. "provider"); defaults to "item"
 */
const preprocessAttributeConditionals = (template, currentLoopArray, currentLoopVar) => {
    const loopVar = currentLoopVar || 'item';
    let result = template;
    // First handle conditional attributes (entire attribute wrapped in {{#if}})
    result = (0, exports.preprocessConditionalAttributes)(result);
    // Find attributes that contain {{#if or {{#unless
    // We need to manually parse to handle nested quotes inside Handlebars expressions
    let pos = 0;
    while (pos < result.length) {
        // Find next attribute pattern: attrName="
        const attrStartMatch = result.substring(pos).match(/(\w+(?:-\w+)*)="/);
        if (!attrStartMatch)
            break;
        const attrName = attrStartMatch[1];
        const attrStart = pos + attrStartMatch.index;
        const valueStart = attrStart + attrStartMatch[0].length;
        // Find the closing quote, but be careful about quotes inside Handlebars expressions
        let valueEnd = -1;
        let inHandlebars = 0;
        for (let i = valueStart; i < result.length; i++) {
            const char = result[i];
            const nextChar = result[i + 1];
            if (char === '{' && nextChar === '{') {
                inHandlebars++;
                i++; // Skip next char
            }
            else if (char === '}' && nextChar === '}') {
                inHandlebars--;
                i++; // Skip next char
            }
            else if (char === '"' && inHandlebars === 0) {
                valueEnd = i;
                break;
            }
        }
        if (valueEnd === -1) {
            pos = valueStart;
            continue;
        }
        const attrValue = result.substring(valueStart, valueEnd);
        const fullMatch = result.substring(attrStart, valueEnd + 1);
        // Check if this attribute contains a conditional
        if (attrValue.includes('{{#if') || attrValue.includes('{{#unless')) {
            // If this attribute references @last or @first but we don't know the
            // enclosing loop array yet (top-level pass), defer processing until
            // the loop is expanded with the correct array name.
            if (!currentLoopArray && (attrValue.includes('@last') || attrValue.includes('@first'))) {
                pos = valueEnd + 1;
                continue;
            }
            // Convert the attribute value using our helper (pass currentLoopArray for @last / @first)
            const { jsxValue, isExpression } = (0, exports.convertAttributeValue)(attrValue, loopVar, currentLoopArray);
            if (isExpression) {
                // Get the JSX attribute name
                let jsxAttrName = attrName;
                if (attrName === 'class') {
                    jsxAttrName = 'className';
                }
                else if (attrName === 'for') {
                    jsxAttrName = 'htmlFor';
                }
                // Create the replacement with JSX template literal
                const replacement = `${jsxAttrName}={__TEMPLATE_LITERAL__${Buffer.from(jsxValue).toString('base64')}__END_TEMPLATE_LITERAL__}`;
                result = result.substring(0, attrStart) + replacement + result.substring(valueEnd + 1);
                pos = attrStart + replacement.length;
                continue;
            }
        }
        pos = valueEnd + 1;
    }
    return result;
};
exports.preprocessAttributeConditionals = preprocessAttributeConditionals;
/** Ensure className always receives a string (React warns on boolean). */
const ensureClassNameExpr = (jsxName, expr) => jsxName === 'className' ? `String(${expr} ?? '')` : expr;
/**
 * Convert HTML attributes to JSX attributes
 */
const convertAttributes = (element, context) => {
    const attrs = [];
    const loopVar = context.loopVariable || 'item';
    for (const [name, value] of Object.entries(element.attributes)) {
        // Check for conditional attribute marker FIRST — applies to any attribute including style.
        // preprocessConditionalAttributes encodes {{#if cond}}attrName="value"{{/if}} into this marker.
        if (value.includes('__COND_ATTR__')) {
            const condMatch = value.match(/__COND_ATTR__([A-Za-z0-9+/=]+)__END_COND_ATTR__/);
            if (condMatch) {
                const decoded = Buffer.from(condMatch[1], 'base64').toString();
                const jsxAttrForCond = name === 'class' ? 'className' : name === 'for' ? 'htmlFor' : (0, utils_1.toJsxAttrName)(name);
                attrs.push(`${jsxAttrForCond}={${ensureClassNameExpr(jsxAttrForCond, decoded)}}`);
                continue;
            }
        }
        // Convert style to object (special handling)
        if (name === 'style') {
            const styleObj = (0, styles_1.parseStyleToObject)(value, context);
            attrs.push(`style=${styleObj}`);
            continue;
        }
        // Get the JSX attribute name
        const jsxName = (0, utils_1.toJsxAttrName)(name);
        // Check if value contains block conditionals {{#if...}}
        if (value.includes('{{#if')) {
            const { jsxValue, isExpression } = (0, exports.convertAttributeValue)(value, loopVar, context.loopArray, context.loopIndex);
            if (isExpression) {
                const wrapped = jsxName === 'className' ? `\${String(${jsxValue} ?? '')}` : jsxValue;
                attrs.push(`${jsxName}={\`${wrapped}\`}`);
                continue;
            }
        }
        // Handle href with handlebars
        if (name === 'href' && value.includes('{{')) {
            const match = value.match(/\{\{+\s*([^}]+?)\s*\}+\}/);
            if (match) {
                const expr = (0, expression_parser_1.transpileExpression)(match[1], context, loopVar);
                attrs.push(`href={${expr} || '#'}`);
                continue;
            }
        }
        // Handle src/alt with handlebars (nested image objects need optional chaining)
        if ((name === 'src' || name === 'alt') && value.includes('{{')) {
            const match = value.match(/\{\{+\s*([^}]+?)\s*\}+\}/);
            if (match) {
                const expr = (0, expression_parser_1.transpileExpression)(match[1], context, loopVar);
                attrs.push(`${jsxName}={${ensureClassNameExpr(jsxName, expr)}}`);
                continue;
            }
        }
        // Handle other attributes with handlebars (including simple expressions)
        if (value.includes('{{')) {
            const { jsxValue, isExpression } = (0, exports.convertAttributeValue)(value, loopVar, context.loopArray, context.loopIndex);
            if (isExpression) {
                // Check if it's a pure expression or needs template literal
                if (jsxValue.startsWith('${') && jsxValue.endsWith('}') && !jsxValue.includes('${', 2)) {
                    // Simple expression like ${prop} - extract just the expression
                    const expr = jsxValue.slice(2, -1);
                    attrs.push(`${jsxName}={${ensureClassNameExpr(jsxName, expr)}}`);
                }
                else {
                    // Template literal with static parts or multiple expressions
                    const wrapped = jsxName === 'className' ? jsxValue.replace(/\$\{([^}]+)\}/g, (_, e) => `\${String(${e} ?? '')}`) : jsxValue;
                    attrs.push(`${jsxName}={\`${wrapped}\`}`);
                }
                continue;
            }
            // Fallback for simple Handlebars expression
            const match = value.match(/\{\{+\s*([^}]+?)\s*\}+\}/);
            if (match) {
                const expr = (0, expression_parser_1.transpileExpression)(match[1], context, loopVar);
                attrs.push(`${jsxName}={${ensureClassNameExpr(jsxName, expr)}}`);
                continue;
            }
        }
        // Boolean attributes
        if (value === '' || value === name) {
            attrs.push(jsxName);
            continue;
        }
        // Check for template literal marker (already processed by preprocessAttributeConditionals)
        if (value.includes('__TEMPLATE_LITERAL__')) {
            // The value might be wrapped in {} from preprocessing - strip them if present
            let cleanValue = value;
            if (cleanValue.startsWith('{') && cleanValue.endsWith('}')) {
                cleanValue = cleanValue.slice(1, -1);
            }
            attrs.push(`${jsxName}={${ensureClassNameExpr(jsxName, cleanValue)}}`);
            continue;
        }
        // Standard attributes
        attrs.push(`${jsxName}="${value}"`);
    }
    return attrs.join(' ');
};
exports.convertAttributes = convertAttributes;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L2F0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFJSCxtQ0FBOEY7QUFDOUYsMkRBQXdIO0FBQ3hILHFDQUFzRTtBQUV0RTs7O0dBR0c7QUFDSCxNQUFNLDBCQUEwQixHQUFHLENBQ2pDLE1BQWMsRUFDZCxPQUFlLEVBQ1AsRUFBRTtJQUNWLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUU5QixJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNoQyxPQUFPLElBQUEsMkNBQXVCLEVBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFZLEVBQUUsS0FBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUEsbUJBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekcsQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN0QyxPQUFPLElBQUEsMkNBQXVCLEVBQUMsT0FBTyxFQUFFLE9BQU8s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QztRQUNILENBQUM7UUFFRCxxQkFBcUI7UUFDckIsSUFBSSxLQUFLLEtBQUssRUFBRSxJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNuQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BCLFNBQVM7UUFDWCxDQUFDO1FBRUQsMkZBQTJGO1FBQzNGLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUM7WUFDM0MsOEVBQThFO1lBQzlFLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztZQUN2QixJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUMzRCxVQUFVLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sS0FBSyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZFLFNBQVM7UUFDWCxDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3pCLENBQUMsQ0FBQztBQW5IVyxRQUFBLGlCQUFpQixxQkFtSDVCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBdHRyaWJ1dGUgY29udmVyc2lvbiB1dGlsaXRpZXMgZm9yIHRoZSBIYW5kbGViYXJzIHRvIEpTWCB0cmFuc3BpbGVyXG4gKi9cblxuaW1wb3J0IHsgSFRNTEVsZW1lbnQgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0LCBDb252ZXJ0ZWRBdHRyaWJ1dGVWYWx1ZSB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIHRvSnN4QXR0ck5hbWUsIG5vcm1hbGl6ZVdoaXRlc3BhY2UsIGNvbGxhcHNlV2hpdGVzcGFjZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdHJhbnNwaWxlRXhwcmVzc2lvbiwgcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24sIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzIH0gZnJvbSAnLi9leHByZXNzaW9uLXBhcnNlcic7XG5pbXBvcnQgeyBwYXJzZVN0eWxlVG9PYmplY3QsIGNzc1N0cmluZ1RvUmVhY3RPYmplY3QgfSBmcm9tICcuL3N0eWxlcyc7XG5cbi8qKlxuICogUmVzb2x2ZSBhIEhhbmRsZWJhcnMgYXJyYXkgZXhwcmVzc2lvbiBpbnNpZGUgYW4gYXR0cmlidXRlIHRvIGEgSlNYIGFjY2Vzc29yLlxuICogRXhhbXBsZXM6IHRoaXMudGFncyAtPiBwcm92aWRlcj8udGFncywgcHJvcGVydGllcy5wcm92aWRlcnMgLT4gcHJvdmlkZXJzXG4gKi9cbmNvbnN0IHJlc29sdmVBcnJheVJlZkluQXR0cmlidXRlID0gKFxuICBzb3VyY2U6IHN0cmluZyxcbiAgbG9vcFZhcjogc3RyaW5nLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgdHJpbW1lZCA9IHNvdXJjZS50cmltKCk7XG5cbiAgaWYgKHRyaW1tZWQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCB0cmltbWVkLnJlcGxhY2UoJ3RoaXMuJywgJycpKTtcbiAgfVxuXG4gIGlmICh0cmltbWVkLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICBjb25zdCBwYXJ0cyA9IHRyaW1tZWQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICByZXR1cm4gcGFydHMubWFwKChwYXJ0OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpID0+IChpbmRleCA9PT0gMCA/IHRvQ2FtZWxDYXNlKHBhcnQpIDogcGFydCkpLmpvaW4oJz8uJyk7XG4gIH1cblxuICBpZiAodHJpbW1lZC5zdGFydHNXaXRoKGAke2xvb3BWYXJ9LmApKSB7XG4gICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHRyaW1tZWQucmVwbGFjZShgJHtsb29wVmFyfS5gLCAnJykpO1xuICB9XG5cbiAgY29uc3QgZG90SW5kZXggPSB0cmltbWVkLmluZGV4T2YoJy4nKTtcbiAgaWYgKGRvdEluZGV4ID4gMCkge1xuICAgIGNvbnN0IHJvb3QgPSB0cmltbWVkLnNsaWNlKDAsIGRvdEluZGV4KTtcbiAgICBjb25zdCByZXN0ID0gdHJpbW1lZC5zbGljZShkb3RJbmRleCArIDEpO1xuICAgIGlmIChyb290ID09PSBsb29wVmFyKSB7XG4gICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcmVzdCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRvQ2FtZWxDYXNlKHRyaW1tZWQpO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IHt7I2VhY2ggYXJyYXl9fWJvZHl7ey9lYWNofX0gaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSB0byAubWFwKCkuam9pbigpLlxuICovXG5jb25zdCBjb21waWxlTmVzdGVkRWFjaEF0dHJpYnV0ZUV4cHJlc3Npb24gPSAoXG4gIGFycmF5U3BlYzogc3RyaW5nLFxuICBib2R5OiBzdHJpbmcsXG4gIGxvb3BWYXI6IHN0cmluZyxcbiAgbG9vcEluZGV4OiBzdHJpbmcsXG4pOiBzdHJpbmcgPT4ge1xuICBsZXQgYXJyYXlTb3VyY2UgPSBhcnJheVNwZWMudHJpbSgpO1xuICBsZXQgbmVzdGVkVmFyID0gJ3N1Ykl0ZW0nO1xuICBsZXQgbmVzdGVkSW5kZXggPSAnc3ViSW5kZXgnO1xuXG4gIGNvbnN0IGFsaWFzTWF0Y2ggPSBhcnJheVNvdXJjZS5tYXRjaCgvXiguKz8pXFxzK2FzXFxzK1xcfChcXHcrKSg/OlxccysoXFx3KykpP1xcfCQvKTtcbiAgaWYgKGFsaWFzTWF0Y2gpIHtcbiAgICBhcnJheVNvdXJjZSA9IGFsaWFzTWF0Y2hbMV0udHJpbSgpO1xuICAgIG5lc3RlZFZhciA9IGFsaWFzTWF0Y2hbMl07XG4gICAgaWYgKGFsaWFzTWF0Y2hbM10pIHtcbiAgICAgIG5lc3RlZEluZGV4ID0gYWxpYXNNYXRjaFszXTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBhcnJheVJlZiA9IHJlc29sdmVBcnJheVJlZkluQXR0cmlidXRlKGFycmF5U291cmNlLCBsb29wVmFyKTtcbiAgY29uc3QgeyBqc3hWYWx1ZTogYm9keUpzeCB9ID0gY29udmVydEF0dHJpYnV0ZVZhbHVlKGJvZHksIG5lc3RlZFZhciwgYXJyYXlSZWYsIG5lc3RlZEluZGV4KTtcblxuICBpZiAoYm9keUpzeC5zdGFydHNXaXRoKCckeycpICYmIGJvZHlKc3guZW5kc1dpdGgoJ30nKSAmJiAhYm9keUpzeC5pbmNsdWRlcygnJHsnLCAyKSkge1xuICAgIGNvbnN0IGlubmVyRXhwciA9IGJvZHlKc3guc2xpY2UoMiwgLTEpO1xuICAgIHJldHVybiBgKCR7YXJyYXlSZWZ9IHx8IFtdKS5tYXAoKCR7bmVzdGVkVmFyfSwgJHtuZXN0ZWRJbmRleH0pID0+ICR7aW5uZXJFeHByfSkuam9pbignJylgO1xuICB9XG5cbiAgY29uc3QgaW5uZXJUZW1wbGF0ZSA9IGJvZHlKc3guc3RhcnRzV2l0aCgnYCcpICYmIGJvZHlKc3guZW5kc1dpdGgoJ2AnKVxuICAgID8gYm9keUpzeC5zbGljZSgxLCAtMSlcbiAgICA6IGJvZHlKc3g7XG5cbiAgcmV0dXJuIGAoJHthcnJheVJlZn0gfHwgW10pLm1hcCgoJHtuZXN0ZWRWYXJ9LCAke25lc3RlZEluZGV4fSkgPT4gXFxgJHtpbm5lclRlbXBsYXRlfVxcYCkuam9pbignJylgO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IGNvbmRpdGlvbmFscyBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIHRvIEpTWCB0ZW1wbGF0ZSBsaXRlcmFsIHN5bnRheFxuICogQ2FsbGVkIGZyb20gY29udmVydEF0dHJpYnV0ZXMgYWZ0ZXIgSFRNTCBwYXJzaW5nXG4gKiBFeGFtcGxlOiBcInByZWZpeHt7I2lmIGNvbmR9fXZhbHVle3svaWZ9fXN1ZmZpeFwiIC0+IGBwcmVmaXgke2NvbmQgPyAndmFsdWUnIDogJyd9c3VmZml4YFxuICogQHBhcmFtIGxvb3BBcnJheSAtIE5hbWUgb2YgdGhlIGFycmF5IGJlaW5nIGl0ZXJhdGVkIChmb3IgQGxhc3QgLyBAZmlyc3QpOyB3aGVuIGluc2lkZSB7eyNlYWNoIGFycn19LCB1c2UgJ2FycicuXG4gKiBAcGFyYW0gbG9vcEluZGV4IC0gSW5kZXggdmFyaWFibGUgZm9yIEBmaXJzdCAvIEBsYXN0IC8gQGluZGV4IGluc2lkZSB0aGUgY3VycmVudCBsb29wIHNjb3BlLlxuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZVZhbHVlID0gKFxuICB2YWx1ZTogc3RyaW5nLFxuICBsb29wVmFyOiBzdHJpbmcgPSAnaXRlbScsXG4gIGxvb3BBcnJheT86IHN0cmluZyxcbiAgbG9vcEluZGV4OiBzdHJpbmcgPSAnaW5kZXgnLFxuKTogQ29udmVydGVkQXR0cmlidXRlVmFsdWUgPT4ge1xuICBjb25zdCBhcnJheU5hbWUgPSBsb29wQXJyYXkgfHwgJ2l0ZW1zJztcbiAgbGV0IHJlc3VsdCA9IHZhbHVlO1xuICBsZXQgaXNFeHByZXNzaW9uID0gZmFsc2U7XG5cbiAgLy8ge3sjZWFjaCB0aGlzLnRhZ3N9fXt7bGFiZWx9fXt7I3VubGVzcyBAbGFzdH19fHt7L3VubGVzc319e3svZWFjaH19IGluIGF0dHJpYnV0ZSB2YWx1ZXNcbiAgY29uc3QgbmVzdGVkRWFjaE1hdGNoID0gdmFsdWUubWF0Y2goL15cXHtcXHsjZWFjaFxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKilcXHtcXHtcXC9lYWNoXFx9XFx9JC8pO1xuICBpZiAobmVzdGVkRWFjaE1hdGNoKSB7XG4gICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICBjb25zdCBleHByID0gY29tcGlsZU5lc3RlZEVhY2hBdHRyaWJ1dGVFeHByZXNzaW9uKFxuICAgICAgbmVzdGVkRWFjaE1hdGNoWzFdLFxuICAgICAgbmVzdGVkRWFjaE1hdGNoWzJdLFxuICAgICAgbG9vcFZhcixcbiAgICAgIGxvb3BJbmRleCxcbiAgICApO1xuICAgIHJldHVybiB7IGpzeFZhbHVlOiAnJHsnICsgZXhwciArICd9JywgaXNFeHByZXNzaW9uOiB0cnVlIH07XG4gIH1cbiAgXG4gIC8vIEhlbHBlciB0byBwYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gIGNvbnN0IHBhcnNlSGVscGVyID0gKGV4cHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgLy8gTm9ybWFsaXplIEByb290LnByb3BlcnRpZXMueHh4IHRvIHByb3BlcnRpZXMueHh4IHNvIHRoZSBleGlzdGluZyByZWdleCBtYXRjaGVzXG4gICAgZXhwciA9IGV4cHIucmVwbGFjZSgvQHJvb3RcXC5wcm9wZXJ0aWVzXFwuL2csICdwcm9wZXJ0aWVzLicpO1xuICAgIC8vIE1hdGNoIChlcSBsZWZ0IHJpZ2h0KSBvciAoZXEgbGVmdCBcInN0cmluZ1wiKVxuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICAgIGxlZnRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPT09IFwiJHtyaWdodH1cImA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwic3RyaW5nXCIpXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgbGVmdEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2xlZnRFeHByfSAhPT0gXCIke3JpZ2h0fVwiYDtcbiAgICB9XG5cbiAgICAvLyBNYXRjaCAoZXEgbGVmdCByaWdodCkgd2l0aCB2YXJpYWJsZS9leHByZXNzaW9uIG9wZXJhbmRzIChubyBxdW90ZXMpXG4gICAgY29uc3QgZXFWYXJNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICAgIGlmIChlcVZhck1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcVZhck1hdGNoO1xuICAgICAgY29uc3QgcmVzb2x2ZU9wZXJhbmQgPSAob3BlcmFuZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAgICAgaWYgKG9wZXJhbmQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gb3BlcmFuZC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICAgIHJldHVybiBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcGVyYW5kLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgb3BlcmFuZC5yZXBsYWNlKCd0aGlzLicsICcnKSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFydHMgPSBvcGVyYW5kLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgY29uc3QgW3Jvb3QsIC4uLnJlc3RdID0gcGFydHM7XG4gICAgICAgICAgaWYgKHJvb3QgPT09IGxvb3BWYXIpIHtcbiAgICAgICAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCByZXN0LmpvaW4oJy4nKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBbcm9vdCwgLi4ucmVzdF0uam9pbignPy4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdG9DYW1lbENhc2Uob3BlcmFuZCk7XG4gICAgICB9O1xuICAgICAgcmV0dXJuIGAke3Jlc29sdmVPcGVyYW5kKGxlZnQpfSA9PT0gJHtyZXNvbHZlT3BlcmFuZChyaWdodCl9YDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICcnO1xuICB9O1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgcHJvcGVydHkgcmVmZXJlbmNlIG9yIGhlbHBlciBleHByZXNzaW9uIHRvIEpTWCBleHByZXNzaW9uXG4gIGNvbnN0IHByb3BUb0V4cHIgPSAocHJvcDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBSZXNvbHZlIC4uL3Byb3BlcnRpZXMueHh4IChwYXJlbnQgY29udGV4dCBpbiBsb29wcykgYW5kIEByb290LnByb3BlcnRpZXMueHh4IChyb290IGNvbnRleHQpIHRvIHRvcC1sZXZlbCBjYW1lbENhc2VcbiAgICBwcm9wID0gcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24ocHJvcCk7XG4gICAgLy8gU3RyaXAgYmFyZSBAcm9vdC4gcHJlZml4IChlLmcuIEByb290Lnh4eCwgd2hpY2ggcmVzb2x2ZXMgbGlrZSB4eHggYXQgcm9vdCBjb250ZXh0KVxuICAgIGlmIChwcm9wLnN0YXJ0c1dpdGgoJ0Byb290LicpKSB7XG4gICAgICBwcm9wID0gcHJvcC5zdWJzdHJpbmcoNik7XG4gICAgfVxuICAgIC8vIENoZWNrIGlmIGl0J3MgYSBoZWxwZXIgZXhwcmVzc2lvbiBsaWtlIChlcSAuLi4pXG4gICAgaWYgKHByb3Auc3RhcnRzV2l0aCgnKCcpKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUhlbHBlcihwcm9wKTtcbiAgICAgIGlmIChwYXJzZWQpIHJldHVybiBwYXJzZWQ7XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBAZmlyc3QgYW5kIEBsYXN0IHNwZWNpYWwgdmFyaWFibGVzXG4gICAgaWYgKHByb3AgPT09ICdAZmlyc3QnKSB7XG4gICAgICByZXR1cm4gYCR7bG9vcEluZGV4fSA9PT0gMGA7XG4gICAgfVxuICAgIGlmIChwcm9wID09PSAnQGxhc3QnKSB7XG4gICAgICByZXR1cm4gYCR7bG9vcEluZGV4fSA9PT0gJHthcnJheU5hbWV9Py5sZW5ndGggLSAxYDtcbiAgICB9XG4gICAgaWYgKHByb3AgPT09ICdAaW5kZXgnKSB7XG4gICAgICByZXR1cm4gbG9vcEluZGV4O1xuICAgIH1cbiAgICBcbiAgICBpZiAocHJvcC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3AucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIHJldHVybiBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgIH0gZWxzZSBpZiAocHJvcC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC5yZXBsYWNlKCd0aGlzLicsICcnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgY29uc3QgW3Jvb3QsIC4uLnJlc3RdID0gcGFydHM7XG4gICAgICAgIGlmIChyb290ID09PSBsb29wVmFyKSB7XG4gICAgICAgICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHJlc3Quam9pbignLicpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW3Jvb3QsIC4uLnJlc3RdLmpvaW4oJz8uJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcCk7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgaW5uZXIgY29udGVudCB0aGF0IG1heSBjb250YWluIHByb3BlcnR5IHJlZmVyZW5jZXNcbiAgLy8gUmV0dXJucyBhbiBleHByZXNzaW9uIHRoYXQgY2FuIGJlIGNvbmNhdGVuYXRlZCAobm90IGEgdGVtcGxhdGUgbGl0ZXJhbCBzdHJpbmcpXG4gIGNvbnN0IGNvbnZlcnRJbm5lclRvRXhwciA9ICh2YWw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgdmFsIGlzIEpVU1QgYSBwcm9wZXJ0eSByZWZlcmVuY2VcbiAgICBjb25zdCBqdXN0UHJvcE1hdGNoID0gdmFsLm1hdGNoKC9eXFx7XFx7XFxzKihbXn1dKylcXHMqXFx9XFx9JC8pO1xuICAgIGlmIChqdXN0UHJvcE1hdGNoKSB7XG4gICAgICByZXR1cm4gcHJvcFRvRXhwcihqdXN0UHJvcE1hdGNoWzFdLnRyaW0oKSk7XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGlmIHZhbCBjb250YWlucyBwcm9wZXJ0eSByZWZlcmVuY2VzIG1peGVkIHdpdGggc3RhdGljIHRleHRcbiAgICBpZiAodmFsLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICAvLyBDb252ZXJ0IHRvIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgIGxldCBleHByID0gdmFsO1xuICAgICAgLy8gSGFuZGxlIEByb290LnByb3BlcnRpZXMueHh4IHRoZSBzYW1lIHdheSBhcyBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccypAcm9vdFxcLnByb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBqc3hQcm9wID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgICAgfSk7XG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3AudHJpbSgpLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccyp0aGlzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIHJldHVybiAnJHsnICsgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC50cmltKCkpICsgJ30nO1xuICAgICAgfSk7XG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05X10qKSopXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgaWYgKCFwcm9wLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgJiYgIXByb3Auc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICAgIHJldHVybiAnJHsnICsgcHJvcFRvRXhwcihwcm9wKSArICd9JztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyR7JyArIHByb3AgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiAnYCcgKyBleHByICsgJ2AnO1xuICAgIH1cbiAgICBcbiAgICAvLyBQbGFpbiBzdGF0aWMgdGV4dFxuICAgIHJldHVybiBcIidcIiArIHZhbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIikgKyBcIidcIjtcbiAgfTtcbiAgXG4gIC8vIEhhbmRsZSB7eyNpZiBjMX19djF7e2Vsc2UgaWYgYzJ9fXYye3tlbHNlfX12M3t7L2lmfX0gKG5lc3RlZCBlbHNlLWlmIGNoYWluKVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFxzK2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kMTogc3RyaW5nLCB2YWwxOiBzdHJpbmcsIGNvbmQyOiBzdHJpbmcsIHZhbDI6IHN0cmluZywgdmFsMzogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgYzEgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZDEpKTtcbiAgICAgIGNvbnN0IGMyID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmQyKSk7XG4gICAgICBjb25zdCB2MSA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodmFsMSkpO1xuICAgICAgY29uc3QgdjIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHZhbDIpKTtcbiAgICAgIGNvbnN0IHYzID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh2YWwzKSk7XG4gICAgICByZXR1cm4gJyR7JyArIGMxICsgJyA/ICcgKyB2MSArICcgOiAnICsgYzIgKyAnID8gJyArIHYyICsgJyA6ICcgKyB2MyArICd9JztcbiAgICB9XG4gICk7XG5cbiAgLy8gSGFuZGxlIHt7I2lmIGMxfX12MXt7ZWxzZSBpZiBjMn19djJ7ey9pZn19IChlbHNlLWlmIHdpdGhvdXQgZmluYWwgZWxzZSlcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxccytpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kMTogc3RyaW5nLCB2YWwxOiBzdHJpbmcsIGNvbmQyOiBzdHJpbmcsIHZhbDI6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGMxID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmQxKSk7XG4gICAgICBjb25zdCBjMiA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kMikpO1xuICAgICAgY29uc3QgdjEgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHZhbDEpKTtcbiAgICAgIGNvbnN0IHYyID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh2YWwyKSk7XG4gICAgICByZXR1cm4gJyR7JyArIGMxICsgJyA/ICcgKyB2MSArICcgOiAnICsgYzIgKyAnID8gJyArIHYyICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG5cbiAgLy8gSGFuZGxlIHt7I2lmIGNvbmRpdGlvbn19dmFsdWV7e2Vsc2V9fW90aGVye3svaWZ9fSBwYXR0ZXJuXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgaWZWYWw6IHN0cmluZywgZWxzZVZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgY29uZEV4cHIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZGl0aW9uKSk7XG4gICAgICBjb25zdCBpZkV4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKGlmVmFsKSk7XG4gICAgICBjb25zdCBlbHNlRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoZWxzZVZhbCkpO1xuICAgICAgXG4gICAgICByZXR1cm4gJyR7JyArIGNvbmRFeHByICsgJyA/ICcgKyBpZkV4cHIgKyAnIDogJyArIGVsc2VFeHByICsgJ30nO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyNpZiBjb25kaXRpb259fXZhbHVle3svaWZ9fSBwYXR0ZXJuIChubyBlbHNlKVxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgaWZWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgaWZFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShpZlZhbCkpO1xuICAgICAgXG4gICAgICByZXR1cm4gJyR7JyArIGNvbmRFeHByICsgJyA/ICcgKyBpZkV4cHIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgQGxhc3R9fXZhbHVle3svdW5sZXNzfX0gcGF0dGVyblxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCB1bmxlc3NFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh1bmxlc3NWYWwpKTtcbiAgICAgIC8vIEBsYXN0IG1lYW5zIGl0J3MgTk9UIHRoZSBsYXN0IGl0ZW0sIHNvIHdlIGNoZWNrIGluZGV4IDwgYXJyYXkubGVuZ3RoIC0gMVxuICAgICAgcmV0dXJuICckeycgKyBsb29wSW5kZXggKyAnIDwgJyArIGFycmF5TmFtZSArICc/Lmxlbmd0aCAtIDEgPyAnICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBAZmlyc3R9fXZhbHVle3svdW5sZXNzfX0gcGF0dGVyblxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIHVubGVzc1ZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICAvLyBAZmlyc3QgaXMgdHJ1ZSB3aGVuIGluZGV4ID09PSAwLCBzbyB1bmxlc3MgQGZpcnN0IG1lYW5zIGluZGV4ICE9PSAwXG4gICAgICByZXR1cm4gJyR7JyArIGxvb3BJbmRleCArICcgIT09IDAgPyAnICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgY29uZGl0aW9ufX12YWx1ZXt7ZWxzZX19b3RoZXJ7ey91bmxlc3N9fSBwYXR0ZXJuIChtdXN0IHJ1biBiZWZvcmUgdW5sZXNzIHdpdGhvdXQgZWxzZSlcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcsIGVsc2VWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICBjb25zdCBlbHNlRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoZWxzZVZhbCkpO1xuXG4gICAgICByZXR1cm4gJyR7IScgKyBjb25kRXhwciArICcgPyAnICsgdW5sZXNzRXhwciArICcgOiAnICsgZWxzZUV4cHIgKyAnfSc7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBjb25kaXRpb259fXZhbHVle3svdW5sZXNzfX0gcGF0dGVybiAoZ2VuZXJhbClcbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgXG4gICAgICAvLyB1bmxlc3MgaXMgdGhlIG9wcG9zaXRlIG9mIGlmXG4gICAgICByZXR1cm4gJyR7IScgKyBjb25kRXhwciArICcgPyAnICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQWxzbyBjb252ZXJ0IHJlbWFpbmluZyB7e0Byb290LnByb3BlcnRpZXMueHh4fX0gKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKkByb290XFwucHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQWxzbyBjb252ZXJ0IHJlbWFpbmluZyB7e3Byb3BlcnRpZXMueHh4fX1cbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydCByZW1haW5pbmcge3t0aGlzLnh4eH19IChsb29wIGl0ZW0gcmVmZXJlbmNlcyB2aWEgdGhpcylcbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqdGhpc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIHJldHVybiAnJHsnICsgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC50cmltKCkpICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydCByZW1haW5pbmcgZ2VuZXJhbCBleHByZXNzaW9ucyAoZS5nLiB7e2J1dHRvbi52YXJpYW50fX0sIHt7aXRlbS5sYWJlbH19KVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccyooW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfLV0qKSopXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICByZXR1cm4gJyR7JyArIHByb3BUb0V4cHIocHJvcCkgKyAnfSc7XG4gICAgfSk7XG4gIH1cbiAgXG4gIHJldHVybiB7IGpzeFZhbHVlOiByZXN1bHQsIGlzRXhwcmVzc2lvbiB9O1xufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyBjb25kaXRpb25hbCBhdHRyaWJ1dGVzIChlbnRpcmUgYXR0cmlidXRlIHdyYXBwZWQgaW4ge3sjaWZ9fSlcbiAqIEhhbmRsZXMgdHdvIHBhdHRlcm5zOlxuICogICAxLiB7eyNpZiBjb25kaXRpb259fWF0dHJOYW1lPVwidmFsdWVcInt7L2lmfX0gIOKAlCBhdHRyIHdpdGggdmFsdWVcbiAqICAgMi4ge3sjaWYgY29uZGl0aW9ufX0gYXR0ck5hbWV7ey9pZn19ICAgICAgICAgIOKAlCBib29sZWFuIGF0dHIgKGUuZy4gc2VsZWN0ZWQsIGRpc2FibGVkKVxuICogQm90aCBhcmUgY29udmVydGVkIHRvOiBhdHRyTmFtZT17Y29uZGl0aW9uID8gdmFsdWUgOiB1bmRlZmluZWR9XG4gKi9cbmV4cG9ydCBjb25zdCBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzID0gKHRlbXBsYXRlOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBsZXQgcmVzdWx0ID0gdGVtcGxhdGU7XG4gIFxuICAvLyBQYXR0ZXJuIDE6IHt7I2lmIGNvbmRpdGlvbn19IGF0dHJOYW1lPVwidmFsdWVcIiB7ey9pZn19IChhbGxvdyBvcHRpb25hbCB3aGl0ZXNwYWNlIHNvIGUuZy4gc3Jjc2V0IGlzIG1hdGNoZWQpXG4gIGNvbnN0IGNvbmRBdHRyUmVnZXggPSAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH1cXHMqKFxcdysoPzotXFx3KykqKVxccyo9XCIoW15cIl0qKVwiXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBjb25kQXR0clJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBsZXQgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgY29uc3QgYXR0clZhbHVlID0gbWF0Y2hbM107XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBOb3JtYWxpemUgQHJvb3QucHJvcGVydGllcy54eHggdG8gcHJvcGVydGllcy54eHggKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gICAgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCdAcm9vdC5wcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25kaXRpb24gPSBjb25kaXRpb24ucmVwbGFjZSgvXkByb290XFwuLywgJycpO1xuICAgIH1cblxuICAgIC8vIENvbnZlcnQgY29uZGl0aW9uIHRvIEpTWCBleHByZXNzaW9uXG4gICAgbGV0IGNvbmRFeHByID0gY29uZGl0aW9uO1xuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBjb25kaXRpb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbmRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25kRXhwciA9IGBpdGVtLiR7Y29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnZlcnQgYXR0cmlidXRlIHZhbHVlIHRvIEpTWCBleHByZXNzaW9uXG4gICAgbGV0IHZhbHVlRXhwcjogc3RyaW5nO1xuICAgIGlmIChhdHRyVmFsdWUuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIC8vIFZhbHVlIGNvbnRhaW5zIGhhbmRsZWJhcnMgZXhwcmVzc2lvbiAoYWxzbyBoYW5kbGVzIEByb290LnByb3BlcnRpZXMueHh4KVxuICAgICAgY29uc3QgcHJvcE1hdGNoID0gYXR0clZhbHVlLm1hdGNoKC9cXHtcXHtcXHMqKD86QHJvb3RcXC4pP3Byb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS8pO1xuICAgICAgaWYgKHByb3BNYXRjaCkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3BNYXRjaFsxXS50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgdmFsdWVFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlRXhwciA9IGAnJHthdHRyVmFsdWV9J2A7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ3N0eWxlJykge1xuICAgICAgLy8gRm9yIGNvbmRpdGlvbmFsIHN0eWxlIGF0dHJpYnV0ZXMsIGNvbnZlcnQgQ1NTIHN0cmluZyB0byBhIFJlYWN0IHN0eWxlIG9iamVjdFxuICAgICAgdmFsdWVFeHByID0gY3NzU3RyaW5nVG9SZWFjdE9iamVjdChhdHRyVmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZUV4cHIgPSBgJyR7YXR0clZhbHVlfSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZXQgSlNYIGF0dHJpYnV0ZSBuYW1lXG4gICAgbGV0IGpzeEF0dHJOYW1lID0gYXR0ck5hbWU7XG4gICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdjbGFzc05hbWUnO1xuICAgIH0gZWxzZSBpZiAoYXR0ck5hbWUgPT09ICdmb3InKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICB9IGVsc2Uge1xuICAgICAganN4QXR0ck5hbWUgPSB0b0pzeEF0dHJOYW1lKGF0dHJOYW1lKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSA/ICR7dmFsdWVFeHByfSA6IHVuZGVmaW5lZGA7XG4gICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQXR0clJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICAvLyBQYXR0ZXJuIDI6IHt7I2lmIGNvbmRpdGlvbn19IGJvb2xlYW5BdHRye3svaWZ9fSAoYm9vbGVhbiBhdHRyaWJ1dGUsIG5vID1cInZhbHVlXCIpXG4gIC8vIGUuZy4ge3sjaWYgdGhpcy5zZWxlY3RlZH19IHNlbGVjdGVke3svaWZ9fSBvciB7eyNpZiB0aGlzLmRpc2FibGVkfX0gZGlzYWJsZWR7ey9pZn19XG4gIC8vIE9ubHkgbWF0Y2hlcyBvdXRzaWRlIGF0dHJpYnV0ZSB2YWx1ZXMg4oCUIGNvbmRpdGlvbmFscyBpbnNpZGUgY2xhc3M9XCIuLi5cIiBldGMuIGFyZVxuICAvLyBoYW5kbGVkIGxhdGVyIGJ5IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZS5cbiAgY29uc3QgY29uZEJvb2xSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfVxccyooXFx3Kyg/Oi1cXHcrKSopXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICB3aGlsZSAoKG1hdGNoID0gY29uZEJvb2xSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBTa2lwIGlmIHRoaXMgbWF0Y2ggaXMgaW5zaWRlIGFuIEhUTUwgYXR0cmlidXRlIHZhbHVlIChiZXR3ZWVuIHF1b3RlcykuXG4gICAgLy8gRmluZCB0aGUgbGFzdCBgPGAgYmVmb3JlIHRoaXMgcG9zaXRpb24gYW5kIGNvdW50IHVuZXNjYXBlZCBxdW90ZXMgaW4gdGhlXG4gICAgLy8gc2VnbWVudCBiZXR3ZWVuIHRoYXQgYDxgIGFuZCB0aGUgbWF0Y2gsIGlnbm9yaW5nIHF1b3RlcyBpbnNpZGUge3suLi59fSBibG9ja3MuXG4gICAgY29uc3QgbGFzdFRhZ1N0YXJ0ID0gcmVzdWx0Lmxhc3RJbmRleE9mKCc8Jywgc3RhcnRQb3MpO1xuICAgIGlmIChsYXN0VGFnU3RhcnQgIT09IC0xKSB7XG4gICAgICBjb25zdCBzZWdtZW50ID0gcmVzdWx0LnN1YnN0cmluZyhsYXN0VGFnU3RhcnQsIHN0YXJ0UG9zKTtcbiAgICAgIGNvbnN0IHNlZ21lbnROb0hicyA9IHNlZ21lbnQucmVwbGFjZSgvXFx7XFx7W1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gICAgICBjb25zdCBxdW90ZUNvdW50ID0gKHNlZ21lbnROb0hicy5tYXRjaCgvXCIvZykgfHwgW10pLmxlbmd0aDtcbiAgICAgIGlmIChxdW90ZUNvdW50ICUgMiA9PT0gMSkge1xuICAgICAgICAvLyBPZGQgcXVvdGUgY291bnQgbWVhbnMgd2UncmUgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSDigJQgc2tpcFxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgbGV0IGNvbmRpdGlvbiA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IG1hdGNoWzJdO1xuICAgIFxuICAgIC8vIE5vcm1hbGl6ZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0byBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ0Byb290LnByb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbmRpdGlvbiA9IGNvbmRpdGlvbi5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgfVxuICAgIFxuICAgIGxldCBjb25kRXhwciA9IGNvbmRpdGlvbjtcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gY29uZGl0aW9uLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25kRXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgfSBlbHNlIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uZEV4cHIgPSBgaXRlbS4ke2NvbmRpdGlvbi5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBqc3hBdHRyTmFtZSA9IHRvSnN4QXR0ck5hbWUoYXR0ck5hbWUpO1xuICAgIGNvbnN0IG1hcmtlckNvbnRlbnQgPSBgJHtjb25kRXhwcn0gfHwgdW5kZWZpbmVkYDtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IGAgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQm9vbFJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyBhdHRyaWJ1dGUgdmFsdWVzIHRoYXQgY29udGFpbiBjb25kaXRpb25hbHNcbiAqIFRoaXMgbXVzdCBydW4gYmVmb3JlIHByZXByb2Nlc3NCbG9ja3MgdG8gcHJldmVudCBpZi1tYXJrZXJzIGZyb20gYXBwZWFyaW5nIGluc2lkZSBhdHRyaWJ1dGVzXG4gKiBAcGFyYW0gY3VycmVudExvb3BBcnJheSAtIFdoZW4gcHJvY2Vzc2luZyBsb29wIGlubmVyIGNvbnRlbnQsIHBhc3MgdGhlIGFycmF5IG5hbWUgc28ge3sjdW5sZXNzIEBsYXN0fX0gZXRjLiBnZXQgdGhlIGNvcnJlY3QgYXJyYXkgKGUuZy4gXCJjdGFzXCIpIGluc3RlYWQgb2YgZGVmYXVsdCBcIml0ZW1zXCJcbiAqIEBwYXJhbSBjdXJyZW50TG9vcFZhciAtIExvb3AgaXRlbSB2YXJpYWJsZSBmb3IgdGhpcyBzY29wZSAoZS5nLiBcInByb3ZpZGVyXCIpOyBkZWZhdWx0cyB0byBcIml0ZW1cIlxuICovXG5leHBvcnQgY29uc3QgcHJlcHJvY2Vzc0F0dHJpYnV0ZUNvbmRpdGlvbmFscyA9IChcbiAgdGVtcGxhdGU6IHN0cmluZyxcbiAgY3VycmVudExvb3BBcnJheT86IHN0cmluZyxcbiAgY3VycmVudExvb3BWYXI/OiBzdHJpbmcsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsb29wVmFyID0gY3VycmVudExvb3BWYXIgfHwgJ2l0ZW0nO1xuICBsZXQgcmVzdWx0ID0gdGVtcGxhdGU7XG4gIFxuICAvLyBGaXJzdCBoYW5kbGUgY29uZGl0aW9uYWwgYXR0cmlidXRlcyAoZW50aXJlIGF0dHJpYnV0ZSB3cmFwcGVkIGluIHt7I2lmfX0pXG4gIHJlc3VsdCA9IHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMocmVzdWx0KTtcbiAgXG4gIC8vIEZpbmQgYXR0cmlidXRlcyB0aGF0IGNvbnRhaW4ge3sjaWYgb3Ige3sjdW5sZXNzXG4gIC8vIFdlIG5lZWQgdG8gbWFudWFsbHkgcGFyc2UgdG8gaGFuZGxlIG5lc3RlZCBxdW90ZXMgaW5zaWRlIEhhbmRsZWJhcnMgZXhwcmVzc2lvbnNcbiAgbGV0IHBvcyA9IDA7XG4gIHdoaWxlIChwb3MgPCByZXN1bHQubGVuZ3RoKSB7XG4gICAgLy8gRmluZCBuZXh0IGF0dHJpYnV0ZSBwYXR0ZXJuOiBhdHRyTmFtZT1cIlxuICAgIGNvbnN0IGF0dHJTdGFydE1hdGNoID0gcmVzdWx0LnN1YnN0cmluZyhwb3MpLm1hdGNoKC8oXFx3Kyg/Oi1cXHcrKSopPVwiLyk7XG4gICAgaWYgKCFhdHRyU3RhcnRNYXRjaCkgYnJlYWs7XG4gICAgXG4gICAgY29uc3QgYXR0ck5hbWUgPSBhdHRyU3RhcnRNYXRjaFsxXTtcbiAgICBjb25zdCBhdHRyU3RhcnQgPSBwb3MgKyBhdHRyU3RhcnRNYXRjaC5pbmRleCE7XG4gICAgY29uc3QgdmFsdWVTdGFydCA9IGF0dHJTdGFydCArIGF0dHJTdGFydE1hdGNoWzBdLmxlbmd0aDtcbiAgICBcbiAgICAvLyBGaW5kIHRoZSBjbG9zaW5nIHF1b3RlLCBidXQgYmUgY2FyZWZ1bCBhYm91dCBxdW90ZXMgaW5zaWRlIEhhbmRsZWJhcnMgZXhwcmVzc2lvbnNcbiAgICBsZXQgdmFsdWVFbmQgPSAtMTtcbiAgICBsZXQgaW5IYW5kbGViYXJzID0gMDtcbiAgICBmb3IgKGxldCBpID0gdmFsdWVTdGFydDsgaSA8IHJlc3VsdC5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgY2hhciA9IHJlc3VsdFtpXTtcbiAgICAgIGNvbnN0IG5leHRDaGFyID0gcmVzdWx0W2kgKyAxXTtcbiAgICAgIFxuICAgICAgaWYgKGNoYXIgPT09ICd7JyAmJiBuZXh0Q2hhciA9PT0gJ3snKSB7XG4gICAgICAgIGluSGFuZGxlYmFycysrO1xuICAgICAgICBpKys7IC8vIFNraXAgbmV4dCBjaGFyXG4gICAgICB9IGVsc2UgaWYgKGNoYXIgPT09ICd9JyAmJiBuZXh0Q2hhciA9PT0gJ30nKSB7XG4gICAgICAgIGluSGFuZGxlYmFycy0tO1xuICAgICAgICBpKys7IC8vIFNraXAgbmV4dCBjaGFyXG4gICAgICB9IGVsc2UgaWYgKGNoYXIgPT09ICdcIicgJiYgaW5IYW5kbGViYXJzID09PSAwKSB7XG4gICAgICAgIHZhbHVlRW5kID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGlmICh2YWx1ZUVuZCA9PT0gLTEpIHtcbiAgICAgIHBvcyA9IHZhbHVlU3RhcnQ7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgYXR0clZhbHVlID0gcmVzdWx0LnN1YnN0cmluZyh2YWx1ZVN0YXJ0LCB2YWx1ZUVuZCk7XG4gICAgY29uc3QgZnVsbE1hdGNoID0gcmVzdWx0LnN1YnN0cmluZyhhdHRyU3RhcnQsIHZhbHVlRW5kICsgMSk7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBhdHRyaWJ1dGUgY29udGFpbnMgYSBjb25kaXRpb25hbFxuICAgIGlmIChhdHRyVmFsdWUuaW5jbHVkZXMoJ3t7I2lmJykgfHwgYXR0clZhbHVlLmluY2x1ZGVzKCd7eyN1bmxlc3MnKSkge1xuICAgICAgLy8gSWYgdGhpcyBhdHRyaWJ1dGUgcmVmZXJlbmNlcyBAbGFzdCBvciBAZmlyc3QgYnV0IHdlIGRvbid0IGtub3cgdGhlXG4gICAgICAvLyBlbmNsb3NpbmcgbG9vcCBhcnJheSB5ZXQgKHRvcC1sZXZlbCBwYXNzKSwgZGVmZXIgcHJvY2Vzc2luZyB1bnRpbFxuICAgICAgLy8gdGhlIGxvb3AgaXMgZXhwYW5kZWQgd2l0aCB0aGUgY29ycmVjdCBhcnJheSBuYW1lLlxuICAgICAgaWYgKCFjdXJyZW50TG9vcEFycmF5ICYmIChhdHRyVmFsdWUuaW5jbHVkZXMoJ0BsYXN0JykgfHwgYXR0clZhbHVlLmluY2x1ZGVzKCdAZmlyc3QnKSkpIHtcbiAgICAgICAgcG9zID0gdmFsdWVFbmQgKyAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIC8vIENvbnZlcnQgdGhlIGF0dHJpYnV0ZSB2YWx1ZSB1c2luZyBvdXIgaGVscGVyIChwYXNzIGN1cnJlbnRMb29wQXJyYXkgZm9yIEBsYXN0IC8gQGZpcnN0KVxuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUoYXR0clZhbHVlLCBsb29wVmFyLCBjdXJyZW50TG9vcEFycmF5KTtcbiAgICAgIFxuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBHZXQgdGhlIEpTWCBhdHRyaWJ1dGUgbmFtZVxuICAgICAgICBsZXQganN4QXR0ck5hbWUgPSBhdHRyTmFtZTtcbiAgICAgICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICAgICAganN4QXR0ck5hbWUgPSAnY2xhc3NOYW1lJztcbiAgICAgICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ2ZvcicpIHtcbiAgICAgICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSByZXBsYWNlbWVudCB3aXRoIEpTWCB0ZW1wbGF0ZSBsaXRlcmFsXG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCR7anN4QXR0ck5hbWV9PXtfX1RFTVBMQVRFX0xJVEVSQUxfXyR7QnVmZmVyLmZyb20oanN4VmFsdWUpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9URU1QTEFURV9MSVRFUkFMX199YDtcbiAgICAgICAgXG4gICAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgYXR0clN0YXJ0KSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyh2YWx1ZUVuZCArIDEpO1xuICAgICAgICBwb3MgPSBhdHRyU3RhcnQgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwb3MgPSB2YWx1ZUVuZCArIDE7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiogRW5zdXJlIGNsYXNzTmFtZSBhbHdheXMgcmVjZWl2ZXMgYSBzdHJpbmcgKFJlYWN0IHdhcm5zIG9uIGJvb2xlYW4pLiAqL1xuY29uc3QgZW5zdXJlQ2xhc3NOYW1lRXhwciA9IChqc3hOYW1lOiBzdHJpbmcsIGV4cHI6IHN0cmluZyk6IHN0cmluZyA9PlxuICBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGBTdHJpbmcoJHtleHByfSA/PyAnJylgIDogZXhwcjtcblxuLyoqXG4gKiBDb252ZXJ0IEhUTUwgYXR0cmlidXRlcyB0byBKU1ggYXR0cmlidXRlc1xuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZXMgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0KTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0cnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGxvb3BWYXIgPSBjb250ZXh0Lmxvb3BWYXJpYWJsZSB8fCAnaXRlbSc7XG4gIFxuICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZWxlbWVudC5hdHRyaWJ1dGVzKSkge1xuICAgIC8vIENoZWNrIGZvciBjb25kaXRpb25hbCBhdHRyaWJ1dGUgbWFya2VyIEZJUlNUIOKAlCBhcHBsaWVzIHRvIGFueSBhdHRyaWJ1dGUgaW5jbHVkaW5nIHN0eWxlLlxuICAgIC8vIHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMgZW5jb2RlcyB7eyNpZiBjb25kfX1hdHRyTmFtZT1cInZhbHVlXCJ7ey9pZn19IGludG8gdGhpcyBtYXJrZXIuXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCdfX0NPTkRfQVRUUl9fJykpIHtcbiAgICAgIGNvbnN0IGNvbmRNYXRjaCA9IHZhbHVlLm1hdGNoKC9fX0NPTkRfQVRUUl9fKFtBLVphLXowLTkrLz1dKylfX0VORF9DT05EX0FUVFJfXy8pO1xuICAgICAgaWYgKGNvbmRNYXRjaCkge1xuICAgICAgICBjb25zdCBkZWNvZGVkID0gQnVmZmVyLmZyb20oY29uZE1hdGNoWzFdLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgICAgY29uc3QganN4QXR0ckZvckNvbmQgPSBuYW1lID09PSAnY2xhc3MnID8gJ2NsYXNzTmFtZScgOiBuYW1lID09PSAnZm9yJyA/ICdodG1sRm9yJyA6IHRvSnN4QXR0ck5hbWUobmFtZSk7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4QXR0ckZvckNvbmR9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4QXR0ckZvckNvbmQsIGRlY29kZWQpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBzdHlsZSB0byBvYmplY3QgKHNwZWNpYWwgaGFuZGxpbmcpXG4gICAgaWYgKG5hbWUgPT09ICdzdHlsZScpIHtcbiAgICAgIGNvbnN0IHN0eWxlT2JqID0gcGFyc2VTdHlsZVRvT2JqZWN0KHZhbHVlLCBjb250ZXh0KTtcbiAgICAgIGF0dHJzLnB1c2goYHN0eWxlPSR7c3R5bGVPYmp9YCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2V0IHRoZSBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICBjb25zdCBqc3hOYW1lID0gdG9Kc3hBdHRyTmFtZShuYW1lKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB2YWx1ZSBjb250YWlucyBibG9jayBjb25kaXRpb25hbHMge3sjaWYuLi59fVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygne3sjaWYnKSkge1xuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUoXG4gICAgICAgIHZhbHVlLFxuICAgICAgICBsb29wVmFyLFxuICAgICAgICBjb250ZXh0Lmxvb3BBcnJheSxcbiAgICAgICAgY29udGV4dC5sb29wSW5kZXgsXG4gICAgICApO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICBjb25zdCB3cmFwcGVkID0ganN4TmFtZSA9PT0gJ2NsYXNzTmFtZScgPyBgXFwke1N0cmluZygke2pzeFZhbHVlfSA/PyAnJyl9YCA6IGpzeFZhbHVlO1xuICAgICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXtcXGAke3dyYXBwZWR9XFxgfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIGhyZWYgd2l0aCBoYW5kbGViYXJzXG4gICAgaWYgKG5hbWUgPT09ICdocmVmJyAmJiB2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXFx7XFx7K1xccyooW159XSs/KVxccypcXH0rXFx9Lyk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obWF0Y2hbMV0sIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgICBhdHRycy5wdXNoKGBocmVmPXske2V4cHJ9IHx8ICcjJ31gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBzcmMvYWx0IHdpdGggaGFuZGxlYmFycyAobmVzdGVkIGltYWdlIG9iamVjdHMgbmVlZCBvcHRpb25hbCBjaGFpbmluZylcbiAgICBpZiAoKG5hbWUgPT09ICdzcmMnIHx8IG5hbWUgPT09ICdhbHQnKSAmJiB2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXFx7XFx7K1xccyooW159XSs/KVxccypcXH0rXFx9Lyk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obWF0Y2hbMV0sIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgZXhwcil9fWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIG90aGVyIGF0dHJpYnV0ZXMgd2l0aCBoYW5kbGViYXJzIChpbmNsdWRpbmcgc2ltcGxlIGV4cHJlc3Npb25zKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUoXG4gICAgICAgIHZhbHVlLFxuICAgICAgICBsb29wVmFyLFxuICAgICAgICBjb250ZXh0Lmxvb3BBcnJheSxcbiAgICAgICAgY29udGV4dC5sb29wSW5kZXgsXG4gICAgICApO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHVyZSBleHByZXNzaW9uIG9yIG5lZWRzIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgaWYgKGpzeFZhbHVlLnN0YXJ0c1dpdGgoJyR7JykgJiYganN4VmFsdWUuZW5kc1dpdGgoJ30nKSAmJiAhanN4VmFsdWUuaW5jbHVkZXMoJyR7JywgMikpIHtcbiAgICAgICAgICAvLyBTaW1wbGUgZXhwcmVzc2lvbiBsaWtlICR7cHJvcH0gLSBleHRyYWN0IGp1c3QgdGhlIGV4cHJlc3Npb25cbiAgICAgICAgICBjb25zdCBleHByID0ganN4VmFsdWUuc2xpY2UoMiwgLTEpO1xuICAgICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGVtcGxhdGUgbGl0ZXJhbCB3aXRoIHN0YXRpYyBwYXJ0cyBvciBtdWx0aXBsZSBleHByZXNzaW9uc1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGpzeFZhbHVlLnJlcGxhY2UoL1xcJFxceyhbXn1dKylcXH0vZywgKF8sIGUpID0+IGBcXCR7U3RyaW5nKCR7ZX0gPz8gJycpfWApIDoganN4VmFsdWU7XG4gICAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgZm9yIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeE5hbWUsIGV4cHIpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEJvb2xlYW4gYXR0cmlidXRlc1xuICAgIGlmICh2YWx1ZSA9PT0gJycgfHwgdmFsdWUgPT09IG5hbWUpIHtcbiAgICAgIGF0dHJzLnB1c2goanN4TmFtZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHRlbXBsYXRlIGxpdGVyYWwgbWFya2VyIChhbHJlYWR5IHByb2Nlc3NlZCBieSBwcmVwcm9jZXNzQXR0cmlidXRlQ29uZGl0aW9uYWxzKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19URU1QTEFURV9MSVRFUkFMX18nKSkge1xuICAgICAgLy8gVGhlIHZhbHVlIG1pZ2h0IGJlIHdyYXBwZWQgaW4ge30gZnJvbSBwcmVwcm9jZXNzaW5nIC0gc3RyaXAgdGhlbSBpZiBwcmVzZW50XG4gICAgICBsZXQgY2xlYW5WYWx1ZSA9IHZhbHVlO1xuICAgICAgaWYgKGNsZWFuVmFsdWUuc3RhcnRzV2l0aCgneycpICYmIGNsZWFuVmFsdWUuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICBjbGVhblZhbHVlID0gY2xlYW5WYWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgICB9XG4gICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgY2xlYW5WYWx1ZSl9fWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YW5kYXJkIGF0dHJpYnV0ZXNcbiAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PVwiJHt2YWx1ZX1cImApO1xuICB9XG4gIFxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufTtcbiJdfQ==