"use server";
import { publicClient } from "@/lib/supabase/public";
import { getStoreSettings } from "@/lib/data";
import { waNumber } from "@/lib/whatsapp";
import type { CartItem, ShippingMethod } from "@/lib/types";
import type { Coupon } from "@/lib/coupons";

export type CheckoutOptions = { shipping: ShippingMethod[] };

/** Tipos de envío con su costo (se cargan en Entregas y pagos). */
export async function getCheckoutOptions(): Promise<CheckoutOptions> {
  const sb = publicClient();
  if (!sb) return { shipping: [] };
  const { data } = await sb.rpc("bot_config");
  return { shipping: ((data as any)?.shipping || []) as ShippingMethod[] };
}

/** Valida un cupón contra la base. */
export async function checkCoupon(code: string): Promise<Coupon | null> {
  const sb = publicClient();
  if (!sb || !code.trim()) return null;
  const { data } = await sb.rpc("check_coupon", { p_code: code });
  const r = data as any;
  return r?.ok ? { code: r.code, percent: Number(r.percent), label: r.label } : null;
}

export type StartResult = { ok: true; code: string; url: string } | { ok: false; error: string };

/**
 * Guarda el carrito en la base y arma el link de WhatsApp con el código.
 * El bot toma ese código, muestra el resumen y pide lo que falta (día, dirección, pago).
 */
export async function startWhatsAppCheckout(input: {
  name: string;
  shippingId: string;
  couponCode?: string;
  items: CartItem[];
}): Promise<StartResult> {
  const sb = publicClient();
  if (!sb) return { ok: false, error: "La tienda no está conectada a la base" };
  if (!input.name.trim()) return { ok: false, error: "Escribí tu nombre" };
  if (!input.items.length) return { ok: false, error: "Tu carrito está vacío" };

  const { data, error } = await sb.rpc("create_cart_draft", {
    p: {
      name: input.name.trim(),
      shipping_method_id: input.shippingId || "",
      coupon: input.couponCode || "",
      items: input.items.map((i) => {
        const [productId, sizeFromId] = i.productId.split("::");
        return { product_id: productId, size: i.size || sizeFromId || null, qty: i.qty };
      }),
    },
  });
  if (error) return { ok: false, error: error.message };
  const r = data as any;
  if (!r?.ok) return { ok: false, error: r?.error || "No se pudo preparar el pedido" };

  const [settings, opts] = await Promise.all([getStoreSettings(), getCheckoutOptions()]);
  const envio = opts.shipping.find((m) => m.id === input.shippingId);
  const lineas = [
    "Hola Camélia! Quiero confirmar mi pedido 🌸",
    `Mi código de pedido: ${r.code}`,
    "",
    ...input.items.map((i) => `• ${i.qty} × ${i.name}`),
    envio ? `Envío: ${envio.name}` : "",
    `A nombre de: ${input.name.trim()}`,
  ].filter((l, idx, arr) => l !== "" || (idx > 0 && arr[idx - 1] !== ""));
  const url = `https://wa.me/${waNumber(settings?.whatsapp_number)}?text=${encodeURIComponent(lineas.join("\n"))}`;
  return { ok: true, code: r.code, url };
}
