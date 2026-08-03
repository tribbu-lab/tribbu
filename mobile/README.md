# tribbu mobile (Expo · iOS + Android)

App nativa React Native (Expo managed) que comparte la lógica pura de la web
(`../src/lib`) vía Metro `watchFolders` (alias `@shared`). No toca la app web.

## Setup

```bash
cd mobile
npm install
cp .env.example .env          # completar EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
npx expo start                # dev (Expo Go o development build)
```

Emulador Android local (build nativo debug + Metro; genera `android/`, que está
gitignoreado a propósito — si llegara al repo/EAS, el build cloud pasaría a
bare workflow):

```bash
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 &
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
npx expo run:android
```

Simulador iOS local (requiere Xcode; genera `ios/`, gitignoreado por el mismo
motivo que `android/`):

```bash
npx expo run:ios                                  # usa el simulador default
npx expo run:ios --device "iPhone 17 Pro"         # o elegir uno de xcrun simctl list devices
```

En ambos casos el build debug queda instalado y conectado a Metro; las corridas
siguientes solo necesitan `npx expo start --dev-client` si el nativo no cambió.
Si el puerto 8081 está ocupado, `--port 8082` y abrir la app con el deep link
`tribbu://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082`.

> Solo la **anon key** llega al cliente. La service-role key nunca va en `mobile/`.

## Builds y distribución (EAS)

El CLI no está instalado como dependencia: usar `npx -y eas-cli@latest <cmd>`
desde `mobile/` (la sesión de `eas login` vive en `~/.expo` y se comparte).

```bash
npx -y eas-cli@latest build -p ios --profile production      # .ipa firmado
npx -y eas-cli@latest build -p android --profile production  # .aab firmado
npx -y eas-cli@latest submit -p ios --latest      # → App Store Connect / TestFlight
npx -y eas-cli@latest submit -p android --latest  # → Google Play, track interno
```

El perfil `production` auto-incrementa la versión nativa en el server de EAS
(`appVersionSource: remote`) y **toda la firma la gestiona EAS** (certs de iOS
y keystore de Android generados/guardados remotos — no hay secretos de firma en
el repo). Los ids de destino viven en `eas.json > submit` (`ascAppId` para App
Store, `track: internal` para Play). El perfil `preview` genera binarios de
distribución interna (en Android, APK instalable directo en el dispositivo).

### Android — setup one-time

1. **Push (FCM V1)** — sin esto la app funciona pero no recibe push (falla
   `getExpoPushTokenAsync`):
   - En [Firebase console](https://console.firebase.google.com): crear proyecto →
     agregar app Android `com.tribbu.app` → descargar `google-services.json` a
     `mobile/` (gitignoreado; `app.config.js` lo usa solo si existe).
   - Para los builds de EAS: subir ese archivo como **file env var**
     `GOOGLE_SERVICES_JSON` en expo.dev → proyecto tribbu → Environment
     variables (environments `production` y `preview`).
   - Clave del servidor: Firebase console → Project settings → Service
     accounts → *Generate new private key*, y subirla con
     `npx -y eas-cli@latest credentials -p android` → Google Service Account
     → FCM V1.
2. **Google Play** — crear la app `com.tribbu.app` en la
   [Play Console](https://play.google.com/console). Con la app creada en la
   consola, `eas submit` puede subir incluso la primera `.aab` vía API (la
   restricción de Google aplica a crear la *app*, no la primera release —
   verificado 2026-07: la release inicial 1.0.0/vc4 entró por API al track
   interno). Para el submit: habilitar la **Google Play Android Developer API**
   en el proyecto GCP del service account, invitarlo en Play Console → Users &
   permissions con permisos de release, y guardar su clave JSON como
   `mobile/play-service-account.json` (gitignoreado; la ruta ya está en
   `eas.json > submit.production.android`). Sirve reusar la clave del
   firebase-adminsdk (mismo proyecto GCP) — es la que quedó configurada.

## Backend one-time (si aún no corrió)

1. **Tabla de push tokens** — ejecutar `supabase/push_tokens.sql` en el SQL
   editor de Supabase.
2. **Edge Function `send-push`** — vive en `../supabase/functions/send-push/`
   (Expo Push API); desplegar con `supabase functions deploy send-push`. El
   `payload.type` se conserva para el deep-link (ver
   `push/useNotificationRouting.js`).

## Estado

Todas las features están portadas a RN (el detalle y los gaps menores están en
la sección "Mobile app" de `../CLAUDE.md`). iOS se distribuye vía
TestFlight; Android vía Google Play (track interno), con el setup one-time de
arriba.

## QA

No hay simulador/emulador en CI; validar manualmente en simulador iOS + emulador
Android. `npm run lint` corre `expo lint`.
