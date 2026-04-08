# Changelog

All notable changes to Handoff Blocks are documented here.


## [0.0.9] - 2026-04-08

### Changed

- Compiler is now bundled into a single self-contained file (`compiler/dist/compiler.mjs`) via esbuild. Users no longer need to run `npm install` in the plugin directory — Node.js on the PATH is the only requirement.

### Fixed

- `Cannot find module '@prettier/plugin-php'` error when running the compiler from a Composer install or release ZIP. All Node.js dependencies (Prettier, Handlebars, node-html-parser, Commander) are now inlined into the bundle.

## [0.0.8] - 2026-04-07

### Fixed

- `{{#unless (eq ...)}}` and other `#unless` subexpressions now transpile correctly in both PHP (`render.php`) and JSX (`index.js`). Previously only `{{#unless @first}}` and `{{#unless @last}}` were handled; the general `{{#unless (eq/ne/gt/lt ...)}}` pattern leaked raw Handlebars into the output.
- Content directory auto-detection no longer triggers on empty `blocks/` or `build/` directories. The check now requires actual block content (`block.json` files) and skips the `build/admin/` directory, fixing incorrect fallback behavior on Composer installs.

## [0.0.6] - 2026-04-06

### Changes
* Removed git keep from blocks directory so the blocks dir doesnt' get created by default. This allows us to force normal failover to the shared directory.  

## [0.0.5] - 2026-04-06

### Added

- **Schema migration system** — Full lifecycle support for handling block schema changes when Handoff component properties evolve.
  - `schema-history.json` replaces `property-manifest.json` with versioned history per component (backward-compatible migration from old format).
  - Automatic Gutenberg `deprecated` array generation in `index.js` — old attributes are migrated transparently when posts are opened in the editor.
  - `schema-changelog.json` generated per block and copied to `build/` via webpack for admin consumption.
  - Admin-defined rename/transform overrides stored in `wp_options` and fed back into the compiler on recompile.
- **Schema Health panel** in the admin Blocks tab — expandable list showing deprecation history, change details (color-coded by type), affected post counts, and batch migration tools (Dry Run / Migrate Now).
- **Schema version badges** on block cards showing current schema version and review status.
- **Rename mapper UI** for resolving ambiguous changes (e.g., property renames) — map old property names to new ones directly in the admin.
- **WP-CLI schema commands**:
  - `wp handoff schema status` — List all blocks with pending deprecations and affected post counts.
  - `wp handoff schema migrate <block> [--dry-run] [--all]` — Batch-migrate block attributes in post content.
- **REST API schema endpoints**:
  - `GET /handoff/v1/schema/status` — Summary of all blocks with schema changes.
  - `GET /handoff/v1/schema/affected/<block>` — List posts containing a specific block.
  - `POST /handoff/v1/schema/migrate` — Run batch migration with dry-run support.
  - `GET/POST /handoff/v1/schema/overrides` — Read/write admin-defined migration overrides.
- **Visual Import Rules Editor** in the Settings tab — drill-down UI for managing component import toggles and array field mappings (Dynamic Posts, Taxonomy, Pagination) without editing JSON. Includes block screenshots in the configure panel for context.
- **Unified Blocks & Usage tab** — collapsed the separate Blocks and Usage tabs into a single view with block cards showing screenshots, usage badges (page count), and expandable post lists.
- **Block screenshots** in block cards and import rules editor, copied from source to `build/` via webpack `CopyPlugin`.
- **Design system asset loading** — `main.css` and `main.js` from the Handoff API are downloaded during `wp handoff compile --all` and enqueued in both the block editor and frontend.
- **`wp handoff config show`** — CLI command to print the full resolved configuration with masked credentials and source tracking.
- **Smart content directory detection** — `HANDOFF_CONTENT_DIR` auto-detects local development (plugin root when `blocks/` or `build/` exist) vs. Composer installs (`wp-content/handoff/`).
- **Security hardening** for `wp-content/handoff/` — `.htaccess`, `web.config`, and `index.php` prevent directory browsing and direct PHP execution in `build/` and `blocks/`.
- **Theme dropdown** in Settings — replaced the free-text "Theme Directory" field with a dropdown of installed themes, defaulting to the active theme.
- **Composer distribution** support with private Git repositories and GitHub Actions release automation.
- **`npm run release`** script for automated version bumping, building, packaging, and GitHub release creation.
- **Config storage in `wp_options`** — plugin configuration lives in the database with `wp-config.php` constant overrides (`HANDOFF_API_URL`, `HANDOFF_API_USERNAME`, `HANDOFF_API_PASSWORD`, `HANDOFF_CONTENT_DIR`).
- **Admin dashboard bundled in releases** — `build/admin/` is included in the release ZIP so users don't need to run `npm install` or `npm run build`.

### Changed

- Settings tab no longer shows "Output Directory" (forced to `wp-content/handoff/blocks`).
- Admin dashboard consolidated from 4 tabs (Blocks, Usage, Migration, Settings) to 3 tabs (Blocks, Migration, Settings).
- Compiler output now includes `schemaChangelog` field on `GeneratedBlock` interface.

### Fixed

- Block asset URLs now resolve correctly when blocks live outside `wp-content/plugins/` via the `plugins_url` filter.
- `wp handoff build` robustly locates the `wp-scripts` executable across different install configurations.
- Webpack `resolve.modules` and alias configuration for externalized content directories.

## [0.0.4] - 2026-04-02

### Fixed

- Compiler build script (`build:compiler`) updated to `cd compiler && npm ci && npm run build` for reliable CI builds.

## [0.0.3] - 2026-04-02

### Changed

- Refactored block builder to be more self-contained.

### Fixed

- Block registration bug fix.

## [0.0.2] - 2026-04-02

### Changed

- Major refactor to WordPress plugin-first architecture — plugin root is now the primary package.
- Compiler moved to `compiler/` subdirectory with its own `package.json`.
- Demo plugin and theme moved to project root (`blocks/`, `theme/`, `shared/`, `includes/`).
- WP-CLI integration — all compiler functions exposed as `wp handoff <command>`.
- Migration admin UI consolidated into the main Handoff admin page.

### Fixed

- Version numbering reset to 0.0.x series.
- Various bug fixes for variations, breadcrumbs, taxonomies, and pagination.
