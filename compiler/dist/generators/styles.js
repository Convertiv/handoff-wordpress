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
    const hasOverlay = component.code.includes('overlay');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2dlbmVyYXRvcnMvc3R5bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBSUg7Ozs7Ozs7Ozs7Ozs7OztHQWVHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFNBQTJCLEVBQVUsRUFBRTtJQUNqRSxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDbEQsTUFBTSxrQkFBa0IsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFLElBQUksS0FBSyxPQUFPLENBQUM7SUFDbkYsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFdEQsSUFBSSxJQUFJLEdBQUcsaUNBQWlDLFNBQVMsQ0FBQyxLQUFLO0dBQzFELFNBQVM7O3FCQUVTLENBQUM7SUFFcEIsNEVBQTRFO0lBQzVFLElBQUksa0JBQWtCLEVBQUUsQ0FBQztRQUN2QixJQUFJLElBQUk7OztnQ0FHb0IsQ0FBQztJQUMvQixDQUFDO0lBRUQsSUFBSSxJQUFJOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBNEJULENBQUM7SUFFQSx5Q0FBeUM7SUFDekMsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDbkUsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzdCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3pDLElBQUksSUFBSTthQUNELFNBQVM7Ozs7Q0FJckIsQ0FBQztRQUNFLENBQUM7SUFDSCxDQUFDO0lBRUQsSUFBSSxJQUFJOzs7TUFHSixTQUFTOzs7Ozs7R0FNWixTQUFTOzs7Ozs7Ozs7O0dBVVQsU0FBUzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQStCVCxTQUFTOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW1MWCxDQUFDO0lBRUEsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDLENBQUM7QUE2SE8sZ0RBQWtCO0FBM0gzQjs7R0FFRztBQUNILE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxTQUEyQixFQUFVLEVBQUU7SUFDaEUsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRWxELDJDQUEyQztJQUMzQyxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNwRSxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3RDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDM0IsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0UsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNwQixJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDakMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN2QixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksSUFBSSxHQUFHLDBCQUEwQixTQUFTLENBQUMsS0FBSzs7OztvQkFJbEMsU0FBUzs7O0NBRzVCLENBQUM7SUFFQSxzREFBc0Q7SUFDdEQsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7UUFDbkMsSUFBSSxJQUFJOzs7Ozs7OztDQVFYLENBQUM7SUFDQSxDQUFDO0lBRUQsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztRQUM1QyxJQUFJLElBQUk7Ozs7Ozs7O0NBUVgsQ0FBQztJQUNBLENBQUM7SUFFRCxJQUFJLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxJQUFJLElBQUk7Ozs7Ozs7Q0FPWCxDQUFDO0lBQ0EsQ0FBQztJQUVELElBQUksV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQzdCLElBQUksSUFBSTs7Ozs7Q0FLWCxDQUFDO0lBQ0EsQ0FBQztJQUVELElBQUksV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDNUQsSUFBSSxJQUFJOzs7Ozs7OztDQVFYLENBQUM7SUFDQSxDQUFDO0lBRUQsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDckMsSUFBSSxJQUFJOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTZCWCxDQUFDO0lBQ0EsQ0FBQztJQUVELElBQUksSUFBSTtDQUNULENBQUM7SUFFQSxPQUFPLElBQUksQ0FBQztBQUNkLENBQUMsQ0FBQztBQUUyQiw4Q0FBaUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBTQ1NTIGZpbGVzIGZvciBHdXRlbmJlcmcgYmxvY2tzXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBHZW5lcmF0ZSBlZGl0b3Iuc2NzcyB3aXRoIHByZXZpZXcgc3R5bGVzXG4gKiBUT0RPOiBUaGlzIGlzIG11Y2ggdG9vIHNwZWNpZmljIHRvIHRoZSBmcmFtZXdvcmsgdGhhdCB3ZSdyZSB1c2luZyB0byB0ZXN0LlxuICogV2Ugc2hvdWxkIGNvbnNpZGVyIHJlbW92aW5nIHRoaXMgYW5kIHVzaW5nIHRoZSBuYXRpdmUgc3R5bGVzLCB3aXRoIGxpbWl0ZWQgXG4gKiB0d2Vha3MgdG8gaW1wcm92ZSB0aGUgZWRpdGluZyBleHBlcmllbmNlLlxuICpcbiAqIEBwYXJhbSBjb21wb25lbnQgLSBUaGUgSGFuZG9mZiBjb21wb25lbnQgZGF0YVxuICogQHJldHVybnMgVGhlIFNDU1MgZm9yIHRoZSBlZGl0b3Iuc2NzcyBmaWxlXG4gKiBAZXhhbXBsZVxuICogYGBgc2Nzc1xuICogLmFib3V0LWVkaXRvci1wcmV2aWV3IHtcbiAqICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICogICBtaW4taGVpZ2h0OiAyMDBweDtcbiAqIH1cbiAqIGBgYFxuICovXG5jb25zdCBnZW5lcmF0ZUVkaXRvclNjc3MgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcbiAgY29uc3QgaGFzQmFja2dyb3VuZEltYWdlID0gY29tcG9uZW50LnByb3BlcnRpZXMuYmFja2dyb3VuZF9pbWFnZT8udHlwZSA9PT0gJ2ltYWdlJztcbiAgY29uc3QgaGFzT3ZlcmxheSA9IGNvbXBvbmVudC5jb2RlLmluY2x1ZGVzKCdvdmVybGF5Jyk7XG5cbiAgbGV0IHNjc3MgPSBgLy8gRWRpdG9yLXNwZWNpZmljIHN0eWxlcyBmb3IgJHtjb21wb25lbnQudGl0bGV9IGJsb2NrXG4uJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBtaW4taGVpZ2h0OiAyMDBweDtgO1xuXG4gIC8vIFRPRE86IGNvbnNpZGVyIHJlbW92aW5nIHRoaXMgYmVjYXVzZSB0aGUgbmF0aXZlIHN0eWxlcyBzaG91bGQgaGFuZGxlIHRoaXNcbiAgaWYgKGhhc0JhY2tncm91bmRJbWFnZSkge1xuICAgIHNjc3MgKz0gYFxuICBiYWNrZ3JvdW5kLXNpemU6IGNvdmVyO1xuICBiYWNrZ3JvdW5kLXBvc2l0aW9uOiBjZW50ZXI7XG4gIGJhY2tncm91bmQtcmVwZWF0OiBuby1yZXBlYXQ7YDtcbiAgfVxuXG4gIHNjc3MgKz0gYFxuXG4gIC5ibG9jay1vdmVybGF5IHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgdG9wOiAwO1xuICAgIGJvdHRvbTogMDtcbiAgICBsZWZ0OiAwO1xuICAgIHJpZ2h0OiAwO1xuICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICB9XG5cbiAgLmJsb2NrLWNvbnRlbnQge1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICB6LWluZGV4OiAxO1xuICB9XG5cbiAgLmJsb2NrLXRpdGxlIHtcbiAgICBmb250LXNpemU6IDEuNXJlbTtcbiAgICBmb250LXdlaWdodDogYm9sZDtcbiAgICBtYXJnaW46IDAgMCAwLjVyZW07XG4gICAgY29sb3I6IGluaGVyaXQ7XG4gIH1cblxuICAuYmxvY2staGludCB7XG4gICAgZm9udC1zaXplOiAwLjg3NXJlbTtcbiAgICBvcGFjaXR5OiAwLjc7XG4gICAgbWFyZ2luOiAwO1xuICB9XG5gO1xuXG4gIC8vIEFkZCBwcmV2aWV3IHN0eWxlcyBmb3IgdGV4dCBwcm9wZXJ0aWVzXG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgIGlmIChwcm9wZXJ0eS50eXBlID09PSAndGV4dCcpIHtcbiAgICAgIGNvbnN0IHByb3BDbGFzcyA9IGtleS5yZXBsYWNlKC9fL2csICctJyk7XG4gICAgICBzY3NzICs9IGBcbiAgLnByZXZpZXctJHtwcm9wQ2xhc3N9IHtcbiAgICBtYXJnaW46IDAuNXJlbSAwO1xuICAgIGZvbnQtc2l6ZTogMXJlbTtcbiAgfVxuYDtcbiAgICB9XG4gIH1cblxuICBzY3NzICs9IGB9XG5cbi8vIC8vIFBsYWNlaG9sZGVyIHdoZW4gbm8gYmFja2dyb3VuZCBpbWFnZSBpcyBzZXRcbi8vIC4ke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXc6bm90KFtzdHlsZSo9XCJiYWNrZ3JvdW5kLWltYWdlXCJdKSB7XG4vLyAgIGJhY2tncm91bmQtaW1hZ2U6IG5vbmU7XG4vLyB9XG5cbi8vIEVuc3VyZSBwcm9wZXIgcG9zaXRpb25pbmcgY29udGV4dCBmb3IgR3V0ZW5iZXJnIHRvb2xiYXJcbi8vIFRoZSB0b29sYmFyIG5lZWRzIHBvc2l0aW9uOnJlbGF0aXZlIG9uIHBhcmVudCBlbGVtZW50cyB0byBhdHRhY2ggY29ycmVjdGx5XG4uJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IHtcblxuICAvLyBSaWNoVGV4dCBjb21wb25lbnRzIG5lZWQgcHJvcGVyIGRpc3BsYXkgZm9yIHRvb2xiYXIgYXR0YWNobWVudFxuICAuYmxvY2stZWRpdG9yLXJpY2gtdGV4dF9fZWRpdGFibGUge1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgfVxufVxuXG4vLyBFZGl0YWJsZSBmaWVsZCBob3ZlciBhbmQgZm9jdXMgc3RhdGVzXG4uJHtjbGFzc05hbWV9LWVkaXRvci1wcmV2aWV3IC5oYW5kb2ZmLWVkaXRhYmxlLWZpZWxkIHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gIG1pbi13aWR0aDogMjBweDtcbiAgbWluLWhlaWdodDogMWVtO1xuICB0cmFuc2l0aW9uOiBvdXRsaW5lIDAuMTVzIGVhc2UsIGJhY2tncm91bmQtY29sb3IgMC4xNXMgZWFzZTtcbiAgb3V0bGluZTogMnB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICBib3JkZXItcmFkaXVzOiAycHg7XG4gIFxuICAmOmhvdmVyIHtcbiAgICBvdXRsaW5lLWNvbG9yOiByZ2JhKDAsIDEyNCwgMTg2LCAwLjQpO1xuICAgIGJhY2tncm91bmQtY29sb3I6IHJnYmEoMCwgMTI0LCAxODYsIDAuMDUpO1xuICB9XG4gIFxuICAmOmZvY3VzLFxuICAmOmZvY3VzLXdpdGhpbixcbiAgJi5pcy1zZWxlY3RlZCB7XG4gICAgb3V0bGluZS1jb2xvcjogcmdiYSgwLCAxMjQsIDE4NiwgMC44KTtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDAsIDEyNCwgMTg2LCAwLjEpO1xuICB9XG59XG5cbjp3aGVyZSguZWRpdG9yLXN0eWxlcy13cmFwcGVyKSBoMSwgOndoZXJlKC5lZGl0b3Itc3R5bGVzLXdyYXBwZXIpIGgyLCA6d2hlcmUoLmVkaXRvci1zdHlsZXMtd3JhcHBlcikgaDMsIDp3aGVyZSguZWRpdG9yLXN0eWxlcy13cmFwcGVyKSBoNCwgOndoZXJlKC5lZGl0b3Itc3R5bGVzLXdyYXBwZXIpIGg1LCA6d2hlcmUoLmVkaXRvci1zdHlsZXMtd3JhcHBlcikgaDYge1xuICBmb250LXNpemU6IDEuNXJlbTtcbiAgZm9udC13ZWlnaHQ6IGJvbGQ7XG4gIG1hcmdpbjogMCAwIDAuNXJlbTtcbiAgY29sb3I6ICMwMDA7XG59XG5cbi8vIEltYWdlIGZpZWxkIHBsYWNlaG9sZGVyIHN0eWxpbmdcbi4ke2NsYXNzTmFtZX0tZWRpdG9yLXByZXZpZXcgLmhhbmRvZmYtcGxhY2Vob2xkZXItaW1hZ2Uge1xuICBkaXNwbGF5OiBibG9jaztcbiAgbWF4LXdpZHRoOiAxMDAlO1xuICBoZWlnaHQ6IGF1dG87XG4gIG9wYWNpdHk6IDAuNztcbiAgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjE1cyBlYXNlO1xuXG4gICY6aG92ZXIge1xuICAgIG9wYWNpdHk6IDE7XG4gIH1cbn1cblxuLmJsb2NrLWVkaXRvci1saW5rLWNvbnRyb2xfX3NlYXJjaC1pdGVtLmlzLWN1cnJlbnQge1xuICBwYWRkaW5nLWxlZnQ6MDtcbiAgcGFkZGluZy1yaWdodDogMDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIDEwdXAgQmxvY2sgQ29tcG9uZW50cyAtIFJlcGVhdGVyIFN0eWxpbmdcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi5yZXBlYXRlci1pdGVtIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNjY2M7XG4gICAgdHJhbnNpdGlvbjogYm94LXNoYWRvdyAwLjVzIGVhc2UgIWltcG9ydGFudDtcbn1cbi5yZXBlYXRlci1pdGVtLXBhZ2UtbmFtZSAuY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2ZpZWxkLFxuLnJlcGVhdGVyLWl0ZW0tdmlzaWJpbGl0eSAuY29tcG9uZW50cy1iYXNlLWNvbnRyb2xfX2ZpZWxkIHtcbiAgICBtYXJnaW4tYm90dG9tOiAwO1xufVxuXG4ucmVwZWF0ZXItaXRlbS1wYWdlLW5hbWUge1xuICAgIGZsZXg6IDE7XG4gICAgcGFkZGluZzogMCAxcmVtO1xufVxuXG4ucmVwZWF0ZXItaXRlbS12aXNpYmlsaXR5IC5jb21wb25lbnRzLWZvcm0tdG9nZ2xlIHtcbiAgICBtYXJnaW4tcmlnaHQ6IDAgIWltcG9ydGFudDtcbn1cblxuLnJlcGVhdGVyLWl0ZW0tdmlzaWJpbGl0eSxcbi5yZXBlYXRlci1pdGVtLXJlbW92ZSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIHBhZGRpbmc6IDE2cHg7XG59XG5cbi5yZXBlYXRlci1jb250cm9scyB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGVuZDtcbiAgICBwYWRkaW5nOiAxNnB4O1xufVxuXG4ucmVwZWF0ZXItaXRlbV9fZHJhZy1oYW5kbGUge1xuICAgIHBhZGRpbmctbGVmdDogMC41cmVtO1xufVxuXG4ucmVwZWF0ZXItaXRlbV9fZHJhZy1oYW5kbGUgKyAucmVwZWF0ZXItaXRlbS1wYWdlLW5hbWUge1xuICAgIHBhZGRpbmctbGVmdDogMDtcbn1cblxuLnJlcGVhdGVyLWl0ZW0tLWlzLWRyYWdnaW5nIHtcbiAgICBib3JkZXItdG9wOiAxcHggc29saWQgI2NjYztcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmO1xuICAgIGJveC1zaGFkb3c6IDAgMTRweCAyOHB4IC0xMHB4IHJnYigwIDAgMCAvIDI1JSksIDAgMTBweCAxMHB4IC01cHggcmdiKDAgMCAwIC8gMjIlKTtcbiAgICB0cmFuc2l0aW9uOiBib3gtc2hhZG93IDAuNXMgZWFzZTtcbn1cblxuLy8gQ29sbGFwc2libGUgcmVwZWF0ZXIgaXRlbSBzdHJ1Y3R1cmVcbi5yZXBlYXRlci1pdGVtX19jb2xsYXBzZSB7XG4gICAgd2lkdGg6IDEwMCU7XG5cbiAgICAvLyBSZW1vdmUgZGVmYXVsdCBtYXJrZXIvYXJyb3dcbiAgICA+IHN1bW1hcnkge1xuICAgICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgICAmOjotd2Via2l0LWRldGFpbHMtbWFya2VyIHtcbiAgICAgICAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIEhlYWRlciByb3cgd2l0aCB0aXRsZSBhbmQgYWN0aW9uc1xuLnJlcGVhdGVyLWl0ZW1fX2hlYWRlciB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICBwYWRkaW5nOiA4cHggMDtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgdXNlci1zZWxlY3Q6IG5vbmU7XG5cbiAgICAvLyBDdXN0b20gY29sbGFwc2UgaW5kaWNhdG9yXG4gICAgJjo6YmVmb3JlIHtcbiAgICAgICAgY29udGVudDogJyc7XG4gICAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgICAgd2lkdGg6IDA7XG4gICAgICAgIGhlaWdodDogMDtcbiAgICAgICAgbWFyZ2luLXJpZ2h0OiA4cHg7XG4gICAgICAgIGJvcmRlci1sZWZ0OiA1cHggc29saWQgIzc1NzU3NTtcbiAgICAgICAgYm9yZGVyLXRvcDogNHB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgICBib3JkZXItYm90dG9tOiA0cHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE1cyBlYXNlO1xuICAgIH1cblxuICAgIC8vIFJvdGF0ZSBhcnJvdyB3aGVuIG9wZW5cbiAgICBkZXRhaWxzW29wZW5dID4gJjo6YmVmb3JlIHtcbiAgICAgICAgdHJhbnNmb3JtOiByb3RhdGUoOTBkZWcpO1xuICAgIH1cbn1cblxuLy8gSXRlbSB0aXRsZVxuLnJlcGVhdGVyLWl0ZW1fX3RpdGxlIHtcbiAgICBmbGV4OiAxO1xuICAgIGZvbnQtd2VpZ2h0OiA1MDA7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGNvbG9yOiAjMWUxZTFlO1xuICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgICB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcbn1cblxuLy8gQWN0aW9ucyBjb250YWluZXIgKHJlbW92ZSBidXR0b24pXG4ucmVwZWF0ZXItaXRlbV9fYWN0aW9ucyB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGdhcDogNHB4O1xuICAgIG1hcmdpbi1sZWZ0OiA4cHg7XG5cbiAgICAuY29tcG9uZW50cy1idXR0b24uaXMtZGVzdHJ1Y3RpdmUge1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgcGFkZGluZzogNHB4O1xuICAgICAgICBtaW4td2lkdGg6IDI0cHg7XG4gICAgICAgIGhlaWdodDogMjRweDtcbiAgICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kLWNvbG9yIDAuMTVzIGVhc2U7XG5cbiAgICAgICAgJjpob3ZlciB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDIwNCwgMjQsIDI0LCAwLjEpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3ZnIHtcbiAgICAgICAgICAgIHdpZHRoOiAxNnB4O1xuICAgICAgICAgICAgaGVpZ2h0OiAxNnB4O1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBDb2xsYXBzaWJsZSBmaWVsZHMgY29udGFpbmVyXG4ucmVwZWF0ZXItaXRlbV9fZmllbGRzIHtcbiAgICBwYWRkaW5nOiAxMnB4IDAgNHB4IDEzcHg7XG4gICAgYm9yZGVyLWxlZnQ6IDJweCBzb2xpZCAjZTBlMGUwO1xuICAgIG1hcmdpbi1sZWZ0OiAycHg7XG4gICAgbWFyZ2luLXRvcDogNHB4O1xufVxuXG4vLyBBZGQgYnV0dG9uIHdyYXBwZXIgLSBzcGFjaW5nIGFuZCBhbGlnbm1lbnRcbi5yZXBlYXRlci1hZGQtYnV0dG9uLXdyYXBwZXIge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICBwYWRkaW5nLXRvcDogMTZweDtcbiAgICBtYXJnaW4tdG9wOiA4cHg7XG59XG5cbi8vIEN1c3RvbSBhZGQgYnV0dG9uIHN0eWxpbmdcbi5yZXBlYXRlci1hZGQtYnV0dG9uIHtcbiAgICBjb2xvcjogIzFlMWUxZSAhaW1wb3J0YW50O1xuICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50ICFpbXBvcnRhbnQ7XG4gICAgXG4gICAgJjpob3ZlciB7XG4gICAgICAgIGNvbG9yOiAjMDA3M2FhICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIFxuICAgIHN2ZyB7XG4gICAgICAgIGZpbGw6IGN1cnJlbnRDb2xvcjtcbiAgICB9XG59XG5gO1xuXG4gIHJldHVybiBzY3NzO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBzdHlsZS5zY3NzIGZvciBmcm9udGVuZCBzdHlsZXNcbiAqL1xuY29uc3QgZ2VuZXJhdGVTdHlsZVNjc3MgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogc3RyaW5nID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gY29tcG9uZW50LmlkLnJlcGxhY2UoL18vZywgJy0nKTtcblxuICAvLyBFeHRyYWN0IENTUyBjbGFzc2VzIHVzZWQgaW4gdGhlIHRlbXBsYXRlXG4gIGNvbnN0IGNsYXNzTWF0Y2hlcyA9IGNvbXBvbmVudC5jb2RlLm1hdGNoKC9jbGFzcz1cIihbXlwiXSspXCIvZykgfHwgW107XG4gIGNvbnN0IHVzZWRDbGFzc2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNsYXNzTWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcbiAgICBjb25zdCBjbGFzc2VzID0gbWF0Y2gucmVwbGFjZSgnY2xhc3M9XCInLCAnJykucmVwbGFjZSgnXCInLCAnJykuc3BsaXQoL1xccysvKTtcbiAgICBjbGFzc2VzLmZvckVhY2goY2xzID0+IHtcbiAgICAgIGlmIChjbHMgJiYgIWNscy5zdGFydHNXaXRoKCd7eycpKSB7XG4gICAgICAgIHVzZWRDbGFzc2VzLmFkZChjbHMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICBsZXQgc2NzcyA9IGAvLyBGcm9udGVuZCBzdHlsZXMgZm9yICR7Y29tcG9uZW50LnRpdGxlfSBibG9ja1xuLy8gTm90ZTogTW9zdCBzdHlsZXMgY29tZSBmcm9tIHRoZSBzaGFyZWQgSGFuZG9mZiB0aGVtZSBzdHlsZXMuXG4vLyBUaGlzIGZpbGUgY29udGFpbnMgYmxvY2stc3BlY2lmaWMgb3ZlcnJpZGVzIGFuZCBmYWxsYmFja3MuXG5cbi53cC1ibG9jay1oYW5kb2ZmLSR7Y2xhc3NOYW1lfSB7XG4gIC8vIFJlc2V0IGFueSBXb3JkUHJlc3MgYmxvY2sgbWFyZ2luc1xuICBtYXJnaW46IDA7XG5gO1xuXG4gIC8vIEFkZCBiYXNpYyBmYWxsYmFjayBzdHlsZXMgYmFzZWQgb24gZGV0ZWN0ZWQgY2xhc3Nlc1xuICBpZiAodXNlZENsYXNzZXMuaGFzKCdjLXN1YmhlYWRlcicpKSB7XG4gICAgc2NzcyArPSBgXG4gIC5jLXN1YmhlYWRlciB7XG4gICAgYmFja2dyb3VuZC1zaXplOiBjb3ZlcjtcbiAgICBiYWNrZ3JvdW5kLXBvc2l0aW9uOiBjZW50ZXI7XG4gICAgYmFja2dyb3VuZC1yZXBlYXQ6IG5vLXJlcGVhdDtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgY29sb3I6ICNmZmY7XG4gIH1cbmA7XG4gIH1cblxuICBpZiAodXNlZENsYXNzZXMuaGFzKCdjLXN1YmhlYWRlcl9fb3ZlcmxheScpKSB7XG4gICAgc2NzcyArPSBgXG4gIC5jLXN1YmhlYWRlcl9fb3ZlcmxheSB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHRvcDogMDtcbiAgICBib3R0b206IDA7XG4gICAgbGVmdDogMDtcbiAgICByaWdodDogMDtcbiAgfVxuYDtcbiAgfVxuXG4gIGlmICh1c2VkQ2xhc3Nlcy5oYXMoJ28tY29udGFpbmVyJykpIHtcbiAgICBzY3NzICs9IGBcbiAgLm8tY29udGFpbmVyIHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgbWF4LXdpZHRoOiAxMjAwcHg7XG4gICAgbWFyZ2luOiAwIGF1dG87XG4gICAgcGFkZGluZzogMCAxcmVtO1xuICB9XG5gO1xuICB9XG5cbiAgaWYgKHVzZWRDbGFzc2VzLmhhcygnby1yb3cnKSkge1xuICAgIHNjc3MgKz0gYFxuICAuby1yb3cge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgZmxleC13cmFwOiB3cmFwO1xuICB9XG5gO1xuICB9XG5cbiAgaWYgKHVzZWRDbGFzc2VzLmhhcygnby1jb2wnKSB8fCB1c2VkQ2xhc3Nlcy5oYXMoJ28tY29sLTEyJykpIHtcbiAgICBzY3NzICs9IGBcbiAgLm8tY29sIHtcbiAgICBmbGV4OiAxO1xuICB9XG5cbiAgLm8tY29sLTEyIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgfVxuYDtcbiAgfVxuXG4gIGlmICh1c2VkQ2xhc3Nlcy5oYXMoJ2MtYnJlYWRjcnVtYnMnKSkge1xuICAgIHNjc3MgKz0gYFxuICAuYy1icmVhZGNydW1icyB7XG4gICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICBwYWRkaW5nOiAwO1xuICAgIG1hcmdpbjogMDtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGZsZXgtd3JhcDogd3JhcDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGdhcDogMC41cmVtO1xuICB9XG5cbiAgLmMtYnJlYWRjcnVtYnNfX2l0ZW0ge1xuICAgIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIH1cblxuICAuYy1icmVhZGNydW1ic19fbGluayB7XG4gICAgY29sb3I6IGluaGVyaXQ7XG4gICAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICAgIGZvbnQtc2l6ZTogMC44NzVyZW07XG5cbiAgICAmOmhvdmVyIHtcbiAgICAgIHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1xuICAgIH1cbiAgfVxuXG4gIC5jLWJyZWFkY3J1bWJzX19zZXBhcmF0b3Ige1xuICAgIG9wYWNpdHk6IDAuNztcbiAgfVxuYDtcbiAgfVxuXG4gIHNjc3MgKz0gYH1cbmA7XG5cbiAgcmV0dXJuIHNjc3M7XG59O1xuXG5leHBvcnQgeyBnZW5lcmF0ZUVkaXRvclNjc3MsIGdlbmVyYXRlU3R5bGVTY3NzIH07XG4iXX0=