import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sha256 } from "@/lib/security/tokens";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";

export async function GET(request: Request) {
  const baseUrl = getPublicBaseUrl(request);
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.redirect(`${baseUrl}/?error=invalid_verification_link`);
  }

  const tokenHash = sha256(token);
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!row || row.expiresAt < new Date()) {
    return NextResponse.redirect(`${baseUrl}/?error=invalid_verification_link`);
  }

  await prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } });
  await prisma.authSecurityEvent.create({
    data: {
      userId: row.userId,
      eventType: "EMAIL_VERIFIED",
      userAgent: request.headers.get("user-agent"),
    },
  });

  return NextResponse.redirect(`${baseUrl}/?notice=email_verified`);
}

