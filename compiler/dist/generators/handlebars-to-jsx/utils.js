"use strict";
/**
 * Utility functions for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInsideAttribute = exports.findMatchingClose = exports.normalizeSelectOptions = exports.humanizeLabel = exports.collapseWhitespace = exports.normalizeWhitespace = exports.toJsxAttrName = exports.isSelfClosing = exports.cssToCamelCase = exports.getTemplateReferencedAttributeNames = exports.toCamelCase = exports.sanitizeReservedName = exports.isReservedWord = void 0;
const constants_1 = require("./constants");
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
    // Browser/DOM globals that shadow block attributes (e.g. document.body)
    'body',
    // TypeScript keywords
    'any', 'as', 'boolean', 'constructor', 'declare', 'get', 'module', 'namespace',
    'never', 'readonly', 'require', 'number', 'object', 'set', 'string', 'symbol', 'type', 'from', 'of'
]);
/**
 * Check if a name is a JavaScript reserved word
 */
const isReservedWord = (name) => {
    return JS_RESERVED_WORDS.has(name.toLowerCase());
};
exports.isReservedWord = isReservedWord;
/**
 * Sanitize a name if it's a reserved word by prefixing with 'block'
 * e.g., 'super' -> 'blockSuper', 'class' -> 'blockClass'
 */
