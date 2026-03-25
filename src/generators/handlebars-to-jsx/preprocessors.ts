/**
 * Template preprocessing utilities for the Handlebars to JSX transpiler
 */

import { HandoffProperty } from '../../types';
import { toCamelCase, findMatchingClose, isInsideAttribute } from './utils';
import { parseHelperExpression } from './expression-parser';
import { lookupFieldType } from './field-lookup';
import { preprocessAttributeConditionals } from './attributes';

/** Supported inline-editable field types */
const INLINE_EDITABLE_TYPES = new Set(['text', 'richtext', 'image', 'link', 'button']);

export interface PreprocessFieldsResult {
  template: string;
  /** Field paths that were converted to inline-editable markers */
  inlineEditableFields: Set<string>;
}

/**
 * Preprocess {{#field "path"}}content{{/field}} into field markers
 * These will be converted to RichText/Image/LinkControl components in postprocessing
 * Only creates markers for supported field types that are NOT inside attribute values
 */
export const preprocessFields = (template: string, properties: Record<string, HandoffProperty>): PreprocessFieldsResult => {
  let result = template ?? '';
  const inlineEditableFields = new Set<string>();
  
  // Match {{#field "path"}} or {{#field path}} opening tags, then use
  // nesting-aware matching to find the correct closing {{/field}}.
  const fieldOpenRegex = /\{\{\s*#field\s+["']?([^"'\}]+)["']?\s*\}\}/g;
  
  let match;
  while ((match = fieldOpenRegex.exec(result)) !== null) {
    const fieldPath = match[1].trim();
    const startPos = match.index;
    const openTagEnd = startPos + match[0].length;
    
    // Use nesting-aware matching to handle nested {{#field}} blocks
    const closePos = findMatchingClose(result, '{{#field', '{{/field}}', openTagEnd);
    if (closePos === -1) continue;
    
    const content = result.substring(openTagEnd, closePos);
    const fullMatchEnd = closePos + '{{/field}}'.length;
    
    // Skip fields that are inside attribute values (like href, src, etc.)
    if (isInsideAttribute(result, startPos)) {
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
    
    const fieldType = lookupFieldType(fieldPath, properties);
    
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
    } else {
      result = result.substring(0, startPos) + content + result.substring(fullMatchEnd);
      fieldOpenRegex.lastIndex = startPos + content.length;
    }
  }
  
  return { template: result, inlineEditableFields };
};

/**
 * Clean and preprocess the Handlebars template
 * @param currentLoopArray - When processing loop inner content, pass the array name so attribute conditionals (e.g. {{#unless @last}}) get the correct array name
 */
export const cleanTemplate = (template: string, currentLoopArray?: string): string => {
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
  
  // Run attribute conditionals BEFORE preprocessBlocks so {{#if}} etc. inside attribute values (e.g. className="x {{#if prop}}y{{/if}}") get converted to template literals instead of becoming raw <if-marker> tags inside the attribute.
  cleaned = preprocessAttributeConditionals(cleaned, currentLoopArray);
  // When processing the full template (no currentLoopArray), run preprocessBlocks so {{#each}} become markers and block-level {{#if}} become if-markers. Attributes have already been converted so they won't contain markers.
  if (currentLoopArray === undefined) {
    cleaned = preprocessBlocks(cleaned);
  }
  
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
      } else {
        // Bare identifier/path — normalize to properties.xxx so transpileExpression handles camelCase + optional chaining
        elseIfCondition = `properties.${elseIfCondition}`;
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
 * @param template - Template string
 * @param currentLoopArray - When processing inner content of {{#each properties.xxx}}, pass the array name (e.g. "ctas") so {{#unless @last}} markers get data-array for correct expansion at replace time
 */
export const preprocessBlocks = (template: string, currentLoopArray?: string): string => {
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
  
  // Process {{#unless @last}} blocks (optionally embed current loop array for correct expansion when marker is replaced without loop context)
  // Skip when inside an attribute value (e.g. class="...{{#unless @last}}...") so convertAttributeValue can convert it with the correct loopArray
  const unlessLastRegex = /\{\{#unless\s+@last\}\}/g;
  let unlessMatch;
  const dataArrayAttr = currentLoopArray ? ` data-array="${currentLoopArray}"` : '';
  while ((unlessMatch = unlessLastRegex.exec(result)) !== null) {
    const startPos = unlessMatch.index;
    if (isInsideAttribute(result, startPos)) continue;
    const openTagEnd = startPos + unlessMatch[0].length;
    const closePos = findMatchingClose(result, '{{#unless', '{{/unless}}', openTagEnd);

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
  
  // Normalize {{#if ../properties.xxx}} to {{#if properties.xxx}} (parent context in loops)
  result = result.replace(/\{\{#if\s+\.\.\/+(properties\.[^}]+)\}\}/g, '{{#if $1}}');

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
  
  // Catch-all: Process any remaining {{#if xxx}} blocks not matched by the specific patterns above
  const ifGenericRegex = /\{\{#if\s+([^}]+)\}\}/g;
  let ifGenericMatch;
  while ((ifGenericMatch = ifGenericRegex.exec(result)) !== null) {
    const startPos = ifGenericMatch.index;
    const openTagEnd = startPos + ifGenericMatch[0].length;
    const closePos = findMatchingClose(result, '{{#if', '{{/if}}', openTagEnd);
    
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
