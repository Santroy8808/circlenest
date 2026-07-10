import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import { recordPlatformActivity } from "@/modules/platform-activity/platform-activity.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ ok: true });
  }

  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "metrics:activity",
    key: session.user.id,
    limit: 120,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 8 * 1024);
  if (!body.ok) return body.response;
  const result = await recordPlatformActivity({
    userId: session.user.id,
    body: body.value,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });
  const headers = rateLimitHeaders(rateLimit);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}
