// Motor del bot por reglas: menús, palabras clave y pasos definidos.
// No inventa nada: responde con lo que el negocio cargó en el panel.

import { formatGs } from "../format";
import type { BotIntent, ChatOption, Product, StoreSettings } from "../types";
import {
  STOPWORDS, formatDateEs, isNo, isYes, isoDate, normalize, parseDate, parsePhone,
  parseQty, todayPY, tokens, wordSimilarity,
} from "./text";

export type BotState = {
  step?: "order_product" | "order_qty" | "order_date" | "order_name" | "order_phone" | "order_confirm";
  productId?: string;
  qty?: number;
  date?: string;
  name?: string;
  phone?: string;
  misses?: number;
  offlineSent?: boolean;
};

export type BotOut = { body: string; options?: ChatOption[] };

export type OrderRequest = {
  productId: string;
  qty: number;
  date: string;
  name: string;
  phone: string;
};

export type OrderResult =
  | { ok: true; orderId: string; total: number; status: string }
  | { ok: false; shortage?: { available: number }; error?: string };

export type BotInput = {
  text: string;
  value?: string;             // valor del botón tocado (si vino de un botón)
  kind?: "texto" | "audio";
  state: BotState;
  settings: StoreSettings;
  intents: BotIntent[];
  products: Product[];
  visitorName?: string | null;
  visitorPhone?: string | null;
  createOrder: (o: OrderRequest) => Promise<OrderResult>;
};

export type BotResult = {
  messages: BotOut[];
  state: BotState;
  handoff?: boolean;
  audio?: boolean;
  visitorName?: string;
  visitorPhone?: string;
};

// ---------------------------------------------------------------------

export function menuOptions(intents: BotIntent[]): ChatOption[] {
  return intents
    .filter((i) => i.active && i.menu_label)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ label: i.menu_label!, value: `intent:${i.id}` }));
}

export function welcome(settings: StoreSettings, intents: BotIntent[]): BotOut {
  return { body: settings.welcome_message, options: menuOptions(intents) };
}

// ---------- búsqueda de productos ----------

function productWords(p: Product): string[] {
  return tokens([p.name, p.category?.name, p.keywords].filter(Boolean).join(" "));
}

export function searchProducts(text: string, products: Product[]): Product[] {
  const q = tokens(text).filter((t) => !STOPWORDS.has(t) && t.length >= 3 && !/^\d+$/.test(t));
  if (!q.length) return [];
  const scored = products
    .map((p) => {
      const words = productWords(p);
      const nameWords = tokens(p.name);
      let sum = 0, hits = 0, nameHit = 0;
      for (const t of q) {
        let best = 0;
        for (const w of words) best = Math.max(best, wordSimilarity(t, w));
        if (best > 0) { hits++; sum += best; }
        if (nameWords.some((w) => wordSimilarity(t, w) >= 0.8)) nameHit++;
      }
      return { p, score: hits ? sum / q.length + nameHit * 0.25 : 0, hits };
    })
    .filter((x) => x.hits > 0 && x.score >= 0.4)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0].score;
  return scored.filter((x) => x.score >= top - 0.2).map((x) => x.p);
}

// ---------- intenciones ----------

function matchIntent(text: string, intents: BotIntent[]): BotIntent | null {
  const n = normalize(text);
  const toks = n.split(" ");
  let best: { i: BotIntent; s: number } | null = null;
  for (const i of intents) {
    if (!i.active) continue;
    let s = 0;
    for (const kwRaw of i.keywords || []) {
      const kw = normalize(kwRaw);
      if (!kw) continue;
      if (kw.includes(" ")) {
        if (n.includes(kw)) s += 2;
      } else if (toks.some((t) => t === kw)) {
        s += 1.5;
      } else if (kw.length >= 5 && toks.some((t) => wordSimilarity(t, kw) >= 0.8)) {
        s += 1;
      }
    }
    if (s > 0 && (!best || s > best.s || (s === best.s && i.sort_order < best.i.sort_order))) {
      best = { i, s };
    }
  }
  return best?.i ?? null;
}

// ---------- mensajes de producto ----------

function productLine(p: Product): string {
  const stock = p.stock > 0 ? `hay ${p.stock} ${p.stock === 1 ? "unidad" : "unidades"}` : "sin stock por ahora";
  return `*${p.name}* — ${formatGs(p.price)} (${stock})`;
}

function productOptions(list: Product[], prefix: "product" | "order"): ChatOption[] {
  return list.slice(0, 6).map((p) => ({ label: p.name, value: `${prefix}:${p.id}` }));
}

