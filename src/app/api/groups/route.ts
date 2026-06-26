import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { createGroup, listGroups } from "@/modules/groups/groups.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  return NextResponse.json({
    groups: await listGroups({
      viewerUserId: actor.actorUserId,
      mode: request.nextUrl.searchParams.get("mode"),
      query: request.nextUrl.searchParams.get("q")
    })
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await request.json();
  const result = await createGroup(actor.actorUserId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ group: result.group }, { status: 201 });
}
