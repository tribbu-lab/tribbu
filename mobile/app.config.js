// Config de la app Expo (iOS + Android).
// La env llega por EXPO_PUBLIC_* (ver .env.example) — solo la anon key del lado
// cliente; la service-role key NUNCA va en mobile/.

export default {
  expo: {
    name: "tribbu",
    slug: "tribbu",
    scheme: "tribbu",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      backgroundColor: "#0F172A",
      resizeMode: "contain",
    },
    ios: {
      bundleIdentifier: "com.tribbu.app",
      supportsTablet: true,
      // Team personal (Apple Development: nicolasalbani@gmail.com) para firmar
      // builds locales de desarrollo con `expo run:ios --device`.
      appleTeamId: "54M3L8C3D3",
    },
    android: {
      package: "com.tribbu.app",
      adaptiveIcon: {
        backgroundColor: "#0F172A",
      },
      // Canal de notificaciones se crea en código (push/register.js)
    },
    plugins: [
      "expo-router",
      [
        "expo-notifications",
        {
          // icon/color del ícono de notificación Android
          color: "#0F172A",
        },
      ],
    ],
    extra: {
      // EAS project id se completa al correr `eas init`
      eas: { projectId: process.env.EAS_PROJECT_ID || undefined },
    },
    experiments: {
      typedRoutes: false,
    },
  },
};
