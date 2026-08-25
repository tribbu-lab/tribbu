-- supabase/calendar-token-hardening.sql
--
-- Fix de seguridad: `usuarios.calendar_token` (agregado en calendar-sync.sql)
-- quedaba expuesto por la policy `usuarios_select` a CUALQUIER compañero de
-- curso (RLS es por fila, no por columna — `comparte_curso(id)` da SELECT de
-- la fila completa). Con ese token, cualquiera podía leer el feed ICS
-- personal de otro apoderado vía calendar-feed?token=... (esa función no
-- verifica JWT, el token ES la autenticación).
--
-- Fix: mover el token a su propia tabla, con RLS que solo permite ver la
-- fila propia (nunca por compartir curso). Correr una sola vez, DESPUÉS de
-- calendar-sync.sql. Después de correr esto:
--   1. Actualizar supabase/functions/calendar-feed/index.ts (ya hecho en este
--      commit) y redeployar: supabase functions deploy calendar-feed --no-verify-jwt
--   2. El front (BotonAgregarCalendarioWeb.jsx / BotonAgregarCalendario.jsx)
--      ya está actualizado para leer de la tabla nueva.

create table public.usuario_calendar_tokens (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  token      text not null unique,
  creado_en  timestamptz not null default now()
);

-- Migrar tokens ya generados (la feature es nueva, probablemente no haya
-- ninguno todavía, pero por si acaso).
insert into public.usuario_calendar_tokens (usuario_id, token)
select id, calendar_token from public.usuarios
where calendar_token is not null
on conflict (usuario_id) do nothing;

alter table public.usuarios drop column if exists calendar_token;

alter table public.usuario_calendar_tokens enable row level security;

-- Solo la fila propia — a propósito NO usa comparte_curso() como usuarios_select,
-- ese es justamente el agujero que esto cierra. Sin policy de insert/update/
-- delete para usuarios normales: solo se escribe vía la RPC security definer.
create policy usuario_calendar_tokens_select on public.usuario_calendar_tokens for select to authenticated
  using ( usuario_id = public.mi_usuario_id() or public.es_super() );

create or replace function public.regenerar_calendar_token()
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := public.mi_usuario_id();
  v_token text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.usuario_calendar_tokens (usuario_id, token)
  values (v_uid, v_token)
  on conflict (usuario_id) do update set token = excluded.token, creado_en = now();
  return v_token;
end $$;

grant execute on function public.regenerar_calendar_token() to authenticated;
