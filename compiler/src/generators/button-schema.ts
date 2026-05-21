/**
 * Resolve button object field keys from Handoff property.properties.
 * Prefer text/url when declared; otherwise fall back to label/href.
 */

import { HandoffProperty } from '../types';

export interface ButtonFieldKeys {
  labelKey: string;
  urlKey: string;
}

const DEFAULT_BUTTON_KEYS: ButtonFieldKeys = { labelKey: 'label', urlKey: 'href' };

export const resolveButtonFieldKeys = (property?: HandoffProperty | null): ButtonFieldKeys => {
  const props = property?.properties;
  if (!props || typeof props !== 'object') {
    return DEFAULT_BUTTON_KEYS;
  }
  return {
    labelKey: 'text' in props ? 'text' : 'label',
    urlKey: 'url' in props ? 'url' : 'href',
  };
};

export const getButtonUrlFallback = (urlKey: string): string => (urlKey === 'href' ? '#' : '');

export const getButtonDefault = (
  property?: HandoffProperty | null,
  previewValue?: unknown,
): Record<string, unknown> => {
  const keys = resolveButtonFieldKeys(property);
  const defaults: Record<string, unknown> = {
    [keys.labelKey]: '',
    [keys.urlKey]: getButtonUrlFallback(keys.urlKey),
    target: '',
    rel: '',
    disabled: false,
  };

  if (property?.properties) {
    for (const [key, nested] of Object.entries(property.properties)) {
      if (nested.default !== undefined) {
        defaults[key] = nested.default;
      }
    }
  }

  let result = { ...defaults };
  if (property?.default !== undefined && typeof property.default === 'object' && !Array.isArray(property.default)) {
    result = { ...result, ...(property.default as Record<string, unknown>) };
  }
  if (previewValue !== undefined && typeof previewValue === 'object' && !Array.isArray(previewValue)) {
    result = { ...result, ...(previewValue as Record<string, unknown>) };
  }
  return result;
};

export const buttonLabelMergeJs = (objRef: string, keys: ButtonFieldKeys): string =>
  `{ ...${objRef}, ${keys.labelKey}: value }`;

export const buttonLinkMergeJs = (objRef: string, keys: ButtonFieldKeys): string => {
  const urlFallback = getButtonUrlFallback(keys.urlKey);
  return `{ ...${objRef}, ${keys.urlKey}: value.url || '${urlFallback}', target: value.opensInNewTab ? '_blank' : '', rel: value.opensInNewTab ? 'noopener noreferrer' : '' }`;
};
