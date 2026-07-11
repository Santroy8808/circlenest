import { AuditSeverity, MembershipTier, Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { getTierPolicy } from "@/modules/membership-policy/policy";

const MODULE_KEY = "admin-status-change";

export const statusChangeSchema = z.object({
  userIdentifier: z.string().trim().min(1).max(160),
  targetTier: z.nativeEnum(MembershipTier),
  reason: z.string().trim().min(5).max(500)
});

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return isAdminRole(user?.role);
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export async function findStatusChangeAccount(identifier: string) {
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
      role: true,
      deactivatedAt: true,
      profile: {
        select: {
          displayName: true
        }
      },
      membership: {
        select: {
          tier: true,
          storageLimitBytes: true,
          platformCredits: true
        }
      },
      tierUpgradeEligibilities: {
        where: {
          tier: MembershipTier.ORG,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  });

  if (!user) return null;

  const currentTier = user.membership?.tier ?? MembershipTier.FREE;
  const policy = getTierPolicy(currentTier);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    role: user.role,
    suspended: Boolean(user.deactivatedAt),
    tier: currentTier,
    tierName: policy.displayName,
    orgUpgradeEligible: user.tierUpgradeEligibilities.length > 0,
    storageLimitBytes: (user.membership?.storageLimitBytes ?? BigInt(policy.limits.storageLimitBytes)).toString(),
    platformCredits: user.membership?.platformCredits ?? 0
  };
}

export async function changeMembershipStatus(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = statusChangeSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid status change." };
  }

  const target = await findStatusChangeAccount(parsed.data.userIdentifier);

  if (!target) {
    return { ok: false as const, error: "User was not found." };
  }

  if (target.tier === parsed.data.targetTier) {
    return { ok: false as const, error: "Account is already on that membership tier." };
  }

  const targetPolicy = getTierPolicy(parsed.data.targetTier);
  const previousTier = target.tier;

  if (parsed.data.targetTier === MembershipTier.ORG) {
    await prisma.$transaction(async (tx) => {
      await tx.membershipTierUpgradeEligibility.upsert({
        where: {
          userId_tier: {
            userId: target.id,
            tier: MembershipTier.ORG
          }
        },
        update: {
          active: true,
          reason: parsed.data.reason,
          expiresAt: null,
          createdByUserId: actorUserId
        },
        create: {
          userId: target.id,
          tier: MembershipTier.ORG,
          reason: parsed.data.reason,
          createdByUserId: actorUserId
        }
      });

      await tx.adminAction.create({
        data: {
          actorUserId,
          actionKey: "status-change",
          module: MODULE_KEY,
          status: "completed",
          metadata: {
            targetUserId: target.id,
            previousTier,
            targetTier: parsed.data.targetTier,
            action: "grant_org_upgrade_eligibility",
            reason: parsed.data.reason
          } as Prisma.InputJsonObject
        }
      });
    });

    await writeAuditLog({
      actorUserId,
      module: MODULE_KEY,
      action: "membership.org_upgrade_eligibility.granted",
      targetType: "User",
      targetId: target.id,
      severity: AuditSeverity.warning,
      metadata: {
        previousTier,
        targetTier: MembershipTier.ORG,
        reason: parsed.data.reason
      } as Prisma.InputJsonObject
    });
    await diagnostics.info(MODULE_KEY, "Admin granted Org upgrade eligibility.", {
      actorUserId,
      targetUserId: target.id,
      previousTier,
      targetTier: MembershipTier.ORG
    });

    return {
      ok: true as const,
      eligibilityGranted: true,
      account: {
        ...target,
        orgUpgradeEligible: true
      }
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.upsert({
      where: { userId: target.id },
      update: {
        tier: parsed.data.targetTier,
        storageLimitBytes: BigInt(targetPolicy.limits.storageLimitBytes)
      },
      create: {
        userId: target.id,
        tier: parsed.data.targetTier,
        storageLimitBytes: BigInt(targetPolicy.limits.storageLimitBytes)
      },
      select: {
        tier: true,
        storageLimitBytes: true,
        platformCredits: true
      }
    });

    await tx.adminAction.create({
      data: {
        actorUserId,
        actionKey: "status-change",
        module: MODULE_KEY,
        status: "completed",
        metadata: {
          targetUserId: target.id,
          previousTier,
          targetTier: parsed.data.targetTier,
          reason: parsed.data.reason
        } as Prisma.InputJsonObject
      }
    });

    return membership;
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "membership.status.changed",
    targetType: "User",
    targetId: target.id,
    severity: AuditSeverity.warning,
    metadata: {
      previousTier,
      targetTier: updated.tier,
      reason: parsed.data.reason,
      storageLimitBytes: updated.storageLimitBytes.toString()
    } as Prisma.InputJsonObject
  });
  await diagnostics.info(MODULE_KEY, "Admin changed membership status.", {
    actorUserId,
    targetUserId: target.id,
    previousTier,
    targetTier: updated.tier
  });

  return {
    ok: true as const,
    account: {
      ...target,
      tier: updated.tier,
      tierName: targetPolicy.displayName,
      storageLimitBytes: updated.storageLimitBytes.toString(),
      platformCredits: updated.platformCredits
    }
  };
}
