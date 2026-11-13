import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import type { Category, Product } from "@/lib/types";
import ProductForm from "../ProductForm";

export default async function EditarProductoPage({ params }: { params: { id: string } }) {
  const { sb } = await requireAdmin();
  const [{ data: product }, { data: cats }] = await Promise.all([
    sb.from("products").select("*").eq("id", params.id).maybeSingle(),
    sb.from("categories").select("*").order("sort_order").order("name"),
  ]);
  if (!product) notFound();
  return (
    <>
      <a href="/admin/productos" className="text-xs text-thyme hover:text-rose">← Productos</a>
      <h1 className="font-serif text-3xl text-ink mb-6 mt-1">{(product as Product).name}</h1>
      <ProductForm product={product as Product} categories={(cats || []) as Category[]} />
    </>
  );
}
