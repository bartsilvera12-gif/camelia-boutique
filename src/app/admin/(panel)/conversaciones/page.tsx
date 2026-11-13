import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import type { Conversation } from "@/lib/types";
import AutoRefresh from "../AutoRefresh";
import StatusPill from "./StatusPill";

const FILTERS = [
  { k: "", label: "Todas" },
  { k: "persona", label: "Piden una persona" },
  { k: "humano", label: "Atendidas por el equipo" },
  { k: "bot", label: "Con el bot" },
  { k: "audio", label: "Con audios" },
  { k: "cerrada", label: "Cerradas" },
];

export default async function ConversacionesPage({ searchParams }: { searchParams: { filtro?: string } }) {
  const { sb } = await requireAdmin();
  const f = searchParams.filtro || "";
  let q = sb.from("conversations").select("*").order("last_message_at", { ascending: false }).limit(200);
  if (f === "persona") q = q.eq("needs_human", true).neq("status", "cerrada");
  if (f === "humano" || f === "bot" || f === "cerrada") q = q.eq("status", f);
  if (f === "audio") q = q.eq("has_audio", true);
  if (!f) q = q.not("last_message", "is", null);
  const { data, error } = await q;
  const list = (data || []) as Conversation[];

  return (
    <>
      <AutoRefresh seconds={15} />
      <h1 className="font-serif text-3xl text-ink mb-1">Conversaciones</h1>
      <p className="text-sm text-thyme mb-6">Lo que la gente le escribe al bot. Podés tomar cualquier conversación y responder vos.</p>
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((x) => (
          <Link
            key={x.k}
            href={x.k ? `/admin/conversaciones?filtro=${x.k}` : "/admin/conversaciones"}
            className={"text-xs rounded-full px-3 py-1 border " + (f === x.k ? "bg-thyme text-champagne border-thyme" : "border-bisque hover:border-thyme")}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="bg-cream border border-champagne rounded-xl divide-y divide-champagne">
        {list.map((c) => (
          <Link key={c.id} href={`/admin/conversaciones/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-champagne/30">
            <div className="w-10 h-10 shrink-0 rounded-full bg-blush/60 flex items-center justify-center font-serif text-ink">
              {(c.visitor_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-ink">{c.visitor_name || "Visitante"}</span>
                {c.visitor_phone && <span className="text-xs text-thyme">{c.visitor_phone}</span>}
                <StatusPill c={c} />
              </div>
              <div className="text-xs text-thyme truncate">{c.last_message || "—"}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-thyme">
                {new Date(c.last_message_at).toLocaleString("es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
              {c.unread > 0 && <span className="inline-block mt-1 text-[10px] rounded-full bg-rose text-cream px-1.5">{c.unread}</span>}
            </div>
          </Link>
        ))}
        {list.length === 0 && <div className="p-8 text-center text-sm text-thyme">No hay conversaciones.</div>}
      </div>
    </>
  );
}
