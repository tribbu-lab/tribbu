# Release notes 1.10.1 (es-419)

Android vc38 · iOS build 27 · commits `3891e6b..b49f4fb` (desde 1.10.0)

## Google Play — "Novedades" (máx. 500 caracteres)

```
Mejoras en el menú:

• Lost & Found tiene de nuevo su propio acceso en Más, fuera de Comunidad.
• Sacamos "Buscar" del menú Más: se abre desde la lupa de arriba.
• Reordenamos Más para que lo más usado quede primero.
• En Configurar notificaciones aclaramos que el resumen semanal llega los domingos a las 18 hs.
• En Buscar, el teclado se cierra al tocar fuera del campo.
```

## App Store Connect — "Novedades de esta versión"

```
Ajustes para encontrar todo más rápido.

• Lost & Found vuelve a tener su propio acceso en el menú Más, separado de Comunidad (que ahora reúne Marketplace y Servicios).
• Sacamos "Buscar" del menú Más porque estaba repetido: el buscador se abre desde la lupa de arriba.
• Reordenamos el menú Más: Comedor, Lost & Found, Encuestas, Colectas, Autorizaciones, Comunidad, Info Útil y Contacto.
• Configurar notificaciones: el resumen de la semana ahora dice cuándo llega (los domingos a las 18 hs).
• Buscar: tocar fuera del campo de búsqueda cierra el teclado.
```

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/`.

- `3ae3168` — Lost & Found standalone (`(tabs)/perdidos`, tile propio en Más), Comunidad queda Marketplace + Servicios; deep-links de push (`useNotificationRouting`) y de la card del Muro apuntan directo a perdidos; se saca el tile "Buscar" (duplicado con la lupa del header); rename "Lost&Found" → "Lost & Found"; nuevo orden de Más.
- `0801e98` — `TIPOS_AVISO.resumen_semanal.desc` (`@shared/avisos`) sin hora → "Los domingos a las 18 hs" (hora real del cron semanal).
- `5d984fd` — Buscar (mobile): contenedor `Pressable` con `Keyboard.dismiss()`; en iOS tocar resultados/vacío no cerraba el teclado.
- `b49f4fb` — bump a 1.10.1.
- Fuera del binario: `f8de540` (evento para varios cursos, Super Admin web + SQL `eventos.grupo_id`).

**Review Notes de ASC**: no toca login, alta de cuentas ni onboarding. Sigue abierto lo de siempre (código demo `Y5WPT2` inválido, argumento 3.2) si 1.10.0 no lo corrigió.
