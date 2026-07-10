import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { deleteFeedPost, getFeedPostThreadPage } from "@/modules/feed-stream/feed-stream.service";

export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const cursorCreatedAt = request.nextUrl.searchParams.get("cursorCreatedAt")?.trim();
  const cursorId = request.nextUrl.searchParams.get("cursorId")?.trim();
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  if (Boolean(cursorCreatedAt) !== Boolean(cursorId)) {
    return NextResponse.json({ error: "Both feed cursor fields are required." }, { status: 400 });
  }
  if (cursorCreatedAt && Number.isNaN(Date.parse(cursorCreatedAt))) {
    return NextResponse.json({ error: "Invalid feed cursor." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const page = await getFeedPostThreadPage(
    params.postId,
    {
      ...(cursorCreatedAt && cursorId ? { cursor: { createdAt: cursorCreatedAt, id: cursorId } } : {}),
      ...(Number.isFinite(limit) ? { limit } : {})
    },
    actor.actorUserId
  );

  if (!page?.post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  return NextResponse.json({ posts: [page.post], post: page.post, nextCursor: page.nextCursor, hasMore: page.hasMore });
}

export async function DELETE(_request: NextRequest, { params }: { params: { postId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await deleteFeedPost(actor.actorUserId, params.postId);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 404 });
}
