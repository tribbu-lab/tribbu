-- Roles del colegio por nivel: "Secretaría" (2026-10-21).
-- Ver specs/roles-por-nivel.md.
--
-- · colegios.niveles: los niveles que tiene el colegio (opcional: puede no
--   tener alguno). cursos.nivel: el del curso (null = sin nivel, lo gestiona
--   solo el administrador). Migración por el sufijo del nombre del curso.
-- · Rol nuevo `nivel_admin` ("Secretaría" en pantalla) con usuarios.colegio_id
--   + usuarios.niveles (uno o varios): lo mismo que colegio_admin pero solo en
--   los cursos de sus niveles. No toca lo que es de todo el colegio (cursos,
--   promoción, ficha del colegio, materias y maestras, uniformes, menú,
--   Marketplace, administradores) ni talleres (por ahora).
-- · Cada política que dejaba pasar al colegio por el curso de la fila
--   (es_colegio_admin_de(colegio_de_curso(x)) y sus variantes por hijo,
--   colecta, encuesta, evento, recordatorio) suma la alternativa
--   es_secretaria_de_*(x). Las sentencias "alter policy" de la sección 4 se
--   generaron desde las definiciones de prod del 2026-10-21 (no cambian nada
--   más de cada política).
-- · menu.niveles: a qué niveles aplica un menú (null = todos).
--
-- Correr una vez después de multi-colegio.sql, docentes.sql y
-- avisos-colegio-sin-docentes.sql.

-- 1) Esquema ---------------------------------------------------------------

alter table public.colegios add column if not exists niveles text[] not null default '{}';
alter table public.cursos add column if not exists nivel text;
alter table public.cursos drop constraint if exists cursos_nivel_check;
alter table public.cursos add constraint cursos_nivel_check check (nivel is null or nivel in ('inicial', 'primaria', 'secundaria'));
alter table public.usuarios add column if not exists niveles text[];

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol = any (array['padre', 'admin', 'room', 'super', 'colegio_admin', 'docente', 'nivel_admin']));

-- Nivel por el sufijo del nombre ("1°B - Primaria", "K3 Ants - Kinder").
update public.cursos set nivel = case
    when nombre ~* '-\s*(kinder|jard[ií]n|sala|inicial|nivel inicial)\s*$' then 'inicial'
    when nombre ~* '-\s*primaria\s*$' then 'primaria'
    when nombre ~* '-\s*secundaria\s*$' then 'secundaria'
  end
where nivel is null;

update public.colegios co set niveles = coalesce((
  select array_agg(distinct c.nivel order by c.nivel) from public.cursos c
  where c.colegio_id = co.id and c.nivel is not null), '{}')
where co.niveles = '{}';

-- Menú por niveles: null = todos. Clave para la unicidad (colegio, fecha, niveles).
alter table public.menu add column if not exists niveles text[];
-- array_to_string no es inmutable: un envoltorio para poder usarlo en la columna generada.
create or replace function public.niveles_clave(p text[])
returns text language sql immutable set search_path = public, pg_temp
as $$ select coalesce(array_to_string(p, ','), '') $$;
alter table public.menu add column if not exists niveles_clave text
  generated always as (public.niveles_clave(niveles)) stored;
alter table public.menu drop constraint if exists menu_colegio_fecha_key;
create unique index if not exists menu_colegio_fecha_niveles_key on public.menu (colegio_id, fecha, niveles_clave);

-- 2) Helpers ---------------------------------------------------------------

create or replace function public.es_secretaria_de_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u join public.cursos c on c.id = p_curso
    where u.auth_id = auth.uid() and u.rol = 'nivel_admin'
      and u.colegio_id = c.colegio_id and c.nivel is not null and c.nivel = any(u.niveles)
  )
$$;

create or replace function public.es_secretaria_de_colegio(p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.rol = 'nivel_admin' and u.colegio_id = p_colegio)
$$;

create or replace function public.es_secretaria_de_hijo(p_hijo uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select public.es_secretaria_de_curso(curso_id) from public.hijos where id = p_hijo), false) $$;

create or replace function public.es_secretaria_de_colecta(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select public.es_secretaria_de_curso(curso_id) from public.colectas where id = p_id), false) $$;

create or replace function public.es_secretaria_de_encuesta(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select public.es_secretaria_de_curso(curso_id) from public.encuestas where id = p_id), false) $$;

