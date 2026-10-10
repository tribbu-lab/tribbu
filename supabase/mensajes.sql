-- =============================================================================
-- mensajes.sql · Mensajes entre familias, con el colegio y con soporte
-- =============================================================================
-- Ver specs/mensajes.md. Fase 1 usa los tipos `directo` (1 a 1 entre
-- apoderados que comparten curso) y `soporte` (usuario ↔ equipo tribbu);
-- `curso` (grupo del curso) y `colegio` (familia ↔ colegio, por alumno) ya
-- quedan modelados acá para las fases 2 y 3.
--
-- Privacidad (decisión 2026-10-10): el colegio y el super NO leen chats entre
-- familias. es_super() solo entra en `soporte`; el colegio solo ve el mensaje
-- de una denuncia (mensaje_denuncias, con copia del texto).
--
-- Push: un trigger en mensajes / mensaje_denuncias llama vía pg_net a la Edge
-- Function mensajes-push (mismo secreto que avisos-automaticos, del Vault
-- `avisos_cron_secret`). El cliente NO manda el push.
--
-- Retención: Edge Function mensajes-retencion, diaria (ver al final).
--
-- Correr una vez. Idempotente.
-- =============================================================================

create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- 1) TABLAS
-- -----------------------------------------------------------------------------

create table if not exists public.conversaciones (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('directo','curso','colegio','soporte')),
  -- ancla de retención (año lectivo) y de scope; null solo en soporte
  curso_id          uuid references public.cursos(id) on delete cascade,
  colegio_id        uuid references public.colegios(id) on delete cascade,
  hijo_id           uuid references public.hijos(id) on delete cascade,      -- colegio
  usuario_a         uuid references public.usuarios(id) on delete cascade,   -- directo (a < b)
  usuario_b         uuid references public.usuarios(id) on delete cascade,
  usuario_id        uuid references public.usuarios(id) on delete cascade,   -- soporte
  estado            text not null default 'abierta' check (estado in ('abierta','resuelta')),
  ultimo_mensaje_en timestamptz,
  creado_en         timestamptz not null default now(),
  constraint conversaciones_forma check (
       (tipo = 'directo' and curso_id is not null and usuario_a is not null
          and usuario_b is not null and usuario_a < usuario_b)
    or (tipo = 'curso'   and curso_id is not null)
    or (tipo = 'colegio' and curso_id is not null and hijo_id is not null and colegio_id is not null)
    or (tipo = 'soporte' and usuario_id is not null)
  )
);
create unique index if not exists conversaciones_directo_uq on public.conversaciones (usuario_a, usuario_b) where tipo = 'directo';
create unique index if not exists conversaciones_curso_uq   on public.conversaciones (curso_id)   where tipo = 'curso';
create unique index if not exists conversaciones_colegio_uq on public.conversaciones (hijo_id)    where tipo = 'colegio';
create unique index if not exists conversaciones_soporte_uq on public.conversaciones (usuario_id) where tipo = 'soporte';
create index if not exists conversaciones_curso on public.conversaciones (curso_id);

-- Estado por usuario (no define pertenencia: eso es es_miembro_conversacion).
create table if not exists public.conversacion_miembros (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  ultimo_leido_en timestamptz,
  silenciado      boolean not null default false,
  primary key (conversacion_id, usuario_id)
);

create table if not exists public.mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  autor_id        uuid references public.usuarios(id) on delete set null default public.mi_usuario_id(),
  -- 'usuario' | 'soporte' (respondió el equipo tribbu) | 'colegio' (respondió el colegio)
  rol_autor       text not null default 'usuario' check (rol_autor in ('usuario','soporte','colegio')),
  texto           text check (texto is null or char_length(texto) <= 2000),
  fotos           jsonb not null default '[]'::jsonb,
  creado_en       timestamptz not null default now(),
  editado_en      timestamptz,
  borrado_en      timestamptz,
  constraint mensajes_contenido check (
    borrado_en is not null
    or (texto is not null and char_length(btrim(texto)) > 0)
    or jsonb_array_length(fotos) > 0
  ),
  constraint mensajes_fotos_max check (jsonb_array_length(fotos) <= 3)
);
create index if not exists mensajes_conv_fecha on public.mensajes (conversacion_id, creado_en desc);

