// supabase/functions/calendar-feed/index.ts
//
// Sirve el feed ICS de un usuario: eventos + cumpleaños (hijos y maestros) +
// recordatorios con horario (las "citas" — reuniones, entrevistas, etc. que
// llevan hora_inicio) de todos los cursos a los que tiene acceso (hijos +
// cursos donde es admin — mismo cálculo que el "Mi acceso" de App.jsx),
// combinados en un solo calendario. Un recordatorio sin hora_inicio es un
// aviso/texto, no algo agendable, así que no entra acá (queda solo en el tab
// de Recordatorios). Cada VEVENT lleva el nombre del curso en el SUMMARY para
// que un apoderado con hijos en más de un curso pueda diferenciarlos.
// (Festejos todavía no está cubierto por este feed — pendiente.)
//
// Gateado únicamente por `?token=` (usuario_calendar_tokens.token, generado vía
// la RPC regenerar_calendar_token — ver supabase/calendar-token-hardening.sql,
// que movió el token a su propia tabla porque usuarios_select lo exponía a
// cualquier compañero de curso). Lo consultan
// Google/Apple/Outlook directamente, sin sesión de Supabase, así que este
// función se despliega SIN verificación de JWT:
//   supabase functions deploy calendar-feed --no-verify-jwt
//
// Usa la service-role key para leer a través de todos los cursos del usuario
// sin pasar por RLS — el token en la URL ES el control de acceso.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const pad2 = (n: number) => String(n).padStart(2, "0");

// "2026-08-13" -> "20260813"
const dateOnly = (iso: string) => iso.replaceAll("-", "");

