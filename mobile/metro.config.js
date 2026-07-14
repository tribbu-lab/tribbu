// Metro config — comparte la lógica pura de ../src/lib con la app web.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const sharedLib = path.resolve(repoRoot, "src", "lib");

const config = getDefaultConfig(projectRoot);

// Metro debe vigilar la carpeta compartida fuera de mobile/.
config.watchFolders = [sharedLib];

// Resolver módulos primero desde mobile/node_modules (evita duplicar React,
// etc. al cruzar el límite del proyecto).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.extraNodeModules = {
  "@shared": sharedLib,
};

module.exports = config;
