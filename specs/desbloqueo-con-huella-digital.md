---
title: Desbloqueo con huella digital
status: implemented
priority: medium
---

## Summary

Hoy, cada vez que un apoderado o Room Parent abre la app mobile de tribbu,
entra directo a su Muro sin ninguna verificación local — la sesión de
Supabase ya persiste entre reinicios. Esta feature agrega un candado local
opcional: al activarlo, abrir la app pide huella digital o Face ID antes de
mostrar cualquier contenido, en vez de entrar directo — más rápido que
escribir usuario y contraseña, y un resguardo extra si alguien más agarra
el teléfono desbloqueado. No cambia cómo se guarda o renueva la sesión de
Supabase, solo agrega una verificación local antes de mostrarla.

## Acceptance Criteria

- [x] Nueva dependencia `expo-local-authentication` (instalada vía
      `npx expo install`, versión resuelta contra el SDK del proyecto).
- [x] Toggle "Desbloqueo con huella/Face ID" en Más → Cuenta, junto a
      "Cambiar contraseña"/"Cerrar sesión". **Apagado por defecto** (opt-in).
- [x] Al intentar activarlo, se verifica que el dispositivo tenga hardware
      biométrico y algo enrolado (`hasHardwareAsync` + `isEnrolledAsync`).
      Si no, el toggle no se activa y se explica por qué ("Tu dispositivo no
      tiene huella/Face ID configurado").
- [x] La preferencia se guarda localmente por usuario (AsyncStorage, clave
      `biometric_enabled_<usuario.id>` — no es información sensible, es solo
      un booleano de UI) — no se manda al servidor.
- [x] Con la preferencia activada y una sesión válida: al abrir la app en
      frío, antes de mostrar el contenido (tabs o Super Admin) aparece una
      pantalla de bloqueo pidiendo autenticación biométrica.
- [x] Autenticación exitosa → pasa directo al contenido. La sesión de
      Supabase es la misma de siempre — no se re-loguea ni se toca el token.
- [x] Si la biometría falla, se cancela, o no está disponible en ese
      momento: botón "Ingresar con contraseña" que lleva al login normal ya
      existente (mismo `signInWithPassword` de siempre, vía un `onSuccess`
      opcional agregado a `Login` — no se inventa un mecanismo nuevo).
- [x] Sin sesión activa, o con la preferencia desactivada: comportamiento
      idéntico al actual (va directo, o pide login normal si no hay sesión).
- [x] Aplica igual a los dos flujos que arrancan desde el mismo gate raíz
      (`(tabs)` para apoderado/admin y `(super)` para Super Admin) — el hook
      vive en `RootNavigator`, antes de la rama que decide entre ambos.
- [x] Se ve bien en pantalla angosta y respeta `env(safe-area-inset-*)`
      (`useSafeAreaInsets`, mismo patrón que el resto de las pantallas de
      auth) — *revisado por código, no verificado visualmente en dispositivo
      (ver nota de validación abajo)*.

**Nota de validación**: `cd mobile && npm run lint` y `npx expo export -p
ios` corrieron limpios. **No se hizo QA en dispositivo/emulador real** — el
usuario pidió explícitamente no generar la APK todavía, y `expo-local-authentication`
es una dependencia **nativa nueva**: la carpeta `mobile/android/` (gitignoreada,
generada por prebuild) fue construida antes de agregar esta dependencia, así
que necesita un `expo prebuild` (o equivalente) antes de que el próximo build
de la APK realmente incluya el módulo nativo — si se salta ese paso, el botón
de biometría fallaría en tiempo de ejecución aunque el JS compile bien. Ese
prebuild también borra el fix de `debuggableVariants = []` en
`android/app/build.gradle` (ver memoria de la sesión) — hay que reaplicarlo
antes del siguiente `gradlew assembleDebug`.

## Technical Notes

- Hook del candado: `mobile/app/_layout.jsx` → `RootNavigator`, justo
  después de que `authLoading` resuelve y hay `usuario` — antes de navegar a
  `(tabs)`/`(super)`. Estado en memoria (`desbloqueado`), **no persistido**:
  cada apertura en frío vuelve a pedir biometría si la preferencia está
  activa. Re-lock al volver del background queda fuera de alcance v1 (ver
  Out of Scope) — se podría enganchar más adelante al mismo listener de
  `AppState` que ya usa `mobile/lib/supabase.js` para el auto-refresh.
- Nuevo componente `mobile/components/BiometricGate.jsx` (pantalla completa,
  estilo consistente con `mobile/features/auth` — logo + mensaje + botón
  "Reintentar" + fallback "Ingresar con contraseña").
- Nuevo helper `mobile/lib/biometricPref.js` (mismo patrón que
  `mobile/lib/hijoColors.js`: AsyncStorage, funciones síncronas con caché en
  memoria) para leer/guardar la preferencia.
- Toggle en `mobile/app/(tabs)/mas.jsx`, card "Cuenta" (línea ~99), mismo
  estilo que las filas de "Cambiar contraseña"/"Cerrar sesión".
- `expo-local-authentication`: `LocalAuthentication.authenticateAsync({
  promptMessage: "Ingresá con tu huella o Face ID" })`. Puede necesitar un
  entry en el plugin array de `app.config.js` para el string de uso de
  Face ID en iOS (`NSFaceIDUsageDescription`) — confirmar contra la doc del
  paquete al implementar.
- [skill: vercel-react-native-skills — uso de un módulo nativo nuevo,
  revisar cold-start/rendimiento del gate].

## Out of Scope

- Cambiar cómo persiste o se renueva la sesión de Supabase
  (`autoRefreshToken`/`AsyncStorage` quedan como están).
- Re-bloquear al volver del background (solo se pide en apertura en frío
  esta primera versión).
- Aplicar el candado a operaciones puntuales sensibles (cambiar contraseña,
  eliminar cuenta) — siguen sin cambios.
- Web (no hay biometría de navegador en este alcance).
- PIN o patrón como alternativa si el dispositivo no tiene biometría — el
  único fallback es la contraseña normal.
