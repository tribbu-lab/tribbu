---
title: Roles del colegio por nivel (Inicial / Primaria / Secundaria)
status: implementado (2026-10-21) — SQL probado con rollback (30 chequeos)
priority: high
---

## Summary

Hoy el colegio tiene un solo rol, `colegio_admin`, que puede todo en su colegio
(usuarios, cursos, horarios, comunicados, menú, autorizaciones, talleres,
mensajes de familias…). Se separa en:

- **Administrador del colegio** (el `colegio_admin` de hoy): ve y gestiona
  todos los niveles. Sin cambios.
- **Secretaría** (rol nuevo, `nivel_admin`): lo mismo que el administrador,
  pero solo para los cursos de **sus** niveles (uno o varios), y sin lo que es
  de todo el colegio (ver Permisos).

Dos cosas que dependen del nivel:
- **Comunicados**: elegir "todo el colegio", uno o varios niveles, o cursos
  sueltos.
- **Menú del comedor**: lo carga el administrador e indica a qué niveles
  aplica.

## Decisiones de Yanina (2026-10-21)

1. **Los niveles son opcionales**: un colegio puede no tener alguno (solo
   Primaria, o Inicial + Primaria). El colegio elige cuáles tiene; si tiene uno
   solo (o ninguno), no aparece nada de niveles en la app.
2. Una Secretaría puede tener **más de un nivel**.
3. Permisos: los de la propuesta (abajo), sin cambios.
4. La Secretaría **crea cuentas de familias y cambia contraseñas**, solo de
   familias de su nivel.
5. **Menú**: lo carga solo el administrador del colegio e indica a qué niveles
   aplica.
6. **Mensajes → Secretaría**: la Secretaría contesta los hilos de alumnos de
   su nivel; el administrador sigue viéndolos todos.
7. Nombre del rol en pantalla: **"Secretaría"** (con el nivel cuando hace
   falta: "Secretaría · Primaria").
8. Las alertas del colegio son para todos (familias y maestras): no cambian
   con los niveles.

## Estado actual (datos de prod, 2026-10-21)

- Los cursos no tienen nivel: se deduce del nombre (`"1°B - Primaria"`,
  `"K3 Ants - Kinder"`). En el colegio que usa tribbu hoy hay dos sufijos,
  `Kinder` y `Primaria`; ningún curso sin sufijo.
- 3 usuarios `colegio_admin`.
- `menu` es `unique(colegio_id, fecha)`.
- El alcance de `colegio_admin` es 100% RLS (`es_colegio_admin_de(colegio)`),
  sin filtros en el cliente.

## Diseño

### Modelo

- `colegios.niveles text[] not null default '{}'` — los niveles que tiene el
  colegio, de `('inicial','primaria','secundaria')`. Se edita en Super Admin →
  Colegio. Migración: los niveles que aparecen en los nombres de sus cursos.
- `cursos.nivel text null check (nivel in ('inicial','primaria','secundaria'))`
  — null = sin nivel. Migración por el sufijo del nombre: `Kinder` / `Jardín` /
  `Sala` / `Inicial` → inicial, `Primaria` → primaria, `Secundaria` →
  secundaria; el resto queda null. Se elige al crear o editar un curso (el
  selector solo aparece si el colegio tiene más de un nivel, con las opciones
  de `colegios.niveles`) y "Duplicar para el año siguiente" lo copia. El nombre
  del curso no cambia.
- Rol nuevo **`nivel_admin`** (se suma a `usuarios_rol_check`), con
  `usuarios.colegio_id` (como `colegio_admin`) y `usuarios.niveles text[]`
  (uno o varios). Etiqueta "Secretaría" (`ROL_LABEL`/`ROL_COLOR`/`ROL_BG` en
  `src/lib/theme.js`).
- Helpers SQL: `es_secretaria_de_curso(curso)` = `nivel_admin` del colegio del
  curso con `cursos.nivel = any(usuarios.niveles)`; `es_secretaria_de_hijo`,
  `es_secretaria_de_usuario` (familia con algún hijo en un curso de sus
  niveles). Un curso **sin nivel** solo lo gestiona el administrador.
- Se agregan como alternativa al lado de `es_colegio_admin_de(colegio_de_X)`
  en las políticas que dependen de un curso (recordatorios, eventos,
  autorizaciones + respuestas, horarios, clases + clase_alumnos, hijos,
  usuario_hijos, usuario_cursos, colectas, encuestas, alertas, talleres por
  curso, conversaciones `colegio`, denuncias de chats de su nivel,
  `puede_ver_lecturas`, `adopcion_por_curso`). Aditivo, en
  `supabase/roles-por-nivel.sql`, probado en una transacción con rollback.

### Permisos de la Secretaría

- **Puede**, solo en cursos de sus niveles: comunicados, eventos,
  autorizaciones, alertas, horarios y clases, alumnos y apoderados (crear
  cuentas y cambiar contraseñas incluido), Room Parents, Mensajes →
  Secretaría, talleres de sus cursos, Adopción e "Inicio / Para resolver" de su
  nivel.
