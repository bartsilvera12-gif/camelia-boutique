// Corre el bot para un mensaje de WhatsApp, guarda todo y manda las respuestas.
// Lo usan la entrada de texto (/api/whatsapp/inbound) y la de fotos (/inbound/media).
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBot, type BotInput, type BotState } from "./engine";
import { botOrderCreator, draftLoader, loadBotData } from "./server";
import { formatForWhatsApp, notifyNewOrder, sendWhatsApp } from "../wa";

export type WaState = BotState & { waOptions?: { label: string; value: string }[]; waLetters?: boolean };

export type WaConv = { id: string; token: string; state?: unknown; visitor_phone?: string | null };

export async function replyOnWhatsApp(
  sb: SupabaseClient<any, any, any>,
  c: WaConv,
  to: string,
  msg: {
    text: string;
    kind: NonNullable<BotInput["kind"]>;
    /** mensaje del cliente a guardar junto con la respuesta (si todavía no se guardó) */
    clientMsg?: Record<string, unknown> | null;
    /** reconocer productos en una foto: recibe la lista de productos activos */
    image?: (products: BotInput["products"]) => Promise<BotInput["image"]>;
    fallbackPhone?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { settings, intents, products, slots, shipping } = await loadBotData(sb);
  const state = (c.state || {}) as WaState;
  const text = msg.text;

  // "2" → la opción 2 de la última lista que mandó el bot; si la lista era con letras,
  // "B" → la opción B (y un número se toma como lo que es, por ejemplo una cantidad)
  let value: string | undefined;
  if (msg.kind === "texto" && state.waOptions?.length) {
    const idx = state.waLetters
      ? (/^\s*([a-z])\s*[.)]?\s*$/i.exec(text)?.[1]?.toUpperCase().charCodeAt(0) ?? 0) - 65
      : Number(/^\s*(\d{1,2})\s*\.?\s*$/.exec(text)?.[1] ?? 0) - 1;
    const opt = idx >= 0 ? state.waOptions[idx] : undefined;
    if (opt) value = opt.value;
  }

  const image = msg.image ? await msg.image(products) : undefined;

  const result = await runBot({
    text,
    value,
    kind: msg.kind,
    image,
    state,
    settings,
    intents,
    products,
    slots,
    shipping,
    loadDraft: draftLoader(sb),
    visitorName: null, // el nombre de perfil de WhatsApp no siempre es el real: se pregunta
    visitorPhone: c.visitor_phone || msg.fallbackPhone || null,
    createOrder: botOrderCreator(sb, c, "whatsapp", notifyNewOrder),
  });

  const lastWithOptions = [...result.messages].reverse().find((x) => x.options?.length);
  const newState: WaState = {
    ...result.state,
    waOptions: lastWithOptions?.options || [],
    waLetters: !!lastWithOptions?.letters,
  };
  const outgoing = result.messages.map((x) => formatForWhatsApp(x.body, x.options, x.letters));

  // primero se guarda (así el eco de nuestros envíos se reconoce) y después se envía
  await sb.rpc("chat_append", {
    p_id: c.id,
    p_token: c.token,
    p_messages: [
      ...(msg.clientMsg ? [msg.clientMsg] : []),
      ...result.messages.map((x, i) => ({ sender: "bot", body: outgoing[i], options: x.options ?? null })),
    ],
    p_state: newState,
    p_needs_human: result.handoff || result.audio ? true : null,
    p_status: result.handoff ? "humano" : null,
    p_visitor_name: result.visitorName ?? null,
    p_visitor_phone: result.visitorPhone ?? null,
    p_has_audio: result.audio ?? null,
  });

  for (const body of outgoing) {
    const r = await sendWhatsApp(to, body);
    if (!r.ok) return r;
  }
  return { ok: true };
}
