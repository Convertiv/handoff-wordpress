"use strict";
/**
 * Expression parsing utilities for Handlebars to JSX transpilation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHelperExpression = exports.transpileExpression = exports.resolveParentPropertiesInExpression = void 0;
const utils_1 = require("./utils");
/**
 * Transpile a Handlebars path expression to JSX
 */
/**
 * Replace every occurrence of ../properties.xxx (parent context) in an expression
 * with the JSX form (camelCase). Used for compound expressions like
 * {{../properties.columnCount === "three" ? 'a' : 'b'}} inside loops.
 * Exported for use in attribute conversion.
 */
const resolveParentPropertiesInExpression = (expr) => {
    return expr.replace(/\.\.\/+properties\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g, (_match, path) => {
        const parts = path.split('.');
        const first = (0, utils_1.toCamelCase)(parts[0]);
        return parts.length > 1 ? `${first}?.${parts.slice(1).join('?.')}` : first;
    });
};
exports.resolveParentPropertiesInExpression = resolveParentPropertiesInExpression;
const transpileExpression = (expr, context, loopVar = 'item') => {
    expr = expr.trim();
    // Handle triple braces (unescaped) - strip the extra brace
    expr = expr.replace(/^\{+|\}+$/g, '');
    // Resolve ALL ../properties.xxx in the expression (for compound expressions like ternaries)
    expr = (0, exports.resolveParentPropertiesInExpression)(expr);
    // Handle ../ parent context references - strip the ../ prefix(es) and process as top-level
    // This allows accessing parent context from inside loops: ../properties.xxx -> properties.xxx
    // Multiple levels like ../../properties.xxx are also handled
    while (expr.startsWith('../')) {
        expr = expr.substring(3);
    }
    // Handle simple {{this}} - refers to current item in scalar array
    if (expr === 'this') {
        return loopVar;
    }
    // Handle properties.xxx.yyy
    if (expr.startsWith('properties.')) {
        const parts = expr.replace('properties.', '').split('.');
        const propName = (0, utils_1.toCamelCase)(parts[0]);
        if (parts.length > 1) {
            // Keep 'src' as-is to match Handoff's image property naming
            return `${propName}?.${parts.slice(1).join('?.')}`;
        }
        return propName;
    }
    // Handle this.xxx (inside loops)
    if (expr.startsWith('this.')) {
        const path = expr.replace('this.', '');
        if (path.includes('.')) {
            const parts = path.split('.');
            return `${loopVar}.${parts.join('?.')}`;
        }
        return `${loopVar}.${path}`;
    }
    // Handle @index, @first, @last
    if (expr === '@index') {
        return 'index';
    }
    if (expr === '@first') {
        return 'index === 0';
    }
    if (expr === '@last') {
        const arrayName = context.loopArray || 'items';
        return `index === ${arrayName}?.length - 1`;
    }
    return expr;
};
exports.transpileExpression = transpileExpression;
/**
 * Parse Handlebars helper expressions like (eq properties.layout "layout-1")
 * and convert to JavaScript comparison expressions
 */
