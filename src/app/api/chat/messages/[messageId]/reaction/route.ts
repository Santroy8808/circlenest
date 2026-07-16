import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { reactToChatMessage } from "@/modules/chat-messages/chat-messages.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function POST(request: NextRequest, context: { params: { messageId: string } }) {
  if (!(await isFeatureEnabled("communication.direct_messages"))) return NextResponse.json({ error: "Direct messages are currently unavailable." }, { status: 503 });
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" ? (body.value as Record<string, unknown>) : {};

  const result = await reactToChatMessage(actor.actorUserId, {
    ...value,
    messageId: context.params.messageId
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ reactions: result.reactions });
}
