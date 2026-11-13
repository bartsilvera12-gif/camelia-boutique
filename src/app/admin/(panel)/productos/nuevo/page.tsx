import { requireAdmin } from "@/lib/admin";
import type { Category } from "@/lib/types";
import ProductForm from "../ProductForm";

export default async function NuevoProductoPage() {
  const { sb } = await requireAdmin();
  const { data } = await sb.from("categories").select("*").order("sort_order").order("name");
  return (
    <>
      <a href="/admin/productos" className="text-xs text-thyme hover:text-rose">← Productos</a>
      <h1 className="font-serif text-3xl text-ink mb-6 mt-1">Nuevo producto</h1>
      <ProductForm categories={(data || []) as Category[]} />
    </>
  );
}
