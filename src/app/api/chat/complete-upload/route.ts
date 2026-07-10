import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { uploadIntentFailureResponse } from "@/lib/platform/upload-intent-response";
import { completeChatUpload } from "@/modules/chat-messages/chat-messages.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await readJsonRequest(request, 8 * 1024);
  if (!body.ok) return body.response;
  const result = await completeChatUpload(actor.actorUserId, body.value);

  if (!result.ok) {
    return uploadIntentFailureResponse(result);
  }

  return NextResponse.json({ intentId: result.intentId, attachment: result.attachment });
}
