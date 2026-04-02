/**
 * Generates block.json for a Gutenberg block
 */
import { HandoffComponent, HandoffProperty, GutenbergAttribute, DynamicArrayConfig, BreadcrumbsArrayConfig, TaxonomyArrayConfig, PaginationArrayConfig } from '../types';
/**
 * Convert a group name to a category slug
 * @param group - The group name from the component API
 * @returns The category slug (kebab-case, prefixed with 'handoff-')
 */
declare const groupToCategory: (group: string | undefined) => string;
/**
 * Generate the categories PHP file content
 * @param components - Array of all components to extract unique groups from
 * @returns PHP file content defining the categories
 */
declare const generateCategoriesPhp: (components: HandoffComponent[]) => string;
/**
 * Maps Handoff property types to Gutenberg attribute types
 * @param property - The property definition
 * @param previewValue - Optional value from generic preview to use as default if property.default is not set
 */
declare const mapPropertyType: (property: HandoffProperty, previewValue?: any) => GutenbergAttribute;
/**
 * Convert component ID to block name (kebab-case)
 * Also sanitizes reserved JavaScript words by prefixing with 'block-'
 */
declare const toBlockName: (id: string) => string;
/**
 * Generate block.json content
 * @param component - The Handoff component data
 * @param hasScreenshot - Whether a screenshot image is available for this block
 * @param apiUrl - Optional base API URL to construct Handoff component page URL
 * @param dynamicArrayConfigs - Optional dynamic array configurations keyed by field name
 */
declare const generateBlockJson: (component: HandoffComponent, hasScreenshot?: boolean, apiUrl?: string, dynamicArrayConfigs?: Record<string, DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig>, innerBlocksField?: string | null) => string;
export { generateBlockJson, toBlockName, mapPropertyType, generateCategoriesPhp, groupToCategory };
