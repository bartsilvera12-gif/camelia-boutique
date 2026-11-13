// Comunicación con el puente WhatsApp (Baileys) de Camélia. Solo servidor.
import "server-only";
import { formatGs } from "./format";
import { publicClient } from "./supabase/public";
import type { ChatOption } from "./types";

const BRIDGE_URL = (process.env.WA_BRIDGE_URL || "").replace(/\/+$/, "");
export const BRIDGE_SECRET = process.env.WA_BRIDGE_SECRET || "";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://camelia-boutique.vercel.app").replace(/\/+$/, "");

/** Prefijo de los avisos al responsable: así se reconoce su eco y no abre una conversación. */
export const ALERT_PREFIX = "🛍️ Nuevo pedido";

/** Reconoce el aviso aunque WhatsApp cambie el emoji del principio. */
export function isOrderAlert(text: string) {
  return /^\W{0,4}\s*Nuevo pedido #[0-9a-f]{8} desde /.test(text);
}

export function bridgeConfigured() {
  return Boolean(BRIDGE_URL && BRIDGE_SECRET);
}

/** "0981 123 456" → "595981123456". */
export function toWaDigits(phone: string | null | undefined): string {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "595" + d.slice(1);
  return d;
}

export async function sendWhatsApp(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!bridgeConfigured()) return { ok: false, error: "El puente de WhatsApp no está configurado" };
  try {
    const r = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": BRIDGE_SECRET },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `El puente respondió ${r.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "No se pudo contactar al puente" };
  }
}

export async function bridgeStatus(): Promise<{ connection: string; meNumber?: string | null } | null> {
  if (!bridgeConfigured()) return null;
  try {
    const r = await fetch(`${BRIDGE_URL}/status`, {
      headers: { "x-bridge-secret": BRIDGE_SECRET },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!r.ok) return { connection: `error ${r.status}` };
    return await r.json();
  } catch {
    return { connection: "sin respuesta" };
  }
}

/** QR crudo del puente (el texto que hay que dibujar) y el estado de la conexión. */
export async function bridgeQr(): Promise<{ connection: string; qr: string | null } | null> {
  if (!bridgeConfigured()) return null;
  try {
    const r = await fetch(`${BRIDGE_URL}/qr`, {
      headers: { "x-bridge-secret": BRIDGE_SECRET },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) return { connection: `error ${r.status}`, qr: null };
    const j = await r.json();
    return { connection: j.connection || "desconocido", qr: j.qr || null };
  } catch {
    return { connection: "sin respuesta", qr: null };
  }
}

export function bridgeQrPage() {
  return bridgeConfigured() ? `${BRIDGE_URL}/qr.html?secreto=${encodeURIComponent(BRIDGE_SECRET)}` : null;
}

/** Mensaje del bot para WhatsApp: los botones pasan a ser una lista numerada. */
export function formatForWhatsApp(body: string, options?: ChatOption[] | null, letters = false): string {
  if (!options?.length) return body;
  // con letras (A, B…) cuando el cliente también puede escribir un número (ej. una cantidad)
  const mark = (i: number) => (letters ? String.fromCharCode(65 + i) : String(i + 1));
  return `${body}\n\n${options.map((o, i) => `*${mark(i)}.* ${o.label}`).join("\n")}\n\n_Respondé con ${letters ? "la letra" : "el número"}._`;
}

const SOURCE: Record<string, string> = { web: "la web", bot: "el bot de la web", whatsapp: "el bot de WhatsApp" };

/** Avisa al responsable (Configuración → WhatsApp) que entró un pedido. Nunca lanza. */
export async function notifyNewOrder(orderId: string): Promise<void> {
  if (!bridgeConfigured()) return;
  try {
    const sb = publicClient();
    if (!sb) return;
    const { data } = await sb.rpc("wa_order_alert", { p_secret: BRIDGE_SECRET, p_order: orderId });
    const a = data as any;
    if (!a?.ok || !a.enabled || !a.order) return;
    const o = a.order;
    const fecha = o.delivery_date
      ? new Date(o.delivery_date + "T12:00:00Z").toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" })
      : null;
    const lines = [
      `${ALERT_PREFIX} #${String(o.id).slice(0, 8)} desde ${SOURCE[o.source] || o.source}`,
      ...(o.items || []).map((i: any) => `• ${i.qty} × ${i.name}`),
      `Total: ${formatGs(Number(o.total))}`,
      ...(fecha ? [`Para el ${fecha}`] : []),
      `Cliente: ${o.customer_name} · ${o.phone}`,
      "",
      `Tenés ${a.pending} pedido${a.pending === 1 ? "" : "s"} pendiente${a.pending === 1 ? "" : "s"}: ${SITE_URL}/admin/agenda`,
    ];
    await sendWhatsApp(toWaDigits(a.to), lines.join("\n"));
  } catch {
    // el aviso es accesorio: si falla, el pedido igual está en el panel
  }
}
