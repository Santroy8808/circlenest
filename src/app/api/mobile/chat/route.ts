import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  findOrCreateDirectChatThread,
  getChatThread,
  safeListChatThreads,
  sendChatMessage
} from "@/modules/chat-messages/chat-messages.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (threadId) {
    const result = await getChatThread(session.user.id, threadId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ thread: result.thread });
  }

  return NextResponse.json({ threads: await safeListChatThreads(session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  if (body.targetUserId) {
    const result = await findOrCreateDirectChatThread(session.user.id, { targetUserId: body.targetUserId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ thread: result.thread }, { status: 201 });
  }

  const result = await sendChatMessage(session.user.id, {
    threadId: body.threadId,
    body: body.body,
    attachments: []
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ message: result.message }, { status: 201 });
}
