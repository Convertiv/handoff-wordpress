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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBeW9DeUMsa0NBQVc7QUEzbkN0RDs7R0FFRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsUUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsT0FBcUIsRUFDYixFQUFFO0lBQ1YsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQzNELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXJELFFBQVEsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLEtBQUssTUFBTTtZQUNULE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU0sZ0JBQWdCLEtBQUs7RUFDM0IsTUFBTSxZQUFZLGFBQWE7RUFDL0IsTUFBTSwwQkFBMEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUN4RCxNQUFNLElBQUksQ0FBQztRQUVULEtBQUssVUFBVTtZQUNiLHNFQUFzRTtZQUN0RSxPQUFPLEVBQUUsQ0FBQztRQUVaLEtBQUssUUFBUTtZQUNYLE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU0sZ0JBQWdCLEtBQUs7RUFDM0IsTUFBTSxZQUFZLGFBQWE7RUFDL0IsTUFBTSwwQkFBMEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUN4RCxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sSUFBSSxDQUFDO1FBRVQsS0FBSyxTQUFTO1lBQ1osT0FBTyxHQUFHLE1BQU07RUFDcEIsTUFBTSxnQkFBZ0IsS0FBSztFQUMzQixNQUFNLGNBQWMsYUFBYTtFQUNqQyxNQUFNLDBCQUEwQixlQUFlLENBQUMsT0FBTyxDQUFDO0VBQ3hELE1BQU0sSUFBSSxDQUFDO1FBRVQsS0FBSyxPQUFPO1lBQ1YsaUZBQWlGO1lBQ2pGLE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU07RUFDTixNQUFNLDRCQUE0QixlQUFlLENBQUMsNENBQTRDLENBQUM7RUFDL0YsTUFBTTtFQUNOLE1BQU0sY0FBYyxhQUFhO0VBQ2pDLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxpRUFBaUUsS0FBSztFQUM1RSxNQUFNLFlBQVksYUFBYTtFQUMvQixNQUFNO0VBQ04sTUFBTSxvQkFBb0IsYUFBYTtFQUN2QyxNQUFNLG9CQUFvQixhQUFhO0VBQ3ZDLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNLGNBQWMsYUFBYSx1QkFBdUIsS0FBSyw4QkFBOEIsS0FBSztFQUNoRyxNQUFNO0VBQ04sTUFBTSxZQUFZLGFBQWE7RUFDL0IsTUFBTTtFQUNOLE1BQU0sOEJBQThCLGVBQWUsQ0FBQywwQkFBMEIsQ0FBQztFQUMvRSxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxxQkFBcUIsQ0FBQztRQUUxQixLQUFLLE1BQU07WUFDVCxvRkFBb0Y7WUFDcEYsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDO2FBQzdCLGFBQWE7O2dDQUVNLGFBQWE7O1FBRXJDLENBQUMsQ0FBQztZQUNKLE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU0sNERBQTRELEtBQUs7RUFDdkUsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxjQUFjLGFBQWE7RUFDakMsTUFBTSw0QkFBNEIsZUFBZSxDQUFDLFFBQVEsYUFBYSxrQkFBa0IsQ0FBQztFQUMxRixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxnQkFBZ0IsYUFBYTtFQUNuQyxNQUFNLGtCQUFrQixhQUFhO0VBQ3JDLE1BQU0sMEJBQTBCLGFBQWE7RUFDN0MsTUFBTTtFQUNOLE1BQU0sOEJBQThCLFdBQVc7RUFDL0MsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sUUFBUSxDQUFDO1FBRWIsS0FBSyxRQUFRO1lBQ1gsbUVBQW1FO1lBQ25FLHdEQUF3RDtZQUN4RCxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUM7YUFDL0IsYUFBYTs7OztRQUlsQixDQUFDLENBQUM7WUFDSixPQUFPLEdBQUcsTUFBTTtFQUNwQixNQUFNLDREQUE0RCxLQUFLO0VBQ3ZFLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sY0FBYyxhQUFhO0VBQ2pDLE1BQU0sNEJBQTRCLGVBQWUsQ0FBQyxRQUFRLGFBQWEsa0JBQWtCLENBQUM7RUFDMUYsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sZ0JBQWdCLGFBQWE7RUFDbkMsTUFBTSxrQkFBa0IsYUFBYTtFQUNyQyxNQUFNLDBCQUEwQixhQUFhO0VBQzdDLE1BQU07RUFDTixNQUFNLDhCQUE4QixhQUFhO0VBQ2pELE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sZ0JBQWdCLGFBQWE7RUFDbkMsTUFBTSw0QkFBNEIsZUFBZSxDQUFDLFFBQVEsYUFBYSxxQkFBcUIsQ0FBQztFQUM3RixNQUFNO0VBQ04sTUFBTSxRQUFRLENBQUM7UUFFYixLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDZCxNQUFNLE9BQU8sR0FBRyxJQUFBLDhCQUFzQixFQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FDakUsYUFBYSxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLGNBQWMsR0FBRyxDQUFDLEtBQUssS0FBSyxDQUN4RSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNiLE9BQU8sR0FBRyxNQUFNO0VBQ3BCLE1BQU0sZ0JBQWdCLEtBQUs7RUFDM0IsTUFBTSxZQUFZLGFBQWE7RUFDL0IsTUFBTSxlQUFlLE9BQU87RUFDNUIsTUFBTSwwQkFBMEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUN4RCxNQUFNLElBQUksQ0FBQztRQUNULENBQUM7UUFFRCxLQUFLLE9BQU87WUFDViw2REFBNkQ7WUFDN0QsOEVBQThFO1lBQzlFLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLFVBQVUsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2dCQUN4RSw0Q0FBNEM7Z0JBQzVDLE9BQU8sR0FBRyxNQUFNO0VBQ3RCLE1BQU0sNERBQTRELEtBQUs7RUFDdkUsTUFBTTtFQUNOLE1BQU0sU0FBUyxhQUFhO0VBQzVCLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxzQ0FBc0MsYUFBYTtFQUN6RCxNQUFNO0VBQ04sTUFBTSxpQkFBaUIsZUFBZSxDQUFDLFNBQVMsQ0FBQztFQUNqRCxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNLG9DQUFvQyxhQUFhO0VBQ3ZELE1BQU07RUFDTixNQUFNLGVBQWUsZUFBZSxDQUFDLFNBQVMsQ0FBQztFQUMvQyxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sNEJBQTRCLGFBQWE7RUFDL0MsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxlQUFlLGVBQWUsQ0FBQyxTQUFTLENBQUM7RUFDL0MsTUFBTTtFQUNOLE1BQU0scUNBQXFDLGFBQWE7RUFDeEQsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxnQ0FBZ0MsYUFBYTtFQUNuRCxNQUFNLGVBQWUsZUFBZSxDQUFDLFNBQVMsQ0FBQztFQUMvQyxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sZ0NBQWdDLGFBQWE7RUFDbkQsTUFBTSxXQUFXLGVBQWUsQ0FBQyxTQUFTLENBQUM7RUFDM0MsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0sUUFBUSxDQUFDO1lBQ1gsQ0FBQztZQUNELDRHQUE0RztZQUM1RyxPQUFPLEVBQUUsQ0FBQztRQUVaLEtBQUssUUFBUTtZQUNYLElBQUksUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN4QixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7cUJBQ3ZELEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxFQUFFLEVBQUU7b0JBQy9CLE1BQU0sYUFBYSxHQUFpQjt3QkFDbEMsYUFBYSxFQUFFLEdBQUcsYUFBYSxLQUFLLFNBQVMsRUFBRTt3QkFDL0MsZUFBZSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxlQUFlLENBQUMsUUFBUSxhQUFhLEtBQUssU0FBUyxLQUFLLEdBQUcsSUFBSSxDQUFDO3dCQUMxRixNQUFNLEVBQUUsTUFBTSxHQUFHLElBQUk7cUJBQ3RCLENBQUM7b0JBQ0YsT0FBTyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLGFBQWEsQ0FBQyxDQUFDO2dCQUNwRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2hCLE9BQU8sR0FBRyxNQUFNO0VBQ3RCLGNBQWM7RUFDZCxNQUFNLFNBQVMsQ0FBQztZQUNaLENBQUM7WUFDRCxPQUFPLEVBQUUsQ0FBQztRQUVaO1lBQ0UsT0FBTyxHQUFHLE1BQU07RUFDcEIsTUFBTSxnQkFBZ0IsS0FBSztFQUMzQixNQUFNLFlBQVksYUFBYTtFQUMvQixNQUFNLDBCQUEwQixlQUFlLENBQUMsT0FBTyxDQUFDO0VBQ3hELE1BQU0sSUFBSSxDQUFDO0lBQ1gsQ0FBQztBQUNILENBQUMsQ0FBQztBQTAzQnNELG9EQUFvQjtBQXgzQjVFOzs7R0FHRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxHQUFXLEVBQUUsUUFBeUIsRUFBRSxRQUFnQixFQUFFLEtBQWEsRUFBRSxNQUFjLEVBQVUsRUFBRTtJQUMvSCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLFVBQVUsSUFBSSxFQUFFLENBQUM7SUFFbkQseUVBQXlFO0lBQ3pFLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLEVBQUUsRUFBRTtRQUN6RSxNQUFNLFlBQVksR0FBaUI7WUFDakMsYUFBYSxFQUFFLFFBQVEsUUFBUSxFQUFFO1lBQ2pDLGVBQWUsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsc0JBQXNCLFFBQVEsS0FBSyxLQUFLLEtBQUs7WUFDekUsTUFBTSxFQUFFLE1BQU0sR0FBRyxRQUFRO1NBQzFCLENBQUM7UUFDRixPQUFPLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDakUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWQsc0ZBQXNGO0lBQ3RGLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0lBQzFGLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsUUFBUSxjQUFjLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBRTVFLG9FQUFvRTtJQUNwRSw0RUFBNEU7SUFDNUUsTUFBTSxZQUFZLEdBQUc7RUFDckIsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNLG9CQUFvQixLQUFLO0VBQy9CLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxLQUFLLENBQUM7SUFFWixPQUFPLEdBQUcsTUFBTTtFQUNoQixNQUFNLGdCQUFnQixRQUFRO0VBQzlCLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxnQkFBZ0IsWUFBWTtFQUNsQyxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0scURBQXFELGFBQWEsSUFBSSxLQUFLO0VBQ2pGLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sVUFBVTtFQUNWLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxhQUFhLENBQUM7QUFDdEIsQ0FBQyxDQUFDO0FBNnlCNEUsb0RBQW9CO0FBM3lCbEc7OztHQUdHO0FBQ0gsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLEdBQVcsRUFBRSxRQUF5QixFQUFFLFNBQWlCLFlBQVksRUFBVSxFQUFFO0lBQ2hILE1BQU0sUUFBUSxHQUFHLElBQUEsK0JBQVcsRUFBQyxHQUFHLENBQUMsQ0FBQztJQUNsQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUVoRCxvREFBb0Q7SUFDcEQsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE9BQU8sb0JBQW9CLENBQUMsR0FBRyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCwrREFBK0Q7SUFDL0QsTUFBTSxPQUFPLEdBQWlCO1FBQzVCLGFBQWEsRUFBRSxRQUFRO1FBQ3ZCLGVBQWUsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsbUJBQW1CLFFBQVEsS0FBSyxLQUFLLEtBQUs7UUFDdEUsTUFBTTtLQUNQLENBQUM7SUFFRixPQUFPLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDdEQsQ0FBQyxDQUFDO0FBc3hCa0csMERBQXVCO0FBcHhCM0g7O0dBRUc7QUFDSCxNQUFNLGVBQWUsR0FBRyxDQUFDLFNBQTBCLEVBQU8sRUFBRTtJQUMxRCxRQUFRLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2QixLQUFLLE1BQU07WUFDVCxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUN0RCxLQUFLLFFBQVE7WUFDWCxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFDeEUsS0FBSyxPQUFPO1lBQ1YsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzlCLEtBQUssUUFBUTtZQUNYLElBQUksU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN6QixNQUFNLE1BQU0sR0FBd0IsRUFBRSxDQUFDO2dCQUN2QyxLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDM0UsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztnQkFDRCxPQUFPLE1BQU0sQ0FBQztZQUNoQixDQUFDO1lBQ0QsT0FBTyxFQUFFLENBQUM7UUFDWixLQUFLLFNBQVM7WUFDWixPQUFPLEtBQUssQ0FBQztRQUNmLEtBQUssUUFBUTtZQUNYLE9BQU8sQ0FBQyxDQUFDO1FBQ1gsS0FBSyxPQUFPO1lBQ1YsT0FBTyxFQUFFLENBQUM7UUFDWjtZQUNFLE9BQU8sRUFBRSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQUVGOzs7O0dBSUc7QUFDSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsVUFBMkMsRUFBVSxFQUFFO0lBQ25GLG9FQUFvRTtJQUNwRSx3Q0FBd0M7SUFDeEMsT0FBTyxFQUFFLENBQUM7QUFDWixDQUFDLENBQUM7QUFHRjs7R0FFRztBQUNILE1BQU0sVUFBVSxHQUFHLENBQUMsR0FBVyxFQUFFLEdBQVcsRUFBVSxFQUFFO0lBQ3RELElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNWLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDcEMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUNELE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7QUFDakMsQ0FBQyxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBYSxFQUFFLEtBQWEsRUFBVSxFQUFFO0lBQy9ELE1BQU0sWUFBWSxHQUFHO1FBQ25CLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVM7UUFDMUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUztRQUMxQyxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTO1FBQzFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVM7S0FDM0MsQ0FBQztJQUVGLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3JELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQztRQUNoQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFO1FBQzNDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBRXRELE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLEtBQUssRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUU1RSxPQUFPOzhEQUNxRCxLQUFLO3VKQUNvRixRQUFRO1dBQ3BKLENBQUM7QUFDWixDQUFDLENBQUM7QUFzc0J3QiwwQ0FBZTtBQXBzQnpDOzs7Ozs7O0dBT0c7QUFDSCxNQUFNLGVBQWUsR0FBRyxDQUN0QixTQUEyQixFQUMzQixtQkFBK0gsRUFDL0gsZ0JBQWdDLEVBQ2hDLGdCQUF5QixFQUN6QixhQUF1QixFQUNmLEVBQUU7SUFDVixNQUFNLFNBQVMsR0FBRyxJQUFBLHdCQUFXLEVBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLE1BQU0sVUFBVSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7SUFFeEMsbUZBQW1GO0lBQ25GLHNGQUFzRjtJQUN0RixNQUFNLGdCQUFnQixHQUFHLG1CQUFtQjtRQUMxQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FDckMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLENBQzNCO1FBQ0gsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUVWLCtFQUErRTtJQUMvRSxNQUFNLGVBQWUsR0FBRyxDQUFDLElBQVksRUFBVyxFQUFFO1FBQ2hELE1BQU0sYUFBYSxHQUFHLENBQUMsSUFBcUIsRUFBVyxFQUFFO1lBQ3ZELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1lBQ3BDLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUM5QyxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUM1RCxDQUFDO1lBQ0QsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDO2dCQUNwRCxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDbEUsQ0FBQztZQUNELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQyxDQUFDO1FBQ0YsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUM7SUFFRiw0RkFBNEY7SUFDNUYsNEVBQTRFO0lBQzVFLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQztJQUUxQyxvRUFBb0U7SUFDcEUsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7U0FDdEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLGdCQUFnQixJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO1NBQzFFLEdBQUcsQ0FBQywrQkFBVyxDQUFDLENBQUM7SUFFcEIseUZBQXlGO0lBQ3pGLCtFQUErRTtJQUMvRSxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUEsMkNBQW1DLEVBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDdkUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQseURBQXlEO0lBQ3pELElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUN4QixLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDekUsTUFBTSxRQUFRLEdBQUcsSUFBQSwrQkFBVyxFQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3hDLElBQUksSUFBQSwyQkFBbUIsRUFBQyxTQUFTLENBQUMsSUFBSSxJQUFBLDBCQUFrQixFQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BFLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7aUJBQU0sSUFBSSxJQUFBLHdCQUFnQixFQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLFNBQVMsQ0FBQyxDQUFDO2dCQUNyQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxVQUFVLENBQUMsQ0FBQztnQkFDdEMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsUUFBUSxDQUFDLENBQUM7WUFDdEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLDZCQUE2QjtnQkFDN0IsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsUUFBUSxDQUFDLENBQUM7Z0JBQ3BDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLFVBQVUsQ0FBQyxDQUFDO2dCQUN0QyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxlQUFlLENBQUMsQ0FBQztnQkFDM0MsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsV0FBVyxDQUFDLENBQUM7Z0JBQ3ZDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLGNBQWMsQ0FBQyxDQUFDO2dCQUMxQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxlQUFlLENBQUMsQ0FBQztnQkFDM0MsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsWUFBWSxDQUFDLENBQUM7Z0JBQ3hDLElBQUssU0FBZ0MsQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDakQsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsbUJBQW1CLENBQUMsQ0FBQztnQkFDakQsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVELCtDQUErQztJQUMvQyxNQUFNLGdCQUFnQixHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNsRCxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwRCxNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkYsTUFBTSxrQkFBa0IsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDckQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0lBQzlFLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUVqRCxnQkFBZ0I7SUFDaEIsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLGVBQWUsRUFBRSxtQkFBbUIsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNuRixJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDckIsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFDRCx1REFBdUQ7SUFDdkQsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNuQixrQkFBa0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUNELDhFQUE4RTtJQUM5RSxNQUFNLGdCQUFnQixHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsSUFBSSxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFOUUsTUFBTSxtQkFBbUIsR0FBRyxtQkFBbUI7UUFDN0MsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUEsMkJBQW1CLEVBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEUsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUNWLE1BQU0sZ0JBQWdCLEdBQUcsbUJBQW1CO1FBQzFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFBLHdCQUFnQixFQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDVixNQUFNLGtCQUFrQixHQUFHLG1CQUFtQjtRQUM1QyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBQSwwQkFBa0IsRUFBQyxDQUFDLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsS0FBSyxDQUFDO0lBRVYsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDaEUsSUFBSSxpQkFBaUI7UUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDN0QscUdBQXFHO0lBQ3JHLElBQUksa0JBQWtCO1FBQUUsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQy9ELHVIQUF1SDtJQUN2SCxJQUFJLGtCQUFrQixJQUFJLGdCQUFnQjtRQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUNuRiw0REFBNEQ7SUFDNUQsSUFBSSxnQkFBZ0I7UUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFdkQsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRTlCLGdDQUFnQztJQUNoQyx5RkFBeUY7SUFDekYsaUdBQWlHO0lBQ2pHLE1BQU0sdUJBQXVCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQ3pFLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLElBQUksbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUM5RixDQUFDO0lBQ0YsTUFBTSxZQUFZLEdBQWEsRUFBRSxDQUFDO0lBQ2xDLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUM1QixZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCx5QkFBeUI7SUFDekIsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7SUFFdEQsZ0RBQWdEO0lBQ2hELHVGQUF1RjtJQUN2RixNQUFNLGFBQWEsR0FBRyxJQUFBLHNDQUFrQixFQUN0QyxTQUFTLENBQUMsSUFBSSxFQUNkLFVBQVUsRUFDVixTQUFTLENBQUMsRUFBRSxFQUNaLFNBQVMsQ0FBQyxLQUFLLEVBQ2YsZ0JBQWdCLENBQ2pCLENBQUM7SUFDRixJQUFJLFVBQVUsR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDO0lBQ25DLE1BQU0sb0JBQW9CLEdBQUcsYUFBYSxDQUFDLG9CQUFvQixDQUFDO0lBRWhFLHVFQUF1RTtJQUN2RSxNQUFNLG9CQUFvQixHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQztJQUV0RSwwQ0FBMEM7SUFDMUMsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBRTVCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDekQsb0VBQW9FO1FBQ3BFLDRFQUE0RTtRQUM1RSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssVUFBVSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssWUFBWTtZQUFFLFNBQVM7UUFFN0UsZ0ZBQWdGO1FBQ2hGLDZEQUE2RDtRQUM3RCwrRUFBK0U7UUFDL0UsbUZBQW1GO1FBQ25GLElBQUksb0JBQW9CLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssT0FBTztZQUFFLFNBQVM7UUFFekUsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLElBQUksSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEQsTUFBTSxRQUFRLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sYUFBYSxHQUFHLG1CQUFtQixFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFakQseUNBQXlDO1FBQ3pDLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksYUFBYSxFQUFFLENBQUM7WUFDL0MsSUFBSSxJQUFBLDJCQUFtQixFQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLDhEQUE4RDtnQkFDOUQsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsS0FBSztrQ0FDUixLQUFLLCtCQUErQixNQUFNLENBQUMsTUFBTSxHQUFHLENBQUM7OzBCQUU3RCxRQUFROzs7O3VCQUlYLENBQUMsQ0FBQztZQUNuQixDQUFDO2lCQUFNLElBQUksSUFBQSx3QkFBZ0IsRUFBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUMzQyxxREFBcUQ7Z0JBQ3JELE1BQU0sZUFBZSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN0RixNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLFVBQVUsQ0FBQztnQkFDbEUsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEtBQUssRUFBRSxVQUFVLElBQUksRUFBRSxDQUFDO2dCQUNuRCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDO29CQUNsRCxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsRUFBRSxFQUFFO3dCQUN0RCxNQUFNLEdBQUcsR0FBaUI7NEJBQ3hCLGFBQWEsRUFBRSxRQUFRLFFBQVEsRUFBRTs0QkFDakMsZUFBZSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxzQkFBc0IsUUFBUSxLQUFLLEdBQUcsS0FBSzs0QkFDckUsTUFBTSxFQUFFLGtCQUFrQjt5QkFDM0IsQ0FBQzt3QkFDRixPQUFPLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQ3hELENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO29CQUMvQixDQUFDLENBQUM7MkpBQytJLENBQUM7Z0JBQ3BKLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEtBQUs7a0NBQ1IsS0FBSywrQkFBK0IsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDOzswQkFFN0QsUUFBUTs7O2lDQUdELElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDO2lDQUMvQixlQUFlO2dDQUNoQixLQUFLOzs7RUFHbkMsVUFBVTs7Ozt1QkFJVyxDQUFDLENBQUM7WUFDbkIsQ0FBQztpQkFBTSxJQUFJLElBQUEsMEJBQWtCLEVBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDN0MsNkRBQTZEO2dCQUM3RCxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixLQUFLO2tDQUNSLEtBQUssK0JBQStCLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQzs7MEJBRTdELFFBQVE7Ozs7dUJBSVgsQ0FBQyxDQUFDO1lBQ25CLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1REFBdUQ7Z0JBQ3ZELE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxhQUFhLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDbEYsTUFBTSxtQkFBbUIsR0FBRyxhQUFhLENBQUMsbUJBQW1CLElBQUksRUFBRSxDQUFDO2dCQUNwRSxNQUFNLGNBQWMsR0FBMkgsRUFBRSxDQUFDO2dCQUVsSiwyQ0FBMkM7Z0JBQzNDLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUE2QyxFQUFFLENBQUM7b0JBQ3hHLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQzt3QkFDcEIsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFBLDhCQUFzQixFQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7b0JBQ2hJLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCwwRkFBMEY7Z0JBQzFGLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsVUFBVSxJQUFJLEVBQUUsQ0FBQztnQkFDbkQsTUFBTSxZQUFZLEdBQUcsYUFBYSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUM7Z0JBQ3RELEtBQUssTUFBTSxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7b0JBQ3JFLElBQUksT0FBTyxZQUFZLEtBQUssUUFBUSxJQUFJLFlBQVksS0FBSyxJQUFJLElBQUssWUFBb0IsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7d0JBQ3pHLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZDLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQzt3QkFDbkMsTUFBTSxVQUFVLEdBQUcsUUFBUSxFQUFFLElBQUksSUFBSSxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQ3pELElBQUksV0FBVyxHQUFHLE1BQU0sQ0FBQzt3QkFDekIsSUFBSSxPQUE0RCxDQUFDO3dCQUNqRSxJQUFJLFVBQVUsR0FBUSxRQUFRLEVBQUUsT0FBTyxJQUFJLEVBQUUsQ0FBQzt3QkFDOUMsSUFBSSxRQUFRLEVBQUUsQ0FBQzs0QkFDYixRQUFRLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQ0FDdEIsS0FBSyxRQUFRO29DQUNYLFdBQVcsR0FBRyxRQUFRLENBQUM7b0NBQ3ZCLE9BQU8sR0FBRyxJQUFBLDhCQUFzQixFQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQ0FDbkQsTUFBTTtnQ0FDUixLQUFLLFNBQVM7b0NBQ1osV0FBVyxHQUFHLFFBQVEsQ0FBQztvQ0FDdkIsVUFBVSxHQUFHLFFBQVEsQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDO29DQUN2QyxNQUFNO2dDQUNSLEtBQUssUUFBUTtvQ0FDWCxXQUFXLEdBQUcsUUFBUSxDQUFDO29DQUN2QixVQUFVLEdBQUcsUUFBUSxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUM7b0NBQ25DLE1BQU07Z0NBQ1I7b0NBQ0UsV0FBVyxHQUFHLE1BQU0sQ0FBQztvQ0FDckIsTUFBTTs0QkFDVixDQUFDO3dCQUNILENBQUM7d0JBQ0QsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztvQkFDL0csQ0FBQztnQkFDSCxDQUFDO2dCQUNELE1BQU0sZ0JBQWdCLEdBQUcsYUFBYSxDQUFDLFVBQVU7b0JBQy9DLENBQUMsQ0FBQzs7OzZCQUdpQixRQUFRO3lEQUNvQixRQUFRO21CQUM5QztvQkFDVCxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEtBQUs7a0NBQ1IsS0FBSywrQkFBK0IsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDOzs7MEJBRzdELFFBQVEsY0FBYyxXQUFXOzRCQUMvQixRQUFROzZCQUNQLFFBQVE7aUNBQ0osUUFBUTtpQ0FDUixRQUFROzs7a0JBR3ZCLFFBQVE7a0JBQ1IsUUFBUTtrQkFDUixRQUFRO2tCQUNSLFFBQVE7a0JBQ1IsUUFBUTs7OzZCQUdHLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQzs0QkFDeEMsYUFBYSxDQUFDLFFBQVEsSUFBSSxFQUFFOztrQ0FFckIsYUFBcUIsQ0FBQyxjQUFjLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU87O2tDQUVqRSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQzs7Z0JBRWhELGdCQUFnQjtlQUNqQixRQUFROztFQUVyQix1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDOzs7dUJBR2pCLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTiwrQkFBK0I7WUFDL0IsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsS0FBSztrQ0FDTixLQUFLLCtCQUErQixNQUFNLENBQUMsTUFBTSxHQUFHLENBQUM7RUFDckYsdUJBQXVCLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQzt1QkFDakIsQ0FBQyxDQUFDO1FBQ3JCLENBQUM7SUFDSCxDQUFDO0lBRUQsd0NBQXdDO0lBQ3hDLE1BQU0saUJBQWlCLEdBQUc7UUFDeEIsdUNBQXVDO1FBQ3ZDLGtGQUFrRjtRQUNsRix3RkFBd0Y7UUFDeEYsaURBQWlEO1FBQ2pELHNEQUFzRDtRQUN0RCwyQkFBMkI7UUFDM0IseUNBQXlDO1FBQ3pDLDBEQUEwRDtRQUMxRCxxQ0FBcUM7UUFDckMsK0NBQStDO1FBQy9DLHVDQUF1QztRQUN2Qyw2RUFBNkU7UUFDN0UscUJBQXFCO1FBQ3JCLDREQUE0RDtRQUM1RCw2QkFBNkI7UUFDN0Isb0JBQW9CO1FBQ3BCLG9EQUFvRDtRQUNwRCwyQkFBMkI7UUFDM0IseUNBQXlDO1FBQ3pDLHdEQUF3RDtRQUN4RCxxQ0FBcUM7UUFDckMsK0NBQStDO1FBQy9DLGdDQUFnQztRQUNoQyw2RUFBNkU7UUFDN0UscUJBQXFCO1FBQ3JCLDBEQUEwRDtRQUMxRCw2QkFBNkI7UUFDN0Isb0JBQW9CO1FBQ3BCLHVCQUF1QjtRQUN2QiwwQkFBMEI7UUFDMUIsY0FBYztLQUNmLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2IsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBRS9CLCtDQUErQztJQUMvQyx3REFBd0Q7SUFDeEQsNENBQTRDO0lBQzVDLGdFQUFnRTtJQUNoRSxtREFBbUQ7SUFDbkQsSUFBSSwwQkFBMEIsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxjQUFjLEdBQWEsRUFBRSxDQUFDO0lBQ3BDLElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUN4QixLQUFLLE1BQU0sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDckUsTUFBTSxRQUFRLEdBQUcsSUFBQSwrQkFBVyxFQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN2QyxNQUFNLFNBQVMsR0FBRyxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQztZQUUvQyxJQUFJLElBQUEsMkJBQW1CLEVBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFNBQVMsR0FBRyxJQUFBLDJCQUFjLEVBQUMsU0FBUyxFQUFFLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQzlELE1BQU0sT0FBTyxHQUFHLFNBQVM7b0JBQ3ZCLENBQUMsQ0FBQyxrQkFBa0IsU0FBUyxHQUFHO29CQUNoQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNQLDBCQUEwQixJQUFJO29CQUNsQixHQUFHLGVBQWUsR0FBRzs7YUFFNUIsUUFBUSx3QkFBd0IsR0FBRzs7aUNBRWYsR0FBRzs7cUNBRUMsR0FBRyxpQkFBaUIsT0FBTztpQ0FDL0IsR0FBRztVQUMxQixRQUFRO0NBQ2pCLENBQUM7Z0JBQ00sTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxRQUFRLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUN0RSxVQUFVLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsVUFBVSxHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUNoRSxTQUFTO1lBQ1gsQ0FBQztZQUVELElBQUksSUFBQSx3QkFBZ0IsRUFBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUM3QixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sU0FBUyxHQUFHLElBQUEsMkJBQWMsRUFBQyxTQUFTLEVBQUUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLE1BQU0sT0FBTyxHQUFHLFNBQVM7b0JBQ3ZCLENBQUMsQ0FBQyxrQkFBa0IsU0FBUyxHQUFHO29CQUNoQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNQLDBCQUEwQixJQUFJO21CQUNuQixHQUFHOztlQUVQLFFBQVE7Y0FDVCxRQUFRLCtCQUErQixRQUFROzs7MkJBR2xDLFFBQVEsZ0JBQWdCLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVTs7OytHQUcwQixNQUFNLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQzs7NkZBRXZDLE9BQU87O1NBRTNGLFFBQVEsWUFBWSxRQUFRLFdBQVcsUUFBUSw0QkFBNEIsUUFBUTs7Q0FFM0YsQ0FBQztnQkFDTSxNQUFNLGFBQWEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxNQUFNLFFBQVEsZ0NBQWdDLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3RGLFVBQVUsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxVQUFVLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ2hFLFNBQVM7WUFDWCxDQUFDO1lBRUQsSUFBSSxJQUFBLDBCQUFrQixFQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLDBCQUEwQixJQUFJO21CQUNuQixRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0NBQ3RFLENBQUM7Z0JBQ00sTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxRQUFRLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUN0RSxVQUFVLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsVUFBVSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqSCxTQUFTO1lBQ1gsQ0FBQztZQUVELHdEQUF3RDtZQUN4RCxNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakUsTUFBTSxjQUFjLEdBQUcsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUN2QyxNQUFNLGVBQWUsR0FBRyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxHQUFHLEVBQUUsQ0FBQztZQUM3QyxjQUFjLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDdEMsTUFBTSxVQUFVLEdBQUcsR0FBRyxRQUFRLFFBQVEsQ0FBQztZQUN2QyxNQUFNLGFBQWEsR0FBRyxHQUFHLFFBQVEsV0FBVyxDQUFDO1lBQzdDLE1BQU0sWUFBWSxHQUFHLEdBQUcsUUFBUSxVQUFVLENBQUM7WUFDM0MsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLFFBQVEsZUFBZSxDQUFDO1lBQ3JELE1BQU0sZ0JBQWdCLEdBQUcsR0FBRyxRQUFRLGNBQWMsQ0FBQztZQUNuRCxNQUFNLGlCQUFpQixHQUFHLEdBQUcsUUFBUSxlQUFlLENBQUM7WUFDckQsMEJBQTBCLElBQUk7WUFDeEIsZUFBZTs7Y0FFYixVQUFVOztjQUVWLFVBQVU7OEJBQ00sYUFBYTs2QkFDZCxZQUFZOztvREFFVyxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7NEJBZ0I1QyxnQkFBZ0I7OEJBQ2QsaUJBQWlCOzs7OztjQUtqQyxVQUFVOzZCQUNLLGlCQUFpQjs7NEJBRWxCLGdCQUFnQjs4QkFDZCxpQkFBaUI7Ozs7Ozs7Ozs7U0FVdEMsVUFBVSxLQUFLLFlBQVksb0JBQW9CLGFBQWEsMkJBQTJCLGlCQUFpQiwyQkFBMkIsZ0JBQWdCLDJCQUEyQixpQkFBaUI7O1lBRTVMLGNBQWMsTUFBTSxVQUFVLG9CQUFvQixlQUFlLGNBQWMsUUFBUTtZQUN2RixnQkFBZ0IsTUFBTSxVQUFVLG9CQUFvQixlQUFlO0NBQzlFLENBQUM7WUFDSSw2RkFBNkY7WUFDN0YsTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxRQUFRLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMzRCxVQUFVLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDakUsQ0FBQztRQUNELElBQUksY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM5QiwwQkFBMEIsSUFBSTsrQkFDTCxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztDQUN6RCxDQUFDO1FBQ0UsQ0FBQztRQUNELDhGQUE4RjtRQUM5RixvRUFBb0U7UUFDcEUsTUFBTSxxQkFBcUIsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDaEUsTUFBTSxzQkFBc0IsR0FBRyxtQkFBbUI7WUFDaEQsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFFLENBQXdCLENBQUMsVUFBVSxDQUFDO1lBQy9HLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDVixJQUFJLHFCQUFxQixJQUFJLHNCQUFzQixJQUFJLENBQUMsMEJBQTBCLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztZQUNoSCwwQkFBMEIsR0FBRztDQUNsQyxHQUFHLDBCQUEwQixDQUFDO1FBQzNCLENBQUM7SUFDSCxDQUFDO0lBRUQsMERBQTBEO0lBQzFELE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNsRCxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUM7UUFDOUMsQ0FBQyxDQUFDOzRCQUNzQixTQUFTOzs7OztFQUtuQyxVQUFVO1dBQ0Q7UUFDUCxDQUFDLENBQUMsVUFBVSxDQUFDO0lBRWYsc0VBQXNFO0lBQ3RFLG9HQUFvRztJQUNwRyxNQUFNLG1CQUFtQixHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDN0QsTUFBTSxvQkFBb0IsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTNELDRGQUE0RjtJQUM1RixJQUFJLENBQUMsbUJBQW1CLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQzlGLGtCQUFrQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsbUdBQW1HO0lBQ25HLHNJQUFzSTtJQUN0SSxJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7WUFBRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7WUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVELDhEQUE4RDtJQUM5RCxNQUFNLHNCQUFzQixHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDbkUsSUFBSSxzQkFBc0IsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzFFLGtCQUFrQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQsMkVBQTJFO0lBQzNFLElBQUksb0JBQW9CLEVBQUUsQ0FBQztRQUN6QixZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFDRCxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUM7UUFDekMsQ0FBQyxDQUFDLFlBQVksWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMscUNBQXFDO1FBQzFFLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFVUCxNQUFNLFdBQVcsR0FBcUIsRUFBRSxDQUFDO0lBRXpDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFzQyxFQUFFLGFBQXFCLEVBQUUsRUFBRSxrQkFBMEIsRUFBRSxFQUFFLEVBQUU7UUFDM0gsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLFFBQVEsR0FBRyxJQUFBLCtCQUFXLEVBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEMsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLFVBQVUsSUFBSSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1lBQ3hFLE1BQU0sZ0JBQWdCLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQyxHQUFHLGVBQWUsS0FBSyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1lBRXhGLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzVDLElBQUksVUFBa0IsQ0FBQztnQkFFdkIsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDZixvREFBb0Q7b0JBQ3BELE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUEsK0JBQVcsRUFBQyxVQUFVLENBQUMsQ0FBQztvQkFDNUMsVUFBVSxHQUFHLG1CQUFtQixXQUFXLFVBQVUsV0FBVyxLQUFLLFFBQVEsK0RBQStELENBQUM7Z0JBQy9JLENBQUM7cUJBQU0sQ0FBQztvQkFDTix3QkFBd0I7b0JBQ3hCLFVBQVUsR0FBRyxtQkFBbUIsUUFBUSw2REFBNkQsQ0FBQztnQkFDeEcsQ0FBQztnQkFFRCxXQUFXLENBQUMsSUFBSSxDQUFDO29CQUNmLEtBQUs7b0JBQ0wsUUFBUSxFQUFFLFdBQVc7b0JBQ3JCLFNBQVMsRUFBRSxnQkFBZ0I7b0JBQzNCLFVBQVU7aUJBQ1gsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUVELGlDQUFpQztZQUNqQyxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDOUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUNyRSxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRS9CLG9FQUFvRTtJQUNwRSxNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzs7RUFFbEQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO3VCQUNKLEtBQUssQ0FBQyxTQUFTO3dCQUNkLEtBQUssQ0FBQyxTQUFTOzs7bUNBR0osS0FBSyxDQUFDLFVBQVU7d0JBQzNCLEtBQUssQ0FBQyxLQUFLO2FBQ3RCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO3lCQUNBLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUU3QixxRkFBcUY7SUFDckYsTUFBTSxrQkFBa0IsR0FBYSxFQUFFLENBQUM7SUFDeEMsSUFBSSxnQkFBZ0I7UUFBRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUM1RixJQUFJLG1CQUFtQjtRQUFFLGtCQUFrQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQ3hFLElBQUksZ0JBQWdCO1FBQUUsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDbEUsSUFBSSxrQkFBa0I7UUFBRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUV0RSxJQUFJLHFCQUFxQixHQUFHLGtCQUFrQixDQUFDLE1BQU07UUFDbkQsQ0FBQyxDQUFDLFlBQVksa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQywyQkFBMkI7UUFDdEUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUNQLE1BQU0sY0FBYyxHQUFHLGdCQUFnQixJQUFJLGdCQUFnQixDQUFDO0lBQzVELElBQUksY0FBYyxFQUFFLENBQUM7UUFDbkIscUJBQXFCLElBQUkscUJBQXFCLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsOEZBQThGLENBQUM7SUFDcEwsQ0FBQztJQUNELElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUN4QixxQkFBcUIsSUFBSSxnREFBZ0QsQ0FBQztJQUM1RSxDQUFDO0lBRUQsd0JBQXdCO0lBQ3hCLE1BQU0sY0FBYyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDcEMsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO1FBQ3hCLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCw4RUFBOEU7SUFDOUUsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLHlFQUF5RSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFOUgseUNBQXlDO0lBQ3pDLE1BQU0sZ0JBQWdCLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBRWhHLDhEQUE4RDtJQUM5RCxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDckUsTUFBTSxXQUFXLEdBQUc7SUFDbEIsVUFBVTtHQUNYLENBQUM7SUFFRixvRUFBb0U7SUFDcEUsTUFBTSxrQkFBa0IsR0FBRyxhQUFhO1FBQ3RDLENBQUMsQ0FBQzs7Ozs7OztDQU9MO1FBQ0csQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUVQLE9BQU87O0lBRUwsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQzs7O0lBR2hDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7OztXQUd2QixjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztFQUNsQyxXQUFXLEdBQUcscUJBQXFCOztFQUVuQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMscUVBQXFFLENBQUMsQ0FBQyxDQUFDLEVBQUU7RUFDN0YsZ0JBQWdCLEdBQUcsZUFBZTtFQUNsQyxXQUFXOztFQUVYLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHLGdCQUFnQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUU7O29CQUUvQixnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQUU7OztFQUczRCxrQkFBa0IsR0FBRyxjQUFjLElBQUksc0JBQXNCLENBQUMsQ0FBQyxDQUFDLGdMQUFnTCxDQUFDLENBQUMsQ0FBQyxFQUFFO2NBQ3pPLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0VBQ2hDLDBCQUEwQjtFQUMxQixZQUFZOzs7O0VBSVosTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7O0VBRW5CLGdCQUFnQjs7OztFQUloQixjQUFjOzs7Ozs7RUFNZCxjQUFjLElBQUksc0JBQXNCLENBQUMsQ0FBQyxDQUFDLGtIQUFrSCxDQUFDLENBQUMsQ0FBQywrREFBK0Q7OztDQUdoTyxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBRU8sMENBQWUiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBpbmRleC5qcyBmb3IgR3V0ZW5iZXJnIGJsb2NrIGVkaXRvclxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnLCBpc0JyZWFkY3J1bWJzQ29uZmlnLCBpc1RheG9ub215Q29uZmlnLCBpc1BhZ2luYXRpb25Db25maWcgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0b0Jsb2NrTmFtZSB9IGZyb20gJy4vYmxvY2stanNvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZUpzeFByZXZpZXcsIHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBUaXRsZSBDYXNlXG4gKi9cbmNvbnN0IHRvVGl0bGVDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0clxuICAgIC5zcGxpdCgnXycpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKVxuICAgIC5qb2luKCcgJyk7XG59O1xuXG4vKipcbiAqIENvbnRleHQgZm9yIGdlbmVyYXRpbmcgZmllbGQgY29udHJvbHMgLSBkZXRlcm1pbmVzIGhvdyB2YWx1ZXMgYXJlIGFjY2Vzc2VkIGFuZCB1cGRhdGVkXG4gKi9cbmludGVyZmFjZSBGaWVsZENvbnRleHQge1xuICAvKiogVGhlIHZhcmlhYmxlIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgdmFsdWUgKGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdpdGVtLmltYWdlJykgKi9cbiAgdmFsdWVBY2Nlc3Nvcjogc3RyaW5nO1xuICAvKiogVGhlIG9uQ2hhbmdlIGhhbmRsZXIgY29kZSAoZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyB4OiB2YWx1ZSB9KScgb3IgJ3VwZGF0ZUl0ZW1zKGluZGV4LCBcInhcIiwgdmFsdWUpJykgKi9cbiAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogQmFzZSBpbmRlbnRhdGlvbiAqL1xuICBpbmRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpZWxkIGNvbnRyb2wgZm9yIGFueSBwcm9wZXJ0eSB0eXBlIC0gdW5pZmllZCBmdW5jdGlvbiBmb3IgYm90aCB0b3AtbGV2ZWwgYW5kIG5lc3RlZCBmaWVsZHNcbiAqL1xuY29uc3QgZ2VuZXJhdGVGaWVsZENvbnRyb2wgPSAoXG4gIGZpZWxkS2V5OiBzdHJpbmcsXG4gIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksXG4gIGNvbnRleHQ6IEZpZWxkQ29udGV4dFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgeyB2YWx1ZUFjY2Vzc29yLCBvbkNoYW5nZUhhbmRsZXIsIGluZGVudCB9ID0gY29udGV4dDtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGZpZWxkS2V5KTtcblxuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0JzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuXG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgICAgLy8gcmljaHRleHQgdXNlcyBJbm5lckJsb2NrcyBvbiB0aGUgY2FudmFzIOKAkyBubyBzaWRlYmFyIGNvbnRyb2wgbmVlZGVkXG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGAke2luZGVudH08UmFuZ2VDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAwfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIG1pbj17MH1cbiR7aW5kZW50fSAgbWF4PXsxMDB9XG4ke2luZGVudH0vPmA7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfS5zcmN9IFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWx0PXske3ZhbHVlQWNjZXNzb3J9LmFsdH1cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7IG1heFdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19XG4ke2luZGVudH0gICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvbiBvbkNsaWNrPXtvcGVufSB2YXJpYW50PVwic2Vjb25kYXJ5XCIgc2l6ZT1cInNtYWxsXCI+XG4ke2luZGVudH0gICAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyA/IF9fKCdSZXBsYWNlICR7bGFiZWx9JywgJ2hhbmRvZmYnKSA6IF9fKCdTZWxlY3QgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DbGljaz17KCkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBcXCdcXCcsIGFsdDogXFwnXFwnIH0nKX19XG4ke2luZGVudH0gICAgICAgICAgICB2YXJpYW50PVwibGlua1wiXG4ke2luZGVudH0gICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICApfVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9PC9NZWRpYVVwbG9hZENoZWNrPmA7XG5cbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIC8vIEZvciBsaW5rcywgdXNlIExpbmtDb250cm9sIHdoaWNoIHByb3ZpZGVzIGludGVybmFsIHBhZ2Ugc2VhcmNoIGFuZCBVUkwgdmFsaWRhdGlvblxuICAgICAgY29uc3QgbGlua0hhbmRsZXIgPSBvbkNoYW5nZUhhbmRsZXIoYHsgXG4gICAgICAgIC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIFxuICAgICAgICB1cmw6IHZhbHVlLnVybCB8fCAnJywgXG4gICAgICAgIGxhYmVsOiB2YWx1ZS50aXRsZSB8fCAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiAgICAgICAgb3BlbnNJbk5ld1RhYjogdmFsdWUub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0xpbmsgVGV4dCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LnVybCB8fCAnJywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiR7aW5kZW50fSAgICAgICAgb3BlbnNJbk5ld1RhYjogJHt2YWx1ZUFjY2Vzc29yfT8ub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7bGlua0hhbmRsZXJ9fVxuJHtpbmRlbnR9ICAgICAgc2V0dGluZ3M9e1tcbiR7aW5kZW50fSAgICAgICAgeyBpZDogJ29wZW5zSW5OZXdUYWInLCB0aXRsZTogX18oJ09wZW4gaW4gbmV3IHRhYicsICdoYW5kb2ZmJykgfVxuJHtpbmRlbnR9ICAgICAgXX1cbiR7aW5kZW50fSAgICAgIHNob3dTdWdnZXN0aW9ucz17dHJ1ZX1cbiR7aW5kZW50fSAgICAgIHN1Z2dlc3Rpb25zUXVlcnk9e3sgdHlwZTogJ3Bvc3QnLCBzdWJ0eXBlOiAnYW55JyB9fVxuJHtpbmRlbnR9ICAgIC8+XG4ke2luZGVudH0gIDwvZGl2PlxuJHtpbmRlbnR9PC9kaXY+YDtcblxuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICAvLyBGb3IgYnV0dG9ucywgcHJvdmlkZSBsYWJlbCBmaWVsZCBhbmQgaHJlZiBmaWVsZCB3aXRoIGxpbmsgcGlja2VyXG4gICAgICAvLyBCdXR0b24gcHJvcGVydGllczogbGFiZWwsIGhyZWYsIHRhcmdldCwgcmVsLCBkaXNhYmxlZFxuICAgICAgY29uc3QgYnV0dG9uSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIGhyZWY6IHZhbHVlLnVybCB8fCAnIycsIFxuICAgICAgICB0YXJnZXQ6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnX2JsYW5rJyA6ICcnLFxuICAgICAgICByZWw6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnbm9vcGVuZXIgbm9yZWZlcnJlcicgOiAnJ1xuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0J1dHRvbiBMYWJlbCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LmhyZWYgfHwgJyMnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py50YXJnZXQgPT09ICdfYmxhbmsnXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtidXR0b25IYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fSAgPFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0Rpc2FibGVkJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9Py5kaXNhYmxlZCB8fCBmYWxzZX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBkaXNhYmxlZDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvZGl2PmA7XG5cbiAgICBjYXNlICdzZWxlY3QnOiB7XG4gICAgICBjb25zdCBvcHRpb25zID0gbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhwcm9wZXJ0eS5vcHRpb25zKS5tYXAob3B0ID0+XG4gICAgICAgIGB7IGxhYmVsOiAnJHtvcHQubGFiZWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfScsIHZhbHVlOiAnJHtvcHQudmFsdWV9JyB9YFxuICAgICAgKS5qb2luKCcsICcpO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08U2VsZWN0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9wdGlvbnM9e1ske29wdGlvbnN9XX1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICAgIH1cblxuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIC8vIEhhbmRsZSBzaW1wbGUgc3RyaW5nIGFycmF5cyB3aXRoIGEgcmVwZWF0YWJsZSBsaXN0IGNvbnRyb2xcbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBzaW1wbGUgdHlwZSBhcnJheSAoc3RyaW5nLCBudW1iZXIsIGV0Yy4pIHZzIG9iamVjdCBhcnJheVxuICAgICAgY29uc3QgaXRlbVR5cGUgPSBwcm9wZXJ0eS5pdGVtcz8udHlwZTtcbiAgICAgIGlmICghcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgJiYgKGl0ZW1UeXBlID09PSAnc3RyaW5nJyB8fCAhaXRlbVR5cGUpKSB7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbGlzdCBjb250cm9sIGZvciBzdHJpbmcgYXJyYXlzXG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aW5kZW50fSAgICB7KCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLm1hcCgobGlzdEl0ZW0sIGxpc3RJbmRleCkgPT4gKFxuJHtpbmRlbnR9ICAgICAgPEZsZXgga2V5PXtsaXN0SW5kZXh9IGdhcD17Mn0gYWxpZ249XCJjZW50ZXJcIj5cbiR7aW5kZW50fSAgICAgICAgPGRpdiBzdHlsZT17eyBmbGV4OiAxIH19PlxuJHtpbmRlbnR9ICAgICAgICAgIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgICAgICAgICAgdmFsdWU9e2xpc3RJdGVtIHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKV07XG4ke2luZGVudH0gICAgICAgICAgICAgIG5ld0xpc3RbbGlzdEluZGV4XSA9IHZhbHVlO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICBwbGFjZWhvbGRlcj17X18oJ0VudGVyIGl0ZW0uLi4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LXVwLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSB1cCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA9PT0gMCkgcmV0dXJuO1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggLSAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggLSAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA9PT0gMH1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LWRvd24tYWx0MlwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdNb3ZlIGRvd24nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IGxpc3QgPSAke3ZhbHVlQWNjZXNzb3J9IHx8IFtdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA+PSBsaXN0Lmxlbmd0aCAtIDEpIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4ubGlzdF07XG4ke2luZGVudH0gICAgICAgICAgICBbbmV3TGlzdFtsaXN0SW5kZXhdLCBuZXdMaXN0W2xpc3RJbmRleCArIDFdXSA9IFtuZXdMaXN0W2xpc3RJbmRleCArIDFdLCBuZXdMaXN0W2xpc3RJbmRleF1dO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBkaXNhYmxlZD17bGlzdEluZGV4ID49ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5sZW5ndGggLSAxfVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwidHJhc2hcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLmZpbHRlcigoXywgaSkgPT4gaSAhPT0gbGlzdEluZGV4KTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgKSl9XG4ke2luZGVudH0gICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKSwgJyddO1xuJHtpbmRlbnR9ICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICA+XG4ke2luZGVudH0gICAgICB7X18oJ0FkZCBJdGVtJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgPC9GbGV4PlxuJHtpbmRlbnR9PC9kaXY+YDtcbiAgICAgIH1cbiAgICAgIC8vIEZvciBvYmplY3QgYXJyYXlzLCBmYWxsIHRocm91Z2ggdG8gZGVmYXVsdCAodGhlc2Ugc2hvdWxkIGJlIGhhbmRsZWQgYnkgZ2VuZXJhdGVBcnJheUNvbnRyb2wgYXQgdG9wIGxldmVsKVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZENvbnRyb2xzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydHkucHJvcGVydGllcylcbiAgICAgICAgICAubWFwKChbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgJHt2YWx1ZUFjY2Vzc29yfT8uJHtuZXN0ZWRLZXl9YCxcbiAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgJHtuZXN0ZWRLZXl9OiAke3ZhbH0gfWApLFxuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudCArICcgICdcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2wobmVzdGVkS2V5LCBuZXN0ZWRQcm9wLCBuZXN0ZWRDb250ZXh0KTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtuZXN0ZWRDb250cm9sc31cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFycmF5IChyZXBlYXRlcikgY29udHJvbCB1c2luZyAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudFxuICogUHJvdmlkZXMgZHJhZy1hbmQtZHJvcCByZW9yZGVyaW5nIGFuZCBidWlsdC1pbiBhZGQvcmVtb3ZlIGZ1bmN0aW9uYWxpdHlcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGF0dHJOYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG5cbiAgLy8gR2VuZXJhdGUgZmllbGQgY29udHJvbHMgdGhhdCB1c2Ugc2V0SXRlbSBmcm9tIHRoZSBSZXBlYXRlciByZW5kZXIgcHJvcFxuICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgIGNvbnN0IGZpZWxkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRJdGVtKHsgLi4uaXRlbSwgJHtmaWVsZEtleX06ICR7dmFsdWV9IH0pYCxcbiAgICAgIGluZGVudDogaW5kZW50ICsgJyAgICAgICdcbiAgICB9O1xuICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBmaWVsZENvbnRleHQpO1xuICB9KS5qb2luKCdcXG4nKTtcblxuICAvLyBHZXQgYSBkaXNwbGF5IHRpdGxlIGZyb20gdGhlIGZpcnN0IHRleHQgZmllbGQgaWYgYXZhaWxhYmxlLCBmYWxsYmFjayB0byBmaWVsZCBsYWJlbFxuICBjb25zdCBmaXJzdFRleHRGaWVsZCA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykuZmluZCgoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3RleHQnKTtcbiAgY29uc3QgdGl0bGVBY2Nlc3NvciA9IGZpcnN0VGV4dEZpZWxkID8gYGl0ZW0uJHtmaXJzdFRleHRGaWVsZFswXX0gfHwgYCA6ICcnO1xuICBcbiAgLy8gQ3VzdG9tIGFkZCBidXR0b24gd2l0aCB0ZXJ0aWFyeSBzdHlsaW5nLCBwbHVzIGljb24sIHJpZ2h0IGFsaWduZWRcbiAgLy8gYWRkQnV0dG9uIGlzIGEgZnVuY3Rpb24gdGhhdCByZWNlaXZlcyBhZGRJdGVtIGFuZCByZXR1cm5zIGEgUmVhY3QgZWxlbWVudFxuICBjb25zdCBhZGRCdXR0b25Kc3ggPSBgKGFkZEl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b24td3JhcHBlclwiPlxuJHtpbmRlbnR9ICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgICBvbkNsaWNrPXthZGRJdGVtfVxuJHtpbmRlbnR9ICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHBhdGggZD1cIk0xMSAxMi41VjE3LjVIMTIuNVYxMi41SDE3LjVWMTFIMTIuNVY2SDExVjExSDZWMTIuNUgxMVpcIi8+XG4ke2luZGVudH0gICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvblwiXG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIHtfXygnQWRkICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApYDtcblxuICByZXR1cm4gYCR7aW5kZW50fTxSZXBlYXRlciBcbiR7aW5kZW50fSAgYXR0cmlidXRlPVwiJHthdHRyTmFtZX1cIiBcbiR7aW5kZW50fSAgYWxsb3dSZW9yZGVyaW5nPXt0cnVlfSBcbiR7aW5kZW50fSAgZGVmYXVsdFZhbHVlPXt7fX1cbiR7aW5kZW50fSAgYWRkQnV0dG9uPXske2FkZEJ1dHRvbkpzeH19XG4ke2luZGVudH0+XG4ke2luZGVudH0gIHsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1cIj5cbiR7aW5kZW50fSAgICAgIDxkZXRhaWxzIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2NvbGxhcHNlXCI+XG4ke2luZGVudH0gICAgICAgIDxzdW1tYXJ5IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2hlYWRlclwiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX3RpdGxlXCI+eyR7dGl0bGVBY2Nlc3Nvcn0nJHtsYWJlbH0nfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19hY3Rpb25zXCIgb25DbGljaz17KGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCl9PlxuJHtpbmRlbnR9ICAgICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBvbkNsaWNrPXtyZW1vdmVJdGVtfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk01IDYuNVYxOGEyIDIgMCAwMDIgMmgxMGEyIDIgMCAwMDItMlY2LjVoLTIuNVYxOGEuNS41IDAgMDEtLjUuNUg4YS41LjUgMCAwMS0uNS0uNVY2LjVINXpNOSA5djhoMS41VjlIOXptNC41IDB2OEgxNVY5aC0xLjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk0yMCA1aC01VjMuNUExLjUgMS41IDAgMDAxMy41IDJoLTNBMS41IDEuNSAwIDAwOSAzLjVWNUg0djEuNWgxNlY1em0tNi41IDBoLTNWMy41aDNWNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUgaXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L3N1bW1hcnk+XG4ke2luZGVudH0gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fZmllbGRzXCI+XG4ke2luZGVudH0gICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aXRlbUZpZWxkc31cbiR7aW5kZW50fSAgICAgICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kZXRhaWxzPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApfVxuJHtpbmRlbnR9PC9SZXBlYXRlcj5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0aGUgaW5zcGVjdG9yIGNvbnRyb2wgZm9yIGEgdG9wLWxldmVsIHByb3BlcnR5XG4gKiBVc2VzIGdlbmVyYXRlRmllbGRDb250cm9sIHdpdGggYSBzZXRBdHRyaWJ1dGVzIGNvbnRleHRcbiAqL1xuY29uc3QgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGluZGVudDogc3RyaW5nID0gJyAgICAgICAgICAnKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcblxuICAvLyBGb3IgYXJyYXkgdHlwZSwgdXNlIHRoZSBzcGVjaWFsaXplZCBhcnJheSBjb250cm9sXG4gIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgcmV0dXJuIGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIGF0dHJOYW1lLCBsYWJlbCwgaW5kZW50KTtcbiAgfVxuXG4gIC8vIEZvciBhbGwgb3RoZXIgdHlwZXMsIHVzZSB0aGUgdW5pZmllZCBmaWVsZCBjb250cm9sIGdlbmVyYXRvclxuICBjb25zdCBjb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgdmFsdWVBY2Nlc3NvcjogYXR0ck5hbWUsXG4gICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICBpbmRlbnRcbiAgfTtcblxuICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woa2V5LCBwcm9wZXJ0eSwgY29udGV4dCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGRlZmF1bHQgdmFsdWUgZm9yIGEgcHJvcGVydHkgdHlwZVxuICovXG5jb25zdCBnZXREZWZhdWx0VmFsdWUgPSAoZmllbGRQcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBhbnkgPT4ge1xuICBzd2l0Y2ggKGZpZWxkUHJvcC50eXBlKSB7XG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIHVybDogJycsIG9wZW5zSW5OZXdUYWI6IGZhbHNlIH07XG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiB7IGxhYmVsOiAnJywgaHJlZjogJyMnLCB0YXJnZXQ6ICcnLCByZWw6ICcnLCBkaXNhYmxlZDogZmFsc2UgfTtcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBhbHQ6ICcnIH07XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChmaWVsZFByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZFByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgICBuZXN0ZWRbbmVzdGVkS2V5XSA9IGdldERlZmF1bHRWYWx1ZShuZXN0ZWRQcm9wKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVzdGVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHt9O1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gMDtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gW107XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBoZWxwZXIgZnVuY3Rpb25zIGZvciBhcnJheSBwcm9wZXJ0aWVzXG4gKiBOb3RlOiBXaXRoIHRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCwgd2Ugbm8gbG9uZ2VyIG5lZWQgY3VzdG9tIGFkZC91cGRhdGUvcmVtb3ZlL21vdmUgZnVuY3Rpb25zXG4gKiBUaGUgUmVwZWF0ZXIgaGFuZGxlcyBhbGwgb2YgdGhpcyBpbnRlcm5hbGx5IHZpYSBpdHMgcmVuZGVyIHByb3BcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IHN0cmluZyA9PiB7XG4gIC8vIFRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCBoYW5kbGVzIGFycmF5IG1hbmlwdWxhdGlvbiBpbnRlcm5hbGx5XG4gIC8vIE5vIGN1c3RvbSBoZWxwZXIgZnVuY3Rpb25zIGFyZSBuZWVkZWRcbiAgcmV0dXJuICcnO1xufTtcblxuXG4vKipcbiAqIERldGVybWluaXN0aWMgaGFzaCBvZiBhIHN0cmluZyB0byBhIG51bWJlciBpbiBbMCwgbWF4KS5cbiAqL1xuY29uc3QgaGFzaFN0cmluZyA9IChzdHI6IHN0cmluZywgbWF4OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICBsZXQgaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaCA9ICgoaCA8PCA1KSAtIGggKyBzdHIuY2hhckNvZGVBdChpKSkgfCAwO1xuICB9XG4gIHJldHVybiAoKGggJSBtYXgpICsgbWF4KSAlIG1heDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYW4gU1ZHIGljb24gZWxlbWVudCBzdHJpbmcgZm9yIHVzZSBpbiByZWdpc3RlckJsb2NrVHlwZS5cbiAqIENyZWF0ZXMgYSBjb2xvcmVkIHJvdW5kZWQgcmVjdGFuZ2xlIHdpdGggMS0yIGxldHRlciBpbml0aWFscyBkZXJpdmVkXG4gKiBmcm9tIHRoZSBibG9jayB0aXRsZSwgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvciBrZXllZCB0byB0aGUgZ3JvdXAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlU3ZnSWNvbiA9ICh0aXRsZTogc3RyaW5nLCBncm91cDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgR1JPVVBfQ09MT1JTID0gW1xuICAgICcjNUIyMUI2JywgJyMwRTc0OTAnLCAnI0I0NTMwOScsICcjMDQ3ODU3JyxcbiAgICAnI0JFMTIzQycsICcjNDMzOENBJywgJyMwMzY5QTEnLCAnI0ExNjIwNycsXG4gICAgJyMxNTgwM0QnLCAnIzkzMzNFQScsICcjQzI0MTBDJywgJyMxRDRFRDgnLFxuICAgICcjMDU5NjY5JywgJyM3QzNBRUQnLCAnI0RDMjYyNicsICcjMjU2M0VCJyxcbiAgXTtcblxuICBjb25zdCB3b3JkcyA9IHRpdGxlLnNwbGl0KC9bXFxzXy1dKy8pLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3QgaW5pdGlhbHMgPSB3b3Jkcy5sZW5ndGggPj0gMlxuICAgID8gKHdvcmRzWzBdWzBdICsgd29yZHNbMV1bMF0pLnRvVXBwZXJDYXNlKClcbiAgICA6ICh3b3Jkc1swXT8uc3Vic3RyaW5nKDAsIDIpIHx8ICdITycpLnRvVXBwZXJDYXNlKCk7XG5cbiAgY29uc3QgY29sb3IgPSBHUk9VUF9DT0xPUlNbaGFzaFN0cmluZyhncm91cCB8fCB0aXRsZSwgR1JPVVBfQ09MT1JTLmxlbmd0aCldO1xuXG4gIHJldHVybiBgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPlxuICAgICAgPHJlY3QgeD1cIjJcIiB5PVwiMlwiIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHJ4PVwiNFwiIGZpbGw9XCIke2NvbG9yfVwiIC8+XG4gICAgICA8dGV4dCB4PVwiMTJcIiB5PVwiMTYuNVwiIHRleHRBbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwid2hpdGVcIiBmb250U2l6ZT1cIjEwXCIgZm9udEZhbWlseT1cIi1hcHBsZS1zeXN0ZW0sQmxpbmtNYWNTeXN0ZW1Gb250LHNhbnMtc2VyaWZcIiBmb250V2VpZ2h0PVwiNjAwXCI+JHtpbml0aWFsc308L3RleHQ+XG4gICAgPC9zdmc+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgY29tcGxldGUgaW5kZXguanMgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICogQHBhcmFtIGlubmVyQmxvY2tzRmllbGQgLSBUaGUgcmljaHRleHQgZmllbGQgdGhhdCB1c2VzIElubmVyQmxvY2tzLCBvciBudWxsIGlmIG5vbmVcbiAqIEBwYXJhbSBkZXByZWNhdGlvbnNDb2RlIC0gT3B0aW9uYWwgZGVwcmVjYXRpb24gbWlncmF0aW9uIGNvZGVcbiAqIEBwYXJhbSBoYXNTY3JlZW5zaG90IC0gV2hldGhlciBhIHNjcmVlbnNob3QucG5nIGlzIGF2YWlsYWJsZSBmb3IgaW5zZXJ0ZXIgcHJldmlld1xuICovXG5jb25zdCBnZW5lcmF0ZUluZGV4SnMgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgZHluYW1pY0FycmF5Q29uZmlncz86IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPixcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGwsXG4gIGRlcHJlY2F0aW9uc0NvZGU/OiBzdHJpbmcsXG4gIGhhc1NjcmVlbnNob3Q/OiBib29sZWFuXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSB0b0Jsb2NrTmFtZShjb21wb25lbnQuaWQpO1xuICBjb25zdCBwcm9wZXJ0aWVzID0gY29tcG9uZW50LnByb3BlcnRpZXM7XG5cbiAgLy8gaGFzRHluYW1pY0FycmF5cyBpcyB0cnVlIG9ubHkgd2hlbiB0aGVyZSBhcmUgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZmllbGRzIOKAlFxuICAvLyB0aGUgc2ltcGxlciB0eXBlcyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgZG9uJ3QgbmVlZCBEeW5hbWljUG9zdFNlbGVjdG9yLlxuICBjb25zdCBoYXNEeW5hbWljQXJyYXlzID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKFxuICAgICAgICAoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKVxuICAgICAgKVxuICAgIDogZmFsc2U7XG5cbiAgLy8gSGVscGVyIHRvIGNoZWNrIGZvciBhIHR5cGUgaW4gcHJvcGVydGllcywgaW5jbHVkaW5nIG5lc3RlZCBpbiBhcnJheXMvb2JqZWN0c1xuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAodHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2tQcm9wZXJ0eSA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09IHR5cGUpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AucHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgICAgIH1cbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICB9O1xuXG4gIC8vIFRoZSBpbm5lckJsb2Nrc0ZpZWxkIHVzZXMgSW5uZXJCbG9ja3MgKGNvbnRlbnQgc3RvcmVkIGluIHBvc3RfY29udGVudCwgbm90IGFuIGF0dHJpYnV0ZSkuXG4gIC8vIEFsbCBvdGhlciByaWNodGV4dCBmaWVsZHMgYmVjb21lIHN0cmluZyBhdHRyaWJ1dGVzIHdpdGggUmljaFRleHQgZWRpdGluZy5cbiAgY29uc3QgdXNlSW5uZXJCbG9ja3MgPSAhIWlubmVyQmxvY2tzRmllbGQ7XG5cbiAgLy8gR2V0IGFsbCBhdHRyaWJ1dGUgbmFtZXMg4oCTIGV4Y2x1ZGUgaW5uZXJCbG9ja3NGaWVsZCBhbmQgcGFnaW5hdGlvblxuICBjb25zdCBhdHRyTmFtZXMgPSBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoayA9PiBrICE9PSBpbm5lckJsb2Nrc0ZpZWxkICYmIHByb3BlcnRpZXNba10udHlwZSAhPT0gJ3BhZ2luYXRpb24nKVxuICAgIC5tYXAodG9DYW1lbENhc2UpO1xuXG4gIC8vIEluY2x1ZGUgYW55IGF0dHJpYnV0ZSBuYW1lcyByZWZlcmVuY2VkIGluIHRoZSB0ZW1wbGF0ZSBidXQgbWlzc2luZyBmcm9tIEFQSSBwcm9wZXJ0aWVzXG4gIC8vIChlLmcuIGJvZHkgLT4gYmxvY2tCb2R5IHNvIEpTWCBoYXMgYSBkZWZpbmVkIHZhcmlhYmxlIGFuZCBubyBSZWZlcmVuY2VFcnJvcilcbiAgZm9yIChjb25zdCBuYW1lIG9mIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzKGNvbXBvbmVudC5jb2RlKSkge1xuICAgIGlmICghYXR0ck5hbWVzLmluY2x1ZGVzKG5hbWUpKSBhdHRyTmFtZXMucHVzaChuYW1lKTtcbiAgfVxuICBcbiAgLy8gQWRkIGR5bmFtaWMgYXJyYXkgYXR0cmlidXRlIG5hbWVzIGJhc2VkIG9uIGNvbmZpZyB0eXBlXG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgICAgICBpZiAoKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pIHtcbiAgICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZGApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIGNvbXBvbmVudHMgd2UgbmVlZCB0byBpbXBvcnRcbiAgY29uc3QgbmVlZHNNZWRpYVVwbG9hZCA9IGhhc1Byb3BlcnR5VHlwZSgnaW1hZ2UnKTtcbiAgY29uc3QgbmVlZHNSYW5nZUNvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ251bWJlcicpO1xuICBjb25zdCBuZWVkc1RvZ2dsZUNvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2Jvb2xlYW4nKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuICBjb25zdCBuZWVkc1NlbGVjdENvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ3NlbGVjdCcpO1xuICBjb25zdCBoYXNBcnJheVByb3BzID0gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKHAgPT4gcC50eXBlID09PSAnYXJyYXknKTtcbiAgY29uc3QgaGFzT2JqZWN0UHJvcHMgPSBoYXNQcm9wZXJ0eVR5cGUoJ29iamVjdCcpO1xuXG4gIC8vIEJ1aWxkIGltcG9ydHNcbiAgY29uc3QgYmxvY2tFZGl0b3JJbXBvcnRzID0gWyd1c2VCbG9ja1Byb3BzJywgJ0luc3BlY3RvckNvbnRyb2xzJywgJ0Jsb2NrQ29udHJvbHMnXTtcbiAgaWYgKG5lZWRzTWVkaWFVcGxvYWQpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTWVkaWFVcGxvYWQnLCAnTWVkaWFVcGxvYWRDaGVjaycsICdNZWRpYVJlcGxhY2VGbG93Jyk7XG4gIH1cbiAgLy8gSW5uZXJCbG9ja3MgZm9yIHRoZSBkZXNpZ25hdGVkIHJpY2h0ZXh0IGNvbnRlbnQgYXJlYVxuICBpZiAodXNlSW5uZXJCbG9ja3MpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnSW5uZXJCbG9ja3MnKTtcbiAgfVxuICAvLyBMaW5rQ29udHJvbCBmb3IgbGluay9idXR0b24gZmllbGRzICh3aGVuIG5vdCB1c2luZyBzaGFyZWQgSGFuZG9mZkxpbmtGaWVsZClcbiAgY29uc3QgbmVlZHNMaW5rQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnbGluaycpIHx8IGhhc1Byb3BlcnR5VHlwZSgnYnV0dG9uJyk7XG5cbiAgY29uc3QgaGFzQnJlYWRjcnVtYnNBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNCcmVhZGNydW1ic0NvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNUYXhvbm9teUFycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG4gIGNvbnN0IGhhc1BhZ2luYXRpb25BcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG5cbiAgY29uc3QgY29tcG9uZW50SW1wb3J0cyA9IFsnUGFuZWxCb2R5JywgJ1RleHRDb250cm9sJywgJ0J1dHRvbiddO1xuICBpZiAobmVlZHNSYW5nZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUmFuZ2VDb250cm9sJyk7XG4gIC8vIFRvZ2dsZUNvbnRyb2w6IG9ubHkgZm9yIGJvb2xlYW4vYnV0dG9uIHByb3BlcnR5IGZpZWxkcyDigJQgc3BlY2lhbCBhcnJheSB0eXBlcyB1c2Ugc2hhcmVkIGNvbXBvbmVudHNcbiAgaWYgKG5lZWRzVG9nZ2xlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdUb2dnbGVDb250cm9sJyk7XG4gIC8vIFNlbGVjdENvbnRyb2w6IG9ubHkgZm9yIHNlbGVjdCBwcm9wZXJ0eSBmaWVsZHMgb3IgRHluYW1pY1Bvc3RTZWxlY3RvciAocG9zdHMpIOKAlCB0YXhvbm9teSBoYW5kbGVkIGJ5IFRheG9ub215U2VsZWN0b3JcbiAgaWYgKG5lZWRzU2VsZWN0Q29udHJvbCB8fCBoYXNEeW5hbWljQXJyYXlzKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1NlbGVjdENvbnRyb2wnKTtcbiAgLy8gU3Bpbm5lciBmb3IgZHluYW1pYyBhcnJheSBsb2FkaW5nIHN0YXRlIGluIGVkaXRvciBwcmV2aWV3XG4gIGlmIChoYXNEeW5hbWljQXJyYXlzKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1NwaW5uZXInKTtcblxuICBjb21wb25lbnRJbXBvcnRzLnB1c2goJ0ZsZXgnKTtcblxuICAvLyAxMHVwIGJsb2NrLWNvbXBvbmVudHMgaW1wb3J0c1xuICAvLyBSZXBlYXRlciBpcyBvbmx5IG5lZWRlZCB3aGVuIHRoZXJlIGFyZSBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IGZpZWxkcyBpbiB0aGUgc2lkZWJhclxuICAvLyAodGF4b25vbXkvYnJlYWRjcnVtYnMvcGFnaW5hdGlvbiBhcnJheXMgdXNlIHNoYXJlZCBjb21wb25lbnRzIHRoYXQgaW1wb3J0IFJlcGVhdGVyIHRoZW1zZWx2ZXMpXG4gIGNvbnN0IGhhc05vblNwZWNpYWxBcnJheVByb3BzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PlxuICAgIHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIWR5bmFtaWNBcnJheUNvbmZpZ3M/LltrXSB8fCAhKCdhcnJheVR5cGUnIGluIGR5bmFtaWNBcnJheUNvbmZpZ3Nba10pKVxuICApO1xuICBjb25zdCB0ZW5VcEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChoYXNOb25TcGVjaWFsQXJyYXlQcm9wcykge1xuICAgIHRlblVwSW1wb3J0cy5wdXNoKCdSZXBlYXRlcicpO1xuICB9XG5cbiAgLy8gR2VuZXJhdGUgYXJyYXkgaGVscGVyc1xuICBjb25zdCBhcnJheUhlbHBlcnMgPSBnZW5lcmF0ZUFycmF5SGVscGVycyhwcm9wZXJ0aWVzKTtcblxuICAvLyBHZW5lcmF0ZSBKU1ggcHJldmlldyBmcm9tIGhhbmRsZWJhcnMgdGVtcGxhdGVcbiAgLy8gVGhpcyBtdXN0IGhhcHBlbiBiZWZvcmUgcGFuZWwgZ2VuZXJhdGlvbiBzbyB3ZSBrbm93IHdoaWNoIGZpZWxkcyBoYXZlIGlubGluZSBlZGl0aW5nXG4gIGNvbnN0IHByZXZpZXdSZXN1bHQgPSBnZW5lcmF0ZUpzeFByZXZpZXcoXG4gICAgY29tcG9uZW50LmNvZGUsXG4gICAgcHJvcGVydGllcyxcbiAgICBjb21wb25lbnQuaWQsXG4gICAgY29tcG9uZW50LnRpdGxlLFxuICAgIGlubmVyQmxvY2tzRmllbGRcbiAgKTtcbiAgbGV0IHByZXZpZXdKc3ggPSBwcmV2aWV3UmVzdWx0LmpzeDtcbiAgY29uc3QgaW5saW5lRWRpdGFibGVGaWVsZHMgPSBwcmV2aWV3UmVzdWx0LmlubGluZUVkaXRhYmxlRmllbGRzO1xuXG4gIC8vIERldGVjdCBpZiBwcmV2aWV3IHVzZXMgSGFuZG9mZkxpbmtGaWVsZCAobGluay9idXR0b24gaW5saW5lIGVkaXRpbmcpXG4gIGNvbnN0IHByZXZpZXdVc2VzTGlua0ZpZWxkID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEhhbmRvZmZMaW5rRmllbGQnKTtcblxuICAvLyBHZW5lcmF0ZSBwYW5lbCBib2RpZXMgZm9yIGVhY2ggcHJvcGVydHlcbiAgY29uc3QgcGFuZWxzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgLy8gcmljaHRleHQgdXNlcyBJbm5lckJsb2NrcyBvbiB0aGUgY2FudmFzIOKAkyBubyBzaWRlYmFyIHBhbmVsIG5lZWRlZFxuICAgIC8vIHBhZ2luYXRpb24gaXMgYXV0by1nZW5lcmF0ZWQgZnJvbSBxdWVyeSByZXN1bHRzIOKAkyBubyBzaWRlYmFyIHBhbmVsIG5lZWRlZFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncmljaHRleHQnIHx8IHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG5cbiAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSBpbmxpbmUtZWRpdGFibGUgb24gdGhlIGNhbnZhcyAodGV4dCwgaW1hZ2UsIGxpbmssIGJ1dHRvblxuICAgIC8vIHdyYXBwZWQgaW4ge3sjZmllbGR9fSkg4oCTIHRoZXkgZG9uJ3QgbmVlZCBzaWRlYmFyIGNvbnRyb2xzLlxuICAgIC8vIEFycmF5IGZpZWxkcyBhcmUgYWx3YXlzIGtlcHQ6IHRoZXkgbmVlZCBzaWRlYmFyIFVJIGZvciBtYW51YWwvZHluYW1pYyB0b2dnbGVcbiAgICAvLyBhbmQgZm9yIGFkZGluZy9yZW1vdmluZyBpdGVtcywgZXZlbiB3aGVuIHRoZWlyIGNoaWxkIGZpZWxkcyBhcmUgaW5saW5lLWVkaXRhYmxlLlxuICAgIGlmIChpbmxpbmVFZGl0YWJsZUZpZWxkcy5oYXMoa2V5KSAmJiBwcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcblxuICAgIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBkeW5hbWljQ29uZmlnID0gZHluYW1pY0FycmF5Q29uZmlncz8uW2tleV07XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGR5bmFtaWMgYXJyYXkgZmllbGRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5JyAmJiBkeW5hbWljQ29uZmlnKSB7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBCcmVhZGNydW1iczogc2hhcmVkIGNvbXBvbmVudCB3aXRoIHNpbmdsZSB2aXNpYmlsaXR5IHRvZ2dsZVxuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIEJyZWFkY3J1bWJzICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8QnJlYWRjcnVtYnNTZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gVGF4b25vbXk6IHNoYXJlZCBjb21wb25lbnQgd2l0aCBBdXRvIC8gTWFudWFsIHRhYnNcbiAgICAgICAgY29uc3QgdGF4b25vbXlPcHRpb25zID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQsIHZhbHVlOiB0IH0pKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmtleXMoaXRlbVByb3BzKS5sZW5ndGggPiAwXG4gICAgICAgICAgPyBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGN0eDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWwpID0+IGBzZXRJdGVtKHsgLi4uaXRlbSwgJHtmaWVsZEtleX06ICR7dmFsfSB9KWAsXG4gICAgICAgICAgICAgICAgaW5kZW50OiAnICAgICAgICAgICAgICAgICcsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBjdHgpO1xuICAgICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICAgICAgOiBgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ0xhYmVsJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0ubGFiZWwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIGxhYmVsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPlxuICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ1VSTCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLnVybCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgdXJsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPmA7XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gVGF4b25vbXkgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxUYXhvbm9teVNlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICB0YXhvbm9teU9wdGlvbnM9eyR7SlNPTi5zdHJpbmdpZnkodGF4b25vbXlPcHRpb25zKX19XG4gICAgICAgICAgICAgIGRlZmF1bHRUYXhvbm9teT1cIiR7ZGVmYXVsdFRheG9ub215fVwiXG4gICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgIHJlbmRlck1hbnVhbEl0ZW1zPXsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiAgICAgICAgICAgICAgICA8PlxuJHtpdGVtRmllbGRzfVxuICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIFBhZ2luYXRpb246IHNoYXJlZCBjb21wb25lbnQgd2l0aCBzaW5nbGUgdmlzaWJpbGl0eSB0b2dnbGVcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBQYWdpbmF0aW9uICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8UGFnaW5hdGlvblNlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFBvc3RzIChEeW5hbWljQXJyYXlDb25maWcpOiBmdWxsIER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgY29uc3QgZGVmYXVsdE1vZGUgPSBkeW5hbWljQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICBjb25zdCBpdGVtT3ZlcnJpZGVzQ29uZmlnID0gZHluYW1pY0NvbmZpZy5pdGVtT3ZlcnJpZGVzQ29uZmlnIHx8IHt9O1xuICAgICAgICBjb25zdCBhZHZhbmNlZEZpZWxkczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgb3B0aW9ucz86IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PjsgZGVmYXVsdD86IGFueSB9PiA9IFtdO1xuXG4gICAgICAgIC8vIEZpZWxkcyBmcm9tIGl0ZW1PdmVycmlkZXNDb25maWcgKGxlZ2FjeSlcbiAgICAgICAgZm9yIChjb25zdCBbbmFtZSwgY10gb2YgT2JqZWN0LmVudHJpZXMoaXRlbU92ZXJyaWRlc0NvbmZpZykgYXMgQXJyYXk8W3N0cmluZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWddPikge1xuICAgICAgICAgIGlmIChjLm1vZGUgPT09ICd1aScpIHtcbiAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lLCBsYWJlbDogYy5sYWJlbCwgdHlwZTogJ3NlbGVjdCcsIG9wdGlvbnM6IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoYy5vcHRpb25zKSwgZGVmYXVsdDogYy5kZWZhdWx0IH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpZWxkcyBmcm9tIGZpZWxkTWFwcGluZyB3aXRoIHR5cGU6IFwibWFudWFsXCIg4oCUIGRlcml2ZSBjb250cm9sIHR5cGUgZnJvbSBpdGVtIHByb3BlcnRpZXNcbiAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IGR5bmFtaWNDb25maWcuZmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtmaWVsZFBhdGgsIG1hcHBpbmdWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRNYXBwaW5nKSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgbWFwcGluZ1ZhbHVlID09PSAnb2JqZWN0JyAmJiBtYXBwaW5nVmFsdWUgIT09IG51bGwgJiYgKG1hcHBpbmdWYWx1ZSBhcyBhbnkpLnR5cGUgPT09ICdtYW51YWwnKSB7XG4gICAgICAgICAgICBjb25zdCB0b3BLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1Qcm9wID0gaXRlbVByb3BzW3RvcEtleV07XG4gICAgICAgICAgICBjb25zdCBmaWVsZExhYmVsID0gaXRlbVByb3A/Lm5hbWUgfHwgdG9UaXRsZUNhc2UodG9wS2V5KTtcbiAgICAgICAgICAgIGxldCBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgIGxldCBvcHRpb25zOiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBsZXQgZGVmYXVsdFZhbDogYW55ID0gaXRlbVByb3A/LmRlZmF1bHQgPz8gJyc7XG4gICAgICAgICAgICBpZiAoaXRlbVByb3ApIHtcbiAgICAgICAgICAgICAgc3dpdGNoIChpdGVtUHJvcC50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3NlbGVjdCc7XG4gICAgICAgICAgICAgICAgICBvcHRpb25zID0gbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhpdGVtUHJvcC5vcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAndG9nZ2xlJztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ251bWJlcic7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyAwO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lOiBmaWVsZFBhdGgsIGxhYmVsOiBmaWVsZExhYmVsLCB0eXBlOiBjb250cm9sVHlwZSwgb3B0aW9ucywgZGVmYXVsdDogZGVmYXVsdFZhbCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFnaW5hdGlvblRvZ2dsZSA9IGR5bmFtaWNDb25maWcucGFnaW5hdGlvblxuICAgICAgICAgID8gYFxuICAgICAgICAgICAgICAgIDxUb2dnbGVDb250cm9sXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgUGFnaW5hdGlvbicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICBjaGVja2VkPXske2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkID8/IHRydWV9XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZDogdmFsdWUgfSl9XG4gICAgICAgICAgICAgICAgLz5gXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBEeW5hbWljICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8RHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICAgICAgICB2YWx1ZT17e1xuICAgICAgICAgICAgICAgIHNvdXJjZTogJHthdHRyTmFtZX1Tb3VyY2UgfHwgJyR7ZGVmYXVsdE1vZGV9JyxcbiAgICAgICAgICAgICAgICBwb3N0VHlwZTogJHthdHRyTmFtZX1Qb3N0VHlwZSxcbiAgICAgICAgICAgICAgICBxdWVyeUFyZ3M6ICR7YXR0ck5hbWV9UXVlcnlBcmdzIHx8IHt9LFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9zdHM6ICR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICBpdGVtT3ZlcnJpZGVzOiAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge31cbiAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyhuZXh0VmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoe1xuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9U291cmNlOiBuZXh0VmFsdWUuc291cmNlLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9UG9zdFR5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVF1ZXJ5QXJnczogeyAuLi5uZXh0VmFsdWUucXVlcnlBcmdzLCBwb3N0X3R5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSB9LFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0czogbmV4dFZhbHVlLnNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzOiBuZXh0VmFsdWUuaXRlbU92ZXJyaWRlcyA/PyB7fVxuICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgb3B0aW9ucz17e1xuICAgICAgICAgICAgICAgIHBvc3RUeXBlczogJHtKU09OLnN0cmluZ2lmeShkeW5hbWljQ29uZmlnLnBvc3RUeXBlcyl9LFxuICAgICAgICAgICAgICAgIG1heEl0ZW1zOiAke2R5bmFtaWNDb25maWcubWF4SXRlbXMgPz8gMjB9LFxuICAgICAgICAgICAgICAgIHRleHREb21haW46ICdoYW5kb2ZmJyxcbiAgICAgICAgICAgICAgICBzaG93RGF0ZUZpbHRlcjogJHsoZHluYW1pY0NvbmZpZyBhcyBhbnkpLnNob3dEYXRlRmlsdGVyID09PSB0cnVlID8gJ3RydWUnIDogJ2ZhbHNlJ30sXG4gICAgICAgICAgICAgICAgc2hvd0V4Y2x1ZGVDdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzOiAke0pTT04uc3RyaW5naWZ5KGFkdmFuY2VkRmllbGRzKX1cbiAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIC8+JHtwYWdpbmF0aW9uVG9nZ2xlfVxuICAgICAgICAgICAgeyR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJyAmJiAoXG4gICAgICAgICAgICAgIDw+XG4ke2dlbmVyYXRlUHJvcGVydHlDb250cm9sKGtleSwgcHJvcGVydHkpfVxuICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICl9XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFN0YW5kYXJkIHBhbmVsIChub24tZHluYW1pYylcbiAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4ke2dlbmVyYXRlUHJvcGVydHlDb250cm9sKGtleSwgcHJvcGVydHkpfVxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFkZCBIYW5kb2ZmIGRlc2lnbiBzeXN0ZW0gbGlua3MgcGFuZWxcbiAgY29uc3QgZGVzaWduU3lzdGVtUGFuZWwgPSBbXG4gICAgJyAgICAgICAgICB7LyogRGVzaWduIFN5c3RlbSBMaW5rcyAqL30nLFxuICAgICcgICAgICAgICAgeyhtZXRhZGF0YS5fX2hhbmRvZmY/LmhhbmRvZmZVcmwgfHwgbWV0YWRhdGEuX19oYW5kb2ZmPy5maWdtYVVybCkgJiYgKCcsXG4gICAgJyAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKFxcJ0Rlc2lnbiBTeXN0ZW1cXCcsIFxcJ2hhbmRvZmZcXCcpfSBpbml0aWFsT3Blbj17ZmFsc2V9PicsXG4gICAgJyAgICAgICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT4nLFxuICAgICcgICAgICAgICAgICAgICAge21ldGFkYXRhLl9faGFuZG9mZj8uaGFuZG9mZlVybCAmJiAoJyxcbiAgICAnICAgICAgICAgICAgICAgICAgPEJ1dHRvbicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBocmVmPXttZXRhZGF0YS5fX2hhbmRvZmYuaGFuZG9mZlVybH0nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGljb249XCJ2aXNpYmlsaXR5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBcXCcxMDAlXFwnLCBqdXN0aWZ5Q29udGVudDogXFwnY2VudGVyXFwnIH19JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAge19fKFxcJ1ZpZXcgaW4gSGFuZG9mZlxcJywgXFwnaGFuZG9mZlxcJyl9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPC9CdXR0b24+JyxcbiAgICAnICAgICAgICAgICAgICAgICl9JyxcbiAgICAnICAgICAgICAgICAgICAgIHttZXRhZGF0YS5fX2hhbmRvZmY/LmZpZ21hVXJsICYmICgnLFxuICAgICcgICAgICAgICAgICAgICAgICA8QnV0dG9uJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB2YXJpYW50PVwic2Vjb25kYXJ5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGhyZWY9e21ldGFkYXRhLl9faGFuZG9mZi5maWdtYVVybH0nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGljb249XCJhcnRcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IFxcJzEwMCVcXCcsIGp1c3RpZnlDb250ZW50OiBcXCdjZW50ZXJcXCcgfX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA+JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB7X18oXFwnT3BlbiBpbiBGaWdtYVxcJywgXFwnaGFuZG9mZlxcJyl9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPC9CdXR0b24+JyxcbiAgICAnICAgICAgICAgICAgICAgICl9JyxcbiAgICAnICAgICAgICAgICAgICA8L0ZsZXg+JyxcbiAgICAnICAgICAgICAgICAgPC9QYW5lbEJvZHk+JyxcbiAgICAnICAgICAgICAgICl9JyxcbiAgXS5qb2luKCdcXG4nKTtcbiAgcGFuZWxzLnB1c2goZGVzaWduU3lzdGVtUGFuZWwpO1xuXG4gIC8vIER5bmFtaWMgYXJyYXkgcmVzb2x1dGlvbiBmb3IgZWRpdG9yIHByZXZpZXcuXG4gIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpOiBmdWxsIHVzZVNlbGVjdCByZXNvbHV0aW9uXG4gIC8vIEJyZWFkY3J1bWJzOiBsaXZlIGZldGNoIHZpYSBSRVNUIGVuZHBvaW50XG4gIC8vIFRheG9ub215IChhdXRvIG1vZGUpOiBsaXZlIGZldGNoIHZpYSB1c2VTZWxlY3Qgd2l0aCBjb3JlLWRhdGFcbiAgLy8gUGFnaW5hdGlvbjogc2VydmVyLXJlbmRlcmVkIG9ubHkgKHN0dWIgdmFyaWFibGUpXG4gIGxldCBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSA9ICcnO1xuICBjb25zdCByZXNvbHZpbmdGbGFnczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBwcm9wZXJ0aWVzW2ZpZWxkS2V5XTtcbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCddKTtcbiAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKc1xuICAgICAgICAgID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IFtwcmV2aWV3JHtjYXB9LCBzZXRQcmV2aWV3JHtjYXB9XSA9IHVzZVN0YXRlKG51bGwpO1xuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICBpZiAoISR7YXR0ck5hbWV9RW5hYmxlZCkgeyBzZXRQcmV2aWV3JHtjYXB9KFtdKTsgcmV0dXJuOyB9XG4gICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgaWYgKCFwb3N0SWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgICAgYXBpRmV0Y2goeyBwYXRoOiBcXGAvaGFuZG9mZi92MS9icmVhZGNydW1icz9wb3N0X2lkPVxcJHtwb3N0SWR9XFxgIH0pXG4gICAgICAgIC50aGVuKChpdGVtcykgPT4gc2V0UHJldmlldyR7Y2FwfSgoaXRlbXMgfHwgW10pJHttYXBFeHByfSkpXG4gICAgICAgIC5jYXRjaCgoKSA9PiBzZXRQcmV2aWV3JHtjYXB9KFtdKSk7XG4gICAgfSwgWyR7YXR0ck5hbWV9RW5hYmxlZF0pO1xuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzVGF4b25vbXlDb25maWcoY29uZmlnKSkge1xuICAgICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJywgJ3NsdWcnXSk7XG4gICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnNcbiAgICAgICAgICA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBwcmV2aWV3JHtjYXB9ID0gdXNlU2VsZWN0KFxuICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICBpZiAoISR7YXR0ck5hbWV9RW5hYmxlZCkgcmV0dXJuIFtdO1xuICAgICAgICBpZiAoJHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gJHthdHRyTmFtZX0gfHwgW107XG4gICAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICAgIGlmICghcG9zdElkKSByZXR1cm4gW107XG4gICAgICAgIGNvbnN0IHRheG9ub215ID0gJHthdHRyTmFtZX1UYXhvbm9teSB8fCAnJHtjb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnfSc7XG4gICAgICAgIGNvbnN0IHJlc3RCYXNlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldFRheG9ub215KHRheG9ub215KT8ucmVzdF9iYXNlO1xuICAgICAgICBpZiAoIXJlc3RCYXNlKSByZXR1cm4gW107XG4gICAgICAgIGNvbnN0IHRlcm1zID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldEVudGl0eVJlY29yZHMoJ3RheG9ub215JywgdGF4b25vbXksIHsgcG9zdDogcG9zdElkLCBwZXJfcGFnZTogJHtjb25maWcubWF4SXRlbXMgPz8gLTF9IH0pO1xuICAgICAgICBpZiAoIXRlcm1zKSByZXR1cm4gW107XG4gICAgICAgIHJldHVybiB0ZXJtcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0Lm5hbWUsIHVybDogdC5saW5rIHx8ICcnLCBzbHVnOiB0LnNsdWcgfHwgJycgfSkpJHttYXBFeHByfTtcbiAgICAgIH0sXG4gICAgICBbJHthdHRyTmFtZX1FbmFibGVkLCAke2F0dHJOYW1lfVNvdXJjZSwgJHthdHRyTmFtZX1UYXhvbm9teSwgSlNPTi5zdHJpbmdpZnkoJHthdHRyTmFtZX0gfHwgW10pXVxuICAgICk7XG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZHxTb3VyY2V8VGF4b25vbXkpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBwcmV2aWV3JHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfSA9IFtdOyAvLyBQYWdpbmF0aW9uIHJlbmRlcnMgb24gdGhlIGZyb250ZW5kXG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cyk6IGZ1bGwgdXNlU2VsZWN0IHJlc29sdXRpb25cbiAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICBjb25zdCBwcmV2aWV3VmFyTmFtZSA9IGBwcmV2aWV3JHtjYXB9YDtcbiAgICAgIGNvbnN0IHJlc29sdmVkVmFyTmFtZSA9IGByZXNvbHZlZCR7Y2FwfWA7XG4gICAgICBjb25zdCByZXNvbHZpbmdWYXJOYW1lID0gYGlzUmVzb2x2aW5nJHtjYXB9YDtcbiAgICAgIHJlc29sdmluZ0ZsYWdzLnB1c2gocmVzb2x2aW5nVmFyTmFtZSk7XG4gICAgICBjb25zdCBzb3VyY2VBdHRyID0gYCR7YXR0ck5hbWV9U291cmNlYDtcbiAgICAgIGNvbnN0IHF1ZXJ5QXJnc0F0dHIgPSBgJHthdHRyTmFtZX1RdWVyeUFyZ3NgO1xuICAgICAgY29uc3QgcG9zdFR5cGVBdHRyID0gYCR7YXR0ck5hbWV9UG9zdFR5cGVgO1xuICAgICAgY29uc3Qgc2VsZWN0ZWRQb3N0c0F0dHIgPSBgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYDtcbiAgICAgIGNvbnN0IGZpZWxkTWFwcGluZ0F0dHIgPSBgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgO1xuICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0F0dHIgPSBgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYDtcbiAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCAke3Jlc29sdmVkVmFyTmFtZX0gPSB1c2VTZWxlY3QoXG4gICAgICAoc2VsZWN0KSA9PiB7XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAnbWFudWFsJykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgc3RvcmUgPSBzZWxlY3QoY29yZURhdGFTdG9yZSk7XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAncXVlcnknKSB7XG4gICAgICAgICAgY29uc3QgcXVlcnlBcmdzID0gJHtxdWVyeUFyZ3NBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBwb3N0VHlwZSA9ICR7cG9zdFR5cGVBdHRyfSB8fCAncG9zdCc7XG4gICAgICAgICAgY29uc3QgYXJncyA9IHtcbiAgICAgICAgICAgIHBlcl9wYWdlOiBxdWVyeUFyZ3MucG9zdHNfcGVyX3BhZ2UgfHwgJHtjb25maWcubWF4SXRlbXMgPz8gNn0sXG4gICAgICAgICAgICBvcmRlcmJ5OiBxdWVyeUFyZ3Mub3JkZXJieSB8fCAnZGF0ZScsXG4gICAgICAgICAgICBvcmRlcjogKHF1ZXJ5QXJncy5vcmRlciB8fCAnREVTQycpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICBfZW1iZWQ6IHRydWUsXG4gICAgICAgICAgICBzdGF0dXM6ICdwdWJsaXNoJyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmIChxdWVyeUFyZ3MudGF4X3F1ZXJ5ICYmIHF1ZXJ5QXJncy50YXhfcXVlcnkubGVuZ3RoKSB7XG4gICAgICAgICAgICBxdWVyeUFyZ3MudGF4X3F1ZXJ5LmZvckVhY2goKHRxKSA9PiB7XG4gICAgICAgICAgICAgIGlmICghdHEudGF4b25vbXkgfHwgIXRxLnRlcm1zIHx8ICF0cS50ZXJtcy5sZW5ndGgpIHJldHVybjtcbiAgICAgICAgICAgICAgY29uc3QgcGFyYW0gPSB0cS50YXhvbm9teSA9PT0gJ2NhdGVnb3J5JyA/ICdjYXRlZ29yaWVzJyA6IHRxLnRheG9ub215ID09PSAncG9zdF90YWcnID8gJ3RhZ3MnIDogdHEudGF4b25vbXk7XG4gICAgICAgICAgICAgIGFyZ3NbcGFyYW1dID0gdHEudGVybXMuam9pbignLCcpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHJlY29yZHMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmRzKCdwb3N0VHlwZScsIHBvc3RUeXBlLCBhcmdzKTtcbiAgICAgICAgICBpZiAocmVjb3JkcyA9PT0gbnVsbCB8fCByZWNvcmRzID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHJlY29yZHMpKSByZXR1cm4gW107XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge307XG4gICAgICAgICAgcmV0dXJuIHJlY29yZHMubWFwKChyZWMpID0+XG4gICAgICAgICAgICBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdzZWxlY3QnKSB7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSAke3NlbGVjdGVkUG9zdHNBdHRyfSB8fCBbXTtcbiAgICAgICAgICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgcmV0dXJuIFtdO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIHJldHVybiBzZWxlY3RlZFxuICAgICAgICAgICAgLm1hcCgoc2VsKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlYyA9IHN0b3JlLmdldEVudGl0eVJlY29yZCgncG9zdFR5cGUnLCBzZWwudHlwZSB8fCAncG9zdCcsIHNlbC5pZCk7XG4gICAgICAgICAgICAgIHJldHVybiByZWMgPyBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KSA6IG51bGw7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9LFxuICAgICAgWyR7c291cmNlQXR0cn0sICR7cG9zdFR5cGVBdHRyfSwgSlNPTi5zdHJpbmdpZnkoJHtxdWVyeUFyZ3NBdHRyfSB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7c2VsZWN0ZWRQb3N0c0F0dHJ9IHx8IFtdKSwgSlNPTi5zdHJpbmdpZnkoJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9KV1cbiAgICApO1xuICAgIGNvbnN0ICR7cHJldmlld1Zhck5hbWV9ID0gJHtzb3VyY2VBdHRyfSAhPT0gJ21hbnVhbCcgPyAoJHtyZXNvbHZlZFZhck5hbWV9ID8/IFtdKSA6ICgke2F0dHJOYW1lfSA/PyBbXSk7XG4gICAgY29uc3QgJHtyZXNvbHZpbmdWYXJOYW1lfSA9ICR7c291cmNlQXR0cn0gIT09ICdtYW51YWwnICYmICR7cmVzb2x2ZWRWYXJOYW1lfSA9PT0gdW5kZWZpbmVkO1xuYDtcbiAgICAgIC8vIFVzZSBwcmV2aWV3IHZhcmlhYmxlIGluIHRoZSBnZW5lcmF0ZWQgcHJldmlldyBKU1ggc28gdGhlIGVkaXRvciBzaG93cyBxdWVyeS9zZWxlY3QgcmVzdWx0c1xuICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYmAsICdnJyk7XG4gICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIHByZXZpZXdWYXJOYW1lKTtcbiAgICB9XG4gICAgaWYgKHJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDApIHtcbiAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBpc1ByZXZpZXdMb2FkaW5nID0gJHtyZXNvbHZpbmdGbGFncy5qb2luKCcgfHwgJyl9O1xuYDtcbiAgICB9XG4gICAgLy8gV2hlbiBwcmV2aWV3IEpTWCByZWZlcmVuY2VzIHBhZ2luYXRpb24gKGZyb20gSEJTKSBidXQgcGFnaW5hdGlvbiBpcyBvbmx5IGJ1aWx0IHNlcnZlci1zaWRlLFxuICAgIC8vIGRlZmluZSBpdCBpbiB0aGUgZWRpdCBzbyB0aGUgZWRpdG9yIGRvZXNuJ3QgdGhyb3cgUmVmZXJlbmNlRXJyb3IuXG4gICAgY29uc3QgcHJldmlld1VzZXNQYWdpbmF0aW9uID0gL1xcYnBhZ2luYXRpb25cXGIvLnRlc3QocHJldmlld0pzeCk7XG4gICAgY29uc3QgYW55Q29uZmlnSGFzUGFnaW5hdGlvbiA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiAhKCdhcnJheVR5cGUnIGluIGMpICYmICEhKGMgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uKVxuICAgICAgOiBmYWxzZTtcbiAgICBpZiAocHJldmlld1VzZXNQYWdpbmF0aW9uICYmIGFueUNvbmZpZ0hhc1BhZ2luYXRpb24gJiYgIWR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlLmluY2x1ZGVzKCdjb25zdCBwYWdpbmF0aW9uJykpIHtcbiAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlID0gYCAgICBjb25zdCBwYWdpbmF0aW9uID0gW107IC8vIEVkaXRvcjogcGFnaW5hdGlvbiBpcyBidWlsdCBzZXJ2ZXItc2lkZSBpbiByZW5kZXIucGhwXG5gICsgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGU7XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB1c2luZyBkeW5hbWljIHBvc3RzLCB3cmFwIHByZXZpZXcgaW4gbG9hZGluZyBzdGF0ZVxuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnQuaWQucmVwbGFjZSgvXy9nLCAnLScpO1xuICBjb25zdCBwcmV2aWV3Q29udGVudCA9IHJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDBcbiAgICA/IGB7aXNQcmV2aWV3TG9hZGluZyA/IChcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyBpcy1sb2FkaW5nXCIgc3R5bGU9e3sgbWluSGVpZ2h0OiAnMTIwcHgnLCBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGdhcDogJzhweCcgfX0+XG4gICAgICAgICAgICA8U3Bpbm5lciAvPlxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgY29sb3I6ICd2YXIoLS13cC1hZG1pbi10aGVtZS1jb2xvci1kYXJrZXIsICMxZTFlMWUpJyB9fT57X18oJ0xvYWRpbmcgcG9zdHPigKYnLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKSA6IChcbiR7cHJldmlld0pzeH1cbiAgICAgICAgKX1gXG4gICAgOiBwcmV2aWV3SnN4O1xuXG4gIC8vIENoZWNrIHRoZSBnZW5lcmF0ZWQgcHJldmlldyBmb3IgY29tcG9uZW50cyB0aGF0IG5lZWQgdG8gYmUgaW1wb3J0ZWRcbiAgLy8gVGhpcyBjYXRjaGVzIGNvbXBvbmVudHMgYWRkZWQgYnkgdGhlIGhhbmRsZWJhcnMtdG8tanN4IHRyYW5zcGlsZXIgKGUuZy4sIGZyb20ge3sjZmllbGR9fSBtYXJrZXJzKVxuICBjb25zdCBwcmV2aWV3VXNlc1JpY2hUZXh0ID0gcHJldmlld0pzeC5pbmNsdWRlcygnPFJpY2hUZXh0Jyk7XG4gIGNvbnN0IHByZXZpZXdVc2VzMTB1cEltYWdlID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJyk7XG5cbiAgLy8gQWRkIFJpY2hUZXh0IHRvIGltcG9ydHMgaWYgdXNlZCBpbiBwcmV2aWV3IChhbmQgbm90IGFscmVhZHkgaW5jbHVkZWQgZnJvbSBwcm9wZXJ0eSB0eXBlcylcbiAgaWYgKChwcmV2aWV3VXNlc1JpY2hUZXh0IHx8IHByZXZpZXdVc2VzTGlua0ZpZWxkKSAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cblxuICAvLyBMaW5rQ29udHJvbCBpcyBuZWVkZWQgZm9yIHNpZGViYXIgbGluay9idXR0b24gcHJvcGVydHkgcGFuZWxzOyBhZGQgdW5jb25kaXRpb25hbGx5IHdoZW4gcHJlc2VudC5cbiAgLy8gKEhhbmRvZmZMaW5rRmllbGQgaW4gdGhlIHByZXZpZXcgaXMgc2VwYXJhdGUg4oCUIGl0J3MgaW1wb3J0ZWQgZnJvbSB0aGUgc2hhcmVkIGNvbXBvbmVudCBhbmQgaGFuZGxlcyBpdHMgb3duIExpbmtDb250cm9sIGludGVybmFsbHkuKVxuICBpZiAobmVlZHNMaW5rQ29udHJvbCkge1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdMaW5rQ29udHJvbCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTGlua0NvbnRyb2wnKTtcbiAgICBpZiAoIWNvbXBvbmVudEltcG9ydHMuaW5jbHVkZXMoJ1BvcG92ZXInKSkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdQb3BvdmVyJyk7XG4gIH1cblxuICAvLyBBZGQgSW5uZXJCbG9ja3MgaWYgdXNlZCBpbiBwcmV2aWV3IGJ1dCBub3QgYWxyZWFkeSBpbXBvcnRlZFxuICBjb25zdCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gcHJldmlld0pzeC5pbmNsdWRlcygnPElubmVyQmxvY2tzJyk7XG4gIGlmIChwcmV2aWV3VXNlc0lubmVyQmxvY2tzICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0lubmVyQmxvY2tzJykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnSW5uZXJCbG9ja3MnKTtcbiAgfVxuXG4gIC8vIEJ1aWxkIHRoZSAxMHVwIGltcG9ydCBpZiBuZWVkZWQgKEltYWdlIGZvciBwcmV2aWV3LCBSZXBlYXRlciBmb3IgYXJyYXlzKVxuICBpZiAocHJldmlld1VzZXMxMHVwSW1hZ2UpIHtcbiAgICB0ZW5VcEltcG9ydHMucHVzaCgnSW1hZ2UnKTtcbiAgfVxuICBjb25zdCB0ZW5VcEltcG9ydCA9IHRlblVwSW1wb3J0cy5sZW5ndGggPiAwXG4gICAgPyBgaW1wb3J0IHsgJHt0ZW5VcEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gXG4gICAgOiAnJztcblxuICAvLyBDb2xsZWN0IGFsbCBpbWFnZSBmaWVsZHMgZm9yIEJsb2NrQ29udHJvbHMvTWVkaWFSZXBsYWNlRmxvd1xuICBpbnRlcmZhY2UgSW1hZ2VGaWVsZEluZm8ge1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgYXR0clBhdGg6IHN0cmluZzsgIC8vIGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdsZWZ0Q2FyZC5pbWFnZSdcbiAgICB2YWx1ZUV4cHI6IHN0cmluZzsgLy8gZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2xlZnRDYXJkPy5pbWFnZSdcbiAgICB1cGRhdGVFeHByOiBzdHJpbmc7IC8vIGUuZy4sICdzZXRBdHRyaWJ1dGVzKHsgYmFja2dyb3VuZEltYWdlOiAuLi4gfSknIG9yIG5lc3RlZCB1cGRhdGVcbiAgfVxuICBcbiAgY29uc3QgaW1hZ2VGaWVsZHM6IEltYWdlRmllbGRJbmZvW10gPSBbXTtcbiAgXG4gIGNvbnN0IGNvbGxlY3RJbWFnZUZpZWxkcyA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcGFyZW50UGF0aDogc3RyaW5nID0gJycsIHBhcmVudFZhbHVlUGF0aDogc3RyaW5nID0gJycpID0+IHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgICAgY29uc3QgY3VycmVudFBhdGggPSBwYXJlbnRQYXRoID8gYCR7cGFyZW50UGF0aH0uJHthdHRyTmFtZX1gIDogYXR0ck5hbWU7XG4gICAgICBjb25zdCBjdXJyZW50VmFsdWVQYXRoID0gcGFyZW50VmFsdWVQYXRoID8gYCR7cGFyZW50VmFsdWVQYXRofT8uJHthdHRyTmFtZX1gIDogYXR0ck5hbWU7XG4gICAgICBcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBwcm9wLm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICAgICAgbGV0IHVwZGF0ZUV4cHI6IHN0cmluZztcbiAgICAgICAgXG4gICAgICAgIGlmIChwYXJlbnRQYXRoKSB7XG4gICAgICAgICAgLy8gTmVzdGVkIGltYWdlIGZpZWxkIC0gbmVlZCB0byBzcHJlYWQgcGFyZW50IG9iamVjdFxuICAgICAgICAgIGNvbnN0IHBhcmVudEF0dHIgPSBwYXJlbnRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgY29uc3QgcGFyZW50Q2FtZWwgPSB0b0NhbWVsQ2FzZShwYXJlbnRBdHRyKTtcbiAgICAgICAgICB1cGRhdGVFeHByID0gYHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudENhbWVsfTogeyAuLi4ke3BhcmVudENhbWVsfSwgJHthdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9IH0pYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUb3AtbGV2ZWwgaW1hZ2UgZmllbGRcbiAgICAgICAgICB1cGRhdGVFeHByID0gYHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0pYDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaW1hZ2VGaWVsZHMucHVzaCh7XG4gICAgICAgICAgbGFiZWwsXG4gICAgICAgICAgYXR0clBhdGg6IGN1cnJlbnRQYXRoLFxuICAgICAgICAgIHZhbHVlRXhwcjogY3VycmVudFZhbHVlUGF0aCxcbiAgICAgICAgICB1cGRhdGVFeHByXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBSZWN1cnNlIGludG8gb2JqZWN0IHByb3BlcnRpZXNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb2xsZWN0SW1hZ2VGaWVsZHMocHJvcC5wcm9wZXJ0aWVzLCBjdXJyZW50UGF0aCwgY3VycmVudFZhbHVlUGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBcbiAgY29sbGVjdEltYWdlRmllbGRzKHByb3BlcnRpZXMpO1xuICBcbiAgLy8gR2VuZXJhdGUgQmxvY2tDb250cm9scyB3aXRoIE1lZGlhUmVwbGFjZUZsb3cgZm9yIGVhY2ggaW1hZ2UgZmllbGRcbiAgY29uc3QgYmxvY2tDb250cm9sc0pzeCA9IGltYWdlRmllbGRzLmxlbmd0aCA+IDAgPyBgXG4gICAgICAgIDxCbG9ja0NvbnRyb2xzIGdyb3VwPVwib3RoZXJcIj5cbiR7aW1hZ2VGaWVsZHMubWFwKGZpZWxkID0+IGAgICAgICAgICAgPE1lZGlhUmVwbGFjZUZsb3dcbiAgICAgICAgICAgIG1lZGlhSWQ9eyR7ZmllbGQudmFsdWVFeHByfT8uaWR9XG4gICAgICAgICAgICBtZWRpYVVybD17JHtmaWVsZC52YWx1ZUV4cHJ9Py5zcmN9XG4gICAgICAgICAgICBhbGxvd2VkVHlwZXM9e1snaW1hZ2UnXX1cbiAgICAgICAgICAgIGFjY2VwdD1cImltYWdlLypcIlxuICAgICAgICAgICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtmaWVsZC51cGRhdGVFeHByfX1cbiAgICAgICAgICAgIG5hbWU9e19fKCcke2ZpZWxkLmxhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgLz5gKS5qb2luKCdcXG4nKX1cbiAgICAgICAgPC9CbG9ja0NvbnRyb2xzPmAgOiAnJztcblxuICAvLyBTaGFyZWQgY29tcG9uZW50IGltcG9ydHMgZm9yIGR5bmFtaWMgYXJyYXlzIChzZWxlY3RvciBVSSArIGVkaXRvciBwcmV2aWV3IG1hcHBpbmcpXG4gIGNvbnN0IHNoYXJlZE5hbWVkSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGhhc0R5bmFtaWNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdEeW5hbWljUG9zdFNlbGVjdG9yJywgJ21hcFBvc3RFbnRpdHlUb0l0ZW0nKTtcbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmIChoYXNUYXhvbm9teUFycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnVGF4b25vbXlTZWxlY3RvcicpO1xuICBpZiAoaGFzUGFnaW5hdGlvbkFycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnUGFnaW5hdGlvblNlbGVjdG9yJyk7XG5cbiAgbGV0IHNoYXJlZENvbXBvbmVudEltcG9ydCA9IHNoYXJlZE5hbWVkSW1wb3J0cy5sZW5ndGhcbiAgICA/IGBpbXBvcnQgeyAke3NoYXJlZE5hbWVkSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJy4uLy4uL3NoYXJlZCc7XFxuYFxuICAgIDogJyc7XG4gIGNvbnN0IG5lZWRzRGF0YVN0b3JlID0gaGFzRHluYW1pY0FycmF5cyB8fCBoYXNUYXhvbm9teUFycmF5O1xuICBpZiAobmVlZHNEYXRhU3RvcmUpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IHVzZVNlbGVjdCR7aGFzQnJlYWRjcnVtYnNBcnJheSA/ICcsIHNlbGVjdCcgOiAnJ30gfSBmcm9tICdAd29yZHByZXNzL2RhdGEnO1xcbmltcG9ydCB7IHN0b3JlIGFzIGNvcmVEYXRhU3RvcmUgfSBmcm9tICdAd29yZHByZXNzL2NvcmUtZGF0YSc7XFxuYDtcbiAgfVxuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IGFwaUZldGNoIGZyb20gJ0B3b3JkcHJlc3MvYXBpLWZldGNoJztcXG5gO1xuICB9XG5cbiAgLy8gQnVpbGQgZWxlbWVudCBpbXBvcnRzXG4gIGNvbnN0IGVsZW1lbnRJbXBvcnRzID0gWydGcmFnbWVudCddO1xuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkge1xuICAgIGVsZW1lbnRJbXBvcnRzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuICB9XG5cbiAgLy8gSW1wb3J0IHNoYXJlZCBIYW5kb2ZmTGlua0ZpZWxkIHdoZW4gcHJldmlldyB1c2VzIGxpbmsvYnV0dG9uIGlubGluZSBlZGl0aW5nXG4gIGNvbnN0IGxpbmtGaWVsZEltcG9ydCA9IHByZXZpZXdVc2VzTGlua0ZpZWxkID8gYGltcG9ydCB7IEhhbmRvZmZMaW5rRmllbGQgfSBmcm9tICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9MaW5rRmllbGQnO1xcbmAgOiAnJztcblxuICAvLyBTY3JlZW5zaG90IGltcG9ydCBmb3IgaW5zZXJ0ZXIgcHJldmlld1xuICBjb25zdCBzY3JlZW5zaG90SW1wb3J0ID0gaGFzU2NyZWVuc2hvdCA/IGBpbXBvcnQgc2NyZWVuc2hvdFVybCBmcm9tICcuL3NjcmVlbnNob3QucG5nJztcXG5gIDogJyc7XG5cbiAgLy8gU1ZHIGljb24gZm9yIHRoZSBibG9jayAodW5pcXVlIHBlciBibG9jaywgY29sb3JlZCBieSBncm91cClcbiAgY29uc3Qgc3ZnSWNvblN0ciA9IGdlbmVyYXRlU3ZnSWNvbihjb21wb25lbnQudGl0bGUsIGNvbXBvbmVudC5ncm91cCk7XG4gIGNvbnN0IHN2Z0ljb25Db2RlID0gYGNvbnN0IGJsb2NrSWNvbiA9IChcbiAgJHtzdmdJY29uU3RyfVxuKTtgO1xuXG4gIC8vIEluc2VydGVyIHByZXZpZXc6IHNob3cgc2NyZWVuc2hvdCBpbWFnZSBpbnN0ZWFkIG9mIGxpdmUtcmVuZGVyaW5nXG4gIGNvbnN0IHByZXZpZXdFYXJseVJldHVybiA9IGhhc1NjcmVlbnNob3RcbiAgICA/IGAgICAgaWYgKGF0dHJpYnV0ZXMuX19wcmV2aWV3KSB7XG4gICAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiAgICAgICAgICA8aW1nIHNyYz17c2NyZWVuc2hvdFVybH0gYWx0PXttZXRhZGF0YS50aXRsZX0gc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX0gLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICApO1xuICAgIH1cbmBcbiAgICA6ICcnO1xuXG4gIHJldHVybiBgaW1wb3J0IHsgcmVnaXN0ZXJCbG9ja1R5cGUgfSBmcm9tICdAd29yZHByZXNzL2Jsb2Nrcyc7XG5pbXBvcnQgeyBcbiAgJHtibG9ja0VkaXRvckltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic7XG5pbXBvcnQgeyBcbiAgJHtjb21wb25lbnRJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9jb21wb25lbnRzJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2VsZW1lbnQnO1xuJHt0ZW5VcEltcG9ydH0ke3NoYXJlZENvbXBvbmVudEltcG9ydH1pbXBvcnQgbWV0YWRhdGEgZnJvbSAnLi9ibG9jay5qc29uJztcbmltcG9ydCAnLi9lZGl0b3Iuc2Nzcyc7XG4ke2hhc0R5bmFtaWNBcnJheXMgPyBcImltcG9ydCAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvRHluYW1pY1Bvc3RTZWxlY3Rvci5lZGl0b3Iuc2Nzcyc7XFxuXCIgOiAnJ31pbXBvcnQgJy4vc3R5bGUuc2Nzcyc7XG4ke3NjcmVlbnNob3RJbXBvcnR9JHtsaW5rRmllbGRJbXBvcnR9XG4ke3N2Z0ljb25Db2RlfVxuXG4ke2RlcHJlY2F0aW9uc0NvZGUgPyBgJHtkZXByZWNhdGlvbnNDb2RlfVxcblxcbmAgOiAnJ31yZWdpc3RlckJsb2NrVHlwZShtZXRhZGF0YS5uYW1lLCB7XG4gIC4uLm1ldGFkYXRhLFxuICBpY29uOiBibG9ja0ljb24sJHtkZXByZWNhdGlvbnNDb2RlID8gJ1xcbiAgZGVwcmVjYXRlZCwnIDogJyd9XG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke3ByZXZpZXdFYXJseVJldHVybn0ke3VzZUlubmVyQmxvY2tzIHx8IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyBcIiAgICBjb25zdCBDT05URU5UX0JMT0NLUyA9IFsnY29yZS9wYXJhZ3JhcGgnLCdjb3JlL2hlYWRpbmcnLCdjb3JlL2xpc3QnLCdjb3JlL2xpc3QtaXRlbScsJ2NvcmUvcXVvdGUnLCdjb3JlL2ltYWdlJywnY29yZS9zZXBhcmF0b3InLCdjb3JlL2h0bWwnLCdjb3JlL2J1dHRvbnMnLCdjb3JlL2J1dHRvbiddO1wiIDogJyd9XG4gICAgY29uc3QgeyAke2F0dHJOYW1lcy5qb2luKCcsICcpfSB9ID0gYXR0cmlidXRlcztcbiR7ZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGV9XG4ke2FycmF5SGVscGVyc31cbiAgICByZXR1cm4gKFxuICAgICAgPEZyYWdtZW50PlxuICAgICAgICA8SW5zcGVjdG9yQ29udHJvbHM+XG4ke3BhbmVscy5qb2luKCdcXG5cXG4nKX1cbiAgICAgICAgPC9JbnNwZWN0b3JDb250cm9scz5cbiR7YmxvY2tDb250cm9sc0pzeH1cblxuICAgICAgICB7LyogRWRpdG9yIFByZXZpZXcgKi99XG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuJHtwcmV2aWV3Q29udGVudH1cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L0ZyYWdtZW50PlxuICAgICk7XG4gIH0sXG4gIHNhdmU6ICgpID0+IHtcbiR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/ICcgICAgLy8gSW5uZXJCbG9ja3MgY29udGVudCBtdXN0IGJlIHNhdmVkIHNvIGl0IGlzIHBlcnNpc3RlZCBpbiBwb3N0IGNvbnRlbnRcXG4gICAgcmV0dXJuIDxJbm5lckJsb2Nrcy5Db250ZW50IC8+OycgOiAnICAgIC8vIFNlcnZlci1zaWRlIHJlbmRlcmluZyB2aWEgcmVuZGVyLnBocFxcbiAgICByZXR1cm4gbnVsbDsnfVxuICB9LFxufSk7XG5gO1xufTtcblxuZXhwb3J0IHsgZ2VuZXJhdGVJbmRleEpzLCBnZW5lcmF0ZVN2Z0ljb24sIHRvVGl0bGVDYXNlLCBnZW5lcmF0ZUZpZWxkQ29udHJvbCwgZ2VuZXJhdGVBcnJheUNvbnRyb2wsIGdlbmVyYXRlUHJvcGVydHlDb250cm9sIH07XG5leHBvcnQgdHlwZSB7IEZpZWxkQ29udGV4dCB9O1xuIl19