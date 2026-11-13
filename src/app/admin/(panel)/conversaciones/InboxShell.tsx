"use client";
import { usePathname } from "next/navigation";

/** Bandeja: lista a la izquierda y chat a la derecha. En celular se ve una cosa por vez. */
export default function InboxShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const inChat = path !== "/admin/conversaciones";
  return (
    <div className="-mx-4 -my-5 md:-mx-8 md:-my-7 h-[calc(100dvh-3.5rem)] md:h-screen md:grid md:grid-cols-[360px_1fr] bg-cream">
      <aside className={(inChat ? "hidden md:flex" : "flex") + " flex-col h-full min-h-0 border-r border-champagne bg-cream"}>
        {list}
      </aside>
      <section className={(inChat ? "flex" : "hidden md:flex") + " flex-col h-full min-h-0 min-w-0"}>{children}</section>
    </div>
  );
}
