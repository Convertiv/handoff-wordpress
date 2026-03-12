/**
 * Migration Schema Generator
 *
 * Produces a migration-schema.json per block that preserves the full Handoff
 * type system (labels, options, defaults, nested structures) alongside the
 * camelCase Gutenberg attribute name. Used by the migration admin page to
 * drive the ACF-to-Handoff mapping UI.
 */

import { HandoffComponent, HandoffProperty } from '../types';
import { toCamelCase } from './handlebars-to-jsx/utils';
import { groupToCategory } from './block-json';

export interface MigrationPropertySchema {
  type: string;
  attributeName?: string;
  label: string;
  description?: string;
  default?: any;
  options?: Array<{ label: string; value: string }>;
  properties?: Record<string, MigrationPropertySchema>;
  items?: {
    properties?: Record<string, MigrationPropertySchema>;
  };
}

export interface MigrationSchema {
  blockName: string;
  title: string;
  description: string;
  category: string;
  properties: Record<string, MigrationPropertySchema>;
}

export const extractMigrationProperty = (prop: HandoffProperty, includeAttributeName: boolean = false, key?: string): MigrationPropertySchema => {
  const schema: MigrationPropertySchema = {
    type: prop.type,
    label: prop.name || key || '',
  };

  if (includeAttributeName && key) {
    schema.attributeName = toCamelCase(key);
  }

  if (prop.description) {
    schema.description = prop.description;
  }

  if (prop.default !== undefined) {
    schema.default = prop.default;
  }

  if (prop.options && prop.options.length > 0) {
    schema.options = prop.options;
  }

  if (prop.type === 'object' && prop.properties) {
    schema.properties = {};
    for (const [k, nested] of Object.entries(prop.properties)) {
      schema.properties[k] = extractMigrationProperty(nested, false, k);
    }
  }

  if (prop.type === 'array') {
    const itemProperties = prop.items?.properties || prop.properties;
    if (itemProperties) {
      schema.items = { properties: {} };
      for (const [k, nested] of Object.entries(itemProperties)) {
        schema.items.properties![k] = extractMigrationProperty(nested, false, k);
      }
    }
  }

  return schema;
};

export const generateMigrationSchema = (component: HandoffComponent): string => {
  const properties: Record<string, MigrationPropertySchema> = {};

  for (const [key, prop] of Object.entries(component.properties)) {
    if (prop.type === 'pagination') continue;
    properties[key] = extractMigrationProperty(prop, true, key);
  }

  const schema: MigrationSchema = {
    blockName: `handoff/${component.id}`,
    title: component.title,
    description: (component.description || '').replace(/\n\s+/g, ' ').trim(),
    category: groupToCategory(component.group),
    properties,
  };

  return JSON.stringify(schema, null, 2);
};
