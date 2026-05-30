import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { username?: string };
  if (!body.username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const other = await prisma.user.findUnique({ where: { username: body.username } });
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
    };
  });

  return NextResponse.json(enriched);
}
