/**
 * Expression parsing utilities for Handlebars to JSX transpilation
 */

import { TranspilerContext } from './types';
import { toCamelCase } from './utils';

/**
 * Transpile a Handlebars path expression to JSX
 */
/**
 * Replace every occurrence of ../properties.xxx (parent context) in an expression
 * with the JSX form (camelCase). Used for compound expressions like
 * {{../properties.columnCount === "three" ? 'a' : 'b'}} inside loops.
 * Also handles @root.properties.xxx which is semantically equivalent to the
 * root-context properties.xxx (standard Handlebars data variable).
 * Exported for use in attribute conversion.
 */
export const resolveParentPropertiesInExpression = (expr: string): string => {
  const resolve = (_match: string, path: string) => {
    const parts = path.split('.');
    const first = toCamelCase(parts[0]);
    return parts.length > 1 ? `${first}?.${parts.slice(1).join('?.')}` : first;
  };
  let result = expr.replace(
    /\.\.\/+properties\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
    resolve
  );
  result = result.replace(
    /@root\.properties\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
    resolve
  );
  return result;
};

/** Turn `root` + dotted path into optional-chained access (e.g. cta + image.alt → cta.image?.alt). */
export const toOptionalChainedAccess = (root: string, path: string): string => {
  if (!path.includes('.')) {
    return `${root}.${path}`;
  }
  return `${root}.${path.split('.').join('?.')}`;
};

export const transpileExpression = (expr: string, context: TranspilerContext, loopVar: string = 'item'): string => {
  expr = expr.trim();
  
  // Handle triple braces (unescaped) - strip the extra brace
  expr = expr.replace(/^\{+|\}+$/g, '');

  // Negated conditions from {{#unless properties.xxx}} blocks: !(properties.foo) or !properties.foo
  const negWrappedMatch = expr.match(/^!\((.+)\)$/s);
  if (negWrappedMatch) {
    const inner = transpileExpression(negWrappedMatch[1].trim(), context, loopVar);
    return `!(${inner})`;
  }
  if (expr.startsWith('!properties.')) {
    const inner = transpileExpression(expr.slice(1), context, loopVar);
    return `!(${inner})`;
  }
  
  // Resolve ALL ../properties.xxx and @root.properties.xxx in the expression (for compound expressions like ternaries)
  expr = resolveParentPropertiesInExpression(expr);
  
  // Handle ../ parent context references - strip the ../ prefix(es) and process as top-level
  // This allows accessing parent context from inside loops: ../properties.xxx -> properties.xxx
  // Multiple levels like ../../properties.xxx are also handled
  while (expr.startsWith('../')) {
    expr = expr.substring(3);
  }
  
  // Handle @root. prefix - resolves from the top-level context regardless of nesting depth
  // e.g. @root.properties.xxx -> properties.xxx
  if (expr.startsWith('@root.')) {
    expr = expr.substring(6);
  }
  
  // Handle simple {{this}} - refers to current item in scalar array
  if (expr === 'this') {
    return loopVar;
  }
  
  // Handle properties.xxx.yyy
  if (expr.startsWith('properties.')) {
    const parts = expr.replace('properties.', '').split('.');
    const propName = toCamelCase(parts[0]);
    if (parts.length > 1) {
      // Keep 'src' as-is to match Handoff's image property naming
      return `${propName}?.${parts.slice(1).join('?.')}`;
    }
    return propName;
  }
  
  // Handle this.xxx (inside loops)
  if (expr.startsWith('this.')) {
    return toOptionalChainedAccess(loopVar, expr.replace('this.', ''));
  }

  // Handle alias/object dotted paths (e.g. column.cta.style in attribute values)
  if (/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)+$/.test(expr)) {
    const parts = expr.split('.');
    if (parts[0] === loopVar) {
      return toOptionalChainedAccess(loopVar, parts.slice(1).join('.'));
    }
    return parts.join('?.');
  }
  
  // Handle @index, @first, @last
  if (expr === '@index') {
    return 'index';
  }
  if (expr === '@first') {
    return 'index === 0';
  }
  if (expr === '@last') {
    const arrayName = context.loopArray || 'items';
    return `index === ${arrayName}?.length - 1`;
  }
  
  return expr;
};

