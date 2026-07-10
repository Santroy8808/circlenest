import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { listProfileFeedPostsPage } from "@/modules/feed-stream/feed-stream.service";

export async function GET(request: NextRequest, { params }: { params: { username: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { username: params.username.trim().replace(/^@/, "").toLowerCase() },
    select: { id: true }
  });

  if (!user) {
    return NextResponse.json({ posts: [], items: [], nextCursor: null, hasMore: false });
  }

  const cursorCreatedAt = request.nextUrl.searchParams.get("cursorCreatedAt")?.trim();
  const cursorId = request.nextUrl.searchParams.get("cursorId")?.trim();
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  if (Boolean(cursorCreatedAt) !== Boolean(cursorId)) {
    return NextResponse.json({ error: "Both feed cursor fields are required." }, { status: 400 });
  }
  if (cursorCreatedAt && Number.isNaN(Date.parse(cursorCreatedAt))) {
    return NextResponse.json({ error: "Invalid feed cursor." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const page = await listProfileFeedPostsPage(
    user.id,
    {
      ...(cursorCreatedAt && cursorId ? { cursor: { createdAt: cursorCreatedAt, id: cursorId } } : {}),
      ...(Number.isFinite(limit) ? { limit } : {})
    },
    actor.actorUserId
  );

  return NextResponse.json({
    posts: page.items,
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    reservedStreamAds: []
  });
}
