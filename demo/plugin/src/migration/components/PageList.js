/**
 * PageList — shows all pages/posts available for migration.
 */

import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { Button, Spinner, SelectControl } from '@wordpress/components';

const SOURCE_LABELS = {
  acf:     'ACF',
  blocks:  'Blocks',
  classic: 'Classic',
  meta:    'Meta',
};

const SOURCE_COLORS = {
  acf:     '#0073aa',
  blocks:  '#007a3d',
  classic: '#6c6c6c',
  meta:    '#9b4c97',
};

function SourceBadge({ source }) {
  return (
    <span style={{
      display: 'inline-block',
      marginRight: 4,
      padding: '1px 6px',
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 600,
      color: '#fff',
      background: SOURCE_COLORS[source] || '#555',
    }}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

export default function PageList({ onSelect, onNotice }) {
  const [pages, setPages]         = useState(null);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [postType, setPostType]   = useState('any');
  const [search, setSearch]       = useState('');

  const load = (p, pt) => {
    setPages(null);
    apiFetch({ path: `/handoff/v1/migration/pages?page=${p}&post_type=${pt}&per_page=50` })
      .then((res) => {
        setPages(res.pages || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      })
      .catch((err) => {
        onNotice({ status: 'error', message: err.message });
        setPages([]);
      });
  };

  useEffect(() => { load(page, postType); }, [page, postType]);

  const filtered = pages
    ? pages.filter((p) =>
        !search || p.title.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  return (
    <div className="handoff-migration__page-list">
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <SelectControl
          label={__('Post type', 'handoff')}
          value={postType}
          options={[
            { label: 'All (pages + posts)', value: 'any' },
            { label: 'Pages', value: 'page' },
            { label: 'Posts', value: 'post' },
          ]}
          onChange={(v) => { setPostType(v); setPage(1); }}
          __nextHasNoMarginBottom
          style={{ marginBottom: 0 }}
        />
        <div style={{ flexGrow: 1 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 12 }}>
            {__('Filter by title', 'handoff')}
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={__('Search…', 'handoff')}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #8c8f94', borderRadius: 3 }}
          />
        </div>
      </div>

      {filtered === null && <Spinner />}

      {filtered !== null && (
        <>
          <p className="description">
            {__('Showing', 'handoff')} {total} {__('post(s). Select one to explore its content and map fields to Handoff blocks.', 'handoff')}
          </p>

          {filtered.length === 0 && (
            <p>{__('No posts found.', 'handoff')}</p>
          )}

          {filtered.length > 0 && (
            <table className="widefat striped">
              <thead>
                <tr>
                  <th>{__('Title', 'handoff')}</th>
                  <th>{__('Type', 'handoff')}</th>
                  <th>{__('Status', 'handoff')}</th>
                  <th>{__('Template', 'handoff')}</th>
                  <th>{__('Content Sources', 'handoff')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.title}</strong></td>
                    <td>{p.postType}</td>
                    <td>{p.status}</td>
                    <td>
                      {p.template
                        ? <code style={{ fontSize: 11 }}>{p.template}</code>
                        : <span style={{ color: '#aaa' }}>—</span>
                      }
                    </td>
                    <td>
                      {p.contentSources.length === 0
                        ? <span style={{ color: '#aaa' }}>—</span>
                        : p.contentSources.map((s) => <SourceBadge key={s} source={s} />)
                      }
                    </td>
                    <td>
                      <Button variant="secondary" size="small" onClick={() => onSelect(p.id)}>
                        {__('Explore & Map', 'handoff')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button disabled={page <= 1} variant="secondary" onClick={() => setPage(page - 1)}>
                {__('Previous', 'handoff')}
              </Button>
              <span style={{ fontSize: 13 }}>
                {__('Page', 'handoff')} {page} / {totalPages}
              </span>
              <Button disabled={page >= totalPages} variant="secondary" onClick={() => setPage(page + 1)}>
                {__('Next', 'handoff')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
