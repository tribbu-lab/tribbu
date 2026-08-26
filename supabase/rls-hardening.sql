-- =============================================================================
-- rls-hardening.sql  ·  Aislamiento por curso (Row Level Security) para tribbu
-- =============================================================================
--
-- CONTEXTO
--   Antes de este script, cualquier usuario autenticado (y en algunas tablas
--   incluso un anónimo con la anon key) podía leer datos de TODOS los cursos vía
--   la API REST de Supabase. La UI filtra por curso_id del lado del cliente, pero
--   PostgREST devolvía todo. Este script cierra la fuga a nivel de base con RLS.
--
-- MODELO
--   · usuarios.rol = 'super'  → ve y administra TODO (helper es_super()).
--   · El resto accede solo a los cursos donde tiene fila en usuario_cursos
--     (rol 'admin' o 'padre' POR curso).
--   · Tablas "de marca propia" (recordatorio_leidos, *_adquirido) → solo filas
--     del propio usuario.
--   · Tablas globales del colegio (menu, uniformes, uniforme_items, colegio) →
--     legibles por cualquier autenticado, escritas por super/admin.
--   · El registro con código de invitación se resuelve con funciones
--     SECURITY DEFINER (verificar_codigo / crear_apoderado) para no tener que
--     abrir INSERT anónimo sobre usuarios/usuario_cursos.
--
-- CÓMO CORRERLO
--   Pegar TODO el archivo en el SQL editor de Supabase (proyecto tribbu) y
--   ejecutar. Es idempotente: se puede correr varias veces. NO modifica datos.
--
-- IMPORTANTE
--   · Las funciones helper son SECURITY DEFINER y deben quedar OWNED por un rol
--     con BYPASSRLS (postgres / supabase_admin — es el default cuando se corre
--     desde el SQL editor). Así evitan la recursión de RLS sobre usuario_cursos
--     y usuarios, que son la base de todo el modelo.
--   · NO usamos FORCE ROW LEVEL SECURITY: los helpers definer y las Edge
--     Functions (service_role, BYPASSRLS) dependen de poder saltear RLS.
--   · Requiere el cambio de cliente asociado (ver specs/rls-hardening.md):
--     verificarCodigo() y registrar() pasan a usar los RPC. Aplicar SQL y código
--     JUNTOS: si se aplica solo el SQL, el registro deja de funcionar hasta
--     desplegar el código nuevo, y viceversa.
--
-- ROLLBACK  → ver el bloque comentado al final del archivo.
-- =============================================================================

-- Lista de tablas alcanzadas (para el drop masivo y los ALTER de abajo).
-- codigos_invitacion se incluye aunque no esté en el TABLES de backup_tribbu.cjs.

-- -----------------------------------------------------------------------------
-- 0) LIMPIEZA: borrar TODAS las policies existentes de estas tablas.
--    Necesario porque las policies son permisivas (OR): si quedara una vieja
--    con USING (true), la fuga seguiría abierta. Esto deja pizarra limpia.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  tablas text[] := array[
    'usuarios','cursos','hijos','maestros','maestro_cursos',
    'usuario_hijos','usuario_cursos','cumples','eventos','evento_asistencia',
    'recordatorios','recordatorio_leidos','colectas','colecta_pagos','menu',
    'utiles','util_adquirido','libros','libro_adquirido','uniformes',
    'uniforme_items','uniforme_cursos','uniforme_adquirido','horarios',
    'colegio','contactos','alertas','codigos_invitacion'
  ];
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any(tablas)
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 1) FUNCIONES HELPER (SECURITY DEFINER · sin RLS interna → sin recursión)
-- -----------------------------------------------------------------------------

-- id de la fila usuarios del auth.uid() actual (o null si no hay/no existe)
create or replace function public.mi_usuario_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select id from public.usuarios where auth_id = auth.uid() limit 1
$$;

-- ¿el usuario actual es super?
create or replace function public.es_super()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.usuarios
    where auth_id = auth.uid() and rol = 'super'
  )
$$;

-- ¿el usuario actual es miembro (cualquier rol) del curso dado?
-- Membresía = usuario_cursos O hijo vinculado en el curso (el modelo "Mi
-- acceso" del cliente deriva el acceso de hijos.curso_id; sin la segunda
-- fuente, un padre sin fila usuario_cursos —alta/edición por Super Admin,
-- hijo promovido de curso— no leía NADA de su curso; fix 2026-08-26, ver
-- rls-membresia-por-hijo.sql).
create or replace function public.es_miembro_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_cursos uc
    join public.usuarios u on u.id = uc.usuario_id
    where u.auth_id = auth.uid() and uc.curso_id = p_curso
  ) or exists(
    select 1
    from public.usuario_hijos uh
    join public.usuarios u on u.id = uh.usuario_id
    join public.hijos h on h.id = uh.hijo_id
    where u.auth_id = auth.uid() and h.curso_id = p_curso
  )
$$;

-- ¿el usuario actual es admin (Room Parent) del curso dado?
create or replace function public.es_admin_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_cursos uc
    join public.usuarios u on u.id = uc.usuario_id
    where u.auth_id = auth.uid() and uc.curso_id = p_curso and uc.rol = 'admin'
  )
$$;

-- ¿el usuario actual es admin de AL MENOS un curso? (para recursos globales del colegio)
create or replace function public.es_admin_any()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_cursos uc
    join public.usuarios u on u.id = uc.usuario_id
    where u.auth_id = auth.uid() and uc.rol = 'admin'
  )
$$;

-- ¿el usuario actual comparte al menos un curso con el usuario objetivo?
-- (visibilidad "mismo curso" para listar compañeros: Contacto/Alumnos/Finanzas/Cumples)
-- Los cursos de cada lado = usuario_cursos ∪ cursos de sus hijos vinculados
-- (misma unión que es_miembro_curso; fix 2026-08-26, ver rls-membresia-por-hijo.sql).
create or replace function public.comparte_curso(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from (
      select uc.curso_id
      from public.usuario_cursos uc
      join public.usuarios u on u.id = uc.usuario_id
      where u.auth_id = auth.uid()
      union
      select h.curso_id
      from public.usuario_hijos uh
      join public.usuarios u on u.id = uh.usuario_id
      join public.hijos h on h.id = uh.hijo_id
      where u.auth_id = auth.uid()
    ) mios
    join (
      select uc.curso_id
      from public.usuario_cursos uc
      where uc.usuario_id = p_usuario
      union
      select h.curso_id
      from public.usuario_hijos uh
      join public.hijos h on h.id = uh.hijo_id
      where uh.usuario_id = p_usuario
    ) otros on otros.curso_id = mios.curso_id and otros.curso_id is not null
  )
$$;

-- ¿el hijo dado está vinculado al usuario actual (usuario_hijos)?
create or replace function public.es_padre_de(p_hijo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_hijos uh
    join public.usuarios u on u.id = uh.usuario_id
    where u.auth_id = auth.uid() and uh.hijo_id = p_hijo
  )
$$;

-- ¿soy miembro del curso al que pertenece el hijo dado?
create or replace function public.es_miembro_curso_de_hijo(p_hijo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_miembro_curso((select curso_id from public.hijos where id = p_hijo))
$$;

-- ¿soy admin del curso al que pertenece el hijo dado?
create or replace function public.es_admin_curso_de_hijo(p_hijo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_admin_curso((select curso_id from public.hijos where id = p_hijo))
$$;

-- ¿soy miembro del curso al que pertenece el evento dado?
create or replace function public.es_miembro_curso_de_evento(p_evento uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_miembro_curso((select curso_id from public.eventos where id = p_evento))
$$;

-- ¿soy miembro del curso al que pertenece la colecta dada?
create or replace function public.es_miembro_curso_de_colecta(p_colecta uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_miembro_curso((select curso_id from public.colectas where id = p_colecta))
$$;

-- ¿el maestro dado es visible para mí? (da clase en algún curso donde soy miembro)
create or replace function public.es_maestro_visible(p_maestro uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super() or exists(
    select 1 from public.maestro_cursos mc
    where mc.maestro_id = p_maestro and public.es_miembro_curso(mc.curso_id)
  )
$$;

-- Los helpers se ejecutan desde las policies como anon/authenticated:
grant execute on function
  public.mi_usuario_id(), public.es_super(), public.es_miembro_curso(uuid),
  public.es_admin_curso(uuid), public.es_admin_any(), public.comparte_curso(uuid),
  public.es_padre_de(uuid), public.es_miembro_curso_de_hijo(uuid),
  public.es_admin_curso_de_hijo(uuid), public.es_miembro_curso_de_evento(uuid),
  public.es_miembro_curso_de_colecta(uuid), public.es_maestro_visible(uuid)
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) FUNCIONES DEL REGISTRO CON CÓDIGO (reemplazan el acceso directo del cliente)
--    Definer: validan el código y crean el apoderado sin exponer INSERT anónimo
--    ni permitir auto-enrolarse a un curso arbitrario.
-- -----------------------------------------------------------------------------

-- Paso 1: verificar el código y devolver el curso (sin permitir enumerar códigos
-- vía SELECT directo — el anónimo NO tiene policy de SELECT sobre codigos_invitacion).
create or replace function public.verificar_codigo(p_codigo text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_cod    public.codigos_invitacion%rowtype;
  v_nombre text;
begin
  select * into v_cod from public.codigos_invitacion
    where codigo = upper(trim(p_codigo));
  if not found        then return jsonb_build_object('valido', false, 'motivo', 'inexistente'); end if;
  if not v_cod.activo then return jsonb_build_object('valido', false, 'motivo', 'inactivo');    end if;
  if v_cod.usos_actuales >= v_cod.usos_max
                      then return jsonb_build_object('valido', false, 'motivo', 'sin_usos');    end if;
  select nombre into v_nombre from public.cursos where id = v_cod.curso_id;
  return jsonb_build_object(
    'valido', true, 'curso_id', v_cod.curso_id,
    'curso_nombre', v_nombre, 'codigo_id', v_cod.id
  );
end $$;

-- Paso 2: crear el apoderado (usuarios + usuario_cursos) y consumir el código.
-- El Auth user ya lo creó el cliente con supabase.auth.signUp(); acá pasa su auth_id.
create or replace function public.crear_apoderado(
  p_codigo   text,
  p_auth_id  uuid,
  p_nombre   text,
  p_apellido text,
  p_email    text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cod    public.codigos_invitacion%rowtype;
  v_uid    uuid;
  v_avatar text;
  v_nombre text;
begin
  if p_auth_id is null then raise exception 'auth_id requerido'; end if;
  -- Si hay sesión activa, el auth_id debe coincidir (evita crear filas para terceros).
  if auth.uid() is not null and auth.uid() <> p_auth_id then
    raise exception 'auth_id no coincide con la sesión';
  end if;

  select * into v_cod from public.codigos_invitacion
    where codigo = upper(trim(p_codigo)) for update;
  if not found or not v_cod.activo then raise exception 'Código inválido o inactivo'; end if;
  if v_cod.usos_actuales >= v_cod.usos_max then raise exception 'Código sin usos disponibles'; end if;

  -- Idempotencia: reutilizar la fila usuarios si ya existe para este auth_id.
  select id into v_uid from public.usuarios where auth_id = p_auth_id limit 1;
  if v_uid is null then
    v_avatar := upper(coalesce(left(p_nombre, 1), '') || coalesce(left(p_apellido, 1), ''));
    insert into public.usuarios (nombre, apellido, email, rol, avatar, activo, auth_id)
    values (
      trim(p_nombre),
      nullif(trim(coalesce(p_apellido, '')), ''),
      lower(trim(p_email)),
      'padre', v_avatar, true, p_auth_id
    )
    returning id into v_uid;
  end if;

  -- Vincular al curso del código (si no está ya vinculado).
  insert into public.usuario_cursos (usuario_id, curso_id, rol)
  select v_uid, v_cod.curso_id, 'padre'
  where not exists (
    select 1 from public.usuario_cursos
    where usuario_id = v_uid and curso_id = v_cod.curso_id
  );

  update public.codigos_invitacion set usos_actuales = usos_actuales + 1 where id = v_cod.id;

  select nombre into v_nombre from public.cursos where id = v_cod.curso_id;
  return jsonb_build_object('usuario_id', v_uid, 'curso_id', v_cod.curso_id, 'curso_nombre', v_nombre);
end $$;

grant execute on function
  public.verificar_codigo(text),
  public.crear_apoderado(text, uuid, text, text, text)
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) HABILITAR RLS EN TODAS LAS TABLAS
-- -----------------------------------------------------------------------------
alter table public.usuarios            enable row level security;
alter table public.cursos              enable row level security;
alter table public.hijos               enable row level security;
alter table public.maestros            enable row level security;
alter table public.maestro_cursos      enable row level security;
alter table public.usuario_hijos       enable row level security;
alter table public.usuario_cursos      enable row level security;
alter table public.cumples             enable row level security;
alter table public.eventos             enable row level security;
alter table public.evento_asistencia   enable row level security;
alter table public.recordatorios       enable row level security;
alter table public.recordatorio_leidos enable row level security;
alter table public.colectas            enable row level security;
alter table public.colecta_pagos       enable row level security;
alter table public.menu                enable row level security;
alter table public.utiles              enable row level security;
alter table public.util_adquirido      enable row level security;
alter table public.libros              enable row level security;
alter table public.libro_adquirido     enable row level security;
alter table public.uniformes           enable row level security;
alter table public.uniforme_items      enable row level security;
alter table public.uniforme_cursos     enable row level security;
alter table public.uniforme_adquirido  enable row level security;
alter table public.horarios            enable row level security;
alter table public.colegio             enable row level security;
alter table public.contactos           enable row level security;
alter table public.alertas             enable row level security;
alter table public.codigos_invitacion  enable row level security;

-- -----------------------------------------------------------------------------
-- 4) POLICIES POR TABLA
--    Convención de nombres: <tabla>_<accion>.  Todas TO authenticated salvo aviso.
-- -----------------------------------------------------------------------------

-- === usuarios ================================================================
-- Ver: yo mismo, compañeros de curso, o super. Escribir: solo super
-- (el alta de apoderado va por crear_apoderado(); el alta desde SuperAdmin corre
--  con el JWT super → es_super()).
create policy usuarios_select on public.usuarios for select to authenticated
  using ( public.es_super() or id = public.mi_usuario_id() or public.comparte_curso(id) );
create policy usuarios_insert on public.usuarios for insert to authenticated
  with check ( public.es_super() );
create policy usuarios_update on public.usuarios for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy usuarios_delete on public.usuarios for delete to authenticated
  using ( public.es_super() );

-- === cursos ==================================================================
-- Ver: miembros del curso o super. Editar settings del curso: admin del curso.
create policy cursos_select on public.cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(id) );
create policy cursos_insert on public.cursos for insert to authenticated
  with check ( public.es_super() );
create policy cursos_update on public.cursos for update to authenticated
  using ( public.es_super() or public.es_admin_curso(id) )
  with check ( public.es_super() or public.es_admin_curso(id) );
create policy cursos_delete on public.cursos for delete to authenticated
  using ( public.es_super() );

-- === hijos ===================================================================
-- Ver: miembros del curso del hijo, el padre vinculado, o super. Escribir: super.
create policy hijos_select on public.hijos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_padre_de(id) );
create policy hijos_insert on public.hijos for insert to authenticated
  with check ( public.es_super() );
create policy hijos_update on public.hijos for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy hijos_delete on public.hijos for delete to authenticated
  using ( public.es_super() );

-- === maestros (sin curso_id; visibilidad vía maestro_cursos) =================
create policy maestros_select on public.maestros for select to authenticated
  using ( public.es_maestro_visible(id) );
create policy maestros_insert on public.maestros for insert to authenticated
  with check ( public.es_super() );
create policy maestros_update on public.maestros for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy maestros_delete on public.maestros for delete to authenticated
  using ( public.es_super() );

-- === maestro_cursos ==========================================================
create policy maestro_cursos_select on public.maestro_cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy maestro_cursos_insert on public.maestro_cursos for insert to authenticated
  with check ( public.es_super() );
create policy maestro_cursos_update on public.maestro_cursos for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy maestro_cursos_delete on public.maestro_cursos for delete to authenticated
  using ( public.es_super() );

-- === usuario_hijos ===========================================================
-- Ver: mis vínculos, o miembros del curso del hijo (Alumnos/Cumples/getUserIdsByCurso), o super.
-- Escribir: admin del curso del hijo (pantalla Alumnos) o super. El registro NO
-- escribe acá. delete-account borra los propios vía service_role (bypass).
create policy usuario_hijos_select on public.usuario_hijos for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() or public.es_miembro_curso_de_hijo(hijo_id) );
create policy usuario_hijos_insert on public.usuario_hijos for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) );
create policy usuario_hijos_update on public.usuario_hijos for update to authenticated
  using ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) )
  with check ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) );
