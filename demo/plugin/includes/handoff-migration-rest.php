<?php
/**
 * REST API endpoints for ACF → Handoff block migration.
 *
 * Namespace: handoff/v1/migration
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', 'handoff_migration_register_routes');

function handoff_migration_register_routes() {
    $ns = 'handoff/v1/migration';

    // GET /schemas — list available Handoff block schemas
    register_rest_route($ns, '/schemas', [
        'methods'             => 'GET',
        'callback'            => 'handoff_migration_get_schemas',
        'permission_callback' => 'handoff_migration_permission',
    ]);

    // GET /pages — list all pages/posts (no content filter)
    register_rest_route($ns, '/pages', [
        'methods'             => 'GET',
        'callback'            => 'handoff_migration_get_pages',
        'permission_callback' => 'handoff_migration_permission',
        'args'                => [
            'post_type' => ['type' => 'string', 'default' => 'any'],
            'per_page'  => ['type' => 'integer', 'default' => 50],
            'page'      => ['type' => 'integer', 'default' => 1],
        ],
    ]);

    // GET /pages/<id>/content — all inspectable content sources for a single page
    register_rest_route($ns, '/pages/(?P<id>\d+)/content', [
        'methods'             => 'GET',
        'callback'            => 'handoff_migration_get_page_content',
        'permission_callback' => 'handoff_migration_permission',
        'args'                => [
            'id' => ['validate_callback' => fn($v) => is_numeric($v)],
        ],
    ]);

    // GET /mappings — list saved mapping templates
    register_rest_route($ns, '/mappings', [
        'methods'             => 'GET',
        'callback'            => 'handoff_migration_get_mappings',
        'permission_callback' => 'handoff_migration_permission',
    ]);

    // POST /mappings — save or update a mapping template
    register_rest_route($ns, '/mappings', [
        'methods'             => 'POST',
        'callback'            => 'handoff_migration_save_mapping',
        'permission_callback' => 'handoff_migration_permission',
    ]);

    // DELETE /mappings/<acfBlock> — delete a mapping template
    register_rest_route($ns, '/mappings/(?P<acfBlock>.+)', [
        'methods'             => 'DELETE',
        'callback'            => 'handoff_migration_delete_mapping',
        'permission_callback' => 'handoff_migration_permission',
        'args'                => [
            'acfBlock' => ['type' => 'string'],
        ],
    ]);

    // GET /debug — diagnostic info to help troubleshoot page discovery
    register_rest_route($ns, '/debug', [
        'methods'             => 'GET',
        'callback'            => 'handoff_migration_debug',
        'permission_callback' => 'handoff_migration_permission',
        'args'                => [
            'limit' => ['type' => 'integer', 'default' => 10],
        ],
    ]);

    // POST /migrate — execute migration for a page
    register_rest_route($ns, '/migrate', [
        'methods'             => 'POST',
        'callback'            => 'handoff_migration_migrate',
        'permission_callback' => 'handoff_migration_permission',
    ]);
}

/**
 * Only editors and admins can use the migration tool.
 * In development environments unauthenticated requests are allowed through
 * so the endpoints can be tested with Postman or similar tools.
 */
function handoff_migration_permission() {
    if (handoff_is_dev_env()) {
        return true;
    }
    return current_user_can('edit_others_posts');
}

/* ------------------------------------------------------------------
 * Callbacks
 * ----------------------------------------------------------------*/

function handoff_migration_get_schemas() {
    return rest_ensure_response(Handoff_Migration::get_schemas());
}

function handoff_migration_get_pages(WP_REST_Request $request) {
    $result = Handoff_Migration::get_all_pages(
        $request->get_param('post_type'),
        $request->get_param('per_page'),
        $request->get_param('page')
    );
    return rest_ensure_response($result);
}

function handoff_migration_get_page_content(WP_REST_Request $request) {
    $content = Handoff_Migration::get_page_content((int) $request['id']);
    if ($content === null) {
        return new WP_Error('not_found', 'Post not found.', ['status' => 404]);
    }
    return rest_ensure_response($content);
}

function handoff_migration_get_mappings() {
    return rest_ensure_response(Handoff_Migration::get_mappings());
}

