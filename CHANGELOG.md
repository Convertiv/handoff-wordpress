# Changelog

All notable changes to **Handoff Blocks** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/) on the **0.0.x** line. Version numbers are bumped via `npm run release` and kept in sync across `package.json`, `composer.json`, and `handoff-blocks.php`.

## About the project

Handoff Blocks is a WordPress plugin that:

1. **Compiles** Handoff design-system components (Handlebars templates + property schemas) into Gutenberg block source under `blocks/` using the Node compiler in `compiler/`.
2. **Bundles** those sources with webpack into `build/`, which WordPress registers at runtime.
3. **Exposes** a wp-admin **Handoff** hub (block catalog, usage, schema health, import rules, migration) and WP-CLI commands for compile, build, and schema migration.

Early development (March–April 2026) focused on the transpiler (Handlebars → JSX + PHP), dynamic post/taxonomy/pagination arrays, template validation, and editor field controls. April 2026 brought distribution hardening (Composer, self-contained compiler bundle, `wp-content/handoff/` layout). May–June 2026 expanded the transpiler, editor styling, Tailwind/nextgen compile mode, and block lifecycle tooling.

> **Note on v1.0.x tags:** Releases `v1.0.1` and `v1.0.2` (2026-04-02) were superseded immediately by the **0.0.x** series; do not treat v1.0.x as the current lineage.

---

## Version overview

| Version | Date | Theme |
|---------|------|--------|
| 0.0.41 | 2026-06-05 | Taxonomy array attr in editor destructure |
| 0.0.40 | 2026-06-05 | Partial-param helpers in JSX + render.php |
| 0.0.39 | 2026-06-05 | Nested `#each` dotted paths in render.php |
| 0.0.38 | 2026-06-05 | Nextgen interactive editor canvas + data-component JSX |
| 0.0.36 | 2026-06-04 | Loop alias in attribute preprocessor |
| 0.0.35 | 2026-06-03 | Handlebars attribute transpiler fixes |
| 0.0.34 | 2026-06-03 | Tailwind compile mode, per-block view assets, transpiler hardening |
| 0.0.32 | 2026-05-21 | Editor canvas layout grid |
| 0.0.26–0.0.31 | 2026-05-20 | Editor design-system enqueue, block removed-from-compile deprecation, transpiler fixes |
| 0.0.20–0.0.25 | 2026-05-04–19 | `@root` decorator, grouped screenshots, video/number parsing |
| 0.0.14–0.0.19 | 2026-04-13–14 | Inserter screenshots, icons, config paths, opacity/kebab-case |
| 0.0.5–0.0.13 | 2026-04-06–07 | Schema migration, admin hub, ESM compiler bundle |
| 0.0.2–0.0.4 | 2026-04-02 | Plugin-first architecture, WP-CLI |

---

## [0.0.41] - 2026-06-05

### Fixed

- **Taxonomy dynamic arrays in block editor** — Include the manual array attribute (e.g. `tags`) in `const { … } = attributes` destructuring when generating taxonomy preview `useSelect` hooks. Fixes `ReferenceError: tags is not defined` in blocks like `article_hero` that use config-driven taxonomy arrays.

---

## [0.0.40] - 2026-06-05

### Fixed

- **Helper `(eq alias.field "value")` in JSX** — `parseHelperExpression` now transpiles dotted alias operands (e.g. `tag.icon`) via optional-chained access instead of leaving bare partial-param names like `tagIcon` that cause `ReferenceError` in the block editor.
- **Helper if/elseif chains in render.php** — `(eq tag.icon "precision")` chains inside nested `#each` loops now compile after loop-alias registration, emitting `$subItem['icon']` instead of `$item['icon']` or `$item['tagIcon']`. Fixes silent missing icons on the frontend for blocks using inlined `feature_tag` partials (e.g. `featured_product`).

---

## [0.0.39] - 2026-06-05

### Fixed

