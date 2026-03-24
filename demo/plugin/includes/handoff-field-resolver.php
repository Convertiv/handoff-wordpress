<?php
/**
 * Handoff Field Resolver
 * 
 * Maps WordPress post data to Handoff template field structure.
 * No ACF dependency - uses native WordPress functions only.
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
    exit;
}

// Recursion guard to prevent infinite loops when blocks query posts containing the same block
global $handoff_field_resolver_depth;
if (!isset($handoff_field_resolver_depth)) {
    $handoff_field_resolver_depth = 0;
}
define('HANDOFF_MAX_RESOLVER_DEPTH', 2);

/**
 * Resolve a field value from a post.
 *
 * @param int          $post_id Post ID.
 * @param string|array $source  Field source configuration.
 * @return mixed Resolved value.
 */
function handoff_resolve_field($post_id, $source) {
    // Handle array-based source config
    if (is_array($source)) {
        return handoff_resolve_complex_field($post_id, $source);
    }
    
    // Handle string-based source
    $post = get_post($post_id);
    if (!$post) {
        return null;
    }
    
    // Core post fields
    // Note: We don't use apply_filters('the_content') here to avoid infinite loops
    // when rendering blocks that also use dynamic queries
    $post_fields = array(
        'post_title'   => $post->post_title,
        'post_content' => wpautop($post->post_content),
        'post_excerpt' => get_the_excerpt($post),
        'post_date'    => get_the_date('', $post),
        'post_name'    => $post->post_name,
        'permalink'    => get_permalink($post_id),
        'post_id'      => $post_id,
    );
    
    if (isset($post_fields[$source])) {
        return $post_fields[$source];
    }
    
    // Date part extraction (post_date:day, post_date:month, post_date:year, etc.)
    if (strpos($source, 'post_date:') === 0) {
        return handoff_get_date_part($post, substr($source, 10));
    }
    
    // Featured image
    if ($source === 'featured_image') {
        return handoff_get_featured_image_data($post_id);
    }
    
    // Author fields (author.name, author.url, etc.)
    if (strpos($source, 'author.') === 0) {
        return handoff_get_author_field($post_id, substr($source, 7));
    }
    
    // Taxonomy fields (taxonomy:category)
    if (strpos($source, 'taxonomy:') === 0) {
        return handoff_get_taxonomy_field($post_id, substr($source, 9));
    }
    
    // Post meta (meta:field_key)
    if (strpos($source, 'meta:') === 0) {
        return get_post_meta($post_id, substr($source, 5), true);
    }
    
    return null;
}

/**
 * Resolve a complex field configuration.
 *
 * @param int   $post_id Post ID.
 * @param array $source  Complex source configuration.
 * @return mixed Resolved value.
 */
function handoff_resolve_complex_field($post_id, $source) {
    $type = isset($source['type']) ? $source['type'] : '';
    
    switch ($type) {
        case 'static':
            // Static value - return as-is
            return isset($source['value']) ? $source['value'] : '';
            
        case 'manual':
            // User-editable via sidebar — value comes from itemOverrides, not the post
            return null;
            
        case 'meta':
            // Post meta field
            $key = isset($source['key']) ? $source['key'] : '';
            return $key ? get_post_meta($post_id, $key, true) : null;
            
        case 'taxonomy':
            // Taxonomy terms
            $taxonomy = isset($source['taxonomy']) ? $source['taxonomy'] : 'category';
            $format = isset($source['format']) ? $source['format'] : 'first';
            return handoff_get_taxonomy_field($post_id, $taxonomy, $format);
            
        case 'custom':
            // Custom callback function
            $callback = isset($source['callback']) ? $source['callback'] : '';
            if ($callback && is_callable($callback)) {
                return call_user_func($callback, $post_id, $source);
            }
            return null;
            
        default:
            return null;
    }
}

/**
 * Get a specific part of the post date.
 *
 * Supports common parts and custom PHP date formats:
 * - day: Day of month (01-31)
 * - day_name: Full day name (Monday, Tuesday, etc.)
 * - day_short: Short day name (Mon, Tue, etc.)
 * - month: Month number (01-12)
 * - month_name: Full month name (January, February, etc.)
 * - month_short: Short month name (Jan, Feb, etc.)
 * - year: Full year (2024)
 * - year_short: Two-digit year (24)
 * - time: Time in H:i format (14:30)
 * - format:X: Custom PHP date format where X is the format string
 *
 * @param WP_Post $post Post object.
 * @param string  $part Date part to extract.
 * @return string Formatted date part.
 */
