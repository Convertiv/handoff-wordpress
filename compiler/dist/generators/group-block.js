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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAtYmxvY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9ncm91cC1ibG9jay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsb0NBZWtCO0FBQ2xCLDJEQUF3RjtBQUN4RixxREFBZ0c7QUFDaEcsNkNBQTZFO0FBQzdFLDZDQUEwUDtBQUMxUCxxQ0FBaUU7QUFDakUsK0NBQTRIO0FBQzVILHlDQUFzRztBQWlDdEcsaUZBQWlGO0FBRWpGOztHQUVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQXFCLEVBQUUsQ0FBcUIsRUFBVyxFQUFFO0lBQ25GLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDM0IsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFpQixFQUFVLEVBQUU7SUFDckQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO1NBQ3hCLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7U0FDMUQsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN4QixPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDLENBQUM7QUFFRixnR0FBZ0c7QUFDaEcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFNBQWlCLEVBQVUsRUFBRTtJQUN0RCxNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMx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SUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDcEcsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPO1FBQ0wsU0FBUyxFQUFFLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxXQUFXLENBQUM7UUFDbkcsT0FBTztRQUNQLFNBQVMsRUFBRSx1QkFBdUIsQ0FBQyxTQUFTLEVBQUUsWUFBWSxFQUFFLFNBQVMsQ0FBQztRQUN0RSxVQUFVLEVBQUUsd0JBQXdCLENBQUMsWUFBWSxDQUFDO1FBQ2xELFNBQVMsRUFBRSx1QkFBdUIsQ0FBQyxZQUFZLENBQUM7UUFDaEQsTUFBTSxFQUFFLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDO1FBQ2pFLGVBQWUsRUFBRSw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQztRQUNuRixxQkFBcUI7UUFDckIsY0FBYyxFQUFFO1lBQ2QsRUFBRSxFQUFFLFdBQVc7WUFDZixHQUFHLEVBQUUsWUFBWTtTQUNsQjtLQUNGLENBQUM7QUFDSixDQUFDLENBQUM7QUFyRFcsUUFBQSxtQkFBbUIsdUJBcUQ5QiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTWVyZ2VkIEdyb3VwIEJsb2NrIEdlbmVyYXRvclxuICpcbiAqIENvbWJpbmVzIGFsbCBIYW5kb2ZmIGNvbXBvbmVudHMgaW4gdGhlIHNhbWUgZ3JvdXAgaW50byBhIHNpbmdsZSBXb3JkUHJlc3NcbiAqIGJsb2NrIHdpdGggdmFyaWF0aW9ucy4gVXNlcyBhIHN1cGVyc2V0IGF0dHJpYnV0ZSBzY2hlbWEsIHZhcmlhbnQtY29uZGl0aW9uYWxcbiAqIHNpZGViYXIgY29udHJvbHMsIHZhcmlhbnQtc3BlY2lmaWMgcHJldmlldyByZW5kZXJpbmcsIGFuZCBhIHJlbmRlci5waHBcbiAqIGRpc3BhdGNoZXIuXG4gKi9cblxuaW1wb3J0IHtcbiAgSGFuZG9mZkNvbXBvbmVudCxcbiAgSGFuZG9mZlByb3BlcnR5LFxuICBHdXRlbmJlcmdBdHRyaWJ1dGUsXG4gIER5bmFtaWNBcnJheUNvbmZpZyxcbiAgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyxcbiAgVGF4b25vbXlBcnJheUNvbmZpZyxcbiAgUGFnaW5hdGlvbkFycmF5Q29uZmlnLFxuICBHZW5lcmF0ZWRCbG9jayxcbiAgSXRlbU92ZXJyaWRlRmllbGRDb25maWcsXG4gIEJsb2NrSnNvbk91dHB1dCxcbiAgSGFuZG9mZk1ldGFkYXRhLFxuICBpc0JyZWFkY3J1bWJzQ29uZmlnLFxuICBpc1RheG9ub215Q29uZmlnLFxuICBpc1BhZ2luYXRpb25Db25maWcsXG59IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlLCBnZW5lcmF0ZUpzeFByZXZpZXcsIEpzeFByZXZpZXdSZXN1bHQgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4JztcbmltcG9ydCB7IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMsIHR5cGUgTm9ybWFsaXplZFNlbGVjdE9wdGlvbiB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgbWFwUHJvcGVydHlUeXBlLCBncm91cFRvQ2F0ZWdvcnksIHRvQmxvY2tOYW1lIH0gZnJvbSAnLi9ibG9jay1qc29uJztcbmltcG9ydCB7IGdlbmVyYXRlUmVuZGVyUGhwLCBoYW5kbGViYXJzVG9QaHAsIGFycmF5VG9QaHAsIGdldFBocERlZmF1bHRWYWx1ZSwgZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uLCBnZW5lcmF0ZUJyZWFkY3J1bWJzQXJyYXlFeHRyYWN0aW9uLCBnZW5lcmF0ZVRheG9ub215QXJyYXlFeHRyYWN0aW9uLCBnZW5lcmF0ZVBhZ2luYXRpb25BcnJheUV4dHJhY3Rpb24sIGJ1aWxkUmVzaGFwZUpzIH0gZnJvbSAnLi9yZW5kZXItcGhwJztcbmltcG9ydCB7IGdlbmVyYXRlRWRpdG9yU2NzcywgZ2VuZXJhdGVTdHlsZVNjc3MgfSBmcm9tICcuL3N0eWxlcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU1pZ3JhdGlvblNjaGVtYSwgTWlncmF0aW9uU2NoZW1hLCBNaWdyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgZXh0cmFjdE1pZ3JhdGlvblByb3BlcnR5IH0gZnJvbSAnLi9zY2hlbWEtanNvbic7XG5pbXBvcnQgeyB0b1RpdGxlQ2FzZSwgZ2VuZXJhdGVGaWVsZENvbnRyb2wsIGdlbmVyYXRlQXJyYXlDb250cm9sLCBnZW5lcmF0ZVN2Z0ljb24gfSBmcm9tICcuL2luZGV4LWpzJztcbmltcG9ydCB0eXBlIHsgRmllbGRDb250ZXh0IH0gZnJvbSAnLi9pbmRleC1qcyc7XG5cbi8vIOKUgOKUgOKUgCBUeXBlcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuLyoqIFBlci12YXJpYW50IG1hcHBpbmcgZnJvbSBvcmlnaW5hbCBmaWVsZCBuYW1lIHRvIG1lcmdlZCBhdHRyaWJ1dGUgbmFtZSAqL1xuZXhwb3J0IHR5cGUgRmllbGRNYXAgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXG50eXBlIEFueUR5bmFtaWNBcnJheUNvbmZpZyA9IER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnO1xuXG5pbnRlcmZhY2UgVmFyaWFudEluZm8ge1xuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQ7XG4gIGZpZWxkTWFwOiBGaWVsZE1hcDtcbiAgaW5uZXJCbG9ja3NGaWVsZDogc3RyaW5nIHwgbnVsbDtcbiAgZHluYW1pY0FycmF5Q29uZmlnczogUmVjb3JkPHN0cmluZywgQW55RHluYW1pY0FycmF5Q29uZmlnPjtcbn1cblxuaW50ZXJmYWNlIE1lcmdlZEZpZWxkIHtcbiAgLyoqIFRoZSBtZXJnZWQgYXR0cmlidXRlIG5hbWUgKGNhbWVsQ2FzZSkgKi9cbiAgYXR0ck5hbWU6IHN0cmluZztcbiAgLyoqIFRoZSBHdXRlbmJlcmcgYXR0cmlidXRlIGRlZmluaXRpb24gKi9cbiAgYXR0cmlidXRlOiBHdXRlbmJlcmdBdHRyaWJ1dGU7XG4gIC8qKiBXaGljaCB2YXJpYW50cyB1c2UgdGhpcyBmaWVsZCAqL1xuICB2YXJpYW50czogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBTdXBlcnNldFJlc3VsdCB7XG4gIC8qKiBBbGwgbWVyZ2VkIGF0dHJpYnV0ZXMga2V5ZWQgYnkgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lICovXG4gIGF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT47XG4gIC8qKiBQZXItdmFyaWFudCBmaWVsZCBtYXA6IG9yaWdpbmFsIGtleSDihpIgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lICovXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+O1xufVxuXG4vLyDilIDilIDilIAgU3VwZXJzZXQgQXR0cmlidXRlIE1lcmdlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIFR5cGVzIGFyZSBjb21wYXRpYmxlIGlmIHRoZXkgaGF2ZSB0aGUgc2FtZSBHdXRlbmJlcmcgYXR0cmlidXRlIGB0eXBlYC5cbiAqL1xuY29uc3QgdHlwZXNBcmVDb21wYXRpYmxlID0gKGE6IEd1dGVuYmVyZ0F0dHJpYnV0ZSwgYjogR3V0ZW5iZXJnQXR0cmlidXRlKTogYm9vbGVhbiA9PiB7XG4gIGlmICghYSB8fCAhYikgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gYS50eXBlID09PSBiLnR5cGU7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgYSB2YXJpYW50IElEIChlLmcuIFwiaGVyby1iYXNpY1wiLCBcImhlcm9fc2VhcmNoXCIpIGludG8gYSB2YWxpZCBjYW1lbENhc2VcbiAqIGlkZW50aWZpZXIgZm9yIHVzZSBpbiBwcmVmaXhlZCBhdHRyaWJ1dGUgbmFtZXMuIEVuc3VyZXMgZ2VuZXJhdGVkIEpTIGNhbiBkZXN0cnVjdHVyZVxuICogYXR0cmlidXRlcyB3aXRob3V0IHF1b3RpbmcgKG5vIGh5cGhlbnMgaW4gbmFtZXMpLlxuICovXG5jb25zdCB2YXJpYW50SWRUb0NhbWVsID0gKHZhcmlhbnRJZDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcyA9ICh2YXJpYW50SWQgPz8gJycpXG4gICAgLnJlcGxhY2UoL1stX10oW2Etel0pL2csIChfLCBsOiBzdHJpbmcpID0+IGwudG9VcHBlckNhc2UoKSlcbiAgICAucmVwbGFjZSgvWy1fXS9nLCAnJyk7XG4gIHJldHVybiBzLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgcy5zbGljZSgxKTtcbn07XG5cbi8qKiBWYXJpYW50IElEIHRvIFBhc2NhbENhc2UgZm9yIEpTIGltcG9ydC9jb21wb25lbnQgbmFtZSAoZS5nLiBoZXJvLWFydGljbGUgLT4gSGVyb0FydGljbGUpLiAqL1xuY29uc3QgdmFyaWFudElkVG9QYXNjYWwgPSAodmFyaWFudElkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjYW1lbCA9IHZhcmlhbnRJZFRvQ2FtZWwodmFyaWFudElkKTtcbiAgcmV0dXJuIGNhbWVsLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgY2FtZWwuc2xpY2UoMSk7XG59O1xuXG4vKipcbiAqIE1lcmdlIGF0dHJpYnV0ZXMgZnJvbSBOIGNvbXBvbmVudHMgaW50byBhIHN1cGVyc2V0IHNjaGVtYS5cbiAqXG4gKiAxLiBTaGFyZWQgZmllbGRzIChzYW1lIG5hbWUsIGNvbXBhdGlibGUgdHlwZSk6IGtlcHQgYXMtaXMuXG4gKiAyLiBDb25mbGljdGluZyBmaWVsZHMgKHNhbWUgbmFtZSwgZGlmZmVyZW50IHR5cGUpOiBwcmVmaXhlZCB3aXRoIHZhcmlhbnQgc2x1Zy5cbiAqIDMuIFVuaXF1ZSBmaWVsZHM6IGtlcHQgYXMtaXMuXG4gKi9cbmV4cG9ydCBjb25zdCBidWlsZFN1cGVyc2V0QXR0cmlidXRlcyA9IChcbiAgdmFyaWFudHM6IFZhcmlhbnRJbmZvW10sXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuKTogU3VwZXJzZXRSZXN1bHQgPT4ge1xuICBjb25zdCBhdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+ID0ge307XG4gIGNvbnN0IGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+ID0ge307XG5cbiAgLy8gRmlyc3QgcGFzczogY29sbGVjdCBhbGwgZmllbGRzIHBlciBvcmlnaW5hbCBrZXkgYWNyb3NzIHZhcmlhbnRzXG4gIGNvbnN0IGZpZWxkc0J5S2V5OiBSZWNvcmQ8XG4gICAgc3RyaW5nLFxuICAgIEFycmF5PHsgdmFyaWFudElkOiBzdHJpbmc7IGF0dHJOYW1lOiBzdHJpbmc7IGF0dHI6IEd1dGVuYmVyZ0F0dHJpYnV0ZSB9PlxuICA+ID0ge307XG5cbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcG9uZW50ID0gdmFyaWFudC5jb21wb25lbnQ7XG4gICAgZmllbGRNYXBzW2NvbXBvbmVudC5pZF0gPSB7fTtcbiAgICBjb25zdCBwcmV2aWV3VmFsdWVzID0gY29tcG9uZW50LnByZXZpZXdzPy5nZW5lcmljPy52YWx1ZXMgfHwge307XG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgb3JpZ0F0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGxldCBtYXBwZWQgPSBtYXBQcm9wZXJ0eVR5cGUocHJvcGVydHksIHByZXZpZXdWYWx1ZXNba2V5XSk7XG5cbiAgICAgIC8vIE5vbi1pbm5lckJsb2Nrc0ZpZWxkIHJpY2h0ZXh0IGJlY29tZXMgYSBzdHJpbmcgYXR0cmlidXRlXG4gICAgICBpZiAobWFwcGVkID09PSBudWxsICYmIHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgJiYga2V5ICE9PSB2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIHtcbiAgICAgICAgbWFwcGVkID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogcHJldmlld1ZhbHVlc1trZXldID8/ICcnIH07XG4gICAgICB9XG4gICAgICBpZiAobWFwcGVkID09PSBudWxsKSBjb250aW51ZTtcblxuICAgICAgaWYgKCFmaWVsZHNCeUtleVtrZXldKSBmaWVsZHNCeUtleVtrZXldID0gW107XG4gICAgICBmaWVsZHNCeUtleVtrZXldLnB1c2goeyB2YXJpYW50SWQ6IGNvbXBvbmVudC5pZCwgYXR0ck5hbWU6IG9yaWdBdHRyTmFtZSwgYXR0cjogbWFwcGVkIH0pO1xuICAgIH1cblxuICAgIC8vIEFsc28gY29sbGVjdCBkeW5hbWljIGFycmF5IGNvbnRyb2wgYXR0cmlidXRlc1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyh2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBkeW5GaWVsZHM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4gPSB7fTtcblxuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RW5hYmxlZGBdID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1FbmFibGVkYF0gPSB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogZmFsc2UgfTtcbiAgICAgICAgZHluRmllbGRzW2Ake2F0dHJOYW1lfVRheG9ub215YF0gPSB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBkeW5Db25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1Tb3VyY2VgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdhdXRvJyB9O1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RW5hYmxlZGBdID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgIGNvbnN0IHNvdXJjZURlZmF1bHQgPSBkeW5Db25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1Tb3VyY2VgXSA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IHNvdXJjZURlZmF1bHQsIGVudW06IFsncXVlcnknLCAnc2VsZWN0JywgJ21hbnVhbCddIH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1Qb3N0VHlwZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogZHluQ29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBkeW5Db25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0JyB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2BdID0geyB0eXBlOiAnYXJyYXknLCBkZWZhdWx0OiBbXSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9UXVlcnlBcmdzYF0gPSB7IHR5cGU6ICdvYmplY3QnLCBkZWZhdWx0OiB7IHBvc3RfdHlwZTogZHluQ29uZmlnLmRlZmF1bHRQb3N0VHlwZSB8fCBkeW5Db25maWcucG9zdFR5cGVzWzBdIHx8ICdwb3N0JywgcG9zdHNfcGVyX3BhZ2U6IGR5bkNvbmZpZy5tYXhJdGVtcyB8fCA2LCBvcmRlcmJ5OiAnZGF0ZScsIG9yZGVyOiAnREVTQycsIHRheF9xdWVyeTogW10sIC4uLihkeW5Db25maWcuZGVmYXVsdFF1ZXJ5QXJncyB8fCB7fSkgfSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYF0gPSB7IHR5cGU6ICdvYmplY3QnLCBkZWZhdWx0OiBkeW5Db25maWcuZmllbGRNYXBwaW5nIHx8IHt9IH07XG4gICAgICAgIGR5bkZpZWxkc1tgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYF0gPSB7IHR5cGU6ICdvYmplY3QnLCBkZWZhdWx0OiB7fSB9O1xuICAgICAgICBkeW5GaWVsZHNbYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWBdID0geyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogZHluQ29uZmlnLnJlbmRlck1vZGUgfHwgJ21hcHBlZCcgfTtcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBbZGFLZXksIGRhQXR0cl0gb2YgT2JqZWN0LmVudHJpZXMoZHluRmllbGRzKSkge1xuICAgICAgICBpZiAoIWZpZWxkc0J5S2V5W2BfX2R5bl8ke2RhS2V5fWBdKSBmaWVsZHNCeUtleVtgX19keW5fJHtkYUtleX1gXSA9IFtdO1xuICAgICAgICBmaWVsZHNCeUtleVtgX19keW5fJHtkYUtleX1gXS5wdXNoKHsgdmFyaWFudElkOiBjb21wb25lbnQuaWQsIGF0dHJOYW1lOiBkYUtleSwgYXR0cjogZGFBdHRyIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFNlY29uZCBwYXNzOiByZXNvbHZlIGNvbmZsaWN0c1xuICBmb3IgKGNvbnN0IFtrZXksIGVudHJpZXNdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkc0J5S2V5KSkge1xuICAgIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICAvLyBDaGVjayBpZiBhbGwgZW50cmllcyBoYXZlIGNvbXBhdGlibGUgdHlwZXNcbiAgICBjb25zdCBmaXJzdCA9IGVudHJpZXNbMF07XG4gICAgY29uc3QgYWxsQ29tcGF0aWJsZSA9IGVudHJpZXMuZXZlcnkoKGUpID0+IHR5cGVzQXJlQ29tcGF0aWJsZShmaXJzdC5hdHRyLCBlLmF0dHIpKTtcblxuICAgIGlmIChhbGxDb21wYXRpYmxlKSB7XG4gICAgICAvLyBTaGFyZWQgb3IgdW5pcXVlIGZpZWxkIOKAlCB1c2Ugb3JpZ2luYWwgbmFtZVxuICAgICAgY29uc3QgbWVyZ2VkTmFtZSA9IGZpcnN0LmF0dHJOYW1lO1xuICAgICAgLy8gVXNlIHRoZSBmaXJzdCB2YXJpYW50J3MgYXR0cmlidXRlIGRlZmluaXRpb24gKGRlZmF1bHRzIG1heSBkaWZmZXIsIHRha2UgZmlyc3QpXG4gICAgICBhdHRyaWJ1dGVzW21lcmdlZE5hbWVdID0gZmlyc3QuYXR0cjtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoIWtleS5zdGFydHNXaXRoKCdfX2R5bl8nKSkge1xuICAgICAgICAgIGZpZWxkTWFwc1tlbnRyeS52YXJpYW50SWRdW2tleV0gPSBtZXJnZWROYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENvbmZsaWN0aW5nIOKAlCBwcmVmaXggd2l0aCB2YXJpYW50IHNsdWcgKG11c3QgYmUgdmFsaWQgSlMgaWRlbnRpZmllciBmb3IgZGVzdHJ1Y3R1cmluZylcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBjb25zdCB2YXJpYW50Q2FtZWwgPSB2YXJpYW50SWRUb0NhbWVsKGVudHJ5LnZhcmlhbnRJZCk7XG4gICAgICAgIGNvbnN0IHByZWZpeGVkID0gdmFyaWFudENhbWVsICsgZW50cnkuYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBlbnRyeS5hdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgYXR0cmlidXRlc1twcmVmaXhlZF0gPSBlbnRyeS5hdHRyO1xuICAgICAgICBpZiAoIWtleS5zdGFydHNXaXRoKCdfX2R5bl8nKSkge1xuICAgICAgICAgIGZpZWxkTWFwc1tlbnRyeS52YXJpYW50SWRdW2tleV0gPSBwcmVmaXhlZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEFsd2F5cyBhZGQgYWxpZ25cbiAgYXR0cmlidXRlcy5hbGlnbiA9IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdmdWxsJyB9O1xuXG4gIHJldHVybiB7IGF0dHJpYnV0ZXMsIGZpZWxkTWFwcyB9O1xufTtcblxuLy8g4pSA4pSA4pSAIEJsb2NrIEljb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IGNob29zZUdyb3VwSWNvbiA9IChncm91cFNsdWc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHNsdWcgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKTtcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2hlcm8nKSkgcmV0dXJuICdmb3JtYXQtaW1hZ2UnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnY2FyZCcpKSByZXR1cm4gJ2luZGV4LWNhcmQnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnZm9ybScpKSByZXR1cm4gJ2ZlZWRiYWNrJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ25hdicpKSByZXR1cm4gJ21lbnUnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnZm9vdGVyJykpIHJldHVybiAndGFibGUtcm93LWFmdGVyJztcbiAgaWYgKHNsdWcuaW5jbHVkZXMoJ2hlYWRlcicpKSByZXR1cm4gJ3RhYmxlLXJvdy1iZWZvcmUnO1xuICBpZiAoc2x1Zy5pbmNsdWRlcygnY3RhJykpIHJldHVybiAnbWVnYXBob25lJztcbiAgcmV0dXJuICdhZG1pbi1jdXN0b21pemVyJztcbn07XG5cbmNvbnN0IGNob29zZVZhcmlhbnRJY29uID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGdyb3VwID0gY29tcG9uZW50Lmdyb3VwPy50b0xvd2VyQ2FzZSgpIHx8ICcnO1xuICBjb25zdCBpZCA9IGNvbXBvbmVudC5pZC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ2hlcm8nKSB8fCBpZC5pbmNsdWRlcygnaGVybycpKSByZXR1cm4gJ2Zvcm1hdC1pbWFnZSc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnY2FyZCcpIHx8IGlkLmluY2x1ZGVzKCdjYXJkJykpIHJldHVybiAnaW5kZXgtY2FyZCc7XG4gIGlmIChncm91cC5pbmNsdWRlcygnZm9ybScpIHx8IGlkLmluY2x1ZGVzKCdmb3JtJykpIHJldHVybiAnZmVlZGJhY2snO1xuICBpZiAoZ3JvdXAuaW5jbHVkZXMoJ25hdicpIHx8IGlkLmluY2x1ZGVzKCduYXYnKSkgcmV0dXJuICdtZW51JztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdmb290ZXInKSB8fCBpZC5pbmNsdWRlcygnZm9vdGVyJykpIHJldHVybiAndGFibGUtcm93LWFmdGVyJztcbiAgaWYgKGdyb3VwLmluY2x1ZGVzKCdoZWFkZXInKSB8fCBpZC5pbmNsdWRlcygnaGVhZGVyJykpIHJldHVybiAndGFibGUtcm93LWJlZm9yZSc7XG4gIHJldHVybiAnYWRtaW4tY3VzdG9taXplcic7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFuIFNWRyBpY29uIGNvZGUgYmxvY2sgZm9yIHRoZSBncm91cCBibG9jaydzIGluZGV4LmpzLlxuICovXG5jb25zdCBnZW5lcmF0ZUdyb3VwU3ZnSWNvbkNvZGUgPSAoZ3JvdXBUaXRsZTogc3RyaW5nLCBncm91cFNsdWc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBnZW5lcmF0ZVN2Z0ljb24oZ3JvdXBUaXRsZSwgZ3JvdXBTbHVnKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgYmxvY2suanNvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRCbG9ja0pzb24gPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBzdXBlcnNldEF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+LFxuICB2YXJpYW50U2NyZWVuc2hvdHM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYW55SGFzU2NyZWVuc2hvdCA9IE9iamVjdC52YWx1ZXModmFyaWFudFNjcmVlbnNob3RzKS5zb21lKEJvb2xlYW4pO1xuXG4gIC8vIEFkZCBoYW5kb2ZmVmFyaWFudCBkaXNjcmltaW5hdG9yXG4gIGNvbnN0IGFsbEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIEd1dGVuYmVyZ0F0dHJpYnV0ZT4gPSB7XG4gICAgaGFuZG9mZlZhcmlhbnQ6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgZGVmYXVsdDogdmFyaWFudHNbMF0uY29tcG9uZW50LmlkLFxuICAgIH0sXG4gICAgLi4uc3VwZXJzZXRBdHRycyxcbiAgfTtcblxuICBpZiAoYW55SGFzU2NyZWVuc2hvdCkge1xuICAgIGFsbEF0dHJpYnV0ZXMuX19wcmV2aWV3ID0geyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlIH07XG4gIH1cblxuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG5cbiAgY29uc3QgdmFyaWF0aW9ucyA9IHZhcmlhbnRzLm1hcCgodikgPT4ge1xuICAgIGNvbnN0IGNvbXAgPSB2LmNvbXBvbmVudDtcbiAgICBjb25zdCB2YXJpYW50RGVmYXVsdHM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7IGhhbmRvZmZWYXJpYW50OiBjb21wLmlkIH07XG4gICAgY29uc3QgdmFyaWF0aW9uOiBhbnkgPSB7XG4gICAgICBuYW1lOiBjb21wLmlkLFxuICAgICAgdGl0bGU6IGNvbXAudGl0bGUsXG4gICAgICBkZXNjcmlwdGlvbjogKGNvbXAuZGVzY3JpcHRpb24gfHwgJycpLnJlcGxhY2UoL1xcblxccysvZywgJyAnKS50cmltKCksXG4gICAgICBhdHRyaWJ1dGVzOiB2YXJpYW50RGVmYXVsdHMsXG4gICAgICBpc0FjdGl2ZTogWydoYW5kb2ZmVmFyaWFudCddLFxuICAgICAgc2NvcGU6IFsnaW5zZXJ0ZXInXSxcbiAgICAgIGljb246IGNob29zZVZhcmlhbnRJY29uKGNvbXApLFxuICAgIH07XG5cbiAgICBpZiAodmFyaWFudFNjcmVlbnNob3RzW2NvbXAuaWRdKSB7XG4gICAgICB2YXJpYXRpb24uZXhhbXBsZSA9IHtcbiAgICAgICAgdmlld3BvcnRXaWR0aDogMTIwMCxcbiAgICAgICAgYXR0cmlidXRlczogeyBoYW5kb2ZmVmFyaWFudDogY29tcC5pZCwgX19wcmV2aWV3OiB0cnVlIH0sXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB2YXJpYXRpb247XG4gIH0pO1xuXG4gIGNvbnN0IGJsb2NrSnNvbjogYW55ID0ge1xuICAgICRzY2hlbWE6ICdodHRwczovL3NjaGVtYXMud3Aub3JnL3RydW5rL2Jsb2NrLmpzb24nLFxuICAgIGFwaVZlcnNpb246IDMsXG4gICAgbmFtZTogYGhhbmRvZmYvJHtibG9ja05hbWV9YCxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIHRpdGxlOiBncm91cFRpdGxlLFxuICAgIGNhdGVnb3J5OiBncm91cFRvQ2F0ZWdvcnkoZ3JvdXBTbHVnKSxcbiAgICBpY29uOiBjaG9vc2VHcm91cEljb24oZ3JvdXBTbHVnKSxcbiAgICBkZXNjcmlwdGlvbjogYCR7Z3JvdXBUaXRsZX0gYmxvY2sgd2l0aCAke3ZhcmlhbnRzLmxlbmd0aH0gdmFyaWF0aW9ucy5gLFxuICAgIGtleXdvcmRzOiBbZ3JvdXBTbHVnXSxcbiAgICB0ZXh0ZG9tYWluOiAnaGFuZG9mZicsXG4gICAgZWRpdG9yU2NyaXB0OiAnZmlsZTouL2luZGV4LmpzJyxcbiAgICBlZGl0b3JTdHlsZTogJ2ZpbGU6Li9pbmRleC5jc3MnLFxuICAgIHN0eWxlOiAnZmlsZTouL3N0eWxlLWluZGV4LmNzcycsXG4gICAgcmVuZGVyOiAnZmlsZTouL3JlbmRlci5waHAnLFxuICAgIGF0dHJpYnV0ZXM6IGFsbEF0dHJpYnV0ZXMsXG4gICAgc3VwcG9ydHM6IHtcbiAgICAgIGFsaWduOiBbJ25vbmUnLCAnd2lkZScsICdmdWxsJ10sXG4gICAgICBodG1sOiBmYWxzZSxcbiAgICB9LFxuICAgIHZhcmlhdGlvbnMsXG4gIH07XG5cbiAgaWYgKGFueUhhc1NjcmVlbnNob3QpIHtcbiAgICBibG9ja0pzb24uZXhhbXBsZSA9IHtcbiAgICAgIHZpZXdwb3J0V2lkdGg6IDEyMDAsXG4gICAgICBhdHRyaWJ1dGVzOiB7IGhhbmRvZmZWYXJpYW50OiB2YXJpYW50c1swXS5jb21wb25lbnQuaWQsIF9fcHJldmlldzogdHJ1ZSB9LFxuICAgIH07XG4gIH1cblxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYmxvY2tKc29uLCBudWxsLCAyKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgaW5kZXguanMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbi8qKlxuICogUmVwbGFjZSBvY2N1cnJlbmNlcyBvZiBhIHJlZ2V4IHBhdHRlcm4gb25seSBpbiBjb2RlIHNlZ21lbnRzLFxuICogc2tpcHBpbmcgY29udGVudCBpbnNpZGUgcXVvdGVkIHN0cmluZ3MgKHNpbmdsZSwgZG91YmxlLCBvciBiYWNrdGljaykuXG4gKiBUaGlzIHByZXZlbnRzIGZpZWxkIG5hbWUgcmVtYXBwaW5nIGZyb20gY29ycnVwdGluZyBDU1MgY2xhc3MgbmFtZXNcbiAqIGFuZCBvdGhlciBzdHJpbmcgbGl0ZXJhbHMgaW4gdGhlIGdlbmVyYXRlZCBKU1guXG4gKi9cbmNvbnN0IHJlcGxhY2VPdXRzaWRlU3RyaW5ncyA9IChqc3g6IHN0cmluZywgcGF0dGVybjogUmVnRXhwLCByZXBsYWNlbWVudDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qgc2VnbWVudHM6IHN0cmluZ1tdID0gW107XG4gIGxldCBpID0gMDtcbiAgbGV0IGluU3RyaW5nOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNlZ1N0YXJ0ID0gMDtcblxuICB3aGlsZSAoaSA8IGpzeC5sZW5ndGgpIHtcbiAgICBpZiAoaW5TdHJpbmcpIHtcbiAgICAgIGlmIChqc3hbaV0gPT09ICdcXFxcJykge1xuICAgICAgICBpICs9IDI7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGpzeFtpXSA9PT0gaW5TdHJpbmcpIHtcbiAgICAgICAgc2VnbWVudHMucHVzaChqc3guc2xpY2Uoc2VnU3RhcnQsIGkgKyAxKSk7XG4gICAgICAgIHNlZ1N0YXJ0ID0gaSArIDE7XG4gICAgICAgIGluU3RyaW5nID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIGkrKztcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGpzeFtpXSA9PT0gJ1wiJyB8fCBqc3hbaV0gPT09IFwiJ1wiIHx8IGpzeFtpXSA9PT0gJ2AnKSB7XG4gICAgICAgIGNvbnN0IG5vblN0cmluZ1BhcnQgPSBqc3guc2xpY2Uoc2VnU3RhcnQsIGkpO1xuICAgICAgICBzZWdtZW50cy5wdXNoKG5vblN0cmluZ1BhcnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlbWVudCkpO1xuICAgICAgICBzZWdTdGFydCA9IGk7XG4gICAgICAgIGluU3RyaW5nID0ganN4W2ldO1xuICAgICAgICBpKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpKys7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHNlZ1N0YXJ0IDwganN4Lmxlbmd0aCkge1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IGpzeC5zbGljZShzZWdTdGFydCk7XG4gICAgaWYgKGluU3RyaW5nKSB7XG4gICAgICBzZWdtZW50cy5wdXNoKHJlbWFpbmluZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlZ21lbnRzLnB1c2gocmVtYWluaW5nLnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc2VnbWVudHMuam9pbignJyk7XG59O1xuXG5pbnRlcmZhY2UgTWVyZ2VkSW5kZXhSZXN1bHQge1xuICBpbmRleEpzOiBzdHJpbmc7XG4gIHZhcmlhdGlvbkpzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZEluZGV4SnMgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuICBzdXBlcnNldEF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBHdXRlbmJlcmdBdHRyaWJ1dGU+LFxuICBmaWVsZE1hcHM6IFJlY29yZDxzdHJpbmcsIEZpZWxkTWFwPixcbiAgYXBpVXJsPzogc3RyaW5nLFxuICB2YXJpYW50U2NyZWVuc2hvdHM/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPixcbik6IE1lcmdlZEluZGV4UmVzdWx0ID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIC8vIENvbGxlY3QgYWxsIHVuaXF1ZSBmZWF0dXJlcyBuZWVkZWQgYWNyb3NzIHZhcmlhbnRzXG4gIGxldCBuZWVkc01lZGlhVXBsb2FkID0gZmFsc2U7XG4gIGxldCBuZWVkc1JhbmdlQ29udHJvbCA9IGZhbHNlO1xuICBsZXQgbmVlZHNUb2dnbGVDb250cm9sID0gZmFsc2U7XG4gIGxldCBuZWVkc1NlbGVjdENvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IG5lZWRzTGlua0NvbnRyb2wgPSBmYWxzZTtcbiAgbGV0IGhhc0FycmF5UHJvcHMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc0R5bmFtaWNBcnJheXMgPSBmYWxzZTtcbiAgbGV0IGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzID0gZmFsc2U7XG4gIGxldCBhbnlIYXNUYXhvbm9teUFycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IGZhbHNlO1xuICBsZXQgYW55VXNlc0lubmVyQmxvY2tzID0gZmFsc2U7XG4gIGxldCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXNSaWNoVGV4dCA9IGZhbHNlO1xuICBsZXQgYW55UHJldmlld1VzZXMxMHVwSW1hZ2UgPSBmYWxzZTtcbiAgbGV0IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBmYWxzZTtcblxuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgdHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2sgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUoY2hlY2spO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtc3BlY2lmaWMgY29udGVudCAoc2lkZWJhciBwYW5lbHMgKyBwcmV2aWV3KVxuICBpbnRlcmZhY2UgVmFyaWFudEdlblJlc3VsdCB7XG4gICAgcGFuZWxzOiBzdHJpbmc7XG4gICAgcHJldmlld0pzeDogc3RyaW5nO1xuICAgIGFycmF5SGVscGVyczogc3RyaW5nO1xuICAgIGR5bmFtaWNSZXNvbHV0aW9uOiBzdHJpbmc7XG4gICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uOiBzdHJpbmc7XG4gICAgaGFzQnJlYWRjcnVtYnNGZXRjaDogYm9vbGVhbjtcbiAgICBoYXNUYXhvbm9teUZldGNoOiBib29sZWFuO1xuICAgIHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXTtcbiAgICBoYXNMaW5rRmllbGQ6IGJvb2xlYW47XG4gICAgaGFzUmljaFRleHQ6IGJvb2xlYW47XG4gICAgaGFzMTB1cEltYWdlOiBib29sZWFuO1xuICAgIGhhc0lubmVyQmxvY2tzOiBib29sZWFuO1xuICB9XG5cbiAgY29uc3QgdmFyaWFudFJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIFZhcmlhbnRHZW5SZXN1bHQ+ID0ge307XG5cbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICAgIGNvbnN0IHByb3BlcnRpZXMgPSBjb21wLnByb3BlcnRpZXM7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgZHluYW1pY0FycmF5Q29uZmlncyA9IHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncztcbiAgICBjb25zdCBoYXNEeW5hbWljID0gT2JqZWN0LmtleXMoZHluYW1pY0FycmF5Q29uZmlncykubGVuZ3RoID4gMDtcblxuICAgIC8vIERldGVjdCBmZWF0dXJlIG5lZWRzXG4gICAgaWYgKGhhc1Byb3BlcnR5VHlwZShwcm9wZXJ0aWVzLCAnaW1hZ2UnKSkgbmVlZHNNZWRpYVVwbG9hZCA9IHRydWU7XG4gICAgaWYgKGhhc1Byb3BlcnR5VHlwZShwcm9wZXJ0aWVzLCAnbnVtYmVyJykgfHwgY29tcC5jb2RlLmluY2x1ZGVzKCdvdmVybGF5JykpIG5lZWRzUmFuZ2VDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNUb2dnbGVDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdzZWxlY3QnKSkgbmVlZHNTZWxlY3RDb250cm9sID0gdHJ1ZTtcbiAgICBpZiAoaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKHByb3BlcnRpZXMsICdidXR0b24nKSkgbmVlZHNMaW5rQ29udHJvbCA9IHRydWU7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZSgocCkgPT4gcC50eXBlID09PSAnYXJyYXknKSkgaGFzQXJyYXlQcm9wcyA9IHRydWU7XG4gICAgaWYgKGhhc0R5bmFtaWMpIHtcbiAgICAgIGNvbnN0IGhhc1Bvc3RzRHluYW1pYyA9IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSk7XG4gICAgICBpZiAoaGFzUG9zdHNEeW5hbWljKSB7IGFueUhhc0R5bmFtaWNBcnJheXMgPSB0cnVlOyBuZWVkc1NlbGVjdENvbnRyb2wgPSB0cnVlOyB9XG4gICAgICAvLyBCcmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uIHVzZSBzaGFyZWQgY29tcG9uZW50cyDigJQgdGhleSBpbXBvcnQgdGhlaXIgb3duXG4gICAgICAvLyBUb2dnbGVDb250cm9sL1NlbGVjdENvbnRyb2wsIHNvIHdlIGRvIG5vdCBuZWVkIHRvIGFkZCB0aG9zZSB0byB0aGUgZ3JvdXAgYmxvY2sgaW1wb3J0cy5cbiAgICAgIGlmIChPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpKSBhbnlIYXNCcmVhZGNydW1ic0FycmF5cyA9IHRydWU7XG4gICAgICBpZiAoT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKSkgYW55SGFzVGF4b25vbXlBcnJheXMgPSB0cnVlO1xuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKSkgYW55SGFzUGFnaW5hdGlvbkFycmF5cyA9IHRydWU7XG4gICAgfVxuICAgIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIGFueVVzZXNJbm5lckJsb2NrcyA9IHRydWU7XG5cbiAgICAvLyBHZW5lcmF0ZSBwcmV2aWV3IChndWFyZCBhZ2FpbnN0IG1pc3NpbmcgY29kZS90aXRsZSBmcm9tIEFQSSlcbiAgICBjb25zdCBwcmV2aWV3UmVzdWx0OiBKc3hQcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgICAgY29tcC5jb2RlID8/ICcnLFxuICAgICAgcHJvcGVydGllcyxcbiAgICAgIGNvbXAuaWQgPz8gY29tcC50aXRsZSA/PyAndmFyaWFudCcsXG4gICAgICBjb21wLnRpdGxlID8/IGNvbXAuaWQgPz8gJ1ZhcmlhbnQnLFxuICAgICAgdmFyaWFudC5pbm5lckJsb2Nrc0ZpZWxkLFxuICAgICk7XG4gICAgbGV0IHByZXZpZXdKc3ggPSBwcmV2aWV3UmVzdWx0LmpzeCA/PyAnJztcbiAgICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgICBjb25zdCB2YXJIYXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuICAgIGNvbnN0IHZhckhhc1JpY2hUZXh0ID0gcHJldmlld0pzeC5pbmNsdWRlcygnPFJpY2hUZXh0Jyk7XG4gICAgY29uc3QgdmFySGFzMTB1cEltYWdlID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJyk7XG4gICAgY29uc3QgdmFySGFzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgICBpZiAodmFySGFzTGlua0ZpZWxkKSBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHRydWU7XG4gICAgaWYgKHZhckhhc1JpY2hUZXh0KSBhbnlQcmV2aWV3VXNlc1JpY2hUZXh0ID0gdHJ1ZTtcbiAgICBpZiAodmFySGFzMTB1cEltYWdlKSBhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSA9IHRydWU7XG4gICAgaWYgKHZhckhhc0lubmVyQmxvY2tzKSBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gdHJ1ZTtcblxuICAgIC8vIFJlbWFwIGF0dHJpYnV0ZSByZWZlcmVuY2VzIGluIHByZXZpZXcgSlNYIHVzaW5nIGZpZWxkTWFwLlxuICAgIC8vIFVzZXMgcmVwbGFjZU91dHNpZGVTdHJpbmdzIHRvIGF2b2lkIGNvcnJ1cHRpbmcgQ1NTIGNsYXNzIG5hbWVzXG4gICAgLy8gYW5kIG90aGVyIHN0cmluZyBsaXRlcmFscyB0aGF0IGhhcHBlbiB0byBjb250YWluIHRoZSBmaWVsZCBuYW1lLlxuICAgIGZvciAoY29uc3QgW29yaWdLZXksIG1lcmdlZE5hbWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwKSkge1xuICAgICAgY29uc3Qgb3JpZ0NhbWVsID0gdG9DYW1lbENhc2Uob3JpZ0tleSk7XG4gICAgICBpZiAob3JpZ0NhbWVsICE9PSBtZXJnZWROYW1lKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke29yaWdDYW1lbH1cXFxcYmAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSByZXBsYWNlT3V0c2lkZVN0cmluZ3MocHJldmlld0pzeCwgcmVnZXgsIG1lcmdlZE5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIHBhbmVscyBmb3Igc2lkZWJhciBjb250cm9sc1xuICAgIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcbiAgICAgIGlmIChpbmxpbmVFZGl0YWJsZUZpZWxkcy5oYXMoa2V5KSAmJiBwcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcblxuICAgICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHttZXJnZWRBdHRyTmFtZX1cIlxuICAgICAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgICAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gICAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgICAgPyBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWw6IHN0cmluZykgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAgICcsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ1VSTCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLnVybCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgdXJsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPmA7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke21lcmdlZEF0dHJOYW1lfVwiXG4gICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRUYXhvbm9teT1cIiR7ZGVmYXVsdFRheG9ub215fVwiXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgICAgICA8PlxuJHtpdGVtRmllbGRzfVxuICAgICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgICAgICA8UGFnaW5hdGlvblNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7bWVyZ2VkQXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgICAgY29uc3QgZGVmYXVsdE1vZGUgPSBkeW5hbWljQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICAgIGlmIChjLm1vZGUgPT09ICd1aScpIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lLCBsYWJlbDogYy5sYWJlbCwgdHlwZTogJ3NlbGVjdCcsIG9wdGlvbnM6IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoYy5vcHRpb25zKSwgZGVmYXVsdDogYy5kZWZhdWx0IH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IGR5bmFtaWNDb25maWcuZmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgICBjb25zdCB0b3BLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICAgIGxldCBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgICBpZiAoaXRlbVByb3ApIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6IGNvbnRyb2xUeXBlID0gJ3NlbGVjdCc7IG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOiBjb250cm9sVHlwZSA9ICd0b2dnbGUnOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOiBjb250cm9sVHlwZSA9ICdudW1iZXInOyBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyAwOyBicmVhaztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGNvbnRyb2xUeXBlID0gJ3RleHQnOyBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgfHwgJyR7ZGVmYXVsdE1vZGV9JyxcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9zdHM6ICR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhuZXh0VmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoe1xuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgJHttZXJnZWRBdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJnczogeyAuLi5uZXh0VmFsdWUucXVlcnlBcmdzLCBwb3N0X3R5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSB9LFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgICAgIG1heEl0ZW1zOiAke2R5bmFtaWNDb25maWcubWF4SXRlbXMgPz8gMjB9LFxuICAgICAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICAgICAgc2hvd0V4Y2x1ZGVDdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgeyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJyAmJiAoXG4gICAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICB7LyogTWFudWFsIGFycmF5IGNvbnRyb2xzICovfVxuICAgICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xJbmRlbnQgPSAnICAgICAgICAgICAgICAgICc7XG4gICAgICAgIGxldCBjb250cm9sT3V0cHV0OiBzdHJpbmc7XG4gICAgICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgICAgY29udHJvbE91dHB1dCA9IGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIG1lcmdlZEF0dHJOYW1lLCBsYWJlbCwgY29udHJvbEluZGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBtZXJnZWRBdHRyTmFtZSxcbiAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlOiBzdHJpbmcpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHttZXJnZWRBdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICAgICAgICAgIGluZGVudDogY29udHJvbEluZGVudCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNvbnRyb2xPdXRwdXQgPSBnZW5lcmF0ZUZpZWxkQ29udHJvbChrZXksIHByb3BlcnR5LCBjdHgpO1xuICAgICAgICB9XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4ke2NvbnRyb2xPdXRwdXR9XG4gICAgICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gRGVzaWduIFN5c3RlbSBsaW5rcyBwYW5lbCAocGVyLXZhcmlhbnQgY29tcG9uZW50IFVSTHMpXG4gICAgbGV0IGhhbmRvZmZVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBpZiAoYXBpVXJsKSB7XG4gICAgICBjb25zdCBiYXNlVXJsID0gYXBpVXJsLnJlcGxhY2UoL1xcL2FwaVxcLz8kLywgJycpO1xuICAgICAgaGFuZG9mZlVybCA9IGAke2Jhc2VVcmx9L3N5c3RlbS9jb21wb25lbnQvJHtjb21wLmlkfWA7XG4gICAgfSBlbHNlIGlmIChjb21wLnByZXZpZXcpIHtcbiAgICAgIGhhbmRvZmZVcmwgPSBjb21wLnByZXZpZXc7XG4gICAgfVxuICAgIGNvbnN0IGZpZ21hVXJsID0gY29tcC5maWdtYTtcbiAgICBpZiAoaGFuZG9mZlVybCB8fCBmaWdtYVVybCkge1xuICAgICAgY29uc3QgbGlua0J1dHRvbnM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoaGFuZG9mZlVybCkge1xuICAgICAgICBsaW5rQnV0dG9ucy5wdXNoKGAgICAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIlxuICAgICAgICAgICAgICAgICAgICBocmVmPVwiJHtoYW5kb2ZmVXJsfVwiXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIlxuICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyB9fVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICB7X18oJ1ZpZXcgaW4gSGFuZG9mZicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICA8L0J1dHRvbj5gKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWdtYVVybCkge1xuICAgICAgICBsaW5rQnV0dG9ucy5wdXNoKGAgICAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIlxuICAgICAgICAgICAgICAgICAgICBocmVmPVwiJHtmaWdtYVVybH1cIlxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIlxuICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJcbiAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyB9fVxuICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICB7X18oJ09wZW4gaW4gRmlnbWEnLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgPC9CdXR0b24+YCk7XG4gICAgICB9XG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnRGVzaWduIFN5c3RlbScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7bGlua0J1dHRvbnMuam9pbignXFxuJyl9XG4gICAgICAgICAgICAgICAgPC9GbGV4PlxuICAgICAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG5cbiAgICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gY29kZVxuICAgIC8vIFNwZWNpYWxpemVkIGFycmF5cyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgcmVzb2x2ZSBpbiB0aGVcbiAgICAvLyB2YXJpYXRpb24gZmlsZSdzIFByZXZpZXcgZnVuY3Rpb24gc28gdGhlIGhvb2tzIGxpdmUgaW4gdGhlIGNvcnJlY3Qgc2NvcGUuXG4gICAgLy8gRHluYW1pYyBwb3N0IGFycmF5cyByZXNvbHZlIGluIHRoZSBtYWluIGluZGV4LmpzIGVkaXQoKS5cbiAgICBsZXQgZHluYW1pY1Jlc29sdXRpb24gPSAnJztcbiAgICBsZXQgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uID0gJyc7XG4gICAgbGV0IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2ggPSBmYWxzZTtcbiAgICBsZXQgdmFySGFzVGF4b25vbXlGZXRjaCA9IGZhbHNlO1xuICAgIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChoYXNEeW5hbWljKSB7XG4gICAgICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2ZpZWxkS2V5XSB8fCB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgICB2YXJIYXNCcmVhZGNydW1ic0ZldGNoID0gdHJ1ZTtcbiAgICAgICAgICBjb25zdCBjYXAgPSBtZXJnZWRBdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1lcmdlZEF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKcyA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYCA6ICcnO1xuICAgICAgICAgIHNwZWNpYWxpemVkUmVzb2x1dGlvbiArPSBgXG4gIGNvbnN0IFtwcmV2aWV3JHtjYXB9LCBzZXRQcmV2aWV3JHtjYXB9XSA9IHVzZVN0YXRlKG51bGwpO1xuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgIGlmICghJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgIC50aGVuKChpdGVtcykgPT4gc2V0UHJldmlldyR7Y2FwfSgoaXRlbXMgfHwgW10pJHttYXBFeHByfSkpXG4gICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICB9LCBbJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICAgIHZhckhhc1RheG9ub215RmV0Y2ggPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IGNhcCA9IG1lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnMgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWAgOiAnJztcbiAgICAgICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24gKz0gYFxuICBjb25zdCBwcmV2aWV3JHtjYXB9ID0gdXNlU2VsZWN0KFxuICAgIChzZWxlY3QpID0+IHtcbiAgICAgIGlmICghJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICBpZiAoJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gJHttZXJnZWRBdHRyTmFtZX0gfHwgW107XG4gICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgIGNvbnN0IHRheG9ub215ID0gJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teSB8fCAnJHtkeW5Db25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnfSc7XG4gICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgIGNvbnN0IHRlcm1zID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldEVudGl0eVJlY29yZHMoJ3RheG9ub215JywgdGF4b25vbXksIHsgcG9zdDogcG9zdElkLCBwZXJfcGFnZTogJHtkeW5Db25maWcubWF4SXRlbXMgPz8gLTF9IH0pO1xuICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgIH0sXG4gICAgWyR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZCwgJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UsICR7bWVyZ2VkQXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9IHx8IFtdKV1cbiAgKTtcbmA7XG4gICAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHttZXJnZWRBdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgICAgc3BlY2lhbGl6ZWRSZXNvbHV0aW9uICs9IGBcbiAgY29uc3QgcHJldmlldyR7bWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke21lcmdlZEF0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke21lcmdlZEF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbWVyZ2VkQXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2FwID0gbWVyZ2VkQXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBtZXJnZWRBdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkVmFyTmFtZSA9IGByZXNvbHZlZCR7Y2FwfWA7XG4gICAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgICBkeW5hbWljUmVzb2x1dGlvbiArPSBgXG4gICAgICBjb25zdCAke3Jlc29sdmVkVmFyTmFtZX0gPSB1c2VTZWxlY3QoXG4gICAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgICBpZiAoJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgICAgY29uc3QgcXVlcnlBcmdzID0gJHttZXJnZWRBdHRyTmFtZX1RdWVyeUFyZ3MgfHwge307XG4gICAgICAgICAgICBjb25zdCBwb3N0VHlwZSA9ICR7bWVyZ2VkQXR0ck5hbWV9UG9zdFR5cGUgfHwgJ3Bvc3QnO1xuICAgICAgICAgICAgY29uc3QgYXJncyA9IHtcbiAgICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2R5bkNvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgICBvcmRlcjogKHF1ZXJ5QXJncy5vcmRlciB8fCAnREVTQycpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHJlY29yZHMpKSByZXR1cm4gW107XG4gICAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHttZXJnZWRBdHRyTmFtZX1GaWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke21lcmdlZEF0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge307XG4gICAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICgke21lcmdlZEF0dHJOYW1lfVNvdXJjZSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHttZXJnZWRBdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke21lcmdlZEF0dHJOYW1lfUZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7bWVyZ2VkQXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiBzZWxlY3RlZFxuICAgICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWMgPyBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KSA6IG51bGw7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSxcbiAgICAgICAgWyR7bWVyZ2VkQXR0ck5hbWV9U291cmNlLCAke21lcmdlZEF0dHJOYW1lfVBvc3RUeXBlLCBKU09OLnN0cmluZ2lmeSgke21lcmdlZEF0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7bWVyZ2VkQXR0ck5hbWV9RmllbGRNYXBwaW5nIHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHttZXJnZWRBdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9KV1cbiAgICAgICk7XG4gICAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7bWVyZ2VkQXR0ck5hbWV9U291cmNlICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7bWVyZ2VkQXR0ck5hbWV9ID8/IFtdKTtcbiAgICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke21lcmdlZEF0dHJOYW1lfVNvdXJjZSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgICAvLyBSZW1hcCBpbiBwcmV2aWV3XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7bWVyZ2VkQXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIHByZXZpZXdWYXJOYW1lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBcnJheSBoZWxwZXJzXG4gICAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnNNZXJnZWQocHJvcGVydGllcywgZmllbGRNYXApO1xuXG4gICAgdmFyaWFudFJlc3VsdHNbY29tcC5pZF0gPSB7XG4gICAgICBwYW5lbHM6IHBhbmVscy5qb2luKCdcXG5cXG4nKSxcbiAgICAgIHByZXZpZXdKc3gsXG4gICAgICBhcnJheUhlbHBlcnMsXG4gICAgICBkeW5hbWljUmVzb2x1dGlvbjogZHluYW1pY1Jlc29sdXRpb24sXG4gICAgICBzcGVjaWFsaXplZFJlc29sdXRpb24sXG4gICAgICBoYXNCcmVhZGNydW1ic0ZldGNoOiB2YXJIYXNCcmVhZGNydW1ic0ZldGNoLFxuICAgICAgaGFzVGF4b25vbXlGZXRjaDogdmFySGFzVGF4b25vbXlGZXRjaCxcbiAgICAgIHJlc29sdmluZ0ZsYWdzLFxuICAgICAgaGFzTGlua0ZpZWxkOiB2YXJIYXNMaW5rRmllbGQsXG4gICAgICBoYXNSaWNoVGV4dDogdmFySGFzUmljaFRleHQsXG4gICAgICBoYXMxMHVwSW1hZ2U6IHZhckhhczEwdXBJbWFnZSxcbiAgICAgIGhhc0lubmVyQmxvY2tzOiB2YXJIYXNJbm5lckJsb2NrcyxcbiAgICB9O1xuICB9XG5cbiAgLy8gQnVpbGQgaW1wb3J0c1xuICBjb25zdCBibG9ja0VkaXRvckltcG9ydHMgPSBbJ3VzZUJsb2NrUHJvcHMnLCAnSW5zcGVjdG9yQ29udHJvbHMnLCAnQmxvY2tDb250cm9scyddO1xuICBpZiAobmVlZHNNZWRpYVVwbG9hZCkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICBpZiAoYW55VXNlc0lubmVyQmxvY2tzIHx8IGFueVByZXZpZXdVc2VzSW5uZXJCbG9ja3MpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICBpZiAobmVlZHNMaW5rQ29udHJvbCB8fCBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkge1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdMaW5rQ29udHJvbCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTGlua0NvbnRyb2wnKTtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cbiAgaWYgKChhbnlQcmV2aWV3VXNlc1JpY2hUZXh0IHx8IGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cblxuICBjb25zdCBjb21wb25lbnRJbXBvcnRzID0gWydQYW5lbEJvZHknLCAnVGV4dENvbnRyb2wnLCAnQnV0dG9uJywgJ1NlbGVjdENvbnRyb2wnLCAnRHJvcGRvd25NZW51J107XG4gIGlmIChuZWVkc1JhbmdlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdSYW5nZUNvbnRyb2wnKTtcbiAgaWYgKG5lZWRzVG9nZ2xlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdUb2dnbGVDb250cm9sJyk7XG4gIGlmIChhbnlIYXNEeW5hbWljQXJyYXlzKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1NwaW5uZXInKTtcbiAgY29uc3QgYW55SGFzUmljaHRleHRJbkFycmF5ID0gdmFyaWFudHMuc29tZSgodikgPT5cbiAgICBPYmplY3QudmFsdWVzKHYuY29tcG9uZW50LnByb3BlcnRpZXMpLnNvbWUocCA9PlxuICAgICAgcC50eXBlID09PSAnYXJyYXknICYmIHAuaXRlbXM/LnByb3BlcnRpZXMgJiZcbiAgICAgIE9iamVjdC52YWx1ZXMocC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGlwID0+IGlwLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICAgKVxuICApO1xuICBpZiAoYW55SGFzUmljaHRleHRJbkFycmF5KSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RleHRhcmVhQ29udHJvbCcpO1xuICBjb21wb25lbnRJbXBvcnRzLnB1c2goJ0ZsZXgnKTtcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wgfHwgYW55UHJldmlld1VzZXNMaW5rRmllbGQpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIGZvciBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IHByb3BlcnRpZXMgYWNyb3NzIGFsbCB2YXJpYW50c1xuICBjb25zdCBhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA9IHZhcmlhbnRzLnNvbWUoKHYpID0+XG4gICAgT2JqZWN0LmVudHJpZXModi5jb21wb25lbnQucHJvcGVydGllcykuc29tZShcbiAgICAgIChbaywgcF0pID0+IHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIXYuZHluYW1pY0FycmF5Q29uZmlnc1trXSB8fCAhKCdhcnJheVR5cGUnIGluIHYuZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICAgKVxuICApO1xuICBjb25zdCB0ZW5VcEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChhbnlWYXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cykgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIGlmIChhbnlQcmV2aWV3VXNlczEwdXBJbWFnZSkgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDAgPyBgaW1wb3J0IHsgJHt0ZW5VcEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gIDogJyc7XG5cbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoYW55SGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoYW55SGFzQnJlYWRjcnVtYnNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmIChhbnlIYXNUYXhvbm9teUFycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGFueUhhc1BhZ2luYXRpb25BcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBhbnlIYXNEeW5hbWljQXJyYXlzIHx8IGFueUhhc1RheG9ub215QXJyYXlzO1xuICBpZiAobmVlZHNEYXRhU3RvcmUpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IHVzZVNlbGVjdCR7YW55SGFzQnJlYWRjcnVtYnNBcnJheXMgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGFueUhhc0JyZWFkY3J1bWJzQXJyYXlzKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cbiAgaWYgKGFueVByZXZpZXdVc2VzTGlua0ZpZWxkKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gO1xuICB9XG5cbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChhbnlIYXNCcmVhZGNydW1ic0FycmF5cykge1xuICAgIGVsZW1lbnRJbXBvcnRzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuICB9XG5cbiAgLy8gQWxsIGF0dHJpYnV0ZSBuYW1lcyBmb3IgZGVzdHJ1Y3R1cmluZ1xuICBjb25zdCBhbGxBdHRyTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgYWxsQXR0ck5hbWVzLmFkZCgnaGFuZG9mZlZhcmlhbnQnKTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBPYmplY3Qua2V5cyhzdXBlcnNldEF0dHJzKSkge1xuICAgIGFsbEF0dHJOYW1lcy5hZGQoYXR0ck5hbWUpO1xuICB9XG4gIC8vIEFsc28gYWRkIGR5bmFtaWMgYXJyYXkgZGVyaXZlZCBhdHRyaWJ1dGUgbmFtZXNcbiAgZm9yIChjb25zdCB2YXJpYW50IG9mIHZhcmlhbnRzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhbnQuZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gZmllbGRNYXBzW3ZhcmlhbnQuY29tcG9uZW50LmlkXVtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgYWxsQXR0ck5hbWVzLmFkZChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICBhbGxBdHRyTmFtZXMuYWRkKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgIGFsbEF0dHJOYW1lcy5hZGQoYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRvb2xiYXIgdmFyaWF0aW9uIHN3aXRjaGVyIGNvbnRyb2xzIChmb3IgQmxvY2tDb250cm9scyBEcm9wZG93bk1lbnUpXG4gIGNvbnN0IHRvb2xiYXJWYXJpYW50Q29udHJvbHMgPSB2YXJpYW50c1xuICAgIC5tYXAoXG4gICAgICAodikgPT5cbiAgICAgICAgYCAgICAgICAgeyB0aXRsZTogJyR7KHYuY29tcG9uZW50LnRpdGxlID8/IHYuY29tcG9uZW50LmlkID8/ICcnKS50b1N0cmluZygpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCBvbkNsaWNrOiAoKSA9PiBzZXRBdHRyaWJ1dGVzKHsgaGFuZG9mZlZhcmlhbnQ6ICcke3YuY29tcG9uZW50LmlkID8/ICcnfScgfSkgfWAsXG4gICAgKVxuICAgIC5qb2luKCcsXFxuJyk7XG5cbiAgLy8gQ29sbGVjdCBhbGwgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lcyB0aGF0IGFyZSBhcnJheSB0eXBlIChhY3Jvc3MgYWxsIHZhcmlhbnRzKSBzbyB3ZSBlbWl0IGVhY2ggaGVscGVyIG9uY2VcbiAgY29uc3QgYWxsQXJyYXlNZXJnZWROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF07XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JykgYWxsQXJyYXlNZXJnZWROYW1lcy5hZGQoZmllbGRNYXBba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2hhcmVkQXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMoYWxsQXJyYXlNZXJnZWROYW1lcyk7XG5cbiAgLy8gVmFyaWF0aW9uIGluY2x1ZGUgaW1wb3J0cyBhbmQgY29tcG9uZW50IHVzYWdlIChvbmUgZmlsZSBwZXIgdmFyaWFudClcbiAgY29uc3QgdmFyaWFudEltcG9ydExpbmVzID0gdmFyaWFudHMubWFwKFxuICAgICh2KSA9PiBgaW1wb3J0ICogYXMgJHt2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCl9IGZyb20gJy4vdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfSc7YCxcbiAgKTtcbiAgY29uc3QgaGVscGVyTmFtZXNMaXN0ID0gWy4uLmFsbEFycmF5TWVyZ2VkTmFtZXNdLm1hcChcbiAgICAoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWAsXG4gICk7XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgaGVscGVyTmFtZXNMaXN0LnB1c2goJ0hhbmRvZmZMaW5rRmllbGQnKTtcbiAgaWYgKGFueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzKSBoZWxwZXJOYW1lc0xpc3QucHVzaCgnQ09OVEVOVF9CTE9DS1MnKTtcbiAgY29uc3QgaGVscGVyc09iamVjdExpbmUgPVxuICAgIGhlbHBlck5hbWVzTGlzdC5sZW5ndGggPiAwXG4gICAgICA/IGAgICAgY29uc3QgaGVscGVycyA9IHsgJHtoZWxwZXJOYW1lc0xpc3Quam9pbignLCAnKX0gfTtgXG4gICAgICA6ICcgICAgY29uc3QgaGVscGVycyA9IHt9Oyc7XG5cbiAgY29uc3QgdmFyaWFudFBhbmVsQmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgICBpZiAoIXJlc3VsdC5wYW5lbHMudHJpbSgpKSByZXR1cm4gJyc7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHt2LmNvbXBvbmVudC5pZH0nICYmIDwke1Bhc2NhbH0uUGFuZWxzIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIGNvbnN0IHZhcmlhbnRQcmV2aWV3QmxvY2tzID0gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiB7XG4gICAgICBjb25zdCBQYXNjYWwgPSB2YXJpYW50SWRUb1Bhc2NhbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICByZXR1cm4gYCAgICAgICAgICB7aGFuZG9mZlZhcmlhbnQgPT09ICcke3YuY29tcG9uZW50LmlkfScgJiYgPCR7UGFzY2FsfS5QcmV2aWV3IGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9IHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9IGhlbHBlcnM9e2hlbHBlcnN9IGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9IC8+fWA7XG4gICAgfSlcbiAgICAuam9pbignXFxuJyk7XG5cbiAgLy8gUGVyLXZhcmlhbnQgSlMgaW5jbHVkZSBmaWxlIGNvbnRlbnRzICh3cml0dGVuIHRvIHZhcmlhdGlvbnMvPGlkPi5qcylcbiAgY29uc3QgdmFyaWF0aW9uSnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGNvbnN0IGZpZWxkTWFwID0gZmllbGRNYXBzW3YuY29tcG9uZW50LmlkXTtcbiAgICBjb25zdCBoZWxwZXJOYW1lcyA9IFsuLi5hbGxBcnJheU1lcmdlZE5hbWVzXVxuICAgICAgLmZpbHRlcigoYXR0ck5hbWUpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyh2LmNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgKGZpZWxkTWFwc1t2LmNvbXBvbmVudC5pZF1ba2V5XSB8fCB0b0NhbWVsQ2FzZShrZXkpKSA9PT0gYXR0ck5hbWUpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KVxuICAgICAgLm1hcCgoYSkgPT4gYHVwZGF0ZSR7YS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGEuc2xpY2UoMSl9SXRlbWApO1xuICAgIHZhcmlhdGlvbkpzW3YuY29tcG9uZW50LmlkXSA9IGdlbmVyYXRlVmFyaWFudEpzRmlsZUNvbnRlbnQoXG4gICAgICB2LFxuICAgICAgcmVzdWx0LFxuICAgICAgZmllbGRNYXAsXG4gICAgICBoZWxwZXJOYW1lcyxcbiAgICAgIGFueVByZXZpZXdVc2VzTGlua0ZpZWxkLFxuICAgICk7XG4gIH1cblxuICAvLyBCdWlsZCB2YXJpYW50LWNvbmRpdGlvbmFsIGR5bmFtaWMgcmVzb2x1dGlvbiArIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgdmFyaWFudER5bmFtaWNCbG9ja3MgPSB2YXJpYW50cy5tYXAoKHYpID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB2YXJpYW50UmVzdWx0c1t2LmNvbXBvbmVudC5pZF07XG4gICAgY29uc3QgY29kZSA9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbiArIHJlc3VsdC5hcnJheUhlbHBlcnM7XG4gICAgaWYgKCFjb2RlLnRyaW0oKSkgcmV0dXJuICcnO1xuICAgIHJldHVybiBgICAgIGlmIChoYW5kb2ZmVmFyaWFudCA9PT0gJyR7di5jb21wb25lbnQuaWR9Jykge1xuJHtjb2RlfVxuICAgIH1gO1xuICB9KS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgLy8gRm9yIGR5bmFtaWMgcmVzb2x1dGlvbiwgd2UgbmVlZCB0aGUgdmFyaWFibGVzIHRvIGJlIGRlY2xhcmVkIGluIGEgc2NvcGUgdmlzaWJsZSB0byB0aGUgcHJldmlld1xuICAvLyBXZSdsbCB1c2UgYSBkaWZmZXJlbnQgYXBwcm9hY2g6IGRlY2xhcmUgYWxsIGF0IHRvcCwgY29uZGl0aW9uYWxseSBwb3B1bGF0ZVxuICBjb25zdCBhbGxSZXNvbHZpbmdGbGFncyA9IHZhcmlhbnRzLmZsYXRNYXAoKHYpID0+IHZhcmlhbnRSZXN1bHRzW3YuY29tcG9uZW50LmlkXS5yZXNvbHZpbmdGbGFncyk7XG4gIGNvbnN0IGhhc0FueVJlc29sdmluZyA9IGFsbFJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDA7XG5cbiAgLy8gR2VuZXJhdGUgZHluYW1pYyByZXNvbHV0aW9uIHBlciB2YXJpYW50OyBhcnJheSBoZWxwZXJzIGFyZSBlbWl0dGVkIG9uY2UgYWJvdmUgKHNoYXJlZEFycmF5SGVscGVycylcbiAgbGV0IGNvbWJpbmVkRHluYW1pY0NvZGUgPSBzaGFyZWRBcnJheUhlbHBlcnMudHJpbSgpID8gYFxcbiR7c2hhcmVkQXJyYXlIZWxwZXJzfWAgOiAnJztcbiAgZm9yIChjb25zdCB2IG9mIHZhcmlhbnRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFyaWFudFJlc3VsdHNbdi5jb21wb25lbnQuaWRdO1xuICAgIGlmIChyZXN1bHQuZHluYW1pY1Jlc29sdXRpb24udHJpbSgpKSB7XG4gICAgICBjb21iaW5lZER5bmFtaWNDb2RlICs9IHJlc3VsdC5keW5hbWljUmVzb2x1dGlvbjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBhdHRyTmFtZXNMaXN0ID0gQXJyYXkuZnJvbShhbGxBdHRyTmFtZXMpO1xuXG4gIC8vIEdlbmVyYXRlIHZhcmlhbnQtY29uZGl0aW9uYWwgTWVkaWFSZXBsYWNlRmxvdyB0b29sYmFyIGVudHJpZXMgZm9yIGltYWdlIGZpZWxkc1xuICBjb25zdCB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICBjb25zdCBjb21wID0gdi5jb21wb25lbnQ7XG4gICAgY29uc3QgZmllbGRNYXAgPSBmaWVsZE1hcHNbY29tcC5pZF07XG4gICAgY29uc3QgaW1hZ2VFbnRyaWVzOiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IG1lcmdlZEF0dHJOYW1lOiBzdHJpbmcgfT4gPSBbXTtcblxuICAgIGNvbnN0IGNvbGxlY3RJbWFnZXMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgICBjb25zdCBtZXJnZWROYW1lID0gcGFyZW50UGF0aFxuICAgICAgICAgID8gYCR7ZmllbGRNYXBbcGFyZW50UGF0aF0gfHwgdG9DYW1lbENhc2UocGFyZW50UGF0aCl9YFxuICAgICAgICAgIDogKGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KSk7XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgICBpbWFnZUVudHJpZXMucHVzaCh7XG4gICAgICAgICAgICBsYWJlbDogcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSksXG4gICAgICAgICAgICBtZXJnZWRBdHRyTmFtZTogcGFyZW50UGF0aCA/IG1lcmdlZE5hbWUgOiBtZXJnZWROYW1lLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICAgIGNvbGxlY3RJbWFnZXMocHJvcC5wcm9wZXJ0aWVzLCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgICBjb2xsZWN0SW1hZ2VzKGNvbXAucHJvcGVydGllcyk7XG5cbiAgICBpZiAoaW1hZ2VFbnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IG1lZGlhRmxvd3MgPSBpbWFnZUVudHJpZXMubWFwKChpbWcpID0+XG4gICAgICAgIGAgICAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgICBtZWRpYUlkPXske2ltZy5tZXJnZWRBdHRyTmFtZX0/LmlkfVxuICAgICAgICAgICAgICBtZWRpYVVybD17JHtpbWcubWVyZ2VkQXR0ck5hbWV9Py5zcmN9XG4gICAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7aW1nLm1lcmdlZEF0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0pfVxuICAgICAgICAgICAgICBuYW1lPXtfXygnJHtpbWcubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIC8+YFxuICAgICAgKS5qb2luKCdcXG4nKTtcbiAgICAgIHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MucHVzaChcbiAgICAgICAgYCAgICAgICAge2hhbmRvZmZWYXJpYW50ID09PSAnJHtjb21wLmlkfScgJiYgKFxcbiAgICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XFxuJHttZWRpYUZsb3dzfVxcbiAgICAgICAgICA8L0Jsb2NrQ29udHJvbHM+XFxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1lZGlhUmVwbGFjZUpzeCA9IHZhcmlhbnRNZWRpYVJlcGxhY2VCbG9ja3MubGVuZ3RoID4gMFxuICAgID8gJ1xcbicgKyB2YXJpYW50TWVkaWFSZXBsYWNlQmxvY2tzLmpvaW4oJ1xcbicpXG4gICAgOiAnJztcblxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVHcm91cFN2Z0ljb25Db2RlKGdyb3VwVGl0bGUsIGdyb3VwU2x1Zyk7XG5cbiAgLy8gQnVpbGQgc2NyZWVuc2hvdCBpbXBvcnRzIGFuZCBsb29rdXAgbWFwIGZvciB2YXJpYW50IHByZXZpZXdzXG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnRMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3Qgc2NyZWVuc2hvdE1hcEVudHJpZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGFueVZhcmlhbnRIYXNTY3JlZW5zaG90ID0gdmFyaWFudFNjcmVlbnNob3RzICYmIE9iamVjdC52YWx1ZXModmFyaWFudFNjcmVlbnNob3RzKS5zb21lKEJvb2xlYW4pO1xuXG4gIGlmIChhbnlWYXJpYW50SGFzU2NyZWVuc2hvdCAmJiB2YXJpYW50U2NyZWVuc2hvdHMpIHtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdmFyaWFudHMpIHtcbiAgICAgIGlmICh2YXJpYW50U2NyZWVuc2hvdHNbdi5jb21wb25lbnQuaWRdKSB7XG4gICAgICAgIGNvbnN0IHNhZmVWYXIgPSAnc2NyZWVuc2hvdF8nICsgdmFyaWFudElkVG9DYW1lbCh2LmNvbXBvbmVudC5pZCk7XG4gICAgICAgIHNjcmVlbnNob3RJbXBvcnRMaW5lcy5wdXNoKGBpbXBvcnQgJHtzYWZlVmFyfSBmcm9tICcuL3NjcmVlbnNob3QtJHt2LmNvbXBvbmVudC5pZH0ucG5nJztgKTtcbiAgICAgICAgc2NyZWVuc2hvdE1hcEVudHJpZXMucHVzaChgICAnJHt2LmNvbXBvbmVudC5pZH0nOiAke3NhZmVWYXJ9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnRzID0gc2NyZWVuc2hvdEltcG9ydExpbmVzLmxlbmd0aCA+IDBcbiAgICA/IHNjcmVlbnNob3RJbXBvcnRMaW5lcy5qb2luKCdcXG4nKSArICdcXG4nXG4gICAgOiAnJztcbiAgY29uc3Qgc2NyZWVuc2hvdE1hcENvZGUgPSBzY3JlZW5zaG90TWFwRW50cmllcy5sZW5ndGggPiAwXG4gICAgPyBgY29uc3QgdmFyaWFudFNjcmVlbnNob3RzID0ge1xcbiR7c2NyZWVuc2hvdE1hcEVudHJpZXMuam9pbignLFxcbicpfVxcbn07XFxuYFxuICAgIDogJyc7XG4gIGNvbnN0IHByZXZpZXdHdWFyZCA9IGFueVZhcmlhbnRIYXNTY3JlZW5zaG90XG4gICAgPyBgICAgIGlmIChhdHRyaWJ1dGVzLl9fcHJldmlldykge1xuICAgICAgY29uc3Qgc2NyZWVuc2hvdFNyYyA9IHZhcmlhbnRTY3JlZW5zaG90c1toYW5kb2ZmVmFyaWFudF07XG4gICAgICBpZiAoc2NyZWVuc2hvdFNyYykge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgICAgPGltZyBzcmM9e3NjcmVlbnNob3RTcmN9IGFsdD17bWV0YWRhdGEudGl0bGV9IHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19IC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgY29uc3QgaW5kZXhKc1RlbXBsYXRlID0gYGltcG9ydCB7IHJlZ2lzdGVyQmxvY2tUeXBlIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9ja3MnO1xuaW1wb3J0IHsgXG4gICR7YmxvY2tFZGl0b3JJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgXG4gICR7Y29tcG9uZW50SW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbiR7dGVuVXBJbXBvcnR9JHtzaGFyZWRDb21wb25lbnRJbXBvcnR9aW1wb3J0IG1ldGFkYXRhIGZyb20gJy4vYmxvY2suanNvbic7XG5pbXBvcnQgJy4vZWRpdG9yLnNjc3MnO1xuJHthbnlIYXNEeW5hbWljQXJyYXlzID8gXCJpbXBvcnQgJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0R5bmFtaWNQb3N0U2VsZWN0b3IuZWRpdG9yLnNjc3MnO1xcblwiIDogJyd9aW1wb3J0ICcuL3N0eWxlLnNjc3MnO1xuJHtzY3JlZW5zaG90SW1wb3J0c30ke3ZhcmlhbnRJbXBvcnRMaW5lcy5qb2luKCdcXG4nKX1cbiR7c2NyZWVuc2hvdE1hcENvZGV9Y29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO1xuXG5yZWdpc3RlckJsb2NrVHlwZShtZXRhZGF0YS5uYW1lLCB7XG4gIC4uLm1ldGFkYXRhLFxuICBpY29uOiBibG9ja0ljb24sXG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXNMaXN0LmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtwcmV2aWV3R3VhcmR9XG4ke2NvbWJpbmVkRHluYW1pY0NvZGV9XG4ke2hlbHBlcnNPYmplY3RMaW5lfVxuICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxCbG9ja0NvbnRyb2xzIGdyb3VwPVwiYmxvY2tcIj5cbiAgICAgICAgICA8RHJvcGRvd25NZW51XG4gICAgICAgICAgICBpY29uPVwibGF5b3V0XCJcbiAgICAgICAgICAgIGxhYmVsPXtfXygnVmFyaWF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgIGNvbnRyb2xzPXtbXG4ke3Rvb2xiYXJWYXJpYW50Q29udHJvbHN9XG4gICAgICAgICAgICBdfVxuICAgICAgICAgIC8+XG4gICAgICAgIDwvQmxvY2tDb250cm9scz4ke21lZGlhUmVwbGFjZUpzeH1cbiAgICAgICAgPEluc3BlY3RvckNvbnRyb2xzPlxuJHt2YXJpYW50UGFuZWxCbG9ja3N9XG4gICAgICAgIDwvSW5zcGVjdG9yQ29udHJvbHM+XG5cbiAgICAgICAgey8qIEVkaXRvciBQcmV2aWV3ICovfVxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiR7dmFyaWFudFByZXZpZXdCbG9ja3N9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9GcmFnbWVudD5cbiAgICApO1xuICB9LFxuICBzYXZlOiAoKSA9PiB7XG4ke2FueVVzZXNJbm5lckJsb2NrcyB8fCBhbnlQcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgcmV0dXJuIG51bGw7J31cbiAgfSxcbn0pO1xuYDtcbiAgcmV0dXJuIHsgaW5kZXhKczogaW5kZXhKc1RlbXBsYXRlLCB2YXJpYXRpb25KcyB9O1xufTtcblxuLy8g4pSA4pSA4pSAIEhlbHBlciBnZW5lcmF0b3JzIGZvciBtZXJnZWQgY29udGV4dCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnNNZXJnZWQgPSAoXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIGZpZWxkTWFwOiBGaWVsZE1hcCxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhlbHBlcnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBpZiAocHJvcC50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IGZpZWxkTWFwW2tleV0gfHwgdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBoZWxwZXJzLnB1c2goYFxuICAgIGNvbnN0IHVwZGF0ZSR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1JdGVtID0gKGluZGV4LCBmaWVsZCwgdmFsdWUpID0+IHtcbiAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLigke2F0dHJOYW1lfSB8fCBbXSldO1xuICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sIFtmaWVsZF06IHZhbHVlIH07XG4gICAgICBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgIH07YCk7XG4gIH1cbiAgcmV0dXJuIGhlbHBlcnMuam9pbignXFxuJyk7XG59O1xuXG4vKiogR2VuZXJhdGUgYXJyYXkgdXBkYXRlIGhlbHBlcnMgb25jZSBwZXIgbWVyZ2VkIGF0dHJpYnV0ZSBuYW1lIChhdm9pZHMgZHVwbGljYXRlIGRlY2xhcmF0aW9ucyBhY3Jvc3MgdmFyaWFudHMpLiAqL1xuY29uc3QgZ2VuZXJhdGVTaGFyZWRBcnJheUhlbHBlcnMgPSAobWVyZ2VkQXJyYXlBdHRyTmFtZXM6IFNldDxzdHJpbmc+KTogc3RyaW5nID0+IHtcbiAgY29uc3QgaGVscGVyczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBhdHRyTmFtZSBvZiBtZXJnZWRBcnJheUF0dHJOYW1lcykge1xuICAgIGNvbnN0IGhlbHBlck5hbWUgPSBgdXBkYXRlJHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfUl0ZW1gO1xuICAgIGhlbHBlcnMucHVzaChgXG4gICAgY29uc3QgJHtoZWxwZXJOYW1lfSA9IChpbmRleCwgZmllbGQsIHZhbHVlKSA9PiB7XG4gICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4oJHthdHRyTmFtZX0gfHwgW10pXTtcbiAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCBbZmllbGRdOiB2YWx1ZSB9O1xuICAgICAgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICB9O2ApO1xuICB9XG4gIHJldHVybiBoZWxwZXJzLmpvaW4oJ1xcbicpO1xufTtcblxuLyoqIENvbGxlY3QgYXR0cmlidXRlIG5hbWVzIHJlZmVyZW5jZWQgaW4gSlNYIChzZXRBdHRyaWJ1dGVzKHsgeDogb3IgdmFsdWU9e3h9KSBzbyB3ZSBkZXN0cnVjdHVyZSB0aGVtIGV2ZW4gaWYgbm90IGluIGZpZWxkTWFwLiAqL1xuY29uc3QgY29sbGVjdEF0dHJOYW1lc0Zyb21Kc3ggPSAoanN4OiBzdHJpbmcpOiBTZXQ8c3RyaW5nPiA9PiB7XG4gIGNvbnN0IG5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHNldEF0dHJSZWdleCA9IC9zZXRBdHRyaWJ1dGVzXFxzKlxcKFxccypcXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKilcXHMqOi9nO1xuICBsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcbiAgd2hpbGUgKChtID0gc2V0QXR0clJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgY29uc3QgdmFsdWVSZWdleCA9IC92YWx1ZT1cXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKikoPzpcXHMqW1xcfFxcP1xcJlxcfFxcIV18W1xcc1xcblxccl0qXFw/XFw/fFtcXHNcXG5cXHJdKlxcfFxcfCkvZztcbiAgd2hpbGUgKChtID0gdmFsdWVSZWdleC5leGVjKGpzeCkpICE9PSBudWxsKSBuYW1lcy5hZGQobVsxXSk7XG4gIGNvbnN0IGNvbmRSZWdleCA9IC9cXHtcXHMqKFthLXpBLVpfJF1bYS16QS1aMC05XyRdKilcXHMqJiYvZztcbiAgd2hpbGUgKChtID0gY29uZFJlZ2V4LmV4ZWMoanN4KSkgIT09IG51bGwpIG5hbWVzLmFkZChtWzFdKTtcbiAgcmV0dXJuIG5hbWVzO1xufTtcblxuLyoqIEdlbmVyYXRlIHRoZSBKUyBjb250ZW50IGZvciBvbmUgdmFyaWF0aW9uIGluY2x1ZGUgZmlsZSAoZXhwb3J0cyBQYW5lbHMgYW5kIFByZXZpZXcpLiAqL1xuY29uc3QgZ2VuZXJhdGVWYXJpYW50SnNGaWxlQ29udGVudCA9IChcbiAgdmFyaWFudDogVmFyaWFudEluZm8sXG4gIHJlc3VsdDogeyBwYW5lbHM6IHN0cmluZzsgcHJldmlld0pzeDogc3RyaW5nOyBzcGVjaWFsaXplZFJlc29sdXRpb24/OiBzdHJpbmc7IGhhc0JyZWFkY3J1bWJzRmV0Y2g/OiBib29sZWFuOyBoYXNUYXhvbm9teUZldGNoPzogYm9vbGVhbiB9LFxuICBmaWVsZE1hcDogRmllbGRNYXAsXG4gIGhlbHBlck5hbWVzOiBzdHJpbmdbXSxcbiAgYW55UHJldmlld1VzZXNMaW5rRmllbGQ6IGJvb2xlYW4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjb21wID0gdmFyaWFudC5jb21wb25lbnQ7XG4gIGNvbnN0IHZhcmlhbnREeW5Db25maWdzID0gdmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzO1xuICBjb25zdCBmcm9tRmllbGRNYXAgPSBuZXcgU2V0KE9iamVjdC52YWx1ZXMoZmllbGRNYXApKTtcbiAgLy8gU2NhbiBwcmV2aWV3IEpTWCBhbmQgcGFuZWwgSlNYIGZvciBhdHRyaWJ1dGUgbmFtZXMgdG8gZGVzdHJ1Y3R1cmUuXG4gIGNvbnN0IGZyb21QcmV2aWV3ID0gY29sbGVjdEF0dHJOYW1lc0Zyb21Kc3gocmVzdWx0LnByZXZpZXdKc3ggKyAnXFxuJyArIHJlc3VsdC5wYW5lbHMpO1xuICAvLyBDb2xsZWN0IHZhcmlhYmxlIG5hbWVzIGRlY2xhcmVkIGxvY2FsbHkgYnkgdGhlIHNwZWNpYWxpemVkIHJlc29sdXRpb24gY29kZVxuICAvLyAoZS5nLiBwcmV2aWV3QnJlYWRjcnVtYiBmcm9tIHVzZVN0YXRlLCBwcmV2aWV3VGFncyBmcm9tIHVzZVNlbGVjdCkuXG4gIC8vIFRoZXNlIG11c3QgTk9UIGJlIGRlc3RydWN0dXJlZCBmcm9tIGF0dHJpYnV0ZXMgb3IgdGhleSdsbCBjb25mbGljdC5cbiAgY29uc3QgbG9jYWxseURlY2xhcmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGlmIChyZXN1bHQuc3BlY2lhbGl6ZWRSZXNvbHV0aW9uKSB7XG4gICAgY29uc3Qgc3RhdGVNYXRjaCA9IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24ubWF0Y2hBbGwoL2NvbnN0XFxzK1xcWyhcXHcrKSxcXHMqKFxcdyspXFxdXFxzKj1cXHMqdXNlU3RhdGUvZyk7XG4gICAgZm9yIChjb25zdCBtIG9mIHN0YXRlTWF0Y2gpIHsgbG9jYWxseURlY2xhcmVkLmFkZChtWzFdKTsgbG9jYWxseURlY2xhcmVkLmFkZChtWzJdKTsgfVxuICAgIGNvbnN0IHNlbGVjdE1hdGNoID0gcmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbi5tYXRjaEFsbCgvY29uc3RcXHMrKFxcdyspXFxzKj1cXHMqdXNlU2VsZWN0L2cpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzZWxlY3RNYXRjaCkgeyBsb2NhbGx5RGVjbGFyZWQuYWRkKG1bMV0pOyB9XG4gIH1cbiAgY29uc3QgcmVzZXJ2ZWQgPSBuZXcgU2V0KFsnaW5kZXgnLCAndmFsdWUnLCAnaXRlbScsICdlJywgJ2tleScsICdvcGVuJ10pO1xuICBmcm9tUHJldmlldy5mb3JFYWNoKChuYW1lKSA9PiB7XG4gICAgaWYgKCFyZXNlcnZlZC5oYXMobmFtZSkgJiYgIWxvY2FsbHlEZWNsYXJlZC5oYXMobmFtZSkpIGZyb21GaWVsZE1hcC5hZGQobmFtZSk7XG4gIH0pO1xuICAvLyBFbnN1cmUgc3BlY2lhbGl6ZWQgYXJyYXkgc3ludGhldGljIGF0dHJpYnV0ZXMgYXJlIGRlc3RydWN0dXJlZFxuICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyh2YXJpYW50RHluQ29uZmlncykpIHtcbiAgICBjb25zdCBtZXJnZWRBdHRyTmFtZSA9IGZpZWxkTWFwW2ZpZWxkS2V5XSB8fCB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgfVxuICAgIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgIGZyb21GaWVsZE1hcC5hZGQoYCR7bWVyZ2VkQXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgZnJvbUZpZWxkTWFwLmFkZChgJHttZXJnZWRBdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgYXR0ck5hbWVzID0gWy4uLmZyb21GaWVsZE1hcF07XG4gIGNvbnN0IGhlbHBlcnNEZXN0cnVjdCA9IFsuLi5oZWxwZXJOYW1lc107XG4gIGlmIChhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCkgaGVscGVyc0Rlc3RydWN0LnB1c2goJ0hhbmRvZmZMaW5rRmllbGQnKTtcbiAgaWYgKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkgaGVscGVyc0Rlc3RydWN0LnB1c2goJ0NPTlRFTlRfQkxPQ0tTJyk7XG5cbiAgY29uc3QgYXR0ckRlc3RydWN0ID0gYXR0ck5hbWVzLmxlbmd0aCA/IGAgIGNvbnN0IHsgJHthdHRyTmFtZXMuam9pbignLCAnKX0gfSA9IGF0dHJpYnV0ZXM7XFxuICBgIDogJyc7XG4gIGNvbnN0IGhlbHBlcnNEZXN0cnVjdExpbmUgPVxuICAgIGhlbHBlcnNEZXN0cnVjdC5sZW5ndGggPiAwID8gYCAgY29uc3QgeyAke2hlbHBlcnNEZXN0cnVjdC5qb2luKCcsICcpfSB9ID0gaGVscGVycztcXG4gIGAgOiAnJztcblxuICBjb25zdCBwcm9wc0xpc3QgPSBhbnlQcmV2aWV3VXNlc0xpbmtGaWVsZCA/ICd7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGhlbHBlcnMsIGlzU2VsZWN0ZWQgfScgOiAneyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBoZWxwZXJzIH0nO1xuICBjb25zdCBwYW5lbHNFeHBvcnQgPVxuICAgIHJlc3VsdC5wYW5lbHMudHJpbSgpID09PSAnJ1xuICAgICAgPyBgZXhwb3J0IGZ1bmN0aW9uIFBhbmVscygpIHsgcmV0dXJuIG51bGw7IH1gXG4gICAgICA6IGBleHBvcnQgZnVuY3Rpb24gUGFuZWxzKCR7cHJvcHNMaXN0fSkge1xuJHthdHRyRGVzdHJ1Y3R9JHtoZWxwZXJzRGVzdHJ1Y3RMaW5lfSAgcmV0dXJuIChcbiAgICA8PlxuJHtyZXN1bHQucGFuZWxzfVxuICAgIDwvPlxuICApO1xufWA7XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIHNoYXJlZCBzZWxlY3RvciBjb21wb25lbnRzIHRoaXMgdmFyaWFudCdzIHBhbmVscyB1c2VcbiAgY29uc3QgdmFyaWFudEhhc0JyZWFkY3J1bWJzID0gT2JqZWN0LnZhbHVlcyh2YXJpYW50RHluQ29uZmlncykuc29tZSgoYykgPT4gaXNCcmVhZGNydW1ic0NvbmZpZyhjKSk7XG4gIGNvbnN0IHZhcmlhbnRIYXNUYXhvbm9teSA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpO1xuICBjb25zdCB2YXJpYW50SGFzUGFnaW5hdGlvbiA9IE9iamVjdC52YWx1ZXModmFyaWFudER5bkNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSk7XG4gIGNvbnN0IHZhcmlhbnRTaGFyZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAodmFyaWFudEhhc0JyZWFkY3J1bWJzKSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmICh2YXJpYW50SGFzVGF4b25vbXkpIHZhcmlhbnRTaGFyZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKHZhcmlhbnRIYXNQYWdpbmF0aW9uKSB2YXJpYW50U2hhcmVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcbiAgY29uc3Qgc2hhcmVkU2VsZWN0b3JJbXBvcnQgPSB2YXJpYW50U2hhcmVkSW1wb3J0cy5sZW5ndGhcbiAgICA/IGBpbXBvcnQgeyAke3ZhcmlhbnRTaGFyZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcblxuICAvLyBPbmx5IGltcG9ydCBSZXBlYXRlciB3aGVuIHRoZSB2YXJpYW50IGhhcyBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IGZpZWxkc1xuICAvLyAodGF4b25vbXkvYnJlYWRjcnVtYnMvcGFnaW5hdGlvbiBhcmUgc2VydmVyLXJlbmRlcmVkOyBzaGFyZWQgY29tcG9uZW50cyBpbXBvcnQgUmVwZWF0ZXIgdGhlbXNlbHZlcylcbiAgY29uc3QgdmFyaWFudEhhc05vblNwZWNpYWxBcnJheXMgPSBPYmplY3QuZW50cmllcyhjb21wLnByb3BlcnRpZXMpLnNvbWUoXG4gICAgKFtrLCBwXSkgPT4gcC50eXBlID09PSAnYXJyYXknICYmICghdmFyaWFudER5bkNvbmZpZ3Nba10gfHwgISgnYXJyYXlUeXBlJyBpbiB2YXJpYW50RHluQ29uZmlnc1trXSkpXG4gICk7XG4gIGNvbnN0IHRlblVwQmxvY2tDb21wb25lbnRzSW1wb3J0ID0gKHZhcmlhbnRIYXNOb25TcGVjaWFsQXJyYXlzIHx8IHJlc3VsdC5wcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKSlcbiAgICA/IGBpbXBvcnQgeyAke1t2YXJpYW50SGFzTm9uU3BlY2lhbEFycmF5cyA/ICdSZXBlYXRlcicgOiAnJywgcmVzdWx0LnByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpID8gJ0ltYWdlJyA6ICcnXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gXG4gICAgOiAnJztcblxuICAvLyBTcGVjaWFsaXplZCBhcnJheSByZXNvbHV0aW9uIGltcG9ydHMgKGJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24gaG9va3MgcnVuIGluIHRoZSB2YXJpYXRpb24gZmlsZSlcbiAgY29uc3QgaGFzU3BlY2lhbGl6ZWRSZXNvbHV0aW9uID0gISEocmVzdWx0LnNwZWNpYWxpemVkUmVzb2x1dGlvbj8udHJpbSgpKTtcbiAgY29uc3QgdmFySGFzQnJlYWRjcnVtYnNGZXRjaCA9IHJlc3VsdC5oYXNCcmVhZGNydW1ic0ZldGNoID8/IGZhbHNlO1xuICBjb25zdCB2YXJIYXNUYXhvbm9teUZldGNoID0gcmVzdWx0Lmhhc1RheG9ub215RmV0Y2ggPz8gZmFsc2U7XG5cbiAgY29uc3QgZWxlbWVudEltcG9ydE5hbWVzID0gWydGcmFnbWVudCddO1xuICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkgZWxlbWVudEltcG9ydE5hbWVzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuXG4gIGxldCBkYXRhSW1wb3J0ID0gJyc7XG4gIGlmICh2YXJIYXNUYXhvbm9teUZldGNoIHx8IHZhckhhc0JyZWFkY3J1bWJzRmV0Y2gpIHtcbiAgICBjb25zdCBkYXRhTmFtZXMgPSBbJ3VzZVNlbGVjdCddO1xuICAgIGlmICh2YXJIYXNCcmVhZGNydW1ic0ZldGNoKSBkYXRhTmFtZXMucHVzaCgnc2VsZWN0Jyk7XG4gICAgZGF0YUltcG9ydCArPSBgaW1wb3J0IHsgJHtkYXRhTmFtZXMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2RhdGEnO1xcbmltcG9ydCB7IHN0b3JlIGFzIGNvcmVEYXRhU3RvcmUgfSBmcm9tICdAd29yZHByZXNzL2NvcmUtZGF0YSc7XFxuYDtcbiAgfVxuICBpZiAodmFySGFzQnJlYWRjcnVtYnNGZXRjaCkge1xuICAgIGRhdGFJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuXG4gIGNvbnN0IHNwZWNpYWxpemVkQ29kZSA9IGhhc1NwZWNpYWxpemVkUmVzb2x1dGlvbiA/IHJlc3VsdC5zcGVjaWFsaXplZFJlc29sdXRpb24hIDogJyc7XG5cbiAgcmV0dXJuIGAvKipcbiAqIFZhcmlhdGlvbjogJHtjb21wLnRpdGxlfSAoJHtjb21wLmlkfSlcbiAqIEdlbmVyYXRlZCDigJMgZG8gbm90IGVkaXQgYnkgaGFuZC5cbiAqL1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0TmFtZXMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2VsZW1lbnQnO1xuaW1wb3J0IHtcbiAgUGFuZWxCb2R5LFxuICBUZXh0Q29udHJvbCxcbiAgVGV4dGFyZWFDb250cm9sLFxuICBCdXR0b24sXG4gIFNlbGVjdENvbnRyb2wsXG4gIFJhbmdlQ29udHJvbCxcbiAgVG9nZ2xlQ29udHJvbCxcbiAgRmxleCxcbiAgUG9wb3Zlcixcbn0gZnJvbSAnQHdvcmRwcmVzcy9jb21wb25lbnRzJztcbmltcG9ydCB7IE1lZGlhVXBsb2FkLCBNZWRpYVVwbG9hZENoZWNrLCBNZWRpYVJlcGxhY2VGbG93LCBMaW5rQ29udHJvbCwgUmljaFRleHQsIElubmVyQmxvY2tzIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuJHtkYXRhSW1wb3J0fSR7dGVuVXBCbG9ja0NvbXBvbmVudHNJbXBvcnR9JHtzaGFyZWRTZWxlY3RvckltcG9ydH1cbiR7cGFuZWxzRXhwb3J0fVxuXG5leHBvcnQgZnVuY3Rpb24gUHJldmlldygke3Byb3BzTGlzdH0pIHtcbiR7YXR0ckRlc3RydWN0fSR7aGVscGVyc0Rlc3RydWN0TGluZX0ke3NwZWNpYWxpemVkQ29kZX1cbiAgcmV0dXJuIChcbiR7cmVzdWx0LnByZXZpZXdKc3h9XG4gICk7XG59XG5gO1xufTtcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCByZW5kZXIucGhwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKiogR2VuZXJhdGUgdGhlIFBIUCBmcmFnbWVudCBmb3Igb25lIHZhcmlhbnQgKGV4dHJhY3Rpb25zICsgdGVtcGxhdGUpLiBVc2VkIGluIHZhcmlhdGlvbiBpbmNsdWRlIGZpbGUuICovXG5jb25zdCBnZW5lcmF0ZVZhcmlhbnRQaHBGcmFnbWVudCA9IChcbiAgdmFyaWFudDogVmFyaWFudEluZm8sXG4gIGZpZWxkTWFwczogUmVjb3JkPHN0cmluZywgRmllbGRNYXA+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY29tcCA9IHZhcmlhbnQuY29tcG9uZW50O1xuICBjb25zdCBmaWVsZE1hcCA9IGZpZWxkTWFwc1tjb21wLmlkXTtcblxuICBjb25zdCByaWNodGV4dFByb3BzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGlmICh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpIHtcbiAgICByaWNodGV4dFByb3BzLmFkZCh2YXJpYW50LmlubmVyQmxvY2tzRmllbGQpO1xuICAgIHJpY2h0ZXh0UHJvcHMuYWRkKHRvQ2FtZWxDYXNlKHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkpO1xuICB9XG5cbiAgY29uc3QgZXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXAucHJvcGVydGllcykpIHtcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyAmJiBrZXkgPT09IHZhcmlhbnQuaW5uZXJCbG9ja3NGaWVsZCkgY29udGludWU7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtrZXldIHx8IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3Qgb3JpZ0NhbWVsID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBkZWZhdWx0VmFsdWUgPSBnZXRQaHBEZWZhdWx0VmFsdWUocHJvcGVydHkpO1xuICAgIGV4dHJhY3Rpb25zLnB1c2goYCQke29yaWdDYW1lbH0gPSBpc3NldCgkYXR0cmlidXRlc1snJHttZXJnZWRBdHRyTmFtZX0nXSkgPyAkYXR0cmlidXRlc1snJHttZXJnZWRBdHRyTmFtZX0nXSA6ICR7ZGVmYXVsdFZhbHVlfTtgKTtcbiAgfVxuICAvLyBEeW5hbWljIGFycmF5IGV4dHJhY3Rpb24gZm9yIHNwZWNpYWxpemVkIGFycmF5IHR5cGVzIChicmVhZGNydW1icywgdGF4b25vbXksIHBhZ2luYXRpb24pXG4gIGNvbnN0IGR5bkFycmF5RXh0cmFjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmICh2YXJpYW50LmR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXModmFyaWFudC5keW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgbWVyZ2VkQXR0ck5hbWUgPSBmaWVsZE1hcFtmaWVsZE5hbWVdIHx8IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBjb21wLnByb3BlcnRpZXNbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgZHluQXJyYXlFeHRyYWN0aW9ucy5wdXNoKGdlbmVyYXRlQnJlYWRjcnVtYnNBcnJheUV4dHJhY3Rpb24oZmllbGROYW1lLCBtZXJnZWRBdHRyTmFtZSwgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVUYXhvbm9teUFycmF5RXh0cmFjdGlvbihmaWVsZE5hbWUsIG1lcmdlZEF0dHJOYW1lLCBkeW5Db25maWcsIGl0ZW1Qcm9wcykpO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVQYWdpbmF0aW9uQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGR5bkNvbmZpZywgaXRlbVByb3BzKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkeW5BcnJheUV4dHJhY3Rpb25zLnB1c2goZ2VuZXJhdGVEeW5hbWljQXJyYXlFeHRyYWN0aW9uKGZpZWxkTmFtZSwgbWVyZ2VkQXR0ck5hbWUsIGR5bkNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkeW5BcnJheUNvZGUgPSBkeW5BcnJheUV4dHJhY3Rpb25zLmxlbmd0aCA/ICdcXG4nICsgZHluQXJyYXlFeHRyYWN0aW9ucy5qb2luKCdcXG4nKSA6ICcnO1xuXG4gIGNvbnN0IHRlbXBsYXRlUGhwID0gaGFuZGxlYmFyc1RvUGhwKGNvbXAuY29kZSA/PyAnJywgY29tcC5wcm9wZXJ0aWVzLCByaWNodGV4dFByb3BzKTtcbiAgY29uc3QgY2xhc3NOYW1lID0gKGNvbXAuaWQgPz8gJycpLnJlcGxhY2UoL18vZywgJy0nKTtcblxuICByZXR1cm4gYDw/cGhwXG4vLyBBdHRyaWJ1dGUgZXh0cmFjdGlvbiBmb3IgdmFyaWFudDogJHtjb21wLmlkfVxuJHtleHRyYWN0aW9ucy5qb2luKCdcXG4nKX0ke2R5bkFycmF5Q29kZX1cbj8+XG48ZGl2IGNsYXNzPVwiJHtjbGFzc05hbWV9XCI+XG4ke3RlbXBsYXRlUGhwfVxuPC9kaXY+XG5gO1xufTtcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRSZW5kZXJQaHAgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICB2YXJpYW50czogVmFyaWFudEluZm9bXSxcbiAgZmllbGRNYXBzOiBSZWNvcmQ8c3RyaW5nLCBGaWVsZE1hcD4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBncm91cFNsdWcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV0rL2csICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJyk7XG4gIGNvbnN0IGRlZmF1bHRWYXJpYW50ID0gdmFyaWFudHNbMF0uY29tcG9uZW50LmlkO1xuXG4gIGNvbnN0IGNhc2VzOiBzdHJpbmdbXSA9IHZhcmlhbnRzLm1hcChcbiAgICAodikgPT4gYCAgY2FzZSAnJHt2LmNvbXBvbmVudC5pZH0nOlxuICAgIGluY2x1ZGUgX19ESVJfXyAuICcvdmFyaWF0aW9ucy8ke3YuY29tcG9uZW50LmlkfS5waHAnO1xuICAgIGJyZWFrO2AsXG4gICk7XG5cbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgZm9yICR7dG9UaXRsZUNhc2UoZ3JvdXBTbHVnKX0gKG1lcmdlZCBncm91cCBibG9jaylcbiAqXG4gKiBAcGFyYW0gYXJyYXkgICAgJGF0dHJpYnV0ZXMgQmxvY2sgYXR0cmlidXRlcy5cbiAqIEBwYXJhbSBzdHJpbmcgICAkY29udGVudCAgICBCbG9jayBkZWZhdWx0IGNvbnRlbnQuXG4gKiBAcGFyYW0gV1BfQmxvY2sgJGJsb2NrICAgICAgQmxvY2sgaW5zdGFuY2UuXG4gKiBAcmV0dXJuIHN0cmluZyBSZXR1cm5zIHRoZSBibG9jayBtYXJrdXAuXG4gKi9cblxuaWYgKCFkZWZpbmVkKCdBQlNQQVRIJykpIHtcbiAgZXhpdDtcbn1cblxuaWYgKCFpc3NldCgkYXR0cmlidXRlcykpIHtcbiAgJGF0dHJpYnV0ZXMgPSBbXTtcbn1cblxuJHZhcmlhbnQgPSBpc3NldCgkYXR0cmlidXRlc1snaGFuZG9mZlZhcmlhbnQnXSkgPyAkYXR0cmlidXRlc1snaGFuZG9mZlZhcmlhbnQnXSA6ICcke2RlZmF1bHRWYXJpYW50fSc7XG4/PlxuPGRpdiA8P3BocCBlY2hvIGdldF9ibG9ja193cmFwcGVyX2F0dHJpYnV0ZXMoWydjbGFzcycgPT4gJyR7YmxvY2tOYW1lfSddKTsgPz4+XG48P3BocFxuc3dpdGNoICgkdmFyaWFudCkge1xuJHtjYXNlcy5qb2luKCdcXG4nKX1cblxuICBkZWZhdWx0OlxuICAgIGVjaG8gJzwhLS0gVW5rbm93biB2YXJpYW50OiAnIC4gZXNjX2h0bWwoJHZhcmlhbnQpIC4gJyAtLT4nO1xuICAgIGJyZWFrO1xufVxuPz5cbjwvZGl2PlxuYDtcbn07XG5cbi8vIGdldFBocERlZmF1bHRWYWx1ZSBpcyBpbXBvcnRlZCBmcm9tIHJlbmRlci1waHAudHNcblxuLy8g4pSA4pSA4pSAIE1lcmdlZCBTQ1NTIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBnZW5lcmF0ZU1lcmdlZEVkaXRvclNjc3MgPSAodmFyaWFudHM6IFZhcmlhbnRJbmZvW10pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gdmFyaWFudHNcbiAgICAubWFwKCh2KSA9PiBnZW5lcmF0ZUVkaXRvclNjc3Modi5jb21wb25lbnQpKVxuICAgIC5qb2luKCdcXG5cXG4nKTtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTWVyZ2VkU3R5bGVTY3NzID0gKHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHZhcmlhbnRzXG4gICAgLm1hcCgodikgPT4gZ2VuZXJhdGVTdHlsZVNjc3Modi5jb21wb25lbnQpKVxuICAgIC5qb2luKCdcXG5cXG4nKTtcbn07XG5cbi8vIOKUgOKUgOKUgCBNZXJnZWQgTWlncmF0aW9uIFNjaGVtYSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRNaWdyYXRpb25TY2hlbWEgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gZ3JvdXBTbHVnLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpO1xuXG4gIGNvbnN0IHZhcmlhbnRTY2hlbWFzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50cykge1xuICAgIGNvbnN0IGNvbXAgPSB2YXJpYW50LmNvbXBvbmVudDtcbiAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBNaWdyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGNvbXAucHJvcGVydGllcykpIHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG4gICAgICBwcm9wZXJ0aWVzW2tleV0gPSBleHRyYWN0TWlncmF0aW9uUHJvcGVydHkocHJvcCwgdHJ1ZSwga2V5KTtcbiAgICB9XG4gICAgdmFyaWFudFNjaGVtYXNbY29tcC5pZF0gPSB7XG4gICAgICB0aXRsZTogY29tcC50aXRsZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAoY29tcC5kZXNjcmlwdGlvbiB8fCAnJykucmVwbGFjZSgvXFxuXFxzKy9nLCAnICcpLnRyaW0oKSxcbiAgICAgIHByb3BlcnRpZXMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNjaGVtYSA9IHtcbiAgICBibG9ja05hbWU6IGBoYW5kb2ZmLyR7YmxvY2tOYW1lfWAsXG4gICAgdGl0bGU6IGdyb3VwVGl0bGUsXG4gICAgZGVzY3JpcHRpb246IGAke2dyb3VwVGl0bGV9IGJsb2NrIHdpdGggJHt2YXJpYW50cy5sZW5ndGh9IHZhcmlhdGlvbnMuYCxcbiAgICBjYXRlZ29yeTogZ3JvdXBUb0NhdGVnb3J5KGdyb3VwU2x1ZyksXG4gICAgaXNNZXJnZWRHcm91cDogdHJ1ZSxcbiAgICB2YXJpYW50czogdmFyaWFudFNjaGVtYXMsXG4gIH07XG5cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHNjaGVtYSwgbnVsbCwgMik7XG59O1xuXG4vLyDilIDilIDilIAgTWVyZ2VkIFJFQURNRSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuY29uc3QgZ2VuZXJhdGVNZXJnZWRSZWFkbWUgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBncm91cFRpdGxlOiBzdHJpbmcsXG4gIHZhcmlhbnRzOiBWYXJpYW50SW5mb1tdLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgdmFyaWFudExpc3QgPSB2YXJpYW50c1xuICAgIC5tYXAoKHYpID0+IGAtICoqJHt2LmNvbXBvbmVudC50aXRsZX0qKiAoXFxgJHt2LmNvbXBvbmVudC5pZH1cXGApYClcbiAgICAuam9pbignXFxuJyk7XG5cbiAgcmV0dXJuIGAjICR7Z3JvdXBUaXRsZX0gKE1lcmdlZCBHcm91cCBCbG9jaylcblxuVGhpcyBibG9jayBjb21iaW5lcyAke3ZhcmlhbnRzLmxlbmd0aH0gY29tcG9uZW50IHZhcmlhdGlvbnMgaW50byBhIHNpbmdsZSBXb3JkUHJlc3MgYmxvY2suXG5cbiMjIFZhcmlhdGlvbnNcblxuJHt2YXJpYW50TGlzdH1cblxuIyMgVXNhZ2VcblxuU2VsZWN0IHRoZSBkZXNpcmVkIHZhcmlhdGlvbiBmcm9tIHRoZSBibG9jayB0b29sYmFyIChWYXJpYXRpb24gZHJvcGRvd24pLlxuRWFjaCB2YXJpYXRpb24gaGFzIGl0cyBvd24gc2V0IG9mIGNvbnRyb2xzIGFuZCByZW5kZXJzIGl0cyBvd24gdGVtcGxhdGUuXG5gO1xufTtcblxuLy8g4pSA4pSA4pSAIE1haW4gR2VuZXJhdG9yIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4vKipcbiAqIEdlbmVyYXRlIGEgbWVyZ2VkIGJsb2NrIGZvciBhIGdyb3VwIG9mIGNvbXBvbmVudHMuXG4gKiBWYXJpYXRpb24gbWFya3VwIGlzIHNwbGl0IGludG8gaW5jbHVkZSBmaWxlczogdmFyaWF0aW9ucy88dmFyaWFudC1pZD4uanMgYW5kIHZhcmlhdGlvbnMvPHZhcmlhbnQtaWQ+LnBocC5cbiAqL1xuZXhwb3J0IGNvbnN0IGdlbmVyYXRlTWVyZ2VkQmxvY2sgPSAoXG4gIGdyb3VwU2x1Zzogc3RyaW5nLFxuICBjb21wb25lbnRzOiBIYW5kb2ZmQ29tcG9uZW50W10sXG4gIHZhcmlhbnRJbmZvczogVmFyaWFudEluZm9bXSxcbiAgYXBpVXJsPzogc3RyaW5nLFxuICB2YXJpYW50U2NyZWVuc2hvdHM/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPixcbik6IEdlbmVyYXRlZEJsb2NrID0+IHtcbiAgY29uc3QgZ3JvdXBUaXRsZSA9IHRvVGl0bGVDYXNlKGdyb3VwU2x1Zyk7XG4gIGNvbnN0IHNjcmVlbnNob3RzID0gdmFyaWFudFNjcmVlbnNob3RzIHx8IHt9O1xuXG4gIGNvbnN0IHN1cGVyc2V0UmVzdWx0ID0gYnVpbGRTdXBlcnNldEF0dHJpYnV0ZXModmFyaWFudEluZm9zLCBncm91cFNsdWcpO1xuICBjb25zdCB7IGF0dHJpYnV0ZXM6IHN1cGVyc2V0QXR0cnMsIGZpZWxkTWFwcyB9ID0gc3VwZXJzZXRSZXN1bHQ7XG5cbiAgY29uc3QgeyBpbmRleEpzLCB2YXJpYXRpb25KcyB9ID0gZ2VuZXJhdGVNZXJnZWRJbmRleEpzKFxuICAgIGdyb3VwU2x1ZyxcbiAgICBncm91cFRpdGxlLFxuICAgIHZhcmlhbnRJbmZvcyxcbiAgICBzdXBlcnNldEF0dHJzLFxuICAgIGZpZWxkTWFwcyxcbiAgICBhcGlVcmwsXG4gICAgc2NyZWVuc2hvdHMsXG4gICk7XG5cbiAgY29uc3QgdmFyaWF0aW9uUGhwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGZvciAoY29uc3QgdmFyaWFudCBvZiB2YXJpYW50SW5mb3MpIHtcbiAgICB2YXJpYXRpb25QaHBbdmFyaWFudC5jb21wb25lbnQuaWRdID0gZ2VuZXJhdGVWYXJpYW50UGhwRnJhZ21lbnQodmFyaWFudCwgZmllbGRNYXBzKTtcbiAgfVxuXG4gIC8vIEJ1aWxkIHZhcmlhbnQgc2NyZWVuc2hvdCBVUkxzIGZvciB0aGUgY2FsbGVyIHRvIGRvd25sb2FkXG4gIGNvbnN0IHZhcmlhbnRTY3JlZW5zaG90VXJsczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IGNvbXAgb2YgY29tcG9uZW50cykge1xuICAgIGlmICghY29tcC5pbWFnZSkgY29udGludWU7XG4gICAgaWYgKGNvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cDovLycpIHx8IGNvbXAuaW1hZ2Uuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgdmFyaWFudFNjcmVlbnNob3RVcmxzW2NvbXAuaWRdID0gY29tcC5pbWFnZTtcbiAgICB9IGVsc2UgaWYgKGFwaVVybCkge1xuICAgICAgdmFyaWFudFNjcmVlbnNob3RVcmxzW2NvbXAuaWRdID0gYCR7YXBpVXJsfSR7Y29tcC5pbWFnZS5zdGFydHNXaXRoKCcvJykgPyAnJyA6ICcvJ30ke2NvbXAuaW1hZ2V9YDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJsb2NrSnNvbjogZ2VuZXJhdGVNZXJnZWRCbG9ja0pzb24oZ3JvdXBTbHVnLCBncm91cFRpdGxlLCB2YXJpYW50SW5mb3MsIHN1cGVyc2V0QXR0cnMsIHNjcmVlbnNob3RzKSxcbiAgICBpbmRleEpzLFxuICAgIHJlbmRlclBocDogZ2VuZXJhdGVNZXJnZWRSZW5kZXJQaHAoZ3JvdXBTbHVnLCB2YXJpYW50SW5mb3MsIGZpZWxkTWFwcyksXG4gICAgZWRpdG9yU2NzczogZ2VuZXJhdGVNZXJnZWRFZGl0b3JTY3NzKHZhcmlhbnRJbmZvcyksXG4gICAgc3R5bGVTY3NzOiBnZW5lcmF0ZU1lcmdlZFN0eWxlU2Nzcyh2YXJpYW50SW5mb3MpLFxuICAgIHJlYWRtZTogZ2VuZXJhdGVNZXJnZWRSZWFkbWUoZ3JvdXBTbHVnLCBncm91cFRpdGxlLCB2YXJpYW50SW5mb3MpLFxuICAgIG1pZ3JhdGlvblNjaGVtYTogZ2VuZXJhdGVNZXJnZWRNaWdyYXRpb25TY2hlbWEoZ3JvdXBTbHVnLCBncm91cFRpdGxlLCB2YXJpYW50SW5mb3MpLFxuICAgIHZhcmlhbnRTY3JlZW5zaG90VXJscyxcbiAgICB2YXJpYXRpb25GaWxlczoge1xuICAgICAganM6IHZhcmlhdGlvbkpzLFxuICAgICAgcGhwOiB2YXJpYXRpb25QaHAsXG4gICAgfSxcbiAgfTtcbn07XG5cbmV4cG9ydCB0eXBlIHsgVmFyaWFudEluZm8gfTtcbiJdfQ==