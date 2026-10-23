---
title: Carga asistida con IA (avisos, eventos y menú)
status: draft
priority: medium
---

## Summary

Hoy la información del curso llega primero por WhatsApp o en una circular en papel/PDF, y pasarla a Tribbu implica volver a tipear todo: título, fecha, hora, lugar, prioridad. Por eso muchas cosas nunca se cargan, y las familias siguen buscando en el grupo. Esta feature agrega un botón **"✨ Completar con IA"** dentro de los formularios que ya existen para crear un **aviso** (recordatorio), un **evento** del calendario y el **menú del comedor**. Quien carga pega el texto del mensaje, escribe notas sueltas ("viernes acto 9hs traer remera blanca") o sube una foto o un PDF de la circular. La IA devuelve los campos y **prellena el mismo formulario**, que la persona revisa, corrige y guarda como siempre. Nada se publica sin esa confirmación. Cubre las dos ideas: extraer desde foto/PDF/texto (1) y el redactor de avisos a partir de notas (2), que son la misma operación. Disponible para todos los que hoy ya pueden crear esos contenidos (apoderados, Room Parents, colegio), en web y mobile, con un límite diario de usos por persona.

## Acceptance Criteria

**Entrada y flujo**
- [ ] En el formulario de **alta** de aviso (web `RecordatoriosTab`, mobile `RecordatorioModal`), de evento (web `EventoModal` en `features/calendario`, mobile equivalente) y de menú del comedor (web `features/comedor`, mobile Comedor admin), aparece un botón "✨ Completar con IA" arriba de los campos. No aparece al **editar** un registro existente.
- [ ] El botón abre un panel con dos entradas: un área de texto ("Pegá el mensaje o escribí notas") y "📎 Subir foto o PDF" (una imagen JPG/PNG/WEBP/HEIC o un PDF de hasta 10 MB, mismo tope que `MAX_ADJUNTOS`/`MAX_FILE_BYTES`). Se puede usar texto, archivo o ambos, y "Completar" queda deshabilitado si no hay ninguno.
- [ ] Mientras procesa se ve un estado de carga ("Leyendo…") y el botón no se puede volver a tocar. El tiempo típico tiene que ser menor a 10 s para texto y menor a 20 s para foto/PDF.
- [ ] Al terminar, la IA **solo prellena** los campos del formulario. No inserta nada en la base. Los campos que la IA no pudo determinar quedan vacíos (nunca inventados) y los que completó se marcan visualmente (fondo suave + ✨) hasta que el usuario los toca.
- [ ] Si la IA devuelve una advertencia (por ejemplo "No encontré el año, asumí 2026" o "Había dos fechas, usé la primera"), se muestra arriba del formulario en un aviso amarillo.
- [ ] Si se subió una foto o PDF al crear un aviso o un evento, queda tildada por defecto la opción "Adjuntar el archivo original" y, al guardar, el archivo se sube como adjunto por el flujo normal de `AdjuntosInput` (bucket privado `adjuntos`). Destildarla no adjunta nada.
- [ ] Guardar sigue exactamente el camino actual del formulario (validaciones, `sanitize`, push al curso, `curso_id` del curso destino elegido, también en vista Todos).

**Aviso (incluye el redactor)**
- [ ] Devuelve `titulo` (corto, ≤ 60 caracteres), `texto` (redactado claro y cordial, en español rioplatense, sin agregar información que no esté en la entrada), `fecha` (solo si la entrada menciona una fecha o un día del evento; si no, vacía), `hora_inicio`/`hora_fin` (solo con fecha), `prioridad` (alta/media/baja) y `urgente`.
- [ ] Con notas sueltas ("reunión jueves 18hs aula 3 traer cuaderno") el texto vuelve redactado como aviso completo y los campos de fecha y hora quedan completos.
- [ ] Las fechas relativas ("mañana", "el viernes", "el 15") se resuelven contra la fecha de hoy en hora argentina, que manda el servidor. Una fecha sin año se asume en el año en curso, o en el próximo si ya pasó.

**Evento**
- [ ] Devuelve `titulo`, `tipo` (uno de los tipos seleccionables del formulario, excepto `festejo` y `cumple`; por defecto `acto`), `fecha`, `fecha_fin` (multi-día), `hora_inicio`/`hora_fin`, `lugar` y `descripcion`.
- [ ] Si el texto describe **varios** eventos, prellena el primero y avisa "Encontré N eventos; cargué el primero" (la carga múltiple queda fuera de alcance).

