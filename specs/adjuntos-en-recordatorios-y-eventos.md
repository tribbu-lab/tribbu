---
title: Adjuntos en recordatorios y eventos
status: implemented
priority: medium
---

## Summary

Los Room Parents y apoderados hoy solo pueden comunicar por texto: un recordatorio
sobre una circular del colegio o un evento con programa adjunto obligan a
transcribir el contenido o a mandarlo por WhatsApp por fuera de tribbu. Esta
feature permite adjuntar hasta **3 archivos (imágenes o PDF, máx. 10 MB c/u)**
al crear o editar un recordatorio o un evento, y verlos desde la lista: las
imágenes como miniaturas con vista ampliada y los PDF como chips que abren el
documento. Aplica a la web (SPA) y a la app mobile (Expo). Quien puede crear o
editar el ítem puede adjuntar: en recordatorios, cualquier apoderado sobre los
suyos (los admins sobre todos); en eventos, solo admins, como hoy.

## Acceptance Criteria

- [x] El modal de recordatorio (web `src/features/recordatorios` y mobile
      `mobile/features/recordatorios` → `RecordatorioModal`) tiene una sección
      "ADJUNTOS" que permite subir hasta 3 archivos; al llegar a 3 el botón de
      agregar desaparece.
- [x] El `EventoModal` de calendario (web y mobile) tiene la misma sección, con
      idéntico comportamiento.
- [x] Tipos aceptados: imagen (`image/*`: jpg/png/webp/heic/gif) y
      `application/pdf`. Web: `<input type="file" accept="image/*,application/pdf">`;
      mobile: acción "Adjuntar" que ofrece **Imagen** (galería, vía
      `pickAndUploadImage`) o **PDF** (vía `expo-document-picker`).
- [x] Validación en cliente: archivo > 10 MB o tipo no permitido → mensaje de
      error **visible para el usuario** (patrón `imgError` de
      `mobile/features/cumples`; en web, texto de error en el modal — no
      `console.error` silencioso).
- [x] Los archivos se suben a un bucket público nuevo **`adjuntos`** con path
      `{cursoId}/{Date.now()}.{ext}`, y se persisten en una columna
      `adjuntos jsonb DEFAULT '[]'` en `recordatorios` y `eventos`, con entradas
      `{ url, tipo: "imagen"|"pdf", nombre }` (`nombre` = filename original
      pasado por `sanitize`).
- [x] Al reabrir el modal en modo edición se listan los adjuntos existentes con
      un ✕ para quitarlos y se puede agregar hasta completar el tope de 3.
- [x] Permisos: en recordatorios el control vive dentro del modal, por lo que
      hereda `puedeEditar = isAdmin || creado_por === userId`; en eventos hereda
      el gate `isAdmin` del modal. No se agrega ningún gate nuevo.
- [x] Render en listas — recordatorios (fila) y calendario (vista lista +
      detalle de evento): imágenes como miniaturas (~56px) que abren lightbox
      full-screen (patrón cumples); PDFs como chip con icono + `nombre` que
      abre el documento: web `<a href={safeUrl(url)} target="_blank"
      rel="noreferrer">`, mobile `Linking.openURL(safeUrl(url))`.
- [x] Un recordatorio/evento sin adjuntos se ve exactamente igual que hoy
      (sin espacio reservado ni texto suelto; en RN usar ternarios con `null`,
      nunca `arr.length && <X/>`).
- [ ] La UI funciona en los tres layouts (Super Admin / mobile bottom-tab /
      desktop sidebar) y en pantallas angostas; los touch targets del picker y
      los ✕ respetan `MIN_TOUCH` (44px) en mobile.
      *(Pendiente de QA funcional con login: se verificó que la app carga sin
      errores de consola en viewport 390px y 1440px; los controles viven en los
      modales compartidos por los tres layouts y los botones mobile tienen
      `minHeight: 40` + `hitSlop`.)*
- [x] Mientras sube un archivo el botón muestra estado "Subiendo…" y se
      deshabilita Guardar hasta que termine (evita guardar con URLs a medias).
- [x] `RecordatorioRow` (mobile) sigue memoizado y las miniaturas usan
      `resizeMode`/tamaño fijo para no degradar el scroll de la FlatList
      [skill: vercel-react-native-skills — list-performance-images,
      list-performance-item-memo].
- [x] Sin cambios en push: crear con adjuntos manda el mismo push que hoy;
      editar sigue sin pushear. `supabase/functions/send-push` no se toca.
