import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const deviceId = (request.nextUrl.searchParams.get("deviceId") ?? "").trim();
  if (!deviceId) return NextResponse.json({ error: "Device ID is required." }, { status: 400 });

  const device = await prisma.userDevice.findFirst({
    where: {
      id: deviceId,
      userId: session.user.id,
      revokedAt: null
    }
  });

  if (!device) return NextResponse.json({ error: "Device is not registered." }, { status: 400 });

  const threads = await prisma.encryptedChatThread.findMany({
    where: {
      participants: { some: { userId: session.user.id } }
    },
    include: {
      participants: {
        include: {
          user: {
            include: {
              profile: true,
              devices: {
                where: { revokedAt: null },
                select: {
                  id: true,
                  deviceId: true,
                  publicKey: true,
                  lastSeenAt: true
                }
              }
            }
          }
        }
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 80,
        include: {
          envelopes: {
            where: { recipientDeviceId: device.id }
          }
        }
      }
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 60
  });

  await prisma.userDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() }
  });

  return NextResponse.json({
    device: {
      id: device.id,
      deviceId: device.deviceId
    },
    threads: threads.map((thread) => {
      const messages = thread.messages
        .map((message) => {
          const envelope = message.envelopes[0];
          if (!envelope) return null;
          return {
            id: message.id,
            threadId: thread.id,
            senderUserId: message.senderUserId,
            senderDeviceId: message.senderDeviceId,
            createdAt: message.createdAt.toISOString(),
            envelopeId: envelope.id,
            ciphertext: envelope.ciphertext,
            readAt: envelope.readAt?.toISOString() ?? null
          };
        })
        .filter(Boolean);
      const otherParticipants = thread.participants.filter((participant) => participant.userId !== session.user.id);
      const title =
        otherParticipants.map((participant) => participant.user.profile?.displayName ?? participant.user.username).join(", ") ||
        "Encrypted chat";

      return {
        id: thread.id,
        title,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? thread.updatedAt.toISOString(),
        participants: thread.participants.map((participant) => ({
          id: participant.user.id,
          username: participant.user.username,
          displayName: participant.user.profile?.displayName ?? participant.user.username,
          avatarUrl: participant.user.profile?.avatarUrl,
          devices: participant.user.devices.map((device) => ({
            id: device.id,
            deviceId: device.deviceId,
            publicKey: device.publicKey,
            lastSeenAt: device.lastSeenAt.toISOString()
          }))
        })),
        messages
      };
    })
  });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const envelopeIds = Array.isArray(body.envelopeIds)
    ? body.envelopeIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  if (envelopeIds.length === 0) return NextResponse.json({ ok: true });

  await prisma.encryptedChatEnvelope.updateMany({
    where: {
      id: { in: envelopeIds },
      recipientUserId: session.user.id
    },
    data: { readAt: new Date() }
  });

  return NextResponse.json({ ok: true });
}
