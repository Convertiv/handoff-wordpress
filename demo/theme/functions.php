<?php
/**
 * Handoff Theme Functions
 *
 * @package Handoff
 * @since 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Theme Setup
 */
function handoff_theme_setup() {
    // Add default posts and comments RSS feed links to head
    add_theme_support('automatic-feed-links');

    // Let WordPress manage the document title
    add_theme_support('title-tag');

    // Enable support for Post Thumbnails
    add_theme_support('post-thumbnails');

    // Switch default core markup to output valid HTML5
    add_theme_support('html5', array(
        'search-form',
        'comment-form',
        'comment-list',
        'gallery',
        'caption',
        'style',
        'script',
    ));

    // Add support for core custom logo
    add_theme_support('custom-logo', array(
        'height'      => 250,
        'width'       => 250,
        'flex-width'  => true,
        'flex-height' => true,
    ));

    // Add support for full and wide align images
    add_theme_support('align-wide');

    // Add support for responsive embedded content
    add_theme_support('responsive-embeds');

    // Add support for editor styles
    add_theme_support('editor-styles');
    
    // Enqueue editor styles - this properly scopes CSS to the editor content area
    // Load style.css first for block alignment, then main.css for component styles
    add_editor_style('style.css');
    add_editor_style('assets/css/main.css');

    // Add support for custom line height
    add_theme_support('custom-line-height');

    // Add support for custom spacing
    add_theme_support('custom-spacing');

    // Register navigation menus
    register_nav_menus(array(
        'primary' => __('Primary Menu', 'handoff'),
        'footer'  => __('Footer Menu', 'handoff'),
    ));
}
add_action('after_setup_theme', 'handoff_theme_setup');

/**
 * Enqueue scripts and styles
 */
function handoff_enqueue_scripts() {
    // Enqueue theme style.css (contains WordPress block alignment styles)
    wp_enqueue_style(
        'handoff-style',
        get_stylesheet_uri(),
        array(),
        '1.0.0'
    );
    
    // Enqueue main styles from Handoff
    wp_enqueue_style(
        'handoff-main',
        get_template_directory_uri() . '/assets/css/main.css',
        array('handoff-style'),
        '1.0.0'
    );

    // Enqueue main JavaScript from Handoff
    wp_enqueue_script(
        'handoff-main',
        get_template_directory_uri() . '/assets/js/main.js',
        array('jquery'),
        '1.0.0',
        true
    );

    // Enqueue comment reply script if needed
    if (is_singular() && comments_open() && get_option('thread_comments')) {
        wp_enqueue_script('comment-reply');
    }
}
add_action('wp_enqueue_scripts', 'handoff_enqueue_scripts');

/**
 * Enqueue block editor assets (styles and scripts)
 * 
 * This ensures the editor preview looks like the frontend.
 * Note: add_editor_style() in theme setup handles the primary CSS scoping,
 * but we also enqueue here for any CSS that needs to affect the editor UI.
 */
function handoff_block_editor_assets() {
    // Enqueue additional editor-specific styles if needed
    // This supplements add_editor_style() for styles that should affect editor UI
    wp_enqueue_style(
        'handoff-block-editor',
        get_template_directory_uri() . '/assets/css/main.css',
        array(),
        '1.0.0'
    );
    
    // Note: main.js includes bundled jQuery which may conflict with WordPress's jQuery.
    // Only enqueue if interactive components (sliders, etc.) need to work in editor previews.
    // For static block previews, CSS alone is usually sufficient.
    // 
    // Uncomment below if you need JS interactivity in editor:
    // wp_enqueue_script(
    //     'handoff-block-editor-js',
    //     get_template_directory_uri() . '/assets/js/main.js',
    //     array('wp-blocks', 'wp-dom-ready'),
    //     '1.0.0',
    //     true
    // );
}
add_action('enqueue_block_editor_assets', 'handoff_block_editor_assets');

/**
 * Register widget areas
 */
function handoff_widgets_init() {
    register_sidebar(array(
        'name'          => __('Primary Sidebar', 'handoff'),
        'id'            => 'sidebar-1',
        'description'   => __('Add widgets here to appear in your sidebar.', 'handoff'),
        'before_widget' => '<section id="%1$s" class="widget %2$s">',
        'after_widget'  => '</section>',
        'before_title'  => '<h2 class="widget-title">',
        'after_title'   => '</h2>',
    ));

    register_sidebar(array(
        'name'          => __('Footer', 'handoff'),
        'id'            => 'footer-1',
        'description'   => __('Add widgets here to appear in your footer.', 'handoff'),
        'before_widget' => '<section id="%1$s" class="widget %2$s">',
        'after_widget'  => '</section>',
        'before_title'  => '<h2 class="widget-title">',
        'after_title'   => '</h2>',
    ));
}
add_action('widgets_init', 'handoff_widgets_init');

/**
 * Add custom body classes
 */
function handoff_body_classes($classes) {
    // Add theme class
    $classes[] = 'theme';
    
    // Add class if we're viewing the front page
    if (is_front_page()) {
        $classes[] = 'front-page';
    }

    // Add class if sidebar is active
    if (is_active_sidebar('sidebar-1')) {
        $classes[] = 'has-sidebar';
    }

    return $classes;
}
add_filter('body_class', 'handoff_body_classes');

/**
 * Custom excerpt length
 */
function handoff_excerpt_length($length) {
    return 30;
}
add_filter('excerpt_length', 'handoff_excerpt_length');

/**
 * Custom excerpt more
 */
function handoff_excerpt_more($more) {
    if (!is_single()) {
        $more = sprintf(
            '<a class="read-more" href="%1$s">%2$s</a>',
            get_permalink(get_the_ID()),
            __('Read More', 'handoff')
        );
    }
    return $more;
}
add_filter('excerpt_more', 'handoff_excerpt_more');

/**
 * Add support for Gutenberg block templates
 */
function handoff_add_block_template_support() {
    // Enable block template support
    add_theme_support('block-templates');
    
    // Enable block template parts support
    add_theme_support('block-template-parts');
}
add_action('after_setup_theme', 'handoff_add_block_template_support');

/**
 * Customize the_content filter for better block support
 */
function handoff_content_width() {
    $GLOBALS['content_width'] = apply_filters('handoff_content_width', 1200);
}
add_action('after_setup_theme', 'handoff_content_width', 0);

/**
 * Add theme support for responsive videos
 */
function handoff_responsive_embed_wrapper($html, $url, $attr, $post_id) {
    return '<div class="responsive-embed">' . $html . '</div>';
}
add_filter('embed_oembed_html', 'handoff_responsive_embed_wrapper', 10, 4);
