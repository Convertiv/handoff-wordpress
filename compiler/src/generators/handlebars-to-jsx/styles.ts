/**
 * Style parsing utilities for the Handlebars to JSX transpiler
 */

import { TranspilerContext } from './types';
import { toCamelCase, cssToCamelCase } from './utils';

/**
 * Convert a static CSS string (e.g. "display: block; color: red;") to a React inline style object
 * literal string (e.g. "{ display: 'block', color: 'red' }"). Used when a conditional wraps an
 * entire style attribute so the value expression needs to be a React object, not a CSS string.
 */
export const cssStringToReactObject = (cssStr: string): string => {
  const props = cssStr
    .split(';')
    .filter(s => s.trim())
    .map(s => {
      const colonIdx = s.indexOf(':');
      if (colonIdx === -1) return null;
      const prop = cssToCamelCase(s.substring(0, colonIdx).trim());
      const val = s.substring(colonIdx + 1).trim();
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        return `${prop}: ${val}`;
      }
      return `${prop}: '${val.replace(/'/g, "\\'")}'`;
    })
    .filter(Boolean)
    .join(', ');
  return `{ ${props} }`;
};

/**
 * Parse a CSS style string into a React style object string
 */
export const parseStyleToObject = (styleStr: string, context: TranspilerContext): string => {
  // Check for handlebars expressions in the style
  if (styleStr.includes('{{')) {
    // Handle background-image with handlebars
    if (styleStr.includes('background-image')) {
      const match = styleStr.match(/background-image:\s*url\(['"]?\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}['"]?\)/);
      if (match) {
        const [, prop, field] = match;
        const camelProp = toCamelCase(prop);
        // Keep 'src' as-is to match Handoff's image property naming
        return `{{ backgroundImage: ${camelProp}?.${field} ? \`url('\${${camelProp}.${field}}')\` : undefined }}`;
      }
    }
    
    // Handle opacity with handlebars — preserve the expression as-is
    if (styleStr.includes('opacity')) {
      const opacityMatch = styleStr.match(/opacity:\s*\{\{\s*(.+?)\s*\}\}/);
      if (opacityMatch) {
        return `{{ opacity: ${opacityMatch[1]} }}`;
      }
    }
  }
  
  // Parse static styles
  const styles = styleStr.split(';')
    .filter(s => s.trim())
    .map(s => {
      const colonIndex = s.indexOf(':');
      if (colonIndex === -1) return null;
      const prop = s.substring(0, colonIndex).trim();
      const val = s.substring(colonIndex + 1).trim();
      const camelProp = cssToCamelCase(prop);
      
      // Numeric values don't need quotes
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        return `${camelProp}: ${val}`;
      }
      
      // If value contains single quotes (like url('...')), use double quotes for the wrapper
      // or escape the inner single quotes
      if (val.includes("'")) {
        // Use double quotes to wrap the value
        return `${camelProp}: "${val}"`;
      }
      
      return `${camelProp}: '${val}'`;
    })
    .filter(Boolean)
    .join(', ');
  
  return `{{ ${styles} }}`;
};
