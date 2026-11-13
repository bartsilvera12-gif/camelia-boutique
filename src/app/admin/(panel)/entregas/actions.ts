"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin";

function refresh() {
  revalidatePath("/admin/entregas");
  revalidatePath("/admin/agenda");
}

export async function saveSlot(fd: FormData) {
  const { sb } = await adminAction();
  const id = String(fd.get("id") || "");
  const payload = {
    weekday: Number(fd.get("weekday")),
    start_time: String(fd.get("start_time") || ""),
    end_time: String(fd.get("end_time") || ""),
    capacity: Math.max(1, Math.round(Number(fd.get("capacity") || 1))),
    active: id ? fd.get("active") === "on" : true,
  };
  if (!(payload.weekday >= 0 && payload.weekday <= 6)) throw new Error("Día inválido");
  if (!payload.start_time || !payload.end_time || payload.end_time <= payload.start_time) {
    throw new Error("La hora de fin tiene que ser posterior a la de inicio");
  }
  const { error } = id
    ? await sb.from("delivery_slots").update(payload).eq("id", id)
    : await sb.from("delivery_slots").insert(payload);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteSlot(id: string) {
  const { sb } = await adminAction();
  // los pedidos ya agendados conservan día y horario (delivery_time); solo pierden el vínculo
  const { error } = await sb.from("delivery_slots").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function addClosedDay(fd: FormData) {
  const { sb } = await adminAction();
  const day = String(fd.get("day") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Fecha inválida");
  const { error } = await sb
    .from("delivery_closed_days")
    .upsert({ day, reason: String(fd.get("reason") || "").trim() || null });
  if (error) throw new Error(error.message);
  refresh();
}

export async function removeClosedDay(day: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("delivery_closed_days").delete().eq("day", day);
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveDeliverySettings(fd: FormData) {
  const { sb } = await adminAction();
  const payments = String(fd.get("payment_methods") || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
  const { error } = await sb.from("settings").update({
    payment_methods: payments,
    pickup_enabled: fd.get("pickup_enabled") === "on",
    delivery_lead_days: Math.max(0, Math.min(30, Math.round(Number(fd.get("delivery_lead_days") || 0)))),
    delivery_days_ahead: Math.max(1, Math.min(60, Math.round(Number(fd.get("delivery_days_ahead") || 14)))),
  }).eq("id", 1);
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveShipping(fd: FormData) {
  const { sb } = await adminAction();
  const id = String(fd.get("id") || "");
  const name = String(fd.get("name") || "").trim();
  if (!name) throw new Error("Poné un nombre");
  const kind = fd.get("kind") === "retiro" ? "retiro" : "envio";
  const payload = {
    name,
    description: String(fd.get("description") || "").trim() || null,
    price: Math.max(0, Math.round(Number(fd.get("price") || 0))),
    kind,
    sort_order: Math.round(Number(fd.get("sort_order") || 0)),
    active: id ? fd.get("active") === "on" : true,
  };
  const { error } = id
    ? await sb.from("shipping_methods").update(payload).eq("id", id)
    : await sb.from("shipping_methods").insert(payload);
  if (error) throw new Error(error.message);
  refresh();
  revalidatePath("/checkout");
}

export async function deleteShipping(id: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("shipping_methods").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
