import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "auth-session",
    limit: 20,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  return withRateLimitHeaders(await handlers.POST(request), rateLimit);
}
