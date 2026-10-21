-- Cargo de un directivo por nivel (2026-10-21, specs/roles-por-nivel.md):
-- "Dirección", "Secretaría", "Coordinación"… Solo se muestra ("Dirección ·
-- Primaria"); los permisos son los mismos para todos (rol nivel_admin).
-- Aditivo e idempotente. null = "Secretaría" (las cuentas creadas antes).
alter table public.usuarios add column if not exists cargo text;
