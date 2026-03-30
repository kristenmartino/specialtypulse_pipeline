const path                = require("path");
const HtmlWebpackPlugin   = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: "./src/index.js",
  output: {
    path:     path.resolve(__dirname, "dist"),
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
    new HtmlWebpackPlugin({ template: "./src/index.html" }),
    new MiniCssExtractPlugin({ filename: "styles.[contenthash].css" }),
  ],
  devServer: {
    port:   3000,
    open:   true,
    static: path.resolve(__dirname, "dist"),
    proxy: [
      {
        // Proxy AI requests so the API key stays server-side.
        // Set ANTHROPIC_API_KEY in your shell before running `npm start`.
        context: ["/api/anthropic"],
        target: "https://api.anthropic.com",
        changeOrigin: true,
        pathRewrite: { "^/api/anthropic": "" },
        onProxyReq: (proxyReq) => {
          const key = process.env.ANTHROPIC_API_KEY || "";
          if (key) proxyReq.setHeader("x-api-key", key);
        },
      },
    ],
  },
};
