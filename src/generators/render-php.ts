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
  
  // Track nested loop aliases separately (these use $subItem instead of $item)
  const nestedLoopAliases: Record<string, string> = {};
  
  // Track nested loop depth for proper variable naming
  let nestedLoopDepth = 0;
  
  // Helper to get the loop item variable name based on depth
  const getLoopItemVar = (depth: number): string => {
    if (depth === 0) return '$item';
    if (depth === 1) return '$subItem';
    return `$nested${depth}Item`;
  };
  
  const getLoopIndexVar = (depth: number): string => {
    if (depth === 0) return '$index';
    if (depth === 1) return '$subIndex';
    return `$nested${depth}Index`;
  };
  
  const getLoopCountVar = (depth: number): string => {
    if (depth === 0) return '$_loop_count';
    if (depth === 1) return '$_nested_loop_count';
    return `$_nested${depth}_loop_count`;
  };
  
  // First pass: identify all nested loop patterns and their aliases
  // We need to process loops in order to properly track nesting
  const eachPatterns: Array<{
    match: string;
    type: 'properties' | 'this' | 'alias';
    arrayPath: string;
    alias?: string;
    parentAlias?: string;
    index: number;
  }> = [];
  
  // Find all {{#each ...}} patterns
  const eachRegex = /\{\{#each\s+([^\}]+)\}\}/g;
  let eachMatch;
  while ((eachMatch = eachRegex.exec(php)) !== null) {
    const content = eachMatch[1].trim();
    let type: 'properties' | 'this' | 'alias';
    let arrayPath: string;
    let alias: string | undefined;
    let parentAlias: string | undefined;
    
    // Check for "as |alias|" syntax
    const asAliasMatch = content.match(/^(.+?)\s+as\s+\|(\w+)\|$/);
    if (asAliasMatch) {
      const pathPart = asAliasMatch[1].trim();
      alias = asAliasMatch[2];
      
      if (pathPart.startsWith('properties.')) {
        type = 'properties';
        arrayPath = pathPart.replace('properties.', '');
      } else if (pathPart.startsWith('this.')) {
        type = 'this';
        arrayPath = pathPart.replace('this.', '');
      } else if (pathPart.includes('.')) {
        // e.g., article.tags - first part is an alias from outer loop
        const parts = pathPart.split('.');
        parentAlias = parts[0];
        arrayPath = parts.slice(1).join('.');
        type = 'alias';
      } else {
        // Just a variable name, treat as alias reference
        type = 'alias';
        arrayPath = pathPart;
      }
    } else {
      // No alias syntax
      if (content.startsWith('properties.')) {
        type = 'properties';
        arrayPath = content.replace('properties.', '').split(/\s/)[0];
      } else if (content.startsWith('this.')) {
        type = 'this';
        arrayPath = content.replace('this.', '').split(/\s/)[0];
      } else if (content.includes('.')) {
        const parts = content.split('.');
        parentAlias = parts[0];
        arrayPath = parts.slice(1).join('.').split(/\s/)[0];
        type = 'alias';
      } else {
        type = 'alias';
        arrayPath = content.split(/\s/)[0];
      }
    }
    
    eachPatterns.push({
      match: eachMatch[0],
      type,
      arrayPath,
      alias,
      parentAlias,
      index: eachMatch.index
    });
  }
  
  // Track which aliases map to which nested depth
  const aliasToDepth: Record<string, number> = {};
  
  // Process loops from first to last (maintaining order)
  // Sort by index to process in order
  eachPatterns.sort((a, b) => a.index - b.index);
  
  // Track current nesting level as we process
  let currentDepth = -1;
  const openLoops: Array<{ depth: number; alias?: string }> = [];
  
  // Find {{/each}} positions
  const closeEachPositions: number[] = [];
  const closeEachRegex = /\{\{\/each\}\}/g;
  let closeMatch;
  while ((closeMatch = closeEachRegex.exec(php)) !== null) {
    closeEachPositions.push(closeMatch.index);
  }
  
  // Assign depth to each pattern based on position relative to other patterns and closes
  for (const pattern of eachPatterns) {
    // Count how many opens before this position
    const opensBefore = eachPatterns.filter(p => p.index < pattern.index).length;
    // Count how many closes before this position
    const closesBefore = closeEachPositions.filter(pos => pos < pattern.index).length;
    const depth = opensBefore - closesBefore;
    
    if (pattern.alias) {
      aliasToDepth[pattern.alias] = depth;
      loopAliases[pattern.alias] = pattern.arrayPath;
    }
  }
  
  // Convert {{#each properties.xxx as |alias|}} or {{#each properties.xxx as |alias index|}} loops with named alias
  // The second parameter (index) is optional and ignored since we use $index in PHP
  // Also set $_loop_count for @last checking
  php = php.replace(
    /\{\{#each\s+properties\.(\w+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g,
    (_, prop, alias) => {
      const camelProp = toCamelCase(prop);
      loopAliases[alias] = camelProp;
      return `<?php if (!empty($${camelProp})) : $_loop_count = count($${camelProp}); foreach ($${camelProp} as $index => $item) : ?>`;
    }
  );
  
  // Convert {{#each properties.xxx}} loops without alias
  // Also set $_loop_count for @last checking
  php = php.replace(
    /\{\{#each\s+properties\.(\w+)\s*\}\}/g,
    (_, prop) => {
      const camelProp = toCamelCase(prop);
      return `<?php if (!empty($${camelProp})) : $_loop_count = count($${camelProp}); foreach ($${camelProp} as $index => $item) : ?>`;
    }
  );
  
  // Convert {{#each this.xxx as |alias|}} or {{#each this.xxx as |alias index|}} nested loops with alias
  // The second parameter (index) is optional and ignored since we use $subIndex in PHP
  php = php.replace(
    /\{\{#each\s+this\.(\w+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g,
    (_, prop, alias) => {
      nestedLoopAliases[alias] = prop;
      return `<?php if (!empty($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    }
  );
  
  // Convert {{#each this.xxx}} nested loops without alias
  // Use $_nested_loop_count for nested @last checking
  php = php.replace(
    /\{\{#each\s+this\.(\w+)\s*\}\}/g,
    (_, prop) => {
      return `<?php if (!empty($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    }
  );
  
  // Convert {{#each alias.xxx as |nestedAlias|}} or {{#each alias.xxx as |nestedAlias index|}} - nested loops referencing outer loop alias
  // e.g., {{#each article.tags as |tag|}} where 'article' is from outer {{#each articles as |article|}}
  // The second parameter (index) is optional and ignored since we use $subIndex in PHP
  php = php.replace(
    /\{\{#each\s+(\w+)\.(\w+)\s+as\s+\|(\w+)(?:\s+\w+)?\|\s*\}\}/g,
    (match, parentAlias, prop, nestedAlias) => {
      // Skip if it's properties.xxx or this.xxx (already handled)
      if (parentAlias === 'properties' || parentAlias === 'this') {
        return match;
      }
      // This is a nested loop referencing an outer loop alias
      nestedLoopAliases[nestedAlias] = prop;
      return `<?php if (!empty($item['${prop}'])) : $_nested_loop_count = count($item['${prop}']); foreach ($item['${prop}'] as $subIndex => $subItem) : ?>`;
    }
  );
  
  // Convert {{#each alias.xxx}} - nested loops referencing outer loop alias without nested alias
  php = php.replace(
    /\{\{#each\s+(\w+)\.(\w+)\s*\}\}/g,
    (match, parentAlias, prop) => {
      // Skip if it's properties.xxx or this.xxx (already handled)
      if (parentAlias === 'properties' || parentAlias === 'this') {
        return match;
      }
      // This is a nested loop referencing an outer loop alias
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
      // Use $subItem for nested loop aliases, $item for top-level
      const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
      return `src="<?php echo esc_url(${itemVar}['${field1}']['${field2}'] ?? ''); ?>"`;
    }
  );
  
  // Convert alt="{{alias.xxx.yyy}}" patterns
  php = php.replace(
    /alt="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g,
    (match, alias, field1, field2) => {
      if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
        return match;
      }
      // Use $subItem for nested loop aliases, $item for top-level
      const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
      return `alt="<?php echo esc_attr(${itemVar}['${field1}']['${field2}'] ?? ''); ?>"`;
    }
  );
  
  // Convert href="{{alias.xxx.yyy}}" patterns (links in loops with nested fields)
  php = php.replace(
    /href="\{\{\s*(\w+)\.(\w+)\.(\w+)\s*\}\}"/g,
    (match, alias, field1, field2) => {
      if (alias === 'properties' || alias === 'this' || match.includes('<?php')) {
        return match;
      }
      // Use $subItem for nested loop aliases, $item for top-level
      const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
      return `href="<?php echo esc_url(${itemVar}['${field1}']['${field2}'] ?? ''); ?>"`;
    }
  );
  
  // Convert {{alias.field.subfield}} and {{alias.field}} references from named loop variables
  // Must handle deeper nesting first (alias.field.subfield before alias.field)
  // IMPORTANT: Handle triple-brace (rich text) BEFORE double-brace patterns
  
  // Process nested loop aliases FIRST (they use $subItem)
  for (const [alias] of Object.entries(nestedLoopAliases)) {
    // Handle {{{ alias.field }}} triple-brace patterns (rich text/HTML in nested loops)
    const aliasTripleRegex = new RegExp(`\\{\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}\\}`, 'g');
    php = php.replace(aliasTripleRegex, (_, field) => {
      return `<?php echo wp_kses_post($subItem['${field}'] ?? ''); ?>`;
    });
    
    // Handle {{#if alias.field}} conditionals in nested loops
    const aliasIfRegex = new RegExp(`\\{\\{#if\\s+${alias}\\.(\\w+)\\s*\\}\\}`, 'g');
    php = php.replace(aliasIfRegex, (_, field) => {
      return `<?php if (!empty($subItem['${field}'])) : ?>`;
    });
    
    // Handle {{ alias.field.subfield }} patterns in nested loops (e.g., {{ tag.icon.src }})
    const aliasDeepRegex = new RegExp(`\\{\\{\\s*${alias}\\.(\\w+)\\.(\\w+)\\s*\\}\\}`, 'g');
    php = php.replace(aliasDeepRegex, (_, field1, field2) => {
      const escFunc = field2 === 'url' || field2 === 'src' || field2 === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($subItem['${field1}']['${field2}'] ?? ''); ?>`;
    });
    
    // Handle {{ alias.field }} patterns in nested loops (e.g., {{ tag.label }})
    const aliasRegex = new RegExp(`\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}`, 'g');
    php = php.replace(aliasRegex, (_, field) => {
      const escFunc = field === 'url' || field === 'src' || field === 'href' ? 'esc_url' : 'esc_html';
      return `<?php echo ${escFunc}($subItem['${field}'] ?? ''); ?>`;
    });
  }
  
  // Then process top-level loop aliases (they use $item)
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
      // Use $subItem for nested loop aliases, $item for top-level
      const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
      return `<?php if (!empty(${itemVar}['${field}'])) : ?>`;
    }
  );
  
  // Helper to parse Handlebars helper expressions like (eq properties.layout "layout-1")
  // and convert to PHP comparison expressions
  const parseHelperToPhp = (expr: string): string | null => {
    // Helper to convert a variable path to PHP expression
    // Handles properties.xxx, this.xxx, and alias.xxx patterns
    const varToPhp = (varPath: string): string => {
      if (varPath.startsWith('properties.')) {
        const parts = varPath.replace('properties.', '').split('.');
        const camelProp = toCamelCase(parts[0]);
        if (parts.length > 1) {
          return `$${camelProp}['${parts.slice(1).join("']['")}']`;
        }
        return `$${camelProp}`;
      } else if (varPath.startsWith('this.')) {
        const field = varPath.replace('this.', '');
        if (field.includes('.')) {
          return `$item['${field.split('.').join("']['")}']`;
        }
        return `$item['${field}']`;
      } else {
        // Check if the first part is a known loop alias (e.g., card.type -> type)
        const parts = varPath.split('.');
        if (parts.length > 1) {
          // Check nested aliases first (use $subItem)
          if (nestedLoopAliases[parts[0]]) {
            const fieldPath = parts.slice(1);
            if (fieldPath.length > 1) {
              return `$subItem['${fieldPath.join("']['")}']`;
            }
            return `$subItem['${fieldPath[0]}']`;
          }
          // Then check top-level aliases (use $item)
          if (loopAliases[parts[0]]) {
            const fieldPath = parts.slice(1);
            if (fieldPath.length > 1) {
              return `$item['${fieldPath.join("']['")}']`;
            }
            return `$item['${fieldPath[0]}']`;
          }
        }
        // Fallback - use as-is (might be a plain field name)
        if (varPath.includes('.')) {
          return `$item['${varPath.split('.').join("']['")}']`;
        }
        return `$item['${varPath}']`;
      }
    };
    
    // Match (eq left "right") - equals with quoted string
    const eqMatch = expr.match(/^\(\s*eq\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (eqMatch) {
      const [, left, right] = eqMatch;
      const leftExpr = varToPhp(left);
      return `(${leftExpr} ?? '') === '${right}'`;
    }
    
    // Match (eq left variable) without quotes
    const eqVarMatch = expr.match(/^\(\s*eq\s+([^\s]+)\s+([^\s)"]+)\s*\)$/);
    if (eqVarMatch) {
      const [, left, right] = eqVarMatch;
      const leftExpr = varToPhp(left);
      const rightExpr = varToPhp(right);
      return `(${leftExpr} ?? '') === (${rightExpr} ?? '')`;
    }
    
    // Match (ne left "right") - not equals
    const neMatch = expr.match(/^\(\s*ne\s+([^\s"]+)\s+["']([^"']+)["']\s*\)$/);
    if (neMatch) {
      const [, left, right] = neMatch;
      const leftExpr = varToPhp(left);
      return `(${leftExpr} ?? '') !== '${right}'`;
    }
    
    // Match (gt left right) - greater than
    const gtMatch = expr.match(/^\(\s*gt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (gtMatch) {
      const [, left, right] = gtMatch;
      const leftExpr = varToPhp(left);
      return `(${leftExpr} ?? 0) > ${right}`;
    }
    
    // Match (lt left right) - less than
    const ltMatch = expr.match(/^\(\s*lt\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (ltMatch) {
      const [, left, right] = ltMatch;
      const leftExpr = varToPhp(left);
      return `(${leftExpr} ?? 0) < ${right}`;
    }
    
    // Match (gte left right) - greater than or equal
    const gteMatch = expr.match(/^\(\s*gte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (gteMatch) {
      const [, left, right] = gteMatch;
      const leftExpr = varToPhp(left);
      return `(${leftExpr} ?? 0) >= ${right}`;
    }
    
    // Match (lte left right) - less than or equal
    const lteMatch = expr.match(/^\(\s*lte\s+([^\s]+)\s+([^\s)]+)\s*\)$/);
    if (lteMatch) {
      const [, left, right] = lteMatch;
      const leftExpr = varToPhp(left);
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
      // Use $subItem for nested loop aliases, $item for top-level
      const itemVar = nestedLoopAliases[alias] ? '$subItem' : '$item';
      return `<?php echo wp_kses_post(${itemVar}['${field}'] ?? ''); ?>`;
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
      // Use $subItem for nested loop aliases, $item for top-level
      const itemVar = nestedLoopAliases[obj] ? '$subItem' : '$item';
      return `<?php echo ${escFunc}(${itemVar}['${field}'] ?? ''); ?>`;
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
