<?php

/**
 * Template Name: Page Card
 * Description: Simple page card with optional parent page display.
 *
 * @var array $loop_item See content.php for full documentation.
 *
 * @package RideBalkans\Blocks
 */

if (! defined('ABSPATH')) {
	exit;
}

$post_id = $loop_item['post_id'];
$args    = $loop_item['args'];

$permalink = get_permalink($post_id);
$title     = get_the_title($post_id);
$has_thumb = has_post_thumbnail($post_id);
$parent_id = wp_get_post_parent_id($post_id);

$card_classes = array(
	'rb-loop__card',
	'rb-loop__card--' . esc_attr($args['card_style']),
	'rb-loop__card--page',
);

$aspect_style = '';
if (! empty($args['image_aspect_ratio']) && $args['image_aspect_ratio'] !== 'auto') {
	$aspect_style = '--card-aspect-ratio: ' . esc_attr($args['image_aspect_ratio']) . ';';
}
?>

<article class="<?php echo esc_attr(implode(' ', $card_classes)); ?>" style="<?php echo esc_attr($aspect_style); ?>">

	<?php if ($args['show_image'] && $has_thumb) : ?>
		<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-image">
			<?php echo get_the_post_thumbnail($post_id, $args['image_size'], array('loading' => 'lazy')); ?>
			<?php if ($args['card_style'] === 'overlay') : ?>
				<div class="rb-loop__card-overlay"></div>
			<?php endif; ?>
		</a>
	<?php endif; ?>

	<div class="rb-loop__card-content">

		<?php if ($parent_id && $args['show_meta']) : ?>
			<div class="rb-loop__card-meta">
				<span class="rb-loop__card-parent">
					<?php echo esc_html(get_the_title($parent_id)); ?>
				</span>
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

		<?php if (! empty($args['custom_fields'])) : ?>
			<?php ridebalkans_card_render_custom_fields($post_id, $args['custom_fields']); ?>
		<?php endif; ?>

		<?php if ($args['show_read_more']) : ?>
			<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-readmore">
				<?php echo esc_html($args['read_more_text']); ?>
				<span class="dashicons dashicons-arrow-right-alt"></span>
			</a>
		<?php endif; ?>

	</div>

</article>
