<?php
/**
 * Block registration for breadcrumbs.
 */

if (!defined('ABSPATH')) {
	exit;
}

if (!function_exists('convertiv_register_breadcrumbs_block')) :
	/**
	 * Registers the dynamic breadcrumbs block.
	 *
	 * @return void
	 */
	function convertiv_register_breadcrumbs_block()
	{
		$block_dir = CONVERTIV_BREADCRUMBS_PLUGIN_DIR . 'blocks/breadcrumbs';

		if (file_exists($block_dir . '/block.json')) {
			register_block_type($block_dir);
		}
	}
endif;

add_action('init', 'convertiv_register_breadcrumbs_block');
