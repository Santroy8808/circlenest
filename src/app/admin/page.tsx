import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { InvitationManagementPanel } from "@/components/invitations/invitation-management-panel";
import { hasFreshPrivilegedActionAccess } from "@/lib/security/action-access";
import { requireAdminModePage } from "@/lib/security/admin-mode-guards";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";
import {
  adjustUserAdCredits,
  boostAdsForCreator,
  dispatchAdminAnnouncement,
  resolveMonthlyFinancialReports,
  restoreUserAccount,
  setAdBoostFactor,
} from "@/lib/admin/admin-console";
import {
  MANAGED_SUBSCRIPTION_TIERS,
  ensureBootstrapAdmins,
  isGlobalAdminUser,
  isAdminUser,
  logAdminAction,
  normalizeManagedSubscriptionTier,
  promoteAdminByEmail,
} from "@/lib/auth/admin";

type AdminPageProps = {
  searchParams?: {
    q?: string;
    groupQ?: string;
    adQ?: string;
    reportMonths?: string;
  };
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();

  if (!(await isAdminUser(session.user.id))) {
    return (
      <AppShell>
        <section className="card space-y-3 p-4">
          <h1 className="text-xl font-semibold">Admin Portal</h1>
          <p className="text-sm text-slate-500">Admin access only.</p>
          <Link href="/home" className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm">
            Back to Home
          </Link>
        </section>
      </AppShell>
    );
  }
  requireAdminModePage(session.user.id);
  requireSecureAreaPage(session.user.id, "/admin");
  const globalAdminAccess = await isGlobalAdminUser(session.user.id);

  const q = String(searchParams?.q ?? "").trim();
  const groupQ = String(searchParams?.groupQ ?? "").trim();
  const adQ = String(searchParams?.adQ ?? "").trim();
  const reportMonths = Math.min(12, Math.max(1, Number(searchParams?.reportMonths ?? "6") || 6));
  const userWhere = q
    ? {
        OR: [
          { email: { contains: q } },
          { username: { contains: q } },
          { fullName: { contains: q } },
        ],
      }
    : undefined;
  const activeInvitationStatuses = ["PENDING", "RESUBMITTED", "PENDING_REVIEW"] as const;

  const [users, logs, invites, activeInviteCount, petitions, siteModeratorAssignments, adLedgerEntries] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        inviteLimitException: true,
        deactivatedAt: true,
        deletionRequestedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.moderatorActionLog.findMany({
      include: { actor: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.membershipInvitation.findMany({
      include: {
        inviter: { select: { id: true, email: true, username: true } },
        inviteeUser: { select: { id: true, email: true, username: true } },
        reviewedBy: { select: { id: true, email: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.membershipInvitation.count({
      where: {
        inviterId: session.user.id,
        status: { in: [...activeInvitationStatuses] },
      },
    }),
    prisma.adminPetition.findMany({
      include: { requester: { select: { username: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.siteModeratorAssignment.findMany({
      include: {
        user: { select: { id: true, email: true, username: true, role: true, subscriptionTier: true, createdAt: true } },
        invitedBy: { select: { id: true, email: true, username: true } },
        grantedBy: { select: { id: true, email: true, username: true } },
        revokedBy: { select: { id: true, email: true, username: true } },
      },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
      take: 100,
    }),
    prisma.adCreditLedger.findMany({
      include: { user: { select: { id: true, email: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const [announcementGroups, recentAds, monthlyReports] = await Promise.all([
    prisma.group.findMany({
      where: groupQ
        ? {
            OR: [
              { name: { contains: groupQ } },
              { purpose: { contains: groupQ } },
              { locationCountry: { contains: groupQ } },
              { locationState: { contains: groupQ } },
              { locationCity: { contains: groupQ } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        purpose: true,
        locationCountry: true,
        locationState: true,
        locationCity: true,
        owner: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.adPlacement.findMany({
      where: adQ
        ? {
            OR: [
              { headline: { contains: adQ } },
              { body: { contains: adQ } },
              { creator: { username: { contains: adQ } } },
            ],
          }
        : undefined,
      include: {
        creator: { select: { id: true, email: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    resolveMonthlyFinancialReports(reportMonths),
  ]);

  const inviteRows = invites.map((invite) => ({
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
  }));

  const inviteAuditRows = logs
    .filter((log) => log.targetType === "MEMBERSHIP_INVITATION")
    .map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      note: log.note,
      createdAt: log.createdAt.toISOString(),
      actor: { username: log.actor.username },
    }));

  const siteModeratorRows = siteModeratorAssignments.map((assignment) => ({
    id: assignment.id,
    status: assignment.status,
    reason: assignment.reason,
    invitedAt: assignment.invitedAt.toISOString(),
    grantedAt: assignment.grantedAt?.toISOString() ?? null,
    revokedAt: assignment.revokedAt?.toISOString() ?? null,
    user: {
      id: assignment.user.id,
      email: assignment.user.email,
      username: assignment.user.username,
      role: assignment.user.role,
      subscriptionTier: assignment.user.subscriptionTier,
      createdAt: assignment.user.createdAt.toISOString(),
    },
    invitedBy: assignment.invitedBy ? { username: assignment.invitedBy.username, email: assignment.invitedBy.email } : null,
    grantedBy: assignment.grantedBy ? { username: assignment.grantedBy.username, email: assignment.grantedBy.email } : null,
    revokedBy: assignment.revokedBy ? { username: assignment.revokedBy.username, email: assignment.revokedBy.email } : null,
  }));

  const adLedgerRows = adLedgerEntries.map((entry) => ({
    id: entry.id,
    ledgerKey: entry.ledgerKey,
    entryType: entry.entryType,
    periodKey: entry.periodKey,
    credits: entry.credits,
    balanceAfter: entry.balanceAfter,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    user: {
      id: entry.user.id,
      email: entry.user.email,
      username: entry.user.username,
    },
  }));

  return (
    <AppShell>
      <section className="card space-y-5 p-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Admin Portal</h1>
          <p className="text-sm text-slate-500">Admin role is separate from subscription tier.</p>
        </div>

        <section id="site-moderators" className="space-y-3 rounded border border-[var(--border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Site moderators</h2>
              <p className="text-xs text-slate-500">Invite Activist, Pro, or Auditor users, then grant or revoke moderator status.</p>
            </div>
            <form action="/api/admin/site-moderators" method="post" className="flex flex-wrap items-center gap-2">
              <input
                name="identifier"
                placeholder="Email or username"
                className="min-w-[220px] rounded border px-3 py-2 text-sm"
                required
              />
              <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
                Invite moderator
              </button>
            </form>
          </div>

          <div className="grid gap-2">
            {siteModeratorRows.map((assignment) => (
              <article key={assignment.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">@{assignment.user.username}</p>
                    <p className="text-xs text-slate-500">{assignment.user.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      assignment.status === "ACTIVE"
                        ? "border border-emerald-400/40 bg-emerald-300/10 text-emerald-200"
                        : assignment.status === "PENDING"
                          ? "border border-amber-400/40 bg-amber-300/10 text-amber-200"
                          : "border border-slate-300/40 text-slate-200"
                    }`}
                  >
                    {assignment.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">Tier: {assignment.user.subscriptionTier}</p>
                <p className="text-xs text-slate-400">
                  Invited {new Date(assignment.invitedAt).toLocaleString()}
                  {assignment.invitedBy ? ` • by @${assignment.invitedBy.username}` : ""}
                </p>
                {assignment.grantedAt ? (
                  <p className="text-xs text-slate-400">
                    Granted {new Date(assignment.grantedAt).toLocaleString()}
                    {assignment.grantedBy ? ` • by @${assignment.grantedBy.username}` : ""}
                  </p>
                ) : null}
                {assignment.revokedAt ? (
                  <p className="text-xs text-slate-400">
                    Revoked {new Date(assignment.revokedAt).toLocaleString()}
                    {assignment.revokedBy ? ` • by @${assignment.revokedBy.username}` : ""}
                  </p>
                ) : null}
                {assignment.reason ? <p className="text-xs text-slate-400">Note: {assignment.reason}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {assignment.status !== "ACTIVE" ? (
                    <form action={`/api/admin/site-moderators/${assignment.id}/grant`} method="post">
                      <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-xs">
                        Grant
                      </button>
                    </form>
                  ) : null}
                  {assignment.status !== "REVOKED" ? (
                    <form action={`/api/admin/site-moderators/${assignment.id}/revoke`} method="post">
                      <button type="submit" className="rounded border border-rose-400/50 px-3 py-1.5 text-xs text-rose-200">
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
            {siteModeratorRows.length === 0 ? <p className="text-sm text-slate-500">No site moderators yet.</p> : null}
          </div>
        </section>

        <section className="space-y-3 rounded border border-[var(--border)] p-3">
          <div>
            <h2 className="text-lg font-semibold">Content review</h2>
            <p className="text-xs text-slate-500">Admins and site moderators handle reports in the moderation dashboard.</p>
          </div>
          <Link href="/moderation#reports" className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm">
            Open report queue
          </Link>
        </section>

        <section id="member-tiers" className="space-y-3 rounded border border-[var(--border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Member tiers</h2>
              <p className="text-xs text-slate-500">Search users and change subscription tier. Admin role stays separate.</p>
            </div>
            <form action="/admin" method="get" className="flex flex-wrap items-center gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search email or username"
                className="min-w-[220px] rounded border px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
                Search
              </button>
              {q ? (
                <Link href="/admin" className="rounded border border-slate-300 px-3 py-2 text-sm">
                  Clear
                </Link>
              ) : null}
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <th className="border-b border-[var(--border)] px-3 py-2">User</th>
                  <th className="border-b border-[var(--border)] px-3 py-2">Role</th>
                  <th className="border-b border-[var(--border)] px-3 py-2">Tier</th>
                  <th className="border-b border-[var(--border)] px-3 py-2">Invite exception</th>
                  <th className="border-b border-[var(--border)] px-3 py-2">Created</th>
                  <th className="border-b border-[var(--border)] px-3 py-2">Update tier</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="align-top">
                    <td className="border-b border-[var(--border)] px-3 py-3">
                      <p className="font-medium">@{user.username}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                          user.role === "ADMIN" ? "border border-amber-400/40 bg-amber-300/10 text-amber-200" : "border border-slate-300/40 text-slate-200"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-3 text-xs text-slate-300">{user.subscriptionTier}</td>
                    <td className="border-b border-[var(--border)] px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <span
                          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                            user.inviteLimitException
                              ? "border border-emerald-400/40 bg-emerald-300/10 text-emerald-200"
                              : "border border-slate-300/40 text-slate-200"
                          }`}
                        >
                          {user.inviteLimitException ? "Enabled" : "Off"}
                        </span>
                        <form
                          action={async (formData) => {
                            "use server";
                            const { auth } = await import("@/auth");
                            const { prisma } = await import("@/lib/db/prisma");
                            const { ensureBootstrapAdmins, isAdminUser, logAdminAction } = await import("@/lib/auth/admin");
                            const { revalidatePath } = await import("next/cache");
                            const current = await auth();
                            if (!current?.user?.id) return;
                            await ensureBootstrapAdmins();
                            if (!(await isAdminUser(current.user.id))) return;
                            if (!hasFreshPrivilegedActionAccess(current.user.id)) return;

                            const userId = String(formData.get("userId") ?? "").trim();
                            const enabled = String(formData.get("enabled") ?? "").trim() === "true";
                            if (!userId) return;

                            const target = await prisma.user.findUnique({
                              where: { id: userId },
                              select: { id: true, email: true, username: true, inviteLimitException: true },
                            });
                            if (!target || target.inviteLimitException === enabled) return;

                            await prisma.user.update({
                              where: { id: target.id },
                              data: { inviteLimitException: enabled },
                            });
                            await logAdminAction({
                              actorUserId: current.user.id,
                              action: enabled ? "SET_INVITE_LIMIT_EXCEPTION" : "CLEAR_INVITE_LIMIT_EXCEPTION",
                              targetType: "USER",
                              targetId: target.id,
                              note: target.username ?? target.email,
                            });
                            revalidatePath("/admin");
                          }}
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="enabled" value={String(!user.inviteLimitException)} />
                          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-xs">
                            {user.inviteLimitException ? "Remove" : "Grant"}
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-3 text-xs text-slate-400">{new Date(user.createdAt).toLocaleString()}</td>
                    <td className="border-b border-[var(--border)] px-3 py-3">
                      <form
                        action={async (formData) => {
                          "use server";
                          const { auth } = await import("@/auth");
                          const { prisma } = await import("@/lib/db/prisma");
                          const {
                            ensureBootstrapAdmins,
                            isAdminUser,
                            logAdminAction,
                            normalizeManagedSubscriptionTier,
                          } = await import("@/lib/auth/admin");
                          const { revalidatePath } = await import("next/cache");
                          const current = await auth();
                          if (!current?.user?.id) return;
                          await ensureBootstrapAdmins();
                          if (!(await isAdminUser(current.user.id))) return;
                          if (!hasFreshPrivilegedActionAccess(current.user.id)) return;

                          const userId = String(formData.get("userId") ?? "").trim();
                          const nextTier = normalizeManagedSubscriptionTier(String(formData.get("subscriptionTier") ?? "").trim());
                          if (!userId || !nextTier) return;

                          const target = await prisma.user.findUnique({
                            where: { id: userId },
                            select: { id: true, subscriptionTier: true },
                          });
                          if (!target) return;
                          if (target.subscriptionTier === nextTier) return;

                          await prisma.user.update({
                            where: { id: target.id },
                            data: { subscriptionTier: nextTier },
                          });
                          await logAdminAction({
                            actorUserId: current.user.id,
                            action: "CHANGE_TIER",
                            targetType: "USER",
                            targetId: target.id,
                            note: `${target.subscriptionTier} -> ${nextTier}`,
                          });
                          revalidatePath("/admin");
                        }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <select name="subscriptionTier" defaultValue={user.subscriptionTier} className="rounded border px-2 py-1 text-sm">
                          {MANAGED_SUBSCRIPTION_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm">
                          Save tier
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>
                      No users found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded border border-[var(--border)] p-3">
          <div>
            <h2 className="text-lg font-semibold">Ad credit ledger</h2>
          <p className="text-xs text-slate-500">Recent Pro and Auditor monthly grants and ad spends.</p>
          </div>
          <div className="grid gap-2">
            {adLedgerRows.map((entry) => (
              <article key={entry.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{entry.entryType}</p>
                  <span className="text-xs text-slate-400">{entry.periodKey || "—"}</span>
                </div>
                <p className="text-xs text-slate-500">
                  @{entry.user.username} | {entry.credits} credits | {entry.sourceType || "SYSTEM"}{entry.sourceId ? `:${entry.sourceId}` : ""}
                </p>
                {entry.note ? <p className="text-xs text-slate-400">{entry.note}</p> : null}
                <p className="text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
              </article>
            ))}
            {adLedgerRows.length === 0 ? <p className="text-sm text-slate-500">No ad ledger entries yet.</p> : null}
          </div>
        </section>

        <InvitationManagementPanel
          mode="admin"
          canInvite={true}
          reason={null}
          inviteLimit={null}
          activeCount={activeInviteCount}
          hasInviteLimitException={false}
          initialInvites={inviteRows}
          initialAudit={inviteAuditRows}
        />

        {globalAdminAccess ? (
          <form
            action={async (formData) => {
              "use server";
              const { compare, hash } = await import("bcryptjs");
              const { auth } = await import("@/auth");
              const { prisma } = await import("@/lib/db/prisma");
              const { isGlobalAdminUser, logAdminAction, promoteAdminByEmail } = await import("@/lib/auth/admin");
              const { validateStrongPassword } = await import("@/lib/security/password-policy");
              const current = await auth();
              if (!current?.user?.id) return;
              if (!(await isGlobalAdminUser(current.user.id))) return;
              if (!hasFreshPrivilegedActionAccess(current.user.id)) return;
              const email = String(formData.get("email") ?? "").trim().toLowerCase();
              const adminPassword = String(formData.get("adminPassword") ?? "");
              if (!email || adminPassword.length < 8) return;
              if (validateStrongPassword(adminPassword)) return;
              const target = await prisma.user.findUnique({
                where: { email },
                select: { id: true, passwordHash: true, role: true },
              });
              if (!target) return;
              if (await compare(adminPassword, target.passwordHash)) return;
              const adminPasswordHash = await hash(adminPassword, 10);
              await promoteAdminByEmail(email, adminPasswordHash);
              await logAdminAction({
                actorUserId: current.user.id,
                action: target.role === "ADMIN" ? "RESET_ADMIN_PASSWORD" : "GRANT_ADMIN_ROLE",
                targetType: "USER",
                targetId: target.id,
                note: `Admin role managed for ${email}`,
              });
            }}
            className="grid gap-2 md:grid-cols-2"
          >
            <input name="email" type="email" placeholder="User email to assign admin role" className="rounded border px-3 py-2 md:col-span-2" required />
            <input name="adminPassword" type="password" minLength={8} placeholder="Initial admin password" className="rounded border px-3 py-2 md:col-span-2" required />
            <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">
              Grant Admin Role
            </button>
          </form>
        ) : null}

        <form
        action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { isAdminUser, logAdminAction } = await import("@/lib/auth/admin");
            const current = await auth();
            if (!current?.user?.id) return;
            if (!(await isAdminUser(current.user.id))) return;
            if (!hasFreshPrivilegedActionAccess(current.user.id)) return;
            const action = String(formData.get("action") ?? "").trim();
            const targetType = String(formData.get("targetType") ?? "").trim();
            const targetId = String(formData.get("targetId") ?? "").trim();
            if (!action || !targetType || !targetId) return;
            await logAdminAction({
              actorUserId: current.user.id,
              action,
              targetType,
              targetId,
              note: String(formData.get("note") ?? "").trim() || null,
            });
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="action" placeholder="Action (DELETE_PROFILE, BAN_GROUP...)" className="rounded border px-3 py-2" required />
          <input name="targetType" placeholder="Target type (USER/GROUP/EVENT...)" className="rounded border px-3 py-2" required />
          <input name="targetId" placeholder="Target id" className="rounded border px-3 py-2 md:col-span-2" required />
          <textarea name="note" placeholder="Moderator note" className="rounded border px-3 py-2 md:col-span-2" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">
            Log Action
          </button>
        </form>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Moderator Audit Log</h2>
          {logs.map((log) => (
            <article key={log.id} className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">{log.action}</p>
              <p className="text-xs text-slate-500">
                {log.targetType} | {log.targetId} | by @{log.actor.username}
              </p>
              {log.note ? <p className="text-xs text-slate-400">{log.note}</p> : null}
            </article>
          ))}
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">User Petitions</h2>
          {petitions.map((petition) => (
            <article key={petition.id} className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">{petition.subject}</p>
              <p className="text-xs text-slate-500">
                @{petition.requester.username} | {petition.requester.email} | {petition.status}
              </p>
              <p className="mt-1 text-xs text-slate-300">{petition.details}</p>
            </article>
          ))}
          {petitions.length === 0 ? <p className="text-sm text-slate-500">No petitions yet.</p> : null}
        </section>
      </section>
    </AppShell>
  );
}
