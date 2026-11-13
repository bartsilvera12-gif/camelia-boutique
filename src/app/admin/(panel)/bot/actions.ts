"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin";
import { bridgeLogout, bridgeStatus } from "@/lib/wa";

const TEXT_FIELDS = [
  "store_name", "whatsapp_number", "email", "address", "hours", "bot_name",
  "welcome_message", "fallback_message", "handoff_message", "offline_message", "audio_message",
  "notify_name", "notify_whatsapp", "notify_email",
] as const;
const BOOL_FIELDS = ["bot_enabled", "bot_auto_confirm", "wa_bot_enabled", "wa_notify_orders"] as const;

/** Guarda solo los campos presentes en el form (sirve para Bot y Configuración). */
export async function saveSettings(fd: FormData) {
  const { sb } = await adminAction();
  const patch: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) if (fd.has(f)) patch[f] = String(fd.get(f) || "").trim() || null;
  // checkboxes: el form marca cuáles maneja con un hidden "_bools"
  const bools = String(fd.get("_bools") || "").split(",").filter(Boolean);
  for (const f of BOOL_FIELDS) if (bools.includes(f)) patch[f] = fd.get(f) === "on";
  if (fd.has("human_pause_minutes")) {
    patch.human_pause_minutes = Math.max(0, Math.min(10080, Math.round(Number(fd.get("human_pause_minutes") || 0))));
  }
  for (const f of ["store_name", "whatsapp_number", "hours", "bot_name", "welcome_message", "fallback_message", "handoff_message", "offline_message", "audio_message"]) {
    if (f in patch && !patch[f]) delete patch[f]; // obligatorios: no se vacían
  }
  const { error } = await sb.from("settings").update(patch).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

export async function setBotEnabled(on: boolean) {
  const { sb } = await adminAction();
  const { error } = await sb.from("settings").update({ bot_enabled: on }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

export async function saveIntent(fd: FormData) {
  const { sb } = await adminAction();
  const id = String(fd.get("id") || "");
  const keywords = String(fd.get("keywords") || "")
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const action = String(fd.get("action") || "respuesta");
  const payload = {
    name: String(fd.get("name") || "").trim() || "Sin nombre",
    keywords,
    response: String(fd.get("response") || "").trim(),
    action: ["respuesta", "productos", "pedido", "humano", "horarios"].includes(action) ? action : "respuesta",
    menu_label: String(fd.get("menu_label") || "").trim() || null,
    sort_order: Number(fd.get("sort_order") || 0),
    active: id ? fd.get("active") === "on" : true,
  };
  const { error } = id
    ? await sb.from("bot_intents").update(payload).eq("id", id)
    : await sb.from("bot_intents").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bot");
}

export async function deleteIntent(id: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("bot_intents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bot");
}

/** Pone en los botones de la tienda el número que está vinculado al puente. */
export async function applyConnectedNumber() {
  const { sb } = await adminAction();
  const st = await bridgeStatus();
  const digits = st?.connection === "open" ? String(st.meNumber || "").split(/[:@]/)[0].replace(/\D/g, "") : "";
  if (!digits) throw new Error("El WhatsApp no está conectado");
  const { error } = await sb.from("settings").update({ whatsapp_number: digits }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

/** Desvincula el WhatsApp de la tienda: el bot deja de atender hasta escanear un QR nuevo. */
export async function disconnectWhatsApp() {
  await adminAction();
  const r = await bridgeLogout();
  if (!r.ok) throw new Error(r.error || "No se pudo desconectar");
  revalidatePath("/admin/configuracion");
}
