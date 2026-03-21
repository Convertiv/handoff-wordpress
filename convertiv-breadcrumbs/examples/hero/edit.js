import { InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export function HeroBreadcrumbControls({ attributes, setAttributes }) {
	return (
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
	);
}
