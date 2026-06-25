import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/modules/membership-policy/subscriptions.service";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleStripeWebhook(rawBody, request.headers.get("stripe-signature")).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Stripe webhook could not be processed."
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ received: true, eventType: result.eventType });
}
