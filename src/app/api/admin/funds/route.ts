import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const [realLedger, platformLedger, testLedger, withdrawals, batches] = await Promise.all([
    prisma.realMoneyLedgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, email: true, username: true } } },
    }),
    prisma.platformCreditLedgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, email: true, username: true } } },
    }),
    process.env.THETA_ENABLE_TEST_MONEY === "true" && process.env.NODE_ENV !== "production"
      ? prisma.testMoneyLedgerEntry.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { user: { select: { id: true, email: true, username: true } } },
        })
      : Promise.resolve([]),
    prisma.withdrawalRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, email: true, username: true } },
        batch: { select: { id: true, batchKey: true, scheduledFor: true, status: true } },
      },
    }),
    prisma.withdrawalBatch.findMany({
      orderBy: { scheduledFor: "desc" },
      take: 25,
      include: { _count: { select: { withdrawals: true } } },
    }),
  ]);

  return NextResponse.json({
    boundary: "Admins can view ledgers and manage withdrawal review status, but cannot create real-money credits or manually complete processor payouts.",
    realLedger: realLedger.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    platformLedger: platformLedger.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    testLedger: testLedger.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    withdrawals: withdrawals.map((withdrawal) => ({
      ...withdrawal,
      requestedAt: withdrawal.requestedAt.toISOString(),
      reviewedAt: withdrawal.reviewedAt?.toISOString() ?? null,
      updatedAt: withdrawal.updatedAt.toISOString(),
      batch: withdrawal.batch ? { ...withdrawal.batch, scheduledFor: withdrawal.batch.scheduledFor.toISOString() } : null,
    })),
    batches: batches.map((batch) => ({
      ...batch,
      scheduledFor: batch.scheduledFor.toISOString(),
      sentToProcessorAt: batch.sentToProcessorAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    })),
  });
}
