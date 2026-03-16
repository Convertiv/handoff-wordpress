/**
 * PageMapper — page-level migration mapping tool.
 *
 * One "page mapping" defines the complete Gutenberg output for a page:
 *   - name        machine-readable key, used to look up / overwrite the mapping
 *   - label       human-readable display name
 *   - metaCopy    checklist of WP fields to copy verbatim from the source post
 *   - blocks      ordered list of block recipes { id, label, targetBlock, fieldMappings }
 *
 * The whole mapping is saved as a single entity via POST /mappings.
 * Migration passes mappingName so only this mapping's blocks are generated.
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
  Flex,
  TextControl,
  CheckboxControl,
} from '@wordpress/components';

import FieldMapper from './FieldMapper';

// ── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function SourceTab({ id, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        border: '1px solid #ccc',
        borderBottom: active ? '2px solid #0073aa' : '1px solid #ccc',
        background: active ? '#fff' : '#f6f7f7',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        borderRadius: '3px 3px 0 0',
        marginRight: 4,
      }}
    >
      {label}
    </button>
  );
}

function SourceFieldTable({ flatFields }) {
  const entries = Object.entries(flatFields || {});
  if (entries.length === 0) {
    return <p style={{ color: '#888' }}>{__('No fields in this source.', 'handoff')}</p>;
  }
  return (
    <table className="widefat" style={{ tableLayout: 'fixed', marginTop: 8 }}>
      <thead>
        <tr>
          <th style={{ width: '40%' }}>{__('Field Key', 'handoff')}</th>
          <th>{__('Value Preview', 'handoff')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, val]) => (
          <tr key={key}>
            <td><code style={{ fontSize: 11, wordBreak: 'break-all' }}>{key}</code></td>
            <td style={{ color: '#555', fontSize: 12, wordBreak: 'break-all' }}>
              {previewValue(val)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function previewValue(val) {
  if (val === null || val === undefined) return <em style={{ color: '#aaa' }}>(empty)</em>;
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

const META_COPY_OPTIONS = [
  { key: 'post_title',        label: 'Title' },
  { key: 'post_excerpt',      label: 'Excerpt' },
  { key: 'post_name',         label: 'URL Slug' },
  { key: 'featured_image',    label: 'Featured Image' },
  { key: '_wp_page_template', label: 'Page Template' },
];

// ── Main component ───────────────────────────────────────────────────────────

export default function PageMapper({ pageId, schemas, mappings, onMappingSaved, onNotice }) {
  // Content explorer state
  const [content, setContent]           = useState(null);
  const [activeSource, setActiveSource] = useState(null);

  // Page mapping state
  const [mappingName, setMappingName]   = useState('');
  const [mappingLabel, setMappingLabel] = useState('');
  const [metaCopy, setMetaCopy]         = useState(['post_title', 'featured_image', '_wp_page_template']);
  const [blocks, setBlocks]             = useState([]);   // ordered block recipes
  const [collapsedBlocks, setCollapsedBlocks] = useState(new Set()); // localIds of collapsed cards

  // Migration state
  const [migrating, setMigrating]       = useState(false);

  // ── Schema options for SelectControl ──────────────────────────────
  const schemaOptions = useMemo(() => {
    const opts = [{ label: __('— Select target block —', 'handoff'), value: '' }];
    Object.values(schemas).forEach((s) => {
      opts.push({ label: `${s.title || s.blockName} (${s.blockName})`, value: s.blockName });
    });
    return opts;
  }, [schemas]);

  // ── Load page content and hydrate from saved mappings ─────────────
  useEffect(() => {
    apiFetch({ path: `/handoff/v1/migration/pages/${pageId}/content` })
      .then((data) => {
        setContent(data);
        const sourceIds = Object.keys(data.sources || {});
        if (sourceIds.length > 0) setActiveSource(sourceIds[0]);

        // Auto-populate mapping state from the first saved mapping (if any)
        const savedEntries = Object.entries(mappings || {});
        if (savedEntries.length > 0) {
          const [savedKey, saved] = savedEntries[0];
          setMappingName(savedKey);
          setMappingLabel(saved.label || savedKey);
          setMetaCopy(saved.metaCopy || []);
          const hydratedBlocks = (saved.blocks || []).map((b) => ({ ...b, _localId: uid() }));
          setBlocks(hydratedBlocks);
          // Collapse all restored blocks by default
          setCollapsedBlocks(new Set(hydratedBlocks.map((b) => b._localId)));
        }
      })
      .catch((err) => {
        onNotice({ status: 'error', message: err.message });
        setContent({ sources: {} });
      });
  }, [pageId]);

  // ── Merged flat fields from all sources ───────────────────────────
  const allFlatFields = useMemo(() => {
    if (!content) return {};
    const merged = {};
    Object.values(content.sources || {}).forEach((src) => {
      Object.assign(merged, src.flatFields || {});
    });
    return merged;
  }, [content]);

  // ── Block recipe helpers ──────────────────────────────────────────
  const addBlock = () => {
    const localId = uid();
    setBlocks((prev) => [
      ...prev,
      { _localId: localId, id: uid(), label: '', targetBlock: '', fieldMappings: {} },
    ]);
    // New cards start expanded so the user can immediately fill them in
    setCollapsedBlocks((prev) => { const s = new Set(prev); s.delete(localId); return s; });
  };

  const toggleCollapse = (localId) => {
    setCollapsedBlocks((prev) => {
      const s = new Set(prev);
      s.has(localId) ? s.delete(localId) : s.add(localId);
      return s;
    });
  };

  const updateBlock = (localId, patch) => {
    setBlocks((prev) =>
      prev.map((b) => b._localId === localId ? { ...b, ...patch } : b)
    );
  };

  const removeBlock = (localId) => {
    setBlocks((prev) => prev.filter((b) => b._localId !== localId));
  };

  const moveBlock = (localId, dir) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b._localId === localId);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const toggleMetaCopy = (key, checked) => {
    setMetaCopy((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
  };

  // ── Save entire page mapping ───────────────────────────────────────
  const saveMappingTemplate = () => {
    const name = mappingName.trim();
    if (!name) {
      onNotice({ status: 'error', message: __('Please enter a mapping name.', 'handoff') });
      return;
    }
    if (blocks.length === 0) {
      onNotice({ status: 'error', message: __('Add at least one block recipe.', 'handoff') });
      return;
    }

    const payload = {
      name,
      label:    mappingLabel || name,
      metaCopy,
      blocks:   blocks.map(({ _localId, ...rest }) => rest),
    };

    apiFetch({
      path: '/handoff/v1/migration/mappings',
      method: 'POST',
      data: payload,
    })
      .then(() => {
        onMappingSaved();
        onNotice({ status: 'success', message: __('Page mapping saved.', 'handoff') });
      })
      .catch((err) => onNotice({ status: 'error', message: err.message }));
  };

  // ── Migration ─────────────────────────────────────────────────────
  const runMigration = (mode) => {
    const name = mappingName.trim();
    if (!name) {
      onNotice({ status: 'error', message: __('Save the page mapping first.', 'handoff') });
      return;
    }
    setMigrating(true);
    apiFetch({
      path: '/handoff/v1/migration/migrate',
      method: 'POST',
      data: { postId: pageId, mode, mappingName: name },
    })
      .then((res) => {
        setMigrating(false);
        onNotice({ status: 'success', message: res.message });
      })
      .catch((err) => {
        setMigrating(false);
        onNotice({ status: 'error', message: err.message });
      });
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (content === null) return <Spinner />;

  const sources   = content.sources || {};
  const sourceIds = Object.keys(sources);

  return (
    <div className="handoff-migration__mapper">

      {/* ── 1. Content Explorer ─────────────────────────────────── */}
      <h2>{__('Content Sources', 'handoff')}</h2>
      <p className="description">
        {__('All content on this page. Use the field keys (left column) in block recipes below.', 'handoff')}
      </p>

      {sourceIds.length === 0 ? (
        <p style={{ color: '#888' }}>{__('No content sources found.', 'handoff')}</p>
      ) : (
        <div style={{ border: '1px solid #ccc', borderRadius: 4, marginBottom: 24 }}>
          <div style={{ padding: '8px 8px 0', background: '#f6f7f7', borderBottom: '1px solid #ccc' }}>
            {sourceIds.map((id) => (
              <SourceTab
                key={id}
                id={id}
                label={sources[id].label}
                active={activeSource === id}
                onClick={() => setActiveSource(id)}
              />
            ))}
          </div>
          <div style={{ padding: 12 }}>
            {activeSource && sources[activeSource] && (
              <SourceFieldTable flatFields={sources[activeSource].flatFields} />
            )}
          </div>
        </div>
      )}

      {/* ── 2. Mapping Identity ─────────────────────────────────── */}
      <h2>{__('Page Mapping', 'handoff')}</h2>
      <p className="description">
        {__('Define one mapping per page type. It will be saved and reused across similar pages.', 'handoff')}
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <TextControl
            label={__('Mapping Name (machine key)', 'handoff')}
            value={mappingName}
            onChange={setMappingName}
            placeholder="e.g. about-us-page"
            help={__('Used as the unique key. Use lowercase-with-dashes.', 'handoff')}
            __nextHasNoMarginBottom
          />
        </div>
        <div style={{ flex: 1 }}>
          <TextControl
            label={__('Display Label', 'handoff')}
            value={mappingLabel}
            onChange={setMappingLabel}
            placeholder="e.g. About Us Page"
            __nextHasNoMarginBottom
          />
        </div>
      </div>

      {/* ── 3. Meta Copy ────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader>
          <strong>{__('Copy from Source Post', 'handoff')}</strong>
        </CardHeader>
        <CardBody>
          <p className="description" style={{ marginTop: 0 }}>
            {__('These fields will be copied verbatim from the original page to the new post.', 'handoff')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {META_COPY_OPTIONS.map(({ key, label }) => (
              <CheckboxControl
                key={key}
                label={label}
                checked={metaCopy.includes(key)}
                onChange={(checked) => toggleMetaCopy(key, checked)}
                __nextHasNoMarginBottom
              />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ── 4. Block Recipes ────────────────────────────────────── */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{__('Block Order', 'handoff')}</h2>
        <Button variant="primary" onClick={addBlock}>
          {__('+ Add Block', 'handoff')}
        </Button>
      </Flex>
      <p className="description">
        {__('Each block will be created in order on the migrated page. Map source field keys to block attributes.', 'handoff')}
      </p>

      {blocks.length === 0 && (
        <p style={{ color: '#888', marginBottom: 16 }}>
          {__('No blocks yet. Click "Add Block" to start building the page layout.', 'handoff')}
        </p>
      )}

      {blocks.map((block, idx) => {
        const targetSchema  = block.targetBlock ? schemas[block.targetBlock] : null;
        const isCollapsed   = collapsedBlocks.has(block._localId);
        const mappingCount  = Object.keys(block.fieldMappings || {}).length;
        const blockTitle    = block.label || block.targetBlock || __('Untitled Block', 'handoff');
        const targetTitle   = targetSchema
          ? (targetSchema.title || block.targetBlock)
          : (block.targetBlock || <em style={{ color: '#aaa' }}>{__('no block selected', 'handoff')}</em>);

        return (
          <Card key={block._localId} style={{ marginBottom: 12, borderLeft: '3px solid #0073aa' }}>
            {/* ── Card header — always visible, click to expand/collapse ── */}
            <CardHeader
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => toggleCollapse(block._localId)}
            >
              <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                <Flex align="center" gap={2}>
                  {/* Order controls — stop propagation so clicks don't toggle collapse */}
                  <div
                    style={{ display: 'flex', flexDirection: 'column', marginRight: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      disabled={idx === 0}
                      onClick={() => moveBlock(block._localId, -1)}
                      style={{
                        border: 'none', background: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                        color: idx === 0 ? '#ccc' : '#555', lineHeight: 1, padding: '2px 4px',
                      }}
                      title="Move up"
                    >▲</button>
                    <button
                      disabled={idx === blocks.length - 1}
                      onClick={() => moveBlock(block._localId, 1)}
                      style={{
                        border: 'none', background: 'none', cursor: idx === blocks.length - 1 ? 'default' : 'pointer',
                        color: idx === blocks.length - 1 ? '#ccc' : '#555', lineHeight: 1, padding: '2px 4px',
                      }}
                      title="Move down"
                    >▼</button>
                  </div>

                  <span style={{ color: '#888', fontSize: 12, marginRight: 8 }}>#{idx + 1}</span>

                  {/* Collapse chevron */}
                  <span style={{ fontSize: 12, color: '#555', marginRight: 8, lineHeight: 1 }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>

                  {isCollapsed ? (
                    /* Collapsed summary */
                    <span>
                      <strong>{blockTitle}</strong>
                      {block.targetBlock && (
                        <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
                          {targetTitle}
                        </span>
                      )}
                      <span style={{
                        marginLeft: 12,
                        background: mappingCount > 0 ? '#0073aa' : '#ccc',
                        color: '#fff',
                        borderRadius: 10,
                        padding: '1px 8px',
                        fontSize: 11,
                      }}>
                        {mappingCount} {mappingCount === 1 ? __('mapping', 'handoff') : __('mappings', 'handoff')}
                      </span>
                    </span>
                  ) : (
                    /* Expanded: editable label */
                    <div onClick={(e) => e.stopPropagation()}>
                      <TextControl
                        placeholder={__('Block label (e.g. Hero)', 'handoff')}
                        value={block.label}
                        onChange={(v) => updateBlock(block._localId, { label: v })}
                        __nextHasNoMarginBottom
                        style={{ margin: 0, minWidth: 200 }}
                      />
                    </div>
                  )}
                </Flex>

                <div onClick={(e) => e.stopPropagation()}>
                  <Button isDestructive variant="tertiary" size="small" onClick={() => removeBlock(block._localId)}>
                    {__('Remove', 'handoff')}
                  </Button>
                </div>
              </Flex>
            </CardHeader>

            {/* ── Card body — hidden when collapsed ──────────────────── */}
            {!isCollapsed && (
              <CardBody>
                <SelectControl
                  label={__('Target Handoff Block', 'handoff')}
                  value={block.targetBlock}
                  options={schemaOptions}
                  onChange={(v) => updateBlock(block._localId, { targetBlock: v, fieldMappings: {} })}
                  __nextHasNoMarginBottom
                />

                {targetSchema && (
                  <div style={{ marginTop: 16 }}>
                    <FieldMapper
                      sourceFields={allFlatFields}
                      schema={targetSchema}
                      fieldMappings={block.fieldMappings}
                      onChange={(fm) => updateBlock(block._localId, { fieldMappings: fm })}
                    />
                  </div>
                )}
              </CardBody>
            )}
          </Card>
        );
      })}

      {/* ── 5. Save & Migrate ───────────────────────────────────── */}
      <Flex justify="space-between" align="center" style={{ marginTop: 8, marginBottom: 24 }}>
        <Button
          variant="secondary"
          onClick={saveMappingTemplate}
          disabled={!mappingName.trim() || blocks.length === 0}
        >
          {__('Save Page Mapping', 'handoff')}
        </Button>
      </Flex>

      <hr style={{ margin: '0 0 24px' }} />

      <h2>{__('Migrate', 'handoff')}</h2>
      <p className="description">
        {__('Apply the saved mapping to generate Handoff blocks for this page.', 'handoff')}
      </p>
      <Flex gap={3}>
        <Button
          variant="primary"
          onClick={() => runMigration('draft')}
          disabled={migrating || !mappingName.trim()}
        >
          {migrating ? <Spinner /> : __('Migrate to New Draft', 'handoff')}
        </Button>
        <Button
          variant="secondary"
          isDestructive
          onClick={() => runMigration('in-place')}
          disabled={migrating || !mappingName.trim()}
        >
          {__('Migrate In-Place', 'handoff')}
        </Button>
      </Flex>
    </div>
  );
}