function showProduct(p: Product, products: Product[]): BotOut {
  if (p.stock > 0) {
    return {
      body: `${productLine(p)}.${p.description ? `\n${p.description}` : ""}`,
      options: [
        { label: "Pedir este", value: `order:${p.id}` },
        { label: "Ver otros productos", value: "menu:productos" },
      ],
    };
  }
  const alt = products
    .filter((x) => x.id !== p.id && x.stock > 0 && x.category_id === p.category_id)
    .slice(0, 4);
  return {
    body: `Ahora no tenemos stock de *${p.name}*.` + (alt.length ? " Te puedo ofrecer estos:" : ""),
    options: alt.length ? productOptions(alt, "product") : [{ label: "Ver productos", value: "menu:productos" }],
  };
}

function catalogOverview(products: Product[], intro?: string): BotOut {
  const list = products
    .filter((p) => p.stock > 0)
    .sort((a, b) => Number(b.featured) - Number(a.featured))
    .slice(0, 6);
  if (!list.length) return { body: "En este momento no tenemos productos con stock." };
  return {
    body: (intro ? intro + "\n\n" : "") + list.map(productLine).join("\n"),
    options: productOptions(list, "product"),
  };
}

// ---------- flujo de pedido ----------

const dateOptions = (): ChatOption[] => {
  const t = todayPY();
  const d = (n: number) => { const x = new Date(t); x.setUTCDate(x.getUTCDate() + n); return isoDate(x); };
  return [
    { label: "Hoy", value: `date:${d(0)}` },
    { label: "Mañana", value: `date:${d(1)}` },
    { label: "Pasado mañana", value: `date:${d(2)}` },
  ];
};

function askQty(p: Product): BotOut {
  const opts = [1, 2, 3].filter((n) => n <= p.stock).map((n) => ({ label: String(n), value: `qty:${n}` }));
  return { body: `${productLine(p)}.\n¿Cuántas unidades querés?`, options: opts };
}

function nextOrderStep(state: BotState, products: Product[]): { state: BotState; out: BotOut } {
  const p = products.find((x) => x.id === state.productId);
  if (!p) return { state: { ...state, step: "order_product", productId: undefined }, out: { body: "¿Qué producto querés pedir?" } };
  if (!state.qty) return { state: { ...state, step: "order_qty" }, out: askQty(p) };
  if (!state.date) return { state: { ...state, step: "order_date" }, out: { body: "¿Para qué día lo querés? Podés escribir una fecha (ej. 20/11) o un día (ej. viernes).", options: dateOptions() } };
  if (!state.name) return { state: { ...state, step: "order_name" }, out: { body: "¿A nombre de quién lo anotamos?" } };
  if (!state.phone) return { state: { ...state, step: "order_phone" }, out: { body: "¿A qué número de teléfono te contactamos?" } };
  const total = p.price * state.qty;
  return {
    state: { ...state, step: "order_confirm" },
    out: {
      body:
        `Entendí esto:\n• ${state.qty} × ${p.name} — ${formatGs(total)}\n• Para el ${formatDateEs(state.date)}\n` +
        `• A nombre de ${state.name} (${state.phone})\n¿Es correcto?`,
      options: [
        { label: "Sí, confirmar", value: "confirm:si" },
        { label: "Cambiar cantidad", value: "confirm:qty" },
        { label: "Cancelar", value: "confirm:no" },
      ],
    },
  };
}

function startOrder(p: Product, base: BotState, products: Product[]) {
  if (p.stock <= 0) return { state: { ...base, step: undefined }, out: showProduct(p, products) };
  return nextOrderStep({ ...base, productId: p.id, qty: undefined, step: "order_qty" }, products);
}

// ---------------------------------------------------------------------

