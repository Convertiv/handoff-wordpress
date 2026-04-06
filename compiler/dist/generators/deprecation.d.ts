/**
 * Deprecation Generator
 *
 * Generates Gutenberg `deprecated` array entries from schema history.
 * Each historical schema version becomes a deprecation entry with
 * isEligible / migrate / save functions so WordPress can automatically
 * transform old attributes when a post is opened in the editor.
 */
import { PropertySchema, SchemaHistoryEntry } from '../validators/property-manifest';
interface MigrationOverrides {
    renames?: Record<string, string>;
    transforms?: Record<string, {
        from: string;
        to: string;
        rule: string;
    }>;
}
/**
 * Generate the full deprecated array as a JS string for inclusion in index.js.
 * Returns an empty string if the component has no history (no deprecations needed).
 */
export declare const generateDeprecations: (entry: SchemaHistoryEntry | undefined, currentSchema: Record<string, PropertySchema>, overridesMap?: Record<string, MigrationOverrides>, useInnerBlocks?: boolean) => string;
/**
 * Generate a schema-changelog.json for a block.
 */
export declare const generateSchemaChangelog: (blockName: string, entry: SchemaHistoryEntry | undefined) => string;
export {};
