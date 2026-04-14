const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');

// When HANDOFF_CONTENT_DIR env var is set (Composer installs, `wp handoff build`),
// block sources and build output point to the external content directory.
// When unset, everything stays within the plugin root (development / self-contained mode).
const contentDir = process.env.HANDOFF_CONTENT_DIR || 'wp-content/handoff';
const isExternalContent = contentDir !== __dirname;

const blocksDir = path.resolve(contentDir, 'blocks');
const blockFolders = fs.existsSync(blocksDir)
  ? fs.readdirSync(blocksDir).filter(file => {
      const blockPath = path.join(blocksDir, file);
      return fs.statSync(blockPath).isDirectory() &&
             fs.existsSync(path.join(blockPath, 'index.js'));
    })
  : [];

if (blockFolders.length === 0 && !isExternalContent) {
  console.log('\n⚠️  No blocks found in blocks/');
  console.log('   Run "npm run compile:all" first to generate blocks from Handoff.\n');
}

const entry = {};

blockFolders.forEach(block => {
  entry[`${block}/index`] = path.resolve(blocksDir, block, 'index.js');
});

blockFolders.forEach(block => {
  const variationsDir = path.join(blocksDir, block, 'variations');
  if (fs.existsSync(variationsDir)) {
    const variationFiles = fs.readdirSync(variationsDir).filter(f => f.endsWith('.js'));
    variationFiles.forEach(file => {
      const name = file.replace(/\.js$/, '');
      entry[`${block}/variations/${name}`] = path.join(variationsDir, file);
    });
  }
});

// Admin dashboard entry — always included. When building with an external
// content dir the output lands in contentDir/build/admin/ and is then copied
// back to the plugin's own build/admin/ (where PHP expects it).
const adminEntry = path.resolve(__dirname, 'src/admin/index.js');
if (fs.existsSync(adminEntry)) {
  entry['admin/index'] = adminEntry;
}

if (Object.keys(entry).length === 0) {
  module.exports = { entry: {}, plugins: [] };
} else {

const copyPatterns = blockFolders.flatMap(block => {
  const patterns = [];
  const blockPath = path.join(blocksDir, block);

  if (fs.existsSync(path.join(blockPath, 'block.json'))) {
    patterns.push({
      from: path.join(blockPath, 'block.json'),
      to: path.join(block, 'block.json'),
    });
  }

  if (fs.existsSync(path.join(blockPath, 'render.php'))) {
    patterns.push({
      from: path.join(blockPath, 'render.php'),
      to: path.join(block, 'render.php'),
    });
  }

  if (fs.existsSync(path.join(blockPath, 'migration-schema.json'))) {
    patterns.push({
      from: path.join(blockPath, 'migration-schema.json'),
      to: path.join(block, 'migration-schema.json'),
    });
  }

  if (fs.existsSync(path.join(blockPath, 'schema-changelog.json'))) {
    patterns.push({
      from: path.join(blockPath, 'schema-changelog.json'),
      to: path.join(block, 'schema-changelog.json'),
    });
  }

  if (fs.existsSync(path.join(blockPath, 'screenshot.png'))) {
    patterns.push({
      from: path.join(blockPath, 'screenshot.png'),
      to: path.join(block, 'screenshot.png'),
    });
  }

  const variationsDir = path.join(blockPath, 'variations');
  if (fs.existsSync(variationsDir)) {
    const variationPhp = fs.readdirSync(variationsDir).filter(f => f.endsWith('.php'));
    variationPhp.forEach(file => {
      patterns.push({
        from: path.join(variationsDir, file),
        to: path.join(block, 'variations', file),
      });
    });
  }

  return patterns;
});

const isProduction = process.env.NODE_ENV === 'production';

// Plugin's own shared/ directory contains the actual component source files.
// When building from an external content dir, blocks use relative paths like
// ../../shared/... which resolve to contentDir/shared/ — but only barrel files
// exist there. We alias that path back to the plugin's shared/ so webpack finds
// the real component sources.
const pluginSharedDir = path.resolve(__dirname, 'shared');

module.exports = {
  ...defaultConfig,
  entry,
  devtool: isProduction ? 'source-map' : 'eval-source-map',
  output: {
    ...defaultConfig.output,
    path: path.resolve(contentDir, 'build'),
    filename: '[name].js',
  },
  resolve: {
    ...defaultConfig.resolve,
    modules: [
      ...(defaultConfig.resolve?.modules || ['node_modules']),
      // Ensure the plugin's own node_modules is searched for npm deps
      // (e.g. @10up/block-components) even when blocks live outside the plugin.
      ...(isExternalContent ? [path.resolve(__dirname, 'node_modules')] : []),
    ],
    alias: {
      ...(defaultConfig.resolve?.alias || {}),
      // Bare "shared/..." imports
      shared: pluginSharedDir,
      // Redirect resolved relative paths from contentDir/shared → plugin shared
      ...(isExternalContent
        ? { [path.resolve(contentDir, 'shared')]: pluginSharedDir }
        : {}),
    },
  },
  plugins: [
    ...defaultConfig.plugins.filter(
      plugin => plugin.constructor.name !== 'CopyPlugin'
    ),
    ...(copyPatterns.length > 0 ? [
      new CopyPlugin({
        patterns: copyPatterns,
      }),
    ] : []),
    // When output.path is the external content dir, the admin bundle lands
    // there too. Copy it back to the plugin root where PHP loads it from.
    // This runs after webpack emits all files so the admin assets exist on disk.
    ...(isExternalContent ? [{
      apply(compiler) {
        compiler.hooks.afterEmit.tapAsync('CopyAdminToPluginRoot', (_compilation, callback) => {
          const src = path.resolve(contentDir, 'build/admin');
          const dest = path.resolve(__dirname, 'build/admin');
          if (fs.existsSync(src)) {
            fs.mkdirSync(dest, { recursive: true });
            fs.cpSync(src, dest, { recursive: true });
          }
          callback();
        });
      },
    }] : []),
  ],
};

}