export async function runBot(input: BotInput): Promise<BotResult> {
  const { settings, intents, products } = input;
  const st: BotState = {
    ...input.state,
    name: input.state.name || input.visitorName || undefined,
    phone: input.state.phone || input.visitorPhone || undefined,
  };
  const text = (input.text || "").trim();
  const value = input.value || "";
  const say = (out: BotOut | BotOut[], state: BotState, extra: Partial<BotResult> = {}): BotResult => ({
    messages: Array.isArray(out) ? out : [out],
    state,
    visitorName: state.name,
    visitorPhone: state.phone,
    ...extra,
  });
  const handoff = (state: BotState): BotResult =>
    say({ body: settings.handoff_message }, { ...state, step: undefined, misses: 0 }, { handoff: true });

  if (input.kind === "audio") {
    return say({ body: settings.audio_message, options: menuOptions(intents) }, st, { audio: true });
  }

  const n = normalize(text);

  // ----- botones -----
  const [vk, vv] = value.split(/:(.*)/s);
  if (vk === "intent") {
    const it = intents.find((i) => i.id === vv);
    if (it) return handleIntent(it, text, st);
  }
  if (vk === "menu" && vv === "productos") return say(catalogOverview(products, "Estos son algunos de nuestros productos:"), { ...st, step: undefined });
  if (vk === "menu") return say(welcome(settings, intents), { ...st, step: undefined });
  if (vk === "product") {
    const p = products.find((x) => x.id === vv);
    if (p) {
      if (st.step === "order_product") { const r = startOrder(p, st, products); return say(r.out, r.state); }
      return say(showProduct(p, products), { ...st, misses: 0 });
    }
  }
  if (vk === "order") {
    const p = products.find((x) => x.id === vv);
    if (p) { const r = startOrder(p, { ...st, misses: 0 }, products); return say(r.out, r.state); }
  }

  // ----- salir del flujo -----
  if (st.step && /^(menu|inicio|volver|cancelar|salir)$/.test(n)) {
    return say({ body: "Listo, cancelé el pedido en curso.", options: menuOptions(intents) }, clearOrder(st));
  }
  if (/^(menu|inicio|opciones|0)$/.test(n)) return say(welcome(settings, intents), { ...st, step: undefined });

  // ----- pasos del pedido -----
  if (st.step) {
    const r = await handleOrderStep(text, vk, vv, st);
    if (r) return r;
  }

  // ----- número de opción del menú -----
  const menu = menuOptions(intents);
  if (/^\d$/.test(n) && +n >= 1 && +n <= menu.length) {
    const it = intents.find((i) => `intent:${i.id}` === menu[+n - 1].value);
    if (it) return handleIntent(it, text, st);
  }

  const it = matchIntent(text, intents);
  if (it) return handleIntent(it, text, st);

  const found = searchProducts(text, products);
  if (found.length === 1) return say(showProduct(found[0], products), { ...st, misses: 0 });
  if (found.length > 1) {
    return say({ body: "Encontré estos productos:\n" + found.slice(0, 6).map(productLine).join("\n"), options: productOptions(found, "product") }, { ...st, misses: 0 });
  }

  // ----- no entendió -----
  const misses = (st.misses || 0) + 1;
  if (misses >= 2) return handoff({ ...st, misses: 0 });
  return say({ body: settings.fallback_message, options: menu }, { ...st, misses });

  // =================================================================

  function clearOrder(s: BotState): BotState {
    return { ...s, step: undefined, productId: undefined, qty: undefined, date: undefined, misses: 0 };
  }

  function handleIntent(i: BotIntent, txt: string, s: BotState): BotResult {
    const base = { ...s, misses: 0 };
    switch (i.action) {
      case "humano":
        return handoff(base);
      case "horarios":
        return say({ body: `${i.response ? i.response + "\n" : ""}${settings.hours}` }, base);
      case "pedido": {
        const found = searchProducts(txt, products);
        if (found.length === 1) { const r = startOrder(found[0], base, products); return say(r.out, r.state); }
        const list = (found.length ? found : products).filter((p) => p.stock > 0);
        return say(
          { body: `${i.response || "Armemos tu pedido."}\n¿Qué producto querés? Escribí el nombre o elegí uno:`, options: productOptions(list, "order") },
          { ...base, step: "order_product", productId: undefined, qty: undefined, date: undefined }
        );
      }
      case "productos": {
        const found = searchProducts(txt, products);
        if (found.length === 1) return say(showProduct(found[0], products), base);
        if (found.length > 1) return say({ body: "Encontré estos productos:\n" + found.slice(0, 6).map(productLine).join("\n"), options: productOptions(found, "product") }, base);
        return say(catalogOverview(products, i.response), base);
      }
      default: {
        // una respuesta fija; si además nombra un producto, lo mostramos
        const found = searchProducts(txt, products);
        const outs: BotOut[] = [];
        if (i.response) outs.push({ body: i.response });
        if (found.length === 1 && i.action === "respuesta") outs.push(showProduct(found[0], products));
        if (!outs.length) outs.push({ body: settings.fallback_message, options: menuOptions(intents) });
        return say(outs, base);
      }
    }
  }

  async function handleOrderStep(txt: string, k: string, v: string, s: BotState): Promise<BotResult | null> {
    const p = products.find((x) => x.id === s.productId);
    switch (s.step) {
      case "order_product": {
        const found = searchProducts(txt, products);
        if (found.length === 1) { const r = startOrder(found[0], s, products); return say(r.out, r.state); }
        if (found.length > 1) return say({ body: "¿Cuál de estos?", options: productOptions(found, "order") }, s);
        // quizás quiso otra cosa (ej. "horarios")
        const it = matchIntent(txt, intents);
        if (it && it.action !== "pedido") return null;
        return say({ body: "No encontré ese producto. Elegí uno de la lista o escribí otro nombre:", options: productOptions(products.filter((x) => x.stock > 0), "order") }, s);
      }
      case "order_qty": {
        if (!p) return null;
        const q = k === "qty" ? +v : parseQty(txt);
        if (!q || q <= 0) return say({ body: "Decime la cantidad con un número, por ejemplo 2." }, s);
        if (p.stock <= 0) return say(showProduct(p, products), clearOrder(s));
        if (q > p.stock) {
          return say({
            body: `Solo tenemos ${p.stock} ${p.stock === 1 ? "unidad" : "unidades"} de ${p.name}. ¿Querés llevar ${p.stock}?`,
            options: [{ label: `Sí, ${p.stock}`, value: `qty:${p.stock}` }, { label: "Elegir otro producto", value: "menu:productos" }],
          }, s);
        }
        const r = nextOrderStep({ ...s, qty: q }, products);
        return say(r.out, r.state);
      }
      case "order_date": {
        const d = k === "date" ? v : parseDate(txt);
        if (!d) return say({ body: "No entendí la fecha. Escribila como 20/11 o elegí una opción:", options: dateOptions() }, s);
        if (d < isoDate(todayPY())) return say({ body: "Esa fecha ya pasó. ¿Para qué día lo querés?", options: dateOptions() }, s);
        const r = nextOrderStep({ ...s, date: d }, products);
        return say(r.out, r.state);
      }
      case "order_name": {
        const name = txt.replace(/^(soy|me llamo|mi nombre es)\s+/i, "").trim();
        if (name.length < 2) return say({ body: "¿Me decís tu nombre?" }, s);
        const r = nextOrderStep({ ...s, name: name.slice(0, 80) }, products);
        return say(r.out, r.state);
      }
      case "order_phone": {
        const ph = parsePhone(txt);
        if (!ph) return say({ body: "Ese número no parece válido. Escribilo así: 0981 123 456" }, s);
        const r = nextOrderStep({ ...s, phone: ph }, products);
        return say(r.out, r.state);
      }
      case "order_confirm": {
        if (!p) return null;
        if (v === "qty") return say(askQty(p), { ...s, step: "order_qty", qty: undefined });
        if (v === "no" || (!v && isNo(txt))) {
          return say({ body: "Listo, no anoté nada. ¿Te ayudo con algo más?", options: menuOptions(intents) }, clearOrder(s));
        }
        if (v === "si" || isYes(txt)) {
          const res = await input.createOrder({ productId: p.id, qty: s.qty!, date: s.date!, name: s.name!, phone: s.phone! });
          if (res.ok) {
            const conf = res.status === "confirmado"
              ? "Ya está confirmado ✅"
              : "Una persona del equipo lo va a confirmar en breve.";
            return say(
              { body: `¡Listo! Tu pedido #${res.orderId.slice(0, 8)} quedó agendado para el ${formatDateEs(s.date!)}. Total: ${formatGs(res.total)}.\n${conf}`, options: menuOptions(intents) },
              clearOrder(s)
            );
          }
          if (res.shortage) {
            const avail = res.shortage.available;
            if (avail <= 0) {
              return say({ body: `Uy, justo se agotó *${p.name}*. ¿Querés ver otros productos?`, options: [{ label: "Ver productos", value: "menu:productos" }] }, clearOrder(s));
            }
            return say({
              body: `Uy, justo cambió el stock: ahora quedan ${avail} de ${p.name}. ¿Cuántas querés?`,
              options: Array.from({ length: Math.min(avail, 3) }, (_, i) => ({ label: String(i + 1), value: `qty:${i + 1}` })),
            }, { ...s, step: "order_qty", qty: undefined });
          }
          return say({ body: "No pude guardar el pedido por un problema técnico. Te paso con una persona del equipo." }, clearOrder(s), { handoff: true });
        }
        return say({ body: "¿Confirmo el pedido?", options: [{ label: "Sí, confirmar", value: "confirm:si" }, { label: "Cancelar", value: "confirm:no" }] }, s);
      }
    }
    return null;
  }
}
