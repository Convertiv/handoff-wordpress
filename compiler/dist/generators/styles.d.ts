/**
 * Generates SCSS files for Gutenberg blocks
 */
import { HandoffComponent } from '../types';
/**
 * Generate editor.scss with preview styles
 * TODO: This is much too specific to the framework that we're using to test.
 * We should consider removing this and using the native styles, with limited
 * tweaks to improve the editing experience.
 *
 * @param component - The Handoff component data
 * @returns The SCSS for the editor.scss file
 * @example
 * ```scss
 * .about-editor-preview {
 *   position: relative;
 *   min-height: 200px;
 * }
 * ```
 */
declare const generateEditorScss: (component: HandoffComponent) => string;
/**
 * Generate style.scss for frontend styles
 */
declare const generateStyleScss: (component: HandoffComponent) => string;
export { generateEditorScss, generateStyleScss };
