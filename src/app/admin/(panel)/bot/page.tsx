import { requireAdmin } from "@/lib/admin";
import type { BotIntent, StoreSettings } from "@/lib/types";
import ConfirmButton from "../ConfirmButton";
import { deleteIntent, saveIntent, saveSettings, setBotEnabled } from "./actions";
import SaveButton from "../SaveButton";

const ACTIONS: { v: BotIntent["action"]; label: string; help: string }[] = [
  { v: "respuesta", label: "Responder un texto", help: "Contesta con el texto de abajo." },
  { v: "productos", label: "Buscar / mostrar productos", help: "Busca el producto que nombró y muestra precio y stock." },
  { v: "pedido", label: "Tomar un pedido", help: "Guía: producto → cantidad → día → nombre → teléfono → confirmación." },
  { v: "horarios", label: "Mostrar horarios", help: "Contesta el texto de abajo + los horarios de Configuración." },
  { v: "humano", label: "Pasar a una persona", help: "Pausa el bot y avisa en Conversaciones." },
];

export default async function BotPage() {
  const { sb } = await requireAdmin();
  const [{ data: s }, { data: intents }] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("bot_intents").select("*").order("sort_order").order("name"),
  ]);
  const settings = (s || {}) as StoreSettings;
  const list = (intents || []) as BotIntent[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-3xl text-ink mb-1">Bot</h1>
          <p className="text-sm text-thyme">Respuestas, palabras clave y comportamiento del asistente del chat.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" target="_blank" className="text-xs text-thyme underline">Probar en la tienda ↗</a>
          <form action={setBotEnabled.bind(null, !settings.bot_enabled)}>
            <button className={settings.bot_enabled ? "btn-outline !py-2 !px-4" : "btn-primary !py-2 !px-4"}>
              {settings.bot_enabled ? "Apagar bot" : "Encender bot"}
            </button>
          </form>
        </div>
      </div>

      <div className={"rounded-xl px-4 py-3 mb-6 text-sm " + (settings.bot_enabled ? "bg-thyme/15 text-thyme" : "bg-blush/40 text-ink")}>
        {settings.bot_enabled
          ? "El bot está encendido y responde en el chat de la web."
          : "El bot está apagado: el chat muestra el mensaje de “fuera de servicio” y todo queda para el equipo."}
      </div>

      <form action={saveSettings} className="bg-cream border border-champagne rounded-xl p-5 grid md:grid-cols-2 gap-4 mb-10">
        <input type="hidden" name="_bools" value="bot_auto_confirm" />
        <h2 className="md:col-span-2 font-serif text-xl text-ink">Mensajes y comportamiento</h2>
        <div>
          <label className="label">Nombre del asistente</label>
          <input name="bot_name" defaultValue={settings.bot_name} className="input" />
        </div>
        <label className="flex items-start gap-2 text-sm md:mt-6">
          <input type="checkbox" name="bot_auto_confirm" defaultChecked={settings.bot_auto_confirm} className="mt-1" />
          <span>
            Confirmar automáticamente los pedidos del bot
            <span className="block text-[11px] text-thyme">Recomendado al principio: dejarlo apagado para que una persona confirme cada pedido.</span>
          </span>
        </label>
        <div className="md:col-span-2">
          <label className="label">Si el equipo deja de responder un chat, el bot vuelve a atender después de (minutos)</label>
          <input name="human_pause_minutes" type="number" min={0} max={10080} defaultValue={settings.human_pause_minutes ?? 120} className="input md:w-40" />
          <p className="text-[11px] text-thyme mt-1">
            Cuando alguien escribe desde el celular de la tienda o toma la conversación en el panel, el bot se calla en ese chat.
            Pasado este tiempo sin mensajes del equipo, vuelve a responder solo. 0 = nunca (hay que tocar “Devolver al bot”).
          </p>
        </div>
        <Field name="welcome_message" label="Saludo inicial" value={settings.welcome_message} />
        <Field name="fallback_message" label="Cuando no entiende" value={settings.fallback_message} />
        <Field name="handoff_message" label="Al pasar con una persona" value={settings.handoff_message} />
        <Field name="offline_message" label="Bot apagado" value={settings.offline_message} />
        <Field name="audio_message" label="Cuando recibe un audio" value={settings.audio_message} />
        <div className="md:col-span-2"><SaveButton className="btn-primary !py-2">Guardar mensajes</SaveButton></div>
      </form>

      <h2 className="font-serif text-2xl text-ink mb-1">Respuestas y palabras clave</h2>
      <p className="text-sm text-thyme mb-4">
        Cada respuesta se activa cuando el mensaje contiene alguna de sus palabras (tolera errores de tipeo).
        Si tiene “texto del botón”, aparece en el menú del chat.
      </p>

      <div className="space-y-3">
        {list.map((i) => <IntentForm key={i.id} i={i} />)}
      </div>

      <h3 className="font-serif text-xl text-ink mt-8 mb-3">Nueva respuesta</h3>
      <IntentForm />
    </>
  );
}

function Field({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea name={name} defaultValue={value || ""} rows={2} className="input" />
    </div>
  );
}

function IntentForm({ i }: { i?: BotIntent }) {
  return (
    <form action={saveIntent} className={"bg-cream border rounded-xl p-4 grid md:grid-cols-[1fr_1fr_200px] gap-3 " + (i && !i.active ? "border-bisque opacity-70" : "border-champagne")}>
      {i && <input type="hidden" name="id" value={i.id} />}
      <div>
        <label className="label">Nombre</label>
        <input name="name" defaultValue={i?.name} required className="input" placeholder="ej. Envíos" />
      </div>
      <div>
        <label className="label">Qué hace</label>
        <select name="action" defaultValue={i?.action || "respuesta"} className="input">
          {ACTIONS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_70px] gap-2">
        <div>
          <label className="label">Texto del botón</label>
          <input name="menu_label" defaultValue={i?.menu_label || ""} className="input" placeholder="(no aparece)" />
        </div>
        <div>
          <label className="label">Orden</label>
          <input name="sort_order" type="number" defaultValue={i?.sort_order ?? 50} className="input" />
        </div>
      </div>
      <div className="md:col-span-3">
        <label className="label">Palabras clave (separadas por coma)</label>
        <input name="keywords" defaultValue={(i?.keywords || []).join(", ")} className="input" placeholder="envio, delivery, mandan" />
      </div>
      <div className="md:col-span-3">
        <label className="label">Respuesta</label>
        <textarea name="response" defaultValue={i?.response || ""} rows={2} className="input" />
        <p className="text-[11px] text-thyme mt-1">{ACTIONS.find((a) => a.v === (i?.action || "respuesta"))?.help} Podés usar *negrita*.</p>
      </div>
      <div className="md:col-span-3 flex items-center gap-4">
        {i && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={i.active} /> Activa
          </label>
        )}
        {i && (
          <ConfirmButton action={deleteIntent.bind(null, i.id)} message={`¿Eliminar la respuesta "${i.name}"?`} className="text-xs text-rose hover:underline">
            Eliminar
          </ConfirmButton>
        )}
        <span className="ml-auto"><SaveButton className={(i ? "btn-outline" : "btn-primary") + " !py-1.5 !px-4 !text-xs"} resetOnDone={!i} doneText={i ? "✓ Guardado" : "✓ Creada"}>{i ? "Guardar" : "Crear respuesta"}</SaveButton></span>
      </div>
    </form>
  );
}
