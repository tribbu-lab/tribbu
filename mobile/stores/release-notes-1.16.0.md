# Release notes 1.16.0 (es-419)

Commits `2d65283..` (desde 1.15.0, la última publicada). Compilada en los servidores de EAS: esta máquina es Windows y no compila iOS. Números de build: completar al terminar.

Las capturas de las fichas quedaron viejas según `capturas-tienda.mjs detectar` (cambió el header): regenerarlas en la Mac antes de `/store-promote`.

Login y onboarding no cambian para la cuenta demo, que sigue valiendo. Las Review Notes suman una oración sobre varias cuentas en "HOW USERS GET AN ACCOUNT".

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nuevo: ¿tenés hijos en dos colegios? Agregá la otra cuenta en Mi cuenta, cambiá con un toque y recibí los avisos de las dos.
• Al cerrar sesión, ese celular deja de recibir los avisos de esa cuenta.
• Podés cerrar la alerta del curso para vos.
• Encabezado más cómodo.
• Colegios: eliminar un apoderado ahora borra su cuenta y avisa si algo falla.
```

## App Store Connect — "Novedades de esta versión"

```
Novedades para las familias
• Nuevo: varias cuentas en el mismo celular. Si tenés hijos en dos colegios, cada colegio te da una cuenta. En Mi cuenta → Agregar otra cuenta entrás con la segunda una sola vez; después cambiás con un toque y recibís los avisos de las dos, con el nombre del colegio. Si tocás un aviso de la otra cuenta, la app pasa sola a esa cuenta.
• Al cerrar sesión, ese celular deja de recibir los avisos de esa cuenta.
• Podés cerrar la alerta del curso para vos.
• El encabezado de la app es más alto y más cómodo de tocar.

Para los colegios
• Eliminar un apoderado ahora borra su cuenta de verdad, libera su mail y avisa si algo falla. Lo hace el administrador del colegio.
```

## App Review — "Notas" (App Store Connect → Información de la revisión de la app)

Igual que 1.15.0 con una oración nueva sobre "Agregar otra cuenta". Ruta verificada contra el código: Mi cuenta → Agregar otra cuenta (`(tabs)/cuenta`).

```
tribbu is a school-community app for parents and guardians of school-age children. Any school can adopt it; it is not built for or restricted to a single organization.

HOW TO REVIEW
Sign in with the demo account provided above. It belongs to "María", parent of Sofía in the demo classroom "3°A - Primaria" of "Colegio Demo tribbu" (a sample school with no real families). María is also that classroom's Room Parent (the volunteer parent who coordinates the class), so she can create content too. The account is pre-loaded with sample data. The app has four sections in the bottom bar:
• Hoy (Today): what is waiting for the family's answer (permission slips, fundraisers, invitations, polls), then unread notices, the next five days and today's lunch menu.
• Agenda: Calendario (class events), Horario (the weekly class timetable, one day at a time) and Cumpleaños (classmates' birthdays and party invitations).
• Comunicaciones: Avisos (class and school notices, with read receipts), Mensajes (chat) and Salidas (to tell the school office that the child will leave at a different time or with someone else).
• Curso: Autorizaciones (permission slips), Comedor (lunch menu), Fotos escolares (school photos), Talleres (after-school workshops), Info útil, Contacto, Colectas (class fundraisers), Encuestas (polls), Marketplace (used items among families of the same school) and Lost & Found.
The account menu (Mi cuenta) opens from the circle with the user's initials (or profile photo) at the top right; the chat bubble icon next to it opens Mensajes. Mi cuenta → Ayuda y soporte shows frequently asked questions and a chat with the tribbu team.

USER-GENERATED CONTENT (Mensajes)
Families of the same classroom can message each other, the classroom group, their children's teachers and the school office. Before writing to other families, users must accept the chat rules. Any message from another family can be reported (tap the message → Denunciar) and any user can be blocked (chat menu, or tap their message → Bloquear). Reports are reviewed by the school; blocked users are in Mi cuenta → Usuarios bloqueados. Families' phone numbers and emails are never shown to other users. To try it: Comunicaciones → Mensajes → + Nuevo (the demo classroom has another family).

HOW USERS GET AN ACCOUNT
Accounts are created by the school from its admin panel (one by one or from a spreadsheet). There is no public sign-up screen in the app. Schools join tribbu through www.tribbu.ar or info@tribbu.ar. Each school manages its own accounts, so a parent with children in two schools has one account per school; Mi cuenta → "Agregar otra cuenta" keeps both on the same phone and switches between them (optional, the demo account does not need it). A user who forgets their password can reset it from the login screen ("¿Olvidaste tu contraseña?"), which emails a reset link.

PAYMENTS
The app is free: no in-app purchases, subscriptions or ads, and no money is processed through the app. "Colectas" only keeps track of a class collection (for example, a gift for the teacher): families pay outside the app (for example, by bank transfer), can tap "Ya transferí" to let the organizer know, and the organizer confirms it. In "Marketplace", families of the same school can list used items (uniforms, books); tapping "Me interesa" opens an in-app chat with the seller, and they arrange the exchange there (no payment goes through the app). "Fotos escolares" replaces the paper envelope with the yearly class photos: the school shows watermarked previews of each family's own child, the family orders and pays the school directly (transfer or cash, never in the app), and the school marks it paid. The family picks print or digital: prints are handed out at school, and a digital copy of its own child's photo can then be saved. tribbu does not sell photos or take any fee. Demo: Curso → Fotos escolares (illustrations, not real photos).

Account deletion is available in-app under Mi cuenta (circle at the top right) → Eliminar mi cuenta (guideline 5.1.1(v)). Push notifications are scoped to the user's own classrooms. Web version: https://www.tribbu.ar/app · Website: https://www.tribbu.ar
```

## Qué entró realmente (interno, no publicar)

- `8c70ce8` Perfil multicuenta (`specs/perfil-multicuenta.md`): cuentas guardadas, `push_token_cuentas`, `registrar_push_token`, un colegio por cuenta. SQL y funciones aplicados el 2026-11-05. **Requiere ese SQL: esta versión no registra push sin él.** Causa raíz del push tras cerrar sesión: `logout` no borraba el token.
- `3d487fc` + `ef62059` Eliminar apoderado por `manage-auth-user`, con Auth y error visible; solo administrador del colegio o super. Causa raíz: al borrar primero los vínculos, la RLS ya no dejaba borrar la fila y no había error.
- `1d33112` Header más alto: 8 + fila de 44 + 8.
- `6ae1c13` Alertas: el apoderado puede cerrar la alerta del curso para sí.
