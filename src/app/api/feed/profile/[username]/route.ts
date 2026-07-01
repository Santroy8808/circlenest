import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/platform/db";
import { safeListProfileFeedPosts } from "@/modules/feed-stream/feed-stream.service";

export async function GET(_request: NextRequest, { params }: { params: { username: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { username: params.username.trim().replace(/^@/, "").toLowerCase() },
    select: { id: true }
  });

  if (!user) {
    return NextResponse.json({ posts: [] });
  }

  return NextResponse.json({
    posts: await safeListProfileFeedPosts(user.id, 20),
    reservedStreamAds: []
  });
}
