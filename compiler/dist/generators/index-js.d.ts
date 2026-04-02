/**
 * Generates index.js for Gutenberg block editor
 */
import { HandoffComponent, HandoffProperty, DynamicArrayConfig, BreadcrumbsArrayConfig, TaxonomyArrayConfig, PaginationArrayConfig } from '../types';
/**
 * Convert snake_case to Title Case
 */
declare const toTitleCase: (str: string) => string;
/**
 * Context for generating field controls - determines how values are accessed and updated
 */
interface FieldContext {
    /** The variable name for accessing the value (e.g., 'backgroundImage' or 'item.image') */
    valueAccessor: string;
    /** The onChange handler code (e.g., 'setAttributes({ x: value })' or 'updateItems(index, "x", value)') */
    onChangeHandler: (value: string) => string;
    /** Base indentation */
    indent: string;
}
/**
 * Generate a field control for any property type - unified function for both top-level and nested fields
 */
declare const generateFieldControl: (fieldKey: string, property: HandoffProperty, context: FieldContext) => string;
/**
 * Generate array (repeater) control using 10up Repeater component
 * Provides drag-and-drop reordering and built-in add/remove functionality
 */
declare const generateArrayControl: (key: string, property: HandoffProperty, attrName: string, label: string, indent: string) => string;
/**
 * Generate the inspector control for a top-level property
 * Uses generateFieldControl with a setAttributes context
 */
declare const generatePropertyControl: (key: string, property: HandoffProperty, indent?: string) => string;
/**
 * Generate complete index.js file
 * @param component - The Handoff component data
 * @param dynamicArrayConfigs - Optional dynamic array configurations keyed by field name
 * @param innerBlocksField - The richtext field that uses InnerBlocks, or null if none
 */
declare const generateIndexJs: (component: HandoffComponent, dynamicArrayConfigs?: Record<string, DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig>, innerBlocksField?: string | null) => string;
export { generateIndexJs, toTitleCase, generateFieldControl, generateArrayControl, generatePropertyControl };
export type { FieldContext };
