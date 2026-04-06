/**
 * Schema History - Tracks property schemas across compilations with
 * versioned history to detect breaking changes and enable automatic
 * Gutenberg block deprecation generation.
 */
import { HandoffComponent, HandoffProperty } from '../types';
/**
 * Recursive property schema that fully describes nested structures
 */
export interface PropertySchema {
    type: string;
    properties?: Record<string, PropertySchema>;
    items?: PropertySchema;
}
export interface SchemaHistoryVersion {
    version: number;
    schema: Record<string, PropertySchema>;
    changedAt: string;
    changes: PropertyChange[];
}
export interface SchemaHistoryEntry {
    componentId: string;
    componentTitle: string;
    schemaVersion: number;
    current: Record<string, PropertySchema>;
    lastUpdated: string;
    history: SchemaHistoryVersion[];
}
export interface SchemaHistory {
    version: string;
    components: Record<string, SchemaHistoryEntry>;
}
/** @deprecated Kept for backward-compat loading of old property-manifest.json */
export interface PropertyManifestEntry {
    componentId: string;
    componentTitle: string;
    properties: Record<string, PropertySchema>;
    lastUpdated: string;
}
/** @deprecated Kept for backward-compat loading of old property-manifest.json */
export interface PropertyManifest {
    version: string;
    components: Record<string, PropertyManifestEntry>;
}
export interface PropertyChange {
    type: 'added' | 'removed' | 'type_changed';
    propertyPath: string;
    oldType?: string;
    newType?: string;
    message: string;
}
export interface ValidationResult {
    componentId: string;
    componentTitle: string;
    isValid: boolean;
    changes: PropertyChange[];
    isNew: boolean;
}
/**
 * Load the schema history from disk, migrating from the legacy format if needed.
 */
export declare const loadManifest: (outputDir: string) => SchemaHistory;
/**
 * Save the schema history to disk
 */
export declare const saveManifest: (outputDir: string, history: SchemaHistory) => void;
/**
 * Extract all property schemas from a component
 */
export declare const extractProperties: (properties: Record<string, HandoffProperty>) => Record<string, PropertySchema>;
/**
 * Compare current properties against the stored history entry
 */
export declare const validateComponent: (component: HandoffComponent, history: SchemaHistory) => ValidationResult;
/**
 * Update the history with the current component properties.
 * If there are breaking changes, the old schema is pushed to history
 * and the schema version is incremented.
 */
export declare const updateManifest: (component: HandoffComponent, history: SchemaHistory) => SchemaHistory;
/**
 * Get the full history entry for a component (used by deprecation generator)
 */
export declare const getComponentHistory: (history: SchemaHistory, componentId: string) => SchemaHistoryEntry | undefined;
/**
 * Format validation results for console output
 */
export declare const formatValidationResult: (result: ValidationResult) => string;
