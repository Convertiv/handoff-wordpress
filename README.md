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

CLI options always override config file values. If no config file exists, defaults are used.

See `handoff-wp.config.example.json` for a template.

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

## CLI Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--api-url <url>` | `-a` | Handoff API base URL | `http://localhost:4000` |
| `--output <dir>` | `-o` | Output directory for blocks | `./demo/plugin/blocks` |
| `--theme-dir <dir>` | `-t` | Theme directory for header/footer templates | `./demo/theme` |
| `--username <user>` | `-u` | Basic auth username for Handoff API | |
| `--password <pass>` | `-p` | Basic auth password for Handoff API | |
| `--all` | | Compile all available components | |
| `--theme` | | Compile theme templates (header, footer) | |
| `--validate` | | Validate a component for breaking property changes | |
| `--validate-all` | | Validate all components for breaking property changes | |
| `--force` | | Force compilation even with breaking changes | |

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

ISC
