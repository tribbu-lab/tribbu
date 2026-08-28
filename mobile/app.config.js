// Config de la app Expo (iOS + Android).
// La env llega por EXPO_PUBLIC_* (ver .env.example) — solo la anon key del lado
// cliente; la service-role key NUNCA va en mobile/.

import { existsSync } from "fs";

// FCM (push en Android): google-services.json no se commitea. En EAS llega como
// file env var GOOGLE_SERVICES_JSON (la env contiene la RUTA al archivo que EAS
// materializa en el worker); local, se usa el archivo suelto si existe. Si no
// hay ninguno, se omite la key para no romper builds previas al setup de Firebase.
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ??
  (existsSync("./google-services.json") ? "./google-services.json" : undefined);

export default {
  expo: {
    name: "tribbu",
    slug: "tribbu",
    owner: "albatross-tech",
    scheme: "tribbu",
    version: "1.3.0",
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
      // false a propósito: la app es phone-first y con true App Store Connect
      // exige capturas de iPad 13" para enviar a revisión.
      supportsTablet: false,
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
        // Foreground con el glifo dentro de la safe zone circular (66/108):
        // derivado de assets/icon.png escalado ~53% sobre canvas #0F172A —
        // el arte full-bleed directo dejaría el punto azul fuera de la máscara.
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0F172A",
      },
      ...(googleServicesFile ? { googleServicesFile } : {}),
      // Splash propio de Android: el estilo de Android 12+ SIEMPRE referencia
      // @drawable/splashscreen_logo, y prebuild solo lo genera si hay `image`
      // — con el splash top-level (solo color, como iOS) el build falla en
      // aapt ("resource drawable/splashscreen_logo not found"). El glifo va
      // sobre transparente, padded para la máscara circular ~Ø192dp (se dibuja
      // contain a 200dp sobre canvas de 288dp).
      splash: {
        image: "./assets/splash-icon.png",
        backgroundColor: "#0F172A",
        resizeMode: "contain",
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
          // Solo fotos, nunca video: sin esto Android pide RECORD_AUDIO y
          // complica la declaración de permisos en Play sin necesidad.
          microphonePermission: false,
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
      [
        // Desbloqueo con huella/Face ID (ver specs/desbloqueo-con-huella-digital.md).
        // Sin este string en Info.plist, iOS rechaza el pedido de Face ID.
        "expo-local-authentication",
        {
          faceIDPermission: "tribbu usa Face ID para desbloquear la app más rápido.",
        },
      ],
      // iOS: abre "Google Calendar" (render?cid=) en un SFSafariViewController
      // — los universal links no se disparan ahí, así que la app nativa de
      // Google Calendar no puede interceptar la URL (en Android exactamente
      // esa intercepción vía App Links hundió el atajo web, y por eso allá la
      // opción Google es una suscripción guiada desde una computadora — ver
      // BotonAgregarCalendario.jsx).
      "expo-web-browser",
      [
        // Android, opción "Calendario del dispositivo": crea un calendario
        // "Tribbu" local y escribe ahí los eventos del feed vía CalendarContract
        // (ver mobile/lib/calendarSync.js + specs/eleccion-de-calendario-mobile.md).
        // Agrega READ/WRITE_CALENDAR al manifest. El string de permiso es para
        // iOS (NSCalendarsUsageDescription) por si el flujo se extiende allá —
        // hoy iOS no lo usa: su "calendario del dispositivo" es webcal://.
        "expo-calendar",
        {
          calendarPermission:
            "tribbu escribe los eventos del curso en tu calendario para que los veas sin abrir la app.",
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