- **render.php nested `#each` with dotted paths** — `{{#each card.speakerStack.avatars as |avatar|}}` (and `this.foo.bar` variants) now transpile to valid nested PHP `foreach` blocks instead of leaving raw Handlebars plus orphaned `endforeach; endif`. Fixes PHP parse errors in blocks that inline element partials with nested avatar/tag loops (e.g. `conference_grid`, `upcoming_events`).

---

## [0.0.38] - 2026-06-05

### Added

- **Nextgen interactive editor canvas** — `NEXTGEN_INTERACTIVE_BLOCKS` registry wires `editor.interactiveBlocks` toggles to `@handoff-ds/components/*` modules via `useInteractiveBlockPreview` (accordions, tabs, sliders, modals, and other nextgen blocks). Root-scoped modules (e.g. `two_column_accordion`) support clean re-init on attribute changes.
- **`shared/hooks/useInteractiveBlockPreview.js`** — Reusable editor hook for mounting Handoff view logic inside the block canvas preview.

### Fixed

- **Handlebars → JSX `data-*` / `aria-*` attributes** — Preserve hyphenated names (`data-component`, `aria-expanded`, etc.) instead of camelCasing to `dataComponent`, so editor canvas DOM hooks match frontend `view.js` selectors.

---

## [0.0.36] - 2026-06-04

### Fixed

- **Handlebars attribute preprocessor** — Pass the correct loop alias (e.g. `provider` from `{{#each properties.providers as |provider|}}`) into `preprocessAttributeConditionals` so nested `{{#each}}` + `{{#unless @last}}` inside HTML attributes compile to the right JSX variable (fixes `ReferenceError: item is not defined` in block editor previews).

---

## [0.0.35] - 2026-06-03

### Fixed

- **Handlebars attribute transpiler** — Improved conversion of inline conditionals inside attribute values, including unquoted `(eq left right)` operands in `className` template literals and related edge cases in `attributes.ts`.

---

## [0.0.34] - 2026-06-03

*Includes all changes committed as release 0.0.33 (that commit was not tagged in git).*

### Added

- **`compiler.styleMode: "tailwind"`** in `handoff-wp.config.json` — For Tailwind-native (nextgen) blocks: emits minimal `editor.scss` / `style.scss` fallbacks instead of legacy c-/o- SCSS, skips syncing global `main.css` / `main.js` into `wp-content/handoff/assets`, and skips strict template-variable validation during compile (partials are resolved at Handoff build time).
- **`compiler.syncDesignSystemAssets`** and **`compiler.enqueueGlobalDesignSystemJs`** — Opt out of copying or enqueuing legacy Handoff bundle assets when the theme owns the design system (e.g. Tailwind `design-system.css`).
- **Per-block `viewScript` / `viewStyle`** — When compiling from a local Handoff API (`--source`), copies `{componentId}.js` → `view.js` and `{componentId}.css` → `view.css` and patches `block.json` with `viewScript` / `viewStyle` file references.
- **Webpack `view.js` entry + `view.css` CopyPlugin** — Block builds include frontend view scripts/styles when present on compiled blocks.
- **Editor design-system styles** — `includes/handoff-editor-styles.php` and related wiring for loading Handoff CSS in the block editor outside legacy global bundles.

### Fixed

- **Nested `#each` with dotted paths** — `{{#each this.speakerStack.avatars as |avatar|}}` (and similar) transpile to nested `.map()` with optional-chained array access instead of leaking raw Handlebars into `index.js`.
- **`{{#if @first}}` / `{{#if @last}}` block content** — Block-level index helpers transpile to `index === 0` / last-index checks instead of invalid JSX like `{@first && (`.
- **`(eq a b)` in className template literals** — Attribute conditionals with unquoted operands (e.g. `(eq activeCategory category.label)`) parse to valid JavaScript comparisons inside template literals.
- **Partial references in template validation** — `{{> partial}}` is skipped during template-variable validation so nextgen element partials inlined at Handoff build time do not fail compile.
- **Frontend legacy asset enqueue in Tailwind mode** — Global `main.css` / `main.js` are not enqueued when `compiler.styleMode` is `tailwind`.

