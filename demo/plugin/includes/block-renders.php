<?php

/**
 * Server-side render callbacks for RideBalkans blocks.
 */

if (! defined('ABSPATH')) {
	exit;
}

require_once RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'includes/template-helpers.php';

/**
 * FAQ Block Renderer
 *
 * Supports theme template override:
 *   Theme: template-parts/faq/accordion.php
 *   Plugin fallback: blocks/faq/templates/accordion.php
 */
function ridebalkans_faq_block_render($attributes)
{
	// Enqueue the accordion script
	wp_enqueue_script('rb-faq-accordion');

	// Support both old format (faqIds) and new format (selectedFaqs from ContentPicker)
	$faq_ids = array();

	if (isset($attributes['selectedFaqs']) && is_array($attributes['selectedFaqs'])) {
		// New format from ContentPicker: [{id: 1, type: 'faq', uuid: '...'}]
		foreach ($attributes['selectedFaqs'] as $item) {
			if (isset($item['id'])) {
				$faq_ids[] = intval($item['id']);
			}
		}
	} elseif (isset($attributes['faqIds']) && is_array($attributes['faqIds'])) {
		// Legacy format: [1, 2, 3]
		$faq_ids = array_filter(array_map('intval', $attributes['faqIds']));
	}

	if (empty($faq_ids)) {
		return '';
	}

	$faqs = get_posts(array(
		'post_type'      => 'faq',
		'post__in'       => $faq_ids,
		'orderby'        => 'post__in',
		'posts_per_page' => -1,
	));

	if (! $faqs) {
		return '';
	}

	// Get settings with defaults
	$faq_args = array(
		'faqs'               => $faqs,
		'accordion_behavior' => isset($attributes['accordionBehavior']) ? $attributes['accordionBehavior'] : 'single',
		'first_expanded'     => isset($attributes['firstExpanded']) ? (bool) $attributes['firstExpanded'] : true,
		'icon_style'         => isset($attributes['iconStyle']) ? $attributes['iconStyle'] : 'plus',
		'enable_anchors'     => isset($attributes['enableAnchors']) ? (bool) $attributes['enableAnchors'] : true,
		'enable_schema'      => isset($attributes['enableSchema']) ? (bool) $attributes['enableSchema'] : true,
		'show_expand_all'    => isset($attributes['showExpandAll']) ? (bool) $attributes['showExpandAll'] : false,
		'attributes'         => $attributes,
	);

	/**
	 * Filter the FAQ template arguments.
	 *
	 * @param array $faq_args Template arguments.
	 * @param array $attributes Block attributes.
	 */
	$faq_args = apply_filters('ridebalkans_faq_template_args', $faq_args, $attributes);

	// Locate template: theme override or plugin default
	$template = ridebalkans_faq_locate_template();

	/**
	 * Filter the FAQ template path.
	 *
	 * @param string $template Template file path.
	 * @param array  $faq_args Template arguments.
	 */
	$template = apply_filters('ridebalkans_faq_template', $template, $faq_args);

	if ($template && file_exists($template) && is_readable($template)) {
		ob_start();
		include $template;
		return ob_get_clean();
	}

	// Inline fallback (shouldn't happen if plugin template exists)
	return ridebalkans_faq_render_default($faq_args);
}

/**
 * Locate FAQ template with theme override support.
 *
 * Search order:
 *   1. Theme: template-parts/faq/accordion.php
 *   2. Plugin: blocks/faq/templates/accordion.php
 *
 * @return string|null Template path or null.
 */
function ridebalkans_faq_locate_template()
{
	// Check theme first
	$theme_template = locate_template('template-parts/faq/accordion.php');
	if ($theme_template) {
		return $theme_template;
	}

	// Fall back to plugin template
	$plugin_template = RIDEBALKANS_BLOCKS_PLUGIN_DIR . 'blocks/faq/templates/accordion.php';
	if (file_exists($plugin_template)) {
		return $plugin_template;
	}

	return null;
}

/**
 * Default FAQ render (fallback if no template found).
 */
