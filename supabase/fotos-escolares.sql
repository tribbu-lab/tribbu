-- supabase/fotos-escolares.sql — Fotos escolares (docs/notas-tecnicas.md)
--
-- La Secretaría del nivel (o el administrador / super) arma una "sesión de
-- fotos" por curso, como el sobre de la fotógrafa: vencimiento, opciones de
-- compra (Opción A, B… con precio; alguna puede ser digital), copias
-- adicionales por tamaño y datos de pago. Sube las fotos y asigna cada una a
-- su alumno (o la marca como grupal del curso).
--
-- Cada foto se guarda dos veces en el bucket privado `fotos`:
--   · path          → el original (sin marca);
--   · path_muestra  → copia con la marca de agua grabada (+ path_miniatura).
-- La familia solo puede leer la muestra. El original lo lee el colegio y, si el
-- pedido está pagado y la opción es digital, la familia del alumno (la foto
-- elegida + las grupales de la sesión).
--
-- Quién ve qué:
--   · sesiones y fotos: el colegio del curso (super / administrador /
--     Secretaría del nivel) y, una vez publicada, la familia — solo las fotos
--     de su hijo y las grupales. Las docentes y otras familias, nada.
--   · pedidos: la familia del alumno y el colegio. Se escriben solo por RPC:
--     guardar_pedido_fotos / borrar_pedido_fotos / informar_pago_fotos
--     (familia, hasta el vencimiento y mientras no esté pagado) y
--     marcar_pedido_fotos (colegio: pagado / entregado). El total lo calcula
--     la base con los precios de la sesión (se guarda una foto de esos datos).
--
-- Al cerrar el año (curso de un año < año_lectivo_actual) la Edge Function
-- fotos-retencion borra los archivos y las filas (cron diario, al final).
--
-- Correr después de rls-hardening.sql, multi-colegio.sql, roles-por-nivel.sql,
-- cambios-salida.sql (hoy_ar) y mensajes-archivo.sql (curso_cerrado).
-- Idempotente.

-- ── Tablas ────────────────────────────────────────────────────────────────
create table if not exists public.fotos_sesiones (
  id            uuid primary key default gen_random_uuid(),
  curso_id      uuid not null references public.cursos(id) on delete cascade,
  titulo        text not null default 'Fotos escolares',
  vence         date not null,
  -- [{id, nombre, incluye: [text], precio, precio_digital}] — precio = en papel;
  -- null en uno = no se ofrece en ese formato (fotos-papel-o-digital.sql).
  -- Las primeras sesiones tenían {precio, digital}: digital = solo digital.
  opciones      jsonb not null default '[]'::jsonb check (jsonb_typeof(opciones) = 'array'),
  -- [{id, tamano, precio}]
  copias        jsonb not null default '[]'::jsonb check (jsonb_typeof(copias) = 'array'),
  datos_pago    text,
  publicada_en  timestamptz,
  creado_por    uuid references public.usuarios(id) on delete set null default public.mi_usuario_id(),
  creado_en     timestamptz not null default now()
);
create index if not exists fotos_sesiones_curso on public.fotos_sesiones (curso_id);

create table if not exists public.fotos (
  id              uuid primary key default gen_random_uuid(),
  sesion_id       uuid not null references public.fotos_sesiones(id) on delete cascade,
  curso_id        uuid not null references public.cursos(id) on delete cascade,
  -- alumno: hijo_id null = sin asignar todavía; grupal: la ve todo el curso
  tipo            text not null default 'alumno' check (tipo in ('alumno', 'grupal')),
  hijo_id         uuid references public.hijos(id) on delete set null,
  archivo         text not null,           -- nombre original (K3Ants07.JPG)
  path            text not null unique,    -- original
  path_muestra    text not null unique,    -- con marca de agua
  path_miniatura  text not null unique,    -- miniatura de la muestra
  orden           int not null default 0,
  creado_en       timestamptz not null default now(),
  constraint fotos_grupal_sin_hijo check (tipo = 'alumno' or hijo_id is null)
);
create index if not exists fotos_sesion on public.fotos (sesion_id, orden);
create index if not exists fotos_hijo on public.fotos (hijo_id);

