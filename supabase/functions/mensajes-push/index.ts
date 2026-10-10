// supabase/functions/mensajes-push/index.ts
//
// Push de Mensajes (specs/mensajes.md). La llama la base, no el cliente: los
// triggers de `mensajes` y `mensaje_denuncias` (supabase/mensajes.sql) hacen
// un net.http_post con { mensaje_id } o { denuncia_id }. Así los
// destinatarios salen de la membresía real de la conversación y no de una
// lista que manda quien escribe.
//
// Reglas (mensaje):
//   · destinatarios = miembros_conversacion() menos el autor
//   · sin push si el destinatario silenció la conversación o bloqueó al autor
//   · agrupado: si ya le llegó un push de esa conversación en los últimos
//     2 minutos y todavía no la abrió, no se manda otro
// Denuncia: push a los colegio_admin del colegio (o a los super si no hay
// colegio).
//
// Deploy: supabase functions deploy mensajes-push --no-verify-jwt
// Auth: header x-cron-secret = CRON_SECRET (el mismo de avisos-automaticos;
// la base lo lee del Vault `avisos_cron_secret`).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarPush, MensajePush } from "../_shared/expoPush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const AGRUPADO_MS = 2 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const recortar = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function cuerpo(texto: string | null, fotos: unknown[]) {
  const t = (texto || "").trim();
  if (t) return recortar(t);
  return fotos.length > 1 ? `📷 ${fotos.length} fotos` : "📷 Foto";
}

async function nombreConFamilia(sb: SupabaseClient, usuarioId: string, cursoId: string | null) {
  const { data: u } = await sb.from("usuarios").select("nombre,apellido").eq("id", usuarioId).maybeSingle();
  const nombre = `${u?.nombre || ""} ${u?.apellido || ""}`.trim() || "Alguien";
  if (!cursoId) return { nombre, conFamilia: nombre };
  const { data: hs } = await sb
    .from("usuario_hijos")
    .select("hijos!inner(nombre,curso_id)")
    .eq("usuario_id", usuarioId)
    .eq("hijos.curso_id", cursoId);
  const hijos = [...new Set((hs || []).map((r: { hijos: { nombre: string } }) => r.hijos?.nombre).filter(Boolean))];
  return { nombre, conFamilia: hijos.length ? `${nombre} · familia de ${hijos.join(" y ")}` : nombre };
}

async function pushMensaje(sb: SupabaseClient, mensajeId: string) {
  const { data: m } = await sb.from("mensajes").select("*").eq("id", mensajeId).maybeSingle();
  if (!m || m.borrado_en) return { skip: "sin mensaje" };
  const { data: c } = await sb.from("conversaciones").select("*").eq("id", m.conversacion_id).maybeSingle();
  if (!c) return { skip: "sin conversación" };

  const { data: miembros } = await sb.rpc("miembros_conversacion", { p_conv: c.id });
  let dest = ((miembros || []) as string[]).filter((u) => u && u !== m.autor_id);
  // soporte: lo que escribe el usuario va a los super; lo que responde un super, al usuario
  if (c.tipo === "soporte") dest = m.rol_autor === "usuario" ? dest.filter((u) => u !== c.usuario_id) : [c.usuario_id];
  if (!dest.length) return { sent: 0 };

  const [{ data: estados }, { data: bloqueos }, { data: logs }] = await Promise.all([
    sb.from("conversacion_miembros").select("usuario_id,ultimo_leido_en,silenciado").eq("conversacion_id", c.id).in("usuario_id", dest),
    m.autor_id
      ? sb.from("usuario_bloqueos").select("usuario_id").eq("bloqueado_id", m.autor_id).in("usuario_id", dest)
      : Promise.resolve({ data: [] }),
    sb.from("mensajes_push_log").select("usuario_id,enviado_en").eq("conversacion_id", c.id).in("usuario_id", dest),
  ]);
  const estadoDe = new Map((estados || []).map((e) => [e.usuario_id, e]));
  const bloqueadoPor = new Set((bloqueos || []).map((b: { usuario_id: string }) => b.usuario_id));
  const logDe = new Map((logs || []).map((l) => [l.usuario_id, new Date(l.enviado_en).getTime()]));
  const ahora = Date.now();

  dest = dest.filter((u) => {
    const e = estadoDe.get(u);
    if (e?.silenciado) return false;
    if (bloqueadoPor.has(u)) return false;
    const ultimoPush = logDe.get(u);
    if (ultimoPush && ahora - ultimoPush < AGRUPADO_MS) {
      const leido = e?.ultimo_leido_en ? new Date(e.ultimo_leido_en).getTime() : 0;
      if (leido < ultimoPush) return false; // ya tiene uno sin leer de esta conversación
    }
    return true;
  });
  if (!dest.length) return { sent: 0 };

  const texto = cuerpo(m.texto, m.fotos || []);
  let title = "Nuevo mensaje";
  let body = texto;
  let type = "mensaje";
  if (c.tipo === "soporte") {
    if (m.rol_autor === "usuario") {
      const { nombre } = await nombreConFamilia(sb, m.autor_id, null);
      title = `🛟 Soporte · ${nombre}`;
      type = "soporte";
    } else {
      title = "Soporte tribbu";
    }
  } else if (c.tipo === "curso") {
    const [{ data: cu }, autor] = await Promise.all([
      sb.from("cursos").select("nombre").eq("id", c.curso_id).maybeSingle(),
      nombreConFamilia(sb, m.autor_id, c.curso_id),
    ]);
    title = `Grupo ${cu?.nombre || "del curso"}`;
    body = recortar(`${autor.nombre.split(" ")[0]}: ${texto}`);
  } else if (c.tipo === "docente") {
    const [{ data: ma }, { data: h }, autor] = await Promise.all([
      sb.from("maestros").select("nombre,apellido,materia").eq("id", c.maestro_id).maybeSingle(),
      sb.from("hijos").select("nombre,apellido").eq("id", c.hijo_id).maybeSingle(),
      nombreConFamilia(sb, m.autor_id, null),
    ]);
    if (m.rol_autor === "docente") {
      // a la familia: quién es la maestra y de qué materia
      title = [`${ma?.nombre || ""} ${ma?.apellido || ""}`.trim() || "Docente", ma?.materia].filter(Boolean).join(" · ");
    } else {
      // a la docente: de qué alumno es la familia que escribe
      title = `Familia de ${[h?.nombre, h?.apellido].filter(Boolean).join(" ")}`;
      body = recortar(`${autor.nombre.split(" ")[0]}: ${texto}`);
    }
  } else if (c.tipo === "colegio") {
    if (m.rol_autor === "colegio") {
      const { data: co } = await sb.from("colegios").select("nombre").eq("id", c.colegio_id).maybeSingle();
      title = `Secretaría${co?.nombre ? ` · ${co.nombre}` : ""}`;
    } else {
      const [autor, { data: h }] = await Promise.all([
        nombreConFamilia(sb, m.autor_id, null),
        sb.from("hijos").select("nombre,apellido").eq("id", c.hijo_id).maybeSingle(),
      ]);
      title = `💬 ${autor.nombre} · ${[h?.nombre, h?.apellido].filter(Boolean).join(" ")}`;
    }
  } else {
    title = (await nombreConFamilia(sb, m.autor_id, c.curso_id)).conFamilia;
  }

  const mensajes: MensajePush[] = dest.map((usuario) => ({
    usuario,
    title,
    body,
    data: { type, conversacionId: c.id },
  }));
  const r = await enviarPush(sb, mensajes);
  await sb.from("mensajes_push_log").upsert(
    dest.map((usuario_id) => ({ conversacion_id: c.id, usuario_id, enviado_en: new Date().toISOString() })),
    { onConflict: "conversacion_id,usuario_id" },
  );
  return { sent: r.sent, dest: dest.length };
}

async function pushDenuncia(sb: SupabaseClient, denunciaId: string) {
  const { data: d } = await sb.from("mensaje_denuncias").select("id,colegio_id,motivo").eq("id", denunciaId).maybeSingle();
  if (!d) return { skip: "sin denuncia" };
  const q = sb.from("usuarios").select("id");
  const { data: admins } = d.colegio_id
    ? await q.eq("rol", "colegio_admin").eq("colegio_id", d.colegio_id)
    : await q.eq("rol", "super");
  const dest = (admins || []).map((u: { id: string }) => u.id);
  if (!dest.length) return { sent: 0 };
  const motivos: Record<string, string> = { acoso: "acoso", inapropiado: "contenido inapropiado", spam: "spam", otro: "otro motivo" };
  const r = await enviarPush(
    sb,
    dest.map((usuario: string) => ({
      usuario,
      title: "🚩 Nueva denuncia en Mensajes",
      body: `Una familia denunció un mensaje por ${motivos[d.motivo] || d.motivo}. Revisala en Denuncias.`,
      data: { type: "denuncia", denunciaId: d.id },
    })),
  );
  return { sent: r.sent };
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "No autorizado" }, 401);
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mensaje_id) return json(await pushMensaje(sb, body.mensaje_id));
    if (body?.denuncia_id) return json(await pushDenuncia(sb, body.denuncia_id));
    return json({ error: "Falta mensaje_id o denuncia_id" }, 400);
  } catch (e) {
    console.error("mensajes-push:", e);
    return json({ error: String(e) }, 500);
  }
});
