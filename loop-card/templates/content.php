<?php

/**
 * Loop Block - Generic Template
 *
 * This is the default template used for all post types when no specific
 * template is available. Use this as a boilerplate for creating custom
 * templates for your post types.
 *
 * Available variables:
 * @var array $loop_item {
 *     @type int    $post_id   The current post ID.
 *     @type string $post_type The current post type.
 *     @type array  $args {
 *         Card rendering arguments.
 *         @type string $card_style         Card style (default, minimal, overlay, horizontal).
 *         @type bool   $use_templates      Whether templates are enabled.
 *         @type bool   $show_image         Whether to show the image.
 *         @type string $image_size         WordPress image size.
 *         @type bool   $show_title         Whether to show the title.
 *         @type bool   $show_excerpt       Whether to show the excerpt.
 *         @type bool   $show_meta          Whether to show meta (date, author).
 *         @type bool   $show_read_more     Whether to show read more link.
 *         @type string $read_more_text     Read more button text.
 *         @type string $image_aspect_ratio Image aspect ratio.
 *         @type int    $excerpt_length     Excerpt word count.
 *         @type array  $custom_fields      Custom fields to display.
 *     }
 * }
 *
 * Template Override:
 * To override this template for a specific post type, create:
 * your-theme/template-parts/loop/content-{post_type}.php
 *
 * To override the generic template, create:
 * your-theme/template-parts/loop/content.php
 *
 * @package RideBalkans\Blocks
 */

if (! defined('ABSPATH')) {
	exit;
}

// Extract variables for easier access
$post_id   = $loop_item['post_id'];
$post_type = $loop_item['post_type'];
$args      = $loop_item['args'];

// Get post data
$permalink = get_permalink($post_id);
$title     = get_the_title($post_id);
$has_thumb = has_post_thumbnail($post_id);

// Card classes
$card_classes = array(
	'rb-loop__card',
	'rb-loop__card--' . esc_attr($args['card_style']),
	'rb-loop__card--type-' . esc_attr($post_type),
);

// Aspect ratio style
$aspect_style = '';
if (! empty($args['image_aspect_ratio']) && $args['image_aspect_ratio'] !== 'auto') {
	$aspect_style = '--card-aspect-ratio: ' . esc_attr($args['image_aspect_ratio']) . ';';
}
?>

<article class="<?php echo esc_attr(implode(' ', $card_classes)); ?>" style="<?php echo esc_attr($aspect_style); ?>">

	<?php
	/**
	 * Hook: ridebalkans_loop_card_before
	 *
	 * @param int   $post_id Post ID.
	 * @param array $args    Card arguments.
	 */
	do_action('ridebalkans_loop_card_before', $post_id, $args);
	?>

	<?php if ($args['show_image'] && $has_thumb) : ?>
		<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-image">
			<?php
			echo get_the_post_thumbnail(
				$post_id,
				$args['image_size'],
				array(
					'loading' => 'lazy',
					'class'   => 'rb-loop__card-img',
				)
			);
			?>
			<?php if ($args['card_style'] === 'overlay') : ?>
				<div class="rb-loop__card-overlay"></div>
			<?php endif; ?>
		</a>
	<?php endif; ?>

	<div class="rb-loop__card-content">

		<?php if ($args['show_meta']) : ?>
			<div class="rb-loop__card-meta">
				<time class="rb-loop__card-date" datetime="<?php echo esc_attr(get_the_date('c', $post_id)); ?>">
					<?php echo esc_html(get_the_date('', $post_id)); ?>
				</time>

				<?php
				$author_id = get_post_field('post_author', $post_id);
				if ($author_id) :
					$author_name = get_the_author_meta('display_name', $author_id);
					$author_url  = get_author_posts_url($author_id);
				?>
					<a href="<?php echo esc_url($author_url); ?>" class="rb-loop__card-author">
						<?php echo esc_html($author_name); ?>
					</a>
				<?php endif; ?>

				<?php
				/**
				 * Hook: ridebalkans_loop_card_meta
				 *
				 * Add additional meta items.
				 *
				 * @param int   $post_id Post ID.
				 * @param array $args    Card arguments.
				 */
				do_action('ridebalkans_loop_card_meta', $post_id, $args);
				?>
			</div>
		<?php endif; ?>

		<?php if ($args['show_title']) : ?>
			<h3 class="rb-loop__card-title">
				<a href="<?php echo esc_url($permalink); ?>">
					<?php echo esc_html($title); ?>
				</a>
			</h3>
		<?php endif; ?>

		<?php if ($args['show_excerpt']) : ?>
			<p class="rb-loop__card-excerpt">
				<?php echo esc_html(wp_trim_words(get_the_excerpt($post_id), $args['excerpt_length'], '...')); ?>
			</p>
		<?php endif; ?>

		<?php
		/**
		 * Hook: ridebalkans_loop_card_content
		 *
		 * Add additional content.
		 *
		 * @param int   $post_id Post ID.
		 * @param array $args    Card arguments.
		 */
		do_action('ridebalkans_loop_card_content', $post_id, $args);
		?>

		<?php
		// Custom fields
		if (! empty($args['custom_fields'])) :
			ridebalkans_card_render_custom_fields($post_id, $args['custom_fields']);
		endif;
		?>

		<?php if ($args['show_read_more']) : ?>
			<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-readmore">
				<?php echo esc_html($args['read_more_text']); ?>
				<svg class="rb-loop__card-readmore-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M5 12h14M12 5l7 7-7 7" />
				</svg>
			</a>
		<?php endif; ?>

	</div>

	<?php
	/**
	 * Hook: ridebalkans_loop_card_after
	 *
	 * @param int   $post_id Post ID.
	 * @param array $args    Card arguments.
	 */
	do_action('ridebalkans_loop_card_after', $post_id, $args);
	?>

</article>
