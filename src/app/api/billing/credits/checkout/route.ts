import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { createCreditCheckoutSession } from "@/modules/billing/stripe-credit-checkout.service";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "billing-credit-checkout",
    identity: session.user.id,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: "A valid Idempotency-Key header is required." },
        { status: 400 }
      ),
      rateLimit
    );
  }

  const payload = await readJsonRequest(request, 4 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);
  const body =
    payload.value && typeof payload.value === "object"
      ? payload.value as { packageKey?: string }
      : null;

  if (!body?.packageKey) {
    return withRateLimitHeaders(
      NextResponse.json({ error: "Choose a credit package." }, { status: 400 }),
      rateLimit
    );
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  let result: Awaited<ReturnType<typeof createCreditCheckoutSession>>;
  try {
    result = await createCreditCheckoutSession({
      userId: session.user.id,
      packageKey: body.packageKey,
      origin,
      idempotencyKey
    });
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: "Could not start credit checkout. Try again shortly." },
        { status: 500, headers: { "retry-after": "30" } }
      ),
      rateLimit
    );
  }

  if (!result.ok) {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: result.error },
        { status: /disabled|configured/i.test(result.error) ? 503 : 400 }
      ),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      { url: result.url, reused: result.reused ?? false },
      { headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
