/**
 * Merged Group Block Generator
 *
 * Combines all Handoff components in the same group into a single WordPress
 * block with variations. Uses a superset attribute schema, variant-conditional
 * sidebar controls, variant-specific preview rendering, and a render.php
 * dispatcher.
 */

import {
  HandoffComponent,
  HandoffProperty,
  GutenbergAttribute,
  DynamicArrayConfig,
  GeneratedBlock,
  ItemOverrideFieldConfig,
  BlockJsonOutput,
  HandoffMetadata,
} from '../types';
import { toCamelCase, generateJsxPreview, JsxPreviewResult } from './handlebars-to-jsx';
import { mapPropertyType, groupToCategory, toBlockName } from './block-json';
import { generateRenderPhp, handlebarsToPhp, arrayToPhp } from './render-php';
import { generateEditorScss, generateStyleScss } from './styles';
import { generateMigrationSchema, MigrationSchema, MigrationPropertySchema, extractMigrationProperty } from './schema-json';

// Re-export toCamelCase from index-js for local use
const toTitleCase = (str: string): string =>
  str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-variant mapping from original field name to merged attribute name */
export type FieldMap = Record<string, string>;

interface VariantInfo {
  component: HandoffComponent;
  fieldMap: FieldMap;
  innerBlocksField: string | null;
  dynamicArrayConfigs: Record<string, DynamicArrayConfig>;
}

interface MergedField {
  /** The merged attribute name (camelCase) */
  attrName: string;
  /** The Gutenberg attribute definition */
  attribute: GutenbergAttribute;
  /** Which variants use this field */
  variants: string[];
}

interface SupersetResult {
  /** All merged attributes keyed by merged attribute name */
  attributes: Record<string, GutenbergAttribute>;
  /** Per-variant field map: original key → merged attribute name */
  fieldMaps: Record<string, FieldMap>;
}

// ─── Superset Attribute Merge ─────────────────────────────────────────────────

/**
 * Types are compatible if they have the same Gutenberg attribute `type`.
 */
const typesAreCompatible = (a: GutenbergAttribute, b: GutenbergAttribute): boolean => {
  if (!a || !b) return false;
  return a.type === b.type;
};

/**
 * Merge attributes from N components into a superset schema.
 *
 * 1. Shared fields (same name, compatible type): kept as-is.
 * 2. Conflicting fields (same name, different type): prefixed with variant slug.
 * 3. Unique fields: kept as-is.
 */
export const buildSupersetAttributes = (
  variants: VariantInfo[],
  groupSlug: string,
): SupersetResult => {
  const attributes: Record<string, GutenbergAttribute> = {};
  const fieldMaps: Record<string, FieldMap> = {};

  // First pass: collect all fields per original key across variants
  const fieldsByKey: Record<
    string,
    Array<{ variantId: string; attrName: string; attr: GutenbergAttribute }>
  > = {};

  for (const variant of variants) {
    const component = variant.component;
    fieldMaps[component.id] = {};
    const previewValues = component.previews?.generic?.values || {};

    for (const [key, property] of Object.entries(component.properties)) {
      if (property.type === 'pagination') continue;
      const origAttrName = toCamelCase(key);
      let mapped = mapPropertyType(property, previewValues[key]);

      // Non-innerBlocksField richtext becomes a string attribute
      if (mapped === null && property.type === 'richtext' && key !== variant.innerBlocksField) {
        mapped = { type: 'string', default: previewValues[key] ?? '' };
      }
      if (mapped === null) continue;

      if (!fieldsByKey[key]) fieldsByKey[key] = [];
      fieldsByKey[key].push({ variantId: component.id, attrName: origAttrName, attr: mapped });
    }

    // Also collect dynamic array control attributes
    for (const [fieldName, dynConfig] of Object.entries(variant.dynamicArrayConfigs)) {
      const attrName = toCamelCase(fieldName);
      const dynFields: Record<string, GutenbergAttribute> = {};
      const sourceDefault = dynConfig.selectionMode === 'manual' ? 'select' : 'query';
      dynFields[`${attrName}Source`] = { type: 'string', default: sourceDefault, enum: ['query', 'select', 'manual'] };
      dynFields[`${attrName}PostType`] = { type: 'string', default: dynConfig.defaultPostType || dynConfig.postTypes[0] || 'post' };
      dynFields[`${attrName}SelectedPosts`] = { type: 'array', default: [] };
      dynFields[`${attrName}QueryArgs`] = { type: 'object', default: { post_type: dynConfig.defaultPostType || dynConfig.postTypes[0] || 'post', posts_per_page: dynConfig.maxItems || 6, orderby: 'date', order: 'DESC', tax_query: [], ...(dynConfig.defaultQueryArgs || {}) } };
      dynFields[`${attrName}FieldMapping`] = { type: 'object', default: dynConfig.fieldMapping || {} };
      dynFields[`${attrName}ItemOverrides`] = { type: 'object', default: {} };
      dynFields[`${attrName}RenderMode`] = { type: 'string', default: dynConfig.renderMode || 'mapped' };

      for (const [daKey, daAttr] of Object.entries(dynFields)) {
        if (!fieldsByKey[`__dyn_${daKey}`]) fieldsByKey[`__dyn_${daKey}`] = [];
        fieldsByKey[`__dyn_${daKey}`].push({ variantId: component.id, attrName: daKey, attr: daAttr });
      }
    }
  }

  // Second pass: resolve conflicts
  for (const [key, entries] of Object.entries(fieldsByKey)) {
    if (entries.length === 0) continue;

    // Check if all entries have compatible types
    const first = entries[0];
    const allCompatible = entries.every((e) => typesAreCompatible(first.attr, e.attr));

    if (allCompatible) {
      // Shared or unique field — use original name
      const mergedName = first.attrName;
      // Use the first variant's attribute definition (defaults may differ, take first)
      attributes[mergedName] = first.attr;
      for (const entry of entries) {
        if (!key.startsWith('__dyn_')) {
          fieldMaps[entry.variantId][key] = mergedName;
        }
      }
    } else {
      // Conflicting — prefix with variant slug
      for (const entry of entries) {
        const prefixed = toCamelCase(entry.variantId) + entry.attrName.charAt(0).toUpperCase() + entry.attrName.slice(1);
        attributes[prefixed] = entry.attr;
        if (!key.startsWith('__dyn_')) {
          fieldMaps[entry.variantId][key] = prefixed;
        }
      }
    }
  }

  // Always add align
  attributes.align = { type: 'string', default: 'full' };

  return { attributes, fieldMaps };
};

