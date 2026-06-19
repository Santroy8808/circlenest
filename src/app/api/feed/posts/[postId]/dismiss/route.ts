import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dismissFeedPost } from "@/modules/feed-stream/feed-stream.service";

export async function POST(_request: Request, { params }: { params: { postId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await dismissFeedPost(session.user.id, params.postId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
