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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtanMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9pbmRleC1qcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILG9DQUF5TztBQUN6TyxtREFBOEY7QUFDOUYsNkNBQTJDO0FBQzNDLDJEQUFzRTtBQUN0RSw2REFHOEI7QUFDOUIscURBQXdHO0FBQ3hHLDZDQUE4QztBQUU5Qzs7R0FFRztBQUNILE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7SUFDMUMsT0FBTyxHQUFHO1NBQ1AsS0FBSyxDQUFDLEdBQUcsQ0FBQztTQUNWLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN6RCxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDZixDQUFDLENBQUM7QUE4K0NBLGtDQUFXO0FBejlDYixNQUFNLGtCQUFrQixHQUFHLENBQUMsUUFBZ0IsRUFBRSxRQUF5QixFQUFVLEVBQUUsQ0FDakYsR0FBRyxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksSUFBSSxFQUFFLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUVuRiw2REFBNkQ7QUFDN0QsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLFFBQWdCLEVBQUUsUUFBeUIsRUFBVyxFQUFFO0lBQ25GLE1BQU0sR0FBRyxHQUFHLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNuRCxPQUFPLHNDQUFzQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxRCxDQUFDLENBQUM7QUFzOUNBLGtEQUFtQjtBQXA5Q3JCLG9FQUFvRTtBQUNwRSxNQUFNLG9CQUFvQixHQUFHLENBQUMs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LENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFUCxPQUFPOztJQUVMLGtCQUFrQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7OztJQUdoQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDOzs7V0FHdkIsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDbEMsV0FBVyxHQUFHLHFCQUFxQjs7RUFFbkMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLHFFQUFxRSxDQUFDLENBQUMsQ0FBQyxFQUFFO0VBQzdGLGdCQUFnQixHQUFHLGlCQUFpQixHQUFHLGVBQWU7RUFDdEQsV0FBVzs7RUFFWCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFOztvQkFFL0IsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFOzs7RUFHM0Qsa0JBQWtCLEdBQUcsY0FBYyxJQUFJLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxnTEFBZ0wsQ0FBQyxDQUFDLENBQUMsRUFBRTtjQUN6TyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztFQUNoQywwQkFBMEI7RUFDMUIsWUFBWTtFQUNaLGVBQWU7OztFQUdmLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDOztFQUVuQixnQkFBZ0I7Ozs7RUFJaEIsY0FBYzs7Ozs7O0VBTWQsY0FBYyxJQUFJLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxrSEFBa0gsQ0FBQyxDQUFDLENBQUMsK0RBQStEOzs7Q0FHaE8sQ0FBQztBQUNGLENBQUMsQ0FBQztBQUdBLDBDQUFlIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBHZW5lcmF0ZXMgaW5kZXguanMgZm9yIEd1dGVuYmVyZyBibG9jayBlZGl0b3JcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHksIER5bmFtaWNBcnJheUNvbmZpZywgQnJlYWRjcnVtYnNBcnJheUNvbmZpZywgVGF4b25vbXlBcnJheUNvbmZpZywgUGFnaW5hdGlvbkFycmF5Q29uZmlnLCBJdGVtT3ZlcnJpZGVGaWVsZENvbmZpZywgaXNCcmVhZGNydW1ic0NvbmZpZywgaXNUYXhvbm9teUNvbmZpZywgaXNQYWdpbmF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZ2V0QnV0dG9uRGVmYXVsdCwgcmVzb2x2ZUJ1dHRvbkZpZWxkS2V5cywgYnV0dG9uTGlua01lcmdlSnMgfSBmcm9tICcuL2J1dHRvbi1zY2hlbWEnO1xuaW1wb3J0IHsgdG9CbG9ja05hbWUgfSBmcm9tICcuL2Jsb2NrLWpzb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVKc3hQcmV2aWV3LCB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gnO1xuaW1wb3J0IHtcbiAgZ2VuZXJhdGVJbnRlcmFjdGl2ZUNhbnZhc0NvZGUsXG4gIGluamVjdENhbnZhc1JlZkludG9QcmV2aWV3SnN4LFxufSBmcm9tICcuL2ludGVyYWN0aXZlLWNhbnZhcyc7XG5pbXBvcnQgeyBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vaGFuZGxlYmFycy10by1qc3gvdXRpbHMnO1xuaW1wb3J0IHsgYnVpbGRSZXNoYXBlSnMgfSBmcm9tICcuL3JlbmRlci1waHAnO1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBUaXRsZSBDYXNlXG4gKi9cbmNvbnN0IHRvVGl0bGVDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0clxuICAgIC5zcGxpdCgnXycpXG4gICAgLm1hcCh3b3JkID0+IHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpKVxuICAgIC5qb2luKCcgJyk7XG59O1xuXG4vKipcbiAqIENvbnRleHQgZm9yIGdlbmVyYXRpbmcgZmllbGQgY29udHJvbHMgLSBkZXRlcm1pbmVzIGhvdyB2YWx1ZXMgYXJlIGFjY2Vzc2VkIGFuZCB1cGRhdGVkXG4gKi9cbmludGVyZmFjZSBGaWVsZENvbnRleHQge1xuICAvKiogVGhlIHZhcmlhYmxlIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgdmFsdWUgKGUuZy4sICdiYWNrZ3JvdW5kSW1hZ2UnIG9yICdpdGVtLmltYWdlJykgKi9cbiAgdmFsdWVBY2Nlc3Nvcjogc3RyaW5nO1xuICAvKiogVGhlIG9uQ2hhbmdlIGhhbmRsZXIgY29kZSAoZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyB4OiB2YWx1ZSB9KScgb3IgJ3VwZGF0ZUl0ZW1zKGluZGV4LCBcInhcIiwgdmFsdWUpJykgKi9cbiAgb25DaGFuZ2VIYW5kbGVyOiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xuICAvKiogQmFzZSBpbmRlbnRhdGlvbiAqL1xuICBpbmRlbnQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE51bWJlckNvbnRyb2xTcGVjIHtcbiAgdXNlUmFuZ2U6IGJvb2xlYW47XG4gIG1pbj86IG51bWJlcjtcbiAgbWF4PzogbnVtYmVyO1xuICBzdGVwPzogbnVtYmVyO1xufVxuXG5jb25zdCBmaWVsZExhYmVsSGF5c3RhY2sgPSAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IHN0cmluZyA9PlxuICBgJHtmaWVsZEtleX0gJHtwcm9wZXJ0eS5uYW1lID8/ICcnfSAke3Byb3BlcnR5LmRlc2NyaXB0aW9uID8/ICcnfWAudG9Mb3dlckNhc2UoKTtcblxuLyoqIE9wYWNpdHkgLyBvdmVybGF5IGFscGhhIGZpZWxkcyB1c2UgYSAw4oCTMSByYW5nZSBzbGlkZXIuICovXG5jb25zdCBpc09wYWNpdHlSYW5nZUZpZWxkID0gKGZpZWxkS2V5OiBzdHJpbmcsIHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpOiBib29sZWFuID0+IHtcbiAgY29uc3QgaGF5ID0gZmllbGRMYWJlbEhheXN0YWNrKGZpZWxkS2V5LCBwcm9wZXJ0eSk7XG4gIHJldHVybiAvb3BhY2l0eXxvdmVybGF5XFxzKm9wYWNpdHl8XFxiYWxwaGFcXGIvaS50ZXN0KGhheSk7XG59O1xuXG4vKiogUmVzb2x2ZSBlZGl0b3IgY29udHJvbCB0eXBlIGFuZCBib3VuZHMgZm9yIGEgbnVtYmVyIHByb3BlcnR5LiAqL1xuY29uc3QgZ2V0TnVtYmVyQ29udHJvbFNwZWMgPSAoZmllbGRLZXk6IHN0cmluZywgcHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IE51bWJlckNvbnRyb2xTcGVjID0+IHtcbiAgaWYgKGlzT3BhY2l0eVJhbmdlRmllbGQoZmllbGRLZXksIHByb3BlcnR5KSkge1xuICAgIHJldHVybiB7IHVzZVJhbmdlOiB0cnVlLCBtaW46IDAsIG1heDogMSwgc3RlcDogMC4wMSB9O1xuICB9XG5cbiAgY29uc3QgaGF5ID0gZmllbGRMYWJlbEhheXN0YWNrKGZpZWxkS2V5LCBwcm9wZXJ0eSk7XG4gIGNvbnN0IGtleUhheSA9IGAke2ZpZWxkS2V5fSAke3Byb3BlcnR5Lm5hbWUgPz8gJyd9YC50b0xvd2VyQ2FzZSgpO1xuXG4gIGlmICgvXFxibGF0KGl0dWRlKT9cXGIvaS50ZXN0KGtleUhheSkgfHwgL1xcYmxhdChpdHVkZSk/XFxiL2kudGVzdChoYXkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IGZhbHNlLCBtaW46IC05MCwgbWF4OiA5MCwgc3RlcDogMC4wMDAwMDEgfTtcbiAgfVxuICBpZiAoL1xcYmxuZ1xcYnxcXGJsb24oZ2l0dWRlKT9cXGIvaS50ZXN0KGtleUhheSkgfHwgL1xcYmxuZ1xcYnxcXGJsb24oZ2l0dWRlKT9cXGIvaS50ZXN0KGhheSkpIHtcbiAgICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIG1pbjogLTE4MCwgbWF4OiAxODAsIHN0ZXA6IDAuMDAwMDAxIH07XG4gIH1cbiAgaWYgKC9cXGJ6b29tXFxiL2kudGVzdChrZXlIYXkpIHx8IC9cXGJ6b29tXFxiL2kudGVzdChoYXkpKSB7XG4gICAgcmV0dXJuIHsgdXNlUmFuZ2U6IGZhbHNlLCBtaW46IDEsIG1heDogMjEsIHN0ZXA6IDEgfTtcbiAgfVxuXG4gIGNvbnN0IGRlZmF1bHRJc0ludGVnZXIgPVxuICAgIHR5cGVvZiBwcm9wZXJ0eS5kZWZhdWx0ID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNJbnRlZ2VyKHByb3BlcnR5LmRlZmF1bHQpO1xuICByZXR1cm4geyB1c2VSYW5nZTogZmFsc2UsIHN0ZXA6IGRlZmF1bHRJc0ludGVnZXIgPyAxIDogdW5kZWZpbmVkIH07XG59O1xuXG5jb25zdCB3YWxrTnVtYmVyRmllbGRzID0gKFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBwcmVkaWNhdGU6IChmaWVsZEtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KSA9PiBib29sZWFuXG4pOiBib29sZWFuID0+IHtcbiAgY29uc3QgY2hlY2sgPSAocHJvcDogSGFuZG9mZlByb3BlcnR5LCBmaWVsZEtleTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ251bWJlcicgJiYgcHJlZGljYXRlKGZpZWxkS2V5LCBwcm9wKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHByb3AucHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PiBjaGVjayhwLCBrKSk7XG4gICAgfVxuICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHByb3AuaXRlbXMucHJvcGVydGllcykuc29tZSgoW2ssIHBdKSA9PiBjaGVjayhwLCBrKSk7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbiAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT4gY2hlY2socCwgaykpO1xufTtcblxuY29uc3QgaGFzT3BhY2l0eVJhbmdlRmllbGQgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IGJvb2xlYW4gPT5cbiAgd2Fsa051bWJlckZpZWxkcyhwcm9wZXJ0aWVzLCBpc09wYWNpdHlSYW5nZUZpZWxkKTtcblxuY29uc3QgaGFzTm9uT3BhY2l0eU51bWJlckZpZWxkID0gKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4pOiBib29sZWFuID0+XG4gIHdhbGtOdW1iZXJGaWVsZHMocHJvcGVydGllcywgKGZpZWxkS2V5LCBwcm9wZXJ0eSkgPT4gIWlzT3BhY2l0eVJhbmdlRmllbGQoZmllbGRLZXksIHByb3BlcnR5KSk7XG5cbi8qKlxuICogR2VuZXJhdGUgYSBmaWVsZCBjb250cm9sIGZvciBhbnkgcHJvcGVydHkgdHlwZSAtIHVuaWZpZWQgZnVuY3Rpb24gZm9yIGJvdGggdG9wLWxldmVsIGFuZCBuZXN0ZWQgZmllbGRzXG4gKi9cbmNvbnN0IGdlbmVyYXRlRmllbGRDb250cm9sID0gKFxuICBmaWVsZEtleTogc3RyaW5nLFxuICBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LFxuICBjb250ZXh0OiBGaWVsZENvbnRleHRcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHsgdmFsdWVBY2Nlc3Nvciwgb25DaGFuZ2VIYW5kbGVyLCBpbmRlbnQgfSA9IGNvbnRleHQ7XG4gIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShmaWVsZEtleSk7XG5cbiAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgY2FzZSAndGV4dCc6IHtcbiAgICAgIGNvbnN0IGlzV2lzdGlhVGV4dEZpZWxkID0gL1xcYndpc3RpYVxcYi9pLnRlc3QoYCR7ZmllbGRLZXl9ICR7bGFiZWx9ICR7cHJvcGVydHkuZGVzY3JpcHRpb24gPz8gJyd9YCk7XG5cbiAgICAgIGlmIChpc1dpc3RpYVRleHRGaWVsZCkge1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgeygoKSA9PiB7XG4ke2luZGVudH0gICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZygke3ZhbHVlQWNjZXNzb3J9IHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICBpZiAoIXdpc3RpYUlkKSB7XG4ke2luZGVudH0gICAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxNnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlcjogJzFweCBkYXNoZWQgI2NiZDVlMScsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnIzQ3NTU2OScsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2Y4ZmFmYycsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIHtfXygnQWRkIGEgV2lzdGlhIHZpZGVvIElEIHRvIHByZXZpZXcgdGhpcyB2aWRlby4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICk7XG4ke2luZGVudH0gICAgfVxuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiR7aW5kZW50fSAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXG4ke2luZGVudH0gICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgYmFja2dyb3VuZDogJyMwZjE3MmEnLFxuJHtpbmRlbnR9ICAgICAgICAgIGFzcGVjdFJhdGlvOiAnMTYgLyA5JyxcbiR7aW5kZW50fSAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAgPGltZ1xuJHtpbmRlbnR9ICAgICAgICAgIHNyYz17XFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0vc3dhdGNoXFxgfVxuJHtpbmRlbnR9ICAgICAgICAgIGFsdD17X18oJ1dpc3RpYSB2aWRlbyBwcmV2aWV3JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInLCBkaXNwbGF5OiAnYmxvY2snIH19XG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4ke2luZGVudH0gICAgICAgICAgICBpbnNldDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGFsaWduSXRlbXM6ICdmbGV4LWVuZCcsXG4ke2luZGVudH0gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZ2FwOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnbGluZWFyLWdyYWRpZW50KDE4MGRlZywgcmdiYSgxNSwgMjMsIDQyLCAwLjEyKSAwJSwgcmdiYSgxNSwgMjMsIDQyLCAwLjcpIDEwMCUpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBhcmlhLWhpZGRlbj1cInRydWVcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgd2lkdGg6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgaGVpZ2h0OiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI0KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tkcm9wRmlsdGVyOiAnYmx1cigxMHB4KScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgICAgd2lkdGg6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgaGVpZ2h0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIG1hcmdpbkxlZnQ6ICc0cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlclRvcDogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJMZWZ0OiAnMTRweCBzb2xpZCAjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWluSGVpZ2h0OiAnMzJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIHBhZGRpbmc6ICc2cHggMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC41OCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250U2l6ZTogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250V2VpZ2h0OiA2MDAsXG4ke2luZGVudH0gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6ICcwLjAyZW0nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7d2lzdGlhSWR9XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICk7XG4ke2luZGVudH0gIH0pKCl9XG4ke2luZGVudH08L0ZsZXg+YDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGAke2luZGVudH08VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0vPmA7XG4gICAgfVxuXG4gICAgY2FzZSAncmljaHRleHQnOlxuICAgICAgLy8gSW5zaWRlIGFuIGFycmF5IGl0ZW0sIElubmVyQmxvY2tzIGNhbid0IGJlIHVzZWQg4oCUIHByb3ZpZGUgYSB0ZXh0YXJlYVxuICAgICAgaWYgKHZhbHVlQWNjZXNzb3Iuc3RhcnRzV2l0aCgnaXRlbS4nKSkge1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0YXJlYUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcigndmFsdWUnKX19XG4ke2luZGVudH0gIHJvd3M9ezR9XG4ke2luZGVudH0vPmA7XG4gICAgICB9XG4gICAgICAvLyBUb3AtbGV2ZWwgcmljaHRleHQgdXNlcyBJbm5lckJsb2NrcyBvbiB0aGUgY2FudmFzIOKAkyBubyBzaWRlYmFyIGNvbnRyb2wgbmVlZGVkXG4gICAgICByZXR1cm4gJyc7XG5cbiAgICBjYXNlICdudW1iZXInOiB7XG4gICAgICBjb25zdCBzcGVjID0gZ2V0TnVtYmVyQ29udHJvbFNwZWMoZmllbGRLZXksIHByb3BlcnR5KTtcbiAgICAgIGlmIChzcGVjLnVzZVJhbmdlKSB7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PFJhbmdlQ29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gPz8gMH1cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3ZhbHVlJyl9fVxuJHtpbmRlbnR9ICBtaW49eyR7c3BlYy5taW4gPz8gMH19XG4ke2luZGVudH0gIG1heD17JHtzcGVjLm1heCA/PyAxfX1cbiR7aW5kZW50fSAgc3RlcD17JHtzcGVjLnN0ZXAgPz8gMC4wMX19XG4ke2luZGVudH0vPmA7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGJvdW5kTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBpZiAoc3BlYy5taW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBib3VuZExpbmVzLnB1c2goYCR7aW5kZW50fSAgbWluPXske3NwZWMubWlufX1gKTtcbiAgICAgIH1cbiAgICAgIGlmIChzcGVjLm1heCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJvdW5kTGluZXMucHVzaChgJHtpbmRlbnR9ICBtYXg9eyR7c3BlYy5tYXh9fWApO1xuICAgICAgfVxuICAgICAgaWYgKHNwZWMuc3RlcCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJvdW5kTGluZXMucHVzaChgJHtpbmRlbnR9ICBzdGVwPXske3NwZWMuc3RlcH19YCk7XG4gICAgICB9XG4gICAgICBjb25zdCBib3VuZHMgPSBib3VuZExpbmVzLmxlbmd0aCA/IGBcXG4ke2JvdW5kTGluZXMuam9pbignXFxuJyl9YCA6ICcnO1xuICAgICAgY29uc3QgcGFyc2VFeHByID1cbiAgICAgICAgc3BlYy5zdGVwICE9PSB1bmRlZmluZWQgJiYgc3BlYy5zdGVwID49IDEgJiYgTnVtYmVyLmlzSW50ZWdlcihzcGVjLnN0ZXApXG4gICAgICAgICAgPyBcInZhbHVlID09PSAnJyA/IDAgOiBwYXJzZUludCh2YWx1ZSwgMTApIHx8IDBcIlxuICAgICAgICAgIDogXCJ2YWx1ZSA9PT0gJycgPyAwIDogcGFyc2VGbG9hdCh2YWx1ZSkgfHwgMFwiO1xuXG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdHlwZT1cIm51bWJlclwiXG4ke2luZGVudH0gIHZhbHVlPXt0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ251bWJlcicgPyBTdHJpbmcoJHt2YWx1ZUFjY2Vzc29yfSkgOiAnJ31cbiR7aW5kZW50fSAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIocGFyc2VFeHByKX19XG4ke2JvdW5kc31cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIGNoZWNrZWQ9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgZmFsc2V9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcblxuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIC8vIFVzZSAnc3JjJyBpbnN0ZWFkIG9mICd1cmwnIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmcgY29udmVudGlvblxuICAgICAgcmV0dXJuIGAke2luZGVudH08TWVkaWFVcGxvYWRDaGVjaz5cbiR7aW5kZW50fSAgPE1lZGlhVXBsb2FkXG4ke2luZGVudH0gICAgb25TZWxlY3Q9eyhtZWRpYSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoJ3sgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8IFxcJ1xcJyB9Jyl9fVxuJHtpbmRlbnR9ICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5zcmN9XG4ke2luZGVudH0gICAgcmVuZGVyPXsoeyBvcGVuIH0pID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17M30+XG4ke2luZGVudH0gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgeyR7dmFsdWVBY2Nlc3Nvcn0/LnNyYyAmJiAoXG4ke2luZGVudH0gICAgICAgICAgPGltZyBcbiR7aW5kZW50fSAgICAgICAgICAgIHNyYz17JHt2YWx1ZUFjY2Vzc29yfT8uc3JjfSBcbiR7aW5kZW50fSAgICAgICAgICAgIGFsdD17JHt2YWx1ZUFjY2Vzc29yfT8uYWx0IHx8ICcnfVxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3sgbWF4V2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnYXV0bycgfX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uIG9uQ2xpY2s9e29wZW59IHZhcmlhbnQ9XCJzZWNvbmRhcnlcIiBzaXplPVwic21hbGxcIj5cbiR7aW5kZW50fSAgICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjID8gX18oJ1JlcGxhY2UgJHtsYWJlbH0nLCAnaGFuZG9mZicpIDogX18oJ1NlbGVjdCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICB7JHt2YWx1ZUFjY2Vzc29yfT8uc3JjICYmIChcbiR7aW5kZW50fSAgICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiAke29uQ2hhbmdlSGFuZGxlcigneyBzcmM6IFxcJ1xcJywgYWx0OiBcXCdcXCcgfScpfX1cbiR7aW5kZW50fSAgICAgICAgICAgIHZhcmlhbnQ9XCJsaW5rXCJcbiR7aW5kZW50fSAgICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgICAge19fKCdSZW1vdmUnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIDwvQnV0dG9uPlxuJHtpbmRlbnR9ICAgICAgICApfVxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICl9XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH08L01lZGlhVXBsb2FkQ2hlY2s+YDtcblxuICAgIGNhc2UgJ3ZpZGVvJzpcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgdmFsdWU9e3R5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJyA/ICR7dmFsdWVBY2Nlc3Nvcn0gOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiB7XG4ke2luZGVudH0gICAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgICBjb25zdCBtZWRpYU1hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvKD86bWVkaWFzfGlmcmFtZSlcXFxcLyhbQS1aYS16MC05XSspL2kpO1xuJHtpbmRlbnR9ICAgICAgY29uc3QgZmFsbGJhY2tNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goL14oW0EtWmEtejAtOV0rPykoPzpcXFxcLmpzb25wKT8kLyk7XG4ke2luZGVudH0gICAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH0gICAgICAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4oJHt2YWx1ZUFjY2Vzc29yfSAmJiB0eXBlb2YgJHt2YWx1ZUFjY2Vzc29yfSA9PT0gJ29iamVjdCcgPyAke3ZhbHVlQWNjZXNzb3J9IDoge30pLCBpZDogd2lzdGlhSWQsIHNyYzogd2lzdGlhSWQgPyBcXGBodHRwczovL2Zhc3Qud2lzdGlhLmNvbS9lbWJlZC9tZWRpYXMvXFwke3dpc3RpYUlkfS5qc29ucFxcYCA6IG5vcm1hbGl6ZWQgfWApfVxuJHtpbmRlbnR9ICAgIH19XG4ke2luZGVudH0gIC8+XG4ke2luZGVudH0gIHsoKCkgPT4ge1xuJHtpbmRlbnR9ICAgIGNvbnN0IHJhd1ZhbHVlID1cbiR7aW5kZW50fSAgICAgIHR5cGVvZiAke3ZhbHVlQWNjZXNzb3J9ID09PSAnc3RyaW5nJ1xuJHtpbmRlbnR9ICAgICAgICA/ICR7dmFsdWVBY2Nlc3Nvcn1cbiR7aW5kZW50fSAgICAgICAgOiAoJHt2YWx1ZUFjY2Vzc29yfT8uaWQgfHwgJHt2YWx1ZUFjY2Vzc29yfT8uc3JjIHx8ICcnKTtcbiR7aW5kZW50fSAgICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHJhd1ZhbHVlIHx8ICcnKS50cmltKCk7XG4ke2luZGVudH0gICAgY29uc3QgbWVkaWFNYXRjaCA9IG5vcm1hbGl6ZWQubWF0Y2goLyg/Om1lZGlhc3xpZnJhbWUpXFxcXC8oW0EtWmEtejAtOV0rKS9pKTtcbiR7aW5kZW50fSAgICBjb25zdCBmYWxsYmFja01hdGNoID0gbm9ybWFsaXplZC5tYXRjaCgvXihbQS1aYS16MC05XSs/KSg/OlxcXFwuanNvbnApPyQvKTtcbiR7aW5kZW50fSAgICBjb25zdCB3aXN0aWFJZCA9IG1lZGlhTWF0Y2g/LlsxXSB8fCBmYWxsYmFja01hdGNoPy5bMV0gfHwgJyc7XG4ke2luZGVudH1cbiR7aW5kZW50fSAgICBpZiAoIXdpc3RpYUlkKSB7XG4ke2luZGVudH0gICAgICByZXR1cm4gKFxuJHtpbmRlbnR9ICAgICAgICA8ZGl2XG4ke2luZGVudH0gICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgIHBhZGRpbmc6ICcxNnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGJvcmRlcjogJzFweCBkYXNoZWQgI2NiZDVlMScsXG4ke2luZGVudH0gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnIzQ3NTU2OScsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2Y4ZmFmYycsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIHtfXygnQWRkIGEgV2lzdGlhIHZpZGVvIElEIHRvIHByZXZpZXcgdGhpcyB2aWRlby4nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICk7XG4ke2luZGVudH0gICAgfVxuJHtpbmRlbnR9XG4ke2luZGVudH0gICAgcmV0dXJuIChcbiR7aW5kZW50fSAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiR7aW5kZW50fSAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXG4ke2luZGVudH0gICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgYmFja2dyb3VuZDogJyMwZjE3MmEnLFxuJHtpbmRlbnR9ICAgICAgICAgIGFzcGVjdFJhdGlvOiAnMTYgLyA5JyxcbiR7aW5kZW50fSAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgID5cbiR7aW5kZW50fSAgICAgICAgPGltZ1xuJHtpbmRlbnR9ICAgICAgICAgIHNyYz17XFxgaHR0cHM6Ly9mYXN0Lndpc3RpYS5jb20vZW1iZWQvbWVkaWFzL1xcJHt3aXN0aWFJZH0vc3dhdGNoXFxgfVxuJHtpbmRlbnR9ICAgICAgICAgIGFsdD17X18oJ1dpc3RpYSB2aWRlbyBwcmV2aWV3JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInLCBkaXNwbGF5OiAnYmxvY2snIH19XG4ke2luZGVudH0gICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgIDxkaXZcbiR7aW5kZW50fSAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4ke2luZGVudH0gICAgICAgICAgICBpbnNldDogMCxcbiR7aW5kZW50fSAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgIGFsaWduSXRlbXM6ICdmbGV4LWVuZCcsXG4ke2luZGVudH0gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgZ2FwOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICBiYWNrZ3JvdW5kOiAnbGluZWFyLWdyYWRpZW50KDE4MGRlZywgcmdiYSgxNSwgMjMsIDQyLCAwLjEyKSAwJSwgcmdiYSgxNSwgMjMsIDQyLCAwLjcpIDEwMCUpJyxcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4ke2luZGVudH0gICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBhcmlhLWhpZGRlbj1cInRydWVcIlxuJHtpbmRlbnR9ICAgICAgICAgICAgc3R5bGU9e3tcbiR7aW5kZW50fSAgICAgICAgICAgICAgd2lkdGg6ICc0OHB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgaGVpZ2h0OiAnNDhweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1mbGV4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4ke2luZGVudH0gICAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI0KScsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJhY2tkcm9wRmlsdGVyOiAnYmx1cigxMHB4KScsXG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgID5cbiR7aW5kZW50fSAgICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICAgIHN0eWxlPXt7XG4ke2luZGVudH0gICAgICAgICAgICAgICAgd2lkdGg6IDAsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgaGVpZ2h0OiAwLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIG1hcmdpbkxlZnQ6ICc0cHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIGJvcmRlclRvcDogJzhweCBzb2xpZCB0cmFuc3BhcmVudCcsXG4ke2luZGVudH0gICAgICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnOHB4IHNvbGlkIHRyYW5zcGFyZW50JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgICBib3JkZXJMZWZ0OiAnMTRweCBzb2xpZCAjZmZmJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICAgIC8+XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICAgIDxzcGFuXG4ke2luZGVudH0gICAgICAgICAgICBzdHlsZT17e1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWZsZXgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgbWluSGVpZ2h0OiAnMzJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIHBhZGRpbmc6ICc2cHggMTJweCcsXG4ke2luZGVudH0gICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzk5OXB4JyxcbiR7aW5kZW50fSAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC41OCknLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250U2l6ZTogJzEycHgnLFxuJHtpbmRlbnR9ICAgICAgICAgICAgICBmb250V2VpZ2h0OiA2MDAsXG4ke2luZGVudH0gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6ICcwLjAyZW0nLFxuJHtpbmRlbnR9ICAgICAgICAgICAgfX1cbiR7aW5kZW50fSAgICAgICAgICA+XG4ke2luZGVudH0gICAgICAgICAgICB7d2lzdGlhSWR9XG4ke2luZGVudH0gICAgICAgICAgPC9zcGFuPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGl2PlxuJHtpbmRlbnR9ICAgICk7XG4ke2luZGVudH0gIH0pKCl9XG4ke2luZGVudH08L0ZsZXg+YDtcblxuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgLy8gRm9yIGxpbmtzLCB1c2UgTGlua0NvbnRyb2wgd2hpY2ggcHJvdmlkZXMgaW50ZXJuYWwgcGFnZSBzZWFyY2ggYW5kIFVSTCB2YWxpZGF0aW9uXG4gICAgICBjb25zdCBsaW5rSGFuZGxlciA9IG9uQ2hhbmdlSGFuZGxlcihgeyBcbiAgICAgICAgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgXG4gICAgICAgIHVybDogdmFsdWUudXJsIHx8ICcnLCBcbiAgICAgICAgbGFiZWw6IHZhbHVlLnRpdGxlIHx8ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuICAgICAgICBvcGVuc0luTmV3VGFiOiB2YWx1ZS5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4gICAgICB9YCk7XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICAgIGxhYmVsPXtfXygnTGluayBUZXh0JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBoaWRlTGFiZWxGcm9tVmlzaW9uPXt0cnVlfVxuJHtpbmRlbnR9ICAgIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9Py5sYWJlbCB8fCAnJ31cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBsYWJlbDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8udXJsIHx8ICcnLCBcbiR7aW5kZW50fSAgICAgICAgdGl0bGU6ICR7dmFsdWVBY2Nlc3Nvcn0/LmxhYmVsIHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtsaW5rSGFuZGxlcn19XG4ke2luZGVudH0gICAgICBzZXR0aW5ncz17W1xuJHtpbmRlbnR9ICAgICAgICB7IGlkOiAnb3BlbnNJbk5ld1RhYicsIHRpdGxlOiBfXygnT3BlbiBpbiBuZXcgdGFiJywgJ2hhbmRvZmYnKSB9XG4ke2luZGVudH0gICAgICBdfVxuJHtpbmRlbnR9ICAgICAgc2hvd1N1Z2dlc3Rpb25zPXt0cnVlfVxuJHtpbmRlbnR9ICAgICAgc3VnZ2VzdGlvbnNRdWVyeT17eyB0eXBlOiAncG9zdCcsIHN1YnR5cGU6ICdhbnknIH19XG4ke2luZGVudH0gICAgLz5cbiR7aW5kZW50fSAgPC9kaXY+XG4ke2luZGVudH08L2Rpdj5gO1xuXG4gICAgY2FzZSAnYnV0dG9uJzoge1xuICAgICAgY29uc3QgYnV0dG9uS2V5cyA9IHJlc29sdmVCdXR0b25GaWVsZEtleXMocHJvcGVydHkpO1xuICAgICAgY29uc3QgYnV0dG9uVXJsRmFsbGJhY2sgPSBidXR0b25LZXlzLnVybEtleSA9PT0gJ2hyZWYnID8gJyMnIDogJyc7XG4gICAgICBjb25zdCBidXR0b25IYW5kbGVyID0gb25DaGFuZ2VIYW5kbGVyKGJ1dHRvbkxpbmtNZXJnZUpzKHZhbHVlQWNjZXNzb3IsIGJ1dHRvbktleXMpKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PGRpdiBjbGFzc05hbWU9XCJjb21wb25lbnRzLWJhc2UtY29udHJvbFwiPlxuJHtpbmRlbnR9ICA8bGFiZWwgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2xhYmVsXCI+e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9PC9sYWJlbD5cbiR7aW5kZW50fSAgPFRleHRDb250cm9sXG4ke2luZGVudH0gICAgbGFiZWw9e19fKCdCdXR0b24gTGFiZWwnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgIGhpZGVMYWJlbEZyb21WaXNpb249e3RydWV9XG4ke2luZGVudH0gICAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0/LiR7YnV0dG9uS2V5cy5sYWJlbEtleX0gfHwgJyd9XG4ke2luZGVudH0gICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtvbkNoYW5nZUhhbmRsZXIoYHsgLi4uJHt2YWx1ZUFjY2Vzc29yfSwgJHtidXR0b25LZXlzLmxhYmVsS2V5fTogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fSAgPGRpdiBzdHlsZT17eyBtYXJnaW5Ub3A6ICc4cHgnIH19PlxuJHtpbmRlbnR9ICAgIDxMaW5rQ29udHJvbFxuJHtpbmRlbnR9ICAgICAgdmFsdWU9e3sgXG4ke2luZGVudH0gICAgICAgIHVybDogJHt2YWx1ZUFjY2Vzc29yfT8uJHtidXR0b25LZXlzLnVybEtleX0gfHwgJyR7YnV0dG9uVXJsRmFsbGJhY2t9JywgXG4ke2luZGVudH0gICAgICAgIHRpdGxlOiAke3ZhbHVlQWNjZXNzb3J9Py4ke2J1dHRvbktleXMubGFiZWxLZXl9IHx8ICcnLFxuJHtpbmRlbnR9ICAgICAgICBvcGVuc0luTmV3VGFiOiAke3ZhbHVlQWNjZXNzb3J9Py50YXJnZXQgPT09ICdfYmxhbmsnXG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gJHtidXR0b25IYW5kbGVyfX1cbiR7aW5kZW50fSAgICAgIHNldHRpbmdzPXtbXG4ke2luZGVudH0gICAgICAgIHsgaWQ6ICdvcGVuc0luTmV3VGFiJywgdGl0bGU6IF9fKCdPcGVuIGluIG5ldyB0YWInLCAnaGFuZG9mZicpIH1cbiR7aW5kZW50fSAgICAgIF19XG4ke2luZGVudH0gICAgICBzaG93U3VnZ2VzdGlvbnM9e3RydWV9XG4ke2luZGVudH0gICAgICBzdWdnZXN0aW9uc1F1ZXJ5PXt7IHR5cGU6ICdwb3N0Jywgc3VidHlwZTogJ2FueScgfX1cbiR7aW5kZW50fSAgICAvPlxuJHtpbmRlbnR9ICA8L2Rpdj5cbiR7aW5kZW50fSAgPFRvZ2dsZUNvbnRyb2xcbiR7aW5kZW50fSAgICBsYWJlbD17X18oJ0Rpc2FibGVkJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICBjaGVja2VkPXske3ZhbHVlQWNjZXNzb3J9Py5kaXNhYmxlZCB8fCBmYWxzZX1cbiR7aW5kZW50fSAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiAke29uQ2hhbmdlSGFuZGxlcihgeyAuLi4ke3ZhbHVlQWNjZXNzb3J9LCBkaXNhYmxlZDogdmFsdWUgfWApfX1cbiR7aW5kZW50fSAgLz5cbiR7aW5kZW50fTwvZGl2PmA7XG4gICAgfVxuXG4gICAgY2FzZSAnc2VsZWN0Jzoge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMocHJvcGVydHkub3B0aW9ucykubWFwKG9wdCA9PlxuICAgICAgICBgeyBsYWJlbDogJyR7b3B0LmxhYmVsLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nLCB2YWx1ZTogJyR7b3B0LnZhbHVlfScgfWBcbiAgICAgICkuam9pbignLCAnKTtcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9PFNlbGVjdENvbnRyb2xcbiR7aW5kZW50fSAgbGFiZWw9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gIHZhbHVlPXske3ZhbHVlQWNjZXNzb3J9IHx8ICcnfVxuJHtpbmRlbnR9ICBvcHRpb25zPXtbJHtvcHRpb25zfV19XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgICB9XG5cbiAgICBjYXNlICdhcnJheSc6XG4gICAgICAvLyBIYW5kbGUgc2ltcGxlIHN0cmluZyBhcnJheXMgd2l0aCBhIHJlcGVhdGFibGUgbGlzdCBjb250cm9sXG4gICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgc2ltcGxlIHR5cGUgYXJyYXkgKHN0cmluZywgbnVtYmVyLCBldGMuKSB2cyBvYmplY3QgYXJyYXlcbiAgICAgIGNvbnN0IGl0ZW1UeXBlID0gcHJvcGVydHkuaXRlbXM/LnR5cGU7XG4gICAgICBpZiAoIXByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzICYmIChpdGVtVHlwZSA9PT0gJ3N0cmluZycgfHwgIWl0ZW1UeXBlKSkge1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIGxpc3QgY29udHJvbCBmb3Igc3RyaW5nIGFycmF5c1xuICAgICAgICByZXR1cm4gYCR7aW5kZW50fTxkaXYgY2xhc3NOYW1lPVwiY29tcG9uZW50cy1iYXNlLWNvbnRyb2xcIj5cbiR7aW5kZW50fSAgPGxhYmVsIGNsYXNzTmFtZT1cImNvbXBvbmVudHMtYmFzZS1jb250cm9sX19sYWJlbFwiPntfXygnJHtsYWJlbH0nLCAnaGFuZG9mZicpfTwvbGFiZWw+XG4ke2luZGVudH0gIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2luZGVudH0gICAgeygke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5tYXAoKGxpc3RJdGVtLCBsaXN0SW5kZXgpID0+IChcbiR7aW5kZW50fSAgICAgIDxGbGV4IGtleT17bGlzdEluZGV4fSBnYXA9ezJ9IGFsaWduPVwiY2VudGVyXCI+XG4ke2luZGVudH0gICAgICAgIDxkaXYgc3R5bGU9e3sgZmxleDogMSB9fT5cbiR7aW5kZW50fSAgICAgICAgICA8VGV4dENvbnRyb2xcbiR7aW5kZW50fSAgICAgICAgICAgIHZhbHVlPXtsaXN0SXRlbSB8fCAnJ31cbiR7aW5kZW50fSAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSldO1xuJHtpbmRlbnR9ICAgICAgICAgICAgICBuZXdMaXN0W2xpc3RJbmRleF0gPSB2YWx1ZTtcbiR7aW5kZW50fSAgICAgICAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciBpdGVtLi4uJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy11cC1hbHQyXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ01vdmUgdXAnLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPT09IDApIHJldHVybjtcbiR7aW5kZW50fSAgICAgICAgICAgIGNvbnN0IG5ld0xpc3QgPSBbLi4uKCR7dmFsdWVBY2Nlc3Nvcn0gfHwgW10pXTtcbiR7aW5kZW50fSAgICAgICAgICAgIFtuZXdMaXN0W2xpc3RJbmRleF0sIG5ld0xpc3RbbGlzdEluZGV4IC0gMV1dID0gW25ld0xpc3RbbGlzdEluZGV4IC0gMV0sIG5ld0xpc3RbbGlzdEluZGV4XV07XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGRpc2FibGVkPXtsaXN0SW5kZXggPT09IDB9XG4ke2luZGVudH0gICAgICAgICAgc2l6ZT1cInNtYWxsXCJcbiR7aW5kZW50fSAgICAgICAgLz5cbiR7aW5kZW50fSAgICAgICAgPEJ1dHRvblxuJHtpbmRlbnR9ICAgICAgICAgIGljb249XCJhcnJvdy1kb3duLWFsdDJcIlxuJHtpbmRlbnR9ICAgICAgICAgIGxhYmVsPXtfXygnTW92ZSBkb3duJywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBsaXN0ID0gJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXTtcbiR7aW5kZW50fSAgICAgICAgICAgIGlmIChsaXN0SW5kZXggPj0gbGlzdC5sZW5ndGggLSAxKSByZXR1cm47XG4ke2luZGVudH0gICAgICAgICAgICBjb25zdCBuZXdMaXN0ID0gWy4uLmxpc3RdO1xuJHtpbmRlbnR9ICAgICAgICAgICAgW25ld0xpc3RbbGlzdEluZGV4XSwgbmV3TGlzdFtsaXN0SW5kZXggKyAxXV0gPSBbbmV3TGlzdFtsaXN0SW5kZXggKyAxXSwgbmV3TGlzdFtsaXN0SW5kZXhdXTtcbiR7aW5kZW50fSAgICAgICAgICAgICR7b25DaGFuZ2VIYW5kbGVyKCduZXdMaXN0Jyl9O1xuJHtpbmRlbnR9ICAgICAgICAgIH19XG4ke2luZGVudH0gICAgICAgICAgZGlzYWJsZWQ9e2xpc3RJbmRleCA+PSAoJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSkubGVuZ3RoIC0gMX1cbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICA8QnV0dG9uXG4ke2luZGVudH0gICAgICAgICAgaWNvbj1cInRyYXNoXCJcbiR7aW5kZW50fSAgICAgICAgICBsYWJlbD17X18oJ1JlbW92ZScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuJHtpbmRlbnR9ICAgICAgICAgICAgY29uc3QgbmV3TGlzdCA9ICgke3ZhbHVlQWNjZXNzb3J9IHx8IFtdKS5maWx0ZXIoKF8sIGkpID0+IGkgIT09IGxpc3RJbmRleCk7XG4ke2luZGVudH0gICAgICAgICAgICAke29uQ2hhbmdlSGFuZGxlcignbmV3TGlzdCcpfTtcbiR7aW5kZW50fSAgICAgICAgICB9fVxuJHtpbmRlbnR9ICAgICAgICAgIGlzRGVzdHJ1Y3RpdmVcbiR7aW5kZW50fSAgICAgICAgICBzaXplPVwic21hbGxcIlxuJHtpbmRlbnR9ICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICkpfVxuJHtpbmRlbnR9ICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiR7aW5kZW50fSAgICAgICAgY29uc3QgbmV3TGlzdCA9IFsuLi4oJHt2YWx1ZUFjY2Vzc29yfSB8fCBbXSksICcnXTtcbiR7aW5kZW50fSAgICAgICAgJHtvbkNoYW5nZUhhbmRsZXIoJ25ld0xpc3QnKX07XG4ke2luZGVudH0gICAgICB9fVxuJHtpbmRlbnR9ICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgPlxuJHtpbmRlbnR9ICAgICAge19fKCdBZGQgSXRlbScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgPC9CdXR0b24+XG4ke2luZGVudH0gIDwvRmxleD5cbiR7aW5kZW50fTwvZGl2PmA7XG4gICAgICB9XG4gICAgICAvLyBGb3Igb2JqZWN0IGFycmF5cywgZmFsbCB0aHJvdWdoIHRvIGRlZmF1bHQgKHRoZXNlIHNob3VsZCBiZSBoYW5kbGVkIGJ5IGdlbmVyYXRlQXJyYXlDb250cm9sIGF0IHRvcCBsZXZlbClcbiAgICAgIHJldHVybiAnJztcblxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAocHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWRDb250cm9scyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnR5LnByb3BlcnRpZXMpXG4gICAgICAgICAgLm1hcCgoW25lc3RlZEtleSwgbmVzdGVkUHJvcF0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgdmFsdWVBY2Nlc3NvcjogYCR7dmFsdWVBY2Nlc3Nvcn0/LiR7bmVzdGVkS2V5fWAsXG4gICAgICAgICAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbCkgPT4gb25DaGFuZ2VIYW5kbGVyKGB7IC4uLiR7dmFsdWVBY2Nlc3Nvcn0sICR7bmVzdGVkS2V5fTogJHt2YWx9IH1gKSxcbiAgICAgICAgICAgICAgaW5kZW50OiBpbmRlbnQgKyAnICAnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKG5lc3RlZEtleSwgbmVzdGVkUHJvcCwgbmVzdGVkQ29udGV4dCk7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBgJHtpbmRlbnR9PEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXsyfT5cbiR7bmVzdGVkQ29udHJvbHN9XG4ke2luZGVudH08L0ZsZXg+YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gYCR7aW5kZW50fTxUZXh0Q29udHJvbFxuJHtpbmRlbnR9ICBsYWJlbD17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX1cbiR7aW5kZW50fSAgdmFsdWU9eyR7dmFsdWVBY2Nlc3Nvcn0gfHwgJyd9XG4ke2luZGVudH0gIG9uQ2hhbmdlPXsodmFsdWUpID0+ICR7b25DaGFuZ2VIYW5kbGVyKCd2YWx1ZScpfX1cbiR7aW5kZW50fS8+YDtcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhcnJheSAocmVwZWF0ZXIpIGNvbnRyb2wgdXNpbmcgMTB1cCBSZXBlYXRlciBjb21wb25lbnRcbiAqIFByb3ZpZGVzIGRyYWctYW5kLWRyb3AgcmVvcmRlcmluZyBhbmQgYnVpbHQtaW4gYWRkL3JlbW92ZSBmdW5jdGlvbmFsaXR5XG4gKi9cbmNvbnN0IGdlbmVyYXRlQXJyYXlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBhdHRyTmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuXG4gIC8vIEdlbmVyYXRlIGZpZWxkIGNvbnRyb2xzIHRoYXQgdXNlIHNldEl0ZW0gZnJvbSB0aGUgUmVwZWF0ZXIgcmVuZGVyIHByb3BcbiAgY29uc3QgaXRlbUZpZWxkcyA9IE9iamVjdC5lbnRyaWVzKGl0ZW1Qcm9wcykubWFwKChbZmllbGRLZXksIGZpZWxkUHJvcF0pID0+IHtcbiAgICBjb25zdCBmaWVsZENvbnRleHQ6IEZpZWxkQ29udGV4dCA9IHtcbiAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlKSA9PiBgc2V0SXRlbSh7IC4uLml0ZW0sICR7ZmllbGRLZXl9OiAke3ZhbHVlfSB9KWAsXG4gICAgICBpbmRlbnQ6IGluZGVudCArICcgICAgICAnXG4gICAgfTtcbiAgICByZXR1cm4gZ2VuZXJhdGVGaWVsZENvbnRyb2woZmllbGRLZXksIGZpZWxkUHJvcCwgZmllbGRDb250ZXh0KTtcbiAgfSkuam9pbignXFxuJyk7XG5cbiAgLy8gR2V0IGEgZGlzcGxheSB0aXRsZSBmcm9tIHRoZSBmaXJzdCB0ZXh0IGZpZWxkIGlmIGF2YWlsYWJsZSwgZmFsbGJhY2sgdG8gZmllbGQgbGFiZWxcbiAgY29uc3QgZmlyc3RUZXh0RmllbGQgPSBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLmZpbmQoKFssIHByb3BdKSA9PiBwcm9wLnR5cGUgPT09ICd0ZXh0Jyk7XG4gIGNvbnN0IHRpdGxlQWNjZXNzb3IgPSBmaXJzdFRleHRGaWVsZCA/IGBpdGVtLiR7Zmlyc3RUZXh0RmllbGRbMF19IHx8IGAgOiAnJztcbiAgXG4gIC8vIEN1c3RvbSBhZGQgYnV0dG9uIHdpdGggdGVydGlhcnkgc3R5bGluZywgcGx1cyBpY29uLCByaWdodCBhbGlnbmVkXG4gIC8vIGFkZEJ1dHRvbiBpcyBhIGZ1bmN0aW9uIHRoYXQgcmVjZWl2ZXMgYWRkSXRlbSBhbmQgcmV0dXJucyBhIFJlYWN0IGVsZW1lbnRcbiAgY29uc3QgYWRkQnV0dG9uSnN4ID0gYChhZGRJdGVtKSA9PiAoXG4ke2luZGVudH0gICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1hZGQtYnV0dG9uLXdyYXBwZXJcIj5cbiR7aW5kZW50fSAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgdmFyaWFudD1cInRlcnRpYXJ5XCJcbiR7aW5kZW50fSAgICAgICAgb25DbGljaz17YWRkSXRlbX1cbiR7aW5kZW50fSAgICAgICAgaWNvbj17XG4ke2luZGVudH0gICAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj5cbiR7aW5kZW50fSAgICAgICAgICAgIDxwYXRoIGQ9XCJNMTEgMTIuNVYxNy41SDEyLjVWMTIuNUgxNy41VjExSDEyLjVWNkgxMVYxMUg2VjEyLjVIMTFaXCIvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3ZnPlxuJHtpbmRlbnR9ICAgICAgICB9XG4ke2luZGVudH0gICAgICAgIGNsYXNzTmFtZT1cInJlcGVhdGVyLWFkZC1idXR0b25cIlxuJHtpbmRlbnR9ICAgICAgPlxuJHtpbmRlbnR9ICAgICAgICB7X18oJ0FkZCAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4ke2luZGVudH0gICAgICA8L0J1dHRvbj5cbiR7aW5kZW50fSAgICA8L2Rpdj5cbiR7aW5kZW50fSAgKWA7XG5cbiAgcmV0dXJuIGAke2luZGVudH08UmVwZWF0ZXIgXG4ke2luZGVudH0gIGF0dHJpYnV0ZT1cIiR7YXR0ck5hbWV9XCIgXG4ke2luZGVudH0gIGFsbG93UmVvcmRlcmluZz17dHJ1ZX0gXG4ke2luZGVudH0gIGRlZmF1bHRWYWx1ZT17e319XG4ke2luZGVudH0gIGFkZEJ1dHRvbj17JHthZGRCdXR0b25Kc3h9fVxuJHtpbmRlbnR9PlxuJHtpbmRlbnR9ICB7KGl0ZW0sIGluZGV4LCBzZXRJdGVtLCByZW1vdmVJdGVtKSA9PiAoXG4ke2luZGVudH0gICAgPGRpdiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtXCI+XG4ke2luZGVudH0gICAgICA8ZGV0YWlscyBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19jb2xsYXBzZVwiPlxuJHtpbmRlbnR9ICAgICAgICA8c3VtbWFyeSBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX19oZWFkZXJcIj5cbiR7aW5kZW50fSAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyZXBlYXRlci1pdGVtX190aXRsZVwiPnske3RpdGxlQWNjZXNzb3J9JyR7bGFiZWx9J308L3NwYW4+XG4ke2luZGVudH0gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmVwZWF0ZXItaXRlbV9fYWN0aW9uc1wiIG9uQ2xpY2s9eyhlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpfT5cbiR7aW5kZW50fSAgICAgICAgICAgIDxCdXR0b25cbiR7aW5kZW50fSAgICAgICAgICAgICAgb25DbGljaz17cmVtb3ZlSXRlbX1cbiR7aW5kZW50fSAgICAgICAgICAgICAgaWNvbj17XG4ke2luZGVudH0gICAgICAgICAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9XCJNNSA2LjVWMThhMiAyIDAgMDAyIDJoMTBhMiAyIDAgMDAyLTJWNi41aC0yLjVWMThhLjUuNSAwIDAxLS41LjVIOGEuNS41IDAgMDEtLjUtLjVWNi41SDV6TTkgOXY4aDEuNVY5SDl6bTQuNSAwdjhIMTVWOWgtMS41elwiLz5cbiR7aW5kZW50fSAgICAgICAgICAgICAgICAgIDxwYXRoIGQ9XCJNMjAgNWgtNVYzLjVBMS41IDEuNSAwIDAwMTMuNSAyaC0zQTEuNSAxLjUgMCAwMDkgMy41VjVINHYxLjVoMTZWNXptLTYuNSAwaC0zVjMuNWgzVjV6XCIvPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICAgIDwvc3ZnPlxuJHtpbmRlbnR9ICAgICAgICAgICAgICB9XG4ke2luZGVudH0gICAgICAgICAgICAgIGxhYmVsPXtfXygnUmVtb3ZlIGl0ZW0nLCAnaGFuZG9mZicpfVxuJHtpbmRlbnR9ICAgICAgICAgICAgICBpc0Rlc3RydWN0aXZlXG4ke2luZGVudH0gICAgICAgICAgICAgIHNpemU9XCJzbWFsbFwiXG4ke2luZGVudH0gICAgICAgICAgICAvPlxuJHtpbmRlbnR9ICAgICAgICAgIDwvc3Bhbj5cbiR7aW5kZW50fSAgICAgICAgPC9zdW1tYXJ5PlxuJHtpbmRlbnR9ICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJlcGVhdGVyLWl0ZW1fX2ZpZWxkc1wiPlxuJHtpbmRlbnR9ICAgICAgICAgIDxGbGV4IGRpcmVjdGlvbj1cImNvbHVtblwiIGdhcD17Mn0+XG4ke2l0ZW1GaWVsZHN9XG4ke2luZGVudH0gICAgICAgICAgPC9GbGV4PlxuJHtpbmRlbnR9ICAgICAgICA8L2Rpdj5cbiR7aW5kZW50fSAgICAgIDwvZGV0YWlscz5cbiR7aW5kZW50fSAgICA8L2Rpdj5cbiR7aW5kZW50fSAgKX1cbiR7aW5kZW50fTwvUmVwZWF0ZXI+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdGhlIGluc3BlY3RvciBjb250cm9sIGZvciBhIHRvcC1sZXZlbCBwcm9wZXJ0eVxuICogVXNlcyBnZW5lcmF0ZUZpZWxkQ29udHJvbCB3aXRoIGEgc2V0QXR0cmlidXRlcyBjb250ZXh0XG4gKi9cbmNvbnN0IGdlbmVyYXRlUHJvcGVydHlDb250cm9sID0gKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5LCBpbmRlbnQ6IHN0cmluZyA9ICcgICAgICAgICAgJyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgY29uc3QgbGFiZWwgPSBwcm9wZXJ0eS5uYW1lIHx8IHRvVGl0bGVDYXNlKGtleSk7XG5cbiAgLy8gRm9yIGFycmF5IHR5cGUsIHVzZSB0aGUgc3BlY2lhbGl6ZWQgYXJyYXkgY29udHJvbFxuICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgIHJldHVybiBnZW5lcmF0ZUFycmF5Q29udHJvbChrZXksIHByb3BlcnR5LCBhdHRyTmFtZSwgbGFiZWwsIGluZGVudCk7XG4gIH1cblxuICAvLyBGb3IgYWxsIG90aGVyIHR5cGVzLCB1c2UgdGhlIHVuaWZpZWQgZmllbGQgY29udHJvbCBnZW5lcmF0b3JcbiAgY29uc3QgY29udGV4dDogRmllbGRDb250ZXh0ID0ge1xuICAgIHZhbHVlQWNjZXNzb3I6IGF0dHJOYW1lLFxuICAgIG9uQ2hhbmdlSGFuZGxlcjogKHZhbHVlKSA9PiBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiAke3ZhbHVlfSB9KWAsXG4gICAgaW5kZW50XG4gIH07XG5cbiAgcmV0dXJuIGdlbmVyYXRlRmllbGRDb250cm9sKGtleSwgcHJvcGVydHksIGNvbnRleHQpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBkZWZhdWx0IHZhbHVlIGZvciBhIHByb3BlcnR5IHR5cGVcbiAqL1xuY29uc3QgZ2V0RGVmYXVsdFZhbHVlID0gKGZpZWxkUHJvcDogSGFuZG9mZlByb3BlcnR5KTogYW55ID0+IHtcbiAgc3dpdGNoIChmaWVsZFByb3AudHlwZSkge1xuICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgcmV0dXJuIHsgbGFiZWw6ICcnLCB1cmw6ICcnLCBvcGVuc0luTmV3VGFiOiBmYWxzZSB9O1xuICAgIGNhc2UgJ2J1dHRvbic6XG4gICAgICByZXR1cm4gZ2V0QnV0dG9uRGVmYXVsdChmaWVsZFByb3ApO1xuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgIHJldHVybiB7IHNyYzogJycsIGFsdDogJycgfTtcbiAgICBjYXNlICd2aWRlbyc6XG4gICAgICByZXR1cm4geyBzcmM6ICcnLCBpZDogJycsIHBvc3RlcjogJycsIHR5cGU6ICcnLCB3aWR0aDogMCwgaGVpZ2h0OiAwLCBtaW1lOiAnJywgbWltZVR5cGU6ICcnIH07XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChmaWVsZFByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbmVzdGVkS2V5LCBuZXN0ZWRQcm9wXSBvZiBPYmplY3QuZW50cmllcyhmaWVsZFByb3AucHJvcGVydGllcykpIHtcbiAgICAgICAgICBuZXN0ZWRbbmVzdGVkS2V5XSA9IGdldERlZmF1bHRWYWx1ZShuZXN0ZWRQcm9wKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVzdGVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHt9O1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gMDtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gW107XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBoZWxwZXIgZnVuY3Rpb25zIGZvciBhcnJheSBwcm9wZXJ0aWVzXG4gKiBOb3RlOiBXaXRoIHRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCwgd2Ugbm8gbG9uZ2VyIG5lZWQgY3VzdG9tIGFkZC91cGRhdGUvcmVtb3ZlL21vdmUgZnVuY3Rpb25zXG4gKiBUaGUgUmVwZWF0ZXIgaGFuZGxlcyBhbGwgb2YgdGhpcyBpbnRlcm5hbGx5IHZpYSBpdHMgcmVuZGVyIHByb3BcbiAqL1xuY29uc3QgZ2VuZXJhdGVBcnJheUhlbHBlcnMgPSAocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pik6IHN0cmluZyA9PiB7XG4gIC8vIFRoZSAxMHVwIFJlcGVhdGVyIGNvbXBvbmVudCBoYW5kbGVzIGFycmF5IG1hbmlwdWxhdGlvbiBpbnRlcm5hbGx5XG4gIC8vIE5vIGN1c3RvbSBoZWxwZXIgZnVuY3Rpb25zIGFyZSBuZWVkZWRcbiAgcmV0dXJuICcnO1xufTtcblxuXG4vKipcbiAqIERldGVybWluaXN0aWMgaGFzaCBvZiBhIHN0cmluZyB0byBhIG51bWJlciBpbiBbMCwgbWF4KS5cbiAqL1xuY29uc3QgaGFzaFN0cmluZyA9IChzdHI6IHN0cmluZywgbWF4OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICBsZXQgaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaCA9ICgoaCA8PCA1KSAtIGggKyBzdHIuY2hhckNvZGVBdChpKSkgfCAwO1xuICB9XG4gIHJldHVybiAoKGggJSBtYXgpICsgbWF4KSAlIG1heDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYW4gU1ZHIGljb24gZWxlbWVudCBzdHJpbmcgZm9yIHVzZSBpbiByZWdpc3RlckJsb2NrVHlwZS5cbiAqIENyZWF0ZXMgYSBjb2xvcmVkIHJvdW5kZWQgcmVjdGFuZ2xlIHdpdGggMS0yIGxldHRlciBpbml0aWFscyBkZXJpdmVkXG4gKiBmcm9tIHRoZSBibG9jayB0aXRsZSwgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvciBrZXllZCB0byB0aGUgZ3JvdXAuXG4gKi9cbmNvbnN0IGdlbmVyYXRlU3ZnSWNvbiA9ICh0aXRsZTogc3RyaW5nLCBncm91cDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgR1JPVVBfQ09MT1JTID0gW1xuICAgICcjNUIyMUI2JywgJyMwRTc0OTAnLCAnI0I0NTMwOScsICcjMDQ3ODU3JyxcbiAgICAnI0JFMTIzQycsICcjNDMzOENBJywgJyMwMzY5QTEnLCAnI0ExNjIwNycsXG4gICAgJyMxNTgwM0QnLCAnIzkzMzNFQScsICcjQzI0MTBDJywgJyMxRDRFRDgnLFxuICAgICcjMDU5NjY5JywgJyM3QzNBRUQnLCAnI0RDMjYyNicsICcjMjU2M0VCJyxcbiAgXTtcblxuICBjb25zdCB3b3JkcyA9IHRpdGxlLnNwbGl0KC9bXFxzXy1dKy8pLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3QgaW5pdGlhbHMgPSB3b3Jkcy5sZW5ndGggPj0gMlxuICAgID8gKHdvcmRzWzBdWzBdICsgd29yZHNbMV1bMF0pLnRvVXBwZXJDYXNlKClcbiAgICA6ICh3b3Jkc1swXT8uc3Vic3RyaW5nKDAsIDIpIHx8ICdITycpLnRvVXBwZXJDYXNlKCk7XG5cbiAgY29uc3QgY29sb3IgPSBHUk9VUF9DT0xPUlNbaGFzaFN0cmluZyhncm91cCB8fCB0aXRsZSwgR1JPVVBfQ09MT1JTLmxlbmd0aCldO1xuXG4gIHJldHVybiBgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPlxuICAgICAgPHJlY3QgeD1cIjJcIiB5PVwiMlwiIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHJ4PVwiNFwiIGZpbGw9XCIke2NvbG9yfVwiIC8+XG4gICAgICA8dGV4dCB4PVwiMTJcIiB5PVwiMTYuNVwiIHRleHRBbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwid2hpdGVcIiBmb250U2l6ZT1cIjEwXCIgZm9udEZhbWlseT1cIi1hcHBsZS1zeXN0ZW0sQmxpbmtNYWNTeXN0ZW1Gb250LHNhbnMtc2VyaWZcIiBmb250V2VpZ2h0PVwiNjAwXCI+JHtpbml0aWFsc308L3RleHQ+XG4gICAgPC9zdmc+YDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgY29tcGxldGUgaW5kZXguanMgZmlsZVxuICogQHBhcmFtIGNvbXBvbmVudCAtIFRoZSBIYW5kb2ZmIGNvbXBvbmVudCBkYXRhXG4gKiBAcGFyYW0gZHluYW1pY0FycmF5Q29uZmlncyAtIE9wdGlvbmFsIGR5bmFtaWMgYXJyYXkgY29uZmlndXJhdGlvbnMga2V5ZWQgYnkgZmllbGQgbmFtZVxuICogQHBhcmFtIGlubmVyQmxvY2tzRmllbGQgLSBUaGUgcmljaHRleHQgZmllbGQgdGhhdCB1c2VzIElubmVyQmxvY2tzLCBvciBudWxsIGlmIG5vbmVcbiAqIEBwYXJhbSBkZXByZWNhdGlvbnNDb2RlIC0gT3B0aW9uYWwgZGVwcmVjYXRpb24gbWlncmF0aW9uIGNvZGVcbiAqIEBwYXJhbSBoYXNTY3JlZW5zaG90IC0gV2hldGhlciBhIHNjcmVlbnNob3QucG5nIGlzIGF2YWlsYWJsZSBmb3IgaW5zZXJ0ZXIgcHJldmlld1xuICovXG5jb25zdCBnZW5lcmF0ZUluZGV4SnMgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgZHluYW1pY0FycmF5Q29uZmlncz86IFJlY29yZDxzdHJpbmcsIER5bmFtaWNBcnJheUNvbmZpZyB8IEJyZWFkY3J1bWJzQXJyYXlDb25maWcgfCBUYXhvbm9teUFycmF5Q29uZmlnIHwgUGFnaW5hdGlvbkFycmF5Q29uZmlnPixcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGwsXG4gIGRlcHJlY2F0aW9uc0NvZGU/OiBzdHJpbmcsXG4gIGhhc1NjcmVlbnNob3Q/OiBib29sZWFuLFxuICBlZGl0b3JDb25maWc/OiBpbXBvcnQoJy4uL3R5cGVzJykuSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IHRvQmxvY2tOYW1lKGNvbXBvbmVudC5pZCk7XG4gIGNvbnN0IHByb3BlcnRpZXMgPSBjb21wb25lbnQucHJvcGVydGllcztcblxuICAvLyBoYXNEeW5hbWljQXJyYXlzIGlzIHRydWUgb25seSB3aGVuIHRoZXJlIGFyZSBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKSBmaWVsZHMg4oCUXG4gIC8vIHRoZSBzaW1wbGVyIHR5cGVzIChicmVhZGNydW1icy90YXhvbm9teS9wYWdpbmF0aW9uKSBkb24ndCBuZWVkIER5bmFtaWNQb3N0U2VsZWN0b3IuXG4gIGNvbnN0IGhhc0R5bmFtaWNBcnJheXMgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoXG4gICAgICAgIChjKSA9PiAhKCdhcnJheVR5cGUnIGluIGMpXG4gICAgICApXG4gICAgOiBmYWxzZTtcblxuICAvLyBIZWxwZXIgdG8gY2hlY2sgZm9yIGEgdHlwZSBpbiBwcm9wZXJ0aWVzLCBpbmNsdWRpbmcgbmVzdGVkIGluIGFycmF5cy9vYmplY3RzXG4gIGNvbnN0IGhhc1Byb3BlcnR5VHlwZSA9ICh0eXBlOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCBjaGVja1Byb3BlcnR5ID0gKHByb3A6IEhhbmRvZmZQcm9wZXJ0eSk6IGJvb2xlYW4gPT4ge1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gdHlwZSkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXMocHJvcC5wcm9wZXJ0aWVzKS5zb21lKGNoZWNrUHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3AuaXRlbXMucHJvcGVydGllcykuc29tZShjaGVja1Byb3BlcnR5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKHByb3BlcnRpZXMpLnNvbWUoY2hlY2tQcm9wZXJ0eSk7XG4gIH07XG5cbiAgLy8gVGhlIGlubmVyQmxvY2tzRmllbGQgdXNlcyBJbm5lckJsb2NrcyAoY29udGVudCBzdG9yZWQgaW4gcG9zdF9jb250ZW50LCBub3QgYW4gYXR0cmlidXRlKS5cbiAgLy8gQWxsIG90aGVyIHJpY2h0ZXh0IGZpZWxkcyBiZWNvbWUgc3RyaW5nIGF0dHJpYnV0ZXMgd2l0aCBSaWNoVGV4dCBlZGl0aW5nLlxuICBjb25zdCB1c2VJbm5lckJsb2NrcyA9ICEhaW5uZXJCbG9ja3NGaWVsZDtcblxuICAvLyBHZXQgYWxsIGF0dHJpYnV0ZSBuYW1lcyDigJMgZXhjbHVkZSBpbm5lckJsb2Nrc0ZpZWxkIGFuZCBwYWdpbmF0aW9uXG4gIGNvbnN0IGF0dHJOYW1lcyA9IE9iamVjdC5rZXlzKHByb3BlcnRpZXMpXG4gICAgLmZpbHRlcihrID0+IGsgIT09IGlubmVyQmxvY2tzRmllbGQgJiYgcHJvcGVydGllc1trXS50eXBlICE9PSAncGFnaW5hdGlvbicpXG4gICAgLm1hcCh0b0NhbWVsQ2FzZSk7XG5cbiAgLy8gSW5jbHVkZSBhbnkgYXR0cmlidXRlIG5hbWVzIHJlZmVyZW5jZWQgaW4gdGhlIHRlbXBsYXRlIGJ1dCBtaXNzaW5nIGZyb20gQVBJIHByb3BlcnRpZXNcbiAgLy8gKGUuZy4gYm9keSAtPiBibG9ja0JvZHkgc28gSlNYIGhhcyBhIGRlZmluZWQgdmFyaWFibGUgYW5kIG5vIFJlZmVyZW5jZUVycm9yKS5cbiAgLy8gU2tpcCB0aGUgaW5uZXJCbG9ja3NGaWVsZCDigJQgaXRzIGNvbnRlbnQgaXMgc3RvcmVkIHZpYSBJbm5lckJsb2Nrcywgbm90IGFzIGFuIGF0dHJpYnV0ZS5cbiAgY29uc3QgaW5uZXJCbG9ja3NBdHRyTmFtZSA9IGlubmVyQmxvY2tzRmllbGQgPyB0b0NhbWVsQ2FzZShpbm5lckJsb2Nrc0ZpZWxkKSA6IG51bGw7XG4gIGZvciAoY29uc3QgbmFtZSBvZiBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyhjb21wb25lbnQuY29kZSkpIHtcbiAgICBpZiAoIWF0dHJOYW1lcy5pbmNsdWRlcyhuYW1lKSAmJiBuYW1lICE9PSBpbm5lckJsb2Nrc0F0dHJOYW1lKSBhdHRyTmFtZXMucHVzaChuYW1lKTtcbiAgfVxuICBcbiAgLy8gQWRkIGR5bmFtaWMgYXJyYXkgYXR0cmlidXRlIG5hbWVzIGJhc2VkIG9uIGNvbmZpZyB0eXBlXG4gIGlmIChkeW5hbWljQXJyYXlDb25maWdzKSB7XG4gICAgZm9yIChjb25zdCBbZmllbGROYW1lLCBkeW5Db25maWddIG9mIE9iamVjdC5lbnRyaWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5Db25maWcpIHx8IGlzUGFnaW5hdGlvbkNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNUYXhvbm9teUNvbmZpZyhkeW5Db25maWcpKSB7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUVuYWJsZWRgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9VGF4b25vbXlgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U291cmNlYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEeW5hbWljQXJyYXlDb25maWcgKHBvc3RzKVxuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1Tb3VyY2VgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UG9zdFR5cGVgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0c2ApO1xuICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1RdWVyeUFyZ3NgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9RmllbGRNYXBwaW5nYCk7XG4gICAgICAgIGF0dHJOYW1lcy5wdXNoKGAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXNgKTtcbiAgICAgICAgYXR0ck5hbWVzLnB1c2goYCR7YXR0ck5hbWV9UmVuZGVyTW9kZWApO1xuICAgICAgICBpZiAoKGR5bkNvbmZpZyBhcyBEeW5hbWljQXJyYXlDb25maWcpLnBhZ2luYXRpb24pIHtcbiAgICAgICAgICBhdHRyTmFtZXMucHVzaChgJHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZGApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIHdoaWNoIGNvbXBvbmVudHMgd2UgbmVlZCB0byBpbXBvcnRcbiAgY29uc3QgbmVlZHNNZWRpYVVwbG9hZCA9IGhhc1Byb3BlcnR5VHlwZSgnaW1hZ2UnKTtcbiAgY29uc3QgbmVlZHNSYW5nZUNvbnRyb2wgPSBoYXNPcGFjaXR5UmFuZ2VGaWVsZChwcm9wZXJ0aWVzKTtcbiAgY29uc3QgbmVlZHNUb2dnbGVDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdib29sZWFuJykgfHwgaGFzUHJvcGVydHlUeXBlKCdidXR0b24nKTtcbiAgY29uc3QgbmVlZHNTZWxlY3RDb250cm9sID0gaGFzUHJvcGVydHlUeXBlKCdzZWxlY3QnKTtcbiAgY29uc3QgaGFzQXJyYXlQcm9wcyA9IE9iamVjdC52YWx1ZXMocHJvcGVydGllcykuc29tZShwID0+IHAudHlwZSA9PT0gJ2FycmF5Jyk7XG4gIGNvbnN0IGhhc09iamVjdFByb3BzID0gaGFzUHJvcGVydHlUeXBlKCdvYmplY3QnKTtcblxuICAvLyBCdWlsZCBpbXBvcnRzXG4gIGNvbnN0IGJsb2NrRWRpdG9ySW1wb3J0cyA9IFsndXNlQmxvY2tQcm9wcycsICdJbnNwZWN0b3JDb250cm9scycsICdCbG9ja0NvbnRyb2xzJ107XG4gIGlmIChuZWVkc01lZGlhVXBsb2FkKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ01lZGlhVXBsb2FkJywgJ01lZGlhVXBsb2FkQ2hlY2snLCAnTWVkaWFSZXBsYWNlRmxvdycpO1xuICB9XG4gIC8vIElubmVyQmxvY2tzIGZvciB0aGUgZGVzaWduYXRlZCByaWNodGV4dCBjb250ZW50IGFyZWFcbiAgaWYgKHVzZUlubmVyQmxvY2tzKSB7XG4gICAgYmxvY2tFZGl0b3JJbXBvcnRzLnB1c2goJ0lubmVyQmxvY2tzJyk7XG4gIH1cbiAgLy8gTGlua0NvbnRyb2wgZm9yIGxpbmsvYnV0dG9uIGZpZWxkcyAod2hlbiBub3QgdXNpbmcgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQpXG4gIGNvbnN0IG5lZWRzTGlua0NvbnRyb2wgPSBoYXNQcm9wZXJ0eVR5cGUoJ2xpbmsnKSB8fCBoYXNQcm9wZXJ0eVR5cGUoJ2J1dHRvbicpO1xuXG4gIGNvbnN0IGhhc0JyZWFkY3J1bWJzQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzQnJlYWRjcnVtYnNDb25maWcoYykpXG4gICAgOiBmYWxzZTtcbiAgY29uc3QgaGFzVGF4b25vbXlBcnJheSA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICA/IE9iamVjdC52YWx1ZXMoZHluYW1pY0FycmF5Q29uZmlncykuc29tZSgoYykgPT4gaXNUYXhvbm9teUNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuICBjb25zdCBoYXNQYWdpbmF0aW9uQXJyYXkgPSBkeW5hbWljQXJyYXlDb25maWdzXG4gICAgPyBPYmplY3QudmFsdWVzKGR5bmFtaWNBcnJheUNvbmZpZ3MpLnNvbWUoKGMpID0+IGlzUGFnaW5hdGlvbkNvbmZpZyhjKSlcbiAgICA6IGZhbHNlO1xuXG4gIGNvbnN0IGNvbXBvbmVudEltcG9ydHMgPSBbJ1BhbmVsQm9keScsICdUZXh0Q29udHJvbCcsICdCdXR0b24nXTtcbiAgaWYgKG5lZWRzUmFuZ2VDb250cm9sKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1JhbmdlQ29udHJvbCcpO1xuICAvLyBUb2dnbGVDb250cm9sOiBvbmx5IGZvciBib29sZWFuL2J1dHRvbiBwcm9wZXJ0eSBmaWVsZHMg4oCUIHNwZWNpYWwgYXJyYXkgdHlwZXMgdXNlIHNoYXJlZCBjb21wb25lbnRzXG4gIGlmIChuZWVkc1RvZ2dsZUNvbnRyb2wpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVG9nZ2xlQ29udHJvbCcpO1xuICAvLyBTZWxlY3RDb250cm9sOiBvbmx5IGZvciBzZWxlY3QgcHJvcGVydHkgZmllbGRzIG9yIER5bmFtaWNQb3N0U2VsZWN0b3IgKHBvc3RzKSDigJQgdGF4b25vbXkgaGFuZGxlZCBieSBUYXhvbm9teVNlbGVjdG9yXG4gIGlmIChuZWVkc1NlbGVjdENvbnRyb2wgfHwgaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTZWxlY3RDb250cm9sJyk7XG4gIC8vIFNwaW5uZXIgZm9yIGR5bmFtaWMgYXJyYXkgbG9hZGluZyBzdGF0ZSBpbiBlZGl0b3IgcHJldmlld1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdTcGlubmVyJyk7XG4gIC8vIFRleHRhcmVhQ29udHJvbDogbmVlZGVkIHdoZW4gcmljaHRleHQgZmllbGRzIGFwcGVhciBpbnNpZGUgYXJyYXkgaXRlbXNcbiAgY29uc3QgaGFzUmljaHRleHRJbkFycmF5ID0gT2JqZWN0LnZhbHVlcyhwcm9wZXJ0aWVzKS5zb21lKHAgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgcC5pdGVtcz8ucHJvcGVydGllcyAmJlxuICAgIE9iamVjdC52YWx1ZXMocC5pdGVtcy5wcm9wZXJ0aWVzKS5zb21lKGlwID0+IGlwLnR5cGUgPT09ICdyaWNodGV4dCcpXG4gICk7XG4gIGlmIChoYXNSaWNodGV4dEluQXJyYXkpIGNvbXBvbmVudEltcG9ydHMucHVzaCgnVGV4dGFyZWFDb250cm9sJyk7XG5cbiAgY29tcG9uZW50SW1wb3J0cy5wdXNoKCdGbGV4Jyk7XG5cbiAgLy8gMTB1cCBibG9jay1jb21wb25lbnRzIGltcG9ydHNcbiAgLy8gUmVwZWF0ZXIgaXMgb25seSBuZWVkZWQgd2hlbiB0aGVyZSBhcmUgbm9uLXNlcnZlci1yZW5kZXJlZCBhcnJheSBmaWVsZHMgaW4gdGhlIHNpZGViYXJcbiAgLy8gKHRheG9ub215L2JyZWFkY3J1bWJzL3BhZ2luYXRpb24gYXJyYXlzIHVzZSBzaGFyZWQgY29tcG9uZW50cyB0aGF0IGltcG9ydCBSZXBlYXRlciB0aGVtc2VsdmVzKVxuICBjb25zdCBoYXNOb25TcGVjaWFsQXJyYXlQcm9wcyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLnNvbWUoKFtrLCBwXSkgPT5cbiAgICBwLnR5cGUgPT09ICdhcnJheScgJiYgKCFkeW5hbWljQXJyYXlDb25maWdzPy5ba10gfHwgISgnYXJyYXlUeXBlJyBpbiBkeW5hbWljQXJyYXlDb25maWdzW2tdKSlcbiAgKTtcbiAgY29uc3QgdGVuVXBJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzTm9uU3BlY2lhbEFycmF5UHJvcHMpIHtcbiAgICB0ZW5VcEltcG9ydHMucHVzaCgnUmVwZWF0ZXInKTtcbiAgfVxuXG4gIC8vIEdlbmVyYXRlIGFycmF5IGhlbHBlcnNcbiAgY29uc3QgYXJyYXlIZWxwZXJzID0gZ2VuZXJhdGVBcnJheUhlbHBlcnMocHJvcGVydGllcyk7XG5cbiAgLy8gR2VuZXJhdGUgSlNYIHByZXZpZXcgZnJvbSBoYW5kbGViYXJzIHRlbXBsYXRlXG4gIC8vIFRoaXMgbXVzdCBoYXBwZW4gYmVmb3JlIHBhbmVsIGdlbmVyYXRpb24gc28gd2Uga25vdyB3aGljaCBmaWVsZHMgaGF2ZSBpbmxpbmUgZWRpdGluZ1xuICBjb25zdCBwcmV2aWV3UmVzdWx0ID0gZ2VuZXJhdGVKc3hQcmV2aWV3KFxuICAgIGNvbXBvbmVudC5jb2RlLFxuICAgIHByb3BlcnRpZXMsXG4gICAgY29tcG9uZW50LmlkLFxuICAgIGNvbXBvbmVudC50aXRsZSxcbiAgICBpbm5lckJsb2Nrc0ZpZWxkLFxuICAgIGVkaXRvckNvbmZpZyxcbiAgKTtcbiAgbGV0IHByZXZpZXdKc3ggPSBwcmV2aWV3UmVzdWx0LmpzeDtcbiAgY29uc3QgaW5saW5lRWRpdGFibGVGaWVsZHMgPSBwcmV2aWV3UmVzdWx0LmlubGluZUVkaXRhYmxlRmllbGRzO1xuXG4gIC8vIERldGVjdCBpZiBwcmV2aWV3IHVzZXMgSGFuZG9mZkxpbmtGaWVsZCAobGluay9idXR0b24gaW5saW5lIGVkaXRpbmcpXG4gIGNvbnN0IHByZXZpZXdVc2VzTGlua0ZpZWxkID0gcHJldmlld0pzeC5pbmNsdWRlcygnPEhhbmRvZmZMaW5rRmllbGQnKTtcblxuICAvLyBHZW5lcmF0ZSBwYW5lbCBib2RpZXMgZm9yIGVhY2ggcHJvcGVydHlcbiAgY29uc3QgcGFuZWxzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgLy8gcmljaHRleHQgdXNlcyBJbm5lckJsb2NrcyBvbiB0aGUgY2FudmFzIOKAkyBubyBzaWRlYmFyIHBhbmVsIG5lZWRlZFxuICAgIC8vIHBhZ2luYXRpb24gaXMgYXV0by1nZW5lcmF0ZWQgZnJvbSBxdWVyeSByZXN1bHRzIOKAkyBubyBzaWRlYmFyIHBhbmVsIG5lZWRlZFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAncmljaHRleHQnIHx8IHByb3BlcnR5LnR5cGUgPT09ICdwYWdpbmF0aW9uJykgY29udGludWU7XG5cbiAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSBpbmxpbmUtZWRpdGFibGUgb24gdGhlIGNhbnZhcyAodGV4dCwgaW1hZ2UsIGxpbmssIGJ1dHRvblxuICAgIC8vIHdyYXBwZWQgaW4ge3sjZmllbGR9fSkg4oCTIHRoZXkgZG9uJ3QgbmVlZCBzaWRlYmFyIGNvbnRyb2xzLlxuICAgIC8vIEFycmF5IGZpZWxkcyBhcmUgYWx3YXlzIGtlcHQ6IHRoZXkgbmVlZCBzaWRlYmFyIFVJIGZvciBtYW51YWwvZHluYW1pYyB0b2dnbGVcbiAgICAvLyBhbmQgZm9yIGFkZGluZy9yZW1vdmluZyBpdGVtcywgZXZlbiB3aGVuIHRoZWlyIGNoaWxkIGZpZWxkcyBhcmUgaW5saW5lLWVkaXRhYmxlLlxuICAgIGlmIChpbmxpbmVFZGl0YWJsZUZpZWxkcy5oYXMoa2V5KSAmJiBwcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknKSBjb250aW51ZTtcblxuICAgIGNvbnN0IGxhYmVsID0gcHJvcGVydHkubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBkeW5hbWljQ29uZmlnID0gZHluYW1pY0FycmF5Q29uZmlncz8uW2tleV07XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGR5bmFtaWMgYXJyYXkgZmllbGRcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5JyAmJiBkeW5hbWljQ29uZmlnKSB7XG4gICAgICBpZiAoaXNCcmVhZGNydW1ic0NvbmZpZyhkeW5hbWljQ29uZmlnKSkge1xuICAgICAgICAvLyBCcmVhZGNydW1iczogc2hhcmVkIGNvbXBvbmVudCB3aXRoIHNpbmdsZSB2aXNpYmlsaXR5IHRvZ2dsZVxuICAgICAgICBwYW5lbHMucHVzaChgICAgICAgICAgIHsvKiAke2xhYmVsfSBQYW5lbCAtIEJyZWFkY3J1bWJzICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8QnJlYWRjcnVtYnNTZWxlY3RvclxuICAgICAgICAgICAgICBhdHRyTmFtZT1cIiR7YXR0ck5hbWV9XCJcbiAgICAgICAgICAgICAgYXR0cmlidXRlcz17YXR0cmlidXRlc31cbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcz17c2V0QXR0cmlidXRlc31cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGF4b25vbXlDb25maWcoZHluYW1pY0NvbmZpZykpIHtcbiAgICAgICAgLy8gVGF4b25vbXk6IHNoYXJlZCBjb21wb25lbnQgd2l0aCBBdXRvIC8gTWFudWFsIHRhYnNcbiAgICAgICAgY29uc3QgdGF4b25vbXlPcHRpb25zID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzLm1hcCgodCkgPT4gKHsgbGFiZWw6IHQsIHZhbHVlOiB0IH0pKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdFRheG9ub215ID0gZHluYW1pY0NvbmZpZy50YXhvbm9taWVzWzBdIHx8ICdwb3N0X3RhZyc7XG4gICAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzIHx8IHt9O1xuICAgICAgICBjb25zdCBpdGVtRmllbGRzID0gT2JqZWN0LmtleXMoaXRlbVByb3BzKS5sZW5ndGggPiAwXG4gICAgICAgICAgPyBPYmplY3QuZW50cmllcyhpdGVtUHJvcHMpLm1hcCgoW2ZpZWxkS2V5LCBmaWVsZFByb3BdKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGN0eDogRmllbGRDb250ZXh0ID0ge1xuICAgICAgICAgICAgICAgIHZhbHVlQWNjZXNzb3I6IGBpdGVtLiR7ZmllbGRLZXl9YCxcbiAgICAgICAgICAgICAgICBvbkNoYW5nZUhhbmRsZXI6ICh2YWwpID0+IGBzZXRJdGVtKHsgLi4uaXRlbSwgJHtmaWVsZEtleX06ICR7dmFsfSB9KWAsXG4gICAgICAgICAgICAgICAgaW5kZW50OiAnICAgICAgICAgICAgICAgICcsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIHJldHVybiBnZW5lcmF0ZUZpZWxkQ29udHJvbChmaWVsZEtleSwgZmllbGRQcm9wLCBjdHgpO1xuICAgICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICAgICAgOiBgICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ0xhYmVsJywgJ2hhbmRvZmYnKX0gdmFsdWU9e2l0ZW0ubGFiZWwgfHwgJyd9IG9uQ2hhbmdlPXsodikgPT4gc2V0SXRlbSh7IC4uLml0ZW0sIGxhYmVsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPlxuICAgICAgICAgICAgICAgIDxUZXh0Q29udHJvbCBsYWJlbD17X18oJ1VSTCcsICdoYW5kb2ZmJyl9IHZhbHVlPXtpdGVtLnVybCB8fCAnJ30gb25DaGFuZ2U9eyh2KSA9PiBzZXRJdGVtKHsgLi4uaXRlbSwgdXJsOiB2IH0pfSBfX25leHRIYXNOb01hcmdpbkJvdHRvbSAvPmA7XG4gICAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsIC0gVGF4b25vbXkgKi99XG4gICAgICAgICAgPFBhbmVsQm9keSB0aXRsZT17X18oJyR7bGFiZWx9JywgJ2hhbmRvZmYnKX0gaW5pdGlhbE9wZW49eyR7cGFuZWxzLmxlbmd0aCA8IDJ9fT5cbiAgICAgICAgICAgIDxUYXhvbm9teVNlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICB0YXhvbm9teU9wdGlvbnM9eyR7SlNPTi5zdHJpbmdpZnkodGF4b25vbXlPcHRpb25zKX19XG4gICAgICAgICAgICAgIGRlZmF1bHRUYXhvbm9teT1cIiR7ZGVmYXVsdFRheG9ub215fVwiXG4gICAgICAgICAgICAgIGxhYmVsPXtfXygnU2hvdyAke2xhYmVsfScsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgIHJlbmRlck1hbnVhbEl0ZW1zPXsoaXRlbSwgaW5kZXgsIHNldEl0ZW0sIHJlbW92ZUl0ZW0pID0+IChcbiAgICAgICAgICAgICAgICA8PlxuJHtpdGVtRmllbGRzfVxuICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQYWdpbmF0aW9uQ29uZmlnKGR5bmFtaWNDb25maWcpKSB7XG4gICAgICAgIC8vIFBhZ2luYXRpb246IHNoYXJlZCBjb21wb25lbnQgd2l0aCBzaW5nbGUgdmlzaWJpbGl0eSB0b2dnbGVcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBQYWdpbmF0aW9uICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8UGFnaW5hdGlvblNlbGVjdG9yXG4gICAgICAgICAgICAgIGF0dHJOYW1lPVwiJHthdHRyTmFtZX1cIlxuICAgICAgICAgICAgICBhdHRyaWJ1dGVzPXthdHRyaWJ1dGVzfVxuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzPXtzZXRBdHRyaWJ1dGVzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L1BhbmVsQm9keT5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFBvc3RzIChEeW5hbWljQXJyYXlDb25maWcpOiBmdWxsIER5bmFtaWNQb3N0U2VsZWN0b3JcbiAgICAgICAgY29uc3QgZGVmYXVsdE1vZGUgPSBkeW5hbWljQ29uZmlnLnNlbGVjdGlvbk1vZGUgPT09ICdtYW51YWwnID8gJ3NlbGVjdCcgOiAncXVlcnknO1xuICAgICAgICBjb25zdCBpdGVtT3ZlcnJpZGVzQ29uZmlnID0gZHluYW1pY0NvbmZpZy5pdGVtT3ZlcnJpZGVzQ29uZmlnIHx8IHt9O1xuICAgICAgICBjb25zdCBhZHZhbmNlZEZpZWxkczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgb3B0aW9ucz86IEFycmF5PHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9PjsgZGVmYXVsdD86IGFueSB9PiA9IFtdO1xuXG4gICAgICAgIC8vIEZpZWxkcyBmcm9tIGl0ZW1PdmVycmlkZXNDb25maWcgKGxlZ2FjeSlcbiAgICAgICAgZm9yIChjb25zdCBbbmFtZSwgY10gb2YgT2JqZWN0LmVudHJpZXMoaXRlbU92ZXJyaWRlc0NvbmZpZykgYXMgQXJyYXk8W3N0cmluZywgSXRlbU92ZXJyaWRlRmllbGRDb25maWddPikge1xuICAgICAgICAgIGlmIChjLm1vZGUgPT09ICd1aScpIHtcbiAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lLCBsYWJlbDogYy5sYWJlbCwgdHlwZTogJ3NlbGVjdCcsIG9wdGlvbnM6IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMoYy5vcHRpb25zKSwgZGVmYXVsdDogYy5kZWZhdWx0IH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpZWxkcyBmcm9tIGZpZWxkTWFwcGluZyB3aXRoIHR5cGU6IFwibWFudWFsXCIg4oCUIGRlcml2ZSBjb250cm9sIHR5cGUgZnJvbSBpdGVtIHByb3BlcnRpZXNcbiAgICAgICAgY29uc3QgaXRlbVByb3BzID0gcHJvcGVydHkuaXRlbXM/LnByb3BlcnRpZXMgfHwge307XG4gICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IGR5bmFtaWNDb25maWcuZmllbGRNYXBwaW5nIHx8IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IFtmaWVsZFBhdGgsIG1hcHBpbmdWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZmllbGRNYXBwaW5nKSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgbWFwcGluZ1ZhbHVlID09PSAnb2JqZWN0JyAmJiBtYXBwaW5nVmFsdWUgIT09IG51bGwgJiYgKG1hcHBpbmdWYWx1ZSBhcyBhbnkpLnR5cGUgPT09ICdtYW51YWwnKSB7XG4gICAgICAgICAgICBjb25zdCB0b3BLZXkgPSBmaWVsZFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1Qcm9wID0gaXRlbVByb3BzW3RvcEtleV07XG4gICAgICAgICAgICBjb25zdCBmaWVsZExhYmVsID0gaXRlbVByb3A/Lm5hbWUgfHwgdG9UaXRsZUNhc2UodG9wS2V5KTtcbiAgICAgICAgICAgIGxldCBjb250cm9sVHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgIGxldCBvcHRpb25zOiBBcnJheTx7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBsZXQgZGVmYXVsdFZhbDogYW55ID0gaXRlbVByb3A/LmRlZmF1bHQgPz8gJyc7XG4gICAgICAgICAgICBpZiAoaXRlbVByb3ApIHtcbiAgICAgICAgICAgICAgc3dpdGNoIChpdGVtUHJvcC50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3NlbGVjdCc7XG4gICAgICAgICAgICAgICAgICBvcHRpb25zID0gbm9ybWFsaXplU2VsZWN0T3B0aW9ucyhpdGVtUHJvcC5vcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgICAgY29udHJvbFR5cGUgPSAndG9nZ2xlJztcbiAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWwgPSBpdGVtUHJvcC5kZWZhdWx0ID8/IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ251bWJlcic7XG4gICAgICAgICAgICAgICAgICBkZWZhdWx0VmFsID0gaXRlbVByb3AuZGVmYXVsdCA/PyAwO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgIGNvbnRyb2xUeXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzLnB1c2goeyBuYW1lOiBmaWVsZFBhdGgsIGxhYmVsOiBmaWVsZExhYmVsLCB0eXBlOiBjb250cm9sVHlwZSwgb3B0aW9ucywgZGVmYXVsdDogZGVmYXVsdFZhbCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFnaW5hdGlvblRvZ2dsZSA9IGR5bmFtaWNDb25maWcucGFnaW5hdGlvblxuICAgICAgICAgID8gYFxuICAgICAgICAgICAgICAgIDxUb2dnbGVDb250cm9sXG4gICAgICAgICAgICAgICAgICBsYWJlbD17X18oJ1Nob3cgUGFnaW5hdGlvbicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgICAgICAgICBjaGVja2VkPXske2F0dHJOYW1lfVBhZ2luYXRpb25FbmFibGVkID8/IHRydWV9XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHthdHRyTmFtZX1QYWdpbmF0aW9uRW5hYmxlZDogdmFsdWUgfSl9XG4gICAgICAgICAgICAgICAgLz5gXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgcGFuZWxzLnB1c2goYCAgICAgICAgICB7LyogJHtsYWJlbH0gUGFuZWwgLSBEeW5hbWljICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4gICAgICAgICAgICA8RHluYW1pY1Bvc3RTZWxlY3RvclxuICAgICAgICAgICAgICB2YWx1ZT17e1xuICAgICAgICAgICAgICAgIHNvdXJjZTogJHthdHRyTmFtZX1Tb3VyY2UgfHwgJyR7ZGVmYXVsdE1vZGV9JyxcbiAgICAgICAgICAgICAgICBwb3N0VHlwZTogJHthdHRyTmFtZX1Qb3N0VHlwZSxcbiAgICAgICAgICAgICAgICBxdWVyeUFyZ3M6ICR7YXR0ck5hbWV9UXVlcnlBcmdzIHx8IHt9LFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkUG9zdHM6ICR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0cyB8fCBbXSxcbiAgICAgICAgICAgICAgICBpdGVtT3ZlcnJpZGVzOiAke2F0dHJOYW1lfUl0ZW1PdmVycmlkZXMgfHwge31cbiAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyhuZXh0VmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoe1xuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9U291cmNlOiBuZXh0VmFsdWUuc291cmNlLFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9UG9zdFR5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSxcbiAgICAgICAgICAgICAgICAke2F0dHJOYW1lfVF1ZXJ5QXJnczogeyAuLi5uZXh0VmFsdWUucXVlcnlBcmdzLCBwb3N0X3R5cGU6IG5leHRWYWx1ZS5wb3N0VHlwZSB9LFxuICAgICAgICAgICAgICAgICR7YXR0ck5hbWV9U2VsZWN0ZWRQb3N0czogbmV4dFZhbHVlLnNlbGVjdGVkUG9zdHMgfHwgW10sXG4gICAgICAgICAgICAgICAgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzOiBuZXh0VmFsdWUuaXRlbU92ZXJyaWRlcyA/PyB7fVxuICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgb3B0aW9ucz17e1xuICAgICAgICAgICAgICAgIHBvc3RUeXBlczogJHtKU09OLnN0cmluZ2lmeShkeW5hbWljQ29uZmlnLnBvc3RUeXBlcyl9LFxuICAgICAgICAgICAgICAgIG1heEl0ZW1zOiAke2R5bmFtaWNDb25maWcubWF4SXRlbXMgPz8gMjB9LFxuICAgICAgICAgICAgICAgIHRleHREb21haW46ICdoYW5kb2ZmJyxcbiAgICAgICAgICAgICAgICBzaG93RGF0ZUZpbHRlcjogJHsoZHluYW1pY0NvbmZpZyBhcyBhbnkpLnNob3dEYXRlRmlsdGVyID09PSB0cnVlID8gJ3RydWUnIDogJ2ZhbHNlJ30sXG4gICAgICAgICAgICAgICAgc2hvd0V4Y2x1ZGVDdXJyZW50OiB0cnVlLFxuICAgICAgICAgICAgICAgIGFkdmFuY2VkRmllbGRzOiAke0pTT04uc3RyaW5naWZ5KGFkdmFuY2VkRmllbGRzKX1cbiAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIC8+JHtwYWdpbmF0aW9uVG9nZ2xlfVxuICAgICAgICAgICAgeyR7YXR0ck5hbWV9U291cmNlID09PSAnbWFudWFsJyAmJiAoXG4gICAgICAgICAgICAgIDw+XG4ke2dlbmVyYXRlUHJvcGVydHlDb250cm9sKGtleSwgcHJvcGVydHkpfVxuICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICl9XG4gICAgICAgICAgPC9QYW5lbEJvZHk+YCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFN0YW5kYXJkIHBhbmVsIChub24tZHluYW1pYylcbiAgICAgIHBhbmVscy5wdXNoKGAgICAgICAgICAgey8qICR7bGFiZWx9IFBhbmVsICovfVxuICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKCcke2xhYmVsfScsICdoYW5kb2ZmJyl9IGluaXRpYWxPcGVuPXske3BhbmVscy5sZW5ndGggPCAyfX0+XG4ke2dlbmVyYXRlUHJvcGVydHlDb250cm9sKGtleSwgcHJvcGVydHkpfVxuICAgICAgICAgIDwvUGFuZWxCb2R5PmApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFkZCBIYW5kb2ZmIGRlc2lnbiBzeXN0ZW0gbGlua3MgcGFuZWxcbiAgY29uc3QgZGVzaWduU3lzdGVtUGFuZWwgPSBbXG4gICAgJyAgICAgICAgICB7LyogRGVzaWduIFN5c3RlbSBMaW5rcyAqL30nLFxuICAgICcgICAgICAgICAgeyhtZXRhZGF0YS5fX2hhbmRvZmY/LmhhbmRvZmZVcmwgfHwgbWV0YWRhdGEuX19oYW5kb2ZmPy5maWdtYVVybCkgJiYgKCcsXG4gICAgJyAgICAgICAgICAgIDxQYW5lbEJvZHkgdGl0bGU9e19fKFxcJ0Rlc2lnbiBTeXN0ZW1cXCcsIFxcJ2hhbmRvZmZcXCcpfSBpbml0aWFsT3Blbj17ZmFsc2V9PicsXG4gICAgJyAgICAgICAgICAgICAgPEZsZXggZGlyZWN0aW9uPVwiY29sdW1uXCIgZ2FwPXszfT4nLFxuICAgICcgICAgICAgICAgICAgICAge21ldGFkYXRhLl9faGFuZG9mZj8uaGFuZG9mZlVybCAmJiAoJyxcbiAgICAnICAgICAgICAgICAgICAgICAgPEJ1dHRvbicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgdmFyaWFudD1cInNlY29uZGFyeVwiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICBocmVmPXttZXRhZGF0YS5fX2hhbmRvZmYuaGFuZG9mZlVybH0nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGljb249XCJ2aXNpYmlsaXR5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBcXCcxMDAlXFwnLCBqdXN0aWZ5Q29udGVudDogXFwnY2VudGVyXFwnIH19JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAge19fKFxcJ1ZpZXcgaW4gSGFuZG9mZlxcJywgXFwnaGFuZG9mZlxcJyl9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPC9CdXR0b24+JyxcbiAgICAnICAgICAgICAgICAgICAgICl9JyxcbiAgICAnICAgICAgICAgICAgICAgIHttZXRhZGF0YS5fX2hhbmRvZmY/LmZpZ21hVXJsICYmICgnLFxuICAgICcgICAgICAgICAgICAgICAgICA8QnV0dG9uJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB2YXJpYW50PVwic2Vjb25kYXJ5XCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGhyZWY9e21ldGFkYXRhLl9faGFuZG9mZi5maWdtYVVybH0nLFxuICAgICcgICAgICAgICAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiJyxcbiAgICAnICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCInLFxuICAgICcgICAgICAgICAgICAgICAgICAgIGljb249XCJhcnRcIicsXG4gICAgJyAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IFxcJzEwMCVcXCcsIGp1c3RpZnlDb250ZW50OiBcXCdjZW50ZXJcXCcgfX0nLFxuICAgICcgICAgICAgICAgICAgICAgICA+JyxcbiAgICAnICAgICAgICAgICAgICAgICAgICB7X18oXFwnT3BlbiBpbiBGaWdtYVxcJywgXFwnaGFuZG9mZlxcJyl9JyxcbiAgICAnICAgICAgICAgICAgICAgICAgPC9CdXR0b24+JyxcbiAgICAnICAgICAgICAgICAgICAgICl9JyxcbiAgICAnICAgICAgICAgICAgICA8L0ZsZXg+JyxcbiAgICAnICAgICAgICAgICAgPC9QYW5lbEJvZHk+JyxcbiAgICAnICAgICAgICAgICl9JyxcbiAgXS5qb2luKCdcXG4nKTtcbiAgcGFuZWxzLnB1c2goZGVzaWduU3lzdGVtUGFuZWwpO1xuXG4gIC8vIER5bmFtaWMgYXJyYXkgcmVzb2x1dGlvbiBmb3IgZWRpdG9yIHByZXZpZXcuXG4gIC8vIER5bmFtaWNBcnJheUNvbmZpZyAocG9zdHMpOiBmdWxsIHVzZVNlbGVjdCByZXNvbHV0aW9uXG4gIC8vIEJyZWFkY3J1bWJzOiBsaXZlIGZldGNoIHZpYSBSRVNUIGVuZHBvaW50XG4gIC8vIFRheG9ub215IChhdXRvIG1vZGUpOiBsaXZlIGZldGNoIHZpYSB1c2VTZWxlY3Qgd2l0aCBjb3JlLWRhdGFcbiAgLy8gUGFnaW5hdGlvbjogc2VydmVyLXJlbmRlcmVkIG9ubHkgKHN0dWIgdmFyaWFibGUpXG4gIGxldCBkeW5hbWljQXJyYXlSZXNvbHV0aW9uQ29kZSA9ICcnO1xuICBjb25zdCByZXNvbHZpbmdGbGFnczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGR5bmFtaWNBcnJheUNvbmZpZ3MpIHtcbiAgICBmb3IgKGNvbnN0IFtmaWVsZEtleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhkeW5hbWljQXJyYXlDb25maWdzKSkge1xuICAgICAgY29uc3QgYXR0ck5hbWUgPSB0b0NhbWVsQ2FzZShmaWVsZEtleSk7XG4gICAgICBjb25zdCBmaWVsZFByb3AgPSBwcm9wZXJ0aWVzW2ZpZWxkS2V5XTtcbiAgICAgIGNvbnN0IGl0ZW1Qcm9wcyA9IGZpZWxkUHJvcD8uaXRlbXM/LnByb3BlcnRpZXM7XG5cbiAgICAgIGlmIChpc0JyZWFkY3J1bWJzQ29uZmlnKGNvbmZpZykpIHtcbiAgICAgICAgY29uc3QgY2FwID0gYXR0ck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhdHRyTmFtZS5zbGljZSgxKTtcbiAgICAgICAgY29uc3QgcmVzaGFwZUpzID0gYnVpbGRSZXNoYXBlSnMoaXRlbVByb3BzLCBbJ2xhYmVsJywgJ3VybCddKTtcbiAgICAgICAgY29uc3QgbWFwRXhwciA9IHJlc2hhcGVKc1xuICAgICAgICAgID8gYC5tYXAoKGl0ZW0pID0+ICR7cmVzaGFwZUpzfSlgXG4gICAgICAgICAgOiAnJztcbiAgICAgICAgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGUgKz0gYFxuICAgIGNvbnN0IFtwcmV2aWV3JHtjYXB9LCBzZXRQcmV2aWV3JHtjYXB9XSA9IHVzZVN0YXRlKG51bGwpO1xuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICBpZiAoISR7YXR0ck5hbWV9RW5hYmxlZCkgeyBzZXRQcmV2aWV3JHtjYXB9KFtdKTsgcmV0dXJuOyB9XG4gICAgICBjb25zdCBwb3N0SWQgPSBzZWxlY3QoJ2NvcmUvZWRpdG9yJyk/LmdldEN1cnJlbnRQb3N0SWQ/LigpO1xuICAgICAgaWYgKCFwb3N0SWQpIHsgc2V0UHJldmlldyR7Y2FwfShbXSk7IHJldHVybjsgfVxuICAgICAgYXBpRmV0Y2goeyBwYXRoOiBcXGAvaGFuZG9mZi92MS9icmVhZGNydW1icz9wb3N0X2lkPVxcJHtwb3N0SWR9XFxgIH0pXG4gICAgICAgIC50aGVuKChpdGVtcykgPT4gc2V0UHJldmlldyR7Y2FwfSgoaXRlbXMgfHwgW10pJHttYXBFeHByfSkpXG4gICAgICAgIC5jYXRjaCgoKSA9PiBzZXRQcmV2aWV3JHtjYXB9KFtdKSk7XG4gICAgfSwgWyR7YXR0ck5hbWV9RW5hYmxlZF0pO1xuYDtcbiAgICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYig/IUVuYWJsZWQpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzVGF4b25vbXlDb25maWcoY29uZmlnKSkge1xuICAgICAgICBjb25zdCBjYXAgPSBhdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpO1xuICAgICAgICBjb25zdCByZXNoYXBlSnMgPSBidWlsZFJlc2hhcGVKcyhpdGVtUHJvcHMsIFsnbGFiZWwnLCAndXJsJywgJ3NsdWcnXSk7XG4gICAgICAgIGNvbnN0IG1hcEV4cHIgPSByZXNoYXBlSnNcbiAgICAgICAgICA/IGAubWFwKChpdGVtKSA9PiAke3Jlc2hhcGVKc30pYFxuICAgICAgICAgIDogJyc7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBwcmV2aWV3JHtjYXB9ID0gdXNlU2VsZWN0KFxuICAgICAgKHNlbGVjdCkgPT4ge1xuICAgICAgICBpZiAoISR7YXR0ck5hbWV9RW5hYmxlZCkgcmV0dXJuIFtdO1xuICAgICAgICBpZiAoJHthdHRyTmFtZX1Tb3VyY2UgPT09ICdtYW51YWwnKSByZXR1cm4gJHthdHRyTmFtZX0gfHwgW107XG4gICAgICAgIGNvbnN0IHBvc3RJZCA9IHNlbGVjdCgnY29yZS9lZGl0b3InKT8uZ2V0Q3VycmVudFBvc3RJZD8uKCk7XG4gICAgICAgIGlmICghcG9zdElkKSByZXR1cm4gW107XG4gICAgICAgIGNvbnN0IHRheG9ub215ID0gJHthdHRyTmFtZX1UYXhvbm9teSB8fCAnJHtjb25maWcudGF4b25vbWllc1swXSB8fCAncG9zdF90YWcnfSc7XG4gICAgICAgIGNvbnN0IHJlc3RCYXNlID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldFRheG9ub215KHRheG9ub215KT8ucmVzdF9iYXNlO1xuICAgICAgICBpZiAoIXJlc3RCYXNlKSByZXR1cm4gW107XG4gICAgICAgIGNvbnN0IHRlcm1zID0gc2VsZWN0KGNvcmVEYXRhU3RvcmUpLmdldEVudGl0eVJlY29yZHMoJ3RheG9ub215JywgdGF4b25vbXksIHsgcG9zdDogcG9zdElkLCBwZXJfcGFnZTogJHtjb25maWcubWF4SXRlbXMgPz8gLTF9IH0pO1xuICAgICAgICBpZiAoIXRlcm1zKSByZXR1cm4gW107XG4gICAgICAgIHJldHVybiB0ZXJtcy5tYXAoKHQpID0+ICh7IGxhYmVsOiB0Lm5hbWUsIHVybDogdC5saW5rIHx8ICcnLCBzbHVnOiB0LnNsdWcgfHwgJycgfSkpJHttYXBFeHByfTtcbiAgICAgIH0sXG4gICAgICBbJHthdHRyTmFtZX1FbmFibGVkLCAke2F0dHJOYW1lfVNvdXJjZSwgJHthdHRyTmFtZX1UYXhvbm9teSwgSlNPTi5zdHJpbmdpZnkoJHthdHRyTmFtZX0gfHwgW10pXVxuICAgICk7XG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZHxTb3VyY2V8VGF4b25vbXkpYCwgJ2cnKTtcbiAgICAgICAgcHJldmlld0pzeCA9IHByZXZpZXdKc3gucmVwbGFjZShhcnJheVZhclJlZ2V4LCBgcHJldmlldyR7Y2FwfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzUGFnaW5hdGlvbkNvbmZpZyhjb25maWcpKSB7XG4gICAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBwcmV2aWV3JHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfSA9IFtdOyAvLyBQYWdpbmF0aW9uIHJlbmRlcnMgb24gdGhlIGZyb250ZW5kXG5gO1xuICAgICAgICBjb25zdCBhcnJheVZhclJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke2F0dHJOYW1lfVxcXFxiKD8hRW5hYmxlZClgLCAnZycpO1xuICAgICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIGBwcmV2aWV3JHthdHRyTmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGF0dHJOYW1lLnNsaWNlKDEpfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gRHluYW1pY0FycmF5Q29uZmlnIChwb3N0cyk6IGZ1bGwgdXNlU2VsZWN0IHJlc29sdXRpb25cbiAgICAgIGNvbnN0IGNhcCA9IGF0dHJOYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgYXR0ck5hbWUuc2xpY2UoMSk7XG4gICAgICBjb25zdCBwcmV2aWV3VmFyTmFtZSA9IGBwcmV2aWV3JHtjYXB9YDtcbiAgICAgIGNvbnN0IHJlc29sdmVkVmFyTmFtZSA9IGByZXNvbHZlZCR7Y2FwfWA7XG4gICAgICBjb25zdCByZXNvbHZpbmdWYXJOYW1lID0gYGlzUmVzb2x2aW5nJHtjYXB9YDtcbiAgICAgIHJlc29sdmluZ0ZsYWdzLnB1c2gocmVzb2x2aW5nVmFyTmFtZSk7XG4gICAgICBjb25zdCBzb3VyY2VBdHRyID0gYCR7YXR0ck5hbWV9U291cmNlYDtcbiAgICAgIGNvbnN0IHF1ZXJ5QXJnc0F0dHIgPSBgJHthdHRyTmFtZX1RdWVyeUFyZ3NgO1xuICAgICAgY29uc3QgcG9zdFR5cGVBdHRyID0gYCR7YXR0ck5hbWV9UG9zdFR5cGVgO1xuICAgICAgY29uc3Qgc2VsZWN0ZWRQb3N0c0F0dHIgPSBgJHthdHRyTmFtZX1TZWxlY3RlZFBvc3RzYDtcbiAgICAgIGNvbnN0IGZpZWxkTWFwcGluZ0F0dHIgPSBgJHthdHRyTmFtZX1GaWVsZE1hcHBpbmdgO1xuICAgICAgY29uc3QgaXRlbU92ZXJyaWRlc0F0dHIgPSBgJHthdHRyTmFtZX1JdGVtT3ZlcnJpZGVzYDtcbiAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCAke3Jlc29sdmVkVmFyTmFtZX0gPSB1c2VTZWxlY3QoXG4gICAgICAoc2VsZWN0KSA9PiB7XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAnbWFudWFsJykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgc3RvcmUgPSBzZWxlY3QoY29yZURhdGFTdG9yZSk7XG4gICAgICAgIGlmICgke3NvdXJjZUF0dHJ9ID09PSAncXVlcnknKSB7XG4gICAgICAgICAgY29uc3QgcXVlcnlBcmdzID0gJHtxdWVyeUFyZ3NBdHRyfSB8fCB7fTtcbiAgICAgICAgICBjb25zdCBwb3N0VHlwZSA9ICR7cG9zdFR5cGVBdHRyfSB8fCAncG9zdCc7XG4gICAgICAgICAgY29uc3QgYXJncyA9IHtcbiAgICAgICAgICAgIHBlcl9wYWdlOiBxdWVyeUFyZ3MucG9zdHNfcGVyX3BhZ2UgfHwgJHtjb25maWcubWF4SXRlbXMgPz8gNn0sXG4gICAgICAgICAgICBvcmRlcmJ5OiBxdWVyeUFyZ3Mub3JkZXJieSB8fCAnZGF0ZScsXG4gICAgICAgICAgICBvcmRlcjogKHF1ZXJ5QXJncy5vcmRlciB8fCAnREVTQycpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICBfZW1iZWQ6IHRydWUsXG4gICAgICAgICAgICBzdGF0dXM6ICdwdWJsaXNoJyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmIChxdWVyeUFyZ3MudGF4X3F1ZXJ5ICYmIHF1ZXJ5QXJncy50YXhfcXVlcnkubGVuZ3RoKSB7XG4gICAgICAgICAgICBxdWVyeUFyZ3MudGF4X3F1ZXJ5LmZvckVhY2goKHRxKSA9PiB7XG4gICAgICAgICAgICAgIGlmICghdHEudGF4b25vbXkgfHwgIXRxLnRlcm1zIHx8ICF0cS50ZXJtcy5sZW5ndGgpIHJldHVybjtcbiAgICAgICAgICAgICAgY29uc3QgcGFyYW0gPSB0cS50YXhvbm9teSA9PT0gJ2NhdGVnb3J5JyA/ICdjYXRlZ29yaWVzJyA6IHRxLnRheG9ub215ID09PSAncG9zdF90YWcnID8gJ3RhZ3MnIDogdHEudGF4b25vbXk7XG4gICAgICAgICAgICAgIGFyZ3NbcGFyYW1dID0gdHEudGVybXMuam9pbignLCcpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHJlY29yZHMgPSBzdG9yZS5nZXRFbnRpdHlSZWNvcmRzKCdwb3N0VHlwZScsIHBvc3RUeXBlLCBhcmdzKTtcbiAgICAgICAgICBpZiAocmVjb3JkcyA9PT0gbnVsbCB8fCByZWNvcmRzID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHJlY29yZHMpKSByZXR1cm4gW107XG4gICAgICAgICAgY29uc3QgbWFwcGluZyA9ICR7ZmllbGRNYXBwaW5nQXR0cn0gfHwge307XG4gICAgICAgICAgY29uc3Qgb3ZlcnJpZGVzID0gJHtpdGVtT3ZlcnJpZGVzQXR0cn0gfHwge307XG4gICAgICAgICAgcmV0dXJuIHJlY29yZHMubWFwKChyZWMpID0+XG4gICAgICAgICAgICBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCR7c291cmNlQXR0cn0gPT09ICdzZWxlY3QnKSB7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSAke3NlbGVjdGVkUG9zdHNBdHRyfSB8fCBbXTtcbiAgICAgICAgICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgcmV0dXJuIFtdO1xuICAgICAgICAgIGNvbnN0IG1hcHBpbmcgPSAke2ZpZWxkTWFwcGluZ0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIGNvbnN0IG92ZXJyaWRlcyA9ICR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9O1xuICAgICAgICAgIHJldHVybiBzZWxlY3RlZFxuICAgICAgICAgICAgLm1hcCgoc2VsKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlYyA9IHN0b3JlLmdldEVudGl0eVJlY29yZCgncG9zdFR5cGUnLCBzZWwudHlwZSB8fCAncG9zdCcsIHNlbC5pZCk7XG4gICAgICAgICAgICAgIHJldHVybiByZWMgPyBtYXBQb3N0RW50aXR5VG9JdGVtKHJlYywgbWFwcGluZywgb3ZlcnJpZGVzLCByZWMuX2VtYmVkZGVkIHx8IHt9KSA6IG51bGw7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9LFxuICAgICAgWyR7c291cmNlQXR0cn0sICR7cG9zdFR5cGVBdHRyfSwgSlNPTi5zdHJpbmdpZnkoJHtxdWVyeUFyZ3NBdHRyfSB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7c2VsZWN0ZWRQb3N0c0F0dHJ9IHx8IFtdKSwgSlNPTi5zdHJpbmdpZnkoJHtmaWVsZE1hcHBpbmdBdHRyfSB8fCB7fSksIEpTT04uc3RyaW5naWZ5KCR7aXRlbU92ZXJyaWRlc0F0dHJ9IHx8IHt9KV1cbiAgICApO1xuICAgIGNvbnN0ICR7cHJldmlld1Zhck5hbWV9ID0gJHtzb3VyY2VBdHRyfSAhPT0gJ21hbnVhbCcgPyAoJHtyZXNvbHZlZFZhck5hbWV9ID8/IFtdKSA6ICgke2F0dHJOYW1lfSA/PyBbXSk7XG4gICAgY29uc3QgJHtyZXNvbHZpbmdWYXJOYW1lfSA9ICR7c291cmNlQXR0cn0gIT09ICdtYW51YWwnICYmICR7cmVzb2x2ZWRWYXJOYW1lfSA9PT0gdW5kZWZpbmVkO1xuYDtcbiAgICAgIC8vIFVzZSBwcmV2aWV3IHZhcmlhYmxlIGluIHRoZSBnZW5lcmF0ZWQgcHJldmlldyBKU1ggc28gdGhlIGVkaXRvciBzaG93cyBxdWVyeS9zZWxlY3QgcmVzdWx0c1xuICAgICAgY29uc3QgYXJyYXlWYXJSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHthdHRyTmFtZX1cXFxcYmAsICdnJyk7XG4gICAgICBwcmV2aWV3SnN4ID0gcHJldmlld0pzeC5yZXBsYWNlKGFycmF5VmFyUmVnZXgsIHByZXZpZXdWYXJOYW1lKTtcbiAgICB9XG4gICAgaWYgKHJlc29sdmluZ0ZsYWdzLmxlbmd0aCA+IDApIHtcbiAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlICs9IGBcbiAgICBjb25zdCBpc1ByZXZpZXdMb2FkaW5nID0gJHtyZXNvbHZpbmdGbGFncy5qb2luKCcgfHwgJyl9O1xuYDtcbiAgICB9XG4gICAgLy8gV2hlbiBwcmV2aWV3IEpTWCByZWZlcmVuY2VzIHBhZ2luYXRpb24gKGZyb20gSEJTKSBidXQgcGFnaW5hdGlvbiBpcyBvbmx5IGJ1aWx0IHNlcnZlci1zaWRlLFxuICAgIC8vIGRlZmluZSBpdCBpbiB0aGUgZWRpdCBzbyB0aGUgZWRpdG9yIGRvZXNuJ3QgdGhyb3cgUmVmZXJlbmNlRXJyb3IuXG4gICAgY29uc3QgcHJldmlld1VzZXNQYWdpbmF0aW9uID0gL1xcYnBhZ2luYXRpb25cXGIvLnRlc3QocHJldmlld0pzeCk7XG4gICAgY29uc3QgYW55Q29uZmlnSGFzUGFnaW5hdGlvbiA9IGR5bmFtaWNBcnJheUNvbmZpZ3NcbiAgICAgID8gT2JqZWN0LnZhbHVlcyhkeW5hbWljQXJyYXlDb25maWdzKS5zb21lKChjKSA9PiAhKCdhcnJheVR5cGUnIGluIGMpICYmICEhKGMgYXMgRHluYW1pY0FycmF5Q29uZmlnKS5wYWdpbmF0aW9uKVxuICAgICAgOiBmYWxzZTtcbiAgICBpZiAocHJldmlld1VzZXNQYWdpbmF0aW9uICYmIGFueUNvbmZpZ0hhc1BhZ2luYXRpb24gJiYgIWR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlLmluY2x1ZGVzKCdjb25zdCBwYWdpbmF0aW9uJykpIHtcbiAgICAgIGR5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlID0gYCAgICBjb25zdCBwYWdpbmF0aW9uID0gW107IC8vIEVkaXRvcjogcGFnaW5hdGlvbiBpcyBidWlsdCBzZXJ2ZXItc2lkZSBpbiByZW5kZXIucGhwXG5gICsgZHluYW1pY0FycmF5UmVzb2x1dGlvbkNvZGU7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaW50ZXJhY3RpdmVDYW52YXMgPSBnZW5lcmF0ZUludGVyYWN0aXZlQ2FudmFzQ29kZShcbiAgICBjb21wb25lbnQuaWQsXG4gICAgYXR0ck5hbWVzLFxuICAgIGVkaXRvckNvbmZpZyxcbiAgICBjb21wb25lbnQud29yZHByZXNzLFxuICApO1xuICBpZiAoaW50ZXJhY3RpdmVDYW52YXMpIHtcbiAgICBwcmV2aWV3SnN4ID0gaW5qZWN0Q2FudmFzUmVmSW50b1ByZXZpZXdKc3gocHJldmlld0pzeCk7XG4gIH1cblxuICAvLyBXaGVuIHVzaW5nIGR5bmFtaWMgcG9zdHMsIHdyYXAgcHJldmlldyBpbiBsb2FkaW5nIHN0YXRlXG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIGNvbnN0IHByZXZpZXdDb250ZW50ID0gcmVzb2x2aW5nRmxhZ3MubGVuZ3RoID4gMFxuICAgID8gYHtpc1ByZXZpZXdMb2FkaW5nID8gKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IGlzLWxvYWRpbmdcIiBzdHlsZT17eyBtaW5IZWlnaHQ6ICcxMjBweCcsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgZ2FwOiAnOHB4JyB9fT5cbiAgICAgICAgICAgIDxTcGlubmVyIC8+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBjb2xvcjogJ3ZhcigtLXdwLWFkbWluLXRoZW1lLWNvbG9yLWRhcmtlciwgIzFlMWUxZSknIH19PntfXygnTG9hZGluZyBwb3N0c+KApicsICdoYW5kb2ZmJyl9PC9zcGFuPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICApIDogKFxuJHtwcmV2aWV3SnN4fVxuICAgICAgICApfWBcbiAgICA6IHByZXZpZXdKc3g7XG5cbiAgLy8gQ2hlY2sgdGhlIGdlbmVyYXRlZCBwcmV2aWV3IGZvciBjb21wb25lbnRzIHRoYXQgbmVlZCB0byBiZSBpbXBvcnRlZFxuICAvLyBUaGlzIGNhdGNoZXMgY29tcG9uZW50cyBhZGRlZCBieSB0aGUgaGFuZGxlYmFycy10by1qc3ggdHJhbnNwaWxlciAoZS5nLiwgZnJvbSB7eyNmaWVsZH19IG1hcmtlcnMpXG4gIGNvbnN0IHByZXZpZXdVc2VzUmljaFRleHQgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8UmljaFRleHQnKTtcbiAgY29uc3QgcHJldmlld1VzZXMxMHVwSW1hZ2UgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW1hZ2UnKTtcblxuICAvLyBBZGQgUmljaFRleHQgdG8gaW1wb3J0cyBpZiB1c2VkIGluIHByZXZpZXcgKGFuZCBub3QgYWxyZWFkeSBpbmNsdWRlZCBmcm9tIHByb3BlcnR5IHR5cGVzKVxuICBpZiAoKHByZXZpZXdVc2VzUmljaFRleHQgfHwgcHJldmlld1VzZXNMaW5rRmllbGQpICYmICFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ1JpY2hUZXh0JykpIHtcbiAgICBibG9ja0VkaXRvckltcG9ydHMucHVzaCgnUmljaFRleHQnKTtcbiAgfVxuXG4gIC8vIExpbmtDb250cm9sIGlzIG5lZWRlZCBmb3Igc2lkZWJhciBsaW5rL2J1dHRvbiBwcm9wZXJ0eSBwYW5lbHM7IGFkZCB1bmNvbmRpdGlvbmFsbHkgd2hlbiBwcmVzZW50LlxuICAvLyAoSGFuZG9mZkxpbmtGaWVsZCBpbiB0aGUgcHJldmlldyBpcyBzZXBhcmF0ZSDigJQgaXQncyBpbXBvcnRlZCBmcm9tIHRoZSBzaGFyZWQgY29tcG9uZW50IGFuZCBoYW5kbGVzIGl0cyBvd24gTGlua0NvbnRyb2wgaW50ZXJuYWxseS4pXG4gIGlmIChuZWVkc0xpbmtDb250cm9sKSB7XG4gICAgaWYgKCFibG9ja0VkaXRvckltcG9ydHMuaW5jbHVkZXMoJ0xpbmtDb250cm9sJykpIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdMaW5rQ29udHJvbCcpO1xuICAgIGlmICghY29tcG9uZW50SW1wb3J0cy5pbmNsdWRlcygnUG9wb3ZlcicpKSBjb21wb25lbnRJbXBvcnRzLnB1c2goJ1BvcG92ZXInKTtcbiAgfVxuXG4gIC8vIEFkZCBJbm5lckJsb2NrcyBpZiB1c2VkIGluIHByZXZpZXcgYnV0IG5vdCBhbHJlYWR5IGltcG9ydGVkXG4gIGNvbnN0IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPSBwcmV2aWV3SnN4LmluY2x1ZGVzKCc8SW5uZXJCbG9ja3MnKTtcbiAgaWYgKHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgJiYgIWJsb2NrRWRpdG9ySW1wb3J0cy5pbmNsdWRlcygnSW5uZXJCbG9ja3MnKSkge1xuICAgIGJsb2NrRWRpdG9ySW1wb3J0cy5wdXNoKCdJbm5lckJsb2NrcycpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIDEwdXAgaW1wb3J0IGlmIG5lZWRlZCAoSW1hZ2UgZm9yIHByZXZpZXcsIFJlcGVhdGVyIGZvciBhcnJheXMpXG4gIGlmIChwcmV2aWV3VXNlczEwdXBJbWFnZSkge1xuICAgIHRlblVwSW1wb3J0cy5wdXNoKCdJbWFnZScpO1xuICB9XG4gIGNvbnN0IHRlblVwSW1wb3J0ID0gdGVuVXBJbXBvcnRzLmxlbmd0aCA+IDBcbiAgICA/IGBpbXBvcnQgeyAke3RlblVwSW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0AxMHVwL2Jsb2NrLWNvbXBvbmVudHMnO1xcbmBcbiAgICA6ICcnO1xuXG4gIC8vIENvbGxlY3QgYWxsIGltYWdlIGZpZWxkcyBmb3IgQmxvY2tDb250cm9scy9NZWRpYVJlcGxhY2VGbG93XG4gIGludGVyZmFjZSBJbWFnZUZpZWxkSW5mbyB7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBhdHRyUGF0aDogc3RyaW5nOyAgLy8gZS5nLiwgJ2JhY2tncm91bmRJbWFnZScgb3IgJ2xlZnRDYXJkLmltYWdlJ1xuICAgIHZhbHVlRXhwcjogc3RyaW5nOyAvLyBlLmcuLCAnYmFja2dyb3VuZEltYWdlJyBvciAnbGVmdENhcmQ/LmltYWdlJ1xuICAgIHVwZGF0ZUV4cHI6IHN0cmluZzsgLy8gZS5nLiwgJ3NldEF0dHJpYnV0ZXMoeyBiYWNrZ3JvdW5kSW1hZ2U6IC4uLiB9KScgb3IgbmVzdGVkIHVwZGF0ZVxuICB9XG4gIFxuICBjb25zdCBpbWFnZUZpZWxkczogSW1hZ2VGaWVsZEluZm9bXSA9IFtdO1xuICBcbiAgY29uc3QgY29sbGVjdEltYWdlRmllbGRzID0gKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LCBwYXJlbnRQYXRoOiBzdHJpbmcgPSAnJywgcGFyZW50VmFsdWVQYXRoOiBzdHJpbmcgPSAnJykgPT4ge1xuICAgIGZvciAoY29uc3QgW2tleSwgcHJvcF0gb2YgT2JqZWN0LmVudHJpZXMocHJvcHMpKSB7XG4gICAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgICBjb25zdCBjdXJyZW50UGF0aCA9IHBhcmVudFBhdGggPyBgJHtwYXJlbnRQYXRofS4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZVBhdGggPSBwYXJlbnRWYWx1ZVBhdGggPyBgJHtwYXJlbnRWYWx1ZVBhdGh9Py4ke2F0dHJOYW1lfWAgOiBhdHRyTmFtZTtcbiAgICAgIFxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICBjb25zdCBsYWJlbCA9IHByb3AubmFtZSB8fCB0b1RpdGxlQ2FzZShrZXkpO1xuICAgICAgICBsZXQgdXBkYXRlRXhwcjogc3RyaW5nO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBhcmVudFBhdGgpIHtcbiAgICAgICAgICAvLyBOZXN0ZWQgaW1hZ2UgZmllbGQgLSBuZWVkIHRvIHNwcmVhZCBwYXJlbnQgb2JqZWN0XG4gICAgICAgICAgY29uc3QgcGFyZW50QXR0ciA9IHBhcmVudFBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICBjb25zdCBwYXJlbnRDYW1lbCA9IHRvQ2FtZWxDYXNlKHBhcmVudEF0dHIpO1xuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50Q2FtZWx9OiB7IC4uLiR7cGFyZW50Q2FtZWx9LCAke2F0dHJOYW1lfTogeyBpZDogbWVkaWEuaWQsIHNyYzogbWVkaWEudXJsLCBhbHQ6IG1lZGlhLmFsdCB8fCAnJyB9IH0gfSlgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRvcC1sZXZlbCBpbWFnZSBmaWVsZFxuICAgICAgICAgIHVwZGF0ZUV4cHIgPSBgc2V0QXR0cmlidXRlcyh7ICR7YXR0ck5hbWV9OiB7IGlkOiBtZWRpYS5pZCwgc3JjOiBtZWRpYS51cmwsIGFsdDogbWVkaWEuYWx0IHx8ICcnIH0gfSlgO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpbWFnZUZpZWxkcy5wdXNoKHtcbiAgICAgICAgICBsYWJlbCxcbiAgICAgICAgICBhdHRyUGF0aDogY3VycmVudFBhdGgsXG4gICAgICAgICAgdmFsdWVFeHByOiBjdXJyZW50VmFsdWVQYXRoLFxuICAgICAgICAgIHVwZGF0ZUV4cHJcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFJlY3Vyc2UgaW50byBvYmplY3QgcHJvcGVydGllc1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIGNvbGxlY3RJbWFnZUZpZWxkcyhwcm9wLnByb3BlcnRpZXMsIGN1cnJlbnRQYXRoLCBjdXJyZW50VmFsdWVQYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIFxuICBjb2xsZWN0SW1hZ2VGaWVsZHMocHJvcGVydGllcyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBCbG9ja0NvbnRyb2xzIHdpdGggTWVkaWFSZXBsYWNlRmxvdyBmb3IgZWFjaCBpbWFnZSBmaWVsZFxuICBjb25zdCBibG9ja0NvbnRyb2xzSnN4ID0gaW1hZ2VGaWVsZHMubGVuZ3RoID4gMCA/IGBcbiAgICAgICAgPEJsb2NrQ29udHJvbHMgZ3JvdXA9XCJvdGhlclwiPlxuJHtpbWFnZUZpZWxkcy5tYXAoZmllbGQgPT4gYCAgICAgICAgICA8TWVkaWFSZXBsYWNlRmxvd1xuICAgICAgICAgICAgbWVkaWFJZD17JHtmaWVsZC52YWx1ZUV4cHJ9Py5pZH1cbiAgICAgICAgICAgIG1lZGlhVXJsPXske2ZpZWxkLnZhbHVlRXhwcn0/LnNyY31cbiAgICAgICAgICAgIGFsbG93ZWRUeXBlcz17WydpbWFnZSddfVxuICAgICAgICAgICAgYWNjZXB0PVwiaW1hZ2UvKlwiXG4gICAgICAgICAgICBvblNlbGVjdD17KG1lZGlhKSA9PiAke2ZpZWxkLnVwZGF0ZUV4cHJ9fVxuICAgICAgICAgICAgbmFtZT17X18oJyR7ZmllbGQubGFiZWx9JywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmApLmpvaW4oJ1xcbicpfVxuICAgICAgICA8L0Jsb2NrQ29udHJvbHM+YCA6ICcnO1xuXG4gIC8vIFNoYXJlZCBjb21wb25lbnQgaW1wb3J0cyBmb3IgZHluYW1pYyBhcnJheXMgKHNlbGVjdG9yIFVJICsgZWRpdG9yIHByZXZpZXcgbWFwcGluZylcbiAgY29uc3Qgc2hhcmVkTmFtZWRJbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoaGFzRHluYW1pY0FycmF5cykgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0R5bmFtaWNQb3N0U2VsZWN0b3InLCAnbWFwUG9zdEVudGl0eVRvSXRlbScpO1xuICBpZiAoaGFzQnJlYWRjcnVtYnNBcnJheSkgc2hhcmVkTmFtZWRJbXBvcnRzLnB1c2goJ0JyZWFkY3J1bWJzU2VsZWN0b3InKTtcbiAgaWYgKGhhc1RheG9ub215QXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdUYXhvbm9teVNlbGVjdG9yJyk7XG4gIGlmIChoYXNQYWdpbmF0aW9uQXJyYXkpIHNoYXJlZE5hbWVkSW1wb3J0cy5wdXNoKCdQYWdpbmF0aW9uU2VsZWN0b3InKTtcblxuICBsZXQgc2hhcmVkQ29tcG9uZW50SW1wb3J0ID0gc2hhcmVkTmFtZWRJbXBvcnRzLmxlbmd0aFxuICAgID8gYGltcG9ydCB7ICR7c2hhcmVkTmFtZWRJbXBvcnRzLmpvaW4oJywgJyl9IH0gZnJvbSAnLi4vLi4vc2hhcmVkJztcXG5gXG4gICAgOiAnJztcbiAgY29uc3QgbmVlZHNEYXRhU3RvcmUgPSBoYXNEeW5hbWljQXJyYXlzIHx8IGhhc1RheG9ub215QXJyYXk7XG4gIGlmIChuZWVkc0RhdGFTdG9yZSkge1xuICAgIHNoYXJlZENvbXBvbmVudEltcG9ydCArPSBgaW1wb3J0IHsgdXNlU2VsZWN0JHtoYXNCcmVhZGNydW1ic0FycmF5ID8gJywgc2VsZWN0JyA6ICcnfSB9IGZyb20gJ0B3b3JkcHJlc3MvZGF0YSc7XFxuaW1wb3J0IHsgc3RvcmUgYXMgY29yZURhdGFTdG9yZSB9IGZyb20gJ0B3b3JkcHJlc3MvY29yZS1kYXRhJztcXG5gO1xuICB9XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgc2hhcmVkQ29tcG9uZW50SW1wb3J0ICs9IGBpbXBvcnQgYXBpRmV0Y2ggZnJvbSAnQHdvcmRwcmVzcy9hcGktZmV0Y2gnO1xcbmA7XG4gIH1cblxuICAvLyBCdWlsZCBlbGVtZW50IGltcG9ydHNcbiAgY29uc3QgZWxlbWVudEltcG9ydHMgPSBbJ0ZyYWdtZW50J107XG4gIGlmIChoYXNCcmVhZGNydW1ic0FycmF5KSB7XG4gICAgZWxlbWVudEltcG9ydHMucHVzaCgndXNlU3RhdGUnLCAndXNlRWZmZWN0Jyk7XG4gIH1cbiAgaWYgKGludGVyYWN0aXZlQ2FudmFzKSB7XG4gICAgZm9yIChjb25zdCBlbCBvZiBpbnRlcmFjdGl2ZUNhbnZhcy5lbGVtZW50SW1wb3J0cykge1xuICAgICAgaWYgKCFlbGVtZW50SW1wb3J0cy5pbmNsdWRlcyhlbCkpIGVsZW1lbnRJbXBvcnRzLnB1c2goZWwpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGludGVyYWN0aXZlSW1wb3J0ID1cbiAgICBpbnRlcmFjdGl2ZUNhbnZhcz8uaW1wb3J0TGluZXMgPyBgJHtpbnRlcmFjdGl2ZUNhbnZhcy5pbXBvcnRMaW5lc31cXG5gIDogJyc7XG4gIGNvbnN0IGludGVyYWN0aXZlSG9vayA9IGludGVyYWN0aXZlQ2FudmFzPy5ob29rTGluZXNcbiAgICA/IGAke2ludGVyYWN0aXZlQ2FudmFzLmhvb2tMaW5lc31cXG5gXG4gICAgOiAnJztcblxuICAvLyBJbXBvcnQgc2hhcmVkIEhhbmRvZmZMaW5rRmllbGQgd2hlbiBwcmV2aWV3IHVzZXMgbGluay9idXR0b24gaW5saW5lIGVkaXRpbmdcbiAgY29uc3QgbGlua0ZpZWxkSW1wb3J0ID0gcHJldmlld1VzZXNMaW5rRmllbGQgPyBgaW1wb3J0IHsgSGFuZG9mZkxpbmtGaWVsZCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jb21wb25lbnRzL0xpbmtGaWVsZCc7XFxuYCA6ICcnO1xuXG4gIC8vIFNjcmVlbnNob3QgaW1wb3J0IGZvciBpbnNlcnRlciBwcmV2aWV3XG4gIGNvbnN0IHNjcmVlbnNob3RJbXBvcnQgPSBoYXNTY3JlZW5zaG90ID8gYGltcG9ydCBzY3JlZW5zaG90VXJsIGZyb20gJy4vc2NyZWVuc2hvdC5wbmcnO1xcbmAgOiAnJztcblxuICAvLyBTVkcgaWNvbiBmb3IgdGhlIGJsb2NrICh1bmlxdWUgcGVyIGJsb2NrLCBjb2xvcmVkIGJ5IGdyb3VwKVxuICBjb25zdCBzdmdJY29uU3RyID0gZ2VuZXJhdGVTdmdJY29uKGNvbXBvbmVudC50aXRsZSwgY29tcG9uZW50Lmdyb3VwKTtcbiAgY29uc3Qgc3ZnSWNvbkNvZGUgPSBgY29uc3QgYmxvY2tJY29uID0gKFxuICAke3N2Z0ljb25TdHJ9XG4pO2A7XG5cbiAgLy8gSW5zZXJ0ZXIgcHJldmlldzogc2hvdyBzY3JlZW5zaG90IGltYWdlIGluc3RlYWQgb2YgbGl2ZS1yZW5kZXJpbmdcbiAgY29uc3QgcHJldmlld0Vhcmx5UmV0dXJuID0gaGFzU2NyZWVuc2hvdFxuICAgID8gYCAgICBpZiAoYXR0cmlidXRlcy5fX3ByZXZpZXcpIHtcbiAgICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgey4uLmJsb2NrUHJvcHN9PlxuICAgICAgICAgIDxpbWcgc3JjPXtzY3JlZW5zaG90VXJsfSBhbHQ9e21ldGFkYXRhLnRpdGxlfSBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICdhdXRvJyB9fSAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICk7XG4gICAgfVxuYFxuICAgIDogJyc7XG5cbiAgcmV0dXJuIGBpbXBvcnQgeyByZWdpc3RlckJsb2NrVHlwZSB9IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2tzJztcbmltcG9ydCB7IFxuICAke2Jsb2NrRWRpdG9ySW1wb3J0cy5qb2luKCcsXFxuICAnKX0gXG59IGZyb20gJ0B3b3JkcHJlc3MvYmxvY2stZWRpdG9yJztcbmltcG9ydCB7IFxuICAke2NvbXBvbmVudEltcG9ydHMuam9pbignLFxcbiAgJyl9IFxufSBmcm9tICdAd29yZHByZXNzL2NvbXBvbmVudHMnO1xuaW1wb3J0IHsgX18gfSBmcm9tICdAd29yZHByZXNzL2kxOG4nO1xuaW1wb3J0IHsgJHtlbGVtZW50SW1wb3J0cy5qb2luKCcsICcpfSB9IGZyb20gJ0B3b3JkcHJlc3MvZWxlbWVudCc7XG4ke3RlblVwSW1wb3J0fSR7c2hhcmVkQ29tcG9uZW50SW1wb3J0fWltcG9ydCBtZXRhZGF0YSBmcm9tICcuL2Jsb2NrLmpzb24nO1xuaW1wb3J0ICcuL2VkaXRvci5zY3NzJztcbiR7aGFzRHluYW1pY0FycmF5cyA/IFwiaW1wb3J0ICcuLi8uLi9zaGFyZWQvY29tcG9uZW50cy9EeW5hbWljUG9zdFNlbGVjdG9yLmVkaXRvci5zY3NzJztcXG5cIiA6ICcnfWltcG9ydCAnLi9zdHlsZS5zY3NzJztcbiR7c2NyZWVuc2hvdEltcG9ydH0ke2ludGVyYWN0aXZlSW1wb3J0fSR7bGlua0ZpZWxkSW1wb3J0fVxuJHtzdmdJY29uQ29kZX1cblxuJHtkZXByZWNhdGlvbnNDb2RlID8gYCR7ZGVwcmVjYXRpb25zQ29kZX1cXG5cXG5gIDogJyd9cmVnaXN0ZXJCbG9ja1R5cGUobWV0YWRhdGEubmFtZSwge1xuICAuLi5tZXRhZGF0YSxcbiAgaWNvbjogYmxvY2tJY29uLCR7ZGVwcmVjYXRpb25zQ29kZSA/ICdcXG4gIGRlcHJlY2F0ZWQsJyA6ICcnfVxuICBlZGl0OiAoeyBhdHRyaWJ1dGVzLCBzZXRBdHRyaWJ1dGVzLCBpc1NlbGVjdGVkIH0pID0+IHtcbiAgICBjb25zdCBibG9ja1Byb3BzID0gdXNlQmxvY2tQcm9wcygpO1xuJHtwcmV2aWV3RWFybHlSZXR1cm59JHt1c2VJbm5lckJsb2NrcyB8fCBwcmV2aWV3VXNlc0lubmVyQmxvY2tzID8gXCIgICAgY29uc3QgQ09OVEVOVF9CTE9DS1MgPSBbJ2NvcmUvcGFyYWdyYXBoJywnY29yZS9oZWFkaW5nJywnY29yZS9saXN0JywnY29yZS9saXN0LWl0ZW0nLCdjb3JlL3F1b3RlJywnY29yZS9pbWFnZScsJ2NvcmUvc2VwYXJhdG9yJywnY29yZS9odG1sJywnY29yZS9idXR0b25zJywnY29yZS9idXR0b24nXTtcIiA6ICcnfVxuICAgIGNvbnN0IHsgJHthdHRyTmFtZXMuam9pbignLCAnKX0gfSA9IGF0dHJpYnV0ZXM7XG4ke2R5bmFtaWNBcnJheVJlc29sdXRpb25Db2RlfVxuJHthcnJheUhlbHBlcnN9XG4ke2ludGVyYWN0aXZlSG9va30gICAgcmV0dXJuIChcbiAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgPEluc3BlY3RvckNvbnRyb2xzPlxuJHtwYW5lbHMuam9pbignXFxuXFxuJyl9XG4gICAgICAgIDwvSW5zcGVjdG9yQ29udHJvbHM+XG4ke2Jsb2NrQ29udHJvbHNKc3h9XG5cbiAgICAgICAgey8qIEVkaXRvciBQcmV2aWV3ICovfVxuICAgICAgICA8ZGl2IHsuLi5ibG9ja1Byb3BzfT5cbiR7cHJldmlld0NvbnRlbnR9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9GcmFnbWVudD5cbiAgICApO1xuICB9LFxuICBzYXZlOiAoKSA9PiB7XG4ke3VzZUlubmVyQmxvY2tzIHx8IHByZXZpZXdVc2VzSW5uZXJCbG9ja3MgPyAnICAgIC8vIElubmVyQmxvY2tzIGNvbnRlbnQgbXVzdCBiZSBzYXZlZCBzbyBpdCBpcyBwZXJzaXN0ZWQgaW4gcG9zdCBjb250ZW50XFxuICAgIHJldHVybiA8SW5uZXJCbG9ja3MuQ29udGVudCAvPjsnIDogJyAgICAvLyBTZXJ2ZXItc2lkZSByZW5kZXJpbmcgdmlhIHJlbmRlci5waHBcXG4gICAgcmV0dXJuIG51bGw7J31cbiAgfSxcbn0pO1xuYDtcbn07XG5cbmV4cG9ydCB7XG4gIGdlbmVyYXRlSW5kZXhKcyxcbiAgZ2VuZXJhdGVTdmdJY29uLFxuICB0b1RpdGxlQ2FzZSxcbiAgZ2VuZXJhdGVGaWVsZENvbnRyb2wsXG4gIGdlbmVyYXRlQXJyYXlDb250cm9sLFxuICBnZW5lcmF0ZVByb3BlcnR5Q29udHJvbCxcbiAgaXNPcGFjaXR5UmFuZ2VGaWVsZCxcbiAgZ2V0TnVtYmVyQ29udHJvbFNwZWMsXG4gIGhhc09wYWNpdHlSYW5nZUZpZWxkLFxuICBoYXNOb25PcGFjaXR5TnVtYmVyRmllbGQsXG59O1xuZXhwb3J0IHR5cGUgeyBGaWVsZENvbnRleHQsIE51bWJlckNvbnRyb2xTcGVjIH07XG4iXX0=