-- Datos de diagnóstico que manda la app con cada mensaje a soporte. Tabla
-- aparte para que solo los lea el super (mensajes es legible por el usuario).
create table if not exists public.soporte_diagnosticos (
  mensaje_id      uuid primary key references public.mensajes(id) on delete cascade,
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  datos           jsonb not null default '{}'::jsonb,
  creado_en       timestamptz not null default now()
);

create table if not exists public.usuario_bloqueos (
  usuario_id   uuid not null references public.usuarios(id) on delete cascade,
  bloqueado_id uuid not null references public.usuarios(id) on delete cascade,
  creado_en    timestamptz not null default now(),
  primary key (usuario_id, bloqueado_id),
  check (usuario_id <> bloqueado_id)
);

create table if not exists public.mensaje_denuncias (
  id                uuid primary key default gen_random_uuid(),
  mensaje_id        uuid references public.mensajes(id) on delete set null,
  conversacion_id   uuid references public.conversaciones(id) on delete set null,
  colegio_id        uuid references public.colegios(id) on delete cascade,
  denunciante_id    uuid references public.usuarios(id) on delete set null default public.mi_usuario_id(),
  motivo            text not null check (motivo in ('acoso','inapropiado','spam','otro')),
  detalle           text check (detalle is null or char_length(detalle) <= 500),
  -- copia: la denuncia sobrevive aunque el mensaje se edite, borre o venza
  texto_snapshot    text,
  fotos_snapshot    jsonb not null default '[]'::jsonb,
  autor_snapshot_id uuid references public.usuarios(id) on delete set null,
  autor_snapshot    text,
  estado            text not null default 'pendiente' check (estado in ('pendiente','resuelta')),
  accion            text check (accion in ('mensaje_eliminado','sin_accion')),
  resuelta_por      uuid references public.usuarios(id) on delete set null,
  resuelta_en       timestamptz,
  creado_en         timestamptz not null default now()
);
create index if not exists mensaje_denuncias_colegio on public.mensaje_denuncias (colegio_id, estado);
create unique index if not exists mensaje_denuncias_uq on public.mensaje_denuncias (mensaje_id, denunciante_id);

create table if not exists public.normas_chat_aceptadas (
  usuario_id   uuid primary key references public.usuarios(id) on delete cascade,
  aceptadas_en timestamptz not null default now()
);

-- Agrupado de push (solo la Edge Function, con service role).
create table if not exists public.mensajes_push_log (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  enviado_en      timestamptz not null default now(),
  primary key (conversacion_id, usuario_id)
);

-- -----------------------------------------------------------------------------
-- 2) HELPERS (security definer, sin RLS interna)
-- -----------------------------------------------------------------------------