function handoff_get_date_part($post, $part) {
    $date = get_post_datetime($post);
    if (!$date) {
        return '';
    }
    
    // Handle custom format (format:F j, Y)
    if (strpos($part, 'format:') === 0) {
        $format = substr($part, 7);
        return wp_date($format, $date->getTimestamp());
    }
    
    // Predefined date parts
    $formats = array(
        'day'         => 'd',      // 01-31
        'day_numeric' => 'j',      // 1-31 (no leading zero)
        'day_name'    => 'l',      // Monday, Tuesday, etc.
        'day_short'   => 'D',      // Mon, Tue, etc.
        'month'       => 'm',      // 01-12
        'month_numeric' => 'n',    // 1-12 (no leading zero)
        'month_name'  => 'F',      // January, February, etc.
        'month_short' => 'M',      // Jan, Feb, etc.
        'year'        => 'Y',      // 2024
        'year_short'  => 'y',      // 24
        'time'        => 'g:i A',  // 2:30 PM
        'time_24'     => 'H:i',    // 14:30
        'full'        => 'F j, Y', // January 15, 2024
        'iso'         => 'c',      // ISO 8601 format
    );
    
    if (isset($formats[$part])) {
        return wp_date($formats[$part], $date->getTimestamp());
    }
    
    // Fallback: treat the part as a raw PHP date format
    return wp_date($part, $date->getTimestamp());
}

/**
 * Get featured image data in Handoff image format.
 *
 * @param int    $post_id Post ID.
 * @param string $size    Image size. Default 'large'.
 * @return array Image data array with src, alt, srcset, sizes.
 */
function handoff_get_featured_image_data($post_id, $size = 'large') {
    $thumb_id = get_post_thumbnail_id($post_id);
    if (!$thumb_id) {
        return array('src' => '', 'alt' => '');
    }
    
    $src = wp_get_attachment_image_url($thumb_id, $size);
    $srcset = wp_get_attachment_image_srcset($thumb_id, $size);
    $sizes = wp_get_attachment_image_sizes($thumb_id, $size);
    $alt = get_post_meta($thumb_id, '_wp_attachment_image_alt', true);
    
    return array(
        'src'    => $src ?: '',
        'srcset' => $srcset ?: '',
        'sizes'  => $sizes ?: '',
        'alt'    => $alt ?: get_the_title($thumb_id),
    );
}

/**
 * Get author field data.
 *
 * @param int    $post_id Post ID.
 * @param string $field   Author field name (name, url, avatar, bio).
 * @return mixed Author field value.
 */
function handoff_get_author_field($post_id, $field) {
    $author_id = get_post_field('post_author', $post_id);
    if (!$author_id) {
        return null;
    }
    
    switch ($field) {
        case 'name':
            return get_the_author_meta('display_name', $author_id);
            
        case 'url':
            return get_author_posts_url($author_id);
            
        case 'avatar':
            return get_avatar_url($author_id, array('size' => 96));
            
        case 'bio':
        case 'description':
            return get_the_author_meta('description', $author_id);
            
        case 'email':
            return get_the_author_meta('email', $author_id);
            
        default:
            return get_the_author_meta($field, $author_id);
    }
}

/**
 * Get taxonomy field data.
 *
 * @param int    $post_id  Post ID.
 * @param string $taxonomy Taxonomy name.
 * @param string $format   Return format: 'first', 'all', 'links'. Default 'first'.
 * @return mixed Taxonomy data.
 */
function handoff_get_taxonomy_field($post_id, $taxonomy, $format = 'first') {
    $terms = get_the_terms($post_id, $taxonomy);
    
    if (is_wp_error($terms) || empty($terms)) {
        return $format === 'all' ? array() : '';
    }
    
    switch ($format) {
        case 'first':
            // Return first term name
            return $terms[0]->name;
            
        case 'all':
            // Return array of term data
            return array_map(function($term) {
                return array(
                    'name' => $term->name,
                    'slug' => $term->slug,
                    'url'  => get_term_link($term),
                );
            }, $terms);
            
        case 'links':
            // Return comma-separated linked terms
            $links = array();
            foreach ($terms as $term) {
                $links[] = sprintf(
                    '<a href="%s">%s</a>',
                    esc_url(get_term_link($term)),
                    esc_html($term->name)
                );
            }
            return implode(', ', $links);
            
        case 'names':
            // Return comma-separated term names
            return implode(', ', wp_list_pluck($terms, 'name'));
            
        default:
            return $terms[0]->name;
    }
}

