import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { passwordResetRequestSchema } from "@/lib/validation/auth-security";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { sendPasswordResetEmail } from "@/lib/email/smtp";
import { checkRateLimitPlaceholder } from "@/lib/security";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";

export async function POST(request: Request) {
  const ipAddress = request.headers.get("x-forwarded-for") ?? "local";
  const body = await request.json();
  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const allowed = await checkRateLimitPlaceholder(`pwd-reset-request:${parsed.data.email}:${ipAddress}`);
  if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: parsed.data.email }, { backupEmail: parsed.data.email }],
    },
  });
  if (!user) return NextResponse.json({ ok: true });

  const token = randomToken(24);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
  await prisma.authSecurityEvent.create({
    data: {
      userId: user.id,
      eventType: "PASSWORD_RESET_REQUESTED",
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    },
  });

  const baseUrl = getPublicBaseUrl(request);
  const resetUrl = `${baseUrl}/reset-password/confirm?token=${encodeURIComponent(token)}`;

  let emailSent = false;
  let emailError: string | undefined;
  try {
    await sendPasswordResetEmail(user.email, resetUrl);
    emailSent = true;
  } catch (error) {
    const err = error as unknown as { message?: string; code?: string; command?: string; response?: string };
    emailError = err?.message ? String(err.message) : String(error);
    console.error("Password reset email failed", {
      email: user.email,
      code: err?.code,
      command: err?.command,
      response: err?.response,
      error: emailError,
    });
    if (process.env.LOG_PASSWORD_RESET_URL_ON_FAILURE === "true") {
      console.warn("Password reset email failed; reset URL (debug):", resetUrl);
    }

    // Record failure for audit/debugging without leaking anything to the client.
    await prisma.authSecurityEvent.create({
      data: {
        userId: user.id,
        eventType: "PASSWORD_RESET_EMAIL_FAILED",
        ipAddress,
        userAgent: request.headers.get("user-agent"),
        metadata: JSON.stringify({ code: err?.code, command: err?.command }),
      },
    });
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true, resetUrl, emailSent, emailError });
  }
  return NextResponse.json({ ok: true });
}
