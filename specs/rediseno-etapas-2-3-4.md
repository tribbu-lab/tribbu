# Rediseño según los prototipos de Figma — etapas 2, 3 y 4

**Estado:** planificado (2026-10-14). La etapa 1 (navegación Hoy · Agenda ·
Comunicaciones · Curso + Mi cuenta + selector "Todos mis hijos ▾" + íconos de
línea en la web) ya está en `main` — ver CLAUDE.md → "Navegación en 4
secciones".

**Prototipos** (Figma, se ven sin login; aceptar solo cookies esenciales):
- Hoy (celular): `https://www.figma.com/proto/sYh35y87niMlmOdmxhWftL/Sin-t%C3%ADtulo?node-id=17-2948&page-id=0%3A1`
- Colegio → nuestra sección "Curso" (celular): `…?node-id=17-3163&page-id=0%3A1`
- Web (escritorio): `…?node-id=17-3280&page-id=0%3A1`

**Criterios que pidió Yanina (no negociables):**
- **Sobrio en colores**: casi todo en grises/blanco; el azul solo para la acción
  principal; el color de cada hijo solo en su punto (8–10 px). Nada de bordes
  rojos/amarillos/verdes por tipo de tarjeta ni etiquetas de colores por tipo.
- Tipografía, tokens y estilo de tribbu (no la tipografía de los prototipos).
- **Sin dependencias nuevas** (íconos web: `src/components/Icono.jsx`; mobile:
  MaterialCommunityIcons "-outline").
- Web y app de celular siempre juntas, con la misma lógica en `src/lib/*`
  (`@shared/*`). Muro sigue cargando en **dos** `Promise.all`.
- Un intento anterior de rediseñar el Inicio (inspirado en Google Stitch, con
  franja de color por hijo y chips de cuenta regresiva de colores) **se
  descartó**: no volver a eso.
- Mostrarle capturas antes de commitear.

## Etapa 2 — Inicio "Hoy" como el prototipo

Archivos: `src/features/muro/index.jsx` (web), `mobile/features/muro/index.jsx`
(app), reglas en `src/lib/muro.js`.

Estructura (de arriba hacia abajo, igual en web celular y app):
1. Fecha chica gris ("Miércoles 14 de octubre") + "Buen día, Ana" (o "Hola,
   Ana" — decidir con Yanina) + el selector "Todos mis hijos ▾" (ya existe:
   prop `selector` en web, `<SelectorHijos/>` en mobile).
