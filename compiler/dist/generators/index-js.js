"use strict";
/**
 * Generates index.js for Gutenberg block editor
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePropertyControl = exports.generateArrayControl = exports.generateFieldControl = exports.toTitleCase = exports.generateSvgIcon = exports.generateIndexJs = void 0;
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
 * Deterministic hash of a string to a number in [0, max).
 */
const hashString = (str, max) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return ((h % max) + max) % max;
};
/**
 * Generate an SVG icon element string for use in registerBlockType.
 * Creates a colored rounded rectangle with 1-2 letter initials derived
 * from the block title, with the background color keyed to the group.
 */
const generateSvgIcon = (title, group) => {
    const GROUP_COLORS = [
        '#5B21B6', '#0E7490', '#B45309', '#047857',
        '#BE123C', '#4338CA', '#0369A1', '#A16207',
        '#15803D', '#9333EA', '#C2410C', '#1D4ED8',
        '#059669', '#7C3AED', '#DC2626', '#2563EB',
    ];
    const words = title.split(/[\s_-]+/).filter(Boolean);
    const initials = words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : (words[0]?.substring(0, 2) || 'HO').toUpperCase();
    const color = GROUP_COLORS[hashString(group || title, GROUP_COLORS.length)];
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="${color}" />
      <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="10" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" fontWeight="600">${initials}</text>
    </svg>`;
};
exports.generateSvgIcon = generateSvgIcon;
/**
 * Generate complete index.js file
 * @param component - The Handoff component data
 * @param dynamicArrayConfigs - Optional dynamic array configurations keyed by field name
 * @param innerBlocksField - The richtext field that uses InnerBlocks, or null if none
 * @param deprecationsCode - Optional deprecation migration code
 * @param hasScreenshot - Whether a screenshot.png is available for inserter preview
 */
const generateIndexJs = (component, dynamicArrayConfigs, innerBlocksField, deprecationsCode, hasScreenshot) => {
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
    // (e.g. body -> blockBody so JSX has a defined variable and no ReferenceError).
    // Skip the innerBlocksField — its content is stored via InnerBlocks, not as an attribute.
    const innerBlocksAttrName = innerBlocksField ? (0, handlebars_to_jsx_1.toCamelCase)(innerBlocksField) : null;
    for (const name of (0, utils_1.getTemplateReferencedAttributeNames)(component.code)) {
        if (!attrNames.includes(name) && name !== innerBlocksAttrName)
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
    // Determine which components we need to import
    const needsMediaUpload = hasPropertyType('image');
    const needsRangeControl = hasPropertyType('number');
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
    // Screenshot import for inserter preview
    const screenshotImport = hasScreenshot ? `import screenshotUrl from './screenshot.png';\n` : '';
    // SVG icon for the block (unique per block, colored by group)
    const svgIconStr = generateSvgIcon(component.title, component.group);
    const svgIconCode = `const blockIcon = (
  ${svgIconStr}
);`;
    // Inserter preview: show screenshot image instead of live-rendering
    const previewEarlyReturn = hasScreenshot
        ? `    if (attributes.__preview) {
      return (
        <div {...blockProps}>
          <img src={screenshotUrl} alt={metadata.title} style={{ width: '100%', height: 'auto' }} />
        </div>
      );
    }
`
        : '';
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
${screenshotImport}${linkFieldImport}
${svgIconCode}

${deprecationsCode ? `${deprecationsCode}\n\n` : ''}registerBlockType(metadata.name, {
  ...metadata,
  icon: blockIcon,${deprecationsCode ? '\n  deprecated,' : ''}
  edit: ({ attributes, setAttributes, isSelected }) => {
    const blockProps = useBlockProps();
${previewEarlyReturn}${useInnerBlocks || previewUsesInnerBlocks ? "    const CONTENT_BLOCKS = ['core/paragraph','core/heading','core/list','core/list-item','core/quote','core/image','core/separator','core/html','core/buttons','core/button'];" : ''}
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBMm9DeUMsa0NBQVc7QUE3bkN0RDs7R0FFRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsUUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsT0FBcUIsRUFDYixFQUFFO0lBQ1YsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQzNELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXJELFFBQVEsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLEtBQUssTUFBTTtZQUNULE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU0sZ0JBQWdCLEtBQUs7RUFDM0IsTUFBTSxZQUFZLGFBQWE7RUFDL0IsTUFBTSwwQkFBMEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUN4RCxNQUFNLElBQUksQ0FBQztRQUVULEtBQUssVUFBVTtZQUNiLHNFQUFzRTtZQUN0RSxPQUFPLEVBQUUsQ0FB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Q2xCLFVBQVU7R0FDWCxDQUFDO0lBRUYsb0VBQW9FO0lBQ3BFLE1BQU0sa0JBQWtCLEdBQUcsYUFBYTtRQUN0QyxDQUFDLENBQUM7Ozs7Ozs7Q0FPTDtRQUNHLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFUCxPQUFPOztJQUVMLGtCQUFrQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7OztJQUdoQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDOzs7V0FHdkIsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDbEMsV0FBVyxHQUFHLHFCQUFxQjs7RUFFbkMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLHFFQUFxRSxDQUFDLENBQUMsQ0FBQyxFQUFFO0VBQzdGLGdCQUFnQixHQUFHLGVBQWU7RUFDbEMsV0FBVzs7RUFFWCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFOztvQkFFL0IsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFOzs7RUFHM0Qsa0JBQWtCLEdBQUcsY0FBYyxJQUFJLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxnTEFBZ0wsQ0FBQyxDQUFDLENBQUMsRUFBRTtjQUN6TyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztFQUNoQywwQkFBMEI7RUFDMUIsWUFBWTs7OztFQUlaLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDOztFQUVuQixnQkFBZ0I7Ozs7RUFJaEIsY0FBYzs7Ozs7O0VBTWQsY0FBYyxJQUFJLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxrSEFBa0gsQ0FBQyxDQUFDLENBQUMsK0RBQStEOzs7Q0FHaE8sQ0FBQztBQUNGLENBQUMsQ0FBQztBQUVPLDBDQUFlIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBHZW5lcmF0ZXMgaW5kZXguanMgZm9yIEd1dGVuYmVyZyBibG9jayBlZGl0b3JcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHksIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZywgaXNCcmVhZGNydW1ic0NvbmZpZywgaXNUYXhvbm9teUNvbmZpZywgaXNQYWdpbmF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdG9CbG9ja05hbWUgfSBmcm9tICcuL2Jsb2NrLWpzb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVKc3hQcmV2aWV3LCB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuaW1wb3J0IHsgbm9ybWFsaXplU2VsZWN0T3B0aW9ucywgZ2V0VGVtcGxhdGVSZWZlcmVuY2VkQXR0cmlidXRlTmFtZXMgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4L3V0aWxzJztcbmltcG9ydCB7IGJ1aWxkUmVzaGFwZUpzIH0gZnJvbSAnLi9yZW5kZXItcGhwJztcblxuLyoqXG4gKiBDb252ZXJ0IHNuYWtlX2Nhc2UgdG8gVGl0bGUgQ2FzZVxuICovXG5jb25zdCB0b1RpdGxlQ2FzZSA9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBzdHJcbiAgICAuc3BsaXQoJ18nKVxuICAgIC5tYXAod29yZCA9PiB3b3JkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgd29yZC5zbGljZSgxKSlcbiAgICAuam9pbignICcpO1xufTtcblxuLyoqXG4gKiBDb250ZXh0IGZvciBnZW5lcmF0aW5nIGZpZWxkIGNvbnRyb2xzIC0gZGV0ZXJtaW5lcyBob3cgdmFsdWVzIGFyZSBhY2Nlc3NlZCBhbmQgdXBkYXRlZFxuICovXG5pbnRlcmZhY2UgRmllbGRDb250ZXh0IHtcbiAgLyoqIFRoZSB2YXJpYWJsZSBuYW1lIGZvciBhY2Nlc3NpbmcgdGhlIHZhbHVlIChlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnaXRlbS5pbWFnZScpICovXG4gIHZhbHVlQWNjZXNzb3I6IHN0cmluZztcbiAgLyoqIFRoZSBvbkNoYW5nZSBoYW5kbGVyIGNvZGUgKGUuZy4sICdzZXRBdHRyaWJ1dGVzKHsgeDogdmFsdWUgfSknIG9yICd1cGRhdGVJdGVtcyhpbmRleCwgXCJ4XCIsIHZhbHVlKScpICovXG4gIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgLyoqIEJhc2UgaW5kZW50YXRpb24gKi9cbiAgaW5kZW50OiBzdHJpbmc7XG59XG5cbi8qKlxuICogR2VuZXJhdGUgYSBmaWVsZCBjb250cm9sIGZvciBhbnkgcHJvcGVydHkgdHlwZSAtIHVuaWZpZWQgZnVuY3Rpb24gZm9yIGJvdGggdG9wLWxldmVsIGFuZCBuZXN0ZWQgZmllbGRzXG4gKi9cbmNvbnN0IGdlbmVyYXRlRmllbGRDb250cm9sID0gKFxuICBmaWVsZEtleTogc3RyaW5nLFxuICBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LFxuICBjb250ZXh0OiBGaWVsZENvbnRleHRcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHsgdmFsdWVBY2Nlc3Nvciwgb25DaGFuZ2VIYW5kbGVyLCBpbmRlbnQgfSA9IGNvbnRleHQ7XG4gIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShmaWVsZEtleSk7XG5cbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ3JpY2h0ZXh0JzpcbiAgICAgIC8vIHJpY2h0ZXh0IHVzZXMgSW5uZXJCbG9ja3Mgb24gdGhlIGNhbnZhcyDigJMgbm8gc2lkZWJhciBjb250cm9sIG5lZWRlZFxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFJhbmdlQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgMH1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICBtaW49ezB9XG4ke2luZGVudH0gIG1heD17MTAwfVxuJHtpbmRlbnR9Lz5gO1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUb2dnbGVDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9IHx8IGZhbHNlfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG5cbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICAvLyBVc2UgJ3NyYycgaW5zdGVhZCBvZiAndXJsJyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nIGNvbnZlbnRpb25cbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PE1lZGlhVXBsb2FkQ2hlY2s+XG4ke2luZGVudH0gIDxNZWRpYVVwbG9hZFxuJHtpbmRlbnR9ICAgIG9uU2VsZWN0PXsobWVkaWEpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd7IHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCBcXCdcXCcgfScpfX1cbiR7aW5kZW50fSAgICBhbGxvd2VkVHlwZXM9e1snaW1hZ2UnXX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8uc3JjfVxuJHtpbmRlbnR9ICAgIHJlbmRlcj17KHsgb3BlbiB9KSA9PiAoXG4ke2luZGVudH0gICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtpbmRlbnR9ICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L3NwYW4+XG4ke2luZGVudH0gICAgICAgIHske3ZhbHVlQWNjZXNzb3J9Py5zcmMgJiYgKFxuJHtpbmRlbnR9ICAgICAgICAgIDxpbWcgXG4ke2luZGVudH0gICAgICAgICAgICBzcmM9eyR7dmFsdWVBY2Nlc3Nvcn0uc3JjfSBcbiR7aW5kZW50fSAgICAgICAgICAgIGFsdD17JHt2YWx1ZUFjY2Vzc29yfS5hbHR9XG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17eyBtYXhXaWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fVxuJHtpbmRlbnR9ICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICl9XG4ke2luZGVudH0gICAgICAgIDxCdXR0b24gb25DbGljaz17b3Blbn0gdmFyaWFudD1cInNlY29uZGFyeVwiIHNpemU9XCJzbWFsbFwiPlxuJHtpbmRlbnR9ICAgICAgICAgIHske3ZhbHVlQWNjZXNzb3J9Py5zcmMgPyBfXygnUmVwbGFjZSAke2xhYmVsfScsICdoYW5kb2ZmJykgOiBfXygnU2VsZWN0ICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgICAgIHske3ZhbHVlQWNjZXNzb3J9Py5zcmMgJiYgKFxuJHtpbmRlbnR9ICAgICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd7IHNyYzogXFwnXFwnLCBhbHQ6IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgdmFyaWFudD1cImxpbmtcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7X18oJ1JlbW92ZScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgICAgICl9XG4ke2luZGVudH0gICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgKX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvTWVkaWFVcGxvYWRDaGVjaz5gO1xuXG4gICAgY2FzZSAnbGluayc6XG4gICAgICAvLyBGb3IgbGlua3MsIHVzZSBMaW5rQ29udHJvbCB3aGljaCBwcm92aWRlcyBpbnRlcm5hbCBwYWdlIHNlYXJjaCBhbmQgVVJMIHZhbGlkYXRpb25cbiAgICAgIGNvbnN0IGxpbmtIYW5kbGVyID0gb25DaGFuZ2VIYW5kbGVyKGB7IFxuICAgICAgICAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBcbiAgICAgICAgdXJsOiB2YWx1ZS51cmwgfHwgJycsIFxuICAgICAgICBsYWJlbDogdmFsdWUudGl0bGUgfHwgJHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJycsXG4gICAgICAgIG9wZW5zSW5OZXdUYWI6IHZhbHVlLm9wZW5zSW5OZXdUYWIgfHwgZmFsc2VcbiAgICAgIH1gKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdMaW5rIFRleHQnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGhpZGVMYWJlbEZyb21WaXNpb249e3RydWV9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIGxhYmVsOiB2YWx1ZSB9YCl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogJzhweCcgfX0+XG4ke2luZGVudH0gICAgPExpbmtDb250cm9sXG4ke2luZGVudH0gICAgICB2YWx1ZT17eyBcbiR7aW5kZW50fSAgICAgICAgdXJsOiAke3ZhbHVlQWNjZXNzb3J9Py51cmwgfHwgJycsIFxuJHtpbmRlbnR9ICAgICAgICB0aXRsZTogJHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJycsXG4ke2luZGVudH0gICAgICAgIG9wZW5zSW5OZXdUYWI6ICR7dmFsdWVBY2Nlc3Nvcn0/Lm9wZW5zSW5OZXdUYWIgfHwgZmFsc2VcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke2xpbmtIYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fTwvZGl2PmA7XG5cbiAgICBjYXNlICdidXR0b24nOlxuICAgICAgLy8gRm9yIGJ1dHRvbnMsIHByb3ZpZGUgbGFiZWwgZmllbGQgYW5kIGhyZWYgZmllbGQgd2l0aCBsaW5rIHBpY2tlclxuICAgICAgLy8gQnV0dG9uIHByb3BlcnRpZXM6IGxhYmVsLCBocmVmLCB0YXJnZXQsIHJlbCwgZGlzYWJsZWRcbiAgICAgIGNvbnN0IGJ1dHRvbkhhbmRsZXIgPSBvbkNoYW5nZUhhbmRsZXIoYHsgXG4gICAgICAgIC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIFxuICAgICAgICBocmVmOiB2YWx1ZS51cmwgfHwgJyMnLCBcbiAgICAgICAgdGFyZ2V0OiB2YWx1ZS5vcGVuc0luTmV3VGFiID8gJ19ibGFuaycgOiAnJyxcbiAgICAgICAgcmVsOiB2YWx1ZS5vcGVuc0luTmV3VGFiID8gJ25vb3BlbmVyIG5vcmVmZXJyZXInIDogJydcbiAgICAgIH1gKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdCdXR0b24gTGFiZWwnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGhpZGVMYWJlbEZyb21WaXNpb249e3RydWV9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIGxhYmVsOiB2YWx1ZSB9YCl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogJzhweCcgfX0+XG4ke2luZGVudH0gICAgPExpbmtDb250cm9sXG4ke2luZGVudH0gICAgICB2YWx1ZT17eyBcbiR7aW5kZW50fSAgICAgICAgdXJsOiAke3ZhbHVlQWNjZXNzb3J9Py5ocmVmIHx8ICcjJywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiR7aW5kZW50fSAgICAgICAgb3BlbnNJbk5ld1RhYjogJHt2YWx1ZUFjY2Vzc29yfT8udGFyZ2V0ID09PSAnX2JsYW5rJ1xuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7YnV0dG9uSGFuZGxlcn19XG4ke2luZGVudH0gICAgICBzZXR0aW5ncz17W1xuJHtpbmRlbnR9ICAgICAgICB7IGlkOiAnb3BlbnNJbk5ld1RhYicsIHRpdGxlOiBfXygnT3BlbiBpbiBuZXcgdGFiJywgJ2hhbmRvZmYnKSB9XG4ke2luZGVudH0gICAgICBdfVxuJHtpbmRlbnR9ICAgICAgc2hvd1N1Z2dlc3Rpb25zPXt0cnVlfVxuJHtpbmRlbnR9ICAgICAgc3VnZ2VzdGlvbnNRdWVyeT17eyB0eXBlOiAncG9zdCcsIHN1YnR5cGU6ICdhbnknIH19XG4ke2luZGVudH0gICAgLz5cbiR7aW5kZW50fSAgPC9kaXY+XG4ke2luZGVudH0gIDxUb2dnbGVDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdEaXNhYmxlZCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgY2hlY2tlZD17JHt2YWx1ZUFjY2Vzc29yfT8uZGlzYWJsZWQgfHwgZmFsc2V9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgZGlzYWJsZWQ6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH08L2Rpdj5gO1xuXG4gICAgY2FzZSAnc2VsZWN0Jzoge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMocHJvcGVydHkub3B0aW9ucykubWFwKG9wdCA9PlxuICAgICAgICBgeyBsYWJlbDogJyR7b3B0LmxhYmVsLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCB2YWx1ZTogJyR7b3B0LnZhbHVlfScgfWBcbiAgICAgICkuam9pbignLCAnKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFNlbGVjdENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvcHRpb25zPXtbJHtvcHRpb25zfV19XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdhcnJheSc6XG4gICAgICAvLyBIYW5kbGUgc2ltcGxlIHN0cmluZyBhcnJheXMgd2l0aCBhIHJlcGVhdGFibGUgbGlzdCBjb250cm9sXG4gICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgc2ltcGxlIHR5cGUgYXJyYXkgKHN0cmluZywgbnVtYmVyLCBldGMuKSB2cyBvYmplY3QgYXJyYXlcbiAgICAgIGNvbnN0IGl0ZW1UeXBlID0gcHJvcGVydHkuaXRlbXM/LnR5cGU7XG4gICAgICBpZiAoIXByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzICYmIChpdGVtVHlwZSA9PT0gJ3N0cmluZycgfHwgIWl0ZW1UeXBlKSkge1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIGxpc3QgY29udHJvbCBmb3Igc3RyaW5nIGFycmF5c1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2luZGVudH0gICAgeygke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5tYXAoKGxpc3RJdGVtLCBsaXN0SW5kZXgpID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGtleT17bGlzdEluZGV4fSBnYXA9ezJ9IGFsaWduPVwiY2VudGVyXCI+XG4ke2luZGVudH0gICAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSB9fT5cbiR7aW5kZW50fSAgICAgICAgICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICAgICAgICAgIHZhbHVlPXtsaXN0SXRlbSB8fCAnJ31cbiR7aW5kZW50fSAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBuZXdMaXN0W2xpc3RJbmRleF0gPSB2YWx1ZTtcbiR7aW5kZW50fSAgICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciBpdGVtLi4uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy11cC1hbHQyXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ01vdmUgdXAnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPT09IDApIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pXTtcbiR7aW5kZW50fSAgICAgICAgICAgIFtuZXdMaXN0W2xpc3RJbmRleF0sIG5ld0xpc3RbbGlzdEluZGV4IC0gMV1dID0gW25ld0xpc3RbbGlzdEluZGV4IC0gMV0sIG5ld0xpc3RbbGlzdEluZGV4XV07XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGRpc2FibGVkPXtsaXN0SW5kZXggPT09IDB9XG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy1kb3duLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSBkb3duJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBsaXN0ID0gJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXTtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPj0gbGlzdC5sZW5ndGggLSAxKSByZXR1cm47XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLmxpc3RdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggKyAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggKyAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA+PSAoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkubGVuZ3RoIC0gMX1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cInRyYXNoXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ1JlbW92ZScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5maWx0ZXIoKF8sIGkpID0+IGkgIT09IGxpc3RJbmRleCk7XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICkpfVxuJHtpbmRlbnR9ICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSksICcnXTtcbiR7aW5kZW50fSAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgPlxuJHtpbmRlbnR9ICAgICAge19fKCdBZGQgSXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgPC9CdXR0b24+XG4ke2luZGVudH0gIDwvRmxleD5cbiR7aW5kZW50fTwvZGl2PmA7XG4gICAgICB9XG4gICAgICAvLyBGb3Igb2JqZWN0IGFycmF5cywgZmFsbCB0aHJvdWdoIHRvIGRlZmF1bHQgKHRoZXNlIHNob3VsZCBiZSBoYW5kbGVkIGJ5IGdlbmVyYXRlQXJyYXlDb250cm9sIGF0IHRvcCBsZXZlbClcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAocHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWRDb250cm9scyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnR5LnByb3BlcnRpZXMpXG4gICAgICAgICAgLm1hcCgoW25lc3RlZEtleSwgbmVzdGVkUHJvcF0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYCR7dmFsdWVBY2Nlc3Nvcn0/LiR7bmVzdGVkS2V5fWAsXG4gICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gb25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sICR7bmVzdGVkS2V5fTogJHt2YWx9IH1gKSxcbiAgICAgICAgICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKG5lc3RlZEtleSwgbmVzdGVkUHJvcCwgbmVzdGVkQ29udGV4dCk7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7bmVzdGVkQ29udHJvbHN9XG4ke2luZGVudH08L0ZsZXg+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhcnJheSAocmVwZWF0ZXIpIGNvbnRyb2wgdXNpbmcgMTB1cCBSZXBlYXRlciBjb21wb25lbnRcbiAqIFByb3ZpZGVzIGRyYWctYW5kLWRyb3AgcmVvcmRlcmluZyBhbmQgYnVpbHQtaW4gYWRkL3JlbW92ZSBmdW5jdGlvbmFsaXR5XG4gKi9cbmNvbnN0IGdlbmVyYXRlQXJyYXlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBhdHRyTmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuXG4gIC8vIEdlbmVyYXRlIGZpZWxkIGNvbnRyb2xzIHRoYXQgdXNlIHNldEl0ZW0gZnJvbSB0aGUgUmVwZWF0ZXIgcmVuZGVyIHByb3BcbiAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICBjb25zdCBmaWVsZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbHVlfSB9KWAsXG4gICAgICBpbmRlbnQ6IGluZGVudCArICcgICAgICAnXG4gICAgfTtcbiAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgZmllbGRDb250ZXh0KTtcbiAgfSkuam9pbignXFxuJyk7XG5cbiAgLy8gR2V0IGEgZGlzcGxheSB0aXRsZSBmcm9tIHRoZSBmaXJzdCB0ZXh0IGZpZWxkIGlmIGF2YWlsYWJsZSwgZmFsbGJhY2sgdG8gZmllbGQgbGFiZWxcbiAgY29uc3QgZmlyc3RUZXh0RmllbGQgPSBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLmZpbmQoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICd0ZXh0Jyk7XG4gIGNvbnN0IHRpdGxlQWNjZXNzb3IgPSBmaXJzdFRleHRGaWVsZCA/IGBpdGVtLiR7Zmlyc3RUZXh0RmllbGRbMF19IHx8IGAgOiAnJztcbiAgXG4gIC8vIEN1c3RvbSBhZGQgYnV0dG9uIHdpdGggdGVydGlhcnkgc3R5bGluZywgcGx1cyBpY29uLCByaWdodCBhbGlnbmVkXG4gIC8vIGFkZEJ1dHRvbiBpcyBhIGZ1bmN0aW9uIHRoYXQgcmVjZWl2ZXMgYWRkSXRlbSBhbmQgcmV0dXJucyBhIFJlYWN0IGVsZW1lbnRcbiAgY29uc3QgYWRkQnV0dG9uSnN4ID0gYChhZGRJdGVtKSA9PiAoXG4ke2luZGVudH0gICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1hZGQtYnV0dG9uLXdyYXBwZXJcIj5cbiR7aW5kZW50fSAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgICAgb25DbGljaz17YWRkSXRlbX1cbiR7aW5kZW50fSAgICAgICAgaWNvbj17XG4ke2luZGVudH0gICAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj5cbiR7aW5kZW50fSAgICAgICAgICAgIDxwYXRoIGQ9XCJNMTEgMTIuNVYxNy41SDEyLjVWMTIuNUgxNy41VjExSDEyLjVWNkgxMVYxMUg2VjEyLjVIMTFaXCIvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3ZnPlxuJHtpbmRlbnR9ICAgICAgICB9XG4ke2luZGVudH0gICAgICAgIGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b25cIlxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICB7X18oJ0FkZCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICA8L2Rpdj5cbiR7aW5kZW50fSAgKWA7XG5cbiAgcmV0dXJuIGAke2luZGVudH08UmVwZWF0ZXIgXG4ke2luZGVudH0gIGF0dHJpYnV0ZT1cIiR7YXR0ck5hbWV9XCIgXG4ke2luZGVudH0gIGFsbG93UmVvcmRlcmluZz17dHJ1ZX0gXG4ke2luZGVudH0gIGRlZmF1bHRWYWx1ZT17e319XG4ke2luZGVudH0gIGFkZEJ1dHRvbj17JHthZGRCdXR0b25Kc3h9fVxuJHtpbmRlbnR9PlxuJHtpbmRlbnR9ICB7KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4ke2luZGVudH0gICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtXCI+XG4ke2luZGVudH0gICAgICA8ZGV0YWlscyBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19jb2xsYXBzZVwiPlxuJHtpbmRlbnR9ICAgICAgICA8c3VtbWFyeSBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19oZWFkZXJcIj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX190aXRsZVwiPnske3RpdGxlQWNjZXNzb3J9JyR7bGFiZWx9J308L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fYWN0aW9uc1wiIG9uQ2xpY2s9eyhlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpfT5cbiR7aW5kZW50fSAgICAgICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICAgICAgb25DbGljaz17cmVtb3ZlSXRlbX1cbiR7aW5kZW50fSAgICAgICAgICAgICAgaWNvbj17XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9XCJNNSA2LjVWMThhMiAyIDAgMDAyIDJoMTBhMiAyIDAgMDAyLTJWNi41aC0yLjVWMThhLjUuNSAwIDAxLS41LjVIOGEuNS41IDAgMDEtLjUtLjVWNi41SDV6TTkgOXY4aDEuNVY5SDl6bTQuNSAwdjhIMTVWOWgtMS41elwiLz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9XCJNMjAgNWgtNVYzLjVBMS41IDEuNSAwIDAwMTMuNSAyaC0zQTEuNSAxLjUgMCAwMDkgMy41VjVINHYxLjVoMTZWNXptLTYuNSAwaC0zVjMuNWgzVjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIDwvc3ZnPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9XG4ke2luZGVudH0gICAgICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlIGl0ZW0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgPC9zdW1tYXJ5PlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2ZpZWxkc1wiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2l0ZW1GaWVsZHN9XG4ke2luZGVudH0gICAgICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGV0YWlscz5cbiR7aW5kZW50fSAgICA8L2Rpdj5cbiR7aW5kZW50fSAgKX1cbiR7aW5kZW50fTwvUmVwZWF0ZXI+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIGluc3BlY3RvciBjb250cm9sIGZvciBhIHRvcC1sZXZlbCBwcm9wZXJ0eVxuICogVXNlcyBnZW5lcmF0ZUZpZWxkQ29udHJvbCB3aXRoIGEgc2V0QXR0cmlidXRlcyBjb250ZXh0XG4gKi9cbmNvbnN0IGdlbmVyYXRlUHJvcGVydHlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBpbmRlbnQ6IHN0cmluZyA9ICcgICAgICAgICAgJyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG5cbiAgLy8gRm9yIGFycmF5IHR5cGUsIHVzZSB0aGUgc3BlY2lhbGl6ZWQgYXJyYXkgY29udHJvbFxuICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgIHJldHVybiBnZW5lcmF0ZUFycmF5Q29udHJvbChrZXksIHByb3BlcnR5LCBhdHRyTmFtZSwgbGFiZWwsIGluZGVudCk7XG4gIH1cblxuICAvLyBGb3IgYWxsIG90aGVyIHR5cGVzLCB1c2UgdGhlIHVuaWZpZWQgZmllbGQgY29udHJvbCBnZW5lcmF0b3JcbiAgY29uc3QgY29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgIHZhbHVlQWNjZXNzb3I6IGF0dHJOYW1lLFxuICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlKSA9PiBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiAke3ZhbHVlfSB9KWAsXG4gICAgaW5kZW50XG4gIH07XG5cbiAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGtleSwgcHJvcGVydHksIGNvbnRleHQpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5IHR5cGVcbiAqL1xuY29uc3QgZ2V0RGVmYXVsdFZhbHVlID0gKGZpZWxkUHJvcDogSGFuZG9mZlByb3BlcnR5KTogYW55ID0+IHtcbiAgc3dpdGNoIChmaWVsZFByb3AudHlwZSkge1xuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgcmV0dXJuIHsgbGFiZWw6ICcnLCB1cmw6ICcnLCBvcGVuc0luTmV3VGFiOiBmYWxzZSB9O1xuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIGhyZWY6ICcjJywgdGFyZ2V0OiAnJywgcmVsOiAnJywgZGlzYWJsZWQ6IGZhbHNlIH07XG4gICAgY2FzZSAnaW1hZ2UnOlxuICAgICAgcmV0dXJuIHsgc3JjOiAnJywgYWx0OiAnJyB9O1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoZmllbGRQcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW25lc3RlZEtleSwgbmVzdGVkUHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRQcm9wLnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgbmVzdGVkW25lc3RlZEtleV0gPSBnZXREZWZhdWx0VmFsdWUobmVzdGVkUHJvcCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5lc3RlZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7fTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIDA7XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIFtdO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgaGVscGVyIGZ1bmN0aW9ucyBmb3IgYXJyYXkgcHJvcGVydGllc1xuICogTm90ZTogV2l0aCB0aGUgMTB1cCBSZXBlYXRlciBjb21wb25lbnQsIHdlIG5vIGxvbmdlciBuZWVkIGN1c3RvbSBhZGQvdXBkYXRlL3JlbW92ZS9tb3ZlIGZ1bmN0aW9uc1xuICogVGhlIFJlcGVhdGVyIGhhbmRsZXMgYWxsIG9mIHRoaXMgaW50ZXJuYWxseSB2aWEgaXRzIHJlbmRlciBwcm9wXG4gKi9cbmNvbnN0IGdlbmVyYXRlQXJyYXlIZWxwZXJzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBzdHJpbmcgPT4ge1xuICAvLyBUaGUgMTB1cCBSZXBlYXRlciBjb21wb25lbnQgaGFuZGxlcyBhcnJheSBtYW5pcHVsYXRpb24gaW50ZXJuYWxseVxuICAvLyBObyBjdXN0b20gaGVscGVyIGZ1bmN0aW9ucyBhcmUgbmVlZGVkXG4gIHJldHVybiAnJztcbn07XG5cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIGhhc2ggb2YgYSBzdHJpbmcgdG8gYSBudW1iZXIgaW4gWzAsIG1heCkuXG4gKi9cbmNvbnN0IGhhc2hTdHJpbmcgPSAoc3RyOiBzdHJpbmcsIG1heDogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgbGV0IGggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGggPSAoKGggPDwgNSkgLSBoICsgc3RyLmNoYXJDb2RlQXQoaSkpIHwgMDtcbiAgfVxuICByZXR1cm4gKChoICUgbWF4KSArIG1heCkgJSBtYXg7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFuIFNWRyBpY29uIGVsZW1lbnQgc3RyaW5nIGZvciB1c2UgaW4gcmVnaXN0ZXJCbG9ja1R5cGUuXG4gKiBDcmVhdGVzIGEgY29sb3JlZCByb3VuZGVkIHJlY3RhbmdsZSB3aXRoIDEtMiBsZXR0ZXIgaW5pdGlhbHMgZGVyaXZlZFxuICogZnJvbSB0aGUgYmxvY2sgdGl0bGUsIHdpdGggdGhlIGJhY2tncm91bmQgY29sb3Iga2V5ZWQgdG8gdGhlIGdyb3VwLlxuICovXG5jb25zdCBnZW5lcmF0ZVN2Z0ljb24gPSAodGl0bGU6IHN0cmluZywgZ3JvdXA6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IEdST1VQX0NPTE9SUyA9IFtcbiAgICAnIzVCMjFCNicsICcjMEU3NDkwJywgJyNCNDUzMDknLCAnIzA0Nzg1NycsXG4gICAgJyNCRTEyM0MnLCAnIzQzMzhDQScsICcjMDM2OUExJywgJyNBMTYyMDcnLFxuICAgICcjMTU4MDNEJywgJyM5MzMzRUEnLCAnI0MyNDEwQycsICcjMUQ0RUQ4JyxcbiAgICAnIzA1OTY2OScsICcjN0MzQUVEJywgJyNEQzI2MjYnLCAnIzI1NjNFQicsXG4gIF07XG5cbiAgY29uc3Qgd29yZHMgPSB0aXRsZS5zcGxpdCgvW1xcc18tXSsvKS5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IGluaXRpYWxzID0gd29yZHMubGVuZ3RoID49IDJcbiAgICA/ICh3b3Jkc1swXVswXSArIHdvcmRzWzFdWzBdKS50b1VwcGVyQ2FzZSgpXG4gICAgOiAod29yZHNbMF0/LnN1YnN0cmluZygwLCAyKSB8fCAnSE8nKS50b1VwcGVyQ2FzZSgpO1xuXG4gIGNvbnN0IGNvbG9yID0gR1JPVVBfQ09MT1JTW2hhc2hTdHJpbmcoZ3JvdXAgfHwgdGl0bGUsIEdST1VQX0NPTE9SUy5sZW5ndGgpXTtcblxuICByZXR1cm4gYDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj5cbiAgICAgIDxyZWN0IHg9XCIyXCIgeT1cIjJcIiB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiByeD1cIjRcIiBmaWxsPVwiJHtjb2xvcn1cIiAvPlxuICAgICAgPHRleHQgeD1cIjEyXCIgeT1cIjE2LjVcIiB0ZXh0QW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIndoaXRlXCIgZm9udFNpemU9XCIxMFwiIGZvbnRGYW1pbHk9XCItYXBwbGUtc3lzdGVtLEJsaW5rTWFjU3lzdGVtRm9udCxzYW5zLXNlcmlmXCIgZm9udFdlaWdodD1cIjYwMFwiPiR7aW5pdGlhbHN9PC90ZXh0PlxuICAgIDwvc3ZnPmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIGluZGV4LmpzIGZpbGVcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGR5bmFtaWNBcnJheUNvbmZpZ3MgLSBPcHRpb25hbCBkeW5hbWljIGFycmF5IGNvbmZpZ3VyYXRpb25zIGtleWVkIGJ5IGZpZWxkIG5hbWVcbiAqIEBwYXJhbSBpbm5lckJsb2Nrc0ZpZWxkIC0gVGhlIHJpY2h0ZXh0IGZpZWxkIHRoYXQgdXNlcyBJbm5lckJsb2Nrcywgb3IgbnVsbCBpZiBub25lXG4gKiBAcGFyYW0gZGVwcmVjYXRpb25zQ29kZSAtIE9wdGlvbmFsIGRlcHJlY2F0aW9uIG1pZ3JhdGlvbiBjb2RlXG4gKiBAcGFyYW0gaGFzU2NyZWVuc2hvdCAtIFdoZXRoZXIgYSBzY3JlZW5zaG90LnBuZyBpcyBhdmFpbGFibGUgZm9yIGluc2VydGVyIHByZXZpZXdcbiAqL1xuY29uc3QgZ2VuZXJhdGVJbmRleEpzID0gKFxuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsXG4gIGR5bmFtaWNBcnJheUNvbmZpZ3M/OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4sXG4gIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsLFxuICBkZXByZWNhdGlvbnNDb2RlPzogc3RyaW5nLFxuICBoYXNTY3JlZW5zaG90PzogYm9vbGVhblxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50LmlkKTtcbiAgY29uc3QgcHJvcGVydGllcyA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzO1xuXG4gIC8vIGhhc0R5bmFtaWNBcnJheXMgaXMgdHJ1ZSBvbmx5IHdoZW4gdGhlcmUgYXJlIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGZpZWxkcyDigJRcbiAgLy8gdGhlIHNpbXBsZXIgdHlwZXMgKGJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24pIGRvbid0IG5lZWQgRHluYW1pY1Bvc3RTZWxlY3Rvci5cbiAgY29uc3QgaGFzRHluYW1pY0FycmF5cyA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZShcbiAgICAgICAgKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYylcbiAgICAgIClcbiAgICA6IGZhbHNlO1xuXG4gIC8vIEhlbHBlciB0byBjaGVjayBmb3IgYSB0eXBlIGluIHByb3BlcnRpZXMsIGluY2x1ZGluZyBuZXN0ZWQgaW4gYXJyYXlzL29iamVjdHNcbiAgY29uc3QgaGFzUHJvcGVydHlUeXBlID0gKHR5cGU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgIGNvbnN0IGNoZWNrUHJvcGVydHkgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgfTtcblxuICAvLyBUaGUgaW5uZXJCbG9ja3NGaWVsZCB1c2VzIElubmVyQmxvY2tzIChjb250ZW50IHN0b3JlZCBpbiBwb3N0X2NvbnRlbnQsIG5vdCBhbiBhdHRyaWJ1dGUpLlxuICAvLyBBbGwgb3RoZXIgcmljaHRleHQgZmllbGRzIGJlY29tZSBzdHJpbmcgYXR0cmlidXRlcyB3aXRoIFJpY2hUZXh0IGVkaXRpbmcuXG4gIGNvbnN0IHVzZUlubmVyQmxvY2tzID0gISFpbm5lckJsb2Nrc0ZpZWxkO1xuXG4gIC8vIEdldCBhbGwgYXR0cmlidXRlIG5hbWVzIOKAkyBleGNsdWRlIGlubmVyQmxvY2tzRmllbGQgYW5kIHBhZ2luYXRpb25cbiAgY29uc3QgYXR0ck5hbWVzID0gT2JqZWN0LmtleXMocHJvcGVydGllcylcbiAgICAuZmlsdGVyKGsgPT4gayAhPT0gaW5uZXJCbG9ja3NGaWVsZCAmJiBwcm9wZXJ0aWVzW2tdLnR5cGUgIT09ICdwYWdpbmF0aW9uJylcbiAgICAubWFwKHRvQ2FtZWxDYXNlKTtcblxuICAvLyBJbmNsdWRlIGFueSBhdHRyaWJ1dGUgbmFtZXMgcmVmZXJlbmNlZCBpbiB0aGUgdGVtcGxhdGUgYnV0IG1pc3NpbmcgZnJvbSBBUEkgcHJvcGVydGllc1xuICAvLyAoZS5nLiBib2R5IC0+IGJsb2NrQm9keSBzbyBKU1ggaGFzIGEgZGVmaW5lZCB2YXJpYWJsZSBhbmQgbm8gUmVmZXJlbmNlRXJyb3IpLlxuICAvLyBTa2lwIHRoZSBpbm5lckJsb2Nrc0ZpZWxkIOKAlCBpdHMgY29udGVudCBpcyBzdG9yZWQgdmlhIElubmVyQmxvY2tzLCBub3QgYXMgYW4gYXR0cmlidXRlLlxuICBjb25zdCBpbm5lckJsb2Nrc0F0dHJOYW1lID0gaW5uZXJCbG9ja3NGaWVsZCA/IHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpIDogbnVsbDtcbiAgZm9yIChjb25zdCBuYW1lIG9mIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzKGNvbXBvbmVudC5jb2RlKSkge1xuICAgIGlmICghYXR0ck5hbWVzLmluY2x1ZGVzKG5hbWUpICYmIG5hbWUgIT09IGlubmVyQmxvY2tzQXR0ck5hbWUpIGF0dHJOYW1lcy5wdXNoKG5hbWUpO1xuICB9XG4gIFxuICAvLyBBZGQgZHluYW1pYyBhcnJheSBhdHRyaWJ1dGUgbmFtZXMgYmFzZWQgb24gY29uZmlnIHR5cGVcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykgfHwgaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Qb3N0VHlwZWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1SZW5kZXJNb2RlYCk7XG4gICAgICAgIGlmICgoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbikge1xuICAgICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggY29tcG9uZW50cyB3ZSBuZWVkIHRvIGltcG9ydFxuICBjb25zdCBuZWVkc01lZGlhVXBsb2FkID0gaGFzUHJvcGVydHlUeXBlKCdpbWFnZScpO1xuICBjb25zdCBuZWVkc1JhbmdlQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnbnVtYmVyJyk7XG4gIGNvbnN0IG5lZWRzVG9nZ2xlQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnYm9vbGVhbicpIHx8IGhhc1Byb3BlcnR5VHlwZSgnYnV0dG9uJyk7XG4gIGNvbnN0IG5lZWRzU2VsZWN0Q29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnc2VsZWN0Jyk7XG4gIGNvbnN0IGhhc0FycmF5UHJvcHMgPSBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUocCA9PiBwLnR5cGUgPT09ICdhcnJheScpO1xuICBjb25zdCBoYXNPYmplY3RQcm9wcyA9IGhhc1Byb3BlcnR5VHlwZSgnb2JqZWN0Jyk7XG5cbiAgLy8gQnVpbGQgaW1wb3J0c1xuICBjb25zdCBibG9ja0VkaXRvckltcG9ydHMgPSBbJ3VzZUJsb2NrUHJvcHMnLCAnSW5zcGVjdG9yQ29udHJvbHMnLCAnQmxvY2tDb250cm9scyddO1xuICBpZiAobmVlZHNNZWRpYVVwbG9hZCkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdNZWRpYVVwbG9hZCcsICdNZWRpYVVwbG9hZENoZWNrJywgJ01lZGlhUmVwbGFjZUZsb3cnKTtcbiAgfVxuICAvLyBJbm5lckJsb2NrcyBmb3IgdGhlIGRlc2lnbmF0ZWQgcmljaHRleHQgY29udGVudCBhcmVhXG4gIGlmICh1c2VJbm5lckJsb2Nrcykge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG4gIC8vIExpbmtDb250cm9sIGZvciBsaW5rL2J1dHRvbiBmaWVsZHMgKHdoZW4gbm90IHVzaW5nIHNoYXJlZCBIYW5kb2ZmTGlua0ZpZWxkKVxuICBjb25zdCBuZWVkc0xpbmtDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcblxuICBjb25zdCBoYXNCcmVhZGNydW1ic0FycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc0JyZWFkY3J1bWJzQ29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG4gIGNvbnN0IGhhc1RheG9ub215QXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzUGFnaW5hdGlvbkFycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpXG4gICAgOiBmYWxzZTtcblxuICBjb25zdCBjb21wb25lbnRJbXBvcnRzID0gWydQYW5lbEJvZHknLCAnVGV4dENvbnRyb2wnLCAnQnV0dG9uJ107XG4gIGlmIChuZWVkc1JhbmdlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdSYW5nZUNvbnRyb2wnKTtcbiAgLy8gVG9nZ2xlQ29udHJvbDogb25seSBmb3IgYm9vbGVhbi9idXR0b24gcHJvcGVydHkgZmllbGRzIOKAlCBzcGVjaWFsIGFycmF5IHR5cGVzIHVzZSBzaGFyZWQgY29tcG9uZW50c1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgLy8gU2VsZWN0Q29udHJvbDogb25seSBmb3Igc2VsZWN0IHByb3BlcnR5IGZpZWxkcyBvciBEeW5hbWljUG9zdFNlbGVjdG9yIChwb3N0cykg4oCUIHRheG9ub215IGhhbmRsZWQgYnkgVGF4b25vbXlTZWxlY3RvclxuICBpZiAobmVlZHNTZWxlY3RDb250cm9sIHx8IGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU2VsZWN0Q29udHJvbCcpO1xuICAvLyBTcGlubmVyIGZvciBkeW5hbWljIGFycmF5IGxvYWRpbmcgc3RhdGUgaW4gZWRpdG9yIHByZXZpZXdcbiAgaWYgKGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuXG4gIGNvbXBvbmVudEltcG9ydHMucHVzaCgnRmxleCcpO1xuXG4gIC8vIDEwdXAgYmxvY2stY29tcG9uZW50cyBpbXBvcnRzXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIHdoZW4gdGhlcmUgYXJlIG5vbi1zZXJ2ZXItcmVuZGVyZWQgYXJyYXkgZmllbGRzIGluIHRoZSBzaWRlYmFyXG4gIC8vICh0YXhvbm9teS9icmVhZGNydW1icy9wYWdpbmF0aW9uIGFycmF5cyB1c2Ugc2hhcmVkIGNvbXBvbmVudHMgdGhhdCBpbXBvcnQgUmVwZWF0ZXIgdGhlbXNlbHZlcylcbiAgY29uc3QgaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmICghZHluYW1pY0FycmF5Q29uZmlncz8uW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICk7XG4gIGNvbnN0IHRlblVwSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGhhc05vblNwZWNpYWxBcnJheVByb3BzKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhcnJheSBoZWxwZXJzXG4gIGNvbnN0IGFycmF5SGVscGVycyA9IGdlbmVyYXRlQXJyYXlIZWxwZXJzKHByb3BlcnRpZXMpO1xuXG4gIC8vIEdlbmVyYXRlIEpTWCBwcmV2aWV3IGZyb20gaGFuZGxlYmFycyB0ZW1wbGF0ZVxuICAvLyBUaGlzIG11c3QgaGFwcGVuIGJlZm9yZSBwYW5lbCBnZW5lcmF0aW9uIHNvIHdlIGtub3cgd2hpY2ggZmllbGRzIGhhdmUgaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgcHJldmlld1Jlc3VsdCA9IGdlbmVyYXRlSnN4UHJldmlldyhcbiAgICBjb21wb25lbnQuY29kZSxcbiAgICBwcm9wZXJ0aWVzLFxuICAgIGNvbXBvbmVudC5pZCxcbiAgICBjb21wb25lbnQudGl0bGUsXG4gICAgaW5uZXJCbG9ja3NGaWVsZFxuICApO1xuICBsZXQgcHJldmlld0pzeCA9IHByZXZpZXdSZXN1bHQuanN4O1xuICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgLy8gRGV0ZWN0IGlmIHByZXZpZXcgdXNlcyBIYW5kb2ZmTGlua0ZpZWxkIChsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZylcbiAgY29uc3QgcHJldmlld1VzZXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuXG4gIC8vIEdlbmVyYXRlIHBhbmVsIGJvZGllcyBmb3IgZWFjaCBwcm9wZXJ0eVxuICBjb25zdCBwYW5lbHM6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICAvLyByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgLy8gcGFnaW5hdGlvbiBpcyBhdXRvLWdlbmVyYXRlZCBmcm9tIHF1ZXJ5IHJlc3VsdHMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcblxuICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIGlubGluZS1lZGl0YWJsZSBvbiB0aGUgY2FudmFzICh0ZXh0LCBpbWFnZSwgbGluaywgYnV0dG9uXG4gICAgLy8gd3JhcHBlZCBpbiB7eyNmaWVsZH19KSDigJMgdGhleSBkb24ndCBuZWVkIHNpZGViYXIgY29udHJvbHMuXG4gICAgLy8gQXJyYXkgZmllbGRzIGFyZSBhbHdheXMga2VwdDogdGhleSBuZWVkIHNpZGViYXIgVUkgZm9yIG1hbnVhbC9keW5hbWljIHRvZ2dsZVxuICAgIC8vIGFuZCBmb3IgYWRkaW5nL3JlbW92aW5nIGl0ZW1zLCBldmVuIHdoZW4gdGhlaXIgY2hpbGQgZmllbGRzIGFyZSBpbmxpbmUtZWRpdGFibGUuXG4gICAgaWYgKGlubGluZUVkaXRhYmxlRmllbGRzLmhhcyhrZXkpICYmIHByb3BlcnR5LnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgZHluYW1pYyBhcnJheSBmaWVsZFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIGR5bmFtaWNDb25maWcpIHtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIEJyZWFkY3J1bWJzOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gQnJlYWRjcnVtYnMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxCcmVhZGNydW1ic1NlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBUYXhvbm9teTogc2hhcmVkIGNvbXBvbmVudCB3aXRoIEF1dG8gLyBNYW51YWwgdGFic1xuICAgICAgICBjb25zdCB0YXhvbm9teU9wdGlvbnMgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdCwgdmFsdWU6IHQgfSkpO1xuICAgICAgICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcHMpLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICBpbmRlbnQ6ICcgICAgICAgICAgICAgICAgJyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGN0eCk7XG4gICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJylcbiAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnTGFiZWwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS5sYWJlbCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgbGFiZWw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+XG4gICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnVVJMJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0udXJsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCB1cmw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+YDtcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBUYXhvbm9teSAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFRheG9ub215U2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgZGVmYXVsdFRheG9ub215PVwiJHtkZWZhdWx0VGF4b25vbXl9XCJcbiAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93ICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgIDw+XG4ke2l0ZW1GaWVsZHN9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gUGFnaW5hdGlvbjogc2hhcmVkIGNvbXBvbmVudCB3aXRoIHNpbmdsZSB2aXNpYmlsaXR5IHRvZ2dsZVxuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFBhZ2luYXRpb24gKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxQYWdpbmF0aW9uU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUG9zdHMgKER5bmFtaWNBcnJheUNvbmZpZyk6IGZ1bGwgRHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICBjb25zdCBkZWZhdWx0TW9kZSA9IGR5bmFtaWNDb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgIGNvbnN0IGFkdmFuY2VkRmllbGRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBvcHRpb25zPzogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+OyBkZWZhdWx0PzogYW55IH0+ID0gW107XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gaXRlbU92ZXJyaWRlc0NvbmZpZyAobGVnYWN5KVxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCBjXSBvZiBPYmplY3QuZW50cmllcyhpdGVtT3ZlcnJpZGVzQ29uZmlnKSBhcyBBcnJheTxbc3RyaW5nLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZ10+KSB7XG4gICAgICAgICAgaWYgKGMubW9kZSA9PT0gJ3VpJykge1xuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWUsIGxhYmVsOiBjLmxhYmVsLCB0eXBlOiAnc2VsZWN0Jywgb3B0aW9uczogbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhjLm9wdGlvbnMpLCBkZWZhdWx0OiBjLmRlZmF1bHQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gZmllbGRNYXBwaW5nIHdpdGggdHlwZTogXCJtYW51YWxcIiDigJQgZGVyaXZlIGNvbnRyb2wgdHlwZSBmcm9tIGl0ZW0gcHJvcGVydGllc1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gZHluYW1pY0NvbmZpZy5maWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBtYXBwaW5nVmFsdWUgPT09ICdvYmplY3QnICYmIG1hcHBpbmdWYWx1ZSAhPT0gbnVsbCAmJiAobWFwcGluZ1ZhbHVlIGFzIGFueSkudHlwZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHRvcEtleSA9IGZpZWxkUGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTGFiZWwgPSBpdGVtUHJvcD8ubmFtZSB8fCB0b1RpdGxlQ2FzZSh0b3BLZXkpO1xuICAgICAgICAgICAgbGV0IGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGxldCBkZWZhdWx0VmFsOiBhbnkgPSBpdGVtUHJvcD8uZGVmYXVsdCA/PyAnJztcbiAgICAgICAgICAgIGlmIChpdGVtUHJvcCkge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnc2VsZWN0JztcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0b2dnbGUnO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gZmFsc2U7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnbnVtYmVyJztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IDA7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYWdpbmF0aW9uVG9nZ2xlID0gZHluYW1pY0NvbmZpZy5wYWdpbmF0aW9uXG4gICAgICAgICAgPyBgXG4gICAgICAgICAgICAgICAgPFRvZ2dsZUNvbnRyb2xcbiAgICAgICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyBQYWdpbmF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9eyR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQgPz8gdHJ1ZX1cbiAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkOiB2YWx1ZSB9KX1cbiAgICAgICAgICAgICAgICAvPmBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIER5bmFtaWMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgc291cmNlOiAke2F0dHJOYW1lfVNvdXJjZSB8fCAnJHtkZWZhdWx0TW9kZX0nLFxuICAgICAgICAgICAgICAgIHBvc3RUeXBlOiAke2F0dHJOYW1lfVBvc3RUeXBlLFxuICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHthdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3N0czogJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgIGl0ZW1PdmVycmlkZXM6ICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICBvbkNoYW5nZT17KG5leHRWYWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7XG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Tb3VyY2U6IG5leHRWYWx1ZS5zb3VyY2UsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9UXVlcnlBcmdzOiB7IC4uLm5leHRWYWx1ZS5xdWVyeUFyZ3MsIHBvc3RfdHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzOiBuZXh0VmFsdWUuc2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICBvcHRpb25zPXt7XG4gICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgbWF4SXRlbXM6ICR7ZHluYW1pY0NvbmZpZy5tYXhJdGVtcyA/PyAyMH0sXG4gICAgICAgICAgICAgICAgdGV4dERvbWFpbjogJ2hhbmRvZmYnLFxuICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICBzaG93RXhjbHVkZUN1cnJlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHM6ICR7SlNPTi5zdHJpbmdpZnkoYWR2YW5jZWRGaWVsZHMpfVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz4ke3BhZ2luYXRpb25Ub2dnbGV9XG4gICAgICAgICAgICB7JHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnICYmIChcbiAgICAgICAgICAgICAgPD5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RhbmRhcmQgcGFuZWwgKG5vbi1keW5hbWljKVxuICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWRkIEhhbmRvZmYgZGVzaWduIHN5c3RlbSBsaW5rcyBwYW5lbFxuICBjb25zdCBkZXNpZ25TeXN0ZW1QYW5lbCA9IFtcbiAgICAnICAgICAgICAgIHsvKiBEZXNpZ24gU3lzdGVtIExpbmtzICovfScsXG4gICAgJyAgICAgICAgICB7KG1ldGFkYXRhLl9faGFuZG9mZj8uaGFuZG9mZlVybCB8fCBtZXRhZGF0YS5fX2hhbmRvZmY/LmZpZ21hVXJsKSAmJiAoJyxcbiAgICAnICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oXFwnRGVzaWduIFN5c3RlbVxcJywgXFwnaGFuZG9mZlxcJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+JyxcbiAgICAnICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PicsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsICYmICgnLFxuICAgICcgICAgICAgICAgICAgICAgICA8QnV0dG9uJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB2YXJpYW50PVwic2Vjb25kYXJ5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGhyZWY9e21ldGFkYXRhLl9faGFuZG9mZi5oYW5kb2ZmVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cInZpc2liaWxpdHlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IFxcJzEwMCVcXCcsIGp1c3RpZnlDb250ZW50OiBcXCdjZW50ZXJcXCcgfX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA+JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB7X18oXFwnVmlldyBpbiBIYW5kb2ZmXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgICAge21ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmZpZ21hVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdPcGVuIGluIEZpZ21hXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgIDwvRmxleD4nLFxuICAgICcgICAgICAgICAgICA8L1BhbmVsQm9keT4nLFxuICAgICcgICAgICAgICAgKX0nLFxuICBdLmpvaW4oJ1xcbicpO1xuICBwYW5lbHMucHVzaChkZXNpZ25TeXN0ZW1QYW5lbCk7XG5cbiAgLy8gRHluYW1pYyBhcnJheSByZXNvbHV0aW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cyk6IGZ1bGwgdXNlU2VsZWN0IHJlc29sdXRpb25cbiAgLy8gQnJlYWRjcnVtYnM6IGxpdmUgZmV0Y2ggdmlhIFJFU1QgZW5kcG9pbnRcbiAgLy8gVGF4b25vbXkgKGF1dG8gbW9kZSk6IGxpdmUgZmV0Y2ggdmlhIHVzZVNlbGVjdCB3aXRoIGNvcmUtZGF0YVxuICAvLyBQYWdpbmF0aW9uOiBzZXJ2ZXItcmVuZGVyZWQgb25seSAoc3R1YiB2YXJpYWJsZSlcbiAgbGV0IGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlID0gJyc7XG4gIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gZmllbGRQcm9wPy5pdGVtcz8ucHJvcGVydGllcztcblxuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgeyBzZXRQcmV2aWV3JHtjYXB9KFtdKTsgcmV0dXJuOyB9XG4gICAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHNldFByZXZpZXcke2NhcH0oW10pKTtcbiAgICB9LCBbJHthdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcbiAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKc1xuICAgICAgICAgID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgICAoc2VsZWN0KSA9PiB7XG4gICAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICAgIGlmICgke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke2F0dHJOYW1lfSB8fCBbXTtcbiAgICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGF4b25vbXkgPSAke2F0dHJOYW1lfVRheG9ub215IHx8ICcke2NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgICAgY29uc3QgcmVzdEJhc2UgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0VGF4b25vbXkodGF4b25vbXkpPy5yZXN0X2Jhc2U7XG4gICAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2NvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICAgIGlmICghdGVybXMpIHJldHVybiBbXTtcbiAgICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgICAgfSxcbiAgICAgIFske2F0dHJOYW1lfUVuYWJsZWQsICR7YXR0ck5hbWV9U291cmNlLCAke2F0dHJOYW1lfVRheG9ub215LCBKU09OLnN0cmluZ2lmeSgke2F0dHJOYW1lfSB8fCBbXSldXG4gICAgKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkfFNvdXJjZXxUYXhvbm9teSlgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9ID0gW107IC8vIFBhZ2luYXRpb24gcmVuZGVycyBvbiB0aGUgZnJvbnRlbmRcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgIGNvbnN0IHByZXZpZXdWYXJOYW1lID0gYHByZXZpZXcke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgcmVzb2x2aW5nRmxhZ3MucHVzaChyZXNvbHZpbmdWYXJOYW1lKTtcbiAgICAgIGNvbnN0IHNvdXJjZUF0dHIgPSBgJHthdHRyTmFtZX1Tb3VyY2VgO1xuICAgICAgY29uc3QgcXVlcnlBcmdzQXR0ciA9IGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2A7XG4gICAgICBjb25zdCBwb3N0VHlwZUF0dHIgPSBgJHthdHRyTmFtZX1Qb3N0VHlwZWA7XG4gICAgICBjb25zdCBzZWxlY3RlZFBvc3RzQXR0ciA9IGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgO1xuICAgICAgY29uc3QgZmllbGRNYXBwaW5nQXR0ciA9IGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2A7XG4gICAgICBjb25zdCBpdGVtT3ZlcnJpZGVzQXR0ciA9IGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgO1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBzdG9yZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKTtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdxdWVyeScpIHtcbiAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHtwb3N0VHlwZUF0dHJ9IHx8ICdwb3N0JztcbiAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2NvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgIG9yZGVyYnk6IHF1ZXJ5QXJncy5vcmRlcmJ5IHx8ICdkYXRlJyxcbiAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgIHN0YXR1czogJ3B1Ymxpc2gnLFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHF1ZXJ5QXJncy50YXhfcXVlcnkgJiYgcXVlcnlBcmdzLnRheF9xdWVyeS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHF1ZXJ5QXJncy50YXhfcXVlcnkuZm9yRWFjaCgodHEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCF0cS50YXhvbm9teSB8fCAhdHEudGVybXMgfHwgIXRxLnRlcm1zLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgICAgICAgICBjb25zdCBwYXJhbSA9IHRxLnRheG9ub215ID09PSAnY2F0ZWdvcnknID8gJ2NhdGVnb3JpZXMnIDogdHEudGF4b25vbXkgPT09ICdwb3N0X3RhZycgPyAndGFncycgOiB0cS50YXhvbm9teTtcbiAgICAgICAgICAgICAgYXJnc1twYXJhbV0gPSB0cS50ZXJtcy5qb2luKCcsJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgIGlmIChyZWNvcmRzID09PSBudWxsIHx8IHJlY29yZHMgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgIG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9ICR7c2VsZWN0ZWRQb3N0c0F0dHJ9IHx8IFtdO1xuICAgICAgICAgIGlmICghc2VsZWN0ZWQubGVuZ3RoKSByZXR1cm4gW107XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge307XG4gICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcmVjID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkKCdwb3N0VHlwZScsIHNlbC50eXBlIHx8ICdwb3N0Jywgc2VsLmlkKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0sXG4gICAgICBbJHtzb3VyY2VBdHRyfSwgJHtwb3N0VHlwZUF0dHJ9LCBKU09OLnN0cmluZ2lmeSgke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW10pLCBKU09OLnN0cmluZ2lmeSgke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge30pXVxuICAgICk7XG4gICAgY29uc3QgJHtwcmV2aWV3VmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7YXR0ck5hbWV9ID8/IFtdKTtcbiAgICBjb25zdCAke3Jlc29sdmluZ1Zhck5hbWV9ID0gJHtzb3VyY2VBdHRyfSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgLy8gVXNlIHByZXZpZXcgdmFyaWFibGUgaW4gdGhlIGdlbmVyYXRlZCBwcmV2aWV3IEpTWCBzbyB0aGUgZWRpdG9yIHNob3dzIHF1ZXJ5L3NlbGVjdCByZXN1bHRzXG4gICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiYCwgJ2cnKTtcbiAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgIH1cbiAgICBpZiAocmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMCkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IGlzUHJldmlld0xvYWRpbmcgPSAke3Jlc29sdmluZ0ZsYWdzLmpvaW4oJyB8fCAnKX07XG5gO1xuICAgIH1cbiAgICAvLyBXaGVuIHByZXZpZXcgSlNYIHJlZmVyZW5jZXMgcGFnaW5hdGlvbiAoZnJvbSBIQlMpIGJ1dCBwYWdpbmF0aW9uIGlzIG9ubHkgYnVpbHQgc2VydmVyLXNpZGUsXG4gICAgLy8gZGVmaW5lIGl0IGluIHRoZSBlZGl0IHNvIHRoZSBlZGl0b3IgZG9lc24ndCB0aHJvdyBSZWZlcmVuY2VFcnJvci5cbiAgICBjb25zdCBwcmV2aWV3VXNlc1BhZ2luYXRpb24gPSAvXFxicGFnaW5hdGlvblxcYi8udGVzdChwcmV2aWV3SnN4KTtcbiAgICBjb25zdCBhbnlDb25maWdIYXNQYWdpbmF0aW9uID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYykgJiYgISEoYyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pXG4gICAgICA6IGZhbHNlO1xuICAgIGlmIChwcmV2aWV3VXNlc1BhZ2luYXRpb24gJiYgYW55Q29uZmlnSGFzUGFnaW5hdGlvbiAmJiAhZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUuaW5jbHVkZXMoJ2NvbnN0IHBhZ2luYXRpb24nKSkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSBgICAgIGNvbnN0IHBhZ2luYXRpb24gPSBbXTsgLy8gRWRpdG9yOiBwYWdpbmF0aW9uIGlzIGJ1aWx0IHNlcnZlci1zaWRlIGluIHJlbmRlci5waHBcbmAgKyBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZTtcbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHVzaW5nIGR5bmFtaWMgcG9zdHMsIHdyYXAgcHJldmlldyBpbiBsb2FkaW5nIHN0YXRlXG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIGNvbnN0IHByZXZpZXdDb250ZW50ID0gcmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMFxuICAgID8gYHtpc1ByZXZpZXdMb2FkaW5nID8gKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IGlzLWxvYWRpbmdcIiBzdHlsZT17eyBtaW5IZWlnaHQ6ICcxMjBweCcsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgZ2FwOiAnOHB4JyB9fT5cbiAgICAgICAgICAgIDxTcGlubmVyIC8+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBjb2xvcjogJ3ZhcigtLXdwLWFkbWluLXRoZW1lLWNvbG9yLWRhcmtlciwgIzFlMWUxZSknIH19PntfXygnTG9hZGluZyBwb3N0c+KApicsICdoYW5kb2ZmJyl9PC9zcGFuPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogKFxuJHtwcmV2aWV3SnN4fVxuICAgICAgICApfWBcbiAgICA6IHByZXZpZXdKc3g7XG5cbiAgLy8gQ2hlY2sgdGhlIGdlbmVyYXRlZCBwcmV2aWV3IGZvciBjb21wb25lbnRzIHRoYXQgbmVlZCB0byBiZSBpbXBvcnRlZFxuICAvLyBUaGlzIGNhdGNoZXMgY29tcG9uZW50cyBhZGRlZCBieSB0aGUgaGFuZGxlYmFycy10by1qc3ggdHJhbnNwaWxlciAoZS5nLiwgZnJvbSB7eyNmaWVsZH19IG1hcmtlcnMpXG4gIGNvbnN0IHByZXZpZXdVc2VzUmljaFRleHQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8UmljaFRleHQnKTtcbiAgY29uc3QgcHJldmlld1VzZXMxMHVwSW1hZ2UgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKTtcblxuICAvLyBBZGQgUmljaFRleHQgdG8gaW1wb3J0cyBpZiB1c2VkIGluIHByZXZpZXcgKGFuZCBub3QgYWxyZWFkeSBpbmNsdWRlZCBmcm9tIHByb3BlcnR5IHR5cGVzKVxuICBpZiAoKHByZXZpZXdVc2VzUmljaFRleHQgfHwgcHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIC8vIExpbmtDb250cm9sIGlzIG5lZWRlZCBmb3Igc2lkZWJhciBsaW5rL2J1dHRvbiBwcm9wZXJ0eSBwYW5lbHM7IGFkZCB1bmNvbmRpdGlvbmFsbHkgd2hlbiBwcmVzZW50LlxuICAvLyAoSGFuZG9mZkxpbmtGaWVsZCBpbiB0aGUgcHJldmlldyBpcyBzZXBhcmF0ZSDigJQgaXQncyBpbXBvcnRlZCBmcm9tIHRoZSBzaGFyZWQgY29tcG9uZW50IGFuZCBoYW5kbGVzIGl0cyBvd24gTGlua0NvbnRyb2wgaW50ZXJuYWxseS4pXG4gIGlmIChuZWVkc0xpbmtDb250cm9sKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghY29tcG9uZW50SW1wb3J0cy5pbmNsdWRlcygnUG9wb3ZlcicpKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1BvcG92ZXInKTtcbiAgfVxuXG4gIC8vIEFkZCBJbm5lckJsb2NrcyBpZiB1c2VkIGluIHByZXZpZXcgYnV0IG5vdCBhbHJlYWR5IGltcG9ydGVkXG4gIGNvbnN0IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgaWYgKHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnSW5uZXJCbG9ja3MnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIDEwdXAgaW1wb3J0IGlmIG5lZWRlZCAoSW1hZ2UgZm9yIHByZXZpZXcsIFJlcGVhdGVyIGZvciBhcnJheXMpXG4gIGlmIChwcmV2aWV3VXNlczEwdXBJbWFnZSkge1xuICAgIHRlblVwSW1wb3J0cy5wdXNoKCdJbWFnZScpO1xuICB9XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDBcbiAgICA/IGBpbXBvcnQgeyAke3RlblVwSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnO1xcbmBcbiAgICA6ICcnO1xuXG4gIC8vIENvbGxlY3QgYWxsIGltYWdlIGZpZWxkcyBmb3IgQmxvY2tDb250cm9scy9NZWRpYVJlcGxhY2VGbG93XG4gIGludGVyZmFjZSBJbWFnZUZpZWxkSW5mbyB7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBhdHRyUGF0aDogc3RyaW5nOyAgLy8gZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2xlZnRDYXJkLmltYWdlJ1xuICAgIHZhbHVlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQ/LmltYWdlJ1xuICAgIHVwZGF0ZUV4cHI6IHN0cmluZzsgLy8gZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyBiYWNrZ3JvdW5kSW1hZ2U6IC4uLiB9KScgb3IgbmVzdGVkIHVwZGF0ZVxuICB9XG4gIFxuICBjb25zdCBpbWFnZUZpZWxkczogSW1hZ2VGaWVsZEluZm9bXSA9IFtdO1xuICBcbiAgY29uc3QgY29sbGVjdEltYWdlRmllbGRzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwYXJlbnRQYXRoOiBzdHJpbmcgPSAnJywgcGFyZW50VmFsdWVQYXRoOiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgICBjb25zdCBjdXJyZW50UGF0aCA9IHBhcmVudFBhdGggPyBgJHtwYXJlbnRQYXRofS4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZVBhdGggPSBwYXJlbnRWYWx1ZVBhdGggPyBgJHtwYXJlbnRWYWx1ZVBhdGh9Py4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBjb25zdCBsYWJlbCA9IHByb3AubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuICAgICAgICBsZXQgdXBkYXRlRXhwcjogc3RyaW5nO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBhcmVudFBhdGgpIHtcbiAgICAgICAgICAvLyBOZXN0ZWQgaW1hZ2UgZmllbGQgLSBuZWVkIHRvIHNwcmVhZCBwYXJlbnQgb2JqZWN0XG4gICAgICAgICAgY29uc3QgcGFyZW50QXR0ciA9IHBhcmVudFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICBjb25zdCBwYXJlbnRDYW1lbCA9IHRvQ2FtZWxDYXNlKHBhcmVudEF0dHIpO1xuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50Q2FtZWx9OiB7IC4uLiR7cGFyZW50Q2FtZWx9LCAke2F0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0gfSlgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRvcC1sZXZlbCBpbWFnZSBmaWVsZFxuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSlgO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpbWFnZUZpZWxkcy5wdXNoKHtcbiAgICAgICAgICBsYWJlbCxcbiAgICAgICAgICBhdHRyUGF0aDogY3VycmVudFBhdGgsXG4gICAgICAgICAgdmFsdWVFeHByOiBjdXJyZW50VmFsdWVQYXRoLFxuICAgICAgICAgIHVwZGF0ZUV4cHJcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3QgcHJvcGVydGllc1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wLnByb3BlcnRpZXMsIGN1cnJlbnRQYXRoLCBjdXJyZW50VmFsdWVQYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBjb2xsZWN0SW1hZ2VGaWVsZHMocHJvcGVydGllcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBCbG9ja0NvbnRyb2xzIHdpdGggTWVkaWFSZXBsYWNlRmxvdyBmb3IgZWFjaCBpbWFnZSBmaWVsZFxuICBjb25zdCBibG9ja0NvbnRyb2xzSnN4ID0gaW1hZ2VGaWVsZHMubGVuZ3RoID4gMCA/IGBcbiAgICAgICAgPEJsb2NrQ29udHJvbHMgZ3JvdXA9XCJvdGhlclwiPlxuJHtpbWFnZUZpZWxkcy5tYXAoZmllbGQgPT4gYCAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgbWVkaWFJZD17JHtmaWVsZC52YWx1ZUV4cHJ9Py5pZH1cbiAgICAgICAgICAgIG1lZGlhVXJsPXske2ZpZWxkLnZhbHVlRXhwcn0/LnNyY31cbiAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgYWNjZXB0PVwiaW1hZ2UvKlwiXG4gICAgICAgICAgICBvblNlbGVjdD17KG1lZGlhKSA9PiAke2ZpZWxkLnVwZGF0ZUV4cHJ9fVxuICAgICAgICAgICAgbmFtZT17X18oJyR7ZmllbGQubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmApLmpvaW4oJ1xcbicpfVxuICAgICAgICA8L0Jsb2NrQ29udHJvbHM+YCA6ICcnO1xuXG4gIC8vIFNoYXJlZCBjb21wb25lbnQgaW1wb3J0cyBmb3IgZHluYW1pYyBhcnJheXMgKHNlbGVjdG9yIFVJICsgZWRpdG9yIHByZXZpZXcgbWFwcGluZylcbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0JyZWFkY3J1bWJzU2VsZWN0b3InKTtcbiAgaWYgKGhhc1RheG9ub215QXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmIChoYXNQYWdpbmF0aW9uQXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBoYXNEeW5hbWljQXJyYXlzIHx8IGhhc1RheG9ub215QXJyYXk7XG4gIGlmIChuZWVkc0RhdGFTdG9yZSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IHsgdXNlU2VsZWN0JHtoYXNCcmVhZGNydW1ic0FycmF5ID8gJywgc2VsZWN0JyA6ICcnfSB9IGZyb20gJ0B3b3JkcHJlc3MvZGF0YSc7XFxuaW1wb3J0IHsgc3RvcmUgYXMgY29yZURhdGFTdG9yZSB9IGZyb20gJ0B3b3JkcHJlc3MvY29yZS1kYXRhJztcXG5gO1xuICB9XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICAvLyBCdWlsZCBlbGVtZW50IGltcG9ydHNcbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgZWxlbWVudEltcG9ydHMucHVzaCgndXNlU3RhdGUnLCAndXNlRWZmZWN0Jyk7XG4gIH1cblxuICAvLyBJbXBvcnQgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQgd2hlbiBwcmV2aWV3IHVzZXMgbGluay9idXR0b24gaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgbGlua0ZpZWxkSW1wb3J0ID0gcHJldmlld1VzZXNMaW5rRmllbGQgPyBgaW1wb3J0IHsgSGFuZG9mZkxpbmtGaWVsZCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0xpbmtGaWVsZCc7XFxuYCA6ICcnO1xuXG4gIC8vIFNjcmVlbnNob3QgaW1wb3J0IGZvciBpbnNlcnRlciBwcmV2aWV3XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnQgPSBoYXNTY3JlZW5zaG90ID8gYGltcG9ydCBzY3JlZW5zaG90VXJsIGZyb20gJy4vc2NyZWVuc2hvdC5wbmcnO1xcbmAgOiAnJztcblxuICAvLyBTVkcgaWNvbiBmb3IgdGhlIGJsb2NrICh1bmlxdWUgcGVyIGJsb2NrLCBjb2xvcmVkIGJ5IGdyb3VwKVxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVTdmdJY29uKGNvbXBvbmVudC50aXRsZSwgY29tcG9uZW50Lmdyb3VwKTtcbiAgY29uc3Qgc3ZnSWNvbkNvZGUgPSBgY29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO2A7XG5cbiAgLy8gSW5zZXJ0ZXIgcHJldmlldzogc2hvdyBzY3JlZW5zaG90IGltYWdlIGluc3RlYWQgb2YgbGl2ZS1yZW5kZXJpbmdcbiAgY29uc3QgcHJldmlld0Vhcmx5UmV0dXJuID0gaGFzU2NyZWVuc2hvdFxuICAgID8gYCAgICBpZiAoYXR0cmlidXRlcy5fX3ByZXZpZXcpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgIDxpbWcgc3JjPXtzY3JlZW5zaG90VXJsfSBhbHQ9e21ldGFkYXRhLnRpdGxlfSBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fSAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICk7XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgcmV0dXJuIGBpbXBvcnQgeyByZWdpc3RlckJsb2NrVHlwZSB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2tzJztcbmltcG9ydCB7IFxuICAke2Jsb2NrRWRpdG9ySW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IFxuICAke2NvbXBvbmVudEltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG4ke3RlblVwSW1wb3J0fSR7c2hhcmVkQ29tcG9uZW50SW1wb3J0fWltcG9ydCBtZXRhZGF0YSBmcm9tICcuL2Jsb2NrLmpzb24nO1xuaW1wb3J0ICcuL2VkaXRvci5zY3NzJztcbiR7aGFzRHluYW1pY0FycmF5cyA/IFwiaW1wb3J0ICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9EeW5hbWljUG9zdFNlbGVjdG9yLmVkaXRvci5zY3NzJztcXG5cIiA6ICcnfWltcG9ydCAnLi9zdHlsZS5zY3NzJztcbiR7c2NyZWVuc2hvdEltcG9ydH0ke2xpbmtGaWVsZEltcG9ydH1cbiR7c3ZnSWNvbkNvZGV9XG5cbiR7ZGVwcmVjYXRpb25zQ29kZSA/IGAke2RlcHJlY2F0aW9uc0NvZGV9XFxuXFxuYCA6ICcnfXJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsXG4gIGljb246IGJsb2NrSWNvbiwke2RlcHJlY2F0aW9uc0NvZGUgPyAnXFxuICBkZXByZWNhdGVkLCcgOiAnJ31cbiAgZWRpdDogKHsgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaXNTZWxlY3RlZCB9KSA9PiB7XG4gICAgY29uc3QgYmxvY2tQcm9wcyA9IHVzZUJsb2NrUHJvcHMoKTtcbiR7cHJldmlld0Vhcmx5UmV0dXJufSR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/IFwiICAgIGNvbnN0IENPTlRFTlRfQkxPQ0tTID0gWydjb3JlL3BhcmFncmFwaCcsJ2NvcmUvaGVhZGluZycsJ2NvcmUvbGlzdCcsJ2NvcmUvbGlzdC1pdGVtJywnY29yZS9xdW90ZScsJ2NvcmUvaW1hZ2UnLCdjb3JlL3NlcGFyYXRvcicsJ2NvcmUvaHRtbCcsJ2NvcmUvYnV0dG9ucycsJ2NvcmUvYnV0dG9uJ107XCIgOiAnJ31cbiAgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZX1cbiR7YXJyYXlIZWxwZXJzfVxuICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxJbnNwZWN0b3JDb250cm9scz5cbiR7cGFuZWxzLmpvaW4oJ1xcblxcbicpfVxuICAgICAgICA8L0luc3BlY3RvckNvbnRyb2xzPlxuJHtibG9ja0NvbnRyb2xzSnN4fVxuXG4gICAgICAgIHsvKiBFZGl0b3IgUHJldmlldyAqL31cbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4ke3ByZXZpZXdDb250ZW50fVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvRnJhZ21lbnQ+XG4gICAgKTtcbiAgfSxcbiAgc2F2ZTogKCkgPT4ge1xuJHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICAvLyBJbm5lckJsb2NrcyBjb250ZW50IG11c3QgYmUgc2F2ZWQgc28gaXQgaXMgcGVyc2lzdGVkIGluIHBvc3QgY29udGVudFxcbiAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgLy8gU2VydmVyLXNpZGUgcmVuZGVyaW5nIHZpYSByZW5kZXIucGhwXFxuICAgIHJldHVybiBudWxsOyd9XG4gIH0sXG59KTtcbmA7XG59O1xuXG5leHBvcnQgeyBnZW5lcmF0ZUluZGV4SnMsIGdlbmVyYXRlU3ZnSWNvbiwgdG9UaXRsZUNhc2UsIGdlbmVyYXRlRmllbGRDb250cm9sLCBnZW5lcmF0ZUFycmF5Q29udHJvbCwgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgfTtcbmV4cG9ydCB0eXBlIHsgRmllbGRDb250ZXh0IH07XG4iXX0=