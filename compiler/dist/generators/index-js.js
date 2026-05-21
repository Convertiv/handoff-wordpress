"use strict";
/**
 * Generates index.js for Gutenberg block editor
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasNonOpacityNumberField = exports.hasOpacityRangeField = exports.getNumberControlSpec = exports.isOpacityRangeField = exports.generatePropertyControl = exports.generateArrayControl = exports.generateFieldControl = exports.toTitleCase = exports.generateSvgIcon = exports.generateIndexJs = void 0;
const types_1 = require("../types");
const block_json_1 = require("./block-json");
const handlebars_to_jsx_1 = require("./handlebars-to-jsx");
const interactive_canvas_1 = require("./interactive-canvas");
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
const generateIndexJs = (component, dynamicArrayConfigs, innerBlocksField, deprecationsCode, hasScreenshot, editorConfig) => {
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
    const previewResult = (0, handlebars_to_jsx_1.generateJsxPreview)(component.code, properties, component.id, component.title, innerBlocksField, editorConfig);
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
    const interactiveCanvas = (0, interactive_canvas_1.generateInteractiveCanvasCode)(component.id, attrNames, editorConfig, component.wordpress);
    if (interactiveCanvas) {
        previewJsx = (0, interactive_canvas_1.injectCanvasRefIntoPreviewJsx)(previewJsx);
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
    if (interactiveCanvas) {
        for (const el of interactiveCanvas.elementImports) {
            if (!elementImports.includes(el))
                elementImports.push(el);
        }
    }
    const interactiveImport = interactiveCanvas?.importLines ? `${interactiveCanvas.importLines}\n` : '';
    const interactiveHook = interactiveCanvas?.hookLines
        ? `${interactiveCanvas.hookLines}\n`
        : '';
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
${screenshotImport}${interactiveImport}${linkFieldImport}
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
${interactiveHook}    return (
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6Tyw2Q0FBMkM7QUFDM0MsMkRBQXNFO0FBQ3RFLDZEQUc4QjtBQUM5QixxREFBd0c7QUFDeEcsNkNBQThDO0FBRTlDOztHQUVHO0FBQ0gsTUFBTSxXQUFXLEdBQUcsQ0FBQyxHQUFXLEVBQVUsRUFBRTtJQUMxQyxPQUFPLEdBQUc7U0FDUCxLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3pELElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNmLENBQUMsQ0FBQztBQWsvQ0Esa0NBQVc7QUE3OUNiLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxRQUFnQixFQUFFLFFBQXlCLEVBQVUsRUFBRSxDQUNqRixHQUFHLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxJQUFJLEVBQUUsSUFBSSxRQUFRLENBQUMsV0FBVyxJQUFJLEVBQUUsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBRW5GLDZEQUE2RDtBQUM3RCxNQUFNLG1CQUFtQixHQUFHLENBQUMsUUFBZ0IsRUFBRSxRQUF5QixFQUFXLEVBQUU7SUFDbkYsTUFBTSxHQUFHLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ25ELE9BQU8sc0NBQXNDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzFELENBQUMsQ0FBQztBQTA5Q0Esa0RBQW1CO0FBeDlDckIsb0VBQW9FO0FBQ3BFLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxRQUFnQixFQUFFLFFB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LENBQUMsQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDLENBQUMsRUFBRTtFQUM3RixnQkFBZ0IsR0FBRyxpQkFBaUIsR0FBRyxlQUFlO0VBQ3RELFdBQVc7O0VBRVgsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTs7b0JBRS9CLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRTs7O0VBRzNELGtCQUFrQixHQUFHLGNBQWMsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsZ0xBQWdMLENBQUMsQ0FBQyxDQUFDLEVBQUU7Y0FDek8sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDaEMsMEJBQTBCO0VBQzFCLFlBQVk7RUFDWixlQUFlOzs7RUFHZixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7RUFFbkIsZ0JBQWdCOzs7O0VBSWhCLGNBQWM7Ozs7OztFQU1kLGNBQWMsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsa0hBQWtILENBQUMsQ0FBQyxDQUFDLCtEQUErRDs7O0NBR2hPLENBQUM7QUFDRixDQUFDLENBQUM7QUFHQSwwQ0FBZSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIGluZGV4LmpzIGZvciBHdXRlbmJlcmcgYmxvY2sgZWRpdG9yXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5LCBEeW5hbWljQXJyYXlDb25maWcsIEJyZWFkY3J1bWJzQXJyYXlDb25maWcsIFRheG9ub215QXJyYXlDb25maWcsIFBhZ2luYXRpb25BcnJheUNvbmZpZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWcsIGlzQnJlYWRjcnVtYnNDb25maWcsIGlzVGF4b25vbXlDb25maWcsIGlzUGFnaW5hdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQmxvY2tOYW1lIH0gZnJvbSAnLi9ibG9jay1qc29uJztcbmltcG9ydCB7IGdlbmVyYXRlSnN4UHJldmlldywgdG9DYW1lbENhc2UgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4JztcbmltcG9ydCB7XG4gIGdlbmVyYXRlSW50ZXJhY3RpdmVDYW52YXNDb2RlLFxuICBpbmplY3RDYW52YXNSZWZJbnRvUHJldmlld0pzeCxcbn0gZnJvbSAnLi9pbnRlcmFjdGl2ZS1jYW52YXMnO1xuaW1wb3J0IHsgbm9ybWFsaXplU2VsZWN0T3B0aW9ucywgZ2V0VGVtcGxhdGVSZWZlcmVuY2VkQXR0cmlidXRlTmFtZXMgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4L3V0aWxzJztcbmltcG9ydCB7IGJ1aWxkUmVzaGFwZUpzIH0gZnJvbSAnLi9yZW5kZXItcGhwJztcblxuLyoqXG4gKiBDb252ZXJ0IHNuYWtlX2Nhc2UgdG8gVGl0bGUgQ2FzZVxuICovXG5jb25zdCB0b1RpdGxlQ2FzZSA9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBzdHJcbiAgICAuc3BsaXQoJ18nKVxuICAgIC5tYXAod29yZCA9PiB3b3JkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgd29yZC5zbGljZSgxKSlcbiAgICAuam9pbignICcpO1xufTtcblxuLyoqXG4gKiBDb250ZXh0IGZvciBnZW5lcmF0aW5nIGZpZWxkIGNvbnRyb2xzIC0gZGV0ZXJtaW5lcyBob3cgdmFsdWVzIGFyZSBhY2Nlc3NlZCBhbmQgdXBkYXRlZFxuICovXG5pbnRlcmZhY2UgRmllbGRDb250ZXh0IHtcbiAgLyoqIFRoZSB2YXJpYWJsZSBuYW1lIGZvciBhY2Nlc3NpbmcgdGhlIHZhbHVlIChlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnaXRlbS5pbWFnZScpICovXG4gIHZhbHVlQWNjZXNzb3I6IHN0cmluZztcbiAgLyoqIFRoZSBvbkNoYW5nZSBoYW5kbGVyIGNvZGUgKGUuZy4sICdzZXRBdHRyaWJ1dGVzKHsgeDogdmFsdWUgfSknIG9yICd1cGRhdGVJdGVtcyhpbmRleCwgXCJ4XCIsIHZhbHVlKScpICovXG4gIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlOiBzdHJpbmcpID0+IHN0cmluZztcbiAgLyoqIEJhc2UgaW5kZW50YXRpb24gKi9cbiAgaW5kZW50OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBOdW1iZXJDb250cm9sU3BlYyB7XG4gIHVzZVJhbmdlOiBib29sZWFuO1xuICBtaW4/OiBudW1iZXI7XG4gIG1heD86IG51bWJlcjtcbiAgc3RlcD86IG51bWJlcjtcbn1cblxuY29uc3QgZmllbGRMYWJlbEhheXN0YWNrID0gKGZpZWxkS2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpOiBzdHJpbmcgPT5cbiAgYCR7ZmllbGRLZXl9ICR7cHJvcGVydHkubmFtZSA/PyAnJ30gJHtwcm9wZXJ0eS5kZXNjcmlwdGlvbiA/PyAnJ31gLnRvTG93ZXJDYXNlKCk7XG5cbi8qKiBPcGFjaXR5IC8gb3ZlcmxheSBhbHBoYSBmaWVsZHMgdXNlIGEgMOKAkzEgcmFuZ2Ugc2xpZGVyLiAqL1xuY29uc3QgaXNPcGFjaXR5UmFuZ2VGaWVsZCA9IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gIGNvbnN0IGhheSA9IGZpZWxkTGFiZWxIYXlzdGFjayhmaWVsZEtleSwgcHJvcGVydHkpO1xuICByZXR1cm4gL29wYWNpdHl8b3ZlcmxheVxccypvcGFjaXR5fFxcYmFscGhhXFxiL2kudGVzdChoYXkpO1xufTtcblxuLyoqIFJlc29sdmUgZWRpdG9yIGNvbnRyb2wgdHlwZSBhbmQgYm91bmRzIGZvciBhIG51bWJlciBwcm9wZXJ0eS4gKi9cbmNvbnN0IGdldE51bWJlckNvbnRyb2xTcGVjID0gKGZpZWxkS2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpOiBOdW1iZXJDb250cm9sU3BlYyA9PiB7XG4gIGlmIChpc09wYWNpdHlSYW5nZUZpZWxkKGZpZWxkS2V5LCBwcm9wZXJ0eSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogdHJ1ZSwgbWluOiAwLCBtYXg6IDEsIHN0ZXA6IDAuMDEgfTtcbiAgfVxuXG4gIGNvbnN0IGhheSA9IGZpZWxkTGFiZWxIYXlzdGFjayhmaWVsZEtleSwgcHJvcGVydHkpO1xuICBjb25zdCBrZXlIYXkgPSBgJHtmaWVsZEtleX0gJHtwcm9wZXJ0eS5uYW1lID8/ICcnfWAudG9Mb3dlckNhc2UoKTtcblxuICBpZiAoL1xcYmxhdChpdHVkZSk/XFxiL2kudGVzdChrZXlIYXkpIHx8IC9cXGJsYXQoaXR1ZGUpP1xcYi9pLnRlc3QoaGF5KSkge1xuICAgIHJldHVybiB7IHVzZVJhbmdlOiBmYWxzZSwgbWluOiAtOTAsIG1heDogOTAsIHN0ZXA6IDAuMDAwMDAxIH07XG4gIH1cbiAgaWYgKC9cXGJsbmdcXGJ8XFxibG9uKGdpdHVkZSk/XFxiL2kudGVzdChrZXlIYXkpIHx8IC9cXGJsbmdcXGJ8XFxibG9uKGdpdHVkZSk/XFxiL2kudGVzdChoYXkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IGZhbHNlLCBtaW46IC0xODAsIG1heDogMTgwLCBzdGVwOiAwLjAwMDAwMSB9O1xuICB9XG4gIGlmICgvXFxiem9vbVxcYi9pLnRlc3Qoa2V5SGF5KSB8fCAvXFxiem9vbVxcYi9pLnRlc3QoaGF5KSkge1xuICAgIHJldHVybiB7IHVzZVJhbmdlOiBmYWxzZSwgbWluOiAxLCBtYXg6IDIxLCBzdGVwOiAxIH07XG4gIH1cblxuICBjb25zdCBkZWZhdWx0SXNJbnRlZ2VyID1cbiAgICB0eXBlb2YgcHJvcGVydHkuZGVmYXVsdCA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzSW50ZWdlcihwcm9wZXJ0eS5kZWZhdWx0KTtcbiAgcmV0dXJuIHsgdXNlUmFuZ2U6IGZhbHNlLCBzdGVwOiBkZWZhdWx0SXNJbnRlZ2VyID8gMSA6IHVuZGVmaW5lZCB9O1xufTtcblxuY29uc3Qgd2Fsa051bWJlckZpZWxkcyA9IChcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PixcbiAgcHJlZGljYXRlOiAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSkgPT4gYm9vbGVhblxuKTogYm9vbGVhbiA9PiB7XG4gIGNvbnN0IGNoZWNrID0gKHByb3A6IEhhbmRvZmZQcm9wZXJ0eSwgZmllbGRLZXk6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgIGlmIChwcm9wLnR5cGUgPT09ICdudW1iZXInICYmIHByZWRpY2F0ZShmaWVsZEtleSwgcHJvcCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIHJldHVybiBPYmplY3QuZW50cmllcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT4gY2hlY2socCwgaykpO1xuICAgIH1cbiAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgIHJldHVybiBPYmplY3QuZW50cmllcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT4gY2hlY2socCwgaykpO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG4gIHJldHVybiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+IGNoZWNrKHAsIGspKTtcbn07XG5cbmNvbnN0IGhhc09wYWNpdHlSYW5nZUZpZWxkID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBib29sZWFuID0+XG4gIHdhbGtOdW1iZXJGaWVsZHMocHJvcGVydGllcywgaXNPcGFjaXR5UmFuZ2VGaWVsZCk7XG5cbmNvbnN0IGhhc05vbk9wYWNpdHlOdW1iZXJGaWVsZCA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogYm9vbGVhbiA9PlxuICB3YWxrTnVtYmVyRmllbGRzKHByb3BlcnRpZXMsIChmaWVsZEtleSwgcHJvcGVydHkpID0+ICFpc09wYWNpdHlSYW5nZUZpZWxkKGZpZWxkS2V5LCBwcm9wZXJ0eSkpO1xuXG4vKipcbiAqIEdlbmVyYXRlIGEgZmllbGQgY29udHJvbCBmb3IgYW55IHByb3BlcnR5IHR5cGUgLSB1bmlmaWVkIGZ1bmN0aW9uIGZvciBib3RoIHRvcC1sZXZlbCBhbmQgbmVzdGVkIGZpZWxkc1xuICovXG5jb25zdCBnZW5lcmF0ZUZpZWxkQ29udHJvbCA9IChcbiAgZmllbGRLZXk6IHN0cmluZyxcbiAgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSxcbiAgY29udGV4dDogRmllbGRDb250ZXh0XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCB7IHZhbHVlQWNjZXNzb3IsIG9uQ2hhbmdlSGFuZGxlciwgaW5kZW50IH0gPSBjb250ZXh0O1xuICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2UoZmllbGRLZXkpO1xuXG4gIHN3aXRjaCAocHJvcGVydHkudHlwZSkge1xuICAgIGNhc2UgJ3RleHQnOiB7XG4gICAgICBjb25zdCBpc1dpc3RpYVRleHRGaWVsZCA9IC9cXGJ3aXN0aWFcXGIvaS50ZXN0KGAke2ZpZWxkS2V5fSAke2xhYmVsfSAke3Byb3BlcnR5LmRlc2NyaXB0aW9uID8/ICcnfWApO1xuXG4gICAgICBpZiAoaXNXaXN0aWFUZXh0RmllbGQpIHtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIHsoKCkgPT4ge1xuJHtpbmRlbnR9ICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBTdHJpbmcoJHt2YWx1ZUFjY2Vzc29yfSB8fCAnJykudHJpbSgpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IG1lZGlhTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC8oPzptZWRpYXN8aWZyYW1lKVxcXFwvKFtBLVphLXowLTldKykvaSk7XG4ke2luZGVudH0gICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgY29uc3Qgd2lzdGlhSWQgPSBtZWRpYU1hdGNoPy5bMV0gfHwgZmFsbGJhY2tNYXRjaD8uWzFdIHx8ICcnO1xuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgaWYgKCF3aXN0aWFJZCkge1xuJHtpbmRlbnR9ICAgICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTZweCcsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXI6ICcxcHggZGFzaGVkICNjYmQ1ZTEnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBjb2xvcjogJyM0NzU1NjknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYmFja2dyb3VuZDogJyNmOGZhZmMnLFxuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICB7X18oJ0FkZCBhIFdpc3RpYSB2aWRlbyBJRCB0byBwcmV2aWV3IHRoaXMgdmlkZW8uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICApO1xuJHtpbmRlbnR9ICAgIH1cbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgcG9zaXRpb246ICdyZWxhdGl2ZScsXG4ke2luZGVudH0gICAgICAgICAgb3ZlcmZsb3c6ICdoaWRkZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgIGJhY2tncm91bmQ6ICcjMGYxNzJhJyxcbiR7aW5kZW50fSAgICAgICAgICBhc3BlY3RSYXRpbzogJzE2IC8gOScsXG4ke2luZGVudH0gICAgICAgIH19XG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIDxpbWdcbiR7aW5kZW50fSAgICAgICAgICBzcmM9e1xcYGh0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy9cXCR7d2lzdGlhSWR9L3N3YXRjaFxcYH1cbiR7aW5kZW50fSAgICAgICAgICBhbHQ9e19fKCdXaXN0aWEgdmlkZW8gcHJldmlldycsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsIG9iamVjdEZpdDogJ2NvdmVyJywgZGlzcGxheTogJ2Jsb2NrJyB9fVxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgaW5zZXQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICBhbGlnbkl0ZW1zOiAnZmxleC1lbmQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdzcGFjZS1iZXR3ZWVuJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGdhcDogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYmFja2dyb3VuZDogJ2xpbmVhci1ncmFkaWVudCgxODBkZWcsIHJnYmEoMTUsIDIzLCA0MiwgMC4xMikgMCUsIHJnYmEoMTUsIDIzLCA0MiwgMC43KSAxMDAlKScsXG4ke2luZGVudH0gICAgICAgICAgICBjb2xvcjogJyNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgYXJpYS1oaWRkZW49XCJ0cnVlXCJcbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIHdpZHRoOiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGhlaWdodDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc5OTlweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yNCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZHJvcEZpbHRlcjogJ2JsdXIoMTBweCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIHdpZHRoOiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGhlaWdodDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBtYXJnaW5MZWZ0OiAnNHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJUb3A6ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckJvdHRvbTogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyTGVmdDogJzE0cHggc29saWQgI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIG1heFdpZHRoOiAnMTAwJScsXG4ke2luZGVudH0gICAgICAgICAgICAgIG1pbkhlaWdodDogJzMycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBwYWRkaW5nOiAnNnB4IDEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc5OTlweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDE1LCAyMywgNDIsIDAuNTgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZm9udFNpemU6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZm9udFdlaWdodDogNjAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBsZXR0ZXJTcGFjaW5nOiAnMC4wMmVtJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge3dpc3RpYUlkfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICApO1xuJHtpbmRlbnR9ICB9KSgpfVxuJHtpbmRlbnR9PC9GbGV4PmA7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICAgIH1cblxuICAgIGNhc2UgJ3JpY2h0ZXh0JzpcbiAgICAgIC8vIEluc2lkZSBhbiBhcnJheSBpdGVtLCBJbm5lckJsb2NrcyBjYW4ndCBiZSB1c2VkIOKAlCBwcm92aWRlIGEgdGV4dGFyZWFcbiAgICAgIGlmICh2YWx1ZUFjY2Vzc29yLnN0YXJ0c1dpdGgoJ2l0ZW0uJykpIHtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08VGV4dGFyZWFDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICByb3dzPXs0fVxuJHtpbmRlbnR9Lz5gO1xuICAgICAgfVxuICAgICAgLy8gVG9wLWxldmVsIHJpY2h0ZXh0IHVzZXMgSW5uZXJCbG9ja3Mgb24gdGhlIGNhbnZhcyDigJMgbm8gc2lkZWJhciBjb250cm9sIG5lZWRlZFxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzoge1xuICAgICAgY29uc3Qgc3BlYyA9IGdldE51bWJlckNvbnRyb2xTcGVjKGZpZWxkS2V5LCBwcm9wZXJ0eSk7XG4gICAgICBpZiAoc3BlYy51c2VSYW5nZSkge1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxSYW5nZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9ID8/IDB9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgbWluPXske3NwZWMubWluID8/IDB9fVxuJHtpbmRlbnR9ICBtYXg9eyR7c3BlYy5tYXggPz8gMX19XG4ke2luZGVudH0gIHN0ZXA9eyR7c3BlYy5zdGVwID8/IDAuMDF9fVxuJHtpbmRlbnR9Lz5gO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBib3VuZExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHNwZWMubWluICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYm91bmRMaW5lcy5wdXNoKGAke2luZGVudH0gIG1pbj17JHtzcGVjLm1pbn19YCk7XG4gICAgICB9XG4gICAgICBpZiAoc3BlYy5tYXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBib3VuZExpbmVzLnB1c2goYCR7aW5kZW50fSAgbWF4PXske3NwZWMubWF4fX1gKTtcbiAgICAgIH1cbiAgICAgIGlmIChzcGVjLnN0ZXAgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBib3VuZExpbmVzLnB1c2goYCR7aW5kZW50fSAgc3RlcD17JHtzcGVjLnN0ZXB9fWApO1xuICAgICAgfVxuICAgICAgY29uc3QgYm91bmRzID0gYm91bmRMaW5lcy5sZW5ndGggPyBgXFxuJHtib3VuZExpbmVzLmpvaW4oJ1xcbicpfWAgOiAnJztcbiAgICAgIGNvbnN0IHBhcnNlRXhwciA9XG4gICAgICAgIHNwZWMuc3RlcCAhPT0gdW5kZWZpbmVkICYmIHNwZWMuc3RlcCA+PSAxICYmIE51bWJlci5pc0ludGVnZXIoc3BlYy5zdGVwKVxuICAgICAgICAgID8gXCJ2YWx1ZSA9PT0gJycgPyAwIDogcGFyc2VJbnQodmFsdWUsIDEwKSB8fCAwXCJcbiAgICAgICAgICA6IFwidmFsdWUgPT09ICcnID8gMCA6IHBhcnNlRmxvYXQodmFsdWUpIHx8IDBcIjtcblxuICAgICAgcmV0dXJuIGAke2luZGVudH08VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHR5cGU9XCJudW1iZXJcIlxuJHtpbmRlbnR9ICB2YWx1ZT17dHlwZW9mICR7dmFsdWVBY2Nlc3Nvcn0gPT09ICdudW1iZXInID8gU3RyaW5nKCR7dmFsdWVBY2Nlc3Nvcn0pIDogJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKHBhcnNlRXhwcil9fVxuJHtib3VuZHN9XG4ke2luZGVudH0vPmA7XG4gICAgfVxuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUb2dnbGVDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9IHx8IGZhbHNlfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG5cbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICAvLyBVc2UgJ3NyYycgaW5zdGVhZCBvZiAndXJsJyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nIGNvbnZlbnRpb25cbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PE1lZGlhVXBsb2FkQ2hlY2s+XG4ke2luZGVudH0gIDxNZWRpYVVwbG9hZFxuJHtpbmRlbnR9ICAgIG9uU2VsZWN0PXsobWVkaWEpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd7IHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCBcXCdcXCcgfScpfX1cbiR7aW5kZW50fSAgICBhbGxvd2VkVHlwZXM9e1snaW1hZ2UnXX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8uc3JjfVxuJHtpbmRlbnR9ICAgIHJlbmRlcj17KHsgb3BlbiB9KSA9PiAoXG4ke2luZGVudH0gICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PlxuJHtpbmRlbnR9ICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L3NwYW4+XG4ke2luZGVudH0gICAgICAgIHske3ZhbHVlQWNjZXNzb3J9Py5zcmMgJiYgKFxuJHtpbmRlbnR9ICAgICAgICAgIDxpbWcgXG4ke2luZGVudH0gICAgICAgICAgICBzcmM9eyR7dmFsdWVBY2Nlc3Nvcn0/LnNyY30gXG4ke2luZGVudH0gICAgICAgICAgICBhbHQ9eyR7dmFsdWVBY2Nlc3Nvcn0/LmFsdCB8fCAnJ31cbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7IG1heFdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19XG4ke2luZGVudH0gICAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvbiBvbkNsaWNrPXtvcGVufSB2YXJpYW50PVwic2Vjb25kYXJ5XCIgc2l6ZT1cInNtYWxsXCI+XG4ke2luZGVudH0gICAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyA/IF9fKCdSZXBsYWNlICR7bGFiZWx9JywgJ2hhbmRvZmYnKSA6IF9fKCdTZWxlY3QgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DbGljaz17KCkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBcXCdcXCcsIGFsdDogXFwnXFwnIH0nKX19XG4ke2luZGVudH0gICAgICAgICAgICB2YXJpYW50PVwibGlua1wiXG4ke2luZGVudH0gICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIHtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICAgICAgKX1cbiR7aW5kZW50fSAgICAgIDwvRmxleD5cbiR7aW5kZW50fSAgICApfVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9PC9NZWRpYVVwbG9hZENoZWNrPmA7XG5cbiAgICBjYXNlICd2aWRlbyc6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXt0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ3N0cmluZycgPyAke3ZhbHVlQWNjZXNzb3J9IDogKCR7dmFsdWVBY2Nlc3Nvcn0/LmlkIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyB8fCAnJyl9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4ge1xuJHtpbmRlbnR9ICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyh2YWx1ZSB8fCAnJykudHJpbSgpO1xuJHtpbmRlbnR9ICAgICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICAgIGNvbnN0IGZhbGxiYWNrTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKFtBLVphLXowLTldKz8pKD86XFxcXC5qc29ucCk/JC8pO1xuJHtpbmRlbnR9ICAgICAgY29uc3Qgd2lzdGlhSWQgPSBtZWRpYU1hdGNoPy5bMV0gfHwgZmFsbGJhY2tNYXRjaD8uWzFdIHx8ICcnO1xuJHtpbmRlbnR9ICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gJiYgdHlwZW9mICR7dmFsdWVBY2Nlc3Nvcn0gPT09ICdvYmplY3QnID8gJHt2YWx1ZUFjY2Vzc29yfSA6IHt9KSwgaWQ6IHdpc3RpYUlkLCBzcmM6IHdpc3RpYUlkID8gXFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0uanNvbnBcXGAgOiBub3JtYWxpemVkIH1gKX1cbiR7aW5kZW50fSAgICB9fVxuJHtpbmRlbnR9ICAvPlxuJHtpbmRlbnR9ICB7KCgpID0+IHtcbiR7aW5kZW50fSAgICBjb25zdCByYXdWYWx1ZSA9XG4ke2luZGVudH0gICAgICB0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ3N0cmluZydcbiR7aW5kZW50fSAgICAgICAgPyAke3ZhbHVlQWNjZXNzb3J9XG4ke2luZGVudH0gICAgICAgIDogKCR7dmFsdWVBY2Nlc3Nvcn0/LmlkIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyB8fCAnJyk7XG4ke2luZGVudH0gICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyhyYXdWYWx1ZSB8fCAnJykudHJpbSgpO1xuJHtpbmRlbnR9ICAgIGNvbnN0IG1lZGlhTWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC8oPzptZWRpYXN8aWZyYW1lKVxcXFwvKFtBLVphLXowLTldKykvaSk7XG4ke2luZGVudH0gICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgY29uc3Qgd2lzdGlhSWQgPSBtZWRpYU1hdGNoPy5bMV0gfHwgZmFsbGJhY2tNYXRjaD8uWzFdIHx8ICcnO1xuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgaWYgKCF3aXN0aWFJZCkge1xuJHtpbmRlbnR9ICAgICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgICAgPGRpdlxuJHtpbmRlbnR9ICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTZweCcsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXI6ICcxcHggZGFzaGVkICNjYmQ1ZTEnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBjb2xvcjogJyM0NzU1NjknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYmFja2dyb3VuZDogJyNmOGZhZmMnLFxuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICB7X18oJ0FkZCBhIFdpc3RpYSB2aWRlbyBJRCB0byBwcmV2aWV3IHRoaXMgdmlkZW8uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICApO1xuJHtpbmRlbnR9ICAgIH1cbiR7aW5kZW50fVxuJHtpbmRlbnR9ICAgIHJldHVybiAoXG4ke2luZGVudH0gICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgcG9zaXRpb246ICdyZWxhdGl2ZScsXG4ke2luZGVudH0gICAgICAgICAgb3ZlcmZsb3c6ICdoaWRkZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgIGJvcmRlclJhZGl1czogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgIGJhY2tncm91bmQ6ICcjMGYxNzJhJyxcbiR7aW5kZW50fSAgICAgICAgICBhc3BlY3RSYXRpbzogJzE2IC8gOScsXG4ke2luZGVudH0gICAgICAgIH19XG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIDxpbWdcbiR7aW5kZW50fSAgICAgICAgICBzcmM9e1xcYGh0dHBzOi8vZmFzdC53aXN0aWEuY29tL2VtYmVkL21lZGlhcy9cXCR7d2lzdGlhSWR9L3N3YXRjaFxcYH1cbiR7aW5kZW50fSAgICAgICAgICBhbHQ9e19fKCdXaXN0aWEgdmlkZW8gcHJldmlldycsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsIG9iamVjdEZpdDogJ2NvdmVyJywgZGlzcGxheTogJ2Jsb2NrJyB9fVxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgaW5zZXQ6IDAsXG4ke2luZGVudH0gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICBhbGlnbkl0ZW1zOiAnZmxleC1lbmQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdzcGFjZS1iZXR3ZWVuJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGdhcDogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgcGFkZGluZzogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgYmFja2dyb3VuZDogJ2xpbmVhci1ncmFkaWVudCgxODBkZWcsIHJnYmEoMTUsIDIzLCA0MiwgMC4xMikgMCUsIHJnYmEoMTUsIDIzLCA0MiwgMC43KSAxMDAlKScsXG4ke2luZGVudH0gICAgICAgICAgICBjb2xvcjogJyNmZmYnLFxuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgYXJpYS1oaWRkZW49XCJ0cnVlXCJcbiR7aW5kZW50fSAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgIHdpZHRoOiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGhlaWdodDogJzQ4cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc5OTlweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtZmxleCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yNCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBiYWNrZHJvcEZpbHRlcjogJ2JsdXIoMTBweCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIHdpZHRoOiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGhlaWdodDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBtYXJnaW5MZWZ0OiAnNHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJUb3A6ICc4cHggc29saWQgdHJhbnNwYXJlbnQnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlckJvdHRvbTogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyTGVmdDogJzE0cHggc29saWQgI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhblxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIG1heFdpZHRoOiAnMTAwJScsXG4ke2luZGVudH0gICAgICAgICAgICAgIG1pbkhlaWdodDogJzMycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBwYWRkaW5nOiAnNnB4IDEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc5OTlweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDE1LCAyMywgNDIsIDAuNTgpJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZm9udFNpemU6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZm9udFdlaWdodDogNjAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBsZXR0ZXJTcGFjaW5nOiAnMC4wMmVtJyxcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge3dpc3RpYUlkfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgPC9kaXY+XG4ke2luZGVudH0gICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICApO1xuJHtpbmRlbnR9ICB9KSgpfVxuJHtpbmRlbnR9PC9GbGV4PmA7XG5cbiAgICBjYXNlICdsaW5rJzpcbiAgICAgIC8vIEZvciBsaW5rcywgdXNlIExpbmtDb250cm9sIHdoaWNoIHByb3ZpZGVzIGludGVybmFsIHBhZ2Ugc2VhcmNoIGFuZCBVUkwgdmFsaWRhdGlvblxuICAgICAgY29uc3QgbGlua0hhbmRsZXIgPSBvbkNoYW5nZUhhbmRsZXIoYHsgXG4gICAgICAgIC4uLiR7dmFsdWVBY2Nlc3Nvcn0sIFxuICAgICAgICB1cmw6IHZhbHVlLnVybCB8fCAnJywgXG4gICAgICAgIGxhYmVsOiB2YWx1ZS50aXRsZSB8fCAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiAgICAgICAgb3BlbnNJbk5ld1RhYjogdmFsdWUub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0xpbmsgVGV4dCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LnVybCB8fCAnJywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJyxcbiR7aW5kZW50fSAgICAgICAgb3BlbnNJbk5ld1RhYjogJHt2YWx1ZUFjY2Vzc29yfT8ub3BlbnNJbk5ld1RhYiB8fCBmYWxzZVxuJHtpbmRlbnR9ICAgICAgfX1cbiR7aW5kZW50fSAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7bGlua0hhbmRsZXJ9fVxuJHtpbmRlbnR9ICAgICAgc2V0dGluZ3M9e1tcbiR7aW5kZW50fSAgICAgICAgeyBpZDogJ29wZW5zSW5OZXdUYWInLCB0aXRsZTogX18oJ09wZW4gaW4gbmV3IHRhYicsICdoYW5kb2ZmJykgfVxuJHtpbmRlbnR9ICAgICAgXX1cbiR7aW5kZW50fSAgICAgIHNob3dTdWdnZXN0aW9ucz17dHJ1ZX1cbiR7aW5kZW50fSAgICAgIHN1Z2dlc3Rpb25zUXVlcnk9e3sgdHlwZTogJ3Bvc3QnLCBzdWJ0eXBlOiAnYW55JyB9fVxuJHtpbmRlbnR9ICAgIC8+XG4ke2luZGVudH0gIDwvZGl2PlxuJHtpbmRlbnR9PC9kaXY+YDtcblxuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICAvLyBGb3IgYnV0dG9ucywgcHJvdmlkZSBsYWJlbCBmaWVsZCBhbmQgaHJlZiBmaWVsZCB3aXRoIGxpbmsgcGlja2VyXG4gICAgICAvLyBCdXR0b24gcHJvcGVydGllczogbGFiZWwsIGhyZWYsIHRhcmdldCwgcmVsLCBkaXNhYmxlZFxuICAgICAgY29uc3QgYnV0dG9uSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIGhyZWY6IHZhbHVlLnVybCB8fCAnIycsIFxuICAgICAgICB0YXJnZXQ6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnX2JsYW5rJyA6ICcnLFxuICAgICAgICByZWw6IHZhbHVlLm9wZW5zSW5OZXdUYWIgPyAnbm9vcGVuZXIgbm9yZWZlcnJlcicgOiAnJ1xuICAgICAgfWApO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08ZGl2IGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sXCI+XG4ke2luZGVudH0gIDxsYWJlbCBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbF9fbGFiZWxcIj57X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX08L2xhYmVsPlxuJHtpbmRlbnR9ICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0J1dHRvbiBMYWJlbCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgaGlkZUxhYmVsRnJvbVZpc2lvbj17dHJ1ZX1cbiR7aW5kZW50fSAgICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfT8ubGFiZWwgfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgbGFiZWw6IHZhbHVlIH1gKX19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JyB9fT5cbiR7aW5kZW50fSAgICA8TGlua0NvbnRyb2xcbiR7aW5kZW50fSAgICAgIHZhbHVlPXt7IFxuJHtpbmRlbnR9ICAgICAgICB1cmw6ICR7dmFsdWVBY2Nlc3Nvcn0/LmhyZWYgfHwgJyMnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py50YXJnZXQgPT09ICdfYmxhbmsnXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtidXR0b25IYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fSAgPFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0Rpc2FibGVkJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9Py5kaXNhYmxlZCB8fCBmYWxzZX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBkaXNhYmxlZDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvZGl2PmA7XG5cbiAgICBjYXNlICdzZWxlY3QnOiB7XG4gICAgICBjb25zdCBvcHRpb25zID0gbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhwcm9wZXJ0eS5vcHRpb25zKS5tYXAob3B0ID0+XG4gICAgICAgIGB7IGxhYmVsOiAnJHtvcHQubGFiZWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfScsIHZhbHVlOiAnJHtvcHQudmFsdWV9JyB9YFxuICAgICAgKS5qb2luKCcsICcpO1xuICAgICAgcmV0dXJuIGAke2luZGVudH08U2VsZWN0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9wdGlvbnM9e1ske29wdGlvbnN9XX1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICAgIH1cblxuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIC8vIEhhbmRsZSBzaW1wbGUgc3RyaW5nIGFycmF5cyB3aXRoIGEgcmVwZWF0YWJsZSBsaXN0IGNvbnRyb2xcbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBzaW1wbGUgdHlwZSBhcnJheSAoc3RyaW5nLCBudW1iZXIsIGV0Yy4pIHZzIG9iamVjdCBhcnJheVxuICAgICAgY29uc3QgaXRlbVR5cGUgPSBwcm9wZXJ0eS5pdGVtcz8udHlwZTtcbiAgICAgIGlmICghcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgJiYgKGl0ZW1UeXBlID09PSAnc3RyaW5nJyB8fCAhaXRlbVR5cGUpKSB7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbGlzdCBjb250cm9sIGZvciBzdHJpbmcgYXJyYXlzXG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aW5kZW50fSAgICB7KCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLm1hcCgobGlzdEl0ZW0sIGxpc3RJbmRleCkgPT4gKFxuJHtpbmRlbnR9ICAgICAgPEZsZXgga2V5PXtsaXN0SW5kZXh9IGdhcD17Mn0gYWxpZ249XCJjZW50ZXJcIj5cbiR7aW5kZW50fSAgICAgICAgPGRpdiBzdHlsZT17eyBmbGV4OiAxIH19PlxuJHtpbmRlbnR9ICAgICAgICAgIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgICAgICAgICAgdmFsdWU9e2xpc3RJdGVtIHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKV07XG4ke2luZGVudH0gICAgICAgICAgICAgIG5ld0xpc3RbbGlzdEluZGV4XSA9IHZhbHVlO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgICBwbGFjZWhvbGRlcj17X18oJ0VudGVyIGl0ZW0uLi4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LXVwLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSB1cCcsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA9PT0gMCkgcmV0dXJuO1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggLSAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggLSAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA9PT0gMH1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cImFycm93LWRvd24tYWx0MlwiXG4ke2luZGVudH0gICAgICAgICAgbGFiZWw9e19fKCdNb3ZlIGRvd24nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IGxpc3QgPSAke3ZhbHVlQWNjZXNzb3J9IHx8IFtdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgaWYgKGxpc3RJbmRleCA+PSBsaXN0Lmxlbmd0aCAtIDEpIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4ubGlzdF07XG4ke2luZGVudH0gICAgICAgICAgICBbbmV3TGlzdFtsaXN0SW5kZXhdLCBuZXdMaXN0W2xpc3RJbmRleCArIDFdXSA9IFtuZXdMaXN0W2xpc3RJbmRleCArIDFdLCBuZXdMaXN0W2xpc3RJbmRleF1dO1xuJHtpbmRlbnR9ICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICBkaXNhYmxlZD17bGlzdEluZGV4ID49ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5sZW5ndGggLSAxfVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICBpY29uPVwidHJhc2hcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pLmZpbHRlcigoXywgaSkgPT4gaSAhPT0gbGlzdEluZGV4KTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgaXNEZXN0cnVjdGl2ZVxuJHtpbmRlbnR9ICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgKSl9XG4ke2luZGVudH0gICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLigke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKSwgJyddO1xuJHtpbmRlbnR9ICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgIH19XG4ke2luZGVudH0gICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICA+XG4ke2luZGVudH0gICAgICB7X18oJ0FkZCBJdGVtJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgPC9GbGV4PlxuJHtpbmRlbnR9PC9kaXY+YDtcbiAgICAgIH1cbiAgICAgIC8vIEZvciBvYmplY3QgYXJyYXlzLCBmYWxsIHRocm91Z2ggdG8gZGVmYXVsdCAodGhlc2Ugc2hvdWxkIGJlIGhhbmRsZWQgYnkgZ2VuZXJhdGVBcnJheUNvbnRyb2wgYXQgdG9wIGxldmVsKVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZENvbnRyb2xzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydHkucHJvcGVydGllcylcbiAgICAgICAgICAubWFwKChbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgJHt2YWx1ZUFjY2Vzc29yfT8uJHtuZXN0ZWRLZXl9YCxcbiAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgJHtuZXN0ZWRLZXl9OiAke3ZhbH0gfWApLFxuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudCArICcgICdcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2wobmVzdGVkS2V5LCBuZXN0ZWRQcm9wLCBuZXN0ZWRDb250ZXh0KTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGAke2luZGVudH08RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezJ9PlxuJHtuZXN0ZWRDb250cm9sc31cbiR7aW5kZW50fTwvRmxleD5gO1xuICAgICAgfVxuICAgICAgcmV0dXJuICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRleHRDb250cm9sXG4ke2luZGVudH0gIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICB2YWx1ZT17JHt2YWx1ZUFjY2Vzc29yfSB8fCAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9Lz5gO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFycmF5IChyZXBlYXRlcikgY29udHJvbCB1c2luZyAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudFxuICogUHJvdmlkZXMgZHJhZy1hbmQtZHJvcCByZW9yZGVyaW5nIGFuZCBidWlsdC1pbiBhZGQvcmVtb3ZlIGZ1bmN0aW9uYWxpdHlcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGF0dHJOYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG5cbiAgLy8gR2VuZXJhdGUgZmllbGQgY29udHJvbHMgdGhhdCB1c2Ugc2V0SXRlbSBmcm9tIHRoZSBSZXBlYXRlciByZW5kZXIgcHJvcFxuICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgIGNvbnN0IGZpZWxkQ29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRJdGVtKHsgLi4uaXRlbSwgJHtmaWVsZEtleX06ICR7dmFsdWV9IH0pYCxcbiAgICAgIGluZGVudDogaW5kZW50ICsgJyAgICAgICdcbiAgICB9O1xuICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBmaWVsZENvbnRleHQpO1xuICB9KS5qb2luKCdcXG4nKTtcblxuICAvLyBHZXQgYSBkaXNwbGF5IHRpdGxlIGZyb20gdGhlIGZpcnN0IHRleHQgZmllbGQgaWYgYXZhaWxhYmxlLCBmYWxsYmFjayB0byBmaWVsZCBsYWJlbFxuICBjb25zdCBmaXJzdFRleHRGaWVsZCA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykuZmluZCgoWywgcHJvcF0pID0+IHByb3AudHlwZSA9PT0gJ3RleHQnKTtcbiAgY29uc3QgdGl0bGVBY2Nlc3NvciA9IGZpcnN0VGV4dEZpZWxkID8gYGl0ZW0uJHtmaXJzdFRleHRGaWVsZFswXX0gfHwgYCA6ICcnO1xuICBcbiAgLy8gQ3VzdG9tIGFkZCBidXR0b24gd2l0aCB0ZXJ0aWFyeSBzdHlsaW5nLCBwbHVzIGljb24sIHJpZ2h0IGFsaWduZWRcbiAgLy8gYWRkQnV0dG9uIGlzIGEgZnVuY3Rpb24gdGhhdCByZWNlaXZlcyBhZGRJdGVtIGFuZCByZXR1cm5zIGEgUmVhY3QgZWxlbWVudFxuICBjb25zdCBhZGRCdXR0b25Kc3ggPSBgKGFkZEl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b24td3JhcHBlclwiPlxuJHtpbmRlbnR9ICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICB2YXJpYW50PVwidGVydGlhcnlcIlxuJHtpbmRlbnR9ICAgICAgICBvbkNsaWNrPXthZGRJdGVtfVxuJHtpbmRlbnR9ICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgPHBhdGggZD1cIk0xMSAxMi41VjE3LjVIMTIuNVYxMi41SDE3LjVWMTFIMTIuNVY2SDExVjExSDZWMTIuNUgxMVpcIi8+XG4ke2luZGVudH0gICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvblwiXG4ke2luZGVudH0gICAgICA+XG4ke2luZGVudH0gICAgICAgIHtfXygnQWRkICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApYDtcblxuICByZXR1cm4gYCR7aW5kZW50fTxSZXBlYXRlciBcbiR7aW5kZW50fSAgYXR0cmlidXRlPVwiJHthdHRyTmFtZX1cIiBcbiR7aW5kZW50fSAgYWxsb3dSZW9yZGVyaW5nPXt0cnVlfSBcbiR7aW5kZW50fSAgZGVmYXVsdFZhbHVlPXt7fX1cbiR7aW5kZW50fSAgYWRkQnV0dG9uPXske2FkZEJ1dHRvbkpzeH19XG4ke2luZGVudH0+XG4ke2luZGVudH0gIHsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1cIj5cbiR7aW5kZW50fSAgICAgIDxkZXRhaWxzIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2NvbGxhcHNlXCI+XG4ke2luZGVudH0gICAgICAgIDxzdW1tYXJ5IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2hlYWRlclwiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX3RpdGxlXCI+eyR7dGl0bGVBY2Nlc3Nvcn0nJHtsYWJlbH0nfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19hY3Rpb25zXCIgb25DbGljaz17KGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCl9PlxuJHtpbmRlbnR9ICAgICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBvbkNsaWNrPXtyZW1vdmVJdGVtfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk01IDYuNVYxOGEyIDIgMCAwMDIgMmgxMGEyIDIgMCAwMDItMlY2LjVoLTIuNVYxOGEuNS41IDAgMDEtLjUuNUg4YS41LjUgMCAwMS0uNS0uNVY2LjVINXpNOSA5djhoMS41VjlIOXptNC41IDB2OEgxNVY5aC0xLjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk0yMCA1aC01VjMuNUExLjUgMS41IDAgMDAxMy41IDJoLTNBMS41IDEuNSAwIDAwOSAzLjVWNUg0djEuNWgxNlY1em0tNi41IDBoLTNWMy41aDNWNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUgaXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L3N1bW1hcnk+XG4ke2luZGVudH0gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fZmllbGRzXCI+XG4ke2luZGVudH0gICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aXRlbUZpZWxkc31cbiR7aW5kZW50fSAgICAgICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kZXRhaWxzPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApfVxuJHtpbmRlbnR9PC9SZXBlYXRlcj5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0aGUgaW5zcGVjdG9yIGNvbnRyb2wgZm9yIGEgdG9wLWxldmVsIHByb3BlcnR5XG4gKiBVc2VzIGdlbmVyYXRlRmllbGRDb250cm9sIHdpdGggYSBzZXRBdHRyaWJ1dGVzIGNvbnRleHRcbiAqL1xuY29uc3QgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGluZGVudDogc3RyaW5nID0gJyAgICAgICAgICAnKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcblxuICAvLyBGb3IgYXJyYXkgdHlwZSwgdXNlIHRoZSBzcGVjaWFsaXplZCBhcnJheSBjb250cm9sXG4gIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgcmV0dXJuIGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIGF0dHJOYW1lLCBsYWJlbCwgaW5kZW50KTtcbiAgfVxuXG4gIC8vIEZvciBhbGwgb3RoZXIgdHlwZXMsIHVzZSB0aGUgdW5pZmllZCBmaWVsZCBjb250cm9sIGdlbmVyYXRvclxuICBjb25zdCBjb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgdmFsdWVBY2Nlc3NvcjogYXR0ck5hbWUsXG4gICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICBpbmRlbnRcbiAgfTtcblxuICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woa2V5LCBwcm9wZXJ0eSwgY29udGV4dCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGRlZmF1bHQgdmFsdWUgZm9yIGEgcHJvcGVydHkgdHlwZVxuICovXG5jb25zdCBnZXREZWZhdWx0VmFsdWUgPSAoZmllbGRQcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBhbnkgPT4ge1xuICBzd2l0Y2ggKGZpZWxkUHJvcC50eXBlKSB7XG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIHVybDogJycsIG9wZW5zSW5OZXdUYWI6IGZhbHNlIH07XG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiB7IGxhYmVsOiAnJywgaHJlZjogJyMnLCB0YXJnZXQ6ICcnLCByZWw6ICcnLCBkaXNhYmxlZDogZmFsc2UgfTtcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBhbHQ6ICcnIH07XG4gICAgY2FzZSAndmlkZW8nOlxuICAgICAgcmV0dXJuIHsgc3JjOiAnJywgaWQ6ICcnLCBwb3N0ZXI6ICcnLCB0eXBlOiAnJywgd2lkdGg6IDAsIGhlaWdodDogMCwgbWltZTogJycsIG1pbWVUeXBlOiAnJyB9O1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoZmllbGRQcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW25lc3RlZEtleSwgbmVzdGVkUHJvcF0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRQcm9wLnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgbmVzdGVkW25lc3RlZEtleV0gPSBnZXREZWZhdWx0VmFsdWUobmVzdGVkUHJvcCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5lc3RlZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7fTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIDA7XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIFtdO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbi8qKlxuICogR2VuZXJhdGUgaGVscGVyIGZ1bmN0aW9ucyBmb3IgYXJyYXkgcHJvcGVydGllc1xuICogTm90ZTogV2l0aCB0aGUgMTB1cCBSZXBlYXRlciBjb21wb25lbnQsIHdlIG5vIGxvbmdlciBuZWVkIGN1c3RvbSBhZGQvdXBkYXRlL3JlbW92ZS9tb3ZlIGZ1bmN0aW9uc1xuICogVGhlIFJlcGVhdGVyIGhhbmRsZXMgYWxsIG9mIHRoaXMgaW50ZXJuYWxseSB2aWEgaXRzIHJlbmRlciBwcm9wXG4gKi9cbmNvbnN0IGdlbmVyYXRlQXJyYXlIZWxwZXJzID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBzdHJpbmcgPT4ge1xuICAvLyBUaGUgMTB1cCBSZXBlYXRlciBjb21wb25lbnQgaGFuZGxlcyBhcnJheSBtYW5pcHVsYXRpb24gaW50ZXJuYWxseVxuICAvLyBObyBjdXN0b20gaGVscGVyIGZ1bmN0aW9ucyBhcmUgbmVlZGVkXG4gIHJldHVybiAnJztcbn07XG5cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIGhhc2ggb2YgYSBzdHJpbmcgdG8gYSBudW1iZXIgaW4gWzAsIG1heCkuXG4gKi9cbmNvbnN0IGhhc2hTdHJpbmcgPSAoc3RyOiBzdHJpbmcsIG1heDogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgbGV0IGggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGggPSAoKGggPDwgNSkgLSBoICsgc3RyLmNoYXJDb2RlQXQoaSkpIHwgMDtcbiAgfVxuICByZXR1cm4gKChoICUgbWF4KSArIG1heCkgJSBtYXg7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGFuIFNWRyBpY29uIGVsZW1lbnQgc3RyaW5nIGZvciB1c2UgaW4gcmVnaXN0ZXJCbG9ja1R5cGUuXG4gKiBDcmVhdGVzIGEgY29sb3JlZCByb3VuZGVkIHJlY3RhbmdsZSB3aXRoIDEtMiBsZXR0ZXIgaW5pdGlhbHMgZGVyaXZlZFxuICogZnJvbSB0aGUgYmxvY2sgdGl0bGUsIHdpdGggdGhlIGJhY2tncm91bmQgY29sb3Iga2V5ZWQgdG8gdGhlIGdyb3VwLlxuICovXG5jb25zdCBnZW5lcmF0ZVN2Z0ljb24gPSAodGl0bGU6IHN0cmluZywgZ3JvdXA6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IEdST1VQX0NPTE9SUyA9IFtcbiAgICAnIzVCMjFCNicsICcjMEU3NDkwJywgJyNCNDUzMDknLCAnIzA0Nzg1NycsXG4gICAgJyNCRTEyM0MnLCAnIzQzMzhDQScsICcjMDM2OUExJywgJyNBMTYyMDcnLFxuICAgICcjMTU4MDNEJywgJyM5MzMzRUEnLCAnI0MyNDEwQycsICcjMUQ0RUQ4JyxcbiAgICAnIzA1OTY2OScsICcjN0MzQUVEJywgJyNEQzI2MjYnLCAnIzI1NjNFQicsXG4gIF07XG5cbiAgY29uc3Qgd29yZHMgPSB0aXRsZS5zcGxpdCgvW1xcc18tXSsvKS5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IGluaXRpYWxzID0gd29yZHMubGVuZ3RoID49IDJcbiAgICA/ICh3b3Jkc1swXVswXSArIHdvcmRzWzFdWzBdKS50b1VwcGVyQ2FzZSgpXG4gICAgOiAod29yZHNbMF0/LnN1YnN0cmluZygwLCAyKSB8fCAnSE8nKS50b1VwcGVyQ2FzZSgpO1xuXG4gIGNvbnN0IGNvbG9yID0gR1JPVVBfQ09MT1JTW2hhc2hTdHJpbmcoZ3JvdXAgfHwgdGl0bGUsIEdST1VQX0NPTE9SUy5sZW5ndGgpXTtcblxuICByZXR1cm4gYDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj5cbiAgICAgIDxyZWN0IHg9XCIyXCIgeT1cIjJcIiB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiByeD1cIjRcIiBmaWxsPVwiJHtjb2xvcn1cIiAvPlxuICAgICAgPHRleHQgeD1cIjEyXCIgeT1cIjE2LjVcIiB0ZXh0QW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIndoaXRlXCIgZm9udFNpemU9XCIxMFwiIGZvbnRGYW1pbHk9XCItYXBwbGUtc3lzdGVtLEJsaW5rTWFjU3lzdGVtRm9udCxzYW5zLXNlcmlmXCIgZm9udFdlaWdodD1cIjYwMFwiPiR7aW5pdGlhbHN9PC90ZXh0PlxuICAgIDwvc3ZnPmA7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIGluZGV4LmpzIGZpbGVcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHBhcmFtIGR5bmFtaWNBcnJheUNvbmZpZ3MgLSBPcHRpb25hbCBkeW5hbWljIGFycmF5IGNvbmZpZ3VyYXRpb25zIGtleWVkIGJ5IGZpZWxkIG5hbWVcbiAqIEBwYXJhbSBpbm5lckJsb2Nrc0ZpZWxkIC0gVGhlIHJpY2h0ZXh0IGZpZWxkIHRoYXQgdXNlcyBJbm5lckJsb2Nrcywgb3IgbnVsbCBpZiBub25lXG4gKiBAcGFyYW0gZGVwcmVjYXRpb25zQ29kZSAtIE9wdGlvbmFsIGRlcHJlY2F0aW9uIG1pZ3JhdGlvbiBjb2RlXG4gKiBAcGFyYW0gaGFzU2NyZWVuc2hvdCAtIFdoZXRoZXIgYSBzY3JlZW5zaG90LnBuZyBpcyBhdmFpbGFibGUgZm9yIGluc2VydGVyIHByZXZpZXdcbiAqL1xuY29uc3QgZ2VuZXJhdGVJbmRleEpzID0gKFxuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQsXG4gIGR5bmFtaWNBcnJheUNvbmZpZ3M/OiBSZWNvcmQ8c3RyaW5nLCBEeW5hbWljQXJyYXlDb25maWcgfCBCcmVhZGNydW1ic0FycmF5Q29uZmlnIHwgVGF4b25vbXlBcnJheUNvbmZpZyB8IFBhZ2luYXRpb25BcnJheUNvbmZpZz4sXG4gIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsLFxuICBkZXByZWNhdGlvbnNDb2RlPzogc3RyaW5nLFxuICBoYXNTY3JlZW5zaG90PzogYm9vbGVhbixcbiAgZWRpdG9yQ29uZmlnPzogaW1wb3J0KCcuLi90eXBlcycpLkhhbmRvZmZFZGl0b3JDb25maWcsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSB0b0Jsb2NrTmFtZShjb21wb25lbnQuaWQpO1xuICBjb25zdCBwcm9wZXJ0aWVzID0gY29tcG9uZW50LnByb3BlcnRpZXM7XG5cbiAgLy8gaGFzRHluYW1pY0FycmF5cyBpcyB0cnVlIG9ubHkgd2hlbiB0aGVyZSBhcmUgRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cykgZmllbGRzIOKAlFxuICAvLyB0aGUgc2ltcGxlciB0eXBlcyAoYnJlYWRjcnVtYnMvdGF4b25vbXkvcGFnaW5hdGlvbikgZG9uJ3QgbmVlZCBEeW5hbWljUG9zdFNlbGVjdG9yLlxuICBjb25zdCBoYXNEeW5hbWljQXJyYXlzID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKFxuICAgICAgICAoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKVxuICAgICAgKVxuICAgIDogZmFsc2U7XG5cbiAgLy8gSGVscGVyIHRvIGNoZWNrIGZvciBhIHR5cGUgaW4gcHJvcGVydGllcywgaW5jbHVkaW5nIG5lc3RlZCBpbiBhcnJheXMvb2JqZWN0c1xuICBjb25zdCBoYXNQcm9wZXJ0eVR5cGUgPSAodHlwZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgY29uc3QgY2hlY2tQcm9wZXJ0eSA9IChwcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09IHR5cGUpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AucHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgICAgIH1cbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICB9O1xuXG4gIC8vIFRoZSBpbm5lckJsb2Nrc0ZpZWxkIHVzZXMgSW5uZXJCbG9ja3MgKGNvbnRlbnQgc3RvcmVkIGluIHBvc3RfY29udGVudCwgbm90IGFuIGF0dHJpYnV0ZSkuXG4gIC8vIEFsbCBvdGhlciByaWNodGV4dCBmaWVsZHMgYmVjb21lIHN0cmluZyBhdHRyaWJ1dGVzIHdpdGggUmljaFRleHQgZWRpdGluZy5cbiAgY29uc3QgdXNlSW5uZXJCbG9ja3MgPSAhIWlubmVyQmxvY2tzRmllbGQ7XG5cbiAgLy8gR2V0IGFsbCBhdHRyaWJ1dGUgbmFtZXMg4oCTIGV4Y2x1ZGUgaW5uZXJCbG9ja3NGaWVsZCBhbmQgcGFnaW5hdGlvblxuICBjb25zdCBhdHRyTmFtZXMgPSBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKVxuICAgIC5maWx0ZXIoayA9PiBrICE9PSBpbm5lckJsb2Nrc0ZpZWxkICYmIHByb3BlcnRpZXNba10udHlwZSAhPT0gJ3BhZ2luYXRpb24nKVxuICAgIC5tYXAodG9DYW1lbENhc2UpO1xuXG4gIC8vIEluY2x1ZGUgYW55IGF0dHJpYnV0ZSBuYW1lcyByZWZlcmVuY2VkIGluIHRoZSB0ZW1wbGF0ZSBidXQgbWlzc2luZyBmcm9tIEFQSSBwcm9wZXJ0aWVzXG4gIC8vIChlLmcuIGJvZHkgLT4gYmxvY2tCb2R5IHNvIEpTWCBoYXMgYSBkZWZpbmVkIHZhcmlhYmxlIGFuZCBubyBSZWZlcmVuY2VFcnJvcikuXG4gIC8vIFNraXAgdGhlIGlubmVyQmxvY2tzRmllbGQg4oCUIGl0cyBjb250ZW50IGlzIHN0b3JlZCB2aWEgSW5uZXJCbG9ja3MsIG5vdCBhcyBhbiBhdHRyaWJ1dGUuXG4gIGNvbnN0IGlubmVyQmxvY2tzQXR0ck5hbWUgPSBpbm5lckJsb2Nrc0ZpZWxkID8gdG9DYW1lbENhc2UoaW5uZXJCbG9ja3NGaWVsZCkgOiBudWxsO1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgZ2V0VGVtcGxhdGVSZWZlcmVuY2VkQXR0cmlidXRlTmFtZXMoY29tcG9uZW50LmNvZGUpKSB7XG4gICAgaWYgKCFhdHRyTmFtZXMuaW5jbHVkZXMobmFtZSkgJiYgbmFtZSAhPT0gaW5uZXJCbG9ja3NBdHRyTmFtZSkgYXR0ck5hbWVzLnB1c2gobmFtZSk7XG4gIH1cbiAgXG4gIC8vIEFkZCBkeW5hbWljIGFycmF5IGF0dHJpYnV0ZSBuYW1lcyBiYXNlZCBvbiBjb25maWcgdHlwZVxuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZHluQ29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZE5hbWUpO1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluQ29uZmlnKSB8fCBpc1BhZ2luYXRpb25Db25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluQ29uZmlnKSkge1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1FbmFibGVkYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVRheG9ub215YCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cylcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBvc3RUeXBlYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UXVlcnlBcmdzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVJlbmRlck1vZGVgKTtcbiAgICAgICAgaWYgKChkeW5Db25maWcgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uKSB7XG4gICAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWRgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIERldGVybWluZSB3aGljaCBjb21wb25lbnRzIHdlIG5lZWQgdG8gaW1wb3J0XG4gIGNvbnN0IG5lZWRzTWVkaWFVcGxvYWQgPSBoYXNQcm9wZXJ0eVR5cGUoJ2ltYWdlJyk7XG4gIGNvbnN0IG5lZWRzUmFuZ2VDb250cm9sID0gaGFzT3BhY2l0eVJhbmdlRmllbGQocHJvcGVydGllcyk7XG4gIGNvbnN0IG5lZWRzVG9nZ2xlQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnYm9vbGVhbicpIHx8IGhhc1Byb3BlcnR5VHlwZSgnYnV0dG9uJyk7XG4gIGNvbnN0IG5lZWRzU2VsZWN0Q29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnc2VsZWN0Jyk7XG4gIGNvbnN0IGhhc0FycmF5UHJvcHMgPSBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUocCA9PiBwLnR5cGUgPT09ICdhcnJheScpO1xuICBjb25zdCBoYXNPYmplY3RQcm9wcyA9IGhhc1Byb3BlcnR5VHlwZSgnb2JqZWN0Jyk7XG5cbiAgLy8gQnVpbGQgaW1wb3J0c1xuICBjb25zdCBibG9ja0VkaXRvckltcG9ydHMgPSBbJ3VzZUJsb2NrUHJvcHMnLCAnSW5zcGVjdG9yQ29udHJvbHMnLCAnQmxvY2tDb250cm9scyddO1xuICBpZiAobmVlZHNNZWRpYVVwbG9hZCkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdNZWRpYVVwbG9hZCcsICdNZWRpYVVwbG9hZENoZWNrJywgJ01lZGlhUmVwbGFjZUZsb3cnKTtcbiAgfVxuICAvLyBJbm5lckJsb2NrcyBmb3IgdGhlIGRlc2lnbmF0ZWQgcmljaHRleHQgY29udGVudCBhcmVhXG4gIGlmICh1c2VJbm5lckJsb2Nrcykge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG4gIC8vIExpbmtDb250cm9sIGZvciBsaW5rL2J1dHRvbiBmaWVsZHMgKHdoZW4gbm90IHVzaW5nIHNoYXJlZCBIYW5kb2ZmTGlua0ZpZWxkKVxuICBjb25zdCBuZWVkc0xpbmtDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdsaW5rJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcblxuICBjb25zdCBoYXNCcmVhZGNydW1ic0FycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc0JyZWFkY3J1bWJzQ29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG4gIGNvbnN0IGhhc1RheG9ub215QXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzVGF4b25vbXlDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzUGFnaW5hdGlvbkFycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1BhZ2luYXRpb25Db25maWcoYykpXG4gICAgOiBmYWxzZTtcblxuICBjb25zdCBjb21wb25lbnRJbXBvcnRzID0gWydQYW5lbEJvZHknLCAnVGV4dENvbnRyb2wnLCAnQnV0dG9uJ107XG4gIGlmIChuZWVkc1JhbmdlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdSYW5nZUNvbnRyb2wnKTtcbiAgLy8gVG9nZ2xlQ29udHJvbDogb25seSBmb3IgYm9vbGVhbi9idXR0b24gcHJvcGVydHkgZmllbGRzIOKAlCBzcGVjaWFsIGFycmF5IHR5cGVzIHVzZSBzaGFyZWQgY29tcG9uZW50c1xuICBpZiAobmVlZHNUb2dnbGVDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RvZ2dsZUNvbnRyb2wnKTtcbiAgLy8gU2VsZWN0Q29udHJvbDogb25seSBmb3Igc2VsZWN0IHByb3BlcnR5IGZpZWxkcyBvciBEeW5hbWljUG9zdFNlbGVjdG9yIChwb3N0cykg4oCUIHRheG9ub215IGhhbmRsZWQgYnkgVGF4b25vbXlTZWxlY3RvclxuICBpZiAobmVlZHNTZWxlY3RDb250cm9sIHx8IGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU2VsZWN0Q29udHJvbCcpO1xuICAvLyBTcGlubmVyIGZvciBkeW5hbWljIGFycmF5IGxvYWRpbmcgc3RhdGUgaW4gZWRpdG9yIHByZXZpZXdcbiAgaWYgKGhhc0R5bmFtaWNBcnJheXMpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnU3Bpbm5lcicpO1xuICAvLyBUZXh0YXJlYUNvbnRyb2w6IG5lZWRlZCB3aGVuIHJpY2h0ZXh0IGZpZWxkcyBhcHBlYXIgaW5zaWRlIGFycmF5IGl0ZW1zXG4gIGNvbnN0IGhhc1JpY2h0ZXh0SW5BcnJheSA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmIHAuaXRlbXM/LnByb3BlcnRpZXMgJiZcbiAgICBPYmplY3QudmFsdWVzKHAuaXRlbXMucHJvcGVydGllcykuc29tZShpcCA9PiBpcC50eXBlID09PSAncmljaHRleHQnKVxuICApO1xuICBpZiAoaGFzUmljaHRleHRJbkFycmF5KSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1RleHRhcmVhQ29udHJvbCcpO1xuXG4gIGNvbXBvbmVudEltcG9ydHMucHVzaCgnRmxleCcpO1xuXG4gIC8vIDEwdXAgYmxvY2stY29tcG9uZW50cyBpbXBvcnRzXG4gIC8vIFJlcGVhdGVyIGlzIG9ubHkgbmVlZGVkIHdoZW4gdGhlcmUgYXJlIG5vbi1zZXJ2ZXItcmVuZGVyZWQgYXJyYXkgZmllbGRzIGluIHRoZSBzaWRlYmFyXG4gIC8vICh0YXhvbm9teS9icmVhZGNydW1icy9wYWdpbmF0aW9uIGFycmF5cyB1c2Ugc2hhcmVkIGNvbXBvbmVudHMgdGhhdCBpbXBvcnQgUmVwZWF0ZXIgdGhlbXNlbHZlcylcbiAgY29uc3QgaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKS5zb21lKChbaywgcF0pID0+XG4gICAgcC50eXBlID09PSAnYXJyYXknICYmICghZHluYW1pY0FycmF5Q29uZmlncz8uW2tdIHx8ICEoJ2FycmF5VHlwZScgaW4gZHluYW1pY0FycmF5Q29uZmlnc1trXSkpXG4gICk7XG4gIGNvbnN0IHRlblVwSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGhhc05vblNwZWNpYWxBcnJheVByb3BzKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ1JlcGVhdGVyJyk7XG4gIH1cblxuICAvLyBHZW5lcmF0ZSBhcnJheSBoZWxwZXJzXG4gIGNvbnN0IGFycmF5SGVscGVycyA9IGdlbmVyYXRlQXJyYXlIZWxwZXJzKHByb3BlcnRpZXMpO1xuXG4gIC8vIEdlbmVyYXRlIEpTWCBwcmV2aWV3IGZyb20gaGFuZGxlYmFycyB0ZW1wbGF0ZVxuICAvLyBUaGlzIG11c3QgaGFwcGVuIGJlZm9yZSBwYW5lbCBnZW5lcmF0aW9uIHNvIHdlIGtub3cgd2hpY2ggZmllbGRzIGhhdmUgaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgcHJldmlld1Jlc3VsdCA9IGdlbmVyYXRlSnN4UHJldmlldyhcbiAgICBjb21wb25lbnQuY29kZSxcbiAgICBwcm9wZXJ0aWVzLFxuICAgIGNvbXBvbmVudC5pZCxcbiAgICBjb21wb25lbnQudGl0bGUsXG4gICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICBlZGl0b3JDb25maWcsXG4gICk7XG4gIGxldCBwcmV2aWV3SnN4ID0gcHJldmlld1Jlc3VsdC5qc3g7XG4gIGNvbnN0IGlubGluZUVkaXRhYmxlRmllbGRzID0gcHJldmlld1Jlc3VsdC5pbmxpbmVFZGl0YWJsZUZpZWxkcztcblxuICAvLyBEZXRlY3QgaWYgcHJldmlldyB1c2VzIEhhbmRvZmZMaW5rRmllbGQgKGxpbmsvYnV0dG9uIGlubGluZSBlZGl0aW5nKVxuICBjb25zdCBwcmV2aWV3VXNlc0xpbmtGaWVsZCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxIYW5kb2ZmTGlua0ZpZWxkJyk7XG5cbiAgLy8gR2VuZXJhdGUgcGFuZWwgYm9kaWVzIGZvciBlYWNoIHByb3BlcnR5XG4gIGNvbnN0IHBhbmVsczogc3RyaW5nW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIC8vIHJpY2h0ZXh0IHVzZXMgSW5uZXJCbG9ja3Mgb24gdGhlIGNhbnZhcyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICAvLyBwYWdpbmF0aW9uIGlzIGF1dG8tZ2VuZXJhdGVkIGZyb20gcXVlcnkgcmVzdWx0cyDigJMgbm8gc2lkZWJhciBwYW5lbCBuZWVkZWRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3JpY2h0ZXh0JyB8fCBwcm9wZXJ0eS50eXBlID09PSAncGFnaW5hdGlvbicpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgaW5saW5lLWVkaXRhYmxlIG9uIHRoZSBjYW52YXMgKHRleHQsIGltYWdlLCBsaW5rLCBidXR0b25cbiAgICAvLyB3cmFwcGVkIGluIHt7I2ZpZWxkfX0pIOKAkyB0aGV5IGRvbid0IG5lZWQgc2lkZWJhciBjb250cm9scy5cbiAgICAvLyBBcnJheSBmaWVsZHMgYXJlIGFsd2F5cyBrZXB0OiB0aGV5IG5lZWQgc2lkZWJhciBVSSBmb3IgbWFudWFsL2R5bmFtaWMgdG9nZ2xlXG4gICAgLy8gYW5kIGZvciBhZGRpbmcvcmVtb3ZpbmcgaXRlbXMsIGV2ZW4gd2hlbiB0aGVpciBjaGlsZCBmaWVsZHMgYXJlIGlubGluZS1lZGl0YWJsZS5cbiAgICBpZiAoaW5saW5lRWRpdGFibGVGaWVsZHMuaGFzKGtleSkgJiYgcHJvcGVydHkudHlwZSAhPT0gJ2FycmF5JykgY29udGludWU7XG5cbiAgICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZHluYW1pY0NvbmZpZyA9IGR5bmFtaWNBcnJheUNvbmZpZ3M/LltrZXldO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBkeW5hbWljIGFycmF5IGZpZWxkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgZHluYW1pY0NvbmZpZykge1xuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gQnJlYWRjcnVtYnM6IHNoYXJlZCBjb21wb25lbnQgd2l0aCBzaW5nbGUgdmlzaWJpbGl0eSB0b2dnbGVcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBCcmVhZGNydW1icyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPEJyZWFkY3J1bWJzU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIFRheG9ub215OiBzaGFyZWQgY29tcG9uZW50IHdpdGggQXV0byAvIE1hbnVhbCB0YWJzXG4gICAgICAgIGNvbnN0IHRheG9ub215T3B0aW9ucyA9IGR5bmFtaWNDb25maWcudGF4b25vbWllcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0LCB2YWx1ZTogdCB9KSk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRUYXhvbm9teSA9IGR5bmFtaWNDb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnO1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5rZXlzKGl0ZW1Qcm9wcykubGVuZ3RoID4gMFxuICAgICAgICAgID8gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5tYXAoKFtmaWVsZEtleSwgZmllbGRQcm9wXSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBjdHg6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICAgICAgICAgICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbH0gfSlgLFxuICAgICAgICAgICAgICAgIGluZGVudDogJyAgICAgICAgICAgICAgICAnLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgY3R4KTtcbiAgICAgICAgICAgIH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG4nKVxuICAgICAgICAgIDogYCAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdMYWJlbCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLmxhYmVsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCBsYWJlbDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5cbiAgICAgICAgICAgICAgICA8VGV4dENvbnRyb2wgbGFiZWw9e19fKCdVUkwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS51cmwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIHVybDogdiB9KX0gX19uZXh0SGFzTm9NYXJnaW5Cb3R0b20gLz5gO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFRheG9ub215ICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8VGF4b25vbXlTZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgICAgdGF4b25vbXlPcHRpb25zPXske0pTT04uc3RyaW5naWZ5KHRheG9ub215T3B0aW9ucyl9fVxuICAgICAgICAgICAgICBkZWZhdWx0VGF4b25vbXk9XCIke2RlZmF1bHRUYXhvbm9teX1cIlxuICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICByZW5kZXJNYW51YWxJdGVtcz17KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4gICAgICAgICAgICAgICAgPD5cbiR7aXRlbUZpZWxkc31cbiAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2UgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBQYWdpbmF0aW9uOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gUGFnaW5hdGlvbiAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFBhZ2luYXRpb25TZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQb3N0cyAoRHluYW1pY0FycmF5Q29uZmlnKTogZnVsbCBEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgIGNvbnN0IGRlZmF1bHRNb2RlID0gZHluYW1pY0NvbmZpZy5zZWxlY3Rpb25Nb2RlID09PSAnbWFudWFsJyA/ICdzZWxlY3QnIDogJ3F1ZXJ5JztcbiAgICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0NvbmZpZyA9IGR5bmFtaWNDb25maWcuaXRlbU92ZXJyaWRlc0NvbmZpZyB8fCB7fTtcbiAgICAgICAgY29uc3QgYWR2YW5jZWRGaWVsZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IG9wdGlvbnM/OiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT47IGRlZmF1bHQ/OiBhbnkgfT4gPSBbXTtcblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBpdGVtT3ZlcnJpZGVzQ29uZmlnIChsZWdhY3kpXG4gICAgICAgIGZvciAoY29uc3QgW25hbWUsIGNdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1PdmVycmlkZXNDb25maWcpIGFzIEFycmF5PFtzdHJpbmcsIEl0ZW1PdmVycmlkZUZpZWxkQ29uZmlnXT4pIHtcbiAgICAgICAgICBpZiAoYy5tb2RlID09PSAndWknKSB7XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZSwgbGFiZWw6IGMubGFiZWwsIHR5cGU6ICdzZWxlY3QnLCBvcHRpb25zOiBub3JtYWxpemVTZWxlY3RPcHRpb25zKGMub3B0aW9ucyksIGRlZmF1bHQ6IGMuZGVmYXVsdCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaWVsZHMgZnJvbSBmaWVsZE1hcHBpbmcgd2l0aCB0eXBlOiBcIm1hbnVhbFwiIOKAlCBkZXJpdmUgY29udHJvbCB0eXBlIGZyb20gaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBmaWVsZE1hcHBpbmcgPSBkeW5hbWljQ29uZmlnLmZpZWxkTWFwcGluZyB8fCB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbZmllbGRQYXRoLCBtYXBwaW5nVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkTWFwcGluZykpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmdWYWx1ZSA9PT0gJ29iamVjdCcgJiYgbWFwcGluZ1ZhbHVlICE9PSBudWxsICYmIChtYXBwaW5nVmFsdWUgYXMgYW55KS50eXBlID09PSAnbWFudWFsJykge1xuICAgICAgICAgICAgY29uc3QgdG9wS2V5ID0gZmllbGRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1t0b3BLZXldO1xuICAgICAgICAgICAgY29uc3QgZmllbGRMYWJlbCA9IGl0ZW1Qcm9wPy5uYW1lIHx8IHRvVGl0bGVDYXNlKHRvcEtleSk7XG4gICAgICAgICAgICBsZXQgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICBsZXQgb3B0aW9uczogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgbGV0IGRlZmF1bHRWYWw6IGFueSA9IGl0ZW1Qcm9wPy5kZWZhdWx0ID8/ICcnO1xuICAgICAgICAgICAgaWYgKGl0ZW1Qcm9wKSB7XG4gICAgICAgICAgICAgIHN3aXRjaCAoaXRlbVByb3AudHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdzZWxlY3QnO1xuICAgICAgICAgICAgICAgICAgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoaXRlbVByb3Aub3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3RvZ2dsZSc7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gMDtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlZEZpZWxkcy5wdXNoKHsgbmFtZTogZmllbGRQYXRoLCBsYWJlbDogZmllbGRMYWJlbCwgdHlwZTogY29udHJvbFR5cGUsIG9wdGlvbnMsIGRlZmF1bHQ6IGRlZmF1bHRWYWwgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhZ2luYXRpb25Ub2dnbGUgPSBkeW5hbWljQ29uZmlnLnBhZ2luYXRpb25cbiAgICAgICAgICA/IGBcbiAgICAgICAgICAgICAgICA8VG9nZ2xlQ29udHJvbFxuICAgICAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93IFBhZ2luYXRpb24nLCAnaGFuZG9mZicpfVxuICAgICAgICAgICAgICAgICAgY2hlY2tlZD17JHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZCA/PyB0cnVlfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQ6IHZhbHVlIH0pfVxuICAgICAgICAgICAgICAgIC8+YFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gRHluYW1pYyAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgICAgICAgdmFsdWU9e3tcbiAgICAgICAgICAgICAgICBzb3VyY2U6ICR7YXR0ck5hbWV9U291cmNlIHx8ICcke2RlZmF1bHRNb2RlfScsXG4gICAgICAgICAgICAgICAgcG9zdFR5cGU6ICR7YXR0ck5hbWV9UG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgcXVlcnlBcmdzOiAke2F0dHJOYW1lfVF1ZXJ5QXJncyB8fCB7fSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZFBvc3RzOiAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgaXRlbU92ZXJyaWRlczogJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzIHx8IHt9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsobmV4dFZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNvdXJjZTogbmV4dFZhbHVlLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVBvc3RUeXBlOiBuZXh0VmFsdWUucG9zdFR5cGUsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1RdWVyeUFyZ3M6IHsgLi4ubmV4dFZhbHVlLnF1ZXJ5QXJncywgcG9zdF90eXBlOiBuZXh0VmFsdWUucG9zdFR5cGUgfSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHM6IG5leHRWYWx1ZS5zZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlczogbmV4dFZhbHVlLml0ZW1PdmVycmlkZXMgPz8ge31cbiAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICAgIG9wdGlvbnM9e3tcbiAgICAgICAgICAgICAgICBwb3N0VHlwZXM6ICR7SlNPTi5zdHJpbmdpZnkoZHluYW1pY0NvbmZpZy5wb3N0VHlwZXMpfSxcbiAgICAgICAgICAgICAgICBtYXhJdGVtczogJHtkeW5hbWljQ29uZmlnLm1heEl0ZW1zID8/IDIwfSxcbiAgICAgICAgICAgICAgICB0ZXh0RG9tYWluOiAnaGFuZG9mZicsXG4gICAgICAgICAgICAgICAgc2hvd0RhdGVGaWx0ZXI6ICR7KGR5bmFtaWNDb25maWcgYXMgYW55KS5zaG93RGF0ZUZpbHRlciA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZSd9LFxuICAgICAgICAgICAgICAgIHNob3dFeGNsdWRlQ3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBhZHZhbmNlZEZpZWxkczogJHtKU09OLnN0cmluZ2lmeShhZHZhbmNlZEZpZWxkcyl9XG4gICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPiR7cGFnaW5hdGlvblRvZ2dsZX1cbiAgICAgICAgICAgIHske2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcgJiYgKFxuICAgICAgICAgICAgICA8PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTdGFuZGFyZCBwYW5lbCAobm9uLWR5bmFtaWMpXG4gICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuJHtnZW5lcmF0ZVByb3BlcnR5Q29udHJvbChrZXksIHByb3BlcnR5KX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICB9XG4gIH1cblxuICAvLyBBZGQgSGFuZG9mZiBkZXNpZ24gc3lzdGVtIGxpbmtzIHBhbmVsXG4gIGNvbnN0IGRlc2lnblN5c3RlbVBhbmVsID0gW1xuICAgICcgICAgICAgICAgey8qIERlc2lnbiBTeXN0ZW0gTGlua3MgKi99JyxcbiAgICAnICAgICAgICAgIHsobWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsIHx8IG1ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwpICYmICgnLFxuICAgICcgICAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXyhcXCdEZXNpZ24gU3lzdGVtXFwnLCBcXCdoYW5kb2ZmXFwnKX0gaW5pdGlhbE9wZW49e2ZhbHNlfT4nLFxuICAgICcgICAgICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+JyxcbiAgICAnICAgICAgICAgICAgICAgIHttZXRhZGF0YS5fX2hhbmRvZmY/LmhhbmRvZmZVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmhhbmRvZmZVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwidmlzaWJpbGl0eVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdWaWV3IGluIEhhbmRvZmZcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5maWdtYVVybCAmJiAoJyxcbiAgICAnICAgICAgICAgICAgICAgICAgPEJ1dHRvbicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBocmVmPXttZXRhZGF0YS5fX2hhbmRvZmYuZmlnbWFVcmx9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB0YXJnZXQ9XCJfYmxhbmtcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBpY29uPVwiYXJ0XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBcXCcxMDAlXFwnLCBqdXN0aWZ5Q29udGVudDogXFwnY2VudGVyXFwnIH19JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAge19fKFxcJ09wZW4gaW4gRmlnbWFcXCcsIFxcJ2hhbmRvZmZcXCcpfScsXG4gICAgJyAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPicsXG4gICAgJyAgICAgICAgICAgICAgICApfScsXG4gICAgJyAgICAgICAgICAgICAgPC9GbGV4PicsXG4gICAgJyAgICAgICAgICAgIDwvUGFuZWxCb2R5PicsXG4gICAgJyAgICAgICAgICApfScsXG4gIF0uam9pbignXFxuJyk7XG4gIHBhbmVscy5wdXNoKGRlc2lnblN5c3RlbVBhbmVsKTtcblxuICAvLyBEeW5hbWljIGFycmF5IHJlc29sdXRpb24gZm9yIGVkaXRvciBwcmV2aWV3LlxuICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAvLyBCcmVhZGNydW1iczogbGl2ZSBmZXRjaCB2aWEgUkVTVCBlbmRwb2ludFxuICAvLyBUYXhvbm9teSAoYXV0byBtb2RlKTogbGl2ZSBmZXRjaCB2aWEgdXNlU2VsZWN0IHdpdGggY29yZS1kYXRhXG4gIC8vIFBhZ2luYXRpb246IHNlcnZlci1yZW5kZXJlZCBvbmx5IChzdHViIHZhcmlhYmxlKVxuICBsZXQgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSAnJztcbiAgY29uc3QgcmVzb2x2aW5nRmxhZ3M6IHN0cmluZ1tdID0gW107XG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGRLZXksIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGRLZXkpO1xuICAgICAgY29uc3QgZmllbGRQcm9wID0gcHJvcGVydGllc1tmaWVsZEtleV07XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBmaWVsZFByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuXG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnXSk7XG4gICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnNcbiAgICAgICAgICA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBbcHJldmlldyR7Y2FwfSwgc2V0UHJldmlldyR7Y2FwfV0gPSB1c2VTdGF0ZShudWxsKTtcbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgIGlmICghcG9zdElkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGFwaUZldGNoKHsgcGF0aDogXFxgL2hhbmRvZmYvdjEvYnJlYWRjcnVtYnM/cG9zdF9pZD1cXCR7cG9zdElkfVxcYCB9KVxuICAgICAgICAudGhlbigoaXRlbXMpID0+IHNldFByZXZpZXcke2NhcH0oKGl0ZW1zIHx8IFtdKSR7bWFwRXhwcn0pKVxuICAgICAgICAuY2F0Y2goKCkgPT4gc2V0UHJldmlldyR7Y2FwfShbXSkpO1xuICAgIH0sIFske2F0dHJOYW1lfUVuYWJsZWRdKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1RheG9ub215Q29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCcsICdzbHVnJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7Y2FwfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCEke2F0dHJOYW1lfUVuYWJsZWQpIHJldHVybiBbXTtcbiAgICAgICAgaWYgKCR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJykgcmV0dXJuICR7YXR0ck5hbWV9IHx8IFtdO1xuICAgICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgICBpZiAoIXBvc3RJZCkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0YXhvbm9teSA9ICR7YXR0ck5hbWV9VGF4b25vbXkgfHwgJyR7Y29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJ30nO1xuICAgICAgICBjb25zdCByZXN0QmFzZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRUYXhvbm9teSh0YXhvbm9teSk/LnJlc3RfYmFzZTtcbiAgICAgICAgaWYgKCFyZXN0QmFzZSkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB0ZXJtcyA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKS5nZXRFbnRpdHlSZWNvcmRzKCd0YXhvbm9teScsIHRheG9ub215LCB7IHBvc3Q6IHBvc3RJZCwgcGVyX3BhZ2U6ICR7Y29uZmlnLm1heEl0ZW1zID8/IC0xfSB9KTtcbiAgICAgICAgaWYgKCF0ZXJtcykgcmV0dXJuIFtdO1xuICAgICAgICByZXR1cm4gdGVybXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdC5uYW1lLCB1cmw6IHQubGluayB8fCAnJywgc2x1ZzogdC5zbHVnIHx8ICcnIH0pKSR7bWFwRXhwcn07XG4gICAgICB9LFxuICAgICAgWyR7YXR0ck5hbWV9RW5hYmxlZCwgJHthdHRyTmFtZX1Tb3VyY2UsICR7YXR0ck5hbWV9VGF4b25vbXksIEpTT04uc3RyaW5naWZ5KCR7YXR0ck5hbWV9IHx8IFtdKV1cbiAgICApO1xuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWR8U291cmNlfFRheG9ub215KWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2NhcH1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1BhZ2luYXRpb25Db25maWcoY29uZmlnKSkge1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX0gPSBbXTsgLy8gUGFnaW5hdGlvbiByZW5kZXJzIG9uIHRoZSBmcm9udGVuZFxuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7YXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpOiBmdWxsIHVzZVNlbGVjdCByZXNvbHV0aW9uXG4gICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgY29uc3QgcHJldmlld1Zhck5hbWUgPSBgcHJldmlldyR7Y2FwfWA7XG4gICAgICBjb25zdCByZXNvbHZlZFZhck5hbWUgPSBgcmVzb2x2ZWQke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2aW5nVmFyTmFtZSA9IGBpc1Jlc29sdmluZyR7Y2FwfWA7XG4gICAgICByZXNvbHZpbmdGbGFncy5wdXNoKHJlc29sdmluZ1Zhck5hbWUpO1xuICAgICAgY29uc3Qgc291cmNlQXR0ciA9IGAke2F0dHJOYW1lfVNvdXJjZWA7XG4gICAgICBjb25zdCBxdWVyeUFyZ3NBdHRyID0gYCR7YXR0ck5hbWV9UXVlcnlBcmdzYDtcbiAgICAgIGNvbnN0IHBvc3RUeXBlQXR0ciA9IGAke2F0dHJOYW1lfVBvc3RUeXBlYDtcbiAgICAgIGNvbnN0IHNlbGVjdGVkUG9zdHNBdHRyID0gYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2A7XG4gICAgICBjb25zdCBmaWVsZE1hcHBpbmdBdHRyID0gYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYDtcbiAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNBdHRyID0gYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2A7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgJHtyZXNvbHZlZFZhck5hbWV9ID0gdXNlU2VsZWN0KFxuICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ21hbnVhbCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHN0b3JlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpO1xuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3F1ZXJ5Jykge1xuICAgICAgICAgIGNvbnN0IHF1ZXJ5QXJncyA9ICR7cXVlcnlBcmdzQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3QgcG9zdFR5cGUgPSAke3Bvc3RUeXBlQXR0cn0gfHwgJ3Bvc3QnO1xuICAgICAgICAgIGNvbnN0IGFyZ3MgPSB7XG4gICAgICAgICAgICBwZXJfcGFnZTogcXVlcnlBcmdzLnBvc3RzX3Blcl9wYWdlIHx8ICR7Y29uZmlnLm1heEl0ZW1zID8/IDZ9LFxuICAgICAgICAgICAgb3JkZXJieTogcXVlcnlBcmdzLm9yZGVyYnkgfHwgJ2RhdGUnLFxuICAgICAgICAgICAgb3JkZXI6IChxdWVyeUFyZ3Mub3JkZXIgfHwgJ0RFU0MnKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICAgX2VtYmVkOiB0cnVlLFxuICAgICAgICAgICAgc3RhdHVzOiAncHVibGlzaCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAocXVlcnlBcmdzLnRheF9xdWVyeSAmJiBxdWVyeUFyZ3MudGF4X3F1ZXJ5Lmxlbmd0aCkge1xuICAgICAgICAgICAgcXVlcnlBcmdzLnRheF9xdWVyeS5mb3JFYWNoKCh0cSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIXRxLnRheG9ub215IHx8ICF0cS50ZXJtcyB8fCAhdHEudGVybXMubGVuZ3RoKSByZXR1cm47XG4gICAgICAgICAgICAgIGNvbnN0IHBhcmFtID0gdHEudGF4b25vbXkgPT09ICdjYXRlZ29yeScgPyAnY2F0ZWdvcmllcycgOiB0cS50YXhvbm9teSA9PT0gJ3Bvc3RfdGFnJyA/ICd0YWdzJyA6IHRxLnRheG9ub215O1xuICAgICAgICAgICAgICBhcmdzW3BhcmFtXSA9IHRxLnRlcm1zLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWNvcmRzID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkcygncG9zdFR5cGUnLCBwb3N0VHlwZSwgYXJncyk7XG4gICAgICAgICAgaWYgKHJlY29yZHMgPT09IG51bGwgfHwgcmVjb3JkcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShyZWNvcmRzKSkgcmV0dXJuIFtdO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIHJldHVybiByZWNvcmRzLm1hcCgocmVjKSA9PlxuICAgICAgICAgICAgbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAnc2VsZWN0Jykge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW107XG4gICAgICAgICAgaWYgKCFzZWxlY3RlZC5sZW5ndGgpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gc2VsZWN0ZWRcbiAgICAgICAgICAgIC5tYXAoKHNlbCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCByZWMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmQoJ3Bvc3RUeXBlJywgc2VsLnR5cGUgfHwgJ3Bvc3QnLCBzZWwuaWQpO1xuICAgICAgICAgICAgICByZXR1cm4gcmVjID8gbWFwUG9zdEVudGl0eVRvSXRlbShyZWMsIG1hcHBpbmcsIG92ZXJyaWRlcywgcmVjLl9lbWJlZGRlZCB8fCB7fSkgOiBudWxsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSxcbiAgICAgIFske3NvdXJjZUF0dHJ9LCAke3Bvc3RUeXBlQXR0cn0sIEpTT04uc3RyaW5naWZ5KCR7cXVlcnlBcmdzQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke3NlbGVjdGVkUG9zdHNBdHRyfSB8fCBbXSksIEpTT04uc3RyaW5naWZ5KCR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge30pLCBKU09OLnN0cmluZ2lmeSgke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fSldXG4gICAgKTtcbiAgICBjb25zdCAke3ByZXZpZXdWYXJOYW1lfSA9ICR7c291cmNlQXR0cn0gIT09ICdtYW51YWwnID8gKCR7cmVzb2x2ZWRWYXJOYW1lfSA/PyBbXSkgOiAoJHthdHRyTmFtZX0gPz8gW10pO1xuICAgIGNvbnN0ICR7cmVzb2x2aW5nVmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyAmJiAke3Jlc29sdmVkVmFyTmFtZX0gPT09IHVuZGVmaW5lZDtcbmA7XG4gICAgICAvLyBVc2UgcHJldmlldyB2YXJpYWJsZSBpbiB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgSlNYIHNvIHRoZSBlZGl0b3Igc2hvd3MgcXVlcnkvc2VsZWN0IHJlc3VsdHNcbiAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGJgLCAnZycpO1xuICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBwcmV2aWV3VmFyTmFtZSk7XG4gICAgfVxuICAgIGlmIChyZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgaXNQcmV2aWV3TG9hZGluZyA9ICR7cmVzb2x2aW5nRmxhZ3Muam9pbignIHx8ICcpfTtcbmA7XG4gICAgfVxuICAgIC8vIFdoZW4gcHJldmlldyBKU1ggcmVmZXJlbmNlcyBwYWdpbmF0aW9uIChmcm9tIEhCUykgYnV0IHBhZ2luYXRpb24gaXMgb25seSBidWlsdCBzZXJ2ZXItc2lkZSxcbiAgICAvLyBkZWZpbmUgaXQgaW4gdGhlIGVkaXQgc28gdGhlIGVkaXRvciBkb2Vzbid0IHRocm93IFJlZmVyZW5jZUVycm9yLlxuICAgIGNvbnN0IHByZXZpZXdVc2VzUGFnaW5hdGlvbiA9IC9cXGJwYWdpbmF0aW9uXFxiLy50ZXN0KHByZXZpZXdKc3gpO1xuICAgIGNvbnN0IGFueUNvbmZpZ0hhc1BhZ2luYXRpb24gPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gISgnYXJyYXlUeXBlJyBpbiBjKSAmJiAhIShjIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbilcbiAgICAgIDogZmFsc2U7XG4gICAgaWYgKHByZXZpZXdVc2VzUGFnaW5hdGlvbiAmJiBhbnlDb25maWdIYXNQYWdpbmF0aW9uICYmICFkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZS5pbmNsdWRlcygnY29uc3QgcGFnaW5hdGlvbicpKSB7XG4gICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSA9IGAgICAgY29uc3QgcGFnaW5hdGlvbiA9IFtdOyAvLyBFZGl0b3I6IHBhZ2luYXRpb24gaXMgYnVpbHQgc2VydmVyLXNpZGUgaW4gcmVuZGVyLnBocFxuYCArIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGludGVyYWN0aXZlQ2FudmFzID0gZ2VuZXJhdGVJbnRlcmFjdGl2ZUNhbnZhc0NvZGUoXG4gICAgY29tcG9uZW50LmlkLFxuICAgIGF0dHJOYW1lcyxcbiAgICBlZGl0b3JDb25maWcsXG4gICAgY29tcG9uZW50LndvcmRwcmVzcyxcbiAgKTtcbiAgaWYgKGludGVyYWN0aXZlQ2FudmFzKSB7XG4gICAgcHJldmlld0pzeCA9IGluamVjdENhbnZhc1JlZkludG9QcmV2aWV3SnN4KHByZXZpZXdKc3gpO1xuICB9XG5cbiAgLy8gV2hlbiB1c2luZyBkeW5hbWljIHBvc3RzLCB3cmFwIHByZXZpZXcgaW4gbG9hZGluZyBzdGF0ZVxuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnQuaWQucmVwbGFjZSgvXy9nLCAnLScpO1xuICBjb25zdCBwcmV2aWV3Q29udGVudCA9IHJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDBcbiAgICA/IGB7aXNQcmV2aWV3TG9hZGluZyA/IChcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyBpcy1sb2FkaW5nXCIgc3R5bGU9e3sgbWluSGVpZ2h0OiAnMTIwcHgnLCBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGdhcDogJzhweCcgfX0+XG4gICAgICAgICAgICA8U3Bpbm5lciAvPlxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgY29sb3I6ICd2YXIoLS13cC1hZG1pbi10aGVtZS1jb2xvci1kYXJrZXIsICMxZTFlMWUpJyB9fT57X18oJ0xvYWRpbmcgcG9zdHPigKYnLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKSA6IChcbiR7cHJldmlld0pzeH1cbiAgICAgICAgKX1gXG4gICAgOiBwcmV2aWV3SnN4O1xuXG4gIC8vIENoZWNrIHRoZSBnZW5lcmF0ZWQgcHJldmlldyBmb3IgY29tcG9uZW50cyB0aGF0IG5lZWQgdG8gYmUgaW1wb3J0ZWRcbiAgLy8gVGhpcyBjYXRjaGVzIGNvbXBvbmVudHMgYWRkZWQgYnkgdGhlIGhhbmRsZWJhcnMtdG8tanN4IHRyYW5zcGlsZXIgKGUuZy4sIGZyb20ge3sjZmllbGR9fSBtYXJrZXJzKVxuICBjb25zdCBwcmV2aWV3VXNlc1JpY2hUZXh0ID0gcHJldmlld0pzeC5pbmNsdWRlcygnPFJpY2hUZXh0Jyk7XG4gIGNvbnN0IHByZXZpZXdVc2VzMTB1cEltYWdlID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEltYWdlJyk7XG5cbiAgLy8gQWRkIFJpY2hUZXh0IHRvIGltcG9ydHMgaWYgdXNlZCBpbiBwcmV2aWV3IChhbmQgbm90IGFscmVhZHkgaW5jbHVkZWQgZnJvbSBwcm9wZXJ0eSB0eXBlcylcbiAgaWYgKChwcmV2aWV3VXNlc1JpY2hUZXh0IHx8IHByZXZpZXdVc2VzTGlua0ZpZWxkKSAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdSaWNoVGV4dCcpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ1JpY2hUZXh0Jyk7XG4gIH1cblxuICAvLyBMaW5rQ29udHJvbCBpcyBuZWVkZWQgZm9yIHNpZGViYXIgbGluay9idXR0b24gcHJvcGVydHkgcGFuZWxzOyBhZGQgdW5jb25kaXRpb25hbGx5IHdoZW4gcHJlc2VudC5cbiAgLy8gKEhhbmRvZmZMaW5rRmllbGQgaW4gdGhlIHByZXZpZXcgaXMgc2VwYXJhdGUg4oCUIGl0J3MgaW1wb3J0ZWQgZnJvbSB0aGUgc2hhcmVkIGNvbXBvbmVudCBhbmQgaGFuZGxlcyBpdHMgb3duIExpbmtDb250cm9sIGludGVybmFsbHkuKVxuICBpZiAobmVlZHNMaW5rQ29udHJvbCkge1xuICAgIGlmICghYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdMaW5rQ29udHJvbCcpKSBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTGlua0NvbnRyb2wnKTtcbiAgICBpZiAoIWNvbXBvbmVudEltcG9ydHMuaW5jbHVkZXMoJ1BvcG92ZXInKSkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdQb3BvdmVyJyk7XG4gIH1cblxuICAvLyBBZGQgSW5uZXJCbG9ja3MgaWYgdXNlZCBpbiBwcmV2aWV3IGJ1dCBub3QgYWxyZWFkeSBpbXBvcnRlZFxuICBjb25zdCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID0gcHJldmlld0pzeC5pbmNsdWRlcygnPElubmVyQmxvY2tzJyk7XG4gIGlmIChwcmV2aWV3VXNlc0lubmVyQmxvY2tzICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0lubmVyQmxvY2tzJykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnSW5uZXJCbG9ja3MnKTtcbiAgfVxuXG4gIC8vIEJ1aWxkIHRoZSAxMHVwIGltcG9ydCBpZiBuZWVkZWQgKEltYWdlIGZvciBwcmV2aWV3LCBSZXBlYXRlciBmb3IgYXJyYXlzKVxuICBpZiAocHJldmlld1VzZXMxMHVwSW1hZ2UpIHtcbiAgICB0ZW5VcEltcG9ydHMucHVzaCgnSW1hZ2UnKTtcbiAgfVxuICBjb25zdCB0ZW5VcEltcG9ydCA9IHRlblVwSW1wb3J0cy5sZW5ndGggPiAwXG4gICAgPyBgaW1wb3J0IHsgJHt0ZW5VcEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAMTB1cC9ibG9jay1jb21wb25lbnRzJztcXG5gXG4gICAgOiAnJztcblxuICAvLyBDb2xsZWN0IGFsbCBpbWFnZSBmaWVsZHMgZm9yIEJsb2NrQ29udHJvbHMvTWVkaWFSZXBsYWNlRmxvd1xuICBpbnRlcmZhY2UgSW1hZ2VGaWVsZEluZm8ge1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgYXR0clBhdGg6IHN0cmluZzsgIC8vIGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdsZWZ0Q2FyZC5pbWFnZSdcbiAgICB2YWx1ZUV4cHI6IHN0cmluZzsgLy8gZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2xlZnRDYXJkPy5pbWFnZSdcbiAgICB1cGRhdGVFeHByOiBzdHJpbmc7IC8vIGUuZy4sICdzZXRBdHRyaWJ1dGVzKHsgYmFja2dyb3VuZEltYWdlOiAuLi4gfSknIG9yIG5lc3RlZCB1cGRhdGVcbiAgfVxuICBcbiAgY29uc3QgaW1hZ2VGaWVsZHM6IEltYWdlRmllbGRJbmZvW10gPSBbXTtcbiAgXG4gIGNvbnN0IGNvbGxlY3RJbWFnZUZpZWxkcyA9IChwcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiwgcGFyZW50UGF0aDogc3RyaW5nID0gJycsIHBhcmVudFZhbHVlUGF0aDogc3RyaW5nID0gJycpID0+IHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgICAgY29uc3QgY3VycmVudFBhdGggPSBwYXJlbnRQYXRoID8gYCR7cGFyZW50UGF0aH0uJHthdHRyTmFtZX1gIDogYXR0ck5hbWU7XG4gICAgICBjb25zdCBjdXJyZW50VmFsdWVQYXRoID0gcGFyZW50VmFsdWVQYXRoID8gYCR7cGFyZW50VmFsdWVQYXRofT8uJHthdHRyTmFtZX1gIDogYXR0ck5hbWU7XG4gICAgICBcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBwcm9wLm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcbiAgICAgICAgbGV0IHVwZGF0ZUV4cHI6IHN0cmluZztcbiAgICAgICAgXG4gICAgICAgIGlmIChwYXJlbnRQYXRoKSB7XG4gICAgICAgICAgLy8gTmVzdGVkIGltYWdlIGZpZWxkIC0gbmVlZCB0byBzcHJlYWQgcGFyZW50IG9iamVjdFxuICAgICAgICAgIGNvbnN0IHBhcmVudEF0dHIgPSBwYXJlbnRQYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgY29uc3QgcGFyZW50Q2FtZWwgPSB0b0NhbWVsQ2FzZShwYXJlbnRBdHRyKTtcbiAgICAgICAgICB1cGRhdGVFeHByID0gYHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudENhbWVsfTogeyAuLi4ke3BhcmVudENhbWVsfSwgJHthdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9IH0pYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUb3AtbGV2ZWwgaW1hZ2UgZmllbGRcbiAgICAgICAgICB1cGRhdGVFeHByID0gYHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0pYDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaW1hZ2VGaWVsZHMucHVzaCh7XG4gICAgICAgICAgbGFiZWwsXG4gICAgICAgICAgYXR0clBhdGg6IGN1cnJlbnRQYXRoLFxuICAgICAgICAgIHZhbHVlRXhwcjogY3VycmVudFZhbHVlUGF0aCxcbiAgICAgICAgICB1cGRhdGVFeHByXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBSZWN1cnNlIGludG8gb2JqZWN0IHByb3BlcnRpZXNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb2xsZWN0SW1hZ2VGaWVsZHMocHJvcC5wcm9wZXJ0aWVzLCBjdXJyZW50UGF0aCwgY3VycmVudFZhbHVlUGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBcbiAgY29sbGVjdEltYWdlRmllbGRzKHByb3BlcnRpZXMpO1xuICBcbiAgLy8gR2VuZXJhdGUgQmxvY2tDb250cm9scyB3aXRoIE1lZGlhUmVwbGFjZUZsb3cgZm9yIGVhY2ggaW1hZ2UgZmllbGRcbiAgY29uc3QgYmxvY2tDb250cm9sc0pzeCA9IGltYWdlRmllbGRzLmxlbmd0aCA+IDAgPyBgXG4gICAgICAgIDxCbG9ja0NvbnRyb2xzIGdyb3VwPVwib3RoZXJcIj5cbiR7aW1hZ2VGaWVsZHMubWFwKGZpZWxkID0+IGAgICAgICAgICAgPE1lZGlhUmVwbGFjZUZsb3dcbiAgICAgICAgICAgIG1lZGlhSWQ9eyR7ZmllbGQudmFsdWVFeHByfT8uaWR9XG4gICAgICAgICAgICBtZWRpYVVybD17JHtmaWVsZC52YWx1ZUV4cHJ9Py5zcmN9XG4gICAgICAgICAgICBhbGxvd2VkVHlwZXM9e1snaW1hZ2UnXX1cbiAgICAgICAgICAgIGFjY2VwdD1cImltYWdlLypcIlxuICAgICAgICAgICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtmaWVsZC51cGRhdGVFeHByfX1cbiAgICAgICAgICAgIG5hbWU9e19fKCcke2ZpZWxkLmxhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgLz5gKS5qb2luKCdcXG4nKX1cbiAgICAgICAgPC9CbG9ja0NvbnRyb2xzPmAgOiAnJztcblxuICAvLyBTaGFyZWQgY29tcG9uZW50IGltcG9ydHMgZm9yIGR5bmFtaWMgYXJyYXlzIChzZWxlY3RvciBVSSArIGVkaXRvciBwcmV2aWV3IG1hcHBpbmcpXG4gIGNvbnN0IHNoYXJlZE5hbWVkSW1wb3J0czogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGhhc0R5bmFtaWNBcnJheXMpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdEeW5hbWljUG9zdFNlbGVjdG9yJywgJ21hcFBvc3RFbnRpdHlUb0l0ZW0nKTtcbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdCcmVhZGNydW1ic1NlbGVjdG9yJyk7XG4gIGlmIChoYXNUYXhvbm9teUFycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnVGF4b25vbXlTZWxlY3RvcicpO1xuICBpZiAoaGFzUGFnaW5hdGlvbkFycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnUGFnaW5hdGlvblNlbGVjdG9yJyk7XG5cbiAgbGV0IHNoYXJlZENvbXBvbmVudEltcG9ydCA9IHNoYXJlZE5hbWVkSW1wb3J0cy5sZW5ndGhcbiAgICA/IGBpbXBvcnQgeyAke3NoYXJlZE5hbWVkSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJy4uLy4uL3NoYXJlZCc7XFxuYFxuICAgIDogJyc7XG4gIGNvbnN0IG5lZWRzRGF0YVN0b3JlID0gaGFzRHluYW1pY0FycmF5cyB8fCBoYXNUYXhvbm9teUFycmF5O1xuICBpZiAobmVlZHNEYXRhU3RvcmUpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCB7IHVzZVNlbGVjdCR7aGFzQnJlYWRjcnVtYnNBcnJheSA/ICcsIHNlbGVjdCcgOiAnJ30gfSBmcm9tICdAd29yZHByZXNzL2RhdGEnO1xcbmltcG9ydCB7IHN0b3JlIGFzIGNvcmVEYXRhU3RvcmUgfSBmcm9tICdAd29yZHByZXNzL2NvcmUtZGF0YSc7XFxuYDtcbiAgfVxuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IGFwaUZldGNoIGZyb20gJ0B3b3JkcHJlc3MvYXBpLWZldGNoJztcXG5gO1xuICB9XG5cbiAgLy8gQnVpbGQgZWxlbWVudCBpbXBvcnRzXG4gIGNvbnN0IGVsZW1lbnRJbXBvcnRzID0gWydGcmFnbWVudCddO1xuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkge1xuICAgIGVsZW1lbnRJbXBvcnRzLnB1c2goJ3VzZVN0YXRlJywgJ3VzZUVmZmVjdCcpO1xuICB9XG4gIGlmIChpbnRlcmFjdGl2ZUNhbnZhcykge1xuICAgIGZvciAoY29uc3QgZWwgb2YgaW50ZXJhY3RpdmVDYW52YXMuZWxlbWVudEltcG9ydHMpIHtcbiAgICAgIGlmICghZWxlbWVudEltcG9ydHMuaW5jbHVkZXMoZWwpKSBlbGVtZW50SW1wb3J0cy5wdXNoKGVsKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpbnRlcmFjdGl2ZUltcG9ydCA9XG4gICAgaW50ZXJhY3RpdmVDYW52YXM/LmltcG9ydExpbmVzID8gYCR7aW50ZXJhY3RpdmVDYW52YXMuaW1wb3J0TGluZXN9XFxuYCA6ICcnO1xuICBjb25zdCBpbnRlcmFjdGl2ZUhvb2sgPSBpbnRlcmFjdGl2ZUNhbnZhcz8uaG9va0xpbmVzXG4gICAgPyBgJHtpbnRlcmFjdGl2ZUNhbnZhcy5ob29rTGluZXN9XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gSW1wb3J0IHNoYXJlZCBIYW5kb2ZmTGlua0ZpZWxkIHdoZW4gcHJldmlldyB1c2VzIGxpbmsvYnV0dG9uIGlubGluZSBlZGl0aW5nXG4gIGNvbnN0IGxpbmtGaWVsZEltcG9ydCA9IHByZXZpZXdVc2VzTGlua0ZpZWxkID8gYGltcG9ydCB7IEhhbmRvZmZMaW5rRmllbGQgfSBmcm9tICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9MaW5rRmllbGQnO1xcbmAgOiAnJztcblxuICAvLyBTY3JlZW5zaG90IGltcG9ydCBmb3IgaW5zZXJ0ZXIgcHJldmlld1xuICBjb25zdCBzY3JlZW5zaG90SW1wb3J0ID0gaGFzU2NyZWVuc2hvdCA/IGBpbXBvcnQgc2NyZWVuc2hvdFVybCBmcm9tICcuL3NjcmVlbnNob3QucG5nJztcXG5gIDogJyc7XG5cbiAgLy8gU1ZHIGljb24gZm9yIHRoZSBibG9jayAodW5pcXVlIHBlciBibG9jaywgY29sb3JlZCBieSBncm91cClcbiAgY29uc3Qgc3ZnSWNvblN0ciA9IGdlbmVyYXRlU3ZnSWNvbihjb21wb25lbnQudGl0bGUsIGNvbXBvbmVudC5ncm91cCk7XG4gIGNvbnN0IHN2Z0ljb25Db2RlID0gYGNvbnN0IGJsb2NrSWNvbiA9IChcbiAgJHtzdmdJY29uU3RyfVxuKTtgO1xuXG4gIC8vIEluc2VydGVyIHByZXZpZXc6IHNob3cgc2NyZWVuc2hvdCBpbWFnZSBpbnN0ZWFkIG9mIGxpdmUtcmVuZGVyaW5nXG4gIGNvbnN0IHByZXZpZXdFYXJseVJldHVybiA9IGhhc1NjcmVlbnNob3RcbiAgICA/IGAgICAgaWYgKGF0dHJpYnV0ZXMuX19wcmV2aWV3KSB7XG4gICAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiAgICAgICAgICA8aW1nIHNyYz17c2NyZWVuc2hvdFVybH0gYWx0PXttZXRhZGF0YS50aXRsZX0gc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX0gLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICApO1xuICAgIH1cbmBcbiAgICA6ICcnO1xuXG4gIHJldHVybiBgaW1wb3J0IHsgcmVnaXN0ZXJCbG9ja1R5cGUgfSBmcm9tICdAd29yZHByZXNzL2Jsb2Nrcyc7XG5pbXBvcnQgeyBcbiAgJHtibG9ja0VkaXRvckltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2Jsb2NrLWVkaXRvcic7XG5pbXBvcnQgeyBcbiAgJHtjb21wb25lbnRJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9jb21wb25lbnRzJztcbmltcG9ydCB7IF9fIH0gZnJvbSAnQHdvcmRwcmVzcy9pMThuJztcbmltcG9ydCB7ICR7ZWxlbWVudEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICdAd29yZHByZXNzL2VsZW1lbnQnO1xuJHt0ZW5VcEltcG9ydH0ke3NoYXJlZENvbXBvbmVudEltcG9ydH1pbXBvcnQgbWV0YWRhdGEgZnJvbSAnLi9ibG9jay5qc29uJztcbmltcG9ydCAnLi9lZGl0b3Iuc2Nzcyc7XG4ke2hhc0R5bmFtaWNBcnJheXMgPyBcImltcG9ydCAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvRHluYW1pY1Bvc3RTZWxlY3Rvci5lZGl0b3Iuc2Nzcyc7XFxuXCIgOiAnJ31pbXBvcnQgJy4vc3R5bGUuc2Nzcyc7XG4ke3NjcmVlbnNob3RJbXBvcnR9JHtpbnRlcmFjdGl2ZUltcG9ydH0ke2xpbmtGaWVsZEltcG9ydH1cbiR7c3ZnSWNvbkNvZGV9XG5cbiR7ZGVwcmVjYXRpb25zQ29kZSA/IGAke2RlcHJlY2F0aW9uc0NvZGV9XFxuXFxuYCA6ICcnfXJlZ2lzdGVyQmxvY2tUeXBlKG1ldGFkYXRhLm5hbWUsIHtcbiAgLi4ubWV0YWRhdGEsXG4gIGljb246IGJsb2NrSWNvbiwke2RlcHJlY2F0aW9uc0NvZGUgPyAnXFxuICBkZXByZWNhdGVkLCcgOiAnJ31cbiAgZWRpdDogKHsgYXR0cmlidXRlcywgc2V0QXR0cmlidXRlcywgaXNTZWxlY3RlZCB9KSA9PiB7XG4gICAgY29uc3QgYmxvY2tQcm9wcyA9IHVzZUJsb2NrUHJvcHMoKTtcbiR7cHJldmlld0Vhcmx5UmV0dXJufSR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/IFwiICAgIGNvbnN0IENPTlRFTlRfQkxPQ0tTID0gWydjb3JlL3BhcmFncmFwaCcsJ2NvcmUvaGVhZGluZycsJ2NvcmUvbGlzdCcsJ2NvcmUvbGlzdC1pdGVtJywnY29yZS9xdW90ZScsJ2NvcmUvaW1hZ2UnLCdjb3JlL3NlcGFyYXRvcicsJ2NvcmUvaHRtbCcsJ2NvcmUvYnV0dG9ucycsJ2NvcmUvYnV0dG9uJ107XCIgOiAnJ31cbiAgICBjb25zdCB7ICR7YXR0ck5hbWVzLmpvaW4oJywgJyl9IH0gPSBhdHRyaWJ1dGVzO1xuJHtkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZX1cbiR7YXJyYXlIZWxwZXJzfVxuJHtpbnRlcmFjdGl2ZUhvb2t9ICAgIHJldHVybiAoXG4gICAgICA8RnJhZ21lbnQ+XG4gICAgICAgIDxJbnNwZWN0b3JDb250cm9scz5cbiR7cGFuZWxzLmpvaW4oJ1xcblxcbicpfVxuICAgICAgICA8L0luc3BlY3RvckNvbnRyb2xzPlxuJHtibG9ja0NvbnRyb2xzSnN4fVxuXG4gICAgICAgIHsvKiBFZGl0b3IgUHJldmlldyAqL31cbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4ke3ByZXZpZXdDb250ZW50fVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvRnJhZ21lbnQ+XG4gICAgKTtcbiAgfSxcbiAgc2F2ZTogKCkgPT4ge1xuJHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gJyAgICAvLyBJbm5lckJsb2NrcyBjb250ZW50IG11c3QgYmUgc2F2ZWQgc28gaXQgaXMgcGVyc2lzdGVkIGluIHBvc3QgY29udGVudFxcbiAgICByZXR1cm4gPElubmVyQmxvY2tzLkNvbnRlbnQgLz47JyA6ICcgICAgLy8gU2VydmVyLXNpZGUgcmVuZGVyaW5nIHZpYSByZW5kZXIucGhwXFxuICAgIHJldHVybiBudWxsOyd9XG4gIH0sXG59KTtcbmA7XG59O1xuXG5leHBvcnQge1xuICBnZW5lcmF0ZUluZGV4SnMsXG4gIGdlbmVyYXRlU3ZnSWNvbixcbiAgdG9UaXRsZUNhc2UsXG4gIGdlbmVyYXRlRmllbGRDb250cm9sLFxuICBnZW5lcmF0ZUFycmF5Q29udHJvbCxcbiAgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wsXG4gIGlzT3BhY2l0eVJhbmdlRmllbGQsXG4gIGdldE51bWJlckNvbnRyb2xTcGVjLFxuICBoYXNPcGFjaXR5UmFuZ2VGaWVsZCxcbiAgaGFzTm9uT3BhY2l0eU51bWJlckZpZWxkLFxufTtcbmV4cG9ydCB0eXBlIHsgRmllbGRDb250ZXh0LCBOdW1iZXJDb250cm9sU3BlYyB9O1xuIl19