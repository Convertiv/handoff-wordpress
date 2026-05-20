"use strict";
/**
 * Generates index.js for Gutenberg block editor
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasNonOpacityNumberField = exports.hasOpacityRangeField = exports.getNumberControlSpec = exports.isOpacityRangeField = exports.generatePropertyControl = exports.generateArrayControl = exports.generateFieldControl = exports.toTitleCase = exports.generateSvgIcon = exports.generateIndexJs = void 0;
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
const fieldLabelHaystack = (fieldKey, property) => `${fieldKey} ${property.name ?? ''} ${property.description ?? ''}`.toLowerCase();
/** Opacity / overlay alpha fields use a 0–1 range slider. */
const isOpacityRangeField = (fieldKey, property) => {
    const hay = fieldLabelHaystack(fieldKey, property);
    return /opacity|overlay\s*opacity|\balpha\b/i.test(hay);
};
exports.isOpacityRangeField = isOpacityRangeField;
/** Resolve editor control type and bounds for a number property. */
const getNumberControlSpec = (fieldKey, property) => {
    if (isOpacityRangeField(fieldKey, property)) {
        return { useRange: true, min: 0, max: 1, step: 0.01 };
    }
    const hay = fieldLabelHaystack(fieldKey, property);
    const keyHay = `${fieldKey} ${property.name ?? ''}`.toLowerCase();
    if (/\blat(itude)?\b/i.test(keyHay) || /\blat(itude)?\b/i.test(hay)) {
        return { useRange: false, min: -90, max: 90, step: 0.000001 };
    }
    if (/\blng\b|\blon(gitude)?\b/i.test(keyHay) || /\blng\b|\blon(gitude)?\b/i.test(hay)) {
        return { useRange: false, min: -180, max: 180, step: 0.000001 };
    }
    if (/\bzoom\b/i.test(keyHay) || /\bzoom\b/i.test(hay)) {
        return { useRange: false, min: 1, max: 21, step: 1 };
    }
    const defaultIsInteger = typeof property.default === 'number' && Number.isInteger(property.default);
    return { useRange: false, step: defaultIsInteger ? 1 : undefined };
};
exports.getNumberControlSpec = getNumberControlSpec;
const walkNumberFields = (properties, predicate) => {
    const check = (prop, fieldKey) => {
        if (prop.type === 'number' && predicate(fieldKey, prop)) {
            return true;
        }
        if (prop.type === 'object' && prop.properties) {
            return Object.entries(prop.properties).some(([k, p]) => check(p, k));
        }
        if (prop.type === 'array' && prop.items?.properties) {
            return Object.entries(prop.items.properties).some(([k, p]) => check(p, k));
        }
        return false;
    };
    return Object.entries(properties).some(([k, p]) => check(p, k));
};
const hasOpacityRangeField = (properties) => walkNumberFields(properties, isOpacityRangeField);
exports.hasOpacityRangeField = hasOpacityRangeField;
const hasNonOpacityNumberField = (properties) => walkNumberFields(properties, (fieldKey, property) => !isOpacityRangeField(fieldKey, property));
exports.hasNonOpacityNumberField = hasNonOpacityNumberField;
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
            const spec = getNumberControlSpec(fieldKey, property);
            if (spec.useRange) {
                return `${indent}<RangeControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={${valueAccessor} ?? 0}
${indent}  onChange={(value) => ${onChangeHandler('value')}}
${indent}  min={${spec.min ?? 0}}
${indent}  max={${spec.max ?? 1}}
${indent}  step={${spec.step ?? 0.01}}
${indent}/>`;
            }
            const boundLines = [];
            if (spec.min !== undefined) {
                boundLines.push(`${indent}  min={${spec.min}}`);
            }
            if (spec.max !== undefined) {
                boundLines.push(`${indent}  max={${spec.max}}`);
            }
            if (spec.step !== undefined) {
                boundLines.push(`${indent}  step={${spec.step}}`);
            }
            const bounds = boundLines.length ? `\n${boundLines.join('\n')}` : '';
            return `${indent}<NumberControl
${indent}  label={__('${label}', 'handoff')}
${indent}  value={typeof ${valueAccessor} === 'number' ? ${valueAccessor} : undefined}
${indent}  onChange={(value) => ${onChangeHandler('typeof value === \'number\' ? value : 0')}}
${bounds}
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
    const needsRangeControl = hasOpacityRangeField(properties);
    const needsNumberControl = hasNonOpacityNumberField(properties);
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
    if (needsNumberControl)
        componentImports.push('NumberControl');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBdzlDQSxrQ0FBVztBQW44Q2IsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsUUFBeUIsRUFBVSxFQUFFLENBQ2pGLEdBQUcsUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLElBQUksRUFBRSxJQUFJLFFBQVEsQ0FBQyxXQUFXLElBQUksRUFBRSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7QUFFbkYsNkRBQTZEO0FBQzdELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxRQUFnQixFQUFFLFFBQXlCLEVBQVcsRUFBRTtJQUNuRixNQUFNLEdBQUcsR0FBRyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbkQsT0FBTyxzQ0FBc0MsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDMUQsQ0FBQyxDQUFDO0FBZzhDQSxrREFBbUI7QUE5N0NyQixvRUFBb0U7QUFDcEUsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsUUFBeUIsRUFBcUIsRUFB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LGFBQWEsYUFBYTtFQUNoQyxNQUFNLGNBQWMsYUFBYSxXQUFXLGFBQWE7RUFDekQsTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1B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O0NBT0w7UUFDRyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBRVAsT0FBTzs7SUFFTCxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDOzs7SUFHaEMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQzs7O1dBR3ZCLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0VBQ2xDLFdBQVcsR0FBRyxxQkFBcUI7O0VBRW5DLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDLENBQUMsRUFBRTtFQUM3RixnQkFBZ0IsR0FBRyxlQUFlO0VBQ2xDLFdBQVc7O0VBRVgsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTs7b0JBRS9CLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRTs7O0VBRzNELGtCQUFrQixHQUFHLGNBQWMsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsZ0xBQWdMLENBQUMsQ0FBQyxDQUFDLEVBQUU7Y0FDek8sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDaEMsMEJBQTBCO0VBQzFCLFlBQVk7Ozs7RUFJWixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7RUFFbkIsZ0JBQWdCOzs7O0VBSWhCLGNBQWM7Ozs7OztFQU1kLGNBQWMsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsa0hBQWtILENBQUMsQ0FBQyxDQUFDLCtEQUErRDs7O0NBR2hPLENBQUM7QUFDRixDQUFDLENBQUM7QUFHQSwwQ0FBZSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIGluZGV4LmpzIGZvciBHdXRlbmJlcmcgYmxvY2sgZWRpdG9yXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWcsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQmxvY2tOYW1lIH0gZnJvbSAnLi9ibG9jay1qc29uJztcbmltcG9ydCB7IGdlbmVyYXRlSnN4UHJldmlldywgdG9DYW1lbENhc2UgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4JztcbmltcG9ydCB7IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMsIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeC91dGlscyc7XG5pbXBvcnQgeyBidWlsZFJlc2hhcGVKcyB9IGZyb20gJy4vcmVuZGVyLXBocCc7XG5cbi8qKlxuICogQ29udmVydCBzbmFrZV9jYXNlIHRvIFRpdGxlIENhc2VcbiAqL1xuY29uc3QgdG9UaXRsZUNhc2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gc3RyXG4gICAgLnNwbGl0KCdfJylcbiAgICAubWFwKHdvcmQgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkpXG4gICAgLmpvaW4oJyAnKTtcbn07XG5cbi8qKlxuICogQ29udGV4dCBmb3IgZ2VuZXJhdGluZyBmaWVsZCBjb250cm9scyAtIGRldGVybWluZXMgaG93IHZhbHVlcyBhcmUgYWNjZXNzZWQgYW5kIHVwZGF0ZWRcbiAqL1xuaW50ZXJmYWNlIEZpZWxkQ29udGV4dCB7XG4gIC8qKiBUaGUgdmFyaWFibGUgbmFtZSBmb3IgYWNjZXNzaW5nIHRoZSB2YWx1ZSAoZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2l0ZW0uaW1hZ2UnKSAqL1xuICB2YWx1ZUFjY2Vzc29yOiBzdHJpbmc7XG4gIC8qKiBUaGUgb25DaGFuZ2UgaGFuZGxlciBjb2RlIChlLmcuLCAnc2V0QXR0cmlidXRlcyh7IHg6IHZhbHVlIH0pJyBvciAndXBkYXRlSXRlbXMoaW5kZXgsIFwieFwiLCB2YWx1ZSknKSAqL1xuICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIC8qKiBCYXNlIGluZGVudGF0aW9uICovXG4gIGluZGVudDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgTnVtYmVyQ29udHJvbFNwZWMge1xuICB1c2VSYW5nZTogYm9vbGVhbjtcbiAgbWluPzogbnVtYmVyO1xuICBtYXg/OiBudW1iZXI7XG4gIHN0ZXA/OiBudW1iZXI7XG59XG5cbmNvbnN0IGZpZWxkTGFiZWxIYXlzdGFjayA9IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+XG4gIGAke2ZpZWxkS2V5fSAke3Byb3BlcnR5Lm5hbWUgPz8gJyd9ICR7cHJvcGVydHkuZGVzY3JpcHRpb24gPz8gJyd9YC50b0xvd2VyQ2FzZSgpO1xuXG4vKiogT3BhY2l0eSAvIG92ZXJsYXkgYWxwaGEgZmllbGRzIHVzZSBhIDDigJMxIHJhbmdlIHNsaWRlci4gKi9cbmNvbnN0IGlzT3BhY2l0eVJhbmdlRmllbGQgPSAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCBoYXkgPSBmaWVsZExhYmVsSGF5c3RhY2soZmllbGRLZXksIHByb3BlcnR5KTtcbiAgcmV0dXJuIC9vcGFjaXR5fG92ZXJsYXlcXHMqb3BhY2l0eXxcXGJhbHBoYVxcYi9pLnRlc3QoaGF5KTtcbn07XG5cbi8qKiBSZXNvbHZlIGVkaXRvciBjb250cm9sIHR5cGUgYW5kIGJvdW5kcyBmb3IgYSBudW1iZXIgcHJvcGVydHkuICovXG5jb25zdCBnZXROdW1iZXJDb250cm9sU3BlYyA9IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogTnVtYmVyQ29udHJvbFNwZWMgPT4ge1xuICBpZiAoaXNPcGFjaXR5UmFuZ2VGaWVsZChmaWVsZEtleSwgcHJvcGVydHkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IHRydWUsIG1pbjogMCwgbWF4OiAxLCBzdGVwOiAwLjAxIH07XG4gIH1cblxuICBjb25zdCBoYXkgPSBmaWVsZExhYmVsSGF5c3RhY2soZmllbGRLZXksIHByb3BlcnR5KTtcbiAgY29uc3Qga2V5SGF5ID0gYCR7ZmllbGRLZXl9ICR7cHJvcGVydHkubmFtZSA/PyAnJ31gLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKC9cXGJsYXQoaXR1ZGUpP1xcYi9pLnRlc3Qoa2V5SGF5KSB8fCAvXFxibGF0KGl0dWRlKT9cXGIvaS50ZXN0KGhheSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIG1pbjogLTkwLCBtYXg6IDkwLCBzdGVwOiAwLjAwMDAwMSB9O1xuICB9XG4gIGlmICgvXFxibG5nXFxifFxcYmxvbihnaXR1ZGUpP1xcYi9pLnRlc3Qoa2V5SGF5KSB8fCAvXFxibG5nXFxifFxcYmxvbihnaXR1ZGUpP1xcYi9pLnRlc3QoaGF5KSkge1xuICAgIHJldHVybiB7IHVzZVJhbmdlOiBmYWxzZSwgbWluOiAtMTgwLCBtYXg6IDE4MCwgc3RlcDogMC4wMDAwMDEgfTtcbiAgfVxuICBpZiAoL1xcYnpvb21cXGIvaS50ZXN0KGtleUhheSkgfHwgL1xcYnpvb21cXGIvaS50ZXN0KGhheSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIG1pbjogMSwgbWF4OiAyMSwgc3RlcDogMSB9O1xuICB9XG5cbiAgY29uc3QgZGVmYXVsdElzSW50ZWdlciA9XG4gICAgdHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIocHJvcGVydHkuZGVmYXVsdCk7XG4gIHJldHVybiB7IHVzZVJhbmdlOiBmYWxzZSwgc3RlcDogZGVmYXVsdElzSW50ZWdlciA/IDEgOiB1bmRlZmluZWQgfTtcbn07XG5cbmNvbnN0IHdhbGtOdW1iZXJGaWVsZHMgPSAoXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIHByZWRpY2F0ZTogKGZpZWxkS2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpID0+IGJvb2xlYW5cbik6IGJvb2xlYW4gPT4ge1xuICBjb25zdCBjaGVjayA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHksIGZpZWxkS2V5OiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBpZiAocHJvcC50eXBlID09PSAnbnVtYmVyJyAmJiBwcmVkaWNhdGUoZmllbGRLZXksIHByb3ApKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+IGNoZWNrKHAsIGspKTtcbiAgICB9XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+IGNoZWNrKHAsIGspKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PiBjaGVjayhwLCBrKSk7XG59O1xuXG5jb25zdCBoYXNPcGFjaXR5UmFuZ2VGaWVsZCA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogYm9vbGVhbiA9PlxuICB3YWxrTnVtYmVyRmllbGRzKHByb3BlcnRpZXMsIGlzT3BhY2l0eVJhbmdlRmllbGQpO1xuXG5jb25zdCBoYXNOb25PcGFjaXR5TnVtYmVyRmllbGQgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IGJvb2xlYW4gPT5cbiAgd2Fsa051bWJlckZpZWxkcyhwcm9wZXJ0aWVzLCAoZmllbGRLZXksIHByb3BlcnR5KSA9PiAhaXNPcGFjaXR5UmFuZ2VGaWVsZChmaWVsZEtleSwgcHJvcGVydHkpKTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpZWxkIGNvbnRyb2wgZm9yIGFueSBwcm9wZXJ0eSB0eXBlIC0gdW5pZmllZCBmdW5jdGlvbiBmb3IgYm90aCB0b3AtbGV2ZWwgYW5kIG5lc3RlZCBmaWVsZHNcbiAqL1xuY29uc3QgZ2VuZXJhdGVGaWVsZENvbnRyb2wgPSAoXG4gIGZpZWxkS2V5OiBzdHJpbmcsXG4gIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksXG4gIGNvbnRleHQ6IEZpZWxkQ29udGV4dFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgeyB2YWx1ZUFjY2Vzc29yLCBvbkNoYW5nZUhhbmRsZXIsIGluZGVudCB9ID0gY29udGV4dDtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGZpZWxkS2V5KTtcblxuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0Jzoge1xuICAgICAgY29uc3QgaXNXaXN0aWFUZXh0RmllbGQgPSAvXFxid2lzdGlhXFxiL2kudGVzdChgJHtmaWVsZEtleX0gJHtsYWJlbH0gJHtwcm9wZXJ0eS5kZXNjcmlwdGlvbiA/PyAnJ31gKTtcblxuICAgICAgaWYgKGlzV2lzdGlhVGV4dEZpZWxkKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICB7KCgpID0+IHtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgJycpLnRyaW0oKTtcbiR7aW5kZW50fSAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgIGNvbnN0IHdpc3RpYUlkID0gbWVkaWFNYXRjaD8uWzFdIHx8IGZhbGxiYWNrTWF0Y2g/LlsxXSB8fCAnJztcbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIGlmICghd2lzdGlhSWQpIHtcbiR7aW5kZW50fSAgICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzE2cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyOiAnMXB4IGRhc2hlZCAjY2JkNWUxJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjNDc1NTY5JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZjhmYWZjJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAge19fKCdBZGQgYSBXaXN0aWEgdmlkZW8gSUQgdG8gcHJldmlldyB0aGlzIHZpZGVvLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgKTtcbiR7aW5kZW50fSAgICB9XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuJHtpbmRlbnR9ICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcbiR7aW5kZW50fSAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICBiYWNrZ3JvdW5kOiAnIzBmMTcyYScsXG4ke2luZGVudH0gICAgICAgICAgYXNwZWN0UmF0aW86ICcxNiAvIDknLFxuJHtpbmRlbnR9ICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICA8aW1nXG4ke2luZGVudH0gICAgICAgICAgc3JjPXtcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS9zd2F0Y2hcXGB9XG4ke2luZGVudH0gICAgICAgICAgYWx0PXtfXygnV2lzdGlhIHZpZGVvIHByZXZpZXcnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLCBvYmplY3RGaXQ6ICdjb3ZlcicsIGRpc3BsYXk6ICdibG9jaycgfX1cbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGluc2V0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWxpZ25JdGVtczogJ2ZsZXgtZW5kJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnc3BhY2UtYmV0d2VlbicsXG4ke2luZGVudH0gICAgICAgICAgICBnYXA6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICdsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCByZ2JhKDE1LCAyMywgNDIsIDAuMTIpIDAlLCByZ2JhKDE1LCAyMywgNDIsIDAuNykgMTAwJSknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwidHJ1ZVwiXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICB3aWR0aDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBoZWlnaHQ6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjQpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2Ryb3BGaWx0ZXI6ICdibHVyKDEwcHgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgICB3aWR0aDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBoZWlnaHQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgbWFyZ2luTGVmdDogJzRweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyVG9wOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJCb3R0b206ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckxlZnQ6ICcxNHB4IHNvbGlkICNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtaW5IZWlnaHQ6ICczMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgcGFkZGluZzogJzZweCAxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgxNSwgMjMsIDQyLCAwLjU4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRTaXplOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRXZWlnaHQ6IDYwMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbGV0dGVyU3BhY2luZzogJzAuMDJlbScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHt3aXN0aWFJZH1cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgKTtcbiR7aW5kZW50fSAgfSkoKX1cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgICAvLyBJbnNpZGUgYW4gYXJyYXkgaXRlbSwgSW5uZXJCbG9ja3MgY2FuJ3QgYmUgdXNlZCDigJQgcHJvdmlkZSBhIHRleHRhcmVhXG4gICAgICBpZiAodmFsdWVBY2Nlc3Nvci5zdGFydHNXaXRoKCdpdGVtLicpKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRhcmVhQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgcm93cz17NH1cbiR7aW5kZW50fS8+YDtcbiAgICAgIH1cbiAgICAgIC8vIFRvcC1sZXZlbCByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgY29udHJvbCBuZWVkZWRcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ251bWJlcic6IHtcbiAgICAgIGNvbnN0IHNwZWMgPSBnZXROdW1iZXJDb250cm9sU3BlYyhmaWVsZEtleSwgcHJvcGVydHkpO1xuICAgICAgaWYgKHNwZWMudXNlUmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08UmFuZ2VDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSA/PyAwfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIG1pbj17JHtzcGVjLm1pbiA/PyAwfX1cbiR7aW5kZW50fSAgbWF4PXske3NwZWMubWF4ID8/IDF9fVxuJHtpbmRlbnR9ICBzdGVwPXske3NwZWMuc3RlcCA/PyAwLjAxfX1cbiR7aW5kZW50fS8+YDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYm91bmRMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChzcGVjLm1pbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJvdW5kTGluZXMucHVzaChgJHtpbmRlbnR9ICBtaW49eyR7c3BlYy5taW59fWApO1xuICAgICAgfVxuICAgICAgaWYgKHNwZWMubWF4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYm91bmRMaW5lcy5wdXNoKGAke2luZGVudH0gIG1heD17JHtzcGVjLm1heH19YCk7XG4gICAgICB9XG4gICAgICBpZiAoc3BlYy5zdGVwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYm91bmRMaW5lcy5wdXNoKGAke2luZGVudH0gIHN0ZXA9eyR7c3BlYy5zdGVwfX1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGJvdW5kcyA9IGJvdW5kTGluZXMubGVuZ3RoID8gYFxcbiR7Ym91bmRMaW5lcy5qb2luKCdcXG4nKX1gIDogJyc7XG5cbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PE51bWJlckNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXt0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ251bWJlcicgPyAke3ZhbHVlQWNjZXNzb3J9IDogdW5kZWZpbmVkfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndHlwZW9mIHZhbHVlID09PSBcXCdudW1iZXJcXCcgPyB2YWx1ZSA6IDAnKX19XG4ke2JvdW5kc31cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfT8uc3JjfSBcbiR7aW5kZW50fSAgICAgICAgICAgIGFsdD17JHt2YWx1ZUFjY2Vzc29yfT8uYWx0IHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3sgbWF4V2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uIG9uQ2xpY2s9e29wZW59IHZhcmlhbnQ9XCJzZWNvbmRhcnlcIiBzaXplPVwic21hbGxcIj5cbiR7aW5kZW50fSAgICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjID8gX18oJ1JlcGxhY2UgJHtsYWJlbH0nLCAnaGFuZG9mZicpIDogX18oJ1NlbGVjdCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjICYmIChcbiR7aW5kZW50fSAgICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiAke29uQ2hhbmdlSGFuZGxlcigneyBzcmM6IFxcJ1xcJywgYWx0OiBcXCdcXCcgfScpfX1cbiR7aW5kZW50fSAgICAgICAgICAgIHZhcmlhbnQ9XCJsaW5rXCJcbiR7aW5kZW50fSAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge19fKCdSZW1vdmUnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICl9XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH08L01lZGlhVXBsb2FkQ2hlY2s+YDtcblxuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9e3R5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJyA/ICR7dmFsdWVBY2Nlc3Nvcn0gOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiB7XG4ke2luZGVudH0gICAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH0gICAgICAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4oJHt2YWx1ZUFjY2Vzc29yfSAmJiB0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ29iamVjdCcgPyAke3ZhbHVlQWNjZXNzb3J9IDoge30pLCBpZDogd2lzdGlhSWQsIHNyYzogd2lzdGlhSWQgPyBcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS5qc29ucFxcYCA6IG5vcm1hbGl6ZWQgfWApfVxuJHtpbmRlbnR9ICAgIH19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIHsoKCkgPT4ge1xuJHtpbmRlbnR9ICAgIGNvbnN0IHJhd1ZhbHVlID1cbiR7aW5kZW50fSAgICAgIHR5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJ1xuJHtpbmRlbnR9ICAgICAgICA/ICR7dmFsdWVBY2Nlc3Nvcn1cbiR7aW5kZW50fSAgICAgICAgOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKTtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHJhd1ZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICBpZiAoIXdpc3RpYUlkKSB7XG4ke2luZGVudH0gICAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxNnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlcjogJzFweCBkYXNoZWQgI2NiZDVlMScsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnIzQ3NTU2OScsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2Y4ZmFmYycsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIHtfXygnQWRkIGEgV2lzdGlhIHZpZGVvIElEIHRvIHByZXZpZXcgdGhpcyB2aWRlby4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICk7XG4ke2luZGVudH0gICAgfVxuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiR7aW5kZW50fSAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXG4ke2luZGVudH0gICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgYmFja2dyb3VuZDogJyMwZjE3MmEnLFxuJHtpbmRlbnR9ICAgICAgICAgIGFzcGVjdFJhdGlvOiAnMTYgLyA5JyxcbiR7aW5kZW50fSAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAgPGltZ1xuJHtpbmRlbnR9ICAgICAgICAgIHNyYz17XFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0vc3dhdGNoXFxgfVxuJHtpbmRlbnR9ICAgICAgICAgIGFsdD17X18oJ1dpc3RpYSB2aWRlbyBwcmV2aWV3JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInLCBkaXNwbGF5OiAnYmxvY2snIH19XG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4ke2luZGVudH0gICAgICAgICAgICBpbnNldDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGFsaWduSXRlbXM6ICdmbGV4LWVuZCcsXG4ke2luZGVudH0gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZ2FwOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnbGluZWFyLWdyYWRpZW50KDE4MGRlZywgcmdiYSgxNSwgMjMsIDQyLCAwLjEyKSAwJSwgcmdiYSgxNSwgMjMsIDQyLCAwLjcpIDEwMCUpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBhcmlhLWhpZGRlbj1cInRydWVcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgd2lkdGg6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgaGVpZ2h0OiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI0KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tkcm9wRmlsdGVyOiAnYmx1cigxMHB4KScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgICAgd2lkdGg6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgaGVpZ2h0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIG1hcmdpbkxlZnQ6ICc0cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlclRvcDogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJMZWZ0OiAnMTRweCBzb2xpZCAjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWluSGVpZ2h0OiAnMzJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIHBhZGRpbmc6ICc2cHggMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC41OCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250U2l6ZTogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250V2VpZ2h0OiA2MDAsXG4ke2luZGVudH0gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6ICcwLjAyZW0nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7d2lzdGlhSWR9XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICk7XG4ke2luZGVudH0gIH0pKCl9XG4ke2luZGVudH08L0ZsZXg+YDtcblxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgLy8gRm9yIGxpbmtzLCB1c2UgTGlua0NvbnRyb2wgd2hpY2ggcHJvdmlkZXMgaW50ZXJuYWwgcGFnZSBzZWFyY2ggYW5kIFVSTCB2YWxpZGF0aW9uXG4gICAgICBjb25zdCBsaW5rSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIHVybDogdmFsdWUudXJsIHx8ICcnLCBcbiAgICAgICAgbGFiZWw6IHZhbHVlLnRpdGxlIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuICAgICAgICBvcGVuc0luTmV3VGFiOiB2YWx1ZS5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4gICAgICB9YCk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnTGluayBUZXh0JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBoaWRlTGFiZWxGcm9tVmlzaW9uPXt0cnVlfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBsYWJlbDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8udXJsIHx8ICcnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtsaW5rSGFuZGxlcn19XG4ke2luZGVudH0gICAgICBzZXR0aW5ncz17W1xuJHtpbmRlbnR9ICAgICAgICB7IGlkOiAnb3BlbnNJbk5ld1RhYicsIHRpdGxlOiBfXygnT3BlbiBpbiBuZXcgdGFiJywgJ2hhbmRvZmYnKSB9XG4ke2luZGVudH0gICAgICBdfVxuJHtpbmRlbnR9ICAgICAgc2hvd1N1Z2dlc3Rpb25zPXt0cnVlfVxuJHtpbmRlbnR9ICAgICAgc3VnZ2VzdGlvbnNRdWVyeT17eyB0eXBlOiAncG9zdCcsIHN1YnR5cGU6ICdhbnknIH19XG4ke2luZGVudH0gICAgLz5cbiR7aW5kZW50fSAgPC9kaXY+XG4ke2luZGVudH08L2Rpdj5gO1xuXG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIC8vIEZvciBidXR0b25zLCBwcm92aWRlIGxhYmVsIGZpZWxkIGFuZCBocmVmIGZpZWxkIHdpdGggbGluayBwaWNrZXJcbiAgICAgIC8vIEJ1dHRvbiBwcm9wZXJ0aWVzOiBsYWJlbCwgaHJlZiwgdGFyZ2V0LCByZWwsIGRpc2FibGVkXG4gICAgICBjb25zdCBidXR0b25IYW5kbGVyID0gb25DaGFuZ2VIYW5kbGVyKGB7IFxuICAgICAgICAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBcbiAgICAgICAgaHJlZjogdmFsdWUudXJsIHx8ICcjJywgXG4gICAgICAgIHRhcmdldDogdmFsdWUub3BlbnNJbk5ld1RhYiA/ICdfYmxhbmsnIDogJycsXG4gICAgICAgIHJlbDogdmFsdWUub3BlbnNJbk5ld1RhYiA/ICdub29wZW5lciBub3JlZmVycmVyJyA6ICcnXG4gICAgICB9YCk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnQnV0dG9uIExhYmVsJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBoaWRlTGFiZWxGcm9tVmlzaW9uPXt0cnVlfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBsYWJlbDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8uaHJlZiB8fCAnIycsIFxuJHtpbmRlbnR9ICAgICAgICB0aXRsZTogJHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJycsXG4ke2luZGVudH0gICAgICAgIG9wZW5zSW5OZXdUYWI6ICR7dmFsdWVBY2Nlc3Nvcn0/LnRhcmdldCA9PT0gJ19ibGFuaydcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke2J1dHRvbkhhbmRsZXJ9fVxuJHtpbmRlbnR9ICAgICAgc2V0dGluZ3M9e1tcbiR7aW5kZW50fSAgICAgICAgeyBpZDogJ29wZW5zSW5OZXdUYWInLCB0aXRsZTogX18oJ09wZW4gaW4gbmV3IHRhYicsICdoYW5kb2ZmJykgfVxuJHtpbmRlbnR9ICAgICAgXX1cbiR7aW5kZW50fSAgICAgIHNob3dTdWdnZXN0aW9ucz17dHJ1ZX1cbiR7aW5kZW50fSAgICAgIHN1Z2dlc3Rpb25zUXVlcnk9e3sgdHlwZTogJ3Bvc3QnLCBzdWJ0eXBlOiAnYW55JyB9fVxuJHtpbmRlbnR9ICAgIC8+XG4ke2luZGVudH0gIDwvZGl2PlxuJHtpbmRlbnR9ICA8VG9nZ2xlQ29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnRGlzYWJsZWQnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0/LmRpc2FibGVkIHx8IGZhbHNlfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIGRpc2FibGVkOiB2YWx1ZSB9YCl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9PC9kaXY+YDtcblxuICAgIGNhc2UgJ3NlbGVjdCc6IHtcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKHByb3BlcnR5Lm9wdGlvbnMpLm1hcChvcHQgPT5cbiAgICAgICAgYHsgbGFiZWw6ICcke29wdC5sYWJlbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9JywgdmFsdWU6ICcke29wdC52YWx1ZX0nIH1gXG4gICAgICApLmpvaW4oJywgJyk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxTZWxlY3RDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb3B0aW9ucz17WyR7b3B0aW9uc31dfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG4gICAgfVxuXG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgLy8gSGFuZGxlIHNpbXBsZSBzdHJpbmcgYXJyYXlzIHdpdGggYSByZXBlYXRhYmxlIGxpc3QgY29udHJvbFxuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHNpbXBsZSB0eXBlIGFycmF5IChzdHJpbmcsIG51bWJlciwgZXRjLikgdnMgb2JqZWN0IGFycmF5XG4gICAgICBjb25zdCBpdGVtVHlwZSA9IHByb3BlcnR5Lml0ZW1zPy50eXBlO1xuICAgICAgaWYgKCFwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyAmJiAoaXRlbVR5cGUgPT09ICdzdHJpbmcnIHx8ICFpdGVtVHlwZSkpIHtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBsaXN0IGNvbnRyb2wgZm9yIHN0cmluZyBhcnJheXNcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtpbmRlbnR9ICAgIHsoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkubWFwKChsaXN0SXRlbSwgbGlzdEluZGV4KSA9PiAoXG4ke2luZGVudH0gICAgICA8RmxleCBrZXk9e2xpc3RJbmRleH0gZ2FwPXsyfSBhbGlnbj1cImNlbnRlclwiPlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2IHN0eWxlPXt7IGZsZXg6IDEgfX0+XG4ke2luZGVudH0gICAgICAgICAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgICAgICAgICB2YWx1ZT17bGlzdEl0ZW0gfHwgJyd9XG4ke2luZGVudH0gICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pXTtcbiR7aW5kZW50fSAgICAgICAgICAgICAgbmV3TGlzdFtsaXN0SW5kZXhdID0gdmFsdWU7XG4ke2luZGVudH0gICAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIHBsYWNlaG9sZGVyPXtfXygnRW50ZXIgaXRlbS4uLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwiYXJyb3ctdXAtYWx0MlwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdNb3ZlIHVwJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBpZiAobGlzdEluZGV4ID09PSAwKSByZXR1cm47XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKV07XG4ke2luZGVudH0gICAgICAgICAgICBbbmV3TGlzdFtsaXN0SW5kZXhdLCBuZXdMaXN0W2xpc3RJbmRleCAtIDFdXSA9IFtuZXdMaXN0W2xpc3RJbmRleCAtIDFdLCBuZXdMaXN0W2xpc3RJbmRleF1dO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBkaXNhYmxlZD17bGlzdEluZGV4ID09PSAwfVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwiYXJyb3ctZG93bi1hbHQyXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ01vdmUgZG93bicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbGlzdCA9ICR7dmFsdWVBY2Nlc3Nvcn0gfHwgW107XG4ke2luZGVudH0gICAgICAgICAgICBpZiAobGlzdEluZGV4ID49IGxpc3QubGVuZ3RoIC0gMSkgcmV0dXJuO1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi5saXN0XTtcbiR7aW5kZW50fSAgICAgICAgICAgIFtuZXdMaXN0W2xpc3RJbmRleF0sIG5ld0xpc3RbbGlzdEluZGV4ICsgMV1dID0gW25ld0xpc3RbbGlzdEluZGV4ICsgMV0sIG5ld0xpc3RbbGlzdEluZGV4XV07XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGRpc2FibGVkPXtsaXN0SW5kZXggPj0gKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLmxlbmd0aCAtIDF9XG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJ0cmFzaFwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSAoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkuZmlsdGVyKChfLCBpKSA9PiBpICE9PSBsaXN0SW5kZXgpO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICApKX1cbiR7aW5kZW50fSAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLCAnJ107XG4ke2luZGVudH0gICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIHZhcmlhbnQ9XCJ0ZXJ0aWFyeVwiXG4ke2luZGVudH0gICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgID5cbiR7aW5kZW50fSAgICAgIHtfXygnQWRkIEl0ZW0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICA8L0ZsZXg+XG4ke2luZGVudH08L2Rpdj5gO1xuICAgICAgfVxuICAgICAgLy8gRm9yIG9iamVjdCBhcnJheXMsIGZhbGwgdGhyb3VnaCB0byBkZWZhdWx0ICh0aGVzZSBzaG91bGQgYmUgaGFuZGxlZCBieSBnZW5lcmF0ZUFycmF5Q29udHJvbCBhdCB0b3AgbGV2ZWwpXG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKHByb3BlcnR5LnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkQ29udHJvbHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0eS5wcm9wZXJ0aWVzKVxuICAgICAgICAgIC5tYXAoKFtuZXN0ZWRLZXksIG5lc3RlZFByb3BdKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXN0ZWRDb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IGAke3ZhbHVlQWNjZXNzb3J9Py4ke25lc3RlZEtleX1gLFxuICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWwpID0+IG9uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCAke25lc3RlZEtleX06ICR7dmFsfSB9YCksXG4gICAgICAgICAgICAgIGluZGVudDogaW5kZW50ICsgJyAgJ1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChuZXN0ZWRLZXksIG5lc3RlZFByb3AsIG5lc3RlZENvbnRleHQpO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke25lc3RlZENvbnRyb2xzfVxuJHtpbmRlbnR9PC9GbGV4PmA7XG4gICAgICB9XG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGAke2luZGVudH08VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYXJyYXkgKHJlcGVhdGVyKSBjb250cm9sIHVzaW5nIDEwdXAgUmVwZWF0ZXIgY29tcG9uZW50XG4gKiBQcm92aWRlcyBkcmFnLWFuZC1kcm9wIHJlb3JkZXJpbmcgYW5kIGJ1aWx0LWluIGFkZC9yZW1vdmUgZnVuY3Rpb25hbGl0eVxuICovXG5jb25zdCBnZW5lcmF0ZUFycmF5Q29udHJvbCA9IChrZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSwgYXR0ck5hbWU6IHN0cmluZywgbGFiZWw6IHN0cmluZywgaW5kZW50OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcblxuICAvLyBHZW5lcmF0ZSBmaWVsZCBjb250cm9scyB0aGF0IHVzZSBzZXRJdGVtIGZyb20gdGhlIFJlcGVhdGVyIHJlbmRlciBwcm9wXG4gIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgY29uc3QgZmllbGRDb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZSkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx1ZX0gfSlgLFxuICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAgICAgJ1xuICAgIH07XG4gICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGZpZWxkQ29udGV4dCk7XG4gIH0pLmpvaW4oJ1xcbicpO1xuXG4gIC8vIEdldCBhIGRpc3BsYXkgdGl0bGUgZnJvbSB0aGUgZmlyc3QgdGV4dCBmaWVsZCBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIGZpZWxkIGxhYmVsXG4gIGNvbnN0IGZpcnN0VGV4dEZpZWxkID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5maW5kKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAndGV4dCcpO1xuICBjb25zdCB0aXRsZUFjY2Vzc29yID0gZmlyc3RUZXh0RmllbGQgPyBgaXRlbS4ke2ZpcnN0VGV4dEZpZWxkWzBdfSB8fCBgIDogJyc7XG4gIFxuICAvLyBDdXN0b20gYWRkIGJ1dHRvbiB3aXRoIHRlcnRpYXJ5IHN0eWxpbmcsIHBsdXMgaWNvbiwgcmlnaHQgYWxpZ25lZFxuICAvLyBhZGRCdXR0b24gaXMgYSBmdW5jdGlvbiB0aGF0IHJlY2VpdmVzIGFkZEl0ZW0gYW5kIHJldHVybnMgYSBSZWFjdCBlbGVtZW50XG4gIGNvbnN0IGFkZEJ1dHRvbkpzeCA9IGAoYWRkSXRlbSkgPT4gKFxuJHtpbmRlbnR9ICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvbi13cmFwcGVyXCI+XG4ke2luZGVudH0gICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgIHZhcmlhbnQ9XCJ0ZXJ0aWFyeVwiXG4ke2luZGVudH0gICAgICAgIG9uQ2xpY2s9e2FkZEl0ZW19XG4ke2luZGVudH0gICAgICAgIGljb249e1xuJHtpbmRlbnR9ICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+XG4ke2luZGVudH0gICAgICAgICAgICA8cGF0aCBkPVwiTTExIDEyLjVWMTcuNUgxMi41VjEyLjVIMTcuNVYxMUgxMi41VjZIMTFWMTFINlYxMi41SDExWlwiLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3N2Zz5cbiR7aW5kZW50fSAgICAgICAgfVxuJHtpbmRlbnR9ICAgICAgICBjbGFzc05hbWU9XCJyZXBlYXRlci1hZGQtYnV0dG9uXCJcbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAge19fKCdBZGQgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgPC9kaXY+XG4ke2luZGVudH0gIClgO1xuXG4gIHJldHVybiBgJHtpbmRlbnR9PFJlcGVhdGVyIFxuJHtpbmRlbnR9ICBhdHRyaWJ1dGU9XCIke2F0dHJOYW1lfVwiIFxuJHtpbmRlbnR9ICBhbGxvd1Jlb3JkZXJpbmc9e3RydWV9IFxuJHtpbmRlbnR9ICBkZWZhdWx0VmFsdWU9e3t9fVxuJHtpbmRlbnR9ICBhZGRCdXR0b249eyR7YWRkQnV0dG9uSnN4fX1cbiR7aW5kZW50fT5cbiR7aW5kZW50fSAgeyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuJHtpbmRlbnR9ICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbVwiPlxuJHtpbmRlbnR9ICAgICAgPGRldGFpbHMgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fY29sbGFwc2VcIj5cbiR7aW5kZW50fSAgICAgICAgPHN1bW1hcnkgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9faGVhZGVyXCI+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fdGl0bGVcIj57JHt0aXRsZUFjY2Vzc29yfScke2xhYmVsfSd9PC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2FjdGlvbnNcIiBvbkNsaWNrPXsoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKX0+XG4ke2luZGVudH0gICAgICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgICAgIG9uQ2xpY2s9e3JlbW92ZUl0ZW19XG4ke2luZGVudH0gICAgICAgICAgICAgIGljb249e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgICA8cGF0aCBkPVwiTTUgNi41VjE4YTIgMiAwIDAwMiAyaDEwYTIgMiAwIDAwMi0yVjYuNWgtMi41VjE4YS41LjUgMCAwMS0uNS41SDhhLjUuNSAwIDAxLS41LS41VjYuNUg1ek05IDl2OGgxLjVWOUg5em00LjUgMHY4SDE1VjloLTEuNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgICA8cGF0aCBkPVwiTTIwIDVoLTVWMy41QTEuNSAxLjUgMCAwMDEzLjUgMmgtM0ExLjUgMS41IDAgMDA5IDMuNVY1SDR2MS41aDE2VjV6bS02LjUgMGgtM1YzLjVoM1Y1elwiLz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8L3N2Zz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBsYWJlbD17X18oJ1JlbW92ZSBpdGVtJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvc3VtbWFyeT5cbiR7aW5kZW50fSAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19maWVsZHNcIj5cbiR7aW5kZW50fSAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtpdGVtRmllbGRzfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICA8L2RldGFpbHM+XG4ke2luZGVudH0gICAgPC9kaXY+XG4ke2luZGVudH0gICl9XG4ke2luZGVudH08L1JlcGVhdGVyPmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHRoZSBpbnNwZWN0b3IgY29udHJvbCBmb3IgYSB0b3AtbGV2ZWwgcHJvcGVydHlcbiAqIFVzZXMgZ2VuZXJhdGVGaWVsZENvbnRyb2wgd2l0aCBhIHNldEF0dHJpYnV0ZXMgY29udGV4dFxuICovXG5jb25zdCBnZW5lcmF0ZVByb3BlcnR5Q29udHJvbCA9IChrZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSwgaW5kZW50OiBzdHJpbmcgPSAnICAgICAgICAgICcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuXG4gIC8vIEZvciBhcnJheSB0eXBlLCB1c2UgdGhlIHNwZWNpYWxpemVkIGFycmF5IGNvbnRyb2xcbiAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICByZXR1cm4gZ2VuZXJhdGVBcnJheUNvbnRyb2woa2V5LCBwcm9wZXJ0eSwgYXR0ck5hbWUsIGxhYmVsLCBpbmRlbnQpO1xuICB9XG5cbiAgLy8gRm9yIGFsbCBvdGhlciB0eXBlcywgdXNlIHRoZSB1bmlmaWVkIGZpZWxkIGNvbnRyb2wgZ2VuZXJhdG9yXG4gIGNvbnN0IGNvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICB2YWx1ZUFjY2Vzc29yOiBhdHRyTmFtZSxcbiAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZSkgPT4gYHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogJHt2YWx1ZX0gfSlgLFxuICAgIGluZGVudFxuICB9O1xuXG4gIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChrZXksIHByb3BlcnR5LCBjb250ZXh0KTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgZGVmYXVsdCB2YWx1ZSBmb3IgYSBwcm9wZXJ0eSB0eXBlXG4gKi9cbmNvbnN0IGdldERlZmF1bHRWYWx1ZSA9IChmaWVsZFByb3A6IEhhbmRvZmZQcm9wZXJ0eSk6IGFueSA9PiB7XG4gIHN3aXRjaCAoZmllbGRQcm9wLnR5cGUpIHtcbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIHJldHVybiB7IGxhYmVsOiAnJywgdXJsOiAnJywgb3BlbnNJbk5ld1RhYjogZmFsc2UgfTtcbiAgICBjYXNlICdidXR0b24nOlxuICAgICAgcmV0dXJuIHsgbGFiZWw6ICcnLCBocmVmOiAnIycsIHRhcmdldDogJycsIHJlbDogJycsIGRpc2FibGVkOiBmYWxzZSB9O1xuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIHJldHVybiB7IHNyYzogJycsIGFsdDogJycgfTtcbiAgICBjYXNlICd2aWRlbyc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBpZDogJycsIHBvc3RlcjogJycsIHR5cGU6ICcnLCB3aWR0aDogMCwgaGVpZ2h0OiAwLCBtaW1lOiAnJywgbWltZVR5cGU6ICcnIH07XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChmaWVsZFByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZFByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgICBuZXN0ZWRbbmVzdGVkS2V5XSA9IGdldERlZmF1bHRWYWx1ZShuZXN0ZWRQcm9wKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVzdGVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHt9O1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gMDtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gW107XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBoZWxwZXIgZnVuY3Rpb25zIGZvciBhcnJheSBwcm9wZXJ0aWVzXG4gKiBOb3RlOiBXaXRoIHRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCwgd2Ugbm8gbG9uZ2VyIG5lZWQgY3VzdG9tIGFkZC91cGRhdGUvcmVtb3ZlL21vdmUgZnVuY3Rpb25zXG4gKiBUaGUgUmVwZWF0ZXIgaGFuZGxlcyBhbGwgb2YgdGhpcyBpbnRlcm5hbGx5IHZpYSBpdHMgcmVuZGVyIHByb3BcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IHN0cmluZyA9PiB7XG4gIC8vIFRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCBoYW5kbGVzIGFycmF5IG1hbmlwdWxhdGlvbiBpbnRlcm5hbGx5XG4gIC8vIE5vIGN1c3RvbSBoZWxwZXIgZnVuY3Rpb25zIGFyZSBuZWVkZWRcbiAgcmV0dXJuICcnO1xufTtcblxuXG4vKipcbiAqIERldGVybWluaXN0aWMgaGFzaCBvZiBhIHN0cmluZyB0byBhIG51bWJlciBpbiBbMCwgbWF4KS5cbiAqL1xuY29uc3QgaGFzaFN0cmluZyA9IChzdHI6IHN0cmluZywgbWF4OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICBsZXQgaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaCA9ICgoaCA8PCA1KSAtIGggKyBzdHIuY2hhckNvZGVBdChpKSkgfCAwO1xuICB9XG4gIHJldHVybiAoKGggJSBtYXgpICsgbWF4KSAlIG1heDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYW4gU1ZHIGljb24gZWxlbWVudCBzdHJpbmcgZm9yIHVzZSBpbiByZWdpc3RlckJsb2NrVHlwZS5cbiAqIENyZWF0ZXMgYSBjb2xvcmVkIHJvdW5kZWQgcmVjdGFuZ2xlIHdpdGggMS0yIGxldHRlciBpbml0aWFscyBkZXJpdmVkXG4gKiBmcm9tIHRoZSBibG9jayB0aXRsZSwgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvciBrZXllZCB0byB0aGUgZ3JvdXAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlU3ZnSWNvbiA9ICh0aXRsZTogc3RyaW5nLCBncm91cDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgR1JPVVBfQ09MT1JTID0gW1xuICAgICcjNUIyMUI2JywgJyMwRTc0OTAnLCAnI0I0NTMwOScsICcjMDQ3ODU3JyxcbiAgICAnI0JFMTIzQycsICcjNDMzOENBJywgJyMwMzY5QTEnLCAnI0ExNjIwNycsXG4gICAgJyMxNTgwM0QnLCAnIzkzMzNFQScsICcjQzI0MTBDJywgJyMxRDRFRDgnLFxuICAgICcjMDU5NjY5JywgJyM3QzNBRUQnLCAnI0RDMjYyNicsICcjMjU2M0VCJyxcbiAgXTtcblxuICBjb25zdCB3b3JkcyA9IHRpdGxlLnNwbGl0KC9bXFxzXy1dKy8pLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3QgaW5pdGlhbHMgPSB3b3Jkcy5sZW5ndGggPj0gMlxuICAgID8gKHdvcmRzWzBdWzBdICsgd29yZHNbMV1bMF0pLnRvVXBwZXJDYXNlKClcbiAgICA6ICh3b3Jkc1swXT8uc3Vic3RyaW5nKDAsIDIpIHx8ICdITycpLnRvVXBwZXJDYXNlKCk7XG5cbiAgY29uc3QgY29sb3IgPSBHUk9VUF9DT0xPUlNbaGFzaFN0cmluZyhncm91cCB8fCB0aXRsZSwgR1JPVVBfQ09MT1JTLmxlbmd0aCldO1xuXG4gIHJldHVybiBgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPlxuICAgICAgPHJlY3QgeD1cIjJcIiB5PVwiMlwiIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHJ4PVwiNFwiIGZpbGw9XCIke2NvbG9yfVwiIC8+XG4gICAgICA8dGV4dCB4PVwiMTJcIiB5PVwiMTYuNVwiIHRleHRBbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwid2hpdGVcIiBmb250U2l6ZT1cIjEwXCIgZm9udEZhbWlseT1cIi1hcHBsZS1zeXN0ZW0sQmxpbmtNYWNTeXN0ZW1Gb250LHNhbnMtc2VyaWZcIiBmb250V2VpZ2h0PVwiNjAwXCI+JHtpbml0aWFsc308L3RleHQ+XG4gICAgPC9zdmc+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgY29tcGxldGUgaW5kZXguanMgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICogQHBhcmFtIGlubmVyQmxvY2tzRmllbGQgLSBUaGUgcmljaHRleHQgZmllbGQgdGhhdCB1c2VzIElubmVyQmxvY2tzLCBvciBudWxsIGlmIG5vbmVcbiAqIEBwYXJhbSBkZXByZWNhdGlvbnNDb2RlIC0gT3B0aW9uYWwgZGVwcmVjYXRpb24gbWlncmF0aW9uIGNvZGVcbiAqIEBwYXJhbSBoYXNTY3JlZW5zaG90IC0gV2hldGhlciBhIHNjcmVlbnNob3QucG5nIGlzIGF2YWlsYWJsZSBmb3IgaW5zZXJ0ZXIgcHJldmlld1xuICovXG5jb25zdCBnZW5lcmF0ZUluZGV4SnMgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgZHluYW1pY0FycmF5Q29uZmlncz86IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPixcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGwsXG4gIGRlcHJlY2F0aW9uc0NvZGU/OiBzdHJpbmcsXG4gIGhhc1NjcmVlbnNob3Q/OiBib29sZWFuXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSB0b0Jsb2NrTmFtZShjb21wb25lbnQuaWQpO1xuICBjb25zdCBwcm9wZXJ0aWVzID0gY29tcG9uZW50LnByb3BlcnRpZXM7XG5cbiAgLy8gaGFzRHluYW1pY0FycmF5cyBpcyB0cnVlIG9ubHkgd2hlbiB0aGVyZSBhcmUgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZmllbGRzIOKAlFxuICAvLyB0aGUgc2ltcGxlciB0eXBlcyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgZG9uJ3QgbmVlZCBEeW5hbWljUG9zdFNlbGVjdG9yLlxuICBjb25zdCBoYXNEeW5hbWljQXJyYXlzID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKFxuICAgICAgICAoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKVxuICAgICAgKVxuICAgIDogZmFsc2U7XG5cbiAgLy8gSGVscGVyIHRvIGNoZWNrIGZvciBhIHR5cGUgaW4gcHJvcGVydGllcywgaW5jbHVkaW5nIG5lc3RlZCBpbiBhcnJheXMvb2JqZWN0c1xuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAodHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2tQcm9wZXJ0eSA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09IHR5cGUpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AucHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgICAgIH1cbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICB9O1xuXG4gIC8vIFRoZSBpbm5lckJsb2Nrc0ZpZWxkIHVzZXMgSW5uZXJCbG9ja3MgKGNvbnRlbnQgc3RvcmVkIGluIHBvc3RfY29udGVudCwgbm90IGFuIGF0dHJpYnV0ZSkuXG4gIC8vIEFsbCBvdGhlciByaWNodGV4dCBmaWVsZHMgYmVjb21lIHN0cmluZyBhdHRyaWJ1dGVzIHdpdGggUmljaFRleHQgZWRpdGluZy5cbiAgY29uc3QgdXNlSW5uZXJCbG9ja3MgPSAhIWlubmVyQmxvY2tzRmllbGQ7XG5cbiAgLy8gR2V0IGFsbCBhdHRyaWJ1dGUgbmFtZXMg4oCTIGV4Y2x1ZGUgaW5uZXJCbG9ja3NGaWVsZCBhbmQgcGFnaW5hdGlvblxuICBjb25zdCBhdHRyTmFtZXMgPSBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoayA9PiBrICE9PSBpbm5lckJsb2Nrc0ZpZWxkICYmIHByb3BlcnRpZXNba10udHlwZSAhPT0gJ3BhZ2luYXRpb24nKVxuICAgIC5tYXAodG9DYW1lbENhc2UpO1xuXG4gIC8vIEluY2x1ZGUgYW55IGF0dHJpYnV0ZSBuYW1lcyByZWZlcmVuY2VkIGluIHRoZSB0ZW1wbGF0ZSBidXQgbWlzc2luZyBmcm9tIEFQSSBwcm9wZXJ0aWVzXG4gIC8vIChlLmcuIGJvZHkgLT4gYmxvY2tCb2R5IHNvIEpTWCBoYXMgYSBkZWZpbmVkIHZhcmlhYmxlIGFuZCBubyBSZWZlcmVuY2VFcnJvcikuXG4gIC8vIFNraXAgdGhlIGlubmVyQmxvY2tzRmllbGQg4oCUIGl0cyBjb250ZW50IGlzIHN0b3JlZCB2aWEgSW5uZXJCbG9ja3MsIG5vdCBhcyBhbiBhdHRyaWJ1dGUuXG4gIGNvbnN0IGlubmVyQmxvY2tzQXR0ck5hbWUgPSBpbm5lckJsb2Nrc0ZpZWxkID8gdG9DYW1lbENhc2UoaW5uZXJCbG9ja3NGaWVsZCkgOiBudWxsO1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgZ2V0VGVtcGxhdGVSZWZlcmVuY2VkQXR0cmlidXRlTmFtZXMoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgaWYgKCFhdHRyTmFtZXMuaW5jbHVkZXMobmFtZSkgJiYgbmFtZSAhPT0gaW5uZXJCbG9ja3NBdHRyTmFtZSkgYXR0ck5hbWVzLnB1c2gobmFtZSk7XG4gIH1cbiAgXG4gIC8vIEFkZCBkeW5hbWljIGFycmF5IGF0dHJpYnV0ZSBuYW1lcyBiYXNlZCBvbiBjb25maWcgdHlwZVxuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVRheG9ub215YCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBvc3RUeXBlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UXVlcnlBcmdzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVJlbmRlck1vZGVgKTtcbiAgICAgICAgaWYgKChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uKSB7XG4gICAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWRgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIERldGVybWluZSB3aGljaCBjb21wb25lbnRzIHdlIG5lZWQgdG8gaW1wb3J0XG4gIGNvbnN0IG5lZWRzTWVkaWFVcGxvYWQgPSBoYXNQcm9wZXJ0eVR5cGUoJ2ltYWdlJyk7XG4gIGNvbnN0IG5lZWRzUmFuZ2VDb250cm9sID0gaGFzT3BhY2l0eVJhbmdlRmllbGQocHJvcGVydGllcyk7XG4gIGNvbnN0IG5lZWRzTnVtYmVyQ29udHJvbCA9IGhhc05vbk9wYWNpdHlOdW1iZXJGaWVsZChwcm9wZXJ0aWVzKTtcbiAgY29uc3QgbmVlZHNUb2dnbGVDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcbiAgY29uc3QgbmVlZHNTZWxlY3RDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdzZWxlY3QnKTtcbiAgY29uc3QgaGFzQXJyYXlQcm9wcyA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+IHAudHlwZSA9PT0gJ2FycmF5Jyk7XG4gIGNvbnN0IGhhc09iamVjdFByb3BzID0gaGFzUHJvcGVydHlUeXBlKCdvYmplY3QnKTtcblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICB9XG4gIC8vIElubmVyQmxvY2tzIGZvciB0aGUgZGVzaWduYXRlZCByaWNodGV4dCBjb250ZW50IGFyZWFcbiAgaWYgKHVzZUlubmVyQmxvY2tzKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cbiAgLy8gTGlua0NvbnRyb2wgZm9yIGxpbmsvYnV0dG9uIGZpZWxkcyAod2hlbiBub3QgdXNpbmcgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQpXG4gIGNvbnN0IG5lZWRzTGlua0NvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuXG4gIGNvbnN0IGhhc0JyZWFkY3J1bWJzQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzVGF4b25vbXlBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNUYXhvbm9teUNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICBpZiAobmVlZHNOdW1iZXJDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ051bWJlckNvbnRyb2wnKTtcbiAgLy8gVG9nZ2xlQ29udHJvbDogb25seSBmb3IgYm9vbGVhbi9idXR0b24gcHJvcGVydHkgZmllbGRzIOKAlCBzcGVjaWFsIGFycmF5IHR5cGVzIHVzZSBzaGFyZWQgY29tcG9uZW50c1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgLy8gU2VsZWN0Q29udHJvbDogb25seSBmb3Igc2VsZWN0IHByb3BlcnR5IGZpZWxkcyBvciBEeW5hbWljUG9zdFNlbGVjdG9yIChwb3N0cykg4oCUIHRheG9ub215IGhhbmRsZWQgYnkgVGF4b25vbXlTZWxlY3RvclxuICBpZiAobmVlZHNTZWxlY3RDb250cm9sIHx8IGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU2VsZWN0Q29udHJvbCcpO1xuICAvLyBTcGlubmVyIGZvciBkeW5hbWljIGFycmF5IGxvYWRpbmcgc3RhdGUgaW4gZWRpdG9yIHByZXZpZXdcbiAgaWYgKGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuICAvLyBUZXh0YXJlYUNvbnRyb2w6IG5lZWRlZCB3aGVuIHJpY2h0ZXh0IGZpZWxkcyBhcHBlYXIgaW5zaWRlIGFycmF5IGl0ZW1zXG4gIGNvbnN0IGhhc1JpY2h0ZXh0SW5BcnJheSA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmIHAuaXRlbXM/LnByb3BlcnRpZXMgJiZcbiAgICBPYmplY3QudmFsdWVzKHAuaXRlbXMucHJvcGVydGllcykuc29tZShpcCA9PiBpcC50eXBlID09PSAncmljaHRleHQnKVxuICApO1xuICBpZiAoaGFzUmljaHRleHRJbkFycmF5KSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RleHRhcmVhQ29udHJvbCcpO1xuXG4gIGNvbXBvbmVudEltcG9ydHMucHVzaCgnRmxleCcpO1xuXG4gIC8vIDEwdXAgYmxvY2stY29tcG9uZW50cyBpbXBvcnRzXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIHdoZW4gdGhlcmUgYXJlIG5vbi1zZXJ2ZXItcmVuZGVyZWQgYXJyYXkgZmllbGRzIGluIHRoZSBzaWRlYmFyXG4gIC8vICh0YXhvbm9teS9icmVhZGNydW1icy9wYWdpbmF0aW9uIGFycmF5cyB1c2Ugc2hhcmVkIGNvbXBvbmVudHMgdGhhdCBpbXBvcnQgUmVwZWF0ZXIgdGhlbXNlbHZlcylcbiAgY29uc3QgaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmICghZHluYW1pY0FycmF5Q29uZmlncz8uW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICk7XG4gIGNvbnN0IHRlblVwSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGhhc05vblNwZWNpYWxBcnJheVByb3BzKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhcnJheSBoZWxwZXJzXG4gIGNvbnN0IGFycmF5SGVscGVycyA9IGdlbmVyYXRlQXJyYXlIZWxwZXJzKHByb3BlcnRpZXMpO1xuXG4gIC8vIEdlbmVyYXRlIEpTWCBwcmV2aWV3IGZyb20gaGFuZGxlYmFycyB0ZW1wbGF0ZVxuICAvLyBUaGlzIG11c3QgaGFwcGVuIGJlZm9yZSBwYW5lbCBnZW5lcmF0aW9uIHNvIHdlIGtub3cgd2hpY2ggZmllbGRzIGhhdmUgaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgcHJldmlld1Jlc3VsdCA9IGdlbmVyYXRlSnN4UHJldmlldyhcbiAgICBjb21wb25lbnQuY29kZSxcbiAgICBwcm9wZXJ0aWVzLFxuICAgIGNvbXBvbmVudC5pZCxcbiAgICBjb21wb25lbnQudGl0bGUsXG4gICAgaW5uZXJCbG9ja3NGaWVsZFxuICApO1xuICBsZXQgcHJldmlld0pzeCA9IHByZXZpZXdSZXN1bHQuanN4O1xuICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgLy8gRGV0ZWN0IGlmIHByZXZpZXcgdXNlcyBIYW5kb2ZmTGlua0ZpZWxkIChsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZylcbiAgY29uc3QgcHJldmlld1VzZXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuXG4gIC8vIEdlbmVyYXRlIHBhbmVsIGJvZGllcyBmb3IgZWFjaCBwcm9wZXJ0eVxuICBjb25zdCBwYW5lbHM6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICAvLyByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgLy8gcGFnaW5hdGlvbiBpcyBhdXRvLWdlbmVyYXRlZCBmcm9tIHF1ZXJ5IHJlc3VsdHMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcblxuICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIGlubGluZS1lZGl0YWJsZSBvbiB0aGUgY2FudmFzICh0ZXh0LCBpbWFnZSwgbGluaywgYnV0dG9uXG4gICAgLy8gd3JhcHBlZCBpbiB7eyNmaWVsZH19KSDigJMgdGhleSBkb24ndCBuZWVkIHNpZGViYXIgY29udHJvbHMuXG4gICAgLy8gQXJyYXkgZmllbGRzIGFyZSBhbHdheXMga2VwdDogdGhleSBuZWVkIHNpZGViYXIgVUkgZm9yIG1hbnVhbC9keW5hbWljIHRvZ2dsZVxuICAgIC8vIGFuZCBmb3IgYWRkaW5nL3JlbW92aW5nIGl0ZW1zLCBldmVuIHdoZW4gdGhlaXIgY2hpbGQgZmllbGRzIGFyZSBpbmxpbmUtZWRpdGFibGUuXG4gICAgaWYgKGlubGluZUVkaXRhYmxlRmllbGRzLmhhcyhrZXkpICYmIHByb3BlcnR5LnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgZHluYW1pYyBhcnJheSBmaWVsZFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIGR5bmFtaWNDb25maWcpIHtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIEJyZWFkY3J1bWJzOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gQnJlYWRjcnVtYnMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxCcmVhZGNydW1ic1NlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBUYXhvbm9teTogc2hhcmVkIGNvbXBvbmVudCB3aXRoIEF1dG8gLyBNYW51YWwgdGFic1xuICAgICAgICBjb25zdCB0YXhvbm9teU9wdGlvbnMgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdCwgdmFsdWU6IHQgfSkpO1xuICAgICAgICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcHMpLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICBpbmRlbnQ6ICcgICAgICAgICAgICAgICAgJyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGN0eCk7XG4gICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJylcbiAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnTGFiZWwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS5sYWJlbCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgbGFiZWw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+XG4gICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnVVJMJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0udXJsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCB1cmw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+YDtcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBUYXhvbm9teSAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFRheG9ub215U2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgZGVmYXVsdFRheG9ub215PVwiJHtkZWZhdWx0VGF4b25vbXl9XCJcbiAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93ICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgIDw+XG4ke2l0ZW1GaWVsZHN9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gUGFnaW5hdGlvbjogc2hhcmVkIGNvbXBvbmVudCB3aXRoIHNpbmdsZSB2aXNpYmlsaXR5IHRvZ2dsZVxuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFBhZ2luYXRpb24gKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxQYWdpbmF0aW9uU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUG9zdHMgKER5bmFtaWNBcnJheUNvbmZpZyk6IGZ1bGwgRHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICBjb25zdCBkZWZhdWx0TW9kZSA9IGR5bmFtaWNDb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgIGNvbnN0IGFkdmFuY2VkRmllbGRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBvcHRpb25zPzogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+OyBkZWZhdWx0PzogYW55IH0+ID0gW107XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gaXRlbU92ZXJyaWRlc0NvbmZpZyAobGVnYWN5KVxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCBjXSBvZiBPYmplY3QuZW50cmllcyhpdGVtT3ZlcnJpZGVzQ29uZmlnKSBhcyBBcnJheTxbc3RyaW5nLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZ10+KSB7XG4gICAgICAgICAgaWYgKGMubW9kZSA9PT0gJ3VpJykge1xuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWUsIGxhYmVsOiBjLmxhYmVsLCB0eXBlOiAnc2VsZWN0Jywgb3B0aW9uczogbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhjLm9wdGlvbnMpLCBkZWZhdWx0OiBjLmRlZmF1bHQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gZmllbGRNYXBwaW5nIHdpdGggdHlwZTogXCJtYW51YWxcIiDigJQgZGVyaXZlIGNvbnRyb2wgdHlwZSBmcm9tIGl0ZW0gcHJvcGVydGllc1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gZHluYW1pY0NvbmZpZy5maWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBtYXBwaW5nVmFsdWUgPT09ICdvYmplY3QnICYmIG1hcHBpbmdWYWx1ZSAhPT0gbnVsbCAmJiAobWFwcGluZ1ZhbHVlIGFzIGFueSkudHlwZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHRvcEtleSA9IGZpZWxkUGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTGFiZWwgPSBpdGVtUHJvcD8ubmFtZSB8fCB0b1RpdGxlQ2FzZSh0b3BLZXkpO1xuICAgICAgICAgICAgbGV0IGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGxldCBkZWZhdWx0VmFsOiBhbnkgPSBpdGVtUHJvcD8uZGVmYXVsdCA/PyAnJztcbiAgICAgICAgICAgIGlmIChpdGVtUHJvcCkge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnc2VsZWN0JztcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0b2dnbGUnO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gZmFsc2U7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnbnVtYmVyJztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IDA7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYWdpbmF0aW9uVG9nZ2xlID0gZHluYW1pY0NvbmZpZy5wYWdpbmF0aW9uXG4gICAgICAgICAgPyBgXG4gICAgICAgICAgICAgICAgPFRvZ2dsZUNvbnRyb2xcbiAgICAgICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyBQYWdpbmF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9eyR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQgPz8gdHJ1ZX1cbiAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkOiB2YWx1ZSB9KX1cbiAgICAgICAgICAgICAgICAvPmBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIER5bmFtaWMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgc291cmNlOiAke2F0dHJOYW1lfVNvdXJjZSB8fCAnJHtkZWZhdWx0TW9kZX0nLFxuICAgICAgICAgICAgICAgIHBvc3RUeXBlOiAke2F0dHJOYW1lfVBvc3RUeXBlLFxuICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHthdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3N0czogJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgIGl0ZW1PdmVycmlkZXM6ICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICBvbkNoYW5nZT17KG5leHRWYWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7XG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Tb3VyY2U6IG5leHRWYWx1ZS5zb3VyY2UsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9UXVlcnlBcmdzOiB7IC4uLm5leHRWYWx1ZS5xdWVyeUFyZ3MsIHBvc3RfdHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzOiBuZXh0VmFsdWUuc2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICBvcHRpb25zPXt7XG4gICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgbWF4SXRlbXM6ICR7ZHluYW1pY0NvbmZpZy5tYXhJdGVtcyA/PyAyMH0sXG4gICAgICAgICAgICAgICAgdGV4dERvbWFpbjogJ2hhbmRvZmYnLFxuICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICBzaG93RXhjbHVkZUN1cnJlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHM6ICR7SlNPTi5zdHJpbmdpZnkoYWR2YW5jZWRGaWVsZHMpfVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz4ke3BhZ2luYXRpb25Ub2dnbGV9XG4gICAgICAgICAgICB7JHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnICYmIChcbiAgICAgICAgICAgICAgPD5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RhbmRhcmQgcGFuZWwgKG5vbi1keW5hbWljKVxuICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWRkIEhhbmRvZmYgZGVzaWduIHN5c3RlbSBsaW5rcyBwYW5lbFxuICBjb25zdCBkZXNpZ25TeXN0ZW1QYW5lbCA9IFtcbiAgICAnICAgICAgICAgIHsvKiBEZXNpZ24gU3lzdGVtIExpbmtzICovfScsXG4gICAgJyAgICAgICAgICB7KG1ldGFkYXRhLl9faGFuZG9mZj8uaGFuZG9mZlVybCB8fCBtZXRhZGF0YS5fX2hhbmRvZmY/LmZpZ21hVXJsKSAmJiAoJyxcbiAgICAnICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oXFwnRGVzaWduIFN5c3RlbVxcJywgXFwnaGFuZG9mZlxcJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+JyxcbiAgICAnICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PicsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsICYmICgnLFxuICAgICcgICAgICAgICAgICAgICAgICA8QnV0dG9uJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB2YXJpYW50PVwic2Vjb25kYXJ5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGhyZWY9e21ldGFkYXRhLl9faGFuZG9mZi5oYW5kb2ZmVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cInZpc2liaWxpdHlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IFxcJzEwMCVcXCcsIGp1c3RpZnlDb250ZW50OiBcXCdjZW50ZXJcXCcgfX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA+JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB7X18oXFwnVmlldyBpbiBIYW5kb2ZmXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgICAge21ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmZpZ21hVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdPcGVuIGluIEZpZ21hXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgIDwvRmxleD4nLFxuICAgICcgICAgICAgICAgICA8L1BhbmVsQm9keT4nLFxuICAgICcgICAgICAgICAgKX0nLFxuICBdLmpvaW4oJ1xcbicpO1xuICBwYW5lbHMucHVzaChkZXNpZ25TeXN0ZW1QYW5lbCk7XG5cbiAgLy8gRHluYW1pYyBhcnJheSByZXNvbHV0aW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cyk6IGZ1bGwgdXNlU2VsZWN0IHJlc29sdXRpb25cbiAgLy8gQnJlYWRjcnVtYnM6IGxpdmUgZmV0Y2ggdmlhIFJFU1QgZW5kcG9pbnRcbiAgLy8gVGF4b25vbXkgKGF1dG8gbW9kZSk6IGxpdmUgZmV0Y2ggdmlhIHVzZVNlbGVjdCB3aXRoIGNvcmUtZGF0YVxuICAvLyBQYWdpbmF0aW9uOiBzZXJ2ZXItcmVuZGVyZWQgb25seSAoc3R1YiB2YXJpYWJsZSlcbiAgbGV0IGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlID0gJyc7XG4gIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gZmllbGRQcm9wPy5pdGVtcz8ucHJvcGVydGllcztcblxuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgeyBzZXRQcmV2aWV3JHtjYXB9KFtdKTsgcmV0dXJuOyB9XG4gICAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHNldFByZXZpZXcke2NhcH0oW10pKTtcbiAgICB9LCBbJHthdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcbiAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKc1xuICAgICAgICAgID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgICAoc2VsZWN0KSA9PiB7XG4gICAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICAgIGlmICgke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke2F0dHJOYW1lfSB8fCBbXTtcbiAgICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGF4b25vbXkgPSAke2F0dHJOYW1lfVRheG9ub215IHx8ICcke2NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgICAgY29uc3QgcmVzdEJhc2UgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0VGF4b25vbXkodGF4b25vbXkpPy5yZXN0X2Jhc2U7XG4gICAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2NvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICAgIGlmICghdGVybXMpIHJldHVybiBbXTtcbiAgICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgICAgfSxcbiAgICAgIFske2F0dHJOYW1lfUVuYWJsZWQsICR7YXR0ck5hbWV9U291cmNlLCAke2F0dHJOYW1lfVRheG9ub215LCBKU09OLnN0cmluZ2lmeSgke2F0dHJOYW1lfSB8fCBbXSldXG4gICAgKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkfFNvdXJjZXxUYXhvbm9teSlgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9ID0gW107IC8vIFBhZ2luYXRpb24gcmVuZGVycyBvbiB0aGUgZnJvbnRlbmRcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgIGNvbnN0IHByZXZpZXdWYXJOYW1lID0gYHByZXZpZXcke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgcmVzb2x2aW5nRmxhZ3MucHVzaChyZXNvbHZpbmdWYXJOYW1lKTtcbiAgICAgIGNvbnN0IHNvdXJjZUF0dHIgPSBgJHthdHRyTmFtZX1Tb3VyY2VgO1xuICAgICAgY29uc3QgcXVlcnlBcmdzQXR0ciA9IGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2A7XG4gICAgICBjb25zdCBwb3N0VHlwZUF0dHIgPSBgJHthdHRyTmFtZX1Qb3N0VHlwZWA7XG4gICAgICBjb25zdCBzZWxlY3RlZFBvc3RzQXR0ciA9IGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgO1xuICAgICAgY29uc3QgZmllbGRNYXBwaW5nQXR0ciA9IGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2A7XG4gICAgICBjb25zdCBpdGVtT3ZlcnJpZGVzQXR0ciA9IGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgO1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBzdG9yZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKTtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdxdWVyeScpIHtcbiAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHtwb3N0VHlwZUF0dHJ9IHx8ICdwb3N0JztcbiAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2NvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgIG9yZGVyYnk6IHF1ZXJ5QXJncy5vcmRlcmJ5IHx8ICdkYXRlJyxcbiAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgIHN0YXR1czogJ3B1Ymxpc2gnLFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHF1ZXJ5QXJncy50YXhfcXVlcnkgJiYgcXVlcnlBcmdzLnRheF9xdWVyeS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHF1ZXJ5QXJncy50YXhfcXVlcnkuZm9yRWFjaCgodHEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCF0cS50YXhvbm9teSB8fCAhdHEudGVybXMgfHwgIXRxLnRlcm1zLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgICAgICAgICBjb25zdCBwYXJhbSA9IHRxLnRheG9ub215ID09PSAnY2F0ZWdvcnknID8gJ2NhdGVnb3JpZXMnIDogdHEudGF4b25vbXkgPT09ICdwb3N0X3RhZycgPyAndGFncycgOiB0cS50YXhvbm9teTtcbiAgICAgICAgICAgICAgYXJnc1twYXJhbV0gPSB0cS50ZXJtcy5qb2luKCcsJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgIGlmIChyZWNvcmRzID09PSBudWxsIHx8IHJlY29yZHMgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgIG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9ICR7c2VsZWN0ZWRQb3N0c0F0dHJ9IHx8IFtdO1xuICAgICAgICAgIGlmICghc2VsZWN0ZWQubGVuZ3RoKSByZXR1cm4gW107XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge307XG4gICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcmVjID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkKCdwb3N0VHlwZScsIHNlbC50eXBlIHx8ICdwb3N0Jywgc2VsLmlkKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0sXG4gICAgICBbJHtzb3VyY2VBdHRyfSwgJHtwb3N0VHlwZUF0dHJ9LCBKU09OLnN0cmluZ2lmeSgke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW10pLCBKU09OLnN0cmluZ2lmeSgke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge30pXVxuICAgICk7XG4gICAgY29uc3QgJHtwcmV2aWV3VmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7YXR0ck5hbWV9ID8/IFtdKTtcbiAgICBjb25zdCAke3Jlc29sdmluZ1Zhck5hbWV9ID0gJHtzb3VyY2VBdHRyfSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgLy8gVXNlIHByZXZpZXcgdmFyaWFibGUgaW4gdGhlIGdlbmVyYXRlZCBwcmV2aWV3IEpTWCBzbyB0aGUgZWRpdG9yIHNob3dzIHF1ZXJ5L3NlbGVjdCByZXN1bHRzXG4gICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiYCwgJ2cnKTtcbiAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgIH1cbiAgICBpZiAocmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMCkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IGlzUHJldmlld0xvYWRpbmcgPSAke3Jlc29sdmluZ0ZsYWdzLmpvaW4oJyB8fCAnKX07XG5gO1xuICAgIH1cbiAgICAvLyBXaGVuIHByZXZpZXcgSlNYIHJlZmVyZW5jZXMgcGFnaW5hdGlvbiAoZnJvbSBIQlMpIGJ1dCBwYWdpbmF0aW9uIGlzIG9ubHkgYnVpbHQgc2VydmVyLXNpZGUsXG4gICAgLy8gZGVmaW5lIGl0IGluIHRoZSBlZGl0IHNvIHRoZSBlZGl0b3IgZG9lc24ndCB0aHJvdyBSZWZlcmVuY2VFcnJvci5cbiAgICBjb25zdCBwcmV2aWV3VXNlc1BhZ2luYXRpb24gPSAvXFxicGFnaW5hdGlvblxcYi8udGVzdChwcmV2aWV3SnN4KTtcbiAgICBjb25zdCBhbnlDb25maWdIYXNQYWdpbmF0aW9uID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYykgJiYgISEoYyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pXG4gICAgICA6IGZhbHNlO1xuICAgIGlmIChwcmV2aWV3VXNlc1BhZ2luYXRpb24gJiYgYW55Q29uZmlnSGFzUGFnaW5hdGlvbiAmJiAhZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUuaW5jbHVkZXMoJ2NvbnN0IHBhZ2luYXRpb24nKSkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSBgICAgIGNvbnN0IHBhZ2luYXRpb24gPSBbXTsgLy8gRWRpdG9yOiBwYWdpbmF0aW9uIGlzIGJ1aWx0IHNlcnZlci1zaWRlIGluIHJlbmRlci5waHBcbmAgKyBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZTtcbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHVzaW5nIGR5bmFtaWMgcG9zdHMsIHdyYXAgcHJldmlldyBpbiBsb2FkaW5nIHN0YXRlXG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIGNvbnN0IHByZXZpZXdDb250ZW50ID0gcmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMFxuICAgID8gYHtpc1ByZXZpZXdMb2FkaW5nID8gKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IGlzLWxvYWRpbmdcIiBzdHlsZT17eyBtaW5IZWlnaHQ6ICcxMjBweCcsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgZ2FwOiAnOHB4JyB9fT5cbiAgICAgICAgICAgIDxTcGlubmVyIC8+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBjb2xvcjogJ3ZhcigtLXdwLWFkbWluLXRoZW1lLWNvbG9yLWRhcmtlciwgIzFlMWUxZSknIH19PntfXygnTG9hZGluZyBwb3N0c+KApicsICdoYW5kb2ZmJyl9PC9zcGFuPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogKFxuJHtwcmV2aWV3SnN4fVxuICAgICAgICApfWBcbiAgICA6IHByZXZpZXdKc3g7XG5cbiAgLy8gQ2hlY2sgdGhlIGdlbmVyYXRlZCBwcmV2aWV3IGZvciBjb21wb25lbnRzIHRoYXQgbmVlZCB0byBiZSBpbXBvcnRlZFxuICAvLyBUaGlzIGNhdGNoZXMgY29tcG9uZW50cyBhZGRlZCBieSB0aGUgaGFuZGxlYmFycy10by1qc3ggdHJhbnNwaWxlciAoZS5nLiwgZnJvbSB7eyNmaWVsZH19IG1hcmtlcnMpXG4gIGNvbnN0IHByZXZpZXdVc2VzUmljaFRleHQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8UmljaFRleHQnKTtcbiAgY29uc3QgcHJldmlld1VzZXMxMHVwSW1hZ2UgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKTtcblxuICAvLyBBZGQgUmljaFRleHQgdG8gaW1wb3J0cyBpZiB1c2VkIGluIHByZXZpZXcgKGFuZCBub3QgYWxyZWFkeSBpbmNsdWRlZCBmcm9tIHByb3BlcnR5IHR5cGVzKVxuICBpZiAoKHByZXZpZXdVc2VzUmljaFRleHQgfHwgcHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIC8vIExpbmtDb250cm9sIGlzIG5lZWRlZCBmb3Igc2lkZWJhciBsaW5rL2J1dHRvbiBwcm9wZXJ0eSBwYW5lbHM7IGFkZCB1bmNvbmRpdGlvbmFsbHkgd2hlbiBwcmVzZW50LlxuICAvLyAoSGFuZG9mZkxpbmtGaWVsZCBpbiB0aGUgcHJldmlldyBpcyBzZXBhcmF0ZSDigJQgaXQncyBpbXBvcnRlZCBmcm9tIHRoZSBzaGFyZWQgY29tcG9uZW50IGFuZCBoYW5kbGVzIGl0cyBvd24gTGlua0NvbnRyb2wgaW50ZXJuYWxseS4pXG4gIGlmIChuZWVkc0xpbmtDb250cm9sKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghY29tcG9uZW50SW1wb3J0cy5pbmNsdWRlcygnUG9wb3ZlcicpKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1BvcG92ZXInKTtcbiAgfVxuXG4gIC8vIEFkZCBJbm5lckJsb2NrcyBpZiB1c2VkIGluIHByZXZpZXcgYnV0IG5vdCBhbHJlYWR5IGltcG9ydGVkXG4gIGNvbnN0IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgaWYgKHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnSW5uZXJCbG9ja3MnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIDEwdXAgaW1wb3J0IGlmIG5lZWRlZCAoSW1hZ2UgZm9yIHByZXZpZXcsIFJlcGVhdGVyIGZvciBhcnJheXMpXG4gIGlmIChwcmV2aWV3VXNlczEwdXBJbWFnZSkge1xuICAgIHRlblVwSW1wb3J0cy5wdXNoKCdJbWFnZScpO1xuICB9XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDBcbiAgICA/IGBpbXBvcnQgeyAke3RlblVwSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnO1xcbmBcbiAgICA6ICcnO1xuXG4gIC8vIENvbGxlY3QgYWxsIGltYWdlIGZpZWxkcyBmb3IgQmxvY2tDb250cm9scy9NZWRpYVJlcGxhY2VGbG93XG4gIGludGVyZmFjZSBJbWFnZUZpZWxkSW5mbyB7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBhdHRyUGF0aDogc3RyaW5nOyAgLy8gZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2xlZnRDYXJkLmltYWdlJ1xuICAgIHZhbHVlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQ/LmltYWdlJ1xuICAgIHVwZGF0ZUV4cHI6IHN0cmluZzsgLy8gZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyBiYWNrZ3JvdW5kSW1hZ2U6IC4uLiB9KScgb3IgbmVzdGVkIHVwZGF0ZVxuICB9XG4gIFxuICBjb25zdCBpbWFnZUZpZWxkczogSW1hZ2VGaWVsZEluZm9bXSA9IFtdO1xuICBcbiAgY29uc3QgY29sbGVjdEltYWdlRmllbGRzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwYXJlbnRQYXRoOiBzdHJpbmcgPSAnJywgcGFyZW50VmFsdWVQYXRoOiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgICBjb25zdCBjdXJyZW50UGF0aCA9IHBhcmVudFBhdGggPyBgJHtwYXJlbnRQYXRofS4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZVBhdGggPSBwYXJlbnRWYWx1ZVBhdGggPyBgJHtwYXJlbnRWYWx1ZVBhdGh9Py4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBjb25zdCBsYWJlbCA9IHByb3AubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuICAgICAgICBsZXQgdXBkYXRlRXhwcjogc3RyaW5nO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBhcmVudFBhdGgpIHtcbiAgICAgICAgICAvLyBOZXN0ZWQgaW1hZ2UgZmllbGQgLSBuZWVkIHRvIHNwcmVhZCBwYXJlbnQgb2JqZWN0XG4gICAgICAgICAgY29uc3QgcGFyZW50QXR0ciA9IHBhcmVudFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICBjb25zdCBwYXJlbnRDYW1lbCA9IHRvQ2FtZWxDYXNlKHBhcmVudEF0dHIpO1xuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50Q2FtZWx9OiB7IC4uLiR7cGFyZW50Q2FtZWx9LCAke2F0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0gfSlgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRvcC1sZXZlbCBpbWFnZSBmaWVsZFxuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSlgO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpbWFnZUZpZWxkcy5wdXNoKHtcbiAgICAgICAgICBsYWJlbCxcbiAgICAgICAgICBhdHRyUGF0aDogY3VycmVudFBhdGgsXG4gICAgICAgICAgdmFsdWVFeHByOiBjdXJyZW50VmFsdWVQYXRoLFxuICAgICAgICAgIHVwZGF0ZUV4cHJcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3QgcHJvcGVydGllc1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wLnByb3BlcnRpZXMsIGN1cnJlbnRQYXRoLCBjdXJyZW50VmFsdWVQYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBjb2xsZWN0SW1hZ2VGaWVsZHMocHJvcGVydGllcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBCbG9ja0NvbnRyb2xzIHdpdGggTWVkaWFSZXBsYWNlRmxvdyBmb3IgZWFjaCBpbWFnZSBmaWVsZFxuICBjb25zdCBibG9ja0NvbnRyb2xzSnN4ID0gaW1hZ2VGaWVsZHMubGVuZ3RoID4gMCA/IGBcbiAgICAgICAgPEJsb2NrQ29udHJvbHMgZ3JvdXA9XCJvdGhlclwiPlxuJHtpbWFnZUZpZWxkcy5tYXAoZmllbGQgPT4gYCAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgbWVkaWFJZD17JHtmaWVsZC52YWx1ZUV4cHJ9Py5pZH1cbiAgICAgICAgICAgIG1lZGlhVXJsPXske2ZpZWxkLnZhbHVlRXhwcn0/LnNyY31cbiAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgYWNjZXB0PVwiaW1hZ2UvKlwiXG4gICAgICAgICAgICBvblNlbGVjdD17KG1lZGlhKSA9PiAke2ZpZWxkLnVwZGF0ZUV4cHJ9fVxuICAgICAgICAgICAgbmFtZT17X18oJyR7ZmllbGQubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmApLmpvaW4oJ1xcbicpfVxuICAgICAgICA8L0Jsb2NrQ29udHJvbHM+YCA6ICcnO1xuXG4gIC8vIFNoYXJlZCBjb21wb25lbnQgaW1wb3J0cyBmb3IgZHluYW1pYyBhcnJheXMgKHNlbGVjdG9yIFVJICsgZWRpdG9yIHByZXZpZXcgbWFwcGluZylcbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0JyZWFkY3J1bWJzU2VsZWN0b3InKTtcbiAgaWYgKGhhc1RheG9ub215QXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmIChoYXNQYWdpbmF0aW9uQXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBoYXNEeW5hbWljQXJyYXlzIHx8IGhhc1RheG9ub215QXJyYXk7XG4gIGlmIChuZWVkc0RhdGFTdG9yZSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IHsgdXNlU2VsZWN0JHtoYXNCcmVhZGNydW1ic0FycmF5ID8gJywgc2VsZWN0JyA6ICcnfSB9IGZyb20gJ0B3b3JkcHJlc3MvZGF0YSc7XFxuaW1wb3J0IHsgc3RvcmUgYXMgY29yZURhdGFTdG9yZSB9IGZyb20gJ0B3b3JkcHJlc3MvY29yZS1kYXRhJztcXG5gO1xuICB9XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICAvLyBCdWlsZCBlbGVtZW50IGltcG9ydHNcbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgZWxlbWVudEltcG9ydHMucHVzaCgndXNlU3RhdGUnLCAndXNlRWZmZWN0Jyk7XG4gIH1cblxuICAvLyBJbXBvcnQgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQgd2hlbiBwcmV2aWV3IHVzZXMgbGluay9idXR0b24gaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgbGlua0ZpZWxkSW1wb3J0ID0gcHJldmlld1VzZXNMaW5rRmllbGQgPyBgaW1wb3J0IHsgSGFuZG9mZkxpbmtGaWVsZCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0xpbmtGaWVsZCc7XFxuYCA6ICcnO1xuXG4gIC8vIFNjcmVlbnNob3QgaW1wb3J0IGZvciBpbnNlcnRlciBwcmV2aWV3XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnQgPSBoYXNTY3JlZW5zaG90ID8gYGltcG9ydCBzY3JlZW5zaG90VXJsIGZyb20gJy4vc2NyZWVuc2hvdC5wbmcnO1xcbmAgOiAnJztcblxuICAvLyBTVkcgaWNvbiBmb3IgdGhlIGJsb2NrICh1bmlxdWUgcGVyIGJsb2NrLCBjb2xvcmVkIGJ5IGdyb3VwKVxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVTdmdJY29uKGNvbXBvbmVudC50aXRsZSwgY29tcG9uZW50Lmdyb3VwKTtcbiAgY29uc3Qgc3ZnSWNvbkNvZGUgPSBgY29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO2A7XG5cbiAgLy8gSW5zZXJ0ZXIgcHJldmlldzogc2hvdyBzY3JlZW5zaG90IGltYWdlIGluc3RlYWQgb2YgbGl2ZS1yZW5kZXJpbmdcbiAgY29uc3QgcHJldmlld0Vhcmx5UmV0dXJuID0gaGFzU2NyZWVuc2hvdFxuICAgID8gYCAgICBpZiAoYXR0cmlidXRlcy5fX3ByZXZpZXcpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgIDxpbWcgc3JjPXtzY3JlZW5zaG90VXJsfSBhbHQ9e21ldGFkYXRhLnRpdGxlfSBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fSAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICk7XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgcmV0dXJuIGBpbXBvcnQgeyByZWdpc3RlckJsb2NrVHlwZSB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2tzJztcbmltcG9ydCB7IFxuICAke2Jsb2NrRWRpdG9ySW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IFxuICAke2NvbXBvbmVudEltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG4ke3RlblVwSW1wb3J0fSR7c2hhcmVkQ29tcG9uZW50SW1wb3J0fWltcG9ydCBtZXRhZGF0YSBmcm9tICcuL2Jsb2NrLmpzb24nO1xuaW1wb3J0ICcuL2VkaXRvci5zY3NzJztcbiR7aGFzRHluYW1pY0FycmF5cyA/IFwiaW1wb3J0ICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9EeW5hbWljUG9zdFNlbGVjdG9yLmVkaXRvci5zY3NzJztcXG5cIiA6ICcnfWltcG9ydCAnLi9zdHlsZS5zY3NzJztcbiR7c2NyZWVuc2hvdEltcG9ydH0ke2xpbmtGaWVsZEltcG9ydH1cbiR7c3ZnSWNvbkNvZGV9XG5cbiR7ZGVwcmVjYXRpb25zQ29kZSA/IGAke2RlcHJlY2F0aW9uc0NvZGV9XFxuXFxuYCA6ICcnfXJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsXG4gIGljb246IGJsb2NrSWNvbiwke2RlcHJlY2F0aW9uc0NvZGUgPyAnXFxuICBkZXByZWNhdGVkLCcgOiAnJ31cbiAgZWRpdDogKHsgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaXNTZWxlY3RlZCB9KSA9PiB7XG4gICAgY29uc3QgYmxvY2tQcm9wcyA9IHVzZUJsb2NrUHJvcHMoKTtcbiR7cHJldmlld0Vhcmx5UmV0dXJufSR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/IFwiICAgIGNvbnN0IENPTlRFTlRfQkxPQ0tTID0gWydjb3JlL3BhcmFncmFwaCcsJ2NvcmUvaGVhZGluZycsJ2NvcmUvbGlzdCcsJ2NvcmUvbGlzdC1pdGVtJywnY29yZS9xdW90ZScsJ2NvcmUvaW1hZ2UnLCdjb3JlL3NlcGFyYXRvcicsJ2NvcmUvaHRtbCcsJ2NvcmUvYnV0dG9ucycsJ2NvcmUvYnV0dG9uJ107XCIgOiAnJ31cbiAgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZX1cbiR7YXJyYXlIZWxwZXJzfVxuICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxJbnNwZWN0b3JDb250cm9scz5cbiR7cGFuZWxzLmpvaW4oJ1xcblxcbicpfVxuICAgICAgICA8L0luc3BlY3RvckNvbnRyb2xzPlxuJHtibG9ja0NvbnRyb2xzSnN4fVxuXG4gICAgICAgIHsvKiBFZGl0b3IgUHJldmlldyAqL31cbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4ke3ByZXZpZXdDb250ZW50fVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvRnJhZ21lbnQ+XG4gICAgKTtcbiAgfSxcbiAgc2F2ZTogKCkgPT4ge1xuJHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICAvLyBJbm5lckJsb2NrcyBjb250ZW50IG11c3QgYmUgc2F2ZWQgc28gaXQgaXMgcGVyc2lzdGVkIGluIHBvc3QgY29udGVudFxcbiAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgLy8gU2VydmVyLXNpZGUgcmVuZGVyaW5nIHZpYSByZW5kZXIucGhwXFxuICAgIHJldHVybiBudWxsOyd9XG4gIH0sXG59KTtcbmA7XG59O1xuXG5leHBvcnQge1xuICBnZW5lcmF0ZUluZGV4SnMsXG4gIGdlbmVyYXRlU3ZnSWNvbixcbiAgdG9UaXRsZUNhc2UsXG4gIGdlbmVyYXRlRmllbGRDb250cm9sLFxuICBnZW5lcmF0ZUFycmF5Q29udHJvbCxcbiAgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wsXG4gIGlzT3BhY2l0eVJhbmdlRmllbGQsXG4gIGdldE51bWJlckNvbnRyb2xTcGVjLFxuICBoYXNPcGFjaXR5UmFuZ2VGaWVsZCxcbiAgaGFzTm9uT3BhY2l0eU51bWJlckZpZWxkLFxufTtcbmV4cG9ydCB0eXBlIHsgRmllbGRDb250ZXh0LCBOdW1iZXJDb250cm9sU3BlYyB9O1xuIl19