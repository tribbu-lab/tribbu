// supabase/functions/fotos-retencion/index.ts
//
// Fotos escolares (supabase/fotos-escolares.sql): al cerrar el año lectivo se
// borran. La corre pg_cron una vez por día (llamar_fotos_retencion).
// Borra las sesiones de fotos de cursos de años cerrados
// (cursos.año_lectivo < colegios.año_lectivo_actual): primero los archivos del
// bucket privado `fotos` (carpeta <curso_id>/<sesion_id>/, por la API de
// Storage: no se puede por SQL) y después la fila (fotos y pedidos van en
// cascada).
//
// `?dry=1` no borra: devuelve qué haría.
// Deploy: supabase functions deploy fotos-retencion --no-verify-jwt
// Auth: header x-cron-secret = CRON_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CLAVE_SERVICIO } from "../_shared/claves.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function borrarCarpeta(sb: SupabaseClient, prefijo: string) {
  let total = 0;
  for (;;) {
    const { data, error } = await sb.storage.from("fotos").list(prefijo, { limit: 100 });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const paths = data.map((f) => `${prefijo}/${f.name}`);
    const { error: e2 } = await sb.storage.from("fotos").remove(paths);
    if (e2) throw new Error(e2.message);
    total += paths.length;
    if (data.length < 100) break;
  }
  return total;
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "No autorizado" }, 401);
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const sb = createClient(SUPABASE_URL, CLAVE_SERVICIO);

  const { data: colegios } = await sb.from("colegios").select("id,año_lectivo_actual");
  const vigente = new Map((colegios || []).map((c) => [c.id, c["año_lectivo_actual"]]));
  const { data: cursos } = await sb.from("cursos").select("id,colegio_id,año_lectivo");
  const cerrados = new Set(
    (cursos || [])
      .filter((c) => {
        const v = vigente.get(c.colegio_id);
        return v != null && c["año_lectivo"] != null && c["año_lectivo"] < v;
      })
      .map((c) => c.id),
  );

  const { data: sesiones } = await sb.from("fotos_sesiones").select("id,curso_id");
  const vencidas = (sesiones || []).filter((s) => cerrados.has(s.curso_id));
  if (dry) return json({ dry: true, sesiones: vencidas.map((s) => s.id) });

  let archivos = 0, borradas = 0;
  for (const s of vencidas) {
    try {
      archivos += await borrarCarpeta(sb, `${s.curso_id}/${s.id}`);
    } catch (e) {
      // Si no se pudieron borrar los archivos, la fila queda para reintentar mañana.
      console.error("fotos-retencion: archivos", s.id, (e as Error).message);
      continue;
    }
    const { error } = await sb.from("fotos_sesiones").delete().eq("id", s.id);
    if (error) console.error("fotos-retencion: sesión", s.id, error.message);
    else borradas++;
  }
  return json({ sesiones: borradas, archivos });
});
