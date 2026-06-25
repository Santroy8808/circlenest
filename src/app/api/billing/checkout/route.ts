import { MembershipTier } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSubscriptionCheckoutSession } from "@/modules/membership-policy/subscriptions.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tier?: MembershipTier } | null;
  const targetTier = Object.values(MembershipTier).find((tier) => tier === body?.tier);

  if (!targetTier) {
    return NextResponse.json({ error: "Choose a valid membership tier." }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const result = await createSubscriptionCheckoutSession({
    userId: session.user.id,
    targetTier,
    origin
  }).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Could not start subscription checkout."
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ url: result.url });
}
