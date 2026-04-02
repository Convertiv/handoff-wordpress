import { useState, useEffect, useCallback } from '@wordpress/element';
import { Button, Spinner } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

export default function UsageTab() {
  const [data, setData] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch({ path: '/handoff/v1/usage' }),
      apiFetch({ path: '/handoff/v1/blocks' }),
    ])
      .then(([usageData, blocksData]) => {
        setData(usageData);
        setBlocks(blocksData);
      })
      .catch((err) => console.error('Failed to fetch usage:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    apiFetch({ path: '/handoff/v1/usage/refresh', method: 'POST' })
      .then(setData)
      .catch((err) => console.error('Refresh failed:', err))
      .finally(() => setRefreshing(false));
  }, []);

  const toggleExpand = useCallback((name) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const usage = data?.usage || {};
  const allBlockNames = (blocks?.blocks || []).map((b) => b.name);
  const usedNames = Object.keys(usage);
  const unusedNames = allBlockNames.filter((n) => !usedNames.includes(n));

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#757575', fontSize: 13 }}>
          Last scanned: {data?.scannedAt || 'Never'}
        </p>
        <Button
          variant="secondary"
          onClick={handleRefresh}
          disabled={refreshing}
          isBusy={refreshing}
        >
          {refreshing ? 'Scanning...' : 'Refresh'}
        </Button>
      </div>

      <table className="handoff-usage-table">
        <thead>
          <tr>
            <th>Block</th>
            <th style={{ width: 80 }}>Pages</th>
          </tr>
        </thead>
        <tbody>
          {usedNames.map((name) => {
            const entry = usage[name];
            const isExpanded = expanded[name];
            return (
              <tr key={name}>
                <td>
                  <button
                    onClick={() => toggleExpand(name)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 13,
                      fontFamily: 'monospace',
                      color: '#2271b1',
                      textAlign: 'left',
                    }}
                  >
                    {isExpanded ? '▾' : '▸'} {name}
                  </button>
                  {isExpanded && (
                    <ul className="post-list">
                      {entry.posts.map((p) => (
                        <li key={p.id}>
                          <a href={p.editUrl} target="_blank" rel="noopener noreferrer">
                            {p.title || `(${p.type} #${p.id})`}
                          </a>
                          <span style={{ color: '#999', marginLeft: 4 }}>({p.type})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>{entry.count}</td>
              </tr>
            );
          })}
          {unusedNames.map((name) => (
            <tr key={name}>
              <td>
                <span className="unused">{name}</span>
              </td>
              <td className="unused">0</td>
            </tr>
          ))}
          {usedNames.length === 0 && unusedNames.length === 0 && (
            <tr>
              <td colSpan={2} style={{ textAlign: 'center', color: '#999' }}>
                No blocks found. Compile and build blocks first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
