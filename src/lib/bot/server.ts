// Piezas del bot que usan la base: compartidas por el chat web y WhatsApp.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BotIntent, Product, StoreSettings } from "../types";
import type { OrderRequest, OrderResult } from "./engine";

export async function loadBotData(sb: SupabaseClient<any, any, any>) {
  const [{ data: cfg, error }, { data: prods }] = await Promise.all([
    sb.rpc("bot_config"),
    sb.from("products").select("*, category:categories(*)").eq("active", true),
  ]);
  if (error) throw new Error(error.message);
  return {
    settings: (cfg as any).settings as StoreSettings,
    intents: ((cfg as any).intents || []) as BotIntent[],
    products: (prods || []) as Product[],
  };
}

/** Crea el pedido que armó el bot (revalida stock con bloqueo en la base). */
export function botOrderCreator(
  sb: SupabaseClient<any, any, any>,
  conv: { id: string; token: string },
  source: "bot" | "whatsapp",
  onCreated?: (orderId: string) => Promise<void>
) {
  return async (o: OrderRequest): Promise<OrderResult> => {
    const { data, error } = await sb.rpc("create_order", {
      p: {
        source,
        name: o.name,
        phone: o.phone,
        delivery_date: o.date,
        notes: source === "whatsapp" ? "Pedido tomado por el bot de WhatsApp" : "Pedido tomado por el bot de la web",
        conversation_id: conv.id,
        conversation_token: conv.token,
        items: [{ product_id: o.productId, qty: o.qty }],
      },
    });
    if (error) return { ok: false, error: error.message };
    const r = data as any;
    if (r?.ok) {
      if (onCreated) await onCreated(r.order_id);
      return { ok: true, orderId: r.order_id, total: Number(r.total), status: r.status };
    }
    if (r?.error === "stock") return { ok: false, shortage: { available: Number(r.shortages?.[0]?.available ?? 0) } };
    return { ok: false, error: r?.error };
  };
}
