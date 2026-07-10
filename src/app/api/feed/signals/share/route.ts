import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { shareFeedPost } from "@/modules/feed-stream/feed-stream.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const parsedBody = await readJsonRequest(request, 4 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as { postId?: unknown };
  const postId = typeof body.postId === "string" ? body.postId : "";

  if (!postId) {
    return NextResponse.json({ error: "Post ID required." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await shareFeedPost(actor.actorUserId, postId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
