// Config de la app Expo (iOS + Android).
// La env llega por EXPO_PUBLIC_* (ver .env.example) — solo la anon key del lado
// cliente; la service-role key NUNCA va en mobile/.

export default {
  expo: {
    name: "tribbu",
    slug: "tribbu",
    owner: "albatross-tech",
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
      // Ícono de la app: versión full-bleed (cuadrado opaco #0F172A) derivada de
      // assets/icon.png de la raíz — iOS aplica su propia máscara de esquinas, y
      // el arte original trae esquinas redondeadas que dejarían bordes blancos.
      icon: "./assets/icon.png",
      supportsTablet: true,
      infoPlist: {
        // Solo HTTPS estándar → exenta de reportes de cifrado; evita el estado
        // "Missing Compliance" en cada build de TestFlight.
        ITSAppUsesNonExemptEncryption: false,
      },
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
      // Provee el módulo nativo ExpoFontLoader que @expo/vector-icons necesita
      // para cargar las fuentes de íconos (MaterialCommunityIcons).
      "expo-font",
      [
        // Reemplaza el ícono single-size por el set multi-tamaño: sin las
        // renditions chicas, iOS muestra un ícono en blanco en la notificación
        // en builds de desarrollo (ver plugins/withMultiSizeAppIcon.js).
        "./plugins/withMultiSizeAppIcon",
        { icon: "./assets/icon.png" },
      ],
      [
        // media.js pide permiso de fototeca (subida de invitaciones de cumples);
        // sin este string en Info.plist, iOS crashea al pedirlo.
        "expo-image-picker",
        {
          photosPermission:
            "tribbu usa tus fotos para subir imágenes como la invitación de un festejo.",
          cameraPermission:
            "tribbu usa la cámara para adjuntar fotos en el curso.",
        },
      ],
      [
        "expo-notifications",
        {
          // Small icon de notificación Android: OBLIGATORIO blanco sobre
          // transparente (Android lo tiñe con `color`); sin él, la notificación
          // muestra un cuadrado blanco. Derivado de assets/icon.png (raíz).
          // iOS no tiene ícono de notificación configurable: usa el de la app.
          icon: "./assets/notification-icon.png",
          color: "#0F172A",
        },
      ],
    ],
    extra: {
      // EAS project id (@albatross-tech/tribbu). No es secreto; va hardcodeado
      // porque EAS CLI NO lee .env al evaluar esta config (Expo CLI sí) — si solo
      // viviera en .env, `eas credentials`/builds resolverían otro proyecto y el
      // push token del device no matchearía las credenciales APNs.
      eas: {
        projectId:
          process.env.EAS_PROJECT_ID || "2ea926f7-ce30-4104-a54c-2c5756902a52",
      },
    },
    experiments: {
      typedRoutes: false,
    },
  },
};
