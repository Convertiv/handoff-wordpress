<?php
/**
 * WP-CLI commands for the Handoff Blocks plugin.
 *
 * Wraps the Node.js compiler so all compilation and build steps
 * can be run via `wp handoff <subcommand>`.
 *
 * Config is read from wp_options (with wp-config.php constant overrides)
 * and passed to the compiler as CLI flags. Block source and build output
 * use the HANDOFF_CONTENT_DIR constant.
 *
 * @package Handoff_Blocks
 */

if (!defined('ABSPATH')) {
  exit;
}

class Handoff_CLI {

  /**
   * Absolute path to the compiler entry point.
   */
  private function compiler_bin(): string {
    return HANDOFF_BLOCKS_PATH . 'compiler/dist/index.js';
  }

  /**
   * Resolve the node binary, preferring the one in $PATH.
   */
  private function node_bin(): string {
    $node = trim(shell_exec('which node 2>/dev/null') ?: '');
    return $node ?: 'node';
  }

  /**
   * Run a shell command with streaming output.
   *
   * @param string      $cmd  Full shell command.
   * @param string|null $cwd  Working directory (defaults to HANDOFF_BLOCKS_PATH).
   * @return int              Exit code.
   */
  private function run(string $cmd, ?string $cwd = null): int {
    $cwd = $cwd ?: HANDOFF_BLOCKS_PATH;
    WP_CLI::debug("Running: $cmd", 'handoff');
    $proc = proc_open($cmd, [
      0 => STDIN,
      1 => STDOUT,
      2 => STDERR,
    ], $pipes, $cwd);

    if (!is_resource($proc)) {
      WP_CLI::error('Failed to launch process.');
      return 1;
    }

    return proc_close($proc);
  }

  /**
   * Read the resolved configuration (wp_options + wp-config.php overrides).
   */
  private function get_config(): array {
    if (class_exists('Handoff_Admin') && method_exists('Handoff_Admin', 'get_config')) {
      return Handoff_Admin::get_config();
    }

    $config = get_option('handoff_config', []);
    if (!is_array($config)) $config = [];

    if (defined('HANDOFF_API_URL'))      $config['apiUrl']    = HANDOFF_API_URL;
    if (defined('HANDOFF_API_USERNAME')) $config['username']  = HANDOFF_API_USERNAME;
    if (defined('HANDOFF_API_PASSWORD')) $config['password']  = HANDOFF_API_PASSWORD;

    return $config;
  }

  /**
   * Content directory where project-specific blocks live.
   */
  private function content_dir(): string {
    return rtrim(HANDOFF_CONTENT_DIR, '/');
  }

  /**
   * Build the base compiler command, injecting config from the DB.
   *
   * CLI --flags passed by the user override DB values.
   */
  private function base_cmd(array $assoc_args = []): string {
    $node = $this->node_bin();
    $bin  = $this->compiler_bin();
    $cmd  = escapeshellarg($node) . ' ' . escapeshellarg($bin);

    $config = $this->get_config();

    $api_url   = $assoc_args['api-url']   ?? $config['apiUrl']    ?? '';
    $username  = $assoc_args['username']  ?? $config['username']  ?? '';
    $password  = $assoc_args['password']  ?? $config['password']  ?? '';
    $output    = $assoc_args['output']    ?? $this->content_dir() . '/blocks';
    $theme_dir = $assoc_args['theme-dir'] ?? $config['themeDir']  ?? get_stylesheet_directory();

    if ($api_url)   $cmd .= ' --api-url '   . escapeshellarg($api_url);
    if ($output)    $cmd .= ' --output '    . escapeshellarg($output);
    if ($theme_dir) $cmd .= ' --theme-dir ' . escapeshellarg($theme_dir);
    if ($username)  $cmd .= ' --username '  . escapeshellarg($username);
    if ($password)  $cmd .= ' --password '  . escapeshellarg($password);

    return $cmd;
  }