**Menú del comedor**
- [ ] Desde una foto o PDF del menú (semanal o mensual), devuelve una lista de días `{fecha, entrada, plato, plato2, acompanamiento, postre, postre2, notas}`, con los mismos campos que hoy usa `menu`.
- [ ] En lugar de prellenar un solo día, muestra una **tabla de vista previa** editable (una fila por día, cada celda editable) con "Guardar N días". Al guardar hace un único `upsert` con `onConflict:"colegio_id,fecha"`, igual que la carga por Excel. Los días que ya tenían menú se marcan "se reemplaza".
- [ ] Solo lo ve quien hoy puede cargar el menú (mismo gating que el upload de Excel).

**Límites, errores y costo**
- [ ] Cada usuario tiene un máximo de **20 usos por día** (hora AR), contados en el servidor. Al pasarlo se ve "Llegaste al límite de hoy de la carga con IA. Podés seguir cargando a mano." y el formulario sigue usable.
- [ ] Errores de red, del servicio o una respuesta que la IA no pudo completar muestran "No pude leerlo. Probá con otra foto o pegá el texto." y no tocan los campos ya escritos.
- [ ] Una entrada que no tiene nada que ver (una selfie, un texto sin información de evento) devuelve campos vacíos y la advertencia "No encontré información para cargar", sin error.

**Plataformas y layout**
- [ ] Funciona en web (layouts mobile bottom-tab y desktop sidebar, y en el panel Super Admin donde se carga el menú o eventos del colegio) y en la app mobile (iOS + Android, dentro de `Sheet`/`Modal` con la receta anti-teclado). Es usable en un teléfono angosto (375 px): el panel no genera scroll horizontal y los botones tienen ≥ 44 px de alto.
- [ ] En mobile la foto se puede sacar con la cámara o elegir de la galería (`pickImages` de `mobile/lib/media.js`) y el PDF se elige con `expo-document-picker`.

## Technical Notes

**Backend: Edge Function `supabase/functions/completar-con-ia/index.ts`**
- Mismo patrón de auth que `send-push`: exige el JWT del usuario logueado como Bearer (no la anon key sola) y resuelve `usuarios.id` por `auth_id`. Rechaza con 401 sin sesión.
- Request: `{ tipo: "aviso" | "evento" | "menu", texto?: string, archivo?: { media_type, data_base64 } }`. Response: `{ campos, advertencias: string[] }` (`campos` es un objeto para aviso/evento y `{ dias: [...] }` para menú) o `{ error, codigo: "limite" | "ilegible" | "servicio" }`.
- **Clave de la API**: secreto de la función `ANTHROPIC_API_KEY` (`supabase secrets set`). Nunca en `src/` ni en `mobile/`, misma regla que la service-role key.
- **SDK**: `@anthropic-ai/sdk` vía `npm:@anthropic-ai/sdk` en Deno, con `client.messages.create`. No hacer `fetch` crudo a la API.
- **Modelo**: `claude-opus-5-5` con `output_config: { effort: "low", format: {...} }`. La extracción es simple, así que `low` alcanza y baja costo y latencia. Una alternativa más barata es `claude-haiku-4-5` (vision + PDF, ~4x menos por token), pero el cambio de modelo lo decide el equipo después de medir calidad con circulares reales. Se deja la constante `MODELO` arriba del archivo para cambiarlo en un solo lugar.
- **Salida estructurada**: `output_config.format` con un JSON Schema por `tipo` (`additionalProperties: false`, todos los campos `required` y nullable). Nada de parsear texto libre. Validar igualmente en la función: formato `AAAA-MM-DD` / `HH:MM`, `tipo` dentro de la lista permitida, `prioridad` en alta/media/baja. Lo que no valide se manda como `null` + advertencia.
- **Rechazos**: chequear `stop_reason` antes de leer el contenido. Si es `refusal` o `max_tokens`, se responde `codigo: "ilegible"`. Se habilita el fallback del servidor (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, vía `client.beta.messages.create`) para que un rechazo falso positivo se reintente solo.
- **Entrada multimodal**: imagen como bloque `image` base64 y PDF como bloque `document` base64 (`application/pdf`), ambos **antes** del bloque de texto. El cliente ya reduce imágenes a ≤ 1600 px JPEG (web `prepararImagen` en `src/lib/imagenesWeb.js`, mobile `expo-image-manipulator` como en `media.js`), lo que baja tokens y tamaño del request. PDF: tope de 10 MB y 20 páginas (rechazar antes de llamar).
- **Prompt**: system prompt fijo por tipo (cacheable, sin datos variables) con las reglas "no inventes", "campo desconocido = null", español rioplatense, lista de tipos de evento y formato de fechas. La fecha de hoy (AR, `America/Argentina/Buenos_Aires`) y el día de la semana van en el mensaje del usuario, no en el system, para no invalidar el cache. No se manda ningún dato de la base (nombres de alumnos, contactos, curso): solo lo que el usuario pegó o subió.
- **Límite diario**: tabla nueva `ia_usos` (`id`, `usuario_id` → `usuarios`, `tipo`, `creado_en timestamptz default now()`, `tokens_in int`, `tokens_out int`), SQL en `supabase/carga-con-ia.sql`. La función cuenta con service role las filas del usuario desde las 00:00 AR. Si son ≥ 20 responde `codigo:"limite"`; si no, inserta la fila **antes** de llamar a Claude (igual que la dedupe de `avisos_automaticos_log`) y después actualiza los tokens con `response.usage`. RLS: `select` solo de las propias filas (`usuario_id = mi_usuario_id()`), sin insert/update/delete desde el cliente. Sirve también para medir costo real por mes.
- **Privacidad**: el archivo y el texto no se guardan en el servidor (solo la fila de conteo). Agregar una línea en la política de privacidad sobre el procesamiento por un proveedor de IA. La API de Anthropic no entrena con estos datos.
- Deploy: `supabase functions deploy completar-con-ia` (con verificación de JWT, el default).

