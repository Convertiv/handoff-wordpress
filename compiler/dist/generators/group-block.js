"use strict";
/**
 * Merged Group Block Generator
 *
 * Combines all Handoff components in the same group into a single WordPress
 * block with variations. Uses a superset attribute schema, variant-conditional
 * sidebar controls, variant-specific preview rendering, and a render.php
 * dispatcher.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMergedBlock = exports.buildSupersetAttributes = void 0;
const types_1 = require("../types");
const handlebars_to_jsx_1 = require("./handlebars-to-jsx");
const utils_1 = require("./handlebars-to-jsx/utils");
const block_json_1 = require("./block-json");
const render_php_1 = require("./render-php");
const styles_1 = require("./styles");
const canvas_shim_1 = require("./canvas-shim");
const interactive_canvas_1 = require("./interactive-canvas");
const schema_json_1 = require("./schema-json");
const index_js_1 = require("./index-js");
// ─── Superset Attribute Merge ─────────────────────────────────────────────────
/**
 * Types are compatible if they have the same Gutenberg attribute `type`.
 */
const typesAreCompatible = (a, b) => {
    if (!a || !b)
        return false;
    return a.type === b.type;
};
/**
 * Convert a variant ID (e.g. "hero-basic", "hero_search") into a valid camelCase
 * identifier for use in prefixed attribute names. Ensures generated JS can destructure
 * attributes without quoting (no hyphens in names).
 */
