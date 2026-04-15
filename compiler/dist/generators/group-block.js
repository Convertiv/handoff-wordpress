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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9ncm91cC1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsb0NBZWtCO0FBQ2xCLDJEQUF3RjtBQUN4RixxREFBZ0c7QUFDaEcsNkNBQTZFO0FBQzdFLDZDQUEwUDtBQUMxUCxxQ0FBaUU7QUFDakUsK0NBQTRIO0FBQzVILHlDQUFzRztBQWlDdEcsaUZBQWlGO0FBRWpGOztHQUVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQXFCLEVBQUUsQ0FBcUIsRUFBVyxFQUFFO0lBQ25GLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDM0IsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUU7SUFDckQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO1NBQ3hCLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7U0FDMUQsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN4QixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDLENBQUM7QUFFRixnR0FBZ0c7QUFDaEcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFNBQWlCLEVBQVUsRUFBRTtJQUN0RCxNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMx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QUFNLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUM7UUFDakUsZUFBZSxFQUFFLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDO1FBQ25GLHFCQUFxQjtRQUNyQixjQUFjLEVBQUU7WUFDZCxFQUFFLEVBQUUsV0FBVztZQUNmLEdBQUcsRUFBRSxZQUFZO1NBQ2xCO0tBQ0YsQ0FBQztBQUNKLENBQUMsQ0FBQztBQXJEVyxRQUFBLG1CQUFtQix1QkFxRDlCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNZXJnZWQgR3JvdXAgQmxvY2sgR2VuZXJhdG9yXG4gKlxuICogQ29tYmluZXMgYWxsIEhhbmRvZmYgY29tcG9uZW50cyBpbiB0aGUgc2FtZSBncm91cCBpbnRvIGEgc2luZ2xlIFdvcmRQcmVzc1xuICogYmxvY2sgd2l0aCB2YXJpYXRpb25zLiBVc2VzIGEgc3VwZXJzZXQgYXR0cmlidXRlIHNjaGVtYSwgdmFyaWFudC1jb25kaXRpb25hbFxuICogc2lkZWJhciBjb250cm9scywgdmFyaWFudC1zcGVjaWZpYyBwcmV2aWV3IHJlbmRlcmluZywgYW5kIGEgcmVuZGVyLnBocFxuICogZGlzcGF0Y2hlci5cbiAqL1xuXG5pbXBvcnQge1xuICBIYW5kb2ZmQ29tcG9uZW50LFxuICBIYW5kb2ZmUHJvcGVydHksXG4gIEd1dGVuYmVyZ0F0dHJpYnV0ZSxcbiAgRHluYW1pY0FycmF5Q29uZmlnLFxuICBCcmVhZGNydW1ic0FycmF5Q29uZmlnLFxuICBUYXhvbm9teUFycmF5Q29uZmlnLFxuICBQYWdpbmF0aW9uQXJyYXlDb25maWcsXG4gIEdlbmVyYXRlZEJsb2NrLFxuICBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZyxcbiAgQmxvY2tKc29uT3V0cHV0LFxuICBIYW5kb2ZmTWV0YWRhdGEsXG4gIGlzQnJlYWRjcnVtYnNDb25maWcsXG4gIGlzVGF4b25vbXlDb25maWcsXG4gIGlzUGFnaW5hdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIGdlbmVyYXRlSnN4UHJldmlldywgSnN4UHJldmlld1Jlc3VsdCB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuaW1wb3J0IHsgbm9ybWFsaXplU2VsZWN0T3B0aW9ucywgdHlwZSBOb3JtYWxpemVkU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeC91dGlscyc7XG5pbXBvcnQgeyBtYXBQcm9wZXJ0eVR5cGUsIGdyb3VwVG9DYXRlZ29yeSwgdG9CbG9ja05hbWUgfSBmcm9tICcuL2Jsb2NrLWpzb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVSZW5kZXJQaHAsIGhhbmRsZWJhcnNUb1BocCwgYXJyYXlUb1BocCwgZ2V0UGhwRGVmYXVsdFZhbHVlLCBnZW5lcmF0ZUR5bmFtaWNBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24sIGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbiwgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuaW1wb3J0IHsgZ2VuZXJhdGVFZGl0b3JTY3NzLCBnZW5lcmF0ZVN0eWxlU2NzcyB9IGZyb20gJy4vc3R5bGVzJztcbmltcG9ydCB7IGdlbmVyYXRlTWlncmF0aW9uU2NoZW1hLCBNaWdyYXRpb25TY2hlbWEsIE1pZ3JhdGlvblByb3BlcnR5U2NoZW1hLCBleHRyYWN0TWlncmF0aW9uUHJvcGVydHkgfSBmcm9tICcuL3NjaGVtYS1qc29uJztcbmltcG9ydCB7IHRvVGl0bGVDYXNlLCBnZW5lcmF0ZUZpZWxkQ29udHJvbCwgZ2VuZXJhdGVBcnJheUNvbnRyb2wsIGdlbmVyYXRlU3ZnSWNvbiB9IGZyb20gJy4vaW5kZXgtanMnO1xuaW1wb3J0IHR5cGUgeyBGaWVsZENvbnRleHQgfSBmcm9tICcuL2luZGV4LWpzJztcblxuLy8g4pSA4pSA4pSAIFR5cGVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKiogUGVyLXZhcmlhbnQgbWFwcGluZyBmcm9tIG9yaWdpbmFsIGZpZWxkIG5hbWUgdG8gbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lICovXG5leHBvcnQgdHlwZSBGaWVsZE1hcCA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cbnR5cGUgQW55RHluYW1pY0FycmF5Q29uZmlnID0gRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc7XG5cbmludGVyZmFjZSBWYXJpYW50SW5mbyB7XG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudDtcbiAgZmllbGRNYXA6IEZpZWxkTWFwO1xuICBpbm5lckJsb2Nrc0ZpZWxkOiBzdHJpbmcgfCBudWxsO1xuICBkeW5hbWljQXJyYXlDb25maWdzOiBSZWNvcmQ8c3RyaW5nLCBBbnlEeW5hbWljQXJyYXlDb25maWc+O1xufVxuXG5pbnRlcmZhY2UgTWVyZ2VkRmllbGQge1xuICAvKiogVGhlIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAoY2FtZWxDYXNlKSAqL1xuICBhdHRyTmFtZTogc3RyaW5nO1xuICAvKiogVGhlIEd1dGVuYmVyZyBhdHRyaWJ1dGUgZGVmaW5pdGlvbiAqL1xuICBhdHRyaWJ1dGU6IEd1dGVuYmVyZ0F0dHJpYnV0ZTtcbiAgLyoqIFdoaWNoIHZhcmlhbnRzIHVzZSB0aGlzIGZpZWxkICovXG4gIHZhcmlhbnRzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIFN1cGVyc2V0UmVzdWx0IHtcbiAgLyoqIEFsbCBtZXJnZWQgYXR0cmlidXRlcyBrZXllZCBieSBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKi9cbiAgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPjtcbiAgLyoqIFBlci12YXJpYW50IGZpZWxkIG1hcDogb3JpZ2luYWwga2V5IOKGkiBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKi9cbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD47XG59XG5cbi8vIOKUgOKUgOKUgCBTdXBlcnNldCBBdHRyaWJ1dGUgTWVyZ2Ug4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKlxuICogVHlwZXMgYXJlIGNvbXBhdGlibGUgaWYgdGhleSBoYXZlIHRoZSBzYW1lIEd1dGVuYmVyZyBhdHRyaWJ1dGUgYHR5cGVgLlxuICovXG5jb25zdCB0eXBlc0FyZUNvbXBhdGlibGUgPSAoYTogR3V0ZW5iZXJnQXR0cmlidXRlLCBiOiBHdXRlbmJlcmdBdHRyaWJ1dGUpOiBib29sZWFuID0+IHtcbiAgaWYgKCFhIHx8ICFiKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBhLnR5cGUgPT09IGIudHlwZTtcbn07XG5cbi8qKlxuICogQ29udmVydCBhIHZhcmlhbnQgSUQgKGUuZy4gXCJoZXJvLWJhc2ljXCIsIFwiaGVyb19zZWFyY2hcIikgaW50byBhIHZhbGlkIGNhbWVsQ2FzZVxuICogaWRlbnRpZmllciBmb3IgdXNlIGluIHByZWZpeGVkIGF0dHJpYnV0ZSBuYW1lcy4gRW5zdXJlcyBnZW5lcmF0ZWQgSlMgY2FuIGRlc3RydWN0dXJlXG4gKiBhdHRyaWJ1dGVzIHdpdGhvdXQgcXVvdGluZyAobm8gaHlwaGVucyBpbiBuYW1lcykuXG4gKi9cbmNvbnN0IHZhcmlhbnRJZFRvQ2FtZWwgPSAodmFyaWFudElkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBzID0gKHZhcmlhbnRJZCA/PyAnJylcbiAgICAucmVwbGFjZSgvWy1fXShbYS16XSkvZywgKF8sIGw6IHN0cmluZykgPT4gbC50b1VwcGVyQ2FzZSgpKVxuICAgIC5yZXBsYWNlKC9bLV9dL2csICcnKTtcbiAgcmV0dXJuIHMuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBzLnNsaWNlKDEpO1xufTtcblxuLyoqIFZhcmlhbnQgSUQgdG8gUGFzY2FsQ2FzZSBmb3IgSlMgaW1wb3J0L2NvbXBvbmVudCBuYW1lIChlLmcuIGhlcm8tYXJ0aWNsZSAtPiBIZXJvQXJ0aWNsZSkuICovXG5jb25zdCB2YXJpYW50SWRUb1Bhc2NhbCA9ICh2YXJpYW50SWQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNhbWVsID0gdmFyaWFudElkVG9DYW1lbCh2YXJpYW50SWQpO1xuICByZXR1cm4gY2FtZWwuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBjYW1lbC5zbGljZSgxKTtcbn07XG5cbi8qKlxuICogTWVyZ2UgYXR0cmlidXRlcyBmcm9tIE4gY29tcG9uZW50cyBpbnRvIGEgc3VwZXJzZXQgc2NoZW1hLlxuICpcbiAqIDEuIFNoYXJlZCBmaWVsZHMgKHNhbWUgbmFtZSwgY29tcGF0aWJsZSB0eXBlKToga2VwdCBhcy1pcy5cbiAqIDIuIENvbmZsaWN0aW5nIGZpZWxkcyAoc2FtZSBuYW1lLCBkaWZmZXJlbnQgdHlwZSk6IHByZWZpeGVkIHdpdGggdmFyaWFudCBzbHVnLlxuICogMy4gVW5pcXVlIGZpZWxkczoga2VwdCBhcy1pcy5cbiAqL1xuZXhwb3J0IGNvbnN0IGJ1aWxkU3VwZXJzZXRBdHRyaWJ1dGVzID0gKFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4pOiBTdXBlcnNldFJlc3VsdCA9PiB7XG4gIGNvbnN0IGF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4gPSB7fTtcbiAgY29uc3QgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4gPSB7fTtcblxuICAvLyBGaXJzdCBwYXNzOiBjb2xsZWN0IGFsbCBmaWVsZHMgcGVyIG9yaWdpbmFsIGtleSBhY3Jvc3MgdmFyaWFudHNcbiAgY29uc3QgZmllbGRzQnlLZXk6IFJlY29yZDxcbiAgICBzdHJpbmcsXG4gICAgQXJyYXk8eyB2YXJpYW50SWQ6IHN0cmluZzsgYXR0ck5hbWU6IHN0cmluZzsgYXR0cjogR3V0ZW5iZXJnQXR0cmlidXRlIH0+XG4gID4gPSB7fTtcblxuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wb25lbnQgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgICBmaWVsZE1hcHNbY29tcG9uZW50LmlkXSA9IHt9O1xuICAgIGNvbnN0IHByZXZpZXdWYWx1ZXMgPSBjb21wb25lbnQucHJldmlld3M/LmdlbmVyaWM/LnZhbHVlcyB8fCB7fTtcblxuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgICBjb25zdCBvcmlnQXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgICAgbGV0IG1hcHBlZCA9IG1hcFByb3BlcnR5VHlwZShwcm9wZXJ0eSwgcHJldmlld1ZhbHVlc1trZXldKTtcblxuICAgICAgLy8gTm9uLWlubmVyQmxvY2tzRmllbGQgcmljaHRleHQgYmVjb21lcyBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgICAgIGlmIChtYXBwZWQgPT09IG51bGwgJiYgcHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgIT09IHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgICAgICBtYXBwZWQgPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBwcmV2aWV3VmFsdWVzW2tleV0gPz8gJycgfTtcbiAgICAgIH1cbiAgICAgIGlmIChtYXBwZWQgPT09IG51bGwpIGNvbnRpbnVlO1xuXG4gICAgICBpZiAoIWZpZWxkc0J5S2V5W2tleV0pIGZpZWxkc0J5S2V5W2tleV0gPSBbXTtcbiAgICAgIGZpZWxkc0J5S2V5W2tleV0ucHVzaCh7IHZhcmlhbnRJZDogY29tcG9uZW50LmlkLCBhdHRyTmFtZTogb3JpZ0F0dHJOYW1lLCBhdHRyOiBtYXBwZWQgfSk7XG4gICAgfVxuXG4gICAgLy8gQWxzbyBjb2xsZWN0IGR5bmFtaWMgYXJyYXkgY29udHJvbCBhdHRyaWJ1dGVzXG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGNvbnN0IGR5bkZpZWxkczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPiA9IHt9O1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1FbmFibGVkYF0gPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUVuYWJsZWRgXSA9IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9VGF4b25vbXlgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IGR5bkNvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZycgfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVNvdXJjZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ2F1dG8nIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1FbmFibGVkYF0gPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgY29uc3Qgc291cmNlRGVmYXVsdCA9IGR5bkNvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAnbWFudWFsJyA/ICdzZWxlY3QnIDogJ3F1ZXJ5JztcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVNvdXJjZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogc291cmNlRGVmYXVsdCwgZW51bTogWydxdWVyeScsICdzZWxlY3QnLCAnbWFudWFsJ10gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVBvc3RUeXBlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBkeW5Db25maWcuZGVmYXVsdFBvc3RUeXBlIHx8IGR5bkNvbmZpZy5wb3N0VHlwZXNbMF0gfHwgJ3Bvc3QnIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYF0gPSB7IHR5cGU6ICdhcnJheScsIGRlZmF1bHQ6IFtdIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1RdWVyeUFyZ3NgXSA9IHsgdHlwZTogJ29iamVjdCcsIGRlZmF1bHQ6IHsgcG9zdF90eXBlOiBkeW5Db25maWcuZGVmYXVsdFBvc3RUeXBlIHx8IGR5bkNvbmZpZy5wb3N0VHlwZXNbMF0gfHwgJ3Bvc3QnLCBwb3N0c19wZXJfcGFnZTogZHluQ29uZmlnLm1heEl0ZW1zIHx8IDYsIG9yZGVyYnk6ICdkYXRlJywgb3JkZXI6ICdERVNDJywgdGF4X3F1ZXJ5OiBbXSwgLi4uKGR5bkNvbmZpZy5kZWZhdWx0UXVlcnlBcmdzIHx8IHt9KSB9IH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgXSA9IHsgdHlwZTogJ29iamVjdCcsIGRlZmF1bHQ6IGR5bkNvbmZpZy5maWVsZE1hcHBpbmcgfHwge30gfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgXSA9IHsgdHlwZTogJ29iamVjdCcsIGRlZmF1bHQ6IHt9IH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1SZW5kZXJNb2RlYF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBkeW5Db25maWcucmVuZGVyTW9kZSB8fCAnbWFwcGVkJyB9O1xuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IFtkYUtleSwgZGFBdHRyXSBvZiBPYmplY3QuZW50cmllcyhkeW5GaWVsZHMpKSB7XG4gICAgICAgIGlmICghZmllbGRzQnlLZXlbYF9fZHluXyR7ZGFLZXl9YF0pIGZpZWxkc0J5S2V5W2BfX2R5bl8ke2RhS2V5fWBdID0gW107XG4gICAgICAgIGZpZWxkc0J5S2V5W2BfX2R5bl8ke2RhS2V5fWBdLnB1c2goeyB2YXJpYW50SWQ6IGNvbXBvbmVudC5pZCwgYXR0ck5hbWU6IGRhS2V5LCBhdHRyOiBkYUF0dHIgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gU2Vjb25kIHBhc3M6IHJlc29sdmUgY29uZmxpY3RzXG4gIGZvciAoY29uc3QgW2tleSwgZW50cmllc10gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRzQnlLZXkpKSB7XG4gICAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgIC8vIENoZWNrIGlmIGFsbCBlbnRyaWVzIGhhdmUgY29tcGF0aWJsZSB0eXBlc1xuICAgIGNvbnN0IGZpcnN0ID0gZW50cmllc1swXTtcbiAgICBjb25zdCBhbGxDb21wYXRpYmxlID0gZW50cmllcy5ldmVyeSgoZSkgPT4gdHlwZXNBcmVDb21wYXRpYmxlKGZpcnN0LmF0dHIsIGUuYXR0cikpO1xuXG4gICAgaWYgKGFsbENvbXBhdGlibGUpIHtcbiAgICAgIC8vIFNoYXJlZCBvciB1bmlxdWUgZmllbGQg4oCUIHVzZSBvcmlnaW5hbCBuYW1lXG4gICAgICBjb25zdCBtZXJnZWROYW1lID0gZmlyc3QuYXR0ck5hbWU7XG4gICAgICAvLyBVc2UgdGhlIGZpcnN0IHZhcmlhbnQncyBhdHRyaWJ1dGUgZGVmaW5pdGlvbiAoZGVmYXVsdHMgbWF5IGRpZmZlciwgdGFrZSBmaXJzdClcbiAgICAgIGF0dHJpYnV0ZXNbbWVyZ2VkTmFtZV0gPSBmaXJzdC5hdHRyO1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmICgha2V5LnN0YXJ0c1dpdGgoJ19fZHluXycpKSB7XG4gICAgICAgICAgZmllbGRNYXBzW2VudHJ5LnZhcmlhbnRJZF1ba2V5XSA9IG1lcmdlZE5hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29uZmxpY3Rpbmcg4oCUIHByZWZpeCB3aXRoIHZhcmlhbnQgc2x1ZyAobXVzdCBiZSB2YWxpZCBKUyBpZGVudGlmaWVyIGZvciBkZXN0cnVjdHVyaW5nKVxuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGNvbnN0IHZhcmlhbnRDYW1lbCA9IHZhcmlhbnRJZFRvQ2FtZWwoZW50cnkudmFyaWFudElkKTtcbiAgICAgICAgY29uc3QgcHJlZml4ZWQgPSB2YXJpYW50Q2FtZWwgKyBlbnRyeS5hdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGVudHJ5LmF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBhdHRyaWJ1dGVzW3ByZWZpeGVkXSA9IGVudHJ5LmF0dHI7XG4gICAgICAgIGlmICgha2V5LnN0YXJ0c1dpdGgoJ19fZHluXycpKSB7XG4gICAgICAgICAgZmllbGRNYXBzW2VudHJ5LnZhcmlhbnRJZF1ba2V5XSA9IHByZWZpeGVkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQWx3YXlzIGFkZCBhbGlnblxuICBhdHRyaWJ1dGVzLmFsaWduID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ2Z1bGwnIH07XG5cbiAgcmV0dXJuIHsgYXR0cmlidXRlcywgZmllbGRNYXBzIH07XG59O1xuXG4vLyDilIDilIDilIAgQmxvY2sgSWNvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgY2hvb3NlR3JvdXBJY29uID0gKGdyb3VwU2x1Zzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qgc2x1ZyA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnaGVybycpKSByZXR1cm4gJ2Zvcm1hdC1pbWFnZSc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdjYXJkJykpIHJldHVybiAnaW5kZXgtY2FyZCc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdmb3JtJykpIHJldHVybiAnZmVlZGJhY2snO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnbmF2JykpIHJldHVybiAnbWVudSc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdmb290ZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYWZ0ZXInO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnaGVhZGVyJykpIHJldHVybiAndGFibGUtcm93LWJlZm9yZSc7XG4gIGlmIChzbHVnLmluY2x1ZGVzKCdjdGEnKSkgcmV0dXJuICdtZWdhcGhvbmUnO1xuICByZXR1cm4gJ2FkbWluLWN1c3RvbWl6ZXInO1xufTtcblxuY29uc3QgY2hvb3NlVmFyaWFudEljb24gPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogc3RyaW5nID0+IHtcbiAgY29uc3QgZ3JvdXAgPSBjb21wb25lbnQuZ3JvdXA/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XG4gIGNvbnN0IGlkID0gY29tcG9uZW50LmlkLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChncm91cC5pbmNsdWRlcygnaGVybycpIHx8IGlkLmluY2x1ZGVzKCdoZXJvJykpIHJldHVybiAnZm9ybWF0LWltYWdlJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdjYXJkJykgfHwgaWQuaW5jbHVkZXMoJ2NhcmQnKSkgcmV0dXJuICdpbmRleC1jYXJkJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdmb3JtJykgfHwgaWQuaW5jbHVkZXMoJ2Zvcm0nKSkgcmV0dXJuICdmZWVkYmFjayc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnbmF2JykgfHwgaWQuaW5jbHVkZXMoJ25hdicpKSByZXR1cm4gJ21lbnUnO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2Zvb3RlcicpIHx8IGlkLmluY2x1ZGVzKCdmb290ZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYWZ0ZXInO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2hlYWRlcicpIHx8IGlkLmluY2x1ZGVzKCdoZWFkZXInKSkgcmV0dXJuICd0YWJsZS1yb3ctYmVmb3JlJztcbiAgcmV0dXJuICdhZG1pbi1jdXN0b21pemVyJztcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYW4gU1ZHIGljb24gY29kZSBibG9jayBmb3IgdGhlIGdyb3VwIGJsb2NrJ3MgaW5kZXguanMuXG4gKi9cbmNvbnN0IGdlbmVyYXRlR3JvdXBTdmdJY29uQ29kZSA9IChncm91cFRpdGxlOiBzdHJpbmcsIGdyb3VwU2x1Zzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGdlbmVyYXRlU3ZnSWNvbihncm91cFRpdGxlLCBncm91cFNsdWcpO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBibG9jay5qc29uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZEJsb2NrSnNvbiA9IChcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwVGl0bGU6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIHN1cGVyc2V0QXR0cnM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4sXG4gIHZhcmlhbnRTY3JlZW5zaG90czogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhbnlIYXNTY3JlZW5zaG90ID0gT2JqZWN0LnZhbHVlcyh2YXJpYW50U2NyZWVuc2hvdHMpLnNvbWUoQm9vbGVhbik7XG5cbiAgLy8gQWRkIGhhbmRvZmZWYXJpYW50IGRpc2NyaW1pbmF0b3JcbiAgY29uc3QgYWxsQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgR3V0ZW5iZXJnQXR0cmlidXRlPiA9IHtcbiAgICBoYW5kb2ZmVmFyaWFudDoge1xuICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICBkZWZhdWx0OiB2YXJpYW50c1swXS5jb21wb25lbnQuaWQsXG4gICAgfSxcbiAgICAuLi5zdXBlcnNldEF0dHJzLFxuICB9O1xuXG4gIGlmIChhbnlIYXNTY3JlZW5zaG90KSB7XG4gICAgYWxsQXR0cmlidXRlcy5fX3ByZXZpZXcgPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogZmFsc2UgfTtcbiAgfVxuXG4gIGNvbnN0IGJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcblxuICBjb25zdCB2YXJpYXRpb25zID0gdmFyaWFudHMubWFwKCh2KSA9PiB7XG4gICAgY29uc3QgY29tcCA9IHYuY29tcG9uZW50O1xuICAgIGNvbnN0IHZhcmlhbnREZWZhdWx0czogUmVjb3JkPHN0cmluZywgYW55PiA9IHsgaGFuZG9mZlZhcmlhbnQ6IGNvbXAuaWQgfTtcbiAgICBjb25zdCB2YXJpYXRpb246IGFueSA9IHtcbiAgICAgIG5hbWU6IGNvbXAuaWQsXG4gICAgICB0aXRsZTogY29tcC50aXRsZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAoY29tcC5kZXNjcmlwdGlvbiB8fCAnJykucmVwbGFjZSgvXFxuXFxzKy9nLCAnICcpLnRyaW0oKSxcbiAgICAgIGF0dHJpYnV0ZXM6IHZhcmlhbnREZWZhdWx0cyxcbiAgICAgIGlzQWN0aXZlOiBbJ2hhbmRvZmZWYXJpYW50J10sXG4gICAgICBzY29wZTogWydpbnNlcnRlciddLFxuICAgICAgaWNvbjogY2hvb3NlVmFyaWFudEljb24oY29tcCksXG4gICAgfTtcblxuICAgIGlmICh2YXJpYW50U2NyZWVuc2hvdHNbY29tcC5pZF0pIHtcbiAgICAgIHZhcmlhdGlvbi5leGFtcGxlID0ge1xuICAgICAgICB2aWV3cG9ydFdpZHRoOiAxMjAwLFxuICAgICAgICBhdHRyaWJ1dGVzOiB7IGhhbmRvZmZWYXJpYW50OiBjb21wLmlkLCBfX3ByZXZpZXc6IHRydWUgfSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhcmlhdGlvbjtcbiAgfSk7XG5cbiAgY29uc3QgYmxvY2tKc29uOiBhbnkgPSB7XG4gICAgJHNjaGVtYTogJ2h0dHBzOi8vc2NoZW1hcy53cC5vcmcvdHJ1bmsvYmxvY2suanNvbicsXG4gICAgYXBpVmVyc2lvbjogMyxcbiAgICBuYW1lOiBgaGFuZG9mZi8ke2Jsb2NrTmFtZX1gLFxuICAgIHZlcnNpb246ICcxLjAuMCcsXG4gICAgdGl0bGU6IGdyb3VwVGl0bGUsXG4gICAgY2F0ZWdvcnk6IGdyb3VwVG9DYXRlZ29yeShncm91cFNsdWcpLFxuICAgIGljb246IGNob29zZUdyb3VwSWNvbihncm91cFNsdWcpLFxuICAgIGRlc2NyaXB0aW9uOiBgJHtncm91cFRpdGxlfSBibG9jayB3aXRoICR7dmFyaWFudHMubGVuZ3RofSB2YXJpYXRpb25zLmAsXG4gICAga2V5d29yZHM6IFtncm91cFNsdWddLFxuICAgIHRleHRkb21haW46ICdoYW5kb2ZmJyxcbiAgICBlZGl0b3JTY3JpcHQ6ICdmaWxlOi4vaW5kZXguanMnLFxuICAgIGVkaXRvclN0eWxlOiAnZmlsZTouL2luZGV4LmNzcycsXG4gICAgc3R5bGU6ICdmaWxlOi4vc3R5bGUtaW5kZXguY3NzJyxcbiAgICByZW5kZXI6ICdmaWxlOi4vcmVuZGVyLnBocCcsXG4gICAgYXR0cmlidXRlczogYWxsQXR0cmlidXRlcyxcbiAgICBzdXBwb3J0czoge1xuICAgICAgYWxpZ246IFsnbm9uZScsICd3aWRlJywgJ2Z1bGwnXSxcbiAgICAgIGh0bWw6IGZhbHNlLFxuICAgIH0sXG4gICAgdmFyaWF0aW9ucyxcbiAgfTtcblxuICBpZiAoYW55SGFzU2NyZWVuc2hvdCkge1xuICAgIGJsb2NrSnNvbi5leGFtcGxlID0ge1xuICAgICAgdmlld3BvcnRXaWR0aDogMTIwMCxcbiAgICAgIGF0dHJpYnV0ZXM6IHsgaGFuZG9mZlZhcmlhbnQ6IHZhcmlhbnRzWzBdLmNvbXBvbmVudC5pZCwgX19wcmV2aWV3OiB0cnVlIH0sXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShibG9ja0pzb24sIG51bGwsIDIpO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBpbmRleC5qcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqXG4gKiBSZXBsYWNlIG9jY3VycmVuY2VzIG9mIGEgcmVnZXggcGF0dGVybiBvbmx5IGluIGNvZGUgc2VnbWVudHMsXG4gKiBza2lwcGluZyBjb250ZW50IGluc2lkZSBxdW90ZWQgc3RyaW5ncyAoc2luZ2xlLCBkb3VibGUsIG9yIGJhY2t0aWNrKS5cbiAqIFRoaXMgcHJldmVudHMgZmllbGQgbmFtZSByZW1hcHBpbmcgZnJvbSBjb3JydXB0aW5nIENTUyBjbGFzcyBuYW1lc1xuICogYW5kIG90aGVyIHN0cmluZyBsaXRlcmFscyBpbiB0aGUgZ2VuZXJhdGVkIEpTWC5cbiAqL1xuY29uc3QgcmVwbGFjZU91dHNpZGVTdHJpbmdzID0gKGpzeDogc3RyaW5nLCBwYXR0ZXJuOiBSZWdFeHAsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGkgPSAwO1xuICBsZXQgaW5TdHJpbmc6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgc2VnU3RhcnQgPSAwO1xuXG4gIHdoaWxlIChpIDwganN4Lmxlbmd0aCkge1xuICAgIGlmIChpblN0cmluZykge1xuICAgICAgaWYgKGpzeFtpXSA9PT0gJ1xcXFwnKSB7XG4gICAgICAgIGkgKz0gMjtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoanN4W2ldID09PSBpblN0cmluZykge1xuICAgICAgICBzZWdtZW50cy5wdXNoKGpzeC5zbGljZShzZWdTdGFydCwgaSArIDEpKTtcbiAgICAgICAgc2VnU3RhcnQgPSBpICsgMTtcbiAgICAgICAgaW5TdHJpbmcgPSBudWxsO1xuICAgICAgfVxuICAgICAgaSsrO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoanN4W2ldID09PSAnXCInIHx8IGpzeFtpXSA9PT0gXCInXCIgfHwganN4W2ldID09PSAnYCcpIHtcbiAgICAgICAgY29uc3Qgbm9uU3RyaW5nUGFydCA9IGpzeC5zbGljZShzZWdTdGFydCwgaSk7XG4gICAgICAgIHNlZ21lbnRzLnB1c2gobm9uU3RyaW5nUGFydC5yZXBsYWNlKHBhdHRlcm4sIHJlcGxhY2VtZW50KSk7XG4gICAgICAgIHNlZ1N0YXJ0ID0gaTtcbiAgICAgICAgaW5TdHJpbmcgPSBqc3hbaV07XG4gICAgICAgIGkrKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoc2VnU3RhcnQgPCBqc3gubGVuZ3RoKSB7XG4gICAgY29uc3QgcmVtYWluaW5nID0ganN4LnNsaWNlKHNlZ1N0YXJ0KTtcbiAgICBpZiAoaW5TdHJpbmcpIHtcbiAgICAgIHNlZ21lbnRzLnB1c2gocmVtYWluaW5nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VnbWVudHMucHVzaChyZW1haW5pbmcucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzZWdtZW50cy5qb2luKCcnKTtcbn07XG5cbmludGVyZmFjZSBNZXJnZWRJbmRleFJlc3VsdCB7XG4gIGluZGV4SnM6IHN0cmluZztcbiAgdmFyaWF0aW9uSnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkSW5kZXhKcyA9IChcbiAgZ3JvdXBTbHVnOiBzdHJpbmcsXG4gIGdyb3VwVGl0bGU6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIHN1cGVyc2V0QXR0cnM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuICBhcGlVcmw/OiBzdHJpbmcsXG4gIHZhcmlhbnRTY3JlZW5zaG90cz86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LFxuKTogTWVyZ2VkSW5kZXhSZXN1bHQgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG5cbiAgLy8gQ29sbGVjdCBhbGwgdW5pcXVlIGZlYXR1cmVzIG5lZWRlZCBhY3Jvc3MgdmFyaWFudHNcbiAgbGV0IG5lZWRzTWVkaWFVcGxvYWQgPSBmYWxzZTtcbiAgbGV0IG5lZWRzUmFuZ2VDb250cm9sID0gZmFsc2U7XG4gIGxldCBuZWVkc1RvZ2dsZUNvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzU2VsZWN0Q29udHJvbCA9IGZhbHNlO1xuICBsZXQgbmVlZHNMaW5rQ29udHJvbCA9IGZhbHNlO1xuICBsZXQgaGFzQXJyYXlQcm9wcyA9IGZhbHNlO1xuICBsZXQgYW55SGFzRHluYW1pY0FycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55SGFzQnJlYWRjcnVtYnNBcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc1RheG9ub215QXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNQYWdpbmF0aW9uQXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlVc2VzSW5uZXJCbG9ja3MgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlc1JpY2hUZXh0ID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcyA9IGZhbHNlO1xuXG4gIGNvbnN0IGhhc1Byb3BlcnR5VHlwZSA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCB0eXBlOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCBjaGVjayA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09IHR5cGUpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShjaGVjayk7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgdmFyaWFudC1zcGVjaWZpYyBjb250ZW50IChzaWRlYmFyIHBhbmVscyArIHByZXZpZXcpXG4gIGludGVyZmFjZSBWYXJpYW50R2VuUmVzdWx0IHtcbiAgICBwYW5lbHM6IHN0cmluZztcbiAgICBwcmV2aWV3SnN4OiBzdHJpbmc7XG4gICAgYXJyYXlIZWxwZXJzOiBzdHJpbmc7XG4gICAgZHluYW1pY1Jlc29sdXRpb246IHN0cmluZztcbiAgICBzcGVjaWFsaXplZFJlc29sdXRpb246IHN0cmluZztcbiAgICBoYXNCcmVhZGNydW1ic0ZldGNoOiBib29sZWFuO1xuICAgIGhhc1RheG9ub215RmV0Y2g6IGJvb2xlYW47XG4gICAgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdO1xuICAgIGhhc0xpbmtGaWVsZDogYm9vbGVhbjtcbiAgICBoYXNSaWNoVGV4dDogYm9vbGVhbjtcbiAgICBoYXMxMHVwSW1hZ2U6IGJvb2xlYW47XG4gICAgaGFzSW5uZXJCbG9ja3M6IGJvb2xlYW47XG4gIH1cblxuICBjb25zdCB2YXJpYW50UmVzdWx0czogUmVjb3JkPHN0cmluZywgVmFyaWFudEdlblJlc3VsdD4gPSB7fTtcblxuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IGNvbXAucHJvcGVydGllcztcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1tjb21wLmlkXTtcbiAgICBjb25zdCBkeW5hbWljQXJyYXlDb25maWdzID0gdmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzO1xuICAgIGNvbnN0IGhhc0R5bmFtaWMgPSBPYmplY3Qua2V5cyhkeW5hbWljQXJyYXlDb25maWdzKS5sZW5ndGggPiAwO1xuXG4gICAgLy8gRGV0ZWN0IGZlYXR1cmUgbmVlZHNcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdpbWFnZScpKSBuZWVkc01lZGlhVXBsb2FkID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdudW1iZXInKSB8fCBjb21wLmNvZGUuaW5jbHVkZXMoJ292ZXJsYXknKSkgbmVlZHNSYW5nZUNvbnRyb2wgPSB0cnVlO1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2Jvb2xlYW4nKSB8fCBoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2J1dHRvbicpKSBuZWVkc1RvZ2dsZUNvbnRyb2wgPSB0cnVlO1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ3NlbGVjdCcpKSBuZWVkc1NlbGVjdENvbnRyb2wgPSB0cnVlO1xuICAgIGlmIChoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUocHJvcGVydGllcywgJ2J1dHRvbicpKSBuZWVkc0xpbmtDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKChwKSA9PiBwLnR5cGUgPT09ICdhcnJheScpKSBoYXNBcnJheVByb3BzID0gdHJ1ZTtcbiAgICBpZiAoaGFzRHluYW1pYykge1xuICAgICAgY29uc3QgaGFzUG9zdHNEeW5hbWljID0gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiAhKCdhcnJheVR5cGUnIGluIGMpKTtcbiAgICAgIGlmIChoYXNQb3N0c0R5bmFtaWMpIHsgYW55SGFzRHluYW1pY0FycmF5cyA9IHRydWU7IG5lZWRzU2VsZWN0Q29udHJvbCA9IHRydWU7IH1cbiAgICAgIC8vIEJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24gdXNlIHNoYXJlZCBjb21wb25lbnRzIOKAlCB0aGV5IGltcG9ydCB0aGVpciBvd25cbiAgICAgIC8vIFRvZ2dsZUNvbnRyb2wvU2VsZWN0Q29udHJvbCwgc28gd2UgZG8gbm90IG5lZWQgdG8gYWRkIHRob3NlIHRvIHRoZSBncm91cCBibG9jayBpbXBvcnRzLlxuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNCcmVhZGNydW1ic0NvbmZpZyhjKSkpIGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzID0gdHJ1ZTtcbiAgICAgIGlmIChPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpKSBhbnlIYXNUYXhvbm9teUFycmF5cyA9IHRydWU7XG4gICAgICBpZiAoT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpKSBhbnlIYXNQYWdpbmF0aW9uQXJyYXlzID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkgYW55VXNlc0lubmVyQmxvY2tzID0gdHJ1ZTtcblxuICAgIC8vIEdlbmVyYXRlIHByZXZpZXcgKGd1YXJkIGFnYWluc3QgbWlzc2luZyBjb2RlL3RpdGxlIGZyb20gQVBJKVxuICAgIGNvbnN0IHByZXZpZXdSZXN1bHQ6IEpzeFByZXZpZXdSZXN1bHQgPSBnZW5lcmF0ZUpzeFByZXZpZXcoXG4gICAgICBjb21wLmNvZGUgPz8gJycsXG4gICAgICBwcm9wZXJ0aWVzLFxuICAgICAgY29tcC5pZCA/PyBjb21wLnRpdGxlID8/ICd2YXJpYW50JyxcbiAgICAgIGNvbXAudGl0bGUgPz8gY29tcC5pZCA/PyAnVmFyaWFudCcsXG4gICAgICB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQsXG4gICAgKTtcbiAgICBsZXQgcHJldmlld0pzeCA9IHByZXZpZXdSZXN1bHQuanN4ID8/ICcnO1xuICAgIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gcHJldmlld1Jlc3VsdC5pbmxpbmVFZGl0YWJsZUZpZWxkcztcblxuICAgIGNvbnN0IHZhckhhc0xpbmtGaWVsZCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxIYW5kb2ZmTGlua0ZpZWxkJyk7XG4gICAgY29uc3QgdmFySGFzUmljaFRleHQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8UmljaFRleHQnKTtcbiAgICBjb25zdCB2YXJIYXMxMHVwSW1hZ2UgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKTtcbiAgICBjb25zdCB2YXJIYXNJbm5lckJsb2NrcyA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbm5lckJsb2NrcycpO1xuICAgIGlmICh2YXJIYXNMaW5rRmllbGQpIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzUmljaFRleHQpIGFueVByZXZpZXdVc2VzUmljaFRleHQgPSB0cnVlO1xuICAgIGlmICh2YXJIYXMxMHVwSW1hZ2UpIGFueVByZXZpZXdVc2VzMTB1cEltYWdlID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzSW5uZXJCbG9ja3MpIGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSB0cnVlO1xuXG4gICAgLy8gUmVtYXAgYXR0cmlidXRlIHJlZmVyZW5jZXMgaW4gcHJldmlldyBKU1ggdXNpbmcgZmllbGRNYXAuXG4gICAgLy8gVXNlcyByZXBsYWNlT3V0c2lkZVN0cmluZ3MgdG8gYXZvaWQgY29ycnVwdGluZyBDU1MgY2xhc3MgbmFtZXNcbiAgICAvLyBhbmQgb3RoZXIgc3RyaW5nIGxpdGVyYWxzIHRoYXQgaGFwcGVuIHRvIGNvbnRhaW4gdGhlIGZpZWxkIG5hbWUuXG4gICAgZm9yIChjb25zdCBbb3JpZ0tleSwgbWVyZ2VkTmFtZV0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRNYXApKSB7XG4gICAgICBjb25zdCBvcmlnQ2FtZWwgPSB0b0NhbWVsQ2FzZShvcmlnS2V5KTtcbiAgICAgIGlmIChvcmlnQ2FtZWwgIT09IG1lcmdlZE5hbWUpIHtcbiAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7b3JpZ0NhbWVsfVxcXFxiYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHJlcGxhY2VPdXRzaWRlU3RyaW5ncyhwcmV2aWV3SnN4LCByZWdleCwgbWVyZ2VkTmFtZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcGFuZWxzIGZvciBzaWRlYmFyIGNvbnRyb2xzXG4gICAgY29uc3QgcGFuZWxzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyB8fCBwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgICAgaWYgKGlubGluZUVkaXRhYmxlRmllbGRzLmhhcyhrZXkpICYmIHByb3BlcnR5LnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpO1xuICAgICAgY29uc3QgZHluYW1pY0NvbmZpZyA9IGR5bmFtaWNBcnJheUNvbmZpZ3M/LltrZXldO1xuXG4gICAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5JyAmJiBkeW5hbWljQ29uZmlnKSB7XG4gICAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8QnJlYWRjcnVtYnNTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke21lcmdlZEF0dHJOYW1lfVwiXG4gICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgY29uc3QgdGF4b25vbXlPcHRpb25zID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQsIHZhbHVlOiB0IH0pKTtcbiAgICAgICAgICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmtleXMoaXRlbVByb3BzKS5sZW5ndGggPiAwXG4gICAgICAgICAgICA/IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbDogc3RyaW5nKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbH0gfSlgLFxuICAgICAgICAgICAgICAgICAgaW5kZW50OiAnICAgICAgICAgICAgICAgICAgJyxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBjdHgpO1xuICAgICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJylcbiAgICAgICAgICAgIDogYCAgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ0xhYmVsJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0ubGFiZWwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIGxhYmVsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPlxuICAgICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnVVJMJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0udXJsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCB1cmw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+YDtcbiAgICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgICAgIDxUYXhvbm9teVNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7bWVyZ2VkQXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgdGF4b25vbXlPcHRpb25zPXske0pTT04uc3RyaW5naWZ5KHRheG9ub215T3B0aW9ucyl9fVxuICAgICAgICAgICAgICAgICAgZGVmYXVsdFRheG9ub215PVwiJHtkZWZhdWx0VGF4b25vbXl9XCJcbiAgICAgICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICByZW5kZXJNYW51YWxJdGVtcz17KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4gICAgICAgICAgICAgICAgICAgIDw+XG4ke2l0ZW1GaWVsZHN9XG4gICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgICAgIDxQYWdpbmF0aW9uU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHttZXJnZWRBdHRyTmFtZX1cIlxuICAgICAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgICBjb25zdCBkZWZhdWx0TW9kZSA9IGR5bmFtaWNDb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0NvbmZpZyA9IGR5bmFtaWNDb25maWcuaXRlbU92ZXJyaWRlc0NvbmZpZyB8fCB7fTtcbiAgICAgICAgICBjb25zdCBhZHZhbmNlZEZpZWxkczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgb3B0aW9ucz86IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PjsgZGVmYXVsdD86IGFueSB9PiA9IFtdO1xuXG4gICAgICAgICAgZm9yIChjb25zdCBbbmFtZSwgY10gb2YgT2JqZWN0LmVudHJpZXMoaXRlbU92ZXJyaWRlc0NvbmZpZykgYXMgQXJyYXk8W3N0cmluZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWddPikge1xuICAgICAgICAgICAgaWYgKGMubW9kZSA9PT0gJ3VpJykgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWUsIGxhYmVsOiBjLmxhYmVsLCB0eXBlOiAnc2VsZWN0Jywgb3B0aW9uczogbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhjLm9wdGlvbnMpLCBkZWZhdWx0OiBjLmRlZmF1bHQgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gZHluYW1pY0NvbmZpZy5maWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgICAgZm9yIChjb25zdCBbZmllbGRQYXRoLCBtYXBwaW5nVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwcGluZykpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbWFwcGluZ1ZhbHVlID09PSAnb2JqZWN0JyAmJiBtYXBwaW5nVmFsdWUgIT09IG51bGwgJiYgKG1hcHBpbmdWYWx1ZSBhcyBhbnkpLnR5cGUgPT09ICdtYW51YWwnKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHRvcEtleSA9IGZpZWxkUGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1t0b3BLZXldO1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZExhYmVsID0gaXRlbVByb3A/Lm5hbWUgfHwgdG9UaXRsZUNhc2UodG9wS2V5KTtcbiAgICAgICAgICAgICAgbGV0IGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgICBsZXQgb3B0aW9uczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICBsZXQgZGVmYXVsdFZhbDogYW55ID0gaXRlbVByb3A/LmRlZmF1bHQgPz8gJyc7XG4gICAgICAgICAgICAgIGlmIChpdGVtUHJvcCkge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoaXRlbVByb3AudHlwZSkge1xuICAgICAgICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzogY29udHJvbFR5cGUgPSAnc2VsZWN0Jzsgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoaXRlbVByb3Aub3B0aW9ucyk7IGJyZWFrO1xuICAgICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6IGNvbnRyb2xUeXBlID0gJ3RvZ2dsZSc7IGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IGZhbHNlOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6IGNvbnRyb2xUeXBlID0gJ251bWJlcic7IGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IDA7IGJyZWFrO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdDogY29udHJvbFR5cGUgPSAndGV4dCc7IGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZTogZmllbGRQYXRoLCBsYWJlbDogZmllbGRMYWJlbCwgdHlwZTogY29udHJvbFR5cGUsIG9wdGlvbnMsIGRlZmF1bHQ6IGRlZmF1bHRWYWwgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8RHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgdmFsdWU9e3tcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSB8fCAnJHtkZWZhdWx0TW9kZX0nLFxuICAgICAgICAgICAgICAgICAgICBwb3N0VHlwZTogJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnlBcmdzOiAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3N0czogJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICBpdGVtT3ZlcnJpZGVzOiAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge31cbiAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KG5leHRWYWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7XG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlOiBuZXh0VmFsdWUuc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVBvc3RUeXBlOiBuZXh0VmFsdWUucG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9UXVlcnlBcmdzOiB7IC4uLm5leHRWYWx1ZS5xdWVyeUFyZ3MsIHBvc3RfdHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0czogbmV4dFZhbHVlLnNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgICAgICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlczogbmV4dFZhbHVlLml0ZW1PdmVycmlkZXMgPz8ge31cbiAgICAgICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICAgICAgb3B0aW9ucz17e1xuICAgICAgICAgICAgICAgICAgICBwb3N0VHlwZXM6ICR7SlNPTi5zdHJpbmdpZnkoZHluYW1pY0NvbmZpZy5wb3N0VHlwZXMpfSxcbiAgICAgICAgICAgICAgICAgICAgbWF4SXRlbXM6ICR7ZHluYW1pY0NvbmZpZy5tYXhJdGVtcyA/PyAyMH0sXG4gICAgICAgICAgICAgICAgICAgIHRleHREb21haW46ICdoYW5kb2ZmJyxcbiAgICAgICAgICAgICAgICAgICAgc2hvd0RhdGVGaWx0ZXI6ICR7KGR5bmFtaWNDb25maWcgYXMgYW55KS5zaG93RGF0ZUZpbHRlciA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZSd9LFxuICAgICAgICAgICAgICAgICAgICBzaG93RXhjbHVkZUN1cnJlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzOiAke0pTT04uc3RyaW5naWZ5KGFkdmFuY2VkRmllbGRzKX1cbiAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICB7JHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnICYmIChcbiAgICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICAgIHsvKiBNYW51YWwgYXJyYXkgY29udHJvbHMgKi99XG4gICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY29udHJvbEluZGVudCA9ICcgICAgICAgICAgICAgICAgJztcbiAgICAgICAgbGV0IGNvbnRyb2xPdXRwdXQ6IHN0cmluZztcbiAgICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgICBjb250cm9sT3V0cHV0ID0gZ2VuZXJhdGVBcnJheUNvbnRyb2woa2V5LCBwcm9wZXJ0eSwgbWVyZ2VkQXR0ck5hbWUsIGxhYmVsLCBjb250cm9sSW5kZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IG1lcmdlZEF0dHJOYW1lLFxuICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gYHNldEF0dHJpYnV0ZXMoeyAke21lcmdlZEF0dHJOYW1lfTogJHt2YWx1ZX0gfSlgLFxuICAgICAgICAgICAgaW5kZW50OiBjb250cm9sSW5kZW50LFxuICAgICAgICAgIH07XG4gICAgICAgICAgY29udHJvbE91dHB1dCA9IGdlbmVyYXRlRmllbGRDb250cm9sKGtleSwgcHJvcGVydHksIGN0eCk7XG4gICAgICAgIH1cbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiR7Y29udHJvbE91dHB1dH1cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBEZXNpZ24gU3lzdGVtIGxpbmtzIHBhbmVsIChwZXItdmFyaWFudCBjb21wb25lbnQgVVJMcylcbiAgICBsZXQgaGFuZG9mZlVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGlmIChhcGlVcmwpIHtcbiAgICAgIGNvbnN0IGJhc2VVcmwgPSBhcGlVcmwucmVwbGFjZSgvXFwvYXBpXFwvPyQvLCAnJyk7XG4gICAgICBoYW5kb2ZmVXJsID0gYCR7YmFzZVVybH0vc3lzdGVtL2NvbXBvbmVudC8ke2NvbXAuaWR9YDtcbiAgICB9IGVsc2UgaWYgKGNvbXAucHJldmlldykge1xuICAgICAgaGFuZG9mZlVybCA9IGNvbXAucHJldmlldztcbiAgICB9XG4gICAgY29uc3QgZmlnbWFVcmwgPSBjb21wLmZpZ21hO1xuICAgIGlmIChoYW5kb2ZmVXJsIHx8IGZpZ21hVXJsKSB7XG4gICAgICBjb25zdCBsaW5rQnV0dG9uczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChoYW5kb2ZmVXJsKSB7XG4gICAgICAgIGxpbmtCdXR0b25zLnB1c2goYCAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9XCIke2hhbmRvZmZVcmx9XCJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCJcbiAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiXG4gICAgICAgICAgICAgICAgICAgIGljb249XCJ2aXNpYmlsaXR5XCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtfXygnVmlldyBpbiBIYW5kb2ZmJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPmApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZ21hVXJsKSB7XG4gICAgICAgIGxpbmtCdXR0b25zLnB1c2goYCAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9XCIke2ZpZ21hVXJsfVwiXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIlxuICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19XG4gICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtfXygnT3BlbiBpbiBGaWdtYScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICA8L0J1dHRvbj5gKTtcbiAgICAgIH1cbiAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCdEZXNpZ24gU3lzdGVtJywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT5cbiAgICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtsaW5rQnV0dG9ucy5qb2luKCdcXG4nKX1cbiAgICAgICAgICAgICAgICA8L0ZsZXg+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgIH1cblxuICAgIC8vIER5bmFtaWMgYXJyYXkgcmVzb2x1dGlvbiBjb2RlXG4gICAgLy8gU3BlY2lhbGl6ZWQgYXJyYXlzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uKSByZXNvbHZlIGluIHRoZVxuICAgIC8vIHZhcmlhdGlvbiBmaWxlJ3MgUHJldmlldyBmdW5jdGlvbiBzbyB0aGUgaG9va3MgbGl2ZSBpbiB0aGUgY29ycmVjdCBzY29wZS5cbiAgICAvLyBEeW5hbWljIHBvc3QgYXJyYXlzIHJlc29sdmUgaW4gdGhlIG1haW4gaW5kZXguanMgZWRpdCgpLlxuICAgIGxldCBkeW5hbWljUmVzb2x1dGlvbiA9ICcnO1xuICAgIGxldCBzcGVjaWFsaXplZFJlc29sdXRpb24gPSAnJztcbiAgICBsZXQgdmFySGFzQnJlYWRjcnVtYnNGZXRjaCA9IGZhbHNlO1xuICAgIGxldCB2YXJIYXNUYXhvbm9teUZldGNoID0gZmFsc2U7XG4gICAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGRLZXldIHx8IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICAgIHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNhcCA9IG1lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCddKTtcbiAgICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgIDogJyc7XG4gICAgICAgICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uICs9IGBcbiAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCEke21lcmdlZEF0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgaWYgKCFwb3N0SWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgIC5jYXRjaCgoKSA9PiBzZXRQcmV2aWV3JHtjYXB9KFtdKSk7XG4gIH0sIFske21lcmdlZEF0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgICAgdmFySGFzVGF4b25vbXlGZXRjaCA9IHRydWU7XG4gICAgICAgICAgY29uc3QgY2FwID0gbWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJywgJ3NsdWcnXSk7XG4gICAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKcyA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYCA6ICcnO1xuICAgICAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbiArPSBgXG4gIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgKHNlbGVjdCkgPT4ge1xuICAgICAgaWYgKCEke21lcmdlZEF0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke21lcmdlZEF0dHJOYW1lfSB8fCBbXTtcbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgY29uc3QgdGF4b25vbXkgPSAke21lcmdlZEF0dHJOYW1lfVRheG9ub215IHx8ICcke2R5bkNvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgIGNvbnN0IHJlc3RCYXNlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldFRheG9ub215KHRheG9ub215KT8ucmVzdF9iYXNlO1xuICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2R5bkNvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICBpZiAoIXRlcm1zKSByZXR1cm4gW107XG4gICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgfSxcbiAgICBbJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkLCAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSwgJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX0gfHwgW10pXVxuICApO1xuYDtcbiAgICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke21lcmdlZEF0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZHxTb3VyY2V8VGF4b25vbXkpYCwgJ2cnKTtcbiAgICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24gKz0gYFxuICBjb25zdCBwcmV2aWV3JHttZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpfSA9IFtdOyAvLyBQYWdpbmF0aW9uIHJlbmRlcnMgb24gdGhlIGZyb250ZW5kXG5gO1xuICAgICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7bWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjYXAgPSBtZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCBwcmV2aWV3VmFyTmFtZSA9IGBwcmV2aWV3JHtjYXB9YDtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICAgIHJlc29sdmluZ0ZsYWdzLnB1c2gocmVzb2x2aW5nVmFyTmFtZSk7XG4gICAgICAgIGR5bmFtaWNSZXNvbHV0aW9uICs9IGBcbiAgICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBzZWxlY3QoY29yZURhdGFTdG9yZSk7XG4gICAgICAgICAgaWYgKCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAncXVlcnknKSB7XG4gICAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZSB8fCAncG9zdCc7XG4gICAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7ZHluQ29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgICBvcmRlcmJ5OiBxdWVyeUFyZ3Mub3JkZXJieSB8fCAnZGF0ZScsXG4gICAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgICBzdGF0dXM6ICdwdWJsaXNoJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgICBpZiAocmVjb3JkcyA9PT0gbnVsbCB8fCByZWNvcmRzID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke21lcmdlZEF0dHJOYW1lfUZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgICBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW107XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7bWVyZ2VkQXR0ck5hbWV9RmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlYyA9IHN0b3JlLmdldEVudGl0eVJlY29yZCgncG9zdFR5cGUnLCBzZWwudHlwZSB8fCAncG9zdCcsIHNlbC5pZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9LFxuICAgICAgICBbJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UsICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9UXVlcnlBcmdzIHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdKSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1GaWVsZE1hcHBpbmcgfHwge30pLCBKU09OLnN0cmluZ2lmeSgke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge30pXVxuICAgICAgKTtcbiAgICAgIGNvbnN0ICR7cHJldmlld1Zhck5hbWV9ID0gJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHttZXJnZWRBdHRyTmFtZX0gPz8gW10pO1xuICAgICAgY29uc3QgJHtyZXNvbHZpbmdWYXJOYW1lfSA9ICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAgIC8vIFJlbWFwIGluIHByZXZpZXdcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFycmF5IGhlbHBlcnNcbiAgICBjb25zdCBhcnJheUhlbHBlcnMgPSBnZW5lcmF0ZUFycmF5SGVscGVyc01lcmdlZChwcm9wZXJ0aWVzLCBmaWVsZE1hcCk7XG5cbiAgICB2YXJpYW50UmVzdWx0c1tjb21wLmlkXSA9IHtcbiAgICAgIHBhbmVsczogcGFuZWxzLmpvaW4oJ1xcblxcbicpLFxuICAgICAgcHJldmlld0pzeCxcbiAgICAgIGFycmF5SGVscGVycyxcbiAgICAgIGR5bmFtaWNSZXNvbHV0aW9uOiBkeW5hbWljUmVzb2x1dGlvbixcbiAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbixcbiAgICAgIGhhc0JyZWFkY3J1bWJzRmV0Y2g6IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gsXG4gICAgICBoYXNUYXhvbm9teUZldGNoOiB2YXJIYXNUYXhvbm9teUZldGNoLFxuICAgICAgcmVzb2x2aW5nRmxhZ3MsXG4gICAgICBoYXNMaW5rRmllbGQ6IHZhckhhc0xpbmtGaWVsZCxcbiAgICAgIGhhc1JpY2hUZXh0OiB2YXJIYXNSaWNoVGV4dCxcbiAgICAgIGhhczEwdXBJbWFnZTogdmFySGFzMTB1cEltYWdlLFxuICAgICAgaGFzSW5uZXJCbG9ja3M6IHZhckhhc0lubmVyQmxvY2tzLFxuICAgIH07XG4gIH1cblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTWVkaWFVcGxvYWQnLCAnTWVkaWFVcGxvYWRDaGVjaycsICdNZWRpYVJlcGxhY2VGbG93Jyk7XG4gIGlmIChhbnlVc2VzSW5uZXJCbG9ja3MgfHwgYW55UHJldmlld1VzZXNJbm5lckJsb2NrcykgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIGlmIChuZWVkc0xpbmtDb250cm9sIHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuICBpZiAoKGFueVByZXZpZXdVc2VzUmljaFRleHQgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nLCAnU2VsZWN0Q29udHJvbCcsICdEcm9wZG93bk1lbnUnXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgaWYgKGFueUhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuICBjb21wb25lbnRJbXBvcnRzLnB1c2goJ0ZsZXgnKTtcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIGZvciBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IHByb3BlcnRpZXMgYWNyb3NzIGFsbCB2YXJpYW50c1xuICBjb25zdCBhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA9IHZhcmlhbnRzLnNvbWUoKHYpID0+XG4gICAgT2JqZWN0LmVudHJpZXModi5jb21wb25lbnQucHJvcGVydGllcykuc29tZShcbiAgICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXYuZHluYW1pY0FycmF5Q29uZmlnc1trXSB8fCAhKCdhcnJheVR5cGUnIGluIHYuZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICAgKVxuICApO1xuICBjb25zdCB0ZW5VcEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cykgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIGlmIChhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSkgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDAgPyBgaW1wb3J0IHsgJHt0ZW5VcEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gIDogJyc7XG5cbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoYW55SGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoYW55SGFzQnJlYWRjcnVtYnNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmIChhbnlIYXNUYXhvbm9teUFycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGFueUhhc1BhZ2luYXRpb25BcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBhbnlIYXNEeW5hbWljQXJyYXlzIHx8IGFueUhhc1RheG9ub215QXJyYXlzO1xuICBpZiAobmVlZHNEYXRhU3RvcmUpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IHVzZVNlbGVjdCR7YW55SGFzQnJlYWRjcnVtYnNBcnJheXMgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cbiAgaWYgKGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gO1xuICB9XG5cbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChhbnlIYXNCcmVhZGNydW1ic0FycmF5cykge1xuICAgIGVsZW1lbnRJbXBvcnRzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuICB9XG5cbiAgLy8gQWxsIGF0dHJpYnV0ZSBuYW1lcyBmb3IgZGVzdHJ1Y3R1cmluZ1xuICBjb25zdCBhbGxBdHRyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgYWxsQXR0ck5hbWVzLmFkZCgnaGFuZG9mZlZhcmlhbnQnKTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBPYmplY3Qua2V5cyhzdXBlcnNldEF0dHJzKSkge1xuICAgIGFsbEF0dHJOYW1lcy5hZGQoYXR0ck5hbWUpO1xuICB9XG4gIC8vIEFsc28gYWRkIGR5bmFtaWMgYXJyYXkgZGVyaXZlZCBhdHRyaWJ1dGUgbmFtZXNcbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gZmllbGRNYXBzW3ZhcmlhbnQuY29tcG9uZW50LmlkXVtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRvb2xiYXIgdmFyaWF0aW9uIHN3aXRjaGVyIGNvbnRyb2xzIChmb3IgQmxvY2tDb250cm9scyBEcm9wZG93bk1lbnUpXG4gIGNvbnN0IHRvb2xiYXJWYXJpYW50Q29udHJvbHMgPSB2YXJpYW50c1xuICAgIC5tYXAoXG4gICAgICAodikgPT5cbiAgICAgICAgYCAgICAgICAgeyB0aXRsZTogJyR7KHYuY29tcG9uZW50LnRpdGxlID8/IHYuY29tcG9uZW50LmlkID8/ICcnKS50b1N0cmluZygpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCBvbkNsaWNrOiAoKSA9PiBzZXRBdHRyaWJ1dGVzKHsgaGFuZG9mZlZhcmlhbnQ6ICcke3YuY29tcG9uZW50LmlkID8/ICcnfScgfSkgfWAsXG4gICAgKVxuICAgIC5qb2luKCcsXFxuJyk7XG5cbiAgLy8gQ29sbGVjdCBhbGwgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lcyB0aGF0IGFyZSBhcnJheSB0eXBlIChhY3Jvc3MgYWxsIHZhcmlhbnRzKSBzbyB3ZSBlbWl0IGVhY2ggaGVscGVyIG9uY2VcbiAgY29uc3QgYWxsQXJyYXlNZXJnZWROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF07XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JykgYWxsQXJyYXlNZXJnZWROYW1lcy5hZGQoZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2hhcmVkQXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMoYWxsQXJyYXlNZXJnZWROYW1lcyk7XG5cbiAgLy8gVmFyaWF0aW9uIGluY2x1ZGUgaW1wb3J0cyBhbmQgY29tcG9uZW50IHVzYWdlIChvbmUgZmlsZSBwZXIgdmFyaWFudClcbiAgY29uc3QgdmFyaWFudEltcG9ydExpbmVzID0gdmFyaWFudHMubWFwKFxuICAgICh2KSA9PiBgaW1wb3J0ICogYXMgJHt2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCl9IGZyb20gJy4vdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfSc7YCxcbiAgKTtcbiAgY29uc3QgaGVscGVyTmFtZXNMaXN0ID0gWy4uLmFsbEFycmF5TWVyZ2VkTmFtZXNdLm1hcChcbiAgICAoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWAsXG4gICk7XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgaGVscGVyTmFtZXNMaXN0LnB1c2goJ0hhbmRvZmZMaW5rRmllbGQnKTtcbiAgaWYgKGFueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzKSBoZWxwZXJOYW1lc0xpc3QucHVzaCgnQ09OVEVOVF9CTE9DS1MnKTtcbiAgY29uc3QgaGVscGVyc09iamVjdExpbmUgPVxuICAgIGhlbHBlck5hbWVzTGlzdC5sZW5ndGggPiAwXG4gICAgICA/IGAgICAgY29uc3QgaGVscGVycyA9IHsgJHtoZWxwZXJOYW1lc0xpc3Quam9pbignLCAnKX0gfTtgXG4gICAgICA6ICcgICAgY29uc3QgaGVscGVycyA9IHt9Oyc7XG5cbiAgY29uc3QgdmFyaWFudFBhbmVsQmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgICBpZiAoIXJlc3VsdC5wYW5lbHMudHJpbSgpKSByZXR1cm4gJyc7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHt2LmNvbXBvbmVudC5pZH0nICYmIDwke1Bhc2NhbH0uUGFuZWxzIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIGNvbnN0IHZhcmlhbnRQcmV2aWV3QmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAgICB7aGFuZG9mZlZhcmlhbnQgPT09ICcke3YuY29tcG9uZW50LmlkfScgJiYgPCR7UGFzY2FsfS5QcmV2aWV3IGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuam9pbignXFxuJyk7XG5cbiAgLy8gUGVyLXZhcmlhbnQgSlMgaW5jbHVkZSBmaWxlIGNvbnRlbnRzICh3cml0dGVuIHRvIHZhcmlhdGlvbnMvPGlkPi5qcylcbiAgY29uc3QgdmFyaWF0aW9uSnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW3YuY29tcG9uZW50LmlkXTtcbiAgICBjb25zdCBoZWxwZXJOYW1lcyA9IFsuLi5hbGxBcnJheU1lcmdlZE5hbWVzXVxuICAgICAgLmZpbHRlcigoYXR0ck5hbWUpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgKGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF1ba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKSA9PT0gYXR0ck5hbWUpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLm1hcCgoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWApO1xuICAgIHZhcmlhdGlvbkpzW3YuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudEpzRmlsZUNvbnRlbnQoXG4gICAgICB2LFxuICAgICAgcmVzdWx0LFxuICAgICAgZmllbGRNYXAsXG4gICAgICBoZWxwZXJOYW1lcyxcbiAgICAgIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkLFxuICAgICk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50LWNvbmRpdGlvbmFsIGR5bmFtaWMgcmVzb2x1dGlvbiArIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgdmFyaWFudER5bmFtaWNCbG9ja3MgPSB2YXJpYW50cy5tYXAoKHYpID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgY29uc3QgY29kZSA9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbiArIHJlc3VsdC5hcnJheUhlbHBlcnM7XG4gICAgaWYgKCFjb2RlLnRyaW0oKSkgcmV0dXJuICcnO1xuICAgIHJldHVybiBgICAgIGlmIChoYW5kb2ZmVmFyaWFudCA9PT0gJyR7di5jb21wb25lbnQuaWR9Jykge1xuJHtjb2RlfVxuICAgIH1gO1xuICB9KS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgLy8gRm9yIGR5bmFtaWMgcmVzb2x1dGlvbiwgd2UgbmVlZCB0aGUgdmFyaWFibGVzIHRvIGJlIGRlY2xhcmVkIGluIGEgc2NvcGUgdmlzaWJsZSB0byB0aGUgcHJldmlld1xuICAvLyBXZSdsbCB1c2UgYSBkaWZmZXJlbnQgYXBwcm9hY2g6IGRlY2xhcmUgYWxsIGF0IHRvcCwgY29uZGl0aW9uYWxseSBwb3B1bGF0ZVxuICBjb25zdCBhbGxSZXNvbHZpbmdGbGFncyA9IHZhcmlhbnRzLmZsYXRNYXAoKHYpID0+IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXS5yZXNvbHZpbmdGbGFncyk7XG4gIGNvbnN0IGhhc0FueVJlc29sdmluZyA9IGFsbFJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDA7XG5cbiAgLy8gR2VuZXJhdGUgZHluYW1pYyByZXNvbHV0aW9uIHBlciB2YXJpYW50OyBhcnJheSBoZWxwZXJzIGFyZSBlbWl0dGVkIG9uY2UgYWJvdmUgKHNoYXJlZEFycmF5SGVscGVycylcbiAgbGV0IGNvbWJpbmVkRHluYW1pY0NvZGUgPSBzaGFyZWRBcnJheUhlbHBlcnMudHJpbSgpID8gYFxcbiR7c2hhcmVkQXJyYXlIZWxwZXJzfWAgOiAnJztcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGlmIChyZXN1bHQuZHluYW1pY1Jlc29sdXRpb24udHJpbSgpKSB7XG4gICAgICBjb21iaW5lZER5bmFtaWNDb2RlICs9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBhdHRyTmFtZXNMaXN0ID0gQXJyYXkuZnJvbShhbGxBdHRyTmFtZXMpO1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtY29uZGl0aW9uYWwgTWVkaWFSZXBsYWNlRmxvdyB0b29sYmFyIGVudHJpZXMgZm9yIGltYWdlIGZpZWxkc1xuICBjb25zdCB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdi5jb21wb25lbnQ7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgaW1hZ2VFbnRyaWVzOiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IG1lcmdlZEF0dHJOYW1lOiBzdHJpbmcgfT4gPSBbXTtcblxuICAgIGNvbnN0IGNvbGxlY3RJbWFnZXMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWROYW1lID0gcGFyZW50UGF0aFxuICAgICAgICAgID8gYCR7ZmllbGRNYXBbcGFyZW50UGF0aF0gfHwgdG9DYW1lbENhc2UocGFyZW50UGF0aCl9YFxuICAgICAgICAgIDogKGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KSk7XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgICBpbWFnZUVudHJpZXMucHVzaCh7XG4gICAgICAgICAgICBsYWJlbDogcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSksXG4gICAgICAgICAgICBtZXJnZWRBdHRyTmFtZTogcGFyZW50UGF0aCA/IG1lcmdlZE5hbWUgOiBtZXJnZWROYW1lLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgIGNvbGxlY3RJbWFnZXMocHJvcC5wcm9wZXJ0aWVzLCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICBjb2xsZWN0SW1hZ2VzKGNvbXAucHJvcGVydGllcyk7XG5cbiAgICBpZiAoaW1hZ2VFbnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IG1lZGlhRmxvd3MgPSBpbWFnZUVudHJpZXMubWFwKChpbWcpID0+XG4gICAgICAgIGAgICAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgICBtZWRpYUlkPXske2ltZy5tZXJnZWRBdHRyTmFtZX0/LmlkfVxuICAgICAgICAgICAgICBtZWRpYVVybD17JHtpbWcubWVyZ2VkQXR0ck5hbWV9Py5zcmN9XG4gICAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7aW1nLm1lcmdlZEF0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0pfVxuICAgICAgICAgICAgICBuYW1lPXtfXygnJHtpbWcubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIC8+YFxuICAgICAgKS5qb2luKCdcXG4nKTtcbiAgICAgIHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MucHVzaChcbiAgICAgICAgYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHtjb21wLmlkfScgJiYgKFxcbiAgICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XFxuJHttZWRpYUZsb3dzfVxcbiAgICAgICAgICA8L0Jsb2NrQ29udHJvbHM+XFxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1lZGlhUmVwbGFjZUpzeCA9IHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MubGVuZ3RoID4gMFxuICAgID8gJ1xcbicgKyB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzLmpvaW4oJ1xcbicpXG4gICAgOiAnJztcblxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVHcm91cFN2Z0ljb25Db2RlKGdyb3VwVGl0bGUsIGdyb3VwU2x1Zyk7XG5cbiAgLy8gQnVpbGQgc2NyZWVuc2hvdCBpbXBvcnRzIGFuZCBsb29rdXAgbWFwIGZvciB2YXJpYW50IHByZXZpZXdzXG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnRMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3Qgc2NyZWVuc2hvdE1hcEVudHJpZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGFueVZhcmlhbnRIYXNTY3JlZW5zaG90ID0gdmFyaWFudFNjcmVlbnNob3RzICYmIE9iamVjdC52YWx1ZXModmFyaWFudFNjcmVlbnNob3RzKS5zb21lKEJvb2xlYW4pO1xuXG4gIGlmIChhbnlWYXJpYW50SGFzU2NyZWVuc2hvdCAmJiB2YXJpYW50U2NyZWVuc2hvdHMpIHtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICAgIGlmICh2YXJpYW50U2NyZWVuc2hvdHNbdi5jb21wb25lbnQuaWRdKSB7XG4gICAgICAgIGNvbnN0IHNhZmVWYXIgPSAnc2NyZWVuc2hvdF8nICsgdmFyaWFudElkVG9DYW1lbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICAgIHNjcmVlbnNob3RJbXBvcnRMaW5lcy5wdXNoKGBpbXBvcnQgJHtzYWZlVmFyfSBmcm9tICcuL3NjcmVlbnNob3QtJHt2LmNvbXBvbmVudC5pZH0ucG5nJztgKTtcbiAgICAgICAgc2NyZWVuc2hvdE1hcEVudHJpZXMucHVzaChgICAnJHt2LmNvbXBvbmVudC5pZH0nOiAke3NhZmVWYXJ9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnRzID0gc2NyZWVuc2hvdEltcG9ydExpbmVzLmxlbmd0aCA+IDBcbiAgICA/IHNjcmVlbnNob3RJbXBvcnRMaW5lcy5qb2luKCdcXG4nKSArICdcXG4nXG4gICAgOiAnJztcbiAgY29uc3Qgc2NyZWVuc2hvdE1hcENvZGUgPSBzY3JlZW5zaG90TWFwRW50cmllcy5sZW5ndGggPiAwXG4gICAgPyBgY29uc3QgdmFyaWFudFNjcmVlbnNob3RzID0ge1xcbiR7c2NyZWVuc2hvdE1hcEVudHJpZXMuam9pbignLFxcbicpfVxcbn07XFxuYFxuICAgIDogJyc7XG4gIGNvbnN0IHByZXZpZXdHdWFyZCA9IGFueVZhcmlhbnRIYXNTY3JlZW5zaG90XG4gICAgPyBgICAgIGlmIChhdHRyaWJ1dGVzLl9fcHJldmlldykge1xuICAgICAgY29uc3Qgc2NyZWVuc2hvdFNyYyA9IHZhcmlhbnRTY3JlZW5zaG90c1toYW5kb2ZmVmFyaWFudF07XG4gICAgICBpZiAoc2NyZWVuc2hvdFNyYykge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgICAgPGltZyBzcmM9e3NjcmVlbnNob3RTcmN9IGFsdD17bWV0YWRhdGEudGl0bGV9IHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19IC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgY29uc3QgaW5kZXhKc1RlbXBsYXRlID0gYGltcG9ydCB7IHJlZ2lzdGVyQmxvY2tUeXBlIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9ja3MnO1xuaW1wb3J0IHsgXG4gICR7YmxvY2tFZGl0b3JJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgXG4gICR7Y29tcG9uZW50SW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbiR7dGVuVXBJbXBvcnR9JHtzaGFyZWRDb21wb25lbnRJbXBvcnR9aW1wb3J0IG1ldGFkYXRhIGZyb20gJy4vYmxvY2suanNvbic7XG5pbXBvcnQgJy4vZWRpdG9yLnNjc3MnO1xuJHthbnlIYXNEeW5hbWljQXJyYXlzID8gXCJpbXBvcnQgJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0R5bmFtaWNQb3N0U2VsZWN0b3IuZWRpdG9yLnNjc3MnO1xcblwiIDogJyd9aW1wb3J0ICcuL3N0eWxlLnNjc3MnO1xuJHtzY3JlZW5zaG90SW1wb3J0c30ke3ZhcmlhbnRJbXBvcnRMaW5lcy5qb2luKCdcXG4nKX1cbiR7c2NyZWVuc2hvdE1hcENvZGV9Y29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO1xuXG5yZWdpc3RlckJsb2NrVHlwZShtZXRhZGF0YS5uYW1lLCB7XG4gIC4uLm1ldGFkYXRhLFxuICBpY29uOiBibG9ja0ljb24sXG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXNMaXN0LmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtwcmV2aWV3R3VhcmR9XG4ke2NvbWJpbmVkRHluYW1pY0NvZGV9XG4ke2hlbHBlcnNPYmplY3RMaW5lfVxuICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxCbG9ja0NvbnRyb2xzIGdyb3VwPVwiYmxvY2tcIj5cbiAgICAgICAgICA8RHJvcGRvd25NZW51XG4gICAgICAgICAgICBpY29uPVwibGF5b3V0XCJcbiAgICAgICAgICAgIGxhYmVsPXtfXygnVmFyaWF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIGNvbnRyb2xzPXtbXG4ke3Rvb2xiYXJWYXJpYW50Q29udHJvbHN9XG4gICAgICAgICAgICBdfVxuICAgICAgICAgIC8+XG4gICAgICAgIDwvQmxvY2tDb250cm9scz4ke21lZGlhUmVwbGFjZUpzeH1cbiAgICAgICAgPEluc3BlY3RvckNvbnRyb2xzPlxuJHt2YXJpYW50UGFuZWxCbG9ja3N9XG4gICAgICAgIDwvSW5zcGVjdG9yQ29udHJvbHM+XG5cbiAgICAgICAgey8qIEVkaXRvciBQcmV2aWV3ICovfVxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiR7dmFyaWFudFByZXZpZXdCbG9ja3N9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9GcmFnbWVudD5cbiAgICApO1xuICB9LFxuICBzYXZlOiAoKSA9PiB7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgcmV0dXJuIG51bGw7J31cbiAgfSxcbn0pO1xuYDtcbiAgcmV0dXJuIHsgaW5kZXhKczogaW5kZXhKc1RlbXBsYXRlLCB2YXJpYXRpb25KcyB9O1xufTtcblxuLy8g4pSA4pSA4pSAIEhlbHBlciBnZW5lcmF0b3JzIGZvciBtZXJnZWQgY29udGV4dCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnNNZXJnZWQgPSAoXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIGZpZWxkTWFwOiBGaWVsZE1hcCxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhlbHBlcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBpZiAocHJvcC50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBoZWxwZXJzLnB1c2goYFxuICAgIGNvbnN0IHVwZGF0ZSR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1JdGVtID0gKGluZGV4LCBmaWVsZCwgdmFsdWUpID0+IHtcbiAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLigke2F0dHJOYW1lfSB8fCBbXSldO1xuICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sIFtmaWVsZF06IHZhbHVlIH07XG4gICAgICBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgIH07YCk7XG4gIH1cbiAgcmV0dXJuIGhlbHBlcnMuam9pbignXFxuJyk7XG59O1xuXG4vKiogR2VuZXJhdGUgYXJyYXkgdXBkYXRlIGhlbHBlcnMgb25jZSBwZXIgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lIChhdm9pZHMgZHVwbGljYXRlIGRlY2xhcmF0aW9ucyBhY3Jvc3MgdmFyaWFudHMpLiAqL1xuY29uc3QgZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMgPSAobWVyZ2VkQXJyYXlBdHRyTmFtZXM6IFNldDxzdHJpbmc+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgaGVscGVyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBtZXJnZWRBcnJheUF0dHJOYW1lcykge1xuICAgIGNvbnN0IGhlbHBlck5hbWUgPSBgdXBkYXRlJHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfUl0ZW1gO1xuICAgIGhlbHBlcnMucHVzaChgXG4gICAgY29uc3QgJHtoZWxwZXJOYW1lfSA9IChpbmRleCwgZmllbGQsIHZhbHVlKSA9PiB7XG4gICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4oJHthdHRyTmFtZX0gfHwgW10pXTtcbiAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCBbZmllbGRdOiB2YWx1ZSB9O1xuICAgICAgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICB9O2ApO1xuICB9XG4gIHJldHVybiBoZWxwZXJzLmpvaW4oJ1xcbicpO1xufTtcblxuLyoqIENvbGxlY3QgYXR0cmlidXRlIG5hbWVzIHJlZmVyZW5jZWQgaW4gSlNYIChzZXRBdHRyaWJ1dGVzKHsgeDogb3IgdmFsdWU9e3h9KSBzbyB3ZSBkZXN0cnVjdHVyZSB0aGVtIGV2ZW4gaWYgbm90IGluIGZpZWxkTWFwLiAqL1xuY29uc3QgY29sbGVjdEF0dHJOYW1lc0Zyb21Kc3ggPSAoanN4OiBzdHJpbmcpOiBTZXQ8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IG5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHNldEF0dHJSZWdleCA9IC9zZXRBdHRyaWJ1dGVzXFxzKlxcKFxccypcXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKilcXHMqOi9nO1xuICBsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcbiAgd2hpbGUgKChtID0gc2V0QXR0clJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgY29uc3QgdmFsdWVSZWdleCA9IC92YWx1ZT1cXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKikoPzpcXHMqW1xcfFxcP1xcJlxcfFxcIV18W1xcc1xcblxccl0qXFw/XFw/fFtcXHNcXG5cXHJdKlxcfFxcfCkvZztcbiAgd2hpbGUgKChtID0gdmFsdWVSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIGNvbnN0IGNvbmRSZWdleCA9IC9cXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKilcXHMqJiYvZztcbiAgd2hpbGUgKChtID0gY29uZFJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgcmV0dXJuIG5hbWVzO1xufTtcblxuLyoqIEdlbmVyYXRlIHRoZSBKUyBjb250ZW50IGZvciBvbmUgdmFyaWF0aW9uIGluY2x1ZGUgZmlsZSAoZXhwb3J0cyBQYW5lbHMgYW5kIFByZXZpZXcpLiAqL1xuY29uc3QgZ2VuZXJhdGVWYXJpYW50SnNGaWxlQ29udGVudCA9IChcbiAgdmFyaWFudDogVmFyaWFudEluZm8sXG4gIHJlc3VsdDogeyBwYW5lbHM6IHN0cmluZzsgcHJldmlld0pzeDogc3RyaW5nOyBzcGVjaWFsaXplZFJlc29sdXRpb24/OiBzdHJpbmc7IGhhc0JyZWFkY3J1bWJzRmV0Y2g/OiBib29sZWFuOyBoYXNUYXhvbm9teUZldGNoPzogYm9vbGVhbiB9LFxuICBmaWVsZE1hcDogRmllbGRNYXAsXG4gIGhlbHBlck5hbWVzOiBzdHJpbmdbXSxcbiAgYW55UHJldmlld1VzZXNMaW5rRmllbGQ6IGJvb2xlYW4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gIGNvbnN0IHZhcmlhbnREeW5Db25maWdzID0gdmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzO1xuICBjb25zdCBmcm9tRmllbGRNYXAgPSBuZXcgU2V0KE9iamVjdC52YWx1ZXMoZmllbGRNYXApKTtcbiAgLy8gU2NhbiBwcmV2aWV3IEpTWCBhbmQgcGFuZWwgSlNYIGZvciBhdHRyaWJ1dGUgbmFtZXMgdG8gZGVzdHJ1Y3R1cmUuXG4gIGNvbnN0IGZyb21QcmV2aWV3ID0gY29sbGVjdEF0dHJOYW1lc0Zyb21Kc3gocmVzdWx0LnByZXZpZXdKc3ggKyAnXFxuJyArIHJlc3VsdC5wYW5lbHMpO1xuICAvLyBDb2xsZWN0IHZhcmlhYmxlIG5hbWVzIGRlY2xhcmVkIGxvY2FsbHkgYnkgdGhlIHNwZWNpYWxpemVkIHJlc29sdXRpb24gY29kZVxuICAvLyAoZS5nLiBwcmV2aWV3QnJlYWRjcnVtYiBmcm9tIHVzZVN0YXRlLCBwcmV2aWV3VGFncyBmcm9tIHVzZVNlbGVjdCkuXG4gIC8vIFRoZXNlIG11c3QgTk9UIGJlIGRlc3RydWN0dXJlZCBmcm9tIGF0dHJpYnV0ZXMgb3IgdGhleSdsbCBjb25mbGljdC5cbiAgY29uc3QgbG9jYWxseURlY2xhcmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGlmIChyZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uKSB7XG4gICAgY29uc3Qgc3RhdGVNYXRjaCA9IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24ubWF0Y2hBbGwoL2NvbnN0XFxzK1xcWyhcXHcrKSxcXHMqKFxcdyspXFxdXFxzKj1cXHMqdXNlU3RhdGUvZyk7XG4gICAgZm9yIChjb25zdCBtIG9mIHN0YXRlTWF0Y2gpIHsgbG9jYWxseURlY2xhcmVkLmFkZChtWzFdKTsgbG9jYWxseURlY2xhcmVkLmFkZChtWzJdKTsgfVxuICAgIGNvbnN0IHNlbGVjdE1hdGNoID0gcmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbi5tYXRjaEFsbCgvY29uc3RcXHMrKFxcdyspXFxzKj1cXHMqdXNlU2VsZWN0L2cpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzZWxlY3RNYXRjaCkgeyBsb2NhbGx5RGVjbGFyZWQuYWRkKG1bMV0pOyB9XG4gIH1cbiAgY29uc3QgcmVzZXJ2ZWQgPSBuZXcgU2V0KFsnaW5kZXgnLCAndmFsdWUnLCAnaXRlbScsICdlJywgJ2tleScsICdvcGVuJ10pO1xuICBmcm9tUHJldmlldy5mb3JFYWNoKChuYW1lKSA9PiB7XG4gICAgaWYgKCFyZXNlcnZlZC5oYXMobmFtZSkgJiYgIWxvY2FsbHlEZWNsYXJlZC5oYXMobmFtZSkpIGZyb21GaWVsZE1hcC5hZGQobmFtZSk7XG4gIH0pO1xuICAvLyBFbnN1cmUgc3BlY2lhbGl6ZWQgYXJyYXkgc3ludGhldGljIGF0dHJpYnV0ZXMgYXJlIGRlc3RydWN0dXJlZFxuICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyh2YXJpYW50RHluQ29uZmlncykpIHtcbiAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2ZpZWxkS2V5XSB8fCB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgfVxuICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgYXR0ck5hbWVzID0gWy4uLmZyb21GaWVsZE1hcF07XG4gIGNvbnN0IGhlbHBlcnNEZXN0cnVjdCA9IFsuLi5oZWxwZXJOYW1lc107XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgaGVscGVyc0Rlc3RydWN0LnB1c2goJ0hhbmRvZmZMaW5rRmllbGQnKTtcbiAgaWYgKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkgaGVscGVyc0Rlc3RydWN0LnB1c2goJ0NPTlRFTlRfQkxPQ0tTJyk7XG5cbiAgY29uc3QgYXR0ckRlc3RydWN0ID0gYXR0ck5hbWVzLmxlbmd0aCA/IGAgIGNvbnN0IHsgJHthdHRyTmFtZXMuam9pbignLCAnKX0gfSA9IGF0dHJpYnV0ZXM7XFxuICBgIDogJyc7XG4gIGNvbnN0IGhlbHBlcnNEZXN0cnVjdExpbmUgPVxuICAgIGhlbHBlcnNEZXN0cnVjdC5sZW5ndGggPiAwID8gYCAgY29uc3QgeyAke2hlbHBlcnNEZXN0cnVjdC5qb2luKCcsICcpfSB9ID0gaGVscGVycztcXG4gIGAgOiAnJztcblxuICBjb25zdCBwcm9wc0xpc3QgPSBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA/ICd7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGhlbHBlcnMsIGlzU2VsZWN0ZWQgfScgOiAneyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBoZWxwZXJzIH0nO1xuICBjb25zdCBwYW5lbHNFeHBvcnQgPVxuICAgIHJlc3VsdC5wYW5lbHMudHJpbSgpID09PSAnJ1xuICAgICAgPyBgZXhwb3J0IGZ1bmN0aW9uIFBhbmVscygpIHsgcmV0dXJuIG51bGw7IH1gXG4gICAgICA6IGBleHBvcnQgZnVuY3Rpb24gUGFuZWxzKCR7cHJvcHNMaXN0fSkge1xuJHthdHRyRGVzdHJ1Y3R9JHtoZWxwZXJzRGVzdHJ1Y3RMaW5lfSAgcmV0dXJuIChcbiAgICA8PlxuJHtyZXN1bHQucGFuZWxzfVxuICAgIDwvPlxuICApO1xufWA7XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIHNoYXJlZCBzZWxlY3RvciBjb21wb25lbnRzIHRoaXMgdmFyaWFudCdzIHBhbmVscyB1c2VcbiAgY29uc3QgdmFyaWFudEhhc0JyZWFkY3J1bWJzID0gT2JqZWN0LnZhbHVlcyh2YXJpYW50RHluQ29uZmlncykuc29tZSgoYykgPT4gaXNCcmVhZGNydW1ic0NvbmZpZyhjKSk7XG4gIGNvbnN0IHZhcmlhbnRIYXNUYXhvbm9teSA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpO1xuICBjb25zdCB2YXJpYW50SGFzUGFnaW5hdGlvbiA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSk7XG4gIGNvbnN0IHZhcmlhbnRTaGFyZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAodmFyaWFudEhhc0JyZWFkY3J1bWJzKSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmICh2YXJpYW50SGFzVGF4b25vbXkpIHZhcmlhbnRTaGFyZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKHZhcmlhbnRIYXNQYWdpbmF0aW9uKSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcbiAgY29uc3Qgc2hhcmVkU2VsZWN0b3JJbXBvcnQgPSB2YXJpYW50U2hhcmVkSW1wb3J0cy5sZW5ndGhcbiAgICA/IGBpbXBvcnQgeyAke3ZhcmlhbnRTaGFyZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcblxuICAvLyBPbmx5IGltcG9ydCBSZXBlYXRlciB3aGVuIHRoZSB2YXJpYW50IGhhcyBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IGZpZWxkc1xuICAvLyAodGF4b25vbXkvYnJlYWRjcnVtYnMvcGFnaW5hdGlvbiBhcmUgc2VydmVyLXJlbmRlcmVkOyBzaGFyZWQgY29tcG9uZW50cyBpbXBvcnQgUmVwZWF0ZXIgdGhlbXNlbHZlcylcbiAgY29uc3QgdmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgPSBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpLnNvbWUoXG4gICAgKFtrLCBwXSkgPT4gcC50eXBlID09PSAnYXJyYXknICYmICghdmFyaWFudER5bkNvbmZpZ3Nba10gfHwgISgnYXJyYXlUeXBlJyBpbiB2YXJpYW50RHluQ29uZmlnc1trXSkpXG4gICk7XG4gIGNvbnN0IHRlblVwQmxvY2tDb21wb25lbnRzSW1wb3J0ID0gKHZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzIHx8IHJlc3VsdC5wcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKSlcbiAgICA/IGBpbXBvcnQgeyAke1t2YXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA/ICdSZXBlYXRlcicgOiAnJywgcmVzdWx0LnByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpID8gJ0ltYWdlJyA6ICcnXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gXG4gICAgOiAnJztcblxuICAvLyBTcGVjaWFsaXplZCBhcnJheSByZXNvbHV0aW9uIGltcG9ydHMgKGJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24gaG9va3MgcnVuIGluIHRoZSB2YXJpYXRpb24gZmlsZSlcbiAgY29uc3QgaGFzU3BlY2lhbGl6ZWRSZXNvbHV0aW9uID0gISEocmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbj8udHJpbSgpKTtcbiAgY29uc3QgdmFySGFzQnJlYWRjcnVtYnNGZXRjaCA9IHJlc3VsdC5oYXNCcmVhZGNydW1ic0ZldGNoID8/IGZhbHNlO1xuICBjb25zdCB2YXJIYXNUYXhvbm9teUZldGNoID0gcmVzdWx0Lmhhc1RheG9ub215RmV0Y2ggPz8gZmFsc2U7XG5cbiAgY29uc3QgZWxlbWVudEltcG9ydE5hbWVzID0gWydGcmFnbWVudCddO1xuICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkgZWxlbWVudEltcG9ydE5hbWVzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuXG4gIGxldCBkYXRhSW1wb3J0ID0gJyc7XG4gIGlmICh2YXJIYXNUYXhvbm9teUZldGNoIHx8IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIHtcbiAgICBjb25zdCBkYXRhTmFtZXMgPSBbJ3VzZVNlbGVjdCddO1xuICAgIGlmICh2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSBkYXRhTmFtZXMucHVzaCgnc2VsZWN0Jyk7XG4gICAgZGF0YUltcG9ydCArPSBgaW1wb3J0IHsgJHtkYXRhTmFtZXMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2RhdGEnO1xcbmltcG9ydCB7IHN0b3JlIGFzIGNvcmVEYXRhU3RvcmUgfSBmcm9tICdAd29yZHByZXNzL2NvcmUtZGF0YSc7XFxuYDtcbiAgfVxuICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkge1xuICAgIGRhdGFJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuXG4gIGNvbnN0IHNwZWNpYWxpemVkQ29kZSA9IGhhc1NwZWNpYWxpemVkUmVzb2x1dGlvbiA/IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24hIDogJyc7XG5cbiAgcmV0dXJuIGAvKipcbiAqIFZhcmlhdGlvbjogJHtjb21wLnRpdGxlfSAoJHtjb21wLmlkfSlcbiAqIEdlbmVyYXRlZCDigJMgZG8gbm90IGVkaXQgYnkgaGFuZC5cbiAqL1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0TmFtZXMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2VsZW1lbnQnO1xuaW1wb3J0IHtcbiAgUGFuZWxCb2R5LFxuICBUZXh0Q29udHJvbCxcbiAgQnV0dG9uLFxuICBTZWxlY3RDb250cm9sLFxuICBSYW5nZUNvbnRyb2wsXG4gIFRvZ2dsZUNvbnRyb2wsXG4gIEZsZXgsXG4gIFBvcG92ZXIsXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBNZWRpYVVwbG9hZCwgTWVkaWFVcGxvYWRDaGVjaywgTWVkaWFSZXBsYWNlRmxvdywgTGlua0NvbnRyb2wsIFJpY2hUZXh0LCBJbm5lckJsb2NrcyB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbiR7ZGF0YUltcG9ydH0ke3RlblVwQmxvY2tDb21wb25lbnRzSW1wb3J0fSR7c2hhcmVkU2VsZWN0b3JJbXBvcnR9XG4ke3BhbmVsc0V4cG9ydH1cblxuZXhwb3J0IGZ1bmN0aW9uIFByZXZpZXcoJHtwcm9wc0xpc3R9KSB7XG4ke2F0dHJEZXN0cnVjdH0ke2hlbHBlcnNEZXN0cnVjdExpbmV9JHtzcGVjaWFsaXplZENvZGV9XG4gIHJldHVybiAoXG4ke3Jlc3VsdC5wcmV2aWV3SnN4fVxuICApO1xufVxuYDtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgcmVuZGVyLnBocCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqIEdlbmVyYXRlIHRoZSBQSFAgZnJhZ21lbnQgZm9yIG9uZSB2YXJpYW50IChleHRyYWN0aW9ucyArIHRlbXBsYXRlKS4gVXNlZCBpbiB2YXJpYXRpb24gaW5jbHVkZSBmaWxlLiAqL1xuY29uc3QgZ2VuZXJhdGVWYXJpYW50UGhwRnJhZ21lbnQgPSAoXG4gIHZhcmlhbnQ6IFZhcmlhbnRJbmZvLFxuICBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG5cbiAgY29uc3QgcmljaHRleHRQcm9wcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBpZiAodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgcmljaHRleHRQcm9wcy5hZGQodmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICByaWNodGV4dFByb3BzLmFkZCh0b0NhbWVsQ2FzZSh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpKTtcbiAgfVxuXG4gIGNvbnN0IGV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ID09PSB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGNvbnRpbnVlO1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IG9yaWdDYW1lbCA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gZ2V0UGhwRGVmYXVsdFZhbHVlKHByb3BlcnR5KTtcbiAgICBleHRyYWN0aW9ucy5wdXNoKGAkJHtvcmlnQ2FtZWx9ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10pID8gJGF0dHJpYnV0ZXNbJyR7bWVyZ2VkQXR0ck5hbWV9J10gOiAke2RlZmF1bHRWYWx1ZX07YCk7XG4gIH1cbiAgLy8gRHluYW1pYyBhcnJheSBleHRyYWN0aW9uIGZvciBzcGVjaWFsaXplZCBhcnJheSB0eXBlcyAoYnJlYWRjcnVtYnMsIHRheG9ub215LCBwYWdpbmF0aW9uKVxuICBjb25zdCBkeW5BcnJheUV4dHJhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAodmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IG1lcmdlZEF0dHJOYW1lID0gZmllbGRNYXBbZmllbGROYW1lXSB8fCB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gY29tcC5wcm9wZXJ0aWVzW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkFycmF5RXh0cmFjdGlvbnMucHVzaChnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlVGF4b25vbXlBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBtZXJnZWRBdHRyTmFtZSwgZHluQ29uZmlnLCBpdGVtUHJvcHMpKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlUGFnaW5hdGlvbkFycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlRHluYW1pY0FycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgZHluQXJyYXlDb2RlID0gZHluQXJyYXlFeHRyYWN0aW9ucy5sZW5ndGggPyAnXFxuJyArIGR5bkFycmF5RXh0cmFjdGlvbnMuam9pbignXFxuJykgOiAnJztcblxuICBjb25zdCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocChjb21wLmNvZGUgPz8gJycsIGNvbXAucHJvcGVydGllcywgcmljaHRleHRQcm9wcyk7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IChjb21wLmlkID8/ICcnKS5yZXBsYWNlKC9fL2csICctJyk7XG5cbiAgcmV0dXJuIGA8P3BocFxuLy8gQXR0cmlidXRlIGV4dHJhY3Rpb24gZm9yIHZhcmlhbnQ6ICR7Y29tcC5pZH1cbiR7ZXh0cmFjdGlvbnMuam9pbignXFxuJyl9JHtkeW5BcnJheUNvZGV9XG4/PlxuPGRpdiBjbGFzcz1cIiR7Y2xhc3NOYW1lfVwiPlxuJHt0ZW1wbGF0ZVBocH1cbjwvZGl2PlxuYDtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkUmVuZGVyUGhwID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuICBjb25zdCBkZWZhdWx0VmFyaWFudCA9IHZhcmlhbnRzWzBdLmNvbXBvbmVudC5pZDtcblxuICBjb25zdCBjYXNlczogc3RyaW5nW10gPSB2YXJpYW50cy5tYXAoXG4gICAgKHYpID0+IGAgIGNhc2UgJyR7di5jb21wb25lbnQuaWR9JzpcbiAgICBpbmNsdWRlIF9fRElSX18gLiAnL3ZhcmlhdGlvbnMvJHt2LmNvbXBvbmVudC5pZH0ucGhwJztcbiAgICBicmVhaztgLFxuICApO1xuXG4gIHJldHVybiBgPD9waHBcbi8qKlxuICogU2VydmVyLXNpZGUgcmVuZGVyaW5nIGZvciAke3RvVGl0bGVDYXNlKGdyb3VwU2x1Zyl9IChtZXJnZWQgZ3JvdXAgYmxvY2spXG4gKlxuICogQHBhcmFtIGFycmF5ICAgICRhdHRyaWJ1dGVzIEJsb2NrIGF0dHJpYnV0ZXMuXG4gKiBAcGFyYW0gc3RyaW5nICAgJGNvbnRlbnQgICAgQmxvY2sgZGVmYXVsdCBjb250ZW50LlxuICogQHBhcmFtIFdQX0Jsb2NrICRibG9jayAgICAgIEJsb2NrIGluc3RhbmNlLlxuICogQHJldHVybiBzdHJpbmcgUmV0dXJucyB0aGUgYmxvY2sgbWFya3VwLlxuICovXG5cbmlmICghZGVmaW5lZCgnQUJTUEFUSCcpKSB7XG4gIGV4aXQ7XG59XG5cbmlmICghaXNzZXQoJGF0dHJpYnV0ZXMpKSB7XG4gICRhdHRyaWJ1dGVzID0gW107XG59XG5cbiR2YXJpYW50ID0gaXNzZXQoJGF0dHJpYnV0ZXNbJ2hhbmRvZmZWYXJpYW50J10pID8gJGF0dHJpYnV0ZXNbJ2hhbmRvZmZWYXJpYW50J10gOiAnJHtkZWZhdWx0VmFyaWFudH0nO1xuPz5cbjxkaXYgPD9waHAgZWNobyBnZXRfYmxvY2tfd3JhcHBlcl9hdHRyaWJ1dGVzKFsnY2xhc3MnID0+ICcke2Jsb2NrTmFtZX0nXSk7ID8+PlxuPD9waHBcbnN3aXRjaCAoJHZhcmlhbnQpIHtcbiR7Y2FzZXMuam9pbignXFxuJyl9XG5cbiAgZGVmYXVsdDpcbiAgICBlY2hvICc8IS0tIFVua25vd24gdmFyaWFudDogJyAuIGVzY19odG1sKCR2YXJpYW50KSAuICcgLS0+JztcbiAgICBicmVhaztcbn1cbj8+XG48L2Rpdj5cbmA7XG59O1xuXG4vLyBnZXRQaHBEZWZhdWx0VmFsdWUgaXMgaW1wb3J0ZWQgZnJvbSByZW5kZXItcGhwLnRzXG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgU0NTUyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRFZGl0b3JTY3NzID0gKHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4gZ2VuZXJhdGVFZGl0b3JTY3NzKHYuY29tcG9uZW50KSlcbiAgICAuam9pbignXFxuXFxuJyk7XG59O1xuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZFN0eWxlU2NzcyA9ICh2YXJpYW50czogVmFyaWFudEluZm9bXSk6IHN0cmluZyA9PiB7XG4gIHJldHVybiB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IGdlbmVyYXRlU3R5bGVTY3NzKHYuY29tcG9uZW50KSlcbiAgICAuam9pbignXFxuXFxuJyk7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIE1pZ3JhdGlvbiBTY2hlbWEg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkTWlncmF0aW9uU2NoZW1hID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IGdyb3VwU2x1Zy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKTtcblxuICBjb25zdCB2YXJpYW50U2NoZW1hczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgY29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgTWlncmF0aW9uUHJvcGVydHlTY2hlbWE+ID0ge307XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpKSB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgICAgcHJvcGVydGllc1trZXldID0gZXh0cmFjdE1pZ3JhdGlvblByb3BlcnR5KHByb3AsIHRydWUsIGtleSk7XG4gICAgfVxuICAgIHZhcmlhbnRTY2hlbWFzW2NvbXAuaWRdID0ge1xuICAgICAgdGl0bGU6IGNvbXAudGl0bGUsXG4gICAgICBkZXNjcmlwdGlvbjogKGNvbXAuZGVzY3JpcHRpb24gfHwgJycpLnJlcGxhY2UoL1xcblxccysvZywgJyAnKS50cmltKCksXG4gICAgICBwcm9wZXJ0aWVzLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBzY2hlbWEgPSB7XG4gICAgYmxvY2tOYW1lOiBgaGFuZG9mZi8ke2Jsb2NrTmFtZX1gLFxuICAgIHRpdGxlOiBncm91cFRpdGxlLFxuICAgIGRlc2NyaXB0aW9uOiBgJHtncm91cFRpdGxlfSBibG9jayB3aXRoICR7dmFyaWFudHMubGVuZ3RofSB2YXJpYXRpb25zLmAsXG4gICAgY2F0ZWdvcnk6IGdyb3VwVG9DYXRlZ29yeShncm91cFNsdWcpLFxuICAgIGlzTWVyZ2VkR3JvdXA6IHRydWUsXG4gICAgdmFyaWFudHM6IHZhcmlhbnRTY2hlbWFzLFxuICB9O1xuXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShzY2hlbWEsIG51bGwsIDIpO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBSRUFETUUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkUmVhZG1lID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgZ3JvdXBUaXRsZTogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHZhcmlhbnRMaXN0ID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiBgLSAqKiR7di5jb21wb25lbnQudGl0bGV9KiogKFxcYCR7di5jb21wb25lbnQuaWR9XFxgKWApXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIHJldHVybiBgIyAke2dyb3VwVGl0bGV9IChNZXJnZWQgR3JvdXAgQmxvY2spXG5cblRoaXMgYmxvY2sgY29tYmluZXMgJHt2YXJpYW50cy5sZW5ndGh9IGNvbXBvbmVudCB2YXJpYXRpb25zIGludG8gYSBzaW5nbGUgV29yZFByZXNzIGJsb2NrLlxuXG4jIyBWYXJpYXRpb25zXG5cbiR7dmFyaWFudExpc3R9XG5cbiMjIFVzYWdlXG5cblNlbGVjdCB0aGUgZGVzaXJlZCB2YXJpYXRpb24gZnJvbSB0aGUgYmxvY2sgdG9vbGJhciAoVmFyaWF0aW9uIGRyb3Bkb3duKS5cbkVhY2ggdmFyaWF0aW9uIGhhcyBpdHMgb3duIHNldCBvZiBjb250cm9scyBhbmQgcmVuZGVycyBpdHMgb3duIHRlbXBsYXRlLlxuYDtcbn07XG5cbi8vIOKUgOKUgOKUgCBNYWluIEdlbmVyYXRvciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIG1lcmdlZCBibG9jayBmb3IgYSBncm91cCBvZiBjb21wb25lbnRzLlxuICogVmFyaWF0aW9uIG1hcmt1cCBpcyBzcGxpdCBpbnRvIGluY2x1ZGUgZmlsZXM6IHZhcmlhdGlvbnMvPHZhcmlhbnQtaWQ+LmpzIGFuZCB2YXJpYXRpb25zLzx2YXJpYW50LWlkPi5waHAuXG4gKi9cbmV4cG9ydCBjb25zdCBnZW5lcmF0ZU1lcmdlZEJsb2NrID0gKFxuICBncm91cFNsdWc6IHN0cmluZyxcbiAgY29tcG9uZW50czogSGFuZG9mZkNvbXBvbmVudFtdLFxuICB2YXJpYW50SW5mb3M6IFZhcmlhbnRJbmZvW10sXG4gIGFwaVVybD86IHN0cmluZyxcbiAgdmFyaWFudFNjcmVlbnNob3RzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG4pOiBHZW5lcmF0ZWRCbG9jayA9PiB7XG4gIGNvbnN0IGdyb3VwVGl0bGUgPSB0b1RpdGxlQ2FzZShncm91cFNsdWcpO1xuICBjb25zdCBzY3JlZW5zaG90cyA9IHZhcmlhbnRTY3JlZW5zaG90cyB8fCB7fTtcblxuICBjb25zdCBzdXBlcnNldFJlc3VsdCA9IGJ1aWxkU3VwZXJzZXRBdHRyaWJ1dGVzKHZhcmlhbnRJbmZvcywgZ3JvdXBTbHVnKTtcbiAgY29uc3QgeyBhdHRyaWJ1dGVzOiBzdXBlcnNldEF0dHJzLCBmaWVsZE1hcHMgfSA9IHN1cGVyc2V0UmVzdWx0O1xuXG4gIGNvbnN0IHsgaW5kZXhKcywgdmFyaWF0aW9uSnMgfSA9IGdlbmVyYXRlTWVyZ2VkSW5kZXhKcyhcbiAgICBncm91cFNsdWcsXG4gICAgZ3JvdXBUaXRsZSxcbiAgICB2YXJpYW50SW5mb3MsXG4gICAgc3VwZXJzZXRBdHRycyxcbiAgICBmaWVsZE1hcHMsXG4gICAgYXBpVXJsLFxuICAgIHNjcmVlbnNob3RzLFxuICApO1xuXG4gIGNvbnN0IHZhcmlhdGlvblBocDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgdmFyaWFudEluZm9zKSB7XG4gICAgdmFyaWF0aW9uUGhwW3ZhcmlhbnQuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudFBocEZyYWdtZW50KHZhcmlhbnQsIGZpZWxkTWFwcyk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50IHNjcmVlbnNob3QgVVJMcyBmb3IgdGhlIGNhbGxlciB0byBkb3dubG9hZFxuICBjb25zdCB2YXJpYW50U2NyZWVuc2hvdFVybHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBvbmVudHMpIHtcbiAgICBpZiAoIWNvbXAuaW1hZ2UpIGNvbnRpbnVlO1xuICAgIGlmIChjb21wLmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCBjb21wLmltYWdlLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgIHZhcmlhbnRTY3JlZW5zaG90VXJsc1tjb21wLmlkXSA9IGNvbXAuaW1hZ2U7XG4gICAgfSBlbHNlIGlmIChhcGlVcmwpIHtcbiAgICAgIHZhcmlhbnRTY3JlZW5zaG90VXJsc1tjb21wLmlkXSA9IGAke2FwaVVybH0ke2NvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnLycpID8gJycgOiAnLyd9JHtjb21wLmltYWdlfWA7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBibG9ja0pzb246IGdlbmVyYXRlTWVyZ2VkQmxvY2tKc29uKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zLCBzdXBlcnNldEF0dHJzLCBzY3JlZW5zaG90cyksXG4gICAgaW5kZXhKcyxcbiAgICByZW5kZXJQaHA6IGdlbmVyYXRlTWVyZ2VkUmVuZGVyUGhwKGdyb3VwU2x1ZywgdmFyaWFudEluZm9zLCBmaWVsZE1hcHMpLFxuICAgIGVkaXRvclNjc3M6IGdlbmVyYXRlTWVyZ2VkRWRpdG9yU2Nzcyh2YXJpYW50SW5mb3MpLFxuICAgIHN0eWxlU2NzczogZ2VuZXJhdGVNZXJnZWRTdHlsZVNjc3ModmFyaWFudEluZm9zKSxcbiAgICByZWFkbWU6IGdlbmVyYXRlTWVyZ2VkUmVhZG1lKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zKSxcbiAgICBtaWdyYXRpb25TY2hlbWE6IGdlbmVyYXRlTWVyZ2VkTWlncmF0aW9uU2NoZW1hKGdyb3VwU2x1ZywgZ3JvdXBUaXRsZSwgdmFyaWFudEluZm9zKSxcbiAgICB2YXJpYW50U2NyZWVuc2hvdFVybHMsXG4gICAgdmFyaWF0aW9uRmlsZXM6IHtcbiAgICAgIGpzOiB2YXJpYXRpb25KcyxcbiAgICAgIHBocDogdmFyaWF0aW9uUGhwLFxuICAgIH0sXG4gIH07XG59O1xuXG5leHBvcnQgdHlwZSB7IFZhcmlhbnRJbmZvIH07XG4iXX0=