# Release notes 1.15.0 (es-419)

Android vc54 · iOS build 48 · commits `4b10f8f..2d65283` (desde 1.14.0, la última publicada).

Compilados en la Mac el 2026-10-31: **iOS build 48** (iphoneos26.2) → ASC, submission `02605bf3`; **Android vc54** (R8, Firebase ×2) → Play interno, submission `964f345b`. Quedan sin usar build 46 / vc52 (de `76c5663`) y build 47 / vc53 (de `c6b48ef`): no traen `2d65283` (festejos por hijo).

Promovida el 2026-10-31: Play producción vc54 (100%, pendiente de revisión de Google); ASC versión 1.15.0 con build 48, `AFTER_APPROVAL`, enviada a review.

> **Capturas**: la contraseña de demo@tribbu.app había dejado de coincidir con la de ASC (por eso fallaron los robots de Play el 29/10); se restauró a la de ASC el 31/10, después del envío a review. El set se regeneró desde `2d65283` (PR #12): Play lo recibió el 02/11 (`--solo-capturas`); en ASC la 1.15.0 salió con el set anterior (de `4aa06c5`) porque ya estaba en review, y el nuevo va con la próxima versión.

Login, alta de cuentas y onboarding no cambiaron: la cuenta demo (demo@tribbu.app) sigue valiendo. Las Review Notes cambian en tres cosas: la sección Comunicaciones suma "Cambios en la salida", Curso suma "Fotos escolares", y el párrafo PAYMENTS explica Fotos escolares (pago al colegio por fuera de la app; tribbu no cobra). **Riesgo Guideline 3.1.1**: la descarga de la foto digital se habilita después de un pago hecho por fuera. Se argumenta como un servicio del colegio con la foto del propio hijo, sin cobro en la app; si Apple lo observa, la salida es dejar en iOS solo la entrega impresa (sin "Descargar").

La sesión de Fotos escolares de la cuenta demo (3°A, Colegio Demo) vence el **13/11/2026**: si la revisión cae después, correr el vencimiento o rearmarla antes de enviar.

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nuevo: Fotos escolares. Ves las fotos de tu hijo, elegís cuáles querés, en papel o digital, y las digitales las descargás.
• Avisá a la Secretaría un cambio en la salida (otro horario o quién lo retira).
• Docentes: mensaje a todo el curso o a algunas familias.
• Panel del colegio más simple: día a día adelante, Configuración aparte y botón "Crear".
• Horarios y ficha por alumno en el panel.
• Colectas, Cumpleaños y Avisos cargan más rápido.
• Mejoras de estabilidad.
```

## App Store Connect — "Novedades de esta versión"

```
Novedades para las familias
• Nuevo: Fotos escolares. Cuando el colegio publica las fotos, en Curso → Fotos escolares ves las de tu hijo y la grupal, con marca de agua. Elegís la opción, en papel o digital, la foto y las copias, ves el total y avisás "Ya pagué". Las digitales, cuando el colegio confirma el pago, las descargás sin marca; las de papel te las entregan impresas. Un globito en Curso te avisa cuando hay fotos nuevas, se confirma el pago o están listas.
• Nuevo: Cambios en la salida. Si un día tu hijo se va más temprano o lo retira otra persona, se lo avisás a la Secretaría del nivel desde Comunicaciones → Salidas, y ves cuando lo leyeron.
• El menú del comedor lo carga el colegio: ya no aparece la opción de subirlo en la pantalla de las familias.
• Los chats ya no muestran el aviso de borrado al terminar el año.
• Colectas, Cumpleaños y Avisos cargan más rápido, y en Avisos podés deslizar hacia abajo para actualizar.
• Con más de un hijo, al elegir uno ves en Hoy y en el Calendario solo sus invitaciones a cumpleaños, no las de sus hermanos.

Para docentes
• Mensaje a todo el curso de una vez, o a las familias que elijas.
• Ves los cambios en la salida de tus alumnos.

Para el colegio
• Panel más simple: lo del día a día adelante, Configuración aparte y un único botón "Crear".
• Primeros pasos en el Inicio, con lo que falta para dejar todo listo.
• Configuración con tarjetas y el estado de cada cosa.
• Ficha por alumno, horarios por curso y filtros nuevos en las bandejas.
• Cada sección abre arriba de todo.

Y mejoras de estabilidad.
```

## App Review — "Notas" (App Store Connect → Información de la revisión de la app)

Igual que 1.14.0 con tres cambios: Comunicaciones suma "Salidas" (Cambios en la salida), Curso suma "Fotos escolares", y el párrafo PAYMENTS explica Fotos escolares. Rutas verificadas contra el código: Curso → Fotos escolares (`(tabs)/fotos`), Comunicaciones → Salidas (`(tabs)/salidas`), Mi cuenta → Eliminar mi cuenta, Mi cuenta → Usuarios bloqueados.

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
Accounts are created by the school from its admin panel (one by one or from a spreadsheet). There is no public sign-up screen in the app. Schools join tribbu through www.tribbu.ar or info@tribbu.ar. A user who forgets their password can reset it from the login screen ("¿Olvidaste tu contraseña?"), which emails a reset link.

PAYMENTS
The app is free: no in-app purchases, subscriptions or ads, and no money is processed through the app. "Colectas" only keeps track of a class collection (for example, a gift for the teacher): families pay outside the app (for example, by bank transfer), can tap "Ya transferí" to let the organizer know, and the organizer confirms it. In "Marketplace", families of the same school can list used items (uniforms, books); tapping "Me interesa" opens an in-app chat with the seller, and they arrange the exchange there (no payment goes through the app). "Fotos escolares" replaces the paper envelope with the yearly class photos: the school shows watermarked previews of each family's own child, the family orders and pays the school directly (transfer or cash, never in the app), and the school marks it paid. The family picks print or digital: prints are handed out at school, and a digital copy of its own child's photo can then be saved. tribbu does not sell photos or take any fee. Demo: Curso → Fotos escolares (illustrations, not real photos).

Account deletion is available in-app under Mi cuenta (circle at the top right) → Eliminar mi cuenta (guideline 5.1.1(v)). Push notifications are scoped to the user's own classrooms. Web version: https://www.tribbu.ar/app · Website: https://www.tribbu.ar
```

## Qué entró realmente (interno, no publicar)

Commits que tocan `mobile/` o `src/lib/` desde 1.14.0 (`4b10f8f`):

- `b05921a` Panel: filtros nuevos en bandejas y filtro por curso en Apoderados.
- `e56e5fc` + `8535115` + `df67f2c` Cambios en la salida (`cambios_salida`, Secretaría del nivel), sin push y con globito; arreglo de push al cambiar de cuenta en el mismo teléfono (trigger `push_tokens_antes_insert`); comillas sin escapar que rompían el CI.
- `7ffdf23` + `4e74961` Docentes: mensaje a todo el curso y a algunas familias; preguntas frecuentes del personal.
- `b3bdca1` Horarios: pantalla más simple, exportar y carga masiva.
- `7d6d3ac` + `1275b2a` + `2156d9c` Panel en modo simple: Configuración aparte, "+ Crear", tarjetas de Configuración y Primeros pasos.
- `6bad859` + `5fc6626` Importar datos y "Descargar modelo" en toda carga por Excel (en la app, nota que remite a la web).
- `8d43f25` Ficha por alumno en el panel de la app.
- `b3127ea` + `c495a1c` Preguntas frecuentes al día.
- `b6d3a95` + `8495de8` + `e644f46` Fotos escolares (`fotos_sesiones`/`fotos`/`fotos_pedidos`, bucket privado `fotos` con marca de agua grabada); recarga del pedido. Causa raíz del último: el formulario se armaba una vez con `useState` y no seguía al pedido al recargar (`firmaPedido`).
- `b02a04e` Comedor: se saca "Subir archivo Excel" de la pantalla de familias (el menú solo lo escribe el colegio, `menu-solo-colegio.sql`: antes cualquier Room Parent podía cambiar el menú de cualquier colegio).
- `26f2785` Panel de la app: scroll arriba al cambiar de sección (un solo ScrollView), Primeros pasos recién con datos cargados, textos de Personas, Directivos en 0 como aviso.
- `44c0e1b` Mensajes: fuera el aviso "Los mensajes se borran al terminar el año lectivo" (ya no era exacto).
- `b536f42` App: menos pedidos en cadena. Colectas de 4 viajes a 1 y Cumpleaños de 6 a 1; Avisos, Autorizaciones y Lost & Found con `useRecarga` (Avisos pedía dos veces al entrar) y pull-to-refresh en Avisos; Comedor de familias trae 2 meses atrás y 6 adelante; "Cargando…" en vez del vacío mientras carga. Causa raíz del doble Hoy al abrir: `cursoIds`/`misHijos` se armaban dentro del `value` de `Session` y cada cambio de la sesión los volvía listas nuevas.
- `f573b92` Fotos escolares: papel o digital por opción (`precio`/`precio_digital`, `guardar_pedido_fotos` con `p_digital`; `fotos-papel-o-digital.sql`, aplicado; las sesiones viejas con "Digital" se leen como solo digitales), globitos rojos (panel y familias) y aviso de curso sin alumnos.
- (`c6b48ef` es solo web: descargar varias fotos seguidas).
- `2d65283` Festejos por hijo: con un hijo elegido, Hoy y Calendario muestran solo sus invitaciones. Causa raíz: el Inicio traía las invitaciones de todos los hijos sin mirar el hijo ni el curso en vista, y con hermanos en el mismo curso el filtro por curso tampoco alcanzaba. Regla compartida en `src/lib/festejos.js` (`invitacionesDelHijo`, `festejosDelHijo`); Cumpleaños marca las invitaciones con su curso en "Todos"; corrige además `festejosRechazados` con hijos que respondieron distinto.
