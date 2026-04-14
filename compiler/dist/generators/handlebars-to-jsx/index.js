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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7OztBQUVILHVEQUFzRDtBQUd0RCxtQ0FBc0M7QUFDdEMsbURBQWtFO0FBQ2xFLHFEQUE2QztBQUM3QyxxREFBK0U7QUFFL0UsbUVBQW1FO0FBQ25FLGlDQUF3SjtBQUEvSSxvR0FBQSxXQUFXLE9BQUE7QUFBRSx1R0FBQSxjQUFjLE9BQUE7QUFBRSw2R0FBQSxvQkFBb0IsT0FBQTtBQUFFLHNHQUFBLGFBQWEsT0FBQTtBQUFFLCtHQUFBLHNCQUFzQixPQUFBO0FBQUUsNEhBQUEsbUNBQW1DLE9BQUE7QUFHdEk7O0dBRUc7QUFDSSxNQUFNLHdCQUF3QixHQUFHLENBQ3RDLFFBQWdCLEVBQ2hCLFVBQTJDLEVBQzNDLFNBQWlCLFlBQVksRUFDN0IsZ0JBQWdDLEVBQ2YsRUFBRTtJQUNuQixNQUFNLE9BQU8sR0FBc0I7UUFDakMsVUFBVTtRQUNWLE1BQU07UUFDTixNQUFNLEVBQUUsS0FBSztLQUNkLENBQUM7SUFFRiw2REFBNkQ7SUFDN0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxJQUFBLGdDQUFnQixFQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUU3Rix5S0FBeUs7SUFDekssTUFBTSxZQUFZLEdBQUcsSUFBQSw2QkFBYSxFQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRTlDLGdCQUFnQjtJQUNoQixNQUFNLElBQUksR0FBRyxJQUFBLHdCQUFTLEVBQUMsWUFBWSxFQUFFO1FBQ25DLGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsT0FBTyxFQUFFLEtBQUs7S0FDZixDQUFDLENBQUM7SUFFSCxpQkFBaUI7SUFDakIsSUFBSSxHQUFHLEdBQUcsSUFBQSwwQkFBUyxFQUFDLElBQUksRUFBRSxPQUFP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RztpQkFDWTtZQUNYLG9CQUFvQjtTQUNyQixDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLDhEQUE4RCxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3BGLE9BQU87WUFDTCxHQUFHLEVBQUUsSUFBQSwrQkFBdUIsRUFBQyxVQUFVLEVBQUUsV0FBVyxFQUFFLGNBQWMsQ0FBQztZQUNyRSxvQkFBb0IsRUFBRSxJQUFJLEdBQUcsRUFBRTtTQUNoQyxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTlCVyxRQUFBLGtCQUFrQixzQkE4QjdCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBIYW5kbGViYXJzIHRvIEpTWCBUcmFuc3BpbGVyXG4gKiBcbiAqIFVzZXMgbm9kZS1odG1sLXBhcnNlciBhbmQgcmVnZXggcGF0dGVybnMgZm9yIGFjY3VyYXRlIGNvbnZlcnNpb25cbiAqIG9mIEhhbmRsZWJhcnMgdGVtcGxhdGVzIHRvIFJlYWN0IEpTWCBmb3IgR3V0ZW5iZXJnIGVkaXRvciBwcmV2aWV3cy5cbiAqL1xuXG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUhUTUwgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IEhhbmRvZmZQcm9wZXJ0eSB9IGZyb20gJy4uLy4uL3R5cGVzJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0LCBUcmFuc3BpbGVSZXN1bHQgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBwcmVwcm9jZXNzRmllbGRzLCBjbGVhblRlbXBsYXRlIH0gZnJvbSAnLi9wcmVwcm9jZXNzb3JzJztcbmltcG9ydCB7IG5vZGVUb0pzeCB9IGZyb20gJy4vbm9kZS1jb252ZXJ0ZXInO1xuaW1wb3J0IHsgcG9zdHByb2Nlc3NKc3gsIHBvc3Rwcm9jZXNzVGVtcGxhdGVMaXRlcmFscyB9IGZyb20gJy4vcG9zdHByb2Nlc3NvcnMnO1xuXG4vLyBSZS1leHBvcnQgdXRpbGl0aWVzIHRoYXQgYXJlIHVzZWQgYnkgb3RoZXIgcGFydHMgb2YgdGhlIGNvZGViYXNlXG5leHBvcnQgeyB0b0NhbWVsQ2FzZSwgaXNSZXNlcnZlZFdvcmQsIHNhbml0aXplUmVzZXJ2ZWROYW1lLCBodW1hbml6ZUxhYmVsLCBub3JtYWxpemVTZWxlY3RPcHRpb25zLCBnZXRUZW1wbGF0ZVJlZmVyZW5jZWRBdHRyaWJ1dGVOYW1lcyB9IGZyb20gJy4vdXRpbHMnO1xuZXhwb3J0IHR5cGUgeyBOb3JtYWxpemVkU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi91dGlscyc7XG5cbi8qKlxuICogTWFpbiB0cmFuc3BpbGVyIGZ1bmN0aW9uIC0gY29udmVydHMgSGFuZGxlYmFycyB0ZW1wbGF0ZSB0byBKU1hcbiAqL1xuZXhwb3J0IGNvbnN0IHRyYW5zcGlsZUhhbmRsZWJhcnNUb0pzeCA9IChcbiAgdGVtcGxhdGU6IHN0cmluZywgXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4gIGluZGVudDogc3RyaW5nID0gJyAgICAgICAgICAnLFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbFxuKTogVHJhbnNwaWxlUmVzdWx0ID0+IHtcbiAgY29uc3QgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgcHJvcGVydGllcyxcbiAgICBpbmRlbnQsXG4gICAgaW5Mb29wOiBmYWxzZVxuICB9O1xuICBcbiAgLy8gUHJlcHJvY2VzcyBmaWVsZHMgRklSU1QgKGJlZm9yZSBjbGVhblRlbXBsYXRlIHN0cmlwcyB0aGVtKVxuICBjb25zdCB7IHRlbXBsYXRlOiBwcm9jZXNzZWQsIGlubGluZUVkaXRhYmxlRmllbGRzIH0gPSBwcmVwcm9jZXNzRmllbGRzKHRlbXBsYXRlLCBwcm9wZXJ0aWVzKTtcbiAgXG4gIC8vIENsZWFuIGFuZCBwcmVwcm9jZXNzIHRlbXBsYXRlIChjbGVhblRlbXBsYXRlIHJ1bnMgcHJlcHJvY2Vzc0Jsb2NrcyB3aGVuIHByb2Nlc3NpbmcgZnVsbCB0ZW1wbGF0ZSBzbyBsb29wIGlubmVyIGNvbnRlbnQgc3RheXMgcmF3IGZvciBjb3JyZWN0IGFycmF5IG5hbWUgd2hlbiBleHBhbmRlZClcbiAgY29uc3QgcHJlcHJvY2Vzc2VkID0gY2xlYW5UZW1wbGF0ZShwcm9jZXNzZWQpO1xuICBcbiAgLy8gUGFyc2UgYXMgSFRNTFxuICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwge1xuICAgIGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLFxuICAgIGNvbW1lbnQ6IGZhbHNlXG4gIH0pO1xuICBcbiAgLy8gQ29udmVydCB0byBKU1hcbiAgbGV0IGpzeCA9IG5vZGVUb0pzeChyb290LCBjb250ZXh0KTtcbiAgXG4gIC8vIFBvc3QtcHJvY2VzcyB0byBoYW5kbGUgYmxvY2sgbWFya2Vyc1xuICBqc3ggPSBwb3N0cHJvY2Vzc0pzeChqc3gsIGNvbnRleHQsICdpdGVtJywgaW5uZXJCbG9ja3NGaWVsZCk7XG4gIFxuICAvLyBDb252ZXJ0IHRlbXBsYXRlIGxpdGVyYWwgbWFya2VycyBiYWNrIHRvIGFjdHVhbCB0ZW1wbGF0ZSBsaXRlcmFsc1xuICBqc3ggPSBwb3N0cHJvY2Vzc1RlbXBsYXRlTGl0ZXJhbHMoanN4KTtcbiAgXG4gIC8vIENsZWFuIHVwIGVtcHR5IGxpbmVzIGFuZCBub3JtYWxpemUgaW5kZW50YXRpb25cbiAganN4ID0ganN4XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSA/IGAke2luZGVudH0ke2xpbmUudHJpbSgpfWAgOiAnJylcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJ1xcbicpO1xuICBcbiAgcmV0dXJuIHtcbiAgICBqc3gsXG4gICAgbmVlZHNGcmFnbWVudDoganN4LmluY2x1ZGVzKCc8RnJhZ21lbnQnKSxcbiAgICBpbmxpbmVFZGl0YWJsZUZpZWxkc1xuICB9O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHNpbXBsZSBmYWxsYmFjayBwcmV2aWV3XG4gKi9cbmV4cG9ydCBjb25zdCBnZW5lcmF0ZUZhbGxiYWNrUHJldmlldyA9IChcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PixcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VGl0bGU6IHN0cmluZ1xuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50SWQucmVwbGFjZSgvXy9nLCAnLScpO1xuICBjb25zdCBoYXNCYWNrZ3JvdW5kSW1hZ2UgPSBwcm9wZXJ0aWVzLmJhY2tncm91bmRfaW1hZ2U/LnR5cGUgPT09ICdpbWFnZSc7XG4gIGxldCBwcmV2aWV3ID0gYCAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlld1wiYDtcbiAgXG4gIGlmIChoYXNCYWNrZ3JvdW5kSW1hZ2UpIHtcbiAgICBwcmV2aWV3ICs9IGBcbiAgICAgICAgICAgIHN0eWxlPXt7IFxuICAgICAgICAgICAgICBiYWNrZ3JvdW5kSW1hZ2U6IGJhY2tncm91bmRJbWFnZT8uc3JjIFxuICAgICAgICAgICAgICAgID8gXFxgdXJsKCdcXCR7YmFja2dyb3VuZEltYWdlLnNyY30nKVxcYCBcbiAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZCBcbiAgICAgICAgICAgIH19YDtcbiAgfVxuICBwcmV2aWV3ICs9IGA+YDtcbiAgXG4gIHByZXZpZXcgKz0gYFxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJibG9jay1jb250ZW50XCI+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cImJsb2NrLXRpdGxlXCI+e19fKCcke2NvbXBvbmVudFRpdGxlfScsICdoYW5kb2ZmJyl9PC9wPlxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJibG9jay1oaW50XCI+e19fKCdDb25maWd1cmUgdGhpcyBibG9jayB1c2luZyB0aGUgc2lkZWJhciBzZXR0aW5ncy4nLCAnaGFuZG9mZicpfTwvcD5gO1xuICBcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBjb25zdCBhdHRyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICd0ZXh0Jykge1xuICAgICAgcHJldmlldyArPSBgXG4gICAgICAgICAgICAgIHske2F0dHJOYW1lfSAmJiA8cCBjbGFzc05hbWU9XCJwcmV2aWV3LSR7a2V5LnJlcGxhY2UoL18vZywgJy0nKX1cIj57JHthdHRyTmFtZX19PC9wPn1gO1xuICAgIH1cbiAgfVxuICBcbiAgcHJldmlldyArPSBgXG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5gO1xuICBcbiAgcmV0dXJuIHByZXZpZXc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIEpzeFByZXZpZXdSZXN1bHQge1xuICBqc3g6IHN0cmluZztcbiAgaW5saW5lRWRpdGFibGVGaWVsZHM6IFNldDxzdHJpbmc+O1xufVxuXG4vKipcbiAqIEdlbmVyYXRlIGEgSlNYIHByZXZpZXcgdGhhdCdzIHN1aXRhYmxlIGZvciB0aGUgR3V0ZW5iZXJnIGVkaXRvclxuICogRmFsbHMgYmFjayB0byBzaW1wbGlmaWVkIHByZXZpZXcgaWYgdHJhbnNwaWxhdGlvbiBwcm9kdWNlcyB1bnVzYWJsZSBvdXRwdXRcbiAqL1xuZXhwb3J0IGNvbnN0IGdlbmVyYXRlSnN4UHJldmlldyA9IChcbiAgdGVtcGxhdGU6IHN0cmluZyxcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PixcbiAgY29tcG9uZW50SWQ6IHN0cmluZyxcbiAgY29tcG9uZW50VGl0bGU6IHN0cmluZyxcbiAgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGxcbik6IEpzeFByZXZpZXdSZXN1bHQgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsganN4LCBpbmxpbmVFZGl0YWJsZUZpZWxkcyB9ID0gdHJhbnNwaWxlSGFuZGxlYmFyc1RvSnN4KHRlbXBsYXRlLCBwcm9wZXJ0aWVzLCAnICAgICAgICAgICcsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRoZSBvdXRwdXQgaGFzIHNvbWUgY29udGVudFxuICAgIGlmIChqc3gudHJpbSgpLmxlbmd0aCA8IDUwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dlbmVyYXRlZCBKU1ggdG9vIHNob3J0Jyk7XG4gICAgfVxuICAgIFxuICAgIC8vIFdyYXAgaW4gYSBjb250YWluZXIgd2l0aCB0aGUgZWRpdG9yIHByZXZpZXcgY2xhc3NcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGpzeDogYCAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlld1wiPlxuJHtqc3h9XG4gICAgICAgICAgPC9kaXY+YCxcbiAgICAgIGlubGluZUVkaXRhYmxlRmllbGRzXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLndhcm4oYEhhbmRsZWJhcnMgdHJhbnNwaWxhdGlvbiBmYWlsZWQsIHVzaW5nIHNpbXBsaWZpZWQgcHJldmlldzogJHtlcnJvcn1gKTtcbiAgICByZXR1cm4ge1xuICAgICAganN4OiBnZW5lcmF0ZUZhbGxiYWNrUHJldmlldyhwcm9wZXJ0aWVzLCBjb21wb25lbnRJZCwgY29tcG9uZW50VGl0bGUpLFxuICAgICAgaW5saW5lRWRpdGFibGVGaWVsZHM6IG5ldyBTZXQoKVxuICAgIH07XG4gIH1cbn07XG4iXX0=