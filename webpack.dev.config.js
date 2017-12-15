/* eslint-disable import/no-extraneous-dependencies */
const HtmlWebpackPlugin = require('html-webpack-plugin')
const FaviconsWebpackPlugin = require('favicons-webpack-plugin')

const path = require('path')
const webpack = require('webpack')
/* eslint-enable import/no-extraneous-dependencies */

const pkg = require('./package.json')

const nodeEnv = process.env.NODE_ENV || 'development'
const version = process.env.BUILD_VERSION || pkg.version
const build = process.env.BUILD_NUMBER || 'SNAPSHOT'

const config = require('./src/config.json')

const whitelist = config.developmentWhitelist

const ethereumUrl =
  process.env.ETHEREUM_URL || `${config.ethereum.protocol}://${config.ethereum.host}:${config.ethereum.port}`

module.exports = {
  context: path.join(__dirname, 'src'),
  entry: ['react-hot-loader/patch', 'bootstrap-loader', 'index.tsx'],
  devtool: 'eval-source-map',
  output: {
    publicPath: '/',
    path: `${__dirname}/dist`,
    filename: 'bundle.js',
  },
  resolve: {
    symlinks: false,
    modules: [
      `${__dirname}/src`,
      'node_modules',
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
          },
        },
      },
      {
        test: /\.tsx?$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'awesome-typescript-loader',
          options: {
            useBabel: true,
            useCache: true,
          },
        },
      },
      {
        test: /\.(jpe?g|png|svg)$/i,
        use: {
          loader: 'file-loader',
          options: {
            name: 'img/[name].[ext]',
          },
        },
      },
      {
        test: /\.(less|s?css)$/,
        use: [
          {
            loader: 'style-loader',
            options: {
              sourceMap: true,
            },
          },
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: true,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: /\.less$/,
        use: {
          loader: 'less-loader',
          options: {
            strictMath: true,
            sourceMap: true,
          },
        },
      },
      {
        test: /\.scss$/,
        use: {
          loader: 'sass-loader',
          options: {
            sourceMap: true,
          },
        },
      },
      {
        test: /\.(ttf|otf|eot|woff(2)?)(\?[a-z0-9]+)?$/,
        use: {
          loader: 'file-loader',
          options: {
            name: 'fonts/[name].[ext]',
          },
        },
      },
    ],
  },
  devServer: {
    disableHostCheck: true,
    historyApiFallback: true,
    port: 5000,
    host: '0.0.0.0',
    clientLogLevel: 'info',
    hot: true,
    watchOptions: {
      ignored: /node_modules/,
    },
  },
  plugins: [
    new webpack.NamedModulesPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    // new FaviconsWebpackPlugin({
    //   logo: 'assets/img/gnosis_logo_favicon.png',
    //   // Generate a cache file with control hashes and
    //   // don't rebuild the favicons until those hashes change
    //   persistentCache: true,
    //   icons: {
    //     android: false,
    //     appleIcon: false,
    //     appleStartup: false,
    //     coast: false,
    //     favicons: true,
    //     firefox: false,
    //     opengraph: false,
    //     twitter: false,
    //     yandex: false,
    //     windows: false,
    //   },
    // }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src/html/index.html'),
    }),
    new webpack.DefinePlugin({
      'process.env': {
        VERSION: JSON.stringify(`${version}#${build}`),
        NODE_ENV: JSON.stringify(nodeEnv),
        ETHEREUM_URL: JSON.stringify(ethereumUrl),
        WHITELIST: JSON.stringify(whitelist),
      },
    }),
  ],
}
