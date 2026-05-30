import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";

export async function PATCH(request: Request, context: { params: { threadId: string; messageId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.messageThread.findUnique({ where: { id: context.params.threadId } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.userAId !== session.user.id && thread.userBId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const message = await prisma.message.findUnique({ where: { id: context.params.messageId } });
  if (!message || message.threadId !== thread.id) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (message.senderId !== session.user.id) return NextResponse.json({ error: "Only sender can edit/hide message." }, { status: 403 });

  const body = (await request.json()) as { action?: "EDIT" | "HIDE"; text?: string };
  if (body.action === "HIDE") {
    const hidden = await prisma.message.update({
      where: { id: message.id },
      data: { body: "[Message hidden by sender]" },
    });
    return NextResponse.json(hidden);
  }

  if (body.action === "EDIT") {
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });
    const edited = await prisma.message.update({
      where: { id: message.id },
      data: { body: sanitizeUserText(text) },
    });
    return NextResponse.json(edited);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