-- Cursos de un usuario cualquiera: usuario_cursos ∪ cursos de sus hijos.
create or replace function public.cursos_de_usuario(p_usuario uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select curso_id from public.usuario_cursos where usuario_id = p_usuario
  union
  select h.curso_id from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
  where uh.usuario_id = p_usuario and h.curso_id is not null
$$;

-- ¿puede ver la conversación? (por columnas de la fila, sin lookup por id)
create or replace function public.puede_ver_conversacion(
  p_tipo text, p_curso uuid, p_colegio uuid, p_hijo uuid, p_a uuid, p_b uuid, p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'directo' then public.mi_usuario_id() in (p_a, p_b)
    when 'curso'   then public.es_miembro_curso(p_curso)
    when 'colegio' then public.es_padre_de(p_hijo) or public.es_colegio_admin_de(p_colegio)
    when 'soporte' then p_usuario = public.mi_usuario_id() or public.es_super()
    else false
  end
$$;

create or replace function public.es_miembro_conversacion(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select public.puede_ver_conversacion(c.tipo, c.curso_id, c.colegio_id, c.hijo_id, c.usuario_a, c.usuario_b, c.usuario_id)
    from public.conversaciones c where c.id = p_conv
  ), false)
$$;

-- ¿puedo escribir? = miembro + normas aceptadas (entre familias) + sin bloqueo (directo).
create or replace function public.puede_escribir_conversacion(p_conv uuid)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  c  public.conversaciones;
  yo uuid := public.mi_usuario_id();
  otro uuid;
begin
  select * into c from public.conversaciones where id = p_conv;
  if not found or yo is null then return false; end if;
  if not public.puede_ver_conversacion(c.tipo, c.curso_id, c.colegio_id, c.hijo_id, c.usuario_a, c.usuario_b, c.usuario_id) then
    return false;
  end if;
  if c.tipo in ('directo','curso')
     and not exists (select 1 from public.normas_chat_aceptadas where usuario_id = yo) then
    return false;
  end if;
  if c.tipo = 'directo' then
    otro := case when c.usuario_a = yo then c.usuario_b else c.usuario_a end;
    if exists (select 1 from public.usuario_bloqueos
               where (usuario_id = otro and bloqueado_id = yo)
                  or (usuario_id = yo and bloqueado_id = otro)) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- Room Parent del curso en el grupo del curso (fase 2) puede borrar mensajes ajenos.
create or replace function public.modera_conversacion(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(select 1 from public.conversaciones c
                where c.id = p_conv and c.tipo = 'curso' and public.es_admin_curso(c.curso_id))
$$;

-- "Ana Pérez"
create or replace function public.nombre_usuario(p_usuario uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select btrim(coalesce(nombre,'') || ' ' || coalesce(apellido,'')) from public.usuarios where id = p_usuario
$$;

-- "familia de Juan y Sofía" — solo hijos en cursos donde YO soy miembro
-- (nunca revela alumnos de otros cursos).
create or replace function public.familia_de(p_usuario uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select 'familia de ' || string_agg(distinct h.nombre, ' y ')
  from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
  where uh.usuario_id = p_usuario and public.es_miembro_curso(h.curso_id)
$$;

-- Destinatarios posibles de una conversación (para la Edge Function).
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
  select uh.usuario_id from c join public.usuario_hijos uh on uh.hijo_id = c.hijo_id where c.tipo = 'colegio'
  union
  select u.id from c join public.usuarios u on u.rol = 'colegio_admin' and u.colegio_id = c.colegio_id where c.tipo = 'colegio'
  union
  select c.usuario_id from c where c.tipo = 'soporte'
  union
  select u.id from c join public.usuarios u on u.rol = 'super' where c.tipo = 'soporte'
$$;

-- -----------------------------------------------------------------------------
-- 3) TRIGGERS
-- -----------------------------------------------------------------------------

-- Llamada a la Edge Function mensajes-push (async, pg_net). Si falta el
-- secreto, no hace nada: el mensaje se guarda igual.
create or replace function public.llamar_mensajes_push(p_body jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'avisos_cron_secret';
  if s is null then return; end if;
  perform net.http_post(
    url     := 'https://gctymjhblvocvaenmdhr.supabase.co/functions/v1/mensajes-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', s),
    body    := p_body,
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'llamar_mensajes_push: %', sqlerrm;  -- nunca bloquear el envío
end $$;
revoke all on function public.llamar_mensajes_push(jsonb) from public, anon, authenticated;

-- Antes de insertar: autor = yo, rol_autor según de qué lado escribe.
create or replace function public.mensajes_antes_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.conversaciones;
begin
  new.autor_id := public.mi_usuario_id();
  new.creado_en := now();
  new.editado_en := null;
  new.borrado_en := null;
  select * into c from public.conversaciones where id = new.conversacion_id;
  new.rol_autor := case
    when c.tipo = 'soporte' and new.autor_id is distinct from c.usuario_id then 'soporte'
    when c.tipo = 'colegio' and not public.es_padre_de(c.hijo_id) then 'colegio'
    else 'usuario'
  end;
  return new;
end $$;
drop trigger if exists mensajes_antes_insert on public.mensajes;
create trigger mensajes_antes_insert before insert on public.mensajes
  for each row execute function public.mensajes_antes_insert();

-- Después de insertar: última actividad, leído para el autor, reabrir
-- soporte y disparar el push.
create or replace function public.mensajes_despues_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.conversaciones
     set ultimo_mensaje_en = new.creado_en,
         estado = case when tipo = 'soporte' and new.rol_autor = 'usuario' then 'abierta' else estado end
   where id = new.conversacion_id;
  if new.autor_id is not null then
    insert into public.conversacion_miembros (conversacion_id, usuario_id, ultimo_leido_en)
    values (new.conversacion_id, new.autor_id, new.creado_en)
    on conflict (conversacion_id, usuario_id) do update set ultimo_leido_en = excluded.ultimo_leido_en;
  end if;
  perform public.llamar_mensajes_push(jsonb_build_object('mensaje_id', new.id));
  return null;
end $$;
drop trigger if exists mensajes_despues_insert on public.mensajes;
create trigger mensajes_despues_insert after insert on public.mensajes
  for each row execute function public.mensajes_despues_insert();

-- Update: el autor edita o borra; un moderador (Room Parent en el grupo del
-- curso) solo puede borrar. Nunca se cambia de conversación ni de autor.
create or replace function public.mensajes_antes_update()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  new.id := old.id;
  new.conversacion_id := old.conversacion_id;
  new.autor_id := old.autor_id;
  new.rol_autor := old.rol_autor;
  new.creado_en := old.creado_en;
  if old.borrado_en is not null then
    raise exception 'El mensaje ya fue eliminado';
  end if;
  if new.borrado_en is not null then
    -- borrar: se va el contenido, queda la fila
    new.borrado_en := now();
    new.texto := null;
    new.fotos := '[]'::jsonb;
    new.editado_en := old.editado_en;
    return new;
  end if;
  -- editar: solo el autor (current_user = 'authenticated' → viene del cliente)
  if old.autor_id is distinct from public.mi_usuario_id() then
    raise exception 'Solo quien escribió el mensaje puede editarlo';
  end if;
  if new.texto is distinct from old.texto or new.fotos is distinct from old.fotos then
    new.editado_en := now();
  else
    new.editado_en := old.editado_en;
  end if;
  return new;
end $$;
drop trigger if exists mensajes_antes_update on public.mensajes;
create trigger mensajes_antes_update before update on public.mensajes
  for each row execute function public.mensajes_antes_update();

-- Denuncia: completar la copia y el colegio desde el mensaje.
create or replace function public.denuncias_antes_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare m public.mensajes; c public.conversaciones;
begin
  select * into m from public.mensajes where id = new.mensaje_id;
  if not found then raise exception 'Mensaje inexistente'; end if;
  select * into c from public.conversaciones where id = m.conversacion_id;
  new.denunciante_id := public.mi_usuario_id();
  new.conversacion_id := m.conversacion_id;
  new.colegio_id := coalesce(c.colegio_id, public.colegio_de_curso(c.curso_id));
  new.texto_snapshot := m.texto;
  new.fotos_snapshot := m.fotos;
  new.autor_snapshot_id := m.autor_id;
  new.autor_snapshot := public.nombre_usuario(m.autor_id);
  new.estado := 'pendiente';
  new.accion := null;
  new.resuelta_por := null;
  new.resuelta_en := null;
  new.creado_en := now();
  return new;
end $$;
drop trigger if exists denuncias_antes_insert on public.mensaje_denuncias;
create trigger denuncias_antes_insert before insert on public.mensaje_denuncias
  for each row execute function public.denuncias_antes_insert();

create or replace function public.denuncias_despues_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.llamar_mensajes_push(jsonb_build_object('denuncia_id', new.id));
  return null;
end $$;
drop trigger if exists denuncias_despues_insert on public.mensaje_denuncias;
create trigger denuncias_despues_insert after insert on public.mensaje_denuncias
  for each row execute function public.denuncias_despues_insert();

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------
alter table public.conversaciones        enable row level security;
alter table public.conversacion_miembros enable row level security;
alter table public.mensajes              enable row level security;
alter table public.soporte_diagnosticos  enable row level security;
alter table public.usuario_bloqueos      enable row level security;
alter table public.mensaje_denuncias     enable row level security;
alter table public.normas_chat_aceptadas enable row level security;
alter table public.mensajes_push_log     enable row level security;  -- sin policies: solo service role

-- conversaciones: solo lectura; se crean por RPC.
drop policy if exists conversaciones_select on public.conversaciones;
create policy conversaciones_select on public.conversaciones for select to authenticated
  using (public.puede_ver_conversacion(tipo, curso_id, colegio_id, hijo_id, usuario_a, usuario_b, usuario_id));

drop policy if exists conv_miembros_select on public.conversacion_miembros;
create policy conv_miembros_select on public.conversacion_miembros for select to authenticated
  using (usuario_id = public.mi_usuario_id());
drop policy if exists conv_miembros_insert on public.conversacion_miembros;
create policy conv_miembros_insert on public.conversacion_miembros for insert to authenticated
  with check (usuario_id = public.mi_usuario_id() and public.es_miembro_conversacion(conversacion_id));
drop policy if exists conv_miembros_update on public.conversacion_miembros;
create policy conv_miembros_update on public.conversacion_miembros for update to authenticated
  using (usuario_id = public.mi_usuario_id())
  with check (usuario_id = public.mi_usuario_id());

drop policy if exists mensajes_select on public.mensajes;
create policy mensajes_select on public.mensajes for select to authenticated
  using (public.es_miembro_conversacion(conversacion_id));
drop policy if exists mensajes_insert on public.mensajes;
create policy mensajes_insert on public.mensajes for insert to authenticated
  with check (public.puede_escribir_conversacion(conversacion_id));
drop policy if exists mensajes_update on public.mensajes;
create policy mensajes_update on public.mensajes for update to authenticated
  using (autor_id = public.mi_usuario_id() or public.modera_conversacion(conversacion_id))
  with check (public.es_miembro_conversacion(conversacion_id));
-- sin DELETE: se borra con borrado_en (y la retención borra todo)

drop policy if exists soporte_diag_select on public.soporte_diagnosticos;
create policy soporte_diag_select on public.soporte_diagnosticos for select to authenticated
  using (public.es_super());
drop policy if exists soporte_diag_insert on public.soporte_diagnosticos;
create policy soporte_diag_insert on public.soporte_diagnosticos for insert to authenticated
  with check (exists (select 1 from public.mensajes m join public.conversaciones c on c.id = m.conversacion_id
                      where m.id = mensaje_id and m.conversacion_id = soporte_diagnosticos.conversacion_id
                        and c.tipo = 'soporte' and m.autor_id = public.mi_usuario_id()));

drop policy if exists bloqueos_select on public.usuario_bloqueos;
create policy bloqueos_select on public.usuario_bloqueos for select to authenticated
  using (usuario_id = public.mi_usuario_id());
drop policy if exists bloqueos_insert on public.usuario_bloqueos;
create policy bloqueos_insert on public.usuario_bloqueos for insert to authenticated
  with check (usuario_id = public.mi_usuario_id() and public.comparte_curso(bloqueado_id));
drop policy if exists bloqueos_delete on public.usuario_bloqueos;
create policy bloqueos_delete on public.usuario_bloqueos for delete to authenticated
  using (usuario_id = public.mi_usuario_id());

drop policy if exists denuncias_select on public.mensaje_denuncias;
create policy denuncias_select on public.mensaje_denuncias for select to authenticated
  using (denunciante_id = public.mi_usuario_id() or public.es_super()
         or (colegio_id is not null and public.es_colegio_admin_de(colegio_id)));
drop policy if exists denuncias_insert on public.mensaje_denuncias;
create policy denuncias_insert on public.mensaje_denuncias for insert to authenticated
  with check (exists (select 1 from public.mensajes m
                      where m.id = mensaje_id and public.es_miembro_conversacion(m.conversacion_id)
                        and m.autor_id is distinct from public.mi_usuario_id()));
-- resolver: por RPC (resolver_denuncia)

drop policy if exists normas_select on public.normas_chat_aceptadas;
create policy normas_select on public.normas_chat_aceptadas for select to authenticated
  using (usuario_id = public.mi_usuario_id());
drop policy if exists normas_insert on public.normas_chat_aceptadas;
create policy normas_insert on public.normas_chat_aceptadas for insert to authenticated
  with check (usuario_id = public.mi_usuario_id());

-- -----------------------------------------------------------------------------
-- 5) RPCs
-- -----------------------------------------------------------------------------

-- Lista de conversaciones del usuario, en UNA request: último mensaje, no
-- leídos y nombre a mostrar (nunca teléfono/email). Excluye la bandeja de
-- soporte del lado del super (esa es bandeja_soporte).
create or replace function public.mis_conversaciones()
returns table (
  id uuid, tipo text, curso_id uuid, hijo_id uuid, otro_id uuid,
  titulo text, subtitulo text, estado text,
  ultimo_texto text, ultimo_fotos int, ultimo_autor_id uuid, ultimo_borrado boolean,
  ultimo_en timestamptz, no_leidos int, silenciado boolean, bloqueado boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with yo as (select public.mi_usuario_id() as uid),
  bloq as (select b.bloqueado_id from public.usuario_bloqueos b, yo where b.usuario_id = yo.uid),
  convs as (
    select c.*, case when c.tipo = 'directo' then
             case when c.usuario_a = yo.uid then c.usuario_b else c.usuario_a end end as otro
    from public.conversaciones c, yo
    where (c.tipo = 'directo' and yo.uid in (c.usuario_a, c.usuario_b) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'curso'   and public.es_miembro_curso(c.curso_id))
       or (c.tipo = 'colegio' and public.es_padre_de(c.hijo_id))
       or (c.tipo = 'soporte' and c.usuario_id = yo.uid and c.ultimo_mensaje_en is not null)
  )
  select
    c.id, c.tipo, c.curso_id, c.hijo_id, c.otro,
    case c.tipo
      when 'directo' then public.nombre_usuario(c.otro)
      when 'curso'   then 'Grupo ' || cu.nombre
      when 'colegio' then coalesce(co.nombre, 'Colegio')
      else 'Soporte tribbu'
    end,
    case c.tipo
      when 'directo' then public.familia_de(c.otro)
      when 'colegio' then 'Sobre ' || h.nombre
      else null
    end,
    c.estado,
    um.texto, coalesce(jsonb_array_length(um.fotos), 0), um.autor_id, um.borrado_en is not null,
    coalesce(c.ultimo_mensaje_en, c.creado_en),
    (select count(*)::int from public.mensajes m
      where m.conversacion_id = c.id
        and m.creado_en > coalesce(cm.ultimo_leido_en, '-infinity'::timestamptz)
        and m.autor_id is distinct from yo.uid
        and m.borrado_en is null
        and (m.autor_id is null or m.autor_id not in (select bloqueado_id from bloq))),
    coalesce(cm.silenciado, false),
    c.tipo = 'directo' and c.otro in (select bloqueado_id from bloq)
  from convs c
  cross join yo
  left join public.conversacion_miembros cm on cm.conversacion_id = c.id and cm.usuario_id = yo.uid
  left join public.cursos cu on cu.id = c.curso_id
  left join public.colegios co on co.id = c.colegio_id
  left join public.hijos h on h.id = c.hijo_id
  left join lateral (
    select m.texto, m.fotos, m.autor_id, m.borrado_en from public.mensajes m
    where m.conversacion_id = c.id
      and (m.autor_id is null or m.autor_id not in (select bloqueado_id from bloq))
    order by m.creado_en desc limit 1
  ) um on true
  order by coalesce(c.ultimo_mensaje_en, c.creado_en) desc
$$;

-- Total de no leídos (badge / punto del header).
create or replace function public.mensajes_no_leidos_total()
returns int
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(sum(no_leidos), 0)::int from public.mis_conversaciones() $$;

-- Familias a las que puedo escribir: usuarios activos de mis cursos (con
-- sus hijos en esos cursos). Sin teléfono ni email.
create or replace function public.familias_para_mensaje()
returns table (usuario_id uuid, nombre text, apellido text, hijos jsonb, curso_ids uuid[])
language sql stable security definer set search_path = public, pg_temp
as $$
  with yo as (select public.mi_usuario_id() as uid),
  mis as (select public.cursos_de_usuario((select uid from yo)) as curso_id),
  cand as (
    select uc.usuario_id, uc.curso_id from public.usuario_cursos uc where uc.curso_id in (select curso_id from mis)
    union
    select uh.usuario_id, h.curso_id from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
    where h.curso_id in (select curso_id from mis)
  )
  select u.id, u.nombre, u.apellido,
    coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre, 'apellido', h.apellido, 'curso_id', h.curso_id)
                               order by h.nombre)
              from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
              where uh.usuario_id = u.id and h.curso_id in (select curso_id from mis)), '[]'::jsonb),
    array_agg(distinct cand.curso_id)
  from cand join public.usuarios u on u.id = cand.usuario_id
  where u.id <> (select uid from yo)
    and coalesce(u.activo, true)
    and coalesce(u.rol, 'padre') in ('padre','room','admin')
  group by u.id, u.nombre, u.apellido
  order by u.nombre, u.apellido
