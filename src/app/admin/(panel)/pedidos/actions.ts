"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

function refresh() {
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
  revalidatePath("/", "layout"); // el stock cambia al cancelar/reactivar
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  try {
    const { sb } = await adminAction();
    if (!ORDER_STATUSES.includes(status)) return { ok: false, error: "Estado inválido" };
    const { error } = await sb.from("orders").update({ status }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function updateOrderDate(id: string, date: string) {
  try {
    const { sb } = await adminAction();
    const { error } = await sb.from("orders").update({ delivery_date: date || null }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function deleteOrder(id: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
