const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// This app lives beside the Next.js Hatch OS app. Keep Metro inside this
// folder so the repo-root package.json is not treated as the project.
const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
// Keep the resolver inside this app. The repo root is a separate static site
// and must not satisfy imports for the phone bundle.
config.resolver.blockList = [new RegExp(`${path.resolve(projectRoot, "../..")}/node_modules/.*`)];

module.exports = config;
