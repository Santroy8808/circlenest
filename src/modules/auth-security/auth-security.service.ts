import { createHash, randomBytes } from "crypto";
import { AccountPurpose, AuthSecurityEventType, AuditSeverity, MembershipTier, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { diagnostics } from "@/lib/platform/logging";
import { hashPrivateSignal } from "@/lib/platform/private-signals";
import { sendSmtpMail } from "@/lib/platform/smtp";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/modules/auth-security/password";
import {
  type AuthenticatedUser,
  emailVerificationConfirmSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  type RequestContext,
  signupSchema
} from "@/modules/auth-security/types";
import {
  consumeFreeInviteForSignup,
  findUsableFreeInviteForSignup,
  FreeInviteError
} from "@/modules/membership-policy/free-account-invites.service";
import { recordSessionStart } from "@/modules/platform-activity/platform-activity.service";
import { normalizeOperationalMembershipTier } from "@/modules/membership-policy/policy";

const MODULE_KEY = "auth-security";
const ONE_MINUTE_MS = 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * ONE_MINUTE_MS;
const PASSWORD_RESET_TTL_MS = 20 * ONE_MINUTE_MS;
const GENERIC_PASSWORD_RESET_RESULT = Object.freeze({
  ok: true as const,
  error: undefined,
  token: undefined
});

class TokenConsumptionConflict extends Error {}

export function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function createToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicBaseUrl() {
  const env = readPlatformEnv();
  const origin = env.APP_ORIGIN || env.NEXTAUTH_URL || "http://localhost:3000";
  return new URL(origin).origin;
}

function verificationEmailText(token: string) {
  const verificationUrl = `${publicBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  return [
    "Welcome to Theta-Space.",
    "",
    "Use this link to verify your email address:",
    verificationUrl,
    "",
    "If you did not create this account, you can ignore this email."
  ].join("\n");
}

async function sendEmailVerificationMessage(email: string, token: string) {
  const verificationUrl = `${publicBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  await sendSmtpMail({
    to: email,
    subject: "Verify your Theta-Space email",
    text: verificationEmailText(token),
    html: [
      "<p>Welcome to Theta-Space.</p>",
      `<p><a href="${verificationUrl}">Verify your email address</a></p>`,
      "<p>If you did not create this account, you can ignore this email.</p>"
    ].join("")
  });
}

function passwordResetEmailText(token: string) {
  const resetUrl = `${publicBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  return [
    "A password reset was requested for your Theta-Space account.",
    "",
    "Use this link within 20 minutes to choose a new password:",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email. Your password has not changed."
  ].join("\n");
}

async function sendPasswordResetMessage(email: string, token: string) {
  const resetUrl = `${publicBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  await sendSmtpMail({
    to: email,
    subject: "Reset your Theta-Space password",
    text: passwordResetEmailText(token),
    html: [
      "<p>A password reset was requested for your Theta-Space account.</p>",
      `<p><a href="${resetUrl}">Choose a new password</a></p>`,
      "<p>This link expires in 20 minutes.</p>",
      "<p>If you did not request this, you can ignore this email. Your password has not changed.</p>"
    ].join("")
  });
}

async function recordSecurityEvent(input: {
  type: AuthSecurityEventType;
  userId?: string;
  identifier?: string;
  context?: RequestContext;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.authSecurityEvent.create({
      data: {
        type: input.type,
        userId: input.userId,
        identifier: input.identifier,
        ipAddress: hashPrivateSignal(input.context?.ipAddress, "auth-security:ip"),
        userAgent: hashPrivateSignal(input.context?.userAgent, "auth-security:user-agent"),
        metadata: input.metadata as Prisma.InputJsonObject | undefined
      }
    });
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not write auth security event.", {
      type: input.type,
      userId: input.userId,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  accountPurpose: AccountPurpose;
  sessionVersion: number;
  profile: { displayName: string | null } | null;
  membership: { tier: MembershipTier } | null;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    role: user.role,
    accountPurpose: user.accountPurpose,
    tier: normalizeOperationalMembershipTier(user.membership?.tier),
    sessionVersion: user.sessionVersion
  };
}

export async function authorizeCredentials(
  input: unknown,
  context?: RequestContext
): Promise<AuthenticatedUser | null> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    await recordSecurityEvent({
      type: AuthSecurityEventType.LOGIN_FAILURE,
      identifier: "invalid-login-payload",
      context,
      metadata: { reason: "schema" }
    });
    return null;
  }

  const identifier = normalizeIdentifier(parsed.data.identifier);
  const username = normalizeUsername(parsed.data.identifier);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username }]
    },
    include: {
      membership: true,
      profile: true
    }
  });

  if (!user?.passwordHash || user.deactivatedAt) {
    await recordSecurityEvent({
      type: AuthSecurityEventType.LOGIN_FAILURE,
      identifier,
      context,
      metadata: { reason: user?.deactivatedAt ? "deactivated" : "not_found" }
    });
    return null;
  }

  const passwordMatches = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!passwordMatches) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } }
    });
    await recordSecurityEvent({
      type: AuthSecurityEventType.LOGIN_FAILURE,
      userId: user.id,
      identifier,
      context,
      metadata: { reason: "password" }
    });
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lastLoginAt: new Date()
    }
  });
  await recordSecurityEvent({
    type: AuthSecurityEventType.LOGIN_SUCCESS,
    userId: user.id,
    identifier,
    context
  });
  await recordSessionStart({
    userId: user.id,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent
  }).catch((error) =>
    diagnostics.warn(MODULE_KEY, "Could not write platform session-start activity.", {
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown"
    })
  );

  return toAuthenticatedUser(user);
}

