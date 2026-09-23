# Pendientes de tribbu

Lista viva de lo que queda por hacer (última actualización: 2026-09-23).
Tachá o borrá cada ítem cuando se resuelva.

## Para hacer a mano (no requiere código)

- [ ] **Release a las tiendas 1.7.0.** Todo lo del 2026-09-23 está en la web pero
      no en la app publicada (autorizaciones, confirmación de lectura, título y
      horario en avisos, selector de colegio del Super Admin, botón atrás,
      festejos solo para invitados en pantalla, etc.). Subir `expo.version` a
      1.7.0 (la 1.6.1 ya se usó en App Store) y correr `/store-release` desde la
      Mac (en Windows no hay build local de iOS). Notas de la versión: ver
      `git log` desde el release 1.6.1.
- [ ] **Color de cada colegio**: ninguno tiene `color_primario` cargado.
      Super Admin → colegio → 🏫 Colegio → Editar → Color primario.

## Probar

- [ ] **Autorizaciones en la web** (responder, detalle, Exportar Excel, sección
      del Super Admin): el flujo se probó completo en mobile y los permisos en
      la base (10/10); en la web solo lo usó Yanina a mano (creó y respondió una
      de prueba). Recorrerla una vez en el navegador, sobre todo la sección del
      Super Admin (varios cursos).
- [x] ~~Mobile en emulador~~ — probado 2026-09-23 con el APK nuevo y cuenta de
      apoderada: Pendientes del Muro (autorización) → Responder → sheet →
      guardado en la base; detalle del creador + Exportar Excel (share sheet
      con el .xlsx); chip "👁 5 de 40 leyeron" + "¿Quién lo leyó?" en Avisos;
      formulario de aviso con Título y Hora inicio/fin (aparecen al elegir
      fecha). Sin publicar nada real. Falta: probarlo en un iPhone.
- [ ] **Sincronización de calendario en iPhone** (Apple Calendar y Google):
      nunca se probó en un equipo real.
- [ ] **Primer aviso automático real**: lunes 28/09 19:00 (Tripartitas 1B →
      31 familias de 1°B) y resumen semanal domingo 27/09 18:00. Revisar que
      haya llegado y los logs de la función `avisos-automaticos`.

## Funcionalidades nuevas (acordadas, sin hacer)

- [ ] **Fotos por evento**: galería privada por evento (acto, excursión) donde
      las familias suben y ven fotos. Reusar el bucket privado `adjuntos` /
      `SignedImg`. Definir: quién sube (¿cualquiera o solo Room Parent?),
      moderación, límite por evento.
- [ ] **Pago de colectas con Mercado Pago** (postergado): requiere cuenta de MP
      del curso/colegio y webhooks.

## Mejoras chicas

- [ ] **Recordatorio automático a quien no respondió una autorización**
      (ej. el día anterior a la fecha límite). Se suma a
      `supabase/functions/avisos-automaticos`.
- [ ] **Opción para que una familia desactive los avisos automáticos**
      (resumen semanal / evento de mañana). Hoy no hay forma.
- [ ] **Adopción**: mostrar también los cursos con 0 familias (hoy la RPC no
      devuelve fila si el curso no tiene familias).
- [ ] **Mobile Super Admin**: crear autorizaciones del colegio y ver Adopción
      (hoy solo desde la web).

## Técnico (sin apuro)

- [ ] **45 advertencias de lint web**: el patrón `useEffect(()=>{ cargar() },[…])`
      en ~20 pantallas (`react-hooks/set-state-in-effect` + `exhaustive-deps`).
      Pasar esas cargas a `useCallback` con dependencias correctas, de a una
      pantalla y probando cada una (riesgo de recargas en loop). El CI ya
      bloquea por errores; con esto se podría bloquear también por warnings.
- [ ] **Unificar el envío a Expo**: `send-push` y `avisos-automaticos` repiten la
      lógica de envío y poda de tokens. Moverla a
      `supabase/functions/_shared/expoPush.ts`.
- [ ] **Historia de git con la service-role key vieja**: la key se rotó, pero
      sigue en commits viejos. Opcional: limpiar con `git filter-repo` (rompe
      clones existentes).
