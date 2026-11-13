"use client";
import { useState, useTransition } from "react";
import { quickUpdateProduct } from "./actions";

export default function QuickToggle({ id, field, value }: { id: string; field: "active" | "featured"; value: boolean }) {
  const [on, setOn] = useState(value);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const r = await quickUpdateProduct(id, { [field]: next });
          if (!r.ok) setOn(!next);
        });
      }}
      className={
        "relative w-10 h-5 rounded-full transition " + (on ? "bg-thyme" : "bg-bisque/70") + (pending ? " opacity-60" : "")
      }
      aria-pressed={on}
      aria-label={field === "active" ? "Visible en la tienda" : "Destacado"}
    >
      <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-cream transition-all " + (on ? "left-5" : "left-0.5")} />
    </button>
  );
}
