const path = require('path');

module.exports = {
  entry: {
    'background/background': './background/background.js',
    'popup/popup': './popup/popup.js',
    'content/content': './content/content.js',
    'js/database/storage': './js/database/storage.js',
    'js/services/bookmark-service': './js/services/bookmark-service.js',
    'js/services/tag-service': './js/services/tag-service.js',
    'js/services/categorizer': './js/services/categorizer.js',
    'background/duplicate-detector': './background/duplicate-detector.js',
    'background/bookmark-sync': './background/bookmark-sync.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  chrome: 88 // Chrome 88+ (Manifest V3 support)
                },
                useBuiltIns: 'entry',
                corejs: 3
              }]
            ]
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      '@': path.resolve(__dirname, '')
    }
  },
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  },
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};