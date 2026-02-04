/**
 * Template preprocessing utilities for the Handlebars to JSX transpiler
 */

import { HandoffProperty } from '../../types';
import { toCamelCase, findMatchingClose, isInsideAttribute } from './utils';
import { parseHelperExpression } from './expression-parser';
import { lookupFieldType } from './field-lookup';
import { preprocessAttributeConditionals } from './attributes';

/**
 * Preprocess {{#field "path"}}content{{/field}} into field markers
 * These will be converted to RichText components in postprocessing
 * Only creates markers for text/richtext fields that are NOT inside attribute values
 */
export const preprocessFields = (template: string, properties: Record<string, HandoffProperty>): string => {
  let result = template;
  
  // Match {{#field "path"}}content{{/field}} or {{#field path}}content{{/field}}
  const fieldRegex = /\{\{\s*#field\s+["']?([^"'\}]+)["']?\s*\}\}([\s\S]*?)\{\{\s*\/field\s*\}\}/g;
  
  let match;
  while ((match = fieldRegex.exec(result)) !== null) {
    const fieldPath = match[1].trim();
    const content = match[2];
    const fullMatch = match[0];
    const startPos = match.index;
    
    // Skip fields that are inside attribute values (like href, src, etc.)
    // These should just have their content preserved, not be made editable
    if (isInsideAttribute(result, startPos)) {
      // Just keep the content, strip the field tags
      result = result.substring(0, startPos) + content + result.substring(startPos + fullMatch.length);
      fieldRegex.lastIndex = startPos + content.length;
      continue;
    }
    
    // Look up the field type
    const fieldType = lookupFieldType(fieldPath, properties);
    
    // Create editable markers for supported field types that resolve to known properties
    // If fieldType is null, the field path doesn't resolve - just output the content as-is (non-editable)
    if (fieldType === 'text' || fieldType === 'richtext' || fieldType === 'image') {
      // Encode field info in marker
      const fieldInfo = Buffer.from(JSON.stringify({
        path: fieldPath,
        type: fieldType,
        content: content.trim()
      })).toString('base64');
      
      const replacement = `<editable-field-marker data-field="${fieldInfo}"></editable-field-marker>`;
      
      result = result.substring(0, startPos) + replacement + result.substring(startPos + fullMatch.length);
      fieldRegex.lastIndex = startPos + replacement.length;
    } else {
      // For unsupported field types OR unresolved field paths (fieldType === null),
      // just keep the content without making it editable
      result = result.substring(0, startPos) + content + result.substring(startPos + fullMatch.length);
      fieldRegex.lastIndex = startPos + content.length;
    }
  }
  
  return result;
};

/**
 * Clean and preprocess the Handlebars template
 */
export const cleanTemplate = (template: string): string => {
  let cleaned = template;
  
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
  
  // Pre-process attribute conditionals before they get converted to markers
  cleaned = preprocessAttributeConditionals(cleaned);
  
  return cleaned.trim();
};

/**
 * Helper function to process if blocks with optional else/else-if
 */
const processIfBlock = (condition: string, inner: string, startPos: number, fullMatch: string): string => {
  // Find top-level {{else if ...}} or {{else}} in the inner content
  // We need to track nesting depth to only find the ones that belong to this if block
  let depth = 0;
  let searchPos = 0;
  let foundElse: { type: 'else' | 'elseif', pos: number, condition?: string, length: number } | null = null;
  
  while (searchPos < inner.length) {
    const nextIf = inner.indexOf('{{#if', searchPos);
    const nextElseIf = inner.indexOf('{{else if', searchPos);
    const nextElse = inner.indexOf('{{else}}', searchPos);
    const nextEndIf = inner.indexOf('{{/if}}', searchPos);
    
    // Find the earliest occurrence
    const positions: Array<{ type: 'if' | 'elseif' | 'else' | 'endif', pos: number }> = [];
    if (nextIf !== -1) positions.push({ type: 'if', pos: nextIf });
    if (nextElseIf !== -1) positions.push({ type: 'elseif', pos: nextElseIf });
    if (nextElse !== -1) positions.push({ type: 'else', pos: nextElse });
    if (nextEndIf !== -1) positions.push({ type: 'endif', pos: nextEndIf });
    
    positions.sort((a, b) => a.pos - b.pos);
    
    if (positions.length === 0) break;
    
    const first = positions[0];
    
    if (first.type === 'if') {
      depth++;
      searchPos = first.pos + 5;
    } else if (first.type === 'endif') {
      depth--;
      searchPos = first.pos + 7;
    } else if (first.type === 'elseif' && depth === 0) {
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
    } else if (first.type === 'else' && depth === 0) {
      // Found {{else}} at top level
      foundElse = {
        type: 'else',
        pos: first.pos,
        length: '{{else}}'.length
      };
      break;
    } else {
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
        const parsed = parseHelperExpression(elseIfCondition);
        if (parsed) {
          elseIfCondition = parsed;
        }
      } else if (elseIfCondition.startsWith('properties.')) {
        // Simple property check
        elseIfCondition = toCamelCase(elseIfCondition.replace('properties.', ''));
      } else if (elseIfCondition.startsWith('this.')) {
        elseIfCondition = `item.${elseIfCondition.replace('this.', '')}`;
      }
      
      // Recursively process the remaining content as if it were an if block
      // This will handle nested else-if chains and the final else
      const nestedMarker = processIfBlock(elseIfCondition, remainingContent, 0, '');
      const nestedMarkerEscaped = Buffer.from(nestedMarker).toString('base64');
      
      return `<if-elseif-marker data-condition="${condEscaped}" data-if-content="${ifEscaped}" data-nested-marker="${nestedMarkerEscaped}"></if-elseif-marker>`;
    } else {
      // Plain else
      const elseEscaped = Buffer.from(remainingContent).toString('base64');
      return `<if-else-marker data-condition="${condEscaped}" data-if-content="${ifEscaped}" data-else-content="${elseEscaped}"></if-else-marker>`;
    }
  } else {
    // No else, just if content
    const escaped = Buffer.from(inner).toString('base64');
    return `<if-marker data-condition="${condEscaped}" data-content="${escaped}"></if-marker>`;
  }
};

/**
 * Pre-process template to handle block helpers before HTML parsing
 * Uses iterative approach to handle nested blocks properly
 */
export const preprocessBlocks = (template: string): string => {
  let result = template;
  
  // Process {{#each properties.xxx.yyy as |alias|}} or {{#each properties.xxx as |alias index|}} blocks with named alias FIRST
  // Now handles nested paths like properties.jumpNav.links
  let eachMatch;
  // Updated regex to capture nested paths (e.g., jumpNav.links) and handle both |alias| and |alias index| patterns
  const eachAliasRegex = /\{\{#each\s+properties\.([\w.]+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g;
  while ((eachMatch = eachAliasRegex.exec(result)) !== null) {
    const startPos = eachMatch.index;
    const openTagEnd = startPos + eachMatch[0].length;
    const closePos = findMatchingClose(result, '{{#each', '{{/each}}', openTagEnd);
    
    if (closePos !== -1) {
      const propPath = eachMatch[1]; // e.g., "jumpNav.links" or just "items"
      const aliasName = eachMatch[2];
      const inner = result.substring(openTagEnd, closePos);
      // Convert the path to camelCase for each segment
      const camelPath = propPath.split('.').map(segment => toCamelCase(segment)).join('.');
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
    const closePos = findMatchingClose(result, '{{#each', '{{/each}}', openTagEnd);
    
    if (closePos !== -1) {
      const propPath = eachMatch[1]; // e.g., "jumpNav.links" or just "items"
      const inner = result.substring(openTagEnd, closePos);
      // Convert the path to camelCase for each segment
      const camelPath = propPath.split('.').map(segment => toCamelCase(segment)).join('.');
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
    const closePos = findMatchingClose(result, '{{#each', '{{/each}}', openTagEnd);
    
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
    const closePos = findMatchingClose(result, '{{#each', '{{/each}}', openTagEnd);
    
    if (closePos !== -1) {
      const propName = eachMatch[1];
      const inner = result.substring(openTagEnd, closePos);
      const escaped = Buffer.from(inner).toString('base64');
      const replacement = `<nested-loop-marker data-prop="${propName}" data-content="${escaped}"></nested-loop-marker>`;
      
      result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/each}}'.length);
      eachThisRegex.lastIndex = startPos + replacement.length;
    }
  }
  
  // Process {{#unless @last}} blocks
  const unlessLastRegex = /\{\{#unless\s+@last\}\}/g;
  let unlessMatch;
  while ((unlessMatch = unlessLastRegex.exec(result)) !== null) {
    const startPos = unlessMatch.index;
    const openTagEnd = startPos + unlessMatch[0].length;
    const closePos = findMatchingClose(result, '{{#unless', '{{/unless}}', openTagEnd);
    
    if (closePos !== -1) {
      const inner = result.substring(openTagEnd, closePos);
      const escaped = Buffer.from(inner).toString('base64');
      const replacement = `<unless-last-marker data-content="${escaped}"></unless-last-marker>`;
      
      result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/unless}}'.length);
      unlessLastRegex.lastIndex = startPos + replacement.length;
    }
  }
  
  // Process {{#unless @first}} blocks
  const unlessFirstRegex = /\{\{#unless\s+@first\}\}/g;
  while ((unlessMatch = unlessFirstRegex.exec(result)) !== null) {
    const startPos = unlessMatch.index;
    const openTagEnd = startPos + unlessMatch[0].length;
    const closePos = findMatchingClose(result, '{{#unless', '{{/unless}}', openTagEnd);
    
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
    const closePos = findMatchingClose(result, '{{#if', '{{/if}}', openTagEnd);
    
    if (closePos !== -1) {
      const helperExpr = ifHelperMatch[1];
      const parsedCondition = parseHelperExpression(helperExpr);
      // Use the parsed condition or fall back to the original if parsing failed
      const condition = parsedCondition || helperExpr;
      const inner = result.substring(openTagEnd, closePos);
      const replacement = processIfBlock(condition, inner, startPos, ifHelperMatch[0]);
      
      result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
      ifHelperRegex.lastIndex = startPos + replacement.length;
    }
  }
  
  // Process {{#if this.xxx}} blocks (conditionals on loop item properties)
  const ifThisRegex = /\{\{#if\s+(this\.[^}]+)\}\}/g;
  let ifThisMatch;
  while ((ifThisMatch = ifThisRegex.exec(result)) !== null) {
    const startPos = ifThisMatch.index;
    const openTagEnd = startPos + ifThisMatch[0].length;
    const closePos = findMatchingClose(result, '{{#if', '{{/if}}', openTagEnd);
    
    if (closePos !== -1) {
      const condition = ifThisMatch[1];
      const inner = result.substring(openTagEnd, closePos);
      const replacement = processIfBlock(condition, inner, startPos, ifThisMatch[0]);
      
      result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
      ifThisRegex.lastIndex = startPos + replacement.length;
    }
  }
  
  // Process {{#if properties.xxx}} blocks (conditionals on top-level properties)
  const ifPropsRegex = /\{\{#if\s+(properties\.[^}]+)\}\}/g;
  let ifPropsMatch;
  while ((ifPropsMatch = ifPropsRegex.exec(result)) !== null) {
    const startPos = ifPropsMatch.index;
    const openTagEnd = startPos + ifPropsMatch[0].length;
    const closePos = findMatchingClose(result, '{{#if', '{{/if}}', openTagEnd);
    
    if (closePos !== -1) {
      const condition = ifPropsMatch[1];
      const inner = result.substring(openTagEnd, closePos);
      const replacement = processIfBlock(condition, inner, startPos, ifPropsMatch[0]);
      
      result = result.substring(0, startPos) + replacement + result.substring(closePos + '{{/if}}'.length);
      ifPropsRegex.lastIndex = startPos + replacement.length;
    }
  }
  
  return result;
};
