import { useState, useEffect } from '@wordpress/element';
import { Spinner } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

export default function BlocksTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch({ path: '/handoff/v1/blocks' })
      .then(setData)
      .catch((err) => console.error('Failed to fetch blocks:', err))
      .finally(() => setLoading(false));
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
      </div>

      {Object.entries(grouped).map(([category, catBlocks]) => (
        <div key={category} className="handoff-category-group">
          <h3>{formatCategory(category)}</h3>
          <div className="handoff-block-grid">
            {catBlocks.map((block) => (
              <BlockCard key={block.slug} block={block} />
            ))}
          </div>
        </div>
      ))}
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

function BlockCard({ block }) {
  return (
    <div className="handoff-block-card">
      <div className="card-header">
        {block.hasScreenshot ? (
          <img className="card-thumb" src={block.screenshotUrl} alt="" />
        ) : (
          <div className="card-thumb-placeholder">
            <span className="dashicons dashicons-layout" />
          </div>
        )}
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
        <span>{block.lastModified}</span>
      </div>
      {(block.handoffUrl || block.figmaUrl) && (
        <div className="card-links">
          {block.handoffUrl && (
            <a href={block.handoffUrl} target="_blank" rel="noopener noreferrer">
              View in Handoff ↗
            </a>
          )}
          {block.figmaUrl && (
            <a href={block.figmaUrl} target="_blank" rel="noopener noreferrer">
              View in Figma ↗
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
