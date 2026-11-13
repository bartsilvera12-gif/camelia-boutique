import Link from "next/link";
import { formatGs } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/admin-styles";
import type { Order } from "@/lib/types";
import { DateInput, StatusSelect } from "./OrderControls";
import ConfirmButton from "../ConfirmButton";
import { deleteOrder } from "./actions";

export default function OrderCard({ o }: { o: Order }) {
  const items = o.order_items || [];
  const wa = o.phone ? `https://wa.me/${o.phone.replace(/\D/g, "").replace(/^0/, "595")}` : null;
  return (
    <div className="relative">
    <div className="absolute top-3 right-4 z-10">
      <StatusSelect id={o.id} status={o.status} />
    </div>
    <details className="bg-cream border border-champagne rounded-xl group">
      <summary className="list-none cursor-pointer pl-4 pr-36 py-3 grid grid-cols-[1fr_auto] md:grid-cols-[90px_1fr_130px_110px] gap-x-4 gap-y-1 items-center">
        <span className="font-mono text-xs text-thyme hidden md:block">#{o.id.slice(0, 8)}</span>
        <span>
          <span className="text-ink">{o.customer_name}</span>
          {o.source === "bot" && (
            <span className="ml-2 text-[10px] uppercase tracking-widest bg-thyme text-champagne rounded px-1.5 py-0.5">Bot</span>
          )}
          <span className="block text-[11px] text-thyme">
            {items.length} ítem(s) · {SOURCE_LABEL[o.source || "web"]} · {new Date(o.created_at).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}
          </span>
        </span>
        <span className="text-xs text-thyme hidden md:block">
          {o.delivery_date ? new Date(o.delivery_date + "T12:00:00Z").toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "Sin fecha"}
        </span>
        <span className="text-rose text-right md:text-left">{formatGs(o.total)}</span>
      </summary>
      <div className="border-t border-champagne px-4 py-4 grid md:grid-cols-2 gap-6 text-sm">
        <div>
          <div className="eyebrow mb-2">Productos</div>
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-4">
                <span>{i.qty} × {i.name}</span>
                <span className="text-thyme">{formatGs(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-champagne mt-2 pt-2 flex justify-between font-medium">
            <span>Total</span><span className="text-rose">{formatGs(o.total)}</span>
          </div>
          {o.notes && <p className="text-xs text-thyme mt-3">Obs: {o.notes}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="eyebrow mb-2">Cliente y entrega</div>
          <div>
            {o.phone}
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="ml-2 text-xs text-thyme underline">WhatsApp</a>}
          </div>
          {o.email && <div>{o.email}</div>}
          {o.address && <div>{o.address}{o.city ? `, ${o.city}` : ""}</div>}
          <div className="text-xs text-thyme">Entrega: {o.delivery} · Pago: {o.payment}</div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-thyme">Fecha agendada:</span>
            <DateInput id={o.id} date={o.delivery_date} />
          </div>
          <div className="flex gap-4 pt-3 text-xs">
            {o.conversation_id && (
              <Link href={`/admin/conversaciones/${o.conversation_id}`} className="text-thyme underline">Ver conversación</Link>
            )}
            <ConfirmButton
              action={deleteOrder.bind(null, o.id)}
              message="¿Eliminar este pedido? Si no estaba cancelado, se devuelve el stock. No se puede deshacer."
              className="text-rose hover:underline"
            >
              Eliminar pedido
            </ConfirmButton>
          </div>
        </div>
      </div>
    </details>
    </div>
  );
}
