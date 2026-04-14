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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILDJDQUFzRTtBQUV0RTs7R0FFRztBQUNILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDaEMsc0JBQXNCO0lBQ3RCLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxJQUFJO0lBQzNFLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxLQUFLO0lBQ3JFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU07SUFDcEYsd0JBQXdCO0lBQ3hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU87SUFDaEUsNkJBQTZCO0lBQzdCLFlBQVksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTztJQUNoRyxXQUFXO0lBQ1gsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPO0lBQ3ZCLGlCQUFpQjtJQUNqQixPQUFPLEVBQUUsT0FBTztJQUNoQixnREFBZ0Q7SUFDaEQsV0FBVyxFQUFFLE1BQU07SUFDbkIsd0VBQXdFO0lBQ3hFLE1BQU07SUFDTixzQkFBc0I7SUFDdEIsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFdBQVc7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QUksS0FBSyxJQUFJLFdBQVcsSUFBSSxJQUFJLEtBQUssU0FBUyxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUMzRSw0QkFBNEI7WUFDNUIsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUNwQixTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ2pCLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTyxXQUFXLENBQUM7QUFDckIsQ0FBQyxDQUFDO0FBN0JXLFFBQUEsaUJBQWlCLHFCQTZCNUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IEhUTUxfVE9fSlNYX0FUVFJfTUFQLCBTRUxGX0NMT1NJTkdfVEFHUyB9IGZyb20gJy4vY29uc3RhbnRzJztcblxuLyoqXG4gKiBKYXZhU2NyaXB0L1R5cGVTY3JpcHQgcmVzZXJ2ZWQgd29yZHMgdGhhdCBjYW5ub3QgYmUgdXNlZCBhcyBpZGVudGlmaWVyc1xuICovXG5jb25zdCBKU19SRVNFUlZFRF9XT1JEUyA9IG5ldyBTZXQoW1xuICAvLyBKYXZhU2NyaXB0IGtleXdvcmRzXG4gICdicmVhaycsICdjYXNlJywgJ2NhdGNoJywgJ2NvbnRpbnVlJywgJ2RlYnVnZ2VyJywgJ2RlZmF1bHQnLCAnZGVsZXRlJywgJ2RvJyxcbiAgJ2Vsc2UnLCAnZmluYWxseScsICdmb3InLCAnZnVuY3Rpb24nLCAnaWYnLCAnaW4nLCAnaW5zdGFuY2VvZicsICduZXcnLFxuICAncmV0dXJuJywgJ3N3aXRjaCcsICd0aGlzJywgJ3Rocm93JywgJ3RyeScsICd0eXBlb2YnLCAndmFyJywgJ3ZvaWQnLCAnd2hpbGUnLCAnd2l0aCcsXG4gIC8vIEZ1dHVyZSByZXNlcnZlZCB3b3Jkc1xuICAnY2xhc3MnLCAnY29uc3QnLCAnZW51bScsICdleHBvcnQnLCAnZXh0ZW5kcycsICdpbXBvcnQnLCAnc3VwZXInLFxuICAvLyBTdHJpY3QgbW9kZSByZXNlcnZlZCB3b3Jkc1xuICAnaW1wbGVtZW50cycsICdpbnRlcmZhY2UnLCAnbGV0JywgJ3BhY2thZ2UnLCAncHJpdmF0ZScsICdwcm90ZWN0ZWQnLCAncHVibGljJywgJ3N0YXRpYycsICd5aWVsZCcsXG4gIC8vIExpdGVyYWxzXG4gICdudWxsJywgJ3RydWUnLCAnZmFsc2UnLFxuICAvLyBFUzYrIGFkZGl0aW9uc1xuICAnYXdhaXQnLCAnYXN5bmMnLFxuICAvLyBDb21tb24gZ2xvYmFsIG9iamVjdHMgdGhhdCBjb3VsZCBjYXVzZSBpc3N1ZXNcbiAgJ2FyZ3VtZW50cycsICdldmFsJyxcbiAgLy8gQnJvd3Nlci9ET00gZ2xvYmFscyB0aGF0IHNoYWRvdyBibG9jayBhdHRyaWJ1dGVzIChlLmcuIGRvY3VtZW50LmJvZHkpXG4gICdib2R5JyxcbiAgLy8gVHlwZVNjcmlwdCBrZXl3b3Jkc1xuICAnYW55JywgJ2FzJywgJ2Jvb2xlYW4nLCAnY29uc3RydWN0b3InLCAnZGVjbGFyZScsICdnZXQnLCAnbW9kdWxlJywgJ25hbWVzcGFjZScsXG4gICduZXZlcicsICdyZWFkb25seScsICdyZXF1aXJlJywgJ251bWJlcicsICdvYmplY3QnLCAnc2V0JywgJ3N0cmluZycsICdzeW1ib2wnLCAndHlwZScsICdmcm9tJywgJ29mJ1xuXSk7XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBuYW1lIGlzIGEgSmF2YVNjcmlwdCByZXNlcnZlZCB3b3JkXG4gKi9cbmV4cG9ydCBjb25zdCBpc1Jlc2VydmVkV29yZCA9IChuYW1lOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIEpTX1JFU0VSVkVEX1dPUkRTLmhhcyhuYW1lLnRvTG93ZXJDYXNlKCkpO1xufTtcblxuLyoqXG4gKiBTYW5pdGl6ZSBhIG5hbWUgaWYgaXQncyBhIHJlc2VydmVkIHdvcmQgYnkgcHJlZml4aW5nIHdpdGggJ2Jsb2NrJ1xuICogZS5nLiwgJ3N1cGVyJyAtPiAnYmxvY2tTdXBlcicsICdjbGFzcycgLT4gJ2Jsb2NrQ2xhc3MnXG4gKi9cbmV4cG9ydCBjb25zdCBzYW5pdGl6ZVJlc2VydmVkTmFtZSA9IChuYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAoaXNSZXNlcnZlZFdvcmQobmFtZSkpIHtcbiAgICAvLyBQcmVmaXggd2l0aCAnYmxvY2snIGFuZCBjYXBpdGFsaXplIHRoZSBmaXJzdCBsZXR0ZXIgb2YgdGhlIG9yaWdpbmFsIG5hbWVcbiAgICByZXR1cm4gJ2Jsb2NrJyArIG5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCk7XG4gIH1cbiAgcmV0dXJuIG5hbWU7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgc25ha2VfY2FzZSBvciBrZWJhYi1jYXNlIHRvIGNhbWVsQ2FzZSwgc2FuaXRpemluZyByZXNlcnZlZCB3b3Jkc1xuICovXG5leHBvcnQgY29uc3QgdG9DYW1lbENhc2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjYW1lbENhc2VkID0gc3RyLnJlcGxhY2UoL1stX10oW2Etel0pL2csIChfLCBsZXR0ZXIpID0+IGxldHRlci50b1VwcGVyQ2FzZSgpKTtcbiAgcmV0dXJuIHNhbml0aXplUmVzZXJ2ZWROYW1lKGNhbWVsQ2FzZWQpO1xufTtcblxuLyoqXG4gKiBFeHRyYWN0IHRvcC1sZXZlbCBwcm9wZXJ0eSBuYW1lcyByZWZlcmVuY2VkIGluIGEgSGFuZGxlYmFycyB0ZW1wbGF0ZS5cbiAqIE1hdGNoZXMgYW55IGBwcm9wZXJ0aWVzLnh4eGAgb2NjdXJyZW5jZSAoaW5zaWRlIHt7Li4ufX0sIHt7I2lmIC4uLn19LCB7eyNlYWNoIC4uLn19LCBldGMuKVxuICogUmV0dXJucyB0aGUgY2FtZWxDYXNlL3Nhbml0aXplZCBhdHRyaWJ1dGUgbmFtZXMgc28gdGhleSBjYW4gYmUgYWRkZWQgdG8gZGVzdHJ1Y3R1cmluZyBhbmRcbiAqIGJsb2NrLmpzb24gd2hlbiB0aGUgQVBJIG9taXRzIHRoZW0gZnJvbSBjb21wb25lbnQucHJvcGVydGllcy5cbiAqL1xuZXhwb3J0IGNvbnN0IGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzID0gKHRlbXBsYXRlOiBzdHJpbmcpOiBzdHJpbmdbXSA9PiB7XG4gIGNvbnN0IG5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIC8vIE1hdGNoIGBwcm9wZXJ0aWVzLnh4eGAgYW55d2hlcmUgKGhhbmRsZXMge3twcm9wZXJ0aWVzLnh9fSwge3sjaWYgcHJvcGVydGllcy54fX0sIHt7I2VhY2ggcHJvcGVydGllcy54fX0sIGV0Yy4pXG4gIGNvbnN0IHByb3BlcnRpZXNSZWdleCA9IC9cXGJwcm9wZXJ0aWVzXFwuKFthLXpBLVpfXVthLXpBLVowLTlfLV0qKS9nO1xuICBsZXQgbTtcbiAgd2hpbGUgKChtID0gcHJvcGVydGllc1JlZ2V4LmV4ZWModGVtcGxhdGUpKSAhPT0gbnVsbCkge1xuICAgIG5hbWVzLmFkZCh0b0NhbWVsQ2FzZShtWzFdKSk7XG4gIH1cbiAgcmV0dXJuIFsuLi5uYW1lc107XG59O1xuXG4vKipcbiAqIENvbnZlcnQgQ1NTIHByb3BlcnR5IG5hbWUgdG8gY2FtZWxDYXNlIGZvciBSZWFjdCBzdHlsZSBvYmplY3RzXG4gKi9cbmV4cG9ydCBjb25zdCBjc3NUb0NhbWVsQ2FzZSA9IChwcm9wOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gcHJvcC5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgbGV0dGVyKSA9PiBsZXR0ZXIudG9VcHBlckNhc2UoKSk7XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGVsZW1lbnQgaXMgc2VsZi1jbG9zaW5nXG4gKi9cbmV4cG9ydCBjb25zdCBpc1NlbGZDbG9zaW5nID0gKHRhZ05hbWU6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gU0VMRl9DTE9TSU5HX1RBR1MuaW5jbHVkZXModGFnTmFtZS50b0xvd2VyQ2FzZSgpKTtcbn07XG5cbi8qKlxuICogQ29udmVydCBhbiBIVE1ML1NWRyBhdHRyaWJ1dGUgbmFtZSB0byBpdHMgSlNYIGVxdWl2YWxlbnRcbiAqL1xuZXhwb3J0IGNvbnN0IHRvSnN4QXR0ck5hbWUgPSAobmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gQ2hlY2sgdGhlIGxvb2t1cCBtYXAgZmlyc3RcbiAgaWYgKEhUTUxfVE9fSlNYX0FUVFJfTUFQW25hbWVdKSB7XG4gICAgcmV0dXJuIEhUTUxfVE9fSlNYX0FUVFJfTUFQW25hbWVdO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgYW55IHJlbWFpbmluZyBuYW1lc3BhY2VkIGF0dHJpYnV0ZXMgKHByZWZpeDpzdWZmaXggLT4gcHJlZml4U3VmZml4KVxuICBpZiAobmFtZS5pbmNsdWRlcygnOicpKSB7XG4gICAgY29uc3QgW3ByZWZpeCwgc3VmZml4XSA9IG5hbWUuc3BsaXQoJzonKTtcbiAgICByZXR1cm4gcHJlZml4ICsgc3VmZml4LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc3VmZml4LnNsaWNlKDEpO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgYW55IHJlbWFpbmluZyBoeXBoZW5hdGVkIGF0dHJpYnV0ZXMgKGNvbnZlcnQgdG8gY2FtZWxDYXNlKVxuICBpZiAobmFtZS5pbmNsdWRlcygnLScpKSB7XG4gICAgcmV0dXJuIG5hbWUucmVwbGFjZSgvLShbYS16XSkvZywgKF8sIGxldHRlcikgPT4gbGV0dGVyLnRvVXBwZXJDYXNlKCkpO1xuICB9XG4gIFxuICByZXR1cm4gbmFtZTtcbn07XG5cbi8qKlxuICogTm9ybWFsaXplIHdoaXRlc3BhY2UgLSBjb2xsYXBzZSBuZXdsaW5lcyBhbmQgbXVsdGlwbGUgc3BhY2VzIGludG8gc2luZ2xlIHNwYWNlXG4gKi9cbmV4cG9ydCBjb25zdCBub3JtYWxpemVXaGl0ZXNwYWNlID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xufTtcblxuLyoqXG4gKiBDb2xsYXBzZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIChuZXdsaW5lcywgbXVsdGlwbGUgc3BhY2VzKSBpbnRvIHNpbmdsZSBzcGFjZXNcbiAqIGJ1dCBwcmVzZXJ2ZSBsZWFkaW5nL3RyYWlsaW5nIHdoaXRlc3BhY2UuIFVzZWQgZm9yIGNvbmRpdGlvbmFsIGF0dHJpYnV0ZSB2YWx1ZXNcbiAqIHdoZXJlIGEgbGVhZGluZyBzcGFjZSAoZS5nLiBcIiB1LW14LWF1dG9cIikgaXMgc2lnbmlmaWNhbnQuXG4gKi9cbmV4cG9ydCBjb25zdCBjb2xsYXBzZVdoaXRlc3BhY2UgPSAoc3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbn07XG5cbi8qKlxuICogQ29udmVydCBjYW1lbENhc2Ugb3Igc25ha2VfY2FzZSB0byBodW1hbi1yZWFkYWJsZSBsYWJlbCAoZS5nLiBcInNvbWVWYWx1ZVwiIC0+IFwiU29tZSBWYWx1ZVwiLCBcInNvbWVfdmFsdWVcIiAtPiBcIlNvbWUgVmFsdWVcIikuXG4gKi9cbmV4cG9ydCBjb25zdCBodW1hbml6ZUxhYmVsID0gKHN0cjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcyA9IFN0cmluZyhzdHIpLnRyaW0oKTtcbiAgaWYgKCFzKSByZXR1cm4gcztcbiAgY29uc3Qgd2l0aFNwYWNlcyA9IHNcbiAgICAucmVwbGFjZSgvXy9nLCAnICcpXG4gICAgLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csICckMSAkMicpXG4gICAgLnJlcGxhY2UoLyhbQS1aXSkoW0EtWl1bYS16XSkvZywgJyQxICQyJylcbiAgICAudHJpbSgpO1xuICByZXR1cm4gd2l0aFNwYWNlc1xuICAgIC5zcGxpdCgvXFxzKy8pXG4gICAgLm1hcCgod29yZCkgPT4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSlcbiAgICAuam9pbignICcpO1xufTtcblxuLyoqIE5vcm1hbGl6ZWQgc2VsZWN0IG9wdGlvbjogYWx3YXlzIHsgbGFiZWwsIHZhbHVlIH0gKi9cbmV4cG9ydCB0eXBlIE5vcm1hbGl6ZWRTZWxlY3RPcHRpb24gPSB7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfTtcblxuLyoqXG4gKiBOb3JtYWxpemUgc2VsZWN0IG9wdGlvbnMgdG8gYWx3YXlzIGJlIEFycmF5PHsgbGFiZWwsIHZhbHVlIH0+LlxuICogSGFuZG9mZiBvcHRpb25zIGNhbiBiZSBlaXRoZXI6XG4gKiAtIEFycmF5PHsgdmFsdWU6IHN0cmluZywgbGFiZWw6IHN0cmluZyB9PlxuICogLSBBcnJheTxzdHJpbmc+IOKAlCBzdHJpbmcgaXMgdXNlZCBhcyBib3RoIHZhbHVlIGFuZCBsYWJlbDsgbGFiZWwgaXMgaHVtYW5pemVkIChjYW1lbC9zbmFrZSAtPiB0aXRsZSBjYXNlKS5cbiAqL1xuZXhwb3J0IGNvbnN0IG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMgPSAoXG4gIG9wdGlvbnM6IEFycmF5PHsgbGFiZWw/OiBzdHJpbmc7IHZhbHVlPzogc3RyaW5nIH0gfCBzdHJpbmc+IHwgdW5kZWZpbmVkXG4pOiBOb3JtYWxpemVkU2VsZWN0T3B0aW9uW10gPT4ge1xuICBpZiAoIW9wdGlvbnMgfHwgIUFycmF5LmlzQXJyYXkob3B0aW9ucykgfHwgb3B0aW9ucy5sZW5ndGggPT09IDApIHJldHVybiBbXTtcbiAgcmV0dXJuIG9wdGlvbnMubWFwKChvKSA9PiB7XG4gICAgaWYgKHR5cGVvZiBvID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHsgdmFsdWU6IG8sIGxhYmVsOiBodW1hbml6ZUxhYmVsKG8pIH07XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gKG8udmFsdWUgPz8gJycpLnRvU3RyaW5nKCk7XG4gICAgY29uc3QgbGFiZWwgPSAoby5sYWJlbCA/PyB2YWx1ZSkudG9TdHJpbmcoKTtcbiAgICByZXR1cm4geyB2YWx1ZSwgbGFiZWw6IGxhYmVsID8gbGFiZWwgOiBodW1hbml6ZUxhYmVsKHZhbHVlKSB9O1xuICB9KTtcbn07XG5cbi8qKlxuICogRmluZCBtYXRjaGluZyBjbG9zaW5nIHRhZyBmb3IgYSBibG9jayBoZWxwZXIsIGhhbmRsaW5nIG5lc3RpbmdcbiAqL1xuZXhwb3J0IGNvbnN0IGZpbmRNYXRjaGluZ0Nsb3NlID0gKHRlbXBsYXRlOiBzdHJpbmcsIG9wZW5UYWc6IHN0cmluZywgY2xvc2VUYWc6IHN0cmluZywgc3RhcnRQb3M6IG51bWJlcik6IG51bWJlciA9PiB7XG4gIGxldCBkZXB0aCA9IDE7XG4gIGxldCBwb3MgPSBzdGFydFBvcztcbiAgXG4gIHdoaWxlIChkZXB0aCA+IDAgJiYgcG9zIDwgdGVtcGxhdGUubGVuZ3RoKSB7XG4gICAgY29uc3QgbmV4dE9wZW4gPSB0ZW1wbGF0ZS5pbmRleE9mKG9wZW5UYWcsIHBvcyk7XG4gICAgY29uc3QgbmV4dENsb3NlID0gdGVtcGxhdGUuaW5kZXhPZihjbG9zZVRhZywgcG9zKTtcbiAgICBcbiAgICBpZiAobmV4dENsb3NlID09PSAtMSkgcmV0dXJuIC0xO1xuICAgIFxuICAgIGlmIChuZXh0T3BlbiAhPT0gLTEgJiYgbmV4dE9wZW4gPCBuZXh0Q2xvc2UpIHtcbiAgICAgIGRlcHRoKys7XG4gICAgICBwb3MgPSBuZXh0T3BlbiArIG9wZW5UYWcubGVuZ3RoO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZXB0aC0tO1xuICAgICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gbmV4dENsb3NlO1xuICAgICAgcG9zID0gbmV4dENsb3NlICsgY2xvc2VUYWcubGVuZ3RoO1xuICAgIH1cbiAgfVxuICBcbiAgcmV0dXJuIC0xO1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiBhIHBvc2l0aW9uIGluIHRoZSB0ZW1wbGF0ZSBpcyBpbnNpZGUgYW4gSFRNTCBhdHRyaWJ1dGUgdmFsdWVcbiAqL1xuZXhwb3J0IGNvbnN0IGlzSW5zaWRlQXR0cmlidXRlID0gKHRlbXBsYXRlOiBzdHJpbmcsIHBvczogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gIC8vIExvb2sgYmFja3dhcmRzIGZyb20gcG9zIHRvIGZpbmQgaWYgd2UncmUgaW5zaWRlIGFuIGF0dHJpYnV0ZVxuICBsZXQgaW5UYWcgPSBmYWxzZTtcbiAgbGV0IGluQXR0clZhbHVlID0gZmFsc2U7XG4gIGxldCBhdHRyUXVvdGUgPSAnJztcbiAgXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcG9zOyBpKyspIHtcbiAgICBjb25zdCBjaGFyID0gdGVtcGxhdGVbaV07XG4gICAgY29uc3QgcHJldkNoYXIgPSBpID4gMCA/IHRlbXBsYXRlW2kgLSAxXSA6ICcnO1xuICAgIFxuICAgIGlmICghaW5UYWcgJiYgY2hhciA9PT0gJzwnICYmIHRlbXBsYXRlW2kgKyAxXSAhPT0gJy8nKSB7XG4gICAgICBpblRhZyA9IHRydWU7XG4gICAgICBpbkF0dHJWYWx1ZSA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAoaW5UYWcgJiYgY2hhciA9PT0gJz4nKSB7XG4gICAgICBpblRhZyA9IGZhbHNlO1xuICAgICAgaW5BdHRyVmFsdWUgPSBmYWxzZTtcbiAgICAgIGF0dHJRdW90ZSA9ICcnO1xuICAgIH0gZWxzZSBpZiAoaW5UYWcgJiYgIWluQXR0clZhbHVlICYmIChjaGFyID09PSAnXCInIHx8IGNoYXIgPT09IFwiJ1wiKSkge1xuICAgICAgLy8gU3RhcnRpbmcgYW4gYXR0cmlidXRlIHZhbHVlXG4gICAgICBpbkF0dHJWYWx1ZSA9IHRydWU7XG4gICAgICBhdHRyUXVvdGUgPSBjaGFyO1xuICAgIH0gZWxzZSBpZiAoaW5UYWcgJiYgaW5BdHRyVmFsdWUgJiYgY2hhciA9PT0gYXR0clF1b3RlICYmIHByZXZDaGFyICE9PSAnXFxcXCcpIHtcbiAgICAgIC8vIEVuZGluZyBhbiBhdHRyaWJ1dGUgdmFsdWVcbiAgICAgIGluQXR0clZhbHVlID0gZmFsc2U7XG4gICAgICBhdHRyUXVvdGUgPSAnJztcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiBpbkF0dHJWYWx1ZTtcbn07XG4iXX0=