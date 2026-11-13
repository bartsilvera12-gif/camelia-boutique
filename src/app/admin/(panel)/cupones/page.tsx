import { requireAdmin } from "@/lib/admin";
import ConfirmButton from "../ConfirmButton";
import { deleteCoupon, saveCoupon } from "./actions";
import SaveButton from "../SaveButton";

type CouponRow = {
  code: string;
  percent: number;
  label: string | null;
  active: boolean;
  valid_until: string | null;
};

export default async function CuponesPage() {
  const { sb } = await requireAdmin();
  const [{ data, error }, { data: usos }] = await Promise.all([
    sb.from("coupons").select("*").order("created_at", { ascending: false }),
    sb.from("orders").select("coupon_code, discount, status").not("coupon_code", "is", null),
  ]);
  const list = (data || []) as CouponRow[];
  const usados = (code: string) =>
    (usos || []).filter((o: any) => o.coupon_code === code && o.status !== "cancelado").length;

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Cupones</h1>
      <p className="text-sm text-thyme mb-6">
        Códigos de descuento del checkout. El descuento se calcula sobre el total, después de las rebajas de cada producto.
      </p>
      {error && <div className="bg-blush/40 rounded-xl p-3 mb-4 text-sm">{error.message}</div>}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-3">
          {list.map((c) => (
            <form key={c.code} action={saveCoupon} className={"bg-cream border border-champagne rounded-xl p-4 grid sm:grid-cols-[1fr_90px_150px] gap-3 " + (c.active ? "" : "opacity-60")}>
              <input type="hidden" name="original" value={c.code} />
              <div><label className="label">Código</label><input name="code" defaultValue={c.code} className="input uppercase tracking-widest" /></div>
              <div><label className="label">%</label><input name="percent" type="number" min={1} max={100} defaultValue={c.percent} className="input" /></div>
              <div><label className="label">Vence</label><input name="valid_until" type="date" defaultValue={c.valid_until || ""} className="input" /></div>
              <div className="sm:col-span-3"><label className="label">Texto que ve el cliente</label><input name="label" defaultValue={c.label || ""} className="input" /></div>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c.active} /> Activo</label>
                <span className="text-xs text-thyme">Usado en {usados(c.code)} pedido(s)</span>
                <div className="ml-auto flex items-center gap-3">
                  <ConfirmButton action={deleteCoupon.bind(null, c.code)} message={`¿Eliminar el cupón ${c.code}? Los pedidos que lo usaron no cambian.`} className="text-xs text-rose hover:underline">
                    Eliminar
                  </ConfirmButton>
                  <SaveButton className="btn-outline !py-1.5 !px-4 !text-xs">Guardar</SaveButton>
                </div>
              </div>
            </form>
          ))}
          {list.length === 0 && <div className="text-sm text-thyme">No hay cupones.</div>}
        </div>

        <form action={saveCoupon} className="bg-cream border border-champagne rounded-xl p-5 lg:sticky lg:top-8">
          <h2 className="font-serif text-lg text-ink mb-3">Nuevo cupón</h2>
          <label className="label">Código</label>
          <input name="code" required placeholder="VERANO15" className="input mb-3 uppercase tracking-widest" />
          <label className="label">Descuento %</label>
          <input name="percent" type="number" min={1} max={100} required defaultValue={10} className="input mb-3" />
          <label className="label">Vence (opcional)</label>
          <input name="valid_until" type="date" className="input mb-3" />
          <label className="label">Texto que ve el cliente</label>
          <input name="label" placeholder="15% off en toda la tienda" className="input mb-4" />
          <SaveButton className="btn-primary w-full" resetOnDone doneText="✓ Creado">Crear</SaveButton>
        </form>
      </div>
    </>
  );
}
