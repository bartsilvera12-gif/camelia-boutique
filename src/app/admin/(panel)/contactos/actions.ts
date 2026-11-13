"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin";

export async function saveCustomer(fd: FormData) {
  const { sb } = await adminAction();
  const id = String(fd.get("id") || "");
  const payload = {
    name: String(fd.get("name") || "").trim(),
    phone: String(fd.get("phone") || "").trim(),
    email: String(fd.get("email") || "").trim() || null,
    address: String(fd.get("address") || "").trim() || null,
    city: String(fd.get("city") || "").trim() || null,
    notes: String(fd.get("notes") || "").trim() || null,
  };
  if (!payload.name || !payload.phone) throw new Error("Nombre y teléfono son obligatorios");
  const { error } = id
    ? await sb.from("customers").update(payload).eq("id", id)
    : await sb.from("customers").insert({ ...payload, source: "manual" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/contactos");
}

export async function deleteCustomer(id: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/contactos");
}
