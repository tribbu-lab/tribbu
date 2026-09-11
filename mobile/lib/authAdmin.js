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
  // `detalle` (status/code de Supabase Auth) cuando la función lo manda.
  if (!res.ok) throw new Error([json.error || `Error ${res.status}`, json.detalle].filter(Boolean).join(" — "));
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

// `current_email` (el email actual, no el nuevo) es opcional: si el auth_id
// guardado ya no existe en Auth, la Edge Function reubica la cuenta por email
// o, si de verdad no existe, la recrea con la contraseña que se está fijando.
// El resultado puede traer `auth_id_reparado` — hay que reescribir
// `usuarios.auth_id` con ese valor cuando venga.
export const authAdminUpdate = (auth_id, { email, password, current_email } = {}) =>
  callManageAuthUser("update", { auth_id, email, password, current_email });

export const authAdminFind = (email) => callManageAuthUser("find", { email });
