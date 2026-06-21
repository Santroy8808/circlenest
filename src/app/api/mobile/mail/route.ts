import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";
import { getMailThread, listMailThreads, markMailThreadRead, sendMail } from "@/modules/mail/mail.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (threadId) {
    const result = await getMailThread(session.user.id, threadId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ thread: result.thread });
  }

  return NextResponse.json({
    threads: await listMailThreads(session.user.id, request.nextUrl.searchParams.get("folder") ?? "inbox")
  });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = await sendMail(session.user.id, {
    threadId: body.threadId,
    recipientUserIds: body.recipientUserIds ?? [],
    subject: body.subject,
    bodyText: body.bodyText,
    bodyHtml: "",
    attachments: body.attachments ?? []
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ thread: result.thread }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!threadId) return NextResponse.json({ error: "Mail thread is required." }, { status: 400 });

  if (action === "read") {
    const result = await markMailThreadRead(session.user.id, threadId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result);
  }

  const stamp = action === "archive" || action === "delete" ? new Date() : null;
  if (!["archive", "unarchive", "delete"].includes(action)) {
    return NextResponse.json({ error: "Unsupported mail action." }, { status: 400 });
  }

  await prisma.mailRecipient.updateMany({
    where: {
      userId: session.user.id,
      message: { threadId }
    },
    data:
      action === "archive"
        ? { archivedAt: stamp }
        : action === "delete"
          ? { deletedAt: stamp }
          : { archivedAt: null }
  });

  return NextResponse.json({ ok: true });
}