// ─── Block Icon ───────────────────────────────────────────────────────────────

const chooseGroupIcon = (groupSlug: string): string => {
  const slug = groupSlug.toLowerCase();
  if (slug.includes('hero')) return 'format-image';
  if (slug.includes('card')) return 'index-card';
  if (slug.includes('form')) return 'feedback';
  if (slug.includes('nav')) return 'menu';
  if (slug.includes('footer')) return 'table-row-after';
  if (slug.includes('header')) return 'table-row-before';
  if (slug.includes('cta')) return 'megaphone';
  return 'admin-customizer';
};

const chooseVariantIcon = (component: HandoffComponent): string => {
  const group = component.group?.toLowerCase() || '';
  const id = component.id.toLowerCase();
  if (group.includes('hero') || id.includes('hero')) return 'format-image';
  if (group.includes('card') || id.includes('card')) return 'index-card';
  if (group.includes('form') || id.includes('form')) return 'feedback';
  if (group.includes('nav') || id.includes('nav')) return 'menu';
  if (group.includes('footer') || id.includes('footer')) return 'table-row-after';
  if (group.includes('header') || id.includes('header')) return 'table-row-before';
  return 'admin-customizer';
};

// ─── Merged block.json ──────────────────────────────────────────────────────

const generateMergedBlockJson = (
  groupSlug: string,
  groupTitle: string,
  variants: VariantInfo[],
  supersetAttrs: Record<string, GutenbergAttribute>,
): string => {
  // Add handoffVariant discriminator
  const allAttributes: Record<string, GutenbergAttribute> = {
    handoffVariant: {
      type: 'string',
      default: variants[0].component.id,
    },
    ...supersetAttrs,
  };

  const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const variations = variants.map((v) => {
    const comp = v.component;
    // Build initial attribute defaults for this variant
    const variantDefaults: Record<string, any> = { handoffVariant: comp.id };
    return {
      name: comp.id,
      title: comp.title,
      description: (comp.description || '').replace(/\n\s+/g, ' ').trim(),
      attributes: variantDefaults,
      isActive: ['handoffVariant'],
      scope: ['inserter', 'block', 'transform'],
      icon: chooseVariantIcon(comp),
    };
  });

  const blockJson: any = {
    $schema: 'https://schemas.wp.org/trunk/block.json',
    apiVersion: 3,
    name: `handoff/${blockName}`,
    version: '1.0.0',
    title: groupTitle,
    category: groupToCategory(groupSlug),
    icon: chooseGroupIcon(groupSlug),
    description: `${groupTitle} block with ${variants.length} variations.`,
    keywords: [groupSlug],
    textdomain: 'handoff',
    editorScript: 'file:./index.js',
    editorStyle: 'file:./index.css',
    style: 'file:./style-index.css',
    render: 'file:./render.php',
    attributes: allAttributes,
    supports: {
      align: ['none', 'wide', 'full'],
      html: false,
    },
    variations,
  };

  return JSON.stringify(blockJson, null, 2);
};

// ─── Merged index.js ────────────────────────────────────────────────────────

