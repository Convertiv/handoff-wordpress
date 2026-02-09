<?php

/**
 * Handoff REST API Endpoints
 * 
 * Provides REST API endpoints for block editor functionality:
 * - Post type listing for PostSelector
 * - Field discovery for field mapping
 * - Block preview rendering
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register Handoff REST API routes.
 */
add_action('rest_api_init', 'handoff_register_rest_routes');

function handoff_register_rest_routes()
{
    $namespace = 'handoff/v1';

    // Get available post types
    register_rest_route($namespace, '/post-types', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'handoff_rest_get_post_types',
        'permission_callback' => 'handoff_rest_permission_check',
    ));

    // Get available fields for a post type
    register_rest_route($namespace, '/fields/(?P<post_type>[a-z0-9_-]+)', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'handoff_rest_get_fields',
        'permission_callback' => 'handoff_rest_permission_check',
        'args'                => array(
            'post_type' => array(
                'required'          => true,
                'validate_callback' => function ($param) {
                    return post_type_exists($param);
                },
            ),
        ),
    ));

    // Get taxonomies for a post type
    register_rest_route($namespace, '/taxonomies/(?P<post_type>[a-z0-9_-]+)', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'handoff_rest_get_taxonomies',
        'permission_callback' => 'handoff_rest_permission_check',
        'args'                => array(
            'post_type' => array(
                'required'          => true,
                'validate_callback' => function ($param) {
                    return post_type_exists($param);
                },
            ),
        ),
    ));
}

/**
 * Permission check for Handoff REST endpoints.
 *
 * @return bool|WP_Error True if user can edit posts, error otherwise.
 */
function handoff_rest_permission_check()
{
    if (!current_user_can('edit_posts')) {
        return new WP_Error(
            'rest_forbidden',
            __('You do not have permission to access this endpoint.', 'handoff'),
            array('status' => 403)
        );
    }
    return true;
}

/**
 * Get available post types for the block editor.
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response Post types data.
 */
function handoff_rest_get_post_types($request)
{
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
            'singular'  => $type->labels->singular_name,
            'rest_base' => $type->rest_base ?: $type->name,
            'icon'      => $type->menu_icon ?: 'dashicons-admin-post',
        );
    }

    return rest_ensure_response($result);
}

/**
 * Get available fields for a post type.
 * Returns core fields and registered meta fields (no ACF dependency).
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response Fields data.
 */
function handoff_rest_get_fields($request)
{
    $post_type = $request->get_param('post_type');

    $fields = array();

    // Core post fields
    $core_fields = array(
        array(
            'key'   => 'post_title',
            'label' => __('Title', 'handoff'),
            'type'  => 'text',
            'group' => 'core',
        ),
        array(
            'key'   => 'post_content',
            'label' => __('Content', 'handoff'),
            'type'  => 'richtext',
            'group' => 'core',
        ),
        array(
            'key'   => 'post_excerpt',
            'label' => __('Excerpt', 'handoff'),
            'type'  => 'text',
            'group' => 'core',
        ),
        array(
            'key'   => 'post_date',
            'label' => __('Date', 'handoff'),
            'type'  => 'date',
            'group' => 'core',
        ),
        array(
            'key'   => 'permalink',
            'label' => __('Permalink', 'handoff'),
            'type'  => 'url',
            'group' => 'core',
        ),
        array(
            'key'   => 'featured_image',
            'label' => __('Featured Image', 'handoff'),
            'type'  => 'image',
            'group' => 'core',
        ),
    );

    $fields = array_merge($fields, $core_fields);

    // Author fields
    $author_fields = array(
        array(
            'key'   => 'author.name',
            'label' => __('Author Name', 'handoff'),
            'type'  => 'text',
            'group' => 'author',
        ),
        array(
            'key'   => 'author.url',
            'label' => __('Author URL', 'handoff'),
            'type'  => 'url',
            'group' => 'author',
        ),
        array(
            'key'   => 'author.avatar',
            'label' => __('Author Avatar', 'handoff'),
            'type'  => 'image',
            'group' => 'author',
        ),
        array(
            'key'   => 'author.bio',
            'label' => __('Author Bio', 'handoff'),
            'type'  => 'text',
            'group' => 'author',
        ),
    );

    $fields = array_merge($fields, $author_fields);

    // Get registered post meta fields
    $meta_keys = get_registered_meta_keys('post', $post_type);
    foreach ($meta_keys as $key => $args) {
        // Skip internal/private keys
        if (strpos($key, '_') === 0) {
            continue;
        }

        $fields[] = array(
            'key'   => 'meta:' . $key,
            'label' => isset($args['description']) ? $args['description'] : ucwords(str_replace('_', ' ', $key)),
            'type'  => isset($args['type']) ? $args['type'] : 'text',
            'group' => 'meta',
        );
    }

    // Get taxonomies for this post type
    $taxonomies = get_object_taxonomies($post_type, 'objects');
    foreach ($taxonomies as $taxonomy) {
        if (!$taxonomy->public) {
            continue;
        }

        $fields[] = array(
            'key'   => 'taxonomy:' . $taxonomy->name,
            'label' => $taxonomy->label,
            'type'  => 'taxonomy',
            'group' => 'taxonomy',
        );
    }

    /**
     * Filter the available fields for a post type.
     *
     * @param array  $fields    Available fields.
     * @param string $post_type Post type name.
     */
    $fields = apply_filters('handoff_available_fields', $fields, $post_type);

    return rest_ensure_response($fields);
}

/**
 * Get taxonomies for a post type.
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response Taxonomies data.
 */
function handoff_rest_get_taxonomies($request)
{
    $post_type = $request->get_param('post_type');

    $taxonomies = get_object_taxonomies($post_type, 'objects');

    $result = array();
    foreach ($taxonomies as $taxonomy) {
        if (!$taxonomy->public || !$taxonomy->show_in_rest) {
            continue;
        }

        $result[] = array(
            'name'       => $taxonomy->name,
            'label'      => $taxonomy->label,
            'singular'   => $taxonomy->labels->singular_name,
            'rest_base'  => $taxonomy->rest_base ?: $taxonomy->name,
            'hierarchical' => $taxonomy->hierarchical,
        );
    }

    return rest_ensure_response($result);
}
