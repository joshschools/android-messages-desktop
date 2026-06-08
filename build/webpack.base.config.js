const path = require("path");
const nodeExternals = require("webpack-node-externals");

// webpack 5 passes `--env production` as an object ({ production: true }),
// so derive a single environment name from it.
const resolveEnvName = (env) => {
  if (env && env.production) {
    return "production";
  }
  if (env && env.test) {
    return "test";
  }
  return "development";
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
    devtool: isProduction ? "source-map" : "eval-source-map",
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
