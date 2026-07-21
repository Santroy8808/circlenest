import { createHash, createHmac } from "node:crypto";
import { AuditSeverity, MembershipTier, Prisma, UserRole, type AuditLog } from "@prisma/client";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";
import {
  AdminTargetAuthorizationError,
  lockAndAuthorizeAdminActor,
  lockAndAuthorizeAdminActorTarget
} from "@/modules/admin-moderation/account-target-authorization";
import { createMemberAccount } from "@/modules/auth-security/auth-security.service";
import { hashPassword, validatePasswordStrength } from "@/modules/auth-security/password";
import { normalizeFreeAccountInviteCode } from "@/modules/membership-policy/free-account-invites.service";
import { isOperationalMembershipTier } from "@/modules/membership-policy/policy";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";

const MODULE_KEY = "admin-account-support";

export const adminCreateUserSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  password: z.string().min(1),
  tier: z
    .nativeEnum(MembershipTier)
    .refine(isOperationalMembershipTier, "Only operational membership tiers may be assigned.")
    .default(MembershipTier.FREE),
  inviteCode: z.string().optional().or(z.literal("")),
  reason: z.string().min(3).max(240)
});

export const adminResetPasswordSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  userIdentifier: z.string().trim().min(2).max(180),
  password: z.string().min(1),
  reason: z.string().min(3).max(240)
});

export function adminPasswordResetPasswordDigest(password: string, secret: string) {
  return createHmac("sha256", secret)
    .update("theta-space:admin-password-reset:v1\0", "utf8")
    .update(password, "utf8")
    .digest("hex");
}

export function adminPasswordResetCommandFingerprint(input: {
  actorUserId: string;
  targetUserId: string;
  reason: string;
  passwordDigest: string;
}) {
  return createCommandFingerprint({
    actorUserId: input.actorUserId,
    action: "password.reset",
    target: { type: "User", id: input.targetUserId },
    payload: {
      reason: input.reason.trim(),
      passwordDigest: input.passwordDigest
    }
  });
}

export function isMatchingAdminPasswordResetReplay(
  replay: Pick<AuditLog, "actorUserId" | "action" | "targetType" | "targetId" | "metadata">,
  actorUserId: string,
  targetUserId: string,
  commandFingerprint: string
) {
  return isMatchingCommandFingerprint(replay, {
    actorUserId,
    action: "password.reset",
    target: { type: "User", id: targetUserId },
    fingerprint: commandFingerprint
  });
}

async function findUserByIdentifier(identifier: string) {
  const normalized = identifier.trim().replace(/^@/, "").toLowerCase();

  return prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }]
    },
    include: {
      profile: true,
      membership: true
    }
  });
}

function userLabel(user: { email: string; username: string; profile?: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username ?? user.email;
}

type PasswordResetTarget = {
  id: string;
  email: string;
  username: string;
  profile?: { displayName: string | null } | null;
};

export async function resetAccountPasswordInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    target: PasswordResetTarget;
    passwordHash: string;
    commandId: string;
    commandFingerprint: string;
    reason: string;
    changedAt?: Date;
  }
) {
  await lockAndAuthorizeAdminActorTarget(transaction, input.actorUserId, input.target.id);
  const currentPasswordState = await transaction.user.findUniqueOrThrow({
    where: { id: input.target.id },
    select: { sessionVersion: true, lastPasswordChangedAt: true }
  });
  const changedAt = input.changedAt ?? new Date();
  const updated = await transaction.user.update({
    where: { id: input.target.id },
    data: {
      passwordHash: input.passwordHash,
      lastPasswordChangedAt: changedAt,
      failedLoginCount: 0,
      sessionVersion: { increment: 1 }
    },
    select: { sessionVersion: true, lastPasswordChangedAt: true }
  });

  await writeAuditLog({
    operationId: input.commandId,
    actorUserId: input.actorUserId,
    module: MODULE_KEY,
    action: "password.reset",
    targetType: "User",
    targetId: input.target.id,
    severity: AuditSeverity.warning,
    before: {
      sessionVersion: currentPasswordState.sessionVersion,
      lastPasswordChangedAt: currentPasswordState.lastPasswordChangedAt?.toISOString() ?? null
    },
    after: {
      sessionVersion: updated.sessionVersion,
      lastPasswordChangedAt: updated.lastPasswordChangedAt?.toISOString() ?? null
    },
    metadata: {
      commandFingerprint: input.commandFingerprint,
      account: userLabel(input.target),
      reason: input.reason.trim(),
      sessionsRevoked: true
    }
  }, transaction);

  return updated;
}

