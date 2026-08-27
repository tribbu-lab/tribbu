// lib/authAdmin.js
//
// Helper para llamar a la Edge Function manage-auth-user.
// Reemplaza el uso directo de VITE_SUPABASE_SERVICE_KEY en el frontend.
//
// La Edge Function verifica que el llamador tenga rol super o admin antes de operar.

import { supabase } from "../supabase";
import { getRuntimeConfig } from "./runtimeConfig";

const callManageAuthUser = async (action, payload) => {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión activa");

  const res = await fetch(`${supabaseUrl}/functions/v1/manage-auth-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": supabaseAnonKey,
    },
    body: JSON.stringify({ action, payload }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
};

/** Crea un usuario en Supabase Auth. Devuelve { auth_id } */
export const authAdminCreate = (email, password) =>
  callManageAuthUser("create", { email, password });

/** Actualiza email y/o password de un usuario. Devuelve { ok: true } */
export const authAdminUpdate = (auth_id, { email, password } = {}) =>
  callManageAuthUser("update", { auth_id, email, password });

/** Busca un usuario por email. Devuelve { auth_id } o { auth_id: null } */
export const authAdminFind = (email) =>
  callManageAuthUser("find", { email });

/**
 * Elimina la cuenta del usuario logueado (Edge Function delete-account: sin
 * rol requerido, el JWT del caller es el único que puede borrar — nunca
 * super). Mismo contrato que mobile/lib/authAdmin.js.
 */
export const deleteMyAccount = async () => {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión activa");

  const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": supabaseAnonKey,
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
};
