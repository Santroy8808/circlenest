import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { uploadIntentFailureResponse } from "@/lib/platform/upload-intent-response";
import {
  completeGalleryUpload,
  createGalleryUploadIntent,
  safeListMyPics
} from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const take = Number(request.nextUrl.searchParams.get("take") ?? 24);
  if (!Number.isInteger(take) || take < 1 || take > 80) {
    return NextResponse.json({ error: "Invalid gallery page size." }, { status: 400 });
  }

  return NextResponse.json({ photos: await safeListMyPics(session.user.id, take) });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid gallery upload request." }, { status: 400 });
  }

  const body = parsedBody.value as Record<string, unknown>;
  const action = body.action ?? "intent";
  const result =
    action === "complete"
      ? await completeGalleryUpload(session.user.id, body)
      : await createGalleryUploadIntent(session.user.id, body);

  if (!result.ok) return uploadIntentFailureResponse(result);
  return NextResponse.json(result);
}
