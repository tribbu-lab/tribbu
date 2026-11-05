---
title: Perfil multicuenta (una cuenta por colegio, varias en un mismo celular)
status: in-progress
priority: high
---

## Summary

Cada colegio gestiona sus apoderados, así que un apoderado con hijos en dos
colegios tiene **una cuenta por colegio**. Para no obligarlo a cerrar sesión y
volver a entrar, la app guarda varias cuentas en el mismo celular: agrega la
segunda una sola vez, cambia con un toque (como Gmail o Instagram) y recibe los
avisos de todas. Reemplaza lo que `specs/multi-colegio.md` planteaba como "un
mismo login y un mismo Todos" para hijos en distintos colegios.

## Acceptance Criteria

**Regla de la base**
- [x] Una cuenta no se puede vincular a hijos ni cursos de dos colegios
      (trigger en `usuario_hijos` y `usuario_cursos`, también contra
      `usuarios.colegio_id`). El mensaje no nombra al otro colegio.
- [x] El mensaje de "mail ya existente" del alta explica que hace falta otro mail.

**App: cuentas**
- [x] En Mi cuenta: "Cuentas en este celular" con la lista, cambio con un toque
      y "Agregar otra cuenta" (mail + contraseña, una sola vez).
- [x] La contraseña no se guarda: solo los tokens de sesión, en el mismo
      AsyncStorage donde ya vive la sesión de Supabase.
- [x] Una contraseña incorrecta o una sesión vencida al cambiar no sacan de la
      cuenta actual (se valida con un cliente temporal). Si la sesión guardada
      venció, se pide la contraseña de esa cuenta.
- [x] Solo cuentas de familia o docente: las del panel del colegio siguen con
      su sesión propia.
- [x] Cerrar sesión con más cuentas guardadas pasa a la siguiente; sin más
      cuentas, vuelve al login como siempre.
- [x] Quitar una cuenta del celular corta sus avisos en ese celular.
- [x] El candado de huella/Face ID sigue siendo por cuenta.

**Avisos**
- [x] Un celular recibe los push de todas sus cuentas guardadas (tabla
      `push_token_cuentas`; `push_tokens` queda para las versiones viejas).
- [x] Si el celular tiene más de una cuenta, el título lleva el colegio.
- [x] Tocar un aviso de otra cuenta cambia a esa cuenta y abre el destino.
- [x] Cerrar sesión borra el token de esa cuenta: antes ese celular seguía
      recibiendo sus avisos después de salir.
- [x] Una cuenta nueva que no está guardada en el celular sigue "llevándose" el
      celular (en un teléfono compartido no llegan avisos de la cuenta anterior).

## Technical Notes

- `push_tokens.token` sigue único porque las apps ya publicadas hacen
  `upsert(onConflict:"token")`: cambiarlo les rompería el registro. Por eso hay
  tabla nueva y `enviarPush` lee las dos. Cuando no queden versiones viejas se
  puede borrar `push_tokens`.
- `registrar_push_token(token, platform, mantener[])`: `mantener` solo puede
  conservar cuentas que ya estaban en ese celular, nunca sumar una ajena.
- Orden de salida: `supabase/multi-cuenta.sql` → deploy de `send-push`,
  `avisos-automaticos` y `mensajes-push` (usan `_shared/expoPush.ts`) → release
  de la app.
- `setSession` con un refresh token inválido borra la sesión actual del
  cliente: por eso todo se valida antes en `crearClienteTemporal()`.

## Limitaciones

- Cada cuenta necesita su mail: Auth y `usuarios.email` son únicos. Un padre
  con una sola casilla puede usar un alias (`nombre+colegio@gmail.com`).
- No hay vista "Todos" entre cuentas: se ve un colegio por vez.

## Out of Scope

- Web (queda para después).
- Contadores de no leídos de la otra cuenta en el selector.
- Cuentas del panel del colegio en el selector.