type AdminCreateUserRequest = z.infer<typeof adminCreateUserSchema>;

export type AdminCreatedAccountReceipt = Readonly<{
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  tier: MembershipTier;
}>;

export function toAdminCreatedAccountReceipt(user: AdminCreatedAccountReceipt): AdminCreatedAccountReceipt {
  return Object.freeze({
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    tier: user.tier
  });
}

export function adminAccountCreationPasswordDigest(password: string, secret: string) {
  return createHmac("sha256", secret)
    .update("theta-space:admin-account-creation:v1\0", "utf8")
    .update(password, "utf8")
    .digest("hex");
}

/** Stable, non-secret identity for the provisioning request bound to command replay. */
export function adminAccountCreationRequestId(input: AdminCreateUserRequest, secret: string) {
  const canonicalRequest = JSON.stringify({
    email: input.email.trim().toLowerCase(),
    username: input.username.trim().replace(/^@/, "").toLowerCase(),
    displayName: input.displayName.trim(),
    passwordDigest: adminAccountCreationPasswordDigest(input.password, secret),
    tier: input.tier,
    inviteCode: input.inviteCode?.trim() ? normalizeFreeAccountInviteCode(input.inviteCode) : null,
    reason: input.reason.trim()
  });
  return `admin-user-create:${createHash("sha256").update(canonicalRequest).digest("hex")}`;
}

export function isMatchingAdminAccountCreationReplay(
  replay: Pick<AuditLog, "actorUserId" | "action" | "requestId" | "targetId">,
  actorUserId: string,
  requestId: string
) {
  return (
    replay.actorUserId === actorUserId &&
    replay.action === "user.created" &&
    replay.requestId === requestId &&
    Boolean(replay.targetId)
  );
}

async function replayAdminAccountCreation(
  replay: Pick<AuditLog, "actorUserId" | "action" | "requestId" | "targetId">,
  actorUserId: string,
  requestId: string
) {
  if (!isMatchingAdminAccountCreationReplay(replay, actorUserId, requestId)) {
    return { ok: false as const, error: "That administrator command id has already been used." };
  }
  const user = await prisma.user.findUnique({
    where: { id: replay.targetId! },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      profile: { select: { displayName: true } },
      membership: { select: { tier: true } }
    }
  });
  return user
    ? {
        ok: true as const,
        user: toAdminCreatedAccountReceipt({
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.profile?.displayName ?? user.username,
          role: user.role,
          tier: user.membership?.tier ?? MembershipTier.FREE
        }),
        replayed: true as const
      }
    : { ok: false as const, error: "The original account-creation result is no longer available." };
}

