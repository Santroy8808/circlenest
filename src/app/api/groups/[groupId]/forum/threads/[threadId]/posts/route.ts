import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createGroupForumPost } from "@/modules/group-forum/group-forum.service";

export async function POST(request: NextRequest, { params }: { params: { groupId: string; threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createGroupForumPost(session.user.id, params.groupId, params.threadId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ post: result.post }, { status: 201 });
}
