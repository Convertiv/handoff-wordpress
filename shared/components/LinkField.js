import { useState, useRef } from '@wordpress/element';
import { RichText, LinkControl } from '@wordpress/block-editor';
import { Button, Popover } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export function HandoffLinkField({
  fieldId,
  label,
  url,
  opensInNewTab,
  onLabelChange,
  onLinkChange,
  isSelected,
}) {
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const anchorRef = useRef(null);

  return (
    <span className="handoff-editable-field handoff-link-field">
      <RichText
        tagName="span"
        value={label}
        onChange={onLabelChange}
        allowedFormats={[]}
        withoutInteractiveFormatting
        placeholder={__('Link text...', 'handoff')}
      />
      {isSelected && (
        <Button
          ref={anchorRef}
          icon="admin-links"
          label={url ? __('Edit URL', 'handoff') : __('Add URL', 'handoff')}
          showTooltip
          isSmall
          isPressed={isEditingUrl}
          style={{
            marginLeft: '4px',
            verticalAlign: 'middle',
            minWidth: 0,
            padding: '2px 4px',
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsEditingUrl((v) => !v);
          }}
        />
      )}
      {isEditingUrl && (
        <Popover
          placement="bottom-start"
          anchor={anchorRef.current}
          onClose={() => setIsEditingUrl(false)}
          focusOnMount="firstElement"
          shift
        >
          <div style={{ minWidth: 300, padding: '8px' }}>
            <LinkControl
              value={{ url: url || '', opensInNewTab: opensInNewTab || false }}
              onChange={(val) =>
                onLinkChange({ url: val.url || '', opensInNewTab: val.opensInNewTab || false })
              }
              settings={[{ id: 'opensInNewTab', title: __('Open in new tab', 'handoff') }]}
            />
          </div>
        </Popover>
      )}
    </span>
  );
}