- **No puede**: crear o borrar cursos, Promoción, año lectivo, ficha del
  colegio y niveles, materias y maestras, uniformes, menú, Marketplace, crear
  administradores ni otras Secretarías.

### Panel

- El mismo panel que usa `colegio_admin` (web `src/features/superadmin`,
  mobile `mobile/features/superadmin`), filtrado por RLS; se ocultan las
  secciones que no le corresponden. Encabezado "Secretaría · Primaria".
- Usuarios → "Acceso especial": el administrador (y super) puede crear una
  "Secretaría" eligiendo sus niveles; una Secretaría no ve ese toggle.
- `manage-auth-user`: acepta `nivel_admin`; `create` sin restricción (como
  hoy), `update`/`find` solo si el usuario destino es una familia con un hijo
  en un curso de sus niveles (`targetEnNivel()`, resuelto a mano como
  `targetEnColegio()`). Nunca puede tocar a un administrador ni a otra
  Secretaría. Redeploy con `--no-verify-jwt`.

### Comunicados por nivel

- `ComunicacionesAdmin` (web + mobile) y "Evento para varios cursos" y
  Autorizaciones del colegio: arriba de la lista de cursos, chips "Todo el
  colegio" + un chip por nivel del colegio (solo si tiene más de uno). Elegir
  niveles tilda sus cursos; se pueden destildar cursos sueltos. Sigue siendo
  una fila por curso con el mismo `grupo_id`.
- Una Secretaría solo ve sus niveles y sus cursos.

### Menú por niveles

- `menu.niveles text[] null` (null = todos los niveles) + columna generada
  `menu.niveles_clave` ("" o "inicial,primaria"). La unicidad pasa de
  `(colegio_id, fecha)` a `(colegio_id, fecha, niveles_clave)`: puede haber un
  menú general y otros por nivel el mismo día. Los upserts usan
  `onConflict:"colegio_id,fecha,niveles_clave"` (web y mobile). Un menú propio
  de un nivel no borra el general: lo tapa para esas familias.
- Al subir el Excel (`UploadMenuExcel`, web y mobile) el administrador elige
  "Todos los niveles" o uno o varios (chips; solo si el colegio tiene más de
  uno).
- La familia ve, por día, el menú cuyo `niveles` incluye el nivel del curso de
  su hijo; si no hay, el de "todos". Reglas puras `menuParaNivel` /
  `menusParaNivel` / `nivelDeVista` en `@shared/niveles`, usadas en Inicio
  "Menú de hoy" y Comedor (web y mobile). Un curso sin nivel, o la vista
  "Todos" con hijos en niveles distintos, ve el de "todos".

## Diferencias con lo planeado (implementación 2026-10-21)

- **Talleres**, **Lost & Found del colegio** y **Denuncias** quedan solo para
  el administrador en esta etapa (son de todo el colegio): la Secretaría no ve
  esas secciones.
- Los **niveles del colegio** y las **cuentas de Secretaría** se configuran en
  la web (Super Admin → Colegio). En mobile la Secretaría usa el panel, pero
  el nivel de un curso y las Secretarías no se editan desde ahí.
- **Transición**: al aplicar el SQL, la versión vieja de la app mobile no puede
  subir el menú (usa `onConflict:"colegio_id,fecha"`) hasta el build nuevo, y
  si se carga un menú propio de un nivel, la app vieja no muestra el menú de
  ese día en el Inicio.

## Acceptance Criteria

- [x] `colegios.niveles` editable; `cursos.nivel` migrado desde el nombre,
      editable y copiado por "Duplicar". Con un solo nivel (o ninguno) no
      aparece nada de niveles.
- [x] Una Secretaría de Primaria ve y gestiona solo cursos de Primaria en las
      secciones permitidas; con Inicial + Primaria, los dos. Probado con RLS en
      transacción con rollback (no lee ni escribe nada de otro nivel ni de
      cursos sin nivel).
- [ ] La Secretaría crea familias y les cambia la contraseña solo en su nivel
      (Edge Function: falta deploy y prueba con una cuenta real; RLS de usuarios ya probada).
- [x] El administrador del colegio sigue viendo todo, sin cambios.
- [x] Comunicados, eventos multi-curso y autorizaciones permiten elegir
      niveles; la Secretaría solo ve los suyos.
- [x] Menú con niveles: la familia ve el de su nivel o, si no hay, el general
      (Inicio + Comedor, web y mobile).
- [x] Mensajes → Secretaría: la Secretaría ve y contesta los hilos de su nivel.
- [x] Panel mobile también sirve a la Secretaría.
- [x] Lint + build web, lint mobile + `npx expo export -p ios`, CLAUDE.md.

## Out of Scope

- Permisos configurables por persona (casillas de "puede/no puede").
- Niveles en el Marketplace o en Lost & Found.
- Reportes comparativos entre niveles.
