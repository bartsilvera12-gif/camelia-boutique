"use client";
import { useEffect } from "react";

/**
 * Si una acción del panel falla (por ejemplo al guardar), se muestra esto dentro
 * del panel en vez de la pantalla blanca de "Application error".
 */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-xl bg-cream border border-rose/40 rounded-xl p-6">
      <h1 className="font-serif text-2xl text-ink mb-2">No se pudo completar la acción</h1>
      <p className="text-sm text-ink/80 mb-3">
        Los cambios no se guardaron. Probá de nuevo; si sigue pasando, revisá que el SQL de
        <code className="mx-1">cameliaboutique</code>esté ejecutado completo en Supabase.
      </p>
      {error.digest && <p className="text-[11px] text-thyme mb-4">Código: {error.digest}</p>}
      <div className="flex gap-3">
        <button onClick={() => reset()} className="btn-primary !py-2 !px-4">Reintentar</button>
        <a href="/admin" className="btn-outline !py-2 !px-4">Ir al inicio del panel</a>
      </div>
    </div>
  );
}
