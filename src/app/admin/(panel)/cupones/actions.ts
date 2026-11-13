"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin";

export async function saveCoupon(fd: FormData) {
  const { sb } = await adminAction();
  const original = String(fd.get("original") || "");
  const code = String(fd.get("code") || "").trim().toUpperCase().replace(/\s+/g, "");
  const percent = Math.round(Number(fd.get("percent") || 0));
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error("El código tiene que tener entre 3 y 30 letras o números");
  if (!(percent >= 1 && percent <= 100)) throw new Error("El porcentaje va de 1 a 100");
  const payload = {
    code,
    percent,
    label: String(fd.get("label") || "").trim() || null,
    valid_until: String(fd.get("valid_until") || "") || null,
    active: original ? fd.get("active") === "on" : true,
  };
  const { error } = original
    ? await sb.from("coupons").update(payload).eq("code", original)
    : await sb.from("coupons").insert(payload);
  if (error) throw new Error(error.code === "23505" ? "Ya existe un cupón con ese código" : error.message);
  revalidatePath("/admin/cupones");
}

export async function deleteCoupon(code: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("coupons").delete().eq("code", code);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cupones");
}
