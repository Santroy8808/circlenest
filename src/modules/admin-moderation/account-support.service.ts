import { createHash } from "crypto";
import { AuditSeverity, MembershipTier, UserRole, type AuditLog } from "@prisma/client";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";
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

type AdminCreateUserRequest = z.infer<typeof adminCreateUserSchema>;

/** Stable, non-secret identity for the provisioning request bound to command replay. */
export function adminAccountCreationRequestId(input: AdminCreateUserRequest) {
  const canonicalRequest = JSON.stringify({
    email: input.email.trim().toLowerCase(),
    username: input.username.trim().replace(/^@/, "").toLowerCase(),
    displayName: input.displayName.trim(),
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
  const user = await prisma.user.findUnique({ where: { id: replay.targetId! } });
  return user
    ? { ok: true as const, user, replayed: true as const }
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

  const requestId = adminAccountCreationRequestId(parsed.data);
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

  return { ok: true as const, user: result.user, replayed: false as const };
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

  const replay = await findAuditLogByOperationId(parsed.data.commandId);
  if (replay) {
    return replay.actorUserId === actorUserId && replay.action === "password.reset" && replay.targetId === user.id
      ? { ok: true as const, userLabel: userLabel(user), replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction(async (tx) => {
    const changedAt = new Date();
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        lastPasswordChangedAt: changedAt,
        failedLoginCount: 0,
        sessionVersion: { increment: 1 }
      },
      select: { sessionVersion: true, lastPasswordChangedAt: true }
    });

    await writeAuditLog({
      operationId: parsed.data.commandId,
      actorUserId,
      module: MODULE_KEY,
      action: "password.reset",
      targetType: "User",
      targetId: user.id,
      severity: AuditSeverity.warning,
      before: {
        sessionVersion: user.sessionVersion,
        lastPasswordChangedAt: user.lastPasswordChangedAt?.toISOString() ?? null
      },
      after: {
        sessionVersion: updated.sessionVersion,
        lastPasswordChangedAt: updated.lastPasswordChangedAt?.toISOString() ?? null
      },
      metadata: {
        account: userLabel(user),
        reason: parsed.data.reason,
        sessionsRevoked: true
      }
    }, tx);
  });

  return { ok: true as const, userLabel: userLabel(user), replayed: false as const };
}
