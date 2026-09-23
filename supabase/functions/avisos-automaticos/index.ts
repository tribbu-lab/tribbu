// supabase/functions/avisos-automaticos/index.ts
//
// Notificaciones automáticas, disparadas por pg_cron (ver
// supabase/avisos-automaticos.sql):
//
//   ?modo=diario   (todos los días, 19:00 Argentina)
//     - Eventos de mañana: UNA push por familia con lo que tiene mañana
//       ("Mañana: Acto del Día del Maestro · 10:00", o "Mañana tenés 2
//       eventos: …"). Festejos solo a quien los ve (invitados, familia del
//       cumpleañero, creador — mismo criterio que la RLS eventos_select), y no
//       a quien ya respondió que no va.
//     - Colectas que vencen pasado mañana: solo a las familias con algún hijo
//       de ese curso que todavía no la pagó.
//   ?modo=semanal  (domingos, 18:00 Argentina)
//     - Resumen de la semana por familia: eventos, colectas por vencer y
//       cumpleaños de los próximos 7 días. Si no hay nada, no se manda.
//
// Cada aviso queda anotado en avisos_automaticos_log (clave única), así que
// si el cron corre dos veces el mismo día no se repite nada.
//
// Sin JWT (lo llama pg_cron vía pg_net): el control de acceso es el header
// x-cron-secret contra el secret CRON_SECRET de la función, que también vive
// en el Vault de la base (el cron lo lee de ahí).
//   supabase secrets set CRON_SECRET=...
//   supabase functions deploy avisos-automaticos --no-verify-jwt
// Manda directo a la Expo Push API con los push_tokens (service role), como
// send-push. Fechas en hora de Argentina (UTC-3 fijo, sin horario de verano).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ── Fechas (Argentina, UTC-3) ────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, "0");
const hoyAR = () => new Date(Date.now() - 3 * 3600_000); // "reloj" de Argentina en campos UTC
const isoDe = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const masDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDe(d);
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaSemana = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const fmtHora = (h: string | null) => (h ? h.slice(0, 5) : null);
// ¿El cumpleaños (fecha de nacimiento) cae entre desde y hasta (inclusive)?
const cumpleEntre = (nac: string, desde: string, hasta: string) => {
  const [, m, d] = nac.split("-");
  for (let iso = desde; iso <= hasta; iso = masDias(iso, 1)) if (iso.slice(5) === `${m}-${d}`) return true;
  return false;
};

// ── Destinatarios ────────────────────────────────────────────────────────────
type Ctx = {
  sb: SupabaseClient;
  familiasPorCurso: Map<string, Set<string>>; // curso → usuarios (familias + Room Parents)
  hijosDeUsuario: Map<string, string[]>; // usuario → hijos
  cursoDeHijo: Map<string, string>;
};

async function cargarContexto(sb: SupabaseClient): Promise<Ctx> {
  const [{ data: hijos }, { data: uh }, { data: uc }, { data: usuarios }] = await Promise.all([
    sb.from("hijos").select("id,curso_id"),
    sb.from("usuario_hijos").select("usuario_id,hijo_id"),
    sb.from("usuario_cursos").select("usuario_id,curso_id"),
    sb.from("usuarios").select("id,activo"),
  ]);
  const activo = new Set((usuarios || []).filter((u) => u.activo !== false).map((u) => u.id));
  const cursoDeHijo = new Map((hijos || []).map((h) => [h.id, h.curso_id]));
  const familiasPorCurso = new Map<string, Set<string>>();
  const hijosDeUsuario = new Map<string, string[]>();
  const add = (curso: string | undefined, u: string) => {
    if (!curso || !activo.has(u)) return;
    if (!familiasPorCurso.has(curso)) familiasPorCurso.set(curso, new Set());
    familiasPorCurso.get(curso)!.add(u);
  };
  for (const r of uh || []) {
    add(cursoDeHijo.get(r.hijo_id), r.usuario_id);
    if (!hijosDeUsuario.has(r.usuario_id)) hijosDeUsuario.set(r.usuario_id, []);
    hijosDeUsuario.get(r.usuario_id)!.push(r.hijo_id);
  }
  for (const r of uc || []) add(r.curso_id, r.usuario_id);
  return { sb, familiasPorCurso, hijosDeUsuario, cursoDeHijo };
}

