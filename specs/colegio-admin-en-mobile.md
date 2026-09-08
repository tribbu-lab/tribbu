---
title: Soporte de colegio_admin en la app mobile
status: implemented
priority: medium
---

> **Estado (2026-09-08):** implementado, validado con `expo lint` + `npx expo
> export -p ios` limpios, y **QA en vivo OK** — probado en un APK real con la
> cuenta `colegio_admin` "Administrador St John's School Sede Pilar": el panel
> abre con los 11 módulos y funciona bien. El rol `super` en mobile sigue
> fuera de alcance (documentado).

## Summary

La feature multi-colegio (`specs/multi-colegio.md`) dejó el rol **`colegio_admin`** — un
administrador acotado a **su** colegio, con el mismo alcance funcional que tenía el Super
Admin de siempre — funcionando **solo en la web**. En la app mobile, un `colegio_admin` que
inicia sesión cae en la vista normal de apoderado (`/(tabs)/muro`), porque la navegación
solo enruta al panel de administración a los usuarios con `rol === "super"`. Resultado: no
ve Comunicaciones, ni la carga de cursos, maestros, alumnos, códigos, horarios, uniformes,
alertas ni menú — nada de su trabajo diario. Esta feature enruta al `colegio_admin` al
panel de administración de mobile (`mobile/features/superadmin`), con una **rama propia
distinta de `super`**: sin la (inexistente en mobile) sección "Plataforma", sin el toggle
"Super Admin" en el alta de usuarios, y acotado a su `colegio_id` por RLS sin ningún filtro
de cliente. Además agrega a mobile el módulo **"🏫 Colegio"** (datos de contacto del
colegio: teléfono, dirección, horarios, sitio web, logo), hoy también web-only.

El rol `super` en mobile queda **fuera de alcance**: hoy ve un panel sin scoping y sin
selector de colegio, y con un solo colegio real eso es inofensivo — se documenta como
brecha conocida, no se toca en este spec.

## Acceptance Criteria

**Navegación / enrutado**
- [x] `mobile/context/Session.jsx` expone un flag nuevo — p. ej. `esColegioAdmin`
      (`usuario?.rol === "colegio_admin"`) — junto al `isSuper` existente.
- [x] `mobile/app/_layout.jsx` (`RootNavigator`): un `colegio_admin` se enruta al stack de
      administración, **no** a `/(tabs)`. Reutiliza el grupo `(super)` (es una carpeta de
      ruta, no un permiso) o uno nuevo; la decisión de routing usa
      `isSuper || esColegioAdmin`.
- [x] Un `colegio_admin` **nunca** ve las tabs de apoderado ni el `AppHeader`/selector de
      hijos, aunque tenga hijos vinculados — mismo criterio que la web (`super`/
      `colegio_admin` ven **solo** `<SuperAdmin/>`, `src/App.jsx:372`).
- [x] `useSession().isSuper` sigue siendo **exclusivamente** `rol === "super"` — no se le
      cuela `colegio_admin` (para no activar lógica de plataforma en ningún lado).
- [x] El candado biométrico (`BiometricGate`) sigue funcionando igual para este rol (se
      evalúa antes del routing, no lo afecta).

**Panel — rama `colegio_admin` en `mobile/features/superadmin/index.jsx`**
- [x] El componente `SuperAdmin` recibe/deriva el rol y ramifica:
  - [x] Header (`app/(super)/index.jsx` y/o el `titleRow` interno) muestra
        **"Admin del colegio"** en vez de "Super Admin", con el color ámbar de
        `ROL_COLOR.colegio_admin` (no el violeta de `super`).
  - [x] El subtítulo deja de decir "Gestión global…" (no es global) — algo como
        "Gestión de {nombre del colegio}".
  - [x] Las stats del home del panel siguen teniendo sentido acotadas al colegio
        (Apoderados / Room Parents / Inactivos / Cursos) — no requieren cambio de query,
        RLS ya las acota.
- [x] Módulos visibles para `colegio_admin`: **Apoderados, Maestros, Alumnos, Códigos,
      Cursos, Horarios, Uniformes, Alertas, Comunicaciones, Menú, Colegio** (todos los de
      `SECCIONES` + el nuevo grupo/módulo "Colegio"). Ninguna sección "Plataforma"
      (Colegios / Super Admins) — no existe en mobile y no debe crearse acá.
- [x] En el alta/edición de apoderado (`modal === "nuevo_usuario"` / `edit`): la sección
      **"ACCESO ESPECIAL" con el toggle "◇ Super Admin" NO se renderiza** para
      `colegio_admin` (guarda anti-escalada de privilegios — mismo criterio que la RLS
      `usuarios_update … rol not in ('super','colegio_admin')` y que `manage-auth-user`).
      Tampoco aparece un toggle "Admin de Colegio" (eso es web-only, solo para `super`).
