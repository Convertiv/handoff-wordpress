/**
 * Deprecation Generator
 *
 * Generates Gutenberg `deprecated` array entries from schema history.
 * Each historical schema version becomes a deprecation entry with
 * isEligible / migrate / save functions so WordPress can automatically
 * transform old attributes when a post is opened in the editor.
 */

import { PropertySchema, SchemaHistoryEntry, SchemaHistoryVersion, PropertyChange } from '../validators/property-manifest';
import { toCamelCase } from './handlebars-to-jsx/utils';

interface MigrationOverrides {
  renames?: Record<string, string>;
  transforms?: Record<string, { from: string; to: string; rule: string }>;
}

/**
 * Convert a PropertySchema type to a Gutenberg attribute type string.
 */
const schemaTypeToGutenberg = (type: string): string => {
  switch (type) {
    case 'text':
    case 'richtext':
    case 'select':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'image':
    case 'link':
    case 'button':
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'string';
  }
};

/**
 * Build a default value for a given Handoff type in a historical schema.
 */
const defaultForType = (type: string): any => {
  switch (type) {
    case 'text':
    case 'richtext':
    case 'select':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'image':
      return { src: '', alt: '' };
    case 'link':
      return { label: '', url: '', opensInNewTab: false };
    case 'button':
      return { label: '', href: '#', target: '', rel: '', disabled: false };
    case 'object':
      return {};
    case 'array':
      return [];
    default:
      return '';
  }
};

/**
 * Convert a flat PropertySchema map (from schema history) into a
 * Gutenberg attributes object suitable for a deprecated entry.
 */
const schemaToAttributes = (
  schema: Record<string, PropertySchema>
): Record<string, { type: string; default: any }> => {
  const attrs: Record<string, { type: string; default: any }> = {};

  for (const [key, prop] of Object.entries(schema)) {
    if (prop.type === 'pagination') continue;
    if (prop.type === 'richtext') continue;
    const attrName = toCamelCase(key);
    attrs[attrName] = {
      type: schemaTypeToGutenberg(prop.type),
      default: defaultForType(prop.type),
    };
  }

  attrs.align = { type: 'string', default: 'full' };
  return attrs;
};

/**
 * Determine which attribute keys exist ONLY in the old schema (removed or renamed).
 * These are the keys isEligible checks for to detect old content.
 */
const getOldOnlyAttrKeys = (
  oldSchema: Record<string, PropertySchema>,
  newSchema: Record<string, PropertySchema>
): string[] => {
  const oldKeys = Object.keys(oldSchema)
    .filter((k) => oldSchema[k].type !== 'pagination' && oldSchema[k].type !== 'richtext')
    .map(toCamelCase);
  const newKeys = new Set(
    Object.keys(newSchema)
      .filter((k) => newSchema[k].type !== 'pagination' && newSchema[k].type !== 'richtext')
      .map(toCamelCase)
  );
  return oldKeys.filter((k) => !newKeys.has(k));
};

/**
 * Determine which attribute keys changed type between versions.
 */
const getTypeChangedKeys = (
  oldSchema: Record<string, PropertySchema>,
  newSchema: Record<string, PropertySchema>
): Array<{ key: string; oldType: string; newType: string }> => {
  const result: Array<{ key: string; oldType: string; newType: string }> = [];
  for (const [key, oldProp] of Object.entries(oldSchema)) {
    const newProp = newSchema[key];
    if (newProp && oldProp.type !== newProp.type) {
      result.push({
        key: toCamelCase(key),
        oldType: oldProp.type,
        newType: newProp.type,
      });
    }
  }
  return result;
};

/**
 * Generate a type coercion expression for use in migrate().
 */
const coercionExpression = (varName: string, fromType: string, toType: string): string => {
  const gutFrom = schemaTypeToGutenberg(fromType);
  const gutTo = schemaTypeToGutenberg(toType);

  if (gutFrom === 'string' && gutTo === 'number') return `Number(${varName}) || 0`;
  if (gutFrom === 'number' && gutTo === 'string') return `String(${varName})`;
  if (gutFrom === 'string' && gutTo === 'boolean') return `${varName} === 'true' || ${varName} === '1'`;
  if (gutFrom === 'boolean' && gutTo === 'string') return `${varName} ? 'true' : 'false'`;
  if (gutFrom === 'boolean' && gutTo === 'number') return `${varName} ? 1 : 0`;
  if (gutFrom === 'number' && gutTo === 'boolean') return `!!${varName}`;
  return `${varName}`;
};

/**
 * Generate a single deprecated entry as a JS object string.
 */
