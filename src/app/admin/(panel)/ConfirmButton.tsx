"use client";
import { useTransition } from "react";

/** Botón que ejecuta una server action después de confirmar. Sirve dentro de otro <form>. */
export default function ConfirmButton({
  action,
  message,
  className,
  children,
}: {
  action: () => Promise<unknown>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (!confirm(message)) return;
        start(async () => {
          try {
            await action();
          } catch (e: any) {
            alert(e?.message || "No se pudo completar la acción");
          }
        });
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