---

## [0.0.32] - 2026-05-21

### Added

- **Editor canvas layout grid** — Shared `editor-canvas-grid` styles and `handoff-editor-styles.php` integration so block previews align on a consistent grid in the editor (`docs/editor-styles.md`).

### Fixed

- Removed erroneous global editor grid rules from generated per-block `style.scss` output.

---

## [0.0.31] - 2026-05-20

### Fixed

- **Column layout transpiler** — Corrected JSX/style generation for column-related block markup.

---

## [0.0.30] - 2026-05-20

### Fixed

- **Undefined style values** — Prevented invalid `style` objects when optional nested properties were missing in editor preview.

---

## [0.0.29] - 2026-05-20

### Fixed

- **Shared component styles** — CSS import path resolution for shared editor components.

---

## [0.0.28] - 2026-05-20

### Changed

- **Button block structure** — Standardized generated markup/classes for button components across variants.

---

## [0.0.27] - 2026-05-20

### Changed

- **Editor asset loading** — Reworked how design-system CSS and JS are enqueued in the block editor (separate from frontend global bundle behavior).

---

## [0.0.26] - 2026-05-20

### Added

- **Removed-from-compile block deprecation** — After `compile --all`, local block directories not in the current compile output are marked in `block.json` with `__handoff.removedFromHandoff`, `supports.inserter: false`, and a `(Deprecated)` title prefix. Existing post content continues to render; the block editor shows a warning via `build/editor/block-deprecation.js`; the Handoff admin Blocks tab and `wp handoff status` surface deprecated blocks. Distinct from **schema deprecation** (attribute migration via Gutenberg `deprecated` arrays).

### Changed

- **SPECIFICATION.md** — Documented removed-from-compile vs schema deprecation.

---

## [0.0.25] - 2026-05-20

### Fixed

- **Integer and float number fields** — Improved parsing and `RangeControl` behavior for numeric block attributes.

---

## [0.0.24] - 2026-05-19

### Fixed

- **Handlebars parser** — Edge case in chained helper / conditional expressions.

---

## [0.0.23] - 2026-05-19

### Fixed

- **`else if` chaining** — Correct transpilation of multi-branch `{{#if}}` / `{{else if}}` chains in JSX and PHP.

---

## [0.0.22] - 2026-05-19

### Fixed

- **Transpiler regression** — Block-level conditional content generation.

---

## [0.0.21] - 2026-05-13

### Changed

- **Video properties** — Expanded video field handling in the transpiler and editor controls.
- **Compiler performance** — Incremental build/output improvements in the bundled compiler.

---

## [0.0.20] - 2026-05-04

### Added

- **`@root` Handlebars decorator** — `@root.properties.*` resolves to top-level component properties from inside loops and nested scopes (JSX, PHP, and template validation). Documented in SPECIFICATION.md.

### Fixed

- **Accordion block** — Editor preview for accordion components.

---

## [0.0.19] - 2026-04-14

### Added

- **Screenshot previews for grouped blocks** — Merged group blocks (e.g. Hero with multiple variations) download per-variant screenshots and show them in the Gutenberg inserter. Each variation gets its own `example` with `__preview`. Webpack copies all `screenshot-*.png` files.

### Fixed

- **Class attributes losing static text** — Mixed static and dynamic classes (e.g. `class="button button--md button--{{button.variant}}"`) now produce full template literals preserving static segments.
- **Multiple `url()` in background-image** — Style parser uses `matchAll` so every `url()` in a `background-image` value is emitted, not only the first.
- **Hero group screenshots** — Per-variant screenshot download for merged Hero block.

---

## [0.0.18] - 2026-04-14

### Fixed

