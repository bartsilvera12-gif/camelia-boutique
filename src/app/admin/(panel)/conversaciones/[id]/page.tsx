import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatGs } from "@/lib/format";
import type { ChatMessage, Conversation, Order } from "@/lib/types";
import StatusPill from "../StatusPill";
import ChatThread from "./ChatThread";
import ConfirmButton from "../../ConfirmButton";
import { saveContactFromConversation, setConversationStatus } from "../actions";
import SaveButton from "../../SaveButton";

export default async function ConversacionPage({ params }: { params: { id: string } }) {
  const { sb } = await requireAdmin();
  const [{ data: conv }, { data: msgs }, { data: orders }] = await Promise.all([
    sb.from("conversations").select("*").eq("id", params.id).maybeSingle(),
    sb.from("messages").select("*").eq("conversation_id", params.id).order("created_at"),
    sb.from("orders").select("id, total, status, delivery_date, created_at").eq("conversation_id", params.id).order("created_at", { ascending: false }),
  ]);
  if (!conv) notFound();
  const c = conv as Conversation;
  if (c.unread > 0) await sb.from("conversations").update({ unread: 0 }).eq("id", c.id);

  return (
    <>
      <Link href="/admin/conversaciones" className="text-xs text-thyme hover:text-rose">← Conversaciones</Link>
      <div className="flex flex-wrap items-center gap-2 mt-1 mb-5">
        <h1 className="font-serif text-3xl text-ink mr-2">{c.visitor_name || "Visitante"}</h1>
        <StatusPill c={c} />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <ChatThread conversationId={c.id} initial={(msgs || []) as ChatMessage[]} status={c.status} />

        <div className="space-y-4">
          <div className="bg-cream border border-champagne rounded-xl p-4 space-y-2">
            <div className="eyebrow mb-1">Quién atiende</div>
            <p className="text-sm">
              {c.status === "humano" ? <>El equipo{c.taken_by ? ` (${c.taken_by})` : ""}. El bot no responde.</> :
               c.status === "bot" ? "El bot responde automáticamente." : "Conversación cerrada. Si el cliente vuelve a escribir, la retoma el bot."}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {c.status !== "humano" && (
                <form action={setConversationStatus.bind(null, c.id, "humano")}>
                  <SaveButton className="btn-primary !py-1.5 !px-3 !text-xs" pendingText="Tomando…" doneText="✓ Listo">Tomar conversación</SaveButton>
                </form>
              )}
              {c.status !== "bot" && (
                <form action={setConversationStatus.bind(null, c.id, "bot")}>
                  <SaveButton className="btn-outline !py-1.5 !px-3 !text-xs" pendingText="Devolviendo…" doneText="✓ Listo">Devolver al bot</SaveButton>
                </form>
              )}
              {c.status !== "cerrada" && (
                <ConfirmButton
                  action={setConversationStatus.bind(null, c.id, "cerrada")}
                  message="¿Cerrar esta conversación?"
                  className="btn-outline !py-1.5 !px-3 !text-xs"
                >
                  Cerrar
                </ConfirmButton>
              )}
            </div>
          </div>

          <form action={saveContactFromConversation.bind(null, c.id)} className="bg-cream border border-champagne rounded-xl p-4">
            <div className="eyebrow mb-2">Contacto</div>
            <label className="label">Nombre</label>
            <input name="name" defaultValue={c.visitor_name || ""} className="input mb-2" required />
            <label className="label">Teléfono</label>
            <input name="phone" defaultValue={c.visitor_phone || ""} className="input mb-2" required />
            <label className="label">Email</label>
            <input name="email" type="email" className="input mb-3" />
            <SaveButton className="btn-outline !py-1.5 !px-3 !text-xs">{c.customer_id ? "Actualizar contacto" : "Guardar en contactos"}</SaveButton>
            {c.customer_id && <Link href="/admin/contactos" className="block text-xs text-thyme mt-2 underline">Ya está en contactos</Link>}
          </form>

          {(orders || []).length > 0 && (
            <div className="bg-cream border border-champagne rounded-xl p-4">
              <div className="eyebrow mb-2">Pedidos de esta conversación</div>
              <ul className="text-sm space-y-1">
                {(orders as Order[]).map((o) => (
                  <li key={o.id} className="flex justify-between">
                    <Link href={`/admin/pedidos?q=${encodeURIComponent(c.visitor_phone || "")}`} className="font-mono text-xs underline">#{o.id.slice(0, 8)}</Link>
                    <span className="text-xs">{o.status}</span>
                    <span className="text-rose text-xs">{formatGs(o.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-thyme">Iniciada el {new Date(c.created_at).toLocaleString("es-PY", { timeZone: "America/Asuncion" })} · canal {c.channel}</p>
        </div>
      </div>
    </>
  );
}
