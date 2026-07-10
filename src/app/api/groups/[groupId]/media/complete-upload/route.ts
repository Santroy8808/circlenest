import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { uploadIntentFailureResponse } from "@/lib/platform/upload-intent-response";
import { completeGroupAssetUpload } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await completeGroupAssetUpload(actor.actorUserId, params.groupId, body.value);

  if (!result.ok) {
    return uploadIntentFailureResponse(result);
  }

  return NextResponse.json({ asset: result.asset });
}
