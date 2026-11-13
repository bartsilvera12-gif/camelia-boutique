import { requireAdmin } from "@/lib/admin";
import type { DeliverySlotRow, ShippingMethod, StoreSettings } from "@/lib/types";
import { formatGs } from "@/lib/format";
import ConfirmButton from "../ConfirmButton";
import { addClosedDay, deleteShipping, deleteSlot, removeClosedDay, saveDeliverySettings, saveShipping, saveSlot } from "./actions";
import SaveButton from "../SaveButton";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hm = (t: string) => t.slice(0, 5);

export default async function EntregasPage() {
  const { sb } = await requireAdmin();
  const [{ data: slotsData }, { data: closed }, { data: s }, { data: libres }, { data: envios }] = await Promise.all([
    sb.from("delivery_slots").select("*").order("weekday").order("start_time"),
    sb.from("delivery_closed_days").select("*").gte("day", new Date().toISOString().slice(0, 10)).order("day"),
    sb.from("settings").select("payment_methods, pickup_enabled, delivery_lead_days, delivery_days_ahead").eq("id", 1).maybeSingle(),
    sb.rpc("available_slots", { p_days: 7 }),
    sb.from("shipping_methods").select("*").order("sort_order").order("price"),
  ]);
  const shipping = (envios || []) as ShippingMethod[];
  const slots = (slotsData || []) as DeliverySlotRow[];
  const settings = (s || {}) as StoreSettings;
  const proximos = (libres || []) as { date: string; start: string; end: string; remaining: number }[];
  // lunes primero
  const orden = [1, 2, 3, 4, 5, 6, 0];

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Entregas y pagos</h1>
      <p className="text-sm text-thyme mb-6">
        Tipos de envío con su costo, días, horarios y cupos que ofrecen el bot y el checkout. Un turno lleno deja de ofrecerse solo.
      </p>

      <div className="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          <section className="bg-cream border border-champagne rounded-xl p-5">
            <h2 className="font-serif text-xl text-ink">Tipos de envío y costos</h2>
            <p className="text-[11px] text-thyme mb-4">
              Es lo que la persona elige en el checkout y en el bot. El costo se suma al total del pedido.
              “Retiro” no pide dirección.
            </p>
            <div className="space-y-3">
              {shipping.map((m) => (
                <form key={m.id} action={saveShipping} className={"rounded-xl border border-champagne p-3 grid sm:grid-cols-[1fr_130px_120px_70px] gap-2 items-end " + (m.active === false ? "opacity-60" : "")}>
                  <input type="hidden" name="id" value={m.id} />
                  <div><label className="label">Nombre</label><input name="name" defaultValue={m.name} required className="input !py-1.5" /></div>
                  <div><label className="label">Costo (Gs.)</label><input name="price" type="number" min={0} step={1000} defaultValue={Number(m.price)} className="input !py-1.5" /></div>
                  <div>
                    <label className="label">Tipo</label>
                    <select name="kind" defaultValue={m.kind} className="input !py-1.5">
                      <option value="envio">Envío</option>
                      <option value="retiro">Retiro</option>
                    </select>
                  </div>
                  <div><label className="label">Orden</label><input name="sort_order" type="number" defaultValue={m.sort_order ?? 0} className="input !py-1.5" /></div>
                  <div className="sm:col-span-4"><input name="description" defaultValue={m.description || ""} placeholder="Descripción corta (opcional)" className="input !py-1.5" /></div>
                  <div className="sm:col-span-4 flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={m.active !== false} /> Activo</label>
                    <span className="text-xs text-thyme">{Number(m.price) ? formatGs(Number(m.price)) : "Gratis"}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <ConfirmButton action={deleteShipping.bind(null, m.id)} message={`¿Eliminar "${m.name}"? Los pedidos que ya lo usaron no cambian.`} className="text-xs text-rose hover:underline">
                        Eliminar
                      </ConfirmButton>
                      <SaveButton className="btn-outline !py-1.5 !px-3 !text-xs">Guardar</SaveButton>
                    </span>
                  </div>
                </form>
              ))}
              {shipping.length === 0 && <div className="text-xs text-thyme">No hay tipos de envío: el checkout no va a preguntar cómo lo reciben.</div>}
            </div>
            <form action={saveShipping} className="mt-4 pt-4 border-t border-champagne grid sm:grid-cols-[1fr_130px_120px_auto] gap-2 items-end">
              <div><label className="label">Nuevo tipo de envío</label><input name="name" required placeholder="Ej. Delivery Luque" className="input !py-1.5" /></div>
              <div><label className="label">Costo (Gs.)</label><input name="price" type="number" min={0} step={1000} defaultValue={0} className="input !py-1.5" /></div>
              <div>
                <label className="label">Tipo</label>
                <select name="kind" defaultValue="envio" className="input !py-1.5">
                  <option value="envio">Envío</option>
                  <option value="retiro">Retiro</option>
                </select>
              </div>
              <input type="hidden" name="sort_order" value={shipping.length + 1} />
              <SaveButton className="btn-primary !py-1.5 !px-4 !text-xs" resetOnDone doneText="✓ Agregado">Agregar</SaveButton>
            </form>
          </section>

          <section className="bg-cream border border-champagne rounded-xl p-5">
            <h2 className="font-serif text-xl text-ink mb-3">Turnos de entrega</h2>
            <div className="space-y-4">
              {orden.map((wd) => {
                const del = slots.filter((x) => x.weekday === wd);
                return (
                  <div key={wd}>
                    <div className="eyebrow mb-1.5">{DIAS[wd]}</div>
                    {del.length === 0 && <div className="text-xs text-thyme/70 mb-1">Sin entregas</div>}
                    <div className="space-y-2">
                      {del.map((x) => (
                        <form key={x.id} action={saveSlot} className={"flex flex-wrap items-end gap-2 " + (x.active ? "" : "opacity-60")}>
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="weekday" value={wd} />
                          <div><label className="label">Desde</label><input type="time" name="start_time" defaultValue={hm(x.start_time)} className="input !py-1.5 !w-28" /></div>
                          <div><label className="label">Hasta</label><input type="time" name="end_time" defaultValue={hm(x.end_time)} className="input !py-1.5 !w-28" /></div>
                          <div><label className="label">Cupo</label><input type="number" min={1} name="capacity" defaultValue={x.capacity} className="input !py-1.5 !w-20" /></div>
                          <label className="flex items-center gap-1.5 text-xs pb-2"><input type="checkbox" name="active" defaultChecked={x.active} /> Activo</label>
                          <SaveButton className="btn-outline !py-1.5 !px-3 !text-xs">Guardar</SaveButton>
                          <ConfirmButton action={deleteSlot.bind(null, x.id)} message={`¿Eliminar el turno del ${DIAS[wd]} ${hm(x.start_time)}–${hm(x.end_time)}?`} className="text-xs text-rose hover:underline pb-2">
                            Eliminar
                          </ConfirmButton>
                        </form>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <form action={saveSlot} className="flex flex-wrap items-end gap-2 mt-6 pt-4 border-t border-champagne">
              <div>
                <label className="label">Nuevo turno</label>
                <select name="weekday" className="input !py-1.5 !w-36" defaultValue="1">
                  {orden.map((wd) => <option key={wd} value={wd}>{DIAS[wd]}</option>)}
                </select>
              </div>
              <div><label className="label">Desde</label><input type="time" name="start_time" defaultValue="09:00" required className="input !py-1.5 !w-28" /></div>
              <div><label className="label">Hasta</label><input type="time" name="end_time" defaultValue="12:00" required className="input !py-1.5 !w-28" /></div>
              <div><label className="label">Cupo</label><input type="number" min={1} name="capacity" defaultValue={5} className="input !py-1.5 !w-20" /></div>
              <SaveButton className="btn-primary !py-1.5 !px-4 !text-xs" doneText="✓ Agregado">Agregar</SaveButton>
            </form>
            <p className="text-[11px] text-thyme mt-2">El cupo es cuántos pedidos entran en ese horario. Los pedidos cancelados liberan su lugar.</p>
          </section>

          <section className="bg-cream border border-champagne rounded-xl p-5">
            <h2 className="font-serif text-xl text-ink mb-3">Días sin entregas</h2>
            <form action={addClosedDay} className="flex flex-wrap items-end gap-2 mb-3">
              <div><label className="label">Fecha</label><input type="date" name="day" required className="input !py-1.5 !w-40" /></div>
              <div className="flex-1 min-w-[160px]"><label className="label">Motivo</label><input name="reason" placeholder="Feriado, inventario…" className="input !py-1.5" /></div>
              <SaveButton className="btn-outline !py-1.5 !px-4 !text-xs" resetOnDone doneText="✓ Agregado">Agregar</SaveButton>
            </form>
            <ul className="text-sm divide-y divide-champagne">
              {(closed || []).map((c: any) => (
                <li key={c.day} className="flex items-center justify-between py-1.5">
                  <span>
                    {new Date(c.day + "T12:00:00Z").toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                    {c.reason && <span className="text-thyme"> · {c.reason}</span>}
                  </span>
                  <ConfirmButton action={removeClosedDay.bind(null, c.day)} message="¿Volver a habilitar este día?" className="text-xs text-rose hover:underline">
                    Quitar
                  </ConfirmButton>
                </li>
              ))}
              {(closed || []).length === 0 && <li className="text-xs text-thyme py-1">No hay días bloqueados.</li>}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <form action={saveDeliverySettings} className="bg-cream border border-champagne rounded-xl p-5 space-y-3">
            <h2 className="font-serif text-xl text-ink">Reglas</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pickup_enabled" defaultChecked={settings.pickup_enabled ?? true} /> Ofrecer retiro en el local
            </label>
            <div>
              <label className="label">Días mínimos de anticipación</label>
              <input type="number" min={0} max={30} name="delivery_lead_days" defaultValue={settings.delivery_lead_days ?? 0} className="input" />
              <p className="text-[11px] text-thyme mt-1">0 = se puede pedir para hoy (turnos que empiecen en más de una hora).</p>
            </div>
            <div>
              <label className="label">Ofrecer turnos hasta (días)</label>
              <input type="number" min={1} max={60} name="delivery_days_ahead" defaultValue={settings.delivery_days_ahead ?? 14} className="input" />
            </div>
            <div>
              <label className="label">Métodos de pago</label>
              <textarea name="payment_methods" rows={4} defaultValue={(settings.payment_methods || []).join("\n")} className="input" />
              <p className="text-[11px] text-thyme mt-1">Uno por línea. Es lo que ofrecen el bot y el checkout.</p>
            </div>
            <SaveButton className="btn-primary !py-2 w-full">Guardar</SaveButton>
          </form>

          <div className="bg-cream border border-champagne rounded-xl p-5">
            <h2 className="font-serif text-xl text-ink mb-2">Lo que ve el cliente</h2>
            <p className="text-[11px] text-thyme mb-2">Turnos libres de los próximos 7 días.</p>
            <ul className="text-sm space-y-1">
              {proximos.slice(0, 12).map((x) => (
                <li key={x.date + x.start} className="flex justify-between">
                  <span>{new Date(x.date + "T12:00:00Z").toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" })} · {x.start}–{x.end}</span>
                  <span className="text-thyme text-xs">{x.remaining} libre{x.remaining === 1 ? "" : "s"}</span>
                </li>
              ))}
              {proximos.length === 0 && <li className="text-xs text-rose">No hay turnos libres: el bot va a pasar los pedidos a una persona.</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
