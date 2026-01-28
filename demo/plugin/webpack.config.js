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

// Create entry points for each block - output as {block}/index
const entry = {};
blockFolders.forEach(block => {
  entry[`${block}/index`] = path.resolve(blocksDir, block, 'index.js');
});

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
  
  return patterns;
});

module.exports = {
  ...defaultConfig,
  entry: Object.keys(entry).length > 0 ? entry : defaultConfig.entry,
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
