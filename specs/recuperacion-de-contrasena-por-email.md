---
title: Recuperación de contraseña por email
status: implemented
priority: high
---

> **Implementado 2026-09-10.** Falta el único paso manual: la config de URLs en
> el dashboard de Supabase (ver primer criterio). Sin eso el link del mail sigue
> cayendo al Site URL viejo.

## Summary

Hoy el flujo "¿Olvidaste tu contraseña?" está roto de punta a punta. Un
apoderado, Room Parent o Super Admin que no recuerda su clave pide el email de
reseteo y lo recibe, pero el link del correo lo lleva a `http://localhost:3000`
("This site can't be reached") porque Supabase, al no encontrar el `redirectTo`
en su lista blanca, cae al Site URL viejo de desarrollo. Y aun arreglando ese
redirect, ni la web ni la app tienen una pantalla para efectivamente escribir la
contraseña nueva: la web loguearía al usuario en silencio sin pedirle nada y la
app mobile ni siquiera puede abrir sesión desde ese link.

Esta feature hace que el flujo funcione: el usuario pide el reseteo, recibe el
mail, toca el link y cae en una pantalla "Crear nueva contraseña" dentro de la
web (`www.tribbu.ar/app`), la define y ya puede entrar. Los usuarios de la app
mobile abren ese mismo link en el navegador, cambian la clave y vuelven a la app
a loguearse con la nueva.

## Acceptance Criteria

- [ ] **Config de Supabase (paso manual — PENDIENTE)**: en Authentication → URL
      Configuration, Site URL = `https://www.tribbu.ar/app` y Redirect URLs
      incluye `https://www.tribbu.ar/app` y `https://www.tribbu.ar/app/**`.
      Documentado en `.env.example`, `CLAUDE.md` y este spec.
- [x] La web (`src/features/auth/index.jsx` → `enviarReset`) manda
      `resetPasswordForEmail` con `redirectTo` = `window.location.origin + "/app"`
      en prod, cae a `WEB_APP_URL` (`src/lib/appUrl.js`) en localhost.
- [x] La app mobile (`mobile/features/auth/index.jsx` → `enviarReset`) manda
      `redirectTo: WEB_APP_URL` (`@shared/appUrl`) en vez de
      `Linking.createURL("/")`. El link ya no cae al Site URL ni reentra a la app.
- [x] Cuando la web (`/app`) carga con una sesión de recovery (evento
      `PASSWORD_RECOVERY` de `onAuthStateChange`, o `type=recovery` en el hash),
      `App.jsx` muestra `<NuevaPasswordRecovery/>` en lugar del login o la app.
- [x] Esa pantalla: campos "Nueva contraseña" y "Repetir", mínimo 6 caracteres,
      deben coincidir; llama a `supabase.auth.updateUser({ password })`.
- [x] Con éxito: pantalla "Contraseña actualizada" + botón "Ir a la app" que
      limpia el hash y recarga → el bootstrap levanta la sesión persistida, sin
      re-login.
- [x] Con link vencido/ya usado (`updateUser` devuelve error de sesión): estado
      "El enlace expiró o ya se usó" + botón "Volver al inicio". Verificado en QA
      con un token falso.
- [x] La confirmación "Revisá tu correo" (web + mobile) aclara que el link abre
      en el navegador y vence en 1 hora; mobile agrega que se vuelve a la app.
- [x] La pantalla de recovery usa la estética del login (gradiente oscuro,
      `Wordmark`), sin scroll horizontal a 375px (verificado), y se renderiza
      antes de las tres layouts. Super Admin incluido (misma Auth, sin rol).
- [x] El "Cambiar contraseña" in-app existente queda intacto (no se tocó).
- [x] Pedir el reseteo con un email no registrado sigue devolviendo éxito
      (verificado en QA — muestra "Revisá tu correo").
- [x] Mobile verificado en emulador Android (APK debug): "Restablecer
      contraseña" → mail → "Enviar link" → nueva copia; "Volver al inicio" vuelve
      al login; sin crashes.

## Technical Notes

