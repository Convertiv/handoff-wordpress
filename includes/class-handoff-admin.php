<?php
/**
 * Handoff Admin Dashboard
 *
 * Registers the top-level "Handoff" admin page (replaces the old "Handoff Migration" menu):
 *   - Blocks: block architecture visualization
 *   - Usage:  block usage across site content
 *   - Migration: map legacy Handoff pages to Handoff blocks
 *   - Settings: config editor (manage_options only)
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
  exit;
}

class Handoff_Admin {

  private const USAGE_TRANSIENT = 'handoff_block_usage';
  private const USAGE_TTL = 3600; // 1 hour

  public function __construct() {
    add_action('admin_menu', [$this, 'register_menu']);
    add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    add_action('rest_api_init', [$this, 'register_rest_routes']);
  }

  /**
   * Register the top-level Handoff admin menu page.
   */
  public function register_menu(): void {
    // Same capability as legacy Handoff Migration so editors with edit_others_posts keep access.
    add_menu_page(
      __('Handoff', 'handoff'),
      __('Handoff', 'handoff'),
      'edit_others_posts',
      'handoff',
      [$this, 'render_page'],
      'dashicons-layout',
      59
    );
  }

  /**
   * Render the admin page shell (React mounts here).
   */
  public function render_page(): void {
    echo '<div id="handoff-admin-root"></div>';
  }

  /**
   * Enqueue admin dashboard JS and CSS.
   */
  public function enqueue_assets(string $hook): void {
    if ($hook !== 'toplevel_page_handoff') {
      return;
    }

    $asset_file = HANDOFF_BLOCKS_PATH . 'build/admin/index.asset.php';

    if (file_exists($asset_file)) {
      $asset = require $asset_file;
    } else {
      $asset = [
        'dependencies' => ['wp-element', 'wp-components', 'wp-api-fetch', 'wp-i18n'],
        'version'      => HANDOFF_BLOCKS_VERSION,
      ];
    }

    wp_enqueue_script(
      'handoff-admin',
      HANDOFF_BLOCKS_URL . 'build/admin/index.js',
      $asset['dependencies'],
      $asset['version'],
      true
    );

    wp_localize_script('handoff-admin', 'handoffAdmin', [
      'canManageOptions' => current_user_can('manage_options'),
    ]);

    wp_enqueue_style(
      'handoff-admin',
      HANDOFF_BLOCKS_URL . 'build/admin/index.css',
      ['wp-components'],
      $asset['version']
    );

    wp_enqueue_style('wp-components');
  }

  /**
   * Register REST API routes under handoff/v1/.
   */
  public function register_rest_routes(): void {
    $ns = 'handoff/v1';

    register_rest_route($ns, '/blocks', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_blocks'],
      'permission_callback' => [$this, 'dashboard_read_permission'],
    ]);

    register_rest_route($ns, '/usage', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_usage'],
      'permission_callback' => [$this, 'dashboard_read_permission'],
    ]);

    register_rest_route($ns, '/usage/refresh', [
      'methods'             => 'POST',
      'callback'            => [$this, 'rest_refresh_usage'],
      'permission_callback' => [$this, 'dashboard_read_permission'],
    ]);

    register_rest_route($ns, '/config', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_config'],
      'permission_callback' => [$this, 'settings_permission'],
    ]);

    register_rest_route($ns, '/config', [
      'methods'             => 'POST',
      'callback'            => [$this, 'rest_save_config'],
      'permission_callback' => [$this, 'settings_permission'],
    ]);
  }

  /**
   * Blocks / usage — anyone who can open the Handoff admin screen.
   */
  public function dashboard_read_permission(): bool {
    return current_user_can('edit_others_posts');
  }

  /**
   * Config file read/write — administrators only.
   */
  public function settings_permission(): bool {
    return current_user_can('manage_options');
  }

  // ------------------------------------------------------------------
  // REST: GET /blocks
  // ------------------------------------------------------------------

  public function rest_get_blocks(\WP_REST_Request $request): \WP_REST_Response {
    $build_dir = HANDOFF_BLOCKS_PATH . 'build/';
    $blocks = [];

    if (!is_dir($build_dir)) {
      return new \WP_REST_Response(['blocks' => [], 'stats' => $this->empty_stats()]);
    }

    foreach (scandir($build_dir) as $item) {
      if ($item === '.' || $item === '..' || $item === '.gitkeep') continue;

      $block_json_path = $build_dir . $item . '/block.json';
      if (!file_exists($block_json_path)) continue;

      $meta = json_decode(file_get_contents($block_json_path), true);
      if (!$meta) continue;

      $variations_dir = $build_dir . $item . '/variations/';
      $variation_count = 0;
      if (is_dir($variations_dir)) {
        $variation_count = count(array_filter(scandir($variations_dir), fn($f) => str_ends_with($f, '.js')));
      }

      $has_screenshot = file_exists($build_dir . $item . '/screenshot.png');
      $last_modified  = date('Y-m-d H:i:s', filemtime($block_json_path));

      $blocks[] = [
        'slug'           => $item,
        'name'           => $meta['name'] ?? '',
        'title'          => $meta['title'] ?? $item,
        'description'    => $meta['description'] ?? '',
        'category'       => $meta['category'] ?? '',
        'keywords'       => $meta['keywords'] ?? [],
        'attributeCount' => isset($meta['attributes']) ? count($meta['attributes']) : 0,
        'variationCount' => $variation_count,
        'handoffUrl'     => $meta['__handoff']['handoffUrl'] ?? '',
        'figmaUrl'       => $meta['__handoff']['figmaUrl'] ?? '',
        'hasScreenshot'  => $has_screenshot,
        'screenshotUrl'  => $has_screenshot ? HANDOFF_BLOCKS_URL . 'build/' . $item . '/screenshot.png' : '',
        'lastModified'   => $last_modified,
      ];
    }

    usort($blocks, fn($a, $b) => strcmp($a['category'], $b['category']) ?: strcmp($a['title'], $b['title']));

    $categories = array_values(array_unique(array_column($blocks, 'category')));
    $total_variations = array_sum(array_column($blocks, 'variationCount'));

    return new \WP_REST_Response([
      'blocks' => $blocks,
      'stats'  => [
        'totalBlocks'     => count($blocks),
        'totalCategories' => count($categories),
        'totalVariations' => $total_variations,
        'categories'      => $categories,
      ],
    ]);
  }

  private function empty_stats(): array {
    return [
      'totalBlocks'     => 0,
      'totalCategories' => 0,
      'totalVariations' => 0,
      'categories'      => [],
    ];
  }

  // ------------------------------------------------------------------
  // REST: GET /usage, POST /usage/refresh
  // ------------------------------------------------------------------

  public function rest_get_usage(\WP_REST_Request $request): \WP_REST_Response {
    $cached = get_transient(self::USAGE_TRANSIENT);
    if ($cached !== false) {
      return new \WP_REST_Response($cached);
    }

    $data = $this->scan_usage();
    set_transient(self::USAGE_TRANSIENT, $data, self::USAGE_TTL);
    return new \WP_REST_Response($data);
  }

  public function rest_refresh_usage(\WP_REST_Request $request): \WP_REST_Response {
    delete_transient(self::USAGE_TRANSIENT);
    $data = $this->scan_usage();
    set_transient(self::USAGE_TRANSIENT, $data, self::USAGE_TTL);
    return new \WP_REST_Response($data);
  }

  private function scan_usage(): array {
    global $wpdb;

    $posts = $wpdb->get_results(
      "SELECT ID, post_title, post_type, post_content
       FROM {$wpdb->posts}
       WHERE post_status = 'publish'
         AND post_content LIKE '%<!-- wp:handoff/%'
       ORDER BY post_title ASC",
      ARRAY_A
    );

    $block_usage = []; // blockName => [ 'count' => int, 'posts' => [...] ]

    foreach ($posts as $post) {
      $blocks = parse_blocks($post['post_content']);
      $found_names = $this->extract_block_names($blocks, 'handoff/');

      foreach ($found_names as $name) {
        if (!isset($block_usage[$name])) {
          $block_usage[$name] = ['count' => 0, 'posts' => []];
        }
        $block_usage[$name]['count']++;
        $block_usage[$name]['posts'][] = [
          'id'       => (int) $post['ID'],
          'title'    => $post['post_title'],
          'type'     => $post['post_type'],
          'editUrl'  => get_edit_post_link($post['ID'], 'raw'),
        ];
      }
    }

    ksort($block_usage);

    return [
      'usage'     => $block_usage,
      'scannedAt' => current_time('mysql'),
    ];
  }

  /**
   * Recursively extract unique Handoff block names from parsed blocks.
   */
  private function extract_block_names(array $blocks, string $prefix): array {
    $names = [];
    foreach ($blocks as $block) {
      if (!empty($block['blockName']) && str_starts_with($block['blockName'], $prefix)) {
        $names[$block['blockName']] = true;
      }
      if (!empty($block['innerBlocks'])) {
        foreach ($this->extract_block_names($block['innerBlocks'], $prefix) as $n) {
          $names[$n] = true;
        }
      }
    }
    return array_keys($names);
  }

  // ------------------------------------------------------------------
  // REST: GET/POST /config
  // ------------------------------------------------------------------

  public function rest_get_config(\WP_REST_Request $request): \WP_REST_Response {
    $path = HANDOFF_BLOCKS_PATH . 'handoff-wp.config.json';
    if (!file_exists($path)) {
      return new \WP_REST_Response(['error' => 'Config file not found.'], 404);
    }
    $config = json_decode(file_get_contents($path), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
      return new \WP_REST_Response(['error' => 'Invalid JSON in config file.'], 500);
    }
    return new \WP_REST_Response($config);
  }

  public function rest_save_config(\WP_REST_Request $request): \WP_REST_Response {
    $path = HANDOFF_BLOCKS_PATH . 'handoff-wp.config.json';
    $body = $request->get_json_params();

    if (empty($body) || !is_array($body)) {
      return new \WP_REST_Response(['error' => 'Invalid request body.'], 400);
    }

    // Validate required fields
    if (empty($body['apiUrl']) || !filter_var($body['apiUrl'], FILTER_VALIDATE_URL)) {
      return new \WP_REST_Response(['error' => 'A valid apiUrl is required.'], 400);
    }

    $json = json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    $written = file_put_contents($path, $json);

    if ($written === false) {
      return new \WP_REST_Response(['error' => 'Failed to write config file.'], 500);
    }

    return new \WP_REST_Response(['success' => true, 'config' => $body]);
  }
}

new Handoff_Admin();
