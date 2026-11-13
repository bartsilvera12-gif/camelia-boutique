"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatOption } from "@/lib/types";

const KEY = "camelia-chat";

type Session = { id: string; token: string };

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

function Rich({ text }: { text: string }) {
  // *negrita* y saltos de línea
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className="block">
          {line.split(/(\*[^*]+\*)/g).map((part, j) =>
            part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
              <b key={j}>{part.slice(1, -1)}</b>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </span>
      ))}
    </>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string>("bot");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: ChatMessage[] = []) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      return add.length ? [...prev, ...add] : prev;
    });
  }, []);

  const real = messages.filter((m) => !m.id.startsWith("tmp-"));
  const lastAt = real.length ? real[real.length - 1].created_at : undefined;

  // Abrir / retomar conversación
  useEffect(() => {
    if (!open || session) return;
    const saved = loadSession();
    (async () => {
      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saved ?? {}),
        }).then((r) => r.json());
        if (!r.ok) throw new Error(r.error);
        const s = { id: r.id, token: r.token };
        saveSession(s);
        setSession(s);
        setStatus(r.status);
        setMessages(r.messages || []);
        setError(null);
      } catch {
        setError("No pudimos conectar el chat. Probá de nuevo en un rato.");
      }
    })();
  }, [open, session]);

  // Polling para ver respuestas del equipo
  useEffect(() => {
    if (!open || !session) return;
    const t = setInterval(async () => {
      try {
        const q = new URLSearchParams({ id: session.id, token: session.token, after: lastAt || "" });
        const r = await fetch(`/api/chat?${q}`).then((r) => r.json());
        if (r.ok) {
          merge(r.messages);
          setStatus(r.status);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [open, session, lastAt, merge]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(body: string, value?: string) {
    if (!session || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    const temp: ChatMessage = {
      id: "tmp-" + Date.now(),
      sender: "cliente",
      kind: "texto",
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, temp]);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...session, text: body, value, after: lastAt }),
      }).then((r) => r.json());
      if (!r.ok) throw new Error(r.error);
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      merge(r.messages);
      setStatus(r.status);
    } catch {
      setError("No se pudo enviar. Probá de nuevo.");
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setText(body);
    } finally {
      setBusy(false);
    }
  }

  const last = messages[messages.length - 1];
  const options: ChatOption[] = last && last.sender !== "cliente" ? last.options || [] : [];

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-thyme text-champagne shadow-lg flex items-center justify-center hover:opacity-90"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed z-50 bottom-24 right-4 left-4 sm:left-auto sm:w-[380px] h-[min(560px,calc(100vh-8rem))] bg-cream border border-champagne rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-thyme text-champagne px-4 py-3">
            <div className="font-serif text-xl leading-none">
              Camélia<span className="text-blush">.</span>
            </div>
            <div className="text-[11px] opacity-80 mt-1">
              {status === "humano" ? "Te atiende una persona del equipo" : "Asistente virtual · responde al instante"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-[#FFFDFA]">
            {messages.map((m) => (
              <div key={m.id} className={m.sender === "cliente" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug " +
                    (m.sender === "cliente"
                      ? "bg-thyme text-champagne rounded-br-sm"
                      : m.sender === "agente"
                      ? "bg-blush/60 text-ink rounded-bl-sm"
                      : "bg-champagne text-ink rounded-bl-sm")
                  }
                >
                  {m.sender === "agente" && (
                    <div className="text-[10px] uppercase tracking-widest text-rose mb-0.5">Equipo Camélia</div>
                  )}
                  <Rich text={m.body} />
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-thyme px-2">escribiendo…</div>}
            {error && <div className="text-xs text-rose px-2">{error}</div>}
            <div ref={endRef} />
          </div>

          {options.length > 0 && !busy && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-t border-champagne pt-2">
              {options.map((o) => (
                <button
                  key={o.value}
                  onClick={() => send(o.label, o.value)}
                  className="text-xs rounded-full border border-thyme text-thyme px-3 py-1.5 hover:bg-thyme hover:text-champagne"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
            className="flex gap-2 p-3 border-t border-champagne"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribí tu consulta…"
              className="input !py-2"
              maxLength={1000}
              disabled={!session}
            />
            <button disabled={!session || busy || !text.trim()} className="btn-primary !px-4 !py-2 disabled:opacity-50">
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
