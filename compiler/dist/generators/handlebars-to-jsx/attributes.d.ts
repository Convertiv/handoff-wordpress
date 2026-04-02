/**
 * Attribute conversion utilities for the Handlebars to JSX transpiler
 */
import { HTMLElement } from 'node-html-parser';
import { TranspilerContext, ConvertedAttributeValue } from './types';
/**
 * Convert conditionals inside an attribute value to JSX template literal syntax
 * Called from convertAttributes after HTML parsing
 * Example: "prefix{{#if cond}}value{{/if}}suffix" -> `prefix${cond ? 'value' : ''}suffix`
 * @param loopArray - Name of the array being iterated (for @last / @first); when inside {{#each arr}}, use 'arr'.
 */
export declare const convertAttributeValue: (value: string, loopVar?: string, loopArray?: string) => ConvertedAttributeValue;
/**
 * Pre-process conditional attributes (entire attribute wrapped in {{#if}})
 * Handles two patterns:
 *   1. {{#if condition}}attrName="value"{{/if}}  — attr with value
 *   2. {{#if condition}} attrName{{/if}}          — boolean attr (e.g. selected, disabled)
 * Both are converted to: attrName={condition ? value : undefined}
 */
export declare const preprocessConditionalAttributes: (template: string) => string;
/**
 * Pre-process attribute values that contain conditionals
 * This must run before preprocessBlocks to prevent if-markers from appearing inside attributes
 * @param currentLoopArray - When processing loop inner content, pass the array name so {{#unless @last}} etc. get the correct array (e.g. "ctas") instead of default "items"
 */
export declare const preprocessAttributeConditionals: (template: string, currentLoopArray?: string) => string;
/**
 * Convert HTML attributes to JSX attributes
 */
export declare const convertAttributes: (element: HTMLElement, context: TranspilerContext) => string;
