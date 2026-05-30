import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";

export async function GET(_request: Request, context: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.messageThread.findUnique({ where: { id: context.params.threadId } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.userAId !== session.user.id && thread.userBId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.message.updateMany({
    where: { threadId: thread.id, senderId: { not: session.user.id }, readAt: null },
    data: { readAt: new Date() },
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

  const body = (await request.json()) as { body?: string };
  if (!body.body?.trim()) return NextResponse.json({ error: "Message body required" }, { status: 400 });

  const thread = await prisma.messageThread.findUnique({ where: { id: context.params.threadId } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.userAId !== session.user.id && thread.userBId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const msg = await prisma.message.create({
    data: {
      threadId: thread.id,
      senderId: session.user.id,
      body: sanitizeUserText(body.body),
    },
  });

  const receiverId = thread.userAId === session.user.id ? thread.userBId : thread.userAId;
  await prisma.notification.create({ data: { userId: receiverId, type: "NEW_MESSAGE", body: "You received a new message" } });

  return NextResponse.json(msg);
}
