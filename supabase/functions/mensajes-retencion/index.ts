// supabase/functions/mensajes-retencion/index.ts
//
// Retención de Mensajes (specs/mensajes.md). La corre pg_cron una vez por día
// (supabase/mensajes.sql → llamar_mensajes_retencion).
// Archiva (desde 2026-10-22, supabase/mensajes-archivo.sql):
//   · conversaciones directo/curso/colegio/docente/grupo de cursos de años lectivos
//     cerrados (cursos.año_lectivo < colegios.año_lectivo_actual): les pone
//     archivada_en. Quedan de solo lectura y la app las muestra en "Archivados".
// Borra:
//   · las archivadas hace más de 180 días (antes se borraban apenas cerraba el año)
//   · hilos de soporte sin mensajes hace más de 180 días
//   · denuncias resueltas hace más de 180 días
//   · fotos de difusión que ya no usa ningún mensaje (mensajes/difusion/…)
// Las fotos (bucket privado `adjuntos`, `mensajes/<conversacion_id>/…`) se
// borran por la API de Storage antes de las filas (no se puede por SQL).
//
// `?dry=1` no archiva ni borra: devuelve qué haría.
// Deploy: supabase functions deploy mensajes-retencion --no-verify-jwt
// Auth: header x-cron-secret = CRON_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CLAVE_SERVICIO } from "../_shared/claves.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = CLAVE_SERVICIO;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DIAS_SOPORTE = 180;
const DIAS_DENUNCIAS = 180;
const DIAS_ARCHIVO = 180;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function borrarCarpeta(sb: SupabaseClient, convId: string) {
  const prefijo = `mensajes/${convId}`;
  let total = 0;
  for (;;) {
    const { data, error } = await sb.storage.from("adjuntos").list(prefijo, { limit: 100 });
    if (error || !data?.length) break;
    const paths = data.map((f) => `${prefijo}/${f.name}`);
    const { error: e2 } = await sb.storage.from("adjuntos").remove(paths);
    if (e2) { console.error("retención: no se pudo borrar", prefijo, e2.message); break; }
    total += paths.length;
    if (data.length < 100) break;
  }
  return total;
}

// Fotos de difusión (mensajes/difusion/<usuario>/…, supabase/mensajes-fotos.sql):
// las comparten los mensajes de todas las familias de esa difusión, así que no
// están en la carpeta de ningún chat. Se borran cuando ningún mensaje ni
// denuncia las usa (editado, borrado o chat vencido), con 2 días de gracia
// para no tocar una que se está enviando.
const DIAS_GRACIA_DIFUSION = 2;
async function fotosDifusionHuerfanas(sb: SupabaseClient) {
  const base = "mensajes/difusion";
  const limite = Date.now() - DIAS_GRACIA_DIFUSION * 86400_000;
  const huerfanas: string[] = [];
  const { data: carpetas } = await sb.storage.from("adjuntos").list(base, { limit: 1000 });
  for (const c of carpetas || []) {
    if (c.id) continue; // solo carpetas (una por usuario)
    const pref = `${base}/${c.name}`;
    const { data: archivos } = await sb.storage.from("adjuntos").list(pref, { limit: 1000 });
    const nombres = new Set((archivos || []).filter((a) => a.id).map((a) => a.name));
    for (const a of archivos || []) {
      if (!a.id || a.name.endsWith(".thumb.jpg")) continue;
      if (new Date(a.created_at).getTime() > limite) continue;
      const path = `${pref}/${a.name}`;
      const usada = JSON.stringify([path]);
      const [{ count: enMensajes }, { count: enDenuncias }] = await Promise.all([
        sb.from("mensajes").select("id", { count: "exact", head: true }).filter("fotos", "cs", usada),
        sb.from("mensaje_denuncias").select("id", { count: "exact", head: true }).filter("fotos_snapshot", "cs", usada),
      ]);
      if (enMensajes || enDenuncias) continue;
      huerfanas.push(path);
      const mini = `${a.name.replace(/\.[^./]+$/, "")}.thumb.jpg`;
      if (nombres.has(mini)) huerfanas.push(`${pref}/${mini}`);
    }
  }
  return huerfanas;
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "No autorizado" }, 401);
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  // Año vigente por colegio
  const { data: colegios } = await sb.from("colegios").select("id,año_lectivo_actual");
  const vigente = new Map((colegios || []).map((c) => [c.id, c["año_lectivo_actual"]]));
  const { data: cursos } = await sb.from("cursos").select("id,colegio_id,año_lectivo");
  const cursosCerrados = (cursos || [])
    .filter((c) => {
      const v = vigente.get(c.colegio_id);
      return v != null && c["año_lectivo"] != null && c["año_lectivo"] < v;
    })
    .map((c) => c.id);

  // Chats de años cerrados que todavía no están marcados: se archivan.
  const aArchivar: string[] = [];
  for (let i = 0; i < cursosCerrados.length; i += 100) {
    const { data } = await sb
      .from("conversaciones")
      .select("id")
      .in("tipo", ["directo", "curso", "colegio", "docente", "grupo"])
      .in("curso_id", cursosCerrados.slice(i, i + 100))
      .is("archivada_en", null);
    for (const c of data || []) aArchivar.push(c.id);
  }

  const vencidas: { id: string; motivo: string }[] = [];
  const limiteArchivo = new Date(Date.now() - DIAS_ARCHIVO * 86400_000).toISOString();
  const { data: archivadasViejas } = await sb
    .from("conversaciones")
    .select("id")
    .lt("archivada_en", limiteArchivo);
  for (const c of archivadasViejas || []) vencidas.push({ id: c.id, motivo: "archivada hace más de 180 días" });
  const limiteSoporte = new Date(Date.now() - DIAS_SOPORTE * 86400_000).toISOString();
  const { data: soporte } = await sb
    .from("conversaciones")
    .select("id")
    .eq("tipo", "soporte")
    .lt("ultimo_mensaje_en", limiteSoporte);
  for (const c of soporte || []) vencidas.push({ id: c.id, motivo: "soporte inactivo" });
  // soporte abierto y nunca escrito (se creó y no se mandó nada)
  const { data: vacias } = await sb
    .from("conversaciones")
    .select("id")
    .is("ultimo_mensaje_en", null)
    .lt("creado_en", limiteSoporte);
  for (const c of vacias || []) vencidas.push({ id: c.id, motivo: "vacía" });

  const limiteDenuncias = new Date(Date.now() - DIAS_DENUNCIAS * 86400_000).toISOString();
  const { count: denunciasViejas } = await sb
    .from("mensaje_denuncias")
    .select("id", { count: "exact", head: true })
    .eq("estado", "resuelta")
    .lt("resuelta_en", limiteDenuncias);

  const difusion = await fotosDifusionHuerfanas(sb);

  if (dry) return json({ dry: true, archivar: aArchivar.length, conversaciones: vencidas, denuncias: denunciasViejas ?? 0, fotos_difusion: difusion });

  const ahora = new Date().toISOString();
  for (let i = 0; i < aArchivar.length; i += 100) {
    const { error } = await sb.from("conversaciones").update({ archivada_en: ahora }).in("id", aArchivar.slice(i, i + 100));
    if (error) console.error("retención: archivar conversaciones", error.message);
  }

  let archivos = 0;
  for (const v of vencidas) archivos += await borrarCarpeta(sb, v.id);
  const ids = vencidas.map((v) => v.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await sb.from("conversaciones").delete().in("id", ids.slice(i, i + 100));
    if (error) console.error("retención: delete conversaciones", error.message);
  }
  await sb.from("mensaje_denuncias").delete().eq("estado", "resuelta").lt("resuelta_en", limiteDenuncias);

  for (let i = 0; i < difusion.length; i += 100) {
    const { error } = await sb.storage.from("adjuntos").remove(difusion.slice(i, i + 100));
    if (error) console.error("retención: fotos de difusión", error.message);
  }

  return json({ archivadas: aArchivar.length, conversaciones: ids.length, archivos, denuncias: denunciasViejas ?? 0, fotos_difusion: difusion.length });
});
