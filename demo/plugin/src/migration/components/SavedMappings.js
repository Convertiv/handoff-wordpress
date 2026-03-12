/**
 * SavedMappings — lists all saved ACF-to-Handoff mapping templates.
 */

import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { Button } from '@wordpress/components';

export default function SavedMappings({ mappings, schemas, onRefresh, onNotice }) {
  const entries = Object.entries(mappings);

  const deleteMapping = (acfBlock) => {
    apiFetch({
      path: `/handoff/v1/migration/mappings/${encodeURIComponent(acfBlock)}`,
      method: 'DELETE',
    }).then(() => {
      onRefresh();
      onNotice({ status: 'success', message: __('Mapping deleted.', 'handoff') });
    });
  };

  if (entries.length === 0) {
    return <p>{__('No saved mappings yet. Map some blocks from the Pages tab first.', 'handoff')}</p>;
  }

  return (
    <table className="widefat striped">
      <thead>
        <tr>
          <th>{__('ACF Block', 'handoff')}</th>
          <th>{__('Target Handoff Block', 'handoff')}</th>
          <th>{__('Mapped Fields', 'handoff')}</th>
          <th>{__('Last Updated', 'handoff')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([acfBlock, m]) => {
          const fieldCount = m.fieldMappings ? Object.keys(m.fieldMappings).length : 0;
          const targetTitle = schemas[m.targetBlock]?.title || m.targetBlock;

          return (
            <tr key={acfBlock}>
              <td><code>{acfBlock}</code></td>
              <td>{targetTitle}</td>
              <td>{fieldCount}</td>
              <td>{m.updatedAt || '—'}</td>
              <td>
                <Button variant="link" isDestructive onClick={() => deleteMapping(acfBlock)}>
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
