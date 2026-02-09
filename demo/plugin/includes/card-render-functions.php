<?php

/**
 * Shared Card Rendering Functions
 *
 * Common rendering logic used by both Loop and Loop Card blocks.
 * This file should be included once and provides all card element rendering.
 *
 * @package RideBalkans_Blocks
 */

if (! defined('ABSPATH')) {
	exit;
}

// Prevent multiple inclusions
if (defined('RIDEBALKANS_CARD_FUNCTIONS_LOADED')) {
	return;
}
define('RIDEBALKANS_CARD_FUNCTIONS_LOADED', true);

/**
 * Default visibility settings for card elements.
 *
 * @return array Default visibility values.
 */
function ridebalkans_card_get_default_visibility()
{
	return array(
		'image'        => true,
		'badge'        => false,
		'categories'   => false,
		'meta'         => true,
		'title'        => true,
		'excerpt'      => true,
		'readMore'     => false,
		'customFields' => true,
		'date'         => true,
		'author'       => false,
	);
}

/**
 * Default card element order.
 * Note: Badge is now part of the image element (renders inside image container).
 *
 * @return array Default element order.
 */
function ridebalkans_card_get_default_element_order()
{
	return array('image', 'categories', 'meta', 'title', 'excerpt', 'customFields', 'readMore');
}

/**
 * Helper to convert value to boolean, handling string "false".
 *
 * @param mixed $value Value to convert.
 * @return bool
 */
function ridebalkans_card_to_bool($value)
{
	if (is_string($value)) {
		return $value === 'true' || $value === '1';
	}
	return (bool) $value;
}

/**
 * Parse and sanitize card attributes.
 *
 * @param array $attributes Raw block attributes.
 * @return array Sanitized card configuration.
 */
function ridebalkans_card_parse_attributes($attributes)
{
	$defaults = array(
		'cardStyle'              => 'default',
		'cardElementOrder'       => ridebalkans_card_get_default_element_order(),
		'visibility'             => ridebalkans_card_get_default_visibility(),
		'imageSize'              => 'large',
		'imageAspectRatio'       => '16/9',
		'badgePosition'          => 'top-left', // Badge text/style now from post meta
		'titleTag'               => 'h3',
		'excerptLength'          => 20,
		'readMoreText'           => __('Read More', 'ridebalkans'),
		'customFields'           => array(),
		'customFieldsLayout'     => 'block',
		'customFieldsColumns'    => 2,
		'linkEntireCard'         => false,
		'hoverTransitionDuration' => 200,
		'hoverTransitionTiming'  => 'ease',
	);

	$attributes = wp_parse_args($attributes, $defaults);

	// Parse visibility with defaults
	$visibility = is_array($attributes['visibility'])
		? wp_parse_args($attributes['visibility'], ridebalkans_card_get_default_visibility())
		: ridebalkans_card_get_default_visibility();

	return array(
		'card_style'         => sanitize_key($attributes['cardStyle']),
		'card_element_order' => is_array($attributes['cardElementOrder'])
			? array_map('sanitize_key', $attributes['cardElementOrder'])
			: ridebalkans_card_get_default_element_order(),
		'show_image'         => ridebalkans_card_to_bool($visibility['image']),
		'show_badge'         => ridebalkans_card_to_bool($visibility['badge']),
		'show_categories'    => ridebalkans_card_to_bool($visibility['categories']),
		'show_meta'          => ridebalkans_card_to_bool($visibility['meta']),
		'show_title'         => ridebalkans_card_to_bool($visibility['title']),
		'show_excerpt'       => ridebalkans_card_to_bool($visibility['excerpt']),
		'show_read_more'     => ridebalkans_card_to_bool($visibility['readMore']),
		'show_custom_fields' => ridebalkans_card_to_bool($visibility['customFields']),
		'show_date'          => ridebalkans_card_to_bool($visibility['date']),
		'show_author'        => ridebalkans_card_to_bool($visibility['author']),
		'image_size'         => sanitize_key($attributes['imageSize']),
		'image_aspect_ratio' => sanitize_text_field($attributes['imageAspectRatio']),
		'badge_position'     => in_array($attributes['badgePosition'], array('top-left', 'top-right', 'bottom-left', 'bottom-right'), true)
			? $attributes['badgePosition'] : 'top-left',
		'title_tag'          => in_array($attributes['titleTag'], array('h2', 'h3', 'h4', 'p'), true)
			? $attributes['titleTag'] : 'h3',
		'excerpt_length'     => max(5, min(100, (int) $attributes['excerptLength'])),
		'read_more_text'     => sanitize_text_field($attributes['readMoreText']),
		'custom_fields'      => is_array($attributes['customFields']) ? $attributes['customFields'] : array(),
		'custom_fields_layout' => in_array($attributes['customFieldsLayout'], array('block', 'inline'), true)
			? $attributes['customFieldsLayout'] : 'block',
		'custom_fields_columns' => max(2, min(4, (int) $attributes['customFieldsColumns'])),
		'link_entire_card'   => (bool) $attributes['linkEntireCard'],
		'hover_duration'     => max(0, min(1000, (int) $attributes['hoverTransitionDuration'])),
		'hover_timing'       => in_array($attributes['hoverTransitionTiming'], array('ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'), true)
			? $attributes['hoverTransitionTiming'] : 'ease',
	);
}

