-- supabase/menu-solo-colegio.sql — el menú del comedor lo carga solo el colegio
--
-- menu_insert/_update/_delete dejaban pasar `es_admin_any()` (ser Room Parent
-- de cualquier curso): un Room Parent de cualquier colegio podía cargar,
-- cambiar o borrar el menú de cualquier colegio. Es un resto de cuando el
-- Room Parent manejaba el menú; hoy lo carga el administrador del colegio (o
-- super) desde el panel. La Secretaría por nivel no (menú es de todo el
-- colegio, SOLO_ADMIN_COLEGIO). Lectura sin cambios.
--
-- Idempotente.

drop policy if exists menu_insert on public.menu;
create policy menu_insert on public.menu for insert to authenticated
  with check (public.es_super() or public.es_colegio_admin_de(colegio_id));

drop policy if exists menu_update on public.menu;
create policy menu_update on public.menu for update to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id))
  with check (public.es_super() or public.es_colegio_admin_de(colegio_id));

drop policy if exists menu_delete on public.menu;
create policy menu_delete on public.menu for delete to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id));
