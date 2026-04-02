/**
 * Property Manifest - Tracks property names across compilations
 * to detect breaking changes to WordPress data structures
 */

import * as fs from 'fs';
import * as path from 'path';
import { HandoffComponent, HandoffProperty } from '../types';

/**
 * Recursive property schema that fully describes nested structures
 */
export interface PropertySchema {
  type: string;
  properties?: Record<string, PropertySchema>; // For objects
  items?: PropertySchema; // For arrays (describes the array item structure)
}

export interface PropertyManifestEntry {
  componentId: string;
  componentTitle: string;
  properties: Record<string, PropertySchema>;
  lastUpdated: string;
}

export interface PropertyManifest {
  version: string;
  components: Record<string, PropertyManifestEntry>;
}

export interface PropertyChange {
  type: 'added' | 'removed' | 'type_changed';
  propertyPath: string;
  oldType?: string;
  newType?: string;
  message: string;
}

export interface ValidationResult {
  componentId: string;
  componentTitle: string;
  isValid: boolean;
  changes: PropertyChange[];
  isNew: boolean;
}

const MANIFEST_FILENAME = 'property-manifest.json';

/**
 * Load the property manifest from disk
 */
export const loadManifest = (outputDir: string): PropertyManifest => {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  
  if (!fs.existsSync(manifestPath)) {
    return {
      version: '1.0.0',
      components: {}
    };
  }
  
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as PropertyManifest;
  } catch (error) {
    console.warn(`⚠️  Could not parse manifest file, starting fresh`);
    return {
      version: '1.0.0',
      components: {}
    };
  }
};

/**
 * Save the property manifest to disk
 */
export const saveManifest = (outputDir: string, manifest: PropertyManifest): void => {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
};

/**
 * Recursively extract property schema from a HandoffProperty
 */
const extractPropertySchema = (prop: HandoffProperty): PropertySchema => {
  const schema: PropertySchema = {
    type: prop.type
  };
  
  // Handle object type - descend into properties
  if (prop.type === 'object' && prop.properties) {
    schema.properties = {};
    for (const [key, nestedProp] of Object.entries(prop.properties)) {
      schema.properties[key] = extractPropertySchema(nestedProp);
    }
  }
  
  // Handle array type - descend into items.properties
  if (prop.type === 'array') {
    // Arrays have item structure defined in items.properties or properties
    const itemProperties = prop.items?.properties || prop.properties;
    if (itemProperties) {
      schema.items = {
        type: 'object',
        properties: {}
      };
      for (const [key, nestedProp] of Object.entries(itemProperties)) {
        schema.items.properties![key] = extractPropertySchema(nestedProp);
      }
    }
  }
  
  return schema;
};

/**
 * Extract all property schemas from a component
 */
const extractProperties = (properties: Record<string, HandoffProperty>): Record<string, PropertySchema> => {
  const result: Record<string, PropertySchema> = {};
  
  for (const [key, prop] of Object.entries(properties)) {
    result[key] = extractPropertySchema(prop);
  }
  
  return result;
};

/**
 * Recursively compare two property schemas and collect changes
 */
