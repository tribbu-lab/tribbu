---
title: Perdidos y encontrados
status: implemented
priority: medium
---

## Summary

Cada semana se pierden camperas, loncheras, botellas y anteojos, y se
encuentran en el patio, en el micro o en la casa de un compañero. Hoy eso se
resuelve en grupos de WhatsApp que se llenan de fotos que nadie encuentra
después. **Perdidos y encontrados** deja que los apoderados publiquen lo que
buscan ("Perdí") y lo que encontraron ("Encontré"), y que el colegio publique
lo que tiene en su caja de objetos perdidos. Para que no se vuelva ruido: cada
publicación se ve solo en el curso (o, si quien publica lo elige, en todo el
colegio), vence sola a los 30 días o al marcarse "Resuelto", y al publicar no
se manda push a nadie. Cuando alguien reconoce algo ("¡Es mío!" / "Lo tengo
yo") se comparte el contacto de los dos y se avisa por push a quien publicó.
La app sugiere coincidencias ("¿Será este?") entre lo perdido y lo encontrado.

## Acceptance Criteria

- [x] Tabla `objetos_perdidos` (tipo perdido/encontrado, categoría, título,
      descripción, foto privada, lugar, fecha, alcance curso/colegio, curso,
      colegio, publicado por, `es_colegio`, estado abierto/resuelto,
      `vence_en` = +30 días) y `objeto_perdido_avisos` ("¡Es mío!" / "Lo tengo
      yo": quién, mensaje, cuándo; uno por usuario y publicación).
- [x] RLS: se ve lo del propio curso (alcance curso) o del colegio (alcance
      colegio), más lo propio; publicar requiere ser miembro del curso/colegio;
      `es_colegio` solo super/colegio_admin; editar/borrar/marcar resuelto:
      quien publicó, Room Parent del curso (moderación) o el colegio.
- [x] Contacto: `contacto_objeto_perdido(id)` (security definer) devuelve el
      contacto de quien publicó (o el del colegio si lo publicó el colegio)
      solo a quien avisó "¡Es mío!"/"Lo tengo yo"; quien publicó ve el
      contacto de cada uno que le avisó. Nunca se listan teléfonos.
- [x] Web: pestaña "Perdidos y encontrados" (nav, `?tab=perdidos`), pestañas
      Buscan / Encontrados, filtro por categoría, tarjeta con foto, "¡Es mío!" /
      "Lo tengo yo", "Resuelto", borrar (dueño/moderación), sugerencias
      "¿Será este?". Alta con foto opcional (obligatoria para "Encontré"),
      categoría, lugar, fecha y alcance (Mi curso / Todo el colegio).
- [x] Super Admin web: sección "🧦 Perdidos y encontrados" para publicar como
      colegio (alcance colegio o cursos) y moderar lo publicado en el colegio.
- [x] Mobile: pantalla equivalente (tile en Más), alta con foto de la cámara/
      galería.
- [x] Push solo al avisar ("¡Es mío!" / "Lo tengo yo", type `perdido`) y a los
      dueños de un "Perdí" que coincide con un "Encontré" nuevo del mismo
      alcance.
- [x] Resumen semanal (avisos-automaticos): "N objetos encontrados" en los
      cursos/colegio de la familia, dentro de la preferencia "Resumen de la
      semana".

## Technical Notes

- SQL `supabase/perdidos-y-encontrados.sql`; foto en el bucket privado
  `adjuntos` en `perdidos/<colegio_id>/…`, renderizada con `SignedImg` /
  `SignedImage`.
- Coincidencias y estados: `src/lib/perdidos.js` (`@shared/perdidos`), puro.
- Alcance por defecto "Mi curso"; en la vista "Todos" se elige el curso.
- Vencimiento: `vence_en` (30 días), filtrado en las consultas; no hace falta
  un job de limpieza.

## Out of Scope

- Mensajería dentro de la app (se comparte el contacto).
- Reconocimiento de imágenes / IA para coincidencias (son por categoría,
  alcance, fecha y palabras del título).
