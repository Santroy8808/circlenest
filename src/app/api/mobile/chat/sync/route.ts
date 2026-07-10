import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";
import { resolveChatAccessContext } from "@/modules/chat-messages/chat-access-policy";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const deviceId = (request.nextUrl.searchParams.get("deviceId") ?? "").trim().slice(0, 65);
  const cursorThreadId = request.nextUrl.searchParams.get("cursorThreadId")?.trim();
  const cursorUpdatedAt = request.nextUrl.searchParams.get("cursorUpdatedAt")?.trim();
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 60) : 30;
  if (!deviceId || deviceId.length > 64) {
    return NextResponse.json({ error: "Device ID is required." }, { status: 400 });
  }
  if (Boolean(cursorThreadId) !== Boolean(cursorUpdatedAt)) {
    return NextResponse.json({ error: "Both encrypted chat cursor fields are required." }, { status: 400 });
  }
  const cursorDate = cursorUpdatedAt ? new Date(cursorUpdatedAt) : null;
  if ((cursorThreadId && cursorThreadId.length > 64) || (cursorDate && Number.isNaN(cursorDate.getTime()))) {
    return NextResponse.json({ error: "Invalid encrypted chat cursor." }, { status: 400 });
  }

  const [context, device] = await Promise.all([
    resolveChatAccessContext(session.user.id),
    prisma.userDevice.findFirst({
      where: {
        id: deviceId,
        userId: session.user.id,
        revokedAt: null
      }
    })
  ]);

  if (!context.userId || !device) {
    return NextResponse.json({ error: "Device is not registered." }, { status: 400 });
  }

  const threadRows = await prisma.encryptedChatThread.findMany({
    where: {
      AND: [
        { participants: { some: { userId: session.user.id } } },
        { participants: { every: { user: { is: context.visibleUserWhere } } } },
        ...(cursorDate && cursorThreadId
          ? [
              {
                OR: [
                  { updatedAt: { lt: cursorDate } },
                  { updatedAt: cursorDate, id: { lt: cursorThreadId } }
                ]
              }
            ]
          : [])
      ]
    },
    include: {
      participants: {
        include: {
          user: {
            include: {
              profile: true,
              devices: {
                where: { revokedAt: null },
                orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
                take: 5,
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
        where: { sender: { is: context.visibleUserWhere } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 80,
        include: {
          envelopes: {
            where: { recipientDeviceId: device.id }
          }
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1
  });
  const hasMore = threadRows.length > limit;
  const threads = threadRows.slice(0, limit);
  const lastThread = hasMore ? threads.at(-1) : null;

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
      const messages = [...thread.messages]
        .reverse()
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
    }),
    nextCursor: lastThread
      ? { cursorThreadId: lastThread.id, cursorUpdatedAt: lastThread.updatedAt.toISOString() }
      : null,
    hasMore
  });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 16 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  if (Array.isArray(body.envelopeIds) && body.envelopeIds.length > 100) {
    return NextResponse.json({ error: "Choose at most 100 encrypted messages." }, { status: 400 });
  }
  const envelopeIds = Array.isArray(body.envelopeIds)
    ? Array.from(
        new Set(
          body.envelopeIds
            .filter((id: unknown): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter((id) => id.length > 0 && id.length <= 64)
        )
      )
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
