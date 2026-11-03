-- Cerrar una alerta del curso "para mí" (2026-11-03). Antes solo la Room
-- Parent podía sacarla (y la apagaba para todo el curso): el apoderado no
-- tenía forma de marcarla como vista y le quedaba fija en Hoy. Ahora cada uno
-- la cierra para sí; la alerta sigue activa para los demás.
-- Marca propia, como recordatorio_leidos. Idempotente.
create table if not exists public.alerta_cerradas (
  alerta_id  uuid not null references public.alertas(id) on delete cascade,
  usuario_id uuid not null,
  cerrada_en timestamptz not null default now(),
  primary key (alerta_id, usuario_id)
);
alter table public.alerta_cerradas enable row level security;

drop policy if exists alerta_cerradas_select on public.alerta_cerradas;
create policy alerta_cerradas_select on public.alerta_cerradas for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists alerta_cerradas_insert on public.alerta_cerradas;
create policy alerta_cerradas_insert on public.alerta_cerradas for insert to authenticated
  with check ( usuario_id = public.mi_usuario_id() );
drop policy if exists alerta_cerradas_delete on public.alerta_cerradas;
create policy alerta_cerradas_delete on public.alerta_cerradas for delete to authenticated
  using ( usuario_id = public.mi_usuario_id() );

grant select, insert, delete on public.alerta_cerradas to authenticated;
