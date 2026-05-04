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
 * Also handles @root.properties.xxx which is semantically equivalent to the
 * root-context properties.xxx (standard Handlebars data variable).
 * Exported for use in attribute conversion.
 */
const resolveParentPropertiesInExpression = (expr) => {
    const resolve = (_match, path) => {
        const parts = path.split('.');
        const first = (0, utils_1.toCamelCase)(parts[0]);
        return parts.length > 1 ? `${first}?.${parts.slice(1).join('?.')}` : first;
    };
    let result = expr.replace(/\.\.\/+properties\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g, resolve);
    result = result.replace(/@root\.properties\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g, resolve);
    return result;
};
exports.resolveParentPropertiesInExpression = resolveParentPropertiesInExpression;
const transpileExpression = (expr, context, loopVar = 'item') => {
    expr = expr.trim();
    // Handle triple braces (unescaped) - strip the extra brace
    expr = expr.replace(/^\{+|\}+$/g, '');
    // Resolve ALL ../properties.xxx and @root.properties.xxx in the expression (for compound expressions like ternaries)
    expr = (0, exports.resolveParentPropertiesInExpression)(expr);
    // Handle ../ parent context references - strip the ../ prefix(es) and process as top-level
    // This allows accessing parent context from inside loops: ../properties.xxx -> properties.xxx
    // Multiple levels like ../../properties.xxx are also handled
    while (expr.startsWith('../')) {
        expr = expr.substring(3);
    }
    // Handle @root. prefix - resolves from the top-level context regardless of nesting depth
    // e.g. @root.properties.xxx -> properties.xxx
    if (expr.startsWith('@root.')) {
        expr = expr.substring(6);
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
    // Normalize ../properties.xxx and @root.properties.xxx in the expression first
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwcmVzc2lvbi1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9leHByZXNzaW9uLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUdILG1DQUFzQztBQUV0Qzs7R0FFRztBQUNIOzs7Ozs7O0dBT0c7QUFDSSxNQUFNLG1DQUFtQyxHQUFHLENBQUMsSUFBWSxFQUFVLEVBQUU7SUFDMUUsTUFBTSxPQUFPLEdBQUcsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLEVBQUU7UUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QixNQUFNLEtBQUssR0FBRyxJQUFBLG1CQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEMsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQzdFLENBQUMsQ0FBQztJQUNGLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQ3ZCLDJFQUEyRSxFQUMzRSxPQUFPLENBQ1IsQ0FBQztJQUNGLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUNyQiwyRUFBMkUsRUFDM0UsT0FBTyxDQUNSLENBQUM7SUFDRixPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDLENBQUM7QUFmVyxRQUFBLG1DQUFtQyx1Q0FlOUM7QUFFSyxNQUFNLG1CQUFtQixHQUFHLENBQUMsSUFBWSxFQUFFLE9BQTBCLEVBQUUsVUFBa0IsTUFBTSxFQUFVLEVBQUU7SUFDaEgsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJ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QUMsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEUsT0FBTyxJQUFJLFFBQVEsU0FBUyxTQUFTLEdBQUcsQ0FBQztJQUMzQyxDQUFDO0lBRUQsaUNBQWlDO0lBQ2pDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUN0RCxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2IsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsUUFBUSxDQUFDO1FBQzNCLE1BQU0sU0FBUyxHQUFHLElBQUEsNkJBQXFCLEVBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RFLE9BQU8sS0FBSyxTQUFTLEdBQUcsQ0FBQztJQUMzQixDQUFDO0lBRUQsK0NBQStDO0lBQy9DLE9BQU8sRUFBRSxDQUFDO0FBQ1osQ0FBQyxDQUFDO0FBcEhXLFFBQUEscUJBQXFCLHlCQW9IaEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEV4cHJlc3Npb24gcGFyc2luZyB1dGlsaXRpZXMgZm9yIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsYXRpb25cbiAqL1xuXG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UgfSBmcm9tICcuL3V0aWxzJztcblxuLyoqXG4gKiBUcmFuc3BpbGUgYSBIYW5kbGViYXJzIHBhdGggZXhwcmVzc2lvbiB0byBKU1hcbiAqL1xuLyoqXG4gKiBSZXBsYWNlIGV2ZXJ5IG9jY3VycmVuY2Ugb2YgLi4vcHJvcGVydGllcy54eHggKHBhcmVudCBjb250ZXh0KSBpbiBhbiBleHByZXNzaW9uXG4gKiB3aXRoIHRoZSBKU1ggZm9ybSAoY2FtZWxDYXNlKS4gVXNlZCBmb3IgY29tcG91bmQgZXhwcmVzc2lvbnMgbGlrZVxuICoge3suLi9wcm9wZXJ0aWVzLmNvbHVtbkNvdW50ID09PSBcInRocmVlXCIgPyAnYScgOiAnYid9fSBpbnNpZGUgbG9vcHMuXG4gKiBBbHNvIGhhbmRsZXMgQHJvb3QucHJvcGVydGllcy54eHggd2hpY2ggaXMgc2VtYW50aWNhbGx5IGVxdWl2YWxlbnQgdG8gdGhlXG4gKiByb290LWNvbnRleHQgcHJvcGVydGllcy54eHggKHN0YW5kYXJkIEhhbmRsZWJhcnMgZGF0YSB2YXJpYWJsZSkuXG4gKiBFeHBvcnRlZCBmb3IgdXNlIGluIGF0dHJpYnV0ZSBjb252ZXJzaW9uLlxuICovXG5leHBvcnQgY29uc3QgcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24gPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcmVzb2x2ZSA9IChfbWF0Y2g6IHN0cmluZywgcGF0aDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3QgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDEgPyBgJHtmaXJzdH0/LiR7cGFydHMuc2xpY2UoMSkuam9pbignPy4nKX1gIDogZmlyc3Q7XG4gIH07XG4gIGxldCByZXN1bHQgPSBleHByLnJlcGxhY2UoXG4gICAgL1xcLlxcLlxcLytwcm9wZXJ0aWVzXFwuKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05X10qKSopL2csXG4gICAgcmVzb2x2ZVxuICApO1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvQHJvb3RcXC5wcm9wZXJ0aWVzXFwuKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05X10qKSopL2csXG4gICAgcmVzb2x2ZVxuICApO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuZXhwb3J0IGNvbnN0IHRyYW5zcGlsZUV4cHJlc3Npb24gPSAoZXhwcjogc3RyaW5nLCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCwgbG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nKTogc3RyaW5nID0+IHtcbiAgZXhwciA9IGV4cHIudHJpbSgpO1xuICBcbiAgLy8gSGFuZGxlIHRyaXBsZSBicmFjZXMgKHVuZXNjYXBlZCkgLSBzdHJpcCB0aGUgZXh0cmEgYnJhY2VcbiAgZXhwciA9IGV4cHIucmVwbGFjZSgvXlxceyt8XFx9KyQvZywgJycpO1xuICBcbiAgLy8gUmVzb2x2ZSBBTEwgLi4vcHJvcGVydGllcy54eHggYW5kIEByb290LnByb3BlcnRpZXMueHh4IGluIHRoZSBleHByZXNzaW9uIChmb3IgY29tcG91bmQgZXhwcmVzc2lvbnMgbGlrZSB0ZXJuYXJpZXMpXG4gIGV4cHIgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihleHByKTtcbiAgXG4gIC8vIEhhbmRsZSAuLi8gcGFyZW50IGNvbnRleHQgcmVmZXJlbmNlcyAtIHN0cmlwIHRoZSAuLi8gcHJlZml4KGVzKSBhbmQgcHJvY2VzcyBhcyB0b3AtbGV2ZWxcbiAgLy8gVGhpcyBhbGxvd3MgYWNjZXNzaW5nIHBhcmVudCBjb250ZXh0IGZyb20gaW5zaWRlIGxvb3BzOiAuLi9wcm9wZXJ0aWVzLnh4eCAtPiBwcm9wZXJ0aWVzLnh4eFxuICAvLyBNdWx0aXBsZSBsZXZlbHMgbGlrZSAuLi8uLi9wcm9wZXJ0aWVzLnh4eCBhcmUgYWxzbyBoYW5kbGVkXG4gIHdoaWxlIChleHByLnN0YXJ0c1dpdGgoJy4uLycpKSB7XG4gICAgZXhwciA9IGV4cHIuc3Vic3RyaW5nKDMpO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgQHJvb3QuIHByZWZpeCAtIHJlc29sdmVzIGZyb20gdGhlIHRvcC1sZXZlbCBjb250ZXh0IHJlZ2FyZGxlc3Mgb2YgbmVzdGluZyBkZXB0aFxuICAvLyBlLmcuIEByb290LnByb3BlcnRpZXMueHh4IC0+IHByb3BlcnRpZXMueHh4XG4gIGlmIChleHByLnN0YXJ0c1dpdGgoJ0Byb290LicpKSB7XG4gICAgZXhwciA9IGV4cHIuc3Vic3RyaW5nKDYpO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgc2ltcGxlIHt7dGhpc319IC0gcmVmZXJzIHRvIGN1cnJlbnQgaXRlbSBpbiBzY2FsYXIgYXJyYXlcbiAgaWYgKGV4cHIgPT09ICd0aGlzJykge1xuICAgIHJldHVybiBsb29wVmFyO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgcHJvcGVydGllcy54eHgueXl5XG4gIGlmIChleHByLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICBjb25zdCBwYXJ0cyA9IGV4cHIucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBwcm9wTmFtZSA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgLy8gS2VlcCAnc3JjJyBhcy1pcyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nXG4gICAgICByZXR1cm4gYCR7cHJvcE5hbWV9Py4ke3BhcnRzLnNsaWNlKDEpLmpvaW4oJz8uJyl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHByb3BOYW1lO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgdGhpcy54eHggKGluc2lkZSBsb29wcylcbiAgaWYgKGV4cHIuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgIGNvbnN0IHBhdGggPSBleHByLnJlcGxhY2UoJ3RoaXMuJywgJycpO1xuICAgIGlmIChwYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgcmV0dXJuIGAke2xvb3BWYXJ9LiR7cGFydHMuam9pbignPy4nKX1gO1xuICAgIH1cbiAgICByZXR1cm4gYCR7bG9vcFZhcn0uJHtwYXRofWA7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBAaW5kZXgsIEBmaXJzdCwgQGxhc3RcbiAgaWYgKGV4cHIgPT09ICdAaW5kZXgnKSB7XG4gICAgcmV0dXJuICdpbmRleCc7XG4gIH1cbiAgaWYgKGV4cHIgPT09ICdAZmlyc3QnKSB7XG4gICAgcmV0dXJuICdpbmRleCA9PT0gMCc7XG4gIH1cbiAgaWYgKGV4cHIgPT09ICdAbGFzdCcpIHtcbiAgICBjb25zdCBhcnJheU5hbWUgPSBjb250ZXh0Lmxvb3BBcnJheSB8fCAnaXRlbXMnO1xuICAgIHJldHVybiBgaW5kZXggPT09ICR7YXJyYXlOYW1lfT8ubGVuZ3RoIC0gMWA7XG4gIH1cbiAgXG4gIHJldHVybiBleHByO1xufTtcblxuLyoqXG4gKiBQYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gKiBhbmQgY29udmVydCB0byBKYXZhU2NyaXB0IGNvbXBhcmlzb24gZXhwcmVzc2lvbnNcbiAqL1xuZXhwb3J0IGNvbnN0IHBhcnNlSGVscGVyRXhwcmVzc2lvbiA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAvLyBOb3JtYWxpemUgLi4vcHJvcGVydGllcy54eHggYW5kIEByb290LnByb3BlcnRpZXMueHh4IGluIHRoZSBleHByZXNzaW9uIGZpcnN0XG4gIGV4cHIgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihleHByKTtcbiAgLy8gTWF0Y2ggKGVxIGxlZnQgcmlnaHQpIG9yIChlcSBsZWZ0IFwic3RyaW5nXCIpXG4gIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICBpZiAoZXFNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgLy8gQ29udmVydCB0aGUgbGVmdCBzaWRlIChlLmcuLCBwcm9wZXJ0aWVzLmxheW91dCAtPiBsYXlvdXQpXG4gICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpO1xuICAgIH0gZWxzZSBpZiAobGVmdC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IGBpdGVtLiR7bGVmdC5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID09PSBcIiR7cmlnaHR9XCJgO1xuICB9XG4gIFxuICAvLyBNYXRjaCAoZXEgbGVmdCB2YXJpYWJsZSkgd2l0aG91dCBxdW90ZXNcbiAgY29uc3QgZXFWYXJNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAoZXFWYXJNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxVmFyTWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQ7XG4gICAgXG4gICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICB9IGVsc2UgaWYgKGxlZnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSBgaXRlbS4ke2xlZnQucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgXG4gICAgaWYgKHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIHJpZ2h0RXhwciA9IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICB9IGVsc2UgaWYgKHJpZ2h0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIHJpZ2h0RXhwciA9IGBpdGVtLiR7cmlnaHQucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA9PT0gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJzdHJpbmdcIikgLSBub3QgZXF1YWxcbiAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gIGlmIChuZU1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSk7XG4gICAgfSBlbHNlIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gYGl0ZW0uJHtsZWZ0LnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gIT09IFwiJHtyaWdodH1cImA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChndCBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhblxuICBjb25zdCBndE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChndE1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiByaWdodDtcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID4gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGx0IGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuXG4gIGNvbnN0IGx0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgaWYgKGx0TWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdE1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IHJpZ2h0O1xuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPCAke3JpZ2h0RXhwcn1gO1xuICB9XG4gIFxuICAvLyBNYXRjaCAoZ3RlIGxlZnQgcmlnaHQpIC0gZ3JlYXRlciB0aGFuIG9yIGVxdWFsXG4gIGNvbnN0IGd0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAoZ3RlTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBndGVNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiByaWdodDtcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID49ICR7cmlnaHRFeHByfWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChsdGUgbGVmdCByaWdodCkgLSBsZXNzIHRoYW4gb3IgZXF1YWxcbiAgY29uc3QgbHRlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChsdGVNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGx0ZU1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IHJpZ2h0O1xuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPD0gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGFuZCBleHByMSBleHByMikgLSBsb2dpY2FsIGFuZFxuICBjb25zdCBhbmRNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqYW5kXFxzKyguKylcXHMrKC4rKVxccypcXCkkLyk7XG4gIGlmIChhbmRNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGFuZE1hdGNoO1xuICAgIGNvbnN0IGxlZnRFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGxlZnQudHJpbSgpKSB8fCBsZWZ0LnRyaW0oKTtcbiAgICBjb25zdCByaWdodEV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24ocmlnaHQudHJpbSgpKSB8fCByaWdodC50cmltKCk7XG4gICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0pICYmICgke3JpZ2h0RXhwcn0pYDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKG9yIGV4cHIxIGV4cHIyKSAtIGxvZ2ljYWwgb3JcbiAgY29uc3Qgb3JNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqb3JcXHMrKC4rKVxccysoLispXFxzKlxcKSQvKTtcbiAgaWYgKG9yTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBvck1hdGNoO1xuICAgIGNvbnN0IGxlZnRFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGxlZnQudHJpbSgpKSB8fCBsZWZ0LnRyaW0oKTtcbiAgICBjb25zdCByaWdodEV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24ocmlnaHQudHJpbSgpKSB8fCByaWdodC50cmltKCk7XG4gICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0pIHx8ICgke3JpZ2h0RXhwcn0pYDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKG5vdCBleHByKSAtIGxvZ2ljYWwgbm90XG4gIGNvbnN0IG5vdE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypub3RcXHMrKC4rKVxccypcXCkkLyk7XG4gIGlmIChub3RNYXRjaCkge1xuICAgIGNvbnN0IFssIGlubmVyXSA9IG5vdE1hdGNoO1xuICAgIGNvbnN0IGlubmVyRXhwciA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihpbm5lci50cmltKCkpIHx8IGlubmVyLnRyaW0oKTtcbiAgICByZXR1cm4gYCEoJHtpbm5lckV4cHJ9KWA7XG4gIH1cbiAgXG4gIC8vIE5vdCBhIHJlY29nbml6ZWQgaGVscGVyLCByZXR1cm4gZW1wdHkgc3RyaW5nXG4gIHJldHVybiAnJztcbn07XG4iXX0=