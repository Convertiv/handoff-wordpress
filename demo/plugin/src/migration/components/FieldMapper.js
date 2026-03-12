/**
 * FieldMapper — two-column mapping UI.
 *
 * Left: ACF field names with value previews.
 * Right: dropdown to select the Handoff schema field to map to.
 */

import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { SelectControl } from '@wordpress/components';

/**
 * Flatten a migration schema's properties into a list of
 * dot-notation paths with labels and types.
 */
function flattenSchemaProps(properties, prefix = '') {
  const result = [];
  if (!properties) return result;

  for (const [key, prop] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push({ path, label: prop.label || key, type: prop.type });

    if (prop.type === 'object' && prop.properties) {
      result.push(...flattenSchemaProps(prop.properties, path));
    }
    if (prop.type === 'link' || prop.type === 'button') {
      // Expose sub-fields for links/buttons
      const subFields = prop.type === 'link'
        ? { label: 'Label', url: 'URL', opensInNewTab: 'Opens in New Tab' }
        : { label: 'Label', href: 'URL', target: 'Target' };
      for (const [sk, sl] of Object.entries(subFields)) {
        result.push({ path: `${path}.${sk}`, label: `${prop.label || key} > ${sl}`, type: 'text' });
      }
    }
  }

  return result;
}

/**
 * Truncate a value for display preview.
 */
function previewValue(val) {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 80);
  const s = String(val);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

export default function FieldMapper({ acfData, schema, fieldMappings, onChange }) {
  const acfFields = useMemo(() => Object.keys(acfData || {}), [acfData]);

  const handoffOptions = useMemo(() => {
    const flat = flattenSchemaProps(schema.properties);
    return [
      { label: __('— Do not map —', 'handoff'), value: '' },
      ...flat.map((f) => ({
        label: `${f.label} (${f.type}) — ${f.path}`,
        value: f.path,
      })),
    ];
  }, [schema]);

  const update = (acfKey, handoffPath) => {
    const next = { ...fieldMappings };
    if (handoffPath) {
      next[acfKey] = handoffPath;
    } else {
      delete next[acfKey];
    }
    onChange(next);
  };

  if (acfFields.length === 0) {
    return <p>{__('No ACF field data found in this block.', 'handoff')}</p>;
  }

  return (
    <table className="widefat" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={{ width: '30%' }}>{__('ACF Field', 'handoff')}</th>
          <th style={{ width: '25%' }}>{__('Value Preview', 'handoff')}</th>
          <th style={{ width: '45%' }}>{__('Map To (Handoff)', 'handoff')}</th>
        </tr>
      </thead>
      <tbody>
        {acfFields.map((acfKey) => (
          <tr key={acfKey}>
            <td><code>{acfKey}</code></td>
            <td style={{ color: '#757575', fontSize: 12, wordBreak: 'break-all' }}>
              {previewValue(acfData[acfKey])}
            </td>
            <td>
              <SelectControl
                value={fieldMappings[acfKey] || ''}
                options={handoffOptions}
                onChange={(val) => update(acfKey, val)}
                __nextHasNoMarginBottom
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
