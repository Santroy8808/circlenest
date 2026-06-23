import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { mirrorThetaCommMessageToDesktopChat } from "@/modules/chat-messages/chat-messages.service";

type EnvelopeInput = {
  recipientUserId?: string;
  recipientDeviceId?: string;
  ciphertext?: string;
};

async function findOrCreateEncryptedThread(currentUserId: string, targetUserId?: string, threadId?: string) {
  if (threadId) {
    const existing = await prisma.encryptedChatThread.findFirst({
      where: {
        id: threadId,
        participants: { some: { userId: currentUserId } }
      }
    });
    return existing;
  }

  if (!targetUserId || targetUserId === currentUserId) return null;

  const existing = await prisma.encryptedChatThread.findFirst({
    where: {
      participants: {
        every: {
          userId: { in: [currentUserId, targetUserId] }
        }
      },
      AND: [
        { participants: { some: { userId: currentUserId } } },
        { participants: { some: { userId: targetUserId } } }
      ]
    }
  });

  if (existing) return existing;

  return prisma.encryptedChatThread.create({
    data: {
      participants: {
        create: [{ userId: currentUserId }, { userId: targetUserId }]
      }
    }
  });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const senderDeviceId = typeof body.senderDeviceId === "string" ? body.senderDeviceId.trim() : "";
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const desktopMirrorBody = typeof body.desktopMirrorBody === "string" ? body.desktopMirrorBody.trim() : "";
  const envelopes = Array.isArray(body.envelopes) ? (body.envelopes as EnvelopeInput[]) : [];

  if (!senderDeviceId || envelopes.length === 0) {
    return NextResponse.json({ error: "Sender device and encrypted envelopes are required." }, { status: 400 });
  }

  const senderDevice = await prisma.userDevice.findFirst({
    where: {
      id: senderDeviceId,
      userId: session.user.id,
      revokedAt: null
    }
  });

  if (!senderDevice) return NextResponse.json({ error: "Sender device is not registered." }, { status: 400 });

  const cleanEnvelopes = envelopes
    .map((envelope) => ({
      recipientUserId: typeof envelope.recipientUserId === "string" ? envelope.recipientUserId.trim() : "",
      recipientDeviceId: typeof envelope.recipientDeviceId === "string" ? envelope.recipientDeviceId.trim() : "",
      ciphertext: typeof envelope.ciphertext === "string" ? envelope.ciphertext.trim() : ""
    }))
    .filter((envelope) => envelope.recipientUserId && envelope.recipientDeviceId && envelope.ciphertext);

  if (cleanEnvelopes.length === 0) {
    return NextResponse.json({ error: "At least one valid encrypted envelope is required." }, { status: 400 });
  }

  const validDevices = await prisma.userDevice.findMany({
    where: {
      id: { in: cleanEnvelopes.map((envelope) => envelope.recipientDeviceId) },
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

  const thread = await findOrCreateEncryptedThread(session.user.id, targetUserId, threadId);
  if (!thread) return NextResponse.json({ error: "Encrypted chat thread not found." }, { status: 404 });

  const participantIds = new Set(
    (
      await prisma.encryptedChatParticipant.findMany({
        where: { threadId: thread.id },
        select: { userId: true }
      })
    ).map((participant) => participant.userId)
  );

  const illegalEnvelope = finalEnvelopes.find((envelope) => !participantIds.has(envelope.recipientUserId));
  if (illegalEnvelope) {
    return NextResponse.json({ error: "Recipient is not in this encrypted chat." }, { status: 400 });
  }

  const message = await prisma.$transaction(async (tx) => {
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
