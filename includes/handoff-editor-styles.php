<?php
/**
 * Block editor canvas styles — per-project design system + universal shim.
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
  exit;
}

/**
 * Resolved editor config (handoff-wp.config.json / wp_options handoff_config).
 *
 * @return array<string, mixed>
 */
function handoff_get_editor_config(): array {
  $defaults = [
    'designSystemStylesheets' => ['assets/css/main.css'],
    'scopeDesignSystem'       => true,
    'scopePrefix'             => '.editor-styles-wrapper [class*="-editor-preview"] ',
    'canvasShim'              => true,
    'extraStylesheets'        => [],
    'canvasButtonPatterns'    => [],
  ];

  $config = [];
  if (class_exists('Handoff_Admin')) {
    $config = Handoff_Admin::get_config();
  } else {
    $json_path = rtrim(HANDOFF_CONTENT_DIR, '/') . '/handoff-wp.config.json';
    if (file_exists($json_path)) {
      $decoded = json_decode((string) file_get_contents($json_path), true);
      if (is_array($decoded)) {
        $config = $decoded;
      }
    }
  }

  $editor = isset($config['editor']) && is_array($config['editor']) ? $config['editor'] : [];
  return array_merge($defaults, $editor);
}

/**
 * Resolve a stylesheet path relative to HANDOFF_CONTENT_DIR or themeDir.
 *
 * @param string $rel Relative path from config.
 * @return array{path: string, url: string}|null
 */
function handoff_resolve_content_stylesheet(string $rel): ?array {
  $rel = ltrim($rel, '/');
  $content_path = rtrim(HANDOFF_CONTENT_DIR, '/') . '/' . $rel;
  if (file_exists($content_path)) {
    return [
      'path' => $content_path,
      'url'  => rtrim(HANDOFF_CONTENT_URL, '/') . '/' . $rel,
    ];
  }

  $config = class_exists('Handoff_Admin') ? Handoff_Admin::get_config() : [];
  $theme_dir = isset($config['themeDir']) ? (string) $config['themeDir'] : '';
  if ($theme_dir !== '') {
    $theme_base = $theme_dir;
    if ($theme_dir[0] !== '/' && !preg_match('#^[A-Za-z]:\\\\#', $theme_dir)) {
      $theme_base = rtrim(HANDOFF_CONTENT_DIR, '/') . '/' . ltrim($theme_dir, '/');
    }
    $theme_path = rtrim($theme_base, '/') . '/' . $rel;
    if (file_exists($theme_path)) {
      $theme_uri = get_theme_file_uri($rel);
      if (!$theme_uri) {
        return null;
      }
      return [
        'path' => $theme_path,
        'url'  => $theme_uri,
      ];
    }
  }

  return null;
}

/**
 * Sibling editor-scoped CSS path (main.css → main.editor-scoped.css).
 */
function handoff_editor_scoped_stylesheet_path(string $rel): string {
  $ext  = pathinfo($rel, PATHINFO_EXTENSION);
  $base = $ext !== '' ? substr($rel, 0, -(strlen($ext) + 1)) : $rel;
  return $base . '.editor-scoped.' . ($ext !== '' ? $ext : 'css');
}

/**
 * Build ordered editor stylesheet queue.
 *
 * @return array<int, array{handle: string, url: string, path: string, version: string|int|false}>
 */
