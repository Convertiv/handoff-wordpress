/**
 * PostCSS scope design-system CSS for the block editor canvas.
 */
import type { HandoffEditorConfig } from './types';
export declare const resolveEditorConfig: (editor?: HandoffEditorConfig) => Required<Pick<HandoffEditorConfig, "designSystemStylesheets" | "scopeDesignSystem" | "scopePrefix" | "canvasShim" | "extraStylesheets" | "canvasButtonPatterns">>;
/**
 * Generate *.editor-scoped.css siblings for configured design-system stylesheets.
 */
export declare const scopeDesignSystemForEditor: (contentRoot: string, editor?: HandoffEditorConfig) => Promise<string[]>;
