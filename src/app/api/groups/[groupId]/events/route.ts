import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

function buildGoogleMapsUrl(locationName?: string, latitude?: number, longitude?: number): string | null {
  if (typeof latitude === "number" && typeof longitude === "number") {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }
  if (locationName?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}`;
  return null;
}

export async function POST(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    startsAt?: string;
    endsAt?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
  };

  if (!body.title?.trim() || !body.startsAt) return NextResponse.json({ error: "title and startsAt required" }, { status: 400 });

  const event = await prisma.groupEvent.create({
    data: {
      groupId: context.params.groupId,
      creatorId: session.user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      locationName: body.locationName?.trim() || null,
      latitude: typeof body.latitude === "number" ? body.latitude : null,
      longitude: typeof body.longitude === "number" ? body.longitude : null,
      googleMapsUrl: buildGoogleMapsUrl(body.locationName, body.latitude, body.longitude),
    },
  });

  return NextResponse.json(event);
}

