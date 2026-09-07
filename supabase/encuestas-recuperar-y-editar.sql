-- supabase/encuestas-recuperar-y-editar.sql
--
-- Tres cambios sobre encuestas.sql / encuestas-hardening.sql:
--
-- 1. Borrado suave: "Eliminar" ya no hace un DELETE — pone
--    encuestas.eliminada_en = now(). El creador o un admin del curso puede
--    recuperarla (poniéndolo en null) desde la pestaña "Eliminadas" si la
--    borró sin querer. No hace falta tocar RLS para esto: la policy
--    encuestas_update ya permite a creador/admin/super actualizar cualquier
--    columna de la fila (encuestas.sql:74-80).
--
-- 2. Reabrir: ya existía la policy para poner cerrada_manual en false (mismo
--    encuestas_update), pero la UI no ofrecía el botón — solo hacía falta
--    agregarlo en el cliente. Nada que correr acá.
--
-- 3. Editar opciones mientras la encuesta sigue abierta y todavía nadie
--    votó: encuestas.sql dejó encuesta_opciones sin policy de delete a
--    propósito ("no se editan opciones después de creada, ver Out of Scope").
--    Eso ahora cambia — agregamos la policy de delete, restringida a
--    creador/admin/super Y solo si la encuesta todavía no tiene ningún voto
--    (mismo chequeo que ya hace el cliente, pero server-side: sin esto el
--    DELETE de encuesta_opciones simplemente no borra nada por RLS
--    default-deny, dejando opciones viejas duplicadas junto a las nuevas).
--
-- Correr una sola vez en el SQL editor de Supabase, DESPUÉS de
-- encuestas.sql y encuestas-hardening.sql.

alter table public.encuestas
  add column if not exists eliminada_en timestamptz;

create policy encuesta_opciones_delete on public.encuesta_opciones for delete to authenticated
  using (
    (
      public.es_super()
      or exists (
        select 1 from public.encuestas e
        where e.id = encuesta_id
          and (e.creado_por = public.mi_usuario_id() or public.es_admin_curso(e.curso_id))
      )
    )
    and not exists (
      select 1 from public.encuesta_votos v where v.encuesta_id = encuesta_opciones.encuesta_id
    )
  );
