import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { signupSchema } from "@/lib/validation/schemas";
import { createAccountCryptoMaterial } from "@/lib/security/account-crypto";
import { ensureUserStorageRoot } from "@/lib/security/upload-storage";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { sendEmailVerificationEmail } from "@/lib/email/smtp";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";
import {
  getClientIpFromRequest,
  getUserAgentFromRequest,
  isSignupRateLimited,
  isSuspiciousFormTiming,
  recordSignupSecurityEvent,
  verifyTurnstileToken,
} from "@/lib/security/signup-bot-guard";

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

  const user = await prisma.user.create({
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
      subscriptionTier: parsed.data.subscriptionTier,
      passwordUpdatedAt: new Date(),
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
          metadata: JSON.stringify({ subscriptionTier: parsed.data.subscriptionTier }),
        },
      },
    },
  });

  void ensureUserStorageRoot(user.id).catch((error) => {
    console.error("Failed to initialize user storage root", error);
  });

  const verificationToken = randomToken(24);
  const tokenHash = sha256(verificationToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const baseUrl = getPublicBaseUrl(request);
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;

  let emailSent = false;
  try {
    await sendEmailVerificationEmail(user.email, verifyUrl);
    emailSent = true;
  } catch (error) {
    console.error("Email verification send failed", {
      userId: user.id,
      email: user.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ id: user.id, email: user.email, username: user.username, emailSent });
}
