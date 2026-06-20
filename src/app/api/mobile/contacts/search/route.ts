import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ people: [] });

  const people = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },
      deactivatedAt: null,
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
        { profile: { displayName: { contains: query, mode: "insensitive" } } },
        { profile: { location: { contains: query, mode: "insensitive" } } }
      ]
    },
    include: {
      profile: true,
      devices: {
        where: { revokedAt: null },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          deviceId: true,
          publicKey: true,
          lastSeenAt: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 25
  });

  return NextResponse.json({
    people: people.map((person) => ({
      id: person.id,
      email: person.email,
      username: person.username,
      displayName: person.profile?.displayName ?? person.username,
      avatarUrl: person.profile?.avatarUrl,
      location: person.profile?.location,
      devices: person.devices.map((device) => ({
        id: device.id,
        deviceId: device.deviceId,
        publicKey: device.publicKey,
        lastSeenAt: device.lastSeenAt.toISOString()
      }))
    }))
  });
}