- **Web — detección de recovery** (`src/App.jsx`): estado `recoveryMode`
  inicializado de forma lazy leyendo `window.location.hash`
  (`useState(() => /type=recovery/.test(window.location.hash))`). Además,
  suscribirse en un `useEffect` con cleanup a
  `supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setRecoveryMode(true); })`
  y `data.subscription.unsubscribe()` al desmontar. El guard de render
  `if (recoveryMode) return <NuevaPasswordRecovery .../>` va por encima de las
  ramas `authLoading` / `usuario` / layouts.
  [skill: vercel-react-best-practices — suscripción en effect con cleanup, sin
  setState síncrono en el cuerpo del effect, lectura del hash como estado inicial
  lazy]
- **Web — pantalla**: nuevo componente exportado desde
  `src/features/auth/index.jsx` (`NuevaPasswordRecovery`), o `CambiarPasswordModal`
  reusado a pantalla completa. Estilos inline con tokens `T` de
  `src/lib/theme.js`, mismo patrón que `Login`. Tras `updateUser` OK:
  `history.replaceState(null, "", "/app")`, `setRecoveryMode(false)`, y disparar
  la carga del row `usuarios` (o dejar que el bootstrap la tome).
- **Web — cliente Supabase** (`src/supabase.js`): hoy `createClient` no pasa
  opciones de `auth`. Hacer explícito
  `auth: { detectSessionInUrl: true, flowType: "implicit" }` — es el default
  actual y es lo que hace funcionar el `#access_token…&type=recovery`; fijarlo
  evita que un bump de `@supabase/supabase-js` cambie a PKCE en silencio (PKCE
  usaría `?code=` + `exchangeCodeForSession`, otro flujo).
- **Mobile** (`mobile/features/auth/index.jsx`): solo cambia el `redirectTo` de
  `enviarReset` y la copia de la confirmación. `mobile/lib/supabase.js` NO se
  toca (`detectSessionInUrl:false` se queda — el link no reentra a la app). Sin
  módulos nativos nuevos, sin `expo prebuild`, sin rebuild.
  [skill: vercel-react-native-skills — sin cambios nativos]
- **URL de producción**: constante hardcodeada (RN no tiene `window.location`).
  Un solo lugar, con comentario. La web puede derivarla de `window.location.origin`
  en prod pero conviene la misma constante para consistencia y para no romper en
  `npm run dev` (donde el origin es `localhost:5173` y `/app` no existe sin el
  rewrite de `vercel.json`).
- **Sin Edge Function**: `resetPasswordForEmail` y `updateUser` son llamadas con
  anon key, alcance del propio usuario. No entra la service-role key.
- **Sin cambios de schema**: alcance por `usuario` (Auth user), sin scoping por
  `curso` / `hijo`. No toca `usuarios` ni ninguna tabla.
- **Email template**: la plantilla "Restablecer contraseña" ya está
  personalizada en español (ver captura) — no se cambia. Confirmar el expiry del
  link de recovery en Auth (default 3600s).
- **QA con agent-browser**: disparar `resetPasswordForEmail` contra una cuenta de
  prueba, sacar el link del inbox / logs de Supabase, abrirlo, verificar que
  renderiza la pantalla de recovery y que `updateUser` funciona, después loguear
  con la clave nueva. Probar también link vencido/reusado. tribbu no tiene test
  suite — la validación es lint + build + QA manual en la app corriendo.
  [skill: agent-browser]

## Out of Scope

- Deep-link nativo de recovery hacia la app (`tribbu://`) — los links de mobile
  se completan en el navegador. Posible mejora futura.
- Rediseñar la plantilla o la copia del email de reseteo (ya está personalizada).
- Rate-limiting / captcha en el pedido de reseteo más allá de los límites
  propios de Supabase.
- Login sin contraseña / magic link.
- Forzar cambio de contraseña en el primer login o en cuentas creadas por admin.
- Una ruta/página `/reset` separada en la web — se maneja dentro del SPA `/app`.
- 2FA / MFA.
- Sacar el import legacy de `bcryptjs` en `features/auth` (TODO aparte).
