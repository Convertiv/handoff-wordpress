/**
 * Template Variable Validator
 *
 * Validates that all variables referenced in a Handlebars template
 * are declared in the component's properties.
 */
import { HandoffComponent } from '../types';
export interface TemplateVariableError {
    variable: string;
    line?: number;
    context: string;
    message: string;
}
export interface TemplateValidationResult {
    componentId: string;
    componentTitle: string;
    isValid: boolean;
    errors: TemplateVariableError[];
    warnings: TemplateVariableError[];
}
/**
 * Validate all template variables against component properties
 */
export declare const validateTemplateVariables: (component: HandoffComponent) => TemplateValidationResult;
/**
 * Format validation result for console output
 */
export declare const formatTemplateValidationResult: (result: TemplateValidationResult) => string;