  /**
   * Compile blocks from the Handoff API.
   *
   * ## OPTIONS
   *
   * [<component>]
   * : Component or group name to compile. Omit when using --all.
   *
   * [--all]
   * : Compile all available components.
   *
   * [--theme]
   * : Compile theme templates (header, footer, etc.).
   *
   * [--force]
   * : Skip pre-compilation validation.
   *
   * [--api-url=<url>]
   * : Override the Handoff API URL from config.
   *
   * [--output=<dir>]
   * : Override the output directory.
   *
   * [--username=<user>]
   * : Basic-auth username.
   *
   * [--password=<pass>]
   * : Basic-auth password.
   *
   * ## EXAMPLES
   *
   *     wp handoff compile --all
   *     wp handoff compile hero-article
   *     wp handoff compile --theme
   *     wp handoff compile --all --force
   *
   * @subcommand compile
   */
  public function compile($args, $assoc_args) {
    $cmd = $this->base_cmd($assoc_args);

    if (!empty($assoc_args['all'])) {
      $cmd .= ' --all';
    }
    if (!empty($assoc_args['theme'])) {
      $cmd .= ' --theme';
    }
    if (!empty($assoc_args['force'])) {
      $cmd .= ' --force';
    }
    if (!empty($args[0])) {
      $cmd .= ' ' . escapeshellarg($args[0]);
    }

    $exit = $this->run($cmd);

    if ($exit === 0) {
      WP_CLI::success('Compilation finished.');
    } else {
      WP_CLI::error('Compilation failed (exit code ' . $exit . ').');
    }
  }

  /**
   * Run the webpack build to produce production block assets.
   *
   * When HANDOFF_CONTENT_DIR is external the build reads block sources
   * from there and writes webpack output back to the same tree. The admin
   * dashboard bundle inside the plugin is NOT rebuilt.
   *
   * ## EXAMPLES
   *
   *     wp handoff build
   *
   * @subcommand build
   */
  public function build($args, $assoc_args) {
    $content = $this->content_dir();
    $webpack_config = HANDOFF_BLOCKS_PATH . 'webpack.config.js';

    // Locate wp-scripts: plugin node_modules first, then project-level, then global npx
    $wp_scripts = null;
    $run_cwd    = null;

    $plugin_bin = HANDOFF_BLOCKS_PATH . 'node_modules/.bin/wp-scripts';
    $project_cwd = getcwd();
    $project_bin = $project_cwd . '/node_modules/.bin/wp-scripts';

    if (is_executable($plugin_bin)) {
      $wp_scripts = $plugin_bin;
      $run_cwd = HANDOFF_BLOCKS_PATH;
    } elseif (is_executable($project_bin)) {
      $wp_scripts = $project_bin;
      $run_cwd = $project_cwd;
    } else {
      // Try npx from the project root as a last resort
      $npx = trim(shell_exec('which npx 2>/dev/null') ?: '');
      if ($npx) {
        $wp_scripts = 'npx wp-scripts';
        $run_cwd = $project_cwd;
      }
    }

    if (!$wp_scripts) {
      WP_CLI::error(
        "Cannot find wp-scripts. Run 'npm install @wordpress/scripts' in either:\n"
        . "  • The plugin directory: " . HANDOFF_BLOCKS_PATH . "\n"
        . "  • Your project root:   " . $project_cwd
      );
      return;
    }

    $env_prefix = 'HANDOFF_CONTENT_DIR=' . escapeshellarg($content) . ' ';

    $cmd = $env_prefix . escapeshellarg($wp_scripts) . ' build --config '
         . escapeshellarg($webpack_config);

    // If using npx (space in command), don't escapeshellarg the whole thing
    if (strpos($wp_scripts, ' ') !== false) {
      $cmd = $env_prefix . $wp_scripts . ' build --config '
           . escapeshellarg($webpack_config);
    }

    WP_CLI::log('Running wp-scripts build…');
    WP_CLI::debug("wp-scripts resolved to: $wp_scripts", 'handoff');
    $exit = $this->run($cmd, $run_cwd);

    if ($exit === 0) {
      WP_CLI::success('Build finished.');
    } else {
      WP_CLI::error('Build failed (exit code ' . $exit . ').');
    }
  }

