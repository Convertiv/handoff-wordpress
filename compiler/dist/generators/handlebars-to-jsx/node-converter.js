"use strict";
/**
 * Node conversion utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeToJsx = exports.processTextContent = void 0;
const node_html_parser_1 = require("node-html-parser");
const constants_1 = require("./constants");
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
const attributes_1 = require("./attributes");
const canvas_shim_1 = require("../canvas-shim");
/**
 * Design-system anchors use class "button" but must not be <a> in the editor (RichText + wp-core-ui).
 */
const isHandoffDesignSystemButton = (tagName, attrs, context) => tagName === 'a' &&
    ((0, canvas_shim_1.attrsMatchCanvasButtonPatterns)(attrs, context.editorConfig) ||
        /\bbutton\b/.test(attrs) ||
        /\bbutton--/.test(attrs));
const appendHandoffCanvasButtonClass = (attrs) => {
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
        return attrs.replace(/className=\{String\(\s*([^)]+)\s*\)\}/, 'className={`${String($1 ?? \'\')} handoff-canvas-button`}');
    }
    const trimmed = attrs.trim();
    return trimmed ? `${trimmed} className="handoff-canvas-button"` : 'className="handoff-canvas-button"';
};
const convertDesignSystemAnchorForEditor = (tagName, attrs, context) => {
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
const processTextContent = (text, context, loopVar = 'item') => {
    if (!text.trim())
        return '';
    let result = text;
    // First handle triple-brace expressions (unescaped HTML/rich text)
    // Convert {{{expression}}} to a span with dangerouslySetInnerHTML
    // Use a placeholder to avoid the double-brace regex consuming the {{ __html: }} syntax
    result = result.replace(/\{\{\{\s*([^}]+?)\s*\}\}\}/g, (match, expr) => {
        const transpiled = (0, expression_parser_1.transpileExpression)(expr.trim(), context, loopVar);
        // Use placeholder that will be replaced back after all processing
        return `<span ${constants_1.DANGEROUS_HTML_PLACEHOLDER}="${transpiled}" />`;
    });
    // Then handle double-brace expressions (escaped text)
    // Convert {{expression}} to {expression}
    result = result.replace(/\{\{+\s*([^#\/!][^}]*?)\s*\}+\}/g, (match, expr) => {
        const transpiled = (0, expression_parser_1.transpileExpression)(expr.trim(), context, loopVar);
        return `{${transpiled}}`;
    });
    // Restore dangerouslySetInnerHTML with proper JSX syntax
    result = result.replace(new RegExp(`${constants_1.DANGEROUS_HTML_PLACEHOLDER}="([^"]+)"`, 'g'), (_, expr) => `dangerouslySetInnerHTML={{ __html: ${expr} || '' }}`);
    return result;
};
exports.processTextContent = processTextContent;
/**
 * Convert an HTML node to JSX
 */
const nodeToJsx = (node, context, loopVar) => {
    // Use provided loopVar, then context.loopVariable, then default to 'item'
    const effectiveLoopVar = loopVar || context.loopVariable || 'item';
    if (node instanceof node_html_parser_1.TextNode) {
        const text = node.text;
        if (!text.trim())
            return '';
        return (0, exports.processTextContent)(text, context, effectiveLoopVar);
    }
    if (node instanceof node_html_parser_1.HTMLElement) {
        let tagName = node.tagName?.toLowerCase();
        if (!tagName) {
            return node.childNodes.map(child => (0, exports.nodeToJsx)(child, context, effectiveLoopVar)).join('\n');
        }
        // Skip script and style tags
        if (tagName === 'script' || tagName === 'style') {
            return '';
        }
        let attrs = (0, attributes_1.convertAttributes)(node, context);
        // Design-system .button links → <span.handoff-canvas-button> for editor RichText + styling.
        ({ tagName, attrs } = convertDesignSystemAnchorForEditor(tagName, attrs, context));
        // Other anchors: strip href so the editor does not navigate away while editing.
        if (tagName === 'a') {
            attrs = attrs.replace(/\s*href=\{[^}]+\}/g, '').replace(/\s*href="[^"]*"/g, '').trim();
        }
        const attrStr = attrs ? ` ${attrs}` : '';
        // Handle self-closing tags
        if ((0, utils_1.isSelfClosing)(tagName)) {
            return `<${tagName}${attrStr} />`;
        }
        // Process children
        const children = node.childNodes
            .map(child => (0, exports.nodeToJsx)(child, context, effectiveLoopVar))
            .filter(Boolean)
            .join('\n');
        if (!children) {
            return `<${tagName}${attrStr}></${tagName}>`;
        }
        return `<${tagName}${attrStr}>\n${children}\n</${tagName}>`;
    }
    return '';
};
exports.nodeToJsx = nodeToJsx;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1jb252ZXJ0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9ub2RlLWNvbnZlcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILHVEQUErRDtBQUUvRCwyQ0FBeUQ7QUFDekQsbUNBQXdDO0FBQ3hDLDJEQUEwRDtBQUMxRCw2Q0FBaUQ7QUFDakQsZ0RBQWdFO0FBRWhFOztHQUVHO0FBQ0gsTUFBTSwyQkFBMkIsR0FBRyxDQUNsQyxPQUFlLEVBQ2YsS0FBYSxFQUNiLE9BQTBCLEVBQ2pCLEVBQUUsQ0FDWCxPQUFPLEtBQUssR0FBRztJQUNmLENBQUMsSUFBQSw0Q0FBOEIsRUFBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUMxRCxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN4QixZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFFOUIsTUFBTSw4QkFBOEIsR0FBRyxDQUFDLEtBQWEsRUFBVSxFQUFFO0lBQy9ELElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7UUFDNUMsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBQ0QsSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0QyxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMscUJBQXFCLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBQ0QsMkRBQTJEO0lBQzNELElBQUksdUJBQXVCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDeEMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFDRCx1RUFBdUU7SUFDdkUsSUFBSSwwQkFBMEIsQ0FBQyxJ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RUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekYsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBRXpDLDJCQUEyQjtRQUMzQixJQUFJLElBQUEscUJBQWEsRUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzNCLE9BQU8sSUFBSSxPQUFPLEdBQUcsT0FBTyxLQUFLLENBQUM7UUFDcEMsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVTthQUM3QixHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFBLGlCQUFTLEVBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO2FBQ3pELE1BQU0sQ0FBQyxPQUFPLENBQUM7YUFDZixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFZCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxPQUFPLElBQUksT0FBTyxHQUFHLE9BQU8sTUFBTSxPQUFPLEdBQUcsQ0FBQztRQUMvQyxDQUFDO1FBRUQsT0FBTyxJQUFJLE9BQU8sR0FBRyxPQUFPLE1BQU0sUUFBUSxPQUFPLE9BQU8sR0FBRyxDQUFDO0lBQzlELENBQUM7SUFFRCxPQUFPLEVBQUUsQ0FBQztBQUNaLENBQUMsQ0FBQztBQXJEVyxRQUFBLFNBQVMsYUFxRHBCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBOb2RlIGNvbnZlcnNpb24gdXRpbGl0aWVzIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IEhUTUxFbGVtZW50LCBUZXh0Tm9kZSwgTm9kZSB9IGZyb20gJ25vZGUtaHRtbC1wYXJzZXInO1xuaW1wb3J0IHsgVHJhbnNwaWxlckNvbnRleHQgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IERBTkdFUk9VU19IVE1MX1BMQUNFSE9MREVSIH0gZnJvbSAnLi9jb25zdGFudHMnO1xuaW1wb3J0IHsgaXNTZWxmQ2xvc2luZyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdHJhbnNwaWxlRXhwcmVzc2lvbiB9IGZyb20gJy4vZXhwcmVzc2lvbi1wYXJzZXInO1xuaW1wb3J0IHsgY29udmVydEF0dHJpYnV0ZXMgfSBmcm9tICcuL2F0dHJpYnV0ZXMnO1xuaW1wb3J0IHsgYXR0cnNNYXRjaENhbnZhc0J1dHRvblBhdHRlcm5zIH0gZnJvbSAnLi4vY2FudmFzLXNoaW0nO1xuXG4vKipcbiAqIERlc2lnbi1zeXN0ZW0gYW5jaG9ycyB1c2UgY2xhc3MgXCJidXR0b25cIiBidXQgbXVzdCBub3QgYmUgPGE+IGluIHRoZSBlZGl0b3IgKFJpY2hUZXh0ICsgd3AtY29yZS11aSkuXG4gKi9cbmNvbnN0IGlzSGFuZG9mZkRlc2lnblN5c3RlbUJ1dHRvbiA9IChcbiAgdGFnTmFtZTogc3RyaW5nLFxuICBhdHRyczogc3RyaW5nLFxuICBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCxcbik6IGJvb2xlYW4gPT5cbiAgdGFnTmFtZSA9PT0gJ2EnICYmXG4gIChhdHRyc01hdGNoQ2FudmFzQnV0dG9uUGF0dGVybnMoYXR0cnMsIGNvbnRleHQuZWRpdG9yQ29uZmlnKSB8fFxuICAgIC9cXGJidXR0b25cXGIvLnRlc3QoYXR0cnMpIHx8XG4gICAgL1xcYmJ1dHRvbi0tLy50ZXN0KGF0dHJzKSk7XG5cbmNvbnN0IGFwcGVuZEhhbmRvZmZDYW52YXNCdXR0b25DbGFzcyA9IChhdHRyczogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGF0dHJzLmluY2x1ZGVzKCdoYW5kb2ZmLWNhbnZhcy1idXR0b24nKSkge1xuICAgIHJldHVybiBhdHRycztcbiAgfVxuICBpZiAoL2NsYXNzTmFtZT1cIihbXlwiXSopXCIvLnRlc3QoYXR0cnMpKSB7XG4gICAgcmV0dXJuIGF0dHJzLnJlcGxhY2UoL2NsYXNzTmFtZT1cIihbXlwiXSopXCIvLCAnY2xhc3NOYW1lPVwiJDEgaGFuZG9mZi1jYW52YXMtYnV0dG9uXCInKTtcbiAgfVxuICAvLyBTdGF0aWMgdGVtcGxhdGUgbGl0ZXJhbDogY2xhc3NOYW1lPXtgYnV0dG9uIGJ1dHRvbi0tbWRgfVxuICBpZiAoL2NsYXNzTmFtZT1cXHtgW15gXSpgXFx9Ly50ZXN0KGF0dHJzKSkge1xuICAgIHJldHVybiBhdHRycy5yZXBsYWNlKC9gXFx9LywgJyBoYW5kb2ZmLWNhbnZhcy1idXR0b25gfScpO1xuICB9XG4gIC8vIFRlbXBsYXRlIGxpdGVyYWwgd2l0aCBleHByZXNzaW9uczogY2xhc3NOYW1lPXtgYnV0dG9uIOKApiAke3ZhcmlhbnR9YH1cbiAgaWYgKC9jbGFzc05hbWU9XFx7YFtcXHNcXFNdKj9gXFx9Ly50ZXN0KGF0dHJzKSkge1xuICAgIHJldHVybiBhdHRycy5yZXBsYWNlKC9gXFx9LywgJyBoYW5kb2ZmLWNhbnZhcy1idXR0b25gfScpO1xuICB9XG4gIGlmICgvY2xhc3NOYW1lPVxce1N0cmluZ1xcKFxccyovLnRlc3QoYXR0cnMpKSB7XG4gICAgcmV0dXJuIGF0dHJzLnJlcGxhY2UoXG4gICAgICAvY2xhc3NOYW1lPVxce1N0cmluZ1xcKFxccyooW14pXSspXFxzKlxcKVxcfS8sXG4gICAgICAnY2xhc3NOYW1lPXtgJHtTdHJpbmcoJDEgPz8gXFwnXFwnKX0gaGFuZG9mZi1jYW52YXMtYnV0dG9uYH0nLFxuICAgICk7XG4gIH1cbiAgY29uc3QgdHJpbW1lZCA9IGF0dHJzLnRyaW0oKTtcbiAgcmV0dXJuIHRyaW1tZWQgPyBgJHt0cmltbWVkfSBjbGFzc05hbWU9XCJoYW5kb2ZmLWNhbnZhcy1idXR0b25cImAgOiAnY2xhc3NOYW1lPVwiaGFuZG9mZi1jYW52YXMtYnV0dG9uXCInO1xufTtcblxuY29uc3QgY29udmVydERlc2lnblN5c3RlbUFuY2hvckZvckVkaXRvciA9IChcbiAgdGFnTmFtZTogc3RyaW5nLFxuICBhdHRyczogc3RyaW5nLFxuICBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCxcbik6IHsgdGFnTmFtZTogc3RyaW5nOyBhdHRyczogc3RyaW5nIH0gPT4ge1xuICBpZiAoIWlzSGFuZG9mZkRlc2lnblN5c3RlbUJ1dHRvbih0YWdOYW1lLCBhdHRycywgY29udGV4dCkpIHtcbiAgICByZXR1cm4geyB0YWdOYW1lLCBhdHRycyB9O1xuICB9XG4gIGxldCBuZXh0QXR0cnMgPSBhdHRyc1xuICAgIC5yZXBsYWNlKC9cXHMqaHJlZj1cXHtbXn1dK1xcfS9nLCAnJylcbiAgICAucmVwbGFjZSgvXFxzKmhyZWY9XCJbXlwiXSpcIi9nLCAnJylcbiAgICAudHJpbSgpO1xuICBuZXh0QXR0cnMgPSBhcHBlbmRIYW5kb2ZmQ2FudmFzQnV0dG9uQ2xhc3MobmV4dEF0dHJzKTtcbiAgcmV0dXJuIHsgdGFnTmFtZTogJ3NwYW4nLCBhdHRyczogbmV4dEF0dHJzIH07XG59O1xuXG4vKipcbiAqIFByb2Nlc3MgaGFuZGxlYmFycyBleHByZXNzaW9ucyBpbiB0ZXh0XG4gKi9cbmV4cG9ydCBjb25zdCBwcm9jZXNzVGV4dENvbnRlbnQgPSAodGV4dDogc3RyaW5nLCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCwgbG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nKTogc3RyaW5nID0+IHtcbiAgaWYgKCF0ZXh0LnRyaW0oKSkgcmV0dXJuICcnO1xuICBcbiAgbGV0IHJlc3VsdCA9IHRleHQ7XG4gIFxuICAvLyBGaXJzdCBoYW5kbGUgdHJpcGxlLWJyYWNlIGV4cHJlc3Npb25zICh1bmVzY2FwZWQgSFRNTC9yaWNoIHRleHQpXG4gIC8vIENvbnZlcnQge3t7ZXhwcmVzc2lvbn19fSB0byBhIHNwYW4gd2l0aCBkYW5nZXJvdXNseVNldElubmVySFRNTFxuICAvLyBVc2UgYSBwbGFjZWhvbGRlciB0byBhdm9pZCB0aGUgZG91YmxlLWJyYWNlIHJlZ2V4IGNvbnN1bWluZyB0aGUge3sgX19odG1sOiB9fSBzeW50YXhcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgL1xce1xce1xce1xccyooW159XSs/KVxccypcXH1cXH1cXH0vZyxcbiAgICAobWF0Y2gsIGV4cHIpID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zcGlsZWQgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGV4cHIudHJpbSgpLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgIC8vIFVzZSBwbGFjZWhvbGRlciB0aGF0IHdpbGwgYmUgcmVwbGFjZWQgYmFjayBhZnRlciBhbGwgcHJvY2Vzc2luZ1xuICAgICAgcmV0dXJuIGA8c3BhbiAke0RBTkdFUk9VU19IVE1MX1BMQUNFSE9MREVSfT1cIiR7dHJhbnNwaWxlZH1cIiAvPmA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gVGhlbiBoYW5kbGUgZG91YmxlLWJyYWNlIGV4cHJlc3Npb25zIChlc2NhcGVkIHRleHQpXG4gIC8vIENvbnZlcnQge3tleHByZXNzaW9ufX0gdG8ge2V4cHJlc3Npb259XG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHsrXFxzKihbXiNcXC8hXVtefV0qPylcXHMqXFx9K1xcfS9nLFxuICAgIChtYXRjaCwgZXhwcikgPT4ge1xuICAgICAgY29uc3QgdHJhbnNwaWxlZCA9IHRyYW5zcGlsZUV4cHJlc3Npb24oZXhwci50cmltKCksIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgICAgcmV0dXJuIGB7JHt0cmFuc3BpbGVkfX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIFJlc3RvcmUgZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUwgd2l0aCBwcm9wZXIgSlNYIHN5bnRheFxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICBuZXcgUmVnRXhwKGAke0RBTkdFUk9VU19IVE1MX1BMQUNFSE9MREVSfT1cIihbXlwiXSspXCJgLCAnZycpLFxuICAgIChfLCBleHByKSA9PiBgZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUw9e3sgX19odG1sOiAke2V4cHJ9IHx8ICcnIH19YFxuICApO1xuICBcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogQ29udmVydCBhbiBIVE1MIG5vZGUgdG8gSlNYXG4gKi9cbmV4cG9ydCBjb25zdCBub2RlVG9Kc3ggPSAobm9kZTogTm9kZSwgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQsIGxvb3BWYXI/OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAvLyBVc2UgcHJvdmlkZWQgbG9vcFZhciwgdGhlbiBjb250ZXh0Lmxvb3BWYXJpYWJsZSwgdGhlbiBkZWZhdWx0IHRvICdpdGVtJ1xuICBjb25zdCBlZmZlY3RpdmVMb29wVmFyID0gbG9vcFZhciB8fCBjb250ZXh0Lmxvb3BWYXJpYWJsZSB8fCAnaXRlbSc7XG4gIFxuICBpZiAobm9kZSBpbnN0YW5jZW9mIFRleHROb2RlKSB7XG4gICAgY29uc3QgdGV4dCA9IG5vZGUudGV4dDtcbiAgICBpZiAoIXRleHQudHJpbSgpKSByZXR1cm4gJyc7XG4gICAgcmV0dXJuIHByb2Nlc3NUZXh0Q29udGVudCh0ZXh0LCBjb250ZXh0LCBlZmZlY3RpdmVMb29wVmFyKTtcbiAgfVxuICBcbiAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgIGxldCB0YWdOYW1lID0gbm9kZS50YWdOYW1lPy50b0xvd2VyQ2FzZSgpO1xuICAgIFxuICAgIGlmICghdGFnTmFtZSkge1xuICAgICAgcmV0dXJuIG5vZGUuY2hpbGROb2Rlcy5tYXAoY2hpbGQgPT4gbm9kZVRvSnN4KGNoaWxkLCBjb250ZXh0LCBlZmZlY3RpdmVMb29wVmFyKSkuam9pbignXFxuJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIFNraXAgc2NyaXB0IGFuZCBzdHlsZSB0YWdzXG4gICAgaWYgKHRhZ05hbWUgPT09ICdzY3JpcHQnIHx8IHRhZ05hbWUgPT09ICdzdHlsZScpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgXG4gICAgbGV0IGF0dHJzID0gY29udmVydEF0dHJpYnV0ZXMobm9kZSwgY29udGV4dCk7XG5cbiAgICAvLyBEZXNpZ24tc3lzdGVtIC5idXR0b24gbGlua3Mg4oaSIDxzcGFuLmhhbmRvZmYtY2FudmFzLWJ1dHRvbj4gZm9yIGVkaXRvciBSaWNoVGV4dCArIHN0eWxpbmcuXG4gICAgKHsgdGFnTmFtZSwgYXR0cnMgfSA9IGNvbnZlcnREZXNpZ25TeXN0ZW1BbmNob3JGb3JFZGl0b3IodGFnTmFtZSwgYXR0cnMsIGNvbnRleHQpKTtcblxuICAgIC8vIE90aGVyIGFuY2hvcnM6IHN0cmlwIGhyZWYgc28gdGhlIGVkaXRvciBkb2VzIG5vdCBuYXZpZ2F0ZSBhd2F5IHdoaWxlIGVkaXRpbmcuXG4gICAgaWYgKHRhZ05hbWUgPT09ICdhJykge1xuICAgICAgYXR0cnMgPSBhdHRycy5yZXBsYWNlKC9cXHMqaHJlZj1cXHtbXn1dK1xcfS9nLCAnJykucmVwbGFjZSgvXFxzKmhyZWY9XCJbXlwiXSpcIi9nLCAnJykudHJpbSgpO1xuICAgIH1cblxuICAgIGNvbnN0IGF0dHJTdHIgPSBhdHRycyA/IGAgJHthdHRyc31gIDogJyc7XG4gICAgXG4gICAgLy8gSGFuZGxlIHNlbGYtY2xvc2luZyB0YWdzXG4gICAgaWYgKGlzU2VsZkNsb3NpbmcodGFnTmFtZSkpIHtcbiAgICAgIHJldHVybiBgPCR7dGFnTmFtZX0ke2F0dHJTdHJ9IC8+YDtcbiAgICB9XG4gICAgXG4gICAgLy8gUHJvY2VzcyBjaGlsZHJlblxuICAgIGNvbnN0IGNoaWxkcmVuID0gbm9kZS5jaGlsZE5vZGVzXG4gICAgICAubWFwKGNoaWxkID0+IG5vZGVUb0pzeChjaGlsZCwgY29udGV4dCwgZWZmZWN0aXZlTG9vcFZhcikpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbignXFxuJyk7XG4gICAgXG4gICAgaWYgKCFjaGlsZHJlbikge1xuICAgICAgcmV0dXJuIGA8JHt0YWdOYW1lfSR7YXR0clN0cn0+PC8ke3RhZ05hbWV9PmA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBgPCR7dGFnTmFtZX0ke2F0dHJTdHJ9PlxcbiR7Y2hpbGRyZW59XFxuPC8ke3RhZ05hbWV9PmA7XG4gIH1cbiAgXG4gIHJldHVybiAnJztcbn07XG4iXX0=