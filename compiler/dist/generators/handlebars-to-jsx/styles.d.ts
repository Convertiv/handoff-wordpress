/**
 * Style parsing utilities for the Handlebars to JSX transpiler
 */
import { TranspilerContext } from './types';
/**
 * Convert a static CSS string (e.g. "display: block; color: red;") to a React inline style object
 * literal string (e.g. "{ display: 'block', color: 'red' }"). Used when a conditional wraps an
 * entire style attribute so the value expression needs to be a React object, not a CSS string.
 */
export declare const cssStringToReactObject: (cssStr: string) => string;
/**
 * Parse a CSS style string into a React style object string.
 * Handles mixed static and dynamic (Handlebars) values per-property.
 */
export declare const parseStyleToObject: (styleStr: string, context: TranspilerContext) => string;
