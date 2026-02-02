/**
 * Types for Handoff API component data
 */

export interface HandoffProperty {
  id: string;
  name: string;
  type: 'text' | 'image' | 'video' | 'array' | 'object' | 'link' | 'boolean' | 'number' | 'select' | 'richtext' | 'button';
  description?: string;
  default?: any;
  rules?: {
    required?: boolean;
    dimensions?: {
      min?: { width: number; height: number };
      max?: { width: number; height: number };
      recommend?: { width: number; height: number };
    };
  };
  items?: {
    type: string;
    default?: any;
    properties?: Record<string, HandoffProperty>;
  };
  properties?: Record<string, HandoffProperty>;
  options?: Array<{ label: string; value: string }>;
}

export interface HandoffPreview {
  title: string;
  values: Record<string, any>;
  url?: string;
}

export interface HandoffComponent {
  id: string;
  title: string;
  description: string;
  figma?: string;
  image?: string;
  preview?: string;
  type: string;
  group: string;
  should_do?: string[];
  should_not_do?: string[];
  categories?: string[];
  tags?: string[];
  previews?: Record<string, HandoffPreview>;
  properties: Record<string, HandoffProperty>;
  code: string;  // Handlebars template
  html?: string;  // Compiled HTML example
  css?: string;   // Compiled CSS
  sass?: string;  // Original SASS
  js?: string;    // JavaScript
  format?: string;
}

export interface GutenbergAttribute {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default?: any;
}

export interface BlockJsonOutput {
  $schema: string;
  apiVersion: number;
  name: string;
  version: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  keywords: string[];
  textdomain: string;
  editorScript: string;
  editorStyle: string;
  style: string;
  render: string;
  attributes: Record<string, GutenbergAttribute>;
  supports?: Record<string, any>;
  example?: Record<string, any>;
}

export interface GeneratedBlock {
  blockJson: string;
  indexJs: string;
  renderPhp: string;
  editorScss: string;
  styleScss: string;
  readme: string;
  screenshotUrl?: string;  // URL to fetch the screenshot from
}

export interface CompilerOptions {
  apiUrl: string;
  outputDir: string;
  componentName: string;
  auth?: {
    username?: string;
    password?: string;
  };
}