// fecha "YYYY-MM-DD" + 1 día, formato "YYYYMMDD" (DTEND es exclusivo en RFC5545)
function dateOnlyPlusOne(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

// fecha "YYYY-MM-DD" + hora "HH:MM" asumidas en America/Argentina/Buenos_Aires
// (UTC-3 fijo, sin horario de verano) -> "YYYYMMDDTHHMMSSZ" en UTC.
function dateTimeUTC(fecha: string, hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCHours((h || 0) + 3, m || 0, 0, 0);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
}

function dtstampNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

// Escapado de texto para valores ICS (RFC5545 §3.3.11)
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Plegado de línea simple (continuación con un espacio) — no es un plegado
// por octetos estrictamente RFC-preciso con texto multibyte, pero los
// clientes mayores (Google/Apple/Outlook) son tolerantes a esto en la práctica.
function fold(line: string): string {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length) {
    out += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

type Evento = {
  id: string;
  curso_id: string;
  titulo: string;
  fecha: string;
  fecha_fin: string | null;
  hora: string | null;
  hora_fin: string | null;
  todo_el_dia: boolean | null;
  lugar: string | null;
  url_ubicacion: string | null;
  descripcion: string | null;
};

function buildEventoVevent(e: Evento, curso: string): string {
  const summary = esc(curso ? `${curso} — ${e.titulo}` : e.titulo);
  const lines = ["BEGIN:VEVENT", `UID:evento-${e.id}@tribbu.app`, `DTSTAMP:${dtstampNow()}`, `SUMMARY:${summary}`];

  if (e.todo_el_dia !== false || !e.hora) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.fecha)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnlyPlusOne(e.fecha_fin || e.fecha)}`);
  } else {
    lines.push(`DTSTART:${dateTimeUTC(e.fecha, e.hora)}`);
    lines.push(`DTEND:${dateTimeUTC(e.fecha_fin || e.fecha, e.hora_fin || e.hora)}`);
  }

  if (e.lugar) lines.push(`LOCATION:${esc(e.lugar)}`);
  const descParts = [e.descripcion, e.url_ubicacion].filter(Boolean);
  if (descParts.length) lines.push(`DESCRIPTION:${esc(descParts.join(" — "))}`);

  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

function buildCumpleVevent(tipo: "hijo" | "maestro", id: string, nombre: string, fechaNacimiento: string, curso: string): string {
  const summary = esc(curso ? `${curso} — Cumple de ${nombre}` : `Cumple de ${nombre}`);
  const lines = [
    "BEGIN:VEVENT",
    `UID:cumple-${tipo}-${id}@tribbu.app`,
    `DTSTAMP:${dtstampNow()}`,
    `SUMMARY:${summary}`,
    `DTSTART;VALUE=DATE:${dateOnly(fechaNacimiento)}`,
    `DTEND;VALUE=DATE:${dateOnlyPlusOne(fechaNacimiento)}`,
    "RRULE:FREQ=YEARLY",
    "END:VEVENT",
  ];
  return lines.map(fold).join("\r\n");
}

type Recordatorio = {
  id: string;
  curso_id: string;
  texto: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
};

// Solo los recordatorios con horario (hora_inicio) entran al feed como citas
// con hora — un recordatorio sin hora es un aviso/texto, no algo agendable;
// hora_fin queda opcional (sin fin, la cita queda como instante puntual).
function buildRecordatorioVevent(r: Recordatorio, curso: string): string {
  const summary = esc(curso ? `${curso} — ${r.texto}` : r.texto);
  const lines = [
    "BEGIN:VEVENT",
    `UID:recordatorio-${r.id}@tribbu.app`,
    `DTSTAMP:${dtstampNow()}`,
    `SUMMARY:${summary}`,
    `DTSTART:${dateTimeUTC(r.fecha, r.hora_inicio!)}`,
    `DTEND:${dateTimeUTC(r.fecha, r.hora_fin || r.hora_inicio!)}`,
    "END:VEVENT",
  ];
  return lines.map(fold).join("\r\n");
}

function buildIcs(vevents: string[]): string {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//tribbu//calendar-feed//ES",
      "CALSCALE:GREGORIAN",
      // X-WR-CALNAME es lo que Google/Apple/Outlook muestran como nombre del
      // calendario suscripto — sin esto, quedaba el host de la Edge Function
      // (ej. "gctymjhblvocvaenmdhr.supabase.co") como nombre.
      "X-WR-CALNAME:Tribbu",
      ...vevents,
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n"
  );
}

const icsHeaders = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" };

serve(async (req) => {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return new Response("Falta token", { status: 400 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { data: tokenRow } = await supabase
      .from("usuario_calendar_tokens")
      .select("usuario_id")
      .eq("token", token)
      .maybeSingle();
    if (!tokenRow) return new Response("Not found", { status: 404 });
    const usuario = { id: tokenRow.usuario_id };

    // Cursos vía hijos (dos pasos, sin depender de nombres de FK para el join anidado).
    const { data: uh } = await supabase.from("usuario_hijos").select("hijo_id").eq("usuario_id", usuario.id);
    const hijoIds = (uh || []).map((r) => r.hijo_id).filter(Boolean);
    let cursoIdsHijos: string[] = [];
    if (hijoIds.length) {
      const { data: hijosDeUsuario } = await supabase.from("hijos").select("curso_id").in("id", hijoIds);
      cursoIdsHijos = (hijosDeUsuario || []).map((h) => h.curso_id).filter(Boolean);
    }

    // Cursos donde es admin.
    const { data: uc } = await supabase.from("usuario_cursos").select("curso_id").eq("usuario_id", usuario.id);
    const cursoIdsAdmin = (uc || []).map((r) => r.curso_id).filter(Boolean);

    const cursoIds = [...new Set([...cursoIdsHijos, ...cursoIdsAdmin])];
    if (!cursoIds.length) return new Response(buildIcs([]), { headers: icsHeaders });

    const { data: cursos } = await supabase.from("cursos").select("id,nombre").in("id", cursoIds);
    const nombrePorCurso = new Map((cursos || []).map((c) => [c.id, c.nombre as string]));

    const [{ data: eventos }, { data: hijos }, { data: maestroCursos }, { data: recordatorios }] = await Promise.all([
      supabase.from("eventos").select("*").in("curso_id", cursoIds),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,curso_id").in("curso_id", cursoIds),
      supabase.from("maestro_cursos").select("curso_id, maestros(id,nombre,fecha_nacimiento)").in("curso_id", cursoIds),
      supabase
        .from("recordatorios")
        .select("id,curso_id,texto,fecha,hora_inicio,hora_fin,para_usuario_id")
        .in("curso_id", cursoIds)
        .not("fecha", "is", null)
        .not("hora_inicio", "is", null)
        .or(`para_usuario_id.is.null,para_usuario_id.eq.${usuario.id}`),
    ]);

    const vevents: string[] = [];

    for (const e of (eventos || []) as Evento[]) {
      vevents.push(buildEventoVevent(e, nombrePorCurso.get(e.curso_id) || ""));
    }
    for (const r of (recordatorios || []) as Recordatorio[]) {
      vevents.push(buildRecordatorioVevent(r, nombrePorCurso.get(r.curso_id) || ""));
    }
    for (const h of hijos || []) {
      if (!h.fecha_nacimiento) continue;
      const nombre = [h.nombre, h.apellido].filter(Boolean).join(" ");
      vevents.push(buildCumpleVevent("hijo", h.id, nombre, h.fecha_nacimiento, nombrePorCurso.get(h.curso_id) || ""));
    }
    for (const mc of (maestroCursos || []) as { curso_id: string; maestros: { id: string; nombre: string; fecha_nacimiento: string | null } | null }[]) {
      const m = mc.maestros;
      if (!m?.fecha_nacimiento) continue;
      vevents.push(buildCumpleVevent("maestro", m.id, m.nombre, m.fecha_nacimiento, nombrePorCurso.get(mc.curso_id) || ""));
    }

    return new Response(buildIcs(vevents), { headers: icsHeaders });
  } catch (e) {
    console.error("calendar-feed error:", e);
    return new Response("Error interno", { status: 500 });
  }
});