function ridebalkans_faq_render_default($args)
{
	extract($args);

	$icon_html = ridebalkans_faq_get_icon($icon_style);

	// Build Schema.org FAQ structured data
	$schema_data = array();
	if ($enable_schema) {
		$schema_data = array(
			'@context'   => 'https://schema.org',
			'@type'      => 'FAQPage',
			'mainEntity' => array(),
		);
	}

	ob_start();
?>
	<div class="rb-faq-wrapper">
		<?php if ($show_expand_all) : ?>
			<div class="rb-faq-controls">
				<button type="button" class="rb-faq-expand-all">
					<?php esc_html_e('Expand All', 'ridebalkans'); ?>
				</button>
				<button type="button" class="rb-faq-collapse-all">
					<?php esc_html_e('Collapse All', 'ridebalkans'); ?>
				</button>
			</div>
		<?php endif; ?>

		<div
			class="rb-faq-accordion rb-faq-accordion--<?php echo esc_attr($icon_style); ?>"
			data-rb-faq-accordion
			data-behavior="<?php echo esc_attr($accordion_behavior); ?>">
			<?php foreach ($faqs as $index => $post) :
				$question    = get_the_title($post);
				$answer      = apply_filters('the_content', $post->post_content);
				$answer_text = wp_strip_all_tags($answer);
				$item_id     = 'rb-faq-' . esc_attr($post->ID);
				$anchor_id   = 'faq-' . $post->ID;
				$is_expanded = $first_expanded && 0 === $index;

				// Add to schema
				if ($enable_schema) {
					$schema_data['mainEntity'][] = array(
						'@type'          => 'Question',
						'name'           => $question,
						'acceptedAnswer' => array(
							'@type' => 'Answer',
							'text'  => $answer_text,
						),
					);
				}
			?>
				<div
					class="rb-faq-item"
					<?php echo $enable_anchors ? 'id="' . esc_attr($anchor_id) . '"' : ''; ?>>
					<button
						class="rb-faq-question"
						type="button"
						aria-expanded="<?php echo $is_expanded ? 'true' : 'false'; ?>"
						aria-controls="<?php echo esc_attr($item_id); ?>">
						<span class="rb-faq-question-text"><?php echo esc_html($question); ?></span>
						<?php if ($enable_anchors) : ?>
							<a
								href="#<?php echo esc_attr($anchor_id); ?>"
								class="rb-faq-anchor"
								title="<?php esc_attr_e('Link to this question', 'ridebalkans'); ?>"
								onclick="event.stopPropagation();">#</a>
						<?php endif; ?>
						<?php echo $icon_html; ?>
					</button>
					<div
						id="<?php echo esc_attr($item_id); ?>"
						class="rb-faq-answer"
						<?php echo $is_expanded ? '' : 'hidden'; ?>>
						<div class="rb-faq-answer-inner"><?php echo $answer; ?></div>
					</div>
				</div>
			<?php endforeach; ?>
		</div>

		<?php if ($enable_schema && ! empty($schema_data['mainEntity'])) : ?>
			<script type="application/ld+json">
				<?php echo wp_json_encode($schema_data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); ?>
			</script>
		<?php endif; ?>
	</div>
<?php
	return ob_get_clean();
}

/**
 * Get FAQ icon HTML based on style
 */
function ridebalkans_faq_get_icon($style)
{
	switch ($style) {
		case 'chevron':
			return '<span class="rb-faq-icon rb-faq-icon--chevron" aria-hidden="true">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</span>';

		case 'arrow':
			return '<span class="rb-faq-icon rb-faq-icon--arrow" aria-hidden="true">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<polyline points="19 12 12 19 5 12" />
				</svg>
			</span>';

		default:
			return '<span class="rb-faq-icon rb-faq-icon--plus" aria-hidden="true">+</span>';
	}
}

/**
 * Server-side render for Vehicle Specs block (theme or plugin template).
 */
function ridebalkans_vehicle_specs_block_render($attributes, $content, $block)
{
	$post_id = 0;
	if (! empty($block->context['postId'])) {
		$post_id = (int) $block->context['postId'];
	} elseif (! empty($attributes['postId'])) {
		$post_id = (int) $attributes['postId'];
	} else {
		$post_id = get_the_ID();
	}
	if (! $post_id) {
		return '';
	}

	$vehicle_type = get_post_meta($post_id, 'vehicle_type', true);
	if (! $vehicle_type) {
		$vehicle_type = ! empty($attributes['fallbackVehicleType']) ? $attributes['fallbackVehicleType'] : 'campervan';
	}
	$vehicle_type = sanitize_key($vehicle_type);

	$template = ridebalkans_blocks_get_vehicle_specs_template($vehicle_type);
	if (! $template) {
		return '';
	}

	ob_start();
	$post = get_post($post_id);
	setup_postdata($post);
	include $template;
	wp_reset_postdata();
	return ob_get_clean();
}

