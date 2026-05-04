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
            return `${loopVar}.${prop.replace('this.', '')}`;
        }
        else {
            const parts = prop.split('.');
            if (parts.length > 1) {
                // It's likely an alias.prop reference
                return prop;
            }
            return `${loopVar}.${prop}`;
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
                return '${' + loopVar + '.' + prop.trim() + '}';
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
            return '${' + loopVar + '.' + prop.trim() + '}';
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
        // Handle src with handlebars
        if (name === 'src' && value.includes('{{')) {
            const match = value.match(/\{\{+\s*([^}]+?)\s*\}+\}/);
            if (match) {
                const expr = (0, expression_parser_1.transpileExpression)(match[1], context, loopVar);
                attrs.push(`src={${expr}}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L2F0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFJSCxtQ0FBOEY7QUFDOUYsMkRBQStGO0FBQy9GLHFDQUFzRTtBQUV0RTs7Ozs7R0FLRztBQUNJLE1BQU0scUJBQXFCLEdBQUcsQ0FDbkMsS0FBYSxFQUNiLFVBQWtCLE1BQU0sRUFDeEIsU0FBa0IsRUFDTyxFQUFFO0lBQzNCLE1BQU0sU0FBUyxHQUFHLFNBQVMsSUFBSSxPQUFPLENBQUM7SUFDdkMsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ25CLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQztJQUV6Qix1RkFBdUY7SUFDdkYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtRQUMzQyxpRkFBaUY7UUFDakYsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDM0QsOENBQThDO1FBQzlDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztRQUM1RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDcEIsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekQsUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxF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Q0FBQztJQUN0QyxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3pCLENBQUMsQ0FBQztBQXpHVyxRQUFBLGlCQUFpQixxQkF5RzVCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBdHRyaWJ1dGUgY29udmVyc2lvbiB1dGlsaXRpZXMgZm9yIHRoZSBIYW5kbGViYXJzIHRvIEpTWCB0cmFuc3BpbGVyXG4gKi9cblxuaW1wb3J0IHsgSFRNTEVsZW1lbnQgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0LCBDb252ZXJ0ZWRBdHRyaWJ1dGVWYWx1ZSB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIHRvSnN4QXR0ck5hbWUsIG5vcm1hbGl6ZVdoaXRlc3BhY2UsIGNvbGxhcHNlV2hpdGVzcGFjZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdHJhbnNwaWxlRXhwcmVzc2lvbiwgcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24gfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcbmltcG9ydCB7IHBhcnNlU3R5bGVUb09iamVjdCwgY3NzU3RyaW5nVG9SZWFjdE9iamVjdCB9IGZyb20gJy4vc3R5bGVzJztcblxuLyoqXG4gKiBDb252ZXJ0IGNvbmRpdGlvbmFscyBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIHRvIEpTWCB0ZW1wbGF0ZSBsaXRlcmFsIHN5bnRheFxuICogQ2FsbGVkIGZyb20gY29udmVydEF0dHJpYnV0ZXMgYWZ0ZXIgSFRNTCBwYXJzaW5nXG4gKiBFeGFtcGxlOiBcInByZWZpeHt7I2lmIGNvbmR9fXZhbHVle3svaWZ9fXN1ZmZpeFwiIC0+IGBwcmVmaXgke2NvbmQgPyAndmFsdWUnIDogJyd9c3VmZml4YFxuICogQHBhcmFtIGxvb3BBcnJheSAtIE5hbWUgb2YgdGhlIGFycmF5IGJlaW5nIGl0ZXJhdGVkIChmb3IgQGxhc3QgLyBAZmlyc3QpOyB3aGVuIGluc2lkZSB7eyNlYWNoIGFycn19LCB1c2UgJ2FycicuXG4gKi9cbmV4cG9ydCBjb25zdCBjb252ZXJ0QXR0cmlidXRlVmFsdWUgPSAoXG4gIHZhbHVlOiBzdHJpbmcsXG4gIGxvb3BWYXI6IHN0cmluZyA9ICdpdGVtJyxcbiAgbG9vcEFycmF5Pzogc3RyaW5nXG4pOiBDb252ZXJ0ZWRBdHRyaWJ1dGVWYWx1ZSA9PiB7XG4gIGNvbnN0IGFycmF5TmFtZSA9IGxvb3BBcnJheSB8fCAnaXRlbXMnO1xuICBsZXQgcmVzdWx0ID0gdmFsdWU7XG4gIGxldCBpc0V4cHJlc3Npb24gPSBmYWxzZTtcbiAgXG4gIC8vIEhlbHBlciB0byBwYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gIGNvbnN0IHBhcnNlSGVscGVyID0gKGV4cHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgLy8gTm9ybWFsaXplIEByb290LnByb3BlcnRpZXMueHh4IHRvIHByb3BlcnRpZXMueHh4IHNvIHRoZSBleGlzdGluZyByZWdleCBtYXRjaGVzXG4gICAgZXhwciA9IGV4cHIucmVwbGFjZSgvQHJvb3RcXC5wcm9wZXJ0aWVzXFwuL2csICdwcm9wZXJ0aWVzLicpO1xuICAgIC8vIE1hdGNoIChlcSBsZWZ0IHJpZ2h0KSBvciAoZXEgbGVmdCBcInN0cmluZ1wiKVxuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICAgIGxlZnRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPT09IFwiJHtyaWdodH1cImA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwic3RyaW5nXCIpXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgbGVmdEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2xlZnRFeHByfSAhPT0gXCIke3JpZ2h0fVwiYDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICcnO1xuICB9O1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgcHJvcGVydHkgcmVmZXJlbmNlIG9yIGhlbHBlciBleHByZXNzaW9uIHRvIEpTWCBleHByZXNzaW9uXG4gIGNvbnN0IHByb3BUb0V4cHIgPSAocHJvcDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBSZXNvbHZlIC4uL3Byb3BlcnRpZXMueHh4IChwYXJlbnQgY29udGV4dCBpbiBsb29wcykgYW5kIEByb290LnByb3BlcnRpZXMueHh4IChyb290IGNvbnRleHQpIHRvIHRvcC1sZXZlbCBjYW1lbENhc2VcbiAgICBwcm9wID0gcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24ocHJvcCk7XG4gICAgLy8gU3RyaXAgYmFyZSBAcm9vdC4gcHJlZml4IChlLmcuIEByb290Lnh4eCwgd2hpY2ggcmVzb2x2ZXMgbGlrZSB4eHggYXQgcm9vdCBjb250ZXh0KVxuICAgIGlmIChwcm9wLnN0YXJ0c1dpdGgoJ0Byb290LicpKSB7XG4gICAgICBwcm9wID0gcHJvcC5zdWJzdHJpbmcoNik7XG4gICAgfVxuICAgIC8vIENoZWNrIGlmIGl0J3MgYSBoZWxwZXIgZXhwcmVzc2lvbiBsaWtlIChlcSAuLi4pXG4gICAgaWYgKHByb3Auc3RhcnRzV2l0aCgnKCcpKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUhlbHBlcihwcm9wKTtcbiAgICAgIGlmIChwYXJzZWQpIHJldHVybiBwYXJzZWQ7XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBAZmlyc3QgYW5kIEBsYXN0IHNwZWNpYWwgdmFyaWFibGVzXG4gICAgaWYgKHByb3AgPT09ICdAZmlyc3QnKSB7XG4gICAgICByZXR1cm4gJ2luZGV4ID09PSAwJztcbiAgICB9XG4gICAgaWYgKHByb3AgPT09ICdAbGFzdCcpIHtcbiAgICAgIHJldHVybiBgaW5kZXggPT09ICR7YXJyYXlOYW1lfT8ubGVuZ3RoIC0gMWA7XG4gICAgfVxuICAgIGlmIChwcm9wID09PSAnQGluZGV4Jykge1xuICAgICAgcmV0dXJuICdpbmRleCc7XG4gICAgfVxuICAgIFxuICAgIGlmIChwcm9wLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgcmV0dXJuIHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgfSBlbHNlIGlmIChwcm9wLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIHJldHVybiBgJHtsb29wVmFyfS4ke3Byb3AucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnNwbGl0KCcuJyk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAvLyBJdCdzIGxpa2VseSBhbiBhbGlhcy5wcm9wIHJlZmVyZW5jZVxuICAgICAgICByZXR1cm4gcHJvcDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtsb29wVmFyfS4ke3Byb3B9YDtcbiAgICB9XG4gIH07XG4gIFxuICAvLyBIZWxwZXIgdG8gY29udmVydCBpbm5lciBjb250ZW50IHRoYXQgbWF5IGNvbnRhaW4gcHJvcGVydHkgcmVmZXJlbmNlc1xuICAvLyBSZXR1cm5zIGFuIGV4cHJlc3Npb24gdGhhdCBjYW4gYmUgY29uY2F0ZW5hdGVkIChub3QgYSB0ZW1wbGF0ZSBsaXRlcmFsIHN0cmluZylcbiAgY29uc3QgY29udmVydElubmVyVG9FeHByID0gKHZhbDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBDaGVjayBpZiB2YWwgaXMgSlVTVCBhIHByb3BlcnR5IHJlZmVyZW5jZVxuICAgIGNvbnN0IGp1c3RQcm9wTWF0Y2ggPSB2YWwubWF0Y2goL15cXHtcXHtcXHMqKFtefV0rKVxccypcXH1cXH0kLyk7XG4gICAgaWYgKGp1c3RQcm9wTWF0Y2gpIHtcbiAgICAgIHJldHVybiBwcm9wVG9FeHByKGp1c3RQcm9wTWF0Y2hbMV0udHJpbSgpKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdmFsIGNvbnRhaW5zIHByb3BlcnR5IHJlZmVyZW5jZXMgbWl4ZWQgd2l0aCBzdGF0aWMgdGV4dFxuICAgIGlmICh2YWwuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIC8vIENvbnZlcnQgdG8gdGVtcGxhdGUgbGl0ZXJhbFxuICAgICAgbGV0IGV4cHIgPSB2YWw7XG4gICAgICAvLyBIYW5kbGUgQHJvb3QucHJvcGVydGllcy54eHggdGhlIHNhbWUgd2F5IGFzIHByb3BlcnRpZXMueHh4IChyb290IGNvbnRleHQgYWNjZXNzKVxuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKkByb290XFwucHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3AudHJpbSgpLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGpzeFByb3AgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICAgIHJldHVybiAnJHsnICsganN4UHJvcCArICd9JztcbiAgICAgIH0pO1xuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKnRoaXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgcmV0dXJuICckeycgKyBsb29wVmFyICsgJy4nICsgcHJvcC50cmltKCkgKyAnfSc7XG4gICAgICB9KTtcbiAgICAgIGV4cHIgPSBleHByLnJlcGxhY2UoL1xce1xce1xccyooW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfXSopKilcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICBpZiAoIXByb3Auc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSAmJiAhcHJvcC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICAgICAgcmV0dXJuICckeycgKyBwcm9wVG9FeHByKHByb3ApICsgJ30nO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJHsnICsgcHJvcCArICd9JztcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuICdgJyArIGV4cHIgKyAnYCc7XG4gICAgfVxuICAgIFxuICAgIC8vIFBsYWluIHN0YXRpYyB0ZXh0XG4gICAgcmV0dXJuIFwiJ1wiICsgdmFsLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKSArIFwiJ1wiO1xuICB9O1xuICBcbiAgLy8gSGFuZGxlIHt7I2lmIGNvbmRpdGlvbn19dmFsdWV7e2Vsc2V9fW90aGVye3svaWZ9fSBwYXR0ZXJuXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtlbHNlXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgaWZWYWw6IHN0cmluZywgZWxzZVZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgY29uZEV4cHIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZGl0aW9uKSk7XG4gICAgICBjb25zdCBpZkV4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKGlmVmFsKSk7XG4gICAgICBjb25zdCBlbHNlRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoZWxzZVZhbCkpO1xuICAgICAgXG4gICAgICByZXR1cm4gJyR7JyArIGNvbmRFeHByICsgJyA/ICcgKyBpZkV4cHIgKyAnIDogJyArIGVsc2VFeHByICsgJ30nO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyNpZiBjb25kaXRpb259fXZhbHVle3svaWZ9fSBwYXR0ZXJuIChubyBlbHNlKVxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyNpZlxccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvaWZcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCBjb25kaXRpb246IHN0cmluZywgaWZWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgaWZFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShpZlZhbCkpO1xuICAgICAgXG4gICAgICByZXR1cm4gJyR7JyArIGNvbmRFeHByICsgJyA/ICcgKyBpZkV4cHIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgQGxhc3R9fXZhbHVle3svdW5sZXNzfX0gcGF0dGVyblxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGxhc3RcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCB1bmxlc3NFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh1bmxlc3NWYWwpKTtcbiAgICAgIC8vIEBsYXN0IG1lYW5zIGl0J3MgTk9UIHRoZSBsYXN0IGl0ZW0sIHNvIHdlIGNoZWNrIGluZGV4IDwgYXJyYXkubGVuZ3RoIC0gMVxuICAgICAgcmV0dXJuICcke2luZGV4IDwgJyArIGFycmF5TmFtZSArICc/Lmxlbmd0aCAtIDEgPyAnICsgdW5sZXNzRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBAZmlyc3R9fXZhbHVle3svdW5sZXNzfX0gcGF0dGVyblxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrQGZpcnN0XFxzKlxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIHVubGVzc1ZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICAvLyBAZmlyc3QgaXMgdHJ1ZSB3aGVuIGluZGV4ID09PSAwLCBzbyB1bmxlc3MgQGZpcnN0IG1lYW5zIGluZGV4ICE9PSAwXG4gICAgICByZXR1cm4gXCIke2luZGV4ICE9PSAwID8gXCIgKyB1bmxlc3NFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjdW5sZXNzIGNvbmRpdGlvbn19dmFsdWV7ey91bmxlc3N9fSBwYXR0ZXJuIChnZW5lcmFsKVxuICAvLyBVc2UgW1xcc1xcU10qPyB0byBtYXRjaCBhY3Jvc3MgbmV3bGluZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xceyN1bmxlc3NcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce1xcL3VubGVzc1xcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGNvbmRFeHByID0gcHJvcFRvRXhwcihub3JtYWxpemVXaGl0ZXNwYWNlKGNvbmRpdGlvbikpO1xuICAgICAgY29uc3QgdW5sZXNzRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UodW5sZXNzVmFsKSk7XG4gICAgICBcbiAgICAgIC8vIHVubGVzcyBpcyB0aGUgb3Bwb3NpdGUgb2YgaWZcbiAgICAgIHJldHVybiAnJHshJyArIGNvbmRFeHByICsgJyA/ICcgKyB1bmxlc3NFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBBbHNvIGNvbnZlcnQgcmVtYWluaW5nIHt7QHJvb3QucHJvcGVydGllcy54eHh9fSAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqQHJvb3RcXC5wcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgfSk7XG4gIH1cblxuICAvLyBBbHNvIGNvbnZlcnQgcmVtYWluaW5nIHt7cHJvcGVydGllcy54eHh9fVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QganN4UHJvcCA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgICByZXR1cm4gJyR7JyArIGpzeFByb3AgKyAnfSc7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyB7e3RoaXMueHh4fX0gKGxvb3AgaXRlbSByZWZlcmVuY2VzIHZpYSB0aGlzKVxuICBpZiAocmVzdWx0LmluY2x1ZGVzKCd7eycpKSB7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xce1xce1xccyp0aGlzXFwuKFtefV0rKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgcmV0dXJuICckeycgKyBsb29wVmFyICsgJy4nICsgcHJvcC50cmltKCkgKyAnfSc7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0IHJlbWFpbmluZyBnZW5lcmFsIGV4cHJlc3Npb25zIChlLmcuIHt7YnV0dG9uLnZhcmlhbnR9fSwge3tpdGVtLmxhYmVsfX0pXG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKihbYS16QS1aX11bYS16QS1aMC05X10qKD86XFwuW2EtekEtWl9dW2EtekEtWjAtOV8tXSopKilcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIHJldHVybiAnJHsnICsgcHJvcFRvRXhwcihwcm9wKSArICd9JztcbiAgICB9KTtcbiAgfVxuICBcbiAgcmV0dXJuIHsganN4VmFsdWU6IHJlc3VsdCwgaXNFeHByZXNzaW9uIH07XG59O1xuXG4vKipcbiAqIFByZS1wcm9jZXNzIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZXMgKGVudGlyZSBhdHRyaWJ1dGUgd3JhcHBlZCBpbiB7eyNpZn19KVxuICogSGFuZGxlcyB0d28gcGF0dGVybnM6XG4gKiAgIDEuIHt7I2lmIGNvbmRpdGlvbn19YXR0ck5hbWU9XCJ2YWx1ZVwie3svaWZ9fSAg4oCUIGF0dHIgd2l0aCB2YWx1ZVxuICogICAyLiB7eyNpZiBjb25kaXRpb259fSBhdHRyTmFtZXt7L2lmfX0gICAgICAgICAg4oCUIGJvb2xlYW4gYXR0ciAoZS5nLiBzZWxlY3RlZCwgZGlzYWJsZWQpXG4gKiBCb3RoIGFyZSBjb252ZXJ0ZWQgdG86IGF0dHJOYW1lPXtjb25kaXRpb24gPyB2YWx1ZSA6IHVuZGVmaW5lZH1cbiAqL1xuZXhwb3J0IGNvbnN0IHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMgPSAodGVtcGxhdGU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGxldCByZXN1bHQgPSB0ZW1wbGF0ZTtcbiAgXG4gIC8vIFBhdHRlcm4gMToge3sjaWYgY29uZGl0aW9ufX0gYXR0ck5hbWU9XCJ2YWx1ZVwiIHt7L2lmfX0gKGFsbG93IG9wdGlvbmFsIHdoaXRlc3BhY2Ugc28gZS5nLiBzcmNzZXQgaXMgbWF0Y2hlZClcbiAgY29uc3QgY29uZEF0dHJSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfVxccyooXFx3Kyg/Oi1cXHcrKSopXFxzKj1cIihbXlwiXSopXCJcXHMqXFx7XFx7XFwvaWZcXH1cXH0vZztcbiAgXG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IGNvbmRBdHRyUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGxldCBjb25kaXRpb24gPSBtYXRjaFsxXS50cmltKCk7XG4gICAgY29uc3QgYXR0ck5hbWUgPSBtYXRjaFsyXTtcbiAgICBjb25zdCBhdHRyVmFsdWUgPSBtYXRjaFszXTtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSBtYXRjaFswXTtcbiAgICBjb25zdCBzdGFydFBvcyA9IG1hdGNoLmluZGV4O1xuICAgIFxuICAgIC8vIE5vcm1hbGl6ZSBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB0byBwcm9wZXJ0aWVzLnh4eCAocm9vdCBjb250ZXh0IGFjY2VzcylcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ0Byb290LnByb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbmRpdGlvbiA9IGNvbmRpdGlvbi5yZXBsYWNlKC9eQHJvb3RcXC4vLCAnJyk7XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBjb25kaXRpb24gdG8gSlNYIGV4cHJlc3Npb25cbiAgICBsZXQgY29uZEV4cHIgPSBjb25kaXRpb247XG4gICAgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGNvbmRpdGlvbi5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgICAgY29uZEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGNvbmRFeHByID0gYGl0ZW0uJHtjb25kaXRpb24ucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBhdHRyaWJ1dGUgdmFsdWUgdG8gSlNYIGV4cHJlc3Npb25cbiAgICBsZXQgdmFsdWVFeHByOiBzdHJpbmc7XG4gICAgaWYgKGF0dHJWYWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgLy8gVmFsdWUgY29udGFpbnMgaGFuZGxlYmFycyBleHByZXNzaW9uIChhbHNvIGhhbmRsZXMgQHJvb3QucHJvcGVydGllcy54eHgpXG4gICAgICBjb25zdCBwcm9wTWF0Y2ggPSBhdHRyVmFsdWUubWF0Y2goL1xce1xce1xccyooPzpAcm9vdFxcLik/cHJvcGVydGllc1xcLihbXn1dKylcXHMqXFx9XFx9Lyk7XG4gICAgICBpZiAocHJvcE1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcE1hdGNoWzFdLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgICB2YWx1ZUV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVFeHByID0gYCcke2F0dHJWYWx1ZX0nYDtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGF0dHJOYW1lID09PSAnc3R5bGUnKSB7XG4gICAgICAvLyBGb3IgY29uZGl0aW9uYWwgc3R5bGUgYXR0cmlidXRlcywgY29udmVydCBDU1Mgc3RyaW5nIHRvIGEgUmVhY3Qgc3R5bGUgb2JqZWN0XG4gICAgICB2YWx1ZUV4cHIgPSBjc3NTdHJpbmdUb1JlYWN0T2JqZWN0KGF0dHJWYWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlRXhwciA9IGAnJHthdHRyVmFsdWV9J2A7XG4gICAgfVxuICAgIFxuICAgIC8vIEdldCBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICBsZXQganN4QXR0ck5hbWUgPSBhdHRyTmFtZTtcbiAgICBpZiAoYXR0ck5hbWUgPT09ICdjbGFzcycpIHtcbiAgICAgIGpzeEF0dHJOYW1lID0gJ2NsYXNzTmFtZSc7XG4gICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ2ZvcicpIHtcbiAgICAgIGpzeEF0dHJOYW1lID0gJ2h0bWxGb3InO1xuICAgIH0gZWxzZSB7XG4gICAgICBqc3hBdHRyTmFtZSA9IHRvSnN4QXR0ck5hbWUoYXR0ck5hbWUpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBtYXJrZXJDb250ZW50ID0gYCR7Y29uZEV4cHJ9ID8gJHt2YWx1ZUV4cHJ9IDogdW5kZWZpbmVkYDtcbiAgICBjb25zdCByZXBsYWNlbWVudCA9IGAke2pzeEF0dHJOYW1lfT1cIl9fQ09ORF9BVFRSX18ke0J1ZmZlci5mcm9tKG1hcmtlckNvbnRlbnQpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9DT05EX0FUVFJfX1wiYDtcbiAgICBcbiAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhzdGFydFBvcyArIGZ1bGxNYXRjaC5sZW5ndGgpO1xuICAgIGNvbmRBdHRyUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gIH1cbiAgXG4gIC8vIFBhdHRlcm4gMjoge3sjaWYgY29uZGl0aW9ufX0gYm9vbGVhbkF0dHJ7ey9pZn19IChib29sZWFuIGF0dHJpYnV0ZSwgbm8gPVwidmFsdWVcIilcbiAgLy8gZS5nLiB7eyNpZiB0aGlzLnNlbGVjdGVkfX0gc2VsZWN0ZWR7ey9pZn19IG9yIHt7I2lmIHRoaXMuZGlzYWJsZWR9fSBkaXNhYmxlZHt7L2lmfX1cbiAgLy8gT25seSBtYXRjaGVzIG91dHNpZGUgYXR0cmlidXRlIHZhbHVlcyDigJQgY29uZGl0aW9uYWxzIGluc2lkZSBjbGFzcz1cIi4uLlwiIGV0Yy4gYXJlXG4gIC8vIGhhbmRsZWQgbGF0ZXIgYnkgY29udmVydEF0dHJpYnV0ZVZhbHVlLlxuICBjb25zdCBjb25kQm9vbFJlZ2V4ID0gL1xce1xceyNpZlxccysoW159XSspXFx9XFx9XFxzKihcXHcrKD86LVxcdyspKilcXHMqXFx7XFx7XFwvaWZcXH1cXH0vZztcbiAgXG4gIHdoaWxlICgobWF0Y2ggPSBjb25kQm9vbFJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSBtYXRjaFswXTtcbiAgICBjb25zdCBzdGFydFBvcyA9IG1hdGNoLmluZGV4O1xuICAgIFxuICAgIC8vIFNraXAgaWYgdGhpcyBtYXRjaCBpcyBpbnNpZGUgYW4gSFRNTCBhdHRyaWJ1dGUgdmFsdWUgKGJldHdlZW4gcXVvdGVzKS5cbiAgICAvLyBGaW5kIHRoZSBsYXN0IGA8YCBiZWZvcmUgdGhpcyBwb3NpdGlvbiBhbmQgY291bnQgdW5lc2NhcGVkIHF1b3RlcyBpbiB0aGVcbiAgICAvLyBzZWdtZW50IGJldHdlZW4gdGhhdCBgPGAgYW5kIHRoZSBtYXRjaCwgaWdub3JpbmcgcXVvdGVzIGluc2lkZSB7ey4uLn19IGJsb2Nrcy5cbiAgICBjb25zdCBsYXN0VGFnU3RhcnQgPSByZXN1bHQubGFzdEluZGV4T2YoJzwnLCBzdGFydFBvcyk7XG4gICAgaWYgKGxhc3RUYWdTdGFydCAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IHNlZ21lbnQgPSByZXN1bHQuc3Vic3RyaW5nKGxhc3RUYWdTdGFydCwgc3RhcnRQb3MpO1xuICAgICAgY29uc3Qgc2VnbWVudE5vSGJzID0gc2VnbWVudC5yZXBsYWNlKC9cXHtcXHtbXFxzXFxTXSo/XFx9XFx9L2csICcnKTtcbiAgICAgIGNvbnN0IHF1b3RlQ291bnQgPSAoc2VnbWVudE5vSGJzLm1hdGNoKC9cIi9nKSB8fCBbXSkubGVuZ3RoO1xuICAgICAgaWYgKHF1b3RlQ291bnQgJSAyID09PSAxKSB7XG4gICAgICAgIC8vIE9kZCBxdW90ZSBjb3VudCBtZWFucyB3ZSdyZSBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIOKAlCBza2lwXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBsZXQgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgXG4gICAgLy8gTm9ybWFsaXplIEByb290LnByb3BlcnRpZXMueHh4IHRvIHByb3BlcnRpZXMueHh4IChyb290IGNvbnRleHQgYWNjZXNzKVxuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgnQHJvb3QucHJvcGVydGllcy4nKSkge1xuICAgICAgY29uZGl0aW9uID0gY29uZGl0aW9uLnJlcGxhY2UoL15Acm9vdFxcLi8sICcnKTtcbiAgICB9XG4gICAgXG4gICAgbGV0IGNvbmRFeHByID0gY29uZGl0aW9uO1xuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBjb25kaXRpb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbmRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25kRXhwciA9IGBpdGVtLiR7Y29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGpzeEF0dHJOYW1lID0gdG9Kc3hBdHRyTmFtZShhdHRyTmFtZSk7XG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSB8fCB1bmRlZmluZWRgO1xuICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCAke2pzeEF0dHJOYW1lfT1cIl9fQ09ORF9BVFRSX18ke0J1ZmZlci5mcm9tKG1hcmtlckNvbnRlbnQpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9DT05EX0FUVFJfX1wiYDtcbiAgICBcbiAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhzdGFydFBvcyArIGZ1bGxNYXRjaC5sZW5ndGgpO1xuICAgIGNvbmRCb29sUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFByZS1wcm9jZXNzIGF0dHJpYnV0ZSB2YWx1ZXMgdGhhdCBjb250YWluIGNvbmRpdGlvbmFsc1xuICogVGhpcyBtdXN0IHJ1biBiZWZvcmUgcHJlcHJvY2Vzc0Jsb2NrcyB0byBwcmV2ZW50IGlmLW1hcmtlcnMgZnJvbSBhcHBlYXJpbmcgaW5zaWRlIGF0dHJpYnV0ZXNcbiAqIEBwYXJhbSBjdXJyZW50TG9vcEFycmF5IC0gV2hlbiBwcm9jZXNzaW5nIGxvb3AgaW5uZXIgY29udGVudCwgcGFzcyB0aGUgYXJyYXkgbmFtZSBzbyB7eyN1bmxlc3MgQGxhc3R9fSBldGMuIGdldCB0aGUgY29ycmVjdCBhcnJheSAoZS5nLiBcImN0YXNcIikgaW5zdGVhZCBvZiBkZWZhdWx0IFwiaXRlbXNcIlxuICovXG5leHBvcnQgY29uc3QgcHJlcHJvY2Vzc0F0dHJpYnV0ZUNvbmRpdGlvbmFscyA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjdXJyZW50TG9vcEFycmF5Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlc3VsdCA9IHRlbXBsYXRlO1xuICBcbiAgLy8gRmlyc3QgaGFuZGxlIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZXMgKGVudGlyZSBhdHRyaWJ1dGUgd3JhcHBlZCBpbiB7eyNpZn19KVxuICByZXN1bHQgPSBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzKHJlc3VsdCk7XG4gIFxuICAvLyBGaW5kIGF0dHJpYnV0ZXMgdGhhdCBjb250YWluIHt7I2lmIG9yIHt7I3VubGVzc1xuICAvLyBXZSBuZWVkIHRvIG1hbnVhbGx5IHBhcnNlIHRvIGhhbmRsZSBuZXN0ZWQgcXVvdGVzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gIGxldCBwb3MgPSAwO1xuICB3aGlsZSAocG9zIDwgcmVzdWx0Lmxlbmd0aCkge1xuICAgIC8vIEZpbmQgbmV4dCBhdHRyaWJ1dGUgcGF0dGVybjogYXR0ck5hbWU9XCJcbiAgICBjb25zdCBhdHRyU3RhcnRNYXRjaCA9IHJlc3VsdC5zdWJzdHJpbmcocG9zKS5tYXRjaCgvKFxcdysoPzotXFx3KykqKT1cIi8pO1xuICAgIGlmICghYXR0clN0YXJ0TWF0Y2gpIGJyZWFrO1xuICAgIFxuICAgIGNvbnN0IGF0dHJOYW1lID0gYXR0clN0YXJ0TWF0Y2hbMV07XG4gICAgY29uc3QgYXR0clN0YXJ0ID0gcG9zICsgYXR0clN0YXJ0TWF0Y2guaW5kZXghO1xuICAgIGNvbnN0IHZhbHVlU3RhcnQgPSBhdHRyU3RhcnQgKyBhdHRyU3RhcnRNYXRjaFswXS5sZW5ndGg7XG4gICAgXG4gICAgLy8gRmluZCB0aGUgY2xvc2luZyBxdW90ZSwgYnV0IGJlIGNhcmVmdWwgYWJvdXQgcXVvdGVzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gICAgbGV0IHZhbHVlRW5kID0gLTE7XG4gICAgbGV0IGluSGFuZGxlYmFycyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IHZhbHVlU3RhcnQ7IGkgPCByZXN1bHQubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGNoYXIgPSByZXN1bHRbaV07XG4gICAgICBjb25zdCBuZXh0Q2hhciA9IHJlc3VsdFtpICsgMV07XG4gICAgICBcbiAgICAgIGlmIChjaGFyID09PSAneycgJiYgbmV4dENoYXIgPT09ICd7Jykge1xuICAgICAgICBpbkhhbmRsZWJhcnMrKztcbiAgICAgICAgaSsrOyAvLyBTa2lwIG5leHQgY2hhclxuICAgICAgfSBlbHNlIGlmIChjaGFyID09PSAnfScgJiYgbmV4dENoYXIgPT09ICd9Jykge1xuICAgICAgICBpbkhhbmRsZWJhcnMtLTtcbiAgICAgICAgaSsrOyAvLyBTa2lwIG5leHQgY2hhclxuICAgICAgfSBlbHNlIGlmIChjaGFyID09PSAnXCInICYmIGluSGFuZGxlYmFycyA9PT0gMCkge1xuICAgICAgICB2YWx1ZUVuZCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpZiAodmFsdWVFbmQgPT09IC0xKSB7XG4gICAgICBwb3MgPSB2YWx1ZVN0YXJ0O1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGF0dHJWYWx1ZSA9IHJlc3VsdC5zdWJzdHJpbmcodmFsdWVTdGFydCwgdmFsdWVFbmQpO1xuICAgIGNvbnN0IGZ1bGxNYXRjaCA9IHJlc3VsdC5zdWJzdHJpbmcoYXR0clN0YXJ0LCB2YWx1ZUVuZCArIDEpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgYXR0cmlidXRlIGNvbnRhaW5zIGEgY29uZGl0aW9uYWxcbiAgICBpZiAoYXR0clZhbHVlLmluY2x1ZGVzKCd7eyNpZicpIHx8IGF0dHJWYWx1ZS5pbmNsdWRlcygne3sjdW5sZXNzJykpIHtcbiAgICAgIC8vIElmIHRoaXMgYXR0cmlidXRlIHJlZmVyZW5jZXMgQGxhc3Qgb3IgQGZpcnN0IGJ1dCB3ZSBkb24ndCBrbm93IHRoZVxuICAgICAgLy8gZW5jbG9zaW5nIGxvb3AgYXJyYXkgeWV0ICh0b3AtbGV2ZWwgcGFzcyksIGRlZmVyIHByb2Nlc3NpbmcgdW50aWxcbiAgICAgIC8vIHRoZSBsb29wIGlzIGV4cGFuZGVkIHdpdGggdGhlIGNvcnJlY3QgYXJyYXkgbmFtZS5cbiAgICAgIGlmICghY3VycmVudExvb3BBcnJheSAmJiAoYXR0clZhbHVlLmluY2x1ZGVzKCdAbGFzdCcpIHx8IGF0dHJWYWx1ZS5pbmNsdWRlcygnQGZpcnN0JykpKSB7XG4gICAgICAgIHBvcyA9IHZhbHVlRW5kICsgMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBDb252ZXJ0IHRoZSBhdHRyaWJ1dGUgdmFsdWUgdXNpbmcgb3VyIGhlbHBlciAocGFzcyBjdXJyZW50TG9vcEFycmF5IGZvciBAbGFzdCAvIEBmaXJzdClcbiAgICAgIGNvbnN0IHsganN4VmFsdWUsIGlzRXhwcmVzc2lvbiB9ID0gY29udmVydEF0dHJpYnV0ZVZhbHVlKGF0dHJWYWx1ZSwgJ2l0ZW0nLCBjdXJyZW50TG9vcEFycmF5KTtcbiAgICAgIFxuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBHZXQgdGhlIEpTWCBhdHRyaWJ1dGUgbmFtZVxuICAgICAgICBsZXQganN4QXR0ck5hbWUgPSBhdHRyTmFtZTtcbiAgICAgICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICAgICAganN4QXR0ck5hbWUgPSAnY2xhc3NOYW1lJztcbiAgICAgICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ2ZvcicpIHtcbiAgICAgICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSByZXBsYWNlbWVudCB3aXRoIEpTWCB0ZW1wbGF0ZSBsaXRlcmFsXG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCR7anN4QXR0ck5hbWV9PXtfX1RFTVBMQVRFX0xJVEVSQUxfXyR7QnVmZmVyLmZyb20oanN4VmFsdWUpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9URU1QTEFURV9MSVRFUkFMX199YDtcbiAgICAgICAgXG4gICAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgYXR0clN0YXJ0KSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyh2YWx1ZUVuZCArIDEpO1xuICAgICAgICBwb3MgPSBhdHRyU3RhcnQgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwb3MgPSB2YWx1ZUVuZCArIDE7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiogRW5zdXJlIGNsYXNzTmFtZSBhbHdheXMgcmVjZWl2ZXMgYSBzdHJpbmcgKFJlYWN0IHdhcm5zIG9uIGJvb2xlYW4pLiAqL1xuY29uc3QgZW5zdXJlQ2xhc3NOYW1lRXhwciA9IChqc3hOYW1lOiBzdHJpbmcsIGV4cHI6IHN0cmluZyk6IHN0cmluZyA9PlxuICBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGBTdHJpbmcoJHtleHByfSA/PyAnJylgIDogZXhwcjtcblxuLyoqXG4gKiBDb252ZXJ0IEhUTUwgYXR0cmlidXRlcyB0byBKU1ggYXR0cmlidXRlc1xuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZXMgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0KTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0cnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGxvb3BWYXIgPSBjb250ZXh0Lmxvb3BWYXJpYWJsZSB8fCAnaXRlbSc7XG4gIFxuICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZWxlbWVudC5hdHRyaWJ1dGVzKSkge1xuICAgIC8vIENoZWNrIGZvciBjb25kaXRpb25hbCBhdHRyaWJ1dGUgbWFya2VyIEZJUlNUIOKAlCBhcHBsaWVzIHRvIGFueSBhdHRyaWJ1dGUgaW5jbHVkaW5nIHN0eWxlLlxuICAgIC8vIHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMgZW5jb2RlcyB7eyNpZiBjb25kfX1hdHRyTmFtZT1cInZhbHVlXCJ7ey9pZn19IGludG8gdGhpcyBtYXJrZXIuXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCdfX0NPTkRfQVRUUl9fJykpIHtcbiAgICAgIGNvbnN0IGNvbmRNYXRjaCA9IHZhbHVlLm1hdGNoKC9fX0NPTkRfQVRUUl9fKFtBLVphLXowLTkrLz1dKylfX0VORF9DT05EX0FUVFJfXy8pO1xuICAgICAgaWYgKGNvbmRNYXRjaCkge1xuICAgICAgICBjb25zdCBkZWNvZGVkID0gQnVmZmVyLmZyb20oY29uZE1hdGNoWzFdLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgICAgY29uc3QganN4QXR0ckZvckNvbmQgPSBuYW1lID09PSAnY2xhc3MnID8gJ2NsYXNzTmFtZScgOiBuYW1lID09PSAnZm9yJyA/ICdodG1sRm9yJyA6IHRvSnN4QXR0ck5hbWUobmFtZSk7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4QXR0ckZvckNvbmR9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4QXR0ckZvckNvbmQsIGRlY29kZWQpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBzdHlsZSB0byBvYmplY3QgKHNwZWNpYWwgaGFuZGxpbmcpXG4gICAgaWYgKG5hbWUgPT09ICdzdHlsZScpIHtcbiAgICAgIGNvbnN0IHN0eWxlT2JqID0gcGFyc2VTdHlsZVRvT2JqZWN0KHZhbHVlLCBjb250ZXh0KTtcbiAgICAgIGF0dHJzLnB1c2goYHN0eWxlPSR7c3R5bGVPYmp9YCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2V0IHRoZSBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICBjb25zdCBqc3hOYW1lID0gdG9Kc3hBdHRyTmFtZShuYW1lKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB2YWx1ZSBjb250YWlucyBibG9jayBjb25kaXRpb25hbHMge3sjaWYuLi59fVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygne3sjaWYnKSkge1xuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUodmFsdWUsIGxvb3BWYXIsIGNvbnRleHQubG9vcEFycmF5KTtcbiAgICAgIGlmIChpc0V4cHJlc3Npb24pIHtcbiAgICAgICAgY29uc3Qgd3JhcHBlZCA9IGpzeE5hbWUgPT09ICdjbGFzc05hbWUnID8gYFxcJHtTdHJpbmcoJHtqc3hWYWx1ZX0gPz8gJycpfWAgOiBqc3hWYWx1ZTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBocmVmIHdpdGggaGFuZGxlYmFyc1xuICAgIGlmIChuYW1lID09PSAnaHJlZicgJiYgdmFsdWUuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgaHJlZj17JHtleHByfSB8fCAnIyd9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgc3JjIHdpdGggaGFuZGxlYmFyc1xuICAgIGlmIChuYW1lID09PSAnc3JjJyAmJiB2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXFx7XFx7K1xccyooW159XSs/KVxccypcXH0rXFx9Lyk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obWF0Y2hbMV0sIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgICBhdHRycy5wdXNoKGBzcmM9eyR7ZXhwcn19YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgb3RoZXIgYXR0cmlidXRlcyB3aXRoIGhhbmRsZWJhcnMgKGluY2x1ZGluZyBzaW1wbGUgZXhwcmVzc2lvbnMpXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCB7IGpzeFZhbHVlLCBpc0V4cHJlc3Npb24gfSA9IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZSh2YWx1ZSwgbG9vcFZhciwgY29udGV4dC5sb29wQXJyYXkpO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHVyZSBleHByZXNzaW9uIG9yIG5lZWRzIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgaWYgKGpzeFZhbHVlLnN0YXJ0c1dpdGgoJyR7JykgJiYganN4VmFsdWUuZW5kc1dpdGgoJ30nKSAmJiAhanN4VmFsdWUuaW5jbHVkZXMoJyR7JywgMikpIHtcbiAgICAgICAgICAvLyBTaW1wbGUgZXhwcmVzc2lvbiBsaWtlICR7cHJvcH0gLSBleHRyYWN0IGp1c3QgdGhlIGV4cHJlc3Npb25cbiAgICAgICAgICBjb25zdCBleHByID0ganN4VmFsdWUuc2xpY2UoMiwgLTEpO1xuICAgICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGVtcGxhdGUgbGl0ZXJhbCB3aXRoIHN0YXRpYyBwYXJ0cyBvciBtdWx0aXBsZSBleHByZXNzaW9uc1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGpzeFZhbHVlLnJlcGxhY2UoL1xcJFxceyhbXn1dKylcXH0vZywgKF8sIGUpID0+IGBcXCR7U3RyaW5nKCR7ZX0gPz8gJycpfWApIDoganN4VmFsdWU7XG4gICAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgZm9yIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeE5hbWUsIGV4cHIpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEJvb2xlYW4gYXR0cmlidXRlc1xuICAgIGlmICh2YWx1ZSA9PT0gJycgfHwgdmFsdWUgPT09IG5hbWUpIHtcbiAgICAgIGF0dHJzLnB1c2goanN4TmFtZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHRlbXBsYXRlIGxpdGVyYWwgbWFya2VyIChhbHJlYWR5IHByb2Nlc3NlZCBieSBwcmVwcm9jZXNzQXR0cmlidXRlQ29uZGl0aW9uYWxzKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19URU1QTEFURV9MSVRFUkFMX18nKSkge1xuICAgICAgLy8gVGhlIHZhbHVlIG1pZ2h0IGJlIHdyYXBwZWQgaW4ge30gZnJvbSBwcmVwcm9jZXNzaW5nIC0gc3RyaXAgdGhlbSBpZiBwcmVzZW50XG4gICAgICBsZXQgY2xlYW5WYWx1ZSA9IHZhbHVlO1xuICAgICAgaWYgKGNsZWFuVmFsdWUuc3RhcnRzV2l0aCgneycpICYmIGNsZWFuVmFsdWUuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICBjbGVhblZhbHVlID0gY2xlYW5WYWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgICB9XG4gICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgY2xlYW5WYWx1ZSl9fWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YW5kYXJkIGF0dHJpYnV0ZXNcbiAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PVwiJHt2YWx1ZX1cImApO1xuICB9XG4gIFxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufTtcbiJdfQ==