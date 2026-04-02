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
        // Handle opacity with handlebars
        if (styleStr.includes('opacity')) {
            return `{{ opacity: overlayOpacity || 0.6 }}`;
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
        // Special handling for opacity - make it dynamic
        if (prop === 'opacity') {
            return `${camelProp}: overlayOpacity || 0.6`;
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvaGFuZGxlYmFycy10by1qc3gvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsbUNBQXNEO0FBRXREOzs7O0dBSUc7QUFDSSxNQUFNLHNCQUFzQixHQUFHLENBQUMsTUFBYyxFQUFVLEVBQUU7SUFDL0QsTUFBTSxLQUFLLEdBQUcsTUFBTTtTQUNqQixLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ3JCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNQLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBQSxzQkFBYyxFQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDN0QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0MsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxPQUFPLEdBQUcsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQzNCLENBQUM7UUFDRCxPQUFPLEdBQUcsSUFBSSxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUM7SUFDbEQsQ0FBQyxDQUFDO1NBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQztTQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNkLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQztBQUN4QixDQUFDLENBQUM7QUFqQlcsUUFBQSxzQkFBc0IsMEJBaUJqQztBQUVGOztHQUVHO0FBQ0ksTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFFBQWdCLEVBQUUsT0FBMEIsRUFBVSxFQUFFO0lBQ3pGLGdEQUFnRDtJQUNoRCxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUM1QiwwQ0FBMEM7UUFDMUMsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztZQUMxQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLDZFQUE2RSxDQUFDLENBQUM7WUFDNUcsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDVixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUM5QixNQUFNLFNBQVMsR0FBRyxJQUFBLG1CQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BDLDREQUE0RDtnQkFDNUQsT0FBTyx1QkFBdUIsU0FBUyxLQUFLLEtBQUssZ0JBQWdCLFNBQVMsSUFBSSxLQUFLLHNCQUFzQixDQUFDO1lBQzVHLENBQUM7UUFDSCxDQUFDO1FBRUQsaUNBQWlDO1FBQ2pDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sc0NBQXNDLENBQUM7UUFDaEQsQ0FBQztJQUNILENBQUM7SUFFRCxzQkFBc0I7SUFDdEIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7U0FDL0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ3JCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNQLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxVQUFVLEtBQUssQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDbkMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDL0MsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxzQkFBYyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBRXZDLGlEQUFpRDtRQUNqRCxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN2QixPQUFPLEdBQUcsU0FBUyx5QkFBeUIsQ0FBQztRQUMvQyxDQUFDO1FBRUQsbUNBQW1DO1FBQ25DLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDaEMsT0FBTyxHQUFHLFNBQVMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNoQyxDQUFDO1FBRUQsdUZBQXVGO1FBQ3ZGLG9DQUFvQztRQUNwQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN0QixzQ0FBc0M7WUFDdEMsT0FBTyxHQUFHLFNBQVMsTUFBTSxHQUFHLEdBQUcsQ0FBQztRQUNsQyxDQUFDO1FBRUQsT0FBTyxHQUFHLFNBQVMsTUFBTSxHQUFHLEdBQUcsQ0FBQztJQUNsQyxDQUFDLENBQUM7U0FDRCxNQUFNLENBQUMsT0FBTyxDQUFDO1NBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWQsT0FBTyxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBQzNCLENBQUMsQ0FBQztBQXJEVyxRQUFBLGtCQUFrQixzQkFxRDdCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTdHlsZSBwYXJzaW5nIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UsIGNzc1RvQ2FtZWxDYXNlIH0gZnJvbSAnLi91dGlscyc7XG5cbi8qKlxuICogQ29udmVydCBhIHN0YXRpYyBDU1Mgc3RyaW5nIChlLmcuIFwiZGlzcGxheTogYmxvY2s7IGNvbG9yOiByZWQ7XCIpIHRvIGEgUmVhY3QgaW5saW5lIHN0eWxlIG9iamVjdFxuICogbGl0ZXJhbCBzdHJpbmcgKGUuZy4gXCJ7IGRpc3BsYXk6ICdibG9jaycsIGNvbG9yOiAncmVkJyB9XCIpLiBVc2VkIHdoZW4gYSBjb25kaXRpb25hbCB3cmFwcyBhblxuICogZW50aXJlIHN0eWxlIGF0dHJpYnV0ZSBzbyB0aGUgdmFsdWUgZXhwcmVzc2lvbiBuZWVkcyB0byBiZSBhIFJlYWN0IG9iamVjdCwgbm90IGEgQ1NTIHN0cmluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IGNzc1N0cmluZ1RvUmVhY3RPYmplY3QgPSAoY3NzU3RyOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBwcm9wcyA9IGNzc1N0clxuICAgIC5zcGxpdCgnOycpXG4gICAgLmZpbHRlcihzID0+IHMudHJpbSgpKVxuICAgIC5tYXAocyA9PiB7XG4gICAgICBjb25zdCBjb2xvbklkeCA9IHMuaW5kZXhPZignOicpO1xuICAgICAgaWYgKGNvbG9uSWR4ID09PSAtMSkgcmV0dXJuIG51bGw7XG4gICAgICBjb25zdCBwcm9wID0gY3NzVG9DYW1lbENhc2Uocy5zdWJzdHJpbmcoMCwgY29sb25JZHgpLnRyaW0oKSk7XG4gICAgICBjb25zdCB2YWwgPSBzLnN1YnN0cmluZyhjb2xvbklkeCArIDEpLnRyaW0oKTtcbiAgICAgIGlmICgvXi0/XFxkKyhcXC5cXGQrKT8kLy50ZXN0KHZhbCkpIHtcbiAgICAgICAgcmV0dXJuIGAke3Byb3B9OiAke3ZhbH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke3Byb3B9OiAnJHt2YWwucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpfSdgO1xuICAgIH0pXG4gICAgLmZpbHRlcihCb29sZWFuKVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYHsgJHtwcm9wc30gfWA7XG59O1xuXG4vKipcbiAqIFBhcnNlIGEgQ1NTIHN0eWxlIHN0cmluZyBpbnRvIGEgUmVhY3Qgc3R5bGUgb2JqZWN0IHN0cmluZ1xuICovXG5leHBvcnQgY29uc3QgcGFyc2VTdHlsZVRvT2JqZWN0ID0gKHN0eWxlU3RyOiBzdHJpbmcsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0KTogc3RyaW5nID0+IHtcbiAgLy8gQ2hlY2sgZm9yIGhhbmRsZWJhcnMgZXhwcmVzc2lvbnMgaW4gdGhlIHN0eWxlXG4gIGlmIChzdHlsZVN0ci5pbmNsdWRlcygne3snKSkge1xuICAgIC8vIEhhbmRsZSBiYWNrZ3JvdW5kLWltYWdlIHdpdGggaGFuZGxlYmFyc1xuICAgIGlmIChzdHlsZVN0ci5pbmNsdWRlcygnYmFja2dyb3VuZC1pbWFnZScpKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IHN0eWxlU3RyLm1hdGNoKC9iYWNrZ3JvdW5kLWltYWdlOlxccyp1cmxcXChbJ1wiXT9cXHtcXHtcXHMqcHJvcGVydGllc1xcLihcXHcrKVxcLihcXHcrKVxccypcXH1cXH1bJ1wiXT9cXCkvKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBjb25zdCBbLCBwcm9wLCBmaWVsZF0gPSBtYXRjaDtcbiAgICAgICAgY29uc3QgY2FtZWxQcm9wID0gdG9DYW1lbENhc2UocHJvcCk7XG4gICAgICAgIC8vIEtlZXAgJ3NyYycgYXMtaXMgdG8gbWF0Y2ggSGFuZG9mZidzIGltYWdlIHByb3BlcnR5IG5hbWluZ1xuICAgICAgICByZXR1cm4gYHt7IGJhY2tncm91bmRJbWFnZTogJHtjYW1lbFByb3B9Py4ke2ZpZWxkfSA/IFxcYHVybCgnXFwkeyR7Y2FtZWxQcm9wfS4ke2ZpZWxkfX0nKVxcYCA6IHVuZGVmaW5lZCB9fWA7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEhhbmRsZSBvcGFjaXR5IHdpdGggaGFuZGxlYmFyc1xuICAgIGlmIChzdHlsZVN0ci5pbmNsdWRlcygnb3BhY2l0eScpKSB7XG4gICAgICByZXR1cm4gYHt7IG9wYWNpdHk6IG92ZXJsYXlPcGFjaXR5IHx8IDAuNiB9fWA7XG4gICAgfVxuICB9XG4gIFxuICAvLyBQYXJzZSBzdGF0aWMgc3R5bGVzXG4gIGNvbnN0IHN0eWxlcyA9IHN0eWxlU3RyLnNwbGl0KCc7JylcbiAgICAuZmlsdGVyKHMgPT4gcy50cmltKCkpXG4gICAgLm1hcChzID0+IHtcbiAgICAgIGNvbnN0IGNvbG9uSW5kZXggPSBzLmluZGV4T2YoJzonKTtcbiAgICAgIGlmIChjb2xvbkluZGV4ID09PSAtMSkgcmV0dXJuIG51bGw7XG4gICAgICBjb25zdCBwcm9wID0gcy5zdWJzdHJpbmcoMCwgY29sb25JbmRleCkudHJpbSgpO1xuICAgICAgY29uc3QgdmFsID0gcy5zdWJzdHJpbmcoY29sb25JbmRleCArIDEpLnRyaW0oKTtcbiAgICAgIGNvbnN0IGNhbWVsUHJvcCA9IGNzc1RvQ2FtZWxDYXNlKHByb3ApO1xuICAgICAgXG4gICAgICAvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBvcGFjaXR5IC0gbWFrZSBpdCBkeW5hbWljXG4gICAgICBpZiAocHJvcCA9PT0gJ29wYWNpdHknKSB7XG4gICAgICAgIHJldHVybiBgJHtjYW1lbFByb3B9OiBvdmVybGF5T3BhY2l0eSB8fCAwLjZgO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBOdW1lcmljIHZhbHVlcyBkb24ndCBuZWVkIHF1b3Rlc1xuICAgICAgaWYgKC9eLT9cXGQrKFxcLlxcZCspPyQvLnRlc3QodmFsKSkge1xuICAgICAgICByZXR1cm4gYCR7Y2FtZWxQcm9wfTogJHt2YWx9YDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gSWYgdmFsdWUgY29udGFpbnMgc2luZ2xlIHF1b3RlcyAobGlrZSB1cmwoJy4uLicpKSwgdXNlIGRvdWJsZSBxdW90ZXMgZm9yIHRoZSB3cmFwcGVyXG4gICAgICAvLyBvciBlc2NhcGUgdGhlIGlubmVyIHNpbmdsZSBxdW90ZXNcbiAgICAgIGlmICh2YWwuaW5jbHVkZXMoXCInXCIpKSB7XG4gICAgICAgIC8vIFVzZSBkb3VibGUgcXVvdGVzIHRvIHdyYXAgdGhlIHZhbHVlXG4gICAgICAgIHJldHVybiBgJHtjYW1lbFByb3B9OiBcIiR7dmFsfVwiYDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIGAke2NhbWVsUHJvcH06ICcke3ZhbH0nYDtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAuam9pbignLCAnKTtcbiAgXG4gIHJldHVybiBge3sgJHtzdHlsZXN9IH19YDtcbn07XG4iXX0=