const parseHelperExpression = (expr) => {
    // Normalize ../properties.xxx in the expression first
    expr = (0, exports.resolveParentPropertiesInExpression)(expr);
    // Match (eq left right) or (eq left "string")
    const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (eqMatch) {
        const [, left, right] = eqMatch;
        // Convert the left side (e.g., properties.layout -> layout)
        let leftExpr = left;
        if (left.startsWith('properties.')) {
            leftExpr = (0, utils_1.toCamelCase)(left.replace('properties.', ''));
        }
        else if (left.startsWith('this.')) {
            leftExpr = `item.${left.replace('this.', '')}`;
        }
        return `${leftExpr} === "${right}"`;
    }
    // Match (eq left variable) without quotes
    const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (eqVarMatch) {
        const [, left, right] = eqVarMatch;
        let leftExpr = left;
        let rightExpr = right;
        if (left.startsWith('properties.')) {
            leftExpr = (0, utils_1.toCamelCase)(left.replace('properties.', ''));
        }
        else if (left.startsWith('this.')) {
            leftExpr = `item.${left.replace('this.', '')}`;
        }
        if (right.startsWith('properties.')) {
            rightExpr = (0, utils_1.toCamelCase)(right.replace('properties.', ''));
        }
        else if (right.startsWith('this.')) {
            rightExpr = `item.${right.replace('this.', '')}`;
        }
        return `${leftExpr} === ${rightExpr}`;
    }
    // Match (ne left "string") - not equal
    const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (neMatch) {
        const [, left, right] = neMatch;
        let leftExpr = left;
        if (left.startsWith('properties.')) {
            leftExpr = (0, utils_1.toCamelCase)(left.replace('properties.', ''));
        }
        else if (left.startsWith('this.')) {
            leftExpr = `item.${left.replace('this.', '')}`;
        }
        return `${leftExpr} !== "${right}"`;
    }
    // Match (gt left right) - greater than
    const gtMatch = expr.match(/^\(\s*gt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (gtMatch) {
        const [, left, right] = gtMatch;
        let leftExpr = left.startsWith('properties.') ? (0, utils_1.toCamelCase)(left.replace('properties.', '')) : left;
        let rightExpr = right.startsWith('properties.') ? (0, utils_1.toCamelCase)(right.replace('properties.', '')) : right;
        return `${leftExpr} > ${rightExpr}`;
    }
    // Match (lt left right) - less than
    const ltMatch = expr.match(/^\(\s*lt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (ltMatch) {
        const [, left, right] = ltMatch;
        let leftExpr = left.startsWith('properties.') ? (0, utils_1.toCamelCase)(left.replace('properties.', '')) : left;
        let rightExpr = right.startsWith('properties.') ? (0, utils_1.toCamelCase)(right.replace('properties.', '')) : right;
        return `${leftExpr} < ${rightExpr}`;
    }
    // Match (gte left right) - greater than or equal
    const gteMatch = expr.match(/^\(\s*gte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (gteMatch) {
        const [, left, right] = gteMatch;
        let leftExpr = left.startsWith('properties.') ? (0, utils_1.toCamelCase)(left.replace('properties.', '')) : left;
        let rightExpr = right.startsWith('properties.') ? (0, utils_1.toCamelCase)(right.replace('properties.', '')) : right;
        return `${leftExpr} >= ${rightExpr}`;
    }
    // Match (lte left right) - less than or equal
    const lteMatch = expr.match(/^\(\s*lte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (lteMatch) {
        const [, left, right] = lteMatch;
        let leftExpr = left.startsWith('properties.') ? (0, utils_1.toCamelCase)(left.replace('properties.', '')) : left;
        let rightExpr = right.startsWith('properties.') ? (0, utils_1.toCamelCase)(right.replace('properties.', '')) : right;
        return `${leftExpr} <= ${rightExpr}`;
    }
    // Match (and expr1 expr2) - logical and
    const andMatch = expr.match(/^\(\s*and\s+(.+)\s+(.+)\s*\)$/);
    if (andMatch) {
        const [, left, right] = andMatch;
        const leftExpr = (0, exports.parseHelperExpression)(left.trim()) || left.trim();
        const rightExpr = (0, exports.parseHelperExpression)(right.trim()) || right.trim();
        return `(${leftExpr}) && (${rightExpr})`;
    }
    // Match (or expr1 expr2) - logical or
    const orMatch = expr.match(/^\(\s*or\s+(.+)\s+(.+)\s*\)$/);
    if (orMatch) {
        const [, left, right] = orMatch;
        const leftExpr = (0, exports.parseHelperExpression)(left.trim()) || left.trim();
        const rightExpr = (0, exports.parseHelperExpression)(right.trim()) || right.trim();
        return `(${leftExpr}) || (${rightExpr})`;
    }
    // Match (not expr) - logical not
    const notMatch = expr.match(/^\(\s*not\s+(.+)\s*\)$/);
    if (notMatch) {
        const [, inner] = notMatch;
        const innerExpr = (0, exports.parseHelperExpression)(inner.trim()) || inner.trim();
        return `!(${innerExpr})`;
    }
    // Not a recognized helper, return empty string
    return '';
};
exports.parseHelperExpression = parseHelperExpression;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwcmVzc2lvbi1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9leHByZXNzaW9uLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUdILG1DQUFzQztBQUV0Qzs7R0FFRztBQUNIOzs7OztHQUtHO0FBQ0ksTUFBTSxtQ0FBbUMsR0FBRyxDQUFDLElBQVksRUFBVSxFQUFFO0lBQzFFLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FDakIsMkVBQTJFLEVBQzNFLENBQUMsTUFBTSxFQUFFLElBQVksRUFBRSxFQUFFO1FBQ3ZCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsSUFBQSxtQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxLQUFLLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUM3RSxDQUFDLENBQ0YsQ0FBQztBQUNKLENBQUMsQ0FBQztBQVRXLFFBQUEsbUNBQW1DLHVDQVM5QztBQUVLLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxJQUFZLEVBQUUsT0FBMEIsRUFBRSxVQUFrQixNQUFNLEVBQVUsRUFBRTtJQUNoSCxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBRW5CLDJEQUEyRDtJQUMzRCxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFdEMsNEZBQTRGO0lBQzVGLElBQUksR0FBRyxJQUFBLDJDQUFtQyxFQUFDLElBQUksQ0FB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QUFLLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEUsT0FBTyxLQUFLLFNBQVMsR0FBRyxDQUFDO0lBQzNCLENBQUM7SUFFRCwrQ0FBK0M7SUFDL0MsT0FBTyxFQUFFLENBQUM7QUFDWixDQUFDLENBQUM7QUFwSFcsUUFBQSxxQkFBcUIseUJBb0hoQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRXhwcmVzc2lvbiBwYXJzaW5nIHV0aWxpdGllcyBmb3IgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxhdGlvblxuICovXG5cbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0IH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuXG4vKipcbiAqIFRyYW5zcGlsZSBhIEhhbmRsZWJhcnMgcGF0aCBleHByZXNzaW9uIHRvIEpTWFxuICovXG4vKipcbiAqIFJlcGxhY2UgZXZlcnkgb2NjdXJyZW5jZSBvZiAuLi9wcm9wZXJ0aWVzLnh4eCAocGFyZW50IGNvbnRleHQpIGluIGFuIGV4cHJlc3Npb25cbiAqIHdpdGggdGhlIEpTWCBmb3JtIChjYW1lbENhc2UpLiBVc2VkIGZvciBjb21wb3VuZCBleHByZXNzaW9ucyBsaWtlXG4gKiB7ey4uL3Byb3BlcnRpZXMuY29sdW1uQ291bnQgPT09IFwidGhyZWVcIiA/ICdhJyA6ICdiJ319IGluc2lkZSBsb29wcy5cbiAqIEV4cG9ydGVkIGZvciB1c2UgaW4gYXR0cmlidXRlIGNvbnZlcnNpb24uXG4gKi9cbmV4cG9ydCBjb25zdCByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbiA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZXhwci5yZXBsYWNlKFxuICAgIC9cXC5cXC5cXC8rcHJvcGVydGllc1xcLihbYS16QS1aX11bYS16QS1aMC05X10qKD86XFwuW2EtekEtWl9dW2EtekEtWjAtOV9dKikqKS9nLFxuICAgIChfbWF0Y2gsIHBhdGg6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBmaXJzdCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICAgIHJldHVybiBwYXJ0cy5sZW5ndGggPiAxID8gYCR7Zmlyc3R9Py4ke3BhcnRzLnNsaWNlKDEpLmpvaW4oJz8uJyl9YCA6IGZpcnN0O1xuICAgIH1cbiAgKTtcbn07XG5cbmV4cG9ydCBjb25zdCB0cmFuc3BpbGVFeHByZXNzaW9uID0gKGV4cHI6IHN0cmluZywgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQsIGxvb3BWYXI6IHN0cmluZyA9ICdpdGVtJyk6IHN0cmluZyA9PiB7XG4gIGV4cHIgPSBleHByLnRyaW0oKTtcbiAgXG4gIC8vIEhhbmRsZSB0cmlwbGUgYnJhY2VzICh1bmVzY2FwZWQpIC0gc3RyaXAgdGhlIGV4dHJhIGJyYWNlXG4gIGV4cHIgPSBleHByLnJlcGxhY2UoL15cXHsrfFxcfSskL2csICcnKTtcbiAgXG4gIC8vIFJlc29sdmUgQUxMIC4uL3Byb3BlcnRpZXMueHh4IGluIHRoZSBleHByZXNzaW9uIChmb3IgY29tcG91bmQgZXhwcmVzc2lvbnMgbGlrZSB0ZXJuYXJpZXMpXG4gIGV4cHIgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihleHByKTtcbiAgXG4gIC8vIEhhbmRsZSAuLi8gcGFyZW50IGNvbnRleHQgcmVmZXJlbmNlcyAtIHN0cmlwIHRoZSAuLi8gcHJlZml4KGVzKSBhbmQgcHJvY2VzcyBhcyB0b3AtbGV2ZWxcbiAgLy8gVGhpcyBhbGxvd3MgYWNjZXNzaW5nIHBhcmVudCBjb250ZXh0IGZyb20gaW5zaWRlIGxvb3BzOiAuLi9wcm9wZXJ0aWVzLnh4eCAtPiBwcm9wZXJ0aWVzLnh4eFxuICAvLyBNdWx0aXBsZSBsZXZlbHMgbGlrZSAuLi8uLi9wcm9wZXJ0aWVzLnh4eCBhcmUgYWxzbyBoYW5kbGVkXG4gIHdoaWxlIChleHByLnN0YXJ0c1dpdGgoJy4uLycpKSB7XG4gICAgZXhwciA9IGV4cHIuc3Vic3RyaW5nKDMpO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgc2ltcGxlIHt7dGhpc319IC0gcmVmZXJzIHRvIGN1cnJlbnQgaXRlbSBpbiBzY2FsYXIgYXJyYXlcbiAgaWYgKGV4cHIgPT09ICd0aGlzJykge1xuICAgIHJldHVybiBsb29wVmFyO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgcHJvcGVydGllcy54eHgueXl5XG4gIGlmIChleHByLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICBjb25zdCBwYXJ0cyA9IGV4cHIucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBwcm9wTmFtZSA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgLy8gS2VlcCAnc3JjJyBhcy1pcyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nXG4gICAgICByZXR1cm4gYCR7cHJvcE5hbWV9Py4ke3BhcnRzLnNsaWNlKDEpLmpvaW4oJz8uJyl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHByb3BOYW1lO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgdGhpcy54eHggKGluc2lkZSBsb29wcylcbiAgaWYgKGV4cHIuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgIGNvbnN0IHBhdGggPSBleHByLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgIGlmIChwYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgcmV0dXJuIGAke2xvb3BWYXJ9LiR7cGFydHMuam9pbignPy4nKX1gO1xuICAgIH1cbiAgICByZXR1cm4gYCR7bG9vcFZhcn0uJHtwYXRofWA7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBAaW5kZXgsIEBmaXJzdCwgQGxhc3RcbiAgaWYgKGV4cHIgPT09ICdAaW5kZXgnKSB7XG4gICAgcmV0dXJuICdpbmRleCc7XG4gIH1cbiAgaWYgKGV4cHIgPT09ICdAZmlyc3QnKSB7XG4gICAgcmV0dXJuICdpbmRleCA9PT0gMCc7XG4gIH1cbiAgaWYgKGV4cHIgPT09ICdAbGFzdCcpIHtcbiAgICBjb25zdCBhcnJheU5hbWUgPSBjb250ZXh0Lmxvb3BBcnJheSB8fCAnaXRlbXMnO1xuICAgIHJldHVybiBgaW5kZXggPT09ICR7YXJyYXlOYW1lfT8ubGVuZ3RoIC0gMWA7XG4gIH1cbiAgXG4gIHJldHVybiBleHByO1xufTtcblxuLyoqXG4gKiBQYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gKiBhbmQgY29udmVydCB0byBKYXZhU2NyaXB0IGNvbXBhcmlzb24gZXhwcmVzc2lvbnNcbiAqL1xuZXhwb3J0IGNvbnN0IHBhcnNlSGVscGVyRXhwcmVzc2lvbiA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAvLyBOb3JtYWxpemUgLi4vcHJvcGVydGllcy54eHggaW4gdGhlIGV4cHJlc3Npb24gZmlyc3RcbiAgZXhwciA9IHJlc29sdmVQYXJlbnRQcm9wZXJ0aWVzSW5FeHByZXNzaW9uKGV4cHIpO1xuICAvLyBNYXRjaCAoZXEgbGVmdCByaWdodCkgb3IgKGVxIGxlZnQgXCJzdHJpbmdcIilcbiAgY29uc3QgZXFNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gIGlmIChlcU1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFNYXRjaDtcbiAgICAvLyBDb252ZXJ0IHRoZSBsZWZ0IHNpZGUgKGUuZy4sIHByb3BlcnRpZXMubGF5b3V0IC0+IGxheW91dClcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSk7XG4gICAgfSBlbHNlIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gYGl0ZW0uJHtsZWZ0LnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPT09IFwiJHtyaWdodH1cImA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChlcSBsZWZ0IHZhcmlhYmxlKSB3aXRob3V0IHF1b3Rlc1xuICBjb25zdCBlcVZhck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChlcVZhck1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZXFWYXJNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgIGxldCByaWdodEV4cHIgPSByaWdodDtcbiAgICBcbiAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpO1xuICAgIH0gZWxzZSBpZiAobGVmdC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IGBpdGVtLiR7bGVmdC5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICBcbiAgICBpZiAocmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgcmlnaHRFeHByID0gdG9DYW1lbENhc2UocmlnaHQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpO1xuICAgIH0gZWxzZSBpZiAocmlnaHQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgcmlnaHRFeHByID0gYGl0ZW0uJHtyaWdodC5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID09PSAke3JpZ2h0RXhwcn1gO1xuICB9XG4gIFxuICAvLyBNYXRjaCAobmUgbGVmdCBcInN0cmluZ1wiKSAtIG5vdCBlcXVhbFxuICBjb25zdCBuZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypuZVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgaWYgKG5lTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBuZU1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQ7XG4gICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICB9IGVsc2UgaWYgKGxlZnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSBgaXRlbS4ke2xlZnQucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSAhPT0gXCIke3JpZ2h0fVwiYDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGd0IGxlZnQgcmlnaHQpIC0gZ3JlYXRlciB0aGFuXG4gIGNvbnN0IGd0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmd0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgaWYgKGd0TWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBndE1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IHJpZ2h0O1xuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPiAke3JpZ2h0RXhwcn1gO1xuICB9XG4gIFxuICAvLyBNYXRjaCAobHQgbGVmdCByaWdodCkgLSBsZXNzIHRoYW5cbiAgY29uc3QgbHRNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbHRcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAobHRNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGx0TWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiBsZWZ0O1xuICAgIGxldCByaWdodEV4cHIgPSByaWdodC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UocmlnaHQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogcmlnaHQ7XG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA8ICR7cmlnaHRFeHByfWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChndGUgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW4gb3IgZXF1YWxcbiAgY29uc3QgZ3RlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmd0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChndGVNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0ZU1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IHJpZ2h0O1xuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPj0gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGx0ZSBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhbiBvciBlcXVhbFxuICBjb25zdCBsdGVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbHRlXFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgaWYgKGx0ZU1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRlTWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiBsZWZ0O1xuICAgIGxldCByaWdodEV4cHIgPSByaWdodC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UocmlnaHQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogcmlnaHQ7XG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA8PSAke3JpZ2h0RXhwcn1gO1xuICB9XG4gIFxuICAvLyBNYXRjaCAoYW5kIGV4cHIxIGV4cHIyKSAtIGxvZ2ljYWwgYW5kXG4gIGNvbnN0IGFuZE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyphbmRcXHMrKC4rKVxccysoLispXFxzKlxcKSQvKTtcbiAgaWYgKGFuZE1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gYW5kTWF0Y2g7XG4gICAgY29uc3QgbGVmdEV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24obGVmdC50cmltKCkpIHx8IGxlZnQudHJpbSgpO1xuICAgIGNvbnN0IHJpZ2h0RXhwciA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihyaWdodC50cmltKCkpIHx8IHJpZ2h0LnRyaW0oKTtcbiAgICByZXR1cm4gYCgke2xlZnRFeHByfSkgJiYgKCR7cmlnaHRFeHByfSlgO1xuICB9XG4gIFxuICAvLyBNYXRjaCAob3IgZXhwcjEgZXhwcjIpIC0gbG9naWNhbCBvclxuICBjb25zdCBvck1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypvclxccysoLispXFxzKyguKylcXHMqXFwpJC8pO1xuICBpZiAob3JNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG9yTWF0Y2g7XG4gICAgY29uc3QgbGVmdEV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24obGVmdC50cmltKCkpIHx8IGxlZnQudHJpbSgpO1xuICAgIGNvbnN0IHJpZ2h0RXhwciA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihyaWdodC50cmltKCkpIHx8IHJpZ2h0LnRyaW0oKTtcbiAgICByZXR1cm4gYCgke2xlZnRFeHByfSkgfHwgKCR7cmlnaHRFeHByfSlgO1xuICB9XG4gIFxuICAvLyBNYXRjaCAobm90IGV4cHIpIC0gbG9naWNhbCBub3RcbiAgY29uc3Qgbm90TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm5vdFxccysoLispXFxzKlxcKSQvKTtcbiAgaWYgKG5vdE1hdGNoKSB7XG4gICAgY29uc3QgWywgaW5uZXJdID0gbm90TWF0Y2g7XG4gICAgY29uc3QgaW5uZXJFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGlubmVyLnRyaW0oKSkgfHwgaW5uZXIudHJpbSgpO1xuICAgIHJldHVybiBgISgke2lubmVyRXhwcn0pYDtcbiAgfVxuICBcbiAgLy8gTm90IGEgcmVjb2duaXplZCBoZWxwZXIsIHJldHVybiBlbXB0eSBzdHJpbmdcbiAgcmV0dXJuICcnO1xufTtcbiJdfQ==