import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { compare, hash } from "bcryptjs";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { InvitationManagementPanel } from "@/components/invitations/invitation-management-panel";
import { getAdminAction } from "@/lib/admin/admin-action-catalog";
import {
  ADMIN_MONEY_BOUNDARY,
  addSupportNote,
  createDataPrivacyRequest,
  createPlatformThrottle,
  forceTermsAcceptance,
  queueWebhookReplay,
  recordPlatformAnnouncement,
  resendEmailVerification,
  resetUserTwoFactor,
  restoreSuspendedUserAccount,
  revokeUserSessions,
  suspendUserAccount,
  updateBusinessVerification,
  upsertFeatureFlag,
  upsertPlatformCategory,
  resolveContentReport,
} from "@/lib/admin/admin-ops";
import { dispatchAdminAnnouncement } from "@/lib/admin/admin-console";
import {
  MANAGED_SUBSCRIPTION_TIERS,
  canUserBeSiteModerator,
  ensureBootstrapAdmins,
  isAdminUser,
  isGlobalAdminUser,
  logAdminAction,
  normalizeManagedSubscriptionTier,
  promoteAdminByEmail,
} from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { hasFreshPrivilegedActionAccess } from "@/lib/security/action-access";
import { requireAdminModePage } from "@/lib/security/admin-mode-guards";
import { validateStrongPassword } from "@/lib/security/password-policy";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

type AdminActionPageProps = {
  params: { actionId: string };
  searchParams?: { done?: string };
};

const fieldClass =
  "w-full rounded-xl border border-[#52647f] bg-[#253145] px-3 py-2 text-sm text-[#f3f6fb] placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";
const secondaryButtonClass = "rounded-full border border-[#52647f] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-[#f0d878]";
const primaryButtonClass = "rounded-full bg-[#3668ff] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5";

async function requireAdminAction() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return null;
  if (!hasFreshPrivilegedActionAccess(session.user.id)) return null;
  return session.user.id;
}

async function runAccountSecurityAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const operation = String(formData.get("operation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!targetUserId || !operation) return;

  if (operation === "REVOKE_SESSIONS") await revokeUserSessions({ actorUserId, targetUserId, reason });
  if (operation === "RESEND_VERIFICATION") await resendEmailVerification({ actorUserId, targetUserId });
  if (operation === "FORCE_TERMS") await forceTermsAcceptance({ actorUserId, targetUserId, reason });
  if (operation === "RESET_2FA") await resetUserTwoFactor({ actorUserId, targetUserId, reason });
  if (operation === "SUSPEND") await suspendUserAccount({ actorUserId, targetUserId, reason });
  if (operation === "RESTORE") await restoreSuspendedUserAccount({ actorUserId, targetUserId, reason });

  revalidatePath("/admin");
  redirect("/admin/actions/account-security?done=Account action completed and audit logged.");
}

async function runTierAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  const userId = String(formData.get("userId") ?? "").trim();
  const nextTier = normalizeManagedSubscriptionTier(String(formData.get("subscriptionTier") ?? "").trim());
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!userId || !nextTier) return;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, subscriptionTier: true, username: true, email: true } });
  if (!target || target.subscriptionTier === nextTier) return;
  await prisma.user.update({ where: { id: target.id }, data: { subscriptionTier: nextTier } });
  await logAdminAction({
    actorUserId,
    action: "CHANGE_TIER",
    targetType: "USER",
    targetId: target.id,
    note: `${target.subscriptionTier} -> ${nextTier}${reason ? ` - ${reason}` : ""}`,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/member-tier?done=Member tier changed and audit logged.");
}

async function runAdminRoleAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  if (!(await isGlobalAdminUser(actorUserId))) return;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const adminPassword = String(formData.get("adminPassword") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const passwordError = validateStrongPassword(adminPassword);
  if (!email || passwordError) return;
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, role: true } });
  if (!target) return;
  if (await compare(adminPassword, target.passwordHash)) return;
  const adminPasswordHash = await hash(adminPassword, 10);
  await promoteAdminByEmail(email, adminPasswordHash);
  await logAdminAction({
    actorUserId,
    action: target.role === "ADMIN" ? "RESET_ADMIN_PASSWORD" : "GRANT_ADMIN_ROLE",
    targetType: "USER",
    targetId: target.id,
    note: reason ?? `Admin role managed for ${email}`,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/admin-role?done=Admin role/password updated and audit logged.");
}

async function runSiteModeratorInviteAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!identifier) return;
  const target = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
    select: { id: true, email: true, username: true },
  });
  if (!target || !(await canUserBeSiteModerator(target.id))) return;
  await prisma.siteModeratorAssignment.upsert({
    where: { userId: target.id },
    create: { userId: target.id, invitedById: actorUserId, status: "PENDING", reason },
    update: { invitedById: actorUserId, status: "PENDING", reason, invitedAt: new Date(), grantedAt: null, revokedAt: null, grantedById: null, revokedById: null },
  });
  await logAdminAction({ actorUserId, action: "INVITE_SITE_MODERATOR", targetType: "USER", targetId: target.id, note: reason ?? target.username ?? target.email });
  revalidatePath("/admin");
  redirect("/admin/actions/site-moderators?done=Site moderator invitation queued.");
}

