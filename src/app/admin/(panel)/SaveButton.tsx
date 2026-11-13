"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Botón de envío para los formularios del panel: muestra "Guardando…" mientras
 * se guarda y "✓ Guardado" un par de segundos al terminar.
 * Si la acción falla, el panel muestra su pantalla de error.
 */
export default function SaveButton({
  children,
  className = "btn-primary",
  pendingText = "Guardando…",
  doneText = "✓ Guardado",
  resetOnDone = false,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  doneText?: string;
  resetOnDone?: boolean; // vaciar el formulario al terminar (para los de "Crear" / "Agregar")
}) {
  const { pending } = useFormStatus();
  const [done, setDone] = useState(false);
  const wasPending = useRef(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setDone(false);
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    setDone(true);
    if (resetOnDone) ref.current?.form?.reset();
    const t = setTimeout(() => setDone(false), 2200);
    return () => clearTimeout(t);
  }, [pending, resetOnDone]);

  return (
    <button
      ref={ref}
      type="submit"
      disabled={pending}
      aria-live="polite"
      className={className + " transition disabled:opacity-60 disabled:cursor-wait" + (done ? " !bg-thyme !text-champagne !border-thyme" : "")}
    >
      {pending ? pendingText : done ? doneText : children}
    </button>
  );
}
