import { NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { twoFaTokenSchema } from "@/lib/validation/auth-security";
import { checkRateLimitPlaceholder } from "@/lib/security";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = twoFaTokenSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const allowed = await checkRateLimitPlaceholder(`2fa-verify:${session.user.id}`);
  if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const config = await prisma.twoFactorConfig.findUnique({ where: { userId: session.user.id } });
  if (!config) return NextResponse.json({ error: "2FA not initialized" }, { status: 400 });

  const valid = speakeasy.totp.verify({ secret: config.secret, encoding: "base32", token: parsed.data.token });
  if (!valid) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  await prisma.twoFactorConfig.update({ where: { userId: session.user.id }, data: { enabled: true } });
  await prisma.authSecurityEvent.create({
    data: {
      userId: session.user.id,
      eventType: "TWO_FA_ENABLED",
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for") ?? "local",
    },
  });

  return NextResponse.json({ ok: true });
}
