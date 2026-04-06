/**
 * Schema History - Tracks property schemas across compilations with
 * versioned history to detect breaking changes and enable automatic
 * Gutenberg block deprecation generation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { HandoffComponent, HandoffProperty } from '../types';

/**
 * Recursive property schema that fully describes nested structures
 */
export interface PropertySchema {
  type: string;
  properties?: Record<string, PropertySchema>;
  items?: PropertySchema;
}

export interface SchemaHistoryVersion {
  version: number;
  schema: Record<string, PropertySchema>;
  changedAt: string;
  changes: PropertyChange[];
}

export interface SchemaHistoryEntry {
  componentId: string;
  componentTitle: string;
  schemaVersion: number;
  current: Record<string, PropertySchema>;
  lastUpdated: string;
  history: SchemaHistoryVersion[];
}

export interface SchemaHistory {
  version: string;
  components: Record<string, SchemaHistoryEntry>;
}

/** @deprecated Kept for backward-compat loading of old property-manifest.json */
export interface PropertyManifestEntry {
  componentId: string;
  componentTitle: string;
  properties: Record<string, PropertySchema>;
  lastUpdated: string;
}

/** @deprecated Kept for backward-compat loading of old property-manifest.json */
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

const HISTORY_FILENAME = 'schema-history.json';
const LEGACY_FILENAME = 'property-manifest.json';

/**
 * Load the schema history from disk, migrating from the legacy format if needed.
 */
export const loadManifest = (outputDir: string): SchemaHistory => {
  const historyPath = path.join(outputDir, HISTORY_FILENAME);

  if (fs.existsSync(historyPath)) {
    try {
      const content = fs.readFileSync(historyPath, 'utf-8');
      return JSON.parse(content) as SchemaHistory;
    } catch {
      console.warn(`Warning: Could not parse ${HISTORY_FILENAME}, starting fresh`);
      return { version: '2.0.0', components: {} };
    }
  }

  const legacyPath = path.join(outputDir, LEGACY_FILENAME);
  if (fs.existsSync(legacyPath)) {
    try {
      const content = fs.readFileSync(legacyPath, 'utf-8');
      const legacy = JSON.parse(content) as PropertyManifest;
      const migrated = migrateLegacyManifest(legacy);
      saveManifest(outputDir, migrated);
      console.log(`Migrated ${LEGACY_FILENAME} to ${HISTORY_FILENAME}`);
      return migrated;
    } catch {
      console.warn(`Warning: Could not parse legacy manifest, starting fresh`);
    }
  }

  return { version: '2.0.0', components: {} };
};

/**
 * Convert old property-manifest.json into the new schema-history format.
 */
const migrateLegacyManifest = (legacy: PropertyManifest): SchemaHistory => {
  const history: SchemaHistory = { version: '2.0.0', components: {} };

  for (const [id, entry] of Object.entries(legacy.components)) {
    history.components[id] = {
      componentId: entry.componentId,
      componentTitle: entry.componentTitle,
      schemaVersion: 1,
      current: entry.properties,
      lastUpdated: entry.lastUpdated,
      history: [],
    };
  }

  return history;
};

/**
 * Save the schema history to disk
 */
export const saveManifest = (outputDir: string, history: SchemaHistory): void => {
  const historyPath = path.join(outputDir, HISTORY_FILENAME);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
};

/**
 * Recursively extract property schema from a HandoffProperty
 */
