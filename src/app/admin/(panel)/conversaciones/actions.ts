"use server";
import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/admin";
import type { ConversationStatus } from "@/lib/types";
import { sendWhatsApp } from "@/lib/wa";

export async function replyConversation(id: string, body: string) {
  try {
    const { sb, user } = await adminAction();
    const text = body.trim().slice(0, 4000);
    if (!text) return { ok: false, error: "Mensaje vacío" };
    const { data: conv } = await sb.from("conversations").select("channel, wa_id").eq("id", id).maybeSingle();
    const { data: msg, error } = await sb
      .from("messages")
      .insert({ conversation_id: id, sender: "agente", body: text })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    // Chats de WhatsApp: la respuesta sale por el puente. Se guarda antes de enviar para
    // que el eco del envío se reconozca; si no sale, se borra y se avisa.
    if (conv?.channel === "whatsapp" && conv.wa_id) {
      const r = await sendWhatsApp(conv.wa_id, text);
      if (!r.ok) {
        await sb.from("messages").delete().eq("id", msg.id);
        return { ok: false, error: `No salió por WhatsApp: ${r.error}` };
      }
    }
    await sb.from("conversations").update({
      status: "humano",
      needs_human: false,
      taken_by: user.email,
      unread: 0,
      last_message: text.slice(0, 200),
      last_message_at: new Date().toISOString(),
    }).eq("id", id);
    revalidatePath("/admin/conversaciones");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function setConversationStatus(id: string, status: ConversationStatus) {
  const { sb, user } = await adminAction();
  const patch: Record<string, unknown> = { status };
  if (status === "humano") { patch.taken_by = user.email; patch.needs_human = false; }
  if (status === "bot") { patch.taken_by = null; patch.needs_human = false; patch.state = {}; }
  if (status === "cerrada") { patch.needs_human = false; patch.state = {}; }
  const { error } = await sb.from("conversations").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${id}`);
}

export async function markRead(id: string) {
  const { sb } = await adminAction();
  await sb.from("conversations").update({ unread: 0 }).eq("id", id);
}

export async function saveContactFromConversation(id: string, fd: FormData) {
  const { sb } = await adminAction();
  const name = String(fd.get("name") || "").trim();
  const phone = String(fd.get("phone") || "").trim();
  if (!name || !phone) throw new Error("Nombre y teléfono son obligatorios");
  const { data: existing } = await sb.from("customers").select("id").eq("phone", phone).limit(1).maybeSingle();
  let customerId = existing?.id as string | undefined;
  if (customerId) {
    await sb.from("customers").update({ name, email: String(fd.get("email") || "") || null }).eq("id", customerId);
  } else {
    const { data, error } = await sb.from("customers")
      .insert({ name, phone, email: String(fd.get("email") || "") || null, source: "bot" })
      .select("id").single();
    if (error) throw new Error(error.message);
    customerId = data.id;
  }
  await sb.from("conversations").update({ customer_id: customerId, visitor_name: name, visitor_phone: phone }).eq("id", id);
  revalidatePath(`/admin/conversaciones/${id}`);
  revalidatePath("/admin/contactos");
}
