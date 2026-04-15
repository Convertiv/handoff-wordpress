/**
 * Attribute conversion utilities for the Handlebars to JSX transpiler
 */

import { HTMLElement } from 'node-html-parser';
import { TranspilerContext, ConvertedAttributeValue } from './types';
import { toCamelCase, toJsxAttrName, normalizeWhitespace, collapseWhitespace } from './utils';
import { transpileExpression, resolveParentPropertiesInExpression } from './expression-parser';
import { parseStyleToObject, cssStringToReactObject } from './styles';

/**
 * Convert conditionals inside an attribute value to JSX template literal syntax
 * Called from convertAttributes after HTML parsing
 * Example: "prefix{{#if cond}}value{{/if}}suffix" -> `prefix${cond ? 'value' : ''}suffix`
 * @param loopArray - Name of the array being iterated (for @last / @first); when inside {{#each arr}}, use 'arr'.
 */
export const convertAttributeValue = (
  value: string,
  loopVar: string = 'item',
  loopArray?: string
): ConvertedAttributeValue => {
  const arrayName = loopArray || 'items';
  let result = value;
  let isExpression = false;
  
  // Helper to parse Handlebars helper expressions like (eq properties.layout "layout-1")
  const parseHelper = (expr: string): string => {
    // Match (eq left right) or (eq left "string")
    const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (eqMatch) {
      const [, left, right] = eqMatch;
      let leftExpr = left;
      if (left.startsWith('properties.')) {
        const parts = left.replace('properties.', '').split('.');
        leftExpr = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
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
        leftExpr = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
      }
      return `${leftExpr} !== "${right}"`;
    }
    
    return '';
  };
  
  // Helper to convert property reference or helper expression to JSX expression
  const propToExpr = (prop: string): string => {
    // Resolve ../properties.xxx (parent context in loops) to top-level camelCase
    prop = resolveParentPropertiesInExpression(prop);
    // Check if it's a helper expression like (eq ...)
    if (prop.startsWith('(')) {
      const parsed = parseHelper(prop);
      if (parsed) return parsed;
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
      return parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
    } else if (prop.startsWith('this.')) {
      return `${loopVar}.${prop.replace('this.', '')}`;
    } else {
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
  const convertInnerToExpr = (val: string): string => {
    // Check if val is JUST a property reference
    const justPropMatch = val.match(/^\{\{\s*([^}]+)\s*\}\}$/);
    if (justPropMatch) {
      return propToExpr(justPropMatch[1].trim());
    }
    
    // Check if val contains property references mixed with static text
    if (val.includes('{{')) {
      // Convert to template literal
      let expr = val;
      expr = expr.replace(/\{\{\s*properties\.([^}]+)\s*\}\}/g, (_: string, prop: string) => {
        const parts = prop.trim().split('.');
        const jsxProp = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
        return '${' + jsxProp + '}';
      });
      expr = expr.replace(/\{\{\s*this\.([^}]+)\s*\}\}/g, (_: string, prop: string) => {
        return '${' + loopVar + '.' + prop.trim() + '}';
      });
      expr = expr.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g, (_: string, prop: string) => {
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
  result = result.replace(
    /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_: string, condition: string, ifVal: string, elseVal: string) => {
      isExpression = true;
      const condExpr = propToExpr(normalizeWhitespace(condition));
      const ifExpr = convertInnerToExpr(collapseWhitespace(ifVal));
      const elseExpr = convertInnerToExpr(collapseWhitespace(elseVal));
      
      return '${' + condExpr + ' ? ' + ifExpr + ' : ' + elseExpr + '}';
    }
  );
  
  // Handle {{#if condition}}value{{/if}} pattern (no else)
  // Use [\s\S]*? to match across newlines
  result = result.replace(
    /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_: string, condition: string, ifVal: string) => {
      isExpression = true;
      const condExpr = propToExpr(normalizeWhitespace(condition));
      const ifExpr = convertInnerToExpr(collapseWhitespace(ifVal));
      
      return '${' + condExpr + ' ? ' + ifExpr + " : ''}";
    }
  );
  
  // Handle {{#unless @last}}value{{/unless}} pattern
  // Use [\s\S]*? to match across newlines
  result = result.replace(
    /\{\{#unless\s+@last\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_: string, unlessVal: string) => {
      isExpression = true;
      const unlessExpr = convertInnerToExpr(collapseWhitespace(unlessVal));
      // @last means it's NOT the last item, so we check index < array.length - 1
      return '${index < ' + arrayName + '?.length - 1 ? ' + unlessExpr + " : ''}";
    }
  );
  
  // Handle {{#unless @first}}value{{/unless}} pattern
  // Use [\s\S]*? to match across newlines
  result = result.replace(
    /\{\{#unless\s+@first\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_: string, unlessVal: string) => {
      isExpression = true;
      const unlessExpr = convertInnerToExpr(collapseWhitespace(unlessVal));
      // @first is true when index === 0, so unless @first means index !== 0
      return "${index !== 0 ? " + unlessExpr + " : ''}";
    }
  );
  
  // Handle {{#unless condition}}value{{/unless}} pattern (general)
  // Use [\s\S]*? to match across newlines
  result = result.replace(
    /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_: string, condition: string, unlessVal: string) => {
      isExpression = true;
      const condExpr = propToExpr(normalizeWhitespace(condition));
      const unlessExpr = convertInnerToExpr(collapseWhitespace(unlessVal));
      
      // unless is the opposite of if
      return '${!' + condExpr + ' ? ' + unlessExpr + " : ''}";
    }
  );
  
  // Also convert remaining {{properties.xxx}}
  if (result.includes('{{')) {
    result = result.replace(/\{\{\s*properties\.([^}]+)\s*\}\}/g, (_: string, prop: string) => {
      isExpression = true;
      const parts = prop.trim().split('.');
      const jsxProp = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
      return '${' + jsxProp + '}';
    });
  }

  // Convert remaining {{this.xxx}} (loop item references via this)
  if (result.includes('{{')) {
    result = result.replace(/\{\{\s*this\.([^}]+)\s*\}\}/g, (_: string, prop: string) => {
      isExpression = true;
      return '${' + loopVar + '.' + prop.trim() + '}';
    });
  }

  // Convert remaining general expressions (e.g. {{button.variant}}, {{item.label}})
  if (result.includes('{{')) {
    result = result.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)*)\s*\}\}/g, (_: string, prop: string) => {
      isExpression = true;
      return '${' + propToExpr(prop) + '}';
    });
  }
  
  return { jsxValue: result, isExpression };
};