  /**
   * Validate a component (or all) for breaking property changes.
   *
   * ## OPTIONS
   *
   * [<component>]
   * : Component name to validate.
   *
   * [--all]
   * : Validate all components.
   *
   * [--api-url=<url>]
   * : Override the Handoff API URL from config.
   *
   * [--username=<user>]
   * : Basic-auth username.
   *
   * [--password=<pass>]
   * : Basic-auth password.
   *
   * ## EXAMPLES
   *
   *     wp handoff validate hero-article
   *     wp handoff validate --all
   *
   * @subcommand validate
   */
  public function validate($args, $assoc_args) {
    $cmd = $this->base_cmd($assoc_args);

    if (!empty($assoc_args['all'])) {
      $cmd .= ' --validate-all';
    } elseif (!empty($args[0])) {
      $cmd .= ' --validate ' . escapeshellarg($args[0]);
    } else {
      WP_CLI::error('Provide a component name or use --all.');
      return;
    }

    $exit = $this->run($cmd);

    if ($exit === 0) {
      WP_CLI::success('Validation passed.');
    } else {
      WP_CLI::error('Validation failed (exit code ' . $exit . ').');
    }
  }

  /**
   * Initialize config in the database.
   *
   * ## OPTIONS
   *
   * [--api-url=<url>]
   * : Handoff API URL.
   *
   * [--force]
   * : Overwrite existing config.
   *
   * ## EXAMPLES
   *
   *     wp handoff init --api-url=https://demo.handoff.com
   *
   * @subcommand init
   */
  public function init($args, $assoc_args) {
    $existing = get_option('handoff_config', false);
    if ($existing !== false && empty($assoc_args['force'])) {
      WP_CLI::error('Config already exists in the database. Use --force to overwrite.');
      return;
    }

    $config = [
      'apiUrl'   => $assoc_args['api-url'] ?? 'http://localhost:4000',
      'themeDir' => get_stylesheet_directory(),
      'groups'   => new \stdClass(),
      'import'   => new \stdClass(),
    ];

    update_option('handoff_config', $config);
    WP_CLI::success('Config saved to database.');
  }