- **Config path resolution** — `handoff-wp.config.json` and related paths are resolved correctly when the Handoff content directory is not the plugin root (e.g. `wp-content/handoff/`).

---

## [0.0.17] - 2026-04-14

### Added

- **Config source logging** — Compiler and WP-CLI commands log which config file or source (JSON, database, constants) is in use.

---

## [0.0.16] - 2026-04-14

### Fixed

- **Kebab-case property names** — `toCamelCase` converts hyphens and underscores (e.g. `overlay-opacity` → `overlayOpacity`), fixing runtime `ReferenceError` in generated JSX.
- **Style attribute transpiler** — Generic inline-style parsing for any CSS property with Handlebars expressions instead of per-property handlers.
- **`RangeControl` for 0–1 numbers** — Opacity/alpha/ratio fields use `min=0`, `max=1`, `step=0.01`.
- **Template-referenced attributes** — Hyphenated `properties.*` paths are included in block attribute destructuring.

---

## [0.0.15] - 2026-04-13

### Fixed

- **Block asset URLs with symlinks** — When `HANDOFF_CONTENT_DIR` is a symlink (e.g. Docker bind mounts), the `plugins_url` filter matches both symlink and `realpath()` targets so editor scripts load in Gutenberg.

---

## [0.0.14] - 2026-04-13

### Added

- **Static screenshot inserter previews** — Blocks with Handoff API screenshots use `__preview` + `example` metadata for static inserter previews instead of live block render.
- **Unique SVG block icons** — Per-block icons with hashed background color and title initials (replaces generic dashicon).
- **Config source-of-truth** — `handoff-wp.config.json` takes precedence over database settings; JSON syncs to `wp_options` on `admin_init`; read-only notice in admin when JSON is present.

### Changed

- **`wp-env` layout** — Block sources and theme under `wp-content/handoff/` and `wp-content/theme/`; nested content directory detection.
- **Dynamic plugin version** — `HANDOFF_BLOCKS_VERSION` from `composer.json`.
- **Webpack admin bundle** — Admin entry always built; `afterEmit` copies admin assets back to plugin root for external content dirs.
- Demo theme/assets removed from plugin root (local dev uses `wp-content/`).

### Fixed

- **InnerBlocks for single richtext** — Designated `innerBlocksField` is no longer re-added as a string attribute by template-reference safety net.
- **InnerBlocks inside conditionals** — `innerBlocksField` propagated through all `postprocessJsx` recursive paths.

---

## [0.0.13] - 2026-04-07

### Fixed

- **`{{#if (eq ...)}}` with `{{else if}}`** — Edge case in helper-based if/else-if chains.

---

## [0.0.12] - 2026-04-07

### Added

- **`compile --all` content `package.json`** — Generates `package.json` under the content directory and runs `npm install` so blocks can resolve `@wordpress/*` and `@10up/block-components` without manual setup.

---

## [0.0.11] - 2026-04-07

### Fixed

- **`__dirname is not defined`** in ESM-bundled compiler — replaced with `process.argv[1]` for CJS/ESM compatibility.

---

## [0.0.10] - 2026-04-07

### Fixed

- **Shared components copy** — `TaxonomySelector`, `PaginationSelector`, `LinkField`, and `utils/` are copied to the output directory during `compile --all`, fixing `Module not found` when blocks live outside the plugin.

---

## [0.0.9] - 2026-04-07

### Changed

- **Self-contained compiler bundle** — `compiler/dist/compiler.mjs` via esbuild; Node on PATH is sufficient (no `npm install` in `compiler/` for end users).

### Fixed

- **Missing Prettier/Handlebars deps** when running from Composer install or release ZIP — dependencies inlined in the bundle.

---

## [0.0.8] - 2026-04-07

### Fixed

- **`{{#unless (eq ...)}}` and general `#unless` helpers** — Transpile correctly in PHP and JSX (previously only `@first` / `@last` unless blocks worked).
- **Content directory detection** — Empty `blocks/` or `build/` no longer triggers false “local blocks” detection; `build/admin/` is ignored.

