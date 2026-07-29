import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { thetaCommApiError } from "@/modules/theta-comm/api";
import {
  cancelThetaCommUpload,
  completeThetaCommUpload,
  createThetaCommUpload,
  recordThetaCommUploadPart,
  requestThetaCommUploadPart
} from "@/modules/theta-comm/upload.service";

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await readJsonRequest(request, 32 * 1024);
  if (!body.ok) return body.response;
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const payload = body.value as Record<string, unknown>;
  const action = typeof payload.action === "string" ? payload.action : "create";
  try {
    const result =
      action === "part"
        ? await requestThetaCommUploadPart(session.user.id, payload)
        : action === "recordPart"
          ? await recordThetaCommUploadPart(session.user.id, payload)
          : action === "complete"
            ? await completeThetaCommUpload(session.user.id, payload)
            : action === "cancel"
              ? await cancelThetaCommUpload(session.user.id, payload)
              : await createThetaCommUpload(session.user.id, payload);
    return NextResponse.json(result);
  } catch (error) {
    return thetaCommApiError(error);
  }
}
