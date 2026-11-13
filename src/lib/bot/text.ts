// Utilidades de texto para el bot: normalización y comparación tolerante a errores.

export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = igual, 0 = nada que ver. Tolera 1 error en palabras de 4+ letras y 2 en 7+. */
export function wordSimilarity(q: string, w: string): number {
  if (q === w) return 1;
  if (q.length >= 4 && (w.startsWith(q) || q.startsWith(w)) && Math.min(q.length, w.length) >= 4) return 0.9;
  // singular / plural
  if (q.replace(/(es|s)$/, "") === w.replace(/(es|s)$/, "") && q.length >= 3) return 0.95;
  const d = levenshtein(q, w);
  if (d === 1 && Math.min(q.length, w.length) >= 4) return 0.8;
  if (d === 2 && Math.min(q.length, w.length) >= 7) return 0.6;
  return 0;
}

export const STOPWORDS = new Set(
  (
    "a al algo alguna alguno con cual cuanto cuantos cuesta cuestan de del disponible disponibles " +
    "el en es esta estan favor hay hola info informacion la las le lo los me mi necesito o para " +
    "pedir pedido por porfa precio precios que quiero quisiera sale salen se si son stock su tenes " +
    "tienen tiene un una unas uno unos ver y ya busco buscando comprar encargar mas tenés queria " +
    "buenas buen dia tardes noches hacer quiero pido pedi gracias"
  ).split(" ")
);

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, docena: 12,
};

export function parseQty(text: string): number | null {
  const n = normalize(text);
  const m = n.match(/\b(\d{1,3})\b/);
  if (m) return parseInt(m[1], 10);
  for (const t of n.split(" ")) if (NUMBER_WORDS[t]) return NUMBER_WORDS[t];
  return null;
}

export function parsePhone(text: string): string | null {
  const digits = (text || "").replace(/[^\d+]/g, "");
  const only = digits.replace(/\D/g, "");
  if (only.length < 6 || only.length > 15) return null;
  return digits;
}

const YES = ["si", "sí", "dale", "ok", "okay", "correcto", "confirmo", "confirmar", "listo", "perfecto", "de una", "obvio", "claro", "exacto", "va"];
const NO = ["no", "nop", "cancelar", "cancela", "cancelo", "incorrecto", "mal"];

export function isYes(text: string) {
  const n = normalize(text);
  return YES.some((y) => n === normalize(y) || n.startsWith(normalize(y) + " "));
}
export function isNo(text: string) {
  const n = normalize(text);
  return NO.some((y) => n === y || n.startsWith(y + " "));
}

// ---------- Fechas (zona horaria Paraguay) ----------

const TZ = "America/Asuncion";
const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

export function todayPY(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return new Date(parts + "T12:00:00Z");
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function parseDate(text: string): string | null {
  const n = normalize(text);
  const today = todayPY();
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return n;
  if (/pasado manana/.test(n)) return isoDate(addDays(today, 2));
  if (/\bmanana\b/.test(n)) return isoDate(addDays(today, 1));
  if (/\bhoy\b/.test(n)) return isoDate(today);
  const dm = n.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/);
  if (dm) {
    const day = +dm[1], month = +dm[2];
    let year = dm[3] ? +dm[3] : today.getUTCFullYear();
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let d = new Date(Date.UTC(year, month - 1, day, 12));
    if (d.getUTCMonth() !== month - 1) return null;
    if (!dm[3] && d < today) d = new Date(Date.UTC(year + 1, month - 1, day, 12));
    return isoDate(d);
  }
  for (let i = 0; i < 7; i++) {
    if (n.includes(DAYS[i])) {
      const diff = (i - today.getUTCDay() + 7) % 7 || 7;
      return isoDate(addDays(today, diff));
    }
  }
  return null;
}

export function formatDateEs(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
}
