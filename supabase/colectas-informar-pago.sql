-- Colectas: la familia avisa que pagó, quien recauda confirma (2026-10-15).
--
-- colecta_pagos.estado: 'pendiente' | 'informado' (la familia avisó que
-- transfirió, falta que lo confirmen) | 'pagado' (confirmado por quien
-- gestiona la colecta: responsable, Room Parent, creador o el colegio).
-- Solo 'pagado' cuenta en lo recaudado.
--
-- Antes la RLS dejaba a una familia escribir cualquier estado de los pagos de
-- sus hijos (la app no lo ofrecía, pero se podía pedir directo a la API). Ahora:
-- la familia solo puede poner 'informado' o 'pendiente' y no puede tocar un
-- pago ya confirmado; quien gestiona la colecta, todo como antes.

drop policy if exists colecta_pagos_insert on public.colecta_pagos;
create policy colecta_pagos_insert on public.colecta_pagos for insert to authenticated
  with check (
    public.puede_gestionar_colecta_id(colecta_id)
    or (public.es_miembro_curso_de_colecta(colecta_id) and public.es_padre_de(alumno_id)
        and estado in ('informado', 'pendiente'))
  );

drop policy if exists colecta_pagos_update on public.colecta_pagos;
create policy colecta_pagos_update on public.colecta_pagos for update to authenticated
  using (
    public.puede_gestionar_colecta_id(colecta_id)
    or (public.es_padre_de(alumno_id) and estado <> 'pagado')
  )
  with check (
    public.puede_gestionar_colecta_id(colecta_id)
    or (public.es_miembro_curso_de_colecta(colecta_id) and public.es_padre_de(alumno_id)
        and estado in ('informado', 'pendiente'))
  );

drop policy if exists colecta_pagos_delete on public.colecta_pagos;
create policy colecta_pagos_delete on public.colecta_pagos for delete to authenticated
  using (
    public.puede_gestionar_colecta_id(colecta_id)
    or (public.es_padre_de(alumno_id) and estado <> 'pagado')
  );
