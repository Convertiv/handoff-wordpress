/**
 * TaxonomySelector Component
 *
 * Sidebar control for a taxonomy array field with two modes:
 *  - Automatic: pulls terms from a WordPress taxonomy (e.g. post_tag, category).
 *  - Manual:    editor defines the items directly via a Repeater.
 *
 * Props
 * ─────
 * attrName          {string}   CamelCase attribute name (e.g. 'tags').
 * attributes        {Object}   Block attributes.
 * setAttributes     {Function} Block setAttributes.
 * taxonomyOptions   {Array}    [{label, value}] taxonomy choices shown in the picker.
 * defaultTaxonomy   {string}   Fallback taxonomy value (e.g. 'post_tag').
 * label             {string?}  Override the enabled-toggle label.
 * renderManualItems {Function} Render prop called by Repeater in Manual tab.
 *                              Signature: (item, index, setItem, removeItem) => JSX.
 *
 * @package Handoff_Blocks
 */

import { ToggleControl, SelectControl, TabPanel, Button, Flex } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { Repeater } from '@10up/block-components';

/**
 * @param {Object}   props
 * @param {string}   props.attrName
 * @param {Object}   props.attributes
 * @param {Function} props.setAttributes
 * @param {Array}    props.taxonomyOptions
 * @param {string}   props.defaultTaxonomy
 * @param {string}   [props.label]
 * @param {Function} [props.renderManualItems]
 */
export function TaxonomySelector({
  attrName,
  attributes,
  setAttributes,
  taxonomyOptions = [],
  defaultTaxonomy = 'post_tag',
  label,
  renderManualItems,
}) {
  const enabled = attributes[`${attrName}Enabled`] ?? false;
  const source = attributes[`${attrName}Source`] ?? 'auto';
  const taxonomy = attributes[`${attrName}Taxonomy`] || defaultTaxonomy;

  const tabs = [
    { name: 'auto', title: __('Automatic', 'handoff') },
    { name: 'manual', title: __('Manual', 'handoff') },
  ];

  return (
    <>
      <ToggleControl
        label={label || __('Show Tags', 'handoff')}
        checked={enabled}
        onChange={(value) => setAttributes({ [`${attrName}Enabled`]: value })}
        __nextHasNoMarginBottom
      />
      {enabled && (
        <div style={{ marginTop: '12px' }}>
          <TabPanel
            tabs={tabs}
            initialTabName={source}
            onSelect={(tabName) => {
              if (tabName !== source) {
                setAttributes({ [`${attrName}Source`]: tabName });
              }
            }}
          >
            {(tab) =>
              tab.name === 'auto' ? (
                <div style={{ paddingTop: '8px' }}>
                  <SelectControl
                    label={__('Taxonomy', 'handoff')}
                    value={taxonomy}
                    options={taxonomyOptions.length ? taxonomyOptions : [{ label: defaultTaxonomy, value: defaultTaxonomy }]}
                    onChange={(value) => setAttributes({ [`${attrName}Taxonomy`]: value })}
                    __nextHasNoMarginBottom
                  />
                  <p style={{ marginTop: '8px', color: '#757575', fontSize: '12px' }}>
                    {__('Terms are fetched automatically from the selected taxonomy.', 'handoff')}
                  </p>
                </div>
              ) : (
                <div style={{ paddingTop: '8px' }}>
                  {typeof renderManualItems === 'function' ? (
                    <Repeater
                      attribute={attrName}
                      allowReordering={true}
                      defaultValue={{}}
                      addButton={(addItem) => (
                        <div style={{ marginTop: '8px' }}>
                          <Button
                            variant="tertiary"
                            onClick={addItem}
                            icon={
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                <path d="M11 12.5V17.5H12.5V12.5H17.5V11H12.5V6H11V11H6V12.5H11Z" />
                              </svg>
                            }
                          >
                            {__('Add Item', 'handoff')}
                          </Button>
                        </div>
                      )}
                    >
                      {(item, index, setItem, removeItem) => (
                        <div className="repeater-item">
                          <details className="repeater-item__collapse">
                            <summary className="repeater-item__header">
                              <span className="repeater-item__title">
                                {item.label || `${__('Item', 'handoff')} ${index + 1}`}
                              </span>
                              <span
                                className="repeater-item__actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  onClick={removeItem}
                                  icon={
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                      <path d="M5 6.5V18a2 2 0 002 2h10a2 2 0 002-2V6.5h-2.5V18a.5.5 0 01-.5.5H8a.5.5 0 01-.5-.5V6.5H5zM9 9v8h1.5V9H9zm4.5 0v8H15V9h-1.5z" />
                                      <path d="M20 5h-5V3.5A1.5 1.5 0 0013.5 2h-3A1.5 1.5 0 009 3.5V5H4v1.5h16V5zm-6.5 0h-3V3.5h3V5z" />
                                    </svg>
                                  }
                                  label={__('Remove item', 'handoff')}
                                  isDestructive
                                  size="small"
                                />
                              </span>
                            </summary>
                            <div className="repeater-item__fields">
                              <Flex direction="column" gap={2}>
                                {renderManualItems(item, index, setItem, removeItem)}
                              </Flex>
                            </div>
                          </details>
                        </div>
                      )}
                    </Repeater>
                  ) : (
                    <p style={{ color: '#757575', fontSize: '12px' }}>
                      {__('Manual item entry is not configured for this field.', 'handoff')}
                    </p>
                  )}
                </div>
              )
            }
          </TabPanel>
        </div>
      )}
    </>
  );
}

export default TaxonomySelector;
