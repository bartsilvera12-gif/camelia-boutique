import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { finalPrice, formatGs } from "@/lib/format";
import { productColor, productPhotos } from "@/lib/images";
import type { Category, Product } from "@/lib/types";
import QuickToggle from "./QuickToggle";

export default async function AdminProductosPage({ searchParams }: { searchParams: { q?: string; cat?: string; ok?: string } }) {
  const { sb } = await requireAdmin();
  let q = sb.from("products").select("*").order("created_at", { ascending: false });
  if (searchParams.q) q = q.ilike("name", `%${searchParams.q}%`);
  if (searchParams.cat) q = q.eq("category_id", searchParams.cat);
  const [{ data: products, error }, { data: cats }] = await Promise.all([
    q,
    sb.from("categories").select("*").order("sort_order").order("name"),
  ]);
  const list = (products || []) as Product[];
  const categories = (cats || []) as Category[];

  return (
    <>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-serif text-3xl text-ink">Productos</h1>
          <p className="text-sm text-thyme">{list.length} producto{list.length === 1 ? "" : "s"} · precios, stock e imágenes.</p>
        </div>
        <Link href="/admin/productos/nuevo" className="btn-primary !py-2 !px-4">+ Nuevo producto</Link>
      </div>

      {searchParams.ok && <div className="bg-thyme/15 text-thyme rounded-xl px-4 py-2 mb-4 text-sm">Producto guardado.</div>}
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <form className="flex flex-wrap gap-2 mb-4">
        <input name="q" defaultValue={searchParams.q} placeholder="Buscar por nombre…" className="input md:w-64" />
        <select name="cat" defaultValue={searchParams.cat || ""} className="input md:w-52">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-outline !py-2 !px-4">Filtrar</button>
      </form>

      <div className="bg-cream border border-champagne rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-champagne/60 text-thyme">
            <tr>
              <th className="text-left px-4 py-2">Producto</th>
              <th className="text-left px-4 py-2">Categoría</th>
              <th className="text-left px-4 py-2">Precio</th>
              <th className="text-left px-4 py-2">Stock</th>
              <th className="text-left px-4 py-2">Visible</th>
              <th className="text-left px-4 py-2">Destacado</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const photo = productPhotos(p)[0];
              return (
                <tr key={p.id} className="border-t border-champagne">
                  <td className="px-4 py-2">
                    <Link href={`/admin/productos/${p.id}`} className="flex items-center gap-3 group">
                      <div className="w-10 h-12 rounded-md overflow-hidden shrink-0" style={{ background: productColor(p) }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {photo && <img src={photo} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div>
                        <div className="font-serif text-base text-ink group-hover:text-rose">{p.name}</div>
                        <div className="text-[11px] text-thyme">{p.slug}{!photo && " · sin foto"}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2">{categories.find((c) => c.id === p.category_id)?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-rose">
                    {p.discount ? (
                      <>
                        {formatGs(finalPrice(p))}
                        <span className="block text-[11px] text-thyme line-through">{formatGs(p.price)}</span>
                        <span className="text-[10px] uppercase tracking-widest text-rose">-{p.discount}%</span>
                      </>
                    ) : (
                      formatGs(p.price)
                    )}
                  </td>
                  <td className={"px-4 py-2 " + (p.stock === 0 ? "text-rose" : p.stock <= 3 ? "text-bisque" : "")}>{p.stock}</td>
                  <td className="px-4 py-2"><QuickToggle id={p.id} field="active" value={p.active} /></td>
                  <td className="px-4 py-2"><QuickToggle id={p.id} field="featured" value={p.featured} /></td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-thyme">No hay productos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
