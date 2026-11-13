"use server";
import { publicClient } from "@/lib/supabase/public";
import { getAvailableSlots, getStoreSettings } from "@/lib/data";
import type { CartItem, DeliverySlot } from "@/lib/types";
import type { Coupon } from "@/lib/coupons";
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
  slot?: string; // "YYYY-MM-DD|slot_id"
  couponCode?: string;
  items: CartItem[];
};

export type CheckoutResult =
  | { ok: true; orderId: string; subtotal: number; discount: number; total: number; demo: boolean }
  | { ok: false; error: string };

export type CheckoutOptions = {
  slots: DeliverySlot[];
  payments: string[];
  pickup: boolean;
};

/** Turnos libres y métodos de pago para el formulario. */
export async function getCheckoutOptions(): Promise<CheckoutOptions> {
  const [settings, slots] = await Promise.all([getStoreSettings(), getAvailableSlots()]);
  return {
    slots,
    payments: settings?.payment_methods?.length ? settings.payment_methods : ["Transferencia", "Efectivo", "Tarjeta"],
    pickup: settings?.pickup_enabled !== false,
  };
}

/** Valida un cupón contra la base. */
export async function checkCoupon(code: string): Promise<Coupon | null> {
  const sb = publicClient();
  if (!sb || !code.trim()) return null;
  const { data } = await sb.rpc("check_coupon", { p_code: code });
  const r = data as any;
  return r?.ok ? { code: r.code, percent: Number(r.percent), label: r.label } : null;
}

/** El carrito guarda "id::talle"; a la base van por separado. */
function splitCartId(id: string) {
  const [productId, size] = id.split("::");
  return { productId, size: size || null };
}

export async function createOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const sb = publicClient();
  if (!sb) {
    const orderId = "demo-" + Math.random().toString(36).slice(2, 10);
    const total = input.items.reduce((a, i) => a + i.price * i.qty, 0);
    return { ok: true, orderId, subtotal: total, discount: 0, total, demo: true };
  }

  // create_order valida stock y cupo del turno con bloqueo, y calcula precios,
  // rebajas y cupón con los datos de la base (no con lo que manda el navegador).
  const { data, error } = await sb.rpc("create_order", {
    p: {
      source: "web",
      name: input.name,
      phone: input.phone,
      email: input.email || "",
      address: input.delivery === "pickup" ? "" : input.address || "",
      city: input.city || "",
      delivery: input.delivery,
      payment: input.payment,
      notes: input.notes || "",
      coupon: input.couponCode || "",
      delivery_date: input.slot?.split("|")[0] || "",
      delivery_slot_id: input.slot?.split("|")[1] || "",
      items: input.items.map((i) => {
        const { productId, size } = splitCartId(i.productId);
        return { product_id: productId, size: i.size || size, qty: i.qty };
      }),
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
    if (r?.error === "slot_full" || r?.error === "slot") {
      return { ok: false, error: "Ese horario de entrega se acaba de ocupar. Elegí otro, por favor." };
    }
    if (r?.error === "cupon") return { ok: false, error: "El cupón ya no es válido. Quitalo e intentá de nuevo." };
    return { ok: false, error: r?.error || "No se pudo guardar el pedido" };
  }
  await notifyNewOrder(r.order_id);
  return {
    ok: true,
    orderId: r.order_id,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    total: Number(r.total),
    demo: false,
  };
}
