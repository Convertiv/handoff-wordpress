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
  enum?: string[];
}

export interface HandoffMetadata {
  handoffUrl?: string;
  figmaUrl?: string;
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
  __handoff?: HandoffMetadata;
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

/**
 * Field mapping value types for dynamic array post-to-template mapping
 */
export type FieldMappingValue =
  | string                                              // Simple field reference: "post_title", "featured_image"
  | { type: 'static'; value: string }                   // Static value: { type: 'static', value: 'Read More' }
  | { type: 'meta'; key: string }                       // Post meta: { type: 'meta', key: 'custom_field' }
  | { type: 'taxonomy'; taxonomy: string; format?: 'first' | 'all' }  // Taxonomy terms
  | { type: 'custom'; callback: string };               // PHP callback function name

/**
 * Taxonomy query structure for WP_Query
 */
export interface TaxonomyQuery {
  taxonomy: string;
  field: 'term_id' | 'slug' | 'name';
  terms: (number | string)[];
  operator?: 'IN' | 'NOT IN' | 'AND';
}

/**
 * Query arguments for dynamic post queries
 */
export interface DynamicQueryArgs {
  /** Post type to query */
  post_type?: string;
  
  /** Number of posts per page */
  posts_per_page?: number;
  
  /** Order by field */
  orderby?: 'date' | 'title' | 'modified' | 'menu_order' | 'rand' | 'comment_count' | 'ID';
  
  /** Order direction */
  order?: 'ASC' | 'DESC';
  
  /** Taxonomy queries */
  tax_query?: TaxonomyQuery[];
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Config for a single "apply to all items" field in dynamic query mode.
 * Use for fields like card.type that should be one value for all cards (not per-post).
 */
export type ItemOverrideFieldConfig =
  | { mode: 'static'; value: string }
  | {
      mode: 'ui';
      label: string;
      options: Array<{ label: string; value: string }>;
      default?: string;
    };

/**
 * Configuration for dynamic array fields that can be populated from WordPress posts
 */
export interface DynamicArrayConfig {
  /** Enable dynamic post selection for this array field */
  enabled: boolean;
  
  /** Allowed post types for selection */
  postTypes: string[];
  
  /** Default post type when first enabled */
  defaultPostType?: string;
  
  /** Selection mode: 'manual' = user picks posts, 'query' = query builder */
  selectionMode: 'manual' | 'query';
  
  /** Maximum number of items */
  maxItems?: number;
  
  /** Rendering mode: 'mapped' = use field mapping, 'template' = use PHP template */
  renderMode: 'mapped' | 'template';
  
  /** Field mapping configuration (for 'mapped' mode) */
  fieldMapping?: Record<string, FieldMappingValue>;
  
  /**
   * Fields that apply to every item in query/dynamic mode (e.g. card style).
   * - static: fixed value for all items (no UI).
   * - ui: show a control in Advanced Options; value stored in itemOverrides attribute.
   */
  itemOverridesConfig?: Record<string, ItemOverrideFieldConfig>;
  
  /** Template path relative to theme/plugin (for 'template' mode) */
  templatePath?: string;
  
  /** Available taxonomy filters for the query builder */
  taxonomyFilters?: string[];
  
  /** Default query arguments */
  defaultQueryArgs?: DynamicQueryArgs;
}

/**
 * Configuration file structure for handoff-wp.config.json
 */
export interface HandoffWpConfig {
  /** Handoff API base URL */
  apiUrl?: string;
  
  /** Output directory for generated blocks */
  output?: string;
  
  /** Theme directory for header/footer templates */
  themeDir?: string;
  
  /** Basic auth username */
  username?: string;
  
  /** Basic auth password */
  password?: string;
  
  /** Dynamic array configurations keyed by "componentId.fieldName" */
  dynamicArrays?: Record<string, DynamicArrayConfig>;
}