$$;

-- Abre (o crea) el 1 a 1 con otro apoderado con quien comparto curso.
create or replace function public.abrir_conversacion_directa(p_usuario uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  yo uuid := public.mi_usuario_id();
  a uuid; b uuid; v_curso uuid; v_id uuid;
begin
  if yo is null or p_usuario is null or p_usuario = yo then
    raise exception 'Destinatario inválido';
  end if;
  a := least(yo, p_usuario); b := greatest(yo, p_usuario);
  select id into v_id from public.conversaciones where tipo = 'directo' and usuario_a = a and usuario_b = b;
  if v_id is not null then return v_id; end if;
  select cu.id into v_curso
  from public.cursos cu
  where cu.id in (select public.cursos_de_usuario(yo))
    and cu.id in (select public.cursos_de_usuario(p_usuario))
  order by cu."año_lectivo" desc nulls last
  limit 1;
  if v_curso is null then
    raise exception 'Solo podés escribirle a familias de tus cursos';
  end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, usuario_a, usuario_b)
  values ('directo', v_curso, public.colegio_de_curso(v_curso), a, b)
  on conflict (usuario_a, usuario_b) where tipo = 'directo' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'directo' and usuario_a = a and usuario_b = b;
  end if;
  return v_id;
end $$;

-- Abre (o crea) mi hilo de soporte.
create or replace function public.abrir_conversacion_soporte()
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); v_id uuid;
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  insert into public.conversaciones (tipo, usuario_id)
  values ('soporte', yo)
  on conflict (usuario_id) where tipo = 'soporte' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'soporte' and usuario_id = yo;
  end if;
  return v_id;
