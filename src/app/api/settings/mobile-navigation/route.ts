import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

type Side = "LEFT" | "RIGHT";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pref = await prisma.userFeedPreference.findUnique({
    where: { userId: session.user.id },
    select: { mobileNavSwipeSide: true },
  });

  return NextResponse.json({ side: (pref?.mobileNavSwipeSide as Side | undefined) ?? "RIGHT" });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { side?: unknown };
  const side: Side = body.side === "LEFT" ? "LEFT" : "RIGHT";

  const pref = await prisma.userFeedPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, mobileNavSwipeSide: side },
    update: { mobileNavSwipeSide: side },
    select: { mobileNavSwipeSide: true },
  });

  return NextResponse.json({ side: pref.mobileNavSwipeSide });
}

