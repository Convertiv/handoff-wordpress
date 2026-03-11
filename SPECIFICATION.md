# Handoff WordPress Compiler — Transpilation Specification

This document describes how the Handoff WordPress compiler reads Handoff component data (Handlebars templates and property definitions) and transforms them into WordPress Gutenberg blocks.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Input Format](#2-input-format)
3. [Output Format](#3-output-format)
4. [Property Type Mappings](#4-property-type-mappings)
5. [Handlebars-to-JSX Pipeline](#5-handlebars-to-jsx-pipeline)
6. [Handlebars-to-JSX Mappings](#6-handlebars-to-jsx-mappings)
7. [Handlebars-to-PHP Mappings](#7-handlebars-to-php-mappings)
8. [Helper Expressions](#8-helper-expressions)
9. [Field Editing (Inline vs Sidebar)](#9-field-editing-inline-vs-sidebar)
10. [Dynamic Arrays](#10-dynamic-arrays)
11. [Styles](#11-styles)
12. [Shared Components](#12-shared-components)
13. [Pipeline Steps](#13-pipeline-steps)

---

## 1. Overview

The compiler converts Handoff design-system components into WordPress Gutenberg blocks. Each Handoff component consists of:

- A **Handlebars template** (`component.code`) defining the HTML structure
- A **properties schema** (`component.properties`) defining editable fields and their types
- Optional **CSS/SASS** for styling

The compiler produces a self-contained Gutenberg block with editor UI, server-side rendering, and styles. The editor UI provides both **inline editing** (on the block canvas) and **sidebar controls** (in the InspectorControls panel), depending on how fields are used in the template.

---

## 2. Input Format

### HandoffComponent

```typescript
interface HandoffComponent {
  id: string;          // e.g. "hero_article"
  title: string;       // e.g. "Hero Article"
  description: string;
  properties: Record<string, HandoffProperty>;
  code: string;        // Handlebars template
  css?: string;
  sass?: string;
  figma?: string;      // Figma URL
  preview?: string;    // Preview image URL
}
```

### HandoffProperty

```typescript
interface HandoffProperty {
  id: string;
  name: string;
  type: 'text' | 'richtext' | 'image' | 'link' | 'button' | 'number' |
        'boolean' | 'select' | 'array' | 'object' | 'pagination';
  description?: string;
  default?: any;
  rules?: { required?: boolean };
  items?: { type: string; properties?: Record<string, HandoffProperty> };
  properties?: Record<string, HandoffProperty>;
  options?: Array<{ label: string; value: string }>;
}
```

### Handlebars Template Syntax

The compiler supports the following Handlebars constructs:

| Construct | Description |
|-----------|-------------|
| `{{properties.fieldName}}` | Output a property value (escaped) |
| `{{{properties.fieldName}}}` | Output a property value (unescaped / raw HTML) |
| `{{#each properties.items as \|item\|}}...{{/each}}` | Loop over an array property |
| `{{#each this.subArray as \|sub\|}}...{{/each}}` | Nested loop inside a parent loop |
| `{{#if properties.fieldName}}...{{/if}}` | Conditional rendering |
| `{{#if properties.fieldName}}...{{else}}...{{/if}}` | Conditional with else |
| `{{#if (eq properties.x "value")}}...{{/if}}` | Conditional with helper expression |
| `{{else if (condition)}}` | Else-if chain |
| `{{#unless @last}}...{{/unless}}` | Unless last item in loop |
| `{{#unless @first}}...{{/unless}}` | Unless first item in loop |
| `{{@index}}` | Current loop index |
| `{{this.fieldName}}` | Access field on current loop item |
| `{{#field "path"}}...{{/field}}` | Mark content as inline-editable in the editor |

---

## 3. Output Format

For each component, the compiler generates 6 files inside a block directory:

| File | Purpose |
|------|---------|
| `block.json` | Block metadata, attributes, and registration config |
| `index.js` | Editor script — `edit()` function with InspectorControls and canvas preview |
| `render.php` | Server-side rendering template |
| `editor.scss` | Editor-only styles |
| `style.scss` | Frontend + editor styles |
| `README.md` | Block documentation |

### block.json

Registers the block with WordPress. Contains:
- `name`: `handoff/{component-id}` (kebab-case)
- `attributes`: Gutenberg attribute definitions mapped from Handoff properties
- `editorScript`, `editorStyle`, `style`, `render`: file references
- `__handoff`: metadata with Handoff and Figma URLs

### index.js

Registers the block via `registerBlockType()`. The `edit()` function renders:
1. `<InspectorControls>` with `<PanelBody>` panels for sidebar editing
2. `<BlockControls>` with `<MediaReplaceFlow>` for image toolbar buttons
3. Editor preview div with transpiled JSX from the Handlebars template

### render.php

PHP template that extracts block attributes and renders the component server-side. Uses `get_block_wrapper_attributes()` for the root element.

---

## 4. Property Type Mappings

Each Handoff property type maps to a Gutenberg block attribute, a sidebar control, an inline editing component, and a PHP render expression.

| Handoff Type | Block Attribute | Sidebar Control | Inline Component | PHP Render |
|-------------|----------------|-----------------|-----------------|------------|
| `text` | `{ type: 'string' }` | `TextControl` | `RichText` (via `{{#field}}`) | `esc_html()` |
| `richtext` | *(none — uses InnerBlocks)* | *(none)* | `InnerBlocks` (via `{{#field}}`) | `$content` |
| `number` | `{ type: 'number' }` | `RangeControl` | *(none)* | `intval()` |
| `boolean` | `{ type: 'boolean' }` | `ToggleControl` | *(none)* | direct |
| `image` | `{ type: 'object' }` | `MediaUpload` | `Image` (10up, via `{{#field}}`) | `esc_url()` for src |
| `link` | `{ type: 'object' }` | `LinkControl` + `TextControl` | `HandoffLinkField` (via `{{#field}}`) | `esc_url()` for url |
| `button` | `{ type: 'object' }` | `LinkControl` + `TextControl` + `ToggleControl` | `HandoffLinkField` (via `{{#field}}`) | `esc_url()` for href |
| `select` | `{ type: 'string' }` | `SelectControl` | *(none)* | `esc_html()` |
| `array` | `{ type: 'array' }` | `Repeater` (10up) | *(none)* | `foreach` |
| `object` | `{ type: 'object' }` | Nested field controls | *(none)* | nested access |
| `pagination` | *(none — server-side only)* | *(none)* | *(none)* | generated from WP_Query |

### Default Values

| Type | Default |
|------|---------|
| `text`, `select` | `''` |
| `number` | `0` |
| `boolean` | `false` |
| `image` | `{ src: '', alt: '' }` |
| `link` | `{ label: '', url: '', opensInNewTab: false }` |
| `button` | `{ label: '', href: '#', target: '', rel: '', disabled: false }` |
| `array` | `[]` (with first item from `items.properties` defaults) |
| `object` | Nested defaults from sub-properties |

---

## 5. Handlebars-to-JSX Pipeline

The Handlebars template is transformed into React JSX through a multi-stage pipeline:

```
Template (Handlebars string)
        │
        ▼
  preprocessFields()
  ├─ Finds {{#field "path"}}...{{/field}} blocks
  ├─ Looks up field type via field-lookup.ts
  ├─ Creates <editable-field-marker> for text/richtext/image/link/button
  └─ Tracks which fields have inline editing
        │
        ▼
  cleanTemplate()
  ├─ Strips <html>/<body> wrappers
  ├─ Removes {{{style}}}, {{{script}}}
  ├─ Removes comments
  └─ Calls preprocessAttributeConditionals()
        │
        ▼
  preprocessBlocks()
  ├─ {{#each}} → <loop-marker> / <nested-loop-marker>
  ├─ {{#if}}  → <if-marker> / <if-else-marker> / <if-elseif-marker>
  └─ {{#unless @first/@last}} → <unless-first/last-marker>
        │
        ▼
  parseHTML()  (node-html-parser)
        │
        ▼
  nodeToJsx()
  ├─ HTML elements → JSX with converted attributes
  ├─ Text content → processTextContent() for Handlebars expressions
  ├─ <a> tags → href stripped (editor-only)
  └─ Self-closing tags handled
        │
        ▼
  postprocessJsx()
  ├─ <loop-marker>  → {arr && arr.map((item, index) => (...))}
  ├─ <if-marker>    → {condition && (...)}
  ├─ <if-else-marker> → {condition ? (...) : (...)}
  ├─ <editable-field-marker> → RichText / Image / InnerBlocks / HandoffLinkField
  └─ class= → className=
        │
        ▼
  postprocessTemplateLiterals()
  └─ Decode base64 template literal markers
        │
        ▼
  JSX output string
```

---

## 6. Handlebars-to-JSX Mappings

### Property References

| Handlebars | JSX |
|------------|-----|
| `{{properties.title}}` | `{title}` |
| `{{properties.hero.subtitle}}` | `{hero?.subtitle}` |
| `{{this.label}}` | `{item.label}` (in loop) |
| `{{alias.field}}` | `{alias.field}` (named loop variable) |
| `{{{properties.content}}}` | `<span dangerouslySetInnerHTML={{ __html: content }} />` |
| `{{@index}}` | `{index}` |
| `{{@first}}` | `{index === 0}` |

### Loops

| Handlebars | JSX |
|------------|-----|
| `{{#each properties.items as \|card\|}}...{{/each}}` | `{items && items.map((card, index) => (<Fragment key={index}>...</Fragment>))}` |
| `{{#each this.tags as \|tag\|}}...{{/each}}` | `{item.tags && item.tags.map((tag, tagIndex) => (<Fragment key={tagIndex}>...</Fragment>))}` |

### Conditionals

| Handlebars | JSX |
|------------|-----|
| `{{#if properties.showTitle}}...{{/if}}` | `{showTitle && (<Fragment>...</Fragment>)}` |
| `{{#if properties.x}}A{{else}}B{{/if}}` | `{x ? (<Fragment>A</Fragment>) : (<Fragment>B</Fragment>)}` |
| `{{#unless @last}}...{{/unless}}` | `{index < items?.length - 1 && (<Fragment>...</Fragment>)}` |
| `{{#unless @first}}...{{/unless}}` | `{index !== 0 && (<Fragment>...</Fragment>)}` |

### Attributes

| Handlebars in Attribute | JSX |
|------------------------|-----|
| `href="{{properties.url}}"` | `href={url}` |
| `src="{{properties.image.src}}"` | `src={image?.src}` |
| `class="card {{properties.type}}"` | `` className={`card ${type}`} `` |
| `style="background: {{properties.bg}}"` | `style={{ background: bg }}` |
| `{{#if cond}}class="active"{{/if}}` | Conditional attribute expression |

### Naming Conventions

- `properties.field_name` → `fieldName` (snake_case to camelCase)
- Reserved JS words are prefixed: `class` → `blockClass`, `super` → `blockSuper`
- Component IDs: `hero_article` → block name `handoff/hero-article`

---

## 7. Handlebars-to-PHP Mappings

### Property References

| Handlebars | PHP |
|------------|-----|
| `{{properties.title}}` | `<?php echo esc_html($title ?? ''); ?>` |
| `{{properties.image.src}}` | `<?php echo esc_url($image['src'] ?? ''); ?>` |
| `{{{properties.content}}}` | `<?php echo $content; ?>` (InnerBlocks content) |
| `{{this.label}}` | `<?php echo esc_html($item['label'] ?? ''); ?>` |
| `{{@index}}` | `<?php echo $index; ?>` |

### Loops

| Handlebars | PHP |
|------------|-----|
| `{{#each properties.items as \|card\|}}` | `<?php foreach ($items as $index => $item) : ?>` |
| `{{/each}}` | `<?php endforeach; ?>` |
| `{{#each this.tags}}` | `<?php foreach ($item['tags'] as $subIndex => $subItem) : ?>` |

### Conditionals

| Handlebars | PHP |
|------------|-----|
| `{{#if properties.x}}` | `<?php if (!empty($x)) : ?>` |
| `{{else}}` | `<?php else : ?>` |
| `{{/if}}` | `<?php endif; ?>` |
| `{{#unless @last}}` | `<?php if ($index < $_loop_count - 1) : ?>` |
| `{{#unless @first}}` | `<?php if ($index > 0) : ?>` |

### Escaping in PHP

- Text values: `esc_html()`
- URLs (`href`, `src`): `esc_url()`
- Attribute values: `esc_attr()`
- Raw HTML / richtext: `$content` (InnerBlocks) or `wp_kses_post()`

### PHP Attribute Extraction

```php
$attributes = $attributes ?? [];
$title = $attributes['title'] ?? '';
$image = $attributes['image'] ?? ['src' => '', 'alt' => ''];
$items = $attributes['items'] ?? [];
```

---

## 8. Helper Expressions

Handlebars helper expressions in conditionals are transpiled to both JSX and PHP.

| Handlebars Helper | JSX | PHP |
|------------------|-----|-----|
| `(eq a "b")` | `a === "b"` | `($a ?? '') === 'b'` |
| `(ne a "b")` | `a !== "b"` | `($a ?? '') !== 'b'` |
| `(gt a 5)` | `a > 5` | `($a ?? 0) > 5` |
| `(lt a 5)` | `a < 5` | `($a ?? 0) < 5` |
| `(gte a 5)` | `a >= 5` | `($a ?? 0) >= 5` |
| `(lte a 5)` | `a <= 5` | `($a ?? 0) <= 5` |
| `(and a b)` | `(a) && (b)` | `(!empty($a)) && (!empty($b))` |
| `(or a b)` | `(a) \|\| (b)` | `(!empty($a)) \|\| (!empty($b))` |
| `(not a)` | `!(a)` | `empty($a)` |

---

## 9. Field Editing (Inline vs Sidebar)

### The `{{#field}}` Marker

When a template wraps content in `{{#field "path"}}...{{/field}}`, the compiler enables **inline editing** for that field on the editor canvas. The decision of whether a field appears in the sidebar or inline is based on this marker:

- **Has `{{#field}}`** → inline editing on the canvas; **removed** from the sidebar
- **No `{{#field}}`** → sidebar-only control (standard WordPress editor controls)

### Inline-Editable Types

| Type | Inline Component | Behavior |
|------|-----------------|----------|
| `text` | `<RichText tagName="span">` | Plain text editing with no formatting |
| `richtext` | `<InnerBlocks>` | Full block editor content (paragraphs, headings, etc.) |
| `image` | `<Image>` (10up) | Click to select/replace media |
| `link` | `<HandoffLinkField>` | `RichText` for label + `Popover`/`LinkControl` for URL |
| `button` | `<HandoffLinkField>` | Same as link, mapping to `href`/`target` properties |

### HandoffLinkField Component

For `link` and `button` fields, the compiler generates a `HandoffLinkField` component that mirrors the WordPress core Button block pattern:

1. A `<RichText>` for the label text (inline contenteditable)
2. A `<Popover>` anchored to the field, containing a `<LinkControl>` for URL editing
3. The popover opens on click and only renders when `isSelected` is true
4. The original Handoff markup (e.g., `<a>` tag with classes) is preserved

### Sidebar-Only Types

These types never have inline equivalents:

- `number` → `RangeControl`
- `boolean` → `ToggleControl`
- `select` → `SelectControl`
- `array` → `Repeater` (10up)
- `object` → Nested field controls

### Special Cases

- `<a>` tags have their `href` attribute stripped in the editor to prevent navigation and allow click-to-edit
- Only one `<InnerBlocks>` is allowed per block; subsequent `richtext` fields become no-ops in the editor
- `BlockControls` with `MediaReplaceFlow` is always generated for image fields (toolbar-level, independent of sidebar)

---

## 10. Dynamic Arrays

Array fields can be configured for dynamic post population via `DynamicArrayConfig` in `handoff-wp.config.json`.

### Modes

| Mode | Description |
|------|-------------|
| `static` | Manual content entered through the Repeater UI |
| `query` | Posts fetched via WP_Query with taxonomy filters, ordering, and pagination |
| `manual` | Specific posts selected by the user via search |

### Additional Attributes

For each dynamic array field `items`, the compiler adds:

| Attribute | Type | Purpose |
|-----------|------|---------|
| `itemsSource` | `string` | Mode: `'static'`, `'query'`, or `'manual'` |
| `itemsPostType` | `string` | WordPress post type to query |
| `itemsSelectedPosts` | `array` | Manually selected post IDs |
| `itemsQueryArgs` | `object` | WP_Query arguments |
| `itemsFieldMapping` | `object` | Post field → template field mapping |
| `itemsItemOverrides` | `object` | Per-field overrides applied to all items |
| `itemsRenderMode` | `string` | `'mapped'` or `'template'` |
| `itemsPaginationEnabled` | `boolean` | Whether to show pagination (if configured) |

### Field Mapping

Maps WordPress post fields to Handoff template fields:

```json
{
  "title": "post_title",
  "image": "featured_image",
  "url": "permalink",
  "cta_label": { "type": "static", "value": "Read More" },
  "category": { "type": "taxonomy", "taxonomy": "category", "format": "first" }
}
```

### Editor Preview

In the editor, dynamic arrays use `useSelect` with `@wordpress/core-data` to fetch and display live post data. A loading spinner shows while posts are resolving.

### Server-Side Rendering

In `render.php`, dynamic arrays generate a `WP_Query` (for query mode) or `get_posts()` (for manual mode) and map results through the field mapping configuration.

---

## 11. Styles

### Editor Styles (`editor.scss`)

Generated styles for the editor preview:

```scss
.{component-id}-editor-preview {
  min-height: 120px;
  position: relative;
  // ...
}

.handoff-editable-field {
  cursor: text;
  outline: 1px dashed transparent;
  &:hover { outline-color: var(--wp-admin-theme-color); }
  &:focus { outline-style: solid; }
}
```

Includes styles for the Repeater component (10up Block Components).

### Frontend Styles (`style.scss`)

Scans the template for CSS class names and generates minimal structural fallbacks. Most styling comes from the theme's shared design system styles.

---

## 12. Shared Components

The compiler generates shared utility components in `shared/components/`:

### DynamicPostSelector

A unified post selection UI that combines query building and manual post selection. Supports:
- Post type selection
- Taxonomy filtering with `FormTokenField`
- Ordering and pagination controls
- Manual post search via `ComboboxControl`
- Per-item field overrides

### PostSelector (legacy)

Manual post selection with search, drag-to-reorder, and multi-select.

### PostQueryBuilder (legacy)

Query builder UI for constructing WP_Query arguments.

### Layout Components

All layout previously using `__experimental` WordPress components has been replaced with stable alternatives:
- `VStack` → `<Flex direction="column" gap={N}>`
- `HStack` → `<Flex align="..." gap={N}>`
- `Text` → `<span style={{...}}>` with appropriate styles
- `Divider` → `<hr>` with border styling

---

## 13. Pipeline Steps

The full compilation pipeline, in order:

1. **Load configuration** — Read `handoff-wp.config.json` for API URL, output paths, and dynamic array configs
2. **Fetch component** — GET from Handoff API (`/api/component/{name}.json`)
3. **Validate template** — Check that template variables match property definitions
4. **Generate block.json** — Map properties to Gutenberg attributes with defaults
5. **Generate index.js** — Transpile Handlebars to JSX, build sidebar controls, detect inline fields
6. **Generate render.php** — Transpile Handlebars to PHP, generate attribute extraction
7. **Generate editor.scss** — Editor preview styles with editable field highlights
8. **Generate style.scss** — Frontend structural styles
9. **Generate README.md** — Block documentation with property table
10. **Generate shared components** — Shared index files (once per compilation run)
11. **Generate categories PHP** — Block category registration (once per compilation run)
12. **Format output** — Run Prettier on generated JS/SCSS files
13. **Write files** — Output to the configured directory structure

### Directory Structure

```
output/
├── blocks/
│   └── {component-id}/
│       ├── block.json
│       ├── index.js
│       ├── render.php
│       ├── editor.scss
│       ├── style.scss
│       └── README.md
├── shared/
│   ├── index.js
│   ├── components/
│   │   ├── index.js
│   │   ├── DynamicPostSelector.js
│   │   └── DynamicPostSelector.editor.scss
│   └── utils/
│       ├── index.js
│       └── mapPostEntityToItem.js
├── handoff-blocks.php          (plugin main file)
└── handoff-block-categories.php (category registration)
```
