import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { completeGalleryUpload } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const actor = await getActiveAccountActor(session.user.id);
    const body = await request.json();
    const result = await completeGalleryUpload(actor.actorUserId, body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!result.asset) {
      return NextResponse.json({ error: "Could not track uploaded photo." }, { status: 500 });
    }

    return NextResponse.json({ asset: result.asset });
  } catch (error) {
    console.error("[media.complete-upload]", error);
    return NextResponse.json({ error: "Could not save uploaded photo record." }, { status: 500 });
  }
}