const variantIdToCamel = (variantId) => {
    const s = (variantId ?? '')
        .replace(/[-_]([a-z])/g, (_, l) => l.toUpperCase())
        .replace(/[-_]/g, '');
    return s.charAt(0).toLowerCase() + s.slice(1);
};
/** Variant ID to PascalCase for JS import/component name (e.g. hero-article -> HeroArticle). */
const variantIdToPascal = (variantId) => {
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
const buildSupersetAttributes = (variants, groupSlug) => {
    const attributes = {};
    const fieldMaps = {};
    // First pass: collect all fields per original key across variants
    const fieldsByKey = {};
    for (const variant of variants) {
        const component = variant.component;
        fieldMaps[component.id] = {};
        const previewValues = component.previews?.generic?.values || {};
        for (const [key, property] of Object.entries(component.properties)) {
            if (property.type === 'pagination')
                continue;
            const origAttrName = (0, handlebars_to_jsx_1.toCamelCase)(key);
            let mapped = (0, block_json_1.mapPropertyType)(property, previewValues[key]);
            // Non-innerBlocksField richtext becomes a string attribute
            if (mapped === null && property.type === 'richtext' && key !== variant.innerBlocksField) {
                mapped = { type: 'string', default: previewValues[key] ?? '' };
            }
            if (mapped === null)
                continue;
            if (!fieldsByKey[key])
                fieldsByKey[key] = [];
            fieldsByKey[key].push({ variantId: component.id, attrName: origAttrName, attr: mapped });
        }
        // Also collect dynamic array control attributes
        for (const [fieldName, dynConfig] of Object.entries(variant.dynamicArrayConfigs)) {
            const attrName = (0, handlebars_to_jsx_1.toCamelCase)(fieldName);
            const dynFields = {};
            if ((0, types_1.isBreadcrumbsConfig)(dynConfig)) {
                dynFields[`${attrName}Enabled`] = { type: 'boolean', default: true };
            }
            else if ((0, types_1.isTaxonomyConfig)(dynConfig)) {
                dynFields[`${attrName}Enabled`] = { type: 'boolean', default: false };
                dynFields[`${attrName}Taxonomy`] = { type: 'string', default: dynConfig.taxonomies[0] || 'post_tag' };
                dynFields[`${attrName}Source`] = { type: 'string', default: 'auto' };
            }
            else if ((0, types_1.isPaginationConfig)(dynConfig)) {
                dynFields[`${attrName}Enabled`] = { type: 'boolean', default: true };
            }
            else {
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
                if (!fieldsByKey[`__dyn_${daKey}`])
                    fieldsByKey[`__dyn_${daKey}`] = [];
                fieldsByKey[`__dyn_${daKey}`].push({ variantId: component.id, attrName: daKey, attr: daAttr });
            }
        }
    }
    // Second pass: resolve conflicts
    for (const [key, entries] of Object.entries(fieldsByKey)) {
        if (entries.length === 0)
            continue;
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
        }
        else {
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
exports.buildSupersetAttributes = buildSupersetAttributes;
// ─── Block Icon ───────────────────────────────────────────────────────────────
const chooseGroupIcon = (groupSlug) => {
    const slug = groupSlug.toLowerCase();
    if (slug.includes('hero'))
        return 'format-image';
    if (slug.includes('card'))
        return 'index-card';
    if (slug.includes('form'))
        return 'feedback';
    if (slug.includes('nav'))
        return 'menu';
    if (slug.includes('footer'))
        return 'table-row-after';
    if (slug.includes('header'))
        return 'table-row-before';
    if (slug.includes('cta'))
        return 'megaphone';
    return 'admin-customizer';
};
const chooseVariantIcon = (component) => {
    const group = component.group?.toLowerCase() || '';
    const id = component.id.toLowerCase();
    if (group.includes('hero') || id.includes('hero'))
        return 'format-image';
    if (group.includes('card') || id.includes('card'))
        return 'index-card';
    if (group.includes('form') || id.includes('form'))
        return 'feedback';
    if (group.includes('nav') || id.includes('nav'))
        return 'menu';
    if (group.includes('footer') || id.includes('footer'))
        return 'table-row-after';
    if (group.includes('header') || id.includes('header'))
        return 'table-row-before';
    return 'admin-customizer';
};
/**
 * Generate an SVG icon code block for the group block's index.js.
 */
const generateGroupSvgIconCode = (groupTitle, groupSlug) => {
    return (0, index_js_1.generateSvgIcon)(groupTitle, groupSlug);
};
// ─── Merged block.json ──────────────────────────────────────────────────────
const generateMergedBlockJson = (groupSlug, groupTitle, variants, supersetAttrs, variantScreenshots) => {
    const anyHasScreenshot = Object.values(variantScreenshots).some(Boolean);
    // Add handoffVariant discriminator
    const allAttributes = {
        handoffVariant: {
            type: 'string',
            default: variants[0].component.id,
        },
        ...supersetAttrs,
    };
    if (anyHasScreenshot) {
        allAttributes.__preview = { type: 'boolean', default: false };
    }
    const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const variations = variants.map((v) => {
        const comp = v.component;
        const variantDefaults = { handoffVariant: comp.id };
        const variation = {
            name: comp.id,
            title: comp.title,
            description: (comp.description || '').replace(/\n\s+/g, ' ').trim(),
            attributes: variantDefaults,
            isActive: ['handoffVariant'],
            scope: ['inserter'],
            icon: chooseVariantIcon(comp),
        };
        if (variantScreenshots[comp.id]) {
            variation.example = {
                viewportWidth: 1200,
                attributes: { handoffVariant: comp.id, __preview: true },
            };
        }
        return variation;
    });
    const blockJson = {
        $schema: 'https://schemas.wp.org/trunk/block.json',
        apiVersion: 3,
        name: `handoff/${blockName}`,
        version: '1.0.0',
        title: groupTitle,
        category: (0, block_json_1.groupToCategory)(groupSlug),
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
    if (anyHasScreenshot) {
        blockJson.example = {
            viewportWidth: 1200,
            attributes: { handoffVariant: variants[0].component.id, __preview: true },
        };
    }
    blockJson.__handoff = {
        removedFromHandoff: false,
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
const replaceOutsideStrings = (jsx, pattern, replacement) => {
    const segments = [];
    let i = 0;
    let inString = null;
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
        }
        else {
            if (jsx[i] === '"' || jsx[i] === "'" || jsx[i] === '`') {
                const nonStringPart = jsx.slice(segStart, i);
                segments.push(nonStringPart.replace(pattern, replacement));
                segStart = i;
                inString = jsx[i];
                i++;
            }
            else {
                i++;
            }
        }
    }
    if (segStart < jsx.length) {
        const remaining = jsx.slice(segStart);
        if (inString) {
            segments.push(remaining);
        }
        else {
            segments.push(remaining.replace(pattern, replacement));
        }
    }
    return segments.join('');
};
const generateMergedIndexJs = (groupSlug, groupTitle, variants, supersetAttrs, fieldMaps, apiUrl, variantScreenshots, editorConfig) => {
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
    const hasPropertyType = (properties, type) => {
        const check = (prop) => {
            if (prop.type === type)
                return true;
            if (prop.type === 'object' && prop.properties)
                return Object.values(prop.properties).some(check);
            if (prop.type === 'array' && prop.items?.properties)
                return Object.values(prop.items.properties).some(check);
            return false;
        };
        return Object.values(properties).some(check);
    };
    const variantResults = {};
    for (const variant of variants) {
        const comp = variant.component;
        const properties = comp.properties;
        const fieldMap = fieldMaps[comp.id];
        const dynamicArrayConfigs = variant.dynamicArrayConfigs;
        const hasDynamic = Object.keys(dynamicArrayConfigs).length > 0;
        // Detect feature needs
        if (hasPropertyType(properties, 'image'))
            needsMediaUpload = true;
        if ((0, index_js_1.hasOpacityRangeField)(properties))
            needsRangeControl = true;
        if (hasPropertyType(properties, 'boolean') || hasPropertyType(properties, 'button'))
            needsToggleControl = true;
        if (hasPropertyType(properties, 'select'))
            needsSelectControl = true;
        if (hasPropertyType(properties, 'link') || hasPropertyType(properties, 'button'))
            needsLinkControl = true;
        if (Object.values(properties).some((p) => p.type === 'array'))
            hasArrayProps = true;
        if (hasDynamic) {
            const hasPostsDynamic = Object.values(dynamicArrayConfigs).some((c) => !('arrayType' in c));
            if (hasPostsDynamic) {
                anyHasDynamicArrays = true;
                needsSelectControl = true;
            }
            // Breadcrumbs/taxonomy/pagination use shared components — they import their own
            // ToggleControl/SelectControl, so we do not need to add those to the group block imports.
            if (Object.values(dynamicArrayConfigs).some((c) => (0, types_1.isBreadcrumbsConfig)(c)))
                anyHasBreadcrumbsArrays = true;
            if (Object.values(dynamicArrayConfigs).some((c) => (0, types_1.isTaxonomyConfig)(c)))
                anyHasTaxonomyArrays = true;
            if (Object.values(dynamicArrayConfigs).some((c) => (0, types_1.isPaginationConfig)(c)))
                anyHasPaginationArrays = true;
        }
        if (variant.innerBlocksField)
            anyUsesInnerBlocks = true;
        // Generate preview (guard against missing code/title from API)
        const previewResult = (0, handlebars_to_jsx_1.generateJsxPreview)(comp.code ?? '', properties, comp.id ?? comp.title ?? 'variant', comp.title ?? comp.id ?? 'Variant', variant.innerBlocksField, editorConfig);
        let previewJsx = previewResult.jsx ?? '';
        const inlineEditableFields = previewResult.inlineEditableFields;
        const varHasLinkField = previewJsx.includes('<HandoffLinkField');
        const varHasRichText = previewJsx.includes('<RichText');
        const varHas10upImage = previewJsx.includes('<Image');
        const varHasInnerBlocks = previewJsx.includes('<InnerBlocks');
        if (varHasLinkField)
            anyPreviewUsesLinkField = true;
        if (varHasRichText)
            anyPreviewUsesRichText = true;
        if (varHas10upImage)
            anyPreviewUses10upImage = true;
        if (varHasInnerBlocks)
            anyPreviewUsesInnerBlocks = true;
        // Remap attribute references in preview JSX using fieldMap.
        // Uses replaceOutsideStrings to avoid corrupting CSS class names
        // and other string literals that happen to contain the field name.
        for (const [origKey, mergedName] of Object.entries(fieldMap)) {
            const origCamel = (0, handlebars_to_jsx_1.toCamelCase)(origKey);
            if (origCamel !== mergedName) {
                const regex = new RegExp(`\\b${origCamel}\\b`, 'g');
                previewJsx = replaceOutsideStrings(previewJsx, regex, mergedName);
            }
        }
        // Generate panels for sidebar controls
        const panels = [];
        for (const [key, property] of Object.entries(properties)) {
            if (property.type === 'richtext' || property.type === 'pagination')
                continue;
            if (inlineEditableFields.has(key) && property.type !== 'array')
                continue;
            const label = property.name || (0, index_js_1.toTitleCase)(key);
            const mergedAttrName = fieldMap[key] || (0, handlebars_to_jsx_1.toCamelCase)(key);
            const dynamicConfig = dynamicArrayConfigs?.[key];
            if (property.type === 'array' && dynamicConfig) {
                if ((0, types_1.isBreadcrumbsConfig)(dynamicConfig)) {
                    panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                <BreadcrumbsSelector
                  attrName="${mergedAttrName}"
                  attributes={attributes}
                  setAttributes={setAttributes}
                />
              </PanelBody>`);
                }
                else if ((0, types_1.isTaxonomyConfig)(dynamicConfig)) {
                    const taxonomyOptions = dynamicConfig.taxonomies.map((t) => ({ label: t, value: t }));
                    const defaultTaxonomy = dynamicConfig.taxonomies[0] || 'post_tag';
                    const itemProps = property.items?.properties || {};
                    const itemFields = Object.keys(itemProps).length > 0
                        ? Object.entries(itemProps).map(([fieldKey, fieldProp]) => {
                            const ctx = {
                                valueAccessor: `item.${fieldKey}`,
                                onChangeHandler: (val) => `setItem({ ...item, ${fieldKey}: ${val} })`,
                                indent: '                  ',
                            };
                            return (0, index_js_1.generateFieldControl)(fieldKey, fieldProp, ctx);
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
                }
                else if ((0, types_1.isPaginationConfig)(dynamicConfig)) {
                    panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
                <PaginationSelector
                  attrName="${mergedAttrName}"
                  attributes={attributes}
                  setAttributes={setAttributes}
                />
              </PanelBody>`);
                }
                else {
                    // DynamicArrayConfig (posts)
                    const defaultMode = dynamicConfig.selectionMode === 'manual' ? 'select' : 'query';
                    const itemOverridesConfig = dynamicConfig.itemOverridesConfig || {};
                    const advancedFields = [];
                    for (const [name, c] of Object.entries(itemOverridesConfig)) {
                        if (c.mode === 'ui')
                            advancedFields.push({ name, label: c.label, type: 'select', options: (0, utils_1.normalizeSelectOptions)(c.options), default: c.default });
                    }
                    const itemProps = property.items?.properties || {};
                    const fieldMapping = dynamicConfig.fieldMapping || {};
                    for (const [fieldPath, mappingValue] of Object.entries(fieldMapping)) {
                        if (typeof mappingValue === 'object' && mappingValue !== null && mappingValue.type === 'manual') {
                            const topKey = fieldPath.split('.')[0];
                            const itemProp = itemProps[topKey];
                            const fieldLabel = itemProp?.name || (0, index_js_1.toTitleCase)(topKey);
                            let controlType = 'text';
                            let options;
                            let defaultVal = itemProp?.default ?? '';
                            if (itemProp) {
                                switch (itemProp.type) {
                                    case 'select':
                                        controlType = 'select';
                                        options = (0, utils_1.normalizeSelectOptions)(itemProp.options);
                                        break;
                                    case 'boolean':
                                        controlType = 'toggle';
                                        defaultVal = itemProp.default ?? false;
                                        break;
                                    case 'number':
                                        controlType = 'number';
                                        defaultVal = itemProp.default ?? 0;
                                        break;
                                    default:
                                        controlType = 'text';
                                        break;
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
                    showDateFilter: ${dynamicConfig.showDateFilter === true ? 'true' : 'false'},
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
            }
            else {
                const controlIndent = '                ';
                let controlOutput;
                if (property.type === 'array') {
                    controlOutput = (0, index_js_1.generateArrayControl)(key, property, mergedAttrName, label, controlIndent);
                }
                else {
                    const ctx = {
                        valueAccessor: mergedAttrName,
                        onChangeHandler: (value) => `setAttributes({ ${mergedAttrName}: ${value} })`,
                        indent: controlIndent,
                    };
                    controlOutput = (0, index_js_1.generateFieldControl)(key, property, ctx);
                }
                panels.push(`              <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
${controlOutput}
              </PanelBody>`);
            }
        }
        // Design System links panel (per-variant component URLs)
        let handoffUrl;
        if (apiUrl) {
            const baseUrl = apiUrl.replace(/\/api\/?$/, '');
            handoffUrl = `${baseUrl}/system/component/${comp.id}`;
        }
        else if (comp.preview) {
            handoffUrl = comp.preview;
        }
        const figmaUrl = comp.figma;
        if (handoffUrl || figmaUrl) {
            const linkButtons = [];
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
        const resolvingFlags = [];
        if (hasDynamic) {
            for (const [fieldKey, dynConfig] of Object.entries(dynamicArrayConfigs)) {
                const mergedAttrName = fieldMap[fieldKey] || (0, handlebars_to_jsx_1.toCamelCase)(fieldKey);
                const fieldProp = properties[fieldKey];
                const itemProps = fieldProp?.items?.properties;
                if ((0, types_1.isBreadcrumbsConfig)(dynConfig)) {
                    varHasBreadcrumbsFetch = true;
                    const cap = mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1);
                    const reshapeJs = (0, render_php_1.buildReshapeJs)(itemProps, ['label', 'url']);
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
                if ((0, types_1.isTaxonomyConfig)(dynConfig)) {
                    varHasTaxonomyFetch = true;
                    const cap = mergedAttrName.charAt(0).toUpperCase() + mergedAttrName.slice(1);
                    const reshapeJs = (0, render_php_1.buildReshapeJs)(itemProps, ['label', 'url', 'slug']);
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
                if ((0, types_1.isPaginationConfig)(dynConfig)) {
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
    if (needsMediaUpload)
        blockEditorImports.push('MediaUpload', 'MediaUploadCheck', 'MediaReplaceFlow');
    if (anyUsesInnerBlocks || anyPreviewUsesInnerBlocks)
        blockEditorImports.push('InnerBlocks');
    if (needsLinkControl || anyPreviewUsesLinkField) {
        if (!blockEditorImports.includes('LinkControl'))
            blockEditorImports.push('LinkControl');
        if (!blockEditorImports.includes('RichText'))
            blockEditorImports.push('RichText');
    }
    if ((anyPreviewUsesRichText || anyPreviewUsesLinkField) && !blockEditorImports.includes('RichText')) {
        blockEditorImports.push('RichText');
    }
    const componentImports = ['PanelBody', 'TextControl', 'Button', 'SelectControl', 'DropdownMenu'];
    if (needsRangeControl)
        componentImports.push('RangeControl');
    if (needsToggleControl)
        componentImports.push('ToggleControl');
    if (anyHasDynamicArrays)
        componentImports.push('Spinner');
    const anyHasRichtextInArray = variants.some((v) => Object.values(v.component.properties).some(p => p.type === 'array' && p.items?.properties &&
        Object.values(p.items.properties).some(ip => ip.type === 'richtext')));
    if (anyHasRichtextInArray)
        componentImports.push('TextareaControl');
    componentImports.push('Flex');
    if (needsLinkControl || anyPreviewUsesLinkField)
        componentImports.push('Popover');
    // Repeater is only needed for non-server-rendered array properties across all variants
    const anyVariantHasNonSpecialArrays = variants.some((v) => Object.entries(v.component.properties).some(([k, p]) => p.type === 'array' && (!v.dynamicArrayConfigs[k] || !('arrayType' in v.dynamicArrayConfigs[k]))));
    const tenUpImports = [];
    if (anyVariantHasNonSpecialArrays)
        tenUpImports.push('Repeater');
    if (anyPreviewUses10upImage)
        tenUpImports.push('Image');
    const tenUpImport = tenUpImports.length > 0 ? `import { ${tenUpImports.join(', ')} } from '@10up/block-components';\n` : '';
    const sharedNamedImports = [];
    if (anyHasDynamicArrays)
        sharedNamedImports.push('DynamicPostSelector', 'mapPostEntityToItem');
    if (anyHasBreadcrumbsArrays)
        sharedNamedImports.push('BreadcrumbsSelector');
    if (anyHasTaxonomyArrays)
        sharedNamedImports.push('TaxonomySelector');
    if (anyHasPaginationArrays)
        sharedNamedImports.push('PaginationSelector');
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
    const allAttrNames = new Set();
    allAttrNames.add('handoffVariant');
    for (const attrName of Object.keys(supersetAttrs)) {
        allAttrNames.add(attrName);
    }
    // Also add dynamic array derived attribute names
    for (const variant of variants) {
        for (const [fieldName, dynConfig] of Object.entries(variant.dynamicArrayConfigs)) {
            const attrName = fieldMaps[variant.component.id][fieldName] || (0, handlebars_to_jsx_1.toCamelCase)(fieldName);
            if ((0, types_1.isBreadcrumbsConfig)(dynConfig) || (0, types_1.isPaginationConfig)(dynConfig)) {
                allAttrNames.add(`${attrName}Enabled`);
                continue;
            }
            if ((0, types_1.isTaxonomyConfig)(dynConfig)) {
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
        .map((v) => `        { title: '${(v.component.title ?? v.component.id ?? '').toString().replace(/'/g, "\\'")}', onClick: () => setAttributes({ handoffVariant: '${v.component.id ?? ''}' }) }`)
        .join(',\n');
    // Collect all merged attribute names that are array type (across all variants) so we emit each helper once
    const allArrayMergedNames = new Set();
    for (const v of variants) {
        const fieldMap = fieldMaps[v.component.id];
        for (const [key, prop] of Object.entries(v.component.properties)) {
            if (prop.type === 'array')
                allArrayMergedNames.add(fieldMap[key] || (0, handlebars_to_jsx_1.toCamelCase)(key));
        }
    }
    const sharedArrayHelpers = generateSharedArrayHelpers(allArrayMergedNames);
    // Variation include imports and component usage (one file per variant)
    const variantImportLines = variants.map((v) => `import * as ${variantIdToPascal(v.component.id)} from './variations/${v.component.id}';`);
    const helperNamesList = [...allArrayMergedNames].map((a) => `update${a.charAt(0).toUpperCase() + a.slice(1)}Item`);
    if (anyPreviewUsesLinkField)
        helperNamesList.push('HandoffLinkField');
    if (anyUsesInnerBlocks || anyPreviewUsesInnerBlocks)
        helperNamesList.push('CONTENT_BLOCKS');
    const helpersObjectLine = helperNamesList.length > 0
        ? `    const helpers = { ${helperNamesList.join(', ')} };`
        : '    const helpers = {};';
    const variantPanelBlocks = variants
        .map((v) => {
        const result = variantResults[v.component.id];
        if (!result.panels.trim())
            return '';
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
    const variationJs = {};
    for (const v of variants) {
        const result = variantResults[v.component.id];
        const fieldMap = fieldMaps[v.component.id];
        const helperNames = [...allArrayMergedNames]
            .filter((attrName) => {
            for (const [key, prop] of Object.entries(v.component.properties)) {
                if (prop.type === 'array' && (fieldMaps[v.component.id][key] || (0, handlebars_to_jsx_1.toCamelCase)(key)) === attrName)
                    return true;
            }
            return false;
        })
            .map((a) => `update${a.charAt(0).toUpperCase() + a.slice(1)}Item`);
        variationJs[v.component.id] = generateVariantJsFileContent(v, result, fieldMap, helperNames, anyPreviewUsesLinkField, editorConfig);
    }
    // Build variant-conditional dynamic resolution + array helpers
    const variantDynamicBlocks = variants.map((v) => {
        const result = variantResults[v.component.id];
        const code = result.dynamicResolution + result.arrayHelpers;
        if (!code.trim())
            return '';
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
    const variantMediaReplaceBlocks = [];
    for (const v of variants) {
        const comp = v.component;
        const fieldMap = fieldMaps[comp.id];
        const imageEntries = [];
        const collectImages = (props, parentPath = '') => {
            for (const [key, prop] of Object.entries(props)) {
                const mergedName = parentPath
                    ? `${fieldMap[parentPath] || (0, handlebars_to_jsx_1.toCamelCase)(parentPath)}`
                    : (fieldMap[key] || (0, handlebars_to_jsx_1.toCamelCase)(key));
                if (prop.type === 'image') {
                    imageEntries.push({
                        label: prop.name || (0, index_js_1.toTitleCase)(key),
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
            const mediaFlows = imageEntries.map((img) => `            <MediaReplaceFlow
              mediaId={${img.mergedAttrName}?.id}
              mediaUrl={${img.mergedAttrName}?.src}
              allowedTypes={['image']}
              accept="image/*"
              onSelect={(media) => setAttributes({ ${img.mergedAttrName}: { id: media.id, src: media.url, alt: media.alt || '' } })}
              name={__('${img.label}', 'handoff')}
            />`).join('\n');
            variantMediaReplaceBlocks.push(`        {handoffVariant === '${comp.id}' && (\n          <BlockControls group="other">\n${mediaFlows}\n          </BlockControls>\n        )}`);
        }
    }
    const mediaReplaceJsx = variantMediaReplaceBlocks.length > 0
        ? '\n' + variantMediaReplaceBlocks.join('\n')
        : '';
    const svgIconStr = generateGroupSvgIconCode(groupTitle, groupSlug);
    // Build screenshot imports and lookup map for variant previews
    const screenshotImportLines = [];
    const screenshotMapEntries = [];
    const anyVariantHasScreenshot = variantScreenshots && Object.values(variantScreenshots).some(Boolean);
    if (anyVariantHasScreenshot && variantScreenshots) {
        for (const v of variants) {
            if (variantScreenshots[v.component.id]) {
                const safeVar = 'screenshot_' + variantIdToCamel(v.component.id);
                screenshotImportLines.push(`import ${safeVar} from './screenshot-${v.component.id}.png';`);
                screenshotMapEntries.push(`  '${v.component.id}': ${safeVar}`);
            }
        }
    }
    const screenshotImports = screenshotImportLines.length > 0
        ? screenshotImportLines.join('\n') + '\n'
        : '';
    const screenshotMapCode = screenshotMapEntries.length > 0
        ? `const variantScreenshots = {\n${screenshotMapEntries.join(',\n')}\n};\n`
        : '';
    const previewGuard = anyVariantHasScreenshot
        ? `    if (attributes.__preview) {
      const screenshotSrc = variantScreenshots[handoffVariant];
      if (screenshotSrc) {
        return (
          <div {...blockProps}>
            <img src={screenshotSrc} alt={metadata.title} style={{ width: '100%', height: 'auto' }} />
          </div>
        );
      }
    }
`
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
${screenshotImports}${variantImportLines.join('\n')}
${screenshotMapCode}const blockIcon = (
  ${svgIconStr}
);

registerBlockType(metadata.name, {
  ...metadata,
  icon: blockIcon,
  edit: ({ attributes, setAttributes, isSelected }) => {
    const blockProps = useBlockProps();
${anyUsesInnerBlocks || anyPreviewUsesInnerBlocks ? "    const CONTENT_BLOCKS = ['core/paragraph','core/heading','core/list','core/list-item','core/quote','core/image','core/separator','core/html','core/buttons','core/button'];" : ''}
    const { ${attrNamesList.join(', ')} } = attributes;
${previewGuard}
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
const generateArrayHelpersMerged = (properties, fieldMap) => {
    const helpers = [];
    for (const [key, prop] of Object.entries(properties)) {
        if (prop.type !== 'array')
            continue;
        const attrName = fieldMap[key] || (0, handlebars_to_jsx_1.toCamelCase)(key);
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
const generateSharedArrayHelpers = (mergedArrayAttrNames) => {
    const helpers = [];
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
const collectAttrNamesFromJsx = (jsx) => {
    const names = new Set();
    const setAttrRegex = /setAttributes\s*\(\s*\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
    let m;
    while ((m = setAttrRegex.exec(jsx)) !== null)
        names.add(m[1]);
    const valueRegex = /value=\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*[\|\?\&\|\!]|[\s\n\r]*\?\?|[\s\n\r]*\|\|)/g;
    while ((m = valueRegex.exec(jsx)) !== null)
        names.add(m[1]);
    const condRegex = /\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*&&/g;
    while ((m = condRegex.exec(jsx)) !== null)
        names.add(m[1]);
    return names;
};
/** Generate the JS content for one variation include file (exports Panels and Preview). */
const generateVariantJsFileContent = (variant, result, fieldMap, helperNames, anyPreviewUsesLinkField, editorConfig) => {
    const comp = variant.component;
    const variantDynConfigs = variant.dynamicArrayConfigs;
    const fromFieldMap = new Set(Object.values(fieldMap));
    // Scan preview JSX and panel JSX for attribute names to destructure.
    const fromPreview = collectAttrNamesFromJsx(result.previewJsx + '\n' + result.panels);
    // Collect variable names declared locally by the specialized resolution code
    // (e.g. previewBreadcrumb from useState, previewTags from useSelect).
    // These must NOT be destructured from attributes or they'll conflict.
    const locallyDeclared = new Set();
    if (result.specializedResolution) {
        const stateMatch = result.specializedResolution.matchAll(/const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState/g);
        for (const m of stateMatch) {
            locallyDeclared.add(m[1]);
            locallyDeclared.add(m[2]);
        }
        const selectMatch = result.specializedResolution.matchAll(/const\s+(\w+)\s*=\s*useSelect/g);
        for (const m of selectMatch) {
            locallyDeclared.add(m[1]);
        }
    }
    const reserved = new Set(['index', 'value', 'item', 'e', 'key', 'open']);
    fromPreview.forEach((name) => {
        if (!reserved.has(name) && !locallyDeclared.has(name))
            fromFieldMap.add(name);
    });
    // Ensure specialized array synthetic attributes are destructured
    for (const [fieldKey, dynConfig] of Object.entries(variantDynConfigs)) {
        const mergedAttrName = fieldMap[fieldKey] || (0, handlebars_to_jsx_1.toCamelCase)(fieldKey);
        if ((0, types_1.isBreadcrumbsConfig)(dynConfig) || (0, types_1.isPaginationConfig)(dynConfig)) {
            fromFieldMap.add(`${mergedAttrName}Enabled`);
        }
        if ((0, types_1.isTaxonomyConfig)(dynConfig)) {
            fromFieldMap.add(`${mergedAttrName}Enabled`);
            fromFieldMap.add(`${mergedAttrName}Taxonomy`);
            fromFieldMap.add(`${mergedAttrName}Source`);
        }
    }
    const attrNames = [...fromFieldMap];
    let previewJsxOut = result.previewJsx;
    const interactiveCanvas = (0, interactive_canvas_1.generateInteractiveCanvasCode)(comp.id, attrNames, editorConfig, comp.wordpress);
    if (interactiveCanvas) {
        previewJsxOut = (0, interactive_canvas_1.injectCanvasRefIntoPreviewJsx)(previewJsxOut);
    }
    const helpersDestruct = [...helperNames];
    if (anyPreviewUsesLinkField)
        helpersDestruct.push('HandoffLinkField');
    if (variant.innerBlocksField)
        helpersDestruct.push('CONTENT_BLOCKS');
    const attrDestruct = attrNames.length ? `  const { ${attrNames.join(', ')} } = attributes;\n  ` : '';
    const helpersDestructLine = helpersDestruct.length > 0 ? `  const { ${helpersDestruct.join(', ')} } = helpers;\n  ` : '';
    const propsList = anyPreviewUsesLinkField ? '{ attributes, setAttributes, helpers, isSelected }' : '{ attributes, setAttributes, helpers }';
    const panelsExport = result.panels.trim() === ''
        ? `export function Panels() { return null; }`
        : `export function Panels(${propsList}) {
${attrDestruct}${helpersDestructLine}  return (
    <>
${result.panels}
    </>
  );
}`;
    // Determine which shared selector components this variant's panels use
    const variantHasBreadcrumbs = Object.values(variantDynConfigs).some((c) => (0, types_1.isBreadcrumbsConfig)(c));
    const variantHasTaxonomy = Object.values(variantDynConfigs).some((c) => (0, types_1.isTaxonomyConfig)(c));
    const variantHasPagination = Object.values(variantDynConfigs).some((c) => (0, types_1.isPaginationConfig)(c));
    const variantSharedImports = [];
    if (variantHasBreadcrumbs)
        variantSharedImports.push('BreadcrumbsSelector');
    if (variantHasTaxonomy)
        variantSharedImports.push('TaxonomySelector');
    if (variantHasPagination)
        variantSharedImports.push('PaginationSelector');
    const sharedSelectorImport = variantSharedImports.length
        ? `import { ${variantSharedImports.join(', ')} } from '../../../shared';\n`
        : '';
    // Only import Repeater when the variant has non-server-rendered array fields
    // (taxonomy/breadcrumbs/pagination are server-rendered; shared components import Repeater themselves)
    const variantHasNonSpecialArrays = Object.entries(comp.properties).some(([k, p]) => p.type === 'array' && (!variantDynConfigs[k] || !('arrayType' in variantDynConfigs[k])));
    const tenUpBlockComponentsImport = (variantHasNonSpecialArrays || result.previewJsx.includes('<Image'))
        ? `import { ${[variantHasNonSpecialArrays ? 'Repeater' : '', result.previewJsx.includes('<Image') ? 'Image' : ''].filter(Boolean).join(', ')} } from '@10up/block-components';\n`
        : '';
    // Specialized array resolution imports (breadcrumbs/taxonomy/pagination hooks run in the variation file)
    const hasSpecializedResolution = !!(result.specializedResolution?.trim());
    const varHasBreadcrumbsFetch = result.hasBreadcrumbsFetch ?? false;
    const varHasTaxonomyFetch = result.hasTaxonomyFetch ?? false;
    const elementImportNames = ['Fragment'];
    if (varHasBreadcrumbsFetch)
        elementImportNames.push('useState', 'useEffect');
    if (interactiveCanvas) {
        for (const el of interactiveCanvas.elementImports) {
            if (!elementImportNames.includes(el))
                elementImportNames.push(el);
        }
    }
    const interactiveImport = interactiveCanvas?.importLines ? `${interactiveCanvas.importLines}\n` : '';
    const interactiveHook = interactiveCanvas?.hookLines
        ? `${interactiveCanvas.hookLines}\n`
        : '';
    let dataImport = '';
    if (varHasTaxonomyFetch || varHasBreadcrumbsFetch) {
        const dataNames = ['useSelect'];
        if (varHasBreadcrumbsFetch)
            dataNames.push('select');
        dataImport += `import { ${dataNames.join(', ')} } from '@wordpress/data';\nimport { store as coreDataStore } from '@wordpress/core-data';\n`;
    }
    if (varHasBreadcrumbsFetch) {
        dataImport += `import apiFetch from '@wordpress/api-fetch';\n`;
    }
    const specializedCode = hasSpecializedResolution ? result.specializedResolution : '';
    return `/**
 * Variation: ${comp.title} (${comp.id})
 * Generated – do not edit by hand.
 */
import { ${elementImportNames.join(', ')} } from '@wordpress/element';
import {
  PanelBody,
  TextControl,
  TextareaControl,
  Button,
  SelectControl,
  RangeControl,
  ToggleControl,
  Flex,
  Popover,
} from '@wordpress/components';
import { MediaUpload, MediaUploadCheck, MediaReplaceFlow, LinkControl, RichText, InnerBlocks } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
${dataImport}${tenUpBlockComponentsImport}${sharedSelectorImport}${interactiveImport}
${panelsExport}

export function Preview(${propsList}) {
${attrDestruct}${helpersDestructLine}${specializedCode}${interactiveHook}  return (
${previewJsxOut}
  );
}
`;
};
// ─── Merged render.php ──────────────────────────────────────────────────────
/** Generate the PHP fragment for one variant (extractions + template). Used in variation include file. */
const generateVariantPhpFragment = (variant, fieldMaps) => {
    const comp = variant.component;
    const fieldMap = fieldMaps[comp.id];
    const richtextProps = new Set();
    if (variant.innerBlocksField) {
        richtextProps.add(variant.innerBlocksField);
        richtextProps.add((0, handlebars_to_jsx_1.toCamelCase)(variant.innerBlocksField));
    }
    const extractions = [];
    for (const [key, property] of Object.entries(comp.properties)) {
        if (property.type === 'richtext' && key === variant.innerBlocksField)
            continue;
        if (property.type === 'pagination')
            continue;
        const mergedAttrName = fieldMap[key] || (0, handlebars_to_jsx_1.toCamelCase)(key);
        const origCamel = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const defaultValue = (0, render_php_1.getPhpDefaultValue)(property);
        extractions.push(`$${origCamel} = isset($attributes['${mergedAttrName}']) ? $attributes['${mergedAttrName}'] : ${defaultValue};`);
    }
    // Dynamic array extraction for specialized array types (breadcrumbs, taxonomy, pagination)
    const dynArrayExtractions = [];
    if (variant.dynamicArrayConfigs) {
        for (const [fieldName, dynConfig] of Object.entries(variant.dynamicArrayConfigs)) {
            const mergedAttrName = fieldMap[fieldName] || (0, handlebars_to_jsx_1.toCamelCase)(fieldName);
            const fieldProp = comp.properties[fieldName];
            const itemProps = fieldProp?.items?.properties;
            if ((0, types_1.isBreadcrumbsConfig)(dynConfig)) {
                dynArrayExtractions.push((0, render_php_1.generateBreadcrumbsArrayExtraction)(fieldName, mergedAttrName, itemProps));
            }
            else if ((0, types_1.isTaxonomyConfig)(dynConfig)) {
                dynArrayExtractions.push((0, render_php_1.generateTaxonomyArrayExtraction)(fieldName, mergedAttrName, dynConfig, itemProps));
            }
            else if ((0, types_1.isPaginationConfig)(dynConfig)) {
                dynArrayExtractions.push((0, render_php_1.generatePaginationArrayExtraction)(fieldName, mergedAttrName, dynConfig, itemProps));
            }
            else {
                dynArrayExtractions.push((0, render_php_1.generateDynamicArrayExtraction)(fieldName, mergedAttrName, dynConfig));
            }
        }
    }
    const dynArrayCode = dynArrayExtractions.length ? '\n' + dynArrayExtractions.join('\n') : '';
    const templatePhp = (0, render_php_1.handlebarsToPhp)(comp.code ?? '', comp.properties, richtextProps);
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
const generateMergedRenderPhp = (groupSlug, variants, fieldMaps) => {
    const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const defaultVariant = variants[0].component.id;
    const cases = variants.map((v) => `  case '${v.component.id}':
    include __DIR__ . '/variations/${v.component.id}.php';
    break;`);
    return `<?php
/**
 * Server-side rendering for ${(0, index_js_1.toTitleCase)(groupSlug)} (merged group block)
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
const generateMergedEditorScss = (variants, editorConfig) => {
    const prefix = editorConfig?.canvasShim !== false &&
        variants.some((v) => (0, canvas_shim_1.templateUsesCanvasShim)(v.component.code, editorConfig))
        ? canvas_shim_1.CANVAS_SHIM_SCSS_IMPORT
        : '';
    return (prefix +
        variants
            .map((v) => (0, styles_1.generateEditorScss)(v.component, { skipCanvasShimImport: true, editorConfig }))
            .join('\n\n'));
};
const mergedGroupBlockSelector = (groupSlug) => {
    const slug = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `.wp-block-handoff-${slug}`;
};
const generateMergedStyleScss = (variants, groupSlug) => {
    const mergedSelector = mergedGroupBlockSelector(groupSlug);
    return variants
        .map((v) => {
        const variantSelector = `.wp-block-handoff-${v.component.id.replace(/_/g, '-')}`;
        return (0, styles_1.generateStyleScss)(v.component).split(variantSelector).join(mergedSelector);
    })
        .join('\n\n');
};
// ─── Merged Migration Schema ──────────────────────────────────────────────
const generateMergedMigrationSchema = (groupSlug, groupTitle, variants) => {
    const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const variantSchemas = {};
    for (const variant of variants) {
        const comp = variant.component;
        const properties = {};
        for (const [key, prop] of Object.entries(comp.properties)) {
            if (prop.type === 'pagination')
                continue;
            properties[key] = (0, schema_json_1.extractMigrationProperty)(prop, true, key);
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
        category: (0, block_json_1.groupToCategory)(groupSlug),
        isMergedGroup: true,
        variants: variantSchemas,
    };
    return JSON.stringify(schema, null, 2);
};
// ─── Merged README ──────────────────────────────────────────────────────────
const generateMergedReadme = (groupSlug, groupTitle, variants) => {
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
const generateMergedBlock = (groupSlug, components, variantInfos, apiUrl, variantScreenshots, editorConfig) => {
    const groupTitle = (0, index_js_1.toTitleCase)(groupSlug);
    const screenshots = variantScreenshots || {};
    const supersetResult = (0, exports.buildSupersetAttributes)(variantInfos, groupSlug);
    const { attributes: supersetAttrs, fieldMaps } = supersetResult;
    const { indexJs, variationJs } = generateMergedIndexJs(groupSlug, groupTitle, variantInfos, supersetAttrs, fieldMaps, apiUrl, screenshots, editorConfig);
    const variationPhp = {};
    for (const variant of variantInfos) {
        variationPhp[variant.component.id] = generateVariantPhpFragment(variant, fieldMaps);
    }
    // Build variant screenshot URLs for the caller to download
    const variantScreenshotUrls = {};
    for (const comp of components) {
        if (!comp.image)
            continue;
        if (comp.image.startsWith('http://') || comp.image.startsWith('https://')) {
            variantScreenshotUrls[comp.id] = comp.image;
        }
        else if (apiUrl) {
            variantScreenshotUrls[comp.id] = `${apiUrl}${comp.image.startsWith('/') ? '' : '/'}${comp.image}`;
        }
    }
    return {
        blockJson: generateMergedBlockJson(groupSlug, groupTitle, variantInfos, supersetAttrs, screenshots),
        indexJs,
        renderPhp: generateMergedRenderPhp(groupSlug, variantInfos, fieldMaps),
        editorScss: generateMergedEditorScss(variantInfos, editorConfig),
        styleScss: generateMergedStyleScss(variantInfos, groupSlug),
        readme: generateMergedReadme(groupSlug, groupTitle, variantInfos),
        migrationSchema: generateMergedMigrationSchema(groupSlug, groupTitle, variantInfos),
        variantScreenshotUrls,
        variationFiles: {
            js: variationJs,
            php: variationPhp,
        },
    };
};
exports.generateMergedBlock = generateMergedBlock;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9ncm91cC1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsb0NBZWtCO0FBQ2xCLDJEQUF3RjtBQUN4RixxREFBZ0c7QUFDaEcsNkNBQTZFO0FBQzdFLDZDQUEwUDtBQUMxUCxxQ0FBaUU7QUFDakUsK0NBR3VCO0FBRXZCLDZEQUc4QjtBQUM5QiwrQ0FBNEg7QUFDNUgseUNBTW9CO0FBaUNwQixpRkFBaUY7QUFFakY7O0dBRUc7QUFDSCxNQUFNLGtCQUFrQixHQUFHLENBQUMsQ0FBcUIsRUFBRSxDQUFxQixFQUFXLEVBQUU7SUFDbkYsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMzQixPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQztBQUMzQixDQUFDLENBQUM7QUFFRjs7OztHQUlHO0FBQ0gsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFNBQWlCLEVBQVUsRUFBRTtJQUNyRCxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUM7U0FDeEIsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUMxRCxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3hCLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hELENBQUMsQ0FBQztBQUVGLGdHQUFnRztBQUNoRyxNQUFNLGlCQUFpQixHQUFHLENBQUMsU0FBaUIsRUFBVSxFQUFFO0lBQ3RELE1BQU0sS0FBSyxHQUFHLGdCQUFn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QUFVLEVBQUUsd0JBQXdCLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQztRQUNoRSxTQUFTLEVBQUUsdUJBQXVCLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQztRQUMzRCxNQUFNLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUM7UUFDakUsZUFBZSxFQUFFLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDO1FBQ25GLHFCQUFxQjtRQUNyQixjQUFjLEVBQUU7WUFDZCxFQUFFLEVBQUUsV0FBVztZQUNmLEdBQUcsRUFBRSxZQUFZO1NBQ2xCO0tBQ0YsQ0FBQztBQUNKLENBQUMsQ0FBQztBQXZEVyxRQUFBLG1CQUFtQix1QkF1RDlCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNZXJnZWQgR3JvdXAgQmxvY2sgR2VuZXJhdG9yXG4gKlxuICogQ29tYmluZXMgYWxsIEhhbmRvZmYgY29tcG9uZW50cyBpbiB0aGUgc2FtZSBncm91cCBpbnRvIGEgc2luZ2xlIFdvcmRQcmVzc1xuICogYmxvY2sgd2l0aCB2YXJpYXRpb25zLiBVc2VzIGEgc3VwZXJzZXQgYXR0cmlidXRlIHNjaGVtYSwgdmFyaWFudC1jb25kaXRpb25hbFxuICogc2lkZWJhciBjb250cm9scywgdmFyaWFudC1zcGVjaWZpYyBwcmV2aWV3IHJlbmRlcmluZywgYW5kIGEgcmVuZGVyLnBocFxuICogZGlzcGF0Y2hlci5cbiAqL1xuXG5pbXBvcnQge1xuICBIYW5kb2ZmQ29tcG9uZW50LFxuICBIYW5kb2ZmUHJvcGVydHksXG4gIEd1dGVuYmVyZ0F0dHJpYnV0ZSxcbiAgRHluYW1pY0FycmF5Q29uZmlnLFxuICBCcmVhZGNydW1ic0FycmF5Q29uZmlnLFxuICBUYXhvbm9teUFycmF5Q29uZmlnLFxuICBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIEdlbmVyYXRlZEJsb2NrLFxuICBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZyxcbiAgQmxvY2tKc29uT3V0cHV0LFxuICBIYW5kb2ZmTWV0YWRhdGEsXG4gIGlzQnJlYWRjcnVtYnNDb25maWcsXG4gIGlzVGF4b25vbXlDb25maWcsXG4gIGlzUGFnaW5hdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIGdlbmVyYXRlSnN4UHJldmlldywgSnN4UHJldmlld1Jlc3VsdCB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuaW1wb3J0IHsgbm9ybWFsaXplU2VsZWN0T3B0aW9ucywgdHlwZSBOb3JtYWxpemVkU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeC91dGlscyc7XG5pbXBvcnQgeyBtYXBQcm9wZXJ0eVR5cGUsIGdyb3VwVG9DYXRlZ29yeSwgdG9CbG9ja05hbWUgfSBmcm9tICcuL2Jsb2NrLWpzb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVSZW5kZXJQaHAsIGhhbmRsZWJhcnNUb1BocCwgYXJyYXlUb1BocCwgZ2V0UGhwRGVmYXVsdFZhbHVlLCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbiwgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuaW1wb3J0IHsgZ2VuZXJhdGVFZGl0b3JTY3NzLCBnZW5lcmF0ZVN0eWxlU2NzcyB9IGZyb20gJy4vc3R5bGVzJztcbmltcG9ydCB7XG4gIENBTlZBU19TSElNX1NDU1NfSU1QT1JULFxuICB0ZW1wbGF0ZVVzZXNDYW52YXNTaGltLFxufSBmcm9tICcuL2NhbnZhcy1zaGltJztcbmltcG9ydCB0eXBlIHsgSGFuZG9mZkVkaXRvckNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7XG4gIGdlbmVyYXRlSW50ZXJhY3RpdmVDYW52YXNDb2RlLFxuICBpbmplY3RDYW52YXNSZWZJbnRvUHJldmlld0pzeCxcbn0gZnJvbSAnLi9pbnRlcmFjdGl2ZS1jYW52YXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsIE1pZ3JhdGlvblNjaGVtYSwgTWlncmF0aW9uUHJvcGVydHlTY2hlbWEsIGV4dHJhY3RNaWdyYXRpb25Qcm9wZXJ0eSB9IGZyb20gJy4vc2NoZW1hLWpzb24nO1xuaW1wb3J0IHtcbiAgdG9UaXRsZUNhc2UsXG4gIGdlbmVyYXRlRmllbGRDb250cm9sLFxuICBnZW5lcmF0ZUFycmF5Q29udHJvbCxcbiAgZ2VuZXJhdGVTdmdJY29uLFxuICBoYXNPcGFjaXR5UmFuZ2VGaWVsZCxcbn0gZnJvbSAnLi9pbmRleC1qcyc7XG5pbXBvcnQgdHlwZSB7IEZpZWxkQ29udGV4dCB9IGZyb20gJy4vaW5kZXgtanMnO1xuXG4vLyDilIDilIDilIAgVHlwZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKiBQZXItdmFyaWFudCBtYXBwaW5nIGZyb20gb3JpZ2luYWwgZmllbGQgbmFtZSB0byBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKi9cbmV4cG9ydCB0eXBlIEZpZWxkTWFwID0gUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxudHlwZSBBbnlEeW5hbWljQXJyYXlDb25maWcgPSBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZztcblxuaW50ZXJmYWNlIFZhcmlhbnRJbmZvIHtcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50O1xuICBmaWVsZE1hcDogRmllbGRNYXA7XG4gIGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGR5bmFtaWNBcnJheUNvbmZpZ3M6IFJlY29yZDxzdHJpbmcsIEFueUR5bmFtaWNBcnJheUNvbmZpZz47XG59XG5cbmludGVyZmFjZSBNZXJnZWRGaWVsZCB7XG4gIC8qKiBUaGUgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lIChjYW1lbENhc2UpICovXG4gIGF0dHJOYW1lOiBzdHJpbmc7XG4gIC8qKiBUaGUgR3V0ZW5iZXJnIGF0dHJpYnV0ZSBkZWZpbml0aW9uICovXG4gIGF0dHJpYnV0ZTogR3V0ZW5iZXJnQXR0cmlidXRlO1xuICAvKiogV2hpY2ggdmFyaWFudHMgdXNlIHRoaXMgZmllbGQgKi9cbiAgdmFyaWFudHM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgU3VwZXJzZXRSZXN1bHQge1xuICAvKiogQWxsIG1lcmdlZCBhdHRyaWJ1dGVzIGtleWVkIGJ5IG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAqL1xuICBhdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+O1xuICAvKiogUGVyLXZhcmlhbnQgZmllbGQgbWFwOiBvcmlnaW5hbCBrZXkg4oaSIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAqL1xuICBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPjtcbn1cblxuLy8g4pSA4pSA4pSAIFN1cGVyc2V0IEF0dHJpYnV0ZSBNZXJnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqXG4gKiBUeXBlcyBhcmUgY29tcGF0aWJsZSBpZiB0aGV5IGhhdmUgdGhlIHNhbWUgR3V0ZW5iZXJnIGF0dHJpYnV0ZSBgdHlwZWAuXG4gKi9cbmNvbnN0IHR5cGVzQXJlQ29tcGF0aWJsZSA9IChhOiBHdXRlbmJlcmdBdHRyaWJ1dGUsIGI6IEd1dGVuYmVyZ0F0dHJpYnV0ZSk6IGJvb2xlYW4gPT4ge1xuICBpZiAoIWEgfHwgIWIpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGEudHlwZSA9PT0gYi50eXBlO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IGEgdmFyaWFudCBJRCAoZS5nLiBcImhlcm8tYmFzaWNcIiwgXCJoZXJvX3NlYXJjaFwiKSBpbnRvIGEgdmFsaWQgY2FtZWxDYXNlXG4gKiBpZGVudGlmaWVyIGZvciB1c2UgaW4gcHJlZml4ZWQgYXR0cmlidXRlIG5hbWVzLiBFbnN1cmVzIGdlbmVyYXRlZCBKUyBjYW4gZGVzdHJ1Y3R1cmVcbiAqIGF0dHJpYnV0ZXMgd2l0aG91dCBxdW90aW5nIChubyBoeXBoZW5zIGluIG5hbWVzKS5cbiAqL1xuY29uc3QgdmFyaWFudElkVG9DYW1lbCA9ICh2YXJpYW50SWQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHMgPSAodmFyaWFudElkID8/ICcnKVxuICAgIC5yZXBsYWNlKC9bLV9dKFthLXpdKS9nLCAoXywgbDogc3RyaW5nKSA9PiBsLnRvVXBwZXJDYXNlKCkpXG4gICAgLnJlcGxhY2UoL1stX10vZywgJycpO1xuICByZXR1cm4gcy5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIHMuc2xpY2UoMSk7XG59O1xuXG4vKiogVmFyaWFudCBJRCB0byBQYXNjYWxDYXNlIGZvciBKUyBpbXBvcnQvY29tcG9uZW50IG5hbWUgKGUuZy4gaGVyby1hcnRpY2xlIC0+IEhlcm9BcnRpY2xlKS4gKi9cbmNvbnN0IHZhcmlhbnRJZFRvUGFzY2FsID0gKHZhcmlhbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2FtZWwgPSB2YXJpYW50SWRUb0NhbWVsKHZhcmlhbnRJZCk7XG4gIHJldHVybiBjYW1lbC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGNhbWVsLnNsaWNlKDEpO1xufTtcblxuLyoqXG4gKiBNZXJnZSBhdHRyaWJ1dGVzIGZyb20gTiBjb21wb25lbnRzIGludG8gYSBzdXBlcnNldCBzY2hlbWEuXG4gKlxuICogMS4gU2hhcmVkIGZpZWxkcyAoc2FtZSBuYW1lLCBjb21wYXRpYmxlIHR5cGUpOiBrZXB0IGFzLWlzLlxuICogMi4gQ29uZmxpY3RpbmcgZmllbGRzIChzYW1lIG5hbWUsIGRpZmZlcmVudCB0eXBlKTogcHJlZml4ZWQgd2l0aCB2YXJpYW50IHNsdWcuXG4gKiAzLiBVbmlxdWUgZmllbGRzOiBrZXB0IGFzLWlzLlxuICovXG5leHBvcnQgY29uc3QgYnVpbGRTdXBlcnNldEF0dHJpYnV0ZXMgPSAoXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBncm91cFNsdWc6IHN0cmluZyxcbik6IFN1cGVyc2V0UmVzdWx0ID0+IHtcbiAgY29uc3QgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPiA9IHt9O1xuICBjb25zdCBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPiA9IHt9O1xuXG4gIC8vIEZpcnN0IHBhc3M6IGNvbGxlY3QgYWxsIGZpZWxkcyBwZXIgb3JpZ2luYWwga2V5IGFjcm9zcyB2YXJpYW50c1xuICBjb25zdCBmaWVsZHNCeUtleTogUmVjb3JkPFxuICAgIHN0cmluZyxcbiAgICBBcnJheTx7IHZhcmlhbnRJZDogc3RyaW5nOyBhdHRyTmFtZTogc3RyaW5nOyBhdHRyOiBHdXRlbmJlcmdBdHRyaWJ1dGUgfT5cbiAgPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXBvbmVudCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICAgIGZpZWxkTWFwc1tjb21wb25lbnQuaWRdID0ge307XG4gICAgY29uc3QgcHJldmlld1ZhbHVlcyA9IGNvbXBvbmVudC5wcmV2aWV3cz8uZ2VuZXJpYz8udmFsdWVzIHx8IHt9O1xuXG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG9yaWdBdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgICBsZXQgbWFwcGVkID0gbWFwUHJvcGVydHlUeXBlKHByb3BlcnR5LCBwcmV2aWV3VmFsdWVzW2tleV0pO1xuXG4gICAgICAvLyBOb24taW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCBiZWNvbWVzIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAgICAgaWYgKG1hcHBlZCA9PT0gbnVsbCAmJiBwcm9wZXJ0eS50eXBlID09PSAncmljaHRleHQnICYmIGtleSAhPT0gdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgICAgIG1hcHBlZCA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IHByZXZpZXdWYWx1ZXNba2V5XSA/PyAnJyB9O1xuICAgICAgfVxuICAgICAgaWYgKG1hcHBlZCA9PT0gbnVsbCkgY29udGludWU7XG5cbiAgICAgIGlmICghZmllbGRzQnlLZXlba2V5XSkgZmllbGRzQnlLZXlba2V5XSA9IFtdO1xuICAgICAgZmllbGRzQnlLZXlba2V5XS5wdXNoKHsgdmFyaWFudElkOiBjb21wb25lbnQuaWQsIGF0dHJOYW1lOiBvcmlnQXR0ck5hbWUsIGF0dHI6IG1hcHBlZCB9KTtcbiAgICB9XG5cbiAgICAvLyBBbHNvIGNvbGxlY3QgZHluYW1pYyBhcnJheSBjb250cm9sIGF0dHJpYnV0ZXNcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgY29uc3QgZHluRmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+ID0ge307XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUVuYWJsZWRgXSA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiB0cnVlIH07XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RW5hYmxlZGBdID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1UYXhvbm9teWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogZHluQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJyB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9U291cmNlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAnYXV0bycgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUVuYWJsZWRgXSA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgICBjb25zdCBzb3VyY2VEZWZhdWx0ID0gZHluQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9U291cmNlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBzb3VyY2VEZWZhdWx0LCBlbnVtOiBbJ3F1ZXJ5JywgJ3NlbGVjdCcsICdtYW51YWwnXSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9UG9zdFR5cGVgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IGR5bkNvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgZHluQ29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCcgfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgXSA9IHsgdHlwZTogJ2FycmF5JywgZGVmYXVsdDogW10gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVF1ZXJ5QXJnc2BdID0geyB0eXBlOiAnb2JqZWN0JywgZGVmYXVsdDogeyBwb3N0X3R5cGU6IGR5bkNvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgZHluQ29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCcsIHBvc3RzX3Blcl9wYWdlOiBkeW5Db25maWcubWF4SXRlbXMgfHwgNiwgb3JkZXJieTogJ2RhdGUnLCBvcmRlcjogJ0RFU0MnLCB0YXhfcXVlcnk6IFtdLCAuLi4oZHluQ29uZmlnLmRlZmF1bHRRdWVyeUFyZ3MgfHwge30pIH0gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUZpZWxkTWFwcGluZ2BdID0geyB0eXBlOiAnb2JqZWN0JywgZGVmYXVsdDogZHluQ29uZmlnLmZpZWxkTWFwcGluZyB8fCB7fSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2BdID0geyB0eXBlOiAnb2JqZWN0JywgZGVmYXVsdDoge30gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVJlbmRlck1vZGVgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IGR5bkNvbmZpZy5yZW5kZXJNb2RlIHx8ICdtYXBwZWQnIH07XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgW2RhS2V5LCBkYUF0dHJdIG9mIE9iamVjdC5lbnRyaWVzKGR5bkZpZWxkcykpIHtcbiAgICAgICAgaWYgKCFmaWVsZHNCeUtleVtgX19keW5fJHtkYUtleX1gXSkgZmllbGRzQnlLZXlbYF9fZHluXyR7ZGFLZXl9YF0gPSBbXTtcbiAgICAgICAgZmllbGRzQnlLZXlbYF9fZHluXyR7ZGFLZXl9YF0ucHVzaCh7IHZhcmlhbnRJZDogY29tcG9uZW50LmlkLCBhdHRyTmFtZTogZGFLZXksIGF0dHI6IGRhQXR0ciB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBTZWNvbmQgcGFzczogcmVzb2x2ZSBjb25mbGljdHNcbiAgZm9yIChjb25zdCBba2V5LCBlbnRyaWVzXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZHNCeUtleSkpIHtcbiAgICBpZiAoZW50cmllcy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgLy8gQ2hlY2sgaWYgYWxsIGVudHJpZXMgaGF2ZSBjb21wYXRpYmxlIHR5cGVzXG4gICAgY29uc3QgZmlyc3QgPSBlbnRyaWVzWzBdO1xuICAgIGNvbnN0IGFsbENvbXBhdGlibGUgPSBlbnRyaWVzLmV2ZXJ5KChlKSA9PiB0eXBlc0FyZUNvbXBhdGlibGUoZmlyc3QuYXR0ciwgZS5hdHRyKSk7XG5cbiAgICBpZiAoYWxsQ29tcGF0aWJsZSkge1xuICAgICAgLy8gU2hhcmVkIG9yIHVuaXF1ZSBmaWVsZCDigJQgdXNlIG9yaWdpbmFsIG5hbWVcbiAgICAgIGNvbnN0IG1lcmdlZE5hbWUgPSBmaXJzdC5hdHRyTmFtZTtcbiAgICAgIC8vIFVzZSB0aGUgZmlyc3QgdmFyaWFudCdzIGF0dHJpYnV0ZSBkZWZpbml0aW9uIChkZWZhdWx0cyBtYXkgZGlmZmVyLCB0YWtlIGZpcnN0KVxuICAgICAgYXR0cmlidXRlc1ttZXJnZWROYW1lXSA9IGZpcnN0LmF0dHI7XG4gICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgaWYgKCFrZXkuc3RhcnRzV2l0aCgnX19keW5fJykpIHtcbiAgICAgICAgICBmaWVsZE1hcHNbZW50cnkudmFyaWFudElkXVtrZXldID0gbWVyZ2VkTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDb25mbGljdGluZyDigJQgcHJlZml4IHdpdGggdmFyaWFudCBzbHVnIChtdXN0IGJlIHZhbGlkIEpTIGlkZW50aWZpZXIgZm9yIGRlc3RydWN0dXJpbmcpXG4gICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgY29uc3QgdmFyaWFudENhbWVsID0gdmFyaWFudElkVG9DYW1lbChlbnRyeS52YXJpYW50SWQpO1xuICAgICAgICBjb25zdCBwcmVmaXhlZCA9IHZhcmlhbnRDYW1lbCArIGVudHJ5LmF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZW50cnkuYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGF0dHJpYnV0ZXNbcHJlZml4ZWRdID0gZW50cnkuYXR0cjtcbiAgICAgICAgaWYgKCFrZXkuc3RhcnRzV2l0aCgnX19keW5fJykpIHtcbiAgICAgICAgICBmaWVsZE1hcHNbZW50cnkudmFyaWFudElkXVtrZXldID0gcHJlZml4ZWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBBbHdheXMgYWRkIGFsaWduXG4gIGF0dHJpYnV0ZXMuYWxpZ24gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAnZnVsbCcgfTtcblxuICByZXR1cm4geyBhdHRyaWJ1dGVzLCBmaWVsZE1hcHMgfTtcbn07XG5cbi8vIOKUgOKUgOKUgCBCbG9jayBJY29uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBjaG9vc2VHcm91cEljb24gPSAoZ3JvdXBTbHVnOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBzbHVnID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdoZXJvJykpIHJldHVybiAnZm9ybWF0LWltYWdlJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2NhcmQnKSkgcmV0dXJuICdpbmRleC1jYXJkJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2Zvcm0nKSkgcmV0dXJuICdmZWVkYmFjayc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCduYXYnKSkgcmV0dXJuICdtZW51JztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2Zvb3RlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1hZnRlcic7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdoZWFkZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYmVmb3JlJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2N0YScpKSByZXR1cm4gJ21lZ2FwaG9uZSc7XG4gIHJldHVybiAnYWRtaW4tY3VzdG9taXplcic7XG59O1xuXG5jb25zdCBjaG9vc2VWYXJpYW50SWNvbiA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBncm91cCA9IGNvbXBvbmVudC5ncm91cD8udG9Mb3dlckNhc2UoKSB8fCAnJztcbiAgY29uc3QgaWQgPSBjb21wb25lbnQuaWQudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdoZXJvJykgfHwgaWQuaW5jbHVkZXMoJ2hlcm8nKSkgcmV0dXJuICdmb3JtYXQtaW1hZ2UnO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2NhcmQnKSB8fCBpZC5pbmNsdWRlcygnY2FyZCcpKSByZXR1cm4gJ2luZGV4LWNhcmQnO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2Zvcm0nKSB8fCBpZC5pbmNsdWRlcygnZm9ybScpKSByZXR1cm4gJ2ZlZWRiYWNrJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCduYXYnKSB8fCBpZC5pbmNsdWRlcygnbmF2JykpIHJldHVybiAnbWVudSc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnZm9vdGVyJykgfHwgaWQuaW5jbHVkZXMoJ2Zvb3RlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1hZnRlcic7XG4gIGlmIChncm91cC5pbmNsdWRlcygnaGVhZGVyJykgfHwgaWQuaW5jbHVkZXMoJ2hlYWRlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1iZWZvcmUnO1xuICByZXR1cm4gJ2FkbWluLWN1c3RvbWl6ZXInO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbiBTVkcgaWNvbiBjb2RlIGJsb2NrIGZvciB0aGUgZ3JvdXAgYmxvY2sncyBpbmRleC5qcy5cbiAqL1xuY29uc3QgZ2VuZXJhdGVHcm91cFN2Z0ljb25Db2RlID0gKGdyb3VwVGl0bGU6IHN0cmluZywgZ3JvdXBTbHVnOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZ2VuZXJhdGVTdmdJY29uKGdyb3VwVGl0bGUsIGdyb3VwU2x1Zyk7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIGJsb2NrLmpzb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkQmxvY2tKc29uID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgc3VwZXJzZXRBdHRyczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPixcbiAgdmFyaWFudFNjcmVlbnNob3RzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGFueUhhc1NjcmVlbnNob3QgPSBPYmplY3QudmFsdWVzKHZhcmlhbnRTY3JlZW5zaG90cykuc29tZShCb29sZWFuKTtcblxuICAvLyBBZGQgaGFuZG9mZlZhcmlhbnQgZGlzY3JpbWluYXRvclxuICBjb25zdCBhbGxBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+ID0ge1xuICAgIGhhbmRvZmZWYXJpYW50OiB7XG4gICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgIGRlZmF1bHQ6IHZhcmlhbnRzWzBdLmNvbXBvbmVudC5pZCxcbiAgICB9LFxuICAgIC4uLnN1cGVyc2V0QXR0cnMsXG4gIH07XG5cbiAgaWYgKGFueUhhc1NjcmVlbnNob3QpIHtcbiAgICBhbGxBdHRyaWJ1dGVzLl9fcHJldmlldyA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9O1xuICB9XG5cbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIGNvbnN0IHZhcmlhdGlvbnMgPSB2YXJpYW50cy5tYXAoKHYpID0+IHtcbiAgICBjb25zdCBjb21wID0gdi5jb21wb25lbnQ7XG4gICAgY29uc3QgdmFyaWFudERlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0geyBoYW5kb2ZmVmFyaWFudDogY29tcC5pZCB9O1xuICAgIGNvbnN0IHZhcmlhdGlvbjogYW55ID0ge1xuICAgICAgbmFtZTogY29tcC5pZCxcbiAgICAgIHRpdGxlOiBjb21wLnRpdGxlLFxuICAgICAgZGVzY3JpcHRpb246IChjb21wLmRlc2NyaXB0aW9uIHx8ICcnKS5yZXBsYWNlKC9cXG5cXHMrL2csICcgJykudHJpbSgpLFxuICAgICAgYXR0cmlidXRlczogdmFyaWFudERlZmF1bHRzLFxuICAgICAgaXNBY3RpdmU6IFsnaGFuZG9mZlZhcmlhbnQnXSxcbiAgICAgIHNjb3BlOiBbJ2luc2VydGVyJ10sXG4gICAgICBpY29uOiBjaG9vc2VWYXJpYW50SWNvbihjb21wKSxcbiAgICB9O1xuXG4gICAgaWYgKHZhcmlhbnRTY3JlZW5zaG90c1tjb21wLmlkXSkge1xuICAgICAgdmFyaWF0aW9uLmV4YW1wbGUgPSB7XG4gICAgICAgIHZpZXdwb3J0V2lkdGg6IDEyMDAsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHsgaGFuZG9mZlZhcmlhbnQ6IGNvbXAuaWQsIF9fcHJldmlldzogdHJ1ZSB9LFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFyaWF0aW9uO1xuICB9KTtcblxuICBjb25zdCBibG9ja0pzb246IGFueSA9IHtcbiAgICAkc2NoZW1hOiAnaHR0cHM6Ly9zY2hlbWFzLndwLm9yZy90cnVuay9ibG9jay5qc29uJyxcbiAgICBhcGlWZXJzaW9uOiAzLFxuICAgIG5hbWU6IGBoYW5kb2ZmLyR7YmxvY2tOYW1lfWAsXG4gICAgdmVyc2lvbjogJzEuMC4wJyxcbiAgICB0aXRsZTogZ3JvdXBUaXRsZSxcbiAgICBjYXRlZ29yeTogZ3JvdXBUb0NhdGVnb3J5KGdyb3VwU2x1ZyksXG4gICAgaWNvbjogY2hvb3NlR3JvdXBJY29uKGdyb3VwU2x1ZyksXG4gICAgZGVzY3JpcHRpb246IGAke2dyb3VwVGl0bGV9IGJsb2NrIHdpdGggJHt2YXJpYW50cy5sZW5ndGh9IHZhcmlhdGlvbnMuYCxcbiAgICBrZXl3b3JkczogW2dyb3VwU2x1Z10sXG4gICAgdGV4dGRvbWFpbjogJ2hhbmRvZmYnLFxuICAgIGVkaXRvclNjcmlwdDogJ2ZpbGU6Li9pbmRleC5qcycsXG4gICAgZWRpdG9yU3R5bGU6ICdmaWxlOi4vaW5kZXguY3NzJyxcbiAgICBzdHlsZTogJ2ZpbGU6Li9zdHlsZS1pbmRleC5jc3MnLFxuICAgIHJlbmRlcjogJ2ZpbGU6Li9yZW5kZXIucGhwJyxcbiAgICBhdHRyaWJ1dGVzOiBhbGxBdHRyaWJ1dGVzLFxuICAgIHN1cHBvcnRzOiB7XG4gICAgICBhbGlnbjogWydub25lJywgJ3dpZGUnLCAnZnVsbCddLFxuICAgICAgaHRtbDogZmFsc2UsXG4gICAgfSxcbiAgICB2YXJpYXRpb25zLFxuICB9O1xuXG4gIGlmIChhbnlIYXNTY3JlZW5zaG90KSB7XG4gICAgYmxvY2tKc29uLmV4YW1wbGUgPSB7XG4gICAgICB2aWV3cG9ydFdpZHRoOiAxMjAwLFxuICAgICAgYXR0cmlidXRlczogeyBoYW5kb2ZmVmFyaWFudDogdmFyaWFudHNbMF0uY29tcG9uZW50LmlkLCBfX3ByZXZpZXc6IHRydWUgfSxcbiAgICB9O1xuICB9XG5cbiAgYmxvY2tKc29uLl9faGFuZG9mZiA9IHtcbiAgICByZW1vdmVkRnJvbUhhbmRvZmY6IGZhbHNlLFxuICB9O1xuXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShibG9ja0pzb24sIG51bGwsIDIpO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBpbmRleC5qcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqXG4gKiBSZXBsYWNlIG9jY3VycmVuY2VzIG9mIGEgcmVnZXggcGF0dGVybiBvbmx5IGluIGNvZGUgc2VnbWVudHMsXG4gKiBza2lwcGluZyBjb250ZW50IGluc2lkZSBxdW90ZWQgc3RyaW5ncyAoc2luZ2xlLCBkb3VibGUsIG9yIGJhY2t0aWNrKS5cbiAqIFRoaXMgcHJldmVudHMgZmllbGQgbmFtZSByZW1hcHBpbmcgZnJvbSBjb3JydXB0aW5nIENTUyBjbGFzcyBuYW1lc1xuICogYW5kIG90aGVyIHN0cmluZyBsaXRlcmFscyBpbiB0aGUgZ2VuZXJhdGVkIEpTWC5cbiAqL1xuY29uc3QgcmVwbGFjZU91dHNpZGVTdHJpbmdzID0gKGpzeDogc3RyaW5nLCBwYXR0ZXJuOiBSZWdFeHAsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGkgPSAwO1xuICBsZXQgaW5TdHJpbmc6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgc2VnU3RhcnQgPSAwO1xuXG4gIHdoaWxlIChpIDwganN4Lmxlbmd0aCkge1xuICAgIGlmIChpblN0cmluZykge1xuICAgICAgaWYgKGpzeFtpXSA9PT0gJ1xcXFwnKSB7XG4gICAgICAgIGkgKz0gMjtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoanN4W2ldID09PSBpblN0cmluZykge1xuICAgICAgICBzZWdtZW50cy5wdXNoKGpzeC5zbGljZShzZWdTdGFydCwgaSArIDEpKTtcbiAgICAgICAgc2VnU3RhcnQgPSBpICsgMTtcbiAgICAgICAgaW5TdHJpbmcgPSBudWxsO1xuICAgICAgfVxuICAgICAgaSsrO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoanN4W2ldID09PSAnXCInIHx8IGpzeFtpXSA9PT0gXCInXCIgfHwganN4W2ldID09PSAnYCcpIHtcbiAgICAgICAgY29uc3Qgbm9uU3RyaW5nUGFydCA9IGpzeC5zbGljZShzZWdTdGFydCwgaSk7XG4gICAgICAgIHNlZ21lbnRzLnB1c2gobm9uU3RyaW5nUGFydC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KSk7XG4gICAgICAgIHNlZ1N0YXJ0ID0gaTtcbiAgICAgICAgaW5TdHJpbmcgPSBqc3hbaV07XG4gICAgICAgIGkrKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoc2VnU3RhcnQgPCBqc3gubGVuZ3RoKSB7XG4gICAgY29uc3QgcmVtYWluaW5nID0ganN4LnNsaWNlKHNlZ1N0YXJ0KTtcbiAgICBpZiAoaW5TdHJpbmcpIHtcbiAgICAgIHNlZ21lbnRzLnB1c2gocmVtYWluaW5nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VnbWVudHMucHVzaChyZW1haW5pbmcucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzZWdtZW50cy5qb2luKCcnKTtcbn07XG5cbmludGVyZmFjZSBNZXJnZWRJbmRleFJlc3VsdCB7XG4gIGluZGV4SnM6IHN0cmluZztcbiAgdmFyaWF0aW9uSnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkSW5kZXhKcyA9IChcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwVGl0bGU6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIHN1cGVyc2V0QXR0cnM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuICBhcGlVcmw/OiBzdHJpbmcsXG4gIHZhcmlhbnRTY3JlZW5zaG90cz86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LFxuICBlZGl0b3JDb25maWc/OiBIYW5kb2ZmRWRpdG9yQ29uZmlnLFxuKTogTWVyZ2VkSW5kZXhSZXN1bHQgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG5cbiAgLy8gQ29sbGVjdCBhbGwgdW5pcXVlIGZlYXR1cmVzIG5lZWRlZCBhY3Jvc3MgdmFyaWFudHNcbiAgbGV0IG5lZWRzTWVkaWFVcGxvYWQgPSBmYWxzZTtcbiAgbGV0IG5lZWRzUmFuZ2VDb250cm9sID0gZmFsc2U7XG4gIGxldCBuZWVkc1RvZ2dsZUNvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzU2VsZWN0Q29udHJvbCA9IGZhbHNlO1xuICBsZXQgbmVlZHNMaW5rQ29udHJvbCA9IGZhbHNlO1xuICBsZXQgaGFzQXJyYXlQcm9wcyA9IGZhbHNlO1xuICBsZXQgYW55SGFzRHluYW1pY0FycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55SGFzQnJlYWRjcnVtYnNBcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc1RheG9ub215QXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNQYWdpbmF0aW9uQXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlVc2VzSW5uZXJCbG9ja3MgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlc1JpY2hUZXh0ID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcyA9IGZhbHNlO1xuXG4gIGNvbnN0IGhhc1Byb3BlcnR5VHlwZSA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCB0eXBlOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCBjaGVjayA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09IHR5cGUpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShjaGVjayk7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgdmFyaWFudC1zcGVjaWZpYyBjb250ZW50IChzaWRlYmFyIHBhbmVscyArIHByZXZpZXcpXG4gIGludGVyZmFjZSBWYXJpYW50R2VuUmVzdWx0IHtcbiAgICBwYW5lbHM6IHN0cmluZztcbiAgICBwcmV2aWV3SnN4OiBzdHJpbmc7XG4gICAgYXJyYXlIZWxwZXJzOiBzdHJpbmc7XG4gICAgZHluYW1pY1Jlc29sdXRpb246IHN0cmluZztcbiAgICBzcGVjaWFsaXplZFJlc29sdXRpb246IHN0cmluZztcbiAgICBoYXNCcmVhZGNydW1ic0ZldGNoOiBib29sZWFuO1xuICAgIGhhc1RheG9ub215RmV0Y2g6IGJvb2xlYW47XG4gICAgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdO1xuICAgIGhhc0xpbmtGaWVsZDogYm9vbGVhbjtcbiAgICBoYXNSaWNoVGV4dDogYm9vbGVhbjtcbiAgICBoYXMxMHVwSW1hZ2U6IGJvb2xlYW47XG4gICAgaGFzSW5uZXJCbG9ja3M6IGJvb2xlYW47XG4gIH1cblxuICBjb25zdCB2YXJpYW50UmVzdWx0czogUmVjb3JkPHN0cmluZywgVmFyaWFudEdlblJlc3VsdD4gPSB7fTtcblxuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IGNvbXAucHJvcGVydGllcztcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1tjb21wLmlkXTtcbiAgICBjb25zdCBkeW5hbWljQXJyYXlDb25maWdzID0gdmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzO1xuICAgIGNvbnN0IGhhc0R5bmFtaWMgPSBPYmplY3Qua2V5cyhkeW5hbWljQXJyYXlDb25maWdzKS5sZW5ndGggPiAwO1xuXG4gICAgLy8gRGV0ZWN0IGZlYXR1cmUgbmVlZHNcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdpbWFnZScpKSBuZWVkc01lZGlhVXBsb2FkID0gdHJ1ZTtcbiAgICBpZiAoaGFzT3BhY2l0eVJhbmdlRmllbGQocHJvcGVydGllcykpIG5lZWRzUmFuZ2VDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNUb2dnbGVDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdzZWxlY3QnKSkgbmVlZHNTZWxlY3RDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNMaW5rQ29udHJvbCA9IHRydWU7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZSgocCkgPT4gcC50eXBlID09PSAnYXJyYXknKSkgaGFzQXJyYXlQcm9wcyA9IHRydWU7XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGNvbnN0IGhhc1Bvc3RzRHluYW1pYyA9IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSk7XG4gICAgICBpZiAoaGFzUG9zdHNEeW5hbWljKSB7IGFueUhhc0R5bmFtaWNBcnJheXMgPSB0cnVlOyBuZWVkc1NlbGVjdENvbnRyb2wgPSB0cnVlOyB9XG4gICAgICAvLyBCcmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIHVzZSBzaGFyZWQgY29tcG9uZW50cyDigJQgdGhleSBpbXBvcnQgdGhlaXIgb3duXG4gICAgICAvLyBUb2dnbGVDb250cm9sL1NlbGVjdENvbnRyb2wsIHNvIHdlIGRvIG5vdCBuZWVkIHRvIGFkZCB0aG9zZSB0byB0aGUgZ3JvdXAgYmxvY2sgaW1wb3J0cy5cbiAgICAgIGlmIChPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpKSBhbnlIYXNCcmVhZGNydW1ic0FycmF5cyA9IHRydWU7XG4gICAgICBpZiAoT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKSkgYW55SGFzVGF4b25vbXlBcnJheXMgPSB0cnVlO1xuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKSkgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IHRydWU7XG4gICAgfVxuICAgIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGFueVVzZXNJbm5lckJsb2NrcyA9IHRydWU7XG5cbiAgICAvLyBHZW5lcmF0ZSBwcmV2aWV3IChndWFyZCBhZ2FpbnN0IG1pc3NpbmcgY29kZS90aXRsZSBmcm9tIEFQSSlcbiAgICBjb25zdCBwcmV2aWV3UmVzdWx0OiBKc3hQcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgICAgY29tcC5jb2RlID8/ICcnLFxuICAgICAgcHJvcGVydGllcyxcbiAgICAgIGNvbXAuaWQgPz8gY29tcC50aXRsZSA/PyAndmFyaWFudCcsXG4gICAgICBjb21wLnRpdGxlID8/IGNvbXAuaWQgPz8gJ1ZhcmlhbnQnLFxuICAgICAgdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkLFxuICAgICAgZWRpdG9yQ29uZmlnLFxuICAgICk7XG4gICAgbGV0IHByZXZpZXdKc3ggPSBwcmV2aWV3UmVzdWx0LmpzeCA/PyAnJztcbiAgICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgICBjb25zdCB2YXJIYXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuICAgIGNvbnN0IHZhckhhc1JpY2hUZXh0ID0gcHJldmlld0pzeC5pbmNsdWRlcygnPFJpY2hUZXh0Jyk7XG4gICAgY29uc3QgdmFySGFzMTB1cEltYWdlID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJyk7XG4gICAgY29uc3QgdmFySGFzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgICBpZiAodmFySGFzTGlua0ZpZWxkKSBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHRydWU7XG4gICAgaWYgKHZhckhhc1JpY2hUZXh0KSBhbnlQcmV2aWV3VXNlc1JpY2hUZXh0ID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzMTB1cEltYWdlKSBhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSA9IHRydWU7XG4gICAgaWYgKHZhckhhc0lubmVyQmxvY2tzKSBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gdHJ1ZTtcblxuICAgIC8vIFJlbWFwIGF0dHJpYnV0ZSByZWZlcmVuY2VzIGluIHByZXZpZXcgSlNYIHVzaW5nIGZpZWxkTWFwLlxuICAgIC8vIFVzZXMgcmVwbGFjZU91dHNpZGVTdHJpbmdzIHRvIGF2b2lkIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gICAgLy8gYW5kIG90aGVyIHN0cmluZyBsaXRlcmFscyB0aGF0IGhhcHBlbiB0byBjb250YWluIHRoZSBmaWVsZCBuYW1lLlxuICAgIGZvciAoY29uc3QgW29yaWdLZXksIG1lcmdlZE5hbWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwKSkge1xuICAgICAgY29uc3Qgb3JpZ0NhbWVsID0gdG9DYW1lbENhc2Uob3JpZ0tleSk7XG4gICAgICBpZiAob3JpZ0NhbWVsICE9PSBtZXJnZWROYW1lKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke29yaWdDYW1lbH1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSByZXBsYWNlT3V0c2lkZVN0cmluZ3MocHJldmlld0pzeCwgcmVnZXgsIG1lcmdlZE5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIHBhbmVscyBmb3Igc2lkZWJhciBjb250cm9sc1xuICAgIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIGlmIChpbmxpbmVFZGl0YWJsZUZpZWxkcy5oYXMoa2V5KSAmJiBwcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcblxuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHttZXJnZWRBdHRyTmFtZX1cIlxuICAgICAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gICAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWw6IHN0cmluZykgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAgICcsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ1VSTCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLnVybCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgdXJsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPmA7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke21lcmdlZEF0dHJOYW1lfVwiXG4gICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRUYXhvbm9teT1cIiR7ZGVmYXVsdFRheG9ub215fVwiXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgICAgICA8PlxuJHtpdGVtRmllbGRzfVxuICAgICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8UGFnaW5hdGlvblNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7bWVyZ2VkQXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgICAgY29uc3QgZGVmYXVsdE1vZGUgPSBkeW5hbWljQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICAgIGlmIChjLm1vZGUgPT09ICd1aScpIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lLCBsYWJlbDogYy5sYWJlbCwgdHlwZTogJ3NlbGVjdCcsIG9wdGlvbnM6IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoYy5vcHRpb25zKSwgZGVmYXVsdDogYy5kZWZhdWx0IH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IGR5bmFtaWNDb25maWcuZmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgICBjb25zdCB0b3BLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICAgIGxldCBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgICBpZiAoaXRlbVByb3ApIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6IGNvbnRyb2xUeXBlID0gJ3NlbGVjdCc7IG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOiBjb250cm9sVHlwZSA9ICd0b2dnbGUnOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOiBjb250cm9sVHlwZSA9ICdudW1iZXInOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyAwOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGNvbnRyb2xUeXBlID0gJ3RleHQnOyBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgfHwgJyR7ZGVmYXVsdE1vZGV9JyxcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9zdHM6ICR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhuZXh0VmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoe1xuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJnczogeyAuLi5uZXh0VmFsdWUucXVlcnlBcmdzLCBwb3N0X3R5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgICAgIG1heEl0ZW1zOiAke2R5bmFtaWNDb25maWcubWF4SXRlbXMgPz8gMjB9LFxuICAgICAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICAgICAgc2hvd0V4Y2x1ZGVDdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgeyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJyAmJiAoXG4gICAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICB7LyogTWFudWFsIGFycmF5IGNvbnRyb2xzICovfVxuICAgICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xJbmRlbnQgPSAnICAgICAgICAgICAgICAgICc7XG4gICAgICAgIGxldCBjb250cm9sT3V0cHV0OiBzdHJpbmc7XG4gICAgICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgICAgY29udHJvbE91dHB1dCA9IGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIG1lcmdlZEF0dHJOYW1lLCBsYWJlbCwgY29udHJvbEluZGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBtZXJnZWRBdHRyTmFtZSxcbiAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlOiBzdHJpbmcpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHttZXJnZWRBdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICAgICAgICAgIGluZGVudDogY29udHJvbEluZGVudCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNvbnRyb2xPdXRwdXQgPSBnZW5lcmF0ZUZpZWxkQ29udHJvbChrZXksIHByb3BlcnR5LCBjdHgpO1xuICAgICAgICB9XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4ke2NvbnRyb2xPdXRwdXR9XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gRGVzaWduIFN5c3RlbSBsaW5rcyBwYW5lbCAocGVyLXZhcmlhbnQgY29tcG9uZW50IFVSTHMpXG4gICAgbGV0IGhhbmRvZmZVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBpZiAoYXBpVXJsKSB7XG4gICAgICBjb25zdCBiYXNlVXJsID0gYXBpVXJsLnJlcGxhY2UoL1xcL2FwaVxcLz8kLywgJycpO1xuICAgICAgaGFuZG9mZlVybCA9IGAke2Jhc2VVcmx9L3N5c3RlbS9jb21wb25lbnQvJHtjb21wLmlkfWA7XG4gICAgfSBlbHNlIGlmIChjb21wLnByZXZpZXcpIHtcbiAgICAgIGhhbmRvZmZVcmwgPSBjb21wLnByZXZpZXc7XG4gICAgfVxuICAgIGNvbnN0IGZpZ21hVXJsID0gY29tcC5maWdtYTtcbiAgICBpZiAoaGFuZG9mZlVybCB8fCBmaWdtYVVybCkge1xuICAgICAgY29uc3QgbGlua0J1dHRvbnM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoaGFuZG9mZlVybCkge1xuICAgICAgICBsaW5rQnV0dG9ucy5wdXNoKGAgICAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIlxuICAgICAgICAgICAgICAgICAgICBocmVmPVwiJHtoYW5kb2ZmVXJsfVwiXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIlxuICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyB9fVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICB7X18oJ1ZpZXcgaW4gSGFuZG9mZicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICA8L0J1dHRvbj5gKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWdtYVVybCkge1xuICAgICAgICBsaW5rQnV0dG9ucy5wdXNoKGAgICAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIlxuICAgICAgICAgICAgICAgICAgICBocmVmPVwiJHtmaWdtYVVybH1cIlxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIlxuICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJcbiAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyB9fVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICB7X18oJ09wZW4gaW4gRmlnbWEnLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgPC9CdXR0b24+YCk7XG4gICAgICB9XG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnRGVzaWduIFN5c3RlbScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7bGlua0J1dHRvbnMuam9pbignXFxuJyl9XG4gICAgICAgICAgICAgICAgPC9GbGV4PlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG5cbiAgICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gY29kZVxuICAgIC8vIFNwZWNpYWxpemVkIGFycmF5cyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgcmVzb2x2ZSBpbiB0aGVcbiAgICAvLyB2YXJpYXRpb24gZmlsZSdzIFByZXZpZXcgZnVuY3Rpb24gc28gdGhlIGhvb2tzIGxpdmUgaW4gdGhlIGNvcnJlY3Qgc2NvcGUuXG4gICAgLy8gRHluYW1pYyBwb3N0IGFycmF5cyByZXNvbHZlIGluIHRoZSBtYWluIGluZGV4LmpzIGVkaXQoKS5cbiAgICBsZXQgZHluYW1pY1Jlc29sdXRpb24gPSAnJztcbiAgICBsZXQgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uID0gJyc7XG4gICAgbGV0IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSBmYWxzZTtcbiAgICBsZXQgdmFySGFzVGF4b25vbXlGZXRjaCA9IGZhbHNlO1xuICAgIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2ZpZWxkS2V5XSB8fCB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgICB2YXJIYXNCcmVhZGNydW1ic0ZldGNoID0gdHJ1ZTtcbiAgICAgICAgICBjb25zdCBjYXAgPSBtZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKcyA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYCA6ICcnO1xuICAgICAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbiArPSBgXG4gIGNvbnN0IFtwcmV2aWV3JHtjYXB9LCBzZXRQcmV2aWV3JHtjYXB9XSA9IHVzZVN0YXRlKG51bGwpO1xuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgIGlmICghJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgIC50aGVuKChpdGVtcykgPT4gc2V0UHJldmlldyR7Y2FwfSgoaXRlbXMgfHwgW10pJHttYXBFeHByfSkpXG4gICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICB9LCBbJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICAgIHZhckhhc1RheG9ub215RmV0Y2ggPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNhcCA9IG1lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnMgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWAgOiAnJztcbiAgICAgICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24gKz0gYFxuICBjb25zdCBwcmV2aWV3JHtjYXB9ID0gdXNlU2VsZWN0KFxuICAgIChzZWxlY3QpID0+IHtcbiAgICAgIGlmICghJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICBpZiAoJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gJHttZXJnZWRBdHRyTmFtZX0gfHwgW107XG4gICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgIGNvbnN0IHRheG9ub215ID0gJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teSB8fCAnJHtkeW5Db25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnfSc7XG4gICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgIGNvbnN0IHRlcm1zID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldEVudGl0eVJlY29yZHMoJ3RheG9ub215JywgdGF4b25vbXksIHsgcG9zdDogcG9zdElkLCBwZXJfcGFnZTogJHtkeW5Db25maWcubWF4SXRlbXMgPz8gLTF9IH0pO1xuICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgIH0sXG4gICAgWyR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZCwgJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UsICR7bWVyZ2VkQXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9IHx8IFtdKV1cbiAgKTtcbmA7XG4gICAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uICs9IGBcbiAgY29uc3QgcHJldmlldyR7bWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke21lcmdlZEF0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke21lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2FwID0gbWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkVmFyTmFtZSA9IGByZXNvbHZlZCR7Y2FwfWA7XG4gICAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgICBkeW5hbWljUmVzb2x1dGlvbiArPSBgXG4gICAgICBjb25zdCAke3Jlc29sdmVkVmFyTmFtZX0gPSB1c2VTZWxlY3QoXG4gICAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgICBpZiAoJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgICAgY29uc3QgcXVlcnlBcmdzID0gJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge307XG4gICAgICAgICAgICBjb25zdCBwb3N0VHlwZSA9ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUgfHwgJ3Bvc3QnO1xuICAgICAgICAgICAgY29uc3QgYXJncyA9IHtcbiAgICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2R5bkNvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgICBvcmRlcjogKHF1ZXJ5QXJncy5vcmRlciB8fCAnREVTQycpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHJlY29yZHMpKSByZXR1cm4gW107XG4gICAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHttZXJnZWRBdHRyTmFtZX1GaWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge307XG4gICAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke21lcmdlZEF0dHJOYW1lfUZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiBzZWxlY3RlZFxuICAgICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWMgPyBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KSA6IG51bGw7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSxcbiAgICAgICAgWyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlLCAke21lcmdlZEF0dHJOYW1lfVBvc3RUeXBlLCBKU09OLnN0cmluZ2lmeSgke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9RmllbGRNYXBwaW5nIHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9KV1cbiAgICAgICk7XG4gICAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7bWVyZ2VkQXR0ck5hbWV9ID8/IFtdKTtcbiAgICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgICAvLyBSZW1hcCBpbiBwcmV2aWV3XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIHByZXZpZXdWYXJOYW1lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBcnJheSBoZWxwZXJzXG4gICAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnNNZXJnZWQocHJvcGVydGllcywgZmllbGRNYXApO1xuXG4gICAgdmFyaWFudFJlc3VsdHNbY29tcC5pZF0gPSB7XG4gICAgICBwYW5lbHM6IHBhbmVscy5qb2luKCdcXG5cXG4nKSxcbiAgICAgIHByZXZpZXdKc3gsXG4gICAgICBhcnJheUhlbHBlcnMsXG4gICAgICBkeW5hbWljUmVzb2x1dGlvbjogZHluYW1pY1Jlc29sdXRpb24sXG4gICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24sXG4gICAgICBoYXNCcmVhZGNydW1ic0ZldGNoOiB2YXJIYXNCcmVhZGNydW1ic0ZldGNoLFxuICAgICAgaGFzVGF4b25vbXlGZXRjaDogdmFySGFzVGF4b25vbXlGZXRjaCxcbiAgICAgIHJlc29sdmluZ0ZsYWdzLFxuICAgICAgaGFzTGlua0ZpZWxkOiB2YXJIYXNMaW5rRmllbGQsXG4gICAgICBoYXNSaWNoVGV4dDogdmFySGFzUmljaFRleHQsXG4gICAgICBoYXMxMHVwSW1hZ2U6IHZhckhhczEwdXBJbWFnZSxcbiAgICAgIGhhc0lubmVyQmxvY2tzOiB2YXJIYXNJbm5lckJsb2NrcyxcbiAgICB9O1xuICB9XG5cbiAgLy8gQnVpbGQgaW1wb3J0c1xuICBjb25zdCBibG9ja0VkaXRvckltcG9ydHMgPSBbJ3VzZUJsb2NrUHJvcHMnLCAnSW5zcGVjdG9yQ29udHJvbHMnLCAnQmxvY2tDb250cm9scyddO1xuICBpZiAobmVlZHNNZWRpYVVwbG9hZCkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICBpZiAoYW55VXNlc0lubmVyQmxvY2tzIHx8IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICBpZiAobmVlZHNMaW5rQ29udHJvbCB8fCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkge1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdMaW5rQ29udHJvbCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTGlua0NvbnRyb2wnKTtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cbiAgaWYgKChhbnlQcmV2aWV3VXNlc1JpY2hUZXh0IHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cblxuICBjb25zdCBjb21wb25lbnRJbXBvcnRzID0gWydQYW5lbEJvZHknLCAnVGV4dENvbnRyb2wnLCAnQnV0dG9uJywgJ1NlbGVjdENvbnRyb2wnLCAnRHJvcGRvd25NZW51J107XG4gIGlmIChuZWVkc1JhbmdlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdSYW5nZUNvbnRyb2wnKTtcbiAgaWYgKG5lZWRzVG9nZ2xlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdUb2dnbGVDb250cm9sJyk7XG4gIGlmIChhbnlIYXNEeW5hbWljQXJyYXlzKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1NwaW5uZXInKTtcbiAgY29uc3QgYW55SGFzUmljaHRleHRJbkFycmF5ID0gdmFyaWFudHMuc29tZSgodikgPT5cbiAgICBPYmplY3QudmFsdWVzKHYuY29tcG9uZW50LnByb3BlcnRpZXMpLnNvbWUocCA9PlxuICAgICAgcC50eXBlID09PSAnYXJyYXknICYmIHAuaXRlbXM/LnByb3BlcnRpZXMgJiZcbiAgICAgIE9iamVjdC52YWx1ZXMocC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGlwID0+IGlwLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgKVxuICApO1xuICBpZiAoYW55SGFzUmljaHRleHRJbkFycmF5KSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RleHRhcmVhQ29udHJvbCcpO1xuICBjb21wb25lbnRJbXBvcnRzLnB1c2goJ0ZsZXgnKTtcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIGZvciBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IHByb3BlcnRpZXMgYWNyb3NzIGFsbCB2YXJpYW50c1xuICBjb25zdCBhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA9IHZhcmlhbnRzLnNvbWUoKHYpID0+XG4gICAgT2JqZWN0LmVudHJpZXModi5jb21wb25lbnQucHJvcGVydGllcykuc29tZShcbiAgICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXYuZHluYW1pY0FycmF5Q29uZmlnc1trXSB8fCAhKCdhcnJheVR5cGUnIGluIHYuZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICAgKVxuICApO1xuICBjb25zdCB0ZW5VcEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cykgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIGlmIChhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSkgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDAgPyBgaW1wb3J0IHsgJHt0ZW5VcEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gIDogJyc7XG5cbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoYW55SGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoYW55SGFzQnJlYWRjcnVtYnNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmIChhbnlIYXNUYXhvbm9teUFycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGFueUhhc1BhZ2luYXRpb25BcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBhbnlIYXNEeW5hbWljQXJyYXlzIHx8IGFueUhhc1RheG9ub215QXJyYXlzO1xuICBpZiAobmVlZHNEYXRhU3RvcmUpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IHVzZVNlbGVjdCR7YW55SGFzQnJlYWRjcnVtYnNBcnJheXMgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cbiAgaWYgKGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gO1xuICB9XG5cbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChhbnlIYXNCcmVhZGNydW1ic0FycmF5cykge1xuICAgIGVsZW1lbnRJbXBvcnRzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuICB9XG5cbiAgLy8gQWxsIGF0dHJpYnV0ZSBuYW1lcyBmb3IgZGVzdHJ1Y3R1cmluZ1xuICBjb25zdCBhbGxBdHRyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgYWxsQXR0ck5hbWVzLmFkZCgnaGFuZG9mZlZhcmlhbnQnKTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBPYmplY3Qua2V5cyhzdXBlcnNldEF0dHJzKSkge1xuICAgIGFsbEF0dHJOYW1lcy5hZGQoYXR0ck5hbWUpO1xuICB9XG4gIC8vIEFsc28gYWRkIGR5bmFtaWMgYXJyYXkgZGVyaXZlZCBhdHRyaWJ1dGUgbmFtZXNcbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gZmllbGRNYXBzW3ZhcmlhbnQuY29tcG9uZW50LmlkXVtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRvb2xiYXIgdmFyaWF0aW9uIHN3aXRjaGVyIGNvbnRyb2xzIChmb3IgQmxvY2tDb250cm9scyBEcm9wZG93bk1lbnUpXG4gIGNvbnN0IHRvb2xiYXJWYXJpYW50Q29udHJvbHMgPSB2YXJpYW50c1xuICAgIC5tYXAoXG4gICAgICAodikgPT5cbiAgICAgICAgYCAgICAgICAgeyB0aXRsZTogJyR7KHYuY29tcG9uZW50LnRpdGxlID8/IHYuY29tcG9uZW50LmlkID8/ICcnKS50b1N0cmluZygpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCBvbkNsaWNrOiAoKSA9PiBzZXRBdHRyaWJ1dGVzKHsgaGFuZG9mZlZhcmlhbnQ6ICcke3YuY29tcG9uZW50LmlkID8/ICcnfScgfSkgfWAsXG4gICAgKVxuICAgIC5qb2luKCcsXFxuJyk7XG5cbiAgLy8gQ29sbGVjdCBhbGwgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lcyB0aGF0IGFyZSBhcnJheSB0eXBlIChhY3Jvc3MgYWxsIHZhcmlhbnRzKSBzbyB3ZSBlbWl0IGVhY2ggaGVscGVyIG9uY2VcbiAgY29uc3QgYWxsQXJyYXlNZXJnZWROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF07XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JykgYWxsQXJyYXlNZXJnZWROYW1lcy5hZGQoZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2hhcmVkQXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMoYWxsQXJyYXlNZXJnZWROYW1lcyk7XG5cbiAgLy8gVmFyaWF0aW9uIGluY2x1ZGUgaW1wb3J0cyBhbmQgY29tcG9uZW50IHVzYWdlIChvbmUgZmlsZSBwZXIgdmFyaWFudClcbiAgY29uc3QgdmFyaWFudEltcG9ydExpbmVzID0gdmFyaWFudHMubWFwKFxuICAgICh2KSA9PiBgaW1wb3J0ICogYXMgJHt2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCl9IGZyb20gJy4vdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfSc7YCxcbiAgKTtcbiAgY29uc3QgaGVscGVyTmFtZXNMaXN0ID0gWy4uLmFsbEFycmF5TWVyZ2VkTmFtZXNdLm1hcChcbiAgICAoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWAsXG4gICk7XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgaGVscGVyTmFtZXNMaXN0LnB1c2goJ0hhbmRvZmZMaW5rRmllbGQnKTtcbiAgaWYgKGFueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzKSBoZWxwZXJOYW1lc0xpc3QucHVzaCgnQ09OVEVOVF9CTE9DS1MnKTtcbiAgY29uc3QgaGVscGVyc09iamVjdExpbmUgPVxuICAgIGhlbHBlck5hbWVzTGlzdC5sZW5ndGggPiAwXG4gICAgICA/IGAgICAgY29uc3QgaGVscGVycyA9IHsgJHtoZWxwZXJOYW1lc0xpc3Quam9pbignLCAnKX0gfTtgXG4gICAgICA6ICcgICAgY29uc3QgaGVscGVycyA9IHt9Oyc7XG5cbiAgY29uc3QgdmFyaWFudFBhbmVsQmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgICBpZiAoIXJlc3VsdC5wYW5lbHMudHJpbSgpKSByZXR1cm4gJyc7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHt2LmNvbXBvbmVudC5pZH0nICYmIDwke1Bhc2NhbH0uUGFuZWxzIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIGNvbnN0IHZhcmlhbnRQcmV2aWV3QmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAgICB7aGFuZG9mZlZhcmlhbnQgPT09ICcke3YuY29tcG9uZW50LmlkfScgJiYgPCR7UGFzY2FsfS5QcmV2aWV3IGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuam9pbignXFxuJyk7XG5cbiAgLy8gUGVyLXZhcmlhbnQgSlMgaW5jbHVkZSBmaWxlIGNvbnRlbnRzICh3cml0dGVuIHRvIHZhcmlhdGlvbnMvPGlkPi5qcylcbiAgY29uc3QgdmFyaWF0aW9uSnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW3YuY29tcG9uZW50LmlkXTtcbiAgICBjb25zdCBoZWxwZXJOYW1lcyA9IFsuLi5hbGxBcnJheU1lcmdlZE5hbWVzXVxuICAgICAgLmZpbHRlcigoYXR0ck5hbWUpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgKGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF1ba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKSA9PT0gYXR0ck5hbWUpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLm1hcCgoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWApO1xuICAgIHZhcmlhdGlvbkpzW3YuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudEpzRmlsZUNvbnRlbnQoXG4gICAgICB2LFxuICAgICAgcmVzdWx0LFxuICAgICAgZmllbGRNYXAsXG4gICAgICBoZWxwZXJOYW1lcyxcbiAgICAgIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkLFxuICAgICAgZWRpdG9yQ29uZmlnLFxuICAgICk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50LWNvbmRpdGlvbmFsIGR5bmFtaWMgcmVzb2x1dGlvbiArIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgdmFyaWFudER5bmFtaWNCbG9ja3MgPSB2YXJpYW50cy5tYXAoKHYpID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgY29uc3QgY29kZSA9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbiArIHJlc3VsdC5hcnJheUhlbHBlcnM7XG4gICAgaWYgKCFjb2RlLnRyaW0oKSkgcmV0dXJuICcnO1xuICAgIHJldHVybiBgICAgIGlmIChoYW5kb2ZmVmFyaWFudCA9PT0gJyR7di5jb21wb25lbnQuaWR9Jykge1xuJHtjb2RlfVxuICAgIH1gO1xuICB9KS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgLy8gRm9yIGR5bmFtaWMgcmVzb2x1dGlvbiwgd2UgbmVlZCB0aGUgdmFyaWFibGVzIHRvIGJlIGRlY2xhcmVkIGluIGEgc2NvcGUgdmlzaWJsZSB0byB0aGUgcHJldmlld1xuICAvLyBXZSdsbCB1c2UgYSBkaWZmZXJlbnQgYXBwcm9hY2g6IGRlY2xhcmUgYWxsIGF0IHRvcCwgY29uZGl0aW9uYWxseSBwb3B1bGF0ZVxuICBjb25zdCBhbGxSZXNvbHZpbmdGbGFncyA9IHZhcmlhbnRzLmZsYXRNYXAoKHYpID0+IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXS5yZXNvbHZpbmdGbGFncyk7XG4gIGNvbnN0IGhhc0FueVJlc29sdmluZyA9IGFsbFJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDA7XG5cbiAgLy8gR2VuZXJhdGUgZHluYW1pYyByZXNvbHV0aW9uIHBlciB2YXJpYW50OyBhcnJheSBoZWxwZXJzIGFyZSBlbWl0dGVkIG9uY2UgYWJvdmUgKHNoYXJlZEFycmF5SGVscGVycylcbiAgbGV0IGNvbWJpbmVkRHluYW1pY0NvZGUgPSBzaGFyZWRBcnJheUhlbHBlcnMudHJpbSgpID8gYFxcbiR7c2hhcmVkQXJyYXlIZWxwZXJzfWAgOiAnJztcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGlmIChyZXN1bHQuZHluYW1pY1Jlc29sdXRpb24udHJpbSgpKSB7XG4gICAgICBjb21iaW5lZER5bmFtaWNDb2RlICs9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBhdHRyTmFtZXNMaXN0ID0gQXJyYXkuZnJvbShhbGxBdHRyTmFtZXMpO1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtY29uZGl0aW9uYWwgTWVkaWFSZXBsYWNlRmxvdyB0b29sYmFyIGVudHJpZXMgZm9yIGltYWdlIGZpZWxkc1xuICBjb25zdCB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdi5jb21wb25lbnQ7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgaW1hZ2VFbnRyaWVzOiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IG1lcmdlZEF0dHJOYW1lOiBzdHJpbmcgfT4gPSBbXTtcblxuICAgIGNvbnN0IGNvbGxlY3RJbWFnZXMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWROYW1lID0gcGFyZW50UGF0aFxuICAgICAgICAgID8gYCR7ZmllbGRNYXBbcGFyZW50UGF0aF0gfHwgdG9DYW1lbENhc2UocGFyZW50UGF0aCl9YFxuICAgICAgICAgIDogKGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KSk7XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgICBpbWFnZUVudHJpZXMucHVzaCh7XG4gICAgICAgICAgICBsYWJlbDogcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSksXG4gICAgICAgICAgICBtZXJnZWRBdHRyTmFtZTogcGFyZW50UGF0aCA/IG1lcmdlZE5hbWUgOiBtZXJnZWROYW1lLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgIGNvbGxlY3RJbWFnZXMocHJvcC5wcm9wZXJ0aWVzLCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICBjb2xsZWN0SW1hZ2VzKGNvbXAucHJvcGVydGllcyk7XG5cbiAgICBpZiAoaW1hZ2VFbnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IG1lZGlhRmxvd3MgPSBpbWFnZUVudHJpZXMubWFwKChpbWcpID0+XG4gICAgICAgIGAgICAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgICBtZWRpYUlkPXske2ltZy5tZXJnZWRBdHRyTmFtZX0/LmlkfVxuICAgICAgICAgICAgICBtZWRpYVVybD17JHtpbWcubWVyZ2VkQXR0ck5hbWV9Py5zcmN9XG4gICAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7aW1nLm1lcmdlZEF0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0pfVxuICAgICAgICAgICAgICBuYW1lPXtfXygnJHtpbWcubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIC8+YFxuICAgICAgKS5qb2luKCdcXG4nKTtcbiAgICAgIHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MucHVzaChcbiAgICAgICAgYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHtjb21wLmlkfScgJiYgKFxcbiAgICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XFxuJHttZWRpYUZsb3dzfVxcbiAgICAgICAgICA8L0Jsb2NrQ29udHJvbHM+XFxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1lZGlhUmVwbGFjZUpzeCA9IHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MubGVuZ3RoID4gMFxuICAgID8gJ1xcbicgKyB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzLmpvaW4oJ1xcbicpXG4gICAgOiAnJztcblxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVHcm91cFN2Z0ljb25Db2RlKGdyb3VwVGl0bGUsIGdyb3VwU2x1Zyk7XG5cbiAgLy8gQnVpbGQgc2NyZWVuc2hvdCBpbXBvcnRzIGFuZCBsb29rdXAgbWFwIGZvciB2YXJpYW50IHByZXZpZXdzXG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnRMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3Qgc2NyZWVuc2hvdE1hcEVudHJpZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGFueVZhcmlhbnRIYXNTY3JlZW5zaG90ID0gdmFyaWFudFNjcmVlbnNob3RzICYmIE9iamVjdC52YWx1ZXModmFyaWFudFNjcmVlbnNob3RzKS5zb21lKEJvb2xlYW4pO1xuXG4gIGlmIChhbnlWYXJpYW50SGFzU2NyZWVuc2hvdCAmJiB2YXJpYW50U2NyZWVuc2hvdHMpIHtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICAgIGlmICh2YXJpYW50U2NyZWVuc2hvdHNbdi5jb21wb25lbnQuaWRdKSB7XG4gICAgICAgIGNvbnN0IHNhZmVWYXIgPSAnc2NyZWVuc2hvdF8nICsgdmFyaWFudElkVG9DYW1lbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICAgIHNjcmVlbnNob3RJbXBvcnRMaW5lcy5wdXNoKGBpbXBvcnQgJHtzYWZlVmFyfSBmcm9tICcuL3NjcmVlbnNob3QtJHt2LmNvbXBvbmVudC5pZH0ucG5nJztgKTtcbiAgICAgICAgc2NyZWVuc2hvdE1hcEVudHJpZXMucHVzaChgICAnJHt2LmNvbXBvbmVudC5pZH0nOiAke3NhZmVWYXJ9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnRzID0gc2NyZWVuc2hvdEltcG9ydExpbmVzLmxlbmd0aCA+IDBcbiAgICA/IHNjcmVlbnNob3RJbXBvcnRMaW5lcy5qb2luKCdcXG4nKSArICdcXG4nXG4gICAgOiAnJztcbiAgY29uc3Qgc2NyZWVuc2hvdE1hcENvZGUgPSBzY3JlZW5zaG90TWFwRW50cmllcy5sZW5ndGggPiAwXG4gICAgPyBgY29uc3QgdmFyaWFudFNjcmVlbnNob3RzID0ge1xcbiR7c2NyZWVuc2hvdE1hcEVudHJpZXMuam9pbignLFxcbicpfVxcbn07XFxuYFxuICAgIDogJyc7XG4gIGNvbnN0IHByZXZpZXdHdWFyZCA9IGFueVZhcmlhbnRIYXNTY3JlZW5zaG90XG4gICAgPyBgICAgIGlmIChhdHRyaWJ1dGVzLl9fcHJldmlldykge1xuICAgICAgY29uc3Qgc2NyZWVuc2hvdFNyYyA9IHZhcmlhbnRTY3JlZW5zaG90c1toYW5kb2ZmVmFyaWFudF07XG4gICAgICBpZiAoc2NyZWVuc2hvdFNyYykge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgICAgPGltZyBzcmM9e3NjcmVlbnNob3RTcmN9IGFsdD17bWV0YWRhdGEudGl0bGV9IHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19IC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgY29uc3QgaW5kZXhKc1RlbXBsYXRlID0gYGltcG9ydCB7IHJlZ2lzdGVyQmxvY2tUeXBlIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9ja3MnO1xuaW1wb3J0IHsgXG4gICR7YmxvY2tFZGl0b3JJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgXG4gICR7Y29tcG9uZW50SW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbiR7dGVuVXBJbXBvcnR9JHtzaGFyZWRDb21wb25lbnRJbXBvcnR9aW1wb3J0IG1ldGFkYXRhIGZyb20gJy4vYmxvY2suanNvbic7XG5pbXBvcnQgJy4vZWRpdG9yLnNjc3MnO1xuJHthbnlIYXNEeW5hbWljQXJyYXlzID8gXCJpbXBvcnQgJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0R5bmFtaWNQb3N0U2VsZWN0b3IuZWRpdG9yLnNjc3MnO1xcblwiIDogJyd9aW1wb3J0ICcuL3N0eWxlLnNjc3MnO1xuJHtzY3JlZW5zaG90SW1wb3J0c30ke3ZhcmlhbnRJbXBvcnRMaW5lcy5qb2luKCdcXG4nKX1cbiR7c2NyZWVuc2hvdE1hcENvZGV9Y29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO1xuXG5yZWdpc3RlckJsb2NrVHlwZShtZXRhZGF0YS5uYW1lLCB7XG4gIC4uLm1ldGFkYXRhLFxuICBpY29uOiBibG9ja0ljb24sXG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXNMaXN0LmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtwcmV2aWV3R3VhcmR9XG4ke2NvbWJpbmVkRHluYW1pY0NvZGV9XG4ke2hlbHBlcnNPYmplY3RMaW5lfVxuICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxCbG9ja0NvbnRyb2xzIGdyb3VwPVwiYmxvY2tcIj5cbiAgICAgICAgICA8RHJvcGRvd25NZW51XG4gICAgICAgICAgICBpY29uPVwibGF5b3V0XCJcbiAgICAgICAgICAgIGxhYmVsPXtfXygnVmFyaWF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIGNvbnRyb2xzPXtbXG4ke3Rvb2xiYXJWYXJpYW50Q29udHJvbHN9XG4gICAgICAgICAgICBdfVxuICAgICAgICAgIC8+XG4gICAgICAgIDwvQmxvY2tDb250cm9scz4ke21lZGlhUmVwbGFjZUpzeH1cbiAgICAgICAgPEluc3BlY3RvckNvbnRyb2xzPlxuJHt2YXJpYW50UGFuZWxCbG9ja3N9XG4gICAgICAgIDwvSW5zcGVjdG9yQ29udHJvbHM+XG5cbiAgICAgICAgey8qIEVkaXRvciBQcmV2aWV3ICovfVxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiR7dmFyaWFudFByZXZpZXdCbG9ja3N9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9GcmFnbWVudD5cbiAgICApO1xuICB9LFxuICBzYXZlOiAoKSA9PiB7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgcmV0dXJuIG51bGw7J31cbiAgfSxcbn0pO1xuYDtcbiAgcmV0dXJuIHsgaW5kZXhKczogaW5kZXhKc1RlbXBsYXRlLCB2YXJpYXRpb25KcyB9O1xufTtcblxuLy8g4pSA4pSA4pSAIEhlbHBlciBnZW5lcmF0b3JzIGZvciBtZXJnZWQgY29udGV4dCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnNNZXJnZWQgPSAoXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIGZpZWxkTWFwOiBGaWVsZE1hcCxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhlbHBlcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBpZiAocHJvcC50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBoZWxwZXJzLnB1c2goYFxuICAgIGNvbnN0IHVwZGF0ZSR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1JdGVtID0gKGluZGV4LCBmaWVsZCwgdmFsdWUpID0+IHtcbiAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLigke2F0dHJOYW1lfSB8fCBbXSldO1xuICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sIFtmaWVsZF06IHZhbHVlIH07XG4gICAgICBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgIH07YCk7XG4gIH1cbiAgcmV0dXJuIGhlbHBlcnMuam9pbignXFxuJyk7XG59O1xuXG4vKiogR2VuZXJhdGUgYXJyYXkgdXBkYXRlIGhlbHBlcnMgb25jZSBwZXIgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lIChhdm9pZHMgZHVwbGljYXRlIGRlY2xhcmF0aW9ucyBhY3Jvc3MgdmFyaWFudHMpLiAqL1xuY29uc3QgZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMgPSAobWVyZ2VkQXJyYXlBdHRyTmFtZXM6IFNldDxzdHJpbmc+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgaGVscGVyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBtZXJnZWRBcnJheUF0dHJOYW1lcykge1xuICAgIGNvbnN0IGhlbHBlck5hbWUgPSBgdXBkYXRlJHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfUl0ZW1gO1xuICAgIGhlbHBlcnMucHVzaChgXG4gICAgY29uc3QgJHtoZWxwZXJOYW1lfSA9IChpbmRleCwgZmllbGQsIHZhbHVlKSA9PiB7XG4gICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4oJHthdHRyTmFtZX0gfHwgW10pXTtcbiAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCBbZmllbGRdOiB2YWx1ZSB9O1xuICAgICAgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICB9O2ApO1xuICB9XG4gIHJldHVybiBoZWxwZXJzLmpvaW4oJ1xcbicpO1xufTtcblxuLyoqIENvbGxlY3QgYXR0cmlidXRlIG5hbWVzIHJlZmVyZW5jZWQgaW4gSlNYIChzZXRBdHRyaWJ1dGVzKHsgeDogb3IgdmFsdWU9e3h9KSBzbyB3ZSBkZXN0cnVjdHVyZSB0aGVtIGV2ZW4gaWYgbm90IGluIGZpZWxkTWFwLiAqL1xuY29uc3QgY29sbGVjdEF0dHJOYW1lc0Zyb21Kc3ggPSAoanN4OiBzdHJpbmcpOiBTZXQ8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IG5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHNldEF0dHJSZWdleCA9IC9zZXRBdHRyaWJ1dGVzXFxzKlxcKFxccypcXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKilcXHMqOi9nO1xuICBsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcbiAgd2hpbGUgKChtID0gc2V0QXR0clJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgY29uc3QgdmFsdWVSZWdleCA9IC92YWx1ZT1cXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKikoPzpcXHMqW1xcfFxcP1xcJlxcfFxcIV18W1xcc1xcblxccl0qXFw/XFw/fFtcXHNcXG5cXHJdKlxcfFxcfCkvZztcbiAgd2hpbGUgKChtID0gdmFsdWVSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIGNvbnN0IGNvbmRSZWdleCA9IC9cXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKilcXHMqJiYvZztcbiAgd2hpbGUgKChtID0gY29uZFJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgcmV0dXJuIG5hbWVzO1xufTtcblxuLyoqIEdlbmVyYXRlIHRoZSBKUyBjb250ZW50IGZvciBvbmUgdmFyaWF0aW9uIGluY2x1ZGUgZmlsZSAoZXhwb3J0cyBQYW5lbHMgYW5kIFByZXZpZXcpLiAqL1xuY29uc3QgZ2VuZXJhdGVWYXJpYW50SnNGaWxlQ29udGVudCA9IChcbiAgdmFyaWFudDogVmFyaWFudEluZm8sXG4gIHJlc3VsdDogeyBwYW5lbHM6IHN0cmluZzsgcHJldmlld0pzeDogc3RyaW5nOyBzcGVjaWFsaXplZFJlc29sdXRpb24/OiBzdHJpbmc7IGhhc0JyZWFkY3J1bWJzRmV0Y2g/OiBib29sZWFuOyBoYXNUYXhvbm9teUZldGNoPzogYm9vbGVhbiB9LFxuICBmaWVsZE1hcDogRmllbGRNYXAsXG4gIGhlbHBlck5hbWVzOiBzdHJpbmdbXSxcbiAgYW55UHJldmlld1VzZXNMaW5rRmllbGQ6IGJvb2xlYW4sXG4gIGVkaXRvckNvbmZpZz86IEhhbmRvZmZFZGl0b3JDb25maWcsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gIGNvbnN0IHZhcmlhbnREeW5Db25maWdzID0gdmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzO1xuICBjb25zdCBmcm9tRmllbGRNYXAgPSBuZXcgU2V0KE9iamVjdC52YWx1ZXMoZmllbGRNYXApKTtcbiAgLy8gU2NhbiBwcmV2aWV3IEpTWCBhbmQgcGFuZWwgSlNYIGZvciBhdHRyaWJ1dGUgbmFtZXMgdG8gZGVzdHJ1Y3R1cmUuXG4gIGNvbnN0IGZyb21QcmV2aWV3ID0gY29sbGVjdEF0dHJOYW1lc0Zyb21Kc3gocmVzdWx0LnByZXZpZXdKc3ggKyAnXFxuJyArIHJlc3VsdC5wYW5lbHMpO1xuICAvLyBDb2xsZWN0IHZhcmlhYmxlIG5hbWVzIGRlY2xhcmVkIGxvY2FsbHkgYnkgdGhlIHNwZWNpYWxpemVkIHJlc29sdXRpb24gY29kZVxuICAvLyAoZS5nLiBwcmV2aWV3QnJlYWRjcnVtYiBmcm9tIHVzZVN0YXRlLCBwcmV2aWV3VGFncyBmcm9tIHVzZVNlbGVjdCkuXG4gIC8vIFRoZXNlIG11c3QgTk9UIGJlIGRlc3RydWN0dXJlZCBmcm9tIGF0dHJpYnV0ZXMgb3IgdGhleSdsbCBjb25mbGljdC5cbiAgY29uc3QgbG9jYWxseURlY2xhcmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGlmIChyZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uKSB7XG4gICAgY29uc3Qgc3RhdGVNYXRjaCA9IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24ubWF0Y2hBbGwoL2NvbnN0XFxzK1xcWyhcXHcrKSxcXHMqKFxcdyspXFxdXFxzKj1cXHMqdXNlU3RhdGUvZyk7XG4gICAgZm9yIChjb25zdCBtIG9mIHN0YXRlTWF0Y2gpIHsgbG9jYWxseURlY2xhcmVkLmFkZChtWzFdKTsgbG9jYWxseURlY2xhcmVkLmFkZChtWzJdKTsgfVxuICAgIGNvbnN0IHNlbGVjdE1hdGNoID0gcmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbi5tYXRjaEFsbCgvY29uc3RcXHMrKFxcdyspXFxzKj1cXHMqdXNlU2VsZWN0L2cpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzZWxlY3RNYXRjaCkgeyBsb2NhbGx5RGVjbGFyZWQuYWRkKG1bMV0pOyB9XG4gIH1cbiAgY29uc3QgcmVzZXJ2ZWQgPSBuZXcgU2V0KFsnaW5kZXgnLCAndmFsdWUnLCAnaXRlbScsICdlJywgJ2tleScsICdvcGVuJ10pO1xuICBmcm9tUHJldmlldy5mb3JFYWNoKChuYW1lKSA9PiB7XG4gICAgaWYgKCFyZXNlcnZlZC5oYXMobmFtZSkgJiYgIWxvY2FsbHlEZWNsYXJlZC5oYXMobmFtZSkpIGZyb21GaWVsZE1hcC5hZGQobmFtZSk7XG4gIH0pO1xuICAvLyBFbnN1cmUgc3BlY2lhbGl6ZWQgYXJyYXkgc3ludGhldGljIGF0dHJpYnV0ZXMgYXJlIGRlc3RydWN0dXJlZFxuICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyh2YXJpYW50RHluQ29uZmlncykpIHtcbiAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2ZpZWxkS2V5XSB8fCB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgfVxuICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgYXR0ck5hbWVzID0gWy4uLmZyb21GaWVsZE1hcF07XG4gIGxldCBwcmV2aWV3SnN4T3V0ID0gcmVzdWx0LnByZXZpZXdKc3g7XG4gIGNvbnN0IGludGVyYWN0aXZlQ2FudmFzID0gZ2VuZXJhdGVJbnRlcmFjdGl2ZUNhbnZhc0NvZGUoXG4gICAgY29tcC5pZCxcbiAgICBhdHRyTmFtZXMsXG4gICAgZWRpdG9yQ29uZmlnLFxuICAgIGNvbXAud29yZHByZXNzLFxuICApO1xuICBpZiAoaW50ZXJhY3RpdmVDYW52YXMpIHtcbiAgICBwcmV2aWV3SnN4T3V0ID0gaW5qZWN0Q2FudmFzUmVmSW50b1ByZXZpZXdKc3gocHJldmlld0pzeE91dCk7XG4gIH1cbiAgY29uc3QgaGVscGVyc0Rlc3RydWN0ID0gWy4uLmhlbHBlck5hbWVzXTtcbiAgaWYgKGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSBoZWxwZXJzRGVzdHJ1Y3QucHVzaCgnSGFuZG9mZkxpbmtGaWVsZCcpO1xuICBpZiAodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSBoZWxwZXJzRGVzdHJ1Y3QucHVzaCgnQ09OVEVOVF9CTE9DS1MnKTtcblxuICBjb25zdCBhdHRyRGVzdHJ1Y3QgPSBhdHRyTmFtZXMubGVuZ3RoID8gYCAgY29uc3QgeyAke2F0dHJOYW1lcy5qb2luKCcsICcpfSB9ID0gYXR0cmlidXRlcztcXG4gIGAgOiAnJztcbiAgY29uc3QgaGVscGVyc0Rlc3RydWN0TGluZSA9XG4gICAgaGVscGVyc0Rlc3RydWN0Lmxlbmd0aCA+IDAgPyBgICBjb25zdCB7ICR7aGVscGVyc0Rlc3RydWN0LmpvaW4oJywgJyl9IH0gPSBoZWxwZXJzO1xcbiAgYCA6ICcnO1xuXG4gIGNvbnN0IHByb3BzTGlzdCA9IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkID8gJ3sgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaGVscGVycywgaXNTZWxlY3RlZCB9JyA6ICd7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGhlbHBlcnMgfSc7XG4gIGNvbnN0IHBhbmVsc0V4cG9ydCA9XG4gICAgcmVzdWx0LnBhbmVscy50cmltKCkgPT09ICcnXG4gICAgICA/IGBleHBvcnQgZnVuY3Rpb24gUGFuZWxzKCkgeyByZXR1cm4gbnVsbDsgfWBcbiAgICAgIDogYGV4cG9ydCBmdW5jdGlvbiBQYW5lbHMoJHtwcm9wc0xpc3R9KSB7XG4ke2F0dHJEZXN0cnVjdH0ke2hlbHBlcnNEZXN0cnVjdExpbmV9ICByZXR1cm4gKFxuICAgIDw+XG4ke3Jlc3VsdC5wYW5lbHN9XG4gICAgPC8+XG4gICk7XG59YDtcblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggc2hhcmVkIHNlbGVjdG9yIGNvbXBvbmVudHMgdGhpcyB2YXJpYW50J3MgcGFuZWxzIHVzZVxuICBjb25zdCB2YXJpYW50SGFzQnJlYWRjcnVtYnMgPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc0JyZWFkY3J1bWJzQ29uZmlnKGMpKTtcbiAgY29uc3QgdmFyaWFudEhhc1RheG9ub215ID0gT2JqZWN0LnZhbHVlcyh2YXJpYW50RHluQ29uZmlncykuc29tZSgoYykgPT4gaXNUYXhvbm9teUNvbmZpZyhjKSk7XG4gIGNvbnN0IHZhcmlhbnRIYXNQYWdpbmF0aW9uID0gT2JqZWN0LnZhbHVlcyh2YXJpYW50RHluQ29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKTtcbiAgY29uc3QgdmFyaWFudFNoYXJlZEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmICh2YXJpYW50SGFzQnJlYWRjcnVtYnMpIHZhcmlhbnRTaGFyZWRJbXBvcnRzLnB1c2goJ0JyZWFkY3J1bWJzU2VsZWN0b3InKTtcbiAgaWYgKHZhcmlhbnRIYXNUYXhvbm9teSkgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnVGF4b25vbXlTZWxlY3RvcicpO1xuICBpZiAodmFyaWFudEhhc1BhZ2luYXRpb24pIHZhcmlhbnRTaGFyZWRJbXBvcnRzLnB1c2goJ1BhZ2luYXRpb25TZWxlY3RvcicpO1xuICBjb25zdCBzaGFyZWRTZWxlY3RvckltcG9ydCA9IHZhcmlhbnRTaGFyZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7dmFyaWFudFNoYXJlZEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICcuLi8uLi8uLi9zaGFyZWQnO1xcbmBcbiAgICA6ICcnO1xuXG4gIC8vIE9ubHkgaW1wb3J0IFJlcGVhdGVyIHdoZW4gdGhlIHZhcmlhbnQgaGFzIG5vbi1zZXJ2ZXItcmVuZGVyZWQgYXJyYXkgZmllbGRzXG4gIC8vICh0YXhvbm9teS9icmVhZGNydW1icy9wYWdpbmF0aW9uIGFyZSBzZXJ2ZXItcmVuZGVyZWQ7IHNoYXJlZCBjb21wb25lbnRzIGltcG9ydCBSZXBlYXRlciB0aGVtc2VsdmVzKVxuICBjb25zdCB2YXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA9IE9iamVjdC5lbnRyaWVzKGNvbXAucHJvcGVydGllcykuc29tZShcbiAgICAoW2ssIHBdKSA9PiBwLnR5cGUgPT09ICdhcnJheScgJiYgKCF2YXJpYW50RHluQ29uZmlnc1trXSB8fCAhKCdhcnJheVR5cGUnIGluIHZhcmlhbnREeW5Db25maWdzW2tdKSlcbiAgKTtcbiAgY29uc3QgdGVuVXBCbG9ja0NvbXBvbmVudHNJbXBvcnQgPSAodmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgfHwgcmVzdWx0LnByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpKVxuICAgID8gYGltcG9ydCB7ICR7W3ZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzID8gJ1JlcGVhdGVyJyA6ICcnLCByZXN1bHQucHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJykgPyAnSW1hZ2UnIDogJyddLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpfSB9IGZyb20gJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnO1xcbmBcbiAgICA6ICcnO1xuXG4gIC8vIFNwZWNpYWxpemVkIGFycmF5IHJlc29sdXRpb24gaW1wb3J0cyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbiBob29rcyBydW4gaW4gdGhlIHZhcmlhdGlvbiBmaWxlKVxuICBjb25zdCBoYXNTcGVjaWFsaXplZFJlc29sdXRpb24gPSAhIShyZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uPy50cmltKCkpO1xuICBjb25zdCB2YXJIYXNCcmVhZGNydW1ic0ZldGNoID0gcmVzdWx0Lmhhc0JyZWFkY3J1bWJzRmV0Y2ggPz8gZmFsc2U7XG4gIGNvbnN0IHZhckhhc1RheG9ub215RmV0Y2ggPSByZXN1bHQuaGFzVGF4b25vbXlGZXRjaCA/PyBmYWxzZTtcblxuICBjb25zdCBlbGVtZW50SW1wb3J0TmFtZXMgPSBbJ0ZyYWdtZW50J107XG4gIGlmICh2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSBlbGVtZW50SW1wb3J0TmFtZXMucHVzaCgndXNlU3RhdGUnLCAndXNlRWZmZWN0Jyk7XG4gIGlmIChpbnRlcmFjdGl2ZUNhbnZhcykge1xuICAgIGZvciAoY29uc3QgZWwgb2YgaW50ZXJhY3RpdmVDYW52YXMuZWxlbWVudEltcG9ydHMpIHtcbiAgICAgIGlmICghZWxlbWVudEltcG9ydE5hbWVzLmluY2x1ZGVzKGVsKSkgZWxlbWVudEltcG9ydE5hbWVzLnB1c2goZWwpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbnRlcmFjdGl2ZUltcG9ydCA9XG4gICAgaW50ZXJhY3RpdmVDYW52YXM/LmltcG9ydExpbmVzID8gYCR7aW50ZXJhY3RpdmVDYW52YXMuaW1wb3J0TGluZXN9XFxuYCA6ICcnO1xuICBjb25zdCBpbnRlcmFjdGl2ZUhvb2sgPSBpbnRlcmFjdGl2ZUNhbnZhcz8uaG9va0xpbmVzXG4gICAgPyBgJHtpbnRlcmFjdGl2ZUNhbnZhcy5ob29rTGluZXN9XFxuYFxuICAgIDogJyc7XG5cbiAgbGV0IGRhdGFJbXBvcnQgPSAnJztcbiAgaWYgKHZhckhhc1RheG9ub215RmV0Y2ggfHwgdmFySGFzQnJlYWRjcnVtYnNGZXRjaCkge1xuICAgIGNvbnN0IGRhdGFOYW1lcyA9IFsndXNlU2VsZWN0J107XG4gICAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIGRhdGFOYW1lcy5wdXNoKCdzZWxlY3QnKTtcbiAgICBkYXRhSW1wb3J0ICs9IGBpbXBvcnQgeyAke2RhdGFOYW1lcy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZGF0YSc7XFxuaW1wb3J0IHsgc3RvcmUgYXMgY29yZURhdGFTdG9yZSB9IGZyb20gJ0B3b3JkcHJlc3MvY29yZS1kYXRhJztcXG5gO1xuICB9XG4gIGlmICh2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSB7XG4gICAgZGF0YUltcG9ydCArPSBgaW1wb3J0IGFwaUZldGNoIGZyb20gJ0B3b3JkcHJlc3MvYXBpLWZldGNoJztcXG5gO1xuICB9XG5cbiAgY29uc3Qgc3BlY2lhbGl6ZWRDb2RlID0gaGFzU3BlY2lhbGl6ZWRSZXNvbHV0aW9uID8gcmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbiEgOiAnJztcblxuICByZXR1cm4gYC8qKlxuICogVmFyaWF0aW9uOiAke2NvbXAudGl0bGV9ICgke2NvbXAuaWR9KVxuICogR2VuZXJhdGVkIOKAkyBkbyBub3QgZWRpdCBieSBoYW5kLlxuICovXG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnROYW1lcy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG5pbXBvcnQge1xuICBQYW5lbEJvZHksXG4gIFRleHRDb250cm9sLFxuICBUZXh0YXJlYUNvbnRyb2wsXG4gIEJ1dHRvbixcbiAgU2VsZWN0Q29udHJvbCxcbiAgUmFuZ2VDb250cm9sLFxuICBUb2dnbGVDb250cm9sLFxuICBGbGV4LFxuICBQb3BvdmVyLFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgTWVkaWFVcGxvYWQsIE1lZGlhVXBsb2FkQ2hlY2ssIE1lZGlhUmVwbGFjZUZsb3csIExpbmtDb250cm9sLCBSaWNoVGV4dCwgSW5uZXJCbG9ja3MgfSBmcm9tICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG4ke2RhdGFJbXBvcnR9JHt0ZW5VcEJsb2NrQ29tcG9uZW50c0ltcG9ydH0ke3NoYXJlZFNlbGVjdG9ySW1wb3J0fSR7aW50ZXJhY3RpdmVJbXBvcnR9XG4ke3BhbmVsc0V4cG9ydH1cblxuZXhwb3J0IGZ1bmN0aW9uIFByZXZpZXcoJHtwcm9wc0xpc3R9KSB7XG4ke2F0dHJEZXN0cnVjdH0ke2hlbHBlcnNEZXN0cnVjdExpbmV9JHtzcGVjaWFsaXplZENvZGV9JHtpbnRlcmFjdGl2ZUhvb2t9ICByZXR1cm4gKFxuJHtwcmV2aWV3SnN4T3V0fVxuICApO1xufVxuYDtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgcmVuZGVyLnBocCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqIEdlbmVyYXRlIHRoZSBQSFAgZnJhZ21lbnQgZm9yIG9uZSB2YXJpYW50IChleHRyYWN0aW9ucyArIHRlbXBsYXRlKS4gVXNlZCBpbiB2YXJpYXRpb24gaW5jbHVkZSBmaWxlLiAqL1xuY29uc3QgZ2VuZXJhdGVWYXJpYW50UGhwRnJhZ21lbnQgPSAoXG4gIHZhcmlhbnQ6IFZhcmlhbnRJbmZvLFxuICBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgcmljaHRleHRQcm9wcy5hZGQodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICByaWNodGV4dFByb3BzLmFkZCh0b0NhbWVsQ2FzZSh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ID09PSB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGNvbnRpbnVlO1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IG9yaWdDYW1lbCA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gZ2V0UGhwRGVmYXVsdFZhbHVlKHByb3BlcnR5KTtcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkJHtvcmlnQ2FtZWx9ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10pID8gJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10gOiAke2RlZmF1bHRWYWx1ZX07YCk7XG4gIH1cbiAgLy8gRHluYW1pYyBhcnJheSBleHRyYWN0aW9uIGZvciBzcGVjaWFsaXplZCBhcnJheSB0eXBlcyAoYnJlYWRjcnVtYnMsIHRheG9ub215LCBwYWdpbmF0aW9uKVxuICBjb25zdCBkeW5BcnJheUV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAodmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGROYW1lXSB8fCB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gY29tcC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkFycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBtZXJnZWRBdHRyTmFtZSwgZHluQ29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgZHluQXJyYXlDb2RlID0gZHluQXJyYXlFeHRyYWN0aW9ucy5sZW5ndGggPyAnXFxuJyArIGR5bkFycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJykgOiAnJztcblxuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChjb21wLmNvZGUgPz8gJycsIGNvbXAucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IChjb21wLmlkID8/ICcnKS5yZXBsYWNlKC9fL2csICctJyk7XG5cbiAgcmV0dXJuIGA8P3BocFxuLy8gQXR0cmlidXRlIGV4dHJhY3Rpb24gZm9yIHZhcmlhbnQ6ICR7Y29tcC5pZH1cbiR7ZXh0cmFjdGlvbnMuam9pbignXFxuJyl9JHtkeW5BcnJheUNvZGV9XG4/PlxuPGRpdiBjbGFzcz1cIiR7Y2xhc3NOYW1lfVwiPlxuJHt0ZW1wbGF0ZVBocH1cbjwvZGl2PlxuYDtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkUmVuZGVyUGhwID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuICBjb25zdCBkZWZhdWx0VmFyaWFudCA9IHZhcmlhbnRzWzBdLmNvbXBvbmVudC5pZDtcblxuICBjb25zdCBjYXNlczogc3RyaW5nW10gPSB2YXJpYW50cy5tYXAoXG4gICAgKHYpID0+IGAgIGNhc2UgJyR7di5jb21wb25lbnQuaWR9JzpcbiAgICBpbmNsdWRlIF9fRElSX18gLiAnL3ZhcmlhdGlvbnMvJHt2LmNvbXBvbmVudC5pZH0ucGhwJztcbiAgICBicmVhaztgLFxuICApO1xuXG4gIHJldHVybiBgPD9waHBcbi8qKlxuICogU2VydmVyLXNpZGUgcmVuZGVyaW5nIGZvciAke3RvVGl0bGVDYXNlKGdyb3VwU2x1Zyl9IChtZXJnZWQgZ3JvdXAgYmxvY2spXG4gKlxuICogQHBhcmFtIGFycmF5ICAgICRhdHRyaWJ1dGVzIEJsb2NrIGF0dHJpYnV0ZXMuXG4gKiBAcGFyYW0gc3RyaW5nICAgJGNvbnRlbnQgICAgQmxvY2sgZGVmYXVsdCBjb250ZW50LlxuICogQHBhcmFtIFdQX0Jsb2NrICRibG9jayAgICAgIEJsb2NrIGluc3RhbmNlLlxuICogQHJldHVybiBzdHJpbmcgUmV0dXJucyB0aGUgYmxvY2sgbWFya3VwLlxuICovXG5cbmlmICghZGVmaW5lZCgnQUJTUEFUSCcpKSB7XG4gIGV4aXQ7XG59XG5cbmlmICghaXNzZXQoJGF0dHJpYnV0ZXMpKSB7XG4gICRhdHRyaWJ1dGVzID0gW107XG59XG5cbiR2YXJpYW50ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJ2hhbmRvZmZWYXJpYW50J10pID8gJGF0dHJpYnV0ZXNbJ2hhbmRvZmZWYXJpYW50J10gOiAnJHtkZWZhdWx0VmFyaWFudH0nO1xuPz5cbjxkaXYgPD9waHAgZWNobyBnZXRfYmxvY2tfd3JhcHBlcl9hdHRyaWJ1dGVzKFsnY2xhc3MnID0+ICcke2Jsb2NrTmFtZX0nXSk7ID8+PlxuPD9waHBcbnN3aXRjaCAoJHZhcmlhbnQpIHtcbiR7Y2FzZXMuam9pbignXFxuJyl9XG5cbiAgZGVmYXVsdDpcbiAgICBlY2hvICc8IS0tIFVua25vd24gdmFyaWFudDogJyAuIGVzY19odG1sKCR2YXJpYW50KSAuICcgLS0+JztcbiAgICBicmVhaztcbn1cbj8+XG48L2Rpdj5cbmA7XG59O1xuXG4vLyBnZXRQaHBEZWZhdWx0VmFsdWUgaXMgaW1wb3J0ZWQgZnJvbSByZW5kZXItcGhwLnRzXG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgU0NTUyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRFZGl0b3JTY3NzID0gKFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgZWRpdG9yQ29uZmlnPzogSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHByZWZpeCA9XG4gICAgZWRpdG9yQ29uZmlnPy5jYW52YXNTaGltICE9PSBmYWxzZSAmJlxuICAgIHZhcmlhbnRzLnNvbWUoKHYpID0+IHRlbXBsYXRlVXNlc0NhbnZhc1NoaW0odi5jb21wb25lbnQuY29kZSwgZWRpdG9yQ29uZmlnKSlcbiAgICAgID8gQ0FOVkFTX1NISU1fU0NTU19JTVBPUlRcbiAgICAgIDogJyc7XG4gIHJldHVybiAoXG4gICAgcHJlZml4ICtcbiAgICB2YXJpYW50c1xuICAgICAgLm1hcCgodikgPT5cbiAgICAgICAgZ2VuZXJhdGVFZGl0b3JTY3NzKHYuY29tcG9uZW50LCB7IHNraXBDYW52YXNTaGltSW1wb3J0OiB0cnVlLCBlZGl0b3JDb25maWcgfSksXG4gICAgICApXG4gICAgICAuam9pbignXFxuXFxuJylcbiAgKTtcbn07XG5cbmNvbnN0IG1lcmdlZEdyb3VwQmxvY2tTZWxlY3RvciA9IChncm91cFNsdWc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHNsdWcgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIHJldHVybiBgLndwLWJsb2NrLWhhbmRvZmYtJHtzbHVnfWA7XG59O1xuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZFN0eWxlU2NzcyA9ICh2YXJpYW50czogVmFyaWFudEluZm9bXSwgZ3JvdXBTbHVnOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBtZXJnZWRTZWxlY3RvciA9IG1lcmdlZEdyb3VwQmxvY2tTZWxlY3Rvcihncm91cFNsdWcpO1xuICByZXR1cm4gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCB2YXJpYW50U2VsZWN0b3IgPSBgLndwLWJsb2NrLWhhbmRvZmYtJHt2LmNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyl9YDtcbiAgICAgIHJldHVybiBnZW5lcmF0ZVN0eWxlU2Nzcyh2LmNvbXBvbmVudCkuc3BsaXQodmFyaWFudFNlbGVjdG9yKS5qb2luKG1lcmdlZFNlbGVjdG9yKTtcbiAgICB9KVxuICAgIC5qb2luKCdcXG5cXG4nKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgTWlncmF0aW9uIFNjaGVtYSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRNaWdyYXRpb25TY2hlbWEgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIGNvbnN0IHZhcmlhbnRTY2hlbWFzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBNaWdyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGNvbXAucHJvcGVydGllcykpIHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgICBwcm9wZXJ0aWVzW2tleV0gPSBleHRyYWN0TWlncmF0aW9uUHJvcGVydHkocHJvcCwgdHJ1ZSwga2V5KTtcbiAgICB9XG4gICAgdmFyaWFudFNjaGVtYXNbY29tcC5pZF0gPSB7XG4gICAgICB0aXRsZTogY29tcC50aXRsZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAoY29tcC5kZXNjcmlwdGlvbiB8fCAnJykucmVwbGFjZSgvXFxuXFxzKy9nLCAnICcpLnRyaW0oKSxcbiAgICAgIHByb3BlcnRpZXMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNjaGVtYSA9IHtcbiAgICBibG9ja05hbWU6IGBoYW5kb2ZmLyR7YmxvY2tOYW1lfWAsXG4gICAgdGl0bGU6IGdyb3VwVGl0bGUsXG4gICAgZGVzY3JpcHRpb246IGAke2dyb3VwVGl0bGV9IGJsb2NrIHdpdGggJHt2YXJpYW50cy5sZW5ndGh9IHZhcmlhdGlvbnMuYCxcbiAgICBjYXRlZ29yeTogZ3JvdXBUb0NhdGVnb3J5KGdyb3VwU2x1ZyksXG4gICAgaXNNZXJnZWRHcm91cDogdHJ1ZSxcbiAgICB2YXJpYW50czogdmFyaWFudFNjaGVtYXMsXG4gIH07XG5cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHNjaGVtYSwgbnVsbCwgMik7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIFJFQURNRSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRSZWFkbWUgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgdmFyaWFudExpc3QgPSB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IGAtICoqJHt2LmNvbXBvbmVudC50aXRsZX0qKiAoXFxgJHt2LmNvbXBvbmVudC5pZH1cXGApYClcbiAgICAuam9pbignXFxuJyk7XG5cbiAgcmV0dXJuIGAjICR7Z3JvdXBUaXRsZX0gKE1lcmdlZCBHcm91cCBCbG9jaylcblxuVGhpcyBibG9jayBjb21iaW5lcyAke3ZhcmlhbnRzLmxlbmd0aH0gY29tcG9uZW50IHZhcmlhdGlvbnMgaW50byBhIHNpbmdsZSBXb3JkUHJlc3MgYmxvY2suXG5cbiMjIFZhcmlhdGlvbnNcblxuJHt2YXJpYW50TGlzdH1cblxuIyMgVXNhZ2VcblxuU2VsZWN0IHRoZSBkZXNpcmVkIHZhcmlhdGlvbiBmcm9tIHRoZSBibG9jayB0b29sYmFyIChWYXJpYXRpb24gZHJvcGRvd24pLlxuRWFjaCB2YXJpYXRpb24gaGFzIGl0cyBvd24gc2V0IG9mIGNvbnRyb2xzIGFuZCByZW5kZXJzIGl0cyBvd24gdGVtcGxhdGUuXG5gO1xufTtcblxuLy8g4pSA4pSA4pSAIE1haW4gR2VuZXJhdG9yIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIEdlbmVyYXRlIGEgbWVyZ2VkIGJsb2NrIGZvciBhIGdyb3VwIG9mIGNvbXBvbmVudHMuXG4gKiBWYXJpYXRpb24gbWFya3VwIGlzIHNwbGl0IGludG8gaW5jbHVkZSBmaWxlczogdmFyaWF0aW9ucy88dmFyaWFudC1pZD4uanMgYW5kIHZhcmlhdGlvbnMvPHZhcmlhbnQtaWQ+LnBocC5cbiAqL1xuZXhwb3J0IGNvbnN0IGdlbmVyYXRlTWVyZ2VkQmxvY2sgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBjb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10sXG4gIHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSxcbiAgYXBpVXJsPzogc3RyaW5nLFxuICB2YXJpYW50U2NyZWVuc2hvdHM/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPixcbiAgZWRpdG9yQ29uZmlnPzogSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgZ3JvdXBUaXRsZSA9IHRvVGl0bGVDYXNlKGdyb3VwU2x1Zyk7XG4gIGNvbnN0IHNjcmVlbnNob3RzID0gdmFyaWFudFNjcmVlbnNob3RzIHx8IHt9O1xuXG4gIGNvbnN0IHN1cGVyc2V0UmVzdWx0ID0gYnVpbGRTdXBlcnNldEF0dHJpYnV0ZXModmFyaWFudEluZm9zLCBncm91cFNsdWcpO1xuICBjb25zdCB7IGF0dHJpYnV0ZXM6IHN1cGVyc2V0QXR0cnMsIGZpZWxkTWFwcyB9ID0gc3VwZXJzZXRSZXN1bHQ7XG5cbiAgY29uc3QgeyBpbmRleEpzLCB2YXJpYXRpb25KcyB9ID0gZ2VuZXJhdGVNZXJnZWRJbmRleEpzKFxuICAgIGdyb3VwU2x1ZyxcbiAgICBncm91cFRpdGxlLFxuICAgIHZhcmlhbnRJbmZvcyxcbiAgICBzdXBlcnNldEF0dHJzLFxuICAgIGZpZWxkTWFwcyxcbiAgICBhcGlVcmwsXG4gICAgc2NyZWVuc2hvdHMsXG4gICAgZWRpdG9yQ29uZmlnLFxuICApO1xuXG4gIGNvbnN0IHZhcmlhdGlvblBocDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudEluZm9zKSB7XG4gICAgdmFyaWF0aW9uUGhwW3ZhcmlhbnQuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudFBocEZyYWdtZW50KHZhcmlhbnQsIGZpZWxkTWFwcyk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50IHNjcmVlbnNob3QgVVJMcyBmb3IgdGhlIGNhbGxlciB0byBkb3dubG9hZFxuICBjb25zdCB2YXJpYW50U2NyZWVuc2hvdFVybHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBvbmVudHMpIHtcbiAgICBpZiAoIWNvbXAuaW1hZ2UpIGNvbnRpbnVlO1xuICAgIGlmIChjb21wLmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCBjb21wLmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHZhcmlhbnRTY3JlZW5zaG90VXJsc1tjb21wLmlkXSA9IGNvbXAuaW1hZ2U7XG4gICAgfSBlbHNlIGlmIChhcGlVcmwpIHtcbiAgICAgIHZhcmlhbnRTY3JlZW5zaG90VXJsc1tjb21wLmlkXSA9IGAke2FwaVVybH0ke2NvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wLmltYWdlfWA7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlTWVyZ2VkQmxvY2tKc29uKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zLCBzdXBlcnNldEF0dHJzLCBzY3JlZW5zaG90cyksXG4gICAgaW5kZXhKcyxcbiAgICByZW5kZXJQaHA6IGdlbmVyYXRlTWVyZ2VkUmVuZGVyUGhwKGdyb3VwU2x1ZywgdmFyaWFudEluZm9zLCBmaWVsZE1hcHMpLFxuICAgIGVkaXRvclNjc3M6IGdlbmVyYXRlTWVyZ2VkRWRpdG9yU2Nzcyh2YXJpYW50SW5mb3MsIGVkaXRvckNvbmZpZyksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZU1lcmdlZFN0eWxlU2Nzcyh2YXJpYW50SW5mb3MsIGdyb3VwU2x1ZyksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZU1lcmdlZFJlYWRtZShncm91cFNsdWcsIGdyb3VwVGl0bGUsIHZhcmlhbnRJbmZvcyksXG4gICAgbWlncmF0aW9uU2NoZW1hOiBnZW5lcmF0ZU1lcmdlZE1pZ3JhdGlvblNjaGVtYShncm91cFNsdWcsIGdyb3VwVGl0bGUsIHZhcmlhbnRJbmZvcyksXG4gICAgdmFyaWFudFNjcmVlbnNob3RVcmxzLFxuICAgIHZhcmlhdGlvbkZpbGVzOiB7XG4gICAgICBqczogdmFyaWF0aW9uSnMsXG4gICAgICBwaHA6IHZhcmlhdGlvblBocCxcbiAgICB9LFxuICB9O1xufTtcblxuZXhwb3J0IHR5cGUgeyBWYXJpYW50SW5mbyB9O1xuIl19