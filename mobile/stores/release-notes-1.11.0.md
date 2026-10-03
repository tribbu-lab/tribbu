# Release notes 1.11.0 (es-419)

Android vc41 · iOS build 31 · commits `71a2cb3..bb8b708` (desde 1.10.3)

## Google Play — "Novedades" (máx. 500 caracteres)

```
• La app abre más rápido y el Muro, el Calendario y los Avisos cargan en menos tiempo.
• Las fotos se ven más rápido y gastan menos datos.
• Lost & Found: al publicar algo para tu curso, el resto del curso recibe un aviso; tocarlo te lleva directo al objeto.
• Ahora podés tocar la foto de una invitación o de Lost & Found para verla en grande.
• Botón para mostrar la contraseña al iniciar sesión y al cambiarla.
```

## App Store Connect — "Novedades de esta versión"

```
Una app más rápida y algunas mejoras para el día a día.

• Más velocidad: la app abre más rápido y el Muro, el Calendario y los Avisos cargan en menos tiempo, sobre todo con datos móviles.
• Fotos más livianas: las imágenes nuevas se ven al instante en las listas y gastan menos datos; la foto completa se descarga solo cuando la abrís.
• Lost & Found: cuando alguien publica un objeto perdido o encontrado para su curso, el resto del curso recibe una notificación. Al tocarla se abre directamente ese objeto.
• Fotos ampliables: la imagen de la invitación de un festejo en el Calendario y la foto de un objeto en Lost & Found ahora se pueden tocar para verlas en grande.
• Mostrar contraseña: un botón con forma de ojo permite ver lo que escribiste al iniciar sesión y al cambiar la contraseña.
```

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/`.

- `e33b118` — la invitación del festejo en Calendario era una miniatura sin acción; nuevo `ImagenAmpliable` (miniatura + lightbox, bucket configurable) usado por `AdjuntosList`, la invitación y la foto de Lost&Found (que tampoco se ampliaba).
- `c1e85f0` — Perdidos: publicar con alcance "Mi curso" manda push al resto del curso (`avisaAlCurso`/`textoPushPublicado` en `@shared/perdidos`); alcance colegio / caja del colegio no avisa. Toda push `perdido` lleva `objetoId` → `(tabs)/perdidos?openObjeto=` cambia de pestaña, limpia filtro, scrollea y resalta. Requiere `send-push` ya desplegado con ese payload.
- `7f16c91` — Muro (web + mobile) en dos `Promise.all` en vez de ~8 consultas en serie; `colegio_id` sale de la sesión; recordatorios del Muro filtrados en el servidor (≤15 días). Causa: latencia AR→us-east-1 ~150–500 ms por request en serie.
- Fuera del binario: `10b0129` (pestañas en caché, solo web).
- `cd9678c` — sesión en una sola consulta (`@shared/sesion`); mobile ignora `INITIAL_SESSION`/`TOKEN_REFRESHED` (recargaban usuario + Mi acceso en cada arranque y cada hora). Caché de URLs firmadas por bucket/path hasta 5 min antes de vencer.
- `4e9a734` — "¿lo leí?" embebido en la consulta de recordatorios (`@shared/leidos`) en vez de traer todos los `recordatorio_leidos` históricos; `useRecarga` no recarga si la pantalla cargó hace <30 s y no hubo escrituras (`mobile/lib/cambios.js` envuelve el fetch del cliente).
- `dd59d4f` — miniaturas: originales re-encodeados a JPEG ≤1600 px + `.thumb.jpg` ≤320 px al subir (`expo-image-manipulator`, **dependencia nativa nueva**); `<SignedImage miniatura>` firma la miniatura con fallback a la original (404 cacheado). Causa: el plan no transforma imágenes y una miniatura de 64 px bajaba la foto entera (invitaciones de 2 MB).
- `82fe0ae` — Calendario pide eventos por rango (`@shared/calendarioRango`) en vez de todo el año; comunicados filtrados en la consulta.
- `8e48878` — `PasswordInput` con ícono de ojo en login y en `CambiarPasswordModal`.
- `bb8b708` — bump a 1.11.0.

**Review Notes de ASC**: `8e48878` toca la pantalla de login, pero solo agrega el botón de mostrar contraseña — no cambia cómo se entra ni el alta de cuentas, así que no invalida nada nuevo. Sigue abierto lo de siempre si nunca se corrigió: el código demo `Y5WPT2` no tiene dónde ingresarse desde 1.6.1 (dar usuario + contraseña de una cuenta demo) y el argumento de Guideline 3.2 se apoyaba en el auto-registro con código.
