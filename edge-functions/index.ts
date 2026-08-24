// supabase/functions/calendar-feed/index.ts
//
// Feed ICS por usuario para suscribir en Google Calendar.
// Se llama con ?token=<calendar_token>. NO usa RLS: el filtrado se hace
// acá en el código (usa service role para leer).
//
// Lógica de qué eventos ve cada papá:
//   A) Eventos GENERALES del curso (alumno_id NULL) de sus cursos
//      -> los ve todo papá del curso.
//   B) Eventos de un chico puntual (alumno_id) de SUS propios hijos
//      -> solo los ven los papás de ese chico, en cualquier curso.
//   El feed es la unión A ∪ B (sin duplicados).
//
// Deploy con verificación de JWT DESACTIVADA, porque Google Calendar
// no puede mandar headers de auth (la autorización la da el ?token=).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZID = "America/Argentina/Buenos_Aires";

// Zona horaria fija (-03:00, Argentina no usa horario de verano)
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "TZNAME:-03",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

const SELECT_COLS =
  "id, titulo, tipo, fecha, hora, hora_fin, lugar, descripcion, responsable, todo_el_dia, url_ubicacion, alumno_id, curso_id";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Escapa texto para campos ICS (SUMMARY, DESCRIPTION, LOCATION)
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// 'YYYY-MM-DD' -> 'YYYYMMDD'
function toDateOnly(fecha: string): string {
  return fecha.replace(/-/g, "");
}

// Día siguiente en formato DATE (DTEND de día completo es exclusivo)
function nextDay(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

// fecha + hora 'HH:MM' -> '20260824T090000' (hora local, sin offset)
function toLocalStamp(fecha: string, hora: string | null): string {
  const [y, m, d] = fecha.split("-");
  let hh = "00", mm = "00";
  if (hora) {
    const parts = hora.split(":");
    hh = pad(parseInt(parts[0] || "0", 10));
    mm = pad(parseInt(parts[1] || "0", 10));
  }
  return `${y}${m}${d}T${hh}${mm}00`;
}

// Suma 1 hora a la hora local (default si no hay hora_fin). UTC se usa
// solo como reloj para la aritmética; no aplica conversión de zona.
function plusOneHour(fecha: string, hora: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const parts = hora.split(":");
  const hh = parseInt(parts[0] || "0", 10);
  const mm = parseInt(parts[1] || "0", 10);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  dt.setUTCHours(dt.getUTCHours() + 1);
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

function nowUtcStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function buildEvent(e: Record<string, any>): string {
  const lines: string[] = ["BEGIN:VEVENT"];
  lines.push(`UID:${e.id}@tribbu`);
  lines.push(`DTSTAMP:${nowUtcStamp()}`);

  const allDay = e.todo_el_dia === true || !e.hora;
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toDateOnly(e.fecha)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(e.fecha)}`);
  } else {
    lines.push(`DTSTART;TZID=${TZID}:${toLocalStamp(e.fecha, e.hora)}`);
    const endStamp = e.hora_fin
      ? toLocalStamp(e.fecha, e.hora_fin)
      : plusOneHour(e.fecha, e.hora);
    lines.push(`DTEND;TZID=${TZID}:${endStamp}`);
  }

  lines.push(`SUMMARY:${esc(e.titulo)}`);

  const descParts: string[] = [];
  if (e.descripcion) descParts.push(e.descripcion);
  if (e.tipo) descParts.push(`Tipo: ${e.tipo}`);
  if (e.responsable) descParts.push(`Responsable: ${e.responsable}`);
  if (descParts.length) lines.push(`DESCRIPTION:${esc(descParts.join("\n"))}`);

  const loc = e.lugar || e.url_ubicacion;
  if (loc) lines.push(`LOCATION:${esc(loc)}`);

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function buildIcs(eventos: Record<string, any>[]): string {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tribbu//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Tribbu",
    `X-WR-TIMEZONE:${TZID}`,
    VTIMEZONE,
  ].join("\r\n");
  const body = eventos.map(buildEvent).join("\r\n");
  const foot = "END:VCALENDAR";
  return [head, body, foot].filter(Boolean).join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Falta token", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Usuario por token
  const { data: usuario, error: uErr } = await supabase
    .from("usuarios")
    .select("id")
    .eq("calendar_token", token)
    .maybeSingle();

  if (uErr || !usuario) return new Response("Token inválido", { status: 403 });

  // 2) Hijos del papá (usuario_hijos)
  const { data: hijosRel } = await supabase
    .from("usuario_hijos")
    .select("hijo_id")
    .eq("usuario_id", usuario.id);

  const childIds = (hijosRel ?? [])
    .map((h: any) => h.hijo_id)
    .filter(Boolean);

  // 3) Cursos del papá = membresía (usuario_cursos) ∪ cursos de sus hijos
  const { data: cursosMembresia } = await supabase
    .from("usuario_cursos")
    .select("curso_id")
    .eq("usuario_id", usuario.id);

  let cursosDeHijos: string[] = [];
  if (childIds.length > 0) {
    const { data: hijosData } = await supabase
      .from("hijos")
      .select("curso_id")
      .in("id", childIds);
    cursosDeHijos = (hijosData ?? [])
      .map((h: any) => h.curso_id)
      .filter(Boolean);
  }

  const parentCourseIds = Array.from(
    new Set([
      ...(cursosMembresia ?? []).map((c: any) => c.curso_id).filter(Boolean),
      ...cursosDeHijos,
    ]),
  );

  // 4) Traer eventos: ventana desde hace 90 días para no inflar el feed
  const desde = new Date();
  desde.setDate(desde.getDate() - 90);
  const desdeStr = desde.toISOString().slice(0, 10);

  // Dedup por id de evento
  const eventosMap = new Map<string, Record<string, any>>();

  // A) Generales del curso (alumno_id NULL) de los cursos del papá
  if (parentCourseIds.length > 0) {
    const { data } = await supabase
      .from("eventos")
      .select(SELECT_COLS)
      .in("curso_id", parentCourseIds)
      .is("alumno_id", null)
      .gte("fecha", desdeStr);
    for (const e of data ?? []) eventosMap.set(e.id, e);
  }

  // B) De los hijos propios (alumno_id), en cualquier curso
  if (childIds.length > 0) {
    const { data } = await supabase
      .from("eventos")
      .select(SELECT_COLS)
      .in("alumno_id", childIds)
      .gte("fecha", desdeStr);
    for (const e of data ?? []) eventosMap.set(e.id, e);
  }

  const eventos = Array.from(eventosMap.values())
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  const ics = buildIcs(eventos);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tribbu.ics"',
      "Cache-Control": "no-cache",
    },
  });
});
