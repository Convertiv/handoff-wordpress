import { useState, useEffect, useCallback } from '@wordpress/element';
import { Button, Spinner, Notice, TextControl } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

const CHANGE_TYPE_LABELS = {
  removed: 'Removed',
  type_changed: 'Type Changed',
  added: 'Added',
};

const STATUS_LABELS = {
  auto: 'Auto-resolved',
  'needs-review': 'Needs Review',
  'non-breaking': 'Non-breaking',
};

const canManageOptions =
  typeof window !== 'undefined' &&
  window.handoffAdmin &&
  window.handoffAdmin.canManageOptions;

export default function SchemaHealthPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [affectedPosts, setAffectedPosts] = useState({});
  const [migrating, setMigrating] = useState({});
  const [notice, setNotice] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [savingOverrides, setSavingOverrides] = useState(false);

  useEffect(() => {
    const fetches = [apiFetch({ path: '/handoff/v1/schema/status' })];
    if (canManageOptions) {
      fetches.push(apiFetch({ path: '/handoff/v1/schema/overrides' }).catch(() => ({})));
    } else {
      fetches.push(Promise.resolve({}));
    }
    Promise.all(fetches)
      .then(([statusData, overridesData]) => {
        setData(statusData);
        setOverrides(overridesData || {});
      })
      .catch((err) => console.error('Failed to fetch schema status:', err))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = useCallback((slug) => {
    setExpanded((prev) => {
      const next = { ...prev, [slug]: !prev[slug] };
      if (next[slug] && !affectedPosts[slug]) {
        apiFetch({ path: `/handoff/v1/schema/affected/${slug}` })
          .then((res) => setAffectedPosts((p) => ({ ...p, [slug]: res })))
          .catch(() => {});
      }
      return next;
    });
  }, [affectedPosts]);

  const updateRename = useCallback((slug, versionKey, oldKey, newKey) => {
    setOverrides((prev) => {
      const blockOverrides = { ...(prev[slug] || {}) };
      const versionOverrides = { ...(blockOverrides[versionKey] || {}) };
      const renames = { ...(versionOverrides.renames || {}) };
      if (newKey) {
        renames[oldKey] = newKey;
      } else {
        delete renames[oldKey];
      }
      versionOverrides.renames = renames;
      blockOverrides[versionKey] = versionOverrides;
      return { ...prev, [slug]: blockOverrides };
    });
  }, []);

  const saveOverrides = useCallback(() => {
    setSavingOverrides(true);
    apiFetch({
      path: '/handoff/v1/schema/overrides',
      method: 'POST',
      data: overrides,
    })
      .then(() => {
        setNotice({
          status: 'success',
          message: 'Migration overrides saved. Recompile blocks to apply.',
        });
      })
      .catch((err) => {
        setNotice({
          status: 'error',
          message: err?.message || 'Failed to save overrides.',
        });
      })
      .finally(() => setSavingOverrides(false));
  }, [overrides]);

  const handleMigrate = useCallback((blockName, slug, dryRun) => {
    const key = `${slug}-${dryRun ? 'dry' : 'live'}`;
    setMigrating((prev) => ({ ...prev, [key]: true }));

    apiFetch({
      path: '/handoff/v1/schema/migrate',
      method: 'POST',
      data: { blockName, dryRun },
    })
      .then((res) => {
        const verb = dryRun ? 'would be migrated' : 'migrated';
        setNotice({
          status: 'success',
          message: `${res.migrated} post(s) ${verb}.`,
        });
        if (!dryRun) {
          apiFetch({ path: `/handoff/v1/schema/affected/${slug}` })
            .then((r) => setAffectedPosts((p) => ({ ...p, [slug]: r })));
        }
      })
      .catch((err) => {
        setNotice({ status: 'error', message: err?.message || 'Migration failed.' });
      })
      .finally(() => setMigrating((prev) => ({ ...prev, [key]: false })));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const blocks = data?.blocks || [];
  if (blocks.length === 0) {
    return (
      <div className="handoff-schema-panel handoff-schema-empty">
        <p>No schema changes detected. All blocks are up to date.</p>
      </div>
    );
  }

  const needsReviewCount = blocks.reduce(
    (acc, b) =>
      acc +
      (b.history || []).filter((h) => h.migrationStatus === 'needs-review').length,
    0
  );

  return (
    <div className="handoff-schema-panel">
      {notice && (
        <Notice
          status={notice.status}
          isDismissible
          onDismiss={() => setNotice(null)}
        >
          {notice.message}
        </Notice>
      )}

      <div className="schema-summary">
        <span className="schema-summary-count">
          {blocks.length} block{blocks.length !== 1 ? 's' : ''} with schema
          history
        </span>
        {needsReviewCount > 0 && (
          <span className="schema-summary-review">
            {needsReviewCount} need{needsReviewCount !== 1 ? '' : 's'} review
          </span>
        )}
      </div>

      {canManageOptions && (
        <div className="schema-overrides-toolbar">
          <Button
            variant="primary"
            size="small"
            onClick={saveOverrides}
            disabled={savingOverrides}
            isBusy={savingOverrides}
          >
            {savingOverrides ? 'Saving...' : 'Save Rename Mappings'}
          </Button>
          <span className="schema-overrides-help">
            Saved mappings are used by both the batch migrator and the compiler
            (on next recompile).
          </span>
        </div>
      )}

      <div className="schema-block-list">
        {blocks.map((block) => {
          const slug = block.slug;
          const isExpanded = expanded[slug];
          const posts = affectedPosts[slug];
          const hasNeedsReview = (block.history || []).some(
            (h) => h.migrationStatus === 'needs-review'
          );

          return (
            <div
              key={slug}
              className={`schema-block-item ${hasNeedsReview ? 'has-review' : ''}`}
            >
              <div
                className="schema-block-header"
                onClick={() => toggleExpand(slug)}
              >
                <span
                  className={`schema-toggle-arrow ${isExpanded ? 'is-open' : ''}`}
                >
                  &#9656;
                </span>
                <div className="schema-block-info">
                  <strong>{block.title}</strong>
                  <code>{block.name}</code>
                </div>
                <span className="schema-version-badge">
                  v{block.currentVersion}
                </span>
                <span className="schema-deprecation-count">
                  {(block.history || []).length} deprecation
                  {(block.history || []).length !== 1 ? 's' : ''}
                </span>
                <span className="schema-affected-count">
                  {block.affectedPosts} post
                  {block.affectedPosts !== 1 ? 's' : ''}
                </span>
              </div>

              {isExpanded && (
                <div className="schema-block-detail">
                  <div className="schema-history-list">
                    {(block.history || []).map((version, i) => {
                      const versionKey = `${version.version}-to-${block.currentVersion}`;
                      const removedChanges = (version.changes || []).filter(
                        (c) => c.type === 'removed'
                      );
                      const blockRenames =
                        overrides[slug]?.[versionKey]?.renames || {};

                      return (
                        <div
                          key={i}
                          className={`schema-version-entry status-${version.migrationStatus}`}
                        >
                          <div className="version-header">
                            <span className="version-label">
                              v{version.version}
                            </span>
                            <span className="version-date">
                              {version.date?.split('T')[0]}
                            </span>
                            <span
                              className={`version-status status-${version.migrationStatus}`}
                            >
                              {STATUS_LABELS[version.migrationStatus] ||
                                version.migrationStatus}
                            </span>
                          </div>
                          <ul className="version-changes">
                            {(version.changes || []).map((change, j) => (
                              <li
                                key={j}
                                className={`change-item change-${change.type}`}
                              >
                                <span className="change-type">
                                  {CHANGE_TYPE_LABELS[change.type] ||
                                    change.type}
                                </span>
                                <code className="change-path">
                                  {change.path}
                                </code>
                                {change.oldType && (
                                  <span className="change-types">
                                    {change.oldType}
                                    {change.newType
                                      ? ` → ${change.newType}`
                                      : ''}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>

                          {canManageOptions && removedChanges.length > 0 && (
                            <div className="rename-mapper">
                              <h5>Rename Mapping</h5>
                              <p className="rename-help">
                                Map removed properties to their new names to
                                preserve data during migration.
                              </p>
                              {removedChanges.map((change) => (
                                <div
                                  key={change.path}
                                  className="rename-row"
                                >
                                  <code className="rename-old">
                                    {change.path}
                                  </code>
                                  <span className="rename-arrow">→</span>
                                  <TextControl
                                    placeholder="New property name"
                                    value={blockRenames[change.path] || ''}
                                    onChange={(val) =>
                                      updateRename(
                                        slug,
                                        versionKey,
                                        change.path,
                                        val
                                      )
                                    }
                                    __nextHasNoMarginBottom
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="schema-affected-section">
                    <h4>
                      Affected Posts
                      {posts && ` (${posts.total})`}
                    </h4>
                    {!posts && <Spinner />}
                    {posts && posts.total === 0 && (
                      <p className="no-posts">
                        No posts found using this block.
                      </p>
                    )}
                    {posts && posts.total > 0 && (
                      <>
                        <ul className="affected-post-list">
                          {posts.posts.map((p) => (
                            <li key={p.id}>
                              <a
                                href={p.editUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {p.title}
                              </a>
                              <span className="post-meta">
                                {p.type} &middot; {p.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="schema-migrate-actions">
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() =>
                              handleMigrate(block.name, slug, true)
                            }
                            disabled={!!migrating[`${slug}-dry`]}
                            isBusy={!!migrating[`${slug}-dry`]}
                          >
                            Dry Run
                          </Button>
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() =>
                              handleMigrate(block.name, slug, false)
                            }
                            disabled={!!migrating[`${slug}-live`]}
                            isBusy={!!migrating[`${slug}-live`]}
                          >
                            Migrate Now
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