create table if not exists public.fotos_pedidos (
  id                 uuid primary key default gen_random_uuid(),
  sesion_id          uuid not null references public.fotos_sesiones(id) on delete cascade,
  curso_id           uuid not null references public.cursos(id) on delete cascade,
  hijo_id            uuid not null references public.hijos(id) on delete cascade,
  opcion_id          text,
  opcion_nombre      text,
  digital            boolean not null default false,
  foto_id            uuid references public.fotos(id) on delete set null,
  -- [{foto_id, copia_id, tamano, precio, cantidad}]
  copias             jsonb not null default '[]'::jsonb,
  total              numeric(12, 2) not null default 0,
  comentario         text,
  creado_por         uuid references public.usuarios(id) on delete set null,
  actualizado_en     timestamptz not null default now(),
  informado_pago_en  timestamptz,
  pagado_en          timestamptz,
  pagado_por         uuid references public.usuarios(id) on delete set null,
  entregado_en       timestamptz,
  unique (sesion_id, hijo_id)
);
create index if not exists fotos_pedidos_hijo on public.fotos_pedidos (hijo_id);

-- ── Helpers ───────────────────────────────────────────────────────────────
create or replace function public.gestiona_fotos_de_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_secretaria_de_curso(p_curso)
$$;

-- Familia de la sesión: tiene un hijo en el curso, o un hijo con fotos en ella
-- (si ya lo pasaron de curso). Solo sesiones publicadas.
create or replace function public.es_familia_de_sesion(p_sesion uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.fotos_sesiones s
    where s.id = p_sesion and s.publicada_en is not null
      and (exists (select 1 from public.usuario_hijos uh
                     join public.usuarios u on u.id = uh.usuario_id
                     join public.hijos h on h.id = uh.hijo_id
                    where u.auth_id = auth.uid() and h.curso_id = s.curso_id)
           or exists (select 1 from public.fotos f
                       where f.sesion_id = s.id and f.hijo_id is not null and public.es_padre_de(f.hijo_id))))
$$;

create or replace function public.puede_ver_foto(p_foto uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.fotos f
    where f.id = p_foto
      and (public.gestiona_fotos_de_curso(f.curso_id)
           or (public.es_familia_de_sesion(f.sesion_id)
               and ((f.tipo = 'grupal') or (f.hijo_id is not null and public.es_padre_de(f.hijo_id))))))
$$;

-- Original sin marca: el colegio, o la familia con un pedido pagado de una
-- opción digital (la foto elegida + las grupales de la sesión).
create or replace function public.puede_descargar_foto(p_foto uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.fotos f
    where f.id = p_foto
      and (public.gestiona_fotos_de_curso(f.curso_id)
           or exists (select 1 from public.fotos_pedidos p
                       where p.sesion_id = f.sesion_id and p.digital and p.pagado_en is not null
                         and public.es_padre_de(p.hijo_id)
                         and (p.foto_id = f.id or f.tipo = 'grupal'))))
$$;

-- Carpeta del bucket: <curso_id>/<sesion_id>/<archivo>
create or replace function public.curso_de_carpeta_fotos(p_name text)
returns uuid
language sql immutable set search_path = public, pg_temp
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

