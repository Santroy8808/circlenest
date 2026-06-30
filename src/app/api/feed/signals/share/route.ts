import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { recordPostShareSignal } from "@/modules/feed-stream/hashtag-signals.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { postId?: unknown };
  const postId = typeof body.postId === "string" ? body.postId : "";

  if (!postId) {
    return NextResponse.json({ error: "Post ID required." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  await recordPostShareSignal(actor.actorUserId, postId);

  return NextResponse.json({ ok: true });
}
