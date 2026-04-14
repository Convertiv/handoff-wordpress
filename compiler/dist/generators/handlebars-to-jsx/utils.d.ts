/**
 * Utility functions for the Handlebars to JSX transpiler
 */
/**
 * Check if a name is a JavaScript reserved word
 */
export declare const isReservedWord: (name: string) => boolean;
/**
 * Sanitize a name if it's a reserved word by prefixing with 'block'
 * e.g., 'super' -> 'blockSuper', 'class' -> 'blockClass'
 */
export declare const sanitizeReservedName: (name: string) => string;
/**
 * Convert snake_case or kebab-case to camelCase, sanitizing reserved words
 */
export declare const toCamelCase: (str: string) => string;
/**
 * Extract top-level property names referenced in a Handlebars template.
 * Matches any `properties.xxx` occurrence (inside {{...}}, {{#if ...}}, {{#each ...}}, etc.)
 * Returns the camelCase/sanitized attribute names so they can be added to destructuring and
 * block.json when the API omits them from component.properties.
 */
export declare const getTemplateReferencedAttributeNames: (template: string) => string[];
/**
 * Convert CSS property name to camelCase for React style objects
 */
export declare const cssToCamelCase: (prop: string) => string;
/**
 * Check if element is self-closing
 */
export declare const isSelfClosing: (tagName: string) => boolean;
/**
 * Convert an HTML/SVG attribute name to its JSX equivalent
 */
export declare const toJsxAttrName: (name: string) => string;
/**
 * Normalize whitespace - collapse newlines and multiple spaces into single space
 */
export declare const normalizeWhitespace: (str: string) => string;
/**
 * Collapse internal whitespace (newlines, multiple spaces) into single spaces
 * but preserve leading/trailing whitespace. Used for conditional attribute values
 * where a leading space (e.g. " u-mx-auto") is significant.
 */
export declare const collapseWhitespace: (str: string) => string;
/**
 * Convert camelCase or snake_case to human-readable label (e.g. "someValue" -> "Some Value", "some_value" -> "Some Value").
 */
export declare const humanizeLabel: (str: string) => string;
/** Normalized select option: always { label, value } */
export type NormalizedSelectOption = {
    label: string;
    value: string;
};
/**
 * Normalize select options to always be Array<{ label, value }>.
 * Handoff options can be either:
 * - Array<{ value: string, label: string }>
 * - Array<string> — string is used as both value and label; label is humanized (camel/snake -> title case).
 */
export declare const normalizeSelectOptions: (options: Array<{
    label?: string;
    value?: string;
} | string> | undefined) => NormalizedSelectOption[];
/**
 * Find matching closing tag for a block helper, handling nesting
 */
export declare const findMatchingClose: (template: string, openTag: string, closeTag: string, startPos: number) => number;
/**
 * Check if a position in the template is inside an HTML attribute value
 */
export declare const isInsideAttribute: (template: string, pos: number) => boolean;
