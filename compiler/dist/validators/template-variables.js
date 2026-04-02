"use strict";
/**
 * Template Variable Validator
 *
 * Validates that all variables referenced in a Handlebars template
 * are declared in the component's properties.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTemplateValidationResult = exports.validateTemplateVariables = void 0;
/**
 * Extract variable names from a Handlebars expression
 * Handles: {{var}}, {{obj.prop}}, {{@index}}, {{this}}, {{this.prop}}
 */
const extractVariableFromExpression = (expr) => {
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
const stripQuotes = (str) => {
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
const parseVariablePath = (varPath) => {
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
const toSnakeCase = (str) => {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
};
/**
 * Convert snake_case to camelCase
 */
const toCamelCase = (str) => {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};
/**
 * Find a property by name, trying both the original name and case variations
 */
const findProperty = (name, properties) => {
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
const resolveVariablePath = (path, properties, arrayItemContext) => {
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
const getArrayItemProperties = (arrayPath, properties, currentContext) => {
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
        const itemsObj = arrayProp.items;
        // Check if items has properties that look like HandoffProperty objects (have 'type' field)
        const potentialProps = {};
        for (const [key, val] of Object.entries(itemsObj)) {
            if (key !== 'type' && key !== 'default' && key !== 'properties' &&
                val && typeof val === 'object' && 'type' in val) {
                potentialProps[key] = val;
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
const validateTemplateVariables = (component) => {
    const result = {
        componentId: component.id,
        componentTitle: component.title,
        isValid: true,
        errors: [],
        warnings: []
    };
    const template = component.code;
    // Augmented properties: include implicit root-level pagination from array sub-properties
    // so that {{#if properties.pagination}} and {{#each properties.pagination}} resolve correctly
    const properties = { ...component.properties };
    for (const prop of Object.values(component.properties)) {
        if (prop.type === 'array' && prop.pagination && !properties['pagination']) {
            properties['pagination'] = prop.pagination;
        }
    }
    // Stack of contexts for nested scopes
    const contextStack = [
        { type: 'root' }
    ];
    // Track line numbers for better error reporting
    const lines = template.split('\n');
    let currentLine = 1;
    let charIndex = 0;
    const getLineNumber = (index) => {
        let line = 1;
        for (let i = 0; i < index && i < template.length; i++) {
            if (template[i] === '\n')
                line++;
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
        let prefix;
        let content;
        if (match[1] !== undefined) {
            // Triple brackets match - group 1 has the content
            prefix = '';
            content = match[1].trim();
        }
        else {
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
                    let blockParams = [];
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
                    let resolved;
                    let blockParamContext;
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
                        }
                        else {
                            // Resolve the rest of the path against item properties (e.g., post.tags -> tags)
                            const restPath = arrayPath.slice(1);
                            resolved = resolveVariablePath(restPath, properties, blockParamContext.itemProperties);
                        }
                    }
                    else {
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
                    }
                    else if (resolved.property?.type !== 'array' && resolved.property?.type !== 'pagination') {
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
                    let itemProps;
                    if (blockParamContext && blockParamContext.itemProperties && arrayPath.length > 1) {
                        const restPath = arrayPath.slice(1);
                        itemProps = getArrayItemProperties(restPath, properties, blockParamContext.itemProperties) || undefined;
                    }
                    else {
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
                }
                else if (blockType === 'with') {
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
                }
                else if (blockType === 'field') {
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
                                }
                                else if (fieldPath.length > 1) {
                                    errorDetail += ` "${firstPart}" exists but is type "${rootProp.type}" (not an object with nested properties).`;
                                }
                            }
                            else {
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
                }
                else if (blockType === 'if' || blockType === 'unless') {
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
        }
        else if (prefix === '/') {
            // Block closing: {{/each}}, {{/with}}, {{/if}}, {{/field}}
            const blockType = content;
            if (blockType === 'each' || blockType === 'with' || blockType === 'field') {
                if (contextStack.length > 1) {
                    contextStack.pop();
                }
            }
        }
        else {
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
                let resolved;
                const firstPart = varPath[0];
                // Look through the context stack for a matching block parameter
                let blockParamContext;
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
                    }
                    else {
                        // Resolve the rest of the path against item properties (e.g., breadcrumb.label -> label)
                        const restPath = varPath.slice(1);
                        resolved = resolveVariablePath(restPath, properties, blockParamContext.itemProperties);
                    }
                }
                else {
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
                        }
                        else {
                            // No item properties found for this array - might be a simple array or missing schema
                            result.warnings.push({
                                variable: varName,
                                line: lineNumber,
                                context: `{{${content}}}`,
                                message: `Cannot validate "${varName}" - no item properties schema found for {{#each ${currentContext.variable}}}. The array may not have defined item properties.`
                            });
                        }
                    }
                    else if (currentContext.type === 'with' && currentContext.itemProperties) {
                        result.isValid = false;
                        result.errors.push({
                            variable: varName,
                            line: lineNumber,
                            context: `{{${content}}}`,
                            message: `Variable "${varName}" is not defined in {{#with ${currentContext.variable}}} context`
                        });
                    }
                    else {
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
exports.validateTemplateVariables = validateTemplateVariables;
/**
 * Format validation result for console output
 */
const formatTemplateValidationResult = (result) => {
    const lines = [];
    const icon = result.isValid ? '✅' : '❌';
    lines.push(`${icon} Template Variables: ${result.componentTitle} (${result.componentId})`);
    if (result.errors.length === 0 && result.warnings.length === 0) {
        lines.push(`   All template variables are properly defined`);
    }
    else {
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
exports.formatTemplateValidationResult = formatTemplateValidationResult;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcGxhdGUtdmFyaWFibGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ZhbGlkYXRvcnMvdGVtcGxhdGUtdmFyaWFibGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBNkJIOzs7R0FHRztBQUNILE1BQU0sNkJBQTZCLEdBQUcsQ0FBQyxJQUFZLEVBQWlCLEVBQUU7SUFDcEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBRTVCLDhFQUE4RTtJQUM5RSxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxLQUFLLE1BQU0sSUFBSSxPQUFPLEtBQUssTUFBTTtRQUNuRSxPQUFPLEtBQUssT0FBTyxJQUFJLE9BQU8sS0FBSyxRQUFRO1FBQzNDLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ2xFLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELGlFQUFpRTtJQUNqRSx5REFBeUQ7SUFDekQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNuQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0Isb0RBQW9EO0lBQ3BELE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDaEYsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDckMsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsZUFBZTtJQUNmLElBQUksU0FBUyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzlCLE9BQU8s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QUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLE9BQU8sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMvRCxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsT0FBTyxDQUFDLE9BQU8sR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RCxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDNUMsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzFCLENBQUMsQ0FBQztBQTdCVyxRQUFBLDhCQUE4QixrQ0E2QnpDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUZW1wbGF0ZSBWYXJpYWJsZSBWYWxpZGF0b3JcbiAqIFxuICogVmFsaWRhdGVzIHRoYXQgYWxsIHZhcmlhYmxlcyByZWZlcmVuY2VkIGluIGEgSGFuZGxlYmFycyB0ZW1wbGF0ZVxuICogYXJlIGRlY2xhcmVkIGluIHRoZSBjb21wb25lbnQncyBwcm9wZXJ0aWVzLlxuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSB9IGZyb20gJy4uL3R5cGVzJztcblxuZXhwb3J0IGludGVyZmFjZSBUZW1wbGF0ZVZhcmlhYmxlRXJyb3Ige1xuICB2YXJpYWJsZTogc3RyaW5nO1xuICBsaW5lPzogbnVtYmVyO1xuICBjb250ZXh0OiBzdHJpbmc7XG4gIG1lc3NhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQge1xuICBjb21wb25lbnRJZDogc3RyaW5nO1xuICBjb21wb25lbnRUaXRsZTogc3RyaW5nO1xuICBpc1ZhbGlkOiBib29sZWFuO1xuICBlcnJvcnM6IFRlbXBsYXRlVmFyaWFibGVFcnJvcltdO1xuICB3YXJuaW5nczogVGVtcGxhdGVWYXJpYWJsZUVycm9yW107XG59XG5cbi8qKlxuICogQ29udGV4dCB0cmFja2luZyBmb3IgbmVzdGVkIHNjb3BlcyAoZWFjaCwgd2l0aCBibG9ja3MpXG4gKi9cbmludGVyZmFjZSBTY29wZUNvbnRleHQge1xuICB0eXBlOiAncm9vdCcgfCAnZWFjaCcgfCAnd2l0aCcgfCAnZmllbGQnO1xuICB2YXJpYWJsZT86IHN0cmluZzsgICAgICAgIC8vIFRoZSB2YXJpYWJsZSB0aGF0IG9wZW5lZCB0aGlzIHNjb3BlXG4gIGl0ZW1Qcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PjsgIC8vIEF2YWlsYWJsZSBwcm9wZXJ0aWVzIGluIHRoaXMgc2NvcGVcbiAgYmxvY2tQYXJhbXM/OiBzdHJpbmdbXTsgICAvLyBOYW1lZCBibG9jayBwYXJhbWV0ZXJzIChlLmcuLCB8aXRlbXwgb3IgfGl0ZW0gaW5kZXh8KVxufVxuXG4vKipcbiAqIEV4dHJhY3QgdmFyaWFibGUgbmFtZXMgZnJvbSBhIEhhbmRsZWJhcnMgZXhwcmVzc2lvblxuICogSGFuZGxlczoge3t2YXJ9fSwge3tvYmoucHJvcH19LCB7e0BpbmRleH19LCB7e3RoaXN9fSwge3t0aGlzLnByb3B9fVxuICovXG5jb25zdCBleHRyYWN0VmFyaWFibGVGcm9tRXhwcmVzc2lvbiA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgdHJpbW1lZCA9IGV4cHIudHJpbSgpO1xuICBcbiAgLy8gU2tpcCBIYW5kbGViYXJzIGJ1aWx0LWlucywgc3BlY2lhbCB2YXJpYWJsZXMsIGFuZCBnbG9iYWwgY29tcGlsZXIgdmFyaWFibGVzXG4gIGlmICh0cmltbWVkLnN0YXJ0c1dpdGgoJ0AnKSB8fCB0cmltbWVkID09PSAndGhpcycgfHwgdHJpbW1lZCA9PT0gJ2Vsc2UnIHx8IFxuICAgICAgdHJpbW1lZCA9PT0gJ3N0eWxlJyB8fCB0cmltbWVkID09PSAnc2NyaXB0JyB8fFxuICAgICAgdHJpbW1lZC5zdGFydHNXaXRoKCdzdHlsZS4nKSB8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJ3NjcmlwdC4nKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIFxuICAvLyBTa2lwIGhlbHBlciBjYWxscyB3aXRoIHBhcmFtZXRlcnMgKGUuZy4sIFwiZm9ybWF0RGF0ZSBzb21lVmFyXCIpXG4gIC8vIFdlIHdhbnQgdGhlIGZpcnN0IHdvcmQgd2hpY2ggaXMgdHlwaWNhbGx5IHRoZSB2YXJpYWJsZVxuICBjb25zdCBwYXJ0cyA9IHRyaW1tZWQuc3BsaXQoL1xccysvKTtcbiAgY29uc3QgZmlyc3RQYXJ0ID0gcGFydHNbMF07XG4gIFxuICAvLyBTa2lwIGJsb2NrIGhlbHBlcnMgKGVhY2gsIGlmLCB1bmxlc3MsIHdpdGgsIGV0Yy4pXG4gIGNvbnN0IGJsb2NrSGVscGVycyA9IFsnZWFjaCcsICdpZicsICd1bmxlc3MnLCAnd2l0aCcsICdmaWVsZCcsICdsb29rdXAnLCAnbG9nJ107XG4gIGlmIChibG9ja0hlbHBlcnMuaW5jbHVkZXMoZmlyc3RQYXJ0KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIFxuICAvLyBTa2lwIGNvbW1lbnRcbiAgaWYgKGZpcnN0UGFydC5zdGFydHNXaXRoKCchJykpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBcbiAgcmV0dXJuIGZpcnN0UGFydCB8fCBudWxsO1xufTtcblxuLyoqXG4gKiBTdHJpcCBxdW90ZXMgZnJvbSBhIHN0cmluZyBhcmd1bWVudFxuICogSGFuZGxlczogXCJ2YWx1ZVwiLCAndmFsdWUnLCBvciB1bnF1b3RlZCB2YWx1ZVxuICovXG5jb25zdCBzdHJpcFF1b3RlcyA9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHRyaW1tZWQgPSBzdHIudHJpbSgpO1xuICAvLyBDaGVjayBmb3IgZG91YmxlIHF1b3Rlc1xuICBpZiAodHJpbW1lZC5zdGFydHNXaXRoKCdcIicpICYmIHRyaW1tZWQuZW5kc1dpdGgoJ1wiJykpIHtcbiAgICByZXR1cm4gdHJpbW1lZC5zbGljZSgxLCAtMSk7XG4gIH1cbiAgLy8gQ2hlY2sgZm9yIHNpbmdsZSBxdW90ZXNcbiAgaWYgKHRyaW1tZWQuc3RhcnRzV2l0aChcIidcIikgJiYgdHJpbW1lZC5lbmRzV2l0aChcIidcIikpIHtcbiAgICByZXR1cm4gdHJpbW1lZC5zbGljZSgxLCAtMSk7XG4gIH1cbiAgcmV0dXJuIHRyaW1tZWQ7XG59O1xuXG4vKipcbiAqIFBhcnNlIGEgdmFyaWFibGUgcGF0aCBsaWtlIFwibGVmdENhcmQuaW1hZ2Uuc3JjXCIgaW50byBzZWdtZW50c1xuICogQWxzbyBoYW5kbGVzIHF1b3RlZCBwYXRocyBsaWtlIFwibGVmdENhcmQuaW1hZ2VcIlxuICogU3RyaXBzIHNwZWNpYWwgcHJlZml4ZXMgbGlrZSBcInRoaXMuXCIsIFwicHJvcGVydGllcy5cIiwgYW5kIFwiLi4vXCJcbiAqL1xuY29uc3QgcGFyc2VWYXJpYWJsZVBhdGggPSAodmFyUGF0aDogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuICAvLyBTdHJpcCBxdW90ZXMgZmlyc3RcbiAgY29uc3QgdW5xdW90ZWQgPSBzdHJpcFF1b3Rlcyh2YXJQYXRoKTtcbiAgLy8gSGFuZGxlIFwiLi4vXCIgcGFyZW50IGNvbnRleHQgcmVmZXJlbmNlcyBieSBzdHJpcHBpbmcgdGhlbVxuICAvLyBJbiBIYW5kbGViYXJzLCAuLi8gZ29lcyB1cCB0byBwYXJlbnQgY29udGV4dCAtIGZvciB2YWxpZGF0aW9uIHB1cnBvc2VzLFxuICAvLyB3ZSBldmFsdWF0ZSBmcm9tIHJvb3QgcHJvcGVydGllc1xuICBsZXQgcGF0aCA9IHVucXVvdGVkLnJlcGxhY2UoL14oXFwuXFwuXFwvKSsvLCAnJyk7XG4gIC8vIEhhbmRsZSBcInRoaXMucHJvcGVydHlcIiBieSByZW1vdmluZyBcInRoaXMuXCJcbiAgcGF0aCA9IHBhdGgucmVwbGFjZSgvXnRoaXNcXC4vLCAnJyk7XG4gIC8vIEhhbmRsZSBcInByb3BlcnRpZXMueHh4XCIgYnkgcmVtb3ZpbmcgXCJwcm9wZXJ0aWVzLlwiIHByZWZpeFxuICAvLyBUaGlzIGlzIGEgY29tbW9uIEhhbmRsZWJhcnMgcGF0dGVybiB0byBhY2Nlc3MgY29tcG9uZW50IHByb3BlcnRpZXNcbiAgcGF0aCA9IHBhdGgucmVwbGFjZSgvXnByb3BlcnRpZXNcXC4vLCAnJyk7XG4gIHJldHVybiBwYXRoLnNwbGl0KCcuJyk7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgY2FtZWxDYXNlIHRvIHNuYWtlX2Nhc2VcbiAqL1xuY29uc3QgdG9TbmFrZUNhc2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoLyhbQS1aXSkvZywgJ18kMScpLnRvTG93ZXJDYXNlKCk7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSB0byBjYW1lbENhc2VcbiAqL1xuY29uc3QgdG9DYW1lbENhc2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL18oW2Etel0pL2csIChfLCBsZXR0ZXIpID0+IGxldHRlci50b1VwcGVyQ2FzZSgpKTtcbn07XG5cbi8qKlxuICogRmluZCBhIHByb3BlcnR5IGJ5IG5hbWUsIHRyeWluZyBib3RoIHRoZSBvcmlnaW5hbCBuYW1lIGFuZCBjYXNlIHZhcmlhdGlvbnNcbiAqL1xuY29uc3QgZmluZFByb3BlcnR5ID0gKFxuICBuYW1lOiBzdHJpbmcsXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT5cbik6IHsga2V5OiBzdHJpbmc7IHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkgfSB8IG51bGwgPT4ge1xuICAvLyBUcnkgZXhhY3QgbWF0Y2ggZmlyc3RcbiAgaWYgKHByb3BlcnRpZXNbbmFtZV0pIHtcbiAgICByZXR1cm4geyBrZXk6IG5hbWUsIHByb3BlcnR5OiBwcm9wZXJ0aWVzW25hbWVdIH07XG4gIH1cbiAgXG4gIC8vIFRyeSBzbmFrZV9jYXNlIHZlcnNpb25cbiAgY29uc3Qgc25ha2VDYXNlID0gdG9TbmFrZUNhc2UobmFtZSk7XG4gIGlmIChwcm9wZXJ0aWVzW3NuYWtlQ2FzZV0pIHtcbiAgICByZXR1cm4geyBrZXk6IHNuYWtlQ2FzZSwgcHJvcGVydHk6IHByb3BlcnRpZXNbc25ha2VDYXNlXSB9O1xuICB9XG4gIFxuICAvLyBUcnkgY2FtZWxDYXNlIHZlcnNpb25cbiAgY29uc3QgY2FtZWxDYXNlID0gdG9DYW1lbENhc2UobmFtZSk7XG4gIGlmIChwcm9wZXJ0aWVzW2NhbWVsQ2FzZV0pIHtcbiAgICByZXR1cm4geyBrZXk6IGNhbWVsQ2FzZSwgcHJvcGVydHk6IHByb3BlcnRpZXNbY2FtZWxDYXNlXSB9O1xuICB9XG4gIFxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgYSB2YXJpYWJsZSBwYXRoIGV4aXN0cyBpbiB0aGUgZ2l2ZW4gcHJvcGVydGllc1xuICogUmV0dXJucyB0aGUgcmVzb2x2ZWQgcHJvcGVydHkgb3IgbnVsbCBpZiBub3QgZm91bmRcbiAqIEhhbmRsZXMgY2FzZSB2YXJpYXRpb25zIChjYW1lbENhc2UsIHNuYWtlX2Nhc2UpXG4gKi9cbmNvbnN0IHJlc29sdmVWYXJpYWJsZVBhdGggPSAoXG4gIHBhdGg6IHN0cmluZ1tdLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBhcnJheUl0ZW1Db250ZXh0PzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PlxuKTogeyBmb3VuZDogYm9vbGVhbjsgcHJvcGVydHk/OiBIYW5kb2ZmUHJvcGVydHk7IHJlc29sdmVkQXQ/OiBzdHJpbmcgfSA9PiB7XG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB7IGZvdW5kOiBmYWxzZSB9O1xuICB9XG5cbiAgY29uc3QgW2ZpcnN0LCAuLi5yZXN0XSA9IHBhdGg7XG4gIFxuICAvLyBGaXJzdCwgY2hlY2sgaWYgd2UncmUgaW4gYW4gYXJyYXkgaXRlcmF0aW9uIGNvbnRleHRcbiAgaWYgKGFycmF5SXRlbUNvbnRleHQpIHtcbiAgICBjb25zdCBmb3VuZCA9IGZpbmRQcm9wZXJ0eShmaXJzdCwgYXJyYXlJdGVtQ29udGV4dCk7XG4gICAgaWYgKGZvdW5kKSB7XG4gICAgICBjb25zdCBwcm9wID0gZm91bmQucHJvcGVydHk7XG4gICAgICBjb25zdCBhY3R1YWxLZXkgPSBmb3VuZC5rZXk7XG4gICAgICBcbiAgICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcHJvcGVydHk6IHByb3AsIHJlc29sdmVkQXQ6IGFjdHVhbEtleSB9O1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDb250aW51ZSByZXNvbHZpbmcgbmVzdGVkIHByb3BlcnRpZXMgZm9yIG9iamVjdHNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3QsIHByb3AucHJvcGVydGllcyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4ubmVzdGVkLFxuICAgICAgICAgIHJlc29sdmVkQXQ6IG5lc3RlZC5mb3VuZCA/IGAke2FjdHVhbEtleX0uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gIDogdW5kZWZpbmVkXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIEhhbmRsZSBhcnJheXMgd2l0aGluIGFycmF5IGl0ZW1zXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgIGlmIChwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgY29uc3QgbmVzdGVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChyZXN0LCBwcm9wLml0ZW1zLnByb3BlcnRpZXMpO1xuICAgICAgICAgIGlmIChuZXN0ZWQuZm91bmQpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLm5lc3RlZCxcbiAgICAgICAgICAgICAgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke25lc3RlZC5yZXNvbHZlZEF0fWBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChwcm9wLnBhZ2luYXRpb24gJiYgcmVzdFswXSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICAgICAgaWYgKHJlc3QubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcHJvcGVydHk6IHByb3AucGFnaW5hdGlvbiwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS5wYWdpbmF0aW9uYCB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBwYWdpbmF0aW9uUmVzdCA9IHJlc3Quc2xpY2UoMSk7XG4gICAgICAgICAgaWYgKHByb3AucGFnaW5hdGlvbi5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbmVzdGVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChwYWdpbmF0aW9uUmVzdCwgcHJvcC5wYWdpbmF0aW9uLml0ZW1zLnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4ubmVzdGVkLFxuICAgICAgICAgICAgICByZXNvbHZlZEF0OiBuZXN0ZWQuZm91bmQgPyBgJHthY3R1YWxLZXl9LnBhZ2luYXRpb24uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gIDogdW5kZWZpbmVkXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBIYW5kbGUgcGFnaW5hdGlvbiB0eXBlIChyZXNvbHZlcyB0aHJvdWdoIGl0ZW1zLnByb3BlcnRpZXMgbGlrZSBhcnJheXMpXG4gICAgICBpZiAocHJvcC50eXBlID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgICAgaWYgKHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgICBjb25zdCBuZXN0ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3QsIHByb3AuaXRlbXMucHJvcGVydGllcyk7XG4gICAgICAgICAgaWYgKG5lc3RlZC5mb3VuZCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4ubmVzdGVkLFxuICAgICAgICAgICAgICByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7bmVzdGVkLnJlc29sdmVkQXR9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFnaW5hdGlvbkl0ZW1Qcm9wcyA9IFsnbGFiZWwnLCAndXJsJywgJ2FjdGl2ZSddO1xuICAgICAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgcGFnaW5hdGlvbkl0ZW1Qcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gSW1hZ2UgaGFzIGltcGxpY2l0IHNyYywgYWx0LCBpZCwgc3Jjc2V0IHByb3BlcnRpZXNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9wcyA9IFsnc3JjJywgJ2FsdCcsICdpZCcsICd1cmwnLCAnd2lkdGgnLCAnaGVpZ2h0JywgJ3NyY3NldCcsICdzaXplcyddO1xuICAgICAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgaW1hZ2VQcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gVmlkZW8gaGFzIGltcGxpY2l0IHNyYywgcG9zdGVyLCB0eXBlLCB3aWR0aCwgaGVpZ2h0IHByb3BlcnRpZXNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICd2aWRlbycpIHtcbiAgICAgICAgY29uc3QgdmlkZW9Qcm9wcyA9IFsnc3JjJywgJ3VybCcsICdwb3N0ZXInLCAndHlwZScsICd3aWR0aCcsICdoZWlnaHQnLCAnaWQnLCAnbWltZScsICdtaW1lVHlwZSddO1xuICAgICAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgdmlkZW9Qcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gTGluayBoYXMgaW1wbGljaXQgcHJvcGVydGllc1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2xpbmsnKSB7XG4gICAgICAgIGNvbnN0IGxpbmtQcm9wcyA9IFsnbGFiZWwnLCAndXJsJywgJ3RleHQnLCAnb3BlbnNJbk5ld1RhYicsICdocmVmJywgJ3RhcmdldCcsICd0aXRsZSddO1xuICAgICAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgbGlua1Byb3BzLmluY2x1ZGVzKHJlc3RbMF0pKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtyZXN0WzBdfWAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBCdXR0b24gaGFzIGltcGxpY2l0IHByb3BlcnRpZXNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICAgIGNvbnN0IGJ1dHRvblByb3BzID0gWyd1cmwnLCAndGV4dCcsICdsYWJlbCcsICdocmVmJywgJ3RhcmdldCcsICdvcGVuc0luTmV3VGFiJywgJ3RpdGxlJywgJ3R5cGUnLCAnZGlzYWJsZWQnLCAnc3R5bGUnLCAncmVsJ107XG4gICAgICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMSAmJiBidXR0b25Qcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gQ2FuJ3QgcmVzb2x2ZSBmdXJ0aGVyXG4gICAgICByZXR1cm4geyBmb3VuZDogZmFsc2UgfTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIENoZWNrIHJvb3QgcHJvcGVydGllcyAod2l0aCBjYXNlIHZhcmlhdGlvbiBzdXBwb3J0KVxuICBjb25zdCBmb3VuZCA9IGZpbmRQcm9wZXJ0eShmaXJzdCwgcHJvcGVydGllcyk7XG4gIGlmICghZm91bmQpIHtcbiAgICByZXR1cm4geyBmb3VuZDogZmFsc2UgfTtcbiAgfVxuICBcbiAgY29uc3QgcHJvcCA9IGZvdW5kLnByb3BlcnR5O1xuICBjb25zdCBhY3R1YWxLZXkgPSBmb3VuZC5rZXk7XG4gIFxuICBpZiAocmVzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcHJvcGVydHk6IHByb3AsIHJlc29sdmVkQXQ6IGFjdHVhbEtleSB9O1xuICB9XG4gIFxuICAvLyBSZXNvbHZlIG5lc3RlZCBwYXRoIGZvciBvYmplY3RzXG4gIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgIGNvbnN0IG5lc3RlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgocmVzdCwgcHJvcC5wcm9wZXJ0aWVzKTtcbiAgICByZXR1cm4ge1xuICAgICAgLi4ubmVzdGVkLFxuICAgICAgcmVzb2x2ZWRBdDogbmVzdGVkLmZvdW5kID8gYCR7YWN0dWFsS2V5fS4ke25lc3RlZC5yZXNvbHZlZEF0fWAgOiB1bmRlZmluZWRcbiAgICB9O1xuICB9XG4gIFxuICAvLyBSZXNvbHZlIG5lc3RlZCBwYXRoIGZvciBhcnJheXMgLSBsb29rIGludG8gaXRlbXMucHJvcGVydGllc1xuICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknKSB7XG4gICAgaWYgKHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IG5lc3RlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgocmVzdCwgcHJvcC5pdGVtcy5wcm9wZXJ0aWVzKTtcbiAgICAgIGlmIChuZXN0ZWQuZm91bmQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5uZXN0ZWQsXG4gICAgICAgICAgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke25lc3RlZC5yZXNvbHZlZEF0fWBcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHByb3AucGFnaW5hdGlvbiAmJiByZXN0WzBdID09PSAncGFnaW5hdGlvbicpIHtcbiAgICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcHJvcGVydHk6IHByb3AucGFnaW5hdGlvbiwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS5wYWdpbmF0aW9uYCB9O1xuICAgICAgfVxuICAgICAgY29uc3QgcGFnaW5hdGlvblJlc3QgPSByZXN0LnNsaWNlKDEpO1xuICAgICAgaWYgKHByb3AucGFnaW5hdGlvbi5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICBjb25zdCBuZXN0ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHBhZ2luYXRpb25SZXN0LCBwcm9wLnBhZ2luYXRpb24uaXRlbXMucHJvcGVydGllcyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4ubmVzdGVkLFxuICAgICAgICAgIHJlc29sdmVkQXQ6IG5lc3RlZC5mb3VuZCA/IGAke2FjdHVhbEtleX0ucGFnaW5hdGlvbi4ke25lc3RlZC5yZXNvbHZlZEF0fWAgOiB1bmRlZmluZWRcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBwYWdpbmF0aW9uIHR5cGUgKHJlc29sdmVzIHRocm91Z2ggaXRlbXMucHJvcGVydGllcyBsaWtlIGFycmF5cylcbiAgaWYgKHByb3AudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgaWYgKHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgIGNvbnN0IG5lc3RlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgocmVzdCwgcHJvcC5pdGVtcy5wcm9wZXJ0aWVzKTtcbiAgICAgIGlmIChuZXN0ZWQuZm91bmQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5uZXN0ZWQsXG4gICAgICAgICAgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke25lc3RlZC5yZXNvbHZlZEF0fWBcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcGFnaW5hdGlvbkl0ZW1Qcm9wcyA9IFsnbGFiZWwnLCAndXJsJywgJ2FjdGl2ZSddO1xuICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMSAmJiBwYWdpbmF0aW9uSXRlbVByb3BzLmluY2x1ZGVzKHJlc3RbMF0pKSB7XG4gICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgIH1cbiAgfVxuICBcbiAgLy8gSW1hZ2UgaGFzIGltcGxpY2l0IHNyYywgYWx0LCBpZCwgc3Jjc2V0IHByb3BlcnRpZXNcbiAgaWYgKHByb3AudHlwZSA9PT0gJ2ltYWdlJykge1xuICAgIGNvbnN0IGltYWdlUHJvcHMgPSBbJ3NyYycsICdhbHQnLCAnaWQnLCAndXJsJywgJ3dpZHRoJywgJ2hlaWdodCcsICdzcmNzZXQnLCAnc2l6ZXMnXTtcbiAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgaW1hZ2VQcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtyZXN0WzBdfWAgfTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFZpZGVvIGhhcyBpbXBsaWNpdCBzcmMsIHBvc3RlciwgdHlwZSwgd2lkdGgsIGhlaWdodCBwcm9wZXJ0aWVzXG4gIGlmIChwcm9wLnR5cGUgPT09ICd2aWRlbycpIHtcbiAgICBjb25zdCB2aWRlb1Byb3BzID0gWydzcmMnLCAndXJsJywgJ3Bvc3RlcicsICd0eXBlJywgJ3dpZHRoJywgJ2hlaWdodCcsICdpZCcsICdtaW1lJywgJ21pbWVUeXBlJ107XG4gICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIHZpZGVvUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgfVxuICB9XG4gIFxuICAvLyBMaW5rIGhhcyBpbXBsaWNpdCBsYWJlbCwgdXJsLCB0ZXh0LCBvcGVuc0luTmV3VGFiIHByb3BlcnRpZXNcbiAgaWYgKHByb3AudHlwZSA9PT0gJ2xpbmsnKSB7XG4gICAgY29uc3QgbGlua1Byb3BzID0gWydsYWJlbCcsICd1cmwnLCAndGV4dCcsICdvcGVuc0luTmV3VGFiJywgJ2hyZWYnLCAndGFyZ2V0JywgJ3RpdGxlJ107XG4gICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIGxpbmtQcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtyZXN0WzBdfWAgfTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEJ1dHRvbiBoYXMgaW1wbGljaXQgdXJsLCB0ZXh0LCBsYWJlbCBwcm9wZXJ0aWVzIChzaW1pbGFyIHRvIGxpbmspXG4gIGlmIChwcm9wLnR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgY29uc3QgYnV0dG9uUHJvcHMgPSBbJ3VybCcsICd0ZXh0JywgJ2xhYmVsJywgJ2hyZWYnLCAndGFyZ2V0JywgJ29wZW5zSW5OZXdUYWInLCAndGl0bGUnLCAndHlwZScsICdkaXNhYmxlZCcsICdzdHlsZScsICdyZWwnXTtcbiAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgYnV0dG9uUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgfVxuICB9XG4gIFxuICAvLyBDYW4ndCByZXNvbHZlIGZ1cnRoZXJcbiAgcmV0dXJuIHsgZm91bmQ6IGZhbHNlIH07XG59O1xuXG4vKipcbiAqIEdldCBhcnJheSBpdGVtIHByb3BlcnRpZXMgZm9yIGFuIGFycmF5IHZhcmlhYmxlIHBhdGhcbiAqIEhhbmRsZXMgZnVsbCBwYXRocyBsaWtlIFwicmlnaHRDYXJkc1wiIG9yIG5lc3RlZCBwYXRoc1xuICogQWxzbyBoYW5kbGVzIGNhc2UgdmFyaWF0aW9ucyBpbiBwcm9wZXJ0eSBuYW1lc1xuICogSGFuZGxlcyBkaWZmZXJlbnQgYXJyYXkgaXRlbSBzdHJ1Y3R1cmVzOlxuICogLSBpdGVtcy5wcm9wZXJ0aWVzIChvYmplY3QgaXRlbXMgd2l0aCBuYW1lZCBwcm9wZXJ0aWVzKVxuICogLSBwcm9wZXJ0aWVzIChzb21lIHNjaGVtYXMgcHV0IGl0ZW0gcHJvcHMgaGVyZSBmb3IgYXJyYXlzKVxuICogLSBpdGVtcyBkaXJlY3RseSBhcyBwcm9wZXJ0aWVzIG9iamVjdCAobGVzcyBjb21tb24pXG4gKi9cbmNvbnN0IGdldEFycmF5SXRlbVByb3BlcnRpZXMgPSAoXG4gIGFycmF5UGF0aDogc3RyaW5nW10sXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIGN1cnJlbnRDb250ZXh0PzogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PlxuKTogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiB8IG51bGwgPT4ge1xuICAvLyBGaXJzdCByZXNvbHZlIHRoZSBmdWxsIHBhdGggdG8gZmluZCB0aGUgYXJyYXkgcHJvcGVydHlcbiAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKGFycmF5UGF0aCwgcHJvcGVydGllcywgY3VycmVudENvbnRleHQpO1xuICBcbiAgaWYgKCFyZXNvbHZlZC5mb3VuZCB8fCAhcmVzb2x2ZWQucHJvcGVydHkgfHwgKHJlc29sdmVkLnByb3BlcnR5LnR5cGUgIT09ICdhcnJheScgJiYgcmVzb2x2ZWQucHJvcGVydHkudHlwZSAhPT0gJ3BhZ2luYXRpb24nKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIFxuICBjb25zdCBhcnJheVByb3AgPSByZXNvbHZlZC5wcm9wZXJ0eTtcbiAgXG4gIC8vIFRyeSBpdGVtcy5wcm9wZXJ0aWVzIGZpcnN0IChzdGFuZGFyZCBzdHJ1Y3R1cmUgZm9yIG9iamVjdCBhcnJheXMpXG4gIGlmIChhcnJheVByb3AuaXRlbXM/LnByb3BlcnRpZXMgJiYgT2JqZWN0LmtleXMoYXJyYXlQcm9wLml0ZW1zLnByb3BlcnRpZXMpLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gYXJyYXlQcm9wLml0ZW1zLnByb3BlcnRpZXM7XG4gIH1cbiAgXG4gIC8vIFNvbWUgc2NoZW1hcyBtaWdodCBwdXQgcHJvcGVydGllcyBkaXJlY3RseSBvbiB0aGUgYXJyYXkgZm9yIGl0ZW0gc3RydWN0dXJlXG4gIGlmIChhcnJheVByb3AucHJvcGVydGllcyAmJiBPYmplY3Qua2V5cyhhcnJheVByb3AucHJvcGVydGllcykubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBhcnJheVByb3AucHJvcGVydGllcztcbiAgfVxuICBcbiAgLy8gQ2hlY2sgaWYgaXRlbXMgaXRzZWxmIGhhcyBIYW5kb2ZmUHJvcGVydHktbGlrZSBlbnRyaWVzIChzb21lIHNjaGVtYXMgbWlnaHQgZG8gdGhpcylcbiAgLy8gZS5nLiwgaXRlbXM6IHsgaWNvbjogey4uLn0sIHRpdGxlOiB7Li4ufSB9IHdpdGhvdXQgYSBwcm9wZXJ0aWVzIHdyYXBwZXJcbiAgaWYgKGFycmF5UHJvcC5pdGVtcyAmJiB0eXBlb2YgYXJyYXlQcm9wLml0ZW1zID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IGl0ZW1zT2JqID0gYXJyYXlQcm9wLml0ZW1zIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XG4gICAgLy8gQ2hlY2sgaWYgaXRlbXMgaGFzIHByb3BlcnRpZXMgdGhhdCBsb29rIGxpa2UgSGFuZG9mZlByb3BlcnR5IG9iamVjdHMgKGhhdmUgJ3R5cGUnIGZpZWxkKVxuICAgIGNvbnN0IHBvdGVudGlhbFByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+ID0ge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWxdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW1zT2JqKSkge1xuICAgICAgaWYgKGtleSAhPT0gJ3R5cGUnICYmIGtleSAhPT0gJ2RlZmF1bHQnICYmIGtleSAhPT0gJ3Byb3BlcnRpZXMnICYmIFxuICAgICAgICAgIHZhbCAmJiB0eXBlb2YgdmFsID09PSAnb2JqZWN0JyAmJiAndHlwZScgaW4gdmFsKSB7XG4gICAgICAgIHBvdGVudGlhbFByb3BzW2tleV0gPSB2YWwgYXMgSGFuZG9mZlByb3BlcnR5O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMocG90ZW50aWFsUHJvcHMpLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiBwb3RlbnRpYWxQcm9wcztcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBudWxsO1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZSBhbGwgdGVtcGxhdGUgdmFyaWFibGVzIGFnYWluc3QgY29tcG9uZW50IHByb3BlcnRpZXNcbiAqL1xuZXhwb3J0IGNvbnN0IHZhbGlkYXRlVGVtcGxhdGVWYXJpYWJsZXMgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudFxuKTogVGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0ID0+IHtcbiAgY29uc3QgcmVzdWx0OiBUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQgPSB7XG4gICAgY29tcG9uZW50SWQ6IGNvbXBvbmVudC5pZCxcbiAgICBjb21wb25lbnRUaXRsZTogY29tcG9uZW50LnRpdGxlLFxuICAgIGlzVmFsaWQ6IHRydWUsXG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbiAgXG4gIGNvbnN0IHRlbXBsYXRlID0gY29tcG9uZW50LmNvZGU7XG4gIC8vIEF1Z21lbnRlZCBwcm9wZXJ0aWVzOiBpbmNsdWRlIGltcGxpY2l0IHJvb3QtbGV2ZWwgcGFnaW5hdGlvbiBmcm9tIGFycmF5IHN1Yi1wcm9wZXJ0aWVzXG4gIC8vIHNvIHRoYXQge3sjaWYgcHJvcGVydGllcy5wYWdpbmF0aW9ufX0gYW5kIHt7I2VhY2ggcHJvcGVydGllcy5wYWdpbmF0aW9ufX0gcmVzb2x2ZSBjb3JyZWN0bHlcbiAgY29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiA9IHsgLi4uY29tcG9uZW50LnByb3BlcnRpZXMgfTtcbiAgZm9yIChjb25zdCBwcm9wIG9mIE9iamVjdC52YWx1ZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLnBhZ2luYXRpb24gJiYgIXByb3BlcnRpZXNbJ3BhZ2luYXRpb24nXSkge1xuICAgICAgcHJvcGVydGllc1sncGFnaW5hdGlvbiddID0gcHJvcC5wYWdpbmF0aW9uO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gU3RhY2sgb2YgY29udGV4dHMgZm9yIG5lc3RlZCBzY29wZXNcbiAgY29uc3QgY29udGV4dFN0YWNrOiBTY29wZUNvbnRleHRbXSA9IFtcbiAgICB7IHR5cGU6ICdyb290JyB9XG4gIF07XG4gIFxuICAvLyBUcmFjayBsaW5lIG51bWJlcnMgZm9yIGJldHRlciBlcnJvciByZXBvcnRpbmdcbiAgY29uc3QgbGluZXMgPSB0ZW1wbGF0ZS5zcGxpdCgnXFxuJyk7XG4gIGxldCBjdXJyZW50TGluZSA9IDE7XG4gIGxldCBjaGFySW5kZXggPSAwO1xuICBcbiAgY29uc3QgZ2V0TGluZU51bWJlciA9IChpbmRleDogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGluZSA9IDE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbmRleCAmJiBpIDwgdGVtcGxhdGUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICh0ZW1wbGF0ZVtpXSA9PT0gJ1xcbicpIGxpbmUrKztcbiAgICB9XG4gICAgcmV0dXJuIGxpbmU7XG4gIH07XG4gIFxuICAvLyBSZWd1bGFyIGV4cHJlc3Npb25zIGZvciBIYW5kbGViYXJzIHN5bnRheFxuICAvLyBNYXRjaGVzIGJvdGggZG91YmxlIHt7fX0gYW5kIHRyaXBsZSB7e3t9fX0gYnJhY2tldHNcbiAgLy8gVHJpcGxlIGJyYWNrZXRzIGFyZSB1c2VkIGZvciB1bmVzY2FwZWQvcmF3IEhUTUwgb3V0cHV0IChjb21tb24gZm9yIHJpY2h0ZXh0KVxuICAvLyBQYXR0ZXJuOiB7e3sgY29udGVudCB9fX0gb3Ige3sgIy9wcmVmaXggY29udGVudCB9fVxuICBjb25zdCBoYW5kbGViYXJzUmVnZXggPSAvXFx7XFx7XFx7KFtefV0rKVxcfVxcfVxcfXxcXHtcXHsoWyMvXT8pKFtefV0rKVxcfVxcfS9nO1xuICBcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gaGFuZGxlYmFyc1JlZ2V4LmV4ZWModGVtcGxhdGUpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGZ1bGxNYXRjaCA9IG1hdGNoWzBdO1xuICAgIGxldCBwcmVmaXg6IHN0cmluZztcbiAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgIFxuICAgIGlmIChtYXRjaFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAvLyBUcmlwbGUgYnJhY2tldHMgbWF0Y2ggLSBncm91cCAxIGhhcyB0aGUgY29udGVudFxuICAgICAgcHJlZml4ID0gJyc7XG4gICAgICBjb250ZW50ID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEb3VibGUgYnJhY2tldHMgbWF0Y2ggLSBncm91cCAyIGhhcyBwcmVmaXgsIGdyb3VwIDMgaGFzIGNvbnRlbnRcbiAgICAgIHByZWZpeCA9IG1hdGNoWzJdIHx8ICcnO1xuICAgICAgY29udGVudCA9IG1hdGNoWzNdLnRyaW0oKTtcbiAgICB9XG4gICAgY29uc3QgbGluZU51bWJlciA9IGdldExpbmVOdW1iZXIobWF0Y2guaW5kZXgpO1xuICAgIFxuICAgIGlmIChwcmVmaXggPT09ICcjJykge1xuICAgICAgLy8gQmxvY2sgb3BlbmluZzoge3sjZWFjaCBpdGVtc319LCB7eyN3aXRoIG9ian19LCB7eyNpZiBjb25kfX0sIHt7I2ZpZWxkIG5hbWV9fVxuICAgICAgY29uc3QgYmxvY2tNYXRjaCA9IGNvbnRlbnQubWF0Y2goL14oXFx3KylcXHMqKC4qKSQvKTtcbiAgICAgIGlmIChibG9ja01hdGNoKSB7XG4gICAgICAgIGNvbnN0IGJsb2NrVHlwZSA9IGJsb2NrTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IGJsb2NrQXJnID0gYmxvY2tNYXRjaFsyXS50cmltKCk7XG4gICAgICAgIFxuICAgICAgICBpZiAoYmxvY2tUeXBlID09PSAnZWFjaCcpIHtcbiAgICAgICAgICAvLyBQYXJzZSB0aGUgZWFjaCBhcmd1bWVudCAtIGhhbmRsZSBcImFzIHxibG9ja1BhcmFtfFwiIHN5bnRheFxuICAgICAgICAgIC8vIEV4YW1wbGVzOiBcIml0ZW1zXCIsIFwicHJvcGVydGllcy5pdGVtc1wiLCBcIml0ZW1zIGFzIHxpdGVtfFwiLCBcIml0ZW1zIGFzIHxpdGVtIGluZGV4fFwiXG4gICAgICAgICAgbGV0IGFycmF5QXJnID0gYmxvY2tBcmc7XG4gICAgICAgICAgbGV0IGJsb2NrUGFyYW1zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIENoZWNrIGZvciBcImFzIHxwYXJhbTEgcGFyYW0yfFwiIHN5bnRheFxuICAgICAgICAgIGNvbnN0IGFzTWF0Y2ggPSBibG9ja0FyZy5tYXRjaCgvXiguKz8pXFxzK2FzXFxzK1xcfChbXnxdKylcXHwkLyk7XG4gICAgICAgICAgaWYgKGFzTWF0Y2gpIHtcbiAgICAgICAgICAgIGFycmF5QXJnID0gYXNNYXRjaFsxXS50cmltKCk7XG4gICAgICAgICAgICBibG9ja1BhcmFtcyA9IGFzTWF0Y2hbMl0udHJpbSgpLnNwbGl0KC9cXHMrLyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFZhbGlkYXRlIHRoZSBhcnJheSB2YXJpYWJsZSBleGlzdHNcbiAgICAgICAgICBjb25zdCBhcnJheVBhdGggPSBwYXJzZVZhcmlhYmxlUGF0aChhcnJheUFyZyk7XG4gICAgICAgICAgY29uc3QgY3VycmVudENvbnRleHQgPSBjb250ZXh0U3RhY2tbY29udGV4dFN0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaXJzdCBwYXJ0IG9mIHRoZSBwYXRoIGlzIGEgYmxvY2sgcGFyYW1ldGVyIGZyb20gYSBwYXJlbnQgY29udGV4dFxuICAgICAgICAgIC8vIGUuZy4sIGluIHt7I2VhY2ggcG9zdHMgYXMgfHBvc3R8fX0sIHRoZW4ge3sjZWFjaCBwb3N0LnRhZ3MgYXMgfHRhZ3x9fVxuICAgICAgICAgIC8vIFwicG9zdFwiIGlzIGEgYmxvY2sgcGFyYW0gdGhhdCByZWZlcnMgdG8gYW4gYXJyYXkgaXRlbVxuICAgICAgICAgIGNvbnN0IGZpcnN0UGFydCA9IGFycmF5UGF0aFswXTtcbiAgICAgICAgICBsZXQgcmVzb2x2ZWQ6IHsgZm91bmQ6IGJvb2xlYW47IHByb3BlcnR5PzogSGFuZG9mZlByb3BlcnR5OyByZXNvbHZlZEF0Pzogc3RyaW5nIH07XG4gICAgICAgICAgbGV0IGJsb2NrUGFyYW1Db250ZXh0OiBTY29wZUNvbnRleHQgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgXG4gICAgICAgICAgZm9yIChsZXQgaSA9IGNvbnRleHRTdGFjay5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gY29udGV4dFN0YWNrW2ldO1xuICAgICAgICAgICAgaWYgKGN0eC5ibG9ja1BhcmFtcz8uaW5jbHVkZXMoZmlyc3RQYXJ0KSkge1xuICAgICAgICAgICAgICBibG9ja1BhcmFtQ29udGV4dCA9IGN0eDtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGlmIChibG9ja1BhcmFtQ29udGV4dCAmJiBibG9ja1BhcmFtQ29udGV4dC5pdGVtUHJvcGVydGllcykge1xuICAgICAgICAgICAgLy8gVGhlIGZpcnN0IHBhcnQgaXMgYSBibG9jayBwYXJhbWV0ZXIsIHJlc29sdmUgdGhlIHJlc3QgYWdhaW5zdCBpdGVtIHByb3BlcnRpZXNcbiAgICAgICAgICAgIGlmIChhcnJheVBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgIC8vIEp1c3QgdGhlIGJsb2NrIHBhcmFtIGl0c2VsZiAtIHRoaXMgd291bGQgYmUgd2VpcmQgZm9yICNlYWNoIGJ1dCBoYW5kbGUgaXRcbiAgICAgICAgICAgICAgcmVzb2x2ZWQgPSB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBmaXJzdFBhcnQgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFJlc29sdmUgdGhlIHJlc3Qgb2YgdGhlIHBhdGggYWdhaW5zdCBpdGVtIHByb3BlcnRpZXMgKGUuZy4sIHBvc3QudGFncyAtPiB0YWdzKVxuICAgICAgICAgICAgICBjb25zdCByZXN0UGF0aCA9IGFycmF5UGF0aC5zbGljZSgxKTtcbiAgICAgICAgICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3RQYXRoLCBwcm9wZXJ0aWVzLCBibG9ja1BhcmFtQ29udGV4dC5pdGVtUHJvcGVydGllcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE5vcm1hbCByZXNvbHV0aW9uXG4gICAgICAgICAgICByZXNvbHZlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgoYXJyYXlQYXRoLCBwcm9wZXJ0aWVzLCBjdXJyZW50Q29udGV4dC5pdGVtUHJvcGVydGllcyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGlmICghcmVzb2x2ZWQuZm91bmQpIHtcbiAgICAgICAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICB2YXJpYWJsZTogYXJyYXlBcmcsXG4gICAgICAgICAgICAgIGxpbmU6IGxpbmVOdW1iZXIsXG4gICAgICAgICAgICAgIGNvbnRleHQ6IGB7eyNlYWNoICR7YmxvY2tBcmd9fX1gLFxuICAgICAgICAgICAgICBtZXNzYWdlOiBgQXJyYXkgdmFyaWFibGUgXCIke2FycmF5QXJnfVwiIGlzIG5vdCBkZWZpbmVkIGluIGNvbXBvbmVudCBwcm9wZXJ0aWVzYFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChyZXNvbHZlZC5wcm9wZXJ0eT8udHlwZSAhPT0gJ2FycmF5JyAmJiByZXNvbHZlZC5wcm9wZXJ0eT8udHlwZSAhPT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICAgICAgICByZXN1bHQuaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKHtcbiAgICAgICAgICAgICAgdmFyaWFibGU6IGFycmF5QXJnLFxuICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICBjb250ZXh0OiBge3sjZWFjaCAke2Jsb2NrQXJnfX19YCxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYFZhcmlhYmxlIFwiJHthcnJheUFyZ31cIiBpcyBub3QgYW4gYXJyYXkgKGZvdW5kIHR5cGU6ICR7cmVzb2x2ZWQucHJvcGVydHk/LnR5cGV9KWBcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBQdXNoIGFycmF5IGl0ZW0gY29udGV4dCAtIGdldCBpdGVtIHByb3BlcnRpZXMgZnJvbSB0aGUgcmVzb2x2ZWQgYXJyYXlcbiAgICAgICAgICAvLyBGb3IgYmxvY2sgcGFyYW0gcmVmZXJlbmNlcywgd2UgbmVlZCB0byByZXNvbHZlIGZyb20gdGhlIGNvcnJlY3QgY29udGV4dFxuICAgICAgICAgIGxldCBpdGVtUHJvcHM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4gfCB1bmRlZmluZWQ7XG4gICAgICAgICAgaWYgKGJsb2NrUGFyYW1Db250ZXh0ICYmIGJsb2NrUGFyYW1Db250ZXh0Lml0ZW1Qcm9wZXJ0aWVzICYmIGFycmF5UGF0aC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICBjb25zdCByZXN0UGF0aCA9IGFycmF5UGF0aC5zbGljZSgxKTtcbiAgICAgICAgICAgIGl0ZW1Qcm9wcyA9IGdldEFycmF5SXRlbVByb3BlcnRpZXMocmVzdFBhdGgsIHByb3BlcnRpZXMsIGJsb2NrUGFyYW1Db250ZXh0Lml0ZW1Qcm9wZXJ0aWVzKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGl0ZW1Qcm9wcyA9IGdldEFycmF5SXRlbVByb3BlcnRpZXMoYXJyYXlQYXRoLCBwcm9wZXJ0aWVzLCBjdXJyZW50Q29udGV4dC5pdGVtUHJvcGVydGllcykgfHwgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgc2ltcGxlIHR5cGUgYXJyYXkgKHN0cmluZywgbnVtYmVyLCBldGMuKSAtIG5vIHdhcm5pbmcgbmVlZGVkXG4gICAgICAgICAgLy8gU2ltcGxlIGFycmF5cyB1c2Uge3t0aGlzfX0gdG8gcmVmZXJlbmNlIHRoZSBjdXJyZW50IGl0ZW1cbiAgICAgICAgICBjb25zdCBpc1NpbXBsZVR5cGVBcnJheSA9IHJlc29sdmVkLnByb3BlcnR5Py5pdGVtcz8udHlwZSAmJiBcbiAgICAgICAgICAgIFsnc3RyaW5nJywgJ251bWJlcicsICdib29sZWFuJ10uaW5jbHVkZXMocmVzb2x2ZWQucHJvcGVydHkuaXRlbXMudHlwZSk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gT25seSB3YXJuIGlmIHdlIGNvdWxkbid0IGZpbmQgaXRlbSBwcm9wZXJ0aWVzIEFORCBpdCdzIG5vdCBhIHNpbXBsZSB0eXBlIGFycmF5XG4gICAgICAgICAgaWYgKCFpdGVtUHJvcHMgJiYgcmVzb2x2ZWQuZm91bmQgJiYgcmVzb2x2ZWQucHJvcGVydHkgJiYgIWlzU2ltcGxlVHlwZUFycmF5KSB7XG4gICAgICAgICAgICBjb25zdCBhcnJheVByb3AgPSByZXNvbHZlZC5wcm9wZXJ0eTtcbiAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncy5wdXNoKHtcbiAgICAgICAgICAgICAgdmFyaWFibGU6IGFycmF5QXJnLFxuICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICBjb250ZXh0OiBge3sjZWFjaCAke2Jsb2NrQXJnfX19YCxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYEFycmF5IFwiJHthcnJheUFyZ31cIiBmb3VuZCBidXQgbm8gaXRlbSBwcm9wZXJ0aWVzIHNjaGVtYSBkZXRlY3RlZC4gQXJyYXkgaGFzOiBpdGVtcz0keyEhYXJyYXlQcm9wLml0ZW1zfSwgaXRlbXMudHlwZT0ke2FycmF5UHJvcC5pdGVtcz8udHlwZSB8fCAndW5kZWZpbmVkJ30sIGl0ZW1zLnByb3BlcnRpZXM9JHshIWFycmF5UHJvcC5pdGVtcz8ucHJvcGVydGllc30sIHByb3BlcnRpZXM9JHshIWFycmF5UHJvcC5wcm9wZXJ0aWVzfWBcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBQdXNoIGNvbnRleHQgd2l0aCBibG9jayBwYXJhbXMgaWYgc3BlY2lmaWVkXG4gICAgICAgICAgY29udGV4dFN0YWNrLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ2VhY2gnLFxuICAgICAgICAgICAgdmFyaWFibGU6IGFycmF5QXJnLFxuICAgICAgICAgICAgaXRlbVByb3BlcnRpZXM6IGl0ZW1Qcm9wcyB8fCB1bmRlZmluZWQsXG4gICAgICAgICAgICBibG9ja1BhcmFtczogYmxvY2tQYXJhbXMubGVuZ3RoID4gMCA/IGJsb2NrUGFyYW1zIDogdW5kZWZpbmVkXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSBpZiAoYmxvY2tUeXBlID09PSAnd2l0aCcpIHtcbiAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgb2JqZWN0IHZhcmlhYmxlIGV4aXN0c1xuICAgICAgICAgIGNvbnN0IG9ialBhdGggPSBwYXJzZVZhcmlhYmxlUGF0aChibG9ja0FyZyk7XG4gICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKG9ialBhdGgsIHByb3BlcnRpZXMsIGNvbnRleHRTdGFja1tjb250ZXh0U3RhY2subGVuZ3RoIC0gMV0uaXRlbVByb3BlcnRpZXMpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICghcmVzb2x2ZWQuZm91bmQpIHtcbiAgICAgICAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICB2YXJpYWJsZTogYmxvY2tBcmcsXG4gICAgICAgICAgICAgIGxpbmU6IGxpbmVOdW1iZXIsXG4gICAgICAgICAgICAgIGNvbnRleHQ6IGB7eyN3aXRoICR7YmxvY2tBcmd9fX1gLFxuICAgICAgICAgICAgICBtZXNzYWdlOiBgT2JqZWN0IHZhcmlhYmxlIFwiJHtibG9ja0FyZ31cIiBpcyBub3QgZGVmaW5lZCBpbiBjb21wb25lbnQgcHJvcGVydGllc2BcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBQdXNoIG9iamVjdCBjb250ZXh0XG4gICAgICAgICAgY29uc3Qgb2JqUHJvcCA9IHByb3BlcnRpZXNbb2JqUGF0aFswXV07XG4gICAgICAgICAgY29udGV4dFN0YWNrLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ3dpdGgnLFxuICAgICAgICAgICAgdmFyaWFibGU6IGJsb2NrQXJnLFxuICAgICAgICAgICAgaXRlbVByb3BlcnRpZXM6IG9ialByb3A/LnByb3BlcnRpZXMgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSBpZiAoYmxvY2tUeXBlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgY29uc3Qgc3RyaXBwZWRBcmcgPSBzdHJpcFF1b3RlcyhibG9ja0FyZyk7XG4gICAgICAgICAgY29uc3QgY3VycmVudENvbnRleHQgPSBjb250ZXh0U3RhY2tbY29udGV4dFN0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIFBhZ2luYXRpb24tcmVsYXRlZCBmaWVsZCBwYXRocyBhcmUgbWV0YWRhdGEgYW5ub3RhdGlvbnMsIG5vdCBlZGl0YWJsZSBmaWVsZHMuXG4gICAgICAgICAgLy8gU2tpcCB2YWxpZGF0aW9uIGJ1dCBzdGlsbCBwdXNoIGNvbnRleHQgZm9yIHByb3BlciBzY29wZSB0cmFja2luZy5cbiAgICAgICAgICBjb25zdCBpc1BhZ2luYXRpb25GaWVsZCA9IHN0cmlwcGVkQXJnLmluY2x1ZGVzKCcucGFnaW5hdGlvbicpIHx8IHN0cmlwcGVkQXJnLnN0YXJ0c1dpdGgoJ3BhZ2luYXRpb24uJyk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCFpc1BhZ2luYXRpb25GaWVsZCkge1xuICAgICAgICAgICAgY29uc3QgZmllbGRQYXRoID0gcGFyc2VWYXJpYWJsZVBhdGgoc3RyaXBwZWRBcmcpO1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKGZpZWxkUGF0aCwgcHJvcGVydGllcywgY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIXJlc29sdmVkLmZvdW5kKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF2YWlsYWJsZUF0Um9vdCA9IE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmpvaW4oJywgJyk7XG4gICAgICAgICAgICAgIGxldCBlcnJvckRldGFpbCA9IGBGaWVsZCBwYXRoIFwiJHtzdHJpcHBlZEFyZ31cIiAocGFyc2VkIGFzOiAke2ZpZWxkUGF0aC5qb2luKCcgLT4gJyl9KSBpcyBub3QgZGVmaW5lZC5gO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29uc3QgZmlyc3RQYXJ0ID0gZmllbGRQYXRoWzBdO1xuICAgICAgICAgICAgICBjb25zdCByb290UHJvcCA9IHByb3BlcnRpZXNbZmlyc3RQYXJ0XTtcbiAgICAgICAgICAgICAgaWYgKHJvb3RQcm9wKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZpZWxkUGF0aC5sZW5ndGggPiAxICYmIHJvb3RQcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHJvb3RQcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IG5lc3RlZEF2YWlsYWJsZSA9IE9iamVjdC5rZXlzKHJvb3RQcm9wLnByb3BlcnRpZXMpLmpvaW4oJywgJyk7XG4gICAgICAgICAgICAgICAgICBlcnJvckRldGFpbCArPSBgIFwiJHtmaXJzdFBhcnR9XCIgZXhpc3RzICh0eXBlOiAke3Jvb3RQcm9wLnR5cGV9KSwgYnV0IFwiJHtmaWVsZFBhdGhbMV19XCIgbm90IGZvdW5kIGluIGl0cyBwcm9wZXJ0aWVzLiBBdmFpbGFibGU6ICR7bmVzdGVkQXZhaWxhYmxlfWA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChmaWVsZFBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgZXJyb3JEZXRhaWwgKz0gYCBcIiR7Zmlyc3RQYXJ0fVwiIGV4aXN0cyBidXQgaXMgdHlwZSBcIiR7cm9vdFByb3AudHlwZX1cIiAobm90IGFuIG9iamVjdCB3aXRoIG5lc3RlZCBwcm9wZXJ0aWVzKS5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvckRldGFpbCArPSBgIEF2YWlsYWJsZSByb290IHByb3BlcnRpZXM6ICR7YXZhaWxhYmxlQXRSb290fWA7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgdmFyaWFibGU6IHN0cmlwcGVkQXJnLFxuICAgICAgICAgICAgICAgIGxpbmU6IGxpbmVOdW1iZXIsXG4gICAgICAgICAgICAgICAgY29udGV4dDogYHt7I2ZpZWxkICR7YmxvY2tBcmd9fX1gLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yRGV0YWlsXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBjb250ZXh0U3RhY2sucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiAnZmllbGQnLFxuICAgICAgICAgICAgdmFyaWFibGU6IHN0cmlwcGVkQXJnLFxuICAgICAgICAgICAgaXRlbVByb3BlcnRpZXM6IGN1cnJlbnRDb250ZXh0Lml0ZW1Qcm9wZXJ0aWVzXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgXG4gICAgICAgIH0gZWxzZSBpZiAoYmxvY2tUeXBlID09PSAnaWYnIHx8IGJsb2NrVHlwZSA9PT0gJ3VubGVzcycpIHtcbiAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgY29uZGl0aW9uIHZhcmlhYmxlIGV4aXN0cyAodW5sZXNzIGl0J3MgYSBjb21wbGV4IGV4cHJlc3Npb24pXG4gICAgICAgICAgY29uc3QgY29uZFZhciA9IGJsb2NrQXJnLnNwbGl0KC9cXHMrLylbMF07IC8vIEdldCBmaXJzdCB3b3JkXG4gICAgICAgICAgLy8gU2tpcCB2YWxpZGF0aW9uIGZvciBALXByZWZpeGVkIHZhcmlhYmxlcyBhbmQgZ2xvYmFsIGNvbXBpbGVyIHZhcmlhYmxlcyAoc3R5bGUsIHNjcmlwdClcbiAgICAgICAgICBpZiAoY29uZFZhciAmJiAhY29uZFZhci5pbmNsdWRlcygnKCcpICYmICFjb25kVmFyLnN0YXJ0c1dpdGgoJ0AnKSAmJiBcbiAgICAgICAgICAgICAgY29uZFZhciAhPT0gJ3N0eWxlJyAmJiBjb25kVmFyICE9PSAnc2NyaXB0JyAmJlxuICAgICAgICAgICAgICAhY29uZFZhci5zdGFydHNXaXRoKCdzdHlsZS4nKSAmJiAhY29uZFZhci5zdGFydHNXaXRoKCdzY3JpcHQuJykpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbmRQYXRoID0gcGFyc2VWYXJpYWJsZVBhdGgoY29uZFZhcik7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q29udGV4dCA9IGNvbnRleHRTdGFja1tjb250ZXh0U3RhY2subGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgoY29uZFBhdGgsIHByb3BlcnRpZXMsIGN1cnJlbnRDb250ZXh0Lml0ZW1Qcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5mb3VuZCkge1xuICAgICAgICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgcHJvcGVydHkgcmVmZXJlbmNlIGluIGN1cnJlbnQgY29udGV4dFxuICAgICAgICAgICAgICByZXN1bHQud2FybmluZ3MucHVzaCh7XG4gICAgICAgICAgICAgICAgdmFyaWFibGU6IGNvbmRWYXIsXG4gICAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgICBjb250ZXh0OiBge3sjJHtibG9ja1R5cGV9ICR7YmxvY2tBcmd9fX1gLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb25kaXRpb24gdmFyaWFibGUgXCIke2NvbmRWYXJ9XCIgbWF5IG5vdCBiZSBkZWZpbmVkIGluIGNvbXBvbmVudCBwcm9wZXJ0aWVzYFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRG9uJ3QgcHVzaCBhIG5ldyBjb250ZXh0IGZvciBpZi91bmxlc3NcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgfSBlbHNlIGlmIChwcmVmaXggPT09ICcvJykge1xuICAgICAgLy8gQmxvY2sgY2xvc2luZzoge3svZWFjaH19LCB7ey93aXRofX0sIHt7L2lmfX0sIHt7L2ZpZWxkfX1cbiAgICAgIGNvbnN0IGJsb2NrVHlwZSA9IGNvbnRlbnQ7XG4gICAgICBpZiAoYmxvY2tUeXBlID09PSAnZWFjaCcgfHwgYmxvY2tUeXBlID09PSAnd2l0aCcgfHwgYmxvY2tUeXBlID09PSAnZmllbGQnKSB7XG4gICAgICAgIGlmIChjb250ZXh0U3RhY2subGVuZ3RoID4gMSkge1xuICAgICAgICAgIGNvbnRleHRTdGFjay5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNraXAgZWxzZS9lbHNlIGlmIGNvbnN0cnVjdHMgLSB0aGVzZSBhcmUgcGFydCBvZiBpZi91bmxlc3MgYmxvY2tzXG4gICAgICBpZiAoY29udGVudCA9PT0gJ2Vsc2UnIHx8IGNvbnRlbnQuc3RhcnRzV2l0aCgnZWxzZSAnKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRXhwcmVzc2lvbjoge3t2YXJpYWJsZX19LCB7e29iai5wcm9wfX0sIGV0Yy5cbiAgICAgIGNvbnN0IHZhck5hbWUgPSBleHRyYWN0VmFyaWFibGVGcm9tRXhwcmVzc2lvbihjb250ZW50KTtcbiAgICAgIGlmICh2YXJOYW1lKSB7XG4gICAgICAgIGNvbnN0IHZhclBhdGggPSBwYXJzZVZhcmlhYmxlUGF0aCh2YXJOYW1lKTtcbiAgICAgICAgY29uc3QgY3VycmVudENvbnRleHQgPSBjb250ZXh0U3RhY2tbY29udGV4dFN0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICBcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IHBhcnQgb2YgdGhlIHBhdGggaXMgYSBibG9jayBwYXJhbWV0ZXJcbiAgICAgICAgLy8gZS5nLiwgaW4ge3sjZWFjaCBpdGVtcyBhcyB8aXRlbXx9fSwgXCJpdGVtXCIgaXMgYSBibG9jayBwYXJhbVxuICAgICAgICAvLyBhbmQgXCJpdGVtLm5hbWVcIiBzaG91bGQgcmVzb2x2ZSBhZ2FpbnN0IHRoZSBhcnJheSdzIGl0ZW0gcHJvcGVydGllc1xuICAgICAgICBsZXQgcmVzb2x2ZWQ6IHsgZm91bmQ6IGJvb2xlYW47IHByb3BlcnR5PzogSGFuZG9mZlByb3BlcnR5OyByZXNvbHZlZEF0Pzogc3RyaW5nIH07XG4gICAgICAgIGNvbnN0IGZpcnN0UGFydCA9IHZhclBhdGhbMF07XG4gICAgICAgIFxuICAgICAgICAvLyBMb29rIHRocm91Z2ggdGhlIGNvbnRleHQgc3RhY2sgZm9yIGEgbWF0Y2hpbmcgYmxvY2sgcGFyYW1ldGVyXG4gICAgICAgIGxldCBibG9ja1BhcmFtQ29udGV4dDogU2NvcGVDb250ZXh0IHwgdW5kZWZpbmVkO1xuICAgICAgICBmb3IgKGxldCBpID0gY29udGV4dFN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgY29uc3QgY3R4ID0gY29udGV4dFN0YWNrW2ldO1xuICAgICAgICAgIGlmIChjdHguYmxvY2tQYXJhbXM/LmluY2x1ZGVzKGZpcnN0UGFydCkpIHtcbiAgICAgICAgICAgIGJsb2NrUGFyYW1Db250ZXh0ID0gY3R4O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoYmxvY2tQYXJhbUNvbnRleHQgJiYgYmxvY2tQYXJhbUNvbnRleHQuaXRlbVByb3BlcnRpZXMpIHtcbiAgICAgICAgICAvLyBUaGUgZmlyc3QgcGFydCBpcyBhIGJsb2NrIHBhcmFtZXRlciwgcmVzb2x2ZSB0aGUgcmVzdCBhZ2FpbnN0IGl0ZW0gcHJvcGVydGllc1xuICAgICAgICAgIGlmICh2YXJQYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgLy8gSnVzdCB0aGUgYmxvY2sgcGFyYW0gaXRzZWxmIChlLmcuLCB7e2JyZWFkY3J1bWJ9fSkgLSB2YWxpZFxuICAgICAgICAgICAgcmVzb2x2ZWQgPSB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBmaXJzdFBhcnQgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgcmVzdCBvZiB0aGUgcGF0aCBhZ2FpbnN0IGl0ZW0gcHJvcGVydGllcyAoZS5nLiwgYnJlYWRjcnVtYi5sYWJlbCAtPiBsYWJlbClcbiAgICAgICAgICAgIGNvbnN0IHJlc3RQYXRoID0gdmFyUGF0aC5zbGljZSgxKTtcbiAgICAgICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChyZXN0UGF0aCwgcHJvcGVydGllcywgYmxvY2tQYXJhbUNvbnRleHQuaXRlbVByb3BlcnRpZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBOb3JtYWwgcmVzb2x1dGlvblxuICAgICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aCh2YXJQYXRoLCBwcm9wZXJ0aWVzLCBjdXJyZW50Q29udGV4dC5pdGVtUHJvcGVydGllcyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghcmVzb2x2ZWQuZm91bmQpIHtcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgbG9vcCB2YXJpYWJsZSByZWZlcmVuY2UgKGUuZy4sIHJlZmVyZW5jaW5nIGl0ZW0gcHJvcGVydGllcylcbiAgICAgICAgICBpZiAoY3VycmVudENvbnRleHQudHlwZSA9PT0gJ2VhY2gnKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgLy8gQWxyZWFkeSBjaGVja2VkIHdpdGggaXRlbVByb3BlcnRpZXMsIGRlZmluaXRlbHkgbm90IGZvdW5kXG4gICAgICAgICAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgdmFyaWFibGU6IHZhck5hbWUsXG4gICAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgICBjb250ZXh0OiBge3ske2NvbnRlbnR9fX1gLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBWYXJpYWJsZSBcIiR7dmFyTmFtZX1cIiBpcyBub3QgZGVmaW5lZC4gSW4ge3sjZWFjaCAke2N1cnJlbnRDb250ZXh0LnZhcmlhYmxlfX19IGNvbnRleHQsIGF2YWlsYWJsZSBpdGVtIHByb3BlcnRpZXMgYXJlOiAke09iamVjdC5rZXlzKGN1cnJlbnRDb250ZXh0Lml0ZW1Qcm9wZXJ0aWVzKS5qb2luKCcsICcpIHx8ICdub25lJ31gXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gTm8gaXRlbSBwcm9wZXJ0aWVzIGZvdW5kIGZvciB0aGlzIGFycmF5IC0gbWlnaHQgYmUgYSBzaW1wbGUgYXJyYXkgb3IgbWlzc2luZyBzY2hlbWFcbiAgICAgICAgICAgICAgcmVzdWx0Lndhcm5pbmdzLnB1c2goe1xuICAgICAgICAgICAgICAgIHZhcmlhYmxlOiB2YXJOYW1lLFxuICAgICAgICAgICAgICAgIGxpbmU6IGxpbmVOdW1iZXIsXG4gICAgICAgICAgICAgICAgY29udGV4dDogYHt7JHtjb250ZW50fX19YCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ2Fubm90IHZhbGlkYXRlIFwiJHt2YXJOYW1lfVwiIC0gbm8gaXRlbSBwcm9wZXJ0aWVzIHNjaGVtYSBmb3VuZCBmb3Ige3sjZWFjaCAke2N1cnJlbnRDb250ZXh0LnZhcmlhYmxlfX19LiBUaGUgYXJyYXkgbWF5IG5vdCBoYXZlIGRlZmluZWQgaXRlbSBwcm9wZXJ0aWVzLmBcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50Q29udGV4dC50eXBlID09PSAnd2l0aCcgJiYgY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICB2YXJpYWJsZTogdmFyTmFtZSxcbiAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgY29udGV4dDogYHt7JHtjb250ZW50fX19YCxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYFZhcmlhYmxlIFwiJHt2YXJOYW1lfVwiIGlzIG5vdCBkZWZpbmVkIGluIHt7I3dpdGggJHtjdXJyZW50Q29udGV4dC52YXJpYWJsZX19fSBjb250ZXh0YFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICB2YXJpYWJsZTogdmFyTmFtZSxcbiAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgY29udGV4dDogYHt7JHtjb250ZW50fX19YCxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYFZhcmlhYmxlIFwiJHt2YXJOYW1lfVwiIGlzIG5vdCBkZWZpbmVkIGluIGNvbXBvbmVudCBwcm9wZXJ0aWVzLiBBdmFpbGFibGUgcHJvcGVydGllczogJHtPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5qb2luKCcsICcpfWBcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRm9ybWF0IHZhbGlkYXRpb24gcmVzdWx0IGZvciBjb25zb2xlIG91dHB1dFxuICovXG5leHBvcnQgY29uc3QgZm9ybWF0VGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0ID0gKHJlc3VsdDogVGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0KTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gIFxuICBjb25zdCBpY29uID0gcmVzdWx0LmlzVmFsaWQgPyAn4pyFJyA6ICfinYwnO1xuICBsaW5lcy5wdXNoKGAke2ljb259IFRlbXBsYXRlIFZhcmlhYmxlczogJHtyZXN1bHQuY29tcG9uZW50VGl0bGV9ICgke3Jlc3VsdC5jb21wb25lbnRJZH0pYCk7XG4gIFxuICBpZiAocmVzdWx0LmVycm9ycy5sZW5ndGggPT09IDAgJiYgcmVzdWx0Lndhcm5pbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgIGxpbmVzLnB1c2goYCAgIEFsbCB0ZW1wbGF0ZSB2YXJpYWJsZXMgYXJlIHByb3Blcmx5IGRlZmluZWRgKTtcbiAgfSBlbHNlIHtcbiAgICBpZiAocmVzdWx0LmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICBsaW5lcy5wdXNoKGAgICDwn5qoIFVuZGVmaW5lZCBWYXJpYWJsZXM6YCk7XG4gICAgICBmb3IgKGNvbnN0IGVycm9yIG9mIHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgICAgY29uc3QgbGluZUluZm8gPSBlcnJvci5saW5lID8gYCAobGluZSAke2Vycm9yLmxpbmV9KWAgOiAnJztcbiAgICAgICAgbGluZXMucHVzaChgICAgICAg4p2MICR7ZXJyb3IuY29udGV4dH0ke2xpbmVJbmZvfWApO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgICAgICAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIGlmIChyZXN1bHQud2FybmluZ3MubGVuZ3RoID4gMCkge1xuICAgICAgbGluZXMucHVzaChgICAg4pqg77iPICBXYXJuaW5nczpgKTtcbiAgICAgIGZvciAoY29uc3Qgd2FybmluZyBvZiByZXN1bHQud2FybmluZ3MpIHtcbiAgICAgICAgY29uc3QgbGluZUluZm8gPSB3YXJuaW5nLmxpbmUgPyBgIChsaW5lICR7d2FybmluZy5saW5lfSlgIDogJyc7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgICAgIOKaoO+4jyAgJHt3YXJuaW5nLmNvbnRleHR9JHtsaW5lSW5mb31gKTtcbiAgICAgICAgbGluZXMucHVzaChgICAgICAgICAgJHt3YXJuaW5nLm1lc3NhZ2V9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59O1xuIl19