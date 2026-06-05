"use strict";
/**
 * Postprocessing utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postprocessJsx = exports.postprocessTemplateLiterals = exports.extractImgAttributes = void 0;
const node_html_parser_1 = require("node-html-parser");
const button_schema_1 = require("../button-schema");
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
const preprocessors_1 = require("./preprocessors");
const node_converter_1 = require("./node-converter");
const AUTOWRAP_TYPES = new Set(['text', 'richtext']);
const cssPropToJsx = (prop) => prop.trim().replace(/-([a-z])/g, (_, char) => char.toUpperCase());
/**
 * Parse the original `<img>` inside a `#field` block so layout classes and
 * inline styles survive compilation into the editor `<Image>` component.
 */
const extractImgAttributes = (content) => {
    const imgMatch = content.match(/<img[\s\S]*?\/?>/i);
    if (!imgMatch) {
        return { className: 'handoff-editable-field', styleAttr: '', size: 'large' };
    }
    const imgTag = imgMatch[0];
    const classMatch = imgTag.match(/\bclass=["']([^"']*)["']/i);
    const originalClasses = classMatch?.[1]?.trim() ?? '';
    const className = originalClasses
        ? `handoff-editable-field ${originalClasses}`
        : 'handoff-editable-field';
    const styleMatch = imgTag.match(/\bstyle=["']([^"']*)["']/i);
    let styleAttr = '';
    if (styleMatch?.[1]) {
        const styleEntries = styleMatch[1]
            .split(';')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
            const colonIndex = entry.indexOf(':');
            if (colonIndex === -1) {
                return null;
            }
            const key = cssPropToJsx(entry.slice(0, colonIndex));
            const value = entry.slice(colonIndex + 1).trim().replace(/'/g, "\\'");
            return `${key}: '${value}'`;
        })
            .filter(Boolean);
        if (styleEntries.length > 0) {
            styleAttr = `\n            style={{ ${styleEntries.join(', ')} }}`;
        }
    }
    let size = 'large';
    if (/\b(?:size|w|h)-(?:10|16)\b/.test(originalClasses)) {
        size = 'thumbnail';
    }
    return { className, styleAttr, size };
};
exports.extractImgAttributes = extractImgAttributes;
/**
 * Auto-wrap bare {{this.fieldName}} expressions inside loop content with
 * editable-field-marker elements when the corresponding array item property
 * is text or richtext. This makes array item fields inline-editable even
 * when the Handoff API template omits explicit {{#field}} markers.
 *
 * Only wraps expressions that appear as direct text content between HTML tags
 * (not inside attribute values).
 */
const autoWrapArrayFields = (innerContent, arrayPropPath, properties) => {
    const arrayProp = lookupArrayProperty(arrayPropPath, properties);
    if (!arrayProp?.items?.properties)
        return innerContent;
    const itemProps = arrayProp.items.properties;
    let result = innerContent;
    // Find {{this.fieldName}} or {{{this.fieldName}}} expressions that are NOT already
    // inside {{#field}} markers and NOT inside HTML attribute values.
    const thisFieldRegex = /\{\{\{?\s*this\.(\w+)\s*\}\}\}?/g;
    let match;
    const replacements = [];
    while ((match = thisFieldRegex.exec(result)) !== null) {
        const fieldName = match[1];
        const itemProp = itemProps[fieldName];
        if (!itemProp || !AUTOWRAP_TYPES.has(itemProp.type))
            continue;
        // Skip if already wrapped in {{#field}}
        const before = result.substring(Math.max(0, match.index - 200), match.index);
        if (before.includes('{{#field') && !before.includes('{{/field}}'))
            continue;
        // Skip if inside an attribute value (check for odd number of quotes before match)
        const lastTagStart = result.lastIndexOf('<', match.index);
        if (lastTagStart !== -1) {
            const segment = result.substring(lastTagStart, match.index);
            const segmentNoHbs = segment.replace(/\{\{[\s\S]*?\}\}/g, '');
            const quoteCount = (segmentNoHbs.match(/"/g) || []).length;
            if (quoteCount % 2 === 1)
                continue;
        }
        replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            fieldName,
            fieldType: itemProp.type,
        });
    }
    // Apply replacements in reverse order to preserve positions
    for (let i = replacements.length - 1; i >= 0; i--) {
        const r = replacements[i];
        const fieldPath = `${arrayPropPath}.${r.fieldName}`;
        const fieldInfo = Buffer.from(JSON.stringify({
            path: fieldPath,
            type: r.fieldType,
            content: `{{this.${r.fieldName}}}`,
        })).toString('base64');
        const marker = `<editable-field-marker data-field="${fieldInfo}"></editable-field-marker>`;
        result = result.substring(0, r.start) + marker + result.substring(r.end);
    }
    return result;
};
/** Resolve an array property from a dot-path like "items" or "jumpNav.links" */
const lookupArrayProperty = (propPath, properties) => {
    const parts = propPath.split('.');
    let current = properties;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const prop = current[part] || current[(0, utils_1.toCamelCase)(part)];
        if (!prop)
            return null;
        if (i === parts.length - 1)
            return prop.type === 'array' ? prop : null;
        if (prop.type === 'array' && prop.items?.properties) {
            current = prop.items.properties;
        }
        else if (prop.type === 'object' && prop.properties) {
            current = prop.properties;
        }
        else {
            return null;
        }
    }
    return null;
};
/**
 * Post-process to convert template literal markers back to actual template literals
 */
const postprocessTemplateLiterals = (jsx) => {
    return jsx.replace(/__TEMPLATE_LITERAL__([A-Za-z0-9+/=]+)__END_TEMPLATE_LITERAL__/g, (_, encoded) => {
        const decoded = Buffer.from(encoded, 'base64').toString();
        return '`' + decoded + '`';
    });
};
exports.postprocessTemplateLiterals = postprocessTemplateLiterals;
/**
 * Post-process JSX to convert markers back to JSX logic
 */
