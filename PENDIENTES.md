# Pendientes de tribbu

Lista viva de lo que queda por hacer (última actualización: 2026-10-14).
Tachá o borrá cada ítem cuando se resuelva.

## ⚠️ Urgente

- [ ] **Invalidar la service-role key vieja de Supabase** (sin cambios desde
      2026-09-23 — verificar si ya se rotó). Está en commits viejos del repo
      (que es **público**) y ese día **todavía funcionaba** (lee datos
      saltándose la RLS). Borrar el historial de git no alcanza: hay que rotarla.
      Supabase Dashboard → Project Settings → JWT Keys / API: rotar el JWT
      secret legacy (invalida anon y service-role viejas y desloguea a todos una
      vez) **o** pasar a las API keys nuevas y deshabilitar las legacy. Después:
      actualizar `VITE_SUPABASE_ANON_KEY` en Vercel y en `.env` / `mobile/.env`
      (el build de tiendas usa la `sb_publishable_…` de `eas.json`).

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
- [ ] **Push en el panel mobile** (super / admin del colegio): tocar una
      notificación de soporte o de denuncia abre la app pero no la pantalla.
- [ ] **Etiqueta "👩‍🏫 docente" en la app** también en Inicio, Calendario y la
      campanita (en la web ya está en todos; en la app solo en Avisos).
- [ ] **Dar acceso a docentes desde el panel mobile** (hoy solo web).
- [ ] **Fotos de Mensajes**: cualquier usuario logueado que tenga la ruta
      exacta puede verlas (igual que el resto de las imágenes privadas: la
      policy de lectura de `adjuntos` es de todo el bucket). Acotar por
      conversación/curso.

## Funcionalidades nuevas (acordadas, sin hacer)

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
