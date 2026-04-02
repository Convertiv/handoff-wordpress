<?php
/**
 * WP-CLI commands for the Handoff Blocks plugin.
 *
 * Wraps the Node.js compiler so all compilation and build steps
 * can be run via `wp handoff <subcommand>`.
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
   * Run a node command with streaming output.
   *
   * @param string $cmd  Full shell command.
   * @return int         Exit code.
   */
  private function run(string $cmd): int {
    WP_CLI::debug("Running: $cmd", 'handoff');
    $proc = proc_open($cmd, [
      0 => STDIN,
      1 => STDOUT,
      2 => STDERR,
    ], $pipes, HANDOFF_BLOCKS_PATH);

    if (!is_resource($proc)) {
      WP_CLI::error('Failed to launch process.');
      return 1;
    }

    return proc_close($proc);
  }

  /**
   * Build the base compiler command with optional shared flags.
   */
  private function base_cmd(array $assoc_args = []): string {
    $node = $this->node_bin();
    $bin  = $this->compiler_bin();
    $cmd  = escapeshellarg($node) . ' ' . escapeshellarg($bin);

    if (!empty($assoc_args['api-url'])) {
      $cmd .= ' --api-url ' . escapeshellarg($assoc_args['api-url']);
    }
    if (!empty($assoc_args['output'])) {
      $cmd .= ' --output ' . escapeshellarg($assoc_args['output']);
    }
    if (!empty($assoc_args['username'])) {
      $cmd .= ' --username ' . escapeshellarg($assoc_args['username']);
    }
    if (!empty($assoc_args['password'])) {
      $cmd .= ' --password ' . escapeshellarg($assoc_args['password']);
    }

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
   * : Override the output directory from config.
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
   * Run the webpack build (wp-scripts) to produce production assets.
   *
   * ## EXAMPLES
   *
   *     wp handoff build
   *
   * @subcommand build
   */
  public function build($args, $assoc_args) {
    $cmd = 'npm run build';
    WP_CLI::log('Running wp-scripts build...');
    $exit = $this->run($cmd);

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
   * Initialize a handoff-wp.config.json in the plugin directory.
   *
   * ## OPTIONS
   *
   * [--api-url=<url>]
   * : Handoff API URL.
   *
   * [--force]
   * : Overwrite existing config file.
   *
   * ## EXAMPLES
   *
   *     wp handoff init --api-url=https://demo.handoff.com
   *
   * @subcommand init
   */
  public function init($args, $assoc_args) {
    $cmd = $this->base_cmd($assoc_args) . ' init';

    if (!empty($assoc_args['api-url'])) {
      $cmd .= ' --api-url ' . escapeshellarg($assoc_args['api-url']);
    }
    if (!empty($assoc_args['force'])) {
      $cmd .= ' --force';
    }

    $exit = $this->run($cmd);

    if ($exit === 0) {
      WP_CLI::success('Config file created.');
    } else {
      WP_CLI::error('Init failed (exit code ' . $exit . ').');
    }
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
    $build_dir  = HANDOFF_BLOCKS_PATH . 'build/';
    $blocks_dir = HANDOFF_BLOCKS_PATH . 'blocks/';
    $config_file = HANDOFF_BLOCKS_PATH . 'handoff-wp.config.json';

    // Config summary
    if (file_exists($config_file)) {
      $config = json_decode(file_get_contents($config_file), true);
      WP_CLI::log('--- Configuration ---');
      WP_CLI::log('API URL:   ' . ($config['apiUrl'] ?? '(not set)'));
      WP_CLI::log('Output:    ' . ($config['output'] ?? '(not set)'));
      WP_CLI::log('Theme Dir: ' . ($config['themeDir'] ?? '(not set)'));
      if (!empty($config['groups'])) {
        WP_CLI::log('Groups:    ' . implode(', ', array_map(
          fn($k, $v) => "$k ($v)",
          array_keys($config['groups']),
          array_values($config['groups'])
        )));
      }
    } else {
      WP_CLI::warning('No handoff-wp.config.json found. Run `wp handoff init` first.');
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
