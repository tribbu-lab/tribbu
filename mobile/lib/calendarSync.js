// mobile/lib/calendarSync.js
//
// Motor de sync del calendario del dispositivo (Android): descarga el feed
// ICS existente (calendar-feed?token=…) — la misma fuente de verdad que la
// suscripción de iOS/web, así la lógica de alcance multi-curso, prefijos de
// curso y cumples recurrentes vive en un solo lugar — y upsertea los eventos
// contra un calendario Google del dispositivo vía expo-calendar
// (CalendarContract). Los eventos insertados en un calendario Google
// existente SÍ sincronizan a los servidores de Google (aparecen en la app de
// Google Calendar, calendar.google.com y otros dispositivos); un calendario
// creado por una app normal sería LOCAL y no sincronizaría nunca — por eso
// se escribe en un calendario existente del usuario y no en uno "Tribbu".
//
// El parser ICS es mínimo a propósito: solo entiende el formato que emite
// nuestro propio generador (supabase/functions/calendar-feed/index.ts) —
// UID / SUMMARY / DTSTART / DTEND (fecha y datetime UTC) / RRULE:FREQ=YEARLY
// / LOCATION / DESCRIPTION, con folding "\r\n " y escapado RFC5545 §3.3.11.
//
// Idempotencia: el UID estable del feed es la clave. El mapa
// { uid → { id, firma } } (id = eventId del dispositivo, firma = contenido
// canónico sin DTSTAMP) vive en AsyncStorage; un evento cambiado se borra y
// recrea (más simple y robusto que updateEventAsync con recurrentes). Si el
// mapa se pierde (reinstalación), el peor caso es duplicar — "Desconectar"
// antes de reinstalar lo evita; documentado en el spec.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";

const claveEstado = (userId) => `calsync_map_${userId}`;
const claveUltimoSync = (userId) => `calsync_last_${userId}`;
const THROTTLE_MS = 60 * 60 * 1000; // re-sync como mucho una vez por hora

// ---------------------------------------------------------------- parser ICS

// Des-escapado RFC5545 §3.3.11 (espejo del esc() del generador).
const unesc = (s) => s.replace(/\\(\\|;|,|n|N)/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// "20260813" (VALUE=DATE) → ms en medianoche UTC (convención de
// CalendarContract para allDay; el DTEND del feed ya es exclusivo, igual que
// el dtend exclusivo de CalendarContract).
function parseFecha(v) {
  return Date.UTC(Number(v.slice(0, 4)), Number(v.slice(4, 6)) - 1, Number(v.slice(6, 8)));
}

// "20260813T130000Z" → ms UTC (el generador siempre emite Z).
function parseFechaHora(v) {
  return Date.UTC(
    Number(v.slice(0, 4)), Number(v.slice(4, 6)) - 1, Number(v.slice(6, 8)),
    Number(v.slice(9, 11)), Number(v.slice(11, 13)), Number(v.slice(13, 15)) || 0
  );
}

// ICS → [{ uid, titulo, allDay, inicioMs, finMs, lugar, notas, anual, firma }]
export function parsearFeed(ics) {
  // Unfold: la continuación es CRLF + espacio (el generador usa "\r\n ");
  // se acepta también LF solo por tolerancia.
  const lineas = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r\n|\n/);
  const eventos = [];
  let cur = null;
  for (const linea of lineas) {
    if (linea === "BEGIN:VEVENT") { cur = {}; continue; }
    if (linea === "END:VEVENT") {
      if (cur?.UID?.valor) eventos.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = linea.indexOf(":");
    if (i < 0) continue;
    const nombre = linea.slice(0, i).split(";")[0];
    cur[nombre] = { valor: linea.slice(i + 1), esFecha: linea.slice(0, i).includes("VALUE=DATE") };
  }

  return eventos
    .map((v) => {
      try {
        const allDay = Boolean(v.DTSTART?.esFecha);
        const inicioMs = allDay ? parseFecha(v.DTSTART.valor) : parseFechaHora(v.DTSTART.valor);
        const finMs = v.DTEND
          ? (allDay ? parseFecha(v.DTEND.valor) : parseFechaHora(v.DTEND.valor))
          : inicioMs;
        const ev = {
          uid: v.UID.valor,
          titulo: unesc(v.SUMMARY?.valor || ""),
          allDay,
          inicioMs,
          finMs,
          lugar: v.LOCATION ? unesc(v.LOCATION.valor) : null,
          notas: v.DESCRIPTION ? unesc(v.DESCRIPTION.valor) : null,
          anual: (v.RRULE?.valor || "").includes("FREQ=YEARLY"),
        };
        // Firma de contenido para detectar cambios entre syncs — sin DTSTAMP,
        // que el generador re-emite en cada fetch.
        ev.firma = JSON.stringify([ev.titulo, ev.allDay, ev.inicioMs, ev.finMs, ev.lugar, ev.notas, ev.anual]);
        return ev;
      } catch {
        return null; // VEVENT malformado: se saltea, no tira todo el sync
      }
    })
    .filter(Boolean);
}

// ------------------------------------------------------- estado persistido

async function leerEstado(userId) {
  try {
    const raw = await AsyncStorage.getItem(claveEstado(userId));
    const estado = raw ? JSON.parse(raw) : null;
    if (estado?.calendarId && estado?.eventos) return estado;
  } catch { /* estado corrupto: se arranca de cero */ }
  return { calendarId: null, eventos: {} };
}

const guardarEstado = (userId, estado) =>
  AsyncStorage.setItem(claveEstado(userId), JSON.stringify(estado));

// ------------------------------------------------------------ API pública

// Pide permiso y lista los calendarios Google escribibles del dispositivo.
// Devuelve { ok: false, motivo: "permiso" | "sin_google" } o
// { ok: true, calendarios: [{ id, titulo, cuenta }] } (preferiendo los
// primarios de cada cuenta cuando existen).
export async function prepararConexion() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return { ok: false, motivo: "permiso" };

  const todos = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const google = todos.filter((c) => c.allowsModifications && c.source?.type === "com.google");
  if (!google.length) return { ok: false, motivo: "sin_google" };

  const primarios = google.filter((c) => c.isPrimary);
  const candidatos = (primarios.length ? primarios : google).map((c) => ({
    id: c.id,
    titulo: c.title,
    cuenta: c.source?.name || c.ownerAccount || "",
  }));
  return { ok: true, calendarios: candidatos };
}

