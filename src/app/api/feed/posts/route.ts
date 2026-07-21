import { AdPlacement } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import {
  createFeedPost,
  FeedFilterAccessError,
  listFeedPostsPage
} from "@/modules/feed-stream/feed-stream.service";
import { parseFeedStreamMode } from "@/modules/feed-stream/feed-route-contract";

function deviceClassFromRequest(request: NextRequest) {
  return /android|iphone|ipad|ipod|mobile/i.test(request.headers.get("user-agent") ?? "") ? "MOBILE" : "DESKTOP";
}

function feedPageFromRequest(request: NextRequest) {
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
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const pageInput = feedPageFromRequest(request);
  const modeResult = parseFeedStreamMode(request.nextUrl.searchParams.get("mode"));
  if (!pageInput) {
    return NextResponse.json({ error: "Both feed cursor fields are required." }, { status: 400 });
  }
  if (!modeResult.ok) {
    return NextResponse.json({ error: modeResult.error }, { status: 400 });
  }
  const mode = modeResult.mode;

  let page;
  try {
    page = await listFeedPostsPage(pageInput, actor.actorUserId, mode);
  } catch (error) {
    if (error instanceof FeedFilterAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const posts = "cursor" in pageInput ? page.items : [...page.pinnedItems, ...page.items];
  await recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, deviceClassFromRequest(request));
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
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const result = await createFeedPost(actor.actorUserId, body.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ post: result.post }, { status: 201 });
}
