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
const generateMergedStyleScss = (variants) => {
    return variants
        .map((v) => (0, styles_1.generateStyleScss)(v.component))
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
        styleScss: generateMergedStyleScss(variantInfos),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9ncm91cC1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsb0NBZWtCO0FBQ2xCLDJEQUF3RjtBQUN4RixxREFBZ0c7QUFDaEcsNkNBQTZFO0FBQzdFLDZDQUEwUDtBQUMxUCxxQ0FBaUU7QUFDakUsK0NBR3VCO0FBRXZCLDZEQUc4QjtBQUM5QiwrQ0FBNEg7QUFDNUgseUNBTW9CO0FBaUNwQixpRkFBaUY7QUFFakY7O0dBRUc7QUFDSCxNQUFNLGtCQUFrQixHQUFHLENBQUMsQ0FBcUIsRUFBRSxDQUFxQixFQUFXLEVBQUU7SUFDbkYsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMzQixPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQztBQUMzQixDQUFDLENBQUM7QUFFRjs7OztHQUlHO0FBQ0gsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFNBQWlCLEVBQVUsRUFBRTtJQUNyRCxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUM7U0FDeEIsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUMxRCxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3hCLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hELENBQUMsQ0FBQztBQUVGLGdHQUFnRztBQUNoRyxNQUFNLGlCQUFpQixHQUFHLENBQUMsU0FBaUIsRUFBVSxFQUFFO0lBQ3RELE1BQU0sS0FBSyxHQUFHLGdCQUFn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Q0FBQyxFQUFFLENBQUM7WUFDMUUscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDOUMsQ0FBQzthQUFNLElBQUksTUFBTSxFQUFFLENBQUM7WUFDbEIscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDcEcsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPO1FBQ0wsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxXQUFXLENBQUM7UUFDbkcsT0FBTztRQUNQLFNBQVMsRUFBRSx1QkFBdUIsQ0FBQyxTQUFTLEVBQUUsWUFBWSxFQUFFLFNBQVMsQ0FBQztRQUN0RSxVQUFVLEVBQUUsd0JBQXdCLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQztRQUNoRSxTQUFTLEVBQUUsdUJBQXVCLENBQUMsWUFBWSxDQUFDO1FBQ2hELE1BQU0sRUFBRSxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQztRQUNqRSxlQUFlLEVBQUUsNkJBQTZCLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUM7UUFDbkYscUJBQXFCO1FBQ3JCLGNBQWMsRUFBRTtZQUNkLEVBQUUsRUFBRSxXQUFXO1lBQ2YsR0FBRyxFQUFFLFlBQVk7U0FDbEI7S0FDRixDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBdkRXLFFBQUEsbUJBQW1CLHVCQXVEOUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1lcmdlZCBHcm91cCBCbG9jayBHZW5lcmF0b3JcbiAqXG4gKiBDb21iaW5lcyBhbGwgSGFuZG9mZiBjb21wb25lbnRzIGluIHRoZSBzYW1lIGdyb3VwIGludG8gYSBzaW5nbGUgV29yZFByZXNzXG4gKiBibG9jayB3aXRoIHZhcmlhdGlvbnMuIFVzZXMgYSBzdXBlcnNldCBhdHRyaWJ1dGUgc2NoZW1hLCB2YXJpYW50LWNvbmRpdGlvbmFsXG4gKiBzaWRlYmFyIGNvbnRyb2xzLCB2YXJpYW50LXNwZWNpZmljIHByZXZpZXcgcmVuZGVyaW5nLCBhbmQgYSByZW5kZXIucGhwXG4gKiBkaXNwYXRjaGVyLlxuICovXG5cbmltcG9ydCB7XG4gIEhhbmRvZmZDb21wb25lbnQsXG4gIEhhbmRvZmZQcm9wZXJ0eSxcbiAgR3V0ZW5iZXJnQXR0cmlidXRlLFxuICBEeW5hbWljQXJyYXlDb25maWcsXG4gIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsXG4gIFRheG9ub215QXJyYXlDb25maWcsXG4gIFBhZ2luYXRpb25BcnJheUNvbmZpZyxcbiAgR2VuZXJhdGVkQmxvY2ssXG4gIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnLFxuICBCbG9ja0pzb25PdXRwdXQsXG4gIEhhbmRvZmZNZXRhZGF0YSxcbiAgaXNCcmVhZGNydW1ic0NvbmZpZyxcbiAgaXNUYXhvbm9teUNvbmZpZyxcbiAgaXNQYWdpbmF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSwgZ2VuZXJhdGVKc3hQcmV2aWV3LCBKc3hQcmV2aWV3UmVzdWx0IH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCB0eXBlIE5vcm1hbGl6ZWRTZWxlY3RPcHRpb24gfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4L3V0aWxzJztcbmltcG9ydCB7IG1hcFByb3BlcnR5VHlwZSwgZ3JvdXBUb0NhdGVnb3J5LCB0b0Jsb2NrTmFtZSB9IGZyb20gJy4vYmxvY2stanNvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZVJlbmRlclBocCwgaGFuZGxlYmFyc1RvUGhwLCBhcnJheVRvUGhwLCBnZXRQaHBEZWZhdWx0VmFsdWUsIGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbiwgZ2VuZXJhdGVCcmVhZGNydW1ic0FycmF5RXh0cmFjdGlvbiwgZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbiwgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uLCBidWlsZFJlc2hhcGVKcyB9IGZyb20gJy4vcmVuZGVyLXBocCc7XG5pbXBvcnQgeyBnZW5lcmF0ZUVkaXRvclNjc3MsIGdlbmVyYXRlU3R5bGVTY3NzIH0gZnJvbSAnLi9zdHlsZXMnO1xuaW1wb3J0IHtcbiAgQ0FOVkFTX1NISU1fU0NTU19JTVBPUlQsXG4gIHRlbXBsYXRlVXNlc0NhbnZhc1NoaW0sXG59IGZyb20gJy4vY2FudmFzLXNoaW0nO1xuaW1wb3J0IHR5cGUgeyBIYW5kb2ZmRWRpdG9yQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVJbnRlcmFjdGl2ZUNhbnZhc0NvZGUsXG4gIGluamVjdENhbnZhc1JlZkludG9QcmV2aWV3SnN4LFxufSBmcm9tICcuL2ludGVyYWN0aXZlLWNhbnZhcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU1pZ3JhdGlvblNjaGVtYSwgTWlncmF0aW9uU2NoZW1hLCBNaWdyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgZXh0cmFjdE1pZ3JhdGlvblByb3BlcnR5IH0gZnJvbSAnLi9zY2hlbWEtanNvbic7XG5pbXBvcnQge1xuICB0b1RpdGxlQ2FzZSxcbiAgZ2VuZXJhdGVGaWVsZENvbnRyb2wsXG4gIGdlbmVyYXRlQXJyYXlDb250cm9sLFxuICBnZW5lcmF0ZVN2Z0ljb24sXG4gIGhhc09wYWNpdHlSYW5nZUZpZWxkLFxufSBmcm9tICcuL2luZGV4LWpzJztcbmltcG9ydCB0eXBlIHsgRmllbGRDb250ZXh0IH0gZnJvbSAnLi9pbmRleC1qcyc7XG5cbi8vIOKUgOKUgOKUgCBUeXBlcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqIFBlci12YXJpYW50IG1hcHBpbmcgZnJvbSBvcmlnaW5hbCBmaWVsZCBuYW1lIHRvIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAqL1xuZXhwb3J0IHR5cGUgRmllbGRNYXAgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXG50eXBlIEFueUR5bmFtaWNBcnJheUNvbmZpZyA9IER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnO1xuXG5pbnRlcmZhY2UgVmFyaWFudEluZm8ge1xuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQ7XG4gIGZpZWxkTWFwOiBGaWVsZE1hcDtcbiAgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgZHluYW1pY0FycmF5Q29uZmlnczogUmVjb3JkPHN0cmluZywgQW55RHluYW1pY0FycmF5Q29uZmlnPjtcbn1cblxuaW50ZXJmYWNlIE1lcmdlZEZpZWxkIHtcbiAgLyoqIFRoZSBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKGNhbWVsQ2FzZSkgKi9cbiAgYXR0ck5hbWU6IHN0cmluZztcbiAgLyoqIFRoZSBHdXRlbmJlcmcgYXR0cmlidXRlIGRlZmluaXRpb24gKi9cbiAgYXR0cmlidXRlOiBHdXRlbmJlcmdBdHRyaWJ1dGU7XG4gIC8qKiBXaGljaCB2YXJpYW50cyB1c2UgdGhpcyBmaWVsZCAqL1xuICB2YXJpYW50czogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBTdXBlcnNldFJlc3VsdCB7XG4gIC8qKiBBbGwgbWVyZ2VkIGF0dHJpYnV0ZXMga2V5ZWQgYnkgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lICovXG4gIGF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT47XG4gIC8qKiBQZXItdmFyaWFudCBmaWVsZCBtYXA6IG9yaWdpbmFsIGtleSDihpIgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lICovXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+O1xufVxuXG4vLyDilIDilIDilIAgU3VwZXJzZXQgQXR0cmlidXRlIE1lcmdlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIFR5cGVzIGFyZSBjb21wYXRpYmxlIGlmIHRoZXkgaGF2ZSB0aGUgc2FtZSBHdXRlbmJlcmcgYXR0cmlidXRlIGB0eXBlYC5cbiAqL1xuY29uc3QgdHlwZXNBcmVDb21wYXRpYmxlID0gKGE6IEd1dGVuYmVyZ0F0dHJpYnV0ZSwgYjogR3V0ZW5iZXJnQXR0cmlidXRlKTogYm9vbGVhbiA9PiB7XG4gIGlmICghYSB8fCAhYikgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gYS50eXBlID09PSBiLnR5cGU7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgYSB2YXJpYW50IElEIChlLmcuIFwiaGVyby1iYXNpY1wiLCBcImhlcm9fc2VhcmNoXCIpIGludG8gYSB2YWxpZCBjYW1lbENhc2VcbiAqIGlkZW50aWZpZXIgZm9yIHVzZSBpbiBwcmVmaXhlZCBhdHRyaWJ1dGUgbmFtZXMuIEVuc3VyZXMgZ2VuZXJhdGVkIEpTIGNhbiBkZXN0cnVjdHVyZVxuICogYXR0cmlidXRlcyB3aXRob3V0IHF1b3RpbmcgKG5vIGh5cGhlbnMgaW4gbmFtZXMpLlxuICovXG5jb25zdCB2YXJpYW50SWRUb0NhbWVsID0gKHZhcmlhbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcyA9ICh2YXJpYW50SWQgPz8gJycpXG4gICAgLnJlcGxhY2UoL1stX10oW2Etel0pL2csIChfLCBsOiBzdHJpbmcpID0+IGwudG9VcHBlckNhc2UoKSlcbiAgICAucmVwbGFjZSgvWy1fXS9nLCAnJyk7XG4gIHJldHVybiBzLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgcy5zbGljZSgxKTtcbn07XG5cbi8qKiBWYXJpYW50IElEIHRvIFBhc2NhbENhc2UgZm9yIEpTIGltcG9ydC9jb21wb25lbnQgbmFtZSAoZS5nLiBoZXJvLWFydGljbGUgLT4gSGVyb0FydGljbGUpLiAqL1xuY29uc3QgdmFyaWFudElkVG9QYXNjYWwgPSAodmFyaWFudElkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjYW1lbCA9IHZhcmlhbnRJZFRvQ2FtZWwodmFyaWFudElkKTtcbiAgcmV0dXJuIGNhbWVsLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgY2FtZWwuc2xpY2UoMSk7XG59O1xuXG4vKipcbiAqIE1lcmdlIGF0dHJpYnV0ZXMgZnJvbSBOIGNvbXBvbmVudHMgaW50byBhIHN1cGVyc2V0IHNjaGVtYS5cbiAqXG4gKiAxLiBTaGFyZWQgZmllbGRzIChzYW1lIG5hbWUsIGNvbXBhdGlibGUgdHlwZSk6IGtlcHQgYXMtaXMuXG4gKiAyLiBDb25mbGljdGluZyBmaWVsZHMgKHNhbWUgbmFtZSwgZGlmZmVyZW50IHR5cGUpOiBwcmVmaXhlZCB3aXRoIHZhcmlhbnQgc2x1Zy5cbiAqIDMuIFVuaXF1ZSBmaWVsZHM6IGtlcHQgYXMtaXMuXG4gKi9cbmV4cG9ydCBjb25zdCBidWlsZFN1cGVyc2V0QXR0cmlidXRlcyA9IChcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuKTogU3VwZXJzZXRSZXN1bHQgPT4ge1xuICBjb25zdCBhdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+ID0ge307XG4gIGNvbnN0IGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+ID0ge307XG5cbiAgLy8gRmlyc3QgcGFzczogY29sbGVjdCBhbGwgZmllbGRzIHBlciBvcmlnaW5hbCBrZXkgYWNyb3NzIHZhcmlhbnRzXG4gIGNvbnN0IGZpZWxkc0J5S2V5OiBSZWNvcmQ8XG4gICAgc3RyaW5nLFxuICAgIEFycmF5PHsgdmFyaWFudElkOiBzdHJpbmc7IGF0dHJOYW1lOiBzdHJpbmc7IGF0dHI6IEd1dGVuYmVyZ0F0dHJpYnV0ZSB9PlxuICA+ID0ge307XG5cbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcG9uZW50ID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgZmllbGRNYXBzW2NvbXBvbmVudC5pZF0gPSB7fTtcbiAgICBjb25zdCBwcmV2aWV3VmFsdWVzID0gY29tcG9uZW50LnByZXZpZXdzPy5nZW5lcmljPy52YWx1ZXMgfHwge307XG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgb3JpZ0F0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGxldCBtYXBwZWQgPSBtYXBQcm9wZXJ0eVR5cGUocHJvcGVydHksIHByZXZpZXdWYWx1ZXNba2V5XSk7XG5cbiAgICAgIC8vIE5vbi1pbm5lckJsb2Nrc0ZpZWxkIHJpY2h0ZXh0IGJlY29tZXMgYSBzdHJpbmcgYXR0cmlidXRlXG4gICAgICBpZiAobWFwcGVkID09PSBudWxsICYmIHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ICE9PSB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIHtcbiAgICAgICAgbWFwcGVkID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogcHJldmlld1ZhbHVlc1trZXldID8/ICcnIH07XG4gICAgICB9XG4gICAgICBpZiAobWFwcGVkID09PSBudWxsKSBjb250aW51ZTtcblxuICAgICAgaWYgKCFmaWVsZHNCeUtleVtrZXldKSBmaWVsZHNCeUtleVtrZXldID0gW107XG4gICAgICBmaWVsZHNCeUtleVtrZXldLnB1c2goeyB2YXJpYW50SWQ6IGNvbXBvbmVudC5pZCwgYXR0ck5hbWU6IG9yaWdBdHRyTmFtZSwgYXR0cjogbWFwcGVkIH0pO1xuICAgIH1cblxuICAgIC8vIEFsc28gY29sbGVjdCBkeW5hbWljIGFycmF5IGNvbnRyb2wgYXR0cmlidXRlc1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyh2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBkeW5GaWVsZHM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4gPSB7fTtcblxuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RW5hYmxlZGBdID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1FbmFibGVkYF0gPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogZmFsc2UgfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVRheG9ub215YF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBkeW5Db25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1Tb3VyY2VgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdhdXRvJyB9O1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RW5hYmxlZGBdID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgIGNvbnN0IHNvdXJjZURlZmF1bHQgPSBkeW5Db25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1Tb3VyY2VgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IHNvdXJjZURlZmF1bHQsIGVudW06IFsncXVlcnknLCAnc2VsZWN0JywgJ21hbnVhbCddIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1Qb3N0VHlwZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogZHluQ29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBkeW5Db25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0JyB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2BdID0geyB0eXBlOiAnYXJyYXknLCBkZWZhdWx0OiBbXSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9UXVlcnlBcmdzYF0gPSB7IHR5cGU6ICdvYmplY3QnLCBkZWZhdWx0OiB7IHBvc3RfdHlwZTogZHluQ29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBkeW5Db25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0JywgcG9zdHNfcGVyX3BhZ2U6IGR5bkNvbmZpZy5tYXhJdGVtcyB8fCA2LCBvcmRlcmJ5OiAnZGF0ZScsIG9yZGVyOiAnREVTQycsIHRheF9xdWVyeTogW10sIC4uLihkeW5Db25maWcuZGVmYXVsdFF1ZXJ5QXJncyB8fCB7fSkgfSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYF0gPSB7IHR5cGU6ICdvYmplY3QnLCBkZWZhdWx0OiBkeW5Db25maWcuZmllbGRNYXBwaW5nIHx8IHt9IH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYF0gPSB7IHR5cGU6ICdvYmplY3QnLCBkZWZhdWx0OiB7fSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogZHluQ29uZmlnLnJlbmRlck1vZGUgfHwgJ21hcHBlZCcgfTtcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBbZGFLZXksIGRhQXR0cl0gb2YgT2JqZWN0LmVudHJpZXMoZHluRmllbGRzKSkge1xuICAgICAgICBpZiAoIWZpZWxkc0J5S2V5W2BfX2R5bl8ke2RhS2V5fWBdKSBmaWVsZHNCeUtleVtgX19keW5fJHtkYUtleX1gXSA9IFtdO1xuICAgICAgICBmaWVsZHNCeUtleVtgX19keW5fJHtkYUtleX1gXS5wdXNoKHsgdmFyaWFudElkOiBjb21wb25lbnQuaWQsIGF0dHJOYW1lOiBkYUtleSwgYXR0cjogZGFBdHRyIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFNlY29uZCBwYXNzOiByZXNvbHZlIGNvbmZsaWN0c1xuICBmb3IgKGNvbnN0IFtrZXksIGVudHJpZXNdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkc0J5S2V5KSkge1xuICAgIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICAvLyBDaGVjayBpZiBhbGwgZW50cmllcyBoYXZlIGNvbXBhdGlibGUgdHlwZXNcbiAgICBjb25zdCBmaXJzdCA9IGVudHJpZXNbMF07XG4gICAgY29uc3QgYWxsQ29tcGF0aWJsZSA9IGVudHJpZXMuZXZlcnkoKGUpID0+IHR5cGVzQXJlQ29tcGF0aWJsZShmaXJzdC5hdHRyLCBlLmF0dHIpKTtcblxuICAgIGlmIChhbGxDb21wYXRpYmxlKSB7XG4gICAgICAvLyBTaGFyZWQgb3IgdW5pcXVlIGZpZWxkIOKAlCB1c2Ugb3JpZ2luYWwgbmFtZVxuICAgICAgY29uc3QgbWVyZ2VkTmFtZSA9IGZpcnN0LmF0dHJOYW1lO1xuICAgICAgLy8gVXNlIHRoZSBmaXJzdCB2YXJpYW50J3MgYXR0cmlidXRlIGRlZmluaXRpb24gKGRlZmF1bHRzIG1heSBkaWZmZXIsIHRha2UgZmlyc3QpXG4gICAgICBhdHRyaWJ1dGVzW21lcmdlZE5hbWVdID0gZmlyc3QuYXR0cjtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoIWtleS5zdGFydHNXaXRoKCdfX2R5bl8nKSkge1xuICAgICAgICAgIGZpZWxkTWFwc1tlbnRyeS52YXJpYW50SWRdW2tleV0gPSBtZXJnZWROYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENvbmZsaWN0aW5nIOKAlCBwcmVmaXggd2l0aCB2YXJpYW50IHNsdWcgKG11c3QgYmUgdmFsaWQgSlMgaWRlbnRpZmllciBmb3IgZGVzdHJ1Y3R1cmluZylcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBjb25zdCB2YXJpYW50Q2FtZWwgPSB2YXJpYW50SWRUb0NhbWVsKGVudHJ5LnZhcmlhbnRJZCk7XG4gICAgICAgIGNvbnN0IHByZWZpeGVkID0gdmFyaWFudENhbWVsICsgZW50cnkuYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBlbnRyeS5hdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgYXR0cmlidXRlc1twcmVmaXhlZF0gPSBlbnRyeS5hdHRyO1xuICAgICAgICBpZiAoIWtleS5zdGFydHNXaXRoKCdfX2R5bl8nKSkge1xuICAgICAgICAgIGZpZWxkTWFwc1tlbnRyeS52YXJpYW50SWRdW2tleV0gPSBwcmVmaXhlZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEFsd2F5cyBhZGQgYWxpZ25cbiAgYXR0cmlidXRlcy5hbGlnbiA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdmdWxsJyB9O1xuXG4gIHJldHVybiB7IGF0dHJpYnV0ZXMsIGZpZWxkTWFwcyB9O1xufTtcblxuLy8g4pSA4pSA4pSAIEJsb2NrIEljb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGNob29zZUdyb3VwSWNvbiA9IChncm91cFNsdWc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHNsdWcgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKTtcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2hlcm8nKSkgcmV0dXJuICdmb3JtYXQtaW1hZ2UnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnY2FyZCcpKSByZXR1cm4gJ2luZGV4LWNhcmQnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnZm9ybScpKSByZXR1cm4gJ2ZlZWRiYWNrJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ25hdicpKSByZXR1cm4gJ21lbnUnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnZm9vdGVyJykpIHJldHVybiAndGFibGUtcm93LWFmdGVyJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2hlYWRlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1iZWZvcmUnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnY3RhJykpIHJldHVybiAnbWVnYXBob25lJztcbiAgcmV0dXJuICdhZG1pbi1jdXN0b21pemVyJztcbn07XG5cbmNvbnN0IGNob29zZVZhcmlhbnRJY29uID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGdyb3VwID0gY29tcG9uZW50Lmdyb3VwPy50b0xvd2VyQ2FzZSgpIHx8ICcnO1xuICBjb25zdCBpZCA9IGNvbXBvbmVudC5pZC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2hlcm8nKSB8fCBpZC5pbmNsdWRlcygnaGVybycpKSByZXR1cm4gJ2Zvcm1hdC1pbWFnZSc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnY2FyZCcpIHx8IGlkLmluY2x1ZGVzKCdjYXJkJykpIHJldHVybiAnaW5kZXgtY2FyZCc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnZm9ybScpIHx8IGlkLmluY2x1ZGVzKCdmb3JtJykpIHJldHVybiAnZmVlZGJhY2snO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ25hdicpIHx8IGlkLmluY2x1ZGVzKCduYXYnKSkgcmV0dXJuICdtZW51JztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdmb290ZXInKSB8fCBpZC5pbmNsdWRlcygnZm9vdGVyJykpIHJldHVybiAndGFibGUtcm93LWFmdGVyJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdoZWFkZXInKSB8fCBpZC5pbmNsdWRlcygnaGVhZGVyJykpIHJldHVybiAndGFibGUtcm93LWJlZm9yZSc7XG4gIHJldHVybiAnYWRtaW4tY3VzdG9taXplcic7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFuIFNWRyBpY29uIGNvZGUgYmxvY2sgZm9yIHRoZSBncm91cCBibG9jaydzIGluZGV4LmpzLlxuICovXG5jb25zdCBnZW5lcmF0ZUdyb3VwU3ZnSWNvbkNvZGUgPSAoZ3JvdXBUaXRsZTogc3RyaW5nLCBncm91cFNsdWc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBnZW5lcmF0ZVN2Z0ljb24oZ3JvdXBUaXRsZSwgZ3JvdXBTbHVnKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgYmxvY2suanNvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRCbG9ja0pzb24gPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBzdXBlcnNldEF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+LFxuICB2YXJpYW50U2NyZWVuc2hvdHM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYW55SGFzU2NyZWVuc2hvdCA9IE9iamVjdC52YWx1ZXModmFyaWFudFNjcmVlbnNob3RzKS5zb21lKEJvb2xlYW4pO1xuXG4gIC8vIEFkZCBoYW5kb2ZmVmFyaWFudCBkaXNjcmltaW5hdG9yXG4gIGNvbnN0IGFsbEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4gPSB7XG4gICAgaGFuZG9mZlZhcmlhbnQ6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgZGVmYXVsdDogdmFyaWFudHNbMF0uY29tcG9uZW50LmlkLFxuICAgIH0sXG4gICAgLi4uc3VwZXJzZXRBdHRycyxcbiAgfTtcblxuICBpZiAoYW55SGFzU2NyZWVuc2hvdCkge1xuICAgIGFsbEF0dHJpYnV0ZXMuX19wcmV2aWV3ID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlIH07XG4gIH1cblxuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG5cbiAgY29uc3QgdmFyaWF0aW9ucyA9IHZhcmlhbnRzLm1hcCgodikgPT4ge1xuICAgIGNvbnN0IGNvbXAgPSB2LmNvbXBvbmVudDtcbiAgICBjb25zdCB2YXJpYW50RGVmYXVsdHM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7IGhhbmRvZmZWYXJpYW50OiBjb21wLmlkIH07XG4gICAgY29uc3QgdmFyaWF0aW9uOiBhbnkgPSB7XG4gICAgICBuYW1lOiBjb21wLmlkLFxuICAgICAgdGl0bGU6IGNvbXAudGl0bGUsXG4gICAgICBkZXNjcmlwdGlvbjogKGNvbXAuZGVzY3JpcHRpb24gfHwgJycpLnJlcGxhY2UoL1xcblxccysvZywgJyAnKS50cmltKCksXG4gICAgICBhdHRyaWJ1dGVzOiB2YXJpYW50RGVmYXVsdHMsXG4gICAgICBpc0FjdGl2ZTogWydoYW5kb2ZmVmFyaWFudCddLFxuICAgICAgc2NvcGU6IFsnaW5zZXJ0ZXInXSxcbiAgICAgIGljb246IGNob29zZVZhcmlhbnRJY29uKGNvbXApLFxuICAgIH07XG5cbiAgICBpZiAodmFyaWFudFNjcmVlbnNob3RzW2NvbXAuaWRdKSB7XG4gICAgICB2YXJpYXRpb24uZXhhbXBsZSA9IHtcbiAgICAgICAgdmlld3BvcnRXaWR0aDogMTIwMCxcbiAgICAgICAgYXR0cmlidXRlczogeyBoYW5kb2ZmVmFyaWFudDogY29tcC5pZCwgX19wcmV2aWV3OiB0cnVlIH0sXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB2YXJpYXRpb247XG4gIH0pO1xuXG4gIGNvbnN0IGJsb2NrSnNvbjogYW55ID0ge1xuICAgICRzY2hlbWE6ICdodHRwczovL3NjaGVtYXMud3Aub3JnL3RydW5rL2Jsb2NrLmpzb24nLFxuICAgIGFwaVZlcnNpb246IDMsXG4gICAgbmFtZTogYGhhbmRvZmYvJHtibG9ja05hbWV9YCxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIHRpdGxlOiBncm91cFRpdGxlLFxuICAgIGNhdGVnb3J5OiBncm91cFRvQ2F0ZWdvcnkoZ3JvdXBTbHVnKSxcbiAgICBpY29uOiBjaG9vc2VHcm91cEljb24oZ3JvdXBTbHVnKSxcbiAgICBkZXNjcmlwdGlvbjogYCR7Z3JvdXBUaXRsZX0gYmxvY2sgd2l0aCAke3ZhcmlhbnRzLmxlbmd0aH0gdmFyaWF0aW9ucy5gLFxuICAgIGtleXdvcmRzOiBbZ3JvdXBTbHVnXSxcbiAgICB0ZXh0ZG9tYWluOiAnaGFuZG9mZicsXG4gICAgZWRpdG9yU2NyaXB0OiAnZmlsZTouL2luZGV4LmpzJyxcbiAgICBlZGl0b3JTdHlsZTogJ2ZpbGU6Li9pbmRleC5jc3MnLFxuICAgIHN0eWxlOiAnZmlsZTouL3N0eWxlLWluZGV4LmNzcycsXG4gICAgcmVuZGVyOiAnZmlsZTouL3JlbmRlci5waHAnLFxuICAgIGF0dHJpYnV0ZXM6IGFsbEF0dHJpYnV0ZXMsXG4gICAgc3VwcG9ydHM6IHtcbiAgICAgIGFsaWduOiBbJ25vbmUnLCAnd2lkZScsICdmdWxsJ10sXG4gICAgICBodG1sOiBmYWxzZSxcbiAgICB9LFxuICAgIHZhcmlhdGlvbnMsXG4gIH07XG5cbiAgaWYgKGFueUhhc1NjcmVlbnNob3QpIHtcbiAgICBibG9ja0pzb24uZXhhbXBsZSA9IHtcbiAgICAgIHZpZXdwb3J0V2lkdGg6IDEyMDAsXG4gICAgICBhdHRyaWJ1dGVzOiB7IGhhbmRvZmZWYXJpYW50OiB2YXJpYW50c1swXS5jb21wb25lbnQuaWQsIF9fcHJldmlldzogdHJ1ZSB9LFxuICAgIH07XG4gIH1cblxuICBibG9ja0pzb24uX19oYW5kb2ZmID0ge1xuICAgIHJlbW92ZWRGcm9tSGFuZG9mZjogZmFsc2UsXG4gIH07XG5cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGJsb2NrSnNvbiwgbnVsbCwgMik7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIGluZGV4LmpzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIFJlcGxhY2Ugb2NjdXJyZW5jZXMgb2YgYSByZWdleCBwYXR0ZXJuIG9ubHkgaW4gY29kZSBzZWdtZW50cyxcbiAqIHNraXBwaW5nIGNvbnRlbnQgaW5zaWRlIHF1b3RlZCBzdHJpbmdzIChzaW5nbGUsIGRvdWJsZSwgb3IgYmFja3RpY2spLlxuICogVGhpcyBwcmV2ZW50cyBmaWVsZCBuYW1lIHJlbWFwcGluZyBmcm9tIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gKiBhbmQgb3RoZXIgc3RyaW5nIGxpdGVyYWxzIGluIHRoZSBnZW5lcmF0ZWQgSlNYLlxuICovXG5jb25zdCByZXBsYWNlT3V0c2lkZVN0cmluZ3MgPSAoanN4OiBzdHJpbmcsIHBhdHRlcm46IFJlZ0V4cCwgcmVwbGFjZW1lbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuICBsZXQgaSA9IDA7XG4gIGxldCBpblN0cmluZzogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzZWdTdGFydCA9IDA7XG5cbiAgd2hpbGUgKGkgPCBqc3gubGVuZ3RoKSB7XG4gICAgaWYgKGluU3RyaW5nKSB7XG4gICAgICBpZiAoanN4W2ldID09PSAnXFxcXCcpIHtcbiAgICAgICAgaSArPSAyO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChqc3hbaV0gPT09IGluU3RyaW5nKSB7XG4gICAgICAgIHNlZ21lbnRzLnB1c2goanN4LnNsaWNlKHNlZ1N0YXJ0LCBpICsgMSkpO1xuICAgICAgICBzZWdTdGFydCA9IGkgKyAxO1xuICAgICAgICBpblN0cmluZyA9IG51bGw7XG4gICAgICB9XG4gICAgICBpKys7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChqc3hbaV0gPT09ICdcIicgfHwganN4W2ldID09PSBcIidcIiB8fCBqc3hbaV0gPT09ICdgJykge1xuICAgICAgICBjb25zdCBub25TdHJpbmdQYXJ0ID0ganN4LnNsaWNlKHNlZ1N0YXJ0LCBpKTtcbiAgICAgICAgc2VnbWVudHMucHVzaChub25TdHJpbmdQYXJ0LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpKTtcbiAgICAgICAgc2VnU3RhcnQgPSBpO1xuICAgICAgICBpblN0cmluZyA9IGpzeFtpXTtcbiAgICAgICAgaSsrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChzZWdTdGFydCA8IGpzeC5sZW5ndGgpIHtcbiAgICBjb25zdCByZW1haW5pbmcgPSBqc3guc2xpY2Uoc2VnU3RhcnQpO1xuICAgIGlmIChpblN0cmluZykge1xuICAgICAgc2VnbWVudHMucHVzaChyZW1haW5pbmcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWdtZW50cy5wdXNoKHJlbWFpbmluZy5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNlZ21lbnRzLmpvaW4oJycpO1xufTtcblxuaW50ZXJmYWNlIE1lcmdlZEluZGV4UmVzdWx0IHtcbiAgaW5kZXhKczogc3RyaW5nO1xuICB2YXJpYXRpb25KczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRJbmRleEpzID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgc3VwZXJzZXRBdHRyczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPixcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4gIGFwaVVybD86IHN0cmluZyxcbiAgdmFyaWFudFNjcmVlbnNob3RzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG4gIGVkaXRvckNvbmZpZz86IEhhbmRvZmZFZGl0b3JDb25maWcsXG4pOiBNZXJnZWRJbmRleFJlc3VsdCA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcblxuICAvLyBDb2xsZWN0IGFsbCB1bmlxdWUgZmVhdHVyZXMgbmVlZGVkIGFjcm9zcyB2YXJpYW50c1xuICBsZXQgbmVlZHNNZWRpYVVwbG9hZCA9IGZhbHNlO1xuICBsZXQgbmVlZHNSYW5nZUNvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzVG9nZ2xlQ29udHJvbCA9IGZhbHNlO1xuICBsZXQgbmVlZHNTZWxlY3RDb250cm9sID0gZmFsc2U7XG4gIGxldCBuZWVkc0xpbmtDb250cm9sID0gZmFsc2U7XG4gIGxldCBoYXNBcnJheVByb3BzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNEeW5hbWljQXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNCcmVhZGNydW1ic0FycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55SGFzVGF4b25vbXlBcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc1BhZ2luYXRpb25BcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueVVzZXNJbm5lckJsb2NrcyA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXNMaW5rRmllbGQgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzUmljaFRleHQgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzMTB1cEltYWdlID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gZmFsc2U7XG5cbiAgY29uc3QgaGFzUHJvcGVydHlUeXBlID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHR5cGU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgIGNvbnN0IGNoZWNrID0gKHByb3A6IEhhbmRvZmZQcm9wZXJ0eSk6IGJvb2xlYW4gPT4ge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gdHlwZSkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AucHJvcGVydGllcykuc29tZShjaGVjayk7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AuaXRlbXMucHJvcGVydGllcykuc29tZShjaGVjayk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSB2YXJpYW50LXNwZWNpZmljIGNvbnRlbnQgKHNpZGViYXIgcGFuZWxzICsgcHJldmlldylcbiAgaW50ZXJmYWNlIFZhcmlhbnRHZW5SZXN1bHQge1xuICAgIHBhbmVsczogc3RyaW5nO1xuICAgIHByZXZpZXdKc3g6IHN0cmluZztcbiAgICBhcnJheUhlbHBlcnM6IHN0cmluZztcbiAgICBkeW5hbWljUmVzb2x1dGlvbjogc3RyaW5nO1xuICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbjogc3RyaW5nO1xuICAgIGhhc0JyZWFkY3J1bWJzRmV0Y2g6IGJvb2xlYW47XG4gICAgaGFzVGF4b25vbXlGZXRjaDogYm9vbGVhbjtcbiAgICByZXNvbHZpbmdGbGFnczogc3RyaW5nW107XG4gICAgaGFzTGlua0ZpZWxkOiBib29sZWFuO1xuICAgIGhhc1JpY2hUZXh0OiBib29sZWFuO1xuICAgIGhhczEwdXBJbWFnZTogYm9vbGVhbjtcbiAgICBoYXNJbm5lckJsb2NrczogYm9vbGVhbjtcbiAgfVxuXG4gIGNvbnN0IHZhcmlhbnRSZXN1bHRzOiBSZWNvcmQ8c3RyaW5nLCBWYXJpYW50R2VuUmVzdWx0PiA9IHt9O1xuXG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgICBjb25zdCBwcm9wZXJ0aWVzID0gY29tcC5wcm9wZXJ0aWVzO1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW2NvbXAuaWRdO1xuICAgIGNvbnN0IGR5bmFtaWNBcnJheUNvbmZpZ3MgPSB2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3M7XG4gICAgY29uc3QgaGFzRHluYW1pYyA9IE9iamVjdC5rZXlzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLmxlbmd0aCA+IDA7XG5cbiAgICAvLyBEZXRlY3QgZmVhdHVyZSBuZWVkc1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2ltYWdlJykpIG5lZWRzTWVkaWFVcGxvYWQgPSB0cnVlO1xuICAgIGlmIChoYXNPcGFjaXR5UmFuZ2VGaWVsZChwcm9wZXJ0aWVzKSkgbmVlZHNSYW5nZUNvbnRyb2wgPSB0cnVlO1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2Jvb2xlYW4nKSB8fCBoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2J1dHRvbicpKSBuZWVkc1RvZ2dsZUNvbnRyb2wgPSB0cnVlO1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ3NlbGVjdCcpKSBuZWVkc1NlbGVjdENvbnRyb2wgPSB0cnVlO1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2J1dHRvbicpKSBuZWVkc0xpbmtDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKChwKSA9PiBwLnR5cGUgPT09ICdhcnJheScpKSBoYXNBcnJheVByb3BzID0gdHJ1ZTtcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgY29uc3QgaGFzUG9zdHNEeW5hbWljID0gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiAhKCdhcnJheVR5cGUnIGluIGMpKTtcbiAgICAgIGlmIChoYXNQb3N0c0R5bmFtaWMpIHsgYW55SGFzRHluYW1pY0FycmF5cyA9IHRydWU7IG5lZWRzU2VsZWN0Q29udHJvbCA9IHRydWU7IH1cbiAgICAgIC8vIEJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24gdXNlIHNoYXJlZCBjb21wb25lbnRzIOKAlCB0aGV5IGltcG9ydCB0aGVpciBvd25cbiAgICAgIC8vIFRvZ2dsZUNvbnRyb2wvU2VsZWN0Q29udHJvbCwgc28gd2UgZG8gbm90IG5lZWQgdG8gYWRkIHRob3NlIHRvIHRoZSBncm91cCBibG9jayBpbXBvcnRzLlxuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNCcmVhZGNydW1ic0NvbmZpZyhjKSkpIGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzID0gdHJ1ZTtcbiAgICAgIGlmIChPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpKSBhbnlIYXNUYXhvbm9teUFycmF5cyA9IHRydWU7XG4gICAgICBpZiAoT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpKSBhbnlIYXNQYWdpbmF0aW9uQXJyYXlzID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkgYW55VXNlc0lubmVyQmxvY2tzID0gdHJ1ZTtcblxuICAgIC8vIEdlbmVyYXRlIHByZXZpZXcgKGd1YXJkIGFnYWluc3QgbWlzc2luZyBjb2RlL3RpdGxlIGZyb20gQVBJKVxuICAgIGNvbnN0IHByZXZpZXdSZXN1bHQ6IEpzeFByZXZpZXdSZXN1bHQgPSBnZW5lcmF0ZUpzeFByZXZpZXcoXG4gICAgICBjb21wLmNvZGUgPz8gJycsXG4gICAgICBwcm9wZXJ0aWVzLFxuICAgICAgY29tcC5pZCA/PyBjb21wLnRpdGxlID8/ICd2YXJpYW50JyxcbiAgICAgIGNvbXAudGl0bGUgPz8gY29tcC5pZCA/PyAnVmFyaWFudCcsXG4gICAgICB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQsXG4gICAgICBlZGl0b3JDb25maWcsXG4gICAgKTtcbiAgICBsZXQgcHJldmlld0pzeCA9IHByZXZpZXdSZXN1bHQuanN4ID8/ICcnO1xuICAgIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gcHJldmlld1Jlc3VsdC5pbmxpbmVFZGl0YWJsZUZpZWxkcztcblxuICAgIGNvbnN0IHZhckhhc0xpbmtGaWVsZCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxIYW5kb2ZmTGlua0ZpZWxkJyk7XG4gICAgY29uc3QgdmFySGFzUmljaFRleHQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8UmljaFRleHQnKTtcbiAgICBjb25zdCB2YXJIYXMxMHVwSW1hZ2UgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKTtcbiAgICBjb25zdCB2YXJIYXNJbm5lckJsb2NrcyA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbm5lckJsb2NrcycpO1xuICAgIGlmICh2YXJIYXNMaW5rRmllbGQpIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzUmljaFRleHQpIGFueVByZXZpZXdVc2VzUmljaFRleHQgPSB0cnVlO1xuICAgIGlmICh2YXJIYXMxMHVwSW1hZ2UpIGFueVByZXZpZXdVc2VzMTB1cEltYWdlID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzSW5uZXJCbG9ja3MpIGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSB0cnVlO1xuXG4gICAgLy8gUmVtYXAgYXR0cmlidXRlIHJlZmVyZW5jZXMgaW4gcHJldmlldyBKU1ggdXNpbmcgZmllbGRNYXAuXG4gICAgLy8gVXNlcyByZXBsYWNlT3V0c2lkZVN0cmluZ3MgdG8gYXZvaWQgY29ycnVwdGluZyBDU1MgY2xhc3MgbmFtZXNcbiAgICAvLyBhbmQgb3RoZXIgc3RyaW5nIGxpdGVyYWxzIHRoYXQgaGFwcGVuIHRvIGNvbnRhaW4gdGhlIGZpZWxkIG5hbWUuXG4gICAgZm9yIChjb25zdCBbb3JpZ0tleSwgbWVyZ2VkTmFtZV0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRNYXApKSB7XG4gICAgICBjb25zdCBvcmlnQ2FtZWwgPSB0b0NhbWVsQ2FzZShvcmlnS2V5KTtcbiAgICAgIGlmIChvcmlnQ2FtZWwgIT09IG1lcmdlZE5hbWUpIHtcbiAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7b3JpZ0NhbWVsfVxcXFxiYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHJlcGxhY2VPdXRzaWRlU3RyaW5ncyhwcmV2aWV3SnN4LCByZWdleCwgbWVyZ2VkTmFtZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcGFuZWxzIGZvciBzaWRlYmFyIGNvbnRyb2xzXG4gICAgY29uc3QgcGFuZWxzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyB8fCBwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgICAgaWYgKGlubGluZUVkaXRhYmxlRmllbGRzLmhhcyhrZXkpICYmIHByb3BlcnR5LnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpO1xuICAgICAgY29uc3QgZHluYW1pY0NvbmZpZyA9IGR5bmFtaWNBcnJheUNvbmZpZ3M/LltrZXldO1xuXG4gICAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5JyAmJiBkeW5hbWljQ29uZmlnKSB7XG4gICAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8QnJlYWRjcnVtYnNTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke21lcmdlZEF0dHJOYW1lfVwiXG4gICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgY29uc3QgdGF4b25vbXlPcHRpb25zID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQsIHZhbHVlOiB0IH0pKTtcbiAgICAgICAgICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmtleXMoaXRlbVByb3BzKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbDogc3RyaW5nKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbH0gfSlgLFxuICAgICAgICAgICAgICAgICAgaW5kZW50OiAnICAgICAgICAgICAgICAgICAgJyxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBjdHgpO1xuICAgICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJylcbiAgICAgICAgICAgIDogYCAgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ0xhYmVsJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0ubGFiZWwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIGxhYmVsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPlxuICAgICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnVVJMJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0udXJsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCB1cmw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+YDtcbiAgICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgICAgIDxUYXhvbm9teVNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7bWVyZ2VkQXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgdGF4b25vbXlPcHRpb25zPXske0pTT04uc3RyaW5naWZ5KHRheG9ub215T3B0aW9ucyl9fVxuICAgICAgICAgICAgICAgICAgZGVmYXVsdFRheG9ub215PVwiJHtkZWZhdWx0VGF4b25vbXl9XCJcbiAgICAgICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICByZW5kZXJNYW51YWxJdGVtcz17KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4gICAgICAgICAgICAgICAgICAgIDw+XG4ke2l0ZW1GaWVsZHN9XG4gICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgICAgIDxQYWdpbmF0aW9uU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHttZXJnZWRBdHRyTmFtZX1cIlxuICAgICAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgICBjb25zdCBkZWZhdWx0TW9kZSA9IGR5bmFtaWNDb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0NvbmZpZyA9IGR5bmFtaWNDb25maWcuaXRlbU92ZXJyaWRlc0NvbmZpZyB8fCB7fTtcbiAgICAgICAgICBjb25zdCBhZHZhbmNlZEZpZWxkczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgb3B0aW9ucz86IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PjsgZGVmYXVsdD86IGFueSB9PiA9IFtdO1xuXG4gICAgICAgICAgZm9yIChjb25zdCBbbmFtZSwgY10gb2YgT2JqZWN0LmVudHJpZXMoaXRlbU92ZXJyaWRlc0NvbmZpZykgYXMgQXJyYXk8W3N0cmluZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWddPikge1xuICAgICAgICAgICAgaWYgKGMubW9kZSA9PT0gJ3VpJykgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWUsIGxhYmVsOiBjLmxhYmVsLCB0eXBlOiAnc2VsZWN0Jywgb3B0aW9uczogbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhjLm9wdGlvbnMpLCBkZWZhdWx0OiBjLmRlZmF1bHQgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gZHluYW1pY0NvbmZpZy5maWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgICAgZm9yIChjb25zdCBbZmllbGRQYXRoLCBtYXBwaW5nVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwcGluZykpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbWFwcGluZ1ZhbHVlID09PSAnb2JqZWN0JyAmJiBtYXBwaW5nVmFsdWUgIT09IG51bGwgJiYgKG1hcHBpbmdWYWx1ZSBhcyBhbnkpLnR5cGUgPT09ICdtYW51YWwnKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHRvcEtleSA9IGZpZWxkUGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1t0b3BLZXldO1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZExhYmVsID0gaXRlbVByb3A/Lm5hbWUgfHwgdG9UaXRsZUNhc2UodG9wS2V5KTtcbiAgICAgICAgICAgICAgbGV0IGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgICBsZXQgb3B0aW9uczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICBsZXQgZGVmYXVsdFZhbDogYW55ID0gaXRlbVByb3A/LmRlZmF1bHQgPz8gJyc7XG4gICAgICAgICAgICAgIGlmIChpdGVtUHJvcCkge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoaXRlbVByb3AudHlwZSkge1xuICAgICAgICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzogY29udHJvbFR5cGUgPSAnc2VsZWN0Jzsgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoaXRlbVByb3Aub3B0aW9ucyk7IGJyZWFrO1xuICAgICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6IGNvbnRyb2xUeXBlID0gJ3RvZ2dsZSc7IGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IGZhbHNlOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6IGNvbnRyb2xUeXBlID0gJ251bWJlcic7IGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IDA7IGJyZWFrO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdDogY29udHJvbFR5cGUgPSAndGV4dCc7IGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZTogZmllbGRQYXRoLCBsYWJlbDogZmllbGRMYWJlbCwgdHlwZTogY29udHJvbFR5cGUsIG9wdGlvbnMsIGRlZmF1bHQ6IGRlZmF1bHRWYWwgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8RHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgdmFsdWU9e3tcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSB8fCAnJHtkZWZhdWx0TW9kZX0nLFxuICAgICAgICAgICAgICAgICAgICBwb3N0VHlwZTogJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnlBcmdzOiAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3N0czogJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICBpdGVtT3ZlcnJpZGVzOiAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge31cbiAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KG5leHRWYWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7XG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlOiBuZXh0VmFsdWUuc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVBvc3RUeXBlOiBuZXh0VmFsdWUucG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9UXVlcnlBcmdzOiB7IC4uLm5leHRWYWx1ZS5xdWVyeUFyZ3MsIHBvc3RfdHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0czogbmV4dFZhbHVlLnNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlczogbmV4dFZhbHVlLml0ZW1PdmVycmlkZXMgPz8ge31cbiAgICAgICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICAgICAgb3B0aW9ucz17e1xuICAgICAgICAgICAgICAgICAgICBwb3N0VHlwZXM6ICR7SlNPTi5zdHJpbmdpZnkoZHluYW1pY0NvbmZpZy5wb3N0VHlwZXMpfSxcbiAgICAgICAgICAgICAgICAgICAgbWF4SXRlbXM6ICR7ZHluYW1pY0NvbmZpZy5tYXhJdGVtcyA/PyAyMH0sXG4gICAgICAgICAgICAgICAgICAgIHRleHREb21haW46ICdoYW5kb2ZmJyxcbiAgICAgICAgICAgICAgICAgICAgc2hvd0RhdGVGaWx0ZXI6ICR7KGR5bmFtaWNDb25maWcgYXMgYW55KS5zaG93RGF0ZUZpbHRlciA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZSd9LFxuICAgICAgICAgICAgICAgICAgICBzaG93RXhjbHVkZUN1cnJlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzOiAke0pTT04uc3RyaW5naWZ5KGFkdmFuY2VkRmllbGRzKX1cbiAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICB7JHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnICYmIChcbiAgICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICAgIHsvKiBNYW51YWwgYXJyYXkgY29udHJvbHMgKi99XG4gICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY29udHJvbEluZGVudCA9ICcgICAgICAgICAgICAgICAgJztcbiAgICAgICAgbGV0IGNvbnRyb2xPdXRwdXQ6IHN0cmluZztcbiAgICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgICBjb250cm9sT3V0cHV0ID0gZ2VuZXJhdGVBcnJheUNvbnRyb2woa2V5LCBwcm9wZXJ0eSwgbWVyZ2VkQXR0ck5hbWUsIGxhYmVsLCBjb250cm9sSW5kZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IG1lcmdlZEF0dHJOYW1lLFxuICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gYHNldEF0dHJpYnV0ZXMoeyAke21lcmdlZEF0dHJOYW1lfTogJHt2YWx1ZX0gfSlgLFxuICAgICAgICAgICAgaW5kZW50OiBjb250cm9sSW5kZW50LFxuICAgICAgICAgIH07XG4gICAgICAgICAgY29udHJvbE91dHB1dCA9IGdlbmVyYXRlRmllbGRDb250cm9sKGtleSwgcHJvcGVydHksIGN0eCk7XG4gICAgICAgIH1cbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiR7Y29udHJvbE91dHB1dH1cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBEZXNpZ24gU3lzdGVtIGxpbmtzIHBhbmVsIChwZXItdmFyaWFudCBjb21wb25lbnQgVVJMcylcbiAgICBsZXQgaGFuZG9mZlVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGlmIChhcGlVcmwpIHtcbiAgICAgIGNvbnN0IGJhc2VVcmwgPSBhcGlVcmwucmVwbGFjZSgvXFwvYXBpXFwvPyQvLCAnJyk7XG4gICAgICBoYW5kb2ZmVXJsID0gYCR7YmFzZVVybH0vc3lzdGVtL2NvbXBvbmVudC8ke2NvbXAuaWR9YDtcbiAgICB9IGVsc2UgaWYgKGNvbXAucHJldmlldykge1xuICAgICAgaGFuZG9mZlVybCA9IGNvbXAucHJldmlldztcbiAgICB9XG4gICAgY29uc3QgZmlnbWFVcmwgPSBjb21wLmZpZ21hO1xuICAgIGlmIChoYW5kb2ZmVXJsIHx8IGZpZ21hVXJsKSB7XG4gICAgICBjb25zdCBsaW5rQnV0dG9uczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChoYW5kb2ZmVXJsKSB7XG4gICAgICAgIGxpbmtCdXR0b25zLnB1c2goYCAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9XCIke2hhbmRvZmZVcmx9XCJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCJcbiAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiXG4gICAgICAgICAgICAgICAgICAgIGljb249XCJ2aXNpYmlsaXR5XCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtfXygnVmlldyBpbiBIYW5kb2ZmJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPmApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZ21hVXJsKSB7XG4gICAgICAgIGxpbmtCdXR0b25zLnB1c2goYCAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9XCIke2ZpZ21hVXJsfVwiXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIlxuICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtfXygnT3BlbiBpbiBGaWdtYScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICA8L0J1dHRvbj5gKTtcbiAgICAgIH1cbiAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCdEZXNpZ24gU3lzdGVtJywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT5cbiAgICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtsaW5rQnV0dG9ucy5qb2luKCdcXG4nKX1cbiAgICAgICAgICAgICAgICA8L0ZsZXg+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgIH1cblxuICAgIC8vIER5bmFtaWMgYXJyYXkgcmVzb2x1dGlvbiBjb2RlXG4gICAgLy8gU3BlY2lhbGl6ZWQgYXJyYXlzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uKSByZXNvbHZlIGluIHRoZVxuICAgIC8vIHZhcmlhdGlvbiBmaWxlJ3MgUHJldmlldyBmdW5jdGlvbiBzbyB0aGUgaG9va3MgbGl2ZSBpbiB0aGUgY29ycmVjdCBzY29wZS5cbiAgICAvLyBEeW5hbWljIHBvc3QgYXJyYXlzIHJlc29sdmUgaW4gdGhlIG1haW4gaW5kZXguanMgZWRpdCgpLlxuICAgIGxldCBkeW5hbWljUmVzb2x1dGlvbiA9ICcnO1xuICAgIGxldCBzcGVjaWFsaXplZFJlc29sdXRpb24gPSAnJztcbiAgICBsZXQgdmFySGFzQnJlYWRjcnVtYnNGZXRjaCA9IGZhbHNlO1xuICAgIGxldCB2YXJIYXNUYXhvbm9teUZldGNoID0gZmFsc2U7XG4gICAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGRLZXldIHx8IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICAgIHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNhcCA9IG1lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCddKTtcbiAgICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgIDogJyc7XG4gICAgICAgICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uICs9IGBcbiAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCEke21lcmdlZEF0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgaWYgKCFwb3N0SWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgIC5jYXRjaCgoKSA9PiBzZXRQcmV2aWV3JHtjYXB9KFtdKSk7XG4gIH0sIFske21lcmdlZEF0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgICAgdmFySGFzVGF4b25vbXlGZXRjaCA9IHRydWU7XG4gICAgICAgICAgY29uc3QgY2FwID0gbWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJywgJ3NsdWcnXSk7XG4gICAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKcyA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYCA6ICcnO1xuICAgICAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbiArPSBgXG4gIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgKHNlbGVjdCkgPT4ge1xuICAgICAgaWYgKCEke21lcmdlZEF0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke21lcmdlZEF0dHJOYW1lfSB8fCBbXTtcbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgY29uc3QgdGF4b25vbXkgPSAke21lcmdlZEF0dHJOYW1lfVRheG9ub215IHx8ICcke2R5bkNvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgIGNvbnN0IHJlc3RCYXNlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldFRheG9ub215KHRheG9ub215KT8ucmVzdF9iYXNlO1xuICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2R5bkNvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICBpZiAoIXRlcm1zKSByZXR1cm4gW107XG4gICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgfSxcbiAgICBbJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkLCAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSwgJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX0gfHwgW10pXVxuICApO1xuYDtcbiAgICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke21lcmdlZEF0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZHxTb3VyY2V8VGF4b25vbXkpYCwgJ2cnKTtcbiAgICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24gKz0gYFxuICBjb25zdCBwcmV2aWV3JHttZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpfSA9IFtdOyAvLyBQYWdpbmF0aW9uIHJlbmRlcnMgb24gdGhlIGZyb250ZW5kXG5gO1xuICAgICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7bWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjYXAgPSBtZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCBwcmV2aWV3VmFyTmFtZSA9IGBwcmV2aWV3JHtjYXB9YDtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICAgIHJlc29sdmluZ0ZsYWdzLnB1c2gocmVzb2x2aW5nVmFyTmFtZSk7XG4gICAgICAgIGR5bmFtaWNSZXNvbHV0aW9uICs9IGBcbiAgICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBzZWxlY3QoY29yZURhdGFTdG9yZSk7XG4gICAgICAgICAgaWYgKCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAncXVlcnknKSB7XG4gICAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZSB8fCAncG9zdCc7XG4gICAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7ZHluQ29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgICBvcmRlcmJ5OiBxdWVyeUFyZ3Mub3JkZXJieSB8fCAnZGF0ZScsXG4gICAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgICBzdGF0dXM6ICdwdWJsaXNoJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgICBpZiAocmVjb3JkcyA9PT0gbnVsbCB8fCByZWNvcmRzID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke21lcmdlZEF0dHJOYW1lfUZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgICBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW107XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7bWVyZ2VkQXR0ck5hbWV9RmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlYyA9IHN0b3JlLmdldEVudGl0eVJlY29yZCgncG9zdFR5cGUnLCBzZWwudHlwZSB8fCAncG9zdCcsIHNlbC5pZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9LFxuICAgICAgICBbJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UsICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9UXVlcnlBcmdzIHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdKSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1GaWVsZE1hcHBpbmcgfHwge30pLCBKU09OLnN0cmluZ2lmeSgke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge30pXVxuICAgICAgKTtcbiAgICAgIGNvbnN0ICR7cHJldmlld1Zhck5hbWV9ID0gJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHttZXJnZWRBdHRyTmFtZX0gPz8gW10pO1xuICAgICAgY29uc3QgJHtyZXNvbHZpbmdWYXJOYW1lfSA9ICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAgIC8vIFJlbWFwIGluIHByZXZpZXdcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFycmF5IGhlbHBlcnNcbiAgICBjb25zdCBhcnJheUhlbHBlcnMgPSBnZW5lcmF0ZUFycmF5SGVscGVyc01lcmdlZChwcm9wZXJ0aWVzLCBmaWVsZE1hcCk7XG5cbiAgICB2YXJpYW50UmVzdWx0c1tjb21wLmlkXSA9IHtcbiAgICAgIHBhbmVsczogcGFuZWxzLmpvaW4oJ1xcblxcbicpLFxuICAgICAgcHJldmlld0pzeCxcbiAgICAgIGFycmF5SGVscGVycyxcbiAgICAgIGR5bmFtaWNSZXNvbHV0aW9uOiBkeW5hbWljUmVzb2x1dGlvbixcbiAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbixcbiAgICAgIGhhc0JyZWFkY3J1bWJzRmV0Y2g6IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gsXG4gICAgICBoYXNUYXhvbm9teUZldGNoOiB2YXJIYXNUYXhvbm9teUZldGNoLFxuICAgICAgcmVzb2x2aW5nRmxhZ3MsXG4gICAgICBoYXNMaW5rRmllbGQ6IHZhckhhc0xpbmtGaWVsZCxcbiAgICAgIGhhc1JpY2hUZXh0OiB2YXJIYXNSaWNoVGV4dCxcbiAgICAgIGhhczEwdXBJbWFnZTogdmFySGFzMTB1cEltYWdlLFxuICAgICAgaGFzSW5uZXJCbG9ja3M6IHZhckhhc0lubmVyQmxvY2tzLFxuICAgIH07XG4gIH1cblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTWVkaWFVcGxvYWQnLCAnTWVkaWFVcGxvYWRDaGVjaycsICdNZWRpYVJlcGxhY2VGbG93Jyk7XG4gIGlmIChhbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcykgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIGlmIChuZWVkc0xpbmtDb250cm9sIHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuICBpZiAoKGFueVByZXZpZXdVc2VzUmljaFRleHQgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nLCAnU2VsZWN0Q29udHJvbCcsICdEcm9wZG93bk1lbnUnXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgaWYgKGFueUhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuICBjb25zdCBhbnlIYXNSaWNodGV4dEluQXJyYXkgPSB2YXJpYW50cy5zb21lKCh2KSA9PlxuICAgIE9iamVjdC52YWx1ZXModi5jb21wb25lbnQucHJvcGVydGllcykuc29tZShwID0+XG4gICAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgcC5pdGVtcz8ucHJvcGVydGllcyAmJlxuICAgICAgT2JqZWN0LnZhbHVlcyhwLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoaXAgPT4gaXAudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgICApXG4gICk7XG4gIGlmIChhbnlIYXNSaWNodGV4dEluQXJyYXkpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVGV4dGFyZWFDb250cm9sJyk7XG4gIGNvbXBvbmVudEltcG9ydHMucHVzaCgnRmxleCcpO1xuICBpZiAobmVlZHNMaW5rQ29udHJvbCB8fCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdQb3BvdmVyJyk7XG5cbiAgLy8gUmVwZWF0ZXIgaXMgb25seSBuZWVkZWQgZm9yIG5vbi1zZXJ2ZXItcmVuZGVyZWQgYXJyYXkgcHJvcGVydGllcyBhY3Jvc3MgYWxsIHZhcmlhbnRzXG4gIGNvbnN0IGFueVZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzID0gdmFyaWFudHMuc29tZSgodikgPT5cbiAgICBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKS5zb21lKFxuICAgICAgKFtrLCBwXSkgPT4gcC50eXBlID09PSAnYXJyYXknICYmICghdi5keW5hbWljQXJyYXlDb25maWdzW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gdi5keW5hbWljQXJyYXlDb25maWdzW2tdKSlcbiAgICApXG4gICk7XG4gIGNvbnN0IHRlblVwSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGFueVZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzKSB0ZW5VcEltcG9ydHMucHVzaCgnUmVwZWF0ZXInKTtcbiAgaWYgKGFueVByZXZpZXdVc2VzMTB1cEltYWdlKSB0ZW5VcEltcG9ydHMucHVzaCgnSW1hZ2UnKTtcbiAgY29uc3QgdGVuVXBJbXBvcnQgPSB0ZW5VcEltcG9ydHMubGVuZ3RoID4gMCA/IGBpbXBvcnQgeyAke3RlblVwSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnO1xcbmAgOiAnJztcblxuICBjb25zdCBzaGFyZWROYW1lZEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChhbnlIYXNEeW5hbWljQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnRHluYW1pY1Bvc3RTZWxlY3RvcicsICdtYXBQb3N0RW50aXR5VG9JdGVtJyk7XG4gIGlmIChhbnlIYXNCcmVhZGNydW1ic0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0JyZWFkY3J1bWJzU2VsZWN0b3InKTtcbiAgaWYgKGFueUhhc1RheG9ub215QXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnVGF4b25vbXlTZWxlY3RvcicpO1xuICBpZiAoYW55SGFzUGFnaW5hdGlvbkFycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1BhZ2luYXRpb25TZWxlY3RvcicpO1xuXG4gIGxldCBzaGFyZWRDb21wb25lbnRJbXBvcnQgPSBzaGFyZWROYW1lZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHtzaGFyZWROYW1lZEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICcuLi8uLi9zaGFyZWQnO1xcbmBcbiAgICA6ICcnO1xuICBjb25zdCBuZWVkc0RhdGFTdG9yZSA9IGFueUhhc0R5bmFtaWNBcnJheXMgfHwgYW55SGFzVGF4b25vbXlBcnJheXM7XG4gIGlmIChuZWVkc0RhdGFTdG9yZSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IHsgdXNlU2VsZWN0JHthbnlIYXNCcmVhZGNydW1ic0FycmF5cyA/ICcsIHNlbGVjdCcgOiAnJ30gfSBmcm9tICdAd29yZHByZXNzL2RhdGEnO1xcbmltcG9ydCB7IHN0b3JlIGFzIGNvcmVEYXRhU3RvcmUgfSBmcm9tICdAd29yZHByZXNzL2NvcmUtZGF0YSc7XFxuYDtcbiAgfVxuICBpZiAoYW55SGFzQnJlYWRjcnVtYnNBcnJheXMpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuICBpZiAoYW55UHJldmlld1VzZXNMaW5rRmllbGQpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IEhhbmRvZmZMaW5rRmllbGQgfSBmcm9tICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9MaW5rRmllbGQnO1xcbmA7XG4gIH1cblxuICBjb25zdCBlbGVtZW50SW1wb3J0cyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzKSB7XG4gICAgZWxlbWVudEltcG9ydHMucHVzaCgndXNlU3RhdGUnLCAndXNlRWZmZWN0Jyk7XG4gIH1cblxuICAvLyBBbGwgYXR0cmlidXRlIG5hbWVzIGZvciBkZXN0cnVjdHVyaW5nXG4gIGNvbnN0IGFsbEF0dHJOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBhbGxBdHRyTmFtZXMuYWRkKCdoYW5kb2ZmVmFyaWFudCcpO1xuICBmb3IgKGNvbnN0IGF0dHJOYW1lIG9mIE9iamVjdC5rZXlzKHN1cGVyc2V0QXR0cnMpKSB7XG4gICAgYWxsQXR0ck5hbWVzLmFkZChhdHRyTmFtZSk7XG4gIH1cbiAgLy8gQWxzbyBhZGQgZHluYW1pYyBhcnJheSBkZXJpdmVkIGF0dHJpYnV0ZSBuYW1lc1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSBmaWVsZE1hcHNbdmFyaWFudC5jb21wb25lbnQuaWRdW2ZpZWxkTmFtZV0gfHwgdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykgfHwgaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Qb3N0VHlwZWApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1SZW5kZXJNb2RlYCk7XG4gICAgfVxuICB9XG5cbiAgLy8gVG9vbGJhciB2YXJpYXRpb24gc3dpdGNoZXIgY29udHJvbHMgKGZvciBCbG9ja0NvbnRyb2xzIERyb3Bkb3duTWVudSlcbiAgY29uc3QgdG9vbGJhclZhcmlhbnRDb250cm9scyA9IHZhcmlhbnRzXG4gICAgLm1hcChcbiAgICAgICh2KSA9PlxuICAgICAgICBgICAgICAgICB7IHRpdGxlOiAnJHsodi5jb21wb25lbnQudGl0bGUgPz8gdi5jb21wb25lbnQuaWQgPz8gJycpLnRvU3RyaW5nKCkucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfScsIG9uQ2xpY2s6ICgpID0+IHNldEF0dHJpYnV0ZXMoeyBoYW5kb2ZmVmFyaWFudDogJyR7di5jb21wb25lbnQuaWQgPz8gJyd9JyB9KSB9YCxcbiAgICApXG4gICAgLmpvaW4oJyxcXG4nKTtcblxuICAvLyBDb2xsZWN0IGFsbCBtZXJnZWQgYXR0cmlidXRlIG5hbWVzIHRoYXQgYXJlIGFycmF5IHR5cGUgKGFjcm9zcyBhbGwgdmFyaWFudHMpIHNvIHdlIGVtaXQgZWFjaCBoZWxwZXIgb25jZVxuICBjb25zdCBhbGxBcnJheU1lcmdlZE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgdiBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW3YuY29tcG9uZW50LmlkXTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHYuY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknKSBhbGxBcnJheU1lcmdlZE5hbWVzLmFkZChmaWVsZE1hcFtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSkpO1xuICAgIH1cbiAgfVxuICBjb25zdCBzaGFyZWRBcnJheUhlbHBlcnMgPSBnZW5lcmF0ZVNoYXJlZEFycmF5SGVscGVycyhhbGxBcnJheU1lcmdlZE5hbWVzKTtcblxuICAvLyBWYXJpYXRpb24gaW5jbHVkZSBpbXBvcnRzIGFuZCBjb21wb25lbnQgdXNhZ2UgKG9uZSBmaWxlIHBlciB2YXJpYW50KVxuICBjb25zdCB2YXJpYW50SW1wb3J0TGluZXMgPSB2YXJpYW50cy5tYXAoXG4gICAgKHYpID0+IGBpbXBvcnQgKiBhcyAke3ZhcmlhbnRJZFRvUGFzY2FsKHYuY29tcG9uZW50LmlkKX0gZnJvbSAnLi92YXJpYXRpb25zLyR7di5jb21wb25lbnQuaWR9JztgLFxuICApO1xuICBjb25zdCBoZWxwZXJOYW1lc0xpc3QgPSBbLi4uYWxsQXJyYXlNZXJnZWROYW1lc10ubWFwKFxuICAgIChhKSA9PiBgdXBkYXRlJHthLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYS5zbGljZSgxKX1JdGVtYCxcbiAgKTtcbiAgaWYgKGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSBoZWxwZXJOYW1lc0xpc3QucHVzaCgnSGFuZG9mZkxpbmtGaWVsZCcpO1xuICBpZiAoYW55VXNlc0lubmVyQmxvY2tzIHx8IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MpIGhlbHBlck5hbWVzTGlzdC5wdXNoKCdDT05URU5UX0JMT0NLUycpO1xuICBjb25zdCBoZWxwZXJzT2JqZWN0TGluZSA9XG4gICAgaGVscGVyTmFtZXNMaXN0Lmxlbmd0aCA+IDBcbiAgICAgID8gYCAgICBjb25zdCBoZWxwZXJzID0geyAke2hlbHBlck5hbWVzTGlzdC5qb2luKCcsICcpfSB9O2BcbiAgICAgIDogJyAgICBjb25zdCBoZWxwZXJzID0ge307JztcblxuICBjb25zdCB2YXJpYW50UGFuZWxCbG9ja3MgPSB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXTtcbiAgICAgIGlmICghcmVzdWx0LnBhbmVscy50cmltKCkpIHJldHVybiAnJztcbiAgICAgIGNvbnN0IFBhc2NhbCA9IHZhcmlhbnRJZFRvUGFzY2FsKHYuY29tcG9uZW50LmlkKTtcbiAgICAgIHJldHVybiBgICAgICAgICB7aGFuZG9mZlZhcmlhbnQgPT09ICcke3YuY29tcG9uZW50LmlkfScgJiYgPCR7UGFzY2FsfS5QYW5lbHMgYXR0cmlidXRlcz17YXR0cmlidXRlc30gc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc30gaGVscGVycz17aGVscGVyc30gaXNTZWxlY3RlZD17aXNTZWxlY3RlZH0gLz59YDtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAuam9pbignXFxuJyk7XG5cbiAgY29uc3QgdmFyaWFudFByZXZpZXdCbG9ja3MgPSB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IHtcbiAgICAgIGNvbnN0IFBhc2NhbCA9IHZhcmlhbnRJZFRvUGFzY2FsKHYuY29tcG9uZW50LmlkKTtcbiAgICAgIHJldHVybiBgICAgICAgICAgIHtoYW5kb2ZmVmFyaWFudCA9PT0gJyR7di5jb21wb25lbnQuaWR9JyAmJiA8JHtQYXNjYWx9LlByZXZpZXcgYXR0cmlidXRlcz17YXR0cmlidXRlc30gc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc30gaGVscGVycz17aGVscGVyc30gaXNTZWxlY3RlZD17aXNTZWxlY3RlZH0gLz59YDtcbiAgICB9KVxuICAgIC5qb2luKCdcXG4nKTtcblxuICAvLyBQZXItdmFyaWFudCBKUyBpbmNsdWRlIGZpbGUgY29udGVudHMgKHdyaXR0ZW4gdG8gdmFyaWF0aW9ucy88aWQ+LmpzKVxuICBjb25zdCB2YXJpYXRpb25KczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGNvbnN0IGhlbHBlck5hbWVzID0gWy4uLmFsbEFycmF5TWVyZ2VkTmFtZXNdXG4gICAgICAuZmlsdGVyKChhdHRyTmFtZSkgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHYuY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiAoZmllbGRNYXBzW3YuY29tcG9uZW50LmlkXVtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSkpID09PSBhdHRyTmFtZSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pXG4gICAgICAubWFwKChhKSA9PiBgdXBkYXRlJHthLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYS5zbGljZSgxKX1JdGVtYCk7XG4gICAgdmFyaWF0aW9uSnNbdi5jb21wb25lbnQuaWRdID0gZ2VuZXJhdGVWYXJpYW50SnNGaWxlQ29udGVudChcbiAgICAgIHYsXG4gICAgICByZXN1bHQsXG4gICAgICBmaWVsZE1hcCxcbiAgICAgIGhlbHBlck5hbWVzLFxuICAgICAgYW55UHJldmlld1VzZXNMaW5rRmllbGQsXG4gICAgICBlZGl0b3JDb25maWcsXG4gICAgKTtcbiAgfVxuXG4gIC8vIEJ1aWxkIHZhcmlhbnQtY29uZGl0aW9uYWwgZHluYW1pYyByZXNvbHV0aW9uICsgYXJyYXkgaGVscGVyc1xuICBjb25zdCB2YXJpYW50RHluYW1pY0Jsb2NrcyA9IHZhcmlhbnRzLm1hcCgodikgPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXTtcbiAgICBjb25zdCBjb2RlID0gcmVzdWx0LmR5bmFtaWNSZXNvbHV0aW9uICsgcmVzdWx0LmFycmF5SGVscGVycztcbiAgICBpZiAoIWNvZGUudHJpbSgpKSByZXR1cm4gJyc7XG4gICAgcmV0dXJuIGAgICAgaWYgKGhhbmRvZmZWYXJpYW50ID09PSAnJHt2LmNvbXBvbmVudC5pZH0nKSB7XG4ke2NvZGV9XG4gICAgfWA7XG4gIH0pLmZpbHRlcihCb29sZWFuKTtcblxuICAvLyBGb3IgZHluYW1pYyByZXNvbHV0aW9uLCB3ZSBuZWVkIHRoZSB2YXJpYWJsZXMgdG8gYmUgZGVjbGFyZWQgaW4gYSBzY29wZSB2aXNpYmxlIHRvIHRoZSBwcmV2aWV3XG4gIC8vIFdlJ2xsIHVzZSBhIGRpZmZlcmVudCBhcHByb2FjaDogZGVjbGFyZSBhbGwgYXQgdG9wLCBjb25kaXRpb25hbGx5IHBvcHVsYXRlXG4gIGNvbnN0IGFsbFJlc29sdmluZ0ZsYWdzID0gdmFyaWFudHMuZmxhdE1hcCgodikgPT4gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdLnJlc29sdmluZ0ZsYWdzKTtcbiAgY29uc3QgaGFzQW55UmVzb2x2aW5nID0gYWxsUmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMDtcblxuICAvLyBHZW5lcmF0ZSBkeW5hbWljIHJlc29sdXRpb24gcGVyIHZhcmlhbnQ7IGFycmF5IGhlbHBlcnMgYXJlIGVtaXR0ZWQgb25jZSBhYm92ZSAoc2hhcmVkQXJyYXlIZWxwZXJzKVxuICBsZXQgY29tYmluZWREeW5hbWljQ29kZSA9IHNoYXJlZEFycmF5SGVscGVycy50cmltKCkgPyBgXFxuJHtzaGFyZWRBcnJheUhlbHBlcnN9YCA6ICcnO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgaWYgKHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbi50cmltKCkpIHtcbiAgICAgIGNvbWJpbmVkRHluYW1pY0NvZGUgKz0gcmVzdWx0LmR5bmFtaWNSZXNvbHV0aW9uO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGF0dHJOYW1lc0xpc3QgPSBBcnJheS5mcm9tKGFsbEF0dHJOYW1lcyk7XG5cbiAgLy8gR2VuZXJhdGUgdmFyaWFudC1jb25kaXRpb25hbCBNZWRpYVJlcGxhY2VGbG93IHRvb2xiYXIgZW50cmllcyBmb3IgaW1hZ2UgZmllbGRzXG4gIGNvbnN0IHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3M6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgdiBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXAgPSB2LmNvbXBvbmVudDtcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1tjb21wLmlkXTtcbiAgICBjb25zdCBpbWFnZUVudHJpZXM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgbWVyZ2VkQXR0ck5hbWU6IHN0cmluZyB9PiA9IFtdO1xuXG4gICAgY29uc3QgY29sbGVjdEltYWdlcyA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcGFyZW50UGF0aDogc3RyaW5nID0gJycpID0+IHtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICAgIGNvbnN0IG1lcmdlZE5hbWUgPSBwYXJlbnRQYXRoXG4gICAgICAgICAgPyBgJHtmaWVsZE1hcFtwYXJlbnRQYXRoXSB8fCB0b0NhbWVsQ2FzZShwYXJlbnRQYXRoKX1gXG4gICAgICAgICAgOiAoZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKTtcbiAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICAgIGltYWdlRW50cmllcy5wdXNoKHtcbiAgICAgICAgICAgIGxhYmVsOiBwcm9wLm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KSxcbiAgICAgICAgICAgIG1lcmdlZEF0dHJOYW1lOiBwYXJlbnRQYXRoID8gbWVyZ2VkTmFtZSA6IG1lcmdlZE5hbWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgY29sbGVjdEltYWdlcyhwcm9wLnByb3BlcnRpZXMsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICAgIGNvbGxlY3RJbWFnZXMoY29tcC5wcm9wZXJ0aWVzKTtcblxuICAgIGlmIChpbWFnZUVudHJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbWVkaWFGbG93cyA9IGltYWdlRW50cmllcy5tYXAoKGltZykgPT5cbiAgICAgICAgYCAgICAgICAgICAgIDxNZWRpYVJlcGxhY2VGbG93XG4gICAgICAgICAgICAgIG1lZGlhSWQ9eyR7aW1nLm1lcmdlZEF0dHJOYW1lfT8uaWR9XG4gICAgICAgICAgICAgIG1lZGlhVXJsPXske2ltZy5tZXJnZWRBdHRyTmFtZX0/LnNyY31cbiAgICAgICAgICAgICAgYWxsb3dlZFR5cGVzPXtbJ2ltYWdlJ119XG4gICAgICAgICAgICAgIGFjY2VwdD1cImltYWdlLypcIlxuICAgICAgICAgICAgICBvblNlbGVjdD17KG1lZGlhKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtpbWcubWVyZ2VkQXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSl9XG4gICAgICAgICAgICAgIG5hbWU9e19fKCcke2ltZy5sYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgLz5gXG4gICAgICApLmpvaW4oJ1xcbicpO1xuICAgICAgdmFyaWFudE1lZGlhUmVwbGFjZUJsb2Nrcy5wdXNoKFxuICAgICAgICBgICAgICAgICB7aGFuZG9mZlZhcmlhbnQgPT09ICcke2NvbXAuaWR9JyAmJiAoXFxuICAgICAgICAgIDxCbG9ja0NvbnRyb2xzIGdyb3VwPVwib3RoZXJcIj5cXG4ke21lZGlhRmxvd3N9XFxuICAgICAgICAgIDwvQmxvY2tDb250cm9scz5cXG4gICAgICAgICl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbWVkaWFSZXBsYWNlSnN4ID0gdmFyaWFudE1lZGlhUmVwbGFjZUJsb2Nrcy5sZW5ndGggPiAwXG4gICAgPyAnXFxuJyArIHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3Muam9pbignXFxuJylcbiAgICA6ICcnO1xuXG4gIGNvbnN0IHN2Z0ljb25TdHIgPSBnZW5lcmF0ZUdyb3VwU3ZnSWNvbkNvZGUoZ3JvdXBUaXRsZSwgZ3JvdXBTbHVnKTtcblxuICAvLyBCdWlsZCBzY3JlZW5zaG90IGltcG9ydHMgYW5kIGxvb2t1cCBtYXAgZm9yIHZhcmlhbnQgcHJldmlld3NcbiAgY29uc3Qgc2NyZWVuc2hvdEltcG9ydExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBzY3JlZW5zaG90TWFwRW50cmllczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgYW55VmFyaWFudEhhc1NjcmVlbnNob3QgPSB2YXJpYW50U2NyZWVuc2hvdHMgJiYgT2JqZWN0LnZhbHVlcyh2YXJpYW50U2NyZWVuc2hvdHMpLnNvbWUoQm9vbGVhbik7XG5cbiAgaWYgKGFueVZhcmlhbnRIYXNTY3JlZW5zaG90ICYmIHZhcmlhbnRTY3JlZW5zaG90cykge1xuICAgIGZvciAoY29uc3QgdiBvZiB2YXJpYW50cykge1xuICAgICAgaWYgKHZhcmlhbnRTY3JlZW5zaG90c1t2LmNvbXBvbmVudC5pZF0pIHtcbiAgICAgICAgY29uc3Qgc2FmZVZhciA9ICdzY3JlZW5zaG90XycgKyB2YXJpYW50SWRUb0NhbWVsKHYuY29tcG9uZW50LmlkKTtcbiAgICAgICAgc2NyZWVuc2hvdEltcG9ydExpbmVzLnB1c2goYGltcG9ydCAke3NhZmVWYXJ9IGZyb20gJy4vc2NyZWVuc2hvdC0ke3YuY29tcG9uZW50LmlkfS5wbmcnO2ApO1xuICAgICAgICBzY3JlZW5zaG90TWFwRW50cmllcy5wdXNoKGAgICcke3YuY29tcG9uZW50LmlkfSc6ICR7c2FmZVZhcn1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3Qgc2NyZWVuc2hvdEltcG9ydHMgPSBzY3JlZW5zaG90SW1wb3J0TGluZXMubGVuZ3RoID4gMFxuICAgID8gc2NyZWVuc2hvdEltcG9ydExpbmVzLmpvaW4oJ1xcbicpICsgJ1xcbidcbiAgICA6ICcnO1xuICBjb25zdCBzY3JlZW5zaG90TWFwQ29kZSA9IHNjcmVlbnNob3RNYXBFbnRyaWVzLmxlbmd0aCA+IDBcbiAgICA/IGBjb25zdCB2YXJpYW50U2NyZWVuc2hvdHMgPSB7XFxuJHtzY3JlZW5zaG90TWFwRW50cmllcy5qb2luKCcsXFxuJyl9XFxufTtcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgcHJldmlld0d1YXJkID0gYW55VmFyaWFudEhhc1NjcmVlbnNob3RcbiAgICA/IGAgICAgaWYgKGF0dHJpYnV0ZXMuX19wcmV2aWV3KSB7XG4gICAgICBjb25zdCBzY3JlZW5zaG90U3JjID0gdmFyaWFudFNjcmVlbnNob3RzW2hhbmRvZmZWYXJpYW50XTtcbiAgICAgIGlmIChzY3JlZW5zaG90U3JjKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4gICAgICAgICAgICA8aW1nIHNyYz17c2NyZWVuc2hvdFNyY30gYWx0PXttZXRhZGF0YS50aXRsZX0gc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX0gLz5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5gXG4gICAgOiAnJztcblxuICBjb25zdCBpbmRleEpzVGVtcGxhdGUgPSBgaW1wb3J0IHsgcmVnaXN0ZXJCbG9ja1R5cGUgfSBmcm9tICdAd29yZHByZXNzL2Jsb2Nrcyc7XG5pbXBvcnQgeyBcbiAgJHtibG9ja0VkaXRvckltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic7XG5pbXBvcnQgeyBcbiAgJHtjb21wb25lbnRJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9jb21wb25lbnRzJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2VsZW1lbnQnO1xuJHt0ZW5VcEltcG9ydH0ke3NoYXJlZENvbXBvbmVudEltcG9ydH1pbXBvcnQgbWV0YWRhdGEgZnJvbSAnLi9ibG9jay5qc29uJztcbmltcG9ydCAnLi9lZGl0b3Iuc2Nzcyc7XG4ke2FueUhhc0R5bmFtaWNBcnJheXMgPyBcImltcG9ydCAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvRHluYW1pY1Bvc3RTZWxlY3Rvci5lZGl0b3Iuc2Nzcyc7XFxuXCIgOiAnJ31pbXBvcnQgJy4vc3R5bGUuc2Nzcyc7XG4ke3NjcmVlbnNob3RJbXBvcnRzfSR7dmFyaWFudEltcG9ydExpbmVzLmpvaW4oJ1xcbicpfVxuJHtzY3JlZW5zaG90TWFwQ29kZX1jb25zdCBibG9ja0ljb24gPSAoXG4gICR7c3ZnSWNvblN0cn1cbik7XG5cbnJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsXG4gIGljb246IGJsb2NrSWNvbixcbiAgZWRpdDogKHsgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaXNTZWxlY3RlZCB9KSA9PiB7XG4gICAgY29uc3QgYmxvY2tQcm9wcyA9IHVzZUJsb2NrUHJvcHMoKTtcbiR7YW55VXNlc0lubmVyQmxvY2tzIHx8IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyBcIiAgICBjb25zdCBDT05URU5UX0JMT0NLUyA9IFsnY29yZS9wYXJhZ3JhcGgnLCdjb3JlL2hlYWRpbmcnLCdjb3JlL2xpc3QnLCdjb3JlL2xpc3QtaXRlbScsJ2NvcmUvcXVvdGUnLCdjb3JlL2ltYWdlJywnY29yZS9zZXBhcmF0b3InLCdjb3JlL2h0bWwnLCdjb3JlL2J1dHRvbnMnLCdjb3JlL2J1dHRvbiddO1wiIDogJyd9XG4gICAgY29uc3QgeyAke2F0dHJOYW1lc0xpc3Quam9pbignLCAnKX0gfSA9IGF0dHJpYnV0ZXM7XG4ke3ByZXZpZXdHdWFyZH1cbiR7Y29tYmluZWREeW5hbWljQ29kZX1cbiR7aGVscGVyc09iamVjdExpbmV9XG4gICAgcmV0dXJuIChcbiAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgPEJsb2NrQ29udHJvbHMgZ3JvdXA9XCJibG9ja1wiPlxuICAgICAgICAgIDxEcm9wZG93bk1lbnVcbiAgICAgICAgICAgIGljb249XCJsYXlvdXRcIlxuICAgICAgICAgICAgbGFiZWw9e19fKCdWYXJpYXRpb24nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgY29udHJvbHM9e1tcbiR7dG9vbGJhclZhcmlhbnRDb250cm9sc31cbiAgICAgICAgICAgIF19XG4gICAgICAgICAgLz5cbiAgICAgICAgPC9CbG9ja0NvbnRyb2xzPiR7bWVkaWFSZXBsYWNlSnN4fVxuICAgICAgICA8SW5zcGVjdG9yQ29udHJvbHM+XG4ke3ZhcmlhbnRQYW5lbEJsb2Nrc31cbiAgICAgICAgPC9JbnNwZWN0b3JDb250cm9scz5cblxuICAgICAgICB7LyogRWRpdG9yIFByZXZpZXcgKi99XG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuJHt2YXJpYW50UHJldmlld0Jsb2Nrc31cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L0ZyYWdtZW50PlxuICAgICk7XG4gIH0sXG4gIHNhdmU6ICgpID0+IHtcbiR7YW55VXNlc0lubmVyQmxvY2tzIHx8IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyAnICAgIHJldHVybiA8SW5uZXJCbG9ja3MuQ29udGVudCAvPjsnIDogJyAgICByZXR1cm4gbnVsbDsnfVxuICB9LFxufSk7XG5gO1xuICByZXR1cm4geyBpbmRleEpzOiBpbmRleEpzVGVtcGxhdGUsIHZhcmlhdGlvbkpzIH07XG59O1xuXG4vLyDilIDilIDilIAgSGVscGVyIGdlbmVyYXRvcnMgZm9yIG1lcmdlZCBjb250ZXh0IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZUFycmF5SGVscGVyc01lcmdlZCA9IChcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PixcbiAgZmllbGRNYXA6IEZpZWxkTWFwLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgaGVscGVyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGlmIChwcm9wLnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGhlbHBlcnMucHVzaChgXG4gICAgY29uc3QgdXBkYXRlJHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfUl0ZW0gPSAoaW5kZXgsIGZpZWxkLCB2YWx1ZSkgPT4ge1xuICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uKCR7YXR0ck5hbWV9IHx8IFtdKV07XG4gICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgW2ZpZWxkXTogdmFsdWUgfTtcbiAgICAgIHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgfTtgKTtcbiAgfVxuICByZXR1cm4gaGVscGVycy5qb2luKCdcXG4nKTtcbn07XG5cbi8qKiBHZW5lcmF0ZSBhcnJheSB1cGRhdGUgaGVscGVycyBvbmNlIHBlciBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKGF2b2lkcyBkdXBsaWNhdGUgZGVjbGFyYXRpb25zIGFjcm9zcyB2YXJpYW50cykuICovXG5jb25zdCBnZW5lcmF0ZVNoYXJlZEFycmF5SGVscGVycyA9IChtZXJnZWRBcnJheUF0dHJOYW1lczogU2V0PHN0cmluZz4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBoZWxwZXJzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGF0dHJOYW1lIG9mIG1lcmdlZEFycmF5QXR0ck5hbWVzKSB7XG4gICAgY29uc3QgaGVscGVyTmFtZSA9IGB1cGRhdGUke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9SXRlbWA7XG4gICAgaGVscGVycy5wdXNoKGBcbiAgICBjb25zdCAke2hlbHBlck5hbWV9ID0gKGluZGV4LCBmaWVsZCwgdmFsdWUpID0+IHtcbiAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLigke2F0dHJOYW1lfSB8fCBbXSldO1xuICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sIFtmaWVsZF06IHZhbHVlIH07XG4gICAgICBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgIH07YCk7XG4gIH1cbiAgcmV0dXJuIGhlbHBlcnMuam9pbignXFxuJyk7XG59O1xuXG4vKiogQ29sbGVjdCBhdHRyaWJ1dGUgbmFtZXMgcmVmZXJlbmNlZCBpbiBKU1ggKHNldEF0dHJpYnV0ZXMoeyB4OiBvciB2YWx1ZT17eH0pIHNvIHdlIGRlc3RydWN0dXJlIHRoZW0gZXZlbiBpZiBub3QgaW4gZmllbGRNYXAuICovXG5jb25zdCBjb2xsZWN0QXR0ck5hbWVzRnJvbUpzeCA9IChqc3g6IHN0cmluZyk6IFNldDxzdHJpbmc+ID0+IHtcbiAgY29uc3QgbmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgc2V0QXR0clJlZ2V4ID0gL3NldEF0dHJpYnV0ZXNcXHMqXFwoXFxzKlxce1xccyooW2EtekEtWl8kXVthLXpBLVowLTlfJF0qKVxccyo6L2c7XG4gIGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuICB3aGlsZSAoKG0gPSBzZXRBdHRyUmVnZXguZXhlYyhqc3gpKSAhPT0gbnVsbCkgbmFtZXMuYWRkKG1bMV0pO1xuICBjb25zdCB2YWx1ZVJlZ2V4ID0gL3ZhbHVlPVxce1xccyooW2EtekEtWl8kXVthLXpBLVowLTlfJF0qKSg/OlxccypbXFx8XFw/XFwmXFx8XFwhXXxbXFxzXFxuXFxyXSpcXD9cXD98W1xcc1xcblxccl0qXFx8XFx8KS9nO1xuICB3aGlsZSAoKG0gPSB2YWx1ZVJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgY29uc3QgY29uZFJlZ2V4ID0gL1xce1xccyooW2EtekEtWl8kXVthLXpBLVowLTlfJF0qKVxccyomJi9nO1xuICB3aGlsZSAoKG0gPSBjb25kUmVnZXguZXhlYyhqc3gpKSAhPT0gbnVsbCkgbmFtZXMuYWRkKG1bMV0pO1xuICByZXR1cm4gbmFtZXM7XG59O1xuXG4vKiogR2VuZXJhdGUgdGhlIEpTIGNvbnRlbnQgZm9yIG9uZSB2YXJpYXRpb24gaW5jbHVkZSBmaWxlIChleHBvcnRzIFBhbmVscyBhbmQgUHJldmlldykuICovXG5jb25zdCBnZW5lcmF0ZVZhcmlhbnRKc0ZpbGVDb250ZW50ID0gKFxuICB2YXJpYW50OiBWYXJpYW50SW5mbyxcbiAgcmVzdWx0OiB7IHBhbmVsczogc3RyaW5nOyBwcmV2aWV3SnN4OiBzdHJpbmc7IHNwZWNpYWxpemVkUmVzb2x1dGlvbj86IHN0cmluZzsgaGFzQnJlYWRjcnVtYnNGZXRjaD86IGJvb2xlYW47IGhhc1RheG9ub215RmV0Y2g/OiBib29sZWFuIH0sXG4gIGZpZWxkTWFwOiBGaWVsZE1hcCxcbiAgaGVscGVyTmFtZXM6IHN0cmluZ1tdLFxuICBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZDogYm9vbGVhbixcbiAgZWRpdG9yQ29uZmlnPzogSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgY29uc3QgdmFyaWFudER5bkNvbmZpZ3MgPSB2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3M7XG4gIGNvbnN0IGZyb21GaWVsZE1hcCA9IG5ldyBTZXQoT2JqZWN0LnZhbHVlcyhmaWVsZE1hcCkpO1xuICAvLyBTY2FuIHByZXZpZXcgSlNYIGFuZCBwYW5lbCBKU1ggZm9yIGF0dHJpYnV0ZSBuYW1lcyB0byBkZXN0cnVjdHVyZS5cbiAgY29uc3QgZnJvbVByZXZpZXcgPSBjb2xsZWN0QXR0ck5hbWVzRnJvbUpzeChyZXN1bHQucHJldmlld0pzeCArICdcXG4nICsgcmVzdWx0LnBhbmVscyk7XG4gIC8vIENvbGxlY3QgdmFyaWFibGUgbmFtZXMgZGVjbGFyZWQgbG9jYWxseSBieSB0aGUgc3BlY2lhbGl6ZWQgcmVzb2x1dGlvbiBjb2RlXG4gIC8vIChlLmcuIHByZXZpZXdCcmVhZGNydW1iIGZyb20gdXNlU3RhdGUsIHByZXZpZXdUYWdzIGZyb20gdXNlU2VsZWN0KS5cbiAgLy8gVGhlc2UgbXVzdCBOT1QgYmUgZGVzdHJ1Y3R1cmVkIGZyb20gYXR0cmlidXRlcyBvciB0aGV5J2xsIGNvbmZsaWN0LlxuICBjb25zdCBsb2NhbGx5RGVjbGFyZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgaWYgKHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24pIHtcbiAgICBjb25zdCBzdGF0ZU1hdGNoID0gcmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbi5tYXRjaEFsbCgvY29uc3RcXHMrXFxbKFxcdyspLFxccyooXFx3KylcXF1cXHMqPVxccyp1c2VTdGF0ZS9nKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygc3RhdGVNYXRjaCkgeyBsb2NhbGx5RGVjbGFyZWQuYWRkKG1bMV0pOyBsb2NhbGx5RGVjbGFyZWQuYWRkKG1bMl0pOyB9XG4gICAgY29uc3Qgc2VsZWN0TWF0Y2ggPSByZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uLm1hdGNoQWxsKC9jb25zdFxccysoXFx3KylcXHMqPVxccyp1c2VTZWxlY3QvZyk7XG4gICAgZm9yIChjb25zdCBtIG9mIHNlbGVjdE1hdGNoKSB7IGxvY2FsbHlEZWNsYXJlZC5hZGQobVsxXSk7IH1cbiAgfVxuICBjb25zdCByZXNlcnZlZCA9IG5ldyBTZXQoWydpbmRleCcsICd2YWx1ZScsICdpdGVtJywgJ2UnLCAna2V5JywgJ29wZW4nXSk7XG4gIGZyb21QcmV2aWV3LmZvckVhY2goKG5hbWUpID0+IHtcbiAgICBpZiAoIXJlc2VydmVkLmhhcyhuYW1lKSAmJiAhbG9jYWxseURlY2xhcmVkLmhhcyhuYW1lKSkgZnJvbUZpZWxkTWFwLmFkZChuYW1lKTtcbiAgfSk7XG4gIC8vIEVuc3VyZSBzcGVjaWFsaXplZCBhcnJheSBzeW50aGV0aWMgYXR0cmlidXRlcyBhcmUgZGVzdHJ1Y3R1cmVkXG4gIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnREeW5Db25maWdzKSkge1xuICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGRLZXldIHx8IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICBmcm9tRmllbGRNYXAuYWRkKGAke21lcmdlZEF0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICB9XG4gICAgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICBmcm9tRmllbGRNYXAuYWRkKGAke21lcmdlZEF0dHJOYW1lfVRheG9ub215YCk7XG4gICAgICBmcm9tRmllbGRNYXAuYWRkKGAke21lcmdlZEF0dHJOYW1lfVNvdXJjZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBhdHRyTmFtZXMgPSBbLi4uZnJvbUZpZWxkTWFwXTtcbiAgbGV0IHByZXZpZXdKc3hPdXQgPSByZXN1bHQucHJldmlld0pzeDtcbiAgY29uc3QgaW50ZXJhY3RpdmVDYW52YXMgPSBnZW5lcmF0ZUludGVyYWN0aXZlQ2FudmFzQ29kZShcbiAgICBjb21wLmlkLFxuICAgIGF0dHJOYW1lcyxcbiAgICBlZGl0b3JDb25maWcsXG4gICAgY29tcC53b3JkcHJlc3MsXG4gICk7XG4gIGlmIChpbnRlcmFjdGl2ZUNhbnZhcykge1xuICAgIHByZXZpZXdKc3hPdXQgPSBpbmplY3RDYW52YXNSZWZJbnRvUHJldmlld0pzeChwcmV2aWV3SnN4T3V0KTtcbiAgfVxuICBjb25zdCBoZWxwZXJzRGVzdHJ1Y3QgPSBbLi4uaGVscGVyTmFtZXNdO1xuICBpZiAoYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGhlbHBlcnNEZXN0cnVjdC5wdXNoKCdIYW5kb2ZmTGlua0ZpZWxkJyk7XG4gIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGhlbHBlcnNEZXN0cnVjdC5wdXNoKCdDT05URU5UX0JMT0NLUycpO1xuXG4gIGNvbnN0IGF0dHJEZXN0cnVjdCA9IGF0dHJOYW1lcy5sZW5ndGggPyBgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xcbiAgYCA6ICcnO1xuICBjb25zdCBoZWxwZXJzRGVzdHJ1Y3RMaW5lID1cbiAgICBoZWxwZXJzRGVzdHJ1Y3QubGVuZ3RoID4gMCA/IGAgIGNvbnN0IHsgJHtoZWxwZXJzRGVzdHJ1Y3Quam9pbignLCAnKX0gfSA9IGhlbHBlcnM7XFxuICBgIDogJyc7XG5cbiAgY29uc3QgcHJvcHNMaXN0ID0gYW55UHJldmlld1VzZXNMaW5rRmllbGQgPyAneyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBoZWxwZXJzLCBpc1NlbGVjdGVkIH0nIDogJ3sgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaGVscGVycyB9JztcbiAgY29uc3QgcGFuZWxzRXhwb3J0ID1cbiAgICByZXN1bHQucGFuZWxzLnRyaW0oKSA9PT0gJydcbiAgICAgID8gYGV4cG9ydCBmdW5jdGlvbiBQYW5lbHMoKSB7IHJldHVybiBudWxsOyB9YFxuICAgICAgOiBgZXhwb3J0IGZ1bmN0aW9uIFBhbmVscygke3Byb3BzTGlzdH0pIHtcbiR7YXR0ckRlc3RydWN0fSR7aGVscGVyc0Rlc3RydWN0TGluZX0gIHJldHVybiAoXG4gICAgPD5cbiR7cmVzdWx0LnBhbmVsc31cbiAgICA8Lz5cbiAgKTtcbn1gO1xuXG4gIC8vIERldGVybWluZSB3aGljaCBzaGFyZWQgc2VsZWN0b3IgY29tcG9uZW50cyB0aGlzIHZhcmlhbnQncyBwYW5lbHMgdXNlXG4gIGNvbnN0IHZhcmlhbnRIYXNCcmVhZGNydW1icyA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpO1xuICBjb25zdCB2YXJpYW50SGFzVGF4b25vbXkgPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKTtcbiAgY29uc3QgdmFyaWFudEhhc1BhZ2luYXRpb24gPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpO1xuICBjb25zdCB2YXJpYW50U2hhcmVkSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHZhcmlhbnRIYXNCcmVhZGNydW1icykgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAodmFyaWFudEhhc1RheG9ub215KSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmICh2YXJpYW50SGFzUGFnaW5hdGlvbikgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnUGFnaW5hdGlvblNlbGVjdG9yJyk7XG4gIGNvbnN0IHNoYXJlZFNlbGVjdG9ySW1wb3J0ID0gdmFyaWFudFNoYXJlZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHt2YXJpYW50U2hhcmVkSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJy4uLy4uLy4uL3NoYXJlZCc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gT25seSBpbXBvcnQgUmVwZWF0ZXIgd2hlbiB0aGUgdmFyaWFudCBoYXMgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHNcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJlIHNlcnZlci1yZW5kZXJlZDsgc2hhcmVkIGNvbXBvbmVudHMgaW1wb3J0IFJlcGVhdGVyIHRoZW1zZWx2ZXMpXG4gIGNvbnN0IHZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzID0gT2JqZWN0LmVudHJpZXMoY29tcC5wcm9wZXJ0aWVzKS5zb21lKFxuICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXZhcmlhbnREeW5Db25maWdzW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gdmFyaWFudER5bkNvbmZpZ3Nba10pKVxuICApO1xuICBjb25zdCB0ZW5VcEJsb2NrQ29tcG9uZW50c0ltcG9ydCA9ICh2YXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyB8fCByZXN1bHQucHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJykpXG4gICAgPyBgaW1wb3J0IHsgJHtbdmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgPyAnUmVwZWF0ZXInIDogJycsIHJlc3VsdC5wcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKSA/ICdJbWFnZScgOiAnJ10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gU3BlY2lhbGl6ZWQgYXJyYXkgcmVzb2x1dGlvbiBpbXBvcnRzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIGhvb2tzIHJ1biBpbiB0aGUgdmFyaWF0aW9uIGZpbGUpXG4gIGNvbnN0IGhhc1NwZWNpYWxpemVkUmVzb2x1dGlvbiA9ICEhKHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24/LnRyaW0oKSk7XG4gIGNvbnN0IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSByZXN1bHQuaGFzQnJlYWRjcnVtYnNGZXRjaCA/PyBmYWxzZTtcbiAgY29uc3QgdmFySGFzVGF4b25vbXlGZXRjaCA9IHJlc3VsdC5oYXNUYXhvbm9teUZldGNoID8/IGZhbHNlO1xuXG4gIGNvbnN0IGVsZW1lbnRJbXBvcnROYW1lcyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIGVsZW1lbnRJbXBvcnROYW1lcy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcbiAgaWYgKGludGVyYWN0aXZlQ2FudmFzKSB7XG4gICAgZm9yIChjb25zdCBlbCBvZiBpbnRlcmFjdGl2ZUNhbnZhcy5lbGVtZW50SW1wb3J0cykge1xuICAgICAgaWYgKCFlbGVtZW50SW1wb3J0TmFtZXMuaW5jbHVkZXMoZWwpKSBlbGVtZW50SW1wb3J0TmFtZXMucHVzaChlbCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGludGVyYWN0aXZlSW1wb3J0ID1cbiAgICBpbnRlcmFjdGl2ZUNhbnZhcz8uaW1wb3J0TGluZXMgPyBgJHtpbnRlcmFjdGl2ZUNhbnZhcy5pbXBvcnRMaW5lc31cXG5gIDogJyc7XG4gIGNvbnN0IGludGVyYWN0aXZlSG9vayA9IGludGVyYWN0aXZlQ2FudmFzPy5ob29rTGluZXNcbiAgICA/IGAke2ludGVyYWN0aXZlQ2FudmFzLmhvb2tMaW5lc31cXG5gXG4gICAgOiAnJztcblxuICBsZXQgZGF0YUltcG9ydCA9ICcnO1xuICBpZiAodmFySGFzVGF4b25vbXlGZXRjaCB8fCB2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSB7XG4gICAgY29uc3QgZGF0YU5hbWVzID0gWyd1c2VTZWxlY3QnXTtcbiAgICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkgZGF0YU5hbWVzLnB1c2goJ3NlbGVjdCcpO1xuICAgIGRhdGFJbXBvcnQgKz0gYGltcG9ydCB7ICR7ZGF0YU5hbWVzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIHtcbiAgICBkYXRhSW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICBjb25zdCBzcGVjaWFsaXplZENvZGUgPSBoYXNTcGVjaWFsaXplZFJlc29sdXRpb24gPyByZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uISA6ICcnO1xuXG4gIHJldHVybiBgLyoqXG4gKiBWYXJpYXRpb246ICR7Y29tcC50aXRsZX0gKCR7Y29tcC5pZH0pXG4gKiBHZW5lcmF0ZWQg4oCTIGRvIG5vdCBlZGl0IGJ5IGhhbmQuXG4gKi9cbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydE5hbWVzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbmltcG9ydCB7XG4gIFBhbmVsQm9keSxcbiAgVGV4dENvbnRyb2wsXG4gIFRleHRhcmVhQ29udHJvbCxcbiAgQnV0dG9uLFxuICBTZWxlY3RDb250cm9sLFxuICBSYW5nZUNvbnRyb2wsXG4gIFRvZ2dsZUNvbnRyb2wsXG4gIEZsZXgsXG4gIFBvcG92ZXIsXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBNZWRpYVVwbG9hZCwgTWVkaWFVcGxvYWRDaGVjaywgTWVkaWFSZXBsYWNlRmxvdywgTGlua0NvbnRyb2wsIFJpY2hUZXh0LCBJbm5lckJsb2NrcyB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbiR7ZGF0YUltcG9ydH0ke3RlblVwQmxvY2tDb21wb25lbnRzSW1wb3J0fSR7c2hhcmVkU2VsZWN0b3JJbXBvcnR9JHtpbnRlcmFjdGl2ZUltcG9ydH1cbiR7cGFuZWxzRXhwb3J0fVxuXG5leHBvcnQgZnVuY3Rpb24gUHJldmlldygke3Byb3BzTGlzdH0pIHtcbiR7YXR0ckRlc3RydWN0fSR7aGVscGVyc0Rlc3RydWN0TGluZX0ke3NwZWNpYWxpemVkQ29kZX0ke2ludGVyYWN0aXZlSG9va30gIHJldHVybiAoXG4ke3ByZXZpZXdKc3hPdXR9XG4gICk7XG59XG5gO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCByZW5kZXIucGhwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKiogR2VuZXJhdGUgdGhlIFBIUCBmcmFnbWVudCBmb3Igb25lIHZhcmlhbnQgKGV4dHJhY3Rpb25zICsgdGVtcGxhdGUpLiBVc2VkIGluIHZhcmlhdGlvbiBpbmNsdWRlIGZpbGUuICovXG5jb25zdCBnZW5lcmF0ZVZhcmlhbnRQaHBGcmFnbWVudCA9IChcbiAgdmFyaWFudDogVmFyaWFudEluZm8sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1tjb21wLmlkXTtcblxuICBjb25zdCByaWNodGV4dFByb3BzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIHtcbiAgICByaWNodGV4dFByb3BzLmFkZCh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpO1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHRvQ2FtZWxDYXNlKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkpO1xuICB9XG5cbiAgY29uc3QgZXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXAucHJvcGVydGllcykpIHtcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgPT09IHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkgY29udGludWU7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3Qgb3JpZ0NhbWVsID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBkZWZhdWx0VmFsdWUgPSBnZXRQaHBEZWZhdWx0VmFsdWUocHJvcGVydHkpO1xuICAgIGV4dHJhY3Rpb25zLnB1c2goYCQke29yaWdDYW1lbH0gPSBpc3NldCgkYXR0cmlidXRlc1snJHttZXJnZWRBdHRyTmFtZX0nXSkgPyAkYXR0cmlidXRlc1snJHttZXJnZWRBdHRyTmFtZX0nXSA6ICR7ZGVmYXVsdFZhbHVlfTtgKTtcbiAgfVxuICAvLyBEeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gZm9yIHNwZWNpYWxpemVkIGFycmF5IHR5cGVzIChicmVhZGNydW1icywgdGF4b25vbXksIHBhZ2luYXRpb24pXG4gIGNvbnN0IGR5bkFycmF5RXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmICh2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBjb21wLnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBtZXJnZWRBdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGR5bkNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGR5bkNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5BcnJheUNvZGUgPSBkeW5BcnJheUV4dHJhY3Rpb25zLmxlbmd0aCA/ICdcXG4nICsgZHluQXJyYXlFeHRyYWN0aW9ucy5qb2luKCdcXG4nKSA6ICcnO1xuXG4gIGNvbnN0IHRlbXBsYXRlUGhwID0gaGFuZGxlYmFyc1RvUGhwKGNvbXAuY29kZSA/PyAnJywgY29tcC5wcm9wZXJ0aWVzLCByaWNodGV4dFByb3BzKTtcbiAgY29uc3QgY2xhc3NOYW1lID0gKGNvbXAuaWQgPz8gJycpLnJlcGxhY2UoL18vZywgJy0nKTtcblxuICByZXR1cm4gYDw/cGhwXG4vLyBBdHRyaWJ1dGUgZXh0cmFjdGlvbiBmb3IgdmFyaWFudDogJHtjb21wLmlkfVxuJHtleHRyYWN0aW9ucy5qb2luKCdcXG4nKX0ke2R5bkFycmF5Q29kZX1cbj8+XG48ZGl2IGNsYXNzPVwiJHtjbGFzc05hbWV9XCI+XG4ke3RlbXBsYXRlUGhwfVxuPC9kaXY+XG5gO1xufTtcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRSZW5kZXJQaHAgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIGNvbnN0IGRlZmF1bHRWYXJpYW50ID0gdmFyaWFudHNbMF0uY29tcG9uZW50LmlkO1xuXG4gIGNvbnN0IGNhc2VzOiBzdHJpbmdbXSA9IHZhcmlhbnRzLm1hcChcbiAgICAodikgPT4gYCAgY2FzZSAnJHt2LmNvbXBvbmVudC5pZH0nOlxuICAgIGluY2x1ZGUgX19ESVJfXyAuICcvdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfS5waHAnO1xuICAgIGJyZWFrO2AsXG4gICk7XG5cbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7dG9UaXRsZUNhc2UoZ3JvdXBTbHVnKX0gKG1lcmdlZCBncm91cCBibG9jaylcbiAqXG4gKiBAcGFyYW0gYXJyYXkgICAgJGF0dHJpYnV0ZXMgQmxvY2sgYXR0cmlidXRlcy5cbiAqIEBwYXJhbSBzdHJpbmcgICAkY29udGVudCAgICBCbG9jayBkZWZhdWx0IGNvbnRlbnQuXG4gKiBAcGFyYW0gV1BfQmxvY2sgJGJsb2NrICAgICAgQmxvY2sgaW5zdGFuY2UuXG4gKiBAcmV0dXJuIHN0cmluZyBSZXR1cm5zIHRoZSBibG9jayBtYXJrdXAuXG4gKi9cblxuaWYgKCFkZWZpbmVkKCdBQlNQQVRIJykpIHtcbiAgZXhpdDtcbn1cblxuaWYgKCFpc3NldCgkYXR0cmlidXRlcykpIHtcbiAgJGF0dHJpYnV0ZXMgPSBbXTtcbn1cblxuJHZhcmlhbnQgPSBpc3NldCgkYXR0cmlidXRlc1snaGFuZG9mZlZhcmlhbnQnXSkgPyAkYXR0cmlidXRlc1snaGFuZG9mZlZhcmlhbnQnXSA6ICcke2RlZmF1bHRWYXJpYW50fSc7XG4/PlxuPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7YmxvY2tOYW1lfSddKTsgPz4+XG48P3BocFxuc3dpdGNoICgkdmFyaWFudCkge1xuJHtjYXNlcy5qb2luKCdcXG4nKX1cblxuICBkZWZhdWx0OlxuICAgIGVjaG8gJzwhLS0gVW5rbm93biB2YXJpYW50OiAnIC4gZXNjX2h0bWwoJHZhcmlhbnQpIC4gJyAtLT4nO1xuICAgIGJyZWFrO1xufVxuPz5cbjwvZGl2PlxuYDtcbn07XG5cbi8vIGdldFBocERlZmF1bHRWYWx1ZSBpcyBpbXBvcnRlZCBmcm9tIHJlbmRlci1waHAudHNcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBTQ1NTIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZEVkaXRvclNjc3MgPSAoXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBlZGl0b3JDb25maWc/OiBIYW5kb2ZmRWRpdG9yQ29uZmlnLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcHJlZml4ID1cbiAgICBlZGl0b3JDb25maWc/LmNhbnZhc1NoaW0gIT09IGZhbHNlICYmXG4gICAgdmFyaWFudHMuc29tZSgodikgPT4gdGVtcGxhdGVVc2VzQ2FudmFzU2hpbSh2LmNvbXBvbmVudC5jb2RlLCBlZGl0b3JDb25maWcpKVxuICAgICAgPyBDQU5WQVNfU0hJTV9TQ1NTX0lNUE9SVFxuICAgICAgOiAnJztcbiAgcmV0dXJuIChcbiAgICBwcmVmaXggK1xuICAgIHZhcmlhbnRzXG4gICAgICAubWFwKCh2KSA9PlxuICAgICAgICBnZW5lcmF0ZUVkaXRvclNjc3Modi5jb21wb25lbnQsIHsgc2tpcENhbnZhc1NoaW1JbXBvcnQ6IHRydWUsIGVkaXRvckNvbmZpZyB9KSxcbiAgICAgIClcbiAgICAgIC5qb2luKCdcXG5cXG4nKVxuICApO1xufTtcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRTdHlsZVNjc3MgPSAodmFyaWFudHM6IFZhcmlhbnRJbmZvW10pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiBnZW5lcmF0ZVN0eWxlU2Nzcyh2LmNvbXBvbmVudCkpXG4gICAgLmpvaW4oJ1xcblxcbicpO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBNaWdyYXRpb24gU2NoZW1hIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZE1pZ3JhdGlvblNjaGVtYSA9IChcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwVGl0bGU6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG5cbiAgY29uc3QgdmFyaWFudFNjaGVtYXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICAgIGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIE1pZ3JhdGlvblByb3BlcnR5U2NoZW1hPiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoY29tcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIHByb3BlcnRpZXNba2V5XSA9IGV4dHJhY3RNaWdyYXRpb25Qcm9wZXJ0eShwcm9wLCB0cnVlLCBrZXkpO1xuICAgIH1cbiAgICB2YXJpYW50U2NoZW1hc1tjb21wLmlkXSA9IHtcbiAgICAgIHRpdGxlOiBjb21wLnRpdGxlLFxuICAgICAgZGVzY3JpcHRpb246IChjb21wLmRlc2NyaXB0aW9uIHx8ICcnKS5yZXBsYWNlKC9cXG5cXHMrL2csICcgJykudHJpbSgpLFxuICAgICAgcHJvcGVydGllcyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3Qgc2NoZW1hID0ge1xuICAgIGJsb2NrTmFtZTogYGhhbmRvZmYvJHtibG9ja05hbWV9YCxcbiAgICB0aXRsZTogZ3JvdXBUaXRsZSxcbiAgICBkZXNjcmlwdGlvbjogYCR7Z3JvdXBUaXRsZX0gYmxvY2sgd2l0aCAke3ZhcmlhbnRzLmxlbmd0aH0gdmFyaWF0aW9ucy5gLFxuICAgIGNhdGVnb3J5OiBncm91cFRvQ2F0ZWdvcnkoZ3JvdXBTbHVnKSxcbiAgICBpc01lcmdlZEdyb3VwOiB0cnVlLFxuICAgIHZhcmlhbnRzOiB2YXJpYW50U2NoZW1hcyxcbiAgfTtcblxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoc2NoZW1hLCBudWxsLCAyKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgUkVBRE1FIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZFJlYWRtZSA9IChcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwVGl0bGU6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCB2YXJpYW50TGlzdCA9IHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4gYC0gKioke3YuY29tcG9uZW50LnRpdGxlfSoqIChcXGAke3YuY29tcG9uZW50LmlkfVxcYClgKVxuICAgIC5qb2luKCdcXG4nKTtcblxuICByZXR1cm4gYCMgJHtncm91cFRpdGxlfSAoTWVyZ2VkIEdyb3VwIEJsb2NrKVxuXG5UaGlzIGJsb2NrIGNvbWJpbmVzICR7dmFyaWFudHMubGVuZ3RofSBjb21wb25lbnQgdmFyaWF0aW9ucyBpbnRvIGEgc2luZ2xlIFdvcmRQcmVzcyBibG9jay5cblxuIyMgVmFyaWF0aW9uc1xuXG4ke3ZhcmlhbnRMaXN0fVxuXG4jIyBVc2FnZVxuXG5TZWxlY3QgdGhlIGRlc2lyZWQgdmFyaWF0aW9uIGZyb20gdGhlIGJsb2NrIHRvb2xiYXIgKFZhcmlhdGlvbiBkcm9wZG93bikuXG5FYWNoIHZhcmlhdGlvbiBoYXMgaXRzIG93biBzZXQgb2YgY29udHJvbHMgYW5kIHJlbmRlcnMgaXRzIG93biB0ZW1wbGF0ZS5cbmA7XG59O1xuXG4vLyDilIDilIDilIAgTWFpbiBHZW5lcmF0b3Ig4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKlxuICogR2VuZXJhdGUgYSBtZXJnZWQgYmxvY2sgZm9yIGEgZ3JvdXAgb2YgY29tcG9uZW50cy5cbiAqIFZhcmlhdGlvbiBtYXJrdXAgaXMgc3BsaXQgaW50byBpbmNsdWRlIGZpbGVzOiB2YXJpYXRpb25zLzx2YXJpYW50LWlkPi5qcyBhbmQgdmFyaWF0aW9ucy88dmFyaWFudC1pZD4ucGhwLlxuICovXG5leHBvcnQgY29uc3QgZ2VuZXJhdGVNZXJnZWRCbG9jayA9IChcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGNvbXBvbmVudHM6IEhhbmRvZmZDb21wb25lbnRbXSxcbiAgdmFyaWFudEluZm9zOiBWYXJpYW50SW5mb1tdLFxuICBhcGlVcmw/OiBzdHJpbmcsXG4gIHZhcmlhbnRTY3JlZW5zaG90cz86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LFxuICBlZGl0b3JDb25maWc/OiBIYW5kb2ZmRWRpdG9yQ29uZmlnLFxuKTogR2VuZXJhdGVkQmxvY2sgPT4ge1xuICBjb25zdCBncm91cFRpdGxlID0gdG9UaXRsZUNhc2UoZ3JvdXBTbHVnKTtcbiAgY29uc3Qgc2NyZWVuc2hvdHMgPSB2YXJpYW50U2NyZWVuc2hvdHMgfHwge307XG5cbiAgY29uc3Qgc3VwZXJzZXRSZXN1bHQgPSBidWlsZFN1cGVyc2V0QXR0cmlidXRlcyh2YXJpYW50SW5mb3MsIGdyb3VwU2x1Zyk7XG4gIGNvbnN0IHsgYXR0cmlidXRlczogc3VwZXJzZXRBdHRycywgZmllbGRNYXBzIH0gPSBzdXBlcnNldFJlc3VsdDtcblxuICBjb25zdCB7IGluZGV4SnMsIHZhcmlhdGlvbkpzIH0gPSBnZW5lcmF0ZU1lcmdlZEluZGV4SnMoXG4gICAgZ3JvdXBTbHVnLFxuICAgIGdyb3VwVGl0bGUsXG4gICAgdmFyaWFudEluZm9zLFxuICAgIHN1cGVyc2V0QXR0cnMsXG4gICAgZmllbGRNYXBzLFxuICAgIGFwaVVybCxcbiAgICBzY3JlZW5zaG90cyxcbiAgICBlZGl0b3JDb25maWcsXG4gICk7XG5cbiAgY29uc3QgdmFyaWF0aW9uUGhwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50SW5mb3MpIHtcbiAgICB2YXJpYXRpb25QaHBbdmFyaWFudC5jb21wb25lbnQuaWRdID0gZ2VuZXJhdGVWYXJpYW50UGhwRnJhZ21lbnQodmFyaWFudCwgZmllbGRNYXBzKTtcbiAgfVxuXG4gIC8vIEJ1aWxkIHZhcmlhbnQgc2NyZWVuc2hvdCBVUkxzIGZvciB0aGUgY2FsbGVyIHRvIGRvd25sb2FkXG4gIGNvbnN0IHZhcmlhbnRTY3JlZW5zaG90VXJsczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IGNvbXAgb2YgY29tcG9uZW50cykge1xuICAgIGlmICghY29tcC5pbWFnZSkgY29udGludWU7XG4gICAgaWYgKGNvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cDovLycpIHx8IGNvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgdmFyaWFudFNjcmVlbnNob3RVcmxzW2NvbXAuaWRdID0gY29tcC5pbWFnZTtcbiAgICB9IGVsc2UgaWYgKGFwaVVybCkge1xuICAgICAgdmFyaWFudFNjcmVlbnNob3RVcmxzW2NvbXAuaWRdID0gYCR7YXBpVXJsfSR7Y29tcC5pbWFnZS5zdGFydHNXaXRoKCcvJykgPyAnJyA6ICcvJ30ke2NvbXAuaW1hZ2V9YDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJsb2NrSnNvbjogZ2VuZXJhdGVNZXJnZWRCbG9ja0pzb24oZ3JvdXBTbHVnLCBncm91cFRpdGxlLCB2YXJpYW50SW5mb3MsIHN1cGVyc2V0QXR0cnMsIHNjcmVlbnNob3RzKSxcbiAgICBpbmRleEpzLFxuICAgIHJlbmRlclBocDogZ2VuZXJhdGVNZXJnZWRSZW5kZXJQaHAoZ3JvdXBTbHVnLCB2YXJpYW50SW5mb3MsIGZpZWxkTWFwcyksXG4gICAgZWRpdG9yU2NzczogZ2VuZXJhdGVNZXJnZWRFZGl0b3JTY3NzKHZhcmlhbnRJbmZvcywgZWRpdG9yQ29uZmlnKSxcbiAgICBzdHlsZVNjc3M6IGdlbmVyYXRlTWVyZ2VkU3R5bGVTY3NzKHZhcmlhbnRJbmZvcyksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZU1lcmdlZFJlYWRtZShncm91cFNsdWcsIGdyb3VwVGl0bGUsIHZhcmlhbnRJbmZvcyksXG4gICAgbWlncmF0aW9uU2NoZW1hOiBnZW5lcmF0ZU1lcmdlZE1pZ3JhdGlvblNjaGVtYShncm91cFNsdWcsIGdyb3VwVGl0bGUsIHZhcmlhbnRJbmZvcyksXG4gICAgdmFyaWFudFNjcmVlbnNob3RVcmxzLFxuICAgIHZhcmlhdGlvbkZpbGVzOiB7XG4gICAgICBqczogdmFyaWF0aW9uSnMsXG4gICAgICBwaHA6IHZhcmlhdGlvblBocCxcbiAgICB9LFxuICB9O1xufTtcblxuZXhwb3J0IHR5cGUgeyBWYXJpYW50SW5mbyB9O1xuIl19