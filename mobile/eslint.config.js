// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const path = require("path");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
    settings: {
      // Resuelve el alias `@shared` (lógica pura compartida con la web, ../src/lib)
      // para eslint-plugin-import; Metro/Babel ya lo resuelven en runtime.
      "import/resolver": {
        alias: {
          map: [["@shared", path.resolve(__dirname, "..", "src", "lib")]],
          extensions: [".js", ".jsx", ".json"],
        },
      },
    },
  },
]);