/**
 * Render a complete card.
 *
 * @param int   $post_id Post ID to render.
 * @param array $args    Parsed card arguments from ridebalkans_card_parse_attributes().
 * @param array $options Additional rendering options.
 */
function ridebalkans_card_render($post_id, $args, $options = array())
{
	$defaults = array(
		'wrapper_class' => '',
		'class_prefix'  => 'rb-loop-card',
	);
	$options = wp_parse_args($options, $defaults);

	$prefix       = $options['class_prefix'];
	$permalink    = get_permalink($post_id);
	$title        = get_the_title($post_id);
	$has_thumb    = has_post_thumbnail($post_id);
	$link_entire  = $args['link_entire_card'];

	// Card classes
	$card_classes = array(
		$prefix,
		$prefix . '--' . $args['card_style'],
	);

	if ($link_entire) {
		$card_classes[] = $prefix . '--linked';
	}

	// Build inline styles
	$styles = array();
	if ($args['image_aspect_ratio'] !== 'auto') {
		$styles[] = '--card-aspect-ratio: ' . esc_attr($args['image_aspect_ratio']);
	}
	$styles[] = '--card-hover-duration: ' . esc_attr($args['hover_duration']) . 'ms';
	$styles[] = '--card-hover-timing: ' . esc_attr($args['hover_timing']);
	$style_attr = implode('; ', $styles) . ';';

	// Container tag
	$card_tag = $link_entire ? 'a' : 'article';
	$card_attrs = $link_entire ? ' href="' . esc_url($permalink) . '"' : '';

	// Content elements (grouped inside content div)
	$content_elements = array('categories', 'meta', 'title', 'excerpt', 'customfields', 'readmore');
	$content_started = false;
?>
	<<?php echo esc_attr($card_tag); ?> class="<?php echo esc_attr(implode(' ', $card_classes)); ?>" style="<?php echo esc_attr($style_attr); ?>" <?php echo $card_attrs; ?>>
		<?php
		foreach ($args['card_element_order'] as $element) {
			$element_lower = strtolower($element);
			$is_content_element = in_array($element_lower, $content_elements, true);

			// Start content div if needed
			if ($is_content_element && ! $content_started) {
				$content_started = true;
				echo '<div class="' . esc_attr($prefix) . '__content">';
			}

			// Close content div if we hit a non-content element after content started
			if (! $is_content_element && $content_started) {
				echo '</div>';
				$content_started = false;
			}

			switch ($element_lower) {
				case 'image':
					ridebalkans_card_render_image($post_id, $args, $prefix, $permalink, $has_thumb, $link_entire);
					break;

				// Badge is now part of image element - skip if in old element order
				case 'badge':
					break;

				case 'categories':
					if ($args['show_categories']) {
						ridebalkans_card_render_categories($post_id, $prefix);
					}
					break;

				case 'meta':
					if ($args['show_meta'] && ($args['show_date'] || $args['show_author'])) {
						ridebalkans_card_render_meta($post_id, $args, $prefix);
					}
					break;

				case 'title':
					if ($args['show_title']) {
						ridebalkans_card_render_title($title, $permalink, $args['title_tag'], $prefix, $link_entire);
					}
					break;

				case 'excerpt':
					if ($args['show_excerpt']) {
						ridebalkans_card_render_excerpt($post_id, $args['excerpt_length'], $prefix);
					}
					break;

				case 'customfields':
					if ($args['show_custom_fields'] && ! empty($args['custom_fields'])) {
						ridebalkans_card_render_custom_fields(
							$post_id,
							$args['custom_fields'],
							$prefix,
							$args['custom_fields_layout'],
							$args['custom_fields_columns']
						);
					}
					break;

				case 'readmore':
					if ($args['show_read_more'] && ! $link_entire) {
						ridebalkans_card_render_readmore($permalink, $args['read_more_text'], $prefix);
					}
					break;
			}
		}

		// Close content div if still open
		if ($content_started) {
			echo '</div>';
		}

		// Link overlay for linked cards
		if ($link_entire) {
			echo '<span class="' . esc_attr($prefix) . '__link-overlay"></span>';
		}
		?>
	</<?php echo esc_attr($card_tag); ?>>
<?php
}

