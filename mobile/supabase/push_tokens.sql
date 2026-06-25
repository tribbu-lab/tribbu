-- Tabla para los Expo push tokens (reemplaza el player_id de OneSignal).
-- Una fila por dispositivo: un usuario puede tener varios (teléfono + tablet).
-- Correr en el SQL editor de Supabase ANTES de probar el push en mobile.

create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  token       text not null unique,
  platform    text,                       -- 'ios' | 'android'
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_usuario_id_idx on public.push_tokens (usuario_id);

alter table public.push_tokens enable row level security;

-- El usuario autenticado gestiona solo sus propios tokens.
-- (usuarios.auth_id enlaza la fila de usuarios con auth.uid(), igual que el resto del esquema.)
create policy "push_tokens_select_own"
  on public.push_tokens for select
  using (
    usuario_id in (select id from public.usuarios where auth_id = auth.uid())
  );

create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  with check (
    usuario_id in (select id from public.usuarios where auth_id = auth.uid())
  );

create policy "push_tokens_update_own"
  on public.push_tokens for update
  using (
    usuario_id in (select id from public.usuarios where auth_id = auth.uid())
  );

create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  using (
    usuario_id in (select id from public.usuarios where auth_id = auth.uid())
  );

-- La Edge Function send-push lee esta tabla con la service-role key (bypassea RLS).
