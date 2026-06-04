"use strict";
/**
 * Generates SCSS files for Gutenberg blocks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStyleScss = exports.generateEditorScss = void 0;
const canvas_shim_1 = require("./canvas-shim");
/**
 * Generate editor.scss with preview styles
 * TODO: This is much too specific to the framework that we're using to test.
 * We should consider removing this and using the native styles, with limited
 * tweaks to improve the editing experience.
 *
 * @param component - The Handoff component data
 * @returns The SCSS for the editor.scss file
 * @example
 * ```scss
 * .about-editor-preview {
 *   position: relative;
 *   min-height: 200px;
 * }
 * ```
 */
const generateEditorScss = (component, options = {}) => {
    const className = component.id.replace(/_/g, '-');
    if (options.styleMode === 'tailwind') {
        return `.${className}-editor-preview {
  position: relative;
  min-height: 200px;
}
`;
    }
    const hasBackgroundImage = component.properties.background_image?.type === 'image';
    const canvasShimPrefix = options.skipCanvasShimImport
        ? ''
        : (0, canvas_shim_1.editorScssCanvasShimPrefix)(component.code, options.editorConfig);
    let scss = `${canvasShimPrefix}// Editor-specific styles for ${component.title} block
.${className}-editor-preview {
  position: relative;
  min-height: 200px;`;
    // TODO: consider removing this because the native styles should handle this
    if (hasBackgroundImage) {
        scss += `
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;`;
    }
    scss += `

  .block-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    pointer-events: none;
  }

  .block-content {
    position: relative;
    z-index: 1;
  }

  .block-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0 0 0.5rem;
    color: inherit;
  }

  .block-hint {
    font-size: 0.875rem;
    opacity: 0.7;
    margin: 0;
  }
`;
    // Add preview styles for text properties
    for (const [key, property] of Object.entries(component.properties)) {
        if (property.type === 'text') {
            const propClass = key.replace(/_/g, '-');
            scss += `
  .preview-${propClass} {
    margin: 0.5rem 0;
    font-size: 1rem;
  }
`;
        }
    }
    scss += `}

// // Placeholder when no background image is set
// .${className}-editor-preview:not([style*="background-image"]) {
//   background-image: none;
// }

// Ensure proper positioning context for Gutenberg toolbar
// The toolbar needs position:relative on parent elements to attach correctly
.${className}-editor-preview {

  // RichText components need proper display for toolbar attachment
  .block-editor-rich-text__editable {
    display: block;
    position: relative;
  }
}

// Editable field hover and focus states
.${className}-editor-preview .handoff-editable-field {
  position: relative;
  display: inline-block;
  min-width: 20px;
  min-height: 1em;
  transition: outline 0.15s ease, background-color 0.15s ease;
  outline: 2px solid transparent;
  outline-offset: 2px;
  border-radius: 2px;
  
  &:hover {
    outline-color: rgba(0, 124, 186, 0.4);
    background-color: rgba(0, 124, 186, 0.05);
  }
  
  &:focus,
  &:focus-within,
  &.is-selected {
    outline-color: rgba(0, 124, 186, 0.8);
    background-color: rgba(0, 124, 186, 0.1);
  }
}

:where(.editor-styles-wrapper) h1, :where(.editor-styles-wrapper) h2, :where(.editor-styles-wrapper) h3, :where(.editor-styles-wrapper) h4, :where(.editor-styles-wrapper) h5, :where(.editor-styles-wrapper) h6 {
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0 0 0.5rem;
  color: #000;
}

// Image field placeholder styling
.${className}-editor-preview .handoff-placeholder-image {
  display: block;
  max-width: 100%;
  height: auto;
  opacity: 0.7;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 1;
  }
}

.block-editor-link-control__search-item.is-current {
  padding-left:0;
  padding-right: 0;
}

// ============================================
// 10up Block Components - Repeater Styling
// ============================================

.repeater-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #ccc;
    transition: box-shadow 0.5s ease !important;
}
.repeater-item-page-name .components-base-control__field,
.repeater-item-visibility .components-base-control__field {
    margin-bottom: 0;
}

.repeater-item-page-name {
    flex: 1;
    padding: 0 1rem;
}

.repeater-item-visibility .components-form-toggle {
    margin-right: 0 !important;
}

.repeater-item-visibility,
.repeater-item-remove {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
}

.repeater-controls {
    display: flex;
    justify-content: end;
    padding: 16px;
}

.repeater-item__drag-handle {
    padding-left: 0.5rem;
}

.repeater-item__drag-handle + .repeater-item-page-name {
    padding-left: 0;
}

.repeater-item--is-dragging {
    border-top: 1px solid #ccc;
    background-color: #fff;
    box-shadow: 0 14px 28px -10px rgb(0 0 0 / 25%), 0 10px 10px -5px rgb(0 0 0 / 22%);
    transition: box-shadow 0.5s ease;
}

// Collapsible repeater item structure
.repeater-item__collapse {
    width: 100%;

    // Remove default marker/arrow
    > summary {
        list-style: none;
        &::-webkit-details-marker {
            display: none;
        }
    }
}

// Header row with title and actions
.repeater-item__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    cursor: pointer;
    user-select: none;

    // Custom collapse indicator
    &::before {
        content: '';
        display: inline-block;
        width: 0;
        height: 0;
        margin-right: 8px;
        border-left: 5px solid #757575;
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        transition: transform 0.15s ease;
    }

    // Rotate arrow when open
    details[open] > &::before {
        transform: rotate(90deg);
    }
}

// Item title
.repeater-item__title {
    flex: 1;
    font-weight: 500;
    font-size: 13px;
    color: #1e1e1e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

// Actions container (remove button)
.repeater-item__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;

    .components-button.is-destructive {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        min-width: 24px;
        height: 24px;
        border-radius: 4px;
        transition: background-color 0.15s ease;

        &:hover {
            background-color: rgba(204, 24, 24, 0.1);
        }

        svg {
            width: 16px;
            height: 16px;
        }
    }
}

// Collapsible fields container
.repeater-item__fields {
    padding: 12px 0 4px 13px;
    border-left: 2px solid #e0e0e0;
    margin-left: 2px;
    margin-top: 4px;
}

// Add button wrapper - spacing and alignment
.repeater-add-button-wrapper {
    display: flex;
    justify-content: flex-end;
    padding-top: 16px;
    margin-top: 8px;
}

// Custom add button styling
.repeater-add-button {
    color: #1e1e1e !important;
    background: transparent !important;
    
    &:hover {
        color: #0073aa !important;
    }
    
    svg {
        fill: currentColor;
    }
}
`;
    return scss;
};
exports.generateEditorScss = generateEditorScss;
/**
 * Generate style.scss for frontend styles
 */
