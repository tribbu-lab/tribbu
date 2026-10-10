---
title: Mensajes entre familias, con el colegio y con soporte
status: in-progress (fase 1 implemented 2026-10-10)
priority: high
---

## Summary

Hoy las familias de un curso coordinan todo por un grupo de WhatsApp que nadie
modera, donde se mezclan los teléfonos de todos y que el colegio no puede
cuidar; y cuando alguien tiene un problema con la app no tiene a quién
escribirle desde adentro. "💬 Mensajes" trae esas conversaciones a tribbu con
cuatro tipos: (1) **1 a 1** entre apoderados que comparten curso, (2) un
**grupo del curso** automático con todas las familias, (3) **familia ↔
colegio** (un hilo por alumno, atendido por los `colegio_admin`) y
(4) **soporte**, un hilo por usuario con el equipo de tribbu (`super`), para
reportar problemas o pedir ayuda. Nunca se muestran teléfono ni email entre
familias. El colegio **no lee** los chats entre familias: solo ve lo que alguien
denuncia. Los mensajes entre familias y con el colegio se borran al cerrar el
año lectivo del curso. Web y app al mismo tiempo. Se entrega por fases:
1 a 1 + soporte (con toda la infraestructura) → grupo del curso → familia ↔
colegio.

Decisiones (Yanina, 2026-10-10): grupo del curso sí; el colegio no lee chats
entre familias (tampoco modera el grupo: solo actúa sobre lo denunciado);
retención hasta el cierre del año lectivo; web y mobile juntos; tiene que
existir un canal de soporte.

## Acceptance Criteria

### Fase 1: 1 a 1 + soporte + infraestructura
- [x] Nueva sección "💬 Mensajes": web con tab `mensajes` (sidebar desktop,
      menú "Más" en mobile web, `TABS_VALIDOS`, `?tab=mensajes&c=<id>`); app
      con ícono de burbuja en `AppHeader` junto a la campana (con punto de no
      leídos) + tile en Más + rutas ocultas `(tabs)/mensajes` y
      `(tabs)/mensajes/[id]`.
- [x] La lista de conversaciones muestra nombre, último mensaje (recortado),
      hora relativa y cantidad de no leídos, ordenada por último mensaje.
      Carga en **una sola** llamada (RPC `mis_conversaciones()`).
- [x] La lista muestra **todas** las conversaciones del usuario sin importar el
      hijo elegido en "Mi acceso" (un chat no depende del hijo activo). Con
      más de un curso, cada fila lleva el tag de curso (punto de color + nombre
      del hijo, mismo estilo que `tagDeCurso`).
- [x] La otra persona se muestra como "Ana · familia de Juan" (nombre del
      usuario + nombre de pila de sus hijos en el curso compartido), nunca con
      teléfono ni email. Esto aplica en lista, cabecera y push.
- [x] "Nuevo mensaje": buscador de familias de mis cursos (sin acentos) →
      abre la conversación existente con esa persona o crea una. Atajo
      "💬 Escribir" en cada alumno de la pantalla Alumnos; si el alumno tiene
      dos apoderados con cuenta, se elige a cuál.
- [x] Solo se puede iniciar un 1 a 1 con alguien con quien **comparto curso**
      (RLS + RPC `abrir_conversacion_directa(usuario)`); hay como mucho una
      conversación por par de usuarios.
- [x] Los mensajes nuevos llegan en vivo, sin recargar (Supabase Realtime),
      en web y app. Al volver la app a primer plano se traen los que faltan.
- [x] Enviar texto (máx. 2000 caracteres, `check` en la base) y hasta 3
      imágenes (JPEG ≤1600 px + miniatura, mismo flujo que Marketplace). El
      mensaje aparece al instante (optimista) y, si falla, queda marcado
      "No se envió · Reintentar".
- [x] El autor puede editar ("editado") y eliminar sus mensajes. Un mensaje
      eliminado se ve como "Mensaje eliminado": se borran texto y fotos, la
      fila queda (`borrado_en`).
- [x] Abrir una conversación actualiza `ultimo_leido_en` y el badge/punto se
      recalcula sin reiniciar la app (como `useNotificaciones`). No hay
      "visto" visible para el otro en v1.
- [x] **Push** `type:"mensaje"` (con `conversacionId`) a los demás miembros,
      enviado **desde el servidor**, no desde el cliente. No se envía si el
      destinatario silenció la conversación, si bloqueó al autor o si ya
      recibió un push de esa conversación en los últimos 2 minutos sin
      leerla (agrupado). Al tocarlo se abre esa conversación (web `TAB_MAP` +
      mobile `useNotificationRouting`).
