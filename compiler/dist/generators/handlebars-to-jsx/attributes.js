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
        // Resolve ../properties.xxx (parent context in loops) to top-level camelCase
        prop = (0, expression_parser_1.resolveParentPropertiesInExpression)(prop);
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
        const condition = match[1].trim();
        const attrName = match[2];
        const attrValue = match[3];
        const fullMatch = match[0];
        const startPos = match.index;
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
            // Value contains handlebars expression
            const propMatch = attrValue.match(/\{\{\s*properties\.([^}]+)\s*\}\}/);
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
        const condition = match[1].trim();
        const attrName = match[2];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9nZW5lcmF0b3JzL2hhbmRsZWJhcnMtdG8tanN4L2F0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7QUFJSCxtQ0FBOEY7QUFDOUYsMkRBQStGO0FBQy9GLHFDQUFzRTtBQUV0RTs7Ozs7R0FLRztBQUNJLE1BQU0scUJBQXFCLEdBQUcsQ0FDbkMsS0FBYSxFQUNiLFVBQWtCLE1BQU0sRUFDeEIsU0FBa0IsRUFDTyxFQUFFO0lBQzNCLE1BQU0sU0FBUyxHQUFHLFNBQVMsSUFBSSxPQUFPLENBQUM7SUFDdkMsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ25CLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQztJQUV6Qix1RkFBdUY7SUFDdkYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtRQUMzQyw4Q0FBOEM7UUFDOUMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1FBQzVFLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDO1lBQ2hDLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQztZQUNwQixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN6RCxRQUFRLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQVMsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUEsbUJBQVcsRUFBQyxDQUFDLENBQUMsQ0FBQyxD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QUFRLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDO1lBQzNDLDhFQUE4RTtZQUM5RSxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDdkIsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDM0QsVUFBVSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLEtBQUssbUJBQW1CLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN2RSxTQUFTO1FBQ1gsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN6QixDQUFDLENBQUM7QUF6R1csUUFBQSxpQkFBaUIscUJBeUc1QiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXR0cmlidXRlIGNvbnZlcnNpb24gdXRpbGl0aWVzIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IEhUTUxFbGVtZW50IH0gZnJvbSAnbm9kZS1odG1sLXBhcnNlcic7XG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCwgQ29udmVydGVkQXR0cmlidXRlVmFsdWUgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlLCB0b0pzeEF0dHJOYW1lLCBub3JtYWxpemVXaGl0ZXNwYWNlLCBjb2xsYXBzZVdoaXRlc3BhY2UgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IHRyYW5zcGlsZUV4cHJlc3Npb24sIHJlc29sdmVQYXJlbnRQcm9wZXJ0aWVzSW5FeHByZXNzaW9uIH0gZnJvbSAnLi9leHByZXNzaW9uLXBhcnNlcic7XG5pbXBvcnQgeyBwYXJzZVN0eWxlVG9PYmplY3QsIGNzc1N0cmluZ1RvUmVhY3RPYmplY3QgfSBmcm9tICcuL3N0eWxlcyc7XG5cbi8qKlxuICogQ29udmVydCBjb25kaXRpb25hbHMgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSB0byBKU1ggdGVtcGxhdGUgbGl0ZXJhbCBzeW50YXhcbiAqIENhbGxlZCBmcm9tIGNvbnZlcnRBdHRyaWJ1dGVzIGFmdGVyIEhUTUwgcGFyc2luZ1xuICogRXhhbXBsZTogXCJwcmVmaXh7eyNpZiBjb25kfX12YWx1ZXt7L2lmfX1zdWZmaXhcIiAtPiBgcHJlZml4JHtjb25kID8gJ3ZhbHVlJyA6ICcnfXN1ZmZpeGBcbiAqIEBwYXJhbSBsb29wQXJyYXkgLSBOYW1lIG9mIHRoZSBhcnJheSBiZWluZyBpdGVyYXRlZCAoZm9yIEBsYXN0IC8gQGZpcnN0KTsgd2hlbiBpbnNpZGUge3sjZWFjaCBhcnJ9fSwgdXNlICdhcnInLlxuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZVZhbHVlID0gKFxuICB2YWx1ZTogc3RyaW5nLFxuICBsb29wVmFyOiBzdHJpbmcgPSAnaXRlbScsXG4gIGxvb3BBcnJheT86IHN0cmluZ1xuKTogQ29udmVydGVkQXR0cmlidXRlVmFsdWUgPT4ge1xuICBjb25zdCBhcnJheU5hbWUgPSBsb29wQXJyYXkgfHwgJ2l0ZW1zJztcbiAgbGV0IHJlc3VsdCA9IHZhbHVlO1xuICBsZXQgaXNFeHByZXNzaW9uID0gZmFsc2U7XG4gIFxuICAvLyBIZWxwZXIgdG8gcGFyc2UgSGFuZGxlYmFycyBoZWxwZXIgZXhwcmVzc2lvbnMgbGlrZSAoZXEgcHJvcGVydGllcy5sYXlvdXQgXCJsYXlvdXQtMVwiKVxuICBjb25zdCBwYXJzZUhlbHBlciA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIC8vIE1hdGNoIChlcSBsZWZ0IHJpZ2h0KSBvciAoZXEgbGVmdCBcInN0cmluZ1wiKVxuICAgIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICAgIGlmIChlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICAgIGxlZnRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPT09IFwiJHtyaWdodH1cImA7XG4gICAgfVxuICAgIFxuICAgIC8vIE1hdGNoIChuZSBsZWZ0IFwic3RyaW5nXCIpXG4gICAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gICAgaWYgKG5lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgICAgbGVmdEV4cHIgPSBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2xlZnRFeHByfSAhPT0gXCIke3JpZ2h0fVwiYDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuICcnO1xuICB9O1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgcHJvcGVydHkgcmVmZXJlbmNlIG9yIGhlbHBlciBleHByZXNzaW9uIHRvIEpTWCBleHByZXNzaW9uXG4gIGNvbnN0IHByb3BUb0V4cHIgPSAocHJvcDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAvLyBSZXNvbHZlIC4uL3Byb3BlcnRpZXMueHh4IChwYXJlbnQgY29udGV4dCBpbiBsb29wcykgdG8gdG9wLWxldmVsIGNhbWVsQ2FzZVxuICAgIHByb3AgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihwcm9wKTtcbiAgICAvLyBDaGVjayBpZiBpdCdzIGEgaGVscGVyIGV4cHJlc3Npb24gbGlrZSAoZXEgLi4uKVxuICAgIGlmIChwcm9wLnN0YXJ0c1dpdGgoJygnKSkge1xuICAgICAgY29uc3QgcGFyc2VkID0gcGFyc2VIZWxwZXIocHJvcCk7XG4gICAgICBpZiAocGFyc2VkKSByZXR1cm4gcGFyc2VkO1xuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgQGZpcnN0IGFuZCBAbGFzdCBzcGVjaWFsIHZhcmlhYmxlc1xuICAgIGlmIChwcm9wID09PSAnQGZpcnN0Jykge1xuICAgICAgcmV0dXJuICdpbmRleCA9PT0gMCc7XG4gICAgfVxuICAgIGlmIChwcm9wID09PSAnQGxhc3QnKSB7XG4gICAgICByZXR1cm4gYGluZGV4ID09PSAke2FycmF5TmFtZX0/Lmxlbmd0aCAtIDFgO1xuICAgIH1cbiAgICBpZiAocHJvcCA9PT0gJ0BpbmRleCcpIHtcbiAgICAgIHJldHVybiAnaW5kZXgnO1xuICAgIH1cbiAgICBcbiAgICBpZiAocHJvcC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3AucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIHJldHVybiBwYXJ0cy5tYXAoKHA6IHN0cmluZywgaTogbnVtYmVyKSA9PiBpID09PSAwID8gdG9DYW1lbENhc2UocCkgOiBwKS5qb2luKCc/LicpO1xuICAgIH0gZWxzZSBpZiAocHJvcC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICByZXR1cm4gYCR7bG9vcFZhcn0uJHtwcm9wLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC5zcGxpdCgnLicpO1xuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgLy8gSXQncyBsaWtlbHkgYW4gYWxpYXMucHJvcCByZWZlcmVuY2VcbiAgICAgICAgcmV0dXJuIHByb3A7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7bG9vcFZhcn0uJHtwcm9wfWA7XG4gICAgfVxuICB9O1xuICBcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgaW5uZXIgY29udGVudCB0aGF0IG1heSBjb250YWluIHByb3BlcnR5IHJlZmVyZW5jZXNcbiAgLy8gUmV0dXJucyBhbiBleHByZXNzaW9uIHRoYXQgY2FuIGJlIGNvbmNhdGVuYXRlZCAobm90IGEgdGVtcGxhdGUgbGl0ZXJhbCBzdHJpbmcpXG4gIGNvbnN0IGNvbnZlcnRJbm5lclRvRXhwciA9ICh2YWw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgdmFsIGlzIEpVU1QgYSBwcm9wZXJ0eSByZWZlcmVuY2VcbiAgICBjb25zdCBqdXN0UHJvcE1hdGNoID0gdmFsLm1hdGNoKC9eXFx7XFx7XFxzKihbXn1dKylcXHMqXFx9XFx9JC8pO1xuICAgIGlmIChqdXN0UHJvcE1hdGNoKSB7XG4gICAgICByZXR1cm4gcHJvcFRvRXhwcihqdXN0UHJvcE1hdGNoWzFdLnRyaW0oKSk7XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGlmIHZhbCBjb250YWlucyBwcm9wZXJ0eSByZWZlcmVuY2VzIG1peGVkIHdpdGggc3RhdGljIHRleHRcbiAgICBpZiAodmFsLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICAvLyBDb252ZXJ0IHRvIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgIGxldCBleHByID0gdmFsO1xuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnRyaW0oKS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBqc3hQcm9wID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgICAgcmV0dXJuICckeycgKyBqc3hQcm9wICsgJ30nO1xuICAgICAgfSk7XG4gICAgICBleHByID0gZXhwci5yZXBsYWNlKC9cXHtcXHtcXHMqdGhpc1xcLihbXn1dKylcXHMqXFx9XFx9L2csIChfOiBzdHJpbmcsIHByb3A6IHN0cmluZykgPT4ge1xuICAgICAgICByZXR1cm4gJyR7JyArIGxvb3BWYXIgKyAnLicgKyBwcm9wLnRyaW0oKSArICd9JztcbiAgICAgIH0pO1xuICAgICAgZXhwciA9IGV4cHIucmVwbGFjZSgvXFx7XFx7XFxzKihbYS16QS1aX11bYS16QS1aMC05X10qKD86XFwuW2EtekEtWl9dW2EtekEtWjAtOV9dKikqKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICAgIGlmICghcHJvcC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpICYmICFwcm9wLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgICAgICByZXR1cm4gJyR7JyArIHByb3BUb0V4cHIocHJvcCkgKyAnfSc7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICckeycgKyBwcm9wICsgJ30nO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gJ2AnICsgZXhwciArICdgJztcbiAgICB9XG4gICAgXG4gICAgLy8gUGxhaW4gc3RhdGljIHRleHRcbiAgICByZXR1cm4gXCInXCIgKyB2YWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpICsgXCInXCI7XG4gIH07XG4gIFxuICAvLyBIYW5kbGUge3sjaWYgY29uZGl0aW9ufX12YWx1ZXt7ZWxzZX19b3RoZXJ7ey9pZn19IHBhdHRlcm5cbiAgLy8gVXNlIFtcXHNcXFNdKj8gdG8gbWF0Y2ggYWNyb3NzIG5ld2xpbmVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfShbXFxzXFxTXSo/KVxce1xce2Vsc2VcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCBpZlZhbDogc3RyaW5nLCBlbHNlVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBjb25kRXhwciA9IHByb3BUb0V4cHIobm9ybWFsaXplV2hpdGVzcGFjZShjb25kaXRpb24pKTtcbiAgICAgIGNvbnN0IGlmRXhwciA9IGNvbnZlcnRJbm5lclRvRXhwcihjb2xsYXBzZVdoaXRlc3BhY2UoaWZWYWwpKTtcbiAgICAgIGNvbnN0IGVsc2VFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZShlbHNlVmFsKSk7XG4gICAgICBcbiAgICAgIHJldHVybiAnJHsnICsgY29uZEV4cHIgKyAnID8gJyArIGlmRXhwciArICcgOiAnICsgZWxzZUV4cHIgKyAnfSc7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I2lmIGNvbmRpdGlvbn19dmFsdWV7ey9pZn19IHBhdHRlcm4gKG5vIGVsc2UpXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I2lmXFxzKyhbXn1dKylcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC9pZlxcfVxcfS9nLFxuICAgIChfOiBzdHJpbmcsIGNvbmRpdGlvbjogc3RyaW5nLCBpZlZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgY29uZEV4cHIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZGl0aW9uKSk7XG4gICAgICBjb25zdCBpZkV4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKGlmVmFsKSk7XG4gICAgICBcbiAgICAgIHJldHVybiAnJHsnICsgY29uZEV4cHIgKyAnID8gJyArIGlmRXhwciArIFwiIDogJyd9XCI7XG4gICAgfVxuICApO1xuICBcbiAgLy8gSGFuZGxlIHt7I3VubGVzcyBAbGFzdH19dmFsdWV7ey91bmxlc3N9fSBwYXR0ZXJuXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAbGFzdFxccypcXH1cXH0oW1xcc1xcU10qPylcXHtcXHtcXC91bmxlc3NcXH1cXH0vZyxcbiAgICAoXzogc3RyaW5nLCB1bmxlc3NWYWw6IHN0cmluZykgPT4ge1xuICAgICAgaXNFeHByZXNzaW9uID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHVubGVzc0V4cHIgPSBjb252ZXJ0SW5uZXJUb0V4cHIoY29sbGFwc2VXaGl0ZXNwYWNlKHVubGVzc1ZhbCkpO1xuICAgICAgLy8gQGxhc3QgbWVhbnMgaXQncyBOT1QgdGhlIGxhc3QgaXRlbSwgc28gd2UgY2hlY2sgaW5kZXggPCBhcnJheS5sZW5ndGggLSAxXG4gICAgICByZXR1cm4gJyR7aW5kZXggPCAnICsgYXJyYXlOYW1lICsgJz8ubGVuZ3RoIC0gMSA/ICcgKyB1bmxlc3NFeHByICsgXCIgOiAnJ31cIjtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBIYW5kbGUge3sjdW5sZXNzIEBmaXJzdH19dmFsdWV7ey91bmxlc3N9fSBwYXR0ZXJuXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccytAZmlyc3RcXHMqXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgdW5sZXNzVmFsOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCB1bmxlc3NFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh1bmxlc3NWYWwpKTtcbiAgICAgIC8vIEBmaXJzdCBpcyB0cnVlIHdoZW4gaW5kZXggPT09IDAsIHNvIHVubGVzcyBAZmlyc3QgbWVhbnMgaW5kZXggIT09IDBcbiAgICAgIHJldHVybiBcIiR7aW5kZXggIT09IDAgPyBcIiArIHVubGVzc0V4cHIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEhhbmRsZSB7eyN1bmxlc3MgY29uZGl0aW9ufX12YWx1ZXt7L3VubGVzc319IHBhdHRlcm4gKGdlbmVyYWwpXG4gIC8vIFVzZSBbXFxzXFxTXSo/IHRvIG1hdGNoIGFjcm9zcyBuZXdsaW5lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7I3VubGVzc1xccysoW159XSspXFx9XFx9KFtcXHNcXFNdKj8pXFx7XFx7XFwvdW5sZXNzXFx9XFx9L2csXG4gICAgKF86IHN0cmluZywgY29uZGl0aW9uOiBzdHJpbmcsIHVubGVzc1ZhbDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgY29uc3QgY29uZEV4cHIgPSBwcm9wVG9FeHByKG5vcm1hbGl6ZVdoaXRlc3BhY2UoY29uZGl0aW9uKSk7XG4gICAgICBjb25zdCB1bmxlc3NFeHByID0gY29udmVydElubmVyVG9FeHByKGNvbGxhcHNlV2hpdGVzcGFjZSh1bmxlc3NWYWwpKTtcbiAgICAgIFxuICAgICAgLy8gdW5sZXNzIGlzIHRoZSBvcHBvc2l0ZSBvZiBpZlxuICAgICAgcmV0dXJuICckeyEnICsgY29uZEV4cHIgKyAnID8gJyArIHVubGVzc0V4cHIgKyBcIiA6ICcnfVwiO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEFsc28gY29udmVydCByZW1haW5pbmcge3twcm9wZXJ0aWVzLnh4eH19XG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICBjb25zdCBwYXJ0cyA9IHByb3AudHJpbSgpLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBqc3hQcm9wID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIHJldHVybiAnJHsnICsganN4UHJvcCArICd9JztcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIHt7dGhpcy54eHh9fSAobG9vcCBpdGVtIHJlZmVyZW5jZXMgdmlhIHRoaXMpXG4gIGlmIChyZXN1bHQuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFx7XFx7XFxzKnRoaXNcXC4oW159XSspXFxzKlxcfVxcfS9nLCAoXzogc3RyaW5nLCBwcm9wOiBzdHJpbmcpID0+IHtcbiAgICAgIGlzRXhwcmVzc2lvbiA9IHRydWU7XG4gICAgICByZXR1cm4gJyR7JyArIGxvb3BWYXIgKyAnLicgKyBwcm9wLnRyaW0oKSArICd9JztcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnQgcmVtYWluaW5nIGdlbmVyYWwgZXhwcmVzc2lvbnMgKGUuZy4ge3tidXR0b24udmFyaWFudH19LCB7e2l0ZW0ubGFiZWx9fSlcbiAgaWYgKHJlc3VsdC5pbmNsdWRlcygne3snKSkge1xuICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXHtcXHtcXHMqKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05Xy1dKikqKVxccypcXH1cXH0vZywgKF86IHN0cmluZywgcHJvcDogc3RyaW5nKSA9PiB7XG4gICAgICBpc0V4cHJlc3Npb24gPSB0cnVlO1xuICAgICAgcmV0dXJuICckeycgKyBwcm9wVG9FeHByKHByb3ApICsgJ30nO1xuICAgIH0pO1xuICB9XG4gIFxuICByZXR1cm4geyBqc3hWYWx1ZTogcmVzdWx0LCBpc0V4cHJlc3Npb24gfTtcbn07XG5cbi8qKlxuICogUHJlLXByb2Nlc3MgY29uZGl0aW9uYWwgYXR0cmlidXRlcyAoZW50aXJlIGF0dHJpYnV0ZSB3cmFwcGVkIGluIHt7I2lmfX0pXG4gKiBIYW5kbGVzIHR3byBwYXR0ZXJuczpcbiAqICAgMS4ge3sjaWYgY29uZGl0aW9ufX1hdHRyTmFtZT1cInZhbHVlXCJ7ey9pZn19ICDigJQgYXR0ciB3aXRoIHZhbHVlXG4gKiAgIDIuIHt7I2lmIGNvbmRpdGlvbn19IGF0dHJOYW1le3svaWZ9fSAgICAgICAgICDigJQgYm9vbGVhbiBhdHRyIChlLmcuIHNlbGVjdGVkLCBkaXNhYmxlZClcbiAqIEJvdGggYXJlIGNvbnZlcnRlZCB0bzogYXR0ck5hbWU9e2NvbmRpdGlvbiA/IHZhbHVlIDogdW5kZWZpbmVkfVxuICovXG5leHBvcnQgY29uc3QgcHJlcHJvY2Vzc0NvbmRpdGlvbmFsQXR0cmlidXRlcyA9ICh0ZW1wbGF0ZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlc3VsdCA9IHRlbXBsYXRlO1xuICBcbiAgLy8gUGF0dGVybiAxOiB7eyNpZiBjb25kaXRpb259fSBhdHRyTmFtZT1cInZhbHVlXCIge3svaWZ9fSAoYWxsb3cgb3B0aW9uYWwgd2hpdGVzcGFjZSBzbyBlLmcuIHNyY3NldCBpcyBtYXRjaGVkKVxuICBjb25zdCBjb25kQXR0clJlZ2V4ID0gL1xce1xceyNpZlxccysoW159XSspXFx9XFx9XFxzKihcXHcrKD86LVxcdyspKilcXHMqPVwiKFteXCJdKilcIlxccypcXHtcXHtcXC9pZlxcfVxcfS9nO1xuICBcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gY29uZEF0dHJSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3QgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgY29uc3QgYXR0clZhbHVlID0gbWF0Y2hbM107XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBDb252ZXJ0IGNvbmRpdGlvbiB0byBKU1ggZXhwcmVzc2lvblxuICAgIGxldCBjb25kRXhwciA9IGNvbmRpdGlvbjtcbiAgICBpZiAoY29uZGl0aW9uLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gY29uZGl0aW9uLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgICBjb25kRXhwciA9IHBhcnRzLm1hcCgocDogc3RyaW5nLCBpOiBudW1iZXIpID0+IGkgPT09IDAgPyB0b0NhbWVsQ2FzZShwKSA6IHApLmpvaW4oJz8uJyk7XG4gICAgfSBlbHNlIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgY29uZEV4cHIgPSBgaXRlbS4ke2NvbmRpdGlvbi5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb252ZXJ0IGF0dHJpYnV0ZSB2YWx1ZSB0byBKU1ggZXhwcmVzc2lvblxuICAgIGxldCB2YWx1ZUV4cHI6IHN0cmluZztcbiAgICBpZiAoYXR0clZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICAvLyBWYWx1ZSBjb250YWlucyBoYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IHByb3BNYXRjaCA9IGF0dHJWYWx1ZS5tYXRjaCgvXFx7XFx7XFxzKnByb3BlcnRpZXNcXC4oW159XSspXFxzKlxcfVxcfS8pO1xuICAgICAgaWYgKHByb3BNYXRjaCkge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3BNYXRjaFsxXS50cmltKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgdmFsdWVFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlRXhwciA9IGAnJHthdHRyVmFsdWV9J2A7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ3N0eWxlJykge1xuICAgICAgLy8gRm9yIGNvbmRpdGlvbmFsIHN0eWxlIGF0dHJpYnV0ZXMsIGNvbnZlcnQgQ1NTIHN0cmluZyB0byBhIFJlYWN0IHN0eWxlIG9iamVjdFxuICAgICAgdmFsdWVFeHByID0gY3NzU3RyaW5nVG9SZWFjdE9iamVjdChhdHRyVmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZUV4cHIgPSBgJyR7YXR0clZhbHVlfSdgO1xuICAgIH1cbiAgICBcbiAgICAvLyBHZXQgSlNYIGF0dHJpYnV0ZSBuYW1lXG4gICAgbGV0IGpzeEF0dHJOYW1lID0gYXR0ck5hbWU7XG4gICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdjbGFzc05hbWUnO1xuICAgIH0gZWxzZSBpZiAoYXR0ck5hbWUgPT09ICdmb3InKSB7XG4gICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICB9IGVsc2Uge1xuICAgICAganN4QXR0ck5hbWUgPSB0b0pzeEF0dHJOYW1lKGF0dHJOYW1lKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSA/ICR7dmFsdWVFeHByfSA6IHVuZGVmaW5lZGA7XG4gICAgY29uc3QgcmVwbGFjZW1lbnQgPSBgJHtqc3hBdHRyTmFtZX09XCJfX0NPTkRfQVRUUl9fJHtCdWZmZXIuZnJvbShtYXJrZXJDb250ZW50KS50b1N0cmluZygnYmFzZTY0Jyl9X19FTkRfQ09ORF9BVFRSX19cImA7XG4gICAgXG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCBzdGFydFBvcykgKyByZXBsYWNlbWVudCArIHJlc3VsdC5zdWJzdHJpbmcoc3RhcnRQb3MgKyBmdWxsTWF0Y2gubGVuZ3RoKTtcbiAgICBjb25kQXR0clJlZ2V4Lmxhc3RJbmRleCA9IHN0YXJ0UG9zICsgcmVwbGFjZW1lbnQubGVuZ3RoO1xuICB9XG4gIFxuICAvLyBQYXR0ZXJuIDI6IHt7I2lmIGNvbmRpdGlvbn19IGJvb2xlYW5BdHRye3svaWZ9fSAoYm9vbGVhbiBhdHRyaWJ1dGUsIG5vID1cInZhbHVlXCIpXG4gIC8vIGUuZy4ge3sjaWYgdGhpcy5zZWxlY3RlZH19IHNlbGVjdGVke3svaWZ9fSBvciB7eyNpZiB0aGlzLmRpc2FibGVkfX0gZGlzYWJsZWR7ey9pZn19XG4gIC8vIE9ubHkgbWF0Y2hlcyBvdXRzaWRlIGF0dHJpYnV0ZSB2YWx1ZXMg4oCUIGNvbmRpdGlvbmFscyBpbnNpZGUgY2xhc3M9XCIuLi5cIiBldGMuIGFyZVxuICAvLyBoYW5kbGVkIGxhdGVyIGJ5IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZS5cbiAgY29uc3QgY29uZEJvb2xSZWdleCA9IC9cXHtcXHsjaWZcXHMrKFtefV0rKVxcfVxcfVxccyooXFx3Kyg/Oi1cXHcrKSopXFxzKlxce1xce1xcL2lmXFx9XFx9L2c7XG4gIFxuICB3aGlsZSAoKG1hdGNoID0gY29uZEJvb2xSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3QgZnVsbE1hdGNoID0gbWF0Y2hbMF07XG4gICAgY29uc3Qgc3RhcnRQb3MgPSBtYXRjaC5pbmRleDtcbiAgICBcbiAgICAvLyBTa2lwIGlmIHRoaXMgbWF0Y2ggaXMgaW5zaWRlIGFuIEhUTUwgYXR0cmlidXRlIHZhbHVlIChiZXR3ZWVuIHF1b3RlcykuXG4gICAgLy8gRmluZCB0aGUgbGFzdCBgPGAgYmVmb3JlIHRoaXMgcG9zaXRpb24gYW5kIGNvdW50IHVuZXNjYXBlZCBxdW90ZXMgaW4gdGhlXG4gICAgLy8gc2VnbWVudCBiZXR3ZWVuIHRoYXQgYDxgIGFuZCB0aGUgbWF0Y2gsIGlnbm9yaW5nIHF1b3RlcyBpbnNpZGUge3suLi59fSBibG9ja3MuXG4gICAgY29uc3QgbGFzdFRhZ1N0YXJ0ID0gcmVzdWx0Lmxhc3RJbmRleE9mKCc8Jywgc3RhcnRQb3MpO1xuICAgIGlmIChsYXN0VGFnU3RhcnQgIT09IC0xKSB7XG4gICAgICBjb25zdCBzZWdtZW50ID0gcmVzdWx0LnN1YnN0cmluZyhsYXN0VGFnU3RhcnQsIHN0YXJ0UG9zKTtcbiAgICAgIGNvbnN0IHNlZ21lbnROb0hicyA9IHNlZ21lbnQucmVwbGFjZSgvXFx7XFx7W1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gICAgICBjb25zdCBxdW90ZUNvdW50ID0gKHNlZ21lbnROb0hicy5tYXRjaCgvXCIvZykgfHwgW10pLmxlbmd0aDtcbiAgICAgIGlmIChxdW90ZUNvdW50ICUgMiA9PT0gMSkge1xuICAgICAgICAvLyBPZGQgcXVvdGUgY291bnQgbWVhbnMgd2UncmUgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSDigJQgc2tpcFxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY29uc3QgY29uZGl0aW9uID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gbWF0Y2hbMl07XG4gICAgXG4gICAgbGV0IGNvbmRFeHByID0gY29uZGl0aW9uO1xuICAgIGlmIChjb25kaXRpb24uc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgY29uc3QgcGFydHMgPSBjb25kaXRpb24ucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICAgIGNvbmRFeHByID0gcGFydHMubWFwKChwOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gaSA9PT0gMCA/IHRvQ2FtZWxDYXNlKHApIDogcCkuam9pbignPy4nKTtcbiAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBjb25kRXhwciA9IGBpdGVtLiR7Y29uZGl0aW9uLnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGpzeEF0dHJOYW1lID0gdG9Kc3hBdHRyTmFtZShhdHRyTmFtZSk7XG4gICAgY29uc3QgbWFya2VyQ29udGVudCA9IGAke2NvbmRFeHByfSB8fCB1bmRlZmluZWRgO1xuICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCAke2pzeEF0dHJOYW1lfT1cIl9fQ09ORF9BVFRSX18ke0J1ZmZlci5mcm9tKG1hcmtlckNvbnRlbnQpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9DT05EX0FUVFJfX1wiYDtcbiAgICBcbiAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyhzdGFydFBvcyArIGZ1bGxNYXRjaC5sZW5ndGgpO1xuICAgIGNvbmRCb29sUmVnZXgubGFzdEluZGV4ID0gc3RhcnRQb3MgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFByZS1wcm9jZXNzIGF0dHJpYnV0ZSB2YWx1ZXMgdGhhdCBjb250YWluIGNvbmRpdGlvbmFsc1xuICogVGhpcyBtdXN0IHJ1biBiZWZvcmUgcHJlcHJvY2Vzc0Jsb2NrcyB0byBwcmV2ZW50IGlmLW1hcmtlcnMgZnJvbSBhcHBlYXJpbmcgaW5zaWRlIGF0dHJpYnV0ZXNcbiAqIEBwYXJhbSBjdXJyZW50TG9vcEFycmF5IC0gV2hlbiBwcm9jZXNzaW5nIGxvb3AgaW5uZXIgY29udGVudCwgcGFzcyB0aGUgYXJyYXkgbmFtZSBzbyB7eyN1bmxlc3MgQGxhc3R9fSBldGMuIGdldCB0aGUgY29ycmVjdCBhcnJheSAoZS5nLiBcImN0YXNcIikgaW5zdGVhZCBvZiBkZWZhdWx0IFwiaXRlbXNcIlxuICovXG5leHBvcnQgY29uc3QgcHJlcHJvY2Vzc0F0dHJpYnV0ZUNvbmRpdGlvbmFscyA9ICh0ZW1wbGF0ZTogc3RyaW5nLCBjdXJyZW50TG9vcEFycmF5Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlc3VsdCA9IHRlbXBsYXRlO1xuICBcbiAgLy8gRmlyc3QgaGFuZGxlIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZXMgKGVudGlyZSBhdHRyaWJ1dGUgd3JhcHBlZCBpbiB7eyNpZn19KVxuICByZXN1bHQgPSBwcmVwcm9jZXNzQ29uZGl0aW9uYWxBdHRyaWJ1dGVzKHJlc3VsdCk7XG4gIFxuICAvLyBGaW5kIGF0dHJpYnV0ZXMgdGhhdCBjb250YWluIHt7I2lmIG9yIHt7I3VubGVzc1xuICAvLyBXZSBuZWVkIHRvIG1hbnVhbGx5IHBhcnNlIHRvIGhhbmRsZSBuZXN0ZWQgcXVvdGVzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gIGxldCBwb3MgPSAwO1xuICB3aGlsZSAocG9zIDwgcmVzdWx0Lmxlbmd0aCkge1xuICAgIC8vIEZpbmQgbmV4dCBhdHRyaWJ1dGUgcGF0dGVybjogYXR0ck5hbWU9XCJcbiAgICBjb25zdCBhdHRyU3RhcnRNYXRjaCA9IHJlc3VsdC5zdWJzdHJpbmcocG9zKS5tYXRjaCgvKFxcdysoPzotXFx3KykqKT1cIi8pO1xuICAgIGlmICghYXR0clN0YXJ0TWF0Y2gpIGJyZWFrO1xuICAgIFxuICAgIGNvbnN0IGF0dHJOYW1lID0gYXR0clN0YXJ0TWF0Y2hbMV07XG4gICAgY29uc3QgYXR0clN0YXJ0ID0gcG9zICsgYXR0clN0YXJ0TWF0Y2guaW5kZXghO1xuICAgIGNvbnN0IHZhbHVlU3RhcnQgPSBhdHRyU3RhcnQgKyBhdHRyU3RhcnRNYXRjaFswXS5sZW5ndGg7XG4gICAgXG4gICAgLy8gRmluZCB0aGUgY2xvc2luZyBxdW90ZSwgYnV0IGJlIGNhcmVmdWwgYWJvdXQgcXVvdGVzIGluc2lkZSBIYW5kbGViYXJzIGV4cHJlc3Npb25zXG4gICAgbGV0IHZhbHVlRW5kID0gLTE7XG4gICAgbGV0IGluSGFuZGxlYmFycyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IHZhbHVlU3RhcnQ7IGkgPCByZXN1bHQubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGNoYXIgPSByZXN1bHRbaV07XG4gICAgICBjb25zdCBuZXh0Q2hhciA9IHJlc3VsdFtpICsgMV07XG4gICAgICBcbiAgICAgIGlmIChjaGFyID09PSAneycgJiYgbmV4dENoYXIgPT09ICd7Jykge1xuICAgICAgICBpbkhhbmRsZWJhcnMrKztcbiAgICAgICAgaSsrOyAvLyBTa2lwIG5leHQgY2hhclxuICAgICAgfSBlbHNlIGlmIChjaGFyID09PSAnfScgJiYgbmV4dENoYXIgPT09ICd9Jykge1xuICAgICAgICBpbkhhbmRsZWJhcnMtLTtcbiAgICAgICAgaSsrOyAvLyBTa2lwIG5leHQgY2hhclxuICAgICAgfSBlbHNlIGlmIChjaGFyID09PSAnXCInICYmIGluSGFuZGxlYmFycyA9PT0gMCkge1xuICAgICAgICB2YWx1ZUVuZCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpZiAodmFsdWVFbmQgPT09IC0xKSB7XG4gICAgICBwb3MgPSB2YWx1ZVN0YXJ0O1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGF0dHJWYWx1ZSA9IHJlc3VsdC5zdWJzdHJpbmcodmFsdWVTdGFydCwgdmFsdWVFbmQpO1xuICAgIGNvbnN0IGZ1bGxNYXRjaCA9IHJlc3VsdC5zdWJzdHJpbmcoYXR0clN0YXJ0LCB2YWx1ZUVuZCArIDEpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgYXR0cmlidXRlIGNvbnRhaW5zIGEgY29uZGl0aW9uYWxcbiAgICBpZiAoYXR0clZhbHVlLmluY2x1ZGVzKCd7eyNpZicpIHx8IGF0dHJWYWx1ZS5pbmNsdWRlcygne3sjdW5sZXNzJykpIHtcbiAgICAgIC8vIElmIHRoaXMgYXR0cmlidXRlIHJlZmVyZW5jZXMgQGxhc3Qgb3IgQGZpcnN0IGJ1dCB3ZSBkb24ndCBrbm93IHRoZVxuICAgICAgLy8gZW5jbG9zaW5nIGxvb3AgYXJyYXkgeWV0ICh0b3AtbGV2ZWwgcGFzcyksIGRlZmVyIHByb2Nlc3NpbmcgdW50aWxcbiAgICAgIC8vIHRoZSBsb29wIGlzIGV4cGFuZGVkIHdpdGggdGhlIGNvcnJlY3QgYXJyYXkgbmFtZS5cbiAgICAgIGlmICghY3VycmVudExvb3BBcnJheSAmJiAoYXR0clZhbHVlLmluY2x1ZGVzKCdAbGFzdCcpIHx8IGF0dHJWYWx1ZS5pbmNsdWRlcygnQGZpcnN0JykpKSB7XG4gICAgICAgIHBvcyA9IHZhbHVlRW5kICsgMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBDb252ZXJ0IHRoZSBhdHRyaWJ1dGUgdmFsdWUgdXNpbmcgb3VyIGhlbHBlciAocGFzcyBjdXJyZW50TG9vcEFycmF5IGZvciBAbGFzdCAvIEBmaXJzdClcbiAgICAgIGNvbnN0IHsganN4VmFsdWUsIGlzRXhwcmVzc2lvbiB9ID0gY29udmVydEF0dHJpYnV0ZVZhbHVlKGF0dHJWYWx1ZSwgJ2l0ZW0nLCBjdXJyZW50TG9vcEFycmF5KTtcbiAgICAgIFxuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBHZXQgdGhlIEpTWCBhdHRyaWJ1dGUgbmFtZVxuICAgICAgICBsZXQganN4QXR0ck5hbWUgPSBhdHRyTmFtZTtcbiAgICAgICAgaWYgKGF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICAgICAganN4QXR0ck5hbWUgPSAnY2xhc3NOYW1lJztcbiAgICAgICAgfSBlbHNlIGlmIChhdHRyTmFtZSA9PT0gJ2ZvcicpIHtcbiAgICAgICAgICBqc3hBdHRyTmFtZSA9ICdodG1sRm9yJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSByZXBsYWNlbWVudCB3aXRoIEpTWCB0ZW1wbGF0ZSBsaXRlcmFsXG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gYCR7anN4QXR0ck5hbWV9PXtfX1RFTVBMQVRFX0xJVEVSQUxfXyR7QnVmZmVyLmZyb20oanN4VmFsdWUpLnRvU3RyaW5nKCdiYXNlNjQnKX1fX0VORF9URU1QTEFURV9MSVRFUkFMX199YDtcbiAgICAgICAgXG4gICAgICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgYXR0clN0YXJ0KSArIHJlcGxhY2VtZW50ICsgcmVzdWx0LnN1YnN0cmluZyh2YWx1ZUVuZCArIDEpO1xuICAgICAgICBwb3MgPSBhdHRyU3RhcnQgKyByZXBsYWNlbWVudC5sZW5ndGg7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwb3MgPSB2YWx1ZUVuZCArIDE7XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiogRW5zdXJlIGNsYXNzTmFtZSBhbHdheXMgcmVjZWl2ZXMgYSBzdHJpbmcgKFJlYWN0IHdhcm5zIG9uIGJvb2xlYW4pLiAqL1xuY29uc3QgZW5zdXJlQ2xhc3NOYW1lRXhwciA9IChqc3hOYW1lOiBzdHJpbmcsIGV4cHI6IHN0cmluZyk6IHN0cmluZyA9PlxuICBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGBTdHJpbmcoJHtleHByfSA/PyAnJylgIDogZXhwcjtcblxuLyoqXG4gKiBDb252ZXJ0IEhUTUwgYXR0cmlidXRlcyB0byBKU1ggYXR0cmlidXRlc1xuICovXG5leHBvcnQgY29uc3QgY29udmVydEF0dHJpYnV0ZXMgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0KTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0cnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGxvb3BWYXIgPSBjb250ZXh0Lmxvb3BWYXJpYWJsZSB8fCAnaXRlbSc7XG4gIFxuICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZWxlbWVudC5hdHRyaWJ1dGVzKSkge1xuICAgIC8vIENoZWNrIGZvciBjb25kaXRpb25hbCBhdHRyaWJ1dGUgbWFya2VyIEZJUlNUIOKAlCBhcHBsaWVzIHRvIGFueSBhdHRyaWJ1dGUgaW5jbHVkaW5nIHN0eWxlLlxuICAgIC8vIHByZXByb2Nlc3NDb25kaXRpb25hbEF0dHJpYnV0ZXMgZW5jb2RlcyB7eyNpZiBjb25kfX1hdHRyTmFtZT1cInZhbHVlXCJ7ey9pZn19IGludG8gdGhpcyBtYXJrZXIuXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCdfX0NPTkRfQVRUUl9fJykpIHtcbiAgICAgIGNvbnN0IGNvbmRNYXRjaCA9IHZhbHVlLm1hdGNoKC9fX0NPTkRfQVRUUl9fKFtBLVphLXowLTkrLz1dKylfX0VORF9DT05EX0FUVFJfXy8pO1xuICAgICAgaWYgKGNvbmRNYXRjaCkge1xuICAgICAgICBjb25zdCBkZWNvZGVkID0gQnVmZmVyLmZyb20oY29uZE1hdGNoWzFdLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgICAgY29uc3QganN4QXR0ckZvckNvbmQgPSBuYW1lID09PSAnY2xhc3MnID8gJ2NsYXNzTmFtZScgOiBuYW1lID09PSAnZm9yJyA/ICdodG1sRm9yJyA6IHRvSnN4QXR0ck5hbWUobmFtZSk7XG4gICAgICAgIGF0dHJzLnB1c2goYCR7anN4QXR0ckZvckNvbmR9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4QXR0ckZvckNvbmQsIGRlY29kZWQpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBzdHlsZSB0byBvYmplY3QgKHNwZWNpYWwgaGFuZGxpbmcpXG4gICAgaWYgKG5hbWUgPT09ICdzdHlsZScpIHtcbiAgICAgIGNvbnN0IHN0eWxlT2JqID0gcGFyc2VTdHlsZVRvT2JqZWN0KHZhbHVlLCBjb250ZXh0KTtcbiAgICAgIGF0dHJzLnB1c2goYHN0eWxlPSR7c3R5bGVPYmp9YCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gR2V0IHRoZSBKU1ggYXR0cmlidXRlIG5hbWVcbiAgICBjb25zdCBqc3hOYW1lID0gdG9Kc3hBdHRyTmFtZShuYW1lKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB2YWx1ZSBjb250YWlucyBibG9jayBjb25kaXRpb25hbHMge3sjaWYuLi59fVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygne3sjaWYnKSkge1xuICAgICAgY29uc3QgeyBqc3hWYWx1ZSwgaXNFeHByZXNzaW9uIH0gPSBjb252ZXJ0QXR0cmlidXRlVmFsdWUodmFsdWUsIGxvb3BWYXIsIGNvbnRleHQubG9vcEFycmF5KTtcbiAgICAgIGlmIChpc0V4cHJlc3Npb24pIHtcbiAgICAgICAgY29uc3Qgd3JhcHBlZCA9IGpzeE5hbWUgPT09ICdjbGFzc05hbWUnID8gYFxcJHtTdHJpbmcoJHtqc3hWYWx1ZX0gPz8gJycpfWAgOiBqc3hWYWx1ZTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBocmVmIHdpdGggaGFuZGxlYmFyc1xuICAgIGlmIChuYW1lID09PSAnaHJlZicgJiYgdmFsdWUuaW5jbHVkZXMoJ3t7JykpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgaHJlZj17JHtleHByfSB8fCAnIyd9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgc3JjIHdpdGggaGFuZGxlYmFyc1xuICAgIGlmIChuYW1lID09PSAnc3JjJyAmJiB2YWx1ZS5pbmNsdWRlcygne3snKSkge1xuICAgICAgY29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXFx7XFx7K1xccyooW159XSs/KVxccypcXH0rXFx9Lyk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obWF0Y2hbMV0sIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgICBhdHRycy5wdXNoKGBzcmM9eyR7ZXhwcn19YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgb3RoZXIgYXR0cmlidXRlcyB3aXRoIGhhbmRsZWJhcnMgKGluY2x1ZGluZyBzaW1wbGUgZXhwcmVzc2lvbnMpXG4gICAgaWYgKHZhbHVlLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgICBjb25zdCB7IGpzeFZhbHVlLCBpc0V4cHJlc3Npb24gfSA9IGNvbnZlcnRBdHRyaWJ1dGVWYWx1ZSh2YWx1ZSwgbG9vcFZhciwgY29udGV4dC5sb29wQXJyYXkpO1xuICAgICAgaWYgKGlzRXhwcmVzc2lvbikge1xuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHVyZSBleHByZXNzaW9uIG9yIG5lZWRzIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgaWYgKGpzeFZhbHVlLnN0YXJ0c1dpdGgoJyR7JykgJiYganN4VmFsdWUuZW5kc1dpdGgoJ30nKSAmJiAhanN4VmFsdWUuaW5jbHVkZXMoJyR7JywgMikpIHtcbiAgICAgICAgICAvLyBTaW1wbGUgZXhwcmVzc2lvbiBsaWtlICR7cHJvcH0gLSBleHRyYWN0IGp1c3QgdGhlIGV4cHJlc3Npb25cbiAgICAgICAgICBjb25zdCBleHByID0ganN4VmFsdWUuc2xpY2UoMiwgLTEpO1xuICAgICAgICAgIGF0dHJzLnB1c2goYCR7anN4TmFtZX09eyR7ZW5zdXJlQ2xhc3NOYW1lRXhwcihqc3hOYW1lLCBleHByKX19YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGVtcGxhdGUgbGl0ZXJhbCB3aXRoIHN0YXRpYyBwYXJ0cyBvciBtdWx0aXBsZSBleHByZXNzaW9uc1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBqc3hOYW1lID09PSAnY2xhc3NOYW1lJyA/IGpzeFZhbHVlLnJlcGxhY2UoL1xcJFxceyhbXn1dKylcXH0vZywgKF8sIGUpID0+IGBcXCR7U3RyaW5nKCR7ZX0gPz8gJycpfWApIDoganN4VmFsdWU7XG4gICAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17XFxgJHt3cmFwcGVkfVxcYH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRmFsbGJhY2sgZm9yIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1xce1xceytcXHMqKFtefV0rPylcXHMqXFx9K1xcfS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG1hdGNoWzFdLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgICAgYXR0cnMucHVzaChgJHtqc3hOYW1lfT17JHtlbnN1cmVDbGFzc05hbWVFeHByKGpzeE5hbWUsIGV4cHIpfX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEJvb2xlYW4gYXR0cmlidXRlc1xuICAgIGlmICh2YWx1ZSA9PT0gJycgfHwgdmFsdWUgPT09IG5hbWUpIHtcbiAgICAgIGF0dHJzLnB1c2goanN4TmFtZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHRlbXBsYXRlIGxpdGVyYWwgbWFya2VyIChhbHJlYWR5IHByb2Nlc3NlZCBieSBwcmVwcm9jZXNzQXR0cmlidXRlQ29uZGl0aW9uYWxzKVxuICAgIGlmICh2YWx1ZS5pbmNsdWRlcygnX19URU1QTEFURV9MSVRFUkFMX18nKSkge1xuICAgICAgLy8gVGhlIHZhbHVlIG1pZ2h0IGJlIHdyYXBwZWQgaW4ge30gZnJvbSBwcmVwcm9jZXNzaW5nIC0gc3RyaXAgdGhlbSBpZiBwcmVzZW50XG4gICAgICBsZXQgY2xlYW5WYWx1ZSA9IHZhbHVlO1xuICAgICAgaWYgKGNsZWFuVmFsdWUuc3RhcnRzV2l0aCgneycpICYmIGNsZWFuVmFsdWUuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICBjbGVhblZhbHVlID0gY2xlYW5WYWx1ZS5zbGljZSgxLCAtMSk7XG4gICAgICB9XG4gICAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PXske2Vuc3VyZUNsYXNzTmFtZUV4cHIoanN4TmFtZSwgY2xlYW5WYWx1ZSl9fWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YW5kYXJkIGF0dHJpYnV0ZXNcbiAgICBhdHRycy5wdXNoKGAke2pzeE5hbWV9PVwiJHt2YWx1ZX1cImApO1xuICB9XG4gIFxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufTtcbiJdfQ==