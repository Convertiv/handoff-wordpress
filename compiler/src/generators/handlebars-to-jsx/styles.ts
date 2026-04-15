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
 * Convert a Handlebars property reference (e.g. "properties.overlay-opacity")
 * to a camelCase JS variable, stripping the "properties." prefix.
 */
const resolvePropertyRef = (raw: string): string => {
  let ref = raw.trim();
  while (ref.startsWith('../')) ref = ref.substring(3);
  if (ref.startsWith('properties.')) {
    const parts = ref.replace('properties.', '').split('.');
    const propName = toCamelCase(parts[0]);
    return parts.length > 1 ? `${propName}?.${parts.slice(1).join('.')}` : propName;
  }
  return toCamelCase(ref);
};

/**
 * Parse a CSS style string into a React style object string.
 * Handles mixed static and dynamic (Handlebars) values per-property.
 */
export const parseStyleToObject = (styleStr: string, context: TranspilerContext): string => {
  const styles = styleStr.split(';')
    .filter(s => s.trim())
    .map(s => {
      const colonIndex = s.indexOf(':');
      if (colonIndex === -1) return null;
      const prop = s.substring(0, colonIndex).trim();
      const val = s.substring(colonIndex + 1).trim();
      const camelProp = cssToCamelCase(prop);

      // background-image with Handlebars image property references (supports multiple url() values)
      if (prop === 'background-image') {
        const urlRegex = /url\(['"]?\{\{\s*(.+?)\s*\}\}['"]?\)/g;
        const matches = [...val.matchAll(urlRegex)];
        if (matches.length > 0) {
          const refs = matches.map(m => resolvePropertyRef(m[1]));
          const parts = refs.map(ref => `${ref} ? \`url('\${${ref}}')\` : null`);
          return `backgroundImage: [${parts.join(', ')}].filter(Boolean).join(', ') || undefined`;
        }
      }

      // Value is a simple Handlebars expression → resolve to JS variable
      const hbsMatch = val.match(/^\{\{\s*(.+?)\s*\}\}$/);
      if (hbsMatch) {
        return `${camelProp}: ${resolvePropertyRef(hbsMatch[1])}`;
      }

      // Numeric values don't need quotes
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        return `${camelProp}: ${val}`;
      }

      // If value contains single quotes (like url('...')), use double quotes
      if (val.includes("'")) {
        return `${camelProp}: "${val}"`;
      }

      return `${camelProp}: '${val}'`;
    })
    .filter(Boolean)
    .join(', ');

  return `{{ ${styles} }}`;
};