create or replace function public.es_secretaria_de_evento(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select public.es_secretaria_de_curso(curso_id) from public.eventos where id = p_id), false) $$;

create or replace function public.es_secretaria_de_recordatorio(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select public.es_secretaria_de_curso(curso_id) from public.recordatorios where id = p_id), false) $$;

-- Una familia (o Room Parent) con algún hijo o curso de mis niveles.
create or replace function public.es_secretaria_de_usuario(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuario_cursos uc where uc.usuario_id = p_usuario and public.es_secretaria_de_curso(uc.curso_id)
  ) or exists (
    select 1 from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
    where uh.usuario_id = p_usuario and public.es_secretaria_de_curso(h.curso_id)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['es_secretaria_de_curso(uuid)', 'es_secretaria_de_colegio(uuid)', 'es_secretaria_de_hijo(uuid)',
    'es_secretaria_de_colecta(uuid)', 'es_secretaria_de_encuesta(uuid)', 'es_secretaria_de_evento(uuid)',
    'es_secretaria_de_recordatorio(uuid)', 'es_secretaria_de_usuario(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 3) Funciones que ya conocían al colegio ------------------------------------

-- La Secretaría es miembro de su colegio (lee colegio, menú, materias, maestras…).
create or replace function public.es_miembro_colegio(p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_colegio_admin_de(p_colegio)
    or public.es_secretaria_de_colegio(p_colegio)
    or exists (select 1 from public.cursos c where c.colegio_id = p_colegio and public.es_miembro_curso(c.id))
    or exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.rol = 'docente' and u.colegio_id = p_colegio)
$$;

-- Lo que publica la Secretaría cuenta como "del colegio" (lo edita el colegio,
-- no lo ve la maestra como aviso a familias).
create or replace function public.evento_creado_por_colegio(p_creado_por uuid, p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_creado_por
      and (u.rol = 'super' or (u.rol in ('colegio_admin', 'nivel_admin', 'docente') and u.colegio_id = public.colegio_de_curso(p_curso)))
  )
$$;

create or replace function public.recordatorio_del_colegio(p_creado_por uuid, p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_creado_por
      and (u.rol = 'super' or (u.rol in ('colegio_admin', 'nivel_admin') and u.colegio_id = public.colegio_de_curso(p_curso)))
  )
$$;

create or replace function public.puede_editar_evento(p_curso uuid, p_creado_por uuid, p_tipo text, p_alumno uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or ((public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) or public.es_secretaria_de_curso(p_curso))
          and public.evento_creado_por_colegio(p_creado_por, p_curso))
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
      or (p_tipo = 'festejo' and p_alumno is not null and public.es_padre_de(p_alumno))
$$;

create or replace function public.puede_editar_recordatorio(p_curso uuid, p_creado_por uuid, p_para uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or ((public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) or public.es_secretaria_de_curso(p_curso))
          and public.evento_creado_por_colegio(p_creado_por, p_curso))
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
      or (p_para is not null and p_para = public.mi_usuario_id())
      or (p_creado_por is null and public.es_admin_curso(p_curso))
$$;

create or replace function public.puede_gestionar_colecta(p_curso uuid, p_responsable uuid, p_creado_por uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_secretaria_de_curso(p_curso)
      or public.es_admin_curso(p_curso)
      or (p_responsable is not null and p_responsable = public.mi_usuario_id())
      or (p_creado_por  is not null and p_creado_por  = public.mi_usuario_id())
$$;

-- Lecturas, adopción, gestión de autorizaciones.
create or replace function public.puede_ver_lecturas(p_curso uuid, p_creado_por uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_secretaria_de_curso(p_curso)
      or public.es_admin_curso(p_curso)
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
$$;

-- Destinatarios de push de un curso (para los avisos que manda la Secretaría).
create or replace function public.usuarios_de_curso(p_curso uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select usuario_id from public.usuario_cursos
  where curso_id = p_curso
    and (public.es_super() or public.es_miembro_curso(p_curso) or public.es_docente_curso(p_curso)
         or public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) or public.es_secretaria_de_curso(p_curso))
  union
  select uh.usuario_id from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
  where h.curso_id = p_curso
    and (public.es_super() or public.es_miembro_curso(p_curso) or public.es_docente_curso(p_curso)
         or public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) or public.es_secretaria_de_curso(p_curso))
$$;

-- Mensajes: Secretaría (hilo por alumno) y los de maestras, de su nivel.
create or replace function public.puede_ver_conversacion(p_tipo text, p_curso uuid, p_colegio uuid, p_hijo uuid, p_a uuid, p_b uuid, p_usuario uuid, p_maestro uuid, p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'directo' then public.mi_usuario_id() in (p_a, p_b)
    when 'curso'   then public.es_miembro_curso(p_curso)
    when 'grupo'   then public.es_participante(p_id)
    when 'colegio' then public.es_padre_de(p_hijo) or public.es_colegio_admin_de(p_colegio) or public.es_secretaria_de_hijo(p_hijo)
    when 'docente' then public.es_padre_de(p_hijo) or public.es_docente_de(p_maestro) or public.es_colegio_admin_de(p_colegio) or public.es_secretaria_de_hijo(p_hijo)
    when 'soporte' then p_usuario = public.mi_usuario_id() or public.es_super()
    else false
  end
$$;

create or replace function public.abrir_conversacion_colegio(p_hijo uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_curso uuid; v_colegio uuid; v_id uuid;
begin
  select h.curso_id into v_curso from public.hijos h where h.id = p_hijo;
  v_colegio := public.colegio_de_curso(v_curso);
  if v_curso is null or not (public.es_padre_de(p_hijo) or public.es_colegio_admin_de(v_colegio) or public.es_secretaria_de_curso(v_curso)) then
    raise exception 'Sin permiso';
  end if;
  select id into v_id from public.conversaciones where tipo = 'colegio' and hijo_id = p_hijo;
  if v_id is not null then return v_id; end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, hijo_id)
  values ('colegio', v_curso, v_colegio, p_hijo)
  on conflict (hijo_id) where tipo = 'colegio' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'colegio' and hijo_id = p_hijo;
  end if;
  return v_id;
end $$;

-- Push de un hilo de Secretaría: también a las Secretarías del nivel del alumno.
create or replace function public.miembros_conversacion(p_conv uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  with c as (select * from public.conversaciones where id = p_conv)
  select u.id from c join public.usuarios u on u.id in (c.usuario_a, c.usuario_b) where c.tipo = 'directo'
  union
  select uc.usuario_id from c join public.usuario_cursos uc on uc.curso_id = c.curso_id where c.tipo = 'curso'
  union
  select uh.usuario_id from c join public.hijos h on h.curso_id = c.curso_id
    join public.usuario_hijos uh on uh.hijo_id = h.id where c.tipo = 'curso'
  union
  select p.usuario_id from c join public.conversacion_participantes p on p.conversacion_id = c.id where c.tipo = 'grupo'
  union
  select uh.usuario_id from c join public.usuario_hijos uh on uh.hijo_id = c.hijo_id where c.tipo in ('colegio','docente')
  union
  select u.id from c join public.usuarios u on u.rol = 'colegio_admin' and u.colegio_id = c.colegio_id where c.tipo = 'colegio'
  union
  select u.id from c join public.hijos h on h.id = c.hijo_id join public.cursos cu on cu.id = h.curso_id
    join public.usuarios u on u.rol = 'nivel_admin' and u.colegio_id = cu.colegio_id and cu.nivel = any(u.niveles)
    where c.tipo = 'colegio'
  union
  select m.usuario_id from c join public.maestros m on m.id = c.maestro_id where c.tipo = 'docente' and m.usuario_id is not null
  union
  select c.usuario_id from c where c.tipo = 'soporte'
  union
  select u.id from c join public.usuarios u on u.rol = 'super' where c.tipo = 'soporte'
$$;

create or replace function public.autores_conversacion(p_conv uuid)
returns table (usuario_id uuid, nombre text, familia text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct u.id, btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
    case
      when c.tipo in ('docente', 'colegio') and u.rol not in ('super', 'colegio_admin', 'nivel_admin', 'docente')
        then (select 'familia de ' || h.nombre from public.hijos h where h.id = c.hijo_id)
      when c.tipo = 'docente' and u.rol = 'docente'
        then (select string_agg(distinct ma.nombre, ', ')
              from public.maestros mt
              join public.clases cl on cl.maestro_id = mt.id
              join public.materias ma on ma.id = cl.materia_id
              join public.hijos h on h.id = c.hijo_id and h.curso_id = cl.curso_id
              where mt.id = c.maestro_id and mt.usuario_id = u.id)
      when u.rol not in ('super', 'colegio_admin', 'nivel_admin', 'docente') then public.familia_de(u.id)
    end
  from public.mensajes m
  join public.usuarios u on u.id = m.autor_id
  join public.conversaciones c on c.id = m.conversacion_id
  where m.conversacion_id = p_conv and public.es_miembro_conversacion(p_conv)
$$;

-- Bandeja del colegio: la Secretaría ve solo los hilos de alumnos de sus niveles.
create or replace function public.bandeja_colegio()
returns table (id uuid, tipo text, hijo_id uuid, alumno text, curso text, curso_id uuid, docente text, ultimo_texto text, ultimo_fotos integer, ultimo_rol_autor text, ultimo_en timestamptz, no_leidos integer, sin_responder boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_colegio uuid; v_rol text;
begin
  select u.colegio_id, u.rol into v_colegio, v_rol from public.usuarios u
  where u.auth_id = auth.uid() and u.rol in ('colegio_admin', 'nivel_admin');
  if v_colegio is null then raise exception 'Solo el colegio'; end if;
  return query
  with leido as (
    select cm.conversacion_id, max(cm.ultimo_leido_en) as en
    from public.conversacion_miembros cm
    join public.usuarios a on a.id = cm.usuario_id and a.rol in ('colegio_admin', 'nivel_admin') and a.colegio_id = v_colegio
    group by cm.conversacion_id
  )
  select c.id, c.tipo, c.hijo_id, btrim(h.nombre || ' ' || coalesce(h.apellido, '')), cu.nombre, c.curso_id,
    case when c.tipo = 'docente' then btrim(ma.nombre || ' ' || coalesce(ma.apellido, '')) end,
    um.texto, coalesce(jsonb_array_length(um.fotos), 0), um.rol_autor, c.ultimo_mensaje_en,
    case when c.tipo = 'colegio' then
      (select count(*)::int from public.mensajes m
        where m.conversacion_id = c.id and m.rol_autor = 'usuario' and m.borrado_en is null
          and m.creado_en > coalesce(l.en, '-infinity'::timestamptz))
    else 0 end,
    c.tipo = 'colegio' and coalesce(um.rol_autor = 'usuario', false)
  from public.conversaciones c
  join public.hijos h on h.id = c.hijo_id
  join public.cursos cu on cu.id = c.curso_id
  left join public.maestros ma on ma.id = c.maestro_id
  left join leido l on l.conversacion_id = c.id
  left join lateral (
    select m.texto, m.fotos, m.rol_autor from public.mensajes m
    where m.conversacion_id = c.id order by m.creado_en desc limit 1
  ) um on true
  where c.colegio_id = v_colegio and c.tipo in ('colegio','docente') and c.ultimo_mensaje_en is not null
    and (v_rol = 'colegio_admin' or public.es_secretaria_de_curso(h.curso_id))
  order by c.ultimo_mensaje_en desc;
end $$;

-- 4) Políticas por curso (generado desde prod) ------------------------------

alter policy alertas_delete on public.alertas
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy alertas_insert on public.alertas
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy alertas_select on public.alertas
  using ((es_super() OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy alertas_update on public.alertas
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy autorizaciones_insert on public.autorizaciones
  with check (((creado_por = mi_usuario_id()) AND (es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_admin_curso(curso_id) OR es_docente_curso(curso_id))));
alter policy autorizaciones_select on public.autorizaciones
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id)));
alter policy clase_alumnos_select on public.clase_alumnos
  using ((es_super() OR es_padre_de(hijo_id) OR (EXISTS ( SELECT 1
   FROM clases c
  WHERE ((c.id = clase_alumnos.clase_id) AND ((es_colegio_admin_de(colegio_de_curso(c.curso_id)) OR es_secretaria_de_curso(c.curso_id)) OR es_admin_curso(c.curso_id) OR es_docente_curso(c.curso_id)))))));
alter policy clase_alumnos_write on public.clase_alumnos
  using ((es_super() OR (EXISTS ( SELECT 1
   FROM clases c
  WHERE ((c.id = clase_alumnos.clase_id) AND (es_colegio_admin_de(colegio_de_curso(c.curso_id)) OR es_secretaria_de_curso(c.curso_id)))))))
  with check ((EXISTS ( SELECT 1
   FROM (clases c
     JOIN hijos h ON ((h.id = clase_alumnos.hijo_id)))
  WHERE ((c.id = clase_alumnos.clase_id) AND (h.curso_id = c.curso_id) AND (es_super() OR (es_colegio_admin_de(colegio_de_curso(c.curso_id)) OR es_secretaria_de_curso(c.curso_id)))))));
alter policy clases_select on public.clases
  using ((es_super() OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy clases_write on public.clases
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check (((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))) AND (EXISTS ( SELECT 1
   FROM materias ma
  WHERE ((ma.id = clases.materia_id) AND (ma.colegio_id = colegio_de_curso(clases.curso_id)))))));
alter policy colecta_pagos_select on public.colecta_pagos
  using ((es_super() OR es_miembro_curso_de_colecta(colecta_id) OR (es_colegio_admin_de(colegio_de_colecta(colecta_id)) OR es_secretaria_de_colecta(colecta_id))));
alter policy colecta_participantes_select on public.colecta_participantes
  using ((es_super() OR es_miembro_curso_de_colecta(colecta_id) OR (es_colegio_admin_de(colegio_de_colecta(colecta_id)) OR es_secretaria_de_colecta(colecta_id))));
alter policy colectas_insert on public.colectas
  with check ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy colectas_select on public.colectas
  using ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy colectas_update on public.colectas
  using (puede_gestionar_colecta(curso_id, responsable_id, creado_por))
  with check ((puede_gestionar_colecta(curso_id, responsable_id, creado_por) AND (es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_miembro_curso(curso_id))));
alter policy cumples_delete on public.cumples
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_admin_curso(curso_id)));
alter policy cumples_insert on public.cumples
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_admin_curso(curso_id)));
alter policy cumples_select on public.cumples
  using ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy cumples_update on public.cumples
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_admin_curso(curso_id) OR ((responsable_id IS NOT NULL) AND (responsable_id = mi_usuario_id()))))
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_admin_curso(curso_id) OR ((responsable_id IS NOT NULL) AND (responsable_id = mi_usuario_id()))));
alter policy encuesta_opciones_delete on public.encuesta_opciones
  using (((es_super() OR (es_colegio_admin_de(colegio_de_encuesta(encuesta_id)) OR es_secretaria_de_encuesta(encuesta_id)) OR (EXISTS ( SELECT 1
   FROM encuestas e
  WHERE ((e.id = encuesta_opciones.encuesta_id) AND ((e.creado_por = mi_usuario_id()) OR es_admin_curso(e.curso_id)))))) AND (NOT (EXISTS ( SELECT 1
   FROM encuesta_votos v
  WHERE (v.encuesta_id = encuesta_opciones.encuesta_id))))));
