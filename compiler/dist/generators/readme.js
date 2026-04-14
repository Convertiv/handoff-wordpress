"use strict";
/**
 * Generates README.md documentation for Gutenberg blocks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReadme = void 0;
const handlebars_to_jsx_1 = require("./handlebars-to-jsx");
/**
 * Get Gutenberg attribute type for documentation
 */
const getAttributeType = (property) => {
    switch (property.type) {
        case 'text':
        case 'richtext':
        case 'select':
            return 'string';
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'image':
        case 'link':
        case 'object':
            return 'object';
        case 'array':
            return 'array';
        default:
            return 'string';
    }
};
/**
 * Format default value for documentation
 */
const formatDefault = (property) => {
    if (property.default === undefined || property.default === null) {
        switch (property.type) {
            case 'text':
            case 'richtext':
            case 'select':
                return '`""`';
            case 'number':
                return '`0`';
            case 'boolean':
                return '`false`';
            case 'image':
                return '`{ url: "", alt: "" }`';
            case 'link':
                return '`{ label: "", url: "" }`';
            case 'object':
                return '`{}`';
            case 'array':
                return '`[]`';
            default:
                return '`""`';
        }
    }
    if (typeof property.default === 'object') {
        return '`' + JSON.stringify(property.default) + '`';
    }
    return '`' + String(property.default) + '`';
};
/**
 * Generate complete README.md file
 */
