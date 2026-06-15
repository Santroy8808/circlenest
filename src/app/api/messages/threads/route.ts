import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";
import { deliverPushNotification } from "@/lib/notifications/push";

type ThreadSummaryUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type ThreadSummary = {
  id: string;
  surface: string;
  kind: string;
  title: string | null;
  displayLabel: string;
  subtitle: string;
  participantCount: number;
  participants: ThreadSummaryUser[];
  unread: number;
  lastMessageBody: string;
  lastMessageAt: string;
};

function normalizeUsername(value?: string) {
  return value?.trim().replace(/^@+/, "") ?? "";
}

function getDisplayName(user: { username: string; fullName: string | null; profile?: { displayName: string | null; avatarUrl: string | null } | null }) {
  return user.profile?.displayName ?? user.fullName ?? user.username;
}

function normalizeSurface(value?: string) {
  return value === "MAIL" ? "MAIL" : "CHAT";
}

function directThreadKey(surface: string, userAId: string, userBId: string) {
  return `${surface}:${[userAId, userBId].sort().join(":")}`;
}

async function loadFriendIds(userId: string) {
  const links = await prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } });
  return new Set(links.map((link) => (link.userAId === userId ? link.userBId : link.userAId)));
}

async function loadBlockedIds(userId: string, otherIds: string[]) {
  if (!otherIds.length) return new Set<string>();
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [
        { userId, blockedUserId: { in: otherIds } },
        { userId: { in: otherIds }, blockedUserId: userId },
      ],
    },
    select: { userId: true, blockedUserId: true },
  });
  return new Set(rows.flatMap((row) => [row.userId, row.blockedUserId]).filter((value): value is string => Boolean(value)));
}

async function createThreadInitialMessage(threadId: string, senderId: string, body: string) {
  const msg = await prisma.message.create({
    data: {
      threadId,
      senderId,
      body: sanitizeUserText(body),
    },
  });
  await prisma.messageThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
  return msg;
}

async function notifyThreadRecipients(threadId: string, senderId: string, recipientIds: string[], body: string, title: string) {
  const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id !== senderId)));
  for (const recipientId of uniqueRecipients) {
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: "INBOX_MESSAGE",
        body,
        targetUrl: `/messages/${threadId}`,
      },
    });
    await deliverPushNotification(recipientId, {
      title,
      body,
      url: `/messages/${threadId}`,
    }).catch(() => null);
  }
}

function defaultGroupTitle(names: string[]) {
  const clipped = names.slice(0, 3);
  if (!clipped.length) return "Group chat";
  return clipped.length === names.length ? `Chat with ${clipped.join(", ")}` : `Chat with ${clipped.join(", ")} and others`;
}

function isGroupThread(thread: { kind?: string | null }) {
  return (thread.kind ?? "DIRECT") === "GROUP";
}

