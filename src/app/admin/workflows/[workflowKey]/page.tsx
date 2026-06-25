import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminWorkflowPage } from "@/components/admin-moderation/admin-workflow-page";
import { AppShell } from "@/components/platform/app-shell";
import { getAdminPortalView } from "@/modules/admin-moderation/admin-moderation.service";
import { getAdminWorkflowCategory } from "@/modules/admin-moderation/admin-workflows";

export default async function AdminWorkflowRoute({ params }: { params: { workflowKey: string } }) {
  const session = await auth();
  const callbackUrl = `/admin/workflows/${params.workflowKey}`;

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const adminPortal = await getAdminPortalView(session.user.id);

  if (!adminPortal.canAccess) {
    redirect("/");
  }

  const category = getAdminWorkflowCategory(adminPortal.openFeedbackTicketCount, params.workflowKey);

  if (!category) {
    notFound();
  }

  return (
    <AppShell>
      <AdminWorkflowPage category={category} />
    </AppShell>
  );
}
