/**
 * Postprocessing utilities for the Handlebars to JSX transpiler
 */
import { TranspilerContext } from './types';
/**
 * Post-process to convert template literal markers back to actual template literals
 */
export declare const postprocessTemplateLiterals: (jsx: string) => string;
/**
 * Post-process JSX to convert markers back to JSX logic
 */
export declare const postprocessJsx: (jsx: string, context: TranspilerContext, parentLoopVar?: string, innerBlocksField?: string | null) => string;
