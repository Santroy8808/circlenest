import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";
import { handleMockCheckout, isMockBillingMode } from "@/lib/billing/mock";
import {
  getStripeBillingConfig,
  normalizeBillingPlanTier,
  postStripeForm,
  resolveBillingCheckoutUrl,
  resolveStripePriceId,
} from "@/lib/billing/stripe";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { tier?: string };
  const tier = normalizeBillingPlanTier(body.tier);
  if (!tier) {
    return NextResponse.json({ error: "Pick Activist or Pro." }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      subscriptionTier: true,
      role: true,
      billingSubscription: {
        select: {
          providerCustomerId: true,
        },
      },
    },
  });
  if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isMockBillingMode()) {
    const result = await handleMockCheckout(request, currentUser.id, tier);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      url: result.url,
      tier,
      returnUrl: resolveBillingCheckoutUrl(request, "mock-checkout"),
      mock: true,
    });
  }

  const config = getStripeBillingConfig();
  const secretKey = config.secretKey;
  const priceId = resolveStripePriceId(tier, config);
  if (!secretKey || !priceId) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const successUrl = `${getPublicBaseUrl(request)}/settings?billing=success`;
  const cancelUrl = `${getPublicBaseUrl(request)}/settings?billing=cancel`;

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("customer_email", currentUser.email);
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[userId]", currentUser.id);
  params.set("metadata[tier]", tier);
  params.set("subscription_data[metadata][userId]", currentUser.id);
  params.set("subscription_data[metadata][tier]", tier);
  if (currentUser.billingSubscription?.providerCustomerId) {
    params.set("customer", currentUser.billingSubscription.providerCustomerId);
  }

  const result = await postStripeForm("checkout/sessions", secretKey, params);
  const checkoutUrl = typeof result.body.url === "string" ? result.body.url : "";
  if (!result.ok || !checkoutUrl) {
    return NextResponse.json(
      {
        error: "Could not start checkout.",
      },
      { status: result.status >= 400 ? result.status : 502 },
    );
  }

  return NextResponse.json({
    url: checkoutUrl,
    tier,
    returnUrl: resolveBillingCheckoutUrl(request, "checkout"),
  });
}
