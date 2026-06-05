/**
 * Block editor interactive canvas — scoped Handoff JS in Gutenberg previews.
 *
 * Project config: editor.interactiveBlocks[blockId] = boolean only.
 * Legacy Bootstrap wiring: DEFAULT_INTERACTIVE_BLOCKS.
 * Nextgen (Tailwind) wiring: NEXTGEN_INTERACTIVE_BLOCKS — imports from
 * @handoff-ds/components/* (resolved via HANDOFF_DESIGN_SYSTEM_JS at webpack build).
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

/** Legacy Bootstrap blocks — scoped modules under @handoff-ds/components/*-scoped. */
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

export interface NextgenInteractiveBlockSpec {
  module: string;
  init: string;
  destroy?: string;
  /** When true, init/destroy receive the editor canvas root element. */
  rootScoped?: boolean;
  watchAttributes: string[];
}

/**
 * Nextgen blocks — opt in via editor.interactiveBlocks in handoff-wp.config.json.
 * rootScoped blocks support clean re-init in the editor; document-scoped inits run once per mount.
 */
export const NEXTGEN_INTERACTIVE_BLOCKS: Record<string, NextgenInteractiveBlockSpec> = {
  hero: {
    module: 'hero-carousel',
    init: 'initHeroCarousels',
    watchAttributes: ['slides'],
  },
  media_slider: {
    module: 'media-slider',
    init: 'initMediaSliders',
    watchAttributes: ['slides'],
  },
  before_after: {
    module: 'before-after-slider',
    init: 'initBeforeAfterSliders',
    watchAttributes: ['slides'],
  },
  two_column_before_after: {
    module: 'before-after-slider',
    init: 'initBeforeAfterSliders',
    watchAttributes: ['slides'],
  },
  provider_search: {
    module: 'provider-search',
    init: 'initProviderSearches',
    watchAttributes: ['defaultCenter', 'defaultZoom'],
  },
  image_tabs: {
    module: 'image-tabs',
    init: 'initImageTabs',
    watchAttributes: ['tabs'],
  },
  tabbed_two_column_features: {
    module: 'tabbed-two-column-features',
    init: 'initTabbedTwoColumnFeatures',
    watchAttributes: ['tabs'],
  },
  tabbed_product_info: {
    module: 'tabbed-product-info',
    init: 'initTabbedProductInfo',
    watchAttributes: ['tabs'],
  },
  two_column_slideshow: {
    module: 'two-column-slideshow',
    init: 'initTwoColumnSlideshows',
    watchAttributes: ['slides'],
  },
  vertical_tabbed_slideshow: {
    module: 'vertical-tabbed-slideshow',
    init: 'initVerticalTabbedSlideshows',
    watchAttributes: ['slides'],
  },
  two_column_accordion: {
    module: 'two-column-accordion',
    init: 'initTwoColumnAccordion',
    destroy: 'destroyTwoColumnAccordion',
    rootScoped: true,
    watchAttributes: ['items'],
  },
  featured_product: {
    module: 'featured-product-carousel',
    init: 'initFeaturedProductCarousels',
    watchAttributes: ['slides'],
  },
  modal: {
    module: 'modal',
    init: 'initModals',
    watchAttributes: ['title'],
  },
  context_menu: {
    module: 'context-menu',
    init: 'initContextMenus',
    watchAttributes: ['items'],
  },
  menu: {
    module: 'menu',
    init: 'initMenu',
    rootScoped: true,
    watchAttributes: [],
  },
};

const hasRegistryEntry = (componentId: string): boolean =>
  Boolean(DEFAULT_INTERACTIVE_BLOCKS[componentId] || NEXTGEN_INTERACTIVE_BLOCKS[componentId]);

export const isInteractiveEnabled = (
  componentId: string,
  editor?: HandoffEditorConfig,
  wordpress?: { editorMode?: string },
): boolean => {
  const legacySpec = DEFAULT_INTERACTIVE_BLOCKS[componentId];
  const nextgenSpec = NEXTGEN_INTERACTIVE_BLOCKS[componentId];
  const toggles = editor?.interactiveBlocks;

  if (toggles && Object.prototype.hasOwnProperty.call(toggles, componentId)) {
    return toggles[componentId] === true;
  }

  if (legacySpec?.defaultEnabled) return true;
  if (wordpress?.editorMode === 'interactive' && hasRegistryEntry(componentId)) return true;

  return false;
};

export interface InteractiveCanvasCodegen {
  importLines: string;
  hookLines: string;
  elementImports: string[];
}

const buildDepsStr = (watchAttributes: string[], attrNames: string[]): string => {
  const deps = watchAttributes.filter((a) => attrNames.includes(a));
  return deps.length > 0 ? `[${deps.join(', ')}]` : '[]';
};

const generateLegacyInteractiveCanvasCode = (
  spec: InteractiveBlockSpec,
  attrNames: string[],
): InteractiveCanvasCodegen => {
  const importLines = spec.modules
    .map(
      (m) =>
        `import { ${m.init}, ${m.destroy} } from '@handoff-ds/components/${m.module}';`,
    )
    .join('\n');

  const depsStr = buildDepsStr(spec.watchAttributes, attrNames);

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

const generateNextgenInteractiveCanvasCode = (
  spec: NextgenInteractiveBlockSpec,
  attrNames: string[],
): InteractiveCanvasCodegen => {
  const destroyImport = spec.destroy ? `, ${spec.destroy}` : '';
  const importLines = `import { ${spec.init}${destroyImport} } from '@handoff-ds/components/${spec.module}';
import { useInteractiveBlockPreview } from '../../shared/hooks/useInteractiveBlockPreview';`;

  const depsStr = buildDepsStr(spec.watchAttributes, attrNames);

  const initBody = spec.rootScoped
    ? `(root) => ${spec.init}(root)`
    : `() => ${spec.init}()`;

  const destroyBody = spec.destroy
    ? `(root) => ${spec.destroy}(root)`
    : '() => {}';

  const hookLines = `    const canvasRef = useRef(null);
    useInteractiveBlockPreview({
      previewRef: canvasRef,
      enabled: true,
      init: ${initBody},
      destroy: ${destroyBody},
      deps: ${depsStr},
    });`;

  return {
    importLines,
    hookLines,
    elementImports: ['useRef'],
  };
};

export const generateInteractiveCanvasCode = (
  componentId: string,
  attrNames: string[],
  editor?: HandoffEditorConfig,
  wordpress?: { editorMode?: string },
): InteractiveCanvasCodegen | null => {
  if (!isInteractiveEnabled(componentId, editor, wordpress)) {
    return null;
  }

  const legacySpec = DEFAULT_INTERACTIVE_BLOCKS[componentId];
  if (legacySpec) {
    return generateLegacyInteractiveCanvasCode(legacySpec, attrNames);
  }

  const nextgenSpec = NEXTGEN_INTERACTIVE_BLOCKS[componentId];
  if (nextgenSpec) {
    return generateNextgenInteractiveCanvasCode(nextgenSpec, attrNames);
  }

  if (wordpress?.editorMode === 'interactive') {
    console.warn(
      `   ⚠️  ${componentId}: wordpress.editorMode is "interactive" but no built-in registry entry exists.`,
    );
  }

  return null;
};

export const injectCanvasRefIntoPreviewJsx = (previewJsx: string): string => {
  return previewJsx.replace(
    /(<div\s+)className="([^"]*-editor-preview[^"]*)"/,
    '$1ref={canvasRef} className="$2"',
  );
};
