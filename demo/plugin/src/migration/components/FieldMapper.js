/**
 * FieldMapper — two-column mapping UI.
 *
 * Left:  source field keys (dotted, with value previews).
 * Right: dropdown to select the Handoff schema field to map to.
 *
 * sourceFields is a flat { key → value } map where keys are dotted source paths,
 * e.g. "core.post_title", "acf.cynosure_hero.headline", "meta.some_key".
 */

import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { SelectControl } from '@wordpress/components';

/**
 * Flatten a migration schema's properties into selectable dotted paths.
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

function previewValue(val) {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 80);
  const s = String(val);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

export default function FieldMapper({ sourceFields, schema, fieldMappings, onChange }) {
  const sourceKeys = useMemo(() => Object.keys(sourceFields || {}), [sourceFields]);

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

  const update = (sourceKey, handoffPath) => {
    const next = { ...fieldMappings };
    if (handoffPath) {
      next[sourceKey] = handoffPath;
    } else {
      delete next[sourceKey];
    }
    onChange(next);
  };

  if (sourceKeys.length === 0) {
    return <p>{__('No source fields available to map.', 'handoff')}</p>;
  }

  return (
    <table className="widefat" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={{ width: '35%' }}>{__('Source Field', 'handoff')}</th>
          <th style={{ width: '20%' }}>{__('Value Preview', 'handoff')}</th>
          <th style={{ width: '45%' }}>{__('Map To (Handoff Block Attribute)', 'handoff')}</th>
        </tr>
      </thead>
      <tbody>
        {sourceKeys.map((key) => (
          <tr key={key} style={{ background: fieldMappings[key] ? '#f0f8ff' : undefined }}>
            <td>
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{key}</code>
            </td>
            <td style={{ color: '#757575', fontSize: 11, wordBreak: 'break-all' }}>
              {previewValue(sourceFields[key])}
            </td>
            <td>
              <SelectControl
                value={fieldMappings[key] || ''}
                options={handoffOptions}
                onChange={(val) => update(key, val)}
                __nextHasNoMarginBottom
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
