# Release notes 1.9.0 (es-419)

Android vc36 · iOS build 25 · commits `fab95c4..75ae510` (desde 1.6.1; 1.7.0 = vc34/build 23 y 1.8.0 = vc35/build 24 se subieron pero se reemplazan por esta, nunca se publican)

## Google Play — "Novedades" (máx. 500 caracteres)

```
Novedades:

• Autorizaciones digitales: firmá desde la app los permisos para salidas y actividades.
• Lost&Found: publicá lo que tu hijo perdió o lo que encontraste.
• Recordatorios automáticos de eventos de mañana, colectas por vencer y resumen semanal. Elegí cuáles recibir en Más → Notificaciones.
• Los festejos los ven solo los invitados, y podés sumar la edad de los hermanos.
• Avisos con título y horario.
• Correcciones en Calendario, fechas y formularios.
```

## App Store Connect — "Novedades de esta versión"

```
Una versión grande, con varias herramientas nuevas para la comunidad del curso.

• Autorizaciones digitales: el colegio o el Room Parent te pide autorización para una salida o actividad y la respondés desde la app, por cada hijo, con comentario opcional. Si falta tu respuesta, te avisamos un día antes del cierre.
• Lost&Found (perdidos y encontrados): publicá lo que tu hijo perdió o lo que encontraste, con foto. Si alguien encuentra algo parecido a lo que buscás, te avisamos; y con "¡Es mío!" o "Lo tengo yo" se contactan sin exponer datos de nadie. Lo que ya tiene un aviso se marca como reclamado, y lo resuelto sigue a la vista hasta que vence.
• Recordatorios automáticos: un aviso la tarde anterior con los eventos del día siguiente, las colectas por vencer y un resumen de la semana los domingos. Podés elegir cuáles recibir en Más → Notificaciones.
• Confirmación de lectura: quien publica un aviso puede ver cuántas familias ya lo leyeron y quiénes faltan.
• Festejos más privados: cada festejo lo ven solo las familias invitadas. Al confirmar asistencia podés indicar la edad de los hermanos (opcional).
• Avisos con título y horario: los recordatorios pueden llevar un título y un horario de inicio y fin; los que tienen horario se suman a tu calendario sincronizado.
• Calendario: ahora muestra también las comunicaciones del colegio con fecha, siempre muestra el horario de los eventos que lo tienen, y te confirma cuando Google Calendar ya está leyendo tu calendario.
• Colores del colegio: la app toma el color de marca de tu colegio.
• Correcciones: "hoy" ya no salta al día siguiente después de las 21 h (menú del día, avisos pendientes, fechas de pago), ya se pueden borrar eventos con confirmación de asistencia, los pendientes del Inicio no muestran encuestas eliminadas ni alertas repetidas, y en Android el teclado ya no tapa los campos de los formularios.
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
- `1cf7640` / `9d730af` / `75ae510` — bumps a 1.7.0, 1.8.0 y 1.9.0. Sin usar: build 23 y 24 en ASC; vc34 y vc35 en Play interno.

**Review Notes de ASC**: este release no toca login, alta de cuentas ni onboarding. Pero sigue vigente lo que quedó abierto en 1.6.1: las Review Notes no pueden seguir con el código demo `Y5WPT2` (ya no hay dónde ingresarlo) y el argumento de Guideline 3.2 no puede apoyarse en el "auto-registro con código".
