/**
 * Field lookup utilities for the Handlebars to JSX transpiler
 */
import { HandoffProperty } from '../../types';
/**
 * Look up a field type from the properties object using dot notation path
 * e.g., "title" -> properties.title.type
 * e.g., "button.text" -> properties.button.properties.text.type
 * e.g., "breadcrumbs.label" -> properties.breadcrumbs.items.properties.label.type
 *
 * Returns null if the field path doesn't resolve to a known property.
 * This allows callers to decide how to handle unresolved fields.
 */
export declare const lookupFieldType: (fieldPath: string, properties: Record<string, HandoffProperty>) => string | null;
