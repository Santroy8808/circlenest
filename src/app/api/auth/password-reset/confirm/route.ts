import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { passwordResetConfirmSchema } from "@/lib/validation/auth-security";
import { sha256 } from "@/lib/security/tokens";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = passwordResetConfirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const tokenHash = sha256(parsed.data.token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  if (row.usedAt) return NextResponse.json({ error: "Token already used" }, { status: 400 });
  if (row.expiresAt < new Date()) return NextResponse.json({ error: "Token expired" }, { status: 400 });

  const passwordHash = await hash(parsed.data.password, 10);

  await prisma.user.update({ where: { id: row.userId }, data: { passwordHash } });
  await prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