const extractPropertySchema = (prop: HandoffProperty): PropertySchema => {
  const schema: PropertySchema = { type: prop.type };

  if (prop.type === 'object' && prop.properties) {
    schema.properties = {};
    for (const [key, nestedProp] of Object.entries(prop.properties)) {
      schema.properties[key] = extractPropertySchema(nestedProp);
    }
  }

  if (prop.type === 'array') {
    const itemProperties = prop.items?.properties || prop.properties;
    if (itemProperties) {
      schema.items = { type: 'object', properties: {} };
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
export const extractProperties = (properties: Record<string, HandoffProperty>): Record<string, PropertySchema> => {
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
  propPath: string,
  changes: PropertyChange[]
): boolean => {
  let isValid = true;

  if (oldSchema && !newSchema) {
    isValid = false;
    changes.push({
      type: 'removed',
      propertyPath: propPath,
      oldType: oldSchema.type,
      message: `Property "${propPath}" was removed. This will break existing content.`
    });
    return isValid;
  }

  if (!oldSchema && newSchema) {
    changes.push({
      type: 'added',
      propertyPath: propPath,
      newType: newSchema.type,
      message: `New property "${propPath}" (${newSchema.type}) was added.`
    });
    return isValid;
  }

  if (oldSchema && newSchema) {
    if (oldSchema.type !== newSchema.type) {
      isValid = false;
      changes.push({
        type: 'type_changed',
        propertyPath: propPath,
        oldType: oldSchema.type,
        newType: newSchema.type,
        message: `Property "${propPath}" type changed from "${oldSchema.type}" to "${newSchema.type}". This may break existing content.`
      });
      return isValid;
    }

    if (oldSchema.properties || newSchema.properties) {
      const oldProps = oldSchema.properties || {};
      const newProps = newSchema.properties || {};
      const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

      for (const key of allKeys) {
        const nestedValid = compareSchemas(
          oldProps[key],
          newProps[key],
          `${propPath}.${key}`,
          changes
        );
        if (!nestedValid) isValid = false;
      }
    }

    if (oldSchema.items || newSchema.items) {
      if (oldSchema.items && newSchema.items) {
        const oldItemProps = oldSchema.items.properties || {};
        const newItemProps = newSchema.items.properties || {};
        const allKeys = new Set([...Object.keys(oldItemProps), ...Object.keys(newItemProps)]);

        for (const key of allKeys) {
          const nestedValid = compareSchemas(
            oldItemProps[key],
            newItemProps[key],
            `${propPath}[].${key}`,
            changes
          );
          if (!nestedValid) isValid = false;
        }
      } else if (oldSchema.items && !newSchema.items) {
        isValid = false;
        changes.push({
          type: 'removed',
          propertyPath: `${propPath}[]`,
          message: `Array item structure for "${propPath}" was removed. This will break existing content.`
        });
      } else if (!oldSchema.items && newSchema.items) {
        changes.push({
          type: 'added',
          propertyPath: `${propPath}[]`,
          message: `Array item structure for "${propPath}" was added.`
        });
      }
    }
  }

  return isValid;
};

/**
 * Compare current properties against the stored history entry
 */
export const validateComponent = (
  component: HandoffComponent,
  history: SchemaHistory
): ValidationResult => {
  const componentId = component.id;
  const currentProperties = extractProperties(component.properties);
  const existingEntry = history.components[componentId];

  const result: ValidationResult = {
    componentId,
    componentTitle: component.title,
    isValid: true,
    changes: [],
    isNew: !existingEntry
  };

  if (!existingEntry) {
    return result;
  }

  const oldProperties = existingEntry.current;
  const allKeys = new Set([...Object.keys(oldProperties), ...Object.keys(currentProperties)]);

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
 * Update the history with the current component properties.
 * If there are breaking changes, the old schema is pushed to history
 * and the schema version is incremented.
 */
export const updateManifest = (
  component: HandoffComponent,
  history: SchemaHistory
): SchemaHistory => {
  const currentProperties = extractProperties(component.properties);
  const existingEntry = history.components[component.id];

  if (!existingEntry) {
    return {
      ...history,
      components: {
        ...history.components,
        [component.id]: {
          componentId: component.id,
          componentTitle: component.title,
          schemaVersion: 1,
          current: currentProperties,
          lastUpdated: new Date().toISOString(),
          history: [],
        },
      },
    };
  }

  const changes: PropertyChange[] = [];
  const allKeys = new Set([
    ...Object.keys(existingEntry.current),
    ...Object.keys(currentProperties),
  ]);
  let hasBreaking = false;

  for (const key of allKeys) {
    const valid = compareSchemas(
      existingEntry.current[key],
      currentProperties[key],
      key,
      changes
    );
    if (!valid) hasBreaking = true;
  }

  const breakingChanges = changes.filter(
    (c) => c.type === 'removed' || c.type === 'type_changed'
  );

  let updatedHistory = [...existingEntry.history];
  let nextVersion = existingEntry.schemaVersion;

  if (hasBreaking && breakingChanges.length > 0) {
    updatedHistory = [
      {
        version: existingEntry.schemaVersion,
        schema: existingEntry.current,
        changedAt: new Date().toISOString(),
        changes: breakingChanges,
      },
      ...updatedHistory,
    ];
    nextVersion = existingEntry.schemaVersion + 1;
  }

  return {
    ...history,
    components: {
      ...history.components,
      [component.id]: {
        componentId: component.id,
        componentTitle: component.title,
        schemaVersion: nextVersion,
        current: currentProperties,
        lastUpdated: new Date().toISOString(),
        history: updatedHistory,
      },
    },
  };
};

/**
 * Get the full history entry for a component (used by deprecation generator)
 */
export const getComponentHistory = (
  history: SchemaHistory,
  componentId: string
): SchemaHistoryEntry | undefined => {
  return history.components[componentId];
};

/**
 * Format validation results for console output
 */
export const formatValidationResult = (result: ValidationResult): string => {
  const lines: string[] = [];

  if (result.isNew) {
    lines.push(`  ${result.componentTitle} (${result.componentId})`);
    lines.push(`   New component - will be added to manifest on compilation`);
    return lines.join('\n');
  }

  const icon = result.isValid ? 'OK' : 'FAIL';
  lines.push(`${icon} ${result.componentTitle} (${result.componentId})`);

  if (result.changes.length === 0) {
    lines.push(`   No property changes detected`);
  } else {
    const breaking = result.changes.filter(c => c.type === 'removed' || c.type === 'type_changed');
    const additions = result.changes.filter(c => c.type === 'added');

    if (breaking.length > 0) {
      lines.push(`   Breaking Changes:`);
      for (const change of breaking) {
        lines.push(`      ${change.message}`);
      }
    }

    if (additions.length > 0) {
      lines.push(`   Additions:`);
      for (const change of additions) {
        lines.push(`      ${change.message}`);
      }
    }
  }

  return lines.join('\n');
};