const generateMergedIndexJs = (
  groupSlug: string,
  groupTitle: string,
  variants: VariantInfo[],
  supersetAttrs: Record<string, GutenbergAttribute>,
  fieldMaps: Record<string, FieldMap>,
): string => {
  const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // Collect all unique features needed across variants
  let needsMediaUpload = false;
  let needsRangeControl = false;
  let needsToggleControl = false;
  let needsSelectControl = false;
  let needsLinkControl = false;
  let hasArrayProps = false;
  let anyHasDynamicArrays = false;
  let anyUsesInnerBlocks = false;
  let anyPreviewUsesLinkField = false;
  let anyPreviewUsesRichText = false;
  let anyPreviewUses10upImage = false;
  let anyPreviewUsesInnerBlocks = false;

  const hasPropertyType = (properties: Record<string, HandoffProperty>, type: string): boolean => {
    const check = (prop: HandoffProperty): boolean => {
      if (prop.type === type) return true;
      if (prop.type === 'object' && prop.properties) return Object.values(prop.properties).some(check);
      if (prop.type === 'array' && prop.items?.properties) return Object.values(prop.items.properties).some(check);
      return false;
    };
    return Object.values(properties).some(check);
  };

  // Generate variant-specific content (sidebar panels + preview)
  interface VariantGenResult {
    panels: string;
    previewJsx: string;
    arrayHelpers: string;
    dynamicResolution: string;
    resolvingFlags: string[];
    hasLinkField: boolean;
    hasRichText: boolean;
    has10upImage: boolean;
    hasInnerBlocks: boolean;
  }

  const variantResults: Record<string, VariantGenResult> = {};

  for (const variant of variants) {
    const comp = variant.component;
    const properties = comp.properties;
    const fieldMap = fieldMaps[comp.id];
    const dynamicArrayConfigs = variant.dynamicArrayConfigs;
    const hasDynamic = Object.keys(dynamicArrayConfigs).length > 0;

    // Detect feature needs
    if (hasPropertyType(properties, 'image')) needsMediaUpload = true;
    if (hasPropertyType(properties, 'number') || comp.code.includes('overlay')) needsRangeControl = true;
    if (hasPropertyType(properties, 'boolean') || hasPropertyType(properties, 'button')) needsToggleControl = true;
    if (hasPropertyType(properties, 'select')) needsSelectControl = true;
    if (hasPropertyType(properties, 'link') || hasPropertyType(properties, 'button')) needsLinkControl = true;
    if (Object.values(properties).some((p) => p.type === 'array')) hasArrayProps = true;
    if (hasDynamic) { anyHasDynamicArrays = true; needsSelectControl = true; }
    if (variant.innerBlocksField) anyUsesInnerBlocks = true;

    // Generate preview
    const previewResult: JsxPreviewResult = generateJsxPreview(
      comp.code,
      properties,
      comp.id,
      comp.title,
      variant.innerBlocksField,
    );
    let previewJsx = previewResult.jsx;
    const inlineEditableFields = previewResult.inlineEditableFields;

    const varHasLinkField = previewJsx.includes('<HandoffLinkField');
    const varHasRichText = previewJsx.includes('<RichText');
    const varHas10upImage = previewJsx.includes('<Image');
    const varHasInnerBlocks = previewJsx.includes('<InnerBlocks');
    if (varHasLinkField) anyPreviewUsesLinkField = true;
    if (varHasRichText) anyPreviewUsesRichText = true;
    if (varHas10upImage) anyPreviewUses10upImage = true;
    if (varHasInnerBlocks) anyPreviewUsesInnerBlocks = true;

    // Remap attribute references in preview JSX using fieldMap
    // We need to replace original camelCase names with merged names
    for (const [origKey, mergedName] of Object.entries(fieldMap)) {
      const origCamel = toCamelCase(origKey);
      if (origCamel !== mergedName) {
        const regex = new RegExp(`\\b${origCamel}\\b`, 'g');
        previewJsx = previewJsx.replace(regex, mergedName);
      }
    }

    // Generate panels for sidebar controls
    const panels: string[] = [];
    for (const [key, property] of Object.entries(properties)) {
      if (property.type === 'richtext' || property.type === 'pagination') continue;
      if (inlineEditableFields.has(key) && property.type !== 'array') continue;

      const label = property.name || toTitleCase(key);
      const mergedAttrName = fieldMap[key] || toCamelCase(key);
      const dynamicConfig = dynamicArrayConfigs?.[key];

      if (property.type === 'array' && dynamicConfig) {
        const defaultMode = dynamicConfig.selectionMode === 'manual' ? 'select' : 'query';
        const itemOverridesConfig = dynamicConfig.itemOverridesConfig || {};
        const advancedFields: Array<{ name: string; label: string; type: string; options?: Array<{ label: string; value: string }>; default?: any }> = [];

        for (const [name, c] of Object.entries(itemOverridesConfig) as Array<[string, ItemOverrideFieldConfig]>) {
          if (c.mode === 'ui') advancedFields.push({ name, label: c.label, type: 'select', options: c.options, default: c.default });
        }

        const itemProps = property.items?.properties || {};
        const fieldMapping = dynamicConfig.fieldMapping || {};
        for (const [fieldPath, mappingValue] of Object.entries(fieldMapping)) {
          if (typeof mappingValue === 'object' && mappingValue !== null && (mappingValue as any).type === 'manual') {
            const topKey = fieldPath.split('.')[0];
            const itemProp = itemProps[topKey];
            const fieldLabel = itemProp?.name || toTitleCase(topKey);
            let controlType = 'text';
            let options: Array<{ label: string; value: string }> | undefined;
            let defaultVal: any = itemProp?.default ?? '';
            if (itemProp) {
              switch (itemProp.type) {
                case 'select': controlType = 'select'; options = itemProp.options; break;
                case 'boolean': controlType = 'toggle'; defaultVal = itemProp.default ?? false; break;
                case 'number': controlType = 'number'; defaultVal = itemProp.default ?? 0; break;
                default: controlType = 'text'; break;
              }
            }
            advancedFields.push({ name: fieldPath, label: fieldLabel, type: controlType, options, default: defaultVal });
          }
        }

        panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                <DynamicPostSelector
                  value={{
                    source: ${mergedAttrName}Source || '${defaultMode}',
                    postType: ${mergedAttrName}PostType,
                    queryArgs: ${mergedAttrName}QueryArgs || {},
                    selectedPosts: ${mergedAttrName}SelectedPosts || [],
                    itemOverrides: ${mergedAttrName}ItemOverrides || {}
                  }}
                  onChange={(nextValue) => setAttributes({
                    ${mergedAttrName}Source: nextValue.source,
                    ${mergedAttrName}PostType: nextValue.postType,
                    ${mergedAttrName}QueryArgs: { ...nextValue.queryArgs, post_type: nextValue.postType },
                    ${mergedAttrName}SelectedPosts: nextValue.selectedPosts || [],
                    ${mergedAttrName}ItemOverrides: nextValue.itemOverrides ?? {}
                  })}
                  options={{
                    postTypes: ${JSON.stringify(dynamicConfig.postTypes)},
                    maxItems: ${dynamicConfig.maxItems ?? 20},
                    textDomain: 'handoff',
                    showDateFilter: ${(dynamicConfig as any).showDateFilter === true ? 'true' : 'false'},
                    showExcludeCurrent: true,
                    advancedFields: ${JSON.stringify(advancedFields)}
                  }}
                />
                {${mergedAttrName}Source === 'manual' && (
                  <>
                    {/* Manual array controls */}
                  </>
                )}
              </PanelBody>`);
      } else {
        panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                {/* ${label} controls */}
                ${generatePropertyControlMerged(key, property, mergedAttrName)}
              </PanelBody>`);
      }
    }

    // Dynamic array resolution code
    let dynamicResolution = '';
    const resolvingFlags: string[] = [];
    if (hasDynamic) {
      for (const [fieldKey, dynConfig] of Object.entries(dynamicArrayConfigs)) {
        const mergedAttrName = fieldMap[fieldKey] || toCamelCase(fieldKey);
        const cap = mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1);
        const previewVarName = `preview${cap}`;
        const resolvedVarName = `resolved${cap}`;
        const resolvingVarName = `isResolving${cap}`;
        resolvingFlags.push(resolvingVarName);
        dynamicResolution += `
      const ${resolvedVarName} = useSelect(
        (select) => {
          if (${mergedAttrName}Source === 'manual') return undefined;
          const store = select(coreDataStore);
          if (${mergedAttrName}Source === 'query') {
            const queryArgs = ${mergedAttrName}QueryArgs || {};
            const postType = ${mergedAttrName}PostType || 'post';
            const args = {
              per_page: queryArgs.posts_per_page || ${dynConfig.maxItems ?? 6},
              orderby: queryArgs.orderby || 'date',
              order: (queryArgs.order || 'DESC').toLowerCase(),
              _embed: true,
              status: 'publish',
            };
            const records = store.getEntityRecords('postType', postType, args);
            if (records === null || records === undefined) return undefined;
            if (!Array.isArray(records)) return [];
            const mapping = ${mergedAttrName}FieldMapping || {};
            const overrides = ${mergedAttrName}ItemOverrides || {};
            return records.map((rec) =>
              mapPostEntityToItem(rec, mapping, overrides, rec._embedded || {})
            );
          }
          if (${mergedAttrName}Source === 'select') {
            const selected = ${mergedAttrName}SelectedPosts || [];
            if (!selected.length) return [];
            const mapping = ${mergedAttrName}FieldMapping || {};
            const overrides = ${mergedAttrName}ItemOverrides || {};
            return selected
              .map((sel) => {
                const rec = store.getEntityRecord('postType', sel.type || 'post', sel.id);
                return rec ? mapPostEntityToItem(rec, mapping, overrides, rec._embedded || {}) : null;
              })
              .filter(Boolean);
          }
          return [];
        },
        [${mergedAttrName}Source, ${mergedAttrName}PostType, JSON.stringify(${mergedAttrName}QueryArgs || {}), JSON.stringify(${mergedAttrName}SelectedPosts || []), JSON.stringify(${mergedAttrName}FieldMapping || {}), JSON.stringify(${mergedAttrName}ItemOverrides || {})]
      );
      const ${previewVarName} = ${mergedAttrName}Source !== 'manual' ? (${resolvedVarName} ?? []) : (${mergedAttrName} ?? []);
      const ${resolvingVarName} = ${mergedAttrName}Source !== 'manual' && ${resolvedVarName} === undefined;
`;
        // Remap in preview
        const arrayVarRegex = new RegExp(`\\b${mergedAttrName}\\b`, 'g');
        previewJsx = previewJsx.replace(arrayVarRegex, previewVarName);
      }
    }

    // Array helpers
    const arrayHelpers = generateArrayHelpersMerged(properties, fieldMap);

    variantResults[comp.id] = {
      panels: panels.join('\n\n'),
      previewJsx,
      arrayHelpers,
      dynamicResolution: dynamicResolution,
      resolvingFlags,
      hasLinkField: varHasLinkField,
      hasRichText: varHasRichText,
      has10upImage: varHas10upImage,
      hasInnerBlocks: varHasInnerBlocks,
    };
  }

  // Build imports
  const blockEditorImports = ['useBlockProps', 'InspectorControls', 'BlockControls'];
  if (needsMediaUpload) blockEditorImports.push('MediaUpload', 'MediaUploadCheck', 'MediaReplaceFlow');
  if (anyUsesInnerBlocks || anyPreviewUsesInnerBlocks) blockEditorImports.push('InnerBlocks');
  if (needsLinkControl || anyPreviewUsesLinkField) {
    if (!blockEditorImports.includes('LinkControl')) blockEditorImports.push('LinkControl');
    if (!blockEditorImports.includes('RichText')) blockEditorImports.push('RichText');
  }
  if ((anyPreviewUsesRichText || anyPreviewUsesLinkField) && !blockEditorImports.includes('RichText')) {
    blockEditorImports.push('RichText');
  }

  const componentImports = ['PanelBody', 'TextControl', 'Button', 'SelectControl'];
  if (needsRangeControl) componentImports.push('RangeControl');
  if (needsToggleControl) componentImports.push('ToggleControl');
  if (anyHasDynamicArrays) componentImports.push('Spinner');
  componentImports.push('Flex');
  if (needsLinkControl || anyPreviewUsesLinkField) componentImports.push('Popover');

  const tenUpImports: string[] = [];
  if (hasArrayProps) tenUpImports.push('Repeater');
  if (anyPreviewUses10upImage) tenUpImports.push('Image');
  const tenUpImport = tenUpImports.length > 0 ? `import { ${tenUpImports.join(', ')} } from '@10up/block-components';\n` : '';

  const sharedComponentImport = anyHasDynamicArrays
    ? `import { DynamicPostSelector, mapPostEntityToItem } from '../../shared';\nimport { useSelect } from '@wordpress/data';\nimport { store as coreDataStore } from '@wordpress/core-data';\n`
    : '';

  const elementImports = ['Fragment'];
  if (anyPreviewUsesLinkField) elementImports.push('useState', 'useRef', 'useCallback');

  // All attribute names for destructuring
  const allAttrNames = new Set<string>();
  allAttrNames.add('handoffVariant');
  for (const attrName of Object.keys(supersetAttrs)) {
    allAttrNames.add(attrName);
  }
  // Also add dynamic array derived attribute names
  for (const variant of variants) {
    for (const [fieldName, dynConfig] of Object.entries(variant.dynamicArrayConfigs)) {
      const attrName = fieldMaps[variant.component.id][fieldName] || toCamelCase(fieldName);
      allAttrNames.add(`${attrName}Source`);
      allAttrNames.add(`${attrName}PostType`);
      allAttrNames.add(`${attrName}SelectedPosts`);
      allAttrNames.add(`${attrName}QueryArgs`);
      allAttrNames.add(`${attrName}FieldMapping`);
      allAttrNames.add(`${attrName}ItemOverrides`);
      allAttrNames.add(`${attrName}RenderMode`);
    }
  }

  // Variant selector options
  const variantOptions = variants
    .map((v) => `          { label: '${v.component.title.replace(/'/g, "\\'")}', value: '${v.component.id}' }`)
    .join(',\n');

  // Build variant-conditional panels
  const variantPanelBlocks = variants.map((v) => {
    const result = variantResults[v.component.id];
    if (!result.panels.trim()) return '';
    return `        {handoffVariant === '${v.component.id}' && (
          <>
${result.panels}
          </>
        )}`;
  }).filter(Boolean).join('\n\n');

  // Build variant-conditional previews
  const variantPreviewBlocks = variants.map((v) => {
    const result = variantResults[v.component.id];
    return `          {handoffVariant === '${v.component.id}' && (
${result.previewJsx}
          )}`;
  }).join('\n');

  // Build variant-conditional dynamic resolution + array helpers
  const variantDynamicBlocks = variants.map((v) => {
    const result = variantResults[v.component.id];
    const code = result.dynamicResolution + result.arrayHelpers;
    if (!code.trim()) return '';
    return `    if (handoffVariant === '${v.component.id}') {
${code}
    }`;
  }).filter(Boolean);

  // For dynamic resolution, we need the variables to be declared in a scope visible to the preview
  // We'll use a different approach: declare all at top, conditionally populate
  const allResolvingFlags = variants.flatMap((v) => variantResults[v.component.id].resolvingFlags);
  const hasAnyResolving = allResolvingFlags.length > 0;

  // Generate dynamic resolution and array helpers per variant (wrapped in variant conditionals)
  let combinedDynamicCode = '';
  for (const v of variants) {
    const result = variantResults[v.component.id];
    if (result.dynamicResolution.trim() || result.arrayHelpers.trim()) {
      combinedDynamicCode += result.dynamicResolution + result.arrayHelpers;
    }
  }

  // HandoffLinkField component (if any variant uses it)
  const linkFieldComponent = anyPreviewUsesLinkField ? `
function HandoffLinkField({ fieldId, label, url, opensInNewTab, onLabelChange, onLinkChange, isSelected }) {
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const ref = useRef(null);
  const toggle = useCallback(() => setIsEditingUrl((v) => !v), []);

  return (
    <span ref={ref} className="handoff-editable-field handoff-link-field" onClick={toggle} role="button" tabIndex={0}>
      <RichText
        tagName="span"
        value={label}
        onChange={onLabelChange}
        allowedFormats={[]}
        withoutInteractiveFormatting
        placeholder={__('Link text...', 'handoff')}
      />
      {isSelected && (isEditingUrl || url) && (
        <Popover
          placement="bottom"
          onClose={() => setIsEditingUrl(false)}
          anchor={ref.current}
          focusOnMount={isEditingUrl ? 'firstElement' : false}
          shift
        >
          <div style={{ minWidth: 280, padding: '8px' }}>
            <LinkControl
              value={{ url: url || '', opensInNewTab: opensInNewTab || false }}
              onChange={(val) => onLinkChange({ url: val.url || '', opensInNewTab: val.opensInNewTab || false })}
              settings={[{ id: 'opensInNewTab', title: __('Open in new tab', 'handoff') }]}
            />
          </div>
        </Popover>
      )}
    </span>
  );
}
` : '';

  const attrNamesList = Array.from(allAttrNames);

  return `import { registerBlockType } from '@wordpress/blocks';
import { 
  ${blockEditorImports.join(',\n  ')} 
} from '@wordpress/block-editor';
import { 
  ${componentImports.join(',\n  ')} 
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { ${elementImports.join(', ')} } from '@wordpress/element';
${tenUpImport}${sharedComponentImport}import metadata from './block.json';
import './editor.scss';
${anyHasDynamicArrays ? "import '../../shared/components/DynamicPostSelector.editor.scss';\n" : ''}import './style.scss';
${linkFieldComponent}
registerBlockType(metadata.name, {
  ...metadata,
  edit: ({ attributes, setAttributes, isSelected }) => {
    const blockProps = useBlockProps();
${anyUsesInnerBlocks || anyPreviewUsesInnerBlocks ? "    const CONTENT_BLOCKS = ['core/paragraph','core/heading','core/list','core/list-item','core/quote','core/image','core/separator','core/html','core/buttons','core/button'];" : ''}
    const { ${attrNamesList.join(', ')} } = attributes;
${combinedDynamicCode}
    return (
      <Fragment>
        <InspectorControls>
          {/* Variant Selector */}
          <PanelBody title={__('Block Type', 'handoff')} initialOpen={true}>
            <SelectControl
              label={__('Variation', 'handoff')}
              value={handoffVariant}
              options={[
${variantOptions}
              ]}
              onChange={(v) => setAttributes({ handoffVariant: v })}
              __nextHasNoMarginBottom
            />
          </PanelBody>

${variantPanelBlocks}
        </InspectorControls>

        {/* Editor Preview */}
        <div {...blockProps}>
${variantPreviewBlocks}
        </div>
      </Fragment>
    );
  },
  save: () => {
${anyUsesInnerBlocks || anyPreviewUsesInnerBlocks ? '    return <InnerBlocks.Content />;' : '    return null;'}
  },
});
`;
};

// ─── Helper generators for merged context ─────────────────────────────────────

/**
 * Generate a property control for the merged block context.
 * Uses the merged attribute name for value access and setAttributes.
 */
const generatePropertyControlMerged = (
  key: string,
  property: HandoffProperty,
  mergedAttrName: string,
  indent: string = '                ',
): string => {
  const label = property.name || toTitleCase(key);

  switch (property.type) {
    case 'text':
      return `<TextControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${mergedAttrName} || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: value })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;

    case 'number':
      return `<RangeControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${mergedAttrName} || 0}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: value })}
${indent}  min={0}
${indent}  max={100}
${indent}/>`;

    case 'boolean':
      return `<ToggleControl
${indent}  label={__('${label}', 'handoff')}
${indent}  checked={${mergedAttrName} || false}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: value })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;

    case 'select':
      const opts = (property.options || []).map((o) => `{ label: '${o.label.replace(/'/g, "\\'")}', value: '${o.value}' }`).join(', ');
      return `<SelectControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${mergedAttrName} || ''}
${indent}  options={[${opts}]}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: value })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;

    case 'image':
      return `<MediaUploadCheck>
${indent}  <MediaUpload
${indent}    onSelect={(media) => setAttributes({ ${mergedAttrName}: { id: media.id, src: media.url, alt: media.alt || '' } })}
${indent}    allowedTypes={['image']}
${indent}    value={${mergedAttrName}?.id}
${indent}    render={({ open }) => (
${indent}      <Button onClick={open} variant="secondary" style={{ width: '100%', justifyContent: 'center' }}>
${indent}        {${mergedAttrName}?.src ? __('Replace Image', 'handoff') : __('Select Image', 'handoff')}
${indent}      </Button>
${indent}    )}
${indent}  />
${indent}</MediaUploadCheck>`;

    case 'link':
      return `<TextControl
${indent}  label={__('${label} - Label', 'handoff')}
${indent}  value={${mergedAttrName}?.label || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: { ...${mergedAttrName}, label: value } })}
${indent}  __nextHasNoMarginBottom
${indent}/>
${indent}<TextControl
${indent}  label={__('${label} - URL', 'handoff')}
${indent}  value={${mergedAttrName}?.url || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: { ...${mergedAttrName}, url: value } })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;

    case 'button':
      return `<TextControl
${indent}  label={__('${label} - Label', 'handoff')}
${indent}  value={${mergedAttrName}?.label || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: { ...${mergedAttrName}, label: value } })}
${indent}  __nextHasNoMarginBottom
${indent}/>
${indent}<TextControl
${indent}  label={__('${label} - URL', 'handoff')}
${indent}  value={${mergedAttrName}?.href || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: { ...${mergedAttrName}, href: value } })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;

    case 'object':
      if (!property.properties) return `{/* Object: ${label} */}`;
      const objectControls = Object.entries(property.properties)
        .map(([subKey, subProp]) => {
          const subLabel = subProp.name || toTitleCase(subKey);
          return `<TextControl
${indent}  label={__('${subLabel}', 'handoff')}
${indent}  value={${mergedAttrName}?.${subKey} || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: { ...${mergedAttrName}, ${subKey}: value } })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;
        })
        .join(`\n${indent}`);
      return objectControls;

    default:
      return `<TextControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${mergedAttrName} || ''}
${indent}  onChange={(value) => setAttributes({ ${mergedAttrName}: value })}
${indent}  __nextHasNoMarginBottom
${indent}/>`;
  }
};

