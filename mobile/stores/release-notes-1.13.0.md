# Release notes 1.13.0 (es-419)

Android vc48 · iOS build 42 · commits `a91bf4d..c4dd095` (desde 1.12.0)

> **Reemplaza a vc47 / build 41** (2026-10-16 mañana, `a91bf4d..fd98303`), vc46 / build 40 (2026-10-15 noche), vc45 / build 39 (2026-10-15 tarde), vc44 / build 38 (2026-10-14) y vc43 / build 37 (2026-10-13), que se subieron pero nunca se promovieron.
> vc47 / build 41 no tenían `8a227cc` (Lost & Found con Perdidos primero) ni `c4dd095` (Próximos de Agenda como "Próximos días", platos largos del menú que se salían de la tabla), que entraron a origin el 2026-10-16 después del build. Promover **solo vc48 / build 42**.
> Antes: vc47 → Play interno (submission `426d673a`), build 41 → ASC (submission `5cd2b8f1`, ERRORED en Expo por errores 500 de Apple pero subido — confirmado en `buildUploads`). En ASC la versión 1.13.0 todavía no existe, así que no hace falta bump.
> Subidos el 2026-10-16 (noche): Android vc48 → Play interno (submission `215bbb4f`, Firebase ×2 en `base/resources.pb`, AAB 56 MB); iOS build 42 → ASC (submission `c3707cc7`, `DTSDKName=iphoneos26.2`, IPA 15 MB).

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nueva navegación: Hoy, Agenda, Comunicaciones y Curso. Sumá tu foto de perfil.
• Hoy te muestra primero lo que espera tu respuesta.
• Nuevo: Mensajes. Chateá con familias del curso, maestras y Secretaría sin compartir tu teléfono.
• Nuevo: Talleres. Anotá a tus hijos y miralos en su horario.
• Colectas: avisá "Ya transferí" y quien recauda lo confirma.
• Las maestras tienen su cuenta en tribbu.
• Avisos más claros, buscador y filtros más simples.
• Arreglos del teclado en Android.
```

## App Store Connect — "Novedades de esta versión"

```
Llegan los Mensajes y los Talleres, las maestras se suman a tribbu y estrenamos una navegación más simple.

