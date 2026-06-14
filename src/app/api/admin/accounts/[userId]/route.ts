import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/admin-api-guards";
import { resendEmailVerification, resetUserTwoFactor, restoreSuspendedUserAccount, revokeUserSessions, suspendUserAccount } from "@/lib/admin/admin-ops";
import { prisma } from "@/lib/db/prisma";

const ACTIONS = new Set(["SUSPEND", "RESTORE", "REVOKE_SESSIONS", "RESEND_EMAIL_VERIFICATION", "RESET_2FA"]);

export async function GET(_: Request, { params }: { params: { userId: string } }) {
  const gate = await requireAdminApiAccess();
  if (gate.error) return gate.error;

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      role: true,
      subscriptionTier: true,
      deactivatedAt: true,
      deletionRequestedAt: true,
      acceptedTermsVersion: true,
      acceptedTermsAt: true,
      createdAt: true,
      businessProfile: {
        select: {
          id: true,
          businessName: true,
          status: true,
          verificationStatus: true,
          complianceProfile: { select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true } },
        },
      },
      twoFactorConfig: { select: { enabled: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [securityEvents, realBalance, platformCredits] = await Promise.all([
    prisma.authSecurityEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.realMoneyLedgerEntry.aggregate({ where: { userId: user.id }, _sum: { amountCents: true } }),
    prisma.platformCreditLedgerEntry.aggregate({ where: { userId: user.id }, _sum: { credits: true } }),
  ]);

  return NextResponse.json({
    user: {
      ...user,
      deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
      acceptedTermsAt: user.acceptedTermsAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      twoFactorConfig: user.twoFactorConfig
        ? {
            enabled: user.twoFactorConfig.enabled,
            createdAt: user.twoFactorConfig.createdAt.toISOString(),
            updatedAt: user.twoFactorConfig.updatedAt.toISOString(),
          }
        : null,
    },
    ledgerSummary: {
      realMoneyBalanceCents: realBalance._sum.amountCents ?? 0,
      platformCreditBalance: platformCredits._sum.credits ?? 0,
    },
    securityEvents: securityEvents.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  });
}

export async function PATCH(request: Request, { params }: { params: { userId: string } }) {
  const gate = await requireAdminApiAccess();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string };
  const action = String(body.action ?? "").trim().toUpperCase();
  const reason = String(body.reason ?? "").trim() || null;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unsupported account action." }, { status: 400 });

  if (action === "SUSPEND") return NextResponse.json({ result: await suspendUserAccount({ actorUserId: gate.userId, targetUserId: params.userId, reason }) });
  if (action === "RESTORE") return NextResponse.json({ result: await restoreSuspendedUserAccount({ actorUserId: gate.userId, targetUserId: params.userId, reason }) });
  if (action === "REVOKE_SESSIONS") return NextResponse.json({ result: await revokeUserSessions({ actorUserId: gate.userId, targetUserId: params.userId, reason }) });
  if (action === "RESEND_EMAIL_VERIFICATION") return NextResponse.json({ result: await resendEmailVerification({ actorUserId: gate.userId, targetUserId: params.userId }) });
  return NextResponse.json({ result: await resetUserTwoFactor({ actorUserId: gate.userId, targetUserId: params.userId, reason }) });
}
