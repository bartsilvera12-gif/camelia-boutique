// Piezas del bot que usan la base: compartidas por el chat web y WhatsApp.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BotIntent, DeliverySlot, Product, StoreSettings } from "../types";
import type { OrderRequest, OrderResult } from "./engine";

export async function loadBotData(sb: SupabaseClient<any, any, any>) {
  const [{ data: cfg, error }, { data: prods }, { data: slots }] = await Promise.all([
    sb.rpc("bot_config"),
    sb.from("products").select("*, category:categories(*)").eq("active", true),
    sb.rpc("available_slots", { p_days: null }),
  ]);
  if (error) throw new Error(error.message);
  return {
    settings: (cfg as any).settings as StoreSettings,
    intents: ((cfg as any).intents || []) as BotIntent[],
    products: (prods || []) as Product[],
    slots: (slots || []) as DeliverySlot[],
  };
}

/** Crea el pedido que armó el bot (la base revalida stock y cupo del turno con bloqueo). */
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
        address: o.mode === "envio" ? o.address || "" : "",
        delivery: o.mode === "retiro" ? "pickup" : "delivery",
        payment: o.payment,
        delivery_date: o.date,
        delivery_slot_id: o.slotId,
        notes: source === "whatsapp" ? "Pedido tomado por el bot de WhatsApp" : "Pedido tomado por el bot de la web",
        conversation_id: conv.id,
        conversation_token: conv.token,
        items: [
          { product_id: o.productId, size: o.size || null, qty: o.qty },
          ...(o.extra ? [{ product_id: o.extra.productId, size: o.extra.size || null, qty: o.extra.qty }] : []),
        ],
      },
    });
    if (error) return { ok: false, error: error.message };
    const r = data as any;
    if (r?.ok) {
      if (onCreated) await onCreated(r.order_id);
      return { ok: true, orderId: r.order_id, total: Number(r.total), status: r.status };
    }
    if (r?.error === "stock") {
      const sh = r.shortages?.[0];
      return { ok: false, shortage: { available: Number(sh?.available ?? 0), productId: sh?.product_id } };
    }
    if (r?.error === "slot_full" || r?.error === "slot") return { ok: false, slotTaken: true };
    return { ok: false, error: r?.error };
  };
}
