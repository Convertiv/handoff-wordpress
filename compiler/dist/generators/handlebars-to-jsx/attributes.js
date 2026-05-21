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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L2F0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFJSCxtQ0FBOEY7QUFDOUYsMkRBQXdIO0FBQ3hILHFDQUFzRTtBQUV0RTs7Ozs7R0FLRztBQUNJLE1BQU0scUJBQXFCLEdBQUcsQ0FDbkMsS0FBYSxFQUNiLFVBQWtCLE1BQU0sRUFDeEIsU0FBa0IsRUFDTyxFQUFFO0lBQzNCLE1BQU0sU0FBUyxHQUFHLFNBQVMsSUFBSSxPQUFPLENBQUM7SUFDdkMsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ25CLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQztJQUV6Qix1RkFBdUY7SUFDdkYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtRQUMzQyxpRkFBaUY7UUFDakYsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDM0QsOENBQThDO1FBQzlDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDcEIsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekQsUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxF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bnRlbnQiOlsiLyoqXG4gKiBBdHRyaWJ1dGUgY29udmVyc2lvbiB1dGlsaXRpZXMgZm9yIHRoZSBIYW5kbGViYXJzIHRvIEpTWCB0cmFuc3BpbGVyXG4gKi9cblxuaW1wb3J0IHsgSFRNTEVsZW1lbnQgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0LCBDb252ZXJ0ZWRBdHRyaWJ1dGVWYWx1ZSB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIHRvSnN4QXR0ck5hbWUsIG5vcm1hbGl6ZVdoaXRlc3BhY2UsIGNvbGxhcHNlV2hpdGVzcGFjZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdHJhbnNwaWxlRXhwcmVzc2lvbiwgcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24sIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzIH0gZnJvbSAnLi9leHByZXNzaW9uLXBhcnNlcic7XG5pbXBvcnQgeyBwYXJzZVN0eWxlVG9PYmplY3QsIGNzc1N0cmluZ1RvUmVhY3RPYmplY3QgfSBmcm9tICcuL3N0eWxlcyc7XG5cbi8qKlxuICogQ29udmVydCBjb25kaXRpb25hbHMgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSB0byBKU1ggdGVtcGxhdGUgbGl0ZXJhbCBzeW50YXhcbiAqIENhbGxlZCBmcm9tIGNvbnZlcnRBdHRyaWJ1dGVzIGFmdGVyIEhUTUwgcGFyc2luZ1xuICogRXhhbXBsZTogXCJwcmVmaXh7eyNpZiBjb25kfX12YWx1ZXt7L2lmfX1zdWZmaXhcIiAtPiBgcHJlZml4JHtjb25kID8gJ3ZhbHVlJyA6ICcnfXN1ZmZpeGBcbiAqIEBwYXJhbSBsb29wQXJyYXkgLSBOYW1lIG9mIHRoZSBhcnJheSBiZWluZyBpdGVyYXRlZCAoZm9yIEBsYXN0IC8gQGZpcnN0KTsgd2hlbiBpbnNpZGUge3sjZWFjaCBhcnJ9fSwgdXNlICdhcnInLlxuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZVZhbHVlID0gKFxuICB2YWx1ZTogc3RyaW5nLFxuICBsb29wVmFyOiBzdHJpbmcgPSAnaXRlbScsXG4gIGxvb3BBcnJheT86IHN0cmluZ1xuKTogQ29udmVydGVkQXR0cmlidXRlVmFsdWUgPT4ge1xuICBjb25zdCBhcnJheU5hbWUgPSBsb29wQXJyYXkgfHwgJ2l0ZW1zJztcbiAgbGV0IHJlc3VsdCA9IHZhbHVlO1xuICBsZXQgaXNFeHByZXNzaW9uID0gZmFsc2U7XG4gIFxuICAvLyBIZWxwZXIgdG8gcGFyc2UgSGFuZGxlYmFycyBoZWxwZXIgZXhwcmVzc2lvbnMgbGlrZSAoZXEgcHJvcGVydGllcy5sYXlvdXQgXCJsYXlvdXQtMVwiKVxuICBjb25zdCBwYXJzZUhlbHBlciA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIC8vIE5vcm1hbGl6ZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0byBwcm9wZXJ0aWVzLnh4eCBzbyB0aGUgZXhpc3RpbmcgcmVnZXggbWF0Y2hlc1xuICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL0Byb290XFwucHJvcGVydGllc1xcLi9nLCAncHJvcGVydGllcy4nKTtcbiAgICAvLyBNYXRjaCAoZXEgbGVmdCByaWdodCkgb3IgKGVxIGxlZnQgXCJzdHJpbmdcIilcbiAgICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgICBpZiAoZXFNYXRjaCkge1xuICAgICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAgIGxldCBsZWZ0RXhwciA9IGxlZnQ7XG4gICAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gbGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgICBsZWZ0RXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID09PSBcIiR7cmlnaHR9XCJgO1xuICAgIH1cbiAgICBcbiAgICAvLyBNYXRjaCAobmUgbGVmdCBcInN0cmluZ1wiKVxuICAgIGNvbnN0IG5lTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm5lXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChuZU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBuZU1hdGNoO1xuICAgICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICAgIGxlZnRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gIT09IFwiJHtyaWdodH1cImA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiAnJztcbiAgfTtcbiAgXG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IHByb3BlcnR5IHJlZmVyZW5jZSBvciBoZWxwZXIgZXhwcmVzc2lvbiB0byBKU1ggZXhwcmVzc2lvblxuICBjb25zdCBwcm9wVG9FeHByID0gKHByb3A6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgLy8gUmVzb2x2ZSAuLi9wcm9wZXJ0aWVzLnh4eCAocGFyZW50IGNvbnRleHQgaW4gbG9vcHMpIGFuZCBAcm9vdC5wcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0KSB0byB0b3AtbGV2ZWwgY2FtZWxDYXNlXG4gICAgcHJvcCA9IHJlc29sdmVQYXJlbnRQcm9wZXJ0aWVzSW5FeHByZXNzaW9uKHByb3ApO1xuICAgIC8vIFN0cmlwIGJhcmUgQHJvb3QuIHByZWZpeCAoZS5nLiBAcm9vdC54eHgsIHdoaWNoIHJlc29sdmVzIGxpa2UgeHh4IGF0IHJvb3QgY29udGV4dClcbiAgICBpZiAocHJvcC5zdGFydHNXaXRoKCdAcm9vdC4nKSkge1xuICAgICAgcHJvcCA9IHByb3Auc3Vic3RyaW5nKDYpO1xuICAgIH1cbiAgICAvLyBDaGVjayBpZiBpdCdzIGEgaGVscGVyIGV4cHJlc3Npb24gbGlrZSAoZXEgLi4uKVxuICAgIGlmIChwcm9wLnN0YXJ0c1dpdGgoJygnKSkge1xuICAgICAgY29uc3QgcGFyc2VkID0gcGFyc2VIZWxwZXIocHJvcCk7XG4gICAgICBpZiAocGFyc2VkKSByZXR1cm4gcGFyc2VkO1xuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgQGZpcnN0IGFuZCBAbGFzdCBzcGVjaWFsIHZhcmlhYmxlc1xuICAgIGlmIChwcm9wID09PSAnQGZpcnN0Jykge1xuICAgICAgcmV0dXJuICdpbmRleCA9PT0gMCc7XG4gICAgfVxuICAgIGlmIChwcm9wID09PSAnQGxhc3QnKSB7XG4gICAgICByZXR1cm4gYGluZGV4ID09PSAke2FycmF5TmFtZX0/Lmxlbmd0aCAtIDFgO1xuICAgIH1cbiAgICBpZiAocHJvcCA9PT0gJ0BpbmRleCcpIHtcbiAgICAgIHJldHVybiAnaW5kZXgnO1xuICAgIH1cbiAgICBcbiAgICBpZiAocHJvcC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3AucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIHJldHVybiBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgIH0gZWxzZSBpZiAocHJvcC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC5yZXBsYWNlKCd0aGlzLicsICcnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgY29uc3QgW3Jvb3QsIC4uLnJlc3RdID0gcGFydHM7XG4gICAgICAgIGlmIChyb290ID09PSBsb29wVmFyKSB7XG4gICAgICAgICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHJlc3Quam9pbignLicpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW3Jvb3QsIC4uLnJlc3RdLmpvaW4oJz8uJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcCk7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgaW5uZXIgY29udGVudCB0aGF0IG1heSBjb250YWluIHByb3BlcnR5IHJlZmVyZW5jZXNcbiAgLy8gUmV0dXJucyBhbiBleHByZXNzaW9uIHRoYXQgY2FuIGJlIGNvbmNhdGVuYXRlZCAobm90IGEgdGVtcGxhdGUgbGl0ZXJhbCBzdHJpbmcpXG4gIGNvbnN0IGNvbnZlcnRJbm5lclRvRXhwciA9ICh2YWw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgdmFsIGlzIEpVU1QgYSBwcm9wZXJ0eSByZWZlcmVuY2VcbiAgICBjb25zdCBqdXN0UHJvcE1hdGNoID0gdmFsLm1hdGNoKC9eXFx7XFx7XFxzKihbXn1dKylcXHMqXFx9XFx9JC8pO1xuICAgIGlmIChqdXN0UHJvcE1hdGNoKSB7XG4gICAgICByZXR1cm4gcHJvcFRvRXhwcihqdXN0UHJvcE1hdGNoWzFdLnRyaW0oKSk7XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGlmIHZhbCBjb250YWlucyBwcm9wZXJ0eSByZWZlcmVuY2VzIG1peGVkIHdpdGggc3RhdGljIHRleHRcbiAgICBpZiAodmFsLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICAvLyBDb252ZXJ0IHRvIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgIGxldCBleHByID0gdmFsO1xuICAgICAgLy8gSGFuZGxlIEByb290LnByb3BlcnRpZXMueHh4IHRoZSBzYW1lIHdheSBhcyBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccypAcm9vdFxcLnByb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBqc3hQcm9wID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgICAgfSk7XG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3AudHJpbSgpLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccyp0aGlzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIHJldHVybiAnJHsnICsgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC50cmltKCkpICsgJ30nO1xuICAgICAgfSk7XG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05X10qKSopXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgaWYgKCFwcm9wLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgJiYgIXByb3Auc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgICAgIHJldHVybiAnJHsnICsgcHJvcFRvRXhwcihwcm9wKSArICd9JztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyR7JyArIHByb3AgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiAnYCcgKyBleHByICsgJ2AnO1xuICAgIH1cbiAgICBcbiAgICAvLyBQbGFpbiBzdGF0aWMgdGV4dFxuICAgIHJldHVybiBcIidcIiArIHZhbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIikgKyBcIidcIjtcbiAgfTtcbiAgXG4gIC8vIEhhbmRsZSB7eyNpZiBjb25kaXRpb259fXZhbHVle3tlbHNlfX1vdGhlcnt7L2lmfX0gcGF0dGVyblxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7ZWxzZVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZGl0aW9uOiBzdHJpbmcsIGlmVmFsOiBzdHJpbmcsIGVsc2VWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgaWZFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShpZlZhbCkpO1xuICAgICAgY29uc3QgZWxzZUV4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKGVsc2VWYWwpKTtcbiAgICAgIFxuICAgICAgcmV0dXJuICckeycgKyBjb25kRXhwciArICcgPyAnICsgaWZFeHByICsgJyA6ICcgKyBlbHNlRXhwciArICd9JztcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjaWYgY29uZGl0aW9ufX12YWx1ZXt7L2lmfX0gcGF0dGVybiAobm8gZWxzZSlcbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL2lmXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZGl0aW9uOiBzdHJpbmcsIGlmVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IGlmRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoaWZWYWwpKTtcbiAgICAgIFxuICAgICAgcmV0dXJuICckeycgKyBjb25kRXhwciArICcgPyAnICsgaWZFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjdW5sZXNzIEBsYXN0fX12YWx1ZXt7L3VubGVzc319IHBhdHRlcm5cbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK0BsYXN0XFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIHVubGVzc1ZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICAvLyBAbGFzdCBtZWFucyBpdCdzIE5PVCB0aGUgbGFzdCBpdGVtLCBzbyB3ZSBjaGVjayBpbmRleCA8IGFycmF5Lmxlbmd0aCAtIDFcbiAgICAgIHJldHVybiAnJHtpbmRleCA8ICcgKyBhcnJheU5hbWUgKyAnPy5sZW5ndGggLSAxID8gJyArIHVubGVzc0V4cHIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgQGZpcnN0fX12YWx1ZXt7L3VubGVzc319IHBhdHRlcm5cbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzK0BmaXJzdFxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgLy8gQGZpcnN0IGlzIHRydWUgd2hlbiBpbmRleCA9PT0gMCwgc28gdW5sZXNzIEBmaXJzdCBtZWFucyBpbmRleCAhPT0gMFxuICAgICAgcmV0dXJuIFwiJHtpbmRleCAhPT0gMCA/IFwiICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgY29uZGl0aW9ufX12YWx1ZXt7ZWxzZX19b3RoZXJ7ey91bmxlc3N9fSBwYXR0ZXJuIChtdXN0IHJ1biBiZWZvcmUgdW5sZXNzIHdpdGhvdXQgZWxzZSlcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcsIGVsc2VWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICBjb25zdCBlbHNlRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoZWxzZVZhbCkpO1xuXG4gICAgICByZXR1cm4gJyR7IScgKyBjb25kRXhwciArICcgPyAnICsgdW5sZXNzRXhwciArICcgOiAnICsgZWxzZUV4cHIgKyAnfSc7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBjb25kaXRpb259fXZhbHVle3svdW5sZXNzfX0gcGF0dGVybiAoZ2VuZXJhbClcbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjdW5sZXNzXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgXG4gICAgICAvLyB1bmxlc3MgaXMgdGhlIG9wcG9zaXRlIG9mIGlmXG4gICAgICByZXR1cm4gJyR7IScgKyBjb25kRXhwciArICcgPyAnICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQWxzbyBjb252ZXJ0IHJlbWFpbmluZyB7e0Byb290LnByb3BlcnRpZXMueHh4fX0gKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKkByb290XFwucHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQWxzbyBjb252ZXJ0IHJlbWFpbmluZyB7e3Byb3BlcnRpZXMueHh4fX1cbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydCByZW1haW5pbmcge3t0aGlzLnh4eH19IChsb29wIGl0ZW0gcmVmZXJlbmNlcyB2aWEgdGhpcylcbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqdGhpc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIHJldHVybiAnJHsnICsgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcHJvcC50cmltKCkpICsgJ30nO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydCByZW1haW5pbmcgZ2VuZXJhbCBleHByZXNzaW9ucyAoZS5nLiB7e2J1dHRvbi52YXJpYW50fX0sIHt7aXRlbS5sYWJlbH19KVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccyooW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfLV0qKSopXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICByZXR1cm4gJyR7JyArIHByb3BUb0V4cHIocHJvcCkgKyAnfSc7XG4gICAgfSk7XG4gIH1cbiAgXG4gIHJldHVybiB7IGpzeFZhbHVlOiByZXN1bHQsIGlzRXhwcmVzc2lvbiB9O1xufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyBjb25kaXRpb25hbCBhdHRyaWJ1dGVzIChlbnRpcmUgYXR0cmlidXRlIHdyYXBwZWQgaW4ge3sjaWZ9fSlcbiAqIEhhbmRsZXMgdHdvIHBhdHRlcm5zOlxuICogICAxLiB7eyNpZiBjb25kaXRpb259fWF0dHJOYW1lPVwidmFsdWVcInt7L2lmfX0gIOKAlCBhdHRyIHdpdGggdmFsdWVcbiAqICAgMi4ge3sjaWYgY29uZGl0aW9ufX0gYXR0ck5hbWV7ey9pZn19ICAgICAgICAgIOKAlCBib29sZWFuIGF0dHIgKGUuZy4gc2VsZWN0ZWQsIGRpc2FibGVkKVxuICogQm90aCBhcmUgY29udmVydGVkIHRvOiBhdHRyTmFtZT17Y29uZGl0aW9uID8gdmFsdWUgOiB1bmRlZmluZWR9XG4gKi9cbmV4cG9ydCBjb25zdCBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzID0gKHRlbXBsYXRlOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBsZXQgcmVzdWx0ID0gdGVtcGxhdGU7XG4gIFxuICAvLyBQYXR0ZXJuIDE6IHt7I2lmIGNvbmRpdGlvbn19IGF0dHJOYW1lPVwidmFsdWVcIiB7ey9pZn19IChhbGxvdyBvcHRpb25hbCB3aGl0ZXNwYWNlIHNvIGUuZy4gc3Jjc2V0IGlzIG1hdGNoZWQpXG4gIGNvbnN0IGNvbmRBdHRyUmVnZXggPSAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH1cXHMqKFxcdysoPzotXFx3KykqKVxccyo9XCIoW15cIl0qKVwiXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBjb25kQXR0clJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBsZXQgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgY29uc3QgYXR0clZhbHVlID0gbWF0Y2hbM107XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBOb3JtYWxpemUgQHJvb3QucHJvcGVydGllcy54eHggdG8gcHJvcGVydGllcy54eHggKHJvb3QgY29udGV4dCBhY2Nlc3MpXG4gICAgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCdAcm9vdC5wcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25kaXRpb24gPSBjb25kaXRpb24ucmVwbGFjZSgvXkByb290XFwuLywgJycpO1xuICAgIH1cblxuICAgIC8vIENvbnZlcnQgY29uZGl0aW9uIHRvIEpTWCBleHByZXNzaW9uXG4gICAgbGV0IGNvbmRFeHByID0gY29uZGl0aW9uO1xuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBjb25kaXRpb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbmRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25kRXhwciA9IGBpdGVtLiR7Y29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnZlcnQgYXR0cmlidXRlIHZhbHVlIHRvIEpTWCBleHByZXNzaW9uXG4gICAgbGV0IHZhbHVlRXhwcjogc3RyaW5nO1xuICAgIGlmIChhdHRyVmFsdWUuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIC8vIFZhbHVlIGNvbnRhaW5zIGhhbmRsZWJhcnMgZXhwcmVzc2lvbiAoYWxzbyBoYW5kbGVzIEByb290LnByb3BlcnRpZXMueHh4KVxuICAgICAgY29uc3QgcHJvcE1hdGNoID0gYXR0clZhbHVlLm1hdGNoKC9cXHtcXHtcXHMqKD86QHJvb3RcXC4pP3Byb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS8pO1xuICAgICAgaWYgKHByb3BNYXRjaCkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3BNYXRjaFsxXS50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgdmFsdWVFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlRXhwciA9IGAnJHthdHRyVmFsdWV9J2A7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ3N0eWxlJykge1xuICAgICAgLy8gRm9yIGNvbmRpdGlvbmFsIHN0eWxlIGF0dHJpYnV0ZXMsIGNvbnZlcnQgQ1NTIHN0cmluZyB0byBhIFJlYWN0IHN0eWxlIG9iamVjdFxuICAgICAgdmFsdWVFeHByID0gY3NzU3RyaW5nVG9SZWFjdE9iamVjdChhdHRyVmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZUV4cHIgPSBgJyR7YXR0clZhbHVlfSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZXQgSlNYIGF0dHJpYnV0ZSBuYW1lXG4gICAgbGV0IGpzeEF0dHJOYW1lID0gYXR0ck5hbWU7XG4gICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdjbGFzc05hbWUnO1xuICAgIH0gZWxzZSBpZiAoYXR0ck5hbWUgPT09ICdmb3InKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICB9IGVsc2Uge1xuICAgICAganN4QXR0ck5hbWUgPSB0b0pzeEF0dHJOYW1lKGF0dHJOYW1lKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSA/ICR7dmFsdWVFeHByfSA6IHVuZGVmaW5lZGA7XG4gICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQXR0clJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICAvLyBQYXR0ZXJuIDI6IHt7I2lmIGNvbmRpdGlvbn19IGJvb2xlYW5BdHRye3svaWZ9fSAoYm9vbGVhbiBhdHRyaWJ1dGUsIG5vID1cInZhbHVlXCIpXG4gIC8vIGUuZy4ge3sjaWYgdGhpcy5zZWxlY3RlZH19IHNlbGVjdGVke3svaWZ9fSBvciB7eyNpZiB0aGlzLmRpc2FibGVkfX0gZGlzYWJsZWR7ey9pZn19XG4gIC8vIE9ubHkgbWF0Y2hlcyBvdXRzaWRlIGF0dHJpYnV0ZSB2YWx1ZXMg4oCUIGNvbmRpdGlvbmFscyBpbnNpZGUgY2xhc3M9XCIuLi5cIiBldGMuIGFyZVxuICAvLyBoYW5kbGVkIGxhdGVyIGJ5IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZS5cbiAgY29uc3QgY29uZEJvb2xSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfVxccyooXFx3Kyg/Oi1cXHcrKSopXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICB3aGlsZSAoKG1hdGNoID0gY29uZEJvb2xSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBTa2lwIGlmIHRoaXMgbWF0Y2ggaXMgaW5zaWRlIGFuIEhUTUwgYXR0cmlidXRlIHZhbHVlIChiZXR3ZWVuIHF1b3RlcykuXG4gICAgLy8gRmluZCB0aGUgbGFzdCBgPGAgYmVmb3JlIHRoaXMgcG9zaXRpb24gYW5kIGNvdW50IHVuZXNjYXBlZCBxdW90ZXMgaW4gdGhlXG4gICAgLy8gc2VnbWVudCBiZXR3ZWVuIHRoYXQgYDxgIGFuZCB0aGUgbWF0Y2gsIGlnbm9yaW5nIHF1b3RlcyBpbnNpZGUge3suLi59fSBibG9ja3MuXG4gICAgY29uc3QgbGFzdFRhZ1N0YXJ0ID0gcmVzdWx0Lmxhc3RJbmRleE9mKCc8Jywgc3RhcnRQb3MpO1xuICAgIGlmIChsYXN0VGFnU3RhcnQgIT09IC0xKSB7XG4gICAgICBjb25zdCBzZWdtZW50ID0gcmVzdWx0LnN1YnN0cmluZyhsYXN0VGFnU3RhcnQsIHN0YXJ0UG9zKTtcbiAgICAgIGNvbnN0IHNlZ21lbnROb0hicyA9IHNlZ21lbnQucmVwbGFjZSgvXFx7XFx7W1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gICAgICBjb25zdCBxdW90ZUNvdW50ID0gKHNlZ21lbnROb0hicy5tYXRjaCgvXCIvZykgfHwgW10pLmxlbmd0aDtcbiAgICAgIGlmIChxdW90ZUNvdW50ICUgMiA9PT0gMSkge1xuICAgICAgICAvLyBPZGQgcXVvdGUgY291bnQgbWVhbnMgd2UncmUgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSDigJQgc2tpcFxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgbGV0IGNvbmRpdGlvbiA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IG1hdGNoWzJdO1xuICAgIFxuICAgIC8vIE5vcm1hbGl6ZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0byBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ0Byb290LnByb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbmRpdGlvbiA9IGNvbmRpdGlvbi5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgfVxuICAgIFxuICAgIGxldCBjb25kRXhwciA9IGNvbmRpdGlvbjtcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gY29uZGl0aW9uLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25kRXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgfSBlbHNlIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uZEV4cHIgPSBgaXRlbS4ke2NvbmRpdGlvbi5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBqc3hBdHRyTmFtZSA9IHRvSnN4QXR0ck5hbWUoYXR0ck5hbWUpO1xuICAgIGNvbnN0IG1hcmtlckNvbnRlbnQgPSBgJHtjb25kRXhwcn0gfHwgdW5kZWZpbmVkYDtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IGAgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQm9vbFJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBQcmUtcHJvY2VzcyBhdHRyaWJ1dGUgdmFsdWVzIHRoYXQgY29udGFpbiBjb25kaXRpb25hbHNcbiAqIFRoaXMgbXVzdCBydW4gYmVmb3JlIHByZXByb2Nlc3NCbG9ja3MgdG8gcHJldmVudCBpZi1tYXJrZXJzIGZyb20gYXBwZWFyaW5nIGluc2lkZSBhdHRyaWJ1dGVzXG4gKiBAcGFyYW0gY3VycmVudExvb3BBcnJheSAtIFdoZW4gcHJvY2Vzc2luZyBsb29wIGlubmVyIGNvbnRlbnQsIHBhc3MgdGhlIGFycmF5IG5hbWUgc28ge3sjdW5sZXNzIEBsYXN0fX0gZXRjLiBnZXQgdGhlIGNvcnJlY3QgYXJyYXkgKGUuZy4gXCJjdGFzXCIpIGluc3RlYWQgb2YgZGVmYXVsdCBcIml0ZW1zXCJcbiAqL1xuZXhwb3J0IGNvbnN0IHByZXByb2Nlc3NBdHRyaWJ1dGVDb25kaXRpb25hbHMgPSAodGVtcGxhdGU6IHN0cmluZywgY3VycmVudExvb3BBcnJheT86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGxldCByZXN1bHQgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIEZpcnN0IGhhbmRsZSBjb25kaXRpb25hbCBhdHRyaWJ1dGVzIChlbnRpcmUgYXR0cmlidXRlIHdyYXBwZWQgaW4ge3sjaWZ9fSlcbiAgcmVzdWx0ID0gcHJlcHJvY2Vzc0NvbmRpdGlvbmFsQXR0cmlidXRlcyhyZXN1bHQpO1xuICBcbiAgLy8gRmluZCBhdHRyaWJ1dGVzIHRoYXQgY29udGFpbiB7eyNpZiBvciB7eyN1bmxlc3NcbiAgLy8gV2UgbmVlZCB0byBtYW51YWxseSBwYXJzZSB0byBoYW5kbGUgbmVzdGVkIHF1b3RlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9uc1xuICBsZXQgcG9zID0gMDtcbiAgd2hpbGUgKHBvcyA8IHJlc3VsdC5sZW5ndGgpIHtcbiAgICAvLyBGaW5kIG5leHQgYXR0cmlidXRlIHBhdHRlcm46IGF0dHJOYW1lPVwiXG4gICAgY29uc3QgYXR0clN0YXJ0TWF0Y2ggPSByZXN1bHQuc3Vic3RyaW5nKHBvcykubWF0Y2goLyhcXHcrKD86LVxcdyspKik9XCIvKTtcbiAgICBpZiAoIWF0dHJTdGFydE1hdGNoKSBicmVhaztcbiAgICBcbiAgICBjb25zdCBhdHRyTmFtZSA9IGF0dHJTdGFydE1hdGNoWzFdO1xuICAgIGNvbnN0IGF0dHJTdGFydCA9IHBvcyArIGF0dHJTdGFydE1hdGNoLmluZGV4ITtcbiAgICBjb25zdCB2YWx1ZVN0YXJ0ID0gYXR0clN0YXJ0ICsgYXR0clN0YXJ0TWF0Y2hbMF0ubGVuZ3RoO1xuICAgIFxuICAgIC8vIEZpbmQgdGhlIGNsb3NpbmcgcXVvdGUsIGJ1dCBiZSBjYXJlZnVsIGFib3V0IHF1b3RlcyBpbnNpZGUgSGFuZGxlYmFycyBleHByZXNzaW9uc1xuICAgIGxldCB2YWx1ZUVuZCA9IC0xO1xuICAgIGxldCBpbkhhbmRsZWJhcnMgPSAwO1xuICAgIGZvciAobGV0IGkgPSB2YWx1ZVN0YXJ0OyBpIDwgcmVzdWx0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBjaGFyID0gcmVzdWx0W2ldO1xuICAgICAgY29uc3QgbmV4dENoYXIgPSByZXN1bHRbaSArIDFdO1xuICAgICAgXG4gICAgICBpZiAoY2hhciA9PT0gJ3snICYmIG5leHRDaGFyID09PSAneycpIHtcbiAgICAgICAgaW5IYW5kbGViYXJzKys7XG4gICAgICAgIGkrKzsgLy8gU2tpcCBuZXh0IGNoYXJcbiAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gJ30nICYmIG5leHRDaGFyID09PSAnfScpIHtcbiAgICAgICAgaW5IYW5kbGViYXJzLS07XG4gICAgICAgIGkrKzsgLy8gU2tpcCBuZXh0IGNoYXJcbiAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gJ1wiJyAmJiBpbkhhbmRsZWJhcnMgPT09IDApIHtcbiAgICAgICAgdmFsdWVFbmQgPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgaWYgKHZhbHVlRW5kID09PSAtMSkge1xuICAgICAgcG9zID0gdmFsdWVTdGFydDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBhdHRyVmFsdWUgPSByZXN1bHQuc3Vic3RyaW5nKHZhbHVlU3RhcnQsIHZhbHVlRW5kKTtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSByZXN1bHQuc3Vic3RyaW5nKGF0dHJTdGFydCwgdmFsdWVFbmQgKyAxKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGF0dHJpYnV0ZSBjb250YWlucyBhIGNvbmRpdGlvbmFsXG4gICAgaWYgKGF0dHJWYWx1ZS5pbmNsdWRlcygne3sjaWYnKSB8fCBhdHRyVmFsdWUuaW5jbHVkZXMoJ3t7I3VubGVzcycpKSB7XG4gICAgICAvLyBJZiB0aGlzIGF0dHJpYnV0ZSByZWZlcmVuY2VzIEBsYXN0IG9yIEBmaXJzdCBidXQgd2UgZG9uJ3Qga25vdyB0aGVcbiAgICAgIC8vIGVuY2xvc2luZyBsb29wIGFycmF5IHlldCAodG9wLWxldmVsIHBhc3MpLCBkZWZlciBwcm9jZXNzaW5nIHVudGlsXG4gICAgICAvLyB0aGUgbG9vcCBpcyBleHBhbmRlZCB3aXRoIHRoZSBjb3JyZWN0IGFycmF5IG5hbWUuXG4gICAgICBpZiAoIWN1cnJlbnRMb29wQXJyYXkgJiYgKGF0dHJWYWx1ZS5pbmNsdWRlcygnQGxhc3QnKSB8fCBhdHRyVmFsdWUuaW5jbHVkZXMoJ0BmaXJzdCcpKSkge1xuICAgICAgICBwb3MgPSB2YWx1ZUVuZCArIDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLy8gQ29udmVydCB0aGUgYXR0cmlidXRlIHZhbHVlIHVzaW5nIG91ciBoZWxwZXIgKHBhc3MgY3VycmVudExvb3BBcnJheSBmb3IgQGxhc3QgLyBAZmlyc3QpXG4gICAgICBjb25zdCB7IGpzeFZhbHVlLCBpc0V4cHJlc3Npb24gfSA9IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZShhdHRyVmFsdWUsICdpdGVtJywgY3VycmVudExvb3BBcnJheSk7XG4gICAgICBcbiAgICAgIGlmIChpc0V4cHJlc3Npb24pIHtcbiAgICAgICAgLy8gR2V0IHRoZSBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICAgICAgbGV0IGpzeEF0dHJOYW1lID0gYXR0ck5hbWU7XG4gICAgICAgIGlmIChhdHRyTmFtZSA9PT0gJ2NsYXNzJykge1xuICAgICAgICAgIGpzeEF0dHJOYW1lID0gJ2NsYXNzTmFtZSc7XG4gICAgICAgIH0gZWxzZSBpZiAoYXR0ck5hbWUgPT09ICdmb3InKSB7XG4gICAgICAgICAganN4QXR0ck5hbWUgPSAnaHRtbEZvcic7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgcmVwbGFjZW1lbnQgd2l0aCBKU1ggdGVtcGxhdGUgbGl0ZXJhbFxuICAgICAgICBjb25zdCByZXBsYWNlbWVudCA9IGAke2pzeEF0dHJOYW1lfT17X19URU1QTEFURV9MSVRFUkFMX18ke0J1ZmZlci5mcm9tKGpzeFZhbHVlKS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfVEVNUExBVEVfTElURVJBTF9ffWA7XG4gICAgICAgIFxuICAgICAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIGF0dHJTdGFydCkgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcodmFsdWVFbmQgKyAxKTtcbiAgICAgICAgcG9zID0gYXR0clN0YXJ0ICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcG9zID0gdmFsdWVFbmQgKyAxO1xuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqIEVuc3VyZSBjbGFzc05hbWUgYWx3YXlzIHJlY2VpdmVzIGEgc3RyaW5nIChSZWFjdCB3YXJucyBvbiBib29sZWFuKS4gKi9cbmNvbnN0IGVuc3VyZUNsYXNzTmFtZUV4cHIgPSAoanN4TmFtZTogc3RyaW5nLCBleHByOiBzdHJpbmcpOiBzdHJpbmcgPT5cbiAganN4TmFtZSA9PT0gJ2NsYXNzTmFtZScgPyBgU3RyaW5nKCR7ZXhwcn0gPz8gJycpYCA6IGV4cHI7XG5cbi8qKlxuICogQ29udmVydCBIVE1MIGF0dHJpYnV0ZXMgdG8gSlNYIGF0dHJpYnV0ZXNcbiAqL1xuZXhwb3J0IGNvbnN0IGNvbnZlcnRBdHRyaWJ1dGVzID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGF0dHJzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBsb29wVmFyID0gY29udGV4dC5sb29wVmFyaWFibGUgfHwgJ2l0ZW0nO1xuICBcbiAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGVsZW1lbnQuYXR0cmlidXRlcykpIHtcbiAgICAvLyBDaGVjayBmb3IgY29uZGl0aW9uYWwgYXR0cmlidXRlIG1hcmtlciBGSVJTVCDigJQgYXBwbGllcyB0byBhbnkgYXR0cmlidXRlIGluY2x1ZGluZyBzdHlsZS5cbiAgICAvLyBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzIGVuY29kZXMge3sjaWYgY29uZH19YXR0ck5hbWU9XCJ2YWx1ZVwie3svaWZ9fSBpbnRvIHRoaXMgbWFya2VyLlxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19DT05EX0FUVFJfXycpKSB7XG4gICAgICBjb25zdCBjb25kTWF0Y2ggPSB2YWx1ZS5tYXRjaCgvX19DT05EX0FUVFJfXyhbQS1aYS16MC05Ky89XSspX19FTkRfQ09ORF9BVFRSX18vKTtcbiAgICAgIGlmIChjb25kTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGNvbmRNYXRjaFsxXSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICAgIGNvbnN0IGpzeEF0dHJGb3JDb25kID0gbmFtZSA9PT0gJ2NsYXNzJyA/ICdjbGFzc05hbWUnIDogbmFtZSA9PT0gJ2ZvcicgPyAnaHRtbEZvcicgOiB0b0pzeEF0dHJOYW1lKG5hbWUpO1xuICAgICAgICBhdHRycy5wdXNoKGAke2pzeEF0dHJGb3JDb25kfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeEF0dHJGb3JDb25kLCBkZWNvZGVkKX19YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbnZlcnQgc3R5bGUgdG8gb2JqZWN0IChzcGVjaWFsIGhhbmRsaW5nKVxuICAgIGlmIChuYW1lID09PSAnc3R5bGUnKSB7XG4gICAgICBjb25zdCBzdHlsZU9iaiA9IHBhcnNlU3R5bGVUb09iamVjdCh2YWx1ZSwgY29udGV4dCk7XG4gICAgICBhdHRycy5wdXNoKGBzdHlsZT0ke3N0eWxlT2JqfWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIEdldCB0aGUgSlNYIGF0dHJpYnV0ZSBuYW1lXG4gICAgY29uc3QganN4TmFtZSA9IHRvSnN4QXR0ck5hbWUobmFtZSk7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdmFsdWUgY29udGFpbnMgYmxvY2sgY29uZGl0aW9uYWxzIHt7I2lmLi4ufX1cbiAgICBpZiAodmFsdWUuaW5jbHVkZXMoJ3t7I2lmJykpIHtcbiAgICAgIGNvbnN0IHsganN4VmFsdWUsIGlzRXhwcmVzc2lvbiB9ID0gY29udmVydEF0dHJpYnV0ZVZhbHVlKHZhbHVlLCBsb29wVmFyLCBjb250ZXh0Lmxvb3BBcnJheSk7XG4gICAgICBpZiAoaXNFeHByZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGBcXCR7U3RyaW5nKCR7anN4VmFsdWV9ID8/ICcnKX1gIDoganN4VmFsdWU7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09e1xcYCR7d3JhcHBlZH1cXGB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgaHJlZiB3aXRoIGhhbmRsZWJhcnNcbiAgICBpZiAobmFtZSA9PT0gJ2hyZWYnICYmIHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9cXHtcXHsrXFxzKihbXn1dKz8pXFxzKlxcfStcXH0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihtYXRjaFsxXSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgICAgIGF0dHJzLnB1c2goYGhyZWY9eyR7ZXhwcn0gfHwgJyMnfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIHNyYy9hbHQgd2l0aCBoYW5kbGViYXJzIChuZXN0ZWQgaW1hZ2Ugb2JqZWN0cyBuZWVkIG9wdGlvbmFsIGNoYWluaW5nKVxuICAgIGlmICgobmFtZSA9PT0gJ3NyYycgfHwgbmFtZSA9PT0gJ2FsdCcpICYmIHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9cXHtcXHsrXFxzKihbXn1dKz8pXFxzKlxcfStcXH0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihtYXRjaFsxXSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgb3RoZXIgYXR0cmlidXRlcyB3aXRoIGhhbmRsZWJhcnMgKGluY2x1ZGluZyBzaW1wbGUgZXhwcmVzc2lvbnMpXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCB7IGpzeFZhbHVlLCBpc0V4cHJlc3Npb24gfSA9IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZSh2YWx1ZSwgbG9vcFZhciwgY29udGV4dC5sb29wQXJyYXkpO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHVyZSBleHByZXNzaW9uIG9yIG5lZWRzIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgaWYgKGpzeFZhbHVlLnN0YXJ0c1dpdGgoJyR7JykgJiYganN4VmFsdWUuZW5kc1dpdGgoJ30nKSAmJiAhanN4VmFsdWUuaW5jbHVkZXMoJyR7JywgMikpIHtcbiAgICAgICAgICAvLyBTaW1wbGUgZXhwcmVzc2lvbiBsaWtlICR7cHJvcH0gLSBleHRyYWN0IGp1c3QgdGhlIGV4cHJlc3Npb25cbiAgICAgICAgICBjb25zdCBleHByID0ganN4VmFsdWUuc2xpY2UoMiwgLTEpO1xuICAgICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGVtcGxhdGUgbGl0ZXJhbCB3aXRoIHN0YXRpYyBwYXJ0cyBvciBtdWx0aXBsZSBleHByZXNzaW9uc1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGpzeFZhbHVlLnJlcGxhY2UoL1xcJFxceyhbXn1dKylcXH0vZywgKF8sIGUpID0+IGBcXCR7U3RyaW5nKCR7ZX0gPz8gJycpfWApIDoganN4VmFsdWU7XG4gICAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgZm9yIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeE5hbWUsIGV4cHIpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEJvb2xlYW4gYXR0cmlidXRlc1xuICAgIGlmICh2YWx1ZSA9PT0gJycgfHwgdmFsdWUgPT09IG5hbWUpIHtcbiAgICAgIGF0dHJzLnB1c2goanN4TmFtZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHRlbXBsYXRlIGxpdGVyYWwgbWFya2VyIChhbHJlYWR5IHByb2Nlc3NlZCBieSBwcmVwcm9jZXNzQXR0cmlidXRlQ29uZGl0aW9uYWxzKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19URU1QTEFURV9MSVRFUkFMX18nKSkge1xuICAgICAgLy8gVGhlIHZhbHVlIG1pZ2h0IGJlIHdyYXBwZWQgaW4ge30gZnJvbSBwcmVwcm9jZXNzaW5nIC0gc3RyaXAgdGhlbSBpZiBwcmVzZW50XG4gICAgICBsZXQgY2xlYW5WYWx1ZSA9IHZhbHVlO1xuICAgICAgaWYgKGNsZWFuVmFsdWUuc3RhcnRzV2l0aCgneycpICYmIGNsZWFuVmFsdWUuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICBjbGVhblZhbHVlID0gY2xlYW5WYWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgICB9XG4gICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgY2xlYW5WYWx1ZSl9fWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YW5kYXJkIGF0dHJpYnV0ZXNcbiAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PVwiJHt2YWx1ZX1cImApO1xuICB9XG4gIFxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufTtcbiJdfQ==