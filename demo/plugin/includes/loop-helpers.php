<?php
/**
 * Loop Block Helper Functions
 *
 * Extracted from render.php for use in AJAX context
 *
 * @package RideBalkans_Blocks
 */

if (! defined('ABSPATH')) {
	exit;
}

/**
 * Render a single item based on render mode.
 *
 * @param int    $post_id       Post ID.
 * @param string $render_mode   Render mode (default, loop-card, template).
 * @param array  $args          Card arguments.
 * @param string $template_name Specific template name for template mode (optional).
 */
if (! function_exists('ridebalkans_loop_render_item')) {
	function ridebalkans_loop_render_item($post_id, $render_mode, $args, $template_name = '') {
		$post_type = get_post_type($post_id);

		/**
		 * Filter to allow custom rendering of loop items.
		 *
		 * @param string|null $custom_output Custom HTML output, or null to use default.
		 * @param int         $post_id       Post ID.
		 * @param string      $render_mode   Render mode.
		 * @param array       $args          Card arguments.
		 * @param string      $template_name Template name.
		 */
		$custom_output = apply_filters('ridebalkans_loop_render_item', null, $post_id, $render_mode, $args, $template_name);

		if ($custom_output !== null) {
			echo $custom_output;
			return;
		}

		switch ($render_mode) {
			case 'loop-card':
				ridebalkans_loop_render_via_loop_card($post_id, $post_type, $args);
				break;

			case 'template':
				ridebalkans_loop_render_via_template($post_id, $post_type, $args, $template_name);
				break;

			case 'default':
			default:
				ridebalkans_loop_render_card($post_id, $args);
				break;
		}
	}
}

/**
 * Render using loop-card block's functions.
 *
 * @param int    $post_id   Post ID.
 * @param string $post_type Post type.
 * @param array  $args      Card arguments.
 */
if (! function_exists('ridebalkans_loop_render_via_loop_card')) {
	function ridebalkans_loop_render_via_loop_card($post_id, $post_type, $args) {
		// Include loop-card render functions if not already available
		if (! function_exists('ridebalkans_loop_card_render_default')) {
			$loop_card_render = RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'blocks/loop-card/render.php';
			if (file_exists($loop_card_render)) {
				// We only need the functions, not the full render
				ridebalkans_loop_render_loop_card_style($post_id, $args);
				return;
			}
		}

		// Fallback to loop-card style rendering
		ridebalkans_loop_render_loop_card_style($post_id, $args);
	}
}

/**
 * Render a card in loop-card block style.
 *
 * @param int   $post_id Post ID.
 * @param array $args    Card arguments.
 */
if (! function_exists('ridebalkans_loop_render_loop_card_style')) {
	function ridebalkans_loop_render_loop_card_style($post_id, $args) {
		$defaults = array(
			'card_style'         => 'default',
			'show_image'         => true,
			'image_size'         => 'large',
			'image_aspect_ratio' => '16/9',
			'show_badge'         => false,
			'badge_text'         => '',
			'badge_style'        => 'primary',
			'badge_position'     => 'top-left',
			'show_title'         => true,
			'title_tag'          => 'h3',
			'show_excerpt'       => true,
			'excerpt_length'     => 20,
			'show_date'          => true,
			'show_author'        => false,
			'show_categories'    => false,
			'show_read_more'     => true,
			'read_more_text'     => __('Read More', 'ridebalkans'),
			'custom_fields'      => array(),
			'link_entire_card'   => false,
		);
		$args = wp_parse_args($args, $defaults);

		$permalink       = get_permalink($post_id);
		$title           = get_the_title($post_id);
		$has_thumb       = has_post_thumbnail($post_id);
		$card_style      = $args['card_style'];
		$title_tag       = $args['title_tag'];
		$link_entire     = $args['link_entire_card'];
		$show_badge      = $args['show_badge'] && ! empty($args['badge_text']);

		$card_classes = array(
			'rb-loop-card',
			'rb-loop-card--' . $card_style,
		);

		/**
		 * Filter the Loop card CSS classes.
		 *
		 * @param array $card_classes CSS classes.
		 * @param int   $post_id      Post ID.
		 * @param array $args         Card arguments.
		 */
		$card_classes = apply_filters('ridebalkans_loop_card_classes', $card_classes, $post_id, $args);

		// Aspect ratio CSS variable
		$aspect_style = '';
		if ($args['image_aspect_ratio'] !== 'auto') {
			$aspect_style = '--card-aspect-ratio: ' . esc_attr($args['image_aspect_ratio']) . ';';
		}

		// Card tag based on link_entire_card
		$card_tag = $link_entire ? 'a' : 'article';
		$card_attrs = $link_entire ? 'href="' . esc_url($permalink) . '"' : '';
		?>
		<<?php echo esc_attr($card_tag); ?> class="<?php echo esc_attr(implode(' ', $card_classes)); ?>" style="<?php echo esc_attr($aspect_style); ?>" <?php echo $card_attrs; ?> role="listitem">
			<?php if ($args['show_image'] && $has_thumb) : ?>
				<div class="rb-loop-card__image">
					<?php if (! $link_entire) : ?>
						<a href="<?php echo esc_url($permalink); ?>">
					<?php endif; ?>
						<?php echo get_the_post_thumbnail($post_id, $args['image_size'], array('class' => 'rb-loop-card__img', 'loading' => 'lazy')); ?>
					<?php if (! $link_entire) : ?>
						</a>
					<?php endif; ?>

					<?php if ($card_style === 'overlay') : ?>
						<div class="rb-loop-card__overlay"></div>
					<?php endif; ?>

					<?php if ($args['show_categories'] && $card_style !== 'minimal') : ?>
						<?php
						$categories = get_the_category($post_id);
						if ($categories) :
						?>
							<div class="rb-loop-card__categories">
								<span class="rb-loop-card__category"><?php echo esc_html($categories[0]->name); ?></span>
							</div>
						<?php endif; ?>
					<?php endif; ?>

					<?php if ($show_badge) : ?>
						<span class="rb-loop-card__badge rb-loop-card__badge--<?php echo esc_attr($args['badge_style']); ?> rb-loop-card__badge--<?php echo esc_attr($args['badge_position']); ?>">
							<?php echo esc_html($args['badge_text']); ?>
						</span>
					<?php endif; ?>
				</div>
			<?php elseif ($show_badge && ! $args['show_image']) : ?>
				<div class="rb-loop-card__image rb-loop-card__image--badge-only">
					<span class="rb-loop-card__badge rb-loop-card__badge--<?php echo esc_attr($args['badge_style']); ?> rb-loop-card__badge--<?php echo esc_attr($args['badge_position']); ?>">
						<?php echo esc_html($args['badge_text']); ?>
					</span>
				</div>
			<?php endif; ?>

			<div class="rb-loop-card__content">
				<?php if ($args['show_date'] || $args['show_author']) : ?>
					<div class="rb-loop-card__meta">
						<?php if ($args['show_date']) : ?>
							<time class="rb-loop-card__date" datetime="<?php echo esc_attr(get_the_date('c', $post_id)); ?>">
								<?php echo esc_html(get_the_date('', $post_id)); ?>
							</time>
						<?php endif; ?>

						<?php if ($args['show_author']) : ?>
							<?php
							$author_id = get_post_field('post_author', $post_id);
							if ($author_id) :
							?>
								<span class="rb-loop-card__author">
									<?php echo esc_html(get_the_author_meta('display_name', $author_id)); ?>
								</span>
							<?php endif; ?>
						<?php endif; ?>
					</div>
				<?php endif; ?>

				<?php if ($args['show_title']) : ?>
					<<?php echo esc_attr($title_tag); ?> class="rb-loop-card__title">
						<?php if (! $link_entire) : ?>
							<a href="<?php echo esc_url($permalink); ?>">
						<?php endif; ?>
							<?php echo esc_html($title); ?>
						<?php if (! $link_entire) : ?>
							</a>
						<?php endif; ?>
					</<?php echo esc_attr($title_tag); ?>>
				<?php endif; ?>

				<?php if ($args['show_excerpt']) : ?>
					<p class="rb-loop-card__excerpt">
						<?php echo esc_html(wp_trim_words(get_the_excerpt($post_id), $args['excerpt_length'], '...')); ?>
					</p>
				<?php endif; ?>

				<?php
				// Custom fields
				if (! empty($args['custom_fields']) && function_exists('ridebalkans_loop_render_custom_fields')) :
					ridebalkans_loop_render_custom_fields($post_id, $args['custom_fields']);
				endif;
				?>

				<?php if ($args['show_read_more'] && ! $link_entire) : ?>
					<a href="<?php echo esc_url($permalink); ?>" class="rb-loop-card__readmore">
						<?php echo esc_html($args['read_more_text']); ?>
						<span class="dashicons dashicons-arrow-right-alt"></span>
					</a>
				<?php endif; ?>
			</div>
		</<?php echo esc_attr($card_tag); ?>>
		<?php
	}
}

/**
 * Render using template part system.
 *
 * @param int    $post_id       Post ID.
 * @param string $post_type     Post type.
 * @param array  $args          Card arguments.
 * @param string $template_name Specific template name (optional).
 */
if (! function_exists('ridebalkans_loop_render_via_template')) {
	function ridebalkans_loop_render_via_template($post_id, $post_type, $args, $template_name = '') {
		$template = null;

		// If specific template is requested, try that first
		if ($template_name) {
			$template = locate_template("template-parts/loop/{$template_name}.php");

			if (! $template && defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
				$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "blocks/loop/templates/{$template_name}.php";
				if (file_exists($plugin_template)) {
					$template = $plugin_template;
				}
			}
		}

		// Auto-discovery fallback
		if (! $template) {
			$template = locate_template("template-parts/loop/content-{$post_type}.php");
		}

		if (! $template) {
			$template = locate_template('template-parts/loop/content.php');
		}

		if (! $template && defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
			$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . "blocks/loop/templates/content-{$post_type}.php";
			if (file_exists($plugin_template)) {
				$template = $plugin_template;
			}
		}

		if (! $template && defined('RIDEBALKANS_BLOCKS_PLUGIN_DIR')) {
			$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'blocks/loop/templates/content.php';
			if (file_exists($plugin_template)) {
				$template = $plugin_template;
			}
		}

		if ($template) {
			$loop_item = array(
				'post_id'       => $post_id,
				'post_type'     => $post_type,
				'args'          => $args,
				'template_name' => $template_name,
			);

			include $template;
		} else {
			ridebalkans_loop_render_card($post_id, $args);
		}
	}
}

/**
 * Render a single card item (default/legacy rendering).
 *
 * @param int   $post_id Post ID.
 * @param array $args    Card arguments.
 */
if (! function_exists('ridebalkans_loop_render_card')) {
	function ridebalkans_loop_render_card($post_id, $args) {
		$defaults = array(
			'card_style'         => 'default',
			'show_image'         => true,
			'image_size'         => 'large',
			'show_title'         => true,
			'show_excerpt'       => true,
			'show_meta'          => true,
			'show_read_more'     => false,
			'read_more_text'     => __('Read More', 'ridebalkans'),
			'image_aspect_ratio' => '16/9',
			'excerpt_length'     => 20,
			'custom_fields'      => array(),
			'show_badge'         => false,
			'badge_text'         => '',
			'badge_style'        => 'primary',
			'badge_position'     => 'top-left',
		);
		$args = wp_parse_args($args, $defaults);

		$permalink   = get_permalink($post_id);
		$title       = get_the_title($post_id);
		$has_thumb   = has_post_thumbnail($post_id);
		$card_style  = $args['card_style'];
		$show_badge  = $args['show_badge'] && ! empty($args['badge_text']);

		$card_classes = array(
			'rb-loop__card',
			'rb-loop__card--' . $card_style,
		);

		/**
		 * Filter the Loop card CSS classes.
		 *
		 * @param array $card_classes CSS classes.
		 * @param int   $post_id      Post ID.
		 * @param array $args         Card arguments.
		 */
		$card_classes = apply_filters('ridebalkans_loop_card_classes', $card_classes, $post_id, $args);

		$aspect_style = '';
		if ($args['image_aspect_ratio'] !== 'auto') {
			$aspect_style = '--card-aspect-ratio: ' . $args['image_aspect_ratio'] . ';';
		}
		?>
		<article class="<?php echo esc_attr(implode(' ', $card_classes)); ?>" style="<?php echo esc_attr($aspect_style); ?>" role="listitem">
			<?php if ($args['show_image'] && $has_thumb) : ?>
				<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-image">
					<?php echo get_the_post_thumbnail($post_id, $args['image_size'], array('loading' => 'lazy')); ?>
					<?php if ($card_style === 'overlay') : ?>
						<div class="rb-loop__card-overlay"></div>
					<?php endif; ?>
					<?php if ($show_badge) : ?>
						<span class="rb-loop__card-badge rb-loop__card-badge--<?php echo esc_attr($args['badge_style']); ?> rb-loop__card-badge--<?php echo esc_attr($args['badge_position']); ?>">
							<?php echo esc_html($args['badge_text']); ?>
						</span>
					<?php endif; ?>
				</a>
			<?php elseif ($show_badge && ! $args['show_image']) : ?>
				<div class="rb-loop__card-image rb-loop__card-image--badge-only">
					<span class="rb-loop__card-badge rb-loop__card-badge--<?php echo esc_attr($args['badge_style']); ?> rb-loop__card-badge--<?php echo esc_attr($args['badge_position']); ?>">
						<?php echo esc_html($args['badge_text']); ?>
					</span>
				</div>
			<?php endif; ?>

			<div class="rb-loop__card-content">
				<?php if ($args['show_meta']) : ?>
					<div class="rb-loop__card-meta">
						<time datetime="<?php echo esc_attr(get_the_date('c', $post_id)); ?>">
							<?php echo esc_html(get_the_date('', $post_id)); ?>
						</time>
						<?php
						$author_id = get_post_field('post_author', $post_id);
						if ($author_id) :
						?>
							<span class="rb-loop__card-author">
								<?php echo esc_html(get_the_author_meta('display_name', $author_id)); ?>
							</span>
						<?php endif; ?>
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
				// Custom fields
				if (! empty($args['custom_fields']) && function_exists('ridebalkans_loop_render_custom_fields')) :
					ridebalkans_loop_render_custom_fields($post_id, $args['custom_fields']);
				endif;
				?>

				<?php if ($args['show_read_more']) : ?>
					<a href="<?php echo esc_url($permalink); ?>" class="rb-loop__card-readmore">
						<?php echo esc_html($args['read_more_text']); ?>
						<span class="dashicons dashicons-arrow-right-alt"></span>
					</a>
				<?php endif; ?>
			</div>
		</article>
		<?php
	}
}

/**
 * Render custom fields for a post.
 *
 * @param int   $post_id Post ID.
 * @param array $fields  Custom field definitions.
 */
if (! function_exists('ridebalkans_loop_render_custom_fields')) {
	function ridebalkans_loop_render_custom_fields($post_id, $fields) {
		if (empty($fields)) {
			return;
		}

		$output_fields = array();

		foreach ($fields as $field) {
			if (empty($field['key'])) {
				continue;
			}

			$value = get_post_meta($post_id, $field['key'], true);

			// Try ACF if available
			if (empty($value) && function_exists('get_field')) {
				$value = get_field($field['key'], $post_id);
			}

			if (empty($value)) {
				continue;
			}

			$label  = ! empty($field['label']) ? $field['label'] : '';
			$type   = ! empty($field['type']) ? $field['type'] : 'text';
			$prefix = ! empty($field['prefix']) ? $field['prefix'] : '';
			$suffix = ! empty($field['suffix']) ? $field['suffix'] : '';

			$output_fields[] = array(
				'key'    => $field['key'],
				'label'  => $label,
				'value'  => $value,
				'type'   => $type,
				'prefix' => $prefix,
				'suffix' => $suffix,
			);
		}

		if (empty($output_fields)) {
			return;
		}
		?>
		<div class="rb-loop__card-fields">
			<?php foreach ($output_fields as $field) : ?>
				<div class="rb-loop__card-field rb-loop__card-field--<?php echo esc_attr($field['type']); ?>">
					<?php if ($field['label']) : ?>
						<span class="rb-loop__card-field-label"><?php echo esc_html($field['label']); ?>:</span>
					<?php endif; ?>
					<span class="rb-loop__card-field-value">
						<?php if ($field['prefix']) : ?>
							<span class="rb-loop__card-field-prefix"><?php echo esc_html($field['prefix']); ?></span>
						<?php endif; ?>
						<?php echo ridebalkans_loop_format_field_value($field['value'], $field['type']); ?>
						<?php if ($field['suffix']) : ?>
							<span class="rb-loop__card-field-suffix"><?php echo esc_html($field['suffix']); ?></span>
						<?php endif; ?>
					</span>
				</div>
			<?php endforeach; ?>
		</div>
		<?php
	}
}

/**
 * Format a custom field value based on type.
 *
 * @param mixed  $value Field value.
 * @param string $type  Field type.
 * @return string Formatted value.
 */
if (! function_exists('ridebalkans_loop_format_field_value')) {
	function ridebalkans_loop_format_field_value($value, $type) {
		switch ($type) {
			case 'date':
				if (is_numeric($value)) {
					return esc_html(date_i18n(get_option('date_format'), $value));
				}
				return esc_html(date_i18n(get_option('date_format'), strtotime($value)));

			case 'number':
				return esc_html(number_format_i18n(floatval($value)));

			case 'price':
				return '<span class="rb-loop__field-price">' . esc_html(number_format_i18n(floatval($value), 2)) . '</span>';

			case 'image':
				if (is_numeric($value)) {
					return wp_get_attachment_image($value, 'thumbnail', false, array('class' => 'rb-loop__field-image'));
				}
				return '<img src="' . esc_url($value) . '" alt="" class="rb-loop__field-image" />';

			case 'link':
				$url = is_array($value) && isset($value['url']) ? $value['url'] : $value;
				$text = is_array($value) && isset($value['title']) ? $value['title'] : $url;
				return '<a href="' . esc_url($url) . '" class="rb-loop__field-link">' . esc_html($text) . '</a>';

			case 'text':
			default:
				return esc_html($value);
		}
	}
}