- [x] `npm run lint` (raíz) y `cd mobile && npm run lint` + `npx expo export -p ios`
      pasan.
      *(Mobile lint y `expo export` pasan limpios. El lint raíz reporta 197
      problemas preexistentes en el codebase; se verificó por diff que los
      archivos tocados no agregan ninguno nuevo. `npm run build` pasa.)*

## Technical Notes

- **Modelo de datos — columna jsonb, no tabla hija.** `ALTER TABLE recordatorios
  ADD COLUMN adjuntos jsonb DEFAULT '[]'` (ídem `eventos`), a correr manualmente
  en el proyecto Supabase (no hay `supabase/migrations`). Ventajas: se lee con
  el `select("*")` existente sin joins, y evita el problema de que el insert de
  recordatorios no devuelve `id` (web `src/features/recordatorios/index.jsx:61`,
  mobile `mobile/features/recordatorios/index.jsx:134`) — los archivos se suben
  *durante* la edición del modal (como `eventos.imagen_url` en cumples) y las
  URLs viajan en el payload del insert/update. En eventos, el payload es un
  spread `{...form}`, así que basta con sumar `adjuntos` al estado del form.
- **Storage.** Bucket público nuevo `adjuntos` (crear en el dashboard; lectura
  pública, escritura para `authenticated`). Path `{cursoId}/{ts}.{ext}` = la
  convención de `libros` (`src/features/info/index.jsx:70-85`), que también pasa
  `contentType` y muestra el error al usuario — es el patrón a copiar en web,
  no el de cumples (que falla en silencio).
- **Web upload:** `supabase.storage.from("adjuntos").upload(path, file,
  { upsert:true, contentType:file.type })` → `getPublicUrl`. Validar
  `file.size <= 10*1024*1024` y `file.type` (`image/*` o `application/pdf`)
  antes de subir.
- **Mobile upload:** extender `mobile/lib/media.js` con
  `pickAndUploadDocument({ bucket, pathPrefix })` usando `expo-document-picker`
  (`type: ["application/pdf"]`, `copyToCacheDirectory:true` — mismo uso que
  comedor/superadmin) y la misma ruta base64→`Uint8Array`→`upload` que
  `pickAndUploadImage`. Validar `asset.size` (DocumentPicker) /
  `asset.fileSize` (ImagePicker) contra 10 MB cuando esté disponible.
  *Implementado con dos botones "Imagen"/"PDF" en fila en lugar del `Sheet`
  (un tap menos, aprobado en el plan).* Iconos `@expo/vector-icons`
  (`image-outline`, `file-pdf-box`) — emoji solo para contenido, no chrome.
- **Render:** lightbox de imágenes = patrón existente de cumples (web
  `src/features/cumples/index.jsx:685`, mobile
  `mobile/features/cumples/index.jsx:1106`). PDFs no tienen visor in-app: se
  delega al SO (`Linking` en mobile, `target="_blank"` en web), siempre a
  través de `safeUrl` (convención CLAUDE.md aunque la URL sea generada por la
  app).
- **Estilos:** inline `style={{}}` con tokens de `@shared/tokens` / `T` en web;
  RN `StyleSheet` + `THEMES`/`SPACE`/`RADIUS` en mobile, skin "A3" (bordes
  hairline `borderStrong`, radius 16, sin sombras).
- **Estado del modal:** mantener `adjuntos` dentro del estado del form y
  computar el render del listado inline; no hace falta memo extra en el modal —
  solo cuidar las filas de lista ya memoizadas
  [skill: vercel-react-best-practices — rerender-memo].
- **Backup:** no cambia `backup_tribbu.cjs` (la columna jsonb viaja con la
  fila), pero ese script **no respalda Storage** — los archivos del bucket
  `adjuntos` quedan sin backup, igual que las invitaciones de festejos hoy.
- **QA manual:** web con `agent-browser` sobre `npm run dev` (subir imagen,
  subir PDF, quitar, exceder 10 MB, tope de 3); mobile en el emulador Android
  local (`npx expo run:android` + `adb`) [skill: agent-browser].

## Out of Scope

- Visor de PDF embebido (in-app) — se abre con el visor del sistema/navegador.
- Adjuntos en otros features (Muro/alertas, colectas, comedor, contactos).
- Migrar o unificar `eventos.imagen_url` (invitaciones de festejos en cumples)
  al nuevo sistema — sigue como está.
- Garbage collection de Storage: quitar un adjunto o borrar el ítem no elimina
  el archivo del bucket (mismo comportamiento que las invitaciones hoy).
- Push nuevo al editar/adjuntar sobre un ítem existente.
- Compresión/redimensionado server-side, thumbnails generados, o límites de
  cuota por curso.
- Backup de los objetos de Storage.
- Cámara como fuente en mobile (solo galería, como el resto de la app).