- [x] **Silenciar** por conversación (sin push, el badge sigue).
- [x] **Bloquear** a un usuario (desde la cabecera del 1 a 1 o desde un
      mensaje en el grupo): no puede escribirme en 1 a 1 (RLS) y no veo sus
      mensajes en el grupo del curso. Se puede desbloquear desde
      Más → Cuenta → "Usuarios bloqueados". No se puede bloquear a Soporte
      ni al Colegio.
- [x] **Denunciar** un mensaje (mantener apretado en la app / menú "⋯" en
      web) con motivo (acoso, contenido inapropiado, spam, otro + texto). Se
      guarda una copia del texto y del autor, porque la denuncia sobrevive aunque
      el mensaje se edite, se borre o venza.
- [x] **Normas de convivencia**: la primera vez que se entra a Mensajes hay
      que aceptarlas (se guarda la fecha). Sin aceptar no se puede escribir a
      otras familias (requisito Apple 1.2). Soporte funciona aunque no las
      haya aceptado.
- [x] **Denuncias para el colegio**: Super Admin → Comunidad → "🚩 Denuncias"
      (web + módulo en el panel mobile, que usa `colegio_admin`). Lista
      pendientes y resueltas de **su** colegio con el texto denunciado, autor,
      denunciante, motivo y fecha. Acciones: "Eliminar mensaje" (soft delete)
      y "Marcar resuelta". El colegio ve **solo el mensaje denunciado**, nunca
      el resto de la conversación. Cada denuncia nueva manda un push al colegio
      (`type:"denuncia"`).
- [x] **Soporte, del lado del usuario**: cualquier usuario logueado
      (apoderado, Room Parent, `colegio_admin`) tiene "🛟 Soporte tribbu"
      fijo arriba de la lista de Mensajes y un acceso "Ayuda y soporte" en
      Más (app) / menú de cuenta (web). El `colegio_admin` también lo tiene
      en su panel (web + mobile). Es **un hilo por usuario**, se crea al
      escribir el primer mensaje (RPC `abrir_conversacion_soporte()`), acepta
      texto + hasta 3 capturas y se muestra como "Soporte tribbu" con el logo.
      La cabecera aclara: "Te respondemos lo antes posible, normalmente en
      menos de 24 hs hábiles."
- [x] Cada mensaje del usuario a soporte guarda automáticamente datos de
      diagnóstico en `mensajes.meta` (plataforma web/ios/android, versión de
      la app, sistema operativo, colegio y cursos activos, tab/pantalla desde
      donde se abrió). El usuario ve un aviso: "Incluimos datos de tu
      dispositivo para ayudarte."
- [x] **Soporte, del lado de tribbu**: Super Admin → Plataforma →
      "🛟 Soporte" (web + módulo del panel mobile, solo `super`). Bandeja
      con filtros "Sin responder" / "Abiertos" / "Resueltos" y búsqueda por
      nombre/email. Al lado del hilo se muestran nombre, email, rol, colegio,
      cursos del usuario y el `meta` del último mensaje. El super responde
      como "Soporte tribbu" (se guarda qué super respondió) y puede marcar el
      hilo **Resuelto**. Si el usuario vuelve a escribir, el hilo se reabre.
- [x] Push `type:"soporte"` a todos los `super` cuando un usuario escribe a
      soporte (mismo agrupado de 2 minutos), y `type:"mensaje"` al usuario
      cuando soporte responde. Ambos abren el hilo correspondiente.
- [x] **Retención**: un job diario borra conversaciones, mensajes y fotos de
      tipo `directo`/`curso`/`colegio` de cursos con `año_lectivo` <
      `colegios.año_lectivo_actual`. Los hilos de **soporte** no dependen del
      año lectivo: se borran 180 días después del último mensaje. Las
      denuncias resueltas se borran 180 días después de resolverse. La
      cabecera de cada chat entre familias/colegio avisa: "Los mensajes se
      borran al terminar el año lectivo."
- [x] Funciona en las tres variantes de layout (desktop sidebar, mobile web
      bottom-tab, app), en 375 px de ancho sin scroll horizontal, con el
      teclado abierto (receta anti-teclado) y respetando safe-area. El
      `super` no tiene Mensajes como familia: ve Denuncias y Soporte en su
      panel.

