// supabase/functions/delete-account/index.ts
//
// Eliminación de cuenta self-service (Apple guideline 5.1.1(v)): el usuario
// autenticado borra SU PROPIA cuenta y los datos asociados. No requiere rol —
// a diferencia de manage-auth-user, acá el JWT del llamador define el único
// usuario que se puede borrar. La service-role key vive solo en el servidor.
//
// Qué borra (por usuario_id): push_tokens, recordatorio_leidos,
// evento_asistencia, libro/util/uniforme_adquirido, recordatorios personales
// (para_usuario_id), usuario_cursos, usuario_hijos y la fila de usuarios +
// el usuario de Auth. Qué anula (para conservar registros del curso):
// colecta_pagos.pagado_por, colectas.responsable_id, cumples.responsable_id.
// Los hijos NO se tocan: son datos del colegio y pueden tener otro apoderado.
//
// Deploy: supabase functions deploy delete-account

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Identificar al llamador por su JWT — es el único usuario borrable.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Token inválido" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: usuario, error: uErr } = await admin
      .from("usuarios")
      .select("id, rol")
      .eq("auth_id", user.id)
      .single();
    if (uErr || !usuario) return json({ error: "Usuario no encontrado" }, 404);

    // El Super Admin no puede autoeliminarse desde la app: dejaría la
    // plataforma sin administración. Se gestiona por soporte.
    if (usuario.rol === "super") {
      return json(
        { error: "La cuenta de Super Admin no puede eliminarse desde la app." },
        403,
      );
    }

    const uid = usuario.id;

    // 2. Borrar filas propias del usuario.
    const borrar: Array<[string, string]> = [
      ["push_tokens", "usuario_id"],
      ["recordatorio_leidos", "usuario_id"],
      ["evento_asistencia", "usuario_id"],
      ["libro_adquirido", "usuario_id"],
      ["util_adquirido", "usuario_id"],
      ["uniforme_adquirido", "usuario_id"],
      ["recordatorios", "para_usuario_id"], // recordatorios personales
      ["usuario_cursos", "usuario_id"],
      ["usuario_hijos", "usuario_id"],
    ];
    for (const [tabla, col] of borrar) {
      const { error } = await admin.from(tabla).delete().eq(col, uid);
      if (error) throw new Error(`${tabla}: ${error.message}`);
    }

    // 3. Anular referencias que deben sobrevivir (historial del curso).
    const anular: Array<[string, string]> = [
      ["colecta_pagos", "pagado_por"],
      ["colectas", "responsable_id"],
      ["cumples", "responsable_id"],
    ];
    for (const [tabla, col] of anular) {
      const { error } = await admin
        .from(tabla)
        .update({ [col]: null })
        .eq(col, uid);
      if (error) throw new Error(`${tabla}: ${error.message}`);
    }

    // 4. Borrar la fila de usuarios y el usuario de Auth.
    const { error: delErr } = await admin.from("usuarios").delete().eq("id", uid);
    if (delErr) throw new Error(`usuarios: ${delErr.message}`);

    const { error: authDelErr } = await admin.auth.admin.deleteUser(user.id);
    if (authDelErr) throw new Error(`auth: ${authDelErr.message}`);

    return json({ ok: true });
  } catch (err) {
    console.error("delete-account error:", err);
    return json({ error: (err as Error).message || "Error interno" }, 400);
  }
});
