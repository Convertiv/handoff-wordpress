# Convertiv Breadcrumbs Plugin

This plugin provides:

- A reusable breadcrumb generator.
- A reusable breadcrumb component helper for dynamic blocks/templates.
- A dynamic Gutenberg block: `convertiv/breadcrumbs`.

## Reuse in other blocks (for example Hero)

In your dynamic block `render.php`, call:

```php
echo convertiv_get_breadcrumbs_html(
	array(
		'show_on_front_page' => false,
	)
);
```

If your block has an attribute such as `showBreadcrumbs`, wrap the call:

```php
if (!empty($attributes['showBreadcrumbs'])) {
	echo convertiv_get_breadcrumbs_html();
}
```

Or use the helper for cleaner block render templates:

```php
echo convertiv_render_breadcrumbs_for_block($attributes);
```

## Turnkey Hero integration

Use these exact snippets in your Hero block to avoid InnerBlocks while keeping breadcrumbs reusable.

### 1) Hero `block.json` attributes

```json
{
	"attributes": {
		"showBreadcrumbs": {
			"type": "boolean",
			"default": false
		},
		"breadcrumbsPosition": {
			"type": "string",
			"default": "top"
		}
	}
}
```

### 2) Hero editor toggle (`edit.js`)

```js
import { InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

// Inside your edit component return()
<InspectorControls>
	<PanelBody title={__('Hero Settings', 'your-textdomain')} initialOpen={true}>
		<ToggleControl
			label={__('Show breadcrumbs', 'your-textdomain')}
			checked={!!attributes.showBreadcrumbs}
			onChange={(value) => setAttributes({ showBreadcrumbs: !!value })}
		/>
		{!!attributes.showBreadcrumbs && (
			<SelectControl
				label={__('Breadcrumbs position', 'your-textdomain')}
				value={attributes.breadcrumbsPosition || 'top'}
				options={[
					{ label: __('Top', 'your-textdomain'), value: 'top' },
					{ label: __('Bottom', 'your-textdomain'), value: 'bottom' }
				]}
				onChange={(value) => setAttributes({ breadcrumbsPosition: value })}
			/>
		)}
	</PanelBody>
</InspectorControls>
```

### 3) Hero server render (`render.php`)

```php
<?php
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
```

## Troubleshooting: Width control not visible

If the breadcrumbs block does not show width controls (Wide/Full) in the toolbar:

- Ensure your active theme enables wide alignment support:

```php
add_theme_support('align-wide');
```

- Rebuild/refresh editor assets after plugin updates (hard refresh editor).
- Confirm block registration is loaded from this plugin version (not a cached older script).
