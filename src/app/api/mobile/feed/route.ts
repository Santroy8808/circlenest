import { AdPlacement, FeedVisibility } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import {
  createFeedComment,
  createFeedPost,
  FeedFilterAccessError,
  getFeedPostThreadPage,
  listFeedPostsPage,
  reactToFeedComment,
  reactToFeedPost
} from "@/modules/feed-stream/feed-stream.service";
import { parseFeedStreamMode } from "@/modules/feed-stream/feed-route-contract";

function mobileFeedPage(request: NextRequest) {
  const cursorCreatedAt = request.nextUrl.searchParams.get("cursorCreatedAt")?.trim();
  const cursorId = request.nextUrl.searchParams.get("cursorId")?.trim();
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  if (Boolean(cursorCreatedAt) !== Boolean(cursorId)) return null;
  if (cursorCreatedAt && Number.isNaN(Date.parse(cursorCreatedAt))) return null;

  return {
    ...(cursorCreatedAt && cursorId ? { cursor: { createdAt: cursorCreatedAt, id: cursorId } } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  };
}

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const pageInput = mobileFeedPage(request);
  if (!pageInput) {
    return NextResponse.json({ error: "Both feed cursor fields are required." }, { status: 400 });
  }

  const postId = request.nextUrl.searchParams.get("postId");
  if (postId) {
    const page = await getFeedPostThreadPage(postId, pageInput, session.user.id);
    if (!page?.post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    return NextResponse.json({ post: page.post, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  const modeResult = parseFeedStreamMode(request.nextUrl.searchParams.get("mode"));
  if (!modeResult.ok) {
    return NextResponse.json({ error: modeResult.error }, { status: 400 });
  }
  const mode = modeResult.mode;

  let page;
  try {
    page = await listFeedPostsPage(pageInput, session.user.id, mode);
  } catch (error) {
    if (error instanceof FeedFilterAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
  const posts = "cursor" in pageInput ? page.items : [...page.pinnedItems, ...page.items];
  await recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, "MOBILE");
  const reservedStreamAds = await getAdPlacementPool({
    viewerUserId: session.user.id,
    placement: AdPlacement.RESERVED_STREAM,
    limit: 1
  });

  return NextResponse.json({
    posts,
    pinnedItems: page.pinnedItems,
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    mode,
    reservedStreamAds
  });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const parsedBody = await readJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as Record<string, unknown>;

  if (body.action === "comment") {
    const result = await createFeedComment(session.user.id, {
      postId: body.postId,
      parentCommentId: body.parentCommentId ?? "",
      body: body.body,
      mediaAssetId: body.mediaAssetId ?? ""
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ comment: result.comment, post: result.post }, { status: 201 });
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
    visibility: FeedVisibility.PUBLIC,
    mediaAssetId: body.mediaAssetId ?? ""
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (!result.post) {
    return NextResponse.json({ error: "Could not load created post." }, { status: 500 });
  }

  return NextResponse.json({ post: result.post }, { status: 201 });
}
