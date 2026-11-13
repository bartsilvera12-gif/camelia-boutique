import Link from "next/link";
import { Bot, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Package, Phone, Store, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { formatGs } from "@/lib/format";
import { isoDate, todayPY } from "@/lib/bot/text";
import type { Order, OrderStatus } from "@/lib/types";
import { StatusSelect } from "../pedidos/OrderControls";

type SP = { mes?: string; dia?: string; canceladas?: string };

const WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// color de cada pedido en el calendario según su estado
const CHIP: Record<OrderStatus, string> = {
  pendiente: "bg-bisque/55 text-ink border-l-[3px] border-bisque",
  confirmado: "bg-blush/55 text-ink border-l-[3px] border-rose",
  preparando: "bg-champagne text-ink border-l-[3px] border-[#d9b98f]",
  enviado: "bg-thyme/15 text-ink border-l-[3px] border-thyme/60",
  entregado: "bg-thyme text-champagne border-l-[3px] border-thyme",
  cancelado: "bg-ink/5 text-ink/45 line-through border-l-[3px] border-ink/20",
};
const DOT: Record<OrderStatus, string> = {
  pendiente: "bg-bisque",
  confirmado: "bg-rose",
  preparando: "bg-[#d9b98f]",
  enviado: "bg-thyme/60",
  entregado: "bg-thyme",
  cancelado: "bg-ink/25",
};

const ACCENT: Record<OrderStatus, string> = {
  pendiente: "#E5BCA9",
  confirmado: "#C87D87",
  preparando: "#D9B98F",
  enviado: "#9AA284",
  entregado: "#6B7556",
  cancelado: "#CFC7C2",
};

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const byTime = (a: Order, b: Order) => (a.delivery_time || "99").localeCompare(b.delivery_time || "99");

export default async function AgendaPage({ searchParams }: { searchParams: SP }) {
  const { sb } = await requireAdmin();
  const today = isoDate(todayPY());
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes || "") ? searchParams.mes! : today.slice(0, 7);
  const showCancelled = searchParams.canceladas === "1";
  const first = `${mes}-01`;
  const [y, m] = mes.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7; // lunes = 0
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const gridStart = addDays(first, -offset);
  const gridEnd = addDays(gridStart, cells - 1);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.dia || "")
    ? searchParams.dia!
    : today.startsWith(mes) ? today : first;

  let q = sb.from("orders").select("*, order_items(*)").gte("delivery_date", gridStart).lte("delivery_date", gridEnd);
  if (!showCancelled) q = q.neq("status", "cancelado");
  const [{ data, error }, { data: undated }, { data: closed }] = await Promise.all([
    q,
    sb.from("orders").select("*, order_items(*)").is("delivery_date", null).in("status", ["pendiente", "confirmado", "preparando"]).order("created_at", { ascending: false }).limit(50),
    sb.from("delivery_closed_days").select("day, reason").gte("day", gridStart).lte("day", gridEnd),
  ]);
  const orders = (data || []) as Order[];
  const cerrados = new Map(((closed || []) as { day: string; reason: string | null }[]).map((c) => [c.day, c.reason]));
  const delDia = (d: string) => orders.filter((o) => o.delivery_date === d).sort(byTime);

  const delMes = orders.filter((o) => o.delivery_date?.startsWith(mes) && o.status !== "cancelado");
  const nombreMes = new Date(first + "T12:00:00Z").toLocaleDateString("es-PY", { month: "long", timeZone: "UTC" });
  const tituloMes = `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${y}`;
  const seleccion = delDia(dia);
  const diaTxt = new Date(dia + "T12:00:00Z").toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const tituloDia = diaTxt.charAt(0).toUpperCase() + diaTxt.slice(1);

  const link = (p: Partial<SP>) => {
    const sp = new URLSearchParams();
    const merged = { mes, canceladas: showCancelled ? "1" : undefined, ...p };
    Object.entries(merged).forEach(([k, v]) => v && sp.set(k, v));
    return `/admin/agenda?${sp.toString()}`;
  };

  return (
    <div className="max-w-[1400px]">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-thyme">Agenda de entregas</div>
          <h1 className="font-serif text-4xl text-ink mt-1">{tituloMes}</h1>
          <p className="text-sm text-muted mt-1">
            {delMes.length} pedido{delMes.length === 1 ? "" : "s"} este mes ·{" "}
            {delMes.filter((o) => o.status === "pendiente").length} por confirmar ·{" "}
            {formatGs(delMes.reduce((a, o) => a + Number(o.total), 0))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={link({ mes: addMonths(mes, -1), dia: undefined })} scroll={false} aria-label="Mes anterior" className="w-9 h-9 rounded-full border border-champagne bg-cream flex items-center justify-center text-ink hover:border-thyme">
            <ChevronLeft size={17} />
          </Link>
          <Link href={link({ mes: today.slice(0, 7), dia: today })} scroll={false} className="h-9 px-4 rounded-full border border-champagne bg-cream flex items-center text-sm text-ink hover:border-thyme">
            Hoy
          </Link>
          <Link href={link({ mes: addMonths(mes, 1), dia: undefined })} scroll={false} aria-label="Mes siguiente" className="w-9 h-9 rounded-full border border-champagne bg-cream flex items-center justify-center text-ink hover:border-thyme">
            <ChevronRight size={17} />
          </Link>
          <Link href={link({ canceladas: showCancelled ? undefined : "1", dia })} scroll={false} className="text-xs text-thyme underline ml-2">
            {showCancelled ? "Ocultar cancelados" : "Ver cancelados"}
          </Link>
        </div>
      </header>
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <div className="grid xl:grid-cols-[1fr_360px] gap-5 items-start">
        {/* calendario */}
        <section className="bg-cream border border-champagne rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 bg-champagne/50 border-b border-champagne">
            {WEEK.map((w, i) => (
              <div key={w} className={"py-2 text-center text-[11px] uppercase tracking-widest " + (i >= 5 ? "text-rose/80" : "text-thyme")}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: cells }, (_, i) => {
              const d = addDays(gridStart, i);
              const enMes = d.startsWith(mes);
              const list = delDia(d);
              const sel = d === dia;
              const esHoy = d === today;
              const cerrado = cerrados.has(d);
              const pasado = d < today;
              return (
                <Link
                  key={d}
                  href={link({ mes: d.slice(0, 7), dia: d })}
                  scroll={false}
                  className={
                    "relative min-h-[76px] sm:min-h-[118px] p-1.5 sm:p-2 border-b border-r border-champagne/80 transition-colors " +
                    ((i + 1) % 7 === 0 ? "border-r-0 " : "") +
                    (enMes ? "bg-cream hover:bg-champagne/30 " : "bg-[#F7F1E8] text-ink/40 hover:bg-champagne/30 ") +
                    (cerrado ? "bg-[repeating-linear-gradient(135deg,#F7F1E8_0,#F7F1E8_6px,#FBEAD6_6px,#FBEAD6_12px)] " : "") +
                    (sel ? "ring-2 ring-inset ring-rose z-10 " : "")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        "w-7 h-7 rounded-full flex items-center justify-center text-[13px] " +
                        (esHoy ? "bg-thyme text-champagne font-semibold" : pasado && enMes ? "text-ink/50" : enMes ? "text-ink" : "")
                      }
                    >
                      {Number(d.slice(8))}
                    </span>
                    {list.length > 0 && (
                      <span className="hidden sm:inline text-[10px] text-thyme">{list.length}</span>
                    )}
                  </div>
                  {cerrado && <div className="text-[9.5px] uppercase tracking-wider text-rose mt-0.5 truncate">Cerrado</div>}

                  {/* escritorio: etiquetas */}
                  <div className="hidden sm:block space-y-1 mt-1">
                    {list.slice(0, 3).map((o) => (
                      <div key={o.id} className={"rounded-md px-1.5 py-0.5 text-[11px] leading-tight truncate " + CHIP[o.status]}>
                        {o.delivery_time && <span className="opacity-70 mr-1">{o.delivery_time.slice(0, 5)}</span>}
                        {(o.source === "bot" || o.source === "whatsapp") && <Bot size={10} className="inline -mt-0.5 mr-0.5 opacity-70" />}
                        {o.customer_name.split(" ")[0]}
                      </div>
                    ))}
                    {list.length > 3 && <div className="text-[10.5px] text-thyme pl-1">+{list.length - 3} más</div>}
                  </div>
                  {/* celular: puntitos */}
                  {list.length > 0 && (
                    <div className="sm:hidden flex flex-wrap gap-0.5 mt-1">
                      {list.slice(0, 6).map((o) => <span key={o.id} className={"w-1.5 h-1.5 rounded-full " + DOT[o.status]} />)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 border-t border-champagne text-[11px] text-thyme">
            {(Object.keys(DOT) as OrderStatus[]).filter((s) => showCancelled || s !== "cancelado").map((s) => (
              <span key={s} className="flex items-center gap-1.5"><span className={"w-2 h-2 rounded-full " + DOT[s]} />{s}</span>
            ))}
            <span className="flex items-center gap-1.5"><Bot size={11} /> lo tomó el bot</span>
          </div>
        </section>

        {/* detalle del día */}
        <aside className="bg-cream border border-champagne rounded-2xl xl:sticky xl:top-6">
          <div className="px-5 pt-5 pb-4 border-b border-champagne">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-thyme">
              <CalendarDays size={13} /> {dia === today ? "Hoy" : "Día elegido"}
            </div>
            <h2 className="font-serif text-2xl text-ink mt-1">{tituloDia}</h2>
            <div className="text-xs text-thyme mt-1">
              {seleccion.length === 0
                ? cerrados.has(dia) ? `Cerrado${cerrados.get(dia) ? ` · ${cerrados.get(dia)}` : ""}` : "Sin entregas"
                : `${seleccion.length} entrega${seleccion.length === 1 ? "" : "s"} · ${formatGs(seleccion.filter((o) => o.status !== "cancelado").reduce((a, o) => a + Number(o.total), 0))}`}
            </div>
          </div>
          <div className="thin-scroll p-3 space-y-2.5 xl:max-h-[calc(100vh-14rem)] overflow-y-auto">
            {seleccion.length === 0 && (
              <div className="text-center text-sm text-thyme py-10">
                <Package size={22} className="mx-auto mb-2 opacity-50" />
                No hay pedidos para este día.
              </div>
            )}
            {seleccion.map((o) => <OrderCard key={o.id} o={o} />)}
          </div>
        </aside>
      </div>

      {(undated || []).length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl text-ink mb-1">Pedidos abiertos sin fecha</h2>
          <p className="text-xs text-thyme mb-3">Asignales día desde <Link href="/admin/pedidos" className="underline">Pedidos</Link> y aparecen en el calendario.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(undated as Order[]).map((o) => <OrderCard key={o.id} o={o} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function OrderCard({ o }: { o: Order }) {
  const items = o.order_items || [];
  return (
    <div className="rounded-xl border border-champagne border-l-4 bg-[#FFFDFA] p-3.5" style={{ borderLeftColor: ACCENT[o.status] }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] text-ink truncate flex items-center gap-1.5">
            {o.customer_name}
            {(o.source === "bot" || o.source === "whatsapp") && (
              <span className="text-[9px] uppercase tracking-widest bg-thyme text-champagne rounded px-1 py-0.5">{o.source === "whatsapp" ? "WhatsApp" : "Bot"}</span>
            )}
          </div>
          <div className="text-[11px] text-thyme font-mono">#{o.id.slice(0, 8)}</div>
        </div>
        <StatusSelect id={o.id} status={o.status} />
      </div>
      <ul className="mt-2 text-[12.5px] text-ink/85 space-y-0.5">
        {items.map((i) => <li key={i.id}>{i.qty} × {i.name}</li>)}
      </ul>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-thyme">
        <span className="flex items-center gap-1.5"><Clock size={12} />{o.delivery_time || "Sin horario"}</span>
        <span className="flex items-center gap-1.5 truncate">
          {o.delivery === "pickup" ? <Store size={12} /> : <MapPin size={12} />}
          <span className="truncate">{o.shipping_method || (o.delivery === "pickup" ? "Retira en el local" : "Envío")}</span>
        </span>
        <span className="flex items-center gap-1.5"><Wallet size={12} />{o.payment}</span>
        <span className="flex items-center gap-1.5"><Phone size={12} />{o.phone}</span>
      </div>
      {o.delivery !== "pickup" && o.address && <div className="text-[11.5px] text-ink/70 mt-1.5">📍 {o.address}</div>}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-champagne">
        <span className="text-[11px] text-thyme">{o.shipping_cost ? `incluye envío ${formatGs(o.shipping_cost)}` : ""}</span>
        <span className="font-serif text-lg text-rose">{formatGs(o.total)}</span>
      </div>
    </div>
  );
}
