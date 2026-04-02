/**
 * Generates render.php for server-side rendering
 * Converts Handlebars templates to PHP
 */
import { HandoffComponent, HandoffProperty, DynamicArrayConfig, BreadcrumbsArrayConfig, TaxonomyArrayConfig, PaginationArrayConfig } from '../types';
/**
 * Convert JS array/object to PHP array syntax
 */
declare const arrayToPhp: (value: any) => string;
/**
 * Get PHP default value for a property
 */
declare const getPhpDefaultValue: (property: HandoffProperty) => string;
/**
 * Convert handlebars template to PHP
 */
declare const handlebarsToPhp: (template: string, properties: Record<string, HandoffProperty>, richtextProps?: Set<string>) => string;
/**
 * Generate attribute extraction code
 */
declare const generateAttributeExtraction: (properties: Record<string, HandoffProperty>, hasOverlay: boolean, innerBlocksField?: string | null) => string;
/**
 * Build PHP array_map expression to reshape standard helper items into the
 * template's expected item shape.  Returns null when no reshaping is needed.
 *
 * @param itemProperties  The component's array item property schema (items.properties)
 * @param standardFields  The flat field names the helper returns (e.g. ['label','url'])
 */
declare const buildReshapePhp: (itemProperties: Record<string, HandoffProperty> | undefined, standardFields: string[]) => string | null;
/**
 * Build equivalent JS reshape expression for editor preview.
 * Returns null when no reshaping is needed.
 */
declare const buildReshapeJs: (itemProperties: Record<string, HandoffProperty> | undefined, standardFields: string[]) => string | null;
/**
 * Generate breadcrumbs array extraction code for render.php.
 * Calls handoff_get_breadcrumb_items() if available, otherwise returns an empty array.
 */
declare const generateBreadcrumbsArrayExtraction: (fieldName: string, attrName: string, itemProperties?: Record<string, HandoffProperty>) => string;
/**
 * Generate taxonomy terms array extraction code for render.php.
 */
declare const generateTaxonomyArrayExtraction: (fieldName: string, attrName: string, config: TaxonomyArrayConfig, itemProperties?: Record<string, HandoffProperty>) => string;
/**
 * Generate pagination array extraction code for render.php.
 * References the WP_Query instance ($query) produced by the connected posts field.
 */
declare const generatePaginationArrayExtraction: (fieldName: string, attrName: string, config: PaginationArrayConfig, itemProperties?: Record<string, HandoffProperty>) => string;
/**
 * Generate dynamic array extraction code for render.php
 * Supports both manual post selection and query builder modes
 */
declare const generateDynamicArrayExtraction: (fieldName: string, attrName: string, config: DynamicArrayConfig) => string;
/**
 * Generate complete render.php file
 * @param component - The Handoff component data
 * @param dynamicArrayConfigs - Optional dynamic array configurations keyed by field name
 */
declare const generateRenderPhp: (component: HandoffComponent, dynamicArrayConfigs?: Record<string, DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig>, innerBlocksField?: string | null) => string;
export { generateRenderPhp, handlebarsToPhp, arrayToPhp, getPhpDefaultValue, generateAttributeExtraction, generateDynamicArrayExtraction, generateBreadcrumbsArrayExtraction, generateTaxonomyArrayExtraction, generatePaginationArrayExtraction, buildReshapePhp, buildReshapeJs, };