### Fase 1b: maestras y Secretaría (pedido 2026-10-10, implementado)
Decisiones: las maestras responden con **cuenta propia** (rol `docente`);
Secretaría la atienden los **admins del colegio**; el colegio **puede leer**
los chats con maestras y Secretaría (los de familias siguen privados).
- [x] Rol `docente` vinculado a la ficha de la maestra (`maestros.usuario_id`); el colegio le da acceso desde Super Admin → Maestros → "Acceso a Mensajes" (email + contraseña, cambiar contraseña, quitar acceso). Web.
- [x] La docente entra a una vista que solo tiene Mensajes (web y app) y puede iniciar un chat con la familia de un alumno de sus cursos.
- [x] "Nuevo mensaje" del apoderado con pestañas Familias / Maestras / Secretaría. Las maestras sin cuenta aparecen deshabilitadas ("Todavía no usa tribbu").
- [x] Un hilo por alumno × maestra (tipo `docente`) y uno por alumno con Secretaría (tipo `colegio`, = fase 3). Ven el hilo todos los apoderados del alumno; los mensajes llevan el nombre de quien los escribió.
- [x] Super Admin → Comunidad → "💬 Mensajes de familias" (web + panel mobile, colegio_admin): responde Secretaría como "Secretaría" y lee en solo lectura los chats con maestras.
- [x] Push: a la familia con el nombre y la materia de la maestra / "Secretaría"; a la docente "Familia de <alumno>".

### Fase 2: grupo del curso
- [ ] Cada curso del año vigente tiene **un** grupo "Grupo 3ºB" creado
      automáticamente (al primer acceso, vía RPC idempotente). Son miembros
      todos los usuarios con un hijo en el curso + sus Room Parents, de forma
      dinámica: entrar o salir del curso agrega o saca al usuario sin pasos
      manuales.
- [ ] Cada mensaje del grupo muestra el autor ("Ana · familia de Juan").
- [ ] La Room Parent del curso puede eliminar cualquier mensaje del grupo. El
      colegio **no es miembro** del grupo y solo actúa sobre mensajes
      denunciados.
- [ ] Los mensajes de usuarios bloqueados no aparecen para quien los bloqueó
      (en su lugar: "Mensaje de un usuario bloqueado").
- [ ] Push del grupo con el mismo agrupado de 2 minutos; título "Grupo 3ºB",
      texto "Ana: …".

### Fase 3: familia ↔ colegio (hecha en la fase 1b)
- [ ] Desde Mensajes, "Escribir al colegio" abre el hilo **del alumno** (uno
      por hijo; si tengo varios, elijo cuál). Lo ven todos los apoderados con
      cuenta de ese hijo y los `colegio_admin` de su colegio.
- [ ] Del lado de la familia, las respuestas aparecen como "Colegio
      <nombre>" con el logo. Se guarda `autor_id` y el colegio ve qué
      administrador respondió.
- [ ] Bandeja del colegio: Super Admin → Comunidad → "💬 Mensajes de
      familias" (web + panel mobile), con filtro por curso, no leídos y
      búsqueda por alumno. Push `type:"mensaje"` al colegio cuando escribe
      una familia, con el mismo agrupado.

## Technical Notes

**Datos (`supabase/mensajes.sql`)**
- `conversaciones`: `id`, `tipo` (`directo|curso|colegio|soporte`),
  `curso_id` (ancla retención y scope; not null salvo en `soporte`, con check
  por tipo; en `directo` es un curso compartido al crearla), `colegio_id`,
  `hijo_id` (solo `colegio`), `usuario_a`/`usuario_b` (solo `directo`, con
  `usuario_a < usuario_b` + `unique`), `usuario_id` (solo `soporte`: el
  usuario que pide ayuda), `estado` (`abierta|resuelta`, usado por soporte),
  `ultimo_mensaje_en`, `creado_en`. Unique parcial: uno `curso` por
  `curso_id`, uno `colegio` por `hijo_id`, uno `soporte` por `usuario_id`.
- `conversacion_miembros` (`conversacion_id`, `usuario_id`, PK compuesta):
  **solo estado por usuario** (`ultimo_leido_en`, `silenciado`), creado en
  forma perezosa (upsert al abrir). La pertenencia **no** sale de esta tabla
  sino de `es_miembro_conversacion(id)` (security definer): `directo` = soy
  a/b; `curso` = `es_miembro_curso(curso_id)`; `colegio` =
  `es_padre_de(hijo_id)` o `es_colegio_admin_de(colegio_id)`; `soporte` =
  `usuario_id = mi_usuario_id()` o `es_super()`. Así el grupo del curso sigue
  a "Mi acceso" sin sincronizar filas. En soporte, "no leído" del lado
  tribbu se calcula contra el `ultimo_leido_en` más reciente de cualquier
  super (bandeja compartida).
