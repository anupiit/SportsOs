// apps/mobile is deliberately not an npm workspace: the repo root has its own
// node_modules (the web app's React). Metro must only ever bundle packages from
// this app's node_modules, so React / React Native are never duplicated.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const appModules = path.resolve(__dirname, 'node_modules');
const repoRootModules = path.resolve(__dirname, '../../node_modules');
const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [appModules];
// Hierarchical lookup stays on: npm nests some Expo packages
// (e.g. node_modules/expo/node_modules/expo-asset). Walking up past this app
// would reach the repo root's node_modules, so block that tree outright.
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  new RegExp(`^${escape(repoRootModules)}[\\\\/].*`),
];

module.exports = config;
