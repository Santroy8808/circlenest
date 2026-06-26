import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { deleteGroupAsset } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(_request: Request, { params }: { params: { groupId: string; assetId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await deleteGroupAsset(actor.actorUserId, params.groupId, params.assetId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
