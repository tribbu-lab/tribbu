# Release notes 1.13.1 (es-419)

> **No se publicó**: el 2026-10-26 se decidió saltearla y promover directo 1.14.0 (vc51 / build 45), cuyas Novedades suman todo lo de acá. vc50 / build 44 quedan sin usar.

Android vc50 · iOS build 44 · commits `c4dd095..64b5131` (desde 1.13.0)

> 1.13.0 (vc48 / build 42) está publicada en las dos tiendas desde el 2026-10-19: Apple la aprobó (READY_FOR_DISTRIBUTION) y en Play está en producción.
> Descartados: **vc49**, que se quemó en un build de Android caído en R8 por falta de Metaspace (ver `64b5131`), y **build 43**, subido a ASC desde `42e1720` sin `f636328` ni `58ccd15`, que entraron a origin después. Promover **solo vc50 / build 44**.
> Subidos el 2026-10-21: Android vc50 → Play interno (submission `cfc75e95`; R8: `r8.json` + `proguard.map` de 28 MB; Firebase ×2; AAB 55 MB); iOS build 44 → ASC (submission `e983461b`, `DTSDKName=iphoneos26.2`, IPA 15 MB). El build 43 (submission `50c178ed`) también llegó a ASC y queda sin usar.

## Google Play — "Novedades" (máx. 500 caracteres)

```
• Mensajes: en los grupos y en los chats con la maestra o Secretaría ves quién escribe cada mensaje y de qué familia es.
• Al editar un mensaje tuyo, ahora también podés sacarle fotos.
• Maestras: la app muestra siempre sus cursos del año en curso.
• tribbu ya se puede usar en tablets y plegables, también en horizontal.
• Mejoras de rendimiento y estabilidad.
```

## App Store Connect — "Novedades de esta versión"

```
• Mensajes: en los grupos y en los chats con la maestra o Secretaría ves el nombre de quien escribe adentro de cada mensaje, con un color por persona y de qué familia es («María · familia de Sofía»); la maestra aparece con su materia.
• Al editar un mensaje tuyo, ahora también podés sacarle fotos. Si se quedaría vacío, usá Eliminar.
• Maestras: la app muestra siempre sus cursos del año en curso, también cuando el colegio ya preparó los del año que viene.
• Panel del colegio: las maestras ya no aparecen como apoderadas en Usuarios.
```

## App Review — "Notas" (App Store Connect → Información de la revisión de la app)

Las mismas con las que Apple aprobó 1.13.0. Este release no toca login, alta de cuentas, navegación ni la baja de cuenta (Mi cuenta → Eliminar mi cuenta); las rutas siguen valiendo. `/store-promote` las carga solo.

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

## Qué entró realmente (interno, no publicar)

Sólo commits que tocan `mobile/` o `src/lib/` (`b3bd960` son notas de 1.13.0 y el script de promoción: no viaja en el binario).

- `2bfc04b` — Mensajes en chats de más de dos personas (grupo del curso, grupos propios, maestras y Secretaría con varios autores): el nombre de quien escribe va adentro de la primera burbuja de cada tanda, en un color por persona (`colorAutor`), con "· familia de Sofi" (`autores_conversacion` devuelve `familia`; SQL `mensajes-autores-familia.sql`, aplicado). Editar un mensaje propio permite sacar fotos sueltas (`planEdicion`); las que se sacan se borran del Storage, y si quedaría vacío pide usar Eliminar. Compatibilidad: 1.13.0 ignora la columna nueva de la RPC, no se rompe.
- `38fcc5f` — Avisos de Google Play sobre 1.13.0 (spec `calidad-tecnica-para-google-play`):
  - R8 en release (`expo-build-properties`): ofuscación del 2% al ~89% de las clases, y `proguard.map` en el AAB.
  - `plugins/withPantallasGrandes`: celular fijo en vertical, tablet y plegable libres, `smallestScreenSize` en `configChanges`.
  - Columna centrada de 720dp en pantallas anchas (`lib/layout`).
  - En iOS no cambia nada visible (solo iPhone, vertical).
- `42e1720` — bump `expo.version` 1.13.1.
- `f636328` — `src/lib/sesion.js` (`@shared/sesion`): los cursos de la docente son los del `año_lectivo_actual` de su colegio (embebido `colegios(año_lectivo_actual)` en `SELECT_USUARIO_SESION`), no los del año más nuevo entre sus clases. Al duplicar un curso para el año siguiente se copian las clases, y la docente quedaba en el curso del año que viene, vacío: sin alumnos en Mensajes ni en Calendario/Alumnos. Si no se puede leer el año vigente, usa el más nuevo.
- `e67b8f3` — solo SQL (`mensajes-autores-docente.sql`, aplicado): en hilos docente/colegio, `autores_conversacion` devuelve "familia de <alumno del hilo>" para los apoderados y la materia de la maestra; con `2bfc04b` esos chats se ven con el formato de los grupos.
- `58ccd15` — panel del colegio (mobile + web), Usuarios: se excluyen las docentes de la lista y del contador "Apoderados"; se gestionan desde Maestros.
- `64b5131` — `plugins/withMemoriaGradle`: `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m`. El primer build de EAS con R8 (vc49) se cayó en `:app:minifyReleaseWithR8` porque el daemon se quedó sin Metaspace con los 2 GiB / 512 MiB del template.
- **Falta probar antes de `/store-promote`**, en un teléfono Android real desde la prueba interna de Play, porque es el primer build con R8:
  - Que llegue un push y que al tocarlo abra la pantalla.
  - Elegir, recortar y subir una foto de perfil, con una cuenta propia y no la demo.
  - Subir el Excel del menú desde el panel del colegio.

  En el emulador ya se probaron login, deep link, Sheets, los selectores, el calendario del dispositivo, la huella, el chat y la exportación a Excel.
- Después de subir vc49, revisar en Play Console que se fueron "DEX code optimization is below our threshold" y "Remove resizability and orientation restrictions…". El de edge-to-edge sigue: viene de librerías.