/**
 * Get badge data from post meta (ACF field).
 *
 * @param int $post_id Post ID.
 * @return array|null Badge data with 'text' and 'color' keys, or null if no badge.
 */
function ridebalkans_card_get_badge($post_id)
{
	// Try ACF function first
	if (function_exists('get_field')) {
		$badge = get_field('badge', $post_id);
		if ($badge && ! empty($badge['text'])) {
			return array(
				'text'  => sanitize_text_field($badge['text']),
				'color' => in_array($badge['color'] ?? '', array('primary', 'secondary', 'success', 'warning', 'danger', 'dark', 'light'), true)
					? $badge['color'] : 'primary',
			);
		}
	}

	// Fallback to raw post meta
	$badge = get_post_meta($post_id, 'badge', true);
	if (is_array($badge) && ! empty($badge['text'])) {
		return array(
			'text'  => sanitize_text_field($badge['text']),
			'color' => in_array($badge['color'] ?? '', array('primary', 'secondary', 'success', 'warning', 'danger', 'dark', 'light'), true)
				? $badge['color'] : 'primary',
		);
	}

	return null;
}

/**
 * Render card image element.
 */
function ridebalkans_card_render_image($post_id, $args, $prefix, $permalink, $has_thumb, $link_entire)
{
	if (! $args['show_image'] || ! $has_thumb) {
		return;
	}

	$wrap_in_link = ! $link_entire;
	$badge = $args['show_badge'] ? ridebalkans_card_get_badge($post_id) : null;
?>
	<<?php echo $wrap_in_link ? 'a href="' . esc_url($permalink) . '"' : 'div'; ?> class="<?php echo esc_attr($prefix); ?>__image" <?php echo $wrap_in_link ? ' tabindex="-1" aria-hidden="true"' : ''; ?>>
		<?php echo get_the_post_thumbnail($post_id, $args['image_size'], array('class' => $prefix . '__img', 'loading' => 'lazy')); ?>
		<?php if ($args['card_style'] === 'overlay') : ?>
			<div class="<?php echo esc_attr($prefix); ?>__overlay"></div>
		<?php endif; ?>
		<?php if ($badge) : ?>
			<span class="<?php echo esc_attr($prefix); ?>__badge <?php echo esc_attr($prefix); ?>__badge--<?php echo esc_attr($badge['color']); ?> <?php echo esc_attr($prefix); ?>__badge--<?php echo esc_attr($args['badge_position']); ?>">
				<?php echo esc_html($badge['text']); ?>
			</span>
		<?php endif; ?>
	</<?php echo $wrap_in_link ? 'a' : 'div'; ?>>
<?php
}

/**
 * Render badge-only element (when no image).
 */
function ridebalkans_card_render_badge_only($post_id, $args, $prefix)
{
	$badge = ridebalkans_card_get_badge($post_id);
	if (! $badge) {
		return;
	}
?>
	<div class="<?php echo esc_attr($prefix); ?>__image <?php echo esc_attr($prefix); ?>__image--badge-only">
		<span class="<?php echo esc_attr($prefix); ?>__badge <?php echo esc_attr($prefix); ?>__badge--<?php echo esc_attr($badge['color']); ?> <?php echo esc_attr($prefix); ?>__badge--<?php echo esc_attr($args['badge_position']); ?>">
			<?php echo esc_html($badge['text']); ?>
		</span>
	</div>
<?php
}

/**
 * Render card categories/taxonomy element.
 * Works with any post type by detecting the primary taxonomy.
 */
function ridebalkans_card_render_categories($post_id, $prefix)
{
	$post_type = get_post_type($post_id);
	$terms = [];

	// For standard posts, use category
	if ($post_type === 'post') {
		$terms = get_the_category($post_id);
	} else {
		// For custom post types, get the first hierarchical taxonomy
		$taxonomies = get_object_taxonomies($post_type, 'objects');
		foreach ($taxonomies as $tax) {
			if ($tax->hierarchical && $tax->public) {
				$terms = get_the_terms($post_id, $tax->name);
				if ($terms && ! is_wp_error($terms)) {
					break;
				}
				$terms = [];
			}
		}
	}

	if (empty($terms) || is_wp_error($terms)) {
		return;
	}
?>
	<div class="<?php echo esc_attr($prefix); ?>__categories">
		<span class="<?php echo esc_attr($prefix); ?>__category"><?php echo esc_html($terms[0]->name); ?></span>
	</div>
<?php
}

/**
 * Render card meta element (date/author).
 */
function ridebalkans_card_render_meta($post_id, $args, $prefix)
{
?>
	<div class="<?php echo esc_attr($prefix); ?>__meta">
		<?php if ($args['show_date']) : ?>
			<time class="<?php echo esc_attr($prefix); ?>__date" datetime="<?php echo esc_attr(get_the_date('c', $post_id)); ?>">
				<?php echo esc_html(get_the_date('', $post_id)); ?>
			</time>
		<?php endif; ?>

		<?php if ($args['show_author']) :
			$author_id = get_post_field('post_author', $post_id);
			if ($author_id) :
		?>
				<span class="<?php echo esc_attr($prefix); ?>__author">
					<?php echo esc_html(get_the_author_meta('display_name', $author_id)); ?>
				</span>
		<?php endif;
		endif; ?>
	</div>
<?php
}

/**
 * Render card title element.
 */
function ridebalkans_card_render_title($title, $permalink, $tag, $prefix, $link_entire)
{
	$wrap_in_link = ! $link_entire;
?>
	<<?php echo esc_attr($tag); ?> class="<?php echo esc_attr($prefix); ?>__title">
		<?php if ($wrap_in_link) : ?>
			<a href="<?php echo esc_url($permalink); ?>">
			<?php endif; ?>
			<?php echo esc_html($title); ?>
			<?php if ($wrap_in_link) : ?>
			</a>
		<?php endif; ?>
	</<?php echo esc_attr($tag); ?>>
<?php
}

/**
 * Render card excerpt element.
 */
function ridebalkans_card_render_excerpt($post_id, $length, $prefix)
{
?>
	<p class="<?php echo esc_attr($prefix); ?>__excerpt">
		<?php echo esc_html(wp_trim_words(get_the_excerpt($post_id), $length, '...')); ?>
	</p>
<?php
}

/**
 * Render card read more element.
 */
function ridebalkans_card_render_readmore($permalink, $text, $prefix)
{
?>
	<a href="<?php echo esc_url($permalink); ?>" class="<?php echo esc_attr($prefix); ?>__readmore">
		<?php echo esc_html($text); ?>
		<svg class="<?php echo esc_attr($prefix); ?>__readmore-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M5 12h14M12 5l7 7-7 7" />
		</svg>
	</a>
<?php
}

