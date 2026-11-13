"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAction, slugify } from "@/lib/admin";
import { BUCKET } from "@/lib/supabase/config";

export type ProductFormState = { error?: string; ok?: boolean } | null;

function storagePath(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

export async function saveProduct(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  let id = String(fd.get("id") || "");
  try {
    const { sb } = await adminAction();
    const name = String(fd.get("name") || "").trim();
    if (!name) return { error: "El nombre es obligatorio." };
    const images = JSON.parse(String(fd.get("images") || "[]")) as string[];
    const removed = JSON.parse(String(fd.get("removed") || "[]")) as string[];
    const payload = {
      name,
      slug: slugify(String(fd.get("slug") || "") || name),
      description: String(fd.get("description") || "").trim() || null,
      keywords: String(fd.get("keywords") || "").trim() || null,
      price: Math.max(0, Math.round(Number(fd.get("price") || 0))),
      stock: Math.max(0, Math.round(Number(fd.get("stock") || 0))),
      discount: Math.max(0, Math.min(100, Math.round(Number(fd.get("discount") || 0)))),
      sizes: String(fd.get("sizes") || "")
        .split(/[,\n]/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 20),
      category_id: String(fd.get("category_id") || "") || null,
      featured: fd.get("featured") === "on",
      active: fd.get("active") === "on",
      images,
    };
    if (id) {
      const { error } = await sb.from("products").update(payload).eq("id", id);
      if (error) return { error: error.code === "23505" ? "Ya existe un producto con ese slug." : error.message };
    } else {
      const { data, error } = await sb.from("products").insert(payload).select("id").single();
      if (error) return { error: error.code === "23505" ? "Ya existe un producto con ese slug." : error.message };
      id = data.id;
    }
    const paths = removed.filter((u) => !images.includes(u)).map(storagePath).filter(Boolean) as string[];
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  } catch (e: any) {
    return { error: e.message || "Error al guardar" };
  }
  revalidatePath("/admin/productos");
  revalidatePath("/", "layout");
  redirect("/admin/productos?ok=1");
}

export async function deleteProduct(id: string) {
  const { sb } = await adminAction();
  const { data } = await sb.from("products").select("images").eq("id", id).maybeSingle();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const paths = ((data?.images || []) as string[]).map(storagePath).filter(Boolean) as string[];
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  revalidatePath("/admin/productos");
  revalidatePath("/", "layout");
  redirect("/admin/productos");
}

export async function quickUpdateProduct(id: string, patch: { active?: boolean; featured?: boolean; stock?: number; price?: number }) {
  const { sb } = await adminAction();
  const clean: Record<string, unknown> = {};
  if (typeof patch.active === "boolean") clean.active = patch.active;
  if (typeof patch.featured === "boolean") clean.featured = patch.featured;
  if (typeof patch.stock === "number" && patch.stock >= 0) clean.stock = Math.round(patch.stock);
  if (typeof patch.price === "number" && patch.price >= 0) clean.price = Math.round(patch.price);
  const { error } = await sb.from("products").update(clean).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/productos");
  revalidatePath("/", "layout");
  return { ok: true };
}
