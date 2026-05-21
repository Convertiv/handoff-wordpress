"use strict";
/**
 * Generates index.js for Gutenberg block editor
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasNonOpacityNumberField = exports.hasOpacityRangeField = exports.getNumberControlSpec = exports.isOpacityRangeField = exports.generatePropertyControl = exports.generateArrayControl = exports.generateFieldControl = exports.toTitleCase = exports.generateSvgIcon = exports.generateIndexJs = void 0;
const types_1 = require("../types");
const button_schema_1 = require("./button-schema");
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
        case 'button': {
            const buttonKeys = (0, button_schema_1.resolveButtonFieldKeys)(property);
            const buttonUrlFallback = buttonKeys.urlKey === 'href' ? '#' : '';
            const buttonHandler = onChangeHandler((0, button_schema_1.buttonLinkMergeJs)(valueAccessor, buttonKeys));
            return `${indent}<div className="components-base-control">
${indent}  <label className="components-base-control__label">{__('${label}', 'handoff')}</label>
${indent}  <TextControl
${indent}    label={__('Button Label', 'handoff')}
${indent}    hideLabelFromVision={true}
${indent}    value={${valueAccessor}?.${buttonKeys.labelKey} || ''}
${indent}    onChange={(value) => ${onChangeHandler(`{ ...${valueAccessor}, ${buttonKeys.labelKey}: value }`)}}
${indent}  />
${indent}  <div style={{ marginTop: '8px' }}>
${indent}    <LinkControl
${indent}      value={{ 
${indent}        url: ${valueAccessor}?.${buttonKeys.urlKey} || '${buttonUrlFallback}', 
${indent}        title: ${valueAccessor}?.${buttonKeys.labelKey} || '',
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
        }
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
const buildArrayItemDefaultLiteral = (property) => {
    const itemProps = property.items?.properties;
    if (!itemProps) {
        return '{}';
    }
    const defaults = {};
    for (const [fieldKey, fieldProp] of Object.entries(itemProps)) {
        defaults[fieldKey] = getDefaultValue(fieldProp);
    }
    return JSON.stringify(defaults);
};
const generateArrayControl = (key, property, attrName, label, indent) => {
    const itemProps = property.items?.properties || {};
    const itemDefaultLiteral = buildArrayItemDefaultLiteral(property);
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
${indent}  defaultValue={${itemDefaultLiteral}}
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
            return (0, button_schema_1.getButtonDefault)(fieldProp);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6TyxtREFBOEY7QUFDOUYsNkNBQTJDO0FBQzNDLDJEQUFzRTtBQUN0RSw2REFHOEI7QUFDOUIscURBQXdHO0FBQ3hHLDZDQUE4QztBQUU5Qzs7R0FFRztBQUNILE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7SUFDMUMsT0FBTyxHQUFHO1NBQ1AsS0FBSyxDQUFDLEdBQUcsQ0FBQztTQUNWLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN6RCxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDZixDQUFDLENBQUM7QUEyL0NBLGtDQUFXO0FBdCtDYixNQUFNLGtCQUFrQixHQUFHLENBQUMsUUFBZ0IsRUFBRSxRQUF5QixFQUFVLEVBQUUsQ0FDakYsR0FBRyxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksSUFBSSxFQUFFLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUVuRiw2REFBNkQ7QUFDN0QsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLFFBQWdCLEVBQUUsUUFBeUIsRUFBVyxFQUFFO0lBQ25GLE1BQU0sR0FBRyxHQUFHLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNuRCxPQUFPLHNDQUFzQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxRCxDQUFDLENBQUM7QUFtK0NBLGtEQUFtQjtBQWorQ3JCLG9FQUFvRTtBQUNwRSxNQUFNLG9CQUFvQixHQUFHLENBQUMs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LENBQUMsQ0FBQyxnTEFBZ0wsQ0FBQyxDQUFDLENBQUMsRUFBRTtjQUN6TyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztFQUNoQywwQkFBMEI7RUFDMUIsWUFBWTtFQUNaLGVBQWU7OztFQUdmLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDOztFQUVuQixnQkFBZ0I7Ozs7RUFJaEIsY0FBYzs7Ozs7O0VBTWQsY0FBYyxJQUFJLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxrSEFBa0gsQ0FBQyxDQUFDLENBQUMsK0RBQStEOzs7Q0FHaE8sQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdBLDBDQUFlIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBHZW5lcmF0ZXMgaW5kZXguanMgZm9yIEd1dGVuYmVyZyBibG9jayBlZGl0b3JcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHksIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZywgaXNCcmVhZGNydW1ic0NvbmZpZywgaXNUYXhvbm9teUNvbmZpZywgaXNQYWdpbmF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZ2V0QnV0dG9uRGVmYXVsdCwgcmVzb2x2ZUJ1dHRvbkZpZWxkS2V5cywgYnV0dG9uTGlua01lcmdlSnMgfSBmcm9tICcuL2J1dHRvbi1zY2hlbWEnO1xuaW1wb3J0IHsgdG9CbG9ja05hbWUgfSBmcm9tICcuL2Jsb2NrLWpzb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVKc3hQcmV2aWV3LCB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVJbnRlcmFjdGl2ZUNhbnZhc0NvZGUsXG4gIGluamVjdENhbnZhc1JlZkludG9QcmV2aWV3SnN4LFxufSBmcm9tICcuL2ludGVyYWN0aXZlLWNhbnZhcyc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBUaXRsZSBDYXNlXG4gKi9cbmNvbnN0IHRvVGl0bGVDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0clxuICAgIC5zcGxpdCgnXycpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKVxuICAgIC5qb2luKCcgJyk7XG59O1xuXG4vKipcbiAqIENvbnRleHQgZm9yIGdlbmVyYXRpbmcgZmllbGQgY29udHJvbHMgLSBkZXRlcm1pbmVzIGhvdyB2YWx1ZXMgYXJlIGFjY2Vzc2VkIGFuZCB1cGRhdGVkXG4gKi9cbmludGVyZmFjZSBGaWVsZENvbnRleHQge1xuICAvKiogVGhlIHZhcmlhYmxlIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgdmFsdWUgKGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdpdGVtLmltYWdlJykgKi9cbiAgdmFsdWVBY2Nlc3Nvcjogc3RyaW5nO1xuICAvKiogVGhlIG9uQ2hhbmdlIGhhbmRsZXIgY29kZSAoZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyB4OiB2YWx1ZSB9KScgb3IgJ3VwZGF0ZUl0ZW1zKGluZGV4LCBcInhcIiwgdmFsdWUpJykgKi9cbiAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogQmFzZSBpbmRlbnRhdGlvbiAqL1xuICBpbmRlbnQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE51bWJlckNvbnRyb2xTcGVjIHtcbiAgdXNlUmFuZ2U6IGJvb2xlYW47XG4gIG1pbj86IG51bWJlcjtcbiAgbWF4PzogbnVtYmVyO1xuICBzdGVwPzogbnVtYmVyO1xufVxuXG5jb25zdCBmaWVsZExhYmVsSGF5c3RhY2sgPSAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IHN0cmluZyA9PlxuICBgJHtmaWVsZEtleX0gJHtwcm9wZXJ0eS5uYW1lID8/ICcnfSAke3Byb3BlcnR5LmRlc2NyaXB0aW9uID8/ICcnfWAudG9Mb3dlckNhc2UoKTtcblxuLyoqIE9wYWNpdHkgLyBvdmVybGF5IGFscGhhIGZpZWxkcyB1c2UgYSAw4oCTMSByYW5nZSBzbGlkZXIuICovXG5jb25zdCBpc09wYWNpdHlSYW5nZUZpZWxkID0gKGZpZWxkS2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgY29uc3QgaGF5ID0gZmllbGRMYWJlbEhheXN0YWNrKGZpZWxkS2V5LCBwcm9wZXJ0eSk7XG4gIHJldHVybiAvb3BhY2l0eXxvdmVybGF5XFxzKm9wYWNpdHl8XFxiYWxwaGFcXGIvaS50ZXN0KGhheSk7XG59O1xuXG4vKiogUmVzb2x2ZSBlZGl0b3IgY29udHJvbCB0eXBlIGFuZCBib3VuZHMgZm9yIGEgbnVtYmVyIHByb3BlcnR5LiAqL1xuY29uc3QgZ2V0TnVtYmVyQ29udHJvbFNwZWMgPSAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IE51bWJlckNvbnRyb2xTcGVjID0+IHtcbiAgaWYgKGlzT3BhY2l0eVJhbmdlRmllbGQoZmllbGRLZXksIHByb3BlcnR5KSkge1xuICAgIHJldHVybiB7IHVzZVJhbmdlOiB0cnVlLCBtaW46IDAsIG1heDogMSwgc3RlcDogMC4wMSB9O1xuICB9XG5cbiAgY29uc3QgaGF5ID0gZmllbGRMYWJlbEhheXN0YWNrKGZpZWxkS2V5LCBwcm9wZXJ0eSk7XG4gIGNvbnN0IGtleUhheSA9IGAke2ZpZWxkS2V5fSAke3Byb3BlcnR5Lm5hbWUgPz8gJyd9YC50b0xvd2VyQ2FzZSgpO1xuXG4gIGlmICgvXFxibGF0KGl0dWRlKT9cXGIvaS50ZXN0KGtleUhheSkgfHwgL1xcYmxhdChpdHVkZSk/XFxiL2kudGVzdChoYXkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IGZhbHNlLCBtaW46IC05MCwgbWF4OiA5MCwgc3RlcDogMC4wMDAwMDEgfTtcbiAgfVxuICBpZiAoL1xcYmxuZ1xcYnxcXGJsb24oZ2l0dWRlKT9cXGIvaS50ZXN0KGtleUhheSkgfHwgL1xcYmxuZ1xcYnxcXGJsb24oZ2l0dWRlKT9cXGIvaS50ZXN0KGhheSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIG1pbjogLTE4MCwgbWF4OiAxODAsIHN0ZXA6IDAuMDAwMDAxIH07XG4gIH1cbiAgaWYgKC9cXGJ6b29tXFxiL2kudGVzdChrZXlIYXkpIHx8IC9cXGJ6b29tXFxiL2kudGVzdChoYXkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IGZhbHNlLCBtaW46IDEsIG1heDogMjEsIHN0ZXA6IDEgfTtcbiAgfVxuXG4gIGNvbnN0IGRlZmF1bHRJc0ludGVnZXIgPVxuICAgIHR5cGVvZiBwcm9wZXJ0eS5kZWZhdWx0ID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNJbnRlZ2VyKHByb3BlcnR5LmRlZmF1bHQpO1xuICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIHN0ZXA6IGRlZmF1bHRJc0ludGVnZXIgPyAxIDogdW5kZWZpbmVkIH07XG59O1xuXG5jb25zdCB3YWxrTnVtYmVyRmllbGRzID0gKFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBwcmVkaWNhdGU6IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KSA9PiBib29sZWFuXG4pOiBib29sZWFuID0+IHtcbiAgY29uc3QgY2hlY2sgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5LCBmaWVsZEtleTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ251bWJlcicgJiYgcHJlZGljYXRlKGZpZWxkS2V5LCBwcm9wKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHByb3AucHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PiBjaGVjayhwLCBrKSk7XG4gICAgfVxuICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHByb3AuaXRlbXMucHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PiBjaGVjayhwLCBrKSk7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbiAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT4gY2hlY2socCwgaykpO1xufTtcblxuY29uc3QgaGFzT3BhY2l0eVJhbmdlRmllbGQgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IGJvb2xlYW4gPT5cbiAgd2Fsa051bWJlckZpZWxkcyhwcm9wZXJ0aWVzLCBpc09wYWNpdHlSYW5nZUZpZWxkKTtcblxuY29uc3QgaGFzTm9uT3BhY2l0eU51bWJlckZpZWxkID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBib29sZWFuID0+XG4gIHdhbGtOdW1iZXJGaWVsZHMocHJvcGVydGllcywgKGZpZWxkS2V5LCBwcm9wZXJ0eSkgPT4gIWlzT3BhY2l0eVJhbmdlRmllbGQoZmllbGRLZXksIHByb3BlcnR5KSk7XG5cbi8qKlxuICogR2VuZXJhdGUgYSBmaWVsZCBjb250cm9sIGZvciBhbnkgcHJvcGVydHkgdHlwZSAtIHVuaWZpZWQgZnVuY3Rpb24gZm9yIGJvdGggdG9wLWxldmVsIGFuZCBuZXN0ZWQgZmllbGRzXG4gKi9cbmNvbnN0IGdlbmVyYXRlRmllbGRDb250cm9sID0gKFxuICBmaWVsZEtleTogc3RyaW5nLFxuICBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LFxuICBjb250ZXh0OiBGaWVsZENvbnRleHRcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHsgdmFsdWVBY2Nlc3Nvciwgb25DaGFuZ2VIYW5kbGVyLCBpbmRlbnQgfSA9IGNvbnRleHQ7XG4gIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShmaWVsZEtleSk7XG5cbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6IHtcbiAgICAgIGNvbnN0IGlzV2lzdGlhVGV4dEZpZWxkID0gL1xcYndpc3RpYVxcYi9pLnRlc3QoYCR7ZmllbGRLZXl9ICR7bGFiZWx9ICR7cHJvcGVydHkuZGVzY3JpcHRpb24gPz8gJyd9YCk7XG5cbiAgICAgIGlmIChpc1dpc3RpYVRleHRGaWVsZCkge1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgeygoKSA9PiB7XG4ke2luZGVudH0gICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZygke3ZhbHVlQWNjZXNzb3J9IHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICBpZiAoIXdpc3RpYUlkKSB7XG4ke2luZGVudH0gICAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxNnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlcjogJzFweCBkYXNoZWQgI2NiZDVlMScsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnIzQ3NTU2OScsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2Y4ZmFmYycsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIHtfXygnQWRkIGEgV2lzdGlhIHZpZGVvIElEIHRvIHByZXZpZXcgdGhpcyB2aWRlby4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICk7XG4ke2luZGVudH0gICAgfVxuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiR7aW5kZW50fSAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXG4ke2luZGVudH0gICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgYmFja2dyb3VuZDogJyMwZjE3MmEnLFxuJHtpbmRlbnR9ICAgICAgICAgIGFzcGVjdFJhdGlvOiAnMTYgLyA5JyxcbiR7aW5kZW50fSAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAgPGltZ1xuJHtpbmRlbnR9ICAgICAgICAgIHNyYz17XFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0vc3dhdGNoXFxgfVxuJHtpbmRlbnR9ICAgICAgICAgIGFsdD17X18oJ1dpc3RpYSB2aWRlbyBwcmV2aWV3JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInLCBkaXNwbGF5OiAnYmxvY2snIH19XG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4ke2luZGVudH0gICAgICAgICAgICBpbnNldDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGFsaWduSXRlbXM6ICdmbGV4LWVuZCcsXG4ke2luZGVudH0gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZ2FwOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnbGluZWFyLWdyYWRpZW50KDE4MGRlZywgcmdiYSgxNSwgMjMsIDQyLCAwLjEyKSAwJSwgcmdiYSgxNSwgMjMsIDQyLCAwLjcpIDEwMCUpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBhcmlhLWhpZGRlbj1cInRydWVcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgd2lkdGg6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgaGVpZ2h0OiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI0KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tkcm9wRmlsdGVyOiAnYmx1cigxMHB4KScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgICAgd2lkdGg6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgaGVpZ2h0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIG1hcmdpbkxlZnQ6ICc0cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlclRvcDogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJMZWZ0OiAnMTRweCBzb2xpZCAjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWluSGVpZ2h0OiAnMzJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIHBhZGRpbmc6ICc2cHggMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC41OCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250U2l6ZTogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250V2VpZ2h0OiA2MDAsXG4ke2luZGVudH0gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6ICcwLjAyZW0nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7d2lzdGlhSWR9XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICk7XG4ke2luZGVudH0gIH0pKCl9XG4ke2luZGVudH08L0ZsZXg+YDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGAke2luZGVudH08VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG4gICAgfVxuXG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgICAgLy8gSW5zaWRlIGFuIGFycmF5IGl0ZW0sIElubmVyQmxvY2tzIGNhbid0IGJlIHVzZWQg4oCUIHByb3ZpZGUgYSB0ZXh0YXJlYVxuICAgICAgaWYgKHZhbHVlQWNjZXNzb3Iuc3RhcnRzV2l0aCgnaXRlbS4nKSkge1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0YXJlYUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIHJvd3M9ezR9XG4ke2luZGVudH0vPmA7XG4gICAgICB9XG4gICAgICAvLyBUb3AtbGV2ZWwgcmljaHRleHQgdXNlcyBJbm5lckJsb2NrcyBvbiB0aGUgY2FudmFzIOKAkyBubyBzaWRlYmFyIGNvbnRyb2wgbmVlZGVkXG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBjYXNlICdudW1iZXInOiB7XG4gICAgICBjb25zdCBzcGVjID0gZ2V0TnVtYmVyQ29udHJvbFNwZWMoZmllbGRLZXksIHByb3BlcnR5KTtcbiAgICAgIGlmIChzcGVjLnVzZVJhbmdlKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PFJhbmdlQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gPz8gMH1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICBtaW49eyR7c3BlYy5taW4gPz8gMH19XG4ke2luZGVudH0gIG1heD17JHtzcGVjLm1heCA/PyAxfX1cbiR7aW5kZW50fSAgc3RlcD17JHtzcGVjLnN0ZXAgPz8gMC4wMX19XG4ke2luZGVudH0vPmA7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGJvdW5kTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3BlYy5taW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBib3VuZExpbmVzLnB1c2goYCR7aW5kZW50fSAgbWluPXske3NwZWMubWlufX1gKTtcbiAgICAgIH1cbiAgICAgIGlmIChzcGVjLm1heCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJvdW5kTGluZXMucHVzaChgJHtpbmRlbnR9ICBtYXg9eyR7c3BlYy5tYXh9fWApO1xuICAgICAgfVxuICAgICAgaWYgKHNwZWMuc3RlcCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJvdW5kTGluZXMucHVzaChgJHtpbmRlbnR9ICBzdGVwPXske3NwZWMuc3RlcH19YCk7XG4gICAgICB9XG4gICAgICBjb25zdCBib3VuZHMgPSBib3VuZExpbmVzLmxlbmd0aCA/IGBcXG4ke2JvdW5kTGluZXMuam9pbignXFxuJyl9YCA6ICcnO1xuICAgICAgY29uc3QgcGFyc2VFeHByID1cbiAgICAgICAgc3BlYy5zdGVwICE9PSB1bmRlZmluZWQgJiYgc3BlYy5zdGVwID49IDEgJiYgTnVtYmVyLmlzSW50ZWdlcihzcGVjLnN0ZXApXG4gICAgICAgICAgPyBcInZhbHVlID09PSAnJyA/IDAgOiBwYXJzZUludCh2YWx1ZSwgMTApIHx8IDBcIlxuICAgICAgICAgIDogXCJ2YWx1ZSA9PT0gJycgPyAwIDogcGFyc2VGbG9hdCh2YWx1ZSkgfHwgMFwiO1xuXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdHlwZT1cIm51bWJlclwiXG4ke2luZGVudH0gIHZhbHVlPXt0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ251bWJlcicgPyBTdHJpbmcoJHt2YWx1ZUFjY2Vzc29yfSkgOiAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIocGFyc2VFeHByKX19XG4ke2JvdW5kc31cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfT8uc3JjfSBcbiR7aW5kZW50fSAgICAgICAgICAgIGFsdD17JHt2YWx1ZUFjY2Vzc29yfT8uYWx0IHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3sgbWF4V2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uIG9uQ2xpY2s9e29wZW59IHZhcmlhbnQ9XCJzZWNvbmRhcnlcIiBzaXplPVwic21hbGxcIj5cbiR7aW5kZW50fSAgICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjID8gX18oJ1JlcGxhY2UgJHtsYWJlbH0nLCAnaGFuZG9mZicpIDogX18oJ1NlbGVjdCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjICYmIChcbiR7aW5kZW50fSAgICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiAke29uQ2hhbmdlSGFuZGxlcigneyBzcmM6IFxcJ1xcJywgYWx0OiBcXCdcXCcgfScpfX1cbiR7aW5kZW50fSAgICAgICAgICAgIHZhcmlhbnQ9XCJsaW5rXCJcbiR7aW5kZW50fSAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge19fKCdSZW1vdmUnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICl9XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH08L01lZGlhVXBsb2FkQ2hlY2s+YDtcblxuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9e3R5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJyA/ICR7dmFsdWVBY2Nlc3Nvcn0gOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiB7XG4ke2luZGVudH0gICAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH0gICAgICAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4oJHt2YWx1ZUFjY2Vzc29yfSAmJiB0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ29iamVjdCcgPyAke3ZhbHVlQWNjZXNzb3J9IDoge30pLCBpZDogd2lzdGlhSWQsIHNyYzogd2lzdGlhSWQgPyBcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS5qc29ucFxcYCA6IG5vcm1hbGl6ZWQgfWApfVxuJHtpbmRlbnR9ICAgIH19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIHsoKCkgPT4ge1xuJHtpbmRlbnR9ICAgIGNvbnN0IHJhd1ZhbHVlID1cbiR7aW5kZW50fSAgICAgIHR5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJ1xuJHtpbmRlbnR9ICAgICAgICA/ICR7dmFsdWVBY2Nlc3Nvcn1cbiR7aW5kZW50fSAgICAgICAgOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKTtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHJhd1ZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICBpZiAoIXdpc3RpYUlkKSB7XG4ke2luZGVudH0gICAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxNnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlcjogJzFweCBkYXNoZWQgI2NiZDVlMScsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnIzQ3NTU2OScsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2Y4ZmFmYycsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIHtfXygnQWRkIGEgV2lzdGlhIHZpZGVvIElEIHRvIHByZXZpZXcgdGhpcyB2aWRlby4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICk7XG4ke2luZGVudH0gICAgfVxuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiR7aW5kZW50fSAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXG4ke2luZGVudH0gICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgYmFja2dyb3VuZDogJyMwZjE3MmEnLFxuJHtpbmRlbnR9ICAgICAgICAgIGFzcGVjdFJhdGlvOiAnMTYgLyA5JyxcbiR7aW5kZW50fSAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAgPGltZ1xuJHtpbmRlbnR9ICAgICAgICAgIHNyYz17XFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0vc3dhdGNoXFxgfVxuJHtpbmRlbnR9ICAgICAgICAgIGFsdD17X18oJ1dpc3RpYSB2aWRlbyBwcmV2aWV3JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInLCBkaXNwbGF5OiAnYmxvY2snIH19XG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4ke2luZGVudH0gICAgICAgICAgICBpbnNldDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGFsaWduSXRlbXM6ICdmbGV4LWVuZCcsXG4ke2luZGVudH0gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZ2FwOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnbGluZWFyLWdyYWRpZW50KDE4MGRlZywgcmdiYSgxNSwgMjMsIDQyLCAwLjEyKSAwJSwgcmdiYSgxNSwgMjMsIDQyLCAwLjcpIDEwMCUpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBhcmlhLWhpZGRlbj1cInRydWVcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgd2lkdGg6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgaGVpZ2h0OiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI0KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tkcm9wRmlsdGVyOiAnYmx1cigxMHB4KScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgICAgd2lkdGg6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgaGVpZ2h0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIG1hcmdpbkxlZnQ6ICc0cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlclRvcDogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJMZWZ0OiAnMTRweCBzb2xpZCAjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWluSGVpZ2h0OiAnMzJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIHBhZGRpbmc6ICc2cHggMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC41OCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250U2l6ZTogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250V2VpZ2h0OiA2MDAsXG4ke2luZGVudH0gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6ICcwLjAyZW0nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7d2lzdGlhSWR9XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICk7XG4ke2luZGVudH0gIH0pKCl9XG4ke2luZGVudH08L0ZsZXg+YDtcblxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgLy8gRm9yIGxpbmtzLCB1c2UgTGlua0NvbnRyb2wgd2hpY2ggcHJvdmlkZXMgaW50ZXJuYWwgcGFnZSBzZWFyY2ggYW5kIFVSTCB2YWxpZGF0aW9uXG4gICAgICBjb25zdCBsaW5rSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIHVybDogdmFsdWUudXJsIHx8ICcnLCBcbiAgICAgICAgbGFiZWw6IHZhbHVlLnRpdGxlIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuICAgICAgICBvcGVuc0luTmV3VGFiOiB2YWx1ZS5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4gICAgICB9YCk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnTGluayBUZXh0JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBoaWRlTGFiZWxGcm9tVmlzaW9uPXt0cnVlfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBsYWJlbDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8udXJsIHx8ICcnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtsaW5rSGFuZGxlcn19XG4ke2luZGVudH0gICAgICBzZXR0aW5ncz17W1xuJHtpbmRlbnR9ICAgICAgICB7IGlkOiAnb3BlbnNJbk5ld1RhYicsIHRpdGxlOiBfXygnT3BlbiBpbiBuZXcgdGFiJywgJ2hhbmRvZmYnKSB9XG4ke2luZGVudH0gICAgICBdfVxuJHtpbmRlbnR9ICAgICAgc2hvd1N1Z2dlc3Rpb25zPXt0cnVlfVxuJHtpbmRlbnR9ICAgICAgc3VnZ2VzdGlvbnNRdWVyeT17eyB0eXBlOiAncG9zdCcsIHN1YnR5cGU6ICdhbnknIH19XG4ke2luZGVudH0gICAgLz5cbiR7aW5kZW50fSAgPC9kaXY+XG4ke2luZGVudH08L2Rpdj5gO1xuXG4gICAgY2FzZSAnYnV0dG9uJzoge1xuICAgICAgY29uc3QgYnV0dG9uS2V5cyA9IHJlc29sdmVCdXR0b25GaWVsZEtleXMocHJvcGVydHkpO1xuICAgICAgY29uc3QgYnV0dG9uVXJsRmFsbGJhY2sgPSBidXR0b25LZXlzLnVybEtleSA9PT0gJ2hyZWYnID8gJyMnIDogJyc7XG4gICAgICBjb25zdCBidXR0b25IYW5kbGVyID0gb25DaGFuZ2VIYW5kbGVyKGJ1dHRvbkxpbmtNZXJnZUpzKHZhbHVlQWNjZXNzb3IsIGJ1dHRvbktleXMpKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdCdXR0b24gTGFiZWwnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGhpZGVMYWJlbEZyb21WaXNpb249e3RydWV9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LiR7YnV0dG9uS2V5cy5sYWJlbEtleX0gfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgJHtidXR0b25LZXlzLmxhYmVsS2V5fTogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8uJHtidXR0b25LZXlzLnVybEtleX0gfHwgJyR7YnV0dG9uVXJsRmFsbGJhY2t9JywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py4ke2J1dHRvbktleXMubGFiZWxLZXl9IHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py50YXJnZXQgPT09ICdfYmxhbmsnXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtidXR0b25IYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fSAgPFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0Rpc2FibGVkJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9Py5kaXNhYmxlZCB8fCBmYWxzZX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBkaXNhYmxlZDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvZGl2PmA7XG4gICAgfVxuXG4gICAgY2FzZSAnc2VsZWN0Jzoge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMocHJvcGVydHkub3B0aW9ucykubWFwKG9wdCA9PlxuICAgICAgICBgeyBsYWJlbDogJyR7b3B0LmxhYmVsLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCB2YWx1ZTogJyR7b3B0LnZhbHVlfScgfWBcbiAgICAgICkuam9pbignLCAnKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFNlbGVjdENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvcHRpb25zPXtbJHtvcHRpb25zfV19XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdhcnJheSc6XG4gICAgICAvLyBIYW5kbGUgc2ltcGxlIHN0cmluZyBhcnJheXMgd2l0aCBhIHJlcGVhdGFibGUgbGlzdCBjb250cm9sXG4gICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgc2ltcGxlIHR5cGUgYXJyYXkgKHN0cmluZywgbnVtYmVyLCBldGMuKSB2cyBvYmplY3QgYXJyYXlcbiAgICAgIGNvbnN0IGl0ZW1UeXBlID0gcHJvcGVydHkuaXRlbXM/LnR5cGU7XG4gICAgICBpZiAoIXByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzICYmIChpdGVtVHlwZSA9PT0gJ3N0cmluZycgfHwgIWl0ZW1UeXBlKSkge1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIGxpc3QgY29udHJvbCBmb3Igc3RyaW5nIGFycmF5c1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2luZGVudH0gICAgeygke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5tYXAoKGxpc3RJdGVtLCBsaXN0SW5kZXgpID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGtleT17bGlzdEluZGV4fSBnYXA9ezJ9IGFsaWduPVwiY2VudGVyXCI+XG4ke2luZGVudH0gICAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSB9fT5cbiR7aW5kZW50fSAgICAgICAgICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICAgICAgICAgIHZhbHVlPXtsaXN0SXRlbSB8fCAnJ31cbiR7aW5kZW50fSAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBuZXdMaXN0W2xpc3RJbmRleF0gPSB2YWx1ZTtcbiR7aW5kZW50fSAgICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciBpdGVtLi4uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy11cC1hbHQyXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ01vdmUgdXAnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPT09IDApIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pXTtcbiR7aW5kZW50fSAgICAgICAgICAgIFtuZXdMaXN0W2xpc3RJbmRleF0sIG5ld0xpc3RbbGlzdEluZGV4IC0gMV1dID0gW25ld0xpc3RbbGlzdEluZGV4IC0gMV0sIG5ld0xpc3RbbGlzdEluZGV4XV07XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGRpc2FibGVkPXtsaXN0SW5kZXggPT09IDB9XG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy1kb3duLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSBkb3duJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBsaXN0ID0gJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXTtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPj0gbGlzdC5sZW5ndGggLSAxKSByZXR1cm47XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLmxpc3RdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggKyAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggKyAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA+PSAoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkubGVuZ3RoIC0gMX1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cInRyYXNoXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ1JlbW92ZScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5maWx0ZXIoKF8sIGkpID0+IGkgIT09IGxpc3RJbmRleCk7XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICkpfVxuJHtpbmRlbnR9ICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSksICcnXTtcbiR7aW5kZW50fSAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgPlxuJHtpbmRlbnR9ICAgICAge19fKCdBZGQgSXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgPC9CdXR0b24+XG4ke2luZGVudH0gIDwvRmxleD5cbiR7aW5kZW50fTwvZGl2PmA7XG4gICAgICB9XG4gICAgICAvLyBGb3Igb2JqZWN0IGFycmF5cywgZmFsbCB0aHJvdWdoIHRvIGRlZmF1bHQgKHRoZXNlIHNob3VsZCBiZSBoYW5kbGVkIGJ5IGdlbmVyYXRlQXJyYXlDb250cm9sIGF0IHRvcCBsZXZlbClcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAocHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWRDb250cm9scyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnR5LnByb3BlcnRpZXMpXG4gICAgICAgICAgLm1hcCgoW25lc3RlZEtleSwgbmVzdGVkUHJvcF0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYCR7dmFsdWVBY2Nlc3Nvcn0/LiR7bmVzdGVkS2V5fWAsXG4gICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gb25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sICR7bmVzdGVkS2V5fTogJHt2YWx9IH1gKSxcbiAgICAgICAgICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKG5lc3RlZEtleSwgbmVzdGVkUHJvcCwgbmVzdGVkQ29udGV4dCk7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7bmVzdGVkQ29udHJvbHN9XG4ke2luZGVudH08L0ZsZXg+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhcnJheSAocmVwZWF0ZXIpIGNvbnRyb2wgdXNpbmcgMTB1cCBSZXBlYXRlciBjb21wb25lbnRcbiAqIFByb3ZpZGVzIGRyYWctYW5kLWRyb3AgcmVvcmRlcmluZyBhbmQgYnVpbHQtaW4gYWRkL3JlbW92ZSBmdW5jdGlvbmFsaXR5XG4gKi9cbmNvbnN0IGJ1aWxkQXJyYXlJdGVtRGVmYXVsdExpdGVyYWwgPSAocHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzO1xuICBpZiAoIWl0ZW1Qcm9wcykge1xuICAgIHJldHVybiAne30nO1xuICB9XG4gIGNvbnN0IGRlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgZmllbGRQcm9wXSBvZiBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpKSB7XG4gICAgZGVmYXVsdHNbZmllbGRLZXldID0gZ2V0RGVmYXVsdFZhbHVlKGZpZWxkUHJvcCk7XG4gIH1cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGRlZmF1bHRzKTtcbn07XG5cbmNvbnN0IGdlbmVyYXRlQXJyYXlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBhdHRyTmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICBjb25zdCBpdGVtRGVmYXVsdExpdGVyYWwgPSBidWlsZEFycmF5SXRlbURlZmF1bHRMaXRlcmFsKHByb3BlcnR5KTtcblxuICAvLyBHZW5lcmF0ZSBmaWVsZCBjb250cm9scyB0aGF0IHVzZSBzZXRJdGVtIGZyb20gdGhlIFJlcGVhdGVyIHJlbmRlciBwcm9wXG4gIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgY29uc3QgZmllbGRDb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICB2YWx1ZUFjY2Vzc29yOiBgaXRlbS4ke2ZpZWxkS2V5fWAsXG4gICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWx1ZSkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx1ZX0gfSlgLFxuICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAgICAgJ1xuICAgIH07XG4gICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGZpZWxkQ29udGV4dCk7XG4gIH0pLmpvaW4oJ1xcbicpO1xuXG4gIC8vIEdldCBhIGRpc3BsYXkgdGl0bGUgZnJvbSB0aGUgZmlyc3QgdGV4dCBmaWVsZCBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIGZpZWxkIGxhYmVsXG4gIGNvbnN0IGZpcnN0VGV4dEZpZWxkID0gT2JqZWN0LmVudHJpZXMoaXRlbVByb3BzKS5maW5kKChbLCBwcm9wXSkgPT4gcHJvcC50eXBlID09PSAndGV4dCcpO1xuICBjb25zdCB0aXRsZUFjY2Vzc29yID0gZmlyc3RUZXh0RmllbGQgPyBgaXRlbS4ke2ZpcnN0VGV4dEZpZWxkWzBdfSB8fCBgIDogJyc7XG4gIFxuICAvLyBDdXN0b20gYWRkIGJ1dHRvbiB3aXRoIHRlcnRpYXJ5IHN0eWxpbmcsIHBsdXMgaWNvbiwgcmlnaHQgYWxpZ25lZFxuICAvLyBhZGRCdXR0b24gaXMgYSBmdW5jdGlvbiB0aGF0IHJlY2VpdmVzIGFkZEl0ZW0gYW5kIHJldHVybnMgYSBSZWFjdCBlbGVtZW50XG4gIGNvbnN0IGFkZEJ1dHRvbkpzeCA9IGAoYWRkSXRlbSkgPT4gKFxuJHtpbmRlbnR9ICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItYWRkLWJ1dHRvbi13cmFwcGVyXCI+XG4ke2luZGVudH0gICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgIHZhcmlhbnQ9XCJ0ZXJ0aWFyeVwiXG4ke2luZGVudH0gICAgICAgIG9uQ2xpY2s9e2FkZEl0ZW19XG4ke2luZGVudH0gICAgICAgIGljb249e1xuJHtpbmRlbnR9ICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+XG4ke2luZGVudH0gICAgICAgICAgICA8cGF0aCBkPVwiTTExIDEyLjVWMTcuNUgxMi41VjEyLjVIMTcuNVYxMUgxMi41VjZIMTFWMTFINlYxMi41SDExWlwiLz5cbiR7aW5kZW50fSAgICAgICAgICA8L3N2Zz5cbiR7aW5kZW50fSAgICAgICAgfVxuJHtpbmRlbnR9ICAgICAgICBjbGFzc05hbWU9XCJyZXBlYXRlci1hZGQtYnV0dG9uXCJcbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAge19fKCdBZGQgJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgPC9CdXR0b24+XG4ke2luZGVudH0gICAgPC9kaXY+XG4ke2luZGVudH0gIClgO1xuXG4gIHJldHVybiBgJHtpbmRlbnR9PFJlcGVhdGVyIFxuJHtpbmRlbnR9ICBhdHRyaWJ1dGU9XCIke2F0dHJOYW1lfVwiIFxuJHtpbmRlbnR9ICBhbGxvd1Jlb3JkZXJpbmc9e3RydWV9IFxuJHtpbmRlbnR9ICBkZWZhdWx0VmFsdWU9eyR7aXRlbURlZmF1bHRMaXRlcmFsfX1cbiR7aW5kZW50fSAgYWRkQnV0dG9uPXske2FkZEJ1dHRvbkpzeH19XG4ke2luZGVudH0+XG4ke2luZGVudH0gIHsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiR7aW5kZW50fSAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1cIj5cbiR7aW5kZW50fSAgICAgIDxkZXRhaWxzIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2NvbGxhcHNlXCI+XG4ke2luZGVudH0gICAgICAgIDxzdW1tYXJ5IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2hlYWRlclwiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX3RpdGxlXCI+eyR7dGl0bGVBY2Nlc3Nvcn0nJHtsYWJlbH0nfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19hY3Rpb25zXCIgb25DbGljaz17KGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCl9PlxuJHtpbmRlbnR9ICAgICAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgICAgICBvbkNsaWNrPXtyZW1vdmVJdGVtfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpY29uPXtcbiR7aW5kZW50fSAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk01IDYuNVYxOGEyIDIgMCAwMDIgMmgxMGEyIDIgMCAwMDItMlY2LjVoLTIuNVYxOGEuNS41IDAgMDEtLjUuNUg4YS41LjUgMCAwMS0uNS0uNVY2LjVINXpNOSA5djhoMS41VjlIOXptNC41IDB2OEgxNVY5aC0xLjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgICAgPHBhdGggZD1cIk0yMCA1aC01VjMuNUExLjUgMS41IDAgMDAxMy41IDJoLTNBMS41IDEuNSAwIDAwOSAzLjVWNUg0djEuNWgxNlY1em0tNi41IDBoLTNWMy41aDNWNXpcIi8+XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPC9zdmc+XG4ke2luZGVudH0gICAgICAgICAgICAgIH1cbiR7aW5kZW50fSAgICAgICAgICAgICAgbGFiZWw9e19fKCdSZW1vdmUgaXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L3N1bW1hcnk+XG4ke2luZGVudH0gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fZmllbGRzXCI+XG4ke2luZGVudH0gICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7aXRlbUZpZWxkc31cbiR7aW5kZW50fSAgICAgICAgICA8L0ZsZXg+XG4ke2luZGVudH0gICAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICAgPC9kZXRhaWxzPlxuJHtpbmRlbnR9ICAgIDwvZGl2PlxuJHtpbmRlbnR9ICApfVxuJHtpbmRlbnR9PC9SZXBlYXRlcj5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0aGUgaW5zcGVjdG9yIGNvbnRyb2wgZm9yIGEgdG9wLWxldmVsIHByb3BlcnR5XG4gKiBVc2VzIGdlbmVyYXRlRmllbGRDb250cm9sIHdpdGggYSBzZXRBdHRyaWJ1dGVzIGNvbnRleHRcbiAqL1xuY29uc3QgZ2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2wgPSAoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHksIGluZGVudDogc3RyaW5nID0gJyAgICAgICAgICAnKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICBjb25zdCBsYWJlbCA9IHByb3BlcnR5Lm5hbWUgfHwgdG9UaXRsZUNhc2Uoa2V5KTtcblxuICAvLyBGb3IgYXJyYXkgdHlwZSwgdXNlIHRoZSBzcGVjaWFsaXplZCBhcnJheSBjb250cm9sXG4gIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknKSB7XG4gICAgcmV0dXJuIGdlbmVyYXRlQXJyYXlDb250cm9sKGtleSwgcHJvcGVydHksIGF0dHJOYW1lLCBsYWJlbCwgaW5kZW50KTtcbiAgfVxuXG4gIC8vIEZvciBhbGwgb3RoZXIgdHlwZXMsIHVzZSB0aGUgdW5pZmllZCBmaWVsZCBjb250cm9sIGdlbmVyYXRvclxuICBjb25zdCBjb250ZXh0OiBGaWVsZENvbnRleHQgPSB7XG4gICAgdmFsdWVBY2Nlc3NvcjogYXR0ck5hbWUsXG4gICAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWUpID0+IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06ICR7dmFsdWV9IH0pYCxcbiAgICBpbmRlbnRcbiAgfTtcblxuICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woa2V5LCBwcm9wZXJ0eSwgY29udGV4dCk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGRlZmF1bHQgdmFsdWUgZm9yIGEgcHJvcGVydHkgdHlwZVxuICovXG5jb25zdCBnZXREZWZhdWx0VmFsdWUgPSAoZmllbGRQcm9wOiBIYW5kb2ZmUHJvcGVydHkpOiBhbnkgPT4ge1xuICBzd2l0Y2ggKGZpZWxkUHJvcC50eXBlKSB7XG4gICAgY2FzZSAnbGluayc6XG4gICAgICByZXR1cm4geyBsYWJlbDogJycsIHVybDogJycsIG9wZW5zSW5OZXdUYWI6IGZhbHNlIH07XG4gICAgY2FzZSAnYnV0dG9uJzpcbiAgICAgIHJldHVybiBnZXRCdXR0b25EZWZhdWx0KGZpZWxkUHJvcCk7XG4gICAgY2FzZSAnaW1hZ2UnOlxuICAgICAgcmV0dXJuIHsgc3JjOiAnJywgYWx0OiAnJyB9O1xuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIHJldHVybiB7IHNyYzogJycsIGlkOiAnJywgcG9zdGVyOiAnJywgdHlwZTogJycsIHdpZHRoOiAwLCBoZWlnaHQ6IDAsIG1pbWU6ICcnLCBtaW1lVHlwZTogJycgfTtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKGZpZWxkUHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbnN0IG5lc3RlZDogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtuZXN0ZWRLZXksIG5lc3RlZFByb3BdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkUHJvcC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgIG5lc3RlZFtuZXN0ZWRLZXldID0gZ2V0RGVmYXVsdFZhbHVlKG5lc3RlZFByb3ApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXN0ZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge307XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAwO1xuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIHJldHVybiBbXTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGhlbHBlciBmdW5jdGlvbnMgZm9yIGFycmF5IHByb3BlcnRpZXNcbiAqIE5vdGU6IFdpdGggdGhlIDEwdXAgUmVwZWF0ZXIgY29tcG9uZW50LCB3ZSBubyBsb25nZXIgbmVlZCBjdXN0b20gYWRkL3VwZGF0ZS9yZW1vdmUvbW92ZSBmdW5jdGlvbnNcbiAqIFRoZSBSZXBlYXRlciBoYW5kbGVzIGFsbCBvZiB0aGlzIGludGVybmFsbHkgdmlhIGl0cyByZW5kZXIgcHJvcFxuICovXG5jb25zdCBnZW5lcmF0ZUFycmF5SGVscGVycyA9IChwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogc3RyaW5nID0+IHtcbiAgLy8gVGhlIDEwdXAgUmVwZWF0ZXIgY29tcG9uZW50IGhhbmRsZXMgYXJyYXkgbWFuaXB1bGF0aW9uIGludGVybmFsbHlcbiAgLy8gTm8gY3VzdG9tIGhlbHBlciBmdW5jdGlvbnMgYXJlIG5lZWRlZFxuICByZXR1cm4gJyc7XG59O1xuXG5cbi8qKlxuICogRGV0ZXJtaW5pc3RpYyBoYXNoIG9mIGEgc3RyaW5nIHRvIGEgbnVtYmVyIGluIFswLCBtYXgpLlxuICovXG5jb25zdCBoYXNoU3RyaW5nID0gKHN0cjogc3RyaW5nLCBtYXg6IG51bWJlcik6IG51bWJlciA9PiB7XG4gIGxldCBoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBoID0gKChoIDw8IDUpIC0gaCArIHN0ci5jaGFyQ29kZUF0KGkpKSB8IDA7XG4gIH1cbiAgcmV0dXJuICgoaCAlIG1heCkgKyBtYXgpICUgbWF4O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhbiBTVkcgaWNvbiBlbGVtZW50IHN0cmluZyBmb3IgdXNlIGluIHJlZ2lzdGVyQmxvY2tUeXBlLlxuICogQ3JlYXRlcyBhIGNvbG9yZWQgcm91bmRlZCByZWN0YW5nbGUgd2l0aCAxLTIgbGV0dGVyIGluaXRpYWxzIGRlcml2ZWRcbiAqIGZyb20gdGhlIGJsb2NrIHRpdGxlLCB3aXRoIHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGtleWVkIHRvIHRoZSBncm91cC5cbiAqL1xuY29uc3QgZ2VuZXJhdGVTdmdJY29uID0gKHRpdGxlOiBzdHJpbmcsIGdyb3VwOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBHUk9VUF9DT0xPUlMgPSBbXG4gICAgJyM1QjIxQjYnLCAnIzBFNzQ5MCcsICcjQjQ1MzA5JywgJyMwNDc4NTcnLFxuICAgICcjQkUxMjNDJywgJyM0MzM4Q0EnLCAnIzAzNjlBMScsICcjQTE2MjA3JyxcbiAgICAnIzE1ODAzRCcsICcjOTMzM0VBJywgJyNDMjQxMEMnLCAnIzFENEVEOCcsXG4gICAgJyMwNTk2NjknLCAnIzdDM0FFRCcsICcjREMyNjI2JywgJyMyNTYzRUInLFxuICBdO1xuXG4gIGNvbnN0IHdvcmRzID0gdGl0bGUuc3BsaXQoL1tcXHNfLV0rLykuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBpbml0aWFscyA9IHdvcmRzLmxlbmd0aCA+PSAyXG4gICAgPyAod29yZHNbMF1bMF0gKyB3b3Jkc1sxXVswXSkudG9VcHBlckNhc2UoKVxuICAgIDogKHdvcmRzWzBdPy5zdWJzdHJpbmcoMCwgMikgfHwgJ0hPJykudG9VcHBlckNhc2UoKTtcblxuICBjb25zdCBjb2xvciA9IEdST1VQX0NPTE9SU1toYXNoU3RyaW5nKGdyb3VwIHx8IHRpdGxlLCBHUk9VUF9DT0xPUlMubGVuZ3RoKV07XG5cbiAgcmV0dXJuIGA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+XG4gICAgICA8cmVjdCB4PVwiMlwiIHk9XCIyXCIgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgcng9XCI0XCIgZmlsbD1cIiR7Y29sb3J9XCIgLz5cbiAgICAgIDx0ZXh0IHg9XCIxMlwiIHk9XCIxNi41XCIgdGV4dEFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCJ3aGl0ZVwiIGZvbnRTaXplPVwiMTBcIiBmb250RmFtaWx5PVwiLWFwcGxlLXN5c3RlbSxCbGlua01hY1N5c3RlbUZvbnQsc2Fucy1zZXJpZlwiIGZvbnRXZWlnaHQ9XCI2MDBcIj4ke2luaXRpYWxzfTwvdGV4dD5cbiAgICA8L3N2Zz5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBjb21wbGV0ZSBpbmRleC5qcyBmaWxlXG4gKiBAcGFyYW0gY29tcG9uZW50IC0gVGhlIEhhbmRvZmYgY29tcG9uZW50IGRhdGFcbiAqIEBwYXJhbSBkeW5hbWljQXJyYXlDb25maWdzIC0gT3B0aW9uYWwgZHluYW1pYyBhcnJheSBjb25maWd1cmF0aW9ucyBrZXllZCBieSBmaWVsZCBuYW1lXG4gKiBAcGFyYW0gaW5uZXJCbG9ja3NGaWVsZCAtIFRoZSByaWNodGV4dCBmaWVsZCB0aGF0IHVzZXMgSW5uZXJCbG9ja3MsIG9yIG51bGwgaWYgbm9uZVxuICogQHBhcmFtIGRlcHJlY2F0aW9uc0NvZGUgLSBPcHRpb25hbCBkZXByZWNhdGlvbiBtaWdyYXRpb24gY29kZVxuICogQHBhcmFtIGhhc1NjcmVlbnNob3QgLSBXaGV0aGVyIGEgc2NyZWVuc2hvdC5wbmcgaXMgYXZhaWxhYmxlIGZvciBpbnNlcnRlciBwcmV2aWV3XG4gKi9cbmNvbnN0IGdlbmVyYXRlSW5kZXhKcyA9IChcbiAgY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LFxuICBkeW5hbWljQXJyYXlDb25maWdzPzogUmVjb3JkPHN0cmluZywgRHluYW1pY0FycmF5Q29uZmlnIHwgQnJlYWRjcnVtYnNBcnJheUNvbmZpZyB8IFRheG9ub215QXJyYXlDb25maWcgfCBQYWdpbmF0aW9uQXJyYXlDb25maWc+LFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCxcbiAgZGVwcmVjYXRpb25zQ29kZT86IHN0cmluZyxcbiAgaGFzU2NyZWVuc2hvdD86IGJvb2xlYW4sXG4gIGVkaXRvckNvbmZpZz86IGltcG9ydCgnLi4vdHlwZXMnKS5IYW5kb2ZmRWRpdG9yQ29uZmlnLFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYmxvY2tOYW1lID0gdG9CbG9ja05hbWUoY29tcG9uZW50LmlkKTtcbiAgY29uc3QgcHJvcGVydGllcyA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzO1xuXG4gIC8vIGhhc0R5bmFtaWNBcnJheXMgaXMgdHJ1ZSBvbmx5IHdoZW4gdGhlcmUgYXJlIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpIGZpZWxkcyDigJRcbiAgLy8gdGhlIHNpbXBsZXIgdHlwZXMgKGJyZWFkY3J1bWJzL3RheG9ub215L3BhZ2luYXRpb24pIGRvbid0IG5lZWQgRHluYW1pY1Bvc3RTZWxlY3Rvci5cbiAgY29uc3QgaGFzRHluYW1pY0FycmF5cyA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZShcbiAgICAgICAgKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYylcbiAgICAgIClcbiAgICA6IGZhbHNlO1xuXG4gIC8vIEhlbHBlciB0byBjaGVjayBmb3IgYSB0eXBlIGluIHByb3BlcnRpZXMsIGluY2x1ZGluZyBuZXN0ZWQgaW4gYXJyYXlzL29iamVjdHNcbiAgY29uc3QgaGFzUHJvcGVydHlUeXBlID0gKHR5cGU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgIGNvbnN0IGNoZWNrUHJvcGVydHkgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5KTogYm9vbGVhbiA9PiB7XG4gICAgICBpZiAocHJvcC50eXBlID09PSB0eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhwcm9wLnByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gICAgICB9XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgfTtcblxuICAvLyBUaGUgaW5uZXJCbG9ja3NGaWVsZCB1c2VzIElubmVyQmxvY2tzIChjb250ZW50IHN0b3JlZCBpbiBwb3N0X2NvbnRlbnQsIG5vdCBhbiBhdHRyaWJ1dGUpLlxuICAvLyBBbGwgb3RoZXIgcmljaHRleHQgZmllbGRzIGJlY29tZSBzdHJpbmcgYXR0cmlidXRlcyB3aXRoIFJpY2hUZXh0IGVkaXRpbmcuXG4gIGNvbnN0IHVzZUlubmVyQmxvY2tzID0gISFpbm5lckJsb2Nrc0ZpZWxkO1xuXG4gIC8vIEdldCBhbGwgYXR0cmlidXRlIG5hbWVzIOKAkyBleGNsdWRlIGlubmVyQmxvY2tzRmllbGQgYW5kIHBhZ2luYXRpb25cbiAgY29uc3QgYXR0ck5hbWVzID0gT2JqZWN0LmtleXMocHJvcGVydGllcylcbiAgICAuZmlsdGVyKGsgPT4gayAhPT0gaW5uZXJCbG9ja3NGaWVsZCAmJiBwcm9wZXJ0aWVzW2tdLnR5cGUgIT09ICdwYWdpbmF0aW9uJylcbiAgICAubWFwKHRvQ2FtZWxDYXNlKTtcblxuICAvLyBJbmNsdWRlIGFueSBhdHRyaWJ1dGUgbmFtZXMgcmVmZXJlbmNlZCBpbiB0aGUgdGVtcGxhdGUgYnV0IG1pc3NpbmcgZnJvbSBBUEkgcHJvcGVydGllc1xuICAvLyAoZS5nLiBib2R5IC0+IGJsb2NrQm9keSBzbyBKU1ggaGFzIGEgZGVmaW5lZCB2YXJpYWJsZSBhbmQgbm8gUmVmZXJlbmNlRXJyb3IpLlxuICAvLyBTa2lwIHRoZSBpbm5lckJsb2Nrc0ZpZWxkIOKAlCBpdHMgY29udGVudCBpcyBzdG9yZWQgdmlhIElubmVyQmxvY2tzLCBub3QgYXMgYW4gYXR0cmlidXRlLlxuICBjb25zdCBpbm5lckJsb2Nrc0F0dHJOYW1lID0gaW5uZXJCbG9ja3NGaWVsZCA/IHRvQ2FtZWxDYXNlKGlubmVyQmxvY2tzRmllbGQpIDogbnVsbDtcbiAgZm9yIChjb25zdCBuYW1lIG9mIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzKGNvbXBvbmVudC5jb2RlKSkge1xuICAgIGlmICghYXR0ck5hbWVzLmluY2x1ZGVzKG5hbWUpICYmIG5hbWUgIT09IGlubmVyQmxvY2tzQXR0ck5hbWUpIGF0dHJOYW1lcy5wdXNoKG5hbWUpO1xuICB9XG4gIFxuICAvLyBBZGQgZHluYW1pYyBhcnJheSBhdHRyaWJ1dGUgbmFtZXMgYmFzZWQgb24gY29uZmlnIHR5cGVcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGR5bkNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoZHluYW1pY0FycmF5Q29uZmlncykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2UoZmllbGROYW1lKTtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bkNvbmZpZykgfHwgaXNQYWdpbmF0aW9uQ29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgfSBlbHNlIGlmIChpc1RheG9ub215Q29uZmlnKGR5bkNvbmZpZykpIHtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RW5hYmxlZGApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1UYXhvbm9teWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpXG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVNvdXJjZWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Qb3N0VHlwZWApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlc2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1SZW5kZXJNb2RlYCk7XG4gICAgICAgIGlmICgoZHluQ29uZmlnIGFzIER5bmFtaWNBcnJheUNvbmZpZykucGFnaW5hdGlvbikge1xuICAgICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgd2hpY2ggY29tcG9uZW50cyB3ZSBuZWVkIHRvIGltcG9ydFxuICBjb25zdCBuZWVkc01lZGlhVXBsb2FkID0gaGFzUHJvcGVydHlUeXBlKCdpbWFnZScpO1xuICBjb25zdCBuZWVkc1JhbmdlQ29udHJvbCA9IGhhc09wYWNpdHlSYW5nZUZpZWxkKHByb3BlcnRpZXMpO1xuICBjb25zdCBuZWVkc1RvZ2dsZUNvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2Jvb2xlYW4nKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuICBjb25zdCBuZWVkc1NlbGVjdENvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ3NlbGVjdCcpO1xuICBjb25zdCBoYXNBcnJheVByb3BzID0gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKHAgPT4gcC50eXBlID09PSAnYXJyYXknKTtcbiAgY29uc3QgaGFzT2JqZWN0UHJvcHMgPSBoYXNQcm9wZXJ0eVR5cGUoJ29iamVjdCcpO1xuXG4gIC8vIEJ1aWxkIGltcG9ydHNcbiAgY29uc3QgYmxvY2tFZGl0b3JJbXBvcnRzID0gWyd1c2VCbG9ja1Byb3BzJywgJ0luc3BlY3RvckNvbnRyb2xzJywgJ0Jsb2NrQ29udHJvbHMnXTtcbiAgaWYgKG5lZWRzTWVkaWFVcGxvYWQpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnTWVkaWFVcGxvYWQnLCAnTWVkaWFVcGxvYWRDaGVjaycsICdNZWRpYVJlcGxhY2VGbG93Jyk7XG4gIH1cbiAgLy8gSW5uZXJCbG9ja3MgZm9yIHRoZSBkZXNpZ25hdGVkIHJpY2h0ZXh0IGNvbnRlbnQgYXJlYVxuICBpZiAodXNlSW5uZXJCbG9ja3MpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnSW5uZXJCbG9ja3MnKTtcbiAgfVxuICAvLyBMaW5rQ29udHJvbCBmb3IgbGluay9idXR0b24gZmllbGRzICh3aGVuIG5vdCB1c2luZyBzaGFyZWQgSGFuZG9mZkxpbmtGaWVsZClcbiAgY29uc3QgbmVlZHNMaW5rQ29udHJvbCA9IGhhc1Byb3BlcnR5VHlwZSgnbGluaycpIHx8IGhhc1Byb3BlcnR5VHlwZSgnYnV0dG9uJyk7XG5cbiAgY29uc3QgaGFzQnJlYWRjcnVtYnNBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNCcmVhZGNydW1ic0NvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNUYXhvbm9teUFycmF5ID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiBpc1RheG9ub215Q29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG4gIGNvbnN0IGhhc1BhZ2luYXRpb25BcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNQYWdpbmF0aW9uQ29uZmlnKGMpKVxuICAgIDogZmFsc2U7XG5cbiAgY29uc3QgY29tcG9uZW50SW1wb3J0cyA9IFsnUGFuZWxCb2R5JywgJ1RleHRDb250cm9sJywgJ0J1dHRvbiddO1xuICBpZiAobmVlZHNSYW5nZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUmFuZ2VDb250cm9sJyk7XG4gIC8vIFRvZ2dsZUNvbnRyb2w6IG9ubHkgZm9yIGJvb2xlYW4vYnV0dG9uIHByb3BlcnR5IGZpZWxkcyDigJQgc3BlY2lhbCBhcnJheSB0eXBlcyB1c2Ugc2hhcmVkIGNvbXBvbmVudHNcbiAgaWYgKG5lZWRzVG9nZ2xlQ29udHJvbCkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdUb2dnbGVDb250cm9sJyk7XG4gIC8vIFNlbGVjdENvbnRyb2w6IG9ubHkgZm9yIHNlbGVjdCBwcm9wZXJ0eSBmaWVsZHMgb3IgRHluYW1pY1Bvc3RTZWxlY3RvciAocG9zdHMpIOKAlCB0YXhvbm9teSBoYW5kbGVkIGJ5IFRheG9ub215U2VsZWN0b3JcbiAgaWYgKG5lZWRzU2VsZWN0Q29udHJvbCB8fCBoYXNEeW5hbWljQXJyYXlzKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1NlbGVjdENvbnRyb2wnKTtcbiAgLy8gU3Bpbm5lciBmb3IgZHluYW1pYyBhcnJheSBsb2FkaW5nIHN0YXRlIGluIGVkaXRvciBwcmV2aWV3XG4gIGlmIChoYXNEeW5hbWljQXJyYXlzKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1NwaW5uZXInKTtcbiAgLy8gVGV4dGFyZWFDb250cm9sOiBuZWVkZWQgd2hlbiByaWNodGV4dCBmaWVsZHMgYXBwZWFyIGluc2lkZSBhcnJheSBpdGVtc1xuICBjb25zdCBoYXNSaWNodGV4dEluQXJyYXkgPSBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUocCA9PlxuICAgIHAudHlwZSA9PT0gJ2FycmF5JyAmJiBwLml0ZW1zPy5wcm9wZXJ0aWVzICYmXG4gICAgT2JqZWN0LnZhbHVlcyhwLml0ZW1zLnByb3BlcnRpZXMpLnNvbWUoaXAgPT4gaXAudHlwZSA9PT0gJ3JpY2h0ZXh0JylcbiAgKTtcbiAgaWYgKGhhc1JpY2h0ZXh0SW5BcnJheSkgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdUZXh0YXJlYUNvbnRyb2wnKTtcblxuICBjb21wb25lbnRJbXBvcnRzLnB1c2goJ0ZsZXgnKTtcblxuICAvLyAxMHVwIGJsb2NrLWNvbXBvbmVudHMgaW1wb3J0c1xuICAvLyBSZXBlYXRlciBpcyBvbmx5IG5lZWRlZCB3aGVuIHRoZXJlIGFyZSBub24tc2VydmVyLXJlbmRlcmVkIGFycmF5IGZpZWxkcyBpbiB0aGUgc2lkZWJhclxuICAvLyAodGF4b25vbXkvYnJlYWRjcnVtYnMvcGFnaW5hdGlvbiBhcnJheXMgdXNlIHNoYXJlZCBjb21wb25lbnRzIHRoYXQgaW1wb3J0IFJlcGVhdGVyIHRoZW1zZWx2ZXMpXG4gIGNvbnN0IGhhc05vblNwZWNpYWxBcnJheVByb3BzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PlxuICAgIHAudHlwZSA9PT0gJ2FycmF5JyAmJiAoIWR5bmFtaWNBcnJheUNvbmZpZ3M/LltrXSB8fCAhKCdhcnJheVR5cGUnIGluIGR5bmFtaWNBcnJheUNvbmZpZ3Nba10pKVxuICApO1xuICBjb25zdCB0ZW5VcEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChoYXNOb25TcGVjaWFsQXJyYXlQcm9wcykge1xuICAgIHRlblVwSW1wb3J0cy5wdXNoKCdSZXBlYXRlcicpO1xuICB9XG5cbiAgLy8gR2VuZXJhdGUgYXJyYXkgaGVscGVyc1xuICBjb25zdCBhcnJheUhlbHBlcnMgPSBnZW5lcmF0ZUFycmF5SGVscGVycyhwcm9wZXJ0aWVzKTtcblxuICAvLyBHZW5lcmF0ZSBKU1ggcHJldmlldyBmcm9tIGhhbmRsZWJhcnMgdGVtcGxhdGVcbiAgLy8gVGhpcyBtdXN0IGhhcHBlbiBiZWZvcmUgcGFuZWwgZ2VuZXJhdGlvbiBzbyB3ZSBrbm93IHdoaWNoIGZpZWxkcyBoYXZlIGlubGluZSBlZGl0aW5nXG4gIGNvbnN0IHByZXZpZXdSZXN1bHQgPSBnZW5lcmF0ZUpzeFByZXZpZXcoXG4gICAgY29tcG9uZW50LmNvZGUsXG4gICAgcHJvcGVydGllcyxcbiAgICBjb21wb25lbnQuaWQsXG4gICAgY29tcG9uZW50LnRpdGxlLFxuICAgIGlubmVyQmxvY2tzRmllbGQsXG4gICAgZWRpdG9yQ29uZmlnLFxuICApO1xuICBsZXQgcHJldmlld0pzeCA9IHByZXZpZXdSZXN1bHQuanN4O1xuICBjb25zdCBpbmxpbmVFZGl0YWJsZUZpZWxkcyA9IHByZXZpZXdSZXN1bHQuaW5saW5lRWRpdGFibGVGaWVsZHM7XG5cbiAgLy8gRGV0ZWN0IGlmIHByZXZpZXcgdXNlcyBIYW5kb2ZmTGlua0ZpZWxkIChsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZylcbiAgY29uc3QgcHJldmlld1VzZXNMaW5rRmllbGQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SGFuZG9mZkxpbmtGaWVsZCcpO1xuXG4gIC8vIEdlbmVyYXRlIHBhbmVsIGJvZGllcyBmb3IgZWFjaCBwcm9wZXJ0eVxuICBjb25zdCBwYW5lbHM6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICAvLyByaWNodGV4dCB1c2VzIElubmVyQmxvY2tzIG9uIHRoZSBjYW52YXMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgLy8gcGFnaW5hdGlvbiBpcyBhdXRvLWdlbmVyYXRlZCBmcm9tIHF1ZXJ5IHJlc3VsdHMg4oCTIG5vIHNpZGViYXIgcGFuZWwgbmVlZGVkXG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdyaWNodGV4dCcgfHwgcHJvcGVydHkudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSBjb250aW51ZTtcblxuICAgIC8vIFNraXAgZmllbGRzIHRoYXQgYXJlIGlubGluZS1lZGl0YWJsZSBvbiB0aGUgY2FudmFzICh0ZXh0LCBpbWFnZSwgbGluaywgYnV0dG9uXG4gICAgLy8gd3JhcHBlZCBpbiB7eyNmaWVsZH19KSDigJMgdGhleSBkb24ndCBuZWVkIHNpZGViYXIgY29udHJvbHMuXG4gICAgLy8gQXJyYXkgZmllbGRzIGFyZSBhbHdheXMga2VwdDogdGhleSBuZWVkIHNpZGViYXIgVUkgZm9yIG1hbnVhbC9keW5hbWljIHRvZ2dsZVxuICAgIC8vIGFuZCBmb3IgYWRkaW5nL3JlbW92aW5nIGl0ZW1zLCBldmVuIHdoZW4gdGhlaXIgY2hpbGQgZmllbGRzIGFyZSBpbmxpbmUtZWRpdGFibGUuXG4gICAgaWYgKGlubGluZUVkaXRhYmxlRmllbGRzLmhhcyhrZXkpICYmIHByb3BlcnR5LnR5cGUgIT09ICdhcnJheScpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQXJyYXlDb25maWdzPy5ba2V5XTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgZHluYW1pYyBhcnJheSBmaWVsZFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIGR5bmFtaWNDb25maWcpIHtcbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIEJyZWFkY3J1bWJzOiBzaGFyZWQgY29tcG9uZW50IHdpdGggc2luZ2xlIHZpc2liaWxpdHkgdG9nZ2xlXG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gQnJlYWRjcnVtYnMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxCcmVhZGNydW1ic1NlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBUYXhvbm9teTogc2hhcmVkIGNvbXBvbmVudCB3aXRoIEF1dG8gLyBNYW51YWwgdGFic1xuICAgICAgICBjb25zdCB0YXhvbm9teU9wdGlvbnMgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXMubWFwKCh0KSA9PiAoeyBsYWJlbDogdCwgdmFsdWU6IHQgfSkpO1xuICAgICAgICBjb25zdCBkZWZhdWx0VGF4b25vbXkgPSBkeW5hbWljQ29uZmlnLnRheG9ub21pZXNbMF0gfHwgJ3Bvc3RfdGFnJztcbiAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IGl0ZW1GaWVsZHMgPSBPYmplY3Qua2V5cyhpdGVtUHJvcHMpLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgY3R4OiBGaWVsZENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYGl0ZW0uJHtmaWVsZEtleX1gLFxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gYHNldEl0ZW0oeyAuLi5pdGVtLCAke2ZpZWxkS2V5fTogJHt2YWx9IH0pYCxcbiAgICAgICAgICAgICAgICBpbmRlbnQ6ICcgICAgICAgICAgICAgICAgJyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGZpZWxkS2V5LCBmaWVsZFByb3AsIGN0eCk7XG4gICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJylcbiAgICAgICAgICA6IGAgICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnTGFiZWwnLCAnaGFuZG9mZicpfSB2YWx1ZT17aXRlbS5sYWJlbCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgbGFiZWw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+XG4gICAgICAgICAgICAgICAgPFRleHRDb250cm9sIGxhYmVsPXtfXygnVVJMJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0udXJsIHx8ICcnfSBvbkNoYW5nZT17KHYpID0+IHNldEl0ZW0oeyAuLi5pdGVtLCB1cmw6IHYgfSl9IF9fbmV4dEhhc05vTWFyZ2luQm90dG9tIC8+YDtcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBUYXhvbm9teSAqL31cbiAgICAgICAgICA8UGFuZWxCb2R5IHRpdGxlPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfSBpbml0aWFsT3Blbj17JHtwYW5lbHMubGVuZ3RoIDwgMn19PlxuICAgICAgICAgICAgPFRheG9ub215U2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHRheG9ub215T3B0aW9ucz17JHtKU09OLnN0cmluZ2lmeSh0YXhvbm9teU9wdGlvbnMpfX1cbiAgICAgICAgICAgICAgZGVmYXVsdFRheG9ub215PVwiJHtkZWZhdWx0VGF4b25vbXl9XCJcbiAgICAgICAgICAgICAgbGFiZWw9e19fKCdTaG93ICR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgcmVuZGVyTWFudWFsSXRlbXM9eyhpdGVtLCBpbmRleCwgc2V0SXRlbSwgcmVtb3ZlSXRlbSkgPT4gKFxuICAgICAgICAgICAgICAgIDw+XG4ke2l0ZW1GaWVsZHN9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIGlmIChpc1BhZ2luYXRpb25Db25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gUGFnaW5hdGlvbjogc2hhcmVkIGNvbXBvbmVudCB3aXRoIHNpbmdsZSB2aXNpYmlsaXR5IHRvZ2dsZVxuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIFBhZ2luYXRpb24gKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxQYWdpbmF0aW9uU2VsZWN0b3JcbiAgICAgICAgICAgICAgYXR0ck5hbWU9XCIke2F0dHJOYW1lfVwiXG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXM9e2F0dHJpYnV0ZXN9XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXM9e3NldEF0dHJpYnV0ZXN9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUG9zdHMgKER5bmFtaWNBcnJheUNvbmZpZyk6IGZ1bGwgRHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICBjb25zdCBkZWZhdWx0TW9kZSA9IGR5bmFtaWNDb25maWcuc2VsZWN0aW9uTW9kZSA9PT0gJ21hbnVhbCcgPyAnc2VsZWN0JyA6ICdxdWVyeSc7XG4gICAgICAgIGNvbnN0IGl0ZW1PdmVycmlkZXNDb25maWcgPSBkeW5hbWljQ29uZmlnLml0ZW1PdmVycmlkZXNDb25maWcgfHwge307XG4gICAgICAgIGNvbnN0IGFkdmFuY2VkRmllbGRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBvcHRpb25zPzogQXJyYXk8eyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+OyBkZWZhdWx0PzogYW55IH0+ID0gW107XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gaXRlbU92ZXJyaWRlc0NvbmZpZyAobGVnYWN5KVxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCBjXSBvZiBPYmplY3QuZW50cmllcyhpdGVtT3ZlcnJpZGVzQ29uZmlnKSBhcyBBcnJheTxbc3RyaW5nLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZ10+KSB7XG4gICAgICAgICAgaWYgKGMubW9kZSA9PT0gJ3VpJykge1xuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWUsIGxhYmVsOiBjLmxhYmVsLCB0eXBlOiAnc2VsZWN0Jywgb3B0aW9uczogbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhjLm9wdGlvbnMpLCBkZWZhdWx0OiBjLmRlZmF1bHQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIGZyb20gZmllbGRNYXBwaW5nIHdpdGggdHlwZTogXCJtYW51YWxcIiDigJQgZGVyaXZlIGNvbnRyb2wgdHlwZSBmcm9tIGl0ZW0gcHJvcGVydGllc1xuICAgICAgICBjb25zdCBpdGVtUHJvcHMgPSBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcyB8fCB7fTtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gZHluYW1pY0NvbmZpZy5maWVsZE1hcHBpbmcgfHwge307XG4gICAgICAgIGZvciAoY29uc3QgW2ZpZWxkUGF0aCwgbWFwcGluZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZE1hcHBpbmcpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBtYXBwaW5nVmFsdWUgPT09ICdvYmplY3QnICYmIG1hcHBpbmdWYWx1ZSAhPT0gbnVsbCAmJiAobWFwcGluZ1ZhbHVlIGFzIGFueSkudHlwZSA9PT0gJ21hbnVhbCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHRvcEtleSA9IGZpZWxkUGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbdG9wS2V5XTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTGFiZWwgPSBpdGVtUHJvcD8ubmFtZSB8fCB0b1RpdGxlQ2FzZSh0b3BLZXkpO1xuICAgICAgICAgICAgbGV0IGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgbGV0IG9wdGlvbnM6IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGxldCBkZWZhdWx0VmFsOiBhbnkgPSBpdGVtUHJvcD8uZGVmYXVsdCA/PyAnJztcbiAgICAgICAgICAgIGlmIChpdGVtUHJvcCkge1xuICAgICAgICAgICAgICBzd2l0Y2ggKGl0ZW1Qcm9wLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnc2VsZWN0JztcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBub3JtYWxpemVTZWxlY3RPcHRpb25zKGl0ZW1Qcm9wLm9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICBjb250cm9sVHlwZSA9ICd0b2dnbGUnO1xuICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbCA9IGl0ZW1Qcm9wLmRlZmF1bHQgPz8gZmFsc2U7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAnbnVtYmVyJztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IDA7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHMucHVzaCh7IG5hbWU6IGZpZWxkUGF0aCwgbGFiZWw6IGZpZWxkTGFiZWwsIHR5cGU6IGNvbnRyb2xUeXBlLCBvcHRpb25zLCBkZWZhdWx0OiBkZWZhdWx0VmFsIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYWdpbmF0aW9uVG9nZ2xlID0gZHluYW1pY0NvbmZpZy5wYWdpbmF0aW9uXG4gICAgICAgICAgPyBgXG4gICAgICAgICAgICAgICAgPFRvZ2dsZUNvbnRyb2xcbiAgICAgICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyBQYWdpbmF0aW9uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9eyR7YXR0ck5hbWV9UGFnaW5hdGlvbkVuYWJsZWQgPz8gdHJ1ZX1cbiAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkOiB2YWx1ZSB9KX1cbiAgICAgICAgICAgICAgICAvPmBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIER5bmFtaWMgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxEeW5hbWljUG9zdFNlbGVjdG9yXG4gICAgICAgICAgICAgIHZhbHVlPXt7XG4gICAgICAgICAgICAgICAgc291cmNlOiAke2F0dHJOYW1lfVNvdXJjZSB8fCAnJHtkZWZhdWx0TW9kZX0nLFxuICAgICAgICAgICAgICAgIHBvc3RUeXBlOiAke2F0dHJOYW1lfVBvc3RUeXBlLFxuICAgICAgICAgICAgICAgIHF1ZXJ5QXJnczogJHthdHRyTmFtZX1RdWVyeUFyZ3MgfHwge30sXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRQb3N0czogJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzIHx8IFtdLFxuICAgICAgICAgICAgICAgIGl0ZW1PdmVycmlkZXM6ICR7YXR0ck5hbWV9SXRlbU92ZXJyaWRlcyB8fCB7fVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICBvbkNoYW5nZT17KG5leHRWYWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7XG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Tb3VyY2U6IG5leHRWYWx1ZS5zb3VyY2UsXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1Qb3N0VHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9UXVlcnlBcmdzOiB7IC4uLm5leHRWYWx1ZS5xdWVyeUFyZ3MsIHBvc3RfdHlwZTogbmV4dFZhbHVlLnBvc3RUeXBlIH0sXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzOiBuZXh0VmFsdWUuc2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXM6IG5leHRWYWx1ZS5pdGVtT3ZlcnJpZGVzID8/IHt9XG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICBvcHRpb25zPXt7XG4gICAgICAgICAgICAgICAgcG9zdFR5cGVzOiAke0pTT04uc3RyaW5naWZ5KGR5bmFtaWNDb25maWcucG9zdFR5cGVzKX0sXG4gICAgICAgICAgICAgICAgbWF4SXRlbXM6ICR7ZHluYW1pY0NvbmZpZy5tYXhJdGVtcyA/PyAyMH0sXG4gICAgICAgICAgICAgICAgdGV4dERvbWFpbjogJ2hhbmRvZmYnLFxuICAgICAgICAgICAgICAgIHNob3dEYXRlRmlsdGVyOiAkeyhkeW5hbWljQ29uZmlnIGFzIGFueSkuc2hvd0RhdGVGaWx0ZXIgPT09IHRydWUgPyAndHJ1ZScgOiAnZmFsc2UnfSxcbiAgICAgICAgICAgICAgICBzaG93RXhjbHVkZUN1cnJlbnQ6IHRydWUsXG4gICAgICAgICAgICAgICAgYWR2YW5jZWRGaWVsZHM6ICR7SlNPTi5zdHJpbmdpZnkoYWR2YW5jZWRGaWVsZHMpfVxuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz4ke3BhZ2luYXRpb25Ub2dnbGV9XG4gICAgICAgICAgICB7JHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnICYmIChcbiAgICAgICAgICAgICAgPD5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RhbmRhcmQgcGFuZWwgKG5vbi1keW5hbWljKVxuICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiR7Z2VuZXJhdGVQcm9wZXJ0eUNvbnRyb2woa2V5LCBwcm9wZXJ0eSl9XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWRkIEhhbmRvZmYgZGVzaWduIHN5c3RlbSBsaW5rcyBwYW5lbFxuICBjb25zdCBkZXNpZ25TeXN0ZW1QYW5lbCA9IFtcbiAgICAnICAgICAgICAgIHsvKiBEZXNpZ24gU3lzdGVtIExpbmtzICovfScsXG4gICAgJyAgICAgICAgICB7KG1ldGFkYXRhLl9faGFuZG9mZj8uaGFuZG9mZlVybCB8fCBtZXRhZGF0YS5fX2hhbmRvZmY/LmZpZ21hVXJsKSAmJiAoJyxcbiAgICAnICAgICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oXFwnRGVzaWduIFN5c3RlbVxcJywgXFwnaGFuZG9mZlxcJyl9IGluaXRpYWxPcGVuPXtmYWxzZX0+JyxcbiAgICAnICAgICAgICAgICAgICA8RmxleCBkaXJlY3Rpb249XCJjb2x1bW5cIiBnYXA9ezN9PicsXG4gICAgJyAgICAgICAgICAgICAgICB7bWV0YWRhdGEuX19oYW5kb2ZmPy5oYW5kb2ZmVXJsICYmICgnLFxuICAgICcgICAgICAgICAgICAgICAgICA8QnV0dG9uJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB2YXJpYW50PVwic2Vjb25kYXJ5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGhyZWY9e21ldGFkYXRhLl9faGFuZG9mZi5oYW5kb2ZmVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cInZpc2liaWxpdHlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IFxcJzEwMCVcXCcsIGp1c3RpZnlDb250ZW50OiBcXCdjZW50ZXJcXCcgfX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA+JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB7X18oXFwnVmlldyBpbiBIYW5kb2ZmXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgICAge21ldGFkYXRhLl9faGFuZG9mZj8uZmlnbWFVcmwgJiYgKCcsXG4gICAgJyAgICAgICAgICAgICAgICAgIDxCdXR0b24nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHZhcmlhbnQ9XCJzZWNvbmRhcnlcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaHJlZj17bWV0YWRhdGEuX19oYW5kb2ZmLmZpZ21hVXJsfScsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgaWNvbj1cImFydFwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogXFwnMTAwJVxcJywganVzdGlmeUNvbnRlbnQ6IFxcJ2NlbnRlclxcJyB9fScsXG4gICAgJyAgICAgICAgICAgICAgICAgID4nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHtfXyhcXCdPcGVuIGluIEZpZ21hXFwnLCBcXCdoYW5kb2ZmXFwnKX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA8L0J1dHRvbj4nLFxuICAgICcgICAgICAgICAgICAgICAgKX0nLFxuICAgICcgICAgICAgICAgICAgIDwvRmxleD4nLFxuICAgICcgICAgICAgICAgICA8L1BhbmVsQm9keT4nLFxuICAgICcgICAgICAgICAgKX0nLFxuICBdLmpvaW4oJ1xcbicpO1xuICBwYW5lbHMucHVzaChkZXNpZ25TeXN0ZW1QYW5lbCk7XG5cbiAgLy8gRHluYW1pYyBhcnJheSByZXNvbHV0aW9uIGZvciBlZGl0b3IgcHJldmlldy5cbiAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cyk6IGZ1bGwgdXNlU2VsZWN0IHJlc29sdXRpb25cbiAgLy8gQnJlYWRjcnVtYnM6IGxpdmUgZmV0Y2ggdmlhIFJFU1QgZW5kcG9pbnRcbiAgLy8gVGF4b25vbXkgKGF1dG8gbW9kZSk6IGxpdmUgZmV0Y2ggdmlhIHVzZVNlbGVjdCB3aXRoIGNvcmUtZGF0YVxuICAvLyBQYWdpbmF0aW9uOiBzZXJ2ZXItcmVuZGVyZWQgb25seSAoc3R1YiB2YXJpYWJsZSlcbiAgbGV0IGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlID0gJyc7XG4gIGNvbnN0IHJlc29sdmluZ0ZsYWdzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoZHluYW1pY0FycmF5Q29uZmlncykge1xuICAgIGZvciAoY29uc3QgW2ZpZWxkS2V5LCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkS2V5KTtcbiAgICAgIGNvbnN0IGZpZWxkUHJvcCA9IHByb3BlcnRpZXNbZmllbGRLZXldO1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gZmllbGRQcm9wPy5pdGVtcz8ucHJvcGVydGllcztcblxuICAgICAgaWYgKGlzQnJlYWRjcnVtYnNDb25maWcoY29uZmlnKSkge1xuICAgICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJ10pO1xuICAgICAgICBjb25zdCBtYXBFeHByID0gcmVzaGFwZUpzXG4gICAgICAgICAgPyBgLm1hcCgoaXRlbSkgPT4gJHtyZXNoYXBlSnN9KWBcbiAgICAgICAgICA6ICcnO1xuICAgICAgICBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSArPSBgXG4gICAgY29uc3QgW3ByZXZpZXcke2NhcH0sIHNldFByZXZpZXcke2NhcH1dID0gdXNlU3RhdGUobnVsbCk7XG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSB7IHNldFByZXZpZXcke2NhcH0oW10pOyByZXR1cm47IH1cbiAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICBpZiAoIXBvc3RJZCkgeyBzZXRQcmV2aWV3JHtjYXB9KFtdKTsgcmV0dXJuOyB9XG4gICAgICBhcGlGZXRjaCh7IHBhdGg6IFxcYC9oYW5kb2ZmL3YxL2JyZWFkY3J1bWJzP3Bvc3RfaWQ9XFwke3Bvc3RJZH1cXGAgfSlcbiAgICAgICAgLnRoZW4oKGl0ZW1zKSA9PiBzZXRQcmV2aWV3JHtjYXB9KChpdGVtcyB8fCBbXSkke21hcEV4cHJ9KSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHNldFByZXZpZXcke2NhcH0oW10pKTtcbiAgICB9LCBbJHthdHRyTmFtZX1FbmFibGVkXSk7XG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNUYXhvbm9teUNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICAgIGNvbnN0IHJlc2hhcGVKcyA9IGJ1aWxkUmVzaGFwZUpzKGl0ZW1Qcm9wcywgWydsYWJlbCcsICd1cmwnLCAnc2x1ZyddKTtcbiAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKc1xuICAgICAgICAgID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2NhcH0gPSB1c2VTZWxlY3QoXG4gICAgICAoc2VsZWN0KSA9PiB7XG4gICAgICAgIGlmICghJHthdHRyTmFtZX1FbmFibGVkKSByZXR1cm4gW107XG4gICAgICAgIGlmICgke2F0dHJOYW1lfVNvdXJjZSA9PT0gJ21hbnVhbCcpIHJldHVybiAke2F0dHJOYW1lfSB8fCBbXTtcbiAgICAgICAgY29uc3QgcG9zdElkID0gc2VsZWN0KCdjb3JlL2VkaXRvcicpPy5nZXRDdXJyZW50UG9zdElkPy4oKTtcbiAgICAgICAgaWYgKCFwb3N0SWQpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGF4b25vbXkgPSAke2F0dHJOYW1lfVRheG9ub215IHx8ICcke2NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyd9JztcbiAgICAgICAgY29uc3QgcmVzdEJhc2UgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0VGF4b25vbXkodGF4b25vbXkpPy5yZXN0X2Jhc2U7XG4gICAgICAgIGlmICghcmVzdEJhc2UpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgdGVybXMgPSBzZWxlY3QoY29yZURhdGFTdG9yZSkuZ2V0RW50aXR5UmVjb3JkcygndGF4b25vbXknLCB0YXhvbm9teSwgeyBwb3N0OiBwb3N0SWQsIHBlcl9wYWdlOiAke2NvbmZpZy5tYXhJdGVtcyA/PyAtMX0gfSk7XG4gICAgICAgIGlmICghdGVybXMpIHJldHVybiBbXTtcbiAgICAgICAgcmV0dXJuIHRlcm1zLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQubmFtZSwgdXJsOiB0LmxpbmsgfHwgJycsIHNsdWc6IHQuc2x1ZyB8fCAnJyB9KSkke21hcEV4cHJ9O1xuICAgICAgfSxcbiAgICAgIFske2F0dHJOYW1lfUVuYWJsZWQsICR7YXR0ck5hbWV9U291cmNlLCAke2F0dHJOYW1lfVRheG9ub215LCBKU09OLnN0cmluZ2lmeSgke2F0dHJOYW1lfSB8fCBbXSldXG4gICAgKTtcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkfFNvdXJjZXxUYXhvbm9teSlgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHtjYXB9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9ID0gW107IC8vIFBhZ2luYXRpb24gcmVuZGVycyBvbiB0aGUgZnJvbnRlbmRcbmA7XG4gICAgICAgIGNvbnN0IGFycmF5VmFyUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7YXR0ck5hbWV9XFxcXGIoPyFFbmFibGVkKWAsICdnJyk7XG4gICAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgYHByZXZpZXcke2F0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSl9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKTogZnVsbCB1c2VTZWxlY3QgcmVzb2x1dGlvblxuICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgIGNvbnN0IHByZXZpZXdWYXJOYW1lID0gYHByZXZpZXcke2NhcH1gO1xuICAgICAgY29uc3QgcmVzb2x2ZWRWYXJOYW1lID0gYHJlc29sdmVkJHtjYXB9YDtcbiAgICAgIGNvbnN0IHJlc29sdmluZ1Zhck5hbWUgPSBgaXNSZXNvbHZpbmcke2NhcH1gO1xuICAgICAgcmVzb2x2aW5nRmxhZ3MucHVzaChyZXNvbHZpbmdWYXJOYW1lKTtcbiAgICAgIGNvbnN0IHNvdXJjZUF0dHIgPSBgJHthdHRyTmFtZX1Tb3VyY2VgO1xuICAgICAgY29uc3QgcXVlcnlBcmdzQXR0ciA9IGAke2F0dHJOYW1lfVF1ZXJ5QXJnc2A7XG4gICAgICBjb25zdCBwb3N0VHlwZUF0dHIgPSBgJHthdHRyTmFtZX1Qb3N0VHlwZWA7XG4gICAgICBjb25zdCBzZWxlY3RlZFBvc3RzQXR0ciA9IGAke2F0dHJOYW1lfVNlbGVjdGVkUG9zdHNgO1xuICAgICAgY29uc3QgZmllbGRNYXBwaW5nQXR0ciA9IGAke2F0dHJOYW1lfUZpZWxkTWFwcGluZ2A7XG4gICAgICBjb25zdCBpdGVtT3ZlcnJpZGVzQXR0ciA9IGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgO1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0ICR7cmVzb2x2ZWRWYXJOYW1lfSA9IHVzZVNlbGVjdChcbiAgICAgIChzZWxlY3QpID0+IHtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdtYW51YWwnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBzdG9yZSA9IHNlbGVjdChjb3JlRGF0YVN0b3JlKTtcbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdxdWVyeScpIHtcbiAgICAgICAgICBjb25zdCBxdWVyeUFyZ3MgPSAke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHBvc3RUeXBlID0gJHtwb3N0VHlwZUF0dHJ9IHx8ICdwb3N0JztcbiAgICAgICAgICBjb25zdCBhcmdzID0ge1xuICAgICAgICAgICAgcGVyX3BhZ2U6IHF1ZXJ5QXJncy5wb3N0c19wZXJfcGFnZSB8fCAke2NvbmZpZy5tYXhJdGVtcyA/PyA2fSxcbiAgICAgICAgICAgIG9yZGVyYnk6IHF1ZXJ5QXJncy5vcmRlcmJ5IHx8ICdkYXRlJyxcbiAgICAgICAgICAgIG9yZGVyOiAocXVlcnlBcmdzLm9yZGVyIHx8ICdERVNDJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgIF9lbWJlZDogdHJ1ZSxcbiAgICAgICAgICAgIHN0YXR1czogJ3B1Ymxpc2gnLFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHF1ZXJ5QXJncy50YXhfcXVlcnkgJiYgcXVlcnlBcmdzLnRheF9xdWVyeS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHF1ZXJ5QXJncy50YXhfcXVlcnkuZm9yRWFjaCgodHEpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCF0cS50YXhvbm9teSB8fCAhdHEudGVybXMgfHwgIXRxLnRlcm1zLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgICAgICAgICBjb25zdCBwYXJhbSA9IHRxLnRheG9ub215ID09PSAnY2F0ZWdvcnknID8gJ2NhdGVnb3JpZXMnIDogdHEudGF4b25vbXkgPT09ICdwb3N0X3RhZycgPyAndGFncycgOiB0cS50YXhvbm9teTtcbiAgICAgICAgICAgICAgYXJnc1twYXJhbV0gPSB0cS50ZXJtcy5qb2luKCcsJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVjb3JkcyA9IHN0b3JlLmdldEVudGl0eVJlY29yZHMoJ3Bvc3RUeXBlJywgcG9zdFR5cGUsIGFyZ3MpO1xuICAgICAgICAgIGlmIChyZWNvcmRzID09PSBudWxsIHx8IHJlY29yZHMgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVjb3JkcykpIHJldHVybiBbXTtcbiAgICAgICAgICBjb25zdCBtYXBwaW5nID0gJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBvdmVycmlkZXMgPSAke2l0ZW1PdmVycmlkZXNBdHRyfSB8fCB7fTtcbiAgICAgICAgICByZXR1cm4gcmVjb3Jkcy5tYXAoKHJlYykgPT5cbiAgICAgICAgICAgIG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoJHtzb3VyY2VBdHRyfSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9ICR7c2VsZWN0ZWRQb3N0c0F0dHJ9IHx8IFtdO1xuICAgICAgICAgIGlmICghc2VsZWN0ZWQubGVuZ3RoKSByZXR1cm4gW107XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge307XG4gICAgICAgICAgcmV0dXJuIHNlbGVjdGVkXG4gICAgICAgICAgICAubWFwKChzZWwpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcmVjID0gc3RvcmUuZ2V0RW50aXR5UmVjb3JkKCdwb3N0VHlwZScsIHNlbC50eXBlIHx8ICdwb3N0Jywgc2VsLmlkKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlYyA/IG1hcFBvc3RFbnRpdHlUb0l0ZW0ocmVjLCBtYXBwaW5nLCBvdmVycmlkZXMsIHJlYy5fZW1iZWRkZWQgfHwge30pIDogbnVsbDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0sXG4gICAgICBbJHtzb3VyY2VBdHRyfSwgJHtwb3N0VHlwZUF0dHJ9LCBKU09OLnN0cmluZ2lmeSgke3F1ZXJ5QXJnc0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtzZWxlY3RlZFBvc3RzQXR0cn0gfHwgW10pLCBKU09OLnN0cmluZ2lmeSgke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9KSwgSlNPTi5zdHJpbmdpZnkoJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge30pXVxuICAgICk7XG4gICAgY29uc3QgJHtwcmV2aWV3VmFyTmFtZX0gPSAke3NvdXJjZUF0dHJ9ICE9PSAnbWFudWFsJyA/ICgke3Jlc29sdmVkVmFyTmFtZX0gPz8gW10pIDogKCR7YXR0ck5hbWV9ID8/IFtdKTtcbiAgICBjb25zdCAke3Jlc29sdmluZ1Zhck5hbWV9ID0gJHtzb3VyY2VBdHRyfSAhPT0gJ21hbnVhbCcgJiYgJHtyZXNvbHZlZFZhck5hbWV9ID09PSB1bmRlZmluZWQ7XG5gO1xuICAgICAgLy8gVXNlIHByZXZpZXcgdmFyaWFibGUgaW4gdGhlIGdlbmVyYXRlZCBwcmV2aWV3IEpTWCBzbyB0aGUgZWRpdG9yIHNob3dzIHF1ZXJ5L3NlbGVjdCByZXN1bHRzXG4gICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiYCwgJ2cnKTtcbiAgICAgIHByZXZpZXdKc3ggPSBwcmV2aWV3SnN4LnJlcGxhY2UoYXJyYXlWYXJSZWdleCwgcHJldmlld1Zhck5hbWUpO1xuICAgIH1cbiAgICBpZiAocmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMCkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IGlzUHJldmlld0xvYWRpbmcgPSAke3Jlc29sdmluZ0ZsYWdzLmpvaW4oJyB8fCAnKX07XG5gO1xuICAgIH1cbiAgICAvLyBXaGVuIHByZXZpZXcgSlNYIHJlZmVyZW5jZXMgcGFnaW5hdGlvbiAoZnJvbSBIQlMpIGJ1dCBwYWdpbmF0aW9uIGlzIG9ubHkgYnVpbHQgc2VydmVyLXNpZGUsXG4gICAgLy8gZGVmaW5lIGl0IGluIHRoZSBlZGl0IHNvIHRoZSBlZGl0b3IgZG9lc24ndCB0aHJvdyBSZWZlcmVuY2VFcnJvci5cbiAgICBjb25zdCBwcmV2aWV3VXNlc1BhZ2luYXRpb24gPSAvXFxicGFnaW5hdGlvblxcYi8udGVzdChwcmV2aWV3SnN4KTtcbiAgICBjb25zdCBhbnlDb25maWdIYXNQYWdpbmF0aW9uID0gZHluYW1pY0FycmF5Q29uZmlnc1xuICAgICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+ICEoJ2FycmF5VHlwZScgaW4gYykgJiYgISEoYyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pXG4gICAgICA6IGZhbHNlO1xuICAgIGlmIChwcmV2aWV3VXNlc1BhZ2luYXRpb24gJiYgYW55Q29uZmlnSGFzUGFnaW5hdGlvbiAmJiAhZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUuaW5jbHVkZXMoJ2NvbnN0IHBhZ2luYXRpb24nKSkge1xuICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgPSBgICAgIGNvbnN0IHBhZ2luYXRpb24gPSBbXTsgLy8gRWRpdG9yOiBwYWdpbmF0aW9uIGlzIGJ1aWx0IHNlcnZlci1zaWRlIGluIHJlbmRlci5waHBcbmAgKyBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpbnRlcmFjdGl2ZUNhbnZhcyA9IGdlbmVyYXRlSW50ZXJhY3RpdmVDYW52YXNDb2RlKFxuICAgIGNvbXBvbmVudC5pZCxcbiAgICBhdHRyTmFtZXMsXG4gICAgZWRpdG9yQ29uZmlnLFxuICAgIGNvbXBvbmVudC53b3JkcHJlc3MsXG4gICk7XG4gIGlmIChpbnRlcmFjdGl2ZUNhbnZhcykge1xuICAgIHByZXZpZXdKc3ggPSBpbmplY3RDYW52YXNSZWZJbnRvUHJldmlld0pzeChwcmV2aWV3SnN4KTtcbiAgfVxuXG4gIC8vIFdoZW4gdXNpbmcgZHluYW1pYyBwb3N0cywgd3JhcCBwcmV2aWV3IGluIGxvYWRpbmcgc3RhdGVcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgcHJldmlld0NvbnRlbnQgPSByZXNvbHZpbmdGbGFncy5sZW5ndGggPiAwXG4gICAgPyBge2lzUHJldmlld0xvYWRpbmcgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCIke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcgaXMtbG9hZGluZ1wiIHN0eWxlPXt7IG1pbkhlaWdodDogJzEyMHB4JywgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBnYXA6ICc4cHgnIH19PlxuICAgICAgICAgICAgPFNwaW5uZXIgLz5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGNvbG9yOiAndmFyKC0td3AtYWRtaW4tdGhlbWUtY29sb3ItZGFya2VyLCAjMWUxZTFlKScgfX0+e19fKCdMb2FkaW5nIHBvc3Rz4oCmJywgJ2hhbmRvZmYnKX08L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICkgOiAoXG4ke3ByZXZpZXdKc3h9XG4gICAgICAgICl9YFxuICAgIDogcHJldmlld0pzeDtcblxuICAvLyBDaGVjayB0aGUgZ2VuZXJhdGVkIHByZXZpZXcgZm9yIGNvbXBvbmVudHMgdGhhdCBuZWVkIHRvIGJlIGltcG9ydGVkXG4gIC8vIFRoaXMgY2F0Y2hlcyBjb21wb25lbnRzIGFkZGVkIGJ5IHRoZSBoYW5kbGViYXJzLXRvLWpzeCB0cmFuc3BpbGVyIChlLmcuLCBmcm9tIHt7I2ZpZWxkfX0gbWFya2VycylcbiAgY29uc3QgcHJldmlld1VzZXNSaWNoVGV4dCA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxSaWNoVGV4dCcpO1xuICBjb25zdCBwcmV2aWV3VXNlczEwdXBJbWFnZSA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbWFnZScpO1xuXG4gIC8vIEFkZCBSaWNoVGV4dCB0byBpbXBvcnRzIGlmIHVzZWQgaW4gcHJldmlldyAoYW5kIG5vdCBhbHJlYWR5IGluY2x1ZGVkIGZyb20gcHJvcGVydHkgdHlwZXMpXG4gIGlmICgocHJldmlld1VzZXNSaWNoVGV4dCB8fCBwcmV2aWV3VXNlc0xpbmtGaWVsZCkgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnUmljaFRleHQnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdSaWNoVGV4dCcpO1xuICB9XG5cbiAgLy8gTGlua0NvbnRyb2wgaXMgbmVlZGVkIGZvciBzaWRlYmFyIGxpbmsvYnV0dG9uIHByb3BlcnR5IHBhbmVsczsgYWRkIHVuY29uZGl0aW9uYWxseSB3aGVuIHByZXNlbnQuXG4gIC8vIChIYW5kb2ZmTGlua0ZpZWxkIGluIHRoZSBwcmV2aWV3IGlzIHNlcGFyYXRlIOKAlCBpdCdzIGltcG9ydGVkIGZyb20gdGhlIHNoYXJlZCBjb21wb25lbnQgYW5kIGhhbmRsZXMgaXRzIG93biBMaW5rQ29udHJvbCBpbnRlcm5hbGx5LilcbiAgaWYgKG5lZWRzTGlua0NvbnRyb2wpIHtcbiAgICBpZiAoIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnTGlua0NvbnRyb2wnKSkgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0xpbmtDb250cm9sJyk7XG4gICAgaWYgKCFjb21wb25lbnRJbXBvcnRzLmluY2x1ZGVzKCdQb3BvdmVyJykpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnUG9wb3ZlcicpO1xuICB9XG5cbiAgLy8gQWRkIElubmVyQmxvY2tzIGlmIHVzZWQgaW4gcHJldmlldyBidXQgbm90IGFscmVhZHkgaW1wb3J0ZWRcbiAgY29uc3QgcHJldmlld1VzZXNJbm5lckJsb2NrcyA9IHByZXZpZXdKc3guaW5jbHVkZXMoJzxJbm5lckJsb2NrcycpO1xuICBpZiAocHJldmlld1VzZXNJbm5lckJsb2NrcyAmJiAhYmxvY2tFZGl0b3JJbXBvcnRzLmluY2x1ZGVzKCdJbm5lckJsb2NrcycpKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cblxuICAvLyBCdWlsZCB0aGUgMTB1cCBpbXBvcnQgaWYgbmVlZGVkIChJbWFnZSBmb3IgcHJldmlldywgUmVwZWF0ZXIgZm9yIGFycmF5cylcbiAgaWYgKHByZXZpZXdVc2VzMTB1cEltYWdlKSB7XG4gICAgdGVuVXBJbXBvcnRzLnB1c2goJ0ltYWdlJyk7XG4gIH1cbiAgY29uc3QgdGVuVXBJbXBvcnQgPSB0ZW5VcEltcG9ydHMubGVuZ3RoID4gMFxuICAgID8gYGltcG9ydCB7ICR7dGVuVXBJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQDEwdXAvYmxvY2stY29tcG9uZW50cyc7XFxuYFxuICAgIDogJyc7XG5cbiAgLy8gQ29sbGVjdCBhbGwgaW1hZ2UgZmllbGRzIGZvciBCbG9ja0NvbnRyb2xzL01lZGlhUmVwbGFjZUZsb3dcbiAgaW50ZXJmYWNlIEltYWdlRmllbGRJbmZvIHtcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGF0dHJQYXRoOiBzdHJpbmc7ICAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQuaW1hZ2UnXG4gICAgdmFsdWVFeHByOiBzdHJpbmc7IC8vIGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdsZWZ0Q2FyZD8uaW1hZ2UnXG4gICAgdXBkYXRlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnc2V0QXR0cmlidXRlcyh7IGJhY2tncm91bmRJbWFnZTogLi4uIH0pJyBvciBuZXN0ZWQgdXBkYXRlXG4gIH1cbiAgXG4gIGNvbnN0IGltYWdlRmllbGRzOiBJbWFnZUZpZWxkSW5mb1tdID0gW107XG4gIFxuICBjb25zdCBjb2xsZWN0SW1hZ2VGaWVsZHMgPSAocHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sIHBhcmVudFBhdGg6IHN0cmluZyA9ICcnLCBwYXJlbnRWYWx1ZVBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhwcm9wcykpIHtcbiAgICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gcGFyZW50UGF0aCA/IGAke3BhcmVudFBhdGh9LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgY29uc3QgY3VycmVudFZhbHVlUGF0aCA9IHBhcmVudFZhbHVlUGF0aCA/IGAke3BhcmVudFZhbHVlUGF0aH0/LiR7YXR0ck5hbWV9YCA6IGF0dHJOYW1lO1xuICAgICAgXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gcHJvcC5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG4gICAgICAgIGxldCB1cGRhdGVFeHByOiBzdHJpbmc7XG4gICAgICAgIFxuICAgICAgICBpZiAocGFyZW50UGF0aCkge1xuICAgICAgICAgIC8vIE5lc3RlZCBpbWFnZSBmaWVsZCAtIG5lZWQgdG8gc3ByZWFkIHBhcmVudCBvYmplY3RcbiAgICAgICAgICBjb25zdCBwYXJlbnRBdHRyID0gcGFyZW50UGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgIGNvbnN0IHBhcmVudENhbWVsID0gdG9DYW1lbENhc2UocGFyZW50QXR0cik7XG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnRDYW1lbH06IHsgLi4uJHtwYXJlbnRDYW1lbH0sICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSB9KWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVG9wLWxldmVsIGltYWdlIGZpZWxkXG4gICAgICAgICAgdXBkYXRlRXhwciA9IGBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX06IHsgaWQ6IG1lZGlhLmlkLCBzcmM6IG1lZGlhLnVybCwgYWx0OiBtZWRpYS5hbHQgfHwgJycgfSB9KWA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGltYWdlRmllbGRzLnB1c2goe1xuICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgIGF0dHJQYXRoOiBjdXJyZW50UGF0aCxcbiAgICAgICAgICB2YWx1ZUV4cHI6IGN1cnJlbnRWYWx1ZVBhdGgsXG4gICAgICAgICAgdXBkYXRlRXhwclxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gUmVjdXJzZSBpbnRvIG9iamVjdCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29sbGVjdEltYWdlRmllbGRzKHByb3AucHJvcGVydGllcywgY3VycmVudFBhdGgsIGN1cnJlbnRWYWx1ZVBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wZXJ0aWVzKTtcbiAgXG4gIC8vIEdlbmVyYXRlIEJsb2NrQ29udHJvbHMgd2l0aCBNZWRpYVJlcGxhY2VGbG93IGZvciBlYWNoIGltYWdlIGZpZWxkXG4gIGNvbnN0IGJsb2NrQ29udHJvbHNKc3ggPSBpbWFnZUZpZWxkcy5sZW5ndGggPiAwID8gYFxuICAgICAgICA8QmxvY2tDb250cm9scyBncm91cD1cIm90aGVyXCI+XG4ke2ltYWdlRmllbGRzLm1hcChmaWVsZCA9PiBgICAgICAgICAgIDxNZWRpYVJlcGxhY2VGbG93XG4gICAgICAgICAgICBtZWRpYUlkPXske2ZpZWxkLnZhbHVlRXhwcn0/LmlkfVxuICAgICAgICAgICAgbWVkaWFVcmw9eyR7ZmllbGQudmFsdWVFeHByfT8uc3JjfVxuICAgICAgICAgICAgYWxsb3dlZFR5cGVzPXtbJ2ltYWdlJ119XG4gICAgICAgICAgICBhY2NlcHQ9XCJpbWFnZS8qXCJcbiAgICAgICAgICAgIG9uU2VsZWN0PXsobWVkaWEpID0+ICR7ZmllbGQudXBkYXRlRXhwcn19XG4gICAgICAgICAgICBuYW1lPXtfXygnJHtmaWVsZC5sYWJlbH0nLCAnaGFuZG9mZicpfVxuICAgICAgICAgIC8+YCkuam9pbignXFxuJyl9XG4gICAgICAgIDwvQmxvY2tDb250cm9scz5gIDogJyc7XG5cbiAgLy8gU2hhcmVkIGNvbXBvbmVudCBpbXBvcnRzIGZvciBkeW5hbWljIGFycmF5cyAoc2VsZWN0b3IgVUkgKyBlZGl0b3IgcHJldmlldyBtYXBwaW5nKVxuICBjb25zdCBzaGFyZWROYW1lZEltcG9ydHM6IHN0cmluZ1tdID0gW107XG4gIGlmIChoYXNEeW5hbWljQXJyYXlzKSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnRHluYW1pY1Bvc3RTZWxlY3RvcicsICdtYXBQb3N0RW50aXR5VG9JdGVtJyk7XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSBzaGFyZWROYW1lZEltcG9ydHMucHVzaCgnQnJlYWRjcnVtYnNTZWxlY3RvcicpO1xuICBpZiAoaGFzVGF4b25vbXlBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1RheG9ub215U2VsZWN0b3InKTtcbiAgaWYgKGhhc1BhZ2luYXRpb25BcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ1BhZ2luYXRpb25TZWxlY3RvcicpO1xuXG4gIGxldCBzaGFyZWRDb21wb25lbnRJbXBvcnQgPSBzaGFyZWROYW1lZEltcG9ydHMubGVuZ3RoXG4gICAgPyBgaW1wb3J0IHsgJHtzaGFyZWROYW1lZEltcG9ydHMuam9pbignLCAnKX0gfSBmcm9tICcuLi8uLi9zaGFyZWQnO1xcbmBcbiAgICA6ICcnO1xuICBjb25zdCBuZWVkc0RhdGFTdG9yZSA9IGhhc0R5bmFtaWNBcnJheXMgfHwgaGFzVGF4b25vbXlBcnJheTtcbiAgaWYgKG5lZWRzRGF0YVN0b3JlKSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgeyB1c2VTZWxlY3Qke2hhc0JyZWFkY3J1bWJzQXJyYXkgPyAnLCBzZWxlY3QnIDogJyd9IH0gZnJvbSAnQHdvcmRwcmVzcy9kYXRhJztcXG5pbXBvcnQgeyBzdG9yZSBhcyBjb3JlRGF0YVN0b3JlIH0gZnJvbSAnQHdvcmRwcmVzcy9jb3JlLWRhdGEnO1xcbmA7XG4gIH1cbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBzaGFyZWRDb21wb25lbnRJbXBvcnQgKz0gYGltcG9ydCBhcGlGZXRjaCBmcm9tICdAd29yZHByZXNzL2FwaS1mZXRjaCc7XFxuYDtcbiAgfVxuXG4gIC8vIEJ1aWxkIGVsZW1lbnQgaW1wb3J0c1xuICBjb25zdCBlbGVtZW50SW1wb3J0cyA9IFsnRnJhZ21lbnQnXTtcbiAgaWYgKGhhc0JyZWFkY3J1bWJzQXJyYXkpIHtcbiAgICBlbGVtZW50SW1wb3J0cy5wdXNoKCd1c2VTdGF0ZScsICd1c2VFZmZlY3QnKTtcbiAgfVxuICBpZiAoaW50ZXJhY3RpdmVDYW52YXMpIHtcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGludGVyYWN0aXZlQ2FudmFzLmVsZW1lbnRJbXBvcnRzKSB7XG4gICAgICBpZiAoIWVsZW1lbnRJbXBvcnRzLmluY2x1ZGVzKGVsKSkgZWxlbWVudEltcG9ydHMucHVzaChlbCk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaW50ZXJhY3RpdmVJbXBvcnQgPVxuICAgIGludGVyYWN0aXZlQ2FudmFzPy5pbXBvcnRMaW5lcyA/IGAke2ludGVyYWN0aXZlQ2FudmFzLmltcG9ydExpbmVzfVxcbmAgOiAnJztcbiAgY29uc3QgaW50ZXJhY3RpdmVIb29rID0gaW50ZXJhY3RpdmVDYW52YXM/Lmhvb2tMaW5lc1xuICAgID8gYCR7aW50ZXJhY3RpdmVDYW52YXMuaG9va0xpbmVzfVxcbmBcbiAgICA6ICcnO1xuXG4gIC8vIEltcG9ydCBzaGFyZWQgSGFuZG9mZkxpbmtGaWVsZCB3aGVuIHByZXZpZXcgdXNlcyBsaW5rL2J1dHRvbiBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBsaW5rRmllbGRJbXBvcnQgPSBwcmV2aWV3VXNlc0xpbmtGaWVsZCA/IGBpbXBvcnQgeyBIYW5kb2ZmTGlua0ZpZWxkIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2NvbXBvbmVudHMvTGlua0ZpZWxkJztcXG5gIDogJyc7XG5cbiAgLy8gU2NyZWVuc2hvdCBpbXBvcnQgZm9yIGluc2VydGVyIHByZXZpZXdcbiAgY29uc3Qgc2NyZWVuc2hvdEltcG9ydCA9IGhhc1NjcmVlbnNob3QgPyBgaW1wb3J0IHNjcmVlbnNob3RVcmwgZnJvbSAnLi9zY3JlZW5zaG90LnBuZyc7XFxuYCA6ICcnO1xuXG4gIC8vIFNWRyBpY29uIGZvciB0aGUgYmxvY2sgKHVuaXF1ZSBwZXIgYmxvY2ssIGNvbG9yZWQgYnkgZ3JvdXApXG4gIGNvbnN0IHN2Z0ljb25TdHIgPSBnZW5lcmF0ZVN2Z0ljb24oY29tcG9uZW50LnRpdGxlLCBjb21wb25lbnQuZ3JvdXApO1xuICBjb25zdCBzdmdJY29uQ29kZSA9IGBjb25zdCBibG9ja0ljb24gPSAoXG4gICR7c3ZnSWNvblN0cn1cbik7YDtcblxuICAvLyBJbnNlcnRlciBwcmV2aWV3OiBzaG93IHNjcmVlbnNob3QgaW1hZ2UgaW5zdGVhZCBvZiBsaXZlLXJlbmRlcmluZ1xuICBjb25zdCBwcmV2aWV3RWFybHlSZXR1cm4gPSBoYXNTY3JlZW5zaG90XG4gICAgPyBgICAgIGlmIChhdHRyaWJ1dGVzLl9fcHJldmlldykge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiB7Li4uYmxvY2tQcm9wc30+XG4gICAgICAgICAgPGltZyBzcmM9e3NjcmVlbnNob3RVcmx9IGFsdD17bWV0YWRhdGEudGl0bGV9IHN0eWxlPXt7IHdpZHRoOiAnMTAwJScsIGhlaWdodDogJ2F1dG8nIH19IC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKTtcbiAgICB9XG5gXG4gICAgOiAnJztcblxuICByZXR1cm4gYGltcG9ydCB7IHJlZ2lzdGVyQmxvY2tUeXBlIH0gZnJvbSAnQHdvcmRwcmVzcy9ibG9ja3MnO1xuaW1wb3J0IHsgXG4gICR7YmxvY2tFZGl0b3JJbXBvcnRzLmpvaW4oJyxcXG4gICcpfSBcbn0gZnJvbSAnQHdvcmRwcmVzcy9ibG9jay1lZGl0b3InO1xuaW1wb3J0IHsgXG4gICR7Y29tcG9uZW50SW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvY29tcG9uZW50cyc7XG5pbXBvcnQgeyBfXyB9IGZyb20gJ0B3b3JkcHJlc3MvaTE4bic7XG5pbXBvcnQgeyAke2VsZW1lbnRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnQHdvcmRwcmVzcy9lbGVtZW50JztcbiR7dGVuVXBJbXBvcnR9JHtzaGFyZWRDb21wb25lbnRJbXBvcnR9aW1wb3J0IG1ldGFkYXRhIGZyb20gJy4vYmxvY2suanNvbic7XG5pbXBvcnQgJy4vZWRpdG9yLnNjc3MnO1xuJHtoYXNEeW5hbWljQXJyYXlzID8gXCJpbXBvcnQgJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0R5bmFtaWNQb3N0U2VsZWN0b3IuZWRpdG9yLnNjc3MnO1xcblwiIDogJyd9aW1wb3J0ICcuL3N0eWxlLnNjc3MnO1xuJHtzY3JlZW5zaG90SW1wb3J0fSR7aW50ZXJhY3RpdmVJbXBvcnR9JHtsaW5rRmllbGRJbXBvcnR9XG4ke3N2Z0ljb25Db2RlfVxuXG4ke2RlcHJlY2F0aW9uc0NvZGUgPyBgJHtkZXByZWNhdGlvbnNDb2RlfVxcblxcbmAgOiAnJ31yZWdpc3RlckJsb2NrVHlwZShtZXRhZGF0YS5uYW1lLCB7XG4gIC4uLm1ldGFkYXRhLFxuICBpY29uOiBibG9ja0ljb24sJHtkZXByZWNhdGlvbnNDb2RlID8gJ1xcbiAgZGVwcmVjYXRlZCwnIDogJyd9XG4gIGVkaXQ6ICh7IGF0dHJpYnV0ZXMsIHNldEF0dHJpYnV0ZXMsIGlzU2VsZWN0ZWQgfSkgPT4ge1xuICAgIGNvbnN0IGJsb2NrUHJvcHMgPSB1c2VCbG9ja1Byb3BzKCk7XG4ke3ByZXZpZXdFYXJseVJldHVybn0ke3VzZUlubmVyQmxvY2tzIHx8IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyBcIiAgICBjb25zdCBDT05URU5UX0JMT0NLUyA9IFsnY29yZS9wYXJhZ3JhcGgnLCdjb3JlL2hlYWRpbmcnLCdjb3JlL2xpc3QnLCdjb3JlL2xpc3QtaXRlbScsJ2NvcmUvcXVvdGUnLCdjb3JlL2ltYWdlJywnY29yZS9zZXBhcmF0b3InLCdjb3JlL2h0bWwnLCdjb3JlL2J1dHRvbnMnLCdjb3JlL2J1dHRvbiddO1wiIDogJyd9XG4gICAgY29uc3QgeyAke2F0dHJOYW1lcy5qb2luKCcsICcpfSB9ID0gYXR0cmlidXRlcztcbiR7ZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGV9XG4ke2FycmF5SGVscGVyc31cbiR7aW50ZXJhY3RpdmVIb29rfSAgICByZXR1cm4gKFxuICAgICAgPEZyYWdtZW50PlxuICAgICAgICA8SW5zcGVjdG9yQ29udHJvbHM+XG4ke3BhbmVscy5qb2luKCdcXG5cXG4nKX1cbiAgICAgICAgPC9JbnNwZWN0b3JDb250cm9scz5cbiR7YmxvY2tDb250cm9sc0pzeH1cblxuICAgICAgICB7LyogRWRpdG9yIFByZXZpZXcgKi99XG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuJHtwcmV2aWV3Q29udGVudH1cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L0ZyYWdtZW50PlxuICAgICk7XG4gIH0sXG4gIHNhdmU6ICgpID0+IHtcbiR7dXNlSW5uZXJCbG9ja3MgfHwgcHJldmlld1VzZXNJbm5lckJsb2NrcyA/ICcgICAgLy8gSW5uZXJCbG9ja3MgY29udGVudCBtdXN0IGJlIHNhdmVkIHNvIGl0IGlzIHBlcnNpc3RlZCBpbiBwb3N0IGNvbnRlbnRcXG4gICAgcmV0dXJuIDxJbm5lckJsb2Nrcy5Db250ZW50IC8+OycgOiAnICAgIC8vIFNlcnZlci1zaWRlIHJlbmRlcmluZyB2aWEgcmVuZGVyLnBocFxcbiAgICByZXR1cm4gbnVsbDsnfVxuICB9LFxufSk7XG5gO1xufTtcblxuZXhwb3J0IHtcbiAgZ2VuZXJhdGVJbmRleEpzLFxuICBnZW5lcmF0ZVN2Z0ljb24sXG4gIHRvVGl0bGVDYXNlLFxuICBnZW5lcmF0ZUZpZWxkQ29udHJvbCxcbiAgZ2VuZXJhdGVBcnJheUNvbnRyb2wsXG4gIGdlbmVyYXRlUHJvcGVydHlDb250cm9sLFxuICBpc09wYWNpdHlSYW5nZUZpZWxkLFxuICBnZXROdW1iZXJDb250cm9sU3BlYyxcbiAgaGFzT3BhY2l0eVJhbmdlRmllbGQsXG4gIGhhc05vbk9wYWNpdHlOdW1iZXJGaWVsZCxcbn07XG5leHBvcnQgdHlwZSB7IEZpZWxkQ29udGV4dCwgTnVtYmVyQ29udHJvbFNwZWMgfTtcbiJdfQ==