// Descarga el feed y lo aplica contra el calendario: crea los nuevos,
// recrea los cambiados, borra los que ya no están. Devuelve la cantidad de
// eventos vigentes. Lanza si el feed o el CalendarProvider fallan (el caller
// decide el mensaje).
export async function sincronizar({ userId, feedUrl, calendarId = null }) {
  const estado = await leerEstado(userId);
  const calId = calendarId || estado.calendarId;
  if (!calId) throw new Error("Sin calendario conectado");

  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`El feed respondió ${res.status}`);
  const feedEventos = parsearFeed(await res.text());

  const nuevoMapa = {};
  for (const ev of feedEventos) {
    const previo = estado.eventos[ev.uid];
    if (previo?.firma === ev.firma) {
      nuevoMapa[ev.uid] = previo;
      continue;
    }
    if (previo) {
      // Cambió: borrar y recrear (updateEventAsync con recurrentes es frágil).
      await Calendar.deleteEventAsync(previo.id, { futureEvents: true }).catch(() => {});
    }
    const id = await Calendar.createEventAsync(calId, {
      title: ev.titulo,
      startDate: new Date(ev.inicioMs),
      endDate: new Date(ev.finMs),
      allDay: ev.allDay,
      ...(ev.lugar ? { location: ev.lugar } : {}),
      ...(ev.notas ? { notes: ev.notas } : {}),
      ...(ev.allDay ? {} : { timeZone: "UTC" }),
      ...(ev.anual ? { recurrenceRule: { frequency: Calendar.Frequency.YEARLY } } : {}),
    });
    nuevoMapa[ev.uid] = { id, firma: ev.firma };
  }

  // Lo que quedó en el mapa viejo y no vino en el feed ya no existe en tribbu.
  for (const [uid, previo] of Object.entries(estado.eventos)) {
    if (!nuevoMapa[uid]) await Calendar.deleteEventAsync(previo.id, { futureEvents: true }).catch(() => {});
  }

  await guardarEstado(userId, { calendarId: calId, eventos: nuevoMapa });
  await AsyncStorage.setItem(claveUltimoSync(userId), String(Date.now())).catch(() => {});
  return feedEventos.length;
}

// Re-sync silencioso (mount de Calendario / vuelta a foreground) con
// throttle. No lanza: un fallo acá no debe molestar al usuario — el próximo
// intento lo corrige.
export async function sincronizarSiConectado({ userId, feedUrl }) {
  try {
    const estado = await leerEstado(userId);
    if (!estado.calendarId || !feedUrl) return;
    const ultimo = Number(await AsyncStorage.getItem(claveUltimoSync(userId))) || 0;
    if (Date.now() - ultimo < THROTTLE_MS) return;
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status !== "granted") return; // permiso revocado: no insistir
    await sincronizar({ userId, feedUrl });
  } catch (e) {
    console.warn("Sync de calendario falló (se reintenta en la próxima):", e?.message);
  }
}

// Borra todos los eventos insertados (con el mapa guardado) y limpia el
// estado — el usuario no queda con eventos huérfanos imposibles de sacar.
export async function desconectar({ userId }) {
  const estado = await leerEstado(userId);
  for (const previo of Object.values(estado.eventos)) {
    await Calendar.deleteEventAsync(previo.id, { futureEvents: true }).catch(() => {});
  }
  await AsyncStorage.multiRemove([claveEstado(userId), claveUltimoSync(userId)]).catch(() => {});
}
