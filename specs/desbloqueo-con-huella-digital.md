---
title: Desbloqueo con huella digital
status: draft
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

- [ ] Nueva dependencia `expo-local-authentication`.
- [ ] Toggle "Desbloqueo con huella/Face ID" en Más → Cuenta, junto a
      "Cambiar contraseña"/"Cerrar sesión". **Apagado por defecto** (opt-in).
- [ ] Al intentar activarlo, se verifica que el dispositivo tenga hardware
      biométrico y algo enrolado (`hasHardwareAsync` + `isEnrolledAsync`).
      Si no, el toggle no se activa y se explica por qué ("Tu dispositivo no
      tiene huella/Face ID configurado").
- [ ] La preferencia se guarda localmente por usuario (AsyncStorage, clave
      `biometric_enabled_<usuario.id>` — no es información sensible, es solo
      un booleano de UI) — no se manda al servidor.
- [ ] Con la preferencia activada y una sesión válida: al abrir la app en
      frío, antes de mostrar el contenido (tabs o Super Admin) aparece una
      pantalla de bloqueo pidiendo autenticación biométrica.
- [ ] Autenticación exitosa → pasa directo al contenido. La sesión de
      Supabase es la misma de siempre — no se re-loguea ni se toca el token.
- [ ] Si la biometría falla, se cancela, o no está disponible en ese
      momento: botón "Ingresar con contraseña" que lleva al login normal ya
      existente (mismo `signInWithPassword` de siempre) — no se inventa un
      mecanismo nuevo de reautenticación.
- [ ] Sin sesión activa, o con la preferencia desactivada: comportamiento
      idéntico al actual (va directo, o pide login normal si no hay sesión).
- [ ] Aplica igual a los dos flujos que arrancan desde el mismo gate raíz
      (`(tabs)` para apoderado/admin y `(super)` para Super Admin).
- [ ] Se ve bien en pantalla angosta y respeta `env(safe-area-inset-*)`
      como el resto de las pantallas de auth.

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
