import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import { createFeedbackTicket } from "@/modules/feedback-support/feedback-support.service";

export async function POST(request: NextRequest) {
  const session = await auth();
  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "public:feedback-ticket",
    key: `${session?.user && !session.user.revoked ? session.user.id : "guest"}:${context.ipAddress ?? "unknown-address"}`,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 32 * 1024);
  if (!body.ok) return body.response;
  const result = await createFeedbackTicket(body.value, {
    userId: session?.user && !session.user.revoked ? session.user.id : undefined,
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
