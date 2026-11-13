import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, Bot, Hand, Info, Phone, ShoppingBag } from "lucide-react";
import { requireAdmin, STATUS_STYLE } from "@/lib/admin";
import { formatGs } from "@/lib/format";
import type { ChatMessage, Conversation, Order } from "@/lib/types";
import ChatThread from "./ChatThread";
import ConfirmButton from "../../ConfirmButton";
import SaveButton from "../../SaveButton";
import { saveContactFromConversation, setConversationStatus } from "../actions";
import { Avatar, WhatsAppIcon, prettyPhone } from "../ui";

export default async function ConversacionPage({ params }: { params: { id: string } }) {
  const { sb } = await requireAdmin();
  const [{ data: conv }, { data: msgs }, { data: orders }] = await Promise.all([
    sb.from("conversations").select("*").eq("id", params.id).maybeSingle(),
    sb.from("messages").select("*").eq("conversation_id", params.id).order("created_at"),
    sb.from("orders").select("id, total, status, delivery_date, delivery_time, created_at").eq("conversation_id", params.id).order("created_at", { ascending: false }),
  ]);
  if (!conv) notFound();
  const c = conv as Conversation;
  if (c.unread > 0) await sb.from("conversations").update({ unread: 0 }).eq("id", c.id);

  const nombre = c.visitor_name || prettyPhone(c.visitor_phone) || "Visitante";
  const canal = c.channel === "whatsapp" ? "WhatsApp" : "Chat de la web";
  const estado =
    c.status === "humano" ? "Atiende el equipo" : c.status === "bot" ? "Atiende el bot" : "Cerrada";

  const ficha = (
    <div className="space-y-5">
      <div className="text-center">
        <div className="flex justify-center"><Avatar name={c.visitor_name} channel={c.channel} size={72} /></div>
        <div className="font-serif text-2xl text-ink mt-3">{nombre}</div>
        {c.visitor_phone && <div className="text-sm text-thyme">{prettyPhone(c.visitor_phone)}</div>}
        {c.visitor_phone && (
          <a
            href={`https://wa.me/${c.visitor_phone.replace(/\D/g, "").replace(/^0/, "595")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#1fa855] mt-2 hover:underline"
          >
            <WhatsAppIcon size={12} /> Abrir en WhatsApp
          </a>
        )}
      </div>

      <form action={saveContactFromConversation.bind(null, c.id)} className="space-y-2">
        <div className="text-[10px] uppercase tracking-[0.24em] text-thyme">Contacto</div>
        <input name="name" defaultValue={c.visitor_name || ""} placeholder="Nombre" className="input !py-2" required />
        <input name="phone" defaultValue={c.visitor_phone || ""} placeholder="Teléfono" className="input !py-2" required />
        <input name="email" type="email" placeholder="Email (opcional)" className="input !py-2" />
        <SaveButton className="btn-outline !py-1.5 !px-4 !text-[11px] w-full">
          {c.customer_id ? "Actualizar contacto" : "Guardar en contactos"}
        </SaveButton>
      </form>

      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-thyme mb-2">Pedidos</div>
        {(orders || []).length === 0 ? (
          <div className="text-xs text-thyme">Todavía no hizo pedidos por acá.</div>
        ) : (
          <ul className="space-y-2">
            {(orders as Order[]).map((o) => (
              <li key={o.id} className="rounded-xl bg-[#FBF7F1] border border-champagne p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-thyme">#{o.id.slice(0, 8)}</span>
                  <span className={"text-[10px] rounded-full px-2 py-0.5 " + STATUS_STYLE[o.status]}>{o.status}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-ink/70">
                    {o.delivery_date
                      ? new Date(o.delivery_date + "T12:00:00Z").toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" })
                      : "Sin fecha"}
                    {o.delivery_time ? ` · ${o.delivery_time}` : ""}
                  </span>
                  <span className="text-sm text-rose">{formatGs(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {(orders || []).length > 0 && (
          <Link href={`/admin/pedidos?q=${encodeURIComponent(c.visitor_phone || "")}`} className="text-xs text-thyme hover:text-rose inline-flex items-center gap-1 mt-2">
            <ShoppingBag size={12} /> Ver en Pedidos
          </Link>
        )}
      </div>

      <div className="text-[11px] text-thyme/80 border-t border-champagne pt-3">
        {canal} · iniciada el{" "}
        {new Date(c.created_at).toLocaleString("es-PY", { timeZone: "America/Asuncion", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* encabezado */}
      <header className="flex items-center gap-3 px-4 h-16 border-b border-champagne bg-cream shrink-0">
        <Link href="/admin/conversaciones" className="md:hidden p-1.5 -ml-1.5 rounded-lg text-thyme hover:bg-champagne/50" aria-label="Volver">
          <ArrowLeft size={18} />
        </Link>
        <Avatar name={c.visitor_name} channel={c.channel} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] text-ink truncate font-medium">{nombre}</div>
          <div className="text-[11.5px] text-thyme flex items-center gap-1.5 truncate">
            <span
              className={
                "w-1.5 h-1.5 rounded-full shrink-0 " +
                (c.status === "bot" ? "bg-thyme" : c.status === "humano" ? "bg-rose" : "bg-ink/30")
              }
            />
            {estado}
            {c.needs_human && c.status !== "cerrada" && <span className="text-rose">· pide una persona</span>}
            {c.visitor_phone && (
              <span className="hidden sm:inline-flex items-center gap-1">· <Phone size={10} /> {prettyPhone(c.visitor_phone)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {c.status !== "humano" && (
            <form action={setConversationStatus.bind(null, c.id, "humano")}>
              <SaveButton className="btn-primary !py-1.5 !px-3 !text-[11px] !tracking-wider" pendingText="…" doneText="✓">
                <Hand size={13} className="mr-1.5" /> Tomar
              </SaveButton>
            </form>
          )}
          {c.status !== "bot" && (
            <form action={setConversationStatus.bind(null, c.id, "bot")}>
              <SaveButton className="btn-outline !py-1.5 !px-3 !text-[11px] !tracking-wider" pendingText="…" doneText="✓">
                <Bot size={13} className="mr-1.5" /> Al bot
              </SaveButton>
            </form>
          )}
          {c.status !== "cerrada" && (
            <ConfirmButton
              action={setConversationStatus.bind(null, c.id, "cerrada")}
              message="¿Cerrar esta conversación? Si el cliente vuelve a escribir, la retoma el bot."
              className="p-2 rounded-full text-thyme hover:bg-champagne/60"
            >
              <Archive size={16} aria-label="Cerrar conversación" />
            </ConfirmButton>
          )}
          <details className="xl:hidden relative">
            <summary className="list-none cursor-pointer p-2 rounded-full text-thyme hover:bg-champagne/60" aria-label="Ver ficha">
              <Info size={16} />
            </summary>
            <div className="absolute right-0 top-11 z-20 w-[300px] max-h-[75vh] overflow-y-auto bg-cream border border-champagne rounded-2xl shadow-xl p-5">
              {ficha}
            </div>
          </details>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <ChatThread
          conversationId={c.id}
          initial={(msgs || []) as ChatMessage[]}
          status={c.status}
          channel={c.channel}
        />
        <aside className="hidden xl:block w-[300px] shrink-0 border-l border-champagne bg-cream overflow-y-auto p-5">{ficha}</aside>
      </div>
    </div>
  );
}
