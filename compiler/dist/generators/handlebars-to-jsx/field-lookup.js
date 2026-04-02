"use strict";
/**
 * Field lookup utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupFieldType = void 0;
const utils_1 = require("./utils");
/**
 * Look up a field type from the properties object using dot notation path
 * e.g., "title" -> properties.title.type
 * e.g., "button.text" -> properties.button.properties.text.type
 * e.g., "breadcrumbs.label" -> properties.breadcrumbs.items.properties.label.type
 *
 * Returns null if the field path doesn't resolve to a known property.
 * This allows callers to decide how to handle unresolved fields.
 */
const lookupFieldType = (fieldPath, properties) => {
    const parts = fieldPath.split('.');
    if (parts.length === 1) {
        // Top-level field
        const prop = properties[parts[0]] || properties[(0, utils_1.toCamelCase)(parts[0])];
        if (!prop) {
            return null; // Field not found
        }
        return prop.type || 'text';
    }
    // Nested field - traverse the path
    let current = properties;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const camelPart = (0, utils_1.toCamelCase)(part);
        // Try both original and camelCase
        let next = current[part] || current[camelPart];
        if (!next && current.properties) {
            next = current.properties[part] || current.properties[camelPart];
        }
        if (!next) {
            return null; // Field not found at this level
        }
        // If this is the last part, return its type
        if (i === parts.length - 1) {
            return next.type || 'text';
        }
        // Navigate deeper
        if (next.type === 'array' && next.items?.properties) {
            current = next.items.properties;
        }
        else if (next.type === 'object' && next.properties) {
            current = next.properties;
        }
        else if (next.properties) {
            current = next.properties;
        }
        else {
            current = next;
        }
    }
    return null; // Path didn't fully resolve
};
exports.lookupFieldType = lookupFieldType;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmllbGQtbG9va3VwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvaGFuZGxlYmFycy10by1qc3gvZmllbGQtbG9va3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsbUNBQXNDO0FBRXRDOzs7Ozs7OztHQVFHO0FBQ0ksTUFBTSxlQUFlLEdBQUcsQ0FBQyxTQUFpQixFQUFFLFVBQTJDLEVBQWlCLEVBQUU7SUFDL0csTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUVuQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkIsa0JBQWtCO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBQSxtQkFBVyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1YsT0FBTyxJQUFJLENBQUMsQ0FBQyxrQkFBa0I7UUFDakMsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUM7SUFDN0IsQ0FBQztJQUVELG1DQUFtQztJQUNuQyxJQUFJLE9BQU8sR0FBUSxVQUFVLENBQUM7SUFDOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN0QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEIsTUFBTSxTQUFTLEdBQUcsSUFBQSxtQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBRXBDLGtDQUFrQztRQUNsQyxJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2hDLElBQUksR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNWLE9BQU8sSUFBSSxDQUFDLENBQUMsZ0NBQWdDO1FBQy9DLENBQUM7UUFFRCw0Q0FBNEM7UUFDNUMsSUFBSSxDQUFDLEtBQUssS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMzQixPQUFPLElBQUksQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDO1FBQzdCLENBQUM7UUFFRCxrQkFBa0I7UUFDbEIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQ3BELE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUNsQyxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckQsT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDNUIsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzNCLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQzVCLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxHQUFHLElBQUksQ0FBQztRQUNqQixDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDLENBQUMsNEJBQTRCO0FBQzNDLENBQUMsQ0FBQztBQS9DVyxRQUFBLGVBQWUsbUJBK0MxQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRmllbGQgbG9va3VwIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmUHJvcGVydHkgfSBmcm9tICcuLi8uLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuXG4vKipcbiAqIExvb2sgdXAgYSBmaWVsZCB0eXBlIGZyb20gdGhlIHByb3BlcnRpZXMgb2JqZWN0IHVzaW5nIGRvdCBub3RhdGlvbiBwYXRoXG4gKiBlLmcuLCBcInRpdGxlXCIgLT4gcHJvcGVydGllcy50aXRsZS50eXBlXG4gKiBlLmcuLCBcImJ1dHRvbi50ZXh0XCIgLT4gcHJvcGVydGllcy5idXR0b24ucHJvcGVydGllcy50ZXh0LnR5cGVcbiAqIGUuZy4sIFwiYnJlYWRjcnVtYnMubGFiZWxcIiAtPiBwcm9wZXJ0aWVzLmJyZWFkY3J1bWJzLml0ZW1zLnByb3BlcnRpZXMubGFiZWwudHlwZVxuICogXG4gKiBSZXR1cm5zIG51bGwgaWYgdGhlIGZpZWxkIHBhdGggZG9lc24ndCByZXNvbHZlIHRvIGEga25vd24gcHJvcGVydHkuXG4gKiBUaGlzIGFsbG93cyBjYWxsZXJzIHRvIGRlY2lkZSBob3cgdG8gaGFuZGxlIHVucmVzb2x2ZWQgZmllbGRzLlxuICovXG5leHBvcnQgY29uc3QgbG9va3VwRmllbGRUeXBlID0gKGZpZWxkUGF0aDogc3RyaW5nLCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IHBhcnRzID0gZmllbGRQYXRoLnNwbGl0KCcuJyk7XG4gIFxuICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgLy8gVG9wLWxldmVsIGZpZWxkXG4gICAgY29uc3QgcHJvcCA9IHByb3BlcnRpZXNbcGFydHNbMF1dIHx8IHByb3BlcnRpZXNbdG9DYW1lbENhc2UocGFydHNbMF0pXTtcbiAgICBpZiAoIXByb3ApIHtcbiAgICAgIHJldHVybiBudWxsOyAvLyBGaWVsZCBub3QgZm91bmRcbiAgICB9XG4gICAgcmV0dXJuIHByb3AudHlwZSB8fCAndGV4dCc7XG4gIH1cbiAgXG4gIC8vIE5lc3RlZCBmaWVsZCAtIHRyYXZlcnNlIHRoZSBwYXRoXG4gIGxldCBjdXJyZW50OiBhbnkgPSBwcm9wZXJ0aWVzO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcGFydCA9IHBhcnRzW2ldO1xuICAgIGNvbnN0IGNhbWVsUGFydCA9IHRvQ2FtZWxDYXNlKHBhcnQpO1xuICAgIFxuICAgIC8vIFRyeSBib3RoIG9yaWdpbmFsIGFuZCBjYW1lbENhc2VcbiAgICBsZXQgbmV4dCA9IGN1cnJlbnRbcGFydF0gfHwgY3VycmVudFtjYW1lbFBhcnRdO1xuICAgIFxuICAgIGlmICghbmV4dCAmJiBjdXJyZW50LnByb3BlcnRpZXMpIHtcbiAgICAgIG5leHQgPSBjdXJyZW50LnByb3BlcnRpZXNbcGFydF0gfHwgY3VycmVudC5wcm9wZXJ0aWVzW2NhbWVsUGFydF07XG4gICAgfVxuICAgIFxuICAgIGlmICghbmV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7IC8vIEZpZWxkIG5vdCBmb3VuZCBhdCB0aGlzIGxldmVsXG4gICAgfVxuICAgIFxuICAgIC8vIElmIHRoaXMgaXMgdGhlIGxhc3QgcGFydCwgcmV0dXJuIGl0cyB0eXBlXG4gICAgaWYgKGkgPT09IHBhcnRzLmxlbmd0aCAtIDEpIHtcbiAgICAgIHJldHVybiBuZXh0LnR5cGUgfHwgJ3RleHQnO1xuICAgIH1cbiAgICBcbiAgICAvLyBOYXZpZ2F0ZSBkZWVwZXJcbiAgICBpZiAobmV4dC50eXBlID09PSAnYXJyYXknICYmIG5leHQuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgIGN1cnJlbnQgPSBuZXh0Lml0ZW1zLnByb3BlcnRpZXM7XG4gICAgfSBlbHNlIGlmIChuZXh0LnR5cGUgPT09ICdvYmplY3QnICYmIG5leHQucHJvcGVydGllcykge1xuICAgICAgY3VycmVudCA9IG5leHQucHJvcGVydGllcztcbiAgICB9IGVsc2UgaWYgKG5leHQucHJvcGVydGllcykge1xuICAgICAgY3VycmVudCA9IG5leHQucHJvcGVydGllcztcbiAgICB9IGVsc2Uge1xuICAgICAgY3VycmVudCA9IG5leHQ7XG4gICAgfVxuICB9XG4gIFxuICByZXR1cm4gbnVsbDsgLy8gUGF0aCBkaWRuJ3QgZnVsbHkgcmVzb2x2ZVxufTtcbiJdfQ==