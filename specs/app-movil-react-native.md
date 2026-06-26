---
title: App móvil React Native (iOS + Android)
status: in-progress
priority: high
---

> **En progreso** (`mobile/`): fundación + reutilización de `lib/` + auth/sesión +
> modelo "Mi acceso" + navegación + push (cliente + deep-link). **Features
> portadas a RN**: Muro, Recordatorios, Notificaciones in-app, **Calendario,
> Comedor (con carga Excel), Colectas/Finanzas, Contacto/Alumnos e Info Útil**.
> **Faltan**: Cumpleaños, Admin y Super Admin (placeholders navegables) y la
> migración del backend `send-push` a Expo Push API. Pendiente de la persona:
> correr `push_tokens.sql` y deployar `send-push`. Validación: `expo lint` +
> bundle Metro OK; QA en simulador/device es manual.

## Summary

Hoy tribbu es una SPA React + Vite empaquetada como app Android con Capacitor;
no hay app iOS y la experiencia móvil es una webview. Esta tarea crea una app
**React Native (Expo)** nativa que corre en **iOS y Android** desde un solo
código, portando **todas** las features de la comunidad escolar (Muro/Inicio,
Calendario, Comedor, Cumpleaños, Recordatorios, Colectas, Info Útil, Contacto,
Alumnos, Admin, Super Admin y el centro de Notificaciones), respetando el modelo
de "Mi acceso" (un apoderado puede ser padre en un curso y Room Parent en otro,
y existe el Super Admin). La app reutiliza la lógica de negocio agnóstica de
plataforma (`lib/` — Supabase, helpers, tokens de diseño) y reescribe toda la UI
con primitivas nativas. El push deja OneSignal y pasa a **expo-notifications**,
lo que obliga a adaptar el backend `send-push`. El proyecto vive en un nuevo
directorio `mobile/` y no toca la app web existente.

## Acceptance Criteria

### Fundación del proyecto
- [x] Existe un proyecto Expo (managed) en `mobile/` con `app.json`/`app.config.js`,
  `bundleIdentifier` iOS y `package` Android `com.tribbu.app`, configurado para
  **EAS Build** en ambas plataformas; `npx expo start` levanta el proyecto y
  `eas build` produce binarios iOS + Android.
- [x] Variables de entorno vía `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_ONESIGNAL_APP_ID`→(reemplazado por
  config de push) en `.env`/`app.config.js`; **solo** la anon key llega al
  cliente — la service-role key nunca aparece en `mobile/`.
- [x] Navegación con **Expo Router** (o React Navigation): bottom-tab navigator
  + native stack para modales/detalles. La lógica de los **tres layouts web**
  (super / mobile / desktop) colapsa en **un solo layout móvil**; el Super Admin
  ve su propia pila de pantallas, no las tabs de curso.

### Reutilización de lógica compartida (`lib/`)
- [x] Los módulos puros se comparten sin duplicar lógica: tokens de diseño (`T`,
  `ROL_LABEL`, `ROL_COLOR`, `HIJO_COLORS_CUSTOM`, `MESES`) y helpers puros
  (`fmtM`, `fmtF`/`fmtDM`, `dHasta`, `fmtNombre`, `sanitize`, `safeUrl`) se
  consumen desde una fuente única (paquete/carpeta compartida vía Metro
  `watchFolders` o workspace), no se copian a mano.
- [x] El acceso a entorno se abstrae: `lib` deja de leer `import.meta.env`
  directamente y recibe config inyectada, de modo que web (Vite) y mobile (Expo)
  la alimenten cada una a su manera.
- [x] `getHijoColor`/`setHijoColor` (hoy `localStorage`, síncrono) se reimplementan
  sobre **AsyncStorage** en mobile sin romper la firma usada por la web.

### Auth y sesión
- [x] Login con `supabase.auth.signInWithPassword`, "olvidé mi contraseña"
  (`resetPasswordForEmail`), registro con código (`RegistroConCodigo`) y
  `CambiarPasswordModal` funcionan en RN.
- [x] El cliente Supabase usa **AsyncStorage** como `storage`, con
  `autoRefreshToken`, `persistSession`, `detectSessionInUrl:false`, y refresca el
  token según `AppState` (foreground/background); la sesión sobrevive al reinicio
  de la app.
- [x] Operaciones privilegiadas (crear usuario, cambiar email/clave de otro,
  buscar por email) siguen pasando por la Edge Function `manage-auth-user` vía
  `authAdmin.js`; no se agrega la service-role key al cliente.

