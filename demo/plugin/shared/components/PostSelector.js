/**
 * PostSelector Component
 * 
 * Reusable post selection UI for dynamic array fields.
 * Uses native WordPress components - no external dependencies.
 *
 * @package Handoff_Blocks
 */

import { useState, useEffect, useMemo } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as coreDataStore } from '@wordpress/core-data';
import {
  ComboboxControl,
  Spinner,
  Button,
  Card,
  CardBody,
  __experimentalVStack as VStack,
  __experimentalHStack as HStack,
  __experimentalText as Text,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { dragHandle, closeSmall } from '@wordpress/icons';

/**
 * PostSelector - Select WordPress posts for dynamic array fields
 *
 * @param {Object} props Component props
 * @param {string[]} props.postTypes - Allowed post types
 * @param {Array} props.selectedPosts - Currently selected posts [{id, type}]
 * @param {Function} props.onChange - Callback when selection changes
 * @param {string} props.mode - Selection mode: 'single' or 'multiple'
 * @param {number} props.maxItems - Maximum items for multiple mode
 * @param {string} props.placeholder - Search placeholder text
 */
export function PostSelector({
  postTypes = ['post'],
  selectedPosts = [],
  onChange,
  mode = 'multiple',
  maxItems = 10,
  placeholder = __('Search posts...', 'handoff'),
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Debounce search term
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch posts matching search
  const { searchResults, isLoading } = useSelect(
    (select) => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        return { searchResults: [], isLoading: false };
      }

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
        const resolving = core.isResolving('getEntityRecords', [
          'postType',
          postType,
          query,
        ]);

        if (resolving) {
          loading = true;
        }

        if (posts) {
          results.push(
            ...posts.map((p) => ({
              id: p.id,
              type: postType,
              title: p.title?.rendered || p.title || `Post #${p.id}`,
            }))
          );
        }
      }

      // Filter out already selected posts
      const selectedIds = selectedPosts.map((p) => p.id);
      const filtered = results.filter((p) => !selectedIds.includes(p.id));

      return {
        searchResults: filtered.slice(0, 10),
        isLoading: loading,
      };
    },
    [debouncedSearch, postTypes, selectedPosts]
  );

  // Fetch data for selected posts
  const { selectedPostData } = useSelect(
    (select) => {
      const core = select(coreDataStore);
      const data = [];

      for (const selected of selectedPosts) {
        const post = core.getEntityRecord(
          'postType',
          selected.type || 'post',
          selected.id
        );
        if (post) {
          data.push({
            id: post.id,
            type: selected.type || 'post',
            title: post.title?.rendered || post.title || `Post #${post.id}`,
          });
        } else {
          // Show placeholder while loading
          data.push({
            id: selected.id,
            type: selected.type || 'post',
            title: `Loading... (#${selected.id})`,
            loading: true,
          });
        }
      }

      return { selectedPostData: data };
    },
    [selectedPosts]
  );

  // Handle selecting a post from search results
  const handleSelect = (postId) => {
    const post = searchResults.find((p) => String(p.id) === postId);
    if (!post) return;

    if (mode === 'single') {
      onChange([{ id: post.id, type: post.type }]);
    } else {
      if (selectedPosts.length < maxItems) {
        onChange([...selectedPosts, { id: post.id, type: post.type }]);
      }
    }
    setSearchTerm('');
  };

  // Handle removing a selected post
  const handleRemove = (postId) => {
    onChange(selectedPosts.filter((p) => p.id !== postId));
  };

  // Handle reordering (move up/down)
  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newPosts = [...selectedPosts];
    [newPosts[index - 1], newPosts[index]] = [
      newPosts[index],
      newPosts[index - 1],
    ];
    onChange(newPosts);
  };

  const handleMoveDown = (index) => {
    if (index === selectedPosts.length - 1) return;
    const newPosts = [...selectedPosts];
    [newPosts[index], newPosts[index + 1]] = [
      newPosts[index + 1],
      newPosts[index],
    ];
    onChange(newPosts);
  };

  // Build options for ComboboxControl
  const searchOptions = useMemo(() => {
    return searchResults.map((p) => ({
      value: String(p.id),
      label: `${p.title} (${p.type})`,
    }));
  }, [searchResults]);

  const canAddMore = mode === 'multiple' ? selectedPosts.length < maxItems : selectedPosts.length === 0;

  return (
    <VStack spacing={3} className="handoff-post-selector">
      {/* Search input */}
      {canAddMore && (
        <div className="handoff-post-selector__search">
          <ComboboxControl
            label={placeholder}
            value=""
            onChange={handleSelect}
            onFilterValueChange={(value) => {
              setSearchTerm(value);
              setIsSearching(value.length >= 2);
            }}
            options={searchOptions}
            __experimentalRenderItem={({ item }) => (
              <span>{item.label}</span>
            )}
          />
          {isLoading && (
            <div className="handoff-post-selector__loading">
              <Spinner />
            </div>
          )}
        </div>
      )}

      {/* Selected posts list */}
      {selectedPostData.length > 0 && (
        <VStack spacing={2} className="handoff-post-selector__selected">
          {selectedPostData.map((post, index) => (
            <Card
              key={post.id}
              size="small"
              className="handoff-post-selector__item"
            >
              <CardBody>
                <HStack alignment="center" spacing={2}>
                  {mode === 'multiple' && selectedPosts.length > 1 && (
                    <VStack spacing={0}>
                      <Button
                        icon="arrow-up-alt2"
                        size="small"
                        disabled={index === 0}
                        onClick={() => handleMoveUp(index)}
                        label={__('Move up', 'handoff')}
                      />
                      <Button
                        icon="arrow-down-alt2"
                        size="small"
                        disabled={index === selectedPosts.length - 1}
                        onClick={() => handleMoveDown(index)}
                        label={__('Move down', 'handoff')}
                      />
                    </VStack>
                  )}
                  <div style={{ flex: 1 }}>
                    <Text weight={500}>
                      {post.loading ? (
                        <span style={{ opacity: 0.6 }}>{post.title}</span>
                      ) : (
                        post.title
                      )}
                    </Text>
                    <Text variant="muted" size="small">
                      {post.type}
                    </Text>
                  </div>
                  <Button
                    icon={closeSmall}
                    size="small"
                    isDestructive
                    onClick={() => handleRemove(post.id)}
                    label={__('Remove', 'handoff')}
                  />
                </HStack>
              </CardBody>
            </Card>
          ))}
        </VStack>
      )}

      {/* Empty state */}
      {selectedPosts.length === 0 && (
        <Text variant="muted" align="center">
          {__('No posts selected. Search above to add posts.', 'handoff')}
        </Text>
      )}

      {/* Max items notice */}
      {mode === 'multiple' && selectedPosts.length >= maxItems && (
        <Text variant="muted" align="center">
          {__(`Maximum of ${maxItems} items reached.`, 'handoff')}
        </Text>
      )}
    </VStack>
  );
}

export default PostSelector;
