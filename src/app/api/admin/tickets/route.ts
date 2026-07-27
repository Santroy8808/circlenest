import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import {
  applyAdminFeedbackBulkAction,
  listAdminFeedbackTickets
} from "@/modules/feedback-support/feedback-support.service";
import { FEEDBACK_NO_STORE_HEADERS, feedbackErrorStatus } from "@/modules/feedback-support/http";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  const result = await listAdminFeedbackTickets(
    session.user.id,
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
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
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  const rateLimit = await consumeRateLimit({
    namespace: "admin:feedback-action",
    key: session.user.id,
    limit: 120,
    windowMs: 5 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
  const body = await readJsonRequest(request, 64 * 1024);
  if (!body.ok) return body.response;
  const result = await applyAdminFeedbackBulkAction(session.user.id, body.value);
  const headers = { ...FEEDBACK_NO_STORE_HEADERS, ...rateLimitHeaders(rateLimit) };
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers }
    );
  }
  return NextResponse.json(result, { headers });
}
