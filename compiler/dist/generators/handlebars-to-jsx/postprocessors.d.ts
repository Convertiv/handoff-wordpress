/**
 * Postprocessing utilities for the Handlebars to JSX transpiler
 */
import { TranspilerContext } from './types';
interface ExtractedImgAttributes {
    className: string;
    styleAttr: string;
    size: string;
}
/**
 * Parse the original `<img>` inside a `#field` block so layout classes and
 * inline styles survive compilation into the editor `<Image>` component.
 */
export declare const extractImgAttributes: (content: string) => ExtractedImgAttributes;
/**
 * Post-process to convert template literal markers back to actual template literals
 */
export declare const postprocessTemplateLiterals: (jsx: string) => string;
/**
 * Post-process JSX to convert markers back to JSX logic
 */
export declare const postprocessJsx: (jsx: string, context: TranspilerContext, parentLoopVar?: string, innerBlocksField?: string | null) => string;
export {};