/**
 * Map a complete post to Handoff item structure.
 *
 * @param int   $post_id       Post ID.
 * @param array $field_mapping Field mapping configuration.
 * @return array Mapped item data matching Handoff template structure.
 */
function handoff_map_post_to_item($post_id, $field_mapping) {
    global $handoff_field_resolver_depth;
    
    // Recursion guard
    if ($handoff_field_resolver_depth >= HANDOFF_MAX_RESOLVER_DEPTH) {
        return array();
    }
    
    $handoff_field_resolver_depth++;
    
    $item = array();
    
    foreach ($field_mapping as $handoff_path => $source) {
        $value = handoff_resolve_field($post_id, $source);
        handoff_set_nested_value($item, $handoff_path, $value);
    }
    
    $handoff_field_resolver_depth--;
    
    /**
     * Filter the mapped post item data.
     *
     * @param array $item          Mapped item data.
     * @param int   $post_id       Post ID.
     * @param array $field_mapping Field mapping configuration.
     */
    return apply_filters('handoff_mapped_post_item', $item, $post_id, $field_mapping);
}

/**
 * Set a nested array value using dot notation.
 * 
 * Example: handoff_set_nested_value($arr, 'link.url', 'https://...')
 * Results in: $arr['link']['url'] = 'https://...'
 *
 * @param array  $array Reference to the array to modify.
 * @param string $path  Dot-notation path (e.g., 'link.url').
 * @param mixed  $value Value to set.
 */
function handoff_set_nested_value(&$array, $path, $value) {
    $keys = explode('.', $path);
    $current = &$array;
    
    foreach ($keys as $key) {
        if (!isset($current[$key])) {
            $current[$key] = array();
        }
        $current = &$current[$key];
    }
    
    $current = $value;
}

/**
 * Apply item overrides to a single mapped item (e.g. card type for all cards in query mode).
 *
 * @param array $item     Mapped item array (e.g. from handoff_map_post_to_item).
 * @param array $overrides Associative array of dot-notation paths to values (e.g. ['card.type' => 'product']).
 * @return array Modified item with overrides applied.
 */
function handoff_apply_item_overrides($item, $overrides) {
    if (empty($overrides) || !is_array($overrides)) {
        return $item;
    }
    foreach ($overrides as $path => $value) {
        if ($path !== '' && $value !== null) {
            handoff_set_nested_value($item, $path, $value);
        }
    }
    return $item;
}

/**
 * Get nested value from an array using dot notation.
 *
 * @param array  $array Array to get value from.
 * @param string $path  Dot-notation path.
 * @param mixed  $default Default value if path doesn't exist.
 * @return mixed Value at path or default.
 */
function handoff_get_nested_value($array, $path, $default = null) {
    $keys = explode('.', $path);
    $current = $array;
    
    foreach ($keys as $key) {
        if (!is_array($current) || !isset($current[$key])) {
            return $default;
        }
        $current = $current[$key];
    }
    
    return $current;
}

/**
 * Query posts and map them to Handoff item structure.
 *
 * @param array $selected_posts Array of selected posts [{id, type}].
 * @param array $field_mapping  Field mapping configuration.
 * @return array Array of mapped items.
 */
function handoff_query_and_map_posts($selected_posts, $field_mapping) {
    if (empty($selected_posts)) {
        return array();
    }
    
    // Extract post IDs
    $post_ids = array();
    foreach ($selected_posts as $selected) {
        if (isset($selected['id'])) {
            $post_ids[] = intval($selected['id']);
        }
    }
    
    if (empty($post_ids)) {
        return array();
    }
    
    // Query posts
    $posts = get_posts(array(
        'post__in'       => $post_ids,
        'orderby'        => 'post__in',
        'posts_per_page' => count($post_ids),
        'post_status'    => 'publish',
        'post_type'      => 'any',
    ));
    
    // Map each post
    $items = array();
    foreach ($posts as $post) {
        $items[] = handoff_map_post_to_item($post->ID, $field_mapping);
    }
    
    return $items;
}

/**
 * Build a pagination array in the standard Handoff format: [{label, url, active}].
 *
 * Generates numbered page links with ellipsis for large page counts.
 * Uses add_query_arg() to build URLs with a custom query parameter per block,
 * allowing multiple paginated blocks on the same page.
 *
 * @param int    $current_page    The current page number (1-based).
 * @param int    $total_pages     Total number of pages from WP_Query->max_num_pages.
 * @param string $query_param_key The query parameter key (e.g., 'hf_page_bioItems').
 * @return array Array of pagination items [{label, url, active}].
 */
