/**
 * Template preprocessing utilities for the Handlebars to JSX transpiler
 */
import { HandoffProperty } from '../../types';
export interface PreprocessFieldsResult {
    template: string;
    /** Field paths that were converted to inline-editable markers */
    inlineEditableFields: Set<string>;
}
/**
 * Preprocess {{#field "path"}}content{{/field}} into field markers
 * These will be converted to RichText/Image/LinkControl components in postprocessing
 * Only creates markers for supported field types that are NOT inside attribute values
 */
export declare const preprocessFields: (template: string, properties: Record<string, HandoffProperty>) => PreprocessFieldsResult;
/**
 * Clean and preprocess the Handlebars template
 * @param currentLoopArray - When processing loop inner content, pass the array name so attribute conditionals (e.g. {{#unless @last}}) get the correct array name
 */
export declare const cleanTemplate: (template: string, currentLoopArray?: string) => string;
/**
 * Pre-process template to handle block helpers before HTML parsing
 * Uses iterative approach to handle nested blocks properly
 * @param template - Template string
 * @param currentLoopArray - When processing inner content of {{#each properties.xxx}}, pass the array name (e.g. "ctas") so {{#unless @last}} markers get data-array for correct expansion at replace time
 */
export declare const preprocessBlocks: (template: string, currentLoopArray?: string) => string;
