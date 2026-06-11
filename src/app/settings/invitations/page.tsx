import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { InvitationManagementPanel } from "@/components/invitations/invitation-management-panel";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { prisma } from "@/lib/db/prisma";
import { resolveInvitationCreatorAccess } from "@/lib/policy/invitations";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsInvitationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/invitations");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      subscriptionTier: true,
      createdAt: true,
      inviteLimitException: true,
    },
  });
  const inviteAccess = resolveInvitationCreatorAccess(user);
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

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card p-4">
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
    </AppShell>
  );
}
