"use strict";
/**
 * Generates PHP theme templates from Handoff components
 * Used for header, footer, and other theme template parts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTemplatePartPhp = exports.generateFooterPhp = exports.generateHeaderPhp = void 0;
const render_php_1 = require("./render-php");
const handlebars_to_jsx_1 = require("./handlebars-to-jsx");
/**
 * Generate WordPress header.php template
 */
const generateHeaderPhp = (component) => {
    // Get the template and convert to PHP
    const template = component.code;
    const properties = component.properties;
    // Get generic preview values for defaults
    const previewValues = component.previews?.generic?.values || {};
    // Convert handlebars to PHP
    let templatePhp = (0, render_php_1.handlebarsToPhp)(template, properties);
    // Remove html/body wrapper tags that might be in the template
    templatePhp = templatePhp.replace(/<html[^>]*>/gi, '');
    templatePhp = templatePhp.replace(/<\/html>/gi, '');
    templatePhp = templatePhp.replace(/<head>[\s\S]*?<\/head>/gi, '');
    templatePhp = templatePhp.replace(/<body[^>]*>/gi, '');
    templatePhp = templatePhp.replace(/<\/body>/gi, '');
    // Build PHP variable declarations from properties with defaults from preview
    const varDeclarations = [];
    for (const [key, property] of Object.entries(properties)) {
        const varName = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const defaultValue = previewValues[key] ?? property.default;
        const phpValue = (0, render_php_1.arrayToPhp)(defaultValue);
        varDeclarations.push(`$${varName} = ${phpValue};`);
    }
    return `<?php
/**
 * The header for the theme
 * Transpiled from Handoff component: ${component.id}
 *
 * @package Handoff Fetch
 * @since 1.0.0
 */

// Default values from component (can be overridden via theme options or customizer)
${varDeclarations.join('\n')}

// Allow theme customization via filter
$header_data = apply_filters('handoff_header_data', [
${Object.keys(properties).map(key => `  '${(0, handlebars_to_jsx_1.toCamelCase)(key)}' => $${(0, handlebars_to_jsx_1.toCamelCase)(key)},`).join('\n')}
]);
extract($header_data);
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="profile" href="https://gmpg.org/xfn/11">
    <?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<div id="page" class="site">
    <a class="skip-link screen-reader-text" href="#main">
        <?php esc_html_e('Skip to content', 'handoff'); ?>
    </a>

${templatePhp.trim()}

    <div id="content" class="site-content">
`;
};
exports.generateHeaderPhp = generateHeaderPhp;
/**
 * Generate WordPress footer.php template
 */
const generateFooterPhp = (component) => {
    // Get the template and convert to PHP
    const template = component.code;
    const properties = component.properties;
    // Get generic preview values for defaults
    const previewValues = component.previews?.generic?.values || {};
    // Convert handlebars to PHP
    let templatePhp = (0, render_php_1.handlebarsToPhp)(template, properties);
    // Remove html/body wrapper tags that might be in the template
    templatePhp = templatePhp.replace(/<html[^>]*>/gi, '');
    templatePhp = templatePhp.replace(/<\/html>/gi, '');
    templatePhp = templatePhp.replace(/<head>[\s\S]*?<\/head>/gi, '');
    templatePhp = templatePhp.replace(/<body[^>]*>/gi, '');
    templatePhp = templatePhp.replace(/<\/body>/gi, '');
    // Build PHP variable declarations from properties with defaults from preview
    const varDeclarations = [];
    for (const [key, property] of Object.entries(properties)) {
        const varName = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const defaultValue = previewValues[key] ?? property.default;
        const phpValue = (0, render_php_1.arrayToPhp)(defaultValue);
        varDeclarations.push(`$${varName} = ${phpValue};`);
    }
    return `<?php
/**
 * The footer for the theme
 * Transpiled from Handoff component: ${component.id}
 *
 * @package Handoff Fetch
 * @since 1.0.0
 */

// Default values from component (can be overridden via theme options or customizer)
${varDeclarations.join('\n')}

// Allow theme customization via filter
$footer_data = apply_filters('handoff_footer_data', [
${Object.keys(properties).map(key => `  '${(0, handlebars_to_jsx_1.toCamelCase)(key)}' => $${(0, handlebars_to_jsx_1.toCamelCase)(key)},`).join('\n')}
]);
extract($footer_data);
?>

    </div><!-- #content -->

${templatePhp.trim()}

<?php wp_footer(); ?>

</div><!-- #page -->
</body>
</html>
`;
};
exports.generateFooterPhp = generateFooterPhp;
/**
 * Generate a generic theme template part
 */
