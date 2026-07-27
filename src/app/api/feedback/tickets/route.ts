import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import {
  createFeedbackTicket,
  listUserFeedbackTickets
} from "@/modules/feedback-support/feedback-support.service";
import { FEEDBACK_NO_STORE_HEADERS, feedbackErrorStatus } from "@/modules/feedback-support/http";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";

export async function GET() {
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
  const result = await listUserFeedbackTickets(session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers: FEEDBACK_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(result, { headers: FEEDBACK_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const routeAccess = await resolveMembershipRouteAccess(session.user.id, "supportCreate", "api");
  if (!routeAccess.allowed) {
    return NextResponse.json({ error: routeAccess.error }, { status: routeAccess.status });
  }

  if (!(await isFeatureEnabled("support.feedback_center"))) {
    return NextResponse.json({ error: "Feedback is temporarily unavailable." }, { status: 503 });
  }

  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "public:feedback-ticket",
    key: `${session.user.id}:${context.ipAddress ?? "unknown-address"}`,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 96 * 1024);
  if (!body.ok) return body.response;
  const result = await createFeedbackTicket(body.value, {
    userId: session.user.id,
    userAgent: context.userAgent
  });
  const headers = rateLimitHeaders(rateLimit);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers }
    );
  }

  return NextResponse.json(
    {
      publicId: result.ticket.publicId,
      status: result.ticket.status,
      replayed: result.replayed
    },
    { status: result.replayed ? 200 : 201, headers }
  );
}
