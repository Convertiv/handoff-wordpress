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
    // Negated conditions from {{#unless properties.xxx}} blocks: !(properties.foo) or !properties.foo
    const negWrappedMatch = expr.match(/^!\((.+)\)$/s);
    if (negWrappedMatch) {
        const inner = (0, exports.transpileExpression)(negWrappedMatch[1].trim(), context, loopVar);
        return `!(${inner})`;
    }
    if (expr.startsWith('!properties.')) {
        const inner = (0, exports.transpileExpression)(expr.slice(1), context, loopVar);
        return `!(${inner})`;
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwcmVzc2lvbi1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9leHByZXNzaW9uLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUdILG1DQUFzQztBQUV0Qzs7R0FFRztBQUNIOzs7Ozs7O0dBT0c7QUFDSSxNQUFNLG1DQUFtQyxHQUFHLENBQUMsSUFBWSxFQUFVLEVBQUU7SUFDMUUsTUFBTSxPQUFPLEdBQUcsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLEVBQUU7UUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QixNQUFNLEtBQUssR0FBRyxJQUFBLG1CQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEMsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQzdFLENBQUMsQ0FBQztJQUNGLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQ3ZCLDJFQUEyRSxFQUMzRSxPQUFPLENBQ1IsQ0FBQztJQUNGLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUNyQiwyRUFBMkUsRUFDM0UsT0FBTyxDQUNSLENBQUM7SUFDRixPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDLENBQUM7QUFmVyxRQUFBLG1DQUFtQyx1Q0FlOUM7QUFFSyxNQUFNLG1CQUFtQixHQUFHLENBQUMsSUFBWSxFQUFFLE9BQTBCLEVBQUUsVUFBa0IsTUFBTSxFQUFVLEVBQUU7SUFDaEgsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJ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b24gcGFyc2luZyB1dGlsaXRpZXMgZm9yIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsYXRpb25cbiAqL1xuXG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UgfSBmcm9tICcuL3V0aWxzJztcblxuLyoqXG4gKiBUcmFuc3BpbGUgYSBIYW5kbGViYXJzIHBhdGggZXhwcmVzc2lvbiB0byBKU1hcbiAqL1xuLyoqXG4gKiBSZXBsYWNlIGV2ZXJ5IG9jY3VycmVuY2Ugb2YgLi4vcHJvcGVydGllcy54eHggKHBhcmVudCBjb250ZXh0KSBpbiBhbiBleHByZXNzaW9uXG4gKiB3aXRoIHRoZSBKU1ggZm9ybSAoY2FtZWxDYXNlKS4gVXNlZCBmb3IgY29tcG91bmQgZXhwcmVzc2lvbnMgbGlrZVxuICoge3suLi9wcm9wZXJ0aWVzLmNvbHVtbkNvdW50ID09PSBcInRocmVlXCIgPyAnYScgOiAnYid9fSBpbnNpZGUgbG9vcHMuXG4gKiBBbHNvIGhhbmRsZXMgQHJvb3QucHJvcGVydGllcy54eHggd2hpY2ggaXMgc2VtYW50aWNhbGx5IGVxdWl2YWxlbnQgdG8gdGhlXG4gKiByb290LWNvbnRleHQgcHJvcGVydGllcy54eHggKHN0YW5kYXJkIEhhbmRsZWJhcnMgZGF0YSB2YXJpYWJsZSkuXG4gKiBFeHBvcnRlZCBmb3IgdXNlIGluIGF0dHJpYnV0ZSBjb252ZXJzaW9uLlxuICovXG5leHBvcnQgY29uc3QgcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24gPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgcmVzb2x2ZSA9IChfbWF0Y2g6IHN0cmluZywgcGF0aDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgZmlyc3QgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDEgPyBgJHtmaXJzdH0/LiR7cGFydHMuc2xpY2UoMSkuam9pbignPy4nKX1gIDogZmlyc3Q7XG4gIH07XG4gIGxldCByZXN1bHQgPSBleHByLnJlcGxhY2UoXG4gICAgL1xcLlxcLlxcLytwcm9wZXJ0aWVzXFwuKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05X10qKSopL2csXG4gICAgcmVzb2x2ZVxuICApO1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvQHJvb3RcXC5wcm9wZXJ0aWVzXFwuKFthLXpBLVpfXVthLXpBLVowLTlfXSooPzpcXC5bYS16QS1aX11bYS16QS1aMC05X10qKSopL2csXG4gICAgcmVzb2x2ZVxuICApO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuZXhwb3J0IGNvbnN0IHRyYW5zcGlsZUV4cHJlc3Npb24gPSAoZXhwcjogc3RyaW5nLCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCwgbG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nKTogc3RyaW5nID0+IHtcbiAgZXhwciA9IGV4cHIudHJpbSgpO1xuICBcbiAgLy8gSGFuZGxlIHRyaXBsZSBicmFjZXMgKHVuZXNjYXBlZCkgLSBzdHJpcCB0aGUgZXh0cmEgYnJhY2VcbiAgZXhwciA9IGV4cHIucmVwbGFjZSgvXlxceyt8XFx9KyQvZywgJycpO1xuXG4gIC8vIE5lZ2F0ZWQgY29uZGl0aW9ucyBmcm9tIHt7I3VubGVzcyBwcm9wZXJ0aWVzLnh4eH19IGJsb2NrczogIShwcm9wZXJ0aWVzLmZvbykgb3IgIXByb3BlcnRpZXMuZm9vXG4gIGNvbnN0IG5lZ1dyYXBwZWRNYXRjaCA9IGV4cHIubWF0Y2goL14hXFwoKC4rKVxcKSQvcyk7XG4gIGlmIChuZWdXcmFwcGVkTWF0Y2gpIHtcbiAgICBjb25zdCBpbm5lciA9IHRyYW5zcGlsZUV4cHJlc3Npb24obmVnV3JhcHBlZE1hdGNoWzFdLnRyaW0oKSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgcmV0dXJuIGAhKCR7aW5uZXJ9KWA7XG4gIH1cbiAgaWYgKGV4cHIuc3RhcnRzV2l0aCgnIXByb3BlcnRpZXMuJykpIHtcbiAgICBjb25zdCBpbm5lciA9IHRyYW5zcGlsZUV4cHJlc3Npb24oZXhwci5zbGljZSgxKSwgY29udGV4dCwgbG9vcFZhcik7XG4gICAgcmV0dXJuIGAhKCR7aW5uZXJ9KWA7XG4gIH1cbiAgXG4gIC8vIFJlc29sdmUgQUxMIC4uL3Byb3BlcnRpZXMueHh4IGFuZCBAcm9vdC5wcm9wZXJ0aWVzLnh4eCBpbiB0aGUgZXhwcmVzc2lvbiAoZm9yIGNvbXBvdW5kIGV4cHJlc3Npb25zIGxpa2UgdGVybmFyaWVzKVxuICBleHByID0gcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24oZXhwcik7XG4gIFxuICAvLyBIYW5kbGUgLi4vIHBhcmVudCBjb250ZXh0IHJlZmVyZW5jZXMgLSBzdHJpcCB0aGUgLi4vIHByZWZpeChlcykgYW5kIHByb2Nlc3MgYXMgdG9wLWxldmVsXG4gIC8vIFRoaXMgYWxsb3dzIGFjY2Vzc2luZyBwYXJlbnQgY29udGV4dCBmcm9tIGluc2lkZSBsb29wczogLi4vcHJvcGVydGllcy54eHggLT4gcHJvcGVydGllcy54eHhcbiAgLy8gTXVsdGlwbGUgbGV2ZWxzIGxpa2UgLi4vLi4vcHJvcGVydGllcy54eHggYXJlIGFsc28gaGFuZGxlZFxuICB3aGlsZSAoZXhwci5zdGFydHNXaXRoKCcuLi8nKSkge1xuICAgIGV4cHIgPSBleHByLnN1YnN0cmluZygzKTtcbiAgfVxuICBcbiAgLy8gSGFuZGxlIEByb290LiBwcmVmaXggLSByZXNvbHZlcyBmcm9tIHRoZSB0b3AtbGV2ZWwgY29udGV4dCByZWdhcmRsZXNzIG9mIG5lc3RpbmcgZGVwdGhcbiAgLy8gZS5nLiBAcm9vdC5wcm9wZXJ0aWVzLnh4eCAtPiBwcm9wZXJ0aWVzLnh4eFxuICBpZiAoZXhwci5zdGFydHNXaXRoKCdAcm9vdC4nKSkge1xuICAgIGV4cHIgPSBleHByLnN1YnN0cmluZyg2KTtcbiAgfVxuICBcbiAgLy8gSGFuZGxlIHNpbXBsZSB7e3RoaXN9fSAtIHJlZmVycyB0byBjdXJyZW50IGl0ZW0gaW4gc2NhbGFyIGFycmF5XG4gIGlmIChleHByID09PSAndGhpcycpIHtcbiAgICByZXR1cm4gbG9vcFZhcjtcbiAgfVxuICBcbiAgLy8gSGFuZGxlIHByb3BlcnRpZXMueHh4Lnl5eVxuICBpZiAoZXhwci5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgY29uc3QgcGFydHMgPSBleHByLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIC8vIEtlZXAgJ3NyYycgYXMtaXMgdG8gbWF0Y2ggSGFuZG9mZidzIGltYWdlIHByb3BlcnR5IG5hbWluZ1xuICAgICAgcmV0dXJuIGAke3Byb3BOYW1lfT8uJHtwYXJ0cy5zbGljZSgxKS5qb2luKCc/LicpfWA7XG4gICAgfVxuICAgIHJldHVybiBwcm9wTmFtZTtcbiAgfVxuICBcbiAgLy8gSGFuZGxlIHRoaXMueHh4IChpbnNpZGUgbG9vcHMpXG4gIGlmIChleHByLnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICBjb25zdCBwYXRoID0gZXhwci5yZXBsYWNlKCd0aGlzLicsICcnKTtcbiAgICBpZiAocGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgIHJldHVybiBgJHtsb29wVmFyfS4ke3BhcnRzLmpvaW4oJz8uJyl9YDtcbiAgICB9XG4gICAgcmV0dXJuIGAke2xvb3BWYXJ9LiR7cGF0aH1gO1xuICB9XG4gIFxuICAvLyBIYW5kbGUgQGluZGV4LCBAZmlyc3QsIEBsYXN0XG4gIGlmIChleHByID09PSAnQGluZGV4Jykge1xuICAgIHJldHVybiAnaW5kZXgnO1xuICB9XG4gIGlmIChleHByID09PSAnQGZpcnN0Jykge1xuICAgIHJldHVybiAnaW5kZXggPT09IDAnO1xuICB9XG4gIGlmIChleHByID09PSAnQGxhc3QnKSB7XG4gICAgY29uc3QgYXJyYXlOYW1lID0gY29udGV4dC5sb29wQXJyYXkgfHwgJ2l0ZW1zJztcbiAgICByZXR1cm4gYGluZGV4ID09PSAke2FycmF5TmFtZX0/Lmxlbmd0aCAtIDFgO1xuICB9XG4gIFxuICByZXR1cm4gZXhwcjtcbn07XG5cbi8qKlxuICogUGFyc2UgSGFuZGxlYmFycyBoZWxwZXIgZXhwcmVzc2lvbnMgbGlrZSAoZXEgcHJvcGVydGllcy5sYXlvdXQgXCJsYXlvdXQtMVwiKVxuICogYW5kIGNvbnZlcnQgdG8gSmF2YVNjcmlwdCBjb21wYXJpc29uIGV4cHJlc3Npb25zXG4gKi9cbmV4cG9ydCBjb25zdCBwYXJzZUhlbHBlckV4cHJlc3Npb24gPSAoZXhwcjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgLy8gTm9ybWFsaXplIC4uL3Byb3BlcnRpZXMueHh4IGFuZCBAcm9vdC5wcm9wZXJ0aWVzLnh4eCBpbiB0aGUgZXhwcmVzc2lvbiBmaXJzdFxuICBleHByID0gcmVzb2x2ZVBhcmVudFByb3BlcnRpZXNJbkV4cHJlc3Npb24oZXhwcik7XG4gIC8vIE1hdGNoIChlcSBsZWZ0IHJpZ2h0KSBvciAoZXEgbGVmdCBcInN0cmluZ1wiKVxuICBjb25zdCBlcU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccyplcVxccysoW15cXHNcIl0rKVxccytbXCInXShbXlwiJ10rKVtcIiddXFxzKlxcKSQvKTtcbiAgaWYgKGVxTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcU1hdGNoO1xuICAgIC8vIENvbnZlcnQgdGhlIGxlZnQgc2lkZSAoZS5nLiwgcHJvcGVydGllcy5sYXlvdXQgLT4gbGF5b3V0KVxuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQ7XG4gICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICB9IGVsc2UgaWYgKGxlZnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSBgaXRlbS4ke2xlZnQucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA9PT0gXCIke3JpZ2h0fVwiYDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGVxIGxlZnQgdmFyaWFibGUpIHdpdGhvdXQgcXVvdGVzXG4gIGNvbnN0IGVxVmFyTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgaWYgKGVxVmFyTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBlcVZhck1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0O1xuICAgIFxuICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSk7XG4gICAgfSBlbHNlIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gYGl0ZW0uJHtsZWZ0LnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIGlmIChyaWdodC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICByaWdodEV4cHIgPSB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSk7XG4gICAgfSBlbHNlIGlmIChyaWdodC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICByaWdodEV4cHIgPSBgaXRlbS4ke3JpZ2h0LnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPT09ICR7cmlnaHRFeHByfWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChuZSBsZWZ0IFwic3RyaW5nXCIpIC0gbm90IGVxdWFsXG4gIGNvbnN0IG5lTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm5lXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICBpZiAobmVNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IG5lTWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpO1xuICAgIH0gZWxzZSBpZiAobGVmdC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IGBpdGVtLiR7bGVmdC5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ICE9PSBcIiR7cmlnaHR9XCJgO1xuICB9XG4gIFxuICAvLyBNYXRjaCAoZ3QgbGVmdCByaWdodCkgLSBncmVhdGVyIHRoYW5cbiAgY29uc3QgZ3RNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZ3RcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAoZ3RNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGd0TWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiBsZWZ0O1xuICAgIGxldCByaWdodEV4cHIgPSByaWdodC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UocmlnaHQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogcmlnaHQ7XG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA+ICR7cmlnaHRFeHByfWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChsdCBsZWZ0IHJpZ2h0KSAtIGxlc3MgdGhhblxuICBjb25zdCBsdE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypsdFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChsdE1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbHRNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiByaWdodDtcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9IDwgJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGd0ZSBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhbiBvciBlcXVhbFxuICBjb25zdCBndGVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZ3RlXFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgaWYgKGd0ZU1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RlTWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiBsZWZ0O1xuICAgIGxldCByaWdodEV4cHIgPSByaWdodC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpID8gdG9DYW1lbENhc2UocmlnaHQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogcmlnaHQ7XG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA+PSAke3JpZ2h0RXhwcn1gO1xuICB9XG4gIFxuICAvLyBNYXRjaCAobHRlIGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuIG9yIGVxdWFsXG4gIGNvbnN0IGx0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypsdGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAobHRlTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdGVNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiByaWdodDtcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9IDw9ICR7cmlnaHRFeHByfWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChhbmQgZXhwcjEgZXhwcjIpIC0gbG9naWNhbCBhbmRcbiAgY29uc3QgYW5kTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmFuZFxccysoLispXFxzKyguKylcXHMqXFwpJC8pO1xuICBpZiAoYW5kTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBhbmRNYXRjaDtcbiAgICBjb25zdCBsZWZ0RXhwciA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihsZWZ0LnRyaW0oKSkgfHwgbGVmdC50cmltKCk7XG4gICAgY29uc3QgcmlnaHRFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKHJpZ2h0LnRyaW0oKSkgfHwgcmlnaHQudHJpbSgpO1xuICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9KSAmJiAoJHtyaWdodEV4cHJ9KWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChvciBleHByMSBleHByMikgLSBsb2dpY2FsIG9yXG4gIGNvbnN0IG9yTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKm9yXFxzKyguKylcXHMrKC4rKVxccypcXCkkLyk7XG4gIGlmIChvck1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gb3JNYXRjaDtcbiAgICBjb25zdCBsZWZ0RXhwciA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihsZWZ0LnRyaW0oKSkgfHwgbGVmdC50cmltKCk7XG4gICAgY29uc3QgcmlnaHRFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKHJpZ2h0LnRyaW0oKSkgfHwgcmlnaHQudHJpbSgpO1xuICAgIHJldHVybiBgKCR7bGVmdEV4cHJ9KSB8fCAoJHtyaWdodEV4cHJ9KWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChub3QgZXhwcikgLSBsb2dpY2FsIG5vdFxuICBjb25zdCBub3RNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbm90XFxzKyguKylcXHMqXFwpJC8pO1xuICBpZiAobm90TWF0Y2gpIHtcbiAgICBjb25zdCBbLCBpbm5lcl0gPSBub3RNYXRjaDtcbiAgICBjb25zdCBpbm5lckV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24oaW5uZXIudHJpbSgpKSB8fCBpbm5lci50cmltKCk7XG4gICAgcmV0dXJuIGAhKCR7aW5uZXJFeHByfSlgO1xuICB9XG4gIFxuICAvLyBOb3QgYSByZWNvZ25pemVkIGhlbHBlciwgcmV0dXJuIGVtcHR5IHN0cmluZ1xuICByZXR1cm4gJyc7XG59O1xuIl19