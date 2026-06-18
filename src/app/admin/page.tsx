import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminPortal } from "@/components/admin-moderation/admin-portal";
import { AppShell } from "@/components/platform/app-shell";
import { getAdminPortalView } from "@/modules/admin-moderation/admin-moderation.service";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/admin");
  }

  const adminPortal = await getAdminPortalView(session.user.id);

  if (!adminPortal.canAccess) {
    redirect("/");
  }

  return (
    <AppShell>
      <AdminPortal portal={adminPortal} />
    </AppShell>
  );
}
