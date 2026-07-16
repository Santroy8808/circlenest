import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { markChatThreadRead } from "@/modules/chat-messages/chat-messages.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function POST(_request: Request, { params }: { params: { threadId: string } }) {
  if (!(await isFeatureEnabled("communication.direct_messages"))) return NextResponse.json({ error: "Direct messages are currently unavailable." }, { status: 503 });
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await markChatThreadRead(actor.actorUserId, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
