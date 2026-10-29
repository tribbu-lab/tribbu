# Pendientes de tribbu

Lista viva de lo que queda por hacer (última actualización: 2026-10-27).
Tachá o borrá cada ítem cuando se resuelva.

## Hecho 2026-10-16

- ~~**Claves viejas de Supabase**~~: Vercel pasó a la publishable (y se borró
  `VITE_SUPABASE_SERVICE_KEY` de sus variables), las Edge Functions usan las
  claves nuevas (`supabase/functions/_shared/claves.ts`), se borró la función
  vieja `reset-pasword` y se **desactivaron las claves legacy** (anon +
  service_role) el 2026-10-16: la clave filtrada en el repo ya no sirve.
  También se revocó la "Legacy HS256" en JWT Signing Keys.
- ~~**Actualizar la landing tribbu.ar**~~ (2026-10-15).

## Rediseño según los prototipos de Figma (siguiente)

Plan detallado en `specs/rediseno-etapas-2-3-4.md` (etapa 1, la navegación,
ya está en `main`). Criterio: **sobrio en colores**, sin dependencias nuevas,
web y app juntas, mostrar capturas antes de commitear.

- [x] **Etapa 2 — Inicio "Hoy"** (hecha 2026-10-14) como el prototipo: "Tenés N respuestas
      pendientes" (la más urgente destacada con botón azul, el resto en una
      tarjeta con enlaces), Comunicaciones aparte con "Leer aviso", Próximos
      días sin chips de color, Menú de hoy en tabla.
- [x] **Etapa 3 — Autorización** (hecha 2026-10-14): abrir directo el formulario desde Hoy,
      fecha de salida vs. fecha límite, "Respuesta enviada: autorizaste a
      Emma", separar "Abierta" de "Tu respuesta".
- [x] **Etapa 4 — "‹ Curso"** (hecha 2026-10-14) para volver desde las pantallas de esa sección.

## Fotos escolares (2026-10-28)

- [x] Tablas, RLS, bucket privado `fotos` y RPC aplicados
      (`supabase/fotos-escolares.sql`, 26 chequeos con rollback), Edge
      Functions `fotos-retencion` (cron diario) y `send-push` desplegadas; panel
      web, pantalla de familias web y app hechas (ver notas técnicas).
- [x] Probado a mano en la web (2026-10-28, Colegio Demo, super + familia
      demo): crear, subir, asignar, publicar, pedido, "Ya pagué", pagado,
      descarga del original y Excel.
- [x] Probado en el emulador Android (2026-10-29, APK de prueba): lista, fotos
      con marca, visor ampliado, pedido ($35.000), "Ya pagué" y descarga del
      original (hoja de compartir) después de marcar pagado desde el panel.
- [ ] Ver en un teléfono real que llegue el push "Fotos escolares" al
      publicar. En el emulador no se puede: la app no registra token en
      emuladores (`Device.isDevice` en `mobile/push/register.js`). El envío sí
      está verificado (2026-10-29): Expo aceptó y entregó a FCM los 95 tokens de
      la cuenta demo sin errores.
- [x] Capturas de la landing (2026-10-29): bloque "Fotos escolares" con captura de la app (cuenta demo, ilustraciones con marca de agua; la sesión demo queda publicada en 3°A del Colegio Demo, vence el 13/11) y chat sin la frase de borrado.
- [ ] Sale en la app con la próxima versión.
- [ ] Si hace falta: la sección en el panel de la app (hoy solo web).

## Cambios en la salida (2026-10-27)

- [x] Tabla, RLS y RPC aplicados (`supabase/cambios-salida.sql`), send-push
      redesplegado, web y app hechas (ver notas técnicas).
- [ ] Probarlo a mano: familia avisa → le llega el push a la Secretaría del
      nivel → la Secretaría lo marca como visto → le llega el push a la familia;
      cancelar; la docente lo ve en Mis cursos; vista "Todos" con hijos en dos
      niveles.
- [ ] Sale en la app con la próxima versión.

## Mensajes y ayuda (2026-10-27)

- [x] La docente le escribe a todo el curso (Mensajes → Nuevo → Familias →
      "A todo el curso"), web y app. SQL aplicado.
- [x] Preguntas frecuentes para docentes y para el panel (administrador y
      Secretaría), web y app.
