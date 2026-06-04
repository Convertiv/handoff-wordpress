"use strict";
/**
 * Postprocessing utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postprocessJsx = exports.postprocessTemplateLiterals = void 0;
const node_html_parser_1 = require("node-html-parser");
const button_schema_1 = require("../button-schema");
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
const preprocessors_1 = require("./preprocessors");
const node_converter_1 = require("./node-converter");
const AUTOWRAP_TYPES = new Set(['text', 'richtext']);
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
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, propPath);
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
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, propPath);
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
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, arrayRef);
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
        const cleanedInner = (0, preprocessors_1.cleanTemplate)(innerContent, arrayRef);
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
                // Use 10up Image component for inline-editable images
                return `<Image
            id={${imageIdExpr}}
            className="handoff-editable-field"
            onSelect={${imageOnSelectExpr}}
            size="large"
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zdHByb2Nlc3NvcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9wb3N0cHJvY2Vzc29ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILHVEQUFzRDtBQUd0RCxvREFLMEI7QUFDMUIsbUNBQXNDO0FBQ3RDLDJEQUFtRjtBQUNuRixtREFBa0U7QUFFbEUscURBQTZDO0FBRTdDLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFFckQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLG1CQUFtQixHQUFHLENBQzFCLFlBQW9CLEVBQ3BCLGFBQXFCLEVBQ3JCLFVBQTJDLEVBQ25DLEVBQUU7SUFDVixNQUFNLFNBQVMsR0FBRyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDakUsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVTtRQUFFLE9BQU8sWUFBWSxDQUFDO0lBQ3ZELE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO0lBRTdDLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQztJQUUxQixtRkFBbUY7SUFDbkYsa0VBQWtFO0lBQ2xFLE1BQU0sY0FBYyxHQUFHLGtDQUFrQyxDQUFDO0lBQzFELElBQUksS0FBSyxDQUFDO0lBQ1YsTUFBTSxZQUFZLEdBQWdGLEVBQUUsQ0FBQztJQUVyRyxPQUFPLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUN0RCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FB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QUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDbEQsYUFBYSxHQUFHO3FDQUNTLFFBQVE7d0RBQ1csU0FBUyxLQUFLLFVBQVU7Z0NBQ2hELFFBQVE7Y0FDMUIsQ0FBQztvQkFDSCxZQUFZLEdBQUc7cUNBQ1UsUUFBUTt3REFDVyxTQUFTLEtBQUssU0FBUztnQ0FDL0MsUUFBUTtjQUMxQixDQUFDO2dCQUNMLENBQUM7Z0JBRUQsT0FBTzt1QkFDTSxNQUFNO3FCQUNSLGNBQWM7bUJBQ2hCLE9BQU87NkJBQ0csVUFBVTs2QkFDVixhQUFhOzRCQUNkLFlBQVk7O2FBRTNCLENBQUM7WUFDTixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sMkZBQTJGO2dCQUMzRixPQUFPOzs7cUJBR0ksU0FBUzt3QkFDTixZQUFZOzs7YUFHdkIsQ0FBQztZQUNOLENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNYLHNDQUFzQztZQUN0QyxPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUM7SUFDSCxDQUFDLENBQ0YsQ0FBQztJQUVGLDZEQUE2RDtJQUM3RCxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFFckQsb0NBQW9DO0lBQ3BDLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRWhELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQS9oQlcsUUFBQSxjQUFjLGtCQStoQnpCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQb3N0cHJvY2Vzc2luZyB1dGlsaXRpZXMgZm9yIHRoZSBIYW5kbGViYXJzIHRvIEpTWCB0cmFuc3BpbGVyXG4gKi9cblxuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VIVE1MIH0gZnJvbSAnbm9kZS1odG1sLXBhcnNlcic7XG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCwgRmllbGRJbmZvIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBIYW5kb2ZmUHJvcGVydHkgfSBmcm9tICcuLi8uLi90eXBlcyc7XG5pbXBvcnQge1xuICByZXNvbHZlQnV0dG9uRmllbGRLZXlzLFxuICBidXR0b25MYWJlbE1lcmdlSnMsXG4gIGJ1dHRvbkxpbmtNZXJnZUpzLFxuICBnZXRCdXR0b25VcmxGYWxsYmFjayxcbn0gZnJvbSAnLi4vYnV0dG9uLXNjaGVtYSc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdHJhbnNwaWxlRXhwcmVzc2lvbiwgdG9PcHRpb25hbENoYWluZWRBY2Nlc3MgfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcbmltcG9ydCB7IGNsZWFuVGVtcGxhdGUsIHByZXByb2Nlc3NCbG9ja3MgfSBmcm9tICcuL3ByZXByb2Nlc3NvcnMnO1xuaW1wb3J0IHsgbG9va3VwRmllbGRUeXBlIH0gZnJvbSAnLi9maWVsZC1sb29rdXAnO1xuaW1wb3J0IHsgbm9kZVRvSnN4IH0gZnJvbSAnLi9ub2RlLWNvbnZlcnRlcic7XG5cbmNvbnN0IEFVVE9XUkFQX1RZUEVTID0gbmV3IFNldChbJ3RleHQnLCAncmljaHRleHQnXSk7XG5cbi8qKlxuICogQXV0by13cmFwIGJhcmUge3t0aGlzLmZpZWxkTmFtZX19IGV4cHJlc3Npb25zIGluc2lkZSBsb29wIGNvbnRlbnQgd2l0aFxuICogZWRpdGFibGUtZmllbGQtbWFya2VyIGVsZW1lbnRzIHdoZW4gdGhlIGNvcnJlc3BvbmRpbmcgYXJyYXkgaXRlbSBwcm9wZXJ0eVxuICogaXMgdGV4dCBvciByaWNodGV4dC4gVGhpcyBtYWtlcyBhcnJheSBpdGVtIGZpZWxkcyBpbmxpbmUtZWRpdGFibGUgZXZlblxuICogd2hlbiB0aGUgSGFuZG9mZiBBUEkgdGVtcGxhdGUgb21pdHMgZXhwbGljaXQge3sjZmllbGR9fSBtYXJrZXJzLlxuICpcbiAqIE9ubHkgd3JhcHMgZXhwcmVzc2lvbnMgdGhhdCBhcHBlYXIgYXMgZGlyZWN0IHRleHQgY29udGVudCBiZXR3ZWVuIEhUTUwgdGFnc1xuICogKG5vdCBpbnNpZGUgYXR0cmlidXRlIHZhbHVlcykuXG4gKi9cbmNvbnN0IGF1dG9XcmFwQXJyYXlGaWVsZHMgPSAoXG4gIGlubmVyQ29udGVudDogc3RyaW5nLFxuICBhcnJheVByb3BQYXRoOiBzdHJpbmcsXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBhcnJheVByb3AgPSBsb29rdXBBcnJheVByb3BlcnR5KGFycmF5UHJvcFBhdGgsIHByb3BlcnRpZXMpO1xuICBpZiAoIWFycmF5UHJvcD8uaXRlbXM/LnByb3BlcnRpZXMpIHJldHVybiBpbm5lckNvbnRlbnQ7XG4gIGNvbnN0IGl0ZW1Qcm9wcyA9IGFycmF5UHJvcC5pdGVtcy5wcm9wZXJ0aWVzO1xuXG4gIGxldCByZXN1bHQgPSBpbm5lckNvbnRlbnQ7XG5cbiAgLy8gRmluZCB7e3RoaXMuZmllbGROYW1lfX0gb3Ige3t7dGhpcy5maWVsZE5hbWV9fX0gZXhwcmVzc2lvbnMgdGhhdCBhcmUgTk9UIGFscmVhZHlcbiAgLy8gaW5zaWRlIHt7I2ZpZWxkfX0gbWFya2VycyBhbmQgTk9UIGluc2lkZSBIVE1MIGF0dHJpYnV0ZSB2YWx1ZXMuXG4gIGNvbnN0IHRoaXNGaWVsZFJlZ2V4ID0gL1xce1xce1xcez9cXHMqdGhpc1xcLihcXHcrKVxccypcXH1cXH1cXH0/L2c7XG4gIGxldCBtYXRjaDtcbiAgY29uc3QgcmVwbGFjZW1lbnRzOiBBcnJheTx7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyOyBmaWVsZE5hbWU6IHN0cmluZzsgZmllbGRUeXBlOiBzdHJpbmcgfT4gPSBbXTtcblxuICB3aGlsZSAoKG1hdGNoID0gdGhpc0ZpZWxkUmVnZXguZXhlYyhyZXN1bHQpKSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IG1hdGNoWzFdO1xuICAgIGNvbnN0IGl0ZW1Qcm9wID0gaXRlbVByb3BzW2ZpZWxkTmFtZV07XG4gICAgaWYgKCFpdGVtUHJvcCB8fCAhQVVUT1dSQVBfVFlQRVMuaGFzKGl0ZW1Qcm9wLnR5cGUpKSBjb250aW51ZTtcblxuICAgIC8vIFNraXAgaWYgYWxyZWFkeSB3cmFwcGVkIGluIHt7I2ZpZWxkfX1cbiAgICBjb25zdCBiZWZvcmUgPSByZXN1bHQuc3Vic3RyaW5nKE1hdGgubWF4KDAsIG1hdGNoLmluZGV4IC0gMjAwKSwgbWF0Y2guaW5kZXgpO1xuICAgIGlmIChiZWZvcmUuaW5jbHVkZXMoJ3t7I2ZpZWxkJykgJiYgIWJlZm9yZS5pbmNsdWRlcygne3svZmllbGR9fScpKSBjb250aW51ZTtcblxuICAgIC8vIFNraXAgaWYgaW5zaWRlIGFuIGF0dHJpYnV0ZSB2YWx1ZSAoY2hlY2sgZm9yIG9kZCBudW1iZXIgb2YgcXVvdGVzIGJlZm9yZSBtYXRjaClcbiAgICBjb25zdCBsYXN0VGFnU3RhcnQgPSByZXN1bHQubGFzdEluZGV4T2YoJzwnLCBtYXRjaC5pbmRleCk7XG4gICAgaWYgKGxhc3RUYWdTdGFydCAhPT0gLTEpIHtcbiAgICAgIGNvbnN0IHNlZ21lbnQgPSByZXN1bHQuc3Vic3RyaW5nKGxhc3RUYWdTdGFydCwgbWF0Y2guaW5kZXgpO1xuICAgICAgY29uc3Qgc2VnbWVudE5vSGJzID0gc2VnbWVudC5yZXBsYWNlKC9cXHtcXHtbXFxzXFxTXSo/XFx9XFx9L2csICcnKTtcbiAgICAgIGNvbnN0IHF1b3RlQ291bnQgPSAoc2VnbWVudE5vSGJzLm1hdGNoKC9cIi9nKSB8fCBbXSkubGVuZ3RoO1xuICAgICAgaWYgKHF1b3RlQ291bnQgJSAyID09PSAxKSBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXBsYWNlbWVudHMucHVzaCh7XG4gICAgICBzdGFydDogbWF0Y2guaW5kZXgsXG4gICAgICBlbmQ6IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoLFxuICAgICAgZmllbGROYW1lLFxuICAgICAgZmllbGRUeXBlOiBpdGVtUHJvcC50eXBlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQXBwbHkgcmVwbGFjZW1lbnRzIGluIHJldmVyc2Ugb3JkZXIgdG8gcHJlc2VydmUgcG9zaXRpb25zXG4gIGZvciAobGV0IGkgPSByZXBsYWNlbWVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBjb25zdCByID0gcmVwbGFjZW1lbnRzW2ldO1xuICAgIGNvbnN0IGZpZWxkUGF0aCA9IGAke2FycmF5UHJvcFBhdGh9LiR7ci5maWVsZE5hbWV9YDtcbiAgICBjb25zdCBmaWVsZEluZm8gPSBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeSh7XG4gICAgICBwYXRoOiBmaWVsZFBhdGgsXG4gICAgICB0eXBlOiByLmZpZWxkVHlwZSxcbiAgICAgIGNvbnRlbnQ6IGB7e3RoaXMuJHtyLmZpZWxkTmFtZX19fWAsXG4gICAgfSkpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBjb25zdCBtYXJrZXIgPSBgPGVkaXRhYmxlLWZpZWxkLW1hcmtlciBkYXRhLWZpZWxkPVwiJHtmaWVsZEluZm99XCI+PC9lZGl0YWJsZS1maWVsZC1tYXJrZXI+YDtcbiAgICByZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKDAsIHIuc3RhcnQpICsgbWFya2VyICsgcmVzdWx0LnN1YnN0cmluZyhyLmVuZCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqIFJlc29sdmUgYW4gYXJyYXkgcHJvcGVydHkgZnJvbSBhIGRvdC1wYXRoIGxpa2UgXCJpdGVtc1wiIG9yIFwianVtcE5hdi5saW5rc1wiICovXG5jb25zdCBsb29rdXBBcnJheVByb3BlcnR5ID0gKFxuICBwcm9wUGF0aDogc3RyaW5nLFxuICBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBIYW5kb2ZmUHJvcGVydHk+LFxuKTogSGFuZG9mZlByb3BlcnR5IHwgbnVsbCA9PiB7XG4gIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoJy4nKTtcbiAgbGV0IGN1cnJlbnQ6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4gPSBwcm9wZXJ0aWVzO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcGFydCA9IHBhcnRzW2ldO1xuICAgIGNvbnN0IHByb3AgPSBjdXJyZW50W3BhcnRdIHx8IGN1cnJlbnRbdG9DYW1lbENhc2UocGFydCldO1xuICAgIGlmICghcHJvcCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKGkgPT09IHBhcnRzLmxlbmd0aCAtIDEpIHJldHVybiBwcm9wLnR5cGUgPT09ICdhcnJheScgPyBwcm9wIDogbnVsbDtcbiAgICBpZiAocHJvcC50eXBlID09PSAnYXJyYXknICYmIHByb3AuaXRlbXM/LnByb3BlcnRpZXMpIHtcbiAgICAgIGN1cnJlbnQgPSBwcm9wLml0ZW1zLnByb3BlcnRpZXM7XG4gICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmIHByb3AucHJvcGVydGllcykge1xuICAgICAgY3VycmVudCA9IHByb3AucHJvcGVydGllcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufTtcblxuLyoqXG4gKiBQb3N0LXByb2Nlc3MgdG8gY29udmVydCB0ZW1wbGF0ZSBsaXRlcmFsIG1hcmtlcnMgYmFjayB0byBhY3R1YWwgdGVtcGxhdGUgbGl0ZXJhbHNcbiAqL1xuZXhwb3J0IGNvbnN0IHBvc3Rwcm9jZXNzVGVtcGxhdGVMaXRlcmFscyA9IChqc3g6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBqc3gucmVwbGFjZSgvX19URU1QTEFURV9MSVRFUkFMX18oW0EtWmEtejAtOSsvPV0rKV9fRU5EX1RFTVBMQVRFX0xJVEVSQUxfXy9nLCAoXywgZW5jb2RlZCkgPT4ge1xuICAgIGNvbnN0IGRlY29kZWQgPSBCdWZmZXIuZnJvbShlbmNvZGVkLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gJ2AnICsgZGVjb2RlZCArICdgJztcbiAgfSk7XG59O1xuXG4vKipcbiAqIFBvc3QtcHJvY2VzcyBKU1ggdG8gY29udmVydCBtYXJrZXJzIGJhY2sgdG8gSlNYIGxvZ2ljXG4gKi9cbmV4cG9ydCBjb25zdCBwb3N0cHJvY2Vzc0pzeCA9IChqc3g6IHN0cmluZywgY29udGV4dDogVHJhbnNwaWxlckNvbnRleHQsIHBhcmVudExvb3BWYXI6IHN0cmluZyA9ICdpdGVtJywgaW5uZXJCbG9ja3NGaWVsZD86IHN0cmluZyB8IG51bGwpOiBzdHJpbmcgPT4ge1xuICBsZXQgcmVzdWx0ID0ganN4O1xuICBcbiAgLy8gQ29udmVydCB0b3AtbGV2ZWwgbG9vcCBtYXJrZXJzIFdJVEggYWxpYXMgKHByb3BlcnRpZXMueHh4IG9yIHByb3BlcnRpZXMueHh4Lnl5eSBhcyB8YWxpYXN8KSB0byBKU1ggbWFwIGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgKGRhdGEtcHJvcCkgYW5kIGNhbWVsQ2FzZSAoZGF0YVByb3ApIGF0dHJpYnV0ZSBuYW1lc1xuICAvLyBkYXRhLXByb3Agbm93IGNvbnRhaW5zIHBhdGhzIGxpa2UgXCJqdW1wTmF2LmxpbmtzXCIgZm9yIG5lc3RlZCBwcm9wZXJ0eSBhY2Nlc3NcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxsb29wLW1hcmtlclxccysoPzpkYXRhLXByb3B8ZGF0YVByb3ApPVwiKFtcXHcuXSspXCJcXHMrKD86ZGF0YS10eXBlfGRhdGFUeXBlKT1cInByb3BlcnRpZXNcIlxccysoPzpkYXRhLWFsaWFzfGRhdGFBbGlhcyk9XCIoXFx3KylcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvbG9vcC1tYXJrZXI+KS9naSxcbiAgICAoXywgcHJvcFBhdGgsIGFsaWFzTmFtZSwgZW5jb2RlZENvbnRlbnQpID0+IHtcbiAgICAgIGxldCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBcbiAgICAgIC8vIFJlcGxhY2Uge3thbGlhcy5maWVsZH19IGFuZCB7eyBhbGlhcy5maWVsZC5zdWJmaWVsZCB9fSByZWZlcmVuY2VzIHdpdGgge3t0aGlzLmZpZWxkfX0gYmVmb3JlIHByb2Nlc3NpbmdcbiAgICAgIC8vIFRoaXMgbm9ybWFsaXplcyB0aGUgYWxpYXMgdG8gdGhlIHN0YW5kYXJkICd0aGlzLicgZm9ybWF0XG4gICAgICAvLyBIYW5kbGUgYm90aCBzaW5nbGUgYW5kIG5lc3RlZCBwcm9wZXJ0eSBhY2Nlc3MgKGUuZy4sIGNhcmQubGluay51cmwgLT4gdGhpcy5saW5rLnVybClcbiAgICAgIGNvbnN0IGFsaWFzRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3KylcXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc0RlZXBSZWdleCwgJ3t7dGhpcy4kMS4kMn19Jyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGFsaWFzUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNSZWdleCwgJ3t7dGhpcy4kMX19Jyk7XG4gICAgICBcbiAgICAgIC8vIElNUE9SVEFOVDogQWxzbyByZXBsYWNlIGNvbmRpdGlvbmFscyB0aGF0IHVzZSB0aGUgYWxpYXMsIGUuZy4ge3sjaWYgYWxpYXMuZmllbGR9fSAtPiB7eyNpZiB0aGlzLmZpZWxkfX1cbiAgICAgIC8vIFRoaXMgaGFuZGxlcyBwYXR0ZXJucyBsaWtlIHt7I2lmIHRlc3RpbW9uaWFsLmltYWdlfX0gaW5zaWRlIHt7I2VhY2ggcHJvcGVydGllcy50ZXN0aW1vbmlhbHMgYXMgfHRlc3RpbW9uaWFsfH19XG4gICAgICBjb25zdCBhbGlhc0lmUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2lmXFxcXHMrJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKD86XFxcXC5cXFxcdyspKilcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzSWZSZWdleCwgJ3t7I2lmIHRoaXMuJDF9fScpO1xuICAgICAgXG4gICAgICAvLyBBbHNvIGhhbmRsZSB7eyN1bmxlc3MgYWxpYXMuZmllbGR9fVxuICAgICAgY29uc3QgYWxpYXNVbmxlc3NSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjdW5sZXNzXFxcXHMrJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKD86XFxcXC5cXFxcdyspKilcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzVW5sZXNzUmVnZXgsICd7eyN1bmxlc3MgdGhpcy4kMX19Jyk7XG4gICAgICBcbiAgICAgIC8vIEFsc28gaGFuZGxlIG5lc3RlZCB7eyNlYWNoIGFsaWFzLmZpZWxkIGFzIHxuZXN0ZWRBbGlhc3x9fSBsb29wc1xuICAgICAgLy8gVGhpcyBjb252ZXJ0cyBlLmcuIHt7I2VhY2ggcG9zdC50YWdzIGFzIHx0YWd8fX0gLT4ge3sjZWFjaCB0aGlzLnRhZ3MgYXMgfHRhZ3x9fVxuICAgICAgY29uc3QgYWxpYXNFYWNoUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2VhY2hcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzK2FzXFxcXHMrXFxcXHwoW158XSspXFxcXHxcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzRWFjaFJlZ2V4LCAne3sjZWFjaCB0aGlzLiQxIGFzIHwkMnx9fScpO1xuICAgICAgXG4gICAgICAvLyBBbHNvIGhhbmRsZSB7eyNlYWNoIGFsaWFzLmZpZWxkfX0gd2l0aG91dCBhbGlhcyAobGVzcyBjb21tb24gYnV0IHBvc3NpYmxlKVxuICAgICAgY29uc3QgYWxpYXNFYWNoTm9BbGlhc1JlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyNlYWNoXFxcXHMrJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKD86XFxcXC5cXFxcdyspKilcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzRWFjaE5vQWxpYXNSZWdleCwgJ3t7I2VhY2ggdGhpcy4kMX19Jyk7XG5cbiAgICAgIC8vIEF1dG8td3JhcCBiYXJlIHt7dGhpcy54eHh9fSB0ZXh0L3JpY2h0ZXh0IGZpZWxkcyB3aXRoIGVkaXRhYmxlIG1hcmtlcnNcbiAgICAgIGlubmVyQ29udGVudCA9IGF1dG9XcmFwQXJyYXlGaWVsZHMoaW5uZXJDb250ZW50LCBwcm9wUGF0aCwgY29udGV4dC5wcm9wZXJ0aWVzKTtcbiAgICAgIFxuICAgICAgLy8gVXNlIHRoZSBhbGlhcyBuYW1lIGZyb20gdGhlIEhhbmRsZWJhcnMgdGVtcGxhdGUgYXMgdGhlIGxvb3AgdmFyaWFibGVcbiAgICAgIGNvbnN0IGxvb3BWYXJOYW1lID0gYWxpYXNOYW1lIHx8ICdpdGVtJztcbiAgICAgIGNvbnN0IGxvb3BDb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgbG9vcFZhcmlhYmxlOiBsb29wVmFyTmFtZSxcbiAgICAgICAgbG9vcEluZGV4OiAnaW5kZXgnLFxuICAgICAgICBsb29wQXJyYXk6IHByb3BQYXRoLFxuICAgICAgICBpbkxvb3A6IHRydWVcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGFuZCBjb252ZXJ0IGlubmVyIGNvbnRlbnQgKHBhc3MgcHJvcFBhdGggc28gYXR0cmlidXRlIGNvbmRpdGlvbmFscyBhbmQge3sjdW5sZXNzIEBsYXN0fX0gZ2V0IGNvcnJlY3QgYXJyYXkgbmFtZSlcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50LCBwcm9wUGF0aCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lciwgcHJvcFBhdGgpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGxvb3BDb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGxvb3BDb250ZXh0LCBsb29wVmFyTmFtZSwgaW5uZXJCbG9ja3NGaWVsZCk7XG5cbiAgICAgIC8vIHByb3BQYXRoIGNhbiBiZSBcIml0ZW1zXCIgb3IgXCJqdW1wTmF2LmxpbmtzXCIgLSB1c2UgYXMtaXMgZm9yIHRoZSBtYXAgZXhwcmVzc2lvblxuICAgICAgcmV0dXJuIGB7JHtwcm9wUGF0aH0gJiYgJHtwcm9wUGF0aH0ubWFwKCgke2xvb3BWYXJOYW1lfSwgaW5kZXgpID0+IChcbiAgICAgICAgPEZyYWdtZW50IGtleT17aW5kZXh9PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHRvcC1sZXZlbCBsb29wIG1hcmtlcnMgV0lUSE9VVCBhbGlhcyAocHJvcGVydGllcy54eHggb3IgcHJvcGVydGllcy54eHgueXl5KSB0byBKU1ggbWFwIGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgLy8gZGF0YS1wcm9wIG5vdyBjb250YWlucyBwYXRocyBsaWtlIFwianVtcE5hdi5saW5rc1wiIGZvciBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88bG9vcC1tYXJrZXJcXHMrKD86ZGF0YS1wcm9wfGRhdGFQcm9wKT1cIihbXFx3Ll0rKVwiXFxzKyg/OmRhdGEtdHlwZXxkYXRhVHlwZSk9XCJwcm9wZXJ0aWVzXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2xvb3AtbWFya2VyPikvZ2ksXG4gICAgKF8sIHByb3BQYXRoLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgbGV0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcblxuICAgICAgLy8gQXV0by13cmFwIGJhcmUge3t0aGlzLnh4eH19IHRleHQvcmljaHRleHQgZmllbGRzIHdpdGggZWRpdGFibGUgbWFya2Vyc1xuICAgICAgaW5uZXJDb250ZW50ID0gYXV0b1dyYXBBcnJheUZpZWxkcyhpbm5lckNvbnRlbnQsIHByb3BQYXRoLCBjb250ZXh0LnByb3BlcnRpZXMpO1xuXG4gICAgICBjb25zdCBsb29wQ29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgICAgIC4uLmNvbnRleHQsXG4gICAgICAgIGxvb3BWYXJpYWJsZTogJ2l0ZW0nLFxuICAgICAgICBsb29wSW5kZXg6ICdpbmRleCcsXG4gICAgICAgIGxvb3BBcnJheTogcHJvcFBhdGgsXG4gICAgICAgIGluTG9vcDogdHJ1ZVxuICAgICAgfTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgYW5kIGNvbnZlcnQgaW5uZXIgY29udGVudCAocGFzcyBwcm9wUGF0aCBmb3IgYXR0cmlidXRlIGNvbmRpdGlvbmFscyBhbmQgdW5sZXNzLWxhc3QgZGF0YS1hcnJheSlcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50LCBwcm9wUGF0aCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lciwgcHJvcFBhdGgpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGxvb3BDb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGxvb3BDb250ZXh0LCAnaXRlbScsIGlubmVyQmxvY2tzRmllbGQpO1xuXG4gICAgICAvLyBwcm9wUGF0aCBjYW4gYmUgXCJpdGVtc1wiIG9yIFwianVtcE5hdi5saW5rc1wiIC0gdXNlIGFzLWlzIGZvciB0aGUgbWFwIGV4cHJlc3Npb25cbiAgICAgIHJldHVybiBgeyR7cHJvcFBhdGh9ICYmICR7cHJvcFBhdGh9Lm1hcCgoaXRlbSwgaW5kZXgpID0+IChcbiAgICAgICAgPEZyYWdtZW50IGtleT17aW5kZXh9PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IG5lc3RlZCBsb29wIG1hcmtlcnMgV0lUSCBhbGlhcyAodGhpcy54eHggYXMgfGFsaWFzfCkgdG8gSlNYIG1hcCBleHByZXNzaW9ucyBGSVJTVFxuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88bmVzdGVkLWxvb3AtbWFya2VyXFxzKyg/OmRhdGEtcHJvcHxkYXRhUHJvcCk9XCIoW1xcdy5dKylcIlxccysoPzpkYXRhLWFsaWFzfGRhdGFBbGlhcyk9XCIoXFx3KylcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvbmVzdGVkLWxvb3AtbWFya2VyPikvZ2ksXG4gICAgKF8sIHByb3BOYW1lLCBhbGlhc05hbWUsIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBsZXQgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgXG4gICAgICAvLyBSZXBsYWNlIGFsaWFzIHJlZmVyZW5jZXMgd2l0aCB0aGlzLiByZWZlcmVuY2VzIGJlZm9yZSBwcm9jZXNzaW5nXG4gICAgICAvLyBlLmcuLCB7e3RhZy51cmx9fSAtPiB7e3RoaXMudXJsfX0sIHt7dGFnLmxhYmVsfX0gLT4ge3t0aGlzLmxhYmVsfX1cbiAgICAgIGNvbnN0IGFsaWFzRGVlcFJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3KylcXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc0RlZXBSZWdleCwgJ3t7dGhpcy4kMS4kMn19Jyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGFsaWFzUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNSZWdleCwgJ3t7dGhpcy4kMX19Jyk7XG4gICAgICBcbiAgICAgIC8vIFVzZSB0aGUgYWxpYXMgbmFtZSBmcm9tIHRoZSBIYW5kbGViYXJzIHRlbXBsYXRlIGFzIHRoZSBuZXN0ZWQgbG9vcCB2YXJpYWJsZVxuICAgICAgY29uc3QgbmVzdGVkVmFyID0gYWxpYXNOYW1lIHx8ICdzdWJJdGVtJztcbiAgICAgIGNvbnN0IG5lc3RlZEluZGV4ID0gYCR7bmVzdGVkVmFyfUluZGV4YDtcbiAgICAgIGNvbnN0IGFycmF5UmVmID0gdG9PcHRpb25hbENoYWluZWRBY2Nlc3MocGFyZW50TG9vcFZhciwgcHJvcE5hbWUpO1xuICAgICAgXG4gICAgICBjb25zdCBuZXN0ZWRDb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgbG9vcFZhcmlhYmxlOiBuZXN0ZWRWYXIsXG4gICAgICAgIGxvb3BJbmRleDogbmVzdGVkSW5kZXgsXG4gICAgICAgIGxvb3BBcnJheTogYXJyYXlSZWYsXG4gICAgICAgIGluTG9vcDogdHJ1ZVxuICAgICAgfTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgYW5kIGNvbnZlcnQgaW5uZXIgY29udGVudCB3aXRoIHRoZSBuZXN0ZWQgbG9vcCB2YXJpYWJsZSAocGFzcyBhcnJheVJlZiBmb3IgYXR0cmlidXRlIGNvbmRpdGlvbmFscyBhbmQgdW5sZXNzLWxhc3QgZGF0YS1hcnJheSlcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50LCBhcnJheVJlZik7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lciwgYXJyYXlSZWYpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIG5lc3RlZENvbnRleHQpO1xuICAgICAgXG4gICAgICAvLyBSZXBsYWNlIHJlZmVyZW5jZXMgdG8gdXNlIHRoZSBuZXN0ZWQgdmFyaWFibGVcbiAgICAgIGlubmVySnN4ID0gaW5uZXJKc3gucmVwbGFjZSgvXFx7aXRlbVxcLi9nLCBgeyR7bmVzdGVkVmFyfS5gKTtcbiAgICAgIGlubmVySnN4ID0gaW5uZXJKc3gucmVwbGFjZSgvXFx7aXRlbVxcfS9nLCBgeyR7bmVzdGVkVmFyfX1gKTtcbiAgICAgIFxuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgbmVzdGVkQ29udGV4dCwgbmVzdGVkVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGB7JHthcnJheVJlZn0gJiYgJHthcnJheVJlZn0ubWFwKCgke25lc3RlZFZhcn0sICR7bmVzdGVkSW5kZXh9KSA9PiAoXG4gICAgICAgIDxGcmFnbWVudCBrZXk9eyR7bmVzdGVkSW5kZXh9fT5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkpfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBuZXN0ZWQgbG9vcCBtYXJrZXJzIFdJVEhPVVQgYWxpYXMgKHRoaXMueHh4KSB0byBKU1ggbWFwIGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxuZXN0ZWQtbG9vcC1tYXJrZXJcXHMrKD86ZGF0YS1wcm9wfGRhdGFQcm9wKT1cIihbXFx3Ll0rKVwiXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9uZXN0ZWQtbG9vcC1tYXJrZXI+KS9naSxcbiAgICAoXywgcHJvcE5hbWUsIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICAvLyBVc2UgYSBkaWZmZXJlbnQgdmFyaWFibGUgbmFtZSBmb3IgbmVzdGVkIGxvb3BzIHRvIGF2b2lkIHNoYWRvd2luZ1xuICAgICAgY29uc3QgbmVzdGVkVmFyID0gJ3N1Ykl0ZW0nO1xuICAgICAgY29uc3QgbmVzdGVkSW5kZXggPSAnc3ViSW5kZXgnO1xuICAgICAgY29uc3QgYXJyYXlSZWYgPSB0b09wdGlvbmFsQ2hhaW5lZEFjY2VzcyhwYXJlbnRMb29wVmFyLCBwcm9wTmFtZSk7XG4gICAgICBcbiAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0ID0ge1xuICAgICAgICAuLi5jb250ZXh0LFxuICAgICAgICBsb29wVmFyaWFibGU6IG5lc3RlZFZhcixcbiAgICAgICAgbG9vcEluZGV4OiBuZXN0ZWRJbmRleCxcbiAgICAgICAgbG9vcEFycmF5OiBhcnJheVJlZixcbiAgICAgICAgaW5Mb29wOiB0cnVlXG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBhbmQgY29udmVydCBpbm5lciBjb250ZW50IHdpdGggdGhlIG5lc3RlZCBsb29wIHZhcmlhYmxlIChwYXNzIGFycmF5UmVmIGZvciBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIGFuZCB1bmxlc3MtbGFzdCBkYXRhLWFycmF5KVxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQsIGFycmF5UmVmKTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyLCBhcnJheVJlZik7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgbmVzdGVkQ29udGV4dCk7XG5cbiAgICAgIC8vIFJlcGxhY2UgcmVmZXJlbmNlcyB0byB1c2UgdGhlIG5lc3RlZCB2YXJpYWJsZVxuICAgICAgaW5uZXJKc3ggPSBpbm5lckpzeC5yZXBsYWNlKC9cXHtpdGVtXFwuL2csIGB7JHtuZXN0ZWRWYXJ9LmApO1xuICAgICAgaW5uZXJKc3ggPSBpbm5lckpzeC5yZXBsYWNlKC9cXHtpdGVtXFx9L2csIGB7JHtuZXN0ZWRWYXJ9fWApO1xuXG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBuZXN0ZWRDb250ZXh0LCBuZXN0ZWRWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuXG4gICAgICByZXR1cm4gYHske2FycmF5UmVmfSAmJiAke2FycmF5UmVmfS5tYXAoKCR7bmVzdGVkVmFyfSwgJHtuZXN0ZWRJbmRleH0pID0+IChcbiAgICAgICAgPEZyYWdtZW50IGtleT17JHtuZXN0ZWRJbmRleH19PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSl9YDtcbiAgICB9XG4gICk7XG5cbiAgLy8gQ29udmVydCB1bmxlc3MtbGFzdCBtYXJrZXJzIChkYXRhLWFycmF5IHdoZW4gcHJlc2VudCBjb21lcyBmcm9tIHByZXByb2Nlc3NvciB3aGVuIGluc2lkZSB7eyNlYWNofX0gc28gZXhwYW5zaW9uIHdvcmtzIHdpdGhvdXQgbG9vcCBjb250ZXh0KVxuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzOyBhdHRyaWJ1dGUgb3JkZXI6IGRhdGEtY29udGVudCB0aGVuIG9wdGlvbmFsIGRhdGEtYXJyYXlcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzx1bmxlc3MtbGFzdC1tYXJrZXJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86KD86ZGF0YS1hcnJheXxkYXRhQXJyYXkpPVwiKFteXCJdKylcIlxccyopPyg/OlxcLz58PjxcXC91bmxlc3MtbGFzdC1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZENvbnRlbnQsIGRhdGFBcnJheSkgPT4ge1xuICAgICAgY29uc3QgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgYXJyYXlOYW1lID0gZGF0YUFycmF5IHx8IGNvbnRleHQubG9vcEFycmF5IHx8ICdpdGVtcyc7XG4gICAgICAvLyBVc2UgY29udGV4dCB3aXRoIGxvb3BBcnJheSBzbyBhdHRyaWJ1dGUgdmFsdWVzIChlLmcuIGNsYXNzTmFtZSkgdGhhdCByZWZlcmVuY2UgQGxhc3QgZ2V0IHRoZSBjb3JyZWN0IGFycmF5IG5hbWVcbiAgICAgIGNvbnN0IGV4cGFuZENvbnRleHQgPSB7IC4uLmNvbnRleHQsIGxvb3BBcnJheTogYXJyYXlOYW1lIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGlubmVyIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50KTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwoY2xlYW5lZElubmVyLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBleHBhbmRDb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGV4cGFuZENvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICByZXR1cm4gYHtpbmRleCA8ICR7YXJyYXlOYW1lfT8ubGVuZ3RoIC0gMSAmJiAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHVubGVzcy1maXJzdCBtYXJrZXJzXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzx1bmxlc3MtZmlyc3QtbWFya2VyXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC91bmxlc3MtZmlyc3QtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGlubmVyIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50KTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwoY2xlYW5lZElubmVyLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBjb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICAvLyBAZmlyc3QgaXMgdHJ1ZSB3aGVuIGluZGV4ID09PSAwLCBzbyB1bmxlc3MgQGZpcnN0IG1lYW5zIGluZGV4ICE9PSAwXG4gICAgICByZXR1cm4gYHtpbmRleCAhPT0gMCAmJiAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGlmIG1hcmtlcnMgKHdpdGhvdXQgZWxzZSlcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCAoZGF0YS1jb25kaXRpb24pIGFuZCBjYW1lbENhc2UgKGRhdGFDb25kaXRpb24pIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGlmLW1hcmtlclxccysoPzpkYXRhLWNvbmRpdGlvbnxkYXRhQ29uZGl0aW9uKT1cIihbXlwiXSspXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2lmLW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29uZGl0aW9uLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgY29uZGl0aW9uID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbmRpdGlvbiwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihjb25kaXRpb24sIGNvbnRleHQsIHBhcmVudExvb3BWYXIpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBpbm5lciBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lcik7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgY29udGV4dCk7XG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGB7JHtleHByfSAmJiAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGlmLWVsc2UgbWFya2VycyAod2l0aCBlbHNlKSB0byB0ZXJuYXJ5IGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxpZi1lbHNlLW1hcmtlclxccysoPzpkYXRhLWNvbmRpdGlvbnxkYXRhQ29uZGl0aW9uKT1cIihbXlwiXSspXCJcXHMrKD86ZGF0YS1pZi1jb250ZW50fGRhdGFJZkNvbnRlbnQpPVwiKFteXCJdKylcIlxccysoPzpkYXRhLWVsc2UtY29udGVudHxkYXRhRWxzZUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvaWYtZWxzZS1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZENvbmRpdGlvbiwgZW5jb2RlZElmQ29udGVudCwgZW5jb2RlZEVsc2VDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29uZGl0aW9uLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGlmQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRJZkNvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgZWxzZUNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkRWxzZUNvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24oY29uZGl0aW9uLCBjb250ZXh0LCBwYXJlbnRMb29wVmFyKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaWYgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElmID0gY2xlYW5UZW1wbGF0ZShpZkNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkSWYgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJZik7XG4gICAgICBjb25zdCByb290SWYgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkSWYsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlmSnN4ID0gbm9kZVRvSnN4KHJvb3RJZiwgY29udGV4dCk7XG4gICAgICBpZkpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlmSnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgZWxzZSBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkRWxzZSA9IGNsZWFuVGVtcGxhdGUoZWxzZUNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkRWxzZSA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZEVsc2UpO1xuICAgICAgY29uc3Qgcm9vdEVsc2UgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkRWxzZSwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgZWxzZUpzeCA9IG5vZGVUb0pzeChyb290RWxzZSwgY29udGV4dCk7XG4gICAgICBlbHNlSnN4ID0gcG9zdHByb2Nlc3NKc3goZWxzZUpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIHJldHVybiBgeyR7ZXhwcn0gPyAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lmSnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkgOiAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2Vsc2VKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaWYtZWxzZWlmIG1hcmtlcnMgKHdpdGggZWxzZS1pZiBjaGFpbikgdG8gbmVzdGVkIHRlcm5hcnkgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGlmLWVsc2VpZi1tYXJrZXJcXHMrKD86ZGF0YS1jb25kaXRpb258ZGF0YUNvbmRpdGlvbik9XCIoW15cIl0rKVwiXFxzKyg/OmRhdGEtaWYtY29udGVudHxkYXRhSWZDb250ZW50KT1cIihbXlwiXSspXCJcXHMrKD86ZGF0YS1uZXN0ZWQtbWFya2VyfGRhdGFOZXN0ZWRNYXJrZXIpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvaWYtZWxzZWlmLW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29uZGl0aW9uLCBlbmNvZGVkSWZDb250ZW50LCBlbmNvZGVkTmVzdGVkTWFya2VyKSA9PiB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29uZGl0aW9uLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGlmQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRJZkNvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgbmVzdGVkTWFya2VyID0gQnVmZmVyLmZyb20oZW5jb2RlZE5lc3RlZE1hcmtlciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBcbiAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGNvbmRpdGlvbiwgY29udGV4dCwgcGFyZW50TG9vcFZhcik7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGlmIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRJZiA9IGNsZWFuVGVtcGxhdGUoaWZDb250ZW50KTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZElmID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSWYpO1xuICAgICAgY29uc3Qgcm9vdElmID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZElmLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpZkpzeCA9IG5vZGVUb0pzeChyb290SWYsIGNvbnRleHQpO1xuICAgICAgaWZKc3ggPSBwb3N0cHJvY2Vzc0pzeChpZkpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIC8vIFRoZSBuZXN0ZWQgbWFya2VyIGlzIGFscmVhZHkgYSBwcmVwcm9jZXNzZWQgaWYvaWYtZWxzZS9pZi1lbHNlaWYgbWFya2VyXG4gICAgICAvLyBXZSBuZWVkIHRvIHBhcnNlIGl0IHRocm91Z2ggSFRNTCBwYXJzZXIgYW5kIHByb2Nlc3MgaXRcbiAgICAgIGNvbnN0IHJvb3ROZXN0ZWQgPSBwYXJzZUhUTUwobmVzdGVkTWFya2VyLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBuZXN0ZWRKc3ggPSBub2RlVG9Kc3gocm9vdE5lc3RlZCwgY29udGV4dCk7XG4gICAgICBuZXN0ZWRKc3ggPSBwb3N0cHJvY2Vzc0pzeChuZXN0ZWRKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICAvLyBUaGUgbmVzdGVkIEpTWCBzaG91bGQgYmUgYSBjb25kaXRpb25hbCBleHByZXNzaW9uIGxpa2Uge2NvbmRpdGlvbiA/IC4uLiA6IC4uLn1cbiAgICAgIC8vIFdlIG5lZWQgdG8gZXh0cmFjdCB0aGUgaW5uZXIgcGFydCBhbmQgY2hhaW4gaXRcbiAgICAgIGNvbnN0IHRyaW1tZWROZXN0ZWQgPSBuZXN0ZWRKc3gudHJpbSgpO1xuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiBpdCBzdGFydHMgd2l0aCB7IGFuZCBlbmRzIHdpdGggfVxuICAgICAgaWYgKHRyaW1tZWROZXN0ZWQuc3RhcnRzV2l0aCgneycpICYmIHRyaW1tZWROZXN0ZWQuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICAvLyBFeHRyYWN0IHRoZSBpbm5lciBleHByZXNzaW9uIChyZW1vdmUgb3V0ZXIgYnJhY2VzKVxuICAgICAgICBjb25zdCBpbm5lckV4cHIgPSB0cmltbWVkTmVzdGVkLnNsaWNlKDEsIC0xKS50cmltKCk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gYHske2V4cHJ9ID8gKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpZkpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApIDogJHtpbm5lckV4cHJ9fWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGYWxsYmFjayAtIGp1c3QgdXNlIG51bGwgZm9yIHRoZSBlbHNlIGNhc2VcbiAgICAgICAgcmV0dXJuIGB7JHtleHByfSA/IChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aWZKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSA6IG51bGx9YDtcbiAgICAgIH1cbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGVkaXRhYmxlIGZpZWxkIG1hcmtlcnMgdG8gYXBwcm9wcmlhdGUgY29tcG9uZW50cyBiYXNlZCBvbiBmaWVsZCB0eXBlXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxlZGl0YWJsZS1maWVsZC1tYXJrZXJcXHMrKD86ZGF0YS1maWVsZHxkYXRhRmllbGQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvZWRpdGFibGUtZmllbGQtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRGaWVsZEluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGZpZWxkSW5mbzogRmllbGRJbmZvID0gSlNPTi5wYXJzZShCdWZmZXIuZnJvbShlbmNvZGVkRmllbGRJbmZvLCAnYmFzZTY0JykudG9TdHJpbmcoKSk7XG4gICAgICAgIGNvbnN0IHsgcGF0aCwgdHlwZSwgY29udGVudCB9ID0gZmllbGRJbmZvO1xuICAgICAgICBcbiAgICAgICAgLy8gUGFyc2UgdGhlIHBhdGggdG8gZGV0ZXJtaW5lIGhvdyB0byBzZXQgYXR0cmlidXRlc1xuICAgICAgICBjb25zdCBwYXRoUGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9IHBhdGhQYXJ0cy5sZW5ndGggPiAxO1xuICAgICAgICBcbiAgICAgICAgLy8gQ29udmVydCB0aGUgY29udGVudCAod2hpY2ggY29udGFpbnMgSGFuZGxlYmFycyBleHByZXNzaW9ucykgdG8gSlNYIHZhbHVlIHJlZmVyZW5jZVxuICAgICAgICAvLyBFeHRyYWN0IHRoZSBwcm9wZXJ0eSByZWZlcmVuY2UgZnJvbSBjb250ZW50IGxpa2Uge3twcm9wZXJ0aWVzLnRpdGxlfX0gb3Ige3tjcnVtYi5sYWJlbH19XG4gICAgICAgIGxldCB2YWx1ZUV4cHI6IHN0cmluZztcbiAgICAgICAgbGV0IG9uQ2hhbmdlRXhwcjogc3RyaW5nO1xuICAgICAgICBsZXQgaW1hZ2VJZEV4cHI6IHN0cmluZyA9ICcnO1xuICAgICAgICBsZXQgaW1hZ2VPblNlbGVjdEV4cHI6IHN0cmluZyA9ICcnO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAvLyBUb3AtbGV2ZWwgZmllbGQ6IFwidGl0bGVcIiAtPiB0aXRsZSwgc2V0QXR0cmlidXRlcyh7IHRpdGxlOiB2YWx1ZSB9KVxuICAgICAgICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICB2YWx1ZUV4cHIgPSBgJHtwcm9wTmFtZX0gfHwgJydgO1xuICAgICAgICAgIG9uQ2hhbmdlRXhwciA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogdmFsdWUgfSlgO1xuICAgICAgICAgIC8vIEZvciBpbWFnZXMsIHdlIG5lZWQgdG8gaGFuZGxlIHRoZSBpZCBhbmQgZnVsbCBpbWFnZSBvYmplY3RcbiAgICAgICAgICBpbWFnZUlkRXhwciA9IGAke3Byb3BOYW1lfT8uaWRgO1xuICAgICAgICAgIGltYWdlT25TZWxlY3RFeHByID0gYChpbWFnZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiB7IGlkOiBpbWFnZS5pZCwgc3JjOiBpbWFnZS51cmwsIGFsdDogaW1hZ2UuYWx0IHx8ICcnIH0gfSlgO1xuICAgICAgICB9IGVsc2UgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAvLyBDb3VsZCBiZSBuZXN0ZWQgb2JqZWN0IFwiYnV0dG9uLnRleHRcIiBvciBhcnJheSBmaWVsZCBcImJyZWFkY3J1bWJzLmxhYmVsXCJcbiAgICAgICAgICBjb25zdCBwYXJlbnROYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBwYXRoUGFydHNbMV07XG4gICAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IGNvbnRleHQucHJvcGVydGllc1twYXRoUGFydHNbMF1dIHx8IGNvbnRleHQucHJvcGVydGllc1twYXJlbnROYW1lXTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAocGFyZW50UHJvcD8udHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICAgICAgLy8gQXJyYXkgZmllbGQ6IHVzZSBsb29wIGNvbnRleHRcbiAgICAgICAgICAgIHZhbHVlRXhwciA9IGAke3BhcmVudExvb3BWYXJ9LiR7ZmllbGROYW1lfSB8fCAnJ2A7XG4gICAgICAgICAgICBvbkNoYW5nZUV4cHIgPSBgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLiR7cGFyZW50TmFtZX1dO1xuICAgICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtmaWVsZE5hbWV9OiB2YWx1ZSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICAgIC8vIEZvciBpbWFnZXMgaW4gYXJyYXlzXG4gICAgICAgICAgICBpbWFnZUlkRXhwciA9IGAke3BhcmVudExvb3BWYXJ9LiR7ZmllbGROYW1lfT8uaWRgO1xuICAgICAgICAgICAgaW1hZ2VPblNlbGVjdEV4cHIgPSBgKGltYWdlKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLiR7cGFyZW50TmFtZX1dO1xuICAgICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtmaWVsZE5hbWV9OiB7IGlkOiBpbWFnZS5pZCwgc3JjOiBpbWFnZS51cmwsIGFsdDogaW1hZ2UuYWx0IHx8ICcnIH0gfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgICAgfWA7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE5lc3RlZCBvYmplY3QgZmllbGRcbiAgICAgICAgICAgIHZhbHVlRXhwciA9IGAke3BhcmVudE5hbWV9Py4ke2ZpZWxkTmFtZX0gfHwgJydgO1xuICAgICAgICAgICAgb25DaGFuZ2VFeHByID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IHsgLi4uJHtwYXJlbnROYW1lfSwgJHtmaWVsZE5hbWV9OiB2YWx1ZSB9IH0pYDtcbiAgICAgICAgICAgIC8vIEZvciBpbWFnZXMgaW4gbmVzdGVkIG9iamVjdHNcbiAgICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cGFyZW50TmFtZX0/LiR7ZmllbGROYW1lfT8uaWRgO1xuICAgICAgICAgICAgaW1hZ2VPblNlbGVjdEV4cHIgPSBgKGltYWdlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogeyAuLi4ke3BhcmVudE5hbWV9LCAke2ZpZWxkTmFtZX06IHsgaWQ6IGltYWdlLmlkLCBzcmM6IGltYWdlLnVybCwgYWx0OiBpbWFnZS5hbHQgfHwgJycgfSB9IH0pYDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRGVlcGx5IG5lc3RlZCAtIGRlZmF1bHQgdG8gc2ltcGxlciBoYW5kbGluZ1xuICAgICAgICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICB2YWx1ZUV4cHIgPSBgJHtwYXJlbnRMb29wVmFyfS4ke3BhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV19IHx8ICcnYDtcbiAgICAgICAgICBvbkNoYW5nZUV4cHIgPSBgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdfTogdmFsdWUgfTtcbiAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgfWA7XG4gICAgICAgICAgLy8gRm9yIGltYWdlcyBpbiBkZWVwbHkgbmVzdGVkIHBhdGhzXG4gICAgICAgICAgY29uc3QgbGFzdEZpZWxkID0gcGF0aFBhcnRzW3BhdGhQYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICBpbWFnZUlkRXhwciA9IGAke3BhcmVudExvb3BWYXJ9LiR7bGFzdEZpZWxkfT8uaWRgO1xuICAgICAgICAgIGltYWdlT25TZWxlY3RFeHByID0gYChpbWFnZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwcm9wTmFtZX1dO1xuICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7bGFzdEZpZWxkfTogeyBpZDogaW1hZ2UuaWQsIHNyYzogaW1hZ2UudXJsLCBhbHQ6IGltYWdlLmFsdCB8fCAnJyB9IH07XG4gICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgIH1gO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBHZW5lcmF0ZSBhcHByb3ByaWF0ZSBjb21wb25lbnQgYmFzZWQgb24gZmllbGQgdHlwZVxuICAgICAgICBpZiAodHlwZSA9PT0gJ2ltYWdlJykge1xuICAgICAgICAgIC8vIFVzZSAxMHVwIEltYWdlIGNvbXBvbmVudCBmb3IgaW5saW5lLWVkaXRhYmxlIGltYWdlc1xuICAgICAgICAgIHJldHVybiBgPEltYWdlXG4gICAgICAgICAgICBpZD17JHtpbWFnZUlkRXhwcn19XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJoYW5kb2ZmLWVkaXRhYmxlLWZpZWxkXCJcbiAgICAgICAgICAgIG9uU2VsZWN0PXske2ltYWdlT25TZWxlY3RFeHByfX1cbiAgICAgICAgICAgIHNpemU9XCJsYXJnZVwiXG4gICAgICAgICAgLz5gO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyaWNodGV4dCcpIHtcbiAgICAgICAgICAvLyBFeHRyYWN0IHRoZSB0b3AtbGV2ZWwgZmllbGQgbmFtZSBmcm9tIHRoZSBwYXRoIChlLmcuIFwiY29udGVudFwiIGZyb20gXCJjb250ZW50XCIpXG4gICAgICAgICAgY29uc3QgdG9wTGV2ZWxGaWVsZCA9IHBhdGguc3BsaXQoJy4nKVswXTtcbiAgICAgICAgICBpZiAoaW5uZXJCbG9ja3NGaWVsZCAmJiB0b3BMZXZlbEZpZWxkID09PSBpbm5lckJsb2Nrc0ZpZWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gYDxJbm5lckJsb2NrcyBhbGxvd2VkQmxvY2tzPXtDT05URU5UX0JMT0NLU30gLz5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBSaWNodGV4dCB3aXRob3V0IElubmVyQmxvY2tzOiB1c2UgUmljaFRleHQgd2l0aCBmb3JtYXR0aW5nIGFsbG93ZWRcbiAgICAgICAgICByZXR1cm4gYDxSaWNoVGV4dFxuICAgICAgICAgICAgdGFnTmFtZT1cImRpdlwiXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJoYW5kb2ZmLWVkaXRhYmxlLWZpZWxkXCJcbiAgICAgICAgICAgIHZhbHVlPXske3ZhbHVlRXhwcn19XG4gICAgICAgICAgICBvbkNoYW5nZT17JHtvbkNoYW5nZUV4cHJ9fVxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciBjb250ZW50Li4uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2xpbmsnIHx8IHR5cGUgPT09ICdidXR0b24nKSB7XG4gICAgICAgICAgY29uc3Qgc2FmZUlkID0gcGF0aC5yZXBsYWNlKC9cXC4vZywgJ18nKTtcbiAgICAgICAgICBjb25zdCBvYmpSZWYgPSB2YWx1ZUV4cHIucmVwbGFjZSgvIFxcfFxcfCAnJyQvLCAnJyk7XG4gICAgICAgICAgY29uc3QgaXNMaW5rID0gdHlwZSA9PT0gJ2xpbmsnO1xuICAgICAgICAgIGNvbnN0IHBhcmVudFBhdGhLZXkgPSBwYXRoUGFydHNbMF07XG4gICAgICAgICAgY29uc3QgYnV0dG9uUGFyZW50UHJvcCA9XG4gICAgICAgICAgICAhaXNMaW5rICYmIGNvbnRleHQucHJvcGVydGllc1xuICAgICAgICAgICAgICA/IGNvbnRleHQucHJvcGVydGllc1twYXJlbnRQYXRoS2V5XSA/PyBjb250ZXh0LnByb3BlcnRpZXNbdG9DYW1lbENhc2UocGFyZW50UGF0aEtleSldXG4gICAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICAgIGNvbnN0IGJ1dHRvbktleXMgPSAhaXNMaW5rID8gcmVzb2x2ZUJ1dHRvbkZpZWxkS2V5cyhidXR0b25QYXJlbnRQcm9wKSA6IG51bGw7XG5cbiAgICAgICAgICBjb25zdCBsYWJlbFZhbHVlRXhwciA9IGlzTGlua1xuICAgICAgICAgICAgPyBgJHtvYmpSZWZ9Py5sYWJlbCB8fCAnJ2BcbiAgICAgICAgICAgIDogYCR7b2JqUmVmfT8uJHtidXR0b25LZXlzIS5sYWJlbEtleX0gfHwgJydgO1xuICAgICAgICAgIGNvbnN0IHVybEV4cHIgPSBpc0xpbmtcbiAgICAgICAgICAgID8gYCR7b2JqUmVmfT8udXJsIHx8ICcnYFxuICAgICAgICAgICAgOiBgJHtvYmpSZWZ9Py4ke2J1dHRvbktleXMhLnVybEtleX0gfHwgJyR7Z2V0QnV0dG9uVXJsRmFsbGJhY2soYnV0dG9uS2V5cyEudXJsS2V5KX0nYDtcbiAgICAgICAgICBjb25zdCBuZXdUYWJFeHByID0gaXNMaW5rID8gYCR7b2JqUmVmfT8ub3BlbnNJbk5ld1RhYiB8fCBmYWxzZWAgOiBgJHtvYmpSZWZ9Py50YXJnZXQgPT09ICdfYmxhbmsnYDtcbiAgICAgICAgICBjb25zdCBsYWJlbE1lcmdlID0gaXNMaW5rXG4gICAgICAgICAgICA/IGB7IC4uLiR7b2JqUmVmfSwgbGFiZWw6IHZhbHVlIH1gXG4gICAgICAgICAgICA6IGJ1dHRvbkxhYmVsTWVyZ2VKcyhvYmpSZWYsIGJ1dHRvbktleXMhKTtcbiAgICAgICAgICBjb25zdCBsaW5rTWVyZ2UgPSBpc0xpbmtcbiAgICAgICAgICAgID8gYHsgLi4uJHtvYmpSZWZ9LCB1cmw6IHZhbHVlLnVybCB8fCAnJywgb3BlbnNJbk5ld1RhYjogdmFsdWUub3BlbnNJbk5ld1RhYiB8fCBmYWxzZSB9YFxuICAgICAgICAgICAgOiBidXR0b25MaW5rTWVyZ2VKcyhvYmpSZWYsIGJ1dHRvbktleXMhKTtcblxuICAgICAgICAgIC8vIEJ1aWxkIG9uQ2hhbmdlIGhhbmRsZXJzIGZyb20gc2NyYXRjaCBiYXNlZCBvbiBmaWVsZCBjb250ZXh0XG4gICAgICAgICAgbGV0IGxhYmVsT25DaGFuZ2U6IHN0cmluZztcbiAgICAgICAgICBsZXQgbGlua09uQ2hhbmdlOiBzdHJpbmc7XG4gICAgICAgICAgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGxhYmVsT25DaGFuZ2UgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06ICR7bGFiZWxNZXJnZX0gfSlgO1xuICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiAke2xpbmtNZXJnZX0gfSlgO1xuICAgICAgICAgIH0gZWxzZSBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgY29uc3QgcGFyZW50TmFtZSA9IHRvQ2FtZWxDYXNlKHBhdGhQYXJ0c1swXSk7XG4gICAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBwYXRoUGFydHNbMV07XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gY29udGV4dC5wcm9wZXJ0aWVzW3BhdGhQYXJ0c1swXV0gfHwgY29udGV4dC5wcm9wZXJ0aWVzW3BhcmVudE5hbWVdO1xuICAgICAgICAgICAgaWYgKHBhcmVudFByb3A/LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwYXJlbnROYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2ZpZWxkTmFtZX06ICR7bGFiZWxNZXJnZX0gfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgICAgfWA7XG4gICAgICAgICAgICAgIGxpbmtPbkNoYW5nZSA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwYXJlbnROYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2ZpZWxkTmFtZX06ICR7bGlua01lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxhYmVsT25DaGFuZ2UgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogeyAuLi4ke3BhcmVudE5hbWV9LCAke2ZpZWxkTmFtZX06ICR7bGFiZWxNZXJnZX0gfSB9KWA7XG4gICAgICAgICAgICAgIGxpbmtPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogJHtsaW5rTWVyZ2V9IH0gfSlgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBwcm9wTmFtZSA9IHRvQ2FtZWxDYXNlKHBhdGhQYXJ0c1swXSk7XG4gICAgICAgICAgICBjb25zdCBsYXN0RmllbGQgPSBwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwcm9wTmFtZX1dO1xuICAgICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtsYXN0RmllbGR9OiAke2xhYmVsTWVyZ2V9IH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICAgIGxpbmtPbkNoYW5nZSA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwcm9wTmFtZX1dO1xuICAgICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtsYXN0RmllbGR9OiAke2xpbmtNZXJnZX0gfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBgPEhhbmRvZmZMaW5rRmllbGRcbiAgICAgICAgICAgIGZpZWxkSWQ9XCIke3NhZmVJZH1cIlxuICAgICAgICAgICAgbGFiZWw9eyR7bGFiZWxWYWx1ZUV4cHJ9fVxuICAgICAgICAgICAgdXJsPXske3VybEV4cHJ9fVxuICAgICAgICAgICAgb3BlbnNJbk5ld1RhYj17JHtuZXdUYWJFeHByfX1cbiAgICAgICAgICAgIG9uTGFiZWxDaGFuZ2U9eyR7bGFiZWxPbkNoYW5nZX19XG4gICAgICAgICAgICBvbkxpbmtDaGFuZ2U9eyR7bGlua09uQ2hhbmdlfX1cbiAgICAgICAgICAgIGlzU2VsZWN0ZWQ9e2lzU2VsZWN0ZWR9XG4gICAgICAgICAgLz5gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEZvciB0ZXh0IGZpZWxkcywgdXNlIFJpY2hUZXh0IHdpdGggbm8gYWxsb3dlZCBmb3JtYXRzIGZvciBpbmxpbmUgY29udGVudGVkaXRhYmxlIGVkaXRpbmdcbiAgICAgICAgICByZXR1cm4gYDxSaWNoVGV4dFxuICAgICAgICAgICAgdGFnTmFtZT1cInNwYW5cIlxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiaGFuZG9mZi1lZGl0YWJsZS1maWVsZFwiXG4gICAgICAgICAgICB2YWx1ZT17JHt2YWx1ZUV4cHJ9fVxuICAgICAgICAgICAgb25DaGFuZ2U9eyR7b25DaGFuZ2VFeHByfX1cbiAgICAgICAgICAgIGFsbG93ZWRGb3JtYXRzPXtbXX1cbiAgICAgICAgICAgIHBsYWNlaG9sZGVyPXtfXygnRW50ZXIgdGV4dC4uLicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgLz5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIElmIHBhcnNpbmcgZmFpbHMsIGp1c3QgcmV0dXJuIGVtcHR5XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIH1cbiAgICB9XG4gICk7XG4gIFxuICAvLyBGaW5hbCBjbGVhbnVwIC0gY29udmVydCBhbnkgcmVtYWluaW5nIGNsYXNzPSB0byBjbGFzc05hbWU9XG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXGJjbGFzcz1cIi9nLCAnY2xhc3NOYW1lPVwiJyk7XG4gIFxuICAvLyBSZW1vdmUgZW1wdHkgY2xhc3NOYW1lIGF0dHJpYnV0ZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xccytjbGFzc05hbWU9XCJcIi9nLCAnJyk7XG4gIFxuICByZXR1cm4gcmVzdWx0O1xufTtcbiJdfQ==