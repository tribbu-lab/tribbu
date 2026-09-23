// supabase/functions/send-push/index.ts
//
// Edge Function de envío de push. Reemplaza la versión OneSignal: ahora resuelve
// los Expo push tokens de los destinatarios (tabla `push_tokens`) y envía a la
// Expo Push API. El `payload.type` se conserva en `data` para el deep-link del
// cliente (mobile/push/useNotificationRouting → TAB_MAP).
//
// La invocan tanto la web como la app móvil con la anon key como Bearer (mismo
// contrato que `src/lib/push.js` / `mobile/lib/push.js`); no requiere JWT de
// super/admin — solo dispara la notificación a los `userIds` recibidos.
//
// Requiere la tabla `push_tokens` (ver mobile/supabase/push_tokens.sql).
// Deploy: supabase functions deploy send-push

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarPush } from "../_shared/expoPush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Texto de la notificación según el type (paridad con la versión OneSignal).
function buildMessage(type: string, payload: Record<string, unknown>) {
  switch (type) {
    case "recordatorio":
      return { title: "Nuevo recordatorio", body: String(payload.titulo || "") };
    case "alerta":
      return { title: "🚨 Alerta del curso", body: String(payload.mensaje || "") };
    case "evento":
      return { title: "Nuevo evento", body: String(payload.titulo || "") };
    case "colecta":
      return { title: "Nueva colecta", body: String(payload.titulo || payload.descripcion || "") };
    case "festejo":
      return { title: "Festejo de cumpleaños", body: String(payload.titulo || "") };
    case "encuesta":
      return { title: "Nueva encuesta", body: String(payload.titulo || "") };
    case "autorizacion":
      return { title: "✍️ Nueva autorización", body: String(payload.titulo || "") };
    case "perdido":
      return { title: "🧦 Lost&Found", body: String(payload.titulo || "") };
    default:
      return { title: "tribbu", body: String(payload.mensaje || payload.titulo || "") };
  }
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Exige una sesión real (no solo la anon key, que es pública en todo
    // bundle/APK) — sin esto, cualquiera podía mandar push con texto libre a
    // cualquier usuario_id sin siquiera tener una cuenta. No se exige rol
    // super/admin (a propósito: cualquier apoderado dispara push hoy al crear
    // un recordatorio/festejo/encuesta), solo estar logueado.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "No autorizado" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return json({ error: "Token inválido" }, 401);
    }

    const { type, payload } = await req.json();
    // `userIds` se usa solo para resolver destinatarios; no viaja en la
    // notificación (no exponemos la lista de destinatarios a cada dispositivo).
    const { userIds = [], ...dataRest } = (payload || {}) as Record<string, unknown> & {
      userIds?: string[];
    };
    if (!Array.isArray(userIds) || !userIds.length) {
      return json({ ok: true, sent: 0, reason: "sin destinatarios" });
    }

    // Cliente con service-role (bypassea RLS) para leer todos los tokens.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { title, body } = buildMessage(type, (payload || {}) as Record<string, unknown>);
    // Envío + poda de tokens muertos: módulo compartido con avisos-automaticos.
    const { sent, pruned, results } = await enviarPush(
      supabase,
      userIds.map((usuario) => ({ usuario, title, body, data: { type, ...dataRest } })),
    );
    if (!sent) return json({ ok: true, sent: 0, reason: "sin tokens" });

    return json({ ok: true, sent, pruned, results });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
