import { createHash, randomBytes } from "crypto";
import { AccountPurpose, AuthSecurityEventType, AuditSeverity, MembershipTier, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
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

const MODULE_KEY = "auth-security";
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

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

function exposeDevToken() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEV_EXPOSE_TOKENS === "true";
}

function publicBaseUrl() {
  return (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://theta-space.net").replace(/\/+$/, "");
}

function verificationEmailText(token: string) {
  const verificationUrl = `${publicBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  return [
    "Welcome to Theta-Space.",
    "",
    "Use this link to verify your email address:",
    verificationUrl,
    "",
    `Verification token: ${token}`,
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
      `<p><strong>Verification token:</strong> ${token}</p>`,
      "<p>If you did not create this account, you can ignore this email.</p>"
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
        ipAddress: input.context?.ipAddress,
        userAgent: input.context?.userAgent,
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
    tier: user.membership?.tier ?? MembershipTier.FREE,
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
    let verificationEmailError: string | undefined;

    if (!options.preverified) {
      const token = await createEmailVerificationToken(user.id, user.email, options.context);

      if (token) {
        try {
          await sendEmailVerificationMessage(user.email, token);
          verificationEmailSent = true;
        } catch (error) {
          verificationEmailError = error instanceof Error ? error.message : "Could not send verification email.";
          await diagnostics.warn(MODULE_KEY, "Email verification SMTP send failed.", {
            userId: user.id,
            email: user.email,
            error: verificationEmailError
          });
        }
      }
    }

    return { ok: true as const, user: toAuthenticatedUser(user), verificationEmailSent, verificationEmailError };
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

export async function createEmailVerificationToken(userId: string, email: string, context?: RequestContext) {
  const token = createToken();

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      email: normalizeIdentifier(email),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ONE_DAY_MS)
    }
  });

  await recordSecurityEvent({
    type: AuthSecurityEventType.EMAIL_VERIFICATION_REQUESTED,
    userId,
    identifier: normalizeIdentifier(email),
    context
  });

  return token;
}

export async function verifyEmailToken(input: unknown, context?: RequestContext) {
  const parsed = emailVerificationConfirmSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid verification token." };
  }

  const tokenRecord = await prisma.emailVerificationToken.findFirst({
    where: {
      tokenHash: hashToken(parsed.data.token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (!tokenRecord) {
    return { ok: false as const, error: "Verification token is invalid or expired." };
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { emailVerified: new Date() }
    })
  ]);

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
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const identifier = normalizeIdentifier(parsed.data.identifier);
  const username = normalizeUsername(parsed.data.identifier);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username }]
    }
  });

  if (!user || user.deactivatedAt) {
    await recordSecurityEvent({
      type: AuthSecurityEventType.PASSWORD_RESET_REQUESTED,
      identifier,
      context,
      metadata: { matched: false }
    });
    return { ok: true as const };
  }

  const token = createToken();

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ONE_HOUR_MS)
    }
  });

  await recordSecurityEvent({
    type: AuthSecurityEventType.PASSWORD_RESET_REQUESTED,
    userId: user.id,
    identifier,
    context,
    metadata: { matched: true }
  });

  return { ok: true as const, token: exposeDevToken() ? token : undefined };
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

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash: hashToken(parsed.data.token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (!resetToken) {
    return { ok: false as const, error: "Reset token is invalid or expired." };
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: await hashPassword(parsed.data.password),
        lastPasswordChangedAt: new Date(),
        sessionVersion: { increment: 1 }
      }
    })
  ]);

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
