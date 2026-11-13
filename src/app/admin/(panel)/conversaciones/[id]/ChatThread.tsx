"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Image as ImageIcon, Mic, SendHorizontal, UserRound } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import type { ChatMessage, ConversationStatus } from "@/lib/types";
import { replyConversation } from "../actions";
import { dayKey, dayLabel } from "../ui";

const TZ = "America/Asuncion";

/** *negrita*, _cursiva_ y saltos de línea, como en WhatsApp. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className="block min-h-[1em]">
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, j) =>
            part.length > 2 && part.startsWith("*") && part.endsWith("*") ? (
              <b key={j} className="font-semibold">{part.slice(1, -1)}</b>
            ) : part.length > 2 && part.startsWith("_") && part.endsWith("_") ? (
              <i key={j} className="opacity-75">{part.slice(1, -1)}</i>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            )
          )}
        </span>
      ))}
    </>
  );
}

/** Foto que mandó el cliente: el bucket es privado, se pide un enlace firmado por 1 hora. */
const signed = new Map<string, Promise<string | null>>();
function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let p = signed.get(path);
    if (!p) {
      p = browserClient()
        .storage.from("cameliaboutique-chat")
        .createSignedUrl(path, 3600)
        .then(({ data }) => data?.signedUrl ?? null);
      signed.set(path, p);
    }
    p.then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else {
        signed.delete(path);
        setFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [path]);
  if (failed) return <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1"><ImageIcon size={13} /> No se pudo cargar la foto</div>;
  if (!url) return <div className="w-56 h-64 max-w-full rounded-xl bg-champagne/60 animate-pulse mb-1" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block -mx-1.5 -mt-0.5 mb-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto enviada por el cliente" className="rounded-xl max-h-80 w-auto max-w-full object-contain bg-champagne/30" />
    </a>
  );
}

