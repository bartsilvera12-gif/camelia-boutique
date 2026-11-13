import { formatGs } from "./format";
import type { CartItem, Order, OrderItem } from "./types";

// Número de la tienda: el de Configuración en el panel (lo pasa el layout de la tienda);
// la variable de entorno queda solo como respaldo.
const FALLBACK = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "595981772872";

export function waNumber(n?: string | null): string {
  let d = String(n || FALLBACK).replace(/\D/g, "");
  if (d.startsWith("0")) d = "595" + d.slice(1);
  return d || FALLBACK;
}

export function waCartLink(items: CartItem[], total: number, number?: string | null, customer?: string) {
  const lines = [
    "Hola Camélia! Quisiera comprar:",
    "",
    ...items.map((i) => `• ${i.qty} × ${i.name} — ${formatGs(i.price * i.qty)}`),
    "",
    `Total: ${formatGs(total)}`,
    customer ? `A nombre de: ${customer}` : "",
  ].filter(Boolean);
  return `https://wa.me/${waNumber(number)}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/** El "(ref: slug)" le dice al bot exactamente qué producto es. */
export function waProductLink(name: string, price: number, slug: string, number?: string | null) {
  const text = `Hola Camélia! Me interesa "${name}" (ref: ${slug}), ${formatGs(price)}. ¿Está disponible?`;
  return `https://wa.me/${waNumber(number)}?text=${encodeURIComponent(text)}`;
}

export function waOrderLink(
  order: Order,
  items: OrderItem[] | CartItem[],
  extras?: { discount?: number; couponCode?: string; number?: string | null }
) {
  const hasDiscount = !!extras?.discount && extras.discount > 0;
  const subtotal = items.reduce((a, i: any) => a + i.price * i.qty, 0);
  const lines = [
    `Hola Camélia! Confirmo mi pedido #${order.id.slice(0, 8)}:`,
    "",
    ...items.map((i: any) => `• ${i.qty} × ${i.name} — ${formatGs(i.price * i.qty)}`),
    "",
    hasDiscount ? `Subtotal: ${formatGs(subtotal)}` : "",
    hasDiscount ? `Cupón ${extras!.couponCode}: -${formatGs(extras!.discount!)}` : "",
    `Total: ${formatGs(order.total)}`,
    `Nombre: ${order.customer_name}`,
    `Teléfono: ${order.phone}`,
    order.address ? `Dirección: ${order.address}${order.city ? `, ${order.city}` : ""}` : "",
    `Entrega: ${order.delivery === "pickup" ? "Retiro en el local" : "Delivery"}` +
      (order.delivery_date ? ` · ${order.delivery_date}${order.delivery_time ? ` ${order.delivery_time}` : ""}` : ""),
    `Pago: ${order.payment}`,
    order.notes ? `Obs: ${order.notes}` : "",
  ].filter(Boolean);
  return `https://wa.me/${waNumber(extras?.number)}?text=${encodeURIComponent(lines.join("\n"))}`;
}
