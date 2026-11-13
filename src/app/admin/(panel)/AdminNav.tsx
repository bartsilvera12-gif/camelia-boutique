"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bot, CalendarDays, ExternalLink, LayoutDashboard, LogOut, Menu, MessageCircle, Settings,
  Shirt, ShoppingBag, Tags, TicketPercent, Truck, Users, X, type LucideIcon,
} from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "orders" | "chats" };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Ventas",
    items: [
      { href: "/admin", label: "Inicio", icon: LayoutDashboard },
      { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, badge: "orders" },
      { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    title: "Atención",
    items: [
      { href: "/admin/conversaciones", label: "Conversaciones", icon: MessageCircle, badge: "chats" },
      { href: "/admin/contactos", label: "Contactos", icon: Users },
      { href: "/admin/bot", label: "Bot", icon: Bot },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/admin/productos", label: "Productos", icon: Shirt },
      { href: "/admin/categorias", label: "Categorías", icon: Tags },
      { href: "/admin/cupones", label: "Cupones", icon: TicketPercent },
    ],
  },
  {
    title: "Ajustes",
    items: [
      { href: "/admin/entregas", label: "Entregas y pagos", icon: Truck },
      { href: "/admin/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

type Counts = { orders: number; chats: number };

export default function AdminNav({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({ orders: 0, chats: 0 });
  const lastOrder = useRef<string | null>(null);

  // Avisos en vivo: pedidos pendientes y conversaciones que piden una persona
  // (se recalcula también al cambiar de pantalla, así se apaga apenas abrís el chat)
  useEffect(() => {
    const sb = browserClient();
    let alive = true;
    async function tick() {
      const [o, c, latest] = await Promise.all([
        sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
        // solo las que piden una persona y tienen mensajes sin ver: al abrir el chat se apaga
        sb.from("conversations").select("id", { count: "exact", head: true }).eq("needs_human", true).neq("status", "cerrada").gt("unread", 0),
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
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  useEffect(() => setOpen(false), [path]);

  const pending = counts.orders + counts.chats;
  const initial = (email || "?").slice(0, 1).toUpperCase();

  const panel = (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4">
        <div className="font-serif text-[28px] leading-none text-champagne">
          Camélia<span className="text-blush">.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-champagne/60 mt-1.5">Panel de la tienda</div>
      </div>

      <nav className="nav-scroll flex-1 overflow-y-auto px-3 pb-3 space-y-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.24em] text-champagne/45">{g.title}</div>
            <div className="space-y-0.5">
              {g.items.map((l) => {
                const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
                const n = l.badge ? counts[l.badge] : 0;
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={
                      "group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13.5px] transition-colors " +
                      (active
                        ? "bg-champagne text-ink shadow-sm"
                        : "text-champagne/80 hover:bg-white/10 hover:text-champagne")
                    }
                  >
                    <Icon size={17} strokeWidth={1.7} className={active ? "text-rose" : "text-champagne/60 group-hover:text-champagne"} />
                    <span className="flex-1">{l.label}</span>
                    {n > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose text-cream text-[10px] font-semibold flex items-center justify-center">
                        {n > 99 ? "99+" : n}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-2 space-y-0.5">
        <a
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-champagne/75 hover:bg-white/10 hover:text-champagne"
        >
          <ExternalLink size={16} strokeWidth={1.7} /> Ver tienda
        </a>
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-blush text-ink font-serif text-base flex items-center justify-center shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-champagne truncate">{email}</div>
            <div className="text-[10px] text-champagne/50">Administración</div>
          </div>
          <form action={logout}>
            <button title="Cerrar sesión" aria-label="Cerrar sesión" className="p-1.5 rounded-lg text-champagne/60 hover:text-champagne hover:bg-white/10">
              <LogOut size={16} strokeWidth={1.7} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* barra superior en celular */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-thyme text-champagne">
        <div className="font-serif text-xl">
          Camélia<span className="text-blush">.</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="relative p-2 rounded-lg hover:bg-white/10"
        >
          <Menu size={20} />
          {pending > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blush" />}
        </button>
      </div>

      {/* menú lateral en escritorio */}
      <aside className="hidden md:block sticky top-0 h-screen bg-thyme">{panel}</aside>

      {/* menú desplegable en celular */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[270px] bg-thyme shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="absolute top-5 right-3 p-1.5 rounded-lg text-champagne/70 hover:bg-white/10"
            >
              <X size={18} />
            </button>
            {panel}
          </aside>
        </div>
      )}
    </>
  );
}

function notify(o: { customer_name: string; source: string }) {
  try {
    if (typeof Notification === "undefined") return;
    const show = () =>
      new Notification("Nuevo pedido en Camélia", {
        body: `${o.customer_name}${o.source === "bot" ? " · tomado por el bot" : o.source === "whatsapp" ? " · por WhatsApp" : ""}`,
      });
    if (Notification.permission === "granted") show();
    else if (Notification.permission !== "denied") Notification.requestPermission().then((p) => p === "granted" && show());
  } catch {}
}
