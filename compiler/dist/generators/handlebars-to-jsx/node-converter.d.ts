/**
 * Node conversion utilities for the Handlebars to JSX transpiler
 */
import { Node } from 'node-html-parser';
import { TranspilerContext } from './types';
/**
 * Process handlebars expressions in text
 */
export declare const processTextContent: (text: string, context: TranspilerContext, loopVar?: string) => string;
/**
 * Convert an HTML node to JSX
 */
export declare const nodeToJsx: (node: Node, context: TranspilerContext, loopVar?: string) => string;
