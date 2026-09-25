---
status: implemented
fecha: 2026-09-25
---

# Marketplace de cosas usadas (sección Comunidad)

## Qué es
Las familias venden o regalan cosas que ya no usan (uniformes, libros, útiles,
ropa, disfraces, juguetes). Vive dentro de una sección nueva **"🤝 Comunidad"**
que agrupa **Marketplace · Lost&Found · Servicios (próximamente)** y reemplaza
al ítem Lost&Found del menú.

Etapa 1 **sin pagos**: el pago lo arreglan comprador y vendedor. El modelo ya
guarda lo necesario para cobrar comisión más adelante con Mercado Pago
(`precio`, `moneda`, `estado`, `comprador_id`, `vendido_en`). Servicios va con
un fee por publicar, a cobrar desde la web (ver PENDIENTES → Comunidad).

## Decisiones (Yanina, 2026-09-25)
- Menú: una sección Comunidad con pestañas.
- Alcance: lo elige quien publica — su curso o todo el colegio (default colegio).
- Vigencia: 60 días, renovable; lo vendido se ve 7 días más, marcado.
- Web y app a la vez.

## Criterios de aceptación
- [x] Publicar con 1–3 fotos, qué es, categoría, estado (nuevo / como nuevo / usado), talle opcional, precio o "Lo regalo", detalle, alcance.
- [x] Grilla con foto, precio, título, curso; filtros por categoría, "Regalos", "Mis publicaciones" y búsqueda (título, detalle, talle, sin acentos).
- [x] "Me interesa" (con mensaje opcional) → push `marketplace` al vendedor y se comparte el contacto del vendedor; el vendedor ve la lista de interesados con sus contactos.
- [x] Las otras familias ven cuántos interesados hay, nunca quiénes.
- [x] El vendedor marca "Vendido" (opcionalmente a cuál interesado), renueva 60 días cuando faltan ≤10, o borra (se borran las fotos).
- [x] Moderan el autor y el colegio (super / colegio_admin), no la Room Parent.
- [x] El colegio publica y modera desde Super Admin → Comunidad → 🛍️ Marketplace (web).
- [x] Servicios muestra "Próximamente".
- [x] Push `marketplace` / `perdido` abren Comunidad en la pestaña correcta (web y app).

## Datos
`supabase/marketplace.sql`: `marketplace_articulos`, `marketplace_interesados`,
RLS por columnas de la fila, RPCs `contacto_articulo`, `interesados_articulo`,
`interesados_por_articulo` (solo conteos). Fotos: bucket privado `adjuntos`,
`marketplace/<colegio_id>/…`.

## Fuera de alcance (etapa 2)
Pagos con Mercado Pago y comisión; Servicios; Carpool.
