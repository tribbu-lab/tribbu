# Release notes 1.13.0 (es-419)

Android vc43 · iOS build 37 · commits `a91bf4d..a58ef6d` (desde 1.12.0)

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nuevo: Mensajes. Chateá con otras familias del curso, con las maestras y con Secretaría, sin compartir tu teléfono.
• Grupo del curso, grupos propios y mensajes a varias familias a la vez.
• Nuevo: Talleres. Anotá a tus hijos en los talleres del colegio y miralos en su horario.
• Las maestras tienen su cuenta: publican avisos, eventos y encuestas en sus cursos.
• "Más", ordenado y sin repetidos. Sacamos la campana: los avisos están en Avisos.
• Arreglos del teclado en Android.
```

## App Store Connect — "Novedades de esta versión"

```
Llegan los Mensajes y los Talleres a tribbu, y las maestras se suman a la app.

• Mensajes: escribile a otra familia del curso sin compartir tu teléfono ni tu email.
• Grupo del curso: cada curso tiene su grupo con todas las familias. También podés armar tus propios grupos (para un cumple, una salida) o mandarle el mismo mensaje a varias familias, que lo reciben cada una por separado.
• Maestras y Secretaría: chateá con las maestras de tus hijos y con la secretaría del colegio, un chat por cada hijo.
• Por hijo: si elegís a uno de tus hijos arriba, ves solo sus chats y grupos.
• Cuidamos la convivencia: podés silenciar un chat, bloquear a un usuario y denunciar un mensaje. Los chats entre familias son privados: el colegio solo ve los mensajes denunciados.
• Talleres: mirá los talleres extraprogramáticos que ofrece el colegio y anotá a tus hijos desde la app. Si no hay cupo quedás en lista de espera, y te avisamos el día antes de que cierre la inscripción.
• Horario: los talleres de tus hijos aparecen en su horario, también los del sábado.
• Las maestras en tribbu: ven sus cursos, publican avisos, eventos, encuestas y autorizaciones, y ven los cumpleaños de sus alumnos.
• Room Parents: nuevo editor del horario del curso, que carga un bloque en varios días a la vez.
• Menú "Más" ordenado en grupos y sin accesos repetidos. Sacamos la campana del encabezado: los avisos siguen en la pestaña Avisos, con su contador.
• Ayuda y soporte: si algo no anda, escribile directamente al equipo de tribbu desde la app.
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
- QA 2026-10-13 en emulador Android: grupo, difusión, Secretaría, soporte y vista docente (cuenta real de una maestra) — todo OK; los datos de prueba se borraron.
- **Falta** probar en un iPhone real (nunca se probó el chat en iOS: teclado, Modal del chat, `Sheet` encadenados) — hacerlo desde TestFlight antes de enviar a review.

**Review Notes de ASC**: este release agrega **contenido generado por usuarios** (chat). Apple 1.2 lo exige y ya está: normas que se aceptan antes de escribir a otras familias, **denunciar** mensaje, **bloquear** usuario, y el colegio/tribbu revisa las denuncias. Conviene sumarlo a las Review Notes: "El chat entre familias tiene normas de uso, botón para denunciar mensajes y bloquear usuarios (tocá un mensaje). Las denuncias las revisa el colegio." La cuenta demo (demo@tribbu.app) tiene otra familia en su curso (verificado 2026-10-13), así que el revisor puede abrir un chat y ver el grupo del curso. No cambia login ni alta de cuentas: las Review Notes actuales (cuenta demo, sin código) siguen siendo válidas.
