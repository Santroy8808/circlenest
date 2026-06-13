import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { handleMockPortal, isMockBillingMode } from "@/lib/billing/mock";
import { getStripeBillingConfig, postStripeForm, resolveBillingPortalReturnUrl } from "@/lib/billing/stripe";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      billingSubscription: {
        select: {
          providerCustomerId: true,
        },
      },
    },
  });
  if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isMockBillingMode()) {
    const result = await handleMockPortal(request, currentUser.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      url: result.url,
      mock: true,
    });
  }

  const customerId = currentUser.billingSubscription?.providerCustomerId?.trim() ?? "";
  if (!customerId) {
    return NextResponse.json({ error: "Billing is not connected." }, { status: 409 });
  }

  const config = getStripeBillingConfig();
  if (!config.secretKey) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const params = new URLSearchParams();
  params.set("customer", customerId);
  params.set("return_url", resolveBillingPortalReturnUrl(request, config.portalReturnUrl));

  const result = await postStripeForm("billing_portal/sessions", config.secretKey, params);
  const portalUrl = typeof result.body.url === "string" ? result.body.url : "";
  if (!result.ok || !portalUrl) {
    return NextResponse.json(
      {
        error: "Could not open billing portal.",
      },
      { status: result.status >= 400 ? result.status : 502 },
    );
  }

  return NextResponse.json({
    url: portalUrl,
  });
}
