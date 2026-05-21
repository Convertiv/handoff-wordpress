/**
 * Block editor canvas shim — universal editing fixes, no project-specific variants.
 */

import type { HandoffEditorConfig } from '../types';

export const CANVAS_SHIM_SCSS_IMPORT = "@import '../../shared/editor/canvas-shim.scss';\n\n";

const DEFAULT_CANVAS_BUTTON_PATTERNS = [String.raw`\bbutton\b`, String.raw`\bbtn\b`, String.raw`\bc-button\b`];

/** True when the template likely renders interactive CTA anchors in the canvas. */
export const templateUsesCanvasShim = (
  code: string,
  editorConfig?: HandoffEditorConfig,
): boolean => {
  if (!code) {
    return false;
  }
  const patterns = editorConfig?.canvasButtonPatterns?.length
    ? editorConfig.canvasButtonPatterns
    : DEFAULT_CANVAS_BUTTON_PATTERNS;
  if (patterns.some((p) => new RegExp(p).test(code))) {
    return true;
  }
  return /\bclass=["'][^"']*\bbutton\b/.test(code) || /\bbutton--/.test(code);
};

export const editorScssCanvasShimPrefix = (
  code: string,
  editorConfig?: HandoffEditorConfig,
): string => {
  if (editorConfig?.canvasShim === false) {
    return '';
  }
  return templateUsesCanvasShim(code, editorConfig) ? CANVAS_SHIM_SCSS_IMPORT : '';
};

export interface EditorScssOptions {
  /** When true, canvas-shim import is omitted (e.g. merged group adds it once at the top). */
  skipCanvasShimImport?: boolean;
  editorConfig?: HandoffEditorConfig;
}

/** Build RegExp sources for design-system anchor → span conversion in node-converter. */
export const getCanvasButtonPatterns = (editorConfig?: HandoffEditorConfig): string[] =>
  editorConfig?.canvasButtonPatterns?.length
    ? editorConfig.canvasButtonPatterns
    : DEFAULT_CANVAS_BUTTON_PATTERNS;

export const attrsMatchCanvasButtonPatterns = (
  attrs: string,
  editorConfig?: HandoffEditorConfig,
): boolean => getCanvasButtonPatterns(editorConfig).some((p) => new RegExp(p).test(attrs));