### Modelo "Mi acceso" y rol efectivo
- [x] Al iniciar sesión se cargan los `items` = hijos del usuario + cursos donde
  es Room Parent; un selector en el header permite cambiar de hijo/curso
  (equivalente al selector horizontal móvil web), incluyendo el color
  personalizado por hijo.
- [x] `rolEfectivo` se deriva por item (`padre`|`admin`); las tabs/acciones de
  admin (Alumnos, Admin, botones de crear) solo aparecen cuando el item activo
  es `admin`. El Super Admin (`usuario.rol==="super"`) ve la experiencia Super.

### Features portadas (paridad funcional con la web)
- [x] **Muro/Inicio**: feed con accesos a colectas/fechas (deep-link interno a
  Finanzas/Calendario), saludo, alertas; admin puede crear alerta.
- [x] **Calendario**: lista/agenda de `eventos`, alta/edición (`EventoModal`) para
  admin, asistencia (`evento_asistencia` / `EventoAsistenciaModal`).
- [x] **Comedor**: ver `menu`; admin carga menú por Excel (`UploadMenuExcel`) vía
  `expo-document-picker` + parseo `xlsx`.
- [ ] **Cumpleaños**: `cumples`, festejos y sus modales (`FestejoModal`,
  `FestejoDetalleModal`, `ResponsableModal`, `ColectaRegaloModal`), incluida la
  colecta de regalo.
- [x] **Recordatorios**: lista de `recordatorios` con leídos/no-leídos
  (`recordatorio_leidos`), badge de no-leídos, alta para admin.
- [x] **Colectas (Finanzas)**: `colectas` + `colecta_pagos`, apertura directa de
  una colecta por deep-link, montos con `fmtM`.
- [x] **Info Útil**: `InfoUtil`, `Libros`, `Útiles`, `Uniformes`; links abren con
  `Linking.openURL` usando `safeUrl`.
- [x] **Contacto / Alumnos**: `Contacto`, `ApoderadosModal`, `Alumnos`; teléfonos
  y mails accionables (`tel:`/`mailto:` vía `Linking`).
- [ ] **Admin**: `AdminPanel` + `AlertaModal` solo para `rolEfectivo==="admin"`.
- [ ] **Super Admin**: `SuperAdmin` y sub-pantallas (`AlertasAdmin`,
  `HorariosAdmin`, `UniformesAdmin`) y cargas Excel (`UploadAlumnosExcel`,
  `UploadApoderadosExcel`) vía document-picker + `xlsx`.
- [x] **Notificaciones (in-app)**: `useNotificaciones` + panel de notificaciones
  con marcar-leído y contador de no-leídos, accesible desde el header.
- [x] Las listas usan el equivalente RN de `useListControls` (búsqueda/orden/
  filtro/paginación) con `FlatList` (no `.map` sobre arrays largos). [skill:
  vercel-react-native-skills]

### Push (expo-notifications)
- [x] La app registra el **Expo push token** al loguear y lo persiste para el
  `usuario` (nueva columna/tabla, ver Notas técnicas); pide permisos en iOS y
  Android con canal de notificaciones Android configurado.
- [x] El click en una notificación navega a la pantalla correcta según su `type`
  (equivalente a `TAB_MAP`: `recordatorio→Recordatorios`, `evento→Calendario`,
  `colecta→Finanzas`, `alerta→Muro`, `festejo→Cumpleaños`), tanto con la app en
  foreground/background como cerrada (cold start).
- [ ] La Edge Function `send-push` se adapta para enviar a **Expo push tokens**
  (Expo Push API) en lugar de OneSignal, conservando `type` + payload para el
  deep-link; `getUserIdsByCurso` sigue resolviendo los destinatarios por curso.

### UI / calidad
- [x] Toda la UI usa primitivas RN (`View`/`Text`/`Pressable`/`TextInput`/
  `Image`/`FlatList`/`Modal`) y `StyleSheet`; los colores salen de `T`, no
  hardcodeados. No hay HTML/DOM ni estilos web (`position:fixed/sticky`,
  `cursor`, `overflowX`, `boxShadow`, `env(safe-area-inset)`).
- [x] Áreas seguras con `react-native-safe-area-context`; toques cómodos
  (≥44pt); la app es usable en pantallas chicas y con notch/Dynamic Island.
- [x] Entrada de usuario saneada con `sanitize` y links con `safeUrl` antes de
  `Linking.openURL`.
