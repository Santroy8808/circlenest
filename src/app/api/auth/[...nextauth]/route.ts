import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { forceBrowserScopedAuthSessionCookies } from "@/lib/platform/web-session-cookie";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";

export async function GET(request: NextRequest) {
  return forceBrowserScopedAuthSessionCookies(await handlers.GET(request));
}

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "auth-session",
    limit: 20,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  return forceBrowserScopedAuthSessionCookies(withRateLimitHeaders(await handlers.POST(request), rateLimit));
}
