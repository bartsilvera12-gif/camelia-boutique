export function formatGs(v: number): string {
  return "Gs. " + Math.round(v).toLocaleString("es-PY");
}

export function truncate(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Precio final con la rebaja del producto (igual que calcula la base). */
export function finalPrice(p: { price: number; discount?: number | null }): number {
  const d = Math.max(0, Math.min(100, p.discount || 0));
  return Math.round((p.price * (100 - d)) / 100);
}
