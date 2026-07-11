import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { createCustomerPortalSession } from "@/modules/membership-policy/subscriptions.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "billing-customer-portal",
    identity: session.user.id,
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  let result: Awaited<ReturnType<typeof createCustomerPortalSession>>;

  try {
    result = await createCustomerPortalSession({
      userId: session.user.id,
      origin
    });
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: "Could not open billing management. Try again shortly." },
        { status: 500, headers: { "retry-after": "30" } }
      ),
      rateLimit
    );
  }

  if (!result.ok) {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: result.error },
        { status: /configured|stripe/i.test(result.error) ? 503 : 400 }
      ),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      { url: result.url },
      { headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
