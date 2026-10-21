---
title: Roles del colegio por nivel (Inicial / Primaria / Secundaria)
status: draft — falta que Yanina responda las preguntas abiertas
priority: high
---

## Summary

Hoy el colegio tiene un solo rol, `colegio_admin`, que puede todo en su colegio
(usuarios, cursos, horarios, comunicados, menú, autorizaciones, talleres,
mensajes de familias…). Yanina pidió separar:

- **Administrador del colegio** (el `colegio_admin` de hoy): ve y gestiona
  todos los niveles.
- **Secretaría / Dirección de nivel** (rol nuevo): lo mismo, pero solo para
  los cursos de su nivel (Inicial, Primaria o Secundaria). Un director de
  Primaria no debería poder mandarle un comunicado a Kinder ni tocar sus
  horarios.

De paso, dos cosas que dependen del nivel:
- **Comunicados**: elegir "todo el colegio" o "un nivel" además de los cursos
  sueltos de hoy.
- **Menú del comedor**: un menú puede valer para todos los niveles o solo para
  uno (hoy hay un único menú por colegio y por día).

## Estado actual (datos de prod, 2026-10-21)

- Los cursos no tienen nivel: se deduce del nombre (`"1°B - Primaria"`,
  `"K3 Ants - Kinder"`). En el colegio que usa tribbu hoy hay dos sufijos,
  `Kinder` y `Primaria`; ningún curso sin sufijo.
- 3 usuarios `colegio_admin`.
- `menu` es `unique(colegio_id, fecha)`.
- El alcance de `colegio_admin` es 100% RLS (`es_colegio_admin_de(colegio)`),
  sin filtros en el cliente.

## Propuesta

### Modelo

- `cursos.nivel text not null check (nivel in ('inicial','primaria','secundaria'))`.
  Migración: `Kinder`/`Jardín`/`Sala` → inicial, `Primaria` → primaria,
  `Secundaria` → secundaria (por el sufijo del nombre). Se elige al crear o
  editar un curso (Super Admin → Cursos) y "Duplicar para el año siguiente" lo
  copia. El nombre del curso no cambia.
- Rol nuevo **`nivel_admin`** (etiqueta "Dirección de nivel" o la que elija
  Yanina) + `usuarios.nivel` (el nivel que administra) y `usuarios.colegio_id`
  (como `colegio_admin`). ¿Puede tener más de un nivel? → pregunta 2.
- Helper SQL `es_admin_nivel_de_curso(curso)` = `nivel_admin` del colegio del
  curso con el mismo nivel. Se agrega como alternativa al lado de
  `es_colegio_admin_de(colegio_de_curso(...))` en las políticas que hoy se
  basan en un curso (recordatorios, eventos, autorizaciones, horarios, clases,
  alumnos/hijos, usuario_cursos, colectas, encuestas, alertas, talleres por
  curso…). Igual que `multi-colegio.sql`: aditivo, en un SQL nuevo
  (`supabase/roles-por-nivel.sql`), probado en una transacción con rollback.
- Lo que es de **todo el colegio** (ficha del colegio y logo, materias,
  maestras, contactos, uniformes, crear `colegio_admin`, Marketplace, año
  lectivo, Promoción) queda solo para `colegio_admin` salvo lo que se decida
  en la pregunta 3.

### Panel (web; mobile igual que `colegio_admin` en mobile)

- El mismo panel de Super Admin que usa `colegio_admin`, filtrado por RLS. Los
  selectores de cursos muestran solo los de su nivel (sale solo de RLS, como
  hoy con `colegio_admin`).
- Secciones que no le corresponden se ocultan (lista en la pregunta 3).
- Encabezado: "Dirección de Primaria" en vez de "Admin del colegio".
- Usuarios → "Acceso especial": el `colegio_admin` (y super) puede crear un
  `nivel_admin` eligiendo el nivel; un `nivel_admin` no puede crear otros.
  `manage-auth-user` tiene que aceptar `nivel_admin` con el mismo recorte que
  `colegio_admin` (solo usuarios de su nivel) — ver pregunta 4.

### Comunicados por nivel

