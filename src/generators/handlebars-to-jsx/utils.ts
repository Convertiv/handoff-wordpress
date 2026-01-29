/**
 * Utility functions for the Handlebars to JSX transpiler
 */

import { HTML_TO_JSX_ATTR_MAP, SELF_CLOSING_TAGS } from './constants';

/**
 * JavaScript/TypeScript reserved words that cannot be used as identifiers
 */
const JS_RESERVED_WORDS = new Set([
  // JavaScript keywords
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new',
  'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
  // Future reserved words
  'class', 'const', 'enum', 'export', 'extends', 'import', 'super',
  // Strict mode reserved words
  'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static', 'yield',
  // Literals
  'null', 'true', 'false',
  // ES6+ additions
  'await', 'async',
  // Common global objects that could cause issues
  'arguments', 'eval',
  // TypeScript keywords
  'any', 'as', 'boolean', 'constructor', 'declare', 'get', 'module', 'namespace',
  'never', 'readonly', 'require', 'number', 'object', 'set', 'string', 'symbol', 'type', 'from', 'of'
]);

/**
 * Check if a name is a JavaScript reserved word
 */
export const isReservedWord = (name: string): boolean => {
  return JS_RESERVED_WORDS.has(name.toLowerCase());
};

/**
 * Sanitize a name if it's a reserved word by prefixing with 'block'
 * e.g., 'super' -> 'blockSuper', 'class' -> 'blockClass'
 */
export const sanitizeReservedName = (name: string): string => {
  if (isReservedWord(name)) {
    // Prefix with 'block' and capitalize the first letter of the original name
    return 'block' + name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return name;
};

/**
 * Convert snake_case to camelCase, sanitizing reserved words
 */
export const toCamelCase = (str: string): string => {
  const camelCased = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return sanitizeReservedName(camelCased);
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
