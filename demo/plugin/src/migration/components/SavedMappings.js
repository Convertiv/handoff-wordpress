/**
 * SavedMappings — lists all saved page mapping templates.
 *
 * Each mapping now has the shape:
 *   { label, updatedAt, metaCopy[], blocks[{ id, label, targetBlock, fieldMappings }] }
 */

import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { Button } from '@wordpress/components';

export default function SavedMappings({ mappings, schemas, onRefresh, onNotice }) {
  const entries = Object.entries(mappings);

  const deleteMapping = (name) => {
    apiFetch({
      path: `/handoff/v1/migration/mappings/${encodeURIComponent(name)}`,
      method: 'DELETE',
    }).then(() => {
      onRefresh();
      onNotice({ status: 'success', message: __('Mapping deleted.', 'handoff') });
    }).catch((err) => {
      onNotice({ status: 'error', message: err.message });
    });
  };

  if (entries.length === 0) {
    return (
      <p>
        {__('No saved page mappings yet. Go to the Pages tab, select a page, and create a mapping.', 'handoff')}
      </p>
    );
  }

  return (
    <table className="widefat striped">
      <thead>
        <tr>
          <th style={{ width: '20%' }}>{__('Name / Label', 'handoff')}</th>
          <th style={{ width: '35%' }}>{__('Blocks', 'handoff')}</th>
          <th style={{ width: '20%' }}>{__('Meta Copied', 'handoff')}</th>
          <th style={{ width: '15%' }}>{__('Last Updated', 'handoff')}</th>
          <th style={{ width: '10%' }}></th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, m]) => {
          const blockList   = Array.isArray(m.blocks) ? m.blocks : [];
          const metaList    = Array.isArray(m.metaCopy) ? m.metaCopy : [];
          const blockSlugs  = blockList
            .map((b) => schemas[b.targetBlock]?.title || b.targetBlock || b.label || '?')
            .join(', ');
          const metaLabels  = metaList
            .map((k) => META_LABEL[k] || k)
            .join(', ');

          return (
            <tr key={name}>
              <td>
                <strong>{m.label || name}</strong>
                <br />
                <code style={{ fontSize: 11, color: '#888' }}>{name}</code>
              </td>
              <td>
                <span style={{ color: '#0073aa', fontWeight: 600 }}>{blockList.length}</span>
                {blockList.length > 0 && (
                  <span style={{ color: '#555', fontSize: 12, marginLeft: 6 }}>
                    — {blockSlugs}
                  </span>
                )}
              </td>
              <td>
                {metaLabels || <span style={{ color: '#aaa' }}>—</span>}
              </td>
              <td>{m.updatedAt || '—'}</td>
              <td>
                <Button variant="link" isDestructive onClick={() => deleteMapping(name)}>
                  {__('Delete', 'handoff')}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const META_LABEL = {
  post_title:        'Title',
  post_excerpt:      'Excerpt',
  post_name:         'Slug',
  featured_image:    'Featured Image',
  _wp_page_template: 'Page Template',
};
