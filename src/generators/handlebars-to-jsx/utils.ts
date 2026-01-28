/**
 * Utility functions for the Handlebars to JSX transpiler
 */

import { HTML_TO_JSX_ATTR_MAP, SELF_CLOSING_TAGS } from './constants';

/**
 * Convert snake_case to camelCase
 */
export const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Convert CSS property name to camelCase for React style objects
 */
export const cssToCamelCase = (prop: string): string => {
  return prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Check if element is self-closing
 */
export const isSelfClosing = (tagName: string): boolean => {
  return SELF_CLOSING_TAGS.includes(tagName.toLowerCase());
};

/**
 * Convert an HTML/SVG attribute name to its JSX equivalent
 */
export const toJsxAttrName = (name: string): string => {
  // Check the lookup map first
  if (HTML_TO_JSX_ATTR_MAP[name]) {
    return HTML_TO_JSX_ATTR_MAP[name];
  }
  
  // Handle any remaining namespaced attributes (prefix:suffix -> prefixSuffix)
  if (name.includes(':')) {
    const [prefix, suffix] = name.split(':');
    return prefix + suffix.charAt(0).toUpperCase() + suffix.slice(1);
  }
  
  // Handle any remaining hyphenated attributes (convert to camelCase)
  if (name.includes('-')) {
    return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  
  return name;
};

/**
 * Normalize whitespace - collapse newlines and multiple spaces into single space
 */
export const normalizeWhitespace = (str: string): string => {
  return str.replace(/\s+/g, ' ').trim();
};

/**
 * Find matching closing tag for a block helper, handling nesting
 */
export const findMatchingClose = (template: string, openTag: string, closeTag: string, startPos: number): number => {
  let depth = 1;
  let pos = startPos;
  
  while (depth > 0 && pos < template.length) {
    const nextOpen = template.indexOf(openTag, pos);
    const nextClose = template.indexOf(closeTag, pos);
    
    if (nextClose === -1) return -1;
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }
  
  return -1;
};

/**
 * Check if a position in the template is inside an HTML attribute value
 */
export const isInsideAttribute = (template: string, pos: number): boolean => {
  // Look backwards from pos to find if we're inside an attribute
  let inTag = false;
  let inAttrValue = false;
  let attrQuote = '';
  
  for (let i = 0; i < pos; i++) {
    const char = template[i];
    const prevChar = i > 0 ? template[i - 1] : '';
    
    if (!inTag && char === '<' && template[i + 1] !== '/') {
      inTag = true;
      inAttrValue = false;
    } else if (inTag && char === '>') {
      inTag = false;
      inAttrValue = false;
      attrQuote = '';
    } else if (inTag && !inAttrValue && (char === '"' || char === "'")) {
      // Starting an attribute value
      inAttrValue = true;
      attrQuote = char;
    } else if (inTag && inAttrValue && char === attrQuote && prevChar !== '\\') {
      // Ending an attribute value
      inAttrValue = false;
      attrQuote = '';
    }
  }
  
  return inAttrValue;
};
