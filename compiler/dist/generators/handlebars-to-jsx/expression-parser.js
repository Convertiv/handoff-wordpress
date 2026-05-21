"use strict";
/**
 * Expression parsing utilities for Handlebars to JSX transpilation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHelperExpression = exports.transpileExpression = exports.toOptionalChainedAccess = exports.resolveParentPropertiesInExpression = void 0;
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
/** Turn `root` + dotted path into optional-chained access (e.g. cta + image.alt → cta.image?.alt). */
const toOptionalChainedAccess = (root, path) => {
    if (!path.includes('.')) {
        return `${root}.${path}`;
    }
    return `${root}.${path.split('.').join('?.')}`;
};
exports.toOptionalChainedAccess = toOptionalChainedAccess;
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
        return (0, exports.toOptionalChainedAccess)(loopVar, expr.replace('this.', ''));
    }
    // Handle alias/object dotted paths (e.g. column.cta.style in attribute values)
    if (/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)+$/.test(expr)) {
        const parts = expr.split('.');
        if (parts[0] === loopVar) {
            return (0, exports.toOptionalChainedAccess)(loopVar, parts.slice(1).join('.'));
        }
        return parts.join('?.');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwcmVzc2lvbi1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9leHByZXNzaW9uLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUdILG1DQUFzQztBQUV0Qzs7R0FFRztBQUNIOzs7Ozs7O0dBT0c7QUFDSSxNQUFNLG1DQUFtQyxHQUFHLENBQUMsSUFBWSxFQUFVLEVBQUU7SUFDMUUsTUFBTSxPQUFPLEdBQUcsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLEVBQUU7UUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QixNQUFNLEtBQUssR0FBRyxJQUFBLG1CQUFXLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEMsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEtBQUssS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQzdFLENBQUMsQ0FBQztJQUNGLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQ3ZCLDJFQUEyRSxFQUMzRSxPQUFPLENBQ1IsQ0FBQztJQUNGLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUNyQiwyRUFBMkUsRUFDM0UsT0FBTyxDQUNSLENBQUM7SUFDRixPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDLENBQUM7QUFmVyxRQUFBLG1DQUFtQyx1Q0FlOUM7QUFFRixzR0FBc0c7QUFDL0YsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLElBQVksRUFBRSxJQUFZLEVBQVUsRUFBRTtJQUM1RSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMs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Q0FBQztRQUN0RSxPQUFPLElBQUksUUFBUSxTQUFTLFNBQVMsR0FBRyxDQUFDO0lBQzNDLENBQUM7SUFFRCxpQ0FBaUM7SUFDakMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3RELElBQUksUUFBUSxFQUFFLENBQUM7UUFDYixNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxRQUFRLENBQUM7UUFDM0IsTUFBTSxTQUFTLEdBQUcsSUFBQSw2QkFBcUIsRUFBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEUsT0FBTyxLQUFLLFNBQVMsR0FBRyxDQUFDO0lBQzNCLENBQUM7SUFFRCwrQ0FBK0M7SUFDL0MsT0FBTyxFQUFFLENBQUM7QUFDWixDQUFDLENBQUM7QUFwSFcsUUFBQSxxQkFBcUIseUJBb0hoQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRXhwcmVzc2lvbiBwYXJzaW5nIHV0aWxpdGllcyBmb3IgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxhdGlvblxuICovXG5cbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0IH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuXG4vKipcbiAqIFRyYW5zcGlsZSBhIEhhbmRsZWJhcnMgcGF0aCBleHByZXNzaW9uIHRvIEpTWFxuICovXG4vKipcbiAqIFJlcGxhY2UgZXZlcnkgb2NjdXJyZW5jZSBvZiAuLi9wcm9wZXJ0aWVzLnh4eCAocGFyZW50IGNvbnRleHQpIGluIGFuIGV4cHJlc3Npb25cbiAqIHdpdGggdGhlIEpTWCBmb3JtIChjYW1lbENhc2UpLiBVc2VkIGZvciBjb21wb3VuZCBleHByZXNzaW9ucyBsaWtlXG4gKiB7ey4uL3Byb3BlcnRpZXMuY29sdW1uQ291bnQgPT09IFwidGhyZWVcIiA/ICdhJyA6ICdiJ319IGluc2lkZSBsb29wcy5cbiAqIEFsc28gaGFuZGxlcyBAcm9vdC5wcm9wZXJ0aWVzLnh4eCB3aGljaCBpcyBzZW1hbnRpY2FsbHkgZXF1aXZhbGVudCB0byB0aGVcbiAqIHJvb3QtY29udGV4dCBwcm9wZXJ0aWVzLnh4eCAoc3RhbmRhcmQgSGFuZGxlYmFycyBkYXRhIHZhcmlhYmxlKS5cbiAqIEV4cG9ydGVkIGZvciB1c2UgaW4gYXR0cmlidXRlIGNvbnZlcnNpb24uXG4gKi9cbmV4cG9ydCBjb25zdCByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbiA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCByZXNvbHZlID0gKF9tYXRjaDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBjb25zdCBmaXJzdCA9IHRvQ2FtZWxDYXNlKHBhcnRzWzBdKTtcbiAgICByZXR1cm4gcGFydHMubGVuZ3RoID4gMSA/IGAke2ZpcnN0fT8uJHtwYXJ0cy5zbGljZSgxKS5qb2luKCc/LicpfWAgOiBmaXJzdDtcbiAgfTtcbiAgbGV0IHJlc3VsdCA9IGV4cHIucmVwbGFjZShcbiAgICAvXFwuXFwuXFwvK3Byb3BlcnRpZXNcXC4oW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfXSopKikvZyxcbiAgICByZXNvbHZlXG4gICk7XG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC9Acm9vdFxcLnByb3BlcnRpZXNcXC4oW2EtekEtWl9dW2EtekEtWjAtOV9dKig/OlxcLlthLXpBLVpfXVthLXpBLVowLTlfXSopKikvZyxcbiAgICByZXNvbHZlXG4gICk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiogVHVybiBgcm9vdGAgKyBkb3R0ZWQgcGF0aCBpbnRvIG9wdGlvbmFsLWNoYWluZWQgYWNjZXNzIChlLmcuIGN0YSArIGltYWdlLmFsdCDihpIgY3RhLmltYWdlPy5hbHQpLiAqL1xuZXhwb3J0IGNvbnN0IHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzID0gKHJvb3Q6IHN0cmluZywgcGF0aDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKCFwYXRoLmluY2x1ZGVzKCcuJykpIHtcbiAgICByZXR1cm4gYCR7cm9vdH0uJHtwYXRofWA7XG4gIH1cbiAgcmV0dXJuIGAke3Jvb3R9LiR7cGF0aC5zcGxpdCgnLicpLmpvaW4oJz8uJyl9YDtcbn07XG5cbmV4cG9ydCBjb25zdCB0cmFuc3BpbGVFeHByZXNzaW9uID0gKGV4cHI6IHN0cmluZywgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQsIGxvb3BWYXI6IHN0cmluZyA9ICdpdGVtJyk6IHN0cmluZyA9PiB7XG4gIGV4cHIgPSBleHByLnRyaW0oKTtcbiAgXG4gIC8vIEhhbmRsZSB0cmlwbGUgYnJhY2VzICh1bmVzY2FwZWQpIC0gc3RyaXAgdGhlIGV4dHJhIGJyYWNlXG4gIGV4cHIgPSBleHByLnJlcGxhY2UoL15cXHsrfFxcfSskL2csICcnKTtcblxuICAvLyBOZWdhdGVkIGNvbmRpdGlvbnMgZnJvbSB7eyN1bmxlc3MgcHJvcGVydGllcy54eHh9fSBibG9ja3M6ICEocHJvcGVydGllcy5mb28pIG9yICFwcm9wZXJ0aWVzLmZvb1xuICBjb25zdCBuZWdXcmFwcGVkTWF0Y2ggPSBleHByLm1hdGNoKC9eIVxcKCguKylcXCkkL3MpO1xuICBpZiAobmVnV3JhcHBlZE1hdGNoKSB7XG4gICAgY29uc3QgaW5uZXIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKG5lZ1dyYXBwZWRNYXRjaFsxXS50cmltKCksIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgIHJldHVybiBgISgke2lubmVyfSlgO1xuICB9XG4gIGlmIChleHByLnN0YXJ0c1dpdGgoJyFwcm9wZXJ0aWVzLicpKSB7XG4gICAgY29uc3QgaW5uZXIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGV4cHIuc2xpY2UoMSksIGNvbnRleHQsIGxvb3BWYXIpO1xuICAgIHJldHVybiBgISgke2lubmVyfSlgO1xuICB9XG4gIFxuICAvLyBSZXNvbHZlIEFMTCAuLi9wcm9wZXJ0aWVzLnh4eCBhbmQgQHJvb3QucHJvcGVydGllcy54eHggaW4gdGhlIGV4cHJlc3Npb24gKGZvciBjb21wb3VuZCBleHByZXNzaW9ucyBsaWtlIHRlcm5hcmllcylcbiAgZXhwciA9IHJlc29sdmVQYXJlbnRQcm9wZXJ0aWVzSW5FeHByZXNzaW9uKGV4cHIpO1xuICBcbiAgLy8gSGFuZGxlIC4uLyBwYXJlbnQgY29udGV4dCByZWZlcmVuY2VzIC0gc3RyaXAgdGhlIC4uLyBwcmVmaXgoZXMpIGFuZCBwcm9jZXNzIGFzIHRvcC1sZXZlbFxuICAvLyBUaGlzIGFsbG93cyBhY2Nlc3NpbmcgcGFyZW50IGNvbnRleHQgZnJvbSBpbnNpZGUgbG9vcHM6IC4uL3Byb3BlcnRpZXMueHh4IC0+IHByb3BlcnRpZXMueHh4XG4gIC8vIE11bHRpcGxlIGxldmVscyBsaWtlIC4uLy4uL3Byb3BlcnRpZXMueHh4IGFyZSBhbHNvIGhhbmRsZWRcbiAgd2hpbGUgKGV4cHIuc3RhcnRzV2l0aCgnLi4vJykpIHtcbiAgICBleHByID0gZXhwci5zdWJzdHJpbmcoMyk7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBAcm9vdC4gcHJlZml4IC0gcmVzb2x2ZXMgZnJvbSB0aGUgdG9wLWxldmVsIGNvbnRleHQgcmVnYXJkbGVzcyBvZiBuZXN0aW5nIGRlcHRoXG4gIC8vIGUuZy4gQHJvb3QucHJvcGVydGllcy54eHggLT4gcHJvcGVydGllcy54eHhcbiAgaWYgKGV4cHIuc3RhcnRzV2l0aCgnQHJvb3QuJykpIHtcbiAgICBleHByID0gZXhwci5zdWJzdHJpbmcoNik7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBzaW1wbGUge3t0aGlzfX0gLSByZWZlcnMgdG8gY3VycmVudCBpdGVtIGluIHNjYWxhciBhcnJheVxuICBpZiAoZXhwciA9PT0gJ3RoaXMnKSB7XG4gICAgcmV0dXJuIGxvb3BWYXI7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBwcm9wZXJ0aWVzLnh4eC55eXlcbiAgaWYgKGV4cHIuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgIGNvbnN0IHBhcnRzID0gZXhwci5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAvLyBLZWVwICdzcmMnIGFzLWlzIHRvIG1hdGNoIEhhbmRvZmYncyBpbWFnZSBwcm9wZXJ0eSBuYW1pbmdcbiAgICAgIHJldHVybiBgJHtwcm9wTmFtZX0/LiR7cGFydHMuc2xpY2UoMSkuam9pbignPy4nKX1gO1xuICAgIH1cbiAgICByZXR1cm4gcHJvcE5hbWU7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSB0aGlzLnh4eCAoaW5zaWRlIGxvb3BzKVxuICBpZiAoZXhwci5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIGV4cHIucmVwbGFjZSgndGhpcy4nLCAnJykpO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFsaWFzL29iamVjdCBkb3R0ZWQgcGF0aHMgKGUuZy4gY29sdW1uLmN0YS5zdHlsZSBpbiBhdHRyaWJ1dGUgdmFsdWVzKVxuICBpZiAoL15bYS16QS1aX11bXFx3XSooXFwuW2EtekEtWl9dW1xcd10qKSskLy50ZXN0KGV4cHIpKSB7XG4gICAgY29uc3QgcGFydHMgPSBleHByLnNwbGl0KCcuJyk7XG4gICAgaWYgKHBhcnRzWzBdID09PSBsb29wVmFyKSB7XG4gICAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcGFydHMuc2xpY2UoMSkuam9pbignLicpKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJz8uJyk7XG4gIH1cbiAgXG4gIC8vIEhhbmRsZSBAaW5kZXgsIEBmaXJzdCwgQGxhc3RcbiAgaWYgKGV4cHIgPT09ICdAaW5kZXgnKSB7XG4gICAgcmV0dXJuICdpbmRleCc7XG4gIH1cbiAgaWYgKGV4cHIgPT09ICdAZmlyc3QnKSB7XG4gICAgcmV0dXJuICdpbmRleCA9PT0gMCc7XG4gIH1cbiAgaWYgKGV4cHIgPT09ICdAbGFzdCcpIHtcbiAgICBjb25zdCBhcnJheU5hbWUgPSBjb250ZXh0Lmxvb3BBcnJheSB8fCAnaXRlbXMnO1xuICAgIHJldHVybiBgaW5kZXggPT09ICR7YXJyYXlOYW1lfT8ubGVuZ3RoIC0gMWA7XG4gIH1cbiAgXG4gIHJldHVybiBleHByO1xufTtcblxuLyoqXG4gKiBQYXJzZSBIYW5kbGViYXJzIGhlbHBlciBleHByZXNzaW9ucyBsaWtlIChlcSBwcm9wZXJ0aWVzLmxheW91dCBcImxheW91dC0xXCIpXG4gKiBhbmQgY29udmVydCB0byBKYXZhU2NyaXB0IGNvbXBhcmlzb24gZXhwcmVzc2lvbnNcbiAqL1xuZXhwb3J0IGNvbnN0IHBhcnNlSGVscGVyRXhwcmVzc2lvbiA9IChleHByOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAvLyBOb3JtYWxpemUgLi4vcHJvcGVydGllcy54eHggYW5kIEByb290LnByb3BlcnRpZXMueHh4IGluIHRoZSBleHByZXNzaW9uIGZpcnN0XG4gIGV4cHIgPSByZXNvbHZlUGFyZW50UHJvcGVydGllc0luRXhwcmVzc2lvbihleHByKTtcbiAgLy8gTWF0Y2ggKGVxIGxlZnQgcmlnaHQpIG9yIChlcSBsZWZ0IFwic3RyaW5nXCIpXG4gIGNvbnN0IGVxTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmVxXFxzKyhbXlxcc1wiXSspXFxzK1tcIiddKFteXCInXSspW1wiJ11cXHMqXFwpJC8pO1xuICBpZiAoZXFNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxTWF0Y2g7XG4gICAgLy8gQ29udmVydCB0aGUgbGVmdCBzaWRlIChlLmcuLCBwcm9wZXJ0aWVzLmxheW91dCAtPiBsYXlvdXQpXG4gICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICBpZiAobGVmdC5zdGFydHNXaXRoKCdwcm9wZXJ0aWVzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpO1xuICAgIH0gZWxzZSBpZiAobGVmdC5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgICBsZWZ0RXhwciA9IGBpdGVtLiR7bGVmdC5yZXBsYWNlKCd0aGlzLicsICcnKX1gO1xuICAgIH1cbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID09PSBcIiR7cmlnaHR9XCJgO1xuICB9XG4gIFxuICAvLyBNYXRjaCAoZXEgbGVmdCB2YXJpYWJsZSkgd2l0aG91dCBxdW90ZXNcbiAgY29uc3QgZXFWYXJNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqZXFcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAoZXFWYXJNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGVxVmFyTWF0Y2g7XG4gICAgbGV0IGxlZnRFeHByID0gbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQ7XG4gICAgXG4gICAgaWYgKGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICB9IGVsc2UgaWYgKGxlZnQuc3RhcnRzV2l0aCgndGhpcy4nKSkge1xuICAgICAgbGVmdEV4cHIgPSBgaXRlbS4ke2xlZnQucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgXG4gICAgaWYgKHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIHJpZ2h0RXhwciA9IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKTtcbiAgICB9IGVsc2UgaWYgKHJpZ2h0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIHJpZ2h0RXhwciA9IGBpdGVtLiR7cmlnaHQucmVwbGFjZSgndGhpcy4nLCAnJyl9YDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGAke2xlZnRFeHByfSA9PT0gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKG5lIGxlZnQgXCJzdHJpbmdcIikgLSBub3QgZXF1YWxcbiAgY29uc3QgbmVNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqbmVcXHMrKFteXFxzXCJdKylcXHMrW1wiJ10oW15cIiddKylbXCInXVxccypcXCkkLyk7XG4gIGlmIChuZU1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gbmVNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0O1xuICAgIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gdG9DYW1lbENhc2UobGVmdC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSk7XG4gICAgfSBlbHNlIGlmIChsZWZ0LnN0YXJ0c1dpdGgoJ3RoaXMuJykpIHtcbiAgICAgIGxlZnRFeHByID0gYGl0ZW0uJHtsZWZ0LnJlcGxhY2UoJ3RoaXMuJywgJycpfWA7XG4gICAgfVxuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gIT09IFwiJHtyaWdodH1cImA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChndCBsZWZ0IHJpZ2h0KSAtIGdyZWF0ZXIgdGhhblxuICBjb25zdCBndE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndFxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChndE1hdGNoKSB7XG4gICAgY29uc3QgWywgbGVmdCwgcmlnaHRdID0gZ3RNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiByaWdodDtcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID4gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGx0IGxlZnQgcmlnaHQpIC0gbGVzcyB0aGFuXG4gIGNvbnN0IGx0TWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0XFxzKyhbXlxcc10rKVxccysoW15cXHMpXSspXFxzKlxcKSQvKTtcbiAgaWYgKGx0TWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBsdE1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IHJpZ2h0O1xuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPCAke3JpZ2h0RXhwcn1gO1xuICB9XG4gIFxuICAvLyBNYXRjaCAoZ3RlIGxlZnQgcmlnaHQpIC0gZ3JlYXRlciB0aGFuIG9yIGVxdWFsXG4gIGNvbnN0IGd0ZU1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypndGVcXHMrKFteXFxzXSspXFxzKyhbXlxccyldKylcXHMqXFwpJC8pO1xuICBpZiAoZ3RlTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBndGVNYXRjaDtcbiAgICBsZXQgbGVmdEV4cHIgPSBsZWZ0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShsZWZ0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IGxlZnQ7XG4gICAgbGV0IHJpZ2h0RXhwciA9IHJpZ2h0LnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykgPyB0b0NhbWVsQ2FzZShyaWdodC5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKSkgOiByaWdodDtcbiAgICByZXR1cm4gYCR7bGVmdEV4cHJ9ID49ICR7cmlnaHRFeHByfWA7XG4gIH1cbiAgXG4gIC8vIE1hdGNoIChsdGUgbGVmdCByaWdodCkgLSBsZXNzIHRoYW4gb3IgZXF1YWxcbiAgY29uc3QgbHRlTWF0Y2ggPSBleHByLm1hdGNoKC9eXFwoXFxzKmx0ZVxccysoW15cXHNdKylcXHMrKFteXFxzKV0rKVxccypcXCkkLyk7XG4gIGlmIChsdGVNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGx0ZU1hdGNoO1xuICAgIGxldCBsZWZ0RXhwciA9IGxlZnQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKGxlZnQucmVwbGFjZSgncHJvcGVydGllcy4nLCAnJykpIDogbGVmdDtcbiAgICBsZXQgcmlnaHRFeHByID0gcmlnaHQuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSA/IHRvQ2FtZWxDYXNlKHJpZ2h0LnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpKSA6IHJpZ2h0O1xuICAgIHJldHVybiBgJHtsZWZ0RXhwcn0gPD0gJHtyaWdodEV4cHJ9YDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKGFuZCBleHByMSBleHByMikgLSBsb2dpY2FsIGFuZFxuICBjb25zdCBhbmRNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqYW5kXFxzKyguKylcXHMrKC4rKVxccypcXCkkLyk7XG4gIGlmIChhbmRNYXRjaCkge1xuICAgIGNvbnN0IFssIGxlZnQsIHJpZ2h0XSA9IGFuZE1hdGNoO1xuICAgIGNvbnN0IGxlZnRFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGxlZnQudHJpbSgpKSB8fCBsZWZ0LnRyaW0oKTtcbiAgICBjb25zdCByaWdodEV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24ocmlnaHQudHJpbSgpKSB8fCByaWdodC50cmltKCk7XG4gICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0pICYmICgke3JpZ2h0RXhwcn0pYDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKG9yIGV4cHIxIGV4cHIyKSAtIGxvZ2ljYWwgb3JcbiAgY29uc3Qgb3JNYXRjaCA9IGV4cHIubWF0Y2goL15cXChcXHMqb3JcXHMrKC4rKVxccysoLispXFxzKlxcKSQvKTtcbiAgaWYgKG9yTWF0Y2gpIHtcbiAgICBjb25zdCBbLCBsZWZ0LCByaWdodF0gPSBvck1hdGNoO1xuICAgIGNvbnN0IGxlZnRFeHByID0gcGFyc2VIZWxwZXJFeHByZXNzaW9uKGxlZnQudHJpbSgpKSB8fCBsZWZ0LnRyaW0oKTtcbiAgICBjb25zdCByaWdodEV4cHIgPSBwYXJzZUhlbHBlckV4cHJlc3Npb24ocmlnaHQudHJpbSgpKSB8fCByaWdodC50cmltKCk7XG4gICAgcmV0dXJuIGAoJHtsZWZ0RXhwcn0pIHx8ICgke3JpZ2h0RXhwcn0pYDtcbiAgfVxuICBcbiAgLy8gTWF0Y2ggKG5vdCBleHByKSAtIGxvZ2ljYWwgbm90XG4gIGNvbnN0IG5vdE1hdGNoID0gZXhwci5tYXRjaCgvXlxcKFxccypub3RcXHMrKC4rKVxccypcXCkkLyk7XG4gIGlmIChub3RNYXRjaCkge1xuICAgIGNvbnN0IFssIGlubmVyXSA9IG5vdE1hdGNoO1xuICAgIGNvbnN0IGlubmVyRXhwciA9IHBhcnNlSGVscGVyRXhwcmVzc2lvbihpbm5lci50cmltKCkpIHx8IGlubmVyLnRyaW0oKTtcbiAgICByZXR1cm4gYCEoJHtpbm5lckV4cHJ9KWA7XG4gIH1cbiAgXG4gIC8vIE5vdCBhIHJlY29nbml6ZWQgaGVscGVyLCByZXR1cm4gZW1wdHkgc3RyaW5nXG4gIHJldHVybiAnJztcbn07XG4iXX0=