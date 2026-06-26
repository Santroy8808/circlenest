import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import {
  createGroupForumThread,
  listGroupForumThreads
} from "@/modules/group-forum/group-forum.service";

export async function GET(_request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await listGroupForumThreads(actor.actorUserId, params.groupId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const actor = await getActiveAccountActor(session.user.id);
  const result = await createGroupForumThread(actor.actorUserId, params.groupId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ thread: result.thread }, { status: 201 });
}
