import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// Strip the shebang from tsc output before bundling (esbuild banner adds it)
const tscOutput = path.resolve('dist/index.js');
let source = fs.readFileSync(tscOutput, 'utf8');
if (source.startsWith('#!')) {
  source = source.replace(/^#![^\n]*\n/, '');
  fs.writeFileSync(tscOutput, source);
}

await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/compiler.mjs',
  minify: false,
  sourcemap: false,
  external: [],
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __bundleCreateRequire } from "module";',
      'const require = __bundleCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

fs.chmodSync(path.resolve('dist/compiler.mjs'), 0o755);
console.log('Bundled compiler → dist/compiler.mjs');
