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
${indent}            src={${valueAccessor}?.src} 
${indent}            alt={${valueAccessor}?.alt || ''}
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBaTRDeUMsa0NBQVc7QUFuM0N0RDs7R0FFRztBQUNILE1BQU0sb0JBQW9CLEdBQUcsQ0FDM0IsUUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsT0FBcUIsRUFDYixFQUFFO0lBQ1YsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQzNELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXJELFFBQVEsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNaLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsSUFBSSxLQUFLLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRW5HLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxHQUFHLE1BQU07RUFDdEIsTUFBTTtFQUNOLE1BQU0sa0JBQWtCLEtBQUs7RUFDN0IsTUFBTSxjQUFjLGFBQWE7RUFDakMsTUFBTSw0QkFBNEIsZUFBZSxDQUFDLE9BQU8sQ0FBQztFQUMxRCxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU0saUNBQWlDLGFBQWE7RUFDcEQsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtF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LENBQUMsQ0FBQyxDQUFDLGtIQUFrSCxDQUFDLENBQUMsQ0FBQywrREFBK0Q7OztDQUdoTyxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBRU8sMENBQWUiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBpbmRleC5qcyBmb3IgR3V0ZW5iZXJnIGJsb2NrIGVkaXRvclxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSwgRHluYW1pY0FycmF5Q29uZmlnLCBCcmVhZGNydW1ic0FycmF5Q29uZmlnLCBUYXhvbm9teUFycmF5Q29uZmlnLCBQYWdpbmF0aW9uQXJyYXlDb25maWcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnLCBpc0JyZWFkY3J1bWJzQ29uZmlnLCBpc1RheG9ub215Q29uZmlnLCBpc1BhZ2luYXRpb25Db25maWcgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0b0Jsb2NrTmFtZSB9IGZyb20gJy4vYmxvY2stanNvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZUpzeFByZXZpZXcsIHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBUaXRsZSBDYXNlXG4gKi9cbmNvbnN0IHRvVGl0bGVDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0clxuICAgIC5zcGxpdCgnXycpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKVxuICAgIC5qb2luKCcgJyk7XG59O1xuXG4vKipcbiAqIENvbnRleHQgZm9yIGdlbmVyYXRpbmcgZmllbGQgY29udHJvbHMgLSBkZXRlcm1pbmVzIGhvdyB2YWx1ZXMgYXJlIGFjY2Vzc2VkIGFuZCB1cGRhdGVkXG4gKi9cbmludGVyZmFjZSBGaWVsZENvbnRleHQge1xuICAvKiogVGhlIHZhcmlhYmxlIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgdmFsdWUgKGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdpdGVtLmltYWdlJykgKi9cbiAgdmFsdWVBY2Nlc3Nvcjogc3RyaW5nO1xuICAvKiogVGhlIG9uQ2hhbmdlIGhhbmRsZXIgY29kZSAoZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyB4OiB2YWx1ZSB9KScgb3IgJ3VwZGF0ZUl0ZW1zKGluZGV4LCBcInhcIiwgdmFsdWUpJykgKi9cbiAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogQmFzZSBpbmRlbnRhdGlvbiAqL1xuICBpbmRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpZWxkIGNvbnRyb2wgZm9yIGFueSBwcm9wZXJ0eSB0eXBlIC0gdW5pZmllZCBmdW5jdGlvbiBmb3IgYm90aCB0b3AtbGV2ZWwgYW5kIG5lc3RlZCBmaWVsZHNcbiAqL1xuY29uc3QgZ2VuZXJhdGVGaWVsZENvbnRyb2wgPSAoXG4gIGZpZWxkS2V5OiBzdHJpbmcsXG4gIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksXG4gIGNvbnRleHQ6IEZpZWxkQ29udGV4dFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgeyB2YWx1ZUFjY2Vzc29yLCBvbkNoYW5nZUhhbmRsZXIsIGluZGVudCB9ID0gY29udGV4dDtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGZpZWxkS2V5KTtcblxuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0Jzoge1xuICAgICAgY29uc3QgaXNXaXN0aWFUZXh0RmllbGQgPSAvXFxid2lzdGlhXFxiL2kudGVzdChgJHtmaWVsZEtleX0gJHtsYWJlbH0gJHtwcm9wZXJ0eS5kZXNjcmlwdGlvbiA/PyAnJ31gKTtcblxuICAgICAgaWYgKGlzV2lzdGlhVGV4dEZpZWxkKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICB7KCgpID0+IHtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgJycpLnRyaW0oKTtcbiR7aW5kZW50fSAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgIGNvbnN0IHdpc3RpYUlkID0gbWVkaWFNYXRjaD8uWzFdIHx8IGZhbGxiYWNrTWF0Y2g/LlsxXSB8fCAnJztcbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIGlmICghd2lzdGlhSWQpIHtcbiR7aW5kZW50fSAgICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzE2cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyOiAnMXB4IGRhc2hlZCAjY2JkNWUxJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjNDc1NTY5JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZjhmYWZjJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAge19fKCdBZGQgYSBXaXN0aWEgdmlkZW8gSUQgdG8gcHJldmlldyB0aGlzIHZpZGVvLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgKTtcbiR7aW5kZW50fSAgICB9XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuJHtpbmRlbnR9ICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcbiR7aW5kZW50fSAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICBiYWNrZ3JvdW5kOiAnIzBmMTcyYScsXG4ke2luZGVudH0gICAgICAgICAgYXNwZWN0UmF0aW86ICcxNiAvIDknLFxuJHtpbmRlbnR9ICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICA8aW1nXG4ke2luZGVudH0gICAgICAgICAgc3JjPXtcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS9zd2F0Y2hcXGB9XG4ke2luZGVudH0gICAgICAgICAgYWx0PXtfXygnV2lzdGlhIHZpZGVvIHByZXZpZXcnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLCBvYmplY3RGaXQ6ICdjb3ZlcicsIGRpc3BsYXk6ICdibG9jaycgfX1cbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGluc2V0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWxpZ25JdGVtczogJ2ZsZXgtZW5kJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnc3BhY2UtYmV0d2VlbicsXG4ke2luZGVudH0gICAgICAgICAgICBnYXA6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICdsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCByZ2JhKDE1LCAyMywgNDIsIDAuMTIpIDAlLCByZ2JhKDE1LCAyMywgNDIsIDAuNykgMTAwJSknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwidHJ1ZVwiXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICB3aWR0aDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBoZWlnaHQ6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjQpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2Ryb3BGaWx0ZXI6ICdibHVyKDEwcHgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgICB3aWR0aDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBoZWlnaHQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgbWFyZ2luTGVmdDogJzRweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyVG9wOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJCb3R0b206ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckxlZnQ6ICcxNHB4IHNvbGlkICNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtaW5IZWlnaHQ6ICczMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgcGFkZGluZzogJzZweCAxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgxNSwgMjMsIDQyLCAwLjU4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRTaXplOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRXZWlnaHQ6IDYwMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbGV0dGVyU3BhY2luZzogJzAuMDJlbScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHt3aXN0aWFJZH1cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgKTtcbiR7aW5kZW50fSAgfSkoKX1cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgICAvLyBJbnNpZGUgYW4gYXJyYXkgaXRlbSwgSW5uZXJCbG9ja3MgY2FuJ3QgYmUgdXNlZCDigJQgcHJvdmlkZSBhIHRleHRhcmVhXG4gICAgICBpZiAodmFsdWVBY2Nlc3Nvci5zdGFydHNXaXRoKCdpdGVtLicpKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRhcmVhQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgcm93cz17NH1cbiR7aW5kZW50fS8+YDtcbiAgICAgIH1cbiAgICAgIC8vIFRvcC1sZXZlbCByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgY29udHJvbCBuZWVkZWRcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ251bWJlcic6IHtcbiAgICAgIGNvbnN0IGlzRGVjaW1hbCA9IC9vcGFjaXR5fGFscGhhfHJhdGlvL2kudGVzdChmaWVsZEtleSkgfHxcbiAgICAgICAgKHR5cGVvZiBwcm9wZXJ0eS5kZWZhdWx0ID09PSAnbnVtYmVyJyAmJiBwcm9wZXJ0eS5kZWZhdWx0ID4gMCAmJiBwcm9wZXJ0eS5kZWZhdWx0IDw9IDEpO1xuICAgICAgY29uc3QgcmFuZ2VNaW4gPSBpc0RlY2ltYWwgPyAwIDogMDtcbiAgICAgIGNvbnN0IHJhbmdlTWF4ID0gaXNEZWNpbWFsID8gMSA6IDEwMDtcbiAgICAgIGNvbnN0IHJhbmdlU3RlcCA9IGlzRGVjaW1hbCA/IDAuMDEgOiAxO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08UmFuZ2VDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAwfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIG1pbj17JHtyYW5nZU1pbn19XG4ke2luZGVudH0gIG1heD17JHtyYW5nZU1heH19XG4ke2luZGVudH0gIHN0ZXA9eyR7cmFuZ2VTdGVwfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfT8uc3JjfSBcbiR7aW5kZW50fSAgICAgICAgICAgIGFsdD17JHt2YWx1ZUFjY2Vzc29yfT8uYWx0IHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3sgbWF4V2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uIG9uQ2xpY2s9e29wZW59IHZhcmlhbnQ9XCJzZWNvbmRhcnlcIiBzaXplPVwic21hbGxcIj5cbiR7aW5kZW50fSAgICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjID8gX18oJ1JlcGxhY2UgJHtsYWJlbH0nLCAnaGFuZG9mZicpIDogX18oJ1NlbGVjdCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjICYmIChcbiR7aW5kZW50fSAgICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiAke29uQ2hhbmdlSGFuZGxlcigneyBzcmM6IFxcJ1xcJywgYWx0OiBcXCdcXCcgfScpfX1cbiR7aW5kZW50fSAgICAgICAgICAgIHZhcmlhbnQ9XCJsaW5rXCJcbiR7aW5kZW50fSAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge19fKCdSZW1vdmUnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICl9XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH08L01lZGlhVXBsb2FkQ2hlY2s+YDtcblxuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9e3R5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJyA/ICR7dmFsdWVBY2Nlc3Nvcn0gOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiB7XG4ke2luZGVudH0gICAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH0gICAgICAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4oJHt2YWx1ZUFjY2Vzc29yfSAmJiB0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ29iamVjdCcgPyAke3ZhbHVlQWNjZXNzb3J9IDoge30pLCBpZDogd2lzdGlhSWQsIHNyYzogd2lzdGlhSWQgPyBcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS5qc29ucFxcYCA6IG5vcm1hbGl6ZWQgfWApfVxuJHtpbmRlbnR9ICAgIH19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIHsoKCkgPT4ge1xuJHtpbmRlbnR9ICAgIGNvbnN0IHJhd1ZhbHVlID1cbiR7aW5kZW50fSAgICAgIHR5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJ1xuJHtpbmRlbnR9ICAgICAgICA/ICR7dmFsdWVBY2Nlc3Nvcn1cbiR7aW5kZW50fSAgICAgICAgOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKTtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHJhd1ZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICBpZiAoIXdpc3RpYUlkKSB7XG4ke2luZGVudH0gICAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxNnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlcjogJzFweCBkYXNoZWQgI2NiZDVlMScsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnIzQ3NTU2OScsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2Y4ZmFmYycsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIHtfXygnQWRkIGEgV2lzdGlhIHZpZGVvIElEIHRvIHByZXZpZXcgdGhpcyB2aWRlby4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICk7XG4ke2luZGVudH0gICAgfVxuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiR7aW5kZW50fSAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXG4ke2luZGVudH0gICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgYmFja2dyb3VuZDogJyMwZjE3MmEnLFxuJHtpbmRlbnR9ICAgICAgICAgIGFzcGVjdFJhdGlvOiAnMTYgLyA5JyxcbiR7aW5kZW50fSAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAgPGltZ1xuJHtpbmRlbnR9ICAgICAgICAgIHNyYz17XFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0vc3dhdGNoXFxgfVxuJHtpbmRlbnR9ICAgICAgICAgIGFsdD17X18oJ1dpc3RpYSB2aWRlbyBwcmV2aWV3JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInLCBkaXNwbGF5OiAnYmxvY2snIH19XG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4ke2luZGVudH0gICAgICAgICAgICBpbnNldDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGFsaWduSXRlbXM6ICdmbGV4LWVuZCcsXG4ke2luZGVudH0gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZ2FwOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnbGluZWFyLWdyYWRpZW50KDE4MGRlZywgcmdiYSgxNSwgMjMsIDQyLCAwLjEyKSAwJSwgcmdiYSgxNSwgMjMsIDQyLCAwLjcpIDEwMCUpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBhcmlhLWhpZGRlbj1cInRydWVcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgd2lkdGg6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgaGVpZ2h0OiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI0KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tkcm9wRmlsdGVyOiAnYmx1cigxMHB4KScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgICAgd2lkdGg6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgaGVpZ2h0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIG1hcmdpbkxlZnQ6ICc0cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlclRvcDogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJMZWZ0OiAnMTRweCBzb2xpZCAjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWluSGVpZ2h0OiAnMzJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIHBhZGRpbmc6ICc2cHggMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC41OCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250U2l6ZTogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250V2VpZ2h0OiA2MDAsXG4ke2luZGVudH0gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6ICcwLjAyZW0nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7d2lzdGlhSWR9XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICk7XG4ke2luZGVudH0gIH0pKCl9XG4ke2luZGVudH08L0ZsZXg+YDtcblxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgLy8gRm9yIGxpbmtzLCB1c2UgTGlua0NvbnRyb2wgd2hpY2ggcHJvdmlkZXMgaW50ZXJuYWwgcGFnZSBzZWFyY2ggYW5kIFVSTCB2YWxpZGF0aW9uXG4gICAgICBjb25zdCBsaW5rSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIHVybDogdmFsdWUudXJsIHx8ICcnLCBcbiAgICAgICAgbGFiZWw6IHZhbHVlLnRpdGxlIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuICAgICAgICBvcGVuc0luTmV3VGFiOiB2YWx1ZS5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4gICAgICB9YCk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnTGluayBUZXh0JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBoaWRlTGFiZWxGcm9tVmlzaW9uPXt0cnVlfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBsYWJlbDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8udXJsIHx8ICcnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtsaW5rSGFuZGxlcn19XG4ke2luZGVudH0gICAgICBzZXR0aW5ncz17W1xuJHtpbmRlbnR9ICAgICAgICB7IGlkOiAnb3BlbnNJbk5ld1RhYicsIHRpdGxlOiBfXygnT3BlbiBpbiBuZXcgdGFiJywgJ2hhbmRvZmYnKSB9XG4ke2luZGVudH0gICAgICBdfVxuJHtpbmRlbnR9ICAgICAgc2hvd1N1Z2dlc3Rpb25zPXt0cnVlfVxuJHtpbmRlbnR9ICAgICAgc3VnZ2VzdGlvbnNRdWVyeT17eyB0eXBlOiAncG9zdCcsIHN1YnR5cGU6ICdhbnknIH19XG4ke2luZGVudH0gICAgLz5cbiR7aW5kZW50fSAgPC9kaXY+XG4ke2luZGVudH08L2Rpdj5gO1xuXG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIC8vIEZvciBidXR0b25zLCBwcm92aWRlIGxhYmVsIGZpZWxkIGFuZCBocmVmIGZpZWxkIHdpdGggbGluayBwaWNrZXJcbiAgICAgIC8vIEJ1dHRvbiBwcm9wZXJ0aWVzOiBsYWJlbCwgaHJlZiwgdGFyZ2V0LCByZWwsIGRpc2FibGVkXG4gICAgICBjb25zdCBidXR0b25IYW5kbGVyID0gb25DaGFuZ2VIYW5kbGVyKGB7IFxuICAgICAgICAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBcbiAgICAgICAgaHJlZjogdmFsdWUudXJsIHx8ICcjJywgXG4gICAgICAgIHRhcmdldDogdmFsdWUub3BlbnNJbk5ld1RhYiA/ICdfYmxhbmsnIDogJycsXG4gICAgICAgIHJlbDogdmFsdWUub3BlbnNJbk5ld1RhYiA/ICdub29wZW5lciBub3JlZmVycmVyJyA6ICcnXG4gICAgICB9YCk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnQnV0dG9uIExhYmVsJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBoaWRlTGFiZWxGcm9tVmlzaW9uPXt0cnVlfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBsYWJlbDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8uaHJlZiB8fCAnIycsIFxuJHtpbmRlbnR9ICAgICAgICB0aXRsZTogJHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJycsXG4ke2luZGVudH0gICAgICAgIG9wZW5zSW5OZXdUYWI6ICR7dmFsdWVBY2Nlc3Nvcn0/LnRhcmdldCA9PT0gJ19ibGFuaydcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke2J1dHRvbkhhbmRsZXJ9fVxuJHtpbmRlbnR9ICAgICAgc2V0dGluZ3M9e1tcbiR7aW5kZW50fSAgICAgICAgeyBpZDogJ29wZW5zSW5OZXdUYWInLCB0aXRsZTogX18oJ09wZW4gaW4gbmV3IHRhYicsICdoYW5kb2ZmJykgfVxuJHtpbmRlbnR9ICAgICAgXX1cbiR7aW5kZW50fSAgICAgIHNob3dTdWdnZXN0aW9ucz17dHJ1ZX1cbiR7aW5kZW50fSAgICAgIHN1Z2dlc3Rpb25zUXVlcnk9e3sgdHlwZTogJ3Bvc3QnLCBzdWJ0eXBlOiAnYW55JyB9fVxuJHtpbmRlbnR9ICAgIC8+XG4ke2luZGVudH0gIDwvZGl2PlxuJHtpbmRlbnR9ICA8VG9nZ2xlQ29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnRGlzYWJsZWQnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0/LmRpc2FibGVkIHx8IGZhbHNlfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIGRpc2FibGVkOiB2YWx1ZSB9YCl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9PC9kaXY+YDtcblxuICAgIGNhc2UgJ3NlbGVjdCc6IHtcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKHByb3BlcnR5Lm9wdGlvbnMpLm1hcChvcHQgPT5cbiAgICAgICAgYHsgbGFiZWw6ICcke29wdC5sYWJlbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9JywgdmFsdWU6ICcke29wdC52YWx1ZX0nIH1gXG4gICAgICApLmpvaW4oJywgJyk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxTZWxlY3RDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb3B0aW9ucz17WyR7b3B0aW9uc31dfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG4gICAgfVxuXG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgLy8gSGFuZGxlIHNpbXBsZSBzdHJpbmcgYXJyYXlzIHdpdGggYSByZXBlYXRhYmxlIGxpc3QgY29udHJvbFxuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHNpbXBsZSB0eXBlIGFycmF5IChzdHJpbmcsIG51bWJlciwgZXRjLikgdnMgb2JqZWN0IGFycmF5XG4gICAgICBjb25zdCBpdGVtVHlwZSA9IHByb3BlcnR5Lml0ZW1zPy50eXBlO1xuICAgICAgaWYgKCFwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyAmJiAoaXRlbVR5cGUgPT09ICdzdHJpbmcnIHx8ICFpdGVtVHlwZSkpIHtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBsaXN0IGNvbnRyb2wgZm9yIHN0cmluZyBhcnJheXNcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtpbmRlbnR9ICAgIHsoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkubWFwKChsaXN0SXRlbSwgbGlzdEluZGV4KSA9PiAoXG4ke2luZGVudH0gICAgICA8RmxleCBrZXk9e2xpc3RJbmRleH0gZ2FwPXsyfSBhbGlnbj1cImNlbnRlclwiPlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2IHN0eWxlPXt7IGZsZXg6IDEgfX0+XG4ke2luZGVudH0gICAgICAgICAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgICAgICAgICB2YWx1ZT17bGlzdEl0ZW0gfHwgJyd9XG4ke2luZGVudH0gICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pXTtcbiR7aW5kZW50fSAgICAgICAgICAgICAgbmV3TGlzdFtsaXN0SW5kZXhdID0gdmFsdWU7XG4ke2luZGVudH0gICAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIHBsYWNlaG9sZGVyPXtfXygnRW50ZXIgaXRlbS4uLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwiYXJyb3ctdXAtYWx0MlwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdNb3ZlIHVwJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBpZiAobGlzdEluZGV4ID09PSAwKSByZXR1cm47XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKV07XG4ke2luZGVudH0gICAgICAgICAgICBbbmV3TGlzdFtsaXN0SW5kZXhdLCBuZXdMaXN0W2xpc3RJbmRleCAtIDFdXSA9IFtuZXdMaXN0W2xpc3RJbmRleCAtIDFdLCBuZXdMaXN0W2xpc3RJbmRleF1dO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBkaXNhYmxlZD17bGlzdEluZGV4ID09PSAwfVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwiYXJyb3ctZG93bi1hbHQyXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ01vdmUgZG93bicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbGlzdCA9ICR7dmFsdWVBY2Nlc3Nvcn0gfHwgW107XG4ke2luZGVudH0gICAgICAgICAgICBpZiAobGlzdEluZGV4ID49IGxpc3QubGVuZ3RoIC0gMSkgcmV0dXJuO1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi5saXN0XTtcbiR7aW5kZW50fSAgICAgICAgICAgIFtuZXdMaXN0W2xpc3RJbmRleF0sIG5ld0xpc3RbbGlzdEluZGV4ICsgMV1dID0gW25ld0xpc3RbbGlzdEluZGV4ICsgMV0sIG5ld0xpc3RbbGlzdEluZGV4XV07XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGRpc2FibGVkPXtsaXN0SW5kZXggPj0gKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLmxlbmd0aCAtIDF9XG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJ0cmFzaFwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSAoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkuZmlsdGVyKChfLCBpKSA9PiBpICE9PSBsaXN0SW5kZXgpO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICApKX1cbiR7aW5kZW50fSAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLCAnJ107XG4ke2luZGVudH0gICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIHZhcmlhbnQ9XCJ0ZXJ0aWFyeVwiXG4ke2luZGVudH0gICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgID5cbiR7aW5kZW50fSAgICAgIHtfXygnQWRkIEl0ZW0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICA8L0ZsZXg+XG4ke2luZGVudH08L2Rpdj5gO1xuICAgICAgfVxuICAgICAgLy8gRm9yIG9iamVjdCBhcnJheXMsIGZhbGwgdGhyb3VnaCB0byBkZWZhdWx0ICh0aGVzZSBzaG91bGQgYmUgaGFuZGxlZCBieSBnZW5lcmF0ZUFycmF5Q29udHJvbCBhdCB0b3AgbGV2ZWwpXG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKHByb3BlcnR5LnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkQ29udHJvbHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0eS5wcm9wZXJ0aWVzKVxuICAgICAgICAgIC5tYXAoKFtuZXN0ZWRLZXksIG5lc3RlZFByb3BdKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXN0ZWRDb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IGAke3ZhbHVlQWNjZXNzb3J9Py4ke25lc3RlZEtleX1gLFxuICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWwpID0+IG9uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCAke25lc3RlZEtleX06ICR7dmFsfSB9YCksXG4gICAgICAgICAgICAgIGluZGVudDogaW5kZW50ICsgJyAgJ1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChuZXN0ZWRLZXksIG5lc3RlZFByb3AsIG5lc3RlZENvbnRleHQpO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke25lc3RlZENvbnRyb2xzfVxuJHtpbmRlbnR9PC9GbGV4PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGAke2luZGVudH08VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYXJyYXkgKHJlcGVhdGVyKSBjb250cm9sIHVzaW5nIDEwdXAgUmVwZWF0ZXIgY29tcG9uZW50XG4gKiBQcm92aWRlcyBkcmFnLWFuZC1kcm9wIHJlb3JkZXJpbmcgYW5kIGJ1aWx0LWluIGFkZC9yZW1vdmUgZnVuY3Rpb25hbGl0eVxuICovXG5jb25zdCBnZW5lcmF0ZUFycmF5Q29udHJvbCA9IChrZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSwgYXR0ck5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZywgaW5kZW50OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcblxuICAvLyBHZW5lcmF0ZSBmaWVsZCBjb250cm9scyB0aGF0IHVzZSBzZXRJdGVtIGZyb20gdGhlIFJlcGVhdGVyIHJlbmRlciBwcm9wXG4gIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgY29uc3QgZmllbGRDb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZSkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx1ZX0gfSlgLFxuICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAgICAgJ1xuICAgIH07XG4gICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGZpZWxkQ29udGV4dCk7XG4gIH0pLmpvaW4oJ1xcbicpO1xuXG4gIC8vIEdldCBhIGRpc3BsYXkgdGl0bGUgZnJvbSB0aGUgZmlyc3QgdGV4dCBmaWVsZCBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIGZpZWxkIGxhYmVsXG4gIGNvbnN0IGZpcnN0VGV4dEZpZWxkID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5maW5kKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAndGV4dCcpO1xuICBjb25zdCB0aXRsZUFjY2Vzc29yID0gZmlyc3RUZXh0RmllbGQgPyBgaXRlbS4ke2ZpcnN0VGV4dEZpZWxkWzBdfSB8fCBgIDogJyc7XG4gIFxuICAvLyBDdXN0b20gYWRkIGJ1dHRvbiB3aXRoIHRlcnRpYXJ5IHN0eWxpbmcsIHBsdXMgaWNvbiwgcmlnaHQgYWxpZ25lZFxuICAvLyBhZGRCdXR0b24gaXMgYSBmdW5jdGlvbiB0aGF0IHJlY2VpdmVzIGFkZEl0ZW0gYW5kIHJldHVybnMgYSBSZWFjdCBlbGVtZW50XG4gIGNvbnN0IGFkZEJ1dHRvbkpzeCA9IGAoYWRkSXRlbSkgPT4gKFxuJHtpbmRlbnR9ICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvbi13cmFwcGVyXCI+XG4ke2luZGVudH0gICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgIHZhcmlhbnQ9XCJ0ZXJ0aWFyeVwiXG4ke2luZGVudH0gICAgICAgIG9uQ2xpY2s9e2FkZEl0ZW19XG4ke2luZGVudH0gICAgICAgIGljb249e1xuJHtpbmRlbnR9ICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+XG4ke2luZGVudH0gICAgICAgICAgICA8cGF0aCBkPVwiTTExIDEyLjVWMTcuNUgxMi41VjEyLjVIMTcuNVYxMUgxMi41VjZIMTFWMTFINlYxMi41SDExWlwiLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3N2Zz5cbiR7aW5kZW50fSAgICAgICAgfVxuJHtpbmRlbnR9ICAgICAgICBjbGFzc05hbWU9XCJyZXBlYXRlci1hZGQtYnV0dG9uXCJcbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAge19fKCdBZGQgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgPC9kaXY+XG4ke2luZGVudH0gIClgO1xuXG4gIHJldHVybiBgJHtpbmRlbnR9PFJlcGVhdGVyIFxuJHtpbmRlbnR9ICBhdHRyaWJ1dGU9XCIke2F0dHJOYW1lfVwiIFxuJHtpbmRlbnR9ICBhbGxvd1Jlb3JkZXJpbmc9e3RydWV9IFxuJHtpbmRlbnR9ICBkZWZhdWx0VmFsdWU9e3t9fVxuJHtpbmRlbnR9ICBhZGRCdXR0b249eyR7YWRkQnV0dG9uSnN4fX1cbiR7aW5kZW50fT5cbiR7aW5kZW50fSAgeyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuJHtpbmRlbnR9ICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbVwiPlxuJHtpbmRlbnR9ICAgICAgPGRldGFpbHMgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fY29sbGFwc2VcIj5cbiR7aW5kZW50fSAgICAgICAgPHN1bW1hcnkgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9faGVhZGVyXCI+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fdGl0bGVcIj57JHt0aXRsZUFjY2Vzc29yfScke2xhYmVsfSd9PC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2FjdGlvbnNcIiBvbkNsaWNrPXsoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKX0+XG4ke2luZGVudH0gICAgICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgICAgIG9uQ2xpY2s9e3JlbW92ZUl0ZW19XG4ke2luZGVudH0gICAgICAgICAgICAgIGljb249e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgICA8cGF0aCBkPVwiTTUgNi41VjE4YTIgMiAwIDAwMiAyaDEwYTIgMiAwIDAwMi0yVjYuNWgtMi41VjE4YS41LjUgMCAwMS0uNS41SDhhLjUuNSAwIDAxLS41LS41VjYuNUg1ek05IDl2OGgxLjVWOUg5em00LjUgMHY4SDE1VjloLTEuNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgICA8cGF0aCBkPVwiTTIwIDVoLTVWMy41QTEuNSAxLjUgMCAwMDEzLjUgMmgtM0ExLjUgMS41IDAgMDA5IDMuNVY1SDR2MS41aDE2VjV6bS02LjUgMGgtM1YzLjVoM1Y1elwiLz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8L3N2Zz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBsYWJlbD17X18oJ1JlbW92ZSBpdGVtJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvc3VtbWFyeT5cbiR7aW5kZW50fSAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19maWVsZHNcIj5cbiR7aW5kZW50fSAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtpdGVtRmllbGRzfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICA8L2RldGFpbHM+XG4ke2luZGVudH0gICAgPC9kaXY+XG4ke2luZGVudH0gICl9XG4ke2luZGVudH08L1JlcGVhdGVyPmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHRoZSBpbnNwZWN0b3IgY29udHJvbCBmb3IgYSB0b3AtbGV2ZWwgcHJvcGVydHlcbiAqIFVzZXMgZ2VuZXJhdGVGaWVsZENvbnRyb2wgd2l0aCBhIHNldEF0dHJpYnV0ZXMgY29udGV4dFxuICovXG5jb25zdCBnZW5lcmF0ZVByb3BlcnR5Q29udHJvbCA9IChrZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSwgaW5kZW50OiBzdHJpbmcgPSAnICAgICAgICAgICcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuXG4gIC8vIEZvciBhcnJheSB0eXBlLCB1c2UgdGhlIHNwZWNpYWxpemVkIGFycmF5IGNvbnRyb2xcbiAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICByZXR1cm4gZ2VuZXJhdGVBcnJheUNvbnRyb2woa2V5LCBwcm9wZXJ0eSwgYXR0ck5hbWUsIGxhYmVsLCBpbmRlbnQpO1xuICB9XG5cbiAgLy8gRm9yIGFsbCBvdGhlciB0eXBlcywgdXNlIHRoZSB1bmlmaWVkIGZpZWxkIGNvbnRyb2wgZ2VuZXJhdG9yXG4gIGNvbnN0IGNvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICB2YWx1ZUFjY2Vzc29yOiBhdHRyTmFtZSxcbiAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZSkgPT4gYHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogJHt2YWx1ZX0gfSlgLFxuICAgIGluZGVudFxuICB9O1xuXG4gIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChrZXksIHByb3BlcnR5LCBjb250ZXh0KTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZGVmYXVsdCB2YWx1ZSBmb3IgYSBwcm9wZXJ0eSB0eXBlXG4gKi9cbmNvbnN0IGdldERlZmF1bHRWYWx1ZSA9IChmaWVsZFByb3A6IEhhbmRvZmZQcm9wZXJ0eSk6IGFueSA9PiB7XG4gIHN3aXRjaCAoZmllbGRQcm9wLnR5cGUpIHtcbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIHJldHVybiB7IGxhYmVsOiAnJywgdXJsOiAnJywgb3BlbnNJbk5ld1RhYjogZmFsc2UgfTtcbiAgICBjYXNlICdidXR0b24nOlxuICAgICAgcmV0dXJuIHsgbGFiZWw6ICcnLCBocmVmOiAnIycsIHRhcmdldDogJycsIHJlbDogJycsIGRpc2FibGVkOiBmYWxzZSB9O1xuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIHJldHVybiB7IHNyYzogJycsIGFsdDogJycgfTtcbiAgICBjYXNlICd2aWRlbyc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBpZDogJycsIHBvc3RlcjogJycsIHR5cGU6ICcnLCB3aWR0aDogMCwgaGVpZ2h0OiAwLCBtaW1lOiAnJywgbWltZVR5cGU6ICcnIH07XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChmaWVsZFByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZFByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgICBuZXN0ZWRbbmVzdGVkS2V5XSA9IGdldERlZmF1bHRWYWx1ZShuZXN0ZWRQcm9wKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVzdGVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHt9O1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gMDtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gW107XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBoZWxwZXIgZnVuY3Rpb25zIGZvciBhcnJheSBwcm9wZXJ0aWVzXG4gKiBOb3RlOiBXaXRoIHRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCwgd2Ugbm8gbG9uZ2VyIG5lZWQgY3VzdG9tIGFkZC91cGRhdGUvcmVtb3ZlL21vdmUgZnVuY3Rpb25zXG4gKiBUaGUgUmVwZWF0ZXIgaGFuZGxlcyBhbGwgb2YgdGhpcyBpbnRlcm5hbGx5IHZpYSBpdHMgcmVuZGVyIHByb3BcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IHN0cmluZyA9PiB7XG4gIC8vIFRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCBoYW5kbGVzIGFycmF5IG1hbmlwdWxhdGlvbiBpbnRlcm5hbGx5XG4gIC8vIE5vIGN1c3RvbSBoZWxwZXIgZnVuY3Rpb25zIGFyZSBuZWVkZWRcbiAgcmV0dXJuICcnO1xufTtcblxuXG4vKipcbiAqIERldGVybWluaXN0aWMgaGFzaCBvZiBhIHN0cmluZyB0byBhIG51bWJlciBpbiBbMCwgbWF4KS5cbiAqL1xuY29uc3QgaGFzaFN0cmluZyA9IChzdHI6IHN0cmluZywgbWF4OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICBsZXQgaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaCA9ICgoaCA8PCA1KSAtIGggKyBzdHIuY2hhckNvZGVBdChpKSkgfCAwO1xuICB9XG4gIHJldHVybiAoKGggJSBtYXgpICsgbWF4KSAlIG1heDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYW4gU1ZHIGljb24gZWxlbWVudCBzdHJpbmcgZm9yIHVzZSBpbiByZWdpc3RlckJsb2NrVHlwZS5cbiAqIENyZWF0ZXMgYSBjb2xvcmVkIHJvdW5kZWQgcmVjdGFuZ2xlIHdpdGggMS0yIGxldHRlciBpbml0aWFscyBkZXJpdmVkXG4gKiBmcm9tIHRoZSBibG9jayB0aXRsZSwgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvciBrZXllZCB0byB0aGUgZ3JvdXAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlU3ZnSWNvbiA9ICh0aXRsZTogc3RyaW5nLCBncm91cDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgR1JPVVBfQ09MT1JTID0gW1xuICAgICcjNUIyMUI2JywgJyMwRTc0OTAnLCAnI0I0NTMwOScsICcjMDQ3ODU3JyxcbiAgICAnI0JFMTIzQycsICcjNDMzOENBJywgJyMwMzY5QTEnLCAnI0ExNjIwNycsXG4gICAgJyMxNTgwM0QnLCAnIzkzMzNFQScsICcjQzI0MTBDJywgJyMxRDRFRDgnLFxuICAgICcjMDU5NjY5JywgJyM3QzNBRUQnLCAnI0RDMjYyNicsICcjMjU2M0VCJyxcbiAgXTtcblxuICBjb25zdCB3b3JkcyA9IHRpdGxlLnNwbGl0KC9bXFxzXy1dKy8pLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3QgaW5pdGlhbHMgPSB3b3Jkcy5sZW5ndGggPj0gMlxuICAgID8gKHdvcmRzWzBdWzBdICsgd29yZHNbMV1bMF0pLnRvVXBwZXJDYXNlKClcbiAgICA6ICh3b3Jkc1swXT8uc3Vic3RyaW5nKDAsIDIpIHx8ICdITycpLnRvVXBwZXJDYXNlKCk7XG5cbiAgY29uc3QgY29sb3IgPSBHUk9VUF9DT0xPUlNbaGFzaFN0cmluZyhncm91cCB8fCB0aXRsZSwgR1JPVVBfQ09MT1JTLmxlbmd0aCldO1xuXG4gIHJldHVybiBgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPlxuICAgICAgPHJlY3QgeD1cIjJcIiB5PVwiMlwiIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHJ4PVwiNFwiIGZpbGw9XCIke2NvbG9yfVwiIC8+XG4gICAgICA8dGV4dCB4PVwiMTJcIiB5PVwiMTYuNVwiIHRleHRBbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwid2hpdGVcIiBmb250U2l6ZT1cIjEwXCIgZm9udEZhbWlseT1cIi1hcHBsZS1zeXN0ZW0sQmxpbmtNYWNTeXN0ZW1Gb250LHNhbnMtc2VyaWZcIiBmb250V2VpZ2h0PVwiNjAwXCI+JHtpbml0aWFsc308L3RleHQ+XG4gICAgPC9zdmc+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgY29tcGxldGUgaW5kZXguanMgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICogQHBhcmFtIGlubmVyQmxvY2tzRmllbGQgLSBUaGUgcmljaHRleHQgZmllbGQgdGhhdCB1c2VzIElubmVyQmxvY2tzLCBvciBudWxsIGlmIG5vbmVcbiAqIEBwYXJhbSBkZXByZWNhdGlvbnNDb2RlIC0gT3B0aW9uYWwgZGVwcmVjYXRpb24gbWlncmF0aW9uIGNvZGVcbiAqIEBwYXJhbSBoYXNTY3JlZW5zaG90IC0gV2hldGhlciBhIHNjcmVlbnNob3QucG5nIGlzIGF2YWlsYWJsZSBmb3IgaW5zZXJ0ZXIgcHJldmlld1xuICovXG5jb25zdCBnZW5lcmF0ZUluZGV4SnMgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgZHluYW1pY0FycmF5Q29uZmlncz86IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPixcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGwsXG4gIGRlcHJlY2F0aW9uc0NvZGU/OiBzdHJpbmcsXG4gIGhhc1NjcmVlbnNob3Q/OiBib29sZWFuXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSB0b0Jsb2NrTmFtZShjb21wb25lbnQuaWQpO1xuICBjb25zdCBwcm9wZXJ0aWVzID0gY29tcG9uZW50LnByb3BlcnRpZXM7XG5cbiAgLy8gaGFzRHluYW1pY0FycmF5cyBpcyB0cnVlIG9ubHkgd2hlbiB0aGVyZSBhcmUgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZmllbGRzIOKAlFxuICAvLyB0aGUgc2ltcGxlciB0eXBlcyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgZG9uJ3QgbmVlZCBEeW5hbWljUG9zdFNlbGVjdG9yLlxuICBjb25zdCBoYXNEeW5hbWljQXJyYXlzID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKFxuICAgICAgICAoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKVxuICAgICAgKVxuICAgIDogZmFsc2U7XG5cbiAgLy8gSGVscGVyIHRvIGNoZWNrIGZvciBhIHR5cGUgaW4gcHJvcGVydGllcywgaW5jbHVkaW5nIG5lc3RlZCBpbiBhcnJheXMvb2JqZWN0c1xuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAodHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2tQcm9wZXJ0eSA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09IHR5cGUpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AucHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgICAgIH1cbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICB9O1xuXG4gIC8vIFRoZSBpbm5lckJsb2Nrc0ZpZWxkIHVzZXMgSW5uZXJCbG9ja3MgKGNvbnRlbnQgc3RvcmVkIGluIHBvc3RfY29udGVudCwgbm90IGFuIGF0dHJpYnV0ZSkuXG4gIC8vIEFsbCBvdGhlciByaWNodGV4dCBmaWVsZHMgYmVjb21lIHN0cmluZyBhdHRyaWJ1dGVzIHdpdGggUmljaFRleHQgZWRpdGluZy5cbiAgY29uc3QgdXNlSW5uZXJCbG9ja3MgPSAhIWlubmVyQmxvY2tzRmllbGQ7XG5cbiAgLy8gR2V0IGFsbCBhdHRyaWJ1dGUgbmFtZXMg4oCTIGV4Y2x1ZGUgaW5uZXJCbG9ja3NGaWVsZCBhbmQgcGFnaW5hdGlvblxuICBjb25zdCBhdHRyTmFtZXMgPSBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoayA9PiBrICE9PSBpbm5lckJsb2Nrc0ZpZWxkICYmIHByb3BlcnRpZXNba10udHlwZSAhPT0gJ3BhZ2luYXRpb24nKVxuICAgIC5tYXAodG9DYW1lbENhc2UpO1xuXG4gIC8vIEluY2x1ZGUgYW55IGF0dHJpYnV0ZSBuYW1lcyByZWZlcmVuY2VkIGluIHRoZSB0ZW1wbGF0ZSBidXQgbWlzc2luZyBmcm9tIEFQSSBwcm9wZXJ0aWVzXG4gIC8vIChlLmcuIGJvZHkgLT4gYmxvY2tCb2R5IHNvIEpTWCBoYXMgYSBkZWZpbmVkIHZhcmlhYmxlIGFuZCBubyBSZWZlcmVuY2VFcnJvcikuXG4gIC8vIFNraXAgdGhlIGlubmVyQmxvY2tzRmllbGQg4oCUIGl0cyBjb250ZW50IGlzIHN0b3JlZCB2aWEgSW5uZXJCbG9ja3MsIG5vdCBhcyBhbiBhdHRyaWJ1dGUuXG4gIGNvbnN0IGlubmVyQmxvY2tzQXR0ck5hbWUgPSBpbm5lckJsb2Nrc0ZpZWxkID8gdG9DYW1lbENhc2UoaW5uZXJCbG9ja3NGaWVsZCkgOiBudWxsO1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgZ2V0VGVtcGxhdGVSZWZlcmVuY2VkQXR0cmlidXRlTmFtZXMoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgaWYgKCFhdHRyTmFtZXMuaW5jbHVkZXMobmFtZSkgJiYgbmFtZSAhPT0gaW5uZXJCbG9ja3NBdHRyTmFtZSkgYXR0ck5hbWVzLnB1c2gobmFtZSk7XG4gIH1cbiAgXG4gIC8vIEFkZCBkeW5hbWljIGFycmF5IGF0dHJpYnV0ZSBuYW1lcyBiYXNlZCBvbiBjb25maWcgdHlwZVxuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVRheG9ub215YCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBvc3RUeXBlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UXVlcnlBcmdzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVJlbmRlck1vZGVgKTtcbiAgICAgICAgaWYgKChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uKSB7XG4gICAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWRgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIERldGVybWluZSB3aGljaCBjb21wb25lbnRzIHdlIG5lZWQgdG8gaW1wb3J0XG4gIGNvbnN0IG5lZWRzTWVkaWFVcGxvYWQgPSBoYXNQcm9wZXJ0eVR5cGUoJ2ltYWdlJyk7XG4gIGNvbnN0IG5lZWRzUmFuZ2VDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdudW1iZXInKTtcbiAgY29uc3QgbmVlZHNUb2dnbGVDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcbiAgY29uc3QgbmVlZHNTZWxlY3RDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdzZWxlY3QnKTtcbiAgY29uc3QgaGFzQXJyYXlQcm9wcyA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+IHAudHlwZSA9PT0gJ2FycmF5Jyk7XG4gIGNvbnN0IGhhc09iamVjdFByb3BzID0gaGFzUHJvcGVydHlUeXBlKCdvYmplY3QnKTtcblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICB9XG4gIC8vIElubmVyQmxvY2tzIGZvciB0aGUgZGVzaWduYXRlZCByaWNodGV4dCBjb250ZW50IGFyZWFcbiAgaWYgKHVzZUlubmVyQmxvY2tzKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cbiAgLy8gTGlua0NvbnRyb2wgZm9yIGxpbmsvYnV0dG9uIGZpZWxkcyAod2hlbiBub3QgdXNpbmcgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQpXG4gIGNvbnN0IG5lZWRzTGlua0NvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuXG4gIGNvbnN0IGhhc0JyZWFkY3J1bWJzQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzVGF4b25vbXlBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNUYXhvbm9teUNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICAvLyBUb2dnbGVDb250cm9sOiBvbmx5IGZvciBib29sZWFuL2J1dHRvbiBwcm9wZXJ0eSBmaWVsZHMg4oCUIHNwZWNpYWwgYXJyYXkgdHlwZXMgdXNlIHNoYXJlZCBjb21wb25lbnRzXG4gIGlmIChuZWVkc1RvZ2dsZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVG9nZ2xlQ29udHJvbCcpO1xuICAvLyBTZWxlY3RDb250cm9sOiBvbmx5IGZvciBzZWxlY3QgcHJvcGVydHkgZmllbGRzIG9yIER5bmFtaWNQb3N0U2VsZWN0b3IgKHBvc3RzKSDigJQgdGF4b25vbXkgaGFuZGxlZCBieSBUYXhvbm9teVNlbGVjdG9yXG4gIGlmIChuZWVkc1NlbGVjdENvbnRyb2wgfHwgaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTZWxlY3RDb250cm9sJyk7XG4gIC8vIFNwaW5uZXIgZm9yIGR5bmFtaWMgYXJyYXkgbG9hZGluZyBzdGF0ZSBpbiBlZGl0b3IgcHJldmlld1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTcGlubmVyJyk7XG4gIC8vIFRleHRhcmVhQ29udHJvbDogbmVlZGVkIHdoZW4gcmljaHRleHQgZmllbGRzIGFwcGVhciBpbnNpZGUgYXJyYXkgaXRlbXNcbiAgY29uc3QgaGFzUmljaHRleHRJbkFycmF5ID0gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKHAgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgcC5pdGVtcz8ucHJvcGVydGllcyAmJlxuICAgIE9iamVjdC52YWx1ZXMocC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGlwID0+IGlwLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICk7XG4gIGlmIChoYXNSaWNodGV4dEluQXJyYXkpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVGV4dGFyZWFDb250cm9sJyk7XG5cbiAgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdGbGV4Jyk7XG5cbiAgLy8gMTB1cCBibG9jay1jb21wb25lbnRzIGltcG9ydHNcbiAgLy8gUmVwZWF0ZXIgaXMgb25seSBuZWVkZWQgd2hlbiB0aGVyZSBhcmUgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHMgaW4gdGhlIHNpZGViYXJcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJyYXlzIHVzZSBzaGFyZWQgY29tcG9uZW50cyB0aGF0IGltcG9ydCBSZXBlYXRlciB0aGVtc2VsdmVzKVxuICBjb25zdCBoYXNOb25TcGVjaWFsQXJyYXlQcm9wcyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgKCFkeW5hbWljQXJyYXlDb25maWdzPy5ba10gfHwgISgnYXJyYXlUeXBlJyBpbiBkeW5hbWljQXJyYXlDb25maWdzW2tdKSlcbiAgKTtcbiAgY29uc3QgdGVuVXBJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMpIHtcbiAgICB0ZW5VcEltcG9ydHMucHVzaCgnUmVwZWF0ZXInKTtcbiAgfVxuXG4gIC8vIEdlbmVyYXRlIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnMocHJvcGVydGllcyk7XG5cbiAgLy8gR2VuZXJhdGUgSlNYIHByZXZpZXcgZnJvbSBoYW5kbGViYXJzIHRlbXBsYXRlXG4gIC8vIFRoaXMgbXVzdCBoYXBwZW4gYmVmb3JlIHBhbmVsIGdlbmVyYXRpb24gc28gd2Uga25vdyB3aGljaCBmaWVsZHMgaGF2ZSBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBwcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgIGNvbXBvbmVudC5jb2RlLFxuICAgIHByb3BlcnRpZXMsXG4gICAgY29tcG9uZW50LmlkLFxuICAgIGNvbXBvbmVudC50aXRsZSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkXG4gICk7XG4gIGxldCBwcmV2aWV3SnN4ID0gcHJldmlld1Jlc3VsdC5qc3g7XG4gIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gcHJldmlld1Jlc3VsdC5pbmxpbmVFZGl0YWJsZUZpZWxkcztcblxuICAvLyBEZXRlY3QgaWYgcHJldmlldyB1c2VzIEhhbmRvZmZMaW5rRmllbGQgKGxpbmsvYnV0dG9uIGlubGluZSBlZGl0aW5nKVxuICBjb25zdCBwcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxIYW5kb2ZmTGlua0ZpZWxkJyk7XG5cbiAgLy8gR2VuZXJhdGUgcGFuZWwgYm9kaWVzIGZvciBlYWNoIHByb3BlcnR5XG4gIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIHJpY2h0ZXh0IHVzZXMgSW5uZXJCbG9ja3Mgb24gdGhlIGNhbnZhcyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICAvLyBwYWdpbmF0aW9uIGlzIGF1dG8tZ2VuZXJhdGVkIGZyb20gcXVlcnkgcmVzdWx0cyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyB8fCBwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgaW5saW5lLWVkaXRhYmxlIG9uIHRoZSBjYW52YXMgKHRleHQsIGltYWdlLCBsaW5rLCBidXR0b25cbiAgICAvLyB3cmFwcGVkIGluIHt7I2ZpZWxkfX0pIOKAkyB0aGV5IGRvbid0IG5lZWQgc2lkZWJhciBjb250cm9scy5cbiAgICAvLyBBcnJheSBmaWVsZHMgYXJlIGFsd2F5cyBrZXB0OiB0aGV5IG5lZWQgc2lkZWJhciBVSSBmb3IgbWFudWFsL2R5bmFtaWMgdG9nZ2xlXG4gICAgLy8gYW5kIGZvciBhZGRpbmcvcmVtb3ZpbmcgaXRlbXMsIGV2ZW4gd2hlbiB0aGVpciBjaGlsZCBmaWVsZHMgYXJlIGlubGluZS1lZGl0YWJsZS5cbiAgICBpZiAoaW5saW5lRWRpdGFibGVGaWVsZHMuaGFzKGtleSkgJiYgcHJvcGVydHkudHlwZSAhPT0gJ2FycmF5JykgY29udGludWU7XG5cbiAgICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZHluYW1pY0NvbmZpZyA9IGR5bmFtaWNBcnJheUNvbmZpZ3M/LltrZXldO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBkeW5hbWljIGFycmF5IGZpZWxkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gQnJlYWRjcnVtYnM6IHNoYXJlZCBjb21wb25lbnQgd2l0aCBzaW5nbGUgdmlzaWJpbGl0eSB0b2dnbGVcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBCcmVhZGNydW1icyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIFRheG9ub215OiBzaGFyZWQgY29tcG9uZW50IHdpdGggQXV0byAvIE1hbnVhbCB0YWJzXG4gICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRUYXhvbm9teSA9IGR5bmFtaWNDb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgID8gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbH0gfSlgLFxuICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAnLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgIH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG4nKVxuICAgICAgICAgIDogYCAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdVUkwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS51cmwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIHVybDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5gO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFRheG9ub215ICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgdGF4b25vbXlPcHRpb25zPXske0pTT04uc3RyaW5naWZ5KHRheG9ub215T3B0aW9ucyl9fVxuICAgICAgICAgICAgICBkZWZhdWx0VGF4b25vbXk9XCIke2RlZmF1bHRUYXhvbm9teX1cIlxuICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICByZW5kZXJNYW51YWxJdGVtcz17KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4gICAgICAgICAgICAgICAgPD5cbiR7aXRlbUZpZWxkc31cbiAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBQYWdpbmF0aW9uOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gUGFnaW5hdGlvbiAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFBhZ2luYXRpb25TZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQb3N0cyAoRHluYW1pY0FycmF5Q29uZmlnKTogZnVsbCBEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgIGNvbnN0IGRlZmF1bHRNb2RlID0gZHluYW1pY0NvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAnbWFudWFsJyA/ICdzZWxlY3QnIDogJ3F1ZXJ5JztcbiAgICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0NvbmZpZyA9IGR5bmFtaWNDb25maWcuaXRlbU92ZXJyaWRlc0NvbmZpZyB8fCB7fTtcbiAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBpdGVtT3ZlcnJpZGVzQ29uZmlnIChsZWdhY3kpXG4gICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICBpZiAoYy5tb2RlID09PSAndWknKSB7XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZSwgbGFiZWw6IGMubGFiZWwsIHR5cGU6ICdzZWxlY3QnLCBvcHRpb25zOiBub3JtYWxpemVTZWxlY3RPcHRpb25zKGMub3B0aW9ucyksIGRlZmF1bHQ6IGMuZGVmYXVsdCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBmaWVsZE1hcHBpbmcgd2l0aCB0eXBlOiBcIm1hbnVhbFwiIOKAlCBkZXJpdmUgY29udHJvbCB0eXBlIGZyb20gaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBmaWVsZE1hcHBpbmcgPSBkeW5hbWljQ29uZmlnLmZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbZmllbGRQYXRoLCBtYXBwaW5nVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwcGluZykpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgY29uc3QgdG9wS2V5ID0gZmllbGRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1t0b3BLZXldO1xuICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICBsZXQgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICBsZXQgb3B0aW9uczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgaWYgKGl0ZW1Qcm9wKSB7XG4gICAgICAgICAgICAgIHN3aXRjaCAoaXRlbVByb3AudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdzZWxlY3QnO1xuICAgICAgICAgICAgICAgICAgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoaXRlbVByb3Aub3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3RvZ2dsZSc7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gMDtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZTogZmllbGRQYXRoLCBsYWJlbDogZmllbGRMYWJlbCwgdHlwZTogY29udHJvbFR5cGUsIG9wdGlvbnMsIGRlZmF1bHQ6IGRlZmF1bHRWYWwgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhZ2luYXRpb25Ub2dnbGUgPSBkeW5hbWljQ29uZmlnLnBhZ2luYXRpb25cbiAgICAgICAgICA/IGBcbiAgICAgICAgICAgICAgICA8VG9nZ2xlQ29udHJvbFxuICAgICAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93IFBhZ2luYXRpb24nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgY2hlY2tlZD17JHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZCA/PyB0cnVlfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQ6IHZhbHVlIH0pfVxuICAgICAgICAgICAgICAgIC8+YFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gRHluYW1pYyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgdmFsdWU9e3tcbiAgICAgICAgICAgICAgICBzb3VyY2U6ICR7YXR0ck5hbWV9U291cmNlIHx8ICcke2RlZmF1bHRNb2RlfScsXG4gICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7YXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgcXVlcnlBcmdzOiAke2F0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZFBvc3RzOiAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsobmV4dFZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVBvc3RUeXBlOiBuZXh0VmFsdWUucG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1RdWVyeUFyZ3M6IHsgLi4ubmV4dFZhbHVlLnF1ZXJ5QXJncywgcG9zdF90eXBlOiBuZXh0VmFsdWUucG9zdFR5cGUgfSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlczogbmV4dFZhbHVlLml0ZW1PdmVycmlkZXMgPz8ge31cbiAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICBwb3N0VHlwZXM6ICR7SlNPTi5zdHJpbmdpZnkoZHluYW1pY0NvbmZpZy5wb3N0VHlwZXMpfSxcbiAgICAgICAgICAgICAgICBtYXhJdGVtczogJHtkeW5hbWljQ29uZmlnLm1heEl0ZW1zID8/IDIwfSxcbiAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgc2hvd0RhdGVGaWx0ZXI6ICR7KGR5bmFtaWNDb25maWcgYXMgYW55KS5zaG93RGF0ZUZpbHRlciA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZSd9LFxuICAgICAgICAgICAgICAgIHNob3dFeGNsdWRlQ3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPiR7cGFnaW5hdGlvblRvZ2dsZX1cbiAgICAgICAgICAgIHske2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcgJiYgKFxuICAgICAgICAgICAgICA8PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTdGFuZGFyZCBwYW5lbCAobm9uLWR5bmFtaWMpXG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG4gIH1cblxuICAvLyBBZGQgSGFuZG9mZiBkZXNpZ24gc3lzdGVtIGxpbmtzIHBhbmVsXG4gIGNvbnN0IGRlc2lnblN5c3RlbVBhbmVsID0gW1xuICAgICcgICAgICAgICAgey8qIERlc2lnbiBTeXN0ZW0gTGlua3MgKi99JyxcbiAgICAnICAgICAgICAgIHsobWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsIHx8IG1ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwpICYmICgnLFxuICAgICcgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXyhcXCdEZXNpZ24gU3lzdGVtXFwnLCBcXCdoYW5kb2ZmXFwnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT4nLFxuICAgICcgICAgICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+JyxcbiAgICAnICAgICAgICAgICAgICAgIHttZXRhZGF0YS5fX2hhbmRvZmY/LmhhbmRvZmZVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmhhbmRvZmZVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdWaWV3IGluIEhhbmRvZmZcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5maWdtYVVybCAmJiAoJyxcbiAgICAnICAgICAgICAgICAgICAgICAgPEJ1dHRvbicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBocmVmPXttZXRhZGF0YS5fX2hhbmRvZmYuZmlnbWFVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBcXCcxMDAlXFwnLCBqdXN0aWZ5Q29udGVudDogXFwnY2VudGVyXFwnIH19JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAge19fKFxcJ09wZW4gaW4gRmlnbWFcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgPC9GbGV4PicsXG4gICAgJyAgICAgICAgICAgIDwvUGFuZWxCb2R5PicsXG4gICAgJyAgICAgICAgICApfScsXG4gIF0uam9pbignXFxuJyk7XG4gIHBhbmVscy5wdXNoKGRlc2lnblN5c3RlbVBhbmVsKTtcblxuICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gZm9yIGVkaXRvciBwcmV2aWV3LlxuICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAvLyBCcmVhZGNydW1iczogbGl2ZSBmZXRjaCB2aWEgUkVTVCBlbmRwb2ludFxuICAvLyBUYXhvbm9teSAoYXV0byBtb2RlKTogbGl2ZSBmZXRjaCB2aWEgdXNlU2VsZWN0IHdpdGggY29yZS1kYXRhXG4gIC8vIFBhZ2luYXRpb246IHNlcnZlci1yZW5kZXJlZCBvbmx5IChzdHViIHZhcmlhYmxlKVxuICBsZXQgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSAnJztcbiAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGRLZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGRLZXkpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnNcbiAgICAgICAgICA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBbcHJldmlldyR7Y2FwfSwgc2V0UHJldmlldyR7Y2FwfV0gPSB1c2VTdGF0ZShudWxsKTtcbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgICAudGhlbigoaXRlbXMpID0+IHNldFByZXZpZXcke2NhcH0oKGl0ZW1zIHx8IFtdKSR7bWFwRXhwcn0pKVxuICAgICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICAgIH0sIFske2F0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7Y2FwfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgICAgaWYgKCR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJykgcmV0dXJuICR7YXR0ck5hbWV9IHx8IFtdO1xuICAgICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0YXhvbm9teSA9ICR7YXR0ck5hbWV9VGF4b25vbXkgfHwgJyR7Y29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJ30nO1xuICAgICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0ZXJtcyA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRFbnRpdHlSZWNvcmRzKCd0YXhvbm9teScsIHRheG9ub215LCB7IHBvc3Q6IHBvc3RJZCwgcGVyX3BhZ2U6ICR7Y29uZmlnLm1heEl0ZW1zID8/IC0xfSB9KTtcbiAgICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgICB9LFxuICAgICAgWyR7YXR0ck5hbWV9RW5hYmxlZCwgJHthdHRyTmFtZX1Tb3VyY2UsICR7YXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7YXR0ck5hbWV9IHx8IFtdKV1cbiAgICApO1xuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1BhZ2luYXRpb25Db25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpOiBmdWxsIHVzZVNlbGVjdCByZXNvbHV0aW9uXG4gICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICBjb25zdCByZXNvbHZlZFZhck5hbWUgPSBgcmVzb2x2ZWQke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgY29uc3Qgc291cmNlQXR0ciA9IGAke2F0dHJOYW1lfVNvdXJjZWA7XG4gICAgICBjb25zdCBxdWVyeUFyZ3NBdHRyID0gYCR7YXR0ck5hbWV9UXVlcnlBcmdzYDtcbiAgICAgIGNvbnN0IHBvc3RUeXBlQXR0ciA9IGAke2F0dHJOYW1lfVBvc3RUeXBlYDtcbiAgICAgIGNvbnN0IHNlbGVjdGVkUG9zdHNBdHRyID0gYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2A7XG4gICAgICBjb25zdCBmaWVsZE1hcHBpbmdBdHRyID0gYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYDtcbiAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNBdHRyID0gYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2A7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgJHtyZXNvbHZlZFZhck5hbWV9ID0gdXNlU2VsZWN0KFxuICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgIGNvbnN0IHF1ZXJ5QXJncyA9ICR7cXVlcnlBcmdzQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3QgcG9zdFR5cGUgPSAke3Bvc3RUeXBlQXR0cn0gfHwgJ3Bvc3QnO1xuICAgICAgICAgIGNvbnN0IGFyZ3MgPSB7XG4gICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7Y29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgb3JkZXI6IChxdWVyeUFyZ3Mub3JkZXIgfHwgJ0RFU0MnKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAocXVlcnlBcmdzLnRheF9xdWVyeSAmJiBxdWVyeUFyZ3MudGF4X3F1ZXJ5Lmxlbmd0aCkge1xuICAgICAgICAgICAgcXVlcnlBcmdzLnRheF9xdWVyeS5mb3JFYWNoKCh0cSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIXRxLnRheG9ub215IHx8ICF0cS50ZXJtcyB8fCAhdHEudGVybXMubGVuZ3RoKSByZXR1cm47XG4gICAgICAgICAgICAgIGNvbnN0IHBhcmFtID0gdHEudGF4b25vbXkgPT09ICdjYXRlZ29yeScgPyAnY2F0ZWdvcmllcycgOiB0cS50YXhvbm9teSA9PT0gJ3Bvc3RfdGFnJyA/ICd0YWdzJyA6IHRxLnRheG9ub215O1xuICAgICAgICAgICAgICBhcmdzW3BhcmFtXSA9IHRxLnRlcm1zLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShyZWNvcmRzKSkgcmV0dXJuIFtdO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW107XG4gICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gc2VsZWN0ZWRcbiAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICByZXR1cm4gcmVjID8gbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSkgOiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSxcbiAgICAgIFske3NvdXJjZUF0dHJ9LCAke3Bvc3RUeXBlQXR0cn0sIEpTT04uc3RyaW5naWZ5KCR7cXVlcnlBcmdzQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke3NlbGVjdGVkUG9zdHNBdHRyfSB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fSldXG4gICAgKTtcbiAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7c291cmNlQXR0cn0gIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHthdHRyTmFtZX0gPz8gW10pO1xuICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAvLyBVc2UgcHJldmlldyB2YXJpYWJsZSBpbiB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgSlNYIHNvIHRoZSBlZGl0b3Igc2hvd3MgcXVlcnkvc2VsZWN0IHJlc3VsdHNcbiAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBwcmV2aWV3VmFyTmFtZSk7XG4gICAgfVxuICAgIGlmIChyZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgaXNQcmV2aWV3TG9hZGluZyA9ICR7cmVzb2x2aW5nRmxhZ3Muam9pbignIHx8ICcpfTtcbmA7XG4gICAgfVxuICAgIC8vIFdoZW4gcHJldmlldyBKU1ggcmVmZXJlbmNlcyBwYWdpbmF0aW9uIChmcm9tIEhCUykgYnV0IHBhZ2luYXRpb24gaXMgb25seSBidWlsdCBzZXJ2ZXItc2lkZSxcbiAgICAvLyBkZWZpbmUgaXQgaW4gdGhlIGVkaXQgc28gdGhlIGVkaXRvciBkb2Vzbid0IHRocm93IFJlZmVyZW5jZUVycm9yLlxuICAgIGNvbnN0IHByZXZpZXdVc2VzUGFnaW5hdGlvbiA9IC9cXGJwYWdpbmF0aW9uXFxiLy50ZXN0KHByZXZpZXdKc3gpO1xuICAgIGNvbnN0IGFueUNvbmZpZ0hhc1BhZ2luYXRpb24gPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSAmJiAhIShjIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbilcbiAgICAgIDogZmFsc2U7XG4gICAgaWYgKHByZXZpZXdVc2VzUGFnaW5hdGlvbiAmJiBhbnlDb25maWdIYXNQYWdpbmF0aW9uICYmICFkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZS5pbmNsdWRlcygnY29uc3QgcGFnaW5hdGlvbicpKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSA9IGAgICAgY29uc3QgcGFnaW5hdGlvbiA9IFtdOyAvLyBFZGl0b3I6IHBhZ2luYXRpb24gaXMgYnVpbHQgc2VydmVyLXNpZGUgaW4gcmVuZGVyLnBocFxuYCArIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdXNpbmcgZHluYW1pYyBwb3N0cywgd3JhcCBwcmV2aWV3IGluIGxvYWRpbmcgc3RhdGVcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgcHJldmlld0NvbnRlbnQgPSByZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwXG4gICAgPyBge2lzUHJldmlld0xvYWRpbmcgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCIke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcgaXMtbG9hZGluZ1wiIHN0eWxlPXt7IG1pbkhlaWdodDogJzEyMHB4JywgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBnYXA6ICc4cHgnIH19PlxuICAgICAgICAgICAgPFNwaW5uZXIgLz5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGNvbG9yOiAndmFyKC0td3AtYWRtaW4tdGhlbWUtY29sb3ItZGFya2VyLCAjMWUxZTFlKScgfX0+e19fKCdMb2FkaW5nIHBvc3Rz4oCmJywgJ2hhbmRvZmYnKX08L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICkgOiAoXG4ke3ByZXZpZXdKc3h9XG4gICAgICAgICl9YFxuICAgIDogcHJldmlld0pzeDtcblxuICAvLyBDaGVjayB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgZm9yIGNvbXBvbmVudHMgdGhhdCBuZWVkIHRvIGJlIGltcG9ydGVkXG4gIC8vIFRoaXMgY2F0Y2hlcyBjb21wb25lbnRzIGFkZGVkIGJ5IHRoZSBoYW5kbGViYXJzLXRvLWpzeCB0cmFuc3BpbGVyIChlLmcuLCBmcm9tIHt7I2ZpZWxkfX0gbWFya2VycylcbiAgY29uc3QgcHJldmlld1VzZXNSaWNoVGV4dCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxSaWNoVGV4dCcpO1xuICBjb25zdCBwcmV2aWV3VXNlczEwdXBJbWFnZSA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpO1xuXG4gIC8vIEFkZCBSaWNoVGV4dCB0byBpbXBvcnRzIGlmIHVzZWQgaW4gcHJldmlldyAoYW5kIG5vdCBhbHJlYWR5IGluY2x1ZGVkIGZyb20gcHJvcGVydHkgdHlwZXMpXG4gIGlmICgocHJldmlld1VzZXNSaWNoVGV4dCB8fCBwcmV2aWV3VXNlc0xpbmtGaWVsZCkgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdSaWNoVGV4dCcpO1xuICB9XG5cbiAgLy8gTGlua0NvbnRyb2wgaXMgbmVlZGVkIGZvciBzaWRlYmFyIGxpbmsvYnV0dG9uIHByb3BlcnR5IHBhbmVsczsgYWRkIHVuY29uZGl0aW9uYWxseSB3aGVuIHByZXNlbnQuXG4gIC8vIChIYW5kb2ZmTGlua0ZpZWxkIGluIHRoZSBwcmV2aWV3IGlzIHNlcGFyYXRlIOKAlCBpdCdzIGltcG9ydGVkIGZyb20gdGhlIHNoYXJlZCBjb21wb25lbnQgYW5kIGhhbmRsZXMgaXRzIG93biBMaW5rQ29udHJvbCBpbnRlcm5hbGx5LilcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wpIHtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnTGlua0NvbnRyb2wnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0xpbmtDb250cm9sJyk7XG4gICAgaWYgKCFjb21wb25lbnRJbXBvcnRzLmluY2x1ZGVzKCdQb3BvdmVyJykpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuICB9XG5cbiAgLy8gQWRkIElubmVyQmxvY2tzIGlmIHVzZWQgaW4gcHJldmlldyBidXQgbm90IGFscmVhZHkgaW1wb3J0ZWRcbiAgY29uc3QgcHJldmlld1VzZXNJbm5lckJsb2NrcyA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbm5lckJsb2NrcycpO1xuICBpZiAocHJldmlld1VzZXNJbm5lckJsb2NrcyAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdJbm5lckJsb2NrcycpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgMTB1cCBpbXBvcnQgaWYgbmVlZGVkIChJbWFnZSBmb3IgcHJldmlldywgUmVwZWF0ZXIgZm9yIGFycmF5cylcbiAgaWYgKHByZXZpZXdVc2VzMTB1cEltYWdlKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIH1cbiAgY29uc3QgdGVuVXBJbXBvcnQgPSB0ZW5VcEltcG9ydHMubGVuZ3RoID4gMFxuICAgID8gYGltcG9ydCB7ICR7dGVuVXBJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gQ29sbGVjdCBhbGwgaW1hZ2UgZmllbGRzIGZvciBCbG9ja0NvbnRyb2xzL01lZGlhUmVwbGFjZUZsb3dcbiAgaW50ZXJmYWNlIEltYWdlRmllbGRJbmZvIHtcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGF0dHJQYXRoOiBzdHJpbmc7ICAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQuaW1hZ2UnXG4gICAgdmFsdWVFeHByOiBzdHJpbmc7IC8vIGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdsZWZ0Q2FyZD8uaW1hZ2UnXG4gICAgdXBkYXRlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnc2V0QXR0cmlidXRlcyh7IGJhY2tncm91bmRJbWFnZTogLi4uIH0pJyBvciBuZXN0ZWQgdXBkYXRlXG4gIH1cbiAgXG4gIGNvbnN0IGltYWdlRmllbGRzOiBJbWFnZUZpZWxkSW5mb1tdID0gW107XG4gIFxuICBjb25zdCBjb2xsZWN0SW1hZ2VGaWVsZHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnLCBwYXJlbnRWYWx1ZVBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gcGFyZW50UGF0aCA/IGAke3BhcmVudFBhdGh9LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgY29uc3QgY3VycmVudFZhbHVlUGF0aCA9IHBhcmVudFZhbHVlUGF0aCA/IGAke3BhcmVudFZhbHVlUGF0aH0/LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICAgIGxldCB1cGRhdGVFeHByOiBzdHJpbmc7XG4gICAgICAgIFxuICAgICAgICBpZiAocGFyZW50UGF0aCkge1xuICAgICAgICAgIC8vIE5lc3RlZCBpbWFnZSBmaWVsZCAtIG5lZWQgdG8gc3ByZWFkIHBhcmVudCBvYmplY3RcbiAgICAgICAgICBjb25zdCBwYXJlbnRBdHRyID0gcGFyZW50UGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgIGNvbnN0IHBhcmVudENhbWVsID0gdG9DYW1lbENhc2UocGFyZW50QXR0cik7XG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnRDYW1lbH06IHsgLi4uJHtwYXJlbnRDYW1lbH0sICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSB9KWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVG9wLWxldmVsIGltYWdlIGZpZWxkXG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9KWA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGltYWdlRmllbGRzLnB1c2goe1xuICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgIGF0dHJQYXRoOiBjdXJyZW50UGF0aCxcbiAgICAgICAgICB2YWx1ZUV4cHI6IGN1cnJlbnRWYWx1ZVBhdGgsXG4gICAgICAgICAgdXBkYXRlRXhwclxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29sbGVjdEltYWdlRmllbGRzKHByb3AucHJvcGVydGllcywgY3VycmVudFBhdGgsIGN1cnJlbnRWYWx1ZVBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wZXJ0aWVzKTtcbiAgXG4gIC8vIEdlbmVyYXRlIEJsb2NrQ29udHJvbHMgd2l0aCBNZWRpYVJlcGxhY2VGbG93IGZvciBlYWNoIGltYWdlIGZpZWxkXG4gIGNvbnN0IGJsb2NrQ29udHJvbHNKc3ggPSBpbWFnZUZpZWxkcy5sZW5ndGggPiAwID8gYFxuICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XG4ke2ltYWdlRmllbGRzLm1hcChmaWVsZCA9PiBgICAgICAgICAgIDxNZWRpYVJlcGxhY2VGbG93XG4gICAgICAgICAgICBtZWRpYUlkPXske2ZpZWxkLnZhbHVlRXhwcn0/LmlkfVxuICAgICAgICAgICAgbWVkaWFVcmw9eyR7ZmllbGQudmFsdWVFeHByfT8uc3JjfVxuICAgICAgICAgICAgYWxsb3dlZFR5cGVzPXtbJ2ltYWdlJ119XG4gICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgIG9uU2VsZWN0PXsobWVkaWEpID0+ICR7ZmllbGQudXBkYXRlRXhwcn19XG4gICAgICAgICAgICBuYW1lPXtfXygnJHtmaWVsZC5sYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgIC8+YCkuam9pbignXFxuJyl9XG4gICAgICAgIDwvQmxvY2tDb250cm9scz5gIDogJyc7XG5cbiAgLy8gU2hhcmVkIGNvbXBvbmVudCBpbXBvcnRzIGZvciBkeW5hbWljIGFycmF5cyAoc2VsZWN0b3IgVUkgKyBlZGl0b3IgcHJldmlldyBtYXBwaW5nKVxuICBjb25zdCBzaGFyZWROYW1lZEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChoYXNEeW5hbWljQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnRHluYW1pY1Bvc3RTZWxlY3RvcicsICdtYXBQb3N0RW50aXR5VG9JdGVtJyk7XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAoaGFzVGF4b25vbXlBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGhhc1BhZ2luYXRpb25BcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1BhZ2luYXRpb25TZWxlY3RvcicpO1xuXG4gIGxldCBzaGFyZWRDb21wb25lbnRJbXBvcnQgPSBzaGFyZWROYW1lZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHtzaGFyZWROYW1lZEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICcuLi8uLi9zaGFyZWQnO1xcbmBcbiAgICA6ICcnO1xuICBjb25zdCBuZWVkc0RhdGFTdG9yZSA9IGhhc0R5bmFtaWNBcnJheXMgfHwgaGFzVGF4b25vbXlBcnJheTtcbiAgaWYgKG5lZWRzRGF0YVN0b3JlKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyB1c2VTZWxlY3Qke2hhc0JyZWFkY3J1bWJzQXJyYXkgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuXG4gIC8vIEJ1aWxkIGVsZW1lbnQgaW1wb3J0c1xuICBjb25zdCBlbGVtZW50SW1wb3J0cyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBlbGVtZW50SW1wb3J0cy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcbiAgfVxuXG4gIC8vIEltcG9ydCBzaGFyZWQgSGFuZG9mZkxpbmtGaWVsZCB3aGVuIHByZXZpZXcgdXNlcyBsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBsaW5rRmllbGRJbXBvcnQgPSBwcmV2aWV3VXNlc0xpbmtGaWVsZCA/IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gIDogJyc7XG5cbiAgLy8gU2NyZWVuc2hvdCBpbXBvcnQgZm9yIGluc2VydGVyIHByZXZpZXdcbiAgY29uc3Qgc2NyZWVuc2hvdEltcG9ydCA9IGhhc1NjcmVlbnNob3QgPyBgaW1wb3J0IHNjcmVlbnNob3RVcmwgZnJvbSAnLi9zY3JlZW5zaG90LnBuZyc7XFxuYCA6ICcnO1xuXG4gIC8vIFNWRyBpY29uIGZvciB0aGUgYmxvY2sgKHVuaXF1ZSBwZXIgYmxvY2ssIGNvbG9yZWQgYnkgZ3JvdXApXG4gIGNvbnN0IHN2Z0ljb25TdHIgPSBnZW5lcmF0ZVN2Z0ljb24oY29tcG9uZW50LnRpdGxlLCBjb21wb25lbnQuZ3JvdXApO1xuICBjb25zdCBzdmdJY29uQ29kZSA9IGBjb25zdCBibG9ja0ljb24gPSAoXG4gICR7c3ZnSWNvblN0cn1cbik7YDtcblxuICAvLyBJbnNlcnRlciBwcmV2aWV3OiBzaG93IHNjcmVlbnNob3QgaW1hZ2UgaW5zdGVhZCBvZiBsaXZlLXJlbmRlcmluZ1xuICBjb25zdCBwcmV2aWV3RWFybHlSZXR1cm4gPSBoYXNTY3JlZW5zaG90XG4gICAgPyBgICAgIGlmIChhdHRyaWJ1dGVzLl9fcHJldmlldykge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4gICAgICAgICAgPGltZyBzcmM9e3NjcmVlbnNob3RVcmx9IGFsdD17bWV0YWRhdGEudGl0bGV9IHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19IC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKTtcbiAgICB9XG5gXG4gICAgOiAnJztcblxuICByZXR1cm4gYGltcG9ydCB7IHJlZ2lzdGVyQmxvY2tUeXBlIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9ja3MnO1xuaW1wb3J0IHsgXG4gICR7YmxvY2tFZGl0b3JJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgXG4gICR7Y29tcG9uZW50SW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbiR7dGVuVXBJbXBvcnR9JHtzaGFyZWRDb21wb25lbnRJbXBvcnR9aW1wb3J0IG1ldGFkYXRhIGZyb20gJy4vYmxvY2suanNvbic7XG5pbXBvcnQgJy4vZWRpdG9yLnNjc3MnO1xuJHtoYXNEeW5hbWljQXJyYXlzID8gXCJpbXBvcnQgJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0R5bmFtaWNQb3N0U2VsZWN0b3IuZWRpdG9yLnNjc3MnO1xcblwiIDogJyd9aW1wb3J0ICcuL3N0eWxlLnNjc3MnO1xuJHtzY3JlZW5zaG90SW1wb3J0fSR7bGlua0ZpZWxkSW1wb3J0fVxuJHtzdmdJY29uQ29kZX1cblxuJHtkZXByZWNhdGlvbnNDb2RlID8gYCR7ZGVwcmVjYXRpb25zQ29kZX1cXG5cXG5gIDogJyd9cmVnaXN0ZXJCbG9ja1R5cGUobWV0YWRhdGEubmFtZSwge1xuICAuLi5tZXRhZGF0YSxcbiAgaWNvbjogYmxvY2tJY29uLCR7ZGVwcmVjYXRpb25zQ29kZSA/ICdcXG4gIGRlcHJlY2F0ZWQsJyA6ICcnfVxuICBlZGl0OiAoeyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBpc1NlbGVjdGVkIH0pID0+IHtcbiAgICBjb25zdCBibG9ja1Byb3BzID0gdXNlQmxvY2tQcm9wcygpO1xuJHtwcmV2aWV3RWFybHlSZXR1cm59JHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXMuam9pbignLCAnKX0gfSA9IGF0dHJpYnV0ZXM7XG4ke2R5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlfVxuJHthcnJheUhlbHBlcnN9XG4gICAgcmV0dXJuIChcbiAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgPEluc3BlY3RvckNvbnRyb2xzPlxuJHtwYW5lbHMuam9pbignXFxuXFxuJyl9XG4gICAgICAgIDwvSW5zcGVjdG9yQ29udHJvbHM+XG4ke2Jsb2NrQ29udHJvbHNKc3h9XG5cbiAgICAgICAgey8qIEVkaXRvciBQcmV2aWV3ICovfVxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiR7cHJldmlld0NvbnRlbnR9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9GcmFnbWVudD5cbiAgICApO1xuICB9LFxuICBzYXZlOiAoKSA9PiB7XG4ke3VzZUlubmVyQmxvY2tzIHx8IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyAnICAgIC8vIElubmVyQmxvY2tzIGNvbnRlbnQgbXVzdCBiZSBzYXZlZCBzbyBpdCBpcyBwZXJzaXN0ZWQgaW4gcG9zdCBjb250ZW50XFxuICAgIHJldHVybiA8SW5uZXJCbG9ja3MuQ29udGVudCAvPjsnIDogJyAgICAvLyBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgdmlhIHJlbmRlci5waHBcXG4gICAgcmV0dXJuIG51bGw7J31cbiAgfSxcbn0pO1xuYDtcbn07XG5cbmV4cG9ydCB7IGdlbmVyYXRlSW5kZXhKcywgZ2VuZXJhdGVTdmdJY29uLCB0b1RpdGxlQ2FzZSwgZ2VuZXJhdGVGaWVsZENvbnRyb2wsIGdlbmVyYXRlQXJyYXlDb250cm9sLCBnZW5lcmF0ZVByb3BlcnR5Q29udHJvbCB9O1xuZXhwb3J0IHR5cGUgeyBGaWVsZENvbnRleHQgfTtcbiJdfQ==