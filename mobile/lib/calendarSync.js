// mobile/lib/calendarSync.js
//
// Motor de sync del calendario del dispositivo (Android, opción "Calendario
// del dispositivo"): descarga el feed ICS existente (calendar-feed?token=…) —
// la misma fuente de verdad que la suscripción de iOS/web/Google, así la
// lógica de alcance multi-curso, prefijos de curso y cumples vive en un solo
// lugar — y upsertea los eventos en un calendario propio **"Tribbu"** del
// dispositivo vía expo-calendar (CalendarContract), espejando el calendario
// "Tribbu" que iOS crea al suscribirse por webcal.
//
// Tradeoff, conocido y elegido por el usuario (2026-08-28): un calendario
// creado por una app normal es de cuenta LOCAL — se ve en la app de
// calendario del teléfono (Samsung Calendar, AOSP, etc.) con su propio color
// y toggle, pero NO sube a calendar.google.com ni a otros dispositivos (solo
// un sync adapter de Google puede crear calendarios sincronizados), y **la
// app de Google Calendar no lista ni dibuja calendarios LOCAL de terceros**
// (verificado en emulador con una cuenta real: visible=1, 108 eventos, y no
// aparecía). Por eso este motor es UNA de las dos opciones que ofrece
// BotonAgregarCalendario.jsx: quien usa Google Calendar elige la otra (la
// suscripción al feed, que sí crea un "Tribbu" real dentro de la cuenta). A
// cambio, esta opción es instantánea, no exige cuenta Google, y
// "Desconectar" es un borrado limpio del calendario entero.
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
// mapa se pierde (reinstalación), no hay duplicados: al reconectar, el
// calendario "Tribbu" huérfano se borra entero y se recrea de cero.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import { THEMES } from "@shared/tokens";

const t = THEMES.light;
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

// Los cumples son los únicos VEVENT del feed que combinan VALUE=DATE (día
// completo) con RRULE:FREQ=YEARLY, y esa combinación NO se puede delegar al
// CalendarProvider de Android: expo-calendar traduce la recurrencia a
// DURATION="PT86400S" (CalendarModule.kt) y CalendarProvider2.fixAllDayTime()
// la parsea con un substring ingenuo — Integer.parseInt("T86400") —, tira
// NumberFormatException, y como saveEventAsync solo captura Parse/
// EventNotSaved/InvalidArgument, la excepción escapa de la corrutina y MATA el
// proceso (no es un promise rejection: el try/catch de JS nunca la ve).
// Por eso la recurrencia anual de día completo se expande acá a eventos
// sueltos, uno por año, con UID derivado estable. Los eventos con hora sí
// pueden llevar recurrenceRule: el bug es exclusivo del path allDay.
const ANOS_RECURRENCIA = 3; // año en curso + los 2 siguientes

// Firma de contenido para detectar cambios entre syncs — sin DTSTAMP, que el
// generador re-emite en cada fetch.
const firmaDe = (ev) =>
  JSON.stringify([ev.titulo, ev.allDay, ev.inicioMs, ev.finMs, ev.lugar, ev.notas, ev.anual]);

// Un cumple recurrente → N eventos de día completo, uno por año. El 29/2 cae
// en el 1/3 de los años no bisiestos (Date.UTC normaliza), igual que hacen los
// calendarios nativos.
function expandirAnual(ev) {
  const base = new Date(ev.inicioMs);
  const duracionMs = ev.finMs - ev.inicioMs;
  const anoBase = new Date().getUTCFullYear();
  const copias = [];
  for (let i = 0; i < ANOS_RECURRENCIA; i++) {
    const ano = anoBase + i;
    const inicioMs = Date.UTC(ano, base.getUTCMonth(), base.getUTCDate());
    const copia = {
      ...ev,
      uid: `${ev.uid}::${ano}`,
      inicioMs,
      finMs: inicioMs + duracionMs,
      anual: false, // ya expandido: nunca se manda recurrenceRule al proveedor
    };
    copia.firma = firmaDe(copia);
    copias.push(copia);
  }
  return copias;
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
        ev.firma = firmaDe(ev);
        return ev;
      } catch {
        return null; // VEVENT malformado: se saltea, no tira todo el sync
      }
    })
    .filter(Boolean)
    // Ver ANOS_RECURRENCIA: día completo + anual crashea el CalendarProvider.
    .flatMap((ev) => (ev.allDay && ev.anual ? expandirAnual(ev) : [ev]));
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

const NOMBRE_CALENDARIO = "Tribbu";

// Pide el permiso de calendario. Devuelve { ok } / { ok: false, motivo: "permiso" }.
export async function prepararConexion() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return { ok: false, motivo: "permiso" };
  return { ok: true };
}

// Crea el calendario "Tribbu" del dispositivo (cuenta LOCAL — ver header) y
// devuelve su id. Si quedó uno huérfano de una instalación anterior (el mapa
// UID→eventId ya no existe), se borra y se recrea: es un calendario
// exclusivamente nuestro, y reutilizarlo sin mapa duplicaría cada evento.
async function obtenerOCrearCalendarioTribbu() {
  const todos = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const huerfano = todos.find((c) => c.title === NOMBRE_CALENDARIO && c.allowsModifications);
  if (huerfano) await Calendar.deleteCalendarAsync(huerfano.id).catch(() => {});
  return Calendar.createCalendarAsync({
    title: NOMBRE_CALENDARIO,
    name: NOMBRE_CALENDARIO,
    color: t.accent,
    entityType: Calendar.EntityTypes.EVENT,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    ownerAccount: NOMBRE_CALENDARIO,
    source: { isLocalAccount: true, name: NOMBRE_CALENDARIO },
  });
}

// Descarga el feed y lo aplica contra el calendario "Tribbu": crea los
// nuevos, recrea los cambiados, borra los que ya no están. Devuelve la
// cantidad de eventos vigentes. Lanza si el feed o el CalendarProvider
// fallan (el caller decide el mensaje).
export async function sincronizar({ userId, feedUrl }) {
  const estado = await leerEstado(userId);

  // Resolver el calendario destino: el guardado si sigue existiendo; si el
  // usuario lo borró a mano (o es la primera vez), se (re)crea y el mapa
  // viejo se descarta — esos eventos murieron con el calendario.
  let calId = estado.calendarId;
  if (calId) {
    const todos = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (!todos.some((c) => c.id === calId)) calId = null;
  }
  if (!calId) {
    calId = await obtenerOCrearCalendarioTribbu();
    estado.eventos = {};
  }

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

// Borra el calendario "Tribbu" entero (se lleva todos sus eventos de un
// saque) y limpia el estado — el usuario no queda con nada huérfano. Si el
// borrado del calendario falla, se cae al borrado evento por evento.
export async function desconectar({ userId }) {
  const estado = await leerEstado(userId);
  if (estado.calendarId) {
    try {
      await Calendar.deleteCalendarAsync(estado.calendarId);
    } catch {
      for (const previo of Object.values(estado.eventos)) {
        await Calendar.deleteEventAsync(previo.id, { futureEvents: true }).catch(() => {});
      }
    }
  }
  await AsyncStorage.multiRemove([claveEstado(userId), claveUltimoSync(userId)]).catch(() => {});
}