function handoff_migration_save_mapping(WP_REST_Request $request) {
    $body = $request->get_json_params();

    if (empty($body['name'])) {
        return new WP_Error('missing_fields', 'name is required.', ['status' => 400]);
    }

    if (empty($body['blocks']) || !is_array($body['blocks'])) {
        return new WP_Error('missing_fields', 'blocks array is required.', ['status' => 400]);
    }

    // Sanitize each block definition
    $blocks = [];
    foreach ($body['blocks'] as $block) {
        if (empty($block['targetBlock'])) continue;
        $blocks[] = [
            'id'            => isset($block['id'])    ? sanitize_text_field($block['id'])    : uniqid('block_'),
            'label'         => isset($block['label']) ? sanitize_text_field($block['label']) : '',
            'targetBlock'   => sanitize_text_field($block['targetBlock']),
            'fieldMappings' => isset($block['fieldMappings']) && is_array($block['fieldMappings'])
                ? $block['fieldMappings']
                : [],
        ];
    }

    $allowed_meta = ['post_title', 'post_excerpt', 'post_name', 'featured_image', '_wp_page_template'];
    $meta_copy    = isset($body['metaCopy']) && is_array($body['metaCopy'])
        ? array_values(array_intersect($body['metaCopy'], $allowed_meta))
        : [];

    $mapping = [
        'label'    => sanitize_text_field($body['label'] ?? $body['name']),
        'metaCopy' => $meta_copy,
        'blocks'   => $blocks,
    ];

    Handoff_Migration::save_mapping(sanitize_text_field($body['name']), $mapping);

    return rest_ensure_response(['success' => true]);
}

function handoff_migration_delete_mapping(WP_REST_Request $request) {
    $acf_block = urldecode($request['acfBlock']);
    Handoff_Migration::delete_mapping($acf_block);
    return rest_ensure_response(['success' => true]);
}

function handoff_migration_migrate(WP_REST_Request $request) {
    $body         = $request->get_json_params();
    $post_id      = isset($body['postId'])      ? intval($body['postId'])                    : 0;
    $mode         = isset($body['mode'])        ? $body['mode']                              : 'draft';
    $mapping_name = isset($body['mappingName']) ? sanitize_text_field($body['mappingName'])  : null;

    if (!$post_id) {
        return new WP_Error('missing_post', 'postId is required.', ['status' => 400]);
    }

    if (!in_array($mode, ['draft', 'in-place'], true)) {
        return new WP_Error('invalid_mode', 'mode must be "draft" or "in-place".', ['status' => 400]);
    }

    $result = Handoff_Migration::migrate_page($post_id, $mode, $mapping_name);

    if (empty($result['success'])) {
        return new WP_Error('migration_failed', $result['message'], ['status' => 500]);
    }

    return rest_ensure_response($result);
}

/**
 * Debug endpoint: inspects a sample of posts to show why pages are or aren't detected.
 * GET /wp-json/handoff/v1/migration/debug?limit=10
 */
function handoff_migration_debug(WP_REST_Request $request) {
    $limit = max(1, min((int) $request->get_param('limit'), 50));

    $acf_meta_keys = Handoff_Migration::get_acf_content_meta_keys();

    $query = new WP_Query([
        'post_type'      => ['page', 'post'],
        'post_status'    => ['publish', 'draft', 'private'],
        'posts_per_page' => $limit,
        'orderby'        => 'date',
        'order'          => 'DESC',
    ]);

    $posts_info = [];
    foreach ($query->posts as $post) {
        $content_snippet  = substr($post->post_content, 0, 300);
        $has_acf_in_content = strpos($post->post_content, 'wp:acf/') !== false;
        $parsed_blocks    = parse_blocks($post->post_content);
        $block_names      = array_filter(array_column($parsed_blocks, 'blockName'));
        $acf_block_names  = array_values(array_filter($block_names, function ($n) {
            return strpos($n, 'acf/') === 0;
        }));

        $meta_values = [];
        foreach ($acf_meta_keys as $key) {
            $val = get_post_meta($post->ID, $key, true);
            $meta_values[$key] = [
                'exists'    => metadata_exists('post', $post->ID, $key),
                'non_empty' => ($val !== '' && $val !== false && $val !== [] && $val !== null),
                'type'      => gettype($val),
                'preview'   => is_string($val) ? substr($val, 0, 100) : wp_json_encode($val),
            ];
        }

        $posts_info[] = [
            'id'                  => $post->ID,
            'title'               => $post->post_title,
            'postType'            => $post->post_type,
            'status'              => $post->post_status,
            'contentLength'       => strlen($post->post_content),
            'contentSnippet'      => $content_snippet,
            'hasWpAcfInContent'   => $has_acf_in_content,
            'parsedBlockCount'    => count($parsed_blocks),
            'allBlockNames'       => array_values(array_unique($block_names)),
            'acfBlockNames'       => $acf_block_names,
            'checkedMetaKeys'     => $meta_values,
            'wouldBeIncluded'     => $has_acf_in_content || !empty($acf_block_names) || !empty(array_filter($meta_values, fn($v) => $v['non_empty'])),
        ];
    }

    return rest_ensure_response([
        'totalPostsInDb'   => (int) $query->found_posts,
        'sampleSize'       => count($posts_info),
        'checkedMetaKeys'  => $acf_meta_keys,
        'posts'            => $posts_info,
    ]);
}