/**
 * Render custom fields for a post.
 *
 * @param int    $post_id Post ID.
 * @param array  $fields  Custom field definitions.
 * @param string $prefix  CSS class prefix.
 * @param string $layout  Layout type: 'block' (stacked) or 'inline' (grid).
 * @param int    $columns Number of columns for inline layout (2-4).
 */
function ridebalkans_card_render_custom_fields($post_id, $fields, $prefix = 'rb-loop-card', $layout = 'block', $columns = 2)
{
	if (empty($fields)) {
		return;
	}

	// Check once if ACF is available (optimization)
	$has_acf = function_exists('get_field');

	$output_fields = array();
	$has_icons = false;

	foreach ($fields as $field) {
		if (empty($field['key'])) {
			continue;
		}

		// Get field value - support ACF and regular post meta
		$value = $has_acf
			? get_field($field['key'], $post_id)
			: get_post_meta($post_id, $field['key'], true);

		if (empty($value) && $value !== '0') {
			continue;
		}

		$icon = ! empty($field['icon']) ? sanitize_key($field['icon']) : '';
		if ($icon) {
			$has_icons = true;
		}

		$output_fields[] = array(
			'key'    => $field['key'],
			'label'  => ! empty($field['label']) ? $field['label'] : '',
			'value'  => $value,
			'type'   => ! empty($field['type']) ? $field['type'] : 'text',
			'prefix' => ! empty($field['prefix']) ? $field['prefix'] : '',
			'suffix' => ! empty($field['suffix']) ? $field['suffix'] : '',
			'icon'   => $icon,
		);
	}

	if (empty($output_fields)) {
		return;
	}

	// Enqueue Dashicons on frontend if any field has an icon
	if ($has_icons && ! is_admin()) {
		wp_enqueue_style('dashicons');
	}

	// Sanitize layout options
	$layout = in_array($layout, array('block', 'inline'), true) ? $layout : 'block';
	$columns = max(2, min(4, (int) $columns));

	// Build container classes and styles
	$container_class = $prefix . '__fields ' . $prefix . '__fields--' . $layout;
	$container_style = '';

	if ($layout === 'inline') {
		$container_style = '--fields-columns: ' . $columns . ';';
	}
?>
	<div class="<?php echo esc_attr($container_class); ?>" <?php echo $container_style ? ' style="' . esc_attr($container_style) . '"' : ''; ?>>
		<?php foreach ($output_fields as $field) : ?>
			<div class="<?php echo esc_attr($prefix); ?>__field <?php echo esc_attr($prefix); ?>__field--<?php echo esc_attr($field['type']); ?>">
				<?php if ($field['icon']) : ?>
					<span class="<?php echo esc_attr($prefix); ?>__field-icon dashicons dashicons-<?php echo esc_attr($field['icon']); ?>"></span>
				<?php endif; ?>
				<?php if ($field['label']) : ?>
					<span class="<?php echo esc_attr($prefix); ?>__field-label"><?php echo esc_html($field['label']); ?><?php echo $field['icon'] || $layout === 'inline' ? '' : ':'; ?></span>
				<?php endif; ?>
				<span class="<?php echo esc_attr($prefix); ?>__field-value">
					<?php if ($field['prefix']) : ?>
						<span class="<?php echo esc_attr($prefix); ?>__field-prefix"><?php echo esc_html($field['prefix']); ?></span>
					<?php endif; ?>
					<?php echo ridebalkans_card_format_field_value($field['value'], $field['type'], $prefix); ?>
					<?php if ($field['suffix']) : ?>
						<span class="<?php echo esc_attr($prefix); ?>__field-suffix"><?php echo esc_html($field['suffix']); ?></span>
					<?php endif; ?>
				</span>
			</div>
		<?php endforeach; ?>
	</div>
<?php
}

/**
 * Format a custom field value based on type.
 *
 * @param mixed  $value  Field value.
 * @param string $type   Field type.
 * @param string $prefix CSS class prefix.
 * @return string Formatted value.
 */
