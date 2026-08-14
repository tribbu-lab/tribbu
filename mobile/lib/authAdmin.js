// Helper para la Edge Function manage-auth-user (mobile).
// Mismo contrato que src/lib/authAdmin.js de la web; la función verifica el rol
// super/admin vía JWT antes de usar la service-role key del lado servidor.
// La service-role key NUNCA aparece en el cliente.

import { supabase } from "./supabase";
import { getRuntimeConfig } from "@shared/runtimeConfig";

const callManageAuthUser = async (action, payload) => {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión activa");

  const res = await fetch(`${supabaseUrl}/functions/v1/manage-auth-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ action, payload }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
};

// Eliminación de cuenta self-service (Apple 5.1.1(v)): la Edge Function
// delete-account identifica al usuario por su JWT y borra SOLO su propia
// cuenta (datos + Auth). No lleva payload a propósito.
export const deleteMyAccount = async () => {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión activa");

  const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
};

export const authAdminCreate = (email, password) =>
  callManageAuthUser("create", { email, password });

export const authAdminUpdate = (auth_id, { email, password } = {}) =>
  callManageAuthUser("update", { auth_id, email, password });

export const authAdminFind = (email) => callManageAuthUser("find", { email });
