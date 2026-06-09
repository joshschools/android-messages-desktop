const path = require("path");
const nodeExternals = require("webpack-node-externals");

// webpack 5 passes `--env production` as an object ({ production: true }),
// so derive a single environment name from it.
const resolveEnvName = (env) => {
  return env && env.production ? "production" : "development";
};

module.exports = (env) => {
  const envName = resolveEnvName(env);
  const isProduction = envName === "production";

  return {
    target: "electron-renderer",
    mode: isProduction ? "production" : "development",
    node: {
      __dirname: false,
      __filename: false
    },
    externals: [nodeExternals()],
    resolve: {
      alias: {
        env: path.resolve(__dirname, `../config/env_${envName}.json`)
      }
    },
    // Use non-eval source maps so the app's strict CSP (script-src 'self')
    // holds in development too; eval-based devtools would require 'unsafe-eval'.
    devtool: isProduction ? "source-map" : "cheap-module-source-map",
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: ["babel-loader"]
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"]
        },
        {
          test: /\.(png|jpg|gif)$/,
          // The icons are shipped as extraResources and referenced by their
          // filename at runtime, so emit only the basename and reference it.
          type: "asset/resource",
          generator: {
            emit: false,
            filename: "[name][ext]"
          }
        }
      ]
    }
  };
};
