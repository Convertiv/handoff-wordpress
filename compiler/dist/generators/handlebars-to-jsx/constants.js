"use strict";
/**
 * Constants for HTML to JSX attribute mapping
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SELF_CLOSING_TAGS = exports.DANGEROUS_HTML_PLACEHOLDER = exports.HTML_TO_JSX_ATTR_MAP = void 0;
/**
 * Map of HTML/SVG attribute names to their JSX equivalents
 * Handles namespaced attributes and other special cases
 */
exports.HTML_TO_JSX_ATTR_MAP = {
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
exports.DANGEROUS_HTML_PLACEHOLDER = '___DANGEROUS_SET_INNER_HTML___';
/**
 * Self-closing HTML tags
 */
exports.SELF_CLOSING_TAGS = [
    'img', 'br', 'hr', 'input', 'meta', 'link',
    'area', 'base', 'col', 'embed', 'param',
    'source', 'track', 'wbr'
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RhbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvaGFuZGxlYmFycy10by1qc3gvY29uc3RhbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBRUg7OztHQUdHO0FBQ1UsUUFBQSxvQkFBb0IsR0FBMkI7SUFDMUQseUJBQXlCO0lBQ3pCLE9BQU8sRUFBRSxXQUFXO0lBQ3BCLEtBQUssRUFBRSxTQUFTO0lBQ2hCLFVBQVUsRUFBRSxVQUFVO0lBQ3RCLFVBQVUsRUFBRSxVQUFVO0lBQ3RCLFdBQVcsRUFBRSxXQUFXO0lBQ3hCLGFBQWEsRUFBRSxhQUFhO0lBQzVCLGFBQWEsRUFBRSxhQUFhO0lBQzVCLFNBQVMsRUFBRSxTQUFTO0lBQ3BCLFNBQVMsRUFBRSxTQUFTO0lBQ3BCLFFBQVEsRUFBRSxRQUFRO0lBQ2xCLGFBQWEsRUFBRSxhQUFhO0lBQzVCLGlCQUFpQixFQUFFLGlCQUFpQjtJQUNwQyxhQUFhLEVBQUUsYUFBYTtJQUM1QixVQUFVLEVBQUUsVUFBVTtJQUN0QixTQUFTLEVBQUUsU0FBUztJQUNwQixZQUFZLEVBQUUsWUFBWTtJQUMxQixhQUFhLEVBQUUsYUFBYTtJQUM1QixZQUFZLEVBQUUsWUFBWTtJQUMxQixnQkFBZ0IsRUFBRSxnQkFBZ0I7SUFDbEMsWUFBWSxFQUFFLFlBQVk7SUFDMUIsV0FBVyxFQUFFLFdBQVc7SUFDeEIsY0FBYyxFQUFFLGNBQWM7SUFDOUIsV0FBVyxFQUFFLFdBQVc7SUFDeEIsVUFBVSxFQUFFLFVBQVU7SUFFdEIsNEJBQTRCO0lBQzVCLGFBQWEsRUFBRSxZQUFZO0lBQzNCLFlBQVksRUFBRSxXQUFXO0lBQ3pCLGFBQWEsRUFBRSxZQUFZO0lBQzNCLFlBQVksRUFBRSxXQUFXO0lBQ3pCLFlBQVksRUFBRSxXQUFXO0lBQ3pCLGVBQWUsRUFBRSxjQUFjO0lBQy9CLGVBQWUsRUFBRSxjQUFjO0lBQy9CLFlBQVksRUFBRSxXQUFXO0lBQ3pCLFVBQVUsRUFBRSxTQUFTO0lBQ3JCLFVBQVUsRUFBRSxTQUFTO0lBQ3JCLFdBQVcsRUFBRSxVQUFVO0lBRXZCLDJCQUEyQjtJQUMzQixjQUFjLEVBQUUsYUFBYTtJQUM3QixnQkFBZ0IsRUFBRSxlQUFlO0lBQ2pDLGlCQUFpQixFQUFFLGdCQUFnQjtJQUNuQyxrQkFBa0IsRUFBRSxpQkFBaUI7SUFDckMsbUJBQW1CLEVBQUUsa0JBQWtCO0lBQ3ZDLG1CQUFtQixFQUFFLGtCQUFrQjtJQUN2QyxnQkFBZ0IsRUFBRSxlQUFlO0lBQ2pDLGNBQWMsRUFBRSxhQUFhO0lBQzdCLFdBQVcsRUFBRSxVQUFVO0lBQ3ZCLFdBQVcsRUFBRSxVQUFVO0lBQ3ZCLFdBQVcsRUFBRSxVQUFVO0lBQ3ZCLGFBQWEsRUFBRSxZQUFZO0lBQzNCLFdBQVcsRUFBRSxVQUFVO0lBQ3ZCLFlBQVksRUFBRSxXQUFXO0lBQ3pCLGFBQWEsRUFBRSxZQUFZO0lBQzNCLGFBQWEsRUFBRSxZQUFZO0lBQzNCLGlCQUFpQixFQUFFLGdCQUFnQjtJQUNuQyxvQkFBb0IsRUFBRSxtQkFBbUI7SUFDekMsbUJBQW1CLEVBQUUsa0JBQWtCO0lBQ3ZDLGdCQUFnQixFQUFFLGVBQWU7SUFDakMsWUFBWSxFQUFFLFdBQVc7SUFDekIsY0FBYyxFQUFFLGFBQWE7SUFDN0IsYUFBYSxFQUFFLFlBQVk7SUFDM0IsZUFBZSxFQUFFLGNBQWM7SUFDL0IsZ0JBQWdCLEVBQUUsZUFBZTtJQUNqQyxxQkFBcUIsRUFBRSxvQkFBb0I7SUFDM0MsNkJBQTZCLEVBQUUsMkJBQTJCO0lBQzFELG1CQUFtQixFQUFFLGtCQUFrQjtJQUN2Qyw4QkFBOEIsRUFBRSw0QkFBNEI7SUFDNUQsNEJBQTRCLEVBQUUsMEJBQTBCO0lBQ3hELGdCQUFnQixFQUFFLGVBQWU7SUFDakMsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBQ25DLGlCQUFpQixFQUFFLGdCQUFnQjtJQUNuQyxlQUFlLEVBQUUsY0FBYztJQUMvQixjQUFjLEVBQUUsYUFBYTtJQUM3QixZQUFZLEVBQUUsV0FBVztJQUN6QixZQUFZLEVBQUUsV0FBVztJQUN6QixlQUFlLEVBQUUsY0FBYztJQUMvQixhQUFhLEVBQUUsWUFBWTtDQUM1QixDQUFDO0FBRUY7O0dBRUc7QUFDVSxRQUFBLDBCQUEwQixHQUFHLGdDQUFnQyxDQUFDO0FBRTNFOztHQUVHO0FBQ1UsUUFBQSxpQkFBaUIsR0FBRztJQUMvQixLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU07SUFDMUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU87SUFDdkMsUUFBUSxFQUFFLE9BQU8sRUFBRSxLQUFLO0NBQ3pCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvbnN0YW50cyBmb3IgSFRNTCB0byBKU1ggYXR0cmlidXRlIG1hcHBpbmdcbiAqL1xuXG4vKipcbiAqIE1hcCBvZiBIVE1ML1NWRyBhdHRyaWJ1dGUgbmFtZXMgdG8gdGhlaXIgSlNYIGVxdWl2YWxlbnRzXG4gKiBIYW5kbGVzIG5hbWVzcGFjZWQgYXR0cmlidXRlcyBhbmQgb3RoZXIgc3BlY2lhbCBjYXNlc1xuICovXG5leHBvcnQgY29uc3QgSFRNTF9UT19KU1hfQVRUUl9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIENvbW1vbiBIVE1MIGF0dHJpYnV0ZXNcbiAgJ2NsYXNzJzogJ2NsYXNzTmFtZScsXG4gICdmb3InOiAnaHRtbEZvcicsXG4gICd0YWJpbmRleCc6ICd0YWJJbmRleCcsXG4gICdyZWFkb25seSc6ICdyZWFkT25seScsXG4gICdtYXhsZW5ndGgnOiAnbWF4TGVuZ3RoJyxcbiAgJ2NlbGxzcGFjaW5nJzogJ2NlbGxTcGFjaW5nJyxcbiAgJ2NlbGxwYWRkaW5nJzogJ2NlbGxQYWRkaW5nJyxcbiAgJ3Jvd3NwYW4nOiAncm93U3BhbicsXG4gICdjb2xzcGFuJzogJ2NvbFNwYW4nLFxuICAndXNlbWFwJzogJ3VzZU1hcCcsXG4gICdmcmFtZWJvcmRlcic6ICdmcmFtZUJvcmRlcicsXG4gICdjb250ZW50ZWRpdGFibGUnOiAnY29udGVudEVkaXRhYmxlJyxcbiAgJ2Nyb3Nzb3JpZ2luJzogJ2Nyb3NzT3JpZ2luJyxcbiAgJ2RhdGV0aW1lJzogJ2RhdGVUaW1lJyxcbiAgJ2VuY3R5cGUnOiAnZW5jVHlwZScsXG4gICdmb3JtYWN0aW9uJzogJ2Zvcm1BY3Rpb24nLFxuICAnZm9ybWVuY3R5cGUnOiAnZm9ybUVuY1R5cGUnLFxuICAnZm9ybW1ldGhvZCc6ICdmb3JtTWV0aG9kJyxcbiAgJ2Zvcm1ub3ZhbGlkYXRlJzogJ2Zvcm1Ob1ZhbGlkYXRlJyxcbiAgJ2Zvcm10YXJnZXQnOiAnZm9ybVRhcmdldCcsXG4gICdpbnB1dG1vZGUnOiAnaW5wdXRNb2RlJyxcbiAgJ2F1dG9jb21wbGV0ZSc6ICdhdXRvQ29tcGxldGUnLFxuICAnYXV0b2ZvY3VzJzogJ2F1dG9Gb2N1cycsXG4gICdhdXRvcGxheSc6ICdhdXRvUGxheScsXG4gIFxuICAvLyBTVkcgbmFtZXNwYWNlZCBhdHRyaWJ1dGVzXG4gICd4bWxuczp4bGluayc6ICd4bWxuc1hsaW5rJyxcbiAgJ3hsaW5rOmhyZWYnOiAneGxpbmtIcmVmJyxcbiAgJ3hsaW5rOnRpdGxlJzogJ3hsaW5rVGl0bGUnLFxuICAneGxpbms6c2hvdyc6ICd4bGlua1Nob3cnLFxuICAneGxpbms6cm9sZSc6ICd4bGlua1JvbGUnLFxuICAneGxpbms6YXJjcm9sZSc6ICd4bGlua0FyY3JvbGUnLFxuICAneGxpbms6YWN0dWF0ZSc6ICd4bGlua0FjdHVhdGUnLFxuICAneGxpbms6dHlwZSc6ICd4bGlua1R5cGUnLFxuICAneG1sOmJhc2UnOiAneG1sQmFzZScsXG4gICd4bWw6bGFuZyc6ICd4bWxMYW5nJyxcbiAgJ3htbDpzcGFjZSc6ICd4bWxTcGFjZScsXG4gIFxuICAvLyBTVkcgY2FtZWxDYXNlIGF0dHJpYnV0ZXNcbiAgJ3N0cm9rZS13aWR0aCc6ICdzdHJva2VXaWR0aCcsXG4gICdzdHJva2UtbGluZWNhcCc6ICdzdHJva2VMaW5lY2FwJyxcbiAgJ3N0cm9rZS1saW5lam9pbic6ICdzdHJva2VMaW5lam9pbicsXG4gICdzdHJva2UtZGFzaGFycmF5JzogJ3N0cm9rZURhc2hhcnJheScsXG4gICdzdHJva2UtZGFzaG9mZnNldCc6ICdzdHJva2VEYXNob2Zmc2V0JyxcbiAgJ3N0cm9rZS1taXRlcmxpbWl0JzogJ3N0cm9rZU1pdGVybGltaXQnLFxuICAnc3Ryb2tlLW9wYWNpdHknOiAnc3Ryb2tlT3BhY2l0eScsXG4gICdmaWxsLW9wYWNpdHknOiAnZmlsbE9wYWNpdHknLFxuICAnZmlsbC1ydWxlJzogJ2ZpbGxSdWxlJyxcbiAgJ2NsaXAtcGF0aCc6ICdjbGlwUGF0aCcsXG4gICdjbGlwLXJ1bGUnOiAnY2xpcFJ1bGUnLFxuICAnZm9udC1mYW1pbHknOiAnZm9udEZhbWlseScsXG4gICdmb250LXNpemUnOiAnZm9udFNpemUnLFxuICAnZm9udC1zdHlsZSc6ICdmb250U3R5bGUnLFxuICAnZm9udC13ZWlnaHQnOiAnZm9udFdlaWdodCcsXG4gICd0ZXh0LWFuY2hvcic6ICd0ZXh0QW5jaG9yJyxcbiAgJ3RleHQtZGVjb3JhdGlvbic6ICd0ZXh0RGVjb3JhdGlvbicsXG4gICdhbGlnbm1lbnQtYmFzZWxpbmUnOiAnYWxpZ25tZW50QmFzZWxpbmUnLFxuICAnZG9taW5hbnQtYmFzZWxpbmUnOiAnZG9taW5hbnRCYXNlbGluZScsXG4gICdiYXNlbGluZS1zaGlmdCc6ICdiYXNlbGluZVNoaWZ0JyxcbiAgJ3N0b3AtY29sb3InOiAnc3RvcENvbG9yJyxcbiAgJ3N0b3Atb3BhY2l0eSc6ICdzdG9wT3BhY2l0eScsXG4gICdmbG9vZC1jb2xvcic6ICdmbG9vZENvbG9yJyxcbiAgJ2Zsb29kLW9wYWNpdHknOiAnZmxvb2RPcGFjaXR5JyxcbiAgJ2xpZ2h0aW5nLWNvbG9yJzogJ2xpZ2h0aW5nQ29sb3InLFxuICAnY29sb3ItaW50ZXJwb2xhdGlvbic6ICdjb2xvckludGVycG9sYXRpb24nLFxuICAnY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzJzogJ2NvbG9ySW50ZXJwb2xhdGlvbkZpbHRlcnMnLFxuICAnZW5hYmxlLWJhY2tncm91bmQnOiAnZW5hYmxlQmFja2dyb3VuZCcsXG4gICdnbHlwaC1vcmllbnRhdGlvbi1ob3Jpem9udGFsJzogJ2dseXBoT3JpZW50YXRpb25Ib3Jpem9udGFsJyxcbiAgJ2dseXBoLW9yaWVudGF0aW9uLXZlcnRpY2FsJzogJ2dseXBoT3JpZW50YXRpb25WZXJ0aWNhbCcsXG4gICdwb2ludGVyLWV2ZW50cyc6ICdwb2ludGVyRXZlbnRzJyxcbiAgJ3NoYXBlLXJlbmRlcmluZyc6ICdzaGFwZVJlbmRlcmluZycsXG4gICdpbWFnZS1yZW5kZXJpbmcnOiAnaW1hZ2VSZW5kZXJpbmcnLFxuICAnY29sb3ItcHJvZmlsZSc6ICdjb2xvclByb2ZpbGUnLFxuICAnbWFya2VyLXN0YXJ0JzogJ21hcmtlclN0YXJ0JyxcbiAgJ21hcmtlci1taWQnOiAnbWFya2VyTWlkJyxcbiAgJ21hcmtlci1lbmQnOiAnbWFya2VyRW5kJyxcbiAgJ3ZlY3Rvci1lZmZlY3QnOiAndmVjdG9yRWZmZWN0JyxcbiAgJ3BhaW50LW9yZGVyJzogJ3BhaW50T3JkZXInLFxufTtcblxuLyoqXG4gKiBQbGFjZWhvbGRlciBmb3IgZGFuZ2Vyb3VzbHlTZXRJbm5lckhUTUwgdGhhdCB3b24ndCBiZSBtYXRjaGVkIGJ5IEhhbmRsZWJhcnMgcmVnZXhcbiAqL1xuZXhwb3J0IGNvbnN0IERBTkdFUk9VU19IVE1MX1BMQUNFSE9MREVSID0gJ19fX0RBTkdFUk9VU19TRVRfSU5ORVJfSFRNTF9fXyc7XG5cbi8qKlxuICogU2VsZi1jbG9zaW5nIEhUTUwgdGFnc1xuICovXG5leHBvcnQgY29uc3QgU0VMRl9DTE9TSU5HX1RBR1MgPSBbXG4gICdpbWcnLCAnYnInLCAnaHInLCAnaW5wdXQnLCAnbWV0YScsICdsaW5rJywgXG4gICdhcmVhJywgJ2Jhc2UnLCAnY29sJywgJ2VtYmVkJywgJ3BhcmFtJywgXG4gICdzb3VyY2UnLCAndHJhY2snLCAnd2JyJ1xuXTtcbiJdfQ==