2. **"Tenés N respuestas pendientes"** — solo lo que pide una acción de la
   familia: autorizaciones, colectas sin pagar, invitaciones sin confirmar,
   encuestas sin votar, inscripción de talleres, "¿terminó la colecta?" (Room
   Parent). **Los avisos sin leer NO van acá.**
   - Orden por vencimiento (lo que vence antes, primero).
   - El primero va **destacado** en su propia tarjeta blanca: tipo en gris
     chico ("Autorización") + punto y nombre del hijo a la derecha; si vence
     hoy/mañana, una línea de alerta discreta ("Respondé hasta mañana, jue 15
     oct"; en el prototipo es un renglón con fondo ámbar muy suave — evaluar si
     queda sobrio o si alcanza con texto); título; datos clave en gris (fecha
     de la salida · horario · cómo van; detalle); **un** botón azul ancho con
     la acción ("Responder autorización").
   - El resto, **en una sola tarjeta con separadores**: tipo gris + hijo,
     título, una línea de dato ("Aporte $8.500 · Todavía no registrado", "Sáb
     17 oct · Asistencia sin confirmar", "18 oct · Todavía no votaste") y un
     enlace azul con flecha ("Registrar mi pago →", "Confirmar asistencia →",
     "Votar en la encuesta →"). Sin íconos de colores.
   - Sin pendientes: "Estás al día" sobrio (ya existe el estado vacío).
3. **"Comunicaciones · N"** (subtítulo "Avisos · N sin leer" + enlace
   "Mensajes" a la derecha): los avisos sin leer en una tarjeta con
   separadores: "Sin leer" en azul chico + hijo, título, origen/fecha en gris,
   enlace "Leer aviso →" que abre Avisos con ese aviso (`openAviso`) — **se
   quita "Marcar leído" del Inicio** (leerlo lo marca).
4. **"Próximos días"** + enlace "Agenda": lista con la fecha en columna (día
   de semana chico + número grande, gris/negro), título, punto + hijo + lugar
   o tipo en gris. **Sin** chips de color "Mañana / 3 días".
5. **"Menú de hoy"**: tabla de dos columnas Entrada / Principal / Alternativa /
   Postre (etiqueta gris a la izquierda, plato a la derecha). Sin emojis.
6. Lo que hoy existe y el prototipo no muestra: alertas del curso (banner) y
   "🧦 N objetos encontrados" — mantenerlos, en versión sobria (sin emojis de
   colores), debajo de Comunicaciones.

Web escritorio (prototipo 17-3280): columna principal = pendientes +
comunicaciones; columna derecha = Próximos días + Menú de hoy + colectas al día
(complementario, sin repetir pendientes).

Reglas nuevas a `src/lib/muro.js` (puras, probar con `npx -y tsx`):
`ordenarPendientes(items)` por fecha límite, textos de dato por tipo,
`resumenPendientes(n)`. Para "Aporte $X · Todavía no registrado" alcanza lo que
ya se carga; si se quiere "Faltan N por aportar" hace falta pedir todos los
`colecta_pagos` de la colecta + `colecta_participantes` en el lote 2 (se hizo y
se descartó en el intento anterior; preguntar antes).

## Etapa 3 — Flujo de autorización

Archivos: `src/features/autorizaciones/index.jsx`,
`mobile/features/autorizaciones/index.jsx`, reglas en `src/lib/autorizaciones.js`.

- Acceso directo desde el pendiente de Hoy a **responder esa autorización
  para ese hijo** (abrir directo el formulario; hoy lleva a la lista).
  Parámetro tipo `openAutorizacion=<id>` (+ `t` nonce en mobile), como
  `openAviso`.
- Diferenciar claramente **fecha de la salida** y **fecha límite para
  responder** (dos renglones con etiqueta).
- Confirmación explícita al enviar: "Respuesta enviada: autorizaste a Emma"
  (o "no autorizaste"), con quién retira.
- Separar el estado de la convocatoria ("Abierta hasta el jue 15") del estado
  de **tu respuesta** ("Tu respuesta: autorizada · Retira: …" / "Falta tu
  respuesta"), para que "Abierta" no parezca que falta responder.
- Sobrio: sin el borde ámbar a la izquierda de la tarjeta ni emojis en los
  renglones de fecha.

## Etapa 4 — Volver a "Curso"

Las pantallas que se abren desde Curso (Autorizaciones, Comedor, Talleres, Info
útil, Contacto, Colectas, Encuestas, Marketplace, Lost & Found, Administrar el
curso) no tienen cómo volver salvo la barra inferior.
- Mobile: un renglón "‹ Curso" arriba de la pantalla (componente chico en
  `mobile/components/`, puesto en cada ruta de `app/(tabs)/` de esas
  pantallas, como `SubTabs`). Ojo: Autorizaciones/Colectas/etc. también se
  abren desde Hoy o desde una notificación — el "volver" va siempre a Curso.
- Web: lo mismo arriba del contenido (`App.jsx`, junto a
  `renderSelectorSeccion()`), solo cuando `seccionActiva === "curso"` y
  `tab !== "curso"`.
- Android: el botón atrás del sistema ya vuelve; verificar que vuelva a Curso.

## Cómo probar sin cuenta real

Hay una familia ficticia (Ana Demo, con Emma en 4°B y Mateo en 1°A, con
pendientes de todos los tipos) que reemplaza a Supabase **solo en local** y
nunca se commitea. Archivos y scripts guardados fuera del repo en
`C:\Users\ypuri\.claude\projects\C--Tribbu\demo-mock\` (`mock-on.sh` /
`mock-off.sh`). Con el mock prendido:
- Web: `npm run dev` → `http://localhost:5173/?demo=1`.
- App: emulador `tribbu_test` + `adb reverse tcp:8081 tcp:8081` + `npx expo
  start` en `mobile/` + abrir la app (el APK de debug carga el JS de Metro).
- Capturas web en alta: Edge headless (`msedge --headless=new
  --screenshot=… --window-size=…`), un `--user-data-dir` distinto por captura.
- **Apagar el mock antes de commitear** (`mock-off.sh`) y verificar
  `git status` sin `__mock*`.
