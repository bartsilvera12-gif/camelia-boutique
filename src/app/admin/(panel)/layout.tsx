import { requireAdmin } from "@/lib/admin";
import AdminNav from "./AdminNav";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr] bg-[#FFFDFA]">
      <AdminNav email={user.email || ""} logout={logoutAction} />
      <div className="p-4 md:p-8 min-w-0">{children}</div>
    </div>
  );
}
