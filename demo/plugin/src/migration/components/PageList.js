/**
 * PageList — shows pages that contain ACF blocks.
 */

import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { Button, Spinner } from '@wordpress/components';

export default function PageList({ onSelect, onNotice }) {
  const [pages, setPages] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = (p) => {
    setPages(null);
    apiFetch({ path: `/handoff/v1/migration/pages?page=${p}` })
      .then((res) => {
        setPages(res.pages || []);
        setTotal(res.total || 0);
      })
      .catch((err) => {
        onNotice({ status: 'error', message: err.message });
        setPages([]);
      });
  };

  useEffect(() => { load(page); }, [page]);

  if (pages === null) return <Spinner />;

  if (pages.length === 0) {
    return <p>{__('No pages with ACF blocks found.', 'handoff')}</p>;
  }

  return (
    <div className="handoff-migration__page-list">
      <p className="description">
        {total} {__('page(s) contain ACF blocks.', 'handoff')}
      </p>

      <table className="widefat striped">
        <thead>
          <tr>
            <th>{__('Title', 'handoff')}</th>
            <th>{__('Type', 'handoff')}</th>
            <th>{__('Status', 'handoff')}</th>
            <th>{__('ACF Blocks', 'handoff')}</th>
            <th>{__('Block Types', 'handoff')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.title || __('(no title)', 'handoff')}</strong></td>
              <td>{p.postType}</td>
              <td>{p.status}</td>
              <td>{p.acfBlockCount}</td>
              <td>
                {p.acfBlockTypes.map((t) => (
                  <code key={t} style={{ marginRight: 4 }}>{t}</code>
                ))}
              </td>
              <td>
                <Button variant="secondary" size="small" onClick={() => onSelect(p.id)}>
                  {__('Map & Migrate', 'handoff')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {total > 50 && (
        <div style={{ marginTop: 12 }}>
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>{__('Previous', 'handoff')}</Button>
          {' '}
          <Button onClick={() => setPage(page + 1)}>{__('Next', 'handoff')}</Button>
        </div>
      )}
    </div>
  );
}
