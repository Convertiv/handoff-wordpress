"use strict";
/**
 * Generates index.js for Gutenberg block editor
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePropertyControl = exports.generateArrayControl = exports.generateFieldControl = exports.toTitleCase = exports.generateIndexJs = void 0;
const types_1 = require("../types");
const block_json_1 = require("./block-json");
const handlebars_to_jsx_1 = require("./handlebars-to-jsx");
const utils_1 = require("./handlebars-to-jsx/utils");
const render_php_1 = require("./render-php");
/**
 * Convert snake_case to Title Case
 */
const toTitleCase = (str) => {
    return str
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
exports.toTitleCase = toTitleCase;
/**
 * Generate a field control for any property type - unified function for both top-level and nested fields
 */
const generateFieldControl = (fieldKey, property, context) => {
    const { valueAccessor, onChangeHandler, indent } = context;
    const label = property.name || toTitleCase(fieldKey);
    switch (property.type) {
        case 'text':
            return `${indent}<TextControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || ''}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}/>`;
        case 'richtext':
            // richtext uses InnerBlocks on the canvas – no sidebar control needed
            return '';
        case 'number':
            return `${indent}<RangeControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || 0}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}  min={0}
${indent}  max={100}
${indent}/>`;
        case 'boolean':
            return `${indent}<ToggleControl
${indent}  label={__('${label}', 'handoff')}
${indent}  checked={${valueAccessor} || false}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}/>`;
        case 'image':
            // Use 'src' instead of 'url' to match Handoff's image property naming convention
            return `${indent}<MediaUploadCheck>
${indent}  <MediaUpload
${indent}    onSelect={(media) => ${onChangeHandler('{ src: media.url, alt: media.alt || \'\' }')}}
${indent}    allowedTypes={['image']}
${indent}    value={${valueAccessor}?.src}
${indent}    render={({ open }) => (
${indent}      <Flex direction="column" gap={3}>
${indent}        <span className="components-base-control__label">{__('${label}', 'handoff')}</span>
${indent}        {${valueAccessor}?.src && (
${indent}          <img 
${indent}            src={${valueAccessor}.src} 
${indent}            alt={${valueAccessor}.alt}
${indent}            style={{ maxWidth: '100%', height: 'auto' }}
${indent}          />
${indent}        )}
${indent}        <Button onClick={open} variant="secondary" size="small">
${indent}          {${valueAccessor}?.src ? __('Replace ${label}', 'handoff') : __('Select ${label}', 'handoff')}
${indent}        </Button>
${indent}        {${valueAccessor}?.src && (
${indent}          <Button
${indent}            onClick={() => ${onChangeHandler('{ src: \'\', alt: \'\' }')}}
${indent}            variant="link"
${indent}            isDestructive
${indent}            size="small"
${indent}          >
${indent}            {__('Remove', 'handoff')}
${indent}          </Button>
${indent}        )}
${indent}      </Flex>
${indent}    )}
${indent}  />
${indent}</MediaUploadCheck>`;
        case 'link':
            // For links, use LinkControl which provides internal page search and URL validation
            const linkHandler = onChangeHandler(`{ 
        ...${valueAccessor}, 
        url: value.url || '', 
        label: value.title || ${valueAccessor}?.label || '',
        opensInNewTab: value.opensInNewTab || false
      }`);
            return `${indent}<div className="components-base-control">
${indent}  <label className="components-base-control__label">{__('${label}', 'handoff')}</label>
${indent}  <TextControl
${indent}    label={__('Link Text', 'handoff')}
${indent}    hideLabelFromVision={true}
${indent}    value={${valueAccessor}?.label || ''}
${indent}    onChange={(value) => ${onChangeHandler(`{ ...${valueAccessor}, label: value }`)}}
${indent}  />
${indent}  <div style={{ marginTop: '8px' }}>
${indent}    <LinkControl
${indent}      value={{ 
${indent}        url: ${valueAccessor}?.url || '', 
${indent}        title: ${valueAccessor}?.label || '',
${indent}        opensInNewTab: ${valueAccessor}?.opensInNewTab || false
${indent}      }}
${indent}      onChange={(value) => ${linkHandler}}
${indent}      settings={[
${indent}        { id: 'opensInNewTab', title: __('Open in new tab', 'handoff') }
${indent}      ]}
${indent}      showSuggestions={true}
${indent}      suggestionsQuery={{ type: 'post', subtype: 'any' }}
${indent}    />
${indent}  </div>
${indent}</div>`;
        case 'button':
            // For buttons, provide label field and href field with link picker
            // Button properties: label, href, target, rel, disabled
            const buttonHandler = onChangeHandler(`{ 
        ...${valueAccessor}, 
        href: value.url || '#', 
        target: value.opensInNewTab ? '_blank' : '',
        rel: value.opensInNewTab ? 'noopener noreferrer' : ''
      }`);
            return `${indent}<div className="components-base-control">
${indent}  <label className="components-base-control__label">{__('${label}', 'handoff')}</label>
${indent}  <TextControl
${indent}    label={__('Button Label', 'handoff')}
${indent}    hideLabelFromVision={true}
${indent}    value={${valueAccessor}?.label || ''}
${indent}    onChange={(value) => ${onChangeHandler(`{ ...${valueAccessor}, label: value }`)}}
${indent}  />
${indent}  <div style={{ marginTop: '8px' }}>
${indent}    <LinkControl
${indent}      value={{ 
${indent}        url: ${valueAccessor}?.href || '#', 
${indent}        title: ${valueAccessor}?.label || '',
${indent}        opensInNewTab: ${valueAccessor}?.target === '_blank'
${indent}      }}
${indent}      onChange={(value) => ${buttonHandler}}
${indent}      settings={[
${indent}        { id: 'opensInNewTab', title: __('Open in new tab', 'handoff') }
${indent}      ]}
${indent}      showSuggestions={true}
${indent}      suggestionsQuery={{ type: 'post', subtype: 'any' }}
${indent}    />
${indent}  </div>
${indent}  <ToggleControl
${indent}    label={__('Disabled', 'handoff')}
${indent}    checked={${valueAccessor}?.disabled || false}
${indent}    onChange={(value) => ${onChangeHandler(`{ ...${valueAccessor}, disabled: value }`)}}
${indent}  />
${indent}</div>`;
        case 'select': {
            const options = (0, utils_1.normalizeSelectOptions)(property.options).map(opt => `{ label: '${opt.label.replace(/'/g, "\\'")}', value: '${opt.value}' }`).join(', ');
            return `${indent}<SelectControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || ''}
${indent}  options={[${options}]}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}/>`;
        }
        case 'array':
            // Handle simple string arrays with a repeatable list control
            // Check if this is a simple type array (string, number, etc.) vs object array
            const itemType = property.items?.type;
            if (!property.items?.properties && (itemType === 'string' || !itemType)) {
                // Generate a list control for string arrays
                return `${indent}<div className="components-base-control">
${indent}  <label className="components-base-control__label">{__('${label}', 'handoff')}</label>
${indent}  <Flex direction="column" gap={2}>
${indent}    {(${valueAccessor} || []).map((listItem, listIndex) => (
${indent}      <Flex key={listIndex} gap={2} align="center">
${indent}        <div style={{ flex: 1 }}>
${indent}          <TextControl
${indent}            value={listItem || ''}
${indent}            onChange={(value) => {
${indent}              const newList = [...(${valueAccessor} || [])];
${indent}              newList[listIndex] = value;
${indent}              ${onChangeHandler('newList')};
${indent}            }}
${indent}            placeholder={__('Enter item...', 'handoff')}
${indent}          />
${indent}        </div>
${indent}        <Button
${indent}          icon="arrow-up-alt2"
${indent}          label={__('Move up', 'handoff')}
${indent}          onClick={() => {
${indent}            if (listIndex === 0) return;
${indent}            const newList = [...(${valueAccessor} || [])];
${indent}            [newList[listIndex], newList[listIndex - 1]] = [newList[listIndex - 1], newList[listIndex]];
${indent}            ${onChangeHandler('newList')};
${indent}          }}
${indent}          disabled={listIndex === 0}
${indent}          size="small"
${indent}        />
${indent}        <Button
${indent}          icon="arrow-down-alt2"
${indent}          label={__('Move down', 'handoff')}
${indent}          onClick={() => {
${indent}            const list = ${valueAccessor} || [];
${indent}            if (listIndex >= list.length - 1) return;
${indent}            const newList = [...list];
${indent}            [newList[listIndex], newList[listIndex + 1]] = [newList[listIndex + 1], newList[listIndex]];
${indent}            ${onChangeHandler('newList')};
${indent}          }}
${indent}          disabled={listIndex >= (${valueAccessor} || []).length - 1}
${indent}          size="small"
${indent}        />
${indent}        <Button
${indent}          icon="trash"
${indent}          label={__('Remove', 'handoff')}
${indent}          onClick={() => {
${indent}            const newList = (${valueAccessor} || []).filter((_, i) => i !== listIndex);
${indent}            ${onChangeHandler('newList')};
${indent}          }}
${indent}          isDestructive
${indent}          size="small"
${indent}        />
${indent}      </Flex>
${indent}    ))}
${indent}    <Button
${indent}      onClick={() => {
${indent}        const newList = [...(${valueAccessor} || []), ''];
${indent}        ${onChangeHandler('newList')};
${indent}      }}
${indent}      variant="tertiary"
${indent}      size="small"
${indent}    >
${indent}      {__('Add Item', 'handoff')}
${indent}    </Button>
${indent}  </Flex>
${indent}</div>`;
            }
            // For object arrays, fall through to default (these should be handled by generateArrayControl at top level)
            return '';
        case 'object':
            if (property.properties) {
                const nestedControls = Object.entries(property.properties)
                    .map(([nestedKey, nestedProp]) => {
                    const nestedContext = {
                        valueAccessor: `${valueAccessor}?.${nestedKey}`,
                        onChangeHandler: (val) => onChangeHandler(`{ ...${valueAccessor}, ${nestedKey}: ${val} }`),
                        indent: indent + '  '
                    };
                    return generateFieldControl(nestedKey, nestedProp, nestedContext);
                }).join('\n');
                return `${indent}<Flex direction="column" gap={2}>
${nestedControls}
${indent}</Flex>`;
            }
            return '';
        default:
            return `${indent}<TextControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || ''}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}/>`;
    }
};
exports.generateFieldControl = generateFieldControl;
/**
 * Generate array (repeater) control using 10up Repeater component
 * Provides drag-and-drop reordering and built-in add/remove functionality
 */
const generateArrayControl = (key, property, attrName, label, indent) => {
    const itemProps = property.items?.properties || {};
    // Generate field controls that use setItem from the Repeater render prop
    const itemFields = Object.entries(itemProps).map(([fieldKey, fieldProp]) => {
        const fieldContext = {
            valueAccessor: `item.${fieldKey}`,
            onChangeHandler: (value) => `setItem({ ...item, ${fieldKey}: ${value} })`,
            indent: indent + '      '
        };
        return generateFieldControl(fieldKey, fieldProp, fieldContext);
    }).join('\n');
    // Get a display title from the first text field if available, fallback to field label
    const firstTextField = Object.entries(itemProps).find(([, prop]) => prop.type === 'text');
    const titleAccessor = firstTextField ? `item.${firstTextField[0]} || ` : '';
    // Custom add button with tertiary styling, plus icon, right aligned
    // addButton is a function that receives addItem and returns a React element
    const addButtonJsx = `(addItem) => (
${indent}    <div className="repeater-add-button-wrapper">
${indent}      <Button
${indent}        variant="tertiary"
${indent}        onClick={addItem}
${indent}        icon={
${indent}          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
${indent}            <path d="M11 12.5V17.5H12.5V12.5H17.5V11H12.5V6H11V11H6V12.5H11Z"/>
${indent}          </svg>
${indent}        }
${indent}        className="repeater-add-button"
${indent}      >
${indent}        {__('Add ${label}', 'handoff')}
${indent}      </Button>
${indent}    </div>
${indent}  )`;
    return `${indent}<Repeater 
${indent}  attribute="${attrName}" 
${indent}  allowReordering={true} 
${indent}  defaultValue={{}}
${indent}  addButton={${addButtonJsx}}
${indent}>
${indent}  {(item, index, setItem, removeItem) => (
${indent}    <div className="repeater-item">
${indent}      <details className="repeater-item__collapse">
${indent}        <summary className="repeater-item__header">
${indent}          <span className="repeater-item__title">{${titleAccessor}'${label}'}</span>
${indent}          <span className="repeater-item__actions" onClick={(e) => e.stopPropagation()}>
${indent}            <Button
${indent}              onClick={removeItem}
${indent}              icon={
${indent}                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
${indent}                  <path d="M5 6.5V18a2 2 0 002 2h10a2 2 0 002-2V6.5h-2.5V18a.5.5 0 01-.5.5H8a.5.5 0 01-.5-.5V6.5H5zM9 9v8h1.5V9H9zm4.5 0v8H15V9h-1.5z"/>
${indent}                  <path d="M20 5h-5V3.5A1.5 1.5 0 0013.5 2h-3A1.5 1.5 0 009 3.5V5H4v1.5h16V5zm-6.5 0h-3V3.5h3V5z"/>
${indent}                </svg>
${indent}              }
${indent}              label={__('Remove item', 'handoff')}
${indent}              isDestructive
${indent}              size="small"
${indent}            />
${indent}          </span>
${indent}        </summary>
${indent}        <div className="repeater-item__fields">
${indent}          <Flex direction="column" gap={2}>
${itemFields}
${indent}          </Flex>
${indent}        </div>
${indent}      </details>
${indent}    </div>
${indent}  )}
${indent}</Repeater>`;
};
exports.generateArrayControl = generateArrayControl;
/**
 * Generate the inspector control for a top-level property
 * Uses generateFieldControl with a setAttributes context
 */
const generatePropertyControl = (key, property, indent = '          ') => {
    const attrName = (0, handlebars_to_jsx_1.toCamelCase)(key);
    const label = property.name || toTitleCase(key);
    // For array type, use the specialized array control
    if (property.type === 'array') {
        return generateArrayControl(key, property, attrName, label, indent);
    }
    // For all other types, use the unified field control generator
    const context = {
        valueAccessor: attrName,
        onChangeHandler: (value) => `setAttributes({ ${attrName}: ${value} })`,
        indent
    };
    return generateFieldControl(key, property, context);
};
exports.generatePropertyControl = generatePropertyControl;
/**
 * Generate default value for a property type
 */
const getDefaultValue = (fieldProp) => {
    switch (fieldProp.type) {
        case 'link':
            return { label: '', url: '', opensInNewTab: false };
        case 'button':
            return { label: '', href: '#', target: '', rel: '', disabled: false };
        case 'image':
            return { src: '', alt: '' };
        case 'object':
            if (fieldProp.properties) {
                const nested = {};
                for (const [nestedKey, nestedProp] of Object.entries(fieldProp.properties)) {
                    nested[nestedKey] = getDefaultValue(nestedProp);
                }
                return nested;
            }
            return {};
        case 'boolean':
            return false;
        case 'number':
            return 0;
        case 'array':
            return [];
        default:
            return '';
    }
};
/**
 * Generate helper functions for array properties
 * Note: With the 10up Repeater component, we no longer need custom add/update/remove/move functions
 * The Repeater handles all of this internally via its render prop
 */
const generateArrayHelpers = (properties) => {
    // The 10up Repeater component handles array manipulation internally
    // No custom helper functions are needed
    return '';
};
/**
 * Generate complete index.js file
 * @param component - The Handoff component data
 * @param dynamicArrayConfigs - Optional dynamic array configurations keyed by field name
 * @param innerBlocksField - The richtext field that uses InnerBlocks, or null if none
 */
const generateIndexJs = (component, dynamicArrayConfigs, innerBlocksField, deprecationsCode) => {
    const blockName = (0, block_json_1.toBlockName)(component.id);
    const properties = component.properties;
    // hasDynamicArrays is true only when there are DynamicArrayConfig (posts) fields —
    // the simpler types (breadcrumbs/taxonomy/pagination) don't need DynamicPostSelector.
    const hasDynamicArrays = dynamicArrayConfigs
        ? Object.values(dynamicArrayConfigs).some((c) => !('arrayType' in c))
        : false;
    // Helper to check for a type in properties, including nested in arrays/objects
    const hasPropertyType = (type) => {
        const checkProperty = (prop) => {
            if (prop.type === type)
                return true;
            if (prop.type === 'object' && prop.properties) {
                return Object.values(prop.properties).some(checkProperty);
            }
            if (prop.type === 'array' && prop.items?.properties) {
                return Object.values(prop.items.properties).some(checkProperty);
            }
            return false;
        };
        return Object.values(properties).some(checkProperty);
    };
    // The innerBlocksField uses InnerBlocks (content stored in post_content, not an attribute).
    // All other richtext fields become string attributes with RichText editing.
    const useInnerBlocks = !!innerBlocksField;
    // Get all attribute names – exclude innerBlocksField and pagination
    const attrNames = Object.keys(properties)
        .filter(k => k !== innerBlocksField && properties[k].type !== 'pagination')
        .map(handlebars_to_jsx_1.toCamelCase);
    // Include any attribute names referenced in the template but missing from API properties
    // (e.g. body -> blockBody so JSX has a defined variable and no ReferenceError)
    for (const name of (0, utils_1.getTemplateReferencedAttributeNames)(component.code)) {
        if (!attrNames.includes(name))
            attrNames.push(name);
    }
    // Add dynamic array attribute names based on config type
    if (dynamicArrayConfigs) {
        for (const [fieldName, dynConfig] of Object.entries(dynamicArrayConfigs)) {
            const attrName = (0, handlebars_to_jsx_1.toCamelCase)(fieldName);
            if ((0, types_1.isBreadcrumbsConfig)(dynConfig) || (0, types_1.isPaginationConfig)(dynConfig)) {
                attrNames.push(`${attrName}Enabled`);
            }
            else if ((0, types_1.isTaxonomyConfig)(dynConfig)) {
                attrNames.push(`${attrName}Enabled`);
                attrNames.push(`${attrName}Taxonomy`);
                attrNames.push(`${attrName}Source`);
            }
            else {
                // DynamicArrayConfig (posts)
                attrNames.push(`${attrName}Source`);
                attrNames.push(`${attrName}PostType`);
                attrNames.push(`${attrName}SelectedPosts`);
                attrNames.push(`${attrName}QueryArgs`);
                attrNames.push(`${attrName}FieldMapping`);
                attrNames.push(`${attrName}ItemOverrides`);
                attrNames.push(`${attrName}RenderMode`);
                if (dynConfig.pagination) {
                    attrNames.push(`${attrName}PaginationEnabled`);
                }
            }
        }
    }
    // Check for overlay in template
    const hasOverlay = component.code.includes('overlay');
    if (hasOverlay && !attrNames.includes('overlayOpacity')) {
        attrNames.push('overlayOpacity');
    }
    // Determine which components we need to import
    const needsMediaUpload = hasPropertyType('image');
    const needsRangeControl = hasPropertyType('number') || hasOverlay;
    const needsToggleControl = hasPropertyType('boolean') || hasPropertyType('button');
    const needsSelectControl = hasPropertyType('select');
    const hasArrayProps = Object.values(properties).some(p => p.type === 'array');
    const hasObjectProps = hasPropertyType('object');
    // Build imports
    const blockEditorImports = ['useBlockProps', 'InspectorControls', 'BlockControls'];
    if (needsMediaUpload) {
        blockEditorImports.push('MediaUpload', 'MediaUploadCheck', 'MediaReplaceFlow');
    }
    // InnerBlocks for the designated richtext content area
    if (useInnerBlocks) {
        blockEditorImports.push('InnerBlocks');
    }
    // LinkControl for link/button fields (when not using shared HandoffLinkField)
    const needsLinkControl = hasPropertyType('link') || hasPropertyType('button');
    const hasBreadcrumbsArray = dynamicArrayConfigs
        ? Object.values(dynamicArrayConfigs).some((c) => (0, types_1.isBreadcrumbsConfig)(c))
        : false;
    const hasTaxonomyArray = dynamicArrayConfigs
        ? Object.values(dynamicArrayConfigs).some((c) => (0, types_1.isTaxonomyConfig)(c))
        : false;
    const hasPaginationArray = dynamicArrayConfigs
        ? Object.values(dynamicArrayConfigs).some((c) => (0, types_1.isPaginationConfig)(c))
        : false;
    const componentImports = ['PanelBody', 'TextControl', 'Button'];
    if (needsRangeControl)
        componentImports.push('RangeControl');
    // ToggleControl: only for boolean/button property fields — special array types use shared components
    if (needsToggleControl)
        componentImports.push('ToggleControl');
    // SelectControl: only for select property fields or DynamicPostSelector (posts) — taxonomy handled by TaxonomySelector
    if (needsSelectControl || hasDynamicArrays)
        componentImports.push('SelectControl');
    // Spinner for dynamic array loading state in editor preview
    if (hasDynamicArrays)
        componentImports.push('Spinner');
    componentImports.push('Flex');
    // 10up block-components imports
    // Repeater is only needed when there are non-server-rendered array fields in the sidebar
    // (taxonomy/breadcrumbs/pagination arrays use shared components that import Repeater themselves)
    const hasNonSpecialArrayProps = Object.entries(properties).some(([k, p]) => p.type === 'array' && (!dynamicArrayConfigs?.[k] || !('arrayType' in dynamicArrayConfigs[k])));
    const tenUpImports = [];
    if (hasNonSpecialArrayProps) {
        tenUpImports.push('Repeater');
    }
    // Generate array helpers
    const arrayHelpers = generateArrayHelpers(properties);
    // Generate JSX preview from handlebars template
    // This must happen before panel generation so we know which fields have inline editing
    const previewResult = (0, handlebars_to_jsx_1.generateJsxPreview)(component.code, properties, component.id, component.title, innerBlocksField);
    let previewJsx = previewResult.jsx;
    const inlineEditableFields = previewResult.inlineEditableFields;
    // Detect if preview uses HandoffLinkField (link/button inline editing)
    const previewUsesLinkField = previewJsx.includes('<HandoffLinkField');
    // Generate panel bodies for each property
    const panels = [];
    for (const [key, property] of Object.entries(properties)) {
        // richtext uses InnerBlocks on the canvas – no sidebar panel needed
        // pagination is auto-generated from query results – no sidebar panel needed
        if (property.type === 'richtext' || property.type === 'pagination')
            continue;
        // Skip fields that are inline-editable on the canvas (text, image, link, button
        // wrapped in {{#field}}) – they don't need sidebar controls.
        // Array fields are always kept: they need sidebar UI for manual/dynamic toggle
        // and for adding/removing items, even when their child fields are inline-editable.
        if (inlineEditableFields.has(key) && property.type !== 'array')
            continue;
        const label = property.name || toTitleCase(key);
        const attrName = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const dynamicConfig = dynamicArrayConfigs?.[key];
        // Check if this is a dynamic array field
        if (property.type === 'array' && dynamicConfig) {
            if ((0, types_1.isBreadcrumbsConfig)(dynamicConfig)) {
                // Breadcrumbs: shared component with single visibility toggle
                panels.push(`          {/* ${label} Panel - Breadcrumbs */}
          <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
            <BreadcrumbsSelector
              attrName="${attrName}"
              attributes={attributes}
              setAttributes={setAttributes}
            />
          </PanelBody>`);
            }
            else if ((0, types_1.isTaxonomyConfig)(dynamicConfig)) {
                // Taxonomy: shared component with Auto / Manual tabs
                const taxonomyOptions = dynamicConfig.taxonomies.map((t) => ({ label: t, value: t }));
                const defaultTaxonomy = dynamicConfig.taxonomies[0] || 'post_tag';
                const itemProps = property.items?.properties || {};
                const itemFields = Object.keys(itemProps).length > 0
                    ? Object.entries(itemProps).map(([fieldKey, fieldProp]) => {
                        const ctx = {
                            valueAccessor: `item.${fieldKey}`,
                            onChangeHandler: (val) => `setItem({ ...item, ${fieldKey}: ${val} })`,
                            indent: '                ',
                        };
                        return generateFieldControl(fieldKey, fieldProp, ctx);
                    }).filter(Boolean).join('\n')
                    : `                <TextControl label={__('Label', 'handoff')} value={item.label || ''} onChange={(v) => setItem({ ...item, label: v })} __nextHasNoMarginBottom />
                <TextControl label={__('URL', 'handoff')} value={item.url || ''} onChange={(v) => setItem({ ...item, url: v })} __nextHasNoMarginBottom />`;
                panels.push(`          {/* ${label} Panel - Taxonomy */}
          <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
            <TaxonomySelector
              attrName="${attrName}"
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
                // Pagination: shared component with single visibility toggle
                panels.push(`          {/* ${label} Panel - Pagination */}
          <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
            <PaginationSelector
              attrName="${attrName}"
              attributes={attributes}
              setAttributes={setAttributes}
            />
          </PanelBody>`);
            }
            else {
                // Posts (DynamicArrayConfig): full DynamicPostSelector
                const defaultMode = dynamicConfig.selectionMode === 'manual' ? 'select' : 'query';
                const itemOverridesConfig = dynamicConfig.itemOverridesConfig || {};
                const advancedFields = [];
                // Fields from itemOverridesConfig (legacy)
                for (const [name, c] of Object.entries(itemOverridesConfig)) {
                    if (c.mode === 'ui') {
                        advancedFields.push({ name, label: c.label, type: 'select', options: (0, utils_1.normalizeSelectOptions)(c.options), default: c.default });
                    }
                }
                // Fields from fieldMapping with type: "manual" — derive control type from item properties
                const itemProps = property.items?.properties || {};
                const fieldMapping = dynamicConfig.fieldMapping || {};
                for (const [fieldPath, mappingValue] of Object.entries(fieldMapping)) {
                    if (typeof mappingValue === 'object' && mappingValue !== null && mappingValue.type === 'manual') {
                        const topKey = fieldPath.split('.')[0];
                        const itemProp = itemProps[topKey];
                        const fieldLabel = itemProp?.name || toTitleCase(topKey);
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
                const paginationToggle = dynamicConfig.pagination
                    ? `
                <ToggleControl
                  label={__('Show Pagination', 'handoff')}
                  checked={${attrName}PaginationEnabled ?? true}
                  onChange={(value) => setAttributes({ ${attrName}PaginationEnabled: value })}
                />`
                    : '';
                panels.push(`          {/* ${label} Panel - Dynamic */}
          <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
            <DynamicPostSelector
              value={{
                source: ${attrName}Source || '${defaultMode}',
                postType: ${attrName}PostType,
                queryArgs: ${attrName}QueryArgs || {},
                selectedPosts: ${attrName}SelectedPosts || [],
                itemOverrides: ${attrName}ItemOverrides || {}
              }}
              onChange={(nextValue) => setAttributes({
                ${attrName}Source: nextValue.source,
                ${attrName}PostType: nextValue.postType,
                ${attrName}QueryArgs: { ...nextValue.queryArgs, post_type: nextValue.postType },
                ${attrName}SelectedPosts: nextValue.selectedPosts || [],
                ${attrName}ItemOverrides: nextValue.itemOverrides ?? {}
              })}
              options={{
                postTypes: ${JSON.stringify(dynamicConfig.postTypes)},
                maxItems: ${dynamicConfig.maxItems ?? 20},
                textDomain: 'handoff',
                showDateFilter: ${dynamicConfig.showDateFilter === true ? 'true' : 'false'},
                showExcludeCurrent: true,
                advancedFields: ${JSON.stringify(advancedFields)}
              }}
            />${paginationToggle}
            {${attrName}Source === 'manual' && (
              <>
${generatePropertyControl(key, property)}
              </>
            )}
          </PanelBody>`);
            }
        }
        else {
            // Standard panel (non-dynamic)
            panels.push(`          {/* ${label} Panel */}
          <PanelBody title={__('${label}', 'handoff')} initialOpen={${panels.length < 2}}>
${generatePropertyControl(key, property)}
          </PanelBody>`);
        }
    }
    // Add overlay opacity panel if detected
    if (hasOverlay && !properties.overlayOpacity) {
        panels.push(`          {/* Overlay Panel */}
          <PanelBody title={__('Overlay', 'handoff')} initialOpen={false}>
            <RangeControl
              label={__('Overlay Opacity', 'handoff')}
              value={overlayOpacity || 0.6}
              onChange={(value) => setAttributes({ overlayOpacity: value })}
              min={0}
              max={1}
              step={0.1}
            />
          </PanelBody>`);
    }
    // Add Handoff design system links panel
    const designSystemPanel = [
        '          {/* Design System Links */}',
        '          {(metadata.__handoff?.handoffUrl || metadata.__handoff?.figmaUrl) && (',
        '            <PanelBody title={__(\'Design System\', \'handoff\')} initialOpen={false}>',
        '              <Flex direction="column" gap={3}>',
        '                {metadata.__handoff?.handoffUrl && (',
        '                  <Button',
        '                    variant="secondary"',
        '                    href={metadata.__handoff.handoffUrl}',
        '                    target="_blank"',
        '                    rel="noopener noreferrer"',
        '                    icon="visibility"',
        '                    style={{ width: \'100%\', justifyContent: \'center\' }}',
        '                  >',
        '                    {__(\'View in Handoff\', \'handoff\')}',
        '                  </Button>',
        '                )}',
        '                {metadata.__handoff?.figmaUrl && (',
        '                  <Button',
        '                    variant="secondary"',
        '                    href={metadata.__handoff.figmaUrl}',
        '                    target="_blank"',
        '                    rel="noopener noreferrer"',
        '                    icon="art"',
        '                    style={{ width: \'100%\', justifyContent: \'center\' }}',
        '                  >',
        '                    {__(\'Open in Figma\', \'handoff\')}',
        '                  </Button>',
        '                )}',
        '              </Flex>',
        '            </PanelBody>',
        '          )}',
    ].join('\n');
    panels.push(designSystemPanel);
    // Dynamic array resolution for editor preview.
    // DynamicArrayConfig (posts): full useSelect resolution
    // Breadcrumbs: live fetch via REST endpoint
    // Taxonomy (auto mode): live fetch via useSelect with core-data
    // Pagination: server-rendered only (stub variable)
    let dynamicArrayResolutionCode = '';
    const resolvingFlags = [];
    if (dynamicArrayConfigs) {
        for (const [fieldKey, config] of Object.entries(dynamicArrayConfigs)) {
            const attrName = (0, handlebars_to_jsx_1.toCamelCase)(fieldKey);
            const fieldProp = properties[fieldKey];
            const itemProps = fieldProp?.items?.properties;
            if ((0, types_1.isBreadcrumbsConfig)(config)) {
                const cap = attrName.charAt(0).toUpperCase() + attrName.slice(1);
                const reshapeJs = (0, render_php_1.buildReshapeJs)(itemProps, ['label', 'url']);
                const mapExpr = reshapeJs
                    ? `.map((item) => ${reshapeJs})`
                    : '';
                dynamicArrayResolutionCode += `
    const [preview${cap}, setPreview${cap}] = useState(null);
    useEffect(() => {
      if (!${attrName}Enabled) { setPreview${cap}([]); return; }
      const postId = select('core/editor')?.getCurrentPostId?.();
      if (!postId) { setPreview${cap}([]); return; }
      apiFetch({ path: \`/handoff/v1/breadcrumbs?post_id=\${postId}\` })
        .then((items) => setPreview${cap}((items || [])${mapExpr}))
        .catch(() => setPreview${cap}([]));
    }, [${attrName}Enabled]);
`;
                const arrayVarRegex = new RegExp(`\\b${attrName}\\b(?!Enabled)`, 'g');
                previewJsx = previewJsx.replace(arrayVarRegex, `preview${cap}`);
                continue;
            }
            if ((0, types_1.isTaxonomyConfig)(config)) {
                const cap = attrName.charAt(0).toUpperCase() + attrName.slice(1);
                const reshapeJs = (0, render_php_1.buildReshapeJs)(itemProps, ['label', 'url', 'slug']);
                const mapExpr = reshapeJs
                    ? `.map((item) => ${reshapeJs})`
                    : '';
                dynamicArrayResolutionCode += `
    const preview${cap} = useSelect(
      (select) => {
        if (!${attrName}Enabled) return [];
        if (${attrName}Source === 'manual') return ${attrName} || [];
        const postId = select('core/editor')?.getCurrentPostId?.();
        if (!postId) return [];
        const taxonomy = ${attrName}Taxonomy || '${config.taxonomies[0] || 'post_tag'}';
        const restBase = select(coreDataStore).getTaxonomy(taxonomy)?.rest_base;
        if (!restBase) return [];
        const terms = select(coreDataStore).getEntityRecords('taxonomy', taxonomy, { post: postId, per_page: ${config.maxItems ?? -1} });
        if (!terms) return [];
        return terms.map((t) => ({ label: t.name, url: t.link || '', slug: t.slug || '' }))${mapExpr};
      },
      [${attrName}Enabled, ${attrName}Source, ${attrName}Taxonomy, JSON.stringify(${attrName} || [])]
    );
`;
                const arrayVarRegex = new RegExp(`\\b${attrName}\\b(?!Enabled|Source|Taxonomy)`, 'g');
                previewJsx = previewJsx.replace(arrayVarRegex, `preview${cap}`);
                continue;
            }
            if ((0, types_1.isPaginationConfig)(config)) {
                dynamicArrayResolutionCode += `
    const preview${attrName.charAt(0).toUpperCase() + attrName.slice(1)} = []; // Pagination renders on the frontend
`;
                const arrayVarRegex = new RegExp(`\\b${attrName}\\b(?!Enabled)`, 'g');
                previewJsx = previewJsx.replace(arrayVarRegex, `preview${attrName.charAt(0).toUpperCase() + attrName.slice(1)}`);
                continue;
            }
            // DynamicArrayConfig (posts): full useSelect resolution
            const cap = attrName.charAt(0).toUpperCase() + attrName.slice(1);
            const previewVarName = `preview${cap}`;
            const resolvedVarName = `resolved${cap}`;
            const resolvingVarName = `isResolving${cap}`;
            resolvingFlags.push(resolvingVarName);
            const sourceAttr = `${attrName}Source`;
            const queryArgsAttr = `${attrName}QueryArgs`;
            const postTypeAttr = `${attrName}PostType`;
            const selectedPostsAttr = `${attrName}SelectedPosts`;
            const fieldMappingAttr = `${attrName}FieldMapping`;
            const itemOverridesAttr = `${attrName}ItemOverrides`;
            dynamicArrayResolutionCode += `
    const ${resolvedVarName} = useSelect(
      (select) => {
        if (${sourceAttr} === 'manual') return undefined;
        const store = select(coreDataStore);
        if (${sourceAttr} === 'query') {
          const queryArgs = ${queryArgsAttr} || {};
          const postType = ${postTypeAttr} || 'post';
          const args = {
            per_page: queryArgs.posts_per_page || ${config.maxItems ?? 6},
            orderby: queryArgs.orderby || 'date',
            order: (queryArgs.order || 'DESC').toLowerCase(),
            _embed: true,
            status: 'publish',
          };
          if (queryArgs.tax_query && queryArgs.tax_query.length) {
            queryArgs.tax_query.forEach((tq) => {
              if (!tq.taxonomy || !tq.terms || !tq.terms.length) return;
              const param = tq.taxonomy === 'category' ? 'categories' : tq.taxonomy === 'post_tag' ? 'tags' : tq.taxonomy;
              args[param] = tq.terms.join(',');
            });
          }
          const records = store.getEntityRecords('postType', postType, args);
          if (records === null || records === undefined) return undefined;
          if (!Array.isArray(records)) return [];
          const mapping = ${fieldMappingAttr} || {};
          const overrides = ${itemOverridesAttr} || {};
          return records.map((rec) =>
            mapPostEntityToItem(rec, mapping, overrides, rec._embedded || {})
          );
        }
        if (${sourceAttr} === 'select') {
          const selected = ${selectedPostsAttr} || [];
          if (!selected.length) return [];
          const mapping = ${fieldMappingAttr} || {};
          const overrides = ${itemOverridesAttr} || {};
          return selected
            .map((sel) => {
              const rec = store.getEntityRecord('postType', sel.type || 'post', sel.id);
              return rec ? mapPostEntityToItem(rec, mapping, overrides, rec._embedded || {}) : null;
            })
            .filter(Boolean);
        }
        return [];
      },
      [${sourceAttr}, ${postTypeAttr}, JSON.stringify(${queryArgsAttr} || {}), JSON.stringify(${selectedPostsAttr} || []), JSON.stringify(${fieldMappingAttr} || {}), JSON.stringify(${itemOverridesAttr} || {})]
    );
    const ${previewVarName} = ${sourceAttr} !== 'manual' ? (${resolvedVarName} ?? []) : (${attrName} ?? []);
    const ${resolvingVarName} = ${sourceAttr} !== 'manual' && ${resolvedVarName} === undefined;
`;
            // Use preview variable in the generated preview JSX so the editor shows query/select results
            const arrayVarRegex = new RegExp(`\\b${attrName}\\b`, 'g');
            previewJsx = previewJsx.replace(arrayVarRegex, previewVarName);
        }
        if (resolvingFlags.length > 0) {
            dynamicArrayResolutionCode += `
    const isPreviewLoading = ${resolvingFlags.join(' || ')};
`;
        }
        // When preview JSX references pagination (from HBS) but pagination is only built server-side,
        // define it in the edit so the editor doesn't throw ReferenceError.
        const previewUsesPagination = /\bpagination\b/.test(previewJsx);
        const anyConfigHasPagination = dynamicArrayConfigs
            ? Object.values(dynamicArrayConfigs).some((c) => !('arrayType' in c) && !!c.pagination)
            : false;
        if (previewUsesPagination && anyConfigHasPagination && !dynamicArrayResolutionCode.includes('const pagination')) {
            dynamicArrayResolutionCode = `    const pagination = []; // Editor: pagination is built server-side in render.php
` + dynamicArrayResolutionCode;
        }
    }
    // When using dynamic posts, wrap preview in loading state
    const className = component.id.replace(/_/g, '-');
    const previewContent = resolvingFlags.length > 0
        ? `{isPreviewLoading ? (
          <div className="${className}-editor-preview is-loading" style={{ minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Spinner />
            <span style={{ color: 'var(--wp-admin-theme-color-darker, #1e1e1e)' }}>{__('Loading posts…', 'handoff')}</span>
          </div>
        ) : (
${previewJsx}
        )}`
        : previewJsx;
    // Check the generated preview for components that need to be imported
    // This catches components added by the handlebars-to-jsx transpiler (e.g., from {{#field}} markers)
    const previewUsesRichText = previewJsx.includes('<RichText');
    const previewUses10upImage = previewJsx.includes('<Image');
    // Add RichText to imports if used in preview (and not already included from property types)
    if ((previewUsesRichText || previewUsesLinkField) && !blockEditorImports.includes('RichText')) {
        blockEditorImports.push('RichText');
    }
    // LinkControl is needed for sidebar link/button property panels; add unconditionally when present.
    // (HandoffLinkField in the preview is separate — it's imported from the shared component and handles its own LinkControl internally.)
    if (needsLinkControl) {
        if (!blockEditorImports.includes('LinkControl'))
            blockEditorImports.push('LinkControl');
        if (!componentImports.includes('Popover'))
            componentImports.push('Popover');
    }
    // Add InnerBlocks if used in preview but not already imported
    const previewUsesInnerBlocks = previewJsx.includes('<InnerBlocks');
    if (previewUsesInnerBlocks && !blockEditorImports.includes('InnerBlocks')) {
        blockEditorImports.push('InnerBlocks');
    }
    // Build the 10up import if needed (Image for preview, Repeater for arrays)
    if (previewUses10upImage) {
        tenUpImports.push('Image');
    }
    const tenUpImport = tenUpImports.length > 0
        ? `import { ${tenUpImports.join(', ')} } from '@10up/block-components';\n`
        : '';
    const imageFields = [];
    const collectImageFields = (props, parentPath = '', parentValuePath = '') => {
        for (const [key, prop] of Object.entries(props)) {
            const attrName = (0, handlebars_to_jsx_1.toCamelCase)(key);
            const currentPath = parentPath ? `${parentPath}.${attrName}` : attrName;
            const currentValuePath = parentValuePath ? `${parentValuePath}?.${attrName}` : attrName;
            if (prop.type === 'image') {
                const label = prop.name || toTitleCase(key);
                let updateExpr;
                if (parentPath) {
                    // Nested image field - need to spread parent object
                    const parentAttr = parentPath.split('.')[0];
                    const parentCamel = (0, handlebars_to_jsx_1.toCamelCase)(parentAttr);
                    updateExpr = `setAttributes({ ${parentCamel}: { ...${parentCamel}, ${attrName}: { id: media.id, src: media.url, alt: media.alt || '' } } })`;
                }
                else {
                    // Top-level image field
                    updateExpr = `setAttributes({ ${attrName}: { id: media.id, src: media.url, alt: media.alt || '' } })`;
                }
                imageFields.push({
                    label,
                    attrPath: currentPath,
                    valueExpr: currentValuePath,
                    updateExpr
                });
            }
            // Recurse into object properties
            if (prop.type === 'object' && prop.properties) {
                collectImageFields(prop.properties, currentPath, currentValuePath);
            }
        }
    };
    collectImageFields(properties);
    // Generate BlockControls with MediaReplaceFlow for each image field
    const blockControlsJsx = imageFields.length > 0 ? `
        <BlockControls group="other">
${imageFields.map(field => `          <MediaReplaceFlow
            mediaId={${field.valueExpr}?.id}
            mediaUrl={${field.valueExpr}?.src}
            allowedTypes={['image']}
            accept="image/*"
            onSelect={(media) => ${field.updateExpr}}
            name={__('${field.label}', 'handoff')}
          />`).join('\n')}
        </BlockControls>` : '';
    // Shared component imports for dynamic arrays (selector UI + editor preview mapping)
    const sharedNamedImports = [];
    if (hasDynamicArrays)
        sharedNamedImports.push('DynamicPostSelector', 'mapPostEntityToItem');
    if (hasBreadcrumbsArray)
        sharedNamedImports.push('BreadcrumbsSelector');
    if (hasTaxonomyArray)
        sharedNamedImports.push('TaxonomySelector');
    if (hasPaginationArray)
        sharedNamedImports.push('PaginationSelector');
    let sharedComponentImport = sharedNamedImports.length
        ? `import { ${sharedNamedImports.join(', ')} } from '../../shared';\n`
        : '';
    const needsDataStore = hasDynamicArrays || hasTaxonomyArray;
    if (needsDataStore) {
        sharedComponentImport += `import { useSelect${hasBreadcrumbsArray ? ', select' : ''} } from '@wordpress/data';\nimport { store as coreDataStore } from '@wordpress/core-data';\n`;
    }
    if (hasBreadcrumbsArray) {
        sharedComponentImport += `import apiFetch from '@wordpress/api-fetch';\n`;
    }
    // Build element imports
    const elementImports = ['Fragment'];
    if (hasBreadcrumbsArray) {
        elementImports.push('useState', 'useEffect');
    }
    // Import shared HandoffLinkField when preview uses link/button inline editing
    const linkFieldImport = previewUsesLinkField ? `import { HandoffLinkField } from '../../shared/components/LinkField';\n` : '';
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
${hasDynamicArrays ? "import '../../shared/components/DynamicPostSelector.editor.scss';\n" : ''}import './style.scss';
${linkFieldImport}${deprecationsCode ? `${deprecationsCode}\n\n` : ''}registerBlockType(metadata.name, {
  ...metadata,${deprecationsCode ? '\n  deprecated,' : ''}
  edit: ({ attributes, setAttributes, isSelected }) => {
    const blockProps = useBlockProps();
${useInnerBlocks || previewUsesInnerBlocks ? "    const CONTENT_BLOCKS = ['core/paragraph','core/heading','core/list','core/list-item','core/quote','core/image','core/separator','core/html','core/buttons','core/button'];" : ''}
    const { ${attrNames.join(', ')} } = attributes;
${dynamicArrayResolutionCode}
${arrayHelpers}
    return (
      <Fragment>
        <InspectorControls>
${panels.join('\n\n')}
        </InspectorControls>
${blockControlsJsx}

        {/* Editor Preview */}
        <div {...blockProps}>
${previewContent}
        </div>
      </Fragment>
    );
  },
  save: () => {
${useInnerBlocks || previewUsesInnerBlocks ? '    // InnerBlocks content must be saved so it is persisted in post content\n    return <InnerBlocks.Content />;' : '    // Server-side rendering via render.php\n    return null;'}
  },
});
`;
};
exports.generateIndexJs = generateIndexJs;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBNmxDd0Isa0NBQVc7QUEva0NyQzs7R0FFRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsUUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsT0FBcUIsRUFDYixFQUFFO0lBQ1YsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQzNELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXJELFFBQVEsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLEtBQUssTUFBTTtZQUNULE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU0sZ0JBQWdCLEtBQUs7RUFDM0IsTUFBTSxZQUFZLGFBQWE7RUFDL0IsTUFBTSwwQkFBMEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUN4RCxNQUFNLElBQUksQ0FBQztRQUVULEtBQUssVUFBVTtZQUNiLHNFQUFzRTtZQUN0RSxPQUFPLEVBQUUsQ0FB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QUFFO2dCQUNyRCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQUU7OztFQUd2RCxjQUFjLElBQUksc0JBQXNCLENBQUMsQ0FBQyxDQUFDLGdMQUFnTCxDQUFDLENBQUMsQ0FBQyxFQUFFO2NBQ3BOLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0VBQ2hDLDBCQUEwQjtFQUMxQixZQUFZOzs7O0VBSVosTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7O0VBRW5CLGdCQUFnQjs7OztFQUloQixjQUFjOzs7Ozs7RUFNZCxjQUFjLElBQUksc0JBQXNCLENBQUMsQ0FBQyxDQUFDLGtIQUFrSCxDQUFDLENBQUMsQ0FBQywrREFBK0Q7OztDQUdoTyxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBRU8sMENBQWUiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBpbmRleC5qcyBmb3IgR3V0ZW5iZXJnIGJsb2NrIGVkaXRvclxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnLCBpc0JyZWFkY3J1bWJzQ29uZmlnLCBpc1RheG9ub215Q29uZmlnLCBpc1BhZ2luYXRpb25Db25maWcgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0b0Jsb2NrTmFtZSB9IGZyb20gJy4vYmxvY2stanNvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZUpzeFByZXZpZXcsIHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBUaXRsZSBDYXNlXG4gKi9cbmNvbnN0IHRvVGl0bGVDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0clxuICAgIC5zcGxpdCgnXycpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKVxuICAgIC5qb2luKCcgJyk7XG59O1xuXG4vKipcbiAqIENvbnRleHQgZm9yIGdlbmVyYXRpbmcgZmllbGQgY29udHJvbHMgLSBkZXRlcm1pbmVzIGhvdyB2YWx1ZXMgYXJlIGFjY2Vzc2VkIGFuZCB1cGRhdGVkXG4gKi9cbmludGVyZmFjZSBGaWVsZENvbnRleHQge1xuICAvKiogVGhlIHZhcmlhYmxlIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgdmFsdWUgKGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdpdGVtLmltYWdlJykgKi9cbiAgdmFsdWVBY2Nlc3Nvcjogc3RyaW5nO1xuICAvKiogVGhlIG9uQ2hhbmdlIGhhbmRsZXIgY29kZSAoZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyB4OiB2YWx1ZSB9KScgb3IgJ3VwZGF0ZUl0ZW1zKGluZGV4LCBcInhcIiwgdmFsdWUpJykgKi9cbiAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogQmFzZSBpbmRlbnRhdGlvbiAqL1xuICBpbmRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpZWxkIGNvbnRyb2wgZm9yIGFueSBwcm9wZXJ0eSB0eXBlIC0gdW5pZmllZCBmdW5jdGlvbiBmb3IgYm90aCB0b3AtbGV2ZWwgYW5kIG5lc3RlZCBmaWVsZHNcbiAqL1xuY29uc3QgZ2VuZXJhdGVGaWVsZENvbnRyb2wgPSAoXG4gIGZpZWxkS2V5OiBzdHJpbmcsXG4gIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksXG4gIGNvbnRleHQ6IEZpZWxkQ29udGV4dFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgeyB2YWx1ZUFjY2Vzc29yLCBvbkNoYW5nZUhhbmRsZXIsIGluZGVudCB9ID0gY29udGV4dDtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGZpZWxkS2V5KTtcblxuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0JzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuXG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgICAgLy8gcmljaHRleHQgdXNlcyBJbm5lckJsb2NrcyBvbiB0aGUgY2FudmFzIOKAkyBubyBzaWRlYmFyIGNvbnRyb2wgbmVlZGVkXG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGAke2luZGVudH08UmFuZ2VDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAwfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIG1pbj17MH1cbiR7aW5kZW50fSAgbWF4PXsxMDB9XG4ke2luZGVudH0vPmA7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfS5zcmN9IFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWx0PXske3ZhbHVlQWNjZXNzb3J9LmFsdH1cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7IG1heFdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19XG4ke2luZGVudH0gICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvbiBvbkNsaWNrPXtvcGVufSB2YXJpYW50PVwic2Vjb25kYXJ5XCIgc2l6ZT1cInNtYWxsXCI+XG4ke2luZGVudH0gICAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyA/IF9fKCdSZXBsYWNlICR7bGFiZWx9JywgJ2hhbmRvZmYnKSA6IF9fKCdTZWxlY3QgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DbGljaz17KCkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBcXCdcXCcsIGFsdDogXFwnXFwnIH0nKX19XG4ke2luZGVudH0gICAgICAgICAgICB2YXJpYW50PVwibGlua1wiXG4ke2luZGVudH0gICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICApfVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9PC9NZWRpYVVwbG9hZENoZWNrPmA7XG5cbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIC8vIEZvciBsaW5rcywgdXNlIExpbmtDb250cm9sIHdoaWNoIHByb3ZpZGVzIGludGVybmFsIHBhZ2Ugc2VhcmNoIGFuZCBVUkwgdmFsaWRhdGlvblxuICAgICAgY29uc3QgbGlua0hhbmRsZXIgPSBvbkNoYW5nZUhhbmRsZXIoYHsgXG4gICAgICAgIC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIFxuICAgICAgICB1cmw6IHZhbHVlLnVybCB8fCAnJywgXG4gICAgICAgIGxhYmVsOiB2YWx1ZS50aXRsZSB8fCAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiAgICAgICAgb3BlbnNJbk5ld1RhYjogdmFsdWUub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0xpbmsgVGV4dCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LnVybCB8fCAnJywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiR7aW5kZW50fSAgICAgICAgb3BlbnNJbk5ld1RhYjogJHt2YWx1ZUFjY2Vzc29yfT8ub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7bGlua0hhbmRsZXJ9fVxuJHtpbmRlbnR9ICAgICAgc2V0dGluZ3M9e1tcbiR7aW5kZW50fSAgICAgICAgeyBpZDogJ29wZW5zSW5OZXdUYWInLCB0aXRsZTogX18oJ09wZW4gaW4gbmV3IHRhYicsICdoYW5kb2ZmJykgfVxuJHtpbmRlbnR9ICAgICAgXX1cbiR7aW5kZW50fSAgICAgIHNob3dTdWdnZXN0aW9ucz17dHJ1ZX1cbiR7aW5kZW50fSAgICAgIHN1Z2dlc3Rpb25zUXVlcnk9e3sgdHlwZTogJ3Bvc3QnLCBzdWJ0eXBlOiAnYW55JyB9fVxuJHtpbmRlbnR9ICAgIC8+XG4ke2luZGVudH0gIDwvZGl2PlxuJHtpbmRlbnR9PC9kaXY+YDtcblxuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICAvLyBGb3IgYnV0dG9ucywgcHJvdmlkZSBsYWJlbCBmaWVsZCBhbmQgaHJlZiBmaWVsZCB3aXRoIGxpbmsgcGlja2VyXG4gICAgICAvLyBCdXR0b24gcHJvcGVydGllczogbGFiZWwsIGhyZWYsIHRhcmdldCwgcmVsLCBkaXNhYmxlZFxuICAgICAgY29uc3QgYnV0dG9uSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIGhyZWY6IHZhbHVlLnVybCB8fCAnIycsIFxuICAgICAgICB0YXJnZXQ6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnX2JsYW5rJyA6ICcnLFxuICAgICAgICByZWw6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnbm9vcGVuZXIgbm9yZWZlcnJlcicgOiAnJ1xuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0J1dHRvbiBMYWJlbCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LmhyZWYgfHwgJyMnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py50YXJnZXQgPT09ICdfYmxhbmsnXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtidXR0b25IYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fSAgPFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0Rpc2FibGVkJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9Py5kaXNhYmxlZCB8fCBmYWxzZX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBkaXNhYmxlZDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvZGl2PmA7XG5cbiAgICBjYXNlICdzZWxlY3QnOiB7XG4gICAgICBjb25zdCBvcHRpb25zID0gbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhwcm9wZXJ0eS5vcHRpb25zKS5tYXAob3B0ID0+XG4gICAgICAgIGB7IGxhYmVsOiAnJHtvcHQubGFiZWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfScsIHZhbHVlOiAnJHtvcHQudmFsdWV9JyB9YFxuICAgICAgKS5qb2luKCcsICcpO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08U2VsZWN0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9wdGlvbnM9e1ske29wdGlvbnN9XX1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICAgIH1cblxuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIC8vIEhhbmRsZSBzaW1wbGUgc3RyaW5nIGFycmF5cyB3aXRoIGEgcmVwZWF0YWJsZSBsaXN0IGNvbnRyb2xcbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBzaW1wbGUgdHlwZSBhcnJheSAoc3RyaW5nLCBudW1iZXIsIGV0Yy4pIHZzIG9iamVjdCBhcnJheVxuICAgICAgY29uc3QgaXRlbVR5cGUgPSBwcm9wZXJ0eS5pdGVtcz8udHlwZTtcbiAgICAgIGlmICghcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgJiYgKGl0ZW1UeXBlID09PSAnc3RyaW5nJyB8fCAhaXRlbVR5cGUpKSB7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbGlzdCBjb250cm9sIGZvciBzdHJpbmcgYXJyYXlzXG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aW5kZW50fSAgICB7KCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLm1hcCgobGlzdEl0ZW0sIGxpc3RJbmRleCkgPT4gKFxuJHtpbmRlbnR9ICAgICAgPEZsZXgga2V5PXtsaXN0SW5kZXh9IGdhcD17Mn0gYWxpZ249XCJjZW50ZXJcIj5cbiR7aW5kZW50fSAgICAgICAgPGRpdiBzdHlsZT17eyBmbGV4OiAxIH19PlxuJHtpbmRlbnR9ICAgICAgICAgIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgICAgICAgICAgdmFsdWU9e2xpc3RJdGVtIHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKV07XG4ke2luZGVudH0gICAgICAgICAgICAgIG5ld0xpc3RbbGlzdEluZGV4XSA9IHZhbHVlO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICBwbGFjZWhvbGRlcj17X18oJ0VudGVyIGl0ZW0uLi4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LXVwLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSB1cCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA9PT0gMCkgcmV0dXJuO1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggLSAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggLSAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA9PT0gMH1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LWRvd24tYWx0MlwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdNb3ZlIGRvd24nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IGxpc3QgPSAke3ZhbHVlQWNjZXNzb3J9IHx8IFtdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA+PSBsaXN0Lmxlbmd0aCAtIDEpIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4ubGlzdF07XG4ke2luZGVudH0gICAgICAgICAgICBbbmV3TGlzdFtsaXN0SW5kZXhdLCBuZXdMaXN0W2xpc3RJbmRleCArIDFdXSA9IFtuZXdMaXN0W2xpc3RJbmRleCArIDFdLCBuZXdMaXN0W2xpc3RJbmRleF1dO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBkaXNhYmxlZD17bGlzdEluZGV4ID49ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5sZW5ndGggLSAxfVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwidHJhc2hcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLmZpbHRlcigoXywgaSkgPT4gaSAhPT0gbGlzdEluZGV4KTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgKSl9XG4ke2luZGVudH0gICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKSwgJyddO1xuJHtpbmRlbnR9ICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICA+XG4ke2luZGVudH0gICAgICB7X18oJ0FkZCBJdGVtJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgPC9GbGV4PlxuJHtpbmRlbnR9PC9kaXY+YDtcbiAgICAgIH1cbiAgICAgIC8vIEZvciBvYmplY3QgYXJyYXlzLCBmYWxsIHRocm91Z2ggdG8gZGVmYXVsdCAodGhlc2Ugc2hvdWxkIGJlIGhhbmRsZWQgYnkgZ2VuZXJhdGVBcnJheUNvbnRyb2wgYXQgdG9wIGxldmVsKVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZENvbnRyb2xzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydHkucHJvcGVydGllcylcbiAgICAgICAgICAubWFwKChbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgJHt2YWx1ZUFjY2Vzc29yfT8uJHtuZXN0ZWRLZXl9YCxcbiAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgJHtuZXN0ZWRLZXl9OiAke3ZhbH0gfWApLFxuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudCArICcgICdcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2wobmVzdGVkS2V5LCBuZXN0ZWRQcm9wLCBuZXN0ZWRDb250ZXh0KTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtuZXN0ZWRDb250cm9sc31cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFycmF5IChyZXBlYXRlcikgY29udHJvbCB1c2luZyAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudFxuICogUHJvdmlkZXMgZHJhZy1hbmQtZHJvcCByZW9yZGVyaW5nIGFuZCBidWlsdC1pbiBhZGQvcmVtb3ZlIGZ1bmN0aW9uYWxpdHlcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGF0dHJOYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG5cbiAgLy8gR2VuZXJhdGUgZmllbGQgY29udHJvbHMgdGhhdCB1c2Ugc2V0SXRlbSBmcm9tIHRoZSBSZXBlYXRlciByZW5kZXIgcHJvcFxuICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgIGNvbnN0IGZpZWxkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRJdGVtKHsgLi4uaXRlbSwgJHtmaWVsZEtleX06ICR7dmFsdWV9IH0pYCxcbiAgICAgIGluZGVudDogaW5kZW50ICsgJyAgICAgICdcbiAgICB9O1xuICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBmaWVsZENvbnRleHQpO1xuICB9KS5qb2luKCdcXG4nKTtcblxuICAvLyBHZXQgYSBkaXNwbGF5IHRpdGxlIGZyb20gdGhlIGZpcnN0IHRleHQgZmllbGQgaWYgYXZhaWxhYmxlLCBmYWxsYmFjayB0byBmaWVsZCBsYWJlbFxuICBjb25zdCBmaXJzdFRleHRGaWVsZCA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykuZmluZCgoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3RleHQnKTtcbiAgY29uc3QgdGl0bGVBY2Nlc3NvciA9IGZpcnN0VGV4dEZpZWxkID8gYGl0ZW0uJHtmaXJzdFRleHRGaWVsZFswXX0gfHwgYCA6ICcnO1xuICBcbiAgLy8gQ3VzdG9tIGFkZCBidXR0b24gd2l0aCB0ZXJ0aWFyeSBzdHlsaW5nLCBwbHVzIGljb24sIHJpZ2h0IGFsaWduZWRcbiAgLy8gYWRkQnV0dG9uIGlzIGEgZnVuY3Rpb24gdGhhdCByZWNlaXZlcyBhZGRJdGVtIGFuZCByZXR1cm5zIGEgUmVhY3QgZWxlbWVudFxuICBjb25zdCBhZGRCdXR0b25Kc3ggPSBgKGFkZEl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b24td3JhcHBlclwiPlxuJHtpbmRlbnR9ICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgICBvbkNsaWNrPXthZGRJdGVtfVxuJHtpbmRlbnR9ICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHBhdGggZD1cIk0xMSAxMi41VjE3LjVIMTIuNVYxMi41SDE3LjVWMTFIMTIuNVY2SDExVjExSDZWMTIuNUgxMVpcIi8+XG4ke2luZGVudH0gICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvblwiXG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIHtfXygnQWRkICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApYDtcblxuICByZXR1cm4gYCR7aW5kZW50fTxSZXBlYXRlciBcbiR7aW5kZW50fSAgYXR0cmlidXRlPVwiJHthdHRyTmFtZX1cIiBcbiR7aW5kZW50fSAgYWxsb3dSZW9yZGVyaW5nPXt0cnVlfSBcbiR7aW5kZW50fSAgZGVmYXVsdFZhbHVlPXt7fX1cbiR7aW5kZW50fSAgYWRkQnV0dG9uPXske2FkZEJ1dHRvbkpzeH19XG4ke2luZGVudH0+XG4ke2luZGVudH0gIHsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1cIj5cbiR7aW5kZW50fSAgICAgIDxkZXRhaWxzIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2NvbGxhcHNlXCI+XG4ke2luZGVudH0gICAgICAgIDxzdW1tYXJ5IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2hlYWRlclwiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX3RpdGxlXCI+eyR7dGl0bGVBY2Nlc3Nvcn0nJHtsYWJlbH0nfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19hY3Rpb25zXCIgb25DbGljaz17KGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCl9PlxuJHtpbmRlbnR9ICAgICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBvbkNsaWNrPXtyZW1vdmVJdGVtfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk01IDYuNVYxOGEyIDIgMCAwMDIgMmgxMGEyIDIgMCAwMDItMlY2LjVoLTIuNVYxOGEuNS41IDAgMDEtLjUuNUg4YS41LjUgMCAwMS0uNS0uNVY2LjVINXpNOSA5djhoMS41VjlIOXptNC41IDB2OEgxNVY5aC0xLjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk0yMCA1aC01VjMuNUExLjUgMS41IDAgMDAxMy41IDJoLTNBMS41IDEuNSAwIDAwOSAzLjVWNUg0djEuNWgxNlY1em0tNi41IDBoLTNWMy41aDNWNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUgaXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L3N1bW1hcnk+XG4ke2luZGVudH0gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fZmllbGRzXCI+XG4ke2luZGVudH0gICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aXRlbUZpZWxkc31cbiR7aW5kZW50fSAgICAgICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kZXRhaWxzPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApfVxuJHtpbmRlbnR9PC9SZXBlYXRlcj5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0aGUgaW5zcGVjdG9yIGNvbnRyb2wgZm9yIGEgdG9wLWxldmVsIHByb3BlcnR5XG4gKiBVc2VzIGdlbmVyYXRlRmllbGRDb250cm9sIHdpdGggYSBzZXRBdHRyaWJ1dGVzIGNvbnRleHRcbiAqL1xuY29uc3QgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGluZGVudDogc3RyaW5nID0gJyAgICAgICAgICAnKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcblxuICAvLyBGb3IgYXJyYXkgdHlwZSwgdXNlIHRoZSBzcGVjaWFsaXplZCBhcnJheSBjb250cm9sXG4gIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgcmV0dXJuIGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIGF0dHJOYW1lLCBsYWJlbCwgaW5kZW50KTtcbiAgfVxuXG4gIC8vIEZvciBhbGwgb3RoZXIgdHlwZXMsIHVzZSB0aGUgdW5pZmllZCBmaWVsZCBjb250cm9sIGdlbmVyYXRvclxuICBjb25zdCBjb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgdmFsdWVBY2Nlc3NvcjogYXR0ck5hbWUsXG4gICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICBpbmRlbnRcbiAgfTtcblxuICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woa2V5LCBwcm9wZXJ0eSwgY29udGV4dCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGRlZmF1bHQgdmFsdWUgZm9yIGEgcHJvcGVydHkgdHlwZVxuICovXG5jb25zdCBnZXREZWZhdWx0VmFsdWUgPSAoZmllbGRQcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBhbnkgPT4ge1xuICBzd2l0Y2ggKGZpZWxkUHJvcC50eXBlKSB7XG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIHVybDogJycsIG9wZW5zSW5OZXdUYWI6IGZhbHNlIH07XG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiB7IGxhYmVsOiAnJywgaHJlZjogJyMnLCB0YXJnZXQ6ICcnLCByZWw6ICcnLCBkaXNhYmxlZDogZmFsc2UgfTtcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBhbHQ6ICcnIH07XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChmaWVsZFByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZFByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgICBuZXN0ZWRbbmVzdGVkS2V5XSA9IGdldERlZmF1bHRWYWx1ZShuZXN0ZWRQcm9wKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVzdGVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHt9O1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gMDtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gW107XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBoZWxwZXIgZnVuY3Rpb25zIGZvciBhcnJheSBwcm9wZXJ0aWVzXG4gKiBOb3RlOiBXaXRoIHRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCwgd2Ugbm8gbG9uZ2VyIG5lZWQgY3VzdG9tIGFkZC91cGRhdGUvcmVtb3ZlL21vdmUgZnVuY3Rpb25zXG4gKiBUaGUgUmVwZWF0ZXIgaGFuZGxlcyBhbGwgb2YgdGhpcyBpbnRlcm5hbGx5IHZpYSBpdHMgcmVuZGVyIHByb3BcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IHN0cmluZyA9PiB7XG4gIC8vIFRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCBoYW5kbGVzIGFycmF5IG1hbmlwdWxhdGlvbiBpbnRlcm5hbGx5XG4gIC8vIE5vIGN1c3RvbSBoZWxwZXIgZnVuY3Rpb25zIGFyZSBuZWVkZWRcbiAgcmV0dXJuICcnO1xufTtcblxuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIGluZGV4LmpzIGZpbGVcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGR5bmFtaWNBcnJheUNvbmZpZ3MgLSBPcHRpb25hbCBkeW5hbWljIGFycmF5IGNvbmZpZ3VyYXRpb25zIGtleWVkIGJ5IGZpZWxkIG5hbWVcbiAqIEBwYXJhbSBpbm5lckJsb2Nrc0ZpZWxkIC0gVGhlIHJpY2h0ZXh0IGZpZWxkIHRoYXQgdXNlcyBJbm5lckJsb2Nrcywgb3IgbnVsbCBpZiBub25lXG4gKi9cbmNvbnN0IGdlbmVyYXRlSW5kZXhKcyA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCxcbiAgZGVwcmVjYXRpb25zQ29kZT86IHN0cmluZ1xuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50LmlkKTtcbiAgY29uc3QgcHJvcGVydGllcyA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzO1xuXG4gIC8vIGhhc0R5bmFtaWNBcnJheXMgaXMgdHJ1ZSBvbmx5IHdoZW4gdGhlcmUgYXJlIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGZpZWxkcyDigJRcbiAgLy8gdGhlIHNpbXBsZXIgdHlwZXMgKGJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24pIGRvbid0IG5lZWQgRHluYW1pY1Bvc3RTZWxlY3Rvci5cbiAgY29uc3QgaGFzRHluYW1pY0FycmF5cyA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZShcbiAgICAgICAgKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYylcbiAgICAgIClcbiAgICA6IGZhbHNlO1xuXG4gIC8vIEhlbHBlciB0byBjaGVjayBmb3IgYSB0eXBlIGluIHByb3BlcnRpZXMsIGluY2x1ZGluZyBuZXN0ZWQgaW4gYXJyYXlzL29iamVjdHNcbiAgY29uc3QgaGFzUHJvcGVydHlUeXBlID0gKHR5cGU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgIGNvbnN0IGNoZWNrUHJvcGVydHkgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgfTtcblxuICAvLyBUaGUgaW5uZXJCbG9ja3NGaWVsZCB1c2VzIElubmVyQmxvY2tzIChjb250ZW50IHN0b3JlZCBpbiBwb3N0X2NvbnRlbnQsIG5vdCBhbiBhdHRyaWJ1dGUpLlxuICAvLyBBbGwgb3RoZXIgcmljaHRleHQgZmllbGRzIGJlY29tZSBzdHJpbmcgYXR0cmlidXRlcyB3aXRoIFJpY2hUZXh0IGVkaXRpbmcuXG4gIGNvbnN0IHVzZUlubmVyQmxvY2tzID0gISFpbm5lckJsb2Nrc0ZpZWxkO1xuXG4gIC8vIEdldCBhbGwgYXR0cmlidXRlIG5hbWVzIOKAkyBleGNsdWRlIGlubmVyQmxvY2tzRmllbGQgYW5kIHBhZ2luYXRpb25cbiAgY29uc3QgYXR0ck5hbWVzID0gT2JqZWN0LmtleXMocHJvcGVydGllcylcbiAgICAuZmlsdGVyKGsgPT4gayAhPT0gaW5uZXJCbG9ja3NGaWVsZCAmJiBwcm9wZXJ0aWVzW2tdLnR5cGUgIT09ICdwYWdpbmF0aW9uJylcbiAgICAubWFwKHRvQ2FtZWxDYXNlKTtcblxuICAvLyBJbmNsdWRlIGFueSBhdHRyaWJ1dGUgbmFtZXMgcmVmZXJlbmNlZCBpbiB0aGUgdGVtcGxhdGUgYnV0IG1pc3NpbmcgZnJvbSBBUEkgcHJvcGVydGllc1xuICAvLyAoZS5nLiBib2R5IC0+IGJsb2NrQm9keSBzbyBKU1ggaGFzIGEgZGVmaW5lZCB2YXJpYWJsZSBhbmQgbm8gUmVmZXJlbmNlRXJyb3IpXG4gIGZvciAoY29uc3QgbmFtZSBvZiBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyhjb21wb25lbnQuY29kZSkpIHtcbiAgICBpZiAoIWF0dHJOYW1lcy5pbmNsdWRlcyhuYW1lKSkgYXR0ck5hbWVzLnB1c2gobmFtZSk7XG4gIH1cbiAgXG4gIC8vIEFkZCBkeW5hbWljIGFycmF5IGF0dHJpYnV0ZSBuYW1lcyBiYXNlZCBvbiBjb25maWcgdHlwZVxuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVRheG9ub215YCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBvc3RUeXBlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UXVlcnlBcmdzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVJlbmRlck1vZGVgKTtcbiAgICAgICAgaWYgKChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uKSB7XG4gICAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWRgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGZvciBvdmVybGF5IGluIHRlbXBsYXRlXG4gIGNvbnN0IGhhc092ZXJsYXkgPSBjb21wb25lbnQuY29kZS5pbmNsdWRlcygnb3ZlcmxheScpO1xuICBpZiAoaGFzT3ZlcmxheSAmJiAhYXR0ck5hbWVzLmluY2x1ZGVzKCdvdmVybGF5T3BhY2l0eScpKSB7XG4gICAgYXR0ck5hbWVzLnB1c2goJ292ZXJsYXlPcGFjaXR5Jyk7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggY29tcG9uZW50cyB3ZSBuZWVkIHRvIGltcG9ydFxuICBjb25zdCBuZWVkc01lZGlhVXBsb2FkID0gaGFzUHJvcGVydHlUeXBlKCdpbWFnZScpO1xuICBjb25zdCBuZWVkc1JhbmdlQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnbnVtYmVyJykgfHwgaGFzT3ZlcmxheTtcbiAgY29uc3QgbmVlZHNUb2dnbGVDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcbiAgY29uc3QgbmVlZHNTZWxlY3RDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdzZWxlY3QnKTtcbiAgY29uc3QgaGFzQXJyYXlQcm9wcyA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+IHAudHlwZSA9PT0gJ2FycmF5Jyk7XG4gIGNvbnN0IGhhc09iamVjdFByb3BzID0gaGFzUHJvcGVydHlUeXBlKCdvYmplY3QnKTtcblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICB9XG4gIC8vIElubmVyQmxvY2tzIGZvciB0aGUgZGVzaWduYXRlZCByaWNodGV4dCBjb250ZW50IGFyZWFcbiAgaWYgKHVzZUlubmVyQmxvY2tzKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cbiAgLy8gTGlua0NvbnRyb2wgZm9yIGxpbmsvYnV0dG9uIGZpZWxkcyAod2hlbiBub3QgdXNpbmcgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQpXG4gIGNvbnN0IG5lZWRzTGlua0NvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuXG4gIGNvbnN0IGhhc0JyZWFkY3J1bWJzQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzVGF4b25vbXlBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNUYXhvbm9teUNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICAvLyBUb2dnbGVDb250cm9sOiBvbmx5IGZvciBib29sZWFuL2J1dHRvbiBwcm9wZXJ0eSBmaWVsZHMg4oCUIHNwZWNpYWwgYXJyYXkgdHlwZXMgdXNlIHNoYXJlZCBjb21wb25lbnRzXG4gIGlmIChuZWVkc1RvZ2dsZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVG9nZ2xlQ29udHJvbCcpO1xuICAvLyBTZWxlY3RDb250cm9sOiBvbmx5IGZvciBzZWxlY3QgcHJvcGVydHkgZmllbGRzIG9yIER5bmFtaWNQb3N0U2VsZWN0b3IgKHBvc3RzKSDigJQgdGF4b25vbXkgaGFuZGxlZCBieSBUYXhvbm9teVNlbGVjdG9yXG4gIGlmIChuZWVkc1NlbGVjdENvbnRyb2wgfHwgaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTZWxlY3RDb250cm9sJyk7XG4gIC8vIFNwaW5uZXIgZm9yIGR5bmFtaWMgYXJyYXkgbG9hZGluZyBzdGF0ZSBpbiBlZGl0b3IgcHJldmlld1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTcGlubmVyJyk7XG5cbiAgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdGbGV4Jyk7XG5cbiAgLy8gMTB1cCBibG9jay1jb21wb25lbnRzIGltcG9ydHNcbiAgLy8gUmVwZWF0ZXIgaXMgb25seSBuZWVkZWQgd2hlbiB0aGVyZSBhcmUgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHMgaW4gdGhlIHNpZGViYXJcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJyYXlzIHVzZSBzaGFyZWQgY29tcG9uZW50cyB0aGF0IGltcG9ydCBSZXBlYXRlciB0aGVtc2VsdmVzKVxuICBjb25zdCBoYXNOb25TcGVjaWFsQXJyYXlQcm9wcyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgKCFkeW5hbWljQXJyYXlDb25maWdzPy5ba10gfHwgISgnYXJyYXlUeXBlJyBpbiBkeW5hbWljQXJyYXlDb25maWdzW2tdKSlcbiAgKTtcbiAgY29uc3QgdGVuVXBJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMpIHtcbiAgICB0ZW5VcEltcG9ydHMucHVzaCgnUmVwZWF0ZXInKTtcbiAgfVxuXG4gIC8vIEdlbmVyYXRlIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnMocHJvcGVydGllcyk7XG5cbiAgLy8gR2VuZXJhdGUgSlNYIHByZXZpZXcgZnJvbSBoYW5kbGViYXJzIHRlbXBsYXRlXG4gIC8vIFRoaXMgbXVzdCBoYXBwZW4gYmVmb3JlIHBhbmVsIGdlbmVyYXRpb24gc28gd2Uga25vdyB3aGljaCBmaWVsZHMgaGF2ZSBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBwcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgIGNvbXBvbmVudC5jb2RlLFxuICAgIHByb3BlcnRpZXMsXG4gICAgY29tcG9uZW50LmlkLFxuICAgIGNvbXBvbmVudC50aXRsZSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkXG4gICk7XG4gIGxldCBwcmV2aWV3SnN4ID0gcHJldmlld1Jlc3VsdC5qc3g7XG4gIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gcHJldmlld1Jlc3VsdC5pbmxpbmVFZGl0YWJsZUZpZWxkcztcblxuICAvLyBEZXRlY3QgaWYgcHJldmlldyB1c2VzIEhhbmRvZmZMaW5rRmllbGQgKGxpbmsvYnV0dG9uIGlubGluZSBlZGl0aW5nKVxuICBjb25zdCBwcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxIYW5kb2ZmTGlua0ZpZWxkJyk7XG5cbiAgLy8gR2VuZXJhdGUgcGFuZWwgYm9kaWVzIGZvciBlYWNoIHByb3BlcnR5XG4gIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIHJpY2h0ZXh0IHVzZXMgSW5uZXJCbG9ja3Mgb24gdGhlIGNhbnZhcyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICAvLyBwYWdpbmF0aW9uIGlzIGF1dG8tZ2VuZXJhdGVkIGZyb20gcXVlcnkgcmVzdWx0cyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyB8fCBwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgaW5saW5lLWVkaXRhYmxlIG9uIHRoZSBjYW52YXMgKHRleHQsIGltYWdlLCBsaW5rLCBidXR0b25cbiAgICAvLyB3cmFwcGVkIGluIHt7I2ZpZWxkfX0pIOKAkyB0aGV5IGRvbid0IG5lZWQgc2lkZWJhciBjb250cm9scy5cbiAgICAvLyBBcnJheSBmaWVsZHMgYXJlIGFsd2F5cyBrZXB0OiB0aGV5IG5lZWQgc2lkZWJhciBVSSBmb3IgbWFudWFsL2R5bmFtaWMgdG9nZ2xlXG4gICAgLy8gYW5kIGZvciBhZGRpbmcvcmVtb3ZpbmcgaXRlbXMsIGV2ZW4gd2hlbiB0aGVpciBjaGlsZCBmaWVsZHMgYXJlIGlubGluZS1lZGl0YWJsZS5cbiAgICBpZiAoaW5saW5lRWRpdGFibGVGaWVsZHMuaGFzKGtleSkgJiYgcHJvcGVydHkudHlwZSAhPT0gJ2FycmF5JykgY29udGludWU7XG5cbiAgICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZHluYW1pY0NvbmZpZyA9IGR5bmFtaWNBcnJheUNvbmZpZ3M/LltrZXldO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBkeW5hbWljIGFycmF5IGZpZWxkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gQnJlYWRjcnVtYnM6IHNoYXJlZCBjb21wb25lbnQgd2l0aCBzaW5nbGUgdmlzaWJpbGl0eSB0b2dnbGVcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBCcmVhZGNydW1icyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIFRheG9ub215OiBzaGFyZWQgY29tcG9uZW50IHdpdGggQXV0byAvIE1hbnVhbCB0YWJzXG4gICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRUYXhvbm9teSA9IGR5bmFtaWNDb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgID8gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbH0gfSlgLFxuICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAnLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgIH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG4nKVxuICAgICAgICAgIDogYCAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdVUkwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS51cmwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIHVybDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5gO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFRheG9ub215ICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgdGF4b25vbXlPcHRpb25zPXske0pTT04uc3RyaW5naWZ5KHRheG9ub215T3B0aW9ucyl9fVxuICAgICAgICAgICAgICBkZWZhdWx0VGF4b25vbXk9XCIke2RlZmF1bHRUYXhvbm9teX1cIlxuICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICByZW5kZXJNYW51YWxJdGVtcz17KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4gICAgICAgICAgICAgICAgPD5cbiR7aXRlbUZpZWxkc31cbiAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBQYWdpbmF0aW9uOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gUGFnaW5hdGlvbiAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFBhZ2luYXRpb25TZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQb3N0cyAoRHluYW1pY0FycmF5Q29uZmlnKTogZnVsbCBEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgIGNvbnN0IGRlZmF1bHRNb2RlID0gZHluYW1pY0NvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAnbWFudWFsJyA/ICdzZWxlY3QnIDogJ3F1ZXJ5JztcbiAgICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0NvbmZpZyA9IGR5bmFtaWNDb25maWcuaXRlbU92ZXJyaWRlc0NvbmZpZyB8fCB7fTtcbiAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBpdGVtT3ZlcnJpZGVzQ29uZmlnIChsZWdhY3kpXG4gICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICBpZiAoYy5tb2RlID09PSAndWknKSB7XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZSwgbGFiZWw6IGMubGFiZWwsIHR5cGU6ICdzZWxlY3QnLCBvcHRpb25zOiBub3JtYWxpemVTZWxlY3RPcHRpb25zKGMub3B0aW9ucyksIGRlZmF1bHQ6IGMuZGVmYXVsdCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBmaWVsZE1hcHBpbmcgd2l0aCB0eXBlOiBcIm1hbnVhbFwiIOKAlCBkZXJpdmUgY29udHJvbCB0eXBlIGZyb20gaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBmaWVsZE1hcHBpbmcgPSBkeW5hbWljQ29uZmlnLmZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbZmllbGRQYXRoLCBtYXBwaW5nVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwcGluZykpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgY29uc3QgdG9wS2V5ID0gZmllbGRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1t0b3BLZXldO1xuICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICBsZXQgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICBsZXQgb3B0aW9uczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgaWYgKGl0ZW1Qcm9wKSB7XG4gICAgICAgICAgICAgIHN3aXRjaCAoaXRlbVByb3AudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdzZWxlY3QnO1xuICAgICAgICAgICAgICAgICAgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoaXRlbVByb3Aub3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3RvZ2dsZSc7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gMDtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZTogZmllbGRQYXRoLCBsYWJlbDogZmllbGRMYWJlbCwgdHlwZTogY29udHJvbFR5cGUsIG9wdGlvbnMsIGRlZmF1bHQ6IGRlZmF1bHRWYWwgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhZ2luYXRpb25Ub2dnbGUgPSBkeW5hbWljQ29uZmlnLnBhZ2luYXRpb25cbiAgICAgICAgICA/IGBcbiAgICAgICAgICAgICAgICA8VG9nZ2xlQ29udHJvbFxuICAgICAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93IFBhZ2luYXRpb24nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgY2hlY2tlZD17JHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZCA/PyB0cnVlfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQ6IHZhbHVlIH0pfVxuICAgICAgICAgICAgICAgIC8+YFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gRHluYW1pYyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgdmFsdWU9e3tcbiAgICAgICAgICAgICAgICBzb3VyY2U6ICR7YXR0ck5hbWV9U291cmNlIHx8ICcke2RlZmF1bHRNb2RlfScsXG4gICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7YXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgcXVlcnlBcmdzOiAke2F0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZFBvc3RzOiAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsobmV4dFZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVBvc3RUeXBlOiBuZXh0VmFsdWUucG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1RdWVyeUFyZ3M6IHsgLi4ubmV4dFZhbHVlLnF1ZXJ5QXJncywgcG9zdF90eXBlOiBuZXh0VmFsdWUucG9zdFR5cGUgfSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlczogbmV4dFZhbHVlLml0ZW1PdmVycmlkZXMgPz8ge31cbiAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICBwb3N0VHlwZXM6ICR7SlNPTi5zdHJpbmdpZnkoZHluYW1pY0NvbmZpZy5wb3N0VHlwZXMpfSxcbiAgICAgICAgICAgICAgICBtYXhJdGVtczogJHtkeW5hbWljQ29uZmlnLm1heEl0ZW1zID8/IDIwfSxcbiAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgc2hvd0RhdGVGaWx0ZXI6ICR7KGR5bmFtaWNDb25maWcgYXMgYW55KS5zaG93RGF0ZUZpbHRlciA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZSd9LFxuICAgICAgICAgICAgICAgIHNob3dFeGNsdWRlQ3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPiR7cGFnaW5hdGlvblRvZ2dsZX1cbiAgICAgICAgICAgIHske2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcgJiYgKFxuICAgICAgICAgICAgICA8PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTdGFuZGFyZCBwYW5lbCAobm9uLWR5bmFtaWMpXG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG4gIH1cblxuICAvLyBBZGQgb3ZlcmxheSBvcGFjaXR5IHBhbmVsIGlmIGRldGVjdGVkXG4gIGlmIChoYXNPdmVybGF5ICYmICFwcm9wZXJ0aWVzLm92ZXJsYXlPcGFjaXR5KSB7XG4gICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogT3ZlcmxheSBQYW5lbCAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnT3ZlcmxheScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+XG4gICAgICAgICAgICA8UmFuZ2VDb250cm9sXG4gICAgICAgICAgICAgIGxhYmVsPXtfXygnT3ZlcmxheSBPcGFjaXR5JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgdmFsdWU9e292ZXJsYXlPcGFjaXR5IHx8IDAuNn1cbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7IG92ZXJsYXlPcGFjaXR5OiB2YWx1ZSB9KX1cbiAgICAgICAgICAgICAgbWluPXswfVxuICAgICAgICAgICAgICBtYXg9ezF9XG4gICAgICAgICAgICAgIHN0ZXA9ezAuMX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gIH1cblxuICAvLyBBZGQgSGFuZG9mZiBkZXNpZ24gc3lzdGVtIGxpbmtzIHBhbmVsXG4gIGNvbnN0IGRlc2lnblN5c3RlbVBhbmVsID0gW1xuICAgICcgICAgICAgICAgey8qIERlc2lnbiBTeXN0ZW0gTGlua3MgKi99JyxcbiAgICAnICAgICAgICAgIHsobWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsIHx8IG1ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwpICYmICgnLFxuICAgICcgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXyhcXCdEZXNpZ24gU3lzdGVtXFwnLCBcXCdoYW5kb2ZmXFwnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT4nLFxuICAgICcgICAgICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+JyxcbiAgICAnICAgICAgICAgICAgICAgIHttZXRhZGF0YS5fX2hhbmRvZmY/LmhhbmRvZmZVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmhhbmRvZmZVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdWaWV3IGluIEhhbmRvZmZcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5maWdtYVVybCAmJiAoJyxcbiAgICAnICAgICAgICAgICAgICAgICAgPEJ1dHRvbicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBocmVmPXttZXRhZGF0YS5fX2hhbmRvZmYuZmlnbWFVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBcXCcxMDAlXFwnLCBqdXN0aWZ5Q29udGVudDogXFwnY2VudGVyXFwnIH19JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAge19fKFxcJ09wZW4gaW4gRmlnbWFcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgPC9GbGV4PicsXG4gICAgJyAgICAgICAgICAgIDwvUGFuZWxCb2R5PicsXG4gICAgJyAgICAgICAgICApfScsXG4gIF0uam9pbignXFxuJyk7XG4gIHBhbmVscy5wdXNoKGRlc2lnblN5c3RlbVBhbmVsKTtcblxuICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gZm9yIGVkaXRvciBwcmV2aWV3LlxuICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAvLyBCcmVhZGNydW1iczogbGl2ZSBmZXRjaCB2aWEgUkVTVCBlbmRwb2ludFxuICAvLyBUYXhvbm9teSAoYXV0byBtb2RlKTogbGl2ZSBmZXRjaCB2aWEgdXNlU2VsZWN0IHdpdGggY29yZS1kYXRhXG4gIC8vIFBhZ2luYXRpb246IHNlcnZlci1yZW5kZXJlZCBvbmx5IChzdHViIHZhcmlhYmxlKVxuICBsZXQgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSAnJztcbiAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGRLZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGRLZXkpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnNcbiAgICAgICAgICA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBbcHJldmlldyR7Y2FwfSwgc2V0UHJldmlldyR7Y2FwfV0gPSB1c2VTdGF0ZShudWxsKTtcbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgICAudGhlbigoaXRlbXMpID0+IHNldFByZXZpZXcke2NhcH0oKGl0ZW1zIHx8IFtdKSR7bWFwRXhwcn0pKVxuICAgICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICAgIH0sIFske2F0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7Y2FwfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgICAgaWYgKCR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJykgcmV0dXJuICR7YXR0ck5hbWV9IHx8IFtdO1xuICAgICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0YXhvbm9teSA9ICR7YXR0ck5hbWV9VGF4b25vbXkgfHwgJyR7Y29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJ30nO1xuICAgICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0ZXJtcyA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRFbnRpdHlSZWNvcmRzKCd0YXhvbm9teScsIHRheG9ub215LCB7IHBvc3Q6IHBvc3RJZCwgcGVyX3BhZ2U6ICR7Y29uZmlnLm1heEl0ZW1zID8/IC0xfSB9KTtcbiAgICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgICB9LFxuICAgICAgWyR7YXR0ck5hbWV9RW5hYmxlZCwgJHthdHRyTmFtZX1Tb3VyY2UsICR7YXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7YXR0ck5hbWV9IHx8IFtdKV1cbiAgICApO1xuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1BhZ2luYXRpb25Db25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpOiBmdWxsIHVzZVNlbGVjdCByZXNvbHV0aW9uXG4gICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICBjb25zdCByZXNvbHZlZFZhck5hbWUgPSBgcmVzb2x2ZWQke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgY29uc3Qgc291cmNlQXR0ciA9IGAke2F0dHJOYW1lfVNvdXJjZWA7XG4gICAgICBjb25zdCBxdWVyeUFyZ3NBdHRyID0gYCR7YXR0ck5hbWV9UXVlcnlBcmdzYDtcbiAgICAgIGNvbnN0IHBvc3RUeXBlQXR0ciA9IGAke2F0dHJOYW1lfVBvc3RUeXBlYDtcbiAgICAgIGNvbnN0IHNlbGVjdGVkUG9zdHNBdHRyID0gYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2A7XG4gICAgICBjb25zdCBmaWVsZE1hcHBpbmdBdHRyID0gYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYDtcbiAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNBdHRyID0gYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2A7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgJHtyZXNvbHZlZFZhck5hbWV9ID0gdXNlU2VsZWN0KFxuICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgIGNvbnN0IHF1ZXJ5QXJncyA9ICR7cXVlcnlBcmdzQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3QgcG9zdFR5cGUgPSAke3Bvc3RUeXBlQXR0cn0gfHwgJ3Bvc3QnO1xuICAgICAgICAgIGNvbnN0IGFyZ3MgPSB7XG4gICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7Y29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgb3JkZXI6IChxdWVyeUFyZ3Mub3JkZXIgfHwgJ0RFU0MnKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAocXVlcnlBcmdzLnRheF9xdWVyeSAmJiBxdWVyeUFyZ3MudGF4X3F1ZXJ5Lmxlbmd0aCkge1xuICAgICAgICAgICAgcXVlcnlBcmdzLnRheF9xdWVyeS5mb3JFYWNoKCh0cSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIXRxLnRheG9ub215IHx8ICF0cS50ZXJtcyB8fCAhdHEudGVybXMubGVuZ3RoKSByZXR1cm47XG4gICAgICAgICAgICAgIGNvbnN0IHBhcmFtID0gdHEudGF4b25vbXkgPT09ICdjYXRlZ29yeScgPyAnY2F0ZWdvcmllcycgOiB0cS50YXhvbm9teSA9PT0gJ3Bvc3RfdGFnJyA/ICd0YWdzJyA6IHRxLnRheG9ub215O1xuICAgICAgICAgICAgICBhcmdzW3BhcmFtXSA9IHRxLnRlcm1zLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShyZWNvcmRzKSkgcmV0dXJuIFtdO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW107XG4gICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gc2VsZWN0ZWRcbiAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICByZXR1cm4gcmVjID8gbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSkgOiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSxcbiAgICAgIFske3NvdXJjZUF0dHJ9LCAke3Bvc3RUeXBlQXR0cn0sIEpTT04uc3RyaW5naWZ5KCR7cXVlcnlBcmdzQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke3NlbGVjdGVkUG9zdHNBdHRyfSB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fSldXG4gICAgKTtcbiAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7c291cmNlQXR0cn0gIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHthdHRyTmFtZX0gPz8gW10pO1xuICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAvLyBVc2UgcHJldmlldyB2YXJpYWJsZSBpbiB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgSlNYIHNvIHRoZSBlZGl0b3Igc2hvd3MgcXVlcnkvc2VsZWN0IHJlc3VsdHNcbiAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBwcmV2aWV3VmFyTmFtZSk7XG4gICAgfVxuICAgIGlmIChyZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgaXNQcmV2aWV3TG9hZGluZyA9ICR7cmVzb2x2aW5nRmxhZ3Muam9pbignIHx8ICcpfTtcbmA7XG4gICAgfVxuICAgIC8vIFdoZW4gcHJldmlldyBKU1ggcmVmZXJlbmNlcyBwYWdpbmF0aW9uIChmcm9tIEhCUykgYnV0IHBhZ2luYXRpb24gaXMgb25seSBidWlsdCBzZXJ2ZXItc2lkZSxcbiAgICAvLyBkZWZpbmUgaXQgaW4gdGhlIGVkaXQgc28gdGhlIGVkaXRvciBkb2Vzbid0IHRocm93IFJlZmVyZW5jZUVycm9yLlxuICAgIGNvbnN0IHByZXZpZXdVc2VzUGFnaW5hdGlvbiA9IC9cXGJwYWdpbmF0aW9uXFxiLy50ZXN0KHByZXZpZXdKc3gpO1xuICAgIGNvbnN0IGFueUNvbmZpZ0hhc1BhZ2luYXRpb24gPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSAmJiAhIShjIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbilcbiAgICAgIDogZmFsc2U7XG4gICAgaWYgKHByZXZpZXdVc2VzUGFnaW5hdGlvbiAmJiBhbnlDb25maWdIYXNQYWdpbmF0aW9uICYmICFkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZS5pbmNsdWRlcygnY29uc3QgcGFnaW5hdGlvbicpKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSA9IGAgICAgY29uc3QgcGFnaW5hdGlvbiA9IFtdOyAvLyBFZGl0b3I6IHBhZ2luYXRpb24gaXMgYnVpbHQgc2VydmVyLXNpZGUgaW4gcmVuZGVyLnBocFxuYCArIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdXNpbmcgZHluYW1pYyBwb3N0cywgd3JhcCBwcmV2aWV3IGluIGxvYWRpbmcgc3RhdGVcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgcHJldmlld0NvbnRlbnQgPSByZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwXG4gICAgPyBge2lzUHJldmlld0xvYWRpbmcgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCIke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcgaXMtbG9hZGluZ1wiIHN0eWxlPXt7IG1pbkhlaWdodDogJzEyMHB4JywgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBnYXA6ICc4cHgnIH19PlxuICAgICAgICAgICAgPFNwaW5uZXIgLz5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGNvbG9yOiAndmFyKC0td3AtYWRtaW4tdGhlbWUtY29sb3ItZGFya2VyLCAjMWUxZTFlKScgfX0+e19fKCdMb2FkaW5nIHBvc3Rz4oCmJywgJ2hhbmRvZmYnKX08L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICkgOiAoXG4ke3ByZXZpZXdKc3h9XG4gICAgICAgICl9YFxuICAgIDogcHJldmlld0pzeDtcblxuICAvLyBDaGVjayB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgZm9yIGNvbXBvbmVudHMgdGhhdCBuZWVkIHRvIGJlIGltcG9ydGVkXG4gIC8vIFRoaXMgY2F0Y2hlcyBjb21wb25lbnRzIGFkZGVkIGJ5IHRoZSBoYW5kbGViYXJzLXRvLWpzeCB0cmFuc3BpbGVyIChlLmcuLCBmcm9tIHt7I2ZpZWxkfX0gbWFya2VycylcbiAgY29uc3QgcHJldmlld1VzZXNSaWNoVGV4dCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxSaWNoVGV4dCcpO1xuICBjb25zdCBwcmV2aWV3VXNlczEwdXBJbWFnZSA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpO1xuXG4gIC8vIEFkZCBSaWNoVGV4dCB0byBpbXBvcnRzIGlmIHVzZWQgaW4gcHJldmlldyAoYW5kIG5vdCBhbHJlYWR5IGluY2x1ZGVkIGZyb20gcHJvcGVydHkgdHlwZXMpXG4gIGlmICgocHJldmlld1VzZXNSaWNoVGV4dCB8fCBwcmV2aWV3VXNlc0xpbmtGaWVsZCkgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdSaWNoVGV4dCcpO1xuICB9XG5cbiAgLy8gTGlua0NvbnRyb2wgaXMgbmVlZGVkIGZvciBzaWRlYmFyIGxpbmsvYnV0dG9uIHByb3BlcnR5IHBhbmVsczsgYWRkIHVuY29uZGl0aW9uYWxseSB3aGVuIHByZXNlbnQuXG4gIC8vIChIYW5kb2ZmTGlua0ZpZWxkIGluIHRoZSBwcmV2aWV3IGlzIHNlcGFyYXRlIOKAlCBpdCdzIGltcG9ydGVkIGZyb20gdGhlIHNoYXJlZCBjb21wb25lbnQgYW5kIGhhbmRsZXMgaXRzIG93biBMaW5rQ29udHJvbCBpbnRlcm5hbGx5LilcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wpIHtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnTGlua0NvbnRyb2wnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0xpbmtDb250cm9sJyk7XG4gICAgaWYgKCFjb21wb25lbnRJbXBvcnRzLmluY2x1ZGVzKCdQb3BvdmVyJykpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuICB9XG5cbiAgLy8gQWRkIElubmVyQmxvY2tzIGlmIHVzZWQgaW4gcHJldmlldyBidXQgbm90IGFscmVhZHkgaW1wb3J0ZWRcbiAgY29uc3QgcHJldmlld1VzZXNJbm5lckJsb2NrcyA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbm5lckJsb2NrcycpO1xuICBpZiAocHJldmlld1VzZXNJbm5lckJsb2NrcyAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdJbm5lckJsb2NrcycpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgMTB1cCBpbXBvcnQgaWYgbmVlZGVkIChJbWFnZSBmb3IgcHJldmlldywgUmVwZWF0ZXIgZm9yIGFycmF5cylcbiAgaWYgKHByZXZpZXdVc2VzMTB1cEltYWdlKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIH1cbiAgY29uc3QgdGVuVXBJbXBvcnQgPSB0ZW5VcEltcG9ydHMubGVuZ3RoID4gMFxuICAgID8gYGltcG9ydCB7ICR7dGVuVXBJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gQ29sbGVjdCBhbGwgaW1hZ2UgZmllbGRzIGZvciBCbG9ja0NvbnRyb2xzL01lZGlhUmVwbGFjZUZsb3dcbiAgaW50ZXJmYWNlIEltYWdlRmllbGRJbmZvIHtcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGF0dHJQYXRoOiBzdHJpbmc7ICAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQuaW1hZ2UnXG4gICAgdmFsdWVFeHByOiBzdHJpbmc7IC8vIGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdsZWZ0Q2FyZD8uaW1hZ2UnXG4gICAgdXBkYXRlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnc2V0QXR0cmlidXRlcyh7IGJhY2tncm91bmRJbWFnZTogLi4uIH0pJyBvciBuZXN0ZWQgdXBkYXRlXG4gIH1cbiAgXG4gIGNvbnN0IGltYWdlRmllbGRzOiBJbWFnZUZpZWxkSW5mb1tdID0gW107XG4gIFxuICBjb25zdCBjb2xsZWN0SW1hZ2VGaWVsZHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnLCBwYXJlbnRWYWx1ZVBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gcGFyZW50UGF0aCA/IGAke3BhcmVudFBhdGh9LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgY29uc3QgY3VycmVudFZhbHVlUGF0aCA9IHBhcmVudFZhbHVlUGF0aCA/IGAke3BhcmVudFZhbHVlUGF0aH0/LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICAgIGxldCB1cGRhdGVFeHByOiBzdHJpbmc7XG4gICAgICAgIFxuICAgICAgICBpZiAocGFyZW50UGF0aCkge1xuICAgICAgICAgIC8vIE5lc3RlZCBpbWFnZSBmaWVsZCAtIG5lZWQgdG8gc3ByZWFkIHBhcmVudCBvYmplY3RcbiAgICAgICAgICBjb25zdCBwYXJlbnRBdHRyID0gcGFyZW50UGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgIGNvbnN0IHBhcmVudENhbWVsID0gdG9DYW1lbENhc2UocGFyZW50QXR0cik7XG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnRDYW1lbH06IHsgLi4uJHtwYXJlbnRDYW1lbH0sICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSB9KWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVG9wLWxldmVsIGltYWdlIGZpZWxkXG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9KWA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGltYWdlRmllbGRzLnB1c2goe1xuICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgIGF0dHJQYXRoOiBjdXJyZW50UGF0aCxcbiAgICAgICAgICB2YWx1ZUV4cHI6IGN1cnJlbnRWYWx1ZVBhdGgsXG4gICAgICAgICAgdXBkYXRlRXhwclxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29sbGVjdEltYWdlRmllbGRzKHByb3AucHJvcGVydGllcywgY3VycmVudFBhdGgsIGN1cnJlbnRWYWx1ZVBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wZXJ0aWVzKTtcbiAgXG4gIC8vIEdlbmVyYXRlIEJsb2NrQ29udHJvbHMgd2l0aCBNZWRpYVJlcGxhY2VGbG93IGZvciBlYWNoIGltYWdlIGZpZWxkXG4gIGNvbnN0IGJsb2NrQ29udHJvbHNKc3ggPSBpbWFnZUZpZWxkcy5sZW5ndGggPiAwID8gYFxuICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XG4ke2ltYWdlRmllbGRzLm1hcChmaWVsZCA9PiBgICAgICAgICAgIDxNZWRpYVJlcGxhY2VGbG93XG4gICAgICAgICAgICBtZWRpYUlkPXske2ZpZWxkLnZhbHVlRXhwcn0/LmlkfVxuICAgICAgICAgICAgbWVkaWFVcmw9eyR7ZmllbGQudmFsdWVFeHByfT8uc3JjfVxuICAgICAgICAgICAgYWxsb3dlZFR5cGVzPXtbJ2ltYWdlJ119XG4gICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgIG9uU2VsZWN0PXsobWVkaWEpID0+ICR7ZmllbGQudXBkYXRlRXhwcn19XG4gICAgICAgICAgICBuYW1lPXtfXygnJHtmaWVsZC5sYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgIC8+YCkuam9pbignXFxuJyl9XG4gICAgICAgIDwvQmxvY2tDb250cm9scz5gIDogJyc7XG5cbiAgLy8gU2hhcmVkIGNvbXBvbmVudCBpbXBvcnRzIGZvciBkeW5hbWljIGFycmF5cyAoc2VsZWN0b3IgVUkgKyBlZGl0b3IgcHJldmlldyBtYXBwaW5nKVxuICBjb25zdCBzaGFyZWROYW1lZEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChoYXNEeW5hbWljQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnRHluYW1pY1Bvc3RTZWxlY3RvcicsICdtYXBQb3N0RW50aXR5VG9JdGVtJyk7XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAoaGFzVGF4b25vbXlBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGhhc1BhZ2luYXRpb25BcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1BhZ2luYXRpb25TZWxlY3RvcicpO1xuXG4gIGxldCBzaGFyZWRDb21wb25lbnRJbXBvcnQgPSBzaGFyZWROYW1lZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHtzaGFyZWROYW1lZEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICcuLi8uLi9zaGFyZWQnO1xcbmBcbiAgICA6ICcnO1xuICBjb25zdCBuZWVkc0RhdGFTdG9yZSA9IGhhc0R5bmFtaWNBcnJheXMgfHwgaGFzVGF4b25vbXlBcnJheTtcbiAgaWYgKG5lZWRzRGF0YVN0b3JlKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyB1c2VTZWxlY3Qke2hhc0JyZWFkY3J1bWJzQXJyYXkgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuXG4gIC8vIEJ1aWxkIGVsZW1lbnQgaW1wb3J0c1xuICBjb25zdCBlbGVtZW50SW1wb3J0cyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBlbGVtZW50SW1wb3J0cy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcbiAgfVxuXG4gIC8vIEltcG9ydCBzaGFyZWQgSGFuZG9mZkxpbmtGaWVsZCB3aGVuIHByZXZpZXcgdXNlcyBsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBsaW5rRmllbGRJbXBvcnQgPSBwcmV2aWV3VXNlc0xpbmtGaWVsZCA/IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gIDogJyc7XG5cbiAgcmV0dXJuIGBpbXBvcnQgeyByZWdpc3RlckJsb2NrVHlwZSB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2tzJztcbmltcG9ydCB7IFxuICAke2Jsb2NrRWRpdG9ySW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IFxuICAke2NvbXBvbmVudEltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG4ke3RlblVwSW1wb3J0fSR7c2hhcmVkQ29tcG9uZW50SW1wb3J0fWltcG9ydCBtZXRhZGF0YSBmcm9tICcuL2Jsb2NrLmpzb24nO1xuaW1wb3J0ICcuL2VkaXRvci5zY3NzJztcbiR7aGFzRHluYW1pY0FycmF5cyA/IFwiaW1wb3J0ICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9EeW5hbWljUG9zdFNlbGVjdG9yLmVkaXRvci5zY3NzJztcXG5cIiA6ICcnfWltcG9ydCAnLi9zdHlsZS5zY3NzJztcbiR7bGlua0ZpZWxkSW1wb3J0fSR7ZGVwcmVjYXRpb25zQ29kZSA/IGAke2RlcHJlY2F0aW9uc0NvZGV9XFxuXFxuYCA6ICcnfXJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsJHtkZXByZWNhdGlvbnNDb2RlID8gJ1xcbiAgZGVwcmVjYXRlZCwnIDogJyd9XG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke3VzZUlubmVyQmxvY2tzIHx8IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyBcIiAgICBjb25zdCBDT05URU5UX0JMT0NLUyA9IFsnY29yZS9wYXJhZ3JhcGgnLCdjb3JlL2hlYWRpbmcnLCdjb3JlL2xpc3QnLCdjb3JlL2xpc3QtaXRlbScsJ2NvcmUvcXVvdGUnLCdjb3JlL2ltYWdlJywnY29yZS9zZXBhcmF0b3InLCdjb3JlL2h0bWwnLCdjb3JlL2J1dHRvbnMnLCdjb3JlL2J1dHRvbiddO1wiIDogJyd9XG4gICAgY29uc3QgeyAke2F0dHJOYW1lcy5qb2luKCcsICcpfSB9ID0gYXR0cmlidXRlcztcbiR7ZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGV9XG4ke2FycmF5SGVscGVyc31cbiAgICByZXR1cm4gKFxuICAgICAgPEZyYWdtZW50PlxuICAgICAgICA8SW5zcGVjdG9yQ29udHJvbHM+XG4ke3BhbmVscy5qb2luKCdcXG5cXG4nKX1cbiAgICAgICAgPC9JbnNwZWN0b3JDb250cm9scz5cbiR7YmxvY2tDb250cm9sc0pzeH1cblxuICAgICAgICB7LyogRWRpdG9yIFByZXZpZXcgKi99XG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuJHtwcmV2aWV3Q29udGVudH1cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L0ZyYWdtZW50PlxuICAgICk7XG4gIH0sXG4gIHNhdmU6ICgpID0+IHtcbiR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/ICcgICAgLy8gSW5uZXJCbG9ja3MgY29udGVudCBtdXN0IGJlIHNhdmVkIHNvIGl0IGlzIHBlcnNpc3RlZCBpbiBwb3N0IGNvbnRlbnRcXG4gICAgcmV0dXJuIDxJbm5lckJsb2Nrcy5Db250ZW50IC8+OycgOiAnICAgIC8vIFNlcnZlci1zaWRlIHJlbmRlcmluZyB2aWEgcmVuZGVyLnBocFxcbiAgICByZXR1cm4gbnVsbDsnfVxuICB9LFxufSk7XG5gO1xufTtcblxuZXhwb3J0IHsgZ2VuZXJhdGVJbmRleEpzLCB0b1RpdGxlQ2FzZSwgZ2VuZXJhdGVGaWVsZENvbnRyb2wsIGdlbmVyYXRlQXJyYXlDb250cm9sLCBnZW5lcmF0ZVByb3BlcnR5Q29udHJvbCB9O1xuZXhwb3J0IHR5cGUgeyBGaWVsZENvbnRleHQgfTtcbiJdfQ==