import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { getRequestContext } from "@/lib/platform/request-context";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { requestPasswordReset } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "auth-password-reset-request",
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 4 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);

  await requestPasswordReset(payload.value, getRequestContext(request)).catch(() => null);

  return withRateLimitHeaders(
    NextResponse.json(
      {
        ok: true,
        message: "If an account matches, password reset instructions will be sent."
      },
      { status: 202, headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
