import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { reactToFeedPost } from "@/modules/feed-stream/feed-stream.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await reactToFeedPost(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ reaction: result.reaction });
}
