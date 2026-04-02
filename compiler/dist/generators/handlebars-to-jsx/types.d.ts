/**
 * Type definitions for the Handlebars to JSX transpiler
 */
import { HandoffProperty } from '../../types';
export interface TranspilerContext {
    properties: Record<string, HandoffProperty>;
    indent: string;
    loopVariable?: string;
    loopIndex?: string;
    loopArray?: string;
    inLoop: boolean;
}
export interface ConvertedAttributeValue {
    jsxValue: string;
    isExpression: boolean;
}
export interface TranspileResult {
    jsx: string;
    needsFragment: boolean;
    /** Field paths that have inline editing on the canvas (text, image, link, button) */
    inlineEditableFields: Set<string>;
}
export interface FieldInfo {
    path: string;
    type: string;
    content: string;
}
