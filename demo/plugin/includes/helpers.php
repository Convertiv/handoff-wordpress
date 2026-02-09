<?php
/**
 * Shared Helper Functions for RideBalkans Blocks
 *
 * @package RideBalkans\Blocks
 */

if (! defined('ABSPATH')) {
	exit;
}

// =============================================================================
// ATTRIBUTE HELPERS
// =============================================================================

/**
 * Get block attributes with defaults.
 *
 * @param array $attributes Block attributes from render callback.
 * @param array $defaults   Default attribute values.
 * @return array Merged attributes.
 */
function ridebalkans_get_block_attrs($attributes, $defaults) {
	return wp_parse_args($attributes, $defaults);
}

/**
 * Get a single attribute with type validation.
 *
 * @param array  $attributes Block attributes.
 * @param string $key        Attribute key.
 * @param mixed  $default    Default value.
 * @param string $type       Expected type ('string', 'int', 'float', 'bool', 'array').
 * @return mixed Validated attribute value.
 */
function ridebalkans_get_attr($attributes, $key, $default = null, $type = 'string') {
	$value = isset($attributes[$key]) ? $attributes[$key] : $default;

	switch ($type) {
		case 'int':
		case 'integer':
			return is_numeric($value) ? (int) $value : (int) $default;
		case 'float':
		case 'double':
			return is_numeric($value) ? (float) $value : (float) $default;
		case 'bool':
		case 'boolean':
			return filter_var($value, FILTER_VALIDATE_BOOLEAN);
		case 'array':
			return is_array($value) ? $value : (array) $default;
		case 'string':
		default:
			return is_string($value) ? $value : (string) $default;
	}
}

// =============================================================================
// CLASS HELPERS
// =============================================================================

/**
 * Build block wrapper classes.
 *
 * @param string $base_class Base class name (e.g., 'wp-block-ridebalkans-extras').
 * @param array  $modifiers  Array of modifier classes or key-value pairs.
 * @return string Space-separated class string.
 */
function ridebalkans_block_classes($base_class, $modifiers = []) {
	$classes = [$base_class];

	foreach ($modifiers as $key => $value) {
		if (is_numeric($key)) {
			// Simple modifier (e.g., 'is-active')
			if (! empty($value)) {
				$classes[] = $value;
			}
		} else {
			// Key-value modifier (e.g., 'layout' => 'grid')
			if (! empty($value)) {
				$classes[] = "{$key}-{$value}";
			}
		}
	}

	return implode(' ', array_filter($classes));
}

/**
 * Build BEM-style class name.
 *
 * @param string $block    Block name.
 * @param string $element  Element name (optional).
 * @param string $modifier Modifier name (optional).
 * @return string BEM class name.
 */
function ridebalkans_bem($block, $element = '', $modifier = '') {
	$class = "rb-{$block}";
	
	if ($element) {
		$class .= "__{$element}";
	}
	
	if ($modifier) {
		$class .= "--{$modifier}";
	}
	
	return $class;
}

// =============================================================================
// SCHEMA.ORG HELPERS
// =============================================================================

/**
 * Output JSON-LD schema markup.
 *
 * @param array $schema Schema data array.
 * @return void
 */
function ridebalkans_output_schema($schema) {
	if (empty($schema)) {
		return;
	}

	printf(
		'<script type="application/ld+json">%s</script>',
		wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
	);
}

/**
 * Build FAQ schema.
 *
 * @param array $items Array of FAQ items with 'question' and 'answer' keys.
 * @return array Schema.org FAQPage schema.
 */
function ridebalkans_build_faq_schema($items) {
	if (empty($items)) {
		return [];
	}

	$main_entity = [];

	foreach ($items as $item) {
		if (empty($item['question']) || empty($item['answer'])) {
			continue;
		}

		$main_entity[] = [
			'@type'          => 'Question',
			'name'           => wp_strip_all_tags($item['question']),
			'acceptedAnswer' => [
				'@type' => 'Answer',
				'text'  => wp_strip_all_tags($item['answer']),
			],
		];
	}

	if (empty($main_entity)) {
		return [];
	}

	return [
		'@context'   => 'https://schema.org',
		'@type'      => 'FAQPage',
		'mainEntity' => $main_entity,
	];
}

/**
 * Build Product schema for vehicles/rentals.
 *
 * @param array $items Array of product items.
 * @return array Schema.org ItemList schema.
 */
function ridebalkans_build_product_schema($items) {
	if (empty($items)) {
		return [];
	}

	$list_items = [];
	$position   = 1;

	foreach ($items as $item) {
		$list_item = [
			'@type'    => 'ListItem',
			'position' => $position,
			'item'     => [
				'@type' => 'Product',
				'name'  => $item['name'] ?? '',
			],
		];

		if (! empty($item['description'])) {
			$list_item['item']['description'] = wp_strip_all_tags($item['description']);
		}

		if (! empty($item['image'])) {
			$list_item['item']['image'] = $item['image'];
		}

		if (! empty($item['url'])) {
			$list_item['item']['url'] = $item['url'];
		}

		if (! empty($item['price'])) {
			$list_item['item']['offers'] = [
				'@type'         => 'Offer',
				'price'         => $item['price'],
				'priceCurrency' => $item['currency'] ?? 'EUR',
			];
		}

		$list_items[] = $list_item;
		$position++;
	}

	return [
		'@context'        => 'https://schema.org',
		'@type'           => 'ItemList',
		'itemListElement' => $list_items,
	];
}

