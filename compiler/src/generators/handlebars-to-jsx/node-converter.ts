/**
 * Node conversion utilities for the Handlebars to JSX transpiler
 */

import { HTMLElement, TextNode, Node } from 'node-html-parser';
import { TranspilerContext } from './types';
import { DANGEROUS_HTML_PLACEHOLDER } from './constants';
import { isSelfClosing } from './utils';
import { transpileExpression } from './expression-parser';
import { convertAttributes } from './attributes';
import { attrsMatchCanvasButtonPatterns } from '../canvas-shim';

/**
 * Design-system anchors use class "button" but must not be <a> in the editor (RichText + wp-core-ui).
 */
const isHandoffDesignSystemButton = (
  tagName: string,
  attrs: string,
  context: TranspilerContext,
): boolean =>
  tagName === 'a' &&
  (attrsMatchCanvasButtonPatterns(attrs, context.editorConfig) ||
    /\bbutton\b/.test(attrs) ||
    /\bbutton--/.test(attrs));

const appendHandoffCanvasButtonClass = (attrs: string): string => {
  if (attrs.includes('handoff-canvas-button')) {
    return attrs;
  }
  if (/className="([^"]*)"/.test(attrs)) {
    return attrs.replace(/className="([^"]*)"/, 'className="$1 handoff-canvas-button"');
  }
  // Static template literal: className={`button button--md`}
  if (/className=\{`[^`]*`\}/.test(attrs)) {
    return attrs.replace(/`\}/, ' handoff-canvas-button`}');
  }
  // Template literal with expressions: className={`button … ${variant}`}
  if (/className=\{`[\s\S]*?`\}/.test(attrs)) {
    return attrs.replace(/`\}/, ' handoff-canvas-button`}');
  }
  if (/className=\{String\(\s*/.test(attrs)) {
    return attrs.replace(
      /className=\{String\(\s*([^)]+)\s*\)\}/,
      'className={`${String($1 ?? \'\')} handoff-canvas-button`}',
    );
  }
  const trimmed = attrs.trim();
  return trimmed ? `${trimmed} className="handoff-canvas-button"` : 'className="handoff-canvas-button"';
};

const convertDesignSystemAnchorForEditor = (
  tagName: string,
  attrs: string,
  context: TranspilerContext,
): { tagName: string; attrs: string } => {
  if (!isHandoffDesignSystemButton(tagName, attrs, context)) {
    return { tagName, attrs };
  }
  let nextAttrs = attrs
    .replace(/\s*href=\{[^}]+\}/g, '')
    .replace(/\s*href="[^"]*"/g, '')
    .trim();
  nextAttrs = appendHandoffCanvasButtonClass(nextAttrs);
  return { tagName: 'span', attrs: nextAttrs };
};

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
export const nodeToJsx = (node: Node, context: TranspilerContext, loopVar?: string): string => {
  // Use provided loopVar, then context.loopVariable, then default to 'item'
  const effectiveLoopVar = loopVar || context.loopVariable || 'item';
  
  if (node instanceof TextNode) {
    const text = node.text;
    if (!text.trim()) return '';
    return processTextContent(text, context, effectiveLoopVar);
  }
  
  if (node instanceof HTMLElement) {
    let tagName = node.tagName?.toLowerCase();
    
    if (!tagName) {
      return node.childNodes.map(child => nodeToJsx(child, context, effectiveLoopVar)).join('\n');
    }
    
    // Skip script and style tags
    if (tagName === 'script' || tagName === 'style') {
      return '';
    }
    
    let attrs = convertAttributes(node, context);

    // Design-system .button links → <span.handoff-canvas-button> for editor RichText + styling.
    ({ tagName, attrs } = convertDesignSystemAnchorForEditor(tagName, attrs, context));

    // Other anchors: strip href so the editor does not navigate away while editing.
    if (tagName === 'a') {
      attrs = attrs.replace(/\s*href=\{[^}]+\}/g, '').replace(/\s*href="[^"]*"/g, '').trim();
    }

    const attrStr = attrs ? ` ${attrs}` : '';
    
    // Handle self-closing tags
    if (isSelfClosing(tagName)) {
      return `<${tagName}${attrStr} />`;
    }
    
    // Process children
    const children = node.childNodes
      .map(child => nodeToJsx(child, context, effectiveLoopVar))
      .filter(Boolean)
      .join('\n');
    
    if (!children) {
      return `<${tagName}${attrStr}></${tagName}>`;
    }
    
    return `<${tagName}${attrStr}>\n${children}\n</${tagName}>`;
  }
  
  return '';
};