function ridebalkans_card_format_field_value($value, $type, $prefix = 'rb-loop-card')
{
	switch ($type) {
		case 'date':
			if (is_string($value)) {
				$timestamp = strtotime($value);
				if ($timestamp) {
					return esc_html(date_i18n(get_option('date_format'), $timestamp));
				}
			}
			return esc_html($value);

		case 'number':
			return esc_html(number_format_i18n((float) $value));

		case 'price':
			return esc_html('€' . number_format_i18n((float) $value, 2));

		case 'image':
			if (is_numeric($value)) {
				return wp_get_attachment_image($value, 'thumbnail', false, array('class' => $prefix . '__field-image'));
			} elseif (is_string($value)) {
				return '<img src="' . esc_url($value) . '" class="' . esc_attr($prefix) . '__field-image" alt="" loading="lazy">';
			}
			return '';

		case 'link':
			if (is_array($value)) {
				$url   = isset($value['url']) ? $value['url'] : '';
				$title = isset($value['title']) ? $value['title'] : $url;
				return '<a href="' . esc_url($url) . '" class="' . esc_attr($prefix) . '__field-link">' . esc_html($title) . '</a>';
			}
			return '<a href="' . esc_url($value) . '" class="' . esc_attr($prefix) . '__field-link">' . esc_html($value) . '</a>';

		case 'text':
		default:
			return esc_html($value);
	}
}

/**
 * Get available templates for a specific post type.
 *
 * Scans theme and plugin directories for templates matching the naming convention:
 * - {name}-{post_type}.php (post-type specific)
 * - content-{post_type}.php (default for post type)
 *
 * @param string $post_type Post type to find templates for.
 * @param string $context   Deprecated - always uses 'loop-card'.
 * @return array Array of template options [['label' => ..., 'value' => ...], ...]
 */
function ridebalkans_card_get_templates_for_post_type($post_type, $context = 'loop-card')
{
	$templates = [];
	$found_values = [];

	// Search directories
	$search_paths = [
		get_stylesheet_directory() . "/template-parts/{$context}/",
		get_template_directory() . "/template-parts/{$context}/",
	];

	if (defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
		$search_paths[] = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "blocks/{$context}/templates/";
	}

	// Pattern to match templates for this post type: {name}-{post_type}.php
	$pattern = '*-' . $post_type . '.php';

	foreach ($search_paths as $path) {
		if (! is_dir($path)) {
			continue;
		}

		$files = glob($path . $pattern);
		if (! $files) {
			continue;
		}

		foreach ($files as $file) {
			$basename = basename($file, '.php');

			// Skip if already found (theme takes precedence)
			if (in_array($basename, $found_values, true)) {
				continue;
			}

			$found_values[] = $basename;

			// Try to get "Template Name:" header from the file (like WordPress page templates)
			$file_data = get_file_data($file, array('Template Name' => 'Template Name'));
			$label = ! empty($file_data['Template Name']) ? $file_data['Template Name'] : null;

			// Fallback: Generate human-readable label from filename
			if (! $label) {
				$name_part = str_replace('-' . $post_type, '', $basename);
				$label = ucwords(str_replace('-', ' ', $name_part)) . ' - ' . ucfirst($post_type);
			}

			$templates[] = [
				'label' => $label,
				'value' => $basename,
			];
		}
	}

	/**
	 * Filter available templates for a post type.
	 *
	 * @param array  $templates Array of template options.
	 * @param string $post_type Post type.
	 * @param string $context   Template context.
	 */
	return apply_filters('ridebalkans_card_templates_for_post_type', $templates, $post_type, $context);
}

/**
 * Locate a template file with fallback chain.
 *
 * Template naming convention: {template_name}-{post_type}.php
 * Examples:
 *   - content-post.php (default for posts)
 *   - content-camper.php (default for camper post type)
 *   - featured-post.php (custom template for posts)
 *   - card-motorcycle.php (custom template for motorcycle post type)
 *
 * Search order:
 *   1. Theme: template-parts/loop-card/{template_name}.php
 *   2. Plugin: blocks/loop-card/templates/{template_name}.php
 *   3. Fallback to content-{post_type}.php
 *
 * @param string $template_name Specific template name (e.g., 'content-post', 'featured-camper').
 * @param string $post_type     Post type for fallback.
 * @param string $context       Deprecated - always uses 'loop-card'.
 * @return string|null Template path or null if not found.
 */
function ridebalkans_card_locate_template($template_name, $post_type, $context = 'loop-card')
{
	$template = null;

	// Normalize template name - ensure it doesn't have .php extension
	$template_name = preg_replace('/\.php$/', '', $template_name);

	// If no specific template, use default naming: content-{post_type}
	if (empty($template_name)) {
		$template_name = 'content-' . $post_type;
	}

	// 1. Try exact template name in theme
	$template = locate_template("template-parts/{$context}/{$template_name}.php");

	// 2. Try exact template name in plugin
	if (! $template && defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
		$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "blocks/{$context}/templates/{$template_name}.php";
		if (file_exists($plugin_template)) {
			$template = $plugin_template;
		}
	}

	// 3. Fallback: Try default content-{post_type} in theme (if different from requested)
	if (! $template && $template_name !== 'content-' . $post_type) {
		$template = locate_template("template-parts/{$context}/content-{$post_type}.php");
	}

	// 4. Fallback: Try default content-{post_type} in plugin
	if (! $template && defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
		$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "blocks/{$context}/templates/content-{$post_type}.php";
		if (file_exists($plugin_template)) {
			$template = $plugin_template;
		}
	}

	// 5. Last resort: Generic content.php template
	if (! $template) {
		$template = locate_template("template-parts/{$context}/content.php");
	}

	if (! $template && defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
		$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "blocks/{$context}/templates/content.php";
		if (file_exists($plugin_template)) {
			$template = $plugin_template;
		}
	}

	/**
	 * Filter the located template path.
	 *
	 * @param string|null $template      Located template path or null.
	 * @param string      $template_name Requested template name.
	 * @param string      $post_type     Post type.
	 * @param string      $context       Template context.
	 */
	return apply_filters('ridebalkans_card_locate_template', $template, $template_name, $post_type, $context);
}

/**
 * Get Schema.org data for a single post.
 *
 * @param int    $post_id     Post ID.
 * @param string $schema_type Schema type.
 * @return array Schema data.
 */
function ridebalkans_card_get_schema_item($post_id, $schema_type)
{
	$title       = get_the_title($post_id);
	$url         = get_permalink($post_id);
	$excerpt     = wp_strip_all_tags(get_the_excerpt($post_id));
	$image       = get_the_post_thumbnail_url($post_id, 'large');
	$date        = get_the_date('c', $post_id);
	$modified    = get_the_modified_date('c', $post_id);
	$author_id   = get_post_field('post_author', $post_id);
	$author_name = get_the_author_meta('display_name', $author_id);

	$schema = array(
		'@type' => $schema_type,
		'name'  => $title,
		'url'   => $url,
	);

	if ($excerpt) {
		$schema['description'] = $excerpt;
	}

	if ($image) {
		$schema['image'] = $image;
	}

	// Type-specific fields
	switch ($schema_type) {
		case 'Article':
		case 'BlogPosting':
			$schema['@type']         = 'Article';
			$schema['headline']      = $title;
			$schema['datePublished'] = $date;
			$schema['dateModified']  = $modified;
			if ($author_name) {
				$schema['author'] = array(
					'@type' => 'Person',
					'name'  => $author_name,
				);
			}
			break;

		case 'Product':
			$price = get_post_meta($post_id, '_price', true) ?: get_post_meta($post_id, 'price', true);
			if ($price) {
				$schema['offers'] = array(
					'@type'         => 'Offer',
					'price'         => $price,
					'priceCurrency' => 'EUR',
				);
			}
			break;

		case 'Event':
			$start_date = get_post_meta($post_id, 'event_start_date', true);
			$end_date   = get_post_meta($post_id, 'event_end_date', true);
			$location   = get_post_meta($post_id, 'event_location', true);

			if ($start_date) {
				$schema['startDate'] = $start_date;
			}
			if ($end_date) {
				$schema['endDate'] = $end_date;
			}
			if ($location) {
				$schema['location'] = array(
					'@type' => 'Place',
					'name'  => $location,
				);
			}
			break;
	}

	return $schema;
}
