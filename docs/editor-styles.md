# Block editor canvas styles

Handoff blocks preview in the Gutenberg iframe using **per-project CSS**, not hardcoded button variants in the compiler.

## Golden path (Handoff `main.css`)

1. Run `wp handoff compile --all` (or `npm run wp:handoff`) — syncs `assets/css/main.css` from your Handoff project.
2. Optional: compiler generates `assets/css/main.editor-scoped.css` (PostCSS prefix for `.editor-styles-wrapper .handoff-editor-canvas`).
3. Plugin enqueues, in order:
   - `shared/editor/canvas-shim.css` — wp-admin collision resets (no design tokens)
   - Scoped (or raw) design-system CSS
   - `editor.extraStylesheets` from `handoff-wp.config.json`
4. Generated block previews wrap content in `handoff-editor-canvas` and use `<span class="handoff-canvas-button">` for editable CTAs.

### Example `handoff-wp.config.json`

```json
{
  "editor": {
    "designSystemStylesheets": ["assets/css/main.css"],
    "scopeDesignSystem": true,
    "canvasShim": true,
    "extraStylesheets": []
  }
}
```

## Appendix: Bootstrap

- Enqueue your Bootstrap bundle via `editor.extraStylesheets`.
- Set `canvasButtonPatterns`: `["\\bbtn\\b"]` if templates use `<a class="btn …">`.
- wp-core-ui `.button` rarely conflicts with `.btn`.

## Appendix: Tailwind

- Utilities are **not** in Handoff `main.css`. Add Handoff block paths to Tailwind `content` and enqueue your editor Tailwind build via `extraStylesheets`.
- Avoid scoping Tailwind output with `scopeDesignSystem` (can break `@layer` / preflight).

## Interactive block canvas (JavaScript)

Some blocks need Handoff JS in the editor (Slick, TwentyTwenty, Wistia). The compiler injects `useRef` + `useEffect` on `*-editor-preview` wrappers and imports scoped modules from `@handoff-ds/components/*`.

**Project config — booleans only:**

```json
{
  "editor": {
    "interactiveBlocks": {
      "comparison-slider": true,
      "full-width-video": false
    }
  }
}
```

- Omitted keys use built-in defaults (on for known block ids such as `comparison-slider`, Wistia video blocks, `before-after`).
- `false` forces a block off even when Handoff sets `wordpress.editorMode: "interactive"`.
- Module wiring (which scoped files to load) is **not** in JSON — add new block types in `compiler/src/generators/interactive-canvas.ts` (`DEFAULT_INTERACTIVE_BLOCKS`).

Webpack resolves `@handoff-ds` to `../../handoff/js` relative to `HANDOFF_CONTENT_DIR` (override with `HANDOFF_DESIGN_SYSTEM_JS`).

## PHP filter

```php
add_filter('handoff_editor_stylesheets', function ($queue, $editor) {
  // Append or reorder stylesheet entries: handle, url, path, version
  return $queue;
}, 10, 2);
```
