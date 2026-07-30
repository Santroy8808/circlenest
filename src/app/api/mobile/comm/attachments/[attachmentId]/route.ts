import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { thetaCommApiError } from "@/modules/theta-comm/api";
import { getThetaCommAttachmentDownload } from "@/modules/theta-comm/upload.service";

export async function GET(request: NextRequest, props: { params: Promise<{ attachmentId: string }> }) {
  const params = await props.params;
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  try {
    return NextResponse.json(
      await getThetaCommAttachmentDownload(session.user.id, params.attachmentId),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return thetaCommApiError(error);
  }
}