- [x] Push que no le llegaban a Yanina en Android: el token del teléfono
      quedaba a nombre de la primera cuenta que entró (`superadmin`/`demo`).
      Arreglado en la base (`supabase/push-tokens-cambio-de-cuenta.sql`).
- [ ] Confirmar con Yanina: abrir la app en el Android con su cuenta y
      mandarle una prueba.
- [x] Cambios en la salida sin push: globito en Mensajes (panel) y en
      Comunicaciones (familias y docentes).

## Panel del colegio más amigable (agendado 2026-10-27, en este orden)

- [x] **Configuración más simple** (2026-10-28): página con tarjetas
      agrupadas y estado, "‹ Configuración" sin fila de pestañas. Web y app.
      Falta probarla en pantalla.
- [x] **Importar datos** (2026-10-28, web): Configuración → Importar datos.
      Alumnos y familias con vista previa, crea cuentas y las vincula; sin
      borrar. Falta probar la carga real con el Excel del colegio y decidir
      si se sacan las cargas viejas de Personas → Alumnos / Apoderados.
- [x] **Primeros pasos** (2026-10-28, web y app): tarjeta en el Inicio del
      panel con progreso. Probada en la web (St John's: 3 de 6).
- [x] **Ficha por alumno** (2026-10-28, web): familia, salidas,
      autorizaciones y chats. Probada en la web; también en la app.
- [ ] Integración con el sistema de gestión escolar (boletines,
      asistencias): averiguar cuál usa St John's; arrancar por archivos.

## Horarios (pedido 2026-10-27)

- [x] Pantalla de Horarios más simple (desplegable de curso, clases plegadas,
      atajos en "Más").
- [x] Carga masiva desde Excel (panel web) con vista previa y errores por fila.
- [x] Exportar el horario: colegio (todos los cursos) y familias (web y app).
- [ ] Probar a mano la carga masiva con el Excel real del colegio.
- [x] "Descargar modelo" en toda carga por Excel (2026-10-28): menú (web y
      app, con el menú del mes o una semana de ejemplo); las cargas viejas de
      alumnos y apoderados se reemplazaron por Importar datos.
- [ ] **URGENTE — Android 1.14.0 sin push** (confirmado 2026-10-27: el
      Android de Yanina tiene la 1.14 y ningún Android se registra desde el
      26/10, cuando salió). Casi seguro el build salió sin Firebase. Sacar un
      build nuevo de Android con `/store-release`, con
      `GOOGLE_SERVICES_JSON="$PWD/google-services.json"` (ruta absoluta), en
      la máquina donde se arman los builds; después, abrir la app y verificar
      que aparezca un token `android` nuevo en `push_tokens`.

## Publicar lo nuevo

- [x] **Web**: se publica sola — Vercel despliega cada push a `main` en
      www.tribbu.ar (verificado 2026-10-23).
- [x] ~~**App 1.14.0**~~: promovida el 2026-10-26 (Play producción vc51;
      Apple la aprobó el 2026-10-27). 1.13.1 se salteó.
- [ ] **Crash en Android después del login** (2026-10-28: con un APK de
      prueba del código actual, en el emulador `tribbu_test` de esta máquina,
      el login del colegio entró bien y no se cerró — 1 de 1; sin la hoja de
      "Guardar contraseña". Seguir mirando Android vitals.) (visto en vc51 / 1.14.0, en el
      emulador, 2026-10-27): `RetryableMountingLayerException: Unable to find
      viewState for tag 22` en Fabric (`SurfaceMountingManager.addViewAt`), al
      pasar del login a Hoy mientras aparece la hoja "Save password to Google
      Password Manager?". Pasó 1 de 2 veces. Mirar Android vitals en Play
      Console y reproducirlo con `/fix-bug` (las capturas lo esquivan apagando
      el autofill del emulador).
- [ ] **Capturas nuevas en las fichas** (2026-10-27, ya en el repo): en Play,
      `cd mobile && node scripts/promover-release.mjs --solo-capturas
      --plataforma android` (plan → OK → `--aplicar`); en App Store suben solas
      con la próxima versión (1.14.0 ya está aprobada y no se puede editar).
- [ ] **Textos de las fichas** (descripción corta/larga de Play y ASC): siguen
      siendo los de agosto ("Recordatorios", "Contactos del curso"); no cubren
      Hoy, Mensajes, Marketplace ni el panel del colegio.
- [ ] **Próxima versión de la app (después de 1.14.0)**: lleva los filtros
      nuevos del panel (bandejas de Mensajes/Soporte/Denuncias y filtro por
      curso en Apoderados, 2026-10-27; en la web ya están).
- [ ] **Antes de publicar, probar en un celular** (Android e iPhone): chat
      (enviar, fotos, editar, borrar), notificación de mensaje → abre el chat,
      crear y editar un grupo, difusión, teclado en el chat, vista docente.

## Cargar datos (colegio, sin código)

- [ ] **Unificar materias duplicadas** en Super Admin → 📚 Materias
      ("Gym Primaria" / "Gimnasia" / "Gimnasia Kinder" / "Educacion Fisica";
      "Music Primaria" / "Musica" / "Musica Kinder"; "Ingles"; "Dramma").
- [ ] **Revisar las clases sin maestra** que dejó la migración (p. ej. "Dramma"
      de 1°B, que en el horario decía "Shannon": no había ficha con ese nombre).
- [ ] **Emails de las maestras**: solo 1 de 19 fichas tiene email. Hace falta
      para darles acceso (Maestros → editar → "Acceso a Mensajes").
- [ ] **Dar acceso a las maestras** (rol docente) y asignarles sus clases.
      Conviene primero una cuenta docente de prueba para revisar la vista.
- [ ] **Color de cada colegio**: 1 de 4 tiene `color_primario`.
      Super Admin → colegio → 🏫 Colegio → Editar → Color primario.
- [ ] Mensaje "test" a Luciana Setti (2026-10-10, desde la cuenta de Yanina):
      borrarlo si fue una prueba.

## Probar

- [ ] **Filtros del panel (2026-10-27; lint web/app, build y export Android
      ya pasan)**: probar a mano Mensajes →
      De familias (Estado/Conversación/Curso + buscador), Denuncias y
      Apoderados → Filtros → Curso, en la web y en la app.

- [ ] **Vista docente** con una cuenta real: cursos en "Mi acceso", publicar
      aviso/evento/encuesta/autorización, Alumnos → "Escribir a la familia".
- [ ] **Grupos y difusión** desde una cuenta de apoderado en la web.
- [ ] **En un iPhone**: la app en general y la sincronización de calendario
      (Apple Calendar y Google) — nunca se probó en un equipo real.
- [x] ~~Primer aviso automático real~~ — funcionando (430 enviados, último
      2026-10-12).

## Mejoras chicas que quedaron (Mensajes / docentes)

- [x] **Fotos en la difusión** (2026-10-23): hasta 3 fotos, se suben una sola
      vez a `mensajes/difusion/<usuario>/` y las usan todos los mensajes
      (`supabase/mensajes-fotos.sql`, aplicado). Web + app; en la app falta
      publicar la versión nueva.
- [x] **Push en el panel mobile** (2026-10-22): tocar una notificación siendo
      administrador, Secretaría o super abre la sección del panel (mensaje →
      Mensajes del personal / de familias / Ayuda y soporte según el chat;
      soporte, denuncia, autorización, taller, evento, aviso, alerta). Falta
      probarlo con un push real en un teléfono.
- [x] **Etiqueta de docente en la app** (2026-10-23): Avisos e Inicio ya la
      tenían; ahora también Calendario (Próximos y el detalle del día). La
      campanita ya no existe en la app.
- [x] **Dar acceso a docentes desde el panel mobile** (2026-10-23): Personas →
      Maestros → editar → "Acceso a tribbu" (dar acceso, cambiar contraseña,
      quitar acceso), igual que la web.
- [x] **Fotos de Mensajes privadas** (2026-10-23, `supabase/mensajes-fotos.sql`,
      aplicado; 15 chequeos con rollback): un archivo bajo `mensajes/` lo lee
      solo quien lo subió, quien ve esa conversación, quien ve un mensaje que
      lo usa (difusión) o quien gestiona la denuncia. El resto del bucket
      `adjuntos` sigue igual.

## Funcionalidades nuevas (acordadas, sin hacer)

- [x] **Panel del colegio: pantallas del super** (hecho 2026-10-22) (pedido 2026-10-22, al retomar):
      Plataforma → Colegios, Super Admins y Soporte al mismo estilo sobrio que
      el resto del panel (web; en mobile solo hay Soporte). También revisar con
      el administrador lo que la Secretaría no ve (Cursos, Uniformes, Menú,
      Datos, Marketplace, Lost & Found, Denuncias).
- [x] **Archivar los chats al cambiar de año lectivo** (hecho y aplicado 2026-10-22; falta probarlo cuando cambie el año) (pedido 2026-10-22,
      decidido con Yanina): hoy `mensajes-retencion` **borra** los chats de
      cursos de años cerrados (directo, curso, colegio, docente, grupo). Pasa a:
      **cerrados (solo lectura, no se puede escribir) y ocultos** de la lista
      principal, en una sección "Archivados"; se borran recién pasado un tiempo
      (a definir, propuesta 6 meses). Los chats del **personal** del colegio
      **no** se archivan (siguen abiertos de un año a otro). Hay que tocar RLS
      de `mensajes` (insert solo en conversaciones vigentes), `mis_conversaciones`
      (marcar archivada), la retención y la UI de Mensajes (web + app).
      Aplicado 2026-10-22: SQL, retención redeployada y UI web + app.

- [x] **Rediseño del panel del colegio** (2026-10-22, web + app, sin
      commitear): Inicio · Comunicación · Mensajes · Comunidad · Personas ·
      Colegio (+ Plataforma para super), pestañas internas, Ayuda y soporte y
      Mi cuenta abajo, íconos de línea, Inicio estilo "Hoy" con los mensajes
      del personal. Falta: probarlo en la app en un teléfono (solo se validó
      lint + bundle). Por dentro (2026-10-22): Personas, Colegio, Comunicación
      y Comunidad sobrios, filtros iguales en toda la app (ListToolbar). Falta
      revisar con el administrador lo que la Secretaría no ve (Cursos,
      Uniformes, Menú, Datos, Marketplace, Lost & Found, Denuncias). Los emojis
      que quedan son datos (prenda de uniforme, curso, títulos de festejos).
- [x] **El directivo ve los chats maestra ↔ familia** de sus niveles: ya
      estaba hecho con roles por nivel (Mensajes de familias, solo lectura).
- [x] **Mensajes entre el personal del colegio** (2026-10-22,
      `supabase/mensajes-personal.sql`): 1 a 1 y grupos entre maestras,
      Secretarías, Dirección y administración. El push ya abre el panel
      (2026-10-22).
- [ ] **Fotos por evento** (postergado 2026-10-23, "por ahora no"): galería privada por evento (acto, excursión) donde
      las familias suben y ven fotos. Reusar el bucket privado `adjuntos` /
      `SignedImg`. Definir: quién sube, moderación, límite por evento.
- [ ] **Carga asistida con IA** (spec en `specs/carga-asistida-con-ia.md`,
      borrador; falta decidir y construir).
- [ ] **Pago de colectas con Mercado Pago** (postergado): requiere cuenta de MP
      del curso/colegio y webhooks. Se construye junto con el cobro del
      Marketplace (misma integración).

## "Comunidad"

- [x] **Marketplace etapa 1 (sin pagos)** — hecho 2026-09-25 (specs/marketplace.md).
- [ ] **Marketplace etapa 2 — comisión por venta**: el pago pasa por Tribbu
      (Mercado Pago Marketplace: el vendedor vincula su MP y MP separa la
      comisión), reclamos/devoluciones, términos y facturación.
- [ ] **Servicios de la comunidad** (hoy "Próximamente"): clases, niñeras,
      animación, fotografía, profesionales. Ficha + recomendaciones de familias.
      **Fee por publicar**, cobrado desde la web (no in-app). Tribbu no avala a
      nadie: decirlo explícito.
- [ ] **Carpool**: viajes puntuales ("ofrezco / necesito lugar", zona,
      ida/vuelta, atado a eventos/cumples), pedido + aceptación antes de
      compartir contacto, sin direcciones exactas, recordatorio la noche
      anterior. Grupos rotativos fijos en una 2ª etapa.

## Hecho recientemente (2026-10-10 → 10-12)

Mensajes (1 a 1, soporte, Secretaría, maestras, grupo del curso, grupos
propios, difusión, denuncias, bloqueos, retención anual), rol docente con sus
cursos y publicación de avisos/eventos/encuestas/autorizaciones, materias y
clases sin texto libre (horarios migrados), fix de "Unificar". Specs:
`specs/mensajes.md`, `specs/docentes-clases-y-grupos.md`.
