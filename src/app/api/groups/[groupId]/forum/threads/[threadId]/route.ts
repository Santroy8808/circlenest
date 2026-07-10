import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getGroupForumThread } from "@/modules/group-forum/group-forum.service";

function parsePostPageLimit(value: string | null) {
  if (value === null) return { ok: true as const, value: undefined };
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 80
    ? { ok: true as const, value: limit }
    : { ok: false as const };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string; threadId: string } }
) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const limit = parsePostPageLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!limit.ok || (cursor !== null && cursor.length > 128)) {
    return NextResponse.json({ error: "Invalid post page." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await getGroupForumThread(actor.actorUserId, params.groupId, params.threadId, {
    cursor,
    limit: limit.value
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
