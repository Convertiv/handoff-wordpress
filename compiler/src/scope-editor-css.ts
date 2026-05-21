/**
 * PostCSS scope design-system CSS for the block editor canvas.
 */

import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import prefixSelector from 'postcss-prefix-selector';
import type { HandoffEditorConfig } from './types';

/** Matches compiler preview wrappers (*-editor-preview) and optional handoff-editor-canvas. */
const DEFAULT_SCOPE_PREFIX = '.editor-styles-wrapper [class*="-editor-preview"] ';

export const resolveEditorConfig = (
  editor?: HandoffEditorConfig,
): Required<
  Pick<
    HandoffEditorConfig,
    | 'designSystemStylesheets'
    | 'scopeDesignSystem'
    | 'scopePrefix'
    | 'canvasShim'
    | 'extraStylesheets'
    | 'canvasButtonPatterns'
  >
> => ({
  designSystemStylesheets: editor?.designSystemStylesheets?.length
    ? editor.designSystemStylesheets
    : ['assets/css/main.css'],
  scopeDesignSystem: editor?.scopeDesignSystem !== false,
  scopePrefix: editor?.scopePrefix ?? DEFAULT_SCOPE_PREFIX,
  canvasShim: editor?.canvasShim !== false,
  extraStylesheets: editor?.extraStylesheets ?? [],
  canvasButtonPatterns: editor?.canvasButtonPatterns ?? [],
});

const scopedOutputPath = (inputPath: string): string => {
  const ext = path.extname(inputPath);
  const base = inputPath.slice(0, -ext.length);
  return `${base}.editor-scoped${ext}`;
};

const scopeCssFile = async (
  inputPath: string,
  outputPath: string,
  scopePrefix: string,
): Promise<void> => {
  const css = fs.readFileSync(inputPath, 'utf8');
  const result = await postcss([
    prefixSelector({
      prefix: scopePrefix.trim(),
      transform(_prefix, selector, prefixedSelector, _filePath, rule) {
        const postcssRule = rule as postcss.Rule | undefined;
        if (postcssRule?.parent?.type === 'atrule') {
          const name = (postcssRule.parent as postcss.AtRule).name;
          if (name === 'keyframes' || name === 'font-face') {
            return selector;
          }
        }
        if (selector === ':root' || selector === 'html' || selector === 'body') {
          return selector;
        }
        return prefixedSelector;
      },
    }),
  ]).process(css, { from: inputPath, to: outputPath });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.css);
};

/**
 * Generate *.editor-scoped.css siblings for configured design-system stylesheets.
 */
export const scopeDesignSystemForEditor = async (
  contentRoot: string,
  editor?: HandoffEditorConfig,
): Promise<string[]> => {
  const resolved = resolveEditorConfig(editor);
  if (!resolved.scopeDesignSystem) {
    return [];
  }

  const written: string[] = [];
  for (const rel of resolved.designSystemStylesheets) {
    const inputPath = path.join(contentRoot, rel);
    if (!fs.existsSync(inputPath)) {
      console.warn(`   ⚠️  Editor scope skipped (missing): ${rel}`);
      continue;
    }
    const outputRel = scopedOutputPath(rel);
    const outputPath = path.join(contentRoot, outputRel);
    await scopeCssFile(inputPath, outputPath, resolved.scopePrefix);
    written.push(outputRel);
    console.log(`   ✅ ${outputRel} (editor-scoped)`);
  }
  return written;
};