// Quién recibe el aviso de un evento: todo el curso, salvo los festejos
// (invitados + familia del cumpleañero + creador, menos los que dijeron que no).
async function destinatariosDeEventos(ctx: Ctx, eventos: any[]) {
  const festejos = eventos.filter((e) => e.tipo === "festejo").map((e) => e.id);
  const asistencia = festejos.length
    ? ((await ctx.sb.from("evento_asistencia").select("evento_id,usuario_id,alumno_invitado_id,asiste").in("evento_id", festejos)).data || [])
    : [];
  const padresDe = (hijo: string) =>
    [...ctx.hijosDeUsuario.entries()].filter(([, hs]) => hs.includes(hijo)).map(([u]) => u);
  const porEvento = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (e.tipo !== "festejo") {
      porEvento.set(e.id, new Set(ctx.familiasPorCurso.get(e.curso_id) || []));
      continue;
    }
    const ids = new Set<string>();
    const noVan = new Set<string>();
    if (e.creado_por) ids.add(e.creado_por);
    if (e.alumno_id) padresDe(e.alumno_id).forEach((u) => ids.add(u));
    for (const a of asistencia.filter((x) => x.evento_id === e.id)) {
      const us = [a.usuario_id, ...(a.alumno_invitado_id ? padresDe(a.alumno_invitado_id) : [])].filter(Boolean);
      if (a.asiste === "no") us.forEach((u) => noVan.add(u));
      else us.forEach((u) => ids.add(u));
    }
    noVan.forEach((u) => ids.delete(u));
    porEvento.set(e.id, ids);
  }
  return porEvento;
}

// Familias con algún hijo del curso de la colecta que todavía no la pagó.
async function impagosDeColectas(ctx: Ctx, colectas: any[]) {
  const { data: pagos } = colectas.length
    ? await ctx.sb.from("colecta_pagos").select("colecta_id,alumno_id,estado").in("colecta_id", colectas.map((c) => c.id))
    : { data: [] };
  const pagado = new Set((pagos || []).filter((p) => p.estado === "pagado").map((p) => `${p.colecta_id}-${p.alumno_id}`));
  const porColecta = new Map<string, Set<string>>();
  for (const c of colectas) {
    const ids = new Set<string>();
    for (const [u, hijos] of ctx.hijosDeUsuario) {
      if (!ctx.familiasPorCurso.get(c.curso_id)?.has(u)) continue; // inactivos fuera
      if (hijos.some((h) => ctx.cursoDeHijo.get(h) === c.curso_id && !pagado.has(`${c.id}-${h}`))) ids.add(u);
    }
    porColecta.set(c.id, ids);
  }
  return porColecta;
}

// ── Envío ────────────────────────────────────────────────────────────────────
// Modo prueba (?dry=1): calcula todo pero no anota ni manda nada.
let DRY = false;
// Solo en modo prueba: simular otro "hoy" (?hoy=AAAA-MM-DD).
let HOY_SIMULADO: string | null = null;

// Anota la clave; devuelve true solo si es la primera vez (dedupe entre corridas).
async function primeraVez(sb: SupabaseClient, clave: string) {
  if (DRY) return true;
  const { data, error } = await sb.from("avisos_automaticos_log").upsert({ clave }, { onConflict: "clave", ignoreDuplicates: true }).select("clave");
  if (error) {
    console.error("avisos-automaticos: log falló", clave, error.message);
    return false; // ante la duda, no mandar (mejor perder un aviso que duplicarlo)
  }
  return (data || []).length > 0;
}

type Mensaje = { usuario: string; title: string; body: string; data: Record<string, unknown> };

async function enviar(sb: SupabaseClient, mensajes: Mensaje[]) {
  if (!mensajes.length || DRY) return 0;
  const { data: tokens } = await sb.from("push_tokens").select("usuario_id,token").in("usuario_id", [...new Set(mensajes.map((m) => m.usuario))]);
  const tokensDe = new Map<string, string[]>();
  for (const t of tokens || []) {
    if (!t.token?.startsWith("ExponentPushToken")) continue;
    if (!tokensDe.has(t.usuario_id)) tokensDe.set(t.usuario_id, []);
    tokensDe.get(t.usuario_id)!.push(t.token);
  }
  const salida = mensajes.flatMap((m) =>
    (tokensDe.get(m.usuario) || []).map((to) => ({ to, sound: "default", title: m.title, body: m.body, data: m.data, channelId: "default" })),
  );
  const muertos: string[] = [];
  for (let i = 0; i < salida.length; i += 100) {
    const lote = salida.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(lote),
      });
      const tickets = (await res.json())?.data || [];
      tickets.forEach((tk: any, j: number) => {
        if (tk?.status === "error" && tk?.details?.error === "DeviceNotRegistered") muertos.push(lote[j].to);
      });
    } catch (e) {
      console.error("avisos-automaticos: Expo push falló", e);
    }
  }
  if (muertos.length) await sb.from("push_tokens").delete().in("token", muertos);
  return salida.length;
}

// En modo prueba: textos distintos con cuántas familias recibirían cada uno.
const muestra = (ms: Mensaje[]) => {
  const c = new Map<string, number>();
  for (const m of ms) c.set(`${m.title} | ${m.body}`, (c.get(`${m.title} | ${m.body}`) || 0) + 1);
  return [...c.entries()].map(([texto, familias]) => ({ texto, familias }));
};

// ── Modos ────────────────────────────────────────────────────────────────────
async function diario(sb: SupabaseClient) {
  const hoy = HOY_SIMULADO || isoDe(hoyAR());
  const manana = masDias(hoy, 1);
  const pasado = masDias(hoy, 2);
  const ctx = await cargarContexto(sb);
  const mensajes: Mensaje[] = [];

  // Eventos de mañana (incluye los de varios días que arrancan mañana).
  const { data: eventos } = await sb
    .from("eventos")
    .select("id,titulo,tipo,fecha,hora,curso_id,alumno_id,creado_por")
    .eq("fecha", manana);
  const ev = (eventos || []).filter((e) => e.tipo !== "cumple");
  const destinatarios = await destinatariosDeEventos(ctx, ev);
  const porUsuario = new Map<string, any[]>();
  for (const e of ev) for (const u of destinatarios.get(e.id) || []) {
    if (!porUsuario.has(u)) porUsuario.set(u, []);
    porUsuario.get(u)!.push(e);
  }
  for (const [u, lista] of porUsuario) {
    if (!(await primeraVez(sb, `eventos:${manana}:${u}`))) continue;
    const orden = lista.sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
    const body = orden.length === 1
      ? [orden[0].titulo?.trim(), fmtHora(orden[0].hora)].filter(Boolean).join(" · ")
      : orden.map((e) => [fmtHora(e.hora), e.titulo?.trim()].filter(Boolean).join(" ")).join(" · ");
    mensajes.push({
      usuario: u,
      title: orden.length === 1 ? "📅 Mañana" : `📅 Mañana tenés ${orden.length} eventos`,
      body,
      data: { type: "evento", fecha: manana },
    });
  }

  // Colectas que vencen pasado mañana, a quien no pagó.
  const { data: colectas } = await sb.from("colectas").select("id,titulo,curso_id,vencimiento,activa").eq("activa", true).eq("vencimiento", pasado);
  const impagos = await impagosDeColectas(ctx, colectas || []);
  for (const c of colectas || []) {
    for (const u of impagos.get(c.id) || []) {
      if (!(await primeraVez(sb, `colecta:${c.id}:${u}`))) continue;
      mensajes.push({
        usuario: u,
        title: "💳 Colecta por vencer",
        body: `"${c.titulo?.trim()}" vence el ${diaSemana(pasado)}. Todavía figura sin pagar.`,
        data: { type: "colecta", colectaId: c.id },
      });
    }
  }
  return { enviados: await enviar(sb, mensajes), avisos: mensajes.length, ...(DRY ? { muestra: muestra(mensajes) } : {}) };
}

