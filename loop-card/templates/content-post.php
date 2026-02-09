<?php

/**
 * Template Name: Content Card
 * Description: Standard blog post card with image, meta, excerpt and author.
 *
 * @var array $loop_item See content.php for full documentation.
 *
 * @package RideBalkans\Blocks
 */

if (! defined('ABSPATH')) {
	exit;
}

$post_id   = $loop_item['post_id'];
$args      = $loop_item['args'];

$permalink   = get_permalink($post_id);
$title       = get_the_title($post_id);
$has_thumb   = has_post_thumbnail($post_id);
$categories  = get_the_category($post_id);
$author_id   = get_post_field('post_author', $post_id);
$author_name = get_the_author_meta('display_name', $author_id);
$author_url  = get_author_posts_url($author_id);

$card_classes = array(
	'rb-loop__card',
	'rb-loop__card--' . esc_attr($args['card_style']),
	'rb-loop__card--post',
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

			<?php if (! empty($categories) && $args['card_style'] !== 'minimal') : ?>
				<span class="rb-loop__card-category">
					<?php echo esc_html($categories[0]->name); ?>
				</span>
			<?php endif; ?>
		</a>
	<?php endif; ?>

	<div class="rb-loop__card-content">

		<?php if ($args['show_meta']) : ?>
			<div class="rb-loop__card-meta">
				<time datetime="<?php echo esc_attr(get_the_date('c', $post_id)); ?>">
					<?php echo esc_html(get_the_date('', $post_id)); ?>
				</time>
				<span class="rb-loop__card-reading-time">
					<?php
					$content    = get_post_field('post_content', $post_id);
					$word_count = str_word_count(strip_tags($content));
					$minutes    = max(1, ceil($word_count / 200));
					printf(
						/* translators: %d: minutes */
						esc_html(_n('%d min read', '%d min read', $minutes, 'ridebalkans')),
						$minutes
					);
					?>
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

		<div class="rb-loop__card-footer">
			<?php if ($author_id) : ?>
				<div class="rb-loop__card-author-info">
					<?php echo get_avatar($author_id, 32, '', '', array('class' => 'rb-loop__card-avatar')); ?>
					<a href="<?php echo esc_url($author_url); ?>" class="rb-loop__card-author-name">
						<?php echo esc_html($author_name); ?>
					</a>
				</div>
			<?php endif; ?>

			<?php if ($args['show_read_more']) : ?>
				<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-readmore">
					<?php echo esc_html($args['read_more_text']); ?>
					<span class="dashicons dashicons-arrow-right-alt"></span>
				</a>
			<?php endif; ?>
		</div>

	</div>

</article>
