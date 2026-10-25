const path                = require("path");
const { execFileSync } = require('node:child_process');
const { DefinePlugin } = require('webpack');
const HtmlWebpackPlugin   = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: "./src/index.js",
  output: {
    path:     path.resolve(__dirname, "dist"),
    // Content-hash the web bundle so Vercel/browsers cache-bust on each deploy.
    filename: "bundle.[contenthash].js",
    clean:    true,
  },
  module: {
    rules: [
      {
        test:    /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader:  "babel-loader",
          options: { presets: ["@babel/preset-env", "@babel/preset-react"] },
        },
      },
      {
        test: /\.css$/,
        use:  [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },
  resolve: { extensions: [".js", ".jsx"] },
  plugins: [
    new DefinePlugin({ __SP_SOURCE_REVISION__: JSON.stringify(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim()) }),
    new HtmlWebpackPlugin({ template: "./src/index.html", filename: "index.html" }),
    new MiniCssExtractPlugin({ filename: "styles.[contenthash].css" }),
  ],
  devServer: {
    port:   3000,
    open:   true,
    static: path.resolve(__dirname),
  },
};