function handoff_build_pagination($current_page, $total_pages, $query_param_key) {
    if ($total_pages <= 1) {
        return array();
    }

    $pagination = array();
    $base_url = remove_query_arg($query_param_key);
    $range = 2;

    for ($i = 1; $i <= $total_pages; $i++) {
        if (
            $i === 1 ||
            $i === $total_pages ||
            abs($i - $current_page) <= $range
        ) {
            $url = ($i === 1)
                ? remove_query_arg($query_param_key, $base_url)
                : add_query_arg($query_param_key, $i, $base_url);

            $pagination[] = array(
                'label'  => (string) $i,
                'url'    => $url,
                'active' => ($i === $current_page),
            );
        } elseif (
            ($i === $current_page - $range - 1 && $i > 1) ||
            ($i === $current_page + $range + 1 && $i < $total_pages)
        ) {
            $pagination[] = array(
                'label'  => '...',
                'url'    => '#',
                'active' => false,
            );
        }
    }

    return $pagination;
}

/**
 * Build breadcrumb items for the current page/post.
 *
 * Returns an array of flat items with keys: label, url.
 * Returns an empty array on the front page or when no meaningful trail exists
 * (i.e., never a Home-only trail).
 *
 * Follows the patterns found in convertiv_breadcrumbs():
 *  - Home link as first crumb (only when there are additional crumbs)
 *  - Blog page link for post-type "post"
 *  - Category parent chain for category archives and single posts
 *  - Post type archive link for CPTs
 *  - Page ancestor chain for hierarchical pages
 *  - Search, date, tag, author, 404, and taxonomy archive crumbs
 *
 * @return array
 */