/**
 * Pre-process conditional attributes (entire attribute wrapped in {{#if}})
 * Handles two patterns:
 *   1. {{#if condition}}attrName="value"{{/if}}  — attr with value
 *   2. {{#if condition}} attrName{{/if}}          — boolean attr (e.g. selected, disabled)
 * Both are converted to: attrName={condition ? value : undefined}
 */
export const preprocessConditionalAttributes = (template: string): string => {
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
      condExpr = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
    } else if (condition.startsWith('this.')) {
      condExpr = `item.${condition.replace('this.', '')}`;
    }
    
    // Convert attribute value to JSX expression
    let valueExpr: string;
    if (attrValue.includes('{{')) {
      // Value contains handlebars expression
      const propMatch = attrValue.match(/\{\{\s*properties\.([^}]+)\s*\}\}/);
      if (propMatch) {
        const parts = propMatch[1].trim().split('.');
        valueExpr = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
      } else {
        valueExpr = `'${attrValue}'`;
      }
    } else if (attrName === 'style') {
      // For conditional style attributes, convert CSS string to a React style object
      valueExpr = cssStringToReactObject(attrValue);
    } else {
      valueExpr = `'${attrValue}'`;
    }
    
    // Get JSX attribute name
    let jsxAttrName = attrName;
    if (attrName === 'class') {
      jsxAttrName = 'className';
    } else if (attrName === 'for') {
      jsxAttrName = 'htmlFor';
    } else {
      jsxAttrName = toJsxAttrName(attrName);
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
      condExpr = parts.map((p: string, i: number) => i === 0 ? toCamelCase(p) : p).join('?.');
    } else if (condition.startsWith('this.')) {
      condExpr = `item.${condition.replace('this.', '')}`;
    }
    
    const jsxAttrName = toJsxAttrName(attrName);
    const markerContent = `${condExpr} || undefined`;
    const replacement = ` ${jsxAttrName}="__COND_ATTR__${Buffer.from(markerContent).toString('base64')}__END_COND_ATTR__"`;
    
    result = result.substring(0, startPos) + replacement + result.substring(startPos + fullMatch.length);
    condBoolRegex.lastIndex = startPos + replacement.length;
  }
  
  return result;
};

/**
 * Pre-process attribute values that contain conditionals
 * This must run before preprocessBlocks to prevent if-markers from appearing inside attributes
 * @param currentLoopArray - When processing loop inner content, pass the array name so {{#unless @last}} etc. get the correct array (e.g. "ctas") instead of default "items"
 */
