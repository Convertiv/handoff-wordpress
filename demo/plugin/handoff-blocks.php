<?php
/**
 * Plugin Name: Handoff Blocks
 * Plugin URI: https://handoff.com
 * Description: A collection of Gutenberg blocks built from the Handoff design system.
 * Version: 1.0.0
 * Author: Brad Mering
 * Author URI: https://www.handoff.com
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 */

if (!defined('ABSPATH')) {
  exit; // Exit if accessed directly
}

define('HANDOFF_BLOCKS_VERSION', '1.0.0');
define('HANDOFF_BLOCKS_PATH', plugin_dir_path(__FILE__));
define('HANDOFF_BLOCKS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HANDOFF_BLOCKS_URL', plugin_dir_url(__FILE__));

// Include the auto-generated categories file if it exists
if (file_exists(HANDOFF_BLOCKS_PATH . 'handoff-categories.php')) {
  require_once HANDOFF_BLOCKS_PATH . 'handoff-categories.php';
}

// Include the field resolver for dynamic array mapping
if (file_exists(HANDOFF_BLOCKS_PATH . 'includes/handoff-field-resolver.php')) {
  require_once HANDOFF_BLOCKS_PATH . 'includes/handoff-field-resolver.php';
}

// Include the REST API endpoints
if (file_exists(HANDOFF_BLOCKS_PATH . 'includes/handoff-rest-api.php')) {
  require_once HANDOFF_BLOCKS_PATH . 'includes/handoff-rest-api.php';
}

// Include migration tooling
if (file_exists(HANDOFF_BLOCKS_PATH . 'includes/class-handoff-migration.php')) {
  require_once HANDOFF_BLOCKS_PATH . 'includes/class-handoff-migration.php';
}
if (file_exists(HANDOFF_BLOCKS_PATH . 'includes/handoff-migration-rest.php')) {
  require_once HANDOFF_BLOCKS_PATH . 'includes/handoff-migration-rest.php';
}

/**
 * Register all Handoff blocks
 */
function handoff_blocks_register_blocks() {
  // Get all block directories
  $blocks_dir = HANDOFF_BLOCKS_PATH . 'build/';
  
  if (!is_dir($blocks_dir)) {
    return;
  }

  // Register each block
  $blocks = scandir($blocks_dir);
  foreach ($blocks as $block) {
    if ($block === '.' || $block === '..') {
      continue;
    }
    
    $block_path = $blocks_dir . $block;
    if (is_dir($block_path) && file_exists($block_path . '/block.json')) {
      register_block_type($block_path);
    }
  }
}
add_action('init', 'handoff_blocks_register_blocks');

/**
 * Register block categories
 * Uses the auto-generated categories from handoff-categories.php if available
 */
function handoff_blocks_block_category($categories, $post) {
  // Use auto-generated categories if available, otherwise fall back to default
  if (function_exists('handoff_get_block_categories')) {
    $handoff_categories = handoff_get_block_categories();
  } else {
    // Fallback to default category
    $handoff_categories = [
      [
        'slug'  => 'handoff',
        'title' => __('Handoff Blocks', 'handoff'),
        'icon'  => 'admin-customizer',
      ],
    ];
  }
  
  return array_merge($categories, $handoff_categories);
}
add_filter('block_categories_all', 'handoff_blocks_block_category', 10, 2);

/**
 * Load plugin textdomain
 */
function handoff_blocks_load_textdomain() {
  load_plugin_textdomain(
    'handoff',
    false,
    dirname(plugin_basename(__FILE__)) . '/languages'
  );
}
add_action('plugins_loaded', 'handoff_blocks_load_textdomain');


/**
 * Control which blocks are available in the editor
 * 
 * This disables all core Gutenberg blocks by default and only allows:
 * - All Handoff blocks (handoff/*)
 * - A curated list of essential core blocks
 * 
 * To add more core blocks, add them to the $allowed_core_blocks array.
 * To disable this filter entirely, set HANDOFF_ALLOW_ALL_BLOCKS to true.
 */
