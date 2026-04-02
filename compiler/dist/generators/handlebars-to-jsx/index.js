"use strict";
/**
 * Handlebars to JSX Transpiler
 *
 * Uses node-html-parser and regex patterns for accurate conversion
 * of Handlebars templates to React JSX for Gutenberg editor previews.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJsxPreview = exports.generateFallbackPreview = exports.transpileHandlebarsToJsx = exports.getTemplateReferencedAttributeNames = exports.normalizeSelectOptions = exports.humanizeLabel = exports.sanitizeReservedName = exports.isReservedWord = exports.toCamelCase = void 0;
const node_html_parser_1 = require("node-html-parser");
const utils_1 = require("./utils");
const preprocessors_1 = require("./preprocessors");
const node_converter_1 = require("./node-converter");
const postprocessors_1 = require("./postprocessors");
// Re-export utilities that are used by other parts of the codebase
var utils_2 = require("./utils");
Object.defineProperty(exports, "toCamelCase", { enumerable: true, get: function () { return utils_2.toCamelCase; } });
Object.defineProperty(exports, "isReservedWord", { enumerable: true, get: function () { return utils_2.isReservedWord; } });
Object.defineProperty(exports, "sanitizeReservedName", { enumerable: true, get: function () { return utils_2.sanitizeReservedName; } });
Object.defineProperty(exports, "humanizeLabel", { enumerable: true, get: function () { return utils_2.humanizeLabel; } });
Object.defineProperty(exports, "normalizeSelectOptions", { enumerable: true, get: function () { return utils_2.normalizeSelectOptions; } });
Object.defineProperty(exports, "getTemplateReferencedAttributeNames", { enumerable: true, get: function () { return utils_2.getTemplateReferencedAttributeNames; } });
/**
 * Main transpiler function - converts Handlebars template to JSX
 */
const transpileHandlebarsToJsx = (template, properties, indent = '          ', innerBlocksField) => {
    const context = {
        properties,
        indent,
        inLoop: false
    };
    // Preprocess fields FIRST (before cleanTemplate strips them)
    const { template: processed, inlineEditableFields } = (0, preprocessors_1.preprocessFields)(template, properties);
    // Clean and preprocess template (cleanTemplate runs preprocessBlocks when processing full template so loop inner content stays raw for correct array name when expanded)
    const preprocessed = (0, preprocessors_1.cleanTemplate)(processed);
    // Parse as HTML
    const root = (0, node_html_parser_1.parse)(preprocessed, {
        lowerCaseTagName: false,
        comment: false
    });
    // Convert to JSX
    let jsx = (0, node_converter_1.nodeToJsx)(root, context);
    // Post-process to handle block markers
    jsx = (0, postprocessors_1.postprocessJsx)(jsx, context, 'item', innerBlocksField);
    // Convert template literal markers back to actual template literals
    jsx = (0, postprocessors_1.postprocessTemplateLiterals)(jsx);
    // Clean up empty lines and normalize indentation
    jsx = jsx
        .split('\n')
        .map(line => line.trim() ? `${indent}${line.trim()}` : '')
        .filter(Boolean)
        .join('\n');
    return {
        jsx,
        needsFragment: jsx.includes('<Fragment'),
        inlineEditableFields
    };
};
exports.transpileHandlebarsToJsx = transpileHandlebarsToJsx;
/**
 * Generate a simple fallback preview
 */
const generateFallbackPreview = (properties, componentId, componentTitle) => {
    const className = componentId.replace(/_/g, '-');
    const hasBackgroundImage = properties.background_image?.type === 'image';
    const hasOverlay = true;
    let preview = `          <div className="${className}-editor-preview"`;
    if (hasBackgroundImage) {
        preview += `
            style={{ 
              backgroundImage: backgroundImage?.src 
                ? \`url('\${backgroundImage.src}')\` 
                : undefined 
            }}`;
    }
    preview += `>`;
    if (hasOverlay) {
        preview += `
            <div className="block-overlay" style={{ opacity: overlayOpacity || 0.6 }}></div>`;
    }
    preview += `
            <div className="block-content">
              <p className="block-title">{__('${componentTitle}', 'handoff')}</p>
              <p className="block-hint">{__('Configure this block using the sidebar settings.', 'handoff')}</p>`;
    for (const [key, property] of Object.entries(properties)) {
        const attrName = (0, utils_1.toCamelCase)(key);
        if (property.type === 'text') {
            preview += `
              {${attrName} && <p className="preview-${key.replace(/_/g, '-')}">{${attrName}}</p>}`;
        }
    }
    preview += `
            </div>
          </div>`;
    return preview;
};
exports.generateFallbackPreview = generateFallbackPreview;
/**
 * Generate a JSX preview that's suitable for the Gutenberg editor
 * Falls back to simplified preview if transpilation produces unusable output
 */
