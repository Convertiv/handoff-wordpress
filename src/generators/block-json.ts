/**
 * Generates block.json for a Gutenberg block
 */

import { HandoffComponent, HandoffProperty, BlockJsonOutput, GutenbergAttribute } from '../types';

/**
 * Get default value for a type
 */
const getDefaultForType = (type: string): any => {
  switch (type) {
    case 'text':
    case 'richtext':
    case 'select':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'image':
      return { src: '', alt: '' };
    case 'link':
      return { label: '', url: '', opensInNewTab: false };
    case 'object':
      return {};
    case 'array':
      return [];
    default:
      return '';
  }
};

/**
 * Maps Handoff property types to Gutenberg attribute types
 * @param property - The property definition
 * @param previewValue - Optional value from generic preview to use as default if property.default is not set
 */
const mapPropertyType = (property: HandoffProperty, previewValue?: any): GutenbergAttribute => {
  // Use property.default first, then preview value, then type-specific fallback
  const getDefault = (typeDefault: any) => {
    if (property.default !== undefined) return property.default;
    if (previewValue !== undefined) return previewValue;
    return typeDefault;
  };

  switch (property.type) {
    case 'text':
    case 'richtext':
      return { type: 'string', default: getDefault('') };
    
    case 'number':
      return { type: 'number', default: getDefault(0) };
    
    case 'boolean':
      return { type: 'boolean', default: getDefault(false) };
    
    case 'image':
      return { 
        type: 'object', 
        default: getDefault({ src: '', alt: '' })
      };
    
    case 'link':
      return { 
        type: 'object', 
        default: getDefault({ label: '', url: '', opensInNewTab: false })
      };
    
    case 'object':
      // For objects, create default from nested properties or use preview value
      const objectDefault: Record<string, any> = {};
      if (property.properties) {
        const previewObj = typeof previewValue === 'object' ? previewValue : {};
        for (const [key, nestedProp] of Object.entries(property.properties)) {
          objectDefault[key] = nestedProp.default ?? previewObj?.[key] ?? getDefaultForType(nestedProp.type);
        }
      }
      return { 
        type: 'object', 
        default: getDefault(objectDefault)
      };
    
    case 'array':
      // For arrays, use property default, preview value, or empty array
      return { 
        type: 'array', 
        default: getDefault([])
      };
    
    case 'select':
      return { 
        type: 'string', 
        default: getDefault(property.options?.[0]?.value || '')
      };
    
    default:
      return { type: 'string', default: getDefault('') };
  }
};

/**
 * Choose an appropriate icon based on component type/group
 */
const chooseIcon = (component: HandoffComponent): string => {
  const group = component.group?.toLowerCase() || '';
  const id = component.id.toLowerCase();
  
  if (group.includes('hero') || id.includes('hero')) {
    return 'format-image';
  }
  if (group.includes('card') || id.includes('card')) {
    return 'index-card';
  }
  if (group.includes('form') || id.includes('form')) {
    return 'feedback';
  }
  if (group.includes('nav') || id.includes('nav')) {
    return 'menu';
  }
  if (group.includes('footer') || id.includes('footer')) {
    return 'table-row-after';
  }
  if (group.includes('header') || id.includes('header')) {
    return 'table-row-before';
  }
  
  return 'admin-customizer';
};

/**
 * Convert component ID to block name (kebab-case)
 */
const toBlockName = (id: string): string => {
  return id.toLowerCase().replace(/_/g, '-');
};

/**
 * Generate block.json content
 * @param component - The Handoff component data
 * @param hasScreenshot - Whether a screenshot image is available for this block
 */
const generateBlockJson = (component: HandoffComponent, hasScreenshot: boolean = false): string => {
  const blockName = toBlockName(component.id);
  
  // Get generic preview values to use as defaults when property.default is not set
  const genericPreviewValues = component.previews?.generic?.values || {};
  
  // Convert properties to Gutenberg attributes
  const attributes: Record<string, GutenbergAttribute> = {};
  
  for (const [key, property] of Object.entries(component.properties)) {
    // Convert snake_case to camelCase for attribute names
    const attrName = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    // Pass preview value for this property to use as fallback default
    const previewValue = genericPreviewValues[key];
    attributes[attrName] = mapPropertyType(property, previewValue);
  }
  
  // Add overlay opacity if we detect a hero/subheader component
  if (component.code.includes('overlay') && !attributes.overlayOpacity) {
    attributes.overlayOpacity = { type: 'number', default: 0.6 };
  }
  
  // Add align attribute with default of 'full' for full-width blocks
  attributes.align = { type: 'string', default: 'full' };
  
  const blockJson: BlockJsonOutput = {
    $schema: 'https://schemas.wp.org/trunk/block.json',
    apiVersion: 3,
    name: `handoff/${blockName}`,
    version: '1.0.0',
    title: component.title,
    category: 'handoff',
    icon: chooseIcon(component),
    description: component.description.replace(/\n\s+/g, ' ').trim(),
    keywords: component.tags || [],
    textdomain: 'handoff',
    editorScript: 'file:./index.js',
    editorStyle: 'file:./index.css',
    style: 'file:./style-index.css',
    render: 'file:./render.php',
    attributes,
    supports: {
      align: ['none', 'wide', 'full'],
      html: false
    }
  };
  
  // Add example with preview image if screenshot is available
  // This makes the block inserter show a preview image instead of rendering the block
  if (hasScreenshot) {
    blockJson.example = {
      viewportWidth: 1200,
      attributes: {
        // Empty attributes to trigger the preview image display
      }
    };
  }
  
  return JSON.stringify(blockJson, null, 2);
};

export { generateBlockJson, toBlockName, mapPropertyType };
