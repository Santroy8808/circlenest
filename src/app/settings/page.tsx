import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import {
  InvitationManagementPanel,
} from "@/components/invitations/invitation-management-panel";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { AccountExportClient } from "@/components/settings/account-export-client";
import { AdminModeSettings } from "@/components/settings/admin-mode-settings";
import { MobileNavigationSettings } from "@/components/settings/mobile-navigation-settings";
import { NotificationDingsSettings } from "@/components/settings/notification-dings-settings";
import { StreamRulesSettings } from "@/components/settings/stream-rules-settings";
import { PetitionForm } from "@/components/settings/petition-form";
import { BillingSettings } from "@/components/settings/billing-settings";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { hasFreshSecureAreaAccess } from "@/lib/security/action-access";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";
import { resolveInvitationCreatorAccess } from "@/lib/policy/invitations";
import { canChangeFeedType, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from "@/lib/security/terms";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();
  requireSecureAreaPage(session.user.id, "/settings");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      subscriptionTier: true,
      createdAt: true,
      acceptedTermsVersion: true,
      acceptedTermsAt: true,
      deactivatedAt: true,
      deletionRequestedAt: true,
      inviteLimitException: true,
      billingSubscription: {
        select: {
          provider: true,
          providerCustomerId: true,
          providerSubscriptionId: true,
          subscriptionTier: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          trialEndsAt: true,
          pausedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const [activeInviteCount, invites] = await Promise.all([
    prisma.membershipInvitation.count({
      where: {
        inviterId: session.user.id,
        status: { in: ["PENDING", "RESUBMITTED", "PENDING_REVIEW"] },
      },
    }),
    prisma.membershipInvitation.findMany({
      where: { inviterId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        inviteeEmail: true,
        inviteeName: true,
        inviteePhone: true,
        status: true,
        reviewStatus: true,
        currentOrg: true,
        lastServiceDate: true,
        lastServiceName: true,
        isActiveScientologist: true,
        isInGoodStanding: true,
        agreedToPrivateMembershipTerms: true,
        qualificationNotes: true,
        applicationFeeAmountCents: true,
        applicationFeeCurrency: true,
        applicationFeePaidAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        rejectedAt: true,
        resubmittedAt: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const policy = resolveUserAccessPolicy(user);
  const inviteAccess = resolveInvitationCreatorAccess(user);
  const acceptedTerms = hasAcceptedCurrentTerms((user as { acceptedTermsVersion?: string | null } | null)?.acceptedTermsVersion ?? null);
  const adminRoleAssigned = await isAdminUser(session.user.id);

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <div className="card p-3">
        <h1 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Settings</h1>
        <div className="mb-3 rounded border border-[var(--border)] p-3 text-sm">
          <p className="font-medium text-[var(--text-strong)]">Terms and community rules</p>
          <p className="text-xs text-slate-300">Current version: {CURRENT_TERMS_VERSION}</p>
          <p className={`mt-1 text-xs ${acceptedTerms ? "text-emerald-300" : "text-amber-300"}`}>
            {acceptedTerms ? "Accepted." : "Not accepted yet."}
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Accepted at: {user?.acceptedTermsAt ? new Date(user.acceptedTermsAt).toLocaleString() : "Not set"}
          </p>
        </div>
        <div className="grid gap-1 text-sm">
          <Link href="/settings/theme" className="underline underline-offset-2 hover:scale-[1.02]">Theme Settings</Link>
          <Link href="/profile/edit" className="underline underline-offset-2 hover:scale-[1.02]">Profile Settings</Link>
          <Link href="/settings#security" className="underline underline-offset-2 hover:scale-[1.02]">Security</Link>
          <Link href="/settings#rules" className="underline underline-offset-2 hover:scale-[1.02]">My Rules</Link>
          <Link href="/membership" className="underline underline-offset-2 hover:scale-[1.02]">Membership Comparison</Link>
          <Link href="/blocked-users" className="underline underline-offset-2 hover:scale-[1.02]">Blocked Users</Link>
          <Link href="/settings#subscription" className="underline underline-offset-2 hover:scale-[1.02]">My Subscription</Link>
        </div>
        <MobileNavigationSettings />
        {adminRoleAssigned ? <AdminModeSettings /> : null}
        <NotificationDingsSettings />
        <StreamRulesSettings canChangeFeedType={canChangeFeedType(policy)} />
        <PetitionForm />
        <section id="subscription" className="rounded border border-[var(--border)] p-3">
          <BillingSettings
            role={user?.role ?? "MEMBER"}
            subscriptionTier={user?.subscriptionTier ?? "FREE"}
            billingSubscription={
              user?.billingSubscription
                ? {
                    provider: user.billingSubscription.provider,
                    providerCustomerId: user.billingSubscription.providerCustomerId,
                    providerSubscriptionId: user.billingSubscription.providerSubscriptionId,
                    subscriptionTier: user.billingSubscription.subscriptionTier,
                    status: user.billingSubscription.status,
                    currentPeriodStart: user.billingSubscription.currentPeriodStart?.toISOString() ?? null,
                    currentPeriodEnd: user.billingSubscription.currentPeriodEnd?.toISOString() ?? null,
                    cancelAtPeriodEnd: user.billingSubscription.cancelAtPeriodEnd,
                    canceledAt: user.billingSubscription.canceledAt?.toISOString() ?? null,
                    trialEndsAt: user.billingSubscription.trialEndsAt?.toISOString() ?? null,
                    pausedAt: user.billingSubscription.pausedAt?.toISOString() ?? null,
                    createdAt: user.billingSubscription.createdAt.toISOString(),
                    updatedAt: user.billingSubscription.updatedAt.toISOString(),
                  }
                : null
            }
          />
        </section>
        <section id="invitations" className="rounded border border-[var(--border)] p-3">
          <InvitationManagementPanel
            mode="member"
            canInvite={inviteAccess.canInvite}
            reason={inviteAccess.reason}
            inviteLimit={inviteAccess.inviteLimit}
            activeCount={activeInviteCount}
            hasInviteLimitException={inviteAccess.hasInviteLimitException}
            initialInvites={invites.map((invite) => ({
              id: invite.id,
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
          />
        </section>
        <section id="account" className="mt-3 rounded border border-[var(--border)] p-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">Account lifecycle</h2>
          <p className="mt-1 text-xs text-slate-300">Deactivation and deletion requests are handled in secure area flows.</p>
          <div className="mt-2 rounded border border-[var(--border)] bg-[color:var(--card-alt)] p-2 text-xs text-slate-200">
            <p>Deactivated: {user?.deactivatedAt ? new Date(user.deactivatedAt).toLocaleString() : "No"}</p>
            <p>Deletion requested: {user?.deletionRequestedAt ? new Date(user.deletionRequestedAt).toLocaleString() : "No"}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={async () => {
              "use server";
              const { auth } = await import("@/auth");
              const { prisma } = await import("@/lib/db/prisma");
              const { revalidatePath } = await import("next/cache");
              const current = await auth();
              if (!current?.user?.id) return;
              if (!hasFreshSecureAreaAccess(current.user.id)) return;
              await prisma.user.update({
                where: { id: current.user.id },
                data: { deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
              });
              await prisma.authSecurityEvent.create({
                data: {
                  userId: current.user.id,
                  eventType: "ACCOUNT_DEACTIVATED",
                  metadata: JSON.stringify({ requestedAt: new Date().toISOString() }),
                },
              });
              revalidatePath("/settings");
            }}>
              <button type="submit" className="rounded border border-[var(--border)] px-3 py-2 text-sm">Deactivate account</button>
            </form>
            <form action={async () => {
              "use server";
              const { auth } = await import("@/auth");
              const { prisma } = await import("@/lib/db/prisma");
              const { revalidatePath } = await import("next/cache");
              const current = await auth();
              if (!current?.user?.id) return;
              if (!hasFreshSecureAreaAccess(current.user.id)) return;
              await prisma.user.update({
                where: { id: current.user.id },
                data: { deletionRequestedAt: new Date() },
              });
              await prisma.authSecurityEvent.create({
                data: {
                  userId: current.user.id,
                  eventType: "ACCOUNT_DELETION_REQUESTED",
                  metadata: JSON.stringify({ requestedAt: new Date().toISOString() }),
                },
              });
              revalidatePath("/settings");
            }}>
              <button type="submit" className="rounded border border-red-400 px-3 py-2 text-sm text-red-300">Request deletion</button>
            </form>
            <AccountExportClient />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