const generateStyleScss = (component, options = {}) => {
    const className = component.id.replace(/_/g, '-');
    if (options.styleMode === 'tailwind') {
        return `// Tailwind mode: utilities from theme design-system.css
.wp-block-handoff-${className} {
  margin: 0;
}
`;
    }
    // Extract CSS classes used in the template
    const classMatches = component.code.match(/class="([^"]+)"/g) || [];
    const usedClasses = new Set();
    classMatches.forEach(match => {
        const classes = match.replace('class="', '').replace('"', '').split(/\s+/);
        classes.forEach(cls => {
            if (cls && !cls.startsWith('{{')) {
                usedClasses.add(cls);
            }
        });
    });
    let scss = `// Frontend styles for ${component.title} block
// Note: Most styles come from the shared Handoff theme styles.
// This file contains block-specific overrides and fallbacks.

.wp-block-handoff-${className} {
  // Reset any WordPress block margins
  margin: 0;
`;
    // Add basic fallback styles based on detected classes
    if (usedClasses.has('c-subheader')) {
        scss += `
  .c-subheader {
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    position: relative;
    color: #fff;
  }
`;
    }
    if (usedClasses.has('c-subheader__overlay')) {
        scss += `
  .c-subheader__overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }
`;
    }
    // o-container / o-row / o-col: use design-system main.css only (not block style.scss fallbacks).
    if (usedClasses.has('c-breadcrumbs')) {
        scss += `
  .c-breadcrumbs {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .c-breadcrumbs__item {
    display: inline-flex;
    align-items: center;
  }

  .c-breadcrumbs__link {
    color: inherit;
    text-decoration: none;
    font-size: 0.875rem;

    &:hover {
      text-decoration: underline;
    }
  }

  .c-breadcrumbs__separator {
    opacity: 0.7;
  }
`;
    }
    scss += `}
`;
    return scss;
};
exports.generateStyleScss = generateStyleScss;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2dlbmVyYXRvcnMvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBR0gsK0NBQW1GO0FBRW5GOzs7Ozs7Ozs7Ozs7Ozs7R0FlRztBQUNILE1BQU0sa0JBQWtCLEdBQUcsQ0FDekIsU0FBMkIsRUFDM0IsVUFBNkIsRUFBRSxFQUN2QixFQUFFO0lBQ1YsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRWxELElBQUksT0FBTyxDQUFDLFNBQVMsS0FBSyxVQUFVLEVBQUUsQ0FBQztRQUNyQyxPQUFPLElBQUksU0FBUzs7OztDQUl2QixDQUFDO0lBQ0EsQ0FBQztJQUVELE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEtBQUssT0FBTyxDQUFDO0lBQ25GLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLG9CQUFvQjtRQUNuRCxDQUFDLENBQUMsRUFBRTtRQUNKLENBQUMsQ0FBQyxJQUFBLHdDQUEwQixFQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBRXJFLElBQUksSUFBSSxHQUFHLEdBQUcsZ0JBQWdCLGlDQUFpQyxTQUFTLENBQUMsS0FBSztHQUM3RSxTQUFTOztxQkFFUyxDQUFDO0lBRXBCLDRFQUE0RTtJQUM1RSxJQUFJLGtCQUFrQixFQUFFLENBQUM7UUFDdkIsSUFBSSxJQUFJOzs7Z0NBR29CLENBQUM7SUFDL0IsQ0FBQztJQUVELElBQUksSUFBSTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTRCVCxDQUFDO0lBRUEseUNBQXlDO0lBQ3pDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFNB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IEd1dGVuYmVyZyBibG9ja3NcbiAqL1xuXG5pbXBvcnQgeyBIYW5kb2ZmQ29tcG9uZW50IH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZWRpdG9yU2Nzc0NhbnZhc1NoaW1QcmVmaXgsIHR5cGUgRWRpdG9yU2Nzc09wdGlvbnMgfSBmcm9tICcuL2NhbnZhcy1zaGltJztcblxuLyoqXG4gKiBHZW5lcmF0ZSBlZGl0b3Iuc2NzcyB3aXRoIHByZXZpZXcgc3R5bGVzXG4gKiBUT0RPOiBUaGlzIGlzIG11Y2ggdG9vIHNwZWNpZmljIHRvIHRoZSBmcmFtZXdvcmsgdGhhdCB3ZSdyZSB1c2luZyB0byB0ZXN0LlxuICogV2Ugc2hvdWxkIGNvbnNpZGVyIHJlbW92aW5nIHRoaXMgYW5kIHVzaW5nIHRoZSBuYXRpdmUgc3R5bGVzLCB3aXRoIGxpbWl0ZWQgXG4gKiB0d2Vha3MgdG8gaW1wcm92ZSB0aGUgZWRpdGluZyBleHBlcmllbmNlLlxuICpcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHJldHVybnMgVGhlIFNDU1MgZm9yIHRoZSBlZGl0b3Iuc2NzcyBmaWxlXG4gKiBAZXhhbXBsZVxuICogYGBgc2Nzc1xuICogLmFib3V0LWVkaXRvci1wcmV2aWV3IHtcbiAqICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICogICBtaW4taGVpZ2h0OiAyMDBweDtcbiAqIH1cbiAqIGBgYFxuICovXG5jb25zdCBnZW5lcmF0ZUVkaXRvclNjc3MgPSAoXG4gIGNvbXBvbmVudDogSGFuZG9mZkNvbXBvbmVudCxcbiAgb3B0aW9uczogRWRpdG9yU2Nzc09wdGlvbnMgPSB7fSxcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IGNvbXBvbmVudC5pZC5yZXBsYWNlKC9fL2csICctJyk7XG5cbiAgaWYgKG9wdGlvbnMuc3R5bGVNb2RlID09PSAndGFpbHdpbmQnKSB7XG4gICAgcmV0dXJuIGAuJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBtaW4taGVpZ2h0OiAyMDBweDtcbn1cbmA7XG4gIH1cblxuICBjb25zdCBoYXNCYWNrZ3JvdW5kSW1hZ2UgPSBjb21wb25lbnQucHJvcGVydGllcy5iYWNrZ3JvdW5kX2ltYWdlPy50eXBlID09PSAnaW1hZ2UnO1xuICBjb25zdCBjYW52YXNTaGltUHJlZml4ID0gb3B0aW9ucy5za2lwQ2FudmFzU2hpbUltcG9ydFxuICAgID8gJydcbiAgICA6IGVkaXRvclNjc3NDYW52YXNTaGltUHJlZml4KGNvbXBvbmVudC5jb2RlLCBvcHRpb25zLmVkaXRvckNvbmZpZyk7XG5cbiAgbGV0IHNjc3MgPSBgJHtjYW52YXNTaGltUHJlZml4fS8vIEVkaXRvci1zcGVjaWZpYyBzdHlsZXMgZm9yICR7Y29tcG9uZW50LnRpdGxlfSBibG9ja1xuLiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgbWluLWhlaWdodDogMjAwcHg7YDtcblxuICAvLyBUT0RPOiBjb25zaWRlciByZW1vdmluZyB0aGlzIGJlY2F1c2UgdGhlIG5hdGl2ZSBzdHlsZXMgc2hvdWxkIGhhbmRsZSB0aGlzXG4gIGlmIChoYXNCYWNrZ3JvdW5kSW1hZ2UpIHtcbiAgICBzY3NzICs9IGBcbiAgYmFja2dyb3VuZC1zaXplOiBjb3ZlcjtcbiAgYmFja2dyb3VuZC1wb3NpdGlvbjogY2VudGVyO1xuICBiYWNrZ3JvdW5kLXJlcGVhdDogbm8tcmVwZWF0O2A7XG4gIH1cblxuICBzY3NzICs9IGBcblxuICAuYmxvY2stb3ZlcmxheSB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHRvcDogMDtcbiAgICBib3R0b206IDA7XG4gICAgbGVmdDogMDtcbiAgICByaWdodDogMDtcbiAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgfVxuXG4gIC5ibG9jay1jb250ZW50IHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgei1pbmRleDogMTtcbiAgfVxuXG4gIC5ibG9jay10aXRsZSB7XG4gICAgZm9udC1zaXplOiAxLjVyZW07XG4gICAgZm9udC13ZWlnaHQ6IGJvbGQ7XG4gICAgbWFyZ2luOiAwIDAgMC41cmVtO1xuICAgIGNvbG9yOiBpbmhlcml0O1xuICB9XG5cbiAgLmJsb2NrLWhpbnQge1xuICAgIGZvbnQtc2l6ZTogMC44NzVyZW07XG4gICAgb3BhY2l0eTogMC43O1xuICAgIG1hcmdpbjogMDtcbiAgfVxuYDtcblxuICAvLyBBZGQgcHJldmlldyBzdHlsZXMgZm9yIHRleHQgcHJvcGVydGllc1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICBpZiAocHJvcGVydHkudHlwZSA9PT0gJ3RleHQnKSB7XG4gICAgICBjb25zdCBwcm9wQ2xhc3MgPSBrZXkucmVwbGFjZSgvXy9nLCAnLScpO1xuICAgICAgc2NzcyArPSBgXG4gIC5wcmV2aWV3LSR7cHJvcENsYXNzfSB7XG4gICAgbWFyZ2luOiAwLjVyZW0gMDtcbiAgICBmb250LXNpemU6IDFyZW07XG4gIH1cbmA7XG4gICAgfVxuICB9XG5cbiAgc2NzcyArPSBgfVxuXG4vLyAvLyBQbGFjZWhvbGRlciB3aGVuIG5vIGJhY2tncm91bmQgaW1hZ2UgaXMgc2V0XG4vLyAuJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3Om5vdChbc3R5bGUqPVwiYmFja2dyb3VuZC1pbWFnZVwiXSkge1xuLy8gICBiYWNrZ3JvdW5kLWltYWdlOiBub25lO1xuLy8gfVxuXG4vLyBFbnN1cmUgcHJvcGVyIHBvc2l0aW9uaW5nIGNvbnRleHQgZm9yIEd1dGVuYmVyZyB0b29sYmFyXG4vLyBUaGUgdG9vbGJhciBuZWVkcyBwb3NpdGlvbjpyZWxhdGl2ZSBvbiBwYXJlbnQgZWxlbWVudHMgdG8gYXR0YWNoIGNvcnJlY3RseVxuLiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyB7XG5cbiAgLy8gUmljaFRleHQgY29tcG9uZW50cyBuZWVkIHByb3BlciBkaXNwbGF5IGZvciB0b29sYmFyIGF0dGFjaG1lbnRcbiAgLmJsb2NrLWVkaXRvci1yaWNoLXRleHRfX2VkaXRhYmxlIHtcbiAgICBkaXNwbGF5OiBibG9jaztcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIH1cbn1cblxuLy8gRWRpdGFibGUgZmllbGQgaG92ZXIgYW5kIGZvY3VzIHN0YXRlc1xuLiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyAuaGFuZG9mZi1lZGl0YWJsZS1maWVsZCB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICBtaW4td2lkdGg6IDIwcHg7XG4gIG1pbi1oZWlnaHQ6IDFlbTtcbiAgdHJhbnNpdGlvbjogb3V0bGluZSAwLjE1cyBlYXNlLCBiYWNrZ3JvdW5kLWNvbG9yIDAuMTVzIGVhc2U7XG4gIG91dGxpbmU6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgb3V0bGluZS1vZmZzZXQ6IDJweDtcbiAgYm9yZGVyLXJhZGl1czogMnB4O1xuICBcbiAgJjpob3ZlciB7XG4gICAgb3V0bGluZS1jb2xvcjogcmdiYSgwLCAxMjQsIDE4NiwgMC40KTtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDAsIDEyNCwgMTg2LCAwLjA1KTtcbiAgfVxuICBcbiAgJjpmb2N1cyxcbiAgJjpmb2N1cy13aXRoaW4sXG4gICYuaXMtc2VsZWN0ZWQge1xuICAgIG91dGxpbmUtY29sb3I6IHJnYmEoMCwgMTI0LCAxODYsIDAuOCk7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgwLCAxMjQsIDE4NiwgMC4xKTtcbiAgfVxufVxuXG46d2hlcmUoLmVkaXRvci1zdHlsZXMtd3JhcHBlcikgaDEsIDp3aGVyZSguZWRpdG9yLXN0eWxlcy13cmFwcGVyKSBoMiwgOndoZXJlKC5lZGl0b3Itc3R5bGVzLXdyYXBwZXIpIGgzLCA6d2hlcmUoLmVkaXRvci1zdHlsZXMtd3JhcHBlcikgaDQsIDp3aGVyZSguZWRpdG9yLXN0eWxlcy13cmFwcGVyKSBoNSwgOndoZXJlKC5lZGl0b3Itc3R5bGVzLXdyYXBwZXIpIGg2IHtcbiAgZm9udC1zaXplOiAxLjVyZW07XG4gIGZvbnQtd2VpZ2h0OiBib2xkO1xuICBtYXJnaW46IDAgMCAwLjVyZW07XG4gIGNvbG9yOiAjMDAwO1xufVxuXG4vLyBJbWFnZSBmaWVsZCBwbGFjZWhvbGRlciBzdHlsaW5nXG4uJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IC5oYW5kb2ZmLXBsYWNlaG9sZGVyLWltYWdlIHtcbiAgZGlzcGxheTogYmxvY2s7XG4gIG1heC13aWR0aDogMTAwJTtcbiAgaGVpZ2h0OiBhdXRvO1xuICBvcGFjaXR5OiAwLjc7XG4gIHRyYW5zaXRpb246IG9wYWNpdHkgMC4xNXMgZWFzZTtcblxuICAmOmhvdmVyIHtcbiAgICBvcGFjaXR5OiAxO1xuICB9XG59XG5cbi5ibG9jay1lZGl0b3ItbGluay1jb250cm9sX19zZWFyY2gtaXRlbS5pcy1jdXJyZW50IHtcbiAgcGFkZGluZy1sZWZ0OjA7XG4gIHBhZGRpbmctcmlnaHQ6IDA7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyAxMHVwIEJsb2NrIENvbXBvbmVudHMgLSBSZXBlYXRlciBTdHlsaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4ucmVwZWF0ZXItaXRlbSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjY2NjO1xuICAgIHRyYW5zaXRpb246IGJveC1zaGFkb3cgMC41cyBlYXNlICFpbXBvcnRhbnQ7XG59XG4ucmVwZWF0ZXItaXRlbS1wYWdlLW5hbWUgLmNvbXBvbmVudHMtYmFzZS1jb250cm9sX19maWVsZCxcbi5yZXBlYXRlci1pdGVtLXZpc2liaWxpdHkgLmNvbXBvbmVudHMtYmFzZS1jb250cm9sX19maWVsZCB7XG4gICAgbWFyZ2luLWJvdHRvbTogMDtcbn1cblxuLnJlcGVhdGVyLWl0ZW0tcGFnZS1uYW1lIHtcbiAgICBmbGV4OiAxO1xuICAgIHBhZGRpbmc6IDAgMXJlbTtcbn1cblxuLnJlcGVhdGVyLWl0ZW0tdmlzaWJpbGl0eSAuY29tcG9uZW50cy1mb3JtLXRvZ2dsZSB7XG4gICAgbWFyZ2luLXJpZ2h0OiAwICFpbXBvcnRhbnQ7XG59XG5cbi5yZXBlYXRlci1pdGVtLXZpc2liaWxpdHksXG4ucmVwZWF0ZXItaXRlbS1yZW1vdmUge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBwYWRkaW5nOiAxNnB4O1xufVxuXG4ucmVwZWF0ZXItY29udHJvbHMge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAganVzdGlmeS1jb250ZW50OiBlbmQ7XG4gICAgcGFkZGluZzogMTZweDtcbn1cblxuLnJlcGVhdGVyLWl0ZW1fX2RyYWctaGFuZGxlIHtcbiAgICBwYWRkaW5nLWxlZnQ6IDAuNXJlbTtcbn1cblxuLnJlcGVhdGVyLWl0ZW1fX2RyYWctaGFuZGxlICsgLnJlcGVhdGVyLWl0ZW0tcGFnZS1uYW1lIHtcbiAgICBwYWRkaW5nLWxlZnQ6IDA7XG59XG5cbi5yZXBlYXRlci1pdGVtLS1pcy1kcmFnZ2luZyB7XG4gICAgYm9yZGVyLXRvcDogMXB4IHNvbGlkICNjY2M7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogI2ZmZjtcbiAgICBib3gtc2hhZG93OiAwIDE0cHggMjhweCAtMTBweCByZ2IoMCAwIDAgLyAyNSUpLCAwIDEwcHggMTBweCAtNXB4IHJnYigwIDAgMCAvIDIyJSk7XG4gICAgdHJhbnNpdGlvbjogYm94LXNoYWRvdyAwLjVzIGVhc2U7XG59XG5cbi8vIENvbGxhcHNpYmxlIHJlcGVhdGVyIGl0ZW0gc3RydWN0dXJlXG4ucmVwZWF0ZXItaXRlbV9fY29sbGFwc2Uge1xuICAgIHdpZHRoOiAxMDAlO1xuXG4gICAgLy8gUmVtb3ZlIGRlZmF1bHQgbWFya2VyL2Fycm93XG4gICAgPiBzdW1tYXJ5IHtcbiAgICAgICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICAgICAgJjo6LXdlYmtpdC1kZXRhaWxzLW1hcmtlciB7XG4gICAgICAgICAgICBkaXNwbGF5OiBub25lO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBIZWFkZXIgcm93IHdpdGggdGl0bGUgYW5kIGFjdGlvbnNcbi5yZXBlYXRlci1pdGVtX19oZWFkZXIge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgcGFkZGluZzogOHB4IDA7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIHVzZXItc2VsZWN0OiBub25lO1xuXG4gICAgLy8gQ3VzdG9tIGNvbGxhcHNlIGluZGljYXRvclxuICAgICY6OmJlZm9yZSB7XG4gICAgICAgIGNvbnRlbnQ6ICcnO1xuICAgICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICAgIHdpZHRoOiAwO1xuICAgICAgICBoZWlnaHQ6IDA7XG4gICAgICAgIG1hcmdpbi1yaWdodDogOHB4O1xuICAgICAgICBib3JkZXItbGVmdDogNXB4IHNvbGlkICM3NTc1NzU7XG4gICAgICAgIGJvcmRlci10b3A6IDRweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgICAgYm9yZGVyLWJvdHRvbTogNHB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xNXMgZWFzZTtcbiAgICB9XG5cbiAgICAvLyBSb3RhdGUgYXJyb3cgd2hlbiBvcGVuXG4gICAgZGV0YWlsc1tvcGVuXSA+ICY6OmJlZm9yZSB7XG4gICAgICAgIHRyYW5zZm9ybTogcm90YXRlKDkwZGVnKTtcbiAgICB9XG59XG5cbi8vIEl0ZW0gdGl0bGVcbi5yZXBlYXRlci1pdGVtX190aXRsZSB7XG4gICAgZmxleDogMTtcbiAgICBmb250LXdlaWdodDogNTAwO1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBjb2xvcjogIzFlMWUxZTtcbiAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG59XG5cbi8vIEFjdGlvbnMgY29udGFpbmVyIChyZW1vdmUgYnV0dG9uKVxuLnJlcGVhdGVyLWl0ZW1fX2FjdGlvbnMge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBnYXA6IDRweDtcbiAgICBtYXJnaW4tbGVmdDogOHB4O1xuXG4gICAgLmNvbXBvbmVudHMtYnV0dG9uLmlzLWRlc3RydWN0aXZlIHtcbiAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICAgIHBhZGRpbmc6IDRweDtcbiAgICAgICAgbWluLXdpZHRoOiAyNHB4O1xuICAgICAgICBoZWlnaHQ6IDI0cHg7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjE1cyBlYXNlO1xuXG4gICAgICAgICY6aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgyMDQsIDI0LCAyNCwgMC4xKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN2ZyB7XG4gICAgICAgICAgICB3aWR0aDogMTZweDtcbiAgICAgICAgICAgIGhlaWdodDogMTZweDtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gQ29sbGFwc2libGUgZmllbGRzIGNvbnRhaW5lclxuLnJlcGVhdGVyLWl0ZW1fX2ZpZWxkcyB7XG4gICAgcGFkZGluZzogMTJweCAwIDRweCAxM3B4O1xuICAgIGJvcmRlci1sZWZ0OiAycHggc29saWQgI2UwZTBlMDtcbiAgICBtYXJnaW4tbGVmdDogMnB4O1xuICAgIG1hcmdpbi10b3A6IDRweDtcbn1cblxuLy8gQWRkIGJ1dHRvbiB3cmFwcGVyIC0gc3BhY2luZyBhbmQgYWxpZ25tZW50XG4ucmVwZWF0ZXItYWRkLWJ1dHRvbi13cmFwcGVyIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7XG4gICAgcGFkZGluZy10b3A6IDE2cHg7XG4gICAgbWFyZ2luLXRvcDogOHB4O1xufVxuXG4vLyBDdXN0b20gYWRkIGJ1dHRvbiBzdHlsaW5nXG4ucmVwZWF0ZXItYWRkLWJ1dHRvbiB7XG4gICAgY29sb3I6ICMxZTFlMWUgIWltcG9ydGFudDtcbiAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudCAhaW1wb3J0YW50O1xuICAgIFxuICAgICY6aG92ZXIge1xuICAgICAgICBjb2xvcjogIzAwNzNhYSAhaW1wb3J0YW50O1xuICAgIH1cbiAgICBcbiAgICBzdmcge1xuICAgICAgICBmaWxsOiBjdXJyZW50Q29sb3I7XG4gICAgfVxufVxuYDtcblxuICByZXR1cm4gc2Nzcztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3R5bGVTY3NzT3B0aW9ucyB7XG4gIHN0eWxlTW9kZT86ICdsZWdhY3knIHwgJ3RhaWx3aW5kJztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBzdHlsZS5zY3NzIGZvciBmcm9udGVuZCBzdHlsZXNcbiAqL1xuY29uc3QgZ2VuZXJhdGVTdHlsZVNjc3MgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCBvcHRpb25zOiBTdHlsZVNjc3NPcHRpb25zID0ge30pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnQuaWQucmVwbGFjZSgvXy9nLCAnLScpO1xuXG4gIGlmIChvcHRpb25zLnN0eWxlTW9kZSA9PT0gJ3RhaWx3aW5kJykge1xuICAgIHJldHVybiBgLy8gVGFpbHdpbmQgbW9kZTogdXRpbGl0aWVzIGZyb20gdGhlbWUgZGVzaWduLXN5c3RlbS5jc3Ncbi53cC1ibG9jay1oYW5kb2ZmLSR7Y2xhc3NOYW1lfSB7XG4gIG1hcmdpbjogMDtcbn1cbmA7XG4gIH1cblxuICAvLyBFeHRyYWN0IENTUyBjbGFzc2VzIHVzZWQgaW4gdGhlIHRlbXBsYXRlXG4gIGNvbnN0IGNsYXNzTWF0Y2hlcyA9IGNvbXBvbmVudC5jb2RlLm1hdGNoKC9jbGFzcz1cIihbXlwiXSspXCIvZykgfHwgW107XG4gIGNvbnN0IHVzZWRDbGFzc2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNsYXNzTWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcbiAgICBjb25zdCBjbGFzc2VzID0gbWF0Y2gucmVwbGFjZSgnY2xhc3M9XCInLCAnJykucmVwbGFjZSgnXCInLCAnJykuc3BsaXQoL1xccysvKTtcbiAgICBjbGFzc2VzLmZvckVhY2goY2xzID0+IHtcbiAgICAgIGlmIChjbHMgJiYgIWNscy5zdGFydHNXaXRoKCd7eycpKSB7XG4gICAgICAgIHVzZWRDbGFzc2VzLmFkZChjbHMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICBsZXQgc2NzcyA9IGAvLyBGcm9udGVuZCBzdHlsZXMgZm9yICR7Y29tcG9uZW50LnRpdGxlfSBibG9ja1xuLy8gTm90ZTogTW9zdCBzdHlsZXMgY29tZSBmcm9tIHRoZSBzaGFyZWQgSGFuZG9mZiB0aGVtZSBzdHlsZXMuXG4vLyBUaGlzIGZpbGUgY29udGFpbnMgYmxvY2stc3BlY2lmaWMgb3ZlcnJpZGVzIGFuZCBmYWxsYmFja3MuXG5cbi53cC1ibG9jay1oYW5kb2ZmLSR7Y2xhc3NOYW1lfSB7XG4gIC8vIFJlc2V0IGFueSBXb3JkUHJlc3MgYmxvY2sgbWFyZ2luc1xuICBtYXJnaW46IDA7XG5gO1xuXG4gIC8vIEFkZCBiYXNpYyBmYWxsYmFjayBzdHlsZXMgYmFzZWQgb24gZGV0ZWN0ZWQgY2xhc3Nlc1xuICBpZiAodXNlZENsYXNzZXMuaGFzKCdjLXN1YmhlYWRlcicpKSB7XG4gICAgc2NzcyArPSBgXG4gIC5jLXN1YmhlYWRlciB7XG4gICAgYmFja2dyb3VuZC1zaXplOiBjb3ZlcjtcbiAgICBiYWNrZ3JvdW5kLXBvc2l0aW9uOiBjZW50ZXI7XG4gICAgYmFja2dyb3VuZC1yZXBlYXQ6IG5vLXJlcGVhdDtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgY29sb3I6ICNmZmY7XG4gIH1cbmA7XG4gIH1cblxuICBpZiAodXNlZENsYXNzZXMuaGFzKCdjLXN1YmhlYWRlcl9fb3ZlcmxheScpKSB7XG4gICAgc2NzcyArPSBgXG4gIC5jLXN1YmhlYWRlcl9fb3ZlcmxheSB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHRvcDogMDtcbiAgICBib3R0b206IDA7XG4gICAgbGVmdDogMDtcbiAgICByaWdodDogMDtcbiAgfVxuYDtcbiAgfVxuXG4gIC8vIG8tY29udGFpbmVyIC8gby1yb3cgLyBvLWNvbDogdXNlIGRlc2lnbi1zeXN0ZW0gbWFpbi5jc3Mgb25seSAobm90IGJsb2NrIHN0eWxlLnNjc3MgZmFsbGJhY2tzKS5cblxuICBpZiAodXNlZENsYXNzZXMuaGFzKCdjLWJyZWFkY3J1bWJzJykpIHtcbiAgICBzY3NzICs9IGBcbiAgLmMtYnJlYWRjcnVtYnMge1xuICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgcGFkZGluZzogMDtcbiAgICBtYXJnaW46IDA7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LXdyYXA6IHdyYXA7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBnYXA6IDAuNXJlbTtcbiAgfVxuXG4gIC5jLWJyZWFkY3J1bWJzX19pdGVtIHtcbiAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICB9XG5cbiAgLmMtYnJlYWRjcnVtYnNfX2xpbmsge1xuICAgIGNvbG9yOiBpbmhlcml0O1xuICAgIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgICBmb250LXNpemU6IDAuODc1cmVtO1xuXG4gICAgJjpob3ZlciB7XG4gICAgICB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcbiAgICB9XG4gIH1cblxuICAuYy1icmVhZGNydW1ic19fc2VwYXJhdG9yIHtcbiAgICBvcGFjaXR5OiAwLjc7XG4gIH1cbmA7XG4gIH1cblxuICBzY3NzICs9IGB9XG5gO1xuXG4gIHJldHVybiBzY3NzO1xufTtcblxuZXhwb3J0IHsgZ2VuZXJhdGVFZGl0b3JTY3NzLCBnZW5lcmF0ZVN0eWxlU2NzcyB9O1xuIl19