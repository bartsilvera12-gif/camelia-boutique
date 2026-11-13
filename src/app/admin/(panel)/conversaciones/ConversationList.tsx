"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Mic, Search } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import type { Conversation } from "@/lib/types";
import { Avatar, prettyPhone, shortTime } from "./ui";

const FILTERS = [
  { k: "todas", label: "Todas" },
  { k: "persona", label: "Persona" },
  { k: "equipo", label: "Equipo" },
  { k: "bot", label: "Bot" },
  { k: "cerradas", label: "Cerradas" },
] as const;

type F = (typeof FILTERS)[number]["k"];

function matches(c: Conversation, f: F) {
  switch (f) {
    case "persona": return c.needs_human && c.status !== "cerrada";
    case "equipo": return c.status === "humano";
    case "bot": return c.status === "bot";
    case "cerradas": return c.status === "cerrada";
    default: return c.status !== "cerrada";
  }
}

export default function ConversationList() {
  const path = usePathname();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [filter, setFilter] = useState<F>("todas");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = browserClient();
    let alive = true;
    async function load() {
      const { data, error } = await sb
        .from("conversations")
        .select("id, channel, visitor_name, visitor_phone, status, needs_human, has_audio, unread, last_message, last_message_at, created_at")
        .not("last_message", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(300);
      if (!alive) return;
      if (error) setError(error.message);
      else {
        setError(null);
        setList((data || []) as Conversation[]);
      }
    }
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of FILTERS) out[f.k] = (list || []).filter((c) => matches(c, f.k)).length;
    return out;
  }, [list]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list || []).filter(
      (c) =>
        matches(c, filter) &&
        (!needle ||
          (c.visitor_name || "").toLowerCase().includes(needle) ||
          (c.visitor_phone || "").includes(needle.replace(/\D/g, "") || "~") ||
          (c.last_message || "").toLowerCase().includes(needle))
    );
  }, [list, filter, q]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-3 border-b border-champagne">
        <h1 className="font-serif text-2xl text-ink">Conversaciones</h1>
        <div className="relative mt-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-thyme/70" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nombre, teléfono o mensaje"
            className="w-full rounded-full bg-[#FBF7F1] border border-champagne pl-9 pr-3 py-2 text-sm outline-none focus:border-thyme"
          />
        </div>
        <div role="tablist" aria-label="Filtrar conversaciones" className="flex gap-0.5 mt-3 p-1 rounded-xl bg-[#F3ECE1]">
          {FILTERS.map((f) => {
            const on = filter === f.k;
            const n = counts[f.k];
            const alerta = f.k === "persona" && n > 0;
            return (
              <button
                key={f.k}
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f.k)}
                title={f.k === "persona" ? "Piden hablar con una persona" : undefined}
                className={
                  "relative flex-auto flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11.5px] whitespace-nowrap transition " +
                  (on ? "bg-cream text-ink shadow-sm font-medium" : "text-ink/60 hover:text-ink")
                }
              >
                {f.label}
                {n > 0 && (
                  <span
                    className={
                      "min-w-[16px] h-4 px-1 rounded-full text-[9.5px] leading-4 text-center font-semibold " +
                      (alerta ? "bg-rose text-cream" : on ? "bg-thyme text-champagne" : "bg-ink/10 text-ink/60")
                    }
                  >
                    {n > 99 ? "99+" : n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto">
        {error && <div className="m-3 text-xs bg-blush/40 rounded-lg p-3">{error}</div>}
        {list === null && !error && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-center p-2 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-champagne" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-champagne rounded w-1/2" />
                  <div className="h-2.5 bg-champagne/70 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}
        {list && shown.length === 0 && (
          <div className="text-center text-sm text-thyme px-6 py-12">
            {q ? "No hay conversaciones que coincidan." : "No hay conversaciones en esta vista."}
          </div>
        )}
        <ul>
          {shown.map((c) => {
            const active = path === `/admin/conversaciones/${c.id}`;
            const unread = c.unread > 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/conversaciones/${c.id}`}
                  className={
                    "flex items-center gap-3 px-4 py-3 border-b border-champagne/60 transition " +
                    (active ? "bg-champagne/70" : "hover:bg-champagne/30")
                  }
                >
                  <Avatar name={c.visitor_name} channel={c.channel} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={"truncate text-[14px] " + (unread ? "font-semibold text-ink" : "text-ink")}>
                        {c.visitor_name || prettyPhone(c.visitor_phone) || "Visitante"}
                      </span>
                      <span className={"ml-auto shrink-0 text-[11px] " + (unread ? "text-[#1fa855] font-medium" : "text-thyme/80")}>
                        {shortTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {c.has_audio && <Mic size={12} className="text-thyme shrink-0" />}
                      <span className={"truncate text-[12.5px] " + (unread ? "text-ink/85" : "text-thyme")}>
                        {(c.last_message || "").replace(/\*/g, "").split("\n")[0]}
                      </span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {c.needs_human && c.status !== "cerrada" && (
                          <span className="text-[9px] uppercase tracking-wider bg-rose text-cream rounded-full px-1.5 py-0.5">Persona</span>
                        )}
                        {c.status === "humano" && !c.needs_human && (
                          <span className="text-[9px] uppercase tracking-wider bg-blush text-ink rounded-full px-1.5 py-0.5">Equipo</span>
                        )}
                        {unread && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-white text-[10px] font-semibold flex items-center justify-center">
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
