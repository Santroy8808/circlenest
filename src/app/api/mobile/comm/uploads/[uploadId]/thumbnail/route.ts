import { NextRequest, NextResponse } from "next/server";
import {
  mobileAuthUnavailableResponse,
  requireMobileSession
} from "@/lib/platform/mobile-auth";
import {
  readThetaCommBinaryRequest,
  thetaCommApiError
} from "@/modules/theta-comm/api";
import { writeThetaCommUploadThumbnail } from "@/modules/theta-comm/upload.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function PUT(request: NextRequest, props: { params: Promise<{ uploadId: string }> }) {
  const params = await props.params;
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  try {
    const bytes = await readThetaCommBinaryRequest(request, 2 * 1024 * 1024);
    return NextResponse.json(
      await writeThetaCommUploadThumbnail(
        session.user.id,
        params.uploadId,
        bytes
      ),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return thetaCommApiError(error);
  }
}
