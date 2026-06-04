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
 */
const preprocessAttributeConditionals = (template, currentLoopArray) => {
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
            const { jsxValue, isExpression } = (0, exports.convertAttributeValue)(attrValue, 'item', currentLoopArray);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L2F0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFJSCxtQ0FBOEY7QUFDOUYsMkRBQXdIO0FBQ3hILHFDQUFzRTtBQUV0RTs7O0dBR0c7QUFDSCxNQUFNLDBCQUEwQixHQUFHLENBQ2pDLE1BQWMsRUFDZCxPQUFlLEVBQ1AsRUFBRTtJQUNWLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUU5QixJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNoQyxPQUFPLElBQUEsMkNBQXVCLEVBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFZLEVBQUUsS0FBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUEsbUJBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekcsQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN0QyxPQUFPLElBQUEsMkNBQXVCLEVBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxPQUFPLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLElBQUksUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLE9BQU8sSUFBQSwyQ0FBdUIsRUFBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLElBQUEsbUJBQVcsRUFBQyxPQUFPLENBQUMsQ0FBQztBQUM5QixDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sb0NBQW9DLEdBQUcsQ0FDM0MsU0FBaUIsRUFDakIsSUFBWSxFQUNaLE9BQWUsRUFDZixTQUFpQixFQUNULEVBQUU7SUFDVixJQUFJLFdBQVcsR0FBRyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbkMsSUFBSSxTQUFTLEdBQUcsU0FBUyxDQUFDO0lBQzFCLElBQUksV0FBVyxHQUFHLFVBQVUsQ0FBQztJQUU3QixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7SUFDOUUsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNmLFdBQVcsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbkMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQixJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2xCLFdBQVcsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRywwQkFBMEIsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDbEUsTUFBTSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFBLDZCQUFxQixFQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBRTVGLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNwRixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sSUFBSSxRQUFRLGdCQUFnQixTQUFTLEtBQUssV0FBVyxRQUFRLFNBQVMsWUFBWSxDQUFDO0lBQzVGLENBQUM7SUFFRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0QixDQUFDLENBQUMsT0FBTyxDQUFDO0lBRVosT0FBTyxJQUFJLFFBQVEsZ0JBQWdCLFNBQVMsS0FBSyxXQUFXLFVBQVUsYUFBYSxjQUFjLENBQUM7QUFDcEcsQ0FBQyxDQUFDO0FBRUY7Ozs7OztHQU1HO0FBQ0ksTUFBTSxxQkFBcUIsR0FBRyxDQUNuQyxLQUFhLEVBQ2IsVUFBa0IsTUFBTSxFQUN4QixTQUFrQixFQUNsQixZQUFvQixPQUFPLEVBQ0YsRUFBRTtJQUMzQixNQUFNLFNBQVMsR0FBRyxTQUFTLElBQUksT0FBTyxDQUFDO0lBQ3ZDLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztJQUNuQixJQUFJLFlBQVksR0FBRyxLQUFLLENBQUM7SUFFekIseUZBQXlGO0lBQ3pGLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsa0RBQWtELENBQUMsQ0FBQztJQUN4RixJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3BCLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDcEIsTUFBTSxJQUFJLEdBQUcsb0NBQW9DLENBQy9DLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFDbEIsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUNsQixPQUFPLEVBQ1AsU0FBUyxDQUNWLENBQUM7UUFDRixPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksR0FBRyxJQUFJLEdBQUcsR0FBRyxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUM3RCxDQUFDO0lBRUQsdUZBQXVGO0lBQ3ZGLE1BQU0sV0FBVyxHQUFHLENBQUMsSUFBWSxFQUFVLEVBQUU7UUFDM0MsaUZBQWlGO1FBQ2pGLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLHNCQUFzQixFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQzNELDhDQUE4QztRQUM5QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ3BCLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3pELFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBQSxtQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUYsQ0FBQztZQUNELE9BQU8sR0FBRyxRQUFRLFNBQVMsS0FBSyxHQUFHLENBQUM7UUFDdEMsQ0FBQztRQUVELDJCQUEyQjtRQUMzQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNaLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEMsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ3BCLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3pELFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBQSxtQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUYsQ0FBQztZQUNELE9BQU8sR0FBRyxRQUFRLFNBQVMsS0FBSyxHQUFHLENBQUM7UUFDdEMsQ0FBQztRQUVELHNFQUFzRTtRQUN0RSxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDdkUsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxVQUFVLENBQUM7WUFDbkMsTUFBTSxjQUFjLEdBQUcsQ0FBQyxPQUFlLEVBQVUsRUFBRTtnQkFDakQsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7b0JBQ3RDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDNUQsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBQSxtQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RGLENBQUM7Z0JBQ0QsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ2hDLE9BQU8sSUFBQSwyQ0FBdUIsRUFBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDeEUsQ0FBQztnQkFDRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3JCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUM7b0JBQzlCLElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO3dCQUNyQixPQUFPLElBQUEsMkNBQXVCLEVBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDMUQsQ0FBQztvQkFDRCxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO2dCQUNELE9BQU8sSUFBQSxtQkFBVyxFQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzlCLENBQUMsQ0FBQztZQUNGLE9BQU8sR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsY0FBYyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDaEUsQ0FBQztRQUVELE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQyxDQUFDO0lBRUYsOEVBQThFO0lBQzlFLE1BQU0sVUFBVSxHQUFHLENBQUMsSUFBWSxFQUFVLEVBQUU7UUFDMUMscUhBQXFIO1FBQ3JILElBQUksR0FBRyxJQUFBLHVEQUFtQyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pELHFGQUFxRjtRQUNyRixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUM5QixJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBQ0Qsa0RBQWtEO1FBQ2xELElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqQyxJQUFJLE1BQU07Z0JBQUUsT0FBTyxNQUFNLENBQUM7UUFDNUIsQ0FBQztRQUVELDRDQUE0QztRQUM1QyxJQUFJLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN0QixPQUFPLEdBQUcsU0FBUyxRQUFRLENBQUM7UUFDOUIsQ0FBQztRQUNELElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLE9BQU8sR0FBRyxTQUFTLFFBQVEsU0FBUyxjQUFjLENBQUM7UUFDckQsQ0FBQztRQUNELElBQUksSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sU0FBUyxDQUFDO1FBQ25CLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekQsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBQSxtQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEYsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sSUFBQSwyQ0FBdUIsRUFBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxDQUFDO2FBQU0sQ0FBQztZQUNOLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUIsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUM5QixJQUFJLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztvQkFDckIsT0FBTyxJQUFBLDJDQUF1QixFQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELENBQUM7Z0JBQ0QsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQyxDQUFDO1lBQ0QsT0FBTyxJQUFBLDJDQUF1QixFQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsdUVBQXVFO0lBQ3ZFLGlGQUFpRjtJQUNqRixNQUFNLGtCQUFrQixHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7UUFDakQsNENBQTRDO1FBQzVDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUMzRCxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFFRCxtRUFBbUU7UUFDbkUsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdkIsOEJBQThCO1lBQzlCLElBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQztZQUNmLG1GQUFtRjtZQUNuRixJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQywyQ0FBMkMsRUFBRSxDQUFDLENBQVMsRUFBRSxJQUFZLEVBQUUsRUFBRTtnQkFDM0YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDckMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQVMsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUEsbUJBQVcsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3RixPQUFPLElBQUksR0FBRyxPQUFPLEdBQUcsR0FBRyxDQUFDO1lBQzlCLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsb0NBQW9DLEVBQUUsQ0FBQyxDQUFTLEVBQUUsSUFBWSxFQUFFLEVBQUU7Z0JBQ3BGLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFBLG1CQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDN0YsT0FBTyxJQUFJLEdBQUcsT0FBTyxHQUFHLEdBQUcsQ0FBQztZQUM5QixDQUFDLENBQUMsQ0FBQztZQUNILElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLDhCQUE4QixFQUFFLENBQUMsQ0FBUyxFQUFFLElBQVksRUFBRSxFQUFFO2dCQUM5RSxPQUFPLElBQUksR0FBRyxJQUFBLDJDQUF1QixFQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUM7WUFDcEUsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxzRUFBc0UsRUFBRSxDQUFDLENBQVMsRUFBRSxJQUFZLEVBQUUsRUFBRTtnQkFDdEgsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ2pFLE9BQU8sSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUM7Z0JBQ3ZDLENBQUM7Z0JBQ0QsT0FBTyxJQUFJLEdBQUcsSUFBSSxHQUFHLEdBQUcsQ0FBQztZQUMzQixDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sR0FBRyxHQUFHLElBQUksR0FBRyxHQUFHLENBQUM7UUFDMUIsQ0FBQztRQUVELG9CQUFvQjtRQUNwQixPQUFPLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7SUFDOUMsQ0FBQyxDQUFDO0lBRUYsOEVBQThFO0lBQzlFLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUNyQix5R0FBeUcsRUFDekcsQ0FBQyxDQUFTLEVBQUUsS0FBYSxFQUFFLElBQVksRUFBRSxLQUFhLEVBQUUsSUFBWSxFQUFFLElBQVksRUFBRSxFQUFFO1FBQ3BGLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDcEIsTUFBTSxFQUFFLEdBQUcsVUFBVSxDQUFDLElBQUEsMkJBQW1CLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNsRCxNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUMsSUFBQSwyQkFBbUIsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sRUFBRSxHQUFHLGtCQUFrQixDQUFDLElBQUEsMEJBQWtCLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RCxNQUFNLEVBQUUsR0FBRyxrQkFBa0IsQ0FBQyxJQUFBLDBCQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxFQUFFLEdBQUcsa0JBQWtCLENBQUMsSUFBQSwwQkFBa0IsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3hELE9BQU8sSUFBSSxHQUFHLEVBQUUsR0FBRyxLQUFLLEdBQUcsRUFBRSxHQUFHLEtBQUssR0FBRyxFQUFFLEdBQUcsS0FBSyxHQUFHLEVBQUUsR0FBRyxLQUFLLEdBQUcsRUFBRSxHQUFHLEdBQUcsQ0FBQztJQUM3RSxDQUFDLENBQ0YsQ0FBQztJQUVGLDBFQUEwRTtJQUMxRSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDckIsbUZBQW1GLEVBQ25GLENBQUMsQ0FBUyxFQUFFLEtBQWEsRUFBRSxJQUFZLEVBQUUsS0FBYSxFQUFFLElBQVksRUFBRSxFQUFFO1FBQ3RFLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDcEIsTUFBTSxFQUFFLEdBQUcsVUFBVSxDQUFDLElBQUEsMkJBQW1CLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNsRCxNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUMsSUFBQSwyQkFBbUIsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sRUFBRSxHQUFHLGtCQUFrQixDQUFDLElBQUEsMEJBQWtCLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RCxNQUFNLEVBQUUsR0FBRyxrQkFBa0IsQ0FBQyxJQUFBLDBCQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsT0FBTyxJQUFJLEdBQUcsRUFBRSxHQUFHLEtBQUssR0FBRyxFQUFFLEdBQUcsS0FBSyxHQUFHLEVBQUUsR0FBRyxLQUFLLEdBQUcsRUFBRSxHQUFHLFFBQVEsQ0FBQztJQUNyRSxDQUFDLENBQ0YsQ0FBQztJQUVGLDREQUE0RDtJQUM1RCx3Q0FBd0M7SUFDeEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQ3JCLG9FQUFvRSxFQUNwRSxDQUFDLENBQVMsRUFBRSxTQUFpQixFQUFFLEtBQWEsRUFBRSxPQUFlLEVBQUUsRUFBRTtRQUMvRCxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxJQUFBLDJCQUFtQixFQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsSUFBQSwwQkFBa0IsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzdELE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDLElBQUEsMEJBQWtCLEVBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUVqRSxPQUFPLElBQUksR0FBRyxRQUFRLEdBQUcsS0FBSyxHQUFHLE1BQU0sR0FBRyxLQUFLLEdBQUcsUUFBUSxHQUFHLEdBQUcsQ0FBQztJQUNuRSxDQUFDLENBQ0YsQ0FBQztJQUVGLHlEQUF5RDtJQUN6RCx3Q0FBd0M7SUFDeEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQ3JCLDhDQUE4QyxFQUM5QyxDQUFDLENBQVMsRUFBRSxTQUFpQixFQUFFLEtBQWEsRUFBRSxFQUFFO1FBQzlDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDcEIsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLElBQUEsMkJBQW1CLEVBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxJQUFBLDBCQUFrQixFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFN0QsT0FBTyxJQUFJLEdBQUcsUUFBUSxHQUFHLEtBQUssR0FBRyxNQUFNLEdBQUcsUUFBUSxDQUFDO0lBQ3JELENBQUMsQ0FDRixDQUFDO0lBRUYsbURBQW1EO0lBQ25ELHdDQUF3QztJQUN4QyxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDckIsdURBQXVELEVBQ3ZELENBQUMsQ0FBUyxFQUFFLFNBQWlCLEVBQUUsRUFBRTtRQUMvQixZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sVUFBVSxHQUFHLGtCQUFrQixDQUFDLElBQUEsMEJBQWtCLEVBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNyRSwyRUFBMkU7UUFDM0UsT0FBTyxJQUFJLEdBQUcsU0FBUyxHQUFHLEtBQUssR0FBRyxTQUFTLEdBQUcsaUJBQWlCLEdBQUcsVUFBVSxHQUFHLFFBQVEsQ0FBQztJQUMxRixDQUFDLENBQ0YsQ0FBQztJQUVGLG9EQUFvRDtJQUNwRCx3Q0FBd0M7SUFDeEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQ3JCLHdEQUF3RCxFQUN4RCxDQUFDLENBQVMsRUFBRSxTQUFpQixFQUFFLEVBQUU7UUFDL0IsWUFBWSxHQUFHLElBQUksQ0FBQztRQUNwQixNQUFNLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxJQUFBLDBCQUFrQixFQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDckUsc0VBQXNFO1FBQ3RFLE9BQU8sSUFBSSxHQUFHLFNBQVMsR0FBRyxXQUFXLEdBQUcsVUFBVSxHQUFHLFFBQVEsQ0FBQztJQUNoRSxDQUFDLENBQ0YsQ0FBQztJQUVGLDBHQUEwRztJQUMxRyxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDckIsNEVBQTRFLEVBQzVFLENBQUMsQ0FBUyxFQUFFLFNBQWlCLEVBQUUsU0FBaUIsRUFBRSxPQUFlLEVBQUUsRUFBRTtRQUNuRSxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxJQUFBLDJCQUFtQixFQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxVQUFVLEdBQUcsa0JBQWtCLENBQUMsSUFBQSwwQkFBa0IsRUFBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixDQUFDLElBQUEsMEJBQWtCLEVBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUVqRSxPQUFPLEtBQUssR0FBRyxRQUFRLEdBQUcsS0FBSyxHQUFHLFVBQVUsR0FBRyxLQUFLLEdBQUcsUUFBUSxHQUFHLEdBQUcsQ0FBQztJQUN4RSxDQUFDLENBQ0YsQ0FBQztJQUVGLGlFQUFpRTtJQUNqRSx3Q0FBd0M7SUFDeEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQ3JCLHNEQUFzRCxFQUN0RCxDQUFDLENBQVMsRUFBRSxTQUFpQixFQUFFLFNBQWlCLEVBQUUsRUFBRTtRQUNsRCxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxJQUFBLDJCQUFtQixFQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxVQUFVLEdBQUcsa0JBQWtCLENBQUMsSUFBQSwwQkFBa0IsRUFBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRXJFLCtCQUErQjtRQUMvQixPQUFPLEtBQUssR0FBRyxRQUFRLEdBQUcsS0FBSyxHQUFHLFVBQVUsR0FBRyxRQUFRLENBQUM7SUFDMUQsQ0FBQyxDQUNGLENBQUM7SUFFRix3RUFBd0U7SUFDeEUsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDMUIsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsMkNBQTJDLEVBQUUsQ0FBQyxDQUFTLEVBQUUsSUFBWSxFQUFFLEVBQUU7WUFDL0YsWUFBWSxHQUFHLElBQUksQ0FBQztZQUNwQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFBLG1CQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3RixPQUFPLElBQUksR0FBRyxPQUFPLEdBQUcsR0FBRyxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELDRDQUE0QztJQUM1QyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUMxQixNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxvQ0FBb0MsRUFBRSxDQUFDLENBQVMsRUFBRSxJQUFZLEVBQUUsRUFBRTtZQUN4RixZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQ3BCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDckMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQVMsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUEsbUJBQVcsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzdGLE9BQU8sSUFBSSxHQUFHLE9BQU8sR0FBRyxHQUFHLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsaUVBQWlFO0lBQ2pFLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQzFCLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLDhCQUE4QixFQUFFLENBQUMsQ0FBUyxFQUFFLElBQVksRUFBRSxFQUFFO1lBQ2xGLFlBQVksR0FBRyxJQUFJLENBQUM7WUFDcEIsT0FBTyxJQUFJLEdBQUcsSUFBQSwyQ0FBdUIsRUFBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELGtGQUFrRjtJQUNsRixJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUMxQixNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyx1RUFBdUUsRUFBRSxDQUFDLENBQVMsRUFBRSxJQUFZLEVBQUUsRUFBRTtZQUMzSCxZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQ3BCLE9BQU8sSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFDNUMsQ0FBQyxDQUFDO0FBaFRXLFFBQUEscUJBQXFCLHlCQWdUaEM7QUFFRjs7Ozs7O0dBTUc7QUFDSSxNQUFNLCtCQUErQixHQUFHLENBQUMsUUFBZ0IsRUFBVSxFQUFFO0lBQzFFLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQztJQUV0Qiw4R0FBOEc7SUFDOUcsTUFBTSxhQUFhLEdBQUcscUVBQXFFLENBQUM7SUFFNUYsSUFBSSxLQUFLLENBQUM7SUFDVixPQUFPLENBQUMsS0FBSyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNyRCxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDaEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUU3Qix5RUFBeUU7UUFDekUsSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztZQUM5QyxTQUFTLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELHNDQUFzQztRQUN0QyxJQUFJLFFBQVEsR0FBRyxTQUFTLENBQUM7UUFDekIsSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDeEMsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzlELFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBQSxtQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUYsQ0FBQzthQUFNLElBQUksU0FBUyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3pDLFFBQVEsR0FBRyxRQUFRLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDdEQsQ0FBQztRQUVELDRDQUE0QztRQUM1QyxJQUFJLFNBQWlCLENBQUM7UUFDdEIsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDN0IsMkVBQTJFO1lBQzNFLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztZQUNuRixJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNkLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdDLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBQSxtQkFBVyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLFNBQVMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDO1lBQy9CLENBQUM7UUFDSCxDQUFDO2FBQU0sSUFBSSxRQUFRLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDaEMsK0VBQStFO1lBQy9FLFNBQVMsR0FBRyxJQUFBLCtCQUFzQixFQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hELENBQUM7YUFBTSxDQUFDO1lBQ04sU0FBUyxHQUFHLElBQUksU0FBUyxHQUFHLENBQUM7UUFDL0IsQ0FBQztRQUVELHlCQUF5QjtRQUN6QixJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUM7UUFDM0IsSUFBSSxRQUFRLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDekIsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUM1QixDQUFDO2FBQU0sSUFBSSxRQUFRLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDOUIsV0FBVyxHQUFHLFNBQVMsQ0FBQztRQUMxQixDQUFDO2FBQU0sQ0FBQztZQUNOLFdBQVcsR0FBRyxJQUFBLHFCQUFhLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLEdBQUcsUUFBUSxNQUFNLFNBQVMsY0FBYyxDQUFDO1FBQy9ELE1BQU0sV0FBVyxHQUFHLEdBQUcsV0FBVyxrQkFBa0IsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDO1FBRXRILE1BQU0sR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxXQUFXLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JHLGFBQWEsQ0FBQyxTQUFTLEdBQUcsUUFBUSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7SUFDMUQsQ0FBQztJQUVELG1GQUFtRjtJQUNuRixzRkFBc0Y7SUFDdEYsbUZBQW1GO0lBQ25GLDBDQUEwQztJQUMxQyxNQUFNLGFBQWEsR0FBRyx3REFBd0QsQ0FBQztJQUUvRSxPQUFPLENBQUMsS0FBSyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNyRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUU3Qix5RUFBeUU7UUFDekUsMkVBQTJFO1FBQzNFLGlGQUFpRjtRQUNqRixNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RCxJQUFJLFlBQVksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDOUQsTUFBTSxVQUFVLEdBQUcsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUMzRCxJQUFJLFVBQVUsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLCtEQUErRDtnQkFDL0QsU0FBUztZQUNYLENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUUxQix5RUFBeUU7UUFDekUsSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztZQUM5QyxTQUFTLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELElBQUksUUFBUSxHQUFHLFNBQVMsQ0FBQztRQUN6QixJQUFJLFNBQVMsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUN4QyxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUQsUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFBLG1CQUFXLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxRixDQUFDO2FBQU0sSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDekMsUUFBUSxHQUFHLFFBQVEsU0FBUyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN0RCxDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsSUFBQSxxQkFBYSxFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sYUFBYSxHQUFHLEdBQUcsUUFBUSxlQUFlLENBQUM7UUFDakQsTUFBTSxXQUFXLEdBQUcsSUFBSSxXQUFXLGtCQUFrQixNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUM7UUFFdkgsTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLFdBQVcsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckcsYUFBYSxDQUFDLFNBQVMsR0FBRyxRQUFRLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztJQUMxRCxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBaEhXLFFBQUEsK0JBQStCLG1DQWdIMUM7QUFFRjs7OztHQUlHO0FBQ0ksTUFBTSwrQkFBK0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsZ0JBQXlCLEVBQVUsRUFBRTtJQUNyRyxJQUFJLE1BQU0sR0FBRyxRQUFRLENBQUM7SUFFdEIsNEVBQTRFO0lBQzVFLE1BQU0sR0FBRyxJQUFBLHVDQUErQixFQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRWpELGtEQUFrRDtJQUNsRCxrRkFBa0Y7SUFDbEYsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ1osT0FBTyxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzNCLDBDQUEwQztRQUMxQyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxjQUFjO1lBQUUsTUFBTTtRQUUzQixNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkMsTUFBTSxTQUFTLEdBQUcsR0FBRyxHQUFHLGNBQWMsQ0FBQyxLQUFNLENBQUM7UUFDOUMsTUFBTSxVQUFVLEdBQUcsU0FBUyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFFeEQsb0ZBQW9GO1FBQ3BGLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztRQUNyQixLQUFLLElBQUksQ0FBQyxHQUFHLFVBQVUsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2hELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRS9CLElBQUksSUFBSSxLQUFLLEdBQUcsSUFBSSxRQUFRLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ3JDLFlBQVksRUFBRSxDQUFDO2dCQUNmLENBQUMsRUFBRSxDQUFDLENBQUMsaUJBQWlCO1lBQ3hCLENBQUM7aUJBQU0sSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLFFBQVEsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDNUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2YsQ0FBQyxFQUFFLENBQUMsQ0FBQyxpQkFBaUI7WUFDeEIsQ0FBQztpQkFBTSxJQUFJLElBQUksS0FBSyxHQUFHLElBQUksWUFBWSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM5QyxRQUFRLEdBQUcsQ0FBQyxDQUFDO2dCQUNiLE1BQU07WUFDUixDQUFDO1FBQ0gsQ0FBQztRQUVELElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEIsR0FBRyxHQUFHLFVBQVUsQ0FBQztZQUNqQixTQUFTO1FBQ1gsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUU1RCxpREFBaUQ7UUFDakQsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUNuRSxxRUFBcUU7WUFDckUsb0VBQW9FO1lBQ3BFLG9EQUFvRDtZQUNwRCxJQUFJLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUN2RixHQUFHLEdBQUcsUUFBUSxHQUFHLENBQUMsQ0FBQztnQkFDbkIsU0FBUztZQUNYLENBQUM7WUFDRCwwRkFBMEY7WUFDMUYsTUFBTSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsR0FBRyxJQUFBLDZCQUFxQixFQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUU5RixJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQiw2QkFBNkI7Z0JBQzdCLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQztnQkFDM0IsSUFBSSxRQUFRLEtBQUssT0FBTyxFQUFFLENBQUM7b0JBQ3pCLFdBQVcsR0FBRyxXQUFXLENBQUM7Z0JBQzVCLENBQUM7cUJBQU0sSUFBSSxRQUFRLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQzlCLFdBQVcsR0FBRyxTQUFTLENBQUM7Z0JBQzFCLENBQUM7Z0JBRUQsbURBQW1EO2dCQUNuRCxNQUFNLFdBQVcsR0FBRyxHQUFHLFdBQVcseUJBQXlCLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQztnQkFFL0gsTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxHQUFHLFdBQVcsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDdkYsR0FBRyxHQUFHLFNBQVMsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO2dCQUNyQyxTQUFTO1lBQ1gsQ0FBQztRQUNILENBQUM7UUFFRCxHQUFHLEdBQUcsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUNyQixDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBL0VXLFFBQUEsK0JBQStCLG1DQStFMUM7QUFFRiwwRUFBMEU7QUFDMUUsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLE9BQWUsRUFBRSxJQUFZLEVBQVUsRUFBRSxDQUNwRSxPQUFPLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxVQUFVLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFFM0Q7O0dBRUc7QUFDSSxNQUFNLGlCQUFpQixHQUFHLENBQUMsT0FBb0IsRUFBRSxPQUEwQixFQUFVLEVBQUU7SUFDNUYsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBQzNCLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxZQUFZLElBQUksTUFBTSxDQUFDO0lBRS9DLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQy9ELDJGQUEyRjtRQUMzRixnR0FBZ0c7UUFDaEcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDcEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO1lBQ2pGLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQy9ELE1BQU0sY0FBYyxHQUFHLElBQUksS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFBLHFCQUFhLEVBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3pHLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxjQUFjLEtBQUssbUJBQW1CLENBQUMsY0FBYyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbEYsU0FBUztZQUNYLENBQUM7UUFDSCxDQUFDO1FBRUQsNkNBQTZDO1FBQzdDLElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLE1BQU0sUUFBUSxHQUFHLElBQUEsMkJBQWtCLEVBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BELEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ2hDLFNBQVM7UUFDWCxDQUFDO1FBRUQsNkJBQTZCO1FBQzdCLE1BQU0sT0FBTyxHQUFHLElBQUEscUJBQWEsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUVwQyx3REFBd0Q7UUFDeEQsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDNUIsTUFBTSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsR0FBRyxJQUFBLDZCQUFxQixFQUN0RCxLQUFLLEVBQ0wsT0FBTyxFQUNQLE9BQU8sQ0FBQyxTQUFTLEVBQ2pCLE9BQU8sQ0FBQyxTQUFTLENBQ2xCLENBQUM7WUFDRixJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQixNQUFNLE9BQU8sR0FBRyxPQUFPLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxhQUFhLFFBQVEsVUFBVSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3JGLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLE9BQU8sT0FBTyxLQUFLLENBQUMsQ0FBQztnQkFDMUMsU0FBUztZQUNYLENBQUM7UUFDSCxDQUFDO1FBRUQsOEJBQThCO1FBQzlCLElBQUksSUFBSSxLQUFLLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDNUMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3RELElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxJQUFJLEdBQUcsSUFBQSx1Q0FBbUIsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3RCxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxVQUFVLENBQUMsQ0FBQztnQkFDcEMsU0FBUztZQUNYLENBQUM7UUFDSCxDQUFDO1FBRUQsK0VBQStFO1FBQy9FLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0QsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3RELElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxJQUFJLEdBQUcsSUFBQSx1Q0FBbUIsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3RCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxLQUFLLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2pFLFNBQVM7WUFDWCxDQUFDO1FBQ0gsQ0FBQztRQUVELHlFQUF5RTtRQUN6RSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN6QixNQUFNLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxHQUFHLElBQUEsNkJBQXFCLEVBQ3RELEtBQUssRUFDTCxPQUFPLEVBQ1AsT0FBTyxDQUFDLFNBQVMsRUFDakIsT0FBTyxDQUFDLFNBQVMsQ0FDbEIsQ0FBQztZQUNGLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2pCLDREQUE0RDtnQkFDNUQsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUN2RiwrREFBK0Q7b0JBQy9ELE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ25DLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLEtBQUssbUJBQW1CLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkUsQ0FBQztxQkFBTSxDQUFDO29CQUNOLDZEQUE2RDtvQkFDN0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO29CQUM1SCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxPQUFPLE9BQU8sS0FBSyxDQUFDLENBQUM7Z0JBQzVDLENBQUM7Z0JBQ0QsU0FBUztZQUNYLENBQUM7WUFFRCw0Q0FBNEM7WUFDNUMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3RELElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxJQUFJLEdBQUcsSUFBQSx1Q0FBbUIsRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3RCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxLQUFLLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2pFLFNBQVM7WUFDWCxDQUFDO1FBQ0gsQ0FBQztRQUVELHFCQUFxQjtRQUNyQixJQUFJLEtBQUssS0FBSyxFQUFFLElBQUksS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ25DLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEIsU0FBUztRQUNYLENBQUM7UUFFRCwyRkFBMkY7UUFDM0YsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztZQUMzQyw4RUFBOEU7WUFDOUUsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzNELFVBQVUsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7WUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxLQUFLLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdkUsU0FBUztRQUNYLENBQUM7UUFFRCxzQkFBc0I7UUFDdEIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDekIsQ0FBQyxDQUFDO0FBbkhXLFFBQUEsaUJBQWlCLHFCQW1INUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEF0dHJpYnV0ZSBjb252ZXJzaW9uIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBIVE1MRWxlbWVudCB9IGZyb20gJ25vZGUtaHRtbC1wYXJzZXInO1xuaW1wb3J0IHsgVHJhbnNwaWxlckNvbnRleHQsIENvbnZlcnRlZEF0dHJpYnV0ZVZhbHVlIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSwgdG9Kc3hBdHRyTmFtZSwgbm9ybWFsaXplV2hpdGVzcGFjZSwgY29sbGFwc2VXaGl0ZXNwYWNlIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyB0cmFuc3BpbGVFeHByZXNzaW9uLCByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbiwgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MgfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcbmltcG9ydCB7IHBhcnNlU3R5bGVUb09iamVjdCwgY3NzU3RyaW5nVG9SZWFjdE9iamVjdCB9IGZyb20gJy4vc3R5bGVzJztcblxuLyoqXG4gKiBSZXNvbHZlIGEgSGFuZGxlYmFycyBhcnJheSBleHByZXNzaW9uIGluc2lkZSBhbiBhdHRyaWJ1dGUgdG8gYSBKU1ggYWNjZXNzb3IuXG4gKiBFeGFtcGxlczogdGhpcy50YWdzIC0+IHByb3ZpZGVyPy50YWdzLCBwcm9wZXJ0aWVzLnByb3ZpZGVycyAtPiBwcm92aWRlcnNcbiAqL1xuY29uc3QgcmVzb2x2ZUFycmF5UmVmSW5BdHRyaWJ1dGUgPSAoXG4gIHNvdXJjZTogc3RyaW5nLFxuICBsb29wVmFyOiBzdHJpbmcsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCB0cmltbWVkID0gc291cmNlLnRyaW0oKTtcblxuICBpZiAodHJpbW1lZC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHRyaW1tZWQucmVwbGFjZSgndGhpcy4nLCAnJykpO1xuICB9XG5cbiAgaWYgKHRyaW1tZWQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgIGNvbnN0IHBhcnRzID0gdHJpbW1lZC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgIHJldHVybiBwYXJ0cy5tYXAoKHBhcnQ6IHN0cmluZywgaW5kZXg6IG51bWJlcikgPT4gKGluZGV4ID09PSAwID8gdG9DYW1lbENhc2UocGFydCkgOiBwYXJ0KSkuam9pbignPy4nKTtcbiAgfVxuXG4gIGlmICh0cmltbWVkLnN0YXJ0c1dpdGgoYCR7bG9vcFZhcn0uYCkpIHtcbiAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgdHJpbW1lZC5yZXBsYWNlKGAke2xvb3BWYXJ9LmAsICcnKSk7XG4gIH1cblxuICBjb25zdCBkb3RJbmRleCA9IHRyaW1tZWQuaW5kZXhPZignLicpO1xuICBpZiAoZG90SW5kZXggPiAwKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRyaW1tZWQuc2xpY2UoMCwgZG90SW5kZXgpO1xuICAgIGNvbnN0IHJlc3QgPSB0cmltbWVkLnNsaWNlKGRvdEluZGV4ICsgMSk7XG4gICAgaWYgKHJvb3QgPT09IGxvb3BWYXIpIHtcbiAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCByZXN0KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdG9DYW1lbENhc2UodHJpbW1lZCk7XG59O1xuXG4vKipcbiAqIENvbnZlcnQge3sjZWFjaCBhcnJheX19Ym9keXt7L2VhY2h9fSBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIHRvIC5tYXAoKS5qb2luKCkuXG4gKi9cbmNvbnN0IGNvbXBpbGVOZXN0ZWRFYWNoQXR0cmlidXRlRXhwcmVzc2lvbiA9IChcbiAgYXJyYXlTcGVjOiBzdHJpbmcsXG4gIGJvZHk6IHN0cmluZyxcbiAgbG9vcFZhcjogc3RyaW5nLFxuICBsb29wSW5kZXg6IHN0cmluZyxcbik6IHN0cmluZyA9PiB7XG4gIGxldCBhcnJheVNvdXJjZSA9IGFycmF5U3BlYy50cmltKCk7XG4gIGxldCBuZXN0ZWRWYXIgPSAnc3ViSXRlbSc7XG4gIGxldCBuZXN0ZWRJbmRleCA9ICdzdWJJbmRleCc7XG5cbiAgY29uc3QgYWxpYXNNYXRjaCA9IGFycmF5U291cmNlLm1hdGNoKC9eKC4rPylcXHMrYXNcXHMrXFx8KFxcdyspKD86XFxzKyhcXHcrKSk/XFx8JC8pO1xuICBpZiAoYWxpYXNNYXRjaCkge1xuICAgIGFycmF5U291cmNlID0gYWxpYXNNYXRjaFsxXS50cmltKCk7XG4gICAgbmVzdGVkVmFyID0gYWxpYXNNYXRjaFsyXTtcbiAgICBpZiAoYWxpYXNNYXRjaFszXSkge1xuICAgICAgbmVzdGVkSW5kZXggPSBhbGlhc01hdGNoWzNdO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFycmF5UmVmID0gcmVzb2x2ZUFycmF5UmVmSW5BdHRyaWJ1dGUoYXJyYXlTb3VyY2UsIGxvb3BWYXIpO1xuICBjb25zdCB7IGpzeFZhbHVlOiBib2R5SnN4IH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUoYm9keSwgbmVzdGVkVmFyLCBhcnJheVJlZiwgbmVzdGVkSW5kZXgpO1xuXG4gIGlmIChib2R5SnN4LnN0YXJ0c1dpdGgoJyR7JykgJiYgYm9keUpzeC5lbmRzV2l0aCgnfScpICYmICFib2R5SnN4LmluY2x1ZGVzKCckeycsIDIpKSB7XG4gICAgY29uc3QgaW5uZXJFeHByID0gYm9keUpzeC5zbGljZSgyLCAtMSk7XG4gICAgcmV0dXJuIGAoJHthcnJheVJlZn0gfHwgW10pLm1hcCgoJHtuZXN0ZWRWYXJ9LCAke25lc3RlZEluZGV4fSkgPT4gJHtpbm5lckV4cHJ9KS5qb2luKCcnKWA7XG4gIH1cblxuICBjb25zdCBpbm5lclRlbXBsYXRlID0gYm9keUpzeC5zdGFydHNXaXRoKCdgJykgJiYgYm9keUpzeC5lbmRzV2l0aCgnYCcpXG4gICAgPyBib2R5SnN4LnNsaWNlKDEsIC0xKVxuICAgIDogYm9keUpzeDtcblxuICByZXR1cm4gYCgke2FycmF5UmVmfSB8fCBbXSkubWFwKCgke25lc3RlZFZhcn0sICR7bmVzdGVkSW5kZXh9KSA9PiBcXGAke2lubmVyVGVtcGxhdGV9XFxgKS5qb2luKCcnKWA7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgY29uZGl0aW9uYWxzIGluc2lkZSBhbiBhdHRyaWJ1dGUgdmFsdWUgdG8gSlNYIHRlbXBsYXRlIGxpdGVyYWwgc3ludGF4XG4gKiBDYWxsZWQgZnJvbSBjb252ZXJ0QXR0cmlidXRlcyBhZnRlciBIVE1MIHBhcnNpbmdcbiAqIEV4YW1wbGU6IFwicHJlZml4e3sjaWYgY29uZH19dmFsdWV7ey9pZn19c3VmZml4XCIgLT4gYHByZWZpeCR7Y29uZCA/ICd2YWx1ZScgOiAnJ31zdWZmaXhgXG4gKiBAcGFyYW0gbG9vcEFycmF5IC0gTmFtZSBvZiB0aGUgYXJyYXkgYmVpbmcgaXRlcmF0ZWQgKGZvciBAbGFzdCAvIEBmaXJzdCk7IHdoZW4gaW5zaWRlIHt7I2VhY2ggYXJyfX0sIHVzZSAnYXJyJy5cbiAqIEBwYXJhbSBsb29wSW5kZXggLSBJbmRleCB2YXJpYWJsZSBmb3IgQGZpcnN0IC8gQGxhc3QgLyBAaW5kZXggaW5zaWRlIHRoZSBjdXJyZW50IGxvb3Agc2NvcGUuXG4gKi9cbmV4cG9ydCBjb25zdCBjb252ZXJ0QXR0cmlidXRlVmFsdWUgPSAoXG4gIHZhbHVlOiBzdHJpbmcsXG4gIGxvb3BWYXI6IHN0cmluZyA9ICdpdGVtJyxcbiAgbG9vcEFycmF5Pzogc3RyaW5nLFxuICBsb29wSW5kZXg6IHN0cmluZyA9ICdpbmRleCcsXG4pOiBDb252ZXJ0ZWRBdHRyaWJ1dGVWYWx1ZSA9PiB7XG4gIGNvbnN0IGFycmF5TmFtZSA9IGxvb3BBcnJheSB8fCAnaXRlbXMnO1xuICBsZXQgcmVzdWx0ID0gdmFsdWU7XG4gIGxldCBpc0V4cHJlc3Npb24gPSBmYWxzZTtcblxuICAvLyB7eyNlYWNoIHRoaXMudGFnc319e3tsYWJlbH19e3sjdW5sZXNzIEBsYXN0fX18e3svdW5sZXNzfX17ey9lYWNofX0gaW4gYXR0cmlidXRlIHZhbHVlc1xuICBjb25zdCBuZXN0ZWRFYWNoTWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXlxce1xceyNlYWNoXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qKVxce1xce1xcL2VhY2hcXH1cXH0kLyk7XG4gIGlmIChuZXN0ZWRFYWNoTWF0Y2gpIHtcbiAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgIGNvbnN0IGV4cHIgPSBjb21waWxlTmVzdGVkRWFjaEF0dHJpYnV0ZUV4cHJlc3Npb24oXG4gICAgICBuZXN0ZWRFYWNoTWF0Y2hbMV0sXG4gICAgICBuZXN0ZWRFYWNoTWF0Y2hbMl0sXG4gICAgICBsb29wVmFyLFxuICAgICAgbG9vcEluZGV4LFxuICAgICk7XG4gICAgcmV0dXJuIHsganN4VmFsdWU6ICckeycgKyBleHByICsgJ30nLCBpc0V4cHJlc3Npb246IHRydWUgfTtcbiAgfVxuICBcbiAgLy8gSGVscGVyIHRvIHBhcnNlIEhhbmRsZWJhcnMgaGVscGVyIGV4cHJlc3Npb25zIGxpa2UgKGVxIHByb3BlcnRpZXMubGF5b3V0IFwibGF5b3V0LTFcIilcbiAgY29uc3QgcGFyc2VIZWxwZXIgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBOb3JtYWxpemUgQHJvb3QucHJvcGVydGllcy54eHggdG8gcHJvcGVydGllcy54eHggc28gdGhlIGV4aXN0aW5nIHJlZ2V4IG1hdGNoZXNcbiAgICBleHByID0gZXhwci5yZXBsYWNlKC9Acm9vdFxcLnByb3BlcnRpZXNcXC4vZywgJ3Byb3BlcnRpZXMuJyk7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgcmlnaHQpIG9yIChlcSBsZWZ0IFwic3RyaW5nXCIpXG4gICAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKGVxTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgbGVmdEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2xlZnRFeHByfSA9PT0gXCIke3JpZ2h0fVwiYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJzdHJpbmdcIilcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGxldCBsZWZ0RXhwciA9IGxlZnQ7XG4gICAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gbGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICBsZWZ0RXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ICE9PSBcIiR7cmlnaHR9XCJgO1xuICAgIH1cblxuICAgIC8vIE1hdGNoIChlcSBsZWZ0IHJpZ2h0KSB3aXRoIHZhcmlhYmxlL2V4cHJlc3Npb24gb3BlcmFuZHMgKG5vIHF1b3RlcylcbiAgICBjb25zdCBlcVZhck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gICAgaWYgKGVxVmFyTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxVmFyTWF0Y2g7XG4gICAgICBjb25zdCByZXNvbHZlT3BlcmFuZCA9IChvcGVyYW5kOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgICBpZiAob3BlcmFuZC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSBvcGVyYW5kLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICAgICAgcmV0dXJuIHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wZXJhbmQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCBvcGVyYW5kLnJlcGxhY2UoJ3RoaXMuJywgJycpKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJ0cyA9IG9wZXJhbmQuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBjb25zdCBbcm9vdCwgLi4ucmVzdF0gPSBwYXJ0cztcbiAgICAgICAgICBpZiAocm9vdCA9PT0gbG9vcFZhcikge1xuICAgICAgICAgICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHJlc3Quam9pbignLicpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFtyb290LCAuLi5yZXN0XS5qb2luKCc/LicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0b0NhbWVsQ2FzZShvcGVyYW5kKTtcbiAgICAgIH07XG4gICAgICByZXR1cm4gYCR7cmVzb2x2ZU9wZXJhbmQobGVmdCl9ID09PSAke3Jlc29sdmVPcGVyYW5kKHJpZ2h0KX1gO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJyc7XG4gIH07XG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBwcm9wZXJ0eSByZWZlcmVuY2Ugb3IgaGVscGVyIGV4cHJlc3Npb24gdG8gSlNYIGV4cHJlc3Npb25cbiAgY29uc3QgcHJvcFRvRXhwciA9IChwcm9wOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIC8vIFJlc29sdmUgLi4vcHJvcGVydGllcy54eHggKHBhcmVudCBjb250ZXh0IGluIGxvb3BzKSBhbmQgQHJvb3QucHJvcGVydGllcy54eHggKHJvb3QgY29udGV4dCkgdG8gdG9wLWxldmVsIGNhbWVsQ2FzZVxuICAgIHByb3AgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihwcm9wKTtcbiAgICAvLyBTdHJpcCBiYXJlIEByb290LiBwcmVmaXggKGUuZy4gQHJvb3QueHh4LCB3aGljaCByZXNvbHZlcyBsaWtlIHh4eCBhdCByb290IGNvbnRleHQpXG4gICAgaWYgKHByb3Auc3RhcnRzV2l0aCgnQHJvb3QuJykpIHtcbiAgICAgIHByb3AgPSBwcm9wLnN1YnN0cmluZyg2KTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIGhlbHBlciBleHByZXNzaW9uIGxpa2UgKGVxIC4uLilcbiAgICBpZiAocHJvcC5zdGFydHNXaXRoKCcoJykpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSGVscGVyKHByb3ApO1xuICAgICAgaWYgKHBhcnNlZCkgcmV0dXJuIHBhcnNlZDtcbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIEBmaXJzdCBhbmQgQGxhc3Qgc3BlY2lhbCB2YXJpYWJsZXNcbiAgICBpZiAocHJvcCA9PT0gJ0BmaXJzdCcpIHtcbiAgICAgIHJldHVybiBgJHtsb29wSW5kZXh9ID09PSAwYDtcbiAgICB9XG4gICAgaWYgKHByb3AgPT09ICdAbGFzdCcpIHtcbiAgICAgIHJldHVybiBgJHtsb29wSW5kZXh9ID09PSAke2FycmF5TmFtZX0/Lmxlbmd0aCAtIDFgO1xuICAgIH1cbiAgICBpZiAocHJvcCA9PT0gJ0BpbmRleCcpIHtcbiAgICAgIHJldHVybiBsb29wSW5kZXg7XG4gICAgfVxuICAgIFxuICAgIGlmIChwcm9wLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgcmV0dXJuIHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCBwcm9wLnJlcGxhY2UoJ3RoaXMuJywgJycpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnNwbGl0KCcuJyk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICBjb25zdCBbcm9vdCwgLi4ucmVzdF0gPSBwYXJ0cztcbiAgICAgICAgaWYgKHJvb3QgPT09IGxvb3BWYXIpIHtcbiAgICAgICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcmVzdC5qb2luKCcuJykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbcm9vdCwgLi4ucmVzdF0uam9pbignPy4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCBwcm9wKTtcbiAgICB9XG4gIH07XG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBpbm5lciBjb250ZW50IHRoYXQgbWF5IGNvbnRhaW4gcHJvcGVydHkgcmVmZXJlbmNlc1xuICAvLyBSZXR1cm5zIGFuIGV4cHJlc3Npb24gdGhhdCBjYW4gYmUgY29uY2F0ZW5hdGVkIChub3QgYSB0ZW1wbGF0ZSBsaXRlcmFsIHN0cmluZylcbiAgY29uc3QgY29udmVydElubmVyVG9FeHByID0gKHZhbDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBDaGVjayBpZiB2YWwgaXMgSlVTVCBhIHByb3BlcnR5IHJlZmVyZW5jZVxuICAgIGNvbnN0IGp1c3RQcm9wTWF0Y2ggPSB2YWwubWF0Y2goL15cXHtcXHtcXHMqKFtefV0rKVxccypcXH1cXH0kLyk7XG4gICAgaWYgKGp1c3RQcm9wTWF0Y2gpIHtcbiAgICAgIHJldHVybiBwcm9wVG9FeHByKGp1c3RQcm9wTWF0Y2hbMV0udHJpbSgpKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdmFsIGNvbnRhaW5zIHByb3BlcnR5IHJlZmVyZW5jZXMgbWl4ZWQgd2l0aCBzdGF0aWMgdGV4dFxuICAgIGlmICh2YWwuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIC8vIENvbnZlcnQgdG8gdGVtcGxhdGUgbGl0ZXJhbFxuICAgICAgbGV0IGV4cHIgPSB2YWw7XG4gICAgICAvLyBIYW5kbGUgQHJvb3QucHJvcGVydGllcy54eHggdGhlIHNhbWUgd2F5IGFzIHByb3BlcnRpZXMueHh4IChyb290IGNvbnRleHQgYWNjZXNzKVxuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKkByb290XFwucHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3AudHJpbSgpLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICAgIHJldHVybiAnJHsnICsganN4UHJvcCArICd9JztcbiAgICAgIH0pO1xuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKnRoaXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgcmV0dXJuICckeycgKyB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCBwcm9wLnRyaW0oKSkgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccyooW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfXSopKilcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICBpZiAoIXByb3Auc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSAmJiAhcHJvcC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgICAgcmV0dXJuICckeycgKyBwcm9wVG9FeHByKHByb3ApICsgJ30nO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJHsnICsgcHJvcCArICd9JztcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuICdgJyArIGV4cHIgKyAnYCc7XG4gICAgfVxuICAgIFxuICAgIC8vIFBsYWluIHN0YXRpYyB0ZXh0XG4gICAgcmV0dXJuIFwiJ1wiICsgdmFsLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKSArIFwiJ1wiO1xuICB9O1xuICBcbiAgLy8gSGFuZGxlIHt7I2lmIGMxfX12MXt7ZWxzZSBpZiBjMn19djJ7e2Vsc2V9fXYze3svaWZ9fSAobmVzdGVkIGVsc2UtaWYgY2hhaW4pXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXHMraWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmQxOiBzdHJpbmcsIHZhbDE6IHN0cmluZywgY29uZDI6IHN0cmluZywgdmFsMjogc3RyaW5nLCB2YWwzOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjMSA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kMSkpO1xuICAgICAgY29uc3QgYzIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZDIpKTtcbiAgICAgIGNvbnN0IHYxID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh2YWwxKSk7XG4gICAgICBjb25zdCB2MiA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodmFsMikpO1xuICAgICAgY29uc3QgdjMgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHZhbDMpKTtcbiAgICAgIHJldHVybiAnJHsnICsgYzEgKyAnID8gJyArIHYxICsgJyA6ICcgKyBjMiArICcgPyAnICsgdjIgKyAnIDogJyArIHYzICsgJ30nO1xuICAgIH1cbiAgKTtcblxuICAvLyBIYW5kbGUge3sjaWYgYzF9fXYxe3tlbHNlIGlmIGMyfX12Mnt7L2lmfX0gKGVsc2UtaWYgd2l0aG91dCBmaW5hbCBlbHNlKVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFxzK2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmQxOiBzdHJpbmcsIHZhbDE6IHN0cmluZywgY29uZDI6IHN0cmluZywgdmFsMjogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgYzEgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZDEpKTtcbiAgICAgIGNvbnN0IGMyID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmQyKSk7XG4gICAgICBjb25zdCB2MSA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodmFsMSkpO1xuICAgICAgY29uc3QgdjIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHZhbDIpKTtcbiAgICAgIHJldHVybiAnJHsnICsgYzEgKyAnID8gJyArIHYxICsgJyA6ICcgKyBjMiArICcgPyAnICsgdjIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcblxuICAvLyBIYW5kbGUge3sjaWYgY29uZGl0aW9ufX12YWx1ZXt7ZWxzZX19b3RoZXJ7ey9pZn19IHBhdHRlcm5cbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCBpZlZhbDogc3RyaW5nLCBlbHNlVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IGlmRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoaWZWYWwpKTtcbiAgICAgIGNvbnN0IGVsc2VFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShlbHNlVmFsKSk7XG4gICAgICBcbiAgICAgIHJldHVybiAnJHsnICsgY29uZEV4cHIgKyAnID8gJyArIGlmRXhwciArICcgOiAnICsgZWxzZUV4cHIgKyAnfSc7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I2lmIGNvbmRpdGlvbn19dmFsdWV7ey9pZn19IHBhdHRlcm4gKG5vIGVsc2UpXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCBpZlZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgY29uZEV4cHIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZGl0aW9uKSk7XG4gICAgICBjb25zdCBpZkV4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKGlmVmFsKSk7XG4gICAgICBcbiAgICAgIHJldHVybiAnJHsnICsgY29uZEV4cHIgKyAnID8gJyArIGlmRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBAbGFzdH19dmFsdWV7ey91bmxlc3N9fSBwYXR0ZXJuXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAbGFzdFxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgLy8gQGxhc3QgbWVhbnMgaXQncyBOT1QgdGhlIGxhc3QgaXRlbSwgc28gd2UgY2hlY2sgaW5kZXggPCBhcnJheS5sZW5ndGggLSAxXG4gICAgICByZXR1cm4gJyR7JyArIGxvb3BJbmRleCArICcgPCAnICsgYXJyYXlOYW1lICsgJz8ubGVuZ3RoIC0gMSA/ICcgKyB1bmxlc3NFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjdW5sZXNzIEBmaXJzdH19dmFsdWV7ey91bmxlc3N9fSBwYXR0ZXJuXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAZmlyc3RcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCB1bmxlc3NFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh1bmxlc3NWYWwpKTtcbiAgICAgIC8vIEBmaXJzdCBpcyB0cnVlIHdoZW4gaW5kZXggPT09IDAsIHNvIHVubGVzcyBAZmlyc3QgbWVhbnMgaW5kZXggIT09IDBcbiAgICAgIHJldHVybiAnJHsnICsgbG9vcEluZGV4ICsgJyAhPT0gMCA/ICcgKyB1bmxlc3NFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG5cbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBjb25kaXRpb259fXZhbHVle3tlbHNlfX1vdGhlcnt7L3VubGVzc319IHBhdHRlcm4gKG11c3QgcnVuIGJlZm9yZSB1bmxlc3Mgd2l0aG91dCBlbHNlKVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZywgZWxzZVZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgY29uZEV4cHIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZGl0aW9uKSk7XG4gICAgICBjb25zdCB1bmxlc3NFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh1bmxlc3NWYWwpKTtcbiAgICAgIGNvbnN0IGVsc2VFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShlbHNlVmFsKSk7XG5cbiAgICAgIHJldHVybiAnJHshJyArIGNvbmRFeHByICsgJyA/ICcgKyB1bmxlc3NFeHByICsgJyA6ICcgKyBlbHNlRXhwciArICd9JztcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjdW5sZXNzIGNvbmRpdGlvbn19dmFsdWV7ey91bmxlc3N9fSBwYXR0ZXJuIChnZW5lcmFsKVxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICBcbiAgICAgIC8vIHVubGVzcyBpcyB0aGUgb3Bwb3NpdGUgb2YgaWZcbiAgICAgIHJldHVybiAnJHshJyArIGNvbmRFeHByICsgJyA/ICcgKyB1bmxlc3NFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBBbHNvIGNvbnZlcnQgcmVtYWluaW5nIHt7QHJvb3QucHJvcGVydGllcy54eHh9fSAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqQHJvb3RcXC5wcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgfSk7XG4gIH1cblxuICAvLyBBbHNvIGNvbnZlcnQgcmVtYWluaW5nIHt7cHJvcGVydGllcy54eHh9fVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyB7e3RoaXMueHh4fX0gKGxvb3AgaXRlbSByZWZlcmVuY2VzIHZpYSB0aGlzKVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccyp0aGlzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgcmV0dXJuICckeycgKyB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCBwcm9wLnRyaW0oKSkgKyAnfSc7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyBnZW5lcmFsIGV4cHJlc3Npb25zIChlLmcuIHt7YnV0dG9uLnZhcmlhbnR9fSwge3tpdGVtLmxhYmVsfX0pXG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKihbYS16QS1aX11bYS16QS1aMC05X10qKD86XFwuW2EtekEtWl9dW2EtekEtWjAtOV8tXSopKilcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIHJldHVybiAnJHsnICsgcHJvcFRvRXhwcihwcm9wKSArICd9JztcbiAgICB9KTtcbiAgfVxuICBcbiAgcmV0dXJuIHsganN4VmFsdWU6IHJlc3VsdCwgaXNFeHByZXNzaW9uIH07XG59O1xuXG4vKipcbiAqIFByZS1wcm9jZXNzIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZXMgKGVudGlyZSBhdHRyaWJ1dGUgd3JhcHBlZCBpbiB7eyNpZn19KVxuICogSGFuZGxlcyB0d28gcGF0dGVybnM6XG4gKiAgIDEuIHt7I2lmIGNvbmRpdGlvbn19YXR0ck5hbWU9XCJ2YWx1ZVwie3svaWZ9fSAg4oCUIGF0dHIgd2l0aCB2YWx1ZVxuICogICAyLiB7eyNpZiBjb25kaXRpb259fSBhdHRyTmFtZXt7L2lmfX0gICAgICAgICAg4oCUIGJvb2xlYW4gYXR0ciAoZS5nLiBzZWxlY3RlZCwgZGlzYWJsZWQpXG4gKiBCb3RoIGFyZSBjb252ZXJ0ZWQgdG86IGF0dHJOYW1lPXtjb25kaXRpb24gPyB2YWx1ZSA6IHVuZGVmaW5lZH1cbiAqL1xuZXhwb3J0IGNvbnN0IHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMgPSAodGVtcGxhdGU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGxldCByZXN1bHQgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIFBhdHRlcm4gMToge3sjaWYgY29uZGl0aW9ufX0gYXR0ck5hbWU9XCJ2YWx1ZVwiIHt7L2lmfX0gKGFsbG93IG9wdGlvbmFsIHdoaXRlc3BhY2Ugc28gZS5nLiBzcmNzZXQgaXMgbWF0Y2hlZClcbiAgY29uc3QgY29uZEF0dHJSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfVxccyooXFx3Kyg/Oi1cXHcrKSopXFxzKj1cIihbXlwiXSopXCJcXHMqXFx7XFx7XFwvaWZcXH1cXH0vZztcbiAgXG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IGNvbmRBdHRyUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGxldCBjb25kaXRpb24gPSBtYXRjaFsxXS50cmltKCk7XG4gICAgY29uc3QgYXR0ck5hbWUgPSBtYXRjaFsyXTtcbiAgICBjb25zdCBhdHRyVmFsdWUgPSBtYXRjaFszXTtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSBtYXRjaFswXTtcbiAgICBjb25zdCBzdGFydFBvcyA9IG1hdGNoLmluZGV4O1xuICAgIFxuICAgIC8vIE5vcm1hbGl6ZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0byBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ0Byb290LnByb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbmRpdGlvbiA9IGNvbmRpdGlvbi5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBjb25kaXRpb24gdG8gSlNYIGV4cHJlc3Npb25cbiAgICBsZXQgY29uZEV4cHIgPSBjb25kaXRpb247XG4gICAgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGNvbmRpdGlvbi5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uZEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGNvbmRFeHByID0gYGl0ZW0uJHtjb25kaXRpb24ucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBhdHRyaWJ1dGUgdmFsdWUgdG8gSlNYIGV4cHJlc3Npb25cbiAgICBsZXQgdmFsdWVFeHByOiBzdHJpbmc7XG4gICAgaWYgKGF0dHJWYWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgLy8gVmFsdWUgY29udGFpbnMgaGFuZGxlYmFycyBleHByZXNzaW9uIChhbHNvIGhhbmRsZXMgQHJvb3QucHJvcGVydGllcy54eHgpXG4gICAgICBjb25zdCBwcm9wTWF0Y2ggPSBhdHRyVmFsdWUubWF0Y2goL1xce1xce1xccyooPzpAcm9vdFxcLik/cHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9Lyk7XG4gICAgICBpZiAocHJvcE1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcE1hdGNoWzFdLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgICB2YWx1ZUV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVFeHByID0gYCcke2F0dHJWYWx1ZX0nYDtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGF0dHJOYW1lID09PSAnc3R5bGUnKSB7XG4gICAgICAvLyBGb3IgY29uZGl0aW9uYWwgc3R5bGUgYXR0cmlidXRlcywgY29udmVydCBDU1Mgc3RyaW5nIHRvIGEgUmVhY3Qgc3R5bGUgb2JqZWN0XG4gICAgICB2YWx1ZUV4cHIgPSBjc3NTdHJpbmdUb1JlYWN0T2JqZWN0KGF0dHJWYWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlRXhwciA9IGAnJHthdHRyVmFsdWV9J2A7XG4gICAgfVxuICAgIFxuICAgIC8vIEdldCBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICBsZXQganN4QXR0ck5hbWUgPSBhdHRyTmFtZTtcbiAgICBpZiAoYXR0ck5hbWUgPT09ICdjbGFzcycpIHtcbiAgICAgIGpzeEF0dHJOYW1lID0gJ2NsYXNzTmFtZSc7XG4gICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ2ZvcicpIHtcbiAgICAgIGpzeEF0dHJOYW1lID0gJ2h0bWxGb3InO1xuICAgIH0gZWxzZSB7XG4gICAgICBqc3hBdHRyTmFtZSA9IHRvSnN4QXR0ck5hbWUoYXR0ck5hbWUpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBtYXJrZXJDb250ZW50ID0gYCR7Y29uZEV4cHJ9ID8gJHt2YWx1ZUV4cHJ9IDogdW5kZWZpbmVkYDtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IGAke2pzeEF0dHJOYW1lfT1cIl9fQ09ORF9BVFRSX18ke0J1ZmZlci5mcm9tKG1hcmtlckNvbnRlbnQpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9DT05EX0FUVFJfX1wiYDtcbiAgICBcbiAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhzdGFydFBvcyArIGZ1bGxNYXRjaC5sZW5ndGgpO1xuICAgIGNvbmRBdHRyUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gIH1cbiAgXG4gIC8vIFBhdHRlcm4gMjoge3sjaWYgY29uZGl0aW9ufX0gYm9vbGVhbkF0dHJ7ey9pZn19IChib29sZWFuIGF0dHJpYnV0ZSwgbm8gPVwidmFsdWVcIilcbiAgLy8gZS5nLiB7eyNpZiB0aGlzLnNlbGVjdGVkfX0gc2VsZWN0ZWR7ey9pZn19IG9yIHt7I2lmIHRoaXMuZGlzYWJsZWR9fSBkaXNhYmxlZHt7L2lmfX1cbiAgLy8gT25seSBtYXRjaGVzIG91dHNpZGUgYXR0cmlidXRlIHZhbHVlcyDigJQgY29uZGl0aW9uYWxzIGluc2lkZSBjbGFzcz1cIi4uLlwiIGV0Yy4gYXJlXG4gIC8vIGhhbmRsZWQgbGF0ZXIgYnkgY29udmVydEF0dHJpYnV0ZVZhbHVlLlxuICBjb25zdCBjb25kQm9vbFJlZ2V4ID0gL1xce1xceyNpZlxccysoW159XSspXFx9XFx9XFxzKihcXHcrKD86LVxcdyspKilcXHMqXFx7XFx7XFwvaWZcXH1cXH0vZztcbiAgXG4gIHdoaWxlICgobWF0Y2ggPSBjb25kQm9vbFJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSBtYXRjaFswXTtcbiAgICBjb25zdCBzdGFydFBvcyA9IG1hdGNoLmluZGV4O1xuICAgIFxuICAgIC8vIFNraXAgaWYgdGhpcyBtYXRjaCBpcyBpbnNpZGUgYW4gSFRNTCBhdHRyaWJ1dGUgdmFsdWUgKGJldHdlZW4gcXVvdGVzKS5cbiAgICAvLyBGaW5kIHRoZSBsYXN0IGA8YCBiZWZvcmUgdGhpcyBwb3NpdGlvbiBhbmQgY291bnQgdW5lc2NhcGVkIHF1b3RlcyBpbiB0aGVcbiAgICAvLyBzZWdtZW50IGJldHdlZW4gdGhhdCBgPGAgYW5kIHRoZSBtYXRjaCwgaWdub3JpbmcgcXVvdGVzIGluc2lkZSB7ey4uLn19IGJsb2Nrcy5cbiAgICBjb25zdCBsYXN0VGFnU3RhcnQgPSByZXN1bHQubGFzdEluZGV4T2YoJzwnLCBzdGFydFBvcyk7XG4gICAgaWYgKGxhc3RUYWdTdGFydCAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IHNlZ21lbnQgPSByZXN1bHQuc3Vic3RyaW5nKGxhc3RUYWdTdGFydCwgc3RhcnRQb3MpO1xuICAgICAgY29uc3Qgc2VnbWVudE5vSGJzID0gc2VnbWVudC5yZXBsYWNlKC9cXHtcXHtbXFxzXFxTXSo/XFx9XFx9L2csICcnKTtcbiAgICAgIGNvbnN0IHF1b3RlQ291bnQgPSAoc2VnbWVudE5vSGJzLm1hdGNoKC9cIi9nKSB8fCBbXSkubGVuZ3RoO1xuICAgICAgaWYgKHF1b3RlQ291bnQgJSAyID09PSAxKSB7XG4gICAgICAgIC8vIE9kZCBxdW90ZSBjb3VudCBtZWFucyB3ZSdyZSBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIOKAlCBza2lwXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBsZXQgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgXG4gICAgLy8gTm9ybWFsaXplIEByb290LnByb3BlcnRpZXMueHh4IHRvIHByb3BlcnRpZXMueHh4IChyb290IGNvbnRleHQgYWNjZXNzKVxuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgnQHJvb3QucHJvcGVydGllcy4nKSkge1xuICAgICAgY29uZGl0aW9uID0gY29uZGl0aW9uLnJlcGxhY2UoL15Acm9vdFxcLi8sICcnKTtcbiAgICB9XG4gICAgXG4gICAgbGV0IGNvbmRFeHByID0gY29uZGl0aW9uO1xuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBjb25kaXRpb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbmRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25kRXhwciA9IGBpdGVtLiR7Y29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGpzeEF0dHJOYW1lID0gdG9Kc3hBdHRyTmFtZShhdHRyTmFtZSk7XG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSB8fCB1bmRlZmluZWRgO1xuICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCAke2pzeEF0dHJOYW1lfT1cIl9fQ09ORF9BVFRSX18ke0J1ZmZlci5mcm9tKG1hcmtlckNvbnRlbnQpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9DT05EX0FUVFJfX1wiYDtcbiAgICBcbiAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhzdGFydFBvcyArIGZ1bGxNYXRjaC5sZW5ndGgpO1xuICAgIGNvbmRCb29sUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFByZS1wcm9jZXNzIGF0dHJpYnV0ZSB2YWx1ZXMgdGhhdCBjb250YWluIGNvbmRpdGlvbmFsc1xuICogVGhpcyBtdXN0IHJ1biBiZWZvcmUgcHJlcHJvY2Vzc0Jsb2NrcyB0byBwcmV2ZW50IGlmLW1hcmtlcnMgZnJvbSBhcHBlYXJpbmcgaW5zaWRlIGF0dHJpYnV0ZXNcbiAqIEBwYXJhbSBjdXJyZW50TG9vcEFycmF5IC0gV2hlbiBwcm9jZXNzaW5nIGxvb3AgaW5uZXIgY29udGVudCwgcGFzcyB0aGUgYXJyYXkgbmFtZSBzbyB7eyN1bmxlc3MgQGxhc3R9fSBldGMuIGdldCB0aGUgY29ycmVjdCBhcnJheSAoZS5nLiBcImN0YXNcIikgaW5zdGVhZCBvZiBkZWZhdWx0IFwiaXRlbXNcIlxuICovXG5leHBvcnQgY29uc3QgcHJlcHJvY2Vzc0F0dHJpYnV0ZUNvbmRpdGlvbmFscyA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjdXJyZW50TG9vcEFycmF5Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlc3VsdCA9IHRlbXBsYXRlO1xuICBcbiAgLy8gRmlyc3QgaGFuZGxlIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZXMgKGVudGlyZSBhdHRyaWJ1dGUgd3JhcHBlZCBpbiB7eyNpZn19KVxuICByZXN1bHQgPSBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzKHJlc3VsdCk7XG4gIFxuICAvLyBGaW5kIGF0dHJpYnV0ZXMgdGhhdCBjb250YWluIHt7I2lmIG9yIHt7I3VubGVzc1xuICAvLyBXZSBuZWVkIHRvIG1hbnVhbGx5IHBhcnNlIHRvIGhhbmRsZSBuZXN0ZWQgcXVvdGVzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gIGxldCBwb3MgPSAwO1xuICB3aGlsZSAocG9zIDwgcmVzdWx0Lmxlbmd0aCkge1xuICAgIC8vIEZpbmQgbmV4dCBhdHRyaWJ1dGUgcGF0dGVybjogYXR0ck5hbWU9XCJcbiAgICBjb25zdCBhdHRyU3RhcnRNYXRjaCA9IHJlc3VsdC5zdWJzdHJpbmcocG9zKS5tYXRjaCgvKFxcdysoPzotXFx3KykqKT1cIi8pO1xuICAgIGlmICghYXR0clN0YXJ0TWF0Y2gpIGJyZWFrO1xuICAgIFxuICAgIGNvbnN0IGF0dHJOYW1lID0gYXR0clN0YXJ0TWF0Y2hbMV07XG4gICAgY29uc3QgYXR0clN0YXJ0ID0gcG9zICsgYXR0clN0YXJ0TWF0Y2guaW5kZXghO1xuICAgIGNvbnN0IHZhbHVlU3RhcnQgPSBhdHRyU3RhcnQgKyBhdHRyU3RhcnRNYXRjaFswXS5sZW5ndGg7XG4gICAgXG4gICAgLy8gRmluZCB0aGUgY2xvc2luZyBxdW90ZSwgYnV0IGJlIGNhcmVmdWwgYWJvdXQgcXVvdGVzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gICAgbGV0IHZhbHVlRW5kID0gLTE7XG4gICAgbGV0IGluSGFuZGxlYmFycyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IHZhbHVlU3RhcnQ7IGkgPCByZXN1bHQubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGNoYXIgPSByZXN1bHRbaV07XG4gICAgICBjb25zdCBuZXh0Q2hhciA9IHJlc3VsdFtpICsgMV07XG4gICAgICBcbiAgICAgIGlmIChjaGFyID09PSAneycgJiYgbmV4dENoYXIgPT09ICd7Jykge1xuICAgICAgICBpbkhhbmRsZWJhcnMrKztcbiAgICAgICAgaSsrOyAvLyBTa2lwIG5leHQgY2hhclxuICAgICAgfSBlbHNlIGlmIChjaGFyID09PSAnfScgJiYgbmV4dENoYXIgPT09ICd9Jykge1xuICAgICAgICBpbkhhbmRsZWJhcnMtLTtcbiAgICAgICAgaSsrOyAvLyBTa2lwIG5leHQgY2hhclxuICAgICAgfSBlbHNlIGlmIChjaGFyID09PSAnXCInICYmIGluSGFuZGxlYmFycyA9PT0gMCkge1xuICAgICAgICB2YWx1ZUVuZCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpZiAodmFsdWVFbmQgPT09IC0xKSB7XG4gICAgICBwb3MgPSB2YWx1ZVN0YXJ0O1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGF0dHJWYWx1ZSA9IHJlc3VsdC5zdWJzdHJpbmcodmFsdWVTdGFydCwgdmFsdWVFbmQpO1xuICAgIGNvbnN0IGZ1bGxNYXRjaCA9IHJlc3VsdC5zdWJzdHJpbmcoYXR0clN0YXJ0LCB2YWx1ZUVuZCArIDEpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgYXR0cmlidXRlIGNvbnRhaW5zIGEgY29uZGl0aW9uYWxcbiAgICBpZiAoYXR0clZhbHVlLmluY2x1ZGVzKCd7eyNpZicpIHx8IGF0dHJWYWx1ZS5pbmNsdWRlcygne3sjdW5sZXNzJykpIHtcbiAgICAgIC8vIElmIHRoaXMgYXR0cmlidXRlIHJlZmVyZW5jZXMgQGxhc3Qgb3IgQGZpcnN0IGJ1dCB3ZSBkb24ndCBrbm93IHRoZVxuICAgICAgLy8gZW5jbG9zaW5nIGxvb3AgYXJyYXkgeWV0ICh0b3AtbGV2ZWwgcGFzcyksIGRlZmVyIHByb2Nlc3NpbmcgdW50aWxcbiAgICAgIC8vIHRoZSBsb29wIGlzIGV4cGFuZGVkIHdpdGggdGhlIGNvcnJlY3QgYXJyYXkgbmFtZS5cbiAgICAgIGlmICghY3VycmVudExvb3BBcnJheSAmJiAoYXR0clZhbHVlLmluY2x1ZGVzKCdAbGFzdCcpIHx8IGF0dHJWYWx1ZS5pbmNsdWRlcygnQGZpcnN0JykpKSB7XG4gICAgICAgIHBvcyA9IHZhbHVlRW5kICsgMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBDb252ZXJ0IHRoZSBhdHRyaWJ1dGUgdmFsdWUgdXNpbmcgb3VyIGhlbHBlciAocGFzcyBjdXJyZW50TG9vcEFycmF5IGZvciBAbGFzdCAvIEBmaXJzdClcbiAgICAgIGNvbnN0IHsganN4VmFsdWUsIGlzRXhwcmVzc2lvbiB9ID0gY29udmVydEF0dHJpYnV0ZVZhbHVlKGF0dHJWYWx1ZSwgJ2l0ZW0nLCBjdXJyZW50TG9vcEFycmF5KTtcbiAgICAgIFxuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBHZXQgdGhlIEpTWCBhdHRyaWJ1dGUgbmFtZVxuICAgICAgICBsZXQganN4QXR0ck5hbWUgPSBhdHRyTmFtZTtcbiAgICAgICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICAgICAganN4QXR0ck5hbWUgPSAnY2xhc3NOYW1lJztcbiAgICAgICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ2ZvcicpIHtcbiAgICAgICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSByZXBsYWNlbWVudCB3aXRoIEpTWCB0ZW1wbGF0ZSBsaXRlcmFsXG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCR7anN4QXR0ck5hbWV9PXtfX1RFTVBMQVRFX0xJVEVSQUxfXyR7QnVmZmVyLmZyb20oanN4VmFsdWUpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9URU1QTEFURV9MSVRFUkFMX199YDtcbiAgICAgICAgXG4gICAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgYXR0clN0YXJ0KSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyh2YWx1ZUVuZCArIDEpO1xuICAgICAgICBwb3MgPSBhdHRyU3RhcnQgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwb3MgPSB2YWx1ZUVuZCArIDE7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiogRW5zdXJlIGNsYXNzTmFtZSBhbHdheXMgcmVjZWl2ZXMgYSBzdHJpbmcgKFJlYWN0IHdhcm5zIG9uIGJvb2xlYW4pLiAqL1xuY29uc3QgZW5zdXJlQ2xhc3NOYW1lRXhwciA9IChqc3hOYW1lOiBzdHJpbmcsIGV4cHI6IHN0cmluZyk6IHN0cmluZyA9PlxuICBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGBTdHJpbmcoJHtleHByfSA/PyAnJylgIDogZXhwcjtcblxuLyoqXG4gKiBDb252ZXJ0IEhUTUwgYXR0cmlidXRlcyB0byBKU1ggYXR0cmlidXRlc1xuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZXMgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0KTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0cnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGxvb3BWYXIgPSBjb250ZXh0Lmxvb3BWYXJpYWJsZSB8fCAnaXRlbSc7XG4gIFxuICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZWxlbWVudC5hdHRyaWJ1dGVzKSkge1xuICAgIC8vIENoZWNrIGZvciBjb25kaXRpb25hbCBhdHRyaWJ1dGUgbWFya2VyIEZJUlNUIOKAlCBhcHBsaWVzIHRvIGFueSBhdHRyaWJ1dGUgaW5jbHVkaW5nIHN0eWxlLlxuICAgIC8vIHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMgZW5jb2RlcyB7eyNpZiBjb25kfX1hdHRyTmFtZT1cInZhbHVlXCJ7ey9pZn19IGludG8gdGhpcyBtYXJrZXIuXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCdfX0NPTkRfQVRUUl9fJykpIHtcbiAgICAgIGNvbnN0IGNvbmRNYXRjaCA9IHZhbHVlLm1hdGNoKC9fX0NPTkRfQVRUUl9fKFtBLVphLXowLTkrLz1dKylfX0VORF9DT05EX0FUVFJfXy8pO1xuICAgICAgaWYgKGNvbmRNYXRjaCkge1xuICAgICAgICBjb25zdCBkZWNvZGVkID0gQnVmZmVyLmZyb20oY29uZE1hdGNoWzFdLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgICAgY29uc3QganN4QXR0ckZvckNvbmQgPSBuYW1lID09PSAnY2xhc3MnID8gJ2NsYXNzTmFtZScgOiBuYW1lID09PSAnZm9yJyA/ICdodG1sRm9yJyA6IHRvSnN4QXR0ck5hbWUobmFtZSk7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4QXR0ckZvckNvbmR9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4QXR0ckZvckNvbmQsIGRlY29kZWQpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBzdHlsZSB0byBvYmplY3QgKHNwZWNpYWwgaGFuZGxpbmcpXG4gICAgaWYgKG5hbWUgPT09ICdzdHlsZScpIHtcbiAgICAgIGNvbnN0IHN0eWxlT2JqID0gcGFyc2VTdHlsZVRvT2JqZWN0KHZhbHVlLCBjb250ZXh0KTtcbiAgICAgIGF0dHJzLnB1c2goYHN0eWxlPSR7c3R5bGVPYmp9YCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2V0IHRoZSBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICBjb25zdCBqc3hOYW1lID0gdG9Kc3hBdHRyTmFtZShuYW1lKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB2YWx1ZSBjb250YWlucyBibG9jayBjb25kaXRpb25hbHMge3sjaWYuLi59fVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygne3sjaWYnKSkge1xuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUoXG4gICAgICAgIHZhbHVlLFxuICAgICAgICBsb29wVmFyLFxuICAgICAgICBjb250ZXh0Lmxvb3BBcnJheSxcbiAgICAgICAgY29udGV4dC5sb29wSW5kZXgsXG4gICAgICApO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICBjb25zdCB3cmFwcGVkID0ganN4TmFtZSA9PT0gJ2NsYXNzTmFtZScgPyBgXFwke1N0cmluZygke2pzeFZhbHVlfSA/PyAnJyl9YCA6IGpzeFZhbHVlO1xuICAgICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXtcXGAke3dyYXBwZWR9XFxgfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIGhyZWYgd2l0aCBoYW5kbGViYXJzXG4gICAgaWYgKG5hbWUgPT09ICdocmVmJyAmJiB2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXFx7XFx7K1xccyooW159XSs/KVxccypcXH0rXFx9Lyk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obWF0Y2hbMV0sIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgICBhdHRycy5wdXNoKGBocmVmPXske2V4cHJ9IHx8ICcjJ31gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBzcmMvYWx0IHdpdGggaGFuZGxlYmFycyAobmVzdGVkIGltYWdlIG9iamVjdHMgbmVlZCBvcHRpb25hbCBjaGFpbmluZylcbiAgICBpZiAoKG5hbWUgPT09ICdzcmMnIHx8IG5hbWUgPT09ICdhbHQnKSAmJiB2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXFx7XFx7K1xccyooW159XSs/KVxccypcXH0rXFx9Lyk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obWF0Y2hbMV0sIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgZXhwcil9fWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIG90aGVyIGF0dHJpYnV0ZXMgd2l0aCBoYW5kbGViYXJzIChpbmNsdWRpbmcgc2ltcGxlIGV4cHJlc3Npb25zKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUoXG4gICAgICAgIHZhbHVlLFxuICAgICAgICBsb29wVmFyLFxuICAgICAgICBjb250ZXh0Lmxvb3BBcnJheSxcbiAgICAgICAgY29udGV4dC5sb29wSW5kZXgsXG4gICAgICApO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHVyZSBleHByZXNzaW9uIG9yIG5lZWRzIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgaWYgKGpzeFZhbHVlLnN0YXJ0c1dpdGgoJyR7JykgJiYganN4VmFsdWUuZW5kc1dpdGgoJ30nKSAmJiAhanN4VmFsdWUuaW5jbHVkZXMoJyR7JywgMikpIHtcbiAgICAgICAgICAvLyBTaW1wbGUgZXhwcmVzc2lvbiBsaWtlICR7cHJvcH0gLSBleHRyYWN0IGp1c3QgdGhlIGV4cHJlc3Npb25cbiAgICAgICAgICBjb25zdCBleHByID0ganN4VmFsdWUuc2xpY2UoMiwgLTEpO1xuICAgICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGVtcGxhdGUgbGl0ZXJhbCB3aXRoIHN0YXRpYyBwYXJ0cyBvciBtdWx0aXBsZSBleHByZXNzaW9uc1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGpzeFZhbHVlLnJlcGxhY2UoL1xcJFxceyhbXn1dKylcXH0vZywgKF8sIGUpID0+IGBcXCR7U3RyaW5nKCR7ZX0gPz8gJycpfWApIDoganN4VmFsdWU7XG4gICAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgZm9yIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeE5hbWUsIGV4cHIpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEJvb2xlYW4gYXR0cmlidXRlc1xuICAgIGlmICh2YWx1ZSA9PT0gJycgfHwgdmFsdWUgPT09IG5hbWUpIHtcbiAgICAgIGF0dHJzLnB1c2goanN4TmFtZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHRlbXBsYXRlIGxpdGVyYWwgbWFya2VyIChhbHJlYWR5IHByb2Nlc3NlZCBieSBwcmVwcm9jZXNzQXR0cmlidXRlQ29uZGl0aW9uYWxzKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19URU1QTEFURV9MSVRFUkFMX18nKSkge1xuICAgICAgLy8gVGhlIHZhbHVlIG1pZ2h0IGJlIHdyYXBwZWQgaW4ge30gZnJvbSBwcmVwcm9jZXNzaW5nIC0gc3RyaXAgdGhlbSBpZiBwcmVzZW50XG4gICAgICBsZXQgY2xlYW5WYWx1ZSA9IHZhbHVlO1xuICAgICAgaWYgKGNsZWFuVmFsdWUuc3RhcnRzV2l0aCgneycpICYmIGNsZWFuVmFsdWUuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICBjbGVhblZhbHVlID0gY2xlYW5WYWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgICB9XG4gICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgY2xlYW5WYWx1ZSl9fWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YW5kYXJkIGF0dHJpYnV0ZXNcbiAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PVwiJHt2YWx1ZX1cImApO1xuICB9XG4gIFxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufTtcbiJdfQ==