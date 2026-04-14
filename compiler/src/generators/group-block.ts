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
  BreadcrumbsArrayConfig,
  TaxonomyArrayConfig,
  PaginationArrayConfig,
  GeneratedBlock,
  ItemOverrideFieldConfig,
  BlockJsonOutput,
  HandoffMetadata,
  isBreadcrumbsConfig,
  isTaxonomyConfig,
  isPaginationConfig,
} from '../types';
import { toCamelCase, generateJsxPreview, JsxPreviewResult } from './handlebars-to-jsx';
import { normalizeSelectOptions, type NormalizedSelectOption } from './handlebars-to-jsx/utils';
import { mapPropertyType, groupToCategory, toBlockName } from './block-json';
import { generateRenderPhp, handlebarsToPhp, arrayToPhp, getPhpDefaultValue, generateDynamicArrayExtraction, generateBreadcrumbsArrayExtraction, generateTaxonomyArrayExtraction, generatePaginationArrayExtraction, buildReshapeJs } from './render-php';
import { generateEditorScss, generateStyleScss } from './styles';
import { generateMigrationSchema, MigrationSchema, MigrationPropertySchema, extractMigrationProperty } from './schema-json';
import { toTitleCase, generateFieldControl, generateArrayControl } from './index-js';
import type { FieldContext } from './index-js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-variant mapping from original field name to merged attribute name */
export type FieldMap = Record<string, string>;

type AnyDynamicArrayConfig = DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig;

interface VariantInfo {
  component: HandoffComponent;
  fieldMap: FieldMap;
  innerBlocksField: string | null;
  dynamicArrayConfigs: Record<string, AnyDynamicArrayConfig>;
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
 * Convert a variant ID (e.g. "hero-basic", "hero_search") into a valid camelCase
 * identifier for use in prefixed attribute names. Ensures generated JS can destructure
 * attributes without quoting (no hyphens in names).
 */
const variantIdToCamel = (variantId: string): string => {
  const s = (variantId ?? '')
    .replace(/[-_]([a-z])/g, (_, l: string) => l.toUpperCase())
    .replace(/[-_]/g, '');
  return s.charAt(0).toLowerCase() + s.slice(1);
};

/** Variant ID to PascalCase for JS import/component name (e.g. hero-article -> HeroArticle). */
const variantIdToPascal = (variantId: string): string => {
  const camel = variantIdToCamel(variantId);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
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

      if (isBreadcrumbsConfig(dynConfig)) {
        dynFields[`${attrName}Enabled`] = { type: 'boolean', default: true };
      } else if (isTaxonomyConfig(dynConfig)) {
        dynFields[`${attrName}Enabled`] = { type: 'boolean', default: false };
        dynFields[`${attrName}Taxonomy`] = { type: 'string', default: dynConfig.taxonomies[0] || 'post_tag' };
        dynFields[`${attrName}Source`] = { type: 'string', default: 'auto' };
      } else if (isPaginationConfig(dynConfig)) {
        dynFields[`${attrName}Enabled`] = { type: 'boolean', default: true };
      } else {
        // DynamicArrayConfig (posts)
        const sourceDefault = dynConfig.selectionMode === 'manual' ? 'select' : 'query';
        dynFields[`${attrName}Source`] = { type: 'string', default: sourceDefault, enum: ['query', 'select', 'manual'] };
        dynFields[`${attrName}PostType`] = { type: 'string', default: dynConfig.defaultPostType || dynConfig.postTypes[0] || 'post' };
        dynFields[`${attrName}SelectedPosts`] = { type: 'array', default: [] };
        dynFields[`${attrName}QueryArgs`] = { type: 'object', default: { post_type: dynConfig.defaultPostType || dynConfig.postTypes[0] || 'post', posts_per_page: dynConfig.maxItems || 6, orderby: 'date', order: 'DESC', tax_query: [], ...(dynConfig.defaultQueryArgs || {}) } };
        dynFields[`${attrName}FieldMapping`] = { type: 'object', default: dynConfig.fieldMapping || {} };
        dynFields[`${attrName}ItemOverrides`] = { type: 'object', default: {} };
        dynFields[`${attrName}RenderMode`] = { type: 'string', default: dynConfig.renderMode || 'mapped' };
      }

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
      // Conflicting — prefix with variant slug (must be valid JS identifier for destructuring)
      for (const entry of entries) {
        const variantCamel = variantIdToCamel(entry.variantId);
        const prefixed = variantCamel + entry.attrName.charAt(0).toUpperCase() + entry.attrName.slice(1);
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
      // Only show in inserter; variation switching is done via the sidebar control only (no Transform to variation)
      scope: ['inserter'],
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

/**
 * Replace occurrences of a regex pattern only in code segments,
 * skipping content inside quoted strings (single, double, or backtick).
 * This prevents field name remapping from corrupting CSS class names
 * and other string literals in the generated JSX.
 */
const replaceOutsideStrings = (jsx: string, pattern: RegExp, replacement: string): string => {
  const segments: string[] = [];
  let i = 0;
  let inString: string | null = null;
  let segStart = 0;

  while (i < jsx.length) {
    if (inString) {
      if (jsx[i] === '\\') {
        i += 2;
        continue;
      }
      if (jsx[i] === inString) {
        segments.push(jsx.slice(segStart, i + 1));
        segStart = i + 1;
        inString = null;
      }
      i++;
    } else {
      if (jsx[i] === '"' || jsx[i] === "'" || jsx[i] === '`') {
        const nonStringPart = jsx.slice(segStart, i);
        segments.push(nonStringPart.replace(pattern, replacement));
        segStart = i;
        inString = jsx[i];
        i++;
      } else {
        i++;
      }
    }
  }

  if (segStart < jsx.length) {
    const remaining = jsx.slice(segStart);
    if (inString) {
      segments.push(remaining);
    } else {
      segments.push(remaining.replace(pattern, replacement));
    }
  }

  return segments.join('');
};

interface MergedIndexResult {
  indexJs: string;
  variationJs: Record<string, string>;
}

const generateMergedIndexJs = (
  groupSlug: string,
  groupTitle: string,
  variants: VariantInfo[],
  supersetAttrs: Record<string, GutenbergAttribute>,
  fieldMaps: Record<string, FieldMap>,
  apiUrl?: string,
): MergedIndexResult => {
  const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // Collect all unique features needed across variants
  let needsMediaUpload = false;
  let needsRangeControl = false;
  let needsToggleControl = false;
  let needsSelectControl = false;
  let needsLinkControl = false;
  let hasArrayProps = false;
  let anyHasDynamicArrays = false;
  let anyHasBreadcrumbsArrays = false;
  let anyHasTaxonomyArrays = false;
  let anyHasPaginationArrays = false;
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
    specializedResolution: string;
    hasBreadcrumbsFetch: boolean;
    hasTaxonomyFetch: boolean;
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
    if (hasDynamic) {
      const hasPostsDynamic = Object.values(dynamicArrayConfigs).some((c) => !('arrayType' in c));
      if (hasPostsDynamic) { anyHasDynamicArrays = true; needsSelectControl = true; }
      // Breadcrumbs/taxonomy/pagination use shared components — they import their own
      // ToggleControl/SelectControl, so we do not need to add those to the group block imports.
      if (Object.values(dynamicArrayConfigs).some((c) => isBreadcrumbsConfig(c))) anyHasBreadcrumbsArrays = true;
      if (Object.values(dynamicArrayConfigs).some((c) => isTaxonomyConfig(c))) anyHasTaxonomyArrays = true;
      if (Object.values(dynamicArrayConfigs).some((c) => isPaginationConfig(c))) anyHasPaginationArrays = true;
    }
    if (variant.innerBlocksField) anyUsesInnerBlocks = true;

    // Generate preview (guard against missing code/title from API)
    const previewResult: JsxPreviewResult = generateJsxPreview(
      comp.code ?? '',
      properties,
      comp.id ?? comp.title ?? 'variant',
      comp.title ?? comp.id ?? 'Variant',
      variant.innerBlocksField,
    );
    let previewJsx = previewResult.jsx ?? '';
    const inlineEditableFields = previewResult.inlineEditableFields;

    const varHasLinkField = previewJsx.includes('<HandoffLinkField');
    const varHasRichText = previewJsx.includes('<RichText');
    const varHas10upImage = previewJsx.includes('<Image');
    const varHasInnerBlocks = previewJsx.includes('<InnerBlocks');
    if (varHasLinkField) anyPreviewUsesLinkField = true;
    if (varHasRichText) anyPreviewUsesRichText = true;
    if (varHas10upImage) anyPreviewUses10upImage = true;
    if (varHasInnerBlocks) anyPreviewUsesInnerBlocks = true;

    // Remap attribute references in preview JSX using fieldMap.
    // Uses replaceOutsideStrings to avoid corrupting CSS class names
    // and other string literals that happen to contain the field name.
    for (const [origKey, mergedName] of Object.entries(fieldMap)) {
      const origCamel = toCamelCase(origKey);
      if (origCamel !== mergedName) {
        const regex = new RegExp(`\\b${origCamel}\\b`, 'g');
        previewJsx = replaceOutsideStrings(previewJsx, regex, mergedName);
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
        if (isBreadcrumbsConfig(dynamicConfig)) {
          panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                <BreadcrumbsSelector
                  attrName="${mergedAttrName}"
                  attributes={attributes}
                  setAttributes={setAttributes}
                />
              </PanelBody>`);
        } else if (isTaxonomyConfig(dynamicConfig)) {
          const taxonomyOptions = dynamicConfig.taxonomies.map((t) => ({ label: t, value: t }));
          const defaultTaxonomy = dynamicConfig.taxonomies[0] || 'post_tag';
          const itemProps = property.items?.properties || {};
          const itemFields = Object.keys(itemProps).length > 0
            ? Object.entries(itemProps).map(([fieldKey, fieldProp]) => {
                const ctx: FieldContext = {
                  valueAccessor: `item.${fieldKey}`,
                  onChangeHandler: (val: string) => `setItem({ ...item, ${fieldKey}: ${val} })`,
                  indent: '                  ',
                };
                return generateFieldControl(fieldKey, fieldProp, ctx);
              }).filter(Boolean).join('\n')
            : `                  <TextControl label={__('Label', 'handoff')} value={item.label || ''} onChange={(v) => setItem({ ...item, label: v })} __nextHasNoMarginBottom />
                  <TextControl label={__('URL', 'handoff')} value={item.url || ''} onChange={(v) => setItem({ ...item, url: v })} __nextHasNoMarginBottom />`;
          panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                <TaxonomySelector
                  attrName="${mergedAttrName}"
                  attributes={attributes}
                  setAttributes={setAttributes}
                  taxonomyOptions={${JSON.stringify(taxonomyOptions)}}
                  defaultTaxonomy="${defaultTaxonomy}"
                  label={__('Show ${label}', 'handoff')}
                  renderManualItems={(item, index, setItem, removeItem) => (
                    <>
${itemFields}
                    </>
                  )}
                />
              </PanelBody>`);
        } else if (isPaginationConfig(dynamicConfig)) {
          panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                <PaginationSelector
                  attrName="${mergedAttrName}"
                  attributes={attributes}
                  setAttributes={setAttributes}
                />
              </PanelBody>`);
        } else {
          // DynamicArrayConfig (posts)
          const defaultMode = dynamicConfig.selectionMode === 'manual' ? 'select' : 'query';
          const itemOverridesConfig = dynamicConfig.itemOverridesConfig || {};
          const advancedFields: Array<{ name: string; label: string; type: string; options?: Array<{ label: string; value: string }>; default?: any }> = [];

          for (const [name, c] of Object.entries(itemOverridesConfig) as Array<[string, ItemOverrideFieldConfig]>) {
            if (c.mode === 'ui') advancedFields.push({ name, label: c.label, type: 'select', options: normalizeSelectOptions(c.options), default: c.default });
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
                  case 'select': controlType = 'select'; options = normalizeSelectOptions(itemProp.options); break;
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
        }
      } else {
        const controlIndent = '                ';
        let controlOutput: string;
        if (property.type === 'array') {
          controlOutput = generateArrayControl(key, property, mergedAttrName, label, controlIndent);
        } else {
          const ctx: FieldContext = {
            valueAccessor: mergedAttrName,
            onChangeHandler: (value: string) => `setAttributes({ ${mergedAttrName}: ${value} })`,
            indent: controlIndent,
          };
          controlOutput = generateFieldControl(key, property, ctx);
        }
        panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
${controlOutput}
              </PanelBody>`);
      }
    }


    // Design System links panel (per-variant component URLs)
    let handoffUrl: string | undefined;
    if (apiUrl) {
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      handoffUrl = `${baseUrl}/system/component/${comp.id}`;
    } else if (comp.preview) {
      handoffUrl = comp.preview;
    }
    const figmaUrl = comp.figma;
    if (handoffUrl || figmaUrl) {
      const linkButtons: string[] = [];
      if (handoffUrl) {
        linkButtons.push(`                  <Button
                    variant="secondary"
                    href="${handoffUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    icon="visibility"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {__('View in Handoff', 'handoff')}
                  </Button>`);
      }
      if (figmaUrl) {
        linkButtons.push(`                  <Button
                    variant="secondary"
                    href="${figmaUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    icon="art"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {__('Open in Figma', 'handoff')}
                  </Button>`);
      }
      panels.push(`              <PanelBody title={__('Design System', 'handoff')} initialOpen={false}>
                <Flex direction="column" gap={3}>
${linkButtons.join('\n')}
                </Flex>
              </PanelBody>`);
    }

    // Dynamic array resolution code
    // Specialized arrays (breadcrumbs/taxonomy/pagination) resolve in the
    // variation file's Preview function so the hooks live in the correct scope.
    // Dynamic post arrays resolve in the main index.js edit().
    let dynamicResolution = '';
    let specializedResolution = '';
    let varHasBreadcrumbsFetch = false;
    let varHasTaxonomyFetch = false;
    const resolvingFlags: string[] = [];
    if (hasDynamic) {
      for (const [fieldKey, dynConfig] of Object.entries(dynamicArrayConfigs)) {
        const mergedAttrName = fieldMap[fieldKey] || toCamelCase(fieldKey);
        const fieldProp = properties[fieldKey];
        const itemProps = fieldProp?.items?.properties;

        if (isBreadcrumbsConfig(dynConfig)) {
          varHasBreadcrumbsFetch = true;
          const cap = mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1);
          const reshapeJs = buildReshapeJs(itemProps, ['label', 'url']);
          const mapExpr = reshapeJs ? `.map((item) => ${reshapeJs})` : '';
          specializedResolution += `
  const [preview${cap}, setPreview${cap}] = useState(null);
  useEffect(() => {
    if (!${mergedAttrName}Enabled) { setPreview${cap}([]); return; }
    const postId = select('core/editor')?.getCurrentPostId?.();
    if (!postId) { setPreview${cap}([]); return; }
    apiFetch({ path: \`/handoff/v1/breadcrumbs?post_id=\${postId}\` })
      .then((items) => setPreview${cap}((items || [])${mapExpr}))
      .catch(() => setPreview${cap}([]));
  }, [${mergedAttrName}Enabled]);
`;
          const arrayVarRegex = new RegExp(`\\b${mergedAttrName}\\b(?!Enabled)`, 'g');
          previewJsx = previewJsx.replace(arrayVarRegex, `preview${cap}`);
          continue;
        }

        if (isTaxonomyConfig(dynConfig)) {
          varHasTaxonomyFetch = true;
          const cap = mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1);
          const reshapeJs = buildReshapeJs(itemProps, ['label', 'url', 'slug']);
          const mapExpr = reshapeJs ? `.map((item) => ${reshapeJs})` : '';
          specializedResolution += `
  const preview${cap} = useSelect(
    (select) => {
      if (!${mergedAttrName}Enabled) return [];
      if (${mergedAttrName}Source === 'manual') return ${mergedAttrName} || [];
      const postId = select('core/editor')?.getCurrentPostId?.();
      if (!postId) return [];
      const taxonomy = ${mergedAttrName}Taxonomy || '${dynConfig.taxonomies[0] || 'post_tag'}';
      const restBase = select(coreDataStore).getTaxonomy(taxonomy)?.rest_base;
      if (!restBase) return [];
      const terms = select(coreDataStore).getEntityRecords('taxonomy', taxonomy, { post: postId, per_page: ${dynConfig.maxItems ?? -1} });
      if (!terms) return [];
      return terms.map((t) => ({ label: t.name, url: t.link || '', slug: t.slug || '' }))${mapExpr};
    },
    [${mergedAttrName}Enabled, ${mergedAttrName}Source, ${mergedAttrName}Taxonomy, JSON.stringify(${mergedAttrName} || [])]
  );
`;
          const arrayVarRegex = new RegExp(`\\b${mergedAttrName}\\b(?!Enabled|Source|Taxonomy)`, 'g');
          previewJsx = previewJsx.replace(arrayVarRegex, `preview${cap}`);
          continue;
        }

        if (isPaginationConfig(dynConfig)) {
          specializedResolution += `
  const preview${mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1)} = []; // Pagination renders on the frontend
`;
          const arrayVarRegex = new RegExp(`\\b${mergedAttrName}\\b(?!Enabled)`, 'g');
          previewJsx = previewJsx.replace(arrayVarRegex, `preview${mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1)}`);
          continue;
        }
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
      specializedResolution,
      hasBreadcrumbsFetch: varHasBreadcrumbsFetch,
      hasTaxonomyFetch: varHasTaxonomyFetch,
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

  const componentImports = ['PanelBody', 'TextControl', 'Button', 'SelectControl', 'DropdownMenu'];
  if (needsRangeControl) componentImports.push('RangeControl');
  if (needsToggleControl) componentImports.push('ToggleControl');
  if (anyHasDynamicArrays) componentImports.push('Spinner');
  componentImports.push('Flex');
  if (needsLinkControl || anyPreviewUsesLinkField) componentImports.push('Popover');

  // Repeater is only needed for non-server-rendered array properties across all variants
  const anyVariantHasNonSpecialArrays = variants.some((v) =>
    Object.entries(v.component.properties).some(
      ([k, p]) => p.type === 'array' && (!v.dynamicArrayConfigs[k] || !('arrayType' in v.dynamicArrayConfigs[k]))
    )
  );
  const tenUpImports: string[] = [];
  if (anyVariantHasNonSpecialArrays) tenUpImports.push('Repeater');
  if (anyPreviewUses10upImage) tenUpImports.push('Image');
  const tenUpImport = tenUpImports.length > 0 ? `import { ${tenUpImports.join(', ')} } from '@10up/block-components';\n` : '';

  const sharedNamedImports: string[] = [];
  if (anyHasDynamicArrays) sharedNamedImports.push('DynamicPostSelector', 'mapPostEntityToItem');
  if (anyHasBreadcrumbsArrays) sharedNamedImports.push('BreadcrumbsSelector');
  if (anyHasTaxonomyArrays) sharedNamedImports.push('TaxonomySelector');
  if (anyHasPaginationArrays) sharedNamedImports.push('PaginationSelector');

  let sharedComponentImport = sharedNamedImports.length
    ? `import { ${sharedNamedImports.join(', ')} } from '../../shared';\n`
    : '';
  const needsDataStore = anyHasDynamicArrays || anyHasTaxonomyArrays;
  if (needsDataStore) {
    sharedComponentImport += `import { useSelect${anyHasBreadcrumbsArrays ? ', select' : ''} } from '@wordpress/data';\nimport { store as coreDataStore } from '@wordpress/core-data';\n`;
  }
  if (anyHasBreadcrumbsArrays) {
    sharedComponentImport += `import apiFetch from '@wordpress/api-fetch';\n`;
  }
  if (anyPreviewUsesLinkField) {
    sharedComponentImport += `import { HandoffLinkField } from '../../shared/components/LinkField';\n`;
  }

  const elementImports = ['Fragment'];
  if (anyHasBreadcrumbsArrays) {
    elementImports.push('useState', 'useEffect');
  }

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
      if (isBreadcrumbsConfig(dynConfig) || isPaginationConfig(dynConfig)) {
        allAttrNames.add(`${attrName}Enabled`);
        continue;
      }
      if (isTaxonomyConfig(dynConfig)) {
        allAttrNames.add(`${attrName}Enabled`);
        allAttrNames.add(`${attrName}Taxonomy`);
        allAttrNames.add(`${attrName}Source`);
        continue;
      }
      // DynamicArrayConfig (posts)
      allAttrNames.add(`${attrName}Source`);
      allAttrNames.add(`${attrName}PostType`);
      allAttrNames.add(`${attrName}SelectedPosts`);
      allAttrNames.add(`${attrName}QueryArgs`);
      allAttrNames.add(`${attrName}FieldMapping`);
      allAttrNames.add(`${attrName}ItemOverrides`);
      allAttrNames.add(`${attrName}RenderMode`);
    }
  }

  // Toolbar variation switcher controls (for BlockControls DropdownMenu)
  const toolbarVariantControls = variants
    .map(
      (v) =>
        `        { title: '${(v.component.title ?? v.component.id ?? '').toString().replace(/'/g, "\\'")}', onClick: () => setAttributes({ handoffVariant: '${v.component.id ?? ''}' }) }`,
    )
    .join(',\n');

  // Collect all merged attribute names that are array type (across all variants) so we emit each helper once
  const allArrayMergedNames = new Set<string>();
  for (const v of variants) {
    const fieldMap = fieldMaps[v.component.id];
    for (const [key, prop] of Object.entries(v.component.properties)) {
      if (prop.type === 'array') allArrayMergedNames.add(fieldMap[key] || toCamelCase(key));
    }
  }
  const sharedArrayHelpers = generateSharedArrayHelpers(allArrayMergedNames);

  // Variation include imports and component usage (one file per variant)
  const variantImportLines = variants.map(
    (v) => `import * as ${variantIdToPascal(v.component.id)} from './variations/${v.component.id}';`,
  );
  const helperNamesList = [...allArrayMergedNames].map(
    (a) => `update${a.charAt(0).toUpperCase() + a.slice(1)}Item`,
  );
  if (anyPreviewUsesLinkField) helperNamesList.push('HandoffLinkField');
  if (anyUsesInnerBlocks || anyPreviewUsesInnerBlocks) helperNamesList.push('CONTENT_BLOCKS');
  const helpersObjectLine =
    helperNamesList.length > 0
      ? `    const helpers = { ${helperNamesList.join(', ')} };`
      : '    const helpers = {};';

  const variantPanelBlocks = variants
    .map((v) => {
      const result = variantResults[v.component.id];
      if (!result.panels.trim()) return '';
      const Pascal = variantIdToPascal(v.component.id);
      return `        {handoffVariant === '${v.component.id}' && <${Pascal}.Panels attributes={attributes} setAttributes={setAttributes} helpers={helpers} isSelected={isSelected} />}`;
    })
    .filter(Boolean)
    .join('\n');

  const variantPreviewBlocks = variants
    .map((v) => {
      const Pascal = variantIdToPascal(v.component.id);
      return `          {handoffVariant === '${v.component.id}' && <${Pascal}.Preview attributes={attributes} setAttributes={setAttributes} helpers={helpers} isSelected={isSelected} />}`;
    })
    .join('\n');

  // Per-variant JS include file contents (written to variations/<id>.js)
  const variationJs: Record<string, string> = {};
  for (const v of variants) {
    const result = variantResults[v.component.id];
    const fieldMap = fieldMaps[v.component.id];
    const helperNames = [...allArrayMergedNames]
      .filter((attrName) => {
        for (const [key, prop] of Object.entries(v.component.properties)) {
          if (prop.type === 'array' && (fieldMaps[v.component.id][key] || toCamelCase(key)) === attrName)
            return true;
        }
        return false;
      })
      .map((a) => `update${a.charAt(0).toUpperCase() + a.slice(1)}Item`);
    variationJs[v.component.id] = generateVariantJsFileContent(
      v,
      result,
      fieldMap,
      helperNames,
      anyPreviewUsesLinkField,
    );
  }

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

  // Generate dynamic resolution per variant; array helpers are emitted once above (sharedArrayHelpers)
  let combinedDynamicCode = sharedArrayHelpers.trim() ? `\n${sharedArrayHelpers}` : '';
  for (const v of variants) {
    const result = variantResults[v.component.id];
    if (result.dynamicResolution.trim()) {
      combinedDynamicCode += result.dynamicResolution;
    }
  }

  const attrNamesList = Array.from(allAttrNames);

  // Generate variant-conditional MediaReplaceFlow toolbar entries for image fields
  const variantMediaReplaceBlocks: string[] = [];
  for (const v of variants) {
    const comp = v.component;
    const fieldMap = fieldMaps[comp.id];
    const imageEntries: Array<{ label: string; mergedAttrName: string }> = [];

    const collectImages = (props: Record<string, HandoffProperty>, parentPath: string = '') => {
      for (const [key, prop] of Object.entries(props)) {
        const mergedName = parentPath
          ? `${fieldMap[parentPath] || toCamelCase(parentPath)}`
          : (fieldMap[key] || toCamelCase(key));
        if (prop.type === 'image') {
          imageEntries.push({
            label: prop.name || toTitleCase(key),
            mergedAttrName: parentPath ? mergedName : mergedName,
          });
        }
        if (prop.type === 'object' && prop.properties) {
          collectImages(prop.properties, key);
        }
      }
    };
    collectImages(comp.properties);

    if (imageEntries.length > 0) {
      const mediaFlows = imageEntries.map((img) =>
        `            <MediaReplaceFlow
              mediaId={${img.mergedAttrName}?.id}
              mediaUrl={${img.mergedAttrName}?.src}
              allowedTypes={['image']}
              accept="image/*"
              onSelect={(media) => setAttributes({ ${img.mergedAttrName}: { id: media.id, src: media.url, alt: media.alt || '' } })}
              name={__('${img.label}', 'handoff')}
            />`
      ).join('\n');
      variantMediaReplaceBlocks.push(
        `        {handoffVariant === '${comp.id}' && (\n          <BlockControls group="other">\n${mediaFlows}\n          </BlockControls>\n        )}`
      );
    }
  }
  const mediaReplaceJsx = variantMediaReplaceBlocks.length > 0
    ? '\n' + variantMediaReplaceBlocks.join('\n')
    : '';

  const indexJsTemplate = `import { registerBlockType } from '@wordpress/blocks';
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
${variantImportLines.join('\n')}
registerBlockType(metadata.name, {
  ...metadata,
  edit: ({ attributes, setAttributes, isSelected }) => {
    const blockProps = useBlockProps();
${anyUsesInnerBlocks || anyPreviewUsesInnerBlocks ? "    const CONTENT_BLOCKS = ['core/paragraph','core/heading','core/list','core/list-item','core/quote','core/image','core/separator','core/html','core/buttons','core/button'];" : ''}
    const { ${attrNamesList.join(', ')} } = attributes;
${combinedDynamicCode}
${helpersObjectLine}
    return (
      <Fragment>
        <BlockControls group="block">
          <DropdownMenu
            icon="layout"
            label={__('Variation', 'handoff')}
            controls={[
${toolbarVariantControls}
            ]}
          />
        </BlockControls>${mediaReplaceJsx}
        <InspectorControls>
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
  return { indexJs: indexJsTemplate, variationJs };
};

// ─── Helper generators for merged context ─────────────────────────────────────

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

/** Generate array update helpers once per merged attribute name (avoids duplicate declarations across variants). */
const generateSharedArrayHelpers = (mergedArrayAttrNames: Set<string>): string => {
  const helpers: string[] = [];
  for (const attrName of mergedArrayAttrNames) {
    const helperName = `update${attrName.charAt(0).toUpperCase() + attrName.slice(1)}Item`;
    helpers.push(`
    const ${helperName} = (index, field, value) => {
      const newItems = [...(${attrName} || [])];
      newItems[index] = { ...newItems[index], [field]: value };
      setAttributes({ ${attrName}: newItems });
    };`);
  }
  return helpers.join('\n');
};

/** Collect attribute names referenced in JSX (setAttributes({ x: or value={x}) so we destructure them even if not in fieldMap. */
const collectAttrNamesFromJsx = (jsx: string): Set<string> => {
  const names = new Set<string>();
  const setAttrRegex = /setAttributes\s*\(\s*\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = setAttrRegex.exec(jsx)) !== null) names.add(m[1]);
  const valueRegex = /value=\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*[\|\?\&\|\!]|[\s\n\r]*\?\?|[\s\n\r]*\|\|)/g;
  while ((m = valueRegex.exec(jsx)) !== null) names.add(m[1]);
  const condRegex = /\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*&&/g;
  while ((m = condRegex.exec(jsx)) !== null) names.add(m[1]);
  return names;
};

/** Generate the JS content for one variation include file (exports Panels and Preview). */
const generateVariantJsFileContent = (
  variant: VariantInfo,
  result: { panels: string; previewJsx: string; specializedResolution?: string; hasBreadcrumbsFetch?: boolean; hasTaxonomyFetch?: boolean },
  fieldMap: FieldMap,
  helperNames: string[],
  anyPreviewUsesLinkField: boolean,
): string => {
  const comp = variant.component;
  const variantDynConfigs = variant.dynamicArrayConfigs;
  const fromFieldMap = new Set(Object.values(fieldMap));
  // Scan preview JSX and panel JSX for attribute names to destructure.
  const fromPreview = collectAttrNamesFromJsx(result.previewJsx + '\n' + result.panels);
  // Collect variable names declared locally by the specialized resolution code
  // (e.g. previewBreadcrumb from useState, previewTags from useSelect).
  // These must NOT be destructured from attributes or they'll conflict.
  const locallyDeclared = new Set<string>();
  if (result.specializedResolution) {
    const stateMatch = result.specializedResolution.matchAll(/const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState/g);
    for (const m of stateMatch) { locallyDeclared.add(m[1]); locallyDeclared.add(m[2]); }
    const selectMatch = result.specializedResolution.matchAll(/const\s+(\w+)\s*=\s*useSelect/g);
    for (const m of selectMatch) { locallyDeclared.add(m[1]); }
  }
  const reserved = new Set(['index', 'value', 'item', 'e', 'key', 'open']);
  fromPreview.forEach((name) => {
    if (!reserved.has(name) && !locallyDeclared.has(name)) fromFieldMap.add(name);
  });
  // Ensure specialized array synthetic attributes are destructured
  for (const [fieldKey, dynConfig] of Object.entries(variantDynConfigs)) {
    const mergedAttrName = fieldMap[fieldKey] || toCamelCase(fieldKey);
    if (isBreadcrumbsConfig(dynConfig) || isPaginationConfig(dynConfig)) {
      fromFieldMap.add(`${mergedAttrName}Enabled`);
    }
    if (isTaxonomyConfig(dynConfig)) {
      fromFieldMap.add(`${mergedAttrName}Enabled`);
      fromFieldMap.add(`${mergedAttrName}Taxonomy`);
      fromFieldMap.add(`${mergedAttrName}Source`);
    }
  }
  const attrNames = [...fromFieldMap];
  const helpersDestruct = [...helperNames];
  if (anyPreviewUsesLinkField) helpersDestruct.push('HandoffLinkField');
  if (variant.innerBlocksField) helpersDestruct.push('CONTENT_BLOCKS');

  const attrDestruct = attrNames.length ? `  const { ${attrNames.join(', ')} } = attributes;\n  ` : '';
  const helpersDestructLine =
    helpersDestruct.length > 0 ? `  const { ${helpersDestruct.join(', ')} } = helpers;\n  ` : '';

  const propsList = anyPreviewUsesLinkField ? '{ attributes, setAttributes, helpers, isSelected }' : '{ attributes, setAttributes, helpers }';
  const panelsExport =
    result.panels.trim() === ''
      ? `export function Panels() { return null; }`
      : `export function Panels(${propsList}) {
${attrDestruct}${helpersDestructLine}  return (
    <>
${result.panels}
    </>
  );
}`;

  // Determine which shared selector components this variant's panels use
  const variantHasBreadcrumbs = Object.values(variantDynConfigs).some((c) => isBreadcrumbsConfig(c));
  const variantHasTaxonomy = Object.values(variantDynConfigs).some((c) => isTaxonomyConfig(c));
  const variantHasPagination = Object.values(variantDynConfigs).some((c) => isPaginationConfig(c));
  const variantSharedImports: string[] = [];
  if (variantHasBreadcrumbs) variantSharedImports.push('BreadcrumbsSelector');
  if (variantHasTaxonomy) variantSharedImports.push('TaxonomySelector');
  if (variantHasPagination) variantSharedImports.push('PaginationSelector');
  const sharedSelectorImport = variantSharedImports.length
    ? `import { ${variantSharedImports.join(', ')} } from '../../../shared';\n`
    : '';

  // Only import Repeater when the variant has non-server-rendered array fields
  // (taxonomy/breadcrumbs/pagination are server-rendered; shared components import Repeater themselves)
  const variantHasNonSpecialArrays = Object.entries(comp.properties).some(
    ([k, p]) => p.type === 'array' && (!variantDynConfigs[k] || !('arrayType' in variantDynConfigs[k]))
  );
  const tenUpBlockComponentsImport = (variantHasNonSpecialArrays || result.previewJsx.includes('<Image'))
    ? `import { ${[variantHasNonSpecialArrays ? 'Repeater' : '', result.previewJsx.includes('<Image') ? 'Image' : ''].filter(Boolean).join(', ')} } from '@10up/block-components';\n`
    : '';

  // Specialized array resolution imports (breadcrumbs/taxonomy/pagination hooks run in the variation file)
  const hasSpecializedResolution = !!(result.specializedResolution?.trim());
  const varHasBreadcrumbsFetch = result.hasBreadcrumbsFetch ?? false;
  const varHasTaxonomyFetch = result.hasTaxonomyFetch ?? false;

  const elementImportNames = ['Fragment'];
  if (varHasBreadcrumbsFetch) elementImportNames.push('useState', 'useEffect');

  let dataImport = '';
  if (varHasTaxonomyFetch || varHasBreadcrumbsFetch) {
    const dataNames = ['useSelect'];
    if (varHasBreadcrumbsFetch) dataNames.push('select');
    dataImport += `import { ${dataNames.join(', ')} } from '@wordpress/data';\nimport { store as coreDataStore } from '@wordpress/core-data';\n`;
  }
  if (varHasBreadcrumbsFetch) {
    dataImport += `import apiFetch from '@wordpress/api-fetch';\n`;
  }

  const specializedCode = hasSpecializedResolution ? result.specializedResolution! : '';

  return `/**
 * Variation: ${comp.title} (${comp.id})
 * Generated – do not edit by hand.
 */
import { ${elementImportNames.join(', ')} } from '@wordpress/element';
import {
  PanelBody,
  TextControl,
  Button,
  SelectControl,
  RangeControl,
  ToggleControl,
  Flex,
  Popover,
} from '@wordpress/components';
import { MediaUpload, MediaUploadCheck, MediaReplaceFlow, LinkControl, RichText, InnerBlocks } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
${dataImport}${tenUpBlockComponentsImport}${sharedSelectorImport}
${panelsExport}

export function Preview(${propsList}) {
${attrDestruct}${helpersDestructLine}${specializedCode}
  return (
${result.previewJsx}
  );
}
`;
};

// ─── Merged render.php ──────────────────────────────────────────────────────

/** Generate the PHP fragment for one variant (extractions + template). Used in variation include file. */
const generateVariantPhpFragment = (
  variant: VariantInfo,
  fieldMaps: Record<string, FieldMap>,
): string => {
  const comp = variant.component;
  const fieldMap = fieldMaps[comp.id];

  const richtextProps = new Set<string>();
  if (variant.innerBlocksField) {
    richtextProps.add(variant.innerBlocksField);
    richtextProps.add(toCamelCase(variant.innerBlocksField));
  }

  const extractions: string[] = [];
  for (const [key, property] of Object.entries(comp.properties)) {
    if (property.type === 'richtext' && key === variant.innerBlocksField) continue;
    if (property.type === 'pagination') continue;
    const mergedAttrName = fieldMap[key] || toCamelCase(key);
    const origCamel = toCamelCase(key);
    const defaultValue = getPhpDefaultValue(property);
    extractions.push(`$${origCamel} = isset($attributes['${mergedAttrName}']) ? $attributes['${mergedAttrName}'] : ${defaultValue};`);
  }
  // Dynamic array extraction for specialized array types (breadcrumbs, taxonomy, pagination)
  const dynArrayExtractions: string[] = [];
  if (variant.dynamicArrayConfigs) {
    for (const [fieldName, dynConfig] of Object.entries(variant.dynamicArrayConfigs)) {
      const mergedAttrName = fieldMap[fieldName] || toCamelCase(fieldName);
      const fieldProp = comp.properties[fieldName];
      const itemProps = fieldProp?.items?.properties;

      if (isBreadcrumbsConfig(dynConfig)) {
        dynArrayExtractions.push(generateBreadcrumbsArrayExtraction(fieldName, mergedAttrName, itemProps));
      } else if (isTaxonomyConfig(dynConfig)) {
        dynArrayExtractions.push(generateTaxonomyArrayExtraction(fieldName, mergedAttrName, dynConfig, itemProps));
      } else if (isPaginationConfig(dynConfig)) {
        dynArrayExtractions.push(generatePaginationArrayExtraction(fieldName, mergedAttrName, dynConfig, itemProps));
      } else {
        dynArrayExtractions.push(generateDynamicArrayExtraction(fieldName, mergedAttrName, dynConfig));
      }
    }
  }
  const dynArrayCode = dynArrayExtractions.length ? '\n' + dynArrayExtractions.join('\n') : '';

  const templatePhp = handlebarsToPhp(comp.code ?? '', comp.properties, richtextProps);
  const className = (comp.id ?? '').replace(/_/g, '-');

  return `<?php
// Attribute extraction for variant: ${comp.id}
${extractions.join('\n')}${dynArrayCode}
?>
<div class="${className}">
${templatePhp}
</div>
`;
};

const generateMergedRenderPhp = (
  groupSlug: string,
  variants: VariantInfo[],
  fieldMaps: Record<string, FieldMap>,
): string => {
  const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const defaultVariant = variants[0].component.id;

  const cases: string[] = variants.map(
    (v) => `  case '${v.component.id}':
    include __DIR__ . '/variations/${v.component.id}.php';
    break;`,
  );

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
${cases.join('\n')}

  default:
    echo '<!-- Unknown variant: ' . esc_html($variant) . ' -->';
    break;
}
?>
</div>
`;
};

// getPhpDefaultValue is imported from render-php.ts

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

Select the desired variation from the block toolbar (Variation dropdown).
Each variation has its own set of controls and renders its own template.
`;
};

// ─── Main Generator ─────────────────────────────────────────────────────────

/**
 * Generate a merged block for a group of components.
 * Variation markup is split into include files: variations/<variant-id>.js and variations/<variant-id>.php.
 */
export const generateMergedBlock = (
  groupSlug: string,
  components: HandoffComponent[],
  variantInfos: VariantInfo[],
  apiUrl?: string,
): GeneratedBlock => {
  const groupTitle = toTitleCase(groupSlug);

  const supersetResult = buildSupersetAttributes(variantInfos, groupSlug);
  const { attributes: supersetAttrs, fieldMaps } = supersetResult;

  const { indexJs, variationJs } = generateMergedIndexJs(
    groupSlug,
    groupTitle,
    variantInfos,
    supersetAttrs,
    fieldMaps,
    apiUrl,
  );

  const variationPhp: Record<string, string> = {};
  for (const variant of variantInfos) {
    variationPhp[variant.component.id] = generateVariantPhpFragment(variant, fieldMaps);
  }

  return {
    blockJson: generateMergedBlockJson(groupSlug, groupTitle, variantInfos, supersetAttrs),
    indexJs,
    renderPhp: generateMergedRenderPhp(groupSlug, variantInfos, fieldMaps),
    editorScss: generateMergedEditorScss(variantInfos),
    styleScss: generateMergedStyleScss(variantInfos),
    readme: generateMergedReadme(groupSlug, groupTitle, variantInfos),
    migrationSchema: generateMergedMigrationSchema(groupSlug, groupTitle, variantInfos),
    variationFiles: {
      js: variationJs,
      php: variationPhp,
    },
  };
};

export type { VariantInfo };