export async function adminCreateUserAccount(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = adminCreateUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid account creation request." };
  }

  const accountCreationSecret = readPlatformEnv().NEXTAUTH_SECRET;
  if (!accountCreationSecret) {
    return {
      ok: false as const,
      error: "Account creation is unavailable because secure command verification is not configured."
    };
  }
  const requestId = adminAccountCreationRequestId(parsed.data, accountCreationSecret);
  const replay = await findAuditLogByOperationId(parsed.data.commandId);
  if (replay) {
    return replayAdminAccountCreation(replay, actorUserId, requestId);
  }

  const inviteCode = parsed.data.inviteCode?.trim() ? normalizeFreeAccountInviteCode(parsed.data.inviteCode) : "";
  const result = await createMemberAccount(
    {
      email: parsed.data.email,
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      inviteCode: inviteCode || undefined
    },
    {
      preverified: true,
      tier: parsed.data.tier,
      role: UserRole.MEMBER,
      skipInviteCode: !inviteCode,
      privilegedTransactionGuard: async (tx) => {
        await lockAndAuthorizeAdminActor(tx, actorUserId);
      },
      atomicAudit: {
        operationId: parsed.data.commandId,
        requestId,
        actorUserId,
        module: MODULE_KEY,
        action: "user.created",
        targetType: "User",
        severity: AuditSeverity.warning,
        metadata: {
          email: parsed.data.email.toLowerCase(),
          username: parsed.data.username.toLowerCase(),
          tier: parsed.data.tier,
          inviteCodeUsed: Boolean(inviteCode),
          reason: parsed.data.reason
        }
      }
    }
  );

  if (!result.ok) {
    // A concurrent retry can lose the unique operation-id race after its
    // account transaction is rolled back. Recover the committed receipt.
    const concurrentReplay = await findAuditLogByOperationId(parsed.data.commandId);
    if (concurrentReplay) {
      return replayAdminAccountCreation(concurrentReplay, actorUserId, requestId);
    }
    return result;
  }

  return {
    ok: true as const,
    user: toAdminCreatedAccountReceipt(result.user),
    replayed: false as const
  };
}

export async function adminResetAccountPassword(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = adminResetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid password reset request." };
  }

  const passwordPolicy = validatePasswordStrength(parsed.data.password);

  if (!passwordPolicy.valid) {
    return { ok: false as const, error: passwordPolicy.issues.join(" ") };
  }

  const [actor, user] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true, deactivatedAt: true } }),
    findUserByIdentifier(parsed.data.userIdentifier)
  ]);

  if (!user) {
    return { ok: false as const, error: "Account was not found." };
  }

  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }
  const authorization = evaluateAdminActorTarget({
    actorUserId: actor.id,
    actorRole: actor.role,
    targetUserId: user.id,
    targetRole: user.role
  });
  if (!authorization.allowed) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }

  const passwordResetSecret = readPlatformEnv().NEXTAUTH_SECRET;
  if (!passwordResetSecret) {
    return {
      ok: false as const,
      error: "Password reset is unavailable because secure command verification is not configured."
    };
  }
  const passwordDigest = adminPasswordResetPasswordDigest(parsed.data.password, passwordResetSecret);
  const commandFingerprint = adminPasswordResetCommandFingerprint({
    actorUserId,
    targetUserId: user.id,
    reason: parsed.data.reason,
    passwordDigest
  });

  const replay = await findAuditLogByOperationId(parsed.data.commandId);
  if (replay) {
    return isMatchingAdminPasswordResetReplay(replay, actorUserId, user.id, commandFingerprint)
      ? { ok: true as const, userLabel: userLabel(user), replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.$transaction(async (tx) => {
      await resetAccountPasswordInTransaction(tx, {
        actorUserId,
        target: user,
        passwordHash,
        commandId: parsed.data.commandId,
        commandFingerprint,
        reason: parsed.data.reason
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof AdminTargetAuthorizationError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentReplay = await findAuditLogByOperationId(parsed.data.commandId);
      if (
        concurrentReplay &&
        isMatchingAdminPasswordResetReplay(concurrentReplay, actorUserId, user.id, commandFingerprint)
      ) {
        return { ok: true as const, userLabel: userLabel(user), replayed: true as const };
      }
      return { ok: false as const, error: "That administrator command id has already been used." };
    }
    throw error;
  }

  return { ok: true as const, userLabel: userLabel(user), replayed: false as const };
}
