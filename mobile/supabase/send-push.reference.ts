// REFERENCIA — Edge Function `send-push` adaptada a la Expo Push API.
//
// La función original (fuera de este repo) enviaba vía OneSignal. Esta versión
// resuelve los destinatarios por curso, busca sus Expo push tokens en la tabla
// `push_tokens` y los envía a https://exp.host/--/api/v2/push/send.
//
// IMPORTANTE: este archivo es una guía para deployar. NO se ejecuta desde el repo
// del cliente. Copialo a supabase/functions/send-push/index.ts en el proyecto de
// las Edge Functions y deployá con `supabase functions deploy send-push`.
//
// El `payload.type` se conserva en `data` para que el cliente haga deep-link
// (ver mobile/push/useNotificationRouting.ts → TAB_MAP).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Texto de la notificación según el type (paridad con lo que mandaba la web).
function buildMessage(type: string, payload: Record<string, unknown>) {
  switch (type) {
    case "recordatorio":
      return { title: "Nuevo recordatorio", body: String(payload.titulo || "") };
    case "alerta":
      return { title: "🚨 Alerta del curso", body: String(payload.mensaje || "") };
    case "evento":
      return { title: "Nuevo evento", body: String(payload.titulo || "") };
    case "colecta":
      return { title: "Nueva colecta", body: String(payload.titulo || "") };
    case "festejo":
      return { title: "Festejo de cumpleaños", body: String(payload.titulo || "") };
    default:
      return { title: "tribbu", body: String(payload.mensaje || payload.titulo || "") };
  }
}

Deno.serve(async (req) => {
  try {
    const { type, payload } = await req.json();
    const userIds: string[] = payload?.userIds || [];
    if (!userIds.length) {
      return Response.json({ ok: true, sent: 0, reason: "sin destinatarios" });
    }

    // Cliente con service-role (bypassea RLS) para leer todos los tokens.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token")
      .in("usuario_id", userIds);

    const expoTokens = (tokens || [])
      .map((t: { token: string }) => t.token)
      .filter((t: string) => t?.startsWith("ExponentPushToken"));

    if (!expoTokens.length) {
      return Response.json({ ok: true, sent: 0, reason: "sin tokens" });
    }

    const { title, body } = buildMessage(type, payload || {});

    // Expo recomienda lotes de hasta 100 mensajes.
    const messages = expoTokens.map((to: string) => ({
      to,
      sound: "default",
      title,
      body,
      data: { type, ...payload },
      channelId: "default",
    }));

    const results = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
      results.push(await res.json());
    }

    return Response.json({ ok: true, sent: messages.length, results });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
