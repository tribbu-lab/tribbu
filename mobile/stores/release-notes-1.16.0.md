# Release notes 1.16.0 (es-419)

Android vc56 · iOS build 50 · commits `2d65283..05671ae` (desde 1.15.0, la última publicada).

Compilados en la Mac el 2026-11-05: **iOS build 50** (iphoneos26.2) → ASC, submission `7fc891e3`; **Android vc56** (R8, Firebase ×2) → Play interno, submission `aced85a6`. Quedan sin usar build 49 / vc55 (de `d7a804a`, submissions `bedfa12a` y `5534f82f`): traen el bucle de renders del globito de Pagos (ver `05671ae` abajo). Antes del build se verificó que el SQL de multicuenta y de pagos estuviera en prod (`registrar_push_token`, `push_token_cuentas`, `avisar_pago_colegio`, `pagos_colegio`, `pago_colegio_alumnos`).

> **Capturas**: quedaron viejas por el header nuevo (`capturas-tienda.mjs detectar`). El set se regeneró desde `05671ae` (PR #19), con un build Release de ese commit en el simulador y el AAB de vc56 en el emulador: las mismas 6 pantallas con el header más alto, las fechas al día y "Pagos al colegio" en Curso. `/store-promote` las sube a las dos fichas.

Login y onboarding no cambian para la cuenta demo, que sigue valiendo. Agregar otra cuenta (multicuenta) es opcional y no cambia el login. Las Review Notes suman Pagos al colegio (ver la sección), sin pasarse de los 4000 caracteres de ASC.

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nuevo: ¿tenés hijos en dos colegios? Agregá la otra cuenta en Mi cuenta, cambiá con un toque y recibí los avisos de las dos.
• Nuevo: Pagos al colegio. Avisá "Ya pagué" y el colegio lo confirma.
• Al cerrar sesión, ese celular deja de recibir los avisos de esa cuenta.
• Podés cerrar la alerta del curso para vos.
• Encabezado más cómodo.
• Colegios: eliminar un apoderado ahora borra su cuenta y avisa si algo falla.
```

## App Store Connect — "Novedades de esta versión"

```
Novedades para las familias
• Nuevo: varias cuentas en el mismo celular. Si tenés hijos en dos colegios, cada colegio te da una cuenta. En Mi cuenta → Agregar otra cuenta entrás con la segunda una sola vez; después cambiás con un toque y recibís los avisos de las dos, con el nombre del colegio. Si tocás un aviso de la otra cuenta, la app pasa sola a esa cuenta.
• Nuevo: Pagos al colegio, para excursiones y visitas. En Curso ves el monto y los datos para pagar, avisás "Ya pagué" y el colegio lo confirma cuando recibe el dinero.
• Al cerrar sesión, ese celular deja de recibir los avisos de esa cuenta.
• Podés cerrar la alerta del curso para vos.
• El encabezado de la app es más alto y más cómodo de tocar.

Para los colegios
• Pagos: cargá un pago por curso, mirá quién avisó, confirmá y enviá recordatorios a quienes siguen pendientes.
• Un comunicado ya enviado se puede reenviar como recordatorio.
• Eliminar un apoderado ahora borra su cuenta de verdad, libera su mail y avisa si algo falla. Lo hace el administrador del colegio.
```

## App Review — "Notas" (App Store Connect → Información de la revisión de la app)

Como las de 1.15.0, con Pagos al colegio: en la lista de Curso, en Hoy ("payments") y en PAYMENTS, junto a Colectas (mismo esquema: se paga por fuera, la familia avisa y el colegio confirma). La cuenta demo no tiene pagos cargados: el revisor ve la pantalla vacía. Para entrar en el límite se acortaron Horario, Salidas, Ayuda y soporte y el link al sitio.

```
tribbu is a school-community app for parents and guardians of school-age children. Any school can adopt it; it is not built for or restricted to a single organization.

HOW TO REVIEW
Sign in with the demo account provided above. It belongs to "María", parent of Sofía in the demo classroom "3°A - Primaria" of "Colegio Demo tribbu" (a sample school with no real families). María is also that classroom's Room Parent (the volunteer parent who coordinates the class), so she can create content too. The account is pre-loaded with sample data. The app has four sections in the bottom bar:
• Hoy (Today): what awaits the family's answer (permission slips, payments, fundraisers, invitations, polls), unread notices, the next five days and today's lunch menu.
• Agenda: Calendario (class events), Horario (weekly class timetable) and Cumpleaños (classmates' birthdays and party invitations).
• Comunicaciones: Avisos (class and school notices, with read receipts), Mensajes (chat) and Salidas (to tell the school office the child leaves at another time or with someone else).
• Curso: Autorizaciones (permission slips), Pagos al colegio (school fees, e.g. field trips), Comedor (lunch menu), Fotos escolares (school photos), Talleres (after-school workshops), Info útil, Contacto, Colectas (class fundraisers), Encuestas (polls), Marketplace (used items among families of the same school) and Lost & Found.
The account menu (Mi cuenta) opens from the circle with the user's initials (or profile photo) at the top right; the chat bubble icon next to it opens Mensajes. Mi cuenta → Ayuda y soporte has FAQs and a chat with the tribbu team.

USER-GENERATED CONTENT (Mensajes)
Families of the same classroom can message each other, the classroom group, their children's teachers and the school office. Before writing to other families, users must accept the chat rules. Any message from another family can be reported (tap the message → Denunciar) and any user can be blocked (chat menu, or tap their message → Bloquear). Reports are reviewed by the school; blocked users are in Mi cuenta → Usuarios bloqueados. Families' phone numbers and emails are never shown to other users. To try it: Comunicaciones → Mensajes → + Nuevo (the demo classroom has another family).

HOW USERS GET AN ACCOUNT
Accounts are created by the school from its admin panel (one by one or from a spreadsheet). There is no public sign-up screen in the app. Schools join tribbu through www.tribbu.ar or info@tribbu.ar. A user who forgets their password can reset it from the login screen ("¿Olvidaste tu contraseña?"), which emails a reset link.

PAYMENTS
The app is free: no in-app purchases, subscriptions or ads, and no money is processed through the app. "Colectas" (a class collection, e.g. a gift for the teacher) and "Pagos al colegio" (a school fee, e.g. a field trip) only keep track of payments made outside the app (e.g. bank transfer): the family taps "Ya transferí" or "Ya pagué" and the organizer or the school confirms it. In "Marketplace", families of the same school can list used items (uniforms, books); tapping "Me interesa" opens an in-app chat with the seller, and they arrange the exchange there (no payment goes through the app). "Fotos escolares" replaces the paper envelope with the yearly class photos: the school shows watermarked previews of each family's own child, the family orders and pays the school directly (transfer or cash, never in the app), and the school marks it paid. The family picks print or digital: prints are handed out at school, and a digital copy of its own child's photo can then be saved. tribbu does not sell photos or take any fee. Demo: Curso → Fotos escolares (illustrations, not real photos).

Account deletion is available in-app under Mi cuenta (circle at the top right) → Eliminar mi cuenta (guideline 5.1.1(v)). Push notifications are scoped to the user's own classrooms. Web version: https://www.tribbu.ar/app
```

## Qué entró realmente (interno, no publicar)

- `0dd8800` + `3c8ed39` + `d7a804a` Pagos al colegio y reenviar comunicados (`specs/pagos-colegio.md`, `supabase/pagos-colegio.sql`, aplicado el 2026-11-05 con `send-push` y `avisos-automaticos`). Causa raíz del historial: como super, listaba comunicados de todos los colegios porque la RLS no lo acota; ahora filtra por colegio.
- `8c70ce8` + `b46023f` Perfil multicuenta, y selector de cuentas también en el panel (`specs/perfil-multicuenta.md`): cuentas guardadas, `push_token_cuentas`, `registrar_push_token`, un colegio por cuenta. SQL y funciones aplicados el 2026-11-05. **Requiere ese SQL: esta versión no registra push sin él.** Causa raíz del push tras cerrar sesión: `logout` no borraba el token.
- `3d487fc` + `ef62059` + `e650c65` Eliminar apoderado por `manage-auth-user`, con Auth y error visible; solo administrador del colegio o super. Causa raíz: al borrar primero los vínculos, la RLS ya no dejaba borrar la fila y no había error.
- `05671ae` (#18) Globito de Pagos sin `usePathname`. Causa raíz: el layout de pestañas leía `usePathname()` para recontar los pagos pendientes en cada navegación; con `freezeOnBlur`, después de recorrer Hoy → Agenda → Avisos → Curso el hilo de JS quedaba en un bucle de renders (128 % de CPU) y las respuestas de red no llegaban a las pantallas, que se quedaban en "Cargando…" (Colectas, al sacar las capturas: 4 de 4). Ahora recuenta como el de Fotos (al montar, al volver a primer plano y cada 2 minutos) y la pantalla de Pagos lo recarga por contexto después de "Ya pagué" o "Deshacer". Lo traían build 49 / vc55, que quedan sin usar.
- `1d33112` Header más alto: 8 + fila de 44 + 8.
- `6ae1c13` Alertas: el apoderado puede cerrar la alerta del curso para sí.