const generateArrayHelpersMerged = (
  properties: Record<string, HandoffProperty>,
  fieldMap: FieldMap,
): string => {
  const helpers: string[] = [];
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type !== 'array') continue;
    const attrName = fieldMap[key] || toCamelCase(key);
    helpers.push(`
    const update${attrName.charAt(0).toUpperCase() + attrName.slice(1)}Item = (index, field, value) => {
      const newItems = [...(${attrName} || [])];
      newItems[index] = { ...newItems[index], [field]: value };
      setAttributes({ ${attrName}: newItems });
    };`);
  }
  return helpers.join('\n');
};

// ─── Merged render.php ──────────────────────────────────────────────────────

const generateMergedRenderPhp = (
  groupSlug: string,
  variants: VariantInfo[],
  fieldMaps: Record<string, FieldMap>,
): string => {
  const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const defaultVariant = variants[0].component.id;

  const cases: string[] = [];

  for (const variant of variants) {
    const comp = variant.component;
    const fieldMap = fieldMaps[comp.id];

    const richtextProps = new Set<string>();
    if (variant.innerBlocksField) {
      richtextProps.add(variant.innerBlocksField);
      richtextProps.add(toCamelCase(variant.innerBlocksField));
    }

    // Generate attribute extraction for this variant using merged attribute names
    const extractions: string[] = [];
    for (const [key, property] of Object.entries(comp.properties)) {
      if (property.type === 'richtext' && key === variant.innerBlocksField) continue;
      if (property.type === 'pagination') continue;
      const mergedAttrName = fieldMap[key] || toCamelCase(key);
      const origCamel = toCamelCase(key);
      const defaultValue = getPhpDefaultValue(property);
      // Extract from $attributes using the merged name, assign to the original variable name for template compatibility
      extractions.push(`    $${origCamel} = isset($attributes['${mergedAttrName}']) ? $attributes['${mergedAttrName}'] : ${defaultValue};`);
    }

    // Convert the Handlebars template to PHP
    const templatePhp = handlebarsToPhp(comp.code, comp.properties, richtextProps);
    const className = comp.id.replace(/_/g, '-');

    cases.push(`  case '${comp.id}':
${extractions.join('\n')}
    ?>
    <div class="${className}">
${templatePhp}
    </div>
    <?php
    break;`);
  }

  return `<?php
/**
 * Server-side rendering for ${toTitleCase(groupSlug)} (merged group block)
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Block default content.
 * @param WP_Block $block      Block instance.
 * @return string Returns the block markup.
 */

if (!defined('ABSPATH')) {
  exit;
}

if (!isset($attributes)) {
  $attributes = [];
}

$variant = isset($attributes['handoffVariant']) ? $attributes['handoffVariant'] : '${defaultVariant}';
?>
<div <?php echo get_block_wrapper_attributes(['class' => '${blockName}']); ?>>
<?php
switch ($variant) {
${cases.join('\n\n')}

  default:
    echo '<!-- Unknown variant: ' . esc_html($variant) . ' -->';
    break;
}
?>
</div>
`;
};

