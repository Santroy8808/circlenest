import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { addFeedbackTicketMessage } from "@/modules/feedback-support/feedback-support.service";
import { FEEDBACK_NO_STORE_HEADERS, feedbackErrorStatus } from "@/modules/feedback-support/http";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function POST(request: NextRequest, props: { params: Promise<{ publicId: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  if (!(await isFeatureEnabled("support.feedback_center"))) {
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable." },
      { status: 503, headers: FEEDBACK_NO_STORE_HEADERS }
    );
  }
  const rateLimit = await consumeRateLimit({
    namespace: "admin:feedback-message",
    key: `${session.user.id}:${params.publicId}`,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const result = await addFeedbackTicketMessage(session.user.id, params.publicId, body.value);
  const headers = { ...FEEDBACK_NO_STORE_HEADERS, ...rateLimitHeaders(rateLimit) };
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers }
    );
  }
  return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers });
}
