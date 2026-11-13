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

/** "595992218503:80@s.whatsapp.net" → "+595 992 218 503". */
export function formatWaNumber(jid?: string | null): string {
  const d = String(jid || "").split(/[:@]/)[0].replace(/\D/g, "");
  if (!d) return "";
  const m = d.match(/^595(\d{3})(\d{3})(\d{3})$/);
  return m ? `+595 ${m[1]} ${m[2]} ${m[3]}` : `+${d}`;
}
