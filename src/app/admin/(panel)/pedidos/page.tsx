import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { ORDER_STATUSES, type Order } from "@/lib/types";
import OrderCard from "./OrderRow";

type SP = { estado?: string; origen?: string; q?: string };

export default async function AdminPedidosPage({ searchParams }: { searchParams: SP }) {
  const { sb } = await requireAdmin();
  let q = sb.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(300);
  if (searchParams.estado && ORDER_STATUSES.includes(searchParams.estado as any)) q = q.eq("status", searchParams.estado);
  if (searchParams.origen) q = q.eq("source", searchParams.origen);
  if (searchParams.q) q = q.or(`customer_name.ilike.%${searchParams.q.replace(/[,()]/g, " ")}%,phone.ilike.%${searchParams.q.replace(/[,()]/g, " ")}%`);
  const { data, error } = await q;
  const orders = (data || []) as Order[];

  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return `/admin/pedidos${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    "text-xs rounded-full px-3 py-1 border " + (active ? "bg-thyme text-champagne border-thyme" : "border-bisque text-ink hover:border-thyme");

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Pedidos</h1>
      <p className="text-sm text-thyme mb-6">Todos los pedidos de la web y del bot. Tocá uno para ver el detalle.</p>
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <div className="flex flex-wrap gap-2 mb-3">
        <Link href={link({ estado: undefined })} className={chip(!searchParams.estado)}>Todos</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={link({ estado: s })} className={chip(searchParams.estado === s)}>{s}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <Link href={link({ origen: undefined })} className={chip(!searchParams.origen)}>Cualquier origen</Link>
        <Link href={link({ origen: "web" })} className={chip(searchParams.origen === "web")}>Web</Link>
        <Link href={link({ origen: "bot" })} className={chip(searchParams.origen === "bot")}>Bot</Link>
        <form className="ml-auto flex gap-2">
          {searchParams.estado && <input type="hidden" name="estado" value={searchParams.estado} />}
          {searchParams.origen && <input type="hidden" name="origen" value={searchParams.origen} />}
          <input name="q" defaultValue={searchParams.q} placeholder="Nombre o teléfono" className="input !py-1.5 md:w-56" />
        </form>
      </div>

      <div className="space-y-2">
        {orders.map((o) => <OrderCard key={o.id} o={o} />)}
        {orders.length === 0 && <div className="text-sm text-thyme py-10 text-center">No hay pedidos con esos filtros.</div>}
      </div>
    </>
  );
}
