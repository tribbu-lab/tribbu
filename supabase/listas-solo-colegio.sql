-- Útiles y libros: los carga el colegio; las familias los ven, los descargan y
-- marcan lo que ya tienen. Idempotente.
--
-- 1) Escritura solo para super, administrador del colegio y Secretaría del
--    nivel. Sale es_admin_curso (Room Parent): es un apoderado más para esto.
--    La lectura (utiles_select / libros_select) no cambia.
-- 2) Borrar un ítem borra también las marcas de las familias. Antes la FK era
--    NO ACTION y la RLS de *_adquirido solo deja borrar las marcas propias, así
--    que un ítem que otra familia ya había marcado no se podía borrar.

begin;

alter policy utiles_insert on public.utiles
  with check (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id));
alter policy utiles_update on public.utiles
  using (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))
  with check (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id));
alter policy utiles_delete on public.utiles
  using (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id));

alter policy libros_insert on public.libros
  with check (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id));
alter policy libros_update on public.libros
  using (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))
  with check (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id));
alter policy libros_delete on public.libros
  using (es_super() OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id));

alter table public.util_adquirido drop constraint if exists util_adquirido_util_id_fkey;
alter table public.util_adquirido
  add constraint util_adquirido_util_id_fkey foreign key (util_id) references public.utiles(id) on delete cascade;

alter table public.libro_adquirido drop constraint if exists libro_adquirido_libro_id_fkey;
alter table public.libro_adquirido
  add constraint libro_adquirido_libro_id_fkey foreign key (libro_id) references public.libros(id) on delete cascade;

commit;
