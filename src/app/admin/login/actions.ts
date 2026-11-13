"use server";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Completá email y contraseña." };

  const sb = authClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email o contraseña incorrectos." };

  const { data: ok } = await sb.rpc("is_admin");
  if (!ok) {
    await sb.auth.signOut();
    return { error: "Este usuario no tiene acceso al panel de Camélia." };
  }
  redirect("/admin");
}

export async function logoutAction() {
  const sb = authClient();
  await sb.auth.signOut();
  redirect("/admin/login");
}