• Nueva navegación en cuatro secciones: Hoy, Agenda (calendario, horario y cumpleaños), Comunicaciones (avisos y mensajes) y Curso (lo del colegio y lo que organizan las familias). Tu cuenta, las notificaciones y la ayuda están en el círculo de arriba a la derecha.
• Se fueron el menú "Más" y la campana: lo que estaba en "Más" ahora está en Curso o en tu cuenta, y los avisos están en Comunicaciones, con su contador.
• Foto de perfil: poné tu foto desde tu cuenta y se ve en el círculo de arriba. Si sos Room Parent, ahora lo ves en tu cuenta en vez de en el encabezado.
• Hoy: arranca con lo que espera tu respuesta (autorizaciones, colectas, invitaciones, encuestas), con lo más urgente primero y la fecha en que cierra cada cosa; lo que vence en los próximos dos días aparece en rojo. Después, las novedades (avisos sin leer y objetos encontrados), los próximos cinco días (con los cumpleaños a los que están invitados tus hijos) y el menú del comedor.
• Objetos encontrados: si esta semana encontraron algo, Hoy te pregunta si es de tu hijo. Podés verlo, o decir que no y deja de preguntarte.
• Elegí a qué hijo mirar desde "Todos mis hijos", arriba de cada sección.
• Más simple en todas las pantallas: un mismo botón "+ Nuevo" para crear y un botón "Filtros" para filtrar.
• Avisos en tarjetas: arriba, los importantes que todavía no leíste, con "Entendido" para marcarlos leídos. Abajo, los recientes, con de quién viene cada uno, hace cuánto llegó y su foto. "Marcar todos como leídos" de un toque. Se fue el historial de alertas del final de Avisos.
• Buscá en Avisos y en Mensajes.
• Comedor: el menú dividido en Entrada, Plato principal y Postre, igual en Hoy y en Comedor.
• Colectas: cuando transferiste, avisá "Ya transferí" y quien recauda recibe una notificación para confirmarlo. Las activas aparecen primero y, al elegir responsable, solo aparecen las familias del curso, en orden alfabético.
• Autorizaciones: respondé directo desde Hoy. Ves hasta cuándo podés responder, la fecha de la salida y lo que respondiste por cada hijo.
• Mensajes: escribile a otra familia del curso sin compartir tu teléfono ni tu email. El ícono de arriba te lleva a tus chats y te muestra cuántos mensajes tenés sin leer.
• Grupo del curso: cada curso tiene su grupo con todas las familias. También podés armar tus propios grupos (para un cumple, una salida) o mandarle el mismo mensaje a varias familias, que lo reciben cada una por separado.
• Maestras y Secretaría: chateá con las maestras de tus hijos y con la secretaría del colegio, un chat por cada hijo. También desde Contacto, con "Escribir por tribbu".
• Por hijo: si elegís a uno de tus hijos, ves solo sus chats y grupos.
• Borrá un chat de tu lista, o eliminá un grupo que creaste.
• Cuidamos la convivencia: antes de escribirle a otra familia aceptás las normas del chat, y podés silenciar un chat, bloquear a un usuario y denunciar un mensaje. Los chats entre familias son privados: el colegio solo ve los mensajes denunciados.
• Talleres: mirá los talleres extraprogramáticos que ofrece el colegio y anotá a tus hijos desde la app. Si no hay cupo quedás en lista de espera, y te avisamos el día antes de que cierre la inscripción.
• Horario: ahora tiene su propia pestaña en Agenda y muestra un día por vez, empezando por hoy, con los talleres de tus hijos, también los del sábado.
• Las maestras en tribbu: ven sus cursos, publican avisos, eventos, encuestas y autorizaciones, y ven los cumpleaños de sus alumnos.
• Room Parents: nuevo editor del horario del curso, que carga un bloque en varios días a la vez.
• Cumpleaños: "Mis invitaciones" ya no muestra festejos que ya pasaron.
• Ayuda y soporte: si algo no anda, escribile directamente al equipo de tribbu desde tu cuenta.
• Arreglamos el teclado en Android, que dejaba un espacio vacío al cerrarse en el chat y en los formularios.
```

## App Review — "Notas" (App Store Connect → Información de la revisión de la app)

`/store-promote` carga este bloque en la versión de ASC (solo el campo de notas: el contacto y la cuenta demo, usuario y contraseña, quedan como están). Reemplaza a las de 1.12.0, que mandaban a "Más → Eliminar mi cuenta" y "Más" ya no existe (riesgo de rechazo 5.1.1(v)). Login y alta de cuentas no cambiaron: la cuenta demo (demo@tribbu.app, sin código) sigue valiendo.

```
tribbu is a school-community app for parents and guardians of school-age children. Any school can adopt it; it is not built for or restricted to a single organization.

