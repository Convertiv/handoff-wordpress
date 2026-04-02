/**
 * Template Variable Validator
 * 
 * Validates that all variables referenced in a Handlebars template
 * are declared in the component's properties.
 */

import { HandoffComponent, HandoffProperty } from '../types';

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
 * Context tracking for nested scopes (each, with blocks)
 */
interface ScopeContext {
  type: 'root' | 'each' | 'with' | 'field';
  variable?: string;        // The variable that opened this scope
  itemProperties?: Record<string, HandoffProperty>;  // Available properties in this scope
  blockParams?: string[];   // Named block parameters (e.g., |item| or |item index|)
}

/**
 * Extract variable names from a Handlebars expression
 * Handles: {{var}}, {{obj.prop}}, {{@index}}, {{this}}, {{this.prop}}
 */
const extractVariableFromExpression = (expr: string): string | null => {
  const trimmed = expr.trim();
  
  // Skip Handlebars built-ins, special variables, and global compiler variables
  if (trimmed.startsWith('@') || trimmed === 'this' || trimmed === 'else' || 
      trimmed === 'style' || trimmed === 'script' ||
      trimmed.startsWith('style.') || trimmed.startsWith('script.')) {
    return null;
  }
  
  // Skip helper calls with parameters (e.g., "formatDate someVar")
  // We want the first word which is typically the variable
  const parts = trimmed.split(/\s+/);
  const firstPart = parts[0];
  
  // Skip block helpers (each, if, unless, with, etc.)
  const blockHelpers = ['each', 'if', 'unless', 'with', 'field', 'lookup', 'log'];
  if (blockHelpers.includes(firstPart)) {
    return null;
  }
  
  // Skip comment
  if (firstPart.startsWith('!')) {
    return null;
  }
  
  return firstPart || null;
};

/**
 * Strip quotes from a string argument
 * Handles: "value", 'value', or unquoted value
 */
