"use strict";
/**
 * Generates SCSS files for Gutenberg blocks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStyleScss = exports.generateEditorScss = void 0;
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
const generateEditorScss = (component) => {
    const className = component.id.replace(/_/g, '-');
    const hasBackgroundImage = component.properties.background_image?.type === 'image';
    let scss = `// Editor-specific styles for ${component.title} block
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
const generateStyleScss = (component) => {
    const className = component.id.replace(/_/g, '-');
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
    if (usedClasses.has('o-container')) {
        scss += `
  .o-container {
    position: relative;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
  }
`;
    }
    if (usedClasses.has('o-row')) {
        scss += `
  .o-row {
    display: flex;
    flex-wrap: wrap;
  }
`;
    }
    if (usedClasses.has('o-col') || usedClasses.has('o-col-12')) {
        scss += `
  .o-col {
    flex: 1;
  }

  .o-col-12 {
    width: 100%;
  }
`;
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2dlbmVyYXRvcnMvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBSUg7Ozs7Ozs7Ozs7Ozs7OztHQWVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFNBQTJCLEVBQVUsRUFBRTtJQUNqRSxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDbEQsTUFBTSxrQkFBa0IsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFLElBQUksS0FBSyxPQUFPLENBQUM7SUFFbkYsSUFBSSxJQUFJLEdBQUcsaUNBQWlDLFNBQVMsQ0FBQyxLQUFLO0dBQzFELFNBQVM7O3FCQUVTLENBQUM7SUFFcEIsNEVBQTRFO0lBQzVFLElBQUksa0JBQWtCLEVBQUUsQ0FBQztRQUN2QixJQUFJLElBQUk7OztnQ0FHb0IsQ0FBQztJQUMvQixDQUFDO0lBRUQsSUFBSSxJQUFJOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBNEJULENBQUM7SUFFQSx5Q0FBeUM7SUFDekMsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDbkUsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzdCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3pDLElBQUksSUFBSTthQUNELFNBQVM7Ozs7Q0FJckIsQ0FBQztRQUNFLENBQUM7SUFDSCxDQUFDO0lBRUQsSUFBSSxJQUFJOzs7TUFHSixTQUFTOzs7Ozs7R0FNWixTQUFTOzs7Ozs7Ozs7O0dBVVQsU0FBUzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQStCVCxTQUFTOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW1MWCxDQUFDO0lBRUEsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDLENBQUM7QUE2SE8sZ0RBQWtCO0FBM0gzQjs7R0FFRztBQUNILE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxTQUEyQixFQUFVLEVBQUU7SUFDaEUsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRWxELDJDQUEyQztJQUMzQyxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNwRSxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3RDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDM0IsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0UsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNwQixJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDakMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN2QixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksSUFBSSxHQUFHLDBCQUEwQixTQUFTLENBQUMsS0FBSzs7OztvQkFJbEMsU0FBUzs7O0NBRzVCLENBQUM7SUFFQSxzREFBc0Q7SUFDdEQsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7UUFDbkMsSUFBSSxJQUFJOzs7Ozs7OztDQVFYLENBQUM7SUFDQSxDQUFDO0lBRUQsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztRQUM1QyxJQUFJLElBQUk7Ozs7Ozs7O0NBUVgsQ0FBQztJQUNBLENBQUM7SUFFRCxJQUFJLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxJQUFJLElBQUk7Ozs7Ozs7Q0FPWCxDQUFDO0lBQ0EsQ0FBQztJQUVELElBQUksV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQzdCLElBQUksSUFBSTs7Ozs7Q0FLWCxDQUFDO0lBQ0EsQ0FBQztJQUVELElBQUksV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDNUQsSUFBSSxJQUFJOzs7Ozs7OztDQVFYLENBQUM7SUFDQSxDQUFDO0lBRUQsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDckMsSUFBSSxJQUFJOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTZCWCxDQUFDO0lBQ0EsQ0FBQztJQUVELElBQUksSUFBSTtDQUNULENBQUM7SUFFQSxPQUFPLElBQUksQ0FBQztBQUNkLENBQUMsQ0FBQztBQUUyQiw4Q0FBaUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBTQ1NTIGZpbGVzIGZvciBHdXRlbmJlcmcgYmxvY2tzXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBHZW5lcmF0ZSBlZGl0b3Iuc2NzcyB3aXRoIHByZXZpZXcgc3R5bGVzXG4gKiBUT0RPOiBUaGlzIGlzIG11Y2ggdG9vIHNwZWNpZmljIHRvIHRoZSBmcmFtZXdvcmsgdGhhdCB3ZSdyZSB1c2luZyB0byB0ZXN0LlxuICogV2Ugc2hvdWxkIGNvbnNpZGVyIHJlbW92aW5nIHRoaXMgYW5kIHVzaW5nIHRoZSBuYXRpdmUgc3R5bGVzLCB3aXRoIGxpbWl0ZWQgXG4gKiB0d2Vha3MgdG8gaW1wcm92ZSB0aGUgZWRpdGluZyBleHBlcmllbmNlLlxuICpcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHJldHVybnMgVGhlIFNDU1MgZm9yIHRoZSBlZGl0b3Iuc2NzcyBmaWxlXG4gKiBAZXhhbXBsZVxuICogYGBgc2Nzc1xuICogLmFib3V0LWVkaXRvci1wcmV2aWV3IHtcbiAqICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICogICBtaW4taGVpZ2h0OiAyMDBweDtcbiAqIH1cbiAqIGBgYFxuICovXG5jb25zdCBnZW5lcmF0ZUVkaXRvclNjc3MgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgaGFzQmFja2dyb3VuZEltYWdlID0gY29tcG9uZW50LnByb3BlcnRpZXMuYmFja2dyb3VuZF9pbWFnZT8udHlwZSA9PT0gJ2ltYWdlJztcblxuICBsZXQgc2NzcyA9IGAvLyBFZGl0b3Itc3BlY2lmaWMgc3R5bGVzIGZvciAke2NvbXBvbmVudC50aXRsZX0gYmxvY2tcbi4ke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcge1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIG1pbi1oZWlnaHQ6IDIwMHB4O2A7XG5cbiAgLy8gVE9ETzogY29uc2lkZXIgcmVtb3ZpbmcgdGhpcyBiZWNhdXNlIHRoZSBuYXRpdmUgc3R5bGVzIHNob3VsZCBoYW5kbGUgdGhpc1xuICBpZiAoaGFzQmFja2dyb3VuZEltYWdlKSB7XG4gICAgc2NzcyArPSBgXG4gIGJhY2tncm91bmQtc2l6ZTogY292ZXI7XG4gIGJhY2tncm91bmQtcG9zaXRpb246IGNlbnRlcjtcbiAgYmFja2dyb3VuZC1yZXBlYXQ6IG5vLXJlcGVhdDtgO1xuICB9XG5cbiAgc2NzcyArPSBgXG5cbiAgLmJsb2NrLW92ZXJsYXkge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICB0b3A6IDA7XG4gICAgYm90dG9tOiAwO1xuICAgIGxlZnQ6IDA7XG4gICAgcmlnaHQ6IDA7XG4gICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gIH1cblxuICAuYmxvY2stY29udGVudCB7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgIHotaW5kZXg6IDE7XG4gIH1cblxuICAuYmxvY2stdGl0bGUge1xuICAgIGZvbnQtc2l6ZTogMS41cmVtO1xuICAgIGZvbnQtd2VpZ2h0OiBib2xkO1xuICAgIG1hcmdpbjogMCAwIDAuNXJlbTtcbiAgICBjb2xvcjogaW5oZXJpdDtcbiAgfVxuXG4gIC5ibG9jay1oaW50IHtcbiAgICBmb250LXNpemU6IDAuODc1cmVtO1xuICAgIG9wYWNpdHk6IDAuNztcbiAgICBtYXJnaW46IDA7XG4gIH1cbmA7XG5cbiAgLy8gQWRkIHByZXZpZXcgc3R5bGVzIGZvciB0ZXh0IHByb3BlcnRpZXNcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgaWYgKHByb3BlcnR5LnR5cGUgPT09ICd0ZXh0Jykge1xuICAgICAgY29uc3QgcHJvcENsYXNzID0ga2V5LnJlcGxhY2UoL18vZywgJy0nKTtcbiAgICAgIHNjc3MgKz0gYFxuICAucHJldmlldy0ke3Byb3BDbGFzc30ge1xuICAgIG1hcmdpbjogMC41cmVtIDA7XG4gICAgZm9udC1zaXplOiAxcmVtO1xuICB9XG5gO1xuICAgIH1cbiAgfVxuXG4gIHNjc3MgKz0gYH1cblxuLy8gLy8gUGxhY2Vob2xkZXIgd2hlbiBubyBiYWNrZ3JvdW5kIGltYWdlIGlzIHNldFxuLy8gLiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldzpub3QoW3N0eWxlKj1cImJhY2tncm91bmQtaW1hZ2VcIl0pIHtcbi8vICAgYmFja2dyb3VuZC1pbWFnZTogbm9uZTtcbi8vIH1cblxuLy8gRW5zdXJlIHByb3BlciBwb3NpdGlvbmluZyBjb250ZXh0IGZvciBHdXRlbmJlcmcgdG9vbGJhclxuLy8gVGhlIHRvb2xiYXIgbmVlZHMgcG9zaXRpb246cmVsYXRpdmUgb24gcGFyZW50IGVsZW1lbnRzIHRvIGF0dGFjaCBjb3JyZWN0bHlcbi4ke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcge1xuXG4gIC8vIFJpY2hUZXh0IGNvbXBvbmVudHMgbmVlZCBwcm9wZXIgZGlzcGxheSBmb3IgdG9vbGJhciBhdHRhY2htZW50XG4gIC5ibG9jay1lZGl0b3ItcmljaC10ZXh0X19lZGl0YWJsZSB7XG4gICAgZGlzcGxheTogYmxvY2s7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICB9XG59XG5cbi8vIEVkaXRhYmxlIGZpZWxkIGhvdmVyIGFuZCBmb2N1cyBzdGF0ZXNcbi4ke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcgLmhhbmRvZmYtZWRpdGFibGUtZmllbGQge1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgbWluLXdpZHRoOiAyMHB4O1xuICBtaW4taGVpZ2h0OiAxZW07XG4gIHRyYW5zaXRpb246IG91dGxpbmUgMC4xNXMgZWFzZSwgYmFja2dyb3VuZC1jb2xvciAwLjE1cyBlYXNlO1xuICBvdXRsaW5lOiAycHggc29saWQgdHJhbnNwYXJlbnQ7XG4gIG91dGxpbmUtb2Zmc2V0OiAycHg7XG4gIGJvcmRlci1yYWRpdXM6IDJweDtcbiAgXG4gICY6aG92ZXIge1xuICAgIG91dGxpbmUtY29sb3I6IHJnYmEoMCwgMTI0LCAxODYsIDAuNCk7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgwLCAxMjQsIDE4NiwgMC4wNSk7XG4gIH1cbiAgXG4gICY6Zm9jdXMsXG4gICY6Zm9jdXMtd2l0aGluLFxuICAmLmlzLXNlbGVjdGVkIHtcbiAgICBvdXRsaW5lLWNvbG9yOiByZ2JhKDAsIDEyNCwgMTg2LCAwLjgpO1xuICAgIGJhY2tncm91bmQtY29sb3I6IHJnYmEoMCwgMTI0LCAxODYsIDAuMSk7XG4gIH1cbn1cblxuOndoZXJlKC5lZGl0b3Itc3R5bGVzLXdyYXBwZXIpIGgxLCA6d2hlcmUoLmVkaXRvci1zdHlsZXMtd3JhcHBlcikgaDIsIDp3aGVyZSguZWRpdG9yLXN0eWxlcy13cmFwcGVyKSBoMywgOndoZXJlKC5lZGl0b3Itc3R5bGVzLXdyYXBwZXIpIGg0LCA6d2hlcmUoLmVkaXRvci1zdHlsZXMtd3JhcHBlcikgaDUsIDp3aGVyZSguZWRpdG9yLXN0eWxlcy13cmFwcGVyKSBoNiB7XG4gIGZvbnQtc2l6ZTogMS41cmVtO1xuICBmb250LXdlaWdodDogYm9sZDtcbiAgbWFyZ2luOiAwIDAgMC41cmVtO1xuICBjb2xvcjogIzAwMDtcbn1cblxuLy8gSW1hZ2UgZmllbGQgcGxhY2Vob2xkZXIgc3R5bGluZ1xuLiR7Y2xhc3NOYW1lfS1lZGl0b3ItcHJldmlldyAuaGFuZG9mZi1wbGFjZWhvbGRlci1pbWFnZSB7XG4gIGRpc3BsYXk6IGJsb2NrO1xuICBtYXgtd2lkdGg6IDEwMCU7XG4gIGhlaWdodDogYXV0bztcbiAgb3BhY2l0eTogMC43O1xuICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMTVzIGVhc2U7XG5cbiAgJjpob3ZlciB7XG4gICAgb3BhY2l0eTogMTtcbiAgfVxufVxuXG4uYmxvY2stZWRpdG9yLWxpbmstY29udHJvbF9fc2VhcmNoLWl0ZW0uaXMtY3VycmVudCB7XG4gIHBhZGRpbmctbGVmdDowO1xuICBwYWRkaW5nLXJpZ2h0OiAwO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gMTB1cCBCbG9jayBDb21wb25lbnRzIC0gUmVwZWF0ZXIgU3R5bGluZ1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLnJlcGVhdGVyLWl0ZW0ge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2NjYztcbiAgICB0cmFuc2l0aW9uOiBib3gtc2hhZG93IDAuNXMgZWFzZSAhaW1wb3J0YW50O1xufVxuLnJlcGVhdGVyLWl0ZW0tcGFnZS1uYW1lIC5jb21wb25lbnRzLWJhc2UtY29udHJvbF9fZmllbGQsXG4ucmVwZWF0ZXItaXRlbS12aXNpYmlsaXR5IC5jb21wb25lbnRzLWJhc2UtY29udHJvbF9fZmllbGQge1xuICAgIG1hcmdpbi1ib3R0b206IDA7XG59XG5cbi5yZXBlYXRlci1pdGVtLXBhZ2UtbmFtZSB7XG4gICAgZmxleDogMTtcbiAgICBwYWRkaW5nOiAwIDFyZW07XG59XG5cbi5yZXBlYXRlci1pdGVtLXZpc2liaWxpdHkgLmNvbXBvbmVudHMtZm9ybS10b2dnbGUge1xuICAgIG1hcmdpbi1yaWdodDogMCAhaW1wb3J0YW50O1xufVxuXG4ucmVwZWF0ZXItaXRlbS12aXNpYmlsaXR5LFxuLnJlcGVhdGVyLWl0ZW0tcmVtb3ZlIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgcGFkZGluZzogMTZweDtcbn1cblxuLnJlcGVhdGVyLWNvbnRyb2xzIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGp1c3RpZnktY29udGVudDogZW5kO1xuICAgIHBhZGRpbmc6IDE2cHg7XG59XG5cbi5yZXBlYXRlci1pdGVtX19kcmFnLWhhbmRsZSB7XG4gICAgcGFkZGluZy1sZWZ0OiAwLjVyZW07XG59XG5cbi5yZXBlYXRlci1pdGVtX19kcmFnLWhhbmRsZSArIC5yZXBlYXRlci1pdGVtLXBhZ2UtbmFtZSB7XG4gICAgcGFkZGluZy1sZWZ0OiAwO1xufVxuXG4ucmVwZWF0ZXItaXRlbS0taXMtZHJhZ2dpbmcge1xuICAgIGJvcmRlci10b3A6IDFweCBzb2xpZCAjY2NjO1xuICAgIGJhY2tncm91bmQtY29sb3I6ICNmZmY7XG4gICAgYm94LXNoYWRvdzogMCAxNHB4IDI4cHggLTEwcHggcmdiKDAgMCAwIC8gMjUlKSwgMCAxMHB4IDEwcHggLTVweCByZ2IoMCAwIDAgLyAyMiUpO1xuICAgIHRyYW5zaXRpb246IGJveC1zaGFkb3cgMC41cyBlYXNlO1xufVxuXG4vLyBDb2xsYXBzaWJsZSByZXBlYXRlciBpdGVtIHN0cnVjdHVyZVxuLnJlcGVhdGVyLWl0ZW1fX2NvbGxhcHNlIHtcbiAgICB3aWR0aDogMTAwJTtcblxuICAgIC8vIFJlbW92ZSBkZWZhdWx0IG1hcmtlci9hcnJvd1xuICAgID4gc3VtbWFyeSB7XG4gICAgICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgICAgICY6Oi13ZWJraXQtZGV0YWlscy1tYXJrZXIge1xuICAgICAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gSGVhZGVyIHJvdyB3aXRoIHRpdGxlIGFuZCBhY3Rpb25zXG4ucmVwZWF0ZXItaXRlbV9faGVhZGVyIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICAgIHBhZGRpbmc6IDhweCAwO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICB1c2VyLXNlbGVjdDogbm9uZTtcblxuICAgIC8vIEN1c3RvbSBjb2xsYXBzZSBpbmRpY2F0b3JcbiAgICAmOjpiZWZvcmUge1xuICAgICAgICBjb250ZW50OiAnJztcbiAgICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgICB3aWR0aDogMDtcbiAgICAgICAgaGVpZ2h0OiAwO1xuICAgICAgICBtYXJnaW4tcmlnaHQ6IDhweDtcbiAgICAgICAgYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAjNzU3NTc1O1xuICAgICAgICBib3JkZXItdG9wOiA0cHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICAgIGJvcmRlci1ib3R0b206IDRweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMTVzIGVhc2U7XG4gICAgfVxuXG4gICAgLy8gUm90YXRlIGFycm93IHdoZW4gb3BlblxuICAgIGRldGFpbHNbb3Blbl0gPiAmOjpiZWZvcmUge1xuICAgICAgICB0cmFuc2Zvcm06IHJvdGF0ZSg5MGRlZyk7XG4gICAgfVxufVxuXG4vLyBJdGVtIHRpdGxlXG4ucmVwZWF0ZXItaXRlbV9fdGl0bGUge1xuICAgIGZsZXg6IDE7XG4gICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgY29sb3I6ICMxZTFlMWU7XG4gICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgIHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1xufVxuXG4vLyBBY3Rpb25zIGNvbnRhaW5lciAocmVtb3ZlIGJ1dHRvbilcbi5yZXBlYXRlci1pdGVtX19hY3Rpb25zIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgZ2FwOiA0cHg7XG4gICAgbWFyZ2luLWxlZnQ6IDhweDtcblxuICAgIC5jb21wb25lbnRzLWJ1dHRvbi5pcy1kZXN0cnVjdGl2ZSB7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICBwYWRkaW5nOiA0cHg7XG4gICAgICAgIG1pbi13aWR0aDogMjRweDtcbiAgICAgICAgaGVpZ2h0OiAyNHB4O1xuICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQtY29sb3IgMC4xNXMgZWFzZTtcblxuICAgICAgICAmOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6IHJnYmEoMjA0LCAyNCwgMjQsIDAuMSk7XG4gICAgICAgIH1cblxuICAgICAgICBzdmcge1xuICAgICAgICAgICAgd2lkdGg6IDE2cHg7XG4gICAgICAgICAgICBoZWlnaHQ6IDE2cHg7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIENvbGxhcHNpYmxlIGZpZWxkcyBjb250YWluZXJcbi5yZXBlYXRlci1pdGVtX19maWVsZHMge1xuICAgIHBhZGRpbmc6IDEycHggMCA0cHggMTNweDtcbiAgICBib3JkZXItbGVmdDogMnB4IHNvbGlkICNlMGUwZTA7XG4gICAgbWFyZ2luLWxlZnQ6IDJweDtcbiAgICBtYXJnaW4tdG9wOiA0cHg7XG59XG5cbi8vIEFkZCBidXR0b24gd3JhcHBlciAtIHNwYWNpbmcgYW5kIGFsaWdubWVudFxuLnJlcGVhdGVyLWFkZC1idXR0b24td3JhcHBlciB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIHBhZGRpbmctdG9wOiAxNnB4O1xuICAgIG1hcmdpbi10b3A6IDhweDtcbn1cblxuLy8gQ3VzdG9tIGFkZCBidXR0b24gc3R5bGluZ1xuLnJlcGVhdGVyLWFkZC1idXR0b24ge1xuICAgIGNvbG9yOiAjMWUxZTFlICFpbXBvcnRhbnQ7XG4gICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQgIWltcG9ydGFudDtcbiAgICBcbiAgICAmOmhvdmVyIHtcbiAgICAgICAgY29sb3I6ICMwMDczYWEgIWltcG9ydGFudDtcbiAgICB9XG4gICAgXG4gICAgc3ZnIHtcbiAgICAgICAgZmlsbDogY3VycmVudENvbG9yO1xuICAgIH1cbn1cbmA7XG5cbiAgcmV0dXJuIHNjc3M7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHN0eWxlLnNjc3MgZm9yIGZyb250ZW5kIHN0eWxlc1xuICovXG5jb25zdCBnZW5lcmF0ZVN0eWxlU2NzcyA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBjb21wb25lbnQuaWQucmVwbGFjZSgvXy9nLCAnLScpO1xuXG4gIC8vIEV4dHJhY3QgQ1NTIGNsYXNzZXMgdXNlZCBpbiB0aGUgdGVtcGxhdGVcbiAgY29uc3QgY2xhc3NNYXRjaGVzID0gY29tcG9uZW50LmNvZGUubWF0Y2goL2NsYXNzPVwiKFteXCJdKylcIi9nKSB8fCBbXTtcbiAgY29uc3QgdXNlZENsYXNzZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY2xhc3NNYXRjaGVzLmZvckVhY2gobWF0Y2ggPT4ge1xuICAgIGNvbnN0IGNsYXNzZXMgPSBtYXRjaC5yZXBsYWNlKCdjbGFzcz1cIicsICcnKS5yZXBsYWNlKCdcIicsICcnKS5zcGxpdCgvXFxzKy8pO1xuICAgIGNsYXNzZXMuZm9yRWFjaChjbHMgPT4ge1xuICAgICAgaWYgKGNscyAmJiAhY2xzLnN0YXJ0c1dpdGgoJ3t7JykpIHtcbiAgICAgICAgdXNlZENsYXNzZXMuYWRkKGNscyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIGxldCBzY3NzID0gYC8vIEZyb250ZW5kIHN0eWxlcyBmb3IgJHtjb21wb25lbnQudGl0bGV9IGJsb2NrXG4vLyBOb3RlOiBNb3N0IHN0eWxlcyBjb21lIGZyb20gdGhlIHNoYXJlZCBIYW5kb2ZmIHRoZW1lIHN0eWxlcy5cbi8vIFRoaXMgZmlsZSBjb250YWlucyBibG9jay1zcGVjaWZpYyBvdmVycmlkZXMgYW5kIGZhbGxiYWNrcy5cblxuLndwLWJsb2NrLWhhbmRvZmYtJHtjbGFzc05hbWV9IHtcbiAgLy8gUmVzZXQgYW55IFdvcmRQcmVzcyBibG9jayBtYXJnaW5zXG4gIG1hcmdpbjogMDtcbmA7XG5cbiAgLy8gQWRkIGJhc2ljIGZhbGxiYWNrIHN0eWxlcyBiYXNlZCBvbiBkZXRlY3RlZCBjbGFzc2VzXG4gIGlmICh1c2VkQ2xhc3Nlcy5oYXMoJ2Mtc3ViaGVhZGVyJykpIHtcbiAgICBzY3NzICs9IGBcbiAgLmMtc3ViaGVhZGVyIHtcbiAgICBiYWNrZ3JvdW5kLXNpemU6IGNvdmVyO1xuICAgIGJhY2tncm91bmQtcG9zaXRpb246IGNlbnRlcjtcbiAgICBiYWNrZ3JvdW5kLXJlcGVhdDogbm8tcmVwZWF0O1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICBjb2xvcjogI2ZmZjtcbiAgfVxuYDtcbiAgfVxuXG4gIGlmICh1c2VkQ2xhc3Nlcy5oYXMoJ2Mtc3ViaGVhZGVyX19vdmVybGF5JykpIHtcbiAgICBzY3NzICs9IGBcbiAgLmMtc3ViaGVhZGVyX19vdmVybGF5IHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgdG9wOiAwO1xuICAgIGJvdHRvbTogMDtcbiAgICBsZWZ0OiAwO1xuICAgIHJpZ2h0OiAwO1xuICB9XG5gO1xuICB9XG5cbiAgaWYgKHVzZWRDbGFzc2VzLmhhcygnby1jb250YWluZXInKSkge1xuICAgIHNjc3MgKz0gYFxuICAuby1jb250YWluZXIge1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICBtYXgtd2lkdGg6IDEyMDBweDtcbiAgICBtYXJnaW46IDAgYXV0bztcbiAgICBwYWRkaW5nOiAwIDFyZW07XG4gIH1cbmA7XG4gIH1cblxuICBpZiAodXNlZENsYXNzZXMuaGFzKCdvLXJvdycpKSB7XG4gICAgc2NzcyArPSBgXG4gIC5vLXJvdyB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LXdyYXA6IHdyYXA7XG4gIH1cbmA7XG4gIH1cblxuICBpZiAodXNlZENsYXNzZXMuaGFzKCdvLWNvbCcpIHx8IHVzZWRDbGFzc2VzLmhhcygnby1jb2wtMTInKSkge1xuICAgIHNjc3MgKz0gYFxuICAuby1jb2wge1xuICAgIGZsZXg6IDE7XG4gIH1cblxuICAuby1jb2wtMTIge1xuICAgIHdpZHRoOiAxMDAlO1xuICB9XG5gO1xuICB9XG5cbiAgaWYgKHVzZWRDbGFzc2VzLmhhcygnYy1icmVhZGNydW1icycpKSB7XG4gICAgc2NzcyArPSBgXG4gIC5jLWJyZWFkY3J1bWJzIHtcbiAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgIHBhZGRpbmc6IDA7XG4gICAgbWFyZ2luOiAwO1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgZmxleC13cmFwOiB3cmFwO1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgZ2FwOiAwLjVyZW07XG4gIH1cblxuICAuYy1icmVhZGNydW1ic19faXRlbSB7XG4gICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgfVxuXG4gIC5jLWJyZWFkY3J1bWJzX19saW5rIHtcbiAgICBjb2xvcjogaW5oZXJpdDtcbiAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gICAgZm9udC1zaXplOiAwLjg3NXJlbTtcblxuICAgICY6aG92ZXIge1xuICAgICAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG4gICAgfVxuICB9XG5cbiAgLmMtYnJlYWRjcnVtYnNfX3NlcGFyYXRvciB7XG4gICAgb3BhY2l0eTogMC43O1xuICB9XG5gO1xuICB9XG5cbiAgc2NzcyArPSBgfVxuYDtcblxuICByZXR1cm4gc2Nzcztcbn07XG5cbmV4cG9ydCB7IGdlbmVyYXRlRWRpdG9yU2NzcywgZ2VuZXJhdGVTdHlsZVNjc3MgfTtcbiJdfQ==