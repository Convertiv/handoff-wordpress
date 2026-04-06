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
  private const COMPONENTS_TRANSIENT = 'handoff_remote_components';
  private const USAGE_TTL = 3600; // 1 hour
  private const COMPONENTS_TTL = 3600; // 1 hour
  private const CONFIG_OPTION = 'handoff_config';

  public function __construct() {
    add_action('admin_menu', [$this, 'register_menu']);
    add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    add_action('rest_api_init', [$this, 'register_rest_routes']);
    add_action('admin_init', [$this, 'maybe_migrate_config_file']);
    add_action('admin_init', [$this, 'maybe_secure_content_dir']);
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

    register_rest_route($ns, '/themes', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_themes'],
      'permission_callback' => [$this, 'settings_permission'],
    ]);

    register_rest_route($ns, '/remote-components', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_remote_components'],
      'permission_callback' => [$this, 'settings_permission'],
      'args'                => [
        'refresh' => [
          'type'    => 'boolean',
          'default' => false,
        ],
      ],
    ]);

    register_rest_route($ns, '/schema/status', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_schema_status'],
      'permission_callback' => [$this, 'dashboard_read_permission'],
    ]);

    register_rest_route($ns, '/schema/affected/(?P<block>[a-zA-Z0-9_-]+)', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_affected_posts'],
      'permission_callback' => [$this, 'dashboard_read_permission'],
    ]);

    register_rest_route($ns, '/schema/migrate', [
      'methods'             => 'POST',
      'callback'            => [$this, 'rest_batch_migrate'],
      'permission_callback' => [$this, 'settings_permission'],
    ]);

    register_rest_route($ns, '/schema/overrides', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_get_migration_overrides'],
      'permission_callback' => [$this, 'settings_permission'],
    ]);

    register_rest_route($ns, '/schema/overrides', [
      'methods'             => 'POST',
      'callback'            => [$this, 'rest_save_migration_overrides'],
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
    $build_dir = rtrim(HANDOFF_CONTENT_DIR, '/') . '/build/';
    $build_url = rtrim(HANDOFF_CONTENT_URL, '/') . '/build/';
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

      $changelog_path = $build_dir . $item . '/schema-changelog.json';
      $schema_changes = null;
      if (file_exists($changelog_path)) {
        $changelog = json_decode(file_get_contents($changelog_path), true);
        if (!empty($changelog['history'])) {
          $needs_review = array_filter($changelog['history'], function ($h) {
            return ($h['migrationStatus'] ?? '') === 'needs-review';
          });
          $schema_changes = [
            'currentVersion' => $changelog['currentVersion'] ?? 1,
            'totalVersions'  => count($changelog['history']),
            'needsReview'    => count($needs_review),
          ];
        }
      }

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
        'screenshotUrl'  => $has_screenshot ? $build_url . $item . '/screenshot.png' : '',
        'lastModified'   => $last_modified,
        'schemaChanges'  => $schema_changes,
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
  // REST: GET/POST /config  (backed by wp_options)
  // ------------------------------------------------------------------

  /**
   * Read the stored config, applying wp-config.php constant overrides.
   */
  public static function get_config(): array {
    $config = get_option(self::CONFIG_OPTION, []);
    if (!is_array($config)) {
      $config = [];
    }

    $defaults = [
      'apiUrl'   => '',
      'themeDir' => get_stylesheet_directory(),
      'username' => '',
      'password' => '',
      'groups'   => new \stdClass(),
      'import'   => new \stdClass(),
    ];
    $config = array_merge($defaults, $config);

    // output is always HANDOFF_CONTENT_DIR/blocks — not configurable via UI
    $config['output'] = rtrim(HANDOFF_CONTENT_DIR, '/') . '/blocks';

    if (defined('HANDOFF_API_URL')) {
      $config['apiUrl'] = HANDOFF_API_URL;
    }
    if (defined('HANDOFF_API_USERNAME')) {
      $config['username'] = HANDOFF_API_USERNAME;
    }
    if (defined('HANDOFF_API_PASSWORD')) {
      $config['password'] = HANDOFF_API_PASSWORD;
    }

    return $config;
  }

  public function rest_get_config(\WP_REST_Request $request): \WP_REST_Response {
    return new \WP_REST_Response(self::get_config());
  }

  public function rest_save_config(\WP_REST_Request $request): \WP_REST_Response {
    $body = $request->get_json_params();

    if (empty($body) || !is_array($body)) {
      return new \WP_REST_Response(['error' => 'Invalid request body.'], 400);
    }

    if (empty($body['apiUrl']) || !filter_var($body['apiUrl'], FILTER_VALIDATE_URL)) {
      return new \WP_REST_Response(['error' => 'A valid apiUrl is required.'], 400);
    }

    // Strip credential fields that are provided via wp-config.php constants
    $stored = $body;
    if (defined('HANDOFF_API_URL'))      unset($stored['apiUrl']);
    if (defined('HANDOFF_API_USERNAME')) unset($stored['username']);
    if (defined('HANDOFF_API_PASSWORD')) unset($stored['password']);

    update_option(self::CONFIG_OPTION, $stored);

    return new \WP_REST_Response(['success' => true, 'config' => self::get_config()]);
  }

  // ------------------------------------------------------------------
  // REST: GET /themes
  // ------------------------------------------------------------------

  public function rest_get_themes(\WP_REST_Request $request): \WP_REST_Response {
    $themes = wp_get_themes();
    $active = get_stylesheet();
    $list = [];

    foreach ($themes as $slug => $theme) {
      $list[] = [
        'slug'   => $slug,
        'name'   => $theme->get('Name'),
        'path'   => $theme->get_stylesheet_directory(),
        'active' => $slug === $active,
      ];
    }

    usort($list, fn($a, $b) => $b['active'] <=> $a['active'] ?: strcmp($a['name'], $b['name']));

    return new \WP_REST_Response($list);
  }

  // ------------------------------------------------------------------
  // REST: GET /remote-components  (proxies the Handoff API)
  // ------------------------------------------------------------------

  public function rest_get_remote_components(\WP_REST_Request $request): \WP_REST_Response {
    $config = self::get_config();
    $api_url = $config['apiUrl'] ?? '';

    if (empty($api_url)) {
      return new \WP_REST_Response(
        ['error' => 'No API URL configured. Set your Handoff API URL in Settings first.'],
        400
      );
    }

    $refresh = (bool) $request->get_param('refresh');

    if (!$refresh) {
      $cached = get_transient(self::COMPONENTS_TRANSIENT);
      if ($cached !== false) {
        return new \WP_REST_Response($cached);
      }
    }

    $url = rtrim($api_url, '/') . '/api/components.json';
    $args = ['timeout' => 30, 'sslverify' => true];

    $username = $config['username'] ?? '';
    $password = $config['password'] ?? '';
    if (!empty($username)) {
      $args['headers'] = [
        'Authorization' => 'Basic ' . base64_encode($username . ':' . $password),
      ];
    }

    $response = wp_remote_get($url, $args);

    if (is_wp_error($response)) {
      return new \WP_REST_Response(
        ['error' => 'Failed to reach Handoff API: ' . $response->get_error_message()],
        502
      );
    }

    $status = wp_remote_retrieve_response_code($response);
    if ($status === 401) {
      return new \WP_REST_Response(
        ['error' => 'Authentication failed (HTTP 401). Check your username and password.'],
        401
      );
    }
    if ($status !== 200) {
      return new \WP_REST_Response(
        ['error' => "Handoff API returned HTTP $status."],
        502
      );
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($body)) {
      return new \WP_REST_Response(['error' => 'Invalid JSON from Handoff API.'], 502);
    }

    $simplified = [];
    foreach ($body as $component) {
      if (!isset($component['id'])) continue;

      $props = [];
      if (!empty($component['properties']) && is_array($component['properties'])) {
        foreach ($component['properties'] as $key => $prop) {
          $entry = [
            'name' => $prop['name'] ?? $key,
            'type' => $prop['type'] ?? 'text',
          ];
          if (($prop['type'] ?? '') === 'array' && !empty($prop['items']['properties'])) {
            $sub = [];
            foreach ($prop['items']['properties'] as $sk => $sp) {
              $sub[$sk] = [
                'name' => $sp['name'] ?? $sk,
                'type' => $sp['type'] ?? 'text',
              ];
            }
            $entry['items'] = ['properties' => $sub];
          }
          if (($prop['type'] ?? '') === 'array' && !empty($prop['pagination'])) {
            $entry['hasPagination'] = true;
          }
          $props[$key] = $entry;
        }
      }

      $comp_id = $component['id'];
      $screenshot_path = rtrim(HANDOFF_CONTENT_DIR, '/') . '/build/' . $comp_id . '/screenshot.png';
      $screenshot_url  = '';
      if (file_exists($screenshot_path)) {
        $screenshot_url = rtrim(HANDOFF_CONTENT_URL, '/') . '/build/' . $comp_id . '/screenshot.png';
      }

      $simplified[] = [
        'id'            => $comp_id,
        'title'         => $component['title'] ?? $comp_id,
        'type'          => $component['type'] ?? 'block',
        'group'         => $component['group'] ?? '',
        'properties'    => $props,
        'screenshotUrl' => $screenshot_url,
      ];
    }

    usort($simplified, fn($a, $b) =>
      strcmp($a['type'], $b['type']) ?: strcmp($a['group'], $b['group']) ?: strcmp($a['title'], $b['title'])
    );

    $data = ['components' => $simplified];
    set_transient(self::COMPONENTS_TRANSIENT, $data, self::COMPONENTS_TTL);

    return new \WP_REST_Response($data);
  }

  // ------------------------------------------------------------------
  // One-time migration: import handoff-wp.config.json → wp_options
  // ------------------------------------------------------------------

  /**
   * Ensure the content directory exists and is hardened against directory
   * browsing and direct PHP execution.
   */
  public function maybe_secure_content_dir(): void {
    $dir = rtrim(HANDOFF_CONTENT_DIR, '/');

    if (!is_dir($dir)) {
      wp_mkdir_p($dir);
    }

    // Silence index — prevents directory listing as a baseline
    $index = $dir . '/index.php';
    if (!file_exists($index)) {
      file_put_contents($index, "<?php\n// Silence is golden.\n");
    }

    // Apache: disable directory indexes and block direct PHP execution in build/
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
      $rules = <<<'HTACCESS'
# Handoff content directory security
Options -Indexes

# Block direct PHP execution in build artifacts
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule ^build/.*\.php$ - [F,L]
  RewriteRule ^blocks/.*\.php$ - [F,L]
</IfModule>
HTACCESS;
      file_put_contents($htaccess, $rules . "\n");
    }

    // IIS: equivalent rules
    $webconfig = $dir . '/web.config';
    if (!file_exists($webconfig)) {
      $xml = <<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <directoryBrowse enabled="false" />
    <rewrite>
      <rules>
        <rule name="Block PHP in build" stopProcessing="true">
          <match url="^build/.*\.php$" />
          <action type="AbortRequest" />
        </rule>
        <rule name="Block PHP in blocks" stopProcessing="true">
          <match url="^blocks/.*\.php$" />
          <action type="AbortRequest" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
XML;
      file_put_contents($webconfig, $xml . "\n");
    }
  }

  public function maybe_migrate_config_file(): void {
    if (get_option(self::CONFIG_OPTION) !== false) {
      return;
    }

    $candidates = [
      rtrim(HANDOFF_CONTENT_DIR, '/') . '/handoff-wp.config.json',
      HANDOFF_BLOCKS_PATH . 'handoff-wp.config.json',
    ];

    foreach ($candidates as $path) {
      if (file_exists($path)) {
        $data = json_decode(file_get_contents($path), true);
        if (is_array($data)) {
          update_option(self::CONFIG_OPTION, $data);
          return;
        }
      }
    }
  }
  // ------------------------------------------------------------------
  // REST: Schema health, affected posts, batch migration
  // ------------------------------------------------------------------

  private const MIGRATION_OVERRIDES_OPTION = 'handoff_migration_overrides';

  public function rest_get_schema_status(\WP_REST_Request $request): \WP_REST_Response {
    $build_dir = rtrim(HANDOFF_CONTENT_DIR, '/') . '/build/';
    $blocks = [];

    if (!is_dir($build_dir)) {
      return new \WP_REST_Response(['blocks' => []]);
    }

    foreach (scandir($build_dir) as $item) {
      if ($item === '.' || $item === '..' || $item === '.gitkeep') continue;

      $changelog_path = $build_dir . $item . '/schema-changelog.json';
      if (!file_exists($changelog_path)) continue;

      $changelog = json_decode(file_get_contents($changelog_path), true);
      if (!is_array($changelog) || empty($changelog['history'])) continue;

      $block_json_path = $build_dir . $item . '/block.json';
      $meta = file_exists($block_json_path)
        ? json_decode(file_get_contents($block_json_path), true)
        : null;

      $affected = $this->count_affected_posts($changelog['blockName'] ?? 'handoff/' . $item);

      $blocks[] = [
        'slug'           => $item,
        'name'           => $changelog['blockName'] ?? 'handoff/' . $item,
        'title'          => $meta['title'] ?? $item,
        'currentVersion' => $changelog['currentVersion'] ?? 1,
        'history'        => $changelog['history'],
        'affectedPosts'  => $affected,
      ];
    }

    return new \WP_REST_Response(['blocks' => $blocks]);
  }

  public function rest_get_affected_posts(\WP_REST_Request $request): \WP_REST_Response {
    $block_slug = $request->get_param('block');
    $block_name = 'handoff/' . $block_slug;

    global $wpdb;
    $pattern = '%<!-- wp:' . $wpdb->esc_like($block_name) . ' %';
    $posts = $wpdb->get_results($wpdb->prepare(
      "SELECT ID, post_title, post_type, post_status FROM {$wpdb->posts}
       WHERE post_content LIKE %s
       AND post_status IN ('publish','draft','pending','private')
       ORDER BY post_title ASC
       LIMIT 200",
      $pattern
    ));

    $result = [];
    foreach ($posts as $post) {
      $result[] = [
        'id'       => (int) $post->ID,
        'title'    => $post->post_title ?: "(#{$post->ID})",
        'type'     => $post->post_type,
        'status'   => $post->post_status,
        'editUrl'  => get_edit_post_link($post->ID, 'raw'),
      ];
    }

    return new \WP_REST_Response([
      'blockName' => $block_name,
      'posts'     => $result,
      'total'     => count($result),
    ]);
  }

  public function rest_batch_migrate(\WP_REST_Request $request): \WP_REST_Response {
    $block_name = sanitize_text_field($request->get_param('blockName') ?? '');
    $dry_run    = (bool) ($request->get_param('dryRun') ?? false);

    if (empty($block_name)) {
      return new \WP_REST_Response(['error' => 'blockName is required.'], 400);
    }

    $build_dir = rtrim(HANDOFF_CONTENT_DIR, '/') . '/build/';
    $slug = str_replace('handoff/', '', $block_name);
    $changelog_path = $build_dir . $slug . '/schema-changelog.json';

    if (!file_exists($changelog_path)) {
      return new \WP_REST_Response(['error' => 'No schema changelog found for ' . $block_name], 404);
    }

    $changelog = json_decode(file_get_contents($changelog_path), true);
    if (empty($changelog['history'])) {
      return new \WP_REST_Response(['migrated' => 0, 'message' => 'No schema history to migrate.']);
    }

    $renames = $this->get_rename_map($slug, $changelog['history']);

    global $wpdb;
    $pattern = '%<!-- wp:' . $wpdb->esc_like($block_name) . ' %';
    $post_ids = $wpdb->get_col($wpdb->prepare(
      "SELECT ID FROM {$wpdb->posts}
       WHERE post_content LIKE %s
       AND post_status IN ('publish','draft','pending','private')",
      $pattern
    ));

    $migrated = 0;
    $changes = [];

    foreach ($post_ids as $post_id) {
      $post = get_post($post_id);
      if (!$post) continue;

      $updated_content = $this->migrate_block_attributes_in_content(
        $post->post_content,
        $block_name,
        $renames
      );

      if ($updated_content === $post->post_content) continue;

      if ($dry_run) {
        $changes[] = ['postId' => (int) $post_id, 'title' => $post->post_title];
        $migrated++;
        continue;
      }

      wp_update_post([
        'ID'           => $post_id,
        'post_content' => $updated_content,
      ]);
      $migrated++;
      $changes[] = ['postId' => (int) $post_id, 'title' => $post->post_title];
    }

    return new \WP_REST_Response([
      'migrated' => $migrated,
      'dryRun'   => $dry_run,
      'changes'  => $changes,
    ]);
  }

  public function rest_get_migration_overrides(\WP_REST_Request $request): \WP_REST_Response {
    $overrides = get_option(self::MIGRATION_OVERRIDES_OPTION, []);
    return new \WP_REST_Response($overrides);
  }

  public function rest_save_migration_overrides(\WP_REST_Request $request): \WP_REST_Response {
    $overrides = $request->get_json_params();
    update_option(self::MIGRATION_OVERRIDES_OPTION, $overrides);
    return new \WP_REST_Response(['success' => true]);
  }

  // ------------------------------------------------------------------
  // Schema migration helpers
  // ------------------------------------------------------------------

  private function count_affected_posts(string $block_name): int {
    global $wpdb;
    $pattern = '%<!-- wp:' . $wpdb->esc_like($block_name) . ' %';
    return (int) $wpdb->get_var($wpdb->prepare(
      "SELECT COUNT(DISTINCT ID) FROM {$wpdb->posts}
       WHERE post_content LIKE %s
       AND post_status IN ('publish','draft','pending','private')",
      $pattern
    ));
  }

  private function get_rename_map(string $slug, array $history): array {
    $overrides = get_option(self::MIGRATION_OVERRIDES_OPTION, []);
    $renames = [];
    if (isset($overrides[$slug]) && is_array($overrides[$slug])) {
      foreach ($overrides[$slug] as $version_key => $data) {
        if (isset($data['renames']) && is_array($data['renames'])) {
          $renames = array_merge($renames, $data['renames']);
        }
      }
    }
    return $renames;
  }

  /**
   * Find block comments for a specific block name in post_content and
   * apply attribute renames to the JSON payload.
   */
  private function migrate_block_attributes_in_content(
    string $content,
    string $block_name,
    array $renames
  ): string {
    if (empty($renames)) return $content;

    $escaped = preg_quote($block_name, '/');
    return preg_replace_callback(
      '/<!-- wp:' . $escaped . ' (\{[^}]*\})/',
      function ($matches) use ($renames) {
        $attrs = json_decode($matches[1], true);
        if (!is_array($attrs)) return $matches[0];

        $changed = false;
        foreach ($renames as $old_key => $new_key) {
          if (array_key_exists($old_key, $attrs) && !array_key_exists($new_key, $attrs)) {
            $attrs[$new_key] = $attrs[$old_key];
            unset($attrs[$old_key]);
            $changed = true;
          }
        }

        if (!$changed) return $matches[0];

        $new_json = wp_json_encode($attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return str_replace($matches[1], $new_json, $matches[0]);
      },
      $content
    );
  }
}

new Handoff_Admin();
