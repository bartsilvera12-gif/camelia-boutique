import { requireAdmin } from "@/lib/admin";
import AdminNav from "./AdminNav";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr] bg-[#FBF7F1]">
      <AdminNav email={user.email || ""} logout={logoutAction} />
      <main className="min-w-0 px-4 py-5 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
