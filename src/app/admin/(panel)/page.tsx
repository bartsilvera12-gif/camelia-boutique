import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Bot, CalendarDays, Clock, MessageCircle, PackageCheck, ShoppingBag, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireAdmin, SOURCE_LABEL, STATUS_STYLE } from "@/lib/admin";
import { formatGs } from "@/lib/format";
import { isoDate, todayPY } from "@/lib/bot/text";
import type { Order } from "@/lib/types";

type Conv = { id: string; visitor_name: string | null; last_message: string | null; last_message_at: string; needs_human: boolean; status: string; channel: string };

export default async function AdminDashboard() {
  const { sb, user } = await requireAdmin();
  const today = isoDate(todayPY());

  const [orders, products, chats, contacts, settings] = await Promise.all([
    sb.from("orders").select("id, customer_name, total, status, source, delivery, delivery_date, delivery_time, created_at").order("created_at", { ascending: false }).limit(500),
    sb.from("products").select("id, name, stock, active"),
    sb.from("conversations").select("id, visitor_name, last_message, last_message_at, needs_human, status, channel").order("last_message_at", { ascending: false }).limit(200),
    sb.from("customers").select("id", { count: "exact", head: true }),
    sb.from("settings").select("bot_enabled, bot_auto_confirm, wa_bot_enabled").eq("id", 1).maybeSingle(),
  ]);

  const err = orders.error || products.error;
  const os = (orders.data || []) as Order[];
  const ps = (products.data || []) as { id: string; name: string; stock: number; active: boolean }[];
  const cs = (chats.data || []) as Conv[];
  const valid = os.filter((o) => o.status !== "cancelado");
  const pendientes = os.filter((o) => o.status === "pendiente");
  const hoy = valid
    .filter((o) => o.delivery_date === today)
    .sort((a, b) => (a.delivery_time || "99").localeCompare(b.delivery_time || "99"));
  const esperando = cs.filter((c) => c.needs_human && c.status !== "cerrada");
  const lowStock = ps.filter((p) => p.active && p.stock <= 3).sort((a, b) => a.stock - b.stock);
  const mes = today.slice(0, 7);
  const facturadoMes = valid.filter((o) => o.created_at.slice(0, 7) === mes).reduce((a, o) => a + Number(o.total), 0);

  const fecha = new Date(today + "T12:00:00Z").toLocaleDateString("es-PY", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
  const hora = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Asuncion" }).format(new Date()));
  const saludo = hora < 12 ? "Buen día" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-thyme capitalize">{fecha}</div>
          <h1 className="font-serif text-4xl text-ink mt-1">{saludo} 🌸</h1>
          <p className="text-sm text-muted mt-1">Esto es lo que pasa hoy en Camélia.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip ok={!!settings.data?.bot_enabled} on="Bot web encendido" off="Bot web apagado" />
          <Chip ok={settings.data?.wa_bot_enabled !== false} on="Bot WhatsApp encendido" off="Bot WhatsApp apagado" />
          <span className="rounded-full px-3 py-1.5 bg-cream border border-champagne text-ink/80">
            Pedidos del bot: {settings.data?.bot_auto_confirm ? "se confirman solos" : "quedan pendientes"}
          </span>
        </div>
      </header>

      {err && (
        <div className="flex items-start gap-3 bg-blush/40 border border-rose/40 rounded-2xl p-4 mb-6 text-sm">
          <AlertTriangle size={18} className="text-rose shrink-0 mt-0.5" />
          <div>No se pudo leer la base: <code>{err.message}</code>. Revisá que el schema <b>cameliaboutique</b> esté expuesto en la API.</div>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat icon={ShoppingBag} tone="rose" label="Pedidos pendientes" value={pendientes.length} hint="Para confirmar" href="/admin/pedidos?estado=pendiente" />
        <Stat icon={CalendarDays} tone="thyme" label="Entregas de hoy" value={hoy.length} hint={hoy[0]?.delivery_time ? `Primera ${hoy[0].delivery_time.split(" ")[0]}` : "Sin turnos"} href="/admin/agenda" />
        <Stat icon={MessageCircle} tone="bisque" label="Chats esperando" value={esperando.length} hint="Piden una persona" href="/admin/conversaciones" />
        <Stat icon={Wallet} tone="champagne" label="Vendido este mes" value={formatGs(facturadoMes)} hint={`${valid.filter((o) => o.created_at.slice(0, 7) === mes).length} pedidos`} href="/admin/pedidos" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-6">
        <Card title="Para entregar hoy" icon={PackageCheck} href="/admin/agenda" linkLabel="Ver agenda">
          {hoy.length === 0 ? (
            <Empty>No hay entregas para hoy.</Empty>
          ) : (
            <ul className="divide-y divide-champagne">
              {hoy.slice(0, 6).map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-16 text-xs text-thyme flex items-center gap-1"><Clock size={12} />{o.delivery_time?.split(" a ")[0] || "—"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{o.customer_name}</div>
                    <div className="text-[11px] text-thyme">{o.delivery === "pickup" ? "Retira en el local" : "Envío"} · {formatGs(o.total)}</div>
                  </div>
                  <span className={"text-[10px] rounded-full px-2 py-0.5 " + STATUS_STYLE[o.status]}>{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Chats que esperan una persona" icon={MessageCircle} href="/admin/conversaciones" linkLabel="Ir a conversaciones">
          {esperando.length === 0 ? (
            <Empty>Nadie esperando. El bot está atendiendo todo. ✨</Empty>
          ) : (
            <ul className="divide-y divide-champagne">
              {esperando.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/conversaciones/${c.id}`} className="flex items-center gap-3 py-2.5 hover:bg-champagne/30 -mx-2 px-2 rounded-lg">
                    <Avatar name={c.visitor_name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink truncate">{c.visitor_name || "Visitante"}</div>
                      <div className="text-[11px] text-thyme truncate">{c.last_message || "—"}</div>
                    </div>
                    <span className="text-[10px] text-thyme">{c.channel === "whatsapp" ? "WhatsApp" : "Web"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 mt-5">
        <Card title="Pedidos recientes" icon={ShoppingBag} href="/admin/pedidos" linkLabel="Ver todos">
          {os.length === 0 ? (
            <Empty>Todavía no hay pedidos.</Empty>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-thyme">
                    <th className="text-left font-medium px-5 pb-2">Cliente</th>
                    <th className="text-left font-medium pb-2">Origen</th>
                    <th className="text-left font-medium pb-2">Total</th>
                    <th className="text-left font-medium pb-2 pr-5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {os.slice(0, 7).map((o) => (
                    <tr key={o.id} className="border-t border-champagne">
                      <td className="px-5 py-2.5">
                        <div className="text-ink">{o.customer_name}</div>
                        <div className="text-[11px] text-thyme font-mono">#{o.id.slice(0, 8)}</div>
                      </td>
                      <td className="py-2.5 text-xs">{SOURCE_LABEL[o.source || "web"]}</td>
                      <td className="py-2.5 text-rose">{formatGs(o.total)}</td>
                      <td className="py-2.5 pr-5">
                        <span className={"text-[11px] rounded-full px-2 py-0.5 " + STATUS_STYLE[o.status]}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Stock bajo" icon={AlertTriangle} href="/admin/productos" linkLabel="Productos">
            {lowStock.length === 0 ? (
              <Empty>Todo con stock.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {lowStock.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/productos/${p.id}`} className="flex items-center justify-between text-sm hover:text-rose">
                      <span className="truncate">{p.name}</span>
                      <span className={"text-xs rounded-full px-2 py-0.5 " + (p.stock === 0 ? "bg-rose text-cream" : "bg-bisque/50 text-ink")}>
                        {p.stock === 0 ? "agotado" : `${p.stock} u.`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Mini icon={Users} label="Contactos" value={contacts.count ?? 0} href="/admin/contactos" />
            <Mini icon={Bot} label="Pedidos del bot" value={os.filter((o) => o.source === "bot" || o.source === "whatsapp").length} href="/admin/pedidos?origen=bot" />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-thyme/70 mt-6">Sesión: {user.email}</p>
    </div>
  );
}

const TONES: Record<string, string> = {
  rose: "bg-blush/50 text-rose",
  thyme: "bg-thyme/15 text-thyme",
  bisque: "bg-bisque/40 text-ink",
  champagne: "bg-champagne text-ink",
};

function Stat({ icon: Icon, tone, label, value, hint, href }: { icon: LucideIcon; tone: string; label: string; value: React.ReactNode; hint?: string; href: string }) {
  return (
    <Link href={href} className="group bg-cream border border-champagne rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition">
      <div className="flex items-start justify-between">
        <div className={"w-10 h-10 rounded-xl flex items-center justify-center " + TONES[tone]}>
          <Icon size={19} strokeWidth={1.8} />
        </div>
        <ArrowRight size={15} className="text-thyme/40 group-hover:text-rose transition" />
      </div>
      <div className="font-serif text-3xl text-ink mt-4 leading-none">{value}</div>
      <div className="text-sm text-ink/80 mt-1.5">{label}</div>
      {hint && <div className="text-[11px] text-thyme mt-0.5">{hint}</div>}
    </Link>
  );
}

function Card({ title, icon: Icon, href, linkLabel, children }: { title: string; icon: LucideIcon; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="bg-cream border border-champagne rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 font-serif text-xl text-ink">
          <Icon size={17} strokeWidth={1.8} className="text-rose" /> {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs text-thyme hover:text-rose flex items-center gap-1">
            {linkLabel} <ArrowRight size={12} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Mini({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="bg-cream border border-champagne rounded-2xl p-4 hover:shadow-sm">
      <Icon size={16} className="text-thyme" strokeWidth={1.8} />
      <div className="font-serif text-2xl text-ink mt-2 leading-none">{value}</div>
      <div className="text-[11px] text-thyme mt-1">{label}</div>
    </Link>
  );
}

function Chip({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return (
    <span className={"rounded-full px-3 py-1.5 flex items-center gap-1.5 " + (ok ? "bg-thyme/15 text-thyme" : "bg-ink/10 text-ink/70")}>
      <span className={"w-1.5 h-1.5 rounded-full " + (ok ? "bg-thyme" : "bg-ink/40")} />
      {ok ? on : off}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-thyme py-6 text-center">{children}</div>;
}

function Avatar({ name }: { name: string | null }) {
  return (
    <div className="w-9 h-9 rounded-full bg-blush/60 text-ink font-serif flex items-center justify-center shrink-0">
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}