const generateReadme = (component) => {
    const blockName = component.id.replace(/_/g, '-');
    // Generate attributes table
    const attributeRows = [];
    for (const [key, property] of Object.entries(component.properties)) {
        const attrName = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const type = getAttributeType(property);
        const defaultVal = formatDefault(property);
        const description = property.description || property.name || '';
        attributeRows.push(`| \`${attrName}\` | ${type} | ${defaultVal} | ${description} |`);
    }
    // Generate usage sections based on property types
    const usageSections = [];
    for (const [key, property] of Object.entries(component.properties)) {
        if (property.type === 'image' && property.rules?.dimensions) {
            const dims = property.rules.dimensions;
            usageSections.push(`### ${property.name || key}
- Recommended dimensions: ${dims.recommend?.width || dims.min?.width}x${dims.recommend?.height || dims.min?.height} pixels
- Minimum dimensions: ${dims.min?.width}x${dims.min?.height} pixels
- Maximum dimensions: ${dims.max?.width}x${dims.max?.height} pixels`);
        }
        if (property.type === 'array' && property.items?.properties) {
            const itemProps = Object.entries(property.items.properties)
                .map(([k, p]) => `- \`${k}\`: ${p.description || p.name || 'Value'}`)
                .join('\n');
            usageSections.push(`### ${property.name || key}
Each item consists of:
${itemProps}`);
        }
        if (property.type === 'object' && property.properties) {
            const objProps = Object.entries(property.properties)
                .map(([k, p]) => `- \`${k}\`: ${p.description || p.name || 'Value'}`)
                .join('\n');
            usageSections.push(`### ${property.name || key}
${property.description || ''}
${objProps}`);
        }
    }
    // Design guidelines
    const shouldDo = component.should_do?.map(s => `- ${s}`).join('\n') || '- Use this component as designed';
    const shouldNotDo = component.should_not_do?.map(s => `- ${s}`).join('\n') || '- Avoid using outside intended context';
    return `# ${component.title} Block

${component.description}

## Block Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
${attributeRows.join('\n')}

## Usage

${usageSections.join('\n\n')}

## Design Guidelines

### Do
${shouldDo}

### Don't
${shouldNotDo}

## Source

This block is auto-generated from the Handoff design system component \`${component.id}\`.

${component.figma ? `- Figma: [View Design](${component.figma})` : ''}
- Handoff Component: \`${component.id}\`
- Generated: ${new Date().toISOString().split('T')[0]}
`;
};
exports.generateReadme = generateReadme;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZG1lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2dlbmVyYXRvcnMvcmVhZG1lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsMkRBQWtEO0FBRWxEOztHQUVHO0FBQ0gsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFFBQXlCLEVBQVUsRUFBRTtJQUM3RCxRQUFRLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN0QixLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssVUFBVSxDQUFDO1FBQ2hCLEtBQUssUUFBUTtZQUNYLE9BQU8sUUFBUSxDQUFDO1FBQ2xCLEtBQUssUUFBUTtZQUNYLE9BQU8sUUFBUSxDQUFDO1FBQ2xCLEtBQUssU0FBUztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ25CLEtBQUssT0FBTyxDQUFDO1FBQ2IsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFFBQVE7WUFDWCxPQUFPLFFBQVEsQ0FBQztRQUNsQixLQUFLLE9BQU87WUFDVixPQUFPLE9BQU8sQ0FBQztRQUNqQjtZQUNFLE9BQU8sUUFBUSxDQUFDO0lBQ3BCLENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sYUFBYSxHQUFHLENBQUMsUUFBeUIsRUFBVSxFQUFFO0lBQzFELElBQUksUUFBUSxDQUFDLE9BQU8sS0FBSyxTQUFTLElBQUksUUFBUSxDQUFDLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNoRSxRQUFRLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN0QixLQUFLLE1BQU0sQ0FBQztZQUNaLEtBQUssVUFBVSxDQUFDO1lBQ2hCLEtBQUssUUFBUTtnQkFDWCxPQUFPLE1BQU0sQ0FBQztZQUNoQixLQUFLLFFBQVE7Z0JBQ1gsT0FBTyxLQUFLLENBQUM7WUFDZixLQUFLLFNBQVM7Z0JBQ1osT0FBTyxTQUFTLENBQUM7WUFDbkIsS0FBSyxPQUFPO2dCQUNWLE9BQU8sd0JBQXdCLENBQUM7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V0FBVzs7Ozs7O0VBTXJCLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDOzs7O0VBSXhCLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDOzs7OztFQUsxQixRQUFROzs7RUFHUixXQUFXOzs7OzBFQUk2RCxTQUFTLENBQUMsRUFBRTs7RUFFcEYsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsMEJBQTBCLFNBQVMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTt5QkFDNUMsU0FBUyxDQUFDLEVBQUU7ZUFDdEIsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ3BELENBQUM7QUFDRixDQUFDLENBQUM7QUFFTyx3Q0FBYyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2VuZXJhdGVzIFJFQURNRS5tZCBkb2N1bWVudGF0aW9uIGZvciBHdXRlbmJlcmcgYmxvY2tzXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5IH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UgfSBmcm9tICcuL2hhbmRsZWJhcnMtdG8tanN4JztcblxuLyoqXG4gKiBHZXQgR3V0ZW5iZXJnIGF0dHJpYnV0ZSB0eXBlIGZvciBkb2N1bWVudGF0aW9uXG4gKi9cbmNvbnN0IGdldEF0dHJpYnV0ZVR5cGUgPSAocHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IHN0cmluZyA9PiB7XG4gIHN3aXRjaCAocHJvcGVydHkudHlwZSkge1xuICAgIGNhc2UgJ3RleHQnOlxuICAgIGNhc2UgJ3JpY2h0ZXh0JzpcbiAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgcmV0dXJuICdzdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ251bWJlcic7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ2ltYWdlJzpcbiAgICBjYXNlICdsaW5rJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuICdvYmplY3QnO1xuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJ3N0cmluZyc7XG4gIH1cbn07XG5cbi8qKlxuICogRm9ybWF0IGRlZmF1bHQgdmFsdWUgZm9yIGRvY3VtZW50YXRpb25cbiAqL1xuY29uc3QgZm9ybWF0RGVmYXVsdCA9IChwcm9wZXJ0eTogSGFuZG9mZlByb3BlcnR5KTogc3RyaW5nID0+IHtcbiAgaWYgKHByb3BlcnR5LmRlZmF1bHQgPT09IHVuZGVmaW5lZCB8fCBwcm9wZXJ0eS5kZWZhdWx0ID09PSBudWxsKSB7XG4gICAgc3dpdGNoIChwcm9wZXJ0eS50eXBlKSB7XG4gICAgICBjYXNlICd0ZXh0JzpcbiAgICAgIGNhc2UgJ3JpY2h0ZXh0JzpcbiAgICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICAgIHJldHVybiAnYFwiXCJgJztcbiAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgIHJldHVybiAnYDBgJztcbiAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICByZXR1cm4gJ2BmYWxzZWAnO1xuICAgICAgY2FzZSAnaW1hZ2UnOlxuICAgICAgICByZXR1cm4gJ2B7IHVybDogXCJcIiwgYWx0OiBcIlwiIH1gJztcbiAgICAgIGNhc2UgJ2xpbmsnOlxuICAgICAgICByZXR1cm4gJ2B7IGxhYmVsOiBcIlwiLCB1cmw6IFwiXCIgfWAnO1xuICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgcmV0dXJuICdge31gJztcbiAgICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgICAgcmV0dXJuICdgW11gJztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiAnYFwiXCJgJztcbiAgICB9XG4gIH1cbiAgXG4gIGlmICh0eXBlb2YgcHJvcGVydHkuZGVmYXVsdCA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gJ2AnICsgSlNPTi5zdHJpbmdpZnkocHJvcGVydHkuZGVmYXVsdCkgKyAnYCc7XG4gIH1cbiAgXG4gIHJldHVybiAnYCcgKyBTdHJpbmcocHJvcGVydHkuZGVmYXVsdCkgKyAnYCc7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNvbXBsZXRlIFJFQURNRS5tZCBmaWxlXG4gKi9cbmNvbnN0IGdlbmVyYXRlUmVhZG1lID0gKGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGJsb2NrTmFtZSA9IGNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIFxuICAvLyBHZW5lcmF0ZSBhdHRyaWJ1dGVzIHRhYmxlXG4gIGNvbnN0IGF0dHJpYnV0ZVJvd3M6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCB0eXBlID0gZ2V0QXR0cmlidXRlVHlwZShwcm9wZXJ0eSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbCA9IGZvcm1hdERlZmF1bHQocHJvcGVydHkpO1xuICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gcHJvcGVydHkuZGVzY3JpcHRpb24gfHwgcHJvcGVydHkubmFtZSB8fCAnJztcbiAgICBcbiAgICBhdHRyaWJ1dGVSb3dzLnB1c2goYHwgXFxgJHthdHRyTmFtZX1cXGAgfCAke3R5cGV9IHwgJHtkZWZhdWx0VmFsfSB8ICR7ZGVzY3JpcHRpb259IHxgKTtcbiAgfVxuICBcbiAgLy8gR2VuZXJhdGUgdXNhZ2Ugc2VjdGlvbnMgYmFzZWQgb24gcHJvcGVydHkgdHlwZXNcbiAgY29uc3QgdXNhZ2VTZWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnaW1hZ2UnICYmIHByb3BlcnR5LnJ1bGVzPy5kaW1lbnNpb25zKSB7XG4gICAgICBjb25zdCBkaW1zID0gcHJvcGVydHkucnVsZXMuZGltZW5zaW9ucztcbiAgICAgIHVzYWdlU2VjdGlvbnMucHVzaChgIyMjICR7cHJvcGVydHkubmFtZSB8fCBrZXl9XG4tIFJlY29tbWVuZGVkIGRpbWVuc2lvbnM6ICR7ZGltcy5yZWNvbW1lbmQ/LndpZHRoIHx8IGRpbXMubWluPy53aWR0aH14JHtkaW1zLnJlY29tbWVuZD8uaGVpZ2h0IHx8IGRpbXMubWluPy5oZWlnaHR9IHBpeGVsc1xuLSBNaW5pbXVtIGRpbWVuc2lvbnM6ICR7ZGltcy5taW4/LndpZHRofXgke2RpbXMubWluPy5oZWlnaHR9IHBpeGVsc1xuLSBNYXhpbXVtIGRpbWVuc2lvbnM6ICR7ZGltcy5tYXg/LndpZHRofXgke2RpbXMubWF4Py5oZWlnaHR9IHBpeGVsc2ApO1xuICAgIH1cbiAgICBcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wZXJ0eS5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgY29uc3QgaXRlbVByb3BzID0gT2JqZWN0LmVudHJpZXMocHJvcGVydHkuaXRlbXMucHJvcGVydGllcylcbiAgICAgICAgLm1hcCgoW2ssIHBdKSA9PiBgLSBcXGAke2t9XFxgOiAke3AuZGVzY3JpcHRpb24gfHwgcC5uYW1lIHx8ICdWYWx1ZSd9YClcbiAgICAgICAgLmpvaW4oJ1xcbicpO1xuICAgICAgdXNhZ2VTZWN0aW9ucy5wdXNoKGAjIyMgJHtwcm9wZXJ0eS5uYW1lIHx8IGtleX1cbkVhY2ggaXRlbSBjb25zaXN0cyBvZjpcbiR7aXRlbVByb3BzfWApO1xuICAgIH1cbiAgICBcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcGVydHkucHJvcGVydGllcykge1xuICAgICAgY29uc3Qgb2JqUHJvcHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0eS5wcm9wZXJ0aWVzKVxuICAgICAgICAubWFwKChbaywgcF0pID0+IGAtIFxcYCR7a31cXGA6ICR7cC5kZXNjcmlwdGlvbiB8fCBwLm5hbWUgfHwgJ1ZhbHVlJ31gKVxuICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICB1c2FnZVNlY3Rpb25zLnB1c2goYCMjIyAke3Byb3BlcnR5Lm5hbWUgfHwga2V5fVxuJHtwcm9wZXJ0eS5kZXNjcmlwdGlvbiB8fCAnJ31cbiR7b2JqUHJvcHN9YCk7XG4gICAgfVxuICB9XG4gIFxuICAvLyBEZXNpZ24gZ3VpZGVsaW5lc1xuICBjb25zdCBzaG91bGREbyA9IGNvbXBvbmVudC5zaG91bGRfZG8/Lm1hcChzID0+IGAtICR7c31gKS5qb2luKCdcXG4nKSB8fCAnLSBVc2UgdGhpcyBjb21wb25lbnQgYXMgZGVzaWduZWQnO1xuICBjb25zdCBzaG91bGROb3REbyA9IGNvbXBvbmVudC5zaG91bGRfbm90X2RvPy5tYXAocyA9PiBgLSAke3N9YCkuam9pbignXFxuJykgfHwgJy0gQXZvaWQgdXNpbmcgb3V0c2lkZSBpbnRlbmRlZCBjb250ZXh0JztcbiAgXG4gIHJldHVybiBgIyAke2NvbXBvbmVudC50aXRsZX0gQmxvY2tcblxuJHtjb21wb25lbnQuZGVzY3JpcHRpb259XG5cbiMjIEJsb2NrIEF0dHJpYnV0ZXNcblxufCBBdHRyaWJ1dGUgfCBUeXBlIHwgRGVmYXVsdCB8IERlc2NyaXB0aW9uIHxcbnwtLS0tLS0tLS0tLXwtLS0tLS18LS0tLS0tLS0tfC0tLS0tLS0tLS0tLS18XG4ke2F0dHJpYnV0ZVJvd3Muam9pbignXFxuJyl9XG5cbiMjIFVzYWdlXG5cbiR7dXNhZ2VTZWN0aW9ucy5qb2luKCdcXG5cXG4nKX1cblxuIyMgRGVzaWduIEd1aWRlbGluZXNcblxuIyMjIERvXG4ke3Nob3VsZERvfVxuXG4jIyMgRG9uJ3RcbiR7c2hvdWxkTm90RG99XG5cbiMjIFNvdXJjZVxuXG5UaGlzIGJsb2NrIGlzIGF1dG8tZ2VuZXJhdGVkIGZyb20gdGhlIEhhbmRvZmYgZGVzaWduIHN5c3RlbSBjb21wb25lbnQgXFxgJHtjb21wb25lbnQuaWR9XFxgLlxuXG4ke2NvbXBvbmVudC5maWdtYSA/IGAtIEZpZ21hOiBbVmlldyBEZXNpZ25dKCR7Y29tcG9uZW50LmZpZ21hfSlgIDogJyd9XG4tIEhhbmRvZmYgQ29tcG9uZW50OiBcXGAke2NvbXBvbmVudC5pZH1cXGBcbi0gR2VuZXJhdGVkOiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdfVxuYDtcbn07XG5cbmV4cG9ydCB7IGdlbmVyYXRlUmVhZG1lIH07XG4iXX0=