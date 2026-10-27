-- supabase/demo-al-dia.sql
--
-- Pone al día los datos del "Colegio Demo tribbu": la cuenta demo
-- (demo@tribbu.app, María, mamá de Sofía y Room Parent de "3°A - Primaria")
-- la usan el revisor de App Store y las capturas de las tiendas
-- (specs/capturas-de-tienda-al-dia.md). Los datos tienen fechas, y sin esto Hoy
-- se vacía a las pocas semanas.
--
-- Todo queda relativo a hoy (hora de Argentina):
--   - eventos: reunión de padres (+2 hábiles), cumple de Mateo con invitación
--     pendiente (+4), salida al Planetario (+8 hábiles), muestra de arte con
--     confirmación de asistencia (+12 hábiles), clase abierta (+19 hábiles);
--   - cumpleaños: Mateo cumple el día de su festejo y el resto se reparte en
--     los meses que siguen;
--   - 3 avisos recientes sin leer para María;
--   - colecta abierta (vence en 10 días) con el pago de Sofía pendiente;
--   - autorización del Planetario y encuesta abiertas, sin responder por María;
--   - menú del comedor desde el lunes de esta semana (6 semanas hábiles);
--   - Lost & Found y Marketplace recientes.
-- Lo que se haya creado en el curso demo fuera de este set (pruebas del
-- revisor o de QA) se borra, así que dos corridas el mismo día dejan el mismo
-- estado. No toca normas_chat_aceptadas (el revisor tiene que poder ver las
-- normas del chat) ni a ningún otro colegio: todo filtra por id.
--
-- Correr con: npx supabase db query --linked -f supabase/demo-al-dia.sql
--
-- Ids: colegio 6dbee020-f43a-4ccb-9992-1c02d5efef0b,
--      curso   f2290440-16f4-48bc-b82d-cb3335b4b686,
--      María   31a9a50c-978f-4752-83c6-769ec5efb3f0.

begin;

create or replace function pg_temp.hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Sábado o domingo → el lunes siguiente.
create or replace function pg_temp.habil(d date) returns date
language sql immutable as $$
  select d + case extract(isodow from d)::int when 6 then 2 when 7 then 1 else 0 end
$$;

-- Fecha de nacimiento de un chico nacido en `anio` que cumple años en `d`.
create or replace function pg_temp.nacido(anio int, d date) returns date
language sql immutable as $$
  select (d - make_interval(years => extract(year from d)::int - anio))::date
$$;

-- ── Eventos ──────────────────────────────────────────────────────────────────

delete from eventos
where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686'
  and id not in (
    '9be3fd55-c94d-4c7b-9fa0-c381c0f7c696', '6ecf2503-0253-44e3-ba86-d2637daab841',
    'e25601a7-6938-4b16-9a2f-590e82a8f717', '570d938c-c2cf-4307-a90a-32e8326e53f8',
    'd8e9c1b4-2f00-4963-b69f-be15b48d80bc');

update eventos set fecha = pg_temp.habil(pg_temp.hoy() + 2), fecha_fin = null, hora = '18:00', tipo = 'dia_especial',
  titulo = 'Reunión de padres 3°A', lugar = 'Aula 3°A',
  descripcion = 'Repasamos cómo viene el año y los proyectos del trimestre.'
where id = '9be3fd55-c94d-4c7b-9fa0-c381c0f7c696';

update eventos set fecha = pg_temp.hoy() + 4, fecha_fin = null, hora = '16:00'
where id = 'd8e9c1b4-2f00-4963-b69f-be15b48d80bc';

update eventos set fecha = pg_temp.habil(pg_temp.hoy() + 8), fecha_fin = null, hora = '09:00'
where id = '6ecf2503-0253-44e3-ba86-d2637daab841';

update eventos set fecha = pg_temp.habil(pg_temp.hoy() + 12), fecha_fin = null, hora = '10:00', tipo = 'acto',
  confirma_asistencia = true, titulo = 'Muestra de arte del 3°A', lugar = 'Salón de actos',
  descripcion = 'Los chicos de 3°A muestran los trabajos del trimestre. ¡Las familias están invitadas!'
where id = 'e25601a7-6938-4b16-9a2f-590e82a8f717';

