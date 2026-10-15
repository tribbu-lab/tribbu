# Release notes 1.13.0 (es-419)

Android vc45 · iOS build 39 · commits `a91bf4d..cf9ba55` (desde 1.12.0)

> **Reemplaza a vc44 / build 38** (2026-10-14, `a91bf4d..49bc1e0`) y a vc43 / build 37 (2026-10-13), que se subieron pero nunca se promovieron:
> les faltaban los commits del 2026-10-15 (filtros y "+ Nuevo" unificados, buscador, foto de perfil). Promover **solo vc45 / build 39**.
> Subidos el 2026-10-15: Android vc45 → Play interno (submission `36f31718`, Firebase ×2 en `base/resources.pb`, AAB 56 MB); iOS build 39 → ASC (submission `3f9e66b4`, `DTSDKName=iphoneos26.2`). En ASC la versión 1.13.0 todavía no existía, así que no hizo falta bump.

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nueva navegación: Hoy, Agenda, Comunicaciones y Curso. Tu cuenta, con tu foto, en el círculo de arriba.
• Hoy te muestra primero lo que espera tu respuesta.
• Nuevo: Mensajes. Chateá con familias del curso, maestras y Secretaría sin compartir tu teléfono.
• Nuevo: Talleres. Anotá a tus hijos y miralos en su horario.
• Las maestras tienen su cuenta en tribbu.
• Buscador en Avisos y Mensajes, y filtros más simples.
• Arreglos del teclado en Android.
```

## App Store Connect — "Novedades de esta versión"

```
Llegan los Mensajes y los Talleres, las maestras se suman a tribbu y estrenamos una navegación más simple.

• Nueva navegación en cuatro secciones: Hoy, Agenda (calendario, horario y cumpleaños), Comunicaciones (avisos y mensajes) y Curso (lo del colegio y lo que organizan las familias). Tu cuenta, las notificaciones y la ayuda están en el círculo de arriba a la derecha.
• Se fueron el menú "Más" y la campana: lo que estaba en "Más" ahora está en Curso o en tu cuenta, y los avisos están en Comunicaciones, con su contador.
• Foto de perfil: poné tu foto desde tu cuenta y se ve en el círculo de arriba. Si sos Room Parent, ahora lo ves en tu cuenta en vez de en el encabezado.
• Hoy: arranca con lo que espera tu respuesta (autorizaciones, colectas, invitaciones, encuestas), con lo más urgente primero y la fecha en que cierra cada cosa; lo que vence en los próximos dos días aparece en rojo. Después, los avisos sin leer, los próximos días (con los cumpleaños a los que están invitados tus hijos) y el menú del comedor.
• Objetos encontrados: si esta semana encontraron algo, Hoy te pregunta si es de tu hijo. Podés verlo, o decir que no y deja de preguntarte.
• Elegí a qué hijo mirar desde "Todos mis hijos", arriba de cada sección.
• Más simple en todas las pantallas: un mismo botón "+ Nuevo" para crear y un botón "Filtros" para filtrar.
• Buscá en Avisos y en Mensajes.
• Comedor: el menú dividido en Entrada, Plato principal y Postre, igual en Hoy y en Comedor.
• Colectas: las activas aparecen primero. Al elegir responsable, solo aparecen las familias del curso, en orden alfabético.
• Autorizaciones: respondé directo desde Hoy. Ves hasta cuándo podés responder, la fecha de la salida y lo que respondiste por cada hijo.
• Mensajes: escribile a otra familia del curso sin compartir tu teléfono ni tu email. El ícono de arriba te lleva a tus chats y te muestra cuántos mensajes tenés sin leer.
• Grupo del curso: cada curso tiene su grupo con todas las familias. También podés armar tus propios grupos (para un cumple, una salida) o mandarle el mismo mensaje a varias familias, que lo reciben cada una por separado.
• Maestras y Secretaría: chateá con las maestras de tus hijos y con la secretaría del colegio, un chat por cada hijo. También desde Contacto, con "Escribir por tribbu".
• Por hijo: si elegís a uno de tus hijos, ves solo sus chats y grupos.
• Borrá un chat de tu lista, o eliminá un grupo que creaste.
• Cuidamos la convivencia: antes de escribirle a otra familia aceptás las normas del chat, y podés silenciar un chat, bloquear a un usuario y denunciar un mensaje. Los chats entre familias son privados: el colegio solo ve los mensajes denunciados.
• Talleres: mirá los talleres extraprogramáticos que ofrece el colegio y anotá a tus hijos desde la app. Si no hay cupo quedás en lista de espera, y te avisamos el día antes de que cierre la inscripción.
• Horario: ahora tiene su propia pestaña en Agenda, con los talleres de tus hijos, también los del sábado.
• Las maestras en tribbu: ven sus cursos, publican avisos, eventos, encuestas y autorizaciones, y ven los cumpleaños de sus alumnos.
• Room Parents: nuevo editor del horario del curso, que carga un bloque en varios días a la vez.
• Cumpleaños: "Mis invitaciones" ya no muestra festejos que ya pasaron.
• Ayuda y soporte: si algo no anda, escribile directamente al equipo de tribbu desde tu cuenta.
• Arreglamos el teclado en Android, que dejaba un espacio vacío al cerrarse en el chat y en los formularios.
```

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/`.

