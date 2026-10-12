---
title: Docentes con sus cursos, materias y clases, y grupos de mensajes
status: in-progress (fases A y B implementadas 2026-10-12)
priority: high
---

## Summary

Hoy las maestras de tribbu son una ficha con un texto libre de materia
("Gimnasia", "Gym Primaria", "Educacion Fisica"…) y, si el colegio les da
acceso, solo ven Mensajes. El horario de cada curso también se escribe a mano
(materia y docente como texto). Además, una familia solo puede chatear de a
uno. Esta spec hace tres cosas:

1. **Materias y clases**: el colegio carga su lista de materias una vez y
   asigna por curso quién da cada una ("4°B · Inglés · Seño Laura"). El
   horario se arma eligiendo esas clases, sin texto libre.
2. **Docente completa**: la maestra entra y ve sus cursos (Avisos, Calendario,
   Horario, Alumnos, Mensajes) y puede publicar Avisos, Eventos,
   Autorizaciones y Encuestas para sus cursos.
3. **Mensajes a varias familias**: grupo automático del curso, grupos propios
   armados por un apoderado y difusión (mismo mensaje a varias familias, cada
   una por su 1 a 1).

Decisiones (Yanina, 2026-10-12): materias + asignaciones; la docente publica
Avisos, Eventos, Autorizaciones y Encuestas; ve sus cursos completos (sin
teléfonos ni emails de las familias); los tres modos de mensajería grupal.
Web y app. Se entrega en 3 fases: A (materias y clases) → B (docente
completa) → C (grupos).

## Acceptance Criteria

### Fase A: materias y clases
- [x] Super Admin → Cursos → "📚 Materias": el colegio crea, renombra, ordena, colorea y desactiva materias (únicas por colegio, sin distinguir mayúsculas/acentos). Web + panel mobile.
- [x] En cada curso, "Clases": lista de materia + maestra (la maestra es opcional, una materia puede tener más de una). Se agregan eligiendo de listas, nunca escribiendo. Web + panel mobile.
- [x] La ficha de la maestra muestra sus clases ("Inglés en 4°B y 5°A") en lugar del texto "Materia"; el campo libre desaparece del formulario.
- [x] El horario de un curso se carga eligiendo una de sus clases; materia, docente y color salen de la clase. Los horarios viejos con texto libre se siguen viendo igual hasta que se editen.
- [x] Migración: se crean las materias a partir de los textos actuales (maestros y horarios), agrupando variantes obvias que el colegio confirma en una pantalla de revisión ("Gym Primaria" → ¿Educación Física?); se crean las clases a partir de las asignaciones actuales maestra ↔ curso. Ningún dato se borra.
- [x] Todo lo que hoy lee maestra ↔ curso (Contacto, Cumpleaños de maestras, Muro, Calendario, avisos automáticos, feed ICS) sigue funcionando sin cambios visibles.
- [x] En Mensajes → Nuevo → Maestras, cada maestra aparece con la materia que da en ese curso.

### Fase B: docente completa
- [x] Una docente entra a tribbu con "Mi acceso" = sus cursos (uno por curso, con el color del curso; "Todos" si tiene más de uno), igual que un apoderado con varios hijos.
- [x] Ve, para sus cursos: Inicio (pendientes y agenda del curso), Avisos, Calendario + Horario, Alumnos (nombre del alumno y nombres de sus apoderados, **sin teléfono ni email**) y Mensajes. No ve Colectas, Cumpleaños/festejos de las familias, Marketplace, Lost & Found ni Comedor.
- [x] Puede publicar **Avisos** (con push) para uno o varios de sus cursos; se muestran con una etiqueta "👩‍🏫 Seño Laura · Inglés" en Avisos, Muro y Notificaciones, y se pueden filtrar por origen como las comunicaciones del colegio.
- [x] Puede crear **Eventos** en el calendario de sus cursos (pruebas, salidas, entregas), con la misma etiqueta.
- [x] Puede pedir **Autorizaciones** a sus cursos y ver las respuestas por alumno (igual que la Room Parent).
- [x] Puede crear **Encuestas** para sus cursos y ver resultados; **no** puede votar en encuestas de las familias.
- [x] Edita y borra solo lo que ella publicó; el colegio puede editar o borrar lo de sus docentes.
- [x] Desde Alumnos, "💬 Escribir a la familia" abre el hilo alumno × maestra (ya existente).
- [x] Funciona en web (desktop sidebar y mobile web) y en la app, con el mismo patrón de navegación que el apoderado (bottom tabs + Más).

### Fase C: mensajes a varias familias
- [ ] **Grupo del curso** (fase 2 de specs/mensajes.md): uno por curso del año, automático, con todas las familias del curso y su Room Parent (sin maestras ni colegio). Lo modera la Room Parent; cada mensaje lleva quién lo escribió; se puede silenciar; requiere aceptar las normas.
- [ ] **Grupos propios**: un apoderado crea un grupo con nombre (ej. "Cumple de Juan") eligiendo familias de sus cursos (máx. 50). Quien lo crea puede renombrarlo, sumar y sacar gente; cualquiera puede salirse. Los demás ven quién está en el grupo (nombres, nunca teléfonos). Push a los miembros, silenciable.
- [ ] **Difusión**: "Mensaje a varias familias" permite elegir varias familias (o "todas las de 4°B") y mandar un texto (+ fotos); a cada una le llega en su 1 a 1 con quien lo mandó, y las respuestas son privadas. Máx. 50 destinatarios por envío; respeta bloqueos.
- [ ] Bloquear a alguien oculta sus mensajes en grupos y lo saca de mis difusiones.
- [ ] Los grupos propios y del curso se borran al cierre del año lectivo, como el resto de Mensajes.

