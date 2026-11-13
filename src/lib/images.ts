import type { Product } from "./types";

const PALETTE = ["#F0C4CB", "#E5BCA9", "#FBEAD6", "#C87D87", "#6B7556"];

export function isImageUrl(s?: string | null): s is string {
  // URL absoluta (bucket) o ruta propia del sitio (/products/…)
  return !!s && (/^(https?:)?\/\//.test(s) || /^\/[^/]/.test(s));
}

/** Color de fondo cuando el producto todavía no tiene foto. */
export function productColor(p: Pick<Product, "images" | "slug">): string {
  const first = p.images?.[0];
  if (first && first.startsWith("#")) return first;
  let h = 0;
  for (const ch of p.slug || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function productPhotos(p: Pick<Product, "images">): string[] {
  return (p.images || []).filter(isImageUrl);
}
