/**
 * PostQueryBuilder Component
 * 
 * A query builder UI for dynamic array fields that lets users:
 * - Select a post type
 * - Add taxonomy filters (categories, tags, custom taxonomies)
 * - Set ordering options
 * - Configure posts per page
 *
 * @package Handoff_Blocks
 */

import { useState, useEffect } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as coreDataStore } from '@wordpress/core-data';
import {
  SelectControl,
  RangeControl,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormTokenField,
  __experimentalVStack as VStack,
  __experimentalHStack as HStack,
  __experimentalText as Text,
  __experimentalDivider as Divider,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { plus, closeSmall } from '@wordpress/icons';

/**
 * TaxonomyFilter - Individual taxonomy filter control
 */
function TaxonomyFilter({ taxonomy, selectedTerms, onChange, onRemove }) {
  const [searchValue, setSearchValue] = useState('');

  // Fetch terms for this taxonomy
  const { terms, isLoading } = useSelect(
    (select) => {
      const core = select(coreDataStore);
      const query = {
        per_page: 100,
        orderby: 'name',
        order: 'asc',
        _fields: 'id,name,slug',
      };

      const fetchedTerms = core.getEntityRecords('taxonomy', taxonomy.slug, query);
      const resolving = core.isResolving('getEntityRecords', [
        'taxonomy',
        taxonomy.slug,
        query,
      ]);

      return {
        terms: fetchedTerms || [],
        isLoading: resolving,
      };
    },
    [taxonomy.slug]
  );

  // Get term names for display
  const termNames = terms.map((t) => t.name);
  const selectedTermNames = selectedTerms
    .map((id) => {
      const term = terms.find((t) => t.id === id);
      return term ? term.name : null;
    })
    .filter(Boolean);

  const handleChange = (newTermNames) => {
    const newTermIds = newTermNames
      .map((name) => {
        const term = terms.find((t) => t.name === name);
        return term ? term.id : null;
      })
      .filter(Boolean);
    onChange(newTermIds);
  };

  return (
    <Card size="small" className="handoff-taxonomy-filter">
      <CardHeader>
        <HStack alignment="center">
          <Text weight={500}>{taxonomy.label}</Text>
          <Button
            icon={closeSmall}
            size="small"
            isDestructive
            onClick={onRemove}
            label={__('Remove filter', 'handoff')}
          />
        </HStack>
      </CardHeader>
      <CardBody>
        <FormTokenField
          label={__('Select terms', 'handoff')}
          value={selectedTermNames}
          suggestions={termNames}
          onChange={handleChange}
          __experimentalExpandOnFocus
          __experimentalShowHowTo={false}
        />
      </CardBody>
    </Card>
  );
}

/**
 * PostQueryBuilder - Build WordPress queries for dynamic arrays
 *
 * @param {Object} props Component props
 * @param {string[]} props.postTypes - Allowed post types
 * @param {Object} props.queryArgs - Current query arguments
 * @param {Function} props.onChange - Callback when query changes
 * @param {number} props.maxItems - Maximum posts per page
 */
export function PostQueryBuilder({
  postTypes = ['post'],
  queryArgs = {},
  onChange,
  maxItems = 20,
}) {
  // Local state for available taxonomies
  const [availableTaxonomies, setAvailableTaxonomies] = useState([]);

  // Current query values with defaults
  const currentPostType = queryArgs.post_type || postTypes[0] || 'post';
  const currentPerPage = queryArgs.posts_per_page || 6;
  const currentOrderBy = queryArgs.orderby || 'date';
  const currentOrder = queryArgs.order || 'DESC';
  const currentTaxQueries = queryArgs.tax_query || [];

  // Fetch taxonomies for selected post type
  const { taxonomies } = useSelect(
    (select) => {
      const core = select(coreDataStore);
      const allTaxonomies = core.getTaxonomies({ per_page: -1 });

      if (!allTaxonomies) {
        return { taxonomies: [] };
      }

      // Filter to taxonomies that apply to current post type
      const filtered = allTaxonomies.filter(
        (tax) => tax.types && tax.types.includes(currentPostType) && tax.visibility?.show_ui
      );

      return { taxonomies: filtered };
    },
    [currentPostType]
  );

  useEffect(() => {
    if (taxonomies) {
      setAvailableTaxonomies(taxonomies);
    }
  }, [taxonomies]);

  // Update a single query arg
  const updateQueryArg = (key, value) => {
    onChange({
      ...queryArgs,
      [key]: value,
    });
  };

  // Handle post type change - reset tax queries
  const handlePostTypeChange = (newPostType) => {
    onChange({
      ...queryArgs,
      post_type: newPostType,
      tax_query: [], // Reset taxonomy filters when post type changes
    });
  };

  // Add a new taxonomy filter
  const addTaxonomyFilter = (taxonomySlug) => {
    const newTaxQueries = [
      ...currentTaxQueries,
      {
        taxonomy: taxonomySlug,
        field: 'term_id',
        terms: [],
      },
    ];
    updateQueryArg('tax_query', newTaxQueries);
  };

  // Update taxonomy filter terms
  const updateTaxonomyFilter = (index, terms) => {
    const newTaxQueries = [...currentTaxQueries];
    newTaxQueries[index] = {
      ...newTaxQueries[index],
      terms,
    };
    updateQueryArg('tax_query', newTaxQueries);
  };

  // Remove a taxonomy filter
  const removeTaxonomyFilter = (index) => {
    const newTaxQueries = currentTaxQueries.filter((_, i) => i !== index);
    updateQueryArg('tax_query', newTaxQueries);
  };

  // Get taxonomies that aren't already added as filters
  const unusedTaxonomies = availableTaxonomies.filter(
    (tax) => !currentTaxQueries.some((tq) => tq.taxonomy === tax.slug)
  );

  // Order by options
  const orderByOptions = [
    { label: __('Date', 'handoff'), value: 'date' },
    { label: __('Title', 'handoff'), value: 'title' },
    { label: __('Modified Date', 'handoff'), value: 'modified' },
    { label: __('Menu Order', 'handoff'), value: 'menu_order' },
    { label: __('Random', 'handoff'), value: 'rand' },
    { label: __('Comment Count', 'handoff'), value: 'comment_count' },
  ];

  const orderOptions = [
    { label: __('Descending', 'handoff'), value: 'DESC' },
    { label: __('Ascending', 'handoff'), value: 'ASC' },
  ];

  return (
    <VStack spacing={4} className="handoff-query-builder">
      {/* Post Type Selection */}
      {postTypes.length > 1 && (
        <SelectControl
          label={__('Post Type', 'handoff')}
          value={currentPostType}
          options={postTypes.map((pt) => ({
            label: pt.charAt(0).toUpperCase() + pt.slice(1),
            value: pt,
          }))}
          onChange={handlePostTypeChange}
        />
      )}

      {/* Posts Per Page */}
      <RangeControl
        label={__('Posts Per Page', 'handoff')}
        value={currentPerPage}
        onChange={(value) => updateQueryArg('posts_per_page', value)}
        min={1}
        max={maxItems}
        help={__('Number of posts to display', 'handoff')}
      />

      <Divider />

      {/* Ordering */}
      <HStack alignment="top" spacing={3}>
        <div style={{ flex: 1 }}>
          <SelectControl
            label={__('Order By', 'handoff')}
            value={currentOrderBy}
            options={orderByOptions}
            onChange={(value) => updateQueryArg('orderby', value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <SelectControl
            label={__('Order', 'handoff')}
            value={currentOrder}
            options={orderOptions}
            onChange={(value) => updateQueryArg('order', value)}
          />
        </div>
      </HStack>

      <Divider />

      {/* Taxonomy Filters */}
      <div className="handoff-query-builder__filters">
        <Text weight={600} size="12px" upperCase>
          {__('Filters', 'handoff')}
        </Text>

        <VStack spacing={3}>
          {currentTaxQueries.map((taxQuery, index) => {
            const taxonomy = availableTaxonomies.find(
              (t) => t.slug === taxQuery.taxonomy
            );
            if (!taxonomy) return null;

            return (
              <TaxonomyFilter
                key={taxQuery.taxonomy}
                taxonomy={taxonomy}
                selectedTerms={taxQuery.terms || []}
                onChange={(terms) => updateTaxonomyFilter(index, terms)}
                onRemove={() => removeTaxonomyFilter(index)}
              />
            );
          })}

          {/* Add Filter Button */}
          {unusedTaxonomies.length > 0 && (
            <HStack>
              <SelectControl
                label={__('Add Filter', 'handoff')}
                value=""
                options={[
                  { label: __('Select taxonomy...', 'handoff'), value: '' },
                  ...unusedTaxonomies.map((tax) => ({
                    label: tax.labels?.singular_name || tax.name,
                    value: tax.slug,
                  })),
                ]}
                onChange={(value) => {
                  if (value) {
                    addTaxonomyFilter(value);
                  }
                }}
              />
            </HStack>
          )}

          {unusedTaxonomies.length === 0 && currentTaxQueries.length === 0 && (
            <Text variant="muted">
              {__('No taxonomy filters available for this post type.', 'handoff')}
            </Text>
          )}
        </VStack>
      </div>

      {/* Query Preview */}
      <div className="handoff-query-builder__preview">
        <Text variant="muted" size="small">
          {__('Showing', 'handoff')} {currentPerPage} {currentPostType}
          {currentPerPage !== 1 ? 's' : ''} {__('ordered by', 'handoff')}{' '}
          {currentOrderBy} ({currentOrder})
          {currentTaxQueries.length > 0 &&
            ` ${__('with', 'handoff')} ${currentTaxQueries.length} ${
              currentTaxQueries.length === 1 ? __('filter', 'handoff') : __('filters', 'handoff')
            }`}
        </Text>
      </div>
    </VStack>
  );
}

export default PostQueryBuilder;
