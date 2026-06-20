import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { getMailThread, listMailThreads, sendMail } from "@/modules/mail/mail.service";

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
    recipientUserIds: body.recipientUserIds ?? [],
    subject: body.subject,
    bodyText: body.bodyText,
    bodyHtml: "",
    attachments: []
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ thread: result.thread }, { status: 201 });
}
