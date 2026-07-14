import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { requireDeletePasswordFromRequest } from "@/lib/platform/delete-protection";
import { deleteEndedGroupForumThread } from "@/modules/group-forum/group-forum.service";

export async function POST(request: Request, { params }: { params: { groupId: string; threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const deletePasswordError = requireDeletePasswordFromRequest(request);
  if (deletePasswordError) return deletePasswordError;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await deleteEndedGroupForumThread(actor.actorUserId, params.groupId, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
