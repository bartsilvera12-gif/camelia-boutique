"use server";
import { publicClient } from "@/lib/supabase/public";
import type { CartItem } from "@/lib/types";
import { notifyNewOrder } from "@/lib/wa";

export type CheckoutInput = {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  delivery: string;
  payment: string;
  notes?: string;
  items: CartItem[];
};

export type CheckoutResult =
  | { ok: true; orderId: string; total: number; demo: boolean }
  | { ok: false; error: string };

export async function createOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const sb = publicClient();
  if (!sb) {
    const orderId = "demo-" + Math.random().toString(36).slice(2, 10);
    const total = input.items.reduce((a, i) => a + i.price * i.qty, 0);
    return { ok: true, orderId, total, demo: true };
  }

  // create_order valida stock con bloqueo y toma los precios de la base.
  const { data, error } = await sb.rpc("create_order", {
    p: {
      source: "web",
      name: input.name,
      phone: input.phone,
      email: input.email || "",
      address: input.address || "",
      city: input.city || "",
      delivery: input.delivery,
      payment: input.payment,
      notes: input.notes || "",
      items: input.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    },
  });
  if (error) return { ok: false, error: error.message };
  const r = data as any;
  if (!r?.ok) {
    if (r?.error === "stock") {
      const det = (r.shortages || [])
        .map((s: any) => `${s.name ?? "Un producto"}: quedan ${s.available}`)
        .join(" · ");
      return { ok: false, error: `No alcanza el stock. ${det}` };
    }
    return { ok: false, error: r?.error || "No se pudo guardar el pedido" };
  }
  await notifyNewOrder(r.order_id);
  return { ok: true, orderId: r.order_id, total: Number(r.total), demo: false };
}
