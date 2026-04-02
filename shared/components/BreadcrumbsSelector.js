/**
 * BreadcrumbsSelector Component
 *
 * Sidebar control for a breadcrumbs array field.
 * Breadcrumbs are always built server-side from the current URL — this panel
 * only lets the editor toggle visibility.
 *
 * @package Handoff_Blocks
 */

import { ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * @param {Object}   props
 * @param {string}   props.attrName        CamelCase attribute name (e.g. 'breadcrumb').
 * @param {Object}   props.attributes      Block attributes object.
 * @param {Function} props.setAttributes   Block setAttributes function.
 * @param {string}   [props.label]         Override label for the toggle.
 * @param {string}   [props.help]          Override help text.
 */
export function BreadcrumbsSelector({ attrName, attributes, setAttributes, label, help }) {
  const enabled = attributes[`${attrName}Enabled`] ?? true;

  return (
    <ToggleControl
      label={label || __('Show Breadcrumbs', 'handoff')}
      help={help || __('Breadcrumbs are built automatically from the current page URL.', 'handoff')}
      checked={enabled}
      onChange={(value) => setAttributes({ [`${attrName}Enabled`]: value })}
      __nextHasNoMarginBottom
    />
  );
}

export default BreadcrumbsSelector;
