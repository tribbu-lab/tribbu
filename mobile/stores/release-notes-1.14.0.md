# Release notes 1.14.0 (es-419)

Android vc ? · iOS build ? (se completan al buildear) · commits `64b5131..84159c8` (desde 1.13.1)

Login, alta de cuentas y onboarding no cambiaron: la cuenta demo (demo@tribbu.app) sigue valiendo y las Review Notes de 1.13.0 siguen siendo válidas, salvo la línea del Marketplace, que ya no se arregla "por fuera" sino por Mensajes (actualizada abajo).

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Marketplace: "Me interesa" abre un chat con quien publicó, sin compartir teléfono ni mail.
• Avisos del colegio con formato y membrete.
• Ayuda con preguntas frecuentes en Mi cuenta.
• Fotos con zoom en el chat y en los adjuntos.
• Chats del año anterior archivados, para leerlos.
• Docentes: chats con el personal del colegio y avisos que llegan al celular.
• Panel del colegio más simple, con Secretarías por nivel.
• Mejoras de estabilidad.
```

## App Store Connect — "Novedades de esta versión"

```
Novedades para las familias
• Marketplace más seguro: "Me interesa" abre un chat con quien publicó, sin compartir teléfono, mail ni WhatsApp. El primer mensaje ya viene escrito.
• Los avisos del colegio pueden tener negritas, títulos, listas y links, y llegar con el membrete del colegio.
• Nueva sección de Ayuda en Mi cuenta, con preguntas frecuentes para resolver lo más común sin escribir a soporte.
• Tocá una foto del chat o de un adjunto para agrandarla y hacer zoom.
• Al empezar el año nuevo, los chats del año anterior quedan archivados: se pueden leer, pero no escribir.
• Los talleres optativos ya no aparecen como respuestas pendientes, y un taller que ya miraste sale de Novedades.
• En Alumnos ya no se ven mails ni teléfonos de otras familias: se les escribe por Mensajes.

Para docentes
• Los avisos que mandás a tu curso llegan al celular de las familias.
• Nuevo: chats con el personal del colegio (maestras, Secretaría y Dirección), de a uno o en grupo.
• Ya no ves como novedad lo que publicaste vos.

Para el colegio
• El panel del colegio es más simple: seis secciones con pestañas, sin íconos de colores.
• Secretarías y Direcciones por nivel (Inicial, Primaria, Secundaria), cada una con lo de su nivel.
• Menú del comedor y materias por nivel.

Y mejoras de estabilidad.
```

## App Review — "Notas" (App Store Connect → Información de la revisión de la app)

Igual que 1.13.0 con un solo cambio: el párrafo PAYMENTS dice ahora que en el Marketplace comprador y vendedor se ponen de acuerdo **por Mensajes** (antes "directly, outside the app"). Las demás rutas (Mi cuenta → Eliminar mi cuenta, Usuarios bloqueados, Denunciar/Bloquear, "Ya transferí") no cambiaron en el código desde build 42.

```
tribbu is a school-community app for parents and guardians of school-age children. Any school can adopt it; it is not built for or restricted to a single organization.

