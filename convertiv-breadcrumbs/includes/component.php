<?php
/**
 * Breadcrumb component helpers.
 */

if (!defined('ABSPATH')) {
	exit;
}

if (!function_exists('convertiv_get_breadcrumbs_html')) :
	/**
	 * Returns the breadcrumb component HTML.
	 *
	 * This is the function to call from other dynamic block render templates
	 * (for example Hero block) when breadcrumbs are needed without InnerBlocks.
	 *
	 * @param array $args Optional component arguments.
	 * @return string
	 */
	function convertiv_get_breadcrumbs_html($args = array())
	{
		$defaults = array(
			'show_on_front_page' => false,
			'container_tag'      => 'nav',
			'container_class'    => 'c-breadcrumbs',
			'list_class'         => 'c-breadcrumbs__list',
			'aria_label'         => __('Breadcrumb', 'convertiv-breadcrumbs'),
		);
		$args = wp_parse_args($args, $defaults);

		if (empty($args['show_on_front_page']) && (is_front_page() || is_home())) {
			return '';
		}

		if (!function_exists('convertiv_breadcrumbs')) {
			return '';
		}

		ob_start();
		convertiv_breadcrumbs();
		$items = trim((string) ob_get_clean());

		if ($items === '') {
			return '';
		}

		$container_tag = tag_escape((string) $args['container_tag']);
		$container_class = trim((string) $args['container_class']);
		$list_class = trim((string) $args['list_class']);
		$aria_label = (string) $args['aria_label'];

		$html = sprintf(
			'<%1$s class="%2$s" aria-label="%3$s"><ol class="%4$s">%5$s</ol></%1$s>',
			$container_tag,
			esc_attr($container_class),
			esc_attr($aria_label),
			esc_attr($list_class),
			$items
		);

		return apply_filters('convertiv_breadcrumbs_component_html', $html, $args, $items);
	}
endif;

if (!function_exists('convertiv_the_breadcrumbs')) :
	/**
	 * Echoes breadcrumb component HTML.
	 *
	 * @param array $args Optional component arguments.
	 * @return void
	 */
	function convertiv_the_breadcrumbs($args = array())
	{
		echo convertiv_get_breadcrumbs_html($args); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
endif;

if (!function_exists('convertiv_render_breadcrumbs_for_block')) :
	/**
	 * Returns breadcrumb HTML for a dynamic block based on block attributes.
	 *
	 * This helper keeps render.php files small by handling:
	 * - show/hide attribute checks
	 * - optional position matching
	 * - forwarding args to the breadcrumb component renderer
	 *
	 * @param array $attributes Block attributes.
	 * @param array $args       Optional helper arguments.
	 * @return string
	 */
	function convertiv_render_breadcrumbs_for_block($attributes = array(), $args = array())
	{
		$defaults = array(
			'show_attribute'      => 'showBreadcrumbs',
			'position_attribute'  => 'breadcrumbsPosition',
			'position'            => '',
			'show_on_front_page'  => false,
			'component_args'      => array(),
		);
		$args = wp_parse_args($args, $defaults);

		$show_attribute = (string) $args['show_attribute'];
		$is_enabled = isset($attributes[$show_attribute]) ? (bool) $attributes[$show_attribute] : false;
		if (!$is_enabled) {
			return '';
		}

		$expected_position = (string) $args['position'];
		if ($expected_position !== '') {
			$position_attribute = (string) $args['position_attribute'];
			$current_position = isset($attributes[$position_attribute]) ? (string) $attributes[$position_attribute] : '';
			if ($current_position !== $expected_position) {
				return '';
			}
		}

		$component_args = is_array($args['component_args']) ? $args['component_args'] : array();
		$component_args['show_on_front_page'] = !empty($args['show_on_front_page']);

		return convertiv_get_breadcrumbs_html($component_args);
	}
endif;
