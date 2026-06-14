import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { isPasswordExpired } from "@/lib/security/password-policy";
import { requiresTwoFactorForTier } from "@/lib/policy/tier-policy";
import { isInternalTestEmail } from "@/lib/security/internal-email";

export type LoginCandidate = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  passwordUpdatedAt: Date | null;
  sessionVersion: number;
  subscriptionTier: string;
  deactivatedAt: Date | null;
};

export type LoginResult =
  | { ok: true; user: LoginCandidate; twoFactorEnabled: boolean }
  | { ok: false; error: "invalid_credentials" | "password_expired" | "account_deactivated" | "email_not_verified" | "twofa_required"; email?: string };

export async function findLoginCandidate(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const looksLikeEmail = identifier.includes("@");

  return prisma.user.findFirst({
    where: looksLikeEmail
      ? { OR: [{ email: identifier }, { email: normalizedIdentifier }] }
      : { OR: [{ username: identifier }, { email: normalizedIdentifier }] },
    select: {
      id: true,
      email: true,
      username: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      sessionVersion: true,
      subscriptionTier: true,
      deactivatedAt: true,
    },
  }) as Promise<LoginCandidate | null>;
}

export async function resolvePasswordLogin(input: {
  identifier: string;
  password: string;
  requireTierTwoFa: boolean;
}): Promise<LoginResult> {
  const user = await findLoginCandidate(input.identifier);
  if (!user) return { ok: false, error: "invalid_credentials" };
  if (user.deactivatedAt) return { ok: false, error: "account_deactivated" };

  if (!isInternalTestEmail(user.email)) {
    const pendingVerification = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pendingVerification) return { ok: false, error: "email_not_verified" };
  }

  const valid = await compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, error: "invalid_credentials" };
  if (!user.passwordUpdatedAt || isPasswordExpired(user.passwordUpdatedAt)) {
    return { ok: false, error: "password_expired", email: user.email };
  }

  const twoFa = await prisma.twoFactorConfig.findUnique({ where: { userId: user.id }, select: { enabled: true } });
  if (input.requireTierTwoFa && requiresTwoFactorForTier(user.subscriptionTier) && !twoFa?.enabled) {
    return { ok: false, error: "twofa_required" };
  }

  return { ok: true, user, twoFactorEnabled: Boolean(twoFa?.enabled) };
}
