import { NextResponse } from "next/server";
import QRCode from "qrcode";
import speakeasy from "speakeasy";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  if (!user?.email) return NextResponse.json({ error: "User missing email" }, { status: 400 });

  const secret = speakeasy.generateSecret({ length: 20 });
  await prisma.twoFactorConfig.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, secret: secret.base32, enabled: false },
    update: { secret: secret.base32, enabled: false },
  });
  await prisma.authSecurityEvent.create({
    data: {
      userId: session.user.id,
      eventType: "TWO_FA_SETUP_INITIATED",
    },
  });

  const otpauth = secret.otpauth_url || "";
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  return NextResponse.json({ secret: secret.base32, otpauth, qrDataUrl });
}
