# Pendientes de tribbu

Lista viva de lo que queda por hacer (última actualización: 2026-09-23).
Tachá o borrá cada ítem cuando se resuelva.

## ⚠️ Urgente

- [ ] **Invalidar la service-role key vieja de Supabase.** Está en commits viejos
      del repo (que es **público** en GitHub) y el 2026-09-23 se verificó que
      **todavía funciona** (lee datos saltándose la RLS). Borrar el historial de
      git no alcanza (ya está expuesta y puede haber copias): hay que rotarla en
      Supabase.
      Pasos (Supabase Dashboard → Project Settings → JWT Keys / API):
      rotar el JWT secret legacy (invalida la anon y la service-role viejas y
      desloguea a todos una vez) **o** pasar a las API keys nuevas y
      deshabilitar las legacy. Después: actualizar `VITE_SUPABASE_ANON_KEY` en
      Vercel y en `.env` / `mobile/.env` locales (el build de tiendas usa la
      `sb_publishable_…` de `eas.json`, no se ve afectado).
      Con la clave ya invalidada, limpiar el historial de git deja de ser
      necesario.

## Para hacer a mano (no requiere código)

- [ ] **Release a las tiendas 1.7.0.** Todo lo del 2026-09-23 está en la web pero
      no en la app publicada (autorizaciones, confirmación de lectura, título y
      horario en avisos, preferencias de notificaciones, edad de los hermanos,
      selector de colegio y Autorizaciones/Adopción del Super Admin, botón atrás,
      etc.). Subir `expo.version` a 1.7.0 (la 1.6.1 ya se usó en App Store) y
      correr `/store-release` desde la Mac (en Windows no hay build local de
      iOS). Notas de la versión: ver `git log` desde el release 1.6.1.
- [ ] **Color de cada colegio**: ninguno tiene `color_primario` cargado.
      Super Admin → colegio → 🏫 Colegio → Editar → Color primario.

## Probar

- [ ] **En el celular (APK nuevo o release)**: Más → Notificaciones (apagar y
      prender un aviso) y la edad de los hermanos al responder un cumpleaños.
      Lint y bundle OK; en web se probó de punta a punta, en el celular no.
      (Perdidos y encontrados ya se probó en el emulador Android el 2026-09-23.)
- [ ] **En un iPhone**: la app en general y la sincronización de calendario
      (Apple Calendar y Google) — nunca se probó en un equipo real.
- [ ] **Primer aviso automático real**: resumen semanal domingo 27/09 18:00 y
      lunes 28/09 19:00 (Tripartitas 1B → 31 familias de 1°B). Revisar que haya
      llegado y los logs de la función `avisos-automaticos`.

Ya probado el 2026-09-23 (web + emulador Android): autorizaciones (familia,
Room Parent y colegio, web y mobile), confirmación de lectura, adopción,
preferencias de avisos en modo prueba, aviso de autorización sin responder,
edad de los hermanos (web, con Excel), y las ~20 pantallas web tras el
refactor de carga (sin errores ni recargas en loop).

- [ ] **Fotos huérfanas en Storage**: no hay política DELETE en `storage.objects`,
      así que borrar un recordatorio/evento/perdido deja su archivo en el bucket.
      Agregar una policy de borrado (dueño o quien gestiona) o limpieza periódica.

## Funcionalidades nuevas (acordadas, sin hacer)

- [ ] **Fotos por evento**: galería privada por evento (acto, excursión) donde
      las familias suben y ven fotos. Reusar el bucket privado `adjuntos` /
      `SignedImg`. Definir: quién sube (¿cualquiera o solo Room Parent?),
      moderación, límite por evento.
- [ ] **Pago de colectas con Mercado Pago** (postergado): requiere cuenta de MP
      del curso/colegio y webhooks. Se construye junto con el cobro del
      Marketplace (misma integración).

## "Comunidad" (en definición — Yanina lo está pensando, no implementar aún)

Sección aparte que agrupa Lost&Found + Marketplace + Servicios (+ Carpool),
como pestañas de un mismo lugar en vez de ítems sueltos en el menú. Todas
comparten la base de Lost&Found: publicar, alcance curso/colegio,
"me interesa" → se comparten contactos, vencimiento, quedan visibles un tiempo
después de resueltas.

- [ ] **Marketplace de cosas usadas** (uniformes, libros, útiles, disfraces).
      Alcance colegio por defecto; foto, categoría, estado, talle, precio o
      "lo regalo". Gancho con Info Útil ("hay 3 camperas talle 10").
      **Modelo de negocio: comisión por venta a futuro** → exige que el pago
      pase por Tribbu (Mercado Pago Marketplace: el vendedor vincula su MP y
      MP separa la comisión), reclamos/devoluciones, términos y facturación.
- [ ] **Servicios de la comunidad** (clases, niñeras, animación, fotografía,
      profesionales). Ficha por persona + recomendaciones de familias.
      **Modelo de negocio: fee por publicar** → cobrarlo desde la web, no
      dentro de la app (Apple/Google pueden exigir su sistema de pagos para
      compras in-app de funciones digitales; confirmar reglas vigentes).
      Sensible: Tribbu no avala a nadie, decirlo explícito.
- [ ] **Carpool**: arrancar por viajes puntuales ("ofrezco / necesito
      lugar", zona, ida/vuelta, atado a eventos/cumples), pedido + aceptación
      antes de compartir contacto, sin direcciones exactas, recordatorio la
      noche anterior. Grupos rotativos fijos en una 2ª etapa. Abierto: zonas
      libres vs. predefinidas por el colegio, si el colegio ve/aprueba los
      retiros por otra familia.

Propuesta de etapas: **1)** Comunidad gratis (volumen primero), con el modelo
de datos ya pensado para cobrar (precio, vendido, comprador); **2)** cobro:
Mercado Pago con comisión en el Marketplace + fee de Servicios vía web.
