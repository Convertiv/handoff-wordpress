const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');

// Get all block directories
const blocksDir = path.resolve(__dirname, 'blocks');
const blockFolders = fs.existsSync(blocksDir) 
  ? fs.readdirSync(blocksDir).filter(file => {
      const blockPath = path.join(blocksDir, file);
      return fs.statSync(blockPath).isDirectory() && 
             fs.existsSync(path.join(blockPath, 'index.js'));
    })
  : [];

// Exit early with helpful message if no blocks found
if (blockFolders.length === 0) {
  console.log('\n⚠️  No blocks found in blocks/');
  console.log('   Run "npm run compile:all" first to generate blocks from Handoff.\n');
  // Export a minimal valid config that does nothing
  module.exports = {
    entry: {},
    plugins: [],
  };
} else {

// Create entry points for each block - output as {block}/index
const entry = {};
blockFolders.forEach(block => {
  entry[`${block}/index`] = path.resolve(blocksDir, block, 'index.js');
});

// Add entry points for block variations (merged blocks with variations/ folder) so they are built to build/{block}/variations/{name}.js
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

// Handoff admin dashboard (includes Migration tab — see src/admin/)
const adminEntry = path.resolve(__dirname, 'src/admin/index.js');
if (fs.existsSync(adminEntry)) {
  entry['admin/index'] = adminEntry;
}

// Create copy patterns for block.json and render.php files
const copyPatterns = blockFolders.flatMap(block => {
  const patterns = [];
  const blockPath = path.join(blocksDir, block);
  
  // Copy block.json
  if (fs.existsSync(path.join(blockPath, 'block.json'))) {
    patterns.push({
      from: path.join(blockPath, 'block.json'),
      to: path.join(block, 'block.json'),
    });
  }
  
  // Copy render.php
  if (fs.existsSync(path.join(blockPath, 'render.php'))) {
    patterns.push({
      from: path.join(blockPath, 'render.php'),
      to: path.join(block, 'render.php'),
    });
  }

  // Copy migration-schema.json
  if (fs.existsSync(path.join(blockPath, 'migration-schema.json'))) {
    patterns.push({
      from: path.join(blockPath, 'migration-schema.json'),
      to: path.join(block, 'migration-schema.json'),
    });
  }

  // Copy variations/*.php (server-side variation includes) so they are in build/{block}/variations/
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

module.exports = {
  ...defaultConfig,
  entry,
  // Use high-quality source maps for better debugging
  // 'source-map' gives full original source with accurate line numbers
  // 'eval-source-map' is faster for development but slightly less accurate
  devtool: isProduction ? 'source-map' : 'eval-source-map',
  output: {
    ...defaultConfig.output,
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
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
  ],
};

} // end of else block for when blocks exist
