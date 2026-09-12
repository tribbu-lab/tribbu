# Release notes 1.6.1 (es-419)

Android vc33 · iOS build 22 · commits `173814f..fab95c4`

## Google Play — "Novedades" (máx. 500 caracteres)

```
Correcciones y mejoras:

• Resolvimos un problema que impedía a varias cuentas iniciar sesión o cambiar su contraseña.
• El alta de familias ahora la hace el colegio desde su panel: ya no se ingresa con código de invitación.
• Sacamos dos botones que no realizaban ninguna acción (el "No" de los avisos de regalo y "Reenviar invitación").
• Mejoras de estabilidad.
```

## App Store Connect — "Novedades de esta versión"

```
Esta versión se enfoca en el acceso a las cuentas.

• Acceso a la cuenta: resolvimos un problema que impedía a algunas familias iniciar sesión o cambiar su contraseña. Si tu cuenta estaba afectada, ya podés ingresar con normalidad.
• Alta de familias: las cuentas ahora las crea el colegio desde su panel de administración. Sacamos el ingreso con código de invitación de la pantalla de inicio de sesión.
• Limpieza de la interfaz: quitamos dos botones que no realizaban ninguna acción (el "No" de los avisos de regalo y "Reenviar invitación").
• Mejoras generales de estabilidad.
```

## Qué entró realmente (interno, no publicar)

- `73b66f5` + `e0ac99e` — se saca el registro con código de invitación (login web+mobile) y el módulo "🔑 Códigos" de Super Admin. Las RPC `verificar_codigo`/`crear_apoderado` y la tabla `codigos_invitacion` quedan en la base, sin cliente que las llame.
- `e78e972`, `95d0a1a`, `a7aa687`, `737ef8d` — cadena de fixes de auth-admin. Raíz real: `instance_id`/`aud` en NULL en ~58 filas de `auth.users` creadas por los scripts de migración bcrypt→Auth, invisibles para toda la API admin de Auth.
- `722113c`, `5f3492b` — se quitan dos botones que no hacían nada.
