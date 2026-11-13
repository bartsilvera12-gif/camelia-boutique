// El puente también avisa estados de entrega (/status) y equivalencias de teléfonos
// (/inbound/telefonos). Camélia no los usa: se aceptan (las fotos van a /inbound/media)
// con 200 para que el puente no reintente.
import { NextResponse } from "next/server";
import { BRIDGE_SECRET } from "@/lib/wa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!BRIDGE_SECRET || req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ignored: true });
}
