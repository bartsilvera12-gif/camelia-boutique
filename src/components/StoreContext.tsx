"use client";
import { createContext, useContext } from "react";

export type StoreInfo = { whatsappNumber: string | null };

const Ctx = createContext<StoreInfo>({ whatsappNumber: null });

export function StoreProvider({ value, children }: { value: StoreInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  return useContext(Ctx);
}