create policy usuario_hijos_delete on public.usuario_hijos for delete to authenticated
  using ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) );

-- === usuario_cursos (tabla base del modelo) ==================================
-- Ver: miembros del mismo curso (habilita getUserIdsByCurso y el bootstrap) o super.
-- Escribir: admin del curso o super. El alta del apoderado va por crear_apoderado().
create policy usuario_cursos_select on public.usuario_cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy usuario_cursos_insert on public.usuario_cursos for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy usuario_cursos_update on public.usuario_cursos for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy usuario_cursos_delete on public.usuario_cursos for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or usuario_id = public.mi_usuario_id() );

-- === cumples =================================================================
-- Los apoderados fijan responsable/comprado y organizan festejos → escribe cualquier miembro.
create policy cumples_select on public.cumples for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy cumples_insert on public.cumples for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy cumples_update on public.cumples for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy cumples_delete on public.cumples for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );

-- === eventos =================================================================
-- Festejos creados por apoderados + eventos de admin → escribe cualquier miembro.
create policy eventos_select on public.eventos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy eventos_insert on public.eventos for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy eventos_update on public.eventos for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy eventos_delete on public.eventos for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );

-- === evento_asistencia (sin curso_id; vía evento) ===========================
-- RSVP de los invitados + gestión de invitados por el creador → miembros del curso del evento.
create policy evento_asistencia_select on public.evento_asistencia for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) );
create policy evento_asistencia_insert on public.evento_asistencia for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) );
create policy evento_asistencia_update on public.evento_asistencia for update to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) )
  with check ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) );
