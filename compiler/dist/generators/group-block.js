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
    // Synthetic overlayOpacity when template uses overlay but component has no overlayOpacity property
    // (single-block generator adds this in block-json; merged block must add it here and map for preview)
    for (const variant of variants) {
        const comp = variant.component;
        if (!comp.code || !comp.code.includes('overlay'))
            continue;
        const hasInProps = Object.keys(comp.properties || {}).some((k) => (0, handlebars_to_jsx_1.toCamelCase)(k) === 'overlayOpacity' || k === 'overlayOpacity');
        if (hasInProps)
            continue;
        const variantCamel = variantIdToCamel(comp.id);
        const attrName = variantCamel + 'OverlayOpacity';
        attributes[attrName] = { type: 'number', default: 0.6 };
        fieldMaps[comp.id]['overlayOpacity'] = attrName;
    }
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
// ─── Merged block.json ──────────────────────────────────────────────────────
const generateMergedBlockJson = (groupSlug, groupTitle, variants, supersetAttrs) => {
    // Add handoffVariant discriminator
    const allAttributes = {
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
        const variantDefaults = { handoffVariant: comp.id };
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
const generateMergedIndexJs = (groupSlug, groupTitle, variants, supersetAttrs, fieldMaps, apiUrl) => {
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
        if (hasPropertyType(properties, 'number') || comp.code.includes('overlay'))
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
        const previewResult = (0, handlebars_to_jsx_1.generateJsxPreview)(comp.code ?? '', properties, comp.id ?? comp.title ?? 'variant', comp.title ?? comp.id ?? 'Variant', variant.innerBlocksField);
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
        // Synthetic overlay opacity panel (when template uses overlay but component has no overlayOpacity property)
        if (fieldMap['overlayOpacity']) {
            const mergedAttrName = fieldMap['overlayOpacity'];
            panels.push(`              <PanelBody title={__('Overlay', 'handoff')} initialOpen={false}>
                <RangeControl
                  label={__('Overlay Opacity', 'handoff')}
                  value={${mergedAttrName} ?? 0.6}
                  onChange={(value) => setAttributes({ ${mergedAttrName}: value })}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </PanelBody>`);
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
        variationJs[v.component.id] = generateVariantJsFileContent(v, result, fieldMap, helperNames, anyPreviewUsesLinkField);
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
const generateVariantJsFileContent = (variant, result, fieldMap, helperNames, anyPreviewUsesLinkField) => {
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
    // Synthetic overlayOpacity (when template uses overlay but component has no overlayOpacity property)
    if (fieldMap['overlayOpacity']) {
        const mergedAttrName = fieldMap['overlayOpacity'];
        extractions.push(`$overlayOpacity = isset($attributes['${mergedAttrName}']) ? $attributes['${mergedAttrName}'] : 0.6;`);
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
const generateMergedEditorScss = (variants) => {
    return variants
        .map((v) => (0, styles_1.generateEditorScss)(v.component))
        .join('\n\n');
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
const generateMergedBlock = (groupSlug, components, variantInfos, apiUrl) => {
    const groupTitle = (0, index_js_1.toTitleCase)(groupSlug);
    const supersetResult = (0, exports.buildSupersetAttributes)(variantInfos, groupSlug);
    const { attributes: supersetAttrs, fieldMaps } = supersetResult;
    const { indexJs, variationJs } = generateMergedIndexJs(groupSlug, groupTitle, variantInfos, supersetAttrs, fieldMaps, apiUrl);
    const variationPhp = {};
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
exports.generateMergedBlock = generateMergedBlock;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9ncm91cC1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsb0NBZWtCO0FBQ2xCLDJEQUF3RjtBQUN4RixxREFBZ0c7QUFDaEcsNkNBQTZFO0FBQzdFLDZDQUEwUDtBQUMxUCxxQ0FBaUU7QUFDakUsK0NBQTRIO0FBQzVILHlDQUFxRjtBQWlDckYsaUZBQWlGO0FBRWpGOztHQUVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQXFCLEVBQUUsQ0FBcUIsRUFBVyxFQUFFO0lBQ25GLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDM0IsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUU7SUFDckQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO1NBQ3hCLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7U0FDMUQsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN4QixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDLENBQUM7QUFFRixnR0FBZ0c7QUFDaEcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFNBQWlCLEVBQVUsRUFBRTtJQUN0RCxNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMx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QWEsRUFDYixTQUFTLEVBQ1QsTUFBTSxDQUNQLENBQUM7SUFFRixNQUFNLFlBQVksR0FBMkIsRUFBRSxDQUFDO0lBQ2hELEtBQUssTUFBTSxPQUFPLElBQUksWUFBWSxFQUFFLENBQUM7UUFDbkMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUcsMEJBQTBCLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFFRCxPQUFPO1FBQ0wsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLGFBQWEsQ0FBQztRQUN0RixPQUFPO1FBQ1AsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxZQUFZLEVBQUUsU0FBUyxDQUFDO1FBQ3RFLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQyxZQUFZLENBQUM7UUFDbEQsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFlBQVksQ0FBQztRQUNoRCxNQUFNLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUM7UUFDakUsZUFBZSxFQUFFLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDO1FBQ25GLGNBQWMsRUFBRTtZQUNkLEVBQUUsRUFBRSxXQUFXO1lBQ2YsR0FBRyxFQUFFLFlBQVk7U0FDbEI7S0FDRixDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBdENXLFFBQUEsbUJBQW1CLHVCQXNDOUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1lcmdlZCBHcm91cCBCbG9jayBHZW5lcmF0b3JcbiAqXG4gKiBDb21iaW5lcyBhbGwgSGFuZG9mZiBjb21wb25lbnRzIGluIHRoZSBzYW1lIGdyb3VwIGludG8gYSBzaW5nbGUgV29yZFByZXNzXG4gKiBibG9jayB3aXRoIHZhcmlhdGlvbnMuIFVzZXMgYSBzdXBlcnNldCBhdHRyaWJ1dGUgc2NoZW1hLCB2YXJpYW50LWNvbmRpdGlvbmFsXG4gKiBzaWRlYmFyIGNvbnRyb2xzLCB2YXJpYW50LXNwZWNpZmljIHByZXZpZXcgcmVuZGVyaW5nLCBhbmQgYSByZW5kZXIucGhwXG4gKiBkaXNwYXRjaGVyLlxuICovXG5cbmltcG9ydCB7XG4gIEhhbmRvZmZDb21wb25lbnQsXG4gIEhhbmRvZmZQcm9wZXJ0eSxcbiAgR3V0ZW5iZXJnQXR0cmlidXRlLFxuICBEeW5hbWljQXJyYXlDb25maWcsXG4gIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsXG4gIFRheG9ub215QXJyYXlDb25maWcsXG4gIFBhZ2luYXRpb25BcnJheUNvbmZpZyxcbiAgR2VuZXJhdGVkQmxvY2ssXG4gIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnLFxuICBCbG9ja0pzb25PdXRwdXQsXG4gIEhhbmRvZmZNZXRhZGF0YSxcbiAgaXNCcmVhZGNydW1ic0NvbmZpZyxcbiAgaXNUYXhvbm9teUNvbmZpZyxcbiAgaXNQYWdpbmF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSwgZ2VuZXJhdGVKc3hQcmV2aWV3LCBKc3hQcmV2aWV3UmVzdWx0IH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCB0eXBlIE5vcm1hbGl6ZWRTZWxlY3RPcHRpb24gfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4L3V0aWxzJztcbmltcG9ydCB7IG1hcFByb3BlcnR5VHlwZSwgZ3JvdXBUb0NhdGVnb3J5LCB0b0Jsb2NrTmFtZSB9IGZyb20gJy4vYmxvY2stanNvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZVJlbmRlclBocCwgaGFuZGxlYmFyc1RvUGhwLCBhcnJheVRvUGhwLCBnZXRQaHBEZWZhdWx0VmFsdWUsIGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbiwgZ2VuZXJhdGVCcmVhZGNydW1ic0FycmF5RXh0cmFjdGlvbiwgZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbiwgZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uLCBidWlsZFJlc2hhcGVKcyB9IGZyb20gJy4vcmVuZGVyLXBocCc7XG5pbXBvcnQgeyBnZW5lcmF0ZUVkaXRvclNjc3MsIGdlbmVyYXRlU3R5bGVTY3NzIH0gZnJvbSAnLi9zdHlsZXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVNaWdyYXRpb25TY2hlbWEsIE1pZ3JhdGlvblNjaGVtYSwgTWlncmF0aW9uUHJvcGVydHlTY2hlbWEsIGV4dHJhY3RNaWdyYXRpb25Qcm9wZXJ0eSB9IGZyb20gJy4vc2NoZW1hLWpzb24nO1xuaW1wb3J0IHsgdG9UaXRsZUNhc2UsIGdlbmVyYXRlRmllbGRDb250cm9sLCBnZW5lcmF0ZUFycmF5Q29udHJvbCB9IGZyb20gJy4vaW5kZXgtanMnO1xuaW1wb3J0IHR5cGUgeyBGaWVsZENvbnRleHQgfSBmcm9tICcuL2luZGV4LWpzJztcblxuLy8g4pSA4pSA4pSAIFR5cGVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKiogUGVyLXZhcmlhbnQgbWFwcGluZyBmcm9tIG9yaWdpbmFsIGZpZWxkIG5hbWUgdG8gbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lICovXG5leHBvcnQgdHlwZSBGaWVsZE1hcCA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cbnR5cGUgQW55RHluYW1pY0FycmF5Q29uZmlnID0gRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc7XG5cbmludGVyZmFjZSBWYXJpYW50SW5mbyB7XG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudDtcbiAgZmllbGRNYXA6IEZpZWxkTWFwO1xuICBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBkeW5hbWljQXJyYXlDb25maWdzOiBSZWNvcmQ8c3RyaW5nLCBBbnlEeW5hbWljQXJyYXlDb25maWc+O1xufVxuXG5pbnRlcmZhY2UgTWVyZ2VkRmllbGQge1xuICAvKiogVGhlIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAoY2FtZWxDYXNlKSAqL1xuICBhdHRyTmFtZTogc3RyaW5nO1xuICAvKiogVGhlIEd1dGVuYmVyZyBhdHRyaWJ1dGUgZGVmaW5pdGlvbiAqL1xuICBhdHRyaWJ1dGU6IEd1dGVuYmVyZ0F0dHJpYnV0ZTtcbiAgLyoqIFdoaWNoIHZhcmlhbnRzIHVzZSB0aGlzIGZpZWxkICovXG4gIHZhcmlhbnRzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIFN1cGVyc2V0UmVzdWx0IHtcbiAgLyoqIEFsbCBtZXJnZWQgYXR0cmlidXRlcyBrZXllZCBieSBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKi9cbiAgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPjtcbiAgLyoqIFBlci12YXJpYW50IGZpZWxkIG1hcDogb3JpZ2luYWwga2V5IOKGkiBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKi9cbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD47XG59XG5cbi8vIOKUgOKUgOKUgCBTdXBlcnNldCBBdHRyaWJ1dGUgTWVyZ2Ug4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKlxuICogVHlwZXMgYXJlIGNvbXBhdGlibGUgaWYgdGhleSBoYXZlIHRoZSBzYW1lIEd1dGVuYmVyZyBhdHRyaWJ1dGUgYHR5cGVgLlxuICovXG5jb25zdCB0eXBlc0FyZUNvbXBhdGlibGUgPSAoYTogR3V0ZW5iZXJnQXR0cmlidXRlLCBiOiBHdXRlbmJlcmdBdHRyaWJ1dGUpOiBib29sZWFuID0+IHtcbiAgaWYgKCFhIHx8ICFiKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBhLnR5cGUgPT09IGIudHlwZTtcbn07XG5cbi8qKlxuICogQ29udmVydCBhIHZhcmlhbnQgSUQgKGUuZy4gXCJoZXJvLWJhc2ljXCIsIFwiaGVyb19zZWFyY2hcIikgaW50byBhIHZhbGlkIGNhbWVsQ2FzZVxuICogaWRlbnRpZmllciBmb3IgdXNlIGluIHByZWZpeGVkIGF0dHJpYnV0ZSBuYW1lcy4gRW5zdXJlcyBnZW5lcmF0ZWQgSlMgY2FuIGRlc3RydWN0dXJlXG4gKiBhdHRyaWJ1dGVzIHdpdGhvdXQgcXVvdGluZyAobm8gaHlwaGVucyBpbiBuYW1lcykuXG4gKi9cbmNvbnN0IHZhcmlhbnRJZFRvQ2FtZWwgPSAodmFyaWFudElkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBzID0gKHZhcmlhbnRJZCA/PyAnJylcbiAgICAucmVwbGFjZSgvWy1fXShbYS16XSkvZywgKF8sIGw6IHN0cmluZykgPT4gbC50b1VwcGVyQ2FzZSgpKVxuICAgIC5yZXBsYWNlKC9bLV9dL2csICcnKTtcbiAgcmV0dXJuIHMuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBzLnNsaWNlKDEpO1xufTtcblxuLyoqIFZhcmlhbnQgSUQgdG8gUGFzY2FsQ2FzZSBmb3IgSlMgaW1wb3J0L2NvbXBvbmVudCBuYW1lIChlLmcuIGhlcm8tYXJ0aWNsZSAtPiBIZXJvQXJ0aWNsZSkuICovXG5jb25zdCB2YXJpYW50SWRUb1Bhc2NhbCA9ICh2YXJpYW50SWQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNhbWVsID0gdmFyaWFudElkVG9DYW1lbCh2YXJpYW50SWQpO1xuICByZXR1cm4gY2FtZWwuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBjYW1lbC5zbGljZSgxKTtcbn07XG5cbi8qKlxuICogTWVyZ2UgYXR0cmlidXRlcyBmcm9tIE4gY29tcG9uZW50cyBpbnRvIGEgc3VwZXJzZXQgc2NoZW1hLlxuICpcbiAqIDEuIFNoYXJlZCBmaWVsZHMgKHNhbWUgbmFtZSwgY29tcGF0aWJsZSB0eXBlKToga2VwdCBhcy1pcy5cbiAqIDIuIENvbmZsaWN0aW5nIGZpZWxkcyAoc2FtZSBuYW1lLCBkaWZmZXJlbnQgdHlwZSk6IHByZWZpeGVkIHdpdGggdmFyaWFudCBzbHVnLlxuICogMy4gVW5pcXVlIGZpZWxkczoga2VwdCBhcy1pcy5cbiAqL1xuZXhwb3J0IGNvbnN0IGJ1aWxkU3VwZXJzZXRBdHRyaWJ1dGVzID0gKFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4pOiBTdXBlcnNldFJlc3VsdCA9PiB7XG4gIGNvbnN0IGF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4gPSB7fTtcbiAgY29uc3QgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4gPSB7fTtcblxuICAvLyBGaXJzdCBwYXNzOiBjb2xsZWN0IGFsbCBmaWVsZHMgcGVyIG9yaWdpbmFsIGtleSBhY3Jvc3MgdmFyaWFudHNcbiAgY29uc3QgZmllbGRzQnlLZXk6IFJlY29yZDxcbiAgICBzdHJpbmcsXG4gICAgQXJyYXk8eyB2YXJpYW50SWQ6IHN0cmluZzsgYXR0ck5hbWU6IHN0cmluZzsgYXR0cjogR3V0ZW5iZXJnQXR0cmlidXRlIH0+XG4gID4gPSB7fTtcblxuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wb25lbnQgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgICBmaWVsZE1hcHNbY29tcG9uZW50LmlkXSA9IHt9O1xuICAgIGNvbnN0IHByZXZpZXdWYWx1ZXMgPSBjb21wb25lbnQucHJldmlld3M/LmdlbmVyaWM/LnZhbHVlcyB8fCB7fTtcblxuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgICBjb25zdCBvcmlnQXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgICAgbGV0IG1hcHBlZCA9IG1hcFByb3BlcnR5VHlwZShwcm9wZXJ0eSwgcHJldmlld1ZhbHVlc1trZXldKTtcblxuICAgICAgLy8gTm9uLWlubmVyQmxvY2tzRmllbGQgcmljaHRleHQgYmVjb21lcyBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgICAgIGlmIChtYXBwZWQgPT09IG51bGwgJiYgcHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgIT09IHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgICAgICBtYXBwZWQgPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBwcmV2aWV3VmFsdWVzW2tleV0gPz8gJycgfTtcbiAgICAgIH1cbiAgICAgIGlmIChtYXBwZWQgPT09IG51bGwpIGNvbnRpbnVlO1xuXG4gICAgICBpZiAoIWZpZWxkc0J5S2V5W2tleV0pIGZpZWxkc0J5S2V5W2tleV0gPSBbXTtcbiAgICAgIGZpZWxkc0J5S2V5W2tleV0ucHVzaCh7IHZhcmlhbnRJZDogY29tcG9uZW50LmlkLCBhdHRyTmFtZTogb3JpZ0F0dHJOYW1lLCBhdHRyOiBtYXBwZWQgfSk7XG4gICAgfVxuXG4gICAgLy8gQWxzbyBjb2xsZWN0IGR5bmFtaWMgYXJyYXkgY29udHJvbCBhdHRyaWJ1dGVzXG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGNvbnN0IGR5bkZpZWxkczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPiA9IHt9O1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1FbmFibGVkYF0gPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUVuYWJsZWRgXSA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9VGF4b25vbXlgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IGR5bkNvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZycgfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVNvdXJjZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ2F1dG8nIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1FbmFibGVkYF0gPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgY29uc3Qgc291cmNlRGVmYXVsdCA9IGR5bkNvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAnbWFudWFsJyA/ICdzZWxlY3QnIDogJ3F1ZXJ5JztcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVNvdXJjZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogc291cmNlRGVmYXVsdCwgZW51bTogWydxdWVyeScsICdzZWxlY3QnLCAnbWFudWFsJ10gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVBvc3RUeXBlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBkeW5Db25maWcuZGVmYXVsdFBvc3RUeXBlIHx8IGR5bkNvbmZpZy5wb3N0VHlwZXNbMF0gfHwgJ3Bvc3QnIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYF0gPSB7IHR5cGU6ICdhcnJheScsIGRlZmF1bHQ6IFtdIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1RdWVyeUFyZ3NgXSA9IHsgdHlwZTogJ29iamVjdCcsIGRlZmF1bHQ6IHsgcG9zdF90eXBlOiBkeW5Db25maWcuZGVmYXVsdFBvc3RUeXBlIHx8IGR5bkNvbmZpZy5wb3N0VHlwZXNbMF0gfHwgJ3Bvc3QnLCBwb3N0c19wZXJfcGFnZTogZHluQ29uZmlnLm1heEl0ZW1zIHx8IDYsIG9yZGVyYnk6ICdkYXRlJywgb3JkZXI6ICdERVNDJywgdGF4X3F1ZXJ5OiBbXSwgLi4uKGR5bkNvbmZpZy5kZWZhdWx0UXVlcnlBcmdzIHx8IHt9KSB9IH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgXSA9IHsgdHlwZTogJ29iamVjdCcsIGRlZmF1bHQ6IGR5bkNvbmZpZy5maWVsZE1hcHBpbmcgfHwge30gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgXSA9IHsgdHlwZTogJ29iamVjdCcsIGRlZmF1bHQ6IHt9IH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1SZW5kZXJNb2RlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBkeW5Db25maWcucmVuZGVyTW9kZSB8fCAnbWFwcGVkJyB9O1xuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IFtkYUtleSwgZGFBdHRyXSBvZiBPYmplY3QuZW50cmllcyhkeW5GaWVsZHMpKSB7XG4gICAgICAgIGlmICghZmllbGRzQnlLZXlbYF9fZHluXyR7ZGFLZXl9YF0pIGZpZWxkc0J5S2V5W2BfX2R5bl8ke2RhS2V5fWBdID0gW107XG4gICAgICAgIGZpZWxkc0J5S2V5W2BfX2R5bl8ke2RhS2V5fWBdLnB1c2goeyB2YXJpYW50SWQ6IGNvbXBvbmVudC5pZCwgYXR0ck5hbWU6IGRhS2V5LCBhdHRyOiBkYUF0dHIgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gU2Vjb25kIHBhc3M6IHJlc29sdmUgY29uZmxpY3RzXG4gIGZvciAoY29uc3QgW2tleSwgZW50cmllc10gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRzQnlLZXkpKSB7XG4gICAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgIC8vIENoZWNrIGlmIGFsbCBlbnRyaWVzIGhhdmUgY29tcGF0aWJsZSB0eXBlc1xuICAgIGNvbnN0IGZpcnN0ID0gZW50cmllc1swXTtcbiAgICBjb25zdCBhbGxDb21wYXRpYmxlID0gZW50cmllcy5ldmVyeSgoZSkgPT4gdHlwZXNBcmVDb21wYXRpYmxlKGZpcnN0LmF0dHIsIGUuYXR0cikpO1xuXG4gICAgaWYgKGFsbENvbXBhdGlibGUpIHtcbiAgICAgIC8vIFNoYXJlZCBvciB1bmlxdWUgZmllbGQg4oCUIHVzZSBvcmlnaW5hbCBuYW1lXG4gICAgICBjb25zdCBtZXJnZWROYW1lID0gZmlyc3QuYXR0ck5hbWU7XG4gICAgICAvLyBVc2UgdGhlIGZpcnN0IHZhcmlhbnQncyBhdHRyaWJ1dGUgZGVmaW5pdGlvbiAoZGVmYXVsdHMgbWF5IGRpZmZlciwgdGFrZSBmaXJzdClcbiAgICAgIGF0dHJpYnV0ZXNbbWVyZ2VkTmFtZV0gPSBmaXJzdC5hdHRyO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmICgha2V5LnN0YXJ0c1dpdGgoJ19fZHluXycpKSB7XG4gICAgICAgICAgZmllbGRNYXBzW2VudHJ5LnZhcmlhbnRJZF1ba2V5XSA9IG1lcmdlZE5hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29uZmxpY3Rpbmcg4oCUIHByZWZpeCB3aXRoIHZhcmlhbnQgc2x1ZyAobXVzdCBiZSB2YWxpZCBKUyBpZGVudGlmaWVyIGZvciBkZXN0cnVjdHVyaW5nKVxuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGNvbnN0IHZhcmlhbnRDYW1lbCA9IHZhcmlhbnRJZFRvQ2FtZWwoZW50cnkudmFyaWFudElkKTtcbiAgICAgICAgY29uc3QgcHJlZml4ZWQgPSB2YXJpYW50Q2FtZWwgKyBlbnRyeS5hdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGVudHJ5LmF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBhdHRyaWJ1dGVzW3ByZWZpeGVkXSA9IGVudHJ5LmF0dHI7XG4gICAgICAgIGlmICgha2V5LnN0YXJ0c1dpdGgoJ19fZHluXycpKSB7XG4gICAgICAgICAgZmllbGRNYXBzW2VudHJ5LnZhcmlhbnRJZF1ba2V5XSA9IHByZWZpeGVkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQWx3YXlzIGFkZCBhbGlnblxuICBhdHRyaWJ1dGVzLmFsaWduID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ2Z1bGwnIH07XG5cbiAgLy8gU3ludGhldGljIG92ZXJsYXlPcGFjaXR5IHdoZW4gdGVtcGxhdGUgdXNlcyBvdmVybGF5IGJ1dCBjb21wb25lbnQgaGFzIG5vIG92ZXJsYXlPcGFjaXR5IHByb3BlcnR5XG4gIC8vIChzaW5nbGUtYmxvY2sgZ2VuZXJhdG9yIGFkZHMgdGhpcyBpbiBibG9jay1qc29uOyBtZXJnZWQgYmxvY2sgbXVzdCBhZGQgaXQgaGVyZSBhbmQgbWFwIGZvciBwcmV2aWV3KVxuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgaWYgKCFjb21wLmNvZGUgfHwgIWNvbXAuY29kZS5pbmNsdWRlcygnb3ZlcmxheScpKSBjb250aW51ZTtcbiAgICBjb25zdCBoYXNJblByb3BzID0gT2JqZWN0LmtleXMoY29tcC5wcm9wZXJ0aWVzIHx8IHt9KS5zb21lKFxuICAgICAgKGspID0+IHRvQ2FtZWxDYXNlKGspID09PSAnb3ZlcmxheU9wYWNpdHknIHx8IGsgPT09ICdvdmVybGF5T3BhY2l0eSdcbiAgICApO1xuICAgIGlmIChoYXNJblByb3BzKSBjb250aW51ZTtcbiAgICBjb25zdCB2YXJpYW50Q2FtZWwgPSB2YXJpYW50SWRUb0NhbWVsKGNvbXAuaWQpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gdmFyaWFudENhbWVsICsgJ092ZXJsYXlPcGFjaXR5JztcbiAgICBhdHRyaWJ1dGVzW2F0dHJOYW1lXSA9IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuNiB9O1xuICAgIGZpZWxkTWFwc1tjb21wLmlkXVsnb3ZlcmxheU9wYWNpdHknXSA9IGF0dHJOYW1lO1xuICB9XG5cbiAgcmV0dXJuIHsgYXR0cmlidXRlcywgZmllbGRNYXBzIH07XG59O1xuXG4vLyDilIDilIDilIAgQmxvY2sgSWNvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgY2hvb3NlR3JvdXBJY29uID0gKGdyb3VwU2x1Zzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qgc2x1ZyA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnaGVybycpKSByZXR1cm4gJ2Zvcm1hdC1pbWFnZSc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdjYXJkJykpIHJldHVybiAnaW5kZXgtY2FyZCc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdmb3JtJykpIHJldHVybiAnZmVlZGJhY2snO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnbmF2JykpIHJldHVybiAnbWVudSc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdmb290ZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYWZ0ZXInO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnaGVhZGVyJykpIHJldHVybiAndGFibGUtcm93LWJlZm9yZSc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdjdGEnKSkgcmV0dXJuICdtZWdhcGhvbmUnO1xuICByZXR1cm4gJ2FkbWluLWN1c3RvbWl6ZXInO1xufTtcblxuY29uc3QgY2hvb3NlVmFyaWFudEljb24gPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogc3RyaW5nID0+IHtcbiAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XG4gIGNvbnN0IGlkID0gY29tcG9uZW50LmlkLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChncm91cC5pbmNsdWRlcygnaGVybycpIHx8IGlkLmluY2x1ZGVzKCdoZXJvJykpIHJldHVybiAnZm9ybWF0LWltYWdlJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdjYXJkJykgfHwgaWQuaW5jbHVkZXMoJ2NhcmQnKSkgcmV0dXJuICdpbmRleC1jYXJkJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdmb3JtJykgfHwgaWQuaW5jbHVkZXMoJ2Zvcm0nKSkgcmV0dXJuICdmZWVkYmFjayc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnbmF2JykgfHwgaWQuaW5jbHVkZXMoJ25hdicpKSByZXR1cm4gJ21lbnUnO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2Zvb3RlcicpIHx8IGlkLmluY2x1ZGVzKCdmb290ZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYWZ0ZXInO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2hlYWRlcicpIHx8IGlkLmluY2x1ZGVzKCdoZWFkZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYmVmb3JlJztcbiAgcmV0dXJuICdhZG1pbi1jdXN0b21pemVyJztcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgYmxvY2suanNvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRCbG9ja0pzb24gPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBzdXBlcnNldEF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+LFxuKTogc3RyaW5nID0+IHtcbiAgLy8gQWRkIGhhbmRvZmZWYXJpYW50IGRpc2NyaW1pbmF0b3JcbiAgY29uc3QgYWxsQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPiA9IHtcbiAgICBoYW5kb2ZmVmFyaWFudDoge1xuICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICBkZWZhdWx0OiB2YXJpYW50c1swXS5jb21wb25lbnQuaWQsXG4gICAgfSxcbiAgICAuLi5zdXBlcnNldEF0dHJzLFxuICB9O1xuXG4gIGNvbnN0IGJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcblxuICBjb25zdCB2YXJpYXRpb25zID0gdmFyaWFudHMubWFwKCh2KSA9PiB7XG4gICAgY29uc3QgY29tcCA9IHYuY29tcG9uZW50O1xuICAgIC8vIEJ1aWxkIGluaXRpYWwgYXR0cmlidXRlIGRlZmF1bHRzIGZvciB0aGlzIHZhcmlhbnRcbiAgICBjb25zdCB2YXJpYW50RGVmYXVsdHM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7IGhhbmRvZmZWYXJpYW50OiBjb21wLmlkIH07XG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IGNvbXAuaWQsXG4gICAgICB0aXRsZTogY29tcC50aXRsZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAoY29tcC5kZXNjcmlwdGlvbiB8fCAnJykucmVwbGFjZSgvXFxuXFxzKy9nLCAnICcpLnRyaW0oKSxcbiAgICAgIGF0dHJpYnV0ZXM6IHZhcmlhbnREZWZhdWx0cyxcbiAgICAgIGlzQWN0aXZlOiBbJ2hhbmRvZmZWYXJpYW50J10sXG4gICAgICAvLyBPbmx5IHNob3cgaW4gaW5zZXJ0ZXI7IHZhcmlhdGlvbiBzd2l0Y2hpbmcgaXMgZG9uZSB2aWEgdGhlIHNpZGViYXIgY29udHJvbCBvbmx5IChubyBUcmFuc2Zvcm0gdG8gdmFyaWF0aW9uKVxuICAgICAgc2NvcGU6IFsnaW5zZXJ0ZXInXSxcbiAgICAgIGljb246IGNob29zZVZhcmlhbnRJY29uKGNvbXApLFxuICAgIH07XG4gIH0pO1xuXG4gIGNvbnN0IGJsb2NrSnNvbjogYW55ID0ge1xuICAgICRzY2hlbWE6ICdodHRwczovL3NjaGVtYXMud3Aub3JnL3RydW5rL2Jsb2NrLmpzb24nLFxuICAgIGFwaVZlcnNpb246IDMsXG4gICAgbmFtZTogYGhhbmRvZmYvJHtibG9ja05hbWV9YCxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIHRpdGxlOiBncm91cFRpdGxlLFxuICAgIGNhdGVnb3J5OiBncm91cFRvQ2F0ZWdvcnkoZ3JvdXBTbHVnKSxcbiAgICBpY29uOiBjaG9vc2VHcm91cEljb24oZ3JvdXBTbHVnKSxcbiAgICBkZXNjcmlwdGlvbjogYCR7Z3JvdXBUaXRsZX0gYmxvY2sgd2l0aCAke3ZhcmlhbnRzLmxlbmd0aH0gdmFyaWF0aW9ucy5gLFxuICAgIGtleXdvcmRzOiBbZ3JvdXBTbHVnXSxcbiAgICB0ZXh0ZG9tYWluOiAnaGFuZG9mZicsXG4gICAgZWRpdG9yU2NyaXB0OiAnZmlsZTouL2luZGV4LmpzJyxcbiAgICBlZGl0b3JTdHlsZTogJ2ZpbGU6Li9pbmRleC5jc3MnLFxuICAgIHN0eWxlOiAnZmlsZTouL3N0eWxlLWluZGV4LmNzcycsXG4gICAgcmVuZGVyOiAnZmlsZTouL3JlbmRlci5waHAnLFxuICAgIGF0dHJpYnV0ZXM6IGFsbEF0dHJpYnV0ZXMsXG4gICAgc3VwcG9ydHM6IHtcbiAgICAgIGFsaWduOiBbJ25vbmUnLCAnd2lkZScsICdmdWxsJ10sXG4gICAgICBodG1sOiBmYWxzZSxcbiAgICB9LFxuICAgIHZhcmlhdGlvbnMsXG4gIH07XG5cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGJsb2NrSnNvbiwgbnVsbCwgMik7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIGluZGV4LmpzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIFJlcGxhY2Ugb2NjdXJyZW5jZXMgb2YgYSByZWdleCBwYXR0ZXJuIG9ubHkgaW4gY29kZSBzZWdtZW50cyxcbiAqIHNraXBwaW5nIGNvbnRlbnQgaW5zaWRlIHF1b3RlZCBzdHJpbmdzIChzaW5nbGUsIGRvdWJsZSwgb3IgYmFja3RpY2spLlxuICogVGhpcyBwcmV2ZW50cyBmaWVsZCBuYW1lIHJlbWFwcGluZyBmcm9tIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gKiBhbmQgb3RoZXIgc3RyaW5nIGxpdGVyYWxzIGluIHRoZSBnZW5lcmF0ZWQgSlNYLlxuICovXG5jb25zdCByZXBsYWNlT3V0c2lkZVN0cmluZ3MgPSAoanN4OiBzdHJpbmcsIHBhdHRlcm46IFJlZ0V4cCwgcmVwbGFjZW1lbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuICBsZXQgaSA9IDA7XG4gIGxldCBpblN0cmluZzogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzZWdTdGFydCA9IDA7XG5cbiAgd2hpbGUgKGkgPCBqc3gubGVuZ3RoKSB7XG4gICAgaWYgKGluU3RyaW5nKSB7XG4gICAgICBpZiAoanN4W2ldID09PSAnXFxcXCcpIHtcbiAgICAgICAgaSArPSAyO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChqc3hbaV0gPT09IGluU3RyaW5nKSB7XG4gICAgICAgIHNlZ21lbnRzLnB1c2goanN4LnNsaWNlKHNlZ1N0YXJ0LCBpICsgMSkpO1xuICAgICAgICBzZWdTdGFydCA9IGkgKyAxO1xuICAgICAgICBpblN0cmluZyA9IG51bGw7XG4gICAgICB9XG4gICAgICBpKys7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChqc3hbaV0gPT09ICdcIicgfHwganN4W2ldID09PSBcIidcIiB8fCBqc3hbaV0gPT09ICdgJykge1xuICAgICAgICBjb25zdCBub25TdHJpbmdQYXJ0ID0ganN4LnNsaWNlKHNlZ1N0YXJ0LCBpKTtcbiAgICAgICAgc2VnbWVudHMucHVzaChub25TdHJpbmdQYXJ0LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpKTtcbiAgICAgICAgc2VnU3RhcnQgPSBpO1xuICAgICAgICBpblN0cmluZyA9IGpzeFtpXTtcbiAgICAgICAgaSsrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChzZWdTdGFydCA8IGpzeC5sZW5ndGgpIHtcbiAgICBjb25zdCByZW1haW5pbmcgPSBqc3guc2xpY2Uoc2VnU3RhcnQpO1xuICAgIGlmIChpblN0cmluZykge1xuICAgICAgc2VnbWVudHMucHVzaChyZW1haW5pbmcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWdtZW50cy5wdXNoKHJlbWFpbmluZy5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNlZ21lbnRzLmpvaW4oJycpO1xufTtcblxuaW50ZXJmYWNlIE1lcmdlZEluZGV4UmVzdWx0IHtcbiAgaW5kZXhKczogc3RyaW5nO1xuICB2YXJpYXRpb25KczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRJbmRleEpzID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgc3VwZXJzZXRBdHRyczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPixcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4gIGFwaVVybD86IHN0cmluZyxcbik6IE1lcmdlZEluZGV4UmVzdWx0ID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIC8vIENvbGxlY3QgYWxsIHVuaXF1ZSBmZWF0dXJlcyBuZWVkZWQgYWNyb3NzIHZhcmlhbnRzXG4gIGxldCBuZWVkc01lZGlhVXBsb2FkID0gZmFsc2U7XG4gIGxldCBuZWVkc1JhbmdlQ29udHJvbCA9IGZhbHNlO1xuICBsZXQgbmVlZHNUb2dnbGVDb250cm9sID0gZmFsc2U7XG4gIGxldCBuZWVkc1NlbGVjdENvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzTGlua0NvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IGhhc0FycmF5UHJvcHMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc0R5bmFtaWNBcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNUYXhvbm9teUFycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55VXNlc0lubmVyQmxvY2tzID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXNSaWNoVGV4dCA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXMxMHVwSW1hZ2UgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBmYWxzZTtcblxuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgdHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2sgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtc3BlY2lmaWMgY29udGVudCAoc2lkZWJhciBwYW5lbHMgKyBwcmV2aWV3KVxuICBpbnRlcmZhY2UgVmFyaWFudEdlblJlc3VsdCB7XG4gICAgcGFuZWxzOiBzdHJpbmc7XG4gICAgcHJldmlld0pzeDogc3RyaW5nO1xuICAgIGFycmF5SGVscGVyczogc3RyaW5nO1xuICAgIGR5bmFtaWNSZXNvbHV0aW9uOiBzdHJpbmc7XG4gICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uOiBzdHJpbmc7XG4gICAgaGFzQnJlYWRjcnVtYnNGZXRjaDogYm9vbGVhbjtcbiAgICBoYXNUYXhvbm9teUZldGNoOiBib29sZWFuO1xuICAgIHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXTtcbiAgICBoYXNMaW5rRmllbGQ6IGJvb2xlYW47XG4gICAgaGFzUmljaFRleHQ6IGJvb2xlYW47XG4gICAgaGFzMTB1cEltYWdlOiBib29sZWFuO1xuICAgIGhhc0lubmVyQmxvY2tzOiBib29sZWFuO1xuICB9XG5cbiAgY29uc3QgdmFyaWFudFJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIFZhcmlhbnRHZW5SZXN1bHQ+ID0ge307XG5cbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICAgIGNvbnN0IHByb3BlcnRpZXMgPSBjb21wLnByb3BlcnRpZXM7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgZHluYW1pY0FycmF5Q29uZmlncyA9IHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncztcbiAgICBjb25zdCBoYXNEeW5hbWljID0gT2JqZWN0LmtleXMoZHluYW1pY0FycmF5Q29uZmlncykubGVuZ3RoID4gMDtcblxuICAgIC8vIERldGVjdCBmZWF0dXJlIG5lZWRzXG4gICAgaWYgKGhhc1Byb3BlcnR5VHlwZShwcm9wZXJ0aWVzLCAnaW1hZ2UnKSkgbmVlZHNNZWRpYVVwbG9hZCA9IHRydWU7XG4gICAgaWYgKGhhc1Byb3BlcnR5VHlwZShwcm9wZXJ0aWVzLCAnbnVtYmVyJykgfHwgY29tcC5jb2RlLmluY2x1ZGVzKCdvdmVybGF5JykpIG5lZWRzUmFuZ2VDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNUb2dnbGVDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdzZWxlY3QnKSkgbmVlZHNTZWxlY3RDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNMaW5rQ29udHJvbCA9IHRydWU7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZSgocCkgPT4gcC50eXBlID09PSAnYXJyYXknKSkgaGFzQXJyYXlQcm9wcyA9IHRydWU7XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGNvbnN0IGhhc1Bvc3RzRHluYW1pYyA9IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSk7XG4gICAgICBpZiAoaGFzUG9zdHNEeW5hbWljKSB7IGFueUhhc0R5bmFtaWNBcnJheXMgPSB0cnVlOyBuZWVkc1NlbGVjdENvbnRyb2wgPSB0cnVlOyB9XG4gICAgICAvLyBCcmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIHVzZSBzaGFyZWQgY29tcG9uZW50cyDigJQgdGhleSBpbXBvcnQgdGhlaXIgb3duXG4gICAgICAvLyBUb2dnbGVDb250cm9sL1NlbGVjdENvbnRyb2wsIHNvIHdlIGRvIG5vdCBuZWVkIHRvIGFkZCB0aG9zZSB0byB0aGUgZ3JvdXAgYmxvY2sgaW1wb3J0cy5cbiAgICAgIGlmIChPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpKSBhbnlIYXNCcmVhZGNydW1ic0FycmF5cyA9IHRydWU7XG4gICAgICBpZiAoT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKSkgYW55SGFzVGF4b25vbXlBcnJheXMgPSB0cnVlO1xuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKSkgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IHRydWU7XG4gICAgfVxuICAgIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGFueVVzZXNJbm5lckJsb2NrcyA9IHRydWU7XG5cbiAgICAvLyBHZW5lcmF0ZSBwcmV2aWV3IChndWFyZCBhZ2FpbnN0IG1pc3NpbmcgY29kZS90aXRsZSBmcm9tIEFQSSlcbiAgICBjb25zdCBwcmV2aWV3UmVzdWx0OiBKc3hQcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgICAgY29tcC5jb2RlID8/ICcnLFxuICAgICAgcHJvcGVydGllcyxcbiAgICAgIGNvbXAuaWQgPz8gY29tcC50aXRsZSA/PyAndmFyaWFudCcsXG4gICAgICBjb21wLnRpdGxlID8/IGNvbXAuaWQgPz8gJ1ZhcmlhbnQnLFxuICAgICAgdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkLFxuICAgICk7XG4gICAgbGV0IHByZXZpZXdKc3ggPSBwcmV2aWV3UmVzdWx0LmpzeCA/PyAnJztcbiAgICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgICBjb25zdCB2YXJIYXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuICAgIGNvbnN0IHZhckhhc1JpY2hUZXh0ID0gcHJldmlld0pzeC5pbmNsdWRlcygnPFJpY2hUZXh0Jyk7XG4gICAgY29uc3QgdmFySGFzMTB1cEltYWdlID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJyk7XG4gICAgY29uc3QgdmFySGFzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgICBpZiAodmFySGFzTGlua0ZpZWxkKSBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHRydWU7XG4gICAgaWYgKHZhckhhc1JpY2hUZXh0KSBhbnlQcmV2aWV3VXNlc1JpY2hUZXh0ID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzMTB1cEltYWdlKSBhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSA9IHRydWU7XG4gICAgaWYgKHZhckhhc0lubmVyQmxvY2tzKSBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gdHJ1ZTtcblxuICAgIC8vIFJlbWFwIGF0dHJpYnV0ZSByZWZlcmVuY2VzIGluIHByZXZpZXcgSlNYIHVzaW5nIGZpZWxkTWFwLlxuICAgIC8vIFVzZXMgcmVwbGFjZU91dHNpZGVTdHJpbmdzIHRvIGF2b2lkIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gICAgLy8gYW5kIG90aGVyIHN0cmluZyBsaXRlcmFscyB0aGF0IGhhcHBlbiB0byBjb250YWluIHRoZSBmaWVsZCBuYW1lLlxuICAgIGZvciAoY29uc3QgW29yaWdLZXksIG1lcmdlZE5hbWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwKSkge1xuICAgICAgY29uc3Qgb3JpZ0NhbWVsID0gdG9DYW1lbENhc2Uob3JpZ0tleSk7XG4gICAgICBpZiAob3JpZ0NhbWVsICE9PSBtZXJnZWROYW1lKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke29yaWdDYW1lbH1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSByZXBsYWNlT3V0c2lkZVN0cmluZ3MocHJldmlld0pzeCwgcmVnZXgsIG1lcmdlZE5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIHBhbmVscyBmb3Igc2lkZWJhciBjb250cm9sc1xuICAgIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIGlmIChpbmxpbmVFZGl0YWJsZUZpZWxkcy5oYXMoa2V5KSAmJiBwcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcblxuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHttZXJnZWRBdHRyTmFtZX1cIlxuICAgICAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gICAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWw6IHN0cmluZykgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAgICcsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ1VSTCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLnVybCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgdXJsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPmA7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke21lcmdlZEF0dHJOYW1lfVwiXG4gICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRUYXhvbm9teT1cIiR7ZGVmYXVsdFRheG9ub215fVwiXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgICAgICA8PlxuJHtpdGVtRmllbGRzfVxuICAgICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8UGFnaW5hdGlvblNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7bWVyZ2VkQXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgICAgY29uc3QgZGVmYXVsdE1vZGUgPSBkeW5hbWljQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICAgIGlmIChjLm1vZGUgPT09ICd1aScpIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lLCBsYWJlbDogYy5sYWJlbCwgdHlwZTogJ3NlbGVjdCcsIG9wdGlvbnM6IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoYy5vcHRpb25zKSwgZGVmYXVsdDogYy5kZWZhdWx0IH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IGR5bmFtaWNDb25maWcuZmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgICBjb25zdCB0b3BLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICAgIGxldCBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgICBpZiAoaXRlbVByb3ApIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6IGNvbnRyb2xUeXBlID0gJ3NlbGVjdCc7IG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOiBjb250cm9sVHlwZSA9ICd0b2dnbGUnOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOiBjb250cm9sVHlwZSA9ICdudW1iZXInOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyAwOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGNvbnRyb2xUeXBlID0gJ3RleHQnOyBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgfHwgJyR7ZGVmYXVsdE1vZGV9JyxcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9zdHM6ICR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhuZXh0VmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoe1xuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJnczogeyAuLi5uZXh0VmFsdWUucXVlcnlBcmdzLCBwb3N0X3R5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgICAgIG1heEl0ZW1zOiAke2R5bmFtaWNDb25maWcubWF4SXRlbXMgPz8gMjB9LFxuICAgICAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICAgICAgc2hvd0V4Y2x1ZGVDdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgeyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJyAmJiAoXG4gICAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICB7LyogTWFudWFsIGFycmF5IGNvbnRyb2xzICovfVxuICAgICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xJbmRlbnQgPSAnICAgICAgICAgICAgICAgICc7XG4gICAgICAgIGxldCBjb250cm9sT3V0cHV0OiBzdHJpbmc7XG4gICAgICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgICAgY29udHJvbE91dHB1dCA9IGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIG1lcmdlZEF0dHJOYW1lLCBsYWJlbCwgY29udHJvbEluZGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBtZXJnZWRBdHRyTmFtZSxcbiAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlOiBzdHJpbmcpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHttZXJnZWRBdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICAgICAgICAgIGluZGVudDogY29udHJvbEluZGVudCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNvbnRyb2xPdXRwdXQgPSBnZW5lcmF0ZUZpZWxkQ29udHJvbChrZXksIHByb3BlcnR5LCBjdHgpO1xuICAgICAgICB9XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4ke2NvbnRyb2xPdXRwdXR9XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFN5bnRoZXRpYyBvdmVybGF5IG9wYWNpdHkgcGFuZWwgKHdoZW4gdGVtcGxhdGUgdXNlcyBvdmVybGF5IGJ1dCBjb21wb25lbnQgaGFzIG5vIG92ZXJsYXlPcGFjaXR5IHByb3BlcnR5KVxuICAgIGlmIChmaWVsZE1hcFsnb3ZlcmxheU9wYWNpdHknXSkge1xuICAgICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFsnb3ZlcmxheU9wYWNpdHknXTtcbiAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCdPdmVybGF5JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT5cbiAgICAgICAgICAgICAgICA8UmFuZ2VDb250cm9sXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ092ZXJsYXkgT3BhY2l0eScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICB2YWx1ZT17JHttZXJnZWRBdHRyTmFtZX0gPz8gMC42fVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7bWVyZ2VkQXR0ck5hbWV9OiB2YWx1ZSB9KX1cbiAgICAgICAgICAgICAgICAgIG1pbj17MH1cbiAgICAgICAgICAgICAgICAgIG1heD17MX1cbiAgICAgICAgICAgICAgICAgIHN0ZXA9ezAuMX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG5cbiAgICAvLyBEZXNpZ24gU3lzdGVtIGxpbmtzIHBhbmVsIChwZXItdmFyaWFudCBjb21wb25lbnQgVVJMcylcbiAgICBsZXQgaGFuZG9mZlVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGlmIChhcGlVcmwpIHtcbiAgICAgIGNvbnN0IGJhc2VVcmwgPSBhcGlVcmwucmVwbGFjZSgvXFwvYXBpXFwvPyQvLCAnJyk7XG4gICAgICBoYW5kb2ZmVXJsID0gYCR7YmFzZVVybH0vc3lzdGVtL2NvbXBvbmVudC8ke2NvbXAuaWR9YDtcbiAgICB9IGVsc2UgaWYgKGNvbXAucHJldmlldykge1xuICAgICAgaGFuZG9mZlVybCA9IGNvbXAucHJldmlldztcbiAgICB9XG4gICAgY29uc3QgZmlnbWFVcmwgPSBjb21wLmZpZ21hO1xuICAgIGlmIChoYW5kb2ZmVXJsIHx8IGZpZ21hVXJsKSB7XG4gICAgICBjb25zdCBsaW5rQnV0dG9uczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChoYW5kb2ZmVXJsKSB7XG4gICAgICAgIGxpbmtCdXR0b25zLnB1c2goYCAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9XCIke2hhbmRvZmZVcmx9XCJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCJcbiAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiXG4gICAgICAgICAgICAgICAgICAgIGljb249XCJ2aXNpYmlsaXR5XCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtfXygnVmlldyBpbiBIYW5kb2ZmJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPmApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZ21hVXJsKSB7XG4gICAgICAgIGxpbmtCdXR0b25zLnB1c2goYCAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9XCIke2ZpZ21hVXJsfVwiXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIlxuICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtfXygnT3BlbiBpbiBGaWdtYScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICA8L0J1dHRvbj5gKTtcbiAgICAgIH1cbiAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCdEZXNpZ24gU3lzdGVtJywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT5cbiAgICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtsaW5rQnV0dG9ucy5qb2luKCdcXG4nKX1cbiAgICAgICAgICAgICAgICA8L0ZsZXg+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgIH1cblxuICAgIC8vIER5bmFtaWMgYXJyYXkgcmVzb2x1dGlvbiBjb2RlXG4gICAgLy8gU3BlY2lhbGl6ZWQgYXJyYXlzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uKSByZXNvbHZlIGluIHRoZVxuICAgIC8vIHZhcmlhdGlvbiBmaWxlJ3MgUHJldmlldyBmdW5jdGlvbiBzbyB0aGUgaG9va3MgbGl2ZSBpbiB0aGUgY29ycmVjdCBzY29wZS5cbiAgICAvLyBEeW5hbWljIHBvc3QgYXJyYXlzIHJlc29sdmUgaW4gdGhlIG1haW4gaW5kZXguanMgZWRpdCgpLlxuICAgIGxldCBkeW5hbWljUmVzb2x1dGlvbiA9ICcnO1xuICAgIGxldCBzcGVjaWFsaXplZFJlc29sdXRpb24gPSAnJztcbiAgICBsZXQgdmFySGFzQnJlYWRjcnVtYnNGZXRjaCA9IGZhbHNlO1xuICAgIGxldCB2YXJIYXNUYXhvbm9teUZldGNoID0gZmFsc2U7XG4gICAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGRLZXldIHx8IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICAgIHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNhcCA9IG1lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCddKTtcbiAgICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgIDogJyc7XG4gICAgICAgICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uICs9IGBcbiAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCEke21lcmdlZEF0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgaWYgKCFwb3N0SWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgIC5jYXRjaCgoKSA9PiBzZXRQcmV2aWV3JHtjYXB9KFtdKSk7XG4gIH0sIFske21lcmdlZEF0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgICAgdmFySGFzVGF4b25vbXlGZXRjaCA9IHRydWU7XG4gICAgICAgICAgY29uc3QgY2FwID0gbWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJywgJ3NsdWcnXSk7XG4gICAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKcyA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYCA6ICcnO1xuICAgICAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbiArPSBgXG4gIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgKHNlbGVjdCkgPT4ge1xuICAgICAgaWYgKCEke21lcmdlZEF0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke21lcmdlZEF0dHJOYW1lfSB8fCBbXTtcbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgY29uc3QgdGF4b25vbXkgPSAke21lcmdlZEF0dHJOYW1lfVRheG9ub215IHx8ICcke2R5bkNvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgIGNvbnN0IHJlc3RCYXNlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldFRheG9ub215KHRheG9ub215KT8ucmVzdF9iYXNlO1xuICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2R5bkNvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICBpZiAoIXRlcm1zKSByZXR1cm4gW107XG4gICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgfSxcbiAgICBbJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkLCAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSwgJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX0gfHwgW10pXVxuICApO1xuYDtcbiAgICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke21lcmdlZEF0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZHxTb3VyY2V8VGF4b25vbXkpYCwgJ2cnKTtcbiAgICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24gKz0gYFxuICBjb25zdCBwcmV2aWV3JHttZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpfSA9IFtdOyAvLyBQYWdpbmF0aW9uIHJlbmRlcnMgb24gdGhlIGZyb250ZW5kXG5gO1xuICAgICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7bWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjYXAgPSBtZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCBwcmV2aWV3VmFyTmFtZSA9IGBwcmV2aWV3JHtjYXB9YDtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICAgIHJlc29sdmluZ0ZsYWdzLnB1c2gocmVzb2x2aW5nVmFyTmFtZSk7XG4gICAgICAgIGR5bmFtaWNSZXNvbHV0aW9uICs9IGBcbiAgICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBzZWxlY3QoY29yZURhdGFTdG9yZSk7XG4gICAgICAgICAgaWYgKCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAncXVlcnknKSB7XG4gICAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZSB8fCAncG9zdCc7XG4gICAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7ZHluQ29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgICBvcmRlcmJ5OiBxdWVyeUFyZ3Mub3JkZXJieSB8fCAnZGF0ZScsXG4gICAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgICBzdGF0dXM6ICdwdWJsaXNoJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgICBpZiAocmVjb3JkcyA9PT0gbnVsbCB8fCByZWNvcmRzID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke21lcmdlZEF0dHJOYW1lfUZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgICBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW107XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7bWVyZ2VkQXR0ck5hbWV9RmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlYyA9IHN0b3JlLmdldEVudGl0eVJlY29yZCgncG9zdFR5cGUnLCBzZWwudHlwZSB8fCAncG9zdCcsIHNlbC5pZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9LFxuICAgICAgICBbJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UsICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9UXVlcnlBcmdzIHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdKSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1GaWVsZE1hcHBpbmcgfHwge30pLCBKU09OLnN0cmluZ2lmeSgke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge30pXVxuICAgICAgKTtcbiAgICAgIGNvbnN0ICR7cHJldmlld1Zhck5hbWV9ID0gJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHttZXJnZWRBdHRyTmFtZX0gPz8gW10pO1xuICAgICAgY29uc3QgJHtyZXNvbHZpbmdWYXJOYW1lfSA9ICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAgIC8vIFJlbWFwIGluIHByZXZpZXdcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFycmF5IGhlbHBlcnNcbiAgICBjb25zdCBhcnJheUhlbHBlcnMgPSBnZW5lcmF0ZUFycmF5SGVscGVyc01lcmdlZChwcm9wZXJ0aWVzLCBmaWVsZE1hcCk7XG5cbiAgICB2YXJpYW50UmVzdWx0c1tjb21wLmlkXSA9IHtcbiAgICAgIHBhbmVsczogcGFuZWxzLmpvaW4oJ1xcblxcbicpLFxuICAgICAgcHJldmlld0pzeCxcbiAgICAgIGFycmF5SGVscGVycyxcbiAgICAgIGR5bmFtaWNSZXNvbHV0aW9uOiBkeW5hbWljUmVzb2x1dGlvbixcbiAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbixcbiAgICAgIGhhc0JyZWFkY3J1bWJzRmV0Y2g6IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gsXG4gICAgICBoYXNUYXhvbm9teUZldGNoOiB2YXJIYXNUYXhvbm9teUZldGNoLFxuICAgICAgcmVzb2x2aW5nRmxhZ3MsXG4gICAgICBoYXNMaW5rRmllbGQ6IHZhckhhc0xpbmtGaWVsZCxcbiAgICAgIGhhc1JpY2hUZXh0OiB2YXJIYXNSaWNoVGV4dCxcbiAgICAgIGhhczEwdXBJbWFnZTogdmFySGFzMTB1cEltYWdlLFxuICAgICAgaGFzSW5uZXJCbG9ja3M6IHZhckhhc0lubmVyQmxvY2tzLFxuICAgIH07XG4gIH1cblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTWVkaWFVcGxvYWQnLCAnTWVkaWFVcGxvYWRDaGVjaycsICdNZWRpYVJlcGxhY2VGbG93Jyk7XG4gIGlmIChhbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcykgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIGlmIChuZWVkc0xpbmtDb250cm9sIHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuICBpZiAoKGFueVByZXZpZXdVc2VzUmljaFRleHQgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nLCAnU2VsZWN0Q29udHJvbCcsICdEcm9wZG93bk1lbnUnXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgaWYgKGFueUhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuICBjb21wb25lbnRJbXBvcnRzLnB1c2goJ0ZsZXgnKTtcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIGZvciBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IHByb3BlcnRpZXMgYWNyb3NzIGFsbCB2YXJpYW50c1xuICBjb25zdCBhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA9IHZhcmlhbnRzLnNvbWUoKHYpID0+XG4gICAgT2JqZWN0LmVudHJpZXModi5jb21wb25lbnQucHJvcGVydGllcykuc29tZShcbiAgICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXYuZHluYW1pY0FycmF5Q29uZmlnc1trXSB8fCAhKCdhcnJheVR5cGUnIGluIHYuZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICAgKVxuICApO1xuICBjb25zdCB0ZW5VcEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cykgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIGlmIChhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSkgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDAgPyBgaW1wb3J0IHsgJHt0ZW5VcEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gIDogJyc7XG5cbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoYW55SGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoYW55SGFzQnJlYWRjcnVtYnNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmIChhbnlIYXNUYXhvbm9teUFycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGFueUhhc1BhZ2luYXRpb25BcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBhbnlIYXNEeW5hbWljQXJyYXlzIHx8IGFueUhhc1RheG9ub215QXJyYXlzO1xuICBpZiAobmVlZHNEYXRhU3RvcmUpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IHVzZVNlbGVjdCR7YW55SGFzQnJlYWRjcnVtYnNBcnJheXMgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cbiAgaWYgKGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gO1xuICB9XG5cbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChhbnlIYXNCcmVhZGNydW1ic0FycmF5cykge1xuICAgIGVsZW1lbnRJbXBvcnRzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuICB9XG5cbiAgLy8gQWxsIGF0dHJpYnV0ZSBuYW1lcyBmb3IgZGVzdHJ1Y3R1cmluZ1xuICBjb25zdCBhbGxBdHRyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgYWxsQXR0ck5hbWVzLmFkZCgnaGFuZG9mZlZhcmlhbnQnKTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBPYmplY3Qua2V5cyhzdXBlcnNldEF0dHJzKSkge1xuICAgIGFsbEF0dHJOYW1lcy5hZGQoYXR0ck5hbWUpO1xuICB9XG4gIC8vIEFsc28gYWRkIGR5bmFtaWMgYXJyYXkgZGVyaXZlZCBhdHRyaWJ1dGUgbmFtZXNcbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gZmllbGRNYXBzW3ZhcmlhbnQuY29tcG9uZW50LmlkXVtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRvb2xiYXIgdmFyaWF0aW9uIHN3aXRjaGVyIGNvbnRyb2xzIChmb3IgQmxvY2tDb250cm9scyBEcm9wZG93bk1lbnUpXG4gIGNvbnN0IHRvb2xiYXJWYXJpYW50Q29udHJvbHMgPSB2YXJpYW50c1xuICAgIC5tYXAoXG4gICAgICAodikgPT5cbiAgICAgICAgYCAgICAgICAgeyB0aXRsZTogJyR7KHYuY29tcG9uZW50LnRpdGxlID8/IHYuY29tcG9uZW50LmlkID8/ICcnKS50b1N0cmluZygpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCBvbkNsaWNrOiAoKSA9PiBzZXRBdHRyaWJ1dGVzKHsgaGFuZG9mZlZhcmlhbnQ6ICcke3YuY29tcG9uZW50LmlkID8/ICcnfScgfSkgfWAsXG4gICAgKVxuICAgIC5qb2luKCcsXFxuJyk7XG5cbiAgLy8gQ29sbGVjdCBhbGwgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lcyB0aGF0IGFyZSBhcnJheSB0eXBlIChhY3Jvc3MgYWxsIHZhcmlhbnRzKSBzbyB3ZSBlbWl0IGVhY2ggaGVscGVyIG9uY2VcbiAgY29uc3QgYWxsQXJyYXlNZXJnZWROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF07XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JykgYWxsQXJyYXlNZXJnZWROYW1lcy5hZGQoZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2hhcmVkQXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMoYWxsQXJyYXlNZXJnZWROYW1lcyk7XG5cbiAgLy8gVmFyaWF0aW9uIGluY2x1ZGUgaW1wb3J0cyBhbmQgY29tcG9uZW50IHVzYWdlIChvbmUgZmlsZSBwZXIgdmFyaWFudClcbiAgY29uc3QgdmFyaWFudEltcG9ydExpbmVzID0gdmFyaWFudHMubWFwKFxuICAgICh2KSA9PiBgaW1wb3J0ICogYXMgJHt2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCl9IGZyb20gJy4vdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfSc7YCxcbiAgKTtcbiAgY29uc3QgaGVscGVyTmFtZXNMaXN0ID0gWy4uLmFsbEFycmF5TWVyZ2VkTmFtZXNdLm1hcChcbiAgICAoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWAsXG4gICk7XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgaGVscGVyTmFtZXNMaXN0LnB1c2goJ0hhbmRvZmZMaW5rRmllbGQnKTtcbiAgaWYgKGFueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzKSBoZWxwZXJOYW1lc0xpc3QucHVzaCgnQ09OVEVOVF9CTE9DS1MnKTtcbiAgY29uc3QgaGVscGVyc09iamVjdExpbmUgPVxuICAgIGhlbHBlck5hbWVzTGlzdC5sZW5ndGggPiAwXG4gICAgICA/IGAgICAgY29uc3QgaGVscGVycyA9IHsgJHtoZWxwZXJOYW1lc0xpc3Quam9pbignLCAnKX0gfTtgXG4gICAgICA6ICcgICAgY29uc3QgaGVscGVycyA9IHt9Oyc7XG5cbiAgY29uc3QgdmFyaWFudFBhbmVsQmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgICBpZiAoIXJlc3VsdC5wYW5lbHMudHJpbSgpKSByZXR1cm4gJyc7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHt2LmNvbXBvbmVudC5pZH0nICYmIDwke1Bhc2NhbH0uUGFuZWxzIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIGNvbnN0IHZhcmlhbnRQcmV2aWV3QmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAgICB7aGFuZG9mZlZhcmlhbnQgPT09ICcke3YuY29tcG9uZW50LmlkfScgJiYgPCR7UGFzY2FsfS5QcmV2aWV3IGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuam9pbignXFxuJyk7XG5cbiAgLy8gUGVyLXZhcmlhbnQgSlMgaW5jbHVkZSBmaWxlIGNvbnRlbnRzICh3cml0dGVuIHRvIHZhcmlhdGlvbnMvPGlkPi5qcylcbiAgY29uc3QgdmFyaWF0aW9uSnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW3YuY29tcG9uZW50LmlkXTtcbiAgICBjb25zdCBoZWxwZXJOYW1lcyA9IFsuLi5hbGxBcnJheU1lcmdlZE5hbWVzXVxuICAgICAgLmZpbHRlcigoYXR0ck5hbWUpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgKGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF1ba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKSA9PT0gYXR0ck5hbWUpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLm1hcCgoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWApO1xuICAgIHZhcmlhdGlvbkpzW3YuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudEpzRmlsZUNvbnRlbnQoXG4gICAgICB2LFxuICAgICAgcmVzdWx0LFxuICAgICAgZmllbGRNYXAsXG4gICAgICBoZWxwZXJOYW1lcyxcbiAgICAgIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkLFxuICAgICk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50LWNvbmRpdGlvbmFsIGR5bmFtaWMgcmVzb2x1dGlvbiArIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgdmFyaWFudER5bmFtaWNCbG9ja3MgPSB2YXJpYW50cy5tYXAoKHYpID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgY29uc3QgY29kZSA9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbiArIHJlc3VsdC5hcnJheUhlbHBlcnM7XG4gICAgaWYgKCFjb2RlLnRyaW0oKSkgcmV0dXJuICcnO1xuICAgIHJldHVybiBgICAgIGlmIChoYW5kb2ZmVmFyaWFudCA9PT0gJyR7di5jb21wb25lbnQuaWR9Jykge1xuJHtjb2RlfVxuICAgIH1gO1xuICB9KS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgLy8gRm9yIGR5bmFtaWMgcmVzb2x1dGlvbiwgd2UgbmVlZCB0aGUgdmFyaWFibGVzIHRvIGJlIGRlY2xhcmVkIGluIGEgc2NvcGUgdmlzaWJsZSB0byB0aGUgcHJldmlld1xuICAvLyBXZSdsbCB1c2UgYSBkaWZmZXJlbnQgYXBwcm9hY2g6IGRlY2xhcmUgYWxsIGF0IHRvcCwgY29uZGl0aW9uYWxseSBwb3B1bGF0ZVxuICBjb25zdCBhbGxSZXNvbHZpbmdGbGFncyA9IHZhcmlhbnRzLmZsYXRNYXAoKHYpID0+IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXS5yZXNvbHZpbmdGbGFncyk7XG4gIGNvbnN0IGhhc0FueVJlc29sdmluZyA9IGFsbFJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDA7XG5cbiAgLy8gR2VuZXJhdGUgZHluYW1pYyByZXNvbHV0aW9uIHBlciB2YXJpYW50OyBhcnJheSBoZWxwZXJzIGFyZSBlbWl0dGVkIG9uY2UgYWJvdmUgKHNoYXJlZEFycmF5SGVscGVycylcbiAgbGV0IGNvbWJpbmVkRHluYW1pY0NvZGUgPSBzaGFyZWRBcnJheUhlbHBlcnMudHJpbSgpID8gYFxcbiR7c2hhcmVkQXJyYXlIZWxwZXJzfWAgOiAnJztcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGlmIChyZXN1bHQuZHluYW1pY1Jlc29sdXRpb24udHJpbSgpKSB7XG4gICAgICBjb21iaW5lZER5bmFtaWNDb2RlICs9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBhdHRyTmFtZXNMaXN0ID0gQXJyYXkuZnJvbShhbGxBdHRyTmFtZXMpO1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtY29uZGl0aW9uYWwgTWVkaWFSZXBsYWNlRmxvdyB0b29sYmFyIGVudHJpZXMgZm9yIGltYWdlIGZpZWxkc1xuICBjb25zdCB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdi5jb21wb25lbnQ7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgaW1hZ2VFbnRyaWVzOiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IG1lcmdlZEF0dHJOYW1lOiBzdHJpbmcgfT4gPSBbXTtcblxuICAgIGNvbnN0IGNvbGxlY3RJbWFnZXMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWROYW1lID0gcGFyZW50UGF0aFxuICAgICAgICAgID8gYCR7ZmllbGRNYXBbcGFyZW50UGF0aF0gfHwgdG9DYW1lbENhc2UocGFyZW50UGF0aCl9YFxuICAgICAgICAgIDogKGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KSk7XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgICBpbWFnZUVudHJpZXMucHVzaCh7XG4gICAgICAgICAgICBsYWJlbDogcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSksXG4gICAgICAgICAgICBtZXJnZWRBdHRyTmFtZTogcGFyZW50UGF0aCA/IG1lcmdlZE5hbWUgOiBtZXJnZWROYW1lLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgIGNvbGxlY3RJbWFnZXMocHJvcC5wcm9wZXJ0aWVzLCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICBjb2xsZWN0SW1hZ2VzKGNvbXAucHJvcGVydGllcyk7XG5cbiAgICBpZiAoaW1hZ2VFbnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IG1lZGlhRmxvd3MgPSBpbWFnZUVudHJpZXMubWFwKChpbWcpID0+XG4gICAgICAgIGAgICAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgICBtZWRpYUlkPXske2ltZy5tZXJnZWRBdHRyTmFtZX0/LmlkfVxuICAgICAgICAgICAgICBtZWRpYVVybD17JHtpbWcubWVyZ2VkQXR0ck5hbWV9Py5zcmN9XG4gICAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7aW1nLm1lcmdlZEF0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0pfVxuICAgICAgICAgICAgICBuYW1lPXtfXygnJHtpbWcubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIC8+YFxuICAgICAgKS5qb2luKCdcXG4nKTtcbiAgICAgIHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MucHVzaChcbiAgICAgICAgYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHtjb21wLmlkfScgJiYgKFxcbiAgICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XFxuJHttZWRpYUZsb3dzfVxcbiAgICAgICAgICA8L0Jsb2NrQ29udHJvbHM+XFxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1lZGlhUmVwbGFjZUpzeCA9IHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MubGVuZ3RoID4gMFxuICAgID8gJ1xcbicgKyB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzLmpvaW4oJ1xcbicpXG4gICAgOiAnJztcblxuICBjb25zdCBpbmRleEpzVGVtcGxhdGUgPSBgaW1wb3J0IHsgcmVnaXN0ZXJCbG9ja1R5cGUgfSBmcm9tICdAd29yZHByZXNzL2Jsb2Nrcyc7XG5pbXBvcnQgeyBcbiAgJHtibG9ja0VkaXRvckltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic7XG5pbXBvcnQgeyBcbiAgJHtjb21wb25lbnRJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9jb21wb25lbnRzJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2VsZW1lbnQnO1xuJHt0ZW5VcEltcG9ydH0ke3NoYXJlZENvbXBvbmVudEltcG9ydH1pbXBvcnQgbWV0YWRhdGEgZnJvbSAnLi9ibG9jay5qc29uJztcbmltcG9ydCAnLi9lZGl0b3Iuc2Nzcyc7XG4ke2FueUhhc0R5bmFtaWNBcnJheXMgPyBcImltcG9ydCAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvRHluYW1pY1Bvc3RTZWxlY3Rvci5lZGl0b3Iuc2Nzcyc7XFxuXCIgOiAnJ31pbXBvcnQgJy4vc3R5bGUuc2Nzcyc7XG4ke3ZhcmlhbnRJbXBvcnRMaW5lcy5qb2luKCdcXG4nKX1cbnJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsXG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXNMaXN0LmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtjb21iaW5lZER5bmFtaWNDb2RlfVxuJHtoZWxwZXJzT2JqZWN0TGluZX1cbiAgICByZXR1cm4gKFxuICAgICAgPEZyYWdtZW50PlxuICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cImJsb2NrXCI+XG4gICAgICAgICAgPERyb3Bkb3duTWVudVxuICAgICAgICAgICAgaWNvbj1cImxheW91dFwiXG4gICAgICAgICAgICBsYWJlbD17X18oJ1ZhcmlhdGlvbicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICBjb250cm9scz17W1xuJHt0b29sYmFyVmFyaWFudENvbnRyb2xzfVxuICAgICAgICAgICAgXX1cbiAgICAgICAgICAvPlxuICAgICAgICA8L0Jsb2NrQ29udHJvbHM+JHttZWRpYVJlcGxhY2VKc3h9XG4gICAgICAgIDxJbnNwZWN0b3JDb250cm9scz5cbiR7dmFyaWFudFBhbmVsQmxvY2tzfVxuICAgICAgICA8L0luc3BlY3RvckNvbnRyb2xzPlxuXG4gICAgICAgIHsvKiBFZGl0b3IgUHJldmlldyAqL31cbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4ke3ZhcmlhbnRQcmV2aWV3QmxvY2tzfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvRnJhZ21lbnQ+XG4gICAgKTtcbiAgfSxcbiAgc2F2ZTogKCkgPT4ge1xuJHthbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcyA/ICcgICAgcmV0dXJuIDxJbm5lckJsb2Nrcy5Db250ZW50IC8+OycgOiAnICAgIHJldHVybiBudWxsOyd9XG4gIH0sXG59KTtcbmA7XG4gIHJldHVybiB7IGluZGV4SnM6IGluZGV4SnNUZW1wbGF0ZSwgdmFyaWF0aW9uSnMgfTtcbn07XG5cbi8vIOKUgOKUgOKUgCBIZWxwZXIgZ2VuZXJhdG9ycyBmb3IgbWVyZ2VkIGNvbnRleHQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlQXJyYXlIZWxwZXJzTWVyZ2VkID0gKFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBmaWVsZE1hcDogRmllbGRNYXAsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBoZWxwZXJzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3AudHlwZSAhPT0gJ2FycmF5JykgY29udGludWU7XG4gICAgY29uc3QgYXR0ck5hbWUgPSBmaWVsZE1hcFtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgaGVscGVycy5wdXNoKGBcbiAgICBjb25zdCB1cGRhdGUke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9SXRlbSA9IChpbmRleCwgZmllbGQsIHZhbHVlKSA9PiB7XG4gICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4oJHthdHRyTmFtZX0gfHwgW10pXTtcbiAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCBbZmllbGRdOiB2YWx1ZSB9O1xuICAgICAgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICB9O2ApO1xuICB9XG4gIHJldHVybiBoZWxwZXJzLmpvaW4oJ1xcbicpO1xufTtcblxuLyoqIEdlbmVyYXRlIGFycmF5IHVwZGF0ZSBoZWxwZXJzIG9uY2UgcGVyIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAoYXZvaWRzIGR1cGxpY2F0ZSBkZWNsYXJhdGlvbnMgYWNyb3NzIHZhcmlhbnRzKS4gKi9cbmNvbnN0IGdlbmVyYXRlU2hhcmVkQXJyYXlIZWxwZXJzID0gKG1lcmdlZEFycmF5QXR0ck5hbWVzOiBTZXQ8c3RyaW5nPik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhlbHBlcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgYXR0ck5hbWUgb2YgbWVyZ2VkQXJyYXlBdHRyTmFtZXMpIHtcbiAgICBjb25zdCBoZWxwZXJOYW1lID0gYHVwZGF0ZSR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1JdGVtYDtcbiAgICBoZWxwZXJzLnB1c2goYFxuICAgIGNvbnN0ICR7aGVscGVyTmFtZX0gPSAoaW5kZXgsIGZpZWxkLCB2YWx1ZSkgPT4ge1xuICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uKCR7YXR0ck5hbWV9IHx8IFtdKV07XG4gICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgW2ZpZWxkXTogdmFsdWUgfTtcbiAgICAgIHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgfTtgKTtcbiAgfVxuICByZXR1cm4gaGVscGVycy5qb2luKCdcXG4nKTtcbn07XG5cbi8qKiBDb2xsZWN0IGF0dHJpYnV0ZSBuYW1lcyByZWZlcmVuY2VkIGluIEpTWCAoc2V0QXR0cmlidXRlcyh7IHg6IG9yIHZhbHVlPXt4fSkgc28gd2UgZGVzdHJ1Y3R1cmUgdGhlbSBldmVuIGlmIG5vdCBpbiBmaWVsZE1hcC4gKi9cbmNvbnN0IGNvbGxlY3RBdHRyTmFtZXNGcm9tSnN4ID0gKGpzeDogc3RyaW5nKTogU2V0PHN0cmluZz4gPT4ge1xuICBjb25zdCBuYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBzZXRBdHRyUmVnZXggPSAvc2V0QXR0cmlidXRlc1xccypcXChcXHMqXFx7XFxzKihbYS16QS1aXyRdW2EtekEtWjAtOV8kXSopXFxzKjovZztcbiAgbGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG4gIHdoaWxlICgobSA9IHNldEF0dHJSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIGNvbnN0IHZhbHVlUmVnZXggPSAvdmFsdWU9XFx7XFxzKihbYS16QS1aXyRdW2EtekEtWjAtOV8kXSopKD86XFxzKltcXHxcXD9cXCZcXHxcXCFdfFtcXHNcXG5cXHJdKlxcP1xcP3xbXFxzXFxuXFxyXSpcXHxcXHwpL2c7XG4gIHdoaWxlICgobSA9IHZhbHVlUmVnZXguZXhlYyhqc3gpKSAhPT0gbnVsbCkgbmFtZXMuYWRkKG1bMV0pO1xuICBjb25zdCBjb25kUmVnZXggPSAvXFx7XFxzKihbYS16QS1aXyRdW2EtekEtWjAtOV8kXSopXFxzKiYmL2c7XG4gIHdoaWxlICgobSA9IGNvbmRSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIHJldHVybiBuYW1lcztcbn07XG5cbi8qKiBHZW5lcmF0ZSB0aGUgSlMgY29udGVudCBmb3Igb25lIHZhcmlhdGlvbiBpbmNsdWRlIGZpbGUgKGV4cG9ydHMgUGFuZWxzIGFuZCBQcmV2aWV3KS4gKi9cbmNvbnN0IGdlbmVyYXRlVmFyaWFudEpzRmlsZUNvbnRlbnQgPSAoXG4gIHZhcmlhbnQ6IFZhcmlhbnRJbmZvLFxuICByZXN1bHQ6IHsgcGFuZWxzOiBzdHJpbmc7IHByZXZpZXdKc3g6IHN0cmluZzsgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uPzogc3RyaW5nOyBoYXNCcmVhZGNydW1ic0ZldGNoPzogYm9vbGVhbjsgaGFzVGF4b25vbXlGZXRjaD86IGJvb2xlYW4gfSxcbiAgZmllbGRNYXA6IEZpZWxkTWFwLFxuICBoZWxwZXJOYW1lczogc3RyaW5nW10sXG4gIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkOiBib29sZWFuLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICBjb25zdCB2YXJpYW50RHluQ29uZmlncyA9IHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncztcbiAgY29uc3QgZnJvbUZpZWxkTWFwID0gbmV3IFNldChPYmplY3QudmFsdWVzKGZpZWxkTWFwKSk7XG4gIC8vIFNjYW4gcHJldmlldyBKU1ggYW5kIHBhbmVsIEpTWCBmb3IgYXR0cmlidXRlIG5hbWVzIHRvIGRlc3RydWN0dXJlLlxuICBjb25zdCBmcm9tUHJldmlldyA9IGNvbGxlY3RBdHRyTmFtZXNGcm9tSnN4KHJlc3VsdC5wcmV2aWV3SnN4ICsgJ1xcbicgKyByZXN1bHQucGFuZWxzKTtcbiAgLy8gQ29sbGVjdCB2YXJpYWJsZSBuYW1lcyBkZWNsYXJlZCBsb2NhbGx5IGJ5IHRoZSBzcGVjaWFsaXplZCByZXNvbHV0aW9uIGNvZGVcbiAgLy8gKGUuZy4gcHJldmlld0JyZWFkY3J1bWIgZnJvbSB1c2VTdGF0ZSwgcHJldmlld1RhZ3MgZnJvbSB1c2VTZWxlY3QpLlxuICAvLyBUaGVzZSBtdXN0IE5PVCBiZSBkZXN0cnVjdHVyZWQgZnJvbSBhdHRyaWJ1dGVzIG9yIHRoZXknbGwgY29uZmxpY3QuXG4gIGNvbnN0IGxvY2FsbHlEZWNsYXJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAocmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbikge1xuICAgIGNvbnN0IHN0YXRlTWF0Y2ggPSByZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uLm1hdGNoQWxsKC9jb25zdFxccytcXFsoXFx3KyksXFxzKihcXHcrKVxcXVxccyo9XFxzKnVzZVN0YXRlL2cpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzdGF0ZU1hdGNoKSB7IGxvY2FsbHlEZWNsYXJlZC5hZGQobVsxXSk7IGxvY2FsbHlEZWNsYXJlZC5hZGQobVsyXSk7IH1cbiAgICBjb25zdCBzZWxlY3RNYXRjaCA9IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24ubWF0Y2hBbGwoL2NvbnN0XFxzKyhcXHcrKVxccyo9XFxzKnVzZVNlbGVjdC9nKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygc2VsZWN0TWF0Y2gpIHsgbG9jYWxseURlY2xhcmVkLmFkZChtWzFdKTsgfVxuICB9XG4gIGNvbnN0IHJlc2VydmVkID0gbmV3IFNldChbJ2luZGV4JywgJ3ZhbHVlJywgJ2l0ZW0nLCAnZScsICdrZXknLCAnb3BlbiddKTtcbiAgZnJvbVByZXZpZXcuZm9yRWFjaCgobmFtZSkgPT4ge1xuICAgIGlmICghcmVzZXJ2ZWQuaGFzKG5hbWUpICYmICFsb2NhbGx5RGVjbGFyZWQuaGFzKG5hbWUpKSBmcm9tRmllbGRNYXAuYWRkKG5hbWUpO1xuICB9KTtcbiAgLy8gRW5zdXJlIHNwZWNpYWxpemVkIGFycmF5IHN5bnRoZXRpYyBhdHRyaWJ1dGVzIGFyZSBkZXN0cnVjdHVyZWRcbiAgZm9yIChjb25zdCBbZmllbGRLZXksIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudER5bkNvbmZpZ3MpKSB7XG4gICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtmaWVsZEtleV0gfHwgdG9DYW1lbENhc2UoZmllbGRLZXkpO1xuICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykgfHwgaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZGApO1xuICAgIH1cbiAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICBmcm9tRmllbGRNYXAuYWRkKGAke21lcmdlZEF0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGF0dHJOYW1lcyA9IFsuLi5mcm9tRmllbGRNYXBdO1xuICBjb25zdCBoZWxwZXJzRGVzdHJ1Y3QgPSBbLi4uaGVscGVyTmFtZXNdO1xuICBpZiAoYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGhlbHBlcnNEZXN0cnVjdC5wdXNoKCdIYW5kb2ZmTGlua0ZpZWxkJyk7XG4gIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGhlbHBlcnNEZXN0cnVjdC5wdXNoKCdDT05URU5UX0JMT0NLUycpO1xuXG4gIGNvbnN0IGF0dHJEZXN0cnVjdCA9IGF0dHJOYW1lcy5sZW5ndGggPyBgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xcbiAgYCA6ICcnO1xuICBjb25zdCBoZWxwZXJzRGVzdHJ1Y3RMaW5lID1cbiAgICBoZWxwZXJzRGVzdHJ1Y3QubGVuZ3RoID4gMCA/IGAgIGNvbnN0IHsgJHtoZWxwZXJzRGVzdHJ1Y3Quam9pbignLCAnKX0gfSA9IGhlbHBlcnM7XFxuICBgIDogJyc7XG5cbiAgY29uc3QgcHJvcHNMaXN0ID0gYW55UHJldmlld1VzZXNMaW5rRmllbGQgPyAneyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBoZWxwZXJzLCBpc1NlbGVjdGVkIH0nIDogJ3sgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaGVscGVycyB9JztcbiAgY29uc3QgcGFuZWxzRXhwb3J0ID1cbiAgICByZXN1bHQucGFuZWxzLnRyaW0oKSA9PT0gJydcbiAgICAgID8gYGV4cG9ydCBmdW5jdGlvbiBQYW5lbHMoKSB7IHJldHVybiBudWxsOyB9YFxuICAgICAgOiBgZXhwb3J0IGZ1bmN0aW9uIFBhbmVscygke3Byb3BzTGlzdH0pIHtcbiR7YXR0ckRlc3RydWN0fSR7aGVscGVyc0Rlc3RydWN0TGluZX0gIHJldHVybiAoXG4gICAgPD5cbiR7cmVzdWx0LnBhbmVsc31cbiAgICA8Lz5cbiAgKTtcbn1gO1xuXG4gIC8vIERldGVybWluZSB3aGljaCBzaGFyZWQgc2VsZWN0b3IgY29tcG9uZW50cyB0aGlzIHZhcmlhbnQncyBwYW5lbHMgdXNlXG4gIGNvbnN0IHZhcmlhbnRIYXNCcmVhZGNydW1icyA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpO1xuICBjb25zdCB2YXJpYW50SGFzVGF4b25vbXkgPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKTtcbiAgY29uc3QgdmFyaWFudEhhc1BhZ2luYXRpb24gPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpO1xuICBjb25zdCB2YXJpYW50U2hhcmVkSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHZhcmlhbnRIYXNCcmVhZGNydW1icykgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAodmFyaWFudEhhc1RheG9ub215KSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmICh2YXJpYW50SGFzUGFnaW5hdGlvbikgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnUGFnaW5hdGlvblNlbGVjdG9yJyk7XG4gIGNvbnN0IHNoYXJlZFNlbGVjdG9ySW1wb3J0ID0gdmFyaWFudFNoYXJlZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHt2YXJpYW50U2hhcmVkSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJy4uLy4uLy4uL3NoYXJlZCc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gT25seSBpbXBvcnQgUmVwZWF0ZXIgd2hlbiB0aGUgdmFyaWFudCBoYXMgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHNcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJlIHNlcnZlci1yZW5kZXJlZDsgc2hhcmVkIGNvbXBvbmVudHMgaW1wb3J0IFJlcGVhdGVyIHRoZW1zZWx2ZXMpXG4gIGNvbnN0IHZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzID0gT2JqZWN0LmVudHJpZXMoY29tcC5wcm9wZXJ0aWVzKS5zb21lKFxuICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXZhcmlhbnREeW5Db25maWdzW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gdmFyaWFudER5bkNvbmZpZ3Nba10pKVxuICApO1xuICBjb25zdCB0ZW5VcEJsb2NrQ29tcG9uZW50c0ltcG9ydCA9ICh2YXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyB8fCByZXN1bHQucHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJykpXG4gICAgPyBgaW1wb3J0IHsgJHtbdmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgPyAnUmVwZWF0ZXInIDogJycsIHJlc3VsdC5wcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKSA/ICdJbWFnZScgOiAnJ10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gU3BlY2lhbGl6ZWQgYXJyYXkgcmVzb2x1dGlvbiBpbXBvcnRzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIGhvb2tzIHJ1biBpbiB0aGUgdmFyaWF0aW9uIGZpbGUpXG4gIGNvbnN0IGhhc1NwZWNpYWxpemVkUmVzb2x1dGlvbiA9ICEhKHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24/LnRyaW0oKSk7XG4gIGNvbnN0IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSByZXN1bHQuaGFzQnJlYWRjcnVtYnNGZXRjaCA/PyBmYWxzZTtcbiAgY29uc3QgdmFySGFzVGF4b25vbXlGZXRjaCA9IHJlc3VsdC5oYXNUYXhvbm9teUZldGNoID8/IGZhbHNlO1xuXG4gIGNvbnN0IGVsZW1lbnRJbXBvcnROYW1lcyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIGVsZW1lbnRJbXBvcnROYW1lcy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcblxuICBsZXQgZGF0YUltcG9ydCA9ICcnO1xuICBpZiAodmFySGFzVGF4b25vbXlGZXRjaCB8fCB2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSB7XG4gICAgY29uc3QgZGF0YU5hbWVzID0gWyd1c2VTZWxlY3QnXTtcbiAgICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkgZGF0YU5hbWVzLnB1c2goJ3NlbGVjdCcpO1xuICAgIGRhdGFJbXBvcnQgKz0gYGltcG9ydCB7ICR7ZGF0YU5hbWVzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIHtcbiAgICBkYXRhSW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICBjb25zdCBzcGVjaWFsaXplZENvZGUgPSBoYXNTcGVjaWFsaXplZFJlc29sdXRpb24gPyByZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uISA6ICcnO1xuXG4gIHJldHVybiBgLyoqXG4gKiBWYXJpYXRpb246ICR7Y29tcC50aXRsZX0gKCR7Y29tcC5pZH0pXG4gKiBHZW5lcmF0ZWQg4oCTIGRvIG5vdCBlZGl0IGJ5IGhhbmQuXG4gKi9cbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydE5hbWVzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbmltcG9ydCB7XG4gIFBhbmVsQm9keSxcbiAgVGV4dENvbnRyb2wsXG4gIEJ1dHRvbixcbiAgU2VsZWN0Q29udHJvbCxcbiAgUmFuZ2VDb250cm9sLFxuICBUb2dnbGVDb250cm9sLFxuICBGbGV4LFxuICBQb3BvdmVyLFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgTWVkaWFVcGxvYWQsIE1lZGlhVXBsb2FkQ2hlY2ssIE1lZGlhUmVwbGFjZUZsb3csIExpbmtDb250cm9sLCBSaWNoVGV4dCwgSW5uZXJCbG9ja3MgfSBmcm9tICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG4ke2RhdGFJbXBvcnR9JHt0ZW5VcEJsb2NrQ29tcG9uZW50c0ltcG9ydH0ke3NoYXJlZFNlbGVjdG9ySW1wb3J0fVxuJHtwYW5lbHNFeHBvcnR9XG5cbmV4cG9ydCBmdW5jdGlvbiBQcmV2aWV3KCR7cHJvcHNMaXN0fSkge1xuJHthdHRyRGVzdHJ1Y3R9JHtoZWxwZXJzRGVzdHJ1Y3RMaW5lfSR7c3BlY2lhbGl6ZWRDb2RlfVxuICByZXR1cm4gKFxuJHtyZXN1bHQucHJldmlld0pzeH1cbiAgKTtcbn1cbmA7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIHJlbmRlci5waHAg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKiBHZW5lcmF0ZSB0aGUgUEhQIGZyYWdtZW50IGZvciBvbmUgdmFyaWFudCAoZXh0cmFjdGlvbnMgKyB0ZW1wbGF0ZSkuIFVzZWQgaW4gdmFyaWF0aW9uIGluY2x1ZGUgZmlsZS4gKi9cbmNvbnN0IGdlbmVyYXRlVmFyaWFudFBocEZyYWdtZW50ID0gKFxuICB2YXJpYW50OiBWYXJpYW50SW5mbyxcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW2NvbXAuaWRdO1xuXG4gIGNvbnN0IHJpY2h0ZXh0UHJvcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgaWYgKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgcmljaHRleHRQcm9wcy5hZGQodG9DYW1lbENhc2UodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSk7XG4gIH1cblxuICBjb25zdCBleHRyYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcC5wcm9wZXJ0aWVzKSkge1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncmljaHRleHQnICYmIGtleSA9PT0gdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSBjb250aW51ZTtcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBvcmlnQ2FtZWwgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGdldFBocERlZmF1bHRWYWx1ZShwcm9wZXJ0eSk7XG4gICAgZXh0cmFjdGlvbnMucHVzaChgJCR7b3JpZ0NhbWVsfSA9IGlzc2V0KCRhdHRyaWJ1dGVzWycke21lcmdlZEF0dHJOYW1lfSddKSA/ICRhdHRyaWJ1dGVzWycke21lcmdlZEF0dHJOYW1lfSddIDogJHtkZWZhdWx0VmFsdWV9O2ApO1xuICB9XG4gIC8vIFN5bnRoZXRpYyBvdmVybGF5T3BhY2l0eSAod2hlbiB0ZW1wbGF0ZSB1c2VzIG92ZXJsYXkgYnV0IGNvbXBvbmVudCBoYXMgbm8gb3ZlcmxheU9wYWNpdHkgcHJvcGVydHkpXG4gIGlmIChmaWVsZE1hcFsnb3ZlcmxheU9wYWNpdHknXSkge1xuICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbJ292ZXJsYXlPcGFjaXR5J107XG4gICAgZXh0cmFjdGlvbnMucHVzaChgJG92ZXJsYXlPcGFjaXR5ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10pID8gJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10gOiAwLjY7YCk7XG4gIH1cblxuICAvLyBEeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gZm9yIHNwZWNpYWxpemVkIGFycmF5IHR5cGVzIChicmVhZGNydW1icywgdGF4b25vbXksIHBhZ2luYXRpb24pXG4gIGNvbnN0IGR5bkFycmF5RXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmICh2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBjb21wLnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBtZXJnZWRBdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGR5bkNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGR5bkNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5BcnJheUNvZGUgPSBkeW5BcnJheUV4dHJhY3Rpb25zLmxlbmd0aCA/ICdcXG4nICsgZHluQXJyYXlFeHRyYWN0aW9ucy5qb2luKCdcXG4nKSA6ICcnO1xuXG4gIGNvbnN0IHRlbXBsYXRlUGhwID0gaGFuZGxlYmFyc1RvUGhwKGNvbXAuY29kZSA/PyAnJywgY29tcC5wcm9wZXJ0aWVzLCByaWNodGV4dFByb3BzKTtcbiAgY29uc3QgY2xhc3NOYW1lID0gKGNvbXAuaWQgPz8gJycpLnJlcGxhY2UoL18vZywgJy0nKTtcblxuICByZXR1cm4gYDw/cGhwXG4vLyBBdHRyaWJ1dGUgZXh0cmFjdGlvbiBmb3IgdmFyaWFudDogJHtjb21wLmlkfVxuJHtleHRyYWN0aW9ucy5qb2luKCdcXG4nKX0ke2R5bkFycmF5Q29kZX1cbj8+XG48ZGl2IGNsYXNzPVwiJHtjbGFzc05hbWV9XCI+XG4ke3RlbXBsYXRlUGhwfVxuPC9kaXY+XG5gO1xufTtcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRSZW5kZXJQaHAgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIGNvbnN0IGRlZmF1bHRWYXJpYW50ID0gdmFyaWFudHNbMF0uY29tcG9uZW50LmlkO1xuXG4gIGNvbnN0IGNhc2VzOiBzdHJpbmdbXSA9IHZhcmlhbnRzLm1hcChcbiAgICAodikgPT4gYCAgY2FzZSAnJHt2LmNvbXBvbmVudC5pZH0nOlxuICAgIGluY2x1ZGUgX19ESVJfXyAuICcvdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfS5waHAnO1xuICAgIGJyZWFrO2AsXG4gICk7XG5cbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7dG9UaXRsZUNhc2UoZ3JvdXBTbHVnKX0gKG1lcmdlZCBncm91cCBibG9jaylcbiAqXG4gKiBAcGFyYW0gYXJyYXkgICAgJGF0dHJpYnV0ZXMgQmxvY2sgYXR0cmlidXRlcy5cbiAqIEBwYXJhbSBzdHJpbmcgICAkY29udGVudCAgICBCbG9jayBkZWZhdWx0IGNvbnRlbnQuXG4gKiBAcGFyYW0gV1BfQmxvY2sgJGJsb2NrICAgICAgQmxvY2sgaW5zdGFuY2UuXG4gKiBAcmV0dXJuIHN0cmluZyBSZXR1cm5zIHRoZSBibG9jayBtYXJrdXAuXG4gKi9cblxuaWYgKCFkZWZpbmVkKCdBQlNQQVRIJykpIHtcbiAgZXhpdDtcbn1cblxuaWYgKCFpc3NldCgkYXR0cmlidXRlcykpIHtcbiAgJGF0dHJpYnV0ZXMgPSBbXTtcbn1cblxuJHZhcmlhbnQgPSBpc3NldCgkYXR0cmlidXRlc1snaGFuZG9mZlZhcmlhbnQnXSkgPyAkYXR0cmlidXRlc1snaGFuZG9mZlZhcmlhbnQnXSA6ICcke2RlZmF1bHRWYXJpYW50fSc7XG4/PlxuPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7YmxvY2tOYW1lfSddKTsgPz4+XG48P3BocFxuc3dpdGNoICgkdmFyaWFudCkge1xuJHtjYXNlcy5qb2luKCdcXG4nKX1cblxuICBkZWZhdWx0OlxuICAgIGVjaG8gJzwhLS0gVW5rbm93biB2YXJpYW50OiAnIC4gZXNjX2h0bWwoJHZhcmlhbnQpIC4gJyAtLT4nO1xuICAgIGJyZWFrO1xufVxuPz5cbjwvZGl2PlxuYDtcbn07XG5cbi8vIGdldFBocERlZmF1bHRWYWx1ZSBpcyBpbXBvcnRlZCBmcm9tIHJlbmRlci1waHAudHNcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBTQ1NTIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZEVkaXRvclNjc3MgPSAodmFyaWFudHM6IFZhcmlhbnRJbmZvW10pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiBnZW5lcmF0ZUVkaXRvclNjc3Modi5jb21wb25lbnQpKVxuICAgIC5qb2luKCdcXG5cXG4nKTtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkU3R5bGVTY3NzID0gKHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4gZ2VuZXJhdGVTdHlsZVNjc3Modi5jb21wb25lbnQpKVxuICAgIC5qb2luKCdcXG5cXG4nKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgTWlncmF0aW9uIFNjaGVtYSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRNaWdyYXRpb25TY2hlbWEgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIGNvbnN0IHZhcmlhbnRTY2hlbWFzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBNaWdyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGNvbXAucHJvcGVydGllcykpIHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgICBwcm9wZXJ0aWVzW2tleV0gPSBleHRyYWN0TWlncmF0aW9uUHJvcGVydHkocHJvcCwgdHJ1ZSwga2V5KTtcbiAgICB9XG4gICAgdmFyaWFudFNjaGVtYXNbY29tcC5pZF0gPSB7XG4gICAgICB0aXRsZTogY29tcC50aXRsZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAoY29tcC5kZXNjcmlwdGlvbiB8fCAnJykucmVwbGFjZSgvXFxuXFxzKy9nLCAnICcpLnRyaW0oKSxcbiAgICAgIHByb3BlcnRpZXMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNjaGVtYSA9IHtcbiAgICBibG9ja05hbWU6IGBoYW5kb2ZmLyR7YmxvY2tOYW1lfWAsXG4gICAgdGl0bGU6IGdyb3VwVGl0bGUsXG4gICAgZGVzY3JpcHRpb246IGAke2dyb3VwVGl0bGV9IGJsb2NrIHdpdGggJHt2YXJpYW50cy5sZW5ndGh9IHZhcmlhdGlvbnMuYCxcbiAgICBjYXRlZ29yeTogZ3JvdXBUb0NhdGVnb3J5KGdyb3VwU2x1ZyksXG4gICAgaXNNZXJnZWRHcm91cDogdHJ1ZSxcbiAgICB2YXJpYW50czogdmFyaWFudFNjaGVtYXMsXG4gIH07XG5cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHNjaGVtYSwgbnVsbCwgMik7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIFJFQURNRSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRSZWFkbWUgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgdmFyaWFudExpc3QgPSB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IGAtICoqJHt2LmNvbXBvbmVudC50aXRsZX0qKiAoXFxgJHt2LmNvbXBvbmVudC5pZH1cXGApYClcbiAgICAuam9pbignXFxuJyk7XG5cbiAgcmV0dXJuIGAjICR7Z3JvdXBUaXRsZX0gKE1lcmdlZCBHcm91cCBCbG9jaylcblxuVGhpcyBibG9jayBjb21iaW5lcyAke3ZhcmlhbnRzLmxlbmd0aH0gY29tcG9uZW50IHZhcmlhdGlvbnMgaW50byBhIHNpbmdsZSBXb3JkUHJlc3MgYmxvY2suXG5cbiMjIFZhcmlhdGlvbnNcblxuJHt2YXJpYW50TGlzdH1cblxuIyMgVXNhZ2VcblxuU2VsZWN0IHRoZSBkZXNpcmVkIHZhcmlhdGlvbiBmcm9tIHRoZSBibG9jayB0b29sYmFyIChWYXJpYXRpb24gZHJvcGRvd24pLlxuRWFjaCB2YXJpYXRpb24gaGFzIGl0cyBvd24gc2V0IG9mIGNvbnRyb2xzIGFuZCByZW5kZXJzIGl0cyBvd24gdGVtcGxhdGUuXG5gO1xufTtcblxuLy8g4pSA4pSA4pSAIE1haW4gR2VuZXJhdG9yIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIEdlbmVyYXRlIGEgbWVyZ2VkIGJsb2NrIGZvciBhIGdyb3VwIG9mIGNvbXBvbmVudHMuXG4gKiBWYXJpYXRpb24gbWFya3VwIGlzIHNwbGl0IGludG8gaW5jbHVkZSBmaWxlczogdmFyaWF0aW9ucy88dmFyaWFudC1pZD4uanMgYW5kIHZhcmlhdGlvbnMvPHZhcmlhbnQtaWQ+LnBocC5cbiAqL1xuZXhwb3J0IGNvbnN0IGdlbmVyYXRlTWVyZ2VkQmxvY2sgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBjb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10sXG4gIHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSxcbiAgYXBpVXJsPzogc3RyaW5nLFxuKTogR2VuZXJhdGVkQmxvY2sgPT4ge1xuICBjb25zdCBncm91cFRpdGxlID0gdG9UaXRsZUNhc2UoZ3JvdXBTbHVnKTtcblxuICBjb25zdCBzdXBlcnNldFJlc3VsdCA9IGJ1aWxkU3VwZXJzZXRBdHRyaWJ1dGVzKHZhcmlhbnRJbmZvcywgZ3JvdXBTbHVnKTtcbiAgY29uc3QgeyBhdHRyaWJ1dGVzOiBzdXBlcnNldEF0dHJzLCBmaWVsZE1hcHMgfSA9IHN1cGVyc2V0UmVzdWx0O1xuXG4gIGNvbnN0IHsgaW5kZXhKcywgdmFyaWF0aW9uSnMgfSA9IGdlbmVyYXRlTWVyZ2VkSW5kZXhKcyhcbiAgICBncm91cFNsdWcsXG4gICAgZ3JvdXBUaXRsZSxcbiAgICB2YXJpYW50SW5mb3MsXG4gICAgc3VwZXJzZXRBdHRycyxcbiAgICBmaWVsZE1hcHMsXG4gICAgYXBpVXJsLFxuICApO1xuXG4gIGNvbnN0IHZhcmlhdGlvblBocDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudEluZm9zKSB7XG4gICAgdmFyaWF0aW9uUGhwW3ZhcmlhbnQuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudFBocEZyYWdtZW50KHZhcmlhbnQsIGZpZWxkTWFwcyk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJsb2NrSnNvbjogZ2VuZXJhdGVNZXJnZWRCbG9ja0pzb24oZ3JvdXBTbHVnLCBncm91cFRpdGxlLCB2YXJpYW50SW5mb3MsIHN1cGVyc2V0QXR0cnMpLFxuICAgIGluZGV4SnMsXG4gICAgcmVuZGVyUGhwOiBnZW5lcmF0ZU1lcmdlZFJlbmRlclBocChncm91cFNsdWcsIHZhcmlhbnRJbmZvcywgZmllbGRNYXBzKSxcbiAgICBlZGl0b3JTY3NzOiBnZW5lcmF0ZU1lcmdlZEVkaXRvclNjc3ModmFyaWFudEluZm9zKSxcbiAgICBzdHlsZVNjc3M6IGdlbmVyYXRlTWVyZ2VkU3R5bGVTY3NzKHZhcmlhbnRJbmZvcyksXG4gICAgcmVhZG1lOiBnZW5lcmF0ZU1lcmdlZFJlYWRtZShncm91cFNsdWcsIGdyb3VwVGl0bGUsIHZhcmlhbnRJbmZvcyksXG4gICAgbWlncmF0aW9uU2NoZW1hOiBnZW5lcmF0ZU1lcmdlZE1pZ3JhdGlvblNjaGVtYShncm91cFNsdWcsIGdyb3VwVGl0bGUsIHZhcmlhbnRJbmZvcyksXG4gICAgdmFyaWF0aW9uRmlsZXM6IHtcbiAgICAgIGpzOiB2YXJpYXRpb25KcyxcbiAgICAgIHBocDogdmFyaWF0aW9uUGhwLFxuICAgIH0sXG4gIH07XG59O1xuXG5leHBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH07XG4iXX0=