- `mensajes`: `id`, `conversacion_id` (cascade), `autor_id` (default
  `mi_usuario_id()`), `texto` (check ≤2000), `fotos jsonb default '[]'`,
  `meta jsonb` (diagnóstico de soporte; solo lo lee `es_super()`, devuelto por
  RPC y no por select directo, para no exponerlo en otros tipos), `creado_en`,
  `editado_en`, `borrado_en`. Índice `(conversacion_id, creado_en desc)`.
  Trigger que actualiza `conversaciones.ultimo_mensaje_en` y, en soporte,
  vuelve `estado` a `abierta` cuando escribe el usuario.
- `usuario_bloqueos` (`usuario_id`, `bloqueado_id`), `mensaje_denuncias`
  (`mensaje_id` nullable `on delete set null`, `conversacion_id`,
  `colegio_id`, `denunciante_id`, `motivo`, `detalle`, `texto_snapshot`,
  `autor_snapshot_id`, `estado`, `resuelta_por`, `resuelta_en`),
  `mensajes_push_log` (`conversacion_id`, `usuario_id`, `enviado_en`, para
  el agrupado) y `normas_chat_aceptadas` (`usuario_id`, `aceptadas_en`).
- **RLS por columnas de la fila** (lección de Perdidos: un helper que busca
  por id no ve la fila nueva dentro de INSERT…RETURNING). `mensajes` select/
  insert = `es_miembro_conversacion(conversacion_id)`; insert además exige
  `autor_id = mi_usuario_id()`, normas aceptadas (salvo `soporte`), que en
  `directo` el otro no me haya bloqueado y que en `colegio` quien escribe del
  lado colegio sea `colegio_admin`. Update/delete = autor; en `curso` también
  `es_admin_curso(curso_id)`. **Sin** rama `es_super()` ni
  `es_colegio_admin_de` en `directo`/`curso` (decisión: el colegio no lee).
  `es_super()` solo entra en `soporte`. Las denuncias se leen por
  `es_colegio_admin_de(colegio_id)` o `es_super()`, y la acción "Eliminar
  mensaje" del colegio pasa por RPC `moderar_mensaje_denunciado(denuncia_id)`
  (security definer), que solo toca el mensaje de esa denuncia.
- RPCs: `mis_conversaciones()` (lista + último mensaje + no leídos + nombre
  mostrado, filtrando bloqueados: una sola request), `abrir_conversacion_directa
  (usuario)`, `abrir_conversacion_soporte()`, `abrir_grupo_curso(curso)`,
  `abrir_conversacion_colegio(hijo)`, `familias_para_mensaje()` (buscador:
  nombre + hijos, sin contactos), `mensajes_no_leidos_total()` (badge),
  `bandeja_soporte(filtro)` (super: hilos + datos del usuario + último
  `meta`), `marcar_soporte_resuelto(id)`.
- Al cambiar Storage o RLS revisar `pg_policies.roles`, no solo el `qual`
  (CLAUDE.md → Storage buckets).

**Realtime**
- `alter publication supabase_realtime add table public.mensajes;`. Es el
  **primer uso de Realtime en tribbu**. Una sola suscripción por sesión a
  INSERT/UPDATE de `mensajes` (RLS filtra qué recibe cada usuario): alimenta
  la conversación abierta y el badge. Cerrar el canal al cerrar sesión y en
  el cleanup del efecto. [skill: vercel-react-best-practices]
- Al volver a primer plano (mobile `AppState`, web `visibilitychange`), pedir
  los mensajes con `creado_en >` el último recibido: Realtime no reenvía lo
  perdido mientras estaba desconectado.
- Reglas puras compartidas en `src/lib/mensajes.js` (`@shared/mensajes`):
  `nombreMostrado`, `agruparPorDia`, `fusionarMensajes` (dedupe por id entre
  optimista, Realtime y fetch), `puedeEditar`, `textoPush`, `metaSoporte`
  (arma el `meta` con lo que cada plataforma inyecta: versión vía
  `expo-application` en mobile, build de Vite en web).