create or replace function public.puede_leer_archivo_foto(p_name text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(public.gestiona_fotos_de_curso(public.curso_de_carpeta_fotos(p_name)), false)
      or exists (select 1 from public.fotos f
                  where (f.path_muestra = p_name or f.path_miniatura = p_name) and public.puede_ver_foto(f.id))
      or exists (select 1 from public.fotos f
                  where f.path = p_name and public.puede_descargar_foto(f.id))
$$;

-- ── RLS de las tablas ─────────────────────────────────────────────────────
alter table public.fotos_sesiones enable row level security;
alter table public.fotos enable row level security;
alter table public.fotos_pedidos enable row level security;

drop policy if exists fotos_sesiones_select on public.fotos_sesiones;
create policy fotos_sesiones_select on public.fotos_sesiones for select to authenticated
  using (public.gestiona_fotos_de_curso(curso_id) or public.es_familia_de_sesion(id));
drop policy if exists fotos_sesiones_insert on public.fotos_sesiones;
create policy fotos_sesiones_insert on public.fotos_sesiones for insert to authenticated
  with check (public.gestiona_fotos_de_curso(curso_id));
drop policy if exists fotos_sesiones_update on public.fotos_sesiones;
create policy fotos_sesiones_update on public.fotos_sesiones for update to authenticated
  using (public.gestiona_fotos_de_curso(curso_id)) with check (public.gestiona_fotos_de_curso(curso_id));
drop policy if exists fotos_sesiones_delete on public.fotos_sesiones;
create policy fotos_sesiones_delete on public.fotos_sesiones for delete to authenticated
  using (public.gestiona_fotos_de_curso(curso_id));

drop policy if exists fotos_select on public.fotos;
create policy fotos_select on public.fotos for select to authenticated
  using (public.puede_ver_foto(id));
-- La foto va al curso de su sesión, a un alumno de ese curso y a su carpeta.
drop policy if exists fotos_insert on public.fotos;
create policy fotos_insert on public.fotos for insert to authenticated
  with check (public.gestiona_fotos_de_curso(curso_id)
              and exists (select 1 from public.fotos_sesiones s where s.id = sesion_id and s.curso_id = fotos.curso_id)
              and (hijo_id is null or exists (select 1 from public.hijos h where h.id = hijo_id and h.curso_id = fotos.curso_id))
              and public.curso_de_carpeta_fotos(path) = curso_id
              and public.curso_de_carpeta_fotos(path_muestra) = curso_id
              and public.curso_de_carpeta_fotos(path_miniatura) = curso_id);
drop policy if exists fotos_update on public.fotos;
create policy fotos_update on public.fotos for update to authenticated
  using (public.gestiona_fotos_de_curso(curso_id))
  with check (public.gestiona_fotos_de_curso(curso_id)
              and exists (select 1 from public.fotos_sesiones s where s.id = sesion_id and s.curso_id = fotos.curso_id)
              and (hijo_id is null or exists (select 1 from public.hijos h where h.id = hijo_id and h.curso_id = fotos.curso_id))
              and public.curso_de_carpeta_fotos(path) = curso_id
              and public.curso_de_carpeta_fotos(path_muestra) = curso_id
              and public.curso_de_carpeta_fotos(path_miniatura) = curso_id);
drop policy if exists fotos_delete on public.fotos;
create policy fotos_delete on public.fotos for delete to authenticated
  using (public.gestiona_fotos_de_curso(curso_id));

drop policy if exists fotos_pedidos_select on public.fotos_pedidos;
create policy fotos_pedidos_select on public.fotos_pedidos for select to authenticated
  using (public.es_padre_de(hijo_id) or public.gestiona_fotos_de_curso(curso_id));
drop policy if exists fotos_pedidos_insert on public.fotos_pedidos;
drop policy if exists fotos_pedidos_update on public.fotos_pedidos;
-- El colegio puede borrar un pedido (ej. cargado por error).
drop policy if exists fotos_pedidos_delete on public.fotos_pedidos;
create policy fotos_pedidos_delete on public.fotos_pedidos for delete to authenticated
  using (public.gestiona_fotos_de_curso(curso_id));

grant select, insert, update, delete on public.fotos_sesiones to authenticated;
grant select, insert, update, delete on public.fotos to authenticated;
grant select, delete on public.fotos_pedidos to authenticated;

-- ── RPCs del pedido ───────────────────────────────────────────────────────
-- La familia guarda (crea o reemplaza) el pedido de su hijo.
-- p_copias: [{foto_id, copia_id, cantidad}]
drop function if exists public.guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text);
create or replace function public.guardar_pedido_fotos(
  p_sesion uuid, p_hijo uuid, p_opcion text, p_foto uuid, p_copias jsonb, p_comentario text default null,
  p_digital boolean default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s public.fotos_sesiones;
  v_op jsonb; v_cp jsonb; x jsonb;
  v_total numeric := 0; v_copias jsonb := '[]'::jsonb; v_cant int; v_id uuid;
  v_prev public.fotos_pedidos;
  v_papel numeric; v_dig numeric; v_es_digital boolean := false;
begin
  select * into s from public.fotos_sesiones where id = p_sesion;
  if s.id is null or s.publicada_en is null or not public.es_padre_de(p_hijo) or not public.es_familia_de_sesion(s.id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fotos f where f.sesion_id = s.id and f.hijo_id = p_hijo) then
    raise exception 'Todavía no hay fotos de este alumno';
  end if;
  if public.hoy_ar() > s.vence then raise exception 'El plazo para pedir fotos ya venció'; end if;
  select * into v_prev from public.fotos_pedidos where sesion_id = s.id and hijo_id = p_hijo;
  if v_prev.pagado_en is not null then raise exception 'El pedido ya está pagado: para cambiarlo, hablá con la Secretaría'; end if;

  if nullif(p_opcion, '') is not null then
    select o into v_op from jsonb_array_elements(s.opciones) o where o->>'id' = p_opcion;
    if v_op is null then raise exception 'Opción no válida'; end if;
    if p_foto is null or not exists (select 1 from public.fotos f where f.id = p_foto and f.sesion_id = s.id and f.hijo_id = p_hijo) then
      raise exception 'Elegí la foto para la opción';
    end if;
    -- Precio por formato (papel / digital); la familia elige si hay los dos.
    if (v_op ? 'precio_digital') or not coalesce((v_op->>'digital')::boolean, false) then
      v_papel := nullif(v_op->>'precio', '')::numeric;
      v_dig := nullif(v_op->>'precio_digital', '')::numeric;
    else
      v_dig := nullif(v_op->>'precio', '')::numeric; -- sesión vieja: opción solo digital
    end if;
    if v_papel is not null and v_dig is not null then
      if p_digital is null then raise exception 'Elegí si la querés en papel o digital'; end if;
      v_es_digital := p_digital;
    elsif v_dig is not null then
      if p_digital is false then raise exception 'Esa opción es solo digital'; end if;
      v_es_digital := true;
    elsif v_papel is not null then
      if p_digital then raise exception 'Esa opción es solo en papel'; end if;
    else
      raise exception 'Opción no válida';
    end if;
    v_total := case when v_es_digital then v_dig else v_papel end;
  end if;

  if jsonb_typeof(coalesce(p_copias, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_copias, '[]'::jsonb)) > 30 then
    raise exception 'Copias no válidas';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_copias, '[]'::jsonb)) loop
    select c into v_cp from jsonb_array_elements(s.copias) c where c->>'id' = x->>'copia_id';
    v_cant := (x->>'cantidad')::int;
    if v_cp is null or v_cant is null or v_cant < 1 or v_cant > 20 then raise exception 'Copias no válidas'; end if;
    if not exists (select 1 from public.fotos f where f.id = (x->>'foto_id')::uuid and f.sesion_id = s.id
                     and (f.hijo_id = p_hijo or f.tipo = 'grupal')) then
      raise exception 'Copias no válidas';
    end if;
    v_total := v_total + v_cant * coalesce((v_cp->>'precio')::numeric, 0);
    v_copias := v_copias || jsonb_build_object('foto_id', x->>'foto_id', 'copia_id', v_cp->>'id',
      'tamano', v_cp->>'tamano', 'precio', coalesce((v_cp->>'precio')::numeric, 0), 'cantidad', v_cant);
  end loop;

  if v_op is null and jsonb_array_length(v_copias) = 0 then raise exception 'Elegí una opción o copias'; end if;

  insert into public.fotos_pedidos as p (sesion_id, curso_id, hijo_id, opcion_id, opcion_nombre, digital, foto_id,
                                         copias, total, comentario, creado_por, actualizado_en)
  values (s.id, s.curso_id, p_hijo, v_op->>'id', v_op->>'nombre', v_es_digital,
          case when v_op is null then null else p_foto end, v_copias, v_total,
          nullif(left(btrim(coalesce(p_comentario, '')), 500), ''), public.mi_usuario_id(), now())
  on conflict (sesion_id, hijo_id) do update
     set opcion_id = excluded.opcion_id, opcion_nombre = excluded.opcion_nombre, digital = excluded.digital,
         foto_id = excluded.foto_id, copias = excluded.copias, total = excluded.total,
         comentario = excluded.comentario, creado_por = excluded.creado_por, actualizado_en = now(),
         informado_pago_en = null
  returning p.id into v_id;
  return v_id;
