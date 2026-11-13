import type { Conversation } from "@/lib/types";

export default function StatusPill({ c }: { c: Pick<Conversation, "status" | "needs_human" | "has_audio" | "channel"> }) {
  return (
    <>
      {c.needs_human && c.status !== "cerrada" && <span className="text-[10px] uppercase tracking-widest bg-rose text-cream rounded px-1.5 py-0.5">Pide persona</span>}
      {c.status === "humano" && <span className="text-[10px] uppercase tracking-widest bg-blush text-ink rounded px-1.5 py-0.5">Equipo</span>}
      {c.status === "bot" && <span className="text-[10px] uppercase tracking-widest bg-thyme/15 text-thyme rounded px-1.5 py-0.5">Bot</span>}
      {c.status === "cerrada" && <span className="text-[10px] uppercase tracking-widest bg-ink/10 text-ink/60 rounded px-1.5 py-0.5">Cerrada</span>}
      {c.has_audio && <span className="text-[10px] uppercase tracking-widest bg-bisque text-ink rounded px-1.5 py-0.5">Audio</span>}
      {c.channel === "whatsapp" && <span className="text-[10px] uppercase tracking-widest bg-[#25D366] text-white rounded px-1.5 py-0.5">WhatsApp</span>}
    </>
  );
}
