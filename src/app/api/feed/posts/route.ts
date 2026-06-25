import { AdPlacement } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import { createFeedPost, safeListFeedPosts } from "@/modules/feed-stream/feed-stream.service";

function deviceClassFromRequest(request: NextRequest) {
  return /android|iphone|ipad|ipod|mobile/i.test(request.headers.get("user-agent") ?? "") ? "MOBILE" : "DESKTOP";
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const posts = await safeListFeedPosts(20, session.user.id);
  await recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, deviceClassFromRequest(request));
  const reservedStreamAds = await getAdPlacementPool({
    viewerUserId: session.user.id,
    placement: AdPlacement.RESERVED_STREAM,
    limit: 1
  });

  return NextResponse.json({ posts, reservedStreamAds });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createFeedPost(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ post: result.post }, { status: 201 });
}
