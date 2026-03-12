/**
 * Handlebars to JSX Transpiler
 * 
 * This file re-exports from the modular implementation in the handlebars-to-jsx folder.
 * The implementation is split into logical modules for better maintainability:
 * 
 * - types.ts: Type definitions
 * - constants.ts: HTML to JSX attribute mapping and other constants
 * - utils.ts: String utilities and helper functions
 * - expression-parser.ts: Handlebars expression parsing
 * - field-lookup.ts: Property field type lookup
 * - styles.ts: CSS style parsing
 * - attributes.ts: HTML to JSX attribute conversion
 * - preprocessors.ts: Template preprocessing
 * - node-converter.ts: HTML node to JSX conversion
 * - postprocessors.ts: JSX postprocessing
 * - index.ts: Main entry points
 */

export { 
  transpileHandlebarsToJsx, 
  generateJsxPreview, 
  generateFallbackPreview,
  toCamelCase 
} from './handlebars-to-jsx/index';

export type { JsxPreviewResult } from './handlebars-to-jsx/index';
