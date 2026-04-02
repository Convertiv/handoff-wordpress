/**
 * Migration Schema Generator
 *
 * Produces a migration-schema.json per block that preserves the full Handoff
 * type system (labels, options, defaults, nested structures) alongside the
 * camelCase Gutenberg attribute name. Used by the migration admin page to
 * drive the ACF-to-Handoff mapping UI.
 */
import { HandoffComponent, HandoffProperty } from '../types';
export interface MigrationPropertySchema {
    type: string;
    attributeName?: string;
    label: string;
    description?: string;
    default?: any;
    options?: Array<{
        label: string;
        value: string;
    }>;
    properties?: Record<string, MigrationPropertySchema>;
    items?: {
        properties?: Record<string, MigrationPropertySchema>;
    };
}
export interface MigrationSchema {
    blockName: string;
    title: string;
    description: string;
    category: string;
    properties: Record<string, MigrationPropertySchema>;
}
export declare const extractMigrationProperty: (prop: HandoffProperty, includeAttributeName?: boolean, key?: string) => MigrationPropertySchema;
export declare const generateMigrationSchema: (component: HandoffComponent) => string;