**Push (servidor)**
- No usar `sendPush` desde el cliente (hoy confía en los `userIds` que
  manda quien llama). Un trigger `after insert` en `mensajes` llama vía
  `pg_net` a una Edge Function nueva `mensajes-push` (`--no-verify-jwt` +
  `x-cron-secret`, mismo patrón que `avisos-automaticos`). La función
  resuelve destinatarios con `es_miembro_conversacion` (en soporte: todos los
  `super` si escribe el usuario, el usuario si responde un super), descarta
  silenciados, bloqueos y agrupados (`mensajes_push_log`) y envía con
  `enviarPush` de `_shared/expoPush.ts`. `type:"mensaje"` / `"denuncia"` /
  `"soporte"` se suman a ambos `TAB_MAP` (los dos últimos llevan al panel
  Super Admin).

**Retención**
- pg_cron diario → Edge Function `mensajes-retencion` (mismo esquema de
  secret). Borra las fotos por la API de Storage (no se puede borrar
  `storage.objects` por SQL) y después: conversaciones de cursos de años
  cerrados (cascade a mensajes/miembros), hilos de soporte sin mensajes hace
  más de 180 días y denuncias resueltas hace más de 180 días. Con `&dry=1`
  lista lo que borraría.

**Fotos**
- Bucket privado `adjuntos`, path `mensajes/<conversacion_id>/<ts>-<i>.jpg` +
  `.thumb.jpg` (`subirImagen` web, `pickImages`/`uploadImage` mobile).
  Agregar a la policy de lectura de `adjuntos` una rama
  `foldername[1]='mensajes'` → `es_miembro_conversacion(foldername[2])`,
  **antes** de la rama que castea `foldername[1]` a uuid. Verificar contra
  la policy activa en prod. `<SignedImg miniatura>` en la burbuja; el
  original va en el lightbox.

> Nota de implementación (fase 1): la rama `mensajes/` en la policy de
> lectura NO se agregó — la policy activa en prod (`priv_read_adjuntos_eventos`)
> es "cualquier autenticado" para todo el bucket (`storage-privado-por-curso.sql`
> nunca se aplicó), así que no había rama por curso que proteger. Las fotos de
> chat quedan igual que el resto de las imágenes privadas: hace falta conocer
> el path (`mensajes/<uuid de conversación>/…`). Acotarlo es un pendiente
> general del bucket, no de Mensajes.

**UI**
- Web: `src/features/mensajes/index.jsx`, lazy (`aLazy`), con lista y chat
  en dos columnas en desktop y en una sola en mobile web. Carga con
  `useCargar`, sin vaciar el contenido al volver al tab (tab cache). Estilos
  inline con tokens de `@shared/tokens`. Texto siempre como texto (nunca
  HTML) y links con `safeUrl`. El componente de chat (`ChatConversacion`) se
  reutiliza en las bandejas de Super Admin (Soporte, Mensajes de familias).
- Mobile: `mobile/features/mensajes`, chat con `FlatList` **invertida**,
  burbujas memoizadas, callbacks estables, sin estilos inline en items
  [skill: vercel-react-native-skills: list-performance-*]. El input va en un
  `KeyboardAvoidingView behavior="padding"` (iOS y Android, edge-to-edge).
  Íconos MaterialCommunityIcons `-outline`; condicionales con ternario (no
  `cond && <X/>`).
- QA: agent-browser con dos sesiones (dos apoderados del mismo curso; un
  apoderado + super para soporte) para el tiempo real, más el emulador
  Android para push, deep-link (`tribbu://mensajes/<id>`) y teclado.

## Out of Scope

- Soporte **sin sesión** (quien no puede entrar a la app): sigue el link
  "¿Olvidaste tu contraseña?" y un `mailto:` de soporte en el login; el chat
  requiere estar logueado.
- Soporte con base de conocimiento / FAQ, respuestas automáticas o IA.
- Que soporte (super) inicie conversaciones por su cuenta, o mensajes
  masivos desde soporte (para eso están Comunicaciones/Alertas).
- Grupos armados a mano (equipo de fútbol, comisión de egresados): v2.
- Mensajes de voz, video, PDFs, stickers, reacciones, respuestas citadas y
  reenviar.
- "Visto" / doble tilde, "escribiendo…" y estado en línea.
- Mensajes entre familias de **distintos** cursos o colegios.
- Que el colegio o el super lean conversaciones entre familias (solo
  denuncias).
- Filtro automático de malas palabras / moderación con IA.
- Rate limiting anti-spam más allá del agrupado de push.
- Exportar o guardar una copia de los chats antes del borrado anual.
- Cifrado de punta a punta.
