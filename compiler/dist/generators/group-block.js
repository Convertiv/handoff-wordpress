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
const generateMergedIndexJs = (groupSlug, groupTitle, variants, supersetAttrs, fieldMaps, apiUrl, variantScreenshots) => {
    const blockName = groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    // Collect all unique features needed across variants
    let needsMediaUpload = false;
    let needsRangeControl = false;
    let needsNumberControl = false;
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
        if ((0, index_js_1.hasNonOpacityNumberField)(properties))
            needsNumberControl = true;
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
    if (needsNumberControl)
        componentImports.push('NumberControl');
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
const generateMergedBlock = (groupSlug, components, variantInfos, apiUrl, variantScreenshots) => {
    const groupTitle = (0, index_js_1.toTitleCase)(groupSlug);
    const screenshots = variantScreenshots || {};
    const supersetResult = (0, exports.buildSupersetAttributes)(variantInfos, groupSlug);
    const { attributes: supersetAttrs, fieldMaps } = supersetResult;
    const { indexJs, variationJs } = generateMergedIndexJs(groupSlug, groupTitle, variantInfos, supersetAttrs, fieldMaps, apiUrl, screenshots);
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
        editorScss: generateMergedEditorScss(variantInfos),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9ncm91cC1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsb0NBZWtCO0FBQ2xCLDJEQUF3RjtBQUN4RixxREFBZ0c7QUFDaEcsNkNBQTZFO0FBQzdFLDZDQUEwUDtBQUMxUCxxQ0FBaUU7QUFDakUsK0NBQTRIO0FBQzVILHlDQU9vQjtBQWlDcEIsaUZBQWlGO0FBRWpGOztHQUVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQXFCLEVBQUUsQ0FBcUIsRUFBVyxFQUFFO0lBQ25GLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDM0IsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUU7SUFDckQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO1NBQ3hCLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7U0FDMUQsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN4QixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDLENBQUM7QUFFRixnR0FBZ0c7QUFDaEcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFNBQWlCLEVBQVUsRUFBRTtJQUN0RCxNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMx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QkFBcUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUM5QyxDQUFDO2FBQU0sSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNsQixxQkFBcUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwRyxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU87UUFDTCxTQUFTLEVBQUUsdUJBQXVCLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLFdBQVcsQ0FBQztRQUNuRyxPQUFPO1FBQ1AsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxZQUFZLEVBQUUsU0FBUyxDQUFDO1FBQ3RFLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQyxZQUFZLENBQUM7UUFDbEQsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFlBQVksQ0FBQztRQUNoRCxNQUFNLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUM7UUFDakUsZUFBZSxFQUFFLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDO1FBQ25GLHFCQUFxQjtRQUNyQixjQUFjLEVBQUU7WUFDZCxFQUFFLEVBQUUsV0FBVztZQUNmLEdBQUcsRUFBRSxZQUFZO1NBQ2xCO0tBQ0YsQ0FBQztBQUNKLENBQUMsQ0FBQztBQXJEVyxRQUFBLG1CQUFtQix1QkFxRDlCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNZXJnZWQgR3JvdXAgQmxvY2sgR2VuZXJhdG9yXG4gKlxuICogQ29tYmluZXMgYWxsIEhhbmRvZmYgY29tcG9uZW50cyBpbiB0aGUgc2FtZSBncm91cCBpbnRvIGEgc2luZ2xlIFdvcmRQcmVzc1xuICogYmxvY2sgd2l0aCB2YXJpYXRpb25zLiBVc2VzIGEgc3VwZXJzZXQgYXR0cmlidXRlIHNjaGVtYSwgdmFyaWFudC1jb25kaXRpb25hbFxuICogc2lkZWJhciBjb250cm9scywgdmFyaWFudC1zcGVjaWZpYyBwcmV2aWV3IHJlbmRlcmluZywgYW5kIGEgcmVuZGVyLnBocFxuICogZGlzcGF0Y2hlci5cbiAqL1xuXG5pbXBvcnQge1xuICBIYW5kb2ZmQ29tcG9uZW50LFxuICBIYW5kb2ZmUHJvcGVydHksXG4gIEd1dGVuYmVyZ0F0dHJpYnV0ZSxcbiAgRHluYW1pY0FycmF5Q29uZmlnLFxuICBCcmVhZGNydW1ic0FycmF5Q29uZmlnLFxuICBUYXhvbm9teUFycmF5Q29uZmlnLFxuICBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIEdlbmVyYXRlZEJsb2NrLFxuICBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZyxcbiAgQmxvY2tKc29uT3V0cHV0LFxuICBIYW5kb2ZmTWV0YWRhdGEsXG4gIGlzQnJlYWRjcnVtYnNDb25maWcsXG4gIGlzVGF4b25vbXlDb25maWcsXG4gIGlzUGFnaW5hdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIGdlbmVyYXRlSnN4UHJldmlldywgSnN4UHJldmlld1Jlc3VsdCB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuaW1wb3J0IHsgbm9ybWFsaXplU2VsZWN0T3B0aW9ucywgdHlwZSBOb3JtYWxpemVkU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeC91dGlscyc7XG5pbXBvcnQgeyBtYXBQcm9wZXJ0eVR5cGUsIGdyb3VwVG9DYXRlZ29yeSwgdG9CbG9ja05hbWUgfSBmcm9tICcuL2Jsb2NrLWpzb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVSZW5kZXJQaHAsIGhhbmRsZWJhcnNUb1BocCwgYXJyYXlUb1BocCwgZ2V0UGhwRGVmYXVsdFZhbHVlLCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbiwgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuaW1wb3J0IHsgZ2VuZXJhdGVFZGl0b3JTY3NzLCBnZW5lcmF0ZVN0eWxlU2NzcyB9IGZyb20gJy4vc3R5bGVzJztcbmltcG9ydCB7IGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hLCBNaWdyYXRpb25TY2hlbWEsIE1pZ3JhdGlvblByb3BlcnR5U2NoZW1hLCBleHRyYWN0TWlncmF0aW9uUHJvcGVydHkgfSBmcm9tICcuL3NjaGVtYS1qc29uJztcbmltcG9ydCB7XG4gIHRvVGl0bGVDYXNlLFxuICBnZW5lcmF0ZUZpZWxkQ29udHJvbCxcbiAgZ2VuZXJhdGVBcnJheUNvbnRyb2wsXG4gIGdlbmVyYXRlU3ZnSWNvbixcbiAgaGFzT3BhY2l0eVJhbmdlRmllbGQsXG4gIGhhc05vbk9wYWNpdHlOdW1iZXJGaWVsZCxcbn0gZnJvbSAnLi9pbmRleC1qcyc7XG5pbXBvcnQgdHlwZSB7IEZpZWxkQ29udGV4dCB9IGZyb20gJy4vaW5kZXgtanMnO1xuXG4vLyDilIDilIDilIAgVHlwZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKiBQZXItdmFyaWFudCBtYXBwaW5nIGZyb20gb3JpZ2luYWwgZmllbGQgbmFtZSB0byBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKi9cbmV4cG9ydCB0eXBlIEZpZWxkTWFwID0gUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxudHlwZSBBbnlEeW5hbWljQXJyYXlDb25maWcgPSBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZztcblxuaW50ZXJmYWNlIFZhcmlhbnRJbmZvIHtcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50O1xuICBmaWVsZE1hcDogRmllbGRNYXA7XG4gIGlubmVyQmxvY2tzRmllbGQ6IHN0cmluZyB8IG51bGw7XG4gIGR5bmFtaWNBcnJheUNvbmZpZ3M6IFJlY29yZDxzdHJpbmcsIEFueUR5bmFtaWNBcnJheUNvbmZpZz47XG59XG5cbmludGVyZmFjZSBNZXJnZWRGaWVsZCB7XG4gIC8qKiBUaGUgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lIChjYW1lbENhc2UpICovXG4gIGF0dHJOYW1lOiBzdHJpbmc7XG4gIC8qKiBUaGUgR3V0ZW5iZXJnIGF0dHJpYnV0ZSBkZWZpbml0aW9uICovXG4gIGF0dHJpYnV0ZTogR3V0ZW5iZXJnQXR0cmlidXRlO1xuICAvKiogV2hpY2ggdmFyaWFudHMgdXNlIHRoaXMgZmllbGQgKi9cbiAgdmFyaWFudHM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgU3VwZXJzZXRSZXN1bHQge1xuICAvKiogQWxsIG1lcmdlZCBhdHRyaWJ1dGVzIGtleWVkIGJ5IG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAqL1xuICBhdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+O1xuICAvKiogUGVyLXZhcmlhbnQgZmllbGQgbWFwOiBvcmlnaW5hbCBrZXkg4oaSIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAqL1xuICBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPjtcbn1cblxuLy8g4pSA4pSA4pSAIFN1cGVyc2V0IEF0dHJpYnV0ZSBNZXJnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqXG4gKiBUeXBlcyBhcmUgY29tcGF0aWJsZSBpZiB0aGV5IGhhdmUgdGhlIHNhbWUgR3V0ZW5iZXJnIGF0dHJpYnV0ZSBgdHlwZWAuXG4gKi9cbmNvbnN0IHR5cGVzQXJlQ29tcGF0aWJsZSA9IChhOiBHdXRlbmJlcmdBdHRyaWJ1dGUsIGI6IEd1dGVuYmVyZ0F0dHJpYnV0ZSk6IGJvb2xlYW4gPT4ge1xuICBpZiAoIWEgfHwgIWIpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGEudHlwZSA9PT0gYi50eXBlO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IGEgdmFyaWFudCBJRCAoZS5nLiBcImhlcm8tYmFzaWNcIiwgXCJoZXJvX3NlYXJjaFwiKSBpbnRvIGEgdmFsaWQgY2FtZWxDYXNlXG4gKiBpZGVudGlmaWVyIGZvciB1c2UgaW4gcHJlZml4ZWQgYXR0cmlidXRlIG5hbWVzLiBFbnN1cmVzIGdlbmVyYXRlZCBKUyBjYW4gZGVzdHJ1Y3R1cmVcbiAqIGF0dHJpYnV0ZXMgd2l0aG91dCBxdW90aW5nIChubyBoeXBoZW5zIGluIG5hbWVzKS5cbiAqL1xuY29uc3QgdmFyaWFudElkVG9DYW1lbCA9ICh2YXJpYW50SWQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHMgPSAodmFyaWFudElkID8/ICcnKVxuICAgIC5yZXBsYWNlKC9bLV9dKFthLXpdKS9nLCAoXywgbDogc3RyaW5nKSA9PiBsLnRvVXBwZXJDYXNlKCkpXG4gICAgLnJlcGxhY2UoL1stX10vZywgJycpO1xuICByZXR1cm4gcy5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIHMuc2xpY2UoMSk7XG59O1xuXG4vKiogVmFyaWFudCBJRCB0byBQYXNjYWxDYXNlIGZvciBKUyBpbXBvcnQvY29tcG9uZW50IG5hbWUgKGUuZy4gaGVyby1hcnRpY2xlIC0+IEhlcm9BcnRpY2xlKS4gKi9cbmNvbnN0IHZhcmlhbnRJZFRvUGFzY2FsID0gKHZhcmlhbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2FtZWwgPSB2YXJpYW50SWRUb0NhbWVsKHZhcmlhbnRJZCk7XG4gIHJldHVybiBjYW1lbC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGNhbWVsLnNsaWNlKDEpO1xufTtcblxuLyoqXG4gKiBNZXJnZSBhdHRyaWJ1dGVzIGZyb20gTiBjb21wb25lbnRzIGludG8gYSBzdXBlcnNldCBzY2hlbWEuXG4gKlxuICogMS4gU2hhcmVkIGZpZWxkcyAoc2FtZSBuYW1lLCBjb21wYXRpYmxlIHR5cGUpOiBrZXB0IGFzLWlzLlxuICogMi4gQ29uZmxpY3RpbmcgZmllbGRzIChzYW1lIG5hbWUsIGRpZmZlcmVudCB0eXBlKTogcHJlZml4ZWQgd2l0aCB2YXJpYW50IHNsdWcuXG4gKiAzLiBVbmlxdWUgZmllbGRzOiBrZXB0IGFzLWlzLlxuICovXG5leHBvcnQgY29uc3QgYnVpbGRTdXBlcnNldEF0dHJpYnV0ZXMgPSAoXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBncm91cFNsdWc6IHN0cmluZyxcbik6IFN1cGVyc2V0UmVzdWx0ID0+IHtcbiAgY29uc3QgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPiA9IHt9O1xuICBjb25zdCBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPiA9IHt9O1xuXG4gIC8vIEZpcnN0IHBhc3M6IGNvbGxlY3QgYWxsIGZpZWxkcyBwZXIgb3JpZ2luYWwga2V5IGFjcm9zcyB2YXJpYW50c1xuICBjb25zdCBmaWVsZHNCeUtleTogUmVjb3JkPFxuICAgIHN0cmluZyxcbiAgICBBcnJheTx7IHZhcmlhbnRJZDogc3RyaW5nOyBhdHRyTmFtZTogc3RyaW5nOyBhdHRyOiBHdXRlbmJlcmdBdHRyaWJ1dGUgfT5cbiAgPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXBvbmVudCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICAgIGZpZWxkTWFwc1tjb21wb25lbnQuaWRdID0ge307XG4gICAgY29uc3QgcHJldmlld1ZhbHVlcyA9IGNvbXBvbmVudC5wcmV2aWV3cz8uZ2VuZXJpYz8udmFsdWVzIHx8IHt9O1xuXG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG9yaWdBdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgICBsZXQgbWFwcGVkID0gbWFwUHJvcGVydHlUeXBlKHByb3BlcnR5LCBwcmV2aWV3VmFsdWVzW2tleV0pO1xuXG4gICAgICAvLyBOb24taW5uZXJCbG9ja3NGaWVsZCByaWNodGV4dCBiZWNvbWVzIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAgICAgaWYgKG1hcHBlZCA9PT0gbnVsbCAmJiBwcm9wZXJ0eS50eXBlID09PSAncmljaHRleHQnICYmIGtleSAhPT0gdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgICAgIG1hcHBlZCA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IHByZXZpZXdWYWx1ZXNba2V5XSA/PyAnJyB9O1xuICAgICAgfVxuICAgICAgaWYgKG1hcHBlZCA9PT0gbnVsbCkgY29udGludWU7XG5cbiAgICAgIGlmICghZmllbGRzQnlLZXlba2V5XSkgZmllbGRzQnlLZXlba2V5XSA9IFtdO1xuICAgICAgZmllbGRzQnlLZXlba2V5XS5wdXNoKHsgdmFyaWFudElkOiBjb21wb25lbnQuaWQsIGF0dHJOYW1lOiBvcmlnQXR0ck5hbWUsIGF0dHI6IG1hcHBlZCB9KTtcbiAgICB9XG5cbiAgICAvLyBBbHNvIGNvbGxlY3QgZHluYW1pYyBhcnJheSBjb250cm9sIGF0dHJpYnV0ZXNcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgY29uc3QgZHluRmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+ID0ge307XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUVuYWJsZWRgXSA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiB0cnVlIH07XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RW5hYmxlZGBdID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1UYXhvbm9teWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogZHluQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJyB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9U291cmNlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAnYXV0bycgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUVuYWJsZWRgXSA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgICBjb25zdCBzb3VyY2VEZWZhdWx0ID0gZHluQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9U291cmNlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBzb3VyY2VEZWZhdWx0LCBlbnVtOiBbJ3F1ZXJ5JywgJ3NlbGVjdCcsICdtYW51YWwnXSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9UG9zdFR5cGVgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IGR5bkNvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgZHluQ29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCcgfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgXSA9IHsgdHlwZTogJ2FycmF5JywgZGVmYXVsdDogW10gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVF1ZXJ5QXJnc2BdID0geyB0eXBlOiAnb2JqZWN0JywgZGVmYXVsdDogeyBwb3N0X3R5cGU6IGR5bkNvbmZpZy5kZWZhdWx0UG9zdFR5cGUgfHwgZHluQ29uZmlnLnBvc3RUeXBlc1swXSB8fCAncG9zdCcsIHBvc3RzX3Blcl9wYWdlOiBkeW5Db25maWcubWF4SXRlbXMgfHwgNiwgb3JkZXJieTogJ2RhdGUnLCBvcmRlcjogJ0RFU0MnLCB0YXhfcXVlcnk6IFtdLCAuLi4oZHluQ29uZmlnLmRlZmF1bHRRdWVyeUFyZ3MgfHwge30pIH0gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUZpZWxkTWFwcGluZ2BdID0geyB0eXBlOiAnb2JqZWN0JywgZGVmYXVsdDogZHluQ29uZmlnLmZpZWxkTWFwcGluZyB8fCB7fSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2BdID0geyB0eXBlOiAnb2JqZWN0JywgZGVmYXVsdDoge30gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVJlbmRlck1vZGVgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IGR5bkNvbmZpZy5yZW5kZXJNb2RlIHx8ICdtYXBwZWQnIH07XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgW2RhS2V5LCBkYUF0dHJdIG9mIE9iamVjdC5lbnRyaWVzKGR5bkZpZWxkcykpIHtcbiAgICAgICAgaWYgKCFmaWVsZHNCeUtleVtgX19keW5fJHtkYUtleX1gXSkgZmllbGRzQnlLZXlbYF9fZHluXyR7ZGFLZXl9YF0gPSBbXTtcbiAgICAgICAgZmllbGRzQnlLZXlbYF9fZHluXyR7ZGFLZXl9YF0ucHVzaCh7IHZhcmlhbnRJZDogY29tcG9uZW50LmlkLCBhdHRyTmFtZTogZGFLZXksIGF0dHI6IGRhQXR0ciB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBTZWNvbmQgcGFzczogcmVzb2x2ZSBjb25mbGljdHNcbiAgZm9yIChjb25zdCBba2V5LCBlbnRyaWVzXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZHNCeUtleSkpIHtcbiAgICBpZiAoZW50cmllcy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgLy8gQ2hlY2sgaWYgYWxsIGVudHJpZXMgaGF2ZSBjb21wYXRpYmxlIHR5cGVzXG4gICAgY29uc3QgZmlyc3QgPSBlbnRyaWVzWzBdO1xuICAgIGNvbnN0IGFsbENvbXBhdGlibGUgPSBlbnRyaWVzLmV2ZXJ5KChlKSA9PiB0eXBlc0FyZUNvbXBhdGlibGUoZmlyc3QuYXR0ciwgZS5hdHRyKSk7XG5cbiAgICBpZiAoYWxsQ29tcGF0aWJsZSkge1xuICAgICAgLy8gU2hhcmVkIG9yIHVuaXF1ZSBmaWVsZCDigJQgdXNlIG9yaWdpbmFsIG5hbWVcbiAgICAgIGNvbnN0IG1lcmdlZE5hbWUgPSBmaXJzdC5hdHRyTmFtZTtcbiAgICAgIC8vIFVzZSB0aGUgZmlyc3QgdmFyaWFudCdzIGF0dHJpYnV0ZSBkZWZpbml0aW9uIChkZWZhdWx0cyBtYXkgZGlmZmVyLCB0YWtlIGZpcnN0KVxuICAgICAgYXR0cmlidXRlc1ttZXJnZWROYW1lXSA9IGZpcnN0LmF0dHI7XG4gICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgaWYgKCFrZXkuc3RhcnRzV2l0aCgnX19keW5fJykpIHtcbiAgICAgICAgICBmaWVsZE1hcHNbZW50cnkudmFyaWFudElkXVtrZXldID0gbWVyZ2VkTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDb25mbGljdGluZyDigJQgcHJlZml4IHdpdGggdmFyaWFudCBzbHVnIChtdXN0IGJlIHZhbGlkIEpTIGlkZW50aWZpZXIgZm9yIGRlc3RydWN0dXJpbmcpXG4gICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgY29uc3QgdmFyaWFudENhbWVsID0gdmFyaWFudElkVG9DYW1lbChlbnRyeS52YXJpYW50SWQpO1xuICAgICAgICBjb25zdCBwcmVmaXhlZCA9IHZhcmlhbnRDYW1lbCArIGVudHJ5LmF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZW50cnkuYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGF0dHJpYnV0ZXNbcHJlZml4ZWRdID0gZW50cnkuYXR0cjtcbiAgICAgICAgaWYgKCFrZXkuc3RhcnRzV2l0aCgnX19keW5fJykpIHtcbiAgICAgICAgICBmaWVsZE1hcHNbZW50cnkudmFyaWFudElkXVtrZXldID0gcHJlZml4ZWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBBbHdheXMgYWRkIGFsaWduXG4gIGF0dHJpYnV0ZXMuYWxpZ24gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAnZnVsbCcgfTtcblxuICByZXR1cm4geyBhdHRyaWJ1dGVzLCBmaWVsZE1hcHMgfTtcbn07XG5cbi8vIOKUgOKUgOKUgCBCbG9jayBJY29uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBjaG9vc2VHcm91cEljb24gPSAoZ3JvdXBTbHVnOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBzbHVnID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdoZXJvJykpIHJldHVybiAnZm9ybWF0LWltYWdlJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2NhcmQnKSkgcmV0dXJuICdpbmRleC1jYXJkJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2Zvcm0nKSkgcmV0dXJuICdmZWVkYmFjayc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCduYXYnKSkgcmV0dXJuICdtZW51JztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2Zvb3RlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1hZnRlcic7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdoZWFkZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYmVmb3JlJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2N0YScpKSByZXR1cm4gJ21lZ2FwaG9uZSc7XG4gIHJldHVybiAnYWRtaW4tY3VzdG9taXplcic7XG59O1xuXG5jb25zdCBjaG9vc2VWYXJpYW50SWNvbiA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBncm91cCA9IGNvbXBvbmVudC5ncm91cD8udG9Mb3dlckNhc2UoKSB8fCAnJztcbiAgY29uc3QgaWQgPSBjb21wb25lbnQuaWQudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdoZXJvJykgfHwgaWQuaW5jbHVkZXMoJ2hlcm8nKSkgcmV0dXJuICdmb3JtYXQtaW1hZ2UnO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2NhcmQnKSB8fCBpZC5pbmNsdWRlcygnY2FyZCcpKSByZXR1cm4gJ2luZGV4LWNhcmQnO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2Zvcm0nKSB8fCBpZC5pbmNsdWRlcygnZm9ybScpKSByZXR1cm4gJ2ZlZWRiYWNrJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCduYXYnKSB8fCBpZC5pbmNsdWRlcygnbmF2JykpIHJldHVybiAnbWVudSc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnZm9vdGVyJykgfHwgaWQuaW5jbHVkZXMoJ2Zvb3RlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1hZnRlcic7XG4gIGlmIChncm91cC5pbmNsdWRlcygnaGVhZGVyJykgfHwgaWQuaW5jbHVkZXMoJ2hlYWRlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1iZWZvcmUnO1xuICByZXR1cm4gJ2FkbWluLWN1c3RvbWl6ZXInO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbiBTVkcgaWNvbiBjb2RlIGJsb2NrIGZvciB0aGUgZ3JvdXAgYmxvY2sncyBpbmRleC5qcy5cbiAqL1xuY29uc3QgZ2VuZXJhdGVHcm91cFN2Z0ljb25Db2RlID0gKGdyb3VwVGl0bGU6IHN0cmluZywgZ3JvdXBTbHVnOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZ2VuZXJhdGVTdmdJY29uKGdyb3VwVGl0bGUsIGdyb3VwU2x1Zyk7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIGJsb2NrLmpzb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkQmxvY2tKc29uID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgc3VwZXJzZXRBdHRyczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPixcbiAgdmFyaWFudFNjcmVlbnNob3RzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGFueUhhc1NjcmVlbnNob3QgPSBPYmplY3QudmFsdWVzKHZhcmlhbnRTY3JlZW5zaG90cykuc29tZShCb29sZWFuKTtcblxuICAvLyBBZGQgaGFuZG9mZlZhcmlhbnQgZGlzY3JpbWluYXRvclxuICBjb25zdCBhbGxBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+ID0ge1xuICAgIGhhbmRvZmZWYXJpYW50OiB7XG4gICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgIGRlZmF1bHQ6IHZhcmlhbnRzWzBdLmNvbXBvbmVudC5pZCxcbiAgICB9LFxuICAgIC4uLnN1cGVyc2V0QXR0cnMsXG4gIH07XG5cbiAgaWYgKGFueUhhc1NjcmVlbnNob3QpIHtcbiAgICBhbGxBdHRyaWJ1dGVzLl9fcHJldmlldyA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9O1xuICB9XG5cbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIGNvbnN0IHZhcmlhdGlvbnMgPSB2YXJpYW50cy5tYXAoKHYpID0+IHtcbiAgICBjb25zdCBjb21wID0gdi5jb21wb25lbnQ7XG4gICAgY29uc3QgdmFyaWFudERlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0geyBoYW5kb2ZmVmFyaWFudDogY29tcC5pZCB9O1xuICAgIGNvbnN0IHZhcmlhdGlvbjogYW55ID0ge1xuICAgICAgbmFtZTogY29tcC5pZCxcbiAgICAgIHRpdGxlOiBjb21wLnRpdGxlLFxuICAgICAgZGVzY3JpcHRpb246IChjb21wLmRlc2NyaXB0aW9uIHx8ICcnKS5yZXBsYWNlKC9cXG5cXHMrL2csICcgJykudHJpbSgpLFxuICAgICAgYXR0cmlidXRlczogdmFyaWFudERlZmF1bHRzLFxuICAgICAgaXNBY3RpdmU6IFsnaGFuZG9mZlZhcmlhbnQnXSxcbiAgICAgIHNjb3BlOiBbJ2luc2VydGVyJ10sXG4gICAgICBpY29uOiBjaG9vc2VWYXJpYW50SWNvbihjb21wKSxcbiAgICB9O1xuXG4gICAgaWYgKHZhcmlhbnRTY3JlZW5zaG90c1tjb21wLmlkXSkge1xuICAgICAgdmFyaWF0aW9uLmV4YW1wbGUgPSB7XG4gICAgICAgIHZpZXdwb3J0V2lkdGg6IDEyMDAsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHsgaGFuZG9mZlZhcmlhbnQ6IGNvbXAuaWQsIF9fcHJldmlldzogdHJ1ZSB9LFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFyaWF0aW9uO1xuICB9KTtcblxuICBjb25zdCBibG9ja0pzb246IGFueSA9IHtcbiAgICAkc2NoZW1hOiAnaHR0cHM6Ly9zY2hlbWFzLndwLm9yZy90cnVuay9ibG9jay5qc29uJyxcbiAgICBhcGlWZXJzaW9uOiAzLFxuICAgIG5hbWU6IGBoYW5kb2ZmLyR7YmxvY2tOYW1lfWAsXG4gICAgdmVyc2lvbjogJzEuMC4wJyxcbiAgICB0aXRsZTogZ3JvdXBUaXRsZSxcbiAgICBjYXRlZ29yeTogZ3JvdXBUb0NhdGVnb3J5KGdyb3VwU2x1ZyksXG4gICAgaWNvbjogY2hvb3NlR3JvdXBJY29uKGdyb3VwU2x1ZyksXG4gICAgZGVzY3JpcHRpb246IGAke2dyb3VwVGl0bGV9IGJsb2NrIHdpdGggJHt2YXJpYW50cy5sZW5ndGh9IHZhcmlhdGlvbnMuYCxcbiAgICBrZXl3b3JkczogW2dyb3VwU2x1Z10sXG4gICAgdGV4dGRvbWFpbjogJ2hhbmRvZmYnLFxuICAgIGVkaXRvclNjcmlwdDogJ2ZpbGU6Li9pbmRleC5qcycsXG4gICAgZWRpdG9yU3R5bGU6ICdmaWxlOi4vaW5kZXguY3NzJyxcbiAgICBzdHlsZTogJ2ZpbGU6Li9zdHlsZS1pbmRleC5jc3MnLFxuICAgIHJlbmRlcjogJ2ZpbGU6Li9yZW5kZXIucGhwJyxcbiAgICBhdHRyaWJ1dGVzOiBhbGxBdHRyaWJ1dGVzLFxuICAgIHN1cHBvcnRzOiB7XG4gICAgICBhbGlnbjogWydub25lJywgJ3dpZGUnLCAnZnVsbCddLFxuICAgICAgaHRtbDogZmFsc2UsXG4gICAgfSxcbiAgICB2YXJpYXRpb25zLFxuICB9O1xuXG4gIGlmIChhbnlIYXNTY3JlZW5zaG90KSB7XG4gICAgYmxvY2tKc29uLmV4YW1wbGUgPSB7XG4gICAgICB2aWV3cG9ydFdpZHRoOiAxMjAwLFxuICAgICAgYXR0cmlidXRlczogeyBoYW5kb2ZmVmFyaWFudDogdmFyaWFudHNbMF0uY29tcG9uZW50LmlkLCBfX3ByZXZpZXc6IHRydWUgfSxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGJsb2NrSnNvbiwgbnVsbCwgMik7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIGluZGV4LmpzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIFJlcGxhY2Ugb2NjdXJyZW5jZXMgb2YgYSByZWdleCBwYXR0ZXJuIG9ubHkgaW4gY29kZSBzZWdtZW50cyxcbiAqIHNraXBwaW5nIGNvbnRlbnQgaW5zaWRlIHF1b3RlZCBzdHJpbmdzIChzaW5nbGUsIGRvdWJsZSwgb3IgYmFja3RpY2spLlxuICogVGhpcyBwcmV2ZW50cyBmaWVsZCBuYW1lIHJlbWFwcGluZyBmcm9tIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gKiBhbmQgb3RoZXIgc3RyaW5nIGxpdGVyYWxzIGluIHRoZSBnZW5lcmF0ZWQgSlNYLlxuICovXG5jb25zdCByZXBsYWNlT3V0c2lkZVN0cmluZ3MgPSAoanN4OiBzdHJpbmcsIHBhdHRlcm46IFJlZ0V4cCwgcmVwbGFjZW1lbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuICBsZXQgaSA9IDA7XG4gIGxldCBpblN0cmluZzogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzZWdTdGFydCA9IDA7XG5cbiAgd2hpbGUgKGkgPCBqc3gubGVuZ3RoKSB7XG4gICAgaWYgKGluU3RyaW5nKSB7XG4gICAgICBpZiAoanN4W2ldID09PSAnXFxcXCcpIHtcbiAgICAgICAgaSArPSAyO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChqc3hbaV0gPT09IGluU3RyaW5nKSB7XG4gICAgICAgIHNlZ21lbnRzLnB1c2goanN4LnNsaWNlKHNlZ1N0YXJ0LCBpICsgMSkpO1xuICAgICAgICBzZWdTdGFydCA9IGkgKyAxO1xuICAgICAgICBpblN0cmluZyA9IG51bGw7XG4gICAgICB9XG4gICAgICBpKys7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChqc3hbaV0gPT09ICdcIicgfHwganN4W2ldID09PSBcIidcIiB8fCBqc3hbaV0gPT09ICdgJykge1xuICAgICAgICBjb25zdCBub25TdHJpbmdQYXJ0ID0ganN4LnNsaWNlKHNlZ1N0YXJ0LCBpKTtcbiAgICAgICAgc2VnbWVudHMucHVzaChub25TdHJpbmdQYXJ0LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpKTtcbiAgICAgICAgc2VnU3RhcnQgPSBpO1xuICAgICAgICBpblN0cmluZyA9IGpzeFtpXTtcbiAgICAgICAgaSsrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChzZWdTdGFydCA8IGpzeC5sZW5ndGgpIHtcbiAgICBjb25zdCByZW1haW5pbmcgPSBqc3guc2xpY2Uoc2VnU3RhcnQpO1xuICAgIGlmIChpblN0cmluZykge1xuICAgICAgc2VnbWVudHMucHVzaChyZW1haW5pbmcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWdtZW50cy5wdXNoKHJlbWFpbmluZy5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNlZ21lbnRzLmpvaW4oJycpO1xufTtcblxuaW50ZXJmYWNlIE1lcmdlZEluZGV4UmVzdWx0IHtcbiAgaW5kZXhKczogc3RyaW5nO1xuICB2YXJpYXRpb25KczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRJbmRleEpzID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgc3VwZXJzZXRBdHRyczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPixcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4gIGFwaVVybD86IHN0cmluZyxcbiAgdmFyaWFudFNjcmVlbnNob3RzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG4pOiBNZXJnZWRJbmRleFJlc3VsdCA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcblxuICAvLyBDb2xsZWN0IGFsbCB1bmlxdWUgZmVhdHVyZXMgbmVlZGVkIGFjcm9zcyB2YXJpYW50c1xuICBsZXQgbmVlZHNNZWRpYVVwbG9hZCA9IGZhbHNlO1xuICBsZXQgbmVlZHNSYW5nZUNvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzTnVtYmVyQ29udHJvbCA9IGZhbHNlO1xuICBsZXQgbmVlZHNUb2dnbGVDb250cm9sID0gZmFsc2U7XG4gIGxldCBuZWVkc1NlbGVjdENvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzTGlua0NvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IGhhc0FycmF5UHJvcHMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc0R5bmFtaWNBcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNUYXhvbm9teUFycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55VXNlc0lubmVyQmxvY2tzID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXNSaWNoVGV4dCA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXMxMHVwSW1hZ2UgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBmYWxzZTtcblxuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgdHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2sgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtc3BlY2lmaWMgY29udGVudCAoc2lkZWJhciBwYW5lbHMgKyBwcmV2aWV3KVxuICBpbnRlcmZhY2UgVmFyaWFudEdlblJlc3VsdCB7XG4gICAgcGFuZWxzOiBzdHJpbmc7XG4gICAgcHJldmlld0pzeDogc3RyaW5nO1xuICAgIGFycmF5SGVscGVyczogc3RyaW5nO1xuICAgIGR5bmFtaWNSZXNvbHV0aW9uOiBzdHJpbmc7XG4gICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uOiBzdHJpbmc7XG4gICAgaGFzQnJlYWRjcnVtYnNGZXRjaDogYm9vbGVhbjtcbiAgICBoYXNUYXhvbm9teUZldGNoOiBib29sZWFuO1xuICAgIHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXTtcbiAgICBoYXNMaW5rRmllbGQ6IGJvb2xlYW47XG4gICAgaGFzUmljaFRleHQ6IGJvb2xlYW47XG4gICAgaGFzMTB1cEltYWdlOiBib29sZWFuO1xuICAgIGhhc0lubmVyQmxvY2tzOiBib29sZWFuO1xuICB9XG5cbiAgY29uc3QgdmFyaWFudFJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIFZhcmlhbnRHZW5SZXN1bHQ+ID0ge307XG5cbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICAgIGNvbnN0IHByb3BlcnRpZXMgPSBjb21wLnByb3BlcnRpZXM7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgZHluYW1pY0FycmF5Q29uZmlncyA9IHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncztcbiAgICBjb25zdCBoYXNEeW5hbWljID0gT2JqZWN0LmtleXMoZHluYW1pY0FycmF5Q29uZmlncykubGVuZ3RoID4gMDtcblxuICAgIC8vIERldGVjdCBmZWF0dXJlIG5lZWRzXG4gICAgaWYgKGhhc1Byb3BlcnR5VHlwZShwcm9wZXJ0aWVzLCAnaW1hZ2UnKSkgbmVlZHNNZWRpYVVwbG9hZCA9IHRydWU7XG4gICAgaWYgKGhhc09wYWNpdHlSYW5nZUZpZWxkKHByb3BlcnRpZXMpKSBuZWVkc1JhbmdlQ29udHJvbCA9IHRydWU7XG4gICAgaWYgKGhhc05vbk9wYWNpdHlOdW1iZXJGaWVsZChwcm9wZXJ0aWVzKSkgbmVlZHNOdW1iZXJDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNUb2dnbGVDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdzZWxlY3QnKSkgbmVlZHNTZWxlY3RDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNMaW5rQ29udHJvbCA9IHRydWU7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZSgocCkgPT4gcC50eXBlID09PSAnYXJyYXknKSkgaGFzQXJyYXlQcm9wcyA9IHRydWU7XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGNvbnN0IGhhc1Bvc3RzRHluYW1pYyA9IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSk7XG4gICAgICBpZiAoaGFzUG9zdHNEeW5hbWljKSB7IGFueUhhc0R5bmFtaWNBcnJheXMgPSB0cnVlOyBuZWVkc1NlbGVjdENvbnRyb2wgPSB0cnVlOyB9XG4gICAgICAvLyBCcmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIHVzZSBzaGFyZWQgY29tcG9uZW50cyDigJQgdGhleSBpbXBvcnQgdGhlaXIgb3duXG4gICAgICAvLyBUb2dnbGVDb250cm9sL1NlbGVjdENvbnRyb2wsIHNvIHdlIGRvIG5vdCBuZWVkIHRvIGFkZCB0aG9zZSB0byB0aGUgZ3JvdXAgYmxvY2sgaW1wb3J0cy5cbiAgICAgIGlmIChPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpKSBhbnlIYXNCcmVhZGNydW1ic0FycmF5cyA9IHRydWU7XG4gICAgICBpZiAoT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKSkgYW55SGFzVGF4b25vbXlBcnJheXMgPSB0cnVlO1xuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKSkgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IHRydWU7XG4gICAgfVxuICAgIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGFueVVzZXNJbm5lckJsb2NrcyA9IHRydWU7XG5cbiAgICAvLyBHZW5lcmF0ZSBwcmV2aWV3IChndWFyZCBhZ2FpbnN0IG1pc3NpbmcgY29kZS90aXRsZSBmcm9tIEFQSSlcbiAgICBjb25zdCBwcmV2aWV3UmVzdWx0OiBKc3hQcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgICAgY29tcC5jb2RlID8/ICcnLFxuICAgICAgcHJvcGVydGllcyxcbiAgICAgIGNvbXAuaWQgPz8gY29tcC50aXRsZSA/PyAndmFyaWFudCcsXG4gICAgICBjb21wLnRpdGxlID8/IGNvbXAuaWQgPz8gJ1ZhcmlhbnQnLFxuICAgICAgdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkLFxuICAgICk7XG4gICAgbGV0IHByZXZpZXdKc3ggPSBwcmV2aWV3UmVzdWx0LmpzeCA/PyAnJztcbiAgICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgICBjb25zdCB2YXJIYXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuICAgIGNvbnN0IHZhckhhc1JpY2hUZXh0ID0gcHJldmlld0pzeC5pbmNsdWRlcygnPFJpY2hUZXh0Jyk7XG4gICAgY29uc3QgdmFySGFzMTB1cEltYWdlID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJyk7XG4gICAgY29uc3QgdmFySGFzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgICBpZiAodmFySGFzTGlua0ZpZWxkKSBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHRydWU7XG4gICAgaWYgKHZhckhhc1JpY2hUZXh0KSBhbnlQcmV2aWV3VXNlc1JpY2hUZXh0ID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzMTB1cEltYWdlKSBhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSA9IHRydWU7XG4gICAgaWYgKHZhckhhc0lubmVyQmxvY2tzKSBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gdHJ1ZTtcblxuICAgIC8vIFJlbWFwIGF0dHJpYnV0ZSByZWZlcmVuY2VzIGluIHByZXZpZXcgSlNYIHVzaW5nIGZpZWxkTWFwLlxuICAgIC8vIFVzZXMgcmVwbGFjZU91dHNpZGVTdHJpbmdzIHRvIGF2b2lkIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gICAgLy8gYW5kIG90aGVyIHN0cmluZyBsaXRlcmFscyB0aGF0IGhhcHBlbiB0byBjb250YWluIHRoZSBmaWVsZCBuYW1lLlxuICAgIGZvciAoY29uc3QgW29yaWdLZXksIG1lcmdlZE5hbWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwKSkge1xuICAgICAgY29uc3Qgb3JpZ0NhbWVsID0gdG9DYW1lbENhc2Uob3JpZ0tleSk7XG4gICAgICBpZiAob3JpZ0NhbWVsICE9PSBtZXJnZWROYW1lKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke29yaWdDYW1lbH1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSByZXBsYWNlT3V0c2lkZVN0cmluZ3MocHJldmlld0pzeCwgcmVnZXgsIG1lcmdlZE5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIHBhbmVscyBmb3Igc2lkZWJhciBjb250cm9sc1xuICAgIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIGlmIChpbmxpbmVFZGl0YWJsZUZpZWxkcy5oYXMoa2V5KSAmJiBwcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcblxuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHttZXJnZWRBdHRyTmFtZX1cIlxuICAgICAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gICAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWw6IHN0cmluZykgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAgICcsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ1VSTCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLnVybCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgdXJsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPmA7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke21lcmdlZEF0dHJOYW1lfVwiXG4gICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRUYXhvbm9teT1cIiR7ZGVmYXVsdFRheG9ub215fVwiXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgICAgICA8PlxuJHtpdGVtRmllbGRzfVxuICAgICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8UGFnaW5hdGlvblNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7bWVyZ2VkQXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgICAgY29uc3QgZGVmYXVsdE1vZGUgPSBkeW5hbWljQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICAgIGlmIChjLm1vZGUgPT09ICd1aScpIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lLCBsYWJlbDogYy5sYWJlbCwgdHlwZTogJ3NlbGVjdCcsIG9wdGlvbnM6IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoYy5vcHRpb25zKSwgZGVmYXVsdDogYy5kZWZhdWx0IH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IGR5bmFtaWNDb25maWcuZmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgICBjb25zdCB0b3BLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICAgIGxldCBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgICBpZiAoaXRlbVByb3ApIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6IGNvbnRyb2xUeXBlID0gJ3NlbGVjdCc7IG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOiBjb250cm9sVHlwZSA9ICd0b2dnbGUnOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOiBjb250cm9sVHlwZSA9ICdudW1iZXInOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyAwOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGNvbnRyb2xUeXBlID0gJ3RleHQnOyBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgfHwgJyR7ZGVmYXVsdE1vZGV9JyxcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9zdHM6ICR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhuZXh0VmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoe1xuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJnczogeyAuLi5uZXh0VmFsdWUucXVlcnlBcmdzLCBwb3N0X3R5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgICAgIG1heEl0ZW1zOiAke2R5bmFtaWNDb25maWcubWF4SXRlbXMgPz8gMjB9LFxuICAgICAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICAgICAgc2hvd0V4Y2x1ZGVDdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgeyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJyAmJiAoXG4gICAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICB7LyogTWFudWFsIGFycmF5IGNvbnRyb2xzICovfVxuICAgICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xJbmRlbnQgPSAnICAgICAgICAgICAgICAgICc7XG4gICAgICAgIGxldCBjb250cm9sT3V0cHV0OiBzdHJpbmc7XG4gICAgICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgICAgY29udHJvbE91dHB1dCA9IGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIG1lcmdlZEF0dHJOYW1lLCBsYWJlbCwgY29udHJvbEluZGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBtZXJnZWRBdHRyTmFtZSxcbiAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlOiBzdHJpbmcpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHttZXJnZWRBdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICAgICAgICAgIGluZGVudDogY29udHJvbEluZGVudCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNvbnRyb2xPdXRwdXQgPSBnZW5lcmF0ZUZpZWxkQ29udHJvbChrZXksIHByb3BlcnR5LCBjdHgpO1xuICAgICAgICB9XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4ke2NvbnRyb2xPdXRwdXR9XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gRGVzaWduIFN5c3RlbSBsaW5rcyBwYW5lbCAocGVyLXZhcmlhbnQgY29tcG9uZW50IFVSTHMpXG4gICAgbGV0IGhhbmRvZmZVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBpZiAoYXBpVXJsKSB7XG4gICAgICBjb25zdCBiYXNlVXJsID0gYXBpVXJsLnJlcGxhY2UoL1xcL2FwaVxcLz8kLywgJycpO1xuICAgICAgaGFuZG9mZlVybCA9IGAke2Jhc2VVcmx9L3N5c3RlbS9jb21wb25lbnQvJHtjb21wLmlkfWA7XG4gICAgfSBlbHNlIGlmIChjb21wLnByZXZpZXcpIHtcbiAgICAgIGhhbmRvZmZVcmwgPSBjb21wLnByZXZpZXc7XG4gICAgfVxuICAgIGNvbnN0IGZpZ21hVXJsID0gY29tcC5maWdtYTtcbiAgICBpZiAoaGFuZG9mZlVybCB8fCBmaWdtYVVybCkge1xuICAgICAgY29uc3QgbGlua0J1dHRvbnM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoaGFuZG9mZlVybCkge1xuICAgICAgICBsaW5rQnV0dG9ucy5wdXNoKGAgICAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIlxuICAgICAgICAgICAgICAgICAgICBocmVmPVwiJHtoYW5kb2ZmVXJsfVwiXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIlxuICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyB9fVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICB7X18oJ1ZpZXcgaW4gSGFuZG9mZicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICA8L0J1dHRvbj5gKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWdtYVVybCkge1xuICAgICAgICBsaW5rQnV0dG9ucy5wdXNoKGAgICAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIlxuICAgICAgICAgICAgICAgICAgICBocmVmPVwiJHtmaWdtYVVybH1cIlxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIlxuICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJcbiAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyB9fVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICB7X18oJ09wZW4gaW4gRmlnbWEnLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgPC9CdXR0b24+YCk7XG4gICAgICB9XG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnRGVzaWduIFN5c3RlbScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7bGlua0J1dHRvbnMuam9pbignXFxuJyl9XG4gICAgICAgICAgICAgICAgPC9GbGV4PlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG5cbiAgICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gY29kZVxuICAgIC8vIFNwZWNpYWxpemVkIGFycmF5cyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgcmVzb2x2ZSBpbiB0aGVcbiAgICAvLyB2YXJpYXRpb24gZmlsZSdzIFByZXZpZXcgZnVuY3Rpb24gc28gdGhlIGhvb2tzIGxpdmUgaW4gdGhlIGNvcnJlY3Qgc2NvcGUuXG4gICAgLy8gRHluYW1pYyBwb3N0IGFycmF5cyByZXNvbHZlIGluIHRoZSBtYWluIGluZGV4LmpzIGVkaXQoKS5cbiAgICBsZXQgZHluYW1pY1Jlc29sdXRpb24gPSAnJztcbiAgICBsZXQgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uID0gJyc7XG4gICAgbGV0IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSBmYWxzZTtcbiAgICBsZXQgdmFySGFzVGF4b25vbXlGZXRjaCA9IGZhbHNlO1xuICAgIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2ZpZWxkS2V5XSB8fCB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgICB2YXJIYXNCcmVhZGNydW1ic0ZldGNoID0gdHJ1ZTtcbiAgICAgICAgICBjb25zdCBjYXAgPSBtZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKcyA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYCA6ICcnO1xuICAgICAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbiArPSBgXG4gIGNvbnN0IFtwcmV2aWV3JHtjYXB9LCBzZXRQcmV2aWV3JHtjYXB9XSA9IHVzZVN0YXRlKG51bGwpO1xuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgIGlmICghJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgIC50aGVuKChpdGVtcykgPT4gc2V0UHJldmlldyR7Y2FwfSgoaXRlbXMgfHwgW10pJHttYXBFeHByfSkpXG4gICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICB9LCBbJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICAgIHZhckhhc1RheG9ub215RmV0Y2ggPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNhcCA9IG1lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnMgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWAgOiAnJztcbiAgICAgICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24gKz0gYFxuICBjb25zdCBwcmV2aWV3JHtjYXB9ID0gdXNlU2VsZWN0KFxuICAgIChzZWxlY3QpID0+IHtcbiAgICAgIGlmICghJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICBpZiAoJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gJHttZXJnZWRBdHRyTmFtZX0gfHwgW107XG4gICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgIGNvbnN0IHRheG9ub215ID0gJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teSB8fCAnJHtkeW5Db25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnfSc7XG4gICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgIGNvbnN0IHRlcm1zID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldEVudGl0eVJlY29yZHMoJ3RheG9ub215JywgdGF4b25vbXksIHsgcG9zdDogcG9zdElkLCBwZXJfcGFnZTogJHtkeW5Db25maWcubWF4SXRlbXMgPz8gLTF9IH0pO1xuICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgIH0sXG4gICAgWyR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZCwgJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UsICR7bWVyZ2VkQXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9IHx8IFtdKV1cbiAgKTtcbmA7XG4gICAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uICs9IGBcbiAgY29uc3QgcHJldmlldyR7bWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke21lcmdlZEF0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke21lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2FwID0gbWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkVmFyTmFtZSA9IGByZXNvbHZlZCR7Y2FwfWA7XG4gICAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgICBkeW5hbWljUmVzb2x1dGlvbiArPSBgXG4gICAgICBjb25zdCAke3Jlc29sdmVkVmFyTmFtZX0gPSB1c2VTZWxlY3QoXG4gICAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgICBpZiAoJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgICAgY29uc3QgcXVlcnlBcmdzID0gJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge307XG4gICAgICAgICAgICBjb25zdCBwb3N0VHlwZSA9ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUgfHwgJ3Bvc3QnO1xuICAgICAgICAgICAgY29uc3QgYXJncyA9IHtcbiAgICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2R5bkNvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgICBvcmRlcjogKHF1ZXJ5QXJncy5vcmRlciB8fCAnREVTQycpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHJlY29yZHMpKSByZXR1cm4gW107XG4gICAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHttZXJnZWRBdHRyTmFtZX1GaWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge307XG4gICAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke21lcmdlZEF0dHJOYW1lfUZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiBzZWxlY3RlZFxuICAgICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWMgPyBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KSA6IG51bGw7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSxcbiAgICAgICAgWyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlLCAke21lcmdlZEF0dHJOYW1lfVBvc3RUeXBlLCBKU09OLnN0cmluZ2lmeSgke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9RmllbGRNYXBwaW5nIHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9KV1cbiAgICAgICk7XG4gICAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7bWVyZ2VkQXR0ck5hbWV9ID8/IFtdKTtcbiAgICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgICAvLyBSZW1hcCBpbiBwcmV2aWV3XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIHByZXZpZXdWYXJOYW1lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBcnJheSBoZWxwZXJzXG4gICAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnNNZXJnZWQocHJvcGVydGllcywgZmllbGRNYXApO1xuXG4gICAgdmFyaWFudFJlc3VsdHNbY29tcC5pZF0gPSB7XG4gICAgICBwYW5lbHM6IHBhbmVscy5qb2luKCdcXG5cXG4nKSxcbiAgICAgIHByZXZpZXdKc3gsXG4gICAgICBhcnJheUhlbHBlcnMsXG4gICAgICBkeW5hbWljUmVzb2x1dGlvbjogZHluYW1pY1Jlc29sdXRpb24sXG4gICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24sXG4gICAgICBoYXNCcmVhZGNydW1ic0ZldGNoOiB2YXJIYXNCcmVhZGNydW1ic0ZldGNoLFxuICAgICAgaGFzVGF4b25vbXlGZXRjaDogdmFySGFzVGF4b25vbXlGZXRjaCxcbiAgICAgIHJlc29sdmluZ0ZsYWdzLFxuICAgICAgaGFzTGlua0ZpZWxkOiB2YXJIYXNMaW5rRmllbGQsXG4gICAgICBoYXNSaWNoVGV4dDogdmFySGFzUmljaFRleHQsXG4gICAgICBoYXMxMHVwSW1hZ2U6IHZhckhhczEwdXBJbWFnZSxcbiAgICAgIGhhc0lubmVyQmxvY2tzOiB2YXJIYXNJbm5lckJsb2NrcyxcbiAgICB9O1xuICB9XG5cbiAgLy8gQnVpbGQgaW1wb3J0c1xuICBjb25zdCBibG9ja0VkaXRvckltcG9ydHMgPSBbJ3VzZUJsb2NrUHJvcHMnLCAnSW5zcGVjdG9yQ29udHJvbHMnLCAnQmxvY2tDb250cm9scyddO1xuICBpZiAobmVlZHNNZWRpYVVwbG9hZCkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICBpZiAoYW55VXNlc0lubmVyQmxvY2tzIHx8IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICBpZiAobmVlZHNMaW5rQ29udHJvbCB8fCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkge1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdMaW5rQ29udHJvbCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTGlua0NvbnRyb2wnKTtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cbiAgaWYgKChhbnlQcmV2aWV3VXNlc1JpY2hUZXh0IHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cblxuICBjb25zdCBjb21wb25lbnRJbXBvcnRzID0gWydQYW5lbEJvZHknLCAnVGV4dENvbnRyb2wnLCAnQnV0dG9uJywgJ1NlbGVjdENvbnRyb2wnLCAnRHJvcGRvd25NZW51J107XG4gIGlmIChuZWVkc1JhbmdlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdSYW5nZUNvbnRyb2wnKTtcbiAgaWYgKG5lZWRzTnVtYmVyQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdOdW1iZXJDb250cm9sJyk7XG4gIGlmIChuZWVkc1RvZ2dsZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVG9nZ2xlQ29udHJvbCcpO1xuICBpZiAoYW55SGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTcGlubmVyJyk7XG4gIGNvbnN0IGFueUhhc1JpY2h0ZXh0SW5BcnJheSA9IHZhcmlhbnRzLnNvbWUoKHYpID0+XG4gICAgT2JqZWN0LnZhbHVlcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKS5zb21lKHAgPT5cbiAgICAgIHAudHlwZSA9PT0gJ2FycmF5JyAmJiBwLml0ZW1zPy5wcm9wZXJ0aWVzICYmXG4gICAgICBPYmplY3QudmFsdWVzKHAuaXRlbXMucHJvcGVydGllcykuc29tZShpcCA9PiBpcC50eXBlID09PSAncmljaHRleHQnKVxuICAgIClcbiAgKTtcbiAgaWYgKGFueUhhc1JpY2h0ZXh0SW5BcnJheSkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdUZXh0YXJlYUNvbnRyb2wnKTtcbiAgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdGbGV4Jyk7XG4gIGlmIChuZWVkc0xpbmtDb250cm9sIHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1BvcG92ZXInKTtcblxuICAvLyBSZXBlYXRlciBpcyBvbmx5IG5lZWRlZCBmb3Igbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBwcm9wZXJ0aWVzIGFjcm9zcyBhbGwgdmFyaWFudHNcbiAgY29uc3QgYW55VmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgPSB2YXJpYW50cy5zb21lKCh2KSA9PlxuICAgIE9iamVjdC5lbnRyaWVzKHYuY29tcG9uZW50LnByb3BlcnRpZXMpLnNvbWUoXG4gICAgICAoW2ssIHBdKSA9PiBwLnR5cGUgPT09ICdhcnJheScgJiYgKCF2LmR5bmFtaWNBcnJheUNvbmZpZ3Nba10gfHwgISgnYXJyYXlUeXBlJyBpbiB2LmR5bmFtaWNBcnJheUNvbmZpZ3Nba10pKVxuICAgIClcbiAgKTtcbiAgY29uc3QgdGVuVXBJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoYW55VmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMpIHRlblVwSW1wb3J0cy5wdXNoKCdSZXBlYXRlcicpO1xuICBpZiAoYW55UHJldmlld1VzZXMxMHVwSW1hZ2UpIHRlblVwSW1wb3J0cy5wdXNoKCdJbWFnZScpO1xuICBjb25zdCB0ZW5VcEltcG9ydCA9IHRlblVwSW1wb3J0cy5sZW5ndGggPiAwID8gYGltcG9ydCB7ICR7dGVuVXBJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYCA6ICcnO1xuXG4gIGNvbnN0IHNoYXJlZE5hbWVkSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGFueUhhc0R5bmFtaWNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdEeW5hbWljUG9zdFNlbGVjdG9yJywgJ21hcFBvc3RFbnRpdHlUb0l0ZW0nKTtcbiAgaWYgKGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAoYW55SGFzVGF4b25vbXlBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmIChhbnlIYXNQYWdpbmF0aW9uQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnUGFnaW5hdGlvblNlbGVjdG9yJyk7XG5cbiAgbGV0IHNoYXJlZENvbXBvbmVudEltcG9ydCA9IHNoYXJlZE5hbWVkSW1wb3J0cy5sZW5ndGhcbiAgICA/IGBpbXBvcnQgeyAke3NoYXJlZE5hbWVkSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJy4uLy4uL3NoYXJlZCc7XFxuYFxuICAgIDogJyc7XG4gIGNvbnN0IG5lZWRzRGF0YVN0b3JlID0gYW55SGFzRHluYW1pY0FycmF5cyB8fCBhbnlIYXNUYXhvbm9teUFycmF5cztcbiAgaWYgKG5lZWRzRGF0YVN0b3JlKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyB1c2VTZWxlY3Qke2FueUhhc0JyZWFkY3J1bWJzQXJyYXlzID8gJywgc2VsZWN0JyA6ICcnfSB9IGZyb20gJ0B3b3JkcHJlc3MvZGF0YSc7XFxuaW1wb3J0IHsgc3RvcmUgYXMgY29yZURhdGFTdG9yZSB9IGZyb20gJ0B3b3JkcHJlc3MvY29yZS1kYXRhJztcXG5gO1xuICB9XG4gIGlmIChhbnlIYXNCcmVhZGNydW1ic0FycmF5cykge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IGFwaUZldGNoIGZyb20gJ0B3b3JkcHJlc3MvYXBpLWZldGNoJztcXG5gO1xuICB9XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IHsgSGFuZG9mZkxpbmtGaWVsZCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0xpbmtGaWVsZCc7XFxuYDtcbiAgfVxuXG4gIGNvbnN0IGVsZW1lbnRJbXBvcnRzID0gWydGcmFnbWVudCddO1xuICBpZiAoYW55SGFzQnJlYWRjcnVtYnNBcnJheXMpIHtcbiAgICBlbGVtZW50SW1wb3J0cy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcbiAgfVxuXG4gIC8vIEFsbCBhdHRyaWJ1dGUgbmFtZXMgZm9yIGRlc3RydWN0dXJpbmdcbiAgY29uc3QgYWxsQXR0ck5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGFsbEF0dHJOYW1lcy5hZGQoJ2hhbmRvZmZWYXJpYW50Jyk7XG4gIGZvciAoY29uc3QgYXR0ck5hbWUgb2YgT2JqZWN0LmtleXMoc3VwZXJzZXRBdHRycykpIHtcbiAgICBhbGxBdHRyTmFtZXMuYWRkKGF0dHJOYW1lKTtcbiAgfVxuICAvLyBBbHNvIGFkZCBkeW5hbWljIGFycmF5IGRlcml2ZWQgYXR0cmlidXRlIG5hbWVzXG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyh2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IGZpZWxkTWFwc1t2YXJpYW50LmNvbXBvbmVudC5pZF1bZmllbGROYW1lXSB8fCB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVRheG9ub215YCk7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVBvc3RUeXBlYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UXVlcnlBcmdzYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfVJlbmRlck1vZGVgKTtcbiAgICB9XG4gIH1cblxuICAvLyBUb29sYmFyIHZhcmlhdGlvbiBzd2l0Y2hlciBjb250cm9scyAoZm9yIEJsb2NrQ29udHJvbHMgRHJvcGRvd25NZW51KVxuICBjb25zdCB0b29sYmFyVmFyaWFudENvbnRyb2xzID0gdmFyaWFudHNcbiAgICAubWFwKFxuICAgICAgKHYpID0+XG4gICAgICAgIGAgICAgICAgIHsgdGl0bGU6ICckeyh2LmNvbXBvbmVudC50aXRsZSA/PyB2LmNvbXBvbmVudC5pZCA/PyAnJykudG9TdHJpbmcoKS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9Jywgb25DbGljazogKCkgPT4gc2V0QXR0cmlidXRlcyh7IGhhbmRvZmZWYXJpYW50OiAnJHt2LmNvbXBvbmVudC5pZCA/PyAnJ30nIH0pIH1gLFxuICAgIClcbiAgICAuam9pbignLFxcbicpO1xuXG4gIC8vIENvbGxlY3QgYWxsIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZXMgdGhhdCBhcmUgYXJyYXkgdHlwZSAoYWNyb3NzIGFsbCB2YXJpYW50cykgc28gd2UgZW1pdCBlYWNoIGhlbHBlciBvbmNlXG4gIGNvbnN0IGFsbEFycmF5TWVyZ2VkTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXModi5jb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScpIGFsbEFycmF5TWVyZ2VkTmFtZXMuYWRkKGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNoYXJlZEFycmF5SGVscGVycyA9IGdlbmVyYXRlU2hhcmVkQXJyYXlIZWxwZXJzKGFsbEFycmF5TWVyZ2VkTmFtZXMpO1xuXG4gIC8vIFZhcmlhdGlvbiBpbmNsdWRlIGltcG9ydHMgYW5kIGNvbXBvbmVudCB1c2FnZSAob25lIGZpbGUgcGVyIHZhcmlhbnQpXG4gIGNvbnN0IHZhcmlhbnRJbXBvcnRMaW5lcyA9IHZhcmlhbnRzLm1hcChcbiAgICAodikgPT4gYGltcG9ydCAqIGFzICR7dmFyaWFudElkVG9QYXNjYWwodi5jb21wb25lbnQuaWQpfSBmcm9tICcuL3ZhcmlhdGlvbnMvJHt2LmNvbXBvbmVudC5pZH0nO2AsXG4gICk7XG4gIGNvbnN0IGhlbHBlck5hbWVzTGlzdCA9IFsuLi5hbGxBcnJheU1lcmdlZE5hbWVzXS5tYXAoXG4gICAgKGEpID0+IGB1cGRhdGUke2EuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhLnNsaWNlKDEpfUl0ZW1gLFxuICApO1xuICBpZiAoYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGhlbHBlck5hbWVzTGlzdC5wdXNoKCdIYW5kb2ZmTGlua0ZpZWxkJyk7XG4gIGlmIChhbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcykgaGVscGVyTmFtZXNMaXN0LnB1c2goJ0NPTlRFTlRfQkxPQ0tTJyk7XG4gIGNvbnN0IGhlbHBlcnNPYmplY3RMaW5lID1cbiAgICBoZWxwZXJOYW1lc0xpc3QubGVuZ3RoID4gMFxuICAgICAgPyBgICAgIGNvbnN0IGhlbHBlcnMgPSB7ICR7aGVscGVyTmFtZXNMaXN0LmpvaW4oJywgJyl9IH07YFxuICAgICAgOiAnICAgIGNvbnN0IGhlbHBlcnMgPSB7fTsnO1xuXG4gIGNvbnN0IHZhcmlhbnRQYW5lbEJsb2NrcyA9IHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgICAgaWYgKCFyZXN1bHQucGFuZWxzLnRyaW0oKSkgcmV0dXJuICcnO1xuICAgICAgY29uc3QgUGFzY2FsID0gdmFyaWFudElkVG9QYXNjYWwodi5jb21wb25lbnQuaWQpO1xuICAgICAgcmV0dXJuIGAgICAgICAgIHtoYW5kb2ZmVmFyaWFudCA9PT0gJyR7di5jb21wb25lbnQuaWR9JyAmJiA8JHtQYXNjYWx9LlBhbmVscyBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfSBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfSBoZWxwZXJzPXtoZWxwZXJzfSBpc1NlbGVjdGVkPXtpc1NlbGVjdGVkfSAvPn1gO1xuICAgIH0pXG4gICAgLmZpbHRlcihCb29sZWFuKVxuICAgIC5qb2luKCdcXG4nKTtcblxuICBjb25zdCB2YXJpYW50UHJldmlld0Jsb2NrcyA9IHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4ge1xuICAgICAgY29uc3QgUGFzY2FsID0gdmFyaWFudElkVG9QYXNjYWwodi5jb21wb25lbnQuaWQpO1xuICAgICAgcmV0dXJuIGAgICAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHt2LmNvbXBvbmVudC5pZH0nICYmIDwke1Bhc2NhbH0uUHJldmlldyBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfSBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfSBoZWxwZXJzPXtoZWxwZXJzfSBpc1NlbGVjdGVkPXtpc1NlbGVjdGVkfSAvPn1gO1xuICAgIH0pXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIC8vIFBlci12YXJpYW50IEpTIGluY2x1ZGUgZmlsZSBjb250ZW50cyAod3JpdHRlbiB0byB2YXJpYXRpb25zLzxpZD4uanMpXG4gIGNvbnN0IHZhcmlhdGlvbkpzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGZvciAoY29uc3QgdiBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IHJlc3VsdCA9IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXTtcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF07XG4gICAgY29uc3QgaGVscGVyTmFtZXMgPSBbLi4uYWxsQXJyYXlNZXJnZWROYW1lc11cbiAgICAgIC5maWx0ZXIoKGF0dHJOYW1lKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXModi5jb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICAgICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIChmaWVsZE1hcHNbdi5jb21wb25lbnQuaWRdW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KSkgPT09IGF0dHJOYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5tYXAoKGEpID0+IGB1cGRhdGUke2EuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhLnNsaWNlKDEpfUl0ZW1gKTtcbiAgICB2YXJpYXRpb25Kc1t2LmNvbXBvbmVudC5pZF0gPSBnZW5lcmF0ZVZhcmlhbnRKc0ZpbGVDb250ZW50KFxuICAgICAgdixcbiAgICAgIHJlc3VsdCxcbiAgICAgIGZpZWxkTWFwLFxuICAgICAgaGVscGVyTmFtZXMsXG4gICAgICBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCxcbiAgICApO1xuICB9XG5cbiAgLy8gQnVpbGQgdmFyaWFudC1jb25kaXRpb25hbCBkeW5hbWljIHJlc29sdXRpb24gKyBhcnJheSBoZWxwZXJzXG4gIGNvbnN0IHZhcmlhbnREeW5hbWljQmxvY2tzID0gdmFyaWFudHMubWFwKCh2KSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGNvbnN0IGNvZGUgPSByZXN1bHQuZHluYW1pY1Jlc29sdXRpb24gKyByZXN1bHQuYXJyYXlIZWxwZXJzO1xuICAgIGlmICghY29kZS50cmltKCkpIHJldHVybiAnJztcbiAgICByZXR1cm4gYCAgICBpZiAoaGFuZG9mZlZhcmlhbnQgPT09ICcke3YuY29tcG9uZW50LmlkfScpIHtcbiR7Y29kZX1cbiAgICB9YDtcbiAgfSkuZmlsdGVyKEJvb2xlYW4pO1xuXG4gIC8vIEZvciBkeW5hbWljIHJlc29sdXRpb24sIHdlIG5lZWQgdGhlIHZhcmlhYmxlcyB0byBiZSBkZWNsYXJlZCBpbiBhIHNjb3BlIHZpc2libGUgdG8gdGhlIHByZXZpZXdcbiAgLy8gV2UnbGwgdXNlIGEgZGlmZmVyZW50IGFwcHJvYWNoOiBkZWNsYXJlIGFsbCBhdCB0b3AsIGNvbmRpdGlvbmFsbHkgcG9wdWxhdGVcbiAgY29uc3QgYWxsUmVzb2x2aW5nRmxhZ3MgPSB2YXJpYW50cy5mbGF0TWFwKCh2KSA9PiB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF0ucmVzb2x2aW5nRmxhZ3MpO1xuICBjb25zdCBoYXNBbnlSZXNvbHZpbmcgPSBhbGxSZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwO1xuXG4gIC8vIEdlbmVyYXRlIGR5bmFtaWMgcmVzb2x1dGlvbiBwZXIgdmFyaWFudDsgYXJyYXkgaGVscGVycyBhcmUgZW1pdHRlZCBvbmNlIGFib3ZlIChzaGFyZWRBcnJheUhlbHBlcnMpXG4gIGxldCBjb21iaW5lZER5bmFtaWNDb2RlID0gc2hhcmVkQXJyYXlIZWxwZXJzLnRyaW0oKSA/IGBcXG4ke3NoYXJlZEFycmF5SGVscGVyc31gIDogJyc7XG4gIGZvciAoY29uc3QgdiBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IHJlc3VsdCA9IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXTtcbiAgICBpZiAocmVzdWx0LmR5bmFtaWNSZXNvbHV0aW9uLnRyaW0oKSkge1xuICAgICAgY29tYmluZWREeW5hbWljQ29kZSArPSByZXN1bHQuZHluYW1pY1Jlc29sdXRpb247XG4gICAgfVxuICB9XG5cbiAgY29uc3QgYXR0ck5hbWVzTGlzdCA9IEFycmF5LmZyb20oYWxsQXR0ck5hbWVzKTtcblxuICAvLyBHZW5lcmF0ZSB2YXJpYW50LWNvbmRpdGlvbmFsIE1lZGlhUmVwbGFjZUZsb3cgdG9vbGJhciBlbnRyaWVzIGZvciBpbWFnZSBmaWVsZHNcbiAgY29uc3QgdmFyaWFudE1lZGlhUmVwbGFjZUJsb2Nrczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcCA9IHYuY29tcG9uZW50O1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW2NvbXAuaWRdO1xuICAgIGNvbnN0IGltYWdlRW50cmllczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyBtZXJnZWRBdHRyTmFtZTogc3RyaW5nIH0+ID0gW107XG5cbiAgICBjb25zdCBjb2xsZWN0SW1hZ2VzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwYXJlbnRQYXRoOiBzdHJpbmcgPSAnJykgPT4ge1xuICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgICAgY29uc3QgbWVyZ2VkTmFtZSA9IHBhcmVudFBhdGhcbiAgICAgICAgICA/IGAke2ZpZWxkTWFwW3BhcmVudFBhdGhdIHx8IHRvQ2FtZWxDYXNlKHBhcmVudFBhdGgpfWBcbiAgICAgICAgICA6IChmaWVsZE1hcFtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSkpO1xuICAgICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgICAgaW1hZ2VFbnRyaWVzLnB1c2goe1xuICAgICAgICAgICAgbGFiZWw6IHByb3AubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpLFxuICAgICAgICAgICAgbWVyZ2VkQXR0ck5hbWU6IHBhcmVudFBhdGggPyBtZXJnZWROYW1lIDogbWVyZ2VkTmFtZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgICBjb2xsZWN0SW1hZ2VzKHByb3AucHJvcGVydGllcywga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgY29sbGVjdEltYWdlcyhjb21wLnByb3BlcnRpZXMpO1xuXG4gICAgaWYgKGltYWdlRW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBtZWRpYUZsb3dzID0gaW1hZ2VFbnRyaWVzLm1hcCgoaW1nKSA9PlxuICAgICAgICBgICAgICAgICAgICAgPE1lZGlhUmVwbGFjZUZsb3dcbiAgICAgICAgICAgICAgbWVkaWFJZD17JHtpbWcubWVyZ2VkQXR0ck5hbWV9Py5pZH1cbiAgICAgICAgICAgICAgbWVkaWFVcmw9eyR7aW1nLm1lcmdlZEF0dHJOYW1lfT8uc3JjfVxuICAgICAgICAgICAgICBhbGxvd2VkVHlwZXM9e1snaW1hZ2UnXX1cbiAgICAgICAgICAgICAgYWNjZXB0PVwiaW1hZ2UvKlwiXG4gICAgICAgICAgICAgIG9uU2VsZWN0PXsobWVkaWEpID0+IHNldEF0dHJpYnV0ZXMoeyAke2ltZy5tZXJnZWRBdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9KX1cbiAgICAgICAgICAgICAgbmFtZT17X18oJyR7aW1nLmxhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAvPmBcbiAgICAgICkuam9pbignXFxuJyk7XG4gICAgICB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzLnB1c2goXG4gICAgICAgIGAgICAgICAgIHtoYW5kb2ZmVmFyaWFudCA9PT0gJyR7Y29tcC5pZH0nICYmIChcXG4gICAgICAgICAgPEJsb2NrQ29udHJvbHMgZ3JvdXA9XCJvdGhlclwiPlxcbiR7bWVkaWFGbG93c31cXG4gICAgICAgICAgPC9CbG9ja0NvbnRyb2xzPlxcbiAgICAgICAgKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICBjb25zdCBtZWRpYVJlcGxhY2VKc3ggPSB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzLmxlbmd0aCA+IDBcbiAgICA/ICdcXG4nICsgdmFyaWFudE1lZGlhUmVwbGFjZUJsb2Nrcy5qb2luKCdcXG4nKVxuICAgIDogJyc7XG5cbiAgY29uc3Qgc3ZnSWNvblN0ciA9IGdlbmVyYXRlR3JvdXBTdmdJY29uQ29kZShncm91cFRpdGxlLCBncm91cFNsdWcpO1xuXG4gIC8vIEJ1aWxkIHNjcmVlbnNob3QgaW1wb3J0cyBhbmQgbG9va3VwIG1hcCBmb3IgdmFyaWFudCBwcmV2aWV3c1xuICBjb25zdCBzY3JlZW5zaG90SW1wb3J0TGluZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHNjcmVlbnNob3RNYXBFbnRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBhbnlWYXJpYW50SGFzU2NyZWVuc2hvdCA9IHZhcmlhbnRTY3JlZW5zaG90cyAmJiBPYmplY3QudmFsdWVzKHZhcmlhbnRTY3JlZW5zaG90cykuc29tZShCb29sZWFuKTtcblxuICBpZiAoYW55VmFyaWFudEhhc1NjcmVlbnNob3QgJiYgdmFyaWFudFNjcmVlbnNob3RzKSB7XG4gICAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgICBpZiAodmFyaWFudFNjcmVlbnNob3RzW3YuY29tcG9uZW50LmlkXSkge1xuICAgICAgICBjb25zdCBzYWZlVmFyID0gJ3NjcmVlbnNob3RfJyArIHZhcmlhbnRJZFRvQ2FtZWwodi5jb21wb25lbnQuaWQpO1xuICAgICAgICBzY3JlZW5zaG90SW1wb3J0TGluZXMucHVzaChgaW1wb3J0ICR7c2FmZVZhcn0gZnJvbSAnLi9zY3JlZW5zaG90LSR7di5jb21wb25lbnQuaWR9LnBuZyc7YCk7XG4gICAgICAgIHNjcmVlbnNob3RNYXBFbnRyaWVzLnB1c2goYCAgJyR7di5jb21wb25lbnQuaWR9JzogJHtzYWZlVmFyfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBzY3JlZW5zaG90SW1wb3J0cyA9IHNjcmVlbnNob3RJbXBvcnRMaW5lcy5sZW5ndGggPiAwXG4gICAgPyBzY3JlZW5zaG90SW1wb3J0TGluZXMuam9pbignXFxuJykgKyAnXFxuJ1xuICAgIDogJyc7XG4gIGNvbnN0IHNjcmVlbnNob3RNYXBDb2RlID0gc2NyZWVuc2hvdE1hcEVudHJpZXMubGVuZ3RoID4gMFxuICAgID8gYGNvbnN0IHZhcmlhbnRTY3JlZW5zaG90cyA9IHtcXG4ke3NjcmVlbnNob3RNYXBFbnRyaWVzLmpvaW4oJyxcXG4nKX1cXG59O1xcbmBcbiAgICA6ICcnO1xuICBjb25zdCBwcmV2aWV3R3VhcmQgPSBhbnlWYXJpYW50SGFzU2NyZWVuc2hvdFxuICAgID8gYCAgICBpZiAoYXR0cmlidXRlcy5fX3ByZXZpZXcpIHtcbiAgICAgIGNvbnN0IHNjcmVlbnNob3RTcmMgPSB2YXJpYW50U2NyZWVuc2hvdHNbaGFuZG9mZlZhcmlhbnRdO1xuICAgICAgaWYgKHNjcmVlbnNob3RTcmMpIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiAgICAgICAgICAgIDxpbWcgc3JjPXtzY3JlZW5zaG90U3JjfSBhbHQ9e21ldGFkYXRhLnRpdGxlfSBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fSAvPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbmBcbiAgICA6ICcnO1xuXG4gIGNvbnN0IGluZGV4SnNUZW1wbGF0ZSA9IGBpbXBvcnQgeyByZWdpc3RlckJsb2NrVHlwZSB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2tzJztcbmltcG9ydCB7IFxuICAke2Jsb2NrRWRpdG9ySW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IFxuICAke2NvbXBvbmVudEltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG4ke3RlblVwSW1wb3J0fSR7c2hhcmVkQ29tcG9uZW50SW1wb3J0fWltcG9ydCBtZXRhZGF0YSBmcm9tICcuL2Jsb2NrLmpzb24nO1xuaW1wb3J0ICcuL2VkaXRvci5zY3NzJztcbiR7YW55SGFzRHluYW1pY0FycmF5cyA/IFwiaW1wb3J0ICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9EeW5hbWljUG9zdFNlbGVjdG9yLmVkaXRvci5zY3NzJztcXG5cIiA6ICcnfWltcG9ydCAnLi9zdHlsZS5zY3NzJztcbiR7c2NyZWVuc2hvdEltcG9ydHN9JHt2YXJpYW50SW1wb3J0TGluZXMuam9pbignXFxuJyl9XG4ke3NjcmVlbnNob3RNYXBDb2RlfWNvbnN0IGJsb2NrSWNvbiA9IChcbiAgJHtzdmdJY29uU3RyfVxuKTtcblxucmVnaXN0ZXJCbG9ja1R5cGUobWV0YWRhdGEubmFtZSwge1xuICAuLi5tZXRhZGF0YSxcbiAgaWNvbjogYmxvY2tJY29uLFxuICBlZGl0OiAoeyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBpc1NlbGVjdGVkIH0pID0+IHtcbiAgICBjb25zdCBibG9ja1Byb3BzID0gdXNlQmxvY2tQcm9wcygpO1xuJHthbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcyA/IFwiICAgIGNvbnN0IENPTlRFTlRfQkxPQ0tTID0gWydjb3JlL3BhcmFncmFwaCcsJ2NvcmUvaGVhZGluZycsJ2NvcmUvbGlzdCcsJ2NvcmUvbGlzdC1pdGVtJywnY29yZS9xdW90ZScsJ2NvcmUvaW1hZ2UnLCdjb3JlL3NlcGFyYXRvcicsJ2NvcmUvaHRtbCcsJ2NvcmUvYnV0dG9ucycsJ2NvcmUvYnV0dG9uJ107XCIgOiAnJ31cbiAgICBjb25zdCB7ICR7YXR0ck5hbWVzTGlzdC5qb2luKCcsICcpfSB9ID0gYXR0cmlidXRlcztcbiR7cHJldmlld0d1YXJkfVxuJHtjb21iaW5lZER5bmFtaWNDb2RlfVxuJHtoZWxwZXJzT2JqZWN0TGluZX1cbiAgICByZXR1cm4gKFxuICAgICAgPEZyYWdtZW50PlxuICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cImJsb2NrXCI+XG4gICAgICAgICAgPERyb3Bkb3duTWVudVxuICAgICAgICAgICAgaWNvbj1cImxheW91dFwiXG4gICAgICAgICAgICBsYWJlbD17X18oJ1ZhcmlhdGlvbicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICBjb250cm9scz17W1xuJHt0b29sYmFyVmFyaWFudENvbnRyb2xzfVxuICAgICAgICAgICAgXX1cbiAgICAgICAgICAvPlxuICAgICAgICA8L0Jsb2NrQ29udHJvbHM+JHttZWRpYVJlcGxhY2VKc3h9XG4gICAgICAgIDxJbnNwZWN0b3JDb250cm9scz5cbiR7dmFyaWFudFBhbmVsQmxvY2tzfVxuICAgICAgICA8L0luc3BlY3RvckNvbnRyb2xzPlxuXG4gICAgICAgIHsvKiBFZGl0b3IgUHJldmlldyAqL31cbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4ke3ZhcmlhbnRQcmV2aWV3QmxvY2tzfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvRnJhZ21lbnQ+XG4gICAgKTtcbiAgfSxcbiAgc2F2ZTogKCkgPT4ge1xuJHthbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcyA/ICcgICAgcmV0dXJuIDxJbm5lckJsb2Nrcy5Db250ZW50IC8+OycgOiAnICAgIHJldHVybiBudWxsOyd9XG4gIH0sXG59KTtcbmA7XG4gIHJldHVybiB7IGluZGV4SnM6IGluZGV4SnNUZW1wbGF0ZSwgdmFyaWF0aW9uSnMgfTtcbn07XG5cbi8vIOKUgOKUgOKUgCBIZWxwZXIgZ2VuZXJhdG9ycyBmb3IgbWVyZ2VkIGNvbnRleHQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlQXJyYXlIZWxwZXJzTWVyZ2VkID0gKFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBmaWVsZE1hcDogRmllbGRNYXAsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBoZWxwZXJzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3AudHlwZSAhPT0gJ2FycmF5JykgY29udGludWU7XG4gICAgY29uc3QgYXR0ck5hbWUgPSBmaWVsZE1hcFtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgaGVscGVycy5wdXNoKGBcbiAgICBjb25zdCB1cGRhdGUke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9SXRlbSA9IChpbmRleCwgZmllbGQsIHZhbHVlKSA9PiB7XG4gICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4oJHthdHRyTmFtZX0gfHwgW10pXTtcbiAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCBbZmllbGRdOiB2YWx1ZSB9O1xuICAgICAgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICB9O2ApO1xuICB9XG4gIHJldHVybiBoZWxwZXJzLmpvaW4oJ1xcbicpO1xufTtcblxuLyoqIEdlbmVyYXRlIGFycmF5IHVwZGF0ZSBoZWxwZXJzIG9uY2UgcGVyIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAoYXZvaWRzIGR1cGxpY2F0ZSBkZWNsYXJhdGlvbnMgYWNyb3NzIHZhcmlhbnRzKS4gKi9cbmNvbnN0IGdlbmVyYXRlU2hhcmVkQXJyYXlIZWxwZXJzID0gKG1lcmdlZEFycmF5QXR0ck5hbWVzOiBTZXQ8c3RyaW5nPik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhlbHBlcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgYXR0ck5hbWUgb2YgbWVyZ2VkQXJyYXlBdHRyTmFtZXMpIHtcbiAgICBjb25zdCBoZWxwZXJOYW1lID0gYHVwZGF0ZSR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1JdGVtYDtcbiAgICBoZWxwZXJzLnB1c2goYFxuICAgIGNvbnN0ICR7aGVscGVyTmFtZX0gPSAoaW5kZXgsIGZpZWxkLCB2YWx1ZSkgPT4ge1xuICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uKCR7YXR0ck5hbWV9IHx8IFtdKV07XG4gICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgW2ZpZWxkXTogdmFsdWUgfTtcbiAgICAgIHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgfTtgKTtcbiAgfVxuICByZXR1cm4gaGVscGVycy5qb2luKCdcXG4nKTtcbn07XG5cbi8qKiBDb2xsZWN0IGF0dHJpYnV0ZSBuYW1lcyByZWZlcmVuY2VkIGluIEpTWCAoc2V0QXR0cmlidXRlcyh7IHg6IG9yIHZhbHVlPXt4fSkgc28gd2UgZGVzdHJ1Y3R1cmUgdGhlbSBldmVuIGlmIG5vdCBpbiBmaWVsZE1hcC4gKi9cbmNvbnN0IGNvbGxlY3RBdHRyTmFtZXNGcm9tSnN4ID0gKGpzeDogc3RyaW5nKTogU2V0PHN0cmluZz4gPT4ge1xuICBjb25zdCBuYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBzZXRBdHRyUmVnZXggPSAvc2V0QXR0cmlidXRlc1xccypcXChcXHMqXFx7XFxzKihbYS16QS1aXyRdW2EtekEtWjAtOV8kXSopXFxzKjovZztcbiAgbGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG4gIHdoaWxlICgobSA9IHNldEF0dHJSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIGNvbnN0IHZhbHVlUmVnZXggPSAvdmFsdWU9XFx7XFxzKihbYS16QS1aXyRdW2EtekEtWjAtOV8kXSopKD86XFxzKltcXHxcXD9cXCZcXHxcXCFdfFtcXHNcXG5cXHJdKlxcP1xcP3xbXFxzXFxuXFxyXSpcXHxcXHwpL2c7XG4gIHdoaWxlICgobSA9IHZhbHVlUmVnZXguZXhlYyhqc3gpKSAhPT0gbnVsbCkgbmFtZXMuYWRkKG1bMV0pO1xuICBjb25zdCBjb25kUmVnZXggPSAvXFx7XFxzKihbYS16QS1aXyRdW2EtekEtWjAtOV8kXSopXFxzKiYmL2c7XG4gIHdoaWxlICgobSA9IGNvbmRSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIHJldHVybiBuYW1lcztcbn07XG5cbi8qKiBHZW5lcmF0ZSB0aGUgSlMgY29udGVudCBmb3Igb25lIHZhcmlhdGlvbiBpbmNsdWRlIGZpbGUgKGV4cG9ydHMgUGFuZWxzIGFuZCBQcmV2aWV3KS4gKi9cbmNvbnN0IGdlbmVyYXRlVmFyaWFudEpzRmlsZUNvbnRlbnQgPSAoXG4gIHZhcmlhbnQ6IFZhcmlhbnRJbmZvLFxuICByZXN1bHQ6IHsgcGFuZWxzOiBzdHJpbmc7IHByZXZpZXdKc3g6IHN0cmluZzsgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uPzogc3RyaW5nOyBoYXNCcmVhZGNydW1ic0ZldGNoPzogYm9vbGVhbjsgaGFzVGF4b25vbXlGZXRjaD86IGJvb2xlYW4gfSxcbiAgZmllbGRNYXA6IEZpZWxkTWFwLFxuICBoZWxwZXJOYW1lczogc3RyaW5nW10sXG4gIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkOiBib29sZWFuLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICBjb25zdCB2YXJpYW50RHluQ29uZmlncyA9IHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncztcbiAgY29uc3QgZnJvbUZpZWxkTWFwID0gbmV3IFNldChPYmplY3QudmFsdWVzKGZpZWxkTWFwKSk7XG4gIC8vIFNjYW4gcHJldmlldyBKU1ggYW5kIHBhbmVsIEpTWCBmb3IgYXR0cmlidXRlIG5hbWVzIHRvIGRlc3RydWN0dXJlLlxuICBjb25zdCBmcm9tUHJldmlldyA9IGNvbGxlY3RBdHRyTmFtZXNGcm9tSnN4KHJlc3VsdC5wcmV2aWV3SnN4ICsgJ1xcbicgKyByZXN1bHQucGFuZWxzKTtcbiAgLy8gQ29sbGVjdCB2YXJpYWJsZSBuYW1lcyBkZWNsYXJlZCBsb2NhbGx5IGJ5IHRoZSBzcGVjaWFsaXplZCByZXNvbHV0aW9uIGNvZGVcbiAgLy8gKGUuZy4gcHJldmlld0JyZWFkY3J1bWIgZnJvbSB1c2VTdGF0ZSwgcHJldmlld1RhZ3MgZnJvbSB1c2VTZWxlY3QpLlxuICAvLyBUaGVzZSBtdXN0IE5PVCBiZSBkZXN0cnVjdHVyZWQgZnJvbSBhdHRyaWJ1dGVzIG9yIHRoZXknbGwgY29uZmxpY3QuXG4gIGNvbnN0IGxvY2FsbHlEZWNsYXJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAocmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbikge1xuICAgIGNvbnN0IHN0YXRlTWF0Y2ggPSByZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uLm1hdGNoQWxsKC9jb25zdFxccytcXFsoXFx3KyksXFxzKihcXHcrKVxcXVxccyo9XFxzKnVzZVN0YXRlL2cpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzdGF0ZU1hdGNoKSB7IGxvY2FsbHlEZWNsYXJlZC5hZGQobVsxXSk7IGxvY2FsbHlEZWNsYXJlZC5hZGQobVsyXSk7IH1cbiAgICBjb25zdCBzZWxlY3RNYXRjaCA9IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24ubWF0Y2hBbGwoL2NvbnN0XFxzKyhcXHcrKVxccyo9XFxzKnVzZVNlbGVjdC9nKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygc2VsZWN0TWF0Y2gpIHsgbG9jYWxseURlY2xhcmVkLmFkZChtWzFdKTsgfVxuICB9XG4gIGNvbnN0IHJlc2VydmVkID0gbmV3IFNldChbJ2luZGV4JywgJ3ZhbHVlJywgJ2l0ZW0nLCAnZScsICdrZXknLCAnb3BlbiddKTtcbiAgZnJvbVByZXZpZXcuZm9yRWFjaCgobmFtZSkgPT4ge1xuICAgIGlmICghcmVzZXJ2ZWQuaGFzKG5hbWUpICYmICFsb2NhbGx5RGVjbGFyZWQuaGFzKG5hbWUpKSBmcm9tRmllbGRNYXAuYWRkKG5hbWUpO1xuICB9KTtcbiAgLy8gRW5zdXJlIHNwZWNpYWxpemVkIGFycmF5IHN5bnRoZXRpYyBhdHRyaWJ1dGVzIGFyZSBkZXN0cnVjdHVyZWRcbiAgZm9yIChjb25zdCBbZmllbGRLZXksIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudER5bkNvbmZpZ3MpKSB7XG4gICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtmaWVsZEtleV0gfHwgdG9DYW1lbENhc2UoZmllbGRLZXkpO1xuICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykgfHwgaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZGApO1xuICAgIH1cbiAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICBmcm9tRmllbGRNYXAuYWRkKGAke21lcmdlZEF0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGF0dHJOYW1lcyA9IFsuLi5mcm9tRmllbGRNYXBdO1xuICBjb25zdCBoZWxwZXJzRGVzdHJ1Y3QgPSBbLi4uaGVscGVyTmFtZXNdO1xuICBpZiAoYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGhlbHBlcnNEZXN0cnVjdC5wdXNoKCdIYW5kb2ZmTGlua0ZpZWxkJyk7XG4gIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGhlbHBlcnNEZXN0cnVjdC5wdXNoKCdDT05URU5UX0JMT0NLUycpO1xuXG4gIGNvbnN0IGF0dHJEZXN0cnVjdCA9IGF0dHJOYW1lcy5sZW5ndGggPyBgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xcbiAgYCA6ICcnO1xuICBjb25zdCBoZWxwZXJzRGVzdHJ1Y3RMaW5lID1cbiAgICBoZWxwZXJzRGVzdHJ1Y3QubGVuZ3RoID4gMCA/IGAgIGNvbnN0IHsgJHtoZWxwZXJzRGVzdHJ1Y3Quam9pbignLCAnKX0gfSA9IGhlbHBlcnM7XFxuICBgIDogJyc7XG5cbiAgY29uc3QgcHJvcHNMaXN0ID0gYW55UHJldmlld1VzZXNMaW5rRmllbGQgPyAneyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBoZWxwZXJzLCBpc1NlbGVjdGVkIH0nIDogJ3sgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaGVscGVycyB9JztcbiAgY29uc3QgcGFuZWxzRXhwb3J0ID1cbiAgICByZXN1bHQucGFuZWxzLnRyaW0oKSA9PT0gJydcbiAgICAgID8gYGV4cG9ydCBmdW5jdGlvbiBQYW5lbHMoKSB7IHJldHVybiBudWxsOyB9YFxuICAgICAgOiBgZXhwb3J0IGZ1bmN0aW9uIFBhbmVscygke3Byb3BzTGlzdH0pIHtcbiR7YXR0ckRlc3RydWN0fSR7aGVscGVyc0Rlc3RydWN0TGluZX0gIHJldHVybiAoXG4gICAgPD5cbiR7cmVzdWx0LnBhbmVsc31cbiAgICA8Lz5cbiAgKTtcbn1gO1xuXG4gIC8vIERldGVybWluZSB3aGljaCBzaGFyZWQgc2VsZWN0b3IgY29tcG9uZW50cyB0aGlzIHZhcmlhbnQncyBwYW5lbHMgdXNlXG4gIGNvbnN0IHZhcmlhbnRIYXNCcmVhZGNydW1icyA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpO1xuICBjb25zdCB2YXJpYW50SGFzVGF4b25vbXkgPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKTtcbiAgY29uc3QgdmFyaWFudEhhc1BhZ2luYXRpb24gPSBPYmplY3QudmFsdWVzKHZhcmlhbnREeW5Db25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpO1xuICBjb25zdCB2YXJpYW50U2hhcmVkSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHZhcmlhbnRIYXNCcmVhZGNydW1icykgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAodmFyaWFudEhhc1RheG9ub215KSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmICh2YXJpYW50SGFzUGFnaW5hdGlvbikgdmFyaWFudFNoYXJlZEltcG9ydHMucHVzaCgnUGFnaW5hdGlvblNlbGVjdG9yJyk7XG4gIGNvbnN0IHNoYXJlZFNlbGVjdG9ySW1wb3J0ID0gdmFyaWFudFNoYXJlZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHt2YXJpYW50U2hhcmVkSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJy4uLy4uLy4uL3NoYXJlZCc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gT25seSBpbXBvcnQgUmVwZWF0ZXIgd2hlbiB0aGUgdmFyaWFudCBoYXMgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHNcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJlIHNlcnZlci1yZW5kZXJlZDsgc2hhcmVkIGNvbXBvbmVudHMgaW1wb3J0IFJlcGVhdGVyIHRoZW1zZWx2ZXMpXG4gIGNvbnN0IHZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzID0gT2JqZWN0LmVudHJpZXMoY29tcC5wcm9wZXJ0aWVzKS5zb21lKFxuICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXZhcmlhbnREeW5Db25maWdzW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gdmFyaWFudER5bkNvbmZpZ3Nba10pKVxuICApO1xuICBjb25zdCB0ZW5VcEJsb2NrQ29tcG9uZW50c0ltcG9ydCA9ICh2YXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyB8fCByZXN1bHQucHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJykpXG4gICAgPyBgaW1wb3J0IHsgJHtbdmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgPyAnUmVwZWF0ZXInIDogJycsIHJlc3VsdC5wcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKSA/ICdJbWFnZScgOiAnJ10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gU3BlY2lhbGl6ZWQgYXJyYXkgcmVzb2x1dGlvbiBpbXBvcnRzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIGhvb2tzIHJ1biBpbiB0aGUgdmFyaWF0aW9uIGZpbGUpXG4gIGNvbnN0IGhhc1NwZWNpYWxpemVkUmVzb2x1dGlvbiA9ICEhKHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24/LnRyaW0oKSk7XG4gIGNvbnN0IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSByZXN1bHQuaGFzQnJlYWRjcnVtYnNGZXRjaCA/PyBmYWxzZTtcbiAgY29uc3QgdmFySGFzVGF4b25vbXlGZXRjaCA9IHJlc3VsdC5oYXNUYXhvbm9teUZldGNoID8/IGZhbHNlO1xuXG4gIGNvbnN0IGVsZW1lbnRJbXBvcnROYW1lcyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIGVsZW1lbnRJbXBvcnROYW1lcy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcblxuICBsZXQgZGF0YUltcG9ydCA9ICcnO1xuICBpZiAodmFySGFzVGF4b25vbXlGZXRjaCB8fCB2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSB7XG4gICAgY29uc3QgZGF0YU5hbWVzID0gWyd1c2VTZWxlY3QnXTtcbiAgICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkgZGF0YU5hbWVzLnB1c2goJ3NlbGVjdCcpO1xuICAgIGRhdGFJbXBvcnQgKz0gYGltcG9ydCB7ICR7ZGF0YU5hbWVzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIHtcbiAgICBkYXRhSW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICBjb25zdCBzcGVjaWFsaXplZENvZGUgPSBoYXNTcGVjaWFsaXplZFJlc29sdXRpb24gPyByZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uISA6ICcnO1xuXG4gIHJldHVybiBgLyoqXG4gKiBWYXJpYXRpb246ICR7Y29tcC50aXRsZX0gKCR7Y29tcC5pZH0pXG4gKiBHZW5lcmF0ZWQg4oCTIGRvIG5vdCBlZGl0IGJ5IGhhbmQuXG4gKi9cbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydE5hbWVzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbmltcG9ydCB7XG4gIFBhbmVsQm9keSxcbiAgVGV4dENvbnRyb2wsXG4gIFRleHRhcmVhQ29udHJvbCxcbiAgQnV0dG9uLFxuICBTZWxlY3RDb250cm9sLFxuICBSYW5nZUNvbnRyb2wsXG4gIFRvZ2dsZUNvbnRyb2wsXG4gIEZsZXgsXG4gIFBvcG92ZXIsXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBNZWRpYVVwbG9hZCwgTWVkaWFVcGxvYWRDaGVjaywgTWVkaWFSZXBsYWNlRmxvdywgTGlua0NvbnRyb2wsIFJpY2hUZXh0LCBJbm5lckJsb2NrcyB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbiR7ZGF0YUltcG9ydH0ke3RlblVwQmxvY2tDb21wb25lbnRzSW1wb3J0fSR7c2hhcmVkU2VsZWN0b3JJbXBvcnR9XG4ke3BhbmVsc0V4cG9ydH1cblxuZXhwb3J0IGZ1bmN0aW9uIFByZXZpZXcoJHtwcm9wc0xpc3R9KSB7XG4ke2F0dHJEZXN0cnVjdH0ke2hlbHBlcnNEZXN0cnVjdExpbmV9JHtzcGVjaWFsaXplZENvZGV9XG4gIHJldHVybiAoXG4ke3Jlc3VsdC5wcmV2aWV3SnN4fVxuICApO1xufVxuYDtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgcmVuZGVyLnBocCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqIEdlbmVyYXRlIHRoZSBQSFAgZnJhZ21lbnQgZm9yIG9uZSB2YXJpYW50IChleHRyYWN0aW9ucyArIHRlbXBsYXRlKS4gVXNlZCBpbiB2YXJpYXRpb24gaW5jbHVkZSBmaWxlLiAqL1xuY29uc3QgZ2VuZXJhdGVWYXJpYW50UGhwRnJhZ21lbnQgPSAoXG4gIHZhcmlhbnQ6IFZhcmlhbnRJbmZvLFxuICBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgcmljaHRleHRQcm9wcy5hZGQodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICByaWNodGV4dFByb3BzLmFkZCh0b0NhbWVsQ2FzZSh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ID09PSB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGNvbnRpbnVlO1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IG9yaWdDYW1lbCA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gZ2V0UGhwRGVmYXVsdFZhbHVlKHByb3BlcnR5KTtcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkJHtvcmlnQ2FtZWx9ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10pID8gJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10gOiAke2RlZmF1bHRWYWx1ZX07YCk7XG4gIH1cbiAgLy8gRHluYW1pYyBhcnJheSBleHRyYWN0aW9uIGZvciBzcGVjaWFsaXplZCBhcnJheSB0eXBlcyAoYnJlYWRjcnVtYnMsIHRheG9ub215LCBwYWdpbmF0aW9uKVxuICBjb25zdCBkeW5BcnJheUV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAodmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGROYW1lXSB8fCB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gY29tcC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkFycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBtZXJnZWRBdHRyTmFtZSwgZHluQ29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgZHluQXJyYXlDb2RlID0gZHluQXJyYXlFeHRyYWN0aW9ucy5sZW5ndGggPyAnXFxuJyArIGR5bkFycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJykgOiAnJztcblxuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChjb21wLmNvZGUgPz8gJycsIGNvbXAucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IChjb21wLmlkID8/ICcnKS5yZXBsYWNlKC9fL2csICctJyk7XG5cbiAgcmV0dXJuIGA8P3BocFxuLy8gQXR0cmlidXRlIGV4dHJhY3Rpb24gZm9yIHZhcmlhbnQ6ICR7Y29tcC5pZH1cbiR7ZXh0cmFjdGlvbnMuam9pbignXFxuJyl9JHtkeW5BcnJheUNvZGV9XG4/PlxuPGRpdiBjbGFzcz1cIiR7Y2xhc3NOYW1lfVwiPlxuJHt0ZW1wbGF0ZVBocH1cbjwvZGl2PlxuYDtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkUmVuZGVyUGhwID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuICBjb25zdCBkZWZhdWx0VmFyaWFudCA9IHZhcmlhbnRzWzBdLmNvbXBvbmVudC5pZDtcblxuICBjb25zdCBjYXNlczogc3RyaW5nW10gPSB2YXJpYW50cy5tYXAoXG4gICAgKHYpID0+IGAgIGNhc2UgJyR7di5jb21wb25lbnQuaWR9JzpcbiAgICBpbmNsdWRlIF9fRElSX18gLiAnL3ZhcmlhdGlvbnMvJHt2LmNvbXBvbmVudC5pZH0ucGhwJztcbiAgICBicmVhaztgLFxuICApO1xuXG4gIHJldHVybiBgPD9waHBcbi8qKlxuICogU2VydmVyLXNpZGUgcmVuZGVyaW5nIGZvciAke3RvVGl0bGVDYXNlKGdyb3VwU2x1Zyl9IChtZXJnZWQgZ3JvdXAgYmxvY2spXG4gKlxuICogQHBhcmFtIGFycmF5ICAgICRhdHRyaWJ1dGVzIEJsb2NrIGF0dHJpYnV0ZXMuXG4gKiBAcGFyYW0gc3RyaW5nICAgJGNvbnRlbnQgICAgQmxvY2sgZGVmYXVsdCBjb250ZW50LlxuICogQHBhcmFtIFdQX0Jsb2NrICRibG9jayAgICAgIEJsb2NrIGluc3RhbmNlLlxuICogQHJldHVybiBzdHJpbmcgUmV0dXJucyB0aGUgYmxvY2sgbWFya3VwLlxuICovXG5cbmlmICghZGVmaW5lZCgnQUJTUEFUSCcpKSB7XG4gIGV4aXQ7XG59XG5cbmlmICghaXNzZXQoJGF0dHJpYnV0ZXMpKSB7XG4gICRhdHRyaWJ1dGVzID0gW107XG59XG5cbiR2YXJpYW50ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJ2hhbmRvZmZWYXJpYW50J10pID8gJGF0dHJpYnV0ZXNbJ2hhbmRvZmZWYXJpYW50J10gOiAnJHtkZWZhdWx0VmFyaWFudH0nO1xuPz5cbjxkaXYgPD9waHAgZWNobyBnZXRfYmxvY2tfd3JhcHBlcl9hdHRyaWJ1dGVzKFsnY2xhc3MnID0+ICcke2Jsb2NrTmFtZX0nXSk7ID8+PlxuPD9waHBcbnN3aXRjaCAoJHZhcmlhbnQpIHtcbiR7Y2FzZXMuam9pbignXFxuJyl9XG5cbiAgZGVmYXVsdDpcbiAgICBlY2hvICc8IS0tIFVua25vd24gdmFyaWFudDogJyAuIGVzY19odG1sKCR2YXJpYW50KSAuICcgLS0+JztcbiAgICBicmVhaztcbn1cbj8+XG48L2Rpdj5cbmA7XG59O1xuXG4vLyBnZXRQaHBEZWZhdWx0VmFsdWUgaXMgaW1wb3J0ZWQgZnJvbSByZW5kZXItcGhwLnRzXG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgU0NTUyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRFZGl0b3JTY3NzID0gKHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4gZ2VuZXJhdGVFZGl0b3JTY3NzKHYuY29tcG9uZW50KSlcbiAgICAuam9pbignXFxuXFxuJyk7XG59O1xuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZFN0eWxlU2NzcyA9ICh2YXJpYW50czogVmFyaWFudEluZm9bXSk6IHN0cmluZyA9PiB7XG4gIHJldHVybiB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IGdlbmVyYXRlU3R5bGVTY3NzKHYuY29tcG9uZW50KSlcbiAgICAuam9pbignXFxuXFxuJyk7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIE1pZ3JhdGlvbiBTY2hlbWEg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkTWlncmF0aW9uU2NoZW1hID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcblxuICBjb25zdCB2YXJpYW50U2NoZW1hczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgY29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgTWlncmF0aW9uUHJvcGVydHlTY2hlbWE+ID0ge307XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgICAgcHJvcGVydGllc1trZXldID0gZXh0cmFjdE1pZ3JhdGlvblByb3BlcnR5KHByb3AsIHRydWUsIGtleSk7XG4gICAgfVxuICAgIHZhcmlhbnRTY2hlbWFzW2NvbXAuaWRdID0ge1xuICAgICAgdGl0bGU6IGNvbXAudGl0bGUsXG4gICAgICBkZXNjcmlwdGlvbjogKGNvbXAuZGVzY3JpcHRpb24gfHwgJycpLnJlcGxhY2UoL1xcblxccysvZywgJyAnKS50cmltKCksXG4gICAgICBwcm9wZXJ0aWVzLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBzY2hlbWEgPSB7XG4gICAgYmxvY2tOYW1lOiBgaGFuZG9mZi8ke2Jsb2NrTmFtZX1gLFxuICAgIHRpdGxlOiBncm91cFRpdGxlLFxuICAgIGRlc2NyaXB0aW9uOiBgJHtncm91cFRpdGxlfSBibG9jayB3aXRoICR7dmFyaWFudHMubGVuZ3RofSB2YXJpYXRpb25zLmAsXG4gICAgY2F0ZWdvcnk6IGdyb3VwVG9DYXRlZ29yeShncm91cFNsdWcpLFxuICAgIGlzTWVyZ2VkR3JvdXA6IHRydWUsXG4gICAgdmFyaWFudHM6IHZhcmlhbnRTY2hlbWFzLFxuICB9O1xuXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShzY2hlbWEsIG51bGwsIDIpO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBSRUFETUUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkUmVhZG1lID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHZhcmlhbnRMaXN0ID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiBgLSAqKiR7di5jb21wb25lbnQudGl0bGV9KiogKFxcYCR7di5jb21wb25lbnQuaWR9XFxgKWApXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIHJldHVybiBgIyAke2dyb3VwVGl0bGV9IChNZXJnZWQgR3JvdXAgQmxvY2spXG5cblRoaXMgYmxvY2sgY29tYmluZXMgJHt2YXJpYW50cy5sZW5ndGh9IGNvbXBvbmVudCB2YXJpYXRpb25zIGludG8gYSBzaW5nbGUgV29yZFByZXNzIGJsb2NrLlxuXG4jIyBWYXJpYXRpb25zXG5cbiR7dmFyaWFudExpc3R9XG5cbiMjIFVzYWdlXG5cblNlbGVjdCB0aGUgZGVzaXJlZCB2YXJpYXRpb24gZnJvbSB0aGUgYmxvY2sgdG9vbGJhciAoVmFyaWF0aW9uIGRyb3Bkb3duKS5cbkVhY2ggdmFyaWF0aW9uIGhhcyBpdHMgb3duIHNldCBvZiBjb250cm9scyBhbmQgcmVuZGVycyBpdHMgb3duIHRlbXBsYXRlLlxuYDtcbn07XG5cbi8vIOKUgOKUgOKUgCBNYWluIEdlbmVyYXRvciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIG1lcmdlZCBibG9jayBmb3IgYSBncm91cCBvZiBjb21wb25lbnRzLlxuICogVmFyaWF0aW9uIG1hcmt1cCBpcyBzcGxpdCBpbnRvIGluY2x1ZGUgZmlsZXM6IHZhcmlhdGlvbnMvPHZhcmlhbnQtaWQ+LmpzIGFuZCB2YXJpYXRpb25zLzx2YXJpYW50LWlkPi5waHAuXG4gKi9cbmV4cG9ydCBjb25zdCBnZW5lcmF0ZU1lcmdlZEJsb2NrID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgY29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdLFxuICB2YXJpYW50SW5mb3M6IFZhcmlhbnRJbmZvW10sXG4gIGFwaVVybD86IHN0cmluZyxcbiAgdmFyaWFudFNjcmVlbnNob3RzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG4pOiBHZW5lcmF0ZWRCbG9jayA9PiB7XG4gIGNvbnN0IGdyb3VwVGl0bGUgPSB0b1RpdGxlQ2FzZShncm91cFNsdWcpO1xuICBjb25zdCBzY3JlZW5zaG90cyA9IHZhcmlhbnRTY3JlZW5zaG90cyB8fCB7fTtcblxuICBjb25zdCBzdXBlcnNldFJlc3VsdCA9IGJ1aWxkU3VwZXJzZXRBdHRyaWJ1dGVzKHZhcmlhbnRJbmZvcywgZ3JvdXBTbHVnKTtcbiAgY29uc3QgeyBhdHRyaWJ1dGVzOiBzdXBlcnNldEF0dHJzLCBmaWVsZE1hcHMgfSA9IHN1cGVyc2V0UmVzdWx0O1xuXG4gIGNvbnN0IHsgaW5kZXhKcywgdmFyaWF0aW9uSnMgfSA9IGdlbmVyYXRlTWVyZ2VkSW5kZXhKcyhcbiAgICBncm91cFNsdWcsXG4gICAgZ3JvdXBUaXRsZSxcbiAgICB2YXJpYW50SW5mb3MsXG4gICAgc3VwZXJzZXRBdHRycyxcbiAgICBmaWVsZE1hcHMsXG4gICAgYXBpVXJsLFxuICAgIHNjcmVlbnNob3RzLFxuICApO1xuXG4gIGNvbnN0IHZhcmlhdGlvblBocDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudEluZm9zKSB7XG4gICAgdmFyaWF0aW9uUGhwW3ZhcmlhbnQuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudFBocEZyYWdtZW50KHZhcmlhbnQsIGZpZWxkTWFwcyk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50IHNjcmVlbnNob3QgVVJMcyBmb3IgdGhlIGNhbGxlciB0byBkb3dubG9hZFxuICBjb25zdCB2YXJpYW50U2NyZWVuc2hvdFVybHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBvbmVudHMpIHtcbiAgICBpZiAoIWNvbXAuaW1hZ2UpIGNvbnRpbnVlO1xuICAgIGlmIChjb21wLmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCBjb21wLmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHZhcmlhbnRTY3JlZW5zaG90VXJsc1tjb21wLmlkXSA9IGNvbXAuaW1hZ2U7XG4gICAgfSBlbHNlIGlmIChhcGlVcmwpIHtcbiAgICAgIHZhcmlhbnRTY3JlZW5zaG90VXJsc1tjb21wLmlkXSA9IGAke2FwaVVybH0ke2NvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wLmltYWdlfWA7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlTWVyZ2VkQmxvY2tKc29uKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zLCBzdXBlcnNldEF0dHJzLCBzY3JlZW5zaG90cyksXG4gICAgaW5kZXhKcyxcbiAgICByZW5kZXJQaHA6IGdlbmVyYXRlTWVyZ2VkUmVuZGVyUGhwKGdyb3VwU2x1ZywgdmFyaWFudEluZm9zLCBmaWVsZE1hcHMpLFxuICAgIGVkaXRvclNjc3M6IGdlbmVyYXRlTWVyZ2VkRWRpdG9yU2Nzcyh2YXJpYW50SW5mb3MpLFxuICAgIHN0eWxlU2NzczogZ2VuZXJhdGVNZXJnZWRTdHlsZVNjc3ModmFyaWFudEluZm9zKSxcbiAgICByZWFkbWU6IGdlbmVyYXRlTWVyZ2VkUmVhZG1lKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zKSxcbiAgICBtaWdyYXRpb25TY2hlbWE6IGdlbmVyYXRlTWVyZ2VkTWlncmF0aW9uU2NoZW1hKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zKSxcbiAgICB2YXJpYW50U2NyZWVuc2hvdFVybHMsXG4gICAgdmFyaWF0aW9uRmlsZXM6IHtcbiAgICAgIGpzOiB2YXJpYXRpb25KcyxcbiAgICAgIHBocDogdmFyaWF0aW9uUGhwLFxuICAgIH0sXG4gIH07XG59O1xuXG5leHBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH07XG4iXX0=