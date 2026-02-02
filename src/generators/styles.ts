/**
 * Generates SCSS files for Gutenberg blocks
 */

import { HandoffComponent } from '../types';

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
 *   color: #fff;
 * }
 * ```
 */
const generateEditorScss = (component: HandoffComponent): string => {
  const className = component.id.replace(/_/g, '-');
  const hasBackgroundImage = component.properties.background_image?.type === 'image';
  const hasOverlay = component.code.includes('overlay');

  let scss = `// Editor-specific styles for ${component.title} block
.${className}-editor-preview {
  position: relative;
  min-height: 200px;
  color: #fff;`;

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

/**
 * Generate style.scss for frontend styles
 */
const generateStyleScss = (component: HandoffComponent): string => {
  const className = component.id.replace(/_/g, '-');

  // Extract CSS classes used in the template
  const classMatches = component.code.match(/class="([^"]+)"/g) || [];
  const usedClasses = new Set<string>();
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

export { generateEditorScss, generateStyleScss };
