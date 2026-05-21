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
 * Convert conditionals inside an attribute value to JSX template literal syntax
 * Called from convertAttributes after HTML parsing
 * Example: "prefix{{#if cond}}value{{/if}}suffix" -> `prefix${cond ? 'value' : ''}suffix`
 * @param loopArray - Name of the array being iterated (for @last / @first); when inside {{#each arr}}, use 'arr'.
 */
const convertAttributeValue = (value, loopVar = 'item', loopArray) => {
    const arrayName = loopArray || 'items';
    let result = value;
    let isExpression = false;
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
            return 'index === 0';
        }
        if (prop === '@last') {
            return `index === ${arrayName}?.length - 1`;
        }
        if (prop === '@index') {
            return 'index';
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
        return '${index < ' + arrayName + '?.length - 1 ? ' + unlessExpr + " : ''}";
    });
    // Handle {{#unless @first}}value{{/unless}} pattern
    // Use [\s\S]*? to match across newlines
    result = result.replace(/\{\{#unless\s+@first\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, unlessVal) => {
        isExpression = true;
        const unlessExpr = convertInnerToExpr((0, utils_1.collapseWhitespace)(unlessVal));
        // @first is true when index === 0, so unless @first means index !== 0
        return "${index !== 0 ? " + unlessExpr + " : ''}";
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
            const { jsxValue, isExpression } = (0, exports.convertAttributeValue)(value, loopVar, context.loopArray);
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
            const { jsxValue, isExpression } = (0, exports.convertAttributeValue)(value, loopVar, context.loopArray);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L2F0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFJSCxtQ0FBOEY7QUFDOUYsMkRBQXdIO0FBQ3hILHFDQUFzRTtBQUV0RTs7Ozs7R0FLRztBQUNJLE1BQU0scUJBQXFCLEdBQUcsQ0FDbkMsS0FBYSxFQUNiLFVBQWtCLE1BQU0sRUFDeEIsU0FBa0IsRUFDTyxFQUFFO0lBQzNCLE1BQU0sU0FBUyxHQUFHLFNBQVMsSUFBSSxPQUFPLENBQUM7SUFDdkMsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ25CLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQztJQUV6Qix1RkFBdUY7SUFDdkYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtRQUMzQyxpRkFBaUY7UUFDakYsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDM0QsOENBQThDO1FBQzlDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDcEIsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekQsUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxF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QztZQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLEtBQUssbUJBQW1CLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN2RSxTQUFTO1FBQ1gsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN6QixDQUFDLENBQUM7QUF6R1csUUFBQSxpQkFBaUIscUJBeUc1QiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXR0cmlidXRlIGNvbnZlcnNpb24gdXRpbGl0aWVzIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IEhUTUxFbGVtZW50IH0gZnJvbSAnbm9kZS1odG1sLXBhcnNlcic7XG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCwgQ29udmVydGVkQXR0cmlidXRlVmFsdWUgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlLCB0b0pzeEF0dHJOYW1lLCBub3JtYWxpemVXaGl0ZXNwYWNlLCBjb2xsYXBzZVdoaXRlc3BhY2UgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IHRyYW5zcGlsZUV4cHJlc3Npb24sIHJlc29sdmVQYXJlbnRQcm9wZXJ0aWVzSW5FeHByZXNzaW9uLCB0b09wdGlvbmFsQ2hhaW5lZEFjY2VzcyB9IGZyb20gJy4vZXhwcmVzc2lvbi1wYXJzZXInO1xuaW1wb3J0IHsgcGFyc2VTdHlsZVRvT2JqZWN0LCBjc3NTdHJpbmdUb1JlYWN0T2JqZWN0IH0gZnJvbSAnLi9zdHlsZXMnO1xuXG4vKipcbiAqIENvbnZlcnQgY29uZGl0aW9uYWxzIGluc2lkZSBhbiBhdHRyaWJ1dGUgdmFsdWUgdG8gSlNYIHRlbXBsYXRlIGxpdGVyYWwgc3ludGF4XG4gKiBDYWxsZWQgZnJvbSBjb252ZXJ0QXR0cmlidXRlcyBhZnRlciBIVE1MIHBhcnNpbmdcbiAqIEV4YW1wbGU6IFwicHJlZml4e3sjaWYgY29uZH19dmFsdWV7ey9pZn19c3VmZml4XCIgLT4gYHByZWZpeCR7Y29uZCA/ICd2YWx1ZScgOiAnJ31zdWZmaXhgXG4gKiBAcGFyYW0gbG9vcEFycmF5IC0gTmFtZSBvZiB0aGUgYXJyYXkgYmVpbmcgaXRlcmF0ZWQgKGZvciBAbGFzdCAvIEBmaXJzdCk7IHdoZW4gaW5zaWRlIHt7I2VhY2ggYXJyfX0sIHVzZSAnYXJyJy5cbiAqL1xuZXhwb3J0IGNvbnN0IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZSA9IChcbiAgdmFsdWU6IHN0cmluZyxcbiAgbG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nLFxuICBsb29wQXJyYXk/OiBzdHJpbmdcbik6IENvbnZlcnRlZEF0dHJpYnV0ZVZhbHVlID0+IHtcbiAgY29uc3QgYXJyYXlOYW1lID0gbG9vcEFycmF5IHx8ICdpdGVtcyc7XG4gIGxldCByZXN1bHQgPSB2YWx1ZTtcbiAgbGV0IGlzRXhwcmVzc2lvbiA9IGZhbHNlO1xuICBcbiAgLy8gSGVscGVyIHRvIHBhcnNlIEhhbmRsZWJhcnMgaGVscGVyIGV4cHJlc3Npb25zIGxpa2UgKGVxIHByb3BlcnRpZXMubGF5b3V0IFwibGF5b3V0LTFcIilcbiAgY29uc3QgcGFyc2VIZWxwZXIgPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBOb3JtYWxpemUgQHJvb3QucHJvcGVydGllcy54eHggdG8gcHJvcGVydGllcy54eHggc28gdGhlIGV4aXN0aW5nIHJlZ2V4IG1hdGNoZXNcbiAgICBleHByID0gZXhwci5yZXBsYWNlKC9Acm9vdFxcLnByb3BlcnRpZXNcXC4vZywgJ3Byb3BlcnRpZXMuJyk7XG4gICAgLy8gTWF0Y2ggKGVxIGxlZnQgcmlnaHQpIG9yIChlcSBsZWZ0IFwic3RyaW5nXCIpXG4gICAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKGVxTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgbGVmdEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2xlZnRFeHByfSA9PT0gXCIke3JpZ2h0fVwiYDtcbiAgICB9XG4gICAgXG4gICAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJzdHJpbmdcIilcbiAgICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAobmVNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICAgIGxldCBsZWZ0RXhwciA9IGxlZnQ7XG4gICAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gbGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICBsZWZ0RXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ICE9PSBcIiR7cmlnaHR9XCJgO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gJyc7XG4gIH07XG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBwcm9wZXJ0eSByZWZlcmVuY2Ugb3IgaGVscGVyIGV4cHJlc3Npb24gdG8gSlNYIGV4cHJlc3Npb25cbiAgY29uc3QgcHJvcFRvRXhwciA9IChwcm9wOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIC8vIFJlc29sdmUgLi4vcHJvcGVydGllcy54eHggKHBhcmVudCBjb250ZXh0IGluIGxvb3BzKSBhbmQgQHJvb3QucHJvcGVydGllcy54eHggKHJvb3QgY29udGV4dCkgdG8gdG9wLWxldmVsIGNhbWVsQ2FzZVxuICAgIHByb3AgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihwcm9wKTtcbiAgICAvLyBTdHJpcCBiYXJlIEByb290LiBwcmVmaXggKGUuZy4gQHJvb3QueHh4LCB3aGljaCByZXNvbHZlcyBsaWtlIHh4eCBhdCByb290IGNvbnRleHQpXG4gICAgaWYgKHByb3Auc3RhcnRzV2l0aCgnQHJvb3QuJykpIHtcbiAgICAgIHByb3AgPSBwcm9wLnN1YnN0cmluZyg2KTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIGhlbHBlciBleHByZXNzaW9uIGxpa2UgKGVxIC4uLilcbiAgICBpZiAocHJvcC5zdGFydHNXaXRoKCcoJykpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSGVscGVyKHByb3ApO1xuICAgICAgaWYgKHBhcnNlZCkgcmV0dXJuIHBhcnNlZDtcbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIEBmaXJzdCBhbmQgQGxhc3Qgc3BlY2lhbCB2YXJpYWJsZXNcbiAgICBpZiAocHJvcCA9PT0gJ0BmaXJzdCcpIHtcbiAgICAgIHJldHVybiAnaW5kZXggPT09IDAnO1xuICAgIH1cbiAgICBpZiAocHJvcCA9PT0gJ0BsYXN0Jykge1xuICAgICAgcmV0dXJuIGBpbmRleCA9PT0gJHthcnJheU5hbWV9Py5sZW5ndGggLSAxYDtcbiAgICB9XG4gICAgaWYgKHByb3AgPT09ICdAaW5kZXgnKSB7XG4gICAgICByZXR1cm4gJ2luZGV4JztcbiAgICB9XG4gICAgXG4gICAgaWYgKHByb3Auc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICByZXR1cm4gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKHByb3Auc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHByb3AucmVwbGFjZSgndGhpcy4nLCAnJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3Auc3BsaXQoJy4nKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGNvbnN0IFtyb290LCAuLi5yZXN0XSA9IHBhcnRzO1xuICAgICAgICBpZiAocm9vdCA9PT0gbG9vcFZhcikge1xuICAgICAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCByZXN0LmpvaW4oJy4nKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtyb290LCAuLi5yZXN0XS5qb2luKCc/LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHByb3ApO1xuICAgIH1cbiAgfTtcbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGlubmVyIGNvbnRlbnQgdGhhdCBtYXkgY29udGFpbiBwcm9wZXJ0eSByZWZlcmVuY2VzXG4gIC8vIFJldHVybnMgYW4gZXhwcmVzc2lvbiB0aGF0IGNhbiBiZSBjb25jYXRlbmF0ZWQgKG5vdCBhIHRlbXBsYXRlIGxpdGVyYWwgc3RyaW5nKVxuICBjb25zdCBjb252ZXJ0SW5uZXJUb0V4cHIgPSAodmFsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIC8vIENoZWNrIGlmIHZhbCBpcyBKVVNUIGEgcHJvcGVydHkgcmVmZXJlbmNlXG4gICAgY29uc3QganVzdFByb3BNYXRjaCA9IHZhbC5tYXRjaCgvXlxce1xce1xccyooW159XSspXFxzKlxcfVxcfSQvKTtcbiAgICBpZiAoanVzdFByb3BNYXRjaCkge1xuICAgICAgcmV0dXJuIHByb3BUb0V4cHIoanVzdFByb3BNYXRjaFsxXS50cmltKCkpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBpZiB2YWwgY29udGFpbnMgcHJvcGVydHkgcmVmZXJlbmNlcyBtaXhlZCB3aXRoIHN0YXRpYyB0ZXh0XG4gICAgaWYgKHZhbC5pbmNsdWRlcygne3snKSkge1xuICAgICAgLy8gQ29udmVydCB0byB0ZW1wbGF0ZSBsaXRlcmFsXG4gICAgICBsZXQgZXhwciA9IHZhbDtcbiAgICAgIC8vIEhhbmRsZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0aGUgc2FtZSB3YXkgYXMgcHJvcGVydGllcy54eHggKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqQHJvb3RcXC5wcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICAgIHJldHVybiAnJHsnICsganN4UHJvcCArICd9JztcbiAgICAgIH0pO1xuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBqc3hQcm9wID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgICAgfSk7XG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqdGhpc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICByZXR1cm4gJyR7JyArIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHByb3AudHJpbSgpKSArICd9JztcbiAgICAgIH0pO1xuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKihbYS16QS1aX11bYS16QS1aMC05X10qKD86XFwuW2EtekEtWl9dW2EtekEtWjAtOV9dKikqKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIGlmICghcHJvcC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpICYmICFwcm9wLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgICByZXR1cm4gJyR7JyArIHByb3BUb0V4cHIocHJvcCkgKyAnfSc7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICckeycgKyBwcm9wICsgJ30nO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gJ2AnICsgZXhwciArICdgJztcbiAgICB9XG4gICAgXG4gICAgLy8gUGxhaW4gc3RhdGljIHRleHRcbiAgICByZXR1cm4gXCInXCIgKyB2YWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpICsgXCInXCI7XG4gIH07XG4gIFxuICAvLyBIYW5kbGUge3sjaWYgYzF9fXYxe3tlbHNlIGlmIGMyfX12Mnt7ZWxzZX19djN7ey9pZn19IChuZXN0ZWQgZWxzZS1pZiBjaGFpbilcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxccytpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZDE6IHN0cmluZywgdmFsMTogc3RyaW5nLCBjb25kMjogc3RyaW5nLCB2YWwyOiBzdHJpbmcsIHZhbDM6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGMxID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmQxKSk7XG4gICAgICBjb25zdCBjMiA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kMikpO1xuICAgICAgY29uc3QgdjEgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHZhbDEpKTtcbiAgICAgIGNvbnN0IHYyID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh2YWwyKSk7XG4gICAgICBjb25zdCB2MyA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodmFsMykpO1xuICAgICAgcmV0dXJuICckeycgKyBjMSArICcgPyAnICsgdjEgKyAnIDogJyArIGMyICsgJyA/ICcgKyB2MiArICcgOiAnICsgdjMgKyAnfSc7XG4gICAgfVxuICApO1xuXG4gIC8vIEhhbmRsZSB7eyNpZiBjMX19djF7e2Vsc2UgaWYgYzJ9fXYye3svaWZ9fSAoZWxzZS1pZiB3aXRob3V0IGZpbmFsIGVsc2UpXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXHMraWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZDE6IHN0cmluZywgdmFsMTogc3RyaW5nLCBjb25kMjogc3RyaW5nLCB2YWwyOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjMSA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kMSkpO1xuICAgICAgY29uc3QgYzIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZDIpKTtcbiAgICAgIGNvbnN0IHYxID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh2YWwxKSk7XG4gICAgICBjb25zdCB2MiA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodmFsMikpO1xuICAgICAgcmV0dXJuICckeycgKyBjMSArICcgPyAnICsgdjEgKyAnIDogJyArIGMyICsgJyA/ICcgKyB2MiArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuXG4gIC8vIEhhbmRsZSB7eyNpZiBjb25kaXRpb259fXZhbHVle3tlbHNlfX1vdGhlcnt7L2lmfX0gcGF0dGVyblxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZGl0aW9uOiBzdHJpbmcsIGlmVmFsOiBzdHJpbmcsIGVsc2VWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgaWZFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShpZlZhbCkpO1xuICAgICAgY29uc3QgZWxzZUV4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKGVsc2VWYWwpKTtcbiAgICAgIFxuICAgICAgcmV0dXJuICckeycgKyBjb25kRXhwciArICcgPyAnICsgaWZFeHByICsgJyA6ICcgKyBlbHNlRXhwciArICd9JztcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjaWYgY29uZGl0aW9ufX12YWx1ZXt7L2lmfX0gcGF0dGVybiAobm8gZWxzZSlcbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZGl0aW9uOiBzdHJpbmcsIGlmVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IGlmRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoaWZWYWwpKTtcbiAgICAgIFxuICAgICAgcmV0dXJuICckeycgKyBjb25kRXhwciArICcgPyAnICsgaWZFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjdW5sZXNzIEBsYXN0fX12YWx1ZXt7L3VubGVzc319IHBhdHRlcm5cbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK0BsYXN0XFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIHVubGVzc1ZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICAvLyBAbGFzdCBtZWFucyBpdCdzIE5PVCB0aGUgbGFzdCBpdGVtLCBzbyB3ZSBjaGVjayBpbmRleCA8IGFycmF5Lmxlbmd0aCAtIDFcbiAgICAgIHJldHVybiAnJHtpbmRleCA8ICcgKyBhcnJheU5hbWUgKyAnPy5sZW5ndGggLSAxID8gJyArIHVubGVzc0V4cHIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgQGZpcnN0fX12YWx1ZXt7L3VubGVzc319IHBhdHRlcm5cbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK0BmaXJzdFxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgLy8gQGZpcnN0IGlzIHRydWUgd2hlbiBpbmRleCA9PT0gMCwgc28gdW5sZXNzIEBmaXJzdCBtZWFucyBpbmRleCAhPT0gMFxuICAgICAgcmV0dXJuIFwiJHtpbmRleCAhPT0gMCA/IFwiICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgY29uZGl0aW9ufX12YWx1ZXt7ZWxzZX19b3RoZXJ7ey91bmxlc3N9fSBwYXR0ZXJuIChtdXN0IHJ1biBiZWZvcmUgdW5sZXNzIHdpdGhvdXQgZWxzZSlcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcsIGVsc2VWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICBjb25zdCBlbHNlRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoZWxzZVZhbCkpO1xuXG4gICAgICByZXR1cm4gJyR7IScgKyBjb25kRXhwciArICcgPyAnICsgdW5sZXNzRXhwciArICcgOiAnICsgZWxzZUV4cHIgKyAnfSc7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBjb25kaXRpb259fXZhbHVle3svdW5sZXNzfX0gcGF0dGVybiAoZ2VuZXJhbClcbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgXG4gICAgICAvLyB1bmxlc3MgaXMgdGhlIG9wcG9zaXRlIG9mIGlmXG4gICAgICByZXR1cm4gJyR7IScgKyBjb25kRXhwciArICcgPyAnICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQWxzbyBjb252ZXJ0IHJlbWFpbmluZyB7e0Byb290LnByb3BlcnRpZXMueHh4fX0gKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKkByb290XFwucHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQWxzbyBjb252ZXJ0IHJlbWFpbmluZyB7e3Byb3BlcnRpZXMueHh4fX1cbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydCByZW1haW5pbmcge3t0aGlzLnh4eH19IChsb29wIGl0ZW0gcmVmZXJlbmNlcyB2aWEgdGhpcylcbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqdGhpc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIHJldHVybiAnJHsnICsgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC50cmltKCkpICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydCByZW1haW5pbmcgZ2VuZXJhbCBleHByZXNzaW9ucyAoZS5nLiB7e2J1dHRvbi52YXJpYW50fX0sIHt7aXRlbS5sYWJlbH19KVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccyooW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfLV0qKSopXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICByZXR1cm4gJyR7JyArIHByb3BUb0V4cHIocHJvcCkgKyAnfSc7XG4gICAgfSk7XG4gIH1cbiAgXG4gIHJldHVybiB7IGpzeFZhbHVlOiByZXN1bHQsIGlzRXhwcmVzc2lvbiB9O1xufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyBjb25kaXRpb25hbCBhdHRyaWJ1dGVzIChlbnRpcmUgYXR0cmlidXRlIHdyYXBwZWQgaW4ge3sjaWZ9fSlcbiAqIEhhbmRsZXMgdHdvIHBhdHRlcm5zOlxuICogICAxLiB7eyNpZiBjb25kaXRpb259fWF0dHJOYW1lPVwidmFsdWVcInt7L2lmfX0gIOKAlCBhdHRyIHdpdGggdmFsdWVcbiAqICAgMi4ge3sjaWYgY29uZGl0aW9ufX0gYXR0ck5hbWV7ey9pZn19ICAgICAgICAgIOKAlCBib29sZWFuIGF0dHIgKGUuZy4gc2VsZWN0ZWQsIGRpc2FibGVkKVxuICogQm90aCBhcmUgY29udmVydGVkIHRvOiBhdHRyTmFtZT17Y29uZGl0aW9uID8gdmFsdWUgOiB1bmRlZmluZWR9XG4gKi9cbmV4cG9ydCBjb25zdCBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzID0gKHRlbXBsYXRlOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBsZXQgcmVzdWx0ID0gdGVtcGxhdGU7XG4gIFxuICAvLyBQYXR0ZXJuIDE6IHt7I2lmIGNvbmRpdGlvbn19IGF0dHJOYW1lPVwidmFsdWVcIiB7ey9pZn19IChhbGxvdyBvcHRpb25hbCB3aGl0ZXNwYWNlIHNvIGUuZy4gc3Jjc2V0IGlzIG1hdGNoZWQpXG4gIGNvbnN0IGNvbmRBdHRyUmVnZXggPSAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH1cXHMqKFxcdysoPzotXFx3KykqKVxccyo9XCIoW15cIl0qKVwiXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBjb25kQXR0clJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBsZXQgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgY29uc3QgYXR0clZhbHVlID0gbWF0Y2hbM107XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBOb3JtYWxpemUgQHJvb3QucHJvcGVydGllcy54eHggdG8gcHJvcGVydGllcy54eHggKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gICAgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCdAcm9vdC5wcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25kaXRpb24gPSBjb25kaXRpb24ucmVwbGFjZSgvXkByb290XFwuLywgJycpO1xuICAgIH1cblxuICAgIC8vIENvbnZlcnQgY29uZGl0aW9uIHRvIEpTWCBleHByZXNzaW9uXG4gICAgbGV0IGNvbmRFeHByID0gY29uZGl0aW9uO1xuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBjb25kaXRpb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbmRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25kRXhwciA9IGBpdGVtLiR7Y29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnZlcnQgYXR0cmlidXRlIHZhbHVlIHRvIEpTWCBleHByZXNzaW9uXG4gICAgbGV0IHZhbHVlRXhwcjogc3RyaW5nO1xuICAgIGlmIChhdHRyVmFsdWUuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIC8vIFZhbHVlIGNvbnRhaW5zIGhhbmRsZWJhcnMgZXhwcmVzc2lvbiAoYWxzbyBoYW5kbGVzIEByb290LnByb3BlcnRpZXMueHh4KVxuICAgICAgY29uc3QgcHJvcE1hdGNoID0gYXR0clZhbHVlLm1hdGNoKC9cXHtcXHtcXHMqKD86QHJvb3RcXC4pP3Byb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS8pO1xuICAgICAgaWYgKHByb3BNYXRjaCkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3BNYXRjaFsxXS50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgdmFsdWVFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlRXhwciA9IGAnJHthdHRyVmFsdWV9J2A7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ3N0eWxlJykge1xuICAgICAgLy8gRm9yIGNvbmRpdGlvbmFsIHN0eWxlIGF0dHJpYnV0ZXMsIGNvbnZlcnQgQ1NTIHN0cmluZyB0byBhIFJlYWN0IHN0eWxlIG9iamVjdFxuICAgICAgdmFsdWVFeHByID0gY3NzU3RyaW5nVG9SZWFjdE9iamVjdChhdHRyVmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZUV4cHIgPSBgJyR7YXR0clZhbHVlfSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZXQgSlNYIGF0dHJpYnV0ZSBuYW1lXG4gICAgbGV0IGpzeEF0dHJOYW1lID0gYXR0ck5hbWU7XG4gICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdjbGFzc05hbWUnO1xuICAgIH0gZWxzZSBpZiAoYXR0ck5hbWUgPT09ICdmb3InKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICB9IGVsc2Uge1xuICAgICAganN4QXR0ck5hbWUgPSB0b0pzeEF0dHJOYW1lKGF0dHJOYW1lKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSA/ICR7dmFsdWVFeHByfSA6IHVuZGVmaW5lZGA7XG4gICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQXR0clJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICAvLyBQYXR0ZXJuIDI6IHt7I2lmIGNvbmRpdGlvbn19IGJvb2xlYW5BdHRye3svaWZ9fSAoYm9vbGVhbiBhdHRyaWJ1dGUsIG5vID1cInZhbHVlXCIpXG4gIC8vIGUuZy4ge3sjaWYgdGhpcy5zZWxlY3RlZH19IHNlbGVjdGVke3svaWZ9fSBvciB7eyNpZiB0aGlzLmRpc2FibGVkfX0gZGlzYWJsZWR7ey9pZn19XG4gIC8vIE9ubHkgbWF0Y2hlcyBvdXRzaWRlIGF0dHJpYnV0ZSB2YWx1ZXMg4oCUIGNvbmRpdGlvbmFscyBpbnNpZGUgY2xhc3M9XCIuLi5cIiBldGMuIGFyZVxuICAvLyBoYW5kbGVkIGxhdGVyIGJ5IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZS5cbiAgY29uc3QgY29uZEJvb2xSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfVxccyooXFx3Kyg/Oi1cXHcrKSopXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICB3aGlsZSAoKG1hdGNoID0gY29uZEJvb2xSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBTa2lwIGlmIHRoaXMgbWF0Y2ggaXMgaW5zaWRlIGFuIEhUTUwgYXR0cmlidXRlIHZhbHVlIChiZXR3ZWVuIHF1b3RlcykuXG4gICAgLy8gRmluZCB0aGUgbGFzdCBgPGAgYmVmb3JlIHRoaXMgcG9zaXRpb24gYW5kIGNvdW50IHVuZXNjYXBlZCBxdW90ZXMgaW4gdGhlXG4gICAgLy8gc2VnbWVudCBiZXR3ZWVuIHRoYXQgYDxgIGFuZCB0aGUgbWF0Y2gsIGlnbm9yaW5nIHF1b3RlcyBpbnNpZGUge3suLi59fSBibG9ja3MuXG4gICAgY29uc3QgbGFzdFRhZ1N0YXJ0ID0gcmVzdWx0Lmxhc3RJbmRleE9mKCc8Jywgc3RhcnRQb3MpO1xuICAgIGlmIChsYXN0VGFnU3RhcnQgIT09IC0xKSB7XG4gICAgICBjb25zdCBzZWdtZW50ID0gcmVzdWx0LnN1YnN0cmluZyhsYXN0VGFnU3RhcnQsIHN0YXJ0UG9zKTtcbiAgICAgIGNvbnN0IHNlZ21lbnROb0hicyA9IHNlZ21lbnQucmVwbGFjZSgvXFx7XFx7W1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gICAgICBjb25zdCBxdW90ZUNvdW50ID0gKHNlZ21lbnROb0hicy5tYXRjaCgvXCIvZykgfHwgW10pLmxlbmd0aDtcbiAgICAgIGlmIChxdW90ZUNvdW50ICUgMiA9PT0gMSkge1xuICAgICAgICAvLyBPZGQgcXVvdGUgY291bnQgbWVhbnMgd2UncmUgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSDigJQgc2tpcFxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgbGV0IGNvbmRpdGlvbiA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IG1hdGNoWzJdO1xuICAgIFxuICAgIC8vIE5vcm1hbGl6ZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0byBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ0Byb290LnByb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbmRpdGlvbiA9IGNvbmRpdGlvbi5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgfVxuICAgIFxuICAgIGxldCBjb25kRXhwciA9IGNvbmRpdGlvbjtcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gY29uZGl0aW9uLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25kRXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgfSBlbHNlIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uZEV4cHIgPSBgaXRlbS4ke2NvbmRpdGlvbi5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBqc3hBdHRyTmFtZSA9IHRvSnN4QXR0ck5hbWUoYXR0ck5hbWUpO1xuICAgIGNvbnN0IG1hcmtlckNvbnRlbnQgPSBgJHtjb25kRXhwcn0gfHwgdW5kZWZpbmVkYDtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IGAgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQm9vbFJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyBhdHRyaWJ1dGUgdmFsdWVzIHRoYXQgY29udGFpbiBjb25kaXRpb25hbHNcbiAqIFRoaXMgbXVzdCBydW4gYmVmb3JlIHByZXByb2Nlc3NCbG9ja3MgdG8gcHJldmVudCBpZi1tYXJrZXJzIGZyb20gYXBwZWFyaW5nIGluc2lkZSBhdHRyaWJ1dGVzXG4gKiBAcGFyYW0gY3VycmVudExvb3BBcnJheSAtIFdoZW4gcHJvY2Vzc2luZyBsb29wIGlubmVyIGNvbnRlbnQsIHBhc3MgdGhlIGFycmF5IG5hbWUgc28ge3sjdW5sZXNzIEBsYXN0fX0gZXRjLiBnZXQgdGhlIGNvcnJlY3QgYXJyYXkgKGUuZy4gXCJjdGFzXCIpIGluc3RlYWQgb2YgZGVmYXVsdCBcIml0ZW1zXCJcbiAqL1xuZXhwb3J0IGNvbnN0IHByZXByb2Nlc3NBdHRyaWJ1dGVDb25kaXRpb25hbHMgPSAodGVtcGxhdGU6IHN0cmluZywgY3VycmVudExvb3BBcnJheT86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGxldCByZXN1bHQgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIEZpcnN0IGhhbmRsZSBjb25kaXRpb25hbCBhdHRyaWJ1dGVzIChlbnRpcmUgYXR0cmlidXRlIHdyYXBwZWQgaW4ge3sjaWZ9fSlcbiAgcmVzdWx0ID0gcHJlcHJvY2Vzc0NvbmRpdGlvbmFsQXR0cmlidXRlcyhyZXN1bHQpO1xuICBcbiAgLy8gRmluZCBhdHRyaWJ1dGVzIHRoYXQgY29udGFpbiB7eyNpZiBvciB7eyN1bmxlc3NcbiAgLy8gV2UgbmVlZCB0byBtYW51YWxseSBwYXJzZSB0byBoYW5kbGUgbmVzdGVkIHF1b3RlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9uc1xuICBsZXQgcG9zID0gMDtcbiAgd2hpbGUgKHBvcyA8IHJlc3VsdC5sZW5ndGgpIHtcbiAgICAvLyBGaW5kIG5leHQgYXR0cmlidXRlIHBhdHRlcm46IGF0dHJOYW1lPVwiXG4gICAgY29uc3QgYXR0clN0YXJ0TWF0Y2ggPSByZXN1bHQuc3Vic3RyaW5nKHBvcykubWF0Y2goLyhcXHcrKD86LVxcdyspKik9XCIvKTtcbiAgICBpZiAoIWF0dHJTdGFydE1hdGNoKSBicmVhaztcbiAgICBcbiAgICBjb25zdCBhdHRyTmFtZSA9IGF0dHJTdGFydE1hdGNoWzFdO1xuICAgIGNvbnN0IGF0dHJTdGFydCA9IHBvcyArIGF0dHJTdGFydE1hdGNoLmluZGV4ITtcbiAgICBjb25zdCB2YWx1ZVN0YXJ0ID0gYXR0clN0YXJ0ICsgYXR0clN0YXJ0TWF0Y2hbMF0ubGVuZ3RoO1xuICAgIFxuICAgIC8vIEZpbmQgdGhlIGNsb3NpbmcgcXVvdGUsIGJ1dCBiZSBjYXJlZnVsIGFib3V0IHF1b3RlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9uc1xuICAgIGxldCB2YWx1ZUVuZCA9IC0xO1xuICAgIGxldCBpbkhhbmRsZWJhcnMgPSAwO1xuICAgIGZvciAobGV0IGkgPSB2YWx1ZVN0YXJ0OyBpIDwgcmVzdWx0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBjaGFyID0gcmVzdWx0W2ldO1xuICAgICAgY29uc3QgbmV4dENoYXIgPSByZXN1bHRbaSArIDFdO1xuICAgICAgXG4gICAgICBpZiAoY2hhciA9PT0gJ3snICYmIG5leHRDaGFyID09PSAneycpIHtcbiAgICAgICAgaW5IYW5kbGViYXJzKys7XG4gICAgICAgIGkrKzsgLy8gU2tpcCBuZXh0IGNoYXJcbiAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gJ30nICYmIG5leHRDaGFyID09PSAnfScpIHtcbiAgICAgICAgaW5IYW5kbGViYXJzLS07XG4gICAgICAgIGkrKzsgLy8gU2tpcCBuZXh0IGNoYXJcbiAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gJ1wiJyAmJiBpbkhhbmRsZWJhcnMgPT09IDApIHtcbiAgICAgICAgdmFsdWVFbmQgPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgaWYgKHZhbHVlRW5kID09PSAtMSkge1xuICAgICAgcG9zID0gdmFsdWVTdGFydDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBhdHRyVmFsdWUgPSByZXN1bHQuc3Vic3RyaW5nKHZhbHVlU3RhcnQsIHZhbHVlRW5kKTtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSByZXN1bHQuc3Vic3RyaW5nKGF0dHJTdGFydCwgdmFsdWVFbmQgKyAxKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGF0dHJpYnV0ZSBjb250YWlucyBhIGNvbmRpdGlvbmFsXG4gICAgaWYgKGF0dHJWYWx1ZS5pbmNsdWRlcygne3sjaWYnKSB8fCBhdHRyVmFsdWUuaW5jbHVkZXMoJ3t7I3VubGVzcycpKSB7XG4gICAgICAvLyBJZiB0aGlzIGF0dHJpYnV0ZSByZWZlcmVuY2VzIEBsYXN0IG9yIEBmaXJzdCBidXQgd2UgZG9uJ3Qga25vdyB0aGVcbiAgICAgIC8vIGVuY2xvc2luZyBsb29wIGFycmF5IHlldCAodG9wLWxldmVsIHBhc3MpLCBkZWZlciBwcm9jZXNzaW5nIHVudGlsXG4gICAgICAvLyB0aGUgbG9vcCBpcyBleHBhbmRlZCB3aXRoIHRoZSBjb3JyZWN0IGFycmF5IG5hbWUuXG4gICAgICBpZiAoIWN1cnJlbnRMb29wQXJyYXkgJiYgKGF0dHJWYWx1ZS5pbmNsdWRlcygnQGxhc3QnKSB8fCBhdHRyVmFsdWUuaW5jbHVkZXMoJ0BmaXJzdCcpKSkge1xuICAgICAgICBwb3MgPSB2YWx1ZUVuZCArIDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLy8gQ29udmVydCB0aGUgYXR0cmlidXRlIHZhbHVlIHVzaW5nIG91ciBoZWxwZXIgKHBhc3MgY3VycmVudExvb3BBcnJheSBmb3IgQGxhc3QgLyBAZmlyc3QpXG4gICAgICBjb25zdCB7IGpzeFZhbHVlLCBpc0V4cHJlc3Npb24gfSA9IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZShhdHRyVmFsdWUsICdpdGVtJywgY3VycmVudExvb3BBcnJheSk7XG4gICAgICBcbiAgICAgIGlmIChpc0V4cHJlc3Npb24pIHtcbiAgICAgICAgLy8gR2V0IHRoZSBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICAgICAgbGV0IGpzeEF0dHJOYW1lID0gYXR0ck5hbWU7XG4gICAgICAgIGlmIChhdHRyTmFtZSA9PT0gJ2NsYXNzJykge1xuICAgICAgICAgIGpzeEF0dHJOYW1lID0gJ2NsYXNzTmFtZSc7XG4gICAgICAgIH0gZWxzZSBpZiAoYXR0ck5hbWUgPT09ICdmb3InKSB7XG4gICAgICAgICAganN4QXR0ck5hbWUgPSAnaHRtbEZvcic7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgcmVwbGFjZW1lbnQgd2l0aCBKU1ggdGVtcGxhdGUgbGl0ZXJhbFxuICAgICAgICBjb25zdCByZXBsYWNlbWVudCA9IGAke2pzeEF0dHJOYW1lfT17X19URU1QTEFURV9MSVRFUkFMX18ke0J1ZmZlci5mcm9tKGpzeFZhbHVlKS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfVEVNUExBVEVfTElURVJBTF9ffWA7XG4gICAgICAgIFxuICAgICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIGF0dHJTdGFydCkgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcodmFsdWVFbmQgKyAxKTtcbiAgICAgICAgcG9zID0gYXR0clN0YXJ0ICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcG9zID0gdmFsdWVFbmQgKyAxO1xuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqIEVuc3VyZSBjbGFzc05hbWUgYWx3YXlzIHJlY2VpdmVzIGEgc3RyaW5nIChSZWFjdCB3YXJucyBvbiBib29sZWFuKS4gKi9cbmNvbnN0IGVuc3VyZUNsYXNzTmFtZUV4cHIgPSAoanN4TmFtZTogc3RyaW5nLCBleHByOiBzdHJpbmcpOiBzdHJpbmcgPT5cbiAganN4TmFtZSA9PT0gJ2NsYXNzTmFtZScgPyBgU3RyaW5nKCR7ZXhwcn0gPz8gJycpYCA6IGV4cHI7XG5cbi8qKlxuICogQ29udmVydCBIVE1MIGF0dHJpYnV0ZXMgdG8gSlNYIGF0dHJpYnV0ZXNcbiAqL1xuZXhwb3J0IGNvbnN0IGNvbnZlcnRBdHRyaWJ1dGVzID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGF0dHJzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBsb29wVmFyID0gY29udGV4dC5sb29wVmFyaWFibGUgfHwgJ2l0ZW0nO1xuICBcbiAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGVsZW1lbnQuYXR0cmlidXRlcykpIHtcbiAgICAvLyBDaGVjayBmb3IgY29uZGl0aW9uYWwgYXR0cmlidXRlIG1hcmtlciBGSVJTVCDigJQgYXBwbGllcyB0byBhbnkgYXR0cmlidXRlIGluY2x1ZGluZyBzdHlsZS5cbiAgICAvLyBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzIGVuY29kZXMge3sjaWYgY29uZH19YXR0ck5hbWU9XCJ2YWx1ZVwie3svaWZ9fSBpbnRvIHRoaXMgbWFya2VyLlxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19DT05EX0FUVFJfXycpKSB7XG4gICAgICBjb25zdCBjb25kTWF0Y2ggPSB2YWx1ZS5tYXRjaCgvX19DT05EX0FUVFJfXyhbQS1aYS16MC05Ky89XSspX19FTkRfQ09ORF9BVFRSX18vKTtcbiAgICAgIGlmIChjb25kTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGNvbmRNYXRjaFsxXSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICAgIGNvbnN0IGpzeEF0dHJGb3JDb25kID0gbmFtZSA9PT0gJ2NsYXNzJyA/ICdjbGFzc05hbWUnIDogbmFtZSA9PT0gJ2ZvcicgPyAnaHRtbEZvcicgOiB0b0pzeEF0dHJOYW1lKG5hbWUpO1xuICAgICAgICBhdHRycy5wdXNoKGAke2pzeEF0dHJGb3JDb25kfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeEF0dHJGb3JDb25kLCBkZWNvZGVkKX19YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbnZlcnQgc3R5bGUgdG8gb2JqZWN0IChzcGVjaWFsIGhhbmRsaW5nKVxuICAgIGlmIChuYW1lID09PSAnc3R5bGUnKSB7XG4gICAgICBjb25zdCBzdHlsZU9iaiA9IHBhcnNlU3R5bGVUb09iamVjdCh2YWx1ZSwgY29udGV4dCk7XG4gICAgICBhdHRycy5wdXNoKGBzdHlsZT0ke3N0eWxlT2JqfWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIEdldCB0aGUgSlNYIGF0dHJpYnV0ZSBuYW1lXG4gICAgY29uc3QganN4TmFtZSA9IHRvSnN4QXR0ck5hbWUobmFtZSk7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdmFsdWUgY29udGFpbnMgYmxvY2sgY29uZGl0aW9uYWxzIHt7I2lmLi4ufX1cbiAgICBpZiAodmFsdWUuaW5jbHVkZXMoJ3t7I2lmJykpIHtcbiAgICAgIGNvbnN0IHsganN4VmFsdWUsIGlzRXhwcmVzc2lvbiB9ID0gY29udmVydEF0dHJpYnV0ZVZhbHVlKHZhbHVlLCBsb29wVmFyLCBjb250ZXh0Lmxvb3BBcnJheSk7XG4gICAgICBpZiAoaXNFeHByZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGBcXCR7U3RyaW5nKCR7anN4VmFsdWV9ID8/ICcnKX1gIDoganN4VmFsdWU7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09e1xcYCR7d3JhcHBlZH1cXGB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgaHJlZiB3aXRoIGhhbmRsZWJhcnNcbiAgICBpZiAobmFtZSA9PT0gJ2hyZWYnICYmIHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9cXHtcXHsrXFxzKihbXn1dKz8pXFxzKlxcfStcXH0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihtYXRjaFsxXSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgICAgIGF0dHJzLnB1c2goYGhyZWY9eyR7ZXhwcn0gfHwgJyMnfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIHNyYy9hbHQgd2l0aCBoYW5kbGViYXJzIChuZXN0ZWQgaW1hZ2Ugb2JqZWN0cyBuZWVkIG9wdGlvbmFsIGNoYWluaW5nKVxuICAgIGlmICgobmFtZSA9PT0gJ3NyYycgfHwgbmFtZSA9PT0gJ2FsdCcpICYmIHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9cXHtcXHsrXFxzKihbXn1dKz8pXFxzKlxcfStcXH0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihtYXRjaFsxXSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgb3RoZXIgYXR0cmlidXRlcyB3aXRoIGhhbmRsZWJhcnMgKGluY2x1ZGluZyBzaW1wbGUgZXhwcmVzc2lvbnMpXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCB7IGpzeFZhbHVlLCBpc0V4cHJlc3Npb24gfSA9IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZSh2YWx1ZSwgbG9vcFZhciwgY29udGV4dC5sb29wQXJyYXkpO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHVyZSBleHByZXNzaW9uIG9yIG5lZWRzIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgaWYgKGpzeFZhbHVlLnN0YXJ0c1dpdGgoJyR7JykgJiYganN4VmFsdWUuZW5kc1dpdGgoJ30nKSAmJiAhanN4VmFsdWUuaW5jbHVkZXMoJyR7JywgMikpIHtcbiAgICAgICAgICAvLyBTaW1wbGUgZXhwcmVzc2lvbiBsaWtlICR7cHJvcH0gLSBleHRyYWN0IGp1c3QgdGhlIGV4cHJlc3Npb25cbiAgICAgICAgICBjb25zdCBleHByID0ganN4VmFsdWUuc2xpY2UoMiwgLTEpO1xuICAgICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGVtcGxhdGUgbGl0ZXJhbCB3aXRoIHN0YXRpYyBwYXJ0cyBvciBtdWx0aXBsZSBleHByZXNzaW9uc1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGpzeFZhbHVlLnJlcGxhY2UoL1xcJFxceyhbXn1dKylcXH0vZywgKF8sIGUpID0+IGBcXCR7U3RyaW5nKCR7ZX0gPz8gJycpfWApIDoganN4VmFsdWU7XG4gICAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgZm9yIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeE5hbWUsIGV4cHIpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEJvb2xlYW4gYXR0cmlidXRlc1xuICAgIGlmICh2YWx1ZSA9PT0gJycgfHwgdmFsdWUgPT09IG5hbWUpIHtcbiAgICAgIGF0dHJzLnB1c2goanN4TmFtZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHRlbXBsYXRlIGxpdGVyYWwgbWFya2VyIChhbHJlYWR5IHByb2Nlc3NlZCBieSBwcmVwcm9jZXNzQXR0cmlidXRlQ29uZGl0aW9uYWxzKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19URU1QTEFURV9MSVRFUkFMX18nKSkge1xuICAgICAgLy8gVGhlIHZhbHVlIG1pZ2h0IGJlIHdyYXBwZWQgaW4ge30gZnJvbSBwcmVwcm9jZXNzaW5nIC0gc3RyaXAgdGhlbSBpZiBwcmVzZW50XG4gICAgICBsZXQgY2xlYW5WYWx1ZSA9IHZhbHVlO1xuICAgICAgaWYgKGNsZWFuVmFsdWUuc3RhcnRzV2l0aCgneycpICYmIGNsZWFuVmFsdWUuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICBjbGVhblZhbHVlID0gY2xlYW5WYWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgICB9XG4gICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgY2xlYW5WYWx1ZSl9fWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YW5kYXJkIGF0dHJpYnV0ZXNcbiAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PVwiJHt2YWx1ZX1cImApO1xuICB9XG4gIFxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufTtcbiJdfQ==