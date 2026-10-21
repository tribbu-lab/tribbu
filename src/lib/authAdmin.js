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
  // `detalle` (status/code de Supabase Auth) cuando la función lo manda —
  // sin esto, un error genérico como "Database error checking email" queda
  // imposible de diagnosticar desde el toast.
  if (!res.ok) throw new Error([json.error || `Error ${res.status}`, json.detalle].filter(Boolean).join(" — "));
  return json;
};

/**
 * El motivo de un error de Auth en castellano, para el toast (antes el panel
 * decía solo "Error al crear la cuenta en Auth" y no se sabía qué pasaba).
 */
export const mensajeErrorAuth = (e) => {
  const m = String(e?.message || e || "");
  if (/already (been )?registered|already exists|email_exists/i.test(m)) return "Ya existe una cuenta con ese mail. Usá otro mail o, si es la misma persona, editala desde la lista.";
  if (/password/i.test(m) && /(least|short|weak|characters)/i.test(m)) return "La contraseña es muy corta o muy simple: probá con una más larga, con letras y números.";
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return "El mail no es válido.";
  if (/sin permisos/i.test(m)) return "No tenés permiso para crear esta cuenta.";
  return m || "Error desconocido";
};

/** Crea un usuario en Supabase Auth. Devuelve { auth_id } */
export const authAdminCreate = (email, password) =>
  callManageAuthUser("create", { email, password });

/**
 * Actualiza email y/o password de un usuario. `current_email` (el email
 * actual del usuario, no el nuevo) es opcional: si el auth_id guardado ya no
 * existe en Auth, la Edge Function lo usa para reubicar la cuenta por email
 * o, si de verdad no existe, recrearla con la contraseña que se está fijando.
 * Devuelve { ok: true, user_id, auth_id_reparado? } — si viene
 * `auth_id_reparado`, hay que reescribir `usuarios.auth_id` con ese valor.
 */
export const authAdminUpdate = (auth_id, { email, password, current_email } = {}) =>
  callManageAuthUser("update", { auth_id, email, password, current_email });

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
