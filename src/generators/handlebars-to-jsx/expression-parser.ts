/**
 * Expression parsing utilities for Handlebars to JSX transpilation
 */

import { TranspilerContext } from './types';
import { toCamelCase } from './utils';

/**
 * Transpile a Handlebars path expression to JSX
 */
export const transpileExpression = (expr: string, context: TranspilerContext, loopVar: string = 'item'): string => {
  expr = expr.trim();
  
  // Handle triple braces (unescaped) - strip the extra brace
  expr = expr.replace(/^\{+|\}+$/g, '');
  
  // Handle ../ parent context references - strip the ../ prefix(es) and process as top-level
  // This allows accessing parent context from inside loops: ../properties.xxx -> properties.xxx
  // Multiple levels like ../../properties.xxx are also handled
  while (expr.startsWith('../')) {
    expr = expr.substring(3);
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
    const path = expr.replace('this.', '');
    if (path.includes('.')) {
      const parts = path.split('.');
      return `${loopVar}.${parts.join('?.')}`;
    }
    return `${loopVar}.${path}`;
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

/**
 * Parse Handlebars helper expressions like (eq properties.layout "layout-1")
 * and convert to JavaScript comparison expressions
 */
export const parseHelperExpression = (expr: string): string => {
  // Match (eq left right) or (eq left "string")
  const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
  if (eqMatch) {
    const [, left, right] = eqMatch;
    // Convert the left side (e.g., properties.layout -> layout)
    let leftExpr = left;
    if (left.startsWith('properties.')) {
      leftExpr = toCamelCase(left.replace('properties.', ''));
    } else if (left.startsWith('this.')) {
      leftExpr = `item.${left.replace('this.', '')}`;
    }
    return `${leftExpr} === "${right}"`;
  }
  
  // Match (eq left variable) without quotes
  const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (eqVarMatch) {
    const [, left, right] = eqVarMatch;
    let leftExpr = left;
    let rightExpr = right;
    
    if (left.startsWith('properties.')) {
      leftExpr = toCamelCase(left.replace('properties.', ''));
    } else if (left.startsWith('this.')) {
      leftExpr = `item.${left.replace('this.', '')}`;
    }
    
    if (right.startsWith('properties.')) {
      rightExpr = toCamelCase(right.replace('properties.', ''));
    } else if (right.startsWith('this.')) {
      rightExpr = `item.${right.replace('this.', '')}`;
    }
    
    return `${leftExpr} === ${rightExpr}`;
  }
  
  // Match (ne left "string") - not equal
  const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
  if (neMatch) {
    const [, left, right] = neMatch;
    let leftExpr = left;
    if (left.startsWith('properties.')) {
      leftExpr = toCamelCase(left.replace('properties.', ''));
    } else if (left.startsWith('this.')) {
      leftExpr = `item.${left.replace('this.', '')}`;
    }
    return `${leftExpr} !== "${right}"`;
  }
  
  // Match (gt left right) - greater than
  const gtMatch = expr.match(/^\(\s*gt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (gtMatch) {
    const [, left, right] = gtMatch;
    let leftExpr = left.startsWith('properties.') ? toCamelCase(left.replace('properties.', '')) : left;
    let rightExpr = right.startsWith('properties.') ? toCamelCase(right.replace('properties.', '')) : right;
    return `${leftExpr} > ${rightExpr}`;
  }
  
  // Match (lt left right) - less than
  const ltMatch = expr.match(/^\(\s*lt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (ltMatch) {
    const [, left, right] = ltMatch;
    let leftExpr = left.startsWith('properties.') ? toCamelCase(left.replace('properties.', '')) : left;
    let rightExpr = right.startsWith('properties.') ? toCamelCase(right.replace('properties.', '')) : right;
    return `${leftExpr} < ${rightExpr}`;
  }
  
  // Match (gte left right) - greater than or equal
  const gteMatch = expr.match(/^\(\s*gte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (gteMatch) {
    const [, left, right] = gteMatch;
    let leftExpr = left.startsWith('properties.') ? toCamelCase(left.replace('properties.', '')) : left;
    let rightExpr = right.startsWith('properties.') ? toCamelCase(right.replace('properties.', '')) : right;
    return `${leftExpr} >= ${rightExpr}`;
  }
  
  // Match (lte left right) - less than or equal
  const lteMatch = expr.match(/^\(\s*lte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
  if (lteMatch) {
    const [, left, right] = lteMatch;
    let leftExpr = left.startsWith('properties.') ? toCamelCase(left.replace('properties.', '')) : left;
    let rightExpr = right.startsWith('properties.') ? toCamelCase(right.replace('properties.', '')) : right;
    return `${leftExpr} <= ${rightExpr}`;
  }
  
  // Match (and expr1 expr2) - logical and
  const andMatch = expr.match(/^\(\s*and\s+(.+)\s+(.+)\s*\)$/);
  if (andMatch) {
    const [, left, right] = andMatch;
    const leftExpr = parseHelperExpression(left.trim()) || left.trim();
    const rightExpr = parseHelperExpression(right.trim()) || right.trim();
    return `(${leftExpr}) && (${rightExpr})`;
  }
  
  // Match (or expr1 expr2) - logical or
  const orMatch = expr.match(/^\(\s*or\s+(.+)\s+(.+)\s*\)$/);
  if (orMatch) {
    const [, left, right] = orMatch;
    const leftExpr = parseHelperExpression(left.trim()) || left.trim();
    const rightExpr = parseHelperExpression(right.trim()) || right.trim();
    return `(${leftExpr}) || (${rightExpr})`;
  }
  
  // Match (not expr) - logical not
  const notMatch = expr.match(/^\(\s*not\s+(.+)\s*\)$/);
  if (notMatch) {
    const [, inner] = notMatch;
    const innerExpr = parseHelperExpression(inner.trim()) || inner.trim();
    return `!(${innerExpr})`;
  }
  
  // Not a recognized helper, return empty string
  return '';
};
