import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { getRequestContext } from "@/lib/platform/request-context";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { verifyEmailToken } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "auth-email-verification",
    limit: 15,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 4 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);

  const result = await verifyEmailToken(payload.value, getRequestContext(request));

  if (!result.ok) {
    return withRateLimitHeaders(
      NextResponse.json({ error: result.error }, { status: 400 }),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } }),
    rateLimit
  );
}