const compareSchemas = (
  oldSchema: PropertySchema | undefined,
  newSchema: PropertySchema | undefined,
  path: string,
  changes: PropertyChange[]
): boolean => {
  let isValid = true;
  
  // Property was removed
  if (oldSchema && !newSchema) {
    isValid = false;
    changes.push({
      type: 'removed',
      propertyPath: path,
      oldType: oldSchema.type,
      message: `Property "${path}" was removed. This will break existing content.`
    });
    return isValid;
  }
  
  // Property was added
  if (!oldSchema && newSchema) {
    changes.push({
      type: 'added',
      propertyPath: path,
      newType: newSchema.type,
      message: `New property "${path}" (${newSchema.type}) was added.`
    });
    return isValid;
  }
  
  // Both exist - compare types
  if (oldSchema && newSchema) {
    if (oldSchema.type !== newSchema.type) {
      isValid = false;
      changes.push({
        type: 'type_changed',
        propertyPath: path,
        oldType: oldSchema.type,
        newType: newSchema.type,
        message: `Property "${path}" type changed from "${oldSchema.type}" to "${newSchema.type}". This may break existing content.`
      });
      // Don't descend further if type changed
      return isValid;
    }
    
    // Compare nested properties for objects
    if (oldSchema.properties || newSchema.properties) {
      const oldProps = oldSchema.properties || {};
      const newProps = newSchema.properties || {};
      const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
      
      for (const key of allKeys) {
        const nestedValid = compareSchemas(
          oldProps[key],
          newProps[key],
          `${path}.${key}`,
          changes
        );
        if (!nestedValid) isValid = false;
      }
    }
    
    // Compare array item structure
    if (oldSchema.items || newSchema.items) {
      // Compare the items schema recursively
      if (oldSchema.items && newSchema.items) {
        // Compare item properties
        const oldItemProps = oldSchema.items.properties || {};
        const newItemProps = newSchema.items.properties || {};
        const allKeys = new Set([...Object.keys(oldItemProps), ...Object.keys(newItemProps)]);
        
        for (const key of allKeys) {
          const nestedValid = compareSchemas(
            oldItemProps[key],
            newItemProps[key],
            `${path}[].${key}`,
            changes
          );
          if (!nestedValid) isValid = false;
        }
      } else if (oldSchema.items && !newSchema.items) {
        // Array item structure was removed
        isValid = false;
        changes.push({
          type: 'removed',
          propertyPath: `${path}[]`,
          message: `Array item structure for "${path}" was removed. This will break existing content.`
        });
      } else if (!oldSchema.items && newSchema.items) {
        // Array item structure was added
        changes.push({
          type: 'added',
          propertyPath: `${path}[]`,
          message: `Array item structure for "${path}" was added.`
        });
      }
    }
  }
  
  return isValid;
};

/**
 * Compare current properties against the manifest
 */
export const validateComponent = (
  component: HandoffComponent,
  manifest: PropertyManifest
): ValidationResult => {
  const componentId = component.id;
  const currentProperties = extractProperties(component.properties);
  const existingEntry = manifest.components[componentId];
  
  const result: ValidationResult = {
    componentId,
    componentTitle: component.title,
    isValid: true,
    changes: [],
    isNew: !existingEntry
  };
  
  if (!existingEntry) {
    // New component, no breaking changes possible
    return result;
  }
  
  const oldProperties = existingEntry.properties;
  
  // Get all top-level property keys
  const allKeys = new Set([
    ...Object.keys(oldProperties),
    ...Object.keys(currentProperties)
  ]);
  
  // Compare each property recursively
  for (const key of allKeys) {
    const isKeyValid = compareSchemas(
      oldProperties[key],
      currentProperties[key],
      key,
      result.changes
    );
    if (!isKeyValid) {
      result.isValid = false;
    }
  }
  
  return result;
};

/**
 * Update the manifest with the current component properties
 */
export const updateManifest = (
  component: HandoffComponent,
  manifest: PropertyManifest
): PropertyManifest => {
  const entry: PropertyManifestEntry = {
    componentId: component.id,
    componentTitle: component.title,
    properties: extractProperties(component.properties),
    lastUpdated: new Date().toISOString()
  };
  
  return {
    ...manifest,
    components: {
      ...manifest.components,
      [component.id]: entry
    }
  };
};

/**
 * Format validation results for console output
 */
export const formatValidationResult = (result: ValidationResult): string => {
  const lines: string[] = [];
  
  if (result.isNew) {
    lines.push(`📦 ${result.componentTitle} (${result.componentId})`);
    lines.push(`   ✨ New component - will be added to manifest on compilation`);
    return lines.join('\n');
  }
  
  const icon = result.isValid ? '✅' : '❌';
  lines.push(`${icon} ${result.componentTitle} (${result.componentId})`);
  
  if (result.changes.length === 0) {
    lines.push(`   No property changes detected`);
  } else {
    // Group changes by type for cleaner output
    const breaking = result.changes.filter(c => c.type === 'removed' || c.type === 'type_changed');
    const additions = result.changes.filter(c => c.type === 'added');
    
    if (breaking.length > 0) {
      lines.push(`   🚨 Breaking Changes:`);
      for (const change of breaking) {
        const changeIcon = change.type === 'removed' ? '🗑️' : '⚠️';
        lines.push(`      ${changeIcon} ${change.message}`);
      }
    }
    
    if (additions.length > 0) {
      lines.push(`   ➕ Additions:`);
      for (const change of additions) {
        lines.push(`      ${change.message}`);
      }
    }
  }
  
  return lines.join('\n');
};
