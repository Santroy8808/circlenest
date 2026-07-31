import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { uploadIntentFailureResponse } from "@/lib/platform/upload-intent-response";
import { completeJobImageUpload } from "@/modules/jobs/jobs.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const actor = await getActiveAccountActor(session.user.id);
    const body = await readJsonRequest(request, 8 * 1024);
    if (!body.ok) return body.response;
    const result = await completeJobImageUpload(actor.actorUserId, body.value);

    if (!result.ok) {
      return uploadIntentFailureResponse(result);
    }

    return NextResponse.json(
      { asset: result.asset },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    console.error("[jobs.images.complete-upload]", error);
    return NextResponse.json({ error: "Could not save job image record." }, { status: 500 });
  }
}