function handoff_blocks_allowed_block_types($allowed_block_types, $editor_context) {
  // Allow disabling this filter via constant
  if (defined('HANDOFF_ALLOW_ALL_BLOCKS') && HANDOFF_ALLOW_ALL_BLOCKS) {
    return $allowed_block_types;
  }

  // Essential core blocks that should remain available
  // Add or remove blocks from this list as needed
  $allowed_core_blocks = [
    // Text blocks
    'core/paragraph',
    'core/heading',
    'core/list',
    'core/list-item',
    'core/quote',
    'core/code',
    'core/preformatted',
    'core/pullquote',
    'core/verse',
    
    // Media blocks
    // 'core/image',
    // 'core/gallery',
    // 'core/audio',
    // 'core/video',
    // 'core/file',
    // 'core/media-text',
    
    // // Layout blocks
    // 'core/group',
    // 'core/columns',
    // 'core/column',
    // 'core/separator',
    // 'core/spacer',
    // 'core/buttons',
    // 'core/button',
    
    // // Widget blocks
    // 'core/shortcode',
    // 'core/html',
    
    // // Embed blocks
    // 'core/embed',
    
    // // Reusable blocks
    // 'core/block',
    // 'core/pattern',
  ];

  // Get all registered Handoff blocks
  $handoff_blocks = [];
  $registered_blocks = WP_Block_Type_Registry::get_instance()->get_all_registered();
  
  foreach ($registered_blocks as $block_name => $block_type) {
    if (strpos($block_name, 'handoff/') === 0) {
      $handoff_blocks[] = $block_name;
    }
  }

  // Combine allowed core blocks with all Handoff blocks
  $allowed_blocks = array_merge($allowed_core_blocks, $handoff_blocks);

  // Apply filter to allow themes/plugins to modify the list
  $allowed_blocks = apply_filters('handoff_allowed_blocks', $allowed_blocks, $editor_context);

  return $allowed_blocks;
}
add_filter('allowed_block_types_all', 'handoff_blocks_allowed_block_types', 10, 2);

/**
 * Remove unwanted block patterns from core
 * This cleans up the pattern inserter to focus on custom patterns
 */
function handoff_blocks_remove_core_patterns() {
  // Remove remote patterns from WordPress.org
  remove_theme_support('core-block-patterns');
}
add_action('after_setup_theme', 'handoff_blocks_remove_core_patterns');

/**
 * Optionally hide specific block categories
 * Uncomment and modify to hide entire categories from the inserter
 */
// function handoff_blocks_filter_categories($categories, $editor_context) {
//   // Remove categories you don't want
//   $hidden_categories = ['widgets', 'embed', 'theme'];
//   
//   return array_filter($categories, function($category) use ($hidden_categories) {
//     return !in_array($category['slug'], $hidden_categories);
//   });
// }
// add_filter('block_categories_all', 'handoff_blocks_filter_categories', 20, 2);

/**
 * Register the Handoff Migration admin page
 */
function handoff_blocks_migration_menu() {
  add_menu_page(
    __('Handoff Migration', 'handoff'),
    __('Handoff Migration', 'handoff'),
    'edit_others_posts',
    'handoff-migration',
    'handoff_blocks_migration_page',
    'dashicons-migrate',
    80
  );
}
add_action('admin_menu', 'handoff_blocks_migration_menu');

function handoff_blocks_migration_page() {
  echo '<div id="handoff-migration-root"></div>';
}

/**
 * Enqueue scripts and styles for the migration admin page
 */
function handoff_blocks_migration_assets($hook) {
  if ($hook !== 'toplevel_page_handoff-migration') {
    return;
  }

  $asset_file = HANDOFF_BLOCKS_PATH . 'build/migration/index.asset.php';

  if (file_exists($asset_file)) {
    $asset = require $asset_file;
  } else {
    $asset = [
      'dependencies' => ['wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n'],
      'version'      => HANDOFF_BLOCKS_VERSION,
    ];
  }

  wp_enqueue_script(
    'handoff-migration',
    HANDOFF_BLOCKS_URL . 'build/migration/index.js',
    $asset['dependencies'],
    $asset['version'],
    true
  );

  wp_enqueue_style(
    'handoff-migration',
    HANDOFF_BLOCKS_URL . 'build/migration/index.css',
    ['wp-components'],
    $asset['version']
  );

  wp_enqueue_style('wp-components');
}
