/**
 * Expression parsing utilities for Handlebars to JSX transpilation
 */
import { TranspilerContext } from './types';
/**
 * Transpile a Handlebars path expression to JSX
 */
/**
 * Replace every occurrence of ../properties.xxx (parent context) in an expression
 * with the JSX form (camelCase). Used for compound expressions like
 * {{../properties.columnCount === "three" ? 'a' : 'b'}} inside loops.
 * Exported for use in attribute conversion.
 */
export declare const resolveParentPropertiesInExpression: (expr: string) => string;
export declare const transpileExpression: (expr: string, context: TranspilerContext, loopVar?: string) => string;
/**
 * Parse Handlebars helper expressions like (eq properties.layout "layout-1")
 * and convert to JavaScript comparison expressions
 */
export declare const parseHelperExpression: (expr: string) => string;
