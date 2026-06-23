import { supabase } from "../supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Envía una push notification via Edge Function.
 * La lógica de autorización vive en el servidor — la anon key
 * solo puede invocar la función, no acceder a la DB directamente.
 */
export const sendPush = async ({ type, payload }) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type, payload }),
    });
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
