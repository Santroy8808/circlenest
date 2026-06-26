import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { listGroupAssets } from "@/modules/group-media-docs/group-media-docs.service";

export async function GET(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get("kind");
  const actor = await getActiveAccountActor(session.user.id);
  const result = await listGroupAssets(actor.actorUserId, params.groupId, kind);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
