import { AuditSeverity, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";

const MODULE_KEY = "admin-platform-credits";

export const platformCreditAdjustmentSchema = z.object({
  userIdentifier: z.string().trim().min(1).max(160),
  amount: z.coerce.number().int().min(-100000).max(100000).refine((value) => value !== 0, "Credit adjustment cannot be zero."),
  reason: z.string().trim().min(5).max(500)
});

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role === UserRole.ADMIN;
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export async function findCreditAccount(identifier: string) {
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) return null;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }]
    },
    select: {
      id: true,
      email: true,
      username: true,
      profile: {
        select: {
          displayName: true
        }
      },
      membership: {
        select: {
          tier: true,
          platformCredits: true
        }
      }
    }
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    tier: user.membership?.tier ?? "FREE",
    platformCredits: user.membership?.platformCredits ?? 0
  };
}

export async function getPlatformCreditsAdminView() {
  const recentLedger = await prisma.adCreditLedgerEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: {
        select: {
          email: true,
          username: true,
          profile: {
            select: {
              displayName: true
            }
          }
        }
      }
    }
  });

  return {
    recentLedger: recentLedger.map((entry) => ({
      id: entry.id,
      userLabel: entry.user.profile?.displayName ?? entry.user.username ?? entry.user.email,
      amount: entry.amount,
      reason: entry.reason,
      sourceType: entry.sourceType,
      createdAt: entry.createdAt.toISOString()
    }))
  };
}

export async function adjustPlatformCredits(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = platformCreditAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid credit adjustment." };
  }

  const target = await findCreditAccount(parsed.data.userIdentifier);

  if (!target) {
    return { ok: false as const, error: "User was not found." };
  }

  if (target.platformCredits + parsed.data.amount < 0) {
    return { ok: false as const, error: "This adjustment would make platform credits negative." };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.upsert({
      where: { userId: target.id },
      update: {
        platformCredits: {
          increment: parsed.data.amount
        }
      },
      create: {
        userId: target.id,
        platformCredits: parsed.data.amount
      },
      select: {
        tier: true,
        platformCredits: true
      }
    });

    await tx.adCreditLedgerEntry.create({
      data: {
        userId: target.id,
        amount: parsed.data.amount,
        reason: `Admin platform credit adjustment: ${parsed.data.reason}`,
        sourceType: "AdminCreditAdjustment",
        sourceId: actorUserId
      }
    });

    return membership;
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "platform-credits.adjusted",
    targetType: "User",
    targetId: target.id,
    severity: AuditSeverity.warning,
    metadata: {
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      resultingBalance: updated.platformCredits
    } as Prisma.InputJsonObject
  });
  await diagnostics.info(MODULE_KEY, "Admin adjusted platform credits.", {
    actorUserId,
    targetUserId: target.id,
    amount: parsed.data.amount,
    resultingBalance: updated.platformCredits
  });

  return {
    ok: true as const,
    account: {
      ...target,
      tier: updated.tier,
      platformCredits: updated.platformCredits
    }
  };
}