// ─── PHP default value helper ──────────────────────────────────────────────

const getPhpDefaultValue = (property: HandoffProperty): string => {
  switch (property.type) {
    case 'text':
    case 'richtext':
    case 'select':
      return `'${(property.default || '').replace(/'/g, "\\'")}'`;
    case 'number':
      return `${property.default ?? 0}`;
    case 'boolean':
      return property.default ? 'true' : 'false';
    case 'image':
      return "['src' => '', 'alt' => '']";
    case 'link':
      return "['label' => '', 'url' => '', 'opensInNewTab' => false]";
    case 'button':
      return "['label' => '', 'href' => '#', 'target' => '', 'rel' => '', 'disabled' => false]";
    case 'object':
      return '[]';
    case 'array':
      return '[]';
    default:
      return "''";
  }
};

// ─── Merged SCSS ─────────────────────────────────────────────────────────────

const generateMergedEditorScss = (variants: VariantInfo[]): string => {
  return variants
    .map((v) => generateEditorScss(v.component))
    .join('\n\n');
};

const generateMergedStyleScss = (variants: VariantInfo[]): string => {
  return variants
    .map((v) => generateStyleScss(v.component))
    .join('\n\n');
};

// ─── Merged Migration Schema ──────────────────────────────────────────────

const generateMergedMigrationSchema = (
  groupSlug: string,
  groupTitle: string,
  variants: VariantInfo[],
): string => {
  const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const variantSchemas: Record<string, any> = {};
  for (const variant of variants) {
    const comp = variant.component;
    const properties: Record<string, MigrationPropertySchema> = {};
    for (const [key, prop] of Object.entries(comp.properties)) {
      if (prop.type === 'pagination') continue;
      properties[key] = extractMigrationProperty(prop, true, key);
    }
    variantSchemas[comp.id] = {
      title: comp.title,
      description: (comp.description || '').replace(/\n\s+/g, ' ').trim(),
      properties,
    };
  }

  const schema = {
    blockName: `handoff/${blockName}`,
    title: groupTitle,
    description: `${groupTitle} block with ${variants.length} variations.`,
    category: groupToCategory(groupSlug),
    isMergedGroup: true,
    variants: variantSchemas,
  };

  return JSON.stringify(schema, null, 2);
};

