# Handoff WordPress Theme

A custom WordPress theme that integrates the Handoff design system with CSS and JavaScript components.

## Features

- Integrates Handoff design system CSS (`main.css`)
- Integrates Handoff design system JavaScript (`main.js`)
- Full Gutenberg block editor support
- Compatible with Handoff Gutenberg blocks
- Responsive design with mobile-first approach
- Accessible and semantic HTML5 markup
- Custom navigation menus (Primary & Footer)
- Widget areas (Sidebar & Footer)
- Post thumbnails support
- Custom logo support
- SEO-friendly structure

## Installation

1. Copy the `theme` folder to your WordPress installation's `wp-content/themes/` directory
2. Log into WordPress admin
3. Navigate to **Appearance > Themes**
4. Find "Handoff Theme" and click "Activate"

## Theme Structure

```
theme/
├── assets/
│   ├── css/
│   │   └── main.css          # Handoff design system styles
│   ├── js/
│   │   └── main.js           # Handoff design system scripts
│   ├── images/               # Theme images
│   └── fonts/                # Custom fonts
├── template-parts/
│   ├── content.php           # Default post template
│   ├── content-single.php    # Single post template
│   ├── content-page.php      # Page template
│   └── content-none.php      # No results template
├── style.css                 # Theme header (required by WordPress)
├── functions.php             # Theme functions and hooks
├── index.php                 # Main template file
├── header.php                # Header template
├── footer.php                # Footer template
├── sidebar.php               # Sidebar template
├── single.php                # Single post template
├── page.php                  # Page template
└── README.md                 # This file
```

## Design System Integration

The theme automatically loads:
- **CSS**: `assets/css/main.css` - Complete Handoff design system styles
- **JS**: `assets/js/main.js` - Handoff component JavaScript

These files are copied from the Handoff public API and include:
- All component styles
- Grid system (o-container, o-row, o-col-*)
- Utility classes
- Typography
- Color system
- Spacing utilities
- Component JavaScript functionality

## Using with Gutenberg Blocks

This theme is designed to work seamlessly with Handoff Gutenberg blocks:

1. Install and activate Handoff block plugins
2. Create a new page or post
3. Add Handoff blocks from the "Handoff Blocks" category
4. The theme styles will automatically apply

## Customization

### Menus

Set up menus in **Appearance > Menus**:
- **Primary Menu**: Main navigation in header
- **Footer Menu**: Footer navigation

### Widgets

Add widgets in **Appearance > Widgets**:
- **Primary Sidebar**: Sidebar widget area
- **Footer**: Footer widget area

### Custom Logo

Upload a logo in **Appearance > Customize > Site Identity**

### Colors & Typography

The theme uses the Handoff design system color palette and typography defined in `main.css`.

## Development

### File Locations

Component styles and scripts are pulled from the Handoff API:


To update the design system:
1. Rebuild Handoff: `npm run build` (from root)
2. Copy updated files to theme assets
3. Clear WordPress cache

### Child Theme

To create a child theme:

1. Create a new folder: `handoff-child/`
2. Create `style.css`:

```css
/*
Theme Name: Handoff Child
Template: handoff
*/
```

3. Create `functions.php`:

```php
<?php
function handoff_child_enqueue_styles() {
    wp_enqueue_style('parent-style', get_template_directory_uri() . '/style.css');
}
add_action('wp_enqueue_scripts', 'handoff_child_enqueue_styles');
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Requirements

- WordPress 6.0 or higher
- PHP 7.4 or higher
- Modern browser with JavaScript enabled

## Credits

- **Design System**: Handoff
- **Theme Development**: Handoff Team
- **Built with**: WordPress, Handoff, PHP

## License

This theme is licensed under GPL v2 or later.

## Changelog

### Version 1.0.0
- Initial release
- Handoff design system integration
- Full Gutenberg support
- Responsive layout
- Widget areas
- Custom menus
