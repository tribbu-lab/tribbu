---
title: Comunicados con formato y membrete
status: draft — falta que Yanina responda las preguntas abiertas
priority: medium
---

## Summary

Hoy un comunicado (`recordatorios.texto`, opcionalmente con `titulo` y hasta 3
adjuntos) es texto plano. Yanina pidió poder "editarlo para poner membretes":
que el colegio mande un comunicado con su encabezado institucional y algo de
formato, no solo texto corrido.

## Propuesta

Dos partes, independientes:

### 1. Membrete del colegio (automático, sin editor)

- Un comunicado del colegio (Comunicaciones del Super Admin, `grupo_id` o
  `creado_por` colegio) se muestra con un **encabezado**: logo del colegio
  (`colegios.logo_url`, ya existe) + nombre + (opcional) una línea de texto
  del membrete ("Nivel Primario · Ciclo lectivo 2026") y, abajo, una **firma**
  opcional ("Dirección de Primaria").
- Se configura una vez en Super Admin → Colegio (`colegios.membrete_linea`,
  `colegios.membrete_firma`) y se elige por comunicado con un tilde
  "Con membrete" (`recordatorios.con_membrete boolean default false`).
- Se ve igual en web y mobile (Avisos, Inicio → Novedades al abrir) y en el
  PDF/impresión si más adelante se agrega.

### 2. Formato del texto (editor liviano)

Sin dependencias nuevas (regla de la casa): nada de Quill/TipTap/Draft.

- El cuerpo se guarda como **Markdown acotado** en `recordatorios.texto`
  (sigue siendo texto: un comunicado viejo se ve igual). Soportado: negrita
  `**…**`, cursiva `_…_`, títulos `## …`, listas `- …` / `1. …`, links
  `[texto](url)` (pasados por `safeUrl`) y saltos de línea.
- Editor: el mismo `textarea` con una barrita de botones (B, I, Título,
  Lista, Link) que insertan la marca alrededor de la selección, y una pestaña
  "Vista previa".
- Render: un parser propio y chico en `src/lib/formato.js` (`@shared/formato`)
  que devuelve **nodos** (no HTML): web los dibuja con elementos React y
  mobile con `<Text>` anidados. Nunca `dangerouslySetInnerHTML` (XSS).
- **Push**: el texto de la notificación se manda sin marcas
  (`textoPlano(md)`), recortado como hoy.
- **Calendario (ICS)**: `calendar-feed` usa `textoPlano` para la DESCRIPTION.
- **Mensajes, Muro, búsqueda global**: vista previa con `textoPlano`.

### Alternativa (si se prefiere): membrete como imagen

El colegio sube su membrete como imagen (PNG/JPG ancho) y se muestra arriba
del comunicado. Más simple, pero no se adapta al modo oscuro ni a pantallas
angostas y pesa más. Se puede sumar a la parte 1 como "imagen de encabezado".

## Preguntas abiertas para Yanina

1. "Membrete" = ¿el encabezado con logo/nombre del colegio (parte 1), el
   formato del texto (parte 2), o las dos? ¿Tenés un ejemplo de un comunicado
   en papel/PDF de un colegio?
2. ¿Quién puede usar formato: solo el colegio, o también la Room Parent y las
   docentes en sus avisos?
3. ¿Hace falta **color** de texto, tablas o imágenes intercaladas? (Propuesta:
   no; las imágenes siguen como adjuntos.)
4. ¿El membrete cambia por nivel (Dirección de Primaria vs. de Inicial)? Se
   resuelve junto con `specs/roles-por-nivel.md`.
5. ¿Hace falta poder **descargar/imprimir** el comunicado con el membrete
   (PDF)? (Propuesta: fuera de esta etapa.)

## Acceptance Criteria

- [ ] Comunicado con "Con membrete" muestra logo + nombre + línea + firma del
      colegio en web y mobile; uno sin tilde se ve como hoy.
- [ ] Negrita, cursiva, títulos, listas y links se ven bien en web y mobile;
      un comunicado viejo (texto plano) se ve idéntico a antes.
- [ ] El push y el calendario muestran el texto sin marcas.
- [ ] Ningún render usa HTML crudo; los links pasan por `safeUrl`.
- [ ] Sin dependencias nuevas; parser con casos de prueba en el propio spec.
- [ ] Lint + build web, lint mobile + `npx expo export -p ios`, CLAUDE.md.

## Out of Scope

- Editor WYSIWYG completo (estilo Word), fuentes, colores, tablas.
- PDF del comunicado.
- Formato en Mensajes (chat).
