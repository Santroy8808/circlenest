import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";
import { getAuthorizedThread } from "@/lib/messages/thread-access";

export async function PATCH(request: Request, context: { params: { threadId: string; messageId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAuthorizedThread(context.params.threadId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const thread = access.thread;

  const message = await prisma.message.findUnique({ where: { id: context.params.messageId } });
  if (!message || message.threadId !== thread.id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const body = (await request.json()) as { action?: "EDIT" | "HIDE" | "REPORT"; text?: string; reason?: string };

  if (body.action === "REPORT") {
    const reported = await prisma.messageModerationEvent.create({
      data: {
        threadId: thread.id,
        messageId: message.id,
        actorUserId: session.user.id,
        action: "REPORT",
        reason: body.reason?.trim() || null,
      },
    });

    await prisma.moderatorActionLog.create({
      data: {
        actorUserId: session.user.id,
        action: "REPORT_MESSAGE",
        targetType: "MESSAGE",
        targetId: message.id,
        note: body.reason?.trim() || "User reported from DM thread.",
      },
    });

    return NextResponse.json(reported);
  }

  if (message.senderId !== session.user.id) return NextResponse.json({ error: "Only sender can edit/hide message." }, { status: 403 });

  if (body.action === "HIDE") {
    const hidden = await prisma.message.update({
      where: { id: message.id },
      data: { body: "[Message hidden by sender]", hiddenBySenderAt: new Date() },
    });
    return NextResponse.json(hidden);
  }

  if (body.action === "EDIT") {
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });
    const edited = await prisma.message.update({
      where: { id: message.id },
      data: { body: sanitizeUserText(text), editedAt: new Date() },
    });
    return NextResponse.json(edited);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
