/**
 * Style parsing utilities for the Handlebars to JSX transpiler
 */

import { TranspilerContext } from './types';
import { toCamelCase, cssToCamelCase } from './utils';

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
    
    // Handle opacity with handlebars
    if (styleStr.includes('opacity')) {
      return `{{ opacity: overlayOpacity || 0.6 }}`;
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
      
      // Special handling for opacity - make it dynamic
      if (prop === 'opacity') {
        return `${camelProp}: overlayOpacity || 0.6`;
      }
      
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
