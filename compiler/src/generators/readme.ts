/**
 * Generates README.md documentation for Gutenberg blocks
 */

import { HandoffComponent, HandoffProperty } from '../types';
import { toCamelCase } from './handlebars-to-jsx';

/**
 * Get Gutenberg attribute type for documentation
 */
const getAttributeType = (property: HandoffProperty): string => {
  switch (property.type) {
    case 'text':
    case 'richtext':
    case 'select':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'image':
    case 'link':
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'string';
  }
};

/**
 * Format default value for documentation
 */
const formatDefault = (property: HandoffProperty): string => {
  if (property.default === undefined || property.default === null) {
    switch (property.type) {
      case 'text':
      case 'richtext':
      case 'select':
        return '`""`';
      case 'number':
        return '`0`';
      case 'boolean':
        return '`false`';
      case 'image':
        return '`{ url: "", alt: "" }`';
      case 'link':
        return '`{ label: "", url: "" }`';
      case 'object':
        return '`{}`';
      case 'array':
        return '`[]`';
      default:
        return '`""`';
    }
  }
  
  if (typeof property.default === 'object') {
    return '`' + JSON.stringify(property.default) + '`';
  }
  
  return '`' + String(property.default) + '`';
};

/**
 * Generate complete README.md file
 */
const generateReadme = (component: HandoffComponent): string => {
  const blockName = component.id.replace(/_/g, '-');
  
  // Generate attributes table
  const attributeRows: string[] = [];
  for (const [key, property] of Object.entries(component.properties)) {
    const attrName = toCamelCase(key);
    const type = getAttributeType(property);
    const defaultVal = formatDefault(property);
    const description = property.description || property.name || '';
    
    attributeRows.push(`| \`${attrName}\` | ${type} | ${defaultVal} | ${description} |`);
  }
  
  // Check for overlay
  if (component.code.includes('overlay')) {
    attributeRows.push('| `overlayOpacity` | number | `0.6` | Opacity of the overlay (0-1) |');
  }
  
  // Generate usage sections based on property types
  const usageSections: string[] = [];
  
  for (const [key, property] of Object.entries(component.properties)) {
    if (property.type === 'image' && property.rules?.dimensions) {
      const dims = property.rules.dimensions;
      usageSections.push(`### ${property.name || key}
- Recommended dimensions: ${dims.recommend?.width || dims.min?.width}x${dims.recommend?.height || dims.min?.height} pixels
- Minimum dimensions: ${dims.min?.width}x${dims.min?.height} pixels
- Maximum dimensions: ${dims.max?.width}x${dims.max?.height} pixels`);
    }
    
    if (property.type === 'array' && property.items?.properties) {
      const itemProps = Object.entries(property.items.properties)
        .map(([k, p]) => `- \`${k}\`: ${p.description || p.name || 'Value'}`)
        .join('\n');
      usageSections.push(`### ${property.name || key}
Each item consists of:
${itemProps}`);
    }
    
    if (property.type === 'object' && property.properties) {
      const objProps = Object.entries(property.properties)
        .map(([k, p]) => `- \`${k}\`: ${p.description || p.name || 'Value'}`)
        .join('\n');
      usageSections.push(`### ${property.name || key}
${property.description || ''}
${objProps}`);
    }
  }
  
  // Design guidelines
  const shouldDo = component.should_do?.map(s => `- ${s}`).join('\n') || '- Use this component as designed';
  const shouldNotDo = component.should_not_do?.map(s => `- ${s}`).join('\n') || '- Avoid using outside intended context';
  
  return `# ${component.title} Block

${component.description}

## Block Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
${attributeRows.join('\n')}

## Usage

${usageSections.join('\n\n')}

## Design Guidelines

### Do
${shouldDo}

### Don't
${shouldNotDo}

## Source

This block is auto-generated from the Handoff design system component \`${component.id}\`.

${component.figma ? `- Figma: [View Design](${component.figma})` : ''}
- Handoff Component: \`${component.id}\`
- Generated: ${new Date().toISOString().split('T')[0]}
`;
};

export { generateReadme };
