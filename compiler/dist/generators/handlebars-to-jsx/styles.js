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
 * Parse a CSS style string into a React style object string
 */
const parseStyleToObject = (styleStr, context) => {
    // Check for handlebars expressions in the style
    if (styleStr.includes('{{')) {
        // Handle background-image with handlebars
        if (styleStr.includes('background-image')) {
            const match = styleStr.match(/background-image:\s*url\(['"]?\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}['"]?\)/);
            if (match) {
                const [, prop, field] = match;
                const camelProp = (0, utils_1.toCamelCase)(prop);
                // Keep 'src' as-is to match Handoff's image property naming
                return `{{ backgroundImage: ${camelProp}?.${field} ? \`url('\${${camelProp}.${field}}')\` : undefined }}`;
            }
        }
        // Handle opacity with handlebars — preserve the expression as-is
        if (styleStr.includes('opacity')) {
            const opacityMatch = styleStr.match(/opacity:\s*\{\{\s*(.+?)\s*\}\}/);
            if (opacityMatch) {
                return `{{ opacity: ${opacityMatch[1]} }}`;
            }
        }
    }
    // Parse static styles
    const styles = styleStr.split(';')
        .filter(s => s.trim())
        .map(s => {
        const colonIndex = s.indexOf(':');
        if (colonIndex === -1)
            return null;
        const prop = s.substring(0, colonIndex).trim();
        const val = s.substring(colonIndex + 1).trim();
        const camelProp = (0, utils_1.cssToCamelCase)(prop);
        // Numeric values don't need quotes
        if (/^-?\d+(\.\d+)?$/.test(val)) {
            return `${camelProp}: ${val}`;
        }
        // If value contains single quotes (like url('...')), use double quotes for the wrapper
        // or escape the inner single quotes
        if (val.includes("'")) {
            // Use double quotes to wrap the value
            return `${camelProp}: "${val}"`;
        }
        return `${camelProp}: '${val}'`;
    })
        .filter(Boolean)
        .join(', ');
    return `{{ ${styles} }}`;
};
exports.parseStyleToObject = parseStyleToObject;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvaGFuZGxlYmFycy10by1qc3gvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsbUNBQXNEO0FBRXREOzs7O0dBSUc7QUFDSSxNQUFNLHNCQUFzQixHQUFHLENBQUMsTUFBYyxFQUFVLEVBQUU7SUFDL0QsTUFBTSxLQUFLLEdBQUcsTUFBTTtTQUNqQixLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ3JCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNQLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBQSxzQkFBYyxFQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDN0QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0MsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxPQUFPLEdBQUcsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQzNCLENBQUM7UUFDRCxPQUFPLEdBQUcsSUFBSSxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7SUFDbEQsQ0FBQyxDQUFDO1NBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQztTQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNkLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQztBQUN4QixDQUFDLENBQUM7QUFqQlcsUUFBQSxzQkFBc0IsMEJBaUJqQztBQUVGOztHQUVHO0FBQ0ksTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsT0FBMEIsRUFBVSxFQUFFO0lBQ3pGLGdEQUFnRDtJQUNoRCxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUM1QiwwQ0FBMEM7UUFDMUMsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztZQUMxQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLDZFQUE2RSxDQUFDLENBQUM7WUFDNUcsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDVixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUM5QixNQUFNLFNBQVMsR0FBRyxJQUFBLG1CQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BDLDREQUE0RDtnQkFDNUQsT0FBTyx1QkFBdUIsU0FBUyxLQUFLLEtBQUssZ0JBQWdCLFNBQVMsSUFBSSxLQUFLLHNCQUFzQixDQUFDO1lBQzVHLENBQUM7UUFDSCxDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztZQUN0RSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQixPQUFPLGVBQWUsWUFBWSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDN0MsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQsc0JBQXNCO0lBQ3RCLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDO1NBQy9CLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUNyQixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDUCxNQUFNLFVBQVUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksVUFBVSxLQUFLLENBQUMsQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQ25DLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9DLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9DLE1BQU0sU0FBUyxHQUFHLElBQUEsc0JBQWMsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUV2QyxtQ0FBbUM7UUFDbkMsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxPQUFPLEdBQUcsU0FBUyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ2hDLENBQUM7UUFFRCx1RkFBdUY7UUFDdkYsb0NBQW9DO1FBQ3BDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RCLHNDQUFzQztZQUN0QyxPQUFPLEdBQUcsU0FBUyxNQUFNLEdBQUcsR0FBRyxDQUFDO1FBQ2xDLENBQUM7UUFFRCxPQUFPLEdBQUcsU0FBUyxNQUFNLEdBQUcsR0FBRyxDQUFDO0lBQ2xDLENBQUMsQ0FBQztTQUNELE1BQU0sQ0FBQyxPQUFPLENBQUM7U0FDZixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFZCxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBbkRXLFFBQUEsa0JBQWtCLHNCQW1EN0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFN0eWxlIHBhcnNpbmcgdXRpbGl0aWVzIGZvciB0aGUgSGFuZGxlYmFycyB0byBKU1ggdHJhbnNwaWxlclxuICovXG5cbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0IH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSwgY3NzVG9DYW1lbENhc2UgfSBmcm9tICcuL3V0aWxzJztcblxuLyoqXG4gKiBDb252ZXJ0IGEgc3RhdGljIENTUyBzdHJpbmcgKGUuZy4gXCJkaXNwbGF5OiBibG9jazsgY29sb3I6IHJlZDtcIikgdG8gYSBSZWFjdCBpbmxpbmUgc3R5bGUgb2JqZWN0XG4gKiBsaXRlcmFsIHN0cmluZyAoZS5nLiBcInsgZGlzcGxheTogJ2Jsb2NrJywgY29sb3I6ICdyZWQnIH1cIikuIFVzZWQgd2hlbiBhIGNvbmRpdGlvbmFsIHdyYXBzIGFuXG4gKiBlbnRpcmUgc3R5bGUgYXR0cmlidXRlIHNvIHRoZSB2YWx1ZSBleHByZXNzaW9uIG5lZWRzIHRvIGJlIGEgUmVhY3Qgb2JqZWN0LCBub3QgYSBDU1Mgc3RyaW5nLlxuICovXG5leHBvcnQgY29uc3QgY3NzU3RyaW5nVG9SZWFjdE9iamVjdCA9IChjc3NTdHI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IHByb3BzID0gY3NzU3RyXG4gICAgLnNwbGl0KCc7JylcbiAgICAuZmlsdGVyKHMgPT4gcy50cmltKCkpXG4gICAgLm1hcChzID0+IHtcbiAgICAgIGNvbnN0IGNvbG9uSWR4ID0gcy5pbmRleE9mKCc6Jyk7XG4gICAgICBpZiAoY29sb25JZHggPT09IC0xKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IHByb3AgPSBjc3NUb0NhbWVsQ2FzZShzLnN1YnN0cmluZygwLCBjb2xvbklkeCkudHJpbSgpKTtcbiAgICAgIGNvbnN0IHZhbCA9IHMuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSkudHJpbSgpO1xuICAgICAgaWYgKC9eLT9cXGQrKFxcLlxcZCspPyQvLnRlc3QodmFsKSkge1xuICAgICAgICByZXR1cm4gYCR7cHJvcH06ICR7dmFsfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7cHJvcH06ICcke3ZhbC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJywgJyk7XG4gIHJldHVybiBgeyAke3Byb3BzfSB9YDtcbn07XG5cbi8qKlxuICogUGFyc2UgYSBDU1Mgc3R5bGUgc3RyaW5nIGludG8gYSBSZWFjdCBzdHlsZSBvYmplY3Qgc3RyaW5nXG4gKi9cbmV4cG9ydCBjb25zdCBwYXJzZVN0eWxlVG9PYmplY3QgPSAoc3R5bGVTdHI6IHN0cmluZywgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQpOiBzdHJpbmcgPT4ge1xuICAvLyBDaGVjayBmb3IgaGFuZGxlYmFycyBleHByZXNzaW9ucyBpbiB0aGUgc3R5bGVcbiAgaWYgKHN0eWxlU3RyLmluY2x1ZGVzKCd7eycpKSB7XG4gICAgLy8gSGFuZGxlIGJhY2tncm91bmQtaW1hZ2Ugd2l0aCBoYW5kbGViYXJzXG4gICAgaWYgKHN0eWxlU3RyLmluY2x1ZGVzKCdiYWNrZ3JvdW5kLWltYWdlJykpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gc3R5bGVTdHIubWF0Y2goL2JhY2tncm91bmQtaW1hZ2U6XFxzKnVybFxcKFsnXCJdP1xce1xce1xccypwcm9wZXJ0aWVzXFwuKFxcdyspXFwuKFxcdyspXFxzKlxcfVxcfVsnXCJdP1xcKS8pO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IFssIHByb3AsIGZpZWxkXSA9IG1hdGNoO1xuICAgICAgICBjb25zdCBjYW1lbFByb3AgPSB0b0NhbWVsQ2FzZShwcm9wKTtcbiAgICAgICAgLy8gS2VlcCAnc3JjJyBhcy1pcyB0byBtYXRjaCBIYW5kb2ZmJ3MgaW1hZ2UgcHJvcGVydHkgbmFtaW5nXG4gICAgICAgIHJldHVybiBge3sgYmFja2dyb3VuZEltYWdlOiAke2NhbWVsUHJvcH0/LiR7ZmllbGR9ID8gXFxgdXJsKCdcXCR7JHtjYW1lbFByb3B9LiR7ZmllbGR9fScpXFxgIDogdW5kZWZpbmVkIH19YDtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gSGFuZGxlIG9wYWNpdHkgd2l0aCBoYW5kbGViYXJzIOKAlCBwcmVzZXJ2ZSB0aGUgZXhwcmVzc2lvbiBhcy1pc1xuICAgIGlmIChzdHlsZVN0ci5pbmNsdWRlcygnb3BhY2l0eScpKSB7XG4gICAgICBjb25zdCBvcGFjaXR5TWF0Y2ggPSBzdHlsZVN0ci5tYXRjaCgvb3BhY2l0eTpcXHMqXFx7XFx7XFxzKiguKz8pXFxzKlxcfVxcfS8pO1xuICAgICAgaWYgKG9wYWNpdHlNYXRjaCkge1xuICAgICAgICByZXR1cm4gYHt7IG9wYWNpdHk6ICR7b3BhY2l0eU1hdGNoWzFdfSB9fWA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIFxuICAvLyBQYXJzZSBzdGF0aWMgc3R5bGVzXG4gIGNvbnN0IHN0eWxlcyA9IHN0eWxlU3RyLnNwbGl0KCc7JylcbiAgICAuZmlsdGVyKHMgPT4gcy50cmltKCkpXG4gICAgLm1hcChzID0+IHtcbiAgICAgIGNvbnN0IGNvbG9uSW5kZXggPSBzLmluZGV4T2YoJzonKTtcbiAgICAgIGlmIChjb2xvbkluZGV4ID09PSAtMSkgcmV0dXJuIG51bGw7XG4gICAgICBjb25zdCBwcm9wID0gcy5zdWJzdHJpbmcoMCwgY29sb25JbmRleCkudHJpbSgpO1xuICAgICAgY29uc3QgdmFsID0gcy5zdWJzdHJpbmcoY29sb25JbmRleCArIDEpLnRyaW0oKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IGNzc1RvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgXG4gICAgICAvLyBOdW1lcmljIHZhbHVlcyBkb24ndCBuZWVkIHF1b3Rlc1xuICAgICAgaWYgKC9eLT9cXGQrKFxcLlxcZCspPyQvLnRlc3QodmFsKSkge1xuICAgICAgICByZXR1cm4gYCR7Y2FtZWxQcm9wfTogJHt2YWx9YDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gSWYgdmFsdWUgY29udGFpbnMgc2luZ2xlIHF1b3RlcyAobGlrZSB1cmwoJy4uLicpKSwgdXNlIGRvdWJsZSBxdW90ZXMgZm9yIHRoZSB3cmFwcGVyXG4gICAgICAvLyBvciBlc2NhcGUgdGhlIGlubmVyIHNpbmdsZSBxdW90ZXNcbiAgICAgIGlmICh2YWwuaW5jbHVkZXMoXCInXCIpKSB7XG4gICAgICAgIC8vIFVzZSBkb3VibGUgcXVvdGVzIHRvIHdyYXAgdGhlIHZhbHVlXG4gICAgICAgIHJldHVybiBgJHtjYW1lbFByb3B9OiBcIiR7dmFsfVwiYDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIGAke2NhbWVsUHJvcH06ICcke3ZhbH0nYDtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAuam9pbignLCAnKTtcbiAgXG4gIHJldHVybiBge3sgJHtzdHlsZXN9IH19YDtcbn07XG4iXX0=