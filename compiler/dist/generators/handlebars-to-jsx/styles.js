"use strict";
/**
 * Style parsing utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseStyleToObject = exports.cssStringToReactObject = void 0;
const utils_1 = require("./utils");
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
 * Convert a Handlebars property reference (e.g. "properties.overlay-opacity")
 * to a camelCase JS variable, stripping the "properties." prefix.
 */
const resolvePropertyRef = (raw) => {
    let ref = raw.trim();
    while (ref.startsWith('../'))
        ref = ref.substring(3);
    if (ref.startsWith('properties.')) {
        const parts = ref.replace('properties.', '').split('.');
        const propName = (0, utils_1.toCamelCase)(parts[0]);
        return parts.length > 1 ? `${propName}?.${parts.slice(1).join('.')}` : propName;
    }
    return (0, utils_1.toCamelCase)(ref);
};
/**
 * Parse a CSS style string into a React style object string.
 * Handles mixed static and dynamic (Handlebars) values per-property.
 */
const parseStyleToObject = (styleStr, context) => {
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
                const refs = matches.map(m => resolvePropertyRef(m[1]));
                const parts = refs.map(ref => `${ref} ? \`url('\${${ref}}')\` : null`);
                return `backgroundImage: [${parts.join(', ')}].filter(Boolean).join(', ') || undefined`;
            }
        }
        // Value is a simple Handlebars expression → resolve to JS variable
        const hbsMatch = val.match(/^\{\{\s*(.+?)\s*\}\}$/);
        if (hbsMatch) {
            return `${camelProp}: ${resolvePropertyRef(hbsMatch[1])}`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvaGFuZGxlYmFycy10by1qc3gvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsbUNBQXNEO0FBRXREOzs7O0dBSUc7QUFDSSxNQUFNLHNCQUFzQixHQUFHLENBQUMsTUFBYyxFQUFVLEVBQUU7SUFDL0QsTUFBTSxLQUFLLEdBQUcsTUFBTTtTQUNqQixLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ3JCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNQLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBQSxzQkFBYyxFQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDN0QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0MsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxPQUFPLEdBQUcsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQzNCLENBQUM7UUFDRCxPQUFPLEdBQUcsSUFBSSxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7SUFDbEQsQ0FBQyxDQUFDO1NBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQztTQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FB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QUFFLENBQUM7WUFDYixPQUFPLEdBQUcsU0FBUyxLQUFLLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDNUQsQ0FBQztRQUVELG1DQUFtQztRQUNuQyxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sR0FBRyxTQUFTLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDaEMsQ0FBQztRQUVELHVFQUF1RTtRQUN2RSxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN0QixPQUFPLEdBQUcsU0FBUyxNQUFNLEdBQUcsR0FBRyxDQUFDO1FBQ2xDLENBQUM7UUFFRCxPQUFPLEdBQUcsU0FBUyxNQUFNLEdBQUcsR0FBRyxDQUFDO0lBQ2xDLENBQUMsQ0FBQztTQUNELE1BQU0sQ0FBQyxPQUFPLENBQUM7U0FDZixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFZCxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBM0NXLFFBQUEsa0JBQWtCLHNCQTJDN0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFN0eWxlIHBhcnNpbmcgdXRpbGl0aWVzIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0IH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSwgY3NzVG9DYW1lbENhc2UgfSBmcm9tICcuL3V0aWxzJztcblxuLyoqXG4gKiBDb252ZXJ0IGEgc3RhdGljIENTUyBzdHJpbmcgKGUuZy4gXCJkaXNwbGF5OiBibG9jazsgY29sb3I6IHJlZDtcIikgdG8gYSBSZWFjdCBpbmxpbmUgc3R5bGUgb2JqZWN0XG4gKiBsaXRlcmFsIHN0cmluZyAoZS5nLiBcInsgZGlzcGxheTogJ2Jsb2NrJywgY29sb3I6ICdyZWQnIH1cIikuIFVzZWQgd2hlbiBhIGNvbmRpdGlvbmFsIHdyYXBzIGFuXG4gKiBlbnRpcmUgc3R5bGUgYXR0cmlidXRlIHNvIHRoZSB2YWx1ZSBleHByZXNzaW9uIG5lZWRzIHRvIGJlIGEgUmVhY3Qgb2JqZWN0LCBub3QgYSBDU1Mgc3RyaW5nLlxuICovXG5leHBvcnQgY29uc3QgY3NzU3RyaW5nVG9SZWFjdE9iamVjdCA9IChjc3NTdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHByb3BzID0gY3NzU3RyXG4gICAgLnNwbGl0KCc7JylcbiAgICAuZmlsdGVyKHMgPT4gcy50cmltKCkpXG4gICAgLm1hcChzID0+IHtcbiAgICAgIGNvbnN0IGNvbG9uSWR4ID0gcy5pbmRleE9mKCc6Jyk7XG4gICAgICBpZiAoY29sb25JZHggPT09IC0xKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IHByb3AgPSBjc3NUb0NhbWVsQ2FzZShzLnN1YnN0cmluZygwLCBjb2xvbklkeCkudHJpbSgpKTtcbiAgICAgIGNvbnN0IHZhbCA9IHMuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKC9eLT9cXGQrKFxcLlxcZCspPyQvLnRlc3QodmFsKSkge1xuICAgICAgICByZXR1cm4gYCR7cHJvcH06ICR7dmFsfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7cHJvcH06ICcke3ZhbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJywgJyk7XG4gIHJldHVybiBgeyAke3Byb3BzfSB9YDtcbn07XG5cbi8qKlxuICogQ29udmVydCBhIEhhbmRsZWJhcnMgcHJvcGVydHkgcmVmZXJlbmNlIChlLmcuIFwicHJvcGVydGllcy5vdmVybGF5LW9wYWNpdHlcIilcbiAqIHRvIGEgY2FtZWxDYXNlIEpTIHZhcmlhYmxlLCBzdHJpcHBpbmcgdGhlIFwicHJvcGVydGllcy5cIiBwcmVmaXguXG4gKi9cbmNvbnN0IHJlc29sdmVQcm9wZXJ0eVJlZiA9IChyYXc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGxldCByZWYgPSByYXcudHJpbSgpO1xuICB3aGlsZSAocmVmLnN0YXJ0c1dpdGgoJy4uLycpKSByZWYgPSByZWYuc3Vic3RyaW5nKDMpO1xuICBpZiAocmVmLnN0YXJ0c1dpdGgoJ3Byb3BlcnRpZXMuJykpIHtcbiAgICBjb25zdCBwYXJ0cyA9IHJlZi5yZXBsYWNlKCdwcm9wZXJ0aWVzLicsICcnKS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGFydHNbMF0pO1xuICAgIHJldHVybiBwYXJ0cy5sZW5ndGggPiAxID8gYCR7cHJvcE5hbWV9Py4ke3BhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKX1gIDogcHJvcE5hbWU7XG4gIH1cbiAgcmV0dXJuIHRvQ2FtZWxDYXNlKHJlZik7XG59O1xuXG4vKipcbiAqIFBhcnNlIGEgQ1NTIHN0eWxlIHN0cmluZyBpbnRvIGEgUmVhY3Qgc3R5bGUgb2JqZWN0IHN0cmluZy5cbiAqIEhhbmRsZXMgbWl4ZWQgc3RhdGljIGFuZCBkeW5hbWljIChIYW5kbGViYXJzKSB2YWx1ZXMgcGVyLXByb3BlcnR5LlxuICovXG5leHBvcnQgY29uc3QgcGFyc2VTdHlsZVRvT2JqZWN0ID0gKHN0eWxlU3RyOiBzdHJpbmcsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0KTogc3RyaW5nID0+IHtcbiAgY29uc3Qgc3R5bGVzID0gc3R5bGVTdHIuc3BsaXQoJzsnKVxuICAgIC5maWx0ZXIocyA9PiBzLnRyaW0oKSlcbiAgICAubWFwKHMgPT4ge1xuICAgICAgY29uc3QgY29sb25JbmRleCA9IHMuaW5kZXhPZignOicpO1xuICAgICAgaWYgKGNvbG9uSW5kZXggPT09IC0xKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IHByb3AgPSBzLnN1YnN0cmluZygwLCBjb2xvbkluZGV4KS50cmltKCk7XG4gICAgICBjb25zdCB2YWwgPSBzLnN1YnN0cmluZyhjb2xvbkluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgY29uc3QgY2FtZWxQcm9wID0gY3NzVG9DYW1lbENhc2UocHJvcCk7XG5cbiAgICAgIC8vIGJhY2tncm91bmQtaW1hZ2Ugd2l0aCBIYW5kbGViYXJzIGltYWdlIHByb3BlcnR5IHJlZmVyZW5jZXMgKHN1cHBvcnRzIG11bHRpcGxlIHVybCgpIHZhbHVlcylcbiAgICAgIGlmIChwcm9wID09PSAnYmFja2dyb3VuZC1pbWFnZScpIHtcbiAgICAgICAgY29uc3QgdXJsUmVnZXggPSAvdXJsXFwoWydcIl0/XFx7XFx7XFxzKiguKz8pXFxzKlxcfVxcfVsnXCJdP1xcKS9nO1xuICAgICAgICBjb25zdCBtYXRjaGVzID0gWy4uLnZhbC5tYXRjaEFsbCh1cmxSZWdleCldO1xuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3QgcmVmcyA9IG1hdGNoZXMubWFwKG0gPT4gcmVzb2x2ZVByb3BlcnR5UmVmKG1bMV0pKTtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHJlZnMubWFwKHJlZiA9PiBgJHtyZWZ9ID8gXFxgdXJsKCdcXCR7JHtyZWZ9fScpXFxgIDogbnVsbGApO1xuICAgICAgICAgIHJldHVybiBgYmFja2dyb3VuZEltYWdlOiBbJHtwYXJ0cy5qb2luKCcsICcpfV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJykgfHwgdW5kZWZpbmVkYDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBWYWx1ZSBpcyBhIHNpbXBsZSBIYW5kbGViYXJzIGV4cHJlc3Npb24g4oaSIHJlc29sdmUgdG8gSlMgdmFyaWFibGVcbiAgICAgIGNvbnN0IGhic01hdGNoID0gdmFsLm1hdGNoKC9eXFx7XFx7XFxzKiguKz8pXFxzKlxcfVxcfSQvKTtcbiAgICAgIGlmIChoYnNNYXRjaCkge1xuICAgICAgICByZXR1cm4gYCR7Y2FtZWxQcm9wfTogJHtyZXNvbHZlUHJvcGVydHlSZWYoaGJzTWF0Y2hbMV0pfWA7XG4gICAgICB9XG5cbiAgICAgIC8vIE51bWVyaWMgdmFsdWVzIGRvbid0IG5lZWQgcXVvdGVzXG4gICAgICBpZiAoL14tP1xcZCsoXFwuXFxkKyk/JC8udGVzdCh2YWwpKSB7XG4gICAgICAgIHJldHVybiBgJHtjYW1lbFByb3B9OiAke3ZhbH1gO1xuICAgICAgfVxuXG4gICAgICAvLyBJZiB2YWx1ZSBjb250YWlucyBzaW5nbGUgcXVvdGVzIChsaWtlIHVybCgnLi4uJykpLCB1c2UgZG91YmxlIHF1b3Rlc1xuICAgICAgaWYgKHZhbC5pbmNsdWRlcyhcIidcIikpIHtcbiAgICAgICAgcmV0dXJuIGAke2NhbWVsUHJvcH06IFwiJHt2YWx9XCJgO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYCR7Y2FtZWxQcm9wfTogJyR7dmFsfSdgO1xuICAgIH0pXG4gICAgLmZpbHRlcihCb29sZWFuKVxuICAgIC5qb2luKCcsICcpO1xuXG4gIHJldHVybiBge3sgJHtzdHlsZXN9IH19YDtcbn07XG4iXX0=