alter policy encuesta_opciones_insert on public.encuesta_opciones
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_encuesta(encuesta_id)) OR es_secretaria_de_encuesta(encuesta_id)) OR (EXISTS ( SELECT 1
   FROM encuestas e
  WHERE ((e.id = encuesta_opciones.encuesta_id) AND ((e.creado_por = mi_usuario_id()) OR es_admin_curso(e.curso_id)))))));
alter policy encuesta_opciones_select on public.encuesta_opciones
  using ((es_super() OR es_miembro_curso_de_encuesta(encuesta_id) OR es_docente_curso_de_encuesta(encuesta_id) OR (es_colegio_admin_de(colegio_de_encuesta(encuesta_id)) OR es_secretaria_de_encuesta(encuesta_id))));
alter policy encuesta_votos_select on public.encuesta_votos
  using ((es_super() OR es_miembro_curso_de_encuesta(encuesta_id) OR es_docente_curso_de_encuesta(encuesta_id) OR (es_colegio_admin_de(colegio_de_encuesta(encuesta_id)) OR es_secretaria_de_encuesta(encuesta_id))));
alter policy encuestas_delete on public.encuestas
  using ((es_super() OR (creado_por = mi_usuario_id()) OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy encuestas_insert on public.encuestas
  with check ((es_super() OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy encuestas_select on public.encuestas
  using ((es_super() OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy encuestas_update on public.encuestas
  using ((es_super() OR (creado_por = mi_usuario_id()) OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR (creado_por = mi_usuario_id()) OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy evento_asistencia_delete on public.evento_asistencia
  using ((es_super() OR (es_colegio_admin_de(colegio_de_evento(evento_id)) OR es_secretaria_de_evento(evento_id)) OR puede_editar_evento_id(evento_id)));
alter policy evento_asistencia_insert on public.evento_asistencia
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_evento(evento_id)) OR es_secretaria_de_evento(evento_id)) OR puede_editar_evento_id(evento_id) OR (es_miembro_curso_de_evento(evento_id) AND (((alumno_invitado_id IS NOT NULL) AND es_padre_de(alumno_invitado_id)) OR ((alumno_invitado_id IS NULL) AND (usuario_id = mi_usuario_id()))))));
alter policy evento_asistencia_select on public.evento_asistencia
  using ((es_super() OR es_miembro_curso_de_evento(evento_id) OR (es_colegio_admin_de(colegio_de_evento(evento_id)) OR es_secretaria_de_evento(evento_id))));
alter policy evento_asistencia_update on public.evento_asistencia
  using ((es_super() OR (es_colegio_admin_de(colegio_de_evento(evento_id)) OR es_secretaria_de_evento(evento_id)) OR puede_editar_evento_id(evento_id) OR ((alumno_invitado_id IS NOT NULL) AND es_padre_de(alumno_invitado_id)) OR ((alumno_invitado_id IS NULL) AND (usuario_id = mi_usuario_id()))))
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_evento(evento_id)) OR es_secretaria_de_evento(evento_id)) OR puede_editar_evento_id(evento_id) OR ((alumno_invitado_id IS NOT NULL) AND es_padre_de(alumno_invitado_id)) OR ((alumno_invitado_id IS NULL) AND (usuario_id = mi_usuario_id()))));
alter policy eventos_insert on public.eventos
  with check ((es_super() OR es_miembro_curso(curso_id) OR (es_docente_curso(curso_id) AND (tipo IS DISTINCT FROM 'festejo'::text)) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy eventos_select on public.eventos
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR ((tipo IS DISTINCT FROM 'festejo'::text) AND (es_miembro_curso(curso_id) OR es_docente_curso(curso_id))) OR ((tipo = 'festejo'::text) AND ((creado_por = mi_usuario_id()) OR es_padre_de(alumno_id) OR estoy_invitado_a_evento(id)))));
alter policy eventos_update on public.eventos
  using (puede_editar_evento(curso_id, creado_por, tipo, alumno_id))
  with check ((puede_editar_evento(curso_id, creado_por, tipo, alumno_id) AND (es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id))));
alter policy hijos_delete on public.hijos
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy hijos_insert on public.hijos
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy hijos_select on public.hijos
  using ((es_super() OR es_miembro_curso(curso_id) OR es_padre_de(id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy hijos_update on public.hijos
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy horarios_delete on public.horarios
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy horarios_insert on public.horarios
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy horarios_select on public.horarios
  using ((es_super() OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy horarios_update on public.horarios
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy libros_delete on public.libros
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy libros_insert on public.libros
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy libros_select on public.libros
  using ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy libros_update on public.libros
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy maestro_cursos_delete on public.maestro_cursos
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy maestro_cursos_insert on public.maestro_cursos
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy maestro_cursos_select on public.maestro_cursos
  using ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy maestro_cursos_update on public.maestro_cursos
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy recordatorio_leidos_select on public.recordatorio_leidos
  using ((es_super() OR (usuario_id = mi_usuario_id()) OR (es_colegio_admin_de(colegio_de_recordatorio(recordatorio_id)) OR es_secretaria_de_recordatorio(recordatorio_id))));
alter policy recordatorios_insert on public.recordatorios
  with check ((es_super() OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy recordatorios_select on public.recordatorios
  using ((es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR ((es_miembro_curso(curso_id) OR (es_docente_curso(curso_id) AND (NOT recordatorio_del_colegio(creado_por, curso_id)))) AND ((para_usuario_id IS NULL) OR (para_usuario_id = mi_usuario_id()) OR (creado_por = mi_usuario_id()) OR es_admin_curso(curso_id)))));
alter policy recordatorios_update on public.recordatorios
  using (puede_editar_recordatorio(curso_id, creado_por, para_usuario_id))
  with check ((puede_editar_recordatorio(curso_id, creado_por, para_usuario_id) AND (es_super() OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)) OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id))));
alter policy usuario_cursos_delete on public.usuario_cursos
  using ((es_super() OR es_admin_curso(curso_id) OR (usuario_id = mi_usuario_id()) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy usuario_cursos_insert on public.usuario_cursos
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy usuario_cursos_select on public.usuario_cursos
  using ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy usuario_cursos_update on public.usuario_cursos
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy usuario_hijos_delete on public.usuario_hijos
  using ((es_super() OR es_admin_curso_de_hijo(hijo_id) OR (es_colegio_admin_de(colegio_de_hijo(hijo_id)) OR es_secretaria_de_hijo(hijo_id))));
alter policy usuario_hijos_insert on public.usuario_hijos
  with check ((es_super() OR es_admin_curso_de_hijo(hijo_id) OR (es_colegio_admin_de(colegio_de_hijo(hijo_id)) OR es_secretaria_de_hijo(hijo_id))));
alter policy usuario_hijos_select on public.usuario_hijos
  using ((es_super() OR (usuario_id = mi_usuario_id()) OR es_miembro_curso_de_hijo(hijo_id) OR (es_colegio_admin_de(colegio_de_hijo(hijo_id)) OR es_secretaria_de_hijo(hijo_id))));
alter policy usuario_hijos_update on public.usuario_hijos
  using ((es_super() OR es_admin_curso_de_hijo(hijo_id) OR (es_colegio_admin_de(colegio_de_hijo(hijo_id)) OR es_secretaria_de_hijo(hijo_id))))
  with check ((es_super() OR es_admin_curso_de_hijo(hijo_id) OR (es_colegio_admin_de(colegio_de_hijo(hijo_id)) OR es_secretaria_de_hijo(hijo_id))));
alter policy utiles_delete on public.utiles
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy utiles_insert on public.utiles
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy utiles_select on public.utiles
  using ((es_super() OR es_miembro_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));
alter policy utiles_update on public.utiles
  using ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))))
  with check ((es_super() OR es_admin_curso(curso_id) OR (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))));

-- 5) Cursos y usuarios (a mano) ---------------------------------------------