export async function createMemberAccount(
  input: unknown,
    options: {
    preverified?: boolean;
    accountPurpose?: AccountPurpose;
    tier?: MembershipTier;
    role?: UserRole;
    context?: RequestContext;
    skipInviteCode?: boolean;
  } = {}
) {
  const parsed = signupSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid signup." };
  }

  const passwordPolicy = validatePasswordStrength(parsed.data.password);

  if (!passwordPolicy.valid) {
    return { ok: false as const, error: passwordPolicy.issues.join(" ") };
  }

  const email = normalizeIdentifier(parsed.data.email);
  const username = normalizeUsername(parsed.data.username);

  if (!options.skipInviteCode && !parsed.data.inviteCode?.trim()) {
    return { ok: false as const, error: "Invite code is required." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      let inviteId: string | null = null;

      if (!options.skipInviteCode) {
        const invite = await findUsableFreeInviteForSignup(tx, parsed.data.inviteCode, email);

        if (!invite.ok) {
          throw new FreeInviteError(invite.error);
        }

        inviteId = invite.invite.id;
      }

      const createdUser = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          role: options.role ?? UserRole.MEMBER,
          accountPurpose: options.accountPurpose ?? AccountPurpose.MEMBER,
          emailVerified: options.preverified ? new Date() : undefined,
          lastPasswordChangedAt: new Date(),
          profile: {
            create: {
              displayName: parsed.data.displayName
            }
          },
          membership: {
            create: {
              tier: options.tier ?? MembershipTier.FREE
            }
          }
        },
        include: {
          membership: true,
          profile: true
        }
      });

      if (inviteId) {
        await consumeFreeInviteForSignup(tx, {
          inviteId,
          userId: createdUser.id,
          email
        });
      }

      return createdUser;
    });

    await recordSecurityEvent({
      type: AuthSecurityEventType.SIGNUP_CREATED,
      userId: user.id,
      identifier: email,
      context: options.context,
      metadata: { preverified: Boolean(options.preverified), tier: user.membership?.tier ?? MembershipTier.FREE }
    });

    let verificationEmailSent = false;

    if (!options.preverified) {
      try {
        await issueAndSendEmailVerification(user.id, user.email, options.context);
        verificationEmailSent = true;
      } catch (error) {
        await diagnostics.warn(MODULE_KEY, "Email verification delivery failed.", {
          userId: user.id,
          error: error instanceof Error ? error.message : "unknown"
        });
      }
    }

    return {
      ok: true as const,
      user: toAuthenticatedUser(user),
      verificationEmailSent,
      verificationEmailError: undefined
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, error: "That email or username is already in use." };
    }

    if (error instanceof FreeInviteError) {
      return { ok: false as const, error: error.message };
    }

    await diagnostics.error(MODULE_KEY, "Signup failed.", {
      email,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not create account." };
  }
}

