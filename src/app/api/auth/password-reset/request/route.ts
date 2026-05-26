import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { passwordResetRequestSchema } from "@/lib/validation/auth-security";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { sendPasswordResetEmail } from "@/lib/email/smtp";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

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

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password/confirm?token=${encodeURIComponent(token)}`;

  await sendPasswordResetEmail(user.email, resetUrl);

  return NextResponse.json({ ok: true });
}