/** Transpile a helper comparison operand (eq/ne/gt left side, etc.) to JSX. */
const transpileHelperOperand = (operand: string, loopVar: string = 'item'): string => {
  if (operand.startsWith('properties.')) {
    const path = operand.replace('properties.', '');
    const parts = path.split('.');
    const first = toCamelCase(parts[0]);
    return parts.length > 1 ? `${first}?.${parts.slice(1).join('?.')}` : first;
  }
  if (operand.startsWith('this.')) {
    return toOptionalChainedAccess(loopVar, operand.replace('this.', ''));
  }
  return transpileExpression(operand, {} as TranspilerContext, loopVar);
};

/**
 * Parse Handlebars helper expressions like (eq properties.layout "layout-1")
 * and convert to JavaScript comparison expressions
 */
export const parseHelperExpression = (expr: string, loopVar: string = 'item'): string => {
  // Normalize ../properties.xxx and @root.properties.xxx in the expression first
  expr = resolveParentPropertiesInExpression(expr);
  // Match (eq left right) or (eq left "string")
  const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
  if (eqMatch) {
    const [, left, right] = eqMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    return `${leftExpr} === "${right}"`;
  }
  
  // Match (eq left variable) without quotes
  const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (eqVarMatch) {
    const [, left, right] = eqVarMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    const rightExpr = transpileHelperOperand(right, loopVar);
    return `${leftExpr} === ${rightExpr}`;
  }
  
  // Match (ne left "string") - not equal
  const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
  if (neMatch) {
    const [, left, right] = neMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    return `${leftExpr} !== "${right}"`;
  }
  
  // Match (gt left right) - greater than
  const gtMatch = expr.match(/^\(\s*gt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (gtMatch) {
    const [, left, right] = gtMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    const rightExpr = transpileHelperOperand(right, loopVar);
    return `${leftExpr} > ${rightExpr}`;
  }
  
  // Match (lt left right) - less than
  const ltMatch = expr.match(/^\(\s*lt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (ltMatch) {
    const [, left, right] = ltMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    const rightExpr = transpileHelperOperand(right, loopVar);
    return `${leftExpr} < ${rightExpr}`;
  }
  
  // Match (gte left right) - greater than or equal
  const gteMatch = expr.match(/^\(\s*gte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (gteMatch) {
    const [, left, right] = gteMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    const rightExpr = transpileHelperOperand(right, loopVar);
    return `${leftExpr} >= ${rightExpr}`;
  }
  
  // Match (lte left right) - less than or equal
  const lteMatch = expr.match(/^\(\s*lte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (lteMatch) {
    const [, left, right] = lteMatch;
    const leftExpr = transpileHelperOperand(left, loopVar);
    const rightExpr = transpileHelperOperand(right, loopVar);
    return `${leftExpr} <= ${rightExpr}`;
  }
  
  // Match (and expr1 expr2) - logical and
  const andMatch = expr.match(/^\(\s*and\s+(.+)\s+(.+)\s*\)$/);
  if (andMatch) {
    const [, left, right] = andMatch;
    const leftExpr = parseHelperExpression(left.trim(), loopVar) || left.trim();
    const rightExpr = parseHelperExpression(right.trim(), loopVar) || right.trim();
    return `(${leftExpr}) && (${rightExpr})`;
  }
  
  // Match (or expr1 expr2) - logical or
  const orMatch = expr.match(/^\(\s*or\s+(.+)\s+(.+)\s*\)$/);
  if (orMatch) {
    const [, left, right] = orMatch;
    const leftExpr = parseHelperExpression(left.trim(), loopVar) || left.trim();
    const rightExpr = parseHelperExpression(right.trim(), loopVar) || right.trim();
    return `(${leftExpr}) || (${rightExpr})`;
  }
  
  // Match (not expr) - logical not
  const notMatch = expr.match(/^\(\s*not\s+(.+)\s*\)$/);
  if (notMatch) {
    const [, inner] = notMatch;
    const innerExpr = parseHelperExpression(inner.trim(), loopVar) || inner.trim();
    return `!(${innerExpr})`;
  }
  
  // Not a recognized helper, return empty string
  return '';
};
