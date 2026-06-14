import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { getWalletSummary, requestWithdrawal } from "@/lib/funds/ledger";

function parseAmountCents(value: unknown) {
  if (typeof value === "number") return Math.round(value * 100);
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { requestedAt: "desc" },
    take: 25,
    include: { batch: { select: { id: true, batchKey: true, scheduledFor: true, status: true } } },
  });

  return NextResponse.json({
    withdrawals: withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      amountCents: withdrawal.amountCents,
      currency: withdrawal.currency,
      status: withdrawal.status,
      requestedAt: withdrawal.requestedAt.toISOString(),
      reviewedAt: withdrawal.reviewedAt?.toISOString() ?? null,
      processorProvider: withdrawal.processorProvider,
      processorTransferId: withdrawal.processorTransferId,
      failureReason: withdrawal.failureReason,
      holdReason: withdrawal.holdReason,
      batch: withdrawal.batch
        ? {
            id: withdrawal.batch.id,
            batchKey: withdrawal.batch.batchKey,
            scheduledFor: withdrawal.batch.scheduledFor.toISOString(),
            status: withdrawal.batch.status,
          }
        : null,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await isAdminUser(session.user.id);
  if (!isAdmin) {
    const businessProfile = await prisma.businessProfile.findUnique({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        complianceProfile: {
          select: {
            processorOnboardingStatus: true,
            processorPayoutsEnabled: true,
          },
        },
      },
    });

    if (!businessProfile?.id) {
      return NextResponse.json({ error: "Create your Biz profile before requesting withdrawals." }, { status: 403 });
    }

    if (!businessProfile.complianceProfile?.processorPayoutsEnabled || businessProfile.complianceProfile.processorOnboardingStatus !== "COMPLETE") {
      return NextResponse.json(
        {
          error: "Processor payouts must be fully enabled before withdrawals can be requested.",
        },
        { status: 403 },
      );
    }
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const amountCents = parseAmountCents(payload.amount);
  if (amountCents <= 0) {
    return NextResponse.json({ error: "Enter a withdrawal amount greater than zero." }, { status: 400 });
  }

  try {
    const withdrawal = await requestWithdrawal(session.user.id, amountCents);
    return NextResponse.json(
      {
        withdrawal: {
          id: withdrawal.id,
          amountCents: withdrawal.amountCents,
          currency: withdrawal.currency,
          status: withdrawal.status,
          requestedAt: withdrawal.requestedAt.toISOString(),
        },
        wallet: await getWalletSummary(session.user.id),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not request withdrawal." }, { status: 400 });
  }
}
