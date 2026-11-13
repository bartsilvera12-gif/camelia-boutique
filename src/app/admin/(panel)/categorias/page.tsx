import { requireAdmin } from "@/lib/admin";
import type { Category } from "@/lib/types";
import { deleteCategory, saveCategory } from "./actions";
import ConfirmButton from "../ConfirmButton";

export default async function AdminCategoriasPage() {
  const { sb } = await requireAdmin();
  const [{ data }, { data: prods }] = await Promise.all([
    sb.from("categories").select("*").order("sort_order").order("name"),
    sb.from("products").select("category_id"),
  ]);
  const cats = (data || []) as Category[];
  const count = (id: string) => (prods || []).filter((p: any) => p.category_id === id).length;

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Categorías</h1>
      <p className="text-sm text-thyme mb-6">Organizá el catálogo. El orden define cómo aparecen en la tienda.</p>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-3">
          {cats.map((c) => (
            <form key={c.id} action={saveCategory} className="bg-cream border border-champagne rounded-xl p-4 grid sm:grid-cols-[1fr_1fr_80px] gap-3">
              <input type="hidden" name="id" value={c.id} />
              <div>
                <label className="label">Nombre</label>
                <input name="name" defaultValue={c.name} required className="input" />
              </div>
              <div>
                <label className="label">Slug</label>
                <input name="slug" defaultValue={c.slug} className="input" />
              </div>
              <div>
                <label className="label">Orden</label>
                <input name="sort_order" type="number" defaultValue={c.sort_order ?? 0} className="input" />
              </div>
              <div className="sm:col-span-3">
                <label className="label">Descripción</label>
                <input name="description" defaultValue={c.description || ""} className="input" />
              </div>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={c.active} /> Visible
                </label>
                <span className="text-xs text-thyme">{count(c.id)} producto(s)</span>
                <div className="ml-auto flex gap-3 items-center">
                  <ConfirmButton
                    action={deleteCategory.bind(null, c.id)}
                    message={`¿Eliminar la categoría "${c.name}"? Sus productos quedan sin categoría.`}
                    className="text-xs text-rose hover:underline"
                  >
                    Eliminar
                  </ConfirmButton>
                  <button className="btn-outline !py-1.5 !px-4 !text-xs">Guardar</button>
                </div>
              </div>
            </form>
          ))}
          {cats.length === 0 && <div className="text-sm text-thyme">Todavía no hay categorías.</div>}
        </div>

        <form action={saveCategory} className="bg-cream border border-champagne rounded-xl p-5 lg:sticky lg:top-8">
          <h2 className="font-serif text-lg text-ink mb-3">Nueva categoría</h2>
          <label className="label">Nombre</label>
          <input name="name" required className="input mb-3" />
          <label className="label">Slug</label>
          <input name="slug" className="input mb-3" placeholder="se genera solo" />
          <label className="label">Orden</label>
          <input name="sort_order" type="number" defaultValue={cats.length + 1} className="input mb-3" />
          <label className="label">Descripción</label>
          <textarea name="description" rows={3} className="input mb-4" />
          <button className="btn-primary w-full">Crear</button>
        </form>
      </div>
    </>
  );
}
