import { NextRequest, NextResponse } from "next/server";
import {
  mobileAuthUnavailableResponse,
  requireMobileSession
} from "@/lib/platform/mobile-auth";
import {
  readThetaCommBinaryRequest,
  thetaCommApiError
} from "@/modules/theta-comm/api";
import { THETA_COMM_UPLOAD_CHUNK_BYTES } from "@/modules/theta-comm/types";
import { writeThetaCommUploadPart } from "@/modules/theta-comm/upload.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function PUT(
  request: NextRequest,
  {
    params
  }: {
    params: { uploadId: string; partNumber: string };
  }
) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  try {
    const partNumber = Number(params.partNumber);
    const bytes = await readThetaCommBinaryRequest(
      request,
      THETA_COMM_UPLOAD_CHUNK_BYTES
    );
    return NextResponse.json(
      await writeThetaCommUploadPart(
        session.user.id,
        params.uploadId,
        partNumber,
        bytes
      ),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return thetaCommApiError(error);
  }
}
