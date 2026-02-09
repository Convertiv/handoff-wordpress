# Loop Card Templates

This directory contains template parts for the Loop Card block. When "Template" mode is selected in the block settings, these templates are used to render each post item. Both the Loop block and Loop Card block use these templates.

## Template Naming Convention

Templates follow the naming pattern: `{template_name}-{post_type}.php`

Examples:
- `content-post.php` - Default content template for posts
- `content-camper.php` - Default content template for campers
- `featured-post.php` - Featured layout template for posts
- `card-motorcycle.php` - Card layout template for motorcycles

## Template Headers

Similar to WordPress page templates, you can add a file header to give your template a friendly name and description:

```php
<?php
/**
 * Template Name: Featured Card with Overlay
 * Description: Large image with gradient overlay and centered title.
 */
```

- **Template Name**: Displayed in the template selector dropdown
- **Description**: Shown as help text (optional)

If no header is provided, the filename is converted to a label (e.g., `featured-card-post.php` → "Featured Card").

## Template Hierarchy

Templates are searched in the following order:

1. **Child theme** (highest priority)
   `your-theme/template-parts/loop-card/{template}-{post_type}.php`

2. **Parent theme**
   `parent-theme/template-parts/loop-card/{template}-{post_type}.php`

3. **Plugin** (fallback)
   `ridebalkans-blocks/blocks/loop-card/templates/{template}-{post_type}.php`

## Available Templates

| Template | Post Type | Template Name |
|----------|-----------|---------------|
| `content-post.php` | post | Content Card |
| `content-page.php` | page | Page Card |
| `content-camper.php` | camper | Camper Vehicle Card |
| `content-motorcycle.php` | motorcycle | Motorcycle Card |
| `content-offroad.php` | offroad | Offroad Vehicle Card |

## Creating a Custom Template

### Step 1: Create the template file

Create a new file in your theme following the naming convention:
```
your-theme/template-parts/loop-card/{name}-{post_type}.php
```

Examples:
- `your-theme/template-parts/loop-card/featured-post.php`
- `your-theme/template-parts/loop-card/minimal-camper.php`

### Step 2: Add the template header

```php
<?php
/**
 * Template Name: Your Template Name
 * Description: Brief description of what this template does.
 *
 * @var array $loop_item {
 *     @type int    $post_id   The current post ID.
 *     @type string $post_type The current post type.
 *     @type array  $args      Card rendering arguments.
 * }
 */

if (! defined('ABSPATH')) {
    exit;
}

// Extract variables
$post_id   = $loop_item['post_id'];
$post_type = $loop_item['post_type'];
$args      = $loop_item['args'];

// Get post data
$permalink = get_permalink($post_id);
$title     = get_the_title($post_id);
$has_thumb = has_post_thumbnail($post_id);

// Get custom meta (supports ACF)
$get_field = function_exists('get_field') ? 'get_field' : function ($key, $id) {
    return get_post_meta($id, $key, true);
};

$custom_field = $get_field('your_field_name', $post_id);
?>

<article class="rb-card rb-card--<?php echo esc_attr($args['card_style']); ?>">
    <!-- Your custom HTML here -->
</article>
```

## Available $args Keys

| Key | Type | Description |
|-----|------|-------------|
| `card_style` | string | Card style: default, minimal, overlay, horizontal |
| `use_templates` | bool | Whether templates are enabled |
| `show_image` | bool | Whether to show the featured image |
| `image_size` | string | WordPress image size slug |
| `show_title` | bool | Whether to show the title |
| `show_excerpt` | bool | Whether to show the excerpt |
| `show_meta` | bool | Whether to show meta (date, author) |
| `show_read_more` | bool | Whether to show read more link |
| `read_more_text` | string | Read more button text |
| `image_aspect_ratio` | string | CSS aspect ratio (e.g., "16/9") |
| `excerpt_length` | int | Number of words in excerpt |
| `custom_fields` | array | Custom fields to display |

## Available Hooks

### `ridebalkans_loop_card_before`
Fires before the card content.

```php
add_action('ridebalkans_loop_card_before', function($post_id, $args) {
    // Add content before the card
}, 10, 2);
```

### `ridebalkans_loop_card_meta`
Fires inside the meta section.

```php
add_action('ridebalkans_loop_card_meta', function($post_id, $args) {
    // Add custom meta items
}, 10, 2);
```

### `ridebalkans_loop_card_content`
Fires inside the content section.

```php
add_action('ridebalkans_loop_card_content', function($post_id, $args) {
    // Add custom content
}, 10, 2);
```

### `ridebalkans_loop_card_after`
Fires after the card content.

```php
add_action('ridebalkans_loop_card_after', function($post_id, $args) {
    // Add content after the card
}, 10, 2);
```

## Helper Functions

### `ridebalkans_card_render_custom_fields($post_id, $fields)`
Renders custom fields defined in the block settings.

```php
<?php if (! empty($args['custom_fields'])) : ?>
    <?php ridebalkans_card_render_custom_fields($post_id, $args['custom_fields']); ?>
<?php endif; ?>
```

## CSS Classes

All templates should use the BEM-style class naming:

- `.rb-loop__card` - Main card container
- `.rb-loop__card--{style}` - Card style modifier
- `.rb-loop__card--type-{post_type}` - Post type modifier
- `.rb-loop__card-image` - Image wrapper
- `.rb-loop__card-content` - Content wrapper
- `.rb-loop__card-title` - Title
- `.rb-loop__card-excerpt` - Excerpt
- `.rb-loop__card-meta` - Meta container
- `.rb-loop__card-footer` - Footer with price/button
- `.rb-loop__card-badge` - Badge elements
- `.rb-loop__card-specs` - Specs grid (vehicles)
- `.rb-loop__card-fields` - Custom fields container
