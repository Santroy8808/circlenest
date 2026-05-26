import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { signupSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: parsed.data.email },
        { username: parsed.data.username },
        ...(parsed.data.backupEmail ? [{ backupEmail: parsed.data.backupEmail }] : []),
      ],
    },
  });
  if (existing) return NextResponse.json({ error: "Email, backup email, or username already exists" }, { status: 409 });

  const passwordHash = await hash(parsed.data.password, 10);
  const defaultTheme = await prisma.theme.findUnique({ where: { key: "drakudai" } });

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      backupEmail: parsed.data.backupEmail ?? null,
      username: parsed.data.username,
      passwordHash,
      profile: {
        create: {
          displayName: parsed.data.username,
          themeId: defaultTheme?.id,
        },
      },
      feedPreference: { create: { mode: "CHRONOLOGICAL" } },
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, username: user.username });
}
