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

    // GET /pages — list pages that contain ACF blocks
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

    // GET /pages/<id>/blocks — parse a single page for ACF blocks
    register_rest_route($ns, '/pages/(?P<id>\d+)/blocks', [
        'methods'             => 'GET',
        'callback'            => 'handoff_migration_get_page_blocks',
        'permission_callback' => 'handoff_migration_permission',
        'args'                => [
            'id' => ['validate_callback' => function ($v) { return is_numeric($v); }],
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

    // POST /migrate — execute migration for a page
    register_rest_route($ns, '/migrate', [
        'methods'             => 'POST',
        'callback'            => 'handoff_migration_migrate',
        'permission_callback' => 'handoff_migration_permission',
    ]);
}

/**
 * Only editors and admins can use the migration tool.
 */
function handoff_migration_permission() {
    return current_user_can('edit_others_posts');
}

/* ------------------------------------------------------------------
 * Callbacks
 * ----------------------------------------------------------------*/

function handoff_migration_get_schemas() {
    return rest_ensure_response(Handoff_Migration::get_schemas());
}

function handoff_migration_get_pages(WP_REST_Request $request) {
    $result = Handoff_Migration::get_pages_with_acf_blocks(
        $request->get_param('post_type'),
        $request->get_param('per_page'),
        $request->get_param('page')
    );
    return rest_ensure_response($result);
}

function handoff_migration_get_page_blocks(WP_REST_Request $request) {
    $blocks = Handoff_Migration::parse_page_blocks((int) $request['id']);
    return rest_ensure_response($blocks);
}

function handoff_migration_get_mappings() {
    return rest_ensure_response(Handoff_Migration::get_mappings());
}

function handoff_migration_save_mapping(WP_REST_Request $request) {
    $body = $request->get_json_params();

    if (empty($body['acfBlock']) || empty($body['targetBlock'])) {
        return new WP_Error('missing_fields', 'acfBlock and targetBlock are required.', ['status' => 400]);
    }

    $mapping = [
        'targetBlock'   => sanitize_text_field($body['targetBlock']),
        'fieldMappings' => isset($body['fieldMappings']) ? $body['fieldMappings'] : [],
    ];

    Handoff_Migration::save_mapping(sanitize_text_field($body['acfBlock']), $mapping);

    return rest_ensure_response(['success' => true]);
}

function handoff_migration_delete_mapping(WP_REST_Request $request) {
    $acf_block = urldecode($request['acfBlock']);
    Handoff_Migration::delete_mapping($acf_block);
    return rest_ensure_response(['success' => true]);
}

function handoff_migration_migrate(WP_REST_Request $request) {
    $body    = $request->get_json_params();
    $post_id = isset($body['postId']) ? intval($body['postId']) : 0;
    $mode    = isset($body['mode'])   ? $body['mode']           : 'draft';

    if (!$post_id) {
        return new WP_Error('missing_post', 'postId is required.', ['status' => 400]);
    }

    if (!in_array($mode, ['draft', 'in-place'], true)) {
        return new WP_Error('invalid_mode', 'mode must be "draft" or "in-place".', ['status' => 400]);
    }

    $result = Handoff_Migration::migrate_page($post_id, $mode);

    if (empty($result['success'])) {
        return new WP_Error('migration_failed', $result['message'], ['status' => 500]);
    }

    return rest_ensure_response($result);
}
