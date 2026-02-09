<?php
/**
 * Template resolution: theme first, then plugin fallback.
 */

if (! defined('ABSPATH')) {
	exit;
}

/**
 * Load a template part (theme first, then plugin fallback).
 * Mirrors get_template_part() but supports plugin fallback.
 *
 * @param string $slug Template slug (e.g. 'template-parts/vehicles/content').
 * @param string $name Template name (e.g. 'camper' → loads content-camper.php).
 * @param array  $args Arguments passed to the template.
 */
function ridebalkans_blocks_load_template_part($slug, $name = null, $args = array())
{
	$templates = array();
	if ($name) {
		$templates[] = "{$slug}-{$name}.php";
	}
	$templates[] = "{$slug}.php";

	$template = locate_template($templates, false, false);
	if ($template) {
		load_template($template, false, $args);
		return;
	}

	// Plugin fallback: slug "template-parts/vehicles/content" + name "camper" → plugin "templates/vehicles/content-camper.php".
	$relative = str_replace('template-parts/', '', $slug);
	$dir      = dirname($relative);
	$dir      = $dir === '.' ? '' : $dir . '/';
	foreach ($templates as $t) {
		$path = RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'templates/' . $dir . basename($t);
		if (file_exists($path)) {
			if (! empty($args)) {
				// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
				$args = (array) $args;
				extract($args, EXTR_SKIP);
			}
			include $path;
			return;
		}
	}
}

/**
 * Get path to vehicle specs template (theme first, then plugin).
 *
 * @param string $vehicle_type campervan, offroad, motorcycle.
 * @return string Path to template file or empty string.
 */
function ridebalkans_blocks_get_vehicle_specs_template($vehicle_type)
{
	$name = sanitize_key($vehicle_type);
	$theme_path = get_theme_file_path("template-parts/vehicle-specs/{$name}.php");
	if ($theme_path && file_exists($theme_path)) {
		return $theme_path;
	}
	$generic = get_theme_file_path('template-parts/vehicle-specs/generic.php');
	if ($generic && file_exists($generic)) {
		return $generic;
	}
	$plugin_path = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "templates/vehicle-specs/{$name}.php";
	if (file_exists($plugin_path)) {
		return $plugin_path;
	}
	$plugin_generic = RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'templates/vehicle-specs/generic.php';
	if (file_exists($plugin_generic)) {
		return $plugin_generic;
	}
	return '';
}
