import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

const adminInvitationActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REVOKE", "EXPIRE", "RESUBMIT"]),
  note: z.string().max(500).optional().nullable(),
});

function invitationSelect() {
  return {
    id: true,
    inviterId: true,
    inviteeUserId: true,
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
    reviewedById: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

export async function PATCH(request: Request, context: { params: { invitationId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const { invitationId } = context.params;
  const body = adminInvitationActionSchema.safeParse(await request.json());
  if (!body.success) {
    const flattened = body.error.flatten();
    const firstFieldMessage =
      Object.values(flattened.fieldErrors)
        .flat()
        .find((message): message is string => typeof message === "string" && message.trim().length > 0) ??
      body.error.issues[0]?.message;

    return NextResponse.json(
      {
        error: firstFieldMessage ?? "Invalid input",
        fieldErrors: flattened.fieldErrors,
      },
      { status: 400 },
    );
  }

  const invitation = await prisma.membershipInvitation.findUnique({
    where: { id: invitationId },
    select: invitationSelect(),
  });
  if (!invitation) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const now = new Date();
  let nextStatus = invitation.status;
  let nextReviewStatus = invitation.reviewStatus;
  let nextFields: Record<string, unknown> = {};
  let actionName = "";

  switch (body.data.action) {
    case "APPROVE":
      if (["REJECTED", "REVOKED", "ACCEPTED"].includes(invitation.status)) {
        return NextResponse.json({ error: "Invite cannot be approved." }, { status: 409 });
      }
      nextReviewStatus = "APPROVED";
      nextFields = {
        reviewedAt: now,
        reviewedById: session.user.id,
        status: "PENDING",
        reviewStatus: nextReviewStatus,
      };
      actionName = "APPROVE_INVITE";
      break;
    case "REJECT":
      nextStatus = "REJECTED";
      nextReviewStatus = "REJECTED";
      nextFields = {
        status: nextStatus,
        reviewStatus: nextReviewStatus,
        rejectedAt: now,
        reviewedAt: now,
        reviewedById: session.user.id,
      };
      actionName = "REJECT_INVITE";
      break;
    case "REVOKE":
      nextStatus = "REVOKED";
      nextFields = {
        status: nextStatus,
        revokedAt: now,
      };
      actionName = "REVOKE_INVITE";
      break;
    case "EXPIRE":
      nextStatus = "EXPIRED";
      nextFields = {
        status: nextStatus,
      };
      actionName = "EXPIRE_INVITE";
      break;
    case "RESUBMIT":
      if (invitation.status !== "EXPIRED") {
        return NextResponse.json({ error: "Only expired invites can be resubmitted." }, { status: 409 });
      }
      nextStatus = "PENDING_REVIEW";
      nextReviewStatus = "PENDING";
      nextFields = {
        status: nextStatus,
        reviewStatus: nextReviewStatus,
        resubmittedAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      };
      actionName = "RESUBMIT_INVITE";
      break;
  }

  const updated = await prisma.membershipInvitation.update({
    where: { id: invitation.id },
    data: {
      ...nextFields,
    },
    select: invitationSelect(),
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: actionName,
    targetType: "MEMBERSHIP_INVITATION",
    targetId: invitation.id,
    note: body.data.note ?? invitation.inviteeEmail,
  });

  return NextResponse.json({ invitation: updated });
}
