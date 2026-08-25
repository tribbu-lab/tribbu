---
title: Identificar comunicaciones del colegio
status: implemented
priority: low
---

## Summary

Hoy un recordatorio publicado por Super Admin vía "Comunicaciones" (multi-
curso, oficial, hacia uno o varios cursos a la vez) se ve exactamente igual
en el Muro, en Recordatorios y en Notificaciones que un recordatorio normal
publicado por un Room Parent en su propio curso — no hay ninguna forma de
distinguirlos a simple vista. La base de datos ya guarda esa diferencia
(`recordatorios.grupo_id` no nulo = viene de una comunicación multi-curso
de Super Admin; `null` = recordatorio normal, como siempre), así que esta
feature es puramente de presentación: mostrar una etiqueta "🏫 Comunicación
del colegio" en la card de cualquier recordatorio con `grupo_id`, y agregar
un filtro por origen en el listado de Recordatorios.

## Acceptance Criteria

- [x] Badge "🏫 Comunicación del colegio" visible en la card de cualquier
      recordatorio con `grupo_id` no nulo, en las tres pantallas donde hoy
      se listan recordatorios: Recordatorios, Muro (agenda/pendientes) y
      Notificaciones — web y mobile (6 archivos). *(QA visual en vivo
      completada con una cuenta real de apoderado contra la comunicación
      real "Jornada Docente. Suspensión de clases" — `grupo_id` no nulo:
      badge visible en Recordatorios (junto con el filtro por origen
      funcionando: filtrar por "🏫 Comunicaciones del colegio" devuelve
      exactamente esa fila), en el panel de Notificaciones, y en la
      sección "RECORDATORIOS" del Muro al marcarla temporalmente como no
      leída — se revirtió el estado de lectura a "leído" al terminar, sin
      dejar cambios. Mobile no se QA'ó visualmente — solo web.)*
- [x] Un recordatorio normal (`grupo_id` nulo) no muestra ningún badge
      nuevo — cero cambio visual respecto a hoy. *(El badge está detrás de
      `r.grupo_id &&`/`item.grupo_id &&` en los 6 archivos, sin ningún
      otro cambio a la rama por defecto.)*
- [x] Recordatorios (web y mobile) gana un filtro por origen junto a los
      filtros existentes (rango de fecha / prioridad / leído): "Todos" /
      "Comunicaciones del colegio" / "Recordatorios normales".
- [x] No se toca el modelo de datos — `grupo_id` ya existe y ya viene en
      los `select("*")` de las tres pantallas, así que no hace falta tocar
      ninguna query.
- [x] `npm run lint`, `npm run build`, `cd mobile && npm run lint` y
      `npx expo export -p ios` pasan. *(Los 4 comandos corrieron limpios;
      el lint de la raíz reporta ~1490 errores preexistentes en archivos
      no tocados por este cambio — mismo baseline ya documentado en
      sesiones anteriores, sin ningún error nuevo en los 3 archivos
      web tocados.)*

## Technical Notes

- **Sin SQL, sin cambios de query.** `recordatorios.grupo_id` ya existe
  (`comunicaciones-multi-curso.md`) y las tres pantallas ya hacen
  `select("*")` sobre `recordatorios`, así que el dato ya está disponible
  en cada `r` — el trabajo es 100% de render + un filtro.
- **Web — `src/features/recordatorios/index.jsx`**: agregar el badge en
  la fila de tags de cada card (línea ~285-295, junto al `tagDeCurso`
  existente y antes/después de `fmtRangoHora`), mismo patrón de pill que
  ya usan "Regalo"/"Colecta"/"Urgente":
  `{r.grupo_id&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#EEF2FF",color:"#6366F1"}}>🏫 Comunicación del colegio</span>}`.
  Filtro: seguir el patrón manual ya usado por `filtroRango`/`filtroPrio`/
  `filtroLeido` (un `useState` + `<select>` más, no introducir
  `useListControls` en este archivo ya que el resto de filtros no lo usa).
- **Web — `src/features/muro/index.jsx`** y **`src/features/notificaciones/index.jsx`**:
  mismo badge en la fila de recordatorios pendientes/agenda y en la lista
  de notificaciones, reusando el mismo estilo inline (no crear un
  componente compartido nuevo para un solo `<span>`).
- **Mobile — `mobile/features/recordatorios/index.jsx`**, **`mobile/features/muro/index.jsx`**,
  **`mobile/features/notificaciones/index.jsx`**: mismo badge vía `<Text>`/
  `StyleSheet`, siguiendo el estilo de badges "A3" ya usado ahí (soft pill,
  sin sombra). Filtro por origen en mobile: agregar como una opción más al
  selector de filtros existente en Recordatorios (chip + `Sheet`, patrón
  ya documentado en CLAUDE.md para `features/recordatorios`).
- [skill: vercel-react-best-practices] — el badge es una expresión
  derivada de `r.grupo_id`, no necesita estado ni memoización propia; no
  agregar un `useMemo` innecesario para un booleano tan barato de calcular
  inline en el render de cada card.

## Out of Scope

- Cualquier cambio al modelo de datos o a cómo se crea una comunicación
  (`comunicaciones-multi-curso.md` sigue siendo la fuente de verdad de
  ese flujo).
- Vincular recordatorios a una fila de `eventos` (`evento_id`) — esta
  feature usa el origen (Room Parent vs Super Admin vía `grupo_id`) como
  la única señal, no una relación nueva con el calendario.
- Agrupar/separar visualmente las comunicaciones del colegio en su propia
  sección del Muro — se descartó a favor de solo un filtro en
  Recordatorios (ver respuesta del usuario).
- Historial o auditoría de comunicaciones (ya cubierto por
  `HistorialComunicaciones` en Super Admin).
