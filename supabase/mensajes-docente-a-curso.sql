-- supabase/mensajes-docente-a-curso.sql — La docente le escribe a todo el curso
-- (2026-10-27, pedido de Yanina).
--
-- enviar_a_curso_docente(curso, texto, fotos): el mismo mensaje a la familia
-- de cada alumno del curso, cada una en su chat privado con la docente (tipo
-- `docente`, uno por alumno × maestra, como hoy). Las respuestas son privadas.
-- Solo la docente que da clase en ese curso (maestro_cursos, igual que
-- alumnos_para_docente). Alumnos sin apoderado vinculado se saltean. Fotos:
-- las mismas reglas que enviar_difusion (hasta 3, solo rutas propias de
-- mensajes/difusion/<yo>/). El push sale por el trigger de cada mensaje.
--
-- `p_hijos` (opcional, 2026-10-27): solo a las familias de esos alumnos del
-- curso ("Mensaje a varias familias": la docente destilda los que no van).
-- null = todo el curso. Los que no son del curso se ignoran.
--
-- Correr después de mensajes-docentes.sql y mensajes-fotos.sql. Idempotente.

drop function if exists public.enviar_a_curso_docente(uuid, text, jsonb);
create or replace function public.enviar_a_curso_docente(
  p_curso uuid, p_texto text, p_fotos jsonb default '[]'::jsonb, p_hijos uuid[] default null
)
returns table (enviados int, omitidos int)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  yo uuid := public.mi_usuario_id();
  v_maestro uuid; h record; v_conv uuid; n_ok int := 0; n_total int := 0;
  t text := left(btrim(coalesce(p_texto, '')), 2000);
  f jsonb := coalesce(p_fotos, '[]'::jsonb);
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  select m.id into v_maestro
    from public.maestros m join public.maestro_cursos mc on mc.maestro_id = m.id
   where m.usuario_id = yo and mc.curso_id = p_curso
   limit 1;
  if v_maestro is null then raise exception 'No das clase en ese curso'; end if;
  if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) > 3 then
    raise exception 'Podés mandar hasta 3 fotos';
  end if;
  if exists (
    select 1 from jsonb_array_elements(f) x
    where jsonb_typeof(x) <> 'string'
       or not starts_with(x #>> '{}', 'mensajes/difusion/' || yo::text || '/')
  ) then
    raise exception 'Foto no válida';
  end if;
  if t = '' and jsonb_array_length(f) = 0 then raise exception 'Escribí el mensaje'; end if;
  if p_hijos is not null and coalesce(array_length(p_hijos, 1), 0) = 0 then raise exception 'Elegí al menos un alumno'; end if;

  for h in
    select hi.id from public.hijos hi
     where hi.curso_id = p_curso
       and (p_hijos is null or hi.id = any(p_hijos))
       and exists (select 1 from public.usuario_hijos uh where uh.hijo_id = hi.id)
  loop
    n_total := n_total + 1;
    begin
      v_conv := public.abrir_conversacion_docente(h.id, v_maestro);
      insert into public.mensajes (conversacion_id, texto, fotos) values (v_conv, nullif(t, ''), f);
      n_ok := n_ok + 1;
    exception when others then
      null; -- se cuenta como omitido
    end;
  end loop;
  return query select n_ok, n_total - n_ok;
end $$;
revoke all on function public.enviar_a_curso_docente(uuid, text, jsonb, uuid[]) from public, anon;
grant execute on function public.enviar_a_curso_docente(uuid, text, jsonb, uuid[]) to authenticated;
