// Archivos que manda el cliente por WhatsApp. El puente los sube aparte (multipart),
// después de avisar el mensaje en /api/whatsapp/inbound.
// Las fotos se guardan en el bucket privado "cameliaboutique-chat" (se ven en el panel)
// y, si el bot está atendiendo, se buscan en el catálogo para responder qué producto es.
import { NextResponse } from "next/server";
import sharp from "sharp";
import { publicClient } from "@/lib/supabase/public";
import { matchProducts } from "@/lib/bot/image-match";
import { replyOnWhatsApp } from "@/lib/bot/wa-reply";
import { BRIDGE_SECRET } from "@/lib/wa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAT_BUCKET = "cameliaboutique-chat";
const MAX_BYTES = 4 * 1024 * 1024; // límite del cuerpo en Vercel

const ok = (extra: object = {}) => NextResponse.json({ ok: true, ...extra });
// el puente reintenta todo lo que no sea 2xx, 401 o 413
const retry = (error: string) => NextResponse.json({ ok: false, error }, { status: 503 });

export async function POST(req: Request) {
  if (!BRIDGE_SECRET || req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = publicClient();
  if (!sb) return retry("supabase");

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "payload" }, { status: 400 });
  const waMessageId = String(form.get("waMessageId") || "");
  const tipo = String(form.get("tipo") || "");
  const file = form.get("file");
  if (tipo !== "image" || !waMessageId || !(file instanceof Blob)) return ok({ ignored: tipo || "sin archivo" });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "muy grande" }, { status: 413 });

  // se guarda siempre como JPG de hasta 1600 px: pesa poco y cualquier navegador lo muestra
  let raw: Buffer;
  let jpg: Buffer;
  try {
    raw = Buffer.from(await file.arrayBuffer());
    jpg = await sharp(raw, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return ok({ ignored: "imagen ilegible" });
  }

  const { data: b, error } = await sb.rpc("wa_media_begin", {
    p_secret: BRIDGE_SECRET,
    p_wa_message_id: waMessageId,
    p_ext: "jpg",
  });
  if (error) return retry(error.message);
  const c = b as any;
  if (!c?.ok) {
    return c?.error === "unauthorized"
      ? NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
      : ok({ error: c?.error });
  }
  // mensajes que no guardamos (los que manda la tienda) o archivo ya procesado
  if (!c.found) return ok({ ignored: "sin mensaje" });
  if (c.done) return ok({ duplicate: true });

  const up = await sb.storage.from(CHAT_BUCKET).upload(c.path, jpg, { contentType: "image/jpeg", upsert: false });
  if (up.error && !/exist|duplicate/i.test(up.error.message)) return retry(up.error.message);
  const { error: e2 } = await sb.rpc("wa_media_done", { p_secret: BRIDGE_SECRET, p_message: c.message_id, p_path: c.path });
  if (e2) return retry(e2.message);

  // solo contesta el bot si está atendiendo y la foto sigue siendo lo último del chat
  if (c.status !== "bot" || !c.bot_enabled || !c.is_last || !c.wa_id) return ok({ stored: true });

  const base = new URL(req.url).origin;
  const r = await replyOnWhatsApp(sb, c, c.wa_id, {
    text: "",
    kind: "imagen",
    image: async (products) => {
      try {
        const m = await matchProducts(jpg, products, base);
        return { sure: m.sure.map((x) => x.product.id), maybe: m.maybe.map((x) => x.product.id) };
      } catch {
        return { sure: [], maybe: [] };
      }
    },
  });
  return ok(r.ok ? { stored: true } : { stored: true, sendError: r.error });
}