// =============================================================================
// SVG HELPERS
// =============================================================================

/**
 * Sanitize SVG markup for safe output.
 *
 * @param string $svg SVG markup string.
 * @return string Sanitized SVG.
 */
function ridebalkans_sanitize_svg($svg) {
	if (empty($svg)) {
		return '';
	}

	$allowed_tags = [
		'svg'      => [
			'xmlns'        => true,
			'viewbox'      => true,
			'width'        => true,
			'height'       => true,
			'fill'         => true,
			'stroke'       => true,
			'stroke-width' => true,
			'class'        => true,
			'aria-hidden'  => true,
			'role'         => true,
		],
		'path'     => [
			'd'            => true,
			'fill'         => true,
			'stroke'       => true,
			'stroke-width' => true,
		],
		'circle'   => [
			'cx'     => true,
			'cy'     => true,
			'r'      => true,
			'fill'   => true,
			'stroke' => true,
		],
		'rect'     => [
			'x'      => true,
			'y'      => true,
			'width'  => true,
			'height' => true,
			'rx'     => true,
			'ry'     => true,
			'fill'   => true,
			'stroke' => true,
		],
		'line'     => [
			'x1'           => true,
			'y1'           => true,
			'x2'           => true,
			'y2'           => true,
			'stroke'       => true,
			'stroke-width' => true,
		],
		'polyline' => [
			'points' => true,
			'fill'   => true,
			'stroke' => true,
		],
		'polygon'  => [
			'points' => true,
			'fill'   => true,
			'stroke' => true,
		],
		'g'        => [
			'fill'      => true,
			'stroke'    => true,
			'transform' => true,
		],
	];

	return wp_kses($svg, $allowed_tags);
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get posts with caching.
 *
 * @param array  $args      WP_Query arguments.
 * @param string $cache_key Transient cache key.
 * @param int    $expiry    Cache expiration in seconds (default: 1 hour).
 * @return array Array of post objects.
 */
function ridebalkans_get_posts_cached($args, $cache_key, $expiry = HOUR_IN_SECONDS) {
	$cached = get_transient($cache_key);

	if (false !== $cached) {
		return $cached;
	}

	$query = new WP_Query($args);
	$posts = $query->posts;

	set_transient($cache_key, $posts, $expiry);

	return $posts;
}

/**
 * Get ACF field with fallback.
 *
 * @param string $field_name Field name.
 * @param mixed  $post_id    Post ID or 'option' for options page.
 * @param mixed  $default    Default value if field is empty.
 * @return mixed Field value or default.
 */
function ridebalkans_get_field($field_name, $post_id = false, $default = null) {
	if (! function_exists('get_field')) {
		return $default;
	}

	$value = get_field($field_name, $post_id);

	return ! empty($value) ? $value : $default;
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

/**
 * Generate unique block ID.
 *
 * @param string $prefix ID prefix.
 * @return string Unique ID.
 */
function ridebalkans_unique_id($prefix = 'rb-') {
	return wp_unique_id($prefix);
}

/**
 * Render a button with optional icon.
 *
 * @param array $args Button arguments.
 * @return string Button HTML.
 */
function ridebalkans_render_button($args) {
	$defaults = [
		'text'          => __('Submit', 'ridebalkans'),
		'icon'          => '',
		'icon_position' => 'after',
		'type'          => 'submit',
		'class'         => '',
		'attributes'    => [],
	];

	$args = wp_parse_args($args, $defaults);

	$icon_html = '';
	if (! empty($args['icon'])) {
		$icon_html = sprintf(
			'<span class="rb-button__icon">%s</span>',
			ridebalkans_sanitize_svg($args['icon'])
		);
	}

	$text_html = sprintf(
		'<span class="rb-button__text">%s</span>',
		esc_html($args['text'])
	);

	$content = $args['icon_position'] === 'before'
		? $icon_html . $text_html
		: $text_html . $icon_html;

	$attrs = [];
	foreach ($args['attributes'] as $key => $value) {
		$attrs[] = sprintf('%s="%s"', esc_attr($key), esc_attr($value));
	}

	return sprintf(
		'<button type="%s" class="rb-button %s" %s>%s</button>',
		esc_attr($args['type']),
		esc_attr($args['class']),
		implode(' ', $attrs),
		$content
	);
}

/**
 * Get image with srcset for responsive loading.
 *
 * @param int    $attachment_id Attachment ID.
 * @param string $size          Image size.
 * @param array  $attr          Additional attributes.
 * @return string Image HTML.
 */
function ridebalkans_get_responsive_image($attachment_id, $size = 'large', $attr = []) {
	$default_attr = [
		'loading' => 'lazy',
		'decoding' => 'async',
	];

	$attr = wp_parse_args($attr, $default_attr);

	return wp_get_attachment_image($attachment_id, $size, false, $attr);
}
