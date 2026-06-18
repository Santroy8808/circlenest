import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGroupForumThread } from "@/modules/group-forum/group-forum.service";

export async function GET(_request: Request, { params }: { params: { groupId: string; threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await getGroupForumThread(session.user.id, params.groupId, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
