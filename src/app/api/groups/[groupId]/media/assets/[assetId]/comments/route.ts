import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { commentOnGroupAsset } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ groupId: string; assetId: string }> }
) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await commentOnGroupAsset(actor.actorUserId, params.groupId, params.assetId, body.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
