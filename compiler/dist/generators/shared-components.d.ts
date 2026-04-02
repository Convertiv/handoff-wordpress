/**
 * Generate shared React components for the blocks plugin.
 * These are generated once and shared across all blocks.
 *
 * @package Handoff_Blocks
 */
/**
 * Generate the PostSelector component code
 */
export declare const generatePostSelector: () => string;
/**
 * Generate the PostQueryBuilder component code
 */
export declare const generatePostQueryBuilder: () => string;
/**
 * Generate the shared components index file.
 * Exports only DynamicPostSelector (hand-written); PostSelector and PostQueryBuilder
 * are no longer generated and have been replaced by DynamicPostSelector.
 */
export declare const generateSharedComponentsIndex: () => string;
/**
 * Generate the main shared module index
 */
export declare const generateSharedIndex: () => string;
/**
 * All shared component files that need to be generated.
 * DynamicPostSelector.js is hand-written and not generated; only the index is generated.
 */
export interface SharedComponentFiles {
    'shared/components/index.js': string;
    'shared/index.js': string;
}
/**
 * Generate shared component index files.
 * PostSelector and PostQueryBuilder are no longer generated; use DynamicPostSelector instead.
 */
export declare const generateSharedComponents: () => SharedComponentFiles;
