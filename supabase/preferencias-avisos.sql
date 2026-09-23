-- supabase/preferencias-avisos.sql
--
-- Qué avisos automáticos (Edge Function avisos-automaticos) quiere recibir
-- cada usuario. Sin fila = todos activados (el default); la fila aparece la
-- primera vez que la familia apaga alguno desde "Notificaciones" (web: menú de
-- cuenta · mobile: Más → Cuenta). Solo afecta a los avisos automáticos: las
-- notificaciones "en vivo" (un aviso nuevo del Room Parent, una alerta, etc.)
-- siguen llegando siempre.

create table if not exists public.preferencias_avisos (
  usuario_id             uuid primary key references public.usuarios(id) on delete cascade,
  evento_manana          boolean not null default true,  -- 19:00: lo que tenés mañana
  colecta_por_vencer     boolean not null default true,  -- colecta impaga que vence pasado mañana
  autorizacion_pendiente boolean not null default true,  -- autorización sin responder que cierra mañana
  resumen_semanal        boolean not null default true,  -- domingos: tu semana
  actualizado_en         timestamptz not null default now()
);

alter table public.preferencias_avisos enable row level security;

drop policy if exists preferencias_avisos_select on public.preferencias_avisos;
create policy preferencias_avisos_select on public.preferencias_avisos for select to authenticated
  using (usuario_id = public.mi_usuario_id());

drop policy if exists preferencias_avisos_insert on public.preferencias_avisos;
create policy preferencias_avisos_insert on public.preferencias_avisos for insert to authenticated
  with check (usuario_id = public.mi_usuario_id());

drop policy if exists preferencias_avisos_update on public.preferencias_avisos;
create policy preferencias_avisos_update on public.preferencias_avisos for update to authenticated
  using (usuario_id = public.mi_usuario_id())
  with check (usuario_id = public.mi_usuario_id());
