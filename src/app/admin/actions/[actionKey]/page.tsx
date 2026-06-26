import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminAccountSupportWizard } from "@/components/admin-moderation/admin-account-support-wizard";
import { AdminAdScheduleWizard } from "@/components/admin-moderation/admin-ad-schedule-wizard";
import { AdminAnnouncementWizard } from "@/components/admin-moderation/admin-announcement-wizard";
import { AdminReportsQueue } from "@/components/admin-moderation/admin-reports-queue";
import { AdminActionWizard } from "@/components/admin-moderation/admin-action-wizard";
import { AdminLaunchAccessWizard } from "@/components/admin-moderation/admin-launch-access-wizard";
import { AdminPlatformCreditsWizard } from "@/components/admin-moderation/admin-platform-credits-wizard";
import { AdminPricingWizard } from "@/components/admin-moderation/admin-pricing-wizard";
import { AdminStatusChangeWizard } from "@/components/admin-moderation/admin-status-change-wizard";
import { AdminStripeSetupWizard } from "@/components/admin-moderation/admin-stripe-setup-wizard";
import { AdminTierPolicyEditor } from "@/components/admin-moderation/admin-tier-policy-editor";
import { AppShell } from "@/components/platform/app-shell";
import { getAdScheduleAdminView } from "@/modules/ads-credits/ads-credits.service";
import { listRecentPublicAnnouncements } from "@/modules/admin-moderation/announcements.service";
import { getAdminActionCard, getAdminFeedbackTicketQueue, isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { getPlatformCreditsAdminView } from "@/modules/admin-moderation/platform-credits.service";
import { getStripeSetupAdminView } from "@/modules/billing/stripe-admin.service";
import { listLaunchAccessAdminView } from "@/modules/membership-policy/launch-access.service";
import { getGodTierPolicyEditorView } from "@/modules/membership-policy/membership-policy.service";
import { listPlatformCostRules } from "@/modules/platform-pricing/platform-pricing.service";

export default async function AdminActionPage({
  params,
  searchParams
}: {
  params: { actionKey: string };
  searchParams?: { tool?: string; inviteCode?: string };
}) {
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

  if (action.key === "reports-queue") {
    const queue = await getAdminFeedbackTicketQueue(session.user.id);

    return (
      <AppShell>
        <AdminReportsQueue tickets={queue.tickets} />
      </AppShell>
    );
  }

  if (action.key === "platform-pricing") {
    const rules = await listPlatformCostRules();

    return (
      <AppShell>
        <AdminPricingWizard initialRules={rules} />
      </AppShell>
    );
  }

  if (action.key === "ad-schedule") {
    const view = await getAdScheduleAdminView();

    return (
      <AppShell>
        <AdminAdScheduleWizard initialView={view} />
      </AppShell>
    );
  }

  if (action.key === "platform-credits") {
    const view = await getPlatformCreditsAdminView();

    return (
      <AppShell>
        <AdminPlatformCreditsWizard recentLedger={view.recentLedger} />
      </AppShell>
    );
  }

  if (action.key === "stripe-setup") {
    const view = await getStripeSetupAdminView();

    return (
      <AppShell>
        <AdminStripeSetupWizard initialView={view} />
      </AppShell>
    );
  }

  if (action.key === "status-change") {
    return (
      <AppShell>
        <AdminStatusChangeWizard />
      </AppShell>
    );
  }

  if (action.key === "tier-policy") {
    const view = await getGodTierPolicyEditorView(session.user.id);

    if (!view.canManage) {
      redirect("/admin");
    }

    return (
      <AppShell>
        <AdminTierPolicyEditor initialView={view} />
      </AppShell>
    );
  }

  if (action.key === "announcements") {
    const recentAnnouncements = await listRecentPublicAnnouncements(session.user.id);

    return (
      <AppShell>
        <AdminAnnouncementWizard recentAnnouncements={recentAnnouncements} />
      </AppShell>
    );
  }

  if (action.key === "account-support") {
    return (
      <AppShell>
        <AdminAccountSupportWizard inviteCode={searchParams?.inviteCode} mode={searchParams?.tool} />
      </AppShell>
    );
  }

  if (action.key === "launch-access") {
    const view = await listLaunchAccessAdminView();

    return (
      <AppShell>
        <AdminLaunchAccessWizard initialView={view} mode={searchParams?.tool} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AdminActionWizard action={action} />
    </AppShell>
  );
}
