import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { createFeedComment, listFeedCommentsPage } from "@/modules/feed-stream/feed-stream.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const postId = request.nextUrl.searchParams.get("postId")?.trim() ?? "";
  const parentCommentId = request.nextUrl.searchParams.get("parentCommentId")?.trim() || null;
  const cursorCreatedAt = request.nextUrl.searchParams.get("cursorCreatedAt")?.trim();
  const cursorId = request.nextUrl.searchParams.get("cursorId")?.trim();
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;

  if (!postId) return NextResponse.json({ error: "Post ID required." }, { status: 400 });
  if (Boolean(cursorCreatedAt) !== Boolean(cursorId)) {
    return NextResponse.json({ error: "Both feed cursor fields are required." }, { status: 400 });
  }
  if (cursorCreatedAt && Number.isNaN(Date.parse(cursorCreatedAt))) {
    return NextResponse.json({ error: "Invalid feed cursor." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const page = await listFeedCommentsPage(
    postId,
    parentCommentId,
    {
      ...(cursorCreatedAt && cursorId ? { cursor: { createdAt: cursorCreatedAt, id: cursorId } } : {}),
      ...(Number.isFinite(limit) ? { limit } : {})
    },
    actor.actorUserId
  );
  return NextResponse.json({ comments: page.items, items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const result = await createFeedComment(actor.actorUserId, body.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ comment: result.comment, post: result.post }, { status: 201 });
}
