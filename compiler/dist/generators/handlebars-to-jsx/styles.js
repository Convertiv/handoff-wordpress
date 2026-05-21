"use strict";
/**
 * Style parsing utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseStyleToObject = exports.cssStringToReactObject = void 0;
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
/**
 * Convert a static CSS string (e.g. "display: block; color: red;") to a React inline style object
 * literal string (e.g. "{ display: 'block', color: 'red' }"). Used when a conditional wraps an
 * entire style attribute so the value expression needs to be a React object, not a CSS string.
 */
const cssStringToReactObject = (cssStr) => {
    const props = cssStr
        .split(';')
        .filter(s => s.trim())
        .map(s => {
        const colonIdx = s.indexOf(':');
        if (colonIdx === -1)
            return null;
        const prop = (0, utils_1.cssToCamelCase)(s.substring(0, colonIdx).trim());
        const val = s.substring(colonIdx + 1).trim();
        if (/^-?\d+(\.\d+)?$/.test(val)) {
            return `${prop}: ${val}`;
        }
        return `${prop}: '${val.replace(/'/g, "\\'")}'`;
    })
        .filter(Boolean)
        .join(', ');
    return `{ ${props} }`;
};
exports.cssStringToReactObject = cssStringToReactObject;
/**
 * Convert a Handlebars property reference (e.g. "properties.overlay-opacity", "this.image.src",
 * or "slide.image.src" inside {{#each properties.slides as |slide|}}) to a JSX expression.
 */
const resolvePropertyRef = (raw, loopVar = 'item') => {
    let ref = raw.trim();
    while (ref.startsWith('../'))
        ref = ref.substring(3);
    if (ref.startsWith('properties.')) {
        const parts = ref.replace('properties.', '').split('.');
        const propName = (0, utils_1.toCamelCase)(parts[0]);
        return parts.length > 1 ? `${propName}?.${parts.slice(1).join('?.')}` : propName;
    }
    if (ref === 'this') {
        return loopVar;
    }
    if (ref.startsWith('this.')) {
        return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, ref.replace('this.', ''));
    }
    const parts = ref.split('.');
    if (parts.length > 1 && parts[0] === loopVar) {
        return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, parts.slice(1).join('.'));
    }
    if (/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)+$/.test(ref)) {
        if (parts[0] === loopVar) {
            return (0, expression_parser_1.toOptionalChainedAccess)(loopVar, parts.slice(1).join('.'));
        }
        return parts.join('?.');
    }
    return (0, utils_1.toCamelCase)(ref);
};
/**
 * Parse a CSS style string into a React style object string.
 * Handles mixed static and dynamic (Handlebars) values per-property.
 */
const parseStyleToObject = (styleStr, context) => {
    const loopVar = context.loopVariable || 'item';
    const styles = styleStr.split(';')
        .filter(s => s.trim())
        .map(s => {
        const colonIndex = s.indexOf(':');
        if (colonIndex === -1)
            return null;
        const prop = s.substring(0, colonIndex).trim();
        const val = s.substring(colonIndex + 1).trim();
        const camelProp = (0, utils_1.cssToCamelCase)(prop);
        // background-image with Handlebars image property references (supports multiple url() values)
        if (prop === 'background-image') {
            const urlRegex = /url\(['"]?\{\{\s*(.+?)\s*\}\}['"]?\)/g;
            const matches = [...val.matchAll(urlRegex)];
            if (matches.length > 0) {
                const refs = matches.map(m => resolvePropertyRef(m[1], loopVar));
                const parts = refs.map(ref => `${ref} ? \`url('\${${ref}}')\` : null`);
                return `backgroundImage: [${parts.join(', ')}].filter(Boolean).join(', ') || undefined`;
            }
        }
        // Value is a simple Handlebars expression → resolve to JS variable
        const hbsMatch = val.match(/^\{\{\s*(.+?)\s*\}\}$/);
        if (hbsMatch) {
            return `${camelProp}: ${resolvePropertyRef(hbsMatch[1], loopVar)}`;
        }
        // Numeric values don't need quotes
        if (/^-?\d+(\.\d+)?$/.test(val)) {
            return `${camelProp}: ${val}`;
        }
        // If value contains single quotes (like url('...')), use double quotes
        if (val.includes("'")) {
            return `${camelProp}: "${val}"`;
        }
        return `${camelProp}: '${val}'`;
    })
        .filter(Boolean)
        .join(', ');
    return `{{ ${styles} }}`;
};
exports.parseStyleToObject = parseStyleToObject;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvaGFuZGxlYmFycy10by1qc3gvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsbUNBQXNEO0FBQ3RELDJEQUE4RDtBQUU5RDs7OztHQUlHO0FBQ0ksTUFBTSxzQkFBc0IsR0FBRyxDQUFDLE1BQWMsRUFBVSxFQUFFO0lBQy9ELE1BQU0sS0FBSyxHQUFHLE1BQU07U0FDakIsS0FBSyxDQUFDLEdBQUcsQ0FBQztTQUNWLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUNyQixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDUCxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQ2pDLE1BQU0sSUFBSSxHQUFHLElBQUEsc0JBQWMsRUFBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzdELE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzdDLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDaEMsT0FBTyxHQUFHLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUMzQixDQUFDO1FBQ0QsT0FBTyxHQUFHLElBQUksTUFBTSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDO0lBQ2xELENBQUMsQ0FBQztTQUNELE1BQU0sQ0FBQyxPQUFPLENBQUM7U0FDZixJQUFJLENBQUMs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T0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNyRSxDQUFDO1FBRUQsbUNBQW1DO1FBQ25DLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDaEMsT0FBTyxHQUFHLFNBQVMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNoQyxDQUFDO1FBRUQsdUVBQXVFO1FBQ3ZFLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sR0FBRyxTQUFTLE1BQU0sR0FBRyxHQUFHLENBQUM7UUFDbEMsQ0FBQztRQUVELE9BQU8sR0FBRyxTQUFTLE1BQU0sR0FBRyxHQUFHLENBQUM7SUFDbEMsQ0FBQyxDQUFDO1NBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQztTQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUVkLE9BQU8sTUFBTSxNQUFNLEtBQUssQ0FBQztBQUMzQixDQUFDLENBQUM7QUE1Q1csUUFBQSxrQkFBa0Isc0JBNEM3QiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU3R5bGUgcGFyc2luZyB1dGlsaXRpZXMgZm9yIHRoZSBIYW5kbGViYXJzIHRvIEpTWCB0cmFuc3BpbGVyXG4gKi9cblxuaW1wb3J0IHsgVHJhbnNwaWxlckNvbnRleHQgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlLCBjc3NUb0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MgfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcblxuLyoqXG4gKiBDb252ZXJ0IGEgc3RhdGljIENTUyBzdHJpbmcgKGUuZy4gXCJkaXNwbGF5OiBibG9jazsgY29sb3I6IHJlZDtcIikgdG8gYSBSZWFjdCBpbmxpbmUgc3R5bGUgb2JqZWN0XG4gKiBsaXRlcmFsIHN0cmluZyAoZS5nLiBcInsgZGlzcGxheTogJ2Jsb2NrJywgY29sb3I6ICdyZWQnIH1cIikuIFVzZWQgd2hlbiBhIGNvbmRpdGlvbmFsIHdyYXBzIGFuXG4gKiBlbnRpcmUgc3R5bGUgYXR0cmlidXRlIHNvIHRoZSB2YWx1ZSBleHByZXNzaW9uIG5lZWRzIHRvIGJlIGEgUmVhY3Qgb2JqZWN0LCBub3QgYSBDU1Mgc3RyaW5nLlxuICovXG5leHBvcnQgY29uc3QgY3NzU3RyaW5nVG9SZWFjdE9iamVjdCA9IChjc3NTdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHByb3BzID0gY3NzU3RyXG4gICAgLnNwbGl0KCc7JylcbiAgICAuZmlsdGVyKHMgPT4gcy50cmltKCkpXG4gICAgLm1hcChzID0+IHtcbiAgICAgIGNvbnN0IGNvbG9uSWR4ID0gcy5pbmRleE9mKCc6Jyk7XG4gICAgICBpZiAoY29sb25JZHggPT09IC0xKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IHByb3AgPSBjc3NUb0NhbWVsQ2FzZShzLnN1YnN0cmluZygwLCBjb2xvbklkeCkudHJpbSgpKTtcbiAgICAgIGNvbnN0IHZhbCA9IHMuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKC9eLT9cXGQrKFxcLlxcZCspPyQvLnRlc3QodmFsKSkge1xuICAgICAgICByZXR1cm4gYCR7cHJvcH06ICR7dmFsfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7cHJvcH06ICcke3ZhbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJywgJyk7XG4gIHJldHVybiBgeyAke3Byb3BzfSB9YDtcbn07XG5cbi8qKlxuICogQ29udmVydCBhIEhhbmRsZWJhcnMgcHJvcGVydHkgcmVmZXJlbmNlIChlLmcuIFwicHJvcGVydGllcy5vdmVybGF5LW9wYWNpdHlcIiwgXCJ0aGlzLmltYWdlLnNyY1wiLFxuICogb3IgXCJzbGlkZS5pbWFnZS5zcmNcIiBpbnNpZGUge3sjZWFjaCBwcm9wZXJ0aWVzLnNsaWRlcyBhcyB8c2xpZGV8fX0pIHRvIGEgSlNYIGV4cHJlc3Npb24uXG4gKi9cbmNvbnN0IHJlc29sdmVQcm9wZXJ0eVJlZiA9IChyYXc6IHN0cmluZywgbG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlZiA9IHJhdy50cmltKCk7XG4gIHdoaWxlIChyZWYuc3RhcnRzV2l0aCgnLi4vJykpIHJlZiA9IHJlZi5zdWJzdHJpbmcoMyk7XG4gIGlmIChyZWYuc3RhcnRzV2l0aCgncHJvcGVydGllcy4nKSkge1xuICAgIGNvbnN0IHBhcnRzID0gcmVmLnJlcGxhY2UoJ3Byb3BlcnRpZXMuJywgJycpLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXJ0c1swXSk7XG4gICAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDEgPyBgJHtwcm9wTmFtZX0/LiR7cGFydHMuc2xpY2UoMSkuam9pbignPy4nKX1gIDogcHJvcE5hbWU7XG4gIH1cbiAgaWYgKHJlZiA9PT0gJ3RoaXMnKSB7XG4gICAgcmV0dXJuIGxvb3BWYXI7XG4gIH1cbiAgaWYgKHJlZi5zdGFydHNXaXRoKCd0aGlzLicpKSB7XG4gICAgcmV0dXJuIHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKGxvb3BWYXIsIHJlZi5yZXBsYWNlKCd0aGlzLicsICcnKSk7XG4gIH1cbiAgY29uc3QgcGFydHMgPSByZWYuc3BsaXQoJy4nKTtcbiAgaWYgKHBhcnRzLmxlbmd0aCA+IDEgJiYgcGFydHNbMF0gPT09IGxvb3BWYXIpIHtcbiAgICByZXR1cm4gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MobG9vcFZhciwgcGFydHMuc2xpY2UoMSkuam9pbignLicpKTtcbiAgfVxuICBpZiAoL15bYS16QS1aX11bXFx3XSooXFwuW2EtekEtWl9dW1xcd10qKSskLy50ZXN0KHJlZikpIHtcbiAgICBpZiAocGFydHNbMF0gPT09IGxvb3BWYXIpIHtcbiAgICAgIHJldHVybiB0b09wdGlvbmFsQ2hhaW5lZEFjY2Vzcyhsb29wVmFyLCBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJykpO1xuICAgIH1cbiAgICByZXR1cm4gcGFydHMuam9pbignPy4nKTtcbiAgfVxuICByZXR1cm4gdG9DYW1lbENhc2UocmVmKTtcbn07XG5cbi8qKlxuICogUGFyc2UgYSBDU1Mgc3R5bGUgc3RyaW5nIGludG8gYSBSZWFjdCBzdHlsZSBvYmplY3Qgc3RyaW5nLlxuICogSGFuZGxlcyBtaXhlZCBzdGF0aWMgYW5kIGR5bmFtaWMgKEhhbmRsZWJhcnMpIHZhbHVlcyBwZXItcHJvcGVydHkuXG4gKi9cbmV4cG9ydCBjb25zdCBwYXJzZVN0eWxlVG9PYmplY3QgPSAoc3R5bGVTdHI6IHN0cmluZywgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsb29wVmFyID0gY29udGV4dC5sb29wVmFyaWFibGUgfHwgJ2l0ZW0nO1xuICBjb25zdCBzdHlsZXMgPSBzdHlsZVN0ci5zcGxpdCgnOycpXG4gICAgLmZpbHRlcihzID0+IHMudHJpbSgpKVxuICAgIC5tYXAocyA9PiB7XG4gICAgICBjb25zdCBjb2xvbkluZGV4ID0gcy5pbmRleE9mKCc6Jyk7XG4gICAgICBpZiAoY29sb25JbmRleCA9PT0gLTEpIHJldHVybiBudWxsO1xuICAgICAgY29uc3QgcHJvcCA9IHMuc3Vic3RyaW5nKDAsIGNvbG9uSW5kZXgpLnRyaW0oKTtcbiAgICAgIGNvbnN0IHZhbCA9IHMuc3Vic3RyaW5nKGNvbG9uSW5kZXggKyAxKS50cmltKCk7XG4gICAgICBjb25zdCBjYW1lbFByb3AgPSBjc3NUb0NhbWVsQ2FzZShwcm9wKTtcblxuICAgICAgLy8gYmFja2dyb3VuZC1pbWFnZSB3aXRoIEhhbmRsZWJhcnMgaW1hZ2UgcHJvcGVydHkgcmVmZXJlbmNlcyAoc3VwcG9ydHMgbXVsdGlwbGUgdXJsKCkgdmFsdWVzKVxuICAgICAgaWYgKHByb3AgPT09ICdiYWNrZ3JvdW5kLWltYWdlJykge1xuICAgICAgICBjb25zdCB1cmxSZWdleCA9IC91cmxcXChbJ1wiXT9cXHtcXHtcXHMqKC4rPylcXHMqXFx9XFx9WydcIl0/XFwpL2c7XG4gICAgICAgIGNvbnN0IG1hdGNoZXMgPSBbLi4udmFsLm1hdGNoQWxsKHVybFJlZ2V4KV07XG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCByZWZzID0gbWF0Y2hlcy5tYXAobSA9PiByZXNvbHZlUHJvcGVydHlSZWYobVsxXSwgbG9vcFZhcikpO1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gcmVmcy5tYXAocmVmID0+IGAke3JlZn0gPyBcXGB1cmwoJ1xcJHske3JlZn19JylcXGAgOiBudWxsYCk7XG4gICAgICAgICAgcmV0dXJuIGBiYWNrZ3JvdW5kSW1hZ2U6IFske3BhcnRzLmpvaW4oJywgJyl9XS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKSB8fCB1bmRlZmluZWRgO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFZhbHVlIGlzIGEgc2ltcGxlIEhhbmRsZWJhcnMgZXhwcmVzc2lvbiDihpIgcmVzb2x2ZSB0byBKUyB2YXJpYWJsZVxuICAgICAgY29uc3QgaGJzTWF0Y2ggPSB2YWwubWF0Y2goL15cXHtcXHtcXHMqKC4rPylcXHMqXFx9XFx9JC8pO1xuICAgICAgaWYgKGhic01hdGNoKSB7XG4gICAgICAgIHJldHVybiBgJHtjYW1lbFByb3B9OiAke3Jlc29sdmVQcm9wZXJ0eVJlZihoYnNNYXRjaFsxXSwgbG9vcFZhcil9YDtcbiAgICAgIH1cblxuICAgICAgLy8gTnVtZXJpYyB2YWx1ZXMgZG9uJ3QgbmVlZCBxdW90ZXNcbiAgICAgIGlmICgvXi0/XFxkKyhcXC5cXGQrKT8kLy50ZXN0KHZhbCkpIHtcbiAgICAgICAgcmV0dXJuIGAke2NhbWVsUHJvcH06ICR7dmFsfWA7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHZhbHVlIGNvbnRhaW5zIHNpbmdsZSBxdW90ZXMgKGxpa2UgdXJsKCcuLi4nKSksIHVzZSBkb3VibGUgcXVvdGVzXG4gICAgICBpZiAodmFsLmluY2x1ZGVzKFwiJ1wiKSkge1xuICAgICAgICByZXR1cm4gYCR7Y2FtZWxQcm9wfTogXCIke3ZhbH1cImA7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBgJHtjYW1lbFByb3B9OiAnJHt2YWx9J2A7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJywgJyk7XG5cbiAgcmV0dXJuIGB7eyAke3N0eWxlc30gfX1gO1xufTtcbiJdfQ==