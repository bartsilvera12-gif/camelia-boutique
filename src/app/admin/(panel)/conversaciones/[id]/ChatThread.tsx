"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import type { ChatMessage, ConversationStatus } from "@/lib/types";
import { replyConversation } from "../actions";

const LABEL: Record<string, string> = { cliente: "Cliente", bot: "Bot", agente: "Equipo" };

export default function ChatThread({
  conversationId,
  initial,
  status,
}: {
  conversationId: string;
  initial: ChatMessage[];
  status: ConversationStatus;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMessages(initial), [initial]);

  useEffect(() => {
    const sb = browserClient();
    const t = setInterval(async () => {
      const last = messages[messages.length - 1]?.created_at;
      let q = sb.from("messages").select("*").eq("conversation_id", conversationId).order("created_at");
      if (last) q = q.gt("created_at", last);
      const { data } = await q;
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setErr(null);
    const r = await replyConversation(conversationId, text);
    setSending(false);
    if (!r.ok) return setErr(r.error || "No se pudo enviar");
    setText("");
    router.refresh();
  }

  return (
    <div className="bg-cream border border-champagne rounded-xl flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={m.sender === "cliente" ? "flex justify-start" : "flex justify-end"}>
            <div
              className={
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap " +
                (m.sender === "cliente"
                  ? "bg-champagne text-ink rounded-bl-sm"
                  : m.sender === "agente"
                  ? "bg-rose text-cream rounded-br-sm"
                  : "bg-thyme/15 text-ink rounded-br-sm")
              }
            >
              <div className="text-[10px] uppercase tracking-widest opacity-70 mb-0.5">
                {LABEL[m.sender]} · {new Date(m.created_at).toLocaleTimeString("es-PY", { timeZone: "America/Asuncion", hour: "2-digit", minute: "2-digit" })}
                {m.kind === "audio" && " · audio"}
              </div>
              {m.body.replace(/\*([^*]+)\*/g, "$1")}
              {m.options && m.options.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.options.map((o) => (
                    <span key={o.value} className="text-[10px] border border-current/30 rounded-full px-2 py-0.5 opacity-70">{o.label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && <div className="text-sm text-thyme text-center py-10">Sin mensajes.</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-champagne p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={status === "humano" ? "Responder como el equipo…" : "Escribir toma la conversación y pausa el bot…"}
          className="input"
        />
        <button disabled={sending || !text.trim()} className="btn-primary !py-2 !px-4 disabled:opacity-50">
          {sending ? "…" : "Enviar"}
        </button>
      </form>
      {err && <p className="text-xs text-rose px-3 pb-2">{err}</p>}
    </div>
  );
}
