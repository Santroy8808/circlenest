import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminActionWizard } from "@/components/admin-moderation/admin-action-wizard";
import { AppShell } from "@/components/platform/app-shell";
import { getAdminActionCard, isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";

export default async function AdminActionPage({ params }: { params: { actionKey: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/admin/actions/${params.actionKey}`);
  }

  if (!(await isAdminUser(session.user.id))) {
    redirect("/");
  }

  const action = getAdminActionCard(params.actionKey);

  if (!action) {
    notFound();
  }

  return (
    <AppShell>
      <AdminActionWizard action={action} />
    </AppShell>
  );
}