- `0569478` — Mensajes fase 1: 1 a 1 entre familias que comparten curso, soporte (super), maestras (tipo `docente`) y Secretaría (tipo `colegio`, responde colegio_admin), normas del chat (Apple 1.2), denunciar/bloquear/silenciar, push server-side (`mensajes-push`), retención anual (`mensajes-retencion`), Realtime. Ruta oculta `(tabs)/mensajes`, ícono en `AppHeader`, Más → Cuenta → Ayuda y soporte / Usuarios bloqueados. SQL `mensajes.sql` + `mensajes-docentes.sql`.
- `363caab` + `7bba759` — Materias y clases (panel mobile: módulo "📚 Materias"); `maestro_cursos` y `maestros.materia` pasan a derivarse de `clases`. Unificar/eliminar materia, cambiar la materia de una clase; `useConfirmar` en vez de `window.confirm`.
- `fbfeabe` — rol `docente` con layout normal: "Mi acceso" con sus cursos (`itemsDeDocente`), publica en Avisos/Calendario/Encuestas/Autorizaciones, Alumnos → "Escribir a la familia", etiqueta "👩‍🏫 Nombre · Materia" en Avisos. `getUserIdsByCurso` pasa a la RPC `usuarios_de_curso`. Se eliminó el stack `(docente)`.
- `c7eb99f` — grupo del curso (automático), grupos propios (`crear_grupo`/`editar_grupo`/`salir_de_grupo`, máx. 50), difusión (`enviar_difusion`), moderación del grupo, bloquear desde un grupo.
- `639de47` + `62f72de` — con un hijo elegido, la lista de Mensajes, los grupos y "Nuevo mensaje" (Familias/Maestras/Secretaría) muestran solo lo de ese hijo; los chats nuevos quedan en ese curso (`p_curso`).
- `edcae15` + `97ea900` — Android: estado vacío del chat se veía espejado (FlatList `inverted`) → se dibuja fuera de la lista; hueco bajo el compositor y bajo los `Sheet` al cerrar el teclado → `useTecladoAbierto` + `KeyboardAvoidingView enabled` solo con teclado abierto.
- `3f7124e` — docente: sin los switches de avisos automáticos en Más.
- `0c51739` — docente: pestaña Cumpleaños en solo lectura (RPC `cumples_para_docente`).
- `2a20660` — bump `expo.version` 1.13.0.
- `c543b63` — panel mobile, Materias: sección "Clases" en la hoja de la materia (curso · año — maestra, "Quitar"); antes las clases de cursos de otro año no se podían ver ni quitar.
- `49ff952` + `250b370` — editor de horarios compartido (`mobile/features/horarios`, `@shared/horarios`): Super Admin + Room Parent, un bloque en varios días, copiar día / copiar de otro curso, aviso de superposición, sábado. Reemplaza el form de texto libre del Room Parent, que guardaba "Miercoles" sin tilde y por eso no mostraba los bloques del miércoles. Talleres optativos (`clases.optativa` + `clase_alumnos`): la familia solo ve el bloque si su hijo está anotado. Bloques viejos sin `clase_id` marcados con ⚠️.
- `c8b6eed` + `4ed3b7d` + `5251e01` — Talleres extraprogramáticos: `(tabs)/talleres` (tile en Más, push `taller` → `openTaller`), inscripción/baja/espera vía RPC con lock de cupo, modos orden de llegada/aprobación/sorteo; panel del colegio módulo "🎨 Talleres" (gestionar; crear/editar es web); Calendario → Horario suma los talleres del hijo; Muro: "🎨 Inscripción abierta". Nuevo switch `taller_cierre` en Notificaciones (`@shared/avisos`). El aviso automático "Mañana cierra la inscripción" vive en `avisos-automaticos`, redesplegada el 2026-10-13 19:24 (v8, después del commit) — la viñeta de ASC que lo menciona ya es cierta.
- `62030d2` — Admin del Room Parent: las 4 pestañas se deslizan; Encuestas: filtros deslizables con "+ Nueva" fijo (no entraban en pantallas angostas).
- `a58ef6d` — `AppHeader` sin campana (duplicaba Avisos, que conserva el badge vía `useNotificaciones`); "Más" agrupado Del día a día / Del colegio / Room Parent, sin los tiles repetidos de Mensajes y Lost & Found.
- **Agregados en vc44 / build 38** (2026-10-14, `a58ef6d..49bc1e0`):
- `1b433fb` — navegación en 4 secciones Hoy · Agenda · Comunicaciones · Curso (`FloatingTabBar` con `rutas` por sección, `SubTabs` en calendario/cumples/recordatorios/mensajes). "Curso" (`app/(tabs)/curso.jsx`) reemplaza a "Más", con contador de autorizaciones/colectas/encuestas pendientes (`@shared/gestiones`); vuelve Lost & Found, que se había perdido al limpiar "Más" en `a58ef6d`. "Mi cuenta" (`cuenta.jsx`, ex `mas.jsx`) desde el círculo con las iniciales del `AppHeader`; Notificaciones en su propia `Sheet`. Selector "Todos mis hijos ▾" (`SelectorHijos`) arriba de cada sección en vez de la fila del header. Sale el ícono de Mensajes del header.
- `ac6ff09` — Cumpleaños → "Mis invitaciones" filtraba solo por tipo festejo + hijo, sin fecha, así que listaba festejos pasados y desordenados → `invitacionesVigentes` (`@shared/festejos`).
- `7a9f4cf` — Inicio "Hoy": "Tenés N respuestas pendientes" (solo lo que pide acción, `ordenarPorVencimiento`, la primera destacada con `avisoVencimiento`), avisos sin leer aparte con "Leer aviso" (sale "Marcar leído" del Inicio), Próximos días sin chips, Menú de hoy en tabla (`filasMenu`). Sigue en 2 lotes.
- `721e0c1` — Autorizaciones: "Responder" desde Hoy abre directo la `ResponderSheet` del primer hijo sin responder (`openAutorizacion` + `t`); `estadoConvocatoria`, "Salida" / "Responder hasta" (ámbar con `limiteCercano`), `textoConfirmacion`, `textoRespuesta`.
- `cb91afa` — "‹ Curso" (`VolverCurso`/`ConVolverCurso`) arriba de las 11 pantallas de la sección Curso.
- `a743d03` — normas del chat con checkbox, dibujadas DENTRO del chat (antes "Leer normas" abría una `Sheet` encima del Modal del chat, que iOS no apila); Contacto → "Escribir por tribbu" (Secretaría por hijo + maestras con cuenta, `contactosPorTribbu`).
- `49bc1e0` — "Borrar chat" 1 a 1 (`ocultar_conversacion`, solo de mi lista) y "Eliminar grupo" (`eliminar_grupo`, solo el creador). SQL `mensajes-borrar.sql` ya aplicado en prod.
- **Agregados en vc45 / build 39** (2026-10-15, `49bc1e0..cf9ba55`; `a696f2b` es solo web y `0639c8d` es la landing — no viajan en el binario):
- `3f664c3` — criterios de UI unificados: un solo `BotonNuevo` y un solo botón "Filtros" (`components/Filtros.jsx`: `BotonFiltros`/`FiltrosSheet`, grupos como chips + "Limpiar filtros"/"Listo") en Avisos, Mensajes, Calendario, Cumpleaños, Colectas, Encuestas, Autorizaciones, Lost & Found y Marketplace. Agenda = Calendario · Horario · Cumpleaños (nueva ruta `(tabs)/horario` con `Calendario soloHorario`). Menú del comedor con las mismas categorías en Inicio y Comedor (`TablaMenu`, `@shared/menu`: `CATEGORIAS_MENU`/`filasMenu`; `acompanamiento` = Plato principal 3). **Vuelve el ícono de Mensajes al `AppHeader`**, con globito (lo había sacado `1b433fb`). Inicio: vencimiento ≤2 días en rojo (`DIAS_URGENTE`), colectas/encuestas con "Cierra el …", festejos no rechazados en Próximos días, "¿Es de tu hijo? Ver / No" en objetos encontrados (`claveEncontradosVistos`, en AsyncStorage). Colectas: activas primero (`ordenarColectas`), responsable solo familias del curso, alfabético (`responsablesParaCurso`). Lost & Found sin emojis ni etiquetas de colores.
- `bbcaa1a` — `Buscador` en Avisos (título + texto) y Mensajes (nombre, familia, último mensaje), sin acentos (`coincideTexto`, `filtrarConversaciones`). Soporte sale de la lista de Mensajes (queda en Mi cuenta → Ayuda y soporte; solo aparece en la lista con una respuesta sin leer). Sin emojis en títulos.
- `cf9ba55` — foto de perfil: `usuarios.foto_url` + RPC `actualizar_mi_foto` (SQL `perfil-foto.sql`, aplicado en prod), `lib/fotoPerfil.js` + `AvatarPerfil` en el header y en Mi cuenta. "Room Parent" deja de ser cartel del header: "Room Parent de 4°B" en Mi cuenta.
- QA 2026-10-13 en emulador Android: grupo, difusión, Secretaría, soporte y vista docente (cuenta real de una maestra) — todo OK; los datos de prueba se borraron.
- **Falta** probar en un iPhone real desde TestFlight (build 39) antes de enviar a review: el chat (teclado, Modal del chat, `Sheet` encadenados, normas dentro del chat), la navegación nueva (Hoy, "Todos mis hijos", Mi cuenta → Eliminar mi cuenta, "‹ Curso"), la `FiltrosSheet` y subir/quitar la foto de perfil (picker de imágenes + Storage). Nada de 1.13.0 se probó en un dispositivo todavía.

