/**
 * Merged Group Block Generator
 *
 * Combines all Handoff components in the same group into a single WordPress
 * block with variations. Uses a superset attribute schema, variant-conditional
 * sidebar controls, variant-specific preview rendering, and a render.php
 * dispatcher.
 */
import { HandoffComponent, GutenbergAttribute, DynamicArrayConfig, BreadcrumbsArrayConfig, TaxonomyArrayConfig, PaginationArrayConfig, GeneratedBlock } from '../types';
/** Per-variant mapping from original field name to merged attribute name */
export type FieldMap = Record<string, string>;
type AnyDynamicArrayConfig = DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig;
interface VariantInfo {
    component: HandoffComponent;
    fieldMap: FieldMap;
    innerBlocksField: string | null;
    dynamicArrayConfigs: Record<string, AnyDynamicArrayConfig>;
}
interface SupersetResult {
    /** All merged attributes keyed by merged attribute name */
    attributes: Record<string, GutenbergAttribute>;
    /** Per-variant field map: original key → merged attribute name */
    fieldMaps: Record<string, FieldMap>;
}
/**
 * Merge attributes from N components into a superset schema.
 *
 * 1. Shared fields (same name, compatible type): kept as-is.
 * 2. Conflicting fields (same name, different type): prefixed with variant slug.
 * 3. Unique fields: kept as-is.
 */
export declare const buildSupersetAttributes: (variants: VariantInfo[], groupSlug: string) => SupersetResult;
/**
 * Generate a merged block for a group of components.
 * Variation markup is split into include files: variations/<variant-id>.js and variations/<variant-id>.php.
 */
export declare const generateMergedBlock: (groupSlug: string, components: HandoffComponent[], variantInfos: VariantInfo[], apiUrl?: string, variantScreenshots?: Record<string, boolean>) => GeneratedBlock;
export type { VariantInfo };
