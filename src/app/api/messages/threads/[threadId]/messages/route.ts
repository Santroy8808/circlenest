import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";
import { getAuthorizedThread } from "@/lib/messages/thread-access";
import { deliverPushNotification } from "@/lib/notifications/push";

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
    orderBy: { createdAt: "asc" },
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

  const normalizedClientMessageId = body.clientMessageId?.trim() || null;
  if (normalizedClientMessageId) {
    const existing = await prisma.message.findFirst({
      where: {
        threadId: thread.id,
        senderId: session.user.id,
        clientMessageId: normalizedClientMessageId,
      },
    });
    if (existing) return NextResponse.json(existing);
  }

  const receiverId = thread.userAId === session.user.id ? thread.userBId : thread.userAId;
  const msg = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        threadId: thread.id,
        senderId: session.user.id,
        clientMessageId: normalizedClientMessageId,
        body: sanitizeUserText(messageText),
      },
    });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    await tx.messageThreadPresence.upsert({
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
    await tx.notification.create({
      data: {
        userId: receiverId,
        type: "INBOX_MESSAGE",
        body: `New inbox message from @${session.user.name ?? "member"}`,
      },
    });
    return created;
  });

  await deliverPushNotification(receiverId, {
    title: "New message",
    body: "You received a new direct message.",
    url: `/messages/${thread.id}`,
  });

  return NextResponse.json(msg);
}
