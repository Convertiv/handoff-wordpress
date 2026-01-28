# Handoff Blocks

A collection of Gutenberg blocks built from the Handoff design system.

## Installation

1. Copy this plugin to `wp-content/plugins/handoff-blocks/`
2. Run `npm install` in the plugin directory
3. Run `npm run build` to compile all blocks
4. Activate the plugin in WordPress admin

## Development

```bash
# Install dependencies
npm install

# Development mode (watches for changes)
npm start

# Production build
npm run build
```

## Block Structure

Each block is stored in `blocks/{block-name}/`:

```
blocks/
├── about/
│   ├── block.json
│   ├── render.php
│   ├── index.js
│   ├── readme.md
│   ├── editor.scss
│   └── style.scss
├── feature/
└── hero-cta/
```

Compiled blocks are output to `build/{block-name}/`.

## Adding New Blocks

Use the Gutenberg compiler:

```bash
npm run fetch:gutenberg <component-name>
```

This will add the block to this plugin automatically.

## License

MIT
