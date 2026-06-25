// Helpers de push para mobile — mismo contrato que src/lib/push.js de la web,
// pero importando el cliente Supabase de RN. Es glue acoplado a plataforma
// (cliente + env), no lógica de negocio compartible.

import { supabase } from "./supabase";
import { getRuntimeConfig } from "@shared/runtimeConfig";

/**
 * Dispara una push via Edge Function `send-push` (adaptada a la Expo Push API,
 * ver mobile/supabase/send-push.reference.ts). El `payload.type` se conserva
 * para el deep-link al tocar la notificación.
 */
export const sendPush = async ({ type, payload }) => {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
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
 * Todos los usuario_id vinculados a un curso: admins directos + padres de hijos
 * del curso. (Idéntico a la web.)
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
