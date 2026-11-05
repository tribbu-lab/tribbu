-- supabase/multi-cuenta.sql — Perfil multicuenta (specs/perfil-multicuenta.md).
-- Una cuenta por colegio, varias cuentas en un mismo celular. Idempotente.
--
-- Correr ANTES de desplegar las Edge Functions y de publicar la app.

-- ── 1. Un celular puede recibir los avisos de varias cuentas ─────────────────
-- push_tokens.token sigue único: las apps ya publicadas hacen
-- upsert(onConflict:"token") y cambiarlo les rompería el registro.
create table if not exists public.push_token_cuentas (
  token       text not null,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  platform    text,
  updated_at  timestamptz not null default now(),
  primary key (token, usuario_id)
);
create index if not exists push_token_cuentas_usuario_idx on public.push_token_cuentas (usuario_id);

alter table public.push_token_cuentas enable row level security;

-- Se escribe solo por registrar_push_token. Cada cuenta ve y borra lo suyo
-- (cerrar sesión); las Edge Functions leen con service role.
drop policy if exists push_token_cuentas_select_own on public.push_token_cuentas;
create policy push_token_cuentas_select_own on public.push_token_cuentas
  for select to authenticated using (usuario_id = public.mi_usuario_id());
drop policy if exists push_token_cuentas_delete_own on public.push_token_cuentas;
create policy push_token_cuentas_delete_own on public.push_token_cuentas
  for delete to authenticated using (usuario_id = public.mi_usuario_id());

revoke all on public.push_token_cuentas from anon;
revoke insert, update on public.push_token_cuentas from authenticated;
grant select, delete on public.push_token_cuentas to authenticated;

-- Anota este celular para la cuenta que llama y saca al resto, salvo las que
-- la app tiene guardadas (p_mantener). p_mantener solo conserva filas que ya
-- estaban: no permite sumar una cuenta ajena a un celular. Así, en un teléfono
-- compartido una cuenta nueva sigue "llevándose" el celular, como hasta ahora.
create or replace function public.registrar_push_token(p_token text, p_platform text, p_mantener uuid[] default '{}')
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_yo uuid := public.mi_usuario_id();
begin
  if v_yo is null then raise exception 'Sin sesión'; end if;
  if p_token is null or p_token not like 'ExponentPushToken%' then raise exception 'Token inválido'; end if;
  delete from public.push_tokens where token = p_token;
  delete from public.push_token_cuentas
   where token = p_token and usuario_id <> v_yo and not (usuario_id = any(coalesce(p_mantener, '{}')));
  insert into public.push_token_cuentas (token, usuario_id, platform, updated_at)
  values (p_token, v_yo, p_platform, now())
  on conflict (token, usuario_id) do update set platform = excluded.platform, updated_at = now();
end $$;
revoke all on function public.registrar_push_token(text, text, uuid[]) from public, anon;
grant execute on function public.registrar_push_token(text, text, uuid[]) to authenticated;

-- ── 2. Una cuenta pertenece a un solo colegio ────────────────────────────────
-- Security definer a propósito: la RLS le esconde al colegio B los vínculos que
-- la cuenta tiene en el A. El mensaje no nombra al otro colegio.
create or replace function public.cuenta_un_solo_colegio()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_colegio uuid;
begin
  if tg_table_name = 'usuario_hijos' then
    select cu.colegio_id into v_colegio from public.hijos h join public.cursos cu on cu.id = h.curso_id where h.id = new.hijo_id;
  else
    select cu.colegio_id into v_colegio from public.cursos cu where cu.id = new.curso_id;
  end if;
  if v_colegio is null then return new; end if;

  -- Dos altas simultáneas de la misma cuenta no se pueden saltear el chequeo.
  perform pg_advisory_xact_lock(hashtext('cuenta_un_solo_colegio:' || new.usuario_id::text));

  if exists (
    select 1 from public.usuario_hijos uh
      join public.hijos h on h.id = uh.hijo_id
      join public.cursos cu on cu.id = h.curso_id
     where uh.usuario_id = new.usuario_id and cu.colegio_id <> v_colegio
    union all
    select 1 from public.usuario_cursos uc
      join public.cursos cu on cu.id = uc.curso_id
     where uc.usuario_id = new.usuario_id and cu.colegio_id <> v_colegio
    union all
    select 1 from public.usuarios u
     where u.id = new.usuario_id and u.colegio_id is not null and u.colegio_id <> v_colegio
  ) then
    raise exception 'Esta cuenta ya pertenece a otro colegio. Cada colegio usa una cuenta propia: cargá a esta familia con otro mail.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.cuenta_un_solo_colegio() from public, anon, authenticated;

drop trigger if exists cuenta_un_solo_colegio on public.usuario_hijos;
create trigger cuenta_un_solo_colegio
  before insert or update of usuario_id, hijo_id on public.usuario_hijos
  for each row execute function public.cuenta_un_solo_colegio();

drop trigger if exists cuenta_un_solo_colegio on public.usuario_cursos;
create trigger cuenta_un_solo_colegio
  before insert or update of usuario_id, curso_id on public.usuario_cursos
  for each row execute function public.cuenta_un_solo_colegio();
