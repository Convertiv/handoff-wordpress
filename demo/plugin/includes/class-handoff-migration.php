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
     * ACF block parser
     * ----------------------------------------------------------------*/

    /**
     * Parse a post's content and return the ACF blocks it contains.
     *
     * Each entry includes:
     *   - blockName  (e.g. "acf/testimonial")
     *   - index      (position in the page)
     *   - data       (ACF field data, internal _keys stripped)
     *   - raw        (original parsed block array)
     *
     * @param int $post_id
     * @return array
     */
    public static function parse_page_blocks($post_id) {
        $post = get_post($post_id);
        if (!$post) return [];

        $blocks  = parse_blocks($post->post_content);
        $results = [];
        $idx     = 0;

        foreach ($blocks as $block) {
            if (empty($block['blockName'])) continue;

            if (strpos($block['blockName'], 'acf/') === 0) {
                $data = isset($block['attrs']['data']) ? $block['attrs']['data'] : [];

                // Strip ACF internal keys (prefixed with "_")
                $clean = [];
                foreach ($data as $key => $value) {
                    if (strpos($key, '_') !== 0) {
                        $clean[$key] = $value;
                    }
                }

                $results[] = [
                    'blockName' => $block['blockName'],
                    'index'     => $idx,
                    'data'      => $clean,
                    'raw'       => $block,
                ];
            }

            $idx++;
        }

        return $results;
    }

    /**
     * List pages/posts that contain at least one ACF block.
     *
     * @param string $post_type  Defaults to 'page'.
     * @param int    $per_page   Defaults to 50.
     * @param int    $page_num   Defaults to 1.
     * @return array
     */
    public static function get_pages_with_acf_blocks($post_type = 'any', $per_page = 50, $page_num = 1) {
        $args = [
            'post_type'      => $post_type === 'any' ? ['page', 'post'] : $post_type,
            'post_status'    => ['publish', 'draft', 'private'],
            'posts_per_page' => $per_page,
            'paged'          => $page_num,
            's'              => 'wp:acf/',
        ];

        $query   = new WP_Query($args);
        $results = [];

        foreach ($query->posts as $post) {
            $acf_blocks = self::parse_page_blocks($post->ID);
            if (empty($acf_blocks)) continue;

            // Count unique ACF block types
            $types = array_unique(array_column($acf_blocks, 'blockName'));

            $results[] = [
                'id'            => $post->ID,
                'title'         => $post->post_title,
                'postType'      => $post->post_type,
                'status'        => $post->post_status,
                'editUrl'       => get_edit_post_link($post->ID, 'raw'),
                'acfBlockCount' => count($acf_blocks),
                'acfBlockTypes' => array_values($types),
            ];
        }

        return [
            'pages'      => $results,
            'total'      => (int) $query->found_posts,
            'totalPages' => (int) $query->max_num_pages,
        ];
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
     * Apply a complete field mapping to an ACF data array,
     * producing the Handoff block attributes object.
     *
     * @param array  $acf_data        Raw ACF field data (cleaned).
     * @param array  $field_mappings   ACF key → Handoff dot-path map.
     * @param array  $schema_props     The "properties" section of the migration schema for the target block.
     * @return array  Gutenberg-ready attributes keyed by camelCase names.
     */
    public static function apply_mapping($acf_data, $field_mappings, $schema_props) {
        $attributes = [];

        foreach ($field_mappings as $acf_key => $handoff_path) {
            $acf_value = isset($acf_data[$acf_key]) ? $acf_data[$acf_key] : null;
            if ($acf_value === null) continue;

            // Resolve the target type from the migration schema
            $target_type = self::resolve_target_type($handoff_path, $schema_props);
            $transformed = self::transform_field($acf_value, $target_type);

            // Resolve the attributeName for the top-level key
            $path_parts = explode('.', $handoff_path);
            $top_key    = $path_parts[0];

            $attr_name = $top_key;
            if (isset($schema_props[$top_key]['attributeName'])) {
                $attr_name = $schema_props[$top_key]['attributeName'];
            }

            if (count($path_parts) === 1) {
                $attributes[$attr_name] = $transformed;
            } else {
                // Nested path: merge into existing object
                if (!isset($attributes[$attr_name]) || !is_array($attributes[$attr_name])) {
                    $attributes[$attr_name] = [];
                }
                self::set_nested($attributes[$attr_name], array_slice($path_parts, 1), $transformed);
            }
        }

        return $attributes;
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
     * Migrate a page's ACF blocks to Handoff blocks.
     *
     * @param int    $post_id
     * @param string $mode  'draft' | 'in-place'
     * @return array { success, message, postId?, editUrl? }
     */
    public static function migrate_page($post_id, $mode = 'draft') {
        $post = get_post($post_id);
        if (!$post) {
            return ['success' => false, 'message' => 'Post not found.'];
        }

        $mappings     = self::get_mappings();
        $schemas      = self::get_schemas();
        $blocks       = parse_blocks($post->post_content);
        $new_blocks   = [];
        $migrated     = 0;
        $skipped      = 0;

        foreach ($blocks as $block) {
            $name = isset($block['blockName']) ? $block['blockName'] : '';

            // Not an ACF block — keep as-is
            if (strpos($name, 'acf/') !== 0) {
                $new_blocks[] = $block;
                continue;
            }

            // No mapping for this ACF block type — keep as-is
            if (!isset($mappings[$name])) {
                $new_blocks[] = $block;
                $skipped++;
                continue;
            }

            $mapping       = $mappings[$name];
            $target_block  = $mapping['targetBlock'];
            $field_map     = isset($mapping['fieldMappings']) ? $mapping['fieldMappings'] : [];

            if (!isset($schemas[$target_block])) {
                $new_blocks[] = $block;
                $skipped++;
                continue;
            }

            $schema_props = $schemas[$target_block]['properties'];
            $acf_data     = isset($block['attrs']['data']) ? $block['attrs']['data'] : [];

            // Strip ACF internal keys
            $clean = [];
            foreach ($acf_data as $k => $v) {
                if (strpos($k, '_') !== 0) {
                    $clean[$k] = $v;
                }
            }

            $attributes = self::apply_mapping($clean, $field_map, $schema_props);

            $new_blocks[] = [
                'blockName'    => $target_block,
                'attrs'        => $attributes,
                'innerBlocks'  => [],
                'innerHTML'    => '',
                'innerContent' => [],
            ];
            $migrated++;
        }

        $new_content = serialize_blocks($new_blocks);

        if ($mode === 'in-place') {
            wp_update_post([
                'ID'           => $post_id,
                'post_content' => $new_content,
            ]);

            return [
                'success'  => true,
                'message'  => sprintf('Migrated %d block(s), skipped %d.', $migrated, $skipped),
                'postId'   => $post_id,
                'editUrl'  => get_edit_post_link($post_id, 'raw'),
            ];
        }

        // Draft mode — create a copy
        $new_post_id = wp_insert_post([
            'post_title'   => $post->post_title . ' (Migrated)',
            'post_content' => $new_content,
            'post_status'  => 'draft',
            'post_type'    => $post->post_type,
            'post_author'  => get_current_user_id(),
        ]);

        if (is_wp_error($new_post_id)) {
            return ['success' => false, 'message' => $new_post_id->get_error_message()];
        }

        return [
            'success'  => true,
            'message'  => sprintf('Migrated %d block(s) into new draft (skipped %d).', $migrated, $skipped),
            'postId'   => $new_post_id,
            'editUrl'  => get_edit_post_link($new_post_id, 'raw'),
        ];
    }
}
