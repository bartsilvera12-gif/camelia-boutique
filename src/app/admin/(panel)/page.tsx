import Link from "next/link";
import { requireAdmin, SOURCE_LABEL, STATUS_STYLE } from "@/lib/admin";
import { formatGs } from "@/lib/format";
import { isoDate, todayPY } from "@/lib/bot/text";
import type { Order } from "@/lib/types";

export default async function AdminDashboard() {
  const { sb } = await requireAdmin();
  const today = isoDate(todayPY());

  const [orders, products, chats, contacts, settings] = await Promise.all([
    sb.from("orders").select("id, customer_name, total, status, source, delivery_date, created_at").order("created_at", { ascending: false }).limit(500),
    sb.from("products").select("id, name, stock, active"),
    sb.from("conversations").select("id, needs_human, status, created_at"),
    sb.from("customers").select("id", { count: "exact", head: true }),
    sb.from("settings").select("bot_enabled, bot_auto_confirm").eq("id", 1).maybeSingle(),
  ]);

  const err = orders.error || products.error;
  const os = (orders.data || []) as Order[];
  const ps = (products.data || []) as { id: string; name: string; stock: number; active: boolean }[];
  const cs = (chats.data || []) as { needs_human: boolean; status: string }[];
  const valid = os.filter((o) => o.status !== "cancelado");

  const stats = [
    { l: "Pedidos pendientes", v: os.filter((o) => o.status === "pendiente").length, href: "/admin/pedidos?estado=pendiente" },
    { l: "Para hoy", v: valid.filter((o) => o.delivery_date === today).length, href: "/admin/agenda" },
    { l: "Facturado", v: formatGs(valid.reduce((a, o) => a + Number(o.total), 0)), href: "/admin/pedidos" },
    { l: "Pedidos del bot", v: os.filter((o) => o.source === "bot").length, href: "/admin/pedidos?origen=bot" },
    { l: "Chats que piden persona", v: cs.filter((c) => c.needs_human && c.status !== "cerrada").length, href: "/admin/conversaciones?filtro=persona" },
    { l: "Contactos", v: contacts.count ?? 0, href: "/admin/contactos" },
  ];
  const lowStock = ps.filter((p) => p.active && p.stock <= 3).sort((a, b) => a.stock - b.stock);

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Dashboard</h1>
      <p className="text-sm text-thyme mb-6">Resumen del negocio.</p>

      {err && (
        <div className="bg-blush/40 border border-rose/40 rounded-xl p-4 mb-6 text-sm">
          No se pudo leer la base: <code>{err.message}</code>. Revisá que el schema <b>cameliaboutique</b> esté expuesto en la API.
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6 text-xs">
        <span className={"rounded-full px-3 py-1 " + (settings.data?.bot_enabled ? "bg-thyme text-champagne" : "bg-ink/10 text-ink")}>
          Bot {settings.data?.bot_enabled ? "encendido" : "apagado"}
        </span>
        <span className="rounded-full px-3 py-1 bg-champagne text-ink">
          Pedidos del bot: {settings.data?.bot_auto_confirm ? "confirmación automática" : "quedan pendientes"}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((k) => (
          <Link key={k.l} href={k.href} className="bg-cream border border-champagne rounded-xl p-5 hover:shadow-sm">
            <div className="eyebrow">{k.l}</div>
            <div className="font-serif text-3xl text-ink mt-1">{k.v}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 mt-10">
        <div>
          <h2 className="font-serif text-xl text-ink mb-3">Pedidos recientes</h2>
          {os.length === 0 ? (
            <div className="text-sm text-thyme">Todavía no hay pedidos.</div>
          ) : (
            <div className="bg-cream border border-champagne rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-champagne/60 text-thyme">
                  <tr>
                    <th className="text-left px-4 py-2">#</th>
                    <th className="text-left px-4 py-2">Cliente</th>
                    <th className="text-left px-4 py-2">Origen</th>
                    <th className="text-left px-4 py-2">Total</th>
                    <th className="text-left px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {os.slice(0, 8).map((o) => (
                    <tr key={o.id} className="border-t border-champagne">
                      <td className="px-4 py-2 font-mono text-xs">{o.id.slice(0, 8)}</td>
                      <td className="px-4 py-2">{o.customer_name}</td>
                      <td className="px-4 py-2 text-xs">{SOURCE_LABEL[o.source || "web"]}</td>
                      <td className="px-4 py-2 text-rose">{formatGs(o.total)}</td>
                      <td className="px-4 py-2">
                        <span className={"text-[11px] rounded-full px-2 py-0.5 " + STATUS_STYLE[o.status]}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h2 className="font-serif text-xl text-ink mb-3">Stock bajo</h2>
          <div className="bg-cream border border-champagne rounded-xl divide-y divide-champagne">
            {lowStock.length === 0 && <div className="p-4 text-sm text-thyme">Todo con stock.</div>}
            {lowStock.slice(0, 10).map((p) => (
              <Link key={p.id} href={`/admin/productos/${p.id}`} className="flex justify-between px-4 py-2 text-sm hover:bg-champagne/30">
                <span>{p.name}</span>
                <span className={p.stock === 0 ? "text-rose" : "text-thyme"}>{p.stock}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