const generateDeprecatedEntry = (
  historyVersion: SchemaHistoryVersion,
  currentSchema: Record<string, PropertySchema>,
  overrides?: MigrationOverrides,
  useInnerBlocks?: boolean
): string => {
  const oldAttrs = schemaToAttributes(historyVersion.schema);
  const removedKeys = getOldOnlyAttrKeys(historyVersion.schema, currentSchema);
  const typeChanged = getTypeChangedKeys(historyVersion.schema, currentSchema);
  const renames = overrides?.renames || {};
  const transforms = overrides?.transforms || {};

  const attrsJson = JSON.stringify(oldAttrs, null, 6)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'");

  const eligibilityChecks: string[] = [];
  for (const key of removedKeys) {
    eligibilityChecks.push(`attributes.${key} !== undefined`);
  }
  for (const tc of typeChanged) {
    const gutOld = schemaTypeToGutenberg(tc.oldType);
    eligibilityChecks.push(`typeof attributes.${tc.key} === '${gutOld}'`);
  }

  const eligibilityExpr =
    eligibilityChecks.length > 0
      ? eligibilityChecks.join(' || ')
      : 'false';

  const migrateLines: string[] = [];
  const destructureKeys: string[] = [];

  for (const key of removedKeys) {
    if (renames[key]) {
      destructureKeys.push(key);
      migrateLines.push(`          migrated.${renames[key]} = ${key};`);
    } else {
      destructureKeys.push(key);
    }
  }

  for (const tc of typeChanged) {
    if (transforms[tc.key]) {
      const rule = transforms[tc.key].rule;
      if (rule === 'boolToOpacity') {
        migrateLines.push(
          `          migrated.${tc.key} = attributes.${tc.key} ? 100 : 0;`
        );
      } else {
        migrateLines.push(
          `          migrated.${tc.key} = ${coercionExpression(`attributes.${tc.key}`, tc.oldType, tc.newType)};`
        );
      }
    } else {
      migrateLines.push(
        `          migrated.${tc.key} = ${coercionExpression(`attributes.${tc.key}`, tc.oldType, tc.newType)};`
      );
    }
  }

  const destructureStr =
    destructureKeys.length > 0
      ? `const { ${destructureKeys.join(', ')}, ...migrated } = attributes;`
      : `const migrated = { ...attributes };`;

  const changesComment = historyVersion.changes
    .map((c) => `   *   ${c.type}: ${c.propertyPath}${c.oldType ? ` (${c.oldType})` : ''}`)
    .join('\n');

  const saveReturn = useInnerBlocks
    ? 'return wp.element.createElement(wp.blockEditor.InnerBlocks.Content);'
    : 'return null;';

  return `    /**
     * Schema v${historyVersion.version} (${historyVersion.changedAt.split('T')[0]})
     * Changes:
${changesComment}
     */
    {
      attributes: ${attrsJson.split('\n').join('\n      ')},
      isEligible(attributes) {
        return ${eligibilityExpr};
      },
      migrate(attributes) {
        ${destructureStr}
${migrateLines.length > 0 ? migrateLines.join('\n') + '\n' : ''}        return migrated;
      },
      save() {
        ${saveReturn}
      },
    }`;
};

/**
 * Generate the full deprecated array as a JS string for inclusion in index.js.
 * Returns an empty string if the component has no history (no deprecations needed).
 */
export const generateDeprecations = (
  entry: SchemaHistoryEntry | undefined,
  currentSchema: Record<string, PropertySchema>,
  overridesMap?: Record<string, MigrationOverrides>,
  useInnerBlocks?: boolean
): string => {
  if (!entry || entry.history.length === 0) {
    return '';
  }

  const entries = entry.history.map((histVersion) => {
    const versionKey = `${histVersion.version}-to-${entry.schemaVersion}`;
    const overrides = overridesMap?.[versionKey];
    return generateDeprecatedEntry(histVersion, currentSchema, overrides, useInnerBlocks);
  });

  return `const deprecated = [\n${entries.join(',\n')}\n  ];`;
};

/**
 * Generate a schema-changelog.json for a block.
 */
export const generateSchemaChangelog = (
  blockName: string,
  entry: SchemaHistoryEntry | undefined
): string => {
  if (!entry) {
    return JSON.stringify(
      { blockName: `handoff/${blockName}`, currentVersion: 1, history: [] },
      null,
      2
    );
  }

  const history = entry.history.map((v) => ({
    version: v.version,
    date: v.changedAt,
    changes: v.changes.map((c) => ({
      type: c.type,
      path: c.propertyPath,
      ...(c.oldType ? { oldType: c.oldType } : {}),
      ...(c.newType ? { newType: c.newType } : {}),
    })),
    migrationStatus: determineMigrationStatus(v.changes),
  }));

  return JSON.stringify(
    {
      blockName: `handoff/${blockName}`,
      currentVersion: entry.schemaVersion,
      history,
    },
    null,
    2
  );
};

const determineMigrationStatus = (changes: PropertyChange[]): string => {
  const hasBreaking = changes.some(
    (c) => c.type === 'removed' || c.type === 'type_changed'
  );
  if (!hasBreaking) return 'non-breaking';

  const hasRemoved = changes.some((c) => c.type === 'removed');
  if (hasRemoved) return 'needs-review';
  return 'auto';
};
