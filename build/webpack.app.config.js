const path = require("path");
const { merge } = require("webpack-merge");
const base = require("./webpack.base.config");

module.exports = (env) => {
  return merge(base(env), {
    entry: {
      background: "./src/background.js",
      app: "./src/app.js",
      bridge: "./src/helpers/webview/bridge.js"
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "../app"),
      // background.js runs in the main process (no `document`), so disable
      // webpack's browser-only automatic publicPath detection. Icon assets are
      // referenced by filename and not emitted, so a static path is correct.
      publicPath: ""
    }
  });
};