/**
 * Server-side rendering for vehicles block (Query Loop / single item).
 */
function ridebalkans_vehicles_render_block($attributes, $content, $block)
{
	$vehicle_type = isset($attributes['vehicleType']) ? $attributes['vehicleType'] : 'camper';
	$post = null;
	if (isset($block->context['postId'])) {
		$post = get_post($block->context['postId']);
	} else {
		$post = get_post();
	}
	if (! $post instanceof WP_Post) {
		return '';
	}
	$post_type = $post->post_type;
	if (in_array($post_type, array('camper', 'offroad', 'motorcycle'), true)) {
		$vehicle_type = $post_type;
	}

	$template_slug = ($vehicle_type === 'offroad') ? 'offroad' : (($vehicle_type === 'motorcycle') ? 'motorcycle' : 'camper');

	ob_start();
	ridebalkans_blocks_load_template_part('template-parts/vehicles/' . $template_slug, null, array(
		'post'         => $post,
		'vehicle_type' => $vehicle_type,
	));
	return ob_get_clean();
}

/**
 * Render callback for ridebalkans/vehicles block (grid/slider list).
 */
function ridebalkans_render_vehicles_block($attributes, $content)
{
	$defaults = array(
		'selectionMode'      => 'auto',
		'vehicleType'        => 'camper',
		'selectedVehicles'   => array(),
		'layoutType'         => 'grid',
		'maxItems'           => 0,
		'gridColumns'        => 3,
		'showSliderArrows'   => true,
		'slidesPerView'      => 1,
		'paginationPosition' => 'below',
		'enableSchema'       => true,
	);
	$attributes          = wp_parse_args($attributes, $defaults);
	$selection_mode      = $attributes['selectionMode'] === 'manual' ? 'manual' : 'auto';
	$vehicle_type        = sanitize_key($attributes['vehicleType']);
	$selected_vehicles   = isset($attributes['selectedVehicles']) ? $attributes['selectedVehicles'] : array();
	$layout_type         = $attributes['layoutType'] === 'slider' ? 'slider' : 'grid';
	$max_items           = isset($attributes['maxItems']) ? (int) $attributes['maxItems'] : 0;
	$grid_columns        = max(1, min(6, (int) $attributes['gridColumns']));
	$show_slider_arrows  = ! empty($attributes['showSliderArrows']);
	$slides_per_view     = max(1, min(4, (int) $attributes['slidesPerView']));
	$pagination_position = in_array($attributes['paginationPosition'], array('overlap', 'below'), true) ? $attributes['paginationPosition'] : 'overlap';
	$enable_schema       = isset($attributes['enableSchema']) ? (bool) $attributes['enableSchema'] : true;

	// Build query based on selection mode
	if ('manual' === $selection_mode) {
		// Manual mode: get specific vehicle IDs from ContentPicker format
		$vehicle_ids = array();
		foreach ($selected_vehicles as $item) {
			if (isset($item['id'])) {
				$vehicle_ids[] = intval($item['id']);
			}
		}

		if (empty($vehicle_ids)) {
			return '';
		}

		// Get all registered vehicle post types for the query
		$vehicle_post_types = array_filter(
			array('camper', 'offroad', 'motorcycle'),
			'post_type_exists'
		);

		$query = new WP_Query(array(
			'post_type'      => $vehicle_post_types,
			'post__in'       => $vehicle_ids,
			'orderby'        => 'post__in',
			'posts_per_page' => count($vehicle_ids),
			'post_status'    => 'publish',
		));
	} else {
		// Auto mode: query by vehicle type
		$query = new WP_Query(array(
			'post_type'      => $vehicle_type,
			'posts_per_page' => -1,
			'post_status'    => 'publish',
			'orderby'        => 'menu_order',
			'order'          => 'ASC',
		));
	}

	if (! $query->have_posts()) {
		return '';
	}

	$total_posts = (int) $query->found_posts;
	$total_limit = ('manual' === $selection_mode)
		? $total_posts
		: (($max_items > 0 && $max_items < $total_posts) ? $max_items : $total_posts);

	if ('slider' === $layout_type && ! is_admin()) {
		wp_enqueue_style('ridebalkans-swiper');
		wp_enqueue_script('ridebalkans-swiper');
		wp_enqueue_script('ridebalkans-vehicles-swiper-init');
	}

	$wrapper_classes = array(
		'wp-block-ridebalkans-vehicles',
		'layout-' . $layout_type,
		'selection-' . $selection_mode,
		'columns-' . $grid_columns,
	);
	if ('auto' === $selection_mode) {
		$wrapper_classes[] = 'vehicle-type-' . $vehicle_type;
	}
	if ('slider' === $layout_type && ! $show_slider_arrows) {
		$wrapper_classes[] = 'hide-arrows';
	}
	if ('slider' === $layout_type) {
		$wrapper_classes[] = 'pagination-' . $pagination_position;
	}
	$inline_style = ('grid' === $layout_type) ? sprintf('grid-template-columns: repeat(%d, minmax(0, 1fr));', $grid_columns) : '';

	// Collect schema data
	$schema_items = array();

	ob_start();
?>
	<div class="<?php echo esc_attr(implode(' ', $wrapper_classes)); ?>">
		<?php if ('slider' === $layout_type) : ?>
			<div class="swiper vehicles-swiper" data-slides-per-view="<?php echo esc_attr($slides_per_view); ?>">
				<div class="swiper-wrapper">
					<?php
					$i = 0;
					while ($query->have_posts() && $i < $total_limit) :
						$query->the_post();
						$i++;
						$current_post_type = get_post_type();
						if ($enable_schema) {
							$schema_items[] = ridebalkans_get_vehicle_schema_item(get_the_ID(), $current_post_type);
						}
					?>
						<div class="swiper-slide">
							<article class="vehicle-card">
								<?php ridebalkans_blocks_load_template_part('template-parts/vehicles/content', $current_post_type, array('post_id' => get_the_ID())); ?>
							</article>
						</div>
					<?php endwhile; ?>
				</div>
				<div class="swiper-pagination"></div>
				<div class="swiper-button-prev"></div>
				<div class="swiper-button-next"></div>
			</div>
		<?php else : ?>
			<div class="vehicles-grid" style="<?php echo esc_attr($inline_style); ?>">
				<?php
				$i = 0;
				while ($query->have_posts() && $i < $total_limit) :
					$query->the_post();
					$i++;
					$current_post_type = get_post_type();
					if ($enable_schema) {
						$schema_items[] = ridebalkans_get_vehicle_schema_item(get_the_ID(), $current_post_type);
					}
				?>
					<article class="vehicle-card">
						<?php ridebalkans_blocks_load_template_part('template-parts/vehicles/content', $current_post_type, array('post_id' => get_the_ID())); ?>
					</article>
				<?php endwhile; ?>
			</div>
		<?php endif; ?>

		<?php if ($enable_schema && ! empty($schema_items)) : ?>
			<script type="application/ld+json">
				<?php echo wp_json_encode(array(
					'@context' => 'https://schema.org',
					'@graph'   => $schema_items,
				), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); ?>
			</script>
		<?php endif; ?>
	</div>
<?php
	wp_reset_postdata();
	return ob_get_clean();
}