HOW TO REVIEW
Sign in with the demo account provided above. It belongs to "María", parent of Sofía in the demo classroom "3°A - Primaria" of "Colegio Demo tribbu" (a sample school with no real families). María is also that classroom's Room Parent (the volunteer parent who coordinates the class), so she can create content too. The account is pre-loaded with sample data. The app has four sections in the bottom bar:
• Hoy (Today): anything waiting for the family's answer (permission slips, class fundraisers, party invitations, polls), most urgent first; then Novedades (unread notices and found items), the next five days and today's lunch menu. When nothing is pending it shows "Estás al día" (you're all caught up).
• Agenda: Calendario (class events), Horario (the weekly class timetable, one day at a time) and Cumpleaños (classmates' birthdays and party invitations).
• Comunicaciones: Avisos (class and school notices, with read receipts) and Mensajes (chat).
• Curso: Autorizaciones (permission slips), Comedor (lunch menu), Talleres (after-school workshops), Info útil, Contacto, Colectas (class fundraisers), Encuestas (polls), Marketplace (used items among families of the same school) and Lost & Found.
The account menu (Mi cuenta) opens from the circle with the user's initials (or profile photo) at the top right; the chat bubble icon next to it opens Mensajes. Mi cuenta → Ayuda y soporte shows frequently asked questions and a chat with the tribbu team.

USER-GENERATED CONTENT (Mensajes)
Families of the same classroom can message each other and the classroom group, and write to their children's teachers and to the school office. Before writing to other families, users must accept the chat rules (no offensive content, no spam). Any message from another family can be reported (tap the message → Denunciar), and any user can be blocked (from the menu of a one-to-one chat, or by tapping their message in a group → Bloquear). Reports are reviewed by the school; blocked users are managed in Mi cuenta → Usuarios bloqueados. Phone numbers and emails are never shown in the app. The demo classroom has another family, so a chat can be started from Comunicaciones → Mensajes → + Nuevo.

HOW USERS GET AN ACCOUNT
Accounts are created by the school: the school's administrator adds each family from the school's admin panel (one by one or by importing a spreadsheet) and gives the family its login. There is no public sign-up screen in the app. Schools join tribbu through www.tribbu.ar or info@tribbu.ar. A user who forgets their password can reset it from the login screen ("¿Olvidaste tu contraseña?"), which emails a reset link.

PAYMENTS
The app is free: no in-app purchases, subscriptions or ads, and no money is processed through the app. "Colectas" only keeps track of a class collection (for example, a gift for the teacher): families pay outside the app (for example, by bank transfer), can tap "Ya transferí" to let the organizer know, and the organizer confirms it. In "Marketplace", families of the same school can list used items (uniforms, books); tapping "Me interesa" opens an in-app chat with the seller, and they arrange the exchange there (no payment goes through the app).

Account deletion is available in-app under Mi cuenta (circle at the top right) → Eliminar mi cuenta (guideline 5.1.1(v)). Push notifications are scoped to the user's own classrooms. Web version: https://www.tribbu.ar/app · Website: https://www.tribbu.ar
```

## Qué entró realmente (interno, no publicar)

Commits que tocan `mobile/` o `src/lib/` desde 1.13.1 (`64b5131`):

- `169ccb0` Marketplace por Mensajes (RPC `abrir_conversacion_articulo`), el colegio solo mira, Alumnos sin contactos, avisos de maestras con push.
- `a12ed62` + `1c45664` + `cfa6038` Roles por nivel (`nivel_admin`, Secretaría/Dirección con cargo), niveles opcionales, menú por nivel; el error al crear una cuenta dice el motivo.
- `8ce4fd2` Comunicados con formato (Markdown acotado, `EditorFormato`/`TextoConFormato`) y membrete.
- `da7e6ba` Ayuda con preguntas frecuentes (`@shared/ayuda`, ruta `(tabs)/ayuda`).
- `c850346` + `195dc02` Talleres fuera de "respuestas pendientes"; taller visto sale de Novedades; nombre de la maestra en mobile.
- `e35ab31` Lo que publica uno mismo no es novedad.
- `31064a9` Push de "Me interesa", alertas a maestras (`docentes_de_curso`), talleres para Secretarías, Directivos y Membrete desde el panel mobile.
- `fb4d857` Autorizaciones: cursos en lista con casillas (`CursoListSelector` mobile).
- `a669e47` Chats entre el personal del colegio (tipo `personal`).
- `cbf1bbb` … `3ebe888`, `dd839fe`, `842e601`, `84159c8` Panel del colegio sobrio en 6 secciones, globitos de no leídos, push del panel que abre la sección correcta, materias por nivel, eventos multi-curso, festejos fuera del colegio, cursos del año vigente.
- `fcaa23e` Chats archivados por año (`conversacion_archivada`), colectas/encuestas privadas de las familias.
- `85bafc9` Zoom en fotos del chat y adjuntos.
- `b9a6d64` Fotos en la difusión, fotos de chat privadas por conversación, acceso de docentes desde la app.
- `40f4861` Ajustes de la prueba con docentes (cumpleaños, avisos, panel y fechas).
- `c316c5a` Mensajes: estado vacío sobrio.
