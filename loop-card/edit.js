/**
 * Loop Card Block - Edit Component
 *
 * A post card block for use within Query Loop or standalone.
 * Uses ServerSideRender for preview to match frontend output.
 */

import { __ } from '@wordpress/i18n';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import {
	PanelBody,
	SelectControl,
	ToggleControl,
	Placeholder,
	Spinner,
} from '@wordpress/components';
import ServerSideRender from '@wordpress/server-side-render';
import { useSelect } from '@wordpress/data';
import { store as coreDataStore } from '@wordpress/core-data';
import { lazy, Suspense, useMemo } from '@wordpress/element';

// Shared hooks and components
import { usePostTypes } from '../shared/hooks';
import { ContentPickerWithExclusion } from '../shared/components';

// Lazy load CardLayoutBuilder - only loaded when card layout panel is opened
const CardLayoutBuilder = lazy(() => import('../loop/components/CardLayoutBuilder'));

/**
 * Main Edit Component
 */
export default function Edit({ attributes, setAttributes, context }) {
	const {
		postId: attrPostId,
		postType: attrPostType,
		useTemplate,
		templateName,
		cardStyle,
		linkEntireCard,
	} = attributes;

	// Use context from Query Loop if available
	const contextPostId = context?.postId;
	const contextPostType = context?.postType;
	const isInQueryLoop = Number.isFinite(context?.queryId);

	// Determine which post ID and type to use
	// ONLY use context values when actually inside a Query Loop
	const postId = isInQueryLoop ? contextPostId : attrPostId;
	const postType = isInQueryLoop ? contextPostType : attrPostType;

	const blockProps = useBlockProps({
		className: `rb-loop-card-wrapper rb-loop-card-wrapper--${cardStyle}`,
	});

	// Use shared hook for post types
	const { postTypeOptions } = usePostTypes();

	// Get available templates for the current post type
	const templateOptions = useMemo(() => {
		const templates = window.ridebalkansLoop?.templates || {};
		const currentPostType = postType || attrPostType;
		const postTypeTemplates = templates[currentPostType] || [];
		const options = [];

		// Default template value: content-{post_type}
		const defaultTemplateValue = `content-${currentPostType}`;

		// Find the default template if it exists to get its label
		const defaultTemplate = postTypeTemplates.find((t) => t.value === defaultTemplateValue);
		const defaultLabel = defaultTemplate?.label || defaultTemplateValue;

		// Add default template first
		options.push({
			label: `${defaultLabel} (${__('Default', 'ridebalkans')})`,
			value: defaultTemplateValue,
		});

		// Add other templates
		postTypeTemplates.forEach((t) => {
			if (t.value && t.value !== defaultTemplateValue) {
				options.push({
					label: t.label || t.value,
					value: t.value,
				});
			}
		});

		return options;
	}, [postType, attrPostType]);

	// Fetch selected post data
	const { selectedPostData } = useSelect(
		(select) => {
			const core = select(coreDataStore);

			// Fetch the selected post if we have an ID
			let selectedData = [];
			if (attrPostId && attrPostType) {
				const post = core.getEntityRecord('postType', attrPostType, attrPostId);
				if (post) {
					selectedData = [{ id: post.id, type: attrPostType }];
				}
			}

			return { selectedPostData: selectedData };
		},
		[attrPostId, attrPostType]
	);

	// Handle post selection in standalone mode
	// ContentPicker can return either [{id, type}] format or simplified [id] format
	const handlePostSelect = (picked) => {
		if (picked.length > 0) {
			const pickedItem = picked[0];
			// Handle both formats: object {id, type} or just a number
			const newPostId = typeof pickedItem === 'object' ? pickedItem.id : pickedItem;
			const newPostType = typeof pickedItem === 'object' && pickedItem.type ? pickedItem.type : attrPostType;

			setAttributes({
				postId: newPostId,
				postType: newPostType,
			});
		} else {
			setAttributes({ postId: 0 });
		}
	};

	// Build attributes for SSR - explicitly include all values
	const ssrAttributes = useMemo(
		() => ({
			...attributes,
			postId: postId ? parseInt(postId, 10) : 0,
			postType: postType || 'post',
			// Ensure visibility is explicitly passed
			visibility: attributes.visibility || {},
		}),
		[attributes, postId, postType]
	);

	// Key for SSR to force refresh when relevant attributes change
	// Memoized to avoid recalculating on every render
	const ssrKey = useMemo(() => {
		const visibilityHash = Object.entries(attributes.visibility || {})
			.map(([k, v]) => `${k}:${v}`)
			.join(',');
		const orderHash = (attributes.cardElementOrder || []).join(',');
		return `${postType}-${postId}-${visibilityHash}-${orderHash}-${attributes.useTemplate}-${attributes.templateName}`;
	}, [postType, postId, attributes.visibility, attributes.cardElementOrder, attributes.useTemplate, attributes.templateName]);

	return (
		<>
			<InspectorControls>
				{/* Post Selection (standalone mode only) */}
				{!isInQueryLoop && (
					<PanelBody title={__('Post Selection', 'ridebalkans')} initialOpen>
						<SelectControl
							__nextHasNoMarginBottom
							__next40pxDefaultSize
							label={__('Post Type', 'ridebalkans')}
							value={attrPostType}
							options={postTypeOptions}
							onChange={(value) => {
								// Clear postId when changing post type
								setAttributes({ postType: value, postId: 0 });
							}}
						/>

						<ContentPickerWithExclusion
							key={`picker-${attrPostType}`}
							label={__('Select Post', 'ridebalkans')}
							contentTypes={[attrPostType]}
							content={selectedPostData}
							onPickChange={handlePostSelect}
							maxContentItems={1}
						/>
					</PanelBody>
				)}

				{/* Rendering Mode */}
				<PanelBody title={__('Rendering', 'ridebalkans')} initialOpen={!isInQueryLoop}>
					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Use Template Part', 'ridebalkans')}
						checked={useTemplate}
						onChange={(value) => {
							setAttributes({
								useTemplate: value,
								// Set default template when enabling
								templateName: value && !templateName ? `content-${postType || attrPostType}` : templateName,
							});
						}}
						help={__(
							'Use theme template parts for custom rendering.',
							'ridebalkans'
						)}
					/>

					{useTemplate && (
						<SelectControl
							__nextHasNoMarginBottom
							__next40pxDefaultSize
							label={__('Template', 'ridebalkans')}
							value={templateName || `content-${postType || attrPostType}`}
							options={templateOptions}
							onChange={(value) => setAttributes({ templateName: value })}
							help={__('Select a template for this post type.', 'ridebalkans')}
						/>
					)}

					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Link Entire Card', 'ridebalkans')}
						checked={linkEntireCard}
						onChange={(value) => setAttributes({ linkEntireCard: value })}
						help={__('Make the whole card clickable', 'ridebalkans')}
					/>
				</PanelBody>

				{/* Card Layout Builder (when not using templates) */}
				{!useTemplate && (
					<PanelBody title={__('Card Layout', 'ridebalkans')} initialOpen>
						<Suspense fallback={<Spinner />}>
							<CardLayoutBuilder
								attributes={attributes}
								setAttributes={setAttributes}
								postType={postType}
							/>
						</Suspense>
					</PanelBody>
				)}
			</InspectorControls>

			<div {...blockProps}>
				{!postId ? (
					<Placeholder
						icon="excerpt-view"
						label={__('Loop Card', 'ridebalkans')}
						instructions={
							isInQueryLoop
								? __('This block will display post data from the Query Loop.', 'ridebalkans')
								: __('Select a post to display.', 'ridebalkans')
						}
					>
						{!isInQueryLoop && (
							<ContentPickerWithExclusion
								key={`placeholder-picker-${attrPostType}`}
								contentTypes={[attrPostType]}
								content={selectedPostData}
								onPickChange={handlePostSelect}
								maxContentItems={1}
							/>
						)}
					</Placeholder>
				) : (
					<ServerSideRender
						key={ssrKey}
						block="ridebalkans/loop-card"
						attributes={ssrAttributes}
						LoadingResponsePlaceholder={() => (
							<div className="rb-loop-card__loading">
								<Spinner />
							</div>
						)}
						ErrorResponsePlaceholder={({ response }) => (
							<Placeholder icon="warning" label={__('Error loading block', 'ridebalkans')}>
								<p>{response?.message || __('An error occurred while loading the preview.', 'ridebalkans')}</p>
							</Placeholder>
						)}
					/>
				)}
			</div>
		</>
	);
}
