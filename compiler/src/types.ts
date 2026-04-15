/**
 * Types for Handoff API component data
 */

export interface HandoffProperty {
  id: string;
  name: string;
  type: 'text' | 'image' | 'video' | 'array' | 'object' | 'link' | 'boolean' | 'number' | 'select' | 'richtext' | 'button' | 'pagination';
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
  /** Select options: array of { value, label } or array of strings (string used as value and humanized as label) */
  options?: Array<{ label?: string; value?: string } | string>;
  /** Pagination sub-property for array fields (type: "pagination", with items defining label/url/active) */
  pagination?: HandoffProperty;
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
  migrationSchema: string;
  schemaChangelog?: string;
  screenshotUrl?: string;
  /** Per-variant screenshot URLs for merged group blocks (key = variant id) */
  variantScreenshotUrls?: Record<string, string>;
  /** Per-variant include files for merged group blocks (key = variant id, e.g. 'hero-article') */
  variationFiles?: {
    js: Record<string, string>;
    php: Record<string, string>;
  };
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
  | { type: 'manual' }                                  // User-editable value via sidebar control
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
      /** Option objects { value, label } or strings (value and humanized label) */
      options?: Array<{ label: string; value: string } | string>;
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

  /**
   * Auto-detected pagination metadata.
   * Set at compile time when the array property has a pagination sub-property.
   */
  pagination?: {
    /** The property name used in the Handlebars template (e.g., "pagination") */
    propertyName: string;
  };
}

/**
 * Configuration for an array field populated automatically from the current page's breadcrumb trail.
 * The editor only exposes an enabled/disabled toggle; the actual items are built server-side.
 */
export interface BreadcrumbsArrayConfig {
  arrayType: 'breadcrumbs';
}

/**
 * Configuration for an array field populated from the terms of a given taxonomy on the current post.
 * The editor exposes an enabled/disabled toggle and a taxonomy selector.
 */
export interface TaxonomyArrayConfig {
  arrayType: 'taxonomy';
  /** Taxonomy slugs that the editor can choose from (e.g. ["post_tag", "category"]) */
  taxonomies: string[];
  /** Maximum number of terms to return (defaults to -1 = all) */
  maxItems?: number;
}

/**
 * Configuration for an array field that represents pagination links derived from a sibling
 * DynamicArrayConfig field's WP_Query result. The editor only exposes an enabled/disabled toggle.
 */
export interface PaginationArrayConfig {
  arrayType: 'pagination';
  /**
   * The field name (key in component.properties) of the DynamicArrayConfig array
   * whose WP_Query this pagination should be derived from.
   */
  connectedField: string;
}

/**
 * Per-field preferences for non-array fields (e.g. richtext InnerBlocks opt-in).
 */
export interface FieldPreferences {
  /** Use InnerBlocks for this richtext field (only one per block) */
  innerBlocks?: boolean;
}

/**
 * A per-field config entry: either a DynamicArrayConfig (for array fields),
 * one of the specialised array types, or general field preferences.
 */
export type FieldConfig = DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig | FieldPreferences;

/** Type guard: true when the config is any kind of dynamic/special array config */
export const isDynamicArrayConfig = (
  config: FieldConfig
): config is DynamicArrayConfig | BreadcrumbsArrayConfig | TaxonomyArrayConfig | PaginationArrayConfig =>
  'postTypes' in config || 'renderMode' in config || 'arrayType' in config;

/** Type guard: true when the config is a BreadcrumbsArrayConfig */
export const isBreadcrumbsConfig = (config: FieldConfig): config is BreadcrumbsArrayConfig =>
  (config as any).arrayType === 'breadcrumbs';

/** Type guard: true when the config is a TaxonomyArrayConfig */
export const isTaxonomyConfig = (config: FieldConfig): config is TaxonomyArrayConfig =>
  (config as any).arrayType === 'taxonomy';

/** Type guard: true when the config is a PaginationArrayConfig */
export const isPaginationConfig = (config: FieldConfig): config is PaginationArrayConfig =>
  (config as any).arrayType === 'pagination';

/**
 * Per-component import config.
 * - true or {} : import with no field overrides
 * - false      : skip this component
 * - Record<fieldName, FieldConfig> : import with per-field config (dynamic arrays or preferences)
 */
export type ComponentImportConfig = boolean | Record<string, FieldConfig>;

/**
 * Per-type import config.
 * - true  : import all components of this type (no per-component overrides)
 * - false : skip all components of this type
 * - Record<componentId, ComponentImportConfig> : import all components of this type;
 *   listed components get per-field overrides, unlisted import with defaults
 */
export type TypeImportConfig = boolean | Record<string, ComponentImportConfig>;

/**
 * Top-level import config keyed by component type (e.g. "element", "block").
 * Types not listed default to true (import all).
 */
export type ImportConfig = Record<string, TypeImportConfig>;

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
  
  /** Component import configuration by type */
  import?: ImportConfig;

  /**
   * Group compilation mode.
   * Keys are group names (matched case-insensitively to HandoffComponent.group).
   * - "merged" : all components in the group compile into one block with WP variations
   * - "individual" (or omitted) : each component is its own block (default)
   */
  groups?: Record<string, 'merged' | 'individual'>;

  /**
   * Schema migration overrides keyed by component slug.
   * Each entry maps version transitions (e.g. "1-to-2") to rename/transform rules.
   */
  schemaMigrations?: Record<string, Record<string, {
    renames?: Record<string, string>;
    transforms?: Record<string, { from: string; to: string; rule: string }>;
  }>>;

  /**
   * @deprecated Use `import` instead. Kept for backward compatibility.
   * Dynamic array configurations keyed by "componentId.fieldName"
   */
  dynamicArrays?: Record<string, DynamicArrayConfig>;
}
