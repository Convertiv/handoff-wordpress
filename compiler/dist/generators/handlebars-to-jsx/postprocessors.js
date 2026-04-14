"use strict";
/**
 * Postprocessing utilities for the Handlebars to JSX transpiler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postprocessJsx = exports.postprocessTemplateLiterals = void 0;
const node_html_parser_1 = require("node-html-parser");
const utils_1 = require("./utils");
const expression_parser_1 = require("./expression-parser");
const preprocessors_1 = require("./preprocessors");
const node_converter_1 = require("./node-converter");
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
        const innerContent = Buffer.from(encodedContent, 'base64').toString();
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
                const labelValueExpr = `${objRef}?.label || ''`;
                const isLink = type === 'link';
                const urlExpr = isLink ? `${objRef}?.url || ''` : `${objRef}?.href || '#'`;
                const newTabExpr = isLink ? `${objRef}?.opensInNewTab || false` : `${objRef}?.target === '_blank'`;
                const labelMerge = `{ ...${objRef}, label: value }`;
                const linkMerge = isLink
                    ? `{ ...${objRef}, url: value.url || '', opensInNewTab: value.opensInNewTab || false }`
                    : `{ ...${objRef}, href: value.url || '#', target: value.opensInNewTab ? '_blank' : '', rel: value.opensInNewTab ? 'noopener noreferrer' : '' }`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zdHByb2Nlc3NvcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy9oYW5kbGViYXJzLXRvLWpzeC9wb3N0cHJvY2Vzc29ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQUVILHVEQUFzRDtBQUV0RCxtQ0FBc0M7QUFDdEMsMkRBQTBEO0FBQzFELG1EQUFrRTtBQUNsRSxxREFBNkM7QUFFN0M7O0dBRUc7QUFDSSxNQUFNLDJCQUEyQixHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7SUFDakUsT0FBTyxHQUFHLENBQUMsT0FBTyxDQUFDLGdFQUFnRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFO1FBQ2xHLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzFELE9BQU8sR0FBRyxHQUFHLE9BQU8sR0FBRyxHQUFHLENBQUM7SUFDN0IsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUM7QUFMVyxRQUFBLDJCQUEyQiwrQkFLdEM7QUFFRjs7R0FFRztBQUNJLE1BQU0sY0FBYyxHQUFHLENBQUMsR0FBVyxFQUFFLE9BQTBCLEVBQUUsZ0JBQXdCLE1BQU0sRUFBRSxnQkFBZ0MsRUFBVSxFQUFFO0lBQ2xKLElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQztJQUVqQixxSEFBcUg7SUFDckgsOEVBQThFO0lBQzlFLCtFQUErRTtJQUMvRSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FDckIsaU1BQWlNLEVBQ2pNLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLEVBQUU7UUFDekMsSUFBSSxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFcEUsMEdBQTBHO1FBQzFH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LGFBQWE7NEJBQ2QsWUFBWTs7YUFFM0IsQ0FBQztZQUNOLENBQUM7aUJBQU0sQ0FBQztnQkFDTiwyRkFBMkY7Z0JBQzNGLE9BQU87OztxQkFHSSxTQUFTO3dCQUNOLFlBQVk7OzthQUd2QixDQUFDO1lBQ04sQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1gsc0NBQXNDO1lBQ3RDLE9BQU8sRUFBRSxDQUFDO1FBQ1osQ0FBQztJQUNILENBQUMsQ0FDRixDQUFDO0lBRUYsNkRBQTZEO0lBQzdELE1BQU0sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsQ0FBQztJQUVyRCxvQ0FBb0M7SUFDcEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFaEQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyxDQUFDO0FBNWdCVyxRQUFBLGNBQWMsa0JBNGdCekIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBvc3Rwcm9jZXNzaW5nIHV0aWxpdGllcyBmb3IgdGhlIEhhbmRsZWJhcnMgdG8gSlNYIHRyYW5zcGlsZXJcbiAqL1xuXG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUhUTUwgfSBmcm9tICdub2RlLWh0bWwtcGFyc2VyJztcbmltcG9ydCB7IFRyYW5zcGlsZXJDb250ZXh0LCBGaWVsZEluZm8gfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IHRvQ2FtZWxDYXNlIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyB0cmFuc3BpbGVFeHByZXNzaW9uIH0gZnJvbSAnLi9leHByZXNzaW9uLXBhcnNlcic7XG5pbXBvcnQgeyBjbGVhblRlbXBsYXRlLCBwcmVwcm9jZXNzQmxvY2tzIH0gZnJvbSAnLi9wcmVwcm9jZXNzb3JzJztcbmltcG9ydCB7IG5vZGVUb0pzeCB9IGZyb20gJy4vbm9kZS1jb252ZXJ0ZXInO1xuXG4vKipcbiAqIFBvc3QtcHJvY2VzcyB0byBjb252ZXJ0IHRlbXBsYXRlIGxpdGVyYWwgbWFya2VycyBiYWNrIHRvIGFjdHVhbCB0ZW1wbGF0ZSBsaXRlcmFsc1xuICovXG5leHBvcnQgY29uc3QgcG9zdHByb2Nlc3NUZW1wbGF0ZUxpdGVyYWxzID0gKGpzeDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGpzeC5yZXBsYWNlKC9fX1RFTVBMQVRFX0xJVEVSQUxfXyhbQS1aYS16MC05Ky89XSspX19FTkRfVEVNUExBVEVfTElURVJBTF9fL2csIChfLCBlbmNvZGVkKSA9PiB7XG4gICAgY29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGVuY29kZWQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgIHJldHVybiAnYCcgKyBkZWNvZGVkICsgJ2AnO1xuICB9KTtcbn07XG5cbi8qKlxuICogUG9zdC1wcm9jZXNzIEpTWCB0byBjb252ZXJ0IG1hcmtlcnMgYmFjayB0byBKU1ggbG9naWNcbiAqL1xuZXhwb3J0IGNvbnN0IHBvc3Rwcm9jZXNzSnN4ID0gKGpzeDogc3RyaW5nLCBjb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCwgcGFyZW50TG9vcFZhcjogc3RyaW5nID0gJ2l0ZW0nLCBpbm5lckJsb2Nrc0ZpZWxkPzogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyA9PiB7XG4gIGxldCByZXN1bHQgPSBqc3g7XG4gIFxuICAvLyBDb252ZXJ0IHRvcC1sZXZlbCBsb29wIG1hcmtlcnMgV0lUSCBhbGlhcyAocHJvcGVydGllcy54eHggb3IgcHJvcGVydGllcy54eHgueXl5IGFzIHxhbGlhc3wpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnNcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCAoZGF0YS1wcm9wKSBhbmQgY2FtZWxDYXNlIChkYXRhUHJvcCkgYXR0cmlidXRlIG5hbWVzXG4gIC8vIGRhdGEtcHJvcCBub3cgY29udGFpbnMgcGF0aHMgbGlrZSBcImp1bXBOYXYubGlua3NcIiBmb3IgbmVzdGVkIHByb3BlcnR5IGFjY2Vzc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPGxvb3AtbWFya2VyXFxzKyg/OmRhdGEtcHJvcHxkYXRhUHJvcCk9XCIoW1xcdy5dKylcIlxccysoPzpkYXRhLXR5cGV8ZGF0YVR5cGUpPVwicHJvcGVydGllc1wiXFxzKyg/OmRhdGEtYWxpYXN8ZGF0YUFsaWFzKT1cIihcXHcrKVwiXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9sb29wLW1hcmtlcj4pL2dpLFxuICAgIChfLCBwcm9wUGF0aCwgYWxpYXNOYW1lLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgbGV0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgLy8gUmVwbGFjZSB7e2FsaWFzLmZpZWxkfX0gYW5kIHt7IGFsaWFzLmZpZWxkLnN1YmZpZWxkIH19IHJlZmVyZW5jZXMgd2l0aCB7e3RoaXMuZmllbGR9fSBiZWZvcmUgcHJvY2Vzc2luZ1xuICAgICAgLy8gVGhpcyBub3JtYWxpemVzIHRoZSBhbGlhcyB0byB0aGUgc3RhbmRhcmQgJ3RoaXMuJyBmb3JtYXRcbiAgICAgIC8vIEhhbmRsZSBib3RoIHNpbmdsZSBhbmQgbmVzdGVkIHByb3BlcnR5IGFjY2VzcyAoZS5nLiwgY2FyZC5saW5rLnVybCAtPiB0aGlzLmxpbmsudXJsKVxuICAgICAgY29uc3QgYWxpYXNEZWVwUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7XFxcXHMqJHthbGlhc05hbWV9XFxcXC4oXFxcXHcrKVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzRGVlcFJlZ2V4LCAne3t0aGlzLiQxLiQyfX0nKTtcbiAgICAgIFxuICAgICAgY29uc3QgYWxpYXNSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzTmFtZX1cXFxcLihcXFxcdyspXFxcXHMqXFxcXH1cXFxcfWAsICdnJyk7XG4gICAgICBpbm5lckNvbnRlbnQgPSBpbm5lckNvbnRlbnQucmVwbGFjZShhbGlhc1JlZ2V4LCAne3t0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gSU1QT1JUQU5UOiBBbHNvIHJlcGxhY2UgY29uZGl0aW9uYWxzIHRoYXQgdXNlIHRoZSBhbGlhcywgZS5nLiB7eyNpZiBhbGlhcy5maWVsZH19IC0+IHt7I2lmIHRoaXMuZmllbGR9fVxuICAgICAgLy8gVGhpcyBoYW5kbGVzIHBhdHRlcm5zIGxpa2Uge3sjaWYgdGVzdGltb25pYWwuaW1hZ2V9fSBpbnNpZGUge3sjZWFjaCBwcm9wZXJ0aWVzLnRlc3RpbW9uaWFscyBhcyB8dGVzdGltb25pYWx8fX1cbiAgICAgIGNvbnN0IGFsaWFzSWZSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjaWZcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNJZlJlZ2V4LCAne3sjaWYgdGhpcy4kMX19Jyk7XG4gICAgICBcbiAgICAgIC8vIEFsc28gaGFuZGxlIHt7I3VubGVzcyBhbGlhcy5maWVsZH19XG4gICAgICBjb25zdCBhbGlhc1VubGVzc1JlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxceyN1bmxlc3NcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNVbmxlc3NSZWdleCwgJ3t7I3VubGVzcyB0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gQWxzbyBoYW5kbGUgbmVzdGVkIHt7I2VhY2ggYWxpYXMuZmllbGQgYXMgfG5lc3RlZEFsaWFzfH19IGxvb3BzXG4gICAgICAvLyBUaGlzIGNvbnZlcnRzIGUuZy4ge3sjZWFjaCBwb3N0LnRhZ3MgYXMgfHRhZ3x9fSAtPiB7eyNlYWNoIHRoaXMudGFncyBhcyB8dGFnfH19XG4gICAgICBjb25zdCBhbGlhc0VhY2hSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHsjZWFjaFxcXFxzKyR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3Kyg/OlxcXFwuXFxcXHcrKSopXFxcXHMrYXNcXFxccytcXFxcfChbXnxdKylcXFxcfFxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNFYWNoUmVnZXgsICd7eyNlYWNoIHRoaXMuJDEgYXMgfCQyfH19Jyk7XG4gICAgICBcbiAgICAgIC8vIEFsc28gaGFuZGxlIHt7I2VhY2ggYWxpYXMuZmllbGR9fSB3aXRob3V0IGFsaWFzIChsZXNzIGNvbW1vbiBidXQgcG9zc2libGUpXG4gICAgICBjb25zdCBhbGlhc0VhY2hOb0FsaWFzUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxce1xcXFx7I2VhY2hcXFxccyske2FsaWFzTmFtZX1cXFxcLihcXFxcdysoPzpcXFxcLlxcXFx3KykqKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNFYWNoTm9BbGlhc1JlZ2V4LCAne3sjZWFjaCB0aGlzLiQxfX0nKTtcbiAgICAgIFxuICAgICAgLy8gVXNlIHRoZSBhbGlhcyBuYW1lIGZyb20gdGhlIEhhbmRsZWJhcnMgdGVtcGxhdGUgYXMgdGhlIGxvb3AgdmFyaWFibGVcbiAgICAgIGNvbnN0IGxvb3BWYXJOYW1lID0gYWxpYXNOYW1lIHx8ICdpdGVtJztcbiAgICAgIGNvbnN0IGxvb3BDb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgbG9vcFZhcmlhYmxlOiBsb29wVmFyTmFtZSxcbiAgICAgICAgbG9vcEluZGV4OiAnaW5kZXgnLFxuICAgICAgICBsb29wQXJyYXk6IHByb3BQYXRoLFxuICAgICAgICBpbkxvb3A6IHRydWVcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGFuZCBjb252ZXJ0IGlubmVyIGNvbnRlbnQgKHBhc3MgcHJvcFBhdGggc28gYXR0cmlidXRlIGNvbmRpdGlvbmFscyBhbmQge3sjdW5sZXNzIEBsYXN0fX0gZ2V0IGNvcnJlY3QgYXJyYXkgbmFtZSlcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50LCBwcm9wUGF0aCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lciwgcHJvcFBhdGgpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGxvb3BDb250ZXh0KTtcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIGxvb3BDb250ZXh0LCBsb29wVmFyTmFtZSwgaW5uZXJCbG9ja3NGaWVsZCk7XG5cbiAgICAgIC8vIHByb3BQYXRoIGNhbiBiZSBcIml0ZW1zXCIgb3IgXCJqdW1wTmF2LmxpbmtzXCIgLSB1c2UgYXMtaXMgZm9yIHRoZSBtYXAgZXhwcmVzc2lvblxuICAgICAgcmV0dXJuIGB7JHtwcm9wUGF0aH0gJiYgJHtwcm9wUGF0aH0ubWFwKCgke2xvb3BWYXJOYW1lfSwgaW5kZXgpID0+IChcbiAgICAgICAgPEZyYWdtZW50IGtleT17aW5kZXh9PlxuICAgICAgICAgICR7aW5uZXJKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IHRvcC1sZXZlbCBsb29wIG1hcmtlcnMgV0lUSE9VVCBhbGlhcyAocHJvcGVydGllcy54eHggb3IgcHJvcGVydGllcy54eHgueXl5KSB0byBKU1ggbWFwIGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgLy8gZGF0YS1wcm9wIG5vdyBjb250YWlucyBwYXRocyBsaWtlIFwianVtcE5hdi5saW5rc1wiIGZvciBuZXN0ZWQgcHJvcGVydHkgYWNjZXNzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88bG9vcC1tYXJrZXJcXHMrKD86ZGF0YS1wcm9wfGRhdGFQcm9wKT1cIihbXFx3Ll0rKVwiXFxzKyg/OmRhdGEtdHlwZXxkYXRhVHlwZSk9XCJwcm9wZXJ0aWVzXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2xvb3AtbWFya2VyPikvZ2ksXG4gICAgKF8sIHByb3BQYXRoLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgbG9vcENvbnRleHQ6IFRyYW5zcGlsZXJDb250ZXh0ID0ge1xuICAgICAgICAuLi5jb250ZXh0LFxuICAgICAgICBsb29wVmFyaWFibGU6ICdpdGVtJyxcbiAgICAgICAgbG9vcEluZGV4OiAnaW5kZXgnLFxuICAgICAgICBsb29wQXJyYXk6IHByb3BQYXRoLFxuICAgICAgICBpbkxvb3A6IHRydWVcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGFuZCBjb252ZXJ0IGlubmVyIGNvbnRlbnQgKHBhc3MgcHJvcFBhdGggZm9yIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgYW5kIHVubGVzcy1sYXN0IGRhdGEtYXJyYXkpXG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCwgcHJvcFBhdGgpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSW5uZXIsIHByb3BQYXRoKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBsb29wQ29udGV4dCk7XG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBsb29wQ29udGV4dCwgJ2l0ZW0nLCBpbm5lckJsb2Nrc0ZpZWxkKTtcblxuICAgICAgLy8gcHJvcFBhdGggY2FuIGJlIFwiaXRlbXNcIiBvciBcImp1bXBOYXYubGlua3NcIiAtIHVzZSBhcy1pcyBmb3IgdGhlIG1hcCBleHByZXNzaW9uXG4gICAgICByZXR1cm4gYHske3Byb3BQYXRofSAmJiAke3Byb3BQYXRofS5tYXAoKGl0ZW0sIGluZGV4KSA9PiAoXG4gICAgICAgIDxGcmFnbWVudCBrZXk9e2luZGV4fT5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkpfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBuZXN0ZWQgbG9vcCBtYXJrZXJzIFdJVEggYWxpYXMgKHRoaXMueHh4IGFzIHxhbGlhc3wpIHRvIEpTWCBtYXAgZXhwcmVzc2lvbnMgRklSU1RcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShcbiAgICAvPG5lc3RlZC1sb29wLW1hcmtlclxccysoPzpkYXRhLXByb3B8ZGF0YVByb3ApPVwiKFxcdyspXCJcXHMrKD86ZGF0YS1hbGlhc3xkYXRhQWxpYXMpPVwiKFxcdyspXCJcXHMrKD86ZGF0YS1jb250ZW50fGRhdGFDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL25lc3RlZC1sb29wLW1hcmtlcj4pL2dpLFxuICAgIChfLCBwcm9wTmFtZSwgYWxpYXNOYW1lLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgbGV0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIFxuICAgICAgLy8gUmVwbGFjZSBhbGlhcyByZWZlcmVuY2VzIHdpdGggdGhpcy4gcmVmZXJlbmNlcyBiZWZvcmUgcHJvY2Vzc2luZ1xuICAgICAgLy8gZS5nLiwge3t0YWcudXJsfX0gLT4ge3t0aGlzLnVybH19LCB7e3RhZy5sYWJlbH19IC0+IHt7dGhpcy5sYWJlbH19XG4gICAgICBjb25zdCBhbGlhc0RlZXBSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFx7XFxcXHtcXFxccyoke2FsaWFzTmFtZX1cXFxcLihcXFxcdyspXFxcXC4oXFxcXHcrKVxcXFxzKlxcXFx9XFxcXH1gLCAnZycpO1xuICAgICAgaW5uZXJDb250ZW50ID0gaW5uZXJDb250ZW50LnJlcGxhY2UoYWxpYXNEZWVwUmVnZXgsICd7e3RoaXMuJDEuJDJ9fScpO1xuICAgICAgXG4gICAgICBjb25zdCBhbGlhc1JlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXHtcXFxce1xcXFxzKiR7YWxpYXNOYW1lfVxcXFwuKFxcXFx3KylcXFxccypcXFxcfVxcXFx9YCwgJ2cnKTtcbiAgICAgIGlubmVyQ29udGVudCA9IGlubmVyQ29udGVudC5yZXBsYWNlKGFsaWFzUmVnZXgsICd7e3RoaXMuJDF9fScpO1xuICAgICAgXG4gICAgICAvLyBVc2UgdGhlIGFsaWFzIG5hbWUgZnJvbSB0aGUgSGFuZGxlYmFycyB0ZW1wbGF0ZSBhcyB0aGUgbmVzdGVkIGxvb3AgdmFyaWFibGVcbiAgICAgIGNvbnN0IG5lc3RlZFZhciA9IGFsaWFzTmFtZSB8fCAnc3ViSXRlbSc7XG4gICAgICBjb25zdCBuZXN0ZWRJbmRleCA9IGAke25lc3RlZFZhcn1JbmRleGA7XG4gICAgICBjb25zdCBhcnJheVJlZiA9IGAke3BhcmVudExvb3BWYXJ9LiR7cHJvcE5hbWV9YDtcbiAgICAgIFxuICAgICAgY29uc3QgbmVzdGVkQ29udGV4dDogVHJhbnNwaWxlckNvbnRleHQgPSB7XG4gICAgICAgIC4uLmNvbnRleHQsXG4gICAgICAgIGxvb3BWYXJpYWJsZTogbmVzdGVkVmFyLFxuICAgICAgICBsb29wSW5kZXg6IG5lc3RlZEluZGV4LFxuICAgICAgICBsb29wQXJyYXk6IGFycmF5UmVmLFxuICAgICAgICBpbkxvb3A6IHRydWVcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGFuZCBjb252ZXJ0IGlubmVyIGNvbnRlbnQgd2l0aCB0aGUgbmVzdGVkIGxvb3AgdmFyaWFibGUgKHBhc3MgYXJyYXlSZWYgZm9yIGF0dHJpYnV0ZSBjb25kaXRpb25hbHMgYW5kIHVubGVzcy1sYXN0IGRhdGEtYXJyYXkpXG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCwgYXJyYXlSZWYpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSW5uZXIsIGFycmF5UmVmKTtcbiAgICAgIGNvbnN0IHJvb3QgPSBwYXJzZUhUTUwocHJlcHJvY2Vzc2VkLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpbm5lckpzeCA9IG5vZGVUb0pzeChyb290LCBuZXN0ZWRDb250ZXh0KTtcbiAgICAgIFxuICAgICAgLy8gUmVwbGFjZSByZWZlcmVuY2VzIHRvIHVzZSB0aGUgbmVzdGVkIHZhcmlhYmxlXG4gICAgICBpbm5lckpzeCA9IGlubmVySnN4LnJlcGxhY2UoL1xce2l0ZW1cXC4vZywgYHske25lc3RlZFZhcn0uYCk7XG4gICAgICBpbm5lckpzeCA9IGlubmVySnN4LnJlcGxhY2UoL1xce2l0ZW1cXH0vZywgYHske25lc3RlZFZhcn19YCk7XG4gICAgICBcbiAgICAgIGlubmVySnN4ID0gcG9zdHByb2Nlc3NKc3goaW5uZXJKc3gsIG5lc3RlZENvbnRleHQsIG5lc3RlZFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIHJldHVybiBgeyR7YXJyYXlSZWZ9ICYmICR7YXJyYXlSZWZ9Lm1hcCgoJHtuZXN0ZWRWYXJ9LCAke25lc3RlZEluZGV4fSkgPT4gKFxuICAgICAgICA8RnJhZ21lbnQga2V5PXske25lc3RlZEluZGV4fX0+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApKX1gO1xuICAgIH1cbiAgKTtcbiAgXG4gIC8vIENvbnZlcnQgbmVzdGVkIGxvb3AgbWFya2VycyBXSVRIT1VUIGFsaWFzICh0aGlzLnh4eCkgdG8gSlNYIG1hcCBleHByZXNzaW9uc1xuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88bmVzdGVkLWxvb3AtbWFya2VyXFxzKyg/OmRhdGEtcHJvcHxkYXRhUHJvcCk9XCIoXFx3KylcIlxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvbmVzdGVkLWxvb3AtbWFya2VyPikvZ2ksXG4gICAgKF8sIHByb3BOYW1lLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgLy8gVXNlIGEgZGlmZmVyZW50IHZhcmlhYmxlIG5hbWUgZm9yIG5lc3RlZCBsb29wcyB0byBhdm9pZCBzaGFkb3dpbmdcbiAgICAgIGNvbnN0IG5lc3RlZFZhciA9ICdzdWJJdGVtJztcbiAgICAgIGNvbnN0IG5lc3RlZEluZGV4ID0gJ3N1YkluZGV4JztcbiAgICAgIGNvbnN0IGFycmF5UmVmID0gYCR7cGFyZW50TG9vcFZhcn0uJHtwcm9wTmFtZX1gO1xuICAgICAgXG4gICAgICBjb25zdCBuZXN0ZWRDb250ZXh0OiBUcmFuc3BpbGVyQ29udGV4dCA9IHtcbiAgICAgICAgLi4uY29udGV4dCxcbiAgICAgICAgbG9vcFZhcmlhYmxlOiBuZXN0ZWRWYXIsXG4gICAgICAgIGxvb3BJbmRleDogbmVzdGVkSW5kZXgsXG4gICAgICAgIGxvb3BBcnJheTogYXJyYXlSZWYsXG4gICAgICAgIGluTG9vcDogdHJ1ZVxuICAgICAgfTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgYW5kIGNvbnZlcnQgaW5uZXIgY29udGVudCB3aXRoIHRoZSBuZXN0ZWQgbG9vcCB2YXJpYWJsZSAocGFzcyBhcnJheVJlZiBmb3IgYXR0cmlidXRlIGNvbmRpdGlvbmFscyBhbmQgdW5sZXNzLWxhc3QgZGF0YS1hcnJheSlcbiAgICAgIGNvbnN0IGNsZWFuZWRJbm5lciA9IGNsZWFuVGVtcGxhdGUoaW5uZXJDb250ZW50LCBhcnJheVJlZik7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWQgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRJbm5lciwgYXJyYXlSZWYpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIG5lc3RlZENvbnRleHQpO1xuXG4gICAgICAvLyBSZXBsYWNlIHJlZmVyZW5jZXMgdG8gdXNlIHRoZSBuZXN0ZWQgdmFyaWFibGVcbiAgICAgIGlubmVySnN4ID0gaW5uZXJKc3gucmVwbGFjZSgvXFx7aXRlbVxcLi9nLCBgeyR7bmVzdGVkVmFyfS5gKTtcbiAgICAgIGlubmVySnN4ID0gaW5uZXJKc3gucmVwbGFjZSgvXFx7aXRlbVxcfS9nLCBgeyR7bmVzdGVkVmFyfX1gKTtcblxuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgbmVzdGVkQ29udGV4dCwgbmVzdGVkVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcblxuICAgICAgcmV0dXJuIGB7JHthcnJheVJlZn0gJiYgJHthcnJheVJlZn0ubWFwKCgke25lc3RlZFZhcn0sICR7bmVzdGVkSW5kZXh9KSA9PiAoXG4gICAgICAgIDxGcmFnbWVudCBrZXk9eyR7bmVzdGVkSW5kZXh9fT5cbiAgICAgICAgICAke2lubmVySnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkpfWA7XG4gICAgfVxuICApO1xuXG4gIC8vIENvbnZlcnQgdW5sZXNzLWxhc3QgbWFya2VycyAoZGF0YS1hcnJheSB3aGVuIHByZXNlbnQgY29tZXMgZnJvbSBwcmVwcm9jZXNzb3Igd2hlbiBpbnNpZGUge3sjZWFjaH19IHNvIGV4cGFuc2lvbiB3b3JrcyB3aXRob3V0IGxvb3AgY29udGV4dClcbiAgLy8gSGFuZGxlIGJvdGggaHlwaGVuYXRlZCBhbmQgY2FtZWxDYXNlIGF0dHJpYnV0ZSBuYW1lczsgYXR0cmlidXRlIG9yZGVyOiBkYXRhLWNvbnRlbnQgdGhlbiBvcHRpb25hbCBkYXRhLWFycmF5XG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88dW5sZXNzLWxhc3QtbWFya2VyXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/Oig/OmRhdGEtYXJyYXl8ZGF0YUFycmF5KT1cIihbXlwiXSspXCJcXHMqKT8oPzpcXC8+fD48XFwvdW5sZXNzLWxhc3QtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb250ZW50LCBkYXRhQXJyYXkpID0+IHtcbiAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGFycmF5TmFtZSA9IGRhdGFBcnJheSB8fCBjb250ZXh0Lmxvb3BBcnJheSB8fCAnaXRlbXMnO1xuICAgICAgLy8gVXNlIGNvbnRleHQgd2l0aCBsb29wQXJyYXkgc28gYXR0cmlidXRlIHZhbHVlcyAoZS5nLiBjbGFzc05hbWUpIHRoYXQgcmVmZXJlbmNlIEBsYXN0IGdldCB0aGUgY29ycmVjdCBhcnJheSBuYW1lXG4gICAgICBjb25zdCBleHBhbmRDb250ZXh0ID0geyAuLi5jb250ZXh0LCBsb29wQXJyYXk6IGFycmF5TmFtZSB9O1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBpbm5lciBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCk7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKGNsZWFuZWRJbm5lciwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgZXhwYW5kQ29udGV4dCk7XG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBleHBhbmRDb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGB7aW5kZXggPCAke2FycmF5TmFtZX0/Lmxlbmd0aCAtIDEgJiYgKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCB1bmxlc3MtZmlyc3QgbWFya2Vyc1xuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88dW5sZXNzLWZpcnN0LW1hcmtlclxccysoPzpkYXRhLWNvbnRlbnR8ZGF0YUNvbnRlbnQpPVwiKFteXCJdKylcIlxccyooPzpcXC8+fD48XFwvdW5sZXNzLWZpcnN0LW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBpbm5lciBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkSW5uZXIgPSBjbGVhblRlbXBsYXRlKGlubmVyQ29udGVudCk7XG4gICAgICBjb25zdCByb290ID0gcGFyc2VIVE1MKGNsZWFuZWRJbm5lciwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaW5uZXJKc3ggPSBub2RlVG9Kc3gocm9vdCwgY29udGV4dCk7XG4gICAgICBpbm5lckpzeCA9IHBvc3Rwcm9jZXNzSnN4KGlubmVySnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgLy8gQGZpcnN0IGlzIHRydWUgd2hlbiBpbmRleCA9PT0gMCwgc28gdW5sZXNzIEBmaXJzdCBtZWFucyBpbmRleCAhPT0gMFxuICAgICAgcmV0dXJuIGB7aW5kZXggIT09IDAgJiYgKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBpZiBtYXJrZXJzICh3aXRob3V0IGVsc2UpXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgKGRhdGEtY29uZGl0aW9uKSBhbmQgY2FtZWxDYXNlIChkYXRhQ29uZGl0aW9uKSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxpZi1tYXJrZXJcXHMrKD86ZGF0YS1jb25kaXRpb258ZGF0YUNvbmRpdGlvbik9XCIoW15cIl0rKVwiXFxzKyg/OmRhdGEtY29udGVudHxkYXRhQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKig/OlxcLz58PjxcXC9pZi1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZENvbmRpdGlvbiwgZW5jb2RlZENvbnRlbnQpID0+IHtcbiAgICAgIGNvbnN0IGNvbmRpdGlvbiA9IEJ1ZmZlci5mcm9tKGVuY29kZWRDb25kaXRpb24sICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgaW5uZXJDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbnRlbnQsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgZXhwciA9IHRyYW5zcGlsZUV4cHJlc3Npb24oY29uZGl0aW9uLCBjb250ZXh0LCBwYXJlbnRMb29wVmFyKTtcbiAgICAgIFxuICAgICAgLy8gUGFyc2UgaW5uZXIgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZElubmVyID0gY2xlYW5UZW1wbGF0ZShpbm5lckNvbnRlbnQpO1xuICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSW5uZXIpO1xuICAgICAgY29uc3Qgcm9vdCA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWQsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGlubmVySnN4ID0gbm9kZVRvSnN4KHJvb3QsIGNvbnRleHQpO1xuICAgICAgaW5uZXJKc3ggPSBwb3N0cHJvY2Vzc0pzeChpbm5lckpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIHJldHVybiBgeyR7ZXhwcn0gJiYgKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpbm5lckpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApfWA7XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBpZi1lbHNlIG1hcmtlcnMgKHdpdGggZWxzZSkgdG8gdGVybmFyeSBleHByZXNzaW9uc1xuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88aWYtZWxzZS1tYXJrZXJcXHMrKD86ZGF0YS1jb25kaXRpb258ZGF0YUNvbmRpdGlvbik9XCIoW15cIl0rKVwiXFxzKyg/OmRhdGEtaWYtY29udGVudHxkYXRhSWZDb250ZW50KT1cIihbXlwiXSspXCJcXHMrKD86ZGF0YS1lbHNlLWNvbnRlbnR8ZGF0YUVsc2VDb250ZW50KT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2lmLWVsc2UtbWFya2VyPikvZ2ksXG4gICAgKF8sIGVuY29kZWRDb25kaXRpb24sIGVuY29kZWRJZkNvbnRlbnQsIGVuY29kZWRFbHNlQ29udGVudCkgPT4ge1xuICAgICAgY29uc3QgY29uZGl0aW9uID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbmRpdGlvbiwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBpZkNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkSWZDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGVsc2VDb250ZW50ID0gQnVmZmVyLmZyb20oZW5jb2RlZEVsc2VDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IGV4cHIgPSB0cmFuc3BpbGVFeHByZXNzaW9uKGNvbmRpdGlvbiwgY29udGV4dCwgcGFyZW50TG9vcFZhcik7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGlmIGNvbnRlbnRcbiAgICAgIGNvbnN0IGNsZWFuZWRJZiA9IGNsZWFuVGVtcGxhdGUoaWZDb250ZW50KTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZElmID0gcHJlcHJvY2Vzc0Jsb2NrcyhjbGVhbmVkSWYpO1xuICAgICAgY29uc3Qgcm9vdElmID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZElmLCB7IGxvd2VyQ2FzZVRhZ05hbWU6IGZhbHNlLCBjb21tZW50OiBmYWxzZSB9KTtcbiAgICAgIGxldCBpZkpzeCA9IG5vZGVUb0pzeChyb290SWYsIGNvbnRleHQpO1xuICAgICAgaWZKc3ggPSBwb3N0cHJvY2Vzc0pzeChpZkpzeCwgY29udGV4dCwgcGFyZW50TG9vcFZhciwgaW5uZXJCbG9ja3NGaWVsZCk7XG4gICAgICBcbiAgICAgIC8vIFBhcnNlIGVsc2UgY29udGVudFxuICAgICAgY29uc3QgY2xlYW5lZEVsc2UgPSBjbGVhblRlbXBsYXRlKGVsc2VDb250ZW50KTtcbiAgICAgIGNvbnN0IHByZXByb2Nlc3NlZEVsc2UgPSBwcmVwcm9jZXNzQmxvY2tzKGNsZWFuZWRFbHNlKTtcbiAgICAgIGNvbnN0IHJvb3RFbHNlID0gcGFyc2VIVE1MKHByZXByb2Nlc3NlZEVsc2UsIHsgbG93ZXJDYXNlVGFnTmFtZTogZmFsc2UsIGNvbW1lbnQ6IGZhbHNlIH0pO1xuICAgICAgbGV0IGVsc2VKc3ggPSBub2RlVG9Kc3gocm9vdEVsc2UsIGNvbnRleHQpO1xuICAgICAgZWxzZUpzeCA9IHBvc3Rwcm9jZXNzSnN4KGVsc2VKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICByZXR1cm4gYHske2V4cHJ9ID8gKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtpZkpzeC50cmltKCl9XG4gICAgICAgIDwvRnJhZ21lbnQ+XG4gICAgICApIDogKFxuICAgICAgICA8RnJhZ21lbnQ+XG4gICAgICAgICAgJHtlbHNlSnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICl9YDtcbiAgICB9XG4gICk7XG4gIFxuICAvLyBDb252ZXJ0IGlmLWVsc2VpZiBtYXJrZXJzICh3aXRoIGVsc2UtaWYgY2hhaW4pIHRvIG5lc3RlZCB0ZXJuYXJ5IGV4cHJlc3Npb25zXG4gIC8vIEhhbmRsZSBib3RoIGh5cGhlbmF0ZWQgYW5kIGNhbWVsQ2FzZSBhdHRyaWJ1dGUgbmFtZXNcbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG4gICAgLzxpZi1lbHNlaWYtbWFya2VyXFxzKyg/OmRhdGEtY29uZGl0aW9ufGRhdGFDb25kaXRpb24pPVwiKFteXCJdKylcIlxccysoPzpkYXRhLWlmLWNvbnRlbnR8ZGF0YUlmQ29udGVudCk9XCIoW15cIl0rKVwiXFxzKyg/OmRhdGEtbmVzdGVkLW1hcmtlcnxkYXRhTmVzdGVkTWFya2VyKT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2lmLWVsc2VpZi1tYXJrZXI+KS9naSxcbiAgICAoXywgZW5jb2RlZENvbmRpdGlvbiwgZW5jb2RlZElmQ29udGVudCwgZW5jb2RlZE5lc3RlZE1hcmtlcikgPT4ge1xuICAgICAgY29uc3QgY29uZGl0aW9uID0gQnVmZmVyLmZyb20oZW5jb2RlZENvbmRpdGlvbiwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG4gICAgICBjb25zdCBpZkNvbnRlbnQgPSBCdWZmZXIuZnJvbShlbmNvZGVkSWZDb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbiAgICAgIGNvbnN0IG5lc3RlZE1hcmtlciA9IEJ1ZmZlci5mcm9tKGVuY29kZWROZXN0ZWRNYXJrZXIsICdiYXNlNjQnKS50b1N0cmluZygpO1xuICAgICAgXG4gICAgICBjb25zdCBleHByID0gdHJhbnNwaWxlRXhwcmVzc2lvbihjb25kaXRpb24sIGNvbnRleHQsIHBhcmVudExvb3BWYXIpO1xuICAgICAgXG4gICAgICAvLyBQYXJzZSBpZiBjb250ZW50XG4gICAgICBjb25zdCBjbGVhbmVkSWYgPSBjbGVhblRlbXBsYXRlKGlmQ29udGVudCk7XG4gICAgICBjb25zdCBwcmVwcm9jZXNzZWRJZiA9IHByZXByb2Nlc3NCbG9ja3MoY2xlYW5lZElmKTtcbiAgICAgIGNvbnN0IHJvb3RJZiA9IHBhcnNlSFRNTChwcmVwcm9jZXNzZWRJZiwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgaWZKc3ggPSBub2RlVG9Kc3gocm9vdElmLCBjb250ZXh0KTtcbiAgICAgIGlmSnN4ID0gcG9zdHByb2Nlc3NKc3goaWZKc3gsIGNvbnRleHQsIHBhcmVudExvb3BWYXIsIGlubmVyQmxvY2tzRmllbGQpO1xuICAgICAgXG4gICAgICAvLyBUaGUgbmVzdGVkIG1hcmtlciBpcyBhbHJlYWR5IGEgcHJlcHJvY2Vzc2VkIGlmL2lmLWVsc2UvaWYtZWxzZWlmIG1hcmtlclxuICAgICAgLy8gV2UgbmVlZCB0byBwYXJzZSBpdCB0aHJvdWdoIEhUTUwgcGFyc2VyIGFuZCBwcm9jZXNzIGl0XG4gICAgICBjb25zdCByb290TmVzdGVkID0gcGFyc2VIVE1MKG5lc3RlZE1hcmtlciwgeyBsb3dlckNhc2VUYWdOYW1lOiBmYWxzZSwgY29tbWVudDogZmFsc2UgfSk7XG4gICAgICBsZXQgbmVzdGVkSnN4ID0gbm9kZVRvSnN4KHJvb3ROZXN0ZWQsIGNvbnRleHQpO1xuICAgICAgbmVzdGVkSnN4ID0gcG9zdHByb2Nlc3NKc3gobmVzdGVkSnN4LCBjb250ZXh0LCBwYXJlbnRMb29wVmFyLCBpbm5lckJsb2Nrc0ZpZWxkKTtcbiAgICAgIFxuICAgICAgLy8gVGhlIG5lc3RlZCBKU1ggc2hvdWxkIGJlIGEgY29uZGl0aW9uYWwgZXhwcmVzc2lvbiBsaWtlIHtjb25kaXRpb24gPyAuLi4gOiAuLi59XG4gICAgICAvLyBXZSBuZWVkIHRvIGV4dHJhY3QgdGhlIGlubmVyIHBhcnQgYW5kIGNoYWluIGl0XG4gICAgICBjb25zdCB0cmltbWVkTmVzdGVkID0gbmVzdGVkSnN4LnRyaW0oKTtcbiAgICAgIFxuICAgICAgLy8gQ2hlY2sgaWYgaXQgc3RhcnRzIHdpdGggeyBhbmQgZW5kcyB3aXRoIH1cbiAgICAgIGlmICh0cmltbWVkTmVzdGVkLnN0YXJ0c1dpdGgoJ3snKSAmJiB0cmltbWVkTmVzdGVkLmVuZHNXaXRoKCd9JykpIHtcbiAgICAgICAgLy8gRXh0cmFjdCB0aGUgaW5uZXIgZXhwcmVzc2lvbiAocmVtb3ZlIG91dGVyIGJyYWNlcylcbiAgICAgICAgY29uc3QgaW5uZXJFeHByID0gdHJpbW1lZE5lc3RlZC5zbGljZSgxLCAtMSkudHJpbSgpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGB7JHtleHByfSA/IChcbiAgICAgICAgPEZyYWdtZW50PlxuICAgICAgICAgICR7aWZKc3gudHJpbSgpfVxuICAgICAgICA8L0ZyYWdtZW50PlxuICAgICAgKSA6ICR7aW5uZXJFeHByfX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRmFsbGJhY2sgLSBqdXN0IHVzZSBudWxsIGZvciB0aGUgZWxzZSBjYXNlXG4gICAgICAgIHJldHVybiBgeyR7ZXhwcn0gPyAoXG4gICAgICAgIDxGcmFnbWVudD5cbiAgICAgICAgICAke2lmSnN4LnRyaW0oKX1cbiAgICAgICAgPC9GcmFnbWVudD5cbiAgICAgICkgOiBudWxsfWA7XG4gICAgICB9XG4gICAgfVxuICApO1xuICBcbiAgLy8gQ29udmVydCBlZGl0YWJsZSBmaWVsZCBtYXJrZXJzIHRvIGFwcHJvcHJpYXRlIGNvbXBvbmVudHMgYmFzZWQgb24gZmllbGQgdHlwZVxuICAvLyBIYW5kbGUgYm90aCBoeXBoZW5hdGVkIGFuZCBjYW1lbENhc2UgYXR0cmlidXRlIG5hbWVzXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKFxuICAgIC88ZWRpdGFibGUtZmllbGQtbWFya2VyXFxzKyg/OmRhdGEtZmllbGR8ZGF0YUZpZWxkKT1cIihbXlwiXSspXCJcXHMqKD86XFwvPnw+PFxcL2VkaXRhYmxlLWZpZWxkLW1hcmtlcj4pL2dpLFxuICAgIChfLCBlbmNvZGVkRmllbGRJbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWVsZEluZm86IEZpZWxkSW5mbyA9IEpTT04ucGFyc2UoQnVmZmVyLmZyb20oZW5jb2RlZEZpZWxkSW5mbywgJ2Jhc2U2NCcpLnRvU3RyaW5nKCkpO1xuICAgICAgICBjb25zdCB7IHBhdGgsIHR5cGUsIGNvbnRlbnQgfSA9IGZpZWxkSW5mbztcbiAgICAgICAgXG4gICAgICAgIC8vIFBhcnNlIHRoZSBwYXRoIHRvIGRldGVybWluZSBob3cgdG8gc2V0IGF0dHJpYnV0ZXNcbiAgICAgICAgY29uc3QgcGF0aFBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBpc0FycmF5RmllbGQgPSBwYXRoUGFydHMubGVuZ3RoID4gMTtcbiAgICAgICAgXG4gICAgICAgIC8vIENvbnZlcnQgdGhlIGNvbnRlbnQgKHdoaWNoIGNvbnRhaW5zIEhhbmRsZWJhcnMgZXhwcmVzc2lvbnMpIHRvIEpTWCB2YWx1ZSByZWZlcmVuY2VcbiAgICAgICAgLy8gRXh0cmFjdCB0aGUgcHJvcGVydHkgcmVmZXJlbmNlIGZyb20gY29udGVudCBsaWtlIHt7cHJvcGVydGllcy50aXRsZX19IG9yIHt7Y3J1bWIubGFiZWx9fVxuICAgICAgICBsZXQgdmFsdWVFeHByOiBzdHJpbmc7XG4gICAgICAgIGxldCBvbkNoYW5nZUV4cHI6IHN0cmluZztcbiAgICAgICAgbGV0IGltYWdlSWRFeHByOiBzdHJpbmcgPSAnJztcbiAgICAgICAgbGV0IGltYWdlT25TZWxlY3RFeHByOiBzdHJpbmcgPSAnJztcbiAgICAgICAgXG4gICAgICAgIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgLy8gVG9wLWxldmVsIGZpZWxkOiBcInRpdGxlXCIgLT4gdGl0bGUsIHNldEF0dHJpYnV0ZXMoeyB0aXRsZTogdmFsdWUgfSlcbiAgICAgICAgICBjb25zdCBwcm9wTmFtZSA9IHRvQ2FtZWxDYXNlKHBhdGhQYXJ0c1swXSk7XG4gICAgICAgICAgdmFsdWVFeHByID0gYCR7cHJvcE5hbWV9IHx8ICcnYDtcbiAgICAgICAgICBvbkNoYW5nZUV4cHIgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IHZhbHVlIH0pYDtcbiAgICAgICAgICAvLyBGb3IgaW1hZ2VzLCB3ZSBuZWVkIHRvIGhhbmRsZSB0aGUgaWQgYW5kIGZ1bGwgaW1hZ2Ugb2JqZWN0XG4gICAgICAgICAgaW1hZ2VJZEV4cHIgPSBgJHtwcm9wTmFtZX0/LmlkYDtcbiAgICAgICAgICBpbWFnZU9uU2VsZWN0RXhwciA9IGAoaW1hZ2UpID0+IHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogeyBpZDogaW1hZ2UuaWQsIHNyYzogaW1hZ2UudXJsLCBhbHQ6IGltYWdlLmFsdCB8fCAnJyB9IH0pYDtcbiAgICAgICAgfSBlbHNlIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgLy8gQ291bGQgYmUgbmVzdGVkIG9iamVjdCBcImJ1dHRvbi50ZXh0XCIgb3IgYXJyYXkgZmllbGQgXCJicmVhZGNydW1icy5sYWJlbFwiXG4gICAgICAgICAgY29uc3QgcGFyZW50TmFtZSA9IHRvQ2FtZWxDYXNlKHBhdGhQYXJ0c1swXSk7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0gcGF0aFBhcnRzWzFdO1xuICAgICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBjb250ZXh0LnByb3BlcnRpZXNbcGF0aFBhcnRzWzBdXSB8fCBjb250ZXh0LnByb3BlcnRpZXNbcGFyZW50TmFtZV07XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHBhcmVudFByb3A/LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgICAgIC8vIEFycmF5IGZpZWxkOiB1c2UgbG9vcCBjb250ZXh0XG4gICAgICAgICAgICB2YWx1ZUV4cHIgPSBgJHtwYXJlbnRMb29wVmFyfS4ke2ZpZWxkTmFtZX0gfHwgJydgO1xuICAgICAgICAgICAgb25DaGFuZ2VFeHByID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogdmFsdWUgfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgICAgfWA7XG4gICAgICAgICAgICAvLyBGb3IgaW1hZ2VzIGluIGFycmF5c1xuICAgICAgICAgICAgaW1hZ2VJZEV4cHIgPSBgJHtwYXJlbnRMb29wVmFyfS4ke2ZpZWxkTmFtZX0/LmlkYDtcbiAgICAgICAgICAgIGltYWdlT25TZWxlY3RFeHByID0gYChpbWFnZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogeyBpZDogaW1hZ2UuaWQsIHNyYzogaW1hZ2UudXJsLCBhbHQ6IGltYWdlLmFsdCB8fCAnJyB9IH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBOZXN0ZWQgb2JqZWN0IGZpZWxkXG4gICAgICAgICAgICB2YWx1ZUV4cHIgPSBgJHtwYXJlbnROYW1lfT8uJHtmaWVsZE5hbWV9IHx8ICcnYDtcbiAgICAgICAgICAgIG9uQ2hhbmdlRXhwciA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogdmFsdWUgfSB9KWA7XG4gICAgICAgICAgICAvLyBGb3IgaW1hZ2VzIGluIG5lc3RlZCBvYmplY3RzXG4gICAgICAgICAgICBpbWFnZUlkRXhwciA9IGAke3BhcmVudE5hbWV9Py4ke2ZpZWxkTmFtZX0/LmlkYDtcbiAgICAgICAgICAgIGltYWdlT25TZWxlY3RFeHByID0gYChpbWFnZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IHsgLi4uJHtwYXJlbnROYW1lfSwgJHtmaWVsZE5hbWV9OiB7IGlkOiBpbWFnZS5pZCwgc3JjOiBpbWFnZS51cmwsIGFsdDogaW1hZ2UuYWx0IHx8ICcnIH0gfSB9KWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIERlZXBseSBuZXN0ZWQgLSBkZWZhdWx0IHRvIHNpbXBsZXIgaGFuZGxpbmdcbiAgICAgICAgICBjb25zdCBwcm9wTmFtZSA9IHRvQ2FtZWxDYXNlKHBhdGhQYXJ0c1swXSk7XG4gICAgICAgICAgdmFsdWVFeHByID0gYCR7cGFyZW50TG9vcFZhcn0uJHtwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdfSB8fCAnJ2A7XG4gICAgICAgICAgb25DaGFuZ2VFeHByID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV3SXRlbXMgPSBbLi4uJHtwcm9wTmFtZX1dO1xuICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7cGF0aFBhcnRzW3BhdGhQYXJ0cy5sZW5ndGggLSAxXX06IHZhbHVlIH07XG4gICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgIH1gO1xuICAgICAgICAgIC8vIEZvciBpbWFnZXMgaW4gZGVlcGx5IG5lc3RlZCBwYXRoc1xuICAgICAgICAgIGNvbnN0IGxhc3RGaWVsZCA9IHBhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgaW1hZ2VJZEV4cHIgPSBgJHtwYXJlbnRMb29wVmFyfS4ke2xhc3RGaWVsZH0/LmlkYDtcbiAgICAgICAgICBpbWFnZU9uU2VsZWN0RXhwciA9IGAoaW1hZ2UpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0l0ZW1zID0gWy4uLiR7cHJvcE5hbWV9XTtcbiAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06IHsgaWQ6IGltYWdlLmlkLCBzcmM6IGltYWdlLnVybCwgYWx0OiBpbWFnZS5hbHQgfHwgJycgfSB9O1xuICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICB9YDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gR2VuZXJhdGUgYXBwcm9wcmlhdGUgY29tcG9uZW50IGJhc2VkIG9uIGZpZWxkIHR5cGVcbiAgICAgICAgaWYgKHR5cGUgPT09ICdpbWFnZScpIHtcbiAgICAgICAgICAvLyBVc2UgMTB1cCBJbWFnZSBjb21wb25lbnQgZm9yIGlubGluZS1lZGl0YWJsZSBpbWFnZXNcbiAgICAgICAgICByZXR1cm4gYDxJbWFnZVxuICAgICAgICAgICAgaWQ9eyR7aW1hZ2VJZEV4cHJ9fVxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiaGFuZG9mZi1lZGl0YWJsZS1maWVsZFwiXG4gICAgICAgICAgICBvblNlbGVjdD17JHtpbWFnZU9uU2VsZWN0RXhwcn19XG4gICAgICAgICAgICBzaXplPVwibGFyZ2VcIlxuICAgICAgICAgIC8+YDtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAncmljaHRleHQnKSB7XG4gICAgICAgICAgLy8gRXh0cmFjdCB0aGUgdG9wLWxldmVsIGZpZWxkIG5hbWUgZnJvbSB0aGUgcGF0aCAoZS5nLiBcImNvbnRlbnRcIiBmcm9tIFwiY29udGVudFwiKVxuICAgICAgICAgIGNvbnN0IHRvcExldmVsRmllbGQgPSBwYXRoLnNwbGl0KCcuJylbMF07XG4gICAgICAgICAgaWYgKGlubmVyQmxvY2tzRmllbGQgJiYgdG9wTGV2ZWxGaWVsZCA9PT0gaW5uZXJCbG9ja3NGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGA8SW5uZXJCbG9ja3MgYWxsb3dlZEJsb2Nrcz17Q09OVEVOVF9CTE9DS1N9IC8+YDtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gUmljaHRleHQgd2l0aG91dCBJbm5lckJsb2NrczogdXNlIFJpY2hUZXh0IHdpdGggZm9ybWF0dGluZyBhbGxvd2VkXG4gICAgICAgICAgcmV0dXJuIGA8UmljaFRleHRcbiAgICAgICAgICAgIHRhZ05hbWU9XCJkaXZcIlxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiaGFuZG9mZi1lZGl0YWJsZS1maWVsZFwiXG4gICAgICAgICAgICB2YWx1ZT17JHt2YWx1ZUV4cHJ9fVxuICAgICAgICAgICAgb25DaGFuZ2U9eyR7b25DaGFuZ2VFeHByfX1cbiAgICAgICAgICAgIHBsYWNlaG9sZGVyPXtfXygnRW50ZXIgY29udGVudC4uLicsICdoYW5kb2ZmJyl9XG4gICAgICAgICAgLz5gO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdsaW5rJyB8fCB0eXBlID09PSAnYnV0dG9uJykge1xuICAgICAgICAgIGNvbnN0IHNhZmVJZCA9IHBhdGgucmVwbGFjZSgvXFwuL2csICdfJyk7XG4gICAgICAgICAgY29uc3Qgb2JqUmVmID0gdmFsdWVFeHByLnJlcGxhY2UoLyBcXHxcXHwgJyckLywgJycpO1xuICAgICAgICAgIGNvbnN0IGxhYmVsVmFsdWVFeHByID0gYCR7b2JqUmVmfT8ubGFiZWwgfHwgJydgO1xuXG4gICAgICAgICAgY29uc3QgaXNMaW5rID0gdHlwZSA9PT0gJ2xpbmsnO1xuICAgICAgICAgIGNvbnN0IHVybEV4cHIgPSBpc0xpbmsgPyBgJHtvYmpSZWZ9Py51cmwgfHwgJydgIDogYCR7b2JqUmVmfT8uaHJlZiB8fCAnIydgO1xuICAgICAgICAgIGNvbnN0IG5ld1RhYkV4cHIgPSBpc0xpbmsgPyBgJHtvYmpSZWZ9Py5vcGVuc0luTmV3VGFiIHx8IGZhbHNlYCA6IGAke29ialJlZn0/LnRhcmdldCA9PT0gJ19ibGFuaydgO1xuICAgICAgICAgIGNvbnN0IGxhYmVsTWVyZ2UgPSBgeyAuLi4ke29ialJlZn0sIGxhYmVsOiB2YWx1ZSB9YDtcbiAgICAgICAgICBjb25zdCBsaW5rTWVyZ2UgPSBpc0xpbmtcbiAgICAgICAgICAgID8gYHsgLi4uJHtvYmpSZWZ9LCB1cmw6IHZhbHVlLnVybCB8fCAnJywgb3BlbnNJbk5ld1RhYjogdmFsdWUub3BlbnNJbk5ld1RhYiB8fCBmYWxzZSB9YFxuICAgICAgICAgICAgOiBgeyAuLi4ke29ialJlZn0sIGhyZWY6IHZhbHVlLnVybCB8fCAnIycsIHRhcmdldDogdmFsdWUub3BlbnNJbk5ld1RhYiA/ICdfYmxhbmsnIDogJycsIHJlbDogdmFsdWUub3BlbnNJbk5ld1RhYiA/ICdub29wZW5lciBub3JlZmVycmVyJyA6ICcnIH1gO1xuXG4gICAgICAgICAgLy8gQnVpbGQgb25DaGFuZ2UgaGFuZGxlcnMgZnJvbSBzY3JhdGNoIGJhc2VkIG9uIGZpZWxkIGNvbnRleHRcbiAgICAgICAgICBsZXQgbGFiZWxPbkNoYW5nZTogc3RyaW5nO1xuICAgICAgICAgIGxldCBsaW5rT25DaGFuZ2U6IHN0cmluZztcbiAgICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgcHJvcE5hbWUgPSB0b0NhbWVsQ2FzZShwYXRoUGFydHNbMF0pO1xuICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3Byb3BOYW1lfTogJHtsYWJlbE1lcmdlfSB9KWA7XG4gICAgICAgICAgICBsaW5rT25DaGFuZ2UgPSBgKHZhbHVlKSA9PiBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06ICR7bGlua01lcmdlfSB9KWA7XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnROYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IHBhdGhQYXJ0c1sxXTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBjb250ZXh0LnByb3BlcnRpZXNbcGF0aFBhcnRzWzBdXSB8fCBjb250ZXh0LnByb3BlcnRpZXNbcGFyZW50TmFtZV07XG4gICAgICAgICAgICBpZiAocGFyZW50UHJvcD8udHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICAgICAgICBsYWJlbE9uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogJHtsYWJlbE1lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwYXJlbnROYW1lfTogbmV3SXRlbXMgfSk7XG4gICAgICAgICAgICB9YDtcbiAgICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3BhcmVudE5hbWV9XTtcbiAgICAgICAgICAgICAgbmV3SXRlbXNbaW5kZXhdID0geyAuLi5uZXdJdGVtc1tpbmRleF0sICR7ZmllbGROYW1lfTogJHtsaW5rTWVyZ2V9IH07XG4gICAgICAgICAgICAgIHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbGFiZWxPbkNoYW5nZSA9IGAodmFsdWUpID0+IHNldEF0dHJpYnV0ZXMoeyAke3BhcmVudE5hbWV9OiB7IC4uLiR7cGFyZW50TmFtZX0sICR7ZmllbGROYW1lfTogJHtsYWJlbE1lcmdlfSB9IH0pYDtcbiAgICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4gc2V0QXR0cmlidXRlcyh7ICR7cGFyZW50TmFtZX06IHsgLi4uJHtwYXJlbnROYW1lfSwgJHtmaWVsZE5hbWV9OiAke2xpbmtNZXJnZX0gfSB9KWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BOYW1lID0gdG9DYW1lbENhc2UocGF0aFBhcnRzWzBdKTtcbiAgICAgICAgICAgIGNvbnN0IGxhc3RGaWVsZCA9IHBhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBsYWJlbE9uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06ICR7bGFiZWxNZXJnZX0gfTtcbiAgICAgICAgICAgICAgc2V0QXR0cmlidXRlcyh7ICR7cHJvcE5hbWV9OiBuZXdJdGVtcyB9KTtcbiAgICAgICAgICAgIH1gO1xuICAgICAgICAgICAgbGlua09uQ2hhbmdlID0gYCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuZXdJdGVtcyA9IFsuLi4ke3Byb3BOYW1lfV07XG4gICAgICAgICAgICAgIG5ld0l0ZW1zW2luZGV4XSA9IHsgLi4ubmV3SXRlbXNbaW5kZXhdLCAke2xhc3RGaWVsZH06ICR7bGlua01lcmdlfSB9O1xuICAgICAgICAgICAgICBzZXRBdHRyaWJ1dGVzKHsgJHtwcm9wTmFtZX06IG5ld0l0ZW1zIH0pO1xuICAgICAgICAgICAgfWA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIGA8SGFuZG9mZkxpbmtGaWVsZFxuICAgICAgICAgICAgZmllbGRJZD1cIiR7c2FmZUlkfVwiXG4gICAgICAgICAgICBsYWJlbD17JHtsYWJlbFZhbHVlRXhwcn19XG4gICAgICAgICAgICB1cmw9eyR7dXJsRXhwcn19XG4gICAgICAgICAgICBvcGVuc0luTmV3VGFiPXske25ld1RhYkV4cHJ9fVxuICAgICAgICAgICAgb25MYWJlbENoYW5nZT17JHtsYWJlbE9uQ2hhbmdlfX1cbiAgICAgICAgICAgIG9uTGlua0NoYW5nZT17JHtsaW5rT25DaGFuZ2V9fVxuICAgICAgICAgICAgaXNTZWxlY3RlZD17aXNTZWxlY3RlZH1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRm9yIHRleHQgZmllbGRzLCB1c2UgUmljaFRleHQgd2l0aCBubyBhbGxvd2VkIGZvcm1hdHMgZm9yIGlubGluZSBjb250ZW50ZWRpdGFibGUgZWRpdGluZ1xuICAgICAgICAgIHJldHVybiBgPFJpY2hUZXh0XG4gICAgICAgICAgICB0YWdOYW1lPVwic3BhblwiXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJoYW5kb2ZmLWVkaXRhYmxlLWZpZWxkXCJcbiAgICAgICAgICAgIHZhbHVlPXske3ZhbHVlRXhwcn19XG4gICAgICAgICAgICBvbkNoYW5nZT17JHtvbkNoYW5nZUV4cHJ9fVxuICAgICAgICAgICAgYWxsb3dlZEZvcm1hdHM9e1tdfVxuICAgICAgICAgICAgcGxhY2Vob2xkZXI9e19fKCdFbnRlciB0ZXh0Li4uJywgJ2hhbmRvZmYnKX1cbiAgICAgICAgICAvPmA7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gSWYgcGFyc2luZyBmYWlscywganVzdCByZXR1cm4gZW1wdHlcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbiAgXG4gIC8vIEZpbmFsIGNsZWFudXAgLSBjb252ZXJ0IGFueSByZW1haW5pbmcgY2xhc3M9IHRvIGNsYXNzTmFtZT1cbiAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xcYmNsYXNzPVwiL2csICdjbGFzc05hbWU9XCInKTtcbiAgXG4gIC8vIFJlbW92ZSBlbXB0eSBjbGFzc05hbWUgYXR0cmlidXRlc1xuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFxzK2NsYXNzTmFtZT1cIlwiL2csICcnKTtcbiAgXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIl19