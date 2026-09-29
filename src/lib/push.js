import { supabase } from "../supabase";
import { getRuntimeConfig } from "./runtimeConfig";

/**
 * Envía una push notification via Edge Function.
 * La lógica de autorización vive en el servidor — la anon key
 * solo puede invocar la función, no acceder a la DB directamente.
 */
export const sendPush = async ({ type, payload }) => {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  try {
    // El Edge Function exige una sesión real (no solo la anon key, que es
    // pública) — manda el access_token del usuario logueado como bearer.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    // Sin timeout, una red lenta/colgada dejaba este fetch pendiente para
    // siempre — y como quien llama a sendPush lo espera antes de cerrar su
    // modal, todo el flujo de guardar quedaba trabado con el dato ya
    // insertado. 10s: suficiente para una red normal, no tanto como para
    // sentirse colgado.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey":        supabaseAnonKey,
      },
      body: JSON.stringify({ type, payload }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return await res.json();
  } catch (e) {
    console.error("sendPush error:", e);
    return null;
  }
};

/**
 * Devuelve todos los usuario_id vinculados a un curso:
 * admins directos + padres de hijos de ese curso.
 */
export const getUserIdsByCurso = async (cursoId) => {
  const { data: adminRows } = await supabase
    .from("usuario_cursos")
    .select("usuario_id")
    .eq("curso_id", cursoId);

  const adminIds = (adminRows || []).map((r) => r.usuario_id);

  const { data: hijos } = await supabase
    .from("hijos")
    .select("id")
    .eq("curso_id", cursoId);

  const hijoIds = (hijos || []).map((h) => h.id);
  if (!hijoIds.length) return adminIds;

  const { data: padres } = await supabase
    .from("usuario_hijos")
    .select("usuario_id")
    .in("hijo_id", hijoIds);

  const padreIds = (padres || []).map((r) => r.usuario_id);
  return [...new Set([...adminIds, ...padreIds])];
};
