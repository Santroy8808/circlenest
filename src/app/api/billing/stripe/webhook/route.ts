import { NextResponse } from "next/server";
import { readTextRequest } from "@/lib/platform/api-request";
import { handleStripeWebhook } from "@/modules/membership-policy/subscriptions.service";

const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024;

function isStripeSignatureError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; type?: unknown };
  return (
    candidate.name === "StripeSignatureVerificationError" ||
    candidate.type === "StripeSignatureVerificationError"
  );
}

export async function POST(request: Request) {
  const payload = await readTextRequest(request, MAX_STRIPE_WEBHOOK_BYTES);
  if (!payload.ok) return payload.response;

  let result: Awaited<ReturnType<typeof handleStripeWebhook>>;

  try {
    result = await handleStripeWebhook(payload.value, request.headers.get("stripe-signature"));
  } catch (error) {
    if (isStripeSignatureError(error)) {
      return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Stripe webhook could not be processed." },
      { status: 500, headers: { "retry-after": "30" } }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.inProgress) {
    return NextResponse.json(
      { received: false, status: "processing", eventType: result.eventType },
      { status: 503, headers: { "retry-after": "10" } }
    );
  }

  return NextResponse.json({
    received: true,
    status: result.duplicate ? "duplicate" : result.outOfOrder ? "out_of_order" : "processed",
    eventType: result.eventType
  });
}
