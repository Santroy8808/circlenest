import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";
import { deliverPushNotification } from "@/lib/notifications/push";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { username?: string; userId?: string; initialMessage?: string };
  const normalizedUsername = body.username?.trim().replace(/^@+/, "") ?? "";
  const normalizedUserId = body.userId?.trim() ?? "";
  if (!normalizedUsername && !normalizedUserId) {
    return NextResponse.json({ error: "username or userId required" }, { status: 400 });
  }

  const other = normalizedUserId
    ? await prisma.user.findUnique({ where: { id: normalizedUserId } })
    : await prisma.user.findFirst({
        where: { username: { equals: normalizedUsername, mode: "insensitive" } },
      });
  if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (other.id === session.user.id) return NextResponse.json({ error: "Invalid target" }, { status: 400 });

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { userId: session.user.id, blockedUserId: other.id },
        { userId: other.id, blockedUserId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return NextResponse.json({ error: "Messaging blocked by user settings." }, { status: 403 });

  let thread = await prisma.messageThread.findFirst({
    where: {
      OR: [
        { userAId: session.user.id, userBId: other.id },
        { userAId: other.id, userBId: session.user.id },
      ],
    },
  });

  if (!thread) {
    thread = await prisma.messageThread.create({ data: { userAId: session.user.id, userBId: other.id } });
  }

  const initialMessage = body.initialMessage?.trim();
  if (initialMessage) {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: session.user.id,
          body: sanitizeUserText(initialMessage),
        },
      }),
      prisma.messageThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      }),
      prisma.notification.create({
        data: {
          userId: other.id,
          type: "INBOX_MESSAGE",
          body: `New inbox message from @${session.user.name ?? "member"}`,
        },
      }),
    ]);
    await deliverPushNotification(other.id, {
      title: "New message",
      body: "You received a new direct message.",
      url: `/messages/${thread.id}`,
    });
  }

  return NextResponse.json(thread);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await prisma.messageThread.findMany({
    where: { OR: [{ userAId: session.user.id }, { userBId: session.user.id }] },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });

  const otherIds = threads.map((t) => (t.userAId === session.user.id ? t.userBId : t.userAId));
  const threadIds = threads.map((t) => t.id);

  const [others, unreadRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: {
        id: true,
        username: true,
        fullName: true,
        profile: {
          select: {
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.message.groupBy({
      by: ["threadId"],
      where: {
        threadId: { in: threadIds },
        senderId: { not: session.user.id },
        readAt: null,
      },
      _count: { _all: true },
    }),
  ]);

  const otherMap = new Map(
    others.map((o) => [
      o.id,
      {
        username: o.username,
        displayName: o.profile?.displayName ?? o.fullName ?? o.username,
        avatarUrl: o.profile?.avatarUrl ?? null,
      },
    ]),
  );
  const unreadMap = new Map(unreadRows.map((r) => [r.threadId, r._count._all]));

  const enriched = threads.map((t) => {
    const otherId = t.userAId === session.user.id ? t.userBId : t.userAId;
    const other = otherMap.get(otherId);
    return {
      ...t,
      otherUsername: other?.username ?? "unknown",
      otherDisplayName: other?.displayName ?? "unknown",
      otherAvatarUrl: other?.avatarUrl ?? null,
      unread: unreadMap.get(t.id) ?? 0,
      lastMessageBody: t.messages[0]?.body ?? "",
      lastMessageAt: t.messages[0]?.createdAt ?? t.updatedAt,
    };
  });

  return NextResponse.json(enriched);
}
