import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { authorizeCredentials } from "@/modules/auth-security/auth-security.service";
import { createMobileToken, mobileAuthUnavailableResponse } from "@/lib/platform/mobile-auth";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "mobile-login",
    limit: 10,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 4 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);

  const user = await authorizeCredentials(payload.value, {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? "ThetaSpaceAndroidNative"
  });

  if (!user) {
    return withRateLimitHeaders(
      NextResponse.json({ error: "Invalid email/handle or password." }, { status: 401 }),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      {
        token: createMobileToken({ userId: user.id, sessionVersion: user.sessionVersion }),
        user
      },
      { headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
