import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { createFeedbackScreenshotUploadIntent } from "@/modules/feedback-support/feedback-support.service";
import { feedbackErrorStatus } from "@/modules/feedback-support/http";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  if (!(await isFeatureEnabled("support.feedback_center"))) {
    return NextResponse.json({ error: "Feedback is temporarily unavailable." }, { status: 503 });
  }
  const rateLimit = await consumeRateLimit({
    namespace: "feedback:screenshot",
    key: session.user.id,
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
  const body = await readJsonRequest(request, 8 * 1024);
  if (!body.ok) return body.response;
  const result = await createFeedbackScreenshotUploadIntent(session.user.id, body.value);
  const headers = rateLimitHeaders(rateLimit);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers }
    );
  }
  return NextResponse.json(result, { status: 201, headers });
}