const sanitizeReservedName = (name) => {
    if ((0, exports.isReservedWord)(name)) {
        // Prefix with 'block' and capitalize the first letter of the original name
        return 'block' + name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
    return name;
};
exports.sanitizeReservedName = sanitizeReservedName;
/**
 * Convert snake_case or kebab-case to camelCase, sanitizing reserved words
 */
const toCamelCase = (str) => {
    const camelCased = str.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
    return (0, exports.sanitizeReservedName)(camelCased);
};
exports.toCamelCase = toCamelCase;
/**
 * Extract top-level property names referenced in a Handlebars template.
 * Matches any `properties.xxx` occurrence (inside {{...}}, {{#if ...}}, {{#each ...}}, etc.)
 * Returns the camelCase/sanitized attribute names so they can be added to destructuring and
 * block.json when the API omits them from component.properties.
 */
const getTemplateReferencedAttributeNames = (template) => {
    const names = new Set();
    // Match `properties.xxx` anywhere (handles {{properties.x}}, {{#if properties.x}}, {{#each properties.x}}, etc.)
    const propertiesRegex = /\bproperties\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
    let m;
    while ((m = propertiesRegex.exec(template)) !== null) {
        names.add((0, exports.toCamelCase)(m[1]));
    }
    return [...names];
};
exports.getTemplateReferencedAttributeNames = getTemplateReferencedAttributeNames;
/**
 * Convert CSS property name to camelCase for React style objects
 */
const cssToCamelCase = (prop) => {
    return prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};
exports.cssToCamelCase = cssToCamelCase;
/**
 * Check if element is self-closing
 */
const isSelfClosing = (tagName) => {
    return constants_1.SELF_CLOSING_TAGS.includes(tagName.toLowerCase());
};
exports.isSelfClosing = isSelfClosing;
/**
 * Convert an HTML/SVG attribute name to its JSX equivalent
 */
const toJsxAttrName = (name) => {
    // Check the lookup map first
    if (constants_1.HTML_TO_JSX_ATTR_MAP[name]) {
        return constants_1.HTML_TO_JSX_ATTR_MAP[name];
    }
    // Preserve data-* and aria-* as literal hyphenated JSX attributes so DOM hooks
    // (e.g. data-component="hero") match frontend view.js selectors in the editor canvas.
    if (name.startsWith('data-') || name.startsWith('aria-')) {
        return name;
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
exports.toJsxAttrName = toJsxAttrName;
/**
 * Normalize whitespace - collapse newlines and multiple spaces into single space
 */
const normalizeWhitespace = (str) => {
    return str.replace(/\s+/g, ' ').trim();
};
exports.normalizeWhitespace = normalizeWhitespace;
/**
 * Collapse internal whitespace (newlines, multiple spaces) into single spaces
 * but preserve leading/trailing whitespace. Used for conditional attribute values
 * where a leading space (e.g. " u-mx-auto") is significant.
 */
const collapseWhitespace = (str) => {
    return str.replace(/\s+/g, ' ');
};
exports.collapseWhitespace = collapseWhitespace;
/**
 * Convert camelCase or snake_case to human-readable label (e.g. "someValue" -> "Some Value", "some_value" -> "Some Value").
 */
const humanizeLabel = (str) => {
    const s = String(str).trim();
    if (!s)
        return s;
    const withSpaces = s
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .trim();
    return withSpaces
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};
exports.humanizeLabel = humanizeLabel;
/**
 * Normalize select options to always be Array<{ label, value }>.
 * Handoff options can be either:
 * - Array<{ value: string, label: string }>
 * - Array<string> — string is used as both value and label; label is humanized (camel/snake -> title case).
 */
const normalizeSelectOptions = (options) => {
    if (!options || !Array.isArray(options) || options.length === 0)
        return [];
    return options.map((o) => {
        if (typeof o === 'string') {
            return { value: o, label: (0, exports.humanizeLabel)(o) };
        }
        const value = (o.value ?? '').toString();
        const label = (o.label ?? value).toString();
        return { value, label: label ? label : (0, exports.humanizeLabel)(value) };
    });
};
exports.normalizeSelectOptions = normalizeSelectOptions;
/**
 * Find matching closing tag for a block helper, handling nesting
 */
const findMatchingClose = (template, openTag, closeTag, startPos) => {
    let depth = 1;
    let pos = startPos;
    while (depth > 0 && pos < template.length) {
        const nextOpen = template.indexOf(openTag, pos);
        const nextClose = template.indexOf(closeTag, pos);
        if (nextClose === -1)
            return -1;
        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            pos = nextOpen + openTag.length;
        }
        else {
            depth--;
            if (depth === 0)
                return nextClose;
            pos = nextClose + closeTag.length;
        }
    }
    return -1;
};
exports.findMatchingClose = findMatchingClose;
/**
 * Check if a position in the template is inside an HTML attribute value
 */
const isInsideAttribute = (template, pos) => {
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
        }
        else if (inTag && char === '>') {
            inTag = false;
            inAttrValue = false;
            attrQuote = '';
        }
        else if (inTag && !inAttrValue && (char === '"' || char === "'")) {
            // Starting an attribute value
            inAttrValue = true;
            attrQuote = char;
        }
        else if (inTag && inAttrValue && char === attrQuote && prevChar !== '\\') {
            // Ending an attribute value
            inAttrValue = false;
            attrQuote = '';
        }
    }
    return inAttrValue;
};
exports.isInsideAttribute = isInsideAttribute;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILDJDQUFzRTtBQUV0RTs7R0FFRztBQUNILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDaEMsc0JBQXNCO0lBQ3RCLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxJQUFJO0lBQzNFLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxLQUFLO0lBQ3JFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU07SUFDcEYsd0JBQXdCO0lBQ3hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU87SUFDaEUsNkJBQTZCO0lBQzdCLFlBQVksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTztJQUNoRyxXQUFXO0lBQ1gsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPO0lBQ3ZCLGlCQUFpQjtJQUNqQixPQUFPLEVBQUUsT0FBTztJQUNoQixnREFBZ0Q7SUFDaEQsV0FBVyxFQUFFLE1BQU07SUFDbkIsd0VBQXdFO0lBQ3hFLE1BQU07SUFDTixzQkFBc0I7SUFDdEIsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFdBQVc7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QUFJLENBQUMsSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuRSw4QkFBOEI7WUFDOUIsV0FBVyxHQUFHLElBQUksQ0FBQztZQUNuQixTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ25CLENBQUM7YUFBTSxJQUFJLEtBQUssSUFBSSxXQUFXLElBQUksSUFBSSxLQUFLLFNBQVMsSUFBSSxRQUFRLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDM0UsNEJBQTRCO1lBQzVCLFdBQVcsR0FBRyxLQUFLLENBQUM7WUFDcEIsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNqQixDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sV0FBVyxDQUFDO0FBQ3JCLENBQUMsQ0FBQztBQTdCVyxRQUFBLGlCQUFpQixxQkE2QjVCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBVdGlsaXR5IGZ1bmN0aW9ucyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBIVE1MX1RPX0pTWF9BVFRSX01BUCwgU0VMRl9DTE9TSU5HX1RBR1MgfSBmcm9tICcuL2NvbnN0YW50cyc7XG5cbi8qKlxuICogSmF2YVNjcmlwdC9UeXBlU2NyaXB0IHJlc2VydmVkIHdvcmRzIHRoYXQgY2Fubm90IGJlIHVzZWQgYXMgaWRlbnRpZmllcnNcbiAqL1xuY29uc3QgSlNfUkVTRVJWRURfV09SRFMgPSBuZXcgU2V0KFtcbiAgLy8gSmF2YVNjcmlwdCBrZXl3b3Jkc1xuICAnYnJlYWsnLCAnY2FzZScsICdjYXRjaCcsICdjb250aW51ZScsICdkZWJ1Z2dlcicsICdkZWZhdWx0JywgJ2RlbGV0ZScsICdkbycsXG4gICdlbHNlJywgJ2ZpbmFsbHknLCAnZm9yJywgJ2Z1bmN0aW9uJywgJ2lmJywgJ2luJywgJ2luc3RhbmNlb2YnLCAnbmV3JyxcbiAgJ3JldHVybicsICdzd2l0Y2gnLCAndGhpcycsICd0aHJvdycsICd0cnknLCAndHlwZW9mJywgJ3ZhcicsICd2b2lkJywgJ3doaWxlJywgJ3dpdGgnLFxuICAvLyBGdXR1cmUgcmVzZXJ2ZWQgd29yZHNcbiAgJ2NsYXNzJywgJ2NvbnN0JywgJ2VudW0nLCAnZXhwb3J0JywgJ2V4dGVuZHMnLCAnaW1wb3J0JywgJ3N1cGVyJyxcbiAgLy8gU3RyaWN0IG1vZGUgcmVzZXJ2ZWQgd29yZHNcbiAgJ2ltcGxlbWVudHMnLCAnaW50ZXJmYWNlJywgJ2xldCcsICdwYWNrYWdlJywgJ3ByaXZhdGUnLCAncHJvdGVjdGVkJywgJ3B1YmxpYycsICdzdGF0aWMnLCAneWllbGQnLFxuICAvLyBMaXRlcmFsc1xuICAnbnVsbCcsICd0cnVlJywgJ2ZhbHNlJyxcbiAgLy8gRVM2KyBhZGRpdGlvbnNcbiAgJ2F3YWl0JywgJ2FzeW5jJyxcbiAgLy8gQ29tbW9uIGdsb2JhbCBvYmplY3RzIHRoYXQgY291bGQgY2F1c2UgaXNzdWVzXG4gICdhcmd1bWVudHMnLCAnZXZhbCcsXG4gIC8vIEJyb3dzZXIvRE9NIGdsb2JhbHMgdGhhdCBzaGFkb3cgYmxvY2sgYXR0cmlidXRlcyAoZS5nLiBkb2N1bWVudC5ib2R5KVxuICAnYm9keScsXG4gIC8vIFR5cGVTY3JpcHQga2V5d29yZHNcbiAgJ2FueScsICdhcycsICdib29sZWFuJywgJ2NvbnN0cnVjdG9yJywgJ2RlY2xhcmUnLCAnZ2V0JywgJ21vZHVsZScsICduYW1lc3BhY2UnLFxuICAnbmV2ZXInLCAncmVhZG9ubHknLCAncmVxdWlyZScsICdudW1iZXInLCAnb2JqZWN0JywgJ3NldCcsICdzdHJpbmcnLCAnc3ltYm9sJywgJ3R5cGUnLCAnZnJvbScsICdvZidcbl0pO1xuXG4vKipcbiAqIENoZWNrIGlmIGEgbmFtZSBpcyBhIEphdmFTY3JpcHQgcmVzZXJ2ZWQgd29yZFxuICovXG5leHBvcnQgY29uc3QgaXNSZXNlcnZlZFdvcmQgPSAobmFtZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBKU19SRVNFUlZFRF9XT1JEUy5oYXMobmFtZS50b0xvd2VyQ2FzZSgpKTtcbn07XG5cbi8qKlxuICogU2FuaXRpemUgYSBuYW1lIGlmIGl0J3MgYSByZXNlcnZlZCB3b3JkIGJ5IHByZWZpeGluZyB3aXRoICdibG9jaydcbiAqIGUuZy4sICdzdXBlcicgLT4gJ2Jsb2NrU3VwZXInLCAnY2xhc3MnIC0+ICdibG9ja0NsYXNzJ1xuICovXG5leHBvcnQgY29uc3Qgc2FuaXRpemVSZXNlcnZlZE5hbWUgPSAobmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGlzUmVzZXJ2ZWRXb3JkKG5hbWUpKSB7XG4gICAgLy8gUHJlZml4IHdpdGggJ2Jsb2NrJyBhbmQgY2FwaXRhbGl6ZSB0aGUgZmlyc3QgbGV0dGVyIG9mIHRoZSBvcmlnaW5hbCBuYW1lXG4gICAgcmV0dXJuICdibG9jaycgKyBuYW1lLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbmFtZS5zbGljZSgxKS50b0xvd2VyQ2FzZSgpO1xuICB9XG4gIHJldHVybiBuYW1lO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IHNuYWtlX2Nhc2Ugb3Iga2ViYWItY2FzZSB0byBjYW1lbENhc2UsIHNhbml0aXppbmcgcmVzZXJ2ZWQgd29yZHNcbiAqL1xuZXhwb3J0IGNvbnN0IHRvQ2FtZWxDYXNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2FtZWxDYXNlZCA9IHN0ci5yZXBsYWNlKC9bLV9dKFthLXpdKS9nLCAoXywgbGV0dGVyKSA9PiBsZXR0ZXIudG9VcHBlckNhc2UoKSk7XG4gIHJldHVybiBzYW5pdGl6ZVJlc2VydmVkTmFtZShjYW1lbENhc2VkKTtcbn07XG5cbi8qKlxuICogRXh0cmFjdCB0b3AtbGV2ZWwgcHJvcGVydHkgbmFtZXMgcmVmZXJlbmNlZCBpbiBhIEhhbmRsZWJhcnMgdGVtcGxhdGUuXG4gKiBNYXRjaGVzIGFueSBgcHJvcGVydGllcy54eHhgIG9jY3VycmVuY2UgKGluc2lkZSB7ey4uLn19LCB7eyNpZiAuLi59fSwge3sjZWFjaCAuLi59fSwgZXRjLilcbiAqIFJldHVybnMgdGhlIGNhbWVsQ2FzZS9zYW5pdGl6ZWQgYXR0cmlidXRlIG5hbWVzIHNvIHRoZXkgY2FuIGJlIGFkZGVkIHRvIGRlc3RydWN0dXJpbmcgYW5kXG4gKiBibG9jay5qc29uIHdoZW4gdGhlIEFQSSBvbWl0cyB0aGVtIGZyb20gY29tcG9uZW50LnByb3BlcnRpZXMuXG4gKi9cbmV4cG9ydCBjb25zdCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyA9ICh0ZW1wbGF0ZTogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuICBjb25zdCBuYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAvLyBNYXRjaCBgcHJvcGVydGllcy54eHhgIGFueXdoZXJlIChoYW5kbGVzIHt7cHJvcGVydGllcy54fX0sIHt7I2lmIHByb3BlcnRpZXMueH19LCB7eyNlYWNoIHByb3BlcnRpZXMueH19LCBldGMuKVxuICBjb25zdCBwcm9wZXJ0aWVzUmVnZXggPSAvXFxicHJvcGVydGllc1xcLihbYS16QS1aX11bYS16QS1aMC05Xy1dKikvZztcbiAgbGV0IG07XG4gIHdoaWxlICgobSA9IHByb3BlcnRpZXNSZWdleC5leGVjKHRlbXBsYXRlKSkgIT09IG51bGwpIHtcbiAgICBuYW1lcy5hZGQodG9DYW1lbENhc2UobVsxXSkpO1xuICB9XG4gIHJldHVybiBbLi4ubmFtZXNdO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IENTUyBwcm9wZXJ0eSBuYW1lIHRvIGNhbWVsQ2FzZSBmb3IgUmVhY3Qgc3R5bGUgb2JqZWN0c1xuICovXG5leHBvcnQgY29uc3QgY3NzVG9DYW1lbENhc2UgPSAocHJvcDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHByb3AucmVwbGFjZSgvLShbYS16XSkvZywgKF8sIGxldHRlcikgPT4gbGV0dGVyLnRvVXBwZXJDYXNlKCkpO1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiBlbGVtZW50IGlzIHNlbGYtY2xvc2luZ1xuICovXG5leHBvcnQgY29uc3QgaXNTZWxmQ2xvc2luZyA9ICh0YWdOYW1lOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIFNFTEZfQ0xPU0lOR19UQUdTLmluY2x1ZGVzKHRhZ05hbWUudG9Mb3dlckNhc2UoKSk7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgYW4gSFRNTC9TVkcgYXR0cmlidXRlIG5hbWUgdG8gaXRzIEpTWCBlcXVpdmFsZW50XG4gKi9cbmV4cG9ydCBjb25zdCB0b0pzeEF0dHJOYW1lID0gKG5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIC8vIENoZWNrIHRoZSBsb29rdXAgbWFwIGZpcnN0XG4gIGlmIChIVE1MX1RPX0pTWF9BVFRSX01BUFtuYW1lXSkge1xuICAgIHJldHVybiBIVE1MX1RPX0pTWF9BVFRSX01BUFtuYW1lXTtcbiAgfVxuXG4gIC8vIFByZXNlcnZlIGRhdGEtKiBhbmQgYXJpYS0qIGFzIGxpdGVyYWwgaHlwaGVuYXRlZCBKU1ggYXR0cmlidXRlcyBzbyBET00gaG9va3NcbiAgLy8gKGUuZy4gZGF0YS1jb21wb25lbnQ9XCJoZXJvXCIpIG1hdGNoIGZyb250ZW5kIHZpZXcuanMgc2VsZWN0b3JzIGluIHRoZSBlZGl0b3IgY2FudmFzLlxuICBpZiAobmFtZS5zdGFydHNXaXRoKCdkYXRhLScpIHx8IG5hbWUuc3RhcnRzV2l0aCgnYXJpYS0nKSkge1xuICAgIHJldHVybiBuYW1lO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFueSByZW1haW5pbmcgbmFtZXNwYWNlZCBhdHRyaWJ1dGVzIChwcmVmaXg6c3VmZml4IC0+IHByZWZpeFN1ZmZpeClcbiAgaWYgKG5hbWUuaW5jbHVkZXMoJzonKSkge1xuICAgIGNvbnN0IFtwcmVmaXgsIHN1ZmZpeF0gPSBuYW1lLnNwbGl0KCc6Jyk7XG4gICAgcmV0dXJuIHByZWZpeCArIHN1ZmZpeC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHN1ZmZpeC5zbGljZSgxKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhbnkgcmVtYWluaW5nIGh5cGhlbmF0ZWQgYXR0cmlidXRlcyAoY29udmVydCB0byBjYW1lbENhc2UpXG4gIGlmIChuYW1lLmluY2x1ZGVzKCctJykpIHtcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgbGV0dGVyKSA9PiBsZXR0ZXIudG9VcHBlckNhc2UoKSk7XG4gIH1cblxuICByZXR1cm4gbmFtZTtcbn07XG5cbi8qKlxuICogTm9ybWFsaXplIHdoaXRlc3BhY2UgLSBjb2xsYXBzZSBuZXdsaW5lcyBhbmQgbXVsdGlwbGUgc3BhY2VzIGludG8gc2luZ2xlIHNwYWNlXG4gKi9cbmV4cG9ydCBjb25zdCBub3JtYWxpemVXaGl0ZXNwYWNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xufTtcblxuLyoqXG4gKiBDb2xsYXBzZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIChuZXdsaW5lcywgbXVsdGlwbGUgc3BhY2VzKSBpbnRvIHNpbmdsZSBzcGFjZXNcbiAqIGJ1dCBwcmVzZXJ2ZSBsZWFkaW5nL3RyYWlsaW5nIHdoaXRlc3BhY2UuIFVzZWQgZm9yIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZSB2YWx1ZXNcbiAqIHdoZXJlIGEgbGVhZGluZyBzcGFjZSAoZS5nLiBcIiB1LW14LWF1dG9cIikgaXMgc2lnbmlmaWNhbnQuXG4gKi9cbmV4cG9ydCBjb25zdCBjb2xsYXBzZVdoaXRlc3BhY2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbn07XG5cbi8qKlxuICogQ29udmVydCBjYW1lbENhc2Ugb3Igc25ha2VfY2FzZSB0byBodW1hbi1yZWFkYWJsZSBsYWJlbCAoZS5nLiBcInNvbWVWYWx1ZVwiIC0+IFwiU29tZSBWYWx1ZVwiLCBcInNvbWVfdmFsdWVcIiAtPiBcIlNvbWUgVmFsdWVcIikuXG4gKi9cbmV4cG9ydCBjb25zdCBodW1hbml6ZUxhYmVsID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcyA9IFN0cmluZyhzdHIpLnRyaW0oKTtcbiAgaWYgKCFzKSByZXR1cm4gcztcbiAgY29uc3Qgd2l0aFNwYWNlcyA9IHNcbiAgICAucmVwbGFjZSgvXy9nLCAnICcpXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csICckMSAkMicpXG4gICAgLnJlcGxhY2UoLyhbQS1aXSkoW0EtWl1bYS16XSkvZywgJyQxICQyJylcbiAgICAudHJpbSgpO1xuICByZXR1cm4gd2l0aFNwYWNlc1xuICAgIC5zcGxpdCgvXFxzKy8pXG4gICAgLm1hcCgod29yZCkgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSlcbiAgICAuam9pbignICcpO1xufTtcblxuLyoqIE5vcm1hbGl6ZWQgc2VsZWN0IG9wdGlvbjogYWx3YXlzIHsgbGFiZWwsIHZhbHVlIH0gKi9cbmV4cG9ydCB0eXBlIE5vcm1hbGl6ZWRTZWxlY3RPcHRpb24gPSB7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfTtcblxuLyoqXG4gKiBOb3JtYWxpemUgc2VsZWN0IG9wdGlvbnMgdG8gYWx3YXlzIGJlIEFycmF5PHsgbGFiZWwsIHZhbHVlIH0+LlxuICogSGFuZG9mZiBvcHRpb25zIGNhbiBiZSBlaXRoZXI6XG4gKiAtIEFycmF5PHsgdmFsdWU6IHN0cmluZywgbGFiZWw6IHN0cmluZyB9PlxuICogLSBBcnJheTxzdHJpbmc+IOKAlCBzdHJpbmcgaXMgdXNlZCBhcyBib3RoIHZhbHVlIGFuZCBsYWJlbDsgbGFiZWwgaXMgaHVtYW5pemVkIChjYW1lbC9zbmFrZSAtPiB0aXRsZSBjYXNlKS5cbiAqL1xuZXhwb3J0IGNvbnN0IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMgPSAoXG4gIG9wdGlvbnM6IEFycmF5PHsgbGFiZWw/OiBzdHJpbmc7IHZhbHVlPzogc3RyaW5nIH0gfCBzdHJpbmc+IHwgdW5kZWZpbmVkXG4pOiBOb3JtYWxpemVkU2VsZWN0T3B0aW9uW10gPT4ge1xuICBpZiAoIW9wdGlvbnMgfHwgIUFycmF5LmlzQXJyYXkob3B0aW9ucykgfHwgb3B0aW9ucy5sZW5ndGggPT09IDApIHJldHVybiBbXTtcbiAgcmV0dXJuIG9wdGlvbnMubWFwKChvKSA9PiB7XG4gICAgaWYgKHR5cGVvZiBvID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHsgdmFsdWU6IG8sIGxhYmVsOiBodW1hbml6ZUxhYmVsKG8pIH07XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gKG8udmFsdWUgPz8gJycpLnRvU3RyaW5nKCk7XG4gICAgY29uc3QgbGFiZWwgPSAoby5sYWJlbCA/PyB2YWx1ZSkudG9TdHJpbmcoKTtcbiAgICByZXR1cm4geyB2YWx1ZSwgbGFiZWw6IGxhYmVsID8gbGFiZWwgOiBodW1hbml6ZUxhYmVsKHZhbHVlKSB9O1xuICB9KTtcbn07XG5cbi8qKlxuICogRmluZCBtYXRjaGluZyBjbG9zaW5nIHRhZyBmb3IgYSBibG9jayBoZWxwZXIsIGhhbmRsaW5nIG5lc3RpbmdcbiAqL1xuZXhwb3J0IGNvbnN0IGZpbmRNYXRjaGluZ0Nsb3NlID0gKHRlbXBsYXRlOiBzdHJpbmcsIG9wZW5UYWc6IHN0cmluZywgY2xvc2VUYWc6IHN0cmluZywgc3RhcnRQb3M6IG51bWJlcik6IG51bWJlciA9PiB7XG4gIGxldCBkZXB0aCA9IDE7XG4gIGxldCBwb3MgPSBzdGFydFBvcztcbiAgXG4gIHdoaWxlIChkZXB0aCA+IDAgJiYgcG9zIDwgdGVtcGxhdGUubGVuZ3RoKSB7XG4gICAgY29uc3QgbmV4dE9wZW4gPSB0ZW1wbGF0ZS5pbmRleE9mKG9wZW5UYWcsIHBvcyk7XG4gICAgY29uc3QgbmV4dENsb3NlID0gdGVtcGxhdGUuaW5kZXhPZihjbG9zZVRhZywgcG9zKTtcbiAgICBcbiAgICBpZiAobmV4dENsb3NlID09PSAtMSkgcmV0dXJuIC0xO1xuICAgIFxuICAgIGlmIChuZXh0T3BlbiAhPT0gLTEgJiYgbmV4dE9wZW4gPCBuZXh0Q2xvc2UpIHtcbiAgICAgIGRlcHRoKys7XG4gICAgICBwb3MgPSBuZXh0T3BlbiArIG9wZW5UYWcubGVuZ3RoO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZXB0aC0tO1xuICAgICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gbmV4dENsb3NlO1xuICAgICAgcG9zID0gbmV4dENsb3NlICsgY2xvc2VUYWcubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIC0xO1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiBhIHBvc2l0aW9uIGluIHRoZSB0ZW1wbGF0ZSBpcyBpbnNpZGUgYW4gSFRNTCBhdHRyaWJ1dGUgdmFsdWVcbiAqL1xuZXhwb3J0IGNvbnN0IGlzSW5zaWRlQXR0cmlidXRlID0gKHRlbXBsYXRlOiBzdHJpbmcsIHBvczogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gIC8vIExvb2sgYmFja3dhcmRzIGZyb20gcG9zIHRvIGZpbmQgaWYgd2UncmUgaW5zaWRlIGFuIGF0dHJpYnV0ZVxuICBsZXQgaW5UYWcgPSBmYWxzZTtcbiAgbGV0IGluQXR0clZhbHVlID0gZmFsc2U7XG4gIGxldCBhdHRyUXVvdGUgPSAnJztcbiAgXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcG9zOyBpKyspIHtcbiAgICBjb25zdCBjaGFyID0gdGVtcGxhdGVbaV07XG4gICAgY29uc3QgcHJldkNoYXIgPSBpID4gMCA/IHRlbXBsYXRlW2kgLSAxXSA6ICcnO1xuICAgIFxuICAgIGlmICghaW5UYWcgJiYgY2hhciA9PT0gJzwnICYmIHRlbXBsYXRlW2kgKyAxXSAhPT0gJy8nKSB7XG4gICAgICBpblRhZyA9IHRydWU7XG4gICAgICBpbkF0dHJWYWx1ZSA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAoaW5UYWcgJiYgY2hhciA9PT0gJz4nKSB7XG4gICAgICBpblRhZyA9IGZhbHNlO1xuICAgICAgaW5BdHRyVmFsdWUgPSBmYWxzZTtcbiAgICAgIGF0dHJRdW90ZSA9ICcnO1xuICAgIH0gZWxzZSBpZiAoaW5UYWcgJiYgIWluQXR0clZhbHVlICYmIChjaGFyID09PSAnXCInIHx8IGNoYXIgPT09IFwiJ1wiKSkge1xuICAgICAgLy8gU3RhcnRpbmcgYW4gYXR0cmlidXRlIHZhbHVlXG4gICAgICBpbkF0dHJWYWx1ZSA9IHRydWU7XG4gICAgICBhdHRyUXVvdGUgPSBjaGFyO1xuICAgIH0gZWxzZSBpZiAoaW5UYWcgJiYgaW5BdHRyVmFsdWUgJiYgY2hhciA9PT0gYXR0clF1b3RlICYmIHByZXZDaGFyICE9PSAnXFxcXCcpIHtcbiAgICAgIC8vIEVuZGluZyBhbiBhdHRyaWJ1dGUgdmFsdWVcbiAgICAgIGluQXR0clZhbHVlID0gZmFsc2U7XG4gICAgICBhdHRyUXVvdGUgPSAnJztcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBpbkF0dHJWYWx1ZTtcbn07XG4iXX0=