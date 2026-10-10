// supabase/functions/mensajes-retencion/index.ts
//
// Retención de Mensajes (specs/mensajes.md). La corre pg_cron una vez por día
// (supabase/mensajes.sql → llamar_mensajes_retencion). Borra:
//   · conversaciones directo/curso/colegio de cursos de años lectivos
//     cerrados (cursos.año_lectivo < colegios.año_lectivo_actual)
//   · hilos de soporte sin mensajes hace más de 180 días
//   · denuncias resueltas hace más de 180 días
// Las fotos (bucket privado `adjuntos`, `mensajes/<conversacion_id>/…`) se
// borran por la API de Storage antes de las filas (no se puede por SQL).
//
// `?dry=1` no borra: devuelve qué borraría.
// Deploy: supabase functions deploy mensajes-retencion --no-verify-jwt
// Auth: header x-cron-secret = CRON_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DIAS_SOPORTE = 180;
const DIAS_DENUNCIAS = 180;

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

  const vencidas: { id: string; motivo: string }[] = [];
  for (let i = 0; i < cursosCerrados.length; i += 100) {
    const { data } = await sb
      .from("conversaciones")
      .select("id")
      .in("tipo", ["directo", "curso", "colegio"])
      .in("curso_id", cursosCerrados.slice(i, i + 100));
    for (const c of data || []) vencidas.push({ id: c.id, motivo: "año lectivo cerrado" });
  }
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

  if (dry) return json({ dry: true, conversaciones: vencidas, denuncias: denunciasViejas ?? 0 });

  let archivos = 0;
  for (const v of vencidas) archivos += await borrarCarpeta(sb, v.id);
  const ids = vencidas.map((v) => v.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await sb.from("conversaciones").delete().in("id", ids.slice(i, i + 100));
    if (error) console.error("retención: delete conversaciones", error.message);
  }
  await sb.from("mensaje_denuncias").delete().eq("estado", "resuelta").lt("resuelta_en", limiteDenuncias);

  return json({ conversaciones: ids.length, archivos, denuncias: denunciasViejas ?? 0 });
});
