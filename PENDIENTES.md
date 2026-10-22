# Pendientes de tribbu

Lista viva de lo que queda por hacer (última actualización: 2026-10-22).
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

## Publicar lo nuevo (Mensajes, docentes, materias y clases, talleres, navegación)

Todo esto está en `main` y la base de producción ya tiene las tablas, pero
**los usuarios todavía no lo ven** hasta publicar:

- [ ] **Web**: desplegar `main` (si Vercel no lo hace solo al subir).
- [ ] **App 1.13.0**: la 1.12.0 se armó antes de Mensajes. Subir
      `expo.version` y correr `/store-release` + `/store-promote` (iOS desde la
      Mac). Novedades: Mensajes (1 a 1, grupo del curso, grupos, difusión,
      Secretaría, maestras, soporte), vista docente, materias y clases,
      talleres extraprogramáticos, editor de horarios y la navegación nueva
      (Hoy · Agenda · Comunicaciones · Curso).
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

- [ ] **Vista docente** con una cuenta real: cursos en "Mi acceso", publicar
      aviso/evento/encuesta/autorización, Alumnos → "Escribir a la familia".
- [ ] **Grupos y difusión** desde una cuenta de apoderado en la web.
- [ ] **En un iPhone**: la app en general y la sincronización de calendario
      (Apple Calendar y Google) — nunca se probó en un equipo real.
- [x] ~~Primer aviso automático real~~ — funcionando (430 enviados, último
      2026-10-12).

## Mejoras chicas que quedaron (Mensajes / docentes)

- [ ] **Fotos en la difusión** (hoy "Mensaje a varias familias" es solo texto).
- [x] **Push en el panel mobile** (2026-10-22): tocar una notificación siendo
      administrador, Secretaría o super abre la sección del panel (mensaje →
      Mensajes del personal / de familias / Ayuda y soporte según el chat;
      soporte, denuncia, autorización, taller, evento, aviso, alerta). Falta
      probarlo con un push real en un teléfono.
- [ ] **Etiqueta "👩‍🏫 docente" en la app** también en Inicio, Calendario y la
      campanita (en la web ya está en todos; en la app solo en Avisos).
- [ ] **Dar acceso a docentes desde el panel mobile** (hoy solo web).
- [ ] **Fotos de Mensajes**: cualquier usuario logueado que tenga la ruta
      exacta puede verlas (igual que el resto de las imágenes privadas: la
      policy de lectura de `adjuntos` es de todo el bucket). Acotar por
      conversación/curso.

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
- [ ] **Fotos por evento**: galería privada por evento (acto, excursión) donde
      las familias suben y ven fotos. Reusar el bucket privado `adjuntos` /
      `SignedImg`. Definir: quién sube, moderación, límite por evento.
- [ ] **Carga asistida con IA** (spec en `specs/carga-asistida-con-ia.md`, sin
      commitear todavía).
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
