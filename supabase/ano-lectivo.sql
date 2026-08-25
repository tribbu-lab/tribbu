-- Año lectivo / promoción de curso — specs/ano-lectivo-y-promocion-de-curso.md
-- Cada curso pertenece a un año lectivo concreto; colegio.año_lectivo_actual
-- es el único valor global que define "el año vigente" para toda la escuela.
-- Sin default de columna a propósito: cada curso nuevo declara su año
-- explícitamente en el formulario, no lo hereda de "cuándo se creó la fila".

alter table public.cursos add column if not exists año_lectivo int;
update public.cursos set año_lectivo = 2026 where año_lectivo is null;
alter table public.cursos alter column año_lectivo set not null;

alter table public.colegio add column if not exists año_lectivo_actual int;
update public.colegio set año_lectivo_actual = 2026 where año_lectivo_actual is null;
alter table public.colegio alter column año_lectivo_actual set not null;