- [ ] La app compila y corre en simulador iOS y emulador Android; el lint de
  `mobile/` pasa.

## Technical Notes

- **Stack**: Expo SDK (managed) + EAS Build; navegación Expo Router (bottom tabs
  + native stack). Hermes con Intl habilitado para `toLocaleDateString("es-AR")`
  y `toLocaleString("es-AR")` que usan `fmtF`/`fmtM`; si Intl no está disponible,
  polyfill o formateo manual.
- **Supabase en RN**: `createClient(url, anon, { auth: { storage: AsyncStorage,
  autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }})`;
  manejar `AppState` para `startAutoRefresh/stopAutoRefresh`. Las features siguen
  consultando Supabase directamente (sin store global), recibiendo `cursoId`,
  `userId`, `isAdmin` por props/contexto, igual que en la web.
- **Compartir `lib/`**: extraer los módulos puros (theme tokens, helpers puros) a
  una ubicación consumible por ambos proyectos (Metro `watchFolders` apuntando a
  `../src/lib`, o un workspace `packages/shared`). Inyectar adaptadores de
  plataforma para: **env** (Vite `import.meta.env` vs Expo `process.env.
  EXPO_PUBLIC_*`), **storage** (`localStorage` vs AsyncStorage) y **push**.
  Evitar el patrón "standalone copy" para no duplicar lógica.
- **Mapeo web→RN**: `div→View`, `span/p→Text`, `button→Pressable`,
  `input→TextInput`, `img→Image`, `a→Pressable+Linking`, `onClick→onPress`,
  `style={{}}` inline→`StyleSheet`/array de estilos. Modales web (overlay
  `position:fixed`) → componente `Modal` de RN o pantallas de stack. Sombras →
  `elevation` (Android) + `shadow*` (iOS).
- **Listas**: portar `useListControls` a un hook RN (misma API
  search/sort/filter/paginate) y renderizar con `FlatList`/`SectionList` con
  `keyExtractor` y memo de items para evitar re-renders. [skill:
  vercel-react-native-skills, vercel-react-best-practices]
- **Excel**: las cargas (`menu`, alumnos, apoderados, uniformes) usan
  `expo-document-picker` para elegir el `.xlsx`, lectura como base64/ArrayBuffer
  y la misma lib `xlsx` ya presente en el repo.
- **Push / data model**: `expo-notifications` para permisos, token y listeners
  (`addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync`
  para cold start). Persistir el Expo token por dispositivo: **nueva columna**
  `usuarios.expo_push_token` o **nueva tabla** `push_tokens(usuario_id, token,
  platform, updated_at)` (preferible para multi-dispositivo). La Edge Function
  `send-push` (fuera de este repo) debe migrar a la **Expo Push API**; `payload`
  debe seguir incluyendo `type` para el deep-link. Datos de notificación in-app
  (`useNotificaciones`) no cambian de esquema.
- **Roles/navegación**: replicar `TABS` condicionando Alumnos/Admin a
  `rolEfectivo==="admin"`; Super Admin como flujo aparte. Selector de hijo/curso
  en el header (equivalente al selector horizontal móvil), con color por hijo
  desde AsyncStorage.
- **QA**: validar en simulador iOS + emulador Android. Para humo de la versión
  web actual se puede usar agent-browser, pero la app RN se prueba en simulador/
  device (agent-browser no cubre nativo). [skill: agent-browser]
- **No se toca la app web** (`src/`) salvo la refactor mínima para que `lib/`
  reciba env inyectado en vez de leer `import.meta.env` directo.

## Out of Scope

- Reescribir o eliminar la app web React + Vite ni el wrapper Capacitor/Android
  existente — la web sigue funcionando igual.
- Crear/cambiar el backend Supabase más allá de: (a) almacenar el Expo push
  token y (b) adaptar `send-push` a Expo. Sin renombrar tablas ni migrar datos.
- Remover OneSignal del proyecto Android Capacitor heredado (puede convivir hasta
  retirar la web móvil).
- Paridad pixel-perfect con la web; el objetivo es **paridad funcional** con UI
  nativa idiomática, no clonar los layouts desktop/super.
- CI/CD, publicación en App Store / Play Store, code-signing automatizado y OTA
  updates (EAS Update) — se asume configuración manual de build.
- Tests automatizados (el repo no tiene suite); validación es lint + build +
  QA manual en simulador/device.
- Quitar el legacy `bcryptjs` de `features/auth`.
