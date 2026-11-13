"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pedidos", label: "Pedidos", badge: "orders" },
  { href: "/admin/agenda", label: "Agenda" },
  { href: "/admin/conversaciones", label: "Conversaciones", badge: "chats" },
  { href: "/admin/contactos", label: "Contactos" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/bot", label: "Bot" },
  { href: "/admin/configuracion", label: "Configuración" },
] as const;

type Counts = { orders: number; chats: number };

export default function AdminNav({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({ orders: 0, chats: 0 });
  const lastOrder = useRef<string | null>(null);

  // Avisos en vivo: pedidos pendientes y conversaciones que piden una persona
  useEffect(() => {
    const sb = browserClient();
    let alive = true;
    async function tick() {
      const [o, c, latest] = await Promise.all([
        sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
        sb.from("conversations").select("id", { count: "exact", head: true }).eq("needs_human", true).neq("status", "cerrada"),
        sb.from("orders").select("id, customer_name, source").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!alive) return;
      setCounts({ orders: o.count || 0, chats: c.count || 0 });
      const top = latest.data as { id: string; customer_name: string; source: string } | null;
      if (top) {
        if (lastOrder.current && lastOrder.current !== top.id) notify(top);
        lastOrder.current = top.id;
      }
    }
    tick();
    const t = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-champagne bg-champagne/40">
        <div className="font-serif text-xl text-ink">Camélia<span className="text-rose">.</span> <span className="text-xs text-thyme">admin</span></div>
        <button onClick={() => setOpen((o) => !o)} className="text-sm text-ink border border-bisque rounded-full px-3 py-1">
          Menú {counts.orders + counts.chats > 0 && <span className="ml-1 text-rose">●</span>}
        </button>
      </div>
      <aside
        className={
          (open ? "block" : "hidden") +
          " md:block border-r border-champagne bg-champagne/40 p-5 md:min-h-screen md:sticky md:top-0 md:h-screen md:overflow-y-auto"
        }
      >
        <div className="hidden md:block font-serif text-2xl text-ink mb-1">Camélia<span className="text-rose">.</span></div>
        <div className="hidden md:block text-[11px] text-thyme mb-6 truncate">{email}</div>
        <nav className="text-sm flex flex-col gap-0.5">
          {LINKS.map((l) => {
            const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
            const n = "badge" in l ? counts[l.badge] : 0;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "flex items-center justify-between rounded-lg px-3 py-2 " +
                  (active ? "bg-cream text-ink shadow-sm" : "text-ink/80 hover:bg-cream/60")
                }
              >
                {l.label}
                {n > 0 && (
                  <span className="text-[10px] min-w-5 text-center rounded-full bg-rose text-cream px-1.5 py-0.5">{n}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 flex flex-col gap-2 text-xs">
          <a href="/" target="_blank" className="text-thyme hover:text-rose">Ver tienda ↗</a>
          <form action={logout}>
            <button className="text-thyme hover:text-rose">Cerrar sesión →</button>
          </form>
        </div>
      </aside>
    </>
  );
}

function notify(o: { customer_name: string; source: string }) {
  try {
    if (typeof Notification === "undefined") return;
    const show = () =>
      new Notification("Nuevo pedido en Camélia", {
        body: `${o.customer_name}${o.source === "bot" ? " · tomado por el bot" : ""}`,
      });
    if (Notification.permission === "granted") show();
    else if (Notification.permission !== "denied") Notification.requestPermission().then((p) => p === "granted" && show());
  } catch {}
}
