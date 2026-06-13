import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { logAdminAction } from "@/lib/auth/admin";
import {
  INVITATION_EXPIRY_DAYS,
  isInvitationLimitReached,
  normalizeInvitationReviewStatus,
  resolveInvitationCreatorAccess,
} from "@/lib/policy/invitations";
import { randomToken, sha256 } from "@/lib/security/tokens";

const createInvitationSchema = z.object({
  inviteeEmail: z.string().email(),
  inviteeName: z.string().min(1).max(120),
  inviteePhone: z.string().max(40).optional().nullable(),
  currentOrg: z.string().min(1).max(200),
  lastServiceDate: z.string().min(1).max(100),
  lastServiceName: z.string().min(1).max(200),
  isActiveScientologist: z.boolean(),
  isInGoodStanding: z.boolean(),
  agreedToPrivateMembershipTerms: z.boolean(),
  qualificationNotes: z.string().max(2000).optional().nullable(),
  applicationFeeAmountCents: z.number().int().nonnegative().optional().nullable(),
  applicationFeeCurrency: z.string().min(3).max(3).optional().nullable(),
});

const ACTIVE_INVITATION_STATUSES: string[] = ["PENDING", "RESUBMITTED", "PENDING_REVIEW"];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      subscriptionTier: true,
      createdAt: true,
      inviteLimitException: true,
    },
  });
  if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const access = resolveInvitationCreatorAccess(currentUser);
  if (!access.canInvite) {
    return NextResponse.json({ error: access.reason ?? "Invite access is not available." }, { status: 403 });
  }

  const parsed = createInvitationSchema.safeParse(await request.json());
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const firstFieldMessage =
      Object.values(flattened.fieldErrors)
        .flat()
        .find((message): message is string => typeof message === "string" && message.trim().length > 0) ??
      parsed.error.issues[0]?.message;

    return NextResponse.json(
      {
        error: firstFieldMessage ?? "Invalid input",
        fieldErrors: flattened.fieldErrors,
      },
      { status: 400 },
    );
  }

  if (!parsed.data.agreedToPrivateMembershipTerms) {
    return NextResponse.json({ error: "Terms agreement required." }, { status: 400 });
  }

  const inviteeEmail = parsed.data.inviteeEmail.trim().toLowerCase();
  const inviteeName = parsed.data.inviteeName.trim();
  const inviteePhone = parsed.data.inviteePhone?.trim() || null;
  const qualificationNotes = parsed.data.qualificationNotes?.trim() || null;
  const applicationFeeCurrency = parsed.data.applicationFeeCurrency?.trim().toUpperCase() || null;

  const activeInviteCount = await prisma.membershipInvitation.count({
      where: {
        inviterId: session.user.id,
        status: { in: ACTIVE_INVITATION_STATUSES },
      },
  });
  if (isInvitationLimitReached(activeInviteCount, access)) {
    return NextResponse.json({ error: "Invite limit reached." }, { status: 429 });
  }

  const duplicateInvite = await prisma.membershipInvitation.findFirst({
      where: {
        inviterId: session.user.id,
        inviteeEmail,
        status: { in: ACTIVE_INVITATION_STATUSES },
      },
    select: { id: true },
  });
  if (duplicateInvite) {
    return NextResponse.json({ error: "Invite already exists." }, { status: 409 });
  }

  const inviteeUser = await prisma.user.findUnique({
    where: { email: inviteeEmail },
    select: { id: true },
  });

  const inviteCode = randomToken(24);
  const tokenHash = sha256(inviteCode);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.membershipInvitation.create({
    data: {
      inviterId: session.user.id,
      inviteeUserId: inviteeUser?.id ?? null,
      inviteeEmail,
      inviteeName,
      inviteePhone,
      tokenHash,
      status: "PENDING_REVIEW",
      reviewStatus: normalizeInvitationReviewStatus("PENDING"),
      currentOrg: parsed.data.currentOrg.trim(),
      lastServiceDate: parsed.data.lastServiceDate.trim(),
      lastServiceName: parsed.data.lastServiceName.trim(),
      isActiveScientologist: parsed.data.isActiveScientologist,
      isInGoodStanding: parsed.data.isInGoodStanding,
      agreedToPrivateMembershipTerms: true,
      qualificationNotes,
      applicationFeeAmountCents: parsed.data.applicationFeeAmountCents ?? null,
      applicationFeeCurrency,
      applicationFeePaidAt: null,
      expiresAt,
    },
    select: {
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
    },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: "CREATE_INVITE",
    targetType: "MEMBERSHIP_INVITATION",
    targetId: invitation.id,
    note: inviteeEmail,
  });

  return NextResponse.json({ invitation, inviteCode });
}
