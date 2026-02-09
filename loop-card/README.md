# Loop Card Block

A standalone post card block that can be used individually or within WordPress's Query Loop block.

## Features

- Works standalone or within Query Loop
- Four card styles: Default, Minimal, Overlay, Horizontal
- Template part support for custom rendering
- Custom fields display (ACF compatible)
- Server-side rendering for consistent output

---

## Usage Modes

### 1. Standalone Mode

Use the block anywhere to display a single post:

```html
<!-- wp:ridebalkans/loop-card {
    "postId": 123,
    "postType": "post",
    "cardStyle": "overlay"
} /-->
```

Select the post using the ContentPicker in the block settings.

### 2. Within Query Loop

Use inside WordPress's Query Loop block. The card automatically receives the post context:

```html
<!-- wp:query {"queryId":1,"query":{"postType":"post","perPage":6}} -->
<div class="wp-block-query">
    <!-- wp:post-template -->
        <!-- wp:ridebalkans/loop-card {"cardStyle":"default"} /-->
    <!-- /wp:post-template -->
</div>
<!-- /wp:query -->
```

### 3. Within Loop Block

The Loop block can use Loop Card's rendering internally by setting `renderMode: "loop-card"`. In this case, all card settings are controlled at the Loop block level.

---

## Template Override Priority

When **Use Template Part** is enabled:

```
1. theme/template-parts/loop-card/content-{post_type}.php
2. theme/template-parts/loop-card/content.php
3. theme/template-parts/loop/content-{post_type}.php  ← shared with Loop block
4. theme/template-parts/loop/content.php              ← shared with Loop block
5. plugin/blocks/loop/templates/content-{post_type}.php
6. plugin/blocks/loop/templates/content.php
7. Default card rendering (fallback)
```

This allows you to create templates that work with both the Loop block and Loop Card block.

---

## Block Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `postId` | number | 0 | Post ID (standalone mode) |
| `postType` | string | "post" | Post type slug |
| `useTemplate` | boolean | false | Use template parts |
| `cardStyle` | string | "default" | Card style variant |
| `showImage` | boolean | true | Show featured image |
| `imageSize` | string | "large" | WordPress image size |
| `imageAspectRatio` | string | "16/9" | CSS aspect ratio |
| `showTitle` | boolean | true | Show post title |
| `titleTag` | string | "h3" | Title HTML tag |
| `showExcerpt` | boolean | true | Show excerpt |
| `excerptLength` | number | 20 | Excerpt word count |
| `showDate` | boolean | true | Show publish date |
| `showAuthor` | boolean | false | Show author name |
| `showCategories` | boolean | false | Show category badges |
| `showReadMore` | boolean | true | Show read more link |
| `readMoreText` | string | "Read More" | Read more button text |
| `customFields` | array | [] | Custom fields to display |
| `linkEntireCard` | boolean | false | Make entire card clickable |

---

## CSS Classes

```css
.wp-block-ridebalkans-loop-card     /* Block wrapper */
.rb-loop-card-wrapper               /* Additional wrapper */
.rb-loop-card-wrapper--{style}      /* Style variant on wrapper */

.rb-loop-card                       /* Card element */
.rb-loop-card--default              /* Default style */
.rb-loop-card--minimal              /* Minimal style */
.rb-loop-card--overlay              /* Overlay style */
.rb-loop-card--horizontal           /* Horizontal style */

.rb-loop-card__image                /* Image container */
.rb-loop-card__img                  /* Image element */
.rb-loop-card__overlay              /* Gradient overlay */
.rb-loop-card__categories           /* Category container */
.rb-loop-card__category             /* Category badge */

.rb-loop-card__content              /* Content wrapper */
.rb-loop-card__meta                 /* Meta info wrapper */
.rb-loop-card__date                 /* Date element */
.rb-loop-card__author               /* Author element */
.rb-loop-card__title                /* Title element */
.rb-loop-card__excerpt              /* Excerpt element */
.rb-loop-card__fields               /* Custom fields wrapper */
.rb-loop-card__field                /* Single field */
.rb-loop-card__field-label          /* Field label */
.rb-loop-card__field-value          /* Field value */
.rb-loop-card__readmore             /* Read more link */
.rb-loop-card__readmore-icon        /* Read more arrow */
```

---

## Custom Fields

Configure custom fields in block settings:

```json
[
    { "key": "price", "label": "Price", "type": "price" },
    { "key": "length", "label": "Length", "type": "number", "suffix": " m" },
    { "key": "weight", "type": "number", "suffix": " kg" },
    { "key": "location", "label": "Location", "type": "text" }
]
```

### Field Properties

| Property | Description | Example |
|----------|-------------|---------|
| `key` | Meta key or ACF field name | `"length"` |
| `label` | Display label (optional) | `"Length"` |
| `type` | Formatting type | `"number"` |
| `prefix` | Text before value | `"€"`, `"From "` |
| `suffix` | Text after value | `" m"`, `" kg"`, `"%"` |

### Supported Types

| Type | Output |
|------|--------|
| `text` | Plain text |
| `number` | Formatted number |
| `price` | €1,234.00 |
| `date` | Formatted date |
| `image` | Image tag |
| `link` | Anchor tag |

---

## Comparison: Loop Block vs Loop Card Block

| Feature | Loop Block | Loop Card Block |
|---------|------------|-----------------|
| Multiple posts | ✓ | Single post only |
| Query builder | ✓ | Uses parent or manual |
| Layout options | Grid, Slider, List | N/A (single card) |
| Card settings | Controls all cards | Controls one instance |
| Query Loop support | N/A | ✓ (receives context) |
| Standalone use | N/A | ✓ |
| Shared templates | ✓ | ✓ |

---

## Example: Featured Post Hero

```html
<!-- wp:ridebalkans/loop-card {
    "postId": 42,
    "postType": "post",
    "cardStyle": "overlay",
    "imageSize": "full",
    "imageAspectRatio": "21/9",
    "titleTag": "h1",
    "showCategories": true,
    "showAuthor": true,
    "showReadMore": false
} /-->
```