async function semanal(sb: SupabaseClient) {
  const hoy = HOY_SIMULADO || isoDe(hoyAR());
  const desde = masDias(hoy, 1); // lunes
  const hasta = masDias(hoy, 7); // domingo
  const ctx = await cargarContexto(sb);

  const [{ data: eventos }, { data: colectas }, { data: hijos }, { data: maestros }] = await Promise.all([
    sb.from("eventos").select("id,titulo,tipo,fecha,hora,curso_id,alumno_id,creado_por").gte("fecha", desde).lte("fecha", hasta),
    sb.from("colectas").select("id,titulo,curso_id,vencimiento,activa").eq("activa", true).gte("vencimiento", desde).lte("vencimiento", hasta),
    sb.from("hijos").select("id,curso_id,fecha_nacimiento").not("fecha_nacimiento", "is", null),
    sb.from("maestro_cursos").select("curso_id, maestros(id,fecha_nacimiento)"),
  ]);
  const ev = (eventos || []).filter((e) => e.tipo !== "cumple");
  const destEv = await destinatariosDeEventos(ctx, ev);
  const impagos = await impagosDeColectas(ctx, colectas || []);

  // Cumples por curso en la semana (alumnos + maestros), sin repetir personas.
  const cumplesPorCurso = new Map<string, Set<string>>();
  const sumar = (curso: string, id: string) => {
    if (!cumplesPorCurso.has(curso)) cumplesPorCurso.set(curso, new Set());
    cumplesPorCurso.get(curso)!.add(id);
  };
  for (const h of hijos || []) if (cumpleEntre(h.fecha_nacimiento, desde, hasta)) sumar(h.curso_id, `a-${h.id}`);
  for (const mc of maestros || []) {
    const m = (mc as any).maestros;
    if (m?.fecha_nacimiento && cumpleEntre(m.fecha_nacimiento, desde, hasta)) sumar(mc.curso_id, `m-${m.id}`);
  }

  // Cursos de cada usuario (para cumples).
  const cursosDe = new Map<string, Set<string>>();
  for (const [curso, us] of ctx.familiasPorCurso) for (const u of us) {
    if (!cursosDe.has(u)) cursosDe.set(u, new Set());
    cursosDe.get(u)!.add(curso);
  }

  const semana = `${desde}`;
  const mensajes: Mensaje[] = [];
  for (const [u, cursos] of cursosDe) {
    const nEventos = ev.filter((e) => destEv.get(e.id)?.has(u)).length;
    const nColectas = (colectas || []).filter((c) => impagos.get(c.id)?.has(u)).length;
    const cumples = new Set<string>();
    for (const c of cursos) (cumplesPorCurso.get(c) || new Set()).forEach((x) => cumples.add(x));
    const partes = [
      nEventos ? `${nEventos} ${nEventos === 1 ? "evento" : "eventos"}` : null,
      nColectas ? `${nColectas} ${nColectas === 1 ? "colecta por pagar" : "colectas por pagar"}` : null,
      cumples.size ? `${cumples.size} ${cumples.size === 1 ? "cumple" : "cumples"}` : null,
    ].filter(Boolean);
    if (!partes.length) continue;
    if (!(await primeraVez(sb, `semanal:${semana}:${u}`))) continue;
    mensajes.push({ usuario: u, title: "🗓️ Tu semana en tribbu", body: `Esta semana: ${partes.join(" · ")}.`, data: { type: "resumen" } });
  }
  return { enviados: await enviar(sb, mensajes), avisos: mensajes.length, ...(DRY ? { muestra: muestra(mensajes) } : {}) };
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "No autorizado" }, 401);
  const params = new URL(req.url).searchParams;
  const modo = params.get("modo");
  DRY = params.get("dry") === "1";
  HOY_SIMULADO = DRY && /^\d{4}-\d{2}-\d{2}$/.test(params.get("hoy") || "") ? params.get("hoy") : null;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  try {
    if (modo === "diario") return json({ modo, ...(await diario(sb)) });
    if (modo === "semanal") return json({ modo, ...(await semanal(sb)) });
    return json({ error: "modo inválido (diario | semanal)" }, 400);
  } catch (e) {
    console.error("avisos-automaticos error:", e);
    return json({ error: "Error interno" }, 500);
  }
});