const postprocessJsx = (jsx, context, parentLoopVar = 'item', innerBlocksField) => {
    let result = jsx;
    // Convert top-level loop markers WITH alias (properties.xxx or properties.xxx.yyy as |alias|) to JSX map expressions
    // Handle both hyphenated (data-prop) and camelCase (dataProp) attribute names
    // data-prop now contains paths like "jumpNav.links" for nested property access
    result = result.replace(/<loop-marker\s+(?:data-prop|dataProp)="([\w.]+)"\s+(?:data-type|dataType)="properties"\s+(?:data-alias|dataAlias)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/loop-marker>)/gi, (_, propPath, aliasName, encodedContent) => {
        let innerContent = Buffer.from(encodedContent, 'base64').toString();
        // Replace {{alias.field}} and {{ alias.field.subfield }} references with {{this.field}} before processing
        // This normalizes the alias to the standard 'this.' format
        // Handle both single and nested property access (e.g., card.link.url -> this.link.url)
        const aliasDeepRegex = new RegExp(`\\{\\{\\s*${aliasName}\\.(\\w+)\\.(\\w+)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasDeepRegex, '{{this.$1.$2}}');
        const aliasRegex = new RegExp(`\\{\\{\\s*${aliasName}\\.(\\w+)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasRegex, '{{this.$1}}');
        // IMPORTANT: Also replace conditionals that use the alias, e.g. {{#if alias.field}} -> {{#if this.field}}
        // This handles patterns like {{#if testimonial.image}} inside {{#each properties.testimonials as |testimonial|}}
        const aliasIfRegex = new RegExp(`\\{\\{#if\\s+${aliasName}\\.(\\w+(?:\\.\\w+)*)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasIfRegex, '{{#if this.$1}}');
        // Also handle {{#unless alias.field}}
        const aliasUnlessRegex = new RegExp(`\\{\\{#unless\\s+${aliasName}\\.(\\w+(?:\\.\\w+)*)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasUnlessRegex, '{{#unless this.$1}}');
        // Also handle nested {{#each alias.field as |nestedAlias|}} loops
        // This converts e.g. {{#each post.tags as |tag|}} -> {{#each this.tags as |tag|}}
        const aliasEachRegex = new RegExp(`\\{\\{#each\\s+${aliasName}\\.(\\w+(?:\\.\\w+)*)\\s+as\\s+\\|([^|]+)\\|\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasEachRegex, '{{#each this.$1 as |$2|}}');
        // Also handle {{#each alias.field}} without alias (less common but possible)
        const aliasEachNoAliasRegex = new RegExp(`\\{\\{#each\\s+${aliasName}\\.(\\w+(?:\\.\\w+)*)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasEachNoAliasRegex, '{{#each this.$1}}');
        // Auto-wrap bare {{this.xxx}} text/richtext fields with editable markers
        innerContent = autoWrapArrayFields(innerContent, propPath, context.properties);
        // Use the alias name from the Handlebars template as the loop variable
        const loopVarName = aliasName || 'item';
        const loopContext = {
            ...context,
            loopVariable: loopVarName,
            loopIndex: 'index',
            loopArray: propPath,
            inLoop: true
        };
        // Parse and convert inner content (pass propPath so attribute conditionals and {{#unless @last}} get correct array name)
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, propPath, loopVarName);
        const preprocessed = (0, preprocessors_1.preprocessBlocks)(cleanedInner, propPath);
        const root = (0, node_html_parser_1.parse)(preprocessed, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, loopContext);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, loopContext, loopVarName, innerBlocksField);
        // propPath can be "items" or "jumpNav.links" - use as-is for the map expression
        return `{${propPath} && ${propPath}.map((${loopVarName}, index) => (
        <Fragment key={index}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    });
    // Convert top-level loop markers WITHOUT alias (properties.xxx or properties.xxx.yyy) to JSX map expressions
    // Handle both hyphenated and camelCase attribute names
    // data-prop now contains paths like "jumpNav.links" for nested property access
    result = result.replace(/<loop-marker\s+(?:data-prop|dataProp)="([\w.]+)"\s+(?:data-type|dataType)="properties"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/loop-marker>)/gi, (_, propPath, encodedContent) => {
        let innerContent = Buffer.from(encodedContent, 'base64').toString();
        // Auto-wrap bare {{this.xxx}} text/richtext fields with editable markers
        innerContent = autoWrapArrayFields(innerContent, propPath, context.properties);
        const loopContext = {
            ...context,
            loopVariable: 'item',
            loopIndex: 'index',
            loopArray: propPath,
            inLoop: true
        };
        // Parse and convert inner content (pass propPath for attribute conditionals and unless-last data-array)
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, propPath, 'item');
        const preprocessed = (0, preprocessors_1.preprocessBlocks)(cleanedInner, propPath);
        const root = (0, node_html_parser_1.parse)(preprocessed, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, loopContext);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, loopContext, 'item', innerBlocksField);
        // propPath can be "items" or "jumpNav.links" - use as-is for the map expression
        return `{${propPath} && ${propPath}.map((item, index) => (
        <Fragment key={index}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    });
    // Convert nested loop markers WITH alias (this.xxx as |alias|) to JSX map expressions FIRST
    // Handle both hyphenated and camelCase attribute names
    result = result.replace(/<nested-loop-marker\s+(?:data-prop|dataProp)="([\w.]+)"\s+(?:data-alias|dataAlias)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/nested-loop-marker>)/gi, (_, propName, aliasName, encodedContent) => {
        let innerContent = Buffer.from(encodedContent, 'base64').toString();
        // Replace alias references with this. references before processing
        // e.g., {{tag.url}} -> {{this.url}}, {{tag.label}} -> {{this.label}}
        const aliasDeepRegex = new RegExp(`\\{\\{\\s*${aliasName}\\.(\\w+)\\.(\\w+)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasDeepRegex, '{{this.$1.$2}}');
        const aliasRegex = new RegExp(`\\{\\{\\s*${aliasName}\\.(\\w+)\\s*\\}\\}`, 'g');
        innerContent = innerContent.replace(aliasRegex, '{{this.$1}}');
        // Use the alias name from the Handlebars template as the nested loop variable
        const nestedVar = aliasName || 'subItem';
        const nestedIndex = `${nestedVar}Index`;
        const arrayRef = (0, expression_parser_1.toOptionalChainedAccess)(parentLoopVar, propName);
        const nestedContext = {
            ...context,
            loopVariable: nestedVar,
            loopIndex: nestedIndex,
            loopArray: arrayRef,
            inLoop: true
        };
        // Parse and convert inner content with the nested loop variable (pass arrayRef for attribute conditionals and unless-last data-array)
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, arrayRef, nestedVar);
        const preprocessed = (0, preprocessors_1.preprocessBlocks)(cleanedInner, arrayRef);
        const root = (0, node_html_parser_1.parse)(preprocessed, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, nestedContext);
        // Replace references to use the nested variable
        innerJsx = innerJsx.replace(/\{item\./g, `{${nestedVar}.`);
        innerJsx = innerJsx.replace(/\{item\}/g, `{${nestedVar}}`);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, nestedContext, nestedVar, innerBlocksField);
        return `{${arrayRef} && ${arrayRef}.map((${nestedVar}, ${nestedIndex}) => (
        <Fragment key={${nestedIndex}}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    });
    // Convert nested loop markers WITHOUT alias (this.xxx) to JSX map expressions
    // Handle both hyphenated and camelCase attribute names
    result = result.replace(/<nested-loop-marker\s+(?:data-prop|dataProp)="([\w.]+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/nested-loop-marker>)/gi, (_, propName, encodedContent) => {
        const innerContent = Buffer.from(encodedContent, 'base64').toString();
        // Use a different variable name for nested loops to avoid shadowing
        const nestedVar = 'subItem';
        const nestedIndex = 'subIndex';
        const arrayRef = (0, expression_parser_1.toOptionalChainedAccess)(parentLoopVar, propName);
        const nestedContext = {
            ...context,
            loopVariable: nestedVar,
            loopIndex: nestedIndex,
            loopArray: arrayRef,
            inLoop: true
        };
        // Parse and convert inner content with the nested loop variable (pass arrayRef for attribute conditionals and unless-last data-array)
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, arrayRef, nestedVar);
        const preprocessed = (0, preprocessors_1.preprocessBlocks)(cleanedInner, arrayRef);
        const root = (0, node_html_parser_1.parse)(preprocessed, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, nestedContext);
        // Replace references to use the nested variable
        innerJsx = innerJsx.replace(/\{item\./g, `{${nestedVar}.`);
        innerJsx = innerJsx.replace(/\{item\}/g, `{${nestedVar}}`);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, nestedContext, nestedVar, innerBlocksField);
        return `{${arrayRef} && ${arrayRef}.map((${nestedVar}, ${nestedIndex}) => (
        <Fragment key={${nestedIndex}}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    });
    // Convert unless-last markers (data-array when present comes from preprocessor when inside {{#each}} so expansion works without loop context)
    // Handle both hyphenated and camelCase attribute names; attribute order: data-content then optional data-array
    result = result.replace(/<unless-last-marker\s+(?:data-content|dataContent)="([^"]+)"\s*(?:(?:data-array|dataArray)="([^"]+)"\s*)?(?:\/>|><\/unless-last-marker>)/gi, (_, encodedContent, dataArray) => {
        const innerContent = Buffer.from(encodedContent, 'base64').toString();
        const arrayName = dataArray || context.loopArray || 'items';
        // Use context with loopArray so attribute values (e.g. className) that reference @last get the correct array name
        const expandContext = { ...context, loopArray: arrayName };
        // Parse inner content
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent);
        const root = (0, node_html_parser_1.parse)(cleanedInner, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, expandContext);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, expandContext, parentLoopVar, innerBlocksField);
        return `{index < ${arrayName}?.length - 1 && (
        <Fragment>
          ${innerJsx.trim()}
        </Fragment>
      )}`;
    });
    // Convert unless-first markers
    // Handle both hyphenated and camelCase attribute names
    result = result.replace(/<unless-first-marker\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/unless-first-marker>)/gi, (_, encodedContent) => {
        const innerContent = Buffer.from(encodedContent, 'base64').toString();
        // Parse inner content
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent);
        const root = (0, node_html_parser_1.parse)(cleanedInner, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, context);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, context, parentLoopVar, innerBlocksField);
        // @first is true when index === 0, so unless @first means index !== 0
        return `{index !== 0 && (
        <Fragment>
          ${innerJsx.trim()}
        </Fragment>
      )}`;
    });
    // Convert if markers (without else)
    // Handle both hyphenated (data-condition) and camelCase (dataCondition) attribute names
    result = result.replace(/<if-marker\s+(?:data-condition|dataCondition)="([^"]+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/if-marker>)/gi, (_, encodedCondition, encodedContent) => {
        const condition = Buffer.from(encodedCondition, 'base64').toString();
        const innerContent = Buffer.from(encodedContent, 'base64').toString();
        const expr = (0, expression_parser_1.transpileExpression)(condition, context, parentLoopVar);
        // Parse inner content
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent);
        const preprocessed = (0, preprocessors_1.preprocessBlocks)(cleanedInner);
        const root = (0, node_html_parser_1.parse)(preprocessed, { lowerCaseTagName: false, comment: false });
        let innerJsx = (0, node_converter_1.nodeToJsx)(root, context);
        innerJsx = (0, exports.postprocessJsx)(innerJsx, context, parentLoopVar, innerBlocksField);
        return `{${expr} && (
        <Fragment>
          ${innerJsx.trim()}
        </Fragment>
      )}`;
    });
    // Convert if-else markers (with else) to ternary expressions
    // Handle both hyphenated and camelCase attribute names
    result = result.replace(/<if-else-marker\s+(?:data-condition|dataCondition)="([^"]+)"\s+(?:data-if-content|dataIfContent)="([^"]+)"\s+(?:data-else-content|dataElseContent)="([^"]+)"\s*(?:\/>|><\/if-else-marker>)/gi, (_, encodedCondition, encodedIfContent, encodedElseContent) => {
        const condition = Buffer.from(encodedCondition, 'base64').toString();
        const ifContent = Buffer.from(encodedIfContent, 'base64').toString();
        const elseContent = Buffer.from(encodedElseContent, 'base64').toString();
        const expr = (0, expression_parser_1.transpileExpression)(condition, context, parentLoopVar);
        // Parse if content
        const cleanedIf = (0, preprocessors_1.cleanTemplate)(ifContent);
        const preprocessedIf = (0, preprocessors_1.preprocessBlocks)(cleanedIf);
        const rootIf = (0, node_html_parser_1.parse)(preprocessedIf, { lowerCaseTagName: false, comment: false });
        let ifJsx = (0, node_converter_1.nodeToJsx)(rootIf, context);
        ifJsx = (0, exports.postprocessJsx)(ifJsx, context, parentLoopVar, innerBlocksField);
        // Parse else content
        const cleanedElse = (0, preprocessors_1.cleanTemplate)(elseContent);
        const preprocessedElse = (0, preprocessors_1.preprocessBlocks)(cleanedElse);
        const rootElse = (0, node_html_parser_1.parse)(preprocessedElse, { lowerCaseTagName: false, comment: false });
        let elseJsx = (0, node_converter_1.nodeToJsx)(rootElse, context);
        elseJsx = (0, exports.postprocessJsx)(elseJsx, context, parentLoopVar, innerBlocksField);
        return `{${expr} ? (
        <Fragment>
          ${ifJsx.trim()}
        </Fragment>
      ) : (
        <Fragment>
          ${elseJsx.trim()}
        </Fragment>
      )}`;
    });
    // Convert if-elseif markers (with else-if chain) to nested ternary expressions
    // Handle both hyphenated and camelCase attribute names
    result = result.replace(/<if-elseif-marker\s+(?:data-condition|dataCondition)="([^"]+)"\s+(?:data-if-content|dataIfContent)="([^"]+)"\s+(?:data-nested-marker|dataNestedMarker)="([^"]+)"\s*(?:\/>|><\/if-elseif-marker>)/gi, (_, encodedCondition, encodedIfContent, encodedNestedMarker) => {
        const condition = Buffer.from(encodedCondition, 'base64').toString();
        const ifContent = Buffer.from(encodedIfContent, 'base64').toString();
        const nestedMarker = Buffer.from(encodedNestedMarker, 'base64').toString();
        const expr = (0, expression_parser_1.transpileExpression)(condition, context, parentLoopVar);
        // Parse if content
        const cleanedIf = (0, preprocessors_1.cleanTemplate)(ifContent);
        const preprocessedIf = (0, preprocessors_1.preprocessBlocks)(cleanedIf);
        const rootIf = (0, node_html_parser_1.parse)(preprocessedIf, { lowerCaseTagName: false, comment: false });
        let ifJsx = (0, node_converter_1.nodeToJsx)(rootIf, context);
        ifJsx = (0, exports.postprocessJsx)(ifJsx, context, parentLoopVar, innerBlocksField);
        // The nested marker is already a preprocessed if/if-else/if-elseif marker
        // We need to parse it through HTML parser and process it
        const rootNested = (0, node_html_parser_1.parse)(nestedMarker, { lowerCaseTagName: false, comment: false });
        let nestedJsx = (0, node_converter_1.nodeToJsx)(rootNested, context);
        nestedJsx = (0, exports.postprocessJsx)(nestedJsx, context, parentLoopVar, innerBlocksField);
        // The nested JSX should be a conditional expression like {condition ? ... : ...}
        // We need to extract the inner part and chain it
        const trimmedNested = nestedJsx.trim();
        // Check if it starts with { and ends with }
        if (trimmedNested.startsWith('{') && trimmedNested.endsWith('}')) {
            // Extract the inner expression (remove outer braces)
            const innerExpr = trimmedNested.slice(1, -1).trim();
            return `{${expr} ? (
        <Fragment>
          ${ifJsx.trim()}
        </Fragment>
      ) : ${innerExpr}}`;
        }
        else {
            // Fallback - just use null for the else case
            return `{${expr} ? (
        <Fragment>
          ${ifJsx.trim()}
        </Fragment>
      ) : null}`;
        }
    });
    // Convert editable field markers to appropriate components based on field type
    // Handle both hyphenated and camelCase attribute names
    result = result.replace(/<editable-field-marker\s+(?:data-field|dataField)="([^"]+)"\s*(?:\/>|><\/editable-field-marker>)/gi, (_, encodedFieldInfo) => {
        try {
            const fieldInfo = JSON.parse(Buffer.from(encodedFieldInfo, 'base64').toString());
            const { path, type, content } = fieldInfo;
            // Parse the path to determine how to set attributes
            const pathParts = path.split('.');
            const isArrayField = pathParts.length > 1;
            // Convert the content (which contains Handlebars expressions) to JSX value reference
            // Extract the property reference from content like {{properties.title}} or {{crumb.label}}
            let valueExpr;
            let onChangeExpr;
            let imageIdExpr = '';
            let imageOnSelectExpr = '';
            if (pathParts.length === 1) {
                // Top-level field: "title" -> title, setAttributes({ title: value })
                const propName = (0, utils_1.toCamelCase)(pathParts[0]);
                valueExpr = `${propName} || ''`;
                onChangeExpr = `(value) => setAttributes({ ${propName}: value })`;
                // For images, we need to handle the id and full image object
                imageIdExpr = `${propName}?.id`;
                imageOnSelectExpr = `(image) => setAttributes({ ${propName}: { id: image.id, src: image.url, alt: image.alt || '' } })`;
            }
            else if (pathParts.length === 2) {
                // Could be nested object "button.text" or array field "breadcrumbs.label"
                const parentName = (0, utils_1.toCamelCase)(pathParts[0]);
                const fieldName = pathParts[1];
                const parentProp = context.properties[pathParts[0]] || context.properties[parentName];
                if (parentProp?.type === 'array') {
                    // Array field: use loop context
                    valueExpr = `${parentLoopVar}.${fieldName} || ''`;
                    onChangeExpr = `(value) => {
              const newItems = [...${parentName}];
              newItems[index] = { ...newItems[index], ${fieldName}: value };
              setAttributes({ ${parentName}: newItems });
            }`;
                    // For images in arrays
                    imageIdExpr = `${parentLoopVar}.${fieldName}?.id`;
                    imageOnSelectExpr = `(image) => {
              const newItems = [...${parentName}];
              newItems[index] = { ...newItems[index], ${fieldName}: { id: image.id, src: image.url, alt: image.alt || '' } };
              setAttributes({ ${parentName}: newItems });
            }`;
                }
                else {
                    // Nested object field
                    valueExpr = `${parentName}?.${fieldName} || ''`;
                    onChangeExpr = `(value) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: value } })`;
                    // For images in nested objects
                    imageIdExpr = `${parentName}?.${fieldName}?.id`;
                    imageOnSelectExpr = `(image) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: { id: image.id, src: image.url, alt: image.alt || '' } } })`;
                }
            }
            else {
                // Deeply nested - default to simpler handling
                const propName = (0, utils_1.toCamelCase)(pathParts[0]);
                valueExpr = `${parentLoopVar}.${pathParts[pathParts.length - 1]} || ''`;
                onChangeExpr = `(value) => {
            const newItems = [...${propName}];
            newItems[index] = { ...newItems[index], ${pathParts[pathParts.length - 1]}: value };
            setAttributes({ ${propName}: newItems });
          }`;
                // For images in deeply nested paths
                const lastField = pathParts[pathParts.length - 1];
                imageIdExpr = `${parentLoopVar}.${lastField}?.id`;
                imageOnSelectExpr = `(image) => {
            const newItems = [...${propName}];
            newItems[index] = { ...newItems[index], ${lastField}: { id: image.id, src: image.url, alt: image.alt || '' } };
            setAttributes({ ${propName}: newItems });
          }`;
            }
            // Generate appropriate component based on field type
            if (type === 'image') {
                const { className: imageClassName, styleAttr: imageStyleAttr, size: imageSize } = (0, exports.extractImgAttributes)(content || '');
                // Use 10up Image component for inline-editable images
                return `<Image
            id={${imageIdExpr}}
            className="${imageClassName}"
            onSelect={${imageOnSelectExpr}}
            size="${imageSize}"${imageStyleAttr}
          />`;
            }
            else if (type === 'richtext') {
                // Extract the top-level field name from the path (e.g. "content" from "content")
                const topLevelField = path.split('.')[0];
                if (innerBlocksField && topLevelField === innerBlocksField) {
                    return `<InnerBlocks allowedBlocks={CONTENT_BLOCKS} />`;
                }
                // Richtext without InnerBlocks: use RichText with formatting allowed
                return `<RichText
            tagName="div"
            className="handoff-editable-field"
            value={${valueExpr}}
            onChange={${onChangeExpr}}
            placeholder={__('Enter content...', 'handoff')}
          />`;
            }
            else if (type === 'link' || type === 'button') {
                const safeId = path.replace(/\./g, '_');
                const objRef = valueExpr.replace(/ \|\| ''$/, '');
                const isLink = type === 'link';
                const parentPathKey = pathParts[0];
                const buttonParentProp = !isLink && context.properties
                    ? context.properties[parentPathKey] ?? context.properties[(0, utils_1.toCamelCase)(parentPathKey)]
                    : undefined;
                const buttonKeys = !isLink ? (0, button_schema_1.resolveButtonFieldKeys)(buttonParentProp) : null;
                const labelValueExpr = isLink
                    ? `${objRef}?.label || ''`
                    : `${objRef}?.${buttonKeys.labelKey} || ''`;
                const urlExpr = isLink
                    ? `${objRef}?.url || ''`
                    : `${objRef}?.${buttonKeys.urlKey} || '${(0, button_schema_1.getButtonUrlFallback)(buttonKeys.urlKey)}'`;
                const newTabExpr = isLink ? `${objRef}?.opensInNewTab || false` : `${objRef}?.target === '_blank'`;
                const labelMerge = isLink
                    ? `{ ...${objRef}, label: value }`
                    : (0, button_schema_1.buttonLabelMergeJs)(objRef, buttonKeys);
                const linkMerge = isLink
                    ? `{ ...${objRef}, url: value.url || '', opensInNewTab: value.opensInNewTab || false }`
                    : (0, button_schema_1.buttonLinkMergeJs)(objRef, buttonKeys);
                // Build onChange handlers from scratch based on field context
                let labelOnChange;
                let linkOnChange;
                if (pathParts.length === 1) {
                    const propName = (0, utils_1.toCamelCase)(pathParts[0]);
                    labelOnChange = `(value) => setAttributes({ ${propName}: ${labelMerge} })`;
                    linkOnChange = `(value) => setAttributes({ ${propName}: ${linkMerge} })`;
                }
                else if (pathParts.length === 2) {
                    const parentName = (0, utils_1.toCamelCase)(pathParts[0]);
                    const fieldName = pathParts[1];
                    const parentProp = context.properties[pathParts[0]] || context.properties[parentName];
                    if (parentProp?.type === 'array') {
                        labelOnChange = `(value) => {
              const newItems = [...${parentName}];
              newItems[index] = { ...newItems[index], ${fieldName}: ${labelMerge} };
              setAttributes({ ${parentName}: newItems });
            }`;
                        linkOnChange = `(value) => {
              const newItems = [...${parentName}];
              newItems[index] = { ...newItems[index], ${fieldName}: ${linkMerge} };
              setAttributes({ ${parentName}: newItems });
            }`;
                    }
                    else {
                        labelOnChange = `(value) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: ${labelMerge} } })`;
                        linkOnChange = `(value) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: ${linkMerge} } })`;
                    }
                }
                else {
                    const propName = (0, utils_1.toCamelCase)(pathParts[0]);
                    const lastField = pathParts[pathParts.length - 1];
                    labelOnChange = `(value) => {
              const newItems = [...${propName}];
              newItems[index] = { ...newItems[index], ${lastField}: ${labelMerge} };
              setAttributes({ ${propName}: newItems });
            }`;
                    linkOnChange = `(value) => {
              const newItems = [...${propName}];
              newItems[index] = { ...newItems[index], ${lastField}: ${linkMerge} };
              setAttributes({ ${propName}: newItems });
            }`;
                }
                return `<HandoffLinkField
            fieldId="${safeId}"
            label={${labelValueExpr}}
            url={${urlExpr}}
            opensInNewTab={${newTabExpr}}
            onLabelChange={${labelOnChange}}
            onLinkChange={${linkOnChange}}
            isSelected={isSelected}
          />`;
            }
            else {
                // For text fields, use RichText with no allowed formats for inline contenteditable editing
                return `<RichText
            tagName="span"
            className="handoff-editable-field"
            value={${valueExpr}}
            onChange={${onChangeExpr}}
            allowedFormats={[]}
            placeholder={__('Enter text...', 'handoff')}
          />`;
            }
        }
        catch (e) {
            // If parsing fails, just return empty
            return '';
        }
    });
    // Final cleanup - convert any remaining class= to className=
    result = result.replace(/\bclass="/g, 'className="');
    // Remove empty className attributes
    result = result.replace(/\s+className=""/g, '');
    return result;
};
exports.postprocessJsx = postprocessJsx;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zdHByb2Nlc3NvcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9wb3N0cHJvY2Vzc29ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILHVEQUFzRDtBQUd0RCxvREFLMEI7QUFDMUIsbUNBQXNDO0FBQ3RDLDJEQUFtRjtBQUNuRixtREFBa0U7QUFFbEUscURBQTZDO0FBRTdDLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFRckQsTUFBTSxZQUFZLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRSxDQUM1QyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFZLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRTVFOzs7R0FHRztBQUNJLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxPQUFlLEVBQTBCLEVBQUU7SUFDOUUsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3BELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLE9BQU8sRUFBRSxTQUFTLEVBQUUsd0JBQXdCLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUM7SUFDL0UsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLDJCQUEyQixDQUFDLENBQUM7SUFDN0QsTUFBTSxlQUFlLEdBQUcsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3RELE1BQU0s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TyxDQUFDO29CQUNqSCxDQUFDO2dCQUNILENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLFFBQVEsR0FBRyxJQUFBLG1CQUFXLEVBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzNDLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNsRCxhQUFhLEdBQUc7cUNBQ1MsUUFBUTt3REFDVyxTQUFTLEtBQUssVUFBVTtnQ0FDaEQsUUFBUTtjQUMxQixDQUFDO29CQUNILFlBQVksR0FBRztxQ0FDVSxRQUFRO3dEQUNXLFNBQVMsS0FBSyxTQUFTO2dDQUMvQyxRQUFRO2NBQzFCLENBQUM7Z0JBQ0wsQ0FBQztnQkFFRCxPQUFPO3VCQUNNLE1BQU07cUJBQ1IsY0FBYzttQkFDaEIsT0FBTzs2QkFDRyxVQUFVOzZCQUNWLGFBQWE7NEJBQ2QsWUFBWTs7YUFFM0IsQ0FBQztZQUNOLENBQUM7aUJBQU0sQ0FBQztnQkFDTiwyRkFBMkY7Z0JBQzNGLE9BQU87OztxQkFHSSxTQUFTO3dCQUNOLFlBQVk7OzthQUd2QixDQUFDO1lBQ04sQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1gsc0NBQXNDO1lBQ3RDLE9BQU8sRUFBRSxDQUFDO1FBQ1osQ0FBQztJQUNILENBQUMsQ0FDRixDQUFDO0lBRUYsNkRBQTZEO0lBQzdELE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsQ0FBQztJQUVyRCxvQ0FBb0M7SUFDcEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFaEQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBamlCVyxRQUFBLGNBQWMsa0JBaWlCekIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBvc3Rwcm9jZXNzaW5nIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUhUTUwgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0LCBGaWVsZEluZm8gfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IEhhbmRvZmZQcm9wZXJ0eSB9IGZyb20gJy4uLy4uL3R5cGVzJztcbmltcG9ydCB7XG4gIHJlc29sdmVCdXR0b25GaWVsZEtleXMsXG4gIGJ1dHRvbkxhYmVsTWVyZ2VKcyxcbiAgYnV0dG9uTGlua01lcmdlSnMsXG4gIGdldEJ1dHRvblVybEZhbGxiYWNrLFxufSBmcm9tICcuLi9idXR0b24tc2NoZW1hJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyB0cmFuc3BpbGVFeHByZXNzaW9uLCB0b09wdGlvbmFsQ2hhaW5lZEFjY2VzcyB9IGZyb20gJy4vZXhwcmVzc2lvbi1wYXJzZXInO1xuaW1wb3J0IHsgY2xlYW5UZW1wbGF0ZSwgcHJlcHJvY2Vzc0Jsb2NrcyB9IGZyb20gJy4vcHJlcHJvY2Vzc29ycyc7XG5pbXBvcnQgeyBsb29rdXBGaWVsZFR5cGUgfSBmcm9tICcuL2ZpZWxkLWxvb2t1cCc7XG5pbXBvcnQgeyBub2RlVG9Kc3ggfSBmcm9tICcuL25vZGUtY29udmVydGVyJztcblxuY29uc3QgQVVUT1dSQVBfVFlQRVMgPSBuZXcgU2V0KFsndGV4dCcsICdyaWNodGV4dCddKTtcblxuaW50ZXJmYWNlIEV4dHJhY3RlZEltZ0F0dHJpYnV0ZXMge1xuICBjbGFzc05hbWU6IHN0cmluZztcbiAgc3R5bGVBdHRyOiBzdHJpbmc7XG4gIHNpemU6IHN0cmluZztcbn1cblxuY29uc3QgY3NzUHJvcFRvSnN4ID0gKHByb3A6IHN0cmluZyk6IHN0cmluZyA9PlxuICBwcm9wLnRyaW0oKS5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgY2hhcjogc3RyaW5nKSA9PiBjaGFyLnRvVXBwZXJDYXNlKCkpO1xuXG4vKipcbiAqIFBhcnNlIHRoZSBvcmlnaW5hbCBgPGltZz5gIGluc2lkZSBhIGAjZmllbGRgIGJsb2NrIHNvIGxheW91dCBjbGFzc2VzIGFuZFxuICogaW5saW5lIHN0eWxlcyBzdXJ2aXZlIGNvbXBpbGF0aW9uIGludG8gdGhlIGVkaXRvciBgPEltYWdlPmAgY29tcG9uZW50LlxuICovXG5leHBvcnQgY29uc3QgZXh0cmFjdEltZ0F0dHJpYnV0ZXMgPSAoY29udGVudDogc3RyaW5nKTogRXh0cmFjdGVkSW1nQXR0cmlidXRlcyA9PiB7XG4gIGNvbnN0IGltZ01hdGNoID0gY29udGVudC5tYXRjaCgvPGltZ1tcXHNcXFNdKj9cXC8/Pi9pKTtcbiAgaWYgKCFpbWdNYXRjaCkge1xuICAgIHJldHVybiB7IGNsYXNzTmFtZTogJ2hhbmRvZmYtZWRpdGFibGUtZmllbGQnLCBzdHlsZUF0dHI6ICcnLCBzaXplOiAnbGFyZ2UnIH07XG4gIH1cblxuICBjb25zdCBpbWdUYWcgPSBpbWdNYXRjaFswXTtcbiAgY29uc3QgY2xhc3NNYXRjaCA9IGltZ1RhZy5tYXRjaCgvXFxiY2xhc3M9W1wiJ10oW15cIiddKilbXCInXS9pKTtcbiAgY29uc3Qgb3JpZ2luYWxDbGFzc2VzID0gY2xhc3NNYXRjaD8uWzFdPy50cmltKCkgPz8gJyc7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IG9yaWdpbmFsQ2xhc3Nlc1xuICAgID8gYGhhbmRvZmYtZWRpdGFibGUtZmllbGQgJHtvcmlnaW5hbENsYXNzZXN9YFxuICAgIDogJ2hhbmRvZmYtZWRpdGFibGUtZmllbGQnO1xuXG4gIGNvbnN0IHN0eWxlTWF0Y2ggPSBpbWdUYWcubWF0Y2goL1xcYnN0eWxlPVtcIiddKFteXCInXSopW1wiJ10vaSk7XG4gIGxldCBzdHlsZUF0dHIgPSAnJztcbiAgaWYgKHN0eWxlTWF0Y2g/LlsxXSkge1xuICAgIGNvbnN0IHN0eWxlRW50cmllcyA9IHN0eWxlTWF0Y2hbMV1cbiAgICAgIC5zcGxpdCgnOycpXG4gICAgICAubWFwKChlbnRyeSkgPT4gZW50cnkudHJpbSgpKVxuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLm1hcCgoZW50cnkpID0+IHtcbiAgICAgICAgY29uc3QgY29sb25JbmRleCA9IGVudHJ5LmluZGV4T2YoJzonKTtcbiAgICAgICAgaWYgKGNvbG9uSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qga2V5ID0gY3NzUHJvcFRvSnN4KGVudHJ5LnNsaWNlKDAsIGNvbG9uSW5kZXgpKTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBlbnRyeS5zbGljZShjb2xvbkluZGV4ICsgMSkudHJpbSgpLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKTtcbiAgICAgICAgcmV0dXJuIGAke2tleX06ICcke3ZhbHVlfSdgO1xuICAgICAgfSlcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgICBpZiAoc3R5bGVFbnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIHN0eWxlQXR0ciA9IGBcXG4gICAgICAgICAgICBzdHlsZT17eyAke3N0eWxlRW50cmllcy5qb2luKCcsICcpfSB9fWA7XG4gICAgfVxuICB9XG5cbiAgbGV0IHNpemUgPSAnbGFyZ2UnO1xuICBpZiAoL1xcYig/OnNpemV8d3xoKS0oPzoxMHwxNilcXGIvLnRlc3Qob3JpZ2luYWxDbGFzc2VzKSkge1xuICAgIHNpemUgPSAndGh1bWJuYWlsJztcbiAgfVxuXG4gIHJldHVybiB7IGNsYXNzTmFtZSwgc3R5bGVBdHRyLCBzaXplIH07XG59O1xuXG4vKipcbiAqIEF1dG8td3JhcCBiYXJlIHt7dGhpcy5maWVsZE5hbWV9fSBleHByZXNzaW9ucyBpbnNpZGUgbG9vcCBjb250ZW50IHdpdGhcbiAqIGVkaXRhYmxlLWZpZWxkLW1hcmtlciBlbGVtZW50cyB3aGVuIHRoZSBjb3JyZXNwb25kaW5nIGFycmF5IGl0ZW0gcHJvcGVydHlcbiAqIGlzIHRleHQgb3IgcmljaHRleHQuIFRoaXMgbWFrZXMgYXJyYXkgaXRlbSBmaWVsZHMgaW5saW5lLWVkaXRhYmxlIGV2ZW5cbiAqIHdoZW4gdGhlIEhhbmRvZmYgQVBJIHRlbXBsYXRlIG9taXRzIGV4cGxpY2l0IHt7I2ZpZWxkfX0gbWFya2Vycy5cbiAqXG4gKiBPbmx5IHdyYXBzIGV4cHJlc3Npb25zIHRoYXQgYXBwZWFyIGFzIGRpcmVjdCB0ZXh0IGNvbnRlbnQgYmV0d2VlbiBIVE1MIHRhZ3NcbiAqIChub3QgaW5zaWRlIGF0dHJpYnV0ZSB2YWx1ZXMpLlxuICovXG5jb25zdCBhdXRvV3JhcEFycmF5RmllbGRzID0gKFxuICBpbm5lckNvbnRlbnQ6IHN0cmluZyxcbiAgYXJyYXlQcm9wUGF0aDogc3RyaW5nLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgYXJyYXlQcm9wID0gbG9va3VwQXJyYXlQcm9wZXJ0eShhcnJheVByb3BQYXRoLCBwcm9wZXJ0aWVzKTtcbiAgaWYgKCFhcnJheVByb3A/Lml0ZW1zPy5wcm9wZXJ0aWVzKSByZXR1cm4gaW5uZXJDb250ZW50O1xuICBjb25zdCBpdGVtUHJvcHMgPSBhcnJheVByb3AuaXRlbXMucHJvcGVydGllcztcblxuICBsZXQgcmVzdWx0ID0gaW5uZXJDb250ZW50O1xuXG4gIC8vIEZpbmQge3t0aGlzLmZpZWxkTmFtZX19IG9yIHt7e3RoaXMuZmllbGROYW1lfX19IGV4cHJlc3Npb25zIHRoYXQgYXJlIE5PVCBhbHJlYWR5XG4gIC8vIGluc2lkZSB7eyNmaWVsZH19IG1hcmtlcnMgYW5kIE5PVCBpbnNpZGUgSFRNTCBhdHRyaWJ1dGUgdmFsdWVzLlxuICBjb25zdCB0aGlzRmllbGRSZWdleCA9IC9cXHtcXHtcXHs/XFxzKnRoaXNcXC4oXFx3KylcXHMqXFx9XFx9XFx9Py9nO1xuICBsZXQgbWF0Y2g7XG4gIGNvbnN0IHJlcGxhY2VtZW50czogQXJyYXk8eyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgZmllbGROYW1lOiBzdHJpbmc7IGZpZWxkVHlwZTogc3RyaW5nIH0+ID0gW107XG5cbiAgd2hpbGUgKChtYXRjaCA9IHRoaXNGaWVsZFJlZ2V4LmV4ZWMocmVzdWx0KSkgIT09IG51bGwpIHtcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBtYXRjaFsxXTtcbiAgICBjb25zdCBpdGVtUHJvcCA9IGl0ZW1Qcm9wc1tmaWVsZE5hbWVdO1xuICAgIGlmICghaXRlbVByb3AgfHwgIUFVVE9XUkFQX1RZUEVTLmhhcyhpdGVtUHJvcC50eXBlKSkgY29udGludWU7XG5cbiAgICAvLyBTa2lwIGlmIGFscmVhZHkgd3JhcHBlZCBpbiB7eyNmaWVsZH19XG4gICAgY29uc3QgYmVmb3JlID0gcmVzdWx0LnN1YnN0cmluZyhNYXRoLm1heCgwLCBtYXRjaC5pbmRleCAtIDIwMCksIG1hdGNoLmluZGV4KTtcbiAgICBpZiAoYmVmb3JlLmluY2x1ZGVzKCd7eyNmaWVsZCcpICYmICFiZWZvcmUuaW5jbHVkZXMoJ3t7L2ZpZWxkfX0nKSkgY29udGludWU7XG5cbiAgICAvLyBTa2lwIGlmIGluc2lkZSBhbiBhdHRyaWJ1dGUgdmFsdWUgKGNoZWNrIGZvciBvZGQgbnVtYmVyIG9mIHF1b3RlcyBiZWZvcmUgbWF0Y2gpXG4gICAgY29uc3QgbGFzdFRhZ1N0YXJ0ID0gcmVzdWx0Lmxhc3RJbmRleE9mKCc8JywgbWF0Y2guaW5kZXgpO1xuICAgIGlmIChsYXN0VGFnU3RhcnQgIT09IC0xKSB7XG4gICAgICBjb25zdCBzZWdtZW50ID0gcmVzdWx0LnN1YnN0cmluZyhsYXN0VGFnU3RhcnQsIG1hdGNoLmluZGV4KTtcbiAgICAgIGNvbnN0IHNlZ21lbnROb0hicyA9IHNlZ21lbnQucmVwbGFjZSgvXFx7XFx7W1xcc1xcU10qP1xcfVxcfS9nLCAnJyk7XG4gICAgICBjb25zdCBxdW90ZUNvdW50ID0gKHNlZ21lbnROb0hicy5tYXRjaCgvXCIvZykgfHwgW10pLmxlbmd0aDtcbiAgICAgIGlmIChxdW90ZUNvdW50ICUgMiA9PT0gMSkgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVwbGFjZW1lbnRzLnB1c2goe1xuICAgICAgc3RhcnQ6IG1hdGNoLmluZGV4LFxuICAgICAgZW5kOiBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCxcbiAgICAgIGZpZWxkTmFtZSxcbiAgICAgIGZpZWxkVHlwZTogaXRlbVByb3AudHlwZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEFwcGx5IHJlcGxhY2VtZW50cyBpbiByZXZlcnNlIG9yZGVyIHRvIHByZXNlcnZlIHBvc2l0aW9uc1xuICBmb3IgKGxldCBpID0gcmVwbGFjZW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgY29uc3QgciA9IHJlcGxhY2VtZW50c1tpXTtcbiAgICBjb25zdCBmaWVsZFBhdGggPSBgJHthcnJheVByb3BQYXRofS4ke3IuZmllbGROYW1lfWA7XG4gICAgY29uc3QgZmllbGRJbmZvID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgcGF0aDogZmllbGRQYXRoLFxuICAgICAgdHlwZTogci5maWVsZFR5cGUsXG4gICAgICBjb250ZW50OiBge3t0aGlzLiR7ci5maWVsZE5hbWV9fX1gLFxuICAgIH0pKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgY29uc3QgbWFya2VyID0gYDxlZGl0YWJsZS1maWVsZC1tYXJrZXIgZGF0YS1maWVsZD1cIiR7ZmllbGRJbmZvfVwiPjwvZWRpdGFibGUtZmllbGQtbWFya2VyPmA7XG4gICAgcmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZygwLCByLnN0YXJ0KSArIG1hcmtlciArIHJlc3VsdC5zdWJzdHJpbmcoci5lbmQpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKiBSZXNvbHZlIGFuIGFycmF5IHByb3BlcnR5IGZyb20gYSBkb3QtcGF0aCBsaWtlIFwiaXRlbXNcIiBvciBcImp1bXBOYXYubGlua3NcIiAqL1xuY29uc3QgbG9va3VwQXJyYXlQcm9wZXJ0eSA9IChcbiAgcHJvcFBhdGg6IHN0cmluZyxcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IEhhbmRvZmZQcm9wZXJ0eSB8IG51bGwgPT4ge1xuICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCcuJyk7XG4gIGxldCBjdXJyZW50OiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+ID0gcHJvcGVydGllcztcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHBhcnQgPSBwYXJ0c1tpXTtcbiAgICBjb25zdCBwcm9wID0gY3VycmVudFtwYXJ0XSB8fCBjdXJyZW50W3RvQ2FtZWxDYXNlKHBhcnQpXTtcbiAgICBpZiAoIXByb3ApIHJldHVybiBudWxsO1xuICAgIGlmIChpID09PSBwYXJ0cy5sZW5ndGggLSAxKSByZXR1cm4gcHJvcC50eXBlID09PSAnYXJyYXknID8gcHJvcCA6IG51bGw7XG4gICAgaWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zPy5wcm9wZXJ0aWVzKSB7XG4gICAgICBjdXJyZW50ID0gcHJvcC5pdGVtcy5wcm9wZXJ0aWVzO1xuICAgIH0gZWxzZSBpZiAocHJvcC50eXBlID09PSAnb2JqZWN0JyAmJiBwcm9wLnByb3BlcnRpZXMpIHtcbiAgICAgIGN1cnJlbnQgPSBwcm9wLnByb3BlcnRpZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8qKlxuICogUG9zdC1wcm9jZXNzIHRvIGNvbnZlcnQgdGVtcGxhdGUgbGl0ZXJhbCBtYXJrZXJzIGJhY2sgdG8gYWN0dWFsIHRlbXBsYXRlIGxpdGVyYWxzXG4gKi9cbmV4cG9ydCBjb25zdCBwb3N0cHJvY2Vzc1RlbXBsYXRlTGl0ZXJhbHMgPSAoanN4OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4ganN4LnJlcGxhY2UoL19fVEVNUExBVEVfTElURVJBTF9fKFtBLVphLXowLTkrLz1dKylfX0VORF9URU1QTEFURV9MSVRFUkFMX18vZywgKF8sIGVuY29kZWQpID0+IHtcbiAgICBjb25zdCBkZWNvZGVkID0gQnVmZmVyLmZyb20oZW5jb2RlZCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuICdgJyArIGRlY29kZWQgKyAnYCc7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBQb3N0LXByb2Nlc3MgSlNYIHRvIGNvbnZlcnQgbWFya2VycyBiYWNrIHRvIEpTWCBsb2dpY1xuICovXG5leHBvcnQgY29uc3QgcG9zdHByb2Nlc3NKc3ggPSAoanN4OiBzdHJpbmcsIGNvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0LCBwYXJlbnRMb29wVmFyOiBzdHJpbmcgPSAnaXRlbScsIGlubmVyQmxvY2tzRmllbGQ/OiBzdHJpbmcgfCBudWxsKTogc3RyaW5nID0+IHtcbiAgbGV0IHJlc3VsdCA9IGpzeDtcbiAgXG4gIC8vIENvbnZlcnQgdG9wLWxldmVsIGxvb3AgbWFya2VycyBXSVRIIGFsaWFzIChwcm9wZXJ0aWVzLnh4eCBvciBwcm9wZXJ0aWVzLnh4eC55eXkgYXMgfGFsaWFzfCkgdG8gSlNYIG1hcCBleHByZXNzaW9uc1xuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIChkYXRhLXByb3ApIGFuZCBjYW1lbENhc2UgKGRhdGFQcm9wKSBhdHRyaWJ1dGUgbmFtZXNcbiAgLy8gZGF0YS1wcm9wIG5vdyBjb250YWlucyBwYXRocyBsaWtlIFwianVtcE5hdi5saW5rc1wiIGZvciBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88bG9vcC1tYXJrZXJcXHMrKD86ZGF0YS1wcm9wfGRhdGFQcm9wKT1cIihbXFx3Ll0rKVwiXFxzKyg/OmRhdGEtdHlwZXxkYXRhVHlwZSk9XCJwcm9wZXJ0aWVzXCJcXHMrKD86ZGF0YS1hbGlhc3xkYXRhQWxpYXMpPVwiKFxcdyspXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2xvb3AtbWFya2VyPikvZ2ksXG4gICAgKF8sIHByb3BQYXRoLCBhbGlhc05hbWUsIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBsZXQgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgXG4gICAgICAvLyBSZXBsYWNlIHt7YWxpYXMuZmllbGR9fSBhbmQge3sgYWxpYXMuZmllbGQuc3ViZmllbGQgfX0gcmVmZXJlbmNlcyB3aXRoIHt7dGhpcy5maWVsZH19IGJlZm9yZSBwcm9jZXNzaW5nXG4gICAgICAvLyBUaGlzIG5vcm1hbGl6ZXMgdGhlIGFsaWFzIHRvIHRoZSBzdGFuZGFyZCAndGhpcy4nIGZvcm1hdFxuICAgICAgLy8gSGFuZGxlIGJvdGggc2luZ2xlIGFuZCBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzIChlLmcuLCBjYXJkLmxpbmsudXJsIC0+IHRoaXMubGluay51cmwpXG4gICAgICBjb25zdCBhbGlhc0RlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzTmFtZX1cXFxcLihcXFxcdyspXFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsICd7e3RoaXMuJDEuJDJ9fScpO1xuICAgICAgXG4gICAgICBjb25zdCBhbGlhc1JlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzUmVnZXgsICd7e3RoaXMuJDF9fScpO1xuICAgICAgXG4gICAgICAvLyBJTVBPUlRBTlQ6IEFsc28gcmVwbGFjZSBjb25kaXRpb25hbHMgdGhhdCB1c2UgdGhlIGFsaWFzLCBlLmcuIHt7I2lmIGFsaWFzLmZpZWxkfX0gLT4ge3sjaWYgdGhpcy5maWVsZH19XG4gICAgICAvLyBUaGlzIGhhbmRsZXMgcGF0dGVybnMgbGlrZSB7eyNpZiB0ZXN0aW1vbmlhbC5pbWFnZX19IGluc2lkZSB7eyNlYWNoIHByb3BlcnRpZXMudGVzdGltb25pYWxzIGFzIHx0ZXN0aW1vbmlhbHx9fVxuICAgICAgY29uc3QgYWxpYXNJZlJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyNpZlxcXFxzKyR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3Kyg/OlxcXFwuXFxcXHcrKSopXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc0lmUmVnZXgsICd7eyNpZiB0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gQWxzbyBoYW5kbGUge3sjdW5sZXNzIGFsaWFzLmZpZWxkfX1cbiAgICAgIGNvbnN0IGFsaWFzVW5sZXNzUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I3VubGVzc1xcXFxzKyR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3Kyg/OlxcXFwuXFxcXHcrKSopXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc1VubGVzc1JlZ2V4LCAne3sjdW5sZXNzIHRoaXMuJDF9fScpO1xuICAgICAgXG4gICAgICAvLyBBbHNvIGhhbmRsZSBuZXN0ZWQge3sjZWFjaCBhbGlhcy5maWVsZCBhcyB8bmVzdGVkQWxpYXN8fX0gbG9vcHNcbiAgICAgIC8vIFRoaXMgY29udmVydHMgZS5nLiB7eyNlYWNoIHBvc3QudGFncyBhcyB8dGFnfH19IC0+IHt7I2VhY2ggdGhpcy50YWdzIGFzIHx0YWd8fX1cbiAgICAgIGNvbnN0IGFsaWFzRWFjaFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyNlYWNoXFxcXHMrJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKD86XFxcXC5cXFxcdyspKilcXFxccythc1xcXFxzK1xcXFx8KFtefF0rKVxcXFx8XFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc0VhY2hSZWdleCwgJ3t7I2VhY2ggdGhpcy4kMSBhcyB8JDJ8fX0nKTtcbiAgICAgIFxuICAgICAgLy8gQWxzbyBoYW5kbGUge3sjZWFjaCBhbGlhcy5maWVsZH19IHdpdGhvdXQgYWxpYXMgKGxlc3MgY29tbW9uIGJ1dCBwb3NzaWJsZSlcbiAgICAgIGNvbnN0IGFsaWFzRWFjaE5vQWxpYXNSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjZWFjaFxcXFxzKyR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3Kyg/OlxcXFwuXFxcXHcrKSopXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc0VhY2hOb0FsaWFzUmVnZXgsICd7eyNlYWNoIHRoaXMuJDF9fScpO1xuXG4gICAgICAvLyBBdXRvLXdyYXAgYmFyZSB7e3RoaXMueHh4fX0gdGV4dC9yaWNodGV4dCBmaWVsZHMgd2l0aCBlZGl0YWJsZSBtYXJrZXJzXG4gICAgICBpbm5lckNvbnRlbnQgPSBhdXRvV3JhcEFycmF5RmllbGRzKGlubmVyQ29udGVudCwgcHJvcFBhdGgsIGNvbnRleHQucHJvcGVydGllcyk7XG4gICAgICBcbiAgICAgIC8vIFVzZSB0aGUgYWxpYXMgbmFtZSBmcm9tIHRoZSBIYW5kbGViYXJzIHRlbXBsYXRlIGFzIHRoZSBsb29wIHZhcmlhYmxlXG4gICAgICBjb25zdCBsb29wVmFyTmFtZSA9IGFsaWFzTmFtZSB8fCAnaXRlbSc7XG4gICAgICBjb25zdCBsb29wQ29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgICAgIC4uLmNvbnRleHQsXG4gICAgICAgIGxvb3BWYXJpYWJsZTogbG9vcFZhck5hbWUsXG4gICAgICAgIGxvb3BJbmRleDogJ2luZGV4JyxcbiAgICAgICAgbG9vcEFycmF5OiBwcm9wUGF0aCxcbiAgICAgICAgaW5Mb29wOiB0cnVlXG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBhbmQgY29udmVydCBpbm5lciBjb250ZW50IChwYXNzIHByb3BQYXRoIHNvIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgYW5kIHt7I3VubGVzcyBAbGFzdH19IGdldCBjb3JyZWN0IGFycmF5IG5hbWUpXG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCwgcHJvcFBhdGgsIGxvb3BWYXJOYW1lKTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyLCBwcm9wUGF0aCk7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgbG9vcENvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgbG9vcENvbnRleHQsIGxvb3BWYXJOYW1lLCBpbm5lckJsb2Nrc0ZpZWxkKTtcblxuICAgICAgLy8gcHJvcFBhdGggY2FuIGJlIFwiaXRlbXNcIiBvciBcImp1bXBOYXYubGlua3NcIiAtIHVzZSBhcy1pcyBmb3IgdGhlIG1hcCBleHByZXNzaW9uXG4gICAgICByZXR1cm4gYHske3Byb3BQYXRofSAmJiAke3Byb3BQYXRofS5tYXAoKCR7bG9vcFZhck5hbWV9LCBpbmRleCkgPT4gKFxuICAgICAgICA8RnJhZ21lbnQga2V5PXtpbmRleH0+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgdG9wLWxldmVsIGxvb3AgbWFya2VycyBXSVRIT1VUIGFsaWFzIChwcm9wZXJ0aWVzLnh4eCBvciBwcm9wZXJ0aWVzLnh4eC55eXkpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICAvLyBkYXRhLXByb3Agbm93IGNvbnRhaW5zIHBhdGhzIGxpa2UgXCJqdW1wTmF2LmxpbmtzXCIgZm9yIG5lc3RlZCBwcm9wZXJ0eSBhY2Nlc3NcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxsb29wLW1hcmtlclxccysoPzpkYXRhLXByb3B8ZGF0YVByb3ApPVwiKFtcXHcuXSspXCJcXHMrKD86ZGF0YS10eXBlfGRhdGFUeXBlKT1cInByb3BlcnRpZXNcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvbG9vcC1tYXJrZXI+KS9naSxcbiAgICAoXywgcHJvcFBhdGgsIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBsZXQgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuXG4gICAgICAvLyBBdXRvLXdyYXAgYmFyZSB7e3RoaXMueHh4fX0gdGV4dC9yaWNodGV4dCBmaWVsZHMgd2l0aCBlZGl0YWJsZSBtYXJrZXJzXG4gICAgICBpbm5lckNvbnRlbnQgPSBhdXRvV3JhcEFycmF5RmllbGRzKGlubmVyQ29udGVudCwgcHJvcFBhdGgsIGNvbnRleHQucHJvcGVydGllcyk7XG5cbiAgICAgIGNvbnN0IGxvb3BDb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgbG9vcFZhcmlhYmxlOiAnaXRlbScsXG4gICAgICAgIGxvb3BJbmRleDogJ2luZGV4JyxcbiAgICAgICAgbG9vcEFycmF5OiBwcm9wUGF0aCxcbiAgICAgICAgaW5Mb29wOiB0cnVlXG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBhbmQgY29udmVydCBpbm5lciBjb250ZW50IChwYXNzIHByb3BQYXRoIGZvciBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIGFuZCB1bmxlc3MtbGFzdCBkYXRhLWFycmF5KVxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQsIHByb3BQYXRoLCAnaXRlbScpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSW5uZXIsIHByb3BQYXRoKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBsb29wQ29udGV4dCk7XG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBsb29wQ29udGV4dCwgJ2l0ZW0nLCBpbm5lckJsb2Nrc0ZpZWxkKTtcblxuICAgICAgLy8gcHJvcFBhdGggY2FuIGJlIFwiaXRlbXNcIiBvciBcImp1bXBOYXYubGlua3NcIiAtIHVzZSBhcy1pcyBmb3IgdGhlIG1hcCBleHByZXNzaW9uXG4gICAgICByZXR1cm4gYHske3Byb3BQYXRofSAmJiAke3Byb3BQYXRofS5tYXAoKGl0ZW0sIGluZGV4KSA9PiAoXG4gICAgICAgIDxGcmFnbWVudCBrZXk9e2luZGV4fT5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkpfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBuZXN0ZWQgbG9vcCBtYXJrZXJzIFdJVEggYWxpYXMgKHRoaXMueHh4IGFzIHxhbGlhc3wpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnMgRklSU1RcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPG5lc3RlZC1sb29wLW1hcmtlclxccysoPzpkYXRhLXByb3B8ZGF0YVByb3ApPVwiKFtcXHcuXSspXCJcXHMrKD86ZGF0YS1hbGlhc3xkYXRhQWxpYXMpPVwiKFxcdyspXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL25lc3RlZC1sb29wLW1hcmtlcj4pL2dpLFxuICAgIChfLCBwcm9wTmFtZSwgYWxpYXNOYW1lLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgbGV0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgLy8gUmVwbGFjZSBhbGlhcyByZWZlcmVuY2VzIHdpdGggdGhpcy4gcmVmZXJlbmNlcyBiZWZvcmUgcHJvY2Vzc2luZ1xuICAgICAgLy8gZS5nLiwge3t0YWcudXJsfX0gLT4ge3t0aGlzLnVybH19LCB7e3RhZy5sYWJlbH19IC0+IHt7dGhpcy5sYWJlbH19XG4gICAgICBjb25zdCBhbGlhc0RlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzTmFtZX1cXFxcLihcXFxcdyspXFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsICd7e3RoaXMuJDEuJDJ9fScpO1xuICAgICAgXG4gICAgICBjb25zdCBhbGlhc1JlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzUmVnZXgsICd7e3RoaXMuJDF9fScpO1xuICAgICAgXG4gICAgICAvLyBVc2UgdGhlIGFsaWFzIG5hbWUgZnJvbSB0aGUgSGFuZGxlYmFycyB0ZW1wbGF0ZSBhcyB0aGUgbmVzdGVkIGxvb3AgdmFyaWFibGVcbiAgICAgIGNvbnN0IG5lc3RlZFZhciA9IGFsaWFzTmFtZSB8fCAnc3ViSXRlbSc7XG4gICAgICBjb25zdCBuZXN0ZWRJbmRleCA9IGAke25lc3RlZFZhcn1JbmRleGA7XG4gICAgICBjb25zdCBhcnJheVJlZiA9IHRvT3B0aW9uYWxDaGFpbmVkQWNjZXNzKHBhcmVudExvb3BWYXIsIHByb3BOYW1lKTtcbiAgICAgIFxuICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgICAgIC4uLmNvbnRleHQsXG4gICAgICAgIGxvb3BWYXJpYWJsZTogbmVzdGVkVmFyLFxuICAgICAgICBsb29wSW5kZXg6IG5lc3RlZEluZGV4LFxuICAgICAgICBsb29wQXJyYXk6IGFycmF5UmVmLFxuICAgICAgICBpbkxvb3A6IHRydWVcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGFuZCBjb252ZXJ0IGlubmVyIGNvbnRlbnQgd2l0aCB0aGUgbmVzdGVkIGxvb3AgdmFyaWFibGUgKHBhc3MgYXJyYXlSZWYgZm9yIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgYW5kIHVubGVzcy1sYXN0IGRhdGEtYXJyYXkpXG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCwgYXJyYXlSZWYsIG5lc3RlZFZhcik7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lciwgYXJyYXlSZWYpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIG5lc3RlZENvbnRleHQpO1xuICAgICAgXG4gICAgICAvLyBSZXBsYWNlIHJlZmVyZW5jZXMgdG8gdXNlIHRoZSBuZXN0ZWQgdmFyaWFibGVcbiAgICAgIGlubmVySnN4ID0gaW5uZXJKc3gucmVwbGFjZSgvXFx7aXRlbVxcLi9nLCBgeyR7bmVzdGVkVmFyfS5gKTtcbiAgICAgIGlubmVySnN4ID0gaW5uZXJKc3gucmVwbGFjZSgvXFx7aXRlbVxcfS9nLCBgeyR7bmVzdGVkVmFyfX1gKTtcbiAgICAgIFxuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgbmVzdGVkQ29udGV4dCwgbmVzdGVkVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGB7JHthcnJheVJlZn0gJiYgJHthcnJheVJlZn0ubWFwKCgke25lc3RlZFZhcn0sICR7bmVzdGVkSW5kZXh9KSA9PiAoXG4gICAgICAgIDxGcmFnbWVudCBrZXk9eyR7bmVzdGVkSW5kZXh9fT5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkpfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBuZXN0ZWQgbG9vcCBtYXJrZXJzIFdJVEhPVVQgYWxpYXMgKHRoaXMueHh4KSB0byBKU1ggbWFwIGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxuZXN0ZWQtbG9vcC1tYXJrZXJcXHMrKD86ZGF0YS1wcm9wfGRhdGFQcm9wKT1cIihbXFx3Ll0rKVwiXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9uZXN0ZWQtbG9vcC1tYXJrZXI+KS9naSxcbiAgICAoXywgcHJvcE5hbWUsIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICAvLyBVc2UgYSBkaWZmZXJlbnQgdmFyaWFibGUgbmFtZSBmb3IgbmVzdGVkIGxvb3BzIHRvIGF2b2lkIHNoYWRvd2luZ1xuICAgICAgY29uc3QgbmVzdGVkVmFyID0gJ3N1Ykl0ZW0nO1xuICAgICAgY29uc3QgbmVzdGVkSW5kZXggPSAnc3ViSW5kZXgnO1xuICAgICAgY29uc3QgYXJyYXlSZWYgPSB0b09wdGlvbmFsQ2hhaW5lZEFjY2VzcyhwYXJlbnRMb29wVmFyLCBwcm9wTmFtZSk7XG4gICAgICBcbiAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0ID0ge1xuICAgICAgICAuLi5jb250ZXh0LFxuICAgICAgICBsb29wVmFyaWFibGU6IG5lc3RlZFZhcixcbiAgICAgICAgbG9vcEluZGV4OiBuZXN0ZWRJbmRleCxcbiAgICAgICAgbG9vcEFycmF5OiBhcnJheVJlZixcbiAgICAgICAgaW5Mb29wOiB0cnVlXG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBhbmQgY29udmVydCBpbm5lciBjb250ZW50IHdpdGggdGhlIG5lc3RlZCBsb29wIHZhcmlhYmxlIChwYXNzIGFycmF5UmVmIGZvciBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIGFuZCB1bmxlc3MtbGFzdCBkYXRhLWFycmF5KVxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQsIGFycmF5UmVmLCBuZXN0ZWRWYXIpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSW5uZXIsIGFycmF5UmVmKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBuZXN0ZWRDb250ZXh0KTtcblxuICAgICAgLy8gUmVwbGFjZSByZWZlcmVuY2VzIHRvIHVzZSB0aGUgbmVzdGVkIHZhcmlhYmxlXG4gICAgICBpbm5lckpzeCA9IGlubmVySnN4LnJlcGxhY2UoL1xce2l0ZW1cXC4vZywgYHske25lc3RlZFZhcn0uYCk7XG4gICAgICBpbm5lckpzeCA9IGlubmVySnN4LnJlcGxhY2UoL1xce2l0ZW1cXH0vZywgYHske25lc3RlZFZhcn19YCk7XG5cbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIG5lc3RlZENvbnRleHQsIG5lc3RlZFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG5cbiAgICAgIHJldHVybiBgeyR7YXJyYXlSZWZ9ICYmICR7YXJyYXlSZWZ9Lm1hcCgoJHtuZXN0ZWRWYXJ9LCAke25lc3RlZEluZGV4fSkgPT4gKFxuICAgICAgICA8RnJhZ21lbnQga2V5PXske25lc3RlZEluZGV4fX0+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApKX1gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHVubGVzcy1sYXN0IG1hcmtlcnMgKGRhdGEtYXJyYXkgd2hlbiBwcmVzZW50IGNvbWVzIGZyb20gcHJlcHJvY2Vzc29yIHdoZW4gaW5zaWRlIHt7I2VhY2h9fSBzbyBleHBhbnNpb24gd29ya3Mgd2l0aG91dCBsb29wIGNvbnRleHQpXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXM7IGF0dHJpYnV0ZSBvcmRlcjogZGF0YS1jb250ZW50IHRoZW4gb3B0aW9uYWwgZGF0YS1hcnJheVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPHVubGVzcy1sYXN0LW1hcmtlclxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzooPzpkYXRhLWFycmF5fGRhdGFBcnJheSk9XCIoW15cIl0rKVwiXFxzKik/KD86XFwvPnw+PFxcL3VubGVzcy1sYXN0LW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29udGVudCwgZGF0YUFycmF5KSA9PiB7XG4gICAgICBjb25zdCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBhcnJheU5hbWUgPSBkYXRhQXJyYXkgfHwgY29udGV4dC5sb29wQXJyYXkgfHwgJ2l0ZW1zJztcbiAgICAgIC8vIFVzZSBjb250ZXh0IHdpdGggbG9vcEFycmF5IHNvIGF0dHJpYnV0ZSB2YWx1ZXMgKGUuZy4gY2xhc3NOYW1lKSB0aGF0IHJlZmVyZW5jZSBAbGFzdCBnZXQgdGhlIGNvcnJlY3QgYXJyYXkgbmFtZVxuICAgICAgY29uc3QgZXhwYW5kQ29udGV4dCA9IHsgLi4uY29udGV4dCwgbG9vcEFycmF5OiBhcnJheU5hbWUgfTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaW5uZXIgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChjbGVhbmVkSW5uZXIsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGV4cGFuZENvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgZXhwYW5kQ29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIHJldHVybiBge2luZGV4IDwgJHthcnJheU5hbWV9Py5sZW5ndGggLSAxICYmIChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgdW5sZXNzLWZpcnN0IG1hcmtlcnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPHVubGVzcy1maXJzdC1tYXJrZXJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL3VubGVzcy1maXJzdC1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZENvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaW5uZXIgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChjbGVhbmVkSW5uZXIsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGNvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIC8vIEBmaXJzdCBpcyB0cnVlIHdoZW4gaW5kZXggPT09IDAsIHNvIHVubGVzcyBAZmlyc3QgbWVhbnMgaW5kZXggIT09IDBcbiAgICAgIHJldHVybiBge2luZGV4ICE9PSAwICYmIChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaWYgbWFya2VycyAod2l0aG91dCBlbHNlKVxuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIChkYXRhLWNvbmRpdGlvbikgYW5kIGNhbWVsQ2FzZSAoZGF0YUNvbmRpdGlvbikgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88aWYtbWFya2VyXFxzKyg/OmRhdGEtY29uZGl0aW9ufGRhdGFDb25kaXRpb24pPVwiKFteXCJdKylcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvaWYtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb25kaXRpb24sIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29uZGl0aW9uLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGNvbmRpdGlvbiwgY29udGV4dCwgcGFyZW50TG9vcFZhcik7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGlubmVyIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50KTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBjb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICByZXR1cm4gYHske2V4cHJ9ICYmIChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaWYtZWxzZSBtYXJrZXJzICh3aXRoIGVsc2UpIHRvIHRlcm5hcnkgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGlmLWVsc2UtbWFya2VyXFxzKyg/OmRhdGEtY29uZGl0aW9ufGRhdGFDb25kaXRpb24pPVwiKFteXCJdKylcIlxccysoPzpkYXRhLWlmLWNvbnRlbnR8ZGF0YUlmQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKyg/OmRhdGEtZWxzZS1jb250ZW50fGRhdGFFbHNlQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9pZi1lbHNlLW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29uZGl0aW9uLCBlbmNvZGVkSWZDb250ZW50LCBlbmNvZGVkRWxzZUNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb25kaXRpb24sICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgaWZDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZElmQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBlbHNlQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRFbHNlQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihjb25kaXRpb24sIGNvbnRleHQsIHBhcmVudExvb3BWYXIpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBpZiBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkSWYgPSBjbGVhblRlbXBsYXRlKGlmQ29udGVudCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWRJZiA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElmKTtcbiAgICAgIGNvbnN0IHJvb3RJZiA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWRJZiwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaWZKc3ggPSBub2RlVG9Kc3gocm9vdElmLCBjb250ZXh0KTtcbiAgICAgIGlmSnN4ID0gcG9zdHByb2Nlc3NKc3goaWZKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBlbHNlIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRFbHNlID0gY2xlYW5UZW1wbGF0ZShlbHNlQ29udGVudCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWRFbHNlID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkRWxzZSk7XG4gICAgICBjb25zdCByb290RWxzZSA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWRFbHNlLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBlbHNlSnN4ID0gbm9kZVRvSnN4KHJvb3RFbHNlLCBjb250ZXh0KTtcbiAgICAgIGVsc2VKc3ggPSBwb3N0cHJvY2Vzc0pzeChlbHNlSnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGB7JHtleHByfSA/IChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aWZKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSA6IChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7ZWxzZUpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBpZi1lbHNlaWYgbWFya2VycyAod2l0aCBlbHNlLWlmIGNoYWluKSB0byBuZXN0ZWQgdGVybmFyeSBleHByZXNzaW9uc1xuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88aWYtZWxzZWlmLW1hcmtlclxccysoPzpkYXRhLWNvbmRpdGlvbnxkYXRhQ29uZGl0aW9uKT1cIihbXlwiXSspXCJcXHMrKD86ZGF0YS1pZi1jb250ZW50fGRhdGFJZkNvbnRlbnQpPVwiKFteXCJdKylcIlxccysoPzpkYXRhLW5lc3RlZC1tYXJrZXJ8ZGF0YU5lc3RlZE1hcmtlcik9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9pZi1lbHNlaWYtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb25kaXRpb24sIGVuY29kZWRJZkNvbnRlbnQsIGVuY29kZWROZXN0ZWRNYXJrZXIpID0+IHtcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb25kaXRpb24sICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgaWZDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZElmQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBuZXN0ZWRNYXJrZXIgPSBCdWZmZXIuZnJvbShlbmNvZGVkTmVzdGVkTWFya2VyLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24oY29uZGl0aW9uLCBjb250ZXh0LCBwYXJlbnRMb29wVmFyKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaWYgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElmID0gY2xlYW5UZW1wbGF0ZShpZkNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkSWYgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJZik7XG4gICAgICBjb25zdCByb290SWYgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkSWYsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlmSnN4ID0gbm9kZVRvSnN4KHJvb3RJZiwgY29udGV4dCk7XG4gICAgICBpZkpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlmSnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgLy8gVGhlIG5lc3RlZCBtYXJrZXIgaXMgYWxyZWFkeSBhIHByZXByb2Nlc3NlZCBpZi9pZi1lbHNlL2lmLWVsc2VpZiBtYXJrZXJcbiAgICAgIC8vIFdlIG5lZWQgdG8gcGFyc2UgaXQgdGhyb3VnaCBIVE1MIHBhcnNlciBhbmQgcHJvY2VzcyBpdFxuICAgICAgY29uc3Qgcm9vdE5lc3RlZCA9IHBhcnNlSFRNTChuZXN0ZWRNYXJrZXIsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IG5lc3RlZEpzeCA9IG5vZGVUb0pzeChyb290TmVzdGVkLCBjb250ZXh0KTtcbiAgICAgIG5lc3RlZEpzeCA9IHBvc3Rwcm9jZXNzSnN4KG5lc3RlZEpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIC8vIFRoZSBuZXN0ZWQgSlNYIHNob3VsZCBiZSBhIGNvbmRpdGlvbmFsIGV4cHJlc3Npb24gbGlrZSB7Y29uZGl0aW9uID8gLi4uIDogLi4ufVxuICAgICAgLy8gV2UgbmVlZCB0byBleHRyYWN0IHRoZSBpbm5lciBwYXJ0IGFuZCBjaGFpbiBpdFxuICAgICAgY29uc3QgdHJpbW1lZE5lc3RlZCA9IG5lc3RlZEpzeC50cmltKCk7XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGlmIGl0IHN0YXJ0cyB3aXRoIHsgYW5kIGVuZHMgd2l0aCB9XG4gICAgICBpZiAodHJpbW1lZE5lc3RlZC5zdGFydHNXaXRoKCd7JykgJiYgdHJpbW1lZE5lc3RlZC5lbmRzV2l0aCgnfScpKSB7XG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIGlubmVyIGV4cHJlc3Npb24gKHJlbW92ZSBvdXRlciBicmFjZXMpXG4gICAgICAgIGNvbnN0IGlubmVyRXhwciA9IHRyaW1tZWROZXN0ZWQuc2xpY2UoMSwgLTEpLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBgeyR7ZXhwcn0gPyAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lmSnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkgOiAke2lubmVyRXhwcn19YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZhbGxiYWNrIC0ganVzdCB1c2UgbnVsbCBmb3IgdGhlIGVsc2UgY2FzZVxuICAgICAgICByZXR1cm4gYHske2V4cHJ9ID8gKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpZkpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApIDogbnVsbH1gO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgZWRpdGFibGUgZmllbGQgbWFya2VycyB0byBhcHByb3ByaWF0ZSBjb21wb25lbnRzIGJhc2VkIG9uIGZpZWxkIHR5cGVcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGVkaXRhYmxlLWZpZWxkLW1hcmtlclxccysoPzpkYXRhLWZpZWxkfGRhdGFGaWVsZCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9lZGl0YWJsZS1maWVsZC1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZEZpZWxkSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZmllbGRJbmZvOiBGaWVsZEluZm8gPSBKU09OLnBhcnNlKEJ1ZmZlci5mcm9tKGVuY29kZWRGaWVsZEluZm8sICdiYXNlNjQnKS50b1N0cmluZygpKTtcbiAgICAgICAgY29uc3QgeyBwYXRoLCB0eXBlLCBjb250ZW50IH0gPSBmaWVsZEluZm87XG4gICAgICAgIFxuICAgICAgICAvLyBQYXJzZSB0aGUgcGF0aCB0byBkZXRlcm1pbmUgaG93IHRvIHNldCBhdHRyaWJ1dGVzXG4gICAgICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgaXNBcnJheUZpZWxkID0gcGF0aFBhcnRzLmxlbmd0aCA+IDE7XG4gICAgICAgIFxuICAgICAgICAvLyBDb252ZXJ0IHRoZSBjb250ZW50ICh3aGljaCBjb250YWlucyBIYW5kbGViYXJzIGV4cHJlc3Npb25zKSB0byBKU1ggdmFsdWUgcmVmZXJlbmNlXG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIHByb3BlcnR5IHJlZmVyZW5jZSBmcm9tIGNvbnRlbnQgbGlrZSB7e3Byb3BlcnRpZXMudGl0bGV9fSBvciB7e2NydW1iLmxhYmVsfX1cbiAgICAgICAgbGV0IHZhbHVlRXhwcjogc3RyaW5nO1xuICAgICAgICBsZXQgb25DaGFuZ2VFeHByOiBzdHJpbmc7XG4gICAgICAgIGxldCBpbWFnZUlkRXhwcjogc3RyaW5nID0gJyc7XG4gICAgICAgIGxldCBpbWFnZU9uU2VsZWN0RXhwcjogc3RyaW5nID0gJyc7XG4gICAgICAgIFxuICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIC8vIFRvcC1sZXZlbCBmaWVsZDogXCJ0aXRsZVwiIC0+IHRpdGxlLCBzZXRBdHRyaWJ1dGVzKHsgdGl0bGU6IHZhbHVlIH0pXG4gICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgIHZhbHVlRXhwciA9IGAke3Byb3BOYW1lfSB8fCAnJ2A7XG4gICAgICAgICAgb25DaGFuZ2VFeHByID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiB2YWx1ZSB9KWA7XG4gICAgICAgICAgLy8gRm9yIGltYWdlcywgd2UgbmVlZCB0byBoYW5kbGUgdGhlIGlkIGFuZCBmdWxsIGltYWdlIG9iamVjdFxuICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cHJvcE5hbWV9Py5pZGA7XG4gICAgICAgICAgaW1hZ2VPblNlbGVjdEV4cHIgPSBgKGltYWdlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IHsgaWQ6IGltYWdlLmlkLCBzcmM6IGltYWdlLnVybCwgYWx0OiBpbWFnZS5hbHQgfHwgJycgfSB9KWA7XG4gICAgICAgIH0gZWxzZSBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIC8vIENvdWxkIGJlIG5lc3RlZCBvYmplY3QgXCJidXR0b24udGV4dFwiIG9yIGFycmF5IGZpZWxkIFwiYnJlYWRjcnVtYnMubGFiZWxcIlxuICAgICAgICAgIGNvbnN0IHBhcmVudE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IHBhdGhQYXJ0c1sxXTtcbiAgICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gY29udGV4dC5wcm9wZXJ0aWVzW3BhdGhQYXJ0c1swXV0gfHwgY29udGV4dC5wcm9wZXJ0aWVzW3BhcmVudE5hbWVdO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChwYXJlbnRQcm9wPy50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgICAgICAvLyBBcnJheSBmaWVsZDogdXNlIGxvb3AgY29udGV4dFxuICAgICAgICAgICAgdmFsdWVFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtmaWVsZE5hbWV9IHx8ICcnYDtcbiAgICAgICAgICAgIG9uQ2hhbmdlRXhwciA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwYXJlbnROYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2ZpZWxkTmFtZX06IHZhbHVlIH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgLy8gRm9yIGltYWdlcyBpbiBhcnJheXNcbiAgICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtmaWVsZE5hbWV9Py5pZGA7XG4gICAgICAgICAgICBpbWFnZU9uU2VsZWN0RXhwciA9IGAoaW1hZ2UpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwYXJlbnROYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2ZpZWxkTmFtZX06IHsgaWQ6IGltYWdlLmlkLCBzcmM6IGltYWdlLnVybCwgYWx0OiBpbWFnZS5hbHQgfHwgJycgfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTmVzdGVkIG9iamVjdCBmaWVsZFxuICAgICAgICAgICAgdmFsdWVFeHByID0gYCR7cGFyZW50TmFtZX0/LiR7ZmllbGROYW1lfSB8fCAnJ2A7XG4gICAgICAgICAgICBvbkNoYW5nZUV4cHIgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogeyAuLi4ke3BhcmVudE5hbWV9LCAke2ZpZWxkTmFtZX06IHZhbHVlIH0gfSlgO1xuICAgICAgICAgICAgLy8gRm9yIGltYWdlcyBpbiBuZXN0ZWQgb2JqZWN0c1xuICAgICAgICAgICAgaW1hZ2VJZEV4cHIgPSBgJHtwYXJlbnROYW1lfT8uJHtmaWVsZE5hbWV9Py5pZGA7XG4gICAgICAgICAgICBpbWFnZU9uU2VsZWN0RXhwciA9IGAoaW1hZ2UpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogeyBpZDogaW1hZ2UuaWQsIHNyYzogaW1hZ2UudXJsLCBhbHQ6IGltYWdlLmFsdCB8fCAnJyB9IH0gfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBEZWVwbHkgbmVzdGVkIC0gZGVmYXVsdCB0byBzaW1wbGVyIGhhbmRsaW5nXG4gICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgIHZhbHVlRXhwciA9IGAke3BhcmVudExvb3BWYXJ9LiR7cGF0aFBhcnRzW3BhdGhQYXJ0cy5sZW5ndGggLSAxXX0gfHwgJydgO1xuICAgICAgICAgIG9uQ2hhbmdlRXhwciA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLiR7cHJvcE5hbWV9XTtcbiAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke3BhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV19OiB2YWx1ZSB9O1xuICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICB9YDtcbiAgICAgICAgICAvLyBGb3IgaW1hZ2VzIGluIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgICAgICAgICBjb25zdCBsYXN0RmllbGQgPSBwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtsYXN0RmllbGR9Py5pZGA7XG4gICAgICAgICAgaW1hZ2VPblNlbGVjdEV4cHIgPSBgKGltYWdlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtsYXN0RmllbGR9OiB7IGlkOiBpbWFnZS5pZCwgc3JjOiBpbWFnZS51cmwsIGFsdDogaW1hZ2UuYWx0IHx8ICcnIH0gfTtcbiAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgfWA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEdlbmVyYXRlIGFwcHJvcHJpYXRlIGNvbXBvbmVudCBiYXNlZCBvbiBmaWVsZCB0eXBlXG4gICAgICAgIGlmICh0eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgICAgY29uc3QgeyBjbGFzc05hbWU6IGltYWdlQ2xhc3NOYW1lLCBzdHlsZUF0dHI6IGltYWdlU3R5bGVBdHRyLCBzaXplOiBpbWFnZVNpemUgfSA9XG4gICAgICAgICAgICBleHRyYWN0SW1nQXR0cmlidXRlcyhjb250ZW50IHx8ICcnKTtcbiAgICAgICAgICAvLyBVc2UgMTB1cCBJbWFnZSBjb21wb25lbnQgZm9yIGlubGluZS1lZGl0YWJsZSBpbWFnZXNcbiAgICAgICAgICByZXR1cm4gYDxJbWFnZVxuICAgICAgICAgICAgaWQ9eyR7aW1hZ2VJZEV4cHJ9fVxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiJHtpbWFnZUNsYXNzTmFtZX1cIlxuICAgICAgICAgICAgb25TZWxlY3Q9eyR7aW1hZ2VPblNlbGVjdEV4cHJ9fVxuICAgICAgICAgICAgc2l6ZT1cIiR7aW1hZ2VTaXplfVwiJHtpbWFnZVN0eWxlQXR0cn1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgICAgIC8vIEV4dHJhY3QgdGhlIHRvcC1sZXZlbCBmaWVsZCBuYW1lIGZyb20gdGhlIHBhdGggKGUuZy4gXCJjb250ZW50XCIgZnJvbSBcImNvbnRlbnRcIilcbiAgICAgICAgICBjb25zdCB0b3BMZXZlbEZpZWxkID0gcGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgIGlmIChpbm5lckJsb2Nrc0ZpZWxkICYmIHRvcExldmVsRmllbGQgPT09IGlubmVyQmxvY2tzRmllbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBgPElubmVyQmxvY2tzIGFsbG93ZWRCbG9ja3M9e0NPTlRFTlRfQkxPQ0tTfSAvPmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJpY2h0ZXh0IHdpdGhvdXQgSW5uZXJCbG9ja3M6IHVzZSBSaWNoVGV4dCB3aXRoIGZvcm1hdHRpbmcgYWxsb3dlZFxuICAgICAgICAgIHJldHVybiBgPFJpY2hUZXh0XG4gICAgICAgICAgICB0YWdOYW1lPVwiZGl2XCJcbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImhhbmRvZmYtZWRpdGFibGUtZmllbGRcIlxuICAgICAgICAgICAgdmFsdWU9eyR7dmFsdWVFeHByfX1cbiAgICAgICAgICAgIG9uQ2hhbmdlPXske29uQ2hhbmdlRXhwcn19XG4gICAgICAgICAgICBwbGFjZWhvbGRlcj17X18oJ0VudGVyIGNvbnRlbnQuLi4nLCAnaGFuZG9mZicpfVxuICAgICAgICAgIC8+YDtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnbGluaycgfHwgdHlwZSA9PT0gJ2J1dHRvbicpIHtcbiAgICAgICAgICBjb25zdCBzYWZlSWQgPSBwYXRoLnJlcGxhY2UoL1xcLi9nLCAnXycpO1xuICAgICAgICAgIGNvbnN0IG9ialJlZiA9IHZhbHVlRXhwci5yZXBsYWNlKC8gXFx8XFx8ICcnJC8sICcnKTtcbiAgICAgICAgICBjb25zdCBpc0xpbmsgPSB0eXBlID09PSAnbGluayc7XG4gICAgICAgICAgY29uc3QgcGFyZW50UGF0aEtleSA9IHBhdGhQYXJ0c1swXTtcbiAgICAgICAgICBjb25zdCBidXR0b25QYXJlbnRQcm9wID1cbiAgICAgICAgICAgICFpc0xpbmsgJiYgY29udGV4dC5wcm9wZXJ0aWVzXG4gICAgICAgICAgICAgID8gY29udGV4dC5wcm9wZXJ0aWVzW3BhcmVudFBhdGhLZXldID8/IGNvbnRleHQucHJvcGVydGllc1t0b0NhbWVsQ2FzZShwYXJlbnRQYXRoS2V5KV1cbiAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgY29uc3QgYnV0dG9uS2V5cyA9ICFpc0xpbmsgPyByZXNvbHZlQnV0dG9uRmllbGRLZXlzKGJ1dHRvblBhcmVudFByb3ApIDogbnVsbDtcblxuICAgICAgICAgIGNvbnN0IGxhYmVsVmFsdWVFeHByID0gaXNMaW5rXG4gICAgICAgICAgICA/IGAke29ialJlZn0/LmxhYmVsIHx8ICcnYFxuICAgICAgICAgICAgOiBgJHtvYmpSZWZ9Py4ke2J1dHRvbktleXMhLmxhYmVsS2V5fSB8fCAnJ2A7XG4gICAgICAgICAgY29uc3QgdXJsRXhwciA9IGlzTGlua1xuICAgICAgICAgICAgPyBgJHtvYmpSZWZ9Py51cmwgfHwgJydgXG4gICAgICAgICAgICA6IGAke29ialJlZn0/LiR7YnV0dG9uS2V5cyEudXJsS2V5fSB8fCAnJHtnZXRCdXR0b25VcmxGYWxsYmFjayhidXR0b25LZXlzIS51cmxLZXkpfSdgO1xuICAgICAgICAgIGNvbnN0IG5ld1RhYkV4cHIgPSBpc0xpbmsgPyBgJHtvYmpSZWZ9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlYCA6IGAke29ialJlZn0/LnRhcmdldCA9PT0gJ19ibGFuaydgO1xuICAgICAgICAgIGNvbnN0IGxhYmVsTWVyZ2UgPSBpc0xpbmtcbiAgICAgICAgICAgID8gYHsgLi4uJHtvYmpSZWZ9LCBsYWJlbDogdmFsdWUgfWBcbiAgICAgICAgICAgIDogYnV0dG9uTGFiZWxNZXJnZUpzKG9ialJlZiwgYnV0dG9uS2V5cyEpO1xuICAgICAgICAgIGNvbnN0IGxpbmtNZXJnZSA9IGlzTGlua1xuICAgICAgICAgICAgPyBgeyAuLi4ke29ialJlZn0sIHVybDogdmFsdWUudXJsIHx8ICcnLCBvcGVuc0luTmV3VGFiOiB2YWx1ZS5vcGVuc0luTmV3VGFiIHx8IGZhbHNlIH1gXG4gICAgICAgICAgICA6IGJ1dHRvbkxpbmtNZXJnZUpzKG9ialJlZiwgYnV0dG9uS2V5cyEpO1xuXG4gICAgICAgICAgLy8gQnVpbGQgb25DaGFuZ2UgaGFuZGxlcnMgZnJvbSBzY3JhdGNoIGJhc2VkIG9uIGZpZWxkIGNvbnRleHRcbiAgICAgICAgICBsZXQgbGFiZWxPbkNoYW5nZTogc3RyaW5nO1xuICAgICAgICAgIGxldCBsaW5rT25DaGFuZ2U6IHN0cmluZztcbiAgICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogJHtsYWJlbE1lcmdlfSB9KWA7XG4gICAgICAgICAgICBsaW5rT25DaGFuZ2UgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06ICR7bGlua01lcmdlfSB9KWA7XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnROYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IHBhdGhQYXJ0c1sxXTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBjb250ZXh0LnByb3BlcnRpZXNbcGF0aFBhcnRzWzBdXSB8fCBjb250ZXh0LnByb3BlcnRpZXNbcGFyZW50TmFtZV07XG4gICAgICAgICAgICBpZiAocGFyZW50UHJvcD8udHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICAgICAgICBsYWJlbE9uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogJHtsYWJlbE1lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogJHtsaW5rTWVyZ2V9IH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogJHtsYWJlbE1lcmdlfSB9IH0pYDtcbiAgICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IHsgLi4uJHtwYXJlbnROYW1lfSwgJHtmaWVsZE5hbWV9OiAke2xpbmtNZXJnZX0gfSB9KWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IGxhc3RGaWVsZCA9IHBhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBsYWJlbE9uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06ICR7bGFiZWxNZXJnZX0gfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06ICR7bGlua01lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgICAgfWA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIGA8SGFuZG9mZkxpbmtGaWVsZFxuICAgICAgICAgICAgZmllbGRJZD1cIiR7c2FmZUlkfVwiXG4gICAgICAgICAgICBsYWJlbD17JHtsYWJlbFZhbHVlRXhwcn19XG4gICAgICAgICAgICB1cmw9eyR7dXJsRXhwcn19XG4gICAgICAgICAgICBvcGVuc0luTmV3VGFiPXske25ld1RhYkV4cHJ9fVxuICAgICAgICAgICAgb25MYWJlbENoYW5nZT17JHtsYWJlbE9uQ2hhbmdlfX1cbiAgICAgICAgICAgIG9uTGlua0NoYW5nZT17JHtsaW5rT25DaGFuZ2V9fVxuICAgICAgICAgICAgaXNTZWxlY3RlZD17aXNTZWxlY3RlZH1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRm9yIHRleHQgZmllbGRzLCB1c2UgUmljaFRleHQgd2l0aCBubyBhbGxvd2VkIGZvcm1hdHMgZm9yIGlubGluZSBjb250ZW50ZWRpdGFibGUgZWRpdGluZ1xuICAgICAgICAgIHJldHVybiBgPFJpY2hUZXh0XG4gICAgICAgICAgICB0YWdOYW1lPVwic3BhblwiXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJoYW5kb2ZmLWVkaXRhYmxlLWZpZWxkXCJcbiAgICAgICAgICAgIHZhbHVlPXske3ZhbHVlRXhwcn19XG4gICAgICAgICAgICBvbkNoYW5nZT17JHtvbkNoYW5nZUV4cHJ9fVxuICAgICAgICAgICAgYWxsb3dlZEZvcm1hdHM9e1tdfVxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciB0ZXh0Li4uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gSWYgcGFyc2luZyBmYWlscywganVzdCByZXR1cm4gZW1wdHlcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEZpbmFsIGNsZWFudXAgLSBjb252ZXJ0IGFueSByZW1haW5pbmcgY2xhc3M9IHRvIGNsYXNzTmFtZT1cbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xcYmNsYXNzPVwiL2csICdjbGFzc05hbWU9XCInKTtcbiAgXG4gIC8vIFJlbW92ZSBlbXB0eSBjbGFzc05hbWUgYXR0cmlidXRlc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFxzK2NsYXNzTmFtZT1cIlwiL2csICcnKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIl19