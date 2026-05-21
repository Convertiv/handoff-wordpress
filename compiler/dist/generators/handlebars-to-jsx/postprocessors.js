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
    result = result.replace(/<nested-loop-marker\s+(?:data-prop|dataProp)="(\w+)"\s+(?:data-alias|dataAlias)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/nested-loop-marker>)/gi, (_, propName, aliasName, encodedContent) => {
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
        const arrayRef = `${parentLoopVar}.${propName}`;
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
    result = result.replace(/<nested-loop-marker\s+(?:data-prop|dataProp)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/nested-loop-marker>)/gi, (_, propName, encodedContent) => {
        const innerContent = Buffer.from(encodedContent, 'base64').toString();
        // Use a different variable name for nested loops to avoid shadowing
        const nestedVar = 'subItem';
        const nestedIndex = 'subIndex';
        const arrayRef = `${parentLoopVar}.${propName}`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zdHByb2Nlc3NvcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9wb3N0cHJvY2Vzc29ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILHVEQUFzRDtBQUd0RCxvREFLMEI7QUFDMUIsbUNBQXNDO0FBQ3RDLDJEQUEwRDtBQUMxRCxtREFBa0U7QUFFbEUscURBQTZDO0FBRTdDLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFFckQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLG1CQUFtQixHQUFHLENBQzFCLFlBQW9CLEVBQ3BCLGFBQXFCLEVBQ3JCLFVBQTJDLEVBQ25DLEVBQUU7SUFDVixNQUFNLFNBQVMsR0FBRyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDakUsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVTtRQUFFLE9BQU8sWUFBWSxDQUFDO0lBQ3ZELE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO0lBRTdDLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQztJQUUxQixtRkFBbUY7SUFDbkYsa0VBQWtFO0lBQ2xFLE1BQU0sY0FBYyxHQUFHLGtDQUFrQyxDQUFDO0lBQzFELElBQUksS0FBSyxDQUFDO0lBQ1YsTUFBTSxZQUFZLEdBQWdGLEVBQUUsQ0FBQztJQUVyRyxPQUFPLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUN0RCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FB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QUFDLENBQUMsQ0FBQztvQkFDbEQsYUFBYSxHQUFHO3FDQUNTLFFBQVE7d0RBQ1csU0FBUyxLQUFLLFVBQVU7Z0NBQ2hELFFBQVE7Y0FDMUIsQ0FBQztvQkFDSCxZQUFZLEdBQUc7cUNBQ1UsUUFBUTt3REFDVyxTQUFTLEtBQUssU0FBUztnQ0FDL0MsUUFBUTtjQUMxQixDQUFDO2dCQUNMLENBQUM7Z0JBRUQsT0FBTzt1QkFDTSxNQUFNO3FCQUNSLGNBQWM7bUJBQ2hCLE9BQU87NkJBQ0csVUFBVTs2QkFDVixhQUFhOzRCQUNkLFlBQVk7O2FBRTNCLENBQUM7WUFDTixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sMkZBQTJGO2dCQUMzRixPQUFPOzs7cUJBR0ksU0FBUzt3QkFDTixZQUFZOzs7YUFHdkIsQ0FBQztZQUNOLENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNYLHNDQUFzQztZQUN0QyxPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUM7SUFDSCxDQUFDLENBQ0YsQ0FBQztJQUVGLDZEQUE2RDtJQUM3RCxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFFckQsb0NBQW9DO0lBQ3BDLE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRWhELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQS9oQlcsUUFBQSxjQUFjLGtCQStoQnpCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQb3N0cHJvY2Vzc2luZyB1dGlsaXRpZXMgZm9yIHRoZSBIYW5kbGViYXJzIHRvIEpTWCB0cmFuc3BpbGVyXG4gKi9cblxuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VIVE1MIH0gZnJvbSAnbm9kZS1odG1sLXBhcnNlcic7XG5pbXBvcnQgeyBUcmFuc3BpbGVyQ29udGV4dCwgRmllbGRJbmZvIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBIYW5kb2ZmUHJvcGVydHkgfSBmcm9tICcuLi8uLi90eXBlcyc7XG5pbXBvcnQge1xuICByZXNvbHZlQnV0dG9uRmllbGRLZXlzLFxuICBidXR0b25MYWJlbE1lcmdlSnMsXG4gIGJ1dHRvbkxpbmtNZXJnZUpzLFxuICBnZXRCdXR0b25VcmxGYWxsYmFjayxcbn0gZnJvbSAnLi4vYnV0dG9uLXNjaGVtYSc7XG5pbXBvcnQgeyB0b0NhbWVsQ2FzZSB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgdHJhbnNwaWxlRXhwcmVzc2lvbiB9IGZyb20gJy4vZXhwcmVzc2lvbi1wYXJzZXInO1xuaW1wb3J0IHsgY2xlYW5UZW1wbGF0ZSwgcHJlcHJvY2Vzc0Jsb2NrcyB9IGZyb20gJy4vcHJlcHJvY2Vzc29ycyc7XG5pbXBvcnQgeyBsb29rdXBGaWVsZFR5cGUgfSBmcm9tICcuL2ZpZWxkLWxvb2t1cCc7XG5pbXBvcnQgeyBub2RlVG9Kc3ggfSBmcm9tICcuL25vZGUtY29udmVydGVyJztcblxuY29uc3QgQVVUT1dSQVBfVFlQRVMgPSBuZXcgU2V0KFsndGV4dCcsICdyaWNodGV4dCddKTtcblxuLyoqXG4gKiBBdXRvLXdyYXAgYmFyZSB7e3RoaXMuZmllbGROYW1lfX0gZXhwcmVzc2lvbnMgaW5zaWRlIGxvb3AgY29udGVudCB3aXRoXG4gKiBlZGl0YWJsZS1maWVsZC1tYXJrZXIgZWxlbWVudHMgd2hlbiB0aGUgY29ycmVzcG9uZGluZyBhcnJheSBpdGVtIHByb3BlcnR5XG4gKiBpcyB0ZXh0IG9yIHJpY2h0ZXh0LiBUaGlzIG1ha2VzIGFycmF5IGl0ZW0gZmllbGRzIGlubGluZS1lZGl0YWJsZSBldmVuXG4gKiB3aGVuIHRoZSBIYW5kb2ZmIEFQSSB0ZW1wbGF0ZSBvbWl0cyBleHBsaWNpdCB7eyNmaWVsZH19IG1hcmtlcnMuXG4gKlxuICogT25seSB3cmFwcyBleHByZXNzaW9ucyB0aGF0IGFwcGVhciBhcyBkaXJlY3QgdGV4dCBjb250ZW50IGJldHdlZW4gSFRNTCB0YWdzXG4gKiAobm90IGluc2lkZSBhdHRyaWJ1dGUgdmFsdWVzKS5cbiAqL1xuY29uc3QgYXV0b1dyYXBBcnJheUZpZWxkcyA9IChcbiAgaW5uZXJDb250ZW50OiBzdHJpbmcsXG4gIGFycmF5UHJvcFBhdGg6IHN0cmluZyxcbiAgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5Pixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGFycmF5UHJvcCA9IGxvb2t1cEFycmF5UHJvcGVydHkoYXJyYXlQcm9wUGF0aCwgcHJvcGVydGllcyk7XG4gIGlmICghYXJyYXlQcm9wPy5pdGVtcz8ucHJvcGVydGllcykgcmV0dXJuIGlubmVyQ29udGVudDtcbiAgY29uc3QgaXRlbVByb3BzID0gYXJyYXlQcm9wLml0ZW1zLnByb3BlcnRpZXM7XG5cbiAgbGV0IHJlc3VsdCA9IGlubmVyQ29udGVudDtcblxuICAvLyBGaW5kIHt7dGhpcy5maWVsZE5hbWV9fSBvciB7e3t0aGlzLmZpZWxkTmFtZX19fSBleHByZXNzaW9ucyB0aGF0IGFyZSBOT1QgYWxyZWFkeVxuICAvLyBpbnNpZGUge3sjZmllbGR9fSBtYXJrZXJzIGFuZCBOT1QgaW5zaWRlIEhUTUwgYXR0cmlidXRlIHZhbHVlcy5cbiAgY29uc3QgdGhpc0ZpZWxkUmVnZXggPSAvXFx7XFx7XFx7P1xccyp0aGlzXFwuKFxcdyspXFxzKlxcfVxcfVxcfT8vZztcbiAgbGV0IG1hdGNoO1xuICBjb25zdCByZXBsYWNlbWVudHM6IEFycmF5PHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IGZpZWxkTmFtZTogc3RyaW5nOyBmaWVsZFR5cGU6IHN0cmluZyB9PiA9IFtdO1xuXG4gIHdoaWxlICgobWF0Y2ggPSB0aGlzRmllbGRSZWdleC5leGVjKHJlc3VsdCkpICE9PSBudWxsKSB7XG4gICAgY29uc3QgZmllbGROYW1lID0gbWF0Y2hbMV07XG4gICAgY29uc3QgaXRlbVByb3AgPSBpdGVtUHJvcHNbZmllbGROYW1lXTtcbiAgICBpZiAoIWl0ZW1Qcm9wIHx8ICFBVVRPV1JBUF9UWVBFUy5oYXMoaXRlbVByb3AudHlwZSkpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCBpZiBhbHJlYWR5IHdyYXBwZWQgaW4ge3sjZmllbGR9fVxuICAgIGNvbnN0IGJlZm9yZSA9IHJlc3VsdC5zdWJzdHJpbmcoTWF0aC5tYXgoMCwgbWF0Y2guaW5kZXggLSAyMDApLCBtYXRjaC5pbmRleCk7XG4gICAgaWYgKGJlZm9yZS5pbmNsdWRlcygne3sjZmllbGQnKSAmJiAhYmVmb3JlLmluY2x1ZGVzKCd7ey9maWVsZH19JykpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCBpZiBpbnNpZGUgYW4gYXR0cmlidXRlIHZhbHVlIChjaGVjayBmb3Igb2RkIG51bWJlciBvZiBxdW90ZXMgYmVmb3JlIG1hdGNoKVxuICAgIGNvbnN0IGxhc3RUYWdTdGFydCA9IHJlc3VsdC5sYXN0SW5kZXhPZignPCcsIG1hdGNoLmluZGV4KTtcbiAgICBpZiAobGFzdFRhZ1N0YXJ0ICE9PSAtMSkge1xuICAgICAgY29uc3Qgc2VnbWVudCA9IHJlc3VsdC5zdWJzdHJpbmcobGFzdFRhZ1N0YXJ0LCBtYXRjaC5pbmRleCk7XG4gICAgICBjb25zdCBzZWdtZW50Tm9IYnMgPSBzZWdtZW50LnJlcGxhY2UoL1xce1xce1tcXHNcXFNdKj9cXH1cXH0vZywgJycpO1xuICAgICAgY29uc3QgcXVvdGVDb3VudCA9IChzZWdtZW50Tm9IYnMubWF0Y2goL1wiL2cpIHx8IFtdKS5sZW5ndGg7XG4gICAgICBpZiAocXVvdGVDb3VudCAlIDIgPT09IDEpIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlcGxhY2VtZW50cy5wdXNoKHtcbiAgICAgIHN0YXJ0OiBtYXRjaC5pbmRleCxcbiAgICAgIGVuZDogbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgsXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBmaWVsZFR5cGU6IGl0ZW1Qcm9wLnR5cGUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBcHBseSByZXBsYWNlbWVudHMgaW4gcmV2ZXJzZSBvcmRlciB0byBwcmVzZXJ2ZSBwb3NpdGlvbnNcbiAgZm9yIChsZXQgaSA9IHJlcGxhY2VtZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGNvbnN0IHIgPSByZXBsYWNlbWVudHNbaV07XG4gICAgY29uc3QgZmllbGRQYXRoID0gYCR7YXJyYXlQcm9wUGF0aH0uJHtyLmZpZWxkTmFtZX1gO1xuICAgIGNvbnN0IGZpZWxkSW5mbyA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIHBhdGg6IGZpZWxkUGF0aCxcbiAgICAgIHR5cGU6IHIuZmllbGRUeXBlLFxuICAgICAgY29udGVudDogYHt7dGhpcy4ke3IuZmllbGROYW1lfX19YCxcbiAgICB9KSkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIGNvbnN0IG1hcmtlciA9IGA8ZWRpdGFibGUtZmllbGQtbWFya2VyIGRhdGEtZmllbGQ9XCIke2ZpZWxkSW5mb31cIj48L2VkaXRhYmxlLWZpZWxkLW1hcmtlcj5gO1xuICAgIHJlc3VsdCA9IHJlc3VsdC5zdWJzdHJpbmcoMCwgci5zdGFydCkgKyBtYXJrZXIgKyByZXN1bHQuc3Vic3RyaW5nKHIuZW5kKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiogUmVzb2x2ZSBhbiBhcnJheSBwcm9wZXJ0eSBmcm9tIGEgZG90LXBhdGggbGlrZSBcIml0ZW1zXCIgb3IgXCJqdW1wTmF2LmxpbmtzXCIgKi9cbmNvbnN0IGxvb2t1cEFycmF5UHJvcGVydHkgPSAoXG4gIHByb3BQYXRoOiBzdHJpbmcsXG4gIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEhhbmRvZmZQcm9wZXJ0eT4sXG4pOiBIYW5kb2ZmUHJvcGVydHkgfCBudWxsID0+IHtcbiAgY29uc3QgcGFydHMgPSBwcm9wUGF0aC5zcGxpdCgnLicpO1xuICBsZXQgY3VycmVudDogUmVjb3JkPHN0cmluZywgSGFuZG9mZlByb3BlcnR5PiA9IHByb3BlcnRpZXM7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwYXJ0ID0gcGFydHNbaV07XG4gICAgY29uc3QgcHJvcCA9IGN1cnJlbnRbcGFydF0gfHwgY3VycmVudFt0b0NhbWVsQ2FzZShwYXJ0KV07XG4gICAgaWYgKCFwcm9wKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoaSA9PT0gcGFydHMubGVuZ3RoIC0gMSkgcmV0dXJuIHByb3AudHlwZSA9PT0gJ2FycmF5JyA/IHByb3AgOiBudWxsO1xuICAgIGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcz8ucHJvcGVydGllcykge1xuICAgICAgY3VycmVudCA9IHByb3AuaXRlbXMucHJvcGVydGllcztcbiAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgcHJvcC5wcm9wZXJ0aWVzKSB7XG4gICAgICBjdXJyZW50ID0gcHJvcC5wcm9wZXJ0aWVzO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59O1xuXG4vKipcbiAqIFBvc3QtcHJvY2VzcyB0byBjb252ZXJ0IHRlbXBsYXRlIGxpdGVyYWwgbWFya2VycyBiYWNrIHRvIGFjdHVhbCB0ZW1wbGF0ZSBsaXRlcmFsc1xuICovXG5leHBvcnQgY29uc3QgcG9zdHByb2Nlc3NUZW1wbGF0ZUxpdGVyYWxzID0gKGpzeDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGpzeC5yZXBsYWNlKC9fX1RFTVBMQVRFX0xJVEVSQUxfXyhbQS1aYS16MC05Ky89XSspX19FTkRfVEVNUExBVEVfTElURVJBTF9fL2csIChfLCBlbmNvZGVkKSA9PiB7XG4gICAgY29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGVuY29kZWQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgIHJldHVybiAnYCcgKyBkZWNvZGVkICsgJ2AnO1xuICB9KTtcbn07XG5cbi8qKlxuICogUG9zdC1wcm9jZXNzIEpTWCB0byBjb252ZXJ0IG1hcmtlcnMgYmFjayB0byBKU1ggbG9naWNcbiAqL1xuZXhwb3J0IGNvbnN0IHBvc3Rwcm9jZXNzSnN4ID0gKGpzeDogc3RyaW5nLCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCwgcGFyZW50TG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nLCBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyA9PiB7XG4gIGxldCByZXN1bHQgPSBqc3g7XG4gIFxuICAvLyBDb252ZXJ0IHRvcC1sZXZlbCBsb29wIG1hcmtlcnMgV0lUSCBhbGlhcyAocHJvcGVydGllcy54eHggb3IgcHJvcGVydGllcy54eHgueXl5IGFzIHxhbGlhc3wpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCAoZGF0YS1wcm9wKSBhbmQgY2FtZWxDYXNlIChkYXRhUHJvcCkgYXR0cmlidXRlIG5hbWVzXG4gIC8vIGRhdGEtcHJvcCBub3cgY29udGFpbnMgcGF0aHMgbGlrZSBcImp1bXBOYXYubGlua3NcIiBmb3IgbmVzdGVkIHByb3BlcnR5IGFjY2Vzc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGxvb3AtbWFya2VyXFxzKyg/OmRhdGEtcHJvcHxkYXRhUHJvcCk9XCIoW1xcdy5dKylcIlxccysoPzpkYXRhLXR5cGV8ZGF0YVR5cGUpPVwicHJvcGVydGllc1wiXFxzKyg/OmRhdGEtYWxpYXN8ZGF0YUFsaWFzKT1cIihcXHcrKVwiXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9sb29wLW1hcmtlcj4pL2dpLFxuICAgIChfLCBwcm9wUGF0aCwgYWxpYXNOYW1lLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgbGV0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgLy8gUmVwbGFjZSB7e2FsaWFzLmZpZWxkfX0gYW5kIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkIH19IHJlZmVyZW5jZXMgd2l0aCB7e3RoaXMuZmllbGR9fSBiZWZvcmUgcHJvY2Vzc2luZ1xuICAgICAgLy8gVGhpcyBub3JtYWxpemVzIHRoZSBhbGlhcyB0byB0aGUgc3RhbmRhcmQgJ3RoaXMuJyBmb3JtYXRcbiAgICAgIC8vIEhhbmRsZSBib3RoIHNpbmdsZSBhbmQgbmVzdGVkIHByb3BlcnR5IGFjY2VzcyAoZS5nLiwgY2FyZC5saW5rLnVybCAtPiB0aGlzLmxpbmsudXJsKVxuICAgICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAne3t0aGlzLiQxLiQyfX0nKTtcbiAgICAgIFxuICAgICAgY29uc3QgYWxpYXNSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzTmFtZX1cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc1JlZ2V4LCAne3t0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gSU1QT1JUQU5UOiBBbHNvIHJlcGxhY2UgY29uZGl0aW9uYWxzIHRoYXQgdXNlIHRoZSBhbGlhcywgZS5nLiB7eyNpZiBhbGlhcy5maWVsZH19IC0+IHt7I2lmIHRoaXMuZmllbGR9fVxuICAgICAgLy8gVGhpcyBoYW5kbGVzIHBhdHRlcm5zIGxpa2Uge3sjaWYgdGVzdGltb25pYWwuaW1hZ2V9fSBpbnNpZGUge3sjZWFjaCBwcm9wZXJ0aWVzLnRlc3RpbW9uaWFscyBhcyB8dGVzdGltb25pYWx8fX1cbiAgICAgIGNvbnN0IGFsaWFzSWZSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNJZlJlZ2V4LCAne3sjaWYgdGhpcy4kMX19Jyk7XG4gICAgICBcbiAgICAgIC8vIEFsc28gaGFuZGxlIHt7I3VubGVzcyBhbGlhcy5maWVsZH19XG4gICAgICBjb25zdCBhbGlhc1VubGVzc1JlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyN1bmxlc3NcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNVbmxlc3NSZWdleCwgJ3t7I3VubGVzcyB0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gQWxzbyBoYW5kbGUgbmVzdGVkIHt7I2VhY2ggYWxpYXMuZmllbGQgYXMgfG5lc3RlZEFsaWFzfH19IGxvb3BzXG4gICAgICAvLyBUaGlzIGNvbnZlcnRzIGUuZy4ge3sjZWFjaCBwb3N0LnRhZ3MgYXMgfHRhZ3x9fSAtPiB7eyNlYWNoIHRoaXMudGFncyBhcyB8dGFnfH19XG4gICAgICBjb25zdCBhbGlhc0VhY2hSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjZWFjaFxcXFxzKyR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3Kyg/OlxcXFwuXFxcXHcrKSopXFxcXHMrYXNcXFxccytcXFxcfChbXnxdKylcXFxcfFxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNFYWNoUmVnZXgsICd7eyNlYWNoIHRoaXMuJDEgYXMgfCQyfH19Jyk7XG4gICAgICBcbiAgICAgIC8vIEFsc28gaGFuZGxlIHt7I2VhY2ggYWxpYXMuZmllbGR9fSB3aXRob3V0IGFsaWFzIChsZXNzIGNvbW1vbiBidXQgcG9zc2libGUpXG4gICAgICBjb25zdCBhbGlhc0VhY2hOb0FsaWFzUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2VhY2hcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNFYWNoTm9BbGlhc1JlZ2V4LCAne3sjZWFjaCB0aGlzLiQxfX0nKTtcblxuICAgICAgLy8gQXV0by13cmFwIGJhcmUge3t0aGlzLnh4eH19IHRleHQvcmljaHRleHQgZmllbGRzIHdpdGggZWRpdGFibGUgbWFya2Vyc1xuICAgICAgaW5uZXJDb250ZW50ID0gYXV0b1dyYXBBcnJheUZpZWxkcyhpbm5lckNvbnRlbnQsIHByb3BQYXRoLCBjb250ZXh0LnByb3BlcnRpZXMpO1xuICAgICAgXG4gICAgICAvLyBVc2UgdGhlIGFsaWFzIG5hbWUgZnJvbSB0aGUgSGFuZGxlYmFycyB0ZW1wbGF0ZSBhcyB0aGUgbG9vcCB2YXJpYWJsZVxuICAgICAgY29uc3QgbG9vcFZhck5hbWUgPSBhbGlhc05hbWUgfHwgJ2l0ZW0nO1xuICAgICAgY29uc3QgbG9vcENvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0ID0ge1xuICAgICAgICAuLi5jb250ZXh0LFxuICAgICAgICBsb29wVmFyaWFibGU6IGxvb3BWYXJOYW1lLFxuICAgICAgICBsb29wSW5kZXg6ICdpbmRleCcsXG4gICAgICAgIGxvb3BBcnJheTogcHJvcFBhdGgsXG4gICAgICAgIGluTG9vcDogdHJ1ZVxuICAgICAgfTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgYW5kIGNvbnZlcnQgaW5uZXIgY29udGVudCAocGFzcyBwcm9wUGF0aCBzbyBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIGFuZCB7eyN1bmxlc3MgQGxhc3R9fSBnZXQgY29ycmVjdCBhcnJheSBuYW1lKVxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQsIHByb3BQYXRoKTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyLCBwcm9wUGF0aCk7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgbG9vcENvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgbG9vcENvbnRleHQsIGxvb3BWYXJOYW1lLCBpbm5lckJsb2Nrc0ZpZWxkKTtcblxuICAgICAgLy8gcHJvcFBhdGggY2FuIGJlIFwiaXRlbXNcIiBvciBcImp1bXBOYXYubGlua3NcIiAtIHVzZSBhcy1pcyBmb3IgdGhlIG1hcCBleHByZXNzaW9uXG4gICAgICByZXR1cm4gYHske3Byb3BQYXRofSAmJiAke3Byb3BQYXRofS5tYXAoKCR7bG9vcFZhck5hbWV9LCBpbmRleCkgPT4gKFxuICAgICAgICA8RnJhZ21lbnQga2V5PXtpbmRleH0+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgdG9wLWxldmVsIGxvb3AgbWFya2VycyBXSVRIT1VUIGFsaWFzIChwcm9wZXJ0aWVzLnh4eCBvciBwcm9wZXJ0aWVzLnh4eC55eXkpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICAvLyBkYXRhLXByb3Agbm93IGNvbnRhaW5zIHBhdGhzIGxpa2UgXCJqdW1wTmF2LmxpbmtzXCIgZm9yIG5lc3RlZCBwcm9wZXJ0eSBhY2Nlc3NcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxsb29wLW1hcmtlclxccysoPzpkYXRhLXByb3B8ZGF0YVByb3ApPVwiKFtcXHcuXSspXCJcXHMrKD86ZGF0YS10eXBlfGRhdGFUeXBlKT1cInByb3BlcnRpZXNcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvbG9vcC1tYXJrZXI+KS9naSxcbiAgICAoXywgcHJvcFBhdGgsIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBsZXQgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuXG4gICAgICAvLyBBdXRvLXdyYXAgYmFyZSB7e3RoaXMueHh4fX0gdGV4dC9yaWNodGV4dCBmaWVsZHMgd2l0aCBlZGl0YWJsZSBtYXJrZXJzXG4gICAgICBpbm5lckNvbnRlbnQgPSBhdXRvV3JhcEFycmF5RmllbGRzKGlubmVyQ29udGVudCwgcHJvcFBhdGgsIGNvbnRleHQucHJvcGVydGllcyk7XG5cbiAgICAgIGNvbnN0IGxvb3BDb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgbG9vcFZhcmlhYmxlOiAnaXRlbScsXG4gICAgICAgIGxvb3BJbmRleDogJ2luZGV4JyxcbiAgICAgICAgbG9vcEFycmF5OiBwcm9wUGF0aCxcbiAgICAgICAgaW5Mb29wOiB0cnVlXG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBhbmQgY29udmVydCBpbm5lciBjb250ZW50IChwYXNzIHByb3BQYXRoIGZvciBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIGFuZCB1bmxlc3MtbGFzdCBkYXRhLWFycmF5KVxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQsIHByb3BQYXRoKTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyLCBwcm9wUGF0aCk7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgbG9vcENvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgbG9vcENvbnRleHQsICdpdGVtJywgaW5uZXJCbG9ja3NGaWVsZCk7XG5cbiAgICAgIC8vIHByb3BQYXRoIGNhbiBiZSBcIml0ZW1zXCIgb3IgXCJqdW1wTmF2LmxpbmtzXCIgLSB1c2UgYXMtaXMgZm9yIHRoZSBtYXAgZXhwcmVzc2lvblxuICAgICAgcmV0dXJuIGB7JHtwcm9wUGF0aH0gJiYgJHtwcm9wUGF0aH0ubWFwKChpdGVtLCBpbmRleCkgPT4gKFxuICAgICAgICA8RnJhZ21lbnQga2V5PXtpbmRleH0+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgbmVzdGVkIGxvb3AgbWFya2VycyBXSVRIIGFsaWFzICh0aGlzLnh4eCBhcyB8YWxpYXN8KSB0byBKU1ggbWFwIGV4cHJlc3Npb25zIEZJUlNUXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxuZXN0ZWQtbG9vcC1tYXJrZXJcXHMrKD86ZGF0YS1wcm9wfGRhdGFQcm9wKT1cIihcXHcrKVwiXFxzKyg/OmRhdGEtYWxpYXN8ZGF0YUFsaWFzKT1cIihcXHcrKVwiXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9uZXN0ZWQtbG9vcC1tYXJrZXI+KS9naSxcbiAgICAoXywgcHJvcE5hbWUsIGFsaWFzTmFtZSwgZW5jb2RlZENvbnRlbnQpID0+IHtcbiAgICAgIGxldCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBcbiAgICAgIC8vIFJlcGxhY2UgYWxpYXMgcmVmZXJlbmNlcyB3aXRoIHRoaXMuIHJlZmVyZW5jZXMgYmVmb3JlIHByb2Nlc3NpbmdcbiAgICAgIC8vIGUuZy4sIHt7dGFnLnVybH19IC0+IHt7dGhpcy51cmx9fSwge3t0YWcubGFiZWx9fSAtPiB7e3RoaXMubGFiZWx9fVxuICAgICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAne3t0aGlzLiQxLiQyfX0nKTtcbiAgICAgIFxuICAgICAgY29uc3QgYWxpYXNSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzTmFtZX1cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc1JlZ2V4LCAne3t0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gVXNlIHRoZSBhbGlhcyBuYW1lIGZyb20gdGhlIEhhbmRsZWJhcnMgdGVtcGxhdGUgYXMgdGhlIG5lc3RlZCBsb29wIHZhcmlhYmxlXG4gICAgICBjb25zdCBuZXN0ZWRWYXIgPSBhbGlhc05hbWUgfHwgJ3N1Ykl0ZW0nO1xuICAgICAgY29uc3QgbmVzdGVkSW5kZXggPSBgJHtuZXN0ZWRWYXJ9SW5kZXhgO1xuICAgICAgY29uc3QgYXJyYXlSZWYgPSBgJHtwYXJlbnRMb29wVmFyfS4ke3Byb3BOYW1lfWA7XG4gICAgICBcbiAgICAgIGNvbnN0IG5lc3RlZENvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0ID0ge1xuICAgICAgICAuLi5jb250ZXh0LFxuICAgICAgICBsb29wVmFyaWFibGU6IG5lc3RlZFZhcixcbiAgICAgICAgbG9vcEluZGV4OiBuZXN0ZWRJbmRleCxcbiAgICAgICAgbG9vcEFycmF5OiBhcnJheVJlZixcbiAgICAgICAgaW5Mb29wOiB0cnVlXG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBhbmQgY29udmVydCBpbm5lciBjb250ZW50IHdpdGggdGhlIG5lc3RlZCBsb29wIHZhcmlhYmxlIChwYXNzIGFycmF5UmVmIGZvciBhdHRyaWJ1dGUgY29uZGl0aW9uYWxzIGFuZCB1bmxlc3MtbGFzdCBkYXRhLWFycmF5KVxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQsIGFycmF5UmVmKTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyLCBhcnJheVJlZik7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZCwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgbmVzdGVkQ29udGV4dCk7XG4gICAgICBcbiAgICAgIC8vIFJlcGxhY2UgcmVmZXJlbmNlcyB0byB1c2UgdGhlIG5lc3RlZCB2YXJpYWJsZVxuICAgICAgaW5uZXJKc3ggPSBpbm5lckpzeC5yZXBsYWNlKC9cXHtpdGVtXFwuL2csIGB7JHtuZXN0ZWRWYXJ9LmApO1xuICAgICAgaW5uZXJKc3ggPSBpbm5lckpzeC5yZXBsYWNlKC9cXHtpdGVtXFx9L2csIGB7JHtuZXN0ZWRWYXJ9fWApO1xuICAgICAgXG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBuZXN0ZWRDb250ZXh0LCBuZXN0ZWRWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICByZXR1cm4gYHske2FycmF5UmVmfSAmJiAke2FycmF5UmVmfS5tYXAoKCR7bmVzdGVkVmFyfSwgJHtuZXN0ZWRJbmRleH0pID0+IChcbiAgICAgICAgPEZyYWdtZW50IGtleT17JHtuZXN0ZWRJbmRleH19PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IG5lc3RlZCBsb29wIG1hcmtlcnMgV0lUSE9VVCBhbGlhcyAodGhpcy54eHgpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPG5lc3RlZC1sb29wLW1hcmtlclxccysoPzpkYXRhLXByb3B8ZGF0YVByb3ApPVwiKFxcdyspXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL25lc3RlZC1sb29wLW1hcmtlcj4pL2dpLFxuICAgIChfLCBwcm9wTmFtZSwgZW5jb2RlZENvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIC8vIFVzZSBhIGRpZmZlcmVudCB2YXJpYWJsZSBuYW1lIGZvciBuZXN0ZWQgbG9vcHMgdG8gYXZvaWQgc2hhZG93aW5nXG4gICAgICBjb25zdCBuZXN0ZWRWYXIgPSAnc3ViSXRlbSc7XG4gICAgICBjb25zdCBuZXN0ZWRJbmRleCA9ICdzdWJJbmRleCc7XG4gICAgICBjb25zdCBhcnJheVJlZiA9IGAke3BhcmVudExvb3BWYXJ9LiR7cHJvcE5hbWV9YDtcbiAgICAgIFxuICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgICAgIC4uLmNvbnRleHQsXG4gICAgICAgIGxvb3BWYXJpYWJsZTogbmVzdGVkVmFyLFxuICAgICAgICBsb29wSW5kZXg6IG5lc3RlZEluZGV4LFxuICAgICAgICBsb29wQXJyYXk6IGFycmF5UmVmLFxuICAgICAgICBpbkxvb3A6IHRydWVcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGFuZCBjb252ZXJ0IGlubmVyIGNvbnRlbnQgd2l0aCB0aGUgbmVzdGVkIGxvb3AgdmFyaWFibGUgKHBhc3MgYXJyYXlSZWYgZm9yIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgYW5kIHVubGVzcy1sYXN0IGRhdGEtYXJyYXkpXG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCwgYXJyYXlSZWYpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSW5uZXIsIGFycmF5UmVmKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBuZXN0ZWRDb250ZXh0KTtcblxuICAgICAgLy8gUmVwbGFjZSByZWZlcmVuY2VzIHRvIHVzZSB0aGUgbmVzdGVkIHZhcmlhYmxlXG4gICAgICBpbm5lckpzeCA9IGlubmVySnN4LnJlcGxhY2UoL1xce2l0ZW1cXC4vZywgYHske25lc3RlZFZhcn0uYCk7XG4gICAgICBpbm5lckpzeCA9IGlubmVySnN4LnJlcGxhY2UoL1xce2l0ZW1cXH0vZywgYHske25lc3RlZFZhcn19YCk7XG5cbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIG5lc3RlZENvbnRleHQsIG5lc3RlZFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG5cbiAgICAgIHJldHVybiBgeyR7YXJyYXlSZWZ9ICYmICR7YXJyYXlSZWZ9Lm1hcCgoJHtuZXN0ZWRWYXJ9LCAke25lc3RlZEluZGV4fSkgPT4gKFxuICAgICAgICA8RnJhZ21lbnQga2V5PXske25lc3RlZEluZGV4fX0+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApKX1gO1xuICAgIH1cbiAgKTtcblxuICAvLyBDb252ZXJ0IHVubGVzcy1sYXN0IG1hcmtlcnMgKGRhdGEtYXJyYXkgd2hlbiBwcmVzZW50IGNvbWVzIGZyb20gcHJlcHJvY2Vzc29yIHdoZW4gaW5zaWRlIHt7I2VhY2h9fSBzbyBleHBhbnNpb24gd29ya3Mgd2l0aG91dCBsb29wIGNvbnRleHQpXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXM7IGF0dHJpYnV0ZSBvcmRlcjogZGF0YS1jb250ZW50IHRoZW4gb3B0aW9uYWwgZGF0YS1hcnJheVxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPHVubGVzcy1sYXN0LW1hcmtlclxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzooPzpkYXRhLWFycmF5fGRhdGFBcnJheSk9XCIoW15cIl0rKVwiXFxzKik/KD86XFwvPnw+PFxcL3VubGVzcy1sYXN0LW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29udGVudCwgZGF0YUFycmF5KSA9PiB7XG4gICAgICBjb25zdCBpbm5lckNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBhcnJheU5hbWUgPSBkYXRhQXJyYXkgfHwgY29udGV4dC5sb29wQXJyYXkgfHwgJ2l0ZW1zJztcbiAgICAgIC8vIFVzZSBjb250ZXh0IHdpdGggbG9vcEFycmF5IHNvIGF0dHJpYnV0ZSB2YWx1ZXMgKGUuZy4gY2xhc3NOYW1lKSB0aGF0IHJlZmVyZW5jZSBAbGFzdCBnZXQgdGhlIGNvcnJlY3QgYXJyYXkgbmFtZVxuICAgICAgY29uc3QgZXhwYW5kQ29udGV4dCA9IHsgLi4uY29udGV4dCwgbG9vcEFycmF5OiBhcnJheU5hbWUgfTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaW5uZXIgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChjbGVhbmVkSW5uZXIsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGV4cGFuZENvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgZXhwYW5kQ29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIHJldHVybiBge2luZGV4IDwgJHthcnJheU5hbWV9Py5sZW5ndGggLSAxICYmIChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgdW5sZXNzLWZpcnN0IG1hcmtlcnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPHVubGVzcy1maXJzdC1tYXJrZXJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL3VubGVzcy1maXJzdC1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZENvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaW5uZXIgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChjbGVhbmVkSW5uZXIsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGNvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIC8vIEBmaXJzdCBpcyB0cnVlIHdoZW4gaW5kZXggPT09IDAsIHNvIHVubGVzcyBAZmlyc3QgbWVhbnMgaW5kZXggIT09IDBcbiAgICAgIHJldHVybiBge2luZGV4ICE9PSAwICYmIChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaWYgbWFya2VycyAod2l0aG91dCBlbHNlKVxuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIChkYXRhLWNvbmRpdGlvbikgYW5kIGNhbWVsQ2FzZSAoZGF0YUNvbmRpdGlvbikgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88aWYtbWFya2VyXFxzKyg/OmRhdGEtY29uZGl0aW9ufGRhdGFDb25kaXRpb24pPVwiKFteXCJdKylcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvaWYtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb25kaXRpb24sIGVuY29kZWRDb250ZW50KSA9PiB7XG4gICAgICBjb25zdCBjb25kaXRpb24gPSBCdWZmZXIuZnJvbShlbmNvZGVkQ29uZGl0aW9uLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGNvbmRpdGlvbiwgY29udGV4dCwgcGFyZW50TG9vcFZhcik7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGlubmVyIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50KTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZCA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElubmVyKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBjb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICByZXR1cm4gYHske2V4cHJ9ICYmIChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgaWYtZWxzZSBtYXJrZXJzICh3aXRoIGVsc2UpIHRvIHRlcm5hcnkgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGlmLWVsc2UtbWFya2VyXFxzKyg/OmRhdGEtY29uZGl0aW9ufGRhdGFDb25kaXRpb24pPVwiKFteXCJdKylcIlxccysoPzpkYXRhLWlmLWNvbnRlbnR8ZGF0YUlmQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKyg/OmRhdGEtZWxzZS1jb250ZW50fGRhdGFFbHNlQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9pZi1lbHNlLW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29uZGl0aW9uLCBlbmNvZGVkSWZDb250ZW50LCBlbmNvZGVkRWxzZUNvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb25kaXRpb24sICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgaWZDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZElmQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBlbHNlQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRFbHNlQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihjb25kaXRpb24sIGNvbnRleHQsIHBhcmVudExvb3BWYXIpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBpZiBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkSWYgPSBjbGVhblRlbXBsYXRlKGlmQ29udGVudCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWRJZiA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElmKTtcbiAgICAgIGNvbnN0IHJvb3RJZiA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWRJZiwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaWZKc3ggPSBub2RlVG9Kc3gocm9vdElmLCBjb250ZXh0KTtcbiAgICAgIGlmSnN4ID0gcG9zdHByb2Nlc3NKc3goaWZKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBlbHNlIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRFbHNlID0gY2xlYW5UZW1wbGF0ZShlbHNlQ29udGVudCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWRFbHNlID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkRWxzZSk7XG4gICAgICBjb25zdCByb290RWxzZSA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWRFbHNlLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBlbHNlSnN4ID0gbm9kZVRvSnN4KHJvb3RFbHNlLCBjb250ZXh0KTtcbiAgICAgIGVsc2VKc3ggPSBwb3N0cHJvY2Vzc0pzeChlbHNlSnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGB7JHtleHByfSA/IChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aWZKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSA6IChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7ZWxzZUpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBpZi1lbHNlaWYgbWFya2VycyAod2l0aCBlbHNlLWlmIGNoYWluKSB0byBuZXN0ZWQgdGVybmFyeSBleHByZXNzaW9uc1xuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88aWYtZWxzZWlmLW1hcmtlclxccysoPzpkYXRhLWNvbmRpdGlvbnxkYXRhQ29uZGl0aW9uKT1cIihbXlwiXSspXCJcXHMrKD86ZGF0YS1pZi1jb250ZW50fGRhdGFJZkNvbnRlbnQpPVwiKFteXCJdKylcIlxccysoPzpkYXRhLW5lc3RlZC1tYXJrZXJ8ZGF0YU5lc3RlZE1hcmtlcik9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9pZi1lbHNlaWYtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb25kaXRpb24sIGVuY29kZWRJZkNvbnRlbnQsIGVuY29kZWROZXN0ZWRNYXJrZXIpID0+IHtcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb25kaXRpb24sICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgaWZDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZElmQ29udGVudCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBuZXN0ZWRNYXJrZXIgPSBCdWZmZXIuZnJvbShlbmNvZGVkTmVzdGVkTWFya2VyLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24oY29uZGl0aW9uLCBjb250ZXh0LCBwYXJlbnRMb29wVmFyKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaWYgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElmID0gY2xlYW5UZW1wbGF0ZShpZkNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkSWYgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJZik7XG4gICAgICBjb25zdCByb290SWYgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkSWYsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlmSnN4ID0gbm9kZVRvSnN4KHJvb3RJZiwgY29udGV4dCk7XG4gICAgICBpZkpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlmSnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgLy8gVGhlIG5lc3RlZCBtYXJrZXIgaXMgYWxyZWFkeSBhIHByZXByb2Nlc3NlZCBpZi9pZi1lbHNlL2lmLWVsc2VpZiBtYXJrZXJcbiAgICAgIC8vIFdlIG5lZWQgdG8gcGFyc2UgaXQgdGhyb3VnaCBIVE1MIHBhcnNlciBhbmQgcHJvY2VzcyBpdFxuICAgICAgY29uc3Qgcm9vdE5lc3RlZCA9IHBhcnNlSFRNTChuZXN0ZWRNYXJrZXIsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IG5lc3RlZEpzeCA9IG5vZGVUb0pzeChyb290TmVzdGVkLCBjb250ZXh0KTtcbiAgICAgIG5lc3RlZEpzeCA9IHBvc3Rwcm9jZXNzSnN4KG5lc3RlZEpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIC8vIFRoZSBuZXN0ZWQgSlNYIHNob3VsZCBiZSBhIGNvbmRpdGlvbmFsIGV4cHJlc3Npb24gbGlrZSB7Y29uZGl0aW9uID8gLi4uIDogLi4ufVxuICAgICAgLy8gV2UgbmVlZCB0byBleHRyYWN0IHRoZSBpbm5lciBwYXJ0IGFuZCBjaGFpbiBpdFxuICAgICAgY29uc3QgdHJpbW1lZE5lc3RlZCA9IG5lc3RlZEpzeC50cmltKCk7XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGlmIGl0IHN0YXJ0cyB3aXRoIHsgYW5kIGVuZHMgd2l0aCB9XG4gICAgICBpZiAodHJpbW1lZE5lc3RlZC5zdGFydHNXaXRoKCd7JykgJiYgdHJpbW1lZE5lc3RlZC5lbmRzV2l0aCgnfScpKSB7XG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIGlubmVyIGV4cHJlc3Npb24gKHJlbW92ZSBvdXRlciBicmFjZXMpXG4gICAgICAgIGNvbnN0IGlubmVyRXhwciA9IHRyaW1tZWROZXN0ZWQuc2xpY2UoMSwgLTEpLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBgeyR7ZXhwcn0gPyAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lmSnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkgOiAke2lubmVyRXhwcn19YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZhbGxiYWNrIC0ganVzdCB1c2UgbnVsbCBmb3IgdGhlIGVsc2UgY2FzZVxuICAgICAgICByZXR1cm4gYHske2V4cHJ9ID8gKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpZkpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApIDogbnVsbH1gO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgZWRpdGFibGUgZmllbGQgbWFya2VycyB0byBhcHByb3ByaWF0ZSBjb21wb25lbnRzIGJhc2VkIG9uIGZpZWxkIHR5cGVcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGVkaXRhYmxlLWZpZWxkLW1hcmtlclxccysoPzpkYXRhLWZpZWxkfGRhdGFGaWVsZCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9lZGl0YWJsZS1maWVsZC1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZEZpZWxkSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZmllbGRJbmZvOiBGaWVsZEluZm8gPSBKU09OLnBhcnNlKEJ1ZmZlci5mcm9tKGVuY29kZWRGaWVsZEluZm8sICdiYXNlNjQnKS50b1N0cmluZygpKTtcbiAgICAgICAgY29uc3QgeyBwYXRoLCB0eXBlLCBjb250ZW50IH0gPSBmaWVsZEluZm87XG4gICAgICAgIFxuICAgICAgICAvLyBQYXJzZSB0aGUgcGF0aCB0byBkZXRlcm1pbmUgaG93IHRvIHNldCBhdHRyaWJ1dGVzXG4gICAgICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgaXNBcnJheUZpZWxkID0gcGF0aFBhcnRzLmxlbmd0aCA+IDE7XG4gICAgICAgIFxuICAgICAgICAvLyBDb252ZXJ0IHRoZSBjb250ZW50ICh3aGljaCBjb250YWlucyBIYW5kbGViYXJzIGV4cHJlc3Npb25zKSB0byBKU1ggdmFsdWUgcmVmZXJlbmNlXG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIHByb3BlcnR5IHJlZmVyZW5jZSBmcm9tIGNvbnRlbnQgbGlrZSB7e3Byb3BlcnRpZXMudGl0bGV9fSBvciB7e2NydW1iLmxhYmVsfX1cbiAgICAgICAgbGV0IHZhbHVlRXhwcjogc3RyaW5nO1xuICAgICAgICBsZXQgb25DaGFuZ2VFeHByOiBzdHJpbmc7XG4gICAgICAgIGxldCBpbWFnZUlkRXhwcjogc3RyaW5nID0gJyc7XG4gICAgICAgIGxldCBpbWFnZU9uU2VsZWN0RXhwcjogc3RyaW5nID0gJyc7XG4gICAgICAgIFxuICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIC8vIFRvcC1sZXZlbCBmaWVsZDogXCJ0aXRsZVwiIC0+IHRpdGxlLCBzZXRBdHRyaWJ1dGVzKHsgdGl0bGU6IHZhbHVlIH0pXG4gICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgIHZhbHVlRXhwciA9IGAke3Byb3BOYW1lfSB8fCAnJ2A7XG4gICAgICAgICAgb25DaGFuZ2VFeHByID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiB2YWx1ZSB9KWA7XG4gICAgICAgICAgLy8gRm9yIGltYWdlcywgd2UgbmVlZCB0byBoYW5kbGUgdGhlIGlkIGFuZCBmdWxsIGltYWdlIG9iamVjdFxuICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cHJvcE5hbWV9Py5pZGA7XG4gICAgICAgICAgaW1hZ2VPblNlbGVjdEV4cHIgPSBgKGltYWdlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IHsgaWQ6IGltYWdlLmlkLCBzcmM6IGltYWdlLnVybCwgYWx0OiBpbWFnZS5hbHQgfHwgJycgfSB9KWA7XG4gICAgICAgIH0gZWxzZSBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgIC8vIENvdWxkIGJlIG5lc3RlZCBvYmplY3QgXCJidXR0b24udGV4dFwiIG9yIGFycmF5IGZpZWxkIFwiYnJlYWRjcnVtYnMubGFiZWxcIlxuICAgICAgICAgIGNvbnN0IHBhcmVudE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IHBhdGhQYXJ0c1sxXTtcbiAgICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gY29udGV4dC5wcm9wZXJ0aWVzW3BhdGhQYXJ0c1swXV0gfHwgY29udGV4dC5wcm9wZXJ0aWVzW3BhcmVudE5hbWVdO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChwYXJlbnRQcm9wPy50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICAgICAgICAvLyBBcnJheSBmaWVsZDogdXNlIGxvb3AgY29udGV4dFxuICAgICAgICAgICAgdmFsdWVFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtmaWVsZE5hbWV9IHx8ICcnYDtcbiAgICAgICAgICAgIG9uQ2hhbmdlRXhwciA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwYXJlbnROYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2ZpZWxkTmFtZX06IHZhbHVlIH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgLy8gRm9yIGltYWdlcyBpbiBhcnJheXNcbiAgICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtmaWVsZE5hbWV9Py5pZGA7XG4gICAgICAgICAgICBpbWFnZU9uU2VsZWN0RXhwciA9IGAoaW1hZ2UpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwYXJlbnROYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2ZpZWxkTmFtZX06IHsgaWQ6IGltYWdlLmlkLCBzcmM6IGltYWdlLnVybCwgYWx0OiBpbWFnZS5hbHQgfHwgJycgfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTmVzdGVkIG9iamVjdCBmaWVsZFxuICAgICAgICAgICAgdmFsdWVFeHByID0gYCR7cGFyZW50TmFtZX0/LiR7ZmllbGROYW1lfSB8fCAnJ2A7XG4gICAgICAgICAgICBvbkNoYW5nZUV4cHIgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogeyAuLi4ke3BhcmVudE5hbWV9LCAke2ZpZWxkTmFtZX06IHZhbHVlIH0gfSlgO1xuICAgICAgICAgICAgLy8gRm9yIGltYWdlcyBpbiBuZXN0ZWQgb2JqZWN0c1xuICAgICAgICAgICAgaW1hZ2VJZEV4cHIgPSBgJHtwYXJlbnROYW1lfT8uJHtmaWVsZE5hbWV9Py5pZGA7XG4gICAgICAgICAgICBpbWFnZU9uU2VsZWN0RXhwciA9IGAoaW1hZ2UpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogeyBpZDogaW1hZ2UuaWQsIHNyYzogaW1hZ2UudXJsLCBhbHQ6IGltYWdlLmFsdCB8fCAnJyB9IH0gfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBEZWVwbHkgbmVzdGVkIC0gZGVmYXVsdCB0byBzaW1wbGVyIGhhbmRsaW5nXG4gICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgIHZhbHVlRXhwciA9IGAke3BhcmVudExvb3BWYXJ9LiR7cGF0aFBhcnRzW3BhdGhQYXJ0cy5sZW5ndGggLSAxXX0gfHwgJydgO1xuICAgICAgICAgIG9uQ2hhbmdlRXhwciA9IGAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLiR7cHJvcE5hbWV9XTtcbiAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke3BhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV19OiB2YWx1ZSB9O1xuICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICB9YDtcbiAgICAgICAgICAvLyBGb3IgaW1hZ2VzIGluIGRlZXBseSBuZXN0ZWQgcGF0aHNcbiAgICAgICAgICBjb25zdCBsYXN0RmllbGQgPSBwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgIGltYWdlSWRFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtsYXN0RmllbGR9Py5pZGA7XG4gICAgICAgICAgaW1hZ2VPblNlbGVjdEV4cHIgPSBgKGltYWdlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICBuZXdJdGVtc1tpbmRleF0gPSB7IC4uLm5ld0l0ZW1zW2luZGV4XSwgJHtsYXN0RmllbGR9OiB7IGlkOiBpbWFnZS5pZCwgc3JjOiBpbWFnZS51cmwsIGFsdDogaW1hZ2UuYWx0IHx8ICcnIH0gfTtcbiAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgfWA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEdlbmVyYXRlIGFwcHJvcHJpYXRlIGNvbXBvbmVudCBiYXNlZCBvbiBmaWVsZCB0eXBlXG4gICAgICAgIGlmICh0eXBlID09PSAnaW1hZ2UnKSB7XG4gICAgICAgICAgLy8gVXNlIDEwdXAgSW1hZ2UgY29tcG9uZW50IGZvciBpbmxpbmUtZWRpdGFibGUgaW1hZ2VzXG4gICAgICAgICAgcmV0dXJuIGA8SW1hZ2VcbiAgICAgICAgICAgIGlkPXske2ltYWdlSWRFeHByfX1cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImhhbmRvZmYtZWRpdGFibGUtZmllbGRcIlxuICAgICAgICAgICAgb25TZWxlY3Q9eyR7aW1hZ2VPblNlbGVjdEV4cHJ9fVxuICAgICAgICAgICAgc2l6ZT1cImxhcmdlXCJcbiAgICAgICAgICAvPmA7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JpY2h0ZXh0Jykge1xuICAgICAgICAgIC8vIEV4dHJhY3QgdGhlIHRvcC1sZXZlbCBmaWVsZCBuYW1lIGZyb20gdGhlIHBhdGggKGUuZy4gXCJjb250ZW50XCIgZnJvbSBcImNvbnRlbnRcIilcbiAgICAgICAgICBjb25zdCB0b3BMZXZlbEZpZWxkID0gcGF0aC5zcGxpdCgnLicpWzBdO1xuICAgICAgICAgIGlmIChpbm5lckJsb2Nrc0ZpZWxkICYmIHRvcExldmVsRmllbGQgPT09IGlubmVyQmxvY2tzRmllbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBgPElubmVyQmxvY2tzIGFsbG93ZWRCbG9ja3M9e0NPTlRFTlRfQkxPQ0tTfSAvPmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJpY2h0ZXh0IHdpdGhvdXQgSW5uZXJCbG9ja3M6IHVzZSBSaWNoVGV4dCB3aXRoIGZvcm1hdHRpbmcgYWxsb3dlZFxuICAgICAgICAgIHJldHVybiBgPFJpY2hUZXh0XG4gICAgICAgICAgICB0YWdOYW1lPVwiZGl2XCJcbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImhhbmRvZmYtZWRpdGFibGUtZmllbGRcIlxuICAgICAgICAgICAgdmFsdWU9eyR7dmFsdWVFeHByfX1cbiAgICAgICAgICAgIG9uQ2hhbmdlPXske29uQ2hhbmdlRXhwcn19XG4gICAgICAgICAgICBwbGFjZWhvbGRlcj17X18oJ0VudGVyIGNvbnRlbnQuLi4nLCAnaGFuZG9mZicpfVxuICAgICAgICAgIC8+YDtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnbGluaycgfHwgdHlwZSA9PT0gJ2J1dHRvbicpIHtcbiAgICAgICAgICBjb25zdCBzYWZlSWQgPSBwYXRoLnJlcGxhY2UoL1xcLi9nLCAnXycpO1xuICAgICAgICAgIGNvbnN0IG9ialJlZiA9IHZhbHVlRXhwci5yZXBsYWNlKC8gXFx8XFx8ICcnJC8sICcnKTtcbiAgICAgICAgICBjb25zdCBpc0xpbmsgPSB0eXBlID09PSAnbGluayc7XG4gICAgICAgICAgY29uc3QgcGFyZW50UGF0aEtleSA9IHBhdGhQYXJ0c1swXTtcbiAgICAgICAgICBjb25zdCBidXR0b25QYXJlbnRQcm9wID1cbiAgICAgICAgICAgICFpc0xpbmsgJiYgY29udGV4dC5wcm9wZXJ0aWVzXG4gICAgICAgICAgICAgID8gY29udGV4dC5wcm9wZXJ0aWVzW3BhcmVudFBhdGhLZXldID8/IGNvbnRleHQucHJvcGVydGllc1t0b0NhbWVsQ2FzZShwYXJlbnRQYXRoS2V5KV1cbiAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgY29uc3QgYnV0dG9uS2V5cyA9ICFpc0xpbmsgPyByZXNvbHZlQnV0dG9uRmllbGRLZXlzKGJ1dHRvblBhcmVudFByb3ApIDogbnVsbDtcblxuICAgICAgICAgIGNvbnN0IGxhYmVsVmFsdWVFeHByID0gaXNMaW5rXG4gICAgICAgICAgICA/IGAke29ialJlZn0/LmxhYmVsIHx8ICcnYFxuICAgICAgICAgICAgOiBgJHtvYmpSZWZ9Py4ke2J1dHRvbktleXMhLmxhYmVsS2V5fSB8fCAnJ2A7XG4gICAgICAgICAgY29uc3QgdXJsRXhwciA9IGlzTGlua1xuICAgICAgICAgICAgPyBgJHtvYmpSZWZ9Py51cmwgfHwgJydgXG4gICAgICAgICAgICA6IGAke29ialJlZn0/LiR7YnV0dG9uS2V5cyEudXJsS2V5fSB8fCAnJHtnZXRCdXR0b25VcmxGYWxsYmFjayhidXR0b25LZXlzIS51cmxLZXkpfSdgO1xuICAgICAgICAgIGNvbnN0IG5ld1RhYkV4cHIgPSBpc0xpbmsgPyBgJHtvYmpSZWZ9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlYCA6IGAke29ialJlZn0/LnRhcmdldCA9PT0gJ19ibGFuaydgO1xuICAgICAgICAgIGNvbnN0IGxhYmVsTWVyZ2UgPSBpc0xpbmtcbiAgICAgICAgICAgID8gYHsgLi4uJHtvYmpSZWZ9LCBsYWJlbDogdmFsdWUgfWBcbiAgICAgICAgICAgIDogYnV0dG9uTGFiZWxNZXJnZUpzKG9ialJlZiwgYnV0dG9uS2V5cyEpO1xuICAgICAgICAgIGNvbnN0IGxpbmtNZXJnZSA9IGlzTGlua1xuICAgICAgICAgICAgPyBgeyAuLi4ke29ialJlZn0sIHVybDogdmFsdWUudXJsIHx8ICcnLCBvcGVuc0luTmV3VGFiOiB2YWx1ZS5vcGVuc0luTmV3VGFiIHx8IGZhbHNlIH1gXG4gICAgICAgICAgICA6IGJ1dHRvbkxpbmtNZXJnZUpzKG9ialJlZiwgYnV0dG9uS2V5cyEpO1xuXG4gICAgICAgICAgLy8gQnVpbGQgb25DaGFuZ2UgaGFuZGxlcnMgZnJvbSBzY3JhdGNoIGJhc2VkIG9uIGZpZWxkIGNvbnRleHRcbiAgICAgICAgICBsZXQgbGFiZWxPbkNoYW5nZTogc3RyaW5nO1xuICAgICAgICAgIGxldCBsaW5rT25DaGFuZ2U6IHN0cmluZztcbiAgICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogJHtsYWJlbE1lcmdlfSB9KWA7XG4gICAgICAgICAgICBsaW5rT25DaGFuZ2UgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06ICR7bGlua01lcmdlfSB9KWA7XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnROYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IHBhdGhQYXJ0c1sxXTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBjb250ZXh0LnByb3BlcnRpZXNbcGF0aFBhcnRzWzBdXSB8fCBjb250ZXh0LnByb3BlcnRpZXNbcGFyZW50TmFtZV07XG4gICAgICAgICAgICBpZiAocGFyZW50UHJvcD8udHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICAgICAgICBsYWJlbE9uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogJHtsYWJlbE1lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogJHtsaW5rTWVyZ2V9IH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogJHtsYWJlbE1lcmdlfSB9IH0pYDtcbiAgICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IHsgLi4uJHtwYXJlbnROYW1lfSwgJHtmaWVsZE5hbWV9OiAke2xpbmtNZXJnZX0gfSB9KWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IGxhc3RGaWVsZCA9IHBhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBsYWJlbE9uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06ICR7bGFiZWxNZXJnZX0gfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06ICR7bGlua01lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgICAgfWA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIGA8SGFuZG9mZkxpbmtGaWVsZFxuICAgICAgICAgICAgZmllbGRJZD1cIiR7c2FmZUlkfVwiXG4gICAgICAgICAgICBsYWJlbD17JHtsYWJlbFZhbHVlRXhwcn19XG4gICAgICAgICAgICB1cmw9eyR7dXJsRXhwcn19XG4gICAgICAgICAgICBvcGVuc0luTmV3VGFiPXske25ld1RhYkV4cHJ9fVxuICAgICAgICAgICAgb25MYWJlbENoYW5nZT17JHtsYWJlbE9uQ2hhbmdlfX1cbiAgICAgICAgICAgIG9uTGlua0NoYW5nZT17JHtsaW5rT25DaGFuZ2V9fVxuICAgICAgICAgICAgaXNTZWxlY3RlZD17aXNTZWxlY3RlZH1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRm9yIHRleHQgZmllbGRzLCB1c2UgUmljaFRleHQgd2l0aCBubyBhbGxvd2VkIGZvcm1hdHMgZm9yIGlubGluZSBjb250ZW50ZWRpdGFibGUgZWRpdGluZ1xuICAgICAgICAgIHJldHVybiBgPFJpY2hUZXh0XG4gICAgICAgICAgICB0YWdOYW1lPVwic3BhblwiXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJoYW5kb2ZmLWVkaXRhYmxlLWZpZWxkXCJcbiAgICAgICAgICAgIHZhbHVlPXske3ZhbHVlRXhwcn19XG4gICAgICAgICAgICBvbkNoYW5nZT17JHtvbkNoYW5nZUV4cHJ9fVxuICAgICAgICAgICAgYWxsb3dlZEZvcm1hdHM9e1tdfVxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciB0ZXh0Li4uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gSWYgcGFyc2luZyBmYWlscywganVzdCByZXR1cm4gZW1wdHlcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEZpbmFsIGNsZWFudXAgLSBjb252ZXJ0IGFueSByZW1haW5pbmcgY2xhc3M9IHRvIGNsYXNzTmFtZT1cbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xcYmNsYXNzPVwiL2csICdjbGFzc05hbWU9XCInKTtcbiAgXG4gIC8vIFJlbW92ZSBlbXB0eSBjbGFzc05hbWUgYXR0cmlidXRlc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFxzK2NsYXNzTmFtZT1cIlwiL2csICcnKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIl19