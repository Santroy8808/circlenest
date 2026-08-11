import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { updateFeedComment } from "@/modules/feed-stream/feed-stream.service";

export async function PUT(request: NextRequest, props: { params: Promise<{ commentId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request, 4 * 1024);
  if (!body.ok) return body.response;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await updateFeedComment(actor.actorUserId, params.commentId, body.value);
  if (!result.ok) {
    const status = result.error.toLowerCase().includes("cannot edit") || result.error.toLowerCase().includes("not authorized") ? 403 : 400;
    return NextResponse.json({ error: result.error, commentId: params.commentId }, { status });
  }

  return NextResponse.json({ comment: result.comment });
}
