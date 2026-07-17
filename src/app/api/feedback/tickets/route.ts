import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import { createFeedbackTicket } from "@/modules/feedback-support/feedback-support.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export async function POST(request: NextRequest) {
  if (!(await isFeatureEnabled("support.feedback_center"))) {
    return NextResponse.json({ error: "Feedback Center is temporarily unavailable." }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const access = await canUserAccessFeature(session.user.id, "support.createRequest");
  if (!access.allowed) {
    return NextResponse.json({ error: "Support requests are not included with this membership." }, { status: 403 });
  }

  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "public:feedback-ticket",
    key: `${session.user.id}:${context.ipAddress ?? "unknown-address"}`,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 32 * 1024);
  if (!body.ok) return body.response;
  const result = await createFeedbackTicket(body.value, {
    userId: session.user.id,
    userAgent: context.userAgent
  });
  const headers = rateLimitHeaders(rateLimit);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  return NextResponse.json(
    { publicId: result.ticket.publicId, status: result.ticket.status },
    { status: 201, headers }
  );
}
