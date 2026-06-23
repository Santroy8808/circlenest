import { AuditSeverity, MembershipTier, UserRole } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { createMemberAccount } from "@/modules/auth-security/auth-security.service";
import { hashPassword, validatePasswordStrength } from "@/modules/auth-security/password";
import { normalizeFreeAccountInviteCode } from "@/modules/membership-policy/free-account-invites.service";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";

const MODULE_KEY = "admin-account-support";

const adminCreateUserSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  password: z.string().min(1),
  tier: z.nativeEnum(MembershipTier).default(MembershipTier.FREE),
  inviteCode: z.string().optional().or(z.literal("")),
  reason: z.string().min(3).max(240)
});

const adminResetPasswordSchema = z.object({
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

export async function adminCreateUserAccount(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = adminCreateUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid account creation request." };
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
      skipInviteCode: !inviteCode
    }
  );

  if (!result.ok) return result;

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "user.created",
    targetType: "User",
    targetId: result.user.id,
    severity: AuditSeverity.warning,
    metadata: {
      email: parsed.data.email.toLowerCase(),
      username: parsed.data.username.toLowerCase(),
      tier: parsed.data.tier,
      inviteCodeUsed: Boolean(inviteCode),
      reason: parsed.data.reason
    }
  });

  return { ok: true as const, user: result.user };
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

  const user = await findUserByIdentifier(parsed.data.userIdentifier);

  if (!user) {
    return { ok: false as const, error: "Account was not found." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      lastPasswordChangedAt: new Date(),
      failedLoginCount: 0,
      sessionVersion: { increment: 1 }
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "password.reset",
    targetType: "User",
    targetId: user.id,
    severity: AuditSeverity.warning,
    metadata: {
      account: userLabel(user),
      reason: parsed.data.reason,
      sessionsRevoked: true
    }
  });

  return { ok: true as const, userLabel: userLabel(user) };
}