end $$;
revoke all on function public.guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text, boolean) to authenticated, service_role;

create or replace function public.borrar_pedido_fotos(p_pedido uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare p public.fotos_pedidos;
begin
  select * into p from public.fotos_pedidos where id = p_pedido;
  if p.id is null or not public.es_padre_de(p.hijo_id) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p.pagado_en is not null then raise exception 'El pedido ya está pagado: para cambiarlo, hablá con la Secretaría'; end if;
  delete from public.fotos_pedidos where id = p_pedido;
  return found;
end $$;

-- La familia avisa "Ya pagué" (o lo deshace con p_valor = false).
create or replace function public.informar_pago_fotos(p_pedido uuid, p_valor boolean default true)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare p public.fotos_pedidos;
begin
  select * into p from public.fotos_pedidos where id = p_pedido;
  if p.id is null or not public.es_padre_de(p.hijo_id) then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.fotos_pedidos
     set informado_pago_en = case when p_valor then coalesce(informado_pago_en, now()) end
   where id = p_pedido and pagado_en is null;
  return found;
end $$;

-- El colegio marca pagado / entregado (o lo deshace con p_valor = false).
create or replace function public.marcar_pedido_fotos(p_pedido uuid, p_campo text, p_valor boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare p public.fotos_pedidos;
begin
  select * into p from public.fotos_pedidos where id = p_pedido;
  if p.id is null or not public.gestiona_fotos_de_curso(p.curso_id) then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_campo = 'pagado' then
    update public.fotos_pedidos
       set pagado_en = case when p_valor then coalesce(pagado_en, now()) end,
           pagado_por = case when p_valor then coalesce(pagado_por, public.mi_usuario_id()) end
     where id = p_pedido;
  elsif p_campo = 'entregado' then
    update public.fotos_pedidos set entregado_en = case when p_valor then coalesce(entregado_en, now()) end
     where id = p_pedido;
  else
    raise exception 'Campo no válido';
  end if;
  return found;
end $$;

do $$
declare f text;
begin
  foreach f in array array['gestiona_fotos_de_curso(uuid)', 'es_familia_de_sesion(uuid)', 'puede_ver_foto(uuid)',
    'puede_descargar_foto(uuid)', 'puede_leer_archivo_foto(text)',
    'guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text)', 'borrar_pedido_fotos(uuid)',
    'informar_pago_fotos(uuid, boolean)', 'marcar_pedido_fotos(uuid, text, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── Storage: bucket privado `fotos` ───────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 15728640, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_escolares_select on storage.objects;
create policy fotos_escolares_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.puede_leer_archivo_foto(name));
drop policy if exists fotos_escolares_insert on storage.objects;
create policy fotos_escolares_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and coalesce(public.gestiona_fotos_de_curso(public.curso_de_carpeta_fotos(name)), false));
drop policy if exists fotos_escolares_update on storage.objects;
create policy fotos_escolares_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and coalesce(public.gestiona_fotos_de_curso(public.curso_de_carpeta_fotos(name)), false))
  with check (bucket_id = 'fotos' and coalesce(public.gestiona_fotos_de_curso(public.curso_de_carpeta_fotos(name)), false));
drop policy if exists fotos_escolares_delete on storage.objects;
create policy fotos_escolares_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and coalesce(public.gestiona_fotos_de_curso(public.curso_de_carpeta_fotos(name)), false));

-- ── Retención: fotos-retencion (Edge Function, --no-verify-jwt, mismo
--    CRON_SECRET que avisos/mensajes). Diaria 07:30 UTC = 04:30 AR.
create or replace function public.llamar_fotos_retencion()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url     := 'https://gctymjhblvocvaenmdhr.supabase.co/functions/v1/fotos-retencion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.llamar_fotos_retencion() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fotos-retencion') then
    perform cron.unschedule('fotos-retencion');
  end if;
  perform cron.schedule('fotos-retencion', '30 7 * * *', 'select public.llamar_fotos_retencion()');
end $$;