async function issueAndSendEmailVerification(userId: string, email: string, context?: RequestContext) {
  const token = createToken();
  const issuedAt = new Date();

  const tokenRecord = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: issuedAt }
    });

    return tx.emailVerificationToken.create({
      data: {
        userId,
        email: normalizeIdentifier(email),
        tokenHash: hashToken(token),
        expiresAt: new Date(issuedAt.getTime() + EMAIL_VERIFICATION_TTL_MS)
      },
      select: { id: true }
    });
  });

  await recordSecurityEvent({
    type: AuthSecurityEventType.EMAIL_VERIFICATION_REQUESTED,
    userId,
    identifier: normalizeIdentifier(email),
    context
  });

  try {
    await sendEmailVerificationMessage(email, token);
  } catch (error) {
    await prisma.emailVerificationToken
      .updateMany({
        where: { id: tokenRecord.id, usedAt: null },
        data: { usedAt: new Date() }
      })
      .catch((invalidationError) =>
        diagnostics.error(MODULE_KEY, "Could not invalidate an undelivered verification token.", {
          userId,
          error: invalidationError instanceof Error ? invalidationError.message : "unknown"
        })
      );
    throw error;
  }
}

export async function verifyEmailToken(input: unknown, context?: RequestContext) {
  const parsed = emailVerificationConfirmSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid verification token." };
  }

  const now = new Date();
  let tokenRecord: { id: string; userId: string; email: string } | null;

  try {
    tokenRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(parsed.data.token) }
      });

      if (!record || record.usedAt || record.expiresAt <= now) {
        return null;
      }

      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: now }
        },
        data: { usedAt: now }
      });

      if (consumed.count !== 1) {
        return null;
      }

      const verified = await tx.user.updateMany({
        where: {
          id: record.userId,
          email: normalizeIdentifier(record.email),
          deactivatedAt: null
        },
        data: { emailVerified: now }
      });

      if (verified.count !== 1) {
        throw new TokenConsumptionConflict();
      }

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: record.userId,
          id: { not: record.id },
          usedAt: null
        },
        data: { usedAt: now }
      });

      return { id: record.id, userId: record.userId, email: record.email };
    });
  } catch (error) {
    if (error instanceof TokenConsumptionConflict) {
      tokenRecord = null;
    } else {
      throw error;
    }
  }

  if (!tokenRecord) {
    return { ok: false as const, error: "Verification token is invalid or expired." };
  }

  await recordSecurityEvent({
    type: AuthSecurityEventType.EMAIL_VERIFIED,
    userId: tokenRecord.userId,
    identifier: tokenRecord.email,
    context
  });

  return { ok: true as const };
}