  /**
   * Export the current config from the database as JSON.
   *
   * ## EXAMPLES
   *
   *     wp handoff config export
   *     wp handoff config export > handoff-wp.config.json
   *
   * @subcommand config export
   */
  public function config_export($args, $assoc_args) {
    $config = $this->get_config();
    WP_CLI::line(json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  }

  /**
   * Import config from a JSON file into the database.
   *
   * ## OPTIONS
   *
   * <file>
   * : Path to the JSON config file.
   *
   * ## EXAMPLES
   *
   *     wp handoff config import handoff-wp.config.json
   *
   * @subcommand config import
   */
  public function config_import($args, $assoc_args) {
    if (empty($args[0])) {
      WP_CLI::error('Please provide a path to the JSON config file.');
      return;
    }

    $path = $args[0];
    if (!file_exists($path)) {
      WP_CLI::error("File not found: $path");
      return;
    }

    $data = json_decode(file_get_contents($path), true);
    if (!is_array($data)) {
      WP_CLI::error('Invalid JSON in config file.');
      return;
    }

    update_option('handoff_config', $data);
    WP_CLI::success('Config imported to database.');
  }

  /**
   * Interactive wizard to configure dynamic arrays for a component.
   *
   * ## OPTIONS
   *
   * [<component>]
   * : Component to configure.
   *
   * [--list]
   * : List available components instead.
   *
   * [--api-url=<url>]
   * : Override the Handoff API URL from config.
   *
   * [--username=<user>]
   * : Basic-auth username.
   *
   * [--password=<pass>]
   * : Basic-auth password.
   *
   * ## EXAMPLES
   *
   *     wp handoff wizard grid-three-column
   *     wp handoff wizard --list
   *
   * @subcommand wizard
   */
  public function wizard($args, $assoc_args) {
    $cmd = $this->base_cmd($assoc_args) . ' wizard';

    if (!empty($assoc_args['list'])) {
      $cmd .= ' --list';
    }
    if (!empty($args[0])) {
      $cmd .= ' ' . escapeshellarg($args[0]);
    }

    $exit = $this->run($cmd);

    if ($exit !== 0) {
      WP_CLI::error('Wizard failed (exit code ' . $exit . ').');
    }
  }

  /**
   * Show the current status of compiled blocks and configuration.
   *
   * ## EXAMPLES
   *
   *     wp handoff status
   *
   * @subcommand status
   */
  public function status($args, $assoc_args) {
    $content    = $this->content_dir();
    $build_dir  = $content . '/build/';
    $blocks_dir = $content . '/blocks/';

    // Config summary
    $config = $this->get_config();
    WP_CLI::log('--- Configuration (wp_options) ---');
    WP_CLI::log('API URL:     ' . ($config['apiUrl'] ?? '(not set)'));
    WP_CLI::log('Content Dir: ' . HANDOFF_CONTENT_DIR);
    WP_CLI::log('Theme Dir:   ' . ($config['themeDir'] ?? '(not set)'));
    if (!empty($config['groups']) && (is_array($config['groups']) || is_object($config['groups']))) {
      $groups = (array) $config['groups'];
      if (count($groups) > 0) {
        WP_CLI::log('Groups:      ' . implode(', ', array_map(
          fn($k, $v) => "$k ($v)",
          array_keys($groups),
          array_values($groups)
        )));
      }
    }

    // Source blocks
    WP_CLI::log('');
    WP_CLI::log('--- Source Blocks (blocks/) ---');
    if (is_dir($blocks_dir)) {
      $source_blocks = array_filter(scandir($blocks_dir), fn($f) => $f !== '.' && $f !== '..' && $f !== '.gitkeep' && is_dir($blocks_dir . $f));
      WP_CLI::log('Count: ' . count($source_blocks));
    } else {
      WP_CLI::log('Count: 0 (blocks/ directory not found)');
    }

    // Built blocks
    WP_CLI::log('');
    WP_CLI::log('--- Built Blocks (build/) ---');
    if (is_dir($build_dir)) {
      $built = [];
      foreach (scandir($build_dir) as $item) {
        if ($item === '.' || $item === '..' || $item === '.gitkeep') continue;
        $block_json = $build_dir . $item . '/block.json';
        if (file_exists($block_json)) {
          $meta = json_decode(file_get_contents($block_json), true);
          $title = $meta['title'] ?? $item;
          $name  = $meta['name'] ?? '';
          $handoff_url = $meta['__handoff']['handoffUrl'] ?? '';
          $figma_url   = $meta['__handoff']['figmaUrl'] ?? '';
          $built[] = [
            'Block'   => $name,
            'Title'   => $title,
            'Handoff' => $handoff_url ? 'Yes' : '',
            'Figma'   => $figma_url ? 'Yes' : '',
          ];
        }
      }
      if (count($built) > 0) {
        WP_CLI\Utils\format_items('table', $built, ['Block', 'Title', 'Handoff', 'Figma']);
      } else {
        WP_CLI::log('No built blocks found. Run `wp handoff build` after compiling.');
      }
    } else {
      WP_CLI::log('build/ directory not found. Run `wp handoff build`.');
    }
  }
}

WP_CLI::add_command('handoff', 'Handoff_CLI');
