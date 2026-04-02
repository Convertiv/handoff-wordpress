<?php
/**
 * Handoff Migration
 *
 * Reads migration schemas, parses ACF blocks from page content,
 * manages field-mapping templates, transforms ACF data into Handoff
 * block attributes, and executes page-level migrations.
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
    exit;
}

class Handoff_Migration {

    const MAPPINGS_OPTION = 'handoff_migration_mappings';

    /* ------------------------------------------------------------------
     * Schema reader
     * ----------------------------------------------------------------*/

    /**
     * Return every migration-schema.json found in build/<block>/
     *
     * @return array Keyed by block name (e.g. "handoff/hero-basic").
     */
    public static function get_schemas() {
        $schemas = [];
        $build_dir = HANDOFF_BLOCKS_PATH . 'build/';

        if (!is_dir($build_dir)) {
            return $schemas;
        }

        foreach (scandir($build_dir) as $entry) {
            if ($entry === '.' || $entry === '..') continue;

            $schema_path = $build_dir . $entry . '/migration-schema.json';
            if (!file_exists($schema_path)) continue;

            $data = json_decode(file_get_contents($schema_path), true);
            if (is_array($data) && !empty($data['blockName'])) {
                $schemas[$data['blockName']] = $data;
            }
        }

        return $schemas;
    }

    /* ------------------------------------------------------------------
     * Page listing — all posts, no content filter
     * ----------------------------------------------------------------*/

    /**
     * Return a paginated list of ALL pages/posts regardless of what content
     * they contain. Each item includes a lightweight summary of available
     * content sources so the UI can give a quick overview without loading
     * full field data for every post.
     *
     * @param string $post_type  'any' expands to ['page','post'].
     * @param int    $per_page
     * @param int    $page_num
     * @return array { pages, total, totalPages }
     */
    public static function get_all_pages($post_type = 'any', $per_page = 50, $page_num = 1) {
        $post_types = $post_type === 'any' ? ['page', 'post'] : (array) $post_type;

        $query = new WP_Query([
            'post_type'      => $post_types,
            'post_status'    => ['publish', 'draft', 'private'],
            'posts_per_page' => $per_page,
            'paged'          => $page_num,
            'orderby'        => 'date',
            'order'          => 'DESC',
        ]);

        $results = [];
        foreach ($query->posts as $post) {
            $sources = [];

            if (!empty(trim($post->post_content))) {
                $sources[] = has_blocks($post->post_content) ? 'blocks' : 'classic';
            }
            if (function_exists('get_fields')) {
                $acf_check = get_fields($post->ID);
                if (!empty($acf_check)) {
                    $sources[] = 'acf';
                }
            }
            if (!in_array('acf', $sources, true)) {
                $all_meta   = get_post_meta($post->ID);
                $public_cnt = count(array_filter(
                    array_keys($all_meta),
                    fn($k) => strpos($k, '_') !== 0
                ));
                if ($public_cnt > 0) {
                    $sources[] = 'meta';
                }
            }

            $results[] = [
                'id'             => $post->ID,
                'title'          => $post->post_title ?: __('(no title)', 'handoff'),
                'postType'       => $post->post_type,
                'status'         => $post->post_status,
                'editUrl'        => get_edit_post_link($post->ID, 'raw'),
                'contentSources' => array_values(array_unique($sources)),
                'template'       => get_page_template_slug($post->ID) ?: null,
            ];
        }

        return [
            'pages'      => $results,
            'total'      => (int) $query->found_posts,
            'totalPages' => (int) $query->max_num_pages,
        ];
    }

    /* ------------------------------------------------------------------
     * Page content inspector
     * ----------------------------------------------------------------*/

    /**
     * Return all inspectable content for a single post, organised by source.
     *
     * Sources:
     *   core   — standard WP post fields (title, content, excerpt, author, image …)
     *   acf    — ACF fields decoded by get_fields() (requires ACF plugin)
     *   blocks — Gutenberg blocks already in post_content
     *   meta   — public custom post meta not already covered by ACF
     *
     * Each source also provides a `flatFields` map (dotted-key → scalar preview)
     * ready for the FieldMapper component.
     *
     * @param int $post_id
     * @return array|null  Null when post does not exist.
     */
    public static function get_page_content($post_id) {
        $post = get_post($post_id);
        if (!$post) return null;

        $sources = [];

        // ── 1. Core post fields ────────────────────────────────────────
        $thumbnail_id = get_post_thumbnail_id($post->ID);
        $core_fields  = [
            'post_title'     => $post->post_title,
            'post_content'   => $post->post_content,
            'post_excerpt'   => $post->post_excerpt,
            'post_date'      => $post->post_date,
            'post_author'    => get_the_author_meta('display_name', $post->post_author),
            'permalink'      => get_permalink($post->ID),
            'featured_image' => $thumbnail_id
                ? wp_get_attachment_image_url($thumbnail_id, 'large')
                : null,
        ];
        $sources['core'] = [
            'label'      => 'Core Post Fields',
            'fields'     => $core_fields,
            'flatFields' => self::flatten_for_mapper($core_fields, 'core'),
        ];

        // ── 2. ACF fields ──────────────────────────────────────────────
        if (function_exists('get_fields')) {
            $acf_raw = get_fields($post->ID);
            if (is_array($acf_raw) && !empty($acf_raw)) {
                $sources['acf'] = [
                    'label'      => 'ACF Fields',
                    'fields'     => $acf_raw,
                    'flatFields' => self::flatten_for_mapper($acf_raw, 'acf'),
                ];
            }
        }

        // ── 3. Existing Gutenberg blocks ───────────────────────────────
        if (!empty(trim($post->post_content)) && has_blocks($post->post_content)) {
            $parsed     = parse_blocks($post->post_content);
            $block_list = [];
            $block_flat = [];
            foreach ($parsed as $idx => $block) {
                if (empty($block['blockName'])) continue;
                $block_list[] = [
                    'index'     => $idx,
                    'blockName' => $block['blockName'],
                    'attrs'     => $block['attrs'],
                ];
                $block_flat["blocks.{$idx}.blockName"] = $block['blockName'];
                foreach ($block['attrs'] as $ak => $av) {
                    $block_flat["blocks.{$idx}.{$ak}"] = is_scalar($av)
                        ? $av
                        : wp_json_encode($av);
                }
            }
            $sources['blocks'] = [
                'label'      => 'Existing Blocks',
                'blocks'     => $block_list,
                'flatFields' => $block_flat,
            ];
        }

        // ── 4. Other public post meta ──────────────────────────────────
        $all_meta  = get_post_meta($post->ID);
        $acf_keys  = isset($sources['acf']) ? array_keys($sources['acf']['fields']) : [];
        $pub_meta  = [];
        foreach ($all_meta as $key => $values) {
            if (strpos($key, '_') === 0) continue;
            if (in_array($key, $acf_keys, true)) continue;
            $pub_meta[$key] = count($values) === 1
                ? maybe_unserialize($values[0])
                : array_map('maybe_unserialize', $values);
        }
        if (!empty($pub_meta)) {
            $sources['meta'] = [
                'label'      => 'Post Meta',
                'fields'     => $pub_meta,
                'flatFields' => self::flatten_for_mapper($pub_meta, 'meta'),
            ];
        }

        return [
            'id'       => $post->ID,
            'title'    => $post->post_title,
            'postType' => $post->post_type,
            'status'   => $post->post_status,
            'sources'  => $sources,
        ];
    }

    /**
     * Flatten a nested field array into a one-level dotted-key map for the FieldMapper.
     * Indexed arrays (repeaters, flexible content) expose their first item's sub-keys
     * with a ".0." segment, and store the whole array as a JSON preview at the top-key.
     *
     * @param array  $data
     * @param string $prefix    Source prefix, e.g. "acf" or "core".
     * @param int    $max_depth Maximum nesting depth (default 3).
     * @return array  Flat map of dotted-key → scalar or json-string.
     */
    private static function flatten_for_mapper($data, $prefix = '', $max_depth = 3) {
        $flat = [];
        self::flatten_recursive($data, $prefix, 0, $max_depth, $flat);
        return $flat;
    }

    private static function flatten_recursive($data, $prefix, $depth, $max_depth, &$flat) {
        if (!is_array($data) && !is_object($data)) {
            $flat[$prefix] = $data;
            return;
        }

        $data = (array) $data;
        if (empty($data)) {
            $flat[$prefix] = null;
            return;
        }

        $is_sequential = !empty($data) && array_keys($data) === range(0, count($data) - 1);

        // Store top-level as JSON preview regardless of depth
        $flat[$prefix] = wp_json_encode($data);

        if ($depth >= $max_depth) {
            return;
        }

        if ($is_sequential) {
            // Expose first-item sub-keys so the user can map into repeater items
            if (isset($data[0]) && (is_array($data[0]) || is_object($data[0]))) {
                self::flatten_recursive($data[0], "{$prefix}.0", $depth + 1, $max_depth, $flat);
            }
        } else {
            foreach ($data as $key => $value) {
                $child = $prefix ? "{$prefix}.{$key}" : (string) $key;
                self::flatten_recursive($value, $child, $depth + 1, $max_depth, $flat);
            }
        }
    }

    /* ------------------------------------------------------------------
     * Mapping CRUD
     * ----------------------------------------------------------------*/

    /**
     * @return array  Keyed by ACF block name.
     */
    public static function get_mappings() {
        $stored = get_option(self::MAPPINGS_OPTION, '{}');
        $decoded = json_decode($stored, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Save or update a single mapping template.
     *
     * @param string $acf_block_name   e.g. "acf/testimonial"
     * @param array  $mapping          { targetBlock, fieldMappings }
     */
    public static function save_mapping($acf_block_name, $mapping) {
        $all = self::get_mappings();
        $mapping['updatedAt'] = gmdate('c');
        $all[$acf_block_name] = $mapping;
        update_option(self::MAPPINGS_OPTION, wp_json_encode($all), false);
    }

    /**
     * Delete a mapping template.
     *
     * @param string $acf_block_name
     */
    public static function delete_mapping($acf_block_name) {
        $all = self::get_mappings();
        unset($all[$acf_block_name]);
        update_option(self::MAPPINGS_OPTION, wp_json_encode($all), false);
    }

    /* ------------------------------------------------------------------
     * Field transforms (ACF → Handoff)
     * ----------------------------------------------------------------*/

    /**
     * Transform a single ACF field value into the shape expected by a
     * Handoff block attribute.
     *
     * @param mixed  $value        The raw ACF field value.
     * @param string $target_type  The Handoff property type.
     * @return mixed
     */
    public static function transform_field($value, $target_type) {
        switch ($target_type) {
            case 'text':
            case 'richtext':
            case 'select':
                return is_string($value) ? $value : strval($value);

            case 'number':
                return is_numeric($value) ? floatval($value) : 0;

            case 'boolean':
                return (bool) $value;

            case 'image':
                return self::transform_image($value);

            case 'link':
                return self::transform_link($value);

            case 'button':
                return self::transform_button($value);

            default:
                return $value;
        }
    }

    /**
     * ACF image → Handoff image object { src, alt, id }.
     * Handles attachment ID (int), array (ACF return format), or URL string.
     */
    private static function transform_image($value) {
        if (is_numeric($value)) {
            $id  = intval($value);
            $src = wp_get_attachment_image_url($id, 'large');
            $alt = get_post_meta($id, '_wp_attachment_image_alt', true);
            return [
                'id'  => $id,
                'src' => $src ?: '',
                'alt' => $alt ?: '',
            ];
        }

        if (is_array($value)) {
            return [
                'id'  => isset($value['id'])  ? intval($value['id']) : 0,
                'src' => isset($value['url']) ? $value['url'] : '',
                'alt' => isset($value['alt']) ? $value['alt'] : '',
            ];
        }

        if (is_string($value) && !empty($value)) {
            return ['src' => $value, 'alt' => ''];
        }

        return ['src' => '', 'alt' => ''];
    }

    /**
     * ACF link { title, url, target } → Handoff link { label, url, opensInNewTab }.
     */
    private static function transform_link($value) {
        if (is_array($value)) {
            return [
                'label'         => isset($value['title']) ? $value['title'] : '',
                'url'           => isset($value['url'])   ? $value['url']   : '',
                'opensInNewTab' => !empty($value['target']) && $value['target'] === '_blank',
            ];
        }

        if (is_string($value)) {
            return ['label' => '', 'url' => $value, 'opensInNewTab' => false];
        }

        return ['label' => '', 'url' => '', 'opensInNewTab' => false];
    }

    /**
     * ACF link { title, url, target } → Handoff button { label, href, target, rel }.
     */
    private static function transform_button($value) {
        if (is_array($value)) {
            $is_blank = !empty($value['target']) && $value['target'] === '_blank';
            return [
                'label'  => isset($value['title']) ? $value['title'] : '',
                'href'   => isset($value['url'])   ? $value['url']   : '#',
                'target' => $is_blank ? '_blank' : '',
                'rel'    => $is_blank ? 'noopener noreferrer' : '',
            ];
        }

        return ['label' => '', 'href' => '#', 'target' => '', 'rel' => ''];
    }

    /**
     * Apply a field mapping to a flat source-data map, producing Handoff block attributes.
     *
     * $source_data is the flat dotted-key map produced by flatten_for_mapper (or any
     * flat key→value structure).  Field mapping keys are source dotted paths;
     * values are Handoff schema dotted paths.
     *
     * @param array  $source_data     Flat map of source-key → value (e.g. "acf.hero.title").
     * @param array  $field_mappings  source-key → Handoff dot-path map.
     * @param array  $schema_props    The "properties" section of the target block's migration schema.
     * @return array  Gutenberg-ready attributes.
     */
    public static function apply_mapping($source_data, $field_mappings, $schema_props) {
        $attributes = [];

        foreach ($field_mappings as $source_key => $handoff_path) {
            $value = isset($source_data[$source_key]) ? $source_data[$source_key] : null;
            if ($value === null) continue;

            $target_type = self::resolve_target_type($handoff_path, $schema_props);
            $transformed = self::transform_field($value, $target_type);

            $path_parts = explode('.', $handoff_path);
            $top_key    = $path_parts[0];
            $attr_name  = isset($schema_props[$top_key]['attributeName'])
                ? $schema_props[$top_key]['attributeName']
                : $top_key;

            if (count($path_parts) === 1) {
                $attributes[$attr_name] = $transformed;
            } else {
                if (!isset($attributes[$attr_name]) || !is_array($attributes[$attr_name])) {
                    $attributes[$attr_name] = [];
                }
                self::set_nested($attributes[$attr_name], array_slice($path_parts, 1), $transformed);
            }
        }

        return $attributes;
    }

    /**
     * Read a value from a post by its source-prefixed dotted key.
     * Keys follow the convention set by get_page_content():
     *   core.<wp_field>           — post object field
     *   acf.<field>[.<sub>…]      — ACF field (requires get_fields())
     *   meta.<meta_key>           — raw post meta
     *   blocks.<idx>.<attr_key>   — Gutenberg block attribute
     *
     * @param int    $post_id
     * @param string $dotted_key
     * @return mixed|null
     */
    private static function resolve_source_value($post_id, $dotted_key) {
        $parts  = explode('.', $dotted_key, 2);
        $source = $parts[0];
        $rest   = isset($parts[1]) ? $parts[1] : '';

        $post = get_post($post_id);
        if (!$post) return null;

        switch ($source) {
            case 'core': {
                $thumbnail_id = get_post_thumbnail_id($post_id);
                $core = [
                    'post_title'     => $post->post_title,
                    'post_content'   => $post->post_content,
                    'post_excerpt'   => $post->post_excerpt,
                    'post_date'      => $post->post_date,
                    'post_author'    => get_the_author_meta('display_name', $post->post_author),
                    'permalink'      => get_permalink($post_id),
                    'featured_image' => $thumbnail_id
                        ? wp_get_attachment_image_url($thumbnail_id, 'large')
                        : null,
                ];
                return self::dot_get($core, $rest);
            }

            case 'acf': {
                if (!function_exists('get_fields')) return null;
                $acf = get_fields($post_id);
                return is_array($acf) ? self::dot_get($acf, $rest) : null;
            }

            case 'meta': {
                $sub_parts = explode('.', $rest, 2);
                $meta_key  = $sub_parts[0];
                $value     = get_post_meta($post_id, $meta_key, true);
                if (isset($sub_parts[1]) && is_array($value)) {
                    return self::dot_get($value, $sub_parts[1]);
                }
                return $value;
            }

            case 'blocks': {
                $blocks = parse_blocks($post->post_content);
                $sub    = explode('.', $rest, 2);
                $idx    = (int) $sub[0];
                $attr   = isset($sub[1]) ? $sub[1] : '';
                if (!isset($blocks[$idx])) return null;
                if ($attr === 'blockName') return $blocks[$idx]['blockName'];
                return $attr ? self::dot_get($blocks[$idx]['attrs'], $attr) : $blocks[$idx]['attrs'];
            }
        }

        return null;
    }

    /**
     * Navigate a nested array using a dot-notation path.
     */
    private static function dot_get($data, $path) {
        if ($path === '' || $path === null) return $data;
        $keys = explode('.', $path);
        foreach ($keys as $key) {
            if (is_array($data) && array_key_exists($key, $data)) {
                $data = $data[$key];
            } elseif (is_object($data) && property_exists($data, $key)) {
                $data = $data->{$key};
            } else {
                return null;
            }
        }
        return $data;
    }

    /**
     * Walk the schema tree to find the Handoff type at a dot-notation path.
     */
    private static function resolve_target_type($path, $schema_props) {
        $parts   = explode('.', $path);
        $current = $schema_props;

        foreach ($parts as $part) {
            if (!isset($current[$part])) return 'text';
            $node = $current[$part];

            if (isset($node['properties'])) {
                $current = $node['properties'];
            } elseif (isset($node['items']['properties'])) {
                $current = $node['items']['properties'];
            } else {
                return isset($node['type']) ? $node['type'] : 'text';
            }
        }

        return 'text';
    }

    private static function set_nested(&$arr, $keys, $value) {
        foreach ($keys as $i => $key) {
            if ($i === count($keys) - 1) {
                $arr[$key] = $value;
            } else {
                if (!isset($arr[$key]) || !is_array($arr[$key])) {
                    $arr[$key] = [];
                }
                $arr = &$arr[$key];
            }
        }
    }

    /* ------------------------------------------------------------------
     * Migration executor
     * ----------------------------------------------------------------*/

    /**
     * Migrate a page's content to Handoff Gutenberg blocks using a saved page mapping.
     *
     * A page mapping (new format) contains:
     *   - label:      display name
     *   - metaCopy:   array of post field keys to copy verbatim (post_title, post_excerpt,
     *                 post_name, featured_image, _wp_page_template)
     *   - blocks:     ordered array of { id, label, targetBlock, fieldMappings }
     *
     * If $mapping_name is provided only that mapping is applied; otherwise the first
     * mapping found is used.
     *
     * @param int         $post_id
     * @param string      $mode          'draft' | 'in-place'
     * @param string|null $mapping_name  Specific mapping key; null = use first available.
     * @return array { success, message, postId?, editUrl?, migrated, skipped }
     */
    public static function migrate_page($post_id, $mode = 'draft', $mapping_name = null) {
        $post = get_post($post_id);
        if (!$post) {
            return ['success' => false, 'message' => 'Post not found.'];
        }

        $all_mappings = self::get_mappings();
        $schemas      = self::get_schemas();

        // Select the mapping to apply
        if ($mapping_name !== null) {
            if (!isset($all_mappings[$mapping_name])) {
                return ['success' => false, 'message' => "Mapping '{$mapping_name}' not found."];
            }
            $mapping = $all_mappings[$mapping_name];
        } else {
            if (empty($all_mappings)) {
                return ['success' => false, 'message' => 'No mappings saved. Create a page mapping first.'];
            }
            $mapping = reset($all_mappings);
        }

        // ── Build block list ──────────────────────────────────────────
        $block_defs  = isset($mapping['blocks']) ? $mapping['blocks'] : [];
        $new_blocks  = [];
        $migrated    = 0;
        $skipped     = 0;

        foreach ($block_defs as $block_def) {
            $target_block = isset($block_def['targetBlock']) ? $block_def['targetBlock'] : '';
            $field_map    = isset($block_def['fieldMappings']) ? $block_def['fieldMappings'] : [];

            if (empty($target_block) || !isset($schemas[$target_block])) {
                $skipped++;
                continue;
            }

            $schema_props = $schemas[$target_block]['properties'];

            // Resolve each source field value from the live post
            $source_data = [];
            foreach ($field_map as $source_key => $handoff_path) {
                $source_data[$source_key] = self::resolve_source_value($post_id, $source_key);
            }

            $attributes = self::apply_mapping($source_data, $field_map, $schema_props);

            $new_blocks[] = [
                'blockName'    => $target_block,
                'attrs'        => $attributes,
                'innerBlocks'  => [],
                'innerHTML'    => '',
                'innerContent' => [],
            ];
            $migrated++;
        }

        if ($migrated === 0 && empty($block_defs)) {
            return [
                'success' => false,
                'message' => 'This mapping has no blocks defined. Add at least one block recipe.',
            ];
        }

        $new_content = serialize_blocks($new_blocks);
        $meta_copy   = isset($mapping['metaCopy']) && is_array($mapping['metaCopy'])
            ? $mapping['metaCopy']
            : [];

        // ── Build wp_insert_post / wp_update_post args ─────────────────
        $post_args = [
            'post_content' => $new_content,
            'post_status'  => 'draft',
            'post_type'    => $post->post_type,
            'post_author'  => get_current_user_id(),
        ];

        // Apply scalar meta-copy fields to the post args
        if (in_array('post_title', $meta_copy, true)) {
            $post_args['post_title'] = $post->post_title;
        } else {
            $post_args['post_title'] = $post->post_title . ' (Migrated)';
        }

        if (in_array('post_excerpt', $meta_copy, true)) {
            $post_args['post_excerpt'] = $post->post_excerpt;
        }

        if (in_array('post_name', $meta_copy, true)) {
            // Append -migrated to avoid slug collision in draft mode
            $post_args['post_name'] = $post->post_name . ($mode === 'draft' ? '-migrated' : '');
        }

        // ── Execute ────────────────────────────────────────────────────
        if ($mode === 'in-place') {
            $update_args = array_merge(
                ['ID' => $post_id],
                array_intersect_key($post_args, array_flip(['post_content', 'post_title', 'post_excerpt']))
            );
            wp_update_post($update_args);
            $target_id = $post_id;
        } else {
            $new_post_id = wp_insert_post($post_args);
            if (is_wp_error($new_post_id)) {
                return ['success' => false, 'message' => $new_post_id->get_error_message()];
            }
            $target_id = $new_post_id;
        }

        // ── Apply post-save meta ───────────────────────────────────────
        if (in_array('featured_image', $meta_copy, true)) {
            $thumb_id = get_post_thumbnail_id($post_id);
            if ($thumb_id) {
                set_post_thumbnail($target_id, $thumb_id);
            }
        }

        if (in_array('_wp_page_template', $meta_copy, true)) {
            $tpl = get_post_meta($post_id, '_wp_page_template', true);
            if ($tpl) {
                update_post_meta($target_id, '_wp_page_template', $tpl);
            }
        }

        $block_label  = $migrated === 1 ? 'block' : 'blocks';
        $skipped_note = $skipped > 0 ? " ({$skipped} skipped — no matching schema)" : '';

        return [
            'success'  => true,
            'message'  => sprintf('Created %d Handoff %s%s.', $migrated, $block_label, $skipped_note),
            'postId'   => $target_id,
            'editUrl'  => get_edit_post_link($target_id, 'raw'),
            'migrated' => $migrated,
            'skipped'  => $skipped,
        ];
    }
}
