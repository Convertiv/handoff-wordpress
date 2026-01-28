/**
 * Node conversion utilities for the Handlebars to JSX transpiler
 */

import { HTMLElement, TextNode, Node } from 'node-html-parser';
import { TranspilerContext } from './types';
import { DANGEROUS_HTML_PLACEHOLDER } from './constants';
import { isSelfClosing } from './utils';
import { transpileExpression } from './expression-parser';
import { convertAttributes } from './attributes';

/**
 * Process handlebars expressions in text
 */
export const processTextContent = (text: string, context: TranspilerContext, loopVar: string = 'item'): string => {
  if (!text.trim()) return '';
  
  let result = text;
  
  // First handle triple-brace expressions (unescaped HTML/rich text)
  // Convert {{{expression}}} to a span with dangerouslySetInnerHTML
  // Use a placeholder to avoid the double-brace regex consuming the {{ __html: }} syntax
  result = result.replace(
    /\{\{\{\s*([^}]+?)\s*\}\}\}/g,
    (match, expr) => {
      const transpiled = transpileExpression(expr.trim(), context, loopVar);
      // Use placeholder that will be replaced back after all processing
      return `<span ${DANGEROUS_HTML_PLACEHOLDER}="${transpiled}" />`;
    }
  );
  
  // Then handle double-brace expressions (escaped text)
  // Convert {{expression}} to {expression}
  result = result.replace(
    /\{\{+\s*([^#\/!][^}]*?)\s*\}+\}/g,
    (match, expr) => {
      const transpiled = transpileExpression(expr.trim(), context, loopVar);
      return `{${transpiled}}`;
    }
  );
  
  // Restore dangerouslySetInnerHTML with proper JSX syntax
  result = result.replace(
    new RegExp(`${DANGEROUS_HTML_PLACEHOLDER}="([^"]+)"`, 'g'),
    (_, expr) => `dangerouslySetInnerHTML={{ __html: ${expr} || '' }}`
  );
  
  return result;
};

/**
 * Convert an HTML node to JSX
 */
export const nodeToJsx = (node: Node, context: TranspilerContext, loopVar: string = 'item'): string => {
  if (node instanceof TextNode) {
    const text = node.text;
    if (!text.trim()) return '';
    return processTextContent(text, context, loopVar);
  }
  
  if (node instanceof HTMLElement) {
    const tagName = node.tagName?.toLowerCase();
    
    if (!tagName) {
      return node.childNodes.map(child => nodeToJsx(child, context, loopVar)).join('\n');
    }
    
    // Skip script and style tags
    if (tagName === 'script' || tagName === 'style') {
      return '';
    }
    
    let attrs = convertAttributes(node, context);
    
    // For anchor tags, remove href to prevent navigation in the editor
    // This allows clicks to work normally for editing content inside links
    if (tagName === 'a') {
      // Remove href attribute - it will be a non-navigating anchor in the editor
      attrs = attrs.replace(/\s*href=\{[^}]+\}/g, '').replace(/\s*href="[^"]*"/g, '').trim();
    }
    
    const attrStr = attrs ? ` ${attrs}` : '';
    
    // Handle self-closing tags
    if (isSelfClosing(tagName)) {
      return `<${tagName}${attrStr} />`;
    }
    
    // Process children
    const children = node.childNodes
      .map(child => nodeToJsx(child, context, loopVar))
      .filter(Boolean)
      .join('\n');
    
    if (!children) {
      return `<${tagName}${attrStr}></${tagName}>`;
    }
    
    return `<${tagName}${attrStr}>\n${children}\n</${tagName}>`;
  }
  
  return '';
};
