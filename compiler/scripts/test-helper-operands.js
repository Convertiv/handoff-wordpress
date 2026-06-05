#!/usr/bin/env node
/**
 * Regression: dotted alias paths in helper expressions (e.g. tag.icon in nested loops).
 */
const { parseHelperExpression } = require('../dist/generators/handlebars-to-jsx/expression-parser.js');
const { handlebarsToPhp } = require('../dist/generators/render-php.js');

let failed = 0;
const assert = (label, condition) => {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    failed += 1;
  } else {
    console.log(`OK: ${label}`);
  }
};

assert(
  'tag.icon helper operand',
  parseHelperExpression('(eq tag.icon "precision")') === 'tag?.icon === "precision"',
);

assert(
  'tag.icon not bare tagIcon',
  !parseHelperExpression('(eq tag.icon "precision")').includes('tagIcon'),
);

const phpTpl = `{{#each properties.slides as |slide|}}{{#each slide.tags as |tag|}}{{#if (eq tag.icon "precision")}}x{{/if}}{{/each}}{{/each}}`;
const phpOut = handlebarsToPhp(phpTpl, {});
assert('render.php uses subItem icon', phpOut.includes("$subItem['icon']"));
assert('render.php not tagIcon key', !phpOut.includes("['tagIcon']"));

process.exit(failed > 0 ? 1 : 0);
