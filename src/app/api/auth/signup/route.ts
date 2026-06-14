import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { signupSchema } from "@/lib/validation/schemas";
import { createAccountCryptoMaterial } from "@/lib/security/account-crypto";
import { ensureUserStorageRoot } from "@/lib/security/upload-storage";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { findSignupInvitationByCode } from "@/lib/policy/invitations";
import { sendEmailVerificationEmail } from "@/lib/email/smtp";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";
import { isInternalTestEmail } from "@/lib/security/internal-email";
import {
  getClientIpFromRequest,
  getUserAgentFromRequest,
  isSignupRateLimited,
  isSuspiciousFormTiming,
  recordSignupSecurityEvent,
  verifyTurnstileToken,
} from "@/lib/security/signup-bot-guard";
import { CURRENT_TERMS_VERSION } from "@/lib/security/terms";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const firstFieldMessage =
      Object.values(flattened.fieldErrors)
        .flat()
        .find((message): message is string => typeof message === "string" && message.trim().length > 0) ??
      parsed.error.issues[0]?.message;

    return NextResponse.json(
      {
        error: firstFieldMessage ?? "Invalid input",
        fieldErrors: flattened.fieldErrors,
      },
      { status: 400 },
    );
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const normalizedBackupEmail = parsed.data.backupEmail?.trim().toLowerCase() || undefined;
  const normalizedUsername = parsed.data.username.trim();
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
  const ipAddress = getClientIpFromRequest(request);
  const userAgent = getUserAgentFromRequest(request);
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";

  await recordSignupSecurityEvent({
    eventType: "SIGNUP_ATTEMPT",
    ipAddress,
    userAgent,
    metadata: { email: normalizedEmail },
  });

  if (honeypot) {
    await recordSignupSecurityEvent({
      eventType: "SIGNUP_BLOCKED_BOT",
      ipAddress,
      userAgent,
      metadata: { reason: "honeypot_filled", email: normalizedEmail },
    });
    return NextResponse.json({ error: "Invalid signup request." }, { status: 400 });
  }

  if (isSuspiciousFormTiming(body.formStartedAt)) {
    await recordSignupSecurityEvent({
      eventType: "SIGNUP_BLOCKED_BOT",
      ipAddress,
      userAgent,
      metadata: { reason: "submitted_too_fast", email: normalizedEmail },
    });
    return NextResponse.json({ error: "Please try again." }, { status: 429 });
  }

  if (await isSignupRateLimited(ipAddress, normalizedEmail)) {
    await recordSignupSecurityEvent({
      eventType: "SIGNUP_RATE_LIMITED",
      ipAddress,
      userAgent,
      metadata: { email: normalizedEmail },
    });
    return NextResponse.json({ error: "Too many signup attempts. Please wait a bit and try again." }, { status: 429 });
  }

  if (!inviteCode) {
    return NextResponse.json({ error: "Invitation code required." }, { status: 400 });
  }

  const invitation = await findSignupInvitationByCode({
    inviteCode,
    inviteeEmail: normalizedEmail,
  });
  if (!invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation code." }, { status: 403 });
  }

  const turnstile = await verifyTurnstileToken({ token: turnstileToken, ipAddress });
  if (!turnstile.ok) {
    await recordSignupSecurityEvent({
      eventType: "SIGNUP_BLOCKED_BOT",
      ipAddress,
      userAgent,
      metadata: { reason: turnstile.reason ?? "turnstile_failed", email: normalizedEmail },
    });
    return NextResponse.json({ error: "Please verify you are human and try again." }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { username: normalizedUsername },
        ...(normalizedBackupEmail ? [{ backupEmail: normalizedBackupEmail }] : []),
      ],
    },
  });
  if (existing) return NextResponse.json({ error: "Email, recovery email, or username already exists" }, { status: 409 });

  const passwordHash = await hash(parsed.data.password, 10);
  const defaultTheme = await prisma.theme.findUnique({ where: { key: "drakudai" } });

  const uniqueInterests = Array.from(new Set(parsed.data.interests.map((v) => v.trim()).filter(Boolean)));

  const keyMaterial = createAccountCryptoMaterial();
  const internalTestEmail = isInternalTestEmail(normalizedEmail);
  const verificationToken = internalTestEmail ? null : randomToken(24);
  const verificationTokenHash = verificationToken ? sha256(verificationToken) : null;

  const now = new Date();
  let transactionResult;
  try {
    transactionResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: parsed.data.fullName,
          email: normalizedEmail,
          phoneNumber: parsed.data.phoneNumber,
          backupEmail: normalizedBackupEmail ?? null,
          recoveryPhoneNumber: parsed.data.recoveryPhoneNumber ?? null,
          username: normalizedUsername,
          passwordHash,
          city: parsed.data.city,
          state: parsed.data.state,
          country: parsed.data.country,
          lastOnLinesAt: parsed.data.lastOnLinesAt ?? null,
          lastService: parsed.data.lastService ?? null,
          lastServiceWhen: parsed.data.lastServiceWhen ?? null,
          iasStatus: parsed.data.iasStatus ?? null,
          iasNumber: parsed.data.iasNumber ?? null,
          acceptedTermsVersion: CURRENT_TERMS_VERSION,
          acceptedTermsAt: now,
          subscriptionTier: "FREE",
          passwordUpdatedAt: now,
          profile: {
            create: {
              displayName: parsed.data.fullName,
              interests: uniqueInterests.join(", "),
              themeId: defaultTheme?.id,
            },
          },
          feedPreference: { create: { mode: "CHRONOLOGICAL" } },
          followedTopics: {
            createMany: {
              data: uniqueInterests.map((topic) => ({ topic })),
            },
          },
          keyMaterial: {
            create: keyMaterial,
          },
          securityEvents: {
            create: {
              eventType: "ACCOUNT_CREATED",
              ipAddress,
              userAgent,
              metadata: JSON.stringify({ subscriptionTier: "FREE" }),
            },
          },
        },
      });

      const acceptance = await tx.membershipInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash: invitation.tokenHash,
          inviteeEmail: normalizedEmail,
          status: "PENDING",
          reviewStatus: "APPROVED",
          expiresAt: { gt: now },
          revokedAt: null,
          rejectedAt: null,
          acceptedAt: null,
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          inviteeUserId: user.id,
        },
      });
      if (acceptance.count !== 1) {
        throw new Error("INVITATION_INVALID");
      }

      if (!internalTestEmail && verificationTokenHash) {
        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: verificationTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          },
        });
      }

      return user;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_INVALID") {
      return NextResponse.json({ error: "Invalid or expired invitation code." }, { status: 403 });
    }
    throw error;
  }

  void ensureUserStorageRoot(transactionResult.id).catch((error) => {
    console.error("Failed to initialize user storage root", error);
  });

  const baseUrl = getPublicBaseUrl(request);
  let emailSent = false;
  if (!internalTestEmail && verificationToken) {
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
    try {
      await sendEmailVerificationEmail(transactionResult.email, verifyUrl);
      emailSent = true;
    } catch (error) {
      console.error("Email verification send failed", {
        userId: transactionResult.id,
        email: transactionResult.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ id: transactionResult.id, email: transactionResult.email, username: transactionResult.username, emailSent });
}
