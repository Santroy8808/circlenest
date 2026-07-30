import { NextRequest, NextResponse } from "next/server";
import {
  mobileAuthUnavailableResponse,
  requireMobileSession
} from "@/lib/platform/mobile-auth";
import {
  thetaCommApiError,
  thetaCommEncryptedFileResponse
} from "@/modules/theta-comm/api";
import { getThetaCommAttachmentFile } from "@/modules/theta-comm/upload.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  try {
    const file = await getThetaCommAttachmentFile(
      session.user.id,
      params.attachmentId,
      true
    );
    return thetaCommEncryptedFileResponse(request, file);
  } catch (error) {
    return thetaCommApiError(error);
  }
}
