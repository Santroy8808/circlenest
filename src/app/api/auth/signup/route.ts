import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { signupSchema } from "@/lib/validation/schemas";
import { createAccountCryptoMaterial } from "@/lib/security/account-crypto";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const normalizedBackupEmail = parsed.data.backupEmail?.trim().toLowerCase() || undefined;
  const normalizedUsername = parsed.data.username.trim();

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
          metadata: JSON.stringify({ subscriptionTier: parsed.data.subscriptionTier }),
        },
      },
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, username: user.username });
}
