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
 * Devuelve todos los usuario_id vinculados a un curso (familias + Room
 * Parents) en una sola request: RPC usuarios_de_curso (supabase/docentes.sql).
 * Antes eran 3 lecturas en serie (usuario_cursos, hijos, usuario_hijos), que
 * además una docente no puede hacer por RLS — sus avisos no le llegaban a nadie.
 */
export const getUserIdsByCurso = async (cursoId) => {
  const { data, error } = await supabase.rpc("usuarios_de_curso", { p_curso: cursoId });
  if (error) { console.error("usuarios_de_curso:", error.message); return []; }
  return [...new Set((data || []).map((r) => (typeof r === "string" ? r : r.usuarios_de_curso)))];
};

/**
 * Destinatarios de una alerta: las familias del curso y también sus maestras
 * (las alertas son para todos; los avisos a familias no). RPC
 * docentes_de_curso (supabase/alertas-a-docentes.sql).
 */
export const getUserIdsParaAlerta = async (cursoId) => {
  const [familias, { data, error }] = await Promise.all([
    getUserIdsByCurso(cursoId),
    supabase.rpc("docentes_de_curso", { p_curso: cursoId }),
  ]);
  if (error) console.error("docentes_de_curso:", error.message);
  const docentes = (data || []).map((r) => (typeof r === "string" ? r : r.docentes_de_curso));
  return [...new Set([...familias, ...docentes])];
};
