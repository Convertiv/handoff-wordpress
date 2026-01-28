/**
 * Generates render.php for server-side rendering
 * Converts Handlebars templates to PHP
 */

import { HandoffComponent, HandoffProperty } from '../types';
import { toCamelCase } from './handlebars-to-jsx';

/**
 * Convert JS array/object to PHP array syntax
 */
const arrayToPhp = (value: any): string => {
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (Array.isArray(value)) {
    const items = value.map(v => arrayToPhp(v)).join(', ');
    return `[${items}]`;
  }
  
  if (typeof value === 'object') {
    const pairs = Object.entries(value)
      .map(([k, v]) => `'${k}' => ${arrayToPhp(v)}`)
      .join(', ');
    return `[${pairs}]`;
  }
  
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  return String(value);
};

/**
 * Get PHP default value for a property
 */
const getPhpDefaultValue = (property: HandoffProperty): string => {
  switch (property.type) {
    case 'text':
    case 'richtext':
    case 'select':
      return property.default ? `'${String(property.default).replace(/'/g, "\\'")}'` : "''";
    
    case 'number':
      return String(property.default ?? 0);
    
    case 'boolean':
      return property.default ? 'true' : 'false';
    
    case 'image':
      return "['src' => '', 'alt' => '']";
    
    case 'link':
      return "['label' => '', 'url' => '']";
    
    case 'object':
      if (property.default) {
        return arrayToPhp(property.default);
      }
      return '[]';
    
    case 'array':
      if (property.default || property.items?.default) {
        return arrayToPhp(property.default || property.items?.default || []);
      }
      return '[]';
    
    default:
      return "''";
  }
};

/**
 * Convert handlebars template to PHP
 */