## Technical Notes

**Fase A — datos (`supabase/materias-y-clases.sql`)**
- `materias` (`id`, `colegio_id` not null, `nombre`, `color`, `orden`, `activo`, unique `(colegio_id, lower(unaccent(nombre)))`).
- `clases` (`id`, `curso_id`, `materia_id`, `maestro_id` nullable, `creado_en`; unique `(curso_id, materia_id, maestro_id)`). Scope por `curso_id → colegio_id` como el resto (multi-colegio). RLS: lectura = miembros del curso + docentes del curso + colegio; escritura = colegio (super / colegio_admin), igual que hoy `maestro_cursos`.
- `maestro_cursos` **se mantiene como derivada** (trigger en `clases` que inserta/borra el par maestro ↔ curso) para no tocar los 10 lugares que la leen (web/mobile calendario, cumples, muro, superadmin, `avisos-automaticos`, `calendar-feed`). `maestros.materia` queda deprecada (se deja de escribir; se muestra derivada de las clases).
- `horarios.clase_id` nullable; un trigger completa `materia`/`docente`/`color` desde la clase al guardar, así las pantallas actuales de Horario no cambian. Los registros viejos sin `clase_id` siguen como están.
- Migración en dos pasos: script SQL que propone materias normalizadas (sin acentos, minúsculas) + pantalla "Revisar materias importadas" en Super Admin para fusionar duplicados antes de crear las clases.

**Fase B — permisos**
- Helper `es_docente_curso(curso)` (security definer): existe una clase de ese curso cuya maestra tiene `usuario_id = mi_usuario_id()`. **No** se agrega a `es_miembro_curso` (que también habilita colectas, votos, festejos, marketplace…): se suma explícitamente a SELECT de `recordatorios`, `eventos`, `horarios`, `clases`, `hijos` (solo nombre/apellido/curso por RPC), `autorizaciones`, `encuestas`, y a INSERT de `recordatorios`, `eventos`, `autorizaciones`, `encuestas`. Votar (`encuesta_votos`) sigue siendo de familias.
- `comparte_curso` **no** incluye docentes → la docente no puede leer filas de `usuarios` de las familias (teléfono/email). Los nombres de apoderados en Alumnos salen de un RPC `familias_de_curso_docente(curso)`.
- `puede_editar_evento` / `puede_editar_recordatorio` / gestión de autorizaciones: el autor ya puede; agregar al colegio sobre lo creado por sus docentes.
- Etiqueta de origen: `recordatorios`/`eventos`/`autorizaciones`/`encuestas` ya tienen `creado_por`; la UI resuelve "docente" con un RPC `autores_docentes(ids)` (nombre + materias) para no exponer `usuarios`.
- Sesión: `armarUsuario` (`src/lib/sesion.js`, `@shared/sesion`) arma los `items` de la docente desde sus clases (`_tipo: "curso"`, `rolEfectivo: "docente"`); `App.jsx` reemplaza la vista solo-Mensajes por el layout normal con un set de pestañas acotado (`TABS` filtrado por rol). Mobile: `(docente)` pasa a reutilizar `(tabs)` con la lista de pestañas filtrada en `FloatingTabBar`/Más, o se queda como stack propio con esas pantallas — decidir al implementar según cuánto cambie `Session.jsx`.

**Fase C — datos**
- Grupo del curso: tipo `curso` ya modelado; RPC `abrir_grupo_curso(curso)` idempotente; aparece en la lista para todos los miembros aunque no tenga mensajes. Membresía = `es_miembro_curso` (familias + Room Parent).
- Grupos propios: nuevo tipo `grupo` en `conversaciones` (`nombre`, `creado_por`, `curso_id` = un curso del creador para la retención) + `conversacion_participantes (conversacion_id, usuario_id)` como **membresía explícita** (solo para este tipo). Alta/baja de participantes por RPC (`crear_grupo`, `editar_grupo`, `salir_de_grupo`); solo se puede sumar a quien comparte curso con el creador.
- Difusión: RPC `enviar_difusion(p_usuarios uuid[], p_texto, p_fotos)` que, como el remitente, abre/crea cada 1 a 1 (`abrir_conversacion_directa`) e inserta un mensaje por destinatario (respeta bloqueos y normas; máx. 50). El push sale por el trigger de cada mensaje (agrupado por conversación).
- `mensajes-push`: títulos para `curso` ("Grupo 4°B · Ana: …", ya está) y `grupo` ("<nombre del grupo> · Ana: …").

**UI**
- Super Admin: "📚 Materias" (catálogo), pestaña "Clases" dentro de cada curso, selector de clase en Horarios. Reusar `CursoListSelector`, `useListControls`.
- Mensajes: en "Nuevo", pestañas nuevas "Grupo" (crear grupo propio) y acción "Mensaje a varias familias" (difusión) con multi-selección + "Seleccionar todo el curso".
- QA: agent-browser con tu cuenta (apoderado + Room Parent) y una cuenta de docente de prueba en el colegio; emulador Android para la vista docente.

## Out of Scope

- Que la maestra vea Colectas, Cumpleaños de las familias, Marketplace, Lost & Found o Comedor.
- Calificaciones, tareas con entrega, asistencia de alumnos.
- Que la maestra participe del grupo del curso (es de las familias).
- Grupos entre familias de distintos cursos que no comparten curso con el creador.
- Importar materias/clases desde un Excel (se cargan a mano; se puede sumar después).
- Que un apoderado pueda tener a la vez rol docente en el mismo usuario (si una mamá también es maestra, usa dos cuentas).
