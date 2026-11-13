"use client";
import { useState, useTransition } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { STATUS_STYLE } from "@/lib/admin-styles";
import { updateOrderDate, updateOrderStatus } from "./actions";

export function StatusSelect({ id, status }: { id: string; status: OrderStatus }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as OrderStatus;
          const prev = value;
          setValue(next);
          setErr(null);
          start(async () => {
            const r = await updateOrderStatus(id, next);
            if (!r.ok) {
              setValue(prev);
              setErr(r.error || "No se pudo cambiar");
            }
          });
        }}
        className={"rounded-full border-0 text-xs px-3 py-1 cursor-pointer " + STATUS_STYLE[value]}
      >
        {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {err && <div className="text-[11px] text-rose mt-1 max-w-[220px]">{err}</div>}
    </div>
  );
}

export function DateInput({ id, date }: { id: string; date?: string | null }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      defaultValue={date || ""}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => { await updateOrderDate(id, v); });
      }}
      className="input !py-1 !px-2 !text-xs !w-36"
    />
  );
}
