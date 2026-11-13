// Piezas visuales compartidas de la bandeja (sirven en server y client components).

const AVATAR_TONES = [
  "bg-blush text-ink",
  "bg-bisque text-ink",
  "bg-thyme/25 text-thyme",
  "bg-champagne text-ink",
  "bg-rose/25 text-rose",
];

export function Avatar({ name, size = 40, channel }: { name?: string | null; size?: number; channel?: string }) {
  const label = (name || "?").trim();
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={"w-full h-full rounded-full flex items-center justify-center font-serif " + AVATAR_TONES[h % AVATAR_TONES.length]}
        style={{ fontSize: size * 0.4 }}
      >
        {initials || "?"}
      </div>
      {channel && (
        <span
          className={
            "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-cream flex items-center justify-center " +
            (channel === "whatsapp" ? "bg-[#25D366]" : "bg-thyme")
          }
          style={{ width: size * 0.42, height: size * 0.42 }}
          title={channel === "whatsapp" ? "WhatsApp" : "Chat de la web"}
        >
          {channel === "whatsapp" ? <WhatsAppIcon size={size * 0.24} color="#fff" /> : <GlobeIcon size={size * 0.24} />}
        </span>
      )}
    </div>
  );
}

export function WhatsAppIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Zm5.7 14.3c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .1-1.6-.1-2.3-.7-3.8-3-3.9-3.1-.1-.1-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.1.1.3 0 .5 0 .1-.1.3-.3.5s-.4.4-.5.6c-.2.2-.4.4-.2.7.2.4.9 1.4 1.9 2.3 1.3 1.1 2.3 1.4 2.7 1.6.4.1.6.1.8-.1s.9-1 1.1-1.3c.2-.3.4-.3.7-.2s1.8.9 2.1 1c.3.2.5.2.6.3.1.2.1.7-.1 1.3Z" />
    </svg>
  );
}

function GlobeIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </svg>
  );
}

const TZ = "America/Asuncion";

/** "14:32", "Ayer", "lun", "12/11" según cuán viejo es. */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  const today = day(new Date());
  const yest = day(new Date(Date.now() - 86400000));
  const that = day(d);
  if (that === today) return d.toLocaleTimeString("es-PY", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (that === yest) return "Ayer";
  if (Date.now() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("es-PY", { timeZone: TZ, weekday: "short" });
  return d.toLocaleDateString("es-PY", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

/** Separador de día dentro del chat: "Hoy", "Ayer" o "jueves 12 de noviembre". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  if (day(d) === day(new Date())) return "Hoy";
  if (day(d) === day(new Date(Date.now() - 86400000))) return "Ayer";
  return d.toLocaleDateString("es-PY", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function prettyPhone(p?: string | null): string {
  const d = String(p || "").replace(/\D/g, "");
  const m = d.match(/^595(\d{3})(\d{3})(\d{3})$/);
  if (m) return `+595 ${m[1]} ${m[2]} ${m[3]}`;
  return p || "";
}
