<?php
/**
 * Server-rendered output for the breadcrumbs block.
 *
 * @var array $attributes
 */

$show_on_front_page = !empty($attributes['showOnFrontPage']);
$breadcrumbs_html = convertiv_get_breadcrumbs_html(
	array(
		'show_on_front_page' => $show_on_front_page,
	)
);

if ($breadcrumbs_html === '') {
	return;
}

$wrapper_attributes = function_exists('get_block_wrapper_attributes')
	? get_block_wrapper_attributes(array('class' => 'convertiv-breadcrumbs-block'))
	: 'class="convertiv-breadcrumbs-block"';

echo sprintf(
	'<div %1$s>%2$s</div>',
	$wrapper_attributes,
	$breadcrumbs_html
); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