const generateTemplatePartPhp = (component, templateType) => {
    // Get the template and convert to PHP
    const template = component.code;
    const properties = component.properties;
    // Get generic preview values for defaults
    const previewValues = component.previews?.generic?.values || {};
    // Convert handlebars to PHP
    let templatePhp = (0, render_php_1.handlebarsToPhp)(template, properties);
    // Remove html/body wrapper tags that might be in the template
    templatePhp = templatePhp.replace(/<html[^>]*>/gi, '');
    templatePhp = templatePhp.replace(/<\/html>/gi, '');
    templatePhp = templatePhp.replace(/<head>[\s\S]*?<\/head>/gi, '');
    templatePhp = templatePhp.replace(/<body[^>]*>/gi, '');
    templatePhp = templatePhp.replace(/<\/body>/gi, '');
    // Build PHP variable declarations from properties with defaults from preview
    const varDeclarations = [];
    for (const [key, property] of Object.entries(properties)) {
        const varName = (0, handlebars_to_jsx_1.toCamelCase)(key);
        const defaultValue = previewValues[key] ?? property.default;
        const phpValue = (0, render_php_1.arrayToPhp)(defaultValue);
        varDeclarations.push(`$${varName} = ${phpValue};`);
    }
    return `<?php
/**
 * Template Part: ${component.title}
 * Transpiled from Handoff component: ${component.id}
 *
 * @package Handoff Fetch
 * @since 1.0.0
 */

// Default values from component
${varDeclarations.join('\n')}

// Allow customization via filter
$${templateType}_data = apply_filters('handoff_${templateType}_data', [
${Object.keys(properties).map(key => `  '${(0, handlebars_to_jsx_1.toCamelCase)(key)}' => $${(0, handlebars_to_jsx_1.toCamelCase)(key)},`).join('\n')}
]);
extract($${templateType}_data);
?>

${templatePhp.trim()}
`;
};
exports.generateTemplatePartPhp = generateTemplatePartPhp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWUtdGVtcGxhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2VuZXJhdG9ycy90aGVtZS10ZW1wbGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUFHSCw2Q0FBMkQ7QUFDM0QsMkRBQWtEO0FBRWxEOztHQUVHO0FBQ0gsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFNBQTJCLEVBQVUsRUFBRTtJQUNoRSxzQ0FBc0M7SUFDdEMsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQztJQUNoQyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO0lBRXhDLDBDQUEwQztJQUMxQyxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLElBQUksRUFBRSxDQUFDO0lBRWhFLDRCQUE0QjtJQUM1QixJQUFJLFdBQVcsR0FBRyxJQUFBLDRCQUFlLEVBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBRXhELDhEQUE4RDtJQUM5RCxXQUFXLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDdkQsV0FBVyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELFdBQVcsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLDBCQUEwQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLFdBQVcsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN2RCxXQUFXLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFcEQsNkVBQTZFO0lBQzdFLE1BQU0sZUFBZSxHQUFhLEVBQUUsQ0FBQztJQUNyQyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLElBQUksTUFBTSxDQUFD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LENBQUM7UUFDekQsTUFBTSxPQUFPLEdBQUcsSUFBQSwrQkFBVyxFQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDO1FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUEsdUJBQVUsRUFBQyxZQUFZLENBQUMsQ0FBQztRQUMxQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksT0FBTyxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVELE9BQU87O29CQUVXLFNBQVMsQ0FBQyxLQUFLO3dDQUNLLFNBQVMsQ0FBQyxFQUFFOzs7Ozs7O0VBT2xELGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDOzs7R0FHekIsWUFBWSxrQ0FBa0MsWUFBWTtFQUMzRCxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sSUFBQSwrQkFBVyxFQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUEsK0JBQVcsRUFBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQzs7V0FFeEYsWUFBWTs7O0VBR3JCLFdBQVcsQ0FBQyxJQUFJLEVBQUU7Q0FDbkIsQ0FBQztBQUNGLENBQUMsQ0FBQztBQUU2QywwREFBdUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyYXRlcyBQSFAgdGhlbWUgdGVtcGxhdGVzIGZyb20gSGFuZG9mZiBjb21wb25lbnRzXG4gKiBVc2VkIGZvciBoZWFkZXIsIGZvb3RlciwgYW5kIG90aGVyIHRoZW1lIHRlbXBsYXRlIHBhcnRzXG4gKi9cblxuaW1wb3J0IHsgSGFuZG9mZkNvbXBvbmVudCwgSGFuZG9mZlByb3BlcnR5IH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgaGFuZGxlYmFyc1RvUGhwLCBhcnJheVRvUGhwIH0gZnJvbSAnLi9yZW5kZXItcGhwJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi9oYW5kbGViYXJzLXRvLWpzeCc7XG5cbi8qKlxuICogR2VuZXJhdGUgV29yZFByZXNzIGhlYWRlci5waHAgdGVtcGxhdGVcbiAqL1xuY29uc3QgZ2VuZXJhdGVIZWFkZXJQaHAgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50KTogc3RyaW5nID0+IHtcbiAgLy8gR2V0IHRoZSB0ZW1wbGF0ZSBhbmQgY29udmVydCB0byBQSFBcbiAgY29uc3QgdGVtcGxhdGUgPSBjb21wb25lbnQuY29kZTtcbiAgY29uc3QgcHJvcGVydGllcyA9IGNvbXBvbmVudC5wcm9wZXJ0aWVzO1xuICBcbiAgLy8gR2V0IGdlbmVyaWMgcHJldmlldyB2YWx1ZXMgZm9yIGRlZmF1bHRzXG4gIGNvbnN0IHByZXZpZXdWYWx1ZXMgPSBjb21wb25lbnQucHJldmlld3M/LmdlbmVyaWM/LnZhbHVlcyB8fCB7fTtcbiAgXG4gIC8vIENvbnZlcnQgaGFuZGxlYmFycyB0byBQSFBcbiAgbGV0IHRlbXBsYXRlUGhwID0gaGFuZGxlYmFyc1RvUGhwKHRlbXBsYXRlLCBwcm9wZXJ0aWVzKTtcbiAgXG4gIC8vIFJlbW92ZSBodG1sL2JvZHkgd3JhcHBlciB0YWdzIHRoYXQgbWlnaHQgYmUgaW4gdGhlIHRlbXBsYXRlXG4gIHRlbXBsYXRlUGhwID0gdGVtcGxhdGVQaHAucmVwbGFjZSgvPGh0bWxbXj5dKj4vZ2ksICcnKTtcbiAgdGVtcGxhdGVQaHAgPSB0ZW1wbGF0ZVBocC5yZXBsYWNlKC88XFwvaHRtbD4vZ2ksICcnKTtcbiAgdGVtcGxhdGVQaHAgPSB0ZW1wbGF0ZVBocC5yZXBsYWNlKC88aGVhZD5bXFxzXFxTXSo/PFxcL2hlYWQ+L2dpLCAnJyk7XG4gIHRlbXBsYXRlUGhwID0gdGVtcGxhdGVQaHAucmVwbGFjZSgvPGJvZHlbXj5dKj4vZ2ksICcnKTtcbiAgdGVtcGxhdGVQaHAgPSB0ZW1wbGF0ZVBocC5yZXBsYWNlKC88XFwvYm9keT4vZ2ksICcnKTtcbiAgXG4gIC8vIEJ1aWxkIFBIUCB2YXJpYWJsZSBkZWNsYXJhdGlvbnMgZnJvbSBwcm9wZXJ0aWVzIHdpdGggZGVmYXVsdHMgZnJvbSBwcmV2aWV3XG4gIGNvbnN0IHZhckRlY2xhcmF0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcbiAgICBjb25zdCB2YXJOYW1lID0gdG9DYW1lbENhc2Uoa2V5KTtcbiAgICBjb25zdCBkZWZhdWx0VmFsdWUgPSBwcmV2aWV3VmFsdWVzW2tleV0gPz8gcHJvcGVydHkuZGVmYXVsdDtcbiAgICBjb25zdCBwaHBWYWx1ZSA9IGFycmF5VG9QaHAoZGVmYXVsdFZhbHVlKTtcbiAgICB2YXJEZWNsYXJhdGlvbnMucHVzaChgJCR7dmFyTmFtZX0gPSAke3BocFZhbHVlfTtgKTtcbiAgfVxuICBcbiAgcmV0dXJuIGA8P3BocFxuLyoqXG4gKiBUaGUgaGVhZGVyIGZvciB0aGUgdGhlbWVcbiAqIFRyYW5zcGlsZWQgZnJvbSBIYW5kb2ZmIGNvbXBvbmVudDogJHtjb21wb25lbnQuaWR9XG4gKlxuICogQHBhY2thZ2UgSGFuZG9mZiBGZXRjaFxuICogQHNpbmNlIDEuMC4wXG4gKi9cblxuLy8gRGVmYXVsdCB2YWx1ZXMgZnJvbSBjb21wb25lbnQgKGNhbiBiZSBvdmVycmlkZGVuIHZpYSB0aGVtZSBvcHRpb25zIG9yIGN1c3RvbWl6ZXIpXG4ke3ZhckRlY2xhcmF0aW9ucy5qb2luKCdcXG4nKX1cblxuLy8gQWxsb3cgdGhlbWUgY3VzdG9taXphdGlvbiB2aWEgZmlsdGVyXG4kaGVhZGVyX2RhdGEgPSBhcHBseV9maWx0ZXJzKCdoYW5kb2ZmX2hlYWRlcl9kYXRhJywgW1xuJHtPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5tYXAoa2V5ID0+IGAgICcke3RvQ2FtZWxDYXNlKGtleSl9JyA9PiAkJHt0b0NhbWVsQ2FzZShrZXkpfSxgKS5qb2luKCdcXG4nKX1cbl0pO1xuZXh0cmFjdCgkaGVhZGVyX2RhdGEpO1xuPz5cbjwhRE9DVFlQRSBodG1sPlxuPGh0bWwgPD9waHAgbGFuZ3VhZ2VfYXR0cmlidXRlcygpOyA/Pj5cbjxoZWFkPlxuICAgIDxtZXRhIGNoYXJzZXQ9XCI8P3BocCBibG9naW5mbygnY2hhcnNldCcpOyA/PlwiPlxuICAgIDxtZXRhIG5hbWU9XCJ2aWV3cG9ydFwiIGNvbnRlbnQ9XCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MS4wXCI+XG4gICAgPGxpbmsgcmVsPVwicHJvZmlsZVwiIGhyZWY9XCJodHRwczovL2dtcGcub3JnL3hmbi8xMVwiPlxuICAgIDw/cGhwIHdwX2hlYWQoKTsgPz5cbjwvaGVhZD5cblxuPGJvZHkgPD9waHAgYm9keV9jbGFzcygpOyA/Pj5cbjw/cGhwIHdwX2JvZHlfb3BlbigpOyA/PlxuXG48ZGl2IGlkPVwicGFnZVwiIGNsYXNzPVwic2l0ZVwiPlxuICAgIDxhIGNsYXNzPVwic2tpcC1saW5rIHNjcmVlbi1yZWFkZXItdGV4dFwiIGhyZWY9XCIjbWFpblwiPlxuICAgICAgICA8P3BocCBlc2NfaHRtbF9lKCdTa2lwIHRvIGNvbnRlbnQnLCAnaGFuZG9mZicpOyA/PlxuICAgIDwvYT5cblxuJHt0ZW1wbGF0ZVBocC50cmltKCl9XG5cbiAgICA8ZGl2IGlkPVwiY29udGVudFwiIGNsYXNzPVwic2l0ZS1jb250ZW50XCI+XG5gO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSBXb3JkUHJlc3MgZm9vdGVyLnBocCB0ZW1wbGF0ZVxuICovXG5jb25zdCBnZW5lcmF0ZUZvb3RlclBocCA9IChjb21wb25lbnQ6IEhhbmRvZmZDb21wb25lbnQpOiBzdHJpbmcgPT4ge1xuICAvLyBHZXQgdGhlIHRlbXBsYXRlIGFuZCBjb252ZXJ0IHRvIFBIUFxuICBjb25zdCB0ZW1wbGF0ZSA9IGNvbXBvbmVudC5jb2RlO1xuICBjb25zdCBwcm9wZXJ0aWVzID0gY29tcG9uZW50LnByb3BlcnRpZXM7XG4gIFxuICAvLyBHZXQgZ2VuZXJpYyBwcmV2aWV3IHZhbHVlcyBmb3IgZGVmYXVsdHNcbiAgY29uc3QgcHJldmlld1ZhbHVlcyA9IGNvbXBvbmVudC5wcmV2aWV3cz8uZ2VuZXJpYz8udmFsdWVzIHx8IHt9O1xuICBcbiAgLy8gQ29udmVydCBoYW5kbGViYXJzIHRvIFBIUFxuICBsZXQgdGVtcGxhdGVQaHAgPSBoYW5kbGViYXJzVG9QaHAodGVtcGxhdGUsIHByb3BlcnRpZXMpO1xuICBcbiAgLy8gUmVtb3ZlIGh0bWwvYm9keSB3cmFwcGVyIHRhZ3MgdGhhdCBtaWdodCBiZSBpbiB0aGUgdGVtcGxhdGVcbiAgdGVtcGxhdGVQaHAgPSB0ZW1wbGF0ZVBocC5yZXBsYWNlKC88aHRtbFtePl0qPi9naSwgJycpO1xuICB0ZW1wbGF0ZVBocCA9IHRlbXBsYXRlUGhwLnJlcGxhY2UoLzxcXC9odG1sPi9naSwgJycpO1xuICB0ZW1wbGF0ZVBocCA9IHRlbXBsYXRlUGhwLnJlcGxhY2UoLzxoZWFkPltcXHNcXFNdKj88XFwvaGVhZD4vZ2ksICcnKTtcbiAgdGVtcGxhdGVQaHAgPSB0ZW1wbGF0ZVBocC5yZXBsYWNlKC88Ym9keVtePl0qPi9naSwgJycpO1xuICB0ZW1wbGF0ZVBocCA9IHRlbXBsYXRlUGhwLnJlcGxhY2UoLzxcXC9ib2R5Pi9naSwgJycpO1xuICBcbiAgLy8gQnVpbGQgUEhQIHZhcmlhYmxlIGRlY2xhcmF0aW9ucyBmcm9tIHByb3BlcnRpZXMgd2l0aCBkZWZhdWx0cyBmcm9tIHByZXZpZXdcbiAgY29uc3QgdmFyRGVjbGFyYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuICAgIGNvbnN0IHZhck5hbWUgPSB0b0NhbWVsQ2FzZShrZXkpO1xuICAgIGNvbnN0IGRlZmF1bHRWYWx1ZSA9IHByZXZpZXdWYWx1ZXNba2V5XSA/PyBwcm9wZXJ0eS5kZWZhdWx0O1xuICAgIGNvbnN0IHBocFZhbHVlID0gYXJyYXlUb1BocChkZWZhdWx0VmFsdWUpO1xuICAgIHZhckRlY2xhcmF0aW9ucy5wdXNoKGAkJHt2YXJOYW1lfSA9ICR7cGhwVmFsdWV9O2ApO1xuICB9XG4gIFxuICByZXR1cm4gYDw/cGhwXG4vKipcbiAqIFRoZSBmb290ZXIgZm9yIHRoZSB0aGVtZVxuICogVHJhbnNwaWxlZCBmcm9tIEhhbmRvZmYgY29tcG9uZW50OiAke2NvbXBvbmVudC5pZH1cbiAqXG4gKiBAcGFja2FnZSBIYW5kb2ZmIEZldGNoXG4gKiBAc2luY2UgMS4wLjBcbiAqL1xuXG4vLyBEZWZhdWx0IHZhbHVlcyBmcm9tIGNvbXBvbmVudCAoY2FuIGJlIG92ZXJyaWRkZW4gdmlhIHRoZW1lIG9wdGlvbnMgb3IgY3VzdG9taXplcilcbiR7dmFyRGVjbGFyYXRpb25zLmpvaW4oJ1xcbicpfVxuXG4vLyBBbGxvdyB0aGVtZSBjdXN0b21pemF0aW9uIHZpYSBmaWx0ZXJcbiRmb290ZXJfZGF0YSA9IGFwcGx5X2ZpbHRlcnMoJ2hhbmRvZmZfZm9vdGVyX2RhdGEnLCBbXG4ke09iamVjdC5rZXlzKHByb3BlcnRpZXMpLm1hcChrZXkgPT4gYCAgJyR7dG9DYW1lbENhc2Uoa2V5KX0nID0+ICQke3RvQ2FtZWxDYXNlKGtleSl9LGApLmpvaW4oJ1xcbicpfVxuXSk7XG5leHRyYWN0KCRmb290ZXJfZGF0YSk7XG4/PlxuXG4gICAgPC9kaXY+PCEtLSAjY29udGVudCAtLT5cblxuJHt0ZW1wbGF0ZVBocC50cmltKCl9XG5cbjw/cGhwIHdwX2Zvb3RlcigpOyA/PlxuXG48L2Rpdj48IS0tICNwYWdlIC0tPlxuPC9ib2R5PlxuPC9odG1sPlxuYDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgYSBnZW5lcmljIHRoZW1lIHRlbXBsYXRlIHBhcnRcbiAqL1xuY29uc3QgZ2VuZXJhdGVUZW1wbGF0ZVBhcnRQaHAgPSAoY29tcG9uZW50OiBIYW5kb2ZmQ29tcG9uZW50LCB0ZW1wbGF0ZVR5cGU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIC8vIEdldCB0aGUgdGVtcGxhdGUgYW5kIGNvbnZlcnQgdG8gUEhQXG4gIGNvbnN0IHRlbXBsYXRlID0gY29tcG9uZW50LmNvZGU7XG4gIGNvbnN0IHByb3BlcnRpZXMgPSBjb21wb25lbnQucHJvcGVydGllcztcbiAgXG4gIC8vIEdldCBnZW5lcmljIHByZXZpZXcgdmFsdWVzIGZvciBkZWZhdWx0c1xuICBjb25zdCBwcmV2aWV3VmFsdWVzID0gY29tcG9uZW50LnByZXZpZXdzPy5nZW5lcmljPy52YWx1ZXMgfHwge307XG4gIFxuICAvLyBDb252ZXJ0IGhhbmRsZWJhcnMgdG8gUEhQXG4gIGxldCB0ZW1wbGF0ZVBocCA9IGhhbmRsZWJhcnNUb1BocCh0ZW1wbGF0ZSwgcHJvcGVydGllcyk7XG4gIFxuICAvLyBSZW1vdmUgaHRtbC9ib2R5IHdyYXBwZXIgdGFncyB0aGF0IG1pZ2h0IGJlIGluIHRoZSB0ZW1wbGF0ZVxuICB0ZW1wbGF0ZVBocCA9IHRlbXBsYXRlUGhwLnJlcGxhY2UoLzxodG1sW14+XSo+L2dpLCAnJyk7XG4gIHRlbXBsYXRlUGhwID0gdGVtcGxhdGVQaHAucmVwbGFjZSgvPFxcL2h0bWw+L2dpLCAnJyk7XG4gIHRlbXBsYXRlUGhwID0gdGVtcGxhdGVQaHAucmVwbGFjZSgvPGhlYWQ+W1xcc1xcU10qPzxcXC9oZWFkPi9naSwgJycpO1xuICB0ZW1wbGF0ZVBocCA9IHRlbXBsYXRlUGhwLnJlcGxhY2UoLzxib2R5W14+XSo+L2dpLCAnJyk7XG4gIHRlbXBsYXRlUGhwID0gdGVtcGxhdGVQaHAucmVwbGFjZSgvPFxcL2JvZHk+L2dpLCAnJyk7XG4gIFxuICAvLyBCdWlsZCBQSFAgdmFyaWFibGUgZGVjbGFyYXRpb25zIGZyb20gcHJvcGVydGllcyB3aXRoIGRlZmF1bHRzIGZyb20gcHJldmlld1xuICBjb25zdCB2YXJEZWNsYXJhdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG4gICAgY29uc3QgdmFyTmFtZSA9IHRvQ2FtZWxDYXNlKGtleSk7XG4gICAgY29uc3QgZGVmYXVsdFZhbHVlID0gcHJldmlld1ZhbHVlc1trZXldID8/IHByb3BlcnR5LmRlZmF1bHQ7XG4gICAgY29uc3QgcGhwVmFsdWUgPSBhcnJheVRvUGhwKGRlZmF1bHRWYWx1ZSk7XG4gICAgdmFyRGVjbGFyYXRpb25zLnB1c2goYCQke3Zhck5hbWV9ID0gJHtwaHBWYWx1ZX07YCk7XG4gIH1cbiAgXG4gIHJldHVybiBgPD9waHBcbi8qKlxuICogVGVtcGxhdGUgUGFydDogJHtjb21wb25lbnQudGl0bGV9XG4gKiBUcmFuc3BpbGVkIGZyb20gSGFuZG9mZiBjb21wb25lbnQ6ICR7Y29tcG9uZW50LmlkfVxuICpcbiAqIEBwYWNrYWdlIEhhbmRvZmYgRmV0Y2hcbiAqIEBzaW5jZSAxLjAuMFxuICovXG5cbi8vIERlZmF1bHQgdmFsdWVzIGZyb20gY29tcG9uZW50XG4ke3ZhckRlY2xhcmF0aW9ucy5qb2luKCdcXG4nKX1cblxuLy8gQWxsb3cgY3VzdG9taXphdGlvbiB2aWEgZmlsdGVyXG4kJHt0ZW1wbGF0ZVR5cGV9X2RhdGEgPSBhcHBseV9maWx0ZXJzKCdoYW5kb2ZmXyR7dGVtcGxhdGVUeXBlfV9kYXRhJywgW1xuJHtPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5tYXAoa2V5ID0+IGAgICcke3RvQ2FtZWxDYXNlKGtleSl9JyA9PiAkJHt0b0NhbWVsQ2FzZShrZXkpfSxgKS5qb2luKCdcXG4nKX1cbl0pO1xuZXh0cmFjdCgkJHt0ZW1wbGF0ZVR5cGV9X2RhdGEpO1xuPz5cblxuJHt0ZW1wbGF0ZVBocC50cmltKCl9XG5gO1xufTtcblxuZXhwb3J0IHsgZ2VuZXJhdGVIZWFkZXJQaHAsIGdlbmVyYXRlRm9vdGVyUGhwLCBnZW5lcmF0ZVRlbXBsYXRlUGFydFBocCB9O1xuIl19