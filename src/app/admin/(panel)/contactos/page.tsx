import { requireAdmin } from "@/lib/admin";
import { SOURCE_LABEL } from "@/lib/admin-styles";
import { formatGs } from "@/lib/format";
import type { Customer } from "@/lib/types";
import ConfirmButton from "../ConfirmButton";
import { deleteCustomer, saveCustomer } from "./actions";
import SaveButton from "../SaveButton";

export default async function ContactosPage({ searchParams }: { searchParams: { q?: string } }) {
  const { sb } = await requireAdmin();
  let q = sb.from("customers").select("*").order("created_at", { ascending: false }).limit(500);
  if (searchParams.q) {
    const s = searchParams.q.replace(/[,()]/g, " ");
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }
  const [{ data, error }, { data: orders }] = await Promise.all([
    q,
    sb.from("orders").select("customer_id, total, status"),
  ]);
  const list = (data || []) as Customer[];
  const stats = (id: string) => {
    const os = (orders || []).filter((o: any) => o.customer_id === id && o.status !== "cancelado");
    return { n: os.length, total: os.reduce((a: number, o: any) => a + Number(o.total), 0) };
  };
  const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "595")}`;

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Contactos</h1>
      <p className="text-sm text-thyme mb-6">Datos de quienes compraron o escribieron al bot.</p>
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div>
          <form className="flex gap-2 mb-3">
            <input name="q" defaultValue={searchParams.q} placeholder="Buscar nombre, teléfono o email" className="input md:w-80" />
            <button className="btn-outline !py-2 !px-4">Buscar</button>
          </form>
          <div className="space-y-2">
            {list.map((c) => {
              const s = stats(c.id);
              return (
                <details key={c.id} className="bg-cream border border-champagne rounded-xl">
                  <summary className="list-none cursor-pointer px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-ink min-w-[160px]">{c.name}</span>
                    <span className="text-xs text-thyme">{c.phone}</span>
                    {c.email && <span className="text-xs text-thyme">{c.email}</span>}
                    <span className="text-[10px] uppercase tracking-widest bg-champagne rounded px-1.5 py-0.5">{SOURCE_LABEL[c.source] || c.source}</span>
                    <span className="ml-auto text-xs text-thyme">{s.n} pedido(s){s.n ? ` · ${formatGs(s.total)}` : ""}</span>
                  </summary>
                  <form action={saveCustomer} className="border-t border-champagne p-4 grid sm:grid-cols-2 gap-3">
                    <input type="hidden" name="id" value={c.id} />
                    <div><label className="label">Nombre</label><input name="name" defaultValue={c.name} required className="input" /></div>
                    <div><label className="label">Teléfono</label><input name="phone" defaultValue={c.phone} required className="input" /></div>
                    <div><label className="label">Email</label><input name="email" type="email" defaultValue={c.email || ""} className="input" /></div>
                    <div><label className="label">Ciudad</label><input name="city" defaultValue={c.city || ""} className="input" /></div>
                    <div className="sm:col-span-2"><label className="label">Dirección</label><input name="address" defaultValue={c.address || ""} className="input" /></div>
                    <div className="sm:col-span-2"><label className="label">Notas</label><textarea name="notes" rows={2} defaultValue={c.notes || ""} className="input" /></div>
                    <div className="sm:col-span-2 flex items-center gap-4">
                      <SaveButton className="btn-outline !py-1.5 !px-4 !text-xs">Guardar</SaveButton>
                      <a href={wa(c.phone)} target="_blank" rel="noreferrer" className="text-xs text-thyme underline">Escribir por WhatsApp</a>
                      <ConfirmButton action={deleteCustomer.bind(null, c.id)} message={`¿Eliminar a ${c.name} de contactos? Sus pedidos se mantienen.`} className="ml-auto text-xs text-rose hover:underline">
                        Eliminar
                      </ConfirmButton>
                    </div>
                  </form>
                </details>
              );
            })}
            {list.length === 0 && <div className="text-sm text-thyme py-8 text-center">No hay contactos.</div>}
          </div>
        </div>

        <form action={saveCustomer} className="bg-cream border border-champagne rounded-xl p-5 lg:sticky lg:top-8">
          <h2 className="font-serif text-lg text-ink mb-3">Nuevo contacto</h2>
          <label className="label">Nombre</label>
          <input name="name" required className="input mb-3" />
          <label className="label">Teléfono</label>
          <input name="phone" required className="input mb-3" />
          <label className="label">Email</label>
          <input name="email" type="email" className="input mb-3" />
          <label className="label">Notas</label>
          <textarea name="notes" rows={2} className="input mb-4" />
          <SaveButton className="btn-primary w-full" resetOnDone doneText="✓ Agregado">Agregar</SaveButton>
        </form>
      </div>
    </>
  );
}
