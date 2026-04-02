/**
 * MigrationApp — top-level router for the migration admin page.
 *
 * Three views: PageList (default), PageMapper, SavedMappings.
 */

import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import {
  Button,
  TabPanel,
  Spinner,
  Notice,
} from '@wordpress/components';

import PageList from './PageList';
import PageMapper from './PageMapper';
import SavedMappings from './SavedMappings';

/**
 * @param {{ embedded?: boolean }} props
 * When embedded is true (Handoff hub), skip outer title and .wrap — parent layout provides context.
 */
export default function MigrationApp({ embedded = false }) {
  const [schemas, setSchemas] = useState(null);
  const [mappings, setMappings] = useState({});
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    apiFetch({ path: '/handoff/v1/migration/schemas' }).then(setSchemas);
    apiFetch({ path: '/handoff/v1/migration/mappings' }).then(setMappings);
  }, []);

  const refreshMappings = () => {
    apiFetch({ path: '/handoff/v1/migration/mappings' }).then(setMappings);
  };

  const shellClass = embedded ? 'handoff-migration handoff-migration--embedded' : 'wrap handoff-migration';

  if (schemas === null) {
    return (
      <div className={shellClass}>
        {!embedded && <h1>{__('Handoff Migration', 'handoff')}</h1>}
        <Spinner />
      </div>
    );
  }

  if (selectedPageId) {
    return (
      <div className={shellClass}>
        {!embedded && <h1>{__('Handoff Migration', 'handoff')}</h1>}
        {notice && (
          <Notice status={notice.status} isDismissible onDismiss={() => setNotice(null)}>
            {notice.message}
          </Notice>
        )}
        <Button variant="link" onClick={() => setSelectedPageId(null)} style={{ marginBottom: 16 }}>
          &larr; {__('Back to page list', 'handoff')}
        </Button>
        <PageMapper
          pageId={selectedPageId}
          schemas={schemas}
          mappings={mappings}
          onMappingSaved={refreshMappings}
          onNotice={setNotice}
        />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {!embedded && <h1>{__('Handoff Migration', 'handoff')}</h1>}
      {notice && (
        <Notice status={notice.status} isDismissible onDismiss={() => setNotice(null)}>
          {notice.message}
        </Notice>
      )}
      <TabPanel
        tabs={[
          { name: 'pages', title: __('Pages', 'handoff') },
          { name: 'mappings', title: __('Saved Mappings', 'handoff') },
        ]}
      >
        {(tab) => {
          if (tab.name === 'pages') {
            return (
              <PageList
                onSelect={(id) => setSelectedPageId(id)}
                onNotice={setNotice}
              />
            );
          }
          return (
            <SavedMappings
              mappings={mappings}
              schemas={schemas}
              onRefresh={refreshMappings}
              onNotice={setNotice}
            />
          );
        }}
      </TabPanel>
    </div>
  );
}
