import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createCreditCheckoutSession } from "@/modules/billing/stripe-credit-checkout.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { packageKey?: string } | null;

  if (!body?.packageKey) {
    return NextResponse.json({ error: "Choose a credit package." }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const result = await createCreditCheckoutSession({
    userId: session.user.id,
    packageKey: body.packageKey,
    origin
  }).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Could not start credit checkout."
  }));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ url: result.url });
}
