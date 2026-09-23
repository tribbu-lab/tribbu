-- supabase/perdidos-y-encontrados.sql — Perdidos y encontrados
-- (specs/perdidos-y-encontrados.md)
--
-- objetos_perdidos: lo que alguien busca (tipo 'perdido') o encontró
-- ('encontrado'). Alcance 'curso' (default: lo ve ese curso) o 'colegio' (todo
-- el colegio). Vence solo a los 30 días (vence_en) o al marcarse resuelto.
-- objeto_perdido_avisos: "¡Es mío!" (sobre un encontrado) / "Lo tengo yo"
-- (sobre un perdido). Avisar es lo que habilita el contacto entre los dos.
--
-- Correr una vez, después de multi-colegio.sql y lecturas-y-adopcion.sql.

create table if not exists public.objetos_perdidos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('perdido', 'encontrado')),
  categoria     text not null default 'otro'
                check (categoria in ('ropa', 'mochila', 'lonchera', 'botella', 'utiles', 'anteojos', 'juguete', 'otro')),
  titulo        text not null,
  descripcion   text,
  foto          text,              -- path en el bucket privado adjuntos
  lugar         text,              -- dónde se perdió / dónde está ahora
  fecha         date,              -- cuándo se perdió / encontró
  alcance       text not null default 'curso' check (alcance in ('curso', 'colegio')),
  curso_id      uuid references public.cursos(id) on delete cascade,
  colegio_id    uuid not null references public.colegios(id) on delete cascade,
  publicado_por uuid references public.usuarios(id) on delete set null,
  es_colegio    boolean not null default false,  -- lo publicó el colegio (su caja de objetos perdidos)
  estado        text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  creado_en     timestamptz not null default now(),
  vence_en      timestamptz not null default now() + interval '30 days',
  resuelto_en   timestamptz,
  check (alcance = 'colegio' or curso_id is not null)
);
create index if not exists objetos_perdidos_curso on public.objetos_perdidos (curso_id);
create index if not exists objetos_perdidos_colegio on public.objetos_perdidos (colegio_id);

create table if not exists public.objeto_perdido_avisos (
  id         uuid primary key default gen_random_uuid(),
  objeto_id  uuid not null references public.objetos_perdidos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  mensaje    text,
  creado_en  timestamptz not null default now(),
  unique (objeto_id, usuario_id)
);

-- Quién ve una publicación: su curso (alcance curso), su colegio (alcance
-- colegio), quien la publicó, y super / colegio_admin.
create or replace function public.puede_ver_objeto_perdido(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.objetos_perdidos o
    where o.id = p_id and (
      public.es_super()
      or public.es_colegio_admin_de(o.colegio_id)
      or o.publicado_por = public.mi_usuario_id()
      or (o.alcance = 'curso' and public.es_miembro_curso(o.curso_id))
      or (o.alcance = 'colegio' and public.es_miembro_colegio(o.colegio_id))
    )
  )
$$;

-- Moderación: quien publicó, Room Parent del curso, super / colegio_admin.
create or replace function public.gestiona_objeto_perdido(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.objetos_perdidos o
    where o.id = p_id and (
      public.es_super()
      or public.es_colegio_admin_de(o.colegio_id)
      or o.publicado_por = public.mi_usuario_id()
      or (o.curso_id is not null and public.es_admin_curso(o.curso_id))
    )
  )
$$;

alter table public.objetos_perdidos enable row level security;
alter table public.objeto_perdido_avisos enable row level security;

-- Las policies de la tabla evalúan las columnas de la fila (no puede_ver_*(id)):
-- en un INSERT ... RETURNING la fila nueva todavía no es visible para una
-- función que la busque por id, y el alta fallaba.
drop policy if exists objetos_perdidos_select on public.objetos_perdidos;
create policy objetos_perdidos_select on public.objetos_perdidos for select to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de(colegio_id)
    or publicado_por = public.mi_usuario_id()
    or (alcance = 'curso' and public.es_miembro_curso(curso_id))
    or (alcance = 'colegio' and public.es_miembro_colegio(colegio_id))
  );

