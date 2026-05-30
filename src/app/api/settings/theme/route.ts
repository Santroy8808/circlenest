import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { FEED_MODES } from "@/lib/feed/modes";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

const themeKeys = [
  "drakudai","classic-blue","dark-mode","neon","minimal","forest","ocean","sunset","cyber","pastel","professional","retro-web","high-contrast",
] as const;

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = await request.json();
  if (!themeKeys.includes(body.themeKey)) return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
  if (body.feedMode && !FEED_MODES.includes(body.feedMode)) return NextResponse.json({ error: "Invalid feed mode" }, { status: 400 });

  const theme = await prisma.theme.findUnique({ where: { key: body.themeKey } });
  if (!theme) return NextResponse.json({ error: "Theme not found" }, { status: 404 });

  await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, displayName: "User", themeId: theme.id },
    update: { themeId: theme.id },
  });

  if (body.feedMode) {
    await prisma.userFeedPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, mode: body.feedMode },
      update: { mode: body.feedMode },
    });
  }

  return NextResponse.json({ ok: true });
}
