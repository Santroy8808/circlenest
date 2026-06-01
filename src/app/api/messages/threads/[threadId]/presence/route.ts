import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getAuthorizedThread } from "@/lib/messages/thread-access";

export async function GET(_request: Request, context: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAuthorizedThread(context.params.threadId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const presenceRows = await prisma.messageThreadPresence.findMany({
    where: { threadId: access.thread.id },
    select: {
      userId: true,
      isTyping: true,
      lastTypedAt: true,
      lastSeenAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(presenceRows);
}

export async function PATCH(request: Request, context: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAuthorizedThread(context.params.threadId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => ({}))) as { typing?: boolean; seen?: boolean };
  const now = new Date();

  const row = await prisma.messageThreadPresence.upsert({
    where: { threadId_userId: { threadId: access.thread.id, userId: session.user.id } },
    create: {
      threadId: access.thread.id,
      userId: session.user.id,
      isTyping: Boolean(body.typing),
      lastTypedAt: body.typing ? now : null,
      lastSeenAt: body.seen ? now : null,
    },
    update: {
      isTyping: Boolean(body.typing),
      lastTypedAt: body.typing ? now : undefined,
      lastSeenAt: body.seen ? now : undefined,
    },
  });

  return NextResponse.json(row);
}
