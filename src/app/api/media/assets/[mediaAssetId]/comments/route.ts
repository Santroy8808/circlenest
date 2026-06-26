import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { createGalleryAssetComment } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function POST(request: NextRequest, { params }: { params: { mediaAssetId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await request.json();
  const result = await createGalleryAssetComment(actor.actorUserId, {
    ...body,
    mediaAssetId: params.mediaAssetId
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ comment: result.comment });
}