const stripQuotes = (str: string): string => {
  const trimmed = str.trim();
  // Check for double quotes
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  // Check for single quotes
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

/**
 * Parse a variable path like "leftCard.image.src" into segments
 * Also handles quoted paths like "leftCard.image"
 * Strips special prefixes like "this.", "properties.", and "../"
 */
const parseVariablePath = (varPath: string): string[] => {
  // Strip quotes first
  const unquoted = stripQuotes(varPath);
  // Handle "../" parent context references by stripping them
  // In Handlebars, ../ goes up to parent context - for validation purposes,
  // we evaluate from root properties
  let path = unquoted.replace(/^(\.\.\/)+/, '');
  // Handle "this.property" by removing "this."
  path = path.replace(/^this\./, '');
  // Handle "properties.xxx" by removing "properties." prefix
  // This is a common Handlebars pattern to access component properties
  path = path.replace(/^properties\./, '');
  return path.split('.');
};

/**
 * Convert camelCase to snake_case
 */
const toSnakeCase = (str: string): string => {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
};

/**
 * Convert snake_case to camelCase
 */
const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Find a property by name, trying both the original name and case variations
 */
const findProperty = (
  name: string,
  properties: Record<string, HandoffProperty>
): { key: string; property: HandoffProperty } | null => {
  // Try exact match first
  if (properties[name]) {
    return { key: name, property: properties[name] };
  }
  
  // Try snake_case version
  const snakeCase = toSnakeCase(name);
  if (properties[snakeCase]) {
    return { key: snakeCase, property: properties[snakeCase] };
  }
  
  // Try camelCase version
  const camelCase = toCamelCase(name);
  if (properties[camelCase]) {
    return { key: camelCase, property: properties[camelCase] };
  }
  
  return null;
};

/**
 * Check if a variable path exists in the given properties
 * Returns the resolved property or null if not found
 * Handles case variations (camelCase, snake_case)
 */
const resolveVariablePath = (
  path: string[],
  properties: Record<string, HandoffProperty>,
  arrayItemContext?: Record<string, HandoffProperty>
): { found: boolean; property?: HandoffProperty; resolvedAt?: string } => {
  if (path.length === 0) {
    return { found: false };
  }

  const [first, ...rest] = path;
  
  // First, check if we're in an array iteration context
  if (arrayItemContext) {
    const found = findProperty(first, arrayItemContext);
    if (found) {
      const prop = found.property;
      const actualKey = found.key;
      
      if (rest.length === 0) {
        return { found: true, property: prop, resolvedAt: actualKey };
      }
      
      // Continue resolving nested properties for objects
      if (prop.type === 'object' && prop.properties) {
        const nested = resolveVariablePath(rest, prop.properties);
        return {
          ...nested,
          resolvedAt: nested.found ? `${actualKey}.${nested.resolvedAt}` : undefined
        };
      }
      
      // Handle arrays within array items
      if (prop.type === 'array') {
        if (prop.items?.properties) {
          const nested = resolveVariablePath(rest, prop.items.properties);
          if (nested.found) {
            return {
              ...nested,
              resolvedAt: `${actualKey}.${nested.resolvedAt}`
            };
          }
        }
        if (prop.pagination && rest[0] === 'pagination') {
          if (rest.length === 1) {
            return { found: true, property: prop.pagination, resolvedAt: `${actualKey}.pagination` };
          }
          const paginationRest = rest.slice(1);
          if (prop.pagination.items?.properties) {
            const nested = resolveVariablePath(paginationRest, prop.pagination.items.properties);
            return {
              ...nested,
              resolvedAt: nested.found ? `${actualKey}.pagination.${nested.resolvedAt}` : undefined
            };
          }
        }
      }
      
      // Handle pagination type (resolves through items.properties like arrays)
      if (prop.type === 'pagination') {
        if (prop.items?.properties) {
          const nested = resolveVariablePath(rest, prop.items.properties);
          if (nested.found) {
            return {
              ...nested,
              resolvedAt: `${actualKey}.${nested.resolvedAt}`
            };
          }
        }
        const paginationItemProps = ['label', 'url', 'active'];
        if (rest.length === 1 && paginationItemProps.includes(rest[0])) {
          return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
        }
      }
      
      // Image has implicit src, alt, id, srcset properties
      if (prop.type === 'image') {
        const imageProps = ['src', 'alt', 'id', 'url', 'width', 'height', 'srcset', 'sizes'];
        if (rest.length === 1 && imageProps.includes(rest[0])) {
          return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
        }
      }
      
      // Video has implicit src, poster, type, width, height properties
      if (prop.type === 'video') {
        const videoProps = ['src', 'url', 'poster', 'type', 'width', 'height', 'id', 'mime', 'mimeType'];
        if (rest.length === 1 && videoProps.includes(rest[0])) {
          return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
        }
      }
      
      // Link has implicit properties
      if (prop.type === 'link') {
        const linkProps = ['label', 'url', 'text', 'opensInNewTab', 'href', 'target', 'title'];
        if (rest.length === 1 && linkProps.includes(rest[0])) {
          return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
        }
      }
      
      // Button has implicit properties
      if (prop.type === 'button') {
        const buttonProps = ['url', 'text', 'label', 'href', 'target', 'opensInNewTab', 'title', 'type', 'disabled', 'style', 'rel'];
        if (rest.length === 1 && buttonProps.includes(rest[0])) {
          return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
        }
      }
      
      // Can't resolve further
      return { found: false };
    }
  }
  
  // Check root properties (with case variation support)
  const found = findProperty(first, properties);
  if (!found) {
    return { found: false };
  }
  
  const prop = found.property;
  const actualKey = found.key;
  
  if (rest.length === 0) {
    return { found: true, property: prop, resolvedAt: actualKey };
  }
  
  // Resolve nested path for objects
  if (prop.type === 'object' && prop.properties) {
    const nested = resolveVariablePath(rest, prop.properties);
    return {
      ...nested,
      resolvedAt: nested.found ? `${actualKey}.${nested.resolvedAt}` : undefined
    };
  }
  
  // Resolve nested path for arrays - look into items.properties
  if (prop.type === 'array') {
    if (prop.items?.properties) {
      const nested = resolveVariablePath(rest, prop.items.properties);
      if (nested.found) {
        return {
          ...nested,
          resolvedAt: `${actualKey}.${nested.resolvedAt}`
        };
      }
    }
    if (prop.pagination && rest[0] === 'pagination') {
      if (rest.length === 1) {
        return { found: true, property: prop.pagination, resolvedAt: `${actualKey}.pagination` };
      }
      const paginationRest = rest.slice(1);
      if (prop.pagination.items?.properties) {
        const nested = resolveVariablePath(paginationRest, prop.pagination.items.properties);
        return {
          ...nested,
          resolvedAt: nested.found ? `${actualKey}.pagination.${nested.resolvedAt}` : undefined
        };
      }
    }
  }
  
  // Handle pagination type (resolves through items.properties like arrays)
  if (prop.type === 'pagination') {
    if (prop.items?.properties) {
      const nested = resolveVariablePath(rest, prop.items.properties);
      if (nested.found) {
        return {
          ...nested,
          resolvedAt: `${actualKey}.${nested.resolvedAt}`
        };
      }
    }
    const paginationItemProps = ['label', 'url', 'active'];
    if (rest.length === 1 && paginationItemProps.includes(rest[0])) {
      return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
    }
  }
  
  // Image has implicit src, alt, id, srcset properties
  if (prop.type === 'image') {
    const imageProps = ['src', 'alt', 'id', 'url', 'width', 'height', 'srcset', 'sizes'];
    if (rest.length === 1 && imageProps.includes(rest[0])) {
      return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
    }
  }
  
  // Video has implicit src, poster, type, width, height properties
  if (prop.type === 'video') {
    const videoProps = ['src', 'url', 'poster', 'type', 'width', 'height', 'id', 'mime', 'mimeType'];
    if (rest.length === 1 && videoProps.includes(rest[0])) {
      return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
    }
  }
  
  // Link has implicit label, url, text, opensInNewTab properties
  if (prop.type === 'link') {
    const linkProps = ['label', 'url', 'text', 'opensInNewTab', 'href', 'target', 'title'];
    if (rest.length === 1 && linkProps.includes(rest[0])) {
      return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
    }
  }
  
  // Button has implicit url, text, label properties (similar to link)
  if (prop.type === 'button') {
    const buttonProps = ['url', 'text', 'label', 'href', 'target', 'opensInNewTab', 'title', 'type', 'disabled', 'style', 'rel'];
    if (rest.length === 1 && buttonProps.includes(rest[0])) {
      return { found: true, resolvedAt: `${actualKey}.${rest[0]}` };
    }
  }
  
  // Can't resolve further
  return { found: false };
};

/**
 * Get array item properties for an array variable path
 * Handles full paths like "rightCards" or nested paths
 * Also handles case variations in property names
 * Handles different array item structures:
 * - items.properties (object items with named properties)
 * - properties (some schemas put item props here for arrays)
 * - items directly as properties object (less common)
 */
const getArrayItemProperties = (
  arrayPath: string[],
  properties: Record<string, HandoffProperty>,
  currentContext?: Record<string, HandoffProperty>
): Record<string, HandoffProperty> | null => {
  // First resolve the full path to find the array property
  const resolved = resolveVariablePath(arrayPath, properties, currentContext);
  
  if (!resolved.found || !resolved.property || (resolved.property.type !== 'array' && resolved.property.type !== 'pagination')) {
    return null;
  }
  
  const arrayProp = resolved.property;
  
  // Try items.properties first (standard structure for object arrays)
  if (arrayProp.items?.properties && Object.keys(arrayProp.items.properties).length > 0) {
    return arrayProp.items.properties;
  }
  
  // Some schemas might put properties directly on the array for item structure
  if (arrayProp.properties && Object.keys(arrayProp.properties).length > 0) {
    return arrayProp.properties;
  }
  
  // Check if items itself has HandoffProperty-like entries (some schemas might do this)
  // e.g., items: { icon: {...}, title: {...} } without a properties wrapper
  if (arrayProp.items && typeof arrayProp.items === 'object') {
    const itemsObj = arrayProp.items as Record<string, any>;
    // Check if items has properties that look like HandoffProperty objects (have 'type' field)
    const potentialProps: Record<string, HandoffProperty> = {};
    for (const [key, val] of Object.entries(itemsObj)) {
      if (key !== 'type' && key !== 'default' && key !== 'properties' && 
          val && typeof val === 'object' && 'type' in val) {
        potentialProps[key] = val as HandoffProperty;
      }
    }
    if (Object.keys(potentialProps).length > 0) {
      return potentialProps;
    }
  }
  
  return null;
};

/**
 * Validate all template variables against component properties
 */
export const validateTemplateVariables = (
  component: HandoffComponent
): TemplateValidationResult => {
  const result: TemplateValidationResult = {
    componentId: component.id,
    componentTitle: component.title,
    isValid: true,
    errors: [],
    warnings: []
  };
  
  const template = component.code;
  // Augmented properties: include implicit root-level pagination from array sub-properties
  // so that {{#if properties.pagination}} and {{#each properties.pagination}} resolve correctly
  const properties: Record<string, HandoffProperty> = { ...component.properties };
  for (const prop of Object.values(component.properties)) {
    if (prop.type === 'array' && prop.pagination && !properties['pagination']) {
      properties['pagination'] = prop.pagination;
    }
  }
  
  // Stack of contexts for nested scopes
  const contextStack: ScopeContext[] = [
    { type: 'root' }
  ];
  
  // Track line numbers for better error reporting
  const lines = template.split('\n');
  let currentLine = 1;
  let charIndex = 0;
  
  const getLineNumber = (index: number): number => {
    let line = 1;
    for (let i = 0; i < index && i < template.length; i++) {
      if (template[i] === '\n') line++;
    }
    return line;
  };
  
  // Regular expressions for Handlebars syntax
  // Matches both double {{}} and triple {{{}}} brackets
  // Triple brackets are used for unescaped/raw HTML output (common for richtext)
  // Pattern: {{{ content }}} or {{ #/prefix content }}
  const handlebarsRegex = /\{\{\{([^}]+)\}\}\}|\{\{([#/]?)([^}]+)\}\}/g;
  
  let match;
  while ((match = handlebarsRegex.exec(template)) !== null) {
    const fullMatch = match[0];
    let prefix: string;
    let content: string;
    
    if (match[1] !== undefined) {
      // Triple brackets match - group 1 has the content
      prefix = '';
      content = match[1].trim();
    } else {
      // Double brackets match - group 2 has prefix, group 3 has content
      prefix = match[2] || '';
      content = match[3].trim();
    }
    const lineNumber = getLineNumber(match.index);
    
    if (prefix === '#') {
      // Block opening: {{#each items}}, {{#with obj}}, {{#if cond}}, {{#field name}}
      const blockMatch = content.match(/^(\w+)\s*(.*)$/);
      if (blockMatch) {
        const blockType = blockMatch[1];
        const blockArg = blockMatch[2].trim();
        
        if (blockType === 'each') {
          // Parse the each argument - handle "as |blockParam|" syntax
          // Examples: "items", "properties.items", "items as |item|", "items as |item index|"
          let arrayArg = blockArg;
          let blockParams: string[] = [];
          
          // Check for "as |param1 param2|" syntax
          const asMatch = blockArg.match(/^(.+?)\s+as\s+\|([^|]+)\|$/);
          if (asMatch) {
            arrayArg = asMatch[1].trim();
            blockParams = asMatch[2].trim().split(/\s+/);
          }
          
          // Validate the array variable exists
          const arrayPath = parseVariablePath(arrayArg);
          const currentContext = contextStack[contextStack.length - 1];
          
          // Check if the first part of the path is a block parameter from a parent context
          // e.g., in {{#each posts as |post|}}, then {{#each post.tags as |tag|}}
          // "post" is a block param that refers to an array item
          const firstPart = arrayPath[0];
          let resolved: { found: boolean; property?: HandoffProperty; resolvedAt?: string };
          let blockParamContext: ScopeContext | undefined;
          
          for (let i = contextStack.length - 1; i >= 0; i--) {
            const ctx = contextStack[i];
            if (ctx.blockParams?.includes(firstPart)) {
              blockParamContext = ctx;
              break;
            }
          }
          
          if (blockParamContext && blockParamContext.itemProperties) {
            // The first part is a block parameter, resolve the rest against item properties
            if (arrayPath.length === 1) {
              // Just the block param itself - this would be weird for #each but handle it
              resolved = { found: true, resolvedAt: firstPart };
            } else {
              // Resolve the rest of the path against item properties (e.g., post.tags -> tags)
              const restPath = arrayPath.slice(1);
              resolved = resolveVariablePath(restPath, properties, blockParamContext.itemProperties);
            }
          } else {
            // Normal resolution
            resolved = resolveVariablePath(arrayPath, properties, currentContext.itemProperties);
          }
          
          if (!resolved.found) {
            result.isValid = false;
            result.errors.push({
              variable: arrayArg,
              line: lineNumber,
              context: `{{#each ${blockArg}}}`,
              message: `Array variable "${arrayArg}" is not defined in component properties`
            });
          } else if (resolved.property?.type !== 'array' && resolved.property?.type !== 'pagination') {
            result.isValid = false;
            result.errors.push({
              variable: arrayArg,
              line: lineNumber,
              context: `{{#each ${blockArg}}}`,
              message: `Variable "${arrayArg}" is not an array (found type: ${resolved.property?.type})`
            });
          }
          
          // Push array item context - get item properties from the resolved array
          // For block param references, we need to resolve from the correct context
          let itemProps: Record<string, HandoffProperty> | undefined;
          if (blockParamContext && blockParamContext.itemProperties && arrayPath.length > 1) {
            const restPath = arrayPath.slice(1);
            itemProps = getArrayItemProperties(restPath, properties, blockParamContext.itemProperties) || undefined;
          } else {
            itemProps = getArrayItemProperties(arrayPath, properties, currentContext.itemProperties) || undefined;
          }
          
          // Check if this is a simple type array (string, number, etc.) - no warning needed
          // Simple arrays use {{this}} to reference the current item
          const isSimpleTypeArray = resolved.property?.items?.type && 
            ['string', 'number', 'boolean'].includes(resolved.property.items.type);
          
          // Only warn if we couldn't find item properties AND it's not a simple type array
          if (!itemProps && resolved.found && resolved.property && !isSimpleTypeArray) {
            const arrayProp = resolved.property;
            result.warnings.push({
              variable: arrayArg,
              line: lineNumber,
              context: `{{#each ${blockArg}}}`,
              message: `Array "${arrayArg}" found but no item properties schema detected. Array has: items=${!!arrayProp.items}, items.type=${arrayProp.items?.type || 'undefined'}, items.properties=${!!arrayProp.items?.properties}, properties=${!!arrayProp.properties}`
            });
          }
          
          // Push context with block params if specified
          contextStack.push({
            type: 'each',
            variable: arrayArg,
            itemProperties: itemProps || undefined,
            blockParams: blockParams.length > 0 ? blockParams : undefined
          });
          
        } else if (blockType === 'with') {
          // Validate the object variable exists
          const objPath = parseVariablePath(blockArg);
          const resolved = resolveVariablePath(objPath, properties, contextStack[contextStack.length - 1].itemProperties);
          
          if (!resolved.found) {
            result.isValid = false;
            result.errors.push({
              variable: blockArg,
              line: lineNumber,
              context: `{{#with ${blockArg}}}`,
              message: `Object variable "${blockArg}" is not defined in component properties`
            });
          }
          
          // Push object context
          const objProp = properties[objPath[0]];
          contextStack.push({
            type: 'with',
            variable: blockArg,
            itemProperties: objProp?.properties || undefined
          });
          
        } else if (blockType === 'field') {
          const strippedArg = stripQuotes(blockArg);
          const currentContext = contextStack[contextStack.length - 1];
          
          // Pagination-related field paths are metadata annotations, not editable fields.
          // Skip validation but still push context for proper scope tracking.
          const isPaginationField = strippedArg.includes('.pagination') || strippedArg.startsWith('pagination.');
          
          if (!isPaginationField) {
            const fieldPath = parseVariablePath(strippedArg);
            const resolved = resolveVariablePath(fieldPath, properties, currentContext.itemProperties);
            
            if (!resolved.found) {
              const availableAtRoot = Object.keys(properties).join(', ');
              let errorDetail = `Field path "${strippedArg}" (parsed as: ${fieldPath.join(' -> ')}) is not defined.`;
              
              const firstPart = fieldPath[0];
              const rootProp = properties[firstPart];
              if (rootProp) {
                if (fieldPath.length > 1 && rootProp.type === 'object' && rootProp.properties) {
                  const nestedAvailable = Object.keys(rootProp.properties).join(', ');
                  errorDetail += ` "${firstPart}" exists (type: ${rootProp.type}), but "${fieldPath[1]}" not found in its properties. Available: ${nestedAvailable}`;
                } else if (fieldPath.length > 1) {
                  errorDetail += ` "${firstPart}" exists but is type "${rootProp.type}" (not an object with nested properties).`;
                }
              } else {
                errorDetail += ` Available root properties: ${availableAtRoot}`;
              }
              
              result.isValid = false;
              result.errors.push({
                variable: strippedArg,
                line: lineNumber,
                context: `{{#field ${blockArg}}}`,
                message: errorDetail
              });
            }
          }
          
          contextStack.push({
            type: 'field',
            variable: strippedArg,
            itemProperties: currentContext.itemProperties
          });
          
        } else if (blockType === 'if' || blockType === 'unless') {
          // Validate the condition variable exists (unless it's a complex expression)
          const condVar = blockArg.split(/\s+/)[0]; // Get first word
          // Skip validation for @-prefixed variables and global compiler variables (style, script)
          if (condVar && !condVar.includes('(') && !condVar.startsWith('@') && 
              condVar !== 'style' && condVar !== 'script' &&
              !condVar.startsWith('style.') && !condVar.startsWith('script.')) {
            const condPath = parseVariablePath(condVar);
            const currentContext = contextStack[contextStack.length - 1];
            const resolved = resolveVariablePath(condPath, properties, currentContext.itemProperties);
            
            if (!resolved.found) {
              // Check if it's a property reference in current context
              result.warnings.push({
                variable: condVar,
                line: lineNumber,
                context: `{{#${blockType} ${blockArg}}}`,
                message: `Condition variable "${condVar}" may not be defined in component properties`
              });
            }
          }
          // Don't push a new context for if/unless
        }
      }
      
    } else if (prefix === '/') {
      // Block closing: {{/each}}, {{/with}}, {{/if}}, {{/field}}
      const blockType = content;
      if (blockType === 'each' || blockType === 'with' || blockType === 'field') {
        if (contextStack.length > 1) {
          contextStack.pop();
        }
      }
      
    } else {
      // Skip else/else if constructs - these are part of if/unless blocks
      if (content === 'else' || content.startsWith('else ')) {
        continue;
      }
      
      // Expression: {{variable}}, {{obj.prop}}, etc.
      const varName = extractVariableFromExpression(content);
      if (varName) {
        const varPath = parseVariablePath(varName);
        const currentContext = contextStack[contextStack.length - 1];
        
        // Check if the first part of the path is a block parameter
        // e.g., in {{#each items as |item|}}, "item" is a block param
        // and "item.name" should resolve against the array's item properties
        let resolved: { found: boolean; property?: HandoffProperty; resolvedAt?: string };
        const firstPart = varPath[0];
        
        // Look through the context stack for a matching block parameter
        let blockParamContext: ScopeContext | undefined;
        for (let i = contextStack.length - 1; i >= 0; i--) {
          const ctx = contextStack[i];
          if (ctx.blockParams?.includes(firstPart)) {
            blockParamContext = ctx;
            break;
          }
        }
        
        if (blockParamContext && blockParamContext.itemProperties) {
          // The first part is a block parameter, resolve the rest against item properties
          if (varPath.length === 1) {
            // Just the block param itself (e.g., {{breadcrumb}}) - valid
            resolved = { found: true, resolvedAt: firstPart };
          } else {
            // Resolve the rest of the path against item properties (e.g., breadcrumb.label -> label)
            const restPath = varPath.slice(1);
            resolved = resolveVariablePath(restPath, properties, blockParamContext.itemProperties);
          }
        } else {
          // Normal resolution
          resolved = resolveVariablePath(varPath, properties, currentContext.itemProperties);
        }
        
        if (!resolved.found) {
          // Check if this is a loop variable reference (e.g., referencing item properties)
          if (currentContext.type === 'each') {
            if (currentContext.itemProperties) {
              // Already checked with itemProperties, definitely not found
              result.isValid = false;
              result.errors.push({
                variable: varName,
                line: lineNumber,
                context: `{{${content}}}`,
                message: `Variable "${varName}" is not defined. In {{#each ${currentContext.variable}}} context, available item properties are: ${Object.keys(currentContext.itemProperties).join(', ') || 'none'}`
              });
            } else {
              // No item properties found for this array - might be a simple array or missing schema
              result.warnings.push({
                variable: varName,
                line: lineNumber,
                context: `{{${content}}}`,
                message: `Cannot validate "${varName}" - no item properties schema found for {{#each ${currentContext.variable}}}. The array may not have defined item properties.`
              });
            }
          } else if (currentContext.type === 'with' && currentContext.itemProperties) {
            result.isValid = false;
            result.errors.push({
              variable: varName,
              line: lineNumber,
              context: `{{${content}}}`,
              message: `Variable "${varName}" is not defined in {{#with ${currentContext.variable}}} context`
            });
          } else {
            result.isValid = false;
            result.errors.push({
              variable: varName,
              line: lineNumber,
              context: `{{${content}}}`,
              message: `Variable "${varName}" is not defined in component properties. Available properties: ${Object.keys(properties).join(', ')}`
            });
          }
        }
      }
    }
  }
  
  return result;
};

/**
 * Format validation result for console output
 */
export const formatTemplateValidationResult = (result: TemplateValidationResult): string => {
  const lines: string[] = [];
  
  const icon = result.isValid ? '✅' : '❌';
  lines.push(`${icon} Template Variables: ${result.componentTitle} (${result.componentId})`);
  
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push(`   All template variables are properly defined`);
  } else {
    if (result.errors.length > 0) {
      lines.push(`   🚨 Undefined Variables:`);
      for (const error of result.errors) {
        const lineInfo = error.line ? ` (line ${error.line})` : '';
        lines.push(`      ❌ ${error.context}${lineInfo}`);
        lines.push(`         ${error.message}`);
      }
    }
    
    if (result.warnings.length > 0) {
      lines.push(`   ⚠️  Warnings:`);
      for (const warning of result.warnings) {
        const lineInfo = warning.line ? ` (line ${warning.line})` : '';
        lines.push(`      ⚠️  ${warning.context}${lineInfo}`);
        lines.push(`         ${warning.message}`);
      }
    }
  }
  
  return lines.join('\n');
};
