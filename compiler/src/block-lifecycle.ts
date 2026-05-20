/**
 * Block lifecycle: mark local blocks deprecated when they are not in the
 * current Handoff compile output (removed from Handoff, import-disabled, or
 * superseded by a merged group block).
 */

import * as fs from 'fs';
import * as path from 'path';
import { HandoffComponent } from './types';
import { toBlockName } from './generators/block-json';

const DEPRECATED_TITLE_PREFIX = '(Deprecated) ';

export type RemovedFromHandoffReason = 'not-in-compile-output';

/** Normalize merged group config key to block directory slug (matches compileGroup). */
export const groupSlugToBlockName = (groupSlug: string): string =>
  groupSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * List block directory slugs under the compiler output dir that contain block.json.
 */
export const listLocalBlockSlugs = (outputDir: string): string[] => {
  if (!fs.existsSync(outputDir)) {
    return [];
  }
  const slugs: string[] = [];
  for (const entry of fs.readdirSync(outputDir)) {
    if (entry === '.' || entry === '..') continue;
    const blockDir = path.join(outputDir, entry);
    if (fs.statSync(blockDir).isDirectory() && fs.existsSync(path.join(blockDir, 'block.json'))) {
      slugs.push(entry);
    }
  }
  return slugs;
};

/**
 * Block slugs that compileAll would write this run (individual + merged groups).
 */
export const getActiveBlockSlugs = (
  individualComponents: HandoffComponent[],
  groupBuckets: Record<string, HandoffComponent[]>
): Set<string> => {
  const slugs = new Set<string>();
  for (const component of individualComponents) {
    slugs.add(toBlockName(component.id));
  }
  for (const groupSlug of Object.keys(groupBuckets)) {
    slugs.add(groupSlugToBlockName(groupSlug));
  }
  return slugs;
};

export interface ReconcileResult {
  marked: string[];
  alreadyDeprecated: string[];
}

/**
 * Mark a block as removed from compile output by patching block.json in place.
 */
export const markBlockDeprecated = (
  blockDir: string,
  reason: RemovedFromHandoffReason = 'not-in-compile-output'
): void => {
  const blockJsonPath = path.join(blockDir, 'block.json');
  if (!fs.existsSync(blockJsonPath)) {
    return;
  }

  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf-8')) as Record<string, unknown>;

  if (!blockJson.__handoff || typeof blockJson.__handoff !== 'object') {
    blockJson.__handoff = {};
  }
  const handoff = blockJson.__handoff as Record<string, unknown>;
  handoff.removedFromHandoff = true;
  handoff.removedFromHandoffAt = new Date().toISOString();
  handoff.removedFromHandoffReason = reason;

  if (!blockJson.supports || typeof blockJson.supports !== 'object') {
    blockJson.supports = {};
  }
  (blockJson.supports as Record<string, unknown>).inserter = false;

  if (typeof blockJson.title === 'string' && !blockJson.title.startsWith(DEPRECATED_TITLE_PREFIX)) {
    blockJson.title = DEPRECATED_TITLE_PREFIX + blockJson.title;
  }

  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2) + '\n');
};

/**
 * Remove removed-from-compile deprecation fields from block.json (used when re-activating without full regen).
 */
export const clearBlockDeprecated = (blockDir: string): void => {
  const blockJsonPath = path.join(blockDir, 'block.json');
  if (!fs.existsSync(blockJsonPath)) {
    return;
  }

  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf-8')) as Record<string, unknown>;

  if (blockJson.__handoff && typeof blockJson.__handoff === 'object') {
    const handoff = blockJson.__handoff as Record<string, unknown>;
    delete handoff.removedFromHandoff;
    delete handoff.removedFromHandoffAt;
    delete handoff.removedFromHandoffReason;
    if (Object.keys(handoff).length === 0) {
      delete blockJson.__handoff;
    }
  }

  if (blockJson.supports && typeof blockJson.supports === 'object') {
    const supports = blockJson.supports as Record<string, unknown>;
    if (supports.inserter === false) {
      delete supports.inserter;
    }
    if (Object.keys(supports).length === 0) {
      delete blockJson.supports;
    }
  }

  if (typeof blockJson.title === 'string' && blockJson.title.startsWith(DEPRECATED_TITLE_PREFIX)) {
    blockJson.title = blockJson.title.slice(DEPRECATED_TITLE_PREFIX.length);
  }

  fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2) + '\n');
};

/**
 * Compare local block dirs to active compile slugs; mark orphans as deprecated.
 */
export const reconcileLocalBlocks = (
  outputDir: string,
  activeSlugs: Set<string>
): ReconcileResult => {
  const result: ReconcileResult = { marked: [], alreadyDeprecated: [] };

  for (const slug of listLocalBlockSlugs(outputDir)) {
    if (activeSlugs.has(slug)) {
      continue;
    }

    const blockDir = path.join(outputDir, slug);
    const blockJsonPath = path.join(blockDir, 'block.json');
    let already = false;
    try {
      const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, 'utf-8')) as Record<string, unknown>;
      const handoff = blockJson.__handoff as Record<string, unknown> | undefined;
      already = handoff?.removedFromHandoff === true;
    } catch {
      // treat as not yet deprecated
    }

    markBlockDeprecated(blockDir);
    if (already) {
      result.alreadyDeprecated.push(slug);
    } else {
      result.marked.push(slug);
    }
  }

  return result;
};