/**
 * Get Schema.org Vehicle data for a single vehicle post.
 */
function ridebalkans_get_vehicle_schema_item($post_id, $vehicle_type)
{
	$title       = get_the_title($post_id);
	$url         = get_permalink($post_id);
	$description = get_the_excerpt($post_id);
	$image       = get_the_post_thumbnail_url($post_id, 'large');

	// Get meta fields
	$price        = get_post_meta($post_id, 'vehicle_price', true);
	$seats        = get_post_meta($post_id, 'camper_seats', true);
	$transmission = get_post_meta($post_id, 'vehicle_transmission', true);
	$produced     = function_exists('get_field') ? get_field('produced', $post_id) : '';

	// Map vehicle type to Schema.org type
	$schema_type = 'Vehicle';
	switch ($vehicle_type) {
		case 'camper':
			$schema_type = 'Vehicle'; // Could also use 'Car' with vehicleSpecialUsage
			break;
		case 'motorcycle':
			$schema_type = 'Motorcycle';
			break;
		case 'offroad':
			$schema_type = 'Car';
			break;
	}

	$schema = array(
		'@type' => $schema_type,
		'name'  => $title,
		'url'   => $url,
	);

	if ($description) {
		$schema['description'] = wp_strip_all_tags($description);
	}

	if ($image) {
		$schema['image'] = $image;
	}

	if ($seats) {
		$schema['vehicleSeatingCapacity'] = intval($seats);
	}

	if ($transmission) {
		// Map common transmission values to Schema.org format
		$transmission_lower = strtolower($transmission);
		if (strpos($transmission_lower, 'auto') !== false) {
			$schema['vehicleTransmission'] = 'AutomaticTransmission';
		} elseif (strpos($transmission_lower, 'manual') !== false) {
			$schema['vehicleTransmission'] = 'ManualTransmission';
		} else {
			$schema['vehicleTransmission'] = $transmission;
		}
	}

	if ($produced) {
		$schema['modelDate'] = $produced;
	}

	// Add offer if price is available
	if ($price) {
		// Try to extract numeric price
		$price_numeric = preg_replace('/[^0-9.]/', '', $price);
		if ($price_numeric) {
			$schema['offers'] = array(
				'@type'         => 'Offer',
				'priceCurrency' => 'EUR',
				'price'         => floatval($price_numeric),
				'availability'  => 'https://schema.org/InStock',
			);
		}
	}

	return $schema;
}

/**
 * Render callback for Extras block.
 */
function ridebalkans_render_extras_block($attributes, $content)
{
	$defaults = array(
		'layoutType'         => 'grid',
		'gridColumns'        => 3,
		'maxItems'           => 6,
		'showSliderArrows'   => true,
		'slidesPerView'      => 3,
		'paginationPosition' => 'below',
		'showDescription'    => true,
		'showPrice'          => true,
		'enableSchema'       => true,
	);
	$attributes = wp_parse_args($attributes, $defaults);
	$layout_type         = in_array($attributes['layoutType'], array('grid', 'slider'), true) ? $attributes['layoutType'] : 'grid';
	$grid_columns        = max(1, min(6, (int) $attributes['gridColumns']));
	$max_items           = max(1, (int) $attributes['maxItems']);
	$show_slider_arrows  = ! empty($attributes['showSliderArrows']);
	$slides_per_view     = max(1, min(6, (int) $attributes['slidesPerView']));
	$pagination_position = in_array($attributes['paginationPosition'], array('overlap', 'below'), true) ? $attributes['paginationPosition'] : 'overlap';
	$show_description    = ! empty($attributes['showDescription']);
	$show_price          = ! empty($attributes['showPrice']);
	$enable_schema       = isset($attributes['enableSchema']) ? (bool) $attributes['enableSchema'] : true;

	if (function_exists('get_field')) {
		$extras_day   = array_map(function ($item) {
			$item['calculation'] = 'per day';
			return $item;
		}, (array) get_field('extras_day', 'option'));
		$extras_hire  = array_map(function ($item) {
			$item['calculation'] = 'per hire';
			return $item;
		}, (array) get_field('extras_hire', 'option'));
		$extras_person = array_map(function ($item) {
			$item['calculation'] = 'per person';
			return $item;
		}, (array) get_field('extras_person', 'option'));
	} else {
		$extras_day = $extras_hire = $extras_person = array();
	}
	$items = array_merge($extras_day, $extras_hire, $extras_person);
	if (empty($items)) {
		return '<div class="wp-block-ridebalkans-extras is-empty"></div>';
	}
	$effective_max = min($max_items, count($items));
	$items = array_slice($items, 0, $effective_max);

	$wrapper_classes = array('wp-block-ridebalkans-extras', 'layout-' . $layout_type, 'columns-' . $grid_columns);
	if ('slider' === $layout_type && ! $show_slider_arrows) {
		$wrapper_classes[] = 'hide-arrows';
	}
	if ('slider' === $layout_type) {
		$wrapper_classes[] = 'pagination-' . $pagination_position;
	}
	if ('slider' === $layout_type && ! is_admin()) {
		wp_enqueue_style('ridebalkans-swiper');
		wp_enqueue_script('ridebalkans-swiper');
		wp_enqueue_script('ridebalkans-extras-swiper-init');
	}

	// Build schema data
	$schema_items = array();
	if ($enable_schema) {
		foreach ($items as $item) {
			$schema_items[] = ridebalkans_get_extra_schema_item($item);
		}
	}

	ob_start();
?>
	<div class="<?php echo esc_attr(implode(' ', array_map('sanitize_html_class', $wrapper_classes))); ?>">
		<?php if ('slider' === $layout_type) : ?>
			<div class="swiper extras-swiper" data-slides-per-view="<?php echo esc_attr($slides_per_view); ?>">
				<div class="swiper-wrapper">
					<?php foreach ($items as $item) : ?>
						<div class="swiper-slide"><?php ridebalkans_render_single_extra_card($item, $show_description, $show_price); ?></div>
					<?php endforeach; ?>
				</div>
				<div class="swiper-pagination"></div>
				<?php if ($show_slider_arrows) : ?>
					<div class="swiper-button-prev"></div>
					<div class="swiper-button-next"></div>
				<?php endif; ?>
			</div>
		<?php else : ?>
			<div class="extras-grid">
				<?php foreach ($items as $item) : ?>
					<?php ridebalkans_render_single_extra_card($item, $show_description, $show_price); ?>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>

		<?php if ($enable_schema && ! empty($schema_items)) : ?>
			<script type="application/ld+json">
				<?php echo wp_json_encode(array(
					'@context' => 'https://schema.org',
					'@graph'   => $schema_items,
				), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); ?>
			</script>
		<?php endif; ?>
	</div>
<?php
	return ob_get_clean();
}

/**
 * Get Schema.org Product data for a single extra item.
 */
function ridebalkans_get_extra_schema_item($item)
{
	$title       = isset($item['title']) ? $item['title'] : '';
	$description = isset($item['description']) ? wp_strip_all_tags($item['description']) : '';
	$image       = isset($item['image']['url']) ? $item['image']['url'] : '';
	$price       = isset($item['price']) ? $item['price'] : '';
	$calculation = isset($item['calculation']) ? $item['calculation'] : '';

	$schema = array(
		'@type' => 'Product',
		'name'  => $title,
	);

	if ($description) {
		$schema['description'] = $description;
	}

	if ($image) {
		$schema['image'] = $image;
	}

	// Add offer if price is available
	if ($price) {
		// Try to extract numeric price
		$price_numeric = preg_replace('/[^0-9.]/', '', $price);
		if ($price_numeric) {
			$offer = array(
				'@type'         => 'Offer',
				'priceCurrency' => 'EUR',
				'price'         => floatval($price_numeric),
				'availability'  => 'https://schema.org/InStock',
			);

			// Add unit price specification for per-day/per-person pricing
			if ($calculation) {
				$unit_code = 'C62'; // Default: unit
				$unit_text = $calculation;

				if (strpos($calculation, 'day') !== false) {
					$unit_code = 'DAY';
					$unit_text = 'per day';
				} elseif (strpos($calculation, 'person') !== false) {
					$unit_code = 'IE'; // person
					$unit_text = 'per person';
				} elseif (strpos($calculation, 'hire') !== false) {
					$unit_text = 'per rental';
				}

				$offer['priceSpecification'] = array(
					'@type'                  => 'UnitPriceSpecification',
					'price'                  => floatval($price_numeric),
					'priceCurrency'          => 'EUR',
					'unitCode'               => $unit_code,
					'unitText'               => $unit_text,
				);
			}

			$schema['offers'] = $offer;
		}
	}

	return $schema;
}

/**
 * Helper to render a single extra card.
 */
function ridebalkans_render_single_extra_card($item, $show_description = true, $show_price = true)
{
	$title       = isset($item['title']) ? $item['title'] : '';
	$description = isset($item['description']) ? $item['description'] : '';
	$image       = isset($item['image']) ? $item['image'] : '';
	$price       = isset($item['price']) ? $item['price'] : '';
	$calculation = isset($item['calculation']) ? $item['calculation'] : '';
?>
	<article class="extras-card">
		<?php if ($image) : ?>
			<div class="extras-card__image"><?php echo wp_get_attachment_image($image['ID'], 'medium', false, array('style' => 'width:100%;')); ?></div>
		<?php endif; ?>
		<?php if ($title) : ?>
			<h3 class="extras-card__title"><?php echo esc_html($title); ?></h3>
		<?php endif; ?>
		<?php if ($show_description && $description) : ?>
			<div class="extras-card__description"><?php echo wp_kses_post(wpautop($description)); ?></div>
		<?php endif; ?>
		<?php if ($show_price && $price) : ?>
			<div class="extras-card__price"><?php echo esc_html($price); ?></div>
			<?php if ($calculation) : ?>
				<div class="extras-card__calculation"><?php echo esc_html($calculation); ?></div>
			<?php endif; ?>
		<?php endif; ?>
	</article>
<?php
}
