/**
 * Handlebars to JSX Transpiler
 * 
 * Uses node-html-parser and regex patterns for accurate conversion
 * of Handlebars templates to React JSX for Gutenberg editor previews.
 */

import { parse as parseHTML } from 'node-html-parser';
import { HandoffProperty } from '../../types';
import { TranspilerContext, TranspileResult } from './types';
import { toCamelCase } from './utils';
import { preprocessFields, cleanTemplate, preprocessBlocks } from './preprocessors';
import { nodeToJsx } from './node-converter';
import { postprocessJsx, postprocessTemplateLiterals } from './postprocessors';

// Re-export utilities that are used by other parts of the codebase
export { toCamelCase, isReservedWord, sanitizeReservedName, humanizeLabel, normalizeSelectOptions } from './utils';
export type { NormalizedSelectOption } from './utils';

/**
 * Main transpiler function - converts Handlebars template to JSX
 */
export const transpileHandlebarsToJsx = (
  template: string, 
  properties: Record<string, HandoffProperty>,
  indent: string = '          ',
  innerBlocksField?: string | null
): TranspileResult => {
  const context: TranspilerContext = {
    properties,
    indent,
    inLoop: false
  };
  
  // Preprocess fields FIRST (before cleanTemplate strips them)
  const { template: processed, inlineEditableFields } = preprocessFields(template, properties);
  
  // Clean and preprocess template (cleanTemplate runs preprocessBlocks when processing full template so loop inner content stays raw for correct array name when expanded)
  const preprocessed = cleanTemplate(processed);
  
  // Parse as HTML
  const root = parseHTML(preprocessed, {
    lowerCaseTagName: false,
    comment: false
  });
  
  // Convert to JSX
  let jsx = nodeToJsx(root, context);
  
  // Post-process to handle block markers
  jsx = postprocessJsx(jsx, context, 'item', innerBlocksField);
  
  // Convert template literal markers back to actual template literals
  jsx = postprocessTemplateLiterals(jsx);
  
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

/**
 * Generate a simple fallback preview
 */
export const generateFallbackPreview = (
  properties: Record<string, HandoffProperty>,
  componentId: string,
  componentTitle: string
): string => {
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
    const attrName = toCamelCase(key);
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

export interface JsxPreviewResult {
  jsx: string;
  inlineEditableFields: Set<string>;
}

/**
 * Generate a JSX preview that's suitable for the Gutenberg editor
 * Falls back to simplified preview if transpilation produces unusable output
 */
export const generateJsxPreview = (
  template: string,
  properties: Record<string, HandoffProperty>,
  componentId: string,
  componentTitle: string,
  innerBlocksField?: string | null
): JsxPreviewResult => {
  try {
    const { jsx, inlineEditableFields } = transpileHandlebarsToJsx(template, properties, '          ', innerBlocksField);
    
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
  } catch (error) {
    console.warn(`Handlebars transpilation failed, using simplified preview: ${error}`);
    return {
      jsx: generateFallbackPreview(properties, componentId, componentTitle),
      inlineEditableFields: new Set()
    };
  }
};