create policy evento_asistencia_delete on public.evento_asistencia for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) );

-- === recordatorios ===========================================================
-- Ver: miembros del curso, pero los recordatorios dirigidos (para_usuario_id) solo
--      los ve su destinatario, el creador o el admin del curso.
-- Escribir: cualquier miembro (los recordatorios de cumple se autogeneran al cargar
--           la pantalla Cumpleaños desde cualquier miembro; colectas/festejos también).
create policy recordatorios_select on public.recordatorios for select to authenticated
  using (
    public.es_super() or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  );
create policy recordatorios_insert on public.recordatorios for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy recordatorios_update on public.recordatorios for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy recordatorios_delete on public.recordatorios for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );

-- === recordatorio_leidos (marca propia) =====================================
create policy recordatorio_leidos_select on public.recordatorio_leidos for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy recordatorio_leidos_insert on public.recordatorio_leidos for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy recordatorio_leidos_update on public.recordatorio_leidos for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy recordatorio_leidos_delete on public.recordatorio_leidos for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === colectas ================================================================
-- Colectas de festejo las crea el apoderado responsable; colectas del curso, el admin.
create policy colectas_select on public.colectas for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy colectas_insert on public.colectas for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy colectas_update on public.colectas for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy colectas_delete on public.colectas for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );

