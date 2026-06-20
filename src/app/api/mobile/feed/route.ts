import { FeedVisibility } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { createFeedPost, safeListFeedPosts } from "@/modules/feed-stream/feed-stream.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json({ posts: await safeListFeedPosts(30, session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await createFeedPost(session.user.id, {
    body: body.body,
    visibility: FeedVisibility.MEMBERS,
    mediaAssetId: ""
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ post: result.post }, { status: 201 });
}
