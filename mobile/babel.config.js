module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          // `@shared` apunta a la lógica pura compartida con la web (../src/lib).
          // No se duplica: el mismo archivo alimenta web (Vite) y mobile (Metro).
          alias: {
            "@shared": "../src/lib",
          },
        },
      ],
      // worklets debe ir último (Reanimated 4 movió el plugin a react-native-worklets)
      "react-native-worklets/plugin",
    ],
  };
};
