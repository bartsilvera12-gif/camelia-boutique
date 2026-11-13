// QR para vincular el WhatsApp de la tienda, dibujado acá: así no hace falta
// abrir la página del puente (que desde algunas redes no resuelve).
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { adminAction } from "@/lib/admin";
import { bridgeQr, bridgeStatus } from "@/lib/wa";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await adminAction();
  } catch {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const q = await bridgeQr();
  if (!q) return NextResponse.json({ ok: false, error: "Puente no configurado" }, { status: 503 });

  if (q.connection === "open") {
    const s = await bridgeStatus();
    return NextResponse.json({ ok: true, connection: "open", number: s?.meNumber ?? null });
  }
  if (!q.qr) return NextResponse.json({ ok: true, connection: q.connection, svg: null });

  const svg = await QRCode.toString(q.qr, { type: "svg", margin: 2, width: 280, errorCorrectionLevel: "L" });
  return NextResponse.json({ ok: true, connection: q.connection, svg });
}
