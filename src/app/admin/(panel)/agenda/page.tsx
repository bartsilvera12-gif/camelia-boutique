import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatGs } from "@/lib/format";
import { isoDate, todayPY } from "@/lib/bot/text";
import type { Order } from "@/lib/types";
import { StatusSelect } from "../pedidos/OrderControls";

const DAYS = 14;

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

export default async function AgendaPage({ searchParams }: { searchParams: { desde?: string; canceladas?: string } }) {
  const { sb } = await requireAdmin();
  const today = isoDate(todayPY());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.desde || "") ? searchParams.desde! : today;
  const to = addDays(from, DAYS - 1);
  const showCancelled = searchParams.canceladas === "1";

  let q = sb.from("orders").select("*, order_items(*)").gte("delivery_date", from).lte("delivery_date", to).order("created_at");
  if (!showCancelled) q = q.neq("status", "cancelado");
  const [{ data, error }, { data: undated }] = await Promise.all([
    q,
    sb.from("orders").select("*, order_items(*)").is("delivery_date", null).in("status", ["pendiente", "confirmado", "preparando"]).order("created_at", { ascending: false }).limit(50),
  ]);
  const orders = (data || []) as Order[];
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));

  const nav = (d: string) => `/admin/agenda?desde=${d}${showCancelled ? "&canceladas=1" : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-3xl text-ink mb-1">Agenda</h1>
          <p className="text-sm text-thyme">Pedidos por día de entrega. Los que tomó el bot están marcados.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link href={nav(addDays(from, -DAYS))} className="btn-outline !py-1.5 !px-3 !text-xs">← Anterior</Link>
          <Link href={nav(today)} className="btn-outline !py-1.5 !px-3 !text-xs">Hoy</Link>
          <Link href={nav(addDays(from, DAYS))} className="btn-outline !py-1.5 !px-3 !text-xs">Siguiente →</Link>
          <Link
            href={`/admin/agenda?desde=${from}${showCancelled ? "" : "&canceladas=1"}`}
            className="self-center text-thyme underline ml-2"
          >
            {showCancelled ? "Ocultar cancelados" : "Ver cancelados"}
          </Link>
        </div>
      </div>
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {days.map((d) => {
          const list = orders.filter((o) => o.delivery_date === d);
          const date = new Date(d + "T12:00:00Z");
          return (
            <div key={d} className={"rounded-xl border p-3 " + (d === today ? "border-thyme bg-thyme/5" : "border-champagne bg-cream")}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="font-serif text-lg text-ink capitalize">
                  {date.toLocaleDateString("es-PY", { weekday: "long", timeZone: "UTC" })}{" "}
                  <span className="text-thyme text-sm">{date.toLocaleDateString("es-PY", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                </div>
                {d === today && <span className="text-[10px] uppercase tracking-widest text-thyme">Hoy</span>}
              </div>
              {list.length === 0 ? (
                <div className="text-xs text-thyme/70 py-2">Sin pedidos</div>
              ) : (
                <ul className="space-y-2">
                  {list.map((o) => <AgendaItem key={o.id} o={o} />)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {(undated || []).length > 0 && (
        <>
          <h2 className="font-serif text-xl text-ink mt-10 mb-3">Pedidos abiertos sin fecha</h2>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {(undated as Order[]).map((o) => <AgendaItem key={o.id} o={o} />)}
          </ul>
          <p className="text-xs text-thyme mt-2">Asignales fecha desde <Link href="/admin/pedidos" className="underline">Pedidos</Link>.</p>
        </>
      )}
    </>
  );
}

function AgendaItem({ o }: { o: Order }) {
  return (
    <li className="bg-[#FFFDFA] border border-champagne rounded-lg p-2.5 text-sm">
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="text-ink truncate">
            {o.customer_name}
            {o.source === "bot" && (
              <span className="ml-1.5 text-[9px] uppercase tracking-widest bg-thyme text-champagne rounded px-1 py-0.5 align-middle">Bot</span>
            )}
          </div>
          <div className="text-[11px] text-thyme truncate">
            {(o.order_items || []).map((i) => `${i.qty}× ${i.name}`).join(", ")}
          </div>
          <div className="text-[11px] text-rose">{formatGs(o.total)} · {o.phone}</div>
        </div>
        <StatusSelect id={o.id} status={o.status} />
      </div>
    </li>
  );
}
