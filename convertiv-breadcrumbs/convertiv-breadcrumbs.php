<?php
/**
 * Plugin Name: Convertiv Breadcrumbs
 * Description: Provides reusable breadcrumb functionality and a dynamic breadcrumbs block.
 * Version: 0.1.0
 * Author: Convertiv
 * Text Domain: convertiv-breadcrumbs
 */

if (!defined('ABSPATH')) {
	exit;
}

define('CONVERTIV_BREADCRUMBS_PLUGIN_FILE', __FILE__);
define('CONVERTIV_BREADCRUMBS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CONVERTIV_BREADCRUMBS_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once CONVERTIV_BREADCRUMBS_PLUGIN_DIR . 'breadcrumbs.php';
require_once CONVERTIV_BREADCRUMBS_PLUGIN_DIR . 'includes/component.php';
require_once CONVERTIV_BREADCRUMBS_PLUGIN_DIR . 'includes/block.php';
