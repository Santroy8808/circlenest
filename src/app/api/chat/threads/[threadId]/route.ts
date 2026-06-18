import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getChatThread } from "@/modules/chat-messages/chat-messages.service";

export async function GET(_request: Request, { params }: { params: { threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await getChatThread(session.user.id, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ thread: result.thread });
}
