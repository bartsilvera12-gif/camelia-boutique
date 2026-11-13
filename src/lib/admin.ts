import { redirect } from "next/navigation";
import { authClient } from "./supabase/server";

/** Cliente con sesión de admin. Redirige al login si no hay sesión válida. */
export async function requireAdmin() {
  const sb = authClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: ok } = await sb.rpc("is_admin");
  if (!ok) redirect("/admin/login");
  return { sb, user };
}

/** Para server actions: devuelve el cliente o lanza si no es admin. */
export async function adminAction() {
  const sb = authClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sesión vencida. Volvé a ingresar.");
  const { data: ok } = await sb.rpc("is_admin");
  if (!ok) throw new Error("No autorizado");
  return { sb, user };
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export { STATUS_STYLE, SOURCE_LABEL } from "./admin-styles";
