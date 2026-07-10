import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";
import { resolveChatAccessContext } from "@/modules/chat-messages/chat-access-policy";
import { searchChatContacts } from "@/modules/chat-messages/chat-messages.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 2) return NextResponse.json({ people: [] });

  const [people, context] = await Promise.all([
    searchChatContacts(session.user.id, query, "ALL"),
    resolveChatAccessContext(session.user.id)
  ]);
  if (!context.userId) return NextResponse.json({ people: [] });
  const devicePages = await prisma.$transaction(
    people.map((person) =>
      prisma.userDevice.findMany({
        where: {
          userId: person.id,
          revokedAt: null,
          user: { is: context.visibleUserWhere }
        },
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          deviceId: true,
          publicKey: true,
          lastSeenAt: true
        }
      })
    )
  );
  const devicesByUser = new Map(people.map((person, index) => [person.id, devicePages[index] ?? []]));

  return NextResponse.json({
    people: people.map((person) => ({
      id: person.id,
      username: person.username,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      devices: (devicesByUser.get(person.id) ?? []).map((device) => ({
        id: device.id,
        deviceId: device.deviceId,
        publicKey: device.publicKey,
        lastSeenAt: device.lastSeenAt.toISOString()
      }))
    }))
  });
}
