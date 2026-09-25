-- Marketplace de cosas usadas (sección Comunidad) — 2026-09-25.
-- Ver specs/marketplace.md.
--
-- Las familias (y el colegio) publican cosas usadas: uniformes, libros, útiles,
-- ropa, disfraces, juguetes. Precio o "lo regalo", hasta 3 fotos (paths en el
-- bucket privado adjuntos, bajo marketplace/<colegio_id>/), alcance curso o
-- colegio (elige quien publica, como Lost&Found), vence a los 60 días.
-- "Me interesa" → aviso (push al vendedor) y recién ahí se comparten los
-- contactos. Etapa 1 sin pagos: el modelo ya guarda lo que va a hacer falta
-- para cobrar comisión después (precio, moneda, comprador_id, vendido_en).
--
-- Moderación: quien publicó y el colegio (super / colegio_admin). La Room
-- Parent no modera publicaciones ajenas (misma regla que eventos y avisos).
--
-- Correr una vez, después de multi-colegio.sql. Idempotente.

create table if not exists public.marketplace_articulos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  categoria     text not null default 'otro'
                check (categoria in ('uniformes', 'libros', 'utiles', 'ropa', 'disfraces', 'juguetes', 'otro')),
  condicion     text not null default 'usado' check (condicion in ('nuevo', 'como_nuevo', 'usado')),
  talle         text,
  es_regalo     boolean not null default false,
  precio        numeric(12, 2) check (precio is null or precio >= 0),
  moneda        text not null default '$',
  fotos         jsonb not null default '[]'::jsonb,   -- [path, ...] en adjuntos, máx. 3
  alcance       text not null default 'colegio' check (alcance in ('curso', 'colegio')),
  curso_id      uuid references public.cursos(id) on delete cascade,
  colegio_id    uuid not null references public.colegios(id) on delete cascade,
  publicado_por uuid references public.usuarios(id) on delete set null,
  es_colegio    boolean not null default false,       -- lo publica el colegio (feria de uniformes, etc.)
  estado        text not null default 'disponible' check (estado in ('disponible', 'vendido')),
  -- Para cobrar comisión más adelante (Mercado Pago): a quién se vendió y cuándo.
  comprador_id  uuid references public.usuarios(id) on delete set null,
  vendido_en    timestamptz,
  creado_en     timestamptz not null default now(),
  vence_en      timestamptz not null default now() + interval '60 days',
  check (alcance = 'colegio' or curso_id is not null),
  check (es_regalo or precio is not null),
  check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 3)
);
create index if not exists marketplace_articulos_colegio on public.marketplace_articulos (colegio_id);
create index if not exists marketplace_articulos_curso on public.marketplace_articulos (curso_id);

create table if not exists public.marketplace_interesados (
  id          uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.marketplace_articulos(id) on delete cascade,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  mensaje     text,
  creado_en   timestamptz not null default now(),
  unique (articulo_id, usuario_id)
);

create or replace function public.puede_ver_articulo(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.marketplace_articulos a
    where a.id = p_id and (
      public.es_super()
      or public.es_colegio_admin_de(a.colegio_id)
      or a.publicado_por = public.mi_usuario_id()
      or (a.alcance = 'curso' and public.es_miembro_curso(a.curso_id))
      or (a.alcance = 'colegio' and public.es_miembro_colegio(a.colegio_id))
    )
  )
$$;

create or replace function public.gestiona_articulo(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.marketplace_articulos a
    where a.id = p_id and (
      public.es_super()
      or public.es_colegio_admin_de(a.colegio_id)
      or a.publicado_por = public.mi_usuario_id()
    )
  )
$$;

alter table public.marketplace_articulos enable row level security;
alter table public.marketplace_interesados enable row level security;

-- Policies sobre las columnas de la fila (no por id: en un INSERT … RETURNING
-- la fila nueva todavía no es visible para una función que la busque).
drop policy if exists marketplace_articulos_select on public.marketplace_articulos;
create policy marketplace_articulos_select on public.marketplace_articulos for select to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de(colegio_id)
    or publicado_por = public.mi_usuario_id()
    or (alcance = 'curso' and public.es_miembro_curso(curso_id))
    or (alcance = 'colegio' and public.es_miembro_colegio(colegio_id))
  );

