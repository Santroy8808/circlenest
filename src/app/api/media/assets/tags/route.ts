import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateGalleryAssetTags } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function PUT(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await updateGalleryAssetTags(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ assets: result.assets });
}