- `ComunicacionesAdmin` suma un selector arriba de la lista de cursos:
  "Todo el colegio" / "Inicial" / "Primaria" / "Secundaria" / "Elegir cursos".
  Elegir un nivel tilda sus cursos (sigue siendo una fila por curso con el
  mismo `grupo_id`, sin cambios en la tabla).
- Un `nivel_admin` solo ve su nivel en ese selector.
- Lo mismo en "Evento para varios cursos" y en Autorizaciones del colegio.

### Menú por nivel

- `menu.nivel text null` (null = todos los niveles). Unicidad pasa a
  `unique(colegio_id, coalesce(nivel,'todos'), fecha)` (índice único por
  expresión; los upserts dejan de usar `onConflict` y pasan a una RPC
  `guardar_menu(...)` o a borrar+insertar el día).
- Al subir el Excel (`UploadMenuExcel`, web y mobile) se elige "Para todos los
  niveles" o un nivel. Una familia ve el menú de su nivel si existe, si no el
  de "todos" (por día). Inicio "Menú de hoy" y Comedor usan la misma regla
  (`menuDelDia(filas, nivel)` en `@shared/menu`).
- ¿Quién carga el menú de un nivel? → pregunta 5.

## Preguntas abiertas para Yanina

1. **Niveles**: ¿alcanza con Inicial / Primaria / Secundaria? ¿"Kinder" es
   Inicial? ¿Hay colegios con más divisiones (p. ej. Primer y Segundo ciclo)?
2. ¿Una persona puede administrar **más de un nivel** (directora de Inicial y
   Primaria)? Si sí, `usuarios.niveles text[]`.
3. ¿Qué **no** puede hacer la Dirección de nivel? Propuesta:
   - Puede: comunicados, eventos, autorizaciones, alertas, horarios y clases,
     alumnos y apoderados, Room Parents, mensajes de familias (Secretaría) y
     talleres de **sus** cursos; ver Adopción y "Para resolver" de su nivel.
   - No puede: crear/borrar cursos, Promoción, año lectivo, ficha del colegio,
     materias y maestras, uniformes, menú (salvo que se decida otra cosa),
     Marketplace, crear otros administradores.
4. ¿La Dirección de nivel puede **crear cuentas de familias** y cambiar
   contraseñas? (Hoy eso lo hace `colegio_admin` vía Edge Function.)
5. **Menú**: ¿lo carga solo el administrador del colegio, o cada nivel el suyo?
   ¿Hay colegios con menú distinto por nivel hoy, o es "por si acaso"?
6. **Secretaría en Mensajes**: hoy "Secretaría" es un solo hilo por alumno que
   contesta cualquier `colegio_admin`. ¿La Dirección de nivel también contesta
   (solo los de su nivel)? ¿El administrador general sigue viéndolos todos?
7. ¿Cómo se llama el rol en pantalla? "Dirección de nivel", "Secretaría de
   nivel", "Directivo"…

## Acceptance Criteria

- [ ] `cursos.nivel` existe, migrado desde el nombre, editable en Cursos y
      copiado por "Duplicar".
- [ ] Un `nivel_admin` de Primaria ve y gestiona solo cursos de Primaria en
      todas las secciones permitidas (probado con RLS en transacción con
      rollback: no puede leer ni escribir nada de Inicial).
- [ ] El `colegio_admin` sigue viendo todo, sin cambios.
- [ ] Comunicados, eventos multi-curso y autorizaciones permiten elegir un
      nivel; un `nivel_admin` solo ve el suyo.
- [ ] El menú puede ser "todos" o de un nivel; la familia ve el de su nivel o,
      si no hay, el general (web Inicio + Comedor, mobile igual).
- [ ] `manage-auth-user` recorta a `nivel_admin` igual que a `colegio_admin`
      (si se decide que puede crear cuentas).
- [ ] Panel mobile (`colegio_admin` en mobile) también sirve al `nivel_admin`.
- [ ] Lint + build web, lint mobile + `npx expo export -p ios`, CLAUDE.md.

## Out of Scope

- Permisos configurables por persona (casillas de "puede/no puede"): se elige
  un rol con permisos fijos.
- Niveles en el Marketplace o en Lost & Found.
- Reportes comparativos entre niveles.
