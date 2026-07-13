import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminHatManualClient } from "@/components/admin-hat/admin-hat-manual-client";
import { AppShell } from "@/components/platform/app-shell";
import { buildAdminHatManual } from "@/modules/admin-hat/admin-hat-content";
import { getAdminPortalView } from "@/modules/admin-moderation/admin-moderation.service";
import { buildWorkflowCategories } from "@/modules/admin-moderation/admin-workflows";

export default async function AdminHatPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/admin/hat");
  }

  const adminPortal = await getAdminPortalView(session.user.id);

  if (!adminPortal.canAccess) {
    redirect("/");
  }

  const categories = buildWorkflowCategories(adminPortal.openFeedbackTicketCount);
  const manual = buildAdminHatManual(categories);

  return (
    <AppShell>
      <AdminHatManualClient manual={manual} />
    </AppShell>
  );
}
