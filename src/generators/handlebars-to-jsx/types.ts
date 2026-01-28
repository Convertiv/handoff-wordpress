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
}

export interface FieldInfo {
  path: string;
  type: string;
  content: string;
}
