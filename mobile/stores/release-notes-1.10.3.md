# Release notes 1.10.3 (es-419)

Android vc40 · iOS build 30 · commits `3891e6b..71a2cb3` (desde 1.10.0; 1.10.1 = vc38/build 27 y 1.10.2 = vc39/build 29 se subieron pero se reemplazan por esta, nunca se publican)

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Colectas: cualquier familia puede crear una y elegir qué chicos participan.
• Lost & Found vuelve a tener su acceso en Más, y reordenamos el menú.
• Buscar se abre desde la lupa de arriba.
• Festejos: se ve la foto de la invitación, "Ver invitados" y un botón para editar el festejo.
• Guardar un evento ya no queda trabado con conexión lenta.
• Marketplace y Lost & Found cargan más rápido.
• El resumen semanal llega los domingos a las 18 hs.
```

## App Store Connect — "Novedades de esta versión"

```
Colectas más flexibles, festejos más completos y varios arreglos.

• Colectas: ahora cualquier familia del curso puede crear una colecta, y al crearla se puede elegir qué chicos participan (por ejemplo, un regalo para un grupo). Quien la organiza puede editarla o cerrarla.
• Lost & Found vuelve a tener su propio acceso en el menú Más, separado de Comunidad (que ahora reúne Marketplace y Servicios).
• Sacamos "Buscar" del menú Más porque estaba repetido: el buscador se abre desde la lupa de arriba.
• Reordenamos el menú Más: Comedor, Lost & Found, Encuestas, Colectas, Autorizaciones, Comunidad, Info Útil y Contacto.
• Calendario: los festejos muestran la foto de la invitación y un botón "Ver invitados" con quiénes confirmaron asistencia.
• Cumpleaños: el festejo de tu hijo se puede volver a editar desde la lista, aunque hayas cerrado el aviso.
• Arreglamos el selector de fecha, que no dejaba elegir ningún día.
• Guardar un evento ya no queda trabado cuando la conexión es lenta.
• Configurar notificaciones: el resumen de la semana ahora dice cuándo llega (los domingos a las 18 hs).
• Marketplace y Lost & Found cargan más rápido.
• Buscar: tocar fuera del campo de búsqueda cierra el teclado.
```

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/`.

- `3ae3168` — Lost & Found standalone (`(tabs)/perdidos`, tile propio en Más), Comunidad queda Marketplace + Servicios; deep-links de push (`useNotificationRouting`) y de la card del Muro apuntan directo a perdidos; se saca el tile "Buscar" (duplicado con la lupa del header); rename "Lost&Found" → "Lost & Found"; nuevo orden de Más.
- `0801e98` — `TIPOS_AVISO.resumen_semanal.desc` (`@shared/avisos`) sin hora → "Los domingos a las 18 hs" (hora real del cron semanal).
- `5d984fd` — Buscar (mobile): contenedor `Pressable` con `Keyboard.dismiss()`; en iOS tocar resultados/vacío no cerraba el teclado.
- `136b381` — festejos en Calendario: la foto vive en `eventos.imagen_url` (no en `adjuntos`) y la card nunca la mostraba → miniatura (web + mobile). Mobile: la fila de un festejo no tenía acción → "Ver invitados" abre `FestejoDetalleModal`.
- `16466bf` — `EventoModal.guardar()` quedaba colgado si `sendPush`/`getUserIdsByCurso` no respondía (el evento ya estaba insertado): timeout de 10 s en `sendPush` (`mobile/lib/push.js` + `src/lib/push.js`) y push/asistencia en try/catch/finally separado del insert.
- `bd2fd59` — `DateField` (iOS): el picker inline estaba envuelto en un `Pressable` que le robaba el toque al calendario nativo → ningún día respondía. Contenedor pasa a `View`. Solo iOS.
- `b93ef00` — Colectas: "+ Nueva colecta" visible a cualquier apoderado (la RLS ya lo permitía; con selector de curso en Todos); ✏️/cerrar/🗑 con `gestionaColecta` (antes `isAdmin`, siempre false en Todos); nueva `colecta_participantes` ("¿Quiénes participan?", sin filas = todos). SQL `supabase/colecta-participantes.sql` verificado aplicado en prod (tabla responde 200).
- `4564a78` — Cumpleaños (mobile): el único "Editar" del festejo estaba en el banner descartable → ícono de editar en la fila para el padre del alumno.
- `2d1b565` — Marketplace y Perdidos (mobile + web) resolvían `colegio_id` con una consulta extra a `cursos` en cada carga; ahora sale de `items[].cursos` de Mi acceso. Mobile además paraleliza avisos/reclamados en Perdidos.
- `b49f4fb` / `1ebbd62` / `71a2cb3` — bumps a 1.10.1, 1.10.2 y 1.10.3. Sin usar: builds 27 y 29 en ASC, vc38 y vc39 en Play interno (1.10.2 se reemplazó porque 2d1b565 entró después del build).
- Fuera del binario: `f8de540` (evento para varios cursos, Super Admin web + SQL `eventos.grupo_id`).

**Review Notes de ASC**: no toca login, alta de cuentas ni onboarding. Sigue abierto lo de siempre (código demo `Y5WPT2` inválido, argumento 3.2) si 1.10.0 no lo corrigió.