// ─── Merged README ──────────────────────────────────────────────────────────

const generateMergedReadme = (
  groupSlug: string,
  groupTitle: string,
  variants: VariantInfo[],
): string => {
  const variantList = variants
    .map((v) => `- **${v.component.title}** (\`${v.component.id}\`)`)
    .join('\n');

  return `# ${groupTitle} (Merged Group Block)

This block combines ${variants.length} component variations into a single WordPress block.

## Variations

${variantList}

## Usage

Select the desired variation from the "Block Type" panel in the sidebar inspector.
Each variation has its own set of controls and renders its own template.
`;
};

// ─── Main Generator ─────────────────────────────────────────────────────────

/**
 * Generate a merged block for a group of components.
 */
export const generateMergedBlock = (
  groupSlug: string,
  components: HandoffComponent[],
  variantInfos: VariantInfo[],
): GeneratedBlock => {
  const groupTitle = toTitleCase(groupSlug);

  const supersetResult = buildSupersetAttributes(variantInfos, groupSlug);
  const { attributes: supersetAttrs, fieldMaps } = supersetResult;

  return {
    blockJson: generateMergedBlockJson(groupSlug, groupTitle, variantInfos, supersetAttrs),
    indexJs: generateMergedIndexJs(groupSlug, groupTitle, variantInfos, supersetAttrs, fieldMaps),
    renderPhp: generateMergedRenderPhp(groupSlug, variantInfos, fieldMaps),
    editorScss: generateMergedEditorScss(variantInfos),
    styleScss: generateMergedStyleScss(variantInfos),
    readme: generateMergedReadme(groupSlug, groupTitle, variantInfos),
    migrationSchema: generateMergedMigrationSchema(groupSlug, groupTitle, variantInfos),
  };
};

export type { VariantInfo };
