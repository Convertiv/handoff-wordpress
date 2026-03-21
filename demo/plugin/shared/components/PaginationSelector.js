/**
 * PaginationSelector Component
 *
 * Sidebar control for a pagination array field.
 * Pagination is always built server-side from the connected WP_Query — this panel
 * only lets the editor toggle visibility.
 *
 * @package Handoff_Blocks
 */

import { ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * @param {Object}   props
 * @param {string}   props.attrName        CamelCase attribute name (e.g. 'pagination').
 * @param {Object}   props.attributes      Block attributes object.
 * @param {Function} props.setAttributes   Block setAttributes function.
 * @param {string}   [props.label]         Override label for the toggle.
 * @param {string}   [props.help]          Override help text.
 */
export function PaginationSelector({ attrName, attributes, setAttributes, label, help }) {
  const enabled = attributes[`${attrName}Enabled`] ?? true;

  return (
    <ToggleControl
      label={label || __('Show Pagination', 'handoff')}
      help={help || __('Pagination is built automatically from the connected posts query.', 'handoff')}
      checked={enabled}
      onChange={(value) => setAttributes({ [`${attrName}Enabled`]: value })}
      __nextHasNoMarginBottom
    />
  );
}

export default PaginationSelector;
