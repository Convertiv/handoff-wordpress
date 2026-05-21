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
const transpileHandlebarsToJsx = (template, properties, indent = '          ', innerBlocksField, editorConfig) => {
    const context = {
        properties,
        indent,
        inLoop: false,
        editorConfig,
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
const generateJsxPreview = (template, properties, componentId, componentTitle, innerBlocksField, editorConfig) => {
    try {
        const { jsx, inlineEditableFields } = (0, exports.transpileHandlebarsToJsx)(template, properties, '          ', innerBlocksField, editorConfig);
        // Validate the output has some content
        if (jsx.trim().length < 50) {
            throw new Error('Generated JSX too short');
        }
        // Wrap in a container with the editor preview class
        const className = componentId.replace(/_/g, '-');
        return {
            jsx: `          <div className="${className}-editor-preview handoff-editor-canvas">
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7OztBQUVILHVEQUFzRDtBQUd0RCxtQ0FBc0M7QUFDdEMsbURBQWtFO0FBQ2xFLHFEQUE2QztBQUM3QyxxREFBK0U7QUFFL0UsbUVBQW1FO0FBQ25FLGlDQUF3SjtBQUEvSSxvR0FBQSxXQUFXLE9BQUE7QUFBRSx1R0FBQSxjQUFjLE9BQUE7QUFBRSw2R0FBQSxvQkFBb0IsT0FBQTtBQUFFLHNHQUFBLGFBQWEsT0FBQTtBQUFFLCtHQUFBLHNCQUFzQixPQUFBO0FBQUUsNEhBQUEsbUNBQW1DLE9BQUE7QUFHdEk7O0dBRUc7QUFDSSxNQUFNLHdCQUF3QixHQUFHLENBQ3RDLFFBQWdCLEVBQ2hCLFVBQTJDLEVBQzNDLFNBQWlCLFlBQVksRUFDN0IsZ0JBQWdDLEVBQ2hDLFlBQWtDLEVBQ2pCLEVBQUU7SUFDbkIsTUFBTSxPQUFPLEdBQXNCO1FBQ2pDLFVBQVU7UUFDVixNQUFNO1FBQ04sTUFBTSxFQUFFLEtBQUs7UUFDYixZQUFZO0tBQ2IsQ0FBQztJQUVGLDZEQUE2RDtJQUM3RCxNQUFNLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxHQUFHLElBQUEsZ0NBQWdCLEVBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBRTdGLHlLQUF5SztJQUN6SyxNQUFNLFlBQVksR0FBRyxJQUFBLDZCQUFhLEVBQUMsU0FBUyxDQUFDLENBQUM7SUFFOUMsZ0JBQWdCO0lBQ2hCLE1BQU0sSUFBSSxHQUFHLElBQUEsd0JBQVMsRUFBQyxZQUFZLEVBQUU7UUFDbkMsZ0JBQWdCLEVBQUUsS0FBSztRQUN2QixPQUFPLEVBQUUsS0FBSztLQUNmLENBQUMsQ0FBQztJQUVILGlCQUFpQjtJQUNqQixJQUFJLEdBQUcsR0FBRyxJQUFBLDBC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UUFDakQsT0FBTztZQUNMLEdBQUcsRUFBRSw2QkFBNkIsU0FBUztFQUMvQyxHQUFHO2lCQUNZO1lBQ1gsb0JBQW9CO1NBQ3JCLENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsOERBQThELEtBQUssRUFBRSxDQUFDLENBQUM7UUFDcEYsT0FBTztZQUNMLEdBQUcsRUFBRSxJQUFBLCtCQUF1QixFQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsY0FBYyxDQUFDO1lBQ3JFLG9CQUFvQixFQUFFLElBQUksR0FBRyxFQUFFO1NBQ2hDLENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBckNXLFFBQUEsa0JBQWtCLHNCQXFDN0IiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEhhbmRsZWJhcnMgdG8gSlNYIFRyYW5zcGlsZXJcbiAqIFxuICogVXNlcyBub2RlLWh0bWwtcGFyc2VyIGFuZCByZWdleCBwYXR0ZXJucyBmb3IgYWNjdXJhdGUgY29udmVyc2lvblxuICogb2YgSGFuZGxlYmFycyB0ZW1wbGF0ZXMgdG8gUmVhY3QgSlNYIGZvciBHdXRlbmJlcmcgZWRpdG9yIHByZXZpZXdzLlxuICovXG5cbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlSFRNTCB9IGZyb20gJ25vZGUtaHRtbC1wYXJzZXInO1xuaW1wb3J0IHsgSGFuZG9mZkVkaXRvckNvbmZpZywgSGFuZG9mZlByb3BlcnR5IH0gZnJvbSAnLi4vLi4vdHlwZXMnO1xuaW1wb3J0IHsgVHJhbnNwaWxlckNvbnRleHQsIFRyYW5zcGlsZVJlc3VsdCB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdG9DYW1lbENhc2UgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IHByZXByb2Nlc3NGaWVsZHMsIGNsZWFuVGVtcGxhdGUgfSBmcm9tICcuL3ByZXByb2Nlc3NvcnMnO1xuaW1wb3J0IHsgbm9kZVRvSnN4IH0gZnJvbSAnLi9ub2RlLWNvbnZlcnRlcic7XG5pbXBvcnQgeyBwb3N0cHJvY2Vzc0pzeCwgcG9zdHByb2Nlc3NUZW1wbGF0ZUxpdGVyYWxzIH0gZnJvbSAnLi9wb3N0cHJvY2Vzc29ycyc7XG5cbi8vIFJlLWV4cG9ydCB1dGlsaXRpZXMgdGhhdCBhcmUgdXNlZCBieSBvdGhlciBwYXJ0cyBvZiB0aGUgY29kZWJhc2VcbmV4cG9ydCB7IHRvQ2FtZWxDYXNlLCBpc1Jlc2VydmVkV29yZCwgc2FuaXRpemVSZXNlcnZlZE5hbWUsIGh1bWFuaXplTGFiZWwsIG5vcm1hbGl6ZVNlbGVjdE9wdGlvbnMsIGdldFRlbXBsYXRlUmVmZXJlbmNlZEF0dHJpYnV0ZU5hbWVzIH0gZnJvbSAnLi91dGlscyc7XG5leHBvcnQgdHlwZSB7IE5vcm1hbGl6ZWRTZWxlY3RPcHRpb24gfSBmcm9tICcuL3V0aWxzJztcblxuLyoqXG4gKiBNYWluIHRyYW5zcGlsZXIgZnVuY3Rpb24gLSBjb252ZXJ0cyBIYW5kbGViYXJzIHRlbXBsYXRlIHRvIEpTWFxuICovXG5leHBvcnQgY29uc3QgdHJhbnNwaWxlSGFuZGxlYmFyc1RvSnN4ID0gKFxuICB0ZW1wbGF0ZTogc3RyaW5nLCBcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PixcbiAgaW5kZW50OiBzdHJpbmcgPSAnICAgICAgICAgICcsXG4gIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsLFxuICBlZGl0b3JDb25maWc/OiBIYW5kb2ZmRWRpdG9yQ29uZmlnLFxuKTogVHJhbnNwaWxlUmVzdWx0ID0+IHtcbiAgY29uc3QgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgcHJvcGVydGllcyxcbiAgICBpbmRlbnQsXG4gICAgaW5Mb29wOiBmYWxzZSxcbiAgICBlZGl0b3JDb25maWcsXG4gIH07XG4gIFxuICAvLyBQcmVwcm9jZXNzIGZpZWxkcyBGSVJTVCAoYmVmb3JlIGNsZWFuVGVtcGxhdGUgc3RyaXBzIHRoZW0pXG4gIGNvbnN0IHsgdGVtcGxhdGU6IHByb2Nlc3NlZCwgaW5saW5lRWRpdGFibGVGaWVsZHMgfSA9IHByZXByb2Nlc3NGaWVsZHModGVtcGxhdGUsIHByb3BlcnRpZXMpO1xuICBcbiAgLy8gQ2xlYW4gYW5kIHByZXByb2Nlc3MgdGVtcGxhdGUgKGNsZWFuVGVtcGxhdGUgcnVucyBwcmVwcm9jZXNzQmxvY2tzIHdoZW4gcHJvY2Vzc2luZyBmdWxsIHRlbXBsYXRlIHNvIGxvb3AgaW5uZXIgY29udGVudCBzdGF5cyByYXcgZm9yIGNvcnJlY3QgYXJyYXkgbmFtZSB3aGVuIGV4cGFuZGVkKVxuICBjb25zdCBwcmVwcm9jZXNzZWQgPSBjbGVhblRlbXBsYXRlKHByb2Nlc3NlZCk7XG4gIFxuICAvLyBQYXJzZSBhcyBIVE1MXG4gIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7XG4gICAgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsXG4gICAgY29tbWVudDogZmFsc2VcbiAgfSk7XG4gIFxuICAvLyBDb252ZXJ0IHRvIEpTWFxuICBsZXQganN4ID0gbm9kZVRvSnN4KHJvb3QsIGNvbnRleHQpO1xuICBcbiAgLy8gUG9zdC1wcm9jZXNzIHRvIGhhbmRsZSBibG9jayBtYXJrZXJzXG4gIGpzeCA9IHBvc3Rwcm9jZXNzSnN4KGpzeCwgY29udGV4dCwgJ2l0ZW0nLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgXG4gIC8vIENvbnZlcnQgdGVtcGxhdGUgbGl0ZXJhbCBtYXJrZXJzIGJhY2sgdG8gYWN0dWFsIHRlbXBsYXRlIGxpdGVyYWxzXG4gIGpzeCA9IHBvc3Rwcm9jZXNzVGVtcGxhdGVMaXRlcmFscyhqc3gpO1xuICBcbiAgLy8gQ2xlYW4gdXAgZW1wdHkgbGluZXMgYW5kIG5vcm1hbGl6ZSBpbmRlbnRhdGlvblxuICBqc3ggPSBqc3hcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcChsaW5lID0+IGxpbmUudHJpbSgpID8gYCR7aW5kZW50fSR7bGluZS50cmltKCl9YCA6ICcnKVxuICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAuam9pbignXFxuJyk7XG4gIFxuICByZXR1cm4ge1xuICAgIGpzeCxcbiAgICBuZWVkc0ZyYWdtZW50OiBqc3guaW5jbHVkZXMoJzxGcmFnbWVudCcpLFxuICAgIGlubGluZUVkaXRhYmxlRmllbGRzXG4gIH07XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGEgc2ltcGxlIGZhbGxiYWNrIHByZXZpZXdcbiAqL1xuZXhwb3J0IGNvbnN0IGdlbmVyYXRlRmFsbGJhY2tQcmV2aWV3ID0gKFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUaXRsZTogc3RyaW5nXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gIGNvbnN0IGhhc0JhY2tncm91bmRJbWFnZSA9IHByb3BlcnRpZXMuYmFja2dyb3VuZF9pbWFnZT8udHlwZSA9PT0gJ2ltYWdlJztcbiAgbGV0IHByZXZpZXcgPSBgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3XCJgO1xuICBcbiAgaWYgKGhhc0JhY2tncm91bmRJbWFnZSkge1xuICAgIHByZXZpZXcgKz0gYFxuICAgICAgICAgICAgc3R5bGU9e3sgXG4gICAgICAgICAgICAgIGJhY2tncm91bmRJbWFnZTogYmFja2dyb3VuZEltYWdlPy5zcmMgXG4gICAgICAgICAgICAgICAgPyBcXGB1cmwoJ1xcJHtiYWNrZ3JvdW5kSW1hZ2Uuc3JjfScpXFxgIFxuICAgICAgICAgICAgICAgIDogdW5kZWZpbmVkIFxuICAgICAgICAgICAgfX1gO1xuICB9XG4gIHByZXZpZXcgKz0gYD5gO1xuICBcbiAgcHJldmlldyArPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJsb2NrLWNvbnRlbnRcIj5cbiAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiYmxvY2stdGl0bGVcIj57X18oJyR7Y29tcG9uZW50VGl0bGV9JywgJ2hhbmRvZmYnKX08L3A+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cImJsb2NrLWhpbnRcIj57X18oJ0NvbmZpZ3VyZSB0aGlzIGJsb2NrIHVzaW5nIHRoZSBzaWRlYmFyIHNldHRpbmdzLicsICdoYW5kb2ZmJyl9PC9wPmA7XG4gIFxuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IGF0dHJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3RleHQnKSB7XG4gICAgICBwcmV2aWV3ICs9IGBcbiAgICAgICAgICAgICAgeyR7YXR0ck5hbWV9ICYmIDxwIGNsYXNzTmFtZT1cInByZXZpZXctJHtrZXkucmVwbGFjZSgvXy9nLCAnLScpfVwiPnske2F0dHJOYW1lfX08L3A+fWA7XG4gICAgfVxuICB9XG4gIFxuICBwcmV2aWV3ICs9IGBcbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PmA7XG4gIFxuICByZXR1cm4gcHJldmlldztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSnN4UHJldmlld1Jlc3VsdCB7XG4gIGpzeDogc3RyaW5nO1xuICBpbmxpbmVFZGl0YWJsZUZpZWxkczogU2V0PHN0cmluZz47XG59XG5cbi8qKlxuICogR2VuZXJhdGUgYSBKU1ggcHJldmlldyB0aGF0J3Mgc3VpdGFibGUgZm9yIHRoZSBHdXRlbmJlcmcgZWRpdG9yXG4gKiBGYWxscyBiYWNrIHRvIHNpbXBsaWZpZWQgcHJldmlldyBpZiB0cmFuc3BpbGF0aW9uIHByb2R1Y2VzIHVudXNhYmxlIG91dHB1dFxuICovXG5leHBvcnQgY29uc3QgZ2VuZXJhdGVKc3hQcmV2aWV3ID0gKFxuICB0ZW1wbGF0ZTogc3RyaW5nLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuICBjb21wb25lbnRJZDogc3RyaW5nLFxuICBjb21wb25lbnRUaXRsZTogc3RyaW5nLFxuICBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCxcbiAgZWRpdG9yQ29uZmlnPzogSGFuZG9mZkVkaXRvckNvbmZpZyxcbik6IEpzeFByZXZpZXdSZXN1bHQgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsganN4LCBpbmxpbmVFZGl0YWJsZUZpZWxkcyB9ID0gdHJhbnNwaWxlSGFuZGxlYmFyc1RvSnN4KFxuICAgICAgdGVtcGxhdGUsXG4gICAgICBwcm9wZXJ0aWVzLFxuICAgICAgJyAgICAgICAgICAnLFxuICAgICAgaW5uZXJCbG9ja3NGaWVsZCxcbiAgICAgIGVkaXRvckNvbmZpZyxcbiAgICApO1xuICAgIFxuICAgIC8vIFZhbGlkYXRlIHRoZSBvdXRwdXQgaGFzIHNvbWUgY29udGVudFxuICAgIGlmIChqc3gudHJpbSgpLmxlbmd0aCA8IDUwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dlbmVyYXRlZCBKU1ggdG9vIHNob3J0Jyk7XG4gICAgfVxuICAgIFxuICAgIC8vIFdyYXAgaW4gYSBjb250YWluZXIgd2l0aCB0aGUgZWRpdG9yIHByZXZpZXcgY2xhc3NcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnRJZC5yZXBsYWNlKC9fL2csICctJyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGpzeDogYCAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyBoYW5kb2ZmLWVkaXRvci1jYW52YXNcIj5cbiR7anN4fVxuICAgICAgICAgIDwvZGl2PmAsXG4gICAgICBpbmxpbmVFZGl0YWJsZUZpZWxkc1xuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS53YXJuKGBIYW5kbGViYXJzIHRyYW5zcGlsYXRpb24gZmFpbGVkLCB1c2luZyBzaW1wbGlmaWVkIHByZXZpZXc6ICR7ZXJyb3J9YCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGpzeDogZ2VuZXJhdGVGYWxsYmFja1ByZXZpZXcocHJvcGVydGllcywgY29tcG9uZW50SWQsIGNvbXBvbmVudFRpdGxlKSxcbiAgICAgIGlubGluZUVkaXRhYmxlRmllbGRzOiBuZXcgU2V0KClcbiAgICB9O1xuICB9XG59O1xuIl19