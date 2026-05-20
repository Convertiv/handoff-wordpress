/**
 * Block lifecycle: mark local blocks deprecated when they are not in the
 * current Handoff compile output (removed from Handoff, import-disabled, or
 * superseded by a merged group block).
 */
import { HandoffComponent } from './types';
export type RemovedFromHandoffReason = 'not-in-compile-output';
/** Normalize merged group config key to block directory slug (matches compileGroup). */
export declare const groupSlugToBlockName: (groupSlug: string) => string;
/**
 * List block directory slugs under the compiler output dir that contain block.json.
 */
export declare const listLocalBlockSlugs: (outputDir: string) => string[];
/**
 * Block slugs that compileAll would write this run (individual + merged groups).
 */
export declare const getActiveBlockSlugs: (individualComponents: HandoffComponent[], groupBuckets: Record<string, HandoffComponent[]>) => Set<string>;
export interface ReconcileResult {
    marked: string[];
    alreadyDeprecated: string[];
}
/**
 * Mark a block as removed from compile output by patching block.json in place.
 */
export declare const markBlockDeprecated: (blockDir: string, reason?: RemovedFromHandoffReason) => void;
/**
 * Remove removed-from-compile deprecation fields from block.json (used when re-activating without full regen).
 */
export declare const clearBlockDeprecated: (blockDir: string) => void;
/**
 * Compare local block dirs to active compile slugs; mark orphans as deprecated.
 */
export declare const reconcileLocalBlocks: (outputDir: string, activeSlugs: Set<string>) => ReconcileResult;