**Review Notes de ASC — HAY QUE ACTUALIZARLAS antes de `/store-promote`.** `promover-release.mjs` reusa las de 1.12.0, que quedaron **inválidas con la navegación nueva**: describen pestañas Inicio / Calendario / Cumpleaños / Avisos / Más, y dicen que la baja de cuenta está en **"Más → Eliminar mi cuenta"** — "Más" ya no existe (ahora es Mi cuenta, desde el círculo con las iniciales). Un revisor que no encuentra la baja de cuenta rechaza por 5.1.1(v). No cambia el login ni el alta de cuentas: la cuenta demo (demo@tribbu.app, sin código) sigue siendo válida. Además este release agrega **contenido generado por usuarios** (chat, Apple 1.2): normas que se aceptan antes de escribir a otras familias, denunciar mensaje, bloquear usuario, y las denuncias las revisa el colegio. La cuenta demo tiene otra familia en su curso (verificado 2026-10-13), así que el revisor puede abrir un chat y ver el grupo del curso. Ajustado 2026-10-15 a build 39: Horario es pestaña propia de Agenda, el círculo puede mostrar la foto de perfil y el chat se abre con "+ Nuevo" (o el ícono de Mensajes del header).

Texto propuesto (reemplaza las Review Notes completas):

```
tribbu is a school-community app for parents and guardians of school-age children. Any school can adopt it; it is not built for or restricted to a single organization.

HOW TO REVIEW
Sign in with the demo account provided above. It belongs to "María", parent of Sofía in the demo classroom "3°A - Primaria" of "Colegio Demo tribbu" (a sample school with no real families). María is also that classroom's Room Parent (the volunteer parent who coordinates the class), so she can create content too. The app has four sections in the bottom bar, pre-loaded with sample data:
• Hoy (Today): what is waiting for the family's answer (a permission slip, a class fundraiser, a birthday party invitation, a poll), unread notices, the next days and today's lunch menu.
• Agenda: Calendario (class events), Horario (the weekly class timetable) and Cumpleaños (classmates' birthdays and party invitations).
• Comunicaciones: Avisos (class and school notices, with read receipts) and Mensajes (chat).
• Curso: Autorizaciones (permission slips), Comedor (lunch menu), Talleres (after-school workshops), Info útil, Contacto, Colectas (fundraisers), Encuestas (polls), Marketplace (used items among families of the same school) and Lost & Found.
The account menu (Mi cuenta) opens from the circle with the user's initials (or profile photo), top right. The chat bubble icon next to it opens Mensajes.

USER-GENERATED CONTENT (Mensajes)
Families of the same classroom can message each other, the classroom group, the teachers and the school office. Before writing to other families, users must accept the chat rules (no offensive content, no spam). Any message can be reported (tap a message → Denunciar) and any user can be blocked (from the chat menu in a one-to-one chat, or by tapping their message in a group → Bloquear); reports are reviewed by the school, and blocked users can be managed in Mi cuenta → Usuarios bloqueados. Phone numbers and emails are never shown in the chat. The demo classroom has another family, so a chat can be opened from Comunicaciones → Mensajes → + Nuevo.

HOW USERS GET AN ACCOUNT
Accounts are created by the school: the school's administrator adds each family from the school's admin panel (one by one or by importing a spreadsheet) and gives the family its login. There is no public sign-up screen in the app. Schools join tribbu through www.tribbu.ar or info@tribbu.ar. A user who forgets their password can reset it from the login screen ("¿Olvidaste tu contraseña?"), which emails a reset link.

PAYMENTS
The app is free: no in-app purchases, subscriptions or ads. "Colectas" only records which families have already contributed to a class gift; no money is processed through the app. In "Marketplace", families of the same school can list used items (uniforms, books); buyer and seller arrange the exchange directly, outside the app.

Account deletion is available in-app under Mi cuenta (circle with the initials or profile photo, top right) → Eliminar mi cuenta (guideline 5.1.1(v)). Push notifications are scoped to the user's own classrooms. Web version: https://www.tribbu.ar/app · Website: https://www.tribbu.ar
```

Antes de pegarlo, verificar en la app con la cuenta demo: (1) Denunciar al tocar un mensaje y Bloquear desde el menú del chat 1 a 1 (verificado en el código: `tocarMensaje` / `cambiarBloqueo`; "Usuarios bloqueados" está en `cuenta.jsx`), (2) que Hoy de la cuenta demo tenga lo que dice el texto (los datos demo tienen fechas oct–nov 2026).
