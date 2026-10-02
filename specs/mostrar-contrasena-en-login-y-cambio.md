---
title: Mostrar contraseña en login y cambio de contraseña
status: implemented
priority: medium
---

> **Implementado 2026-10-02.** `PasswordInput` en `mobile/features/auth/index.jsx`
> (login + `CambiarPasswordModal`) y botón 👁/🙈 en el login web. Falta QA en
> el simulador iOS (alternar con el campo enfocado).

## Summary

Hoy un apoderado, Room Parent o admin del colegio que escribe su contraseña en
la app mobile (al entrar, o en Más → Cuenta → "Cambiar contraseña") no puede ver
lo que tipea. En el teclado del celular es fácil equivocarse, y como no se ve el
error, el login falla con "credenciales inválidas" o queda guardada una clave
distinta a la que la persona cree. Eso termina en pedidos de reseteo que se
podrían evitar. La pantalla de reseteo de la web ("Crear nueva contraseña") y el
modal "Cambiar contraseña" de la web ya tienen un botón 👁/🙈 para mostrar u
ocultar el texto. Esta feature lleva ese mismo botón al login mobile, al modal
"Cambiar contraseña" de mobile y, por consistencia, al login web.

## Acceptance Criteria

- [x] **Login mobile** (`Login` en `mobile/features/auth/index.jsx`): el campo
      "Contraseña" tiene un botón dentro o al costado del input que alterna
      `secureTextEntry`. Arranca oculto.
- [x] **Cambiar contraseña mobile** (`CambiarPasswordModal`, mismo archivo):
      "Nueva contraseña" y "Confirmar contraseña" tienen cada uno su propio
      botón, con estado independiente (como `verNueva`/`verConf` en la web).
      Arrancan ocultos.
- [x] Al cerrar o cancelar `CambiarPasswordModal` (`cerrar()`), los dos campos
      vuelven a quedar ocultos para la próxima apertura.
- [x] **Login web** (`Login` en `src/features/auth/index.jsx`): el campo
      "Contraseña" tiene el mismo patrón que ya usa `NuevaPasswordRecovery`:
      input + botón 👁/🙈 con el estilo `btnVer` de la pantalla oscura. El botón
      es `type="button"` y sigue funcionando Enter para ingresar.
- [x] El ícono cambia según el estado: "ver" cuando el texto está oculto y
      "ocultar" cuando se ve.
- [x] Accesibilidad: en mobile, `accessibilityRole="button"` y
      `accessibilityLabel` "Mostrar contraseña"/"Ocultar contraseña"; en web,
      `aria-label` con el mismo texto. Área de toque ≥ `MIN_TOUCH`.
- [x] Mostrar la contraseña no rompe el autocompletado del login mobile
      (`autoComplete="current-password"`, `textContentType="password"` se
      mantienen) ni cambia el valor ya tipeado al alternar.
- [ ] _(Android verificado en emulador; iOS pendiente de QA manual)_ En iOS y Android, alternar no cierra el teclado ni borra el texto. El
      cursor queda al final del texto.
- [x] Usable en un teléfono angosto (≈360 px): el botón no empuja el input
      fuera de la tarjeta, ni en el login (fondo oscuro) ni en el modal (fondo
      claro).

## Technical Notes

- Mobile: los íconos de interfaz usan `@expo/vector-icons`
  `MaterialCommunityIcons` (`eye-outline` / `eye-off-outline`). El emoji queda
  para el contenido, no para la interfaz (`mobile/DESIGN_SYSTEM.md`). En el
  login, color del ícono `rgba(255,255,255,0.6)` sobre `styles.authInput`. En el
  modal, el color de texto secundario de `THEMES.light` (`@shared/tokens`) sobre
  `styles.modalInput`. [skill: vercel-react-native-skills]
- Se recomienda un componente chico `PasswordInput` dentro de
  `mobile/features/auth/index.jsx` (input + `Pressable` superpuesto a la
  derecha, con `paddingRight` en el input para que el texto no quede debajo del
  ícono), reutilizado en los tres campos. No hace falta llevarlo a
  `components/` mientras solo lo use este archivo.
- Gotcha de iOS: alternar `secureTextEntry` en un `TextInput` enfocado puede
  dejar el cursor o la fuente desfasados, y un campo seguro se vacía al
  re-enfocarlo y seguir tipeando (comportamiento nativo). Verificarlo en el QA
  del simulador iOS.
- Web: copiar el patrón existente (`verNueva`/`btnVer` de
  `NuevaPasswordRecovery`). Solo estilos inline. Son ~3 líneas en `Login`; no
  hace falta un componente nuevo.
- Sin cambios de backend, Supabase, tablas ni push. Es solo UI.
- Validación: `npm run lint` + `npm run build` (web), `cd mobile && npm run
  lint` + `npx expo export -p ios`. QA manual en el emulador Android (login con
  la cuenta QA, abrir Más → Cambiar contraseña) y en el login web con
  agent-browser. [skill: agent-browser]

## Out of Scope

- Los formularios de Super Admin (web y mobile) que fijan la contraseña de otro
  usuario, el `adminPass` de "Nuevo colegio", etc.
- `NuevaPasswordRecovery` y el `CambiarPasswordModal` web: ya tienen el botón.
- Una pantalla de reseteo nativa en mobile: el link del mail sigue abriendo la
  web (`specs/recuperacion-de-contrasena-por-email.md`).
- Medidor de fortaleza o reglas nuevas de contraseña (sigue siendo mínimo 6
  caracteres).
- Recordar entre sesiones si el usuario prefiere la contraseña visible.
