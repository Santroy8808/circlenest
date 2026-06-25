import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminWorkflowGroupPage } from "@/components/admin-moderation/admin-workflow-group-page";
import { AppShell } from "@/components/platform/app-shell";
import { getAdminPortalView } from "@/modules/admin-moderation/admin-moderation.service";
import { getAdminWorkflowGroup } from "@/modules/admin-moderation/admin-workflows";

export default async function AdminWorkflowGroupRoute({ params }: { params: { workflowKey: string; groupKey: string } }) {
  const session = await auth();
  const callbackUrl = `/admin/workflows/${params.workflowKey}/${params.groupKey}`;

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const adminPortal = await getAdminPortalView(session.user.id);

  if (!adminPortal.canAccess) {
    redirect("/");
  }

  const workflow = getAdminWorkflowGroup(adminPortal.openFeedbackTicketCount, params.workflowKey, params.groupKey);

  if (!workflow) {
    notFound();
  }

  return (
    <AppShell>
      <AdminWorkflowGroupPage category={workflow.category} group={workflow.group} />
    </AppShell>
  );
}
