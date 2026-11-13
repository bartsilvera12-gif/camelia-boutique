import { publicClient } from "./supabase/public";
import { supabaseConfigured } from "./supabase/config";
import { demoCategories, demoProducts, withCategory } from "./demo-data";
import { cache } from "react";
import type { Category, DeliverySlot, Product, StoreSettings } from "./types";

export async function getCategories(): Promise<Category[]> {
  const sb = publicClient();
  if (!sb) return demoCategories;
  const { data, error } = await sb
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error || !data) return [];
  return data as Category[];
}

export async function getProducts(opts?: {
  featured?: boolean;
  categorySlug?: string;
  search?: string;
  onSale?: boolean;
}): Promise<Product[]> {
  const sb = publicClient();
  if (!sb) {
    let list = demoProducts.filter((p) => p.active);
    if (opts?.featured) list = list.filter((p) => p.featured);
    if (opts?.onSale) list = list.filter((p) => (p.discount ?? 0) > 0);
    if (opts?.categorySlug) {
      const c = demoCategories.find((c) => c.slug === opts.categorySlug);
      list = list.filter((p) => p.category_id === c?.id);
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list.map(withCategory);
  }
  let q = sb
    .from("products")
    .select("*, category:categories(*)")
    .eq("active", true);
  if (opts?.featured) q = q.eq("featured", true);
  if (opts?.onSale) q = q.gt("discount", 0);
  if (opts?.search) q = q.ilike("name", `%${opts.search}%`);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error || !data) return [];
  let list = data as Product[];
  if (opts?.categorySlug) {
    list = list.filter((p) => p.category?.slug === opts.categorySlug);
  }
  return list;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const sb = publicClient();
  if (!sb) {
    const p = demoProducts.find((p) => p.slug === slug && p.active);
    return p ? withCategory(p) : null;
  }
  const { data } = await sb
    .from("products")
    .select("*, category:categories(*)")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return (data as Product) || null;
}

export async function getRelated(product: Product, limit = 4): Promise<Product[]> {
  const all = await getProducts();
  return all.filter((p) => p.id !== product.id && p.category_id === product.category_id).slice(0, limit);
}

export { supabaseConfigured };

/** Datos públicos del negocio (Configuración del panel). Una consulta por request. */
export const getStoreSettings = cache(async (): Promise<StoreSettings | null> => {
  const sb = publicClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc("bot_config");
  if (error || !data) return null;
  return (data as any).settings as StoreSettings;
});

/** Turnos de entrega con lugar libre. */
export async function getAvailableSlots(): Promise<DeliverySlot[]> {
  const sb = publicClient();
  if (!sb) return [];
  const { data } = await sb.rpc("available_slots", { p_days: null });
  return (data || []) as DeliverySlot[];
}
