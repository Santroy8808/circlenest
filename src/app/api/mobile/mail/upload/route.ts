import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { uploadIntentFailureResponse } from "@/lib/platform/upload-intent-response";
import { completeMailUpload, createMailUploadIntent } from "@/modules/mail/mail.service";

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 8 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const action = body.action ?? "intent";
  const result =
    action === "complete"
      ? await completeMailUpload(session.user.id, body)
      : await createMailUploadIntent(session.user.id, body);

  if (!result.ok) return uploadIntentFailureResponse(result);
  return NextResponse.json(result);
}
