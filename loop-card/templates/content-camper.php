<?php

/**
 * Template Name: Camper Vehicle Card
 * Description: Camper card with vehicle specs, pricing and availability.
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

// Get camper meta data (ACF or regular meta)
$get_field = function_exists('get_field') ? 'get_field' : function ($key, $id) {
	return get_post_meta($id, $key, true);
};

$seats        = $get_field('camper_seats', $post_id);
$beds         = $get_field('camper_beds', $post_id);
$transmission = $get_field('vehicle_transmission', $post_id);
$price        = $get_field('vehicle_price', $post_id);
$produced     = $get_field('produced', $post_id);
$engine       = $get_field('engine', $post_id);
$is_featured  = $get_field('featured', $post_id);

$card_classes = array(
	'rb-loop__card',
	'rb-loop__card--' . esc_attr($args['card_style']),
	'rb-loop__card--camper',
);

if ($is_featured) {
	$card_classes[] = 'rb-loop__card--featured';
}

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

			<?php if ($is_featured) : ?>
				<span class="rb-loop__card-badge rb-loop__card-badge--featured">
					<?php esc_html_e('Featured', 'ridebalkans'); ?>
				</span>
			<?php endif; ?>
		</a>
	<?php endif; ?>

	<div class="rb-loop__card-content">

		<?php if ($args['show_title']) : ?>
			<h3 class="rb-loop__card-title">
				<a href="<?php echo esc_url($permalink); ?>">
					<?php echo esc_html($title); ?>
				</a>
			</h3>
		<?php endif; ?>

		<?php if ($args['show_meta']) : ?>
			<div class="rb-loop__card-specs">
				<?php if ($seats) : ?>
					<span class="rb-loop__card-spec">
						<span class="dashicons dashicons-groups"></span>
						<?php printf(esc_html(_n('%d seat', '%d seats', $seats, 'ridebalkans')), $seats); ?>
					</span>
				<?php endif; ?>

				<?php if ($beds) : ?>
					<span class="rb-loop__card-spec">
						<span class="dashicons dashicons-bed"></span>
						<?php printf(esc_html(_n('%d bed', '%d beds', $beds, 'ridebalkans')), $beds); ?>
					</span>
				<?php endif; ?>

				<?php if ($transmission) : ?>
					<span class="rb-loop__card-spec">
						<span class="dashicons dashicons-dashboard"></span>
						<?php echo esc_html(ucfirst($transmission)); ?>
					</span>
				<?php endif; ?>

				<?php if ($produced) : ?>
					<span class="rb-loop__card-spec">
						<span class="dashicons dashicons-calendar-alt"></span>
						<?php echo esc_html($produced); ?>
					</span>
				<?php endif; ?>
			</div>
		<?php endif; ?>

		<?php if ($args['show_excerpt']) : ?>
			<p class="rb-loop__card-excerpt">
				<?php echo esc_html(wp_trim_words(get_the_excerpt($post_id), $args['excerpt_length'], '...')); ?>
			</p>
		<?php endif; ?>

		<?php if (! empty($args['custom_fields'])) : ?>
			<?php ridebalkans_card_render_custom_fields($post_id, $args['custom_fields']); ?>
		<?php endif; ?>

		<div class="rb-loop__card-footer">
			<?php if ($price) : ?>
				<div class="rb-loop__card-price">
					<span class="rb-loop__card-price-label"><?php esc_html_e('From', 'ridebalkans'); ?></span>
					<span class="rb-loop__card-price-value">€<?php echo esc_html(number_format_i18n((float) $price)); ?></span>
					<span class="rb-loop__card-price-period"><?php esc_html_e('/day', 'ridebalkans'); ?></span>
				</div>
			<?php endif; ?>

			<?php if ($args['show_read_more']) : ?>
				<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-readmore rb-loop__card-button">
					<?php echo esc_html($args['read_more_text']); ?>
					<span class="dashicons dashicons-arrow-right-alt"></span>
				</a>
			<?php endif; ?>
		</div>

	</div>

</article>
