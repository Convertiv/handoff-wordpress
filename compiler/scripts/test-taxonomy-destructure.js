#!/usr/bin/env node
/**
 * Regression: taxonomy array attrs must appear in edit() destructuring.
 */
const fs = require('fs');
const path = require('path');
const { generateIndexJs } = require('../dist/generators/index-js.js');

const component = {
  id: 'article_hero',
  title: 'Article Hero',
  group: 'Heroes',
  code: '<section></section>',
  properties: {
    title: { type: 'text', default: 'Title' },
  },
};

const dynamicArrayConfigs = {
  tags: {
    arrayType: 'taxonomy',
    taxonomies: ['post_tag'],
    maxItems: 3,
  },
};

const out = generateIndexJs(component, dynamicArrayConfigs);
const destructure = out.match(/const\s*\{\s*([^}]+)\s*\}\s*=\s*attributes\s*;/);
if (!destructure) {
  console.error('FAIL: no attributes destructure');
  process.exit(1);
}
const names = destructure[1].split(',').map((s) => s.trim());
if (!names.includes('tags')) {
  console.error('FAIL: tags missing from destructure:', names.join(', '));
  process.exit(1);
}
if (!out.includes('return tags || []')) {
  console.error('FAIL: expected taxonomy manual preview hook');
  process.exit(1);
}
console.log('OK: taxonomy array attr included in destructure');
