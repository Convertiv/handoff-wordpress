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
        case 'text': {
            const isWistiaTextField = /\bwistia\b/i.test(`${fieldKey} ${label} ${property.description ?? ''}`);
            if (isWistiaTextField) {
                return `${indent}<Flex direction="column" gap={3}>
${indent}  <TextControl
${indent}    label={__('${label}', 'handoff')}
${indent}    value={${valueAccessor} || ''}
${indent}    onChange={(value) => ${onChangeHandler('value')}}
${indent}  />
${indent}  {(() => {
${indent}    const normalized = String(${valueAccessor} || '').trim();
${indent}    const mediaMatch = normalized.match(/(?:medias|iframe)\\/([A-Za-z0-9]+)/i);
${indent}    const fallbackMatch = normalized.match(/^([A-Za-z0-9]+?)(?:\\.jsonp)?$/);
${indent}    const wistiaId = mediaMatch?.[1] || fallbackMatch?.[1] || '';
${indent}
${indent}    if (!wistiaId) {
${indent}      return (
${indent}        <div
${indent}          style={{
${indent}            padding: '16px',
${indent}            border: '1px dashed #cbd5e1',
${indent}            borderRadius: '12px',
${indent}            color: '#475569',
${indent}            background: '#f8fafc',
${indent}          }}
${indent}        >
${indent}          {__('Add a Wistia video ID to preview this video.', 'handoff')}
${indent}        </div>
${indent}      );
${indent}    }
${indent}
${indent}    return (
${indent}      <div
${indent}        style={{
${indent}          position: 'relative',
${indent}          overflow: 'hidden',
${indent}          borderRadius: '12px',
${indent}          background: '#0f172a',
${indent}          aspectRatio: '16 / 9',
${indent}        }}
${indent}      >
${indent}        <img
${indent}          src={\`https://fast.wistia.com/embed/medias/\${wistiaId}/swatch\`}
${indent}          alt={__('Wistia video preview', 'handoff')}
${indent}          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
${indent}        />
${indent}        <div
${indent}          style={{
${indent}            position: 'absolute',
${indent}            inset: 0,
${indent}            display: 'flex',
${indent}            alignItems: 'flex-end',
${indent}            justifyContent: 'space-between',
${indent}            gap: '12px',
${indent}            padding: '12px',
${indent}            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.12) 0%, rgba(15, 23, 42, 0.7) 100%)',
${indent}            color: '#fff',
${indent}          }}
${indent}        >
${indent}          <span
${indent}            aria-hidden="true"
${indent}            style={{
${indent}              width: '48px',
${indent}              height: '48px',
${indent}              borderRadius: '999px',
${indent}              display: 'inline-flex',
${indent}              alignItems: 'center',
${indent}              justifyContent: 'center',
${indent}              background: 'rgba(255, 255, 255, 0.18)',
${indent}              border: '1px solid rgba(255, 255, 255, 0.24)',
${indent}              backdropFilter: 'blur(10px)',
${indent}            }}
${indent}          >
${indent}            <span
${indent}              style={{
${indent}                width: 0,
${indent}                height: 0,
${indent}                marginLeft: '4px',
${indent}                borderTop: '8px solid transparent',
${indent}                borderBottom: '8px solid transparent',
${indent}                borderLeft: '14px solid #fff',
${indent}              }}
${indent}            />
${indent}          </span>
${indent}          <span
${indent}            style={{
${indent}              display: 'inline-flex',
${indent}              alignItems: 'center',
${indent}              maxWidth: '100%',
${indent}              minHeight: '32px',
${indent}              padding: '6px 12px',
${indent}              borderRadius: '999px',
${indent}              background: 'rgba(15, 23, 42, 0.58)',
${indent}              fontSize: '12px',
${indent}              fontWeight: 600,
${indent}              letterSpacing: '0.02em',
${indent}            }}
${indent}          >
${indent}            {wistiaId}
${indent}          </span>
${indent}        </div>
${indent}      </div>
${indent}    );
${indent}  })()}
${indent}</Flex>`;
            }
            return `${indent}<TextControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || ''}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}/>`;
        }
        case 'richtext':
            // Inside an array item, InnerBlocks can't be used — provide a textarea
            if (valueAccessor.startsWith('item.')) {
                return `${indent}<TextareaControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || ''}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}  rows={4}
${indent}/>`;
            }
            // Top-level richtext uses InnerBlocks on the canvas – no sidebar control needed
            return '';
        case 'number': {
            const isDecimal = /opacity|alpha|ratio/i.test(fieldKey) ||
                (typeof property.default === 'number' && property.default > 0 && property.default <= 1);
            const rangeMin = isDecimal ? 0 : 0;
            const rangeMax = isDecimal ? 1 : 100;
            const rangeStep = isDecimal ? 0.01 : 1;
            return `${indent}<RangeControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} || 0}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}  min={${rangeMin}}
${indent}  max={${rangeMax}}
${indent}  step={${rangeStep}}
${indent}/>`;
        }
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
        case 'video':
            return `${indent}<Flex direction="column" gap={3}>
${indent}  <TextControl
${indent}    label={__('${label}', 'handoff')}
${indent}    value={typeof ${valueAccessor} === 'string' ? ${valueAccessor} : (${valueAccessor}?.id || ${valueAccessor}?.src || '')}
${indent}    onChange={(value) => {
${indent}      const normalized = String(value || '').trim();
${indent}      const mediaMatch = normalized.match(/(?:medias|iframe)\\/([A-Za-z0-9]+)/i);
${indent}      const fallbackMatch = normalized.match(/^([A-Za-z0-9]+?)(?:\\.jsonp)?$/);
${indent}      const wistiaId = mediaMatch?.[1] || fallbackMatch?.[1] || '';
${indent}      ${onChangeHandler(`{ ...(${valueAccessor} && typeof ${valueAccessor} === 'object' ? ${valueAccessor} : {}), id: wistiaId, src: wistiaId ? \`https://fast.wistia.com/embed/medias/\${wistiaId}.jsonp\` : normalized }`)}
${indent}    }}
${indent}  />
${indent}  {(() => {
${indent}    const rawValue =
${indent}      typeof ${valueAccessor} === 'string'
${indent}        ? ${valueAccessor}
${indent}        : (${valueAccessor}?.id || ${valueAccessor}?.src || '');
${indent}    const normalized = String(rawValue || '').trim();
${indent}    const mediaMatch = normalized.match(/(?:medias|iframe)\\/([A-Za-z0-9]+)/i);
${indent}    const fallbackMatch = normalized.match(/^([A-Za-z0-9]+?)(?:\\.jsonp)?$/);
${indent}    const wistiaId = mediaMatch?.[1] || fallbackMatch?.[1] || '';
${indent}
${indent}    if (!wistiaId) {
${indent}      return (
${indent}        <div
${indent}          style={{
${indent}            padding: '16px',
${indent}            border: '1px dashed #cbd5e1',
${indent}            borderRadius: '12px',
${indent}            color: '#475569',
${indent}            background: '#f8fafc',
${indent}          }}
${indent}        >
${indent}          {__('Add a Wistia video ID to preview this video.', 'handoff')}
${indent}        </div>
${indent}      );
${indent}    }
${indent}
${indent}    return (
${indent}      <div
${indent}        style={{
${indent}          position: 'relative',
${indent}          overflow: 'hidden',
${indent}          borderRadius: '12px',
${indent}          background: '#0f172a',
${indent}          aspectRatio: '16 / 9',
${indent}        }}
${indent}      >
${indent}        <img
${indent}          src={\`https://fast.wistia.com/embed/medias/\${wistiaId}/swatch\`}
${indent}          alt={__('Wistia video preview', 'handoff')}
${indent}          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
${indent}        />
${indent}        <div
${indent}          style={{
${indent}            position: 'absolute',
${indent}            inset: 0,
${indent}            display: 'flex',
${indent}            alignItems: 'flex-end',
${indent}            justifyContent: 'space-between',
${indent}            gap: '12px',
${indent}            padding: '12px',
${indent}            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.12) 0%, rgba(15, 23, 42, 0.7) 100%)',
${indent}            color: '#fff',
${indent}          }}
${indent}        >
${indent}          <span
${indent}            aria-hidden="true"
${indent}            style={{
${indent}              width: '48px',
${indent}              height: '48px',
${indent}              borderRadius: '999px',
${indent}              display: 'inline-flex',
${indent}              alignItems: 'center',
${indent}              justifyContent: 'center',
${indent}              background: 'rgba(255, 255, 255, 0.18)',
${indent}              border: '1px solid rgba(255, 255, 255, 0.24)',
${indent}              backdropFilter: 'blur(10px)',
${indent}            }}
${indent}          >
${indent}            <span
${indent}              style={{
${indent}                width: 0,
${indent}                height: 0,
${indent}                marginLeft: '4px',
${indent}                borderTop: '8px solid transparent',
${indent}                borderBottom: '8px solid transparent',
${indent}                borderLeft: '14px solid #fff',
${indent}              }}
${indent}            />
${indent}          </span>
${indent}          <span
${indent}            style={{
${indent}              display: 'inline-flex',
${indent}              alignItems: 'center',
${indent}              maxWidth: '100%',
${indent}              minHeight: '32px',
${indent}              padding: '6px 12px',
${indent}              borderRadius: '999px',
${indent}              background: 'rgba(15, 23, 42, 0.58)',
${indent}              fontSize: '12px',
${indent}              fontWeight: 600,
${indent}              letterSpacing: '0.02em',
${indent}            }}
${indent}          >
${indent}            {wistiaId}
${indent}          </span>
${indent}        </div>
${indent}      </div>
${indent}    );
${indent}  })()}
${indent}</Flex>`;
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
        case 'video':
            return { src: '', id: '', poster: '', type: '', width: 0, height: 0, mime: '', mimeType: '' };
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
    // TextareaControl: needed when richtext fields appear inside array items
    const hasRichtextInArray = Object.values(properties).some(p => p.type === 'array' && p.items?.properties &&
        Object.values(p.items.properties).some(ip => ip.type === 'richtext'));
    if (hasRichtextInArray)
        componentImports.push('TextareaControl');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBaTRDeUMsa0NBQVc7QUFuM0N0RDs7R0FFRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsUUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsT0FBcUIsRUFDYixFQUFFO0lBQ1YsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQzNELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXJELFFBQVEsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNaLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsSUFBSSxLQUFLLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRW5HLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxHQUFHLE1BQU07RUFDdEIsTUFBTTtFQUNOLE1BQU0sa0JBQWtCLEtBQUs7RUFDN0IsTUFBTSxjQUFjLGFBQWE7RUFDakMsTUFBTSw0QkFBNEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUMxRCxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0saUNBQWlDLGFBQWE7RUFDcEQsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtF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LENBQUMsQ0FBQyxDQUFDLGtIQUFrSCxDQUFDLENBQUMsQ0FBQywrREFBK0Q7OztDQUdoTyxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBRU8sMENBQWUiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBpbmRleC5qcyBmb3IgR3V0ZW5iZXJnIGJsb2NrIGVkaXRvclxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnLCBpc0JyZWFkY3J1bWJzQ29uZmlnLCBpc1RheG9ub215Q29uZmlnLCBpc1BhZ2luYXRpb25Db25maWcgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0b0Jsb2NrTmFtZSB9IGZyb20gJy4vYmxvY2stanNvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZUpzeFByZXZpZXcsIHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBUaXRsZSBDYXNlXG4gKi9cbmNvbnN0IHRvVGl0bGVDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0clxuICAgIC5zcGxpdCgnXycpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKVxuICAgIC5qb2luKCcgJyk7XG59O1xuXG4vKipcbiAqIENvbnRleHQgZm9yIGdlbmVyYXRpbmcgZmllbGQgY29udHJvbHMgLSBkZXRlcm1pbmVzIGhvdyB2YWx1ZXMgYXJlIGFjY2Vzc2VkIGFuZCB1cGRhdGVkXG4gKi9cbmludGVyZmFjZSBGaWVsZENvbnRleHQge1xuICAvKiogVGhlIHZhcmlhYmxlIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgdmFsdWUgKGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdpdGVtLmltYWdlJykgKi9cbiAgdmFsdWVBY2Nlc3Nvcjogc3RyaW5nO1xuICAvKiogVGhlIG9uQ2hhbmdlIGhhbmRsZXIgY29kZSAoZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyB4OiB2YWx1ZSB9KScgb3IgJ3VwZGF0ZUl0ZW1zKGluZGV4LCBcInhcIiwgdmFsdWUpJykgKi9cbiAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogQmFzZSBpbmRlbnRhdGlvbiAqL1xuICBpbmRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpZWxkIGNvbnRyb2wgZm9yIGFueSBwcm9wZXJ0eSB0eXBlIC0gdW5pZmllZCBmdW5jdGlvbiBmb3IgYm90aCB0b3AtbGV2ZWwgYW5kIG5lc3RlZCBmaWVsZHNcbiAqL1xuY29uc3QgZ2VuZXJhdGVGaWVsZENvbnRyb2wgPSAoXG4gIGZpZWxkS2V5OiBzdHJpbmcsXG4gIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksXG4gIGNvbnRleHQ6IEZpZWxkQ29udGV4dFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgeyB2YWx1ZUFjY2Vzc29yLCBvbkNoYW5nZUhhbmRsZXIsIGluZGVudCB9ID0gY29udGV4dDtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGZpZWxkS2V5KTtcblxuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0Jzoge1xuICAgICAgY29uc3QgaXNXaXN0aWFUZXh0RmllbGQgPSAvXFxid2lzdGlhXFxiL2kudGVzdChgJHtmaWVsZEtleX0gJHtsYWJlbH0gJHtwcm9wZXJ0eS5kZXNjcmlwdGlvbiA/PyAnJ31gKTtcblxuICAgICAgaWYgKGlzV2lzdGlhVGV4dEZpZWxkKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICB7KCgpID0+IHtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgJycpLnRyaW0oKTtcbiR7aW5kZW50fSAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgIGNvbnN0IHdpc3RpYUlkID0gbWVkaWFNYXRjaD8uWzFdIHx8IGZhbGxiYWNrTWF0Y2g/LlsxXSB8fCAnJztcbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIGlmICghd2lzdGlhSWQpIHtcbiR7aW5kZW50fSAgICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzE2cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyOiAnMXB4IGRhc2hlZCAjY2JkNWUxJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjNDc1NTY5JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZjhmYWZjJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAge19fKCdBZGQgYSBXaXN0aWEgdmlkZW8gSUQgdG8gcHJldmlldyB0aGlzIHZpZGVvLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgKTtcbiR7aW5kZW50fSAgICB9XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuJHtpbmRlbnR9ICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcbiR7aW5kZW50fSAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICBiYWNrZ3JvdW5kOiAnIzBmMTcyYScsXG4ke2luZGVudH0gICAgICAgICAgYXNwZWN0UmF0aW86ICcxNiAvIDknLFxuJHtpbmRlbnR9ICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICA8aW1nXG4ke2luZGVudH0gICAgICAgICAgc3JjPXtcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS9zd2F0Y2hcXGB9XG4ke2luZGVudH0gICAgICAgICAgYWx0PXtfXygnV2lzdGlhIHZpZGVvIHByZXZpZXcnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLCBvYmplY3RGaXQ6ICdjb3ZlcicsIGRpc3BsYXk6ICdibG9jaycgfX1cbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGluc2V0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWxpZ25JdGVtczogJ2ZsZXgtZW5kJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnc3BhY2UtYmV0d2VlbicsXG4ke2luZGVudH0gICAgICAgICAgICBnYXA6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICdsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCByZ2JhKDE1LCAyMywgNDIsIDAuMTIpIDAlLCByZ2JhKDE1LCAyMywgNDIsIDAuNykgMTAwJSknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwidHJ1ZVwiXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICB3aWR0aDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBoZWlnaHQ6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjQpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2Ryb3BGaWx0ZXI6ICdibHVyKDEwcHgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgICB3aWR0aDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBoZWlnaHQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgbWFyZ2luTGVmdDogJzRweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyVG9wOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJCb3R0b206ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckxlZnQ6ICcxNHB4IHNvbGlkICNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtaW5IZWlnaHQ6ICczMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgcGFkZGluZzogJzZweCAxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgxNSwgMjMsIDQyLCAwLjU4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRTaXplOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRXZWlnaHQ6IDYwMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbGV0dGVyU3BhY2luZzogJzAuMDJlbScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHt3aXN0aWFJZH1cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgKTtcbiR7aW5kZW50fSAgfSkoKX1cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgICAvLyBJbnNpZGUgYW4gYXJyYXkgaXRlbSwgSW5uZXJCbG9ja3MgY2FuJ3QgYmUgdXNlZCDigJQgcHJvdmlkZSBhIHRleHRhcmVhXG4gICAgICBpZiAodmFsdWVBY2Nlc3Nvci5zdGFydHNXaXRoKCdpdGVtLicpKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRhcmVhQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgcm93cz17NH1cbiR7aW5kZW50fS8+YDtcbiAgICAgIH1cbiAgICAgIC8vIFRvcC1sZXZlbCByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgY29udHJvbCBuZWVkZWRcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ251bWJlcic6IHtcbiAgICAgIGNvbnN0IGlzRGVjaW1hbCA9IC9vcGFjaXR5fGFscGhhfHJhdGlvL2kudGVzdChmaWVsZEtleSkgfHxcbiAgICAgICAgKHR5cGVvZiBwcm9wZXJ0eS5kZWZhdWx0ID09PSAnbnVtYmVyJyAmJiBwcm9wZXJ0eS5kZWZhdWx0ID4gMCAmJiBwcm9wZXJ0eS5kZWZhdWx0IDw9IDEpO1xuICAgICAgY29uc3QgcmFuZ2VNaW4gPSBpc0RlY2ltYWwgPyAwIDogMDtcbiAgICAgIGNvbnN0IHJhbmdlTWF4ID0gaXNEZWNpbWFsID8gMSA6IDEwMDtcbiAgICAgIGNvbnN0IHJhbmdlU3RlcCA9IGlzRGVjaW1hbCA/IDAuMDEgOiAxO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08UmFuZ2VDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAwfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIG1pbj17JHtyYW5nZU1pbn19XG4ke2luZGVudH0gIG1heD17JHtyYW5nZU1heH19XG4ke2luZGVudH0gIHN0ZXA9eyR7cmFuZ2VTdGVwfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfS5zcmN9IFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWx0PXske3ZhbHVlQWNjZXNzb3J9LmFsdH1cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7IG1heFdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19XG4ke2luZGVudH0gICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvbiBvbkNsaWNrPXtvcGVufSB2YXJpYW50PVwic2Vjb25kYXJ5XCIgc2l6ZT1cInNtYWxsXCI+XG4ke2luZGVudH0gICAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyA/IF9fKCdSZXBsYWNlICR7bGFiZWx9JywgJ2hhbmRvZmYnKSA6IF9fKCdTZWxlY3QgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DbGljaz17KCkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBcXCdcXCcsIGFsdDogXFwnXFwnIH0nKX19XG4ke2luZGVudH0gICAgICAgICAgICB2YXJpYW50PVwibGlua1wiXG4ke2luZGVudH0gICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICApfVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9PC9NZWRpYVVwbG9hZENoZWNrPmA7XG5cbiAgICBjYXNlICd2aWRlbyc6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXt0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ3N0cmluZycgPyAke3ZhbHVlQWNjZXNzb3J9IDogKCR7dmFsdWVBY2Nlc3Nvcn0/LmlkIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyB8fCAnJyl9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4ge1xuJHtpbmRlbnR9ICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyh2YWx1ZSB8fCAnJykudHJpbSgpO1xuJHtpbmRlbnR9ICAgICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgICAgY29uc3Qgd2lzdGlhSWQgPSBtZWRpYU1hdGNoPy5bMV0gfHwgZmFsbGJhY2tNYXRjaD8uWzFdIHx8ICcnO1xuJHtpbmRlbnR9ICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gJiYgdHlwZW9mICR7dmFsdWVBY2Nlc3Nvcn0gPT09ICdvYmplY3QnID8gJHt2YWx1ZUFjY2Vzc29yfSA6IHt9KSwgaWQ6IHdpc3RpYUlkLCBzcmM6IHdpc3RpYUlkID8gXFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0uanNvbnBcXGAgOiBub3JtYWxpemVkIH1gKX1cbiR7aW5kZW50fSAgICB9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICB7KCgpID0+IHtcbiR7aW5kZW50fSAgICBjb25zdCByYXdWYWx1ZSA9XG4ke2luZGVudH0gICAgICB0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ3N0cmluZydcbiR7aW5kZW50fSAgICAgICAgPyAke3ZhbHVlQWNjZXNzb3J9XG4ke2luZGVudH0gICAgICAgIDogKCR7dmFsdWVBY2Nlc3Nvcn0/LmlkIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyB8fCAnJyk7XG4ke2luZGVudH0gICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyhyYXdWYWx1ZSB8fCAnJykudHJpbSgpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IG1lZGlhTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC8oPzptZWRpYXN8aWZyYW1lKVxcXFwvKFtBLVphLXowLTldKykvaSk7XG4ke2luZGVudH0gICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgY29uc3Qgd2lzdGlhSWQgPSBtZWRpYU1hdGNoPy5bMV0gfHwgZmFsbGJhY2tNYXRjaD8uWzFdIHx8ICcnO1xuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgaWYgKCF3aXN0aWFJZCkge1xuJHtpbmRlbnR9ICAgICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTZweCcsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXI6ICcxcHggZGFzaGVkICNjYmQ1ZTEnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBjb2xvcjogJyM0NzU1NjknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYmFja2dyb3VuZDogJyNmOGZhZmMnLFxuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICB7X18oJ0FkZCBhIFdpc3RpYSB2aWRlbyBJRCB0byBwcmV2aWV3IHRoaXMgdmlkZW8uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICApO1xuJHtpbmRlbnR9ICAgIH1cbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgcG9zaXRpb246ICdyZWxhdGl2ZScsXG4ke2luZGVudH0gICAgICAgICAgb3ZlcmZsb3c6ICdoaWRkZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgIGJhY2tncm91bmQ6ICcjMGYxNzJhJyxcbiR7aW5kZW50fSAgICAgICAgICBhc3BlY3RSYXRpbzogJzE2IC8gOScsXG4ke2luZGVudH0gICAgICAgIH19XG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIDxpbWdcbiR7aW5kZW50fSAgICAgICAgICBzcmM9e1xcYGh0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy9cXCR7d2lzdGlhSWR9L3N3YXRjaFxcYH1cbiR7aW5kZW50fSAgICAgICAgICBhbHQ9e19fKCdXaXN0aWEgdmlkZW8gcHJldmlldycsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsIG9iamVjdEZpdDogJ2NvdmVyJywgZGlzcGxheTogJ2Jsb2NrJyB9fVxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgaW5zZXQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICBhbGlnbkl0ZW1zOiAnZmxleC1lbmQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdzcGFjZS1iZXR3ZWVuJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGdhcDogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYmFja2dyb3VuZDogJ2xpbmVhci1ncmFkaWVudCgxODBkZWcsIHJnYmEoMTUsIDIzLCA0MiwgMC4xMikgMCUsIHJnYmEoMTUsIDIzLCA0MiwgMC43KSAxMDAlKScsXG4ke2luZGVudH0gICAgICAgICAgICBjb2xvcjogJyNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgYXJpYS1oaWRkZW49XCJ0cnVlXCJcbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIHdpZHRoOiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGhlaWdodDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc5OTlweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yNCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZHJvcEZpbHRlcjogJ2JsdXIoMTBweCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIHdpZHRoOiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGhlaWdodDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBtYXJnaW5MZWZ0OiAnNHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJUb3A6ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckJvdHRvbTogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyTGVmdDogJzE0cHggc29saWQgI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIG1heFdpZHRoOiAnMTAwJScsXG4ke2luZGVudH0gICAgICAgICAgICAgIG1pbkhlaWdodDogJzMycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBwYWRkaW5nOiAnNnB4IDEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc5OTlweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDE1LCAyMywgNDIsIDAuNTgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZm9udFNpemU6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZm9udFdlaWdodDogNjAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBsZXR0ZXJTcGFjaW5nOiAnMC4wMmVtJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge3dpc3RpYUlkfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICApO1xuJHtpbmRlbnR9ICB9KSgpfVxuJHtpbmRlbnR9PC9GbGV4PmA7XG5cbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIC8vIEZvciBsaW5rcywgdXNlIExpbmtDb250cm9sIHdoaWNoIHByb3ZpZGVzIGludGVybmFsIHBhZ2Ugc2VhcmNoIGFuZCBVUkwgdmFsaWRhdGlvblxuICAgICAgY29uc3QgbGlua0hhbmRsZXIgPSBvbkNoYW5nZUhhbmRsZXIoYHsgXG4gICAgICAgIC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIFxuICAgICAgICB1cmw6IHZhbHVlLnVybCB8fCAnJywgXG4gICAgICAgIGxhYmVsOiB2YWx1ZS50aXRsZSB8fCAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiAgICAgICAgb3BlbnNJbk5ld1RhYjogdmFsdWUub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0xpbmsgVGV4dCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LnVybCB8fCAnJywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiR7aW5kZW50fSAgICAgICAgb3BlbnNJbk5ld1RhYjogJHt2YWx1ZUFjY2Vzc29yfT8ub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7bGlua0hhbmRsZXJ9fVxuJHtpbmRlbnR9ICAgICAgc2V0dGluZ3M9e1tcbiR7aW5kZW50fSAgICAgICAgeyBpZDogJ29wZW5zSW5OZXdUYWInLCB0aXRsZTogX18oJ09wZW4gaW4gbmV3IHRhYicsICdoYW5kb2ZmJykgfVxuJHtpbmRlbnR9ICAgICAgXX1cbiR7aW5kZW50fSAgICAgIHNob3dTdWdnZXN0aW9ucz17dHJ1ZX1cbiR7aW5kZW50fSAgICAgIHN1Z2dlc3Rpb25zUXVlcnk9e3sgdHlwZTogJ3Bvc3QnLCBzdWJ0eXBlOiAnYW55JyB9fVxuJHtpbmRlbnR9ICAgIC8+XG4ke2luZGVudH0gIDwvZGl2PlxuJHtpbmRlbnR9PC9kaXY+YDtcblxuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICAvLyBGb3IgYnV0dG9ucywgcHJvdmlkZSBsYWJlbCBmaWVsZCBhbmQgaHJlZiBmaWVsZCB3aXRoIGxpbmsgcGlja2VyXG4gICAgICAvLyBCdXR0b24gcHJvcGVydGllczogbGFiZWwsIGhyZWYsIHRhcmdldCwgcmVsLCBkaXNhYmxlZFxuICAgICAgY29uc3QgYnV0dG9uSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIGhyZWY6IHZhbHVlLnVybCB8fCAnIycsIFxuICAgICAgICB0YXJnZXQ6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnX2JsYW5rJyA6ICcnLFxuICAgICAgICByZWw6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnbm9vcGVuZXIgbm9yZWZlcnJlcicgOiAnJ1xuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0J1dHRvbiBMYWJlbCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LmhyZWYgfHwgJyMnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py50YXJnZXQgPT09ICdfYmxhbmsnXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtidXR0b25IYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fSAgPFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0Rpc2FibGVkJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9Py5kaXNhYmxlZCB8fCBmYWxzZX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBkaXNhYmxlZDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvZGl2PmA7XG5cbiAgICBjYXNlICdzZWxlY3QnOiB7XG4gICAgICBjb25zdCBvcHRpb25zID0gbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhwcm9wZXJ0eS5vcHRpb25zKS5tYXAob3B0ID0+XG4gICAgICAgIGB7IGxhYmVsOiAnJHtvcHQubGFiZWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfScsIHZhbHVlOiAnJHtvcHQudmFsdWV9JyB9YFxuICAgICAgKS5qb2luKCcsICcpO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08U2VsZWN0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9wdGlvbnM9e1ske29wdGlvbnN9XX1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICAgIH1cblxuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIC8vIEhhbmRsZSBzaW1wbGUgc3RyaW5nIGFycmF5cyB3aXRoIGEgcmVwZWF0YWJsZSBsaXN0IGNvbnRyb2xcbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBzaW1wbGUgdHlwZSBhcnJheSAoc3RyaW5nLCBudW1iZXIsIGV0Yy4pIHZzIG9iamVjdCBhcnJheVxuICAgICAgY29uc3QgaXRlbVR5cGUgPSBwcm9wZXJ0eS5pdGVtcz8udHlwZTtcbiAgICAgIGlmICghcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgJiYgKGl0ZW1UeXBlID09PSAnc3RyaW5nJyB8fCAhaXRlbVR5cGUpKSB7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbGlzdCBjb250cm9sIGZvciBzdHJpbmcgYXJyYXlzXG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aW5kZW50fSAgICB7KCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLm1hcCgobGlzdEl0ZW0sIGxpc3RJbmRleCkgPT4gKFxuJHtpbmRlbnR9ICAgICAgPEZsZXgga2V5PXtsaXN0SW5kZXh9IGdhcD17Mn0gYWxpZ249XCJjZW50ZXJcIj5cbiR7aW5kZW50fSAgICAgICAgPGRpdiBzdHlsZT17eyBmbGV4OiAxIH19PlxuJHtpbmRlbnR9ICAgICAgICAgIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgICAgICAgICAgdmFsdWU9e2xpc3RJdGVtIHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKV07XG4ke2luZGVudH0gICAgICAgICAgICAgIG5ld0xpc3RbbGlzdEluZGV4XSA9IHZhbHVlO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICBwbGFjZWhvbGRlcj17X18oJ0VudGVyIGl0ZW0uLi4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LXVwLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSB1cCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA9PT0gMCkgcmV0dXJuO1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggLSAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggLSAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA9PT0gMH1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LWRvd24tYWx0MlwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdNb3ZlIGRvd24nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IGxpc3QgPSAke3ZhbHVlQWNjZXNzb3J9IHx8IFtdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA+PSBsaXN0Lmxlbmd0aCAtIDEpIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4ubGlzdF07XG4ke2luZGVudH0gICAgICAgICAgICBbbmV3TGlzdFtsaXN0SW5kZXhdLCBuZXdMaXN0W2xpc3RJbmRleCArIDFdXSA9IFtuZXdMaXN0W2xpc3RJbmRleCArIDFdLCBuZXdMaXN0W2xpc3RJbmRleF1dO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBkaXNhYmxlZD17bGlzdEluZGV4ID49ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5sZW5ndGggLSAxfVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwidHJhc2hcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLmZpbHRlcigoXywgaSkgPT4gaSAhPT0gbGlzdEluZGV4KTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgKSl9XG4ke2luZGVudH0gICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKSwgJyddO1xuJHtpbmRlbnR9ICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICA+XG4ke2luZGVudH0gICAgICB7X18oJ0FkZCBJdGVtJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgPC9GbGV4PlxuJHtpbmRlbnR9PC9kaXY+YDtcbiAgICAgIH1cbiAgICAgIC8vIEZvciBvYmplY3QgYXJyYXlzLCBmYWxsIHRocm91Z2ggdG8gZGVmYXVsdCAodGhlc2Ugc2hvdWxkIGJlIGhhbmRsZWQgYnkgZ2VuZXJhdGVBcnJheUNvbnRyb2wgYXQgdG9wIGxldmVsKVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZENvbnRyb2xzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydHkucHJvcGVydGllcylcbiAgICAgICAgICAubWFwKChbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgJHt2YWx1ZUFjY2Vzc29yfT8uJHtuZXN0ZWRLZXl9YCxcbiAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgJHtuZXN0ZWRLZXl9OiAke3ZhbH0gfWApLFxuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudCArICcgICdcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2wobmVzdGVkS2V5LCBuZXN0ZWRQcm9wLCBuZXN0ZWRDb250ZXh0KTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtuZXN0ZWRDb250cm9sc31cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFycmF5IChyZXBlYXRlcikgY29udHJvbCB1c2luZyAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudFxuICogUHJvdmlkZXMgZHJhZy1hbmQtZHJvcCByZW9yZGVyaW5nIGFuZCBidWlsdC1pbiBhZGQvcmVtb3ZlIGZ1bmN0aW9uYWxpdHlcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGF0dHJOYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG5cbiAgLy8gR2VuZXJhdGUgZmllbGQgY29udHJvbHMgdGhhdCB1c2Ugc2V0SXRlbSBmcm9tIHRoZSBSZXBlYXRlciByZW5kZXIgcHJvcFxuICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgIGNvbnN0IGZpZWxkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRJdGVtKHsgLi4uaXRlbSwgJHtmaWVsZEtleX06ICR7dmFsdWV9IH0pYCxcbiAgICAgIGluZGVudDogaW5kZW50ICsgJyAgICAgICdcbiAgICB9O1xuICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBmaWVsZENvbnRleHQpO1xuICB9KS5qb2luKCdcXG4nKTtcblxuICAvLyBHZXQgYSBkaXNwbGF5IHRpdGxlIGZyb20gdGhlIGZpcnN0IHRleHQgZmllbGQgaWYgYXZhaWxhYmxlLCBmYWxsYmFjayB0byBmaWVsZCBsYWJlbFxuICBjb25zdCBmaXJzdFRleHRGaWVsZCA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykuZmluZCgoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3RleHQnKTtcbiAgY29uc3QgdGl0bGVBY2Nlc3NvciA9IGZpcnN0VGV4dEZpZWxkID8gYGl0ZW0uJHtmaXJzdFRleHRGaWVsZFswXX0gfHwgYCA6ICcnO1xuICBcbiAgLy8gQ3VzdG9tIGFkZCBidXR0b24gd2l0aCB0ZXJ0aWFyeSBzdHlsaW5nLCBwbHVzIGljb24sIHJpZ2h0IGFsaWduZWRcbiAgLy8gYWRkQnV0dG9uIGlzIGEgZnVuY3Rpb24gdGhhdCByZWNlaXZlcyBhZGRJdGVtIGFuZCByZXR1cm5zIGEgUmVhY3QgZWxlbWVudFxuICBjb25zdCBhZGRCdXR0b25Kc3ggPSBgKGFkZEl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b24td3JhcHBlclwiPlxuJHtpbmRlbnR9ICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgICBvbkNsaWNrPXthZGRJdGVtfVxuJHtpbmRlbnR9ICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHBhdGggZD1cIk0xMSAxMi41VjE3LjVIMTIuNVYxMi41SDE3LjVWMTFIMTIuNVY2SDExVjExSDZWMTIuNUgxMVpcIi8+XG4ke2luZGVudH0gICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvblwiXG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIHtfXygnQWRkICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApYDtcblxuICByZXR1cm4gYCR7aW5kZW50fTxSZXBlYXRlciBcbiR7aW5kZW50fSAgYXR0cmlidXRlPVwiJHthdHRyTmFtZX1cIiBcbiR7aW5kZW50fSAgYWxsb3dSZW9yZGVyaW5nPXt0cnVlfSBcbiR7aW5kZW50fSAgZGVmYXVsdFZhbHVlPXt7fX1cbiR7aW5kZW50fSAgYWRkQnV0dG9uPXske2FkZEJ1dHRvbkpzeH19XG4ke2luZGVudH0+XG4ke2luZGVudH0gIHsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1cIj5cbiR7aW5kZW50fSAgICAgIDxkZXRhaWxzIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2NvbGxhcHNlXCI+XG4ke2luZGVudH0gICAgICAgIDxzdW1tYXJ5IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2hlYWRlclwiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX3RpdGxlXCI+eyR7dGl0bGVBY2Nlc3Nvcn0nJHtsYWJlbH0nfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19hY3Rpb25zXCIgb25DbGljaz17KGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCl9PlxuJHtpbmRlbnR9ICAgICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBvbkNsaWNrPXtyZW1vdmVJdGVtfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk01IDYuNVYxOGEyIDIgMCAwMDIgMmgxMGEyIDIgMCAwMDItMlY2LjVoLTIuNVYxOGEuNS41IDAgMDEtLjUuNUg4YS41LjUgMCAwMS0uNS0uNVY2LjVINXpNOSA5djhoMS41VjlIOXptNC41IDB2OEgxNVY5aC0xLjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk0yMCA1aC01VjMuNUExLjUgMS41IDAgMDAxMy41IDJoLTNBMS41IDEuNSAwIDAwOSAzLjVWNUg0djEuNWgxNlY1em0tNi41IDBoLTNWMy41aDNWNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUgaXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L3N1bW1hcnk+XG4ke2luZGVudH0gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fZmllbGRzXCI+XG4ke2luZGVudH0gICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aXRlbUZpZWxkc31cbiR7aW5kZW50fSAgICAgICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kZXRhaWxzPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApfVxuJHtpbmRlbnR9PC9SZXBlYXRlcj5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0aGUgaW5zcGVjdG9yIGNvbnRyb2wgZm9yIGEgdG9wLWxldmVsIHByb3BlcnR5XG4gKiBVc2VzIGdlbmVyYXRlRmllbGRDb250cm9sIHdpdGggYSBzZXRBdHRyaWJ1dGVzIGNvbnRleHRcbiAqL1xuY29uc3QgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGluZGVudDogc3RyaW5nID0gJyAgICAgICAgICAnKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcblxuICAvLyBGb3IgYXJyYXkgdHlwZSwgdXNlIHRoZSBzcGVjaWFsaXplZCBhcnJheSBjb250cm9sXG4gIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgcmV0dXJuIGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIGF0dHJOYW1lLCBsYWJlbCwgaW5kZW50KTtcbiAgfVxuXG4gIC8vIEZvciBhbGwgb3RoZXIgdHlwZXMsIHVzZSB0aGUgdW5pZmllZCBmaWVsZCBjb250cm9sIGdlbmVyYXRvclxuICBjb25zdCBjb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgdmFsdWVBY2Nlc3NvcjogYXR0ck5hbWUsXG4gICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICBpbmRlbnRcbiAgfTtcblxuICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woa2V5LCBwcm9wZXJ0eSwgY29udGV4dCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGRlZmF1bHQgdmFsdWUgZm9yIGEgcHJvcGVydHkgdHlwZVxuICovXG5jb25zdCBnZXREZWZhdWx0VmFsdWUgPSAoZmllbGRQcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBhbnkgPT4ge1xuICBzd2l0Y2ggKGZpZWxkUHJvcC50eXBlKSB7XG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIHVybDogJycsIG9wZW5zSW5OZXdUYWI6IGZhbHNlIH07XG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiB7IGxhYmVsOiAnJywgaHJlZjogJyMnLCB0YXJnZXQ6ICcnLCByZWw6ICcnLCBkaXNhYmxlZDogZmFsc2UgfTtcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBhbHQ6ICcnIH07XG4gICAgY2FzZSAndmlkZW8nOlxuICAgICAgcmV0dXJuIHsgc3JjOiAnJywgaWQ6ICcnLCBwb3N0ZXI6ICcnLCB0eXBlOiAnJywgd2lkdGg6IDAsIGhlaWdodDogMCwgbWltZTogJycsIG1pbWVUeXBlOiAnJyB9O1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoZmllbGRQcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW25lc3RlZEtleSwgbmVzdGVkUHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRQcm9wLnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgbmVzdGVkW25lc3RlZEtleV0gPSBnZXREZWZhdWx0VmFsdWUobmVzdGVkUHJvcCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5lc3RlZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7fTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIDA7XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIFtdO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgaGVscGVyIGZ1bmN0aW9ucyBmb3IgYXJyYXkgcHJvcGVydGllc1xuICogTm90ZTogV2l0aCB0aGUgMTB1cCBSZXBlYXRlciBjb21wb25lbnQsIHdlIG5vIGxvbmdlciBuZWVkIGN1c3RvbSBhZGQvdXBkYXRlL3JlbW92ZS9tb3ZlIGZ1bmN0aW9uc1xuICogVGhlIFJlcGVhdGVyIGhhbmRsZXMgYWxsIG9mIHRoaXMgaW50ZXJuYWxseSB2aWEgaXRzIHJlbmRlciBwcm9wXG4gKi9cbmNvbnN0IGdlbmVyYXRlQXJyYXlIZWxwZXJzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBzdHJpbmcgPT4ge1xuICAvLyBUaGUgMTB1cCBSZXBlYXRlciBjb21wb25lbnQgaGFuZGxlcyBhcnJheSBtYW5pcHVsYXRpb24gaW50ZXJuYWxseVxuICAvLyBObyBjdXN0b20gaGVscGVyIGZ1bmN0aW9ucyBhcmUgbmVlZGVkXG4gIHJldHVybiAnJztcbn07XG5cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIGhhc2ggb2YgYSBzdHJpbmcgdG8gYSBudW1iZXIgaW4gWzAsIG1heCkuXG4gKi9cbmNvbnN0IGhhc2hTdHJpbmcgPSAoc3RyOiBzdHJpbmcsIG1heDogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgbGV0IGggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGggPSAoKGggPDwgNSkgLSBoICsgc3RyLmNoYXJDb2RlQXQoaSkpIHwgMDtcbiAgfVxuICByZXR1cm4gKChoICUgbWF4KSArIG1heCkgJSBtYXg7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFuIFNWRyBpY29uIGVsZW1lbnQgc3RyaW5nIGZvciB1c2UgaW4gcmVnaXN0ZXJCbG9ja1R5cGUuXG4gKiBDcmVhdGVzIGEgY29sb3JlZCByb3VuZGVkIHJlY3RhbmdsZSB3aXRoIDEtMiBsZXR0ZXIgaW5pdGlhbHMgZGVyaXZlZFxuICogZnJvbSB0aGUgYmxvY2sgdGl0bGUsIHdpdGggdGhlIGJhY2tncm91bmQgY29sb3Iga2V5ZWQgdG8gdGhlIGdyb3VwLlxuICovXG5jb25zdCBnZW5lcmF0ZVN2Z0ljb24gPSAodGl0bGU6IHN0cmluZywgZ3JvdXA6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IEdST1VQX0NPTE9SUyA9IFtcbiAgICAnIzVCMjFCNicsICcjMEU3NDkwJywgJyNCNDUzMDknLCAnIzA0Nzg1NycsXG4gICAgJyNCRTEyM0MnLCAnIzQzMzhDQScsICcjMDM2OUExJywgJyNBMTYyMDcnLFxuICAgICcjMTU4MDNEJywgJyM5MzMzRUEnLCAnI0MyNDEwQycsICcjMUQ0RUQ4JyxcbiAgICAnIzA1OTY2OScsICcjN0MzQUVEJywgJyNEQzI2MjYnLCAnIzI1NjNFQicsXG4gIF07XG5cbiAgY29uc3Qgd29yZHMgPSB0aXRsZS5zcGxpdCgvW1xcc18tXSsvKS5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IGluaXRpYWxzID0gd29yZHMubGVuZ3RoID49IDJcbiAgICA/ICh3b3Jkc1swXVswXSArIHdvcmRzWzFdWzBdKS50b1VwcGVyQ2FzZSgpXG4gICAgOiAod29yZHNbMF0/LnN1YnN0cmluZygwLCAyKSB8fCAnSE8nKS50b1VwcGVyQ2FzZSgpO1xuXG4gIGNvbnN0IGNvbG9yID0gR1JPVVBfQ09MT1JTW2hhc2hTdHJpbmcoZ3JvdXAgfHwgdGl0bGUsIEdST1VQX0NPTE9SUy5sZW5ndGgpXTtcblxuICByZXR1cm4gYDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj5cbiAgICAgIDxyZWN0IHg9XCIyXCIgeT1cIjJcIiB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiByeD1cIjRcIiBmaWxsPVwiJHtjb2xvcn1cIiAvPlxuICAgICAgPHRleHQgeD1cIjEyXCIgeT1cIjE2LjVcIiB0ZXh0QW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIndoaXRlXCIgZm9udFNpemU9XCIxMFwiIGZvbnRGYW1pbHk9XCItYXBwbGUtc3lzdGVtLEJsaW5rTWFjU3lzdGVtRm9udCxzYW5zLXNlcmlmXCIgZm9udFdlaWdodD1cIjYwMFwiPiR7aW5pdGlhbHN9PC90ZXh0PlxuICAgIDwvc3ZnPmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIGluZGV4LmpzIGZpbGVcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGR5bmFtaWNBcnJheUNvbmZpZ3MgLSBPcHRpb25hbCBkeW5hbWljIGFycmF5IGNvbmZpZ3VyYXRpb25zIGtleWVkIGJ5IGZpZWxkIG5hbWVcbiAqIEBwYXJhbSBpbm5lckJsb2Nrc0ZpZWxkIC0gVGhlIHJpY2h0ZXh0IGZpZWxkIHRoYXQgdXNlcyBJbm5lckJsb2Nrcywgb3IgbnVsbCBpZiBub25lXG4gKiBAcGFyYW0gZGVwcmVjYXRpb25zQ29kZSAtIE9wdGlvbmFsIGRlcHJlY2F0aW9uIG1pZ3JhdGlvbiBjb2RlXG4gKiBAcGFyYW0gaGFzU2NyZWVuc2hvdCAtIFdoZXRoZXIgYSBzY3JlZW5zaG90LnBuZyBpcyBhdmFpbGFibGUgZm9yIGluc2VydGVyIHByZXZpZXdcbiAqL1xuY29uc3QgZ2VuZXJhdGVJbmRleEpzID0gKFxuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsXG4gIGR5bmFtaWNBcnJheUNvbmZpZ3M/OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4sXG4gIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsLFxuICBkZXByZWNhdGlvbnNDb2RlPzogc3RyaW5nLFxuICBoYXNTY3JlZW5zaG90PzogYm9vbGVhblxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50LmlkKTtcbiAgY29uc3QgcHJvcGVydGllcyA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzO1xuXG4gIC8vIGhhc0R5bmFtaWNBcnJheXMgaXMgdHJ1ZSBvbmx5IHdoZW4gdGhlcmUgYXJlIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGZpZWxkcyDigJRcbiAgLy8gdGhlIHNpbXBsZXIgdHlwZXMgKGJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24pIGRvbid0IG5lZWQgRHluYW1pY1Bvc3RTZWxlY3Rvci5cbiAgY29uc3QgaGFzRHluYW1pY0FycmF5cyA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZShcbiAgICAgICAgKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYylcbiAgICAgIClcbiAgICA6IGZhbHNlO1xuXG4gIC8vIEhlbHBlciB0byBjaGVjayBmb3IgYSB0eXBlIGluIHByb3BlcnRpZXMsIGluY2x1ZGluZyBuZXN0ZWQgaW4gYXJyYXlzL29iamVjdHNcbiAgY29uc3QgaGFzUHJvcGVydHlUeXBlID0gKHR5cGU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgIGNvbnN0IGNoZWNrUHJvcGVydHkgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgfTtcblxuICAvLyBUaGUgaW5uZXJCbG9ja3NGaWVsZCB1c2VzIElubmVyQmxvY2tzIChjb250ZW50IHN0b3JlZCBpbiBwb3N0X2NvbnRlbnQsIG5vdCBhbiBhdHRyaWJ1dGUpLlxuICAvLyBBbGwgb3RoZXIgcmljaHRleHQgZmllbGRzIGJlY29tZSBzdHJpbmcgYXR0cmlidXRlcyB3aXRoIFJpY2hUZXh0IGVkaXRpbmcuXG4gIGNvbnN0IHVzZUlubmVyQmxvY2tzID0gISFpbm5lckJsb2Nrc0ZpZWxkO1xuXG4gIC8vIEdldCBhbGwgYXR0cmlidXRlIG5hbWVzIOKAkyBleGNsdWRlIGlubmVyQmxvY2tzRmllbGQgYW5kIHBhZ2luYXRpb25cbiAgY29uc3QgYXR0ck5hbWVzID0gT2JqZWN0LmtleXMocHJvcGVydGllcylcbiAgICAuZmlsdGVyKGsgPT4gayAhPT0gaW5uZXJCbG9ja3NGaWVsZCAmJiBwcm9wZXJ0aWVzW2tdLnR5cGUgIT09ICdwYWdpbmF0aW9uJylcbiAgICAubWFwKHRvQ2FtZWxDYXNlKTtcblxuICAvLyBJbmNsdWRlIGFueSBhdHRyaWJ1dGUgbmFtZXMgcmVmZXJlbmNlZCBpbiB0aGUgdGVtcGxhdGUgYnV0IG1pc3NpbmcgZnJvbSBBUEkgcHJvcGVydGllc1xuICAvLyAoZS5nLiBib2R5IC0+IGJsb2NrQm9keSBzbyBKU1ggaGFzIGEgZGVmaW5lZCB2YXJpYWJsZSBhbmQgbm8gUmVmZXJlbmNlRXJyb3IpLlxuICAvLyBTa2lwIHRoZSBpbm5lckJsb2Nrc0ZpZWxkIOKAlCBpdHMgY29udGVudCBpcyBzdG9yZWQgdmlhIElubmVyQmxvY2tzLCBub3QgYXMgYW4gYXR0cmlidXRlLlxuICBjb25zdCBpbm5lckJsb2Nrc0F0dHJOYW1lID0gaW5uZXJCbG9ja3NGaWVsZCA/IHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpIDogbnVsbDtcbiAgZm9yIChjb25zdCBuYW1lIG9mIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzKGNvbXBvbmVudC5jb2RlKSkge1xuICAgIGlmICghYXR0ck5hbWVzLmluY2x1ZGVzKG5hbWUpICYmIG5hbWUgIT09IGlubmVyQmxvY2tzQXR0ck5hbWUpIGF0dHJOYW1lcy5wdXNoKG5hbWUpO1xuICB9XG4gIFxuICAvLyBBZGQgZHluYW1pYyBhcnJheSBhdHRyaWJ1dGUgbmFtZXMgYmFzZWQgb24gY29uZmlnIHR5cGVcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykgfHwgaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Qb3N0VHlwZWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1SZW5kZXJNb2RlYCk7XG4gICAgICAgIGlmICgoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbikge1xuICAgICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggY29tcG9uZW50cyB3ZSBuZWVkIHRvIGltcG9ydFxuICBjb25zdCBuZWVkc01lZGlhVXBsb2FkID0gaGFzUHJvcGVydHlUeXBlKCdpbWFnZScpO1xuICBjb25zdCBuZWVkc1JhbmdlQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnbnVtYmVyJyk7XG4gIGNvbnN0IG5lZWRzVG9nZ2xlQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnYm9vbGVhbicpIHx8IGhhc1Byb3BlcnR5VHlwZSgnYnV0dG9uJyk7XG4gIGNvbnN0IG5lZWRzU2VsZWN0Q29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnc2VsZWN0Jyk7XG4gIGNvbnN0IGhhc0FycmF5UHJvcHMgPSBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUocCA9PiBwLnR5cGUgPT09ICdhcnJheScpO1xuICBjb25zdCBoYXNPYmplY3RQcm9wcyA9IGhhc1Byb3BlcnR5VHlwZSgnb2JqZWN0Jyk7XG5cbiAgLy8gQnVpbGQgaW1wb3J0c1xuICBjb25zdCBibG9ja0VkaXRvckltcG9ydHMgPSBbJ3VzZUJsb2NrUHJvcHMnLCAnSW5zcGVjdG9yQ29udHJvbHMnLCAnQmxvY2tDb250cm9scyddO1xuICBpZiAobmVlZHNNZWRpYVVwbG9hZCkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdNZWRpYVVwbG9hZCcsICdNZWRpYVVwbG9hZENoZWNrJywgJ01lZGlhUmVwbGFjZUZsb3cnKTtcbiAgfVxuICAvLyBJbm5lckJsb2NrcyBmb3IgdGhlIGRlc2lnbmF0ZWQgcmljaHRleHQgY29udGVudCBhcmVhXG4gIGlmICh1c2VJbm5lckJsb2Nrcykge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG4gIC8vIExpbmtDb250cm9sIGZvciBsaW5rL2J1dHRvbiBmaWVsZHMgKHdoZW4gbm90IHVzaW5nIHNoYXJlZCBIYW5kb2ZmTGlua0ZpZWxkKVxuICBjb25zdCBuZWVkc0xpbmtDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcblxuICBjb25zdCBoYXNCcmVhZGNydW1ic0FycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc0JyZWFkY3J1bWJzQ29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG4gIGNvbnN0IGhhc1RheG9ub215QXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzUGFnaW5hdGlvbkFycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpXG4gICAgOiBmYWxzZTtcblxuICBjb25zdCBjb21wb25lbnRJbXBvcnRzID0gWydQYW5lbEJvZHknLCAnVGV4dENvbnRyb2wnLCAnQnV0dG9uJ107XG4gIGlmIChuZWVkc1JhbmdlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdSYW5nZUNvbnRyb2wnKTtcbiAgLy8gVG9nZ2xlQ29udHJvbDogb25seSBmb3IgYm9vbGVhbi9idXR0b24gcHJvcGVydHkgZmllbGRzIOKAlCBzcGVjaWFsIGFycmF5IHR5cGVzIHVzZSBzaGFyZWQgY29tcG9uZW50c1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgLy8gU2VsZWN0Q29udHJvbDogb25seSBmb3Igc2VsZWN0IHByb3BlcnR5IGZpZWxkcyBvciBEeW5hbWljUG9zdFNlbGVjdG9yIChwb3N0cykg4oCUIHRheG9ub215IGhhbmRsZWQgYnkgVGF4b25vbXlTZWxlY3RvclxuICBpZiAobmVlZHNTZWxlY3RDb250cm9sIHx8IGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU2VsZWN0Q29udHJvbCcpO1xuICAvLyBTcGlubmVyIGZvciBkeW5hbWljIGFycmF5IGxvYWRpbmcgc3RhdGUgaW4gZWRpdG9yIHByZXZpZXdcbiAgaWYgKGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuICAvLyBUZXh0YXJlYUNvbnRyb2w6IG5lZWRlZCB3aGVuIHJpY2h0ZXh0IGZpZWxkcyBhcHBlYXIgaW5zaWRlIGFycmF5IGl0ZW1zXG4gIGNvbnN0IGhhc1JpY2h0ZXh0SW5BcnJheSA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmIHAuaXRlbXM/LnByb3BlcnRpZXMgJiZcbiAgICBPYmplY3QudmFsdWVzKHAuaXRlbXMucHJvcGVydGllcykuc29tZShpcCA9PiBpcC50eXBlID09PSAncmljaHRleHQnKVxuICApO1xuICBpZiAoaGFzUmljaHRleHRJbkFycmF5KSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RleHRhcmVhQ29udHJvbCcpO1xuXG4gIGNvbXBvbmVudEltcG9ydHMucHVzaCgnRmxleCcpO1xuXG4gIC8vIDEwdXAgYmxvY2stY29tcG9uZW50cyBpbXBvcnRzXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIHdoZW4gdGhlcmUgYXJlIG5vbi1zZXJ2ZXItcmVuZGVyZWQgYXJyYXkgZmllbGRzIGluIHRoZSBzaWRlYmFyXG4gIC8vICh0YXhvbm9teS9icmVhZGNydW1icy9wYWdpbmF0aW9uIGFycmF5cyB1c2Ugc2hhcmVkIGNvbXBvbmVudHMgdGhhdCBpbXBvcnQgUmVwZWF0ZXIgdGhlbXNlbHZlcylcbiAgY29uc3QgaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmICghZHluYW1pY0FycmF5Q29uZmlncz8uW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICk7XG4gIGNvbnN0IHRlblVwSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGhhc05vblNwZWNpYWxBcnJheVByb3BzKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhcnJheSBoZWxwZXJzXG4gIGNvbnN0IGFycmF5SGVscGVycyA9IGdlbmVyYXRlQXJyYXlIZWxwZXJzKHByb3BlcnRpZXMpO1xuXG4gIC8vIEdlbmVyYXRlIEpTWCBwcmV2aWV3IGZyb20gaGFuZGxlYmFycyB0ZW1wbGF0ZVxuICAvLyBUaGlzIG11c3QgaGFwcGVuIGJlZm9yZSBwYW5lbCBnZW5lcmF0aW9uIHNvIHdlIGtub3cgd2hpY2ggZmllbGRzIGhhdmUgaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgcHJldmlld1Jlc3VsdCA9IGdlbmVyYXRlSnN4UHJldmlldyhcbiAgICBjb21wb25lbnQuY29kZSxcbiAgICBwcm9wZXJ0aWVzLFxuICAgIGNvbXBvbmVudC5pZCxcbiAgICBjb21wb25lbnQudGl0bGUsXG4gICAgaW5uZXJCbG9ja3NGaWVsZFxuICApO1xuICBsZXQgcHJldmlld0pzeCA9IHByZXZpZXdSZXN1bHQuanN4O1xuICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgLy8gRGV0ZWN0IGlmIHByZXZpZXcgdXNlcyBIYW5kb2ZmTGlua0ZpZWxkIChsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZylcbiAgY29uc3QgcHJldmlld1VzZXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuXG4gIC8vIEdlbmVyYXRlIHBhbmVsIGJvZGllcyBmb3IgZWFjaCBwcm9wZXJ0eVxuICBjb25zdCBwYW5lbHM6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICAvLyByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgLy8gcGFnaW5hdGlvbiBpcyBhdXRvLWdlbmVyYXRlZCBmcm9tIHF1ZXJ5IHJlc3VsdHMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcblxuICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIGlubGluZS1lZGl0YWJsZSBvbiB0aGUgY2FudmFzICh0ZXh0LCBpbWFnZSwgbGluaywgYnV0dG9uXG4gICAgLy8gd3JhcHBlZCBpbiB7eyNmaWVsZH19KSDigJMgdGhleSBkb24ndCBuZWVkIHNpZGViYXIgY29udHJvbHMuXG4gICAgLy8gQXJyYXkgZmllbGRzIGFyZSBhbHdheXMga2VwdDogdGhleSBuZWVkIHNpZGViYXIgVUkgZm9yIG1hbnVhbC9keW5hbWljIHRvZ2dsZVxuICAgIC8vIGFuZCBmb3IgYWRkaW5nL3JlbW92aW5nIGl0ZW1zLCBldmVuIHdoZW4gdGhlaXIgY2hpbGQgZmllbGRzIGFyZSBpbmxpbmUtZWRpdGFibGUuXG4gICAgaWYgKGlubGluZUVkaXRhYmxlRmllbGRzLmhhcyhrZXkpICYmIHByb3BlcnR5LnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgZHluYW1pYyBhcnJheSBmaWVsZFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIGR5bmFtaWNDb25maWcpIHtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIEJyZWFkY3J1bWJzOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gQnJlYWRjcnVtYnMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxCcmVhZGNydW1ic1NlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBUYXhvbm9teTogc2hhcmVkIGNvbXBvbmVudCB3aXRoIEF1dG8gLyBNYW51YWwgdGFic1xuICAgICAgICBjb25zdCB0YXhvbm9teU9wdGlvbnMgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdCwgdmFsdWU6IHQgfSkpO1xuICAgICAgICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcHMpLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICBpbmRlbnQ6ICcgICAgICAgICAgICAgICAgJyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGN0eCk7XG4gICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJylcbiAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnTGFiZWwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS5sYWJlbCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgbGFiZWw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+XG4gICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnVVJMJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0udXJsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCB1cmw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+YDtcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBUYXhvbm9teSAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFRheG9ub215U2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgZGVmYXVsdFRheG9ub215PVwiJHtkZWZhdWx0VGF4b25vbXl9XCJcbiAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93ICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgIDw+XG4ke2l0ZW1GaWVsZHN9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gUGFnaW5hdGlvbjogc2hhcmVkIGNvbXBvbmVudCB3aXRoIHNpbmdsZSB2aXNpYmlsaXR5IHRvZ2dsZVxuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFBhZ2luYXRpb24gKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxQYWdpbmF0aW9uU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUG9zdHMgKER5bmFtaWNBcnJheUNvbmZpZyk6IGZ1bGwgRHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICBjb25zdCBkZWZhdWx0TW9kZSA9IGR5bmFtaWNDb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgIGNvbnN0IGFkdmFuY2VkRmllbGRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBvcHRpb25zPzogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+OyBkZWZhdWx0PzogYW55IH0+ID0gW107XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gaXRlbU92ZXJyaWRlc0NvbmZpZyAobGVnYWN5KVxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCBjXSBvZiBPYmplY3QuZW50cmllcyhpdGVtT3ZlcnJpZGVzQ29uZmlnKSBhcyBBcnJheTxbc3RyaW5nLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZ10+KSB7XG4gICAgICAgICAgaWYgKGMubW9kZSA9PT0gJ3VpJykge1xuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWUsIGxhYmVsOiBjLmxhYmVsLCB0eXBlOiAnc2VsZWN0Jywgb3B0aW9uczogbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhjLm9wdGlvbnMpLCBkZWZhdWx0OiBjLmRlZmF1bHQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gZmllbGRNYXBwaW5nIHdpdGggdHlwZTogXCJtYW51YWxcIiDigJQgZGVyaXZlIGNvbnRyb2wgdHlwZSBmcm9tIGl0ZW0gcHJvcGVydGllc1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gZHluYW1pY0NvbmZpZy5maWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBtYXBwaW5nVmFsdWUgPT09ICdvYmplY3QnICYmIG1hcHBpbmdWYWx1ZSAhPT0gbnVsbCAmJiAobWFwcGluZ1ZhbHVlIGFzIGFueSkudHlwZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHRvcEtleSA9IGZpZWxkUGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTGFiZWwgPSBpdGVtUHJvcD8ubmFtZSB8fCB0b1RpdGxlQ2FzZSh0b3BLZXkpO1xuICAgICAgICAgICAgbGV0IGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGxldCBkZWZhdWx0VmFsOiBhbnkgPSBpdGVtUHJvcD8uZGVmYXVsdCA/PyAnJztcbiAgICAgICAgICAgIGlmIChpdGVtUHJvcCkge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnc2VsZWN0JztcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0b2dnbGUnO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gZmFsc2U7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnbnVtYmVyJztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IDA7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYWdpbmF0aW9uVG9nZ2xlID0gZHluYW1pY0NvbmZpZy5wYWdpbmF0aW9uXG4gICAgICAgICAgPyBgXG4gICAgICAgICAgICAgICAgPFRvZ2dsZUNvbnRyb2xcbiAgICAgICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyBQYWdpbmF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9eyR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQgPz8gdHJ1ZX1cbiAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkOiB2YWx1ZSB9KX1cbiAgICAgICAgICAgICAgICAvPmBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIER5bmFtaWMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgc291cmNlOiAke2F0dHJOYW1lfVNvdXJjZSB8fCAnJHtkZWZhdWx0TW9kZX0nLFxuICAgICAgICAgICAgICAgIHBvc3RUeXBlOiAke2F0dHJOYW1lfVBvc3RUeXBlLFxuICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHthdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3N0czogJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgIGl0ZW1PdmVycmlkZXM6ICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICBvbkNoYW5nZT17KG5leHRWYWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7XG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Tb3VyY2U6IG5leHRWYWx1ZS5zb3VyY2UsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9UXVlcnlBcmdzOiB7IC4uLm5leHRWYWx1ZS5xdWVyeUFyZ3MsIHBvc3RfdHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzOiBuZXh0VmFsdWUuc2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICBvcHRpb25zPXt7XG4gICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgbWF4SXRlbXM6ICR7ZHluYW1pY0NvbmZpZy5tYXhJdGVtcyA/PyAyMH0sXG4gICAgICAgICAgICAgICAgdGV4dERvbWFpbjogJ2hhbmRvZmYnLFxuICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICBzaG93RXhjbHVkZUN1cnJlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHM6ICR7SlNPTi5zdHJpbmdpZnkoYWR2YW5jZWRGaWVsZHMpfVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz4ke3BhZ2luYXRpb25Ub2dnbGV9XG4gICAgICAgICAgICB7JHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnICYmIChcbiAgICAgICAgICAgICAgPD5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RhbmRhcmQgcGFuZWwgKG5vbi1keW5hbWljKVxuICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWRkIEhhbmRvZmYgZGVzaWduIHN5c3RlbSBsaW5rcyBwYW5lbFxuICBjb25zdCBkZXNpZ25TeXN0ZW1QYW5lbCA9IFtcbiAgICAnICAgICAgICAgIHsvKiBEZXNpZ24gU3lzdGVtIExpbmtzICovfScsXG4gICAgJyAgICAgICAgICB7KG1ldGFkYXRhLl9faGFuZG9mZj8uaGFuZG9mZlVybCB8fCBtZXRhZGF0YS5fX2hhbmRvZmY/LmZpZ21hVXJsKSAmJiAoJyxcbiAgICAnICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oXFwnRGVzaWduIFN5c3RlbVxcJywgXFwnaGFuZG9mZlxcJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+JyxcbiAgICAnICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PicsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsICYmICgnLFxuICAgICcgICAgICAgICAgICAgICAgICA8QnV0dG9uJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB2YXJpYW50PVwic2Vjb25kYXJ5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGhyZWY9e21ldGFkYXRhLl9faGFuZG9mZi5oYW5kb2ZmVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cInZpc2liaWxpdHlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IFxcJzEwMCVcXCcsIGp1c3RpZnlDb250ZW50OiBcXCdjZW50ZXJcXCcgfX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA+JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB7X18oXFwnVmlldyBpbiBIYW5kb2ZmXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgICAge21ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmZpZ21hVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdPcGVuIGluIEZpZ21hXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgIDwvRmxleD4nLFxuICAgICcgICAgICAgICAgICA8L1BhbmVsQm9keT4nLFxuICAgICcgICAgICAgICAgKX0nLFxuICBdLmpvaW4oJ1xcbicpO1xuICBwYW5lbHMucHVzaChkZXNpZ25TeXN0ZW1QYW5lbCk7XG5cbiAgLy8gRHluYW1pYyBhcnJheSByZXNvbHV0aW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cyk6IGZ1bGwgdXNlU2VsZWN0IHJlc29sdXRpb25cbiAgLy8gQnJlYWRjcnVtYnM6IGxpdmUgZmV0Y2ggdmlhIFJFU1QgZW5kcG9pbnRcbiAgLy8gVGF4b25vbXkgKGF1dG8gbW9kZSk6IGxpdmUgZmV0Y2ggdmlhIHVzZVNlbGVjdCB3aXRoIGNvcmUtZGF0YVxuICAvLyBQYWdpbmF0aW9uOiBzZXJ2ZXItcmVuZGVyZWQgb25seSAoc3R1YiB2YXJpYWJsZSlcbiAgbGV0IGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlID0gJyc7XG4gIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gZmllbGRQcm9wPy5pdGVtcz8ucHJvcGVydGllcztcblxuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgeyBzZXRQcmV2aWV3JHtjYXB9KFtdKTsgcmV0dXJuOyB9XG4gICAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHNldFByZXZpZXcke2NhcH0oW10pKTtcbiAgICB9LCBbJHthdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcbiAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKc1xuICAgICAgICAgID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgICAoc2VsZWN0KSA9PiB7XG4gICAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICAgIGlmICgke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke2F0dHJOYW1lfSB8fCBbXTtcbiAgICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGF4b25vbXkgPSAke2F0dHJOYW1lfVRheG9ub215IHx8ICcke2NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgICAgY29uc3QgcmVzdEJhc2UgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0VGF4b25vbXkodGF4b25vbXkpPy5yZXN0X2Jhc2U7XG4gICAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2NvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICAgIGlmICghdGVybXMpIHJldHVybiBbXTtcbiAgICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgICAgfSxcbiAgICAgIFske2F0dHJOYW1lfUVuYWJsZWQsICR7YXR0ck5hbWV9U291cmNlLCAke2F0dHJOYW1lfVRheG9ub215LCBKU09OLnN0cmluZ2lmeSgke2F0dHJOYW1lfSB8fCBbXSldXG4gICAgKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkfFNvdXJjZXxUYXhvbm9teSlgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9ID0gW107IC8vIFBhZ2luYXRpb24gcmVuZGVycyBvbiB0aGUgZnJvbnRlbmRcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgIGNvbnN0IHByZXZpZXdWYXJOYW1lID0gYHByZXZpZXcke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgcmVzb2x2aW5nRmxhZ3MucHVzaChyZXNvbHZpbmdWYXJOYW1lKTtcbiAgICAgIGNvbnN0IHNvdXJjZUF0dHIgPSBgJHthdHRyTmFtZX1Tb3VyY2VgO1xuICAgICAgY29uc3QgcXVlcnlBcmdzQXR0ciA9IGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2A7XG4gICAgICBjb25zdCBwb3N0VHlwZUF0dHIgPSBgJHthdHRyTmFtZX1Qb3N0VHlwZWA7XG4gICAgICBjb25zdCBzZWxlY3RlZFBvc3RzQXR0ciA9IGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgO1xuICAgICAgY29uc3QgZmllbGRNYXBwaW5nQXR0ciA9IGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2A7XG4gICAgICBjb25zdCBpdGVtT3ZlcnJpZGVzQXR0ciA9IGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgO1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBzdG9yZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKTtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdxdWVyeScpIHtcbiAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHtwb3N0VHlwZUF0dHJ9IHx8ICdwb3N0JztcbiAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2NvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgIG9yZGVyYnk6IHF1ZXJ5QXJncy5vcmRlcmJ5IHx8ICdkYXRlJyxcbiAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgIHN0YXR1czogJ3B1Ymxpc2gnLFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHF1ZXJ5QXJncy50YXhfcXVlcnkgJiYgcXVlcnlBcmdzLnRheF9xdWVyeS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHF1ZXJ5QXJncy50YXhfcXVlcnkuZm9yRWFjaCgodHEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCF0cS50YXhvbm9teSB8fCAhdHEudGVybXMgfHwgIXRxLnRlcm1zLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgICAgICAgICBjb25zdCBwYXJhbSA9IHRxLnRheG9ub215ID09PSAnY2F0ZWdvcnknID8gJ2NhdGVnb3JpZXMnIDogdHEudGF4b25vbXkgPT09ICdwb3N0X3RhZycgPyAndGFncycgOiB0cS50YXhvbm9teTtcbiAgICAgICAgICAgICAgYXJnc1twYXJhbV0gPSB0cS50ZXJtcy5qb2luKCcsJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgIGlmIChyZWNvcmRzID09PSBudWxsIHx8IHJlY29yZHMgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgIG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9ICR7c2VsZWN0ZWRQb3N0c0F0dHJ9IHx8IFtdO1xuICAgICAgICAgIGlmICghc2VsZWN0ZWQubGVuZ3RoKSByZXR1cm4gW107XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge307XG4gICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcmVjID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkKCdwb3N0VHlwZScsIHNlbC50eXBlIHx8ICdwb3N0Jywgc2VsLmlkKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0sXG4gICAgICBbJHtzb3VyY2VBdHRyfSwgJHtwb3N0VHlwZUF0dHJ9LCBKU09OLnN0cmluZ2lmeSgke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW10pLCBKU09OLnN0cmluZ2lmeSgke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge30pXVxuICAgICk7XG4gICAgY29uc3QgJHtwcmV2aWV3VmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7YXR0ck5hbWV9ID8/IFtdKTtcbiAgICBjb25zdCAke3Jlc29sdmluZ1Zhck5hbWV9ID0gJHtzb3VyY2VBdHRyfSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgLy8gVXNlIHByZXZpZXcgdmFyaWFibGUgaW4gdGhlIGdlbmVyYXRlZCBwcmV2aWV3IEpTWCBzbyB0aGUgZWRpdG9yIHNob3dzIHF1ZXJ5L3NlbGVjdCByZXN1bHRzXG4gICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiYCwgJ2cnKTtcbiAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgIH1cbiAgICBpZiAocmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMCkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IGlzUHJldmlld0xvYWRpbmcgPSAke3Jlc29sdmluZ0ZsYWdzLmpvaW4oJyB8fCAnKX07XG5gO1xuICAgIH1cbiAgICAvLyBXaGVuIHByZXZpZXcgSlNYIHJlZmVyZW5jZXMgcGFnaW5hdGlvbiAoZnJvbSBIQlMpIGJ1dCBwYWdpbmF0aW9uIGlzIG9ubHkgYnVpbHQgc2VydmVyLXNpZGUsXG4gICAgLy8gZGVmaW5lIGl0IGluIHRoZSBlZGl0IHNvIHRoZSBlZGl0b3IgZG9lc24ndCB0aHJvdyBSZWZlcmVuY2VFcnJvci5cbiAgICBjb25zdCBwcmV2aWV3VXNlc1BhZ2luYXRpb24gPSAvXFxicGFnaW5hdGlvblxcYi8udGVzdChwcmV2aWV3SnN4KTtcbiAgICBjb25zdCBhbnlDb25maWdIYXNQYWdpbmF0aW9uID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYykgJiYgISEoYyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pXG4gICAgICA6IGZhbHNlO1xuICAgIGlmIChwcmV2aWV3VXNlc1BhZ2luYXRpb24gJiYgYW55Q29uZmlnSGFzUGFnaW5hdGlvbiAmJiAhZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUuaW5jbHVkZXMoJ2NvbnN0IHBhZ2luYXRpb24nKSkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSBgICAgIGNvbnN0IHBhZ2luYXRpb24gPSBbXTsgLy8gRWRpdG9yOiBwYWdpbmF0aW9uIGlzIGJ1aWx0IHNlcnZlci1zaWRlIGluIHJlbmRlci5waHBcbmAgKyBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZTtcbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHVzaW5nIGR5bmFtaWMgcG9zdHMsIHdyYXAgcHJldmlldyBpbiBsb2FkaW5nIHN0YXRlXG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIGNvbnN0IHByZXZpZXdDb250ZW50ID0gcmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMFxuICAgID8gYHtpc1ByZXZpZXdMb2FkaW5nID8gKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IGlzLWxvYWRpbmdcIiBzdHlsZT17eyBtaW5IZWlnaHQ6ICcxMjBweCcsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgZ2FwOiAnOHB4JyB9fT5cbiAgICAgICAgICAgIDxTcGlubmVyIC8+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBjb2xvcjogJ3ZhcigtLXdwLWFkbWluLXRoZW1lLWNvbG9yLWRhcmtlciwgIzFlMWUxZSknIH19PntfXygnTG9hZGluZyBwb3N0c+KApicsICdoYW5kb2ZmJyl9PC9zcGFuPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogKFxuJHtwcmV2aWV3SnN4fVxuICAgICAgICApfWBcbiAgICA6IHByZXZpZXdKc3g7XG5cbiAgLy8gQ2hlY2sgdGhlIGdlbmVyYXRlZCBwcmV2aWV3IGZvciBjb21wb25lbnRzIHRoYXQgbmVlZCB0byBiZSBpbXBvcnRlZFxuICAvLyBUaGlzIGNhdGNoZXMgY29tcG9uZW50cyBhZGRlZCBieSB0aGUgaGFuZGxlYmFycy10by1qc3ggdHJhbnNwaWxlciAoZS5nLiwgZnJvbSB7eyNmaWVsZH19IG1hcmtlcnMpXG4gIGNvbnN0IHByZXZpZXdVc2VzUmljaFRleHQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8UmljaFRleHQnKTtcbiAgY29uc3QgcHJldmlld1VzZXMxMHVwSW1hZ2UgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKTtcblxuICAvLyBBZGQgUmljaFRleHQgdG8gaW1wb3J0cyBpZiB1c2VkIGluIHByZXZpZXcgKGFuZCBub3QgYWxyZWFkeSBpbmNsdWRlZCBmcm9tIHByb3BlcnR5IHR5cGVzKVxuICBpZiAoKHByZXZpZXdVc2VzUmljaFRleHQgfHwgcHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIC8vIExpbmtDb250cm9sIGlzIG5lZWRlZCBmb3Igc2lkZWJhciBsaW5rL2J1dHRvbiBwcm9wZXJ0eSBwYW5lbHM7IGFkZCB1bmNvbmRpdGlvbmFsbHkgd2hlbiBwcmVzZW50LlxuICAvLyAoSGFuZG9mZkxpbmtGaWVsZCBpbiB0aGUgcHJldmlldyBpcyBzZXBhcmF0ZSDigJQgaXQncyBpbXBvcnRlZCBmcm9tIHRoZSBzaGFyZWQgY29tcG9uZW50IGFuZCBoYW5kbGVzIGl0cyBvd24gTGlua0NvbnRyb2wgaW50ZXJuYWxseS4pXG4gIGlmIChuZWVkc0xpbmtDb250cm9sKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghY29tcG9uZW50SW1wb3J0cy5pbmNsdWRlcygnUG9wb3ZlcicpKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1BvcG92ZXInKTtcbiAgfVxuXG4gIC8vIEFkZCBJbm5lckJsb2NrcyBpZiB1c2VkIGluIHByZXZpZXcgYnV0IG5vdCBhbHJlYWR5IGltcG9ydGVkXG4gIGNvbnN0IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgaWYgKHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnSW5uZXJCbG9ja3MnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIDEwdXAgaW1wb3J0IGlmIG5lZWRlZCAoSW1hZ2UgZm9yIHByZXZpZXcsIFJlcGVhdGVyIGZvciBhcnJheXMpXG4gIGlmIChwcmV2aWV3VXNlczEwdXBJbWFnZSkge1xuICAgIHRlblVwSW1wb3J0cy5wdXNoKCdJbWFnZScpO1xuICB9XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDBcbiAgICA/IGBpbXBvcnQgeyAke3RlblVwSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnO1xcbmBcbiAgICA6ICcnO1xuXG4gIC8vIENvbGxlY3QgYWxsIGltYWdlIGZpZWxkcyBmb3IgQmxvY2tDb250cm9scy9NZWRpYVJlcGxhY2VGbG93XG4gIGludGVyZmFjZSBJbWFnZUZpZWxkSW5mbyB7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBhdHRyUGF0aDogc3RyaW5nOyAgLy8gZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2xlZnRDYXJkLmltYWdlJ1xuICAgIHZhbHVlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQ/LmltYWdlJ1xuICAgIHVwZGF0ZUV4cHI6IHN0cmluZzsgLy8gZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyBiYWNrZ3JvdW5kSW1hZ2U6IC4uLiB9KScgb3IgbmVzdGVkIHVwZGF0ZVxuICB9XG4gIFxuICBjb25zdCBpbWFnZUZpZWxkczogSW1hZ2VGaWVsZEluZm9bXSA9IFtdO1xuICBcbiAgY29uc3QgY29sbGVjdEltYWdlRmllbGRzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwYXJlbnRQYXRoOiBzdHJpbmcgPSAnJywgcGFyZW50VmFsdWVQYXRoOiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgICBjb25zdCBjdXJyZW50UGF0aCA9IHBhcmVudFBhdGggPyBgJHtwYXJlbnRQYXRofS4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZVBhdGggPSBwYXJlbnRWYWx1ZVBhdGggPyBgJHtwYXJlbnRWYWx1ZVBhdGh9Py4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBjb25zdCBsYWJlbCA9IHByb3AubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuICAgICAgICBsZXQgdXBkYXRlRXhwcjogc3RyaW5nO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBhcmVudFBhdGgpIHtcbiAgICAgICAgICAvLyBOZXN0ZWQgaW1hZ2UgZmllbGQgLSBuZWVkIHRvIHNwcmVhZCBwYXJlbnQgb2JqZWN0XG4gICAgICAgICAgY29uc3QgcGFyZW50QXR0ciA9IHBhcmVudFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICBjb25zdCBwYXJlbnRDYW1lbCA9IHRvQ2FtZWxDYXNlKHBhcmVudEF0dHIpO1xuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50Q2FtZWx9OiB7IC4uLiR7cGFyZW50Q2FtZWx9LCAke2F0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0gfSlgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRvcC1sZXZlbCBpbWFnZSBmaWVsZFxuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSlgO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpbWFnZUZpZWxkcy5wdXNoKHtcbiAgICAgICAgICBsYWJlbCxcbiAgICAgICAgICBhdHRyUGF0aDogY3VycmVudFBhdGgsXG4gICAgICAgICAgdmFsdWVFeHByOiBjdXJyZW50VmFsdWVQYXRoLFxuICAgICAgICAgIHVwZGF0ZUV4cHJcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3QgcHJvcGVydGllc1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wLnByb3BlcnRpZXMsIGN1cnJlbnRQYXRoLCBjdXJyZW50VmFsdWVQYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBjb2xsZWN0SW1hZ2VGaWVsZHMocHJvcGVydGllcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBCbG9ja0NvbnRyb2xzIHdpdGggTWVkaWFSZXBsYWNlRmxvdyBmb3IgZWFjaCBpbWFnZSBmaWVsZFxuICBjb25zdCBibG9ja0NvbnRyb2xzSnN4ID0gaW1hZ2VGaWVsZHMubGVuZ3RoID4gMCA/IGBcbiAgICAgICAgPEJsb2NrQ29udHJvbHMgZ3JvdXA9XCJvdGhlclwiPlxuJHtpbWFnZUZpZWxkcy5tYXAoZmllbGQgPT4gYCAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgbWVkaWFJZD17JHtmaWVsZC52YWx1ZUV4cHJ9Py5pZH1cbiAgICAgICAgICAgIG1lZGlhVXJsPXske2ZpZWxkLnZhbHVlRXhwcn0/LnNyY31cbiAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgYWNjZXB0PVwiaW1hZ2UvKlwiXG4gICAgICAgICAgICBvblNlbGVjdD17KG1lZGlhKSA9PiAke2ZpZWxkLnVwZGF0ZUV4cHJ9fVxuICAgICAgICAgICAgbmFtZT17X18oJyR7ZmllbGQubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmApLmpvaW4oJ1xcbicpfVxuICAgICAgICA8L0Jsb2NrQ29udHJvbHM+YCA6ICcnO1xuXG4gIC8vIFNoYXJlZCBjb21wb25lbnQgaW1wb3J0cyBmb3IgZHluYW1pYyBhcnJheXMgKHNlbGVjdG9yIFVJICsgZWRpdG9yIHByZXZpZXcgbWFwcGluZylcbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0JyZWFkY3J1bWJzU2VsZWN0b3InKTtcbiAgaWYgKGhhc1RheG9ub215QXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmIChoYXNQYWdpbmF0aW9uQXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBoYXNEeW5hbWljQXJyYXlzIHx8IGhhc1RheG9ub215QXJyYXk7XG4gIGlmIChuZWVkc0RhdGFTdG9yZSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IHsgdXNlU2VsZWN0JHtoYXNCcmVhZGNydW1ic0FycmF5ID8gJywgc2VsZWN0JyA6ICcnfSB9IGZyb20gJ0B3b3JkcHJlc3MvZGF0YSc7XFxuaW1wb3J0IHsgc3RvcmUgYXMgY29yZURhdGFTdG9yZSB9IGZyb20gJ0B3b3JkcHJlc3MvY29yZS1kYXRhJztcXG5gO1xuICB9XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICAvLyBCdWlsZCBlbGVtZW50IGltcG9ydHNcbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgZWxlbWVudEltcG9ydHMucHVzaCgndXNlU3RhdGUnLCAndXNlRWZmZWN0Jyk7XG4gIH1cblxuICAvLyBJbXBvcnQgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQgd2hlbiBwcmV2aWV3IHVzZXMgbGluay9idXR0b24gaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgbGlua0ZpZWxkSW1wb3J0ID0gcHJldmlld1VzZXNMaW5rRmllbGQgPyBgaW1wb3J0IHsgSGFuZG9mZkxpbmtGaWVsZCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0xpbmtGaWVsZCc7XFxuYCA6ICcnO1xuXG4gIC8vIFNjcmVlbnNob3QgaW1wb3J0IGZvciBpbnNlcnRlciBwcmV2aWV3XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnQgPSBoYXNTY3JlZW5zaG90ID8gYGltcG9ydCBzY3JlZW5zaG90VXJsIGZyb20gJy4vc2NyZWVuc2hvdC5wbmcnO1xcbmAgOiAnJztcblxuICAvLyBTVkcgaWNvbiBmb3IgdGhlIGJsb2NrICh1bmlxdWUgcGVyIGJsb2NrLCBjb2xvcmVkIGJ5IGdyb3VwKVxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVTdmdJY29uKGNvbXBvbmVudC50aXRsZSwgY29tcG9uZW50Lmdyb3VwKTtcbiAgY29uc3Qgc3ZnSWNvbkNvZGUgPSBgY29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO2A7XG5cbiAgLy8gSW5zZXJ0ZXIgcHJldmlldzogc2hvdyBzY3JlZW5zaG90IGltYWdlIGluc3RlYWQgb2YgbGl2ZS1yZW5kZXJpbmdcbiAgY29uc3QgcHJldmlld0Vhcmx5UmV0dXJuID0gaGFzU2NyZWVuc2hvdFxuICAgID8gYCAgICBpZiAoYXR0cmlidXRlcy5fX3ByZXZpZXcpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgIDxpbWcgc3JjPXtzY3JlZW5zaG90VXJsfSBhbHQ9e21ldGFkYXRhLnRpdGxlfSBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fSAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICk7XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgcmV0dXJuIGBpbXBvcnQgeyByZWdpc3RlckJsb2NrVHlwZSB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2tzJztcbmltcG9ydCB7IFxuICAke2Jsb2NrRWRpdG9ySW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IFxuICAke2NvbXBvbmVudEltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG4ke3RlblVwSW1wb3J0fSR7c2hhcmVkQ29tcG9uZW50SW1wb3J0fWltcG9ydCBtZXRhZGF0YSBmcm9tICcuL2Jsb2NrLmpzb24nO1xuaW1wb3J0ICcuL2VkaXRvci5zY3NzJztcbiR7aGFzRHluYW1pY0FycmF5cyA/IFwiaW1wb3J0ICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9EeW5hbWljUG9zdFNlbGVjdG9yLmVkaXRvci5zY3NzJztcXG5cIiA6ICcnfWltcG9ydCAnLi9zdHlsZS5zY3NzJztcbiR7c2NyZWVuc2hvdEltcG9ydH0ke2xpbmtGaWVsZEltcG9ydH1cbiR7c3ZnSWNvbkNvZGV9XG5cbiR7ZGVwcmVjYXRpb25zQ29kZSA/IGAke2RlcHJlY2F0aW9uc0NvZGV9XFxuXFxuYCA6ICcnfXJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsXG4gIGljb246IGJsb2NrSWNvbiwke2RlcHJlY2F0aW9uc0NvZGUgPyAnXFxuICBkZXByZWNhdGVkLCcgOiAnJ31cbiAgZWRpdDogKHsgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaXNTZWxlY3RlZCB9KSA9PiB7XG4gICAgY29uc3QgYmxvY2tQcm9wcyA9IHVzZUJsb2NrUHJvcHMoKTtcbiR7cHJldmlld0Vhcmx5UmV0dXJufSR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/IFwiICAgIGNvbnN0IENPTlRFTlRfQkxPQ0tTID0gWydjb3JlL3BhcmFncmFwaCcsJ2NvcmUvaGVhZGluZycsJ2NvcmUvbGlzdCcsJ2NvcmUvbGlzdC1pdGVtJywnY29yZS9xdW90ZScsJ2NvcmUvaW1hZ2UnLCdjb3JlL3NlcGFyYXRvcicsJ2NvcmUvaHRtbCcsJ2NvcmUvYnV0dG9ucycsJ2NvcmUvYnV0dG9uJ107XCIgOiAnJ31cbiAgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZX1cbiR7YXJyYXlIZWxwZXJzfVxuICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxJbnNwZWN0b3JDb250cm9scz5cbiR7cGFuZWxzLmpvaW4oJ1xcblxcbicpfVxuICAgICAgICA8L0luc3BlY3RvckNvbnRyb2xzPlxuJHtibG9ja0NvbnRyb2xzSnN4fVxuXG4gICAgICAgIHsvKiBFZGl0b3IgUHJldmlldyAqL31cbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4ke3ByZXZpZXdDb250ZW50fVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvRnJhZ21lbnQ+XG4gICAgKTtcbiAgfSxcbiAgc2F2ZTogKCkgPT4ge1xuJHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICAvLyBJbm5lckJsb2NrcyBjb250ZW50IG11c3QgYmUgc2F2ZWQgc28gaXQgaXMgcGVyc2lzdGVkIGluIHBvc3QgY29udGVudFxcbiAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgLy8gU2VydmVyLXNpZGUgcmVuZGVyaW5nIHZpYSByZW5kZXIucGhwXFxuICAgIHJldHVybiBudWxsOyd9XG4gIH0sXG59KTtcbmA7XG59O1xuXG5leHBvcnQgeyBnZW5lcmF0ZUluZGV4SnMsIGdlbmVyYXRlU3ZnSWNvbiwgdG9UaXRsZUNhc2UsIGdlbmVyYXRlRmllbGRDb250cm9sLCBnZW5lcmF0ZUFycmF5Q29udHJvbCwgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgfTtcbmV4cG9ydCB0eXBlIHsgRmllbGRDb250ZXh0IH07XG4iXX0=