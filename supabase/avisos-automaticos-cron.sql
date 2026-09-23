-- supabase/avisos-automaticos-cron.sql
--
-- Programa los avisos automáticos (Edge Function avisos-automaticos):
--   - diario:  todos los días 22:00 UTC = 19:00 Argentina (eventos de
--              mañana + colectas que vencen pasado mañana)
--   - semanal: domingos 21:00 UTC = 18:00 Argentina (resumen de la semana)
--   - limpieza del registro de envíos: mensual.
--
-- Requiere: avisos-automaticos.sql, la función desplegada con
-- --no-verify-jwt, y el mismo secreto en dos lugares:
--   supabase secrets set CRON_SECRET=<secreto>                      (función)
--   select vault.create_secret('<secreto>', 'avisos_cron_secret');  (base)
-- El cron lo lee del Vault en cada corrida: nunca queda escrito en el job.
--
-- Para pausar todo: select cron.unschedule('avisos-diario'); (y los otros dos)

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.llamar_avisos_automaticos(p_modo text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url     := 'https://gctymjhblvocvaenmdhr.supabase.co/functions/v1/avisos-automaticos?modo=' || p_modo,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function public.llamar_avisos_automaticos(text) from public, anon, authenticated;

select cron.schedule('avisos-diario',   '0 22 * * *', $$ select public.llamar_avisos_automaticos('diario') $$);
select cron.schedule('avisos-semanal',  '0 21 * * 0', $$ select public.llamar_avisos_automaticos('semanal') $$);
select cron.schedule('avisos-limpieza', '0 4 1 * *',  $$ delete from public.avisos_automaticos_log where enviado_en < now() - interval '60 days' $$);