async function runSiteModeratorStateAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const operation = String(formData.get("operation") ?? "").trim();
  if (!assignmentId || !operation) return;
  const assignment = await prisma.siteModeratorAssignment.findUnique({
    where: { id: assignmentId },
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  if (!assignment) return;
  if (operation === "GRANT" && (await canUserBeSiteModerator(assignment.userId))) {
    await prisma.siteModeratorAssignment.update({
      where: { id: assignment.id },
      data: { status: "ACTIVE", grantedById: actorUserId, grantedAt: new Date(), revokedById: null, revokedAt: null },
    });
    await logAdminAction({ actorUserId, action: "GRANT_SITE_MODERATOR", targetType: "USER", targetId: assignment.userId, note: assignment.user.username ?? assignment.user.email });
  }
  if (operation === "REVOKE") {
    await prisma.siteModeratorAssignment.update({ where: { id: assignment.id }, data: { status: "REVOKED", revokedById: actorUserId, revokedAt: new Date() } });
    await logAdminAction({ actorUserId, action: "REVOKE_SITE_MODERATOR", targetType: "USER", targetId: assignment.userId, note: assignment.user.username ?? assignment.user.email });
  }
  revalidatePath("/admin");
  redirect("/admin/actions/site-moderators?done=Moderator assignment updated.");
}

async function runReportAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  const reportId = String(formData.get("reportId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const resolution = String(formData.get("resolution") ?? "").trim() || null;
  const assignToSelf = String(formData.get("assignToSelf") ?? "") === "true";
  if (!reportId || !status) return;
  await resolveContentReport({ actorUserId, reportId, status, resolution, assignToSelf });
  revalidatePath("/admin");
  redirect("/admin/actions/content-reports?done=Report updated and audit logged.");
}

async function runFeatureFlagAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await upsertFeatureFlag({
    actorUserId,
    key: String(formData.get("key") ?? ""),
    enabled: String(formData.get("enabled") ?? "") === "true",
    description: String(formData.get("description") ?? "") || null,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/feature-flags?done=Feature flag saved.");
}

async function runCategoryAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await upsertPlatformCategory({
    actorUserId,
    area: String(formData.get("area") ?? ""),
    name: String(formData.get("name") ?? ""),
    isActive: String(formData.get("isActive") ?? "") === "true",
    sortOrder: Number(formData.get("sortOrder") ?? "0") || 0,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/categories?done=Category saved.");
}

async function runAnnouncementAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  const headline = String(formData.get("headline") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const targetUrl = String(formData.get("targetUrl") ?? "").trim() || null;
  const audienceType = String(formData.get("audienceType") ?? "GLOBAL");
  const publish = String(formData.get("publish") ?? "") === "true";
  if (!headline || !body) return;
  await recordPlatformAnnouncement({
    actorUserId,
    headline,
    body,
    targetUrl,
    audienceType,
    deliveryModesJson: JSON.stringify(["BANNER"]),
    publish,
  });
  if (publish) {
    await dispatchAdminAnnouncement({
      actorUserId,
      headline,
      body,
      targetUrl,
      deliveryModes: ["BANNER"],
      sendToSite: audienceType === "GLOBAL",
      sendToGroups: false,
      sendToTiers: false,
      groupIds: [],
      tierValues: [],
      adSpendCredits: 0,
      adBoostFactor: 1,
    });
  }
  revalidatePath("/admin");
  redirect("/admin/actions/announcements?done=Announcement saved.");
}

async function runBusinessVerificationAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await updateBusinessVerification({
    actorUserId,
    businessProfileId: String(formData.get("businessProfileId") ?? ""),
    status: String(formData.get("status") ?? "ACTIVE"),
    verificationStatus: String(formData.get("verificationStatus") ?? "PENDING"),
    note: String(formData.get("note") ?? "") || null,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/business-verification?done=Business decision saved.");
}

async function runThrottleAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await createPlatformThrottle({
    actorUserId,
    targetType: String(formData.get("targetType") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    throttleKey: String(formData.get("throttleKey") ?? ""),
    reason: String(formData.get("reason") ?? "") || null,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/abuse-throttle?done=Throttle applied.");
}

async function runSupportNoteAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await addSupportNote({
    actorUserId,
    targetType: String(formData.get("targetType") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  revalidatePath("/admin");
  redirect("/admin/actions/support-note?done=Support note added.");
}

async function runWebhookReplayAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await queueWebhookReplay({
    actorUserId,
    provider: String(formData.get("provider") ?? ""),
    eventId: String(formData.get("eventId") ?? ""),
    payloadSummary: String(formData.get("payloadSummary") ?? "") || null,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/webhook-replay?done=Webhook replay queued.");
}

async function runDataRequestAction(formData: FormData) {
  "use server";
  const actorUserId = await requireAdminAction();
  if (!actorUserId) return;
  await createDataPrivacyRequest({
    actorUserId,
    requesterId: String(formData.get("requesterId") ?? "") || null,
    requesterEmail: String(formData.get("requesterEmail") ?? "") || null,
    requestType: String(formData.get("requestType") ?? ""),
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/admin");
  redirect("/admin/actions/data-request?done=Data request tracked.");
}

export default async function AdminActionPage({ params, searchParams }: AdminActionPageProps) {
  const action = getAdminAction(params.actionId);
  if (!action) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) redirect("/home");
  requireAdminModePage(session.user.id);
  requireSecureAreaPage(session.user.id, `/admin/actions/${action.id}`);

  return (
    <AppShell>
      <section className="card space-y-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="text-sm font-semibold text-[#f0d878] hover:underline">
              Back to Admin Portal
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">{action.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{action.summary}</p>
          </div>
          <span className="rounded-full border border-[#52647f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            {action.risk} risk
          </span>
        </div>

        {searchParams?.done ? (
          <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm text-emerald-100">{searchParams.done}</div>
        ) : null}

        <WizardFrame
          outcome={action.outcome}
          steps={[
            "Confirm this is the correct admin task.",
            "Review the safety boundary and what will be changed.",
            "Fill in only the fields needed for this action.",
            "Submit once. The platform records the action in the audit trail.",
          ]}
        >
          {await renderActionForm(action.id, session.user.id)}
        </WizardFrame>
      </section>
    </AppShell>
  );
}

async function renderActionForm(actionId: string, actorUserId: string) {
  if (actionId === "account-security") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      select: { id: true, email: true, username: true, subscriptionTier: true, role: true, deactivatedAt: true },
    });
    return (
      <form action={runAccountSecurityAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Use this when an account is compromised, stuck at verification, blocked by 2FA, suspended by mistake, or must accept updated terms." />
        <UserSelect users={users} />
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Action to perform</span>
          <select name="operation" className={fieldClass} required>
            <option value="REVOKE_SESSIONS">Force log-out / revoke sessions</option>
            <option value="RESEND_VERIFICATION">Resend email verification</option>
            <option value="FORCE_TERMS">Force terms acceptance</option>
            <option value="RESET_2FA">Reset 2FA</option>
            <option value="SUSPEND">Suspend account</option>
            <option value="RESTORE">Restore suspended account</option>
          </select>
        </label>
        <ReasonField />
        <SubmitRow label="Run account action" />
      </form>
    );
  }

  if (actionId === "member-tier") {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 150, select: { id: true, email: true, username: true, subscriptionTier: true, role: true, deactivatedAt: true } });
    return (
      <form action={runTierAction} className="space-y-3">
        <WizardInstruction title="What this does" body="This changes subscription tier only. It does not grant administrator powers, real money, or hidden privileges." />
        <UserSelect users={users} name="userId" />
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">New tier</span>
          <select name="subscriptionTier" className={fieldClass} required>
            {MANAGED_SUBSCRIPTION_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier === "PRO" ? "BIZ" : tier}
              </option>
            ))}
          </select>
        </label>
        <ReasonField />
        <SubmitRow label="Change tier" />
      </form>
    );
  }

  if (actionId === "admin-role") {
    const isGlobal = await isGlobalAdminUser(actorUserId);
    return (
      <form action={runAdminRoleAction} className="space-y-3">
        <WizardInstruction
          title="What this does"
          body="Only Global Admins can grant admin role. Admin privileges remain inactive until the user enables Administrator Mode with their separate admin password."
        />
        {!isGlobal ? <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100">This action is Global Admin only.</p> : null}
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Target account email</span>
          <input name="email" type="email" className={fieldClass} required disabled={!isGlobal} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Separate admin password</span>
          <input name="adminPassword" type="password" minLength={8} className={fieldClass} required disabled={!isGlobal} />
        </label>
        <ReasonField disabled={!isGlobal} />
        <SubmitRow label="Grant admin role" disabled={!isGlobal} />
      </form>
    );
  }

  if (actionId === "site-moderators") {
    const assignments = await prisma.siteModeratorAssignment.findMany({
      include: { user: { select: { email: true, username: true, subscriptionTier: true } } },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
      take: 100,
    });
    return (
      <div className="space-y-4">
        <form action={runSiteModeratorInviteAction} className="space-y-3">
          <WizardInstruction title="What this does" body="Invite an eligible user to become a site-wide moderator. Contributor, Biz, and Auditor users can be eligible; Free users are not." />
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Email or username</span>
            <input name="identifier" className={fieldClass} placeholder="member@theta-space.net or username" required />
          </label>
          <ReasonField />
          <SubmitRow label="Invite moderator" />
        </form>
        <div className="space-y-2">
          <h3 className="font-semibold text-[#f0d878]">Current assignments</h3>
          {assignments.map((assignment) => (
            <article key={assignment.id} className="rounded-2xl border border-[#304058] bg-[#0d1626] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-200">@{assignment.user.username} - {assignment.user.subscriptionTier} - {assignment.status}</p>
                <form action={runSiteModeratorStateAction} className="flex gap-2">
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <button name="operation" value="GRANT" className={secondaryButtonClass} type="submit">Grant</button>
                  <button name="operation" value="REVOKE" className={secondaryButtonClass} type="submit">Revoke</button>
                </form>
              </div>
            </article>
          ))}
          {assignments.length === 0 ? <p className="text-sm text-slate-500">No moderator assignments yet.</p> : null}
        </div>
      </div>
    );
  }

  if (actionId === "membership-invitations") {
    const activeInvitationStatuses = ["PENDING", "RESUBMITTED", "PENDING_REVIEW"] as const;
    const [invites, logs, activeInviteCount] = await Promise.all([
      prisma.membershipInvitation.findMany({
        include: {
          inviter: { select: { id: true, email: true, username: true } },
          inviteeUser: { select: { id: true, email: true, username: true } },
          reviewedBy: { select: { id: true, email: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 75,
      }),
      prisma.moderatorActionLog.findMany({
        where: { targetType: "MEMBERSHIP_INVITATION" },
        include: { actor: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.membershipInvitation.count({
        where: {
          inviterId: actorUserId,
          status: { in: [...activeInvitationStatuses] },
        },
      }),
    ]);

    return (
      <div className="space-y-3">
        <WizardInstruction
          title="What this does"
          body="Use this to handle invite-only membership qualification. The form keeps Scientology status, org, last service, terms agreement, and review state together."
        />
        <InvitationManagementPanel
          mode="admin"
          canInvite={true}
          reason={null}
          inviteLimit={null}
          activeCount={activeInviteCount}
          hasInviteLimitException={false}
          initialInvites={invites.map((invite) => ({
            id: invite.id,
            inviter: invite.inviter ? { username: invite.inviter.username, email: invite.inviter.email } : null,
            inviteeUser: invite.inviteeUser ? { username: invite.inviteeUser.username, email: invite.inviteeUser.email } : null,
            reviewedBy: invite.reviewedBy ? { username: invite.reviewedBy.username, email: invite.reviewedBy.email } : null,
            inviteeEmail: invite.inviteeEmail,
            inviteeName: invite.inviteeName,
            inviteePhone: invite.inviteePhone,
            status: invite.status,
            reviewStatus: invite.reviewStatus,
            currentOrg: invite.currentOrg,
            lastServiceDate: invite.lastServiceDate,
            lastServiceName: invite.lastServiceName,
            isActiveScientologist: invite.isActiveScientologist,
            isInGoodStanding: invite.isInGoodStanding,
            agreedToPrivateMembershipTerms: invite.agreedToPrivateMembershipTerms,
            qualificationNotes: invite.qualificationNotes,
            applicationFeeAmountCents: invite.applicationFeeAmountCents,
            applicationFeeCurrency: invite.applicationFeeCurrency,
            applicationFeePaidAt: invite.applicationFeePaidAt?.toISOString() ?? null,
            expiresAt: invite.expiresAt.toISOString(),
            acceptedAt: invite.acceptedAt?.toISOString() ?? null,
            revokedAt: invite.revokedAt?.toISOString() ?? null,
            rejectedAt: invite.rejectedAt?.toISOString() ?? null,
            resubmittedAt: invite.resubmittedAt?.toISOString() ?? null,
            reviewedAt: invite.reviewedAt?.toISOString() ?? null,
            createdAt: invite.createdAt.toISOString(),
            updatedAt: invite.updatedAt.toISOString(),
          }))}
          initialAudit={logs.map((log) => ({
            id: log.id,
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            note: log.note,
            createdAt: log.createdAt.toISOString(),
            actor: { username: log.actor.username },
          }))}
        />
      </div>
    );
  }

  if (actionId === "content-reports") {
    const reports = await prisma.contentReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 75,
      include: { reporter: { select: { username: true, email: true } } },
    });
    return (
      <form action={runReportAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Update one report at a time. The report stays preserved; this only changes review status and resolution notes." />
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Report</span>
          <select name="reportId" className={fieldClass} required>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.status} - {report.targetType}:{report.targetId} - @{report.reporter.username}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Decision</span>
          <select name="status" className={fieldClass} required>
            <option value="ASSIGNED">Assign to me</option>
            <option value="RESOLVED">Resolve</option>
            <option value="DISMISSED">Dismiss</option>
            <option value="REMOVED">Content removed</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" name="assignToSelf" value="true" /> Assign to me
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-300">Resolution note</span>
          <textarea name="resolution" className={fieldClass} rows={4} />
        </label>
        <SubmitRow label="Update report" disabled={reports.length === 0} />
      </form>
    );
  }

  if (actionId === "feature-flags") {
    const flags = await prisma.platformFeatureFlag.findMany({ orderBy: { updatedAt: "desc" }, take: 40 });
    return (
      <form action={runFeatureFlagAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Use feature flags to pause risky or unfinished modules without a deployment. Name flags in uppercase words, like MARKET_ADS." />
        <input name="key" placeholder="FEATURE_NAME" className={fieldClass} required />
        <input name="description" placeholder="Description" className={fieldClass} />
        <select name="enabled" className={fieldClass}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
        <SubmitRow label="Save feature flag" />
        <RecordList rows={flags.map((flag) => `${flag.key}: ${flag.enabled ? "on" : "off"}`)} />
      </form>
    );
  }

  if (actionId === "categories") {
    const categories = await prisma.platformCategory.findMany({ orderBy: [{ area: "asc" }, { sortOrder: "asc" }, { name: "asc" }], take: 100 });
    return (
      <form action={runCategoryAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Categories are controlled by admins so browsing and search stay clean. Members should not create their own category names." />
        <select name="area" className={fieldClass}>
          <option value="MARKET">The Market</option>
          <option value="JOBS">Jobs</option>
          <option value="EVENTS">Events</option>
          <option value="FUNDRAISERS">Fundraisers</option>
        </select>
        <input name="name" placeholder="Category name" className={fieldClass} required />
        <input name="sortOrder" type="number" placeholder="Sort order" className={fieldClass} />
        <select name="isActive" className={fieldClass}>
          <option value="true">Active</option>
          <option value="false">Hidden</option>
        </select>
        <SubmitRow label="Save category" />
        <RecordList rows={categories.map((category) => `${category.area}: ${category.name} (${category.isActive ? "active" : "hidden"})`)} />
      </form>
    );
  }

  if (actionId === "announcements") {
    const announcements = await prisma.platformAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return (
      <form action={runAnnouncementAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Create a platform notice. Drafts are saved only; publishing creates member notifications." />
        <input name="headline" placeholder="Headline" className={fieldClass} required />
        <input name="targetUrl" placeholder="Optional target URL" className={fieldClass} />
        <select name="audienceType" className={fieldClass}>
          <option value="GLOBAL">Global</option>
          <option value="TIER">Tier-specific draft</option>
          <option value="TARGETED">Targeted draft</option>
        </select>
        <textarea name="body" placeholder="Announcement body" className={fieldClass} rows={5} required />
        <select name="publish" className={fieldClass}>
          <option value="false">Save draft</option>
          <option value="true">Publish notification</option>
        </select>
        <SubmitRow label="Save announcement" />
        <RecordList rows={announcements.map((announcement) => `${announcement.headline} - ${announcement.audienceType} - ${announcement.status}`)} />
      </form>
    );
  }

  if (actionId === "business-verification") {
    const businesses = await prisma.businessProfile.findMany({ include: { owner: { select: { username: true, email: true } } }, orderBy: { updatedAt: "desc" }, take: 75 });
    return (
      <form action={runBusinessVerificationAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Approve, reject, request changes, or place a business on hold. This affects storefront visibility but does not touch real money." />
        <select name="businessProfileId" className={fieldClass} required>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.businessName} - @{business.owner.username} - {business.status}/{business.verificationStatus}
            </option>
          ))}
        </select>
        <select name="status" className={fieldClass}>
          <option value="ACTIVE">Active</option>
          <option value="HOLD">Hold</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select name="verificationStatus" className={fieldClass}>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approve</option>
          <option value="CHANGES_REQUESTED">Request changes</option>
          <option value="REJECTED">Reject</option>
        </select>
        <ReasonField name="note" />
        <SubmitRow label="Save business decision" disabled={businesses.length === 0} />
      </form>
    );
  }

  if (actionId === "abuse-throttle") {
    return (
      <form action={runThrottleAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Use a throttle when behavior is spammy but does not require full suspension. Use target IDs from reports, user records, or business records." />
        <input name="targetType" placeholder="USER or BUSINESS" className={fieldClass} required />
        <input name="targetId" placeholder="Target ID" className={fieldClass} required />
        <input name="throttleKey" placeholder="POSTS, MESSAGES, ADS, MARKET" className={fieldClass} required />
        <ReasonField />
        <SubmitRow label="Apply throttle" />
      </form>
    );
  }

  if (actionId === "support-note") {
    return (
      <form action={runSupportNoteAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Attach an internal support note. Members do not see this note. Do not include passwords, payment secrets, or unnecessary private data." />
        <input name="targetType" placeholder="USER / BUSINESS / REPORT / CAMPAIGN / WITHDRAWAL" className={fieldClass} required />
        <input name="targetId" placeholder="Target ID" className={fieldClass} required />
        <textarea name="body" placeholder="Internal note" className={fieldClass} rows={5} required />
        <SubmitRow label="Add support note" />
      </form>
    );
  }

  if (actionId === "webhook-replay") {
    return (
      <form action={runWebhookReplayAction} className="space-y-3">
        <WizardInstruction title="What this does" body={ADMIN_MONEY_BOUNDARY + " This only queues a replay request. The processor must still verify signature and idempotency."} />
        <input name="provider" placeholder="STRIPE" className={fieldClass} required />
        <input name="eventId" placeholder="Provider event ID" className={fieldClass} required />
        <input name="payloadSummary" placeholder="Safe summary only" className={fieldClass} />
        <SubmitRow label="Queue replay" />
      </form>
    );
  }

  if (actionId === "data-request") {
    return (
      <form action={runDataRequestAction} className="space-y-3">
        <WizardInstruction title="What this does" body="Track privacy export, deletion, or correction requests. Ledger and audit records are preserved even when user data requests are handled." />
        <input name="requesterId" placeholder="Optional user ID" className={fieldClass} />
        <input name="requesterEmail" type="email" placeholder="Optional email" className={fieldClass} />
        <select name="requestType" className={fieldClass}>
          <option value="EXPORT">Export</option>
          <option value="DELETION">Deletion</option>
          <option value="CORRECTION">Correction</option>
        </select>
        <input name="notes" placeholder="Notes" className={fieldClass} />
        <SubmitRow label="Track request" />
      </form>
    );
  }

  if (actionId === "security-events") {
    const events = await prisma.authSecurityEvent.findMany({
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 75,
    });
    return (
      <div className="space-y-3">
        <WizardInstruction title="What this does" body="Review recent security events before choosing a separate action such as force log-out or reset 2FA." />
        <RecordList rows={events.map((event) => `${event.eventType} - ${event.user ? `@${event.user.username}` : "No user"} - ${event.createdAt.toLocaleString()}`)} />
      </div>
    );
  }

  if (actionId === "audit-log") {
    const logs = await prisma.moderatorActionLog.findMany({
      include: { actor: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return (
      <div className="space-y-3">
        <WizardInstruction title="What this does" body="Review preserved admin and moderator actions. This is read-only and should not be hard-deleted." />
        <RecordList rows={logs.map((log) => `${log.action} - ${log.targetType}:${log.targetId} - by @${log.actor.username} - ${log.createdAt.toLocaleString()}`)} />
      </div>
    );
  }

  return null;
}

function WizardFrame({ outcome, steps, children }: { outcome: string; steps: string[]; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3 rounded-2xl border border-[#304058] bg-[#0d1626] p-4">
        <h2 className="font-semibold text-[#f0d878]">Wizard walkthrough</h2>
        <p className="text-sm text-slate-400">{outcome}</p>
        <ol className="space-y-2 text-sm text-slate-300">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#52647f] text-xs text-[#f0d878]">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </aside>
      <div className="rounded-2xl border border-[#304058] bg-[#101a2c] p-4">{children}</div>
    </div>
  );
}

function WizardInstruction({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
      <h3 className="font-semibold text-amber-100">{title}</h3>
      <p className="mt-1 text-sm text-amber-100/90">{body}</p>
    </div>
  );
}

function UserSelect({
  users,
  name = "targetUserId",
}: {
  users: Array<{ id: string; email: string; username: string; subscriptionTier: string; role: string; deactivatedAt: Date | null }>;
  name?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-slate-300">Account</span>
      <select name={name} className={fieldClass} required>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            @{user.username} - {user.email} - {user.role}/{user.subscriptionTier}{user.deactivatedAt ? " - suspended" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReasonField({ name = "reason", disabled = false }: { name?: string; disabled?: boolean }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-slate-300">Reason / verification note</span>
      <textarea name={name} className={fieldClass} rows={3} placeholder="What was verified, why this is being done, and any support/report reference." disabled={disabled} />
    </label>
  );
}

function SubmitRow({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#304058] pt-3">
      <p className="text-xs text-slate-500">Submitting once completes the action and writes the audit trail.</p>
      <button type="submit" className={disabled ? `${primaryButtonClass} opacity-50` : primaryButtonClass} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

function RecordList({ rows }: { rows: string[] }) {
  return (
    <div className="max-h-80 space-y-2 overflow-auto rounded-2xl border border-[#304058] bg-[#0d1626] p-3 text-sm text-slate-300">
      {rows.map((row) => (
        <p key={row} className="rounded-xl bg-[#101a2c] px-3 py-2">
          {row}
        </p>
      ))}
      {rows.length === 0 ? <p className="text-slate-500">No records yet.</p> : null}
    </div>
  );
}
