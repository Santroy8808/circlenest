import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createFeedPost, safeListFeedPosts } from "@/modules/feed-stream/feed-stream.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const posts = await safeListFeedPosts(20, session.user.id);
  return NextResponse.json({ posts });
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
