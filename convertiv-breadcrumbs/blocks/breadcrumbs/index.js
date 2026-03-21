(function (wp) {
	if (!wp || !wp.blocks || !wp.blockEditor || !wp.i18n || !wp.components || !wp.element) {
		return;
	}

	const el = wp.element.createElement;
	const __ = wp.i18n.__;
	const registerBlockType = wp.blocks.registerBlockType;
	const InspectorControls = wp.blockEditor.InspectorControls;
	const useBlockProps = wp.blockEditor.useBlockProps;
	const PanelBody = wp.components.PanelBody;
	const ToggleControl = wp.components.ToggleControl;

	registerBlockType('convertiv/breadcrumbs', {
		supports: {
			align: ['wide', 'full'],
			html: false
		},
		edit: function (props) {
			const attributes = props.attributes || {};
			const setAttributes = props.setAttributes;
			const showOnFrontPage = !!attributes.showOnFrontPage;
			const blockProps = useBlockProps({
				className: 'convertiv-breadcrumbs-block-placeholder'
			});

			return el(
				'div',
				blockProps,
				el(
					InspectorControls,
					null,
					el(
						PanelBody,
						{ title: __('Breadcrumbs settings', 'convertiv-breadcrumbs'), initialOpen: true },
						el(ToggleControl, {
							label: __('Show on front page', 'convertiv-breadcrumbs'),
							checked: showOnFrontPage,
							onChange: function (value) {
								setAttributes({ showOnFrontPage: !!value });
							}
						})
					)
				),
				el('p', null, __('Breadcrumbs will render on the frontend.', 'convertiv-breadcrumbs'))
			);
		},
		save: function () {
			return null;
		}
	});
})(window.wp);