export async function requestPasswordReset(input: unknown, context?: RequestContext) {
  const parsed = passwordResetRequestSchema.safeParse(input);

  if (!parsed.success) {
    await recordSecurityEvent({
      type: AuthSecurityEventType.PASSWORD_RESET_REQUESTED,
      identifier: "invalid-reset-request",
      context,
      metadata: { matched: false }
    });
    return GENERIC_PASSWORD_RESET_RESULT;
  }

  const identifier = normalizeIdentifier(parsed.data.identifier);
  const username = normalizeUsername(parsed.data.identifier);

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username }]
      },
      select: {
        id: true,
        email: true,
        deactivatedAt: true
      }
    });

    if (!user || user.deactivatedAt) {
      await recordSecurityEvent({
        type: AuthSecurityEventType.PASSWORD_RESET_REQUESTED,
        identifier,
        context,
        metadata: { matched: false }
      });
      return GENERIC_PASSWORD_RESET_RESULT;
    }

    const token = createToken();
    const issuedAt = new Date();
    const tokenRecord = await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: issuedAt }
      });

      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(issuedAt.getTime() + PASSWORD_RESET_TTL_MS)
        },
        select: { id: true }
      });
    });

    let delivered = false;

    try {
      await sendPasswordResetMessage(user.email, token);
      delivered = true;
    } catch (error) {
      await prisma.passwordResetToken
        .updateMany({
          where: { id: tokenRecord.id, usedAt: null },
          data: { usedAt: new Date() }
        })
        .catch((invalidationError) =>
          diagnostics.error(MODULE_KEY, "Could not invalidate an undelivered password reset token.", {
            userId: user.id,
            error: invalidationError instanceof Error ? invalidationError.message : "unknown"
          })
        );
      await diagnostics.warn(MODULE_KEY, "Password reset email delivery failed.", {
        userId: user.id,
        error: error instanceof Error ? error.message : "unknown"
      });
    }

    await recordSecurityEvent({
      type: AuthSecurityEventType.PASSWORD_RESET_REQUESTED,
      userId: user.id,
      identifier,
      context,
      metadata: { matched: true, delivered }
    });
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Password reset request processing failed.", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  return GENERIC_PASSWORD_RESET_RESULT;
}

export async function confirmPasswordReset(input: unknown, context?: RequestContext) {
  const parsed = passwordResetConfirmSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reset request." };
  }

  const passwordPolicy = validatePasswordStrength(parsed.data.password);

  if (!passwordPolicy.valid) {
    return { ok: false as const, error: passwordPolicy.issues.join(" ") };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  let resetToken: { userId: string } | null;

  try {
    resetToken = await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(parsed.data.token) }
      });

      if (!record || record.usedAt || record.expiresAt <= now) {
        return null;
      }

      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: now }
        },
        data: { usedAt: now }
      });

      if (consumed.count !== 1) {
        return null;
      }

      const passwordUpdated = await tx.user.updateMany({
        where: {
          id: record.userId,
          deactivatedAt: null
        },
        data: {
          passwordHash,
          lastPasswordChangedAt: now,
          failedLoginCount: 0,
          sessionVersion: { increment: 1 },
          sessionsRevokedAt: now
        }
      });

      if (passwordUpdated.count !== 1) {
        throw new TokenConsumptionConflict();
      }

      await tx.passwordResetToken.updateMany({
        where: {
          userId: record.userId,
          id: { not: record.id },
          usedAt: null
        },
        data: { usedAt: now }
      });

      return { userId: record.userId };
    });
  } catch (error) {
    if (error instanceof TokenConsumptionConflict) {
      resetToken = null;
    } else {
      throw error;
    }
  }

  if (!resetToken) {
    return { ok: false as const, error: "Reset token is invalid or expired." };
  }

  await recordSecurityEvent({
    type: AuthSecurityEventType.PASSWORD_RESET_COMPLETED,
    userId: resetToken.userId,
    context
  });

  return { ok: true as const };
}

export async function revokeUserSessions(input: { actorUserId?: string; targetUserId: string; reason?: string }) {
  const target = await prisma.user.update({
    where: { id: input.targetUserId },
    data: {
      sessionVersion: { increment: 1 },
      sessionsRevokedAt: new Date()
    }
  });

  await recordSecurityEvent({
    type: AuthSecurityEventType.SESSION_REVOKED,
    userId: target.id,
    metadata: { reason: input.reason ?? "manual" }
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    module: MODULE_KEY,
    action: "session.revoke",
    targetType: "User",
    targetId: target.id,
    severity: AuditSeverity.warning,
    metadata: { reason: input.reason ?? "manual" }
  });

  return { ok: true as const };
}

export async function getUserSessionGuard(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      accountPurpose: true,
      sessionVersion: true,
      deactivatedAt: true,
      membership: {
        select: {
          tier: true
        }
      }
    }
  });
}
