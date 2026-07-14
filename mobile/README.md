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

> Solo la **anon key** llega al cliente. La service-role key nunca va en `mobile/`.

## Builds (EAS)

```bash
npx eas login
npx eas init                  # crea projectId (se inyecta en app.config.js > extra.eas)
npx eas build -p ios          # binario iOS
npx eas build -p android      # binario Android
```

## Backend pendiente (correr una vez)

1. **Tabla de push tokens** — ejecutar `supabase/push_tokens.sql` en el SQL editor de Supabase.
2. **Edge Function `send-push`** — migrar a la Expo Push API usando
   `supabase/send-push.reference.ts` como guía (copiar a
   `supabase/functions/send-push/index.ts` del proyecto de funciones y
   `supabase functions deploy send-push`). El `payload.type` se conserva para el
   deep-link (ver `push/useNotificationRouting.js`).

## Estado (milestone 1)

Portadas a RN: **Login/registro/cambiar contraseña, sesión + modelo "Mi acceso",
navegación (tabs + super), push (registro + deep-link), Muro/Inicio y
Recordatorios**. El resto de las features (Calendario, Comedor, Cumpleaños,
Colectas, Info Útil, Contacto, Alumnos, Admin, Super Admin) quedan como
placeholders navegables y se portan en sesiones de seguimiento.

## QA

No hay simulador/emulador en CI; validar manualmente en simulador iOS + emulador
Android. `npm run lint` corre `expo lint`.