-- === colecta_pagos (sin curso_id; vía colecta) ==============================
-- El apoderado marca el pago de su hijo; el admin marca a cualquiera → miembros del curso.
create policy colecta_pagos_select on public.colecta_pagos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) );
create policy colecta_pagos_insert on public.colecta_pagos for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) );
create policy colecta_pagos_update on public.colecta_pagos for update to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) )
  with check ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) );
create policy colecta_pagos_delete on public.colecta_pagos for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) );

-- === menu (global del colegio, sin curso_id) ================================
create policy menu_select on public.menu for select to authenticated
  using ( true );
create policy menu_insert on public.menu for insert to authenticated
  with check ( public.es_super() or public.es_admin_any() );
create policy menu_update on public.menu for update to authenticated
  using ( public.es_super() or public.es_admin_any() )
  with check ( public.es_super() or public.es_admin_any() );
create policy menu_delete on public.menu for delete to authenticated
  using ( public.es_super() or public.es_admin_any() );

-- === utiles ==================================================================
create policy utiles_select on public.utiles for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy utiles_insert on public.utiles for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy utiles_update on public.utiles for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy utiles_delete on public.utiles for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) );

-- === util_adquirido (marca propia) ==========================================
create policy util_adquirido_select on public.util_adquirido for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy util_adquirido_insert on public.util_adquirido for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy util_adquirido_update on public.util_adquirido for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy util_adquirido_delete on public.util_adquirido for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === libros ==================================================================
create policy libros_select on public.libros for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy libros_insert on public.libros for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy libros_update on public.libros for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy libros_delete on public.libros for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) );

-- === libro_adquirido (marca propia) =========================================
create policy libro_adquirido_select on public.libro_adquirido for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy libro_adquirido_insert on public.libro_adquirido for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy libro_adquirido_update on public.libro_adquirido for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy libro_adquirido_delete on public.libro_adquirido for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === uniformes / uniforme_items (catálogo global) ===========================
create policy uniformes_select on public.uniformes for select to authenticated
  using ( true );
create policy uniformes_insert on public.uniformes for insert to authenticated
  with check ( public.es_super() );
create policy uniformes_update on public.uniformes for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy uniformes_delete on public.uniformes for delete to authenticated
  using ( public.es_super() );

create policy uniforme_items_select on public.uniforme_items for select to authenticated
  using ( true );
create policy uniforme_items_insert on public.uniforme_items for insert to authenticated
  with check ( public.es_super() );
create policy uniforme_items_update on public.uniforme_items for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy uniforme_items_delete on public.uniforme_items for delete to authenticated
  using ( public.es_super() );

-- === uniforme_cursos =========================================================
create policy uniforme_cursos_select on public.uniforme_cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy uniforme_cursos_insert on public.uniforme_cursos for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy uniforme_cursos_update on public.uniforme_cursos for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy uniforme_cursos_delete on public.uniforme_cursos for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) );

-- === uniforme_adquirido (marca propia) ======================================
create policy uniforme_adquirido_select on public.uniforme_adquirido for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy uniforme_adquirido_insert on public.uniforme_adquirido for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy uniforme_adquirido_update on public.uniforme_adquirido for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
create policy uniforme_adquirido_delete on public.uniforme_adquirido for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === horarios ================================================================
create policy horarios_select on public.horarios for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy horarios_insert on public.horarios for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy horarios_update on public.horarios for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy horarios_delete on public.horarios for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) );

-- === colegio (fila global única) ============================================
create policy colegio_select on public.colegio for select to authenticated
  using ( true );
create policy colegio_insert on public.colegio for insert to authenticated
  with check ( public.es_super() or public.es_admin_any() );
create policy colegio_update on public.colegio for update to authenticated
  using ( public.es_super() or public.es_admin_any() )
  with check ( public.es_super() or public.es_admin_any() );
create policy colegio_delete on public.colegio for delete to authenticated
  using ( public.es_super() );

-- === contactos (a nivel colegio) =============================================
-- OJO: contactos.curso_id es una columna LEGACY de tipo integer (no uuid) y la
-- app nunca la setea (siempre null) ni filtra por ella: web y mobile hacen
-- select * sin curso. No se puede pasar a es_miembro_curso(uuid) — por eso la
-- visibilidad es global-autenticado, igual que menu/colegio.
create policy contactos_select on public.contactos for select to authenticated
  using ( true );
create policy contactos_insert on public.contactos for insert to authenticated
  with check ( public.es_super() or public.es_admin_any() );
create policy contactos_update on public.contactos for update to authenticated
  using ( public.es_super() or public.es_admin_any() )
  with check ( public.es_super() or public.es_admin_any() );
create policy contactos_delete on public.contactos for delete to authenticated
  using ( public.es_super() or public.es_admin_any() );

-- === alertas =================================================================
create policy alertas_select on public.alertas for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy alertas_insert on public.alertas for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy alertas_update on public.alertas for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) );
create policy alertas_delete on public.alertas for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) );

-- === codigos_invitacion ======================================================
-- SELECT: solo super (panel) o miembros del curso. El anónimo NO puede leer la
-- tabla (así no se enumeran códigos); el registro usa verificar_codigo/crear_apoderado.
create policy codigos_invitacion_select on public.codigos_invitacion for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy codigos_invitacion_insert on public.codigos_invitacion for insert to authenticated
  with check ( public.es_super() );
create policy codigos_invitacion_update on public.codigos_invitacion for update to authenticated
  using ( public.es_super() ) with check ( public.es_super() );
create policy codigos_invitacion_delete on public.codigos_invitacion for delete to authenticated
  using ( public.es_super() );

-- =============================================================================
-- FIN. Verificar con scripts/verify-rls.sh (debe mostrar 0 filas ajenas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ROLLBACK (si algo se rompe y hay que volver al estado abierto anterior).
-- Descomentar y ejecutar. Borra las policies creadas acá y deshabilita RLS en
-- todas las tablas (vuelve la fuga) — usar solo como medida de emergencia
-- mientras se corrige. Las funciones helper pueden quedar; no molestan.
-- -----------------------------------------------------------------------------
-- do $$
-- declare
--   r record;
--   t text;
--   tablas text[] := array[
--     'usuarios','cursos','hijos','maestros','maestro_cursos','usuario_hijos',
--     'usuario_cursos','cumples','eventos','evento_asistencia','recordatorios',
--     'recordatorio_leidos','colectas','colecta_pagos','menu','utiles',
--     'util_adquirido','libros','libro_adquirido','uniformes','uniforme_items',
--     'uniforme_cursos','uniforme_adquirido','horarios','colegio','contactos',
--     'alertas','codigos_invitacion'];
-- begin
--   for r in select policyname, tablename from pg_policies
--            where schemaname='public' and tablename = any(tablas) loop
--     execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
--   end loop;
--   foreach t in array tablas loop
--     execute format('alter table public.%I disable row level security', t);
--   end loop;
-- end $$;
