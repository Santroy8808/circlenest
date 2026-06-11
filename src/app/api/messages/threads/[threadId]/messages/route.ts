import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";
import { getAuthorizedThread, getThreadParticipants, isGroupThread, threadOtherParticipant } from "@/lib/messages/thread-access";
import { deliverPushNotification } from "@/lib/notifications/push";

function isSchemaDriftError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function knownPrismaCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return null;
}

export async function GET(_request: Request, context: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAuthorizedThread(context.params.threadId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const thread = access.thread;

  await prisma.message.updateMany({
    where: { threadId: thread.id, senderId: { not: session.user.id }, readAt: null },
    data: { readAt: new Date() },
  });

  await prisma.messageThreadPresence.upsert({
    where: { threadId_userId: { threadId: thread.id, userId: session.user.id } },
    create: {
      threadId: thread.id,
      userId: session.user.id,
      isTyping: false,
      lastSeenAt: new Date(),
    },
    update: {
      isTyping: false,
      lastSeenAt: new Date(),
    },
  });

  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          fullName: true,
          profile: { select: { avatarUrl: true, displayName: true } },
        },
      },
    },
  });
  return NextResponse.json(messages);
}

export async function POST(request: Request, context: { params: { threadId: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await checkRateLimitPlaceholder(`message:${session.user.id}`);
    if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const body = (await request.json()) as { body?: string; clientMessageId?: string };
    const messageText = body.body?.trim();
    if (!messageText) return NextResponse.json({ error: "Message body required" }, { status: 400 });

    const access = await getAuthorizedThread(context.params.threadId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const thread = access.thread;

    let normalizedClientMessageId = body.clientMessageId?.trim() || null;
    if (normalizedClientMessageId) {
      try {
        const existing = await prisma.message.findFirst({
          where: {
            threadId: thread.id,
            senderId: session.user.id,
            clientMessageId: normalizedClientMessageId,
          },
        });
        if (existing) return NextResponse.json(existing);
      } catch (error) {
        if (isSchemaDriftError(error)) {
          normalizedClientMessageId = null;
        } else {
          throw error;
        }
      }
    }

    const recipientIds = isGroupThread(thread)
      ? getThreadParticipants(thread)
          .map((participant) => participant.id)
          .filter((recipientId) => recipientId !== session.user.id)
      : [threadOtherParticipant(thread, session.user.id).id];
    let msg;
    try {
      msg = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            threadId: thread.id,
            senderId: session.user.id,
            ...(normalizedClientMessageId ? { clientMessageId: normalizedClientMessageId } : {}),
            body: sanitizeUserText(messageText),
          },
        });
        await tx.messageThread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        });
        return created;
      });
    } catch (error) {
      if (isSchemaDriftError(error)) {
        msg = await prisma.$transaction(async (tx) => {
          const created = await tx.message.create({
            data: {
              threadId: thread.id,
              senderId: session.user.id,
              body: sanitizeUserText(messageText),
            },
          });
          await tx.messageThread.update({
            where: { id: thread.id },
            data: { updatedAt: new Date() },
          });
          return created;
        });
      } else {
        console.error("DM transaction failed", {
          code: knownPrismaCode(error),
          threadId: thread.id,
          senderId: session.user.id,
        });
        throw error;
      }
    }

    const notificationBody = isGroupThread(thread)
      ? `New group message from @${session.user.name ?? "member"}`
      : `New inbox message from @${session.user.name ?? "member"}`;
    for (const recipientId of recipientIds) {
      try {
        await prisma.notification.create({
          data: {
            userId: recipientId,
            type: "INBOX_MESSAGE",
            body: notificationBody,
            targetUrl: `/messages/${thread.id}`,
          },
        });
      } catch (error) {
        console.warn("DM notification creation failed; message still delivered", {
          code: knownPrismaCode(error),
          recipientId,
          threadId: thread.id,
        });
      }
    }

    await prisma.messageThreadPresence
      .upsert({
        where: { threadId_userId: { threadId: thread.id, userId: session.user.id } },
        create: {
          threadId: thread.id,
          userId: session.user.id,
          isTyping: false,
          lastSeenAt: new Date(),
        },
        update: {
          isTyping: false,
          lastSeenAt: new Date(),
        },
      })
      .catch(() => null);

    for (const recipientId of recipientIds) {
      await deliverPushNotification(
        recipientId,
        {
          title: isGroupThread(thread) ? "New group message" : "New message",
          body: isGroupThread(thread)
            ? "You received a new group message."
            : "You received a new direct message.",
          url: `/messages/${thread.id}`,
        },
        "notification",
      ).catch(() => null);
    }

    return NextResponse.json(msg);
  } catch (error) {
    console.error("Message send failed", { code: knownPrismaCode(error), error });
    return NextResponse.json({ error: "Message send failed on server. Please retry." }, { status: 500 });
  }
}
