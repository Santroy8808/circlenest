import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveProductionZoneAccess } from "@/lib/policy/production-zone";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    include: { creator: { select: { username: true } } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true, iasStatus: true } });
  const access = resolveProductionZoneAccess(user?.subscriptionTier, user?.iasStatus === "INVITED_CREATOR");
  if (!access.canCreate) return NextResponse.json({ error: access.reason ?? "Event creation is locked." }, { status: 403 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    startsAt?: string;
    endsAt?: string;
    locationName?: string;
    visibility?: "PUBLIC" | "PRIVATE";
  };
  const title = String(body.title ?? "").trim();
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (!title || !startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Title and start time are required" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      creatorId: session.user.id,
      title,
      description: String(body.description ?? "").trim() || null,
      startsAt,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      locationName: String(body.locationName ?? "").trim() || null,
      visibility: body.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    },
  });

  return NextResponse.json(event);
}
