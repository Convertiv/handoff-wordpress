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
    // Skip Handlebars built-ins, special variables, and global compiler variables.
    // @root.xxx IS validated (it references the root context), but other @-prefixed
    // data variables (e.g. @index, @first, @last, @key) are built-ins and skipped.
    if ((trimmed.startsWith('@') && !trimmed.startsWith('@root.')) ||
        trimmed === 'this' || trimmed === 'else' ||
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
    // Handle "@root." prefix - @root refers to the root data context in Handlebars,
    // so @root.properties.xxx is equivalent to properties.xxx at the root.
    path = path.replace(/^@root\./, '');
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
                    // Skip validation for @-prefixed built-ins (except @root.xxx, which IS validated)
                    // and global compiler variables (style, script).
                    const isAtBuiltin = condVar.startsWith('@') && !condVar.startsWith('@root.');
                    if (condVar && !condVar.includes('(') && !isAtBuiltin &&
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcGxhdGUtdmFyaWFibGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ZhbGlkYXRvcnMvdGVtcGxhdGUtdmFyaWFibGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBNkJIOzs7R0FHRztBQUNILE1BQU0sNkJBQTZCLEdBQUcsQ0FBQyxJQUFZLEVBQWlCLEVBQUU7SUFDcEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBRTVCLCtFQUErRTtJQUMvRSxnRkFBZ0Y7SUFDaEYsK0VBQStFO0lBQy9FLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRCxPQUFPLEtBQUssTUFBTSxJQUFJLE9BQU8sS0FBSyxNQUFNO1FBQ3hDLE9BQU8sS0FBSyxPQUFPLElBQUksT0FBTyxLQUFLLFFBQVE7UUFDM0MsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDbEUsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsaUVBQWlFO0lBQ2pFLHlEQUF5RDtJQUN6RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25DLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUzQixvREFBb0Q7SUFDcEQsTUFBTSxZQUFZLEdBQUcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoRixJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUNyQyxPQUFPLElBQUksQ0FBQztJQUNk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RCxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDMUMsQ0FBQztRQUNILENBQUM7UUFFRCxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQy9CLEtBQUssQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMvQixLQUFLLE1BQU0sT0FBTyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsVUFBVSxPQUFPLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDL0QsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLE9BQU8sQ0FBQyxPQUFPLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDdEQsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQzVDLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMxQixDQUFDLENBQUM7QUE3QlcsUUFBQSw4QkFBOEIsa0NBNkJ6QyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGVtcGxhdGUgVmFyaWFibGUgVmFsaWRhdG9yXG4gKiBcbiAqIFZhbGlkYXRlcyB0aGF0IGFsbCB2YXJpYWJsZXMgcmVmZXJlbmNlZCBpbiBhIEhhbmRsZWJhcnMgdGVtcGxhdGVcbiAqIGFyZSBkZWNsYXJlZCBpbiB0aGUgY29tcG9uZW50J3MgcHJvcGVydGllcy5cbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50LCBIYW5kb2ZmUHJvcGVydHkgfSBmcm9tICcuLi90eXBlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVtcGxhdGVWYXJpYWJsZUVycm9yIHtcbiAgdmFyaWFibGU6IHN0cmluZztcbiAgbGluZT86IG51bWJlcjtcbiAgY29udGV4dDogc3RyaW5nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0IHtcbiAgY29tcG9uZW50SWQ6IHN0cmluZztcbiAgY29tcG9uZW50VGl0bGU6IHN0cmluZztcbiAgaXNWYWxpZDogYm9vbGVhbjtcbiAgZXJyb3JzOiBUZW1wbGF0ZVZhcmlhYmxlRXJyb3JbXTtcbiAgd2FybmluZ3M6IFRlbXBsYXRlVmFyaWFibGVFcnJvcltdO1xufVxuXG4vKipcbiAqIENvbnRleHQgdHJhY2tpbmcgZm9yIG5lc3RlZCBzY29wZXMgKGVhY2gsIHdpdGggYmxvY2tzKVxuICovXG5pbnRlcmZhY2UgU2NvcGVDb250ZXh0IHtcbiAgdHlwZTogJ3Jvb3QnIHwgJ2VhY2gnIHwgJ3dpdGgnIHwgJ2ZpZWxkJztcbiAgdmFyaWFibGU/OiBzdHJpbmc7ICAgICAgICAvLyBUaGUgdmFyaWFibGUgdGhhdCBvcGVuZWQgdGhpcyBzY29wZVxuICBpdGVtUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT47ICAvLyBBdmFpbGFibGUgcHJvcGVydGllcyBpbiB0aGlzIHNjb3BlXG4gIGJsb2NrUGFyYW1zPzogc3RyaW5nW107ICAgLy8gTmFtZWQgYmxvY2sgcGFyYW1ldGVycyAoZS5nLiwgfGl0ZW18IG9yIHxpdGVtIGluZGV4fClcbn1cblxuLyoqXG4gKiBFeHRyYWN0IHZhcmlhYmxlIG5hbWVzIGZyb20gYSBIYW5kbGViYXJzIGV4cHJlc3Npb25cbiAqIEhhbmRsZXM6IHt7dmFyfX0sIHt7b2JqLnByb3B9fSwge3tAaW5kZXh9fSwge3t0aGlzfX0sIHt7dGhpcy5wcm9wfX1cbiAqL1xuY29uc3QgZXh0cmFjdFZhcmlhYmxlRnJvbUV4cHJlc3Npb24gPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IHRyaW1tZWQgPSBleHByLnRyaW0oKTtcbiAgXG4gIC8vIFNraXAgSGFuZGxlYmFycyBidWlsdC1pbnMsIHNwZWNpYWwgdmFyaWFibGVzLCBhbmQgZ2xvYmFsIGNvbXBpbGVyIHZhcmlhYmxlcy5cbiAgLy8gQHJvb3QueHh4IElTIHZhbGlkYXRlZCAoaXQgcmVmZXJlbmNlcyB0aGUgcm9vdCBjb250ZXh0KSwgYnV0IG90aGVyIEAtcHJlZml4ZWRcbiAgLy8gZGF0YSB2YXJpYWJsZXMgKGUuZy4gQGluZGV4LCBAZmlyc3QsIEBsYXN0LCBAa2V5KSBhcmUgYnVpbHQtaW5zIGFuZCBza2lwcGVkLlxuICBpZiAoKHRyaW1tZWQuc3RhcnRzV2l0aCgnQCcpICYmICF0cmltbWVkLnN0YXJ0c1dpdGgoJ0Byb290LicpKSB8fFxuICAgICAgdHJpbW1lZCA9PT0gJ3RoaXMnIHx8IHRyaW1tZWQgPT09ICdlbHNlJyB8fFxuICAgICAgdHJpbW1lZCA9PT0gJ3N0eWxlJyB8fCB0cmltbWVkID09PSAnc2NyaXB0JyB8fFxuICAgICAgdHJpbW1lZC5zdGFydHNXaXRoKCdzdHlsZS4nKSB8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJ3NjcmlwdC4nKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIFxuICAvLyBTa2lwIGhlbHBlciBjYWxscyB3aXRoIHBhcmFtZXRlcnMgKGUuZy4sIFwiZm9ybWF0RGF0ZSBzb21lVmFyXCIpXG4gIC8vIFdlIHdhbnQgdGhlIGZpcnN0IHdvcmQgd2hpY2ggaXMgdHlwaWNhbGx5IHRoZSB2YXJpYWJsZVxuICBjb25zdCBwYXJ0cyA9IHRyaW1tZWQuc3BsaXQoL1xccysvKTtcbiAgY29uc3QgZmlyc3RQYXJ0ID0gcGFydHNbMF07XG4gIFxuICAvLyBTa2lwIGJsb2NrIGhlbHBlcnMgKGVhY2gsIGlmLCB1bmxlc3MsIHdpdGgsIGV0Yy4pXG4gIGNvbnN0IGJsb2NrSGVscGVycyA9IFsnZWFjaCcsICdpZicsICd1bmxlc3MnLCAnd2l0aCcsICdmaWVsZCcsICdsb29rdXAnLCAnbG9nJ107XG4gIGlmIChibG9ja0hlbHBlcnMuaW5jbHVkZXMoZmlyc3RQYXJ0KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIFxuICAvLyBTa2lwIGNvbW1lbnRcbiAgaWYgKGZpcnN0UGFydC5zdGFydHNXaXRoKCchJykpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBcbiAgcmV0dXJuIGZpcnN0UGFydCB8fCBudWxsO1xufTtcblxuLyoqXG4gKiBTdHJpcCBxdW90ZXMgZnJvbSBhIHN0cmluZyBhcmd1bWVudFxuICogSGFuZGxlczogXCJ2YWx1ZVwiLCAndmFsdWUnLCBvciB1bnF1b3RlZCB2YWx1ZVxuICovXG5jb25zdCBzdHJpcFF1b3RlcyA9IChzdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHRyaW1tZWQgPSBzdHIudHJpbSgpO1xuICAvLyBDaGVjayBmb3IgZG91YmxlIHF1b3Rlc1xuICBpZiAodHJpbW1lZC5zdGFydHNXaXRoKCdcIicpICYmIHRyaW1tZWQuZW5kc1dpdGgoJ1wiJykpIHtcbiAgICByZXR1cm4gdHJpbW1lZC5zbGljZSgxLCAtMSk7XG4gIH1cbiAgLy8gQ2hlY2sgZm9yIHNpbmdsZSBxdW90ZXNcbiAgaWYgKHRyaW1tZWQuc3RhcnRzV2l0aChcIidcIikgJiYgdHJpbW1lZC5lbmRzV2l0aChcIidcIikpIHtcbiAgICByZXR1cm4gdHJpbW1lZC5zbGljZSgxLCAtMSk7XG4gIH1cbiAgcmV0dXJuIHRyaW1tZWQ7XG59O1xuXG4vKipcbiAqIFBhcnNlIGEgdmFyaWFibGUgcGF0aCBsaWtlIFwibGVmdENhcmQuaW1hZ2Uuc3JjXCIgaW50byBzZWdtZW50c1xuICogQWxzbyBoYW5kbGVzIHF1b3RlZCBwYXRocyBsaWtlIFwibGVmdENhcmQuaW1hZ2VcIlxuICogU3RyaXBzIHNwZWNpYWwgcHJlZml4ZXMgbGlrZSBcInRoaXMuXCIsIFwicHJvcGVydGllcy5cIiwgYW5kIFwiLi4vXCJcbiAqL1xuY29uc3QgcGFyc2VWYXJpYWJsZVBhdGggPSAodmFyUGF0aDogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuICAvLyBTdHJpcCBxdW90ZXMgZmlyc3RcbiAgY29uc3QgdW5xdW90ZWQgPSBzdHJpcFF1b3Rlcyh2YXJQYXRoKTtcbiAgLy8gSGFuZGxlIFwiLi4vXCIgcGFyZW50IGNvbnRleHQgcmVmZXJlbmNlcyBieSBzdHJpcHBpbmcgdGhlbVxuICAvLyBJbiBIYW5kbGViYXJzLCAuLi8gZ29lcyB1cCB0byBwYXJlbnQgY29udGV4dCAtIGZvciB2YWxpZGF0aW9uIHB1cnBvc2VzLFxuICAvLyB3ZSBldmFsdWF0ZSBmcm9tIHJvb3QgcHJvcGVydGllc1xuICBsZXQgcGF0aCA9IHVucXVvdGVkLnJlcGxhY2UoL14oXFwuXFwuXFwvKSsvLCAnJyk7XG4gIC8vIEhhbmRsZSBcIkByb290LlwiIHByZWZpeCAtIEByb290IHJlZmVycyB0byB0aGUgcm9vdCBkYXRhIGNvbnRleHQgaW4gSGFuZGxlYmFycyxcbiAgLy8gc28gQHJvb3QucHJvcGVydGllcy54eHggaXMgZXF1aXZhbGVudCB0byBwcm9wZXJ0aWVzLnh4eCBhdCB0aGUgcm9vdC5cbiAgcGF0aCA9IHBhdGgucmVwbGFjZSgvXkByb290XFwuLywgJycpO1xuICAvLyBIYW5kbGUgXCJ0aGlzLnByb3BlcnR5XCIgYnkgcmVtb3ZpbmcgXCJ0aGlzLlwiXG4gIHBhdGggPSBwYXRoLnJlcGxhY2UoL150aGlzXFwuLywgJycpO1xuICAvLyBIYW5kbGUgXCJwcm9wZXJ0aWVzLnh4eFwiIGJ5IHJlbW92aW5nIFwicHJvcGVydGllcy5cIiBwcmVmaXhcbiAgLy8gVGhpcyBpcyBhIGNvbW1vbiBIYW5kbGViYXJzIHBhdHRlcm4gdG8gYWNjZXNzIGNvbXBvbmVudCBwcm9wZXJ0aWVzXG4gIHBhdGggPSBwYXRoLnJlcGxhY2UoL15wcm9wZXJ0aWVzXFwuLywgJycpO1xuICByZXR1cm4gcGF0aC5zcGxpdCgnLicpO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IGNhbWVsQ2FzZSB0byBzbmFrZV9jYXNlXG4gKi9cbmNvbnN0IHRvU25ha2VDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oW0EtWl0pL2csICdfJDEnKS50b0xvd2VyQ2FzZSgpO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IHNuYWtlX2Nhc2UgdG8gY2FtZWxDYXNlXG4gKi9cbmNvbnN0IHRvQ2FtZWxDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9fKFthLXpdKS9nLCAoXywgbGV0dGVyKSA9PiBsZXR0ZXIudG9VcHBlckNhc2UoKSk7XG59O1xuXG4vKipcbiAqIEZpbmQgYSBwcm9wZXJ0eSBieSBuYW1lLCB0cnlpbmcgYm90aCB0aGUgb3JpZ2luYWwgbmFtZSBhbmQgY2FzZSB2YXJpYXRpb25zXG4gKi9cbmNvbnN0IGZpbmRQcm9wZXJ0eSA9IChcbiAgbmFtZTogc3RyaW5nLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+XG4pOiB7IGtleTogc3RyaW5nOyBwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5IH0gfCBudWxsID0+IHtcbiAgLy8gVHJ5IGV4YWN0IG1hdGNoIGZpcnN0XG4gIGlmIChwcm9wZXJ0aWVzW25hbWVdKSB7XG4gICAgcmV0dXJuIHsga2V5OiBuYW1lLCBwcm9wZXJ0eTogcHJvcGVydGllc1tuYW1lXSB9O1xuICB9XG4gIFxuICAvLyBUcnkgc25ha2VfY2FzZSB2ZXJzaW9uXG4gIGNvbnN0IHNuYWtlQ2FzZSA9IHRvU25ha2VDYXNlKG5hbWUpO1xuICBpZiAocHJvcGVydGllc1tzbmFrZUNhc2VdKSB7XG4gICAgcmV0dXJuIHsga2V5OiBzbmFrZUNhc2UsIHByb3BlcnR5OiBwcm9wZXJ0aWVzW3NuYWtlQ2FzZV0gfTtcbiAgfVxuICBcbiAgLy8gVHJ5IGNhbWVsQ2FzZSB2ZXJzaW9uXG4gIGNvbnN0IGNhbWVsQ2FzZSA9IHRvQ2FtZWxDYXNlKG5hbWUpO1xuICBpZiAocHJvcGVydGllc1tjYW1lbENhc2VdKSB7XG4gICAgcmV0dXJuIHsga2V5OiBjYW1lbENhc2UsIHByb3BlcnR5OiBwcm9wZXJ0aWVzW2NhbWVsQ2FzZV0gfTtcbiAgfVxuICBcbiAgcmV0dXJuIG51bGw7XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGEgdmFyaWFibGUgcGF0aCBleGlzdHMgaW4gdGhlIGdpdmVuIHByb3BlcnRpZXNcbiAqIFJldHVybnMgdGhlIHJlc29sdmVkIHByb3BlcnR5IG9yIG51bGwgaWYgbm90IGZvdW5kXG4gKiBIYW5kbGVzIGNhc2UgdmFyaWF0aW9ucyAoY2FtZWxDYXNlLCBzbmFrZV9jYXNlKVxuICovXG5jb25zdCByZXNvbHZlVmFyaWFibGVQYXRoID0gKFxuICBwYXRoOiBzdHJpbmdbXSxcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PixcbiAgYXJyYXlJdGVtQ29udGV4dD86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT5cbik6IHsgZm91bmQ6IGJvb2xlYW47IHByb3BlcnR5PzogSGFuZG9mZlByb3BlcnR5OyByZXNvbHZlZEF0Pzogc3RyaW5nIH0gPT4ge1xuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4geyBmb3VuZDogZmFsc2UgfTtcbiAgfVxuXG4gIGNvbnN0IFtmaXJzdCwgLi4ucmVzdF0gPSBwYXRoO1xuICBcbiAgLy8gRmlyc3QsIGNoZWNrIGlmIHdlJ3JlIGluIGFuIGFycmF5IGl0ZXJhdGlvbiBjb250ZXh0XG4gIGlmIChhcnJheUl0ZW1Db250ZXh0KSB7XG4gICAgY29uc3QgZm91bmQgPSBmaW5kUHJvcGVydHkoZmlyc3QsIGFycmF5SXRlbUNvbnRleHQpO1xuICAgIGlmIChmb3VuZCkge1xuICAgICAgY29uc3QgcHJvcCA9IGZvdW5kLnByb3BlcnR5O1xuICAgICAgY29uc3QgYWN0dWFsS2V5ID0gZm91bmQua2V5O1xuICAgICAgXG4gICAgICBpZiAocmVzdC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHByb3BlcnR5OiBwcm9wLCByZXNvbHZlZEF0OiBhY3R1YWxLZXkgfTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gQ29udGludWUgcmVzb2x2aW5nIG5lc3RlZCBwcm9wZXJ0aWVzIGZvciBvYmplY3RzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChyZXN0LCBwcm9wLnByb3BlcnRpZXMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLm5lc3RlZCxcbiAgICAgICAgICByZXNvbHZlZEF0OiBuZXN0ZWQuZm91bmQgPyBgJHthY3R1YWxLZXl9LiR7bmVzdGVkLnJlc29sdmVkQXR9YCA6IHVuZGVmaW5lZFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBIYW5kbGUgYXJyYXlzIHdpdGhpbiBhcnJheSBpdGVtc1xuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICBpZiAocHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgICAgIGNvbnN0IG5lc3RlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgocmVzdCwgcHJvcC5pdGVtcy5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICBpZiAobmVzdGVkLmZvdW5kKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5uZXN0ZWQsXG4gICAgICAgICAgICAgIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocHJvcC5wYWdpbmF0aW9uICYmIHJlc3RbMF0gPT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHByb3BlcnR5OiBwcm9wLnBhZ2luYXRpb24sIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0ucGFnaW5hdGlvbmAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcGFnaW5hdGlvblJlc3QgPSByZXN0LnNsaWNlKDEpO1xuICAgICAgICAgIGlmIChwcm9wLnBhZ2luYXRpb24uaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG5lc3RlZCA9IHJlc29sdmVWYXJpYWJsZVBhdGgocGFnaW5hdGlvblJlc3QsIHByb3AucGFnaW5hdGlvbi5pdGVtcy5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLm5lc3RlZCxcbiAgICAgICAgICAgICAgcmVzb2x2ZWRBdDogbmVzdGVkLmZvdW5kID8gYCR7YWN0dWFsS2V5fS5wYWdpbmF0aW9uLiR7bmVzdGVkLnJlc29sdmVkQXR9YCA6IHVuZGVmaW5lZFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gSGFuZGxlIHBhZ2luYXRpb24gdHlwZSAocmVzb2x2ZXMgdGhyb3VnaCBpdGVtcy5wcm9wZXJ0aWVzIGxpa2UgYXJyYXlzKVxuICAgICAgaWYgKHByb3AudHlwZSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICAgIGlmIChwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgY29uc3QgbmVzdGVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChyZXN0LCBwcm9wLml0ZW1zLnByb3BlcnRpZXMpO1xuICAgICAgICAgIGlmIChuZXN0ZWQuZm91bmQpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLm5lc3RlZCxcbiAgICAgICAgICAgICAgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke25lc3RlZC5yZXNvbHZlZEF0fWBcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhZ2luYXRpb25JdGVtUHJvcHMgPSBbJ2xhYmVsJywgJ3VybCcsICdhY3RpdmUnXTtcbiAgICAgICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIHBhZ2luYXRpb25JdGVtUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIEltYWdlIGhhcyBpbXBsaWNpdCBzcmMsIGFsdCwgaWQsIHNyY3NldCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvcHMgPSBbJ3NyYycsICdhbHQnLCAnaWQnLCAndXJsJywgJ3dpZHRoJywgJ2hlaWdodCcsICdzcmNzZXQnLCAnc2l6ZXMnXTtcbiAgICAgICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIGltYWdlUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIFZpZGVvIGhhcyBpbXBsaWNpdCBzcmMsIHBvc3RlciwgdHlwZSwgd2lkdGgsIGhlaWdodCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAndmlkZW8nKSB7XG4gICAgICAgIGNvbnN0IHZpZGVvUHJvcHMgPSBbJ3NyYycsICd1cmwnLCAncG9zdGVyJywgJ3R5cGUnLCAnd2lkdGgnLCAnaGVpZ2h0JywgJ2lkJywgJ21pbWUnLCAnbWltZVR5cGUnXTtcbiAgICAgICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIHZpZGVvUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIExpbmsgaGFzIGltcGxpY2l0IHByb3BlcnRpZXNcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJykge1xuICAgICAgICBjb25zdCBsaW5rUHJvcHMgPSBbJ2xhYmVsJywgJ3VybCcsICd0ZXh0JywgJ29wZW5zSW5OZXdUYWInLCAnaHJlZicsICd0YXJnZXQnLCAndGl0bGUnXTtcbiAgICAgICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIGxpbmtQcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gQnV0dG9uIGhhcyBpbXBsaWNpdCBwcm9wZXJ0aWVzXG4gICAgICBpZiAocHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgICBjb25zdCBidXR0b25Qcm9wcyA9IFsndXJsJywgJ3RleHQnLCAnbGFiZWwnLCAnaHJlZicsICd0YXJnZXQnLCAnb3BlbnNJbk5ld1RhYicsICd0aXRsZScsICd0eXBlJywgJ2Rpc2FibGVkJywgJ3N0eWxlJywgJ3JlbCddO1xuICAgICAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgYnV0dG9uUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIENhbid0IHJlc29sdmUgZnVydGhlclxuICAgICAgcmV0dXJuIHsgZm91bmQ6IGZhbHNlIH07XG4gICAgfVxuICB9XG4gIFxuICAvLyBDaGVjayByb290IHByb3BlcnRpZXMgKHdpdGggY2FzZSB2YXJpYXRpb24gc3VwcG9ydClcbiAgY29uc3QgZm91bmQgPSBmaW5kUHJvcGVydHkoZmlyc3QsIHByb3BlcnRpZXMpO1xuICBpZiAoIWZvdW5kKSB7XG4gICAgcmV0dXJuIHsgZm91bmQ6IGZhbHNlIH07XG4gIH1cbiAgXG4gIGNvbnN0IHByb3AgPSBmb3VuZC5wcm9wZXJ0eTtcbiAgY29uc3QgYWN0dWFsS2V5ID0gZm91bmQua2V5O1xuICBcbiAgaWYgKHJlc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHByb3BlcnR5OiBwcm9wLCByZXNvbHZlZEF0OiBhY3R1YWxLZXkgfTtcbiAgfVxuICBcbiAgLy8gUmVzb2x2ZSBuZXN0ZWQgcGF0aCBmb3Igb2JqZWN0c1xuICBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICBjb25zdCBuZXN0ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3QsIHByb3AucHJvcGVydGllcyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLm5lc3RlZCxcbiAgICAgIHJlc29sdmVkQXQ6IG5lc3RlZC5mb3VuZCA/IGAke2FjdHVhbEtleX0uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gIDogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxuICBcbiAgLy8gUmVzb2x2ZSBuZXN0ZWQgcGF0aCBmb3IgYXJyYXlzIC0gbG9vayBpbnRvIGl0ZW1zLnByb3BlcnRpZXNcbiAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgIGlmIChwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICBjb25zdCBuZXN0ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3QsIHByb3AuaXRlbXMucHJvcGVydGllcyk7XG4gICAgICBpZiAobmVzdGVkLmZvdW5kKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4ubmVzdGVkLFxuICAgICAgICAgIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwcm9wLnBhZ2luYXRpb24gJiYgcmVzdFswXSA9PT0gJ3BhZ2luYXRpb24nKSB7XG4gICAgICBpZiAocmVzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHByb3BlcnR5OiBwcm9wLnBhZ2luYXRpb24sIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0ucGFnaW5hdGlvbmAgfTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHBhZ2luYXRpb25SZXN0ID0gcmVzdC5zbGljZSgxKTtcbiAgICAgIGlmIChwcm9wLnBhZ2luYXRpb24uaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChwYWdpbmF0aW9uUmVzdCwgcHJvcC5wYWdpbmF0aW9uLml0ZW1zLnByb3BlcnRpZXMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLm5lc3RlZCxcbiAgICAgICAgICByZXNvbHZlZEF0OiBuZXN0ZWQuZm91bmQgPyBgJHthY3R1YWxLZXl9LnBhZ2luYXRpb24uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gIDogdW5kZWZpbmVkXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIFxuICAvLyBIYW5kbGUgcGFnaW5hdGlvbiB0eXBlIChyZXNvbHZlcyB0aHJvdWdoIGl0ZW1zLnByb3BlcnRpZXMgbGlrZSBhcnJheXMpXG4gIGlmIChwcm9wLnR5cGUgPT09ICdwYWdpbmF0aW9uJykge1xuICAgIGlmIChwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICBjb25zdCBuZXN0ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3QsIHByb3AuaXRlbXMucHJvcGVydGllcyk7XG4gICAgICBpZiAobmVzdGVkLmZvdW5kKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4ubmVzdGVkLFxuICAgICAgICAgIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtuZXN0ZWQucmVzb2x2ZWRBdH1gXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHBhZ2luYXRpb25JdGVtUHJvcHMgPSBbJ2xhYmVsJywgJ3VybCcsICdhY3RpdmUnXTtcbiAgICBpZiAocmVzdC5sZW5ndGggPT09IDEgJiYgcGFnaW5hdGlvbkl0ZW1Qcm9wcy5pbmNsdWRlcyhyZXN0WzBdKSkge1xuICAgICAgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHJlc29sdmVkQXQ6IGAke2FjdHVhbEtleX0uJHtyZXN0WzBdfWAgfTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIEltYWdlIGhhcyBpbXBsaWNpdCBzcmMsIGFsdCwgaWQsIHNyY3NldCBwcm9wZXJ0aWVzXG4gIGlmIChwcm9wLnR5cGUgPT09ICdpbWFnZScpIHtcbiAgICBjb25zdCBpbWFnZVByb3BzID0gWydzcmMnLCAnYWx0JywgJ2lkJywgJ3VybCcsICd3aWR0aCcsICdoZWlnaHQnLCAnc3Jjc2V0JywgJ3NpemVzJ107XG4gICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIGltYWdlUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgfVxuICB9XG4gIFxuICAvLyBWaWRlbyBoYXMgaW1wbGljaXQgc3JjLCBwb3N0ZXIsIHR5cGUsIHdpZHRoLCBoZWlnaHQgcHJvcGVydGllc1xuICBpZiAocHJvcC50eXBlID09PSAndmlkZW8nKSB7XG4gICAgY29uc3QgdmlkZW9Qcm9wcyA9IFsnc3JjJywgJ3VybCcsICdwb3N0ZXInLCAndHlwZScsICd3aWR0aCcsICdoZWlnaHQnLCAnaWQnLCAnbWltZScsICdtaW1lVHlwZSddO1xuICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMSAmJiB2aWRlb1Byb3BzLmluY2x1ZGVzKHJlc3RbMF0pKSB7XG4gICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgIH1cbiAgfVxuICBcbiAgLy8gTGluayBoYXMgaW1wbGljaXQgbGFiZWwsIHVybCwgdGV4dCwgb3BlbnNJbk5ld1RhYiBwcm9wZXJ0aWVzXG4gIGlmIChwcm9wLnR5cGUgPT09ICdsaW5rJykge1xuICAgIGNvbnN0IGxpbmtQcm9wcyA9IFsnbGFiZWwnLCAndXJsJywgJ3RleHQnLCAnb3BlbnNJbk5ld1RhYicsICdocmVmJywgJ3RhcmdldCcsICd0aXRsZSddO1xuICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMSAmJiBsaW5rUHJvcHMuaW5jbHVkZXMocmVzdFswXSkpIHtcbiAgICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCByZXNvbHZlZEF0OiBgJHthY3R1YWxLZXl9LiR7cmVzdFswXX1gIH07XG4gICAgfVxuICB9XG4gIFxuICAvLyBCdXR0b24gaGFzIGltcGxpY2l0IHVybCwgdGV4dCwgbGFiZWwgcHJvcGVydGllcyAoc2ltaWxhciB0byBsaW5rKVxuICBpZiAocHJvcC50eXBlID09PSAnYnV0dG9uJykge1xuICAgIGNvbnN0IGJ1dHRvblByb3BzID0gWyd1cmwnLCAndGV4dCcsICdsYWJlbCcsICdocmVmJywgJ3RhcmdldCcsICdvcGVuc0luTmV3VGFiJywgJ3RpdGxlJywgJ3R5cGUnLCAnZGlzYWJsZWQnLCAnc3R5bGUnLCAncmVsJ107XG4gICAgaWYgKHJlc3QubGVuZ3RoID09PSAxICYmIGJ1dHRvblByb3BzLmluY2x1ZGVzKHJlc3RbMF0pKSB7XG4gICAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogYCR7YWN0dWFsS2V5fS4ke3Jlc3RbMF19YCB9O1xuICAgIH1cbiAgfVxuICBcbiAgLy8gQ2FuJ3QgcmVzb2x2ZSBmdXJ0aGVyXG4gIHJldHVybiB7IGZvdW5kOiBmYWxzZSB9O1xufTtcblxuLyoqXG4gKiBHZXQgYXJyYXkgaXRlbSBwcm9wZXJ0aWVzIGZvciBhbiBhcnJheSB2YXJpYWJsZSBwYXRoXG4gKiBIYW5kbGVzIGZ1bGwgcGF0aHMgbGlrZSBcInJpZ2h0Q2FyZHNcIiBvciBuZXN0ZWQgcGF0aHNcbiAqIEFsc28gaGFuZGxlcyBjYXNlIHZhcmlhdGlvbnMgaW4gcHJvcGVydHkgbmFtZXNcbiAqIEhhbmRsZXMgZGlmZmVyZW50IGFycmF5IGl0ZW0gc3RydWN0dXJlczpcbiAqIC0gaXRlbXMucHJvcGVydGllcyAob2JqZWN0IGl0ZW1zIHdpdGggbmFtZWQgcHJvcGVydGllcylcbiAqIC0gcHJvcGVydGllcyAoc29tZSBzY2hlbWFzIHB1dCBpdGVtIHByb3BzIGhlcmUgZm9yIGFycmF5cylcbiAqIC0gaXRlbXMgZGlyZWN0bHkgYXMgcHJvcGVydGllcyBvYmplY3QgKGxlc3MgY29tbW9uKVxuICovXG5jb25zdCBnZXRBcnJheUl0ZW1Qcm9wZXJ0aWVzID0gKFxuICBhcnJheVBhdGg6IHN0cmluZ1tdLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBjdXJyZW50Q29udGV4dD86IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT5cbik6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4gfCBudWxsID0+IHtcbiAgLy8gRmlyc3QgcmVzb2x2ZSB0aGUgZnVsbCBwYXRoIHRvIGZpbmQgdGhlIGFycmF5IHByb3BlcnR5XG4gIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChhcnJheVBhdGgsIHByb3BlcnRpZXMsIGN1cnJlbnRDb250ZXh0KTtcbiAgXG4gIGlmICghcmVzb2x2ZWQuZm91bmQgfHwgIXJlc29sdmVkLnByb3BlcnR5IHx8IChyZXNvbHZlZC5wcm9wZXJ0eS50eXBlICE9PSAnYXJyYXknICYmIHJlc29sdmVkLnByb3BlcnR5LnR5cGUgIT09ICdwYWdpbmF0aW9uJykpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBcbiAgY29uc3QgYXJyYXlQcm9wID0gcmVzb2x2ZWQucHJvcGVydHk7XG4gIFxuICAvLyBUcnkgaXRlbXMucHJvcGVydGllcyBmaXJzdCAoc3RhbmRhcmQgc3RydWN0dXJlIGZvciBvYmplY3QgYXJyYXlzKVxuICBpZiAoYXJyYXlQcm9wLml0ZW1zPy5wcm9wZXJ0aWVzICYmIE9iamVjdC5rZXlzKGFycmF5UHJvcC5pdGVtcy5wcm9wZXJ0aWVzKS5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGFycmF5UHJvcC5pdGVtcy5wcm9wZXJ0aWVzO1xuICB9XG4gIFxuICAvLyBTb21lIHNjaGVtYXMgbWlnaHQgcHV0IHByb3BlcnRpZXMgZGlyZWN0bHkgb24gdGhlIGFycmF5IGZvciBpdGVtIHN0cnVjdHVyZVxuICBpZiAoYXJyYXlQcm9wLnByb3BlcnRpZXMgJiYgT2JqZWN0LmtleXMoYXJyYXlQcm9wLnByb3BlcnRpZXMpLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gYXJyYXlQcm9wLnByb3BlcnRpZXM7XG4gIH1cbiAgXG4gIC8vIENoZWNrIGlmIGl0ZW1zIGl0c2VsZiBoYXMgSGFuZG9mZlByb3BlcnR5LWxpa2UgZW50cmllcyAoc29tZSBzY2hlbWFzIG1pZ2h0IGRvIHRoaXMpXG4gIC8vIGUuZy4sIGl0ZW1zOiB7IGljb246IHsuLi59LCB0aXRsZTogey4uLn0gfSB3aXRob3V0IGEgcHJvcGVydGllcyB3cmFwcGVyXG4gIGlmIChhcnJheVByb3AuaXRlbXMgJiYgdHlwZW9mIGFycmF5UHJvcC5pdGVtcyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBpdGVtc09iaiA9IGFycmF5UHJvcC5pdGVtcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICAgIC8vIENoZWNrIGlmIGl0ZW1zIGhhcyBwcm9wZXJ0aWVzIHRoYXQgbG9vayBsaWtlIEhhbmRvZmZQcm9wZXJ0eSBvYmplY3RzIChoYXZlICd0eXBlJyBmaWVsZClcbiAgICBjb25zdCBwb3RlbnRpYWxQcm9wczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyhpdGVtc09iaikpIHtcbiAgICAgIGlmIChrZXkgIT09ICd0eXBlJyAmJiBrZXkgIT09ICdkZWZhdWx0JyAmJiBrZXkgIT09ICdwcm9wZXJ0aWVzJyAmJiBcbiAgICAgICAgICB2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgJ3R5cGUnIGluIHZhbCkge1xuICAgICAgICBwb3RlbnRpYWxQcm9wc1trZXldID0gdmFsIGFzIEhhbmRvZmZQcm9wZXJ0eTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKHBvdGVudGlhbFByb3BzKS5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gcG90ZW50aWFsUHJvcHM7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGUgYWxsIHRlbXBsYXRlIHZhcmlhYmxlcyBhZ2FpbnN0IGNvbXBvbmVudCBwcm9wZXJ0aWVzXG4gKi9cbmV4cG9ydCBjb25zdCB2YWxpZGF0ZVRlbXBsYXRlVmFyaWFibGVzID0gKFxuICBjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnRcbik6IFRlbXBsYXRlVmFsaWRhdGlvblJlc3VsdCA9PiB7XG4gIGNvbnN0IHJlc3VsdDogVGVtcGxhdGVWYWxpZGF0aW9uUmVzdWx0ID0ge1xuICAgIGNvbXBvbmVudElkOiBjb21wb25lbnQuaWQsXG4gICAgY29tcG9uZW50VGl0bGU6IGNvbXBvbmVudC50aXRsZSxcbiAgICBpc1ZhbGlkOiB0cnVlLFxuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG4gIFxuICBjb25zdCB0ZW1wbGF0ZSA9IGNvbXBvbmVudC5jb2RlO1xuICAvLyBBdWdtZW50ZWQgcHJvcGVydGllczogaW5jbHVkZSBpbXBsaWNpdCByb290LWxldmVsIHBhZ2luYXRpb24gZnJvbSBhcnJheSBzdWItcHJvcGVydGllc1xuICAvLyBzbyB0aGF0IHt7I2lmIHByb3BlcnRpZXMucGFnaW5hdGlvbn19IGFuZCB7eyNlYWNoIHByb3BlcnRpZXMucGFnaW5hdGlvbn19IHJlc29sdmUgY29ycmVjdGx5XG4gIGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4gPSB7IC4uLmNvbXBvbmVudC5wcm9wZXJ0aWVzIH07XG4gIGZvciAoY29uc3QgcHJvcCBvZiBPYmplY3QudmFsdWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5wYWdpbmF0aW9uICYmICFwcm9wZXJ0aWVzWydwYWdpbmF0aW9uJ10pIHtcbiAgICAgIHByb3BlcnRpZXNbJ3BhZ2luYXRpb24nXSA9IHByb3AucGFnaW5hdGlvbjtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIFN0YWNrIG9mIGNvbnRleHRzIGZvciBuZXN0ZWQgc2NvcGVzXG4gIGNvbnN0IGNvbnRleHRTdGFjazogU2NvcGVDb250ZXh0W10gPSBbXG4gICAgeyB0eXBlOiAncm9vdCcgfVxuICBdO1xuICBcbiAgLy8gVHJhY2sgbGluZSBudW1iZXJzIGZvciBiZXR0ZXIgZXJyb3IgcmVwb3J0aW5nXG4gIGNvbnN0IGxpbmVzID0gdGVtcGxhdGUuc3BsaXQoJ1xcbicpO1xuICBsZXQgY3VycmVudExpbmUgPSAxO1xuICBsZXQgY2hhckluZGV4ID0gMDtcbiAgXG4gIGNvbnN0IGdldExpbmVOdW1iZXIgPSAoaW5kZXg6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxpbmUgPSAxO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaW5kZXggJiYgaSA8IHRlbXBsYXRlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAodGVtcGxhdGVbaV0gPT09ICdcXG4nKSBsaW5lKys7XG4gICAgfVxuICAgIHJldHVybiBsaW5lO1xuICB9O1xuICBcbiAgLy8gUmVndWxhciBleHByZXNzaW9ucyBmb3IgSGFuZGxlYmFycyBzeW50YXhcbiAgLy8gTWF0Y2hlcyBib3RoIGRvdWJsZSB7e319IGFuZCB0cmlwbGUge3t7fX19IGJyYWNrZXRzXG4gIC8vIFRyaXBsZSBicmFja2V0cyBhcmUgdXNlZCBmb3IgdW5lc2NhcGVkL3JhdyBIVE1MIG91dHB1dCAoY29tbW9uIGZvciByaWNodGV4dClcbiAgLy8gUGF0dGVybjoge3t7IGNvbnRlbnQgfX19IG9yIHt7ICMvcHJlZml4IGNvbnRlbnQgfX1cbiAgY29uc3QgaGFuZGxlYmFyc1JlZ2V4ID0gL1xce1xce1xceyhbXn1dKylcXH1cXH1cXH18XFx7XFx7KFsjL10/KShbXn1dKylcXH1cXH0vZztcbiAgXG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IGhhbmRsZWJhcnNSZWdleC5leGVjKHRlbXBsYXRlKSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBmdWxsTWF0Y2ggPSBtYXRjaFswXTtcbiAgICBsZXQgcHJlZml4OiBzdHJpbmc7XG4gICAgbGV0IGNvbnRlbnQ6IHN0cmluZztcbiAgICBcbiAgICBpZiAobWF0Y2hbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgLy8gVHJpcGxlIGJyYWNrZXRzIG1hdGNoIC0gZ3JvdXAgMSBoYXMgdGhlIGNvbnRlbnRcbiAgICAgIHByZWZpeCA9ICcnO1xuICAgICAgY29udGVudCA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRG91YmxlIGJyYWNrZXRzIG1hdGNoIC0gZ3JvdXAgMiBoYXMgcHJlZml4LCBncm91cCAzIGhhcyBjb250ZW50XG4gICAgICBwcmVmaXggPSBtYXRjaFsyXSB8fCAnJztcbiAgICAgIGNvbnRlbnQgPSBtYXRjaFszXS50cmltKCk7XG4gICAgfVxuICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBnZXRMaW5lTnVtYmVyKG1hdGNoLmluZGV4KTtcbiAgICBcbiAgICBpZiAocHJlZml4ID09PSAnIycpIHtcbiAgICAgIC8vIEJsb2NrIG9wZW5pbmc6IHt7I2VhY2ggaXRlbXN9fSwge3sjd2l0aCBvYmp9fSwge3sjaWYgY29uZH19LCB7eyNmaWVsZCBuYW1lfX1cbiAgICAgIGNvbnN0IGJsb2NrTWF0Y2ggPSBjb250ZW50Lm1hdGNoKC9eKFxcdyspXFxzKiguKikkLyk7XG4gICAgICBpZiAoYmxvY2tNYXRjaCkge1xuICAgICAgICBjb25zdCBibG9ja1R5cGUgPSBibG9ja01hdGNoWzFdO1xuICAgICAgICBjb25zdCBibG9ja0FyZyA9IGJsb2NrTWF0Y2hbMl0udHJpbSgpO1xuICAgICAgICBcbiAgICAgICAgaWYgKGJsb2NrVHlwZSA9PT0gJ2VhY2gnKSB7XG4gICAgICAgICAgLy8gUGFyc2UgdGhlIGVhY2ggYXJndW1lbnQgLSBoYW5kbGUgXCJhcyB8YmxvY2tQYXJhbXxcIiBzeW50YXhcbiAgICAgICAgICAvLyBFeGFtcGxlczogXCJpdGVtc1wiLCBcInByb3BlcnRpZXMuaXRlbXNcIiwgXCJpdGVtcyBhcyB8aXRlbXxcIiwgXCJpdGVtcyBhcyB8aXRlbSBpbmRleHxcIlxuICAgICAgICAgIGxldCBhcnJheUFyZyA9IGJsb2NrQXJnO1xuICAgICAgICAgIGxldCBibG9ja1BhcmFtczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBDaGVjayBmb3IgXCJhcyB8cGFyYW0xIHBhcmFtMnxcIiBzeW50YXhcbiAgICAgICAgICBjb25zdCBhc01hdGNoID0gYmxvY2tBcmcubWF0Y2goL14oLis/KVxccythc1xccytcXHwoW158XSspXFx8JC8pO1xuICAgICAgICAgIGlmIChhc01hdGNoKSB7XG4gICAgICAgICAgICBhcnJheUFyZyA9IGFzTWF0Y2hbMV0udHJpbSgpO1xuICAgICAgICAgICAgYmxvY2tQYXJhbXMgPSBhc01hdGNoWzJdLnRyaW0oKS5zcGxpdCgvXFxzKy8pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgYXJyYXkgdmFyaWFibGUgZXhpc3RzXG4gICAgICAgICAgY29uc3QgYXJyYXlQYXRoID0gcGFyc2VWYXJpYWJsZVBhdGgoYXJyYXlBcmcpO1xuICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb250ZXh0ID0gY29udGV4dFN0YWNrW2NvbnRleHRTdGFjay5sZW5ndGggLSAxXTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBvZiB0aGUgcGF0aCBpcyBhIGJsb2NrIHBhcmFtZXRlciBmcm9tIGEgcGFyZW50IGNvbnRleHRcbiAgICAgICAgICAvLyBlLmcuLCBpbiB7eyNlYWNoIHBvc3RzIGFzIHxwb3N0fH19LCB0aGVuIHt7I2VhY2ggcG9zdC50YWdzIGFzIHx0YWd8fX1cbiAgICAgICAgICAvLyBcInBvc3RcIiBpcyBhIGJsb2NrIHBhcmFtIHRoYXQgcmVmZXJzIHRvIGFuIGFycmF5IGl0ZW1cbiAgICAgICAgICBjb25zdCBmaXJzdFBhcnQgPSBhcnJheVBhdGhbMF07XG4gICAgICAgICAgbGV0IHJlc29sdmVkOiB7IGZvdW5kOiBib29sZWFuOyBwcm9wZXJ0eT86IEhhbmRvZmZQcm9wZXJ0eTsgcmVzb2x2ZWRBdD86IHN0cmluZyB9O1xuICAgICAgICAgIGxldCBibG9ja1BhcmFtQ29udGV4dDogU2NvcGVDb250ZXh0IHwgdW5kZWZpbmVkO1xuICAgICAgICAgIFxuICAgICAgICAgIGZvciAobGV0IGkgPSBjb250ZXh0U3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IGNvbnRleHRTdGFja1tpXTtcbiAgICAgICAgICAgIGlmIChjdHguYmxvY2tQYXJhbXM/LmluY2x1ZGVzKGZpcnN0UGFydCkpIHtcbiAgICAgICAgICAgICAgYmxvY2tQYXJhbUNvbnRleHQgPSBjdHg7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoYmxvY2tQYXJhbUNvbnRleHQgJiYgYmxvY2tQYXJhbUNvbnRleHQuaXRlbVByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIC8vIFRoZSBmaXJzdCBwYXJ0IGlzIGEgYmxvY2sgcGFyYW1ldGVyLCByZXNvbHZlIHRoZSByZXN0IGFnYWluc3QgaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgICAgICBpZiAoYXJyYXlQYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAvLyBKdXN0IHRoZSBibG9jayBwYXJhbSBpdHNlbGYgLSB0aGlzIHdvdWxkIGJlIHdlaXJkIGZvciAjZWFjaCBidXQgaGFuZGxlIGl0XG4gICAgICAgICAgICAgIHJlc29sdmVkID0geyBmb3VuZDogdHJ1ZSwgcmVzb2x2ZWRBdDogZmlyc3RQYXJ0IH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSByZXN0IG9mIHRoZSBwYXRoIGFnYWluc3QgaXRlbSBwcm9wZXJ0aWVzIChlLmcuLCBwb3N0LnRhZ3MgLT4gdGFncylcbiAgICAgICAgICAgICAgY29uc3QgcmVzdFBhdGggPSBhcnJheVBhdGguc2xpY2UoMSk7XG4gICAgICAgICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChyZXN0UGF0aCwgcHJvcGVydGllcywgYmxvY2tQYXJhbUNvbnRleHQuaXRlbVByb3BlcnRpZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBOb3JtYWwgcmVzb2x1dGlvblxuICAgICAgICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKGFycmF5UGF0aCwgcHJvcGVydGllcywgY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIXJlc29sdmVkLmZvdW5kKSB7XG4gICAgICAgICAgICByZXN1bHQuaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKHtcbiAgICAgICAgICAgICAgdmFyaWFibGU6IGFycmF5QXJnLFxuICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICBjb250ZXh0OiBge3sjZWFjaCAke2Jsb2NrQXJnfX19YCxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYEFycmF5IHZhcmlhYmxlIFwiJHthcnJheUFyZ31cIiBpcyBub3QgZGVmaW5lZCBpbiBjb21wb25lbnQgcHJvcGVydGllc2BcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAocmVzb2x2ZWQucHJvcGVydHk/LnR5cGUgIT09ICdhcnJheScgJiYgcmVzb2x2ZWQucHJvcGVydHk/LnR5cGUgIT09ICdwYWdpbmF0aW9uJykge1xuICAgICAgICAgICAgcmVzdWx0LmlzVmFsaWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaCh7XG4gICAgICAgICAgICAgIHZhcmlhYmxlOiBhcnJheUFyZyxcbiAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgY29udGV4dDogYHt7I2VhY2ggJHtibG9ja0FyZ319fWAsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGBWYXJpYWJsZSBcIiR7YXJyYXlBcmd9XCIgaXMgbm90IGFuIGFycmF5IChmb3VuZCB0eXBlOiAke3Jlc29sdmVkLnByb3BlcnR5Py50eXBlfSlgXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUHVzaCBhcnJheSBpdGVtIGNvbnRleHQgLSBnZXQgaXRlbSBwcm9wZXJ0aWVzIGZyb20gdGhlIHJlc29sdmVkIGFycmF5XG4gICAgICAgICAgLy8gRm9yIGJsb2NrIHBhcmFtIHJlZmVyZW5jZXMsIHdlIG5lZWQgdG8gcmVzb2x2ZSBmcm9tIHRoZSBjb3JyZWN0IGNvbnRleHRcbiAgICAgICAgICBsZXQgaXRlbVByb3BzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgIGlmIChibG9ja1BhcmFtQ29udGV4dCAmJiBibG9ja1BhcmFtQ29udGV4dC5pdGVtUHJvcGVydGllcyAmJiBhcnJheVBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgY29uc3QgcmVzdFBhdGggPSBhcnJheVBhdGguc2xpY2UoMSk7XG4gICAgICAgICAgICBpdGVtUHJvcHMgPSBnZXRBcnJheUl0ZW1Qcm9wZXJ0aWVzKHJlc3RQYXRoLCBwcm9wZXJ0aWVzLCBibG9ja1BhcmFtQ29udGV4dC5pdGVtUHJvcGVydGllcykgfHwgdW5kZWZpbmVkO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpdGVtUHJvcHMgPSBnZXRBcnJheUl0ZW1Qcm9wZXJ0aWVzKGFycmF5UGF0aCwgcHJvcGVydGllcywgY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHNpbXBsZSB0eXBlIGFycmF5IChzdHJpbmcsIG51bWJlciwgZXRjLikgLSBubyB3YXJuaW5nIG5lZWRlZFxuICAgICAgICAgIC8vIFNpbXBsZSBhcnJheXMgdXNlIHt7dGhpc319IHRvIHJlZmVyZW5jZSB0aGUgY3VycmVudCBpdGVtXG4gICAgICAgICAgY29uc3QgaXNTaW1wbGVUeXBlQXJyYXkgPSByZXNvbHZlZC5wcm9wZXJ0eT8uaXRlbXM/LnR5cGUgJiYgXG4gICAgICAgICAgICBbJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbiddLmluY2x1ZGVzKHJlc29sdmVkLnByb3BlcnR5Lml0ZW1zLnR5cGUpO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIE9ubHkgd2FybiBpZiB3ZSBjb3VsZG4ndCBmaW5kIGl0ZW0gcHJvcGVydGllcyBBTkQgaXQncyBub3QgYSBzaW1wbGUgdHlwZSBhcnJheVxuICAgICAgICAgIGlmICghaXRlbVByb3BzICYmIHJlc29sdmVkLmZvdW5kICYmIHJlc29sdmVkLnByb3BlcnR5ICYmICFpc1NpbXBsZVR5cGVBcnJheSkge1xuICAgICAgICAgICAgY29uc3QgYXJyYXlQcm9wID0gcmVzb2x2ZWQucHJvcGVydHk7XG4gICAgICAgICAgICByZXN1bHQud2FybmluZ3MucHVzaCh7XG4gICAgICAgICAgICAgIHZhcmlhYmxlOiBhcnJheUFyZyxcbiAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgY29udGV4dDogYHt7I2VhY2ggJHtibG9ja0FyZ319fWAsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGBBcnJheSBcIiR7YXJyYXlBcmd9XCIgZm91bmQgYnV0IG5vIGl0ZW0gcHJvcGVydGllcyBzY2hlbWEgZGV0ZWN0ZWQuIEFycmF5IGhhczogaXRlbXM9JHshIWFycmF5UHJvcC5pdGVtc30sIGl0ZW1zLnR5cGU9JHthcnJheVByb3AuaXRlbXM/LnR5cGUgfHwgJ3VuZGVmaW5lZCd9LCBpdGVtcy5wcm9wZXJ0aWVzPSR7ISFhcnJheVByb3AuaXRlbXM/LnByb3BlcnRpZXN9LCBwcm9wZXJ0aWVzPSR7ISFhcnJheVByb3AucHJvcGVydGllc31gXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUHVzaCBjb250ZXh0IHdpdGggYmxvY2sgcGFyYW1zIGlmIHNwZWNpZmllZFxuICAgICAgICAgIGNvbnRleHRTdGFjay5wdXNoKHtcbiAgICAgICAgICAgIHR5cGU6ICdlYWNoJyxcbiAgICAgICAgICAgIHZhcmlhYmxlOiBhcnJheUFyZyxcbiAgICAgICAgICAgIGl0ZW1Qcm9wZXJ0aWVzOiBpdGVtUHJvcHMgfHwgdW5kZWZpbmVkLFxuICAgICAgICAgICAgYmxvY2tQYXJhbXM6IGJsb2NrUGFyYW1zLmxlbmd0aCA+IDAgPyBibG9ja1BhcmFtcyA6IHVuZGVmaW5lZFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIFxuICAgICAgICB9IGVsc2UgaWYgKGJsb2NrVHlwZSA9PT0gJ3dpdGgnKSB7XG4gICAgICAgICAgLy8gVmFsaWRhdGUgdGhlIG9iamVjdCB2YXJpYWJsZSBleGlzdHNcbiAgICAgICAgICBjb25zdCBvYmpQYXRoID0gcGFyc2VWYXJpYWJsZVBhdGgoYmxvY2tBcmcpO1xuICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChvYmpQYXRoLCBwcm9wZXJ0aWVzLCBjb250ZXh0U3RhY2tbY29udGV4dFN0YWNrLmxlbmd0aCAtIDFdLml0ZW1Qcm9wZXJ0aWVzKTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIXJlc29sdmVkLmZvdW5kKSB7XG4gICAgICAgICAgICByZXN1bHQuaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKHtcbiAgICAgICAgICAgICAgdmFyaWFibGU6IGJsb2NrQXJnLFxuICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICBjb250ZXh0OiBge3sjd2l0aCAke2Jsb2NrQXJnfX19YCxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYE9iamVjdCB2YXJpYWJsZSBcIiR7YmxvY2tBcmd9XCIgaXMgbm90IGRlZmluZWQgaW4gY29tcG9uZW50IHByb3BlcnRpZXNgXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUHVzaCBvYmplY3QgY29udGV4dFxuICAgICAgICAgIGNvbnN0IG9ialByb3AgPSBwcm9wZXJ0aWVzW29ialBhdGhbMF1dO1xuICAgICAgICAgIGNvbnRleHRTdGFjay5wdXNoKHtcbiAgICAgICAgICAgIHR5cGU6ICd3aXRoJyxcbiAgICAgICAgICAgIHZhcmlhYmxlOiBibG9ja0FyZyxcbiAgICAgICAgICAgIGl0ZW1Qcm9wZXJ0aWVzOiBvYmpQcm9wPy5wcm9wZXJ0aWVzIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIFxuICAgICAgICB9IGVsc2UgaWYgKGJsb2NrVHlwZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgIGNvbnN0IHN0cmlwcGVkQXJnID0gc3RyaXBRdW90ZXMoYmxvY2tBcmcpO1xuICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb250ZXh0ID0gY29udGV4dFN0YWNrW2NvbnRleHRTdGFjay5sZW5ndGggLSAxXTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBQYWdpbmF0aW9uLXJlbGF0ZWQgZmllbGQgcGF0aHMgYXJlIG1ldGFkYXRhIGFubm90YXRpb25zLCBub3QgZWRpdGFibGUgZmllbGRzLlxuICAgICAgICAgIC8vIFNraXAgdmFsaWRhdGlvbiBidXQgc3RpbGwgcHVzaCBjb250ZXh0IGZvciBwcm9wZXIgc2NvcGUgdHJhY2tpbmcuXG4gICAgICAgICAgY29uc3QgaXNQYWdpbmF0aW9uRmllbGQgPSBzdHJpcHBlZEFyZy5pbmNsdWRlcygnLnBhZ2luYXRpb24nKSB8fCBzdHJpcHBlZEFyZy5zdGFydHNXaXRoKCdwYWdpbmF0aW9uLicpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmICghaXNQYWdpbmF0aW9uRmllbGQpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkUGF0aCA9IHBhcnNlVmFyaWFibGVQYXRoKHN0cmlwcGVkQXJnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChmaWVsZFBhdGgsIHByb3BlcnRpZXMsIGN1cnJlbnRDb250ZXh0Lml0ZW1Qcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5mb3VuZCkge1xuICAgICAgICAgICAgICBjb25zdCBhdmFpbGFibGVBdFJvb3QgPSBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5qb2luKCcsICcpO1xuICAgICAgICAgICAgICBsZXQgZXJyb3JEZXRhaWwgPSBgRmllbGQgcGF0aCBcIiR7c3RyaXBwZWRBcmd9XCIgKHBhcnNlZCBhczogJHtmaWVsZFBhdGguam9pbignIC0+ICcpfSkgaXMgbm90IGRlZmluZWQuYDtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGNvbnN0IGZpcnN0UGFydCA9IGZpZWxkUGF0aFswXTtcbiAgICAgICAgICAgICAgY29uc3Qgcm9vdFByb3AgPSBwcm9wZXJ0aWVzW2ZpcnN0UGFydF07XG4gICAgICAgICAgICAgIGlmIChyb290UHJvcCkge1xuICAgICAgICAgICAgICAgIGlmIChmaWVsZFBhdGgubGVuZ3RoID4gMSAmJiByb290UHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiByb290UHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBuZXN0ZWRBdmFpbGFibGUgPSBPYmplY3Qua2V5cyhyb290UHJvcC5wcm9wZXJ0aWVzKS5qb2luKCcsICcpO1xuICAgICAgICAgICAgICAgICAgZXJyb3JEZXRhaWwgKz0gYCBcIiR7Zmlyc3RQYXJ0fVwiIGV4aXN0cyAodHlwZTogJHtyb290UHJvcC50eXBlfSksIGJ1dCBcIiR7ZmllbGRQYXRoWzFdfVwiIG5vdCBmb3VuZCBpbiBpdHMgcHJvcGVydGllcy4gQXZhaWxhYmxlOiAke25lc3RlZEF2YWlsYWJsZX1gO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRQYXRoLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yRGV0YWlsICs9IGAgXCIke2ZpcnN0UGFydH1cIiBleGlzdHMgYnV0IGlzIHR5cGUgXCIke3Jvb3RQcm9wLnR5cGV9XCIgKG5vdCBhbiBvYmplY3Qgd2l0aCBuZXN0ZWQgcHJvcGVydGllcykuYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZXJyb3JEZXRhaWwgKz0gYCBBdmFpbGFibGUgcm9vdCBwcm9wZXJ0aWVzOiAke2F2YWlsYWJsZUF0Um9vdH1gO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICByZXN1bHQuaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICAgIHZhcmlhYmxlOiBzdHJpcHBlZEFyZyxcbiAgICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IGB7eyNmaWVsZCAke2Jsb2NrQXJnfX19YCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBlcnJvckRldGFpbFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgY29udGV4dFN0YWNrLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ2ZpZWxkJyxcbiAgICAgICAgICAgIHZhcmlhYmxlOiBzdHJpcHBlZEFyZyxcbiAgICAgICAgICAgIGl0ZW1Qcm9wZXJ0aWVzOiBjdXJyZW50Q29udGV4dC5pdGVtUHJvcGVydGllc1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIFxuICAgICAgICB9IGVsc2UgaWYgKGJsb2NrVHlwZSA9PT0gJ2lmJyB8fCBibG9ja1R5cGUgPT09ICd1bmxlc3MnKSB7XG4gICAgICAgICAgLy8gVmFsaWRhdGUgdGhlIGNvbmRpdGlvbiB2YXJpYWJsZSBleGlzdHMgKHVubGVzcyBpdCdzIGEgY29tcGxleCBleHByZXNzaW9uKVxuICAgICAgICAgIGNvbnN0IGNvbmRWYXIgPSBibG9ja0FyZy5zcGxpdCgvXFxzKy8pWzBdOyAvLyBHZXQgZmlyc3Qgd29yZFxuICAgICAgICAgIC8vIFNraXAgdmFsaWRhdGlvbiBmb3IgQC1wcmVmaXhlZCBidWlsdC1pbnMgKGV4Y2VwdCBAcm9vdC54eHgsIHdoaWNoIElTIHZhbGlkYXRlZClcbiAgICAgICAgICAvLyBhbmQgZ2xvYmFsIGNvbXBpbGVyIHZhcmlhYmxlcyAoc3R5bGUsIHNjcmlwdCkuXG4gICAgICAgICAgY29uc3QgaXNBdEJ1aWx0aW4gPSBjb25kVmFyLnN0YXJ0c1dpdGgoJ0AnKSAmJiAhY29uZFZhci5zdGFydHNXaXRoKCdAcm9vdC4nKTtcbiAgICAgICAgICBpZiAoY29uZFZhciAmJiAhY29uZFZhci5pbmNsdWRlcygnKCcpICYmICFpc0F0QnVpbHRpbiAmJlxuICAgICAgICAgICAgICBjb25kVmFyICE9PSAnc3R5bGUnICYmIGNvbmRWYXIgIT09ICdzY3JpcHQnICYmXG4gICAgICAgICAgICAgICFjb25kVmFyLnN0YXJ0c1dpdGgoJ3N0eWxlLicpICYmICFjb25kVmFyLnN0YXJ0c1dpdGgoJ3NjcmlwdC4nKSkge1xuICAgICAgICAgICAgY29uc3QgY29uZFBhdGggPSBwYXJzZVZhcmlhYmxlUGF0aChjb25kVmFyKTtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb250ZXh0ID0gY29udGV4dFN0YWNrW2NvbnRleHRTdGFjay5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZhcmlhYmxlUGF0aChjb25kUGF0aCwgcHJvcGVydGllcywgY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIXJlc29sdmVkLmZvdW5kKSB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBwcm9wZXJ0eSByZWZlcmVuY2UgaW4gY3VycmVudCBjb250ZXh0XG4gICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncy5wdXNoKHtcbiAgICAgICAgICAgICAgICB2YXJpYWJsZTogY29uZFZhcixcbiAgICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IGB7eyMke2Jsb2NrVHlwZX0gJHtibG9ja0FyZ319fWAsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYENvbmRpdGlvbiB2YXJpYWJsZSBcIiR7Y29uZFZhcn1cIiBtYXkgbm90IGJlIGRlZmluZWQgaW4gY29tcG9uZW50IHByb3BlcnRpZXNgXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBEb24ndCBwdXNoIGEgbmV3IGNvbnRleHQgZm9yIGlmL3VubGVzc1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICB9IGVsc2UgaWYgKHByZWZpeCA9PT0gJy8nKSB7XG4gICAgICAvLyBCbG9jayBjbG9zaW5nOiB7ey9lYWNofX0sIHt7L3dpdGh9fSwge3svaWZ9fSwge3svZmllbGR9fVxuICAgICAgY29uc3QgYmxvY2tUeXBlID0gY29udGVudDtcbiAgICAgIGlmIChibG9ja1R5cGUgPT09ICdlYWNoJyB8fCBibG9ja1R5cGUgPT09ICd3aXRoJyB8fCBibG9ja1R5cGUgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgaWYgKGNvbnRleHRTdGFjay5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgY29udGV4dFN0YWNrLnBvcCgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU2tpcCBlbHNlL2Vsc2UgaWYgY29uc3RydWN0cyAtIHRoZXNlIGFyZSBwYXJ0IG9mIGlmL3VubGVzcyBibG9ja3NcbiAgICAgIGlmIChjb250ZW50ID09PSAnZWxzZScgfHwgY29udGVudC5zdGFydHNXaXRoKCdlbHNlICcpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBFeHByZXNzaW9uOiB7e3ZhcmlhYmxlfX0sIHt7b2JqLnByb3B9fSwgZXRjLlxuICAgICAgY29uc3QgdmFyTmFtZSA9IGV4dHJhY3RWYXJpYWJsZUZyb21FeHByZXNzaW9uKGNvbnRlbnQpO1xuICAgICAgaWYgKHZhck5hbWUpIHtcbiAgICAgICAgY29uc3QgdmFyUGF0aCA9IHBhcnNlVmFyaWFibGVQYXRoKHZhck5hbWUpO1xuICAgICAgICBjb25zdCBjdXJyZW50Q29udGV4dCA9IGNvbnRleHRTdGFja1tjb250ZXh0U3RhY2subGVuZ3RoIC0gMV07XG4gICAgICAgIFxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgcGFydCBvZiB0aGUgcGF0aCBpcyBhIGJsb2NrIHBhcmFtZXRlclxuICAgICAgICAvLyBlLmcuLCBpbiB7eyNlYWNoIGl0ZW1zIGFzIHxpdGVtfH19LCBcIml0ZW1cIiBpcyBhIGJsb2NrIHBhcmFtXG4gICAgICAgIC8vIGFuZCBcIml0ZW0ubmFtZVwiIHNob3VsZCByZXNvbHZlIGFnYWluc3QgdGhlIGFycmF5J3MgaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgIGxldCByZXNvbHZlZDogeyBmb3VuZDogYm9vbGVhbjsgcHJvcGVydHk/OiBIYW5kb2ZmUHJvcGVydHk7IHJlc29sdmVkQXQ/OiBzdHJpbmcgfTtcbiAgICAgICAgY29uc3QgZmlyc3RQYXJ0ID0gdmFyUGF0aFswXTtcbiAgICAgICAgXG4gICAgICAgIC8vIExvb2sgdGhyb3VnaCB0aGUgY29udGV4dCBzdGFjayBmb3IgYSBtYXRjaGluZyBibG9jayBwYXJhbWV0ZXJcbiAgICAgICAgbGV0IGJsb2NrUGFyYW1Db250ZXh0OiBTY29wZUNvbnRleHQgfCB1bmRlZmluZWQ7XG4gICAgICAgIGZvciAobGV0IGkgPSBjb250ZXh0U3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICBjb25zdCBjdHggPSBjb250ZXh0U3RhY2tbaV07XG4gICAgICAgICAgaWYgKGN0eC5ibG9ja1BhcmFtcz8uaW5jbHVkZXMoZmlyc3RQYXJ0KSkge1xuICAgICAgICAgICAgYmxvY2tQYXJhbUNvbnRleHQgPSBjdHg7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChibG9ja1BhcmFtQ29udGV4dCAmJiBibG9ja1BhcmFtQ29udGV4dC5pdGVtUHJvcGVydGllcykge1xuICAgICAgICAgIC8vIFRoZSBmaXJzdCBwYXJ0IGlzIGEgYmxvY2sgcGFyYW1ldGVyLCByZXNvbHZlIHRoZSByZXN0IGFnYWluc3QgaXRlbSBwcm9wZXJ0aWVzXG4gICAgICAgICAgaWYgKHZhclBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAvLyBKdXN0IHRoZSBibG9jayBwYXJhbSBpdHNlbGYgKGUuZy4sIHt7YnJlYWRjcnVtYn19KSAtIHZhbGlkXG4gICAgICAgICAgICByZXNvbHZlZCA9IHsgZm91bmQ6IHRydWUsIHJlc29sdmVkQXQ6IGZpcnN0UGFydCB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSByZXN0IG9mIHRoZSBwYXRoIGFnYWluc3QgaXRlbSBwcm9wZXJ0aWVzIChlLmcuLCBicmVhZGNydW1iLmxhYmVsIC0+IGxhYmVsKVxuICAgICAgICAgICAgY29uc3QgcmVzdFBhdGggPSB2YXJQYXRoLnNsaWNlKDEpO1xuICAgICAgICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHJlc3RQYXRoLCBwcm9wZXJ0aWVzLCBibG9ja1BhcmFtQ29udGV4dC5pdGVtUHJvcGVydGllcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vcm1hbCByZXNvbHV0aW9uXG4gICAgICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlVmFyaWFibGVQYXRoKHZhclBhdGgsIHByb3BlcnRpZXMsIGN1cnJlbnRDb250ZXh0Lml0ZW1Qcm9wZXJ0aWVzKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFyZXNvbHZlZC5mb3VuZCkge1xuICAgICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBsb29wIHZhcmlhYmxlIHJlZmVyZW5jZSAoZS5nLiwgcmVmZXJlbmNpbmcgaXRlbSBwcm9wZXJ0aWVzKVxuICAgICAgICAgIGlmIChjdXJyZW50Q29udGV4dC50eXBlID09PSAnZWFjaCcpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50Q29udGV4dC5pdGVtUHJvcGVydGllcykge1xuICAgICAgICAgICAgICAvLyBBbHJlYWR5IGNoZWNrZWQgd2l0aCBpdGVtUHJvcGVydGllcywgZGVmaW5pdGVseSBub3QgZm91bmRcbiAgICAgICAgICAgICAgcmVzdWx0LmlzVmFsaWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKHtcbiAgICAgICAgICAgICAgICB2YXJpYWJsZTogdmFyTmFtZSxcbiAgICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IGB7eyR7Y29udGVudH19fWAsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFZhcmlhYmxlIFwiJHt2YXJOYW1lfVwiIGlzIG5vdCBkZWZpbmVkLiBJbiB7eyNlYWNoICR7Y3VycmVudENvbnRleHQudmFyaWFibGV9fX0gY29udGV4dCwgYXZhaWxhYmxlIGl0ZW0gcHJvcGVydGllcyBhcmU6ICR7T2JqZWN0LmtleXMoY3VycmVudENvbnRleHQuaXRlbVByb3BlcnRpZXMpLmpvaW4oJywgJykgfHwgJ25vbmUnfWBcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBObyBpdGVtIHByb3BlcnRpZXMgZm91bmQgZm9yIHRoaXMgYXJyYXkgLSBtaWdodCBiZSBhIHNpbXBsZSBhcnJheSBvciBtaXNzaW5nIHNjaGVtYVxuICAgICAgICAgICAgICByZXN1bHQud2FybmluZ3MucHVzaCh7XG4gICAgICAgICAgICAgICAgdmFyaWFibGU6IHZhck5hbWUsXG4gICAgICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcbiAgICAgICAgICAgICAgICBjb250ZXh0OiBge3ske2NvbnRlbnR9fX1gLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDYW5ub3QgdmFsaWRhdGUgXCIke3Zhck5hbWV9XCIgLSBubyBpdGVtIHByb3BlcnRpZXMgc2NoZW1hIGZvdW5kIGZvciB7eyNlYWNoICR7Y3VycmVudENvbnRleHQudmFyaWFibGV9fX0uIFRoZSBhcnJheSBtYXkgbm90IGhhdmUgZGVmaW5lZCBpdGVtIHByb3BlcnRpZXMuYFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRDb250ZXh0LnR5cGUgPT09ICd3aXRoJyAmJiBjdXJyZW50Q29udGV4dC5pdGVtUHJvcGVydGllcykge1xuICAgICAgICAgICAgcmVzdWx0LmlzVmFsaWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaCh7XG4gICAgICAgICAgICAgIHZhcmlhYmxlOiB2YXJOYW1lLFxuICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICBjb250ZXh0OiBge3ske2NvbnRlbnR9fX1gLFxuICAgICAgICAgICAgICBtZXNzYWdlOiBgVmFyaWFibGUgXCIke3Zhck5hbWV9XCIgaXMgbm90IGRlZmluZWQgaW4ge3sjd2l0aCAke2N1cnJlbnRDb250ZXh0LnZhcmlhYmxlfX19IGNvbnRleHRgXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LmlzVmFsaWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaCh7XG4gICAgICAgICAgICAgIHZhcmlhYmxlOiB2YXJOYW1lLFxuICAgICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxuICAgICAgICAgICAgICBjb250ZXh0OiBge3ske2NvbnRlbnR9fX1gLFxuICAgICAgICAgICAgICBtZXNzYWdlOiBgVmFyaWFibGUgXCIke3Zhck5hbWV9XCIgaXMgbm90IGRlZmluZWQgaW4gY29tcG9uZW50IHByb3BlcnRpZXMuIEF2YWlsYWJsZSBwcm9wZXJ0aWVzOiAke09iamVjdC5rZXlzKHByb3BlcnRpZXMpLmpvaW4oJywgJyl9YFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBGb3JtYXQgdmFsaWRhdGlvbiByZXN1bHQgZm9yIGNvbnNvbGUgb3V0cHV0XG4gKi9cbmV4cG9ydCBjb25zdCBmb3JtYXRUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQgPSAocmVzdWx0OiBUZW1wbGF0ZVZhbGlkYXRpb25SZXN1bHQpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGNvbnN0IGljb24gPSByZXN1bHQuaXNWYWxpZCA/ICfinIUnIDogJ+KdjCc7XG4gIGxpbmVzLnB1c2goYCR7aWNvbn0gVGVtcGxhdGUgVmFyaWFibGVzOiAke3Jlc3VsdC5jb21wb25lbnRUaXRsZX0gKCR7cmVzdWx0LmNvbXBvbmVudElkfSlgKTtcbiAgXG4gIGlmIChyZXN1bHQuZXJyb3JzLmxlbmd0aCA9PT0gMCAmJiByZXN1bHQud2FybmluZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgbGluZXMucHVzaChgICAgQWxsIHRlbXBsYXRlIHZhcmlhYmxlcyBhcmUgcHJvcGVybHkgZGVmaW5lZGApO1xuICB9IGVsc2Uge1xuICAgIGlmIChyZXN1bHQuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgIGxpbmVzLnB1c2goYCAgIPCfmqggVW5kZWZpbmVkIFZhcmlhYmxlczpgKTtcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgcmVzdWx0LmVycm9ycykge1xuICAgICAgICBjb25zdCBsaW5lSW5mbyA9IGVycm9yLmxpbmUgPyBgIChsaW5lICR7ZXJyb3IubGluZX0pYCA6ICcnO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgICDinYwgJHtlcnJvci5jb250ZXh0fSR7bGluZUluZm99YCk7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgICAgICAgICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgaWYgKHJlc3VsdC53YXJuaW5ncy5sZW5ndGggPiAwKSB7XG4gICAgICBsaW5lcy5wdXNoKGAgICDimqDvuI8gIFdhcm5pbmdzOmApO1xuICAgICAgZm9yIChjb25zdCB3YXJuaW5nIG9mIHJlc3VsdC53YXJuaW5ncykge1xuICAgICAgICBjb25zdCBsaW5lSW5mbyA9IHdhcm5pbmcubGluZSA/IGAgKGxpbmUgJHt3YXJuaW5nLmxpbmV9KWAgOiAnJztcbiAgICAgICAgbGluZXMucHVzaChgICAgICAg4pqg77iPICAke3dhcm5pbmcuY29udGV4dH0ke2xpbmVJbmZvfWApO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgICAgICAke3dhcm5pbmcubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn07XG4iXX0=