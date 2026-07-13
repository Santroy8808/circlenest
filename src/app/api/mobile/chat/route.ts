import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  findOrCreateDirectChatThread,
  getChatThread,
  reactToChatMessage,
  safeListChatThreads,
  sendChatMessage
} from "@/modules/chat-messages/chat-messages.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (threadId) {
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
    const page = {
      ...(request.nextUrl.searchParams.get("afterMessageId")
        ? { afterMessageId: request.nextUrl.searchParams.get("afterMessageId") }
        : {}),
      ...(request.nextUrl.searchParams.get("afterCreatedAt")
        ? { afterCreatedAt: request.nextUrl.searchParams.get("afterCreatedAt") }
        : {}),
      ...(request.nextUrl.searchParams.get("beforeMessageId")
        ? { beforeMessageId: request.nextUrl.searchParams.get("beforeMessageId") }
        : {}),
      ...(request.nextUrl.searchParams.get("beforeCreatedAt")
        ? { beforeCreatedAt: request.nextUrl.searchParams.get("beforeCreatedAt") }
        : {}),
      ...(Number.isFinite(limit) ? { limit } : {})
    };
    const result = await getChatThread(session.user.id, threadId, page);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: Object.keys(page).length > 0 ? 400 : 404 });
    }
    return NextResponse.json({ thread: result.thread, messagePage: result.thread.messagePage });
  }

  return NextResponse.json({ threads: await safeListChatThreads(session.user.id) });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;

  if (body.action === "reactMessage") {
    const result = await reactToChatMessage(session.user.id, {
      messageId: body.messageId,
      type: body.type
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ reactions: result.reactions });
  }

  if (body.targetUserId) {
    const result = await findOrCreateDirectChatThread(session.user.id, { targetUserId: body.targetUserId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ thread: result.thread }, { status: 201 });
  }

  const attachmentInput = body.attachments ?? body.attachmentIds ?? body.attachmentMediaAssetIds ?? [];
  if (!Array.isArray(attachmentInput)) {
    return NextResponse.json({ error: "Attachments must be a list of uploaded attachment IDs." }, { status: 400 });
  }
  const attachments = attachmentInput.map((attachment) =>
    typeof attachment === "string" ? { mediaAssetId: attachment } : attachment
  );

  const result = await sendChatMessage(session.user.id, {
    threadId: body.threadId,
    body: body.body,
    attachments,
    replyToMessageId: body.replyToMessageId,
    replyStyle: body.replyStyle
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ message: result.message }, { status: 201 });
}
