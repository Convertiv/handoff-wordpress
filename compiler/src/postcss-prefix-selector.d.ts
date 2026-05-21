declare module 'postcss-prefix-selector' {
  import type { PluginCreator } from 'postcss';

  interface PrefixSelectorOptions {
    prefix?: string;
    transform?: (
      prefix: string,
      selector: string,
      prefixedSelector: string,
      filePath?: string,
      rule?: unknown,
    ) => string;
  }

  const prefixSelector: PluginCreator<PrefixSelectorOptions>;
  export default prefixSelector;
}
