<?php
/**
 * Plugin Name: Handoff Blocks
 * Plugin URI: https://handoff.com
 * Description: A collection of Gutenberg blocks built from the Handoff design system.
 * Version: 0.0.2
 * Author: Brad Mering
 * Author URI: https://www.handoff.com
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 */

if (!defined('ABSPATH')) {
  exit; // Exit if accessed directly
}

define('HANDOFF_BLOCKS_VERSION', '0.0.2');
define('HANDOFF_BLOCKS_PATH', plugin_dir_path(__FILE__));
define('HANDOFF_BLOCKS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HANDOFF_BLOCKS_URL', plugin_dir_url(__FILE__));

/**
 * Resolve the content directory where project-specific blocks live.
 *
 * Default: WP_CONTENT_DIR . '/handoff'  (i.e. wp-content/handoff/).
 * This keeps generated blocks outside the plugin directory so they survive
 * Composer updates and can be version-controlled in the consuming project.
 *
 * Override in wp-config.php if you want a different location:
 *
 *   define( 'HANDOFF_CONTENT_DIR', WP_CONTENT_DIR . '/handoff' );
 */
if (!defined('HANDOFF_CONTENT_DIR')) {
  define('HANDOFF_CONTENT_DIR', WP_CONTENT_DIR . '/handoff');
}

/**
 * Derive a web-accessible URL for the content directory.
 */
if (!defined('HANDOFF_CONTENT_URL')) {
  if (HANDOFF_CONTENT_DIR === HANDOFF_BLOCKS_PATH) {
    define('HANDOFF_CONTENT_URL', HANDOFF_BLOCKS_URL);
  } else {
    $content_dir_real = rtrim(wp_normalize_path(HANDOFF_CONTENT_DIR), '/');
    $wp_content_real  = rtrim(wp_normalize_path(WP_CONTENT_DIR), '/');
    if (strpos($content_dir_real, $wp_content_real) === 0) {
      $relative = substr($content_dir_real, strlen($wp_content_real));
      define('HANDOFF_CONTENT_URL', content_url($relative) . '/');
    } else {
      $abspath_real = rtrim(wp_normalize_path(ABSPATH), '/');
      $relative = substr($content_dir_real, strlen($abspath_real));
      define('HANDOFF_CONTENT_URL', site_url($relative) . '/');
    }
  }
}

/**
 * Returns true when running in a local/development environment.
 *
 * In development mode the REST API permission callbacks are relaxed so that
 * tools like Postman can hit the endpoints without a WordPress session cookie
 * or Application Password.
 *
 * Detection order:
 *   1. HANDOFF_DEV_AUTH constant — define( 'HANDOFF_DEV_AUTH', true ) in wp-config.php
 *      to force-enable regardless of environment.
 *   2. PHP_ENV server variable (set by Docker / the server) equals "development".
 *
 * NEVER enable this in production. The constant check exists so you can explicitly
 * turn it on/off in wp-config.php without relying on the env var.
 */
function handoff_is_dev_env() {
    if (defined('HANDOFF_DEV_AUTH') && HANDOFF_DEV_AUTH === true) {
        return true;
    }
    $env = isset($_SERVER['PHP_ENV']) ? $_SERVER['PHP_ENV'] : getenv('PHP_ENV');
    return $env === 'development';
}

// Include the auto-generated categories file — prefer the content dir copy
$handoff_cats_file = rtrim(HANDOFF_CONTENT_DIR, '/') . '/includes/handoff-categories.php';
if (!file_exists($handoff_cats_file)) {
  $handoff_cats_file = HANDOFF_BLOCKS_PATH . 'includes/handoff-categories.php';
}
if (file_exists($handoff_cats_file)) {
  require_once $handoff_cats_file;
}

// Include admin dashboard
if (file_exists(HANDOFF_BLOCKS_PATH . 'includes/class-handoff-admin.php')) {
  require_once HANDOFF_BLOCKS_PATH . 'includes/class-handoff-admin.php';
}

// Include WP-CLI commands
if (defined('WP_CLI') && WP_CLI) {
  if (file_exists(HANDOFF_BLOCKS_PATH . 'includes/class-handoff-cli.php')) {
    require_once HANDOFF_BLOCKS_PATH . 'includes/class-handoff-cli.php';
  }
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
 * Fix asset URLs for blocks that live outside wp-content/plugins/.
 *
 * register_block_type_from_metadata() uses plugins_url() to resolve
 * file: URIs in block.json. That only produces correct URLs when the
 * block.json is inside WP_PLUGIN_DIR. When blocks live under
 * HANDOFF_CONTENT_DIR (e.g. wp-content/handoff/build/), we intercept
 * the filter and derive the URL from HANDOFF_CONTENT_URL instead.
 */
function handoff_fix_block_asset_urls($url, $path, $plugin) {
  if (empty($plugin)) {
    return $url;
  }

  $content_dir = wp_normalize_path(rtrim(HANDOFF_CONTENT_DIR, '/'));
  $plugin_norm = wp_normalize_path($plugin);

  if (strpos($plugin_norm, $content_dir . '/') !== 0) {
    return $url;
  }

  $relative_dir = substr(dirname($plugin_norm), strlen($content_dir));
  $content_url  = rtrim(HANDOFF_CONTENT_URL, '/');

  return $content_url . $relative_dir . '/' . ltrim(wp_normalize_path($path), '/');
}

$handoff_content_norm = wp_normalize_path(rtrim(HANDOFF_CONTENT_DIR, '/'));
$handoff_plugin_norm  = wp_normalize_path(rtrim(HANDOFF_BLOCKS_PATH, '/'));
if ($handoff_content_norm !== $handoff_plugin_norm) {
  add_filter('plugins_url', 'handoff_fix_block_asset_urls', 10, 3);
}

/**
 * Register all Handoff blocks
 */
function handoff_blocks_register_blocks() {
  $blocks_dir = rtrim(HANDOFF_CONTENT_DIR, '/') . '/build/';

  if (!is_dir($blocks_dir)) {
    return;
  }

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
 * Enqueue Handoff design system assets (main.css / main.js) for both the
 * frontend and the block editor so blocks render with the correct styles.
 *
 * Assets are downloaded by `wp handoff compile --all` into
 * HANDOFF_CONTENT_DIR/assets/.
 */
function handoff_enqueue_design_assets() {
  $assets_dir = rtrim(HANDOFF_CONTENT_DIR, '/') . '/assets';
  $assets_url = rtrim(HANDOFF_CONTENT_URL, '/') . '/assets';
  $version    = HANDOFF_BLOCKS_VERSION;

  $css_file = $assets_dir . '/css/main.css';
  if (file_exists($css_file)) {
    wp_enqueue_style(
      'handoff-design-system',
      $assets_url . '/css/main.css',
      array(),
      $version
    );
  }

  $js_file = $assets_dir . '/js/main.js';
  if (file_exists($js_file)) {
    wp_enqueue_script(
      'handoff-design-system',
      $assets_url . '/js/main.js',
      array(),
      $version,
      true
    );
  }
}
add_action('enqueue_block_assets', 'handoff_enqueue_design_assets');

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

