/**
 * Constants for HTML to JSX attribute mapping
 */

/**
 * Map of HTML/SVG attribute names to their JSX equivalents
 * Handles namespaced attributes and other special cases
 */
export const HTML_TO_JSX_ATTR_MAP: Record<string, string> = {
  // Common HTML attributes
  'class': 'className',
  'for': 'htmlFor',
  'tabindex': 'tabIndex',
  'readonly': 'readOnly',
  'maxlength': 'maxLength',
  'cellspacing': 'cellSpacing',
  'cellpadding': 'cellPadding',
  'rowspan': 'rowSpan',
  'colspan': 'colSpan',
  'usemap': 'useMap',
  'frameborder': 'frameBorder',
  'contenteditable': 'contentEditable',
  'crossorigin': 'crossOrigin',
  'datetime': 'dateTime',
  'enctype': 'encType',
  'formaction': 'formAction',
  'formenctype': 'formEncType',
  'formmethod': 'formMethod',
  'formnovalidate': 'formNoValidate',
  'formtarget': 'formTarget',
  'inputmode': 'inputMode',
  'autocomplete': 'autoComplete',
  'autofocus': 'autoFocus',
  'autoplay': 'autoPlay',
  
  // SVG namespaced attributes
  'xmlns:xlink': 'xmlnsXlink',
  'xlink:href': 'xlinkHref',
  'xlink:title': 'xlinkTitle',
  'xlink:show': 'xlinkShow',
  'xlink:role': 'xlinkRole',
  'xlink:arcrole': 'xlinkArcrole',
  'xlink:actuate': 'xlinkActuate',
  'xlink:type': 'xlinkType',
  'xml:base': 'xmlBase',
  'xml:lang': 'xmlLang',
  'xml:space': 'xmlSpace',
  
  // SVG camelCase attributes
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  'text-anchor': 'textAnchor',
  'text-decoration': 'textDecoration',
  'alignment-baseline': 'alignmentBaseline',
  'dominant-baseline': 'dominantBaseline',
  'baseline-shift': 'baselineShift',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'flood-color': 'floodColor',
  'flood-opacity': 'floodOpacity',
  'lighting-color': 'lightingColor',
  'color-interpolation': 'colorInterpolation',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'enable-background': 'enableBackground',
  'glyph-orientation-horizontal': 'glyphOrientationHorizontal',
  'glyph-orientation-vertical': 'glyphOrientationVertical',
  'pointer-events': 'pointerEvents',
  'shape-rendering': 'shapeRendering',
  'image-rendering': 'imageRendering',
  'color-profile': 'colorProfile',
  'marker-start': 'markerStart',
  'marker-mid': 'markerMid',
  'marker-end': 'markerEnd',
  'vector-effect': 'vectorEffect',
  'paint-order': 'paintOrder',
};

/**
 * Placeholder for dangerouslySetInnerHTML that won't be matched by Handlebars regex
 */
export const DANGEROUS_HTML_PLACEHOLDER = '___DANGEROUS_SET_INNER_HTML___';

/**
 * Self-closing HTML tags
 */
export const SELF_CLOSING_TAGS = [
  'img', 'br', 'hr', 'input', 'meta', 'link', 
  'area', 'base', 'col', 'embed', 'param', 
  'source', 'track', 'wbr'
];