async function buildThreadSummaries(sessionUserId: string, surface: "CHAT" | "MAIL"): Promise<ThreadSummary[]> {
  const [directThreads, groupThreads] = await Promise.all([
    prisma.messageThread.findMany({
      where: {
        surface,
        kind: "DIRECT",
        OR: [
          { userAId: sessionUserId },
          { userBId: sessionUserId },
          { participants: { some: { userId: sessionUserId } } },
        ],
      },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        userA: { select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        userB: { select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        participants: { include: { user: { select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.messageThread.findMany({
      where: {
        surface,
        kind: "GROUP",
        participants: { some: { userId: sessionUserId } },
      },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        createdBy: { select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        participants: { include: { user: { select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const allThreads = [...directThreads, ...groupThreads];
  const threadIds = allThreads.map((thread) => thread.id);
  const unreadRows = threadIds.length
    ? await prisma.message.groupBy({
        by: ["threadId"],
        where: {
          threadId: { in: threadIds },
          senderId: { not: sessionUserId },
          readAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const unreadMap = new Map(unreadRows.map((row) => [row.threadId, row._count._all]));

  return allThreads
    .map((thread) => {
      const lastMessage = thread.messages[0];
      const participants = thread.participants.map((participant) => ({
        id: participant.user.id,
        username: participant.user.username,
        displayName: getDisplayName(participant.user),
        avatarUrl: participant.user.profile?.avatarUrl ?? null,
      }));

      if (isGroupThread(thread)) {
        const groupParticipants = participants.filter((participant) => participant.id !== sessionUserId);
        const participantNames = groupParticipants.map((participant) => `@${participant.username}`);
        return {
          id: thread.id,
          surface: thread.surface,
          kind: thread.kind,
          title: thread.title,
          displayLabel: thread.title ?? defaultGroupTitle(participantNames.map((name) => name.replace(/^@/, ""))),
          subtitle: `${participants.length} participants`,
          participantCount: participants.length,
          participants,
          unread: unreadMap.get(thread.id) ?? 0,
          lastMessageBody: lastMessage?.body ?? "",
          lastMessageAt: (lastMessage?.createdAt ?? thread.updatedAt).toISOString(),
        };
      }

      const directThread = thread as (typeof directThreads)[number];
      const other = directThread.userAId === sessionUserId ? directThread.userB : directThread.userA;
      const otherDisplay = getDisplayName(other);
      return {
        id: thread.id,
        surface: thread.surface,
        kind: thread.kind,
        title: null,
        displayLabel: otherDisplay,
        subtitle: `@${other.username}`,
        participantCount: 2,
        participants: [
          {
            id: directThread.userA.id,
            username: directThread.userA.username,
            displayName: getDisplayName(directThread.userA),
            avatarUrl: directThread.userA.profile?.avatarUrl ?? null,
          },
          {
            id: directThread.userB.id,
            username: directThread.userB.username,
            displayName: getDisplayName(directThread.userB),
            avatarUrl: directThread.userB.profile?.avatarUrl ?? null,
          },
        ],
        unread: unreadMap.get(thread.id) ?? 0,
        lastMessageBody: lastMessage?.body ?? "",
        lastMessageAt: (lastMessage?.createdAt ?? thread.updatedAt).toISOString(),
      };
    })
    .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    surface?: "CHAT" | "MAIL";
    mode?: "DIRECT" | "GROUP";
    username?: string;
    userId?: string;
    participantIds?: string[];
    title?: string;
    initialMessage?: string;
  };

  const surface = normalizeSurface(body.surface);
  const mode = body.mode === "GROUP" ? "GROUP" : "DIRECT";
  const initialMessage = body.initialMessage?.trim() ?? "";

  if (mode === "DIRECT") {
    const normalizedUsername = normalizeUsername(body.username);
    const normalizedUserId = body.userId?.trim() ?? "";
    if (!normalizedUsername && !normalizedUserId) {
      return NextResponse.json({ error: "username or userId required" }, { status: 400 });
    }

    const other = normalizedUserId
      ? await prisma.user.findUnique({ where: { id: normalizedUserId }, select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } })
      : await prisma.user.findFirst({
          where: { username: { equals: normalizedUsername } },
          select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } },
        });
    if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (other.id === session.user.id) return NextResponse.json({ error: "Invalid target" }, { status: 400 });

    const friendIds = await loadFriendIds(session.user.id);
    if (surface === "CHAT" && friendIds.has(other.id)) {
      return NextResponse.json({ error: "Use a group chat for friends/family." }, { status: 403 });
    }

    const blockedIds = await loadBlockedIds(session.user.id, [other.id]);
    if (blockedIds.has(other.id)) return NextResponse.json({ error: "Messaging blocked by user settings." }, { status: 403 });

    let thread = await prisma.messageThread.findFirst({
      where: {
        kind: "DIRECT",
        surface,
        OR: [
          { threadKey: directThreadKey(surface, session.user.id, other.id) },
          { userAId: session.user.id, userBId: other.id },
          { userAId: other.id, userBId: session.user.id },
          { participants: { some: { userId: other.id } } },
        ],
      },
    });

    if (!thread) {
      thread = await prisma.messageThread.create({
        data: {
          surface,
          kind: "DIRECT",
          threadKey: directThreadKey(surface, session.user.id, other.id),
          userAId: session.user.id,
          userBId: other.id,
          createdById: session.user.id,
        },
      });
      await prisma.messageThreadParticipant.createMany({
      data: [
          { threadId: thread.id, userId: session.user.id, addedById: session.user.id, role: "CREATOR" },
          { threadId: thread.id, userId: other.id, addedById: session.user.id, role: "MEMBER" },
        ],
      });
    }

    if (initialMessage) {
      const msg = await createThreadInitialMessage(thread.id, session.user.id, initialMessage);
      await notifyThreadRecipients(
        thread.id,
        session.user.id,
        [other.id],
        surface === "MAIL" ? `New mail from @${session.user.name ?? "member"}` : `New inbox message from @${session.user.name ?? "member"}`,
        surface === "MAIL" ? "New mail" : "New message",
      );
      return NextResponse.json({ id: thread.id, messageId: msg.id });
    }

    return NextResponse.json({ id: thread.id });
  }

  const rawIds = Array.isArray(body.participantIds) ? body.participantIds : [];
  const participantIds = Array.from(new Set(rawIds.map((value) => value.trim()).filter(Boolean))).filter((value) => value !== session.user.id);
  if (!participantIds.length) return NextResponse.json({ error: "Select at least one friend." }, { status: 400 });

  const friendIds = await loadFriendIds(session.user.id);
  const invalid = participantIds.filter((id) => !friendIds.has(id));
  if (invalid.length) return NextResponse.json({ error: "Group chats are friends/family only." }, { status: 403 });

  const blockedIds = await loadBlockedIds(session.user.id, participantIds);
  if (participantIds.some((id) => blockedIds.has(id))) {
    return NextResponse.json({ error: "Messaging blocked by user settings." }, { status: 403 });
  }

  const participants = await prisma.user.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } },
  });
  if (participants.length !== participantIds.length) {
    return NextResponse.json({ error: "One or more participants not found." }, { status: 404 });
  }

  const title = body.title?.trim() || defaultGroupTitle(participants.map((person) => getDisplayName(person)));
  const thread = await prisma.messageThread.create({
    data: {
      surface,
      kind: "GROUP",
      threadKey: `group:${randomUUID()}`,
      title,
      userAId: session.user.id,
      userBId: participants[0]?.id ?? session.user.id,
      createdById: session.user.id,
    },
  });

  await prisma.messageThreadParticipant.createMany({
    data: [
      { threadId: thread.id, userId: session.user.id, addedById: session.user.id, role: "CREATOR" },
      ...participantIds.map((participantId) => ({
        threadId: thread.id,
        userId: participantId,
        addedById: session.user.id,
        role: "MEMBER",
      })),
    ],
  });

  if (initialMessage) {
    const msg = await createThreadInitialMessage(thread.id, session.user.id, initialMessage);
    await notifyThreadRecipients(
      thread.id,
      session.user.id,
      participantIds,
      surface === "MAIL" ? `New group mail from @${session.user.name ?? "member"}` : `New group message from @${session.user.name ?? "member"}`,
      surface === "MAIL" ? "New group mail" : "New group chat",
    );
    return NextResponse.json({ id: thread.id, messageId: msg.id });
  }

  return NextResponse.json({ id: thread.id });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const surface = normalizeSurface(searchParams.get("surface") ?? undefined);
  const threads = await buildThreadSummaries(session.user.id, surface);
  return NextResponse.json(threads);
}