export const preprocessAttributeConditionals = (template: string, currentLoopArray?: string): string => {
  let result = template;
  
  // First handle conditional attributes (entire attribute wrapped in {{#if}})
  result = preprocessConditionalAttributes(result);
  
  // Find attributes that contain {{#if or {{#unless
  // We need to manually parse to handle nested quotes inside Handlebars expressions
  let pos = 0;
  while (pos < result.length) {
    // Find next attribute pattern: attrName="
    const attrStartMatch = result.substring(pos).match(/(\w+(?:-\w+)*)="/);
    if (!attrStartMatch) break;
    
    const attrName = attrStartMatch[1];
    const attrStart = pos + attrStartMatch.index!;
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
      } else if (char === '}' && nextChar === '}') {
        inHandlebars--;
        i++; // Skip next char
      } else if (char === '"' && inHandlebars === 0) {
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
      const { jsxValue, isExpression } = convertAttributeValue(attrValue, 'item', currentLoopArray);
      
      if (isExpression) {
        // Get the JSX attribute name
        let jsxAttrName = attrName;
        if (attrName === 'class') {
          jsxAttrName = 'className';
        } else if (attrName === 'for') {
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

/** Ensure className always receives a string (React warns on boolean). */
const ensureClassNameExpr = (jsxName: string, expr: string): string =>
  jsxName === 'className' ? `String(${expr} ?? '')` : expr;

/**
 * Convert HTML attributes to JSX attributes
 */
export const convertAttributes = (element: HTMLElement, context: TranspilerContext): string => {
  const attrs: string[] = [];
  const loopVar = context.loopVariable || 'item';
  
  for (const [name, value] of Object.entries(element.attributes)) {
    // Check for conditional attribute marker FIRST — applies to any attribute including style.
    // preprocessConditionalAttributes encodes {{#if cond}}attrName="value"{{/if}} into this marker.
    if (value.includes('__COND_ATTR__')) {
      const condMatch = value.match(/__COND_ATTR__([A-Za-z0-9+/=]+)__END_COND_ATTR__/);
      if (condMatch) {
        const decoded = Buffer.from(condMatch[1], 'base64').toString();
        const jsxAttrForCond = name === 'class' ? 'className' : name === 'for' ? 'htmlFor' : toJsxAttrName(name);
        attrs.push(`${jsxAttrForCond}={${ensureClassNameExpr(jsxAttrForCond, decoded)}}`);
        continue;
      }
    }

    // Convert style to object (special handling)
    if (name === 'style') {
      const styleObj = parseStyleToObject(value, context);
      attrs.push(`style=${styleObj}`);
      continue;
    }
    
    // Get the JSX attribute name
    const jsxName = toJsxAttrName(name);
    
    // Check if value contains block conditionals {{#if...}}
    if (value.includes('{{#if')) {
      const { jsxValue, isExpression } = convertAttributeValue(value, loopVar, context.loopArray);
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
        const expr = transpileExpression(match[1], context, loopVar);
        attrs.push(`href={${expr} || '#'}`);
        continue;
      }
    }
    
    // Handle src with handlebars
    if (name === 'src' && value.includes('{{')) {
      const match = value.match(/\{\{+\s*([^}]+?)\s*\}+\}/);
      if (match) {
        const expr = transpileExpression(match[1], context, loopVar);
        attrs.push(`src={${expr}}`);
        continue;
      }
    }
    
    // Handle other attributes with handlebars (including simple expressions)
    if (value.includes('{{')) {
      const { jsxValue, isExpression } = convertAttributeValue(value, loopVar, context.loopArray);
      if (isExpression) {
        // Check if it's a pure expression or needs template literal
        if (jsxValue.startsWith('${') && jsxValue.endsWith('}') && !jsxValue.includes('${', 2)) {
          // Simple expression like ${prop} - extract just the expression
          const expr = jsxValue.slice(2, -1);
          attrs.push(`${jsxName}={${ensureClassNameExpr(jsxName, expr)}}`);
        } else {
          // Template literal with static parts or multiple expressions
          const wrapped = jsxName === 'className' ? jsxValue.replace(/\$\{([^}]+)\}/g, (_, e) => `\${String(${e} ?? '')}`) : jsxValue;
          attrs.push(`${jsxName}={\`${wrapped}\`}`);
        }
        continue;
      }
      
      // Fallback for simple Handlebars expression
      const match = value.match(/\{\{+\s*([^}]+?)\s*\}+\}/);
      if (match) {
        const expr = transpileExpression(match[1], context, loopVar);
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
