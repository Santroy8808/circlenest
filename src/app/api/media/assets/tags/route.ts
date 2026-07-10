import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { updateGalleryAssetTags } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function PUT(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await updateGalleryAssetTags(actor.actorUserId, body.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ assets: result.assets });
}
