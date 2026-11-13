"use server";
import { revalidatePath } from "next/cache";
import { adminAction, slugify } from "@/lib/admin";

export async function saveCategory(fd: FormData) {
  const { sb } = await adminAction();
  const id = String(fd.get("id") || "");
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  const payload = {
    name,
    slug: slugify(String(fd.get("slug") || "") || name),
    description: String(fd.get("description") || "").trim() || null,
    sort_order: Number(fd.get("sort_order") || 0),
    active: id ? fd.get("active") === "on" : true,
  };
  const { error } = id
    ? await sb.from("categories").update(payload).eq("id", id)
    : await sb.from("categories").insert(payload);
  if (error) throw new Error(error.code === "23505" ? "Ya existe una categoría con ese slug." : error.message);
  revalidatePath("/admin/categorias");
  revalidatePath("/", "layout");
}

export async function deleteCategory(id: string) {
  const { sb } = await adminAction();
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categorias");
  revalidatePath("/", "layout");
}
