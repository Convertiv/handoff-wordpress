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
            const parseExpr = spec.step !== undefined && spec.step >= 1 && Number.isInteger(spec.step)
                ? "value === '' ? 0 : parseInt(value, 10) || 0"
                : "value === '' ? 0 : parseFloat(value) || 0";
            return `${indent}<TextControl
${indent}  label={__('${label}', 'handoff')}
${indent}  type="number"
${indent}  value={typeof ${valueAccessor} === 'number' ? String(${valueAccessor}) : ''}
${indent}  onChange={(value) => ${onChangeHandler(parseExpr)}}
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLHFEQUF3RztBQUN4Ryw2Q0FBOEM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO0lBQzFDLE9BQU8sR0FBRztTQUNQLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDVixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDO0FBMjlDQSxrQ0FBVztBQXQ4Q2IsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsUUFBeUIsRUFBVSxFQUFFLENBQ2pGLEdBQUcsUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLElBQUksRUFBRSxJQUFJLFFBQVEsQ0FBQyxXQUFXLElBQUksRUFBRSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7QUFFbkYsNkRBQTZEO0FBQzdELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxRQUFnQixFQUFFLFFBQXlCLEVBQVcsRUFBRTtJQUNuRixNQUFNLEdBQUcsR0FBRyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbkQsT0FBTyxzQ0FBc0MsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDMUQsQ0FBQyxDQUFDO0FBbThDQSxrREFBbUI7QUFqOENyQixvRUFBb0U7QUFDcEUsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsUUFBeUIsRUFBcUIsRUFB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RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTSxTQUFTLGVBQWUsQ0FBQyxTQUFTLGFBQWEsY0FBYyxhQUFhLG1CQUFtQixhQUFhLGtIQUFrSCxDQUFDO0VBQ25PLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNLGdCQUFnQixhQUFhO0VBQ25DLE1BQU0sYUFBYSxhQUFhO0VBQ2hDLE1BQU0sY0FBYyxhQUFhLFdBQVcsYUFBYTtFQUN6RCxNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE1BQU07RUFDTixNQUFNO0VBQ04s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O0dBQ1gsQ0FBQztJQUVGLG9FQUFvRTtJQUNwRSxNQUFNLGtCQUFrQixHQUFHLGFBQWE7UUFDdEMsQ0FBQyxDQUFDOzs7Ozs7O0NBT0w7UUFDRyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBRVAsT0FBTzs7SUFFTCxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDOzs7SUFHaEMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQzs7O1dBR3ZCLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0VBQ2xDLFdBQVcsR0FBRyxxQkFBcUI7O0VBRW5DLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDLENBQUMsRUFBRTtFQUM3RixnQkFBZ0IsR0FBRyxlQUFlO0VBQ2xDLFdBQVc7O0VBRVgsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTs7b0JBRS9CLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRTs7O0VBRzNELGtCQUFrQixHQUFHLGNBQWMsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsZ0xBQWdMLENBQUMsQ0FBQyxDQUFDLEVBQUU7Y0FDek8sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDaEMsMEJBQTBCO0VBQzFCLFlBQVk7Ozs7RUFJWixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7RUFFbkIsZ0JBQWdCOzs7O0VBSWhCLGNBQWM7Ozs7OztFQU1kLGNBQWMsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsa0hBQWtILENBQUMsQ0FBQyxDQUFDLCtEQUErRDs7O0NBR2hPLENBQUM7QUFDRixDQUFDLENBQUM7QUFHQSwwQ0FBZSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIGluZGV4LmpzIGZvciBHdXRlbmJlcmcgYmxvY2sgZWRpdG9yXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWcsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQmxvY2tOYW1lIH0gZnJvbSAnLi9ibG9jay1qc29uJztcbmltcG9ydCB7IGdlbmVyYXRlSnN4UHJldmlldywgdG9DYW1lbENhc2UgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4JztcbmltcG9ydCB7IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMsIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeC91dGlscyc7XG5pbXBvcnQgeyBidWlsZFJlc2hhcGVKcyB9IGZyb20gJy4vcmVuZGVyLXBocCc7XG5cbi8qKlxuICogQ29udmVydCBzbmFrZV9jYXNlIHRvIFRpdGxlIENhc2VcbiAqL1xuY29uc3QgdG9UaXRsZUNhc2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gc3RyXG4gICAgLnNwbGl0KCdfJylcbiAgICAubWFwKHdvcmQgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkpXG4gICAgLmpvaW4oJyAnKTtcbn07XG5cbi8qKlxuICogQ29udGV4dCBmb3IgZ2VuZXJhdGluZyBmaWVsZCBjb250cm9scyAtIGRldGVybWluZXMgaG93IHZhbHVlcyBhcmUgYWNjZXNzZWQgYW5kIHVwZGF0ZWRcbiAqL1xuaW50ZXJmYWNlIEZpZWxkQ29udGV4dCB7XG4gIC8qKiBUaGUgdmFyaWFibGUgbmFtZSBmb3IgYWNjZXNzaW5nIHRoZSB2YWx1ZSAoZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2l0ZW0uaW1hZ2UnKSAqL1xuICB2YWx1ZUFjY2Vzc29yOiBzdHJpbmc7XG4gIC8qKiBUaGUgb25DaGFuZ2UgaGFuZGxlciBjb2RlIChlLmcuLCAnc2V0QXR0cmlidXRlcyh7IHg6IHZhbHVlIH0pJyBvciAndXBkYXRlSXRlbXMoaW5kZXgsIFwieFwiLCB2YWx1ZSknKSAqL1xuICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZTogc3RyaW5nKSA9PiBzdHJpbmc7XG4gIC8qKiBCYXNlIGluZGVudGF0aW9uICovXG4gIGluZGVudDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgTnVtYmVyQ29udHJvbFNwZWMge1xuICB1c2VSYW5nZTogYm9vbGVhbjtcbiAgbWluPzogbnVtYmVyO1xuICBtYXg/OiBudW1iZXI7XG4gIHN0ZXA/OiBudW1iZXI7XG59XG5cbmNvbnN0IGZpZWxkTGFiZWxIYXlzdGFjayA9IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+XG4gIGAke2ZpZWxkS2V5fSAke3Byb3BlcnR5Lm5hbWUgPz8gJyd9ICR7cHJvcGVydHkuZGVzY3JpcHRpb24gPz8gJyd9YC50b0xvd2VyQ2FzZSgpO1xuXG4vKiogT3BhY2l0eSAvIG92ZXJsYXkgYWxwaGEgZmllbGRzIHVzZSBhIDDigJMxIHJhbmdlIHNsaWRlci4gKi9cbmNvbnN0IGlzT3BhY2l0eVJhbmdlRmllbGQgPSAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCBoYXkgPSBmaWVsZExhYmVsSGF5c3RhY2soZmllbGRLZXksIHByb3BlcnR5KTtcbiAgcmV0dXJuIC9vcGFjaXR5fG92ZXJsYXlcXHMqb3BhY2l0eXxcXGJhbHBoYVxcYi9pLnRlc3QoaGF5KTtcbn07XG5cbi8qKiBSZXNvbHZlIGVkaXRvciBjb250cm9sIHR5cGUgYW5kIGJvdW5kcyBmb3IgYSBudW1iZXIgcHJvcGVydHkuICovXG5jb25zdCBnZXROdW1iZXJDb250cm9sU3BlYyA9IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogTnVtYmVyQ29udHJvbFNwZWMgPT4ge1xuICBpZiAoaXNPcGFjaXR5UmFuZ2VGaWVsZChmaWVsZEtleSwgcHJvcGVydHkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IHRydWUsIG1pbjogMCwgbWF4OiAxLCBzdGVwOiAwLjAxIH07XG4gIH1cblxuICBjb25zdCBoYXkgPSBmaWVsZExhYmVsSGF5c3RhY2soZmllbGRLZXksIHByb3BlcnR5KTtcbiAgY29uc3Qga2V5SGF5ID0gYCR7ZmllbGRLZXl9ICR7cHJvcGVydHkubmFtZSA/PyAnJ31gLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKC9cXGJsYXQoaXR1ZGUpP1xcYi9pLnRlc3Qoa2V5SGF5KSB8fCAvXFxibGF0KGl0dWRlKT9cXGIvaS50ZXN0KGhheSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIG1pbjogLTkwLCBtYXg6IDkwLCBzdGVwOiAwLjAwMDAwMSB9O1xuICB9XG4gIGlmICgvXFxibG5nXFxifFxcYmxvbihnaXR1ZGUpP1xcYi9pLnRlc3Qoa2V5SGF5KSB8fCAvXFxibG5nXFxifFxcYmxvbihnaXR1ZGUpP1xcYi9pLnRlc3QoaGF5KSkge1xuICAgIHJldHVybiB7IHVzZVJhbmdlOiBmYWxzZSwgbWluOiAtMTgwLCBtYXg6IDE4MCwgc3RlcDogMC4wMDAwMDEgfTtcbiAgfVxuICBpZiAoL1xcYnpvb21cXGIvaS50ZXN0KGtleUhheSkgfHwgL1xcYnpvb21cXGIvaS50ZXN0KGhheSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIG1pbjogMSwgbWF4OiAyMSwgc3RlcDogMSB9O1xuICB9XG5cbiAgY29uc3QgZGVmYXVsdElzSW50ZWdlciA9XG4gICAgdHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIocHJvcGVydHkuZGVmYXVsdCk7XG4gIHJldHVybiB7IHVzZVJhbmdlOiBmYWxzZSwgc3RlcDogZGVmYXVsdElzSW50ZWdlciA/IDEgOiB1bmRlZmluZWQgfTtcbn07XG5cbmNvbnN0IHdhbGtOdW1iZXJGaWVsZHMgPSAoXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIHByZWRpY2F0ZTogKGZpZWxkS2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpID0+IGJvb2xlYW5cbik6IGJvb2xlYW4gPT4ge1xuICBjb25zdCBjaGVjayA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHksIGZpZWxkS2V5OiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBpZiAocHJvcC50eXBlID09PSAnbnVtYmVyJyAmJiBwcmVkaWNhdGUoZmllbGRLZXksIHByb3ApKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+IGNoZWNrKHAsIGspKTtcbiAgICB9XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+IGNoZWNrKHAsIGspKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuICByZXR1cm4gT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PiBjaGVjayhwLCBrKSk7XG59O1xuXG5jb25zdCBoYXNPcGFjaXR5UmFuZ2VGaWVsZCA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogYm9vbGVhbiA9PlxuICB3YWxrTnVtYmVyRmllbGRzKHByb3BlcnRpZXMsIGlzT3BhY2l0eVJhbmdlRmllbGQpO1xuXG5jb25zdCBoYXNOb25PcGFjaXR5TnVtYmVyRmllbGQgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IGJvb2xlYW4gPT5cbiAgd2Fsa051bWJlckZpZWxkcyhwcm9wZXJ0aWVzLCAoZmllbGRLZXksIHByb3BlcnR5KSA9PiAhaXNPcGFjaXR5UmFuZ2VGaWVsZChmaWVsZEtleSwgcHJvcGVydHkpKTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpZWxkIGNvbnRyb2wgZm9yIGFueSBwcm9wZXJ0eSB0eXBlIC0gdW5pZmllZCBmdW5jdGlvbiBmb3IgYm90aCB0b3AtbGV2ZWwgYW5kIG5lc3RlZCBmaWVsZHNcbiAqL1xuY29uc3QgZ2VuZXJhdGVGaWVsZENvbnRyb2wgPSAoXG4gIGZpZWxkS2V5OiBzdHJpbmcsXG4gIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksXG4gIGNvbnRleHQ6IEZpZWxkQ29udGV4dFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgeyB2YWx1ZUFjY2Vzc29yLCBvbkNoYW5nZUhhbmRsZXIsIGluZGVudCB9ID0gY29udGV4dDtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGZpZWxkS2V5KTtcblxuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0Jzoge1xuICAgICAgY29uc3QgaXNXaXN0aWFUZXh0RmllbGQgPSAvXFxid2lzdGlhXFxiL2kudGVzdChgJHtmaWVsZEtleX0gJHtsYWJlbH0gJHtwcm9wZXJ0eS5kZXNjcmlwdGlvbiA/PyAnJ31gKTtcblxuICAgICAgaWYgKGlzV2lzdGlhVGV4dEZpZWxkKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICB7KCgpID0+IHtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgJycpLnRyaW0oKTtcbiR7aW5kZW50fSAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgIGNvbnN0IHdpc3RpYUlkID0gbWVkaWFNYXRjaD8uWzFdIHx8IGZhbGxiYWNrTWF0Y2g/LlsxXSB8fCAnJztcbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIGlmICghd2lzdGlhSWQpIHtcbiR7aW5kZW50fSAgICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzE2cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyOiAnMXB4IGRhc2hlZCAjY2JkNWUxJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjNDc1NTY5JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZjhmYWZjJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAge19fKCdBZGQgYSBXaXN0aWEgdmlkZW8gSUQgdG8gcHJldmlldyB0aGlzIHZpZGVvLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgKTtcbiR7aW5kZW50fSAgICB9XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuJHtpbmRlbnR9ICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcbiR7aW5kZW50fSAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICBiYWNrZ3JvdW5kOiAnIzBmMTcyYScsXG4ke2luZGVudH0gICAgICAgICAgYXNwZWN0UmF0aW86ICcxNiAvIDknLFxuJHtpbmRlbnR9ICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICA8aW1nXG4ke2luZGVudH0gICAgICAgICAgc3JjPXtcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS9zd2F0Y2hcXGB9XG4ke2luZGVudH0gICAgICAgICAgYWx0PXtfXygnV2lzdGlhIHZpZGVvIHByZXZpZXcnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLCBvYmplY3RGaXQ6ICdjb3ZlcicsIGRpc3BsYXk6ICdibG9jaycgfX1cbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGluc2V0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWxpZ25JdGVtczogJ2ZsZXgtZW5kJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnc3BhY2UtYmV0d2VlbicsXG4ke2luZGVudH0gICAgICAgICAgICBnYXA6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICdsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCByZ2JhKDE1LCAyMywgNDIsIDAuMTIpIDAlLCByZ2JhKDE1LCAyMywgNDIsIDAuNykgMTAwJSknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwidHJ1ZVwiXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICB3aWR0aDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBoZWlnaHQ6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjQpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2Ryb3BGaWx0ZXI6ICdibHVyKDEwcHgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgICB3aWR0aDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBoZWlnaHQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgbWFyZ2luTGVmdDogJzRweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyVG9wOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJCb3R0b206ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckxlZnQ6ICcxNHB4IHNvbGlkICNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtaW5IZWlnaHQ6ICczMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgcGFkZGluZzogJzZweCAxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgxNSwgMjMsIDQyLCAwLjU4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRTaXplOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRXZWlnaHQ6IDYwMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbGV0dGVyU3BhY2luZzogJzAuMDJlbScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHt3aXN0aWFJZH1cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgKTtcbiR7aW5kZW50fSAgfSkoKX1cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgICAvLyBJbnNpZGUgYW4gYXJyYXkgaXRlbSwgSW5uZXJCbG9ja3MgY2FuJ3QgYmUgdXNlZCDigJQgcHJvdmlkZSBhIHRleHRhcmVhXG4gICAgICBpZiAodmFsdWVBY2Nlc3Nvci5zdGFydHNXaXRoKCdpdGVtLicpKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRhcmVhQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgcm93cz17NH1cbiR7aW5kZW50fS8+YDtcbiAgICAgIH1cbiAgICAgIC8vIFRvcC1sZXZlbCByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgY29udHJvbCBuZWVkZWRcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ251bWJlcic6IHtcbiAgICAgIGNvbnN0IHNwZWMgPSBnZXROdW1iZXJDb250cm9sU3BlYyhmaWVsZEtleSwgcHJvcGVydHkpO1xuICAgICAgaWYgKHNwZWMudXNlUmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08UmFuZ2VDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSA/PyAwfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIG1pbj17JHtzcGVjLm1pbiA/PyAwfX1cbiR7aW5kZW50fSAgbWF4PXske3NwZWMubWF4ID8/IDF9fVxuJHtpbmRlbnR9ICBzdGVwPXske3NwZWMuc3RlcCA/PyAwLjAxfX1cbiR7aW5kZW50fS8+YDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYm91bmRMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICAgIGlmIChzcGVjLm1pbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJvdW5kTGluZXMucHVzaChgJHtpbmRlbnR9ICBtaW49eyR7c3BlYy5taW59fWApO1xuICAgICAgfVxuICAgICAgaWYgKHNwZWMubWF4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYm91bmRMaW5lcy5wdXNoKGAke2luZGVudH0gIG1heD17JHtzcGVjLm1heH19YCk7XG4gICAgICB9XG4gICAgICBpZiAoc3BlYy5zdGVwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYm91bmRMaW5lcy5wdXNoKGAke2luZGVudH0gIHN0ZXA9eyR7c3BlYy5zdGVwfX1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGJvdW5kcyA9IGJvdW5kTGluZXMubGVuZ3RoID8gYFxcbiR7Ym91bmRMaW5lcy5qb2luKCdcXG4nKX1gIDogJyc7XG4gICAgICBjb25zdCBwYXJzZUV4cHIgPVxuICAgICAgICBzcGVjLnN0ZXAgIT09IHVuZGVmaW5lZCAmJiBzcGVjLnN0ZXAgPj0gMSAmJiBOdW1iZXIuaXNJbnRlZ2VyKHNwZWMuc3RlcClcbiAgICAgICAgICA/IFwidmFsdWUgPT09ICcnID8gMCA6IHBhcnNlSW50KHZhbHVlLCAxMCkgfHwgMFwiXG4gICAgICAgICAgOiBcInZhbHVlID09PSAnJyA/IDAgOiBwYXJzZUZsb2F0KHZhbHVlKSB8fCAwXCI7XG5cbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB0eXBlPVwibnVtYmVyXCJcbiR7aW5kZW50fSAgdmFsdWU9e3R5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnbnVtYmVyJyA/IFN0cmluZygke3ZhbHVlQWNjZXNzb3J9KSA6ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihwYXJzZUV4cHIpfX1cbiR7Ym91bmRzfVxuJHtpbmRlbnR9Lz5gO1xuICAgIH1cblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGAke2luZGVudH08VG9nZ2xlQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgY2hlY2tlZD17JHt2YWx1ZUFjY2Vzc29yfSB8fCBmYWxzZX1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuXG4gICAgY2FzZSAnaW1hZ2UnOlxuICAgICAgLy8gVXNlICdzcmMnIGluc3RlYWQgb2YgJ3VybCcgdG8gbWF0Y2ggSGFuZG9mZidzIGltYWdlIHByb3BlcnR5IG5hbWluZyBjb252ZW50aW9uXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxNZWRpYVVwbG9hZENoZWNrPlxuJHtpbmRlbnR9ICA8TWVkaWFVcGxvYWRcbiR7aW5kZW50fSAgICBvblNlbGVjdD17KG1lZGlhKSA9PiAke29uQ2hhbmdlSGFuZGxlcigneyBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgXFwnXFwnIH0nKX19XG4ke2luZGVudH0gICAgYWxsb3dlZFR5cGVzPXtbJ2ltYWdlJ119XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LnNyY31cbiR7aW5kZW50fSAgICByZW5kZXI9eyh7IG9wZW4gfSkgPT4gKFxuJHtpbmRlbnR9ICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjICYmIChcbiR7aW5kZW50fSAgICAgICAgICA8aW1nIFxuJHtpbmRlbnR9ICAgICAgICAgICAgc3JjPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9IFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWx0PXske3ZhbHVlQWNjZXNzb3J9Py5hbHQgfHwgJyd9XG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17eyBtYXhXaWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fVxuJHtpbmRlbnR9ICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICl9XG4ke2luZGVudH0gICAgICAgIDxCdXR0b24gb25DbGljaz17b3Blbn0gdmFyaWFudD1cInNlY29uZGFyeVwiIHNpemU9XCJzbWFsbFwiPlxuJHtpbmRlbnR9ICAgICAgICAgIHske3ZhbHVlQWNjZXNzb3J9Py5zcmMgPyBfXygnUmVwbGFjZSAke2xhYmVsfScsICdoYW5kb2ZmJykgOiBfXygnU2VsZWN0ICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgICAgIHske3ZhbHVlQWNjZXNzb3J9Py5zcmMgJiYgKFxuJHtpbmRlbnR9ICAgICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd7IHNyYzogXFwnXFwnLCBhbHQ6IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgdmFyaWFudD1cImxpbmtcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7X18oJ1JlbW92ZScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgICAgICl9XG4ke2luZGVudH0gICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgKX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvTWVkaWFVcGxvYWRDaGVjaz5gO1xuXG4gICAgY2FzZSAndmlkZW8nOlxuICAgICAgcmV0dXJuIGAke2luZGVudH08RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICB2YWx1ZT17dHlwZW9mICR7dmFsdWVBY2Nlc3Nvcn0gPT09ICdzdHJpbmcnID8gJHt2YWx1ZUFjY2Vzc29yfSA6ICgke3ZhbHVlQWNjZXNzb3J9Py5pZCB8fCAke3ZhbHVlQWNjZXNzb3J9Py5zcmMgfHwgJycpfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHtcbiR7aW5kZW50fSAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBTdHJpbmcodmFsdWUgfHwgJycpLnRyaW0oKTtcbiR7aW5kZW50fSAgICAgIGNvbnN0IG1lZGlhTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC8oPzptZWRpYXN8aWZyYW1lKVxcXFwvKFtBLVphLXowLTldKykvaSk7XG4ke2luZGVudH0gICAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICAgIGNvbnN0IHdpc3RpYUlkID0gbWVkaWFNYXRjaD8uWzFdIHx8IGZhbGxiYWNrTWF0Y2g/LlsxXSB8fCAnJztcbiR7aW5kZW50fSAgICAgICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLigke3ZhbHVlQWNjZXNzb3J9ICYmIHR5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnb2JqZWN0JyA/ICR7dmFsdWVBY2Nlc3Nvcn0gOiB7fSksIGlkOiB3aXN0aWFJZCwgc3JjOiB3aXN0aWFJZCA/IFxcYGh0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy9cXCR7d2lzdGlhSWR9Lmpzb25wXFxgIDogbm9ybWFsaXplZCB9YCl9XG4ke2luZGVudH0gICAgfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgeygoKSA9PiB7XG4ke2luZGVudH0gICAgY29uc3QgcmF3VmFsdWUgPVxuJHtpbmRlbnR9ICAgICAgdHlwZW9mICR7dmFsdWVBY2Nlc3Nvcn0gPT09ICdzdHJpbmcnXG4ke2luZGVudH0gICAgICAgID8gJHt2YWx1ZUFjY2Vzc29yfVxuJHtpbmRlbnR9ICAgICAgICA6ICgke3ZhbHVlQWNjZXNzb3J9Py5pZCB8fCAke3ZhbHVlQWNjZXNzb3J9Py5zcmMgfHwgJycpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBTdHJpbmcocmF3VmFsdWUgfHwgJycpLnRyaW0oKTtcbiR7aW5kZW50fSAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgIGNvbnN0IHdpc3RpYUlkID0gbWVkaWFNYXRjaD8uWzFdIHx8IGZhbGxiYWNrTWF0Y2g/LlsxXSB8fCAnJztcbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIGlmICghd2lzdGlhSWQpIHtcbiR7aW5kZW50fSAgICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzE2cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyOiAnMXB4IGRhc2hlZCAjY2JkNWUxJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjNDc1NTY5JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZjhmYWZjJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAge19fKCdBZGQgYSBXaXN0aWEgdmlkZW8gSUQgdG8gcHJldmlldyB0aGlzIHZpZGVvLicsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgKTtcbiR7aW5kZW50fSAgICB9XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuJHtpbmRlbnR9ICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcbiR7aW5kZW50fSAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICBiYWNrZ3JvdW5kOiAnIzBmMTcyYScsXG4ke2luZGVudH0gICAgICAgICAgYXNwZWN0UmF0aW86ICcxNiAvIDknLFxuJHtpbmRlbnR9ICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICA8aW1nXG4ke2luZGVudH0gICAgICAgICAgc3JjPXtcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS9zd2F0Y2hcXGB9XG4ke2luZGVudH0gICAgICAgICAgYWx0PXtfXygnV2lzdGlhIHZpZGVvIHByZXZpZXcnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLCBvYmplY3RGaXQ6ICdjb3ZlcicsIGRpc3BsYXk6ICdibG9jaycgfX1cbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGluc2V0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYWxpZ25JdGVtczogJ2ZsZXgtZW5kJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnc3BhY2UtYmV0d2VlbicsXG4ke2luZGVudH0gICAgICAgICAgICBnYXA6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJhY2tncm91bmQ6ICdsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCByZ2JhKDE1LCAyMywgNDIsIDAuMTIpIDAlLCByZ2JhKDE1LCAyMywgNDIsIDAuNykgMTAwJSknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgY29sb3I6ICcjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwidHJ1ZVwiXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICB3aWR0aDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBoZWlnaHQ6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjQpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2Ryb3BGaWx0ZXI6ICdibHVyKDEwcHgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgICB3aWR0aDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBoZWlnaHQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgbWFyZ2luTGVmdDogJzRweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyVG9wOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJCb3R0b206ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckxlZnQ6ICcxNHB4IHNvbGlkICNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW5cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBtaW5IZWlnaHQ6ICczMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgcGFkZGluZzogJzZweCAxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAncmdiYSgxNSwgMjMsIDQyLCAwLjU4KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRTaXplOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGZvbnRXZWlnaHQ6IDYwMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbGV0dGVyU3BhY2luZzogJzAuMDJlbScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHt3aXN0aWFJZH1cbiR7aW5kZW50fSAgICAgICAgICA8L3NwYW4+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgKTtcbiR7aW5kZW50fSAgfSkoKX1cbiR7aW5kZW50fTwvRmxleD5gO1xuXG4gICAgY2FzZSAnbGluayc6XG4gICAgICAvLyBGb3IgbGlua3MsIHVzZSBMaW5rQ29udHJvbCB3aGljaCBwcm92aWRlcyBpbnRlcm5hbCBwYWdlIHNlYXJjaCBhbmQgVVJMIHZhbGlkYXRpb25cbiAgICAgIGNvbnN0IGxpbmtIYW5kbGVyID0gb25DaGFuZ2VIYW5kbGVyKGB7IFxuICAgICAgICAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBcbiAgICAgICAgdXJsOiB2YWx1ZS51cmwgfHwgJycsIFxuICAgICAgICBsYWJlbDogdmFsdWUudGl0bGUgfHwgJHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJycsXG4gICAgICAgIG9wZW5zSW5OZXdUYWI6IHZhbHVlLm9wZW5zSW5OZXdUYWIgfHwgZmFsc2VcbiAgICAgIH1gKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdMaW5rIFRleHQnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGhpZGVMYWJlbEZyb21WaXNpb249e3RydWV9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIGxhYmVsOiB2YWx1ZSB9YCl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogJzhweCcgfX0+XG4ke2luZGVudH0gICAgPExpbmtDb250cm9sXG4ke2luZGVudH0gICAgICB2YWx1ZT17eyBcbiR7aW5kZW50fSAgICAgICAgdXJsOiAke3ZhbHVlQWNjZXNzb3J9Py51cmwgfHwgJycsIFxuJHtpbmRlbnR9ICAgICAgICB0aXRsZTogJHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJycsXG4ke2luZGVudH0gICAgICAgIG9wZW5zSW5OZXdUYWI6ICR7dmFsdWVBY2Nlc3Nvcn0/Lm9wZW5zSW5OZXdUYWIgfHwgZmFsc2VcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke2xpbmtIYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fTwvZGl2PmA7XG5cbiAgICBjYXNlICdidXR0b24nOlxuICAgICAgLy8gRm9yIGJ1dHRvbnMsIHByb3ZpZGUgbGFiZWwgZmllbGQgYW5kIGhyZWYgZmllbGQgd2l0aCBsaW5rIHBpY2tlclxuICAgICAgLy8gQnV0dG9uIHByb3BlcnRpZXM6IGxhYmVsLCBocmVmLCB0YXJnZXQsIHJlbCwgZGlzYWJsZWRcbiAgICAgIGNvbnN0IGJ1dHRvbkhhbmRsZXIgPSBvbkNoYW5nZUhhbmRsZXIoYHsgXG4gICAgICAgIC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIFxuICAgICAgICBocmVmOiB2YWx1ZS51cmwgfHwgJyMnLCBcbiAgICAgICAgdGFyZ2V0OiB2YWx1ZS5vcGVuc0luTmV3VGFiID8gJ19ibGFuaycgOiAnJyxcbiAgICAgICAgcmVsOiB2YWx1ZS5vcGVuc0luTmV3VGFiID8gJ25vb3BlbmVyIG5vcmVmZXJyZXInIDogJydcbiAgICAgIH1gKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdCdXR0b24gTGFiZWwnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGhpZGVMYWJlbEZyb21WaXNpb249e3RydWV9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIGxhYmVsOiB2YWx1ZSB9YCl9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICA8ZGl2IHN0eWxlPXt7IG1hcmdpblRvcDogJzhweCcgfX0+XG4ke2luZGVudH0gICAgPExpbmtDb250cm9sXG4ke2luZGVudH0gICAgICB2YWx1ZT17eyBcbiR7aW5kZW50fSAgICAgICAgdXJsOiAke3ZhbHVlQWNjZXNzb3J9Py5ocmVmIHx8ICcjJywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiR7aW5kZW50fSAgICAgICAgb3BlbnNJbk5ld1RhYjogJHt2YWx1ZUFjY2Vzc29yfT8udGFyZ2V0ID09PSAnX2JsYW5rJ1xuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7YnV0dG9uSGFuZGxlcn19XG4ke2luZGVudH0gICAgICBzZXR0aW5ncz17W1xuJHtpbmRlbnR9ICAgICAgICB7IGlkOiAnb3BlbnNJbk5ld1RhYicsIHRpdGxlOiBfXygnT3BlbiBpbiBuZXcgdGFiJywgJ2hhbmRvZmYnKSB9XG4ke2luZGVudH0gICAgICBdfVxuJHtpbmRlbnR9ICAgICAgc2hvd1N1Z2dlc3Rpb25zPXt0cnVlfVxuJHtpbmRlbnR9ICAgICAgc3VnZ2VzdGlvbnNRdWVyeT17eyB0eXBlOiAncG9zdCcsIHN1YnR5cGU6ICdhbnknIH19XG4ke2luZGVudH0gICAgLz5cbiR7aW5kZW50fSAgPC9kaXY+XG4ke2luZGVudH0gIDxUb2dnbGVDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdEaXNhYmxlZCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgY2hlY2tlZD17JHt2YWx1ZUFjY2Vzc29yfT8uZGlzYWJsZWQgfHwgZmFsc2V9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgZGlzYWJsZWQ6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH08L2Rpdj5gO1xuXG4gICAgY2FzZSAnc2VsZWN0Jzoge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMocHJvcGVydHkub3B0aW9ucykubWFwKG9wdCA9PlxuICAgICAgICBgeyBsYWJlbDogJyR7b3B0LmxhYmVsLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCB2YWx1ZTogJyR7b3B0LnZhbHVlfScgfWBcbiAgICAgICkuam9pbignLCAnKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFNlbGVjdENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvcHRpb25zPXtbJHtvcHRpb25zfV19XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdhcnJheSc6XG4gICAgICAvLyBIYW5kbGUgc2ltcGxlIHN0cmluZyBhcnJheXMgd2l0aCBhIHJlcGVhdGFibGUgbGlzdCBjb250cm9sXG4gICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgc2ltcGxlIHR5cGUgYXJyYXkgKHN0cmluZywgbnVtYmVyLCBldGMuKSB2cyBvYmplY3QgYXJyYXlcbiAgICAgIGNvbnN0IGl0ZW1UeXBlID0gcHJvcGVydHkuaXRlbXM/LnR5cGU7XG4gICAgICBpZiAoIXByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzICYmIChpdGVtVHlwZSA9PT0gJ3N0cmluZycgfHwgIWl0ZW1UeXBlKSkge1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIGxpc3QgY29udHJvbCBmb3Igc3RyaW5nIGFycmF5c1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2luZGVudH0gICAgeygke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5tYXAoKGxpc3RJdGVtLCBsaXN0SW5kZXgpID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGtleT17bGlzdEluZGV4fSBnYXA9ezJ9IGFsaWduPVwiY2VudGVyXCI+XG4ke2luZGVudH0gICAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSB9fT5cbiR7aW5kZW50fSAgICAgICAgICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICAgICAgICAgIHZhbHVlPXtsaXN0SXRlbSB8fCAnJ31cbiR7aW5kZW50fSAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBuZXdMaXN0W2xpc3RJbmRleF0gPSB2YWx1ZTtcbiR7aW5kZW50fSAgICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciBpdGVtLi4uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy11cC1hbHQyXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ01vdmUgdXAnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPT09IDApIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pXTtcbiR7aW5kZW50fSAgICAgICAgICAgIFtuZXdMaXN0W2xpc3RJbmRleF0sIG5ld0xpc3RbbGlzdEluZGV4IC0gMV1dID0gW25ld0xpc3RbbGlzdEluZGV4IC0gMV0sIG5ld0xpc3RbbGlzdEluZGV4XV07XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGRpc2FibGVkPXtsaXN0SW5kZXggPT09IDB9XG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy1kb3duLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSBkb3duJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBsaXN0ID0gJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXTtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPj0gbGlzdC5sZW5ndGggLSAxKSByZXR1cm47XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLmxpc3RdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggKyAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggKyAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA+PSAoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkubGVuZ3RoIC0gMX1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cInRyYXNoXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ1JlbW92ZScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5maWx0ZXIoKF8sIGkpID0+IGkgIT09IGxpc3RJbmRleCk7XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICkpfVxuJHtpbmRlbnR9ICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSksICcnXTtcbiR7aW5kZW50fSAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgPlxuJHtpbmRlbnR9ICAgICAge19fKCdBZGQgSXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgPC9CdXR0b24+XG4ke2luZGVudH0gIDwvRmxleD5cbiR7aW5kZW50fTwvZGl2PmA7XG4gICAgICB9XG4gICAgICAvLyBGb3Igb2JqZWN0IGFycmF5cywgZmFsbCB0aHJvdWdoIHRvIGRlZmF1bHQgKHRoZXNlIHNob3VsZCBiZSBoYW5kbGVkIGJ5IGdlbmVyYXRlQXJyYXlDb250cm9sIGF0IHRvcCBsZXZlbClcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAocHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWRDb250cm9scyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnR5LnByb3BlcnRpZXMpXG4gICAgICAgICAgLm1hcCgoW25lc3RlZEtleSwgbmVzdGVkUHJvcF0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYCR7dmFsdWVBY2Nlc3Nvcn0/LiR7bmVzdGVkS2V5fWAsXG4gICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gb25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sICR7bmVzdGVkS2V5fTogJHt2YWx9IH1gKSxcbiAgICAgICAgICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKG5lc3RlZEtleSwgbmVzdGVkUHJvcCwgbmVzdGVkQ29udGV4dCk7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7bmVzdGVkQ29udHJvbHN9XG4ke2luZGVudH08L0ZsZXg+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhcnJheSAocmVwZWF0ZXIpIGNvbnRyb2wgdXNpbmcgMTB1cCBSZXBlYXRlciBjb21wb25lbnRcbiAqIFByb3ZpZGVzIGRyYWctYW5kLWRyb3AgcmVvcmRlcmluZyBhbmQgYnVpbHQtaW4gYWRkL3JlbW92ZSBmdW5jdGlvbmFsaXR5XG4gKi9cbmNvbnN0IGdlbmVyYXRlQXJyYXlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBhdHRyTmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuXG4gIC8vIEdlbmVyYXRlIGZpZWxkIGNvbnRyb2xzIHRoYXQgdXNlIHNldEl0ZW0gZnJvbSB0aGUgUmVwZWF0ZXIgcmVuZGVyIHByb3BcbiAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICBjb25zdCBmaWVsZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbHVlfSB9KWAsXG4gICAgICBpbmRlbnQ6IGluZGVudCArICcgICAgICAnXG4gICAgfTtcbiAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgZmllbGRDb250ZXh0KTtcbiAgfSkuam9pbignXFxuJyk7XG5cbiAgLy8gR2V0IGEgZGlzcGxheSB0aXRsZSBmcm9tIHRoZSBmaXJzdCB0ZXh0IGZpZWxkIGlmIGF2YWlsYWJsZSwgZmFsbGJhY2sgdG8gZmllbGQgbGFiZWxcbiAgY29uc3QgZmlyc3RUZXh0RmllbGQgPSBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLmZpbmQoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICd0ZXh0Jyk7XG4gIGNvbnN0IHRpdGxlQWNjZXNzb3IgPSBmaXJzdFRleHRGaWVsZCA/IGBpdGVtLiR7Zmlyc3RUZXh0RmllbGRbMF19IHx8IGAgOiAnJztcbiAgXG4gIC8vIEN1c3RvbSBhZGQgYnV0dG9uIHdpdGggdGVydGlhcnkgc3R5bGluZywgcGx1cyBpY29uLCByaWdodCBhbGlnbmVkXG4gIC8vIGFkZEJ1dHRvbiBpcyBhIGZ1bmN0aW9uIHRoYXQgcmVjZWl2ZXMgYWRkSXRlbSBhbmQgcmV0dXJucyBhIFJlYWN0IGVsZW1lbnRcbiAgY29uc3QgYWRkQnV0dG9uSnN4ID0gYChhZGRJdGVtKSA9PiAoXG4ke2luZGVudH0gICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1hZGQtYnV0dG9uLXdyYXBwZXJcIj5cbiR7aW5kZW50fSAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgICAgb25DbGljaz17YWRkSXRlbX1cbiR7aW5kZW50fSAgICAgICAgaWNvbj17XG4ke2luZGVudH0gICAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj5cbiR7aW5kZW50fSAgICAgICAgICAgIDxwYXRoIGQ9XCJNMTEgMTIuNVYxNy41SDEyLjVWMTIuNUgxNy41VjExSDEyLjVWNkgxMVYxMUg2VjEyLjVIMTFaXCIvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3ZnPlxuJHtpbmRlbnR9ICAgICAgICB9XG4ke2luZGVudH0gICAgICAgIGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b25cIlxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICB7X18oJ0FkZCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICA8L2Rpdj5cbiR7aW5kZW50fSAgKWA7XG5cbiAgcmV0dXJuIGAke2luZGVudH08UmVwZWF0ZXIgXG4ke2luZGVudH0gIGF0dHJpYnV0ZT1cIiR7YXR0ck5hbWV9XCIgXG4ke2luZGVudH0gIGFsbG93UmVvcmRlcmluZz17dHJ1ZX0gXG4ke2luZGVudH0gIGRlZmF1bHRWYWx1ZT17e319XG4ke2luZGVudH0gIGFkZEJ1dHRvbj17JHthZGRCdXR0b25Kc3h9fVxuJHtpbmRlbnR9PlxuJHtpbmRlbnR9ICB7KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4ke2luZGVudH0gICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtXCI+XG4ke2luZGVudH0gICAgICA8ZGV0YWlscyBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19jb2xsYXBzZVwiPlxuJHtpbmRlbnR9ICAgICAgICA8c3VtbWFyeSBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19oZWFkZXJcIj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX190aXRsZVwiPnske3RpdGxlQWNjZXNzb3J9JyR7bGFiZWx9J308L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fYWN0aW9uc1wiIG9uQ2xpY2s9eyhlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpfT5cbiR7aW5kZW50fSAgICAgICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICAgICAgb25DbGljaz17cmVtb3ZlSXRlbX1cbiR7aW5kZW50fSAgICAgICAgICAgICAgaWNvbj17XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9XCJNNSA2LjVWMThhMiAyIDAgMDAyIDJoMTBhMiAyIDAgMDAyLTJWNi41aC0yLjVWMThhLjUuNSAwIDAxLS41LjVIOGEuNS41IDAgMDEtLjUtLjVWNi41SDV6TTkgOXY4aDEuNVY5SDl6bTQuNSAwdjhIMTVWOWgtMS41elwiLz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9XCJNMjAgNWgtNVYzLjVBMS41IDEuNSAwIDAwMTMuNSAyaC0zQTEuNSAxLjUgMCAwMDkgMy41VjVINHYxLjVoMTZWNXptLTYuNSAwaC0zVjMuNWgzVjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIDwvc3ZnPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9XG4ke2luZGVudH0gICAgICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlIGl0ZW0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgPC9zdW1tYXJ5PlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2ZpZWxkc1wiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2l0ZW1GaWVsZHN9XG4ke2luZGVudH0gICAgICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGV0YWlscz5cbiR7aW5kZW50fSAgICA8L2Rpdj5cbiR7aW5kZW50fSAgKX1cbiR7aW5kZW50fTwvUmVwZWF0ZXI+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIGluc3BlY3RvciBjb250cm9sIGZvciBhIHRvcC1sZXZlbCBwcm9wZXJ0eVxuICogVXNlcyBnZW5lcmF0ZUZpZWxkQ29udHJvbCB3aXRoIGEgc2V0QXR0cmlidXRlcyBjb250ZXh0XG4gKi9cbmNvbnN0IGdlbmVyYXRlUHJvcGVydHlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBpbmRlbnQ6IHN0cmluZyA9ICcgICAgICAgICAgJyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG5cbiAgLy8gRm9yIGFycmF5IHR5cGUsIHVzZSB0aGUgc3BlY2lhbGl6ZWQgYXJyYXkgY29udHJvbFxuICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgIHJldHVybiBnZW5lcmF0ZUFycmF5Q29udHJvbChrZXksIHByb3BlcnR5LCBhdHRyTmFtZSwgbGFiZWwsIGluZGVudCk7XG4gIH1cblxuICAvLyBGb3IgYWxsIG90aGVyIHR5cGVzLCB1c2UgdGhlIHVuaWZpZWQgZmllbGQgY29udHJvbCBnZW5lcmF0b3JcbiAgY29uc3QgY29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgIHZhbHVlQWNjZXNzb3I6IGF0dHJOYW1lLFxuICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlKSA9PiBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiAke3ZhbHVlfSB9KWAsXG4gICAgaW5kZW50XG4gIH07XG5cbiAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGtleSwgcHJvcGVydHksIGNvbnRleHQpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5IHR5cGVcbiAqL1xuY29uc3QgZ2V0RGVmYXVsdFZhbHVlID0gKGZpZWxkUHJvcDogSGFuZG9mZlByb3BlcnR5KTogYW55ID0+IHtcbiAgc3dpdGNoIChmaWVsZFByb3AudHlwZSkge1xuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgcmV0dXJuIHsgbGFiZWw6ICcnLCB1cmw6ICcnLCBvcGVuc0luTmV3VGFiOiBmYWxzZSB9O1xuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIGhyZWY6ICcjJywgdGFyZ2V0OiAnJywgcmVsOiAnJywgZGlzYWJsZWQ6IGZhbHNlIH07XG4gICAgY2FzZSAnaW1hZ2UnOlxuICAgICAgcmV0dXJuIHsgc3JjOiAnJywgYWx0OiAnJyB9O1xuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIHJldHVybiB7IHNyYzogJycsIGlkOiAnJywgcG9zdGVyOiAnJywgdHlwZTogJycsIHdpZHRoOiAwLCBoZWlnaHQ6IDAsIG1pbWU6ICcnLCBtaW1lVHlwZTogJycgfTtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKGZpZWxkUHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZDogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtuZXN0ZWRLZXksIG5lc3RlZFByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkUHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgIG5lc3RlZFtuZXN0ZWRLZXldID0gZ2V0RGVmYXVsdFZhbHVlKG5lc3RlZFByb3ApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXN0ZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge307XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAwO1xuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIHJldHVybiBbXTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGhlbHBlciBmdW5jdGlvbnMgZm9yIGFycmF5IHByb3BlcnRpZXNcbiAqIE5vdGU6IFdpdGggdGhlIDEwdXAgUmVwZWF0ZXIgY29tcG9uZW50LCB3ZSBubyBsb25nZXIgbmVlZCBjdXN0b20gYWRkL3VwZGF0ZS9yZW1vdmUvbW92ZSBmdW5jdGlvbnNcbiAqIFRoZSBSZXBlYXRlciBoYW5kbGVzIGFsbCBvZiB0aGlzIGludGVybmFsbHkgdmlhIGl0cyByZW5kZXIgcHJvcFxuICovXG5jb25zdCBnZW5lcmF0ZUFycmF5SGVscGVycyA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogc3RyaW5nID0+IHtcbiAgLy8gVGhlIDEwdXAgUmVwZWF0ZXIgY29tcG9uZW50IGhhbmRsZXMgYXJyYXkgbWFuaXB1bGF0aW9uIGludGVybmFsbHlcbiAgLy8gTm8gY3VzdG9tIGhlbHBlciBmdW5jdGlvbnMgYXJlIG5lZWRlZFxuICByZXR1cm4gJyc7XG59O1xuXG5cbi8qKlxuICogRGV0ZXJtaW5pc3RpYyBoYXNoIG9mIGEgc3RyaW5nIHRvIGEgbnVtYmVyIGluIFswLCBtYXgpLlxuICovXG5jb25zdCBoYXNoU3RyaW5nID0gKHN0cjogc3RyaW5nLCBtYXg6IG51bWJlcik6IG51bWJlciA9PiB7XG4gIGxldCBoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBoID0gKChoIDw8IDUpIC0gaCArIHN0ci5jaGFyQ29kZUF0KGkpKSB8IDA7XG4gIH1cbiAgcmV0dXJuICgoaCAlIG1heCkgKyBtYXgpICUgbWF4O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbiBTVkcgaWNvbiBlbGVtZW50IHN0cmluZyBmb3IgdXNlIGluIHJlZ2lzdGVyQmxvY2tUeXBlLlxuICogQ3JlYXRlcyBhIGNvbG9yZWQgcm91bmRlZCByZWN0YW5nbGUgd2l0aCAxLTIgbGV0dGVyIGluaXRpYWxzIGRlcml2ZWRcbiAqIGZyb20gdGhlIGJsb2NrIHRpdGxlLCB3aXRoIHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGtleWVkIHRvIHRoZSBncm91cC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVTdmdJY29uID0gKHRpdGxlOiBzdHJpbmcsIGdyb3VwOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBHUk9VUF9DT0xPUlMgPSBbXG4gICAgJyM1QjIxQjYnLCAnIzBFNzQ5MCcsICcjQjQ1MzA5JywgJyMwNDc4NTcnLFxuICAgICcjQkUxMjNDJywgJyM0MzM4Q0EnLCAnIzAzNjlBMScsICcjQTE2MjA3JyxcbiAgICAnIzE1ODAzRCcsICcjOTMzM0VBJywgJyNDMjQxMEMnLCAnIzFENEVEOCcsXG4gICAgJyMwNTk2NjknLCAnIzdDM0FFRCcsICcjREMyNjI2JywgJyMyNTYzRUInLFxuICBdO1xuXG4gIGNvbnN0IHdvcmRzID0gdGl0bGUuc3BsaXQoL1tcXHNfLV0rLykuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBpbml0aWFscyA9IHdvcmRzLmxlbmd0aCA+PSAyXG4gICAgPyAod29yZHNbMF1bMF0gKyB3b3Jkc1sxXVswXSkudG9VcHBlckNhc2UoKVxuICAgIDogKHdvcmRzWzBdPy5zdWJzdHJpbmcoMCwgMikgfHwgJ0hPJykudG9VcHBlckNhc2UoKTtcblxuICBjb25zdCBjb2xvciA9IEdST1VQX0NPTE9SU1toYXNoU3RyaW5nKGdyb3VwIHx8IHRpdGxlLCBHUk9VUF9DT0xPUlMubGVuZ3RoKV07XG5cbiAgcmV0dXJuIGA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+XG4gICAgICA8cmVjdCB4PVwiMlwiIHk9XCIyXCIgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgcng9XCI0XCIgZmlsbD1cIiR7Y29sb3J9XCIgLz5cbiAgICAgIDx0ZXh0IHg9XCIxMlwiIHk9XCIxNi41XCIgdGV4dEFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCJ3aGl0ZVwiIGZvbnRTaXplPVwiMTBcIiBmb250RmFtaWx5PVwiLWFwcGxlLXN5c3RlbSxCbGlua01hY1N5c3RlbUZvbnQsc2Fucy1zZXJpZlwiIGZvbnRXZWlnaHQ9XCI2MDBcIj4ke2luaXRpYWxzfTwvdGV4dD5cbiAgICA8L3N2Zz5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBjb21wbGV0ZSBpbmRleC5qcyBmaWxlXG4gKiBAcGFyYW0gY29tcG9uZW50IC0gVGhlIEhhbmRvZmYgY29tcG9uZW50IGRhdGFcbiAqIEBwYXJhbSBkeW5hbWljQXJyYXlDb25maWdzIC0gT3B0aW9uYWwgZHluYW1pYyBhcnJheSBjb25maWd1cmF0aW9ucyBrZXllZCBieSBmaWVsZCBuYW1lXG4gKiBAcGFyYW0gaW5uZXJCbG9ja3NGaWVsZCAtIFRoZSByaWNodGV4dCBmaWVsZCB0aGF0IHVzZXMgSW5uZXJCbG9ja3MsIG9yIG51bGwgaWYgbm9uZVxuICogQHBhcmFtIGRlcHJlY2F0aW9uc0NvZGUgLSBPcHRpb25hbCBkZXByZWNhdGlvbiBtaWdyYXRpb24gY29kZVxuICogQHBhcmFtIGhhc1NjcmVlbnNob3QgLSBXaGV0aGVyIGEgc2NyZWVuc2hvdC5wbmcgaXMgYXZhaWxhYmxlIGZvciBpbnNlcnRlciBwcmV2aWV3XG4gKi9cbmNvbnN0IGdlbmVyYXRlSW5kZXhKcyA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCxcbiAgZGVwcmVjYXRpb25zQ29kZT86IHN0cmluZyxcbiAgaGFzU2NyZWVuc2hvdD86IGJvb2xlYW5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IHRvQmxvY2tOYW1lKGNvbXBvbmVudC5pZCk7XG4gIGNvbnN0IHByb3BlcnRpZXMgPSBjb21wb25lbnQucHJvcGVydGllcztcblxuICAvLyBoYXNEeW5hbWljQXJyYXlzIGlzIHRydWUgb25seSB3aGVuIHRoZXJlIGFyZSBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBmaWVsZHMg4oCUXG4gIC8vIHRoZSBzaW1wbGVyIHR5cGVzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uKSBkb24ndCBuZWVkIER5bmFtaWNQb3N0U2VsZWN0b3IuXG4gIGNvbnN0IGhhc0R5bmFtaWNBcnJheXMgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoXG4gICAgICAgIChjKSA9PiAhKCdhcnJheVR5cGUnIGluIGMpXG4gICAgICApXG4gICAgOiBmYWxzZTtcblxuICAvLyBIZWxwZXIgdG8gY2hlY2sgZm9yIGEgdHlwZSBpbiBwcm9wZXJ0aWVzLCBpbmNsdWRpbmcgbmVzdGVkIGluIGFycmF5cy9vYmplY3RzXG4gIGNvbnN0IGhhc1Byb3BlcnR5VHlwZSA9ICh0eXBlOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCBjaGVja1Byb3BlcnR5ID0gKHByb3A6IEhhbmRvZmZQcm9wZXJ0eSk6IGJvb2xlYW4gPT4ge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gdHlwZSkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AuaXRlbXMucHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gIH07XG5cbiAgLy8gVGhlIGlubmVyQmxvY2tzRmllbGQgdXNlcyBJbm5lckJsb2NrcyAoY29udGVudCBzdG9yZWQgaW4gcG9zdF9jb250ZW50LCBub3QgYW4gYXR0cmlidXRlKS5cbiAgLy8gQWxsIG90aGVyIHJpY2h0ZXh0IGZpZWxkcyBiZWNvbWUgc3RyaW5nIGF0dHJpYnV0ZXMgd2l0aCBSaWNoVGV4dCBlZGl0aW5nLlxuICBjb25zdCB1c2VJbm5lckJsb2NrcyA9ICEhaW5uZXJCbG9ja3NGaWVsZDtcblxuICAvLyBHZXQgYWxsIGF0dHJpYnV0ZSBuYW1lcyDigJMgZXhjbHVkZSBpbm5lckJsb2Nrc0ZpZWxkIGFuZCBwYWdpbmF0aW9uXG4gIGNvbnN0IGF0dHJOYW1lcyA9IE9iamVjdC5rZXlzKHByb3BlcnRpZXMpXG4gICAgLmZpbHRlcihrID0+IGsgIT09IGlubmVyQmxvY2tzRmllbGQgJiYgcHJvcGVydGllc1trXS50eXBlICE9PSAncGFnaW5hdGlvbicpXG4gICAgLm1hcCh0b0NhbWVsQ2FzZSk7XG5cbiAgLy8gSW5jbHVkZSBhbnkgYXR0cmlidXRlIG5hbWVzIHJlZmVyZW5jZWQgaW4gdGhlIHRlbXBsYXRlIGJ1dCBtaXNzaW5nIGZyb20gQVBJIHByb3BlcnRpZXNcbiAgLy8gKGUuZy4gYm9keSAtPiBibG9ja0JvZHkgc28gSlNYIGhhcyBhIGRlZmluZWQgdmFyaWFibGUgYW5kIG5vIFJlZmVyZW5jZUVycm9yKS5cbiAgLy8gU2tpcCB0aGUgaW5uZXJCbG9ja3NGaWVsZCDigJQgaXRzIGNvbnRlbnQgaXMgc3RvcmVkIHZpYSBJbm5lckJsb2Nrcywgbm90IGFzIGFuIGF0dHJpYnV0ZS5cbiAgY29uc3QgaW5uZXJCbG9ja3NBdHRyTmFtZSA9IGlubmVyQmxvY2tzRmllbGQgPyB0b0NhbWVsQ2FzZShpbm5lckJsb2Nrc0ZpZWxkKSA6IG51bGw7XG4gIGZvciAoY29uc3QgbmFtZSBvZiBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyhjb21wb25lbnQuY29kZSkpIHtcbiAgICBpZiAoIWF0dHJOYW1lcy5pbmNsdWRlcyhuYW1lKSAmJiBuYW1lICE9PSBpbm5lckJsb2Nrc0F0dHJOYW1lKSBhdHRyTmFtZXMucHVzaChuYW1lKTtcbiAgfVxuICBcbiAgLy8gQWRkIGR5bmFtaWMgYXJyYXkgYXR0cmlidXRlIG5hbWVzIGJhc2VkIG9uIGNvbmZpZyB0eXBlXG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgICAgICBpZiAoKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pIHtcbiAgICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZGApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIGNvbXBvbmVudHMgd2UgbmVlZCB0byBpbXBvcnRcbiAgY29uc3QgbmVlZHNNZWRpYVVwbG9hZCA9IGhhc1Byb3BlcnR5VHlwZSgnaW1hZ2UnKTtcbiAgY29uc3QgbmVlZHNSYW5nZUNvbnRyb2wgPSBoYXNPcGFjaXR5UmFuZ2VGaWVsZChwcm9wZXJ0aWVzKTtcbiAgY29uc3QgbmVlZHNUb2dnbGVDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcbiAgY29uc3QgbmVlZHNTZWxlY3RDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdzZWxlY3QnKTtcbiAgY29uc3QgaGFzQXJyYXlQcm9wcyA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+IHAudHlwZSA9PT0gJ2FycmF5Jyk7XG4gIGNvbnN0IGhhc09iamVjdFByb3BzID0gaGFzUHJvcGVydHlUeXBlKCdvYmplY3QnKTtcblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICB9XG4gIC8vIElubmVyQmxvY2tzIGZvciB0aGUgZGVzaWduYXRlZCByaWNodGV4dCBjb250ZW50IGFyZWFcbiAgaWYgKHVzZUlubmVyQmxvY2tzKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cbiAgLy8gTGlua0NvbnRyb2wgZm9yIGxpbmsvYnV0dG9uIGZpZWxkcyAod2hlbiBub3QgdXNpbmcgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQpXG4gIGNvbnN0IG5lZWRzTGlua0NvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuXG4gIGNvbnN0IGhhc0JyZWFkY3J1bWJzQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzVGF4b25vbXlBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNUYXhvbm9teUNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICAvLyBUb2dnbGVDb250cm9sOiBvbmx5IGZvciBib29sZWFuL2J1dHRvbiBwcm9wZXJ0eSBmaWVsZHMg4oCUIHNwZWNpYWwgYXJyYXkgdHlwZXMgdXNlIHNoYXJlZCBjb21wb25lbnRzXG4gIGlmIChuZWVkc1RvZ2dsZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVG9nZ2xlQ29udHJvbCcpO1xuICAvLyBTZWxlY3RDb250cm9sOiBvbmx5IGZvciBzZWxlY3QgcHJvcGVydHkgZmllbGRzIG9yIER5bmFtaWNQb3N0U2VsZWN0b3IgKHBvc3RzKSDigJQgdGF4b25vbXkgaGFuZGxlZCBieSBUYXhvbm9teVNlbGVjdG9yXG4gIGlmIChuZWVkc1NlbGVjdENvbnRyb2wgfHwgaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTZWxlY3RDb250cm9sJyk7XG4gIC8vIFNwaW5uZXIgZm9yIGR5bmFtaWMgYXJyYXkgbG9hZGluZyBzdGF0ZSBpbiBlZGl0b3IgcHJldmlld1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTcGlubmVyJyk7XG4gIC8vIFRleHRhcmVhQ29udHJvbDogbmVlZGVkIHdoZW4gcmljaHRleHQgZmllbGRzIGFwcGVhciBpbnNpZGUgYXJyYXkgaXRlbXNcbiAgY29uc3QgaGFzUmljaHRleHRJbkFycmF5ID0gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKHAgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgcC5pdGVtcz8ucHJvcGVydGllcyAmJlxuICAgIE9iamVjdC52YWx1ZXMocC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGlwID0+IGlwLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICk7XG4gIGlmIChoYXNSaWNodGV4dEluQXJyYXkpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVGV4dGFyZWFDb250cm9sJyk7XG5cbiAgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdGbGV4Jyk7XG5cbiAgLy8gMTB1cCBibG9jay1jb21wb25lbnRzIGltcG9ydHNcbiAgLy8gUmVwZWF0ZXIgaXMgb25seSBuZWVkZWQgd2hlbiB0aGVyZSBhcmUgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHMgaW4gdGhlIHNpZGViYXJcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJyYXlzIHVzZSBzaGFyZWQgY29tcG9uZW50cyB0aGF0IGltcG9ydCBSZXBlYXRlciB0aGVtc2VsdmVzKVxuICBjb25zdCBoYXNOb25TcGVjaWFsQXJyYXlQcm9wcyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgKCFkeW5hbWljQXJyYXlDb25maWdzPy5ba10gfHwgISgnYXJyYXlUeXBlJyBpbiBkeW5hbWljQXJyYXlDb25maWdzW2tdKSlcbiAgKTtcbiAgY29uc3QgdGVuVXBJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMpIHtcbiAgICB0ZW5VcEltcG9ydHMucHVzaCgnUmVwZWF0ZXInKTtcbiAgfVxuXG4gIC8vIEdlbmVyYXRlIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnMocHJvcGVydGllcyk7XG5cbiAgLy8gR2VuZXJhdGUgSlNYIHByZXZpZXcgZnJvbSBoYW5kbGViYXJzIHRlbXBsYXRlXG4gIC8vIFRoaXMgbXVzdCBoYXBwZW4gYmVmb3JlIHBhbmVsIGdlbmVyYXRpb24gc28gd2Uga25vdyB3aGljaCBmaWVsZHMgaGF2ZSBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBwcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgIGNvbXBvbmVudC5jb2RlLFxuICAgIHByb3BlcnRpZXMsXG4gICAgY29tcG9uZW50LmlkLFxuICAgIGNvbXBvbmVudC50aXRsZSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkXG4gICk7XG4gIGxldCBwcmV2aWV3SnN4ID0gcHJldmlld1Jlc3VsdC5qc3g7XG4gIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gcHJldmlld1Jlc3VsdC5pbmxpbmVFZGl0YWJsZUZpZWxkcztcblxuICAvLyBEZXRlY3QgaWYgcHJldmlldyB1c2VzIEhhbmRvZmZMaW5rRmllbGQgKGxpbmsvYnV0dG9uIGlubGluZSBlZGl0aW5nKVxuICBjb25zdCBwcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxIYW5kb2ZmTGlua0ZpZWxkJyk7XG5cbiAgLy8gR2VuZXJhdGUgcGFuZWwgYm9kaWVzIGZvciBlYWNoIHByb3BlcnR5XG4gIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIHJpY2h0ZXh0IHVzZXMgSW5uZXJCbG9ja3Mgb24gdGhlIGNhbnZhcyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICAvLyBwYWdpbmF0aW9uIGlzIGF1dG8tZ2VuZXJhdGVkIGZyb20gcXVlcnkgcmVzdWx0cyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyB8fCBwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgaW5saW5lLWVkaXRhYmxlIG9uIHRoZSBjYW52YXMgKHRleHQsIGltYWdlLCBsaW5rLCBidXR0b25cbiAgICAvLyB3cmFwcGVkIGluIHt7I2ZpZWxkfX0pIOKAkyB0aGV5IGRvbid0IG5lZWQgc2lkZWJhciBjb250cm9scy5cbiAgICAvLyBBcnJheSBmaWVsZHMgYXJlIGFsd2F5cyBrZXB0OiB0aGV5IG5lZWQgc2lkZWJhciBVSSBmb3IgbWFudWFsL2R5bmFtaWMgdG9nZ2xlXG4gICAgLy8gYW5kIGZvciBhZGRpbmcvcmVtb3ZpbmcgaXRlbXMsIGV2ZW4gd2hlbiB0aGVpciBjaGlsZCBmaWVsZHMgYXJlIGlubGluZS1lZGl0YWJsZS5cbiAgICBpZiAoaW5saW5lRWRpdGFibGVGaWVsZHMuaGFzKGtleSkgJiYgcHJvcGVydHkudHlwZSAhPT0gJ2FycmF5JykgY29udGludWU7XG5cbiAgICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZHluYW1pY0NvbmZpZyA9IGR5bmFtaWNBcnJheUNvbmZpZ3M/LltrZXldO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBkeW5hbWljIGFycmF5IGZpZWxkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gQnJlYWRjcnVtYnM6IHNoYXJlZCBjb21wb25lbnQgd2l0aCBzaW5nbGUgdmlzaWJpbGl0eSB0b2dnbGVcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBCcmVhZGNydW1icyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIFRheG9ub215OiBzaGFyZWQgY29tcG9uZW50IHdpdGggQXV0byAvIE1hbnVhbCB0YWJzXG4gICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRUYXhvbm9teSA9IGR5bmFtaWNDb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgID8gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbH0gfSlgLFxuICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAnLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgIH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG4nKVxuICAgICAgICAgIDogYCAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdVUkwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS51cmwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIHVybDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5gO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFRheG9ub215ICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgdGF4b25vbXlPcHRpb25zPXske0pTT04uc3RyaW5naWZ5KHRheG9ub215T3B0aW9ucyl9fVxuICAgICAgICAgICAgICBkZWZhdWx0VGF4b25vbXk9XCIke2RlZmF1bHRUYXhvbm9teX1cIlxuICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICByZW5kZXJNYW51YWxJdGVtcz17KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4gICAgICAgICAgICAgICAgPD5cbiR7aXRlbUZpZWxkc31cbiAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBQYWdpbmF0aW9uOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gUGFnaW5hdGlvbiAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFBhZ2luYXRpb25TZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQb3N0cyAoRHluYW1pY0FycmF5Q29uZmlnKTogZnVsbCBEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgIGNvbnN0IGRlZmF1bHRNb2RlID0gZHluYW1pY0NvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAnbWFudWFsJyA/ICdzZWxlY3QnIDogJ3F1ZXJ5JztcbiAgICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0NvbmZpZyA9IGR5bmFtaWNDb25maWcuaXRlbU92ZXJyaWRlc0NvbmZpZyB8fCB7fTtcbiAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBpdGVtT3ZlcnJpZGVzQ29uZmlnIChsZWdhY3kpXG4gICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICBpZiAoYy5tb2RlID09PSAndWknKSB7XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZSwgbGFiZWw6IGMubGFiZWwsIHR5cGU6ICdzZWxlY3QnLCBvcHRpb25zOiBub3JtYWxpemVTZWxlY3RPcHRpb25zKGMub3B0aW9ucyksIGRlZmF1bHQ6IGMuZGVmYXVsdCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBmaWVsZE1hcHBpbmcgd2l0aCB0eXBlOiBcIm1hbnVhbFwiIOKAlCBkZXJpdmUgY29udHJvbCB0eXBlIGZyb20gaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBmaWVsZE1hcHBpbmcgPSBkeW5hbWljQ29uZmlnLmZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbZmllbGRQYXRoLCBtYXBwaW5nVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwcGluZykpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgY29uc3QgdG9wS2V5ID0gZmllbGRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1t0b3BLZXldO1xuICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICBsZXQgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICBsZXQgb3B0aW9uczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgaWYgKGl0ZW1Qcm9wKSB7XG4gICAgICAgICAgICAgIHN3aXRjaCAoaXRlbVByb3AudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdzZWxlY3QnO1xuICAgICAgICAgICAgICAgICAgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoaXRlbVByb3Aub3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3RvZ2dsZSc7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gMDtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZTogZmllbGRQYXRoLCBsYWJlbDogZmllbGRMYWJlbCwgdHlwZTogY29udHJvbFR5cGUsIG9wdGlvbnMsIGRlZmF1bHQ6IGRlZmF1bHRWYWwgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhZ2luYXRpb25Ub2dnbGUgPSBkeW5hbWljQ29uZmlnLnBhZ2luYXRpb25cbiAgICAgICAgICA/IGBcbiAgICAgICAgICAgICAgICA8VG9nZ2xlQ29udHJvbFxuICAgICAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93IFBhZ2luYXRpb24nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgY2hlY2tlZD17JHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZCA/PyB0cnVlfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQ6IHZhbHVlIH0pfVxuICAgICAgICAgICAgICAgIC8+YFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gRHluYW1pYyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgdmFsdWU9e3tcbiAgICAgICAgICAgICAgICBzb3VyY2U6ICR7YXR0ck5hbWV9U291cmNlIHx8ICcke2RlZmF1bHRNb2RlfScsXG4gICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7YXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgcXVlcnlBcmdzOiAke2F0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZFBvc3RzOiAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsobmV4dFZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVBvc3RUeXBlOiBuZXh0VmFsdWUucG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1RdWVyeUFyZ3M6IHsgLi4ubmV4dFZhbHVlLnF1ZXJ5QXJncywgcG9zdF90eXBlOiBuZXh0VmFsdWUucG9zdFR5cGUgfSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlczogbmV4dFZhbHVlLml0ZW1PdmVycmlkZXMgPz8ge31cbiAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICBwb3N0VHlwZXM6ICR7SlNPTi5zdHJpbmdpZnkoZHluYW1pY0NvbmZpZy5wb3N0VHlwZXMpfSxcbiAgICAgICAgICAgICAgICBtYXhJdGVtczogJHtkeW5hbWljQ29uZmlnLm1heEl0ZW1zID8/IDIwfSxcbiAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgc2hvd0RhdGVGaWx0ZXI6ICR7KGR5bmFtaWNDb25maWcgYXMgYW55KS5zaG93RGF0ZUZpbHRlciA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZSd9LFxuICAgICAgICAgICAgICAgIHNob3dFeGNsdWRlQ3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPiR7cGFnaW5hdGlvblRvZ2dsZX1cbiAgICAgICAgICAgIHske2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcgJiYgKFxuICAgICAgICAgICAgICA8PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTdGFuZGFyZCBwYW5lbCAobm9uLWR5bmFtaWMpXG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG4gIH1cblxuICAvLyBBZGQgSGFuZG9mZiBkZXNpZ24gc3lzdGVtIGxpbmtzIHBhbmVsXG4gIGNvbnN0IGRlc2lnblN5c3RlbVBhbmVsID0gW1xuICAgICcgICAgICAgICAgey8qIERlc2lnbiBTeXN0ZW0gTGlua3MgKi99JyxcbiAgICAnICAgICAgICAgIHsobWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsIHx8IG1ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwpICYmICgnLFxuICAgICcgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXyhcXCdEZXNpZ24gU3lzdGVtXFwnLCBcXCdoYW5kb2ZmXFwnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT4nLFxuICAgICcgICAgICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+JyxcbiAgICAnICAgICAgICAgICAgICAgIHttZXRhZGF0YS5fX2hhbmRvZmY/LmhhbmRvZmZVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmhhbmRvZmZVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdWaWV3IGluIEhhbmRvZmZcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5maWdtYVVybCAmJiAoJyxcbiAgICAnICAgICAgICAgICAgICAgICAgPEJ1dHRvbicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBocmVmPXttZXRhZGF0YS5fX2hhbmRvZmYuZmlnbWFVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBcXCcxMDAlXFwnLCBqdXN0aWZ5Q29udGVudDogXFwnY2VudGVyXFwnIH19JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAge19fKFxcJ09wZW4gaW4gRmlnbWFcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgPC9GbGV4PicsXG4gICAgJyAgICAgICAgICAgIDwvUGFuZWxCb2R5PicsXG4gICAgJyAgICAgICAgICApfScsXG4gIF0uam9pbignXFxuJyk7XG4gIHBhbmVscy5wdXNoKGRlc2lnblN5c3RlbVBhbmVsKTtcblxuICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gZm9yIGVkaXRvciBwcmV2aWV3LlxuICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAvLyBCcmVhZGNydW1iczogbGl2ZSBmZXRjaCB2aWEgUkVTVCBlbmRwb2ludFxuICAvLyBUYXhvbm9teSAoYXV0byBtb2RlKTogbGl2ZSBmZXRjaCB2aWEgdXNlU2VsZWN0IHdpdGggY29yZS1kYXRhXG4gIC8vIFBhZ2luYXRpb246IHNlcnZlci1yZW5kZXJlZCBvbmx5IChzdHViIHZhcmlhYmxlKVxuICBsZXQgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSAnJztcbiAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGRLZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGRLZXkpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnNcbiAgICAgICAgICA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBbcHJldmlldyR7Y2FwfSwgc2V0UHJldmlldyR7Y2FwfV0gPSB1c2VTdGF0ZShudWxsKTtcbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgICAudGhlbigoaXRlbXMpID0+IHNldFByZXZpZXcke2NhcH0oKGl0ZW1zIHx8IFtdKSR7bWFwRXhwcn0pKVxuICAgICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICAgIH0sIFske2F0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7Y2FwfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgICAgaWYgKCR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJykgcmV0dXJuICR7YXR0ck5hbWV9IHx8IFtdO1xuICAgICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0YXhvbm9teSA9ICR7YXR0ck5hbWV9VGF4b25vbXkgfHwgJyR7Y29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJ30nO1xuICAgICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0ZXJtcyA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRFbnRpdHlSZWNvcmRzKCd0YXhvbm9teScsIHRheG9ub215LCB7IHBvc3Q6IHBvc3RJZCwgcGVyX3BhZ2U6ICR7Y29uZmlnLm1heEl0ZW1zID8/IC0xfSB9KTtcbiAgICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgICB9LFxuICAgICAgWyR7YXR0ck5hbWV9RW5hYmxlZCwgJHthdHRyTmFtZX1Tb3VyY2UsICR7YXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7YXR0ck5hbWV9IHx8IFtdKV1cbiAgICApO1xuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1BhZ2luYXRpb25Db25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpOiBmdWxsIHVzZVNlbGVjdCByZXNvbHV0aW9uXG4gICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICBjb25zdCByZXNvbHZlZFZhck5hbWUgPSBgcmVzb2x2ZWQke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgY29uc3Qgc291cmNlQXR0ciA9IGAke2F0dHJOYW1lfVNvdXJjZWA7XG4gICAgICBjb25zdCBxdWVyeUFyZ3NBdHRyID0gYCR7YXR0ck5hbWV9UXVlcnlBcmdzYDtcbiAgICAgIGNvbnN0IHBvc3RUeXBlQXR0ciA9IGAke2F0dHJOYW1lfVBvc3RUeXBlYDtcbiAgICAgIGNvbnN0IHNlbGVjdGVkUG9zdHNBdHRyID0gYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2A7XG4gICAgICBjb25zdCBmaWVsZE1hcHBpbmdBdHRyID0gYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYDtcbiAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNBdHRyID0gYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2A7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgJHtyZXNvbHZlZFZhck5hbWV9ID0gdXNlU2VsZWN0KFxuICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgIGNvbnN0IHF1ZXJ5QXJncyA9ICR7cXVlcnlBcmdzQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3QgcG9zdFR5cGUgPSAke3Bvc3RUeXBlQXR0cn0gfHwgJ3Bvc3QnO1xuICAgICAgICAgIGNvbnN0IGFyZ3MgPSB7XG4gICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7Y29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgb3JkZXI6IChxdWVyeUFyZ3Mub3JkZXIgfHwgJ0RFU0MnKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAocXVlcnlBcmdzLnRheF9xdWVyeSAmJiBxdWVyeUFyZ3MudGF4X3F1ZXJ5Lmxlbmd0aCkge1xuICAgICAgICAgICAgcXVlcnlBcmdzLnRheF9xdWVyeS5mb3JFYWNoKCh0cSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIXRxLnRheG9ub215IHx8ICF0cS50ZXJtcyB8fCAhdHEudGVybXMubGVuZ3RoKSByZXR1cm47XG4gICAgICAgICAgICAgIGNvbnN0IHBhcmFtID0gdHEudGF4b25vbXkgPT09ICdjYXRlZ29yeScgPyAnY2F0ZWdvcmllcycgOiB0cS50YXhvbm9teSA9PT0gJ3Bvc3RfdGFnJyA/ICd0YWdzJyA6IHRxLnRheG9ub215O1xuICAgICAgICAgICAgICBhcmdzW3BhcmFtXSA9IHRxLnRlcm1zLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShyZWNvcmRzKSkgcmV0dXJuIFtdO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW107XG4gICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gc2VsZWN0ZWRcbiAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICByZXR1cm4gcmVjID8gbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSkgOiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSxcbiAgICAgIFske3NvdXJjZUF0dHJ9LCAke3Bvc3RUeXBlQXR0cn0sIEpTT04uc3RyaW5naWZ5KCR7cXVlcnlBcmdzQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke3NlbGVjdGVkUG9zdHNBdHRyfSB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fSldXG4gICAgKTtcbiAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7c291cmNlQXR0cn0gIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHthdHRyTmFtZX0gPz8gW10pO1xuICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAvLyBVc2UgcHJldmlldyB2YXJpYWJsZSBpbiB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgSlNYIHNvIHRoZSBlZGl0b3Igc2hvd3MgcXVlcnkvc2VsZWN0IHJlc3VsdHNcbiAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBwcmV2aWV3VmFyTmFtZSk7XG4gICAgfVxuICAgIGlmIChyZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgaXNQcmV2aWV3TG9hZGluZyA9ICR7cmVzb2x2aW5nRmxhZ3Muam9pbignIHx8ICcpfTtcbmA7XG4gICAgfVxuICAgIC8vIFdoZW4gcHJldmlldyBKU1ggcmVmZXJlbmNlcyBwYWdpbmF0aW9uIChmcm9tIEhCUykgYnV0IHBhZ2luYXRpb24gaXMgb25seSBidWlsdCBzZXJ2ZXItc2lkZSxcbiAgICAvLyBkZWZpbmUgaXQgaW4gdGhlIGVkaXQgc28gdGhlIGVkaXRvciBkb2Vzbid0IHRocm93IFJlZmVyZW5jZUVycm9yLlxuICAgIGNvbnN0IHByZXZpZXdVc2VzUGFnaW5hdGlvbiA9IC9cXGJwYWdpbmF0aW9uXFxiLy50ZXN0KHByZXZpZXdKc3gpO1xuICAgIGNvbnN0IGFueUNvbmZpZ0hhc1BhZ2luYXRpb24gPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSAmJiAhIShjIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbilcbiAgICAgIDogZmFsc2U7XG4gICAgaWYgKHByZXZpZXdVc2VzUGFnaW5hdGlvbiAmJiBhbnlDb25maWdIYXNQYWdpbmF0aW9uICYmICFkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZS5pbmNsdWRlcygnY29uc3QgcGFnaW5hdGlvbicpKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSA9IGAgICAgY29uc3QgcGFnaW5hdGlvbiA9IFtdOyAvLyBFZGl0b3I6IHBhZ2luYXRpb24gaXMgYnVpbHQgc2VydmVyLXNpZGUgaW4gcmVuZGVyLnBocFxuYCArIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdXNpbmcgZHluYW1pYyBwb3N0cywgd3JhcCBwcmV2aWV3IGluIGxvYWRpbmcgc3RhdGVcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgcHJldmlld0NvbnRlbnQgPSByZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwXG4gICAgPyBge2lzUHJldmlld0xvYWRpbmcgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCIke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcgaXMtbG9hZGluZ1wiIHN0eWxlPXt7IG1pbkhlaWdodDogJzEyMHB4JywgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBnYXA6ICc4cHgnIH19PlxuICAgICAgICAgICAgPFNwaW5uZXIgLz5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGNvbG9yOiAndmFyKC0td3AtYWRtaW4tdGhlbWUtY29sb3ItZGFya2VyLCAjMWUxZTFlKScgfX0+e19fKCdMb2FkaW5nIHBvc3Rz4oCmJywgJ2hhbmRvZmYnKX08L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICkgOiAoXG4ke3ByZXZpZXdKc3h9XG4gICAgICAgICl9YFxuICAgIDogcHJldmlld0pzeDtcblxuICAvLyBDaGVjayB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgZm9yIGNvbXBvbmVudHMgdGhhdCBuZWVkIHRvIGJlIGltcG9ydGVkXG4gIC8vIFRoaXMgY2F0Y2hlcyBjb21wb25lbnRzIGFkZGVkIGJ5IHRoZSBoYW5kbGViYXJzLXRvLWpzeCB0cmFuc3BpbGVyIChlLmcuLCBmcm9tIHt7I2ZpZWxkfX0gbWFya2VycylcbiAgY29uc3QgcHJldmlld1VzZXNSaWNoVGV4dCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxSaWNoVGV4dCcpO1xuICBjb25zdCBwcmV2aWV3VXNlczEwdXBJbWFnZSA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpO1xuXG4gIC8vIEFkZCBSaWNoVGV4dCB0byBpbXBvcnRzIGlmIHVzZWQgaW4gcHJldmlldyAoYW5kIG5vdCBhbHJlYWR5IGluY2x1ZGVkIGZyb20gcHJvcGVydHkgdHlwZXMpXG4gIGlmICgocHJldmlld1VzZXNSaWNoVGV4dCB8fCBwcmV2aWV3VXNlc0xpbmtGaWVsZCkgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdSaWNoVGV4dCcpO1xuICB9XG5cbiAgLy8gTGlua0NvbnRyb2wgaXMgbmVlZGVkIGZvciBzaWRlYmFyIGxpbmsvYnV0dG9uIHByb3BlcnR5IHBhbmVsczsgYWRkIHVuY29uZGl0aW9uYWxseSB3aGVuIHByZXNlbnQuXG4gIC8vIChIYW5kb2ZmTGlua0ZpZWxkIGluIHRoZSBwcmV2aWV3IGlzIHNlcGFyYXRlIOKAlCBpdCdzIGltcG9ydGVkIGZyb20gdGhlIHNoYXJlZCBjb21wb25lbnQgYW5kIGhhbmRsZXMgaXRzIG93biBMaW5rQ29udHJvbCBpbnRlcm5hbGx5LilcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wpIHtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnTGlua0NvbnRyb2wnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0xpbmtDb250cm9sJyk7XG4gICAgaWYgKCFjb21wb25lbnRJbXBvcnRzLmluY2x1ZGVzKCdQb3BvdmVyJykpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuICB9XG5cbiAgLy8gQWRkIElubmVyQmxvY2tzIGlmIHVzZWQgaW4gcHJldmlldyBidXQgbm90IGFscmVhZHkgaW1wb3J0ZWRcbiAgY29uc3QgcHJldmlld1VzZXNJbm5lckJsb2NrcyA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbm5lckJsb2NrcycpO1xuICBpZiAocHJldmlld1VzZXNJbm5lckJsb2NrcyAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdJbm5lckJsb2NrcycpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgMTB1cCBpbXBvcnQgaWYgbmVlZGVkIChJbWFnZSBmb3IgcHJldmlldywgUmVwZWF0ZXIgZm9yIGFycmF5cylcbiAgaWYgKHByZXZpZXdVc2VzMTB1cEltYWdlKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIH1cbiAgY29uc3QgdGVuVXBJbXBvcnQgPSB0ZW5VcEltcG9ydHMubGVuZ3RoID4gMFxuICAgID8gYGltcG9ydCB7ICR7dGVuVXBJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gQ29sbGVjdCBhbGwgaW1hZ2UgZmllbGRzIGZvciBCbG9ja0NvbnRyb2xzL01lZGlhUmVwbGFjZUZsb3dcbiAgaW50ZXJmYWNlIEltYWdlRmllbGRJbmZvIHtcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGF0dHJQYXRoOiBzdHJpbmc7ICAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQuaW1hZ2UnXG4gICAgdmFsdWVFeHByOiBzdHJpbmc7IC8vIGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdsZWZ0Q2FyZD8uaW1hZ2UnXG4gICAgdXBkYXRlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnc2V0QXR0cmlidXRlcyh7IGJhY2tncm91bmRJbWFnZTogLi4uIH0pJyBvciBuZXN0ZWQgdXBkYXRlXG4gIH1cbiAgXG4gIGNvbnN0IGltYWdlRmllbGRzOiBJbWFnZUZpZWxkSW5mb1tdID0gW107XG4gIFxuICBjb25zdCBjb2xsZWN0SW1hZ2VGaWVsZHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnLCBwYXJlbnRWYWx1ZVBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gcGFyZW50UGF0aCA/IGAke3BhcmVudFBhdGh9LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgY29uc3QgY3VycmVudFZhbHVlUGF0aCA9IHBhcmVudFZhbHVlUGF0aCA/IGAke3BhcmVudFZhbHVlUGF0aH0/LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICAgIGxldCB1cGRhdGVFeHByOiBzdHJpbmc7XG4gICAgICAgIFxuICAgICAgICBpZiAocGFyZW50UGF0aCkge1xuICAgICAgICAgIC8vIE5lc3RlZCBpbWFnZSBmaWVsZCAtIG5lZWQgdG8gc3ByZWFkIHBhcmVudCBvYmplY3RcbiAgICAgICAgICBjb25zdCBwYXJlbnRBdHRyID0gcGFyZW50UGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgIGNvbnN0IHBhcmVudENhbWVsID0gdG9DYW1lbENhc2UocGFyZW50QXR0cik7XG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnRDYW1lbH06IHsgLi4uJHtwYXJlbnRDYW1lbH0sICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSB9KWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVG9wLWxldmVsIGltYWdlIGZpZWxkXG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9KWA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGltYWdlRmllbGRzLnB1c2goe1xuICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgIGF0dHJQYXRoOiBjdXJyZW50UGF0aCxcbiAgICAgICAgICB2YWx1ZUV4cHI6IGN1cnJlbnRWYWx1ZVBhdGgsXG4gICAgICAgICAgdXBkYXRlRXhwclxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29sbGVjdEltYWdlRmllbGRzKHByb3AucHJvcGVydGllcywgY3VycmVudFBhdGgsIGN1cnJlbnRWYWx1ZVBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wZXJ0aWVzKTtcbiAgXG4gIC8vIEdlbmVyYXRlIEJsb2NrQ29udHJvbHMgd2l0aCBNZWRpYVJlcGxhY2VGbG93IGZvciBlYWNoIGltYWdlIGZpZWxkXG4gIGNvbnN0IGJsb2NrQ29udHJvbHNKc3ggPSBpbWFnZUZpZWxkcy5sZW5ndGggPiAwID8gYFxuICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XG4ke2ltYWdlRmllbGRzLm1hcChmaWVsZCA9PiBgICAgICAgICAgIDxNZWRpYVJlcGxhY2VGbG93XG4gICAgICAgICAgICBtZWRpYUlkPXske2ZpZWxkLnZhbHVlRXhwcn0/LmlkfVxuICAgICAgICAgICAgbWVkaWFVcmw9eyR7ZmllbGQudmFsdWVFeHByfT8uc3JjfVxuICAgICAgICAgICAgYWxsb3dlZFR5cGVzPXtbJ2ltYWdlJ119XG4gICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgIG9uU2VsZWN0PXsobWVkaWEpID0+ICR7ZmllbGQudXBkYXRlRXhwcn19XG4gICAgICAgICAgICBuYW1lPXtfXygnJHtmaWVsZC5sYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgIC8+YCkuam9pbignXFxuJyl9XG4gICAgICAgIDwvQmxvY2tDb250cm9scz5gIDogJyc7XG5cbiAgLy8gU2hhcmVkIGNvbXBvbmVudCBpbXBvcnRzIGZvciBkeW5hbWljIGFycmF5cyAoc2VsZWN0b3IgVUkgKyBlZGl0b3IgcHJldmlldyBtYXBwaW5nKVxuICBjb25zdCBzaGFyZWROYW1lZEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChoYXNEeW5hbWljQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnRHluYW1pY1Bvc3RTZWxlY3RvcicsICdtYXBQb3N0RW50aXR5VG9JdGVtJyk7XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAoaGFzVGF4b25vbXlBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGhhc1BhZ2luYXRpb25BcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1BhZ2luYXRpb25TZWxlY3RvcicpO1xuXG4gIGxldCBzaGFyZWRDb21wb25lbnRJbXBvcnQgPSBzaGFyZWROYW1lZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHtzaGFyZWROYW1lZEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICcuLi8uLi9zaGFyZWQnO1xcbmBcbiAgICA6ICcnO1xuICBjb25zdCBuZWVkc0RhdGFTdG9yZSA9IGhhc0R5bmFtaWNBcnJheXMgfHwgaGFzVGF4b25vbXlBcnJheTtcbiAgaWYgKG5lZWRzRGF0YVN0b3JlKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyB1c2VTZWxlY3Qke2hhc0JyZWFkY3J1bWJzQXJyYXkgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuXG4gIC8vIEJ1aWxkIGVsZW1lbnQgaW1wb3J0c1xuICBjb25zdCBlbGVtZW50SW1wb3J0cyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBlbGVtZW50SW1wb3J0cy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcbiAgfVxuXG4gIC8vIEltcG9ydCBzaGFyZWQgSGFuZG9mZkxpbmtGaWVsZCB3aGVuIHByZXZpZXcgdXNlcyBsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBsaW5rRmllbGRJbXBvcnQgPSBwcmV2aWV3VXNlc0xpbmtGaWVsZCA/IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gIDogJyc7XG5cbiAgLy8gU2NyZWVuc2hvdCBpbXBvcnQgZm9yIGluc2VydGVyIHByZXZpZXdcbiAgY29uc3Qgc2NyZWVuc2hvdEltcG9ydCA9IGhhc1NjcmVlbnNob3QgPyBgaW1wb3J0IHNjcmVlbnNob3RVcmwgZnJvbSAnLi9zY3JlZW5zaG90LnBuZyc7XFxuYCA6ICcnO1xuXG4gIC8vIFNWRyBpY29uIGZvciB0aGUgYmxvY2sgKHVuaXF1ZSBwZXIgYmxvY2ssIGNvbG9yZWQgYnkgZ3JvdXApXG4gIGNvbnN0IHN2Z0ljb25TdHIgPSBnZW5lcmF0ZVN2Z0ljb24oY29tcG9uZW50LnRpdGxlLCBjb21wb25lbnQuZ3JvdXApO1xuICBjb25zdCBzdmdJY29uQ29kZSA9IGBjb25zdCBibG9ja0ljb24gPSAoXG4gICR7c3ZnSWNvblN0cn1cbik7YDtcblxuICAvLyBJbnNlcnRlciBwcmV2aWV3OiBzaG93IHNjcmVlbnNob3QgaW1hZ2UgaW5zdGVhZCBvZiBsaXZlLXJlbmRlcmluZ1xuICBjb25zdCBwcmV2aWV3RWFybHlSZXR1cm4gPSBoYXNTY3JlZW5zaG90XG4gICAgPyBgICAgIGlmIChhdHRyaWJ1dGVzLl9fcHJldmlldykge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4gICAgICAgICAgPGltZyBzcmM9e3NjcmVlbnNob3RVcmx9IGFsdD17bWV0YWRhdGEudGl0bGV9IHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19IC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKTtcbiAgICB9XG5gXG4gICAgOiAnJztcblxuICByZXR1cm4gYGltcG9ydCB7IHJlZ2lzdGVyQmxvY2tUeXBlIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9ja3MnO1xuaW1wb3J0IHsgXG4gICR7YmxvY2tFZGl0b3JJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgXG4gICR7Y29tcG9uZW50SW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbiR7dGVuVXBJbXBvcnR9JHtzaGFyZWRDb21wb25lbnRJbXBvcnR9aW1wb3J0IG1ldGFkYXRhIGZyb20gJy4vYmxvY2suanNvbic7XG5pbXBvcnQgJy4vZWRpdG9yLnNjc3MnO1xuJHtoYXNEeW5hbWljQXJyYXlzID8gXCJpbXBvcnQgJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0R5bmFtaWNQb3N0U2VsZWN0b3IuZWRpdG9yLnNjc3MnO1xcblwiIDogJyd9aW1wb3J0ICcuL3N0eWxlLnNjc3MnO1xuJHtzY3JlZW5zaG90SW1wb3J0fSR7bGlua0ZpZWxkSW1wb3J0fVxuJHtzdmdJY29uQ29kZX1cblxuJHtkZXByZWNhdGlvbnNDb2RlID8gYCR7ZGVwcmVjYXRpb25zQ29kZX1cXG5cXG5gIDogJyd9cmVnaXN0ZXJCbG9ja1R5cGUobWV0YWRhdGEubmFtZSwge1xuICAuLi5tZXRhZGF0YSxcbiAgaWNvbjogYmxvY2tJY29uLCR7ZGVwcmVjYXRpb25zQ29kZSA/ICdcXG4gIGRlcHJlY2F0ZWQsJyA6ICcnfVxuICBlZGl0OiAoeyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBpc1NlbGVjdGVkIH0pID0+IHtcbiAgICBjb25zdCBibG9ja1Byb3BzID0gdXNlQmxvY2tQcm9wcygpO1xuJHtwcmV2aWV3RWFybHlSZXR1cm59JHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXMuam9pbignLCAnKX0gfSA9IGF0dHJpYnV0ZXM7XG4ke2R5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlfVxuJHthcnJheUhlbHBlcnN9XG4gICAgcmV0dXJuIChcbiAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgPEluc3BlY3RvckNvbnRyb2xzPlxuJHtwYW5lbHMuam9pbignXFxuXFxuJyl9XG4gICAgICAgIDwvSW5zcGVjdG9yQ29udHJvbHM+XG4ke2Jsb2NrQ29udHJvbHNKc3h9XG5cbiAgICAgICAgey8qIEVkaXRvciBQcmV2aWV3ICovfVxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiR7cHJldmlld0NvbnRlbnR9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9GcmFnbWVudD5cbiAgICApO1xuICB9LFxuICBzYXZlOiAoKSA9PiB7XG4ke3VzZUlubmVyQmxvY2tzIHx8IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyAnICAgIC8vIElubmVyQmxvY2tzIGNvbnRlbnQgbXVzdCBiZSBzYXZlZCBzbyBpdCBpcyBwZXJzaXN0ZWQgaW4gcG9zdCBjb250ZW50XFxuICAgIHJldHVybiA8SW5uZXJCbG9ja3MuQ29udGVudCAvPjsnIDogJyAgICAvLyBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgdmlhIHJlbmRlci5waHBcXG4gICAgcmV0dXJuIG51bGw7J31cbiAgfSxcbn0pO1xuYDtcbn07XG5cbmV4cG9ydCB7XG4gIGdlbmVyYXRlSW5kZXhKcyxcbiAgZ2VuZXJhdGVTdmdJY29uLFxuICB0b1RpdGxlQ2FzZSxcbiAgZ2VuZXJhdGVGaWVsZENvbnRyb2wsXG4gIGdlbmVyYXRlQXJyYXlDb250cm9sLFxuICBnZW5lcmF0ZVByb3BlcnR5Q29udHJvbCxcbiAgaXNPcGFjaXR5UmFuZ2VGaWVsZCxcbiAgZ2V0TnVtYmVyQ29udHJvbFNwZWMsXG4gIGhhc09wYWNpdHlSYW5nZUZpZWxkLFxuICBoYXNOb25PcGFjaXR5TnVtYmVyRmllbGQsXG59O1xuZXhwb3J0IHR5cGUgeyBGaWVsZENvbnRleHQsIE51bWJlckNvbnRyb2xTcGVjIH07XG4iXX0=