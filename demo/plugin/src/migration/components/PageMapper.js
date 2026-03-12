/**
 * PageMapper — the core mapping UI.
 *
 * For a selected page, shows each ACF block found, lets the user
 * pick a target Handoff block, map fields, save the mapping,
 * and run migration.
 */

import { useState, useEffect, useMemo } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import {
  Button,
  SelectControl,
  Spinner,
  Card,
  CardBody,
  CardHeader,
  PanelBody,
  Flex,
} from '@wordpress/components';

import FieldMapper from './FieldMapper';

export default function PageMapper({ pageId, schemas, mappings, onMappingSaved, onNotice }) {
  const [blocks, setBlocks] = useState(null);
  const [blockMappings, setBlockMappings] = useState({});
  const [migrating, setMigrating] = useState(false);

  const schemaOptions = useMemo(() => {
    const opts = [{ label: __('— Select target block —', 'handoff'), value: '' }];
    Object.values(schemas).forEach((s) => {
      opts.push({ label: `${s.title} (${s.blockName})`, value: s.blockName });
    });
    return opts;
  }, [schemas]);

  useEffect(() => {
    apiFetch({ path: `/handoff/v1/migration/pages/${pageId}/blocks` })
      .then((data) => {
        setBlocks(data);
        // Pre-populate mappings from saved templates
        const initial = {};
        data.forEach((b) => {
          if (mappings[b.blockName]) {
            initial[b.blockName] = { ...mappings[b.blockName] };
          }
        });
        setBlockMappings(initial);
      })
      .catch((err) => {
        onNotice({ status: 'error', message: err.message });
        setBlocks([]);
      });
  }, [pageId]);

  const updateMapping = (acfBlockName, key, value) => {
    setBlockMappings((prev) => ({
      ...prev,
      [acfBlockName]: {
        ...prev[acfBlockName],
        [key]: value,
      },
    }));
  };

  const saveMapping = (acfBlockName) => {
    const m = blockMappings[acfBlockName];
    if (!m || !m.targetBlock) return;

    apiFetch({
      path: '/handoff/v1/migration/mappings',
      method: 'POST',
      data: {
        acfBlock: acfBlockName,
        targetBlock: m.targetBlock,
        fieldMappings: m.fieldMappings || {},
      },
    }).then(() => {
      onMappingSaved();
      onNotice({ status: 'success', message: __('Mapping saved.', 'handoff') });
    });
  };

  const runMigration = (mode) => {
    setMigrating(true);
    apiFetch({
      path: '/handoff/v1/migration/migrate',
      method: 'POST',
      data: { postId: pageId, mode },
    })
      .then((res) => {
        setMigrating(false);
        if (res.success) {
          onNotice({
            status: 'success',
            message: `${res.message} ${res.editUrl ? '' : ''}`,
          });
        }
      })
      .catch((err) => {
        setMigrating(false);
        onNotice({ status: 'error', message: err.message });
      });
  };

  if (blocks === null) return <Spinner />;

  if (blocks.length === 0) {
    return <p>{__('No ACF blocks found on this page.', 'handoff')}</p>;
  }

  // Deduplicate by ACF block type for the mapping UI
  const uniqueTypes = [...new Set(blocks.map((b) => b.blockName))];

  return (
    <div className="handoff-migration__mapper">
      <h2>{__('ACF Blocks Found', 'handoff')}</h2>
      <p className="description">
        {blocks.length} {__('ACF block(s) across', 'handoff')}{' '}
        {uniqueTypes.length} {__('type(s).', 'handoff')}
      </p>

      {uniqueTypes.map((acfName) => {
        const sample = blocks.find((b) => b.blockName === acfName);
        const count = blocks.filter((b) => b.blockName === acfName).length;
        const m = blockMappings[acfName] || {};
        const targetSchema = m.targetBlock ? schemas[m.targetBlock] : null;

        return (
          <Card key={acfName} style={{ marginBottom: 16 }}>
            <CardHeader>
              <Flex justify="space-between" align="center">
                <div>
                  <strong>{acfName}</strong>
                  <span style={{ marginLeft: 8, color: '#757575' }}>
                    ({count} {count === 1 ? __('instance', 'handoff') : __('instances', 'handoff')})
                  </span>
                </div>
              </Flex>
            </CardHeader>
            <CardBody>
              <SelectControl
                label={__('Target Handoff Block', 'handoff')}
                value={m.targetBlock || ''}
                options={schemaOptions}
                onChange={(val) => updateMapping(acfName, 'targetBlock', val)}
                __nextHasNoMarginBottom
              />

              {targetSchema && sample && (
                <div style={{ marginTop: 16 }}>
                  <FieldMapper
                    acfData={sample.data}
                    schema={targetSchema}
                    fieldMappings={m.fieldMappings || {}}
                    onChange={(fm) => updateMapping(acfName, 'fieldMappings', fm)}
                  />
                </div>
              )}

              {m.targetBlock && (
                <div style={{ marginTop: 16 }}>
                  <Button variant="secondary" onClick={() => saveMapping(acfName)}>
                    {__('Save Mapping', 'handoff')}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}

      <hr />

      <h2>{__('Migrate', 'handoff')}</h2>
      <Flex gap={3}>
        <Button
          variant="primary"
          onClick={() => runMigration('draft')}
          disabled={migrating}
        >
          {migrating ? <Spinner /> : __('Migrate to New Draft', 'handoff')}
        </Button>
        <Button
          variant="secondary"
          isDestructive
          onClick={() => runMigration('in-place')}
          disabled={migrating}
        >
          {__('Migrate In-Place', 'handoff')}
        </Button>
      </Flex>
    </div>
  );
}
