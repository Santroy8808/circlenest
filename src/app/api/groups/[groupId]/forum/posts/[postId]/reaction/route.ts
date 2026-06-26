import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { reactToGroupForumPost } from "@/modules/group-forum/group-forum.service";

export async function POST(request: NextRequest, { params }: { params: { groupId: string; postId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const actor = await getActiveAccountActor(session.user.id);
  const result = await reactToGroupForumPost(actor.actorUserId, params.groupId, params.postId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
