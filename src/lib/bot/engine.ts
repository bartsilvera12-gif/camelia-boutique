// Motor del bot por reglas: menús, palabras clave y pasos definidos.
// No inventa nada: responde con lo que el negocio cargó en el panel.

import { finalPrice, formatGs } from "../format";
import type { BotIntent, ChatOption, DeliverySlot, Product, ShippingMethod, StoreSettings } from "../types";
import {
  STOPWORDS, isNo, isYes, normalize, parseDate, parsePhone, parseQty, tokens, wordSimilarity,
} from "./text";

type Step =
  | "order_product" | "order_size" | "order_qty" | "order_mode" | "order_slot" | "order_address"
  | "order_name" | "order_phone" | "order_payment" | "order_confirm" | "order_fill_size" | "order_cart_ok";

/** Segundo producto para completar la cantidad cuando no alcanza el stock del primero. */
export type ExtraItem = { productId: string; size?: string; qty: number };

export type BotState = {
  step?: Step;
  productId?: string;
  size?: string;
  qty?: number;
  wantQty?: number;     // cantidad que pidió cuando no alcanzaba el stock
  extra?: ExtraItem;    // producto parecido para completar
  fillId?: string;      // producto de relleno esperando talle
  mode?: "envio" | "retiro";
  cart?: ExtraItem[];   // carrito que vino de la web (por código)
  draftCode?: string;
  shippingId?: string;
  shippingName?: string;
  shippingCost?: number;
  coupon?: { code: string; percent: number };
  date?: string;
  slotId?: string;
  slotLabel?: string;
  address?: string;
  payment?: string;
  name?: string;
  phone?: string;
  misses?: number;
  offlineSent?: boolean;
};

// letters: en WhatsApp las opciones van con letras (A, B…) para no confundirlas con una cantidad
export type BotOut = { body: string; options?: ChatOption[]; letters?: boolean };

export type OrderRequest = {
  items: ExtraItem[];
  shippingId?: string;
  coupon?: string;
  draftCode?: string;
  date: string;
  slotId: string;
  mode: "envio" | "retiro";
  address?: string;
  payment: string;
  name: string;
  phone: string;
};

export type OrderResult =
  | { ok: true; orderId: string; total: number; status: string }
  | { ok: false; shortage?: { available: number; productId?: string }; slotTaken?: boolean; error?: string };

export type BotInput = {
  text: string;
  value?: string;             // valor del botón tocado (si vino de un botón)
  kind?: "texto" | "audio";
  state: BotState;
  settings: StoreSettings;
  intents: BotIntent[];
  products: Product[];
  slots: DeliverySlot[];      // turnos con lugar libre, en orden
  shipping?: ShippingMethod[]; // tipos de envío con su costo
  loadDraft?: (code: string) => Promise<CartDraft | null>;
  visitorName?: string | null;
  visitorPhone?: string | null;
  createOrder: (o: OrderRequest) => Promise<OrderResult>;
};

