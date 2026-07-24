import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { AdminDiagnosticsView } from "@/components/admin-moderation/admin-diagnostics-view";
import { getAdminPortalView } from "@/modules/admin-moderation/admin-moderation.service";

export default async function AdminDiagnosticsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/admin/diagnostics");
  }

  const adminPortal = await getAdminPortalView(session.user.id);

  if (!adminPortal.canAccess) {
    redirect("/");
  }

  return (
    <AppShell>
      <AdminDiagnosticsView portal={adminPortal} />
    </AppShell>
  );
}
