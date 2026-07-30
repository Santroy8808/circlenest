import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { endGroupForumThread } from "@/modules/group-forum/group-forum.service";

export async function POST(
  _request: Request,
  props: { params: Promise<{ groupId: string; threadId: string }> }
) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await endGroupForumThread(actor.actorUserId, params.groupId, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
