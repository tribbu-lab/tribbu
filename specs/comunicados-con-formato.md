---
title: Comunicados con formato y membrete
status: implementado (2026-10-21) — falta QA visual y deploy de calendar-feed
priority: medium
---

## Summary

Hoy un comunicado (`recordatorios.texto`, opcionalmente con `titulo` y hasta 3
adjuntos) es texto plano. Yanina pidió poder "editarlo para poner membretes".
Se hacen las dos cosas: un **membrete** institucional (encabezado + firma) y
**formato** en el texto (negrita, títulos, listas, links).

## Decisiones de Yanina (2026-10-21)

1. Membrete = **las dos cosas**: encabezado con logo/nombre/firma del colegio
   y formato en el texto.
2. El formato lo usan **todos** los que publican avisos (colegio, Secretaría,
   Room Parent, maestras, familias).
3. Las fotos siguen como **adjuntos** (nada de imágenes intercaladas, colores
   ni tablas).
4. El membrete **puede variar por nivel** (firma "Secretaría · Primaria"):
   depende de `specs/roles-por-nivel.md`.
5. **Sin PDF** por ahora.

## Diseño

### 1. Membrete del colegio

- Solo para comunicados que publica el colegio (administrador o Secretaría):
  tilde "Con membrete" en `ComunicacionesAdmin` (web + mobile),
  `recordatorios.con_membrete boolean not null default false`.
- Se configura una vez en Super Admin → Colegio: `colegios.membrete_linea`
  (p. ej. "Ciclo lectivo 2026") y `colegios.membrete_firma` (p. ej.
  "Dirección"). Por nivel: `colegios.membrete_niveles jsonb` (`{primaria:
  {linea, firma}}`, opcional); el comunicado usa el de su nivel si existe y
  si no el general. Se arma con `membreteDe(colegio, nivel)` en
  `@shared/formato`.
- Se ve: arriba el logo (`colegios.logo_url`, `<SignedImg>`/`<SignedImage>`)
  + nombre + línea; abajo la firma. Sobrio (gris, sin colores nuevos). En
  Avisos (al abrir la tarjeta) y en Inicio → Novedades al abrir; en las
  listas solo se ve el título como hoy.

### 2. Formato del texto

Sin dependencias nuevas (regla de la casa).

- El cuerpo se guarda como **Markdown acotado** en `recordatorios.texto`
  (sigue siendo texto: los comunicados viejos se ven igual). Soportado:
  negrita `**…**`, cursiva `_…_`, títulos `## …`, listas `- …` / `1. …`,
  links `[texto](url)` (por `safeUrl`) y saltos de línea.
- Editor: el mismo campo de texto con una barrita (B, I, Título, Lista, Link)
  que inserta la marca alrededor de lo seleccionado + "Vista previa". Web
  (`textarea`, selección con `selectionStart/End`) y mobile (`TextInput`,
  `onSelectionChange`). En Recordatorios (todos) y Comunicaciones del colegio.
- Render: parser propio y chico `src/lib/formato.js` (`@shared/formato`) que
  devuelve **nodos** (no HTML): web los dibuja con elementos React
  (`TextoConFormato`) y mobile con `<Text>` anidados. Nunca
  `dangerouslySetInnerHTML`.
- Texto sin marcas (`textoPlano(md)`) en: push (send-push recibe el título o
  el texto: el cliente lo limpia antes), calendario ICS (`calendar-feed`,
  redeploy), vistas previas (Inicio, campana, búsqueda global, lecturas) y la
  búsqueda/filtrado.

## Acceptance Criteria

- [x] Comunicado del colegio con "Con membrete" muestra logo + nombre +
      línea + firma (la del nivel si la hay) en web y mobile; sin el tilde se
      ve como hoy.
- [ ] Negrita, cursiva, títulos, listas y links se ven bien en web y mobile
      para cualquier autor (parser probado con 26 casos; falta mirarlo en la
      app). Un comunicado viejo se ve igual, salvo que sus líneas que empiezan
      con "- " o "1. " ahora se dibujan como lista.

## Implementación (2026-10-21)

- Lógica pura en `src/lib/formato.js` (`@shared/formato`): `bloquesDeTexto`,
  `partesDeLinea`, `textoPlano`, `tieneFormato`, `aplicarMarca`,
  `BOTONES_FORMATO`, `membreteDe`. Copia de `textoPlano` en
  `supabase/functions/_shared/textoPlano.ts` (calendar-feed).
- Web: `TextoConFormato`, `EditorFormato` (el botón Link inserta
  `[texto](https://)` con la dirección seleccionada: `window.prompt` no
  aparece en navegadores embebidos), `Membrete`; hook `useMembretes`.
  Mobile: los mismos en `mobile/components` + `mobile/lib/useMembretes.js`.
- El texto se muestra con formato al abrir el aviso (Avisos, web y mobile);
  cerrado y en el resto de la app (Inicio, campana, búsqueda, calendario,
  historial del colegio, lecturas, push) va `textoPlano`.
- Membrete: tilde "Con membrete del colegio" en Comunicaciones (web y panel
  mobile, prendido por defecto); se configura en Super Admin → Colegio →
  "Membrete de los comunicados" (línea + firma, y por nivel si el colegio tiene
  más de uno). SQL `supabase/comunicados-formato.sql` (aplicado).
- [x] Push, calendario y vistas previas muestran el texto sin marcas.
- [x] Ningún render usa HTML crudo; los links pasan por `safeUrl`.
- [x] Sin dependencias nuevas.
- [x] Lint + build web, lint mobile + `npx expo export -p ios`, CLAUDE.md.

## Out of Scope

- Editor WYSIWYG completo, fuentes, colores, tablas, imágenes intercaladas.
- PDF / impresión del comunicado.
- Formato en Mensajes (chat).
