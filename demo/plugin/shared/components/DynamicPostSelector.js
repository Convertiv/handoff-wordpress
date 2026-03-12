/**
 * DynamicPostSelector Component
 *
 * Unified UI for dynamic array fields: Query/Select/Manual tabs, taxonomy filters,
 * order & limit (number input), optional date filter and advanced options.
 * Accepts value/onChange/options only so blocks stay thin.
 *
 * @package Handoff_Blocks
 */

import { useState, useEffect, useMemo } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as coreDataStore } from '@wordpress/core-data';
import {
  SelectControl,
  TextControl,
  Button,
  ToggleControl,
  ComboboxControl,
  Spinner,
  Card,
  CardBody,
  FormTokenField,
  Flex,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { closeSmall } from '@wordpress/icons';

const DEFAULT_DATE_PRESETS = [
  { label: __('All time', 'handoff'), value: '' },
  { label: __('Last 7 days', 'handoff'), value: '7d' },
  { label: __('Last 30 days', 'handoff'), value: '30d' },
  { label: __('Last 3 months', 'handoff'), value: '3m' },
  { label: __('Last year', 'handoff'), value: '1y' },
];

function getDateFromPreset(preset) {
  if (!preset) return '';
  const now = new Date();
  let date;
  switch (preset) {
    case '7d':
      date = new Date(now);
      date.setDate(date.getDate() - 7);
      break;
    case '30d':
      date = new Date(now);
      date.setDate(date.getDate() - 30);
      break;
    case '3m':
      date = new Date(now);
      date.setMonth(date.getMonth() - 3);
      break;
    case '1y':
      date = new Date(now);
      date.setFullYear(date.getFullYear() - 1);
      break;
    default:
      return '';
  }
  return date.toISOString();
}

function TaxonomyFilterRow({ filter, taxonomies, onChange, onRemove, textDomain }) {
  const { terms } = useSelect(
    (select) => {
      if (!filter.taxonomy) return { terms: [] };
      const result = select(coreDataStore).getEntityRecords('taxonomy', filter.taxonomy, {
        per_page: 100,
        orderby: 'name',
        order: 'asc',
        _fields: 'id,name,slug',
      });
      return { terms: result || [] };
    },
    [filter.taxonomy]
  );

  const taxonomyOptions = [
    { label: __('Select taxonomy...', textDomain), value: '' },
    ...(taxonomies || []).map((tax) => ({
      label: tax.labels?.name || tax.slug,
      value: tax.slug,
    })),
  ];

  const termOptions = (terms || []).map((t) => ({ label: t.name, value: t.id }));

  return (
    <div className="handoff-dps__filter-row">
      <Flex align="stretch" gap={2}>
        <SelectControl
          value={filter.taxonomy}
          options={taxonomyOptions}
          onChange={(value) => onChange({ ...filter, taxonomy: value, terms: [] })}
          __nextHasNoMarginBottom
        />
        {filter.taxonomy && termOptions.length > 0 && (
          <SelectControl
            value={filter.terms || []}
            options={termOptions}
            multiple
            onChange={(value) => onChange({ ...filter, terms: value.map(Number) })}
            __nextHasNoMarginBottom
          />
        )}
        <Button
          icon={closeSmall}
          isDestructive
          size="small"
          onClick={onRemove}
          label={__('Remove filter', textDomain)}
          className="handoff-dps__filter-remove"
        />
      </Flex>
    </div>
  );
}

function ManualPicker({ postTypes, selectedPosts, onChange, maxItems, textDomain }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const { searchResults, isLoading } = useSelect(
    (select) => {
      if (!debouncedSearch || debouncedSearch.length < 2)
        return { searchResults: [], isLoading: false };
      const core = select(coreDataStore);
      const results = [];
      let loading = false;
      for (const postType of postTypes) {
        const query = {
          search: debouncedSearch,
          per_page: 10,
          status: 'publish',
          _fields: 'id,title,type',
        };
        const posts = core.getEntityRecords('postType', postType, query);
        if (core.isResolving('getEntityRecords', ['postType', postType, query])) loading = true;
        if (posts)
          results.push(
            ...posts.map((p) => ({
              id: p.id,
              type: postType,
              title: p.title?.rendered || p.title || `#${p.id}`,
            }))
          );
      }
      const selectedIds = selectedPosts.map((p) => p.id);
      return {
        searchResults: results.filter((p) => !selectedIds.includes(p.id)).slice(0, 10),
        isLoading: loading,
      };
    },
    [debouncedSearch, postTypes, selectedPosts]
  );

  const { selectedPostData } = useSelect(
    (select) => {
      const core = select(coreDataStore);
      const data = selectedPosts.map((sel) => {
        const post = core.getEntityRecord('postType', sel.type || 'post', sel.id);
        return post
          ? { id: post.id, type: sel.type || 'post', title: post.title?.rendered || post.title }
          : { id: sel.id, type: sel.type, title: `Loading #${sel.id}`, loading: true };
      });
      return { selectedPostData: data };
    },
    [selectedPosts]
  );

  const searchOptions = useMemo(
    () => searchResults.map((p) => ({ value: String(p.id), label: `${p.title} (${p.type})` })),
    [searchResults]
  );

  const handleSelect = (postId) => {
    const post = searchResults.find((p) => String(p.id) === postId);
    if (post && selectedPosts.length < maxItems)
      onChange([...selectedPosts, { id: post.id, type: post.type }]);
    setSearchTerm('');
  };

  const canAddMore = selectedPosts.length < maxItems;

  return (
    <Flex direction="column" gap={3} className="handoff-dps__manual">
      {canAddMore && (
        <div className="handoff-dps__manual-search">
          <ComboboxControl
            label={__('Search posts...', textDomain)}
            value=""
            onChange={handleSelect}
            onFilterValueChange={setSearchTerm}
            options={searchOptions}
          />
          {isLoading && <Spinner />}
        </div>
      )}
      {selectedPostData.length > 0 && (
        <Flex direction="column" gap={2}>
          {selectedPostData.map((post, index) => (
            <Card key={post.id} size="small">
              <CardBody>
                <Flex align="center" gap={2}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{post.title}</span>
                    <span style={{ color: '#757575', fontSize: '12px' }}>{post.type}</span>
                  </div>
                  <Button
                    icon={closeSmall}
                    size="small"
                    isDestructive
                    onClick={() => onChange(selectedPosts.filter((p) => p.id !== post.id))}
                    label={__('Remove', textDomain)}
                  />
                </Flex>
              </CardBody>
            </Card>
          ))}
        </Flex>
      )}
      {selectedPosts.length === 0 && (
        <span style={{ color: '#757575' }}>{__('No posts selected. Search above to add posts.', textDomain)}</span>
      )}
      {selectedPosts.length >= maxItems && (
        <span style={{ color: '#757575' }}>{__('Maximum items reached.', textDomain)}</span>
      )}
    </Flex>
  );
}

/**
 * DynamicPostSelector - value/onChange/options API
 *
 * @param {Object}   props
 * @param {Object}   props.value   - { source, postType, queryArgs, selectedPosts, itemOverrides? }
 * @param {Function} props.onChange - (nextValue) => void
 * @param {Object}   props.options - { postTypes, maxItems, textDomain?, showDateFilter?, showExcludeCurrent?, advancedFields? }
 */
export function DynamicPostSelector({ value = {}, onChange, options = {} }) {
  const {
    source = 'query',
    postType = 'post',
    queryArgs = {},
    selectedPosts = [],
    itemOverrides = {},
  } = value;

  const {
    postTypes = ['post'],
    maxItems = 20,
    textDomain = 'handoff',
    showDateFilter = false,
    showExcludeCurrent = true,
    datePresets = DEFAULT_DATE_PRESETS,
    advancedFields = [],
  } = options;

  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentPostType = postType || postTypes[0] || 'post';
  const currentPerPage = queryArgs.posts_per_page ?? Math.min(6, maxItems);
  const currentOrderBy = queryArgs.orderby || 'date';
  const currentOrder = queryArgs.order || 'DESC';
  const currentTaxQueries = queryArgs.tax_query || [];
  const datePreset = queryArgs.datePreset ?? '';
  const excludeCurrent = queryArgs.excludeCurrent !== false;

  const { taxonomies } = useSelect(
    (select) => {
      const core = select(coreDataStore);
      const all = core.getTaxonomies({ per_page: -1 });
      if (!all) return { taxonomies: [] };
      return {
        taxonomies: all.filter(
          (t) => t.types?.includes(currentPostType) && t.visibility?.show_ui
        ),
      };
    },
    [currentPostType]
  );

  const { postCount, isLoading } = useSelect(
    (select) => {
      if (source === 'select')
        return { postCount: selectedPosts.length, isLoading: false };
      const core = select(coreDataStore);
      const args = {
        per_page: 1,
        _fields: 'id',
        status: 'publish',
      };
      if (currentTaxQueries?.length) {
        currentTaxQueries.forEach((f) => {
          if (f.taxonomy && f.terms?.length) args[f.taxonomy] = f.terms.join(',');
        });
      }
      if (datePreset) args.after = getDateFromPreset(datePreset);
      const total = core.getEntityRecordsTotalItems('postType', currentPostType, args);
      const records = core.getEntityRecords('postType', currentPostType, args);
      return {
        postCount: total || 0,
        isLoading: records === null,
      };
    },
    [currentPostType, source, selectedPosts, currentTaxQueries, datePreset]
  );

  const updateValue = (partial) => {
    onChange({ ...value, ...partial });
  };

  const updateQueryArgs = (nextQueryArgs) => {
    updateValue({ queryArgs: { ...queryArgs, ...nextQueryArgs } });
  };

  const handlePostTypeChange = (newPostType) => {
    updateValue({
      postType: newPostType,
      queryArgs: { ...queryArgs, post_type: newPostType, tax_query: [] },
    });
  };

  const addTaxonomyFilter = () => {
    updateQueryArgs({
      tax_query: [...currentTaxQueries, { taxonomy: '', terms: [], id: Date.now() }],
    });
  };

  const updateTaxonomyFilter = (index, newFilter) => {
    const next = [...currentTaxQueries];
    next[index] = newFilter;
    updateQueryArgs({ tax_query: next });
  };

  const removeTaxonomyFilter = (index) => {
    updateQueryArgs({ tax_query: currentTaxQueries.filter((_, i) => i !== index) });
  };

  const unusedTaxonomies = (taxonomies || []).filter(
    (t) => !currentTaxQueries.some((q) => q.taxonomy === t.slug)
  );

  const orderByOptions = [
    { label: __('Date', textDomain), value: 'date' },
    { label: __('Title', textDomain), value: 'title' },
    { label: __('Modified', textDomain), value: 'modified' },
    { label: __('Menu Order', textDomain), value: 'menu_order' },
    { label: __('Random', textDomain), value: 'rand' },
    { label: __('Comment Count', textDomain), value: 'comment_count' },
  ];

  const orderOptions = [
    { label: __('Newest first', textDomain), value: 'DESC' },
    { label: __('Oldest first', textDomain), value: 'ASC' },
  ];

  return (
    <div className="handoff-dps">
      {source !== 'manual' && (
        <div className="handoff-dps__header">
          <div className="handoff-dps__post-type">
            <SelectControl
              value={currentPostType}
              options={postTypes.map((pt) => ({
                label: pt.charAt(0).toUpperCase() + pt.slice(1),
                value: pt,
              }))}
              onChange={handlePostTypeChange}
              __nextHasNoMarginBottom
            />
          </div>
          <div className="handoff-dps__count">
            {isLoading ? (
              <Spinner />
            ) : (
              <>
                <span className="handoff-dps__count-number">{postCount}</span>
                <span className="handoff-dps__count-label">
                  {postCount === 1 ? __('post', textDomain) : __('posts', textDomain)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="handoff-dps__modes">
        <button
          type="button"
          className={`handoff-dps__mode ${source === 'query' ? 'is-active' : ''}`}
          onClick={() => updateValue({ source: 'query' })}
        >
          <span className="dashicons dashicons-filter" />
          {__('Query', textDomain)}
        </button>
        <button
          type="button"
          className={`handoff-dps__mode ${source === 'select' ? 'is-active' : ''}`}
          onClick={() => updateValue({ source: 'select' })}
        >
          <span className="dashicons dashicons-search" />
          {__('Select', textDomain)}
        </button>
        <button
          type="button"
          className={`handoff-dps__mode ${source === 'manual' ? 'is-active' : ''}`}
          onClick={() => updateValue({ source: 'manual' })}
        >
          <span className="dashicons dashicons-edit" />
          {__('Manual', textDomain)}
        </button>
      </div>

      {source === 'query' && (
        <div className="handoff-dps__content">
          <div className="handoff-dps__section">
            <span className="handoff-dps__section-label">
              <span className="dashicons dashicons-category" />
              {__('Filter by Taxonomy', textDomain)}
            </span>
            {(taxonomies || []).length === 0 ? (
              <span style={{ color: '#757575' }}>{__('No taxonomies for this post type.', textDomain)}</span>
            ) : (
              <>
                {currentTaxQueries.map((filter, index) => (
                  <TaxonomyFilterRow
                    key={filter.id || filter.taxonomy || index}
                    filter={filter}
                    taxonomies={taxonomies}
                    onChange={(newFilter) => updateTaxonomyFilter(index, newFilter)}
                    onRemove={() => removeTaxonomyFilter(index)}
                    textDomain={textDomain}
                  />
                ))}
                <Button variant="secondary" size="small" onClick={addTaxonomyFilter}>
                  {__('+ Add Filter', textDomain)}
                </Button>
              </>
            )}
          </div>

          <div className="handoff-dps__section">
            <span className="handoff-dps__section-label">
              <span className="dashicons dashicons-sort" />
              {__('Order & Limit', textDomain)}
            </span>
            <Flex gap={2} wrap>
              <SelectControl
                label={__('Order by', textDomain)}
                value={currentOrderBy}
                options={orderByOptions}
                onChange={(v) => updateQueryArgs({ orderby: v })}
                __nextHasNoMarginBottom
              />
              <SelectControl
                label={__('Direction', textDomain)}
                value={currentOrder}
                options={orderOptions}
                onChange={(v) => updateQueryArgs({ order: v })}
                __nextHasNoMarginBottom
              />
            </Flex>
            <TextControl
              label={__('Number of posts', textDomain)}
              type="number"
              value={String(currentPerPage)}
              onChange={(v) => {
                const n = parseInt(v, 10);
                if (!isNaN(n) && n >= 1 && n <= maxItems) updateQueryArgs({ posts_per_page: n });
              }}
              min={1}
              max={maxItems}
              help={__('Maximum: ', textDomain) + maxItems}
            />
          </div>

          {showDateFilter && (
            <div className="handoff-dps__section">
              <span className="handoff-dps__section-label">
                <span className="dashicons dashicons-calendar-alt" />
                {__('Date Filter', textDomain)}
              </span>
              <SelectControl
                value={datePreset || ''}
                options={datePresets}
                onChange={(v) =>
                  updateQueryArgs({ datePreset: v, dateAfter: getDateFromPreset(v) })
                }
                __nextHasNoMarginBottom
              />
            </div>
          )}

          {(showExcludeCurrent || advancedFields.length > 0) && (
            <div className="handoff-dps__advanced">
              <button
                type="button"
                className="handoff-dps__advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <span className="dashicons dashicons-admin-generic" />
                {__('Advanced Options', textDomain)}
                <span className="handoff-dps__toggle-icon">{showAdvanced ? '−' : '+'}</span>
              </button>
              {showAdvanced && (
                <div className="handoff-dps__advanced-content">
                  {showExcludeCurrent && (
                    <ToggleControl
                      label={__('Exclude current post', textDomain)}
                      checked={excludeCurrent}
                      onChange={(v) => updateQueryArgs({ excludeCurrent: v })}
                      __nextHasNoMarginBottom
                    />
                  )}
                  {advancedFields.map((field) => {
                    if (field.type === 'select') {
                      return (
                        <SelectControl
                          key={field.name}
                          label={field.label}
                          value={itemOverrides[field.name] ?? field.default ?? ''}
                          options={[
                            { label: __('Select…', textDomain), value: '' },
                            ...(field.options || []),
                          ]}
                          onChange={(v) =>
                            updateValue({
                              itemOverrides: { ...itemOverrides, [field.name]: v || undefined },
                            })
                          }
                          __nextHasNoMarginBottom
                        />
                      );
                    }
                    if (field.type === 'text') {
                      return (
                        <TextControl
                          key={field.name}
                          label={field.label}
                          value={itemOverrides[field.name] ?? field.default ?? ''}
                          onChange={(v) =>
                            updateValue({
                              itemOverrides: { ...itemOverrides, [field.name]: v },
                            })
                          }
                          __nextHasNoMarginBottom
                        />
                      );
                    }
                    if (field.type === 'toggle') {
                      return (
                        <ToggleControl
                          key={field.name}
                          label={field.label}
                          checked={itemOverrides[field.name] ?? field.default ?? false}
                          onChange={(v) =>
                            updateValue({
                              itemOverrides: { ...itemOverrides, [field.name]: v },
                            })
                          }
                          __nextHasNoMarginBottom
                        />
                      );
                    }
                    if (field.type === 'number') {
                      return (
                        <TextControl
                          key={field.name}
                          label={field.label}
                          type="number"
                          value={String(itemOverrides[field.name] ?? field.default ?? 0)}
                          onChange={(v) =>
                            updateValue({
                              itemOverrides: { ...itemOverrides, [field.name]: parseInt(v, 10) || 0 },
                            })
                          }
                          __nextHasNoMarginBottom
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {source === 'select' && (
        <div className="handoff-dps__content handoff-dps__content--select">
          <ManualPicker
            postTypes={[currentPostType]}
            selectedPosts={selectedPosts}
            onChange={(posts) => updateValue({ selectedPosts: posts })}
            maxItems={maxItems}
            textDomain={textDomain}
          />
          <span className="handoff-dps__selection-count">
            {selectedPosts.length} {__('selected', textDomain)}
          </span>
        </div>
      )}
    </div>
  );
}

export default DynamicPostSelector;
