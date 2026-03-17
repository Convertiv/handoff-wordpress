/**
 * Generates index.js for Gutenberg block editor
 */

import { HandoffComponent, HandoffProperty, DynamicArrayConfig, ItemOverrideFieldConfig } from '../types';
import { toBlockName } from './block-json';
import { generateJsxPreview, toCamelCase } from './handlebars-to-jsx';
import { normalizeSelectOptions, getTemplateReferencedAttributeNames } from './handlebars-to-jsx/utils';

/**
 * Convert snake_case to Title Case
 */
const toTitleCase = (str: string): string => {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Context for generating field controls - determines how values are accessed and updated
 */
interface FieldContext {
  /** The variable name for accessing the value (e.g., 'backgroundImage' or 'item.image') */
  valueAccessor: string;
  /** The onChange handler code (e.g., 'setAttributes({ x: value })' or 'updateItems(index, "x", value)') */
  onChangeHandler: (value: string) => string;
  /** Base indentation */
  indent: string;
}

/**
 * Generate a field control for any property type - unified function for both top-level and nested fields
 */
const generateFieldControl = (
  fieldKey: string,
  property: HandoffProperty,
  context: FieldContext
): string => {
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
      const options = normalizeSelectOptions(property.options).map(opt =>
        `{ label: '${opt.label.replace(/'/g, "\\'")}', value: '${opt.value}' }`
      ).join(', ');
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
            const nestedContext: FieldContext = {
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

/**
 * Generate array (repeater) control using 10up Repeater component
 * Provides drag-and-drop reordering and built-in add/remove functionality
 */
const generateArrayControl = (key: string, property: HandoffProperty, attrName: string, label: string, indent: string): string => {
  const itemProps = property.items?.properties || {};

  // Generate field controls that use setItem from the Repeater render prop
  const itemFields = Object.entries(itemProps).map(([fieldKey, fieldProp]) => {
    const fieldContext: FieldContext = {
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

/**
 * Generate the inspector control for a top-level property
 * Uses generateFieldControl with a setAttributes context
 */
const generatePropertyControl = (key: string, property: HandoffProperty, indent: string = '          '): string => {
  const attrName = toCamelCase(key);
  const label = property.name || toTitleCase(key);

  // For array type, use the specialized array control
  if (property.type === 'array') {
    return generateArrayControl(key, property, attrName, label, indent);
  }

  // For all other types, use the unified field control generator
  const context: FieldContext = {
    valueAccessor: attrName,
    onChangeHandler: (value) => `setAttributes({ ${attrName}: ${value} })`,
    indent
  };

  return generateFieldControl(key, property, context);
};

/**
 * Generate default value for a property type
 */
const getDefaultValue = (fieldProp: HandoffProperty): any => {
  switch (fieldProp.type) {
    case 'link':
      return { label: '', url: '', opensInNewTab: false };
    case 'button':
      return { label: '', href: '#', target: '', rel: '', disabled: false };
    case 'image':
      return { src: '', alt: '' };
    case 'object':
      if (fieldProp.properties) {
        const nested: Record<string, any> = {};
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
const generateArrayHelpers = (properties: Record<string, HandoffProperty>): string => {
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
const generateIndexJs = (
  component: HandoffComponent,
  dynamicArrayConfigs?: Record<string, DynamicArrayConfig>,
  innerBlocksField?: string | null
): string => {
  const blockName = toBlockName(component.id);
  const properties = component.properties;

  // Check which fields have dynamic array configs
  const hasDynamicArrays = dynamicArrayConfigs && Object.keys(dynamicArrayConfigs).length > 0;

  // Helper to check for a type in properties, including nested in arrays/objects
  const hasPropertyType = (type: string): boolean => {
    const checkProperty = (prop: HandoffProperty): boolean => {
      if (prop.type === type) return true;
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
    .map(toCamelCase);

  // Include any attribute names referenced in the template but missing from API properties
  // (e.g. body -> blockBody so JSX has a defined variable and no ReferenceError)
  for (const name of getTemplateReferencedAttributeNames(component.code)) {
    if (!attrNames.includes(name)) attrNames.push(name);
  }
  
  // Add dynamic array attribute names
  if (dynamicArrayConfigs) {
    for (const [fieldName, dynConfig] of Object.entries(dynamicArrayConfigs)) {
      const attrName = toCamelCase(fieldName);
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
  // Add LinkControl for link and button fields (internal page search + URL validation)
  const needsLinkControl = hasPropertyType('link') || hasPropertyType('button');
  if (needsLinkControl) {
    blockEditorImports.push('LinkControl');
  }

  const componentImports = ['PanelBody', 'TextControl', 'Button'];
  if (needsRangeControl) componentImports.push('RangeControl');
  // ToggleControl is needed for boolean fields
  if (needsToggleControl) componentImports.push('ToggleControl');
  // SelectControl is needed for select fields OR dynamic arrays (post type selector)
  if (needsSelectControl || hasDynamicArrays) componentImports.push('SelectControl');
  // Spinner for dynamic array loading state in editor preview
  if (hasDynamicArrays) componentImports.push('Spinner');

  componentImports.push('Flex');
  // Popover is needed for inline link/button editing
  if (needsLinkControl) {
    componentImports.push('Popover');
  }

  // 10up block-components imports
  const tenUpImports: string[] = [];
  if (hasArrayProps) {
    tenUpImports.push('Repeater');
  }

  // Generate array helpers
  const arrayHelpers = generateArrayHelpers(properties);

  // Generate JSX preview from handlebars template
  // This must happen before panel generation so we know which fields have inline editing
  const previewResult = generateJsxPreview(
    component.code,
    properties,
    component.id,
    component.title,
    innerBlocksField
  );
  let previewJsx = previewResult.jsx;
  const inlineEditableFields = previewResult.inlineEditableFields;

  // Detect if preview uses HandoffLinkField (link/button inline editing)
  const previewUsesLinkField = previewJsx.includes('<HandoffLinkField');

  // Generate panel bodies for each property
  const panels: string[] = [];

  for (const [key, property] of Object.entries(properties)) {
    // richtext uses InnerBlocks on the canvas – no sidebar panel needed
    // pagination is auto-generated from query results – no sidebar panel needed
    if (property.type === 'richtext' || property.type === 'pagination') continue;

    // Skip fields that are inline-editable on the canvas (text, image, link, button
    // wrapped in {{#field}}) – they don't need sidebar controls.
    // Array fields are always kept: they need sidebar UI for manual/dynamic toggle
    // and for adding/removing items, even when their child fields are inline-editable.
    if (inlineEditableFields.has(key) && property.type !== 'array') continue;

    const label = property.name || toTitleCase(key);
    const attrName = toCamelCase(key);
    const dynamicConfig = dynamicArrayConfigs?.[key];
    
    // Check if this is a dynamic array field
    if (property.type === 'array' && dynamicConfig) {
      const defaultMode = dynamicConfig.selectionMode === 'manual' ? 'select' : 'query';
      const itemOverridesConfig = dynamicConfig.itemOverridesConfig || {};
      const advancedFields: Array<{ name: string; label: string; type: string; options?: Array<{ label: string; value: string }>; default?: any }> = [];

      // Fields from itemOverridesConfig (legacy)
      for (const [name, c] of Object.entries(itemOverridesConfig) as Array<[string, ItemOverrideFieldConfig]>) {
        if (c.mode === 'ui') {
          advancedFields.push({ name, label: c.label, type: 'select', options: normalizeSelectOptions(c.options), default: c.default });
        }
      }

      // Fields from fieldMapping with type: "manual" — derive control type from item properties
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
              case 'select':
                controlType = 'select';
                options = normalizeSelectOptions(itemProp.options);
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
                showDateFilter: ${(dynamicConfig as any).showDateFilter === true ? 'true' : 'false'},
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
    } else {
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

  // Dynamic array resolution for editor preview (query/select → fetch + map)
  let dynamicArrayResolutionCode = '';
  const resolvingFlags: string[] = [];
  if (dynamicArrayConfigs) {
    for (const [fieldKey, config] of Object.entries(dynamicArrayConfigs)) {
      const attrName = toCamelCase(fieldKey);
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
      ? Object.values(dynamicArrayConfigs).some((c: DynamicArrayConfig) => !!c.pagination)
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

  // Add LinkControl if link field inline editing is used
  if (previewUsesLinkField && !blockEditorImports.includes('LinkControl')) {
    blockEditorImports.push('LinkControl');
  }

  // Add Popover if link field inline editing is used
  if (previewUsesLinkField && !componentImports.includes('Popover')) {
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

  // Collect all image fields for BlockControls/MediaReplaceFlow
  interface ImageFieldInfo {
    label: string;
    attrPath: string;  // e.g., 'backgroundImage' or 'leftCard.image'
    valueExpr: string; // e.g., 'backgroundImage' or 'leftCard?.image'
    updateExpr: string; // e.g., 'setAttributes({ backgroundImage: ... })' or nested update
  }
  
  const imageFields: ImageFieldInfo[] = [];
  
  const collectImageFields = (props: Record<string, HandoffProperty>, parentPath: string = '', parentValuePath: string = '') => {
    for (const [key, prop] of Object.entries(props)) {
      const attrName = toCamelCase(key);
      const currentPath = parentPath ? `${parentPath}.${attrName}` : attrName;
      const currentValuePath = parentValuePath ? `${parentValuePath}?.${attrName}` : attrName;
      
      if (prop.type === 'image') {
        const label = prop.name || toTitleCase(key);
        let updateExpr: string;
        
        if (parentPath) {
          // Nested image field - need to spread parent object
          const parentAttr = parentPath.split('.')[0];
          const parentCamel = toCamelCase(parentAttr);
          updateExpr = `setAttributes({ ${parentCamel}: { ...${parentCamel}, ${attrName}: { id: media.id, src: media.url, alt: media.alt || '' } } })`;
        } else {
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
  const sharedComponentImport = hasDynamicArrays 
    ? `import { DynamicPostSelector, mapPostEntityToItem } from '../../shared';\nimport { useSelect } from '@wordpress/data';\nimport { store as coreDataStore } from '@wordpress/core-data';\n` 
    : '';

  // Build element imports
  const elementImports = ['Fragment'];
  if (previewUsesLinkField) {
    elementImports.push('useState', 'useRef', 'useCallback');
  }

  // HandoffLinkField component: inline RichText for label + Popover with LinkControl for URL
  const linkFieldComponent = previewUsesLinkField ? `
function HandoffLinkField({ fieldId, label, url, opensInNewTab, onLabelChange, onLinkChange, isSelected }) {
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const ref = useRef(null);
  const toggle = useCallback(() => setIsEditingUrl((v) => !v), []);

  return (
    <span ref={ref} className="handoff-editable-field handoff-link-field" onClick={toggle} role="button" tabIndex={0}>
      <RichText
        tagName="span"
        value={label}
        onChange={onLabelChange}
        allowedFormats={[]}
        withoutInteractiveFormatting
        placeholder={__('Link text...', 'handoff')}
      />
      {isSelected && (isEditingUrl || url) && (
        <Popover
          placement="bottom"
          onClose={() => setIsEditingUrl(false)}
          anchor={ref.current}
          focusOnMount={isEditingUrl ? 'firstElement' : false}
          shift
        >
          <div style={{ minWidth: 280, padding: '8px' }}>
            <LinkControl
              value={{ url: url || '', opensInNewTab: opensInNewTab || false }}
              onChange={(val) => onLinkChange({ url: val.url || '', opensInNewTab: val.opensInNewTab || false })}
              settings={[{ id: 'opensInNewTab', title: __('Open in new tab', 'handoff') }]}
            />
          </div>
        </Popover>
      )}
    </span>
  );
}
` : '';

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
${linkFieldComponent}
registerBlockType(metadata.name, {
  ...metadata,
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

export { generateIndexJs, toTitleCase };