- [x] Crear un apoderado como `colegio_admin` funciona end-to-end: `authAdminCreate`
      (Edge Function `manage-auth-user`, que ya acepta `colegio_admin` con scope) + insert
      en `usuarios`/`usuario_hijos`/`usuario_cursos`, todo aceptado por las policies de
      `supabase/multi-colegio.sql`. El row nuevo de un apoderado normal **no** lleva
      `colegio_id` (queda scopeado por los cursos de sus hijos, igual que en la web).
- [x] Editar/desactivar/eliminar un apoderado, y las altas de cursos/maestros/alumnos/
      códigos/horarios/uniformes/alertas + publicar una comunicación + cargar el menú
      (Excel incluido): todas las operaciones del panel andan para `colegio_admin`,
      acotadas a su colegio por RLS.

**Módulo "🏫 Colegio" nuevo en mobile**
- [x] Nuevo módulo en `SECCIONES` (`mobile/features/superadmin/index.jsx`), grupo
      "Colegio" junto a "Menú": `{ id: "colegio", l: "🏫 Colegio" }`.
- [x] Lee y **edita** la fila de `colegios` (plural, la tabla multi-tenant) correspondiente
      al `usuario.colegio_id` del `colegio_admin` — **no** la tabla singleton `colegio`
      (deprecada) ni el id hardcodeado que usa hoy `mobile/features/contacto/index.jsx`.
- [x] Campos editables: `nombre`, `telefono`, `email`, `direccion`, `url_maps`,
      `horario_clases`, `horario_secretaria`, `sitio_web`. `logo_url` vía
      `pickAndUploadImage` (`mobile/lib/media.js`), igual que otros uploads de imagen.
      `color_primario` y `año_lectivo_actual`: fuera de alcance (ver abajo).
- [x] El form vive en un `Modal` con `TextInput` → **lleva la receta anti-teclado-iOS**
      obligatoria (KeyboardAvoidingView `behavior="padding"` en iOS + ScrollView
      `keyboardShouldPersistTaps="handled"` + `maxHeight` en el card) — CLAUDE.md,
      sección Mobile UI.
- [x] Texto de usuario saneado con `sanitize` / `safeUrl` (`@shared/helpers`) para
      `url_maps` y `sitio_web`.
- [x] `mobile/features/contacto/index.jsx` (`Contacto`, la vista que ven los apoderados)
      pasa a leer de `colegios` (plural) resolviendo el colegio del curso activo
      (`itemActual?.cursos?.colegio_id`, ya disponible en la sesión vía `colegiosPorId`),
      con fallback a "el único colegio" — para que lo que edita el `colegio_admin` sea lo
      que ven las familias. *(Sin esto el módulo editaría una tabla que la app no muestra.)*

**RLS / aislamiento (verificación, no código nuevo)**
- [x] Confirmado que **cada** query del panel mobile tiene un camino `colegio_admin` en las
      policies de `supabase/multi-colegio.sql`: `usuarios` (`es_colegio_admin_de_usuario`),
      `usuario_hijos`, `usuario_cursos`, `cursos`, `hijos`, `maestros`
      (`es_colegio_admin_de_maestro`), `maestro_cursos`, `recordatorios` (Comunicaciones),
      `alertas`, `codigos_invitacion`, `horarios`, `uniformes` + `uniforme_items` +
      `uniforme_cursos`, `menu`, `colegios`, `contactos`.
- [x] Verificado en vivo en un APK real con la cuenta `colegio_admin` "Administrador St
      John's": el panel abre con los 11 módulos y anda bien. *(El test de aislamiento con
      un **segundo** colegio no se hizo — sigue habiendo un solo colegio real, igual que
      en `specs/multi-colegio.md`; el scoping es el mismo RLS ya verificado ahí para web.)*

**Layouts / UI**
- [x] Todo el panel mobile ya es "un layout" (stack propio, sin las tres variantes de la
      web) — se respeta el patrón A3 existente del panel mobile: sin sombras, bordes
      hairline, `FlatList`/`ScrollView`, módulos como grilla de tarjetas + "← volver".
- [x] Usable en pantalla angosta de teléfono: el nuevo módulo Colegio y el header con el
      rol ámbar no desbordan a lo ancho; los `TextInput` del form no quedan tapados por el
      teclado (se usó la receta anti-teclado). **Pendiente de verificación visual.**
      [skill: vercel-react-native-skills]

**Validación**
- [x] `cd mobile && npm run lint` limpio (o mismo baseline).
- [x] `cd mobile && npx expo export -p ios` (gate del bundle Metro) limpio.
- [x] `src/` no se tocó (el ajuste de `Contacto` fue solo en `mobile/`), así que la web no
      necesitó revalidación.
- [x] QA manual en el emulador Android (ver CLAUDE.md → "Validation here"): login como
      `colegio_admin`, recorrer los 11 módulos, crear un apoderado, publicar una
      comunicación, editar los datos del colegio. **Pendiente** — sin cuenta
      `colegio_admin` de prueba en esta máquina.

## Technical Notes

