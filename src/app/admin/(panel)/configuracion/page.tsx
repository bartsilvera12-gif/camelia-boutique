import { formatWaNumber } from "@/lib/format";
import { requireAdmin } from "@/lib/admin";
import type { StoreSettings } from "@/lib/types";
import { saveSettings, applyConnectedNumber, disconnectWhatsApp } from "../bot/actions";
import { bridgeQrPage, bridgeStatus } from "@/lib/wa";
import WaQr from "./WaQr";
import SaveButton from "../SaveButton";
import ConfirmButton from "../ConfirmButton";

function WaStatus({ status, qr }: { status: { connection: string; meNumber?: string | null } | null; qr: string | null }) {
  if (!status) {
    return (
      <div className="text-xs rounded-lg bg-ink/5 px-3 py-2 max-w-xs">
        Puente no configurado. Faltan <code>WA_BRIDGE_URL</code> y <code>WA_BRIDGE_SECRET</code> en Vercel.
      </div>
    );
  }
  const open = status.connection === "open";
  return (
    <div className="text-xs rounded-lg bg-champagne/60 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          <span className={open ? "text-thyme" : "text-rose"}>●</span>{" "}
          {open ? `Conectado${status.meNumber ? ` (${formatWaNumber(status.meNumber)})` : ""}` : status.connection === "qr" ? "Esperando escanear el QR" : `Estado: ${status.connection}`}
        </span>
        {open && (
          <ConfirmButton
            action={disconnectWhatsApp}
            message={"¿Desconectar este número de WhatsApp?\n\nEl bot deja de responder y no salen avisos de pedidos hasta que vincules un número de nuevo escaneando el QR."}
            className="rounded-full border border-rose/50 text-rose px-3 py-1 text-[11px] font-medium hover:bg-rose hover:text-cream transition disabled:opacity-50"
          >
            Desconectar número
          </ConfirmButton>
        )}
      </div>
      {!open && qr && <WaQr />}
    </div>
  );
}

export default async function ConfiguracionPage() {
  const { sb } = await requireAdmin();
  const { data } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  const s = (data || {}) as StoreSettings;
  const wa = await bridgeStatus();
  const qr = bridgeQrPage();
  // número vinculado al puente vs. el que usan los botones de la tienda
  const conectado = wa?.connection === "open" && wa.meNumber ? String(wa.meNumber).split(/[:@]/)[0].replace(/\D/g, "") : null;
  const tienda = String(s.whatsapp_number || "").replace(/\D/g, "").replace(/^0/, "595");
  const distinto = !!conectado && conectado !== tienda;

  return (
    <>
      <h1 className="font-serif text-3xl text-ink mb-1">Configuración</h1>
      <p className="text-sm text-thyme mb-6">Datos del negocio que usa el bot para responder, y a quién avisar de los pedidos.</p>

      {distinto && (
        <form action={applyConnectedNumber} className="max-w-3xl mb-6 rounded-xl border border-rose/40 bg-blush/30 p-4 flex flex-wrap items-center gap-3 text-sm">
          <p className="flex-1 min-w-[240px]">
            Los botones de WhatsApp de la tienda mandan al <b>{formatWaNumber(tienda)}</b>, pero el número conectado
            al bot es el <b>{formatWaNumber(conectado)}</b>. Los mensajes que lleguen al otro número no los atiende el bot.
          </p>
          <SaveButton className="btn-primary !py-2 !px-4 !text-xs" doneText="✓ Actualizado">
            Usar {formatWaNumber(conectado)}
          </SaveButton>
        </form>
      )}

      <form action={saveSettings} className="max-w-3xl space-y-6">
        <section className="bg-cream border border-champagne rounded-xl p-5 grid md:grid-cols-2 gap-4">
          <h2 className="md:col-span-2 font-serif text-xl text-ink">Negocio</h2>
          <div>
            <label className="label">Nombre</label>
            <input name="store_name" defaultValue={s.store_name} className="input" />
          </div>
          <div>
            <label className="label">WhatsApp de la tienda</label>
            <input name="whatsapp_number" defaultValue={s.whatsapp_number} className="input" placeholder="0992 218 503" />
            <p className="text-[11px] text-thyme mt-1">
              A este número mandan los botones de WhatsApp de la web y aparece en el pie de página. Tiene que ser el vinculado al bot.
            </p>
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" defaultValue={s.email || ""} className="input" />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input name="address" defaultValue={s.address || ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Horarios de atención</label>
            <textarea name="hours" rows={2} defaultValue={s.hours} className="input" />
            <p className="text-[11px] text-thyme mt-1">El bot responde esto cuando preguntan por horarios.</p>
          </div>
        </section>

        <section className="bg-cream border border-champagne rounded-xl p-5 grid md:grid-cols-2 gap-4">
          <input type="hidden" name="_bools" value="wa_bot_enabled,wa_notify_orders" />
          <div className="md:col-span-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-ink">WhatsApp</h2>
              <p className="text-xs text-thyme mt-1 max-w-xl">
                El número de la tienda se vincula por QR. El bot atiende a quien le escriba a ese número y
                los avisos de pedidos nuevos salen desde ahí hacia el responsable.
              </p>
            </div>
            <WaStatus status={wa} qr={qr} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="wa_bot_enabled" defaultChecked={s.wa_bot_enabled ?? true} className="mt-1" />
            <span>
              El bot responde por WhatsApp
              <span className="block text-[11px] text-thyme">Apagado: los mensajes igual quedan en Conversaciones y se contestan desde el panel o el celular.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="wa_notify_orders" defaultChecked={s.wa_notify_orders ?? true} className="mt-1" />
            <span>
              Avisar cada pedido nuevo por WhatsApp
              <span className="block text-[11px] text-thyme">Web, bot de la web y bot de WhatsApp. Incluye cuántos pendientes hay.</span>
            </span>
          </label>
          <div>
            <label className="label">Responsable</label>
            <input name="notify_name" defaultValue={s.notify_name || ""} className="input" />
          </div>
          <div>
            <label className="label">WhatsApp del responsable</label>
            <input name="notify_whatsapp" defaultValue={s.notify_whatsapp || ""} className="input" placeholder="0981 123 456" />
            <p className="text-[11px] text-thyme mt-1">Tiene que ser un número distinto al de la tienda.</p>
          </div>
        </section>

        <SaveButton className="btn-primary">Guardar</SaveButton>
      </form>
    </>
  );
}
