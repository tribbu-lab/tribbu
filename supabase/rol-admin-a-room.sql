-- =============================================================================
-- rol-admin-a-room.sql · Renombra el rol interno "admin" (Room Parent) a "room"
-- =============================================================================
--
-- El label visible YA era "Room Parent" en toda la UI (ROL_LABEL en
-- src/lib/theme.js) — este cambio es puramente el identificador que se
-- guarda en la base y se compara en RLS/código, no un cambio de producto.
-- Motivo: "admin" en el nombre se prestaba a confusión ahora que existen
-- `super` (plataforma) y `colegio_admin` (un colegio) — "admin" a secas
-- quedaba ambiguo entre "Room Parent" y "alguien que administra algo".
--
-- Alcance real (relevado con grep sobre supabase/*.sql antes de escribir
-- esto — ver el commit que trae este archivo para el detalle): el valor
-- 'admin' de rol se guarda en DOS tablas (usuarios.rol y usuario_cursos.rol)
-- pero se COMPARA en RLS en un solo lugar: dentro de las funciones
-- es_admin_curso()/es_admin_any() (rls-hardening.sql) — el resto de las ~30
-- policies del proyecto llaman a esas dos funciones por nombre, no comparan
-- 'admin' directo, así que no hace falta tocarlas. Se agrega además
-- is_admin_or_super() — una función vieja, sin ninguna policy que la
-- referencie hoy (confirmado contra pg_policies), no versionada en ningún
-- .sql del repo, pero que compara 'admin' igual — se corrige por prolijidad
-- aunque esté huérfana.
--
-- Los NOMBRES es_admin_curso/es_admin_any/is_admin_or_super NO cambian
-- (decenas de policies ya los referencian por nombre en rls-hardening.sql y
-- multi-colegio.sql) — solo cambia qué valor comparan adentro.
--
-- Fuera de alcance a propósito (son otro namespace, no el rol de permisos):
-- el id de tab "admin" (Panel Admin / AdminPanel, TABS en App.jsx y
-- mobile/app/(tabs)/_layout.jsx) y nombres de variables/componentes/carpetas
-- (isAdmin, cursosAdmin, features/admin, AdminPanel, etc.) — renombrarlos no
-- cambia ningún dato ni ninguna policy, solo agregaría un diff enorme sin
-- beneficio funcional.

begin;

-- Dos intentos previos fallaron por el orden: update antes de agrandar la
-- constraint (viola la vieja, que no conoce 'room') y agrandar la
-- constraint sacando 'admin' antes de migrar los datos (viola la nueva,
-- que ya no lo conoce — Postgres valida las filas existentes al agregar un
-- CHECK). Solución: una constraint TRANSITORIA que permite ambos valores
-- mientras se migran los datos, recién al final la constraint definitiva
-- sin 'admin'.
alter table usuarios drop constraint usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol = any (array['padre'::text, 'admin'::text, 'room'::text, 'super'::text, 'colegio_admin'::text]));

update usuarios set rol = 'room' where rol = 'admin';
update usuario_cursos set rol = 'room' where rol = 'admin';

alter table usuarios drop constraint usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol = any (array['padre'::text, 'room'::text, 'super'::text, 'colegio_admin'::text]));

-- ¿el usuario actual es Room Parent del curso dado? (antes: rol='admin')
create or replace function public.es_admin_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_cursos uc
    join public.usuarios u on u.id = uc.usuario_id
    where u.auth_id = auth.uid() and uc.curso_id = p_curso and uc.rol = 'room'
  )
$$;

-- ¿el usuario actual es Room Parent de AL MENOS un curso? (antes: rol='admin')
create or replace function public.es_admin_any()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_cursos uc
    join public.usuarios u on u.id = uc.usuario_id
    where u.auth_id = auth.uid() and uc.rol = 'room'
  )
$$;

-- Huérfana (ninguna policy la usa hoy) pero se corrige igual — ver comentario arriba.
create or replace function public.is_admin_or_super()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select rol in ('room','super') from usuarios where auth_id = auth.uid() limit 1;
$$;

commit;