export default function ChatThread({
  conversationId,
  initial,
  status,
  channel,
}: {
  conversationId: string;
  initial: ChatMessage[];
  status: ConversationStatus;
  channel: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMessages(initial), [initial]);

  // mensajes nuevos cada 4 s
  useEffect(() => {
    const sb = browserClient();
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const last = messages[messages.length - 1]?.created_at;
      let q = sb.from("messages").select("*").eq("conversation_id", conversationId).order("created_at");
      if (last) q = q.gt("created_at", last);
      const { data } = await q;
      // fotos que todavía se estaban recibiendo
      const pending = messages.filter((x) => x.kind === "imagen" && !x.media_path).map((x) => x.id);
      if (pending.length) {
        const { data: got } = await sb.from("messages").select("id, media_path").in("id", pending).not("media_path", "is", null);
        if (got?.length) {
          const byId = new Map(got.map((g: any) => [g.id, g.media_path as string]));
          setMessages((m) => m.map((x) => (byId.has(x.id) ? { ...x, media_path: byId.get(x.id) } : x)));
        }
      }
      if (data?.length) {
        setMessages((m) => {
          const seen = new Set(m.map((x) => x.id));
          return [...m, ...(data as ChatMessage[]).filter((x) => !seen.has(x.id))];
        });
        sb.from("conversations").update({ unread: 0 }).eq("id", conversationId).then(() => {});
      }
    }, 4000);
    return () => clearInterval(t);
  }, [conversationId, messages]);

  // baja hasta el último mensaje moviendo solo la zona del chat (no la página)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // el cuadro de texto crece con el contenido
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    ta.style.overflowY = ta.scrollHeight > 140 ? "auto" : "hidden";
  }, [text]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setErr(null);
    const r = await replyConversation(conversationId, text);
    setSending(false);
    if (!r.ok) return setErr(r.error || "No se pudo enviar");
    setText("");
    router.refresh();
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col chat-wallpaper">
      <div ref={scrollRef} className="thin-scroll flex-1 min-h-0 overflow-y-auto px-4 md:px-10 py-5">
        {messages.length === 0 && <div className="text-sm text-thyme text-center py-16">Sin mensajes todavía.</div>}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const mine = m.sender !== "cliente";
          const sameSide = prev && !newDay && (prev.sender !== "cliente") === mine && prev.sender === m.sender;
          const hora = new Date(m.created_at).toLocaleTimeString("es-PY", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="flex justify-center my-4">
                  <span className="text-[11px] bg-cream/95 text-thyme rounded-lg px-3 py-1 shadow-sm capitalize">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <div className={"flex " + (mine ? "justify-end" : "justify-start") + (sameSide ? " mt-1" : " mt-3")}>
                <div
                  className={
                    "relative max-w-[78%] md:max-w-[62%] rounded-2xl px-3.5 pt-2 pb-1.5 text-[14px] leading-snug shadow-sm " +
                    (m.sender === "cliente"
                      ? "bg-white text-ink " + (sameSide ? "" : "rounded-tl-md")
                      : m.sender === "agente"
                      ? "bg-rose text-white " + (sameSide ? "" : "rounded-tr-md")
                      : "bg-[#E9EDDF] text-ink " + (sameSide ? "" : "rounded-tr-md"))
                  }
                >
                  {!sameSide && m.sender !== "cliente" && (
                    <div className={"flex items-center gap-1 text-[10.5px] font-medium mb-0.5 " + (m.sender === "agente" ? "text-white/85" : "text-thyme")}>
                      {m.sender === "bot" ? <Bot size={11} /> : <UserRound size={11} />}
                      {m.sender === "bot" ? "Bot" : "Equipo"}
                    </div>
                  )}
                  {m.kind === "audio" && (
                    <div className="flex items-center gap-1.5 text-xs opacity-80 mb-0.5"><Mic size={12} /> Audio (escuchalo en el celular)</div>
                  )}
                  {m.media_path && <ChatImage path={m.media_path} />}
                  {m.kind === "imagen" && !m.media_path && (
                    <div className="flex items-center gap-1.5 text-xs opacity-70 mb-0.5"><ImageIcon size={12} /> Foto (recibiéndose…)</div>
                  )}
                  {!(m.kind === "imagen" && /^📷 Foto$/.test(m.body)) && (
                    <div className="break-words"><Rich text={m.kind === "imagen" ? m.body.replace(/^📷\s*/, "") : m.body} /></div>
                  )}
                  {m.options && m.options.length > 0 && m.sender === "bot" && channel !== "whatsapp" && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.options.map((o) => (
                        <span key={o.value} className="text-[10.5px] border border-thyme/30 text-thyme rounded-full px-2 py-0.5 bg-white/60">{o.label}</span>
                      ))}
                    </div>
                  )}
                  <div className={"text-[10px] text-right mt-0.5 " + (m.sender === "agente" ? "text-white/70" : "text-thyme/70")}>{hora}</div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="bg-cream/95 border-t border-champagne px-3 md:px-5 py-3">
        {status !== "humano" && (
          <div className="text-[11.5px] text-thyme mb-2 flex items-center gap-1.5">
            <Bot size={13} />
            {status === "bot"
              ? "El bot está atendiendo. Si escribís, tomás la conversación y el bot se pausa."
              : "Conversación cerrada. Si escribís, se reabre a tu cargo."}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={channel === "whatsapp" ? "Escribí un mensaje (le llega por WhatsApp)" : "Escribí un mensaje"}
            className="flex-1 resize-none overflow-hidden rounded-2xl bg-white border border-champagne px-4 py-2.5 text-[14px] outline-none focus:border-thyme max-h-[140px]"
          />
          <button
            disabled={sending || !text.trim()}
            aria-label="Enviar"
            className="w-11 h-11 shrink-0 rounded-full bg-thyme text-champagne flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition"
          >
            {sending ? <span className="w-4 h-4 border-2 border-champagne/40 border-t-champagne rounded-full animate-spin" /> : <SendHorizontal size={18} />}
          </button>
        </form>
        <div className="flex justify-between mt-1">
          {err ? <p className="text-xs text-rose">{err}</p> : <span />}
          <span className="text-[10px] text-thyme/60 hidden md:block">Enter envía · Shift+Enter salto de línea</span>
        </div>
      </div>
    </div>
  );
}
