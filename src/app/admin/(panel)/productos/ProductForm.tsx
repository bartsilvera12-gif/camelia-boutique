"use client";
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { browserClient } from "@/lib/supabase/browser";
import { BUCKET } from "@/lib/supabase/config";
import { isImageUrl } from "@/lib/images";
import type { Category, Product } from "@/lib/types";
import { saveProduct, deleteProduct } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary disabled:opacity-60" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>;
}

export default function ProductForm({ product, categories }: { product?: Product; categories: Category[] }) {
  const [state, action] = useFormState(saveProduct, null);
  const [images, setImages] = useState<string[]>((product?.images || []).filter(isImageUrl));
  const [removed, setRemoved] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [upErr, setUpErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUpErr(null);
    const sb = browserClient();
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        if (f.size > 8 * 1024 * 1024) throw new Error(`${f.name}: pesa más de 8 MB`);
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `products/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, cacheControl: "31536000" });
        if (error) throw new Error(error.message);
        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        setImages((imgs) => [...imgs, data.publicUrl]);
        setRemoved((r) => [...r, data.publicUrl]); // si no se guarda, se puede limpiar luego
      } catch (e: any) {
        setUpErr(e.message || "No se pudo subir la imagen");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function remove(url: string) {
    setImages((imgs) => imgs.filter((u) => u !== url));
    setRemoved((r) => (r.includes(url) ? r : [...r, url]));
  }
  function move(i: number, d: -1 | 1) {
    setImages((imgs) => {
      const j = i + d;
      if (j < 0 || j >= imgs.length) return imgs;
      const c = [...imgs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }

  return (
    <div className="max-w-4xl">
      <form action={action} className="grid md:grid-cols-2 gap-4 bg-cream border border-champagne rounded-xl p-6">
        {product && <input type="hidden" name="id" value={product.id} />}
        <input type="hidden" name="images" value={JSON.stringify(images)} />
        <input type="hidden" name="removed" value={JSON.stringify(removed)} />

        <div>
          <label className="label">Nombre</label>
          <input name="name" required defaultValue={product?.name} className="input" />
        </div>
        <div>
          <label className="label">Slug (URL)</label>
          <input name="slug" defaultValue={product?.slug} className="input" placeholder="se genera solo si lo dejás vacío" />
        </div>
        <div>
          <label className="label">Categoría</label>
          <select name="category_id" defaultValue={product?.category_id || ""} className="input">
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Precio (Gs.)</label>
            <input name="price" type="number" min={0} step={1} required defaultValue={product?.price ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Rebaja %</label>
            <input name="discount" type="number" min={0} max={100} step={1} defaultValue={product?.discount ?? 0} className="input" />
          </div>
          <div>
            <label className="label">Stock</label>
            <input name="stock" type="number" min={0} step={1} required defaultValue={product?.stock ?? 0} className="input" />
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="label">Talles</label>
          <input name="sizes" defaultValue={(product?.sizes || []).join(", ")} className="input" placeholder="XS, S, M, L, XL  (vacío = sin talles)" />
          <p className="text-[11px] text-thyme mt-1">Separados por coma. Con rebaja &gt; 0 el producto aparece en Rebajas.</p>
        </div>
        <div className="md:col-span-2">
          <label className="label">Descripción</label>
          <textarea name="description" rows={3} defaultValue={product?.description || ""} className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="label">Otras palabras para el bot</label>
          <input name="keywords" defaultValue={product?.keywords || ""} className="input" placeholder="ej: abrigo, campera, tapado" />
          <p className="text-[11px] text-thyme mt-1">Sinónimos con los que la gente puede buscar este producto en el chat.</p>
        </div>

        <div className="md:col-span-2">
          <label className="label">Imágenes</label>
          <div className="flex flex-wrap gap-3">
            {images.map((src, i) => (
              <div key={src} className="relative w-28 h-36 rounded-lg overflow-hidden border border-champagne group bg-champagne/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full h-full object-cover" />
                {i === 0 && <span className="absolute top-1 left-1 text-[9px] uppercase tracking-widest bg-thyme text-champagne rounded px-1.5 py-0.5">Portada</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/60 text-champagne text-xs opacity-0 group-hover:opacity-100 transition">
                  <button type="button" onClick={() => move(i, -1)} className="px-2 py-1">←</button>
                  <button type="button" onClick={() => remove(src)} className="px-2 py-1">Quitar</button>
                  <button type="button" onClick={() => move(i, 1)} className="px-2 py-1">→</button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-28 h-36 rounded-lg border-2 border-dashed border-bisque text-thyme text-xs flex flex-col items-center justify-center hover:border-thyme"
            >
              <span className="text-2xl leading-none">+</span>
              {uploading > 0 ? `Subiendo ${uploading}…` : "Subir fotos"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          </div>
          {upErr && <p className="text-xs text-rose mt-2">{upErr}</p>}
          <p className="text-[11px] text-thyme mt-1">Se guardan en el bucket <code>{BUCKET}</code>. La primera es la portada.</p>
        </div>

        <div className="md:col-span-2 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={product?.featured} /> Destacado</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={product ? product.active : true} /> Visible en la tienda</label>
        </div>

        {state?.error && <p className="md:col-span-2 text-sm text-rose">{state.error}</p>}

        <div className="md:col-span-2 flex flex-wrap gap-3">
          <Submit />
          <a href="/admin/productos" className="btn-outline">Cancelar</a>
        </div>
      </form>

      {product && (
        <form
          action={deleteProduct.bind(null, product.id)}
          onSubmit={(e) => { if (!confirm(`¿Eliminar "${product.name}"? No se puede deshacer.`)) e.preventDefault(); }}
          className="mt-4"
        >
          <button className="text-xs text-rose hover:underline">Eliminar producto</button>
        </form>
      )}
    </div>
  );
}
