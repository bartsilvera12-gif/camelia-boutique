"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type QrState = { connection: string; svg?: string | null; number?: string | null; error?: string };

/** Muestra el QR del puente dentro del panel y lo refresca solo (WhatsApp lo rota cada ~20 s). */
export default function WaQr() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<QrState | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function tick() {
      try {
        const r = await fetch("/api/admin/wa-qr", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        setSt(j.ok ? j : { connection: "error", error: j.error });
        if (j.connection === "open") router.refresh();
      } catch {
        if (alive) setSt({ connection: "error", error: "No se pudo consultar el puente" });
      }
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="underline text-thyme">
        Mostrar QR para vincular
      </button>
    );
  }

  return (
    <div className="mt-2 bg-white rounded-lg p-3 text-center w-[300px]">
      {st === null && <p className="text-xs text-thyme py-10">Pidiendo el QR al puente…</p>}
      {st?.connection === "open" && (
        <p className="text-sm text-thyme py-6">✓ WhatsApp vinculado{st.number ? ` (${st.number})` : ""}.</p>
      )}
      {st?.svg && st.connection !== "open" && (
        <>
          {/* SVG generado en el servidor a partir del QR del puente */}
          <div className="mx-auto w-[280px]" dangerouslySetInnerHTML={{ __html: st.svg }} />
          <p className="text-[11px] text-ink mt-2">
            En el celular de la tienda: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
          </p>
          <p className="text-[10px] text-thyme mt-1">Se actualiza solo cada pocos segundos.</p>
        </>
      )}
      {st && !st.svg && st.connection !== "open" && (
        <p className="text-xs text-thyme py-8">
          {st.error || `Esperando el código del puente (estado: ${st.connection})…`}
        </p>
      )}
      <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-thyme underline mt-2">
        Ocultar
      </button>
    </div>
  );
}
