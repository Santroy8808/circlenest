import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  hasBlockedRelationshipWithin,
  resolveChatAccessContext,
  type ChatAccessContext
} from "@/modules/chat-messages/chat-access-policy";
import {
  assertChatMessageWriteAllowed,
  resolveChatRetentionClassForWrite,
  validateEncryptedEnvelopeDevicesForWrite
} from "@/modules/chat-messages/chat-retention";
import { mirrorThetaCommMessageToDesktopChat } from "@/modules/chat-messages/chat-messages.service";

type EnvelopeInput = {
  recipientUserId?: string;
  recipientDeviceId?: string;
  ciphertext?: string;
};

async function findOrCreateEncryptedThread(context: ChatAccessContext, targetUserId?: string, threadId?: string) {
  const currentUserId = context.userId;
  if (!currentUserId) return null;

  if (threadId) {
    const existing = await prisma.encryptedChatThread.findFirst({
      where: {
        id: threadId,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          ...(context.blockedUserIds.length > 0
            ? [{ participants: { none: { userId: { in: context.blockedUserIds } } } }]
            : [])
        ]
      }
    });
    return existing;
  }

  if (!targetUserId || targetUserId === currentUserId) return null;

  const target = await prisma.user.findFirst({
    where: { AND: [{ id: targetUserId }, context.visibleUserWhere] },
    select: { id: true }
  });
  if (!target) return null;

  const existingCandidates = await prisma.encryptedChatThread.findMany({
    where: {
      participants: {
        every: {
          userId: { in: [currentUserId, target.id] }
        }
      },
      AND: [
        { participants: { some: { userId: currentUserId } } },
        { participants: { some: { userId: target.id } } }
      ]
    },
    include: { participants: true },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 10
  });
  const existing = existingCandidates.find((candidate) => candidate.participants.length === 2);

  if (existing) return existing;

  const participantUserIds = [currentUserId, target.id];
  return prisma.$transaction(async (tx) => {
    const retentionClass = await resolveChatRetentionClassForWrite(tx, participantUserIds);
    return tx.encryptedChatThread.create({
      data: {
        retentionClass,
        participants: {
          create: participantUserIds.map((userId) => ({ userId }))
        }
      }
    });
  });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 256 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const senderDeviceId = typeof body.senderDeviceId === "string" ? body.senderDeviceId.trim().slice(0, 65) : "";
  const threadId = typeof body.threadId === "string" ? body.threadId.trim().slice(0, 65) : "";
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim().slice(0, 65) : "";
  const desktopMirrorBody = typeof body.desktopMirrorBody === "string" ? body.desktopMirrorBody.trim() : "";
  const envelopes = Array.isArray(body.envelopes) ? (body.envelopes as EnvelopeInput[]) : [];

  if (!senderDeviceId || senderDeviceId.length > 64 || envelopes.length === 0 || envelopes.length > 100) {
    return NextResponse.json({ error: "Sender device and encrypted envelopes are required." }, { status: 400 });
  }
  if (threadId.length > 64 || targetUserId.length > 64 || (!threadId && !targetUserId) || desktopMirrorBody.length > 4_000) {
    return NextResponse.json({ error: "Invalid encrypted chat request." }, { status: 400 });
  }

  const [context, senderDevice] = await Promise.all([
    resolveChatAccessContext(session.user.id),
    prisma.userDevice.findFirst({
      where: {
        id: senderDeviceId,
        userId: session.user.id,
        revokedAt: null
      }
    })
  ]);

  if (!context.userId || !senderDevice) {
    return NextResponse.json({ error: "Sender device is not registered." }, { status: 400 });
  }

  const cleanEnvelopes = envelopes
    .map((input) => {
      const envelope =
        typeof input === "object" && input !== null && !Array.isArray(input) ? (input as EnvelopeInput) : {};
      return {
        recipientUserId:
          typeof envelope.recipientUserId === "string" ? envelope.recipientUserId.trim().slice(0, 65) : "",
        recipientDeviceId:
          typeof envelope.recipientDeviceId === "string" ? envelope.recipientDeviceId.trim().slice(0, 65) : "",
        ciphertext: typeof envelope.ciphertext === "string" ? envelope.ciphertext.trim().slice(0, 65_537) : ""
      };
    })
    .filter(
      (envelope) =>
        envelope.recipientUserId &&
        envelope.recipientUserId.length <= 64 &&
        envelope.recipientDeviceId &&
        envelope.recipientDeviceId.length <= 64 &&
        envelope.ciphertext &&
        envelope.ciphertext.length <= 65_536
    );

  if (cleanEnvelopes.length === 0) {
    return NextResponse.json({ error: "At least one valid encrypted envelope is required." }, { status: 400 });
  }

  const thread = await findOrCreateEncryptedThread(context, targetUserId, threadId);
  if (!thread) return NextResponse.json({ error: "Encrypted chat thread not found." }, { status: 404 });

  const participants = await prisma.encryptedChatParticipant.findMany({
    where: { threadId: thread.id },
    select: {
      userId: true,
      user: { select: { deactivatedAt: true } }
    }
  });
  const participantIds = new Set(participants.map((participant) => participant.userId));
  if (
    !participantIds.has(session.user.id) ||
    participants.some((participant) => participant.user.deactivatedAt) ||
    (await hasBlockedRelationshipWithin(Array.from(participantIds)))
  ) {
    return NextResponse.json({ error: "Encrypted chat thread not found." }, { status: 404 });
  }

  const validDevices = await prisma.userDevice.findMany({
    where: {
      id: { in: cleanEnvelopes.map((envelope) => envelope.recipientDeviceId) },
      userId: { in: Array.from(participantIds) },
      revokedAt: null
    },
    select: { id: true, userId: true }
  });
  const validDeviceMap = new Map(validDevices.map((device) => [device.id, device.userId]));
  const finalEnvelopes = cleanEnvelopes.filter(
    (envelope) => validDeviceMap.get(envelope.recipientDeviceId) === envelope.recipientUserId
  );

  if (finalEnvelopes.length === 0) {
    return NextResponse.json({ error: "No valid recipient devices were found." }, { status: 400 });
  }

  const illegalEnvelope = finalEnvelopes.find((envelope) => !participantIds.has(envelope.recipientUserId));
  if (illegalEnvelope) {
    return NextResponse.json({ error: "Recipient is not in this encrypted chat." }, { status: 400 });
  }

  const message = await prisma.$transaction(async (tx) => {
    const allowed = await assertChatMessageWriteAllowed(tx, {
      threadKind: "ENCRYPTED",
      threadId: thread.id,
      senderUserId: session.user.id
    });
    if (!allowed) return null;
    const devicesValid = await validateEncryptedEnvelopeDevicesForWrite(tx, {
      participantUserIds: allowed.participantUserIds,
      envelopes: finalEnvelopes,
      senderDevice: { id: senderDevice.id, userId: session.user.id }
    });
    if (!devicesValid) return null;

    const created = await tx.encryptedChatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: session.user.id,
        senderDeviceId: senderDevice.id,
        envelopes: {
          create: finalEnvelopes.map((envelope) => ({
            recipientUserId: envelope.recipientUserId,
            recipientDeviceId: envelope.recipientDeviceId,
            ciphertext: envelope.ciphertext
          }))
        }
      },
      include: { envelopes: true }
    });

    await tx.encryptedChatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: created.createdAt }
    });

    await tx.userDevice.update({
      where: { id: senderDevice.id },
      data: { lastSeenAt: new Date() }
    });

    return created;
  });

  if (!message) {
    return NextResponse.json({ error: "Encrypted chat thread not found." }, { status: 404 });
  }

  if (desktopMirrorBody) {
    try {
      await mirrorThetaCommMessageToDesktopChat({
        senderUserId: session.user.id,
        participantUserIds: Array.from(participantIds),
        body: desktopMirrorBody
      });
    } catch (error) {
      await diagnostics.warn("mobile-chat", "Could not mirror ThetaComm message to desktop chat.", {
        userId: session.user.id,
        encryptedThreadId: thread.id,
        encryptedMessageId: message.id,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return NextResponse.json({
    message: {
      id: message.id,
      threadId: message.threadId,
      senderUserId: message.senderUserId,
      senderDeviceId: message.senderDeviceId,
      createdAt: message.createdAt.toISOString(),
      envelopes: message.envelopes.map((envelope) => ({
        id: envelope.id,
        recipientUserId: envelope.recipientUserId,
        recipientDeviceId: envelope.recipientDeviceId,
        ciphertext: envelope.ciphertext
      }))
    }
  });
}
