# Handoff Blocks (WordPress plugin)

This repository is a **WordPress plugin** that ships Handoff-driven Gutenberg blocks, a **companion theme** in `theme/`, and an embedded **Handoff compiler** in `compiler/` that reads your design system API and generates block source into `blocks/`.

> **New here?** See [QUICKSTART.md](./QUICKSTART.md) for a short walkthrough (local wp-env, compile, build, activate).

## Overview

The **compiler** turns Handoff components (Handlebars) into `blocks/` assets: JSX for the block editor, PHP for server-side rendering, `block.json`, styles, and related files. **Webpack** (`npm run build`) bundles those sources into `build/`, which is what WordPress loads via `handoff-blocks.php`.

Use the **Handoff** screen in wp-admin (plugin root → `src/admin/`, **Migration** tab → `src/migration/`) to browse compiled blocks, Handoff/Figma links, block usage, run **content migration** from legacy pages, and (for administrators) edit `handoff-wp.config.json`. Compilation itself is run from the command line (npm or WP-CLI where Node is available)—not from that screen.

### Generated Files

For each component, the compiler generates:

* `block.json` - Block metadata and attribute definitions
* `index.js` - Gutenberg editor component (JSX)
* `render.php` - Server-side PHP rendering
* `editor.scss` - Editor-specific styles
* `style.scss` - Frontend styles
* `README.md` - Block documentation
* `screenshot.png` - Block preview image (if available)

For theme templates, it generates:

* `header.php` - Theme header template
* `footer.php` - Theme footer template
* `template-parts/*.php` - Additional template parts (e.g., header-compact, footer-compact)

## Repository layout

| Path | Purpose |
|------|---------|
| `handoff-blocks.php` | Main plugin bootstrap |
| `blocks/` | Generated block **source** (output of the compiler) |
| `build/` | Webpack **output**; block registration points here |
| `shared/` | Shared editor JS used by generated blocks |
| `includes/` | PHP: REST, field resolver, migration, categories, admin dashboard, WP-CLI |
| `src/migration/` | React UI for the **Migration** tab (page mapping); bundled into admin app |
| `src/admin/` | React UI for **Handoff** wp-admin hub (Blocks, Usage, Migration, Settings) |
| `theme/` | Companion Handoff theme (optional install under `wp-content/themes/`) |
| `uploads/` | Local uploads folder (wp-env mapping) |
| `compiler/src/` | TypeScript source for the Handoff → Gutenberg compiler |
| `compiler/dist/` | Compiled compiler CLI (`node compiler/dist/index.js`, …) |

## Installing the plugin on a WordPress site

