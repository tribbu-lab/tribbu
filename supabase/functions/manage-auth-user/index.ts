// supabase/functions/manage-auth-user/index.ts
//
// Edge Function que reemplaza el uso directo de VITE_SUPABASE_SERVICE_KEY en el cliente.
// Puede ser llamada por "super" (sin restricción, cualquier usuario del sistema)
// o "colegio_admin" (acotado a usuarios de SU colegio — ver targetEnColegio()
// más abajo; el multi-colegio del 2026-09 agregó este segundo caso).
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

    // Verificar rol en tabla usuarios. "admin" (Room Parent, rol global no
    // acotado por curso — ver src/features/superadmin/index.jsx:128) sigue
    // SIN acceso: esta función opera sobre CUALQUIER usuario del sistema
    // (create/update/find no reciben curso_id ni lo validan por sí solos), y
    // permitir "admin" dejaba a cualquier Room Parent tomar la cuenta de
    // cualquier otro usuario. Los Room Parents ya invitan apoderados por su
    // propio mecanismo (crear_apoderado/verificar_codigo, RPC security
    // definer acotado al curso).
    // "super" (plataforma) sigue sin restricción. "colegio_admin" (nuevo,
    // multi-colegio) puede usarla, pero acotado: el usuario objetivo debe
    // pertenecer a SU colegio (ver targetEnColegio() abajo) — así no puede
    // tomar la cuenta de un usuario de otro colegio.
    const { data: userData } = await userClient
      .from("usuarios")
      .select("rol, colegio_id")
      .eq("auth_id", user.id)
      .single();

    const esSuper = userData?.rol === "super";
    const esColegioAdmin = userData?.rol === "colegio_admin";
    if (!esSuper && !esColegioAdmin) {
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

    // Busca un auth_id por email recorriendo TODAS las páginas de Auth.
    // `listUsers()` sin {page,perPage} solo trae los primeros 50 usuarios —
    // con más de 50 cuentas en el proyecto, cualquiera "más atrás" en la
    // lista no se encontraba aunque existiera (bug real, no al azar: afectaba
    // a quien le tocara según el orden interno de Auth).
    async function findAuthIdByEmail(email: string): Promise<string | null> {
      const target = email.toLowerCase().trim();
      const perPage = 200;
      for (let page = 1; ; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const found = data.users.find((u) => u.email?.toLowerCase() === target);
        if (found) return found.id;
        if (data.users.length < perPage) return null; // última página
      }
    }

    // Para colegio_admin: el usuario objetivo (por auth_id o email) tiene que
    // pertenecer a su colegio_id. Si todavía no existe fila en `usuarios` para
    // ese auth_id/email, se permite — es un alta nueva, sin colegio asignado
    // aún (el alcance real se aplica después, al insertar usuario_cursos/
    // usuario_hijos, ya cubierto por RLS). Mismo criterio que
    // es_colegio_admin_de_usuario() en supabase/multi-colegio.sql, pero acá
    // resuelto a mano porque corre con el service client (sin auth.uid()).
    async function targetEnColegio(colegioId: string, filtro: { authId?: string; email?: string }) {
      let query = adminClient.from("usuarios").select("id, colegio_id");
      query = filtro.authId ? query.eq("auth_id", filtro.authId) : query.ilike("email", filtro.email!);
      const { data: fila } = await query.maybeSingle();
      if (!fila) return true; // sin fila usuarios todavía → alta nueva
      if (fila.colegio_id) return fila.colegio_id === colegioId; // es colegio_admin/super de otro lado
      const [{ data: viaCursos }, { data: viaHijos }] = await Promise.all([
        adminClient.from("usuario_cursos").select("cursos!inner(colegio_id)").eq("usuario_id", fila.id),
        adminClient.from("usuario_hijos").select("hijos!inner(cursos!inner(colegio_id))").eq("usuario_id", fila.id),
      ]);
      const colegios = [
        ...(viaCursos || []).map((r: any) => r.cursos?.colegio_id),
        ...(viaHijos || []).map((r: any) => r.hijos?.cursos?.colegio_id),
      ];
      return colegios.includes(colegioId);
    }

    if (esColegioAdmin && (action === "update" || action === "find")) {
      const filtro = action === "update" ? { authId: payload?.auth_id } : { email: payload?.email };
      const enMiColegio = await targetEnColegio(userData!.colegio_id, filtro);
      if (!enMiColegio) {
        return new Response(JSON.stringify({ error: "Sin permisos sobre ese usuario" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
      // Actualizar email y/o password de un usuario existente. `current_email`
      // (el email actual del usuario en `usuarios`, no el nuevo) es opcional y
      // solo se usa para auto-reparar: si el auth_id guardado ya no existe en
      // Auth (cuenta borrada a mano, resto de la migración bcrypt→Auth), antes
      // esto fallaba con "User not found" sin forma de arreglarlo desde el
      // panel — ahora reintenta ubicar la cuenta por email y, si de verdad no
      // existe, la recrea con la contraseña que se está fijando.
      const { auth_id, email, password, current_email } = payload;
      if (!auth_id) throw new Error("auth_id es requerido");
      const updates: Record<string, unknown> = {};
      if (email)    { updates.email = email.toLowerCase().trim(); updates.email_confirm = true; }
      if (password) { updates.password = password; }
      if (!Object.keys(updates).length) throw new Error("Nada que actualizar");

      const { data, error } = await adminClient.auth.admin.updateUserById(auth_id, updates);
      if (!error) {
        result = { ok: true, user_id: data.user?.id };
      } else {
        const noExiste = /not found/i.test(error.message || "");
        if (!noExiste || !current_email) throw error;

        const foundId = await findAuthIdByEmail(current_email);
        if (foundId) {
          const { data: data2, error: error2 } = await adminClient.auth.admin.updateUserById(foundId, updates);
          if (error2) throw error2;
          result = { ok: true, user_id: data2.user?.id, auth_id_reparado: foundId };
        } else if (password) {
          const { data: data3, error: error3 } = await adminClient.auth.admin.createUser({
            email: (email || current_email).toLowerCase().trim(),
            password,
            email_confirm: true,
          });
          if (error3) throw error3;
          result = { ok: true, user_id: data3.user?.id, auth_id_reparado: data3.user?.id };
        } else {
          throw new Error("No existe una cuenta de Auth para este usuario y no se pasó una contraseña nueva para recrearla.");
        }
      }

    } else if (action === "find") {
      // Buscar usuario por email (para sincronizar auth_id)
      const { email } = payload;
      if (!email) throw new Error("email es requerido");
      result = { auth_id: await findAuthIdByEmail(email) };

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
