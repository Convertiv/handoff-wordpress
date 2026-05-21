/**
 * Block editor interactive canvas — scoped Handoff JS in Gutenberg previews.
 *
 * Project config: editor.interactiveBlocks[blockId] = boolean only.
 * Module wiring lives in DEFAULT_INTERACTIVE_BLOCKS below.
 */

import type { HandoffEditorConfig } from '../types';

export interface InteractiveModuleSpec {
  module: string;
  init: string;
  destroy: string;
}

export interface InteractiveBlockSpec {
  modules: InteractiveModuleSpec[];
  watchAttributes: string[];
  /** When true, block is on unless config explicitly sets false. */
  defaultEnabled: boolean;
}

export const DEFAULT_INTERACTIVE_BLOCKS: Record<string, InteractiveBlockSpec> = {
  'comparison-slider': {
    defaultEnabled: true,
    modules: [
      { module: 'compare-slider-scoped', init: 'initCompareSlider', destroy: 'destroyCompareSlider' },
      {
        module: 'comparison-slider-scoped',
        init: 'initComparisonSlider',
        destroy: 'destroyComparisonSlider',
      },
    ],
    watchAttributes: ['slides'],
  },
  'before-after': {
    defaultEnabled: true,
    modules: [
      {
        module: 'carousel-content-scoped',
        init: 'initCarouselContent',
        destroy: 'destroyCarouselContent',
      },
    ],
    watchAttributes: ['slides', 'variation'],
  },
  'full-width-video': {
    defaultEnabled: true,
    modules: [{ module: 'wistia-embed-scoped', init: 'initWistiaEmbeds', destroy: 'destroyWistiaEmbeds' }],
    watchAttributes: ['video'],
  },
  'full-screen-video': {
    defaultEnabled: true,
    modules: [{ module: 'wistia-embed-scoped', init: 'initWistiaEmbeds', destroy: 'destroyWistiaEmbeds' }],
    watchAttributes: ['video'],
  },
  'video-wysiwyg': {
    defaultEnabled: true,
    modules: [{ module: 'wistia-embed-scoped', init: 'initWistiaEmbeds', destroy: 'destroyWistiaEmbeds' }],
    watchAttributes: ['video'],
  },
  'text-split-video': {
    defaultEnabled: true,
    modules: [{ module: 'wistia-embed-scoped', init: 'initWistiaEmbeds', destroy: 'destroyWistiaEmbeds' }],
    watchAttributes: ['videoId'],
  },
  'lisitng-events-video': {
    defaultEnabled: true,
    modules: [{ module: 'wistia-embed-scoped', init: 'initWistiaEmbeds', destroy: 'destroyWistiaEmbeds' }],
    watchAttributes: ['assets'],
  },
  'hero-background-video': {
    defaultEnabled: true,
    modules: [{ module: 'wistia-embed-scoped', init: 'initWistiaEmbeds', destroy: 'destroyWistiaEmbeds' }],
    watchAttributes: ['desktopVideo', 'mobileVideo'],
  },
};

export const isInteractiveEnabled = (
  componentId: string,
  editor?: HandoffEditorConfig,
  wordpress?: { editorMode?: string },
): boolean => {
  const spec = DEFAULT_INTERACTIVE_BLOCKS[componentId];
  const toggles = editor?.interactiveBlocks;

  if (toggles && Object.prototype.hasOwnProperty.call(toggles, componentId)) {
    return toggles[componentId] === true;
  }

  if (spec?.defaultEnabled) return true;
  if (wordpress?.editorMode === 'interactive' && spec) return true;

  return false;
};

export interface InteractiveCanvasCodegen {
  importLines: string;
  hookLines: string;
  elementImports: string[];
}

export const generateInteractiveCanvasCode = (
  componentId: string,
  attrNames: string[],
  editor?: HandoffEditorConfig,
  wordpress?: { editorMode?: string },
): InteractiveCanvasCodegen | null => {
  if (!isInteractiveEnabled(componentId, editor, wordpress)) {
    return null;
  }

  const spec = DEFAULT_INTERACTIVE_BLOCKS[componentId];
  if (!spec) {
    if (wordpress?.editorMode === 'interactive') {
      console.warn(
        `   ⚠️  ${componentId}: wordpress.editorMode is "interactive" but no built-in registry entry exists.`,
      );
    }
    return null;
  }

  const importLines = spec.modules
    .map(
      (m) =>
        `import { ${m.init}, ${m.destroy} } from '@handoff-ds/components/${m.module}';`,
    )
    .join('\n');

  const deps =
    spec.watchAttributes.filter((a) => attrNames.includes(a)) ?? spec.watchAttributes;
  const depsStr = deps.length > 0 ? `[${deps.join(', ')}]` : '[]';

  const initCalls = spec.modules.map((m) => `      ${m.init}(root);`).join('\n');
  const destroyCalls = [...spec.modules]
    .reverse()
    .map((m) => `      ${m.destroy}(root);`)
    .join('\n');

  const hookLines = `    const canvasRef = useRef(null);
    useEffect(() => {
      const root = canvasRef.current;
      if (!root) return;
${initCalls}
      return () => {
${destroyCalls}
      };
    }, ${depsStr});`;

  return {
    importLines,
    hookLines,
    elementImports: ['useRef', 'useEffect'],
  };
};

export const injectCanvasRefIntoPreviewJsx = (previewJsx: string): string => {
  return previewJsx.replace(
    /(<div\s+)className="([^"]*-editor-preview[^"]*)"/,
    '$1ref={canvasRef} className="$2"',
  );
};
