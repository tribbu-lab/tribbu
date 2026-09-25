# Release notes 1.10.0 (es-419)

Android vc37 · iOS build 26 · commits `fab95c4..3891e6b` (desde 1.6.1; 1.7.0 vc34/b23, 1.8.0 vc35/b24 y 1.9.0 vc36/b25 se subieron pero se reemplazan por esta, nunca se publican)

## Google Play — "Novedades" (máx. 500 caracteres)

```
Novedades:

• Comunidad: Marketplace para vender o regalar cosas usadas, y Lost&Found.
• Autorizaciones digitales para salidas y actividades.
• Recordatorios automáticos de eventos, colectas y resumen semanal (Más → Notificaciones).
• Tocar una notificación te lleva directo a lo que la originó.
• Festejos solo para invitados, con edad de los hermanos.
• Avisos con título y horario.
• Correcciones en Calendario, colectas y formularios.
```

## App Store Connect — "Novedades de esta versión"

```
Una versión grande, con varias herramientas nuevas para la comunidad del curso.

• Comunidad: una sección nueva en Más que reúne el Marketplace, Lost&Found y, próximamente, Servicios.
• Marketplace: vendé o regalá lo que tus hijos ya no usan (ropa, uniformes, libros, juguetes). Publicá con hasta 3 fotos, precio o "Lo regalo", para tu curso o todo el colegio. Con "Me interesa" le avisamos al vendedor y se comparten los contactos.

• Autorizaciones digitales: el colegio o el Room Parent te pide autorización para una salida o actividad y la respondés desde la app, por cada hijo, con comentario opcional. Si falta tu respuesta, te avisamos un día antes del cierre.
• Lost&Found (perdidos y encontrados), ahora dentro de Comunidad: publicá lo que tu hijo perdió o lo que encontraste, con foto. Si alguien encuentra algo parecido a lo que buscás, te avisamos; y con "¡Es mío!" o "Lo tengo yo" se contactan sin exponer datos de nadie. Lo que ya tiene un aviso se marca como reclamado, y lo resuelto sigue a la vista hasta que vence.
• Recordatorios automáticos: un aviso la tarde anterior con los eventos del día siguiente, las colectas por vencer y un resumen de la semana los domingos. Podés elegir cuáles recibir en Más → Notificaciones.
• Confirmación de lectura: quien publica un aviso puede ver cuántas familias ya lo leyeron y quiénes faltan.
• Festejos más privados: cada festejo lo ven solo las familias invitadas. Al confirmar asistencia podés indicar la edad de los hermanos (opcional).
• Avisos con título y horario: los recordatorios pueden llevar un título y un horario de inicio y fin; los que tienen horario se suman a tu calendario sincronizado.
• Calendario: ahora muestra también las comunicaciones del colegio con fecha, siempre muestra el horario de los eventos que lo tienen, y te confirma cuando Google Calendar ya está leyendo tu calendario.
• Notificaciones: tocar una notificación te lleva directo a lo que la originó (el aviso, la colecta, el cumpleaños), también desde la campanita.
• Colectas: quien es responsable de una colecta también la puede cerrar, y si sigue abierta mucho después de la fecha límite te preguntamos si ya terminó.
• Pantallas siempre al día: Calendario, Colectas, Encuestas, Cumpleaños, Comedor y el Inicio se actualizan al volver a ellas, y podés deslizar hacia abajo para refrescar.
• Permisos más claros: cada aviso, evento o colecta lo edita o borra quien lo publicó (o quien la organiza), no cualquier familia del curso.
• Colores del colegio: la app toma el color de marca de tu colegio.
• Correcciones: "hoy" ya no salta al día siguiente después de las 21 h (menú del día, avisos pendientes, fechas de pago), ya se pueden borrar eventos con confirmación de asistencia, los pendientes del Inicio no muestran encuestas eliminadas ni alertas repetidas, en Android el teclado ya no tapa los campos de ningún formulario, y quien creó un evento siempre puede editarlo o borrarlo.
```

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/` (lo que viaja en el binario). El resto del rango es web, landing, CI, docs o backend.

**Features**
- `3d1a471` + `1708695` — Autorizaciones digitales (`mobile/features/autorizaciones`, ruta oculta `(tabs)/autorizaciones`, tile en Más, pendientes en Muro). Push `autorizacion`; aviso automático "Falta tu respuesta" cuando `fecha_limite` es mañana.
- `ded4912` — Perdidos y encontrados (`(tabs)/perdidos`, `@shared/perdidos`, card en Muro, push `perdido`). **Pendiente en PENDIENTES.md: probarlo en el celular.**
- `eb82e2b` + `1708695` — avisos automáticos (diario/semanal, Edge Function + pg_cron) y `preferencias_avisos` con switches en Más → Notificaciones.
- `d0fe63c` — confirmación de lectura (`Lecturas` Sheet + `useLecturas`) en Recordatorios y en el historial de Super Admin.
- `4b674a1` (backend/RLS) + `3eeff79` — festejos visibles solo para invitados; `hermanos_edades` en el RSVP (`@shared/festejos`).
- `5ace76e` / `cb8f004` — título y horario en recordatorios del Room Parent; título/descripción en Comunicaciones.
- `4599a40` — `google_leido_en`: el botón de calendario confirma que Google realmente lee el feed.
- `75632a1` — `color_primario` del colegio en el wordmark/indicador (`AppHeader`, `Session`); paleta en `ColegioAdmin`.
- `48491eb` — Super Admin mobile: selector de colegio para `super` + fix alta de categorías de uniformes (insertaba sin `colegio_id` NOT NULL, fallaba en silencio).

**Fixes**
- `8581704` — `toISOString().split("T")[0]` usaba UTC: entre 21:00 y 23:59 AR "hoy" era mañana (Comedor, badge de no leídos, filtros próximos/pasados, vencimiento/fecha de pago de colectas). Nuevo `fmtLocalDate()` compartido.
- `3589ee9` — borrar evento con RSVP violaba la FK de `evento_asistencia` (sin CASCADE) y fallaba en silencio; recordatorios con fecha no se mezclaban en Calendario aunque se cargaban.
- `3d71dce` — festejos con `hora` pero `todo_el_dia=true` ocultaban el horario.
- `3bdf1d8` — lógica de Muro/Encuestas unificada en `@shared/muro`/`@shared/encuestas`: encuesta eliminada en Pendientes; mobile podía mostrar >1 alerta por curso.
- `3656aee` — umbral del chip de urgencia unificado (`nivelUrgencia`, <3 días).
- `0023292` — "atrás" de Android en el panel de Super Admin vuelve a la grilla de módulos.
- `27e5a69` — cargas con `useCallback` en autorizaciones/superadmin/Adopcion (sin cambio visible).
- `9b15a15` — Perdidos y Autorizaciones no recargaban al volver a la pantalla (Expo Router las deja montadas y solo cargaban al montar): ahora `useFocusEffect` + pull-to-refresh.
- `ada09a0` — la sección "Perdidos y encontrados" pasa a llamarse "Lost&Found" (Más, título de la pantalla, push).
- `868902c` — Lost&Found: objeto con algún aviso = "reclamado" (RPC `objetos_reclamados`, solo ids) → fuera de la card del Muro, del resumen semanal y de "¿Será este?", con "🙋 Alguien ya avisó…". `Sheet`: `KeyboardAvoidingView` con padding también en Android (edge-to-edge + adjustResize no achica la ventana: el teclado tapaba los campos de Autorizaciones); formularios de Autorizaciones/Perdidos con `ScrollView flexShrink` en vez de `maxHeight` fijo. Preferencias: "A las 19 hs".
- `ea31338` — Lost&Found: lo resuelto sigue listado los 30 días (atenuado, "✓ RESUELTO", al final); Muro/sugerencias/resumen siguen usando solo las abiertas.
- `8cba6a8` — Calendario: eventos reales tipo "comunicado" no mostraban ✏️/🗑 (se excluía por tipo en vez de por id `r-…`); el creador edita/borra con cualquier rol; editar ya no pisa `creado_por`.
- `fa5c162` + `d6a8269` + `7d2391b` — Eventos en el panel del colegio (web + mobile) y RLS de eventos por creador (super cualquiera, colegio lo suyo, resto lo propio; festejo también el otro padre del cumpleañero).
- `3464b5a` — los 21 modales con inputs usaban `KeyboardAvoidingView` solo en iOS; con edge-to-edge (Expo 54) Android no achica la ventana → `behavior="padding"` en ambas.
- `15b2eea` + `3b3d625` — colectas: cerrar/reabrir también responsable o creador, pendiente "¿Terminó la colecta?" a los 15+ días del límite, RLS de edición, `colectas.creado_por`; editar ya no reabre.
- `0db4383` — RLS por dueño en recordatorios (antes cualquier familia del curso podía editar/borrar cualquier aviso, incluso Comunicaciones del colegio), `colecta_pagos`, `evento_asistencia`, `cumples`; cascadas (borrar un aviso leído fallaba por FK). UI de avisos edita/borra solo lo propio.
- `f011cb4` — Storage: solo quien subió sobrescribe/borra; borrar aviso/evento/objeto borra sus archivos (`borrarArchivos`); `useRecarga` (focus + pull-to-refresh) en Calendario, Colectas, Encuestas, Cumpleaños, Comedor y Muro.
- `2996650` + `f337c94` (+ `04102ee` web) — Comunidad: Marketplace (`@shared/marketplace`), Lost&Found y Servicios (próximamente) en `(tabs)/comunidad?sub=`; reemplaza el tile Lost&Found en Más.
- `cef5c81` — el push de un aviso lleva id/grupo: Avisos limpia filtros, pagina, resalta y marca leído.
- `60b7933` — tocar una notificación de la campanita navega a su origen (aviso, colecta, regalo, alerta).
- `1cf7640` / `9d730af` / `75ae510` / `3891e6b` — bumps 1.7.0 → 1.10.0. Sin usar: builds 23/24/25 en ASC; vc34/35/36 en Play interno.

**Review Notes de ASC**: este release no toca login, alta de cuentas ni onboarding. Pero sigue vigente lo que quedó abierto en 1.6.1: las Review Notes no pueden seguir con el código demo `Y5WPT2` (ya no hay dónde ingresarlo) y el argumento de Guideline 3.2 no puede apoyarse en el "auto-registro con código".
