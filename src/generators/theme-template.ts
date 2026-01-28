/**
 * Generates PHP theme templates from Handoff components
 * Used for header, footer, and other theme template parts
 */

import { HandoffComponent, HandoffProperty } from '../types';
import { handlebarsToPhp, arrayToPhp } from './render-php';
import { toCamelCase } from './handlebars-to-jsx';

/**
 * Generate WordPress header.php template
 */
const generateHeaderPhp = (component: HandoffComponent): string => {
  // Get the template and convert to PHP
  const template = component.code;
  const properties = component.properties;
  
  // Get generic preview values for defaults
  const previewValues = component.previews?.generic?.values || {};
  
  // Convert handlebars to PHP
  let templatePhp = handlebarsToPhp(template, properties);
  
  // Remove html/body wrapper tags that might be in the template
  templatePhp = templatePhp.replace(/<html[^>]*>/gi, '');
  templatePhp = templatePhp.replace(/<\/html>/gi, '');
  templatePhp = templatePhp.replace(/<head>[\s\S]*?<\/head>/gi, '');
  templatePhp = templatePhp.replace(/<body[^>]*>/gi, '');
  templatePhp = templatePhp.replace(/<\/body>/gi, '');
  
  // Build PHP variable declarations from properties with defaults from preview
  const varDeclarations: string[] = [];
  for (const [key, property] of Object.entries(properties)) {
    const varName = toCamelCase(key);
    const defaultValue = previewValues[key] ?? property.default;
    const phpValue = arrayToPhp(defaultValue);
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
${Object.keys(properties).map(key => `  '${toCamelCase(key)}' => $${toCamelCase(key)},`).join('\n')}
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

/**
 * Generate WordPress footer.php template
 */
const generateFooterPhp = (component: HandoffComponent): string => {
  // Get the template and convert to PHP
  const template = component.code;
  const properties = component.properties;
  
  // Get generic preview values for defaults
  const previewValues = component.previews?.generic?.values || {};
  
  // Convert handlebars to PHP
  let templatePhp = handlebarsToPhp(template, properties);
  
  // Remove html/body wrapper tags that might be in the template
  templatePhp = templatePhp.replace(/<html[^>]*>/gi, '');
  templatePhp = templatePhp.replace(/<\/html>/gi, '');
  templatePhp = templatePhp.replace(/<head>[\s\S]*?<\/head>/gi, '');
  templatePhp = templatePhp.replace(/<body[^>]*>/gi, '');
  templatePhp = templatePhp.replace(/<\/body>/gi, '');
  
  // Build PHP variable declarations from properties with defaults from preview
  const varDeclarations: string[] = [];
  for (const [key, property] of Object.entries(properties)) {
    const varName = toCamelCase(key);
    const defaultValue = previewValues[key] ?? property.default;
    const phpValue = arrayToPhp(defaultValue);
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
${Object.keys(properties).map(key => `  '${toCamelCase(key)}' => $${toCamelCase(key)},`).join('\n')}
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

/**
 * Generate a generic theme template part
 */
const generateTemplatePartPhp = (component: HandoffComponent, templateType: string): string => {
  // Get the template and convert to PHP
  const template = component.code;
  const properties = component.properties;
  
  // Get generic preview values for defaults
  const previewValues = component.previews?.generic?.values || {};
  
  // Convert handlebars to PHP
  let templatePhp = handlebarsToPhp(template, properties);
  
  // Remove html/body wrapper tags that might be in the template
  templatePhp = templatePhp.replace(/<html[^>]*>/gi, '');
  templatePhp = templatePhp.replace(/<\/html>/gi, '');
  templatePhp = templatePhp.replace(/<head>[\s\S]*?<\/head>/gi, '');
  templatePhp = templatePhp.replace(/<body[^>]*>/gi, '');
  templatePhp = templatePhp.replace(/<\/body>/gi, '');
  
  // Build PHP variable declarations from properties with defaults from preview
  const varDeclarations: string[] = [];
  for (const [key, property] of Object.entries(properties)) {
    const varName = toCamelCase(key);
    const defaultValue = previewValues[key] ?? property.default;
    const phpValue = arrayToPhp(defaultValue);
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
${Object.keys(properties).map(key => `  '${toCamelCase(key)}' => $${toCamelCase(key)},`).join('\n')}
]);
extract($${templateType}_data);
?>

${templatePhp.trim()}
`;
};

export { generateHeaderPhp, generateFooterPhp, generateTemplatePartPhp };
