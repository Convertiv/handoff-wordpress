/**
 * Property Manifest - Tracks property names across compilations
 * to detect breaking changes to WordPress data structures
 */
import { HandoffComponent } from '../types';
/**
 * Recursive property schema that fully describes nested structures
 */
export interface PropertySchema {
    type: string;
    properties?: Record<string, PropertySchema>;
    items?: PropertySchema;
}
export interface PropertyManifestEntry {
    componentId: string;
    componentTitle: string;
    properties: Record<string, PropertySchema>;
    lastUpdated: string;
}
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
 * Load the property manifest from disk
 */
export declare const loadManifest: (outputDir: string) => PropertyManifest;
/**
 * Save the property manifest to disk
 */
export declare const saveManifest: (outputDir: string, manifest: PropertyManifest) => void;
/**
 * Compare current properties against the manifest
 */
export declare const validateComponent: (component: HandoffComponent, manifest: PropertyManifest) => ValidationResult;
/**
 * Update the manifest with the current component properties
 */
export declare const updateManifest: (component: HandoffComponent, manifest: PropertyManifest) => PropertyManifest;
/**
 * Format validation results for console output
 */
export declare const formatValidationResult: (result: ValidationResult) => string;
