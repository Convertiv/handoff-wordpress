# Handoff WordPress Compiler

A compiler that transpiles Handoff design system components into WordPress Gutenberg blocks and theme templates.

> **New here?** Check out the [Quickstart Guide](./QUICKSTART.md) to get up and running in 5 minutes.

## Overview

The Handoff WordPress Compiler reads component definitions from the Handoff API and generates fully-functional WordPress Gutenberg blocks. It converts Handlebars templates to JSX for the editor and PHP for server-side rendering, along with all necessary configuration files.

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

## Installation

```bash
npm install
```

## Building

Compile the TypeScript source to JavaScript:

```bash
npm run build
```

This outputs the compiled JavaScript to the `dist/` directory.

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

The environment automatically mounts:

* **Theme**: `./demo/theme`
* **Plugin**: `./demo/plugin`
* **Uploads**: `./demo/uploads`

### wp-env Commands

| Command | Description |
|---------|-------------|
| `npm run wp:start` | Start the WordPress environment |
| `npm run wp:stop` | Stop the environment (preserves data) |
| `npm run wp:destroy` | Stop and remove containers and data |
| `npm run wp:clean` | Reset the database to a fresh state |
| `npm run wp:logs` | View container logs |
| `npm run wp:cli -- <command>` | Run WP-CLI commands |

### WP-CLI Examples

```bash
# List installed plugins
npm run wp:cli -- wp plugin list

# Activate the theme
npm run wp:cli -- wp theme activate theme

# Activate the blocks plugin
npm run wp:cli -- wp plugin activate plugin

# Export the database
npm run wp:cli -- wp db export
```

## Configuration

### Creating a Config File

Use the `init` command to create a config file:

```bash
npm run dev -- init

# Or with options
npm run dev -- init --api-url https://my-handoff-site.com --output ./blocks
```

This creates a `handoff-wp.config.json` file in the current directory.

### Config File Format

You can also manually create a `handoff-wp.config.json` file in your project root:

```json
{
  "apiUrl": "https://demo.handoff.com",
  "output": "./demo/plugin/blocks",
  "themeDir": "./demo/theme",
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
  "output": "./demo/plugin/blocks",
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

Each field-level object is a `DynamicArrayConfig`:

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
npm run dev -- wizard

# Configure a specific component
npm run dev -- wizard posts-latest

# List all components with array fields
npm run dev -- wizard --list
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

### Development Mode

Run directly from TypeScript source:

```bash
npm run dev -- <component-name> [options]
```

### Production Mode

After building, run the compiled version:

```bash
npm run fetch -- <component-name> [options]
```

Or use node directly:

```bash
node dist/index.js <component-name> [options]
```

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
| `--api-url <url>` | `-a` | Handoff API base URL | `http://localhost:4000` |
| `--output <dir>` | `-o` | Output directory for blocks | `./demo/plugin/blocks` |
| `--theme-dir <dir>` | `-t` | Theme directory for header/footer templates | `./demo/theme` |
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
# Using default API URL
npm run fetch -- hero-article

# With custom API URL and output directory
npm run fetch -- hero-article --api-url https://demo.handoff.com --output ./blocks
```

### Compile All Components

```bash
npm run fetch -- --all
```

### Compile Theme Templates

Generate header.php and footer.php for your WordPress theme:

```bash
npm run fetch -- --theme

# With custom theme directory
npm run fetch -- --theme --theme-dir ./my-theme
```

### Validate Components

Check for breaking property changes before compiling:

```bash
# Validate a single component
npm run fetch -- --validate hero-article

# Validate all components
npm run fetch -- --validate-all
```

### Force Compilation

Skip validation and compile even with breaking changes:

```bash
npm run fetch -- hero-article --force
npm run fetch -- --all --force
```

## Validation

The compiler maintains a property manifest to track component properties over time. When compiling, it validates that no breaking changes have occurred (such as removed or renamed properties) that could break existing WordPress content.

If breaking changes are detected, the compiler will exit with an error unless the `--force` flag is used.

## Dependencies

* **commander** - CLI argument parsing
* **handlebars** - Template parsing
* **node-html-parser** - HTML parsing for template conversion
* **prettier** - Code formatting for generated files
* **@prettier/plugin-php** - PHP formatting support
* **@wordpress/env** - Local WordPress development environment

## License

MIT
