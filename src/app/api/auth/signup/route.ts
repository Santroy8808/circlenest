import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { getRequestContext } from "@/lib/platform/request-context";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { createMemberAccount } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "auth-signup",
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 16 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);

  const result = await createMemberAccount(payload.value, {
    preverified:
      process.env.NODE_ENV !== "production" &&
      process.env.AUTH_SIGNUP_PREVERIFIED === "true",
    context: getRequestContext(request)
  });

  if (!result.ok) {
    return withRateLimitHeaders(
      NextResponse.json({ error: result.error }, { status: 400 }),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      {
        user: result.user,
        verificationEmailSent: result.verificationEmailSent,
        verificationEmailError: result.verificationEmailError ? "Verification email could not be sent." : undefined
      },
      { status: 201, headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