function handoff_get_breadcrumb_items() {
    $home_label = apply_filters('handoff_breadcrumbs_home_text', __('Home', 'handoff'));
    $home_url   = apply_filters('handoff_breadcrumbs_home_url', home_url('/'));

    $page_for_posts = (int) get_option('page_for_posts');
    $blog_label     = $page_for_posts ? get_the_title($page_for_posts) : __('Blog', 'handoff');
    $blog_url       = $page_for_posts ? get_permalink($page_for_posts) : '';
    $frontpage_id   = (int) get_option('page_on_front');

    $crumbs = [];

    $add = static function ($label, $url) use (&$crumbs) {
        if ($label === '' && $url === '') return;
        $crumbs[] = ['label' => (string) $label, 'url' => (string) $url];
    };

    if (is_front_page() || (is_home() && !$page_for_posts)) {
        return [];
    }

    if (is_home() && $page_for_posts) {
        $add($home_label, $home_url);
        $add(get_the_title($page_for_posts), get_permalink($page_for_posts));
        return $crumbs;
    }

    $add($home_label, $home_url);

    $post_type = get_post_type();
    $paged     = (int) get_query_var('paged');

    if (is_category()) {
        $cat = get_category((int) get_query_var('cat'), false);
        if ($blog_url) {
            $add($blog_label, $blog_url);
        }
        if ($cat && !is_wp_error($cat) && !empty($cat->parent)) {
            $parents = [];
            $pid = (int) $cat->parent;
            $depth = 0;
            while ($pid && $depth < 50) {
                $depth++;
                $parent_cat = get_category($pid);
                if (!$parent_cat || is_wp_error($parent_cat)) break;
                $parents[] = ['label' => $parent_cat->name, 'url' => get_category_link($parent_cat->term_id)];
                $pid = (int) $parent_cat->parent;
            }
            foreach (array_reverse($parents) as $p) {
                $add($p['label'], $p['url']);
            }
        }
        if ($paged > 0 && $cat && !is_wp_error($cat)) {
            $add($cat->name, get_category_link($cat->term_id));
            $add(sprintf(__('Page %s', 'handoff'), $paged), '');
        } else {
            $add(single_cat_title('', false), '');
        }
    } elseif (is_tag()) {
        if ($paged > 0) {
            $tag = get_queried_object();
            if ($tag && !is_wp_error($tag)) {
                $add($tag->name, get_tag_link($tag->term_id));
                $add(sprintf(__('Page %s', 'handoff'), $paged), '');
            }
        } else {
            $add(single_tag_title('', false), '');
        }
    } elseif (is_tax()) {
        $term = get_queried_object();
        if ($term && !is_wp_error($term)) {
            $parent_id = isset($term->parent) ? (int) $term->parent : 0;
            if ($parent_id) {
                $parent = get_term($parent_id, $term->taxonomy);
                if ($parent && !is_wp_error($parent)) {
                    $parent_link = get_term_link($parent, $term->taxonomy);
                    if (!is_wp_error($parent_link)) {
                        $add($parent->name, $parent_link);
                    }
                }
            }
            $add($term->name, '');
        }
    } elseif (is_search()) {
        $add(sprintf(__('Search Results for "%s"', 'handoff'), get_search_query()), '');
    } elseif (is_day()) {
        $add(get_the_time('Y'), get_year_link(get_the_time('Y')));
        $add(get_the_time('F'), get_month_link(get_the_time('Y'), get_the_time('m')));
        $add(get_the_time('d'), '');
    } elseif (is_month()) {
        $add(get_the_time('Y'), get_year_link(get_the_time('Y')));
        $add(get_the_time('F'), '');
    } elseif (is_year()) {
        $add(get_the_time('Y'), '');
    } elseif (is_author()) {
        $author = get_queried_object();
        if ($author && isset($author->display_name)) {
            $add(sprintf(__('Articles by %s', 'handoff'), $author->display_name), '');
        }
    } elseif (is_404()) {
        $add(__('Error 404', 'handoff'), '');
    } elseif (is_single() && !is_attachment()) {
        if ($post_type !== 'post') {
            $pto = get_post_type_object($post_type);
            if ($pto) {
                $archive_url = get_post_type_archive_link($post_type);
                if ($archive_url) {
                    $add($pto->labels->name, $archive_url);
                }
            }
            $parent_id = wp_get_post_parent_id(get_the_ID());
            if ($parent_id) {
                $add(get_the_title($parent_id), get_permalink($parent_id));
            }
            $add(get_the_title(), '');
        } else {
            if ($blog_url) {
                $add($blog_label, $blog_url);
            }
            $cats = get_the_category();
            if (!empty($cats)) {
                $cat = $cats[0];
                $parents = [];
                $pid = (int) $cat->parent;
                $depth = 0;
                while ($pid && $depth < 50) {
                    $depth++;
                    $parent_cat = get_category($pid);
                    if (!$parent_cat || is_wp_error($parent_cat)) break;
                    $parents[] = ['label' => $parent_cat->name, 'url' => get_category_link($parent_cat->term_id)];
                    $pid = (int) $parent_cat->parent;
                }
                foreach (array_reverse($parents) as $p) {
                    $add($p['label'], $p['url']);
                }
                $add($cat->name, get_category_link($cat->term_id));
            }
            $add(get_the_title(), '');
        }
    } elseif (is_attachment()) {
        $parent_id = wp_get_post_parent_id(get_the_ID());
        if ($parent_id) {
            $add(get_the_title($parent_id), get_permalink($parent_id));
        }
        $add(get_the_title(), '');
    } elseif (is_page()) {
        $post_id = get_the_ID();
        $parent_id = $post_id ? wp_get_post_parent_id($post_id) : 0;
        if ($parent_id && $parent_id !== $frontpage_id) {
            $ancestors = array_reverse(get_post_ancestors($post_id));
            foreach ($ancestors as $ancestor_id) {
                if ((int) $ancestor_id === $frontpage_id) continue;
                $add(get_the_title($ancestor_id), get_permalink($ancestor_id));
            }
        }
        $add(get_the_title(), '');
    } elseif (!is_single() && !is_page() && $post_type !== 'post' && !is_404()) {
        $pto = get_post_type_object($post_type);
        if ($pto) {
            if ($paged > 0) {
                $add($pto->label, get_post_type_archive_link($pto->name));
                $add(sprintf(__('Page %s', 'handoff'), $paged), '');
            } else {
                $add($pto->label, '');
            }
        }
    }

    if (count($crumbs) <= 1) {
        return [];
    }

    return $crumbs;
}


/**
 * Get available post types for the block editor.
 * Excludes WordPress internal types.
 *
 * @return array Array of post type objects with name, label, rest_base.
 */
function handoff_get_available_post_types() {
    $post_types = get_post_types(
        array(
            'public'       => true,
            'show_in_rest' => true,
        ),
        'objects'
    );
    
    // Exclude attachment
    unset($post_types['attachment']);
    
    $result = array();
    foreach ($post_types as $type) {
        $result[] = array(
            'name'      => $type->name,
            'label'     => $type->label,
            'rest_base' => $type->rest_base ?: $type->name,
        );
    }
    
    return $result;
}