const generateJsxPreview = (template, properties, componentId, componentTitle, innerBlocksField) => {
    try {
        const { jsx, inlineEditableFields } = (0, exports.transpileHandlebarsToJsx)(template, properties, '          ', innerBlocksField);
        // Validate the output has some content
        if (jsx.trim().length < 50) {
            throw new Error('Generated JSX too short');
        }
        // Wrap in a container with the editor preview class
        const className = componentId.replace(/_/g, '-');
        return {
            jsx: `          <div className="${className}-editor-preview">
${jsx}
          </div>`,
            inlineEditableFields
        };
    }
    catch (error) {
        console.warn(`Handlebars transpilation failed, using simplified preview: ${error}`);
        return {
            jsx: (0, exports.generateFallbackPreview)(properties, componentId, componentTitle),
            inlineEditableFields: new Set()
        };
    }
};
exports.generateJsxPreview = generateJsxPreview;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7OztBQUVILHVEQUFzRDtBQUd0RCxtQ0FBc0M7QUFDdEMsbURBQWtFO0FBQ2xFLHFEQUE2QztBQUM3QyxxREFBK0U7QUFFL0UsbUVBQW1FO0FBQ25FLGlDQUF3SjtBQUEvSSxvR0FBQSxXQUFXLE9BQUE7QUFBRSx1R0FBQSxjQUFjLE9BQUE7QUFBRSw2R0FBQSxvQkFBb0IsT0FBQTtBQUFFLHNHQUFBLGFBQWEsT0FBQTtBQUFFLCtHQUFBLHNCQUFzQixPQUFBO0FBQUUsNEhBQUEsbUNBQW1DLE9BQUE7QUFHdEk7O0dBRUc7QUFDSSxNQUFNLHdCQUF3QixHQUFHLENBQ3RDLFFBQWdCLEVBQ2hCLFVBQTJDLEVBQzNDLFNBQWlCLFlBQVksRUFDN0IsZ0JBQWdDLEVBQ2YsRUFBRTtJQUNuQixNQUFNLE9BQU8sR0FBc0I7UUFDakMsVUFBVTtRQUNWLE1BQU07UUFDTixNQUFNLEVBQUUsS0FBSztLQUNkLENBQUM7SUFFRiw2REFBNkQ7SUFDN0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxJQUFBLGdDQUFnQixFQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUU3Rix5S0FBeUs7SUFDekssTUFBTSxZQUFZLEdBQUcsSUFBQSw2QkFBYSxFQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRTlDLGdCQUFnQjtJQUNoQixNQUFNLElBQUksR0FBRyxJQUFBLHdCQUFTLEVBQUMsWUFBWSxFQUFFO1FBQ25DLGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsT0FBTyxFQUFFLEtBQUs7S0FDZixDQUFDLENBQUM7SUFFSCxpQkFBaUI7SUFDakIsSUFBSSxHQUFHLEdBQUcsSUFBQSwwQkFBUyxFQUFDLElBQUksRUFBRSxPQUFP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RyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqRCxPQUFPO1lBQ0wsR0FBRyxFQUFFLDZCQUE2QixTQUFTO0VBQy9DLEdBQUc7aUJBQ1k7WUFDWCxvQkFBb0I7U0FDckIsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLElBQUksQ0FBQyw4REFBOEQsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNwRixPQUFPO1lBQ0wsR0FBRyxFQUFFLElBQUEsK0JBQXVCLEVBQUMsVUFBVSxFQUFFLFdBQVcsRUFBRSxjQUFjLENBQUM7WUFDckUsb0JBQW9CLEVBQUUsSUFBSSxHQUFHLEVBQUU7U0FDaEMsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUE5QlcsUUFBQSxrQkFBa0Isc0JBOEI3QiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogSGFuZGxlYmFycyB0byBKU1ggVHJhbnNwaWxlclxuICogXG4gKiBVc2VzIG5vZGUtaHRtbC1wYXJzZXIgYW5kIHJlZ2V4IHBhdHRlcm5zIGZvciBhY2N1cmF0ZSBjb252ZXJzaW9uXG4gKiBvZiBIYW5kbGViYXJzIHRlbXBsYXRlcyB0byBSZWFjdCBKU1ggZm9yIEd1dGVuYmVyZyBlZGl0b3IgcHJldmlld3MuXG4gKi9cblxuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VIVE1MIH0gZnJvbSAnbm9kZS1odG1sLXBhcnNlcic7XG5pbXBvcnQgeyBIYW5kb2ZmUHJvcGVydHkgfSBmcm9tICcuLi8uLi90eXBlcyc7XG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCwgVHJhbnNwaWxlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgcHJlcHJvY2Vzc0ZpZWxkcywgY2xlYW5UZW1wbGF0ZSB9IGZyb20gJy4vcHJlcHJvY2Vzc29ycyc7XG5pbXBvcnQgeyBub2RlVG9Kc3ggfSBmcm9tICcuL25vZGUtY29udmVydGVyJztcbmltcG9ydCB7IHBvc3Rwcm9jZXNzSnN4LCBwb3N0cHJvY2Vzc1RlbXBsYXRlTGl0ZXJhbHMgfSBmcm9tICcuL3Bvc3Rwcm9jZXNzb3JzJztcblxuLy8gUmUtZXhwb3J0IHV0aWxpdGllcyB0aGF0IGFyZSB1c2VkIGJ5IG90aGVyIHBhcnRzIG9mIHRoZSBjb2RlYmFzZVxuZXhwb3J0IHsgdG9DYW1lbENhc2UsIGlzUmVzZXJ2ZWRXb3JkLCBzYW5pdGl6ZVJlc2VydmVkTmFtZSwgaHVtYW5pemVMYWJlbCwgbm9ybWFsaXplU2VsZWN0T3B0aW9ucywgZ2V0VGVtcGxhdGVSZWZlcmVuY2VkQXR0cmlidXRlTmFtZXMgfSBmcm9tICcuL3V0aWxzJztcbmV4cG9ydCB0eXBlIHsgTm9ybWFsaXplZFNlbGVjdE9wdGlvbiB9IGZyb20gJy4vdXRpbHMnO1xuXG4vKipcbiAqIE1haW4gdHJhbnNwaWxlciBmdW5jdGlvbiAtIGNvbnZlcnRzIEhhbmRsZWJhcnMgdGVtcGxhdGUgdG8gSlNYXG4gKi9cbmV4cG9ydCBjb25zdCB0cmFuc3BpbGVIYW5kbGViYXJzVG9Kc3ggPSAoXG4gIHRlbXBsYXRlOiBzdHJpbmcsIFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBpbmRlbnQ6IHN0cmluZyA9ICcgICAgICAgICAgJyxcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGxcbik6IFRyYW5zcGlsZVJlc3VsdCA9PiB7XG4gIGNvbnN0IGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0ID0ge1xuICAgIHByb3BlcnRpZXMsXG4gICAgaW5kZW50LFxuICAgIGluTG9vcDogZmFsc2VcbiAgfTtcbiAgXG4gIC8vIFByZXByb2Nlc3MgZmllbGRzIEZJUlNUIChiZWZvcmUgY2xlYW5UZW1wbGF0ZSBzdHJpcHMgdGhlbSlcbiAgY29uc3QgeyB0ZW1wbGF0ZTogcHJvY2Vzc2VkLCBpbmxpbmVFZGl0YWJsZUZpZWxkcyB9ID0gcHJlcHJvY2Vzc0ZpZWxkcyh0ZW1wbGF0ZSwgcHJvcGVydGllcyk7XG4gIFxuICAvLyBDbGVhbiBhbmQgcHJlcHJvY2VzcyB0ZW1wbGF0ZSAoY2xlYW5UZW1wbGF0ZSBydW5zIHByZXByb2Nlc3NCbG9ja3Mgd2hlbiBwcm9jZXNzaW5nIGZ1bGwgdGVtcGxhdGUgc28gbG9vcCBpbm5lciBjb250ZW50IHN0YXlzIHJhdyBmb3IgY29ycmVjdCBhcnJheSBuYW1lIHdoZW4gZXhwYW5kZWQpXG4gIGNvbnN0IHByZXByb2Nlc3NlZCA9IGNsZWFuVGVtcGxhdGUocHJvY2Vzc2VkKTtcbiAgXG4gIC8vIFBhcnNlIGFzIEhUTUxcbiAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHtcbiAgICBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSxcbiAgICBjb21tZW50OiBmYWxzZVxuICB9KTtcbiAgXG4gIC8vIENvbnZlcnQgdG8gSlNYXG4gIGxldCBqc3ggPSBub2RlVG9Kc3gocm9vdCwgY29udGV4dCk7XG4gIFxuICAvLyBQb3N0LXByb2Nlc3MgdG8gaGFuZGxlIGJsb2NrIG1hcmtlcnNcbiAganN4ID0gcG9zdHByb2Nlc3NKc3goanN4LCBjb250ZXh0LCAnaXRlbScsIGlubmVyQmxvY2tzRmllbGQpO1xuICBcbiAgLy8gQ29udmVydCB0ZW1wbGF0ZSBsaXRlcmFsIG1hcmtlcnMgYmFjayB0byBhY3R1YWwgdGVtcGxhdGUgbGl0ZXJhbHNcbiAganN4ID0gcG9zdHByb2Nlc3NUZW1wbGF0ZUxpdGVyYWxzKGpzeCk7XG4gIFxuICAvLyBDbGVhbiB1cCBlbXB0eSBsaW5lcyBhbmQgbm9ybWFsaXplIGluZGVudGF0aW9uXG4gIGpzeCA9IGpzeFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKGxpbmUgPT4gbGluZS50cmltKCkgPyBgJHtpbmRlbnR9JHtsaW5lLnRyaW0oKX1gIDogJycpXG4gICAgLmZpbHRlcihCb29sZWFuKVxuICAgIC5qb2luKCdcXG4nKTtcbiAgXG4gIHJldHVybiB7XG4gICAganN4LFxuICAgIG5lZWRzRnJhZ21lbnQ6IGpzeC5pbmNsdWRlcygnPEZyYWdtZW50JyksXG4gICAgaW5saW5lRWRpdGFibGVGaWVsZHNcbiAgfTtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYSBzaW1wbGUgZmFsbGJhY2sgcHJldmlld1xuICovXG5leHBvcnQgY29uc3QgZ2VuZXJhdGVGYWxsYmFja1ByZXZpZXcgPSAoXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIGNvbXBvbmVudElkOiBzdHJpbmcsXG4gIGNvbXBvbmVudFRpdGxlOiBzdHJpbmdcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudElkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgaGFzQmFja2dyb3VuZEltYWdlID0gcHJvcGVydGllcy5iYWNrZ3JvdW5kX2ltYWdlPy50eXBlID09PSAnaW1hZ2UnO1xuICBjb25zdCBoYXNPdmVybGF5ID0gdHJ1ZTtcbiAgXG4gIGxldCBwcmV2aWV3ID0gYCAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlld1wiYDtcbiAgXG4gIGlmIChoYXNCYWNrZ3JvdW5kSW1hZ2UpIHtcbiAgICBwcmV2aWV3ICs9IGBcbiAgICAgICAgICAgIHN0eWxlPXt7IFxuICAgICAgICAgICAgICBiYWNrZ3JvdW5kSW1hZ2U6IGJhY2tncm91bmRJbWFnZT8uc3JjIFxuICAgICAgICAgICAgICAgID8gXFxgdXJsKCdcXCR7YmFja2dyb3VuZEltYWdlLnNyY30nKVxcYCBcbiAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZCBcbiAgICAgICAgICAgIH19YDtcbiAgfVxuICBwcmV2aWV3ICs9IGA+YDtcbiAgXG4gIGlmIChoYXNPdmVybGF5KSB7XG4gICAgcHJldmlldyArPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrLW92ZXJsYXlcIiBzdHlsZT17eyBvcGFjaXR5OiBvdmVybGF5T3BhY2l0eSB8fCAwLjYgfX0+PC9kaXY+YDtcbiAgfVxuICBcbiAgcHJldmlldyArPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrLWNvbnRlbnRcIj5cbiAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiYmxvY2stdGl0bGVcIj57X18oJyR7Y29tcG9uZW50VGl0bGV9JywgJ2hhbmRvZmYnKX08L3A+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cImJsb2NrLWhpbnRcIj57X18oJ0NvbmZpZ3VyZSB0aGlzIGJsb2NrIHVzaW5nIHRoZSBzaWRlYmFyIHNldHRpbmdzLicsICdoYW5kb2ZmJyl9PC9wPmA7XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3RleHQnKSB7XG4gICAgICBwcmV2aWV3ICs9IGBcbiAgICAgICAgICAgICAgeyR7YXR0ck5hbWV9ICYmIDxwIGNsYXNzTmFtZT1cInByZXZpZXctJHtrZXkucmVwbGFjZSgvXy9nLCAnLScpfVwiPnske2F0dHJOYW1lfX08L3A+fWA7XG4gICAgfVxuICB9XG4gIFxuICBwcmV2aWV3ICs9IGBcbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PmA7XG4gIFxuICByZXR1cm4gcHJldmlldztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSnN4UHJldmlld1Jlc3VsdCB7XG4gIGpzeDogc3RyaW5nO1xuICBpbmxpbmVFZGl0YWJsZUZpZWxkczogU2V0PHN0cmluZz47XG59XG5cbi8qKlxuICogR2VuZXJhdGUgYSBKU1ggcHJldmlldyB0aGF0J3Mgc3VpdGFibGUgZm9yIHRoZSBHdXRlbmJlcmcgZWRpdG9yXG4gKiBGYWxscyBiYWNrIHRvIHNpbXBsaWZpZWQgcHJldmlldyBpZiB0cmFuc3BpbGF0aW9uIHByb2R1Y2VzIHVudXNhYmxlIG91dHB1dFxuICovXG5leHBvcnQgY29uc3QgZ2VuZXJhdGVKc3hQcmV2aWV3ID0gKFxuICB0ZW1wbGF0ZTogc3RyaW5nLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUaXRsZTogc3RyaW5nLFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbFxuKTogSnN4UHJldmlld1Jlc3VsdCA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBqc3gsIGlubGluZUVkaXRhYmxlRmllbGRzIH0gPSB0cmFuc3BpbGVIYW5kbGViYXJzVG9Kc3godGVtcGxhdGUsIHByb3BlcnRpZXMsICcgICAgICAgICAgJywgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgXG4gICAgLy8gVmFsaWRhdGUgdGhlIG91dHB1dCBoYXMgc29tZSBjb250ZW50XG4gICAgaWYgKGpzeC50cmltKCkubGVuZ3RoIDwgNTApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignR2VuZXJhdGVkIEpTWCB0b28gc2hvcnQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gV3JhcCBpbiBhIGNvbnRhaW5lciB3aXRoIHRoZSBlZGl0b3IgcHJldmlldyBjbGFzc1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudElkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgICByZXR1cm4ge1xuICAgICAganN4OiBgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3XCI+XG4ke2pzeH1cbiAgICAgICAgICA8L2Rpdj5gLFxuICAgICAgaW5saW5lRWRpdGFibGVGaWVsZHNcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUud2FybihgSGFuZGxlYmFycyB0cmFuc3BpbGF0aW9uIGZhaWxlZCwgdXNpbmcgc2ltcGxpZmllZCBwcmV2aWV3OiAke2Vycm9yfWApO1xuICAgIHJldHVybiB7XG4gICAgICBqc3g6IGdlbmVyYXRlRmFsbGJhY2tQcmV2aWV3KHByb3BlcnRpZXMsIGNvbXBvbmVudElkLCBjb21wb25lbnRUaXRsZSksXG4gICAgICBpbmxpbmVFZGl0YWJsZUZpZWxkczogbmV3IFNldCgpXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==