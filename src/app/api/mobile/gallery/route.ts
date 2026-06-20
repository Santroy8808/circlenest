import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  completeGalleryUpload,
  createGalleryUploadIntent,
  safeListMyPics
} from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const take = Number(request.nextUrl.searchParams.get("take") ?? 24);
  return NextResponse.json({ photos: await safeListMyPics(session.user.id, Number.isFinite(take) ? take : 24) });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body.action ?? "intent";
  const result =
    action === "complete"
      ? await completeGalleryUpload(session.user.id, body)
      : await createGalleryUploadIntent(session.user.id, body);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
