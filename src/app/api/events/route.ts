import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canCreateEvent } from "@/lib/policy/tier-policy";
import { serializeAdPlacements } from "@/lib/ads/ads";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    where: {
      OR: [
        { creatorId: session.user.id },
        { invitations: { some: { inviteeId: session.user.id } } },
        { moderators: { some: { userId: session.user.id } } },
      ],
    },
    include: {
      creator: { select: { username: true } },
      moderators: { include: { user: { select: { username: true } } } },
      adPlacements: {
        include: { creator: { select: { id: true, username: true } } },
        orderBy: [{ createdAt: "desc" }],
      },
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json(
    events.map((event) => ({
      ...event,
      adPlacements: serializeAdPlacements(event.adPlacements),
    })),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!canCreateEvent(policy)) return NextResponse.json({ error: "Event creation is not allowed on this tier." }, { status: 403 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    startsAt?: string;
    endsAt?: string;
    locationName?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    inviteUsernames?: string[];
  };
  const title = String(body.title ?? "").trim();
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (!title || !startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Title and start time are required" }, { status: 400 });
  }

  const inviteUsernames = Array.isArray(body.inviteUsernames)
    ? Array.from(new Set(body.inviteUsernames.map((v) => String(v).trim()).filter(Boolean)))
    : [];
  const invitees = inviteUsernames.length
    ? await prisma.user.findMany({ where: { username: { in: inviteUsernames } }, select: { id: true } })
    : [];

  const event = await prisma.event.create({
    data: {
      creatorId: session.user.id,
      title,
      description: String(body.description ?? "").trim() || null,
      startsAt,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      locationName: String(body.locationName ?? "").trim() || null,
      visibility: "PRIVATE",
      invitations: invitees.length
        ? { create: invitees.map((invitee) => ({ inviteeId: invitee.id })) }
        : undefined,
    },
  });

  await prisma.eventModerator.create({
    data: {
      eventId: event.id,
      userId: session.user.id,
      grantedById: session.user.id,
    },
  });

  const inviteNotifications = invitees
    .filter((invitee) => invitee.id !== session.user.id)
    .map((invitee) => ({
      userId: invitee.id,
      type: "EVENT_INVITE",
      body: `You were invited to event: ${title}`,
      targetUrl: "/events",
    }));
  if (inviteNotifications.length > 0) {
    await prisma.notification.createMany({ data: inviteNotifications });
  }

  return NextResponse.json(event);
}
