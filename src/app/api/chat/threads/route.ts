import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  createGroupChatThread,
  findOrCreateDirectChatThread,
  listChatThreads
} from "@/modules/chat-messages/chat-messages.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function GET() {
  if (!(await isFeatureEnabled("communication.direct_messages"))) return NextResponse.json({ error: "Direct messages are currently unavailable." }, { status: 503 });
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  return NextResponse.json({ threads: await listChatThreads(actor.actorUserId) });
}

export async function POST(request: NextRequest) {
  if (!(await isFeatureEnabled("communication.direct_messages"))) return NextResponse.json({ error: "Direct messages are currently unavailable." }, { status: 503 });
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const parsedBody = await readJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as { type?: unknown };
  const result =
    body.type === "GROUP"
      ? await createGroupChatThread(actor.actorUserId, parsedBody.value)
      : await findOrCreateDirectChatThread(actor.actorUserId, parsedBody.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ thread: result.thread }, { status: 201 });
}