**Cliente compartido**
- `src/lib/cargaIA.js` (`@shared/cargaIA`), puro: `TIPOS_EVENTO_IA`, `normalizarCamposAviso/Evento/Menu(resp)` (resp → shape del `form` de cada pantalla, recortando horas a `HH:MM` y aplicando "hora_fin solo con hora_inicio") y `LIMITE_DIARIO_IA`. Lo usan web y mobile para no duplicar el mapeo (regla de CLAUDE.md sobre `src/lib/muro.js`).
- Llamada: web `src/lib/cargaIA.web.js` / mobile `mobile/lib/cargaIA.js` con `supabase.functions.invoke("completar-con-ia", { body })`, que manda el JWT de la sesión como `sendPush`.
- Componente web `src/components/CompletarConIA.jsx` (`<CompletarConIA tipo onCampos/>`): botón + panel + estados. Estilos inline con tokens de `src/lib/tokens.js`/`T`, nada de colores hardcodeados nuevos. Mobile: `mobile/components/CompletarConIA.jsx` con `Sheet`, `Button`, `Input` del design system y la receta anti-teclado (KAV `behavior="padding"` en iOS y Android, `ScrollView keyboardShouldPersistTaps="handled"`).
- Marcar campos "completados por IA": un `Set` de keys en el estado del formulario, que se limpia por campo en el `onChange`. Sin efectos (`useEffect`) para sincronizar: se resuelve en los handlers [skill: vercel-react-best-practices].
- El componente se importa en los modales de alta, que ya viven dentro de pantallas lazy (`aLazy()` en `App.jsx`), así que no suma al bundle inicial. No importar el SDK de Anthropic en el cliente.
- Menú: la tabla de vista previa reutiliza el mapeo de columnas del `UploadMenuExcel` (`features/comedor`) para el `upsert`. Pasa `colegioId` igual que la carga por Excel (web y mobile, ver la sección "Multi-colegio" de CLAUDE.md).

**QA**
- Probar con: 3 capturas reales de mensajes de WhatsApp del grupo, 2 fotos de circulares en papel (una torcida o con poca luz), 1 PDF de menú mensual, notas sueltas con fechas relativas ("el jueves", "mañana", "15/11") y una entrada sin información. Verificar en web (desktop + 375 px) con agent-browser, y en el emulador Android.
- Probar el límite bajando `LIMITE_DIARIO_IA` temporalmente, nunca generando 20 llamadas reales.

## Out of Scope

- Carga **múltiple** desde una circular (un texto → varios avisos/eventos para confirmar en lista). Por ahora se carga el primero y se avisa.
- Lista de **útiles** desde foto (queda para una segunda etapa).
- Colectas, encuestas, autorizaciones, festejos y Marketplace/Lost&Found (sugerir título/categoría desde la foto).
- Chat "Preguntale a Tribbu" y resúmenes escritos por IA (opciones 4 y 5).
- Publicar automáticamente sin revisión humana, o leer directamente desde WhatsApp (siempre se pega o se sube a mano).
- Traducción a otros idiomas.
- Usarlo al **editar** un registro existente.
- Límites configurables por colegio o un plan pago; el tope de 20/día es fijo en v1.
