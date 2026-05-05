const baseConfig = require('openmrs/default-webpack-config');

/**
 * Disable the webpack-dev-server runtime-error overlay so that errors
 * thrown by unrelated host-shell apps (e.g. `openmrs-esm-devtools-app`'s
 * `getImportMapOverrideMap` mismatch) don't block this module's UI.
 * Compile errors will still be shown.
 */
module.exports = (env, argv) => {
  const config = typeof baseConfig === 'function' ? baseConfig(env, argv) : baseConfig;
  config.devServer = {
    ...(config.devServer || {}),
    client: {
      ...((config.devServer && config.devServer.client) || {}),
      overlay: { errors: true, warnings: false, runtimeErrors: false },
    },
  };

  return config;
};

