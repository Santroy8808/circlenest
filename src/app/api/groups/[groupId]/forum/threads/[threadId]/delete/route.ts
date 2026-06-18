import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteEndedGroupForumThread } from "@/modules/group-forum/group-forum.service";

export async function POST(_request: Request, { params }: { params: { groupId: string; threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await deleteEndedGroupForumThread(session.user.id, params.groupId, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