-- Ve los cursos de sus niveles (no crea, no edita, no borra cursos).
alter policy cursos_select on public.cursos
  using (es_super() OR es_miembro_curso(id) OR es_docente_curso(id) OR es_colegio_admin_de(colegio_id) OR es_secretaria_de_curso(id));

-- Familias de sus niveles: las ve, las crea, las edita y las borra. Nunca a
-- personal del colegio (super, administrador, Secretaría, docente).
alter policy usuarios_select on public.usuarios
  using (es_super() OR (id = mi_usuario_id()) OR comparte_curso(id) OR es_colegio_admin_de_usuario(id)
         OR ((colegio_id IS NOT NULL) AND es_colegio_admin_de(colegio_id)) OR es_secretaria_de_usuario(id));

alter policy usuarios_insert on public.usuarios
  with check (es_super()
    OR ((rol <> ALL (ARRAY['super'::text, 'colegio_admin'::text]))
        AND (EXISTS (SELECT 1 FROM usuarios u WHERE ((u.auth_id = auth.uid()) AND (u.rol = 'colegio_admin'::text)))))
    OR ((rol = ANY (ARRAY['padre'::text, 'room'::text, 'admin'::text])) AND colegio_id IS NULL
        AND (EXISTS (SELECT 1 FROM usuarios u WHERE ((u.auth_id = auth.uid()) AND (u.rol = 'nivel_admin'::text))))));

alter policy usuarios_update on public.usuarios
  using (es_super() OR es_colegio_admin_de_usuario(id) OR ((colegio_id IS NOT NULL) AND es_colegio_admin_de(colegio_id))
         OR ((rol = ANY (ARRAY['padre'::text, 'room'::text, 'admin'::text])) AND es_secretaria_de_usuario(id)))
  with check (es_super()
    OR ((rol <> ALL (ARRAY['super'::text, 'colegio_admin'::text])) AND (es_colegio_admin_de_usuario(id) OR ((colegio_id IS NOT NULL) AND es_colegio_admin_de(colegio_id))))
    OR ((rol = ANY (ARRAY['padre'::text, 'room'::text, 'admin'::text])) AND colegio_id IS NULL AND es_secretaria_de_usuario(id)));

alter policy usuarios_delete on public.usuarios
  using (es_super() OR es_colegio_admin_de_usuario(id)
         OR ((rol = ANY (ARRAY['padre'::text, 'room'::text, 'admin'::text])) AND es_secretaria_de_usuario(id)));