1. Copy this directory (or a built ZIP of it) into `wp-content/plugins/`, e.g. `wp-content/plugins/handoff-wordpress/`. The main file **`handoff-blocks.php` must sit at the root of that folder**.
2. On a machine with **Node.js** (local dev, CI, or a build server), from the plugin root:
   - `npm install`
   - `npm run build:compiler` — builds the compiler into `compiler/dist/`
   - Ensure `handoff-wp.config.json` exists (see [Configuration](#configuration)); then `npm run compile:all` (and optionally `npm run compile:theme`) to refresh `blocks/` and theme files
   - `npm run build` — runs `@wordpress/scripts` and fills `build/`
3. Deploy the **same tree** (including `build/` and generated `blocks/` / `theme/` as needed) to the server.
4. In **Plugins**, activate **Handoff Blocks**.

**PHP**: align with your WordPress version (see plugin headers).

**Do site owners need Node?** Not if they install a **release that already contains `build/`** (webpack output). In that case they upload the ZIP, activate the plugin, and never run npm. Node is needed when someone is **generating or refreshing** blocks from Handoff (`npm run compile:*`) or **rebuilding** editor bundles (`npm run build`).

**Why `compiler/dist` is in the repo:** The compiled CLI is committed so you only need `npm install` (for webpack dependencies if you run `npm run build`, or a global `node` if you only run `node compiler/dist/index.js`). You can skip `npm run build:compiler` unless you change TypeScript under `compiler/src/`.

To use the bundled **theme**, copy `theme/` into `wp-content/themes/` (or symlink). With the default folder name, the theme slug is usually `theme`.

## Install via Composer (private GitHub)

If you manage WordPress dependencies with Composer, add the private repo and require the package:

```json
{
  "repositories": [
    { "type": "vcs", "url": "https://github.com/YOUR_ORG/handoff-wordpress.git" }
  ],
  "require": {
    "handoff/blocks": "^1.0"
  }
}
```

The plugin installs into `wp-content/plugins/handoff-blocks/`. Pre-built release ZIPs (no Node required) are attached to every GitHub Release automatically.

See [docs/COMPOSER.md](docs/COMPOSER.md) for authentication setup, SSH vs HTTPS tokens, Bedrock paths, and more.

## Local install: dependencies and builds

From the **plugin root**:

```bash
npm install
```

| Script | What it does |
|--------|----------------|
| `npm run build:compiler` | Compile compiler TypeScript → `compiler/dist/` |
| `npm run compile` | Run compiler CLI (`node compiler/dist/index.js …`) |
| `npm run compile:all` | Regenerate all blocks from Handoff (uses config) |
| `npm run compile:theme` | Regenerate theme templates (header/footer, etc.) |
| `npm run build` | Webpack: `blocks/` + admin + migration → `build/` |
| `npm run dev` | Webpack **watch** (`wp-scripts start`) for JS/CSS development |

If you modify the compiler TypeScript, run `npm run build:compiler` before `npm run compile:*`. The repo normally includes an up-to-date `compiler/dist/`, so this step is optional for standard use.

## Local WordPress Environment (wp-env)

This project includes [wp-env](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/) for running a local WordPress development environment with Docker.

### Prerequisites

* [Docker](https://www.docker.com/products/docker-desktop/) must be installed and running

### Starting the Environment

```bash
npm run wp:start
```

This starts a WordPress site at:

* **WordPress**: http://localhost:8888
* **Admin**: http://localhost:8888/wp-admin (username: `admin`, password: `password`)

`.wp-env.json` mounts:

* **Plugin**: `.` (this directory — the plugin root)
* **Theme**: `./theme`
* **Uploads**: `./uploads`

### wp-env Commands

| Command | Description |
|---------|-------------|
| `npm run wp:start` | Start the WordPress environment |
| `npm run wp:stop` | Stop the environment (preserves data) |
| `npm run wp:destroy` | Stop and remove containers and data |
| `npm run wp:clean` | Reset the database to a fresh state |
| `npm run wp:logs` | View container logs |
| `npm run wp:cli -- <command>` | Run WP-CLI commands |

### WP-CLI examples

```bash
# List plugins and themes (find the slug WordPress assigned to this plugin)
npm run wp:cli -- wp plugin list
npm run wp:cli -- wp theme list

# Activate the companion theme (folder name is usually `theme`)
npm run wp:cli -- wp theme activate theme

# Activate Handoff Blocks — use the slug from `wp plugin list` (often the parent folder name)
npm run wp:cli -- wp plugin activate handoff-wordpress

# Handoff compiler / build (requires Node on the same environment as `wp`)
wp handoff compile --all
wp handoff build
wp handoff status

# Export the database
npm run wp:cli -- wp db export
```

**Note:** `@wordpress/env`’s default **CLI** container often does **not** include Node.js. For local Docker workflows, run `npm run compile:*` and `npm run build` on your **host** in the plugin root; use `wp handoff …` on servers or shells where both `wp` and `node` are available.

## Configuration

### Creating a Config File

Create a config file from the **plugin root** (same directory as `handoff-wp.config.json` should live):

```bash
npm run compile -- init

# Or with options
npm run compile -- init --api-url https://my-handoff-site.com --output ./blocks
```

Or, where WP-CLI and Node share an environment:

```bash
wp handoff init --api-url=https://my-handoff-site.com
```

This writes `handoff-wp.config.json` in the current working directory; keep it in the **plugin root** so paths like `./blocks` and `./theme` resolve correctly.

### Config File Format

You can also manually create a `handoff-wp.config.json` file in your project root:

```json
{
  "apiUrl": "https://demo.handoff.com",
  "output": "./blocks",
  "themeDir": "./theme",
  "username": "your-username",
  "password": "your-password"
}
```

| Property | Description |
|----------|-------------|
| `apiUrl` | Handoff API base URL |
| `output` | Output directory for generated blocks |
| `themeDir` | Theme directory for header/footer templates |
| `username` | Basic auth username (optional) |
| `password` | Basic auth password (optional) |
| `import` | Component import configuration by type (see below) |

CLI options always override config file values. If no config file exists, defaults are used.

See `handoff-wp.config.example.json` for a template.

### Component Import Configuration

The `import` key controls which component types are imported and configures per-component dynamic array fields. This replaces the previous hardcoded element filter and the flat `dynamicArrays` config.

```json
{
  "apiUrl": "https://demo.handoff.com",
  "output": "./blocks",
  "import": {
    "element": false,
    "block": {
      "posts-latest": {
        "posts": {
          "postTypes": ["post", "page"],
          "selectionMode": "query",
          "maxItems": 12,
          "renderMode": "mapped",
          "fieldMapping": {
            "image": "featured_image",
            "title": "post_title",
            "summary": "post_excerpt",
            "date.day": "post_date:day_numeric",
            "date.month": "post_date:month_short",
            "date.year": "post_date:year",
            "url": "permalink"
          }
        }
      }
    }
  }
}
```

#### Type-Level Values

Each key under `import` is a component type (e.g., `element`, `block`). The value controls how components of that type are handled:

| Value | Meaning |
|-------|---------|
| `false` | Skip all components of this type |
| `true` | Import all components of this type (no per-component config) |
| `{ ... }` (object) | Import **all** components of this type; listed components get per-field overrides |

When `import` is absent, the default is `{ "element": false }` (skip elements, import everything else).

#### Component-Level Values

Within a type object, each key is a component ID. The value controls that specific component:

| Value | Meaning |
|-------|---------|
| `true` or `{}` | Import with no dynamic arrays |
| `false` | Skip this specific component |
| `{ "fieldName": { ...config } }` | Import with dynamic array config on the specified fields |

Components not listed in a type object are still imported with defaults.

#### Dynamic Array Field Config

Each field-level object can be one of several config types, selected by the presence (or absence) of the `arrayType` key.

**Posts (default — omit `arrayType` or set `"arrayType": "posts"`)**

| Property | Type | Description |
|----------|------|-------------|
| `postTypes` | string[] | Allowed WordPress post types |
| `defaultPostType` | string | Default post type when first enabled |
| `selectionMode` | `"query"` \| `"manual"` | Default selection mode (see below) |
| `maxItems` | number | Maximum number of items |
| `renderMode` | `"mapped"` \| `"template"` | How posts are rendered |
| `fieldMapping` | object | Maps post data to template fields (for mapped mode) |
| `templatePath` | string | PHP template path (for template mode) |
| `defaultQueryArgs` | object | Default query settings for query mode |

#### Selection Modes

The editor provides three modes for dynamic array fields, controlled by a three-button toggle:

**Query** (`selectionMode: "query"`): Users build a query with filters. The editor shows:
- Post type selector
- Posts per page slider
- Order by / direction controls
- Taxonomy filters (categories, tags, custom taxonomies)

**Select** (`selectionMode: "manual"`): Users search and hand-pick specific posts. Posts are ordered as selected.

**Manual**: Users enter data directly through the standard repeater fields — the same as a non-dynamic array. No post fetching occurs.

#### Render Modes

**Mapped Mode** (`renderMode: "mapped"`): Posts are converted to the Handoff template structure using the `fieldMapping` configuration. Best for most use cases.

**Template Mode** (`renderMode: "template"`): Posts are passed to a PHP template file specified by `templatePath`. Useful when you need custom PHP logic.

### Other Array Types

In addition to posts, an array field can be configured as one of the three specialised types below by setting `arrayType`. These types are always server-rendered — the editor shows only simple controls.

| Type | `arrayType` value | Editor UI | PHP behavior |
|------|-------------------|-----------|--------------|
| Breadcrumbs | `"breadcrumbs"` | Enable/disable toggle | Calls `handoff_get_breadcrumb_items()` |
| Taxonomy | `"taxonomy"` | Enable/disable toggle + taxonomy selector | Calls `wp_get_post_terms()` |
| Pagination | `"pagination"` | Enable/disable toggle | Calls `handoff_build_pagination()` using sibling field's `WP_Query` |

#### Breadcrumbs

Populates an array from the current page breadcrumb trail. Each item has `label`, `url`, and `active` keys.

```json
"breadcrumbs": {
  "arrayType": "breadcrumbs"
}
```

The PHP helper `handoff_get_breadcrumb_items()` is provided by the plugin. It builds a WP-native breadcrumb trail (home → ancestors → current page/post/archive). No extra plugin is required, but if you have a dedicated breadcrumb plugin that exposes its own function you can call that instead.

| Attribute generated | Type | Default |
|--------------------|------|---------|
| `breadcrumbsEnabled` | boolean | `true` |

#### Taxonomy Terms

Populates an array from the terms of a given taxonomy attached to the current post. Each item has `label`, `url`, and `slug` keys.

```json
"tags": {
  "arrayType": "taxonomy",
  "taxonomies": ["post_tag", "category"],
  "maxItems": 5
}
```

| Config property | Type | Description |
|-----------------|------|-------------|
| `taxonomies` | string[] | Taxonomy slugs the editor can choose from |
| `maxItems` | number | Maximum number of terms to return (default: all) |

| Attribute generated | Type | Default |
|--------------------|------|---------|
| `tagsEnabled` | boolean | `false` |
| `tagsTaxonomy` | string | First entry in `taxonomies` |

#### Pagination

Populates an array of pagination links derived from the `WP_Query` run by a sibling `DynamicArrayConfig` posts field. Each item has `label`, `url`, `active`, `disabled`, and `type` keys.

```json
"pagination": {
  "arrayType": "pagination",
  "connectedField": "posts"
}
```

`connectedField` must be the property name of a `DynamicArrayConfig` field in the same component. The posts array **must appear before** the pagination array in the Handlebars template so that `$query` is available when the pagination code runs.

| Config property | Type | Description |
|-----------------|------|-------------|
| `connectedField` | string | Property name of the sibling posts field |

| Attribute generated | Type | Default |
|--------------------|------|---------|
| `paginationEnabled` | boolean | `true` |

#### Full example — blog post with all three types

```json
{
  "import": {
    "element": false,
    "block": {
      "blog-post": {
        "breadcrumbs": { "arrayType": "breadcrumbs" },
        "tags": {
          "arrayType": "taxonomy",
          "taxonomies": ["post_tag", "category"],
          "maxItems": 5
        },
        "pagination": {
          "arrayType": "pagination",
          "connectedField": "posts"
        },
        "posts": {
          "postTypes": ["post"],
          "selectionMode": "query",
          "maxItems": 9,
          "renderMode": "mapped",
          "fieldMapping": {
            "image": "featured_image",
            "title": "post_title",
            "excerpt": "post_excerpt",
            "link.url": "permalink"
          }
        }
      }
    }
  }
}
```

### Field Mapping

Field mapping defines how WordPress post data maps to your Handoff template structure. Keys are dot-notation paths in the template (e.g., `link.url`), values are data sources.

#### Simple Field Sources

| Source | Description | Example Output |
|--------|-------------|----------------|
| `post_title` | Post title | `"My Blog Post"` |
| `post_content` | Post content (with wpautop) | `"<p>Content here...</p>"` |
| `post_excerpt` | Post excerpt | `"Brief summary..."` |
| `post_date` | Formatted date | `"January 15, 2024"` |
| `post_name` | Post slug | `"my-blog-post"` |
| `permalink` | Full URL | `"https://site.com/my-blog-post/"` |
| `post_id` | Post ID | `123` |
| `featured_image` | Featured image object | `{ src, alt, srcset, sizes }` |

#### Date Part Extraction

Extract specific parts of the post date using `post_date:{part}`:

| Source | Description | Example |
|--------|-------------|---------|
| `post_date:day` | Day with leading zero | `"05"` |
| `post_date:day_numeric` | Day without leading zero | `"5"` |
| `post_date:day_name` | Full day name | `"Monday"` |
| `post_date:day_short` | Short day name | `"Mon"` |
| `post_date:month` | Month with leading zero | `"01"` |
| `post_date:month_numeric` | Month without leading zero | `"1"` |
| `post_date:month_name` | Full month name | `"January"` |
| `post_date:month_short` | Short month name | `"Jan"` |
| `post_date:year` | Full year | `"2024"` |
| `post_date:year_short` | Two-digit year | `"24"` |
| `post_date:time` | 12-hour time | `"2:30 PM"` |
| `post_date:time_24` | 24-hour time | `"14:30"` |
| `post_date:full` | Full formatted | `"January 15, 2024"` |
| `post_date:format:X` | Custom PHP format | `post_date:format:F j, Y` |

#### Author Fields

Access author data using `author.{field}`:

| Source | Description |
|--------|-------------|
| `author.name` | Display name |
| `author.url` | Author archive URL |
| `author.avatar` | Avatar image URL |
| `author.bio` | Author biography |
| `author.email` | Author email |

#### Taxonomy Fields

Access taxonomy terms using `taxonomy:{taxonomy_name}`:

| Source | Description |
|--------|-------------|
| `taxonomy:category` | First category name |
| `taxonomy:post_tag` | First tag name |
| `taxonomy:custom_taxonomy` | First term from custom taxonomy |

#### Post Meta

Access custom fields using `meta:{field_key}`:

```json
{
  "fieldMapping": {
    "customField": "meta:my_custom_field",
    "price": "meta:product_price"
  }
}
```

#### Complex Field Sources

For more control, use object syntax:

**Static Value**
```json
{
  "link.label": { "type": "static", "value": "Read More" }
}
```

**Post Meta**
```json
{
  "price": { "type": "meta", "key": "product_price" }
}
```

**Taxonomy with Format**
```json
{
  "category": { 
    "type": "taxonomy", 
    "taxonomy": "category",
    "format": "first"
  }
}
```

Format options: `"first"` (single term name), `"all"` (array of term objects), `"links"` (comma-separated linked terms), `"names"` (comma-separated names)

**Custom Callback**
```json
{
  "customData": { "type": "custom", "callback": "my_custom_resolver" }
}
```

The callback receives `($post_id, $source_config)` and should return the resolved value.

**Manual (User-Editable)**
```json
{
  "type": { "type": "manual" },
  "buttonLabel": { "type": "manual" }
}
```

Fields mapped with `type: "manual"` are not resolved from post data. Instead, they appear as editable controls in the block sidebar under **Advanced Options**, allowing the editor to set a single value that applies to every item in the array. The control type (text input, select dropdown, toggle, or number) is automatically derived from the field's property definition in the Handoff component schema:

| Property Type | Control |
|---------------|---------|
| `text` (default) | Text input |
| `select` | Dropdown with options from the property |
| `boolean` | Toggle switch |
| `number` | Number input |

This is useful for fields like card type, button labels, or flags that should be consistent across all items but customizable by the editor — unlike `static` where the value is fixed at compile time.

### Example Configurations

#### Blog Post Grid

```json
{
  "import": {
    "element": false,
    "block": {
      "posts-latest": {
        "posts": {
          "postTypes": ["post"],
          "selectionMode": "query",
          "maxItems": 12,
          "renderMode": "mapped",
          "fieldMapping": {
            "image": "featured_image",
            "title": "post_title",
            "excerpt": "post_excerpt",
            "date.day": "post_date:day_numeric",
            "date.month": "post_date:month_short",
            "date.year": "post_date:year",
            "category": "taxonomy:category",
            "author": "author.name",
            "link.url": "permalink",
            "link.text": { "type": "static", "value": "Read More" }
          },
          "defaultQueryArgs": {
            "posts_per_page": 6,
            "orderby": "date",
            "order": "DESC"
          }
        }
      }
    }
  }
}
```

#### Team Members (Select Mode)

```json
{
  "import": {
    "element": false,
    "block": {
      "team-grid": {
        "members": {
          "postTypes": ["team_member"],
          "selectionMode": "manual",
          "maxItems": 20,
          "renderMode": "mapped",
          "fieldMapping": {
            "photo": "featured_image",
            "name": "post_title",
            "bio": "post_excerpt",
            "role": "meta:job_title",
            "email": "meta:email_address",
            "linkedin": "meta:linkedin_url"
          }
        }
      }
    }
  }
}
```

#### Testimonials with Template

```json
{
  "import": {
    "element": false,
    "block": {
      "testimonials": {
        "items": {
          "postTypes": ["testimonial"],
          "selectionMode": "query",
          "renderMode": "template",
          "templatePath": "template-parts/testimonial-item.php"
        }
      }
    }
  }
}
```

#### Skip Specific Components

```json
{
  "import": {
    "element": false,
    "block": {
      "deprecated-hero": false,
      "posts-latest": {
        "posts": { "postTypes": ["post"], "selectionMode": "query", "renderMode": "mapped" }
      }
    }
  }
}
```

#### Dynamic Array Wizard

Instead of manually editing the config file, use the interactive wizard to configure dynamic arrays. The wizard writes to the `import` structure automatically.

```bash
# Start the wizard and select a component interactively
npm run compile -- wizard

# Configure a specific component
npm run compile -- wizard posts-latest

# List all components with array fields
npm run compile -- wizard --list
```

The wizard will:

1. Fetch the component structure from the Handoff API
2. Show all array fields in the component
3. Walk you through configuring each array:
   - Selection mode (Query Builder or Manual Selection)
   - Allowed post types
   - Maximum items
   - Render mode (Mapped or Template)
   - Field mappings with smart suggestions based on field names
4. Save the configuration under `import.block[componentId][fieldName]`

Example session:

```
🧙 Dynamic Array Configuration Wizard
   Component: posts-latest
   API: https://demo.handoff.com

📡 Fetching component structure...
   Found: Posts Latest (posts-latest)

📋 Found 1 array field(s):
   1. posts (5 item properties)

⚙️  Configuring: posts-latest.posts

How should users select posts?
  > 1. Query Builder (filter by taxonomy, order, etc.)
    2. Manual Selection (hand-pick specific posts)
Enter number [1]: 

Post types [post]: post

Maximum items [12]: 6

📊 Field Mapping Configuration
  image [featured_image]: 
  title [post_title]: 
  summary [post_excerpt]: 
  date.day [post_date:day_numeric]: 
  date.month [post_date:month_short]: 
  url [permalink]: 

✅ Saved to handoff-wp.config.json
```

#### Backward Compatibility

If your config file still uses the legacy `dynamicArrays` key (without an `import` key), the compiler will auto-migrate it at load time and log a deprecation warning. The legacy format uses dot notation (`"componentId.fieldName"`) and an `enabled` flag:

```json
{
  "dynamicArrays": {
    "posts-latest.posts": {
      "enabled": true,
      "postTypes": ["post"],
      "selectionMode": "query",
      "..."
    }
  }
}
```

This is automatically converted to the equivalent `import` structure. We recommend migrating your config file to the new format.

## Usage

### Compiler CLI (plugin root)

After `npm run build:compiler`, run the compiled CLI via npm scripts (recommended):

```bash
npm run compile -- <component-name> [options]
npm run compile -- --all
npm run compile -- --theme
```

Or invoke Node directly:

```bash
node compiler/dist/index.js <component-name> [options]
```

### TypeScript development (compiler only)

To run the compiler from **`compiler/`** TypeScript during development:

```bash
cd compiler && npx ts-node src/index.ts -- --help
```

### Publishing npm package (optional)

The compiler can still be treated as a small package inside `compiler/` (`compiler/package.json`). The **plugin** root `package.json` is for WordPress/webpack, not for publishing the old unified `handoff-wordpress` CLI from repo root.

## CLI Commands

### Main Commands

| Command | Description |
|---------|-------------|
| `<component-name>` | Compile a single component to a Gutenberg block |
| `--all` | Compile all available components |
| `--theme` | Compile theme templates (header, footer) |
| `init` | Create a new `handoff-wp.config.json` file |
| `wizard [component]` | Interactive wizard to configure dynamic arrays |
| `configure-dynamic [component]` | Alias for `wizard` |

### CLI Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--api-url <url>` | `-a` | Handoff API base URL | From config, else `http://localhost:4000` |
| `--output <dir>` | `-o` | Output directory for blocks | `./blocks` (relative to config / cwd) |
| `--theme-dir <dir>` | `-t` | Theme directory for header/footer templates | `./theme` |
| `--username <user>` | `-u` | Basic auth username for Handoff API | |
| `--password <pass>` | `-p` | Basic auth password for Handoff API | |
| `--validate` | | Validate a component for breaking property changes | |
| `--validate-all` | | Validate all components for breaking property changes | |
| `--force` | | Force compilation even with breaking changes | |

### Wizard Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--list` | `-l` | List all components with array fields |
| `--api-url <url>` | `-a` | Handoff API base URL |
| `--username <user>` | `-u` | Basic auth username |
| `--password <pass>` | `-p` | Basic auth password |

## Examples

### Compile a Single Component

```bash
# Using default API URL from handoff-wp.config.json
npm run compile -- hero-article

# With custom API URL and output directory
npm run compile -- hero-article --api-url https://demo.handoff.com --output ./blocks
```

### Compile all components

```bash
npm run compile -- --all
# or
npm run compile:all
```

### Compile theme templates

Generate `header.php`, `footer.php`, and related theme files under `theme/`:

```bash
npm run compile -- --theme
# or
npm run compile:theme

# With custom theme directory
npm run compile -- --theme --theme-dir ./my-theme
```

### Validate components

Check for breaking property changes before compiling:

```bash
npm run compile -- --validate hero-article
npm run compile -- --validate-all
```

### Force compilation

Skip validation and compile even with breaking changes:

```bash
npm run compile -- hero-article --force
npm run compile -- --all --force
```

## Validation

The compiler maintains a property manifest to track component properties over time. When compiling, it validates that no breaking changes have occurred (such as removed or renamed properties) that could break existing WordPress content.

If breaking changes are detected, the compiler will exit with an error unless the `--force` flag is used.

## Dependencies

**Plugin root (`package.json`)** — block editor and tooling:

* **@10up/block-components** — shared block UI primitives
* **@wordpress/scripts** — webpack / `wp-scripts` build for `blocks/` and the unified **Handoff** admin app (blocks, usage, migration, settings)
* **@wordpress/env** — local Docker WordPress (wp-env)
* **copy-webpack-plugin** — copy `block.json`, `render.php`, variations into `build/`

**Compiler (`compiler/package.json`)** — Handoff → Gutenberg:

* **commander** — CLI parsing
* **handlebars** — template structure
* **node-html-parser** — HTML/JSX conversion helpers
* **prettier** + **@prettier/plugin-php** — format generated JS/PHP

## License

MIT
