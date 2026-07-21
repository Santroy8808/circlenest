import { AuditSeverity, MembershipTier, Prisma } from "@prisma/client";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";
import { setMembershipPolicyOverride } from "@/modules/membership-policy/membership-policy.service";
import { getTierPolicy, isOperationalMembershipTier } from "@/modules/membership-policy/policy";

const MODULE_KEY = "admin-status-change";

export const statusChangeSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  userIdentifier: z.string().trim().min(1).max(160),
  targetTier: z.nativeEnum(MembershipTier),
  reason: z.string().trim().min(5).max(500)
});

export const invitePermissionChangeSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  userIdentifier: z.string().trim().min(1).max(160),
  allowed: z.boolean(),
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

async function authorizeAccountTarget(actorUserId: string, target: { id: string; role: Parameters<typeof isAdminRole>[0] }) {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, deactivatedAt: true }
  });
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) return false;
  return evaluateAdminActorTarget({
    actorUserId: actor.id,
    actorRole: actor.role,
    targetUserId: target.id,
    targetRole: target.role
  }).allowed;
}

async function getCommandState(
  commandId: string,
  actorUserId: string,
  action: string,
  targetUserId: string,
  commandFingerprint: string
) {
  const audit = await findAuditLogByOperationId(commandId);
  if (!audit) return "new" as const;
  return isMatchingCommandFingerprint(audit, {
    actorUserId,
    action,
    target: { type: "User", id: targetUserId },
    fingerprint: commandFingerprint
  })
    ? "replay" as const
    : "conflict" as const;
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
      membershipOverrides: {
        where: {
          featureKey: { in: ["invites.send", "invites.bulkSend"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        select: { featureKey: true, allowed: true }
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
    canSendInvites: isAdminRole(user.role) || (user.membershipOverrides.find((override) => override.featureKey === "invites.send")?.allowed ?? policy.features["invites.send"]),
    canBulkSendInvites: isAdminRole(user.role) || (user.membershipOverrides.find((override) => override.featureKey === "invites.bulkSend")?.allowed ?? policy.features["invites.bulkSend"]),
    orgUpgradeEligible: user.tierUpgradeEligibilities.length > 0,
    storageLimitBytes: (user.membership?.storageLimitBytes ?? BigInt(policy.limits.storageLimitBytes)).toString(),
    platformCredits: user.membership?.platformCredits ?? 0
  };
}

export async function changeInvitePermission(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = invitePermissionChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite permission change." };
  }

  const target = await findStatusChangeAccount(parsed.data.userIdentifier);
  if (!target) return { ok: false as const, error: "User was not found." };
  if (!(await authorizeAccountTarget(actorUserId, target))) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }
  const action = "membership.invite_permission.changed";
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target: { type: "User", id: target.id },
    payload: {
      featureKey: "invites.send",
      allowed: parsed.data.allowed,
      reason: parsed.data.reason
    }
  });
  const commandState = await getCommandState(parsed.data.commandId, actorUserId, action, target.id, commandFingerprint);
  if (commandState === "replay") {
    return { ok: true as const, account: target, replayed: true as const };
  }
  if (commandState === "conflict") return { ok: false as const, error: "That administrator command id has already been used." };

  try {
    await prisma.$transaction(async (tx) => {
      const result = await setMembershipPolicyOverride({
        actorUserId,
        targetUserId: target.id,
        featureKey: "invites.send",
        allowed: parsed.data.allowed,
        reason: parsed.data.reason
      }, {
        writer: tx,
        writeGenericAudit: false
      });
      if (!result.ok) throw new Error(result.error);

      await writeAuditLog({
        operationId: parsed.data.commandId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.warning,
        before: { allowed: target.canSendInvites },
        after: { allowed: parsed.data.allowed },
        metadata: { commandFingerprint, featureKey: "invites.send", reason: parsed.data.reason }
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentState = await getCommandState(
        parsed.data.commandId,
        actorUserId,
        action,
        target.id,
        commandFingerprint
      );
      if (concurrentState === "replay") {
        const account = await findStatusChangeAccount(parsed.data.userIdentifier);
        return { ok: true as const, account: account ?? target, replayed: true as const };
      }
      if (concurrentState === "conflict") {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }

  return {
    ok: true as const,
    account: {
      ...target,
      canSendInvites: parsed.data.allowed
    },
    replayed: false as const
  };
}

export async function changeBulkInvitePermission(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = invitePermissionChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid bulk invite permission change." };
  }

  const target = await findStatusChangeAccount(parsed.data.userIdentifier);
  if (!target) return { ok: false as const, error: "User was not found." };
  if (!(await authorizeAccountTarget(actorUserId, target))) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }
  const action = "membership.bulk_invite_permission.changed";
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target: { type: "User", id: target.id },
    payload: {
      featureKey: "invites.bulkSend",
      allowed: parsed.data.allowed,
      reason: parsed.data.reason
    }
  });
  const commandState = await getCommandState(parsed.data.commandId, actorUserId, action, target.id, commandFingerprint);
  if (commandState === "replay") {
    return { ok: true as const, account: target, replayed: true as const };
  }
  if (commandState === "conflict") return { ok: false as const, error: "That administrator command id has already been used." };

  try {
    await prisma.$transaction(async (tx) => {
      const result = await setMembershipPolicyOverride({
        actorUserId,
        targetUserId: target.id,
        featureKey: "invites.bulkSend",
        allowed: parsed.data.allowed,
        reason: parsed.data.reason
      }, {
        writer: tx,
        writeGenericAudit: false
      });
      if (!result.ok) throw new Error(result.error);

      await writeAuditLog({
        operationId: parsed.data.commandId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.warning,
        before: { allowed: target.canBulkSendInvites },
        after: { allowed: parsed.data.allowed },
        metadata: { commandFingerprint, featureKey: "invites.bulkSend", reason: parsed.data.reason }
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentState = await getCommandState(
        parsed.data.commandId,
        actorUserId,
        action,
        target.id,
        commandFingerprint
      );
      if (concurrentState === "replay") {
        const account = await findStatusChangeAccount(parsed.data.userIdentifier);
        return { ok: true as const, account: account ?? target, replayed: true as const };
      }
      if (concurrentState === "conflict") {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }

  return {
    ok: true as const,
    account: {
      ...target,
      canBulkSendInvites: parsed.data.allowed
    },
    replayed: false as const
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

  if (!isOperationalMembershipTier(parsed.data.targetTier)) {
    return { ok: false as const, error: "That membership tier is currently disabled." };
  }

  const target = await findStatusChangeAccount(parsed.data.userIdentifier);

  if (!target) {
    return { ok: false as const, error: "User was not found." };
  }
  if (!(await authorizeAccountTarget(actorUserId, target))) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }
  const action = "membership.status.changed";
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target: { type: "User", id: target.id },
    payload: {
      targetTier: parsed.data.targetTier,
      reason: parsed.data.reason
    }
  });
  const commandState = await getCommandState(parsed.data.commandId, actorUserId, action, target.id, commandFingerprint);
  if (commandState === "replay") {
    return { ok: true as const, account: target, replayed: true as const };
  }
  if (commandState === "conflict") return { ok: false as const, error: "That administrator command id has already been used." };

  if (target.tier === parsed.data.targetTier) {
    return { ok: false as const, error: "Account is already on that membership tier." };
  }

  const targetPolicy = getTierPolicy(parsed.data.targetTier);
  const previousTier = target.tier;

  if (parsed.data.targetTier === MembershipTier.ORG) {
    try {
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
        await writeAuditLog({
          operationId: parsed.data.commandId,
          actorUserId,
          module: MODULE_KEY,
          action,
          targetType: "User",
          targetId: target.id,
          severity: AuditSeverity.warning,
          before: { tier: previousTier, orgUpgradeEligible: target.orgUpgradeEligible },
          after: { tier: previousTier, orgUpgradeEligible: true },
          metadata: {
            commandFingerprint,
            requestedTargetTier: MembershipTier.ORG,
            effect: "grant_org_upgrade_eligibility",
            reason: parsed.data.reason
          }
        }, tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrentState = await getCommandState(
          parsed.data.commandId,
          actorUserId,
          action,
          target.id,
          commandFingerprint
        );
        if (concurrentState === "replay") {
          const account = await findStatusChangeAccount(parsed.data.userIdentifier);
          return { ok: true as const, eligibilityGranted: true, account: account ?? target, replayed: true as const };
        }
        if (concurrentState === "conflict") {
          return { ok: false as const, error: "That administrator command id has already been used." };
        }
      }
      throw error;
    }
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
      },
      replayed: false as const
    };
  }

  let updated: { tier: MembershipTier; storageLimitBytes: bigint; platformCredits: number };
  try {
    updated = await prisma.$transaction(async (tx) => {
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

      await writeAuditLog({
        operationId: parsed.data.commandId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.warning,
        before: { tier: previousTier, storageLimitBytes: target.storageLimitBytes },
        after: { tier: membership.tier, storageLimitBytes: membership.storageLimitBytes.toString() },
        metadata: { commandFingerprint, reason: parsed.data.reason }
      }, tx);

      return membership;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentState = await getCommandState(
        parsed.data.commandId,
        actorUserId,
        action,
        target.id,
        commandFingerprint
      );
      if (concurrentState === "replay") {
        const account = await findStatusChangeAccount(parsed.data.userIdentifier);
        return { ok: true as const, account: account ?? target, replayed: true as const };
      }
      if (concurrentState === "conflict") {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }
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
    },
    replayed: false as const
  };
}