function handoff_build_editor_stylesheets(): array {
  $editor  = handoff_get_editor_config();
  $queue   = [];
  $content = rtrim(HANDOFF_CONTENT_DIR, '/');

  if (!empty($editor['canvasShim'])) {
    $shim_candidates = [
      $content . '/shared/editor/canvas-shim.css',
      rtrim(HANDOFF_BLOCKS_PATH, '/') . '/shared/editor/canvas-shim.css',
    ];
    foreach ($shim_candidates as $shim_path) {
      if (file_exists($shim_path)) {
        $shim_url = str_starts_with($shim_path, $content)
          ? rtrim(HANDOFF_CONTENT_URL, '/') . substr($shim_path, strlen($content))
          : HANDOFF_BLOCKS_URL . 'shared/editor/canvas-shim.css';
        $queue[] = [
          'handle'  => 'handoff-editor-canvas-shim',
          'url'     => $shim_url,
          'path'    => $shim_path,
          'version' => filemtime($shim_path),
        ];
        break;
      }
    }
  }

  $design_files = isset($editor['designSystemStylesheets']) && is_array($editor['designSystemStylesheets'])
    ? $editor['designSystemStylesheets']
    : ['assets/css/main.css'];

  $scope_enabled = !isset($editor['scopeDesignSystem']) || $editor['scopeDesignSystem'] !== false;
  $index         = 0;
  foreach ($design_files as $rel) {
    if (!is_string($rel) || $rel === '') {
      continue;
    }
    $use_rel = $scope_enabled ? handoff_editor_scoped_stylesheet_path($rel) : $rel;
    $resolved = handoff_resolve_content_stylesheet($use_rel);
    if (!$resolved) {
      $resolved = handoff_resolve_content_stylesheet($rel);
      $use_rel  = $rel;
    }
    if ($resolved) {
      $queue[] = [
        'handle'  => 'handoff-design-system-editor-' . $index,
        'url'     => $resolved['url'],
        'path'    => $resolved['path'],
        'version' => filemtime($resolved['path']),
      ];
      $index++;
    }
  }

  $extras = isset($editor['extraStylesheets']) && is_array($editor['extraStylesheets'])
    ? $editor['extraStylesheets']
    : [];
  $extra_index = 0;
  foreach ($extras as $rel) {
    if (!is_string($rel) || $rel === '') {
      continue;
    }
    $resolved = handoff_resolve_content_stylesheet($rel);
    if ($resolved) {
      $queue[] = [
        'handle'  => 'handoff-editor-extra-' . $extra_index,
        'url'     => $resolved['url'],
        'path'    => $resolved['path'],
        'version' => filemtime($resolved['path']),
      ];
      $extra_index++;
    }
  }

  $convention = rtrim($content, '/') . '/assets/css/handoff-editor.css';
  if (file_exists($convention)) {
    $queue[] = [
      'handle'  => 'handoff-editor-convention',
      'url'     => rtrim(HANDOFF_CONTENT_URL, '/') . '/assets/css/handoff-editor.css',
      'path'    => $convention,
      'version' => filemtime($convention),
    ];
  }

  /**
   * Filter editor canvas stylesheets.
   *
   * @param array<int, array{handle: string, url: string, path: string, version: string|int|false}> $queue
   */
  return apply_filters('handoff_editor_stylesheets', $queue, $editor);
}

/**
 * Enqueue frontend design system (main.css / main.js).
 */
function handoff_enqueue_frontend_design_assets(): void {
  $assets_dir = rtrim(HANDOFF_CONTENT_DIR, '/') . '/assets';
  $assets_url = rtrim(HANDOFF_CONTENT_URL, '/') . '/assets';
  $version    = HANDOFF_BLOCKS_VERSION;

  $css_file = $assets_dir . '/css/main.css';
  if (file_exists($css_file)) {
    wp_enqueue_style(
      'handoff-design-system',
      $assets_url . '/css/main.css',
      [],
      filemtime($css_file)
    );
  }

  $js_file = $assets_dir . '/js/main.js';
  if (file_exists($js_file)) {
    wp_enqueue_script(
      'handoff-design-system',
      $assets_url . '/js/main.js',
      [],
      $version,
      true
    );
  }
}

/**
 * Enqueue block editor canvas styles (shim → scoped design system → extras).
 */
function handoff_enqueue_block_editor_canvas_styles(): void {
  if (!is_admin()) {
    return;
  }

  foreach (handoff_build_editor_stylesheets() as $sheet) {
    wp_enqueue_style(
      $sheet['handle'],
      $sheet['url'],
      [],
      $sheet['version']
    );
  }
}

/**
 * Block assets: frontend design system; editor uses canvas pipeline.
 */
function handoff_enqueue_design_assets(): void {
  if (is_admin()) {
    handoff_enqueue_block_editor_canvas_styles();
    return;
  }
  handoff_enqueue_frontend_design_assets();
}
