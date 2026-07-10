import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getChatThread } from "@/modules/chat-messages/chat-messages.service";

export async function GET(request: NextRequest, { params }: { params: { threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const searchParams = request.nextUrl.searchParams;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const page = {
    ...(searchParams.get("afterMessageId") ? { afterMessageId: searchParams.get("afterMessageId") } : {}),
    ...(searchParams.get("afterCreatedAt") ? { afterCreatedAt: searchParams.get("afterCreatedAt") } : {}),
    ...(searchParams.get("beforeMessageId") ? { beforeMessageId: searchParams.get("beforeMessageId") } : {}),
    ...(searchParams.get("beforeCreatedAt") ? { beforeCreatedAt: searchParams.get("beforeCreatedAt") } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  };
  const result = await getChatThread(actor.actorUserId, params.threadId, page);

  if (!result.ok) {
    const isCursorRequest = Object.keys(page).length > 0;
    return NextResponse.json({ error: result.error }, { status: isCursorRequest ? 400 : 404 });
  }

  return NextResponse.json({ thread: result.thread, messagePage: result.thread.messagePage });
}
