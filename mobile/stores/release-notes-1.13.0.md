# Release notes 1.13.0 (es-419)

Android vc ? · iOS build ? (completar al armar) · commits `a91bf4d..0c51739` (desde 1.12.0)

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Nuevo: Mensajes. Chateá con otras familias del curso, con las maestras y con Secretaría, sin compartir tu teléfono.
• Grupo del curso, grupos propios y mensajes a varias familias a la vez.
• Las maestras tienen su cuenta: publican avisos, eventos y encuestas en sus cursos.
• Escribile al equipo de tribbu desde Ayuda y soporte.
• Arreglos del teclado en Android.
```

## App Store Connect — "Novedades de esta versión"

```
Llegan los Mensajes a tribbu, y las maestras se suman a la app.

• Mensajes: escribile a otra familia del curso sin compartir tu teléfono ni tu email.
• Grupo del curso: cada curso tiene su grupo con todas las familias. También podés armar tus propios grupos (para un cumple, una salida) o mandarle el mismo mensaje a varias familias, que lo reciben cada una por separado.
• Maestras y Secretaría: chateá con las maestras de tus hijos y con la secretaría del colegio, un chat por cada hijo.
• Por hijo: si elegís a uno de tus hijos arriba, ves solo sus chats y grupos.
• Cuidamos la convivencia: podés silenciar un chat, bloquear a un usuario y denunciar un mensaje. Los chats entre familias son privados: el colegio solo ve los mensajes denunciados.
• Las maestras en tribbu: ven sus cursos, publican avisos, eventos, encuestas y autorizaciones, y ven los cumpleaños de sus alumnos.
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
- QA 2026-10-13 en emulador Android: grupo, difusión, Secretaría, soporte y vista docente (cuenta real de una maestra) — todo OK; los datos de prueba se borraron.
- **Falta** subir `expo.version` a 1.13.0 y probar en un iPhone real (nunca se probó el chat en iOS: teclado, Modal del chat, `Sheet` encadenados).

**Review Notes de ASC**: este release agrega **contenido generado por usuarios** (chat). Apple 1.2 lo exige y ya está: normas que se aceptan antes de escribir a otras familias, **denunciar** mensaje, **bloquear** usuario, y el colegio/tribbu revisa las denuncias. Conviene sumarlo a las Review Notes: "El chat entre familias tiene normas de uso, botón para denunciar mensajes y bloquear usuarios (tocá un mensaje). Las denuncias las revisa el colegio." La cuenta demo (demo@tribbu.app) tiene otra familia en su curso (verificado 2026-10-13), así que el revisor puede abrir un chat y ver el grupo del curso. No cambia login ni alta de cuentas.
