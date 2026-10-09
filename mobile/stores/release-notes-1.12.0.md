# Release notes 1.12.0 (es-419)

Android vc42 · iOS build 36 · commits `bb8b708..4b9d6a9` (desde 1.11.0)

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Marketplace: ahora podés editar tus publicaciones, elegir varias fotos de una vez y cuál va como principal.
• Marketplace: tocá una foto para verla a pantalla completa y deslizá para pasar a las siguientes.
• Avisos: los últimos que llegaron aparecen primero y cada uno dice cuándo se envió.
• Se arregló un problema que dejaba la app trabada al abrirla tocando una notificación.
```

## App Store Connect — "Novedades de esta versión"

```
Mejoras en el Marketplace y en los Avisos, y un arreglo importante al abrir la app desde una notificación.

• Editar publicaciones: en el Marketplace ahora podés cambiar el título, el precio, la descripción y las fotos de algo que ya publicaste, con el mismo formulario que usaste para publicarlo.
• Más fotos, más fácil: podés elegir varias fotos de una vez. La primera es la que se ve en la tarjeta; tocando cualquier otra la pasás adelante.
• Fotos a pantalla completa: tocá la foto de una publicación para verla en grande y deslizá para ver las demás.
• Avisos en orden de llegada: los avisos más nuevos aparecen arriba, y cada uno muestra cuándo se envió ("Enviado hoy 14:32", "ayer", "3 oct"), aparte de la fecha del evento.
• Arreglamos un problema por el que, con la app cerrada, tocar una notificación la dejaba trabada y parpadeando.
```

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/`.

- `a011e43` — Marketplace: editar publicación (`ArticuloSheet` con prop `articulo`, mismo form que publicar; las fotos quitadas se borran de Storage tras el update vía `fotosQuitadas`); borrar pasa a ser botón visible. Fotos: se suben recién al guardar, en orden, como `marketplace/<colegio>/<ts>-<i>`; la primera es la principal (`hacerPrincipal`). Causa del reporte "solo queda la última foto": mobile subía cada foto al elegirla y se pisaban. Ahora `pickImages({max})` (multi-select) + `uploadImage(asset,{path})` en `mobile/lib/media.js`. También `freezeOnBlur` en las tabs mobile (no re-renderiza pestañas ocultas; invisible).
- `5336d78` — Marketplace: visor de fotos a pantalla completa (mobile: paginado deslizable).
- `ec52eef` + `35bdd75` — Avisos: `ec52eef` guardaba un aviso sin fecha con la de hoy; `35bdd75` lo **revierte** (hacía aparecer cualquier aviso sin evento en el Calendario como comunicado) y en su lugar ordena por `creado_en` (`ordenPorEnviado`) y muestra "Enviado …" (`fmtEnviado`, `@shared/helpers`). Próximos/Pasados siguen usando la fecha del evento. Neto en mobile: orden + "Enviado", y "Historial de comunicados" → "Historial de alertas" (el panel del colegio queda igual que en 1.11.0). Causa: el orden por fecha del aviso dejaba arriba uno con fecha lejana y los recién llegados abajo.
- `21f1628` — fix bucle al abrir desde una push con la app cerrada: `_layout.jsx` reemplazaba el `<Stack>` por el spinner mientras chequeaba el desbloqueo biométrico; el arranque desde notificación es más lento y el `router.replace` del gate caía justo cuando el Stack se desmontaba → expo-router remontaba el layout raíz, se recargaba la sesión y se repetía (~2/s). Ahora el Stack se renderiza siempre (spinner/candado superpuestos) y `useNotificationRouting` borra la última respuesta de notificación al procesarla. Reproducido y verificado en emulador.
- Fuera del binario: `ef00732` (pestañas en caché, solo web), `5c63fc3` (skill `/store-promote` + `mobile/scripts/promover-release.mjs`, no se bundlea), `1f88adf` (notas 1.11.0).
- `4343d60` — bump a 1.12.0.
- `4b9d6a9` — (solo iOS, posterior al build de Android) la máquina pasó a Xcode 27, que trata como **error** un `IPHONEOS_DEPLOYMENT_TARGET` < 15.0: los targets de recursos de SDWebImage (9.0) y RNCAsyncStorage (13.4) rompían el archive. Config plugin `plugins/withPodsDeploymentTarget.js` los sube a 15.1 en el `post_install` del Podfile. No cambia el comportamiento de la app (el mínimo real de la app ya era 15.1). Antes hubo que aceptar la licencia (`xcodebuild -license accept`) y correr `xcodebuild -runFirstLaunch`; los intentos fallidos quemaron los builds 32, 33 y 34.
- **iOS build 35 — NO USAR (crashea al abrir).** Compilado con Xcode 27 / SDK iOS 27: una app con ese SDK tiene que adoptar UIScene o iOS la mata al iniciar (`EXC_BREAKPOINT` en `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, reporte de crash de TestFlight en iOS 27.0.1); Expo SDK 54 no lo adopta. **Build 36** se recompiló del mismo commit con Xcode 26.2 (`/Applications/Xcode-26.2.app` vía `DEVELOPER_DIR`; IPA con `DTXcode=2620`, `DTSDKName=iphoneos26.2`, igual que build 31). Adjuntar solo el 36.

**Review Notes de ASC**: nada de este release toca login, alta de cuentas ni onboarding (`21f1628` cambia el arranque/candado biométrico, no cómo se entra). Las notas reescritas el 2026-10-03 (cuenta demo demo@tribbu.app, sin código) siguen válidas. Ojo con los datos del "Colegio Demo tribbu": la colecta demo vence el 16/10 y los eventos son de oct–nov 2026; si la review se demora pasado mediados de noviembre, correr fechas.
