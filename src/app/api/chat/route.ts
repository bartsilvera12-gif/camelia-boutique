import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/public";
import { runBot, welcome, type BotState } from "@/lib/bot/engine";
import type { BotIntent, StoreSettings } from "@/lib/types";
import { botOrderCreator, loadBotData } from "@/lib/bot/server";
import { notifyNewOrder } from "@/lib/wa";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  token?: string;
  text?: string;
  value?: string;
  kind?: "texto" | "audio";
  after?: string;
};

const UUID = /^[0-9a-f-]{36}$/i;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Polling: mensajes nuevos (respuestas del equipo). */
export async function GET(req: Request) {
  const sb = publicClient();
  if (!sb) return bad("Supabase no configurado", 503);
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  const token = u.searchParams.get("token") || "";
  if (!UUID.test(id) || !UUID.test(token)) return bad("conversación inválida");
  const { data, error } = await sb.rpc("chat_poll", {
    p_id: id, p_token: token, p_after: u.searchParams.get("after") || null,
  });
  if (error) return bad(error.message, 500);
  if (!data) return bad("conversación inválida", 404);
  return NextResponse.json({ ok: true, ...(data as object) });
}

/** Abre la conversación (sin texto) o procesa un mensaje del visitante. */
export async function POST(req: Request) {
  const sb = publicClient();
  if (!sb) return bad("Supabase no configurado", 503);
  const body = (await req.json().catch(() => ({}))) as Body;
  const id = body.id && UUID.test(body.id) ? body.id : null;
  const token = body.token && UUID.test(body.token) ? body.token : null;
  const text = (body.text || "").toString().slice(0, 1000).trim();

  const [{ data: conv, error: e1 }, { data: cfg, error: e2 }] = await Promise.all([
    sb.rpc("chat_open", { p_id: id, p_token: token, p_channel: "web" }),
    sb.rpc("bot_config"),
  ]);
  if (e1 || e2) return bad((e1 || e2)!.message, 500);
  const c = conv as any;
  const settings = (cfg as any).settings as StoreSettings;
  const intents = ((cfg as any).intents || []) as BotIntent[];

  // ---- apertura: saludo inicial ----
  if (!text && body.kind !== "audio") {
    if (!c.messages?.length) {
      const first = settings.bot_enabled
        ? welcome(settings, intents)
        : { body: settings.offline_message };
      await sb.rpc("chat_append", {
        p_id: c.id, p_token: c.token,
        p_messages: [{ sender: "bot", body: first.body, options: (first as any).options ?? null }],
      });
      const again = await sb.rpc("chat_open", { p_id: c.id, p_token: c.token });
      return NextResponse.json({ ok: true, ...(again.data as object) });
    }
    return NextResponse.json({ ok: true, ...c });
  }

  const clientMsg = { sender: "cliente", body: text || "🎤 Audio", kind: body.kind === "audio" ? "audio" : "texto" };

  // ---- atiende una persona o el bot está apagado ----
  if (c.status === "humano" || !settings.bot_enabled) {
    const msgs: any[] = [clientMsg];
    const state = (c.state || {}) as BotState;
    let newState: BotState | null = null;
    if (!settings.bot_enabled && c.status !== "humano" && !state.offlineSent) {
      msgs.push({ sender: "bot", body: settings.offline_message });
      newState = { ...state, offlineSent: true };
    }
    await sb.rpc("chat_append", {
      p_id: c.id, p_token: c.token, p_messages: msgs,
      p_state: newState, p_needs_human: true,
    });
    return poll(sb, c.id, c.token, body.after);
  }

  // ---- bot ----
  const { products, slots } = await loadBotData(sb);

  const result = await runBot({
    text,
    value: body.value,
    kind: body.kind,
    state: (c.state || {}) as BotState,
    settings,
    intents,
    products,
    slots,
    visitorName: c.visitor_name,
    visitorPhone: c.visitor_phone,
    createOrder: botOrderCreator(sb, c, "bot", notifyNewOrder),
  });

  await sb.rpc("chat_append", {
    p_id: c.id,
    p_token: c.token,
    p_messages: [clientMsg, ...result.messages.map((m) => ({ sender: "bot", body: m.body, options: m.options ?? null }))],
    p_state: result.state,
    p_needs_human: result.handoff || result.audio ? true : null,
    p_status: result.handoff ? "humano" : null,
    p_visitor_name: result.visitorName ?? null,
    p_visitor_phone: result.visitorPhone ?? null,
    p_has_audio: result.audio ?? null,
  });

  return poll(sb, c.id, c.token, body.after);
}

async function poll(sb: NonNullable<ReturnType<typeof publicClient>>, id: string, token: string, after?: string) {
  const { data, error } = await sb.rpc("chat_poll", { p_id: id, p_token: token, p_after: after || null });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true, id, token, ...(data as object) });
}