---

## [0.0.7] - 2026-04-06

### Fixed

- **Block detection** — Refinement to `handoff_has_local_blocks()` / content dir failover logic.

---

## [0.0.6] - 2026-04-06

### Changed

- Removed `.gitkeep` from default `blocks/` directory so empty plugin installs fail over to `wp-content/handoff/` instead of treating an empty folder as “local blocks.”

---

## [0.0.5] - 2026-04-06

### Added

- **Schema migration system** — `schema-history.json` (replaces `property-manifest.json`) with versioned per-component history; automatic Gutenberg `deprecated` arrays in `index.js`; `schema-changelog.json` per block; admin rename/transform overrides; Schema Health panel; `wp handoff schema status` / `schema migrate`; REST schema endpoints.
- **Visual Import Rules Editor** — Settings UI for import toggles and dynamic array mappings (posts, taxonomy, pagination) with block screenshots.
- **Unified Blocks tab** — Block cards with screenshots, usage counts, and expandable post lists (merged former Blocks + Usage tabs).
- **Design system assets** — `main.css` / `main.js` downloaded on `compile --all` and enqueued in editor and frontend.
- **`wp handoff config show`** — Prints resolved configuration with masked credentials.
- **Smart `HANDOFF_CONTENT_DIR` detection** — Plugin root vs `wp-content/handoff/` for dev vs Composer installs.
- **Security hardening** — `.htaccess`, `web.config`, and `index.php` for content directory.
- **Theme dropdown** in Settings; **Composer** + GitHub Actions release flow; **`npm run release`**; config in `wp_options` with `wp-config.php` overrides; pre-built admin bundle in release ZIP.

### Changed

- Settings: output directory fixed to content `blocks/`; admin tabs consolidated to Blocks, Migration, Settings.

### Fixed

- Block asset URLs outside `wp-content/plugins/`; robust `wp handoff build` / webpack module resolution for external content dirs.

---

## [0.0.4] - 2026-04-02

### Fixed

- **Compiler CI build** — `build:compiler` script uses `cd compiler && npm ci && npm run build`.

---

## [0.0.3] - 2026-04-02

### Fixed

- Block registration when using external content directory layout.

---

## [0.0.2] - 2026-04-02

### Changed

- **Plugin-first architecture** — Plugin root is the primary package; compiler in `compiler/` with its own `package.json`.
- **WP-CLI** — Compiler exposed as `wp handoff <command>`.
- **Migration UI** — Consolidated into main Handoff admin page.
- Demo `blocks/`, `theme/`, `shared/`, `includes/` at project root for development.

### Fixed

- Variations, breadcrumbs, taxonomy, and pagination edge cases in early transpiler.
- Version numbering reset to **0.0.x** (see legacy v1.0.x note above).

---

## Pre-release development (before v0.0.2)

Work between the initial repository import and the first **0.0.2** release established the core pipeline:

- **Handlebars → JSX / PHP transpiler** with `{{#each}}`, `{{#if}}`, `{{#field}}`, nested loops, and ongoing PHP renderer fixes.
- **Template variable validation** against Handoff property schemas.
- **Dynamic post arrays** — `DynamicPostSelector`, import wizard, field resolver, pagination and taxonomy handlers.
- **Editor field controls** — Repeaters, images (`@10up/block-components`), links, richtext / InnerBlocks groundwork.
- **Block metadata** — Handoff and Figma URLs in `block.json`; reserved JS identifier sanitization for block names.
- **Tooling** — Node 22 minimum, webpack guard when no blocks exist, QUICKSTART and license docs.

---

## Legacy releases: v1.0.1 and v1.0.2 (2026-04-02)

Short-lived **1.0.x** tags were created during the plugin-first refactor and were **replaced by 0.0.2+**. No separate maintenance branch exists for v1.0.x; refer to **[0.0.2]** and later entries for accurate history.