drop policy if exists objetos_perdidos_insert on public.objetos_perdidos;
create policy objetos_perdidos_insert on public.objetos_perdidos for insert to authenticated
  with check (
    publicado_por = public.mi_usuario_id()
    and (curso_id is null or public.colegio_de_curso(curso_id) = colegio_id)
    and (
      -- el colegio publica en su colegio (con o sin curso)
      (es_colegio and (public.es_super() or public.es_colegio_admin_de(colegio_id)))
      -- una familia publica en su curso, con alcance curso o colegio
      or (not es_colegio and curso_id is not null and public.es_miembro_curso(curso_id))
    )
  );

drop policy if exists objetos_perdidos_update on public.objetos_perdidos;
create policy objetos_perdidos_update on public.objetos_perdidos for update to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id) or publicado_por = public.mi_usuario_id()
         or (curso_id is not null and public.es_admin_curso(curso_id)))
  with check (public.es_super() or public.es_colegio_admin_de(colegio_id) or publicado_por = public.mi_usuario_id()
         or (curso_id is not null and public.es_admin_curso(curso_id)));

drop policy if exists objetos_perdidos_delete on public.objetos_perdidos;
create policy objetos_perdidos_delete on public.objetos_perdidos for delete to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id) or publicado_por = public.mi_usuario_id()
         or (curso_id is not null and public.es_admin_curso(curso_id)));

-- Avisos: los ve quien avisó y quien gestiona la publicación; avisar requiere
-- poder verla y que no sea propia.
drop policy if exists objeto_perdido_avisos_select on public.objeto_perdido_avisos;
create policy objeto_perdido_avisos_select on public.objeto_perdido_avisos for select to authenticated
  using (usuario_id = public.mi_usuario_id() or public.gestiona_objeto_perdido(objeto_id));

drop policy if exists objeto_perdido_avisos_insert on public.objeto_perdido_avisos;
create policy objeto_perdido_avisos_insert on public.objeto_perdido_avisos for insert to authenticated
  with check (
    usuario_id = public.mi_usuario_id()
    and public.puede_ver_objeto_perdido(objeto_id)
    and not exists (select 1 from public.objetos_perdidos o where o.id = objeto_id and o.publicado_por = public.mi_usuario_id())
  );

drop policy if exists objeto_perdido_avisos_delete on public.objeto_perdido_avisos;
create policy objeto_perdido_avisos_delete on public.objeto_perdido_avisos for delete to authenticated
  using (usuario_id = public.mi_usuario_id());

-- Contacto de quien publicó, solo para quien ya avisó. Si lo publicó el
-- colegio, el contacto es el del colegio (no el de la persona que lo cargó).
create or replace function public.contacto_objeto_perdido(p_id uuid)
returns table (nombre text, telefono text, email text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select
    case when o.es_colegio then c.nombre else trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) end,
    case when o.es_colegio then c.telefono else u.telefono end,
    case when o.es_colegio then c.email else u.email end
  from public.objetos_perdidos o
  left join public.usuarios u on u.id = o.publicado_por
  left join public.colegios c on c.id = o.colegio_id
  where o.id = p_id
    and exists (select 1 from public.objeto_perdido_avisos a where a.objeto_id = o.id and a.usuario_id = public.mi_usuario_id())
$$;

-- Quién avisó sobre una publicación, con su contacto: solo para quien la gestiona.
create or replace function public.avisos_objeto_perdido(p_id uuid)
returns table (usuario_id uuid, nombre text, telefono text, email text, mensaje text, creado_en timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), u.telefono, u.email, a.mensaje, a.creado_en
  from public.objeto_perdido_avisos a
  join public.usuarios u on u.id = a.usuario_id
  where a.objeto_id = p_id and public.gestiona_objeto_perdido(p_id)
  order by a.creado_en
$$;

revoke all on function public.contacto_objeto_perdido(uuid) from public, anon;
revoke all on function public.avisos_objeto_perdido(uuid) from public, anon;
grant execute on function public.contacto_objeto_perdido(uuid) to authenticated;
grant execute on function public.avisos_objeto_perdido(uuid) to authenticated;
