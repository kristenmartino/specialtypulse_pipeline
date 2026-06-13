const path                = require("path");
const HtmlWebpackPlugin   = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: "./src/index.js",
  output: {
    // Default output (app root) is what Domo + CI expect; WEB_BUILD=1 targets
    // dist/ for the standalone Vercel deployment without touching those artifacts.
    path:     process.env.WEB_BUILD ? path.resolve(__dirname, "dist") : path.resolve(__dirname),
    // Content-hash the web bundle so Vercel/browsers cache-bust on each deploy.
    // Domo + CI expect the fixed "bundle.js" name, so only hash for WEB_BUILD.
    filename: process.env.WEB_BUILD ? "bundle.[contenthash].js" : "bundle.js",
    clean:    Boolean(process.env.WEB_BUILD),
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
    new HtmlWebpackPlugin({ template: "./src/index.html", filename: "index.html" }),
    new MiniCssExtractPlugin({ filename: process.env.WEB_BUILD ? "styles.[contenthash].css" : "styles.css" }),
  ],
  devServer: {
    port:   3000,
    open:   true,
    static: path.resolve(__dirname),
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