drop policy if exists marketplace_articulos_insert on public.marketplace_articulos;
create policy marketplace_articulos_insert on public.marketplace_articulos for insert to authenticated
  with check (
    publicado_por = public.mi_usuario_id()
    and estado = 'disponible' and comprador_id is null
    and (curso_id is null or public.colegio_de_curso(curso_id) = colegio_id)
    and (
      (es_colegio and (public.es_super() or public.es_colegio_admin_de(colegio_id)))
      or (not es_colegio and curso_id is not null and public.es_miembro_curso(curso_id))
    )
  );

drop policy if exists marketplace_articulos_update on public.marketplace_articulos;
create policy marketplace_articulos_update on public.marketplace_articulos for update to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id) or publicado_por = public.mi_usuario_id())
  with check (public.es_super() or public.es_colegio_admin_de(colegio_id) or publicado_por = public.mi_usuario_id());

drop policy if exists marketplace_articulos_delete on public.marketplace_articulos;
create policy marketplace_articulos_delete on public.marketplace_articulos for delete to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id) or publicado_por = public.mi_usuario_id());

drop policy if exists marketplace_interesados_select on public.marketplace_interesados;
create policy marketplace_interesados_select on public.marketplace_interesados for select to authenticated
  using (usuario_id = public.mi_usuario_id() or public.gestiona_articulo(articulo_id));

drop policy if exists marketplace_interesados_insert on public.marketplace_interesados;
create policy marketplace_interesados_insert on public.marketplace_interesados for insert to authenticated
  with check (
    usuario_id = public.mi_usuario_id()
    and public.puede_ver_articulo(articulo_id)
    and not exists (select 1 from public.marketplace_articulos a where a.id = articulo_id and a.publicado_por = public.mi_usuario_id())
  );

drop policy if exists marketplace_interesados_delete on public.marketplace_interesados;
create policy marketplace_interesados_delete on public.marketplace_interesados for delete to authenticated
  using (usuario_id = public.mi_usuario_id());

-- Contacto del vendedor, solo para quien marcó "Me interesa". Si lo publicó
-- el colegio, el contacto es el del colegio.
create or replace function public.contacto_articulo(p_id uuid)
returns table (nombre text, telefono text, email text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select
    case when a.es_colegio then c.nombre else trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) end,
    case when a.es_colegio then c.telefono else u.telefono end,
    case when a.es_colegio then c.email else u.email end
  from public.marketplace_articulos a
  left join public.usuarios u on u.id = a.publicado_por
  left join public.colegios c on c.id = a.colegio_id
  where a.id = p_id
    and exists (select 1 from public.marketplace_interesados i where i.articulo_id = a.id and i.usuario_id = public.mi_usuario_id())
$$;

-- Interesados con su contacto: solo para quien gestiona la publicación.
create or replace function public.interesados_articulo(p_id uuid)
returns table (usuario_id uuid, nombre text, telefono text, email text, mensaje text, creado_en timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), u.telefono, u.email, i.mensaje, i.creado_en
  from public.marketplace_interesados i
  join public.usuarios u on u.id = i.usuario_id
  where i.articulo_id = p_id and public.gestiona_articulo(p_id)
  order by i.creado_en
$$;

-- Cuántos interesados tiene cada publicación (solo el número, nunca quiénes).
create or replace function public.interesados_por_articulo(p_ids uuid[])
returns table (articulo_id uuid, cantidad integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.articulo_id, count(*)::int
  from public.marketplace_interesados i
  where i.articulo_id = any(p_ids) and public.puede_ver_articulo(i.articulo_id)
  group by i.articulo_id
$$;

revoke all on function public.puede_ver_articulo(uuid) from public, anon;
revoke all on function public.gestiona_articulo(uuid) from public, anon;
revoke all on function public.contacto_articulo(uuid) from public, anon;
revoke all on function public.interesados_articulo(uuid) from public, anon;
revoke all on function public.interesados_por_articulo(uuid[]) from public, anon;
grant execute on function public.puede_ver_articulo(uuid) to authenticated;
grant execute on function public.gestiona_articulo(uuid) to authenticated;
grant execute on function public.contacto_articulo(uuid) to authenticated;
grant execute on function public.interesados_articulo(uuid) to authenticated;
grant execute on function public.interesados_por_articulo(uuid[]) to authenticated;
