/**
 * Shows a warning in the block editor for Handoff blocks marked as removed
 * from the compile output (__handoff.removedFromHandoff in block.json).
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { Notice } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { getBlockType } from '@wordpress/blocks';

const withRemovedFromHandoffNotice = createHigherOrderComponent(
  (BlockEdit) =>
    function RemovedFromHandoffBlockEdit(props) {
      if (!props.name?.startsWith('handoff/')) {
        return <BlockEdit {...props} />;
      }

      const blockType = getBlockType(props.name);
      const removed = blockType?.__handoff?.removedFromHandoff === true;

      if (!removed) {
        return <BlockEdit {...props} />;
      }

      return (
        <>
          <Notice status="warning" isDismissible={false}>
            {__(
              'This block is no longer part of your Handoff compile output. Do not use it in new content. Existing content will continue to render.',
              'handoff'
            )}
          </Notice>
          <BlockEdit {...props} />
        </>
      );
    },
  'handoff/withRemovedFromHandoffNotice'
);

addFilter('editor.BlockEdit', 'handoff/removed-from-handoff-notice', withRemovedFromHandoffNotice);