update eventos set fecha = pg_temp.habil(pg_temp.hoy() + 19), fecha_fin = null, hora = '09:30', tipo = 'dia_especial',
  todo_el_dia = false, titulo = 'Clase abierta de Educación Física', lugar = 'Patio del colegio',
  descripcion = 'Las familias pueden acompañar la clase desde el patio.'
where id = '570d938c-c2cf-4307-a90a-32e8326e53f8';

-- Invitación al cumple de Mateo sin responder para Sofía, y sin respuestas de
-- María a ningún evento del curso.
update evento_asistencia set asiste = 'pendiente', comentario = null, adultos = null, hermanos = null, hermanos_edades = null
where evento_id = 'd8e9c1b4-2f00-4963-b69f-be15b48d80bc' and alumno_invitado_id = 'd53b24d7-d179-4997-a730-0d39c1bdf51c';

delete from evento_asistencia
where usuario_id = '31a9a50c-978f-4752-83c6-769ec5efb3f0'
  and evento_id in (select id from eventos where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686');

-- ── Cumpleaños ───────────────────────────────────────────────────────────────

update hijos set fecha_nacimiento = pg_temp.nacido(2018, pg_temp.hoy() + 4)   where id = 'b7688e23-e03e-4074-b476-7602d9f77330'; -- Mateo
update hijos set fecha_nacimiento = pg_temp.nacido(2018, pg_temp.hoy() + 26)  where id = 'd53b24d7-d179-4997-a730-0d39c1bdf51c'; -- Sofía
update hijos set fecha_nacimiento = pg_temp.nacido(2018, pg_temp.hoy() + 41)  where id = 'ae73e6f7-af84-4f2c-ab4d-809aaf766201'; -- Catalina
update hijos set fecha_nacimiento = pg_temp.nacido(2018, pg_temp.hoy() + 63)  where id = 'fca15204-3a40-4ba3-99bc-a60e040e556a'; -- Valentina
update hijos set fecha_nacimiento = pg_temp.nacido(2018, pg_temp.hoy() + 95)  where id = 'db854bd2-57e1-44f7-bba0-264e3d2a9861'; -- Tomás
update hijos set fecha_nacimiento = pg_temp.nacido(2019, pg_temp.hoy() + 130) where id = '335458a5-9c54-479c-8f51-5006bd82c1e4'; -- Benjamín

-- ── Avisos ───────────────────────────────────────────────────────────────────

delete from recordatorios
where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686'
  and id not in ('8a717c6c-cf68-479a-99d3-f7e6aae7f338', 'f08fcfee-93de-4a19-92b2-65358ef1a74d', '2865b03a-0ac2-4260-80b1-4784555c7582');

update recordatorios set fecha = null, creado_en = now() - interval '1 day 3 hours'
where id = '8a717c6c-cf68-479a-99d3-f7e6aae7f338';

insert into recordatorios (id, curso_id, titulo, texto, emoji, tipo, prioridad, urgente, fecha, creado_en)
values
  ('f08fcfee-93de-4a19-92b2-65358ef1a74d', 'f2290440-16f4-48bc-b82d-cb3335b4b686',
   'Traer delantal para la muestra de arte',
   'El día de la muestra los chicos pintan en el aula: mandá un delantal o una remera vieja con su nombre.',
   '🎨', 'general', 'media', false, pg_temp.habil(pg_temp.hoy() + 12), now() - interval '3 hours'),
  ('2865b03a-0ac2-4260-80b1-4784555c7582', 'f2290440-16f4-48bc-b82d-cb3335b4b686',
   'Temario de la reunión de padres',
   'Vamos a hablar de la salida al Planetario, la muestra de arte y cómo sigue el año. Los esperamos en el aula de 3°A.',
   '📋', 'general', 'alta', false, pg_temp.habil(pg_temp.hoy() + 2), now() - interval '5 hours')
on conflict (id) do update set
  titulo = excluded.titulo, texto = excluded.texto, emoji = excluded.emoji, tipo = excluded.tipo,
  prioridad = excluded.prioridad, urgente = excluded.urgente, fecha = excluded.fecha,
  creado_en = excluded.creado_en, para_usuario_id = null, creado_por = null;

delete from recordatorio_leidos
where usuario_id = '31a9a50c-978f-4752-83c6-769ec5efb3f0'
  and recordatorio_id in (select id from recordatorios where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686');

-- ── Colecta ──────────────────────────────────────────────────────────────────

delete from colectas
where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686' and id <> 'e2c6bfe7-5844-429d-b4f7-ff3818362330';

update colectas set titulo = 'Regalo para la seño Laura', activa = true,
  fecha_limite = pg_temp.hoy() + 10, vencimiento = pg_temp.hoy() + 10
where id = 'e2c6bfe7-5844-429d-b4f7-ff3818362330';

update colecta_pagos set estado = 'pendiente', fecha_pago = null, pagado_por = null
where colecta_id = 'e2c6bfe7-5844-429d-b4f7-ff3818362330' and alumno_id = 'd53b24d7-d179-4997-a730-0d39c1bdf51c';

-- ── Autorización ─────────────────────────────────────────────────────────────

delete from autorizaciones
where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686' and id <> 'c71e78f4-058f-4c3e-bbc1-a976933a4f7e';

update autorizaciones set fecha_evento = pg_temp.habil(pg_temp.hoy() + 8), fecha_limite = pg_temp.habil(pg_temp.hoy() + 5)
where id = 'c71e78f4-058f-4c3e-bbc1-a976933a4f7e';

delete from autorizacion_respuestas where autorizacion_id = 'c71e78f4-058f-4c3e-bbc1-a976933a4f7e';

-- ── Encuesta ─────────────────────────────────────────────────────────────────

delete from encuestas
where curso_id = 'f2290440-16f4-48bc-b82d-cb3335b4b686' and id <> '37094aa9-b9fc-4b2d-aa3b-f419f4bcc00c';

update encuestas set pregunta = '¿Qué día prefieren para el picnic del curso?', fecha_cierre = pg_temp.hoy() + 7,
  cerrada_manual = false, eliminada_en = null
where id = '37094aa9-b9fc-4b2d-aa3b-f419f4bcc00c';

-- Opciones: el viernes, sábado y domingo de dentro de dos semanas.
with v as (
  select pg_temp.hoy() + 14 + ((5 - extract(isodow from pg_temp.hoy() + 14)::int + 7) % 7) as viernes
)
update encuesta_opciones o set texto = x.dia || ' ' || to_char(x.fecha, 'FMDD/FMMM')
from (
  select 0 as orden, 'Viernes' as dia, viernes as fecha from v
  union all select 1, 'Sábado', viernes + 1 from v
  union all select 2, 'Domingo', viernes + 2 from v
) x
where o.encuesta_id = '37094aa9-b9fc-4b2d-aa3b-f419f4bcc00c' and o.orden = x.orden;

delete from encuesta_votos
where encuesta_id = '37094aa9-b9fc-4b2d-aa3b-f419f4bcc00c' and usuario_id = '31a9a50c-978f-4752-83c6-769ec5efb3f0';

-- ── Menú del comedor ─────────────────────────────────────────────────────────
-- Los platos del colegio demo, en orden, desde el lunes de esta semana (5 por
-- semana). En dos pasos para no chocar con (colegio_id, fecha, niveles_clave).

update menu set fecha = fecha + 100000 where colegio_id = '6dbee020-f43a-4ccb-9992-1c02d5efef0b';

with orden as (
  select id, (row_number() over (order by fecha, id) - 1)::int as n
  from menu where colegio_id = '6dbee020-f43a-4ccb-9992-1c02d5efef0b'
)
update menu m set fecha = date_trunc('week', pg_temp.hoy())::date + (o.n / 5) * 7 + (o.n % 5)
from orden o where m.id = o.id;

-- ── Lost & Found y Marketplace ───────────────────────────────────────────────

update objetos_perdidos set fecha = pg_temp.hoy() - 1, creado_en = now() - interval '1 day', vence_en = now() + interval '30 days',
  estado = 'abierto', resuelto_en = null
where id = '5ea63837-aeac-4b9e-a58c-87e0e9d2fe56'; -- encontrado: campera azul

update objetos_perdidos set fecha = pg_temp.hoy() - 2, creado_en = now() - interval '2 days', vence_en = now() + interval '30 days',
  estado = 'abierto', resuelto_en = null
where id = 'ab4ae436-5b5a-413f-80d7-8bfa280eb6c6'; -- perdido: botella térmica

update marketplace_articulos set creado_en = now() - interval '3 days', vence_en = now() + interval '60 days',
  estado = 'disponible', comprador_id = null, vendido_en = null
where id in ('f4103584-7cf6-4674-b996-42fd6fd9d0a4', '8d655b63-01ea-4e63-90be-75299eb49bf0');

commit;
