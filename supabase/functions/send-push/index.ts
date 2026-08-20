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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
// Los receipts tardan en materializarse en Expo; ~20s alcanza para FCM/APNs.
const RECEIPTS_DELAY_MS = 20_000;

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
    default:
      return { title: "tribbu", body: String(payload.mensaje || payload.titulo || "") };
  }
}

// Con FCM (Android), DeviceNotRegistered llega casi siempre en el RECEIPT — el
// ticket viene "ok" — así que podar solo por tickets deja tokens muertos
// acumulándose y los push a Android se pierden en silencio. Esta pasada corre en
// background (EdgeRuntime.waitUntil) después de responder, sin demorar al caller.
async function pruneByReceipts(
  supabase: ReturnType<typeof createClient>,
  ticketToToken: Map<string, string>,
) {
  if (!ticketToToken.size) return;
  await new Promise((r) => setTimeout(r, RECEIPTS_DELAY_MS));
  const ids = [...ticketToToken.keys()];
  const dead: string[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(i, i + 300) }),
      });
      const receipts = ((await res.json())?.data ?? {}) as Record<
        string,
        { status?: string; message?: string; details?: { error?: string } }
      >;
      for (const [id, rcpt] of Object.entries(receipts)) {
        if (rcpt?.status !== "error") continue;
        // Los logs de la función son la única visibilidad de fallas de entrega.
        console.error(`send-push receipt error (${rcpt?.details?.error}): ${rcpt?.message}`);
        if (rcpt?.details?.error === "DeviceNotRegistered") {
          const token = ticketToToken.get(id);
          if (token) dead.push(token);
        }
      }
    } catch (e) {
      console.error("send-push getReceipts falló:", e);
    }
  }
  if (dead.length) {
    const { error } = await supabase.from("push_tokens").delete().in("token", dead);
    if (!error) console.log(`send-push: ${dead.length} tokens muertos podados via receipts`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token")
      .in("usuario_id", userIds);

    const expoTokens = (tokens || [])
      .map((t: { token: string }) => t.token)
      .filter((t: string) => t?.startsWith("ExponentPushToken"));

    if (!expoTokens.length) {
      return json({ ok: true, sent: 0, reason: "sin tokens" });
    }

    const { title, body } = buildMessage(type, (payload || {}) as Record<string, unknown>);

    const messages = expoTokens.map((to: string) => ({
      to,
      sound: "default",
      title,
      body,
      data: { type, ...dataRest },
      channelId: "default",
    }));

    // Expo recomienda lotes de hasta 100 mensajes. Por cada lote, los tickets
    // vuelven en el mismo orden que los mensajes → mapeo ticket[i] ↔ token[i].
    const results: unknown[] = [];
    const deadTokens: string[] = [];
    const ticketToToken = new Map<string, string>();
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const chunkTokens = expoTokens.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      const out = await res.json();
      results.push(out);
      const tickets = out?.data;
      if (Array.isArray(tickets)) {
        tickets.forEach((ticket: { id?: string; status?: string; details?: { error?: string } }, idx: number) => {
          // Token inválido/desinstalado → lo borramos para no acumular basura.
          if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
            const dead = chunkTokens[idx];
            if (dead) deadTokens.push(dead);
          }
          // ticket ok → se re-chequea contra el receipt en background.
          if (ticket?.id && chunkTokens[idx]) ticketToToken.set(ticket.id, chunkTokens[idx]);
        });
      }
    }

    let pruned = 0;
    if (deadTokens.length) {
      const { error, count } = await supabase
        .from("push_tokens")
        .delete({ count: "exact" })
        .in("token", deadTokens);
      if (!error) pruned = count ?? deadTokens.length;
    }

    // Chequeo de receipts en background: la respuesta sale ya, la poda corre después.
    const edgeRuntime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(pruneByReceipts(supabase, ticketToToken));

    return json({ ok: true, sent: messages.length, pruned, results });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
