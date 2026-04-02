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
        const tagName = node.tagName?.toLowerCase();
        if (!tagName) {
            return node.childNodes.map(child => (0, exports.nodeToJsx)(child, context, effectiveLoopVar)).join('\n');
        }
        // Skip script and style tags
        if (tagName === 'script' || tagName === 'style') {
            return '';
        }
        let attrs = (0, attributes_1.convertAttributes)(node, context);
        // For anchor tags, remove href to prevent navigation in the editor
        // This allows clicks to work normally for editing content inside links
        if (tagName === 'a') {
            // Remove href attribute - it will be a non-navigating anchor in the editor
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1jb252ZXJ0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9ub2RlLWNvbnZlcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILHVEQUErRDtBQUUvRCwyQ0FBeUQ7QUFDekQsbUNBQXdDO0FBQ3hDLDJEQUEwRDtBQUMxRCw2Q0FBaUQ7QUFFakQ7O0dBRUc7QUFDSSxNQUFNLGtCQUFrQixHQUFHLENBQUMsSUFBWSxFQUFFLE9BQTBCLEVBQUUsVUFBa0IsTUFBTSxFQUFVLEVBQUU7SUFDL0csSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFBRSxPQUFPLEVBQUUsQ0FBQztJQUU1QixJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUM7SUFFbEIsbUVBQW1FO0lBQ25FLGtFQUFrRTtJQUNsRSx1RkFBdUY7SUFDdkYsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQ3JCLDZCQUE2QixFQUM3QixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNkLE1BQU0sVUFBVSxHQUFHLElBQUEsdUNBQW1CLEVBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN0RSxrRUFBa0U7UUFDbEUsT0FBTyxTQUFTLHNDQUEwQixLQUFLLFVBQVUsTUFBTSxDQUFDO0lBQ2xFLENBQUMsQ0FDRixDQUFDO0lBRUYsc0RBQXNEO0lBQ3RELHlDQUF5QztJQUN6QyxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDckIsa0NBQWtDLEVBQ2xDLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ2QsTUFBTSxVQUFVLEdBQUcsSUFBQSx1Q0FBbUIsRUFBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3RFLE9BQU8sSUFBSSxVQUFVLEdBQUcs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RUQsT0FBTyxFQUFFLENBQUM7QUFDWixDQUFDLENBQUM7QUFwRFcsUUFBQSxTQUFTLGFBb0RwQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTm9kZSBjb252ZXJzaW9uIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBIVE1MRWxlbWVudCwgVGV4dE5vZGUsIE5vZGUgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0IH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBEQU5HRVJPVVNfSFRNTF9QTEFDRUhPTERFUiB9IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCB7IGlzU2VsZkNsb3NpbmcgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IHRyYW5zcGlsZUV4cHJlc3Npb24gfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcbmltcG9ydCB7IGNvbnZlcnRBdHRyaWJ1dGVzIH0gZnJvbSAnLi9hdHRyaWJ1dGVzJztcblxuLyoqXG4gKiBQcm9jZXNzIGhhbmRsZWJhcnMgZXhwcmVzc2lvbnMgaW4gdGV4dFxuICovXG5leHBvcnQgY29uc3QgcHJvY2Vzc1RleHRDb250ZW50ID0gKHRleHQ6IHN0cmluZywgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQsIGxvb3BWYXI6IHN0cmluZyA9ICdpdGVtJyk6IHN0cmluZyA9PiB7XG4gIGlmICghdGV4dC50cmltKCkpIHJldHVybiAnJztcbiAgXG4gIGxldCByZXN1bHQgPSB0ZXh0O1xuICBcbiAgLy8gRmlyc3QgaGFuZGxlIHRyaXBsZS1icmFjZSBleHByZXNzaW9ucyAodW5lc2NhcGVkIEhUTUwvcmljaCB0ZXh0KVxuICAvLyBDb252ZXJ0IHt7e2V4cHJlc3Npb259fX0gdG8gYSBzcGFuIHdpdGggZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUxcbiAgLy8gVXNlIGEgcGxhY2Vob2xkZXIgdG8gYXZvaWQgdGhlIGRvdWJsZS1icmFjZSByZWdleCBjb25zdW1pbmcgdGhlIHt7IF9faHRtbDogfX0gc3ludGF4XG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9cXHtcXHtcXHtcXHMqKFtefV0rPylcXHMqXFx9XFx9XFx9L2csXG4gICAgKG1hdGNoLCBleHByKSA9PiB7XG4gICAgICBjb25zdCB0cmFuc3BpbGVkID0gdHJhbnNwaWxlRXhwcmVzc2lvbihleHByLnRyaW0oKSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgICAvLyBVc2UgcGxhY2Vob2xkZXIgdGhhdCB3aWxsIGJlIHJlcGxhY2VkIGJhY2sgYWZ0ZXIgYWxsIHByb2Nlc3NpbmdcbiAgICAgIHJldHVybiBgPHNwYW4gJHtEQU5HRVJPVVNfSFRNTF9QTEFDRUhPTERFUn09XCIke3RyYW5zcGlsZWR9XCIgLz5gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIFRoZW4gaGFuZGxlIGRvdWJsZS1icmFjZSBleHByZXNzaW9ucyAoZXNjYXBlZCB0ZXh0KVxuICAvLyBDb252ZXJ0IHt7ZXhwcmVzc2lvbn19IHRvIHtleHByZXNzaW9ufVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvXFx7XFx7K1xccyooW14jXFwvIV1bXn1dKj8pXFxzKlxcfStcXH0vZyxcbiAgICAobWF0Y2gsIGV4cHIpID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zcGlsZWQgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGV4cHIudHJpbSgpLCBjb250ZXh0LCBsb29wVmFyKTtcbiAgICAgIHJldHVybiBgeyR7dHJhbnNwaWxlZH19YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBSZXN0b3JlIGRhbmdlcm91c2x5U2V0SW5uZXJIVE1MIHdpdGggcHJvcGVyIEpTWCBzeW50YXhcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgbmV3IFJlZ0V4cChgJHtEQU5HRVJPVVNfSFRNTF9QTEFDRUhPTERFUn09XCIoW15cIl0rKVwiYCwgJ2cnKSxcbiAgICAoXywgZXhwcikgPT4gYGRhbmdlcm91c2x5U2V0SW5uZXJIVE1MPXt7IF9faHRtbDogJHtleHByfSB8fCAnJyB9fWBcbiAgKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIENvbnZlcnQgYW4gSFRNTCBub2RlIHRvIEpTWFxuICovXG5leHBvcnQgY29uc3Qgbm9kZVRvSnN4ID0gKG5vZGU6IE5vZGUsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0LCBsb29wVmFyPzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gVXNlIHByb3ZpZGVkIGxvb3BWYXIsIHRoZW4gY29udGV4dC5sb29wVmFyaWFibGUsIHRoZW4gZGVmYXVsdCB0byAnaXRlbSdcbiAgY29uc3QgZWZmZWN0aXZlTG9vcFZhciA9IGxvb3BWYXIgfHwgY29udGV4dC5sb29wVmFyaWFibGUgfHwgJ2l0ZW0nO1xuICBcbiAgaWYgKG5vZGUgaW5zdGFuY2VvZiBUZXh0Tm9kZSkge1xuICAgIGNvbnN0IHRleHQgPSBub2RlLnRleHQ7XG4gICAgaWYgKCF0ZXh0LnRyaW0oKSkgcmV0dXJuICcnO1xuICAgIHJldHVybiBwcm9jZXNzVGV4dENvbnRlbnQodGV4dCwgY29udGV4dCwgZWZmZWN0aXZlTG9vcFZhcik7XG4gIH1cbiAgXG4gIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCB0YWdOYW1lID0gbm9kZS50YWdOYW1lPy50b0xvd2VyQ2FzZSgpO1xuICAgIFxuICAgIGlmICghdGFnTmFtZSkge1xuICAgICAgcmV0dXJuIG5vZGUuY2hpbGROb2Rlcy5tYXAoY2hpbGQgPT4gbm9kZVRvSnN4KGNoaWxkLCBjb250ZXh0LCBlZmZlY3RpdmVMb29wVmFyKSkuam9pbignXFxuJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIFNraXAgc2NyaXB0IGFuZCBzdHlsZSB0YWdzXG4gICAgaWYgKHRhZ05hbWUgPT09ICdzY3JpcHQnIHx8IHRhZ05hbWUgPT09ICdzdHlsZScpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgXG4gICAgbGV0IGF0dHJzID0gY29udmVydEF0dHJpYnV0ZXMobm9kZSwgY29udGV4dCk7XG4gICAgXG4gICAgLy8gRm9yIGFuY2hvciB0YWdzLCByZW1vdmUgaHJlZiB0byBwcmV2ZW50IG5hdmlnYXRpb24gaW4gdGhlIGVkaXRvclxuICAgIC8vIFRoaXMgYWxsb3dzIGNsaWNrcyB0byB3b3JrIG5vcm1hbGx5IGZvciBlZGl0aW5nIGNvbnRlbnQgaW5zaWRlIGxpbmtzXG4gICAgaWYgKHRhZ05hbWUgPT09ICdhJykge1xuICAgICAgLy8gUmVtb3ZlIGhyZWYgYXR0cmlidXRlIC0gaXQgd2lsbCBiZSBhIG5vbi1uYXZpZ2F0aW5nIGFuY2hvciBpbiB0aGUgZWRpdG9yXG4gICAgICBhdHRycyA9IGF0dHJzLnJlcGxhY2UoL1xccypocmVmPVxce1tefV0rXFx9L2csICcnKS5yZXBsYWNlKC9cXHMqaHJlZj1cIlteXCJdKlwiL2csICcnKS50cmltKCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGF0dHJTdHIgPSBhdHRycyA/IGAgJHthdHRyc31gIDogJyc7XG4gICAgXG4gICAgLy8gSGFuZGxlIHNlbGYtY2xvc2luZyB0YWdzXG4gICAgaWYgKGlzU2VsZkNsb3NpbmcodGFnTmFtZSkpIHtcbiAgICAgIHJldHVybiBgPCR7dGFnTmFtZX0ke2F0dHJTdHJ9IC8+YDtcbiAgICB9XG4gICAgXG4gICAgLy8gUHJvY2VzcyBjaGlsZHJlblxuICAgIGNvbnN0IGNoaWxkcmVuID0gbm9kZS5jaGlsZE5vZGVzXG4gICAgICAubWFwKGNoaWxkID0+IG5vZGVUb0pzeChjaGlsZCwgY29udGV4dCwgZWZmZWN0aXZlTG9vcFZhcikpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbignXFxuJyk7XG4gICAgXG4gICAgaWYgKCFjaGlsZHJlbikge1xuICAgICAgcmV0dXJuIGA8JHt0YWdOYW1lfSR7YXR0clN0cn0+PC8ke3RhZ05hbWV9PmA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBgPCR7dGFnTmFtZX0ke2F0dHJTdHJ9PlxcbiR7Y2hpbGRyZW59XFxuPC8ke3RhZ05hbWV9PmA7XG4gIH1cbiAgXG4gIHJldHVybiAnJztcbn07XG4iXX0=