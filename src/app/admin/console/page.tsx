import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GuidedAdminConsole } from "@/components/admin/guided-admin-console";
import { AppShell } from "@/components/layout/app-shell";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { seedDefaultStripeProcessorConfigs } from "@/lib/payments/processor-config";
import { hasFreshAdminModeAccess, hasFreshSecureAreaAccess } from "@/lib/security/action-access";

export default async function GuidedAdminConsolePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) redirect("/home");
  if (!hasFreshAdminModeAccess(session.user.id) || !hasFreshSecureAreaAccess(session.user.id)) {
    redirect(`/secure-area?next=${encodeURIComponent("/admin/console")}&reason=locked`);
  }

  await seedDefaultStripeProcessorConfigs(session.user.id);
  const [
    users,
    userCount,
    suspendedCount,
    openReports,
    businessReviewCount,
    activeCampaigns,
    withdrawalQueue,
    processorIssues,
    featureFlagCount,
    announcementCount,
    auditCount,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        deactivatedAt: true,
        businessProfile: { select: { status: true, verificationStatus: true } },
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { deactivatedAt: { not: null } } }),
    prisma.contentReport.count({ where: { status: { in: ["OPEN", "PENDING", "ASSIGNED"] } } }),
    prisma.businessProfile.count({ where: { OR: [{ verificationStatus: "PENDING" }, { status: "HOLD" }] } }),
    prisma.adCampaign.count({ where: { status: "ACTIVE" } }),
    prisma.withdrawalRequest.count({ where: { status: { in: ["PENDING", "APPROVED", "QUEUED_FOR_BATCH", "HOLD"] } } }),
    prisma.paymentProcessorConfig.count({ where: { OR: [{ secretConfigured: false }, { webhookSecretConfigured: false }, { webhookHealthStatus: { in: ["UNKNOWN", "MISSING_SECRET", "MISSING_WEBHOOK_SECRET", "FAILED"] } }] } }),
    prisma.platformFeatureFlag.count(),
    prisma.platformAnnouncement.count({ where: { status: "PUBLISHED" } }),
    prisma.moderatorActionLog.count(),
  ]);

  const balances = await prisma.realMoneyLedgerEntry.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((user) => user.id) } },
    _sum: { amountCents: true },
  });
  const balanceByUserId = new Map(balances.map((row) => [row.userId, row._sum.amountCents ?? 0]));

  const sections = [
    {
      key: "accounts",
      title: "Accounts",
      description: "Search users, review account state, revoke sessions, reset 2FA, and suspend or restore accounts.",
      href: "/admin?previewRole=FREE",
      stats: [
        { label: "Users", value: userCount },
        { label: "Suspended", value: suspendedCount },
        { label: "Audits", value: auditCount },
      ],
      allowed: ["Search users", "Suspend/restore", "Reset 2FA after verification", "Revoke sessions"],
      forbidden: ["Delete users", "View passwords", "View raw 2FA secrets", "Add real cash"],
    },
    {
      key: "moderation",
      title: "Content Moderation",
      description: "Review reports, assign work, resolve cases, and preserve moderation history.",
      href: "/admin",
      stats: [
        { label: "Open reports", value: openReports },
        { label: "Audit rows", value: auditCount },
        { label: "Preserved", value: "Yes" },
      ],
      allowed: ["Resolve reports", "Assign reports", "Lock or remove content through workflows", "Review history"],
      forbidden: ["Hard-delete audit records", "Erase reports", "Bypass review notes", "Hide repeat-offender history"],
    },
    {
      key: "business",
      title: "Business Profiles",
      description: "Review company submissions, storefront status, processor onboarding, and internal notes.",
      href: "/admin",
      stats: [
        { label: "Needs review", value: businessReviewCount },
        { label: "Storefronts", value: "View" },
        { label: "Notes", value: "Audit" },
      ],
      allowed: ["Approve/reject", "Request changes", "Disable storefront", "Add internal notes"],
      forbidden: ["Bypass processor verification", "Edit sensitive tax data directly", "Delete business audit logs", "Create payouts"],
    },
    {
      key: "ads",
      title: "Ads",
      description: "Review campaigns, pause, archive, boost/demote, and inspect analytics or ranking history.",
      href: "/production-zone/business/ads",
      stats: [
        { label: "Active", value: activeCampaigns },
        { label: "Credits", value: "Platform only" },
        { label: "Cash", value: "No" },
      ],
      allowed: ["Pause campaigns", "Boost/demote", "Grant platform credits", "View analytics"],
      forbidden: ["Add real ad cash", "Convert credits to cash", "Delete analytics", "Hide spend history"],
    },
    {
      key: "money",
      title: "Money / Ledger",
      description: "View append-only ledgers and manage withdrawal holds without manual cash powers.",
      href: "/production-zone/business/wallet",
      stats: [
        { label: "Withdrawals", value: withdrawalQueue },
        { label: "Ledgers", value: "3" },
        { label: "Append-only", value: "Yes" },
      ],
      allowed: ["View ledgers", "Hold withdrawals", "Release holds", "Export reports"],
      forbidden: ["Add real money", "Modify ledger rows", "Delete ledger rows", "Manual processor completion"],
    },
    {
      key: "processors",
      title: "Payment Processors",
      description: "Configure Stripe-ready processor metadata, flow availability, fees, and webhook health.",
      href: "/admin/processors",
      stats: [
        { label: "Issues", value: processorIssues },
        { label: "Secrets", value: "Hidden" },
        { label: "Modes", value: "2" },
      ],
      allowed: ["View config", "Check env presence", "Set fees", "Set batch schedule"],
      forbidden: ["View raw secrets", "Store secret values", "Bypass webhook signatures", "Fake deposits"],
    },
    {
      key: "platform",
      title: "Platform Configuration",
      description: "Manage feature flags, categories, announcement banners, and policy knobs with audit logs.",
      href: "/admin",
      stats: [
        { label: "Flags", value: featureFlagCount },
        { label: "Announcements", value: announcementCount },
        { label: "Audit", value: "Required" },
      ],
      allowed: ["Feature flags", "Categories", "Announcements", "Terms enforcement"],
      forbidden: ["Silent policy changes", "Unaudited config edits", "Secret storage", "Ledger edits"],
    },
  ];

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-strong)]">Admin Console</h1>
            <p className="text-sm text-slate-400">Guided workflows for sensitive operations. No pile of mystery buttons. Very rude to chaos, very kind to future us.</p>
          </div>
        </div>
        <GuidedAdminConsole
          sections={sections}
          users={users.map((user) => ({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            subscriptionTier: user.subscriptionTier,
            deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
            businessStatus: user.businessProfile ? `${user.businessProfile.status}/${user.businessProfile.verificationStatus}` : null,
            ledgerCents: balanceByUserId.get(user.id) ?? 0,
          }))}
        />
      </section>
    </AppShell>
  );
}
