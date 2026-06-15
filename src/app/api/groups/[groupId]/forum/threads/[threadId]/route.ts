import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";

export async function PATCH(request: Request, context: { params: { groupId: string; threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.groupForumThread.findFirst({
    where: { id: context.params.threadId, groupId: context.params.groupId },
    select: { id: true, authorId: true, status: true },
  });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "END") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const allowed = thread.authorId === session.user.id || (await canModerateGroup(session.user.id, context.params.groupId));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (thread.status === "ENDED") return NextResponse.json({ ok: true, status: "ENDED" });

  await prisma.groupForumThread.update({
    where: { id: thread.id },
    data: { status: "ENDED", endedAt: new Date(), endedById: session.user.id },
  });

  return NextResponse.json({ ok: true, status: "ENDED" });
}

export async function DELETE(_request: Request, context: { params: { groupId: string; threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await canModerateGroup(session.user.id, context.params.groupId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const thread = await prisma.groupForumThread.findFirst({
    where: { id: context.params.threadId, groupId: context.params.groupId },
    select: { id: true, status: true },
  });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.status !== "ENDED") return NextResponse.json({ error: "Only ended threads can be deleted" }, { status: 409 });

  await prisma.groupForumThread.delete({ where: { id: thread.id } });
  return NextResponse.json({ ok: true, deleted: true });
}
