<?php
/**
 * Example Hero block render integration with Convertiv breadcrumbs.
 *
 * @var array $attributes
 */

?>
<section class="b-hero">
	<?php
	echo convertiv_render_breadcrumbs_for_block(
		$attributes,
		array(
			'position' => 'top',
		)
	); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	?>

	<div class="b-hero__content">
		<!-- hero content -->
	</div>

	<?php
	echo convertiv_render_breadcrumbs_for_block(
		$attributes,
		array(
			'position' => 'bottom',
		)
	); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	?>
</section>
