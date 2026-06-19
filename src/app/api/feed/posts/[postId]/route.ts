import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { safeGetFeedPostThread } from "@/modules/feed-stream/feed-stream.service";

export async function GET(_request: Request, { params }: { params: { postId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const post = await safeGetFeedPostThread(params.postId);

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  return NextResponse.json({ posts: [post] });
}
