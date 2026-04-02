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
    // Check for overlay
    if (component.code.includes('overlay')) {
        attributeRows.push('| `overlayOpacity` | number | `0.6` | Opacity of the overlay (0-1) |');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZG1lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2dlbmVyYXRvcnMvcmVhZG1lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsMkRBQWtEO0FBRWxEOztHQUVHO0FBQ0gsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFFBQXlCLEVBQVUsRUFBRTtJQUM3RCxRQUFRLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN0QixLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssVUFBVSxDQUFDO1FBQ2hCLEtBQUssUUFBUTtZQUNYLE9BQU8sUUFBUSxDQUFDO1FBQ2xCLEtBQUssUUFBUTtZQUNYLE9BQU8sUUFBUSxDQUFDO1FBQ2xCLEtBQUssU0FBUztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ25CLEtBQUssT0FBTyxDQUFDO1FBQ2IsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFFBQVE7WUFDWCxPQUFPLFFBQVEsQ0FBQztRQUNsQixLQUFLLE9BQU87WUFDVixPQUFPLE9BQU8sQ0FBQztRQUNqQjtZQUNFLE9BQU8sUUFBUSxDQUFDO0lBQ3BCLENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sYUFBYSxHQUFHLENBQUMsUUFBeUIsRUFBVSxFQUFFO0lBQzFELElBQUksUUFBUSxDQUFDLE9BQU8sS0FBSyxTQUFTLElBQUksUUFBUSxDQUFDLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNoRSxRQUFRLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN0QixLQUFLLE1BQU0sQ0FBQztZQUNaLEtBQUssVUFBVSxDQUFDO1lBQ2hCLEtBQUssUUFBUTtnQkFDWCxPQUFPLE1BQU0sQ0FBQztZQUNoQixLQUFLLFFBQVE7Z0JBQ1gsT0FBTyxLQUFLLENBQUM7WUFDZixLQUFLLFNBQVM7Z0JBQ1osT0FBTyxTQUFTLENBQUM7WUFDbkIsS0FBSyxPQUFPO2dCQUNWLE9BQU8sd0JBQXdCLENBQUM7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QyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLHdDQUF3QyxDQUFDO0lBRXZILE9BQU8sS0FBSyxTQUFTLENBQUMsS0FBSzs7RUFFM0IsU0FBUyxDQUFDLFdBQVc7Ozs7OztFQU1yQixhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQzs7OztFQUl4QixhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7RUFLMUIsUUFBUTs7O0VBR1IsV0FBVzs7OzswRUFJNkQsU0FBUyxDQUFDLEVBQUU7O0VBRXBGLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLDBCQUEwQixTQUFTLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7eUJBQzVDLFNBQVMsQ0FBQyxFQUFFO2VBQ3RCLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUNwRCxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBRU8sd0NBQWMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBSRUFETUUubWQgZG9jdW1lbnRhdGlvbiBmb3IgR3V0ZW5iZXJnIGJsb2Nrc1xuICovXG5cbmltcG9ydCB7IEhhbmRvZmZDb21wb25lbnQsIEhhbmRvZmZQcm9wZXJ0eSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5cbi8qKlxuICogR2V0IEd1dGVuYmVyZyBhdHRyaWJ1dGUgdHlwZSBmb3IgZG9jdW1lbnRhdGlvblxuICovXG5jb25zdCBnZXRBdHRyaWJ1dGVUeXBlID0gKHByb3BlcnR5OiBIYW5kb2ZmUHJvcGVydHkpOiBzdHJpbmcgPT4ge1xuICBzd2l0Y2ggKHByb3BlcnR5LnR5cGUpIHtcbiAgICBjYXNlICd0ZXh0JzpcbiAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgIHJldHVybiAnc3RyaW5nJztcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuICdudW1iZXInO1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdpbWFnZSc6XG4gICAgY2FzZSAnbGluayc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHJldHVybiAnb2JqZWN0JztcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gJ2FycmF5JztcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICdzdHJpbmcnO1xuICB9XG59O1xuXG4vKipcbiAqIEZvcm1hdCBkZWZhdWx0IHZhbHVlIGZvciBkb2N1bWVudGF0aW9uXG4gKi9cbmNvbnN0IGZvcm1hdERlZmF1bHQgPSAocHJvcGVydHk6IEhhbmRvZmZQcm9wZXJ0eSk6IHN0cmluZyA9PiB7XG4gIGlmIChwcm9wZXJ0eS5kZWZhdWx0ID09PSB1bmRlZmluZWQgfHwgcHJvcGVydHkuZGVmYXVsdCA9PT0gbnVsbCkge1xuICAgIHN3aXRjaCAocHJvcGVydHkudHlwZSkge1xuICAgICAgY2FzZSAndGV4dCc6XG4gICAgICBjYXNlICdyaWNodGV4dCc6XG4gICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICByZXR1cm4gJ2BcIlwiYCc7XG4gICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICByZXR1cm4gJ2AwYCc7XG4gICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgcmV0dXJuICdgZmFsc2VgJztcbiAgICAgIGNhc2UgJ2ltYWdlJzpcbiAgICAgICAgcmV0dXJuICdgeyB1cmw6IFwiXCIsIGFsdDogXCJcIiB9YCc7XG4gICAgICBjYXNlICdsaW5rJzpcbiAgICAgICAgcmV0dXJuICdgeyBsYWJlbDogXCJcIiwgdXJsOiBcIlwiIH1gJztcbiAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgIHJldHVybiAnYHt9YCc7XG4gICAgICBjYXNlICdhcnJheSc6XG4gICAgICAgIHJldHVybiAnYFtdYCc7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gJ2BcIlwiYCc7XG4gICAgfVxuICB9XG4gIFxuICBpZiAodHlwZW9mIHByb3BlcnR5LmRlZmF1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuICdgJyArIEpTT04uc3RyaW5naWZ5KHByb3BlcnR5LmRlZmF1bHQpICsgJ2AnO1xuICB9XG4gIFxuICByZXR1cm4gJ2AnICsgU3RyaW5nKHByb3BlcnR5LmRlZmF1bHQpICsgJ2AnO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBjb21wbGV0ZSBSRUFETUUubWQgZmlsZVxuICovXG5jb25zdCBnZW5lcmF0ZVJlYWRtZSA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBibG9ja05hbWUgPSBjb21wb25lbnQuaWQucmVwbGFjZSgvXy9nLCAnLScpO1xuICBcbiAgLy8gR2VuZXJhdGUgYXR0cmlidXRlcyB0YWJsZVxuICBjb25zdCBhdHRyaWJ1dGVSb3dzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgdHlwZSA9IGdldEF0dHJpYnV0ZVR5cGUocHJvcGVydHkpO1xuICAgIGNvbnN0IGRlZmF1bHRWYWwgPSBmb3JtYXREZWZhdWx0KHByb3BlcnR5KTtcbiAgICBjb25zdCBkZXNjcmlwdGlvbiA9IHByb3BlcnR5LmRlc2NyaXB0aW9uIHx8IHByb3BlcnR5Lm5hbWUgfHwgJyc7XG4gICAgXG4gICAgYXR0cmlidXRlUm93cy5wdXNoKGB8IFxcYCR7YXR0ck5hbWV9XFxgIHwgJHt0eXBlfSB8ICR7ZGVmYXVsdFZhbH0gfCAke2Rlc2NyaXB0aW9ufSB8YCk7XG4gIH1cbiAgXG4gIC8vIENoZWNrIGZvciBvdmVybGF5XG4gIGlmIChjb21wb25lbnQuY29kZS5pbmNsdWRlcygnb3ZlcmxheScpKSB7XG4gICAgYXR0cmlidXRlUm93cy5wdXNoKCd8IGBvdmVybGF5T3BhY2l0eWAgfCBudW1iZXIgfCBgMC42YCB8IE9wYWNpdHkgb2YgdGhlIG92ZXJsYXkgKDAtMSkgfCcpO1xuICB9XG4gIFxuICAvLyBHZW5lcmF0ZSB1c2FnZSBzZWN0aW9ucyBiYXNlZCBvbiBwcm9wZXJ0eSB0eXBlc1xuICBjb25zdCB1c2FnZVNlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdpbWFnZScgJiYgcHJvcGVydHkucnVsZXM/LmRpbWVuc2lvbnMpIHtcbiAgICAgIGNvbnN0IGRpbXMgPSBwcm9wZXJ0eS5ydWxlcy5kaW1lbnNpb25zO1xuICAgICAgdXNhZ2VTZWN0aW9ucy5wdXNoKGAjIyMgJHtwcm9wZXJ0eS5uYW1lIHx8IGtleX1cbi0gUmVjb21tZW5kZWQgZGltZW5zaW9uczogJHtkaW1zLnJlY29tbWVuZD8ud2lkdGggfHwgZGltcy5taW4/LndpZHRofXgke2RpbXMucmVjb21tZW5kPy5oZWlnaHQgfHwgZGltcy5taW4/LmhlaWdodH0gcGl4ZWxzXG4tIE1pbmltdW0gZGltZW5zaW9uczogJHtkaW1zLm1pbj8ud2lkdGh9eCR7ZGltcy5taW4/LmhlaWdodH0gcGl4ZWxzXG4tIE1heGltdW0gZGltZW5zaW9uczogJHtkaW1zLm1heD8ud2lkdGh9eCR7ZGltcy5tYXg/LmhlaWdodH0gcGl4ZWxzYCk7XG4gICAgfVxuICAgIFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIHByb3BlcnR5Lml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICBjb25zdCBpdGVtUHJvcHMgPSBPYmplY3QuZW50cmllcyhwcm9wZXJ0eS5pdGVtcy5wcm9wZXJ0aWVzKVxuICAgICAgICAubWFwKChbaywgcF0pID0+IGAtIFxcYCR7a31cXGA6ICR7cC5kZXNjcmlwdGlvbiB8fCBwLm5hbWUgfHwgJ1ZhbHVlJ31gKVxuICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICB1c2FnZVNlY3Rpb25zLnB1c2goYCMjIyAke3Byb3BlcnR5Lm5hbWUgfHwga2V5fVxuRWFjaCBpdGVtIGNvbnNpc3RzIG9mOlxuJHtpdGVtUHJvcHN9YCk7XG4gICAgfVxuICAgIFxuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wZXJ0eS5wcm9wZXJ0aWVzKSB7XG4gICAgICBjb25zdCBvYmpQcm9wcyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnR5LnByb3BlcnRpZXMpXG4gICAgICAgIC5tYXAoKFtrLCBwXSkgPT4gYC0gXFxgJHtrfVxcYDogJHtwLmRlc2NyaXB0aW9uIHx8IHAubmFtZSB8fCAnVmFsdWUnfWApXG4gICAgICAgIC5qb2luKCdcXG4nKTtcbiAgICAgIHVzYWdlU2VjdGlvbnMucHVzaChgIyMjICR7cHJvcGVydHkubmFtZSB8fCBrZXl9XG4ke3Byb3BlcnR5LmRlc2NyaXB0aW9uIHx8ICcnfVxuJHtvYmpQcm9wc31gKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIERlc2lnbiBndWlkZWxpbmVzXG4gIGNvbnN0IHNob3VsZERvID0gY29tcG9uZW50LnNob3VsZF9kbz8ubWFwKHMgPT4gYC0gJHtzfWApLmpvaW4oJ1xcbicpIHx8ICctIFVzZSB0aGlzIGNvbXBvbmVudCBhcyBkZXNpZ25lZCc7XG4gIGNvbnN0IHNob3VsZE5vdERvID0gY29tcG9uZW50LnNob3VsZF9ub3RfZG8/Lm1hcChzID0+IGAtICR7c31gKS5qb2luKCdcXG4nKSB8fCAnLSBBdm9pZCB1c2luZyBvdXRzaWRlIGludGVuZGVkIGNvbnRleHQnO1xuICBcbiAgcmV0dXJuIGAjICR7Y29tcG9uZW50LnRpdGxlfSBCbG9ja1xuXG4ke2NvbXBvbmVudC5kZXNjcmlwdGlvbn1cblxuIyMgQmxvY2sgQXR0cmlidXRlc1xuXG58IEF0dHJpYnV0ZSB8IFR5cGUgfCBEZWZhdWx0IHwgRGVzY3JpcHRpb24gfFxufC0tLS0tLS0tLS0tfC0tLS0tLXwtLS0tLS0tLS18LS0tLS0tLS0tLS0tLXxcbiR7YXR0cmlidXRlUm93cy5qb2luKCdcXG4nKX1cblxuIyMgVXNhZ2VcblxuJHt1c2FnZVNlY3Rpb25zLmpvaW4oJ1xcblxcbicpfVxuXG4jIyBEZXNpZ24gR3VpZGVsaW5lc1xuXG4jIyMgRG9cbiR7c2hvdWxkRG99XG5cbiMjIyBEb24ndFxuJHtzaG91bGROb3REb31cblxuIyMgU291cmNlXG5cblRoaXMgYmxvY2sgaXMgYXV0by1nZW5lcmF0ZWQgZnJvbSB0aGUgSGFuZG9mZiBkZXNpZ24gc3lzdGVtIGNvbXBvbmVudCBcXGAke2NvbXBvbmVudC5pZH1cXGAuXG5cbiR7Y29tcG9uZW50LmZpZ21hID8gYC0gRmlnbWE6IFtWaWV3IERlc2lnbl0oJHtjb21wb25lbnQuZmlnbWF9KWAgOiAnJ31cbi0gSGFuZG9mZiBDb21wb25lbnQ6IFxcYCR7Y29tcG9uZW50LmlkfVxcYFxuLSBHZW5lcmF0ZWQ6ICR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF19XG5gO1xufTtcblxuZXhwb3J0IHsgZ2VuZXJhdGVSZWFkbWUgfTtcbiJdfQ==