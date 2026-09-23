// supabase/functions/_shared/expoPush.ts
//
// Envío a la Expo Push API compartido por send-push (push "en vivo" al crear un
// recordatorio/evento/etc.) y avisos-automaticos (cron). Antes cada función
// tenía su copia y ya se habían separado (avisos-automaticos no podaba por
// receipts). Recibe un mensaje por usuario, resuelve los push_tokens de cada
// uno, manda en lotes de 100 y poda los tokens muertos (DeviceNotRegistered):
// los que vienen en el ticket al toque, y los que aparecen en el receipt (con
// FCM casi siempre llegan ahí) en background vía EdgeRuntime.waitUntil.
//
// `sb` tiene que ser un cliente con service role (lee/borra tokens de todos).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
// Los receipts tardan en materializarse en Expo; ~20s alcanza para FCM/APNs.
const RECEIPTS_DELAY_MS = 20_000;

export type MensajePush = {
  usuario: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type Ticket = { id?: string; status?: string; message?: string; details?: { error?: string } };

async function podarPorReceipts(sb: SupabaseClient, ticketToToken: Map<string, string>) {
  if (!ticketToToken.size) return;
  await new Promise((r) => setTimeout(r, RECEIPTS_DELAY_MS));
  const ids = [...ticketToToken.keys()];
  const muertos: string[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(i, i + 300) }),
      });
      const receipts = ((await res.json())?.data ?? {}) as Record<string, Ticket>;
      for (const [id, rcpt] of Object.entries(receipts)) {
        if (rcpt?.status !== "error") continue;
        // Los logs de la función son la única visibilidad de fallas de entrega.
        console.error(`expoPush receipt error (${rcpt?.details?.error}): ${rcpt?.message}`);
        if (rcpt?.details?.error === "DeviceNotRegistered") {
          const token = ticketToToken.get(id);
          if (token) muertos.push(token);
        }
      }
    } catch (e) {
      console.error("expoPush getReceipts falló:", e);
    }
  }
  if (muertos.length) {
    const { error } = await sb.from("push_tokens").delete().in("token", muertos);
    if (!error) console.log(`expoPush: ${muertos.length} tokens muertos podados via receipts`);
  }
}

/** Manda un mensaje por usuario a todos sus dispositivos. */
export async function enviarPush(sb: SupabaseClient, mensajes: MensajePush[]) {
  if (!mensajes.length) return { sent: 0, pruned: 0, results: [] as unknown[] };

  const { data: tokens } = await sb
    .from("push_tokens")
    .select("usuario_id,token")
    .in("usuario_id", [...new Set(mensajes.map((m) => m.usuario))]);
  const tokensDe = new Map<string, string[]>();
  for (const t of tokens || []) {
    if (!t.token?.startsWith("ExponentPushToken")) continue;
    if (!tokensDe.has(t.usuario_id)) tokensDe.set(t.usuario_id, []);
    tokensDe.get(t.usuario_id)!.push(t.token);
  }

  const salida = mensajes.flatMap((m) =>
    (tokensDe.get(m.usuario) || []).map((to) => ({
      to,
      sound: "default",
      title: m.title,
      body: m.body,
      data: m.data || {},
      channelId: "default",
    })),
  );

  // Por cada lote, los tickets vuelven en el mismo orden que los mensajes.
  const results: unknown[] = [];
  const muertos: string[] = [];
  const ticketToToken = new Map<string, string>();
  for (let i = 0; i < salida.length; i += 100) {
    const lote = salida.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(lote),
      });
      const out = await res.json();
      results.push(out);
      const tickets = out?.data;
      if (Array.isArray(tickets)) {
        tickets.forEach((tk: Ticket, j: number) => {
          const token = lote[j]?.to;
          if (!token) return;
          if (tk?.status === "error" && tk?.details?.error === "DeviceNotRegistered") muertos.push(token);
          if (tk?.id) ticketToToken.set(tk.id, token);
        });
      }
    } catch (e) {
      console.error("expoPush: envío a Expo falló", e);
    }
  }

  let pruned = 0;
  if (muertos.length) {
    const { error, count } = await sb.from("push_tokens").delete({ count: "exact" }).in("token", muertos);
    if (!error) pruned = count ?? muertos.length;
  }

  // Receipts en background: quien llama responde ya, la poda corre después.
  const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(podarPorReceipts(sb, ticketToToken));

  return { sent: salida.length, pruned, results };
}