/** Carrito guardado desde el checkout de la web. */
export type CartDraft = {
  code: string;
  name: string;
  items: { product_id: string; size?: string | null; qty: number }[];
  shipping: ShippingMethod | null;
  coupon: { ok: boolean; code?: string; percent?: number } | null;
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

/**
 * Producto que viene del botón "Comprar por WhatsApp" de la web: el mensaje trae
 * `(ref: slug)` y el nombre entre comillas. Es exacto, no hace falta adivinar.
 */
export function productFromLink(text: string, products: Product[]): Product | null {
  const ref = text.match(/ref:\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  if (ref) {
    const p = products.find((x) => x.slug === ref);
    if (p) return p;
  }
  const quoted = text.match(/["“]([^"”]{3,80})["”]/)?.[1];
  if (quoted) {
    const q = normalize(quoted);
    const p = products.find((x) => normalize(x.name) === q);
    if (p) return p;
  }
  return null;
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

function priceText(p: Product): string {
  return p.discount
    ? `${formatGs(finalPrice(p))} (antes ${formatGs(p.price)}, -${p.discount}%)`
    : formatGs(p.price);
}

function productLine(p: Product): string {
  const stock = p.stock > 0 ? `hay ${p.stock} ${p.stock === 1 ? "unidad" : "unidades"}` : "sin stock por ahora";
  const talles = p.sizes?.length ? ` · talles ${p.sizes.join(", ")}` : "";
  return `*${p.name}* — ${priceText(p)} (${stock})${talles}`;
}

function productOptions(list: Product[], prefix: "product" | "order"): ChatOption[] {
  return list.slice(0, 6).map((p) => ({ label: p.name, value: `${prefix}:${p.id}` }));
}

function showProduct(p: Product, products: Product[], intro = ""): BotOut {
  if (p.stock > 0) {
    return {
      body: `${intro}${productLine(p)}.${p.description ? `\n${p.description}` : ""}`,
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

// ---------- turnos de entrega ----------

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function slotLabel(s: Pick<DeliverySlot, "date" | "start" | "end">): string {
  const d = new Date(s.date + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1} · ${s.start} a ${s.end}`;
}

const slotValue = (s: DeliverySlot) => `slot:${s.date}|${s.slot_id}`;

function slotOptions(slots: DeliverySlot[]): ChatOption[] {
  return slots.slice(0, 6).map((s) => ({ label: slotLabel(s), value: slotValue(s) }));
}

// ---------------------------------------------------------------------

export async function runBot(input: BotInput): Promise<BotResult> {
  const { settings, intents, products } = input;
  let slots = input.slots;
  const payments = (settings.payment_methods || []).filter(Boolean);
  const pickup = settings.pickup_enabled !== false;
  const shipping = (input.shipping || []).filter(Boolean);
  const shipLabel = (m: { name: string; price: number }) => `${m.name} — ${Number(m.price) ? formatGs(Number(m.price)) : "gratis"}`;

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
  const handoff = (state: BotState, body = settings.handoff_message): BotResult =>
    say({ body }, { ...state, step: undefined, misses: 0 }, { handoff: true });

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
      if (st.step === "order_product") return startOrder(p, st);
      return say(showProduct(p, products), { ...st, misses: 0 });
    }
  }
  if (vk === "order") {
    const p = products.find((x) => x.id === vv);
    if (p) return startOrder(p, { ...st, misses: 0 });
  }

  if (vk === "human") return handoff(st);

  // ----- carrito de la web: "Mi código de pedido: XXXXXX" -----
  const draftCode = /c[oó]digo(?:\s+de\s+pedido)?\s*:?\s*\*?\s*([A-HJ-NP-Z2-9]{6})\b/i.exec(text)?.[1]?.toUpperCase();
  if (draftCode && input.loadDraft) {
    const draft = await input.loadDraft(draftCode);
    if (!draft) {
      return say({
        body: `No encontré un pedido pendiente con el código ${draftCode} (puede que ya esté confirmado). ¿Lo armamos de nuevo?`,
        options: menuOptions(intents),
      }, clearOrder(st));
    }
    const avisos: string[] = [];
    const cart: ExtraItem[] = [];
    for (const it of draft.items) {
      const prod = products.find((x) => x.id === it.product_id);
      const nombre = prod?.name || "Un producto";
      if (!prod || prod.stock <= 0) { avisos.push(`*${nombre}* ya no tiene stock.`); continue; }
      const q = Math.min(Number(it.qty) || 1, prod.stock);
      if (q < it.qty) avisos.push(`De *${prod.name}* quedan ${prod.stock} (pediste ${it.qty}).`);
      cart.push({ productId: prod.id, size: it.size || undefined, qty: q });
    }
    const ship = draft.shipping;
    const base: BotState = {
      ...clearOrder(st),
      cart,
      draftCode,
      name: draft.name || st.name,
      shippingId: ship?.id,
      shippingName: ship?.name,
      shippingCost: ship ? Number(ship.price) : undefined,
      mode: ship ? (ship.kind === "retiro" ? "retiro" : "envio") : undefined,
      coupon: draft.coupon?.ok && draft.coupon.code ? { code: draft.coupon.code, percent: Number(draft.coupon.percent) } : undefined,
    };
    const nombre = (draft.name || "").split(" ")[0];
    if (!cart.length) {
      return say(
        [{ body: `¡Hola${nombre ? " " + nombre : ""}! Uy, los productos de tu pedido se agotaron 😔` }, catalogOverview(products, "Te muestro lo que tenemos:")],
        clearOrder(st)
      );
    }
    const intro = `¡Hola${nombre ? " " + nombre : ""}! Recibí tu pedido 🌸\n${resumen(base).texto}`;
    if (avisos.length) {
      return say({
        body: `${intro}\n\n⚠️ ${avisos.join("\n")}\n¿Seguimos con lo disponible?`,
        options: [
          { label: "Sí, seguir", value: "cart:ok" },
          { label: "Hablar con una persona", value: "human:1" },
        ],
      }, { ...base, step: "order_cart_ok" });
    }
    const r = next(base);
    return say([{ body: intro }, ...r.messages], r.state);
  }

  // ----- salir del flujo -----
  if (st.step && /^(menu|inicio|volver|cancelar|salir)$/.test(n)) {
    return say({ body: "Listo, cancelé el pedido en curso.", options: menuOptions(intents) }, clearOrder(st));
  }
  if (/^(menu|inicio|opciones|0)$/.test(n)) return say(welcome(settings, intents), { ...st, step: undefined });

  // ----- mensajes que arma la web -----
  // "Comprar por WhatsApp" de un producto: se responde disponibilidad y se ofrece pedirlo
  const linked = productFromLink(text, products);
  if (linked && !st.step) {
    const hola = /^\W*hola/i.test(text) ? "¡Hola! " : "";
    if (linked.stock > 0) {
      return say({
        body: `${hola}Sí, está disponible 🌸\n${productLine(linked)}.\n¿Querés que te lo reserve?`,
        options: [
          { label: "Sí, lo quiero", value: `order:${linked.id}` },
          { label: "Ver otros productos", value: "menu:productos" },
        ],
      }, { ...st, misses: 0 });
    }
    return say(showProduct(linked, products), { ...st, misses: 0 });
  }
  // pedido ya hecho en la web o carrito con varios productos: lo sigue una persona
  const webOrder = text.match(/pedido\s*#([0-9a-f]{8})/i)?.[1];
  if (webOrder) {
    return handoff(st, `¡Gracias! Ya tenemos tu pedido #${webOrder}. Una persona del equipo te confirma por acá la entrega y el pago.`);
  }
  if (/quisiera comprar/i.test(text) && (text.match(/•/g) || []).length >= 1) {
    return handoff(st, "¡Gracias! Recibí tu lista. Una persona del equipo revisa el stock y te responde por acá para coordinar entrega y pago.");
  }

  // ----- pasos del pedido -----
  if (st.step) {
    const r = await handleOrderStep(text, vk, vv, st);
    if (r) return r;
  }

  // ----- "¿qué días entregan?" → turnos libres de la agenda -----
  if (/\b(dias?|cuando|turnos?|horarios?|que hora)\b/.test(n) && /(entreg|envi|retir|deliver|llega)/.test(n)) {
    if (!slots.length) return say({ body: "Ahora no tenemos turnos de entrega libres. Si querés, te paso con una persona para coordinar." , options: menuOptions(intents) }, st);
    return say({
      body: `Estos son los próximos días y horarios disponibles:\n${slots.slice(0, 6).map((x) => `• ${slotLabel(x)}`).join("\n")}\n\n¿Querés hacer un pedido?`,
      options: menuOptions(intents),
    }, { ...st, misses: 0 });
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
    return {
      ...s, step: undefined, productId: undefined, size: undefined, qty: undefined, mode: undefined, date: undefined,
      wantQty: undefined, extra: undefined, fillId: undefined, cart: undefined, draftCode: undefined,
      shippingId: undefined, shippingName: undefined, shippingCost: undefined, coupon: undefined,
      slotId: undefined, slotLabel: undefined, payment: undefined, misses: 0,
    };
  }

  function startOrder(p: Product, base: BotState): BotResult {
    if (p.stock <= 0) return say(showProduct(p, products), { ...base, step: undefined });
    return next({ ...clearOrder(base), productId: p.id });
  }

  /** Productos parecidos con stock: misma categoría, precio más cercano primero. */
  function similares(p: Product): Product[] {
    return products
      .filter((x) => x.id !== p.id && x.stock > 0 && x.active !== false && x.category_id === p.category_id)
      .sort((a, b) => Math.abs(finalPrice(a) - finalPrice(p)) - Math.abs(finalPrice(b) - finalPrice(p)))
      .slice(0, 3);
  }

  /** Los ítems del pedido: el carrito de la web, o el producto elegido (+ el de relleno). */
  function itemsDe(s: BotState): ExtraItem[] {
    if (s.cart?.length) return s.cart;
    if (!s.productId || !s.qty) return [];
    return [{ productId: s.productId, size: s.size, qty: s.qty }, ...(s.extra ? [s.extra] : [])];
  }

  /** Líneas del pedido con precios, cupón, envío y total (igual que calcula la base). */
  function resumen(s: BotState): { texto: string; total: number } {
    const lineas: string[] = [];
    let sub = 0;
    for (const it of itemsDe(s)) {
      const prod = products.find((x) => x.id === it.productId);
      if (!prod) continue;
      const linea = finalPrice(prod) * it.qty;
      sub += linea;
      lineas.push(`• ${it.qty} × ${prod.name}${it.size ? ` (talle ${it.size})` : ""} — ${formatGs(linea)}`);
    }
    const desc = s.coupon ? Math.round((sub * s.coupon.percent) / 100) : 0;
    const env = s.shippingCost || 0;
    const total = sub - desc + env;
    if (desc) lineas.push(`• Cupón ${s.coupon!.code}: -${formatGs(desc)}`);
    if (s.shippingName) lineas.push(`• ${s.shippingName}: ${env ? formatGs(env) : "gratis"}`);
    lineas.push(`*Total: ${formatGs(total)}*`);
    return { texto: lineas.join("\n"), total };
  }

  /** Pregunta lo primero que falte del pedido. */
  function next(s: BotState): BotResult {
    if (!s.cart?.length) {
      const p = products.find((x) => x.id === s.productId);
      if (!p) return say({ body: "¿Qué producto querés pedir?" }, { ...s, step: "order_product" });
      if (p.sizes?.length && !s.size) {
        return say({
          body: `¿Qué talle de *${p.name}* querés?`,
          options: p.sizes.map((t) => ({ label: t, value: `size:${t}` })),
        }, { ...s, step: "order_size" });
      }
      if (!s.qty) {
        const hay = p.stock === 1 ? "queda 1" : `hay ${p.stock} disponibles`;
        return say({ body: `¿Cuántas querés? Escribí el número (${hay}).` }, { ...s, step: "order_qty" });
      }
    }
    if (!s.mode) {
      if (shipping.length) {
        return say({
          body: "¿Cómo lo querés recibir?",
          options: shipping.map((m) => ({ label: shipLabel(m), value: `ship:${m.id}` })),
        }, { ...s, step: "order_mode" });
      }
      if (!pickup) return next({ ...s, mode: "envio" });
      return say({
        body: "¿Cómo lo querés recibir?",
        options: [
          { label: "Envío a domicilio", value: "mode:envio" },
          { label: "Retiro en el local", value: "mode:retiro" },
        ],
      }, { ...s, step: "order_mode" });
    }
    if (!s.slotId) {
      if (!slots.length) {
        return handoff(s, "Ahora no tenemos turnos de entrega libres en la agenda. Te paso con una persona del equipo para coordinarlo.");
      }
      const que = s.mode === "retiro" ? "pasar a retirarlo" : "recibirlo";
      return say({
        body: `Estos son los próximos días y horarios disponibles para ${que}. Elegí uno o escribime el día que te queda bien (ej. viernes o 20/11):`,
        options: slotOptions(slots),
      }, { ...s, step: "order_slot" });
    }
    if (s.mode === "envio" && !s.address) {
      return say({ body: "¿A qué dirección lo enviamos? (calle, número, barrio y ciudad)" }, { ...s, step: "order_address" });
    }
    if (!s.name) return say({ body: "¿A nombre de quién lo anotamos?" }, { ...s, step: "order_name" });
    if (!s.phone) return say({ body: "¿A qué número de teléfono te contactamos?" }, { ...s, step: "order_phone" });
    if (!s.payment && payments.length) {
      return say({
        body: "¿Cómo vas a pagar?",
        options: payments.map((m) => ({ label: m, value: `pay:${m}` })),
      }, { ...s, step: "order_payment" });
    }
    const entrega = s.mode === "retiro"
      ? `Retiro en el local${settings.address ? ` (${settings.address})` : ""}`
      : `Envío a ${s.address}`;
    return say({
      body:
        `Entendí esto:\n${resumen(s).texto}\n\n` +
        `• ${entrega}\n• ${s.slotLabel}\n` +
        (s.payment ? `• Pago: ${s.payment}\n` : "") +
        `• A nombre de ${s.name} (${s.phone})\n¿Es correcto?`,
      options: [
        { label: "Sí, confirmar", value: "confirm:si" },
        { label: "Cambiar horario", value: "confirm:slot" },
        { label: "Cancelar", value: "confirm:no" },
      ],
    }, { ...s, step: "order_confirm" });
  }

  function chooseSlot(s: BotState, slot: DeliverySlot): BotResult {
    return next({ ...s, date: slot.date, slotId: slot.slot_id, slotLabel: slotLabel(slot) });
  }

  function handleIntent(i: BotIntent, txt: string, s: BotState): BotResult {
    const base = { ...s, misses: 0 };
    switch (i.action) {
      case "humano":
        return handoff(base);
      case "horarios": {
        const turnos = slots.length
          ? `\n\nPróximos turnos de entrega:\n${slots.slice(0, 5).map((x) => `• ${slotLabel(x)}`).join("\n")}`
          : "";
        return say({ body: `${i.response ? i.response + "\n" : ""}${settings.hours}${turnos}` }, base);
      }
      case "pedido": {
        const found = searchProducts(txt, products);
        if (found.length === 1) return startOrder(found[0], base);
        const list = (found.length ? found : products).filter((p) => p.stock > 0);
        return say(
          { body: `${i.response || "Armemos tu pedido."}\n¿Qué producto querés? Escribí el nombre o elegí uno:`, options: productOptions(list, "order") },
          { ...clearOrder(base), step: "order_product" }
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
    const nt = normalize(txt);
    switch (s.step) {
      case "order_product": {
        const found = searchProducts(txt, products);
        if (found.length === 1) return startOrder(found[0], s);
        if (found.length > 1) return say({ body: "¿Cuál de estos?", options: productOptions(found, "order") }, s);
        const it = matchIntent(txt, intents);
        if (it && it.action !== "pedido") return null; // quiso otra cosa (ej. "horarios")
        return say({ body: "No encontré ese producto. Elegí uno de la lista o escribí otro nombre:", options: productOptions(products.filter((x) => x.stock > 0), "order") }, s);
      }
      case "order_size": {
        if (!p) return null;
        const sizes = p.sizes || [];
        const want = k === "size" ? v : txt.replace(/^talle\s*/i, "").trim().toUpperCase();
        const size = sizes.find((t) => t.toUpperCase() === want.toUpperCase());
        if (!size) {
          return say({ body: `Ese talle no lo tenemos. Elegí uno de estos:`, options: sizes.map((t) => ({ label: t, value: `size:${t}` })) }, s);
        }
        return next({ ...s, size });
      }
      case "order_qty": {
        if (!p) return null;
        if (p.stock <= 0) return say(showProduct(p, products), clearOrder(s));
        // eligió completar con un producto parecido
        if (k === "fill") {
          const f = products.find((x) => x.id === v && x.stock > 0);
          const faltan = (s.wantQty || 0) - p.stock;
          if (!f || faltan <= 0) return say({ body: "Escribí la cantidad con un número, por ejemplo 2." }, s);
          const base: BotState = { ...s, qty: p.stock, wantQty: undefined };
          const extra: ExtraItem = { productId: f.id, qty: Math.min(faltan, f.stock) };
          if (f.sizes?.length) {
            const mismo = s.size ? f.sizes.find((t) => t.toUpperCase() === s.size!.toUpperCase()) : undefined;
            if (mismo) return next({ ...base, extra: { ...extra, size: mismo } });
            return say({
              body: `¿Qué talle de *${f.name}*?`,
              options: f.sizes.map((t) => ({ label: t, value: `size:${t}` })),
            }, { ...base, extra, fillId: f.id, step: "order_fill_size" });
          }
          return next({ ...base, extra });
        }
        const q = k === "qty" ? +v : parseQty(txt);
        if (!q || q <= 0) return say({ body: "Escribí la cantidad con un número, por ejemplo 2." }, s);
        if (q > p.stock) {
          const faltan = q - p.stock;
          const sim = similares(p);
          const unidades = p.stock === 1 ? "1 unidad" : `${p.stock} unidades`;
          const body =
            `No se puede: de *${p.name}* solo tenemos ${unidades} y pediste ${q}.` +
            (sim.length
              ? `\nPodés llevar ${p.stock === 1 ? "esa" : `las ${p.stock}`} y completar ${faltan === 1 ? "la que falta" : `las ${faltan} que faltan`} con algo parecido:\n` +
                sim.map((x) => `• ${productLine(x)}`).join("\n")
              : `\n¿Querés llevar ${p.stock === 1 ? "esa" : `las ${p.stock}`}?`) +
            `\nO escribí otra cantidad.`;
          return say({
            body,
            letters: true,
            options: [
              { label: `Llevar ${p.stock}`, value: `qty:${p.stock}` },
              ...sim.map((x) => ({ label: `Completar con ${x.name} (${Math.min(faltan, x.stock)})`, value: `fill:${x.id}` })),
            ],
          }, { ...s, wantQty: q });
        }
        return next({ ...s, qty: q, wantQty: undefined, extra: undefined });
      }
      case "order_fill_size": {
        const f = products.find((x) => x.id === s.fillId);
        if (!f || !s.extra) return next({ ...s, step: undefined, fillId: undefined, extra: undefined });
        const sizes = f.sizes || [];
        const want = k === "size" ? v : txt.replace(/^talle\s*/i, "").trim();
        const size = sizes.find((t) => t.toUpperCase() === want.toUpperCase());
        if (!size) {
          return say({ body: "Ese talle no lo tenemos. Elegí uno de estos:", options: sizes.map((t) => ({ label: t, value: `size:${t}` })) }, s);
        }
        return next({ ...s, extra: { ...s.extra, size }, fillId: undefined });
      }
      case "order_cart_ok": {
        if ((k === "cart" && v === "ok") || isYes(txt)) return next({ ...s, step: undefined });
        if (isNo(txt)) return handoff(s);
        return say({
          body: "¿Seguimos con lo disponible?",
          options: [{ label: "Sí, seguir", value: "cart:ok" }, { label: "Hablar con una persona", value: "human:1" }],
        }, s);
      }
      case "order_mode": {
        if (shipping.length) {
          const m = k === "ship"
            ? shipping.find((x) => x.id === v)
            : shipping.find((x) => nt.length >= 4 && normalize(x.name).includes(nt)) ||
              (/retir|buscar|paso|local|tienda/.test(nt) ? shipping.find((x) => x.kind === "retiro") : undefined) ||
              (/interior|encomienda/.test(nt) ? shipping.find((x) => /interior|encomienda/i.test(x.name)) : undefined) ||
              (/envi|delivery|domicilio|casa|manden|mandar/.test(nt) ? shipping.find((x) => x.kind === "envio") : undefined);
          if (!m) {
            return say({ body: "Elegí cómo lo querés recibir:", options: shipping.map((x) => ({ label: shipLabel(x), value: `ship:${x.id}` })) }, s);
          }
          return next({
            ...s, shippingId: m.id, shippingName: m.name, shippingCost: Number(m.price),
            mode: m.kind === "retiro" ? "retiro" : "envio",
          });
        }
        const mode = k === "mode" ? v
          : /retir|buscar|paso|local|tienda/.test(nt) ? "retiro"
          : /envi|delivery|domicilio|casa|manden|mandar/.test(nt) ? "envio" : null;
        if (mode !== "envio" && mode !== "retiro") return null;
        return next({ ...s, mode });
      }
      case "order_slot": {
        if (k === "slot") {
          const [date, id] = v.split("|");
          const slot = slots.find((x) => x.slot_id === id && x.date === date);
          if (slot) return chooseSlot(s, slot);
          return say({ body: "Ese horario ya no está disponible. Elegí otro:", options: slotOptions(slots) }, s);
        }
        const d = parseDate(txt);
        if (!d) {
          if (matchIntent(txt, intents)) return null;
          return say({ body: "Elegí uno de los horarios o escribime el día (ej. viernes o 20/11):", options: slotOptions(slots) }, s);
        }
        const that = slots.filter((x) => x.date === d);
        if (that.length === 1) return chooseSlot(s, that[0]);
        if (that.length > 1) return say({ body: "Ese día tenemos estos horarios:", options: slotOptions(that) }, s);
        return say({ body: "Ese día no tenemos turnos libres. Estos son los próximos disponibles:", options: slotOptions(slots) }, s);
      }
      case "order_address": {
        if (txt.length < 5) return say({ body: "Pasame la dirección completa, por favor (calle, número, barrio y ciudad)." }, s);
        return next({ ...s, address: txt.slice(0, 200) });
      }
      case "order_name": {
        const name = txt.replace(/^(soy|me llamo|mi nombre es)\s+/i, "").trim();
        if (name.length < 2) return say({ body: "¿Me decís tu nombre?" }, s);
        return next({ ...s, name: name.slice(0, 80) });
      }
      case "order_phone": {
        const ph = parsePhone(txt);
        if (!ph) return say({ body: "Ese número no parece válido. Escribilo así: 0981 123 456" }, s);
        return next({ ...s, phone: ph });
      }
      case "order_payment": {
        const pay = k === "pay" ? v
          : payments.find((m) => nt.includes(normalize(m)) || (nt.length >= 3 && normalize(m).includes(nt)));
        if (!pay) return say({ body: "¿Con cuál de estas opciones pagás?", options: payments.map((m) => ({ label: m, value: `pay:${m}` })) }, s);
        return next({ ...s, payment: pay });
      }
      case "order_confirm": {
        if (!itemsDe(s).length) return null;
        if (v === "slot") return next({ ...s, slotId: undefined, slotLabel: undefined, date: undefined });
        if (v === "no" || (!v && isNo(txt))) {
          return say({ body: "Listo, no anoté nada. ¿Te ayudo con algo más?", options: menuOptions(intents) }, clearOrder(s));
        }
        if (v === "si" || isYes(txt)) {
          const res = await input.createOrder({
            items: itemsDe(s), shippingId: s.shippingId, coupon: s.coupon?.code, draftCode: s.draftCode,
            date: s.date!, slotId: s.slotId!, mode: s.mode!,
            address: s.address, payment: s.payment || payments[0] || "A coordinar", name: s.name!, phone: s.phone!,
          });
          if (res.ok) {
            const conf = res.status === "confirmado"
              ? "Ya está confirmado ✅"
              : "Una persona del equipo lo va a confirmar en breve.";
            return say(
              { body: `¡Listo! Tu pedido #${res.orderId.slice(0, 8)} quedó agendado: ${s.slotLabel}. Total: ${formatGs(res.total)}.\n${conf}`, options: menuOptions(intents) },
              clearOrder(s)
            );
          }
          if (res.slotTaken) {
            slots = slots.filter((x) => !(x.slot_id === s.slotId && x.date === s.date));
            return say(
              { body: "Uy, ese horario se acaba de ocupar. Elegí otro:", options: slotOptions(slots) },
              { ...s, step: "order_slot", slotId: undefined, slotLabel: undefined, date: undefined }
            );
          }
          if (res.shortage && s.cart?.length) {
            const sid = res.shortage.productId;
            const avail = res.shortage.available;
            const prod = products.find((x) => x.id === sid);
            const cart = s.cart
              .map((it) => (it.productId === sid ? { ...it, qty: Math.min(it.qty, avail) } : it))
              .filter((it) => it.qty > 0);
            if (!cart.length) {
              return say({ body: "Uy, justo se agotó lo que pediste. ¿Querés ver otros productos?", options: [{ label: "Ver productos", value: "menu:productos" }] }, clearOrder(s));
            }
            const r = next({ ...s, cart });
            return say(
              [{ body: `Uy, justo cambió el stock de *${prod?.name || "un producto"}* (${avail <= 0 ? "se agotó" : avail === 1 ? "queda 1" : `quedan ${avail}`}). Ajusté tu pedido:` }, ...r.messages],
              r.state
            );
          }
          if (res.shortage && p) {
            const avail = res.shortage.available;
            const cual = products.find((x) => x.id === res.shortage!.productId) || p;
            if (cual.id === p.id && avail <= 0) {
              return say({ body: `Uy, justo se agotó *${p.name}*. ¿Querés ver otros productos?`, options: [{ label: "Ver productos", value: "menu:productos" }] }, clearOrder(s));
            }
            p.stock = cual.id === p.id ? avail : p.stock;
            return say(
              { body: `Uy, justo cambió el stock de *${cual.name}* (${avail === 1 ? "queda 1" : `quedan ${avail}`}). Escribí de nuevo cuántas querés de ${p.name}.` },
              { ...s, step: "order_qty", qty: undefined, extra: undefined, wantQty: undefined }
            );
          }
          return handoff(clearOrder(s), "No pude guardar el pedido por un problema técnico. Te paso con una persona del equipo.");
        }
        return say({ body: "¿Confirmo el pedido?", options: [{ label: "Sí, confirmar", value: "confirm:si" }, { label: "Cancelar", value: "confirm:no" }] }, s);
      }
    }
    return null;
  }
}
