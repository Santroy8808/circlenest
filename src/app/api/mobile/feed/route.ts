import { AdPlacement, FeedVisibility } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import {
  createFeedComment,
  createFeedPost,
  reactToFeedComment,
  reactToFeedPost,
  safeGetFeedPostThread,
  safeListFeedPosts
} from "@/modules/feed-stream/feed-stream.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const postId = request.nextUrl.searchParams.get("postId");
  if (postId) {
    const post = await safeGetFeedPostThread(postId);
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    return NextResponse.json({ post });
  }

  const posts = await safeListFeedPosts(30, session.user.id);
  await recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, "MOBILE");
  const reservedStreamAds = await getAdPlacementPool({
    viewerUserId: session.user.id,
    placement: AdPlacement.RESERVED_STREAM,
    limit: 1
  });

  return NextResponse.json({ posts, reservedStreamAds });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (body.action === "comment") {
    const result = await createFeedComment(session.user.id, {
      postId: body.postId,
      parentCommentId: body.parentCommentId ?? "",
      body: body.body,
      mediaAssetId: body.mediaAssetId ?? ""
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ comment: result.comment }, { status: 201 });
  }

  if (body.action === "reactPost") {
    const result = await reactToFeedPost(session.user.id, {
      postId: body.postId,
      type: body.type
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ reaction: result.reaction });
  }

  if (body.action === "reactComment") {
    const result = await reactToFeedComment(session.user.id, {
      commentId: body.commentId,
      type: body.type
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ reaction: result.reaction });
  }

  const result = await createFeedPost(session.user.id, {
    body: body.body,
    visibility: FeedVisibility.MEMBERS,
    mediaAssetId: body.mediaAssetId ?? ""
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ post: result.post }, { status: 201 });
}