const handlebarsToPhp = (template: string, properties: Record<string, HandoffProperty>): string => {
  let php = template;
  
  // Remove HTML wrapper if present
  php = php.replace(/<html[\s\S]*?<body[^>]*>/gi, '');
  php = php.replace(/<\/body>[\s\S]*?<\/html>/gi, '');
  php = php.replace(/<head>[\s\S]*?<\/head>/gi, '');
  php = php.replace(/\{\{\{?style\}\}\}?/g, '');
  php = php.replace(/\{\{\{?script\}\}\}?/g, '');
  
  // Remove HTML comments
  php = php.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove {{!-- comments --}}
  php = php.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
  php = php.replace(/\{\{![\s\S]*?\}\}/g, '');
  
  // Remove Handoff-specific {{#field}} blocks but keep their content
  // Use a global regex that handles various quote styles and whitespace
  // Remove Handoff-specific {{#field}} blocks but keep their content
  // Allow for whitespace variations like {{#field ...}}, {{ #field ...}}, {{/field}}, {{/field }}, {{ /field }}
  php = php.replace(/\{\{\s*#field\s+[^\}]+\}\}/gi, '');
  php = php.replace(/\{\{\s*\/field\s*\}\}/gi, '');
  
  // Convert style with handlebars expressions
  // Keep 'src' as-is to match Handoff's image property naming
  php = php.replace(
    /style="background-image:url\('?\{\{+\s*properties\.(\w+)\.(\w+)\s*\}+\}'?\)"/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      return `<?php echo !empty($${camelProp}['${field}']) ? 'style="background-image:url(\\'' . esc_url($${camelProp}['${field}']) . '\\')"' : ''; ?>`;
    }
  );
  
  // Convert inline style with opacity
  php = php.replace(
    /style="opacity:\s*\.?\d+"/g,
    'style="opacity: <?php echo esc_attr($overlayOpacity); ?>"'
  );
  
  // Track loop aliases for later reference conversion
  // Format: {{#each properties.xxx as |aliasName|}}
  const loopAliases: Record<string, string> = {};
  
  // Convert {{#each properties.xxx as |alias|}} loops with named alias
  // Also set $_loop_count for @last checking
  php = php.replace(
    /\{\{#each\s+properties\.(\w+)\s+as\s+\|(\w+)\|\s*\}\}/g,
    (_, prop, alias) => {
      const camelProp = toCamelCase(prop);
      loopAliases[alias] = camelProp;
      return `<?php if (!empty($${camelProp})) : $_loop_count = count($${camelProp}); foreach ($${camelProp} as $index => $item) : ?>`;
    }
  );
  
  // Convert {{#each properties.xxx}} loops without alias
  // Also set $_loop_count for @last checking
  php = php.replace(
    /\{\{#each\s+properties\.(\w+)[^}]*\}\}/g,
    (_, prop) => {
      const camelProp = toCamelCase(prop);
      return `<?php if (!empty($${camelProp})) : $_loop_count = count($${camelProp}); foreach ($${camelProp} as $index => $item) : ?>`;
    }
  );
  
  // Convert {{#each this.xxx}} nested loops
  // Use $_nested_loop_count for nested @last checking
  php = php.replace(
    /\{\{#each\s+this\.(\w+)[^}]*\}\}/g,
    (_, prop) => {
      return `<?php if (!empty($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    }
  );
  
  php = php.replace(/\{\{\/each\}\}/g, '<?php endforeach; endif; ?>');
  
  // IMPORTANT: Handle attribute-specific patterns FIRST before generic ones
  // Handle properties.xxx.yyy patterns FIRST, then alias patterns for loops
  
  // Convert src="{{properties.xxx.yyy}}" patterns (top-level nested properties)
  php = php.replace(
    /src="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      return `src="<?php echo esc_url($${camelProp}['${field}'] ?? ''); ?>"`;
    }
  );
  
  // Convert alt="{{properties.xxx.yyy}}" patterns
  php = php.replace(
    /alt="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      return `alt="<?php echo esc_attr($${camelProp}['${field}'] ?? ''); ?>"`;
    }
  );
  
  // Convert href="{{properties.xxx.yyy}}" patterns
  php = php.replace(
    /href="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      return `href="<?php echo esc_url($${camelProp}['${field}'] ?? '#'); ?>"`;
    }
  );
  
  // Now handle alias patterns for loops: src="{{alias.xxx.yyy}}", alt="{{alias.xxx.yyy}}", href="{{alias.xxx.yyy}}"
  
  // Convert src="{{alias.xxx.yyy}}" patterns (images in loops)
  php = php.replace(
    /src="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g,
    (match, alias, field1, field2) => {
      // Skip if already converted or if it's a properties pattern
      if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
        return match;
      }
      return `src="<?php echo esc_url($item['${field1}']['${field2}'] ?? ''); ?>"`;
    }
  );
  
  // Convert alt="{{alias.xxx.yyy}}" patterns
  php = php.replace(
    /alt="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g,
    (match, alias, field1, field2) => {
      if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
        return match;
      }
      return `alt="<?php echo esc_attr($item['${field1}']['${field2}'] ?? ''); ?>"`;
    }
  );
  
  // Convert href="{{alias.xxx.yyy}}" patterns (links in loops with nested fields)
  php = php.replace(
    /href="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g,
    (match, alias, field1, field2) => {
      if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
        return match;
      }
      return `href="<?php echo esc_url($item['${field1}']['${field2}'] ?? ''); ?>"`;
    }
  );
  
  // Convert {{alias.field.subfield}} and {{alias.field}} references from named loop variables
  // Must handle deeper nesting first (alias.field.subfield before alias.field)
  // IMPORTANT: Handle triple-brace (rich text) BEFORE double-brace patterns
  for (const [alias] of Object.entries(loopAliases)) {
    // Handle {{{ alias.field }}} triple-brace patterns (rich text/HTML in loops)
    const aliasTripleRegex = new RegExp(`\\{\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}\\}`, 'g');
    php = php.replace(aliasTripleRegex, (_, field) => {
      return `<?php echo wp_kses_post($item['${field}'] ?? ''); ?>`;
    });
    
    // Handle {{#if alias.field}} conditionals (e.g., {{#if paginationItem.active}})
    const aliasIfRegex = new RegExp(`\\{\\{#if\\s+${alias}\\.(\\w+)\\s*\\}\\}`, 'g');
    php = php.replace(aliasIfRegex, (_, field) => {
      return `<?php if (!empty($item['${field}'])) : ?>`;
    });
    
    // Handle {{ alias.field.subfield }} patterns (e.g., {{ card.image.src }})
    const aliasDeepRegex = new RegExp(`\\{\\{\\s*${alias}\\.(\\w+)\\.(\\w+)\\s*\\}\\}`, 'g');
    php = php.replace(aliasDeepRegex, (_, field1, field2) => {
      const escFunc = field2 === 'url' || field2 === 'src' || field2 === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($item['${field1}']['${field2}'] ?? ''); ?>`;
    });
    
    // Handle {{ alias.field }} patterns (e.g., {{ card.title }})
    const aliasRegex = new RegExp(`\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}`, 'g');
    php = php.replace(aliasRegex, (_, field) => {
      const escFunc = field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($item['${field}'] ?? ''); ?>`;
    });
  }
  
  // Convert {{#unless @first}} - show content for all items except the first
  php = php.replace(
    /\{\{#unless\s+@first\s*\}\}/g,
    `<?php if ($index > 0) : ?>`
  );
  
  // Convert {{#unless @last}} - show content for all items except the last
  // Uses $_loop_count set in the foreach loop
  php = php.replace(
    /\{\{#unless\s+@last\s*\}\}/g,
    `<?php if ($index < $_loop_count - 1) : ?>`
  );
  
  // Convert {{#if @first}} - show content only for the first item
  php = php.replace(
    /\{\{#if\s+@first\s*\}\}/g,
    `<?php if ($index === 0) : ?>`
  );
  
  // Convert {{#if @last}} - show content only for the last item
  // Uses $_loop_count set in the foreach loop
  php = php.replace(
    /\{\{#if\s+@last\s*\}\}/g,
    `<?php if ($index === $_loop_count - 1) : ?>`
  );
  
  php = php.replace(/\{\{\/unless\}\}/g, '<?php endif; ?>');
  
  // Convert {{#if this.xxx}} conditionals inside loops
  php = php.replace(
    /\{\{#if\s+this\.(\w+)\}\}/g,
    (_, field) => `<?php if (!empty($item['${field}'])) : ?>`
  );
  
  // Convert {{#if alias.field}} for any remaining loop variable conditionals
  // This catches cases where the alias wasn't tracked (e.g., nested loops or untracked aliases)
  php = php.replace(
    /\{\{#if\s+(\w+)\.(\w+)\s*\}\}/g,
    (match, alias, field) => {
      // Skip if it looks like properties.xxx (already handled)
      if (alias === 'properties' || alias === 'this') {
        return match;
      }
      return `<?php if (!empty($item['${field}'])) : ?>`;
    }
  );
  
  // Helper to parse Handlebars helper expressions like (eq properties.layout "layout-1")
  // and convert to PHP comparison expressions
  const parseHelperToPhp = (expr: string): string | null => {
    // Match (eq left "right") - equals with quoted string
    const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (eqMatch) {
      const [, left, right] = eqMatch;
      let leftExpr: string;
      if (left.startsWith('properties.')) {
        const parts = left.replace('properties.', '').split('.');
        const camelProp = toCamelCase(parts[0]);
        if (parts.length > 1) {
          leftExpr = `$${camelProp}['${parts.slice(1).join("']['")}']`;
        } else {
          leftExpr = `$${camelProp}`;
        }
      } else if (left.startsWith('this.')) {
        leftExpr = `$item['${left.replace('this.', '')}']`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      return `(${leftExpr} ?? '') === '${right}'`;
    }
    
    // Match (eq left variable) without quotes
    const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)"]+)\s*\)$/);
    if (eqVarMatch) {
      const [, left, right] = eqVarMatch;
      let leftExpr: string, rightExpr: string;
      
      if (left.startsWith('properties.')) {
        const parts = left.replace('properties.', '').split('.');
        const camelProp = toCamelCase(parts[0]);
        leftExpr = parts.length > 1 ? `$${camelProp}['${parts.slice(1).join("']['")}']` : `$${camelProp}`;
      } else if (left.startsWith('this.')) {
        leftExpr = `$item['${left.replace('this.', '')}']`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      
      if (right.startsWith('properties.')) {
        const parts = right.replace('properties.', '').split('.');
        const camelProp = toCamelCase(parts[0]);
        rightExpr = parts.length > 1 ? `$${camelProp}['${parts.slice(1).join("']['")}']` : `$${camelProp}`;
      } else if (right.startsWith('this.')) {
        rightExpr = `$item['${right.replace('this.', '')}']`;
      } else {
        rightExpr = `$item['${right}']`;
      }
      
      return `(${leftExpr} ?? '') === (${rightExpr} ?? '')`;
    }
    
    // Match (ne left "right") - not equals
    const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (neMatch) {
      const [, left, right] = neMatch;
      let leftExpr: string;
      if (left.startsWith('properties.')) {
        const parts = left.replace('properties.', '').split('.');
        const camelProp = toCamelCase(parts[0]);
        leftExpr = parts.length > 1 ? `$${camelProp}['${parts.slice(1).join("']['")}']` : `$${camelProp}`;
      } else if (left.startsWith('this.')) {
        leftExpr = `$item['${left.replace('this.', '')}']`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      return `(${leftExpr} ?? '') !== '${right}'`;
    }
    
    // Match (gt left right) - greater than
    const gtMatch = expr.match(/^\(\s*gt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (gtMatch) {
      const [, left, right] = gtMatch;
      let leftExpr: string;
      if (left.startsWith('properties.')) {
        const camelProp = toCamelCase(left.replace('properties.', ''));
        leftExpr = `$${camelProp}`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      return `(${leftExpr} ?? 0) > ${right}`;
    }
    
    // Match (lt left right) - less than
    const ltMatch = expr.match(/^\(\s*lt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (ltMatch) {
      const [, left, right] = ltMatch;
      let leftExpr: string;
      if (left.startsWith('properties.')) {
        const camelProp = toCamelCase(left.replace('properties.', ''));
        leftExpr = `$${camelProp}`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      return `(${leftExpr} ?? 0) < ${right}`;
    }
    
    // Match (gte left right) - greater than or equal
    const gteMatch = expr.match(/^\(\s*gte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (gteMatch) {
      const [, left, right] = gteMatch;
      let leftExpr: string;
      if (left.startsWith('properties.')) {
        const camelProp = toCamelCase(left.replace('properties.', ''));
        leftExpr = `$${camelProp}`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      return `(${leftExpr} ?? 0) >= ${right}`;
    }
    
    // Match (lte left right) - less than or equal
    const lteMatch = expr.match(/^\(\s*lte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (lteMatch) {
      const [, left, right] = lteMatch;
      let leftExpr: string;
      if (left.startsWith('properties.')) {
        const camelProp = toCamelCase(left.replace('properties.', ''));
        leftExpr = `$${camelProp}`;
      } else {
        leftExpr = `$item['${left}']`;
      }
      return `(${leftExpr} ?? 0) <= ${right}`;
    }
    
    return null;
  };
  
  // Convert {{#if (eq/ne/gt/lt/etc ...)}} helper expressions with if/else
  php = php.replace(
    /\{\{#if\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, helperExpr, ifContent, elseContent) => {
      const phpCondition = parseHelperToPhp(helperExpr);
      if (phpCondition) {
        return `<?php if (${phpCondition}) : ?>${ifContent}<?php else : ?>${elseContent}<?php endif; ?>`;
      }
      return `<?php if (false) : ?>${ifContent}<?php else : ?>${elseContent}<?php endif; ?>`;
    }
  );
  
  // Convert {{#if (eq/ne/gt/lt/etc ...)}} helper expressions without else
  php = php.replace(
    /\{\{#if\s+(\([^)]+\))\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, helperExpr, ifContent) => {
      const phpCondition = parseHelperToPhp(helperExpr);
      if (phpCondition) {
        return `<?php if (${phpCondition}) : ?>${ifContent}<?php endif; ?>`;
      }
      return `<?php if (false) : ?>${ifContent}<?php endif; ?>`;
    }
  );
  
  // Convert {{#if properties.xxx.yyy}} conditionals
  php = php.replace(
    /\{\{#if\s+properties\.(\w+)\.(\w+)\}\}/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      return `<?php if (!empty($${camelProp}['${field}'])) : ?>`;
    }
  );
  
  // Convert {{#if properties.xxx}} conditionals
  php = php.replace(
    /\{\{#if\s+properties\.(\w+)\}\}/g,
    (_, prop) => {
      const camelProp = toCamelCase(prop);
      return `<?php if (!empty($${camelProp})) : ?>`;
    }
  );
  
  // Handle {{else}} separately (for cases not caught by the combined patterns above)
  php = php.replace(/\{\{else\}\}/g, '<?php else : ?>');
  
  php = php.replace(/\{\{\/if\}\}/g, '<?php endif; ?>');
  
  // IMPORTANT: Convert triple-brace expressions FIRST (before double-brace)
  // Triple braces are for unescaped HTML output (rich text fields)
  
  // Convert {{{properties.xxx}}} triple braces (unescaped HTML)
  php = php.replace(
    /\{\{\{\s*properties\.(\w+)\s*\}\}\}/g,
    (_, prop) => {
      const camelProp = toCamelCase(prop);
      return `<?php echo wp_kses_post($${camelProp} ?? ''); ?>`;
    }
  );
  
  // Convert {{{this.xxx}}} triple braces for loop items
  php = php.replace(
    /\{\{\{\s*this\.(\w+)\s*\}\}\}/g,
    (_, field) => {
      return `<?php echo wp_kses_post($item['${field}'] ?? ''); ?>`;
    }
  );
  
  // Convert {{{alias.xxx}}} triple braces for named loop aliases
  // This catches any remaining alias.field patterns with triple braces
  php = php.replace(
    /\{\{\{\s*(\w+)\.(\w+)\s*\}\}\}/g,
    (match, alias, field) => {
      // Skip if it looks like properties.xxx or this.xxx (already handled)
      if (alias === 'properties' || alias === 'this') {
        return match;
      }
      return `<?php echo wp_kses_post($item['${field}'] ?? ''); ?>`;
    }
  );
  
  // Convert {{{this}}} for scalar arrays with HTML content
  php = php.replace(
    /\{\{\{\s*this\s*\}\}\}/g,
    '<?php echo wp_kses_post($subItem ?? $item ?? \'\'); ?>'
  );
  
  // Convert {{this}} simple reference (for scalar arrays)
  php = php.replace(
    /\{\{\s*this\s*\}\}/g,
    '<?php echo esc_html($subItem ?? $item ?? \'\'); ?>'
  );
  
  // Convert {{this.xxx.yyy}} deep nested references
  php = php.replace(
    /\{\{\s*this\.(\w+)\.(\w+)\s*\}\}/g,
    (_, field1, field2) => {
      const escFunc = field2 === 'url' || field2 === 'src' || field2 === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($item['${field1}']['${field2}'] ?? ''); ?>`;
    }
  );
  
  // Convert {{this.xxx}} references
  php = php.replace(
    /\{\{\s*this\.(\w+)\s*\}\}/g,
    (_, field) => {
      const escFunc = field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($item['${field}'] ?? ''); ?>`;
    }
  );
  
  // Convert {{properties.xxx.yyy.zzz}} deeply nested property access
  php = php.replace(
    /\{\{\s*properties\.(\w+)\.(\w+)\.(\w+)\s*\}\}/g,
    (_, prop, field1, field2) => {
      const camelProp = toCamelCase(prop);
      const escFunc = field2 === 'url' || field2 === 'src' || field2 === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($${camelProp}['${field1}']['${field2}'] ?? ''); ?>`;
    }
  );
  
  // Convert {{properties.xxx.yyy}} nested property access
  php = php.replace(
    /\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      const escFunc = field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($${camelProp}['${field}'] ?? ''); ?>`;
    }
  );
  
  // Convert {{properties.xxx}} simple property access
  php = php.replace(
    /\{\{\s*properties\.(\w+)\s*\}\}/g,
    (_, prop) => {
      const camelProp = toCamelCase(prop);
      return `<?php echo esc_html($${camelProp} ?? ''); ?>`;
    }
  );
  
  // Convert remaining {{xxx.yyy}} patterns (likely loop item references without this.)
  php = php.replace(
    /\{\{+\s*(\w+)\.(\w+)\s*\}+\}/g,
    (_, obj, field) => {
      // Skip if it looks like a PHP expression
      if (obj.includes('$') || obj.includes('php')) return `{{${obj}.${field}}}`;
      const escFunc = field === 'url' || field === 'src' || field === 'href' || field === 'label' ? 
        (field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html') : 'esc_html';
      return `<?php echo ${escFunc}($item['${field}'] ?? ''); ?>`;
    }
  );
  
  // Convert href="{{properties.xxx.yyy}}" patterns specifically
  php = php.replace(
    /href="\{\{\s*properties\.(\w+)\.(\w+)\s*\}\}"/g,
    (_, prop, field) => {
      const camelProp = toCamelCase(prop);
      return `href="<?php echo esc_url($${camelProp}['${field}'] ?? '#'); ?>"`;
    }
  );
  
  // Convert href="{{properties.xxx}}" patterns
  php = php.replace(
    /href="\{\{\s*properties\.(\w+)\s*\}\}"/g,
    (_, prop) => {
      const camelProp = toCamelCase(prop);
      return `href="<?php echo esc_url($${camelProp} ?? '#'); ?>"`;
    }
  );
  
  // Convert remaining href="{{...}}" patterns (for loop item references)
  php = php.replace(
    /href="\{\{+([^}]+)\}+\}"/g,
    (_, expr) => {
      if (expr.includes('<?php')) return `href="${expr}"`;
      // Check if it's a this.xxx pattern
      const thisMatch = expr.match(/^\s*this\.(\w+)(?:\.(\w+))?\s*$/);
      if (thisMatch) {
        const [, field1, field2] = thisMatch;
        if (field2) {
          return `href="<?php echo esc_url($item['${field1}']['${field2}'] ?? '#'); ?>"`;
        }
        return `href="<?php echo esc_url($item['${field1}'] ?? '#'); ?>"`;
      }
      return 'href="<?php echo esc_url($item[\'url\'] ?? $item[\'link\'][\'url\'] ?? \'#\'); ?>"';
    }
  );
  
  // Clean up any stray curly braces around PHP echo statements
  php = php.replace(/\{(<\?php echo)/g, '$1');
  php = php.replace(/(; \?>)\}/g, '$1');
  
  return php.trim();
};

/**
 * Generate attribute extraction code
 */
const generateAttributeExtraction = (properties: Record<string, HandoffProperty>, hasOverlay: boolean): string => {
  const extractions: string[] = [];
  
  for (const [key, property] of Object.entries(properties)) {
    const camelKey = toCamelCase(key);
    const defaultValue = getPhpDefaultValue(property);
    
    extractions.push(`$${camelKey} = isset($attributes['${camelKey}']) ? $attributes['${camelKey}'] : ${defaultValue};`);
  }
  
  // Add overlay opacity if detected
  if (hasOverlay) {
    extractions.push(`$overlayOpacity = isset($attributes['overlayOpacity']) ? $attributes['overlayOpacity'] : 0.6;`);
  }
  
  return extractions.join('\n');
};

/**
 * Wrap template with block wrapper that handles alignment
 * Adds the alignment class (alignnone, alignwide, alignfull) based on block settings
 */
const wrapWithBlockWrapper = (template: string, componentId: string): string => {
  // Convert component ID to class name (snake_case to kebab-case)
  const className = componentId.replace(/_/g, '-');
  
  // Wrap the template in a div that uses WordPress's block wrapper attributes
  // This handles alignment classes automatically
  return `<div <?php echo get_block_wrapper_attributes(['class' => '${className}']); ?>>
${template}
</div>`;
};

/**
 * Generate complete render.php file
 */
const generateRenderPhp = (component: HandoffComponent): string => {
  const hasOverlay = component.code.includes('overlay');
  const attributeExtraction = generateAttributeExtraction(component.properties, hasOverlay);
  const templatePhp = handlebarsToPhp(component.code, component.properties);
  
  // Wrap the template with block wrapper for alignment support
  const wrappedTemplate = wrapWithBlockWrapper(templatePhp, component.id);
  
  return `<?php
/**
 * Server-side rendering for ${component.title}
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Block default content.
 * @param WP_Block $block      Block instance.
 * @return string Returns the block markup.
 */

if (!defined('ABSPATH')) {
  exit;
}

if (!isset($attributes)) {
  $attributes = [];
}

// Extract attributes with defaults
${attributeExtraction}

?>
${wrappedTemplate}
`;
};

export { generateRenderPhp, handlebarsToPhp, arrayToPhp };