HOW TO REVIEW
Sign in with the demo account provided above. It belongs to "María", parent of Sofía in the demo classroom "3°A - Primaria" of "Colegio Demo tribbu" (a sample school with no real families). María is also that classroom's Room Parent (the volunteer parent who coordinates the class), so she can create content too. The account is pre-loaded with sample data. The app has four sections in the bottom bar:
• Hoy (Today): anything waiting for the family's answer (permission slips, class fundraisers, party invitations, polls), most urgent first; then Novedades (unread notices and found items), the next five days and today's lunch menu. When nothing is pending it shows "Estás al día" (you're all caught up).
• Agenda: Calendario (class events), Horario (the weekly class timetable, one day at a time) and Cumpleaños (classmates' birthdays and party invitations).
• Comunicaciones: Avisos (class and school notices, with read receipts) and Mensajes (chat).
• Curso: Autorizaciones (permission slips), Comedor (lunch menu), Talleres (after-school workshops), Info útil, Contacto, Colectas (class fundraisers), Encuestas (polls), Marketplace (used items among families of the same school) and Lost & Found.
The account menu (Mi cuenta) opens from the circle with the user's initials (or profile photo) at the top right; the chat bubble icon next to it opens Mensajes.

USER-GENERATED CONTENT (Mensajes)
Families of the same classroom can message each other and the classroom group, and write to their children's teachers and to the school office. Before writing to other families, users must accept the chat rules (no offensive content, no spam). Any message from another family can be reported (tap the message → Denunciar), and any user can be blocked (from the menu of a one-to-one chat, or by tapping their message in a group → Bloquear). Reports are reviewed by the school; blocked users are managed in Mi cuenta → Usuarios bloqueados. Phone numbers and emails are never shown in the chat. The demo classroom has another family, so a chat can be started from Comunicaciones → Mensajes → + Nuevo.

HOW USERS GET AN ACCOUNT
Accounts are created by the school: the school's administrator adds each family from the school's admin panel (one by one or by importing a spreadsheet) and gives the family its login. There is no public sign-up screen in the app. Schools join tribbu through www.tribbu.ar or info@tribbu.ar. A user who forgets their password can reset it from the login screen ("¿Olvidaste tu contraseña?"), which emails a reset link.

PAYMENTS
The app is free: no in-app purchases, subscriptions or ads, and no money is processed through the app. "Colectas" only keeps track of a class collection (for example, a gift for the teacher): families pay outside the app (for example, by bank transfer), can tap "Ya transferí" to let the organizer know, and the organizer confirms it. In "Marketplace", families of the same school can list used items (uniforms, books); buyer and seller arrange the exchange directly, outside the app.

Account deletion is available in-app under Mi cuenta (circle at the top right) → Eliminar mi cuenta (guideline 5.1.1(v)). Push notifications are scoped to the user's own classrooms. Web version: https://www.tribbu.ar/app · Website: https://www.tribbu.ar
```

Revisado 2026-10-19 contra el código de build 42 y los datos de la cuenta demo:
- Rutas verificadas en `mobile/`: círculo de Mi cuenta arriba a la derecha con el ícono de Mensajes al lado (`AppHeader`), "Usuarios bloqueados" y "Eliminar mi cuenta" en `cuenta.jsx`, "Denunciar" (y "Bloquear" en grupos) al tocar un mensaje de otra familia (`tocarMensaje`), "Bloquear" desde el menú del chat 1 a 1 (`cambiarBloqueo`), "Ya transferí" en Colectas.
- La línea de Hoy describe la pantalla sin prometer pendientes concretos: al 2026-10-19 la cuenta demo casi no tiene (autorización cerrada el 13/10, colecta de Sofía pagada, cumple de Mateo el 10/10, encuesta que cierra el 20/10, ningún evento hasta el 10/11). Si se corren las fechas del colegio demo, se pueden volver a nombrar.
- Apple 1.2: la otra familia del curso (Carolina) no tiene login, así que el revisor no tiene ningún mensaje ajeno sobre el que probar "Denunciar"/"Bloquear" salvo que se le cargue uno en el grupo del curso.

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
- **Agregado en vc46 / build 40** (2026-10-15 noche; `16ee672` es la landing):
- `1bfd635` — Avisos en tarjetas (`mobile/features/recordatorios`): "Requiere tu atención" = prioridad alta/urgente sin leer (`AvisoAtencion`, "Ver comunicado" / "Entendido"), "Recientes" paginado con "Marcar todos como leídos", pill de prioridad, origen, `haceCuanto`, punto de no leído, miniatura de la primera foto (`@shared/avisosLista`: `separarAvisos`, `fechaDelAviso`, `origenAviso`, `fotoDelAviso`). Sale `HistorialComunicados` (el desplegable de alertas pasadas al pie de Avisos). Colectas: `colecta_pagos.estado` `informado` — la familia toca "Ya transferí", quien recauda confirma desde "Ver pagos"; push `colecta_pago` → `(tabs)/finanzas` con `openColecta` (`useNotificationRouting`); `informado` deja de contar como pendiente (`estadoPago`/`avisarPagoA` en `@shared/muro`). SQL `colectas-informar-pago.sql` aplicado y `send-push`/`avisos-automaticos` redeployadas **antes** del build: las versiones viejas (1.12.0 en producción, build 39) no se rompen — la familia nunca escribía el estado desde la app — pero muestran un pago `informado` como deuda y el push `colecta_pago` no abre la colecta. Inicio: "Comunicaciones" pasa a "Novedades" (Lost & Found adentro), Próximos días a `DIAS_PROXIMOS` = 5, todas las acciones de pendientes como enlace (colecta: "Ver datos para pagar").
- **Agregado en vc47 / build 41** (2026-10-16; `1ccecc3` = claves nuevas de Supabase, solo Edge Functions/web/scripts — la app de tiendas ya usaba la publishable `sb_publishable_…` en `eas.json` desde julio, así que la desactivación de las claves legacy no rompe 1.12.0 ni este build):
- `fd98303` — `EmptyState` único con ícono de línea (sin emojis) en Avisos, Mensajes, Marketplace, Lost & Found, Encuestas (con "Crear encuesta"), Calendario y Cumpleaños. Horario de la familia: un día por vez (`DiasHorario`/`HorarioDia`, pestañas Lun–Vie(+Sáb), arranca en hoy o en el primer día con clases, color de la materia como rayita) en vez de la grilla con scroll horizontal. Cumpleaños sin título repetido (lo da la pestaña), monto del regalo en el subtítulo, acciones como enlaces ("Ver festejo →", "Crear festejo →", "Armar colecta →"), maestras en gris. Admin del Room Parent: "Administrar el curso", alerta urgente como tarjeta, pestañas como `SubTabs`; "Familias sin registrar" ya no menciona el código de invitación. Encuestas: ícono `chart-box-outline` y bajada "Consultas entre las familias del curso". Sin cambios de datos ni de SQL.
- **Agregados en vc48 / build 42** (2026-10-16 tarde; las capturas de `public/` son de la landing):
- `8a227cc` — Lost & Found: pestañas Perdidos · Encontrados (antes Encontrados · Buscan), abre en Perdidos; el "Ver" de encontrados del Inicio abre Encontrados (`(tabs)/perdidos` acepta `tab`, con nonce `t`). La etiqueta de los posts "perdido" pasa de "Buscan" a "Perdido".
- `c4dd095` — Agenda → Próximos: fecha en columna (como "Próximos días" del Inicio), sin emoji ni raya de color, tipo/rango/hora como texto, lugar con ícono de línea, "Invitados →" / "Asistencia →" como enlaces, editar/borrar con íconos de línea; lo mismo en los eventos del día de la vista Mes. Menú: `platoCortable` (`@shared/menu`) mete un espacio de ancho cero después de cada "/" para que "Tomate/Jamon/Huevo/Cebolla" corte en vez de salirse de `TablaMenu` (Inicio y Comedor).
- Las Novedades públicas no cambian: son ajustes visuales de pantallas que ya están en las notas.
- QA 2026-10-13 en emulador Android: grupo, difusión, Secretaría, soporte y vista docente (cuenta real de una maestra) — todo OK; los datos de prueba se borraron.
- **Falta** probar en un iPhone real desde TestFlight (build 42) antes de enviar a review: el chat (teclado, Modal del chat, `Sheet` encadenados, normas dentro del chat), la navegación nueva (Hoy, "Todos mis hijos", Mi cuenta → Eliminar mi cuenta, "‹ Curso"), la `FiltrosSheet`, subir/quitar la foto de perfil (picker de imágenes + Storage), Avisos en tarjetas, "Ya transferí" → push a quien recauda → Confirmar, y el Horario de a un día. Nada de 1.13.0 se probó en un dispositivo todavía.

**Review Notes**: ver la sección "App Review" de arriba; `/store-promote` las carga solo.
