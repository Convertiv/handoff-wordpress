<?php

/**
 * Loop Card Block - Server-side render
 *
 * Standalone card block that uses shared rendering functions.
 * Can be used within Query Loop or as a standalone block.
 *
 * @var array    $attributes Block attributes
 * @var string   $content    Inner blocks content
 * @var WP_Block $block      Block instance
 */

if (! defined('ABSPATH')) {
	exit;
}

// Ensure shared card functions are available
if (! function_exists('ridebalkans_card_render')) {
	require_once RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'includes/card-render-functions.php';
}

// Check if we're actually in a Query Loop (queryId context is set)
$is_in_query_loop = isset($block->context['queryId']);

// Get post ID - only use context if actually in Query Loop
if ($is_in_query_loop && isset($block->context['postId'])) {
	$post_id = (int) $block->context['postId'];
} elseif (! empty($attributes['postId'])) {
	$post_id = (int) $attributes['postId'];
} else {
	$post_id = 0;
}

/**
 * Filter the post ID used by the Loop Card block.
 *
 * @param int   $post_id    The post ID.
 * @param array $attributes Block attributes.
 * @param bool  $is_in_query_loop Whether block is inside a Query Loop.
 */
$post_id = apply_filters('ridebalkans_loop_card_post_id', $post_id, $attributes, $is_in_query_loop);

if (! $post_id) {
	return '';
}

// Get post type - only use context if actually in Query Loop
if ($is_in_query_loop && isset($block->context['postType'])) {
	$post_type = $block->context['postType'];
} elseif (! empty($attributes['postType'])) {
	$post_type = $attributes['postType'];
} else {
	$post_type = get_post_type($post_id);
}

// Parse card attributes using shared function
$card_args = ridebalkans_card_parse_attributes($attributes);

/**
 * Filter the card arguments used by the Loop Card block.
 *
 * @param array $card_args  Parsed card arguments.
 * @param array $attributes Raw block attributes.
 * @param int   $post_id    The post ID being rendered.
 */
$card_args = apply_filters('ridebalkans_loop_card_args', $card_args, $attributes, $post_id);

// Check if using template mode
$use_template = ! empty($attributes['useTemplate']);
$template_name = ! empty($attributes['templateName']) ? sanitize_file_name($attributes['templateName']) : '';

// Build wrapper classes
$wrapper_classes = array(
	'wp-block-ridebalkans-loop-card',
	'rb-loop-card-wrapper',
	'rb-loop-card-wrapper--' . $card_args['card_style'],
);

if (! empty($attributes['className'])) {
	$wrapper_classes[] = esc_attr($attributes['className']);
}

/**
 * Filter the wrapper classes for the Loop Card block.
 *
 * @param array $wrapper_classes Array of CSS classes.
 * @param array $attributes      Block attributes.
 * @param int   $post_id         The post ID being rendered.
 */
$wrapper_classes = apply_filters('ridebalkans_loop_card_wrapper_classes', $wrapper_classes, $attributes, $post_id);

// Start output
ob_start();
?>
<div class="<?php echo esc_attr(implode(' ', $wrapper_classes)); ?>">
	<?php if ($use_template) : ?>
		<?php
		// Template mode - use template parts from loop-card/templates
		$template = ridebalkans_card_locate_template($template_name, $post_type, 'loop-card');

		/**
		 * Filter the template path for the Loop Card block.
		 *
		 * @param string|null $template  Template file path or null.
		 * @param string      $post_type The post type.
		 * @param int         $post_id   The post ID.
		 */
		$template = apply_filters('ridebalkans_loop_card_template', $template, $post_type, $post_id);

		if ($template) {
			$loop_item = array(
				'post_id'   => $post_id,
				'post_type' => $post_type,
				'args'      => $card_args,
			);
			if (file_exists($template) && is_readable($template)) {
				include $template;
			} else {
				// Template file not accessible, use fallback
				ridebalkans_card_render($post_id, $card_args);
			}
		} else {
			// Fallback to default rendering
			ridebalkans_card_render($post_id, $card_args);
		}
		?>
	<?php else : ?>
		<?php ridebalkans_card_render($post_id, $card_args); ?>
	<?php endif; ?>
</div>
<?php
$output = ob_get_clean();

/**
 * Filter the complete Loop Card block output.
 *
 * @param string $output     The rendered HTML output.
 * @param array  $attributes Block attributes.
 * @param int    $post_id    The post ID.
 */
echo apply_filters('ridebalkans_loop_card_output', $output, $attributes, $post_id);