end $$;

-- Bandeja de soporte (solo super). "No leídos" = mensajes del usuario
-- posteriores a la última lectura de CUALQUIER super (bandeja compartida).
create or replace function public.bandeja_soporte()
returns table (
  id uuid, usuario_id uuid, nombre text, email text, rol text, colegio text,
  estado text, ultimo_texto text, ultimo_fotos int, ultimo_rol_autor text, ultimo_en timestamptz,
  no_leidos int, sin_responder boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.es_super() then raise exception 'Solo soporte'; end if;
  return query
  with leido as (
    select cm.conversacion_id, max(cm.ultimo_leido_en) as en
    from public.conversacion_miembros cm join public.usuarios s on s.id = cm.usuario_id and s.rol = 'super'
    group by cm.conversacion_id
  )
  select c.id, c.usuario_id, public.nombre_usuario(c.usuario_id), u.email, u.rol, co.nombre,
    c.estado, um.texto, coalesce(jsonb_array_length(um.fotos), 0), um.rol_autor, c.ultimo_mensaje_en,
    (select count(*)::int from public.mensajes m
      where m.conversacion_id = c.id and m.rol_autor = 'usuario' and m.borrado_en is null
        and m.creado_en > coalesce(l.en, '-infinity'::timestamptz)),
    coalesce(um.rol_autor = 'usuario', false)
  from public.conversaciones c
  join public.usuarios u on u.id = c.usuario_id
  left join public.colegios co on co.id = u.colegio_id
  left join leido l on l.conversacion_id = c.id
  left join lateral (
    select m.texto, m.fotos, m.rol_autor from public.mensajes m
    where m.conversacion_id = c.id order by m.creado_en desc limit 1
  ) um on true
  where c.tipo = 'soporte' and c.ultimo_mensaje_en is not null
  order by c.ultimo_mensaje_en desc;
end $$;

create or replace function public.marcar_soporte(p_conv uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_super() then raise exception 'Solo soporte'; end if;
  if p_estado not in ('abierta','resuelta') then raise exception 'Estado inválido'; end if;
  update public.conversaciones set estado = p_estado where id = p_conv and tipo = 'soporte';
end $$;

-- Resolver una denuncia (colegio de esa denuncia o super). Con
-- p_eliminar = true borra SOLO el mensaje denunciado.
create or replace function public.resolver_denuncia(p_denuncia uuid, p_eliminar boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d public.mensaje_denuncias;
begin
  select * into d from public.mensaje_denuncias where id = p_denuncia;
  if not found then raise exception 'Denuncia inexistente'; end if;
  if not (public.es_super() or (d.colegio_id is not null and public.es_colegio_admin_de(d.colegio_id))) then
    raise exception 'Sin permiso';
  end if;
  if p_eliminar and d.mensaje_id is not null then
    update public.mensajes set borrado_en = now() where id = d.mensaje_id and borrado_en is null;
  end if;
  update public.mensaje_denuncias
     set estado = 'resuelta',
         accion = case when p_eliminar then 'mensaje_eliminado' else 'sin_accion' end,
         resuelta_por = public.mi_usuario_id(),
         resuelta_en = now()
   where mensaje_id is not distinct from d.mensaje_id and estado = 'pendiente'
     and (id = p_denuncia or d.mensaje_id is not null);
end $$;

-- -----------------------------------------------------------------------------
-- 6) PERMISOS DE FUNCIONES
-- -----------------------------------------------------------------------------
revoke all on function public.cursos_de_usuario(uuid) from public, anon, authenticated;
revoke all on function public.miembros_conversacion(uuid) from public, anon, authenticated;
grant execute on function public.cursos_de_usuario(uuid) to service_role;
grant execute on function public.miembros_conversacion(uuid) to service_role;

revoke all on function public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.es_miembro_conversacion(uuid) from public, anon;
revoke all on function public.puede_escribir_conversacion(uuid) from public, anon;
revoke all on function public.modera_conversacion(uuid) from public, anon;
revoke all on function public.nombre_usuario(uuid) from public, anon;
revoke all on function public.familia_de(uuid) from public, anon;
revoke all on function public.mis_conversaciones() from public, anon;
revoke all on function public.mensajes_no_leidos_total() from public, anon;
revoke all on function public.familias_para_mensaje() from public, anon;
revoke all on function public.abrir_conversacion_directa(uuid) from public, anon;
revoke all on function public.abrir_conversacion_soporte() from public, anon;
revoke all on function public.bandeja_soporte() from public, anon;
revoke all on function public.marcar_soporte(uuid, text) from public, anon;
revoke all on function public.resolver_denuncia(uuid, boolean) from public, anon;
grant execute on function
  public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid),
  public.es_miembro_conversacion(uuid), public.puede_escribir_conversacion(uuid),
  public.modera_conversacion(uuid), public.nombre_usuario(uuid), public.familia_de(uuid),
  public.mis_conversaciones(), public.mensajes_no_leidos_total(), public.familias_para_mensaje(),
  public.abrir_conversacion_directa(uuid), public.abrir_conversacion_soporte(),
  public.bandeja_soporte(), public.marcar_soporte(uuid, text), public.resolver_denuncia(uuid, boolean)
to authenticated;

-- -----------------------------------------------------------------------------
-- 7) REALTIME
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes') then
    alter publication supabase_realtime add table public.mensajes;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 8) RETENCIÓN (Edge Function mensajes-retencion, --no-verify-jwt, mismo
--    CRON_SECRET). Diaria 07:00 UTC = 04:00 AR.
-- -----------------------------------------------------------------------------
create or replace function public.llamar_mensajes_retencion()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url     := 'https://gctymjhblvocvaenmdhr.supabase.co/functions/v1/mensajes-retencion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.llamar_mensajes_retencion() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mensajes-retencion') then
    perform cron.unschedule('mensajes-retencion');
  end if;
  perform cron.schedule('mensajes-retencion', '0 7 * * *', 'select public.llamar_mensajes_retencion()');
end $$;
