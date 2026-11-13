// Entrada del puente WhatsApp (Baileys): cada mensaje que le escriben al número de la tienda.
// El puente reintenta si no respondemos 2xx, así que solo devolvemos error cuando el secreto
// está mal (401) o el pedido es inválido (400); el resto se contesta 200 aunque falle algo.
import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/public";
import { runBot, type BotState } from "@/lib/bot/engine";
import { botOrderCreator, draftLoader, loadBotData } from "@/lib/bot/server";
import { isOrderAlert, BRIDGE_SECRET, formatForWhatsApp, notifyNewOrder, sendWhatsApp } from "@/lib/wa";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Inbound = {
  fromDigits?: string;
  fromJid?: string;
  fromPhone?: string | null;
  waMessageId?: string | null;
  messageKind?: string;
  text?: string;
  hasMedia?: boolean;
  fromMe?: boolean;
  pushName?: string | null;
};

type WaState = BotState & { waOptions?: { label: string; value: string }[]; waLetters?: boolean };

const ok = (extra: object = {}) => NextResponse.json({ ok: true, ...extra });

export async function POST(req: Request) {
  if (!BRIDGE_SECRET || req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = publicClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase" }, { status: 503 });

  const m = (await req.json().catch(() => null)) as Inbound | null;
  if (!m || !m.fromDigits) return NextResponse.json({ ok: false, error: "payload" }, { status: 400 });

  const jid = m.fromJid || "";
  // grupos, estados y canales no se atienden
  if (/@g\.us$|@broadcast$|@newsletter$/.test(jid) || jid === "status@broadcast") return ok({ ignored: "grupo" });

  const text = (m.text || "").trim();
  // eco de los avisos de pedido al responsable
  if (m.fromMe && isOrderAlert(text)) return ok({ ignored: "aviso" });

  const { data: open, error } = await sb.rpc("wa_inbound", {
    p_secret: BRIDGE_SECRET,
    p_wa_id: m.fromDigits,
    p_message_id: m.waMessageId || "",
    p_phone: m.fromPhone || null,
    p_name: m.pushName || null,
  });
  if (error) return ok({ error: error.message }); // no hace falta que el puente reintente
  const c = open as any;
  if (!c?.ok) {
    return c?.error === "unauthorized"
      ? NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
      : ok({ error: c?.error });
  }
  if (c.duplicate) return ok({ duplicate: true });

  // ---- lo mandó el propio número de la tienda ----
  if (m.fromMe) {
    const recent: string[] = c.recent_out || [];
    // se compara solo letras y números: WhatsApp a veces cambia emojis o espacios en el eco
    const key = (x: string) => x.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase().slice(0, 160);
    const t = key(text);
    const isEcho = !t || recent.some((b) => {
      const k = key(b || "");
      return !!k && t.startsWith(k);
    });
    if (!isEcho) {
      // alguien del equipo respondió desde el celular: queda en el panel y el bot se pausa
      await sb.rpc("wa_agent_message", { p_secret: BRIDGE_SECRET, p_conversation: c.id, p_body: text });
    }
    return ok({ fromMe: true, echo: isEcho });
  }

  const kind = m.messageKind || "";
  const isAudio = /audioMessage/.test(kind);
  const otherMedia = !isAudio && m.hasMedia;
  const clientBody = text || (isAudio ? "🎤 Audio" : otherMedia ? `[${kind.replace("Message", "") || "archivo"}]` : "");
  if (!clientBody) return ok({ ignored: "vacío" });
  const clientMsg = { sender: "cliente", body: clientBody, kind: isAudio ? "audio" : "texto" };

  // ---- atiende el equipo o el bot de WhatsApp está apagado: solo se registra ----
  if (c.status === "humano" || !c.bot_enabled) {
    await sb.rpc("chat_append", {
      p_id: c.id, p_token: c.token, p_messages: [clientMsg],
      p_needs_human: c.status === "humano" ? null : true,
      p_has_audio: isAudio || null,
    });
    return ok({ bot: false });
  }

  // ---- archivo sin texto (foto, documento…): lo ve una persona ----
  if (otherMedia && !text) {
    const reply = "¡Gracias! Una persona del equipo va a revisar lo que enviaste y te responde por acá.";
    await sb.rpc("chat_append", {
      p_id: c.id, p_token: c.token,
      p_messages: [clientMsg, { sender: "bot", body: reply }],
      p_needs_human: true,
    });
    await sendWhatsApp(m.fromDigits, reply);
    return ok();
  }

  // ---- bot ----
  const { settings, intents, products, slots, shipping } = await loadBotData(sb);
  const state = (c.state || {}) as WaState;

  // "2" → la opción 2 de la última lista que mandó el bot; si la lista era con letras,
  // "B" → la opción B (y un número se toma como lo que es, por ejemplo una cantidad)
  let value: string | undefined;
  if (state.waOptions?.length) {
    const idx = state.waLetters
      ? (/^\s*([a-z])\s*[.)]?\s*$/i.exec(text)?.[1]?.toUpperCase().charCodeAt(0) ?? 0) - 65
      : Number(/^\s*(\d{1,2})\s*\.?\s*$/.exec(text)?.[1] ?? 0) - 1;
    const opt = idx >= 0 ? state.waOptions[idx] : undefined;
    if (opt) value = opt.value;
  }

  const result = await runBot({
    text,
    value,
    kind: isAudio ? "audio" : "texto",
    state,
    settings,
    intents,
    products,
    slots,
    shipping,
    loadDraft: draftLoader(sb),
    visitorName: null, // el nombre de perfil de WhatsApp no siempre es el real: se pregunta
    visitorPhone: c.visitor_phone || m.fromPhone || null,
    createOrder: botOrderCreator(sb, c, "whatsapp", notifyNewOrder),
  });

  const lastWithOptions = [...result.messages].reverse().find((x) => x.options?.length);
  const newState: WaState = {
    ...result.state,
    waOptions: lastWithOptions?.options || [],
    waLetters: !!lastWithOptions?.letters,
  };
  const outgoing = result.messages.map((x) => formatForWhatsApp(x.body, x.options, x.letters));

  // primero se guarda (así el eco de nuestros envíos se reconoce) y después se envía
  await sb.rpc("chat_append", {
    p_id: c.id,
    p_token: c.token,
    p_messages: [clientMsg, ...result.messages.map((x, i) => ({ sender: "bot", body: outgoing[i], options: x.options ?? null }))],
    p_state: newState,
    p_needs_human: result.handoff || result.audio ? true : null,
    p_status: result.handoff ? "humano" : null,
    p_visitor_name: result.visitorName ?? null,
    p_visitor_phone: result.visitorPhone ?? null,
    p_has_audio: result.audio ?? null,
  });

  for (const body of outgoing) {
    const r = await sendWhatsApp(m.fromDigits, body);
    if (!r.ok) return ok({ sendError: r.error });
  }
  return ok();
}
