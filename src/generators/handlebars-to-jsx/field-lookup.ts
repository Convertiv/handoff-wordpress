/**
 * Field lookup utilities for the Handlebars to JSX transpiler
 */

import { HandoffProperty } from '../../types';
import { toCamelCase } from './utils';

/**
 * Look up a field type from the properties object using dot notation path
 * e.g., "title" -> properties.title.type
 * e.g., "button.text" -> properties.button.properties.text.type
 * e.g., "breadcrumbs.label" -> properties.breadcrumbs.items.properties.label.type
 * 
 * Returns null if the field path doesn't resolve to a known property.
 * This allows callers to decide how to handle unresolved fields.
 */
export const lookupFieldType = (fieldPath: string, properties: Record<string, HandoffProperty>): string | null => {
  const parts = fieldPath.split('.');
  
  if (parts.length === 1) {
    // Top-level field
    const prop = properties[parts[0]] || properties[toCamelCase(parts[0])];
    if (!prop) {
      return null; // Field not found
    }
    return prop.type || 'text';
  }
  
  // Nested field - traverse the path
  let current: any = properties;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const camelPart = toCamelCase(part);
    
    // Try both original and camelCase
    let next = current[part] || current[camelPart];
    
    if (!next && current.properties) {
      next = current.properties[part] || current.properties[camelPart];
    }
    
    if (!next) {
      return null; // Field not found at this level
    }
    
    // If this is the last part, return its type
    if (i === parts.length - 1) {
      return next.type || 'text';
    }
    
    // Navigate deeper
    if (next.type === 'array' && next.items?.properties) {
      current = next.items.properties;
    } else if (next.type === 'object' && next.properties) {
      current = next.properties;
    } else if (next.properties) {
      current = next.properties;
    } else {
      current = next;
    }
  }
  
  return null; // Path didn't fully resolve
};
