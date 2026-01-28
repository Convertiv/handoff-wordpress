/**
 * Generates SCSS files for Gutenberg blocks
 */

import { HandoffComponent } from '../types';

/**
 * Generate editor.scss with preview styles
 */
const generateEditorScss = (component: HandoffComponent): string => {
  const className = component.id.replace(/_/g, '-');
  const hasBackgroundImage = component.properties.background_image?.type === 'image';
  const hasOverlay = component.code.includes('overlay');
  
  let scss = `// Editor-specific styles for ${component.title} block
.${className}-editor-preview {
  position: relative;
  min-height: 200px;
  background-color: #434a50;
  color: #fff;`;
  
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
    background-color: #434a50;
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

// Placeholder when no background image is set
.${className}-editor-preview:not([style*="background-image"]) {
  background-image: linear-gradient(135deg, #434a50 0%, #242a2d 100%);
}

// Editable field hover and focus states
.${className}-editor-preview .handoff-editable-field {
  transition: outline 0.15s ease, background-color 0.15s ease;
  outline: 2px solid transparent;
  outline-offset: 2px;
  border-radius: 2px;
  
  &:hover {
    outline-color: rgba(0, 124, 186, 0.4);
    background-color: rgba(0, 124, 186, 0.05);
  }
  
  &:focus,
  &.is-selected {
    outline-color: rgba(0, 124, 186, 0.8);
    background-color: rgba(0, 124, 186, 0.1);
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
    background-color: #434a50;
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
