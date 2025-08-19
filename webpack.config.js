// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

module.exports = (_, argv) => {
    const isProd = argv.mode === 'production';
    const env = dotenv.config({ path: isProd ? '.env.production' : '.env.development' }).parsed || {};

    return {
        target: 'web',
        entry: { main: './src/main.js' },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: isProd ? 'assets/js/[name].[contenthash].js' : 'assets/js/[name].js',
            publicPath: '/',            // SPA routing
            clean: true,
            chunkFormat: 'array-push'
        },
        devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
        module: {
            rules: [
                {
                    test: /\.m?js$/,
                    exclude: /node_modules/,
                    use: { loader: 'babel-loader', options: { presets: [['@babel/preset-env', { targets: 'defaults' }]] } }
                },
                {
                    test: /\.css$/i,
                    use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { importLoaders: 1 } }, 'postcss-loader']
                },
                {
                    test: /\.(png|jpe?g|gif|svg|webp|ico|avif|ttf|woff2?)$/i,
                    type: 'asset/resource',
                    generator: { filename: 'assets/[hash][ext][query]' }
                }
            ]
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: isProd ? 'assets/css/[name].[contenthash].css' : 'assets/css/[name].css'
            }),
            // Single entry HTML
            new HtmlWebpackPlugin({ template: './public/index.html' }),
            // Copy view partials + styles to dist
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'public/views', to: 'views' },
                    { from: 'public/styles.css', to: 'styles.css' },
                    { from: 'public/assets', to: 'assets', noErrorOnMissing: true }
                ]
            }),
            new webpack.DefinePlugin({
                __API_BASE_URL__: JSON.stringify(env.API_BASE_URL || 'http://localhost:3000')
            })
        ],
        optimization: { splitChunks: { chunks: 'all' } },
        devServer: {
            static: { directory: path.join(__dirname, 'public') }, // serves /views and /styles.css in dev
            historyApiFallback: true, // SPA refresh
            hot: true,
            port: 5173,
            open: ['/login'],
            proxy: [
                {
                    context: ['/api'],
                    target: env.API_BASE_URL || 'http://localhost:3000',
                    changeOrigin: true,
                    secure: false,
                    pathRewrite: { '^/api': '' }
                }
            ]
        },
        stats: 'minimal'
    };
};
