/**
 * Entry point for RideBalkans Loop Card block.
 */

import './editor.scss';
import './style.scss';

import { registerBlockType } from '@wordpress/blocks';
import metadata from './block.json';
import edit from './edit';
import save from './save';

registerBlockType(metadata.name, {
	edit,
	save,
});
