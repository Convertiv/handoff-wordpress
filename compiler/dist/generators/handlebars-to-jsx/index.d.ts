/**
 * Handlebars to JSX Transpiler
 *
 * Uses node-html-parser and regex patterns for accurate conversion
 * of Handlebars templates to React JSX for Gutenberg editor previews.
 */
import { HandoffProperty } from '../../types';
import { TranspileResult } from './types';
export { toCamelCase, isReservedWord, sanitizeReservedName, humanizeLabel, normalizeSelectOptions, getTemplateReferencedAttributeNames } from './utils';
export type { NormalizedSelectOption } from './utils';
/**
 * Main transpiler function - converts Handlebars template to JSX
 */
export declare const transpileHandlebarsToJsx: (template: string, properties: Record<string, HandoffProperty>, indent?: string, innerBlocksField?: string | null) => TranspileResult;
/**
 * Generate a simple fallback preview
 */
export declare const generateFallbackPreview: (properties: Record<string, HandoffProperty>, componentId: string, componentTitle: string) => string;
export interface JsxPreviewResult {
    jsx: string;
    inlineEditableFields: Set<string>;
}
/**
 * Generate a JSX preview that's suitable for the Gutenberg editor
 * Falls back to simplified preview if transpilation produces unusable output
 */
export declare const generateJsxPreview: (template: string, properties: Record<string, HandoffProperty>, componentId: string, componentTitle: string, innerBlocksField?: string | null) => JsxPreviewResult;
