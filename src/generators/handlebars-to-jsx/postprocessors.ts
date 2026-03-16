/**
 * Postprocessing utilities for the Handlebars to JSX transpiler
 */

import { parse as parseHTML } from 'node-html-parser';
import { TranspilerContext, FieldInfo } from './types';
import { toCamelCase } from './utils';
import { transpileExpression } from './expression-parser';
import { cleanTemplate, preprocessBlocks } from './preprocessors';
import { nodeToJsx } from './node-converter';

/**
 * Post-process to convert template literal markers back to actual template literals
 */
export const postprocessTemplateLiterals = (jsx: string): string => {
  return jsx.replace(/__TEMPLATE_LITERAL__([A-Za-z0-9+/=]+)__END_TEMPLATE_LITERAL__/g, (_, encoded) => {
    const decoded = Buffer.from(encoded, 'base64').toString();
    return '`' + decoded + '`';
  });
};

/**
 * Post-process JSX to convert markers back to JSX logic
 */
export const postprocessJsx = (jsx: string, context: TranspilerContext, parentLoopVar: string = 'item', innerBlocksField?: string | null): string => {
  let result = jsx;
  
  // Convert top-level loop markers WITH alias (properties.xxx or properties.xxx.yyy as |alias|) to JSX map expressions
  // Handle both hyphenated (data-prop) and camelCase (dataProp) attribute names
  // data-prop now contains paths like "jumpNav.links" for nested property access
  result = result.replace(
    /<loop-marker\s+(?:data-prop|dataProp)="([\w.]+)"\s+(?:data-type|dataType)="properties"\s+(?:data-alias|dataAlias)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/loop-marker>)/gi,
    (_, propPath, aliasName, encodedContent) => {
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
      const loopContext: TranspilerContext = {
        ...context,
        loopVariable: loopVarName,
        loopIndex: 'index',
        loopArray: propPath,
        inLoop: true
      };
      
      // Parse and convert inner content (pass propPath so {{#unless @last}} get data-array for correct array name)
      const cleanedInner = cleanTemplate(innerContent);
      const preprocessed = preprocessBlocks(cleanedInner, propPath);
      const root = parseHTML(preprocessed, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, loopContext);
      innerJsx = postprocessJsx(innerJsx, loopContext, loopVarName);
      
      // propPath can be "items" or "jumpNav.links" - use as-is for the map expression
      return `{${propPath} && ${propPath}.map((${loopVarName}, index) => (
        <Fragment key={index}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    }
  );
  
  // Convert top-level loop markers WITHOUT alias (properties.xxx or properties.xxx.yyy) to JSX map expressions
  // Handle both hyphenated and camelCase attribute names
  // data-prop now contains paths like "jumpNav.links" for nested property access
  result = result.replace(
    /<loop-marker\s+(?:data-prop|dataProp)="([\w.]+)"\s+(?:data-type|dataType)="properties"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/loop-marker>)/gi,
    (_, propPath, encodedContent) => {
      const innerContent = Buffer.from(encodedContent, 'base64').toString();
      const loopContext: TranspilerContext = {
        ...context,
        loopVariable: 'item',
        loopIndex: 'index',
        loopArray: propPath,
        inLoop: true
      };
      
      // Parse and convert inner content (pass propPath for unless-last data-array)
      const cleanedInner = cleanTemplate(innerContent);
      const preprocessed = preprocessBlocks(cleanedInner, propPath);
      const root = parseHTML(preprocessed, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, loopContext);
      innerJsx = postprocessJsx(innerJsx, loopContext, 'item');
      
      // propPath can be "items" or "jumpNav.links" - use as-is for the map expression
      return `{${propPath} && ${propPath}.map((item, index) => (
        <Fragment key={index}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    }
  );
  
  // Convert nested loop markers WITH alias (this.xxx as |alias|) to JSX map expressions FIRST
  // Handle both hyphenated and camelCase attribute names
  result = result.replace(
    /<nested-loop-marker\s+(?:data-prop|dataProp)="(\w+)"\s+(?:data-alias|dataAlias)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/nested-loop-marker>)/gi,
    (_, propName, aliasName, encodedContent) => {
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
      
      const nestedContext: TranspilerContext = {
        ...context,
        loopVariable: nestedVar,
        loopIndex: nestedIndex,
        loopArray: arrayRef,
        inLoop: true
      };
      
      // Parse and convert inner content with the nested loop variable (pass arrayRef for unless-last data-array)
      const cleanedInner = cleanTemplate(innerContent);
      const preprocessed = preprocessBlocks(cleanedInner, arrayRef);
      const root = parseHTML(preprocessed, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, nestedContext);
      
      // Replace references to use the nested variable
      innerJsx = innerJsx.replace(/\{item\./g, `{${nestedVar}.`);
      innerJsx = innerJsx.replace(/\{item\}/g, `{${nestedVar}}`);
      
      innerJsx = postprocessJsx(innerJsx, nestedContext, nestedVar);
      
      return `{${arrayRef} && ${arrayRef}.map((${nestedVar}, ${nestedIndex}) => (
        <Fragment key={${nestedIndex}}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    }
  );
  
  // Convert nested loop markers WITHOUT alias (this.xxx) to JSX map expressions
  // Handle both hyphenated and camelCase attribute names
  result = result.replace(
    /<nested-loop-marker\s+(?:data-prop|dataProp)="(\w+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/nested-loop-marker>)/gi,
    (_, propName, encodedContent) => {
      const innerContent = Buffer.from(encodedContent, 'base64').toString();
      // Use a different variable name for nested loops to avoid shadowing
      const nestedVar = 'subItem';
      const nestedIndex = 'subIndex';
      const arrayRef = `${parentLoopVar}.${propName}`;
      
      const nestedContext: TranspilerContext = {
        ...context,
        loopVariable: nestedVar,
        loopIndex: nestedIndex,
        loopArray: arrayRef,
        inLoop: true
      };
      
      // Parse and convert inner content with the nested loop variable (pass arrayRef for unless-last data-array)
      const cleanedInner = cleanTemplate(innerContent);
      const preprocessed = preprocessBlocks(cleanedInner, arrayRef);
      const root = parseHTML(preprocessed, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, nestedContext);

      // Replace references to use the nested variable
      innerJsx = innerJsx.replace(/\{item\./g, `{${nestedVar}.`);
      innerJsx = innerJsx.replace(/\{item\}/g, `{${nestedVar}}`);

      innerJsx = postprocessJsx(innerJsx, nestedContext, nestedVar);

      return `{${arrayRef} && ${arrayRef}.map((${nestedVar}, ${nestedIndex}) => (
        <Fragment key={${nestedIndex}}>
          ${innerJsx.trim()}
        </Fragment>
      ))}`;
    }
  );

  // Convert unless-last markers (data-array when present comes from preprocessor when inside {{#each}} so expansion works without loop context)
  // Handle both hyphenated and camelCase attribute names; attribute order: data-content then optional data-array
  result = result.replace(
    /<unless-last-marker\s+(?:data-content|dataContent)="([^"]+)"\s*(?:(?:data-array|dataArray)="([^"]+)"\s*)?(?:\/>|><\/unless-last-marker>)/gi,
    (_, encodedContent, dataArray) => {
      const innerContent = Buffer.from(encodedContent, 'base64').toString();
      const arrayName = dataArray || context.loopArray || 'items';
      
      // Parse inner content
      const cleanedInner = cleanTemplate(innerContent);
      const root = parseHTML(cleanedInner, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, context);
      innerJsx = postprocessJsx(innerJsx, context, parentLoopVar);
      
      return `{index < ${arrayName}?.length - 1 && (
        <Fragment>
          ${innerJsx.trim()}
        </Fragment>
      )}`;
    }
  );
  
  // Convert unless-first markers
  // Handle both hyphenated and camelCase attribute names
  result = result.replace(
    /<unless-first-marker\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/unless-first-marker>)/gi,
    (_, encodedContent) => {
      const innerContent = Buffer.from(encodedContent, 'base64').toString();
      
      // Parse inner content
      const cleanedInner = cleanTemplate(innerContent);
      const root = parseHTML(cleanedInner, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, context);
      innerJsx = postprocessJsx(innerJsx, context, parentLoopVar);
      
      // @first is true when index === 0, so unless @first means index !== 0
      return `{index !== 0 && (
        <Fragment>
          ${innerJsx.trim()}
        </Fragment>
      )}`;
    }
  );
  
  // Convert if markers (without else)
  // Handle both hyphenated (data-condition) and camelCase (dataCondition) attribute names
  result = result.replace(
    /<if-marker\s+(?:data-condition|dataCondition)="([^"]+)"\s+(?:data-content|dataContent)="([^"]+)"\s*(?:\/>|><\/if-marker>)/gi,
    (_, encodedCondition, encodedContent) => {
      const condition = Buffer.from(encodedCondition, 'base64').toString();
      const innerContent = Buffer.from(encodedContent, 'base64').toString();
      const expr = transpileExpression(condition, context, parentLoopVar);
      
      // Parse inner content
      const cleanedInner = cleanTemplate(innerContent);
      const preprocessed = preprocessBlocks(cleanedInner);
      const root = parseHTML(preprocessed, { lowerCaseTagName: false, comment: false });
      let innerJsx = nodeToJsx(root, context);
      innerJsx = postprocessJsx(innerJsx, context, parentLoopVar);
      
      return `{${expr} && (
        <Fragment>
          ${innerJsx.trim()}
        </Fragment>
      )}`;
    }
  );
  
  // Convert if-else markers (with else) to ternary expressions
  // Handle both hyphenated and camelCase attribute names
  result = result.replace(
    /<if-else-marker\s+(?:data-condition|dataCondition)="([^"]+)"\s+(?:data-if-content|dataIfContent)="([^"]+)"\s+(?:data-else-content|dataElseContent)="([^"]+)"\s*(?:\/>|><\/if-else-marker>)/gi,
    (_, encodedCondition, encodedIfContent, encodedElseContent) => {
      const condition = Buffer.from(encodedCondition, 'base64').toString();
      const ifContent = Buffer.from(encodedIfContent, 'base64').toString();
      const elseContent = Buffer.from(encodedElseContent, 'base64').toString();
      const expr = transpileExpression(condition, context, parentLoopVar);
      
      // Parse if content
      const cleanedIf = cleanTemplate(ifContent);
      const preprocessedIf = preprocessBlocks(cleanedIf);
      const rootIf = parseHTML(preprocessedIf, { lowerCaseTagName: false, comment: false });
      let ifJsx = nodeToJsx(rootIf, context);
      ifJsx = postprocessJsx(ifJsx, context, parentLoopVar);
      
      // Parse else content
      const cleanedElse = cleanTemplate(elseContent);
      const preprocessedElse = preprocessBlocks(cleanedElse);
      const rootElse = parseHTML(preprocessedElse, { lowerCaseTagName: false, comment: false });
      let elseJsx = nodeToJsx(rootElse, context);
      elseJsx = postprocessJsx(elseJsx, context, parentLoopVar);
      
      return `{${expr} ? (
        <Fragment>
          ${ifJsx.trim()}
        </Fragment>
      ) : (
        <Fragment>
          ${elseJsx.trim()}
        </Fragment>
      )}`;
    }
  );
  
  // Convert if-elseif markers (with else-if chain) to nested ternary expressions
  // Handle both hyphenated and camelCase attribute names
  result = result.replace(
    /<if-elseif-marker\s+(?:data-condition|dataCondition)="([^"]+)"\s+(?:data-if-content|dataIfContent)="([^"]+)"\s+(?:data-nested-marker|dataNestedMarker)="([^"]+)"\s*(?:\/>|><\/if-elseif-marker>)/gi,
    (_, encodedCondition, encodedIfContent, encodedNestedMarker) => {
      const condition = Buffer.from(encodedCondition, 'base64').toString();
      const ifContent = Buffer.from(encodedIfContent, 'base64').toString();
      const nestedMarker = Buffer.from(encodedNestedMarker, 'base64').toString();
      
      const expr = transpileExpression(condition, context, parentLoopVar);
      
      // Parse if content
      const cleanedIf = cleanTemplate(ifContent);
      const preprocessedIf = preprocessBlocks(cleanedIf);
      const rootIf = parseHTML(preprocessedIf, { lowerCaseTagName: false, comment: false });
      let ifJsx = nodeToJsx(rootIf, context);
      ifJsx = postprocessJsx(ifJsx, context, parentLoopVar);
      
      // The nested marker is already a preprocessed if/if-else/if-elseif marker
      // We need to parse it through HTML parser and process it
      const rootNested = parseHTML(nestedMarker, { lowerCaseTagName: false, comment: false });
      let nestedJsx = nodeToJsx(rootNested, context);
      nestedJsx = postprocessJsx(nestedJsx, context, parentLoopVar);
      
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
      } else {
        // Fallback - just use null for the else case
        return `{${expr} ? (
        <Fragment>
          ${ifJsx.trim()}
        </Fragment>
      ) : null}`;
      }
    }
  );
  
  // Convert editable field markers to appropriate components based on field type
  // Handle both hyphenated and camelCase attribute names
  result = result.replace(
    /<editable-field-marker\s+(?:data-field|dataField)="([^"]+)"\s*(?:\/>|><\/editable-field-marker>)/gi,
    (_, encodedFieldInfo) => {
      try {
        const fieldInfo: FieldInfo = JSON.parse(Buffer.from(encodedFieldInfo, 'base64').toString());
        const { path, type, content } = fieldInfo;
        
        // Parse the path to determine how to set attributes
        const pathParts = path.split('.');
        const isArrayField = pathParts.length > 1;
        
        // Convert the content (which contains Handlebars expressions) to JSX value reference
        // Extract the property reference from content like {{properties.title}} or {{crumb.label}}
        let valueExpr: string;
        let onChangeExpr: string;
        let imageIdExpr: string = '';
        let imageOnSelectExpr: string = '';
        
        if (pathParts.length === 1) {
          // Top-level field: "title" -> title, setAttributes({ title: value })
          const propName = toCamelCase(pathParts[0]);
          valueExpr = `${propName} || ''`;
          onChangeExpr = `(value) => setAttributes({ ${propName}: value })`;
          // For images, we need to handle the id and full image object
          imageIdExpr = `${propName}?.id`;
          imageOnSelectExpr = `(image) => setAttributes({ ${propName}: { id: image.id, src: image.url, alt: image.alt || '' } })`;
        } else if (pathParts.length === 2) {
          // Could be nested object "button.text" or array field "breadcrumbs.label"
          const parentName = toCamelCase(pathParts[0]);
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
          } else {
            // Nested object field
            valueExpr = `${parentName}?.${fieldName} || ''`;
            onChangeExpr = `(value) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: value } })`;
            // For images in nested objects
            imageIdExpr = `${parentName}?.${fieldName}?.id`;
            imageOnSelectExpr = `(image) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: { id: image.id, src: image.url, alt: image.alt || '' } } })`;
          }
        } else {
          // Deeply nested - default to simpler handling
          const propName = toCamelCase(pathParts[0]);
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
        } else if (type === 'richtext') {
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
        } else if (type === 'link' || type === 'button') {
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
          let labelOnChange: string;
          let linkOnChange: string;
          if (pathParts.length === 1) {
            const propName = toCamelCase(pathParts[0]);
            labelOnChange = `(value) => setAttributes({ ${propName}: ${labelMerge} })`;
            linkOnChange = `(value) => setAttributes({ ${propName}: ${linkMerge} })`;
          } else if (pathParts.length === 2) {
            const parentName = toCamelCase(pathParts[0]);
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
            } else {
              labelOnChange = `(value) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: ${labelMerge} } })`;
              linkOnChange = `(value) => setAttributes({ ${parentName}: { ...${parentName}, ${fieldName}: ${linkMerge} } })`;
            }
          } else {
            const propName = toCamelCase(pathParts[0]);
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
        } else {
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
      } catch (e) {
        // If parsing fails, just return empty
        return '';
      }
    }
  );
  
  // Final cleanup - convert any remaining class= to className=
  result = result.replace(/\bclass="/g, 'className="');
  
  // Remove empty className attributes
  result = result.replace(/\s+className=""/g, '');
  
  return result;
};
