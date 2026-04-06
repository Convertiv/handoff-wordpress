import { useState, useEffect, useCallback } from '@wordpress/element';
import { Button, Spinner } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';
import SchemaHealthPanel from './SchemaHealthPanel';

export default function BlocksTab() {
  const [data, setData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedUsage, setExpandedUsage] = useState({});

  useEffect(() => {
    Promise.all([
      apiFetch({ path: '/handoff/v1/blocks' }),
      apiFetch({ path: '/handoff/v1/usage' }),
    ])
      .then(([blocksData, usageData]) => {
        setData(blocksData);
        setUsage(usageData);
      })
      .catch((err) => console.error('Failed to fetch blocks:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleRefreshUsage = useCallback(() => {
    setRefreshing(true);
    apiFetch({ path: '/handoff/v1/usage/refresh', method: 'POST' })
      .then(setUsage)
      .catch((err) => console.error('Refresh failed:', err))
      .finally(() => setRefreshing(false));
  }, []);

  const toggleUsage = useCallback((slug) => {
    setExpandedUsage((prev) => ({ ...prev, [slug]: !prev[slug] }));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (!data || data.blocks.length === 0) {
    return (
      <div style={{ padding: 20 }}>
        <p>
          No compiled blocks found. Run <code>wp handoff compile --all</code>{' '}
          then <code>wp handoff build</code> to generate blocks.
        </p>
      </div>
    );
  }

  const { blocks, stats } = data;
  const usageMap = usage?.usage || {};

  const grouped = {};
  blocks.forEach((block) => {
    const cat = block.category || 'uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(block);
  });

  return (
    <div style={{ padding: '16px 0' }}>
      <div className="handoff-stats-row">
        <StatCard value={stats.totalBlocks} label="Blocks" />
        <StatCard value={stats.totalCategories} label="Categories" />
        <StatCard value={stats.totalVariations} label="Variations" />
        <div className="handoff-stat-card handoff-stat-usage">
          <div className="stat-value">{Object.keys(usageMap).length}</div>
          <div className="stat-label">In Use</div>
          <Button
            variant="tertiary"
            size="small"
            onClick={handleRefreshUsage}
            disabled={refreshing}
            isBusy={refreshing}
            className="stat-refresh"
          >
            {refreshing ? 'Scanning...' : 'Rescan'}
          </Button>
        </div>
      </div>

      {Object.entries(grouped).map(([category, catBlocks]) => (
        <div key={category} className="handoff-category-group">
          <h3>{formatCategory(category)}</h3>
          <div className="handoff-block-grid">
            {catBlocks.map((block) => (
              <BlockCard
                key={block.slug}
                block={block}
                usage={usageMap[block.name]}
                isExpanded={!!expandedUsage[block.slug]}
                onToggleUsage={() => toggleUsage(block.slug)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="handoff-schema-section">
        <h3>Schema Health</h3>
        <SchemaHealthPanel />
      </div>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="handoff-stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function BlockCard({ block, usage, isExpanded, onToggleUsage }) {
  const pageCount = usage?.count || 0;

  return (
    <div className="handoff-block-card">
      {block.hasScreenshot && (
        <div className="card-screenshot">
          <img src={block.screenshotUrl} alt={block.title} />
        </div>
      )}
      <div className="card-header">
        <div className="card-info">
          <p className="card-title">{block.title}</p>
          <p className="card-name">{block.name}</p>
        </div>
      </div>
      <div className="card-meta">
        <span>{block.attributeCount} attributes</span>
        {block.variationCount > 0 && (
          <span>{block.variationCount} variations</span>
        )}
        <button
          className={`card-usage-badge ${pageCount > 0 ? 'has-usage' : 'no-usage'}`}
          onClick={pageCount > 0 ? onToggleUsage : undefined}
          disabled={pageCount === 0}
        >
          {pageCount > 0 ? `${pageCount} page${pageCount !== 1 ? 's' : ''}` : 'Unused'}
        </button>
        {block.schemaChanges && (
          <span
            className={`card-schema-badge ${block.schemaChanges.needsReview > 0 ? 'needs-review' : 'up-to-date'}`}
          >
            v{block.schemaChanges.currentVersion}
            {block.schemaChanges.needsReview > 0 && ' !'}
          </span>
        )}
      </div>

      {isExpanded && usage && usage.posts.length > 0 && (
        <ul className="card-usage-list">
          {usage.posts.map((p) => (
            <li key={p.id}>
              <a href={p.editUrl} target="_blank" rel="noopener noreferrer">
                {p.title || `(${p.type} #${p.id})`}
              </a>
              <span className="post-type-label">{p.type}</span>
            </li>
          ))}
        </ul>
      )}

      {(block.handoffUrl || block.figmaUrl) && (
        <div className="card-links">
          {block.handoffUrl && (
            <a href={block.handoffUrl} target="_blank" rel="noopener noreferrer">
              Handoff ↗
            </a>
          )}
          {block.figmaUrl && (
            <a href={block.figmaUrl} target="_blank" rel="noopener noreferrer">
              Figma ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function formatCategory(slug) {
  return slug
    .replace(/^handoff-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
