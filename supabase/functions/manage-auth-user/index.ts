// supabase/functions/manage-auth-user/index.ts
//
// Edge Function que reemplaza el uso directo de VITE_SUPABASE_SERVICE_KEY en el cliente.
// Solo puede ser llamada por usuarios con rol "super" o "admin" (verificado via JWT).
//
// Operaciones soportadas:
//   action: "create"  → crea un usuario en Supabase Auth
//   action: "update"  → actualiza email y/o password de un usuario existente
//   action: "find"    → busca un usuario por email y devuelve su auth_id
//
// Deploy: supabase functions deploy manage-auth-user

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar que el llamador está autenticado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verificar que el usuario tiene rol super o admin
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar rol en tabla usuarios
    const { data: userData } = await userClient
      .from("usuarios")
      .select("rol")
      .eq("auth_id", user.id)
      .single();

    if (!userData || !["super", "admin"].includes(userData.rol)) {
      return new Response(JSON.stringify({ error: "Sin permisos suficientes" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parsear el body
    const { action, payload } = await req.json();

    // 4. Usar la service key SOLO en el servidor
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let result;

    if (action === "create") {
      // Crear usuario en Supabase Auth
      const { email, password } = payload;
      if (!email || !password) throw new Error("email y password son requeridos");
      const { data, error } = await adminClient.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: true,
      });
      if (error) throw error;
      result = { auth_id: data.user?.id };

    } else if (action === "update") {
      // Actualizar email y/o password de un usuario existente
      const { auth_id, email, password } = payload;
      if (!auth_id) throw new Error("auth_id es requerido");
      const updates: Record<string, unknown> = {};
      if (email)    { updates.email = email.toLowerCase().trim(); updates.email_confirm = true; }
      if (password) { updates.password = password; }
      if (!Object.keys(updates).length) throw new Error("Nada que actualizar");
      const { data, error } = await adminClient.auth.admin.updateUserById(auth_id, updates);
      if (error) throw error;
      result = { ok: true, user_id: data.user?.id };

    } else if (action === "find") {
      // Buscar usuario por email (para sincronizar auth_id)
      const { email } = payload;
      if (!email) throw new Error("email es requerido");
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;
      const found = data.users.find(u => u.email === email.toLowerCase().trim());
      result = { auth_id: found?.id || null };

    } else {
      throw new Error(`Acción desconocida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("manage-auth-user error:", err);
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