- **Enrutado**: `mobile/app/_layout.jsx` `RootNavigator` — hoy
  `else if (isSuper) router.replace("/(super)")`. Cambiar a
  `else if (isSuper || esColegioAdmin) …`. `mobile/context/Session.jsx` agrega
  `esColegioAdmin` al objeto `value` (memoizado) junto a `isSuper`. `shapeUsuario` ya
  hace `...data`, así que `rol` y `colegio_id` ya vienen en `usuario`.
- **Rama en el panel**: `SuperAdmin` (`mobile/features/superadmin/index.jsx`) toma el rol
  de `useSession()` (`esColegioAdmin`), igual que la web lo deriva de `usuario.rol`
  (`src/features/superadmin/index.jsx:121-122` — `esSuper` / `esColegioAdmin`). No
  duplicar el componente. El `SECCIONES` de mobile ya es casi el set correcto (no tiene
  "Plataforma"); solo se agrega el módulo "colegio".
- **`SECCIONES`**: agregar `{ id: "colegio", l: "🏫 Colegio" }` al grupo "Colegio"
  (que hoy solo tiene "menu"). `TODAS_SECCIONES` se recalcula solo (es un
  `flatMap` de `SECCIONES`).
- **Módulo Colegio**: componente nuevo dentro del archivo (mismo patrón que
  `ComunicacionesAdmin`, `HistorialComunicaciones`). Query:
  `supabase.from("colegios").select("*").eq("id", usuario.colegio_id).single()`.
  Update: `supabase.from("colegios").update({...}).eq("id", usuario.colegio_id)` — RLS
  `colegios_update` ya permite `es_colegio_admin_de(id)`. Logo: `pickAndUploadImage`
  de `mobile/lib/media.js` (Supabase Storage), setear `logo_url`.
- **`mobile/features/contacto/index.jsx`**: hoy `supabase.from("colegio").select("*").eq("id", COLEGIO_ID)`
  — cambiar a `colegios` (plural) resolviendo por `useSession().itemActual?.cursos?.colegio_id`
  (o `colegiosPorId`), con fallback a `.limit(1)` sobre `colegios` cuando no hay colegio
  inequívoco (vista "Todos" o sesión sin cursos). Este es el único cambio potencial fuera
  de `mobile/features/superadmin/`.
- **Toggle de acceso especial**: en el form de usuario, envolver el bloque
  `<Text>ACCESO ESPECIAL</Text>` + `<Pressable … esSuper …>` en
  `{esColegioAdmin ? null : (…)}`. Un `colegio_admin` nunca puede crear `super` ni
  `colegio_admin` desde mobile (ni desde la web).
- **`manage-auth-user`**: sin cambios — ya verifica `super | colegio_admin` y aplica
  `targetEnColegio()` para acotar `update`/`find` de `colegio_admin` a su `colegio_id`
  (ver CLAUDE.md → Backend & auth). `mobile/lib/authAdmin.js` ya manda el
  `session.access_token`.
- **`esColegioAdmin` en el objeto de sesión** debe memoizarse dentro del `useMemo`
  existente de `Session.jsx` (no un cálculo suelto por render). [skill: vercel-react-best-practices]
- **QA real**: el aislamiento RLS solo se puede verificar de verdad en la app corriendo
  contra Supabase con dos colegios — usar el mismo método de `specs/multi-colegio.md`
  (crear colegio + `colegio_admin` de prueba, mirar los conteos, borrar al final).
  El emulador Android local está disponible en esta máquina (CLAUDE.md → "Validation here").
- Nada de esto toca push, deep-linking ni `TAB_MAP` — el panel de administración no
  consume la campana de notificaciones.

## Out of Scope

- **Rol `super` en mobile**: sigue como hoy (panel sin scoping, sin selector de colegio,
  sin sección "Plataforma" / Colegios / Super Admins). Con un solo colegio real es
  inofensivo; queda como brecha conocida documentada.
- **Branding por colegio** (`logo_url` / `color_primario` pintando el wordmark y el acento
  de la app para apoderados) — sigue sin implementarse en ninguna plataforma
  (`specs/multi-colegio.md` lo tiene pendiente). Este spec solo permite **editar** el
  `logo_url`; no lo aplica a la UI.
- **`color_primario` y `año_lectivo_actual`** editables desde el módulo Colegio de mobile
  — el primero no tiene efecto visible todavía; el segundo se maneja desde la web
  (Cursos / Promoción, que son web-only).
- **Módulos "Colegio" (info) y "Promoción de curso"** como pantallas de gestión de cursos
  año a año — Promoción sigue web-only (CLAUDE.md). Este spec agrega solo el módulo de
  **datos de contacto** del colegio.
- **`tagDeCurso` / "Mi acceso" multi-colegio** para un apoderado con hijos en más de un
  colegio — sin efecto observable hoy, fuera de alcance (igual que en
  `specs/multi-colegio.md`).
- Alta de colegios nuevos o de otros `colegio_admin` desde mobile — es acción de `super`,
  y `super` en mobile está fuera de alcance.
- Cambios en la Edge Function `manage-auth-user` o en `supabase/multi-colegio.sql` — se
  asume que ya cubren `colegio_admin`; este spec solo lo **